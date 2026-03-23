#!/bin/bash

# AIStudio To API - 健康检查脚本

set -e

# 配置
API_BASE_URL=${API_BASE_URL:-"http://localhost:3000"}
MAX_RETRIES=${MAX_RETRIES:-3}
RETRY_INTERVAL=${RETRY_INTERVAL:-5}
TIMEOUT=${TIMEOUT:-30}

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${YELLOW}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 健康检查函数
check_health() {
    local attempt=1
    
    while [ $attempt -le $MAX_RETRIES ]; do
        log_info "尝试 $attempt/$MAX_RETRIES: 检查服务健康状态..."
        
        if curl -f -s -m $TIMEOUT "${API_BASE_URL}/health" > /dev/null; then
            log_success "服务健康检查通过"
            return 0
        fi
        
        if [ $attempt -lt $MAX_RETRIES ]; then
            log_info "等待 ${RETRY_INTERVAL}s 后重试..."
            sleep $RETRY_INTERVAL
        fi
        
        attempt=$((attempt + 1))
    done
    
    log_error "服务健康检查失败"
    return 1
}

# 详细状态检查
check_detailed_status() {
    log_info "检查详细状态..."
    
    local response
    response=$(curl -s -m $TIMEOUT "${API_BASE_URL}/health?detailed=true")
    
    if [ $? -ne 0 ]; then
        log_error "无法获取详细状态"
        return 1
    fi
    
    # 解析 JSON 响应
    local status=$(echo "$response" | jq -r '.status' 2>/dev/null || echo "unknown")
    local uptime=$(echo "$response" | jq -r '.uptime' 2>/dev/null || echo "unknown")
    local version=$(echo "$response" | jq -r '.version' 2>/dev/null || echo "unknown")
    
    echo "----------------------------------------"
    echo "📊 服务状态详情:"
    echo "   状态: $status"
    echo "   运行时间: $uptime"
    echo "   版本: $version"
    echo "----------------------------------------"
}

# API 功能测试
test_api_endpoint() {
    log_info "测试 API 端点..."
    
    # 测试 OpenAI 兼容接口
    local response
    response=$(curl -s -X POST "${API_BASE_URL}/v1/chat/completions" \
        -H "Content-Type: application/json" \
        -d '{"model": "gemini-1.5-pro", "messages": [{"role": "user", "content": "test"}], "max_tokens": 10}' \
        -m $TIMEOUT)
    
    if [ $? -ne 0 ]; then
        log_error "API 端点测试失败"
        return 1
    fi
    
    local error=$(echo "$response" | jq -r '.error' 2>/dev/null)
    if [ "$error" != "null" ]; then
        log_error "API 返回错误: $error"
        return 1
    fi
    
    log_success "API 端点测试通过"
}

# 日志检查
check_logs() {
    log_info "检查应用日志..."
    
    local log_file="${LOG_DIR:-./logs}/combined.log"
    
    if [ -f "$log_file" ]; then
        local error_count
        error_count=$(grep -c "ERROR" "$log_file" 2>/dev/null || echo "0")
        
        if [ "$error_count" -gt 0 ]; then
            log_info "发现 $error_count 个错误日志"
            tail -n 10 "$log_file" | grep "ERROR"
        else
            log_success "日志中未发现错误"
        fi
    else
        log_info "日志文件不存在"
    fi
}

# 性能指标检查
check_performance() {
    log_info "检查性能指标..."
    
    # 检查响应时间
    local start_time
    start_time=$(date +%s%N)
    
    curl -s -o /dev/null "${API_BASE_URL}/health"
    
    local end_time
    end_time=$(date +%s%N)
    
    local response_time
    response_time=$(( (end_time - start_time) / 1000000 ))
    
    echo "----------------------------------------"
    echo "⚡ 性能指标:"
    echo "   响应时间: ${response_time}ms"
    
    if [ $response_time -lt 100 ]; then
        echo "   状态: 优秀"
    elif [ $response_time -lt 500 ]; then
        echo "   状态: 良好"
    else
        echo "   状态: 需要优化"
    fi
    echo "----------------------------------------"
}

# 内存使用检查
check_memory_usage() {
    log_info "检查内存使用..."
    
    if command -v docker &> /dev/null; then
        # Docker 环境
        local container_id
        container_id=$(docker ps -qf "name=aistudio-proxy")
        
        if [ -n "$container_id" ]; then
            local mem_usage
            mem_usage=$(docker stats --no-stream --format "{{.MemUsage}}" "$container_id" | head -1)
            echo "----------------------------------------"
            echo "🧠 内存使用: $mem_usage"
            echo "----------------------------------------"
        fi
    else
        # 本地环境
        local node_pid
        node_pid=$(pgrep -f "node.*main.js" || echo "")
        
        if [ -n "$node_pid" ]; then
            local mem_usage
            mem_usage=$(ps -o rss= -p "$node_pid")
            local mem_mb
            mem_mb=$((mem_usage / 1024))
            
            echo "----------------------------------------"
            echo "🧠 内存使用: ${mem_mb}MB"
            echo "----------------------------------------"
        fi
    fi
}

# 主函数
main() {
    echo "🔍 AIStudio To API - 健康检查"
    echo "====================================="
    echo
    
    local failed=0
    
    # 执行检查
    check_health || failed=$((failed + 1))
    
    if [ $failed -eq 0 ]; then
        check_detailed_status
        test_api_endpoint || failed=$((failed + 1))
        check_logs
        check_performance
        check_memory_usage
    fi
    
    echo
    echo "====================================="
    
    if [ $failed -eq 0 ]; then
        log_success "所有检查通过"
        exit 0
    else
        log_error "检查失败: $failed 项"
        exit 1
    fi
}

# 显示帮助
show_help() {
    cat << EOF
使用方法: $0 [选项]

选项:
    -h, --help          显示帮助信息
    -u, --url URL       设置 API 基础 URL (默认: http://localhost:3000)
    -r, --retries N     设置重试次数 (默认: 3)
    -i, --interval N    设置重试间隔 (默认: 5s)
    -t, --timeout N     设置超时时间 (默认: 30s)
    --logs DIR          设置日志目录 (默认: ./logs)

示例:
    $0 --url http://localhost:3000 --retries 5
    $0 --help
EOF
}

# 解析参数
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -u|--url)
            API_BASE_URL="$2"
            shift 2
            ;;
        -r|--retries)
            MAX_RETRIES="$2"
            shift 2
            ;;
        -i|--interval)
            RETRY_INTERVAL="$2"
            shift 2
            ;;
        -t|--timeout)
            TIMEOUT="$2"
            shift 2
            ;;
        --logs)
            LOG_DIR="$2"
            shift 2
            ;;
        *)
            log_error "未知参数: $1"
            show_help
            exit 1
            ;;
    esac
done

# 运行主函数
main
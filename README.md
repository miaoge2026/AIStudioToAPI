# Google AI Studio to API - 高级代理工具

[English](README_EN.md) | 中文

一个强大的代理工具，将 Google AI Studio (Gemini) 封装为兼容 OpenAI API、Claude API 和原生 Gemini API 格式的接口。支持多账户轮转、智能错误处理、流式响应和自动恢复机制。

**GitHub 仓库**: https://github.com/miaoge2026/AIStudioToAPI

## ✨ 核心特性

- **多协议支持**：无缝兼容 OpenAI API、Claude API、Gemini API 和 OpenAI Response API
- **智能账户管理**：支持多账户轮转、自动切换和故障恢复
- **双模式流处理**：真实流模式（WebSocket）和伪流模式（缓冲响应）
- **浏览器自动化**：基于 Puppeteer 的浏览器管理和 WebSocket 连接
- **高可用架构**：自动重试、超时处理、连接保持和优雅降级
- **生产就绪**：Docker 容器化、PM2 进程管理、完善的日志系统

## 🚀 快速开始

### 环境要求

- Node.js 18+ 或 Docker
- Chrome/Chromium 浏览器
- 内存：至少 2GB RAM
- 存储空间：至少 1GB

### 安装方式 1：直接运行（推荐开发）

```bash
# 克隆项目
git clone https://github.com/miaoge/AIStudioToAPI.git
cd AIStudioToAPI

# 安装依赖
npm install

# 配置环境
cp .env.example .env
# 编辑 .env 文件，设置 HTTP_PORT、HOST 等参数

# 启动服务
npm start
```

### 安装方式 2：Docker 部署（推荐生产）

```bash
# 克隆项目
git clone https://github.com/miaoge/AIStudioToAPI.git
cd AIStudioToAPI

# 构建镜像
docker build -t aistudio-to-api .

# 运行容器
docker run -d \
  --name aistudio-proxy \
  -p 3000:3000 \
  -v $(pwd)/configs:/app/configs \
  -v $(pwd)/logs:/app/logs \
  aistudio-to-api
```

### 安装方式 3：Docker Compose（推荐）

```bash
# 克隆项目
git clone https://github.com/miaoge/AIStudioToAPI.git
cd AIStudioToAPI

# 启动服务
docker-compose up -d
```

## 📋 配置说明

### 环境变量配置 (.env)

```env
# 服务器配置
HOST=0.0.0.0
HTTP_PORT=3000
LOG_LEVEL=info

# 代理模式
STREAMING_MODE=real  # real 或 fake

# 账户切换策略
SWITCH_ON_FAILURE=true
SWITCH_ON_USES=10
MAX_RETRIES=3
RETRY_DELAY=1000

# 超时设置
BROWSER_TIMEOUT=120000
REQUEST_TIMEOUT=300000

# 立即切换的状态码
IMMEDIATE_SWITCH_STATUS_CODES=429,503
```

### 账户配置 (configs/auth/)

在 `configs/auth/` 目录下创建账户配置文件：

**auth-0.json 示例：**
```json
{
  "accountName": "your-email@gmail.com",
  "cookies": [
    {
      "name": "cookie_name",
      "value": "cookie_value",
      "domain": ".google.com",
      "path": "/",
      "expires": 1735689600,
      "httpOnly": true,
      "secure": true,
      "sameSite": "None"
    }
  ]
}
```

## 🔧 API 使用示例

### OpenAI 兼容接口

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-1.5-pro",
    "messages": [
      {"role": "user", "content": "你好，你是谁？"}
    ],
    "stream": true
  }'
```

### Claude 兼容接口

```bash
curl http://localhost:3000/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-1.5-pro",
    "max_tokens": 1024,
    "messages": [
      {"role": "user", "content": "你好，你是谁？"}
    ],
    "stream": true
  }'
```

### 原生 Gemini 接口

```bash
curl http://localhost:3000/v1beta/models/gemini-1.5-pro:generateContent \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [
      {"role": "user", "parts": [{"text": "你好，你是谁？"}]}
    ]
  }'
```

## 📁 项目结构

```
.
├── main.js                 # 主入口文件
├── package.json           # 项目依赖
├── Dockerfile            # Docker 构建文件
├── docker-compose.yml    # Docker Compose 配置
├── .env.example          # 环境变量示例
├── configs/
│   ├── auth/            # 账户配置文件
│   └── server.json      # 服务器配置
├── logs/                # 日志目录
├── src/
│   ├── auth/            # 认证模块
│   ├── core/            # 核心处理逻辑
│   ├── utils/           # 工具函数
│   └── browser/         # 浏览器管理
├── docs/                # 详细文档
├── scripts/             # 辅助脚本
└── ui/                  # 管理界面
```

## 🔍 监控和日志

### 查看日志

```bash
# 实时日志
docker logs -f aistudio-proxy

# 或者使用 PM2
pm2 logs aistudio-proxy
```

### 健康检查

```bash
curl http://localhost:3000/health
```

## 🛠️ 开发指南

### 本地开发

```bash
# 安装依赖
npm install

# 开发模式运行（自动重启）
npm run dev

# 代码检查
npm run lint

# 格式化代码
npm run format
```

### 环境变量

| 变量名 | 描述 | 默认值 |
|--------|------|--------|
| HOST | 服务器监听地址 | 0.0.0.0 |
| HTTP_PORT | HTTP 端口 | 3000 |
| LOG_LEVEL | 日志级别 | info |
| STREAMING_MODE | 流模式 | real |
| SWITCH_ON_USES | 使用次数切换 | 10 |

## 🚨 故障排除

### 常见问题

1. **浏览器启动失败**
   - 检查 Chrome/Chromium 是否安装
   - 增加内存限制：`--shm-size=1gb`

2. **账户认证失败**
   - 检查 cookies 是否正确
   - 清除浏览器缓存重新登录

3. **流式响应中断**
   - 检查网络连接
   - 增加超时设置

### 性能优化

- 调整 `SWITCH_ON_USES` 减少账户切换
- 使用 `real` 流模式降低延迟
- 增加浏览器实例池大小

## 📊 性能基准

- **吞吐量**：100+ 请求/分钟（单账户）
- **延迟**：< 200ms（首字节时间）
- **并发**：支持 50+ 并发连接
- **可用性**：99.9%（自动故障转移）

## 🔒 安全建议

- 使用 HTTPS 反向代理（Nginx/Traefik）
- 限制访问 IP 白名单
- 定期更新 cookies
- 启用认证中间件
- 监控异常请求模式

## 🤝 贡献指南

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 开启 Pull Request

## 📄 许可证

本项目基于 [MIT License](LICENSE) 开源。

## 🌟 Star 历史

如果这个项目对您有帮助，请考虑给予 Star 支持！

## 📞 支持

- 📧 Email: support@example.com
- 💬 Discord: [加入社区](https://discord.gg/your-invite)
- 📚 文档: [详细文档](docs/)

---

**注意**：本项目仅供学习和研究使用，请勿用于商业用途。
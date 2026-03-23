# API 文档

## 目录
- [API 文档](#api-文档)
  - [目录](#目录)
  - [基础信息](#基础信息)
  - [认证](#认证)
  - [OpenAI 兼容接口](#openai-兼容接口)
    - [聊天完成](#聊天完成)
    - [流式响应](#流式响应)
    - [模型列表](#模型列表)
  - [Claude 兼容接口](#claude-兼容接口)
    - [消息创建](#消息创建)
    - [令牌计数](#令牌计数)
  - [Gemini 原生接口](#gemini-原生接口)
    - [内容生成](#内容生成)
    - [流式生成](#流式生成)
    - [文件上传](#文件上传)
  - [管理接口](#管理接口)
    - [健康检查](#健康检查)
    - [账户状态](#账户状态)
    - [指标](#指标)
  - [错误处理](#错误处理)
  - [速率限制](#速率限制)

## 基础信息

### 基础 URL

```
http://localhost:3000
```

### 支持的 API 版本

- OpenAI API 兼容接口: `/v1`
- Claude API 兼容接口: `/v1`
- Gemini 原生接口: `/v1beta`

### 数据格式

所有接口使用 JSON 格式进行请求和响应。

### 字符编码

UTF-8

## 认证

目前版本支持以下认证方式：

### 1. 无认证（默认）

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "gemini-1.5-pro", "messages": [{"role": "user", "content": "Hello"}]}'
```

### 2. API 密钥认证（可选）

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"model": "gemini-1.5-pro", "messages": [{"role": "user", "content": "Hello"}]}'
```

## OpenAI 兼容接口

### 聊天完成

#### 请求

```http
POST /v1/chat/completions
Content-Type: application/json
```

**参数:**

| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| model | string | 是 | 模型名称，例如 `gemini-1.5-pro` |
| messages | array | 是 | 消息数组 |
| temperature | number | 否 | 温度参数 (0-2)，默认 0.7 |
| top_p | number | 否 | Top-p 采样 (0-1)，默认 1 |
| n | integer | 否 | 生成数量，默认 1 |
| stream | boolean | 否 | 是否使用流式响应，默认 false |
| stop | string/array | 否 | 停止序列 |
| max_tokens | integer | 否 | 最大令牌数 |
| presence_penalty | number | 否 | 存在惩罚 (-2.0-2.0) |
| frequency_penalty | number | 否 | 频率惩罚 (-2.0-2.0) |
| user | string | 否 | 用户标识 |

**请求示例:**

```json
{
  "model": "gemini-1.5-pro",
  "messages": [
    {
      "role": "user",
      "content": "你好，你是谁？"
    }
  ],
  "temperature": 0.7,
  "max_tokens": 1000,
  "stream": false
}
```

#### 响应

```http
HTTP/1.1 200 OK
Content-Type: application/json
```

**响应示例:**

```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1677652288,
  "model": "gemini-1.5-pro",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "你好！我是一个 AI 助手。"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 20,
    "total_tokens": 30
  }
}
```

### 流式响应

#### 请求

```http
POST /v1/chat/completions
Content-Type: application/json
```

**参数:** 同上，但 `stream` 设为 `true`

**请求示例:**

```json
{
  "model": "gemini-1.5-pro",
  "messages": [
    {
      "role": "user",
      "content": "写一首诗"
    }
  ],
  "stream": true
}
```

#### 响应

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
```

**响应示例:**

```text
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1677652288,"model":"gemini-1.5-pro","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}

data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1677652288,"model":"gemini-1.5-pro","choices":[{"index":0,"delta":{"content":"春风"},"finish_reason":null}]}

data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1677652288,"model":"gemini-1.5-pro","choices":[{"index":0,"delta":{"content":"拂面"},"finish_reason":null}]}

data: [DONE]
```

### 模型列表

#### 请求

```http
GET /v1/models
```

#### 响应

```http
HTTP/1.1 200 OK
Content-Type: application/json
```

**响应示例:**

```json
{
  "object": "list",
  "data": [
    {
      "id": "gemini-1.5-pro",
      "object": "model",
      "created": 1677652288,
      "owned_by": "google"
    },
    {
      "id": "gemini-1.5-flash",
      "object": "model",
      "created": 1677652288,
      "owned_by": "google"
    }
  ]
}
```

## Claude 兼容接口

### 消息创建

#### 请求

```http
POST /v1/messages
Content-Type: application/json
```

**参数:**

| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| model | string | 是 | 模型名称 |
| max_tokens | integer | 是 | 最大令牌数 |
| messages | array | 是 | 消息数组 |
| system | string | 否 | 系统提示 |
| temperature | number | 否 | 温度参数 |
| top_p | number | 否 | Top-p 采样 |
| top_k | integer | 否 | Top-k 采样 |
| stream | boolean | 否 | 是否使用流式响应 |
| stop_sequences | array | 否 | 停止序列 |

**请求示例:**

```json
{
  "model": "gemini-1.5-pro",
  "max_tokens": 1024,
  "messages": [
    {
      "role": "user",
      "content": "你好，你是谁？"
    }
  ],
  "temperature": 0.7,
  "stream": false
}
```

#### 响应

```http
HTTP/1.1 200 OK
Content-Type: application/json
```

**响应示例:**

```json
{
  "id": "msg_123",
  "type": "message",
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "你好！我是一个 AI 助手。"
    }
  ],
  "model": "gemini-1.5-pro",
  "usage": {
    "input_tokens": 10,
    "output_tokens": 20
  }
}
```

### 令牌计数

#### 请求

```http
POST /v1/messages/count_tokens
Content-Type: application/json
```

**参数:** 与消息创建相同

#### 响应

```http
HTTP/1.1 200 OK
Content-Type: application/json
```

**响应示例:**

```json
{
  "input_tokens": 10
}
```

## Gemini 原生接口

### 内容生成

#### 请求

```http
POST /v1beta/models/{model}:generateContent
Content-Type: application/json
```

**参数:**

| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| model | string | 是 | 模型名称 |
| contents | array | 是 | 内容数组 |
| generationConfig | object | 否 | 生成配置 |
| safetySettings | array | 否 | 安全设置 |
| systemInstruction | object | 否 | 系统指令 |

**请求示例:**

```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "text": "你好，你是谁？"
        }
      ]
    }
  ],
  "generationConfig": {
    "temperature": 0.7,
    "maxOutputTokens": 1000
  }
}
```

#### 响应

```http
HTTP/1.1 200 OK
Content-Type: application/json
```

**响应示例:**

```json
{
  "candidates": [
    {
      "content": {
        "parts": [
          {
            "text": "你好！我是一个 AI 助手。"
          }
        ],
        "role": "model"
      },
      "finishReason": "STOP",
      "index": 0,
      "safetyRatings": []
    }
  ],
  "usageMetadata": {
    "promptTokenCount": 10,
    "candidatesTokenCount": 20,
    "totalTokenCount": 30
  }
}
```

### 流式生成

#### 请求

```http
POST /v1beta/models/{model}:streamGenerateContent
Content-Type: application/json
```

**查询参数:**

| 参数 | 值 | 描述 |
|------|----|------|
| alt | sse | 使用 SSE 流式响应 |

#### 响应

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
```

### 文件上传

#### 请求

```http
POST /v1beta/files/upload
Content-Type: multipart/form-data
```

**参数:**

| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| file | file | 是 | 上传的文件 |
| purpose | string | 是 | 文件用途 |

## 管理接口

### 健康检查

#### 请求

```http
GET /health
```

#### 响应

```http
HTTP/1.1 200 OK
Content-Type: application/json
```

**响应示例:**

```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00Z",
  "uptime": "1h 30m"
}
```

### 详细状态

#### 请求

```http
GET /health?detailed=true
```

#### 响应

```http
HTTP/1.1 200 OK
Content-Type: application/json
```

**响应示例:**

```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00Z",
  "uptime": "1h 30m",
  "version": "1.0.0",
  "accounts": {
    "total": 3,
    "active": 2,
    "expired": 1
  },
  "performance": {
    "avg_response_time": 150,
    "requests_per_minute": 45
  }
}
```

### 指标

#### 请求

```http
GET /metrics
```

#### 响应

```http
HTTP/1.1 200 OK
Content-Type: text/plain
```

**响应示例:**

```
# HELP aistudio_requests_total Total number of requests
# TYPE aistudio_requests_total counter
aistudio_requests_total{method="POST",endpoint="/v1/chat/completions",status="200"} 1234

# HELP aistudio_response_duration_seconds Response duration in seconds
# TYPE aistudio_response_duration_seconds histogram
aistudio_response_duration_seconds_bucket{method="POST",endpoint="/v1/chat/completions",le="0.1"} 100
```

## 错误处理

### 错误响应格式

```http
HTTP/1.1 {status_code}
Content-Type: application/json
```

**错误响应示例:**

```json
{
  "error": {
    "code": "invalid_request_error",
    "message": "Invalid request parameters",
    "param": "messages",
    "type": "invalid_request"
  }
}
```

### 常见错误代码

| 状态码 | 错误类型 | 描述 |
|--------|----------|------|
| 400 | invalid_request_error | 无效请求参数 |
| 401 | authentication_error | 认证失败 |
| 404 | not_found_error | 资源不存在 |
| 429 | rate_limit_error | 速率限制 |
| 500 | api_error | 服务器内部错误 |
| 503 | service_unavailable | 服务暂时不可用 |

## 速率限制

### 限制规则

- 默认限制: 每分钟 100 个请求
- 突发限制: 每分钟 20 个请求
- 窗口时间: 1 分钟

### 速率限制头信息

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1677652288
```

### 超出限制的响应

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/json

{
  "error": {
    "code": "rate_limit_exceeded",
    "message": "Rate limit exceeded. Please try again later.",
    "type": "rate_limit"
  }
}
```

## SDK 使用示例

### Python

```python
import openai

# 配置
openai.api_base = "http://localhost:3000/v1"
openai.api_key = "your-api-key"  # 可选

# 聊天完成
response = openai.ChatCompletion.create(
    model="gemini-1.5-pro",
    messages=[
        {"role": "user", "content": "你好，你是谁？"}
    ],
    stream=True
)

# 处理流式响应
for chunk in response:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)
```

### JavaScript

```javascript
import OpenAI from 'openai';

// 配置
const openai = new OpenAI({
  baseURL: 'http://localhost:3000/v1',
  apiKey: 'your-api-key' // 可选
});

// 聊天完成
async function chat() {
  const stream = await openai.chat.completions.create({
    model: 'gemini-1.5-pro',
    messages: [{ role: 'user', content: '你好，你是谁？' }],
    stream: true
  });

  for await (const chunk of stream) {
    process.stdout.write(chunk.choices[0]?.delta?.content || '');
  }
}
```

### cURL

```bash
# 基本请求
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "gemini-1.5-pro", "messages": [{"role": "user", "content": "你好"}]}'

# 流式请求
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "gemini-1.5-pro", "messages": [{"role": "user", "content": "你好"}], "stream": true}'
```
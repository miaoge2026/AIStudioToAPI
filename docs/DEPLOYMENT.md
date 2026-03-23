# 部署指南

## 目录
- [部署指南](#部署指南)
  - [目录](#目录)
  - [生产环境部署](#生产环境部署)
    - [Docker Compose 部署（推荐）](#docker-compose-部署推荐)
    - [Kubernetes 部署](#kubernetes-部署)
    - [PM2 部署](#pm2-部署)
  - [配置管理](#配置管理)
    - [环境变量配置](#环境变量配置)
    - [账户配置](#账户配置)
    - [Nginx 配置](#nginx-配置)
  - [监控和运维](#监控和运维)
    - [健康检查](#健康检查)
    - [日志管理](#日志管理)
    - [指标监控](#指标监控)
  - [安全加固](#安全加固)
    - [HTTPS 配置](#https-配置)
    - [访问控制](#访问控制)
    - [速率限制](#速率限制)
  - [性能调优](#性能调优)
    - [浏览器优化](#浏览器优化)
    - [连接池调优](#连接池调优)
    - [内存管理](#内存管理)
  - [备份和恢复](#备份和恢复)
  - [升级指南](#升级指南)
  - [故障排除](#故障排除)

## 生产环境部署

### Docker Compose 部署（推荐）

#### 1. 准备工作

```bash
# 创建部署目录
mkdir -p /opt/aistudio-to-api
cd /opt/aistudio-to-api

# 克隆项目
git clone https://github.com/miaoge/AIStudioToAPI.git .
```

#### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件
nano .env
```

推荐的生产环境配置：

```env
# 基础配置
HOST=0.0.0.0
HTTP_PORT=3000
LOG_LEVEL=warn

# 性能配置
STREAMING_MODE=real
SWITCH_ON_USES=20
MAX_RETRIES=2

# 资源限制
BROWSER_TIMEOUT=60000
REQUEST_TIMEOUT=180000

# 安全配置
RATE_LIMIT_ENABLED=true
RATE_LIMIT_REQUESTS=60
```

#### 3. 启动服务

```bash
# 启动主服务
docker-compose up -d

# 启动完整栈（包括 Nginx 和监控）
docker-compose --profile production --profile monitoring up -d
```

#### 4. 验证部署

```bash
# 检查服务状态
docker-compose ps

# 查看日志
docker-compose logs -f aistudio-proxy

# 健康检查
curl http://localhost:3000/health
```

### Kubernetes 部署

#### 1. 创建命名空间

```bash
kubectl create namespace aistudio
```

#### 2. 部署配置

创建 `k8s-deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: aistudio-proxy
  namespace: aistudio
spec:
  replicas: 2
  selector:
    matchLabels:
      app: aistudio-proxy
  template:
    metadata:
      labels:
        app: aistudio-proxy
    spec:
      containers:
      - name: aistudio-proxy
        image: aistudio-to-api:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: HTTP_PORT
          value: "3000"
        resources:
          requests:
            memory: "1Gi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 60
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 10
        volumeMounts:
        - name: configs
          mountPath: /app/configs
        - name: logs
          mountPath: /app/logs
      volumes:
      - name: configs
        persistentVolumeClaim:
          claimName: aistudio-configs
      - name: logs
        persistentVolumeClaim:
          claimName: aistudio-logs
---
apiVersion: v1
kind: Service
metadata:
  name: aistudio-proxy
  namespace: aistudio
spec:
  selector:
    app: aistudio-proxy
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: LoadBalancer
```

#### 3. 应用配置

```bash
kubectl apply -f k8s-deployment.yaml
```

### PM2 部署

#### 1. 安装 PM2

```bash
npm install -g pm2
```

#### 2. 创建 PM2 配置

创建 `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'aistudio-proxy',
    script: './main.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      HTTP_PORT: 3000,
      LOG_LEVEL: 'info'
    },
    env_production: {
      NODE_ENV: 'production',
      LOG_LEVEL: 'warn'
    },
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    max_memory_restart: '2G',
    watch: false,
    ignore_watch: ['node_modules', 'logs', 'configs/auth'],
    autorestart: true,
    min_uptime: '10s',
    max_restarts: 5,
    kill_timeout: 5000
  }]
};
```

#### 3. 启动服务

```bash
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
```

## 配置管理

### 环境变量配置

#### 核心配置项

| 变量名 | 说明 | 推荐值 | 可选值 |
|--------|------|--------|--------|
| STREAMING_MODE | 流处理模式 | real | real, fake |
| SWITCH_ON_USES | 使用次数切换 | 20 | 10-50 |
| LOG_LEVEL | 日志级别 | warn | error, warn, info, debug |
| MAX_RETRIES | 最大重试次数 | 2 | 1-5 |
| RATE_LIMIT_ENABLED | 启用速率限制 | true | true, false |
| RATE_LIMIT_REQUESTS | 每分钟请求数 | 60 | 30-200 |

#### 高级配置项

```env
# 浏览器优化
BROWSER_HEADLESS=true
BROWSER_USER_DATA_DIR=/app/browser-data
MAX_BROWSER_INSTANCES=3

# 性能调优
CONNECTION_POOL_SIZE=10
REQUEST_TIMEOUT=180000
BROWSER_TIMEOUT=60000

# 监控配置
METRICS_ENABLED=true
METRICS_PORT=9090
```

### 账户配置

#### 账户文件格式

在 `configs/auth/` 目录下创建 `auth-{index}.json` 文件：

```json
{
  "accountName": "user@example.com",
  "expired": false,
  "cookies": [
    {
      "name": "SID",
      "value": "your-cookie-value",
      "domain": ".google.com",
      "path": "/",
      "expires": 1735689600,
      "httpOnly": true,
      "secure": true,
      "sameSite": "None"
    }
  ],
  "metadata": {
    "createdAt": "2024-01-01T00:00:00Z",
    "lastUsed": "2024-01-01T00:00:00Z",
    "usageCount": 0,
    "status": "active"
  }
}
```

#### 账户管理脚本

创建 `scripts/manage-accounts.js`:

```javascript
const fs = require('fs');
const path = require('path');

class AccountManager {
  constructor() {
    this.authDir = path.join(__dirname, '../configs/auth');
  }

  // 列出所有账户
  listAccounts() {
    const files = fs.readdirSync(this.authDir);
    return files
      .filter(f => f.startsWith('auth-') && f.endsWith('.json'))
      .map(f => {
        const index = parseInt(f.match(/auth-(\d+)\.json/)[1]);
        const content = JSON.parse(fs.readFileSync(path.join(this.authDir, f), 'utf-8'));
        return { index, ...content };
      });
  }

  // 添加账户
  addAccount(accountData) {
    const index = this.getNextIndex();
    const filePath = path.join(this.authDir, `auth-${index}.json`);
    fs.writeFileSync(filePath, JSON.stringify(accountData, null, 2));
    return index;
  }

  // 删除账户
  removeAccount(index) {
    const filePath = path.join(this.authDir, `auth-${index}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  }

  // 获取下一个可用索引
  getNextIndex() {
    const files = fs.readdirSync(this.authDir);
    const indices = files
      .filter(f => f.startsWith('auth-') && f.endsWith('.json'))
      .map(f => parseInt(f.match(/auth-(\d+)\.json/)[1]));
    return indices.length > 0 ? Math.max(...indices) + 1 : 0;
  }
}

module.exports = AccountManager;
```

### Nginx 配置

#### 基本反向代理

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

#### HTTPS 配置

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256';
    ssl_prefer_server_ciphers off;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 监控和运维

### 健康检查

#### HTTP 健康检查端点

```bash
# 基础健康检查
curl http://localhost:3000/health

# 详细状态
curl http://localhost:3000/health?detailed=true
```

#### Docker 健康检查配置

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 60s
```

### 日志管理

#### 日志级别配置

```bash
# 生产环境
LOG_LEVEL=warn

# 开发环境
LOG_LEVEL=debug

# 错误调试
LOG_LEVEL=error
```

#### 日志轮转配置

```javascript
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 10485760,
      maxFiles: 5
    })
  ]
});
```

### 指标监控

#### Prometheus 指标

```javascript
const client = require('prom-client');

// 创建指标
const requestCounter = new client.Counter({
  name: 'aistudio_requests_total',
  help: 'Total number of requests',
  labelNames: ['method', 'endpoint', 'status']
});

const responseTimeHistogram = new client.Histogram({
  name: 'aistudio_response_duration_seconds',
  help: 'Response duration in seconds',
  labelNames: ['method', 'endpoint'],
  buckets: [0.1, 0.5, 1, 2, 5, 10]
});

// 暴露指标端点
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});
```

#### Grafana 仪表板

导入以下 JSON 配置到 Grafana：

```json
{
  "dashboard": {
    "title": "AIStudio Proxy Metrics",
    "panels": [
      {
        "title": "Request Rate",
        "targets": [
          {
            "expr": "rate(aistudio_requests_total[5m])",
            "legendFormat": "{{method}} {{endpoint}}"
          }
        ]
      },
      {
        "title": "Response Time",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(aistudio_response_duration_seconds_bucket[5m]))",
            "legendFormat": "p95"
          }
        ]
      }
    ]
  }
}
```

## 安全加固

### HTTPS 配置

#### 使用 Let's Encrypt

```bash
# 安装 Certbot
sudo apt-get install certbot python3-certbot-nginx

# 获取证书
sudo certbot --nginx -d your-domain.com

# 自动续期
sudo crontab -e
# 添加: 0 12 * * * certbot renew --quiet
```

### 访问控制

#### IP 白名单配置

```nginx
location / {
    allow 192.168.1.0/24;
    allow 10.0.0.0/8;
    deny all;
    
    proxy_pass http://localhost:3000;
}
```

#### API 密钥认证

```javascript
const apiKeyAuth = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

app.use('/v1', apiKeyAuth);
```

### 速率限制

#### Express 速率限制

```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: process.env.RATE_LIMIT_REQUESTS || 60,
  message: {
    error: 'Too many requests from this IP'
  }
});

app.use('/v1', limiter);
```

## 性能调优

### 浏览器优化

#### Puppeteer 配置

```javascript
const browser = await puppeteer.launch({
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--disable-gpu',
    '--window-size=1920x1080'
  ],
  defaultViewport: {
    width: 1920,
    height: 1080
  }
});
```

### 连接池调优

```javascript
const connectionPool = {
  max: 10,
  min: 2,
  acquire: 30000,
  idle: 10000,
  evict: 1000
};
```

### 内存管理

```bash
# 设置 Node.js 内存限制
NODE_OPTIONS="--max-old-space-size=2048"

# PM2 内存限制
pm2 start app.js --max-memory-restart 2G
```

## 备份和恢复

### 数据备份脚本

```bash
#!/bin/bash

# 备份配置和日志
BACKUP_DIR="/backup/aistudio-$(date +%Y%m%d-%H%M%S)"
mkdir -p $BACKUP_DIR

# 备份配置
cp -r /opt/aistudio-to-api/configs $BACKUP_DIR/
cp /opt/aistudio-to-api/.env $BACKUP_DIR/

# 备份日志（可选）
cp -r /opt/aistudio-to-api/logs $BACKUP_DIR/

# 压缩备份
tar -czf $BACKUP_DIR.tar.gz $BACKUP_DIR
rm -rf $BACKUP_DIR

# 保留最近7天的备份
find /backup -name "aistudio-*.tar.gz" -mtime +7 -delete
```

### 数据恢复

```bash
# 解压备份
tar -xzf aistudio-backup-20240101-120000.tar.gz

# 恢复配置
cp -r backup/configs/* /opt/aistudio-to-api/configs/
cp backup/.env /opt/aistudio-to-api/.env

# 重启服务
docker-compose restart
```

## 升级指南

### 小版本升级

```bash
# 拉取最新代码
git pull origin main

# 重新构建
docker-compose build

# 重启服务
docker-compose restart
```

### 大版本升级

```bash
# 1. 备份数据
./scripts/backup.sh

# 2. 检查更新日志
cat CHANGELOG.md

# 3. 停止服务
docker-compose down

# 4. 更新配置
./scripts/migrate-config.js

# 5. 启动新服务
docker-compose up -d

# 6. 验证服务
./scripts/health-check.sh
```

## 故障排除

### 常见问题

#### 1. 浏览器启动失败

**现象**: `Error: Failed to launch browser`

**解决方案**:
```bash
# 增加共享内存
docker run --shm-size=1gb ...

# 检查依赖
apt-get update
apt-get install -y libnss3 libatk-bridge2.0-0 libgtk-3-0
```

#### 2. 账户认证失败

**现象**: `Invalid cookies or session expired`

**解决方案**:
- 重新获取 cookies
- 清除浏览器缓存
- 检查账户状态

#### 3. 流式响应中断

**现象**: `Stream connection closed unexpectedly`

**解决方案**:
- 检查网络连接
- 增加超时设置
- 切换流模式为 fake

### 性能问题

#### 内存泄漏

```bash
# 监控内存使用
docker stats aistudio-proxy

# 设置自动重启
docker update --restart=unless-stopped aistudio-proxy
```

#### 高 CPU 使用

```bash
# 分析 CPU 使用
docker exec -it aistudio-proxy top

# 限制 CPU 使用
docker update --cpus=2 aistudio-proxy
```

### 联系支持

- GitHub Issues: https://github.com/miaoge/AIStudioToAPI/issues
- Email: support@example.com
- Discord: [加入社区](https://discord.gg/your-invite)
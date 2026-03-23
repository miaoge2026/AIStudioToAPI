/**
 * AIStudio To API - Main Entry Point (Enhanced)
 * 
 * Author: miaoge2026
 * Version: 2.0.0
 */

// Load environment variables
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const fs = require('fs');

// Import enhanced modules
const ConfigManager = require('./src/utils/ConfigManager');
const LoggingService = require('./src/utils/LoggingService');
const OpenAIRoutes = require('./src/routes/OpenAIRoutes');
const ClaudeRoutes = require('./src/routes/ClaudeRoutes');
const GeminiRoutes = require('./src/routes/GeminiRoutes');
const ProxyServerSystem = require('./src/core/ProxyServerSystem');

// Create Express app
const app = express();

// Initialize enhanced config manager
const configManager = new ConfigManager(LoggingService.getLogger());
const logger = LoggingService.getLogger();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"]
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS configuration
const corsOptions = {
  origin: configManager.get('security.allowedOrigins') || ['*'],
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Forwarded-For'],
  exposedHeaders: ['X-Cache-Hit', 'X-Model-Used', 'X-Account-Index', 'X-Response-Time', 'X-Usage-Tokens', 'X-Usage-Cost']
};

app.use(cors(corsOptions));

// Compression middleware
app.use(compression({
  level: 6,
  threshold: 100 * 1024, // 100KB
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  }
}));

// Body parsing middleware
app.use(express.json({ 
  limit: configManager.get('proxy.maxRequestBodySize') || '50mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: configManager.get('proxy.maxRequestBodySize') || '50mb' 
}));

// Logging middleware
const morganFormat = configManager.get('server.logFormat') || 'combined';
app.use(morgan(morganFormat, {
  stream: {
    write: (message) => logger.info(message.trim())
  }
}));

// Prometheus metrics (if enabled)
if (configManager.get('monitoring.metricsEnabled')) {
  const client = require('prom-client');
  const metricsPort = configManager.get('monitoring.metricsPort') || 9090;
  
  // Create metrics
  const requestCounter = new client.Counter({
    name: 'aistudio_requests_total',
    help: 'Total number of requests',
    labelNames: ['method', 'endpoint', 'status', 'model']
  });
  
  const responseTimeHistogram = new client.Histogram({
    name: 'aistudio_response_duration_seconds',
    help: 'Response duration in seconds',
    labelNames: ['method', 'endpoint', 'model'],
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30]
  });
  
  // Metrics middleware
  app.use((req, res, next) => {
    const start = Date.now();
    const endpoint = req.path;
    const method = req.method;
    
    res.on('finish', () => {
      const duration = (Date.now() - start) / 1000;
      const status = res.statusCode;
      const model = req.model || 'unknown';
      
      requestCounter.inc({ method, endpoint, status, model });
      responseTimeHistogram.observe({ method, endpoint, model }, duration);
    });
    
    next();
  });
  
  // Metrics endpoint
  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', client.register.contentType);
    res.end(await client.register.metrics());
  });
  
  logger.info(`[Main] Prometheus metrics enabled on port ${metricsPort}`);
}

// Request ID middleware
app.use((req, res, next) => {
  req.id = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  res.setHeader('X-Request-ID', req.id);
  next();
});

// Initialize ProxyServerSystem
const serverSystem = new ProxyServerSystem(configManager);

// Initialize route handlers with enhanced request handler
const enhancedRequestHandler = {
  config: configManager,
  logger: logger,
  serverSystem: serverSystem,
  getEnhancedStats: () => ({
    requests: serverSystem.requestStats || { totalRequests: 0, successfulRequests: 0, failedRequests: 0, totalProcessingTime: 0, avgProcessingTime: 0 },
    models: serverSystem.modelManager?.getAllModelStats() || {},
    loadBalancer: serverSystem.loadBalancer?.getAllAccountStats() || {},
    cache: serverSystem.cacheManager?.getAllStats() || {}
  }),
  
  // Enhanced processing methods
  processOpenAIRequestEnhanced: async (req, res) => {
    return serverSystem.handleOpenAIRequestEnhanced(req, res);
  },
  
  processClaudeRequestEnhanced: async (req, res) => {
    return serverSystem.handleClaudeRequestEnhanced(req, res);
  },
  
  processGeminiGenerateContentEnhanced: async (req, res) => {
    return serverSystem.handleGeminiRequestEnhanced(req, res);
  },
  
  processGeminiStreamGenerateContentEnhanced: async (req, res) => {
    return serverSystem.handleGeminiStreamRequestEnhanced(req, res);
  },
  
  processGeminiCountTokensEnhanced: async (req, res) => {
    return serverSystem.handleGeminiCountTokensEnhanced(req, res);
  },
  
  processGeminiFileUploadEnhanced: async (req, res) => {
    return serverSystem.handleGeminiFileUploadEnhanced(req, res);
  }
};

// Initialize route handlers
const openaiRoutes = new OpenAIRoutes(enhancedRequestHandler, configManager, logger);
const claudeRoutes = new ClaudeRoutes(enhancedRequestHandler, configManager, logger);
const geminiRoutes = new GeminiRoutes(enhancedRequestHandler, configManager, logger);

// Mount routes
app.use('/v1', openaiRoutes.getRouter());
app.use('/v1beta', geminiRoutes.getRouter());

// UI routes (if enabled)
if (configManager.get('ui.enabled') !== false) {
  const uiPath = path.join(__dirname, 'ui', 'dist');
  if (fs.existsSync(uiPath)) {
    app.use('/ui', express.static(uiPath));
    app.get('/ui/*', (req, res) => {
      res.sendFile(path.join(uiPath, 'index.html'));
    });
    logger.info('[Main] UI enabled at /ui');
  } else {
    logger.warn('[Main] UI directory not found, UI disabled');
  }
}

// Global health check endpoint
app.get('/health', (req, res) => {
  const detailed = req.query.detailed === 'true';
  const stats = enhancedRequestHandler.getEnhancedStats();
  
  if (detailed) {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      uptime: process.uptime(),
      environment: configManager.get('server.env'),
      services: {
        openai: 'operational',
        claude: 'operational',
        gemini: 'operational'
      },
      stats: {
        total_requests: stats.requests.totalRequests,
        successful_requests: stats.requests.successfulRequests,
        failed_requests: stats.requests.failedRequests,
        avg_response_time: Math.round(stats.requests.avgProcessingTime),
        cache_stats: stats.cache,
        model_stats: stats.models
      }
    });
  } else {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '2.0.0'
    });
  }
});

// Global error handling middleware
app.use((err, req, res, next) => {
  logger.error(`[Main] Unhandled error: ${err.message}`, err);
  
  const statusCode = err.statusCode || 500;
  const errorResponse = {
    error: {
      code: statusCode,
      message: err.message || 'Internal server error',
      type: err.type || 'api_error',
      requestId: req.id
    }
  };
  
  // Add stack trace in development
  if (configManager.get('server.env') === 'development') {
    errorResponse.error.stack = err.stack;
  }
  
  res.status(statusCode).json(errorResponse);
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: {
      code: 404,
      message: 'Not found',
      type: 'not_found',
      requestId: req.id,
      path: req.path
    }
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('[Main] Received SIGTERM, shutting down gracefully');
  server.close(() => {
    logger.info('[Main] Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('[Main] Received SIGINT, shutting down gracefully');
  server.close(() => {
    logger.info('[Main] Server closed');
    process.exit(0);
  });
});

// Initialize and start server
const PORT = configManager.get('server.port') || 3000;
const HOST = configManager.get('server.host') || '0.0.0.0';

const server = app.listen(PORT, HOST, async () => {
  logger.info(`🚀 Server started on ${HOST}:${PORT}`);
  logger.info(`📊 Environment: ${configManager.get('server.env') || 'development'}`);
  logger.info(`🔧 Version: 2.0.0`);
  logger.info(`📚 API Documentation: http://${HOST}:${PORT}/v1/health?detailed=true`);
  
  if (configManager.get('monitoring.metricsEnabled')) {
    const metricsPort = configManager.get('monitoring.metricsPort') || 9090;
    logger.info(`📈 Metrics: http://${HOST}:${metricsPort}/metrics`);
  }
  
  // Start proxy server system
  try {
    await serverSystem.start();
    logger.info(`✅ Proxy server system initialized`);
  } catch (error) {
    logger.error(`❌ Failed to start proxy server system: ${error.message}`);
    process.exit(1);
  }
});

module.exports = { app, server, serverSystem, configManager };
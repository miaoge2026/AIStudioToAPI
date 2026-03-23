/**
 * GeminiRoutes Module
 * Native Gemini API routes with enhanced features
 * 
 * Author: miaoge2026
 * Version: 2.0.0
 */

const express = require('express');
const RateLimit = require('express-rate-limit');

class GeminiRoutes {
  constructor(requestHandler, config, logger) {
    this.requestHandler = requestHandler;
    this.config = config;
    this.logger = logger;
    
    this.router = express.Router();
    this.initializeRoutes();
  }

  /**
   * Initialize Gemini routes
   */
  initializeRoutes() {
    // Apply rate limiting if enabled
    if (this.config.get('security.rateLimitEnabled')) {
      const limiter = RateLimit({
        windowMs: this.config.get('security.rateLimitWindow') || 60000,
        max: this.config.get('security.rateLimitRequests') || 100,
        message: {
          error: {
            code: 429,
            message: 'Rate limit exceeded. Please try again later.',
            type: 'rate_limit'
          }
        },
        standardHeaders: true,
        legacyHeaders: false
      });
      
      this.router.use('/v1beta', limiter);
      this.logger.info('[GeminiRoutes] Rate limiting enabled');
    }

    // Apply API key authentication if enabled
    if (this.config.get('security.apiKeyAuth')) {
      this.router.use('/v1beta', this.apiKeyAuthMiddleware.bind(this));
      this.logger.info('[GeminiRoutes] API key authentication enabled');
    }

    // Gemini API routes
    this.router.post('/v1beta/models/:model:generateContent', 
      this.processGenerateContent.bind(this)
    );
    
    this.router.post('/v1beta/models/:model:streamGenerateContent', 
      this.processStreamGenerateContent.bind(this)
    );
    
    this.router.post('/v1beta/models/:model:countTokens', 
      this.processCountTokens.bind(this)
    );
    
    this.router.post('/v1beta/files/upload', 
      this.processFileUpload.bind(this)
    );

    // Health check endpoint
    this.router.get('/v1beta/health', 
      this.healthCheck.bind(this)
    );

    this.logger.info('[GeminiRoutes] Routes initialized');
  }

  /**
   * API key authentication middleware
   */
  apiKeyAuthMiddleware(req, res, next) {
    const apiKey = req.headers['x-api-key'] || req.query.api_key;
    const validApiKey = this.config.get('security.apiKey') || process.env.API_KEY;
    
    if (!validApiKey || apiKey === validApiKey) {
      return next();
    }
    
    this.logger.warn(`[GeminiRoutes] Invalid API key attempt from ${req.ip}`);
    return res.status(401).json({
      error: {
        code: 401,
        message: 'Invalid API key',
        status: 'UNAUTHENTICATED',
        type: 'authentication_error'
      }
    });
  }

  /**
   * Process generate content
   */
  async processGenerateContent(req, res) {
    const startTime = Date.now();
    const requestId = this.generateRequestId();
    const model = req.params.model;
    
    try {
      this.logger.info(`[GeminiRoutes] Processing generate content ${requestId} for model ${model}`);
      
      // Set request timeout
      req.setTimeout(this.config.get('proxy.requestTimeout') || 300000);
      
      // Add request metadata
      req.requestId = requestId;
      req.startTime = startTime;
      req.model = model;
      
      // Process with enhanced handler
      const result = await this.requestHandler.processGeminiGenerateContentEnhanced(req, res);
      
      // Log performance
      const duration = Date.now() - startTime;
      this.logger.info(`[GeminiRoutes] Request ${requestId} completed in ${duration}ms`);
      
      return result;
      
    } catch (error) {
      this.logger.error(`[GeminiRoutes] Request ${requestId} failed: ${error.message}`);
      return this.sendError(res, 500, 'Internal server error', {
        type: 'api_error',
        requestId: requestId,
        model: model
      });
    }
  }

  /**
   * Process stream generate content
   */
  async processStreamGenerateContent(req, res) {
    const startTime = Date.now();
    const requestId = this.generateRequestId();
    const model = req.params.model;
    
    try {
      this.logger.info(`[GeminiRoutes] Processing stream generate content ${requestId} for model ${model}`);
      
      // Set request timeout (longer for streaming)
      req.setTimeout((this.config.get('proxy.requestTimeout') || 300000) * 2);
      
      // Add request metadata
      req.requestId = requestId;
      req.startTime = startTime;
      req.model = model;
      req.isStreaming = true;
      
      // Set SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      // Process with enhanced handler
      const result = await this.requestHandler.processGeminiStreamGenerateContentEnhanced(req, res);
      
      return result;
      
    } catch (error) {
      this.logger.error(`[GeminiRoutes] Stream request ${requestId} failed: ${error.message}`);
      
      // Try to send error in SSE format if headers not sent
      if (!res.headersSent) {
        return this.sendStreamError(res, 500, 'Internal server error', {
          type: 'api_error',
          requestId: requestId
        });
      }
      
      return null;
    }
  }

  /**
   * Process count tokens
   */
  async processCountTokens(req, res) {
    try {
      this.logger.info(`[GeminiRoutes] Processing count tokens request`);
      
      const result = await this.requestHandler.processGeminiCountTokensEnhanced(req, res);
      
      return result;
      
    } catch (error) {
      this.logger.error(`[GeminiRoutes] Token counting failed: ${error.message}`);
      return this.sendError(res, 500, 'Internal server error');
    }
  }

  /**
   * Process file upload
   */
  async processFileUpload(req, res) {
    try {
      this.logger.info(`[GeminiRoutes] Processing file upload request`);
      
      // Check file size limit
      const maxFileSize = this.config.get('proxy.maxFileSize') || 50 * 1024 * 1024; // 50MB
      
      const result = await this.requestHandler.processGeminiFileUploadEnhanced(req, res, {
        maxFileSize: maxFileSize
      });
      
      return result;
      
    } catch (error) {
      this.logger.error(`[GeminiRoutes] File upload failed: ${error.message}`);
      return this.sendError(res, 500, 'File upload failed');
    }
  }

  /**
   * Health check endpoint
   */
  async healthCheck(req, res) {
    try {
      const stats = this.requestHandler.getEnhancedStats();
      const isHealthy = stats.requests.failedRequests === 0;
      
      res.json({
        status: isHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        stats: {
          total_requests: stats.requests.totalRequests,
          avg_response_time: Math.round(stats.requests.avgProcessingTime),
          uptime: this.getUptime()
        }
      });
      
    } catch (error) {
      this.logger.error(`[GeminiRoutes] Health check failed: ${error.message}`);
      return this.sendError(res, 500, 'Health check failed');
    }
  }

  /**
   * Send error response with Gemini format
   */
  sendError(res, status, message, details = {}) {
    res.status(status).json({
      error: {
        code: status,
        message: message,
        status: this.getGeminiStatus(status),
        type: details.type || 'api_error',
        details: details
      }
    });
  }

  /**
   * Send stream error in SSE format
   */
  sendStreamError(res, status, message, details = {}) {
    res.write(`data: ${JSON.stringify({
      error: {
        code: status,
        message: message,
        status: this.getGeminiStatus(status),
        type: details.type || 'api_error'
      }
    })}\n\n`);
    
    res.end();
  }

  /**
   * Get Gemini status from HTTP status code
   */
  getGeminiStatus(status) {
    const statusMap = {
      400: 'INVALID_ARGUMENT',
      401: 'UNAUTHENTICATED',
      403: 'PERMISSION_DENIED',
      404: 'NOT_FOUND',
      429: 'RESOURCE_EXHAUSTED',
      500: 'INTERNAL',
      503: 'UNAVAILABLE'
    };
    
    return statusMap[status] || 'INTERNAL';
  }

  /**
   * Generate request ID
   */
  generateRequestId() {
    return `gemini_req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get uptime in seconds
   */
  getUptime() {
    const startTime = this.requestHandler.serverSystem?.startTime || Date.now();
    return Math.floor((Date.now() - startTime) / 1000);
  }

  /**
   * Get router instance
   */
  getRouter() {
    return this.router;
  }
}

module.exports = GeminiRoutes;
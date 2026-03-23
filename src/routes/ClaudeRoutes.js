/**
 * ClaudeRoutes Module
 * Claude-compatible API routes with enhanced features
 * 
 * Author: miaoge2026
 * Version: 2.0.0
 */

const express = require('express');
const RateLimit = require('express-rate-limit');

class ClaudeRoutes {
  constructor(requestHandler, config, logger) {
    this.requestHandler = requestHandler;
    this.config = config;
    this.logger = logger;
    
    this.router = express.Router();
    this.initializeRoutes();
  }

  /**
   * Initialize Claude routes
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
      
      this.router.use('/v1', limiter);
      this.logger.info('[ClaudeRoutes] Rate limiting enabled');
    }

    // Apply API key authentication if enabled
    if (this.config.get('security.apiKeyAuth')) {
      this.router.use('/v1', this.apiKeyAuthMiddleware.bind(this));
      this.logger.info('[ClaudeRoutes] API key authentication enabled');
    }

    // Claude API routes
    this.router.post('/v1/messages', 
      this.processClaudeRequest.bind(this)
    );
    
    this.router.post('/v1/messages/count_tokens', 
      this.processClaudeCountTokens.bind(this)
    );

    // Health check endpoint
    this.router.get('/v1/health', 
      this.healthCheck.bind(this)
    );

    this.logger.info('[ClaudeRoutes] Routes initialized');
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
    
    this.logger.warn(`[ClaudeRoutes] Invalid API key attempt from ${req.ip}`);
    return res.status(401).json({
      error: {
        code: 401,
        message: 'Invalid API key',
        type: 'authentication_error'
      }
    });
  }

  /**
   * Process Claude messages
   */
  async processClaudeRequest(req, res) {
    const startTime = Date.now();
    const requestId = this.generateRequestId();
    
    try {
      this.logger.info(`[ClaudeRoutes] Processing Claude request ${requestId}`);
      
      // Set request timeout
      req.setTimeout(this.config.get('proxy.requestTimeout') || 300000);
      
      // Add request metadata
      req.requestId = requestId;
      req.startTime = startTime;
      
      // Process with enhanced handler
      const result = await this.requestHandler.processClaudeRequestEnhanced(req, res);
      
      // Log performance
      const duration = Date.now() - startTime;
      this.logger.info(`[ClaudeRoutes] Request ${requestId} completed in ${duration}ms`);
      
      return result;
      
    } catch (error) {
      this.logger.error(`[ClaudeRoutes] Request ${requestId} failed: ${error.message}`);
      return this.sendError(res, 500, 'Internal server error', {
        type: 'api_error',
        requestId: requestId
      });
    }
  }

  /**
   * Process Claude count tokens
   */
  async processClaudeCountTokens(req, res) {
    try {
      this.logger.info(`[ClaudeRoutes] Processing Claude count tokens request`);
      
      const result = await this.requestHandler.processClaudeCountTokensEnhanced(req, res);
      
      return result;
      
    } catch (error) {
      this.logger.error(`[ClaudeRoutes] Token counting failed: ${error.message}`);
      return this.sendError(res, 500, 'Internal server error');
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
      this.logger.error(`[ClaudeRoutes] Health check failed: ${error.message}`);
      return this.sendError(res, 500, 'Health check failed');
    }
  }

  /**
   * Send error response with Claude format
   */
  sendError(res, status, message, details = {}) {
    const errorType = this.getClaudeErrorType(status);
    
    res.status(status).json({
      type: 'error',
      error: {
        type: errorType,
        message: message,
        details: details
      }
    });
  }

  /**
   * Get Claude error type from status code
   */
  getClaudeErrorType(status) {
    const errorTypes = {
      400: 'invalid_request_error',
      401: 'authentication_error',
      403: 'permission_error',
      404: 'not_found_error',
      429: 'rate_limit_error',
      500: 'api_error',
      503: 'overloaded_error'
    };
    
    return errorTypes[status] || 'api_error';
  }

  /**
   * Generate request ID
   */
  generateRequestId() {
    return `claude_req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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

module.exports = ClaudeRoutes;
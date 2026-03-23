/**
 * OpenAIRoutes Module
 * OpenAI-compatible API routes with enhanced features
 * 
 * Author: miaoge2026
 * Version: 2.0.0
 */

const express = require('express');
const RateLimit = require('express-rate-limit');

class OpenAIRoutes {
  constructor(requestHandler, config, logger) {
    this.requestHandler = requestHandler;
    this.config = config;
    this.logger = logger;
    
    this.router = express.Router();
    this.initializeRoutes();
  }

  /**
   * Initialize OpenAI routes
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
      this.logger.info('[OpenAIRoutes] Rate limiting enabled');
    }

    // Apply API key authentication if enabled
    if (this.config.get('security.apiKeyAuth')) {
      this.router.use('/v1', this.apiKeyAuthMiddleware.bind(this));
      this.logger.info('[OpenAIRoutes] API key authentication enabled');
    }

    // OpenAI API routes
    this.router.post('/v1/chat/completions', 
      this.processOpenAIRequest.bind(this)
    );
    
    this.router.post('/v1/completions', 
      this.processOpenAICompletion.bind(this)
    );
    
    this.router.get('/v1/models', 
      this.listModels.bind(this)
    );
    
    this.router.get('/v1/models/:model', 
      this.getModel.bind(this)
    );
    
    // OpenAI Response API (beta)
    this.router.post('/v1/responses', 
      this.processOpenAIResponse.bind(this)
    );
    
    this.router.post('/v1/responses/input_tokens', 
      this.processOpenAIResponseInputTokens.bind(this)
    );

    // Health check endpoint
    this.router.get('/v1/health', 
      this.healthCheck.bind(this)
    );

    this.logger.info('[OpenAIRoutes] Routes initialized');
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
    
    this.logger.warn(`[OpenAIRoutes] Invalid API key attempt from ${req.ip}`);
    return res.status(401).json({
      error: {
        code: 401,
        message: 'Invalid API key',
        type: 'authentication_error'
      }
    });
  }

  /**
   * Process OpenAI chat completions
   */
  async processOpenAIRequest(req, res) {
    const startTime = Date.now();
    const requestId = this.generateRequestId();
    
    try {
      this.logger.info(`[OpenAIRoutes] Processing OpenAI request ${requestId}`);
      
      // Set request timeout
      req.setTimeout(this.config.get('proxy.requestTimeout') || 300000);
      
      // Add request metadata
      req.requestId = requestId;
      req.startTime = startTime;
      
      // Process with enhanced handler
      const result = await this.requestHandler.processOpenAIRequestEnhanced(req, res);
      
      // Log performance
      const duration = Date.now() - startTime;
      this.logger.info(`[OpenAIRoutes] Request ${requestId} completed in ${duration}ms`);
      
      return result;
      
    } catch (error) {
      this.logger.error(`[OpenAIRoutes] Request ${requestId} failed: ${error.message}`);
      return this.sendError(res, 500, 'Internal server error', {
        type: 'api_error',
        requestId: requestId
      });
    }
  }

  /**
   * Process OpenAI completions (legacy)
   */
  async processOpenAICompletion(req, res) {
    try {
      // Convert to chat format
      const chatRequest = {
        ...req.body,
        messages: [
          { role: 'user', content: req.body.prompt }
        ]
      };
      
      // Forward to chat completions
      req.body = chatRequest;
      return this.processOpenAIRequest(req, res);
      
    } catch (error) {
      this.logger.error(`[OpenAIRoutes] Completion processing failed: ${error.message}`);
      return this.sendError(res, 500, 'Internal server error');
    }
  }

  /**
   * Process OpenAI Response API (beta)
   */
  async processOpenAIResponse(req, res) {
    try {
      this.logger.info(`[OpenAIRoutes] Processing OpenAI Response API request`);
      
      // Add response API flag
      req.isResponseAPI = true;
      
      return this.processOpenAIRequest(req, res);
      
    } catch (error) {
      this.logger.error(`[OpenAIRoutes] Response API processing failed: ${error.message}`);
      return this.sendError(res, 500, 'Internal server error');
    }
  }

  /**
   * Process OpenAI Response API input tokens
   */
  async processOpenAIResponseInputTokens(req, res) {
    try {
      this.logger.info(`[OpenAIRoutes] Processing OpenAI Response API input tokens`);
      
      const result = await this.requestHandler.processOpenAIResponseInputTokens(req, res);
      
      return result;
      
    } catch (error) {
      this.logger.error(`[OpenAIRoutes] Input tokens processing failed: ${error.message}`);
      return this.sendError(res, 500, 'Internal server error');
    }
  }

  /**
   * List available models
   */
  async listModels(req, res) {
    try {
      const models = await this.requestHandler.modelManager.getAllModels();
      
      // Filter enabled models
      const enabledModels = models.filter(m => m.enabled);
      
      res.json({
        object: 'list',
        data: enabledModels.map(model => ({
          id: model.name,
          object: 'model',
          created: Math.floor(Date.now() / 1000),
          owned_by: model.provider
        }))
      });
      
    } catch (error) {
      this.logger.error(`[OpenAIRoutes] Model listing failed: ${error.message}`);
      return this.sendError(res, 500, 'Failed to list models');
    }
  }

  /**
   * Get model details
   */
  async getModel(req, res) {
    try {
      const modelName = req.params.model;
      const model = await this.requestHandler.modelManager.getModel(modelName);
      
      if (!model) {
        return this.sendError(res, 404, 'Model not found');
      }
      
      if (!model.enabled) {
        return this.sendError(res, 403, 'Model is disabled');
      }
      
      res.json({
        id: model.name,
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: model.provider,
        capabilities: model.capabilities,
        max_tokens: model.maxTokens,
        cost_per_1k: model.costPer1K,
        metadata: model.metadata
      });
      
    } catch (error) {
      this.logger.error(`[OpenAIRoutes] Model retrieval failed: ${error.message}`);
      return this.sendError(res, 500, 'Failed to retrieve model');
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
      this.logger.error(`[OpenAIRoutes] Health check failed: ${error.message}`);
      return this.sendError(res, 500, 'Health check failed');
    }
  }

  /**
   * Send error response
   */
  sendError(res, status, message, details = {}) {
    res.status(status).json({
      error: {
        code: status,
        message: message,
        type: details.type || 'api_error',
        details: details
      }
    });
  }

  /**
   * Generate request ID
   */
  generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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

module.exports = OpenAIRoutes;
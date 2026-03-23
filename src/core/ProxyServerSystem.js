/**
 * File: src/core/ProxyServerSystem.js
 * Description: Enhanced server system with load balancing, caching, and model management
 *
 * Author: miaoge2026 (重构)
 * Version: 2.0.0
 */

const { EventEmitter } = require("events");
const express = require("express");
const WebSocket = require("ws");
const http = require("http");
const https = require("https");
const fs = require("fs");
const net = require("net");
const { URL } = require("url");

const LoggingService = require("../utils/LoggingService");
const AuthSource = require("../auth/AuthSource");
const BrowserManager = require("./BrowserManager");
const ConnectionRegistry = require("./ConnectionRegistry");
const RequestHandler = require("./RequestHandler");
const ConfigManager = require("../utils/ConfigManager");
const LoadBalancer = require("./LoadBalancer");
const CacheManager = require("../utils/CacheManager");
const ModelManager = require("../models/ModelManager");

/**
 * Enhanced Proxy Server System
 * Main server system class that integrates all modules including load balancing, caching, and model management
 */
class ProxyServerSystem extends EventEmitter {
    constructor(config) {
        super();
        
        // Initialize enhanced configuration
        this.config = config || new ConfigManager(LoggingService.getLogger());
        this.logger = LoggingService.getLogger();
        
        // Enhanced system components
        this.authSource = new AuthSource(this.logger);
        this.browserManager = new BrowserManager(this.logger, this.config, this.authSource);
        this.loadBalancer = new LoadBalancer(this.logger, this.config);
        this.cacheManager = new CacheManager(this.logger, this.config);
        this.modelManager = new ModelManager(this.logger, this.config);
        
        // Connection management
        this.connectionRegistry = new ConnectionRegistry(
            this.logger,
            async authIndex => {
                if (this.browserManager.isClosingIntentionally) {
                    this.logger.info("[System] Browser is closing intentionally, skipping reconnect attempt.");
                    return;
                }
                
                const currentAuthIndex = this.browserManager.currentAuthIndex;
                const isCurrentAccount = authIndex === currentAuthIndex;
                
                if (isCurrentAccount && this.requestHandler?.isSystemBusy) {
                    this.logger.info(
                        `[System] Current account #${authIndex} is busy, skipping lightweight reconnect attempt.`
                    );
                    return;
                }
                
                const contextData = this.browserManager.contexts.get(authIndex);
                if (!contextData || !contextData.page || contextData.page.isClosed()) {
                    this.logger.info(
                        `[System] Account #${authIndex} page not available, skipping lightweight reconnect.`
                    );
                    return;
                }
                
                if (this.browserManager.browser) {
                    this.logger.error(
                        `[System] WebSocket lost for account #${authIndex}, attempting lightweight reconnect...`
                    );
                    const success = await this.browserManager.attemptLightweightReconnect(authIndex);
                    if (!success) {
                        this.logger.warn(
                            `[System] Lightweight reconnect failed for account #${authIndex}.`
                        );
                    }
                }
            },
            () => this.browserManager.currentAuthIndex,
            this.browserManager
        );
        
        this.browserManager.setConnectionRegistry(this.connectionRegistry);
        
        // Enhanced request handler
        this.requestHandler = new RequestHandler(
            this,
            this.connectionRegistry,
            this.logger,
            this.browserManager,
            this.config,
            this.authSource,
            this.loadBalancer,
            this.cacheManager,
            this.modelManager
        );
        
        // HTTP/WebSocket servers
        this.httpServer = null;
        this.wsServer = null;
        
        // Enhanced statistics
        this.requestStats = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            totalProcessingTime: 0,
            avgProcessingTime: 0
        };
        
        this.started = false;
        this.startTime = Date.now();
        this.streamingMode = this.config.get('proxy.streamingMode') || 'real';
        
        this.logger.info('[ProxyServerSystem] Enhanced proxy server system initialized');
    }

    /**
     * Start the enhanced proxy server system
     */
    async start(initialAuthIndex = null) {
        this.logger.info("[System] Starting enhanced flexible startup process...");
        
        try {
            // Start HTTP and WebSocket servers
            await this._startHttpServer();
            await this._startWebSocketServer();
            
            // Initialize enhanced features
            await this._initializeEnhancedFeatures();
            
            // Initialize model manager
            await this.modelManager.initializeModels();
            
            // Initialize load balancer
            this.loadBalancer.initializeStats();
            
            // Context pool startup with enhanced logic
            await this._startEnhancedContextPool(initialAuthIndex);
            
            this.started = true;
            this.emit("started");
            
            this.logger.info(`[System] Enhanced proxy server system startup complete.`);
            
        } catch (error) {
            this.logger.error(`[System] Startup failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Initialize enhanced features
     */
    async _initializeEnhancedFeatures() {
        // Setup cache for different purposes
        this.cacheManager.createCache('models', { ttl: 300, maxSize: 100 });
        this.cacheManager.createCache('responses', { ttl: 60, maxSize: 1000 });
        this.cacheManager.createCache('auth', { ttl: 600, maxSize: 50 });
        
        // Setup load balancer events
        this.setupLoadBalancerEvents();
        
        // Setup model manager events
        this.setupModelManagerEvents();
        
        // Setup cache events
        this.setupCacheEvents();
        
        // Setup performance monitoring
        this.setupPerformanceMonitoring();
        
        this.logger.info('[System] Enhanced features initialized');
    }

    /**
     * Setup load balancer event handlers
     */
    setupLoadBalancerEvents() {
        this.loadBalancer.on('accountUnhealthy', (accountIndex) => {
            this.logger.warn(`[System] Account #${accountIndex} marked as unhealthy`);
            this.handleAccountHealthChange(accountIndex, false);
        });
        
        this.loadBalancer.on('accountHealthy', (accountIndex) => {
            this.logger.info(`[System] Account #${accountIndex} is healthy again`);
            this.handleAccountHealthChange(accountIndex, true);
        });
        
        this.logger.info('[System] Load balancer events configured');
    }

    /**
     * Setup model manager event handlers
     */
    setupModelManagerEvents() {
        this.modelManager.on('modelStatsUpdated', (modelName, stats) => {
            this.emit('modelStatsUpdated', modelName, stats);
            
            // Update cache with model stats
            const cacheKey = `model_stats_${modelName}`;
            this.cacheManager.set(cacheKey, stats, 60, 'models');
        });
        
        this.modelManager.on('modelRegistered', (modelName, modelConfig) => {
            this.logger.info(`[System] Model registered: ${modelName}`);
            this.emit('modelRegistered', modelName, modelConfig);
        });
        
        this.logger.info('[System] Model manager events configured');
    }

    /**
     * Setup cache event handlers
     */
    setupCacheEvents() {
        this.cacheManager.on('cacheExpired', (data) => {
            this.logger.debug(`[System] Cache expired: ${data.cache} - ${data.key}`);
        });
        
        this.cacheManager.on('cacheSet', (data) => {
            this.logger.debug(`[System] Cache set: ${data.cache} - ${data.key}`);
        });
        
        this.logger.info('[System] Cache events configured');
    }

    /**
     * Setup performance monitoring
     */
    setupPerformanceMonitoring() {
        // Performance metrics
        this.performanceMetrics = {
            startTime: Date.now(),
            requestCount: 0,
            errorCount: 0,
            cacheHitRate: 0,
            avgResponseTime: 0
        };
        
        // Stale queue cleanup interval
        this.staleQueueCleanupInterval = setInterval(() => {
            try {
                this.connectionRegistry.cleanupStaleQueues(600000); // 10 minutes
            } catch (error) {
                this.logger.error(`[System] Error during stale queue cleanup: ${error.message}`);
            }
        }, 300000); // Every 5 minutes
        
        this.logger.info('[System] Performance monitoring initialized');
    }

    /**
     * Enhanced context pool startup
     */
    async _startEnhancedContextPool(initialAuthIndex) {
        const allAvailableIndices = this.authSource.availableIndices;
        const allRotationIndices = this.authSource.getRotationIndices();
        
        if (allAvailableIndices.length === 0) {
            this.logger.warn("[System] No available authentication source. Starting in account binding mode.");
            return;
        }
        
        // Determine startup order with enhanced logic
        let startupOrder = allRotationIndices.length > 0 ? [...allRotationIndices] : [...allAvailableIndices];
        
        if (Number.isInteger(initialAuthIndex)) {
            const canonicalInitialIndex = this.authSource.getCanonicalIndex(initialAuthIndex);
            if (canonicalInitialIndex !== null && startupOrder.includes(canonicalInitialIndex)) {
                if (canonicalInitialIndex !== initialAuthIndex) {
                    this.logger.warn(
                        `[System] Specified startup index #${initialAuthIndex} is a duplicate, using latest auth index #${canonicalInitialIndex} instead.`
                    );
                }
                startupOrder = [canonicalInitialIndex, ...startupOrder.filter(i => i !== canonicalInitialIndex)];
            }
        }
        
        // Start context pool with enhanced monitoring
        const maxContexts = this.config.get('proxy.maxContexts') || 3;
        this.logger.info(`[System] Starting enhanced context pool (maxContexts=${maxContexts})...`);
        
        try {
            this.requestHandler.authSwitcher.isSystemBusy = true;
            const { firstReady } = await this.browserManager.preloadContextPool(startupOrder, maxContexts);
            
            if (firstReady === null) {
                this.logger.error("[System] Failed to initialize any context!");
                return;
            }
            
            // Register account with load balancer
            this.loadBalancer.addAccount(firstReady);
            
            // Activate first ready context
            await this.browserManager.launchOrSwitchContext(firstReady);
            this.logger.info(`[System] ✅ Successfully activated account #${firstReady}!`);
            
            // Register all available accounts with load balancer
            startupOrder.forEach(index => {
                if (index !== firstReady) {
                    this.loadBalancer.addAccount(index);
                }
            });
            
        } catch (error) {
            this.logger.error(`[System] Enhanced context pool startup failed: ${error.message}`);
            throw error;
        } finally {
            this.requestHandler.authSwitcher.isSystemBusy = false;
        }
    }

    /**
     * Create enhanced Express app
     */
    _createExpressApp() {
        const app = express();
        
        // Enhanced security middleware
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
        
        // Enhanced CORS
        app.use(cors({
            origin: this.config.get('security.allowedOrigins') || ['*'],
            credentials: true,
            methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Forwarded-For'],
            exposedHeaders: ['X-Cache-Hit', 'X-Model-Used', 'X-Account-Index', 'X-Response-Time']
        }));
        
        // Enhanced body parsing
        app.use(express.json({ 
            limit: this.config.get('proxy.maxRequestBodySize') || '50mb',
            verify: (req, res, buf) => {
                req.rawBody = buf;
            }
        }));
        
        app.use(express.urlencoded({ 
            extended: true, 
            limit: this.config.get('proxy.maxRequestBodySize') || '50mb' 
        }));
        
        // Request logging
        app.use((req, res, next) => {
            if (!req.path.match(/^\/(health|metrics|favicon\.ico|locales|assets)/)) {
                this.logger.info(`[Entrypoint] ${req.method} ${req.path} - ${req.ip}`);
            }
            next();
        });
        
        return app;
    }

    /**
     * Enhanced HTTP server startup
     */
    async _startHttpServer() {
        const app = this._createExpressApp();
        
        // SSL configuration
        if (this.config.get('server.sslKeyPath') && this.config.get('server.sslCertPath')) {
            try {
                if (fs.existsSync(this.config.get('server.sslKeyPath')) && 
                    fs.existsSync(this.config.get('server.sslCertPath'))) {
                    const options = {
                        cert: fs.readFileSync(this.config.get('server.sslCertPath')),
                        key: fs.readFileSync(this.config.get('server.sslKeyPath'))
                    };
                    this.httpServer = https.createServer(options, app);
                    this.logger.info("[System] Starting in HTTPS mode...");
                } else {
                    this.httpServer = http.createServer(app);
                }
            } catch (error) {
                this.logger.error(`[System] Failed to load SSL files: ${error.message}. Falling back to HTTP.`);
                this.httpServer = http.createServer(app);
            }
        } else {
            this.httpServer = http.createServer(app);
        }
        
        // Server timeout configuration
        this.httpServer.keepAliveTimeout = this.config.get('proxy.keepAliveTimeout') || 120000;
        this.httpServer.headersTimeout = this.config.get('proxy.headersTimeout') || 125000;
        this.httpServer.requestTimeout = this.config.get('proxy.requestTimeout') || 120000;
        
        return new Promise(resolve => {
            const port = this.config.get('server.port') || 3000;
            const host = this.config.get('server.host') || '0.0.0.0';
            
            this.httpServer.listen(port, host, () => {
                this.logger.info(`[System] HTTP server listening on http://${host}:${port}`);
                this.logger.info(`[System] Keep-Alive timeout: ${this.httpServer.keepAliveTimeout / 1000}s`);
                resolve();
            });
        });
    }

    /**
     * Enhanced WebSocket server startup
     */
    async _startWebSocketServer() {
        return new Promise((resolve, reject) => {
            let isListening = false;
            
            this.wsServer = new WebSocket.Server({
                host: this.config.get('server.host') || '0.0.0.0',
                port: this.config.get('server.wsPort') || 3001
            });
            
            this.wsServer.once("listening", () => {
                isListening = true;
                const host = this.config.get('server.host') || '0.0.0.0';
                const port = this.config.get('server.wsPort') || 3001;
                this.logger.info(`[System] WebSocket server listening on ws://${host}:${port}`);
                resolve();
            });
            
            this.wsServer.on("error", err => {
                if (!isListening) {
                    this.logger.error(`[System] WebSocket server failed to start: ${err.message}`);
                    reject(err);
                }
            });
            
            this.wsServer.on("connection", (ws, req) => {
                const url = new URL(req.url, `http://${req.headers.host}`);
                const authIndexParam = url.searchParams.get("authIndex");
                const authIndex = authIndexParam !== null ? parseInt(authIndexParam, 10) : -1;
                
                if (Number.isNaN(authIndex) || authIndex < 0) {
                    this.logger.error(`[System] Rejecting WebSocket with invalid authIndex: ${authIndexParam}`);
                    this._safeCloseWebSocket(ws, 1008, "Invalid authIndex");
                    return;
                }
                
                this.connectionRegistry.addConnection(ws, {
                    address: req.socket.remoteAddress,
                    authIndex,
                });
                
                // Update load balancer stats
                this.loadBalancer.updateAccountStats(authIndex, true, 0);
            });
        });
    }

    /**
     * Safely close WebSocket connection
     */
    _safeCloseWebSocket(ws, code, reason) {
        if (!ws) return;
        
        if (ws.readyState === 0 || ws.readyState === 1) {
            try {
                ws.close(code, reason);
            } catch (error) {
                this.logger.warn(`[System] Failed to close WebSocket: ${error.message}`);
            }
        }
    }

    /**
     * Handle account health change
     */
    handleAccountHealthChange(accountIndex, isHealthy) {
        if (isHealthy) {
            this.loadBalancer.resetAccount(accountIndex);
        }
        
        this.emit('accountHealthChanged', accountIndex, isHealthy);
    }

    /**
     * Update request statistics
     */
    updateRequestStats(success, processingTime) {
        this.requestStats.totalRequests++;
        this.requestStats.totalProcessingTime += processingTime;
        this.requestStats.avgProcessingTime = 
            this.requestStats.totalProcessingTime / this.requestStats.totalRequests;
        
        if (success) {
            this.requestStats.successfulRequests++;
        } else {
            this.requestStats.failedRequests++;
        }
        
        this.emit('requestStatsUpdated', { ...this.requestStats });
    }

    /**
     * Graceful shutdown
     */
    async shutdown() {
        this.logger.info("[System] Shutting down enhanced server system...");
        
        // Clear intervals
        if (this.staleQueueCleanupInterval) {
            clearInterval(this.staleQueueCleanupInterval);
            this.staleQueueCleanupInterval = null;
        }
        
        // Close all connections
        if (this.connectionRegistry) {
            this.connectionRegistry.closeAllMessageQueues();
        }
        
        // Close browser
        if (this.browserManager) {
            await this.browserManager.closeBrowser();
        }
        
        // Close servers
        const closeServer = (server, name) =>
            new Promise(resolve => {
                if (!server) return resolve();
                
                try {
                    server.close(() => {
                        this.logger.info(`[System] ${name} closed`);
                        resolve();
                    });
                } catch (error) {
                    this.logger.warn(`[System] Error closing ${name}: ${error.message}`);
                    resolve();
                }
            });
        
        await Promise.all([
            closeServer(this.wsServer, "WebSocket server"),
            closeServer(this.httpServer, "HTTP server"),
        ]);
        
        // Clear cache
        if (this.cacheManager) {
            this.cacheManager.destroy();
        }
        
        this.logger.info("[System] Enhanced shutdown complete");
    }

    /**
     * Get system statistics
     */
    getStats() {
        return {
            uptime: Date.now() - this.startTime,
            requests: this.requestStats,
            models: this.modelManager?.getAllModelStats() || {},
            loadBalancer: this.loadBalancer?.getAllAccountStats() || {},
            cache: this.cacheManager?.getAllStats() || {}
        };
    }
}

module.exports = ProxyServerSystem;
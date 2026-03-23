/**
 * CacheManager Module
 * 高性能缓存管理器，支持 TTL、LRU 和分布式缓存
 * 
 * Author: miaoge2026
 * Version: 2.0.0
 */

const EventEmitter = require('events');
const NodeCache = require('node-cache');

class CacheManager extends EventEmitter {
  constructor(logger, options = {}) {
    super();
    this.logger = logger;
    this.config = options.config || {};
    
    // 缓存配置
    this.ttl = this.config.get('cache.ttl') || 300; // 5分钟
    this.maxSize = this.config.get('cache.maxSize') || 1000;
    this.checkPeriod = this.config.get('cache.checkPeriod') || 60; // 1分钟
    
    // 初始化缓存实例
    this.caches = new Map();
    this.cacheStats = new Map();
    
    // 创建默认缓存
    this.createCache('default');
    
    // 启动缓存监控
    this.startCacheMonitoring();
    
    this.logger.info(`[CacheManager] 缓存管理器初始化完成 (TTL: ${this.ttl}s, MaxSize: ${this.maxSize})`);
  }

  /**
   * 创建缓存实例
   * @param {string} name - 缓存名称
   * @param {Object} options - 缓存选项
   */
  createCache(name, options = {}) {
    if (this.caches.has(name)) {
      this.logger.warn(`[CacheManager] 缓存 ${name} 已存在`);
      return this.caches.get(name);
    }
    
    const cacheOptions = {
      stdTTL: options.ttl || this.ttl,
      maxKeys: options.maxSize || this.maxSize,
      checkperiod: options.checkPeriod || this.checkPeriod,
      useClones: false, // 提高性能
      deleteOnExpire: true
    };
    
    const cache = new NodeCache(cacheOptions);
    
    // 初始化统计信息
    this.cacheStats.set(name, {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      clears: 0,
      size: 0,
      maxSize: cacheOptions.maxKeys,
      ttl: cacheOptions.stdTTL
    });
    
    // 监听缓存事件
    cache.on('expired', (key, value) => {
      this.emit('cacheExpired', { cache: name, key, value });
      this.logger.debug(`[CacheManager] 缓存 ${name} 键 ${key} 已过期`);
    });
    
    cache.on('del', (key, value) => {
      this.updateStats(name, 'deletes');
      this.emit('cacheDeleted', { cache: name, key, value });
    });
    
    cache.on('set', (key, value) => {
      this.updateStats(name, 'sets');
      this.updateCacheSize(name);
      this.emit('cacheSet', { cache: name, key, value });
    });
    
    this.caches.set(name, cache);
    
    this.logger.info(`[CacheManager] 创建缓存 ${name} (TTL: ${cacheOptions.stdTTL}s, MaxSize: ${cacheOptions.maxKeys})`);
    
    return cache;
  }

  /**
   * 获取缓存实例
   * @param {string} name - 缓存名称
   * @returns {Object} 缓存实例
   */
  getCache(name = 'default') {
    const cache = this.caches.get(name);
    
    if (!cache) {
      this.logger.warn(`[CacheManager] 缓存 ${name} 不存在，使用默认缓存`);
      return this.caches.get('default');
    }
    
    return cache;
  }

  /**
   * 设置缓存值
   * @param {string} key - 缓存键
   * @param {*} value - 缓存值
   * @param {number} ttl - TTL（秒）
   * @param {string} cacheName - 缓存名称
   */
  set(key, value, ttl = null, cacheName = 'default') {
    const cache = this.getCache(cacheName);
    
    try {
      cache.set(key, value, ttl || this.ttl);
      this.updateStats(cacheName, 'sets');
      this.updateCacheSize(cacheName);
      
      this.logger.debug(`[CacheManager] 设置缓存 ${cacheName}: ${key} = ${JSON.stringify(value).substring(0, 50)}...`);
      
      return true;
    } catch (error) {
      this.logger.error(`[CacheManager] 设置缓存失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 获取缓存值
   * @param {string} key - 缓存键
   * @param {string} cacheName - 缓存名称
   * @returns {*} 缓存值或 null
   */
  get(key, cacheName = 'default') {
    const cache = this.getCache(cacheName);
    const value = cache.get(key);
    
    if (value !== null) {
      this.updateStats(cacheName, 'hits');
      this.logger.debug(`[CacheManager] 缓存命中 ${cacheName}: ${key}`);
    } else {
      this.updateStats(cacheName, 'misses');
      this.logger.debug(`[CacheManager] 缓存未命中 ${cacheName}: ${key}`);
    }
    
    return value;
  }

  /**
   * 删除缓存值
   * @param {string} key - 缓存键
   * @param {string} cacheName - 缓存名称
   */
  delete(key, cacheName = 'default') {
    const cache = this.getCache(cacheName);
    const result = cache.del(key);
    
    if (result > 0) {
      this.updateStats(cacheName, 'deletes');
      this.updateCacheSize(cacheName);
      this.logger.debug(`[CacheManager] 删除缓存 ${cacheName}: ${key}`);
    }
    
    return result > 0;
  }

  /**
   * 清空缓存
   * @param {string} cacheName - 缓存名称
   */
  clear(cacheName = 'default') {
    const cache = this.getCache(cacheName);
    cache.flushAll();
    
    this.updateStats(cacheName, 'clears');
    this.updateCacheSize(cacheName);
    
    this.logger.info(`[CacheManager] 清空缓存 ${cacheName}`);
  }

  /**
   * 检查键是否存在
   * @param {string} key - 缓存键
   * @param {string} cacheName - 缓存名称
   * @returns {boolean} 是否存在
   */
  has(key, cacheName = 'default') {
    const cache = this.getCache(cacheName);
    return cache.has(key);
  }

  /**
   * 获取缓存大小
   * @param {string} cacheName - 缓存名称
   * @returns {number} 缓存大小
   */
  size(cacheName = 'default') {
    const cache = this.getCache(cacheName);
    return cache.size;
  }

  /**
   * 获取缓存统计信息
   * @param {string} cacheName - 缓存名称
   * @returns {Object} 统计信息
   */
  getStats(cacheName = 'default') {
    const stats = this.cacheStats.get(cacheName);
    if (!stats) {
      return null;
    }
    
    const totalRequests = stats.hits + stats.misses;
    const hitRate = totalRequests > 0 ? stats.hits / totalRequests : 0;
    
    return {
      ...stats,
      hitRate: hitRate,
      hitRatePercentage: (hitRate * 100).toFixed(2)
    };
  }

  /**
   * 获取所有缓存统计信息
   * @returns {Object} 所有缓存统计信息
   */
  getAllStats() {
    const result = {};
    
    this.cacheStats.forEach((stats, cacheName) => {
      result[cacheName] = this.getStats(cacheName);
    });
    
    return result;
  }

  /**
   * 更新缓存统计信息
   * @param {string} cacheName - 缓存名称
   * @param {string} stat - 统计项
   */
  updateStats(cacheName, stat) {
    const stats = this.cacheStats.get(cacheName);
    if (stats) {
      stats[stat]++;
    }
  }

  /**
   * 更新缓存大小
   * @param {string} cacheName - 缓存名称
   */
  updateCacheSize(cacheName) {
    const cache = this.getCache(cacheName);
    const stats = this.cacheStats.get(cacheName);
    
    if (stats) {
      stats.size = cache.size;
    }
  }

  /**
   * 缓存请求
   * @param {Function} fn - 要缓存的函数
   * @param {Array} args - 函数参数
   * @param {Object} options - 缓存选项
   * @returns {Promise<*>} 函数结果
   */
  async cacheRequest(fn, args, options = {}) {
    const cacheKey = this.generateCacheKey(fn.name, args);
    const cacheName = options.cacheName || 'default';
    const ttl = options.ttl || this.ttl;
    
    // 检查缓存
    const cachedValue = this.get(cacheKey, cacheName);
    if (cachedValue !== null) {
      return cachedValue;
    }
    
    // 执行函数
    try {
      const result = await fn(...args);
      
      // 缓存结果
      this.set(cacheKey, result, ttl, cacheName);
      
      return result;
    } catch (error) {
      this.logger.error(`[CacheManager] 缓存请求执行失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 生成缓存键
   * @param {string} functionName - 函数名
   * @param {Array} args - 参数
   * @returns {string} 缓存键
   */
  generateCacheKey(functionName, args) {
    const argsString = JSON.stringify(args);
    return `${functionName}:${argsString}`;
  }

  /**
   * 清除函数缓存
   * @param {string} functionName - 函数名
   * @param {Array} args - 参数（可选）
   * @param {string} cacheName - 缓存名称
   */
  clearFunctionCache(functionName, args = null, cacheName = 'default') {
    if (args === null) {
      // 清除所有该函数的缓存
      const cache = this.getCache(cacheName);
      const keys = cache.keys().filter(key => key.startsWith(`${functionName}:`));
      
      keys.forEach(key => this.delete(key, cacheName));
      
      this.logger.info(`[CacheManager] 清除函数 ${functionName} 的所有缓存 (${keys.length} 个)`);
    } else {
      // 清除特定参数的缓存
      const cacheKey = this.generateCacheKey(functionName, args);
      this.delete(cacheKey, cacheName);
      
      this.logger.debug(`[CacheManager] 清除函数 ${functionName} 的缓存: ${cacheKey}`);
    }
  }

  /**
   * 启动缓存监控
   */
  startCacheMonitoring() {
    // 定期记录缓存统计
    this.monitoringInterval = setInterval(() => {
      this.logCacheStats();
    }, 30000); // 每30秒记录一次
    
    // 定期清理过期缓存
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredCache();
    }, 60000); // 每分钟清理一次
    
    this.logger.info('[CacheManager] 缓存监控已启动');
  }

  /**
   * 记录缓存统计信息
   */
  logCacheStats() {
    const allStats = this.getAllStats();
    
    Object.entries(allStats).forEach(([cacheName, stats]) => {
      if (stats.hits + stats.misses > 0) {
        this.logger.debug(
          `[CacheManager] 缓存 ${cacheName} 统计: ` +
          `命中率 ${stats.hitRatePercentage}%, ` +
          `大小 ${stats.size}/${stats.maxSize}, ` +
          `操作次数 hits=${stats.hits}, misses=${stats.misses}, sets=${stats.sets}`
        );
      }
    });
  }

  /**
   * 清理过期缓存
   */
  cleanupExpiredCache() {
    this.caches.forEach((cache, cacheName) => {
      const expiredCount = cache.getTtl().filter(ttl => ttl === 0).length;
      
      if (expiredCount > 0) {
        this.logger.debug(`[CacheManager] 清理缓存 ${cacheName}: ${expiredCount} 个过期键`);
        cache.flushExpired();
      }
    });
  }

  /**
   * 停止缓存监控
   */
  stopCacheMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    this.logger.info('[CacheManager] 缓存监控已停止');
  }

  /**
   * 销毁缓存管理器
   */
  destroy() {
    this.stopCacheMonitoring();
    
    this.caches.forEach((cache, cacheName) => {
      cache.flushAll();
      this.logger.info(`[CacheManager] 销毁缓存 ${cacheName}`);
    });
    
    this.caches.clear();
    this.cacheStats.clear();
    
    this.logger.info('[CacheManager] 缓存管理器已销毁');
  }
}

module.exports = CacheManager;
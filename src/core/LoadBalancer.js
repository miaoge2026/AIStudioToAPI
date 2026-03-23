/**
 * LoadBalancer Module
 * 智能负载均衡器，基于响应时间、成功率和账户状态进行动态路由
 * 
 * Author: miaoge2026
 * Version: 2.0.0
 */

const EventEmitter = require('events');

class LoadBalancer extends EventEmitter {
  constructor(logger, config) {
    super();
    this.logger = logger;
    this.config = config;
    
    // 账户状态跟踪
    this.accountStats = new Map(); // accountIndex -> stats
    this.accountHealth = new Map(); // accountIndex -> health status
    
    // 负载均衡配置
    this.weights = new Map(); // accountIndex -> weight
    this.maxFailures = config.maxFailures || 3;
    this.responseTimeThreshold = config.responseTimeThreshold || 5000; // ms
    this.successRateThreshold = config.successRateThreshold || 0.8; // 80%
    
    // 初始化
    this.initializeStats();
    
    this.logger.info('[LoadBalancer] 智能负载均衡器初始化完成');
  }

  /**
   * 初始化账户统计信息
   */
  initializeStats() {
    const rotationIndices = this.config.getRotationIndices?.() || [];
    
    rotationIndices.forEach(index => {
      this.accountStats.set(index, {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        totalResponseTime: 0,
        avgResponseTime: 0,
        lastUsed: null,
        consecutiveFailures: 0,
        isHealthy: true,
        weight: 1.0
      });
      
      this.accountHealth.set(index, {
        isActive: true,
        lastCheck: Date.now(),
        errorCount: 0,
        successCount: 0
      });
    });
    
    this.logger.info(`[LoadBalancer] 已初始化 ${rotationIndices.length} 个账户的统计信息`);
  }

  /**
   * 更新账户统计信息
   * @param {number} accountIndex - 账户索引
   * @param {boolean} success - 请求是否成功
   * @param {number} responseTime - 响应时间（毫秒）
   * @param {Error} error - 错误信息（如果失败）
   */
  updateAccountStats(accountIndex, success, responseTime, error = null) {
    const stats = this.accountStats.get(accountIndex);
    if (!stats) {
      this.logger.warn(`[LoadBalancer] 账户 #${accountIndex} 的统计信息不存在`);
      return;
    }

    const health = this.accountHealth.get(accountIndex);
    
    // 更新基本统计
    stats.totalRequests++;
    stats.totalResponseTime += responseTime;
    stats.avgResponseTime = stats.totalResponseTime / stats.totalRequests;
    stats.lastUsed = Date.now();

    if (success) {
      stats.successfulRequests++;
      stats.consecutiveFailures = 0;
      health.successCount++;
      health.errorCount = Math.max(0, health.errorCount - 1);
    } else {
      stats.failedRequests++;
      stats.consecutiveFailures++;
      health.errorCount++;
      health.successCount = Math.max(0, health.successCount - 1);
    }

    // 计算成功率
    const successRate = stats.successfulRequests / stats.totalRequests;
    
    // 更新健康状态
    const isHealthy = this.calculateHealthStatus(stats, health, successRate);
    stats.isHealthy = isHealthy;
    health.isActive = isHealthy;
    health.lastCheck = Date.now();

    // 动态调整权重
    this.updateWeight(accountIndex, stats, successRate);

    // 触发事件
    this.emit('statsUpdated', {
      accountIndex,
      stats: { ...stats },
      health: { ...health }
    });

    // 如果连续失败过多，触发故障转移
    if (stats.consecutiveFailures >= this.maxFailures) {
      this.logger.warn(`[LoadBalancer] 账户 #${accountIndex} 连续失败 ${stats.consecutiveFailures} 次，标记为不健康`);
      this.emit('accountUnhealthy', accountIndex);
    }
  }

  /**
   * 计算账户健康状态
   * @param {Object} stats - 账户统计信息
   * @param {Object} health - 健康状态
   * @param {number} successRate - 成功率
   * @returns {boolean} 是否健康
   */
  calculateHealthStatus(stats, health, successRate) {
    // 基于多个因素判断健康状态
    
    // 1. 成功率检查
    if (successRate < this.successRateThreshold) {
      this.logger.debug(`[LoadBalancer] 账户成功率 ${(successRate * 100).toFixed(2)}% 低于阈值 ${(this.successRateThreshold * 100).toFixed(2)}%`);
      return false;
    }

    // 2. 响应时间检查
    if (stats.avgResponseTime > this.responseTimeThreshold) {
      this.logger.debug(`[LoadBalancer] 账户平均响应时间 ${stats.avgResponseTime.toFixed(2)}ms 超过阈值 ${this.responseTimeThreshold}ms`);
      return false;
    }

    // 3. 连续失败检查
    if (stats.consecutiveFailures >= this.maxFailures) {
      this.logger.debug(`[LoadBalancer] 账户连续失败 ${stats.consecutiveFailures} 次，超过阈值 ${this.maxFailures}`);
      return false;
    }

    // 4. 错误率检查
    const errorRate = health.errorCount / (health.errorCount + health.successCount);
    if (errorRate > 0.3) { // 30% 错误率阈值
      this.logger.debug(`[LoadBalancer] 账户错误率 ${(errorRate * 100).toFixed(2)}% 过高`);
      return false;
    }

    return true;
  }

  /**
   * 动态更新账户权重
   * @param {number} accountIndex - 账户索引
   * @param {Object} stats - 账户统计信息
   * @param {number} successRate - 成功率
   */
  updateWeight(accountIndex, stats, successRate) {
    if (!stats.isHealthy) {
      this.weights.set(accountIndex, 0);
      return;
    }

    // 基于响应时间和成功率计算权重
    const baseWeight = 1.0;
    
    // 响应时间因子（越低越好）
    const responseTimeFactor = Math.max(0.1, 1 - (stats.avgResponseTime / this.responseTimeThreshold));
    
    // 成功率因子（越高越好）
    const successRateFactor = successRate;
    
    // 综合权重
    const weight = baseWeight * responseTimeFactor * successRateFactor;
    
    this.weights.set(accountIndex, weight);
    
    this.logger.debug(`[LoadBalancer] 账户 #${accountIndex} 权重更新为: ${weight.toFixed(4)} (RT: ${stats.avgResponseTime.toFixed(0)}ms, SR: ${(successRate * 100).toFixed(2)}%)`);
  }

  /**
   * 选择最佳账户
   * @returns {number|null} 账户索引或 null（如果没有可用账户）
   */
  selectBestAccount() {
    const rotationIndices = this.config.getRotationIndices?.() || [];
    
    if (rotationIndices.length === 0) {
      this.logger.error('[LoadBalancer] 没有可用的账户');
      return null;
    }

    // 过滤健康账户
    const healthyAccounts = rotationIndices.filter(index => {
      const stats = this.accountStats.get(index);
      return stats && stats.isHealthy;
    });

    if (healthyAccounts.length === 0) {
      this.logger.warn('[LoadBalancer] 没有健康的账户，使用所有可用账户');
      // 如果没有健康账户，使用权重最高的账户
      return this.selectByWeight(rotationIndices);
    }

    // 按权重选择健康账户
    return this.selectByWeight(healthyAccounts);
  }

  /**
   * 按权重选择账户
   * @param {Array} accounts - 账户索引数组
   * @returns {number} 选中的账户索引
   */
  selectByWeight(accounts) {
    const weightedAccounts = accounts.map(index => ({
      index,
      weight: this.weights.get(index) || 0
    }));

    // 计算总权重
    const totalWeight = weightedAccounts.reduce((sum, acc) => sum + acc.weight, 0);
    
    if (totalWeight === 0) {
      // 如果所有权重都为0，随机选择一个
      const randomIndex = Math.floor(Math.random() * accounts.length);
      this.logger.debug(`[LoadBalancer] 所有账户权重为0，随机选择账户 #${accounts[randomIndex]}`);
      return accounts[randomIndex];
    }

    // 按权重随机选择
    let random = Math.random() * totalWeight;
    
    for (const account of weightedAccounts) {
      random -= account.weight;
      if (random <= 0) {
        this.logger.debug(`[LoadBalancer] 选中账户 #${account.index} (权重: ${account.weight.toFixed(4)})`);
        return account.index;
      }
    }

    // 默认返回第一个
    return accounts[0];
  }

  /**
   * 获取账户统计信息
   * @param {number} accountIndex - 账户索引
   * @returns {Object|null} 统计信息或 null
   */
  getAccountStats(accountIndex) {
    return this.accountStats.get(accountIndex) || null;
  }

  /**
   * 获取所有账户统计信息
   * @returns {Object} 所有账户统计信息
   */
  getAllAccountStats() {
    const result = {};
    
    this.accountStats.forEach((stats, index) => {
      result[index] = {
        ...stats,
        successRate: stats.totalRequests > 0 ? stats.successfulRequests / stats.totalRequests : 0,
        weight: this.weights.get(index) || 0
      };
    });
    
    return result;
  }

  /**
   * 获取健康账户列表
   * @returns {Array} 健康账户索引数组
   */
  getHealthyAccounts() {
    const rotationIndices = this.config.getRotationIndices?.() || [];
    
    return rotationIndices.filter(index => {
      const stats = this.accountStats.get(index);
      return stats && stats.isHealthy;
    });
  }

  /**
   * 重置账户状态
   * @param {number} accountIndex - 账户索引
   */
  resetAccount(accountIndex) {
    const stats = this.accountStats.get(accountIndex);
    if (stats) {
      stats.consecutiveFailures = 0;
      stats.isHealthy = true;
    }
    
    const health = this.accountHealth.get(accountIndex);
    if (health) {
      health.isActive = true;
      health.errorCount = 0;
      health.successCount = 0;
    }
    
    this.logger.info(`[LoadBalancer] 账户 #${accountIndex} 状态已重置`);
  }

  /**
   * 移除账户
   * @param {number} accountIndex - 账户索引
   */
  removeAccount(accountIndex) {
    this.accountStats.delete(accountIndex);
    this.accountHealth.delete(accountIndex);
    this.weights.delete(accountIndex);
    
    this.logger.info(`[LoadBalancer] 账户 #${accountIndex} 已从负载均衡器移除`);
  }

  /**
   * 添加账户
   * @param {number} accountIndex - 账户索引
   */
  addAccount(accountIndex) {
    if (!this.accountStats.has(accountIndex)) {
      this.accountStats.set(accountIndex, {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        totalResponseTime: 0,
        avgResponseTime: 0,
        lastUsed: null,
        consecutiveFailures: 0,
        isHealthy: true,
        weight: 1.0
      });
      
      this.accountHealth.set(accountIndex, {
        isActive: true,
        lastCheck: Date.now(),
        errorCount: 0,
        successCount: 0
      });
      
      this.weights.set(accountIndex, 1.0);
      
      this.logger.info(`[LoadBalancer] 账户 #${accountIndex} 已添加到负载均衡器`);
    }
  }
}

module.exports = LoadBalancer;
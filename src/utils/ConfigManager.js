/**
 * ConfigManager Module
 * 动态配置管理器，支持热更新和多环境配置
 * 
 * Author: miaoge2026
 * Version: 2.0.0
 */

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const crypto = require('crypto');

class ConfigManager extends EventEmitter {
  constructor(logger, options = {}) {
    super();
    this.logger = logger;
    this.configDir = options.configDir || path.join(process.cwd(), 'configs');
    this.env = options.env || process.env.NODE_ENV || 'development';
    this.configCache = new Map();
    this.configWatchers = new Map();
    this.lastConfigHash = null;
    
    // 配置默认值
    this.defaults = {
      server: {
        host: '0.0.0.0',
        port: 3000,
        logLevel: 'info',
        env: this.env
      },
      proxy: {
        streamingMode: 'real',
        maxRetries: 3,
        retryDelay: 1000,
        requestTimeout: 300000,
        browserTimeout: 120000
      },
      auth: {
        switchOnFailure: true,
        switchOnUses: 10,
        maxFailures: 3,
        immediateSwitchStatusCodes: [429, 503]
      },
      loadBalancer: {
        enabled: true,
        responseTimeThreshold: 5000,
        successRateThreshold: 0.8,
        healthCheckInterval: 30000
      },
      cache: {
        enabled: true,
        ttl: 300,
        maxSize: 1000
      },
      monitoring: {
        metricsEnabled: true,
        metricsPort: 9090,
        logRotation: {
          size: 10485760, // 10MB
          count: 5
        }
      },
      security: {
        rateLimitEnabled: true,
        rateLimitRequests: 100,
        rateLimitWindow: 60000,
        allowedOrigins: ['*'],
        apiKeyAuth: false
      }
    };
    
    // 初始化配置
    this.initializeConfig();
    
    // 启动配置热更新监控
    this.startConfigWatcher();
    
    this.logger.info(`[ConfigManager] 配置管理器初始化完成 (环境: ${this.env})`);
  }

  /**
   * 初始化配置
   */
  initializeConfig() {
    try {
      // 创建配置目录
      if (!fs.existsSync(this.configDir)) {
        fs.mkdirSync(this.configDir, { recursive: true });
        this.logger.info(`[ConfigManager] 创建配置目录: ${this.configDir}`);
      }
      
      // 加载环境配置
      this.loadEnvironmentConfig();
      
      // 加载服务器配置
      this.loadServerConfig();
      
      // 加载模型配置
      this.loadModelConfig();
      
      // 验证配置完整性
      this.validateConfig();
      
      // 计算配置哈希
      this.updateConfigHash();
      
    } catch (error) {
      this.logger.error(`[ConfigManager] 配置初始化失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 加载环境配置
   */
  loadEnvironmentConfig() {
    const envConfigPath = path.join(this.configDir, `.env.${this.env}`);
    const defaultEnvPath = path.join(this.configDir, '.env');
    
    // 优先加载环境特定配置
    if (fs.existsSync(envConfigPath)) {
      this.loadEnvFile(envConfigPath);
      this.logger.info(`[ConfigManager] 加载环境配置: .env.${this.env}`);
    } else if (fs.existsSync(defaultEnvPath)) {
      this.loadEnvFile(defaultEnvPath);
      this.logger.info(`[ConfigManager] 加载默认配置: .env`);
    }
  }

  /**
   * 加载 .env 文件
   * @param {string} filePath - 文件路径
   */
  loadEnvFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const envVars = this.parseEnvFile(content);
    
    // 设置环境变量
    Object.entries(envVars).forEach(([key, value]) => {
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    });
  }

  /**
   * 解析 .env 文件内容
   * @param {string} content - 文件内容
   * @returns {Object} 解析后的环境变量
   */
  parseEnvFile(content) {
    const envVars = {};
    const lines = content.split('\n');
    
    lines.forEach(line => {
      const trimmedLine = line.trim();
      
      // 跳过空行和注释
      if (!trimmedLine || trimmedLine.startsWith('#')) {
        return;
      }
      
      // 解析键值对
      const match = trimmedLine.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (match) {
        const key = match[1];
        let value = match[2].trim();
        
        // 移除引号
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        
        envVars[key] = value;
      }
    });
    
    return envVars;
  }

  /**
   * 加载服务器配置
   */
  loadServerConfig() {
    const configPath = path.join(this.configDir, 'server.json');
    
    if (fs.existsSync(configPath)) {
      try {
        const serverConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        this.mergeConfig('server', serverConfig);
        this.logger.info('[ConfigManager] 加载服务器配置');
      } catch (error) {
        this.logger.warn(`[ConfigManager] 服务器配置解析失败: ${error.message}`);
      }
    }
  }

  /**
   * 加载模型配置
   */
  loadModelConfig() {
    const configPath = path.join(this.configDir, 'models.json');
    
    if (fs.existsSync(configPath)) {
      try {
        const modelsConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        this.mergeConfig('models', modelsConfig);
        this.logger.info('[ConfigManager] 加载模型配置');
      } catch (error) {
        this.logger.warn(`[ConfigManager] 模型配置解析失败: ${error.message}`);
      }
    }
  }

  /**
   * 合并配置
   * @param {string} key - 配置键
   * @param {Object} config - 配置对象
   */
  mergeConfig(key, config) {
    const currentConfig = this.configCache.get(key) || {};
    const mergedConfig = { ...currentConfig, ...config };
    
    this.configCache.set(key, mergedConfig);
    
    // 触发配置更新事件
    this.emit('configUpdated', key, mergedConfig);
  }

  /**
   * 验证配置完整性
   */
  validateConfig() {
    const requiredKeys = [
      'server.port',
      'proxy.streamingMode',
      'auth.switchOnFailure'
    ];
    
    const errors = [];
    
    requiredKeys.forEach(key => {
      if (this.get(key) === undefined) {
        errors.push(`缺少必需配置项: ${key}`);
      }
    });
    
    if (errors.length > 0) {
      const errorMsg = `配置验证失败: ${errors.join(', ')}`;
      this.logger.error(`[ConfigManager] ${errorMsg}`);
      throw new Error(errorMsg);
    }
    
    this.logger.info('[ConfigManager] 配置验证通过');
  }

  /**
   * 获取配置值
   * @param {string} key - 配置键（支持点号分隔的嵌套键）
   * @param {*} defaultValue - 默认值
   * @returns {*} 配置值
   */
  get(key, defaultValue = undefined) {
    // 检查环境变量
    const envKey = key.replace(/\./g, '_').toUpperCase();
    if (process.env[envKey] !== undefined) {
      return this.parseEnvValue(process.env[envKey]);
    }
    
    // 检查缓存配置
    const keys = key.split('.');
    let value = this.configCache.get(keys[0]);
    
    for (let i = 1; i < keys.length && value !== undefined; i++) {
      value = value[keys[i]];
    }
    
    if (value !== undefined) {
      return value;
    }
    
    // 检查默认配置
    value = this.defaults;
    for (let i = 0; i < keys.length && value !== undefined; i++) {
      value = value[keys[i]];
    }
    
    return value !== undefined ? value : defaultValue;
  }

  /**
   * 设置配置值
   * @param {string} key - 配置键
   * @param {*} value - 配置值
   */
  set(key, value) {
    const keys = key.split('.');
    const configKey = keys[0];
    
    let config = this.configCache.get(configKey);
    if (!config) {
      config = {};
      this.configCache.set(configKey, config);
    }
    
    // 设置嵌套值
    let current = config;
    for (let i = 1; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    
    current[keys[keys.length - 1]] = value;
    
    // 触发配置更新事件
    this.emit('configUpdated', key, value);
    this.emit('configChanged', { key, value });
    
    // 更新配置哈希
    this.updateConfigHash();
    
    this.logger.info(`[ConfigManager] 配置更新: ${key} = ${JSON.stringify(value)}`);
  }

  /**
   * 解析环境变量值
   * @param {string} value - 环境变量值
   * @returns {*} 解析后的值
   */
  parseEnvValue(value) {
    // 解析布尔值
    if (value === 'true' || value === 'false') {
      return value === 'true';
    }
    
    // 解析数字
    if (/^\d+$/.test(value)) {
      return parseInt(value, 10);
    }
    
    if (/^\d+\.\d+$/.test(value)) {
      return parseFloat(value);
    }
    
    // 解析数组
    if (value.startsWith('[') && value.endsWith(']')) {
      try {
        return JSON.parse(value);
      } catch (error) {
        // 忽略解析错误，返回字符串
      }
    }
    
    return value;
  }

  /**
   * 更新配置哈希
   */
  updateConfigHash() {
    const configString = JSON.stringify([...this.configCache]);
    const newHash = crypto.createHash('md5').update(configString).digest('hex');
    
    if (newHash !== this.lastConfigHash) {
      this.lastConfigHash = newHash;
      this.emit('configHashChanged', newHash);
    }
  }

  /**
   * 启动配置热更新监控
   */
  startConfigWatcher() {
    const configFiles = [
      path.join(this.configDir, '.env'),
      path.join(this.configDir, `.env.${this.env}`),
      path.join(this.configDir, 'server.json'),
      path.join(this.configDir, 'models.json')
    ];
    
    configFiles.forEach(filePath => {
      if (fs.existsSync(filePath) && !this.configWatchers.has(filePath)) {
        const watcher = fs.watch(filePath, (eventType, filename) => {
          if (eventType === 'change') {
            this.logger.info(`[ConfigManager] 检测到配置文件变更: ${filename}`);
            this.handleConfigChange(filePath);
          }
        });
        
        this.configWatchers.set(filePath, watcher);
      }
    });
    
    this.logger.info('[ConfigManager] 配置热更新监控已启动');
  }

  /**
   * 处理配置变更
   * @param {string} filePath - 变更的文件路径
   */
  handleConfigChange(filePath) {
    try {
      if (filePath.endsWith('.env') || filePath.endsWith(`.env.${this.env}`)) {
        this.loadEnvironmentConfig();
      } else if (filePath.endsWith('server.json')) {
        this.loadServerConfig();
      } else if (filePath.endsWith('models.json')) {
        this.loadModelConfig();
      }
      
      this.validateConfig();
      this.updateConfigHash();
      
      this.emit('configReloaded', filePath);
      this.logger.info(`[ConfigManager] 配置热更新完成: ${filePath}`);
    } catch (error) {
      this.logger.error(`[ConfigManager] 配置热更新失败: ${error.message}`);
      this.emit('configUpdateError', error);
    }
  }

  /**
   * 停止配置监控
   */
  stopConfigWatcher() {
    this.configWatchers.forEach((watcher, filePath) => {
      watcher.close();
      this.logger.info(`[ConfigManager] 停止监控: ${filePath}`);
    });
    
    this.configWatchers.clear();
  }

  /**
   * 获取所有配置
   * @returns {Object} 所有配置
   */
  getAllConfig() {
    const result = {};
    
    this.configCache.forEach((config, key) => {
      result[key] = config;
    });
    
    return result;
  }

  /**
   * 获取配置哈希
   * @returns {string} 配置哈希值
   */
  getConfigHash() {
    return this.lastConfigHash;
  }

  /**
   * 导出配置到文件
   * @param {string} filePath - 导出文件路径
   */
  exportConfig(filePath) {
    const allConfig = this.getAllConfig();
    fs.writeFileSync(filePath, JSON.stringify(allConfig, null, 2));
    this.logger.info(`[ConfigManager] 配置导出到: ${filePath}`);
  }

  /**
   * 导入配置从文件
   * @param {string} filePath - 导入文件路径
   */
  importConfig(filePath) {
    try {
      const configData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      
      Object.entries(configData).forEach(([key, value]) => {
        this.mergeConfig(key, value);
      });
      
      this.validateConfig();
      this.updateConfigHash();
      
      this.logger.info(`[ConfigManager] 配置从文件导入: ${filePath}`);
    } catch (error) {
      this.logger.error(`[ConfigManager] 配置导入失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 重置配置
   * @param {string} key - 配置键（可选，不提供则重置所有）
   */
  reset(key = null) {
    if (key) {
      this.configCache.delete(key);
      this.logger.info(`[ConfigManager] 配置重置: ${key}`);
    } else {
      this.configCache.clear();
      this.logger.info('[ConfigManager] 所有配置已重置');
    }
    
    // 重新加载配置
    this.initializeConfig();
  }
}

module.exports = ConfigManager;
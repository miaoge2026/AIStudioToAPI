/**
 * ModelManager Module
 * 动态模型管理器，支持模型配置、版本控制和负载均衡
 * 
 * Author: miaoge2026
 * Version: 2.0.0
 */

const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');

class ModelManager extends EventEmitter {
  constructor(logger, configManager, options = {}) {
    super();
    this.logger = logger;
    this.configManager = configManager;
    this.models = new Map(); // 模型注册表
    this.modelStats = new Map(); // 模型统计信息
    this.modelVersions = new Map(); // 模型版本信息
    this.defaultModel = null;
    
    // 模型配置路径
    this.modelsConfigPath = options.modelsConfigPath || 
      path.join(process.cwd(), 'configs', 'models.json');
    
    // 初始化模型
    this.initializeModels();
    
    this.logger.info('[ModelManager] 模型管理器初始化完成');
  }

  /**
   * 初始化模型
   */
  initializeModels() {
    try {
      // 加载模型配置
      this.loadModelsConfig();
      
      // 注册默认模型
      this.registerDefaultModels();
      
      // 验证模型配置
      this.validateModels();
      
      // 初始化模型统计
      this.initializeModelStats();
      
    } catch (error) {
      this.logger.error(`[ModelManager] 模型初始化失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 加载模型配置
   */
  loadModelsConfig() {
    if (fs.existsSync(this.modelsConfigPath)) {
      try {
        const modelsConfig = JSON.parse(fs.readFileSync(this.modelsConfigPath, 'utf-8'));
        
        if (modelsConfig.models) {
          Object.entries(modelsConfig.models).forEach(([modelName, modelConfig]) => {
            this.registerModel(modelName, modelConfig);
          });
        }
        
        if (modelsConfig.defaultModel) {
          this.setDefaultModel(modelsConfig.defaultModel);
        }
        
        this.logger.info(`[ModelManager] 从配置文件加载 ${Object.keys(modelsConfig.models || {}).length} 个模型`);
      } catch (error) {
        this.logger.warn(`[ModelManager] 模型配置解析失败: ${error.message}`);
      }
    }
  }

  /**
   * 注册默认模型
   */
  registerDefaultModels() {
    const defaultModels = {
      'gemini-1.5-pro': {
        provider: 'google',
        capabilities: ['text', 'image', 'code'],
        maxTokens: 1000000,
        costPer1K: 0.001,
        enabled: true,
        priority: 1,
        fallback: 'gemini-1.5-flash'
      },
      'gemini-1.5-flash': {
        provider: 'google',
        capabilities: ['text', 'image', 'code'],
        maxTokens: 1000000,
        costPer1K: 0.00001,
        enabled: true,
        priority: 2,
        fallback: null
      },
      'gemini-1.0-pro': {
        provider: 'google',
        capabilities: ['text'],
        maxTokens: 30720,
        costPer1K: 0.0005,
        enabled: true,
        priority: 3,
        fallback: 'gemini-1.5-flash'
      }
    };
    
    Object.entries(defaultModels).forEach(([modelName, modelConfig]) => {
      if (!this.models.has(modelName)) {
        this.registerModel(modelName, modelConfig);
      }
    });
  }

  /**
   * 注册模型
   * @param {string} modelName - 模型名称
   * @param {Object} config - 模型配置
   */
  registerModel(modelName, config) {
    const modelConfig = {
      name: modelName,
      provider: config.provider || 'google',
      capabilities: config.capabilities || ['text'],
      maxTokens: config.maxTokens || 30720,
      costPer1K: config.costPer1K || 0,
      enabled: config.enabled !== false,
      priority: config.priority || 999,
      fallback: config.fallback || null,
      aliases: config.aliases || [],
      metadata: config.metadata || {},
      versions: config.versions || ['v1']
    };
    
    this.models.set(modelName, modelConfig);
    
    // 注册模型别名
    if (modelConfig.aliases) {
      modelConfig.aliases.forEach(alias => {
        if (!this.models.has(alias)) {
          this.models.set(alias, { ...modelConfig, isAlias: true, originalName: modelName });
        }
      });
    }
    
    // 注册模型版本
    if (modelConfig.versions) {
      modelConfig.versions.forEach(version => {
        const versionKey = `${modelName}:${version}`;
        this.modelVersions.set(versionKey, {
          modelName,
          version,
          status: 'active',
          releaseDate: new Date().toISOString()
        });
      });
    }
    
    this.logger.info(`[ModelManager] 注册模型: ${modelName} (${modelConfig.provider})`);
    this.emit('modelRegistered', modelName, modelConfig);
  }

  /**
   * 取消注册模型
   * @param {string} modelName - 模型名称
   */
  unregisterModel(modelName) {
    const modelConfig = this.models.get(modelName);
    
    if (!modelConfig) {
      this.logger.warn(`[ModelManager] 模型 ${modelName} 不存在`);
      return false;
    }
    
    // 移除别名
    if (modelConfig.aliases) {
      modelConfig.aliases.forEach(alias => {
        this.models.delete(alias);
      });
    }
    
    // 移除版本
    this.modelVersions.forEach((versionInfo, versionKey) => {
      if (versionInfo.modelName === modelName) {
        this.modelVersions.delete(versionKey);
      }
    });
    
    // 移除模型
    this.models.delete(modelName);
    
    // 移除统计信息
    this.modelStats.delete(modelName);
    
    this.logger.info(`[ModelManager] 取消注册模型: ${modelName}`);
    this.emit('modelUnregistered', modelName);
    
    return true;
  }

  /**
   * 设置默认模型
   * @param {string} modelName - 模型名称
   */
  setDefaultModel(modelName) {
    if (!this.models.has(modelName)) {
      this.logger.warn(`[ModelManager] 模型 ${modelName} 不存在，无法设置为默认`);
      return false;
    }
    
    this.defaultModel = modelName;
    this.logger.info(`[ModelManager] 设置默认模型: ${modelName}`);
    this.emit('defaultModelChanged', modelName);
    
    return true;
  }

  /**
   * 获取模型配置
   * @param {string} modelName - 模型名称
   * @returns {Object|null} 模型配置
   */
  getModel(modelName) {
    const modelConfig = this.models.get(modelName);
    
    if (!modelConfig) {
      this.logger.warn(`[ModelManager] 模型 ${modelName} 不存在`);
      return null;
    }
    
    // 如果是别名，返回原始模型配置
    if (modelConfig.isAlias && modelConfig.originalName) {
      return this.models.get(modelConfig.originalName);
    }
    
    return modelConfig;
  }

  /**
   * 获取所有模型
   * @param {boolean} includeAliases - 是否包含别名
   * @returns {Array} 模型列表
   */
  getAllModels(includeAliases = false) {
    const models = [];
    
    this.models.forEach((modelConfig, modelName) => {
      if (includeAliases || !modelConfig.isAlias) {
        models.push({
          name: modelName,
          ...modelConfig,
          isDefault: modelName === this.defaultModel
        });
      }
    });
    
    return models.sort((a, b) => a.priority - b.priority);
  }

  /**
   * 获取启用的模型
   * @returns {Array} 启用的模型列表
   */
  getEnabledModels() {
    return this.getAllModels().filter(model => model.enabled);
  }

  /**
   * 获取模型能力
   * @param {string} modelName - 模型名称
   * @returns {Array} 能力列表
   */
  getModelCapabilities(modelName) {
    const modelConfig = this.getModel(modelName);
    return modelConfig ? modelConfig.capabilities : [];
  }

  /**
   * 检查模型是否支持能力
   * @param {string} modelName - 模型名称
   * @param {string} capability - 能力
   * @returns {boolean} 是否支持
   */
  hasCapability(modelName, capability) {
    const capabilities = this.getModelCapabilities(modelName);
    return capabilities.includes(capability);
  }

  /**
   * 更新模型配置
   * @param {string} modelName - 模型名称
   * @param {Object} config - 新的配置
   */
  updateModel(modelName, config) {
    const existingConfig = this.getModel(modelName);
    
    if (!existingConfig) {
      this.logger.warn(`[ModelManager] 模型 ${modelName} 不存在，无法更新`);
      return false;
    }
    
    // 保留不可更新的字段
    const { name, isAlias, originalName, ...updatableConfig } = config;
    
    const updatedConfig = {
      ...existingConfig,
      ...updatableConfig
    };
    
    this.models.set(modelName, updatedConfig);
    
    this.logger.info(`[ModelManager] 更新模型配置: ${modelName}`);
    this.emit('modelUpdated', modelName, updatedConfig);
    
    return true;
  }

  /**
   * 初始化模型统计信息
   */
  initializeModelStats() {
    this.models.forEach((modelConfig, modelName) => {
      if (!modelConfig.isAlias) {
        this.modelStats.set(modelName, {
          totalRequests: 0,
          successfulRequests: 0,
          failedRequests: 0,
          totalTokens: 0,
          totalCost: 0,
          avgResponseTime: 0,
          totalResponseTime: 0,
          lastUsed: null,
          isHealthy: true
        });
      }
    });
  }

  /**
   * 更新模型统计信息
   * @param {string} modelName - 模型名称
   * @param {Object} stats - 统计信息
   */
  updateModelStats(modelName, stats) {
    const modelStat = this.modelStats.get(modelName);
    
    if (!modelStat) {
      this.logger.warn(`[ModelManager] 模型 ${modelName} 的统计信息不存在`);
      return;
    }
    
    // 更新基本统计
    if (stats.success) {
      modelStat.successfulRequests++;
    } else {
      modelStat.failedRequests++;
    }
    
    modelStat.totalRequests++;
    modelStat.totalResponseTime += stats.responseTime || 0;
    modelStat.avgResponseTime = modelStat.totalResponseTime / modelStat.totalRequests;
    modelStat.lastUsed = new Date().toISOString();
    
    // 更新 token 和成本
    if (stats.tokens) {
      modelStat.totalTokens += stats.tokens;
      const modelConfig = this.getModel(modelName);
      if (modelConfig && modelConfig.costPer1K) {
        modelStat.totalCost += (stats.tokens / 1000) * modelConfig.costPer1K;
      }
    }
    
    // 计算健康状态
    const successRate = modelStat.successfulRequests / modelStat.totalRequests;
    modelStat.isHealthy = successRate >= 0.8 && modelStat.avgResponseTime < 5000; // 80% 成功率，5秒响应时间
    
    this.emit('modelStatsUpdated', modelName, { ...modelStat });
  }

  /**
   * 获取模型统计信息
   * @param {string} modelName - 模型名称
   * @returns {Object|null} 统计信息
   */
  getModelStats(modelName) {
    return this.modelStats.get(modelName) || null;
  }

  /**
   * 获取所有模型统计信息
   * @returns {Object} 所有模型统计信息
   */
  getAllModelStats() {
    const result = {};
    
    this.modelStats.forEach((stats, modelName) => {
      result[modelName] = {
        ...stats,
        successRate: stats.totalRequests > 0 ? 
          (stats.successfulRequests / stats.totalRequests * 100).toFixed(2) : 0
      };
    });
    
    return result;
  }

  /**
   * 解析模型名称（处理别名）
   * @param {string} modelName - 模型名称或别名
   * @returns {string} 实际模型名称
   */
  resolveModelName(modelName) {
    const modelConfig = this.models.get(modelName);
    
    if (!modelConfig) {
      return null;
    }
    
    // 如果是别名，返回原始模型名称
    if (modelConfig.isAlias && modelConfig.originalName) {
      return modelConfig.originalName;
    }
    
    return modelName;
  }

  /**
   * 验证模型配置
   */
  validateModels() {
    const errors = [];
    
    this.models.forEach((modelConfig, modelName) => {
      if (!modelConfig.provider) {
        errors.push(`模型 ${modelName} 缺少 provider`);
      }
      
      if (!Array.isArray(modelConfig.capabilities)) {
        errors.push(`模型 ${modelName} 的 capabilities 必须是数组`);
      }
      
      if (typeof modelConfig.maxTokens !== 'number' || modelConfig.maxTokens <= 0) {
        errors.push(`模型 ${modelName} 的 maxTokens 必须是正数`);
      }
    });
    
    if (errors.length > 0) {
      const errorMsg = `模型验证失败: ${errors.join(', ')}`;
      this.logger.error(`[ModelManager] ${errorMsg}`);
      throw new Error(errorMsg);
    }
    
    this.logger.info('[ModelManager] 模型验证通过');
  }

  /**
   * 导出模型配置
   * @param {string} filePath - 导出文件路径
   */
  exportModels(filePath) {
    const modelsData = {
      models: {},
      defaultModel: this.defaultModel,
      exportDate: new Date().toISOString(),
      version: '2.0.0'
    };
    
    this.getAllModels().forEach(model => {
      const { isDefault, ...modelData } = model;
      modelsData.models[model.name] = modelData;
    });
    
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(filePath, JSON.stringify(modelsData, null, 2));
    this.logger.info(`[ModelManager] 模型配置导出到: ${filePath}`);
  }

  /**
   * 导入模型配置
   * @param {string} filePath - 导入文件路径
   */
  importModels(filePath) {
    try {
      const modelsData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      
      // 导入模型
      Object.entries(modelsData.models).forEach(([modelName, modelConfig]) => {
        this.registerModel(modelName, modelConfig);
      });
      
      // 设置默认模型
      if (modelsData.defaultModel) {
        this.setDefaultModel(modelsData.defaultModel);
      }
      
      this.logger.info(`[ModelManager] 从 ${filePath} 导入 ${Object.keys(modelsData.models).length} 个模型`);
    } catch (error) {
      this.logger.error(`[ModelManager] 导入模型配置失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 重新加载模型配置
   */
  reloadModels() {
    this.models.clear();
    this.modelStats.clear();
    this.modelVersions.clear();
    
    this.initializeModels();
    
    this.emit('modelsReloaded');
    this.logger.info('[ModelManager] 模型配置已重新加载');
  }

  /**
   * 获取模型推荐
   * @param {Object} requirements - 需求（capabilities, maxTokens, budget等）
   * @returns {Array} 推荐模型列表
   */
  getModelRecommendations(requirements) {
    const enabledModels = this.getEnabledModels();
    
    return enabledModels
      .filter(model => {
        // 能力匹配
        if (requirements.capabilities) {
          const hasAllCapabilities = requirements.capabilities.every(
            cap => model.capabilities.includes(cap)
          );
          if (!hasAllCapabilities) return false;
        }
        
        // token 限制
        if (requirements.maxTokens && model.maxTokens < requirements.maxTokens) {
          return false;
        }
        
        // 预算限制
        if (requirements.budget && model.costPer1K) {
          const estimatedCost = (requirements.maxTokens || 1000) / 1000 * model.costPer1K;
          if (estimatedCost > requirements.budget) return false;
        }
        
        return true;
      })
      .sort((a, b) => {
        // 按优先级和成本排序
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        return (a.costPer1K || 0) - (b.costPer1K || 0);
      });
  }
}

module.exports = ModelManager;
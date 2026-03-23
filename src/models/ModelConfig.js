/**
 * ModelConfig Module
 * 模型配置验证和管理工具类
 * 
 * Author: miaoge2026
 * Version: 2.0.0
 */

const Joi = require('joi');

class ModelConfig {
  /**
   * 模型配置验证模式
   */
  static getModelSchema() {
    return Joi.object({
      // 基本信息
      name: Joi.string().required(),
      provider: Joi.string().valid('google', 'openai', 'anthropic').required(),
      description: Joi.string().optional(),
      
      // 能力配置
      capabilities: Joi.array().items(
        Joi.string().valid('text', 'image', 'code', 'audio', 'video', 'embedding')
      ).min(1).required(),
      
      // 限制配置
      maxTokens: Joi.number().integer().min(1).max(2000000).required(),
      maxOutputTokens: Joi.number().integer().min(1).max(100000).optional(),
      
      // 成本配置
      costPer1K: Joi.number().min(0).required(),
      costPer1KInput: Joi.number().min(0).optional(),
      costPer1KOutput: Joi.number().min(0).optional(),
      
      // 性能配置
      avgResponseTime: Joi.number().min(0).optional(),
      throughput: Joi.number().min(0).optional(), // 请求/秒
      
      // 状态配置
      enabled: Joi.boolean().default(true),
      priority: Joi.number().integer().min(1).default(999),
      
      // 回退配置
      fallback: Joi.string().optional().allow(null),
      aliases: Joi.array().items(Joi.string()).default([]),
      
      // 元数据
      metadata: Joi.object().default({}),
      tags: Joi.array().items(Joi.string()).default([]),
      
      // 版本信息
      versions: Joi.array().items(
        Joi.object({
          version: Joi.string().required(),
          status: Joi.string().valid('active', 'deprecated', 'beta').default('active'),
          releaseDate: Joi.date().iso().required(),
          changes: Joi.string().optional()
        })
      ).default([])
    });
  }

  /**
   * 验证模型配置
   * @param {Object} config - 模型配置
   * @returns {Object} 验证结果
   */
  static validate(config) {
    const schema = this.getModelSchema();
    return schema.validate(config, { abortEarly: false });
  }

  /**
   * 创建默认模型配置
   * @param {string} name - 模型名称
   * @param {Object} overrides - 覆盖的配置
   * @returns {Object} 模型配置
   */
  static createDefaultConfig(name, overrides = {}) {
    const baseConfig = {
      name,
      provider: 'google',
      description: `Default configuration for ${name}`,
      capabilities: ['text'],
      maxTokens: 30720,
      costPer1K: 0.001,
      enabled: true,
      priority: 999,
      fallback: null,
      aliases: [],
      metadata: {},
      tags: []
    };
    
    return { ...baseConfig, ...overrides };
  }

  /**
   * 创建 Google Gemini 模型配置
   * @param {string} name - 模型名称
   * @param {Object} overrides - 覆盖的配置
   * @returns {Object} 模型配置
   */
  static createGeminiConfig(name, overrides = {}) {
    const baseConfig = {
      name,
      provider: 'google',
      capabilities: ['text', 'image', 'code'],
      maxTokens: 1000000,
      costPer1K: 0.001,
      metadata: {
        family: 'gemini',
        generation: 1.5
      },
      tags: ['gemini', 'google', 'multimodal']
    };
    
    return this.createDefaultConfig(name, { ...baseConfig, ...overrides });
  }

  /**
   * 创建 OpenAI 模型配置
   * @param {string} name - 模型名称
   * @param {Object} overrides - 覆盖的配置
   * @returns {Object} 模型配置
   */
  static createOpenAIConfig(name, overrides = {}) {
    const baseConfig = {
      name,
      provider: 'openai',
      capabilities: ['text', 'code'],
      maxTokens: 32768,
      costPer1K: 0.03,
      metadata: {
        family: 'gpt',
        organization: 'openai'
      },
      tags: ['gpt', 'openai', 'text']
    };
    
    return this.createDefaultConfig(name, { ...baseConfig, ...overrides });
  }

  /**
   * 创建 Claude 模型配置
   * @param {string} name - 模型名称
   * @param {Object} overrides - 覆盖的配置
   * @returns {Object} 模型配置
   */
  static createClaudeConfig(name, overrides = {}) {
    const baseConfig = {
      name,
      provider: 'anthropic',
      capabilities: ['text', 'code'],
      maxTokens: 200000,
      costPer1K: 0.015,
      metadata: {
        family: 'claude',
        organization: 'anthropic'
      },
      tags: ['claude', 'anthropic', 'text']
    };
    
    return this.createDefaultConfig(name, { ...baseConfig, ...overrides });
  }

  /**
   * 生成模型配置模板
   * @param {string} type - 模型类型 (gemini, openai, claude)
   * @returns {Object} 模板配置
   */
  static generateTemplate(type = 'gemini') {
    const templates = {
      gemini: {
        name: 'gemini-model-name',
        provider: 'google',
        description: 'Google Gemini model configuration',
        capabilities: ['text', 'image', 'code'],
        maxTokens: 1000000,
        costPer1K: 0.001,
        enabled: true,
        priority: 1,
        fallback: 'gemini-1.5-flash',
        aliases: ['gemini-alias'],
        metadata: {
          environment: 'production',
          owner: 'team-name'
        },
        tags: ['production', 'multimodal']
      },
      openai: {
        name: 'gpt-model-name',
        provider: 'openai',
        description: 'OpenAI GPT model configuration',
        capabilities: ['text', 'code'],
        maxTokens: 32768,
        costPer1K: 0.03,
        enabled: true,
        priority: 2,
        fallback: 'gpt-3.5-turbo',
        aliases: ['gpt-alias'],
        metadata: {
          environment: 'production',
          owner: 'team-name'
        },
        tags: ['production', 'text']
      },
      claude: {
        name: 'claude-model-name',
        provider: 'anthropic',
        description: 'Anthropic Claude model configuration',
        capabilities: ['text', 'code'],
        maxTokens: 200000,
        costPer1K: 0.015,
        enabled: true,
        priority: 3,
        fallback: 'claude-instant',
        aliases: ['claude-alias'],
        metadata: {
          environment: 'production',
          owner: 'team-name'
        },
        tags: ['production', 'text']
      }
    };
    
    return templates[type] || templates.gemini;
  }

  /**
   * 迁移旧配置到新格式
   * @param {Object} oldConfig - 旧配置
   * @returns {Object} 新配置
   */
  static migrateConfig(oldConfig) {
    const migrationMap = {
      // 旧字段 -> 新字段
      'modelName': 'name',
      'apiProvider': 'provider',
      'inputCost': 'costPer1KInput',
      'outputCost': 'costPer1KOutput',
      'active': 'enabled',
      'avgLatency': 'avgResponseTime'
    };
    
    const newConfig = { ...oldConfig };
    
    // 迁移字段
    Object.entries(migrationMap).forEach(([oldKey, newKey]) => {
      if (oldConfig[oldKey] !== undefined && newConfig[newKey] === undefined) {
        newConfig[newKey] = oldConfig[oldKey];
        delete newConfig[oldKey];
      }
    });
    
    // 确保数组字段存在
    if (!Array.isArray(newConfig.capabilities)) {
      newConfig.capabilities = ['text'];
    }
    
    if (!Array.isArray(newConfig.aliases)) {
      newConfig.aliases = [];
    }
    
    if (!Array.isArray(newConfig.tags)) {
      newConfig.tags = [];
    }
    
    if (!Array.isArray(newConfig.versions)) {
      newConfig.versions = [];
    }
    
    // 设置默认值
    if (newConfig.enabled === undefined) {
      newConfig.enabled = true;
    }
    
    if (newConfig.priority === undefined) {
      newConfig.priority = 999;
    }
    
    if (newConfig.metadata === undefined) {
      newConfig.metadata = {};
    }
    
    return newConfig;
  }

  /**
   * 比较两个模型配置是否相等
   * @param {Object} config1 - 配置1
   * @param {Object} config2 - 配置2
   * @returns {boolean} 是否相等
   */
  static isEqual(config1, config2) {
    // 比较关键字段
    const keys = ['name', 'provider', 'capabilities', 'maxTokens', 'costPer1K', 'enabled'];
    
    return keys.every(key => {
      const val1 = config1[key];
      const val2 = config2[key];
      
      if (Array.isArray(val1) && Array.isArray(val2)) {
        return JSON.stringify(val1.sort()) === JSON.stringify(val2.sort());
      }
      
      return val1 === val2;
    });
  }

  /**
   * 获取模型配置摘要
   * @param {Object} config - 模型配置
   * @returns {Object} 配置摘要
   */
  static getSummary(config) {
    return {
      name: config.name,
      provider: config.provider,
      capabilities: config.capabilities,
      maxTokens: config.maxTokens,
      costPer1K: config.costPer1K,
      enabled: config.enabled,
      priority: config.priority,
      fallback: config.fallback
    };
  }

  /**
   * 计算模型使用成本
   * @param {string} modelName - 模型名称
   * @param {number} inputTokens - 输入tokens
   * @param {number} outputTokens - 输出tokens
   * @param {Object} modelConfig - 模型配置
   * @returns {Object} 成本信息
   */
  static calculateCost(modelName, inputTokens, outputTokens, modelConfig) {
    const totalTokens = inputTokens + outputTokens;
    
    // 如果有分别的输入输出成本
    if (modelConfig.costPer1KInput && modelConfig.costPer1KOutput) {
      const inputCost = (inputTokens / 1000) * modelConfig.costPer1KInput;
      const outputCost = (outputTokens / 1000) * modelConfig.costPer1KOutput;
      const totalCost = inputCost + outputCost;
      
      return {
        modelName,
        inputTokens,
        outputTokens,
        totalTokens,
        inputCost,
        outputCost,
        totalCost,
        currency: 'USD'
      };
    }
    
    // 使用统一成本
    const costPer1K = modelConfig.costPer1K || 0;
    const totalCost = (totalTokens / 1000) * costPer1K;
    
    return {
      modelName,
      inputTokens,
      outputTokens,
      totalTokens,
      inputCost: totalCost * (inputTokens / totalTokens),
      outputCost: totalCost * (outputTokens / totalTokens),
      totalCost,
      currency: 'USD'
    };
  }
}

module.exports = ModelConfig;
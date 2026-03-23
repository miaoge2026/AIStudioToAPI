#!/usr/bin/env node

/**
 * AIStudio To API - 设置脚本
 * 自动配置项目环境和账户
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

class SetupManager {
  constructor() {
    this.projectRoot = path.resolve(__dirname, '..');
    this.configsDir = path.join(this.projectRoot, 'configs');
    this.authDir = path.join(this.configsDir, 'auth');
    this.logsDir = path.join(this.projectRoot, 'logs');
  }

  async run() {
    console.log('🚀 AIStudio To API - 设置向导');
    console.log('=====================================\n');

    try {
      // 1. 检查环境
      await this.checkEnvironment();

      // 2. 创建目录结构
      await this.createDirectories();

      // 3. 配置环境变量
      await this.configureEnvironment();

      // 4. 配置账户
      await this.configureAccounts();

      // 5. 安装依赖
      await this.installDependencies();

      // 6. 生成文档
      await this.generateDocumentation();

      console.log('\n✅ 设置完成！');
      console.log('\n下一步:');
      console.log('1. 启动服务: npm start 或 docker-compose up -d');
      console.log('2. 访问: http://localhost:3000');
      console.log('3. 查看日志: npm run logs');

    } catch (error) {
      console.error('❌ 设置失败:', error.message);
      process.exit(1);
    } finally {
      rl.close();
    }
  }

  async checkEnvironment() {
    console.log('🔍 检查运行环境...');

    // 检查 Node.js 版本
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.replace('v', '').split('.')[0]);
    
    if (majorVersion < 18) {
      throw new Error(`Node.js 版本需要 >= 18.0.0，当前版本: ${nodeVersion}`);
    }

    console.log(`✅ Node.js ${nodeVersion}`);

    // 检查 Docker（如果可用）
    try {
      execSync('docker --version', { stdio: 'ignore' });
      console.log('✅ Docker 可用');
    } catch (error) {
      console.log('⚠️  Docker 未安装（可选）');
    }

    // 检查内存
    const totalMem = require('os').totalmem();
    const totalMemGB = Math.round(totalMem / 1024 / 1024 / 1024);
    
    if (totalMemGB < 2) {
      console.log(`⚠️  建议至少 2GB 内存，当前: ${totalMemGB}GB`);
    } else {
      console.log(`✅ 内存充足: ${totalMemGB}GB`);
    }

    // 检查 Chrome
    try {
      execSync('which google-chrome || which chromium', { stdio: 'ignore' });
      console.log('✅ Chrome/Chromium 已安装');
    } catch (error) {
      console.log('⚠️  Chrome/Chromium 未找到，可能需要安装');
    }
  }

  async createDirectories() {
    console.log('\n📁 创建目录结构...');

    const dirs = [
      this.authDir,
      this.logsDir,
      path.join(this.logsDir, 'browser'),
      path.join(this.logsDir, 'app'),
      path.join(this.configsDir, 'ssl')
    ];

    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`✅ 创建目录: ${dir}`);
      }
    });

    // 设置权限
    fs.chmodSync(this.logsDir, 0o755);
    console.log('✅ 设置目录权限');
  }

  async configureEnvironment() {
    console.log('\n⚙️  配置环境变量...');

    const envFile = path.join(this.projectRoot, '.env');
    
    if (fs.existsSync(envFile)) {
      const override = await question('检测到已存在的 .env 文件，是否覆盖？(y/N): ');
      if (override.toLowerCase() !== 'y') {
        console.log('⚠️  跳过环境变量配置');
        return;
      }
    }

    const config = {
      'HOST': '0.0.0.0',
      'HTTP_PORT': '3000',
      'LOG_LEVEL': 'info',
      'STREAMING_MODE': 'real',
      'SWITCH_ON_FAILURE': 'true',
      'SWITCH_ON_USES': '10',
      'MAX_RETRIES': '3',
      'RETRY_DELAY': '1000',
      'BROWSER_TIMEOUT': '120000',
      'REQUEST_TIMEOUT': '300000',
      'IMMEDIATE_SWITCH_STATUS_CODES': '429,503',
      'BROWSER_HEADLESS': 'true',
      'BROWSER_USER_DATA_DIR': '/app/browser-data',
      'LOG_ROTATION_SIZE': '10485760',
      'LOG_ROTATION_COUNT': '5',
      'MAX_BROWSER_INSTANCES': '3',
      'CONNECTION_POOL_SIZE': '10',
      'RATE_LIMIT_ENABLED': 'true',
      'RATE_LIMIT_REQUESTS': '100',
      'ALLOWED_ORIGINS': '*',
      'METRICS_ENABLED': 'true',
      'METRICS_PORT': '9090'
    };

    // 询问用户自定义配置
    console.log('\n📝 请配置以下参数（按回车使用默认值）：');

    for (const [key, defaultValue] of Object.entries(config)) {
      const value = await question(`${key} [${defaultValue}]: `);
      config[key] = value || defaultValue;
    }

    // 生成 .env 文件
    const envContent = Object.entries(config)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    fs.writeFileSync(envFile, envContent + '\n');
    console.log('✅ 环境变量配置完成');
  }

  async configureAccounts() {
    console.log('\n🔑 配置 AI 账户...');

    const addAccount = await question('是否要添加 AI 账户？(Y/n): ');
    
    if (addAccount.toLowerCase() === 'n') {
      console.log('⚠️  跳过账户配置');
      console.log('💡 你可以稍后手动在 configs/auth/ 目录下添加账户');
      return;
    }

    const accounts = [];
    let accountIndex = 0;

    while (true) {
      console.log(`\n📋 配置账户 #${accountIndex}`);
      
      const accountName = await question('账户邮箱: ');
      if (!accountName) break;

      const cookies = await this.getCookiesFromUser();
      
      accounts.push({
        index: accountIndex,
        accountName,
        cookies,
        expired: false
      });

      const addMore = await question('是否添加更多账户？(y/N): ');
      if (addMore.toLowerCase() !== 'y') break;
      
      accountIndex++;
    }

    // 保存账户配置
    for (const account of accounts) {
      const filePath = path.join(this.authDir, `auth-${account.index}.json`);
      fs.writeFileSync(filePath, JSON.stringify(account, null, 2));
      console.log(`✅ 账户 #${account.index} 已保存`);
    }

    if (accounts.length > 0) {
      console.log('\n✅ 账户配置完成');
    }
  }

  async getCookiesFromUser() {
    console.log('\n🍪 请提供 Google 账户的 Cookies');
    console.log('💡 可以通过浏览器开发者工具获取');
    console.log('格式: [{"name":"cookie1","value":"value1"},{"name":"cookie2","value":"value2"}]');

    let cookies;
    while (true) {
      try {
        const input = await question('Cookies: ');
        cookies = JSON.parse(input);
        break;
      } catch (error) {
        console.log('❌ JSON 格式错误，请重新输入');
      }
    }
    return cookies;
  }

  async installDependencies() {
    console.log('\n📦 安装项目依赖...');

    try {
      execSync('npm install', { 
        stdio: 'inherit',
        cwd: this.projectRoot
      });
      console.log('✅ 依赖安装完成');
    } catch (error) {
      console.log('⚠️  依赖安装失败，请手动运行: npm install');
    }
  }

  async generateDocumentation() {
    console.log('\n📚 生成文档...');

    // 创建 README 链接
    const docs = [
      { name: '部署指南', path: 'docs/DEPLOYMENT.md' },
      { name: 'API 文档', path: 'docs/API.md' },
      { name: '故障排除', path: 'docs/TROUBLESHOOTING.md' }
    ];

    for (const doc of docs) {
      const docPath = path.join(this.projectRoot, doc.path);
      if (!fs.existsSync(docPath)) {
        // 创建占位文档
        const content = `# ${doc.name}\n\n文档正在生成中...`;
        fs.writeFileSync(docPath, content);
      }
    }

    console.log('✅ 文档生成完成');
  }
}

// 运行设置
if (require.main === module) {
  const setup = new SetupManager();
  setup.run().catch(console.error);
}

module.exports = SetupManager;
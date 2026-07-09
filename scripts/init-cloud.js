#!/usr/bin/env node
// ============================================================
// 云端初始化（自动建集合 + 设权限）—— 需管理员凭证
// 作用：用 CloudBase 管理 SDK 自动建好 potty_records 集合，
//       并把权限设为「所有用户可读，仅创建者可写」(READONLY)。
// 这步无法被 setup.js 的“填文件”替代，因为它要在微信服务器上
// 真正创建资源，必须你提供管理员凭证。
//
// 前置：已注册小程序 + 已开通云开发免费环境（见 setup.js 说明）。
// 凭证获取（二选一）：
//   A. 腾讯云密钥：腾讯云控制台 → 访问管理 → API密钥管理 → 新建密钥
//      得到 SecretId / SecretKey（环境需已关联腾讯云账号）。
//   B. 微信云开发私钥：云开发控制台 → 环境设置 → 环境密钥 → 下载私钥文件。
// 安装依赖：npm install @cloudbase/node-sdk @cloudbase/manager-sdk
// 用法：node scripts/init-cloud.js   （也可被 scripts/deploy.js 调用）
// ============================================================
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_JS = path.join(ROOT, 'config.js');

function ask(rl, q, def) {
  const hint = def ? ` (当前: ${def})` : '';
  return new Promise((r) => rl.question(`${q}${hint}: `, (a) => r((a || '').trim())));
}
function loadEnvId() {
  try {
    const s = fs.readFileSync(CONFIG_JS, 'utf8');
    const m = s.match(/ENV:\s*'([^']*)'/);
    return m ? m[1] : '';
  } catch (e) { return ''; }
}

// 建集合 + 设权限。可被 deploy.js 复用。返回是否成功。
async function runInitCloud() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('=== ② 初始化云端资源（建集合 + 设权限）===\n');
  console.log('需提供管理员凭证。A=腾讯云 SecretId/SecretKey；B=微信云开发私钥文件。\n');

  const envId = await ask(rl, '云开发环境 ID（cloud1-xxxx）', loadEnvId());
  if (!envId) { console.error('✗ 环境 ID 为空，已退出。'); rl.close(); return false; }

  console.log('凭证方式：A=SecretId/SecretKey  B=私钥文件');
  const mode = (await ask(rl, '选 A 还是 B？', 'A')).toUpperCase();

  let nodeSdk, managerSdk, app, manager;
  if (mode === 'A') {
    const secretId = await ask(rl, 'SecretId');
    const secretKey = await ask(rl, 'SecretKey');
    if (!secretId || !secretKey) { console.error('✗ 密钥不能为空。'); rl.close(); return false; }
    try {
      nodeSdk = require('@cloudbase/node-sdk');
      managerSdk = require('@cloudbase/manager-sdk');
    } catch (e) {
      console.error('✗ 未安装 SDK，请先运行：npm install @cloudbase/node-sdk @cloudbase/manager-sdk');
      rl.close(); return false;
    }
    const CloudBase = managerSdk.CloudBase || managerSdk; // 兼容默认/命名导出
    app = nodeSdk.init({ env: envId, secretId, secretKey });
    manager = new CloudBase({ secretId, secretKey, envId });
  } else if (mode === 'B') {
    const keyPath = await ask(rl, '私钥文件路径（如 ./private.key.json）');
    if (!keyPath || !fs.existsSync(keyPath)) { console.error('✗ 私钥文件不存在。'); rl.close(); return false; }
    const privateKey = fs.readFileSync(keyPath, 'utf8');
    try {
      nodeSdk = require('@cloudbase/node-sdk');
      managerSdk = require('@cloudbase/manager-sdk');
    } catch (e) {
      console.error('✗ 未安装 SDK，请先运行：npm install @cloudbase/node-sdk @cloudbase/manager-sdk');
      rl.close(); return false;
    }
    const CloudBase = managerSdk.CloudBase || managerSdk;
    app = nodeSdk.init({ env: envId, privateKey });
    manager = new CloudBase({ privateKey, envId });
  } else {
    console.error('✗ 未知选项。'); rl.close(); return false;
  }

  // 1) 建集合（已存在则跳过）
  try {
    await app.database().createCollection('potty_records');
    console.log('✅ 集合 potty_records 已创建');
  } catch (e) {
    if (/already|exist|已存在/i.test(e.message || '')) console.log('ℹ️ 集合 potty_records 已存在，跳过创建');
    else { console.error('✗ 创建集合失败：', e.message || e); rl.close(); return false; }
  }

  // 2) 设权限：所有用户可读，仅创建者可写 = READONLY
  try {
    await manager.commonService().call({
      Action: 'ModifyDatabaseACL',
      Param: { CollectionName: 'potty_records', EnvId: envId, AclTag: 'READONLY' },
    });
    console.log('✅ 权限已设为「所有用户可读，仅创建者可写」(READONLY)');
  } catch (e) {
    console.error('✗ 设置权限失败：', e.message || e);
    console.error('   可改去云开发控制台 → 数据库 → potty_records → 权限设置，手动选「所有用户可读，仅创建者可写」');
    rl.close(); return false;
  }

  console.log('\n🎉 云端初始化完成，可回开发者工具点「编译」联调。');
  rl.close();
  return true;
}

module.exports = { runInitCloud };
if (require.main === module) {
  runInitCloud().catch((e) => { console.error(e); process.exit(1); });
}

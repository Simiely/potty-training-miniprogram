#!/usr/bin/env node
// ============================================================
// 一键全流程部署：配置(setup) + 云端资源初始化(init-cloud) 串行执行
// 用法：node scripts/deploy.js
// 前置：已在微信公众平台注册小程序、在开发者工具开通云开发免费环境。
// 依赖：npm install @cloudbase/node-sdk @cloudbase/manager-sdk （第②步用到）
// 说明：脚本负责「填文件 + 在云端建资源」；「用你微信账号去注册/开通」
//       这两下点击仍需你本人操作，本地脚本代替不了。
// ============================================================
const { runSetup } = require('./setup');
const { runInitCloud } = require('./init-cloud');

async function main() {
  console.log('=== 如厕训练小程序 · 一键云端部署 ===\n');
  console.log('本向导依次执行：');
  console.log('  ① 填写 AppID / 环境 ID / 翻开云端开关');
  console.log('  ② 自动建集合 potty_records + 设权限（需管理员凭证）\n');

  const ok1 = await runSetup();
  if (!ok1) { console.error('\n配置未完成，已停止。'); process.exit(1); }

  console.log('\n----------------------------------------\n');
  const ok2 = await runInitCloud();
  if (!ok2) {
    console.error('\n云端资源初始化未完成。');
    console.error('可稍后单独运行  node scripts/init-cloud.js  重试，或去控制台手动建集合。');
    process.exit(1);
  }

  console.log('\n✅ 全流程完成！回开发者工具点「编译」即可联调。');
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

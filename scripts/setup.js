#!/usr/bin/env node
// ============================================================
// 云端配置向导（新手友好）—— 填文件部分
// 作用：把你在微信后台 / 云开发控制台「手动拿到」的 AppID、环境 ID，
//       交互式输入后自动写进工程文件，并翻开云端开关。
// 不能代替的：在微信服务器上「注册 AppID / 开通云环境 / 建集合」
//       这些需要人工登录认证，本地脚本做不了，仍需你手动点。
// 用法：node scripts/setup.js   （也可被 scripts/deploy.js 调用）
// ============================================================
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const PROJECT_CONFIG = path.join(ROOT, 'project.config.json');
const CONFIG_JS = path.join(ROOT, 'config.js');

function ask(rl, question, def) {
  const hint = def ? ` (当前: ${def}，回车保留)` : '';
  return new Promise((resolve) => {
    rl.question(`${question}${hint}: `, (a) => resolve((a || '').trim()));
  });
}
function backup(p) {
  const bak = p + '.bak';
  if (!fs.existsSync(bak)) fs.copyFileSync(p, bak);
}

// 填文件：写 AppID / 环境 ID / 翻开关。可被 deploy.js 复用。
async function runSetup() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('=== ① 填写云端配置（AppID / 环境 ID / 开关）===\n');

  let pc = {};
  try { pc = JSON.parse(fs.readFileSync(PROJECT_CONFIG, 'utf8')); } catch (e) {}
  const curAppid = pc.appid || '';
  const curCfg = fs.readFileSync(CONFIG_JS, 'utf8');
  const envMatch = curCfg.match(/ENV:\s*'([^']*)'/);
  const curEnv = envMatch ? envMatch[1] : '';

  const appid = await ask(rl, '小程序 AppID（wx 开头，微信公众平台→开发设置里复制）', curAppid);
  const envId = await ask(rl, '云开发环境 ID（cloud1-xxxx，云开发控制台左上角复制）', curEnv);
  const flip = (await ask(rl, '是否开启云端模式 USE_CLOUD=true？ (y/n)', 'y')).toLowerCase();
  const useCloud = flip === '' || flip === 'y';

  if (appid && !/^wx/i.test(appid)) {
    console.error('\n✗ AppID 应以 wx 开头，已退出，未改动任何文件。');
    rl.close(); return false;
  }
  if (!envId) {
    console.error('\n✗ 环境 ID 不能为空，已退出，未改动任何文件。');
    rl.close(); return false;
  }

  backup(PROJECT_CONFIG);
  backup(CONFIG_JS);
  pc.appid = appid;
  fs.writeFileSync(PROJECT_CONFIG, JSON.stringify(pc, null, 2) + '\n', 'utf8');
  let s = curCfg;
  if (envId) s = s.replace(/ENV:\s*''/, `ENV: '${envId}'`);
  if (useCloud) s = s.replace(/const USE_CLOUD = false;/, 'const USE_CLOUD = true;');
  fs.writeFileSync(CONFIG_JS, s, 'utf8');

  console.log(`\n✅ 已写入：project.config.json → appid = ${appid}`);
  console.log(`✅ 已写入：config.js → ENV = ${envId}, USE_CLOUD = ${useCloud ? 'true' : 'false'}`);
  console.log('（原文件已备份为 .bak，可随时还原）');
  rl.close();
  return true;
}

module.exports = { runSetup };
if (require.main === module) {
  runSetup().catch((e) => { console.error(e); process.exit(1); });
}

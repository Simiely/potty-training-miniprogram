#!/usr/bin/env node
// ============================================================
// 云端配置向导（新手友好）
// 作用：把你在微信后台 / 云开发控制台「手动拿到」的 AppID、环境 ID，
//       交互式输入后自动写进工程文件，并翻开云端开关。
// 不能代替的：在微信服务器上「注册 AppID / 开通云环境 / 建集合」
//       这些需要人工登录认证，本地脚本做不了，仍需你手动点。
// 用法：node scripts/setup.js   （在工程根目录执行）
// ============================================================
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const PROJECT_CONFIG = path.join(ROOT, 'project.config.json');
const CONFIG_JS = path.join(ROOT, 'config.js');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
function ask(question, def) {
  const hint = def ? ` (当前: ${def}，回车保留)` : '';
  return new Promise((resolve) => {
    rl.question(`${question}${hint}: `, (a) => resolve((a || '').trim()));
  });
}
function backup(p) {
  const bak = p + '.bak';
  if (!fs.existsSync(bak)) fs.copyFileSync(p, bak);
}

(async () => {
  console.log('=== 如厕训练小程序 · 云端配置向导 ===\n');

  // 读当前值，作为默认值展示
  let pc = {};
  try { pc = JSON.parse(fs.readFileSync(PROJECT_CONFIG, 'utf8')); } catch (e) {}
  const curAppid = pc.appid || '';
  const curCfg = fs.readFileSync(CONFIG_JS, 'utf8');
  const envMatch = curCfg.match(/ENV:\s*'([^']*)'/);
  const curEnv = envMatch ? envMatch[1] : '';

  const appid = await ask('① 小程序 AppID（wx 开头，微信公众平台→开发设置里复制）', curAppid);
  const envId = await ask('② 云开发环境 ID（cloud1-xxxx，云开发控制台左上角复制）', curEnv);
  const flip = (await ask('③ 是否开启云端模式 USE_CLOUD=true？ (y/n)', 'y')).toLowerCase();
  const useCloud = flip === '' || flip === 'y';

  // 基本校验，避免写脏数据
  if (appid && !/^wx/i.test(appid)) {
    console.error('\n✗ AppID 应以 wx 开头，已退出，未改动任何文件。');
    rl.close(); process.exit(1);
  }
  if (!envId) {
    console.error('\n✗ 环境 ID 不能为空，已退出，未改动任何文件。');
    rl.close(); process.exit(1);
  }

  backup(PROJECT_CONFIG);
  backup(CONFIG_JS);

  // 写 project.config.json 的 appid
  pc.appid = appid;
  fs.writeFileSync(PROJECT_CONFIG, JSON.stringify(pc, null, 2) + '\n', 'utf8');

  // 写 config.js 的 ENV 与 USE_CLOUD
  let s = curCfg;
  if (envId) s = s.replace(/ENV:\s*''/, `ENV: '${envId}'`);
  if (useCloud) s = s.replace(/const USE_CLOUD = false;/, 'const USE_CLOUD = true;');
  fs.writeFileSync(CONFIG_JS, s, 'utf8');

  console.log('\n✅ 已写入：');
  console.log(`  project.config.json → appid = ${appid}`);
  console.log(`  config.js → ENV = ${envId}, USE_CLOUD = ${useCloud ? 'true' : 'false'}`);
  console.log('（原文件已备份为 .bak，可随时还原）\n');
  console.log('下一步：在云开发控制台新建集合 potty_records 并设权限（见向导说明）。');
  rl.close();
})();

// ============================================================
// 平台识别（HarmonyOS 适配，依据微信官方 HarmonyOS 适配文档）
// 真机纯血鸿蒙：wx.getDeviceInfo().platform === 'ohos'
// 开发者工具模拟鸿蒙：platform === 'devtools' 且 system === 'HarmonyOS'
// 该值在 app.js onLaunch 时由 wx.getDeviceInfo() 计算并写入 globalData.isHarmony
// ============================================================
function appGlobal() {
  const app = typeof getApp === 'function' ? getApp() : null;
  return (app && app.globalData) || {};
}

function isHarmonyOS() {
  return !!appGlobal().isHarmony;
}

function getPlatform() {
  return appGlobal().platform || '';
}

function getSystem() {
  return appGlobal().system || '';
}

module.exports = { isHarmonyOS, getPlatform, getSystem };

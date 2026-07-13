// ============================================================
// 统一存储层：根据 config.USE_CLOUD 在「本地存储」与「云开发」间切换。
// 页面只依赖本文件，无需关心后端。所有方法均返回 Promise，方便统一 async/await。
// 记录结构统一为 { id, type, timestamp, recorder }（recorder 可能为 null）。
// ============================================================
const local = require('./storage');
const cloud = require('./cloud');
const { USE_CLOUD, CLOUD } = require('../config');

// 是否启用云端：开关打开 + wx.cloud 可用 + 已配置环境 ID
function cloudReady() {
  return !!(USE_CLOUD && typeof wx !== 'undefined' && wx.cloud && CLOUD.ENV);
}

module.exports = {
  cloudReady,

  getRecords() {
    return cloudReady() ? cloud.getRecords() : Promise.resolve(local.getRecords());
  },

  addRecord(type, recorder) {
    if (cloudReady()) return cloud.addRecord(type, recorder);
    const rec = local.addRecord(type, recorder);
    return Promise.resolve(rec);
  },

  deleteRecord(id) {
    if (cloudReady()) return cloud.deleteRecord(id);
    local.deleteRecord(id);
    return Promise.resolve();
  },

  updateRecord(id, updates) {
    if (cloudReady()) return cloud.updateRecord(id, updates);
    local.updateRecord(id, updates);
    return Promise.resolve();
  },

  clearAllRecords() {
    if (cloudReady()) return cloud.clearAllRecords();
    local.clearAllRecords();
    return Promise.resolve();
  },

  getTodayRecords() {
    return cloudReady() ? cloud.getTodayRecords() : Promise.resolve(local.getTodayRecords());
  },

  getGroupedRecords() {
    return cloudReady() ? cloud.getGroupedRecords() : Promise.resolve(local.getGroupedRecords());
  },

  dateKey: local.dateKey,

  // 云模式：获取当前用户 openid（用于账号级归属判断）
  getCurrentOpenid() {
    return cloud.getCurrentOpenid();
  },
};

// ============================================================
// 统一存储层：根据 config.USE_CLOUD 在「本地存储」与「云开发」间切换。
// 页面只依赖本文件，无需关心后端。所有方法均返回 Promise，方便统一 async/await。
// 记录结构统一为 { id, type, timestamp, deviceId, recorder }（recorder 可能为 null）。
//
// 内存缓存（P1）：getRecords 拉回的全量记录会缓存到 _cache，
// getTodayRecords / getGroupedRecords 直接从缓存派生，避免同一次进页面
// 重复分页请求（分页后一次全量 = 多次 20 条查询，重复拉取代价明显）。
// 任何写操作（增/删/改/清空）都会失效缓存；下拉刷新传 forceRefresh=true 强制重拉。
// ============================================================
const local = require('./storage');
const cloud = require('./cloud');
const { USE_CLOUD, CLOUD } = require('../config');

// 是否启用云端：开关打开 + wx.cloud 可用 + 已配置环境 ID
function cloudReady() {
  return !!(USE_CLOUD && typeof wx !== 'undefined' && wx.cloud && CLOUD.ENV);
}

// —— 内存缓存（按时间维度分桶）——
// key = 'all' 表示全量（历史/分析/清空使用）；key = 'd'+N 表示最近 N 天（首页预测使用）。
// 首页只拉 7 天、历史/分析拉全量，两者缓存互不污染，且首页不会因拉全量拖慢首屏。
let _cache = {};

function invalidateCache() {
  _cache = {};
}

function cacheKey(days) {
  return days ? 'd' + days : 'all';
}

// 拉取记录（带分桶缓存）。forceRefresh=true 时跳过缓存重新拉取。
// days：可选，传入数字 N 时只取最近 N 天（云模式服务端加 timestamp 下界，本地模式拉全量后过滤）。
function fetchRecords(forceRefresh, days) {
  const key = cacheKey(days);
  if (_cache[key] && !forceRefresh) return Promise.resolve(_cache[key]);
  const p = cloudReady() ? cloud.getRecords(days) : Promise.resolve(local.getRecords());
  return p.then((list) => {
    let out = list;
    if (days) {
      const cutoff = new Date(Date.now() - days * 86400000).toISOString();
      out = list.filter((r) => r.timestamp >= cutoff);
    }
    _cache[key] = out;
    return out;
  });
}

// 按本地日期分组（云/本地统一在此派生，保证结构一致）
function groupByDate(all) {
  const map = {};
  all.forEach((r) => {
    const d = local.dateKey(r.timestamp);
    if (!map[d]) map[d] = [];
    map[d].push(r);
  });
  return Object.keys(map)
    .map((date) => {
      const records = map[date].sort(
        (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
      );
      return {
        date,
        records,
        poopCount: records.filter((r) => r.type === 'poop').length,
        peeCount: records.filter((r) => r.type === 'pee').length,
        underwearCount: records.filter((r) => r.type === 'underwear').length,
        diaperCount: records.filter((r) => r.type === 'diaper').length,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

module.exports = {
  cloudReady,
  invalidateCache,

  // forceRefresh：下拉刷新等场景传 true，跳过缓存
  // days：可选，传数字 N 只取最近 N 天（首页优化）；不传则全量
  getRecords(forceRefresh = false, days) {
    return fetchRecords(forceRefresh, days);
  },

  getTodayRecords(forceRefresh = false) {
    return fetchRecords(forceRefresh).then((all) => {
      const today = local.dateKey(Date.now());
      return all.filter((r) => local.dateKey(r.timestamp) === today);
    });
  },

  getGroupedRecords(forceRefresh = false) {
    return fetchRecords(forceRefresh).then((all) => groupByDate(all));
  },

  addRecord(type, recorder) {
    invalidateCache();
    if (cloudReady()) return cloud.addRecord(type, recorder);
    return Promise.resolve(local.addRecord(type, recorder));
  },

  deleteRecord(id) {
    invalidateCache();
    if (cloudReady()) return cloud.deleteRecord(id);
    local.deleteRecord(id);
    return Promise.resolve();
  },

  updateRecord(id, updates) {
    invalidateCache();
    if (cloudReady()) return cloud.updateRecord(id, updates);
    local.updateRecord(id, updates);
    return Promise.resolve();
  },

  clearAllRecords() {
    invalidateCache();
    if (cloudReady()) return cloud.clearAllRecords();
    local.clearAllRecords();
    return Promise.resolve();
  },

  dateKey: local.dateKey,

  // 云模式：获取当前用户 openid（用于账号级归属判断）
  getCurrentOpenid() {
    return cloud.getCurrentOpenid();
  },
};

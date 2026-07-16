// ============================================================
// 统一存储层：根据 config.USE_CLOUD 在「本地存储」与「云开发」间切换。
// 页面只依赖本文件，无需关心后端。所有方法均返回 Promise，方便统一 async/await。
// 记录结构统一为 { id, type, timestamp, deviceId, recorder }（recorder 可能为 null）。
//
// 缓存策略：「历史记录只读、缓存一次永久有效；只有今天的记录可增删改」。
//   - 首次全量拉取后，所有【非今天】记录持久化到 Storage（HISTORY_KEY），之后
//     每次打开直接命中本地缓存，不再请求云端（历史从不改变 → 缓存永不过期）。
//   - 【今天】记录每次打开仅增量刷新（1 次小查询），保持新鲜。
//   - 派生（d7 / 分组）从「历史 + 今天」合并结果计算，避免重复分页。
//   - 下拉刷新传 forceRefresh=true 跳过缓存、全量重拉（用户主动操作）。
// ============================================================
const local = require('./storage');
const cloud = require('./cloud');
const { USE_CLOUD, CLOUD } = require('../config');

// 是否启用云端：开关打开 + wx.cloud 可用 + 已配置环境 ID
function cloudReady() {
  return !!(USE_CLOUD && typeof wx !== 'undefined' && wx.cloud && CLOUD.ENV);
}

// —— 持久化缓存层（历史永久 + 今天增量）——
// 设计：「历史记录只读、缓存一次永久有效；只有今天的记录可增删改」。
//   _historyCache 保存所有【非今天】记录，首次全量拉取后持久化到 Storage，
//   之后每次打开直接命中本地缓存，不再请求云端（历史从不改变 → 缓存永不过期）。
//   _todayCache 保存【今天】记录，每次打开增量刷新（1 次小查询）保持新鲜。
//   跨天（如隔夜后再开）时，旧的「今天」自动并入历史缓存，无缝衔接。
//   冷启动先读 Storage 秒显，云读取从「每次打开全量分页」降到「仅当天一次小查询」。
//   Storage 持久化跨冷启动有效（wx.setStorageSync 重启仍在，单 key ≤1MB/总 ≤10MB）。
const CACHE_PREFIX = 'potty_cache_' + (CLOUD.ENV || 'local') + '_';
const HISTORY_KEY = CACHE_PREFIX + 'history';  // 永久历史缓存（非今天）
const TODAY_KEY = CACHE_PREFIX + 'today';      // 今天记录（仅冷启动秒显用，每次打开重刷）
const TODAY_COOLDOWN_MS = 30 * 1000; // 同会话内短时间重复 onShow 不去云端（避免切 tab 狂刷）

let _historyCache = null;     // 非今天记录（永久，命中 Storage 即不再请求云端）
let _todayCache = null;       // 今天记录（内存，每次打开刷新）
let _todayDateKey = '';       // _todayCache 对应的日期 key（用于跨天滚动检测）
let _memBuckets = {};         // 派生桶（d7 / 分组等）内存缓存
let _lastTodayRefresh = 0;    // 上次刷新当天记录的时间戳（内存，冷启动归零）

function _todayKeyNow() { return local.dateKey(Date.now()); }
function _storageSizeOk(list) {
  try { return JSON.stringify(list).length < 900 * 1024; } catch (e) { return false; }
}

// 历史缓存：永久持久化（历史从不改变，命中即不再请求云端）
function loadHistoryFromStorage() {
  try {
    const c = wx.getStorageSync(HISTORY_KEY);
    if (c && Array.isArray(c.data)) { _historyCache = c.data; return true; }
  } catch (e) { /* ignore */ }
  return false;
}
function saveHistoryToStorage() {
  if (!_historyCache || !_storageSizeOk(_historyCache)) return; // 超大不持久化，回退云端直读
  try { wx.setStorageSync(HISTORY_KEY, { ts: Date.now(), data: _historyCache }); } catch (e) { /* ignore */ }
}

// 今天缓存：仅作冷启动秒显；日期改变或刷新后会被云端覆盖
function loadTodayFromStorage() {
  try {
    const c = wx.getStorageSync(TODAY_KEY);
    if (c && Array.isArray(c.data)) {
      _todayCache = c.data;
      _todayDateKey = c.dateKey || _todayKeyNow();
      return true;
    }
  } catch (e) { /* ignore */ }
  return false;
}
function saveTodayToStorage() {
  if (!_todayCache) return;
  try { wx.setStorageSync(TODAY_KEY, { dateKey: _todayDateKey, data: _todayCache }); } catch (e) { /* ignore */ }
}

function invalidateCache() {
  _memBuckets = {};
  _historyCache = null;
  _todayCache = null;
  _todayDateKey = '';
  try { wx.removeStorageSync(HISTORY_KEY); } catch (e) { /* ignore */ }
  try { wx.removeStorageSync(TODAY_KEY); } catch (e) { /* ignore */ }
}
function cacheKey(days) {
  return days ? 'd' + days : 'all';
}

// 确保缓存就绪：优先内存历史 → Storage 历史（永久）→（必要时）云端/本地全量拉取并拆分。
// 返回 true 表示本次做了全量拉取（已含当天，无需再增量刷当天）。
async function ensureLoaded(forceRefresh) {
  let didFull = false;
  if (forceRefresh || !_historyCache) {
    if (!forceRefresh && loadHistoryFromStorage()) {
      // 命中永久历史缓存，跳过云端全量拉取
    } else {
      const all = cloudReady() ? await cloud.getRecords() : local.getRecords();
      _historyCache = all.filter((r) => local.dateKey(r.timestamp) !== _todayKeyNow());
      _todayCache = all.filter((r) => local.dateKey(r.timestamp) === _todayKeyNow());
      _todayDateKey = _todayKeyNow();
      saveHistoryToStorage();
      saveTodayToStorage();
      _lastTodayRefresh = Date.now();
      didFull = true;
    }
  }
  if (!_todayCache) loadTodayFromStorage(); // 冷启动秒显（可能来自上一会话的「今天」）
  return didFull;
}

// 增量刷新当天记录：仅查 timestamp >= 今天0点，覆盖 _todayCache。
// 跨天场景：旧的「今天」自动并入历史缓存（历史永久有效），再拉取新的一天。
// force=true 时忽略冷却（写操作后强制同步）。本地模式从本地存储取今天。
async function refreshTodayIfNeeded(force) {
  const now = Date.now();
  const curKey = _todayKeyNow();
  // 跨天：上一会话的「今天」现在已成历史，并入永久缓存
  if (_todayCache && _todayDateKey && _todayDateKey !== curKey) {
    _historyCache = (_historyCache || []).concat(_todayCache);
    saveHistoryToStorage();
    _todayCache = null;
    _todayDateKey = curKey;
  }
  if (!force && now - _lastTodayRefresh < TODAY_COOLDOWN_MS) return;
  _lastTodayRefresh = now;
  try {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const startISO = d.toISOString();
    const todays = cloudReady()
      ? await cloud.getRecordsToday(startISO)
      : local.getRecords().filter((r) => local.dateKey(r.timestamp) === curKey);
    _todayCache = todays;
    _todayDateKey = curKey;
    saveTodayToStorage();
  } catch (e) {
    console.warn('[store] refresh today failed, keep cache:', e);
  }
}

// 拉取记录（历史永久缓存 + 今天增量）。forceRefresh=true 时跳过缓存全量重拉。
// days：可选，传数字 N 仅返回最近 N 天（首页优化）。
async function fetchRecords(forceRefresh, days) {
  const key = cacheKey(days);
  if (_memBuckets[key] && !forceRefresh) return _memBuckets[key];
  const didFull = await ensureLoaded(forceRefresh);
  if (!forceRefresh && !didFull) await refreshTodayIfNeeded(false);
  let out = (_historyCache || []).concat(_todayCache || []);
  if (days) {
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    out = out.filter((r) => r.timestamp >= cutoff);
  }
  _memBuckets[key] = out;
  return out;
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

  async addRecord(type, recorder) {
    _memBuckets = {};
    if (cloudReady()) {
      const rec = await cloud.addRecord(type, recorder);
      await refreshTodayIfNeeded(true); // 新记录必属今天，只刷今天
      return rec;
    }
    const rec = local.addRecord(type, recorder);
    await ensureLoaded(true);
    return rec;
  },

  async deleteRecord(id) {
    _memBuckets = {};
    if (cloudReady()) {
      await cloud.deleteRecord(id);
      await refreshTodayIfNeeded(true); // 只有今天的记录可被删，仅刷今天
      return;
    }
    local.deleteRecord(id);
    await ensureLoaded(true);
    return;
  },

  async updateRecord(id, updates) {
    _memBuckets = {};
    if (cloudReady()) {
      await cloud.updateRecord(id, updates);
      await refreshTodayIfNeeded(true); // 修改后的记录默认仍在今天，只刷今天
      // 仅当编辑把时间改到了历史某天：补拉那一天并入永久历史缓存，避免历史视图漏记
      if (updates && updates.timestamp) {
        const newKey = local.dateKey(updates.timestamp);
        if (newKey !== _todayKeyNow()) {
          try {
            const thatDay = await cloud.getRecordsByDate(newKey);
            _historyCache = (_historyCache || [])
              .filter((r) => local.dateKey(r.timestamp) !== newKey)
              .concat(thatDay);
            saveHistoryToStorage();
          } catch (e) {
            console.warn('[store] fetch moved date failed, history may refresh on next open:', e);
          }
        }
      }
      return;
    }
    local.updateRecord(id, updates);
    await ensureLoaded(true);
    return;
  },

  async clearAllRecords() {
    _memBuckets = {};
    if (cloudReady()) {
      await cloud.clearAllRecords();
    } else {
      local.clearAllRecords();
    }
    _historyCache = [];
    _todayCache = [];
    _todayDateKey = '';
    saveHistoryToStorage();
    saveTodayToStorage();
    return;
  },

  dateKey: local.dateKey,

  // 云模式：获取当前用户 openid（用于账号级归属判断）
  getCurrentOpenid() {
    return cloud.getCurrentOpenid();
  },
};

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

// —— 持久化缓存层（内存 → 本地 Storage → 云端）——
// 设计（源自「每次打开刷新当天、其余用缓存」策略）：
//   _fullCache 保存全量记录（内存真源）。冷启动先读 Storage 秒显；
//   每个打开仅增量刷新「当天」记录（1 次小查询），历史记录全部命中缓存，
//   从而把云读取从「每次打开全量分页」降到「每次打开仅当天」。
//   Storage 持久化跨冷启动有效（wx.setStorageSync 重启仍在，单 key ≤1MB/总 ≤10MB）。
const CACHE_PREFIX = 'potty_cache_' + (CLOUD.ENV || 'local') + '_';
const FULL_KEY = CACHE_PREFIX + 'all';
const TODAY_COOLDOWN_MS = 30 * 1000; // 同会话内短时间重复 onShow 不去云端（避免切 tab 狂刷）

let _fullCache = null;     // 全量记录（内存，真源）
let _memBuckets = {};      // 派生桶（d7 等）内存缓存
let _lastTodayRefresh = 0; // 上次刷新当天记录的时间戳（内存，冷启动归零）

function _storageSizeOk(list) {
  try { return JSON.stringify(list).length < 900 * 1024; } catch (e) { return false; }
}
function loadFullFromStorage() {
  try {
    const c = wx.getStorageSync(FULL_KEY);
    if (c && Array.isArray(c.data)) { _fullCache = c.data; return true; }
  } catch (e) { /* ignore */ }
  return false;
}
function saveFullToStorage() {
  if (!_fullCache || !_storageSizeOk(_fullCache)) return; // 超大不持久化，回退云端直读
  try { wx.setStorageSync(FULL_KEY, { ts: Date.now(), data: _fullCache }); } catch (e) { /* ignore */ }
}
function invalidateCache() {
  _memBuckets = {};
  _fullCache = null;
  try { wx.removeStorageSync(FULL_KEY); } catch (e) { /* ignore */ }
}
function cacheKey(days) {
  return days ? 'd' + days : 'all';
}

// 确保 _fullCache 已就绪：优先内存 → Storage →（必要时）云端/本地全量拉取。
// 返回 true 表示本次做了全量拉取（已含当天，无需再增量刷当天）。
async function ensureFullLoaded(forceRefresh) {
  if (_fullCache && !forceRefresh) return false;
  if (!_fullCache) {
    if (loadFullFromStorage() && !forceRefresh) { /* 命中 Storage，跳过云端 */ }
    else {
      _fullCache = cloudReady() ? await cloud.getRecords() : local.getRecords();
      saveFullToStorage();
      _lastTodayRefresh = Date.now();
      return true;
    }
  } else if (forceRefresh) {
    _fullCache = cloudReady() ? await cloud.getRecords() : local.getRecords();
    saveFullToStorage();
    _lastTodayRefresh = Date.now();
    return true;
  }
  return false;
}

// 增量刷新当天记录：仅查 timestamp >= 今天0点，merge 进 _fullCache。
// force=true 时忽略冷却（写操作后强制同步）。
async function refreshTodayIfNeeded(force) {
  const now = Date.now();
  if (!force && now - _lastTodayRefresh < TODAY_COOLDOWN_MS) return;
  _lastTodayRefresh = now;
  try {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const startISO = d.toISOString();
    const todays = cloudReady() ? await cloud.getRecordsToday(startISO) : [];
    const tk = local.dateKey(Date.now());
    _fullCache = (_fullCache || []).filter((r) => local.dateKey(r.timestamp) !== tk).concat(todays);
    saveFullToStorage();
  } catch (e) {
    console.warn('[store] refresh today failed, keep cache:', e);
  }
}

// 写操作后同步：add/update 只刷当天（便宜，变化通常在今天）；
// delete/clear 全量重拉（保证历史删除即时生效）。
async function syncAfterWrite(full) {
  _memBuckets = {};
  if (full) {
    _fullCache = cloudReady() ? await cloud.getRecords() : local.getRecords();
  } else {
    await refreshTodayIfNeeded(true);
  }
  saveFullToStorage();
}

// 拉取记录（带三层缓存）。forceRefresh=true 时跳过缓存全量重拉。
// days：可选，传数字 N 仅返回最近 N 天（首页优化）。
async function fetchRecords(forceRefresh, days) {
  const key = cacheKey(days);
  if (_memBuckets[key] && !forceRefresh) return _memBuckets[key];
  const didFull = await ensureFullLoaded(forceRefresh);
  if (!forceRefresh && !didFull) await refreshTodayIfNeeded(false);
  let out = _fullCache || [];
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
      await syncAfterWrite(false);
      return rec;
    }
    const rec = local.addRecord(type, recorder);
    _fullCache = local.getRecords();
    saveFullToStorage();
    return rec;
  },

  async deleteRecord(id) {
    _memBuckets = {};
    if (cloudReady()) {
      await cloud.deleteRecord(id);
      await syncAfterWrite(true);
      return;
    }
    local.deleteRecord(id);
    _fullCache = local.getRecords();
    saveFullToStorage();
    return;
  },

  async updateRecord(id, updates) {
    _memBuckets = {};
    if (cloudReady()) {
      await cloud.updateRecord(id, updates);
      await syncAfterWrite(true); // 编辑可能针对历史记录，全量重拉保证即时生效
      return;
    }
    local.updateRecord(id, updates);
    _fullCache = local.getRecords();
    saveFullToStorage();
    return;
  },

  async clearAllRecords() {
    _memBuckets = {};
    if (cloudReady()) {
      await cloud.clearAllRecords();
    } else {
      local.clearAllRecords();
    }
    _fullCache = [];
    saveFullToStorage();
    return;
  },

  dateKey: local.dateKey,

  // 云模式：获取当前用户 openid（用于账号级归属判断）
  getCurrentOpenid() {
    return cloud.getCurrentOpenid();
  },
};

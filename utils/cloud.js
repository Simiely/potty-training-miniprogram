// ============================================================
// 云开发数据层（方案 B：跨设备共享记录）
// 集合 potty_records 文档结构：
//   { _id, _openid, type, timestamp(ISO), deviceId, recorder:{nickname, avatarUrl} }
// _openid 由微信云开发自动注入，标识记录创建者的微信账号。
// 当前用户的 _openid 通过「探针法」精确获取（新增一条临时记录→读其 _openid→立即删除），并持久化，用于 canDelete 判断。
// ============================================================
const { CLOUD } = require('../config');
const { getDeviceId } = require('./device');

// 云初始化必须只调用一次。微信云 SDK 重复调用 wx.cloud.init() 会触发内部
// bug「Cannot read property 'stat' of undefined (sendInitRequest)」，表现为
// 控制台红色 cloud init error。用模块级布尔锁保证幂等，任何调用方都走这里。
let _cloudInitialized = false;
function initCloud(env) {
  if (_cloudInitialized) return true;
  if (typeof wx === 'undefined' || !wx.cloud || !env) return false;
  try {
    wx.cloud.init({ env, traceUser: true });
    _cloudInitialized = true;
    return true;
  } catch (e) {
    console.warn('[cloud] init failed:', e);
    _cloudInitialized = false;
    return false;
  }
}

// 当前用户的 openid：优先用内存缓存 / 持久化存储，否则用探针法检测。
// 历史「多数票检测」会因多人记录混合而误判（把自己判成出现最多的他人），
// 故已废弃，改用探针法（add 临时记录读 _openid 再 remove，零残留、100% 可靠）。
const MY_OPENID_KEY = 'my_openid';
let _currentOpenid = '';

async function getCurrentOpenid() {
  if (_currentOpenid) return _currentOpenid;

  // 1) 内存无 → 读持久化存储（之前会话/新增记录时已写入，覆盖同账号跨设备场景）
  try {
    const saved = wx.getStorageSync(MY_OPENID_KEY);
    if (saved) {
      _currentOpenid = saved;
      console.log('[cloud] openid restored from storage ✓');
      return _currentOpenid;
    }
  } catch (e) { /* ignore */ }

  // 2) 仍无 → 探针法精确识别当前微信账号（无需部署云函数，零残留）
  try {
    const oid = await detectOpenidByProbe();
    if (oid) {
      _currentOpenid = oid;
      try { wx.setStorageSync(MY_OPENID_KEY, oid); } catch (e) { /* ignore */ }
      console.log('[cloud] openid detected via probe ✓');
      return _currentOpenid;
    }
  } catch (e) {
    console.warn('[cloud] probe detect failed:', e.message);
  }

  return '';
}

// 探针法：新增一条临时记录 → 读取其自动注入的 _openid（必为当前账号）→ 立即删除。
// 规避「多数票检测」在多人数据混合时把自己误判成他人的问题。
async function detectOpenidByProbe() {
  // 清理历史探针残留（上次 remove 若因网络失败会留下 _probe 记录，避免累积）
  try {
    const _ = db().command;
    const stale = await coll().where({ _probe: _.exists(true) }).limit(100).get();
    await Promise.all((stale.data || []).map((d) => coll().doc(d._id).remove().catch(() => {})));
  } catch (e) { /* 忽略，不影响本次探测 */ }

  const tmp = await coll().add({
    data: { _probe: true, timestamp: new Date().toISOString(), deviceId: getDeviceId() },
  });
  try {
    const doc = await coll().doc(tmp._id).get();
    return doc.data && doc.data._openid ? doc.data._openid : '';
  } finally {
    try { await coll().doc(tmp._id).remove(); } catch (e) { /* 残留会被 normalize 过滤 */ }
  }
}

function db() {
  return wx.cloud.database({ env: CLOUD.ENV });
}
function coll() {
  return db().collection(CLOUD.COLLECTION_RECORDS);
}

// 本地日期 key（与 storage.js 保持一致）
function dateKey(ts) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 把 cloud://fileID 批量转为临时可下载链接，复用带缓存+持久化的 toTempUrlBatch，
// 冷启动也能命中（不再每次打开都重新请求 getTempFileURL）。
async function attachAvatars(list) {
  const fileIds = [];
  const positions = [];
  list.forEach((r, ri) => {
    if (r.recorder && r.recorder.avatarUrl && r.recorder.avatarUrl.startsWith('cloud://')) {
      fileIds.push(r.recorder.avatarUrl);
      positions.push(ri);
    }
  });
  if (fileIds.length === 0) return;
  const map = await toTempUrlBatch(fileIds);
  positions.forEach((i) => {
    const url = map[list[i].recorder.avatarUrl];
    if (url) list[i].recorder.avatarUrl = url;
  });
}

// 把云端文档归一化为页面通用结构（用 id 统一代替 _id），
// 同时透传 _openid 为 creatorOpenid 供账号级归属判断。
function normalize(list) {
  return list
    .filter((r) => !r._probe) // 排除探针残留，避免泄漏到 UI
    .map((r) => ({
      id: r._id,
      type: r.type,
      timestamp: r.timestamp,
      deviceId: r.deviceId || '',
      creatorOpenid: r._openid || '',
      recorder: r.recorder || null,
    }));
}

// 小程序端 collection.get() 硬性上限 20 条/次,必须分页循环取全量。
// 采用顺序分页(对标已发布体验版,实测读取快且稳):逐页 await,直到某页
// 记录数 < 20(末页)即停止。不依赖 count(),规避部分基础库 count() 不应用
// where 过滤而误返回 0、导致「静默空数据、无报错」的坑。
// 分页游标用 skip(偏移量):相比 timestamp 游标(lt)不会在「同一毫秒多条记录
// 正好落在页边界」时漏掉与末条同时间戳的其余记录。数据量 <1000 时 skip 开销
// 可忽略;若以后量很大再迁移到云函数端(服务端无 20 条限制)。
// where({timestamp: exists(true)}) 是恒真条件,仅用于规避空查询「扫全表」告警。
// days：可选。传入数字 N 时只取最近 N 天（首页优化，减少云读取量）；
// 不传则全量（历史/分析/清空使用）。ISO 字符串字典序与时间序一致，gte 可直接比较。
async function getRecords(days) {
  const PAGE_SIZE = 20;
  const _ = db().command; // 注意: db 是函数,必须用 db().command
  const query = days
    ? { timestamp: _.gte(new Date(Date.now() - days * 86400000).toISOString()) }
    : { timestamp: _.exists(true) };
  try {
    const all = [];
    let skip = 0;
    while (true) {
      const res = await coll()
        .where(query)
        .orderBy('timestamp', 'desc')
        .skip(skip)
        .limit(PAGE_SIZE)
        .get();
      const page = res.data || [];
      all.push(...page);
      if (page.length < PAGE_SIZE) break; // 最后一页,已取完
      skip += PAGE_SIZE;
    }
    const list = normalize(all);
    await attachAvatars(list);
    return list;
  } catch (e) {
    // 不再静默返回空/部分数据,向上抛出清晰错误,让页面能提示用户
    console.error('[cloud] getRecords failed:', e);
    const err = new Error('云端读取失败：' + (e.errMsg || e.message || '请检查网络或云环境'));
    err.raw = e;
    throw err;
  }
}

// 仅取「当天」记录（增量刷新用）：查询 timestamp >= 今天0点，分页拉取，
// 数据量极小（通常 1 页），每次打开只花这一次小查询即可让当天记录保持新鲜，
// 历史记录由本地缓存兜底，避免全量分页重拉。头像同样走缓存出口。
async function getRecordsToday(startISO) {
  const PAGE_SIZE = 20;
  const _ = db().command;
  try {
    const all = [];
    let skip = 0;
    while (true) {
      const res = await coll()
        .where({ timestamp: _.gte(startISO) })
        .orderBy('timestamp', 'desc')
        .skip(skip)
        .limit(PAGE_SIZE)
        .get();
      const page = res.data || [];
      all.push(...page);
      if (page.length < PAGE_SIZE) break;
      skip += PAGE_SIZE;
    }
    const list = normalize(all);
    await attachAvatars(list);
    return list;
  } catch (e) {
    console.error('[cloud] getRecordsToday failed:', e);
    const err = new Error('云端读取失败：' + (e.errMsg || e.message || '请检查网络或云环境'));
    err.raw = e;
    throw err;
  }
}

async function addRecord(type, recorder) {
  const data = {
    type,
    timestamp: new Date().toISOString(),
    deviceId: getDeviceId(),
    recorder: recorder || null,
  };
  const res = await coll().add({ data });
  // 创建记录后立即读取 _openid 并缓存（一次查询，终生有效）
  if (!_currentOpenid) {
    try {
      const doc = await coll().doc(res._id).get();
      if (doc.data && doc.data._openid) {
        _currentOpenid = doc.data._openid;
        try { wx.setStorageSync(MY_OPENID_KEY, _currentOpenid); } catch (e) { /* ignore */ }
        console.log('[cloud] openid cached from new record ✓');
      }
    } catch (e) { /* 忽略，下次加载时探针法兜底 */ }
  }
  return { id: res._id, ...data };
}

async function deleteRecord(id) {
  await coll().doc(id).remove();
}

async function updateRecord(id, updates) {
  await coll().doc(id).update({ data: updates });
}

// 云数据库无「按条件批量删」客户端 API，逐条删（受集合权限约束，仅能删自己创建的）。
// 必须先按当前账号 openid 过滤，否则会尝试删他人记录（集合权限「仅创建者可写」→ 拒绝），
// 导致 failed>0 误报失败；且弹窗文案承诺「仅删你创建的」，故按 creatorOpenid 严格过滤。
async function clearAllRecords() {
  const myOpenid = await getCurrentOpenid();
  if (!myOpenid) {
    // 无法可靠识别当前账号时，宁可报错也不假成功（避免「清空成功」却没删任何东西）
    throw new Error('无法识别当前账号，请联网后重试');
  }
  const list = await getRecords();
  const mine = list.filter((r) => r.creatorOpenid === myOpenid);
  let failed = 0;
  await Promise.all(
    mine.map((r) => coll().doc(r.id).remove().catch(() => { failed += 1; }))
  );
  // 不再静默吞错：有失败就抛出，让页面提示用户，避免误报「已清空成功」
  if (failed > 0) {
    throw new Error(`有 ${failed} 条记录删除失败，请检查网络后重试`);
  }
}

async function getTodayRecords() {
  const all = await getRecords();
  const today = dateKey(Date.now());
  return all.filter((r) => dateKey(r.timestamp) === today);
}

// 取某一天的记录（日期 key 形如 'YYYY-MM-DD'）。用于「编辑把今天的记录改到历史某天」时，
// 补拉那一天并入永久历史缓存，避免历史视图漏记。一次查询通常 1 页，分页兜底；头像走缓存出口。
async function getRecordsByDate(dateKeyStr) {
  const PAGE_SIZE = 20;
  const _ = db().command;
  const start = new Date(dateKeyStr + 'T00:00:00');
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const query = { timestamp: _.gte(start.toISOString()).and(_.lt(end.toISOString())) };
  try {
    const all = [];
    let skip = 0;
    while (true) {
      const res = await coll()
        .where(query)
        .orderBy('timestamp', 'desc')
        .skip(skip)
        .limit(PAGE_SIZE)
        .get();
      const page = res.data || [];
      all.push(...page);
      if (page.length < PAGE_SIZE) break;
      skip += PAGE_SIZE;
    }
    const list = normalize(all);
    await attachAvatars(list);
    return list;
  } catch (e) {
    console.error('[cloud] getRecordsByDate failed:', e);
    const err = new Error('云端读取失败：' + (e.errMsg || e.message || '请检查网络或云环境'));
    err.raw = e;
    throw err;
  }
}

// 临时链接（tempFileURL）缓存：微信默认约 2 小时有效，缓存 90 分钟，
// 避免每次切回页面都重新请求 getTempFileURL（这是读取慢的另一主因）。
const _tempUrlCache = {};
const TEMP_URL_TTL = 90 * 60 * 1000;

// 头像临时链接跨冷启动持久化：内存缓存同时落本地 Storage，避免每次打开小程序
// 都重新请求一次 getTempFileURL（云存储调用）。冷启动后首次使用从 Storage 预热。
const TEMP_URL_STORAGE_KEY = 'potty_temp_urls';
let _tempUrlLoaded = false;
function loadTempUrlStorage() {
  if (_tempUrlLoaded) return;
  _tempUrlLoaded = true;
  try {
    const c = wx.getStorageSync(TEMP_URL_STORAGE_KEY);
    if (c && c.ts && Date.now() - c.ts < TEMP_URL_TTL && c.map) {
      Object.assign(_tempUrlCache, c.map);
    }
  } catch (e) { /* ignore */ }
}
function saveTempUrlStorage() {
  try { wx.setStorageSync(TEMP_URL_STORAGE_KEY, { ts: Date.now(), map: _tempUrlCache }); } catch (e) { /* ignore */ }
}

// 批量把 cloud://fileID 转临时链接（一次请求转多个，替代 N+1 串行调用）。
// 带内存缓存，命中则零网络请求。失败时该 fileID 不在返回 map 中。
async function toTempUrlBatch(fileIds) {
  loadTempUrlStorage();
  const ids = (fileIds || []).filter((f) => typeof f === 'string' && f.startsWith('cloud://'));
  const result = {};
  const now = Date.now();
  const miss = [];
  ids.forEach((id) => {
    const c = _tempUrlCache[id];
    if (c && now - c.t < TEMP_URL_TTL) {
      result[id] = c.url;
    } else {
      miss.push(id);
    }
  });
  if (miss.length === 0) return result;
  const CHUNK = 50;
  try {
    for (let i = 0; i < miss.length; i += CHUNK) {
      const batch = miss.slice(i, i + CHUNK);
      const res = await wx.cloud.getTempFileURL({ fileList: batch });
      (res.fileList || []).forEach((f) => {
        if (f.tempFileURL) {
          _tempUrlCache[f.fileID] = { url: f.tempFileURL, t: now };
          result[f.fileID] = f.tempFileURL;
        }
      });
    }
    // 有实际请求才落盘，避免无谓写 Storage
    saveTempUrlStorage();
  } catch (e) {
    console.warn('[cloud] toTempUrlBatch failed:', e);
  }
  return result;
}

// 单个 cloud://fileID 转临时链接，供外部模块调用（复用批量+缓存）。
// 失败时返回空字符串，避免 raw cloud:// 导致 500 错误。
async function toTempUrl(fileID) {
  if (!fileID || !fileID.startsWith('cloud://')) return fileID;
  const map = await toTempUrlBatch([fileID]);
  return map[fileID] || '';
}

async function getGroupedRecords() {
  const all = await getRecords();
  const map = {};
  all.forEach((r) => {
    const d = dateKey(r.timestamp);
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
  getRecords,
  getRecordsToday,
  getRecordsByDate,
  addRecord,
  updateRecord,
  deleteRecord,
  clearAllRecords,
  getTodayRecords,
  getGroupedRecords,
  toTempUrl,
  toTempUrlBatch,
  getCurrentOpenid,
  dateKey,
  initCloud,
};

// ============================================================
// 云开发数据层（方案 B：跨设备共享记录）
// 集合 potty_records 文档结构：
//   { _id, _openid, type, timestamp(ISO), deviceId, recorder:{nickname, avatarUrl} }
// _openid 由微信云开发自动注入，标识记录创建者的微信账号。
// 当前用户的 _openid 在首次 getRecords 时自动检测并缓存，用于 canDelete 判断。
// ============================================================
const { CLOUD } = require('../config');
const { getDeviceId } = require('./device');

// 当前用户的 openid（首次调用时从已有记录自动检测，创建新记录时也会缓存）
let _currentOpenid = '';

async function getCurrentOpenid() {
  if (_currentOpenid) return _currentOpenid;
  // 无需云函数：从现有记录中检测。取最近 10 条中 _openid 出现次数最多的作为当前用户。
  try {
    const res = await coll().orderBy('timestamp', 'desc').limit(10).get();
    const counters = {};
    (res.data || []).forEach((r) => {
      if (r._openid) counters[r._openid] = (counters[r._openid] || 0) + 1;
    });
    const ids = Object.keys(counters);
    if (ids.length > 0) {
      ids.sort((a, b) => counters[b] - counters[a]);
      _currentOpenid = ids[0];
      console.log('[cloud] current openid detected ✓');
      return _currentOpenid;
    }
  } catch (e) {
    console.warn('[cloud] openid detection failed:', e.message);
  }
  return '';
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

// 把 cloud://fileID 批量转为临时可下载链接，解决跨用户头像访问权限问题。
// 云存储默认仅上传者可读，其他用户通过 fileID 无法直接显示。
async function resolveAvatarUrls(list) {
  const fileIds = [];
  const positions = [];
  list.forEach((r, ri) => {
    if (r.recorder && r.recorder.avatarUrl && r.recorder.avatarUrl.startsWith('cloud://')) {
      fileIds.push(r.recorder.avatarUrl);
      positions.push(ri);
    }
  });
  if (fileIds.length === 0) return;
  try {
    const res = await wx.cloud.getTempFileURL({ fileList: fileIds });
    res.fileList.forEach((f, i) => {
      if (f.tempFileURL) {
        list[positions[i]].recorder.avatarUrl = f.tempFileURL;
      } else {
        // 转换失败清空，避免 raw cloud:// 路径导致 500
        list[positions[i]].recorder.avatarUrl = '';
      }
    });
  } catch (e) {
    console.warn('[cloud] getTempFileURL failed:', e);
    // 转换失败清空，避免 raw cloud:// 路径导致 500
    positions.forEach((i) => { list[i].recorder.avatarUrl = ''; });
  }
}

// 把云端文档归一化为页面通用结构（用 id 统一代替 _id），
// 同时透传 _openid 为 creatorOpenid 供账号级归属判断。
function normalize(list) {
  return list.map((r) => ({
    id: r._id,
    type: r.type,
    timestamp: r.timestamp,
    deviceId: r.deviceId || '',
    creatorOpenid: r._openid || '',
    recorder: r.recorder || null,
  }));
}

async function getRecords() {
  const res = await coll().orderBy('timestamp', 'desc').limit(1000).get();
  const list = normalize(res.data || []);
  await resolveAvatarUrls(list);
  return list;
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
        console.log('[cloud] openid cached from new record ✓');
      }
    } catch (e) { /* 忽略，下次加载时 majority vote 兜底 */ }
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
async function clearAllRecords() {
  const list = await getRecords();
  await Promise.all(
    list.map((r) => coll().doc(r.id).remove().catch(() => {}))
  );
}

async function getTodayRecords() {
  const all = await getRecords();
  const today = dateKey(Date.now());
  return all.filter((r) => dateKey(r.timestamp) === today);
}

// 单个 cloud://fileID 转临时链接，供外部模块调用。
// 失败时返回空字符串，避免 raw cloud:// 导致 500 错误。
async function toTempUrl(fileID) {
  if (!fileID || !fileID.startsWith('cloud://')) return fileID;
  try {
    const res = await wx.cloud.getTempFileURL({ fileList: [fileID] });
    return res.fileList[0] && res.fileList[0].tempFileURL ? res.fileList[0].tempFileURL : '';
  } catch (e) {
    return '';
  }
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
  addRecord,
  updateRecord,
  deleteRecord,
  clearAllRecords,
  getTodayRecords,
  getGroupedRecords,
  toTempUrl,
  getCurrentOpenid,
  dateKey,
};

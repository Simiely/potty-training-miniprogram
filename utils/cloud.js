// ============================================================
// 云开发数据层（方案 B：跨设备共享记录）
// 集合 potty_records 文档结构：
//   { _id, _openid, type, timestamp(ISO), recorder:{nickname, avatarUrl} }
// avatarUrl 为云存储 fileID（cloud://...）时可在任意设备显示。
// 全部方法返回 Promise；调用前请确保 USE_CLOUD=true 且已 wx.cloud.init。
// ============================================================
const { CLOUD } = require('../config');

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

// 把云端文档归一化为页面通用结构（用 id 统一代替 _id）
function normalize(list) {
  return list.map((r) => ({
    id: r._id,
    type: r.type,
    timestamp: r.timestamp,
    recorder: r.recorder || null,
  }));
}

// 家庭量级数据量小，一次拉取全部（上限 1000）后在本地过滤/分组，
// 避免多次请求。数据量大时可按需加分页。
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
    recorder: recorder || null,
  };
  const res = await coll().add({ data });
  return { id: res._id, ...data };
}

async function deleteRecord(id) {
  await coll().doc(id).remove();
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
  deleteRecord,
  clearAllRecords,
  getTodayRecords,
  getGroupedRecords,
  toTempUrl,
  dateKey,
};

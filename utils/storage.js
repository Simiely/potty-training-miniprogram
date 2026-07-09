// ============================================================
// 记录存储（小程序版，使用 wx 本地存储）
// 移植自 H5 项目的 src/utils/storage.js
// ============================================================
const { STORAGE_KEYS } = require('../config');

// 本地日期 key（yyyy-MM-dd）。iOS/Android 均可被 new Date() 安全解析；
// 切勿用 toDateString()（如 "Thu Jul 09 2026"），iOS 无法解析会导致历史分组/排序出错。
function dateKey(ts) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getRecords() {
  return wx.getStorageSync(STORAGE_KEYS.RECORDS) || [];
}

function saveRecords(list) {
  wx.setStorageSync(STORAGE_KEYS.RECORDS, list);
}

function addRecord(type) {
  const list = getRecords();
  const record = {
    id: `${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    type,
    timestamp: new Date().toISOString(),
  };
  list.push(record);
  saveRecords(list);
  return record;
}

function deleteRecord(id) {
  const list = getRecords().filter((r) => r.id !== id);
  saveRecords(list);
}

function clearAllRecords() {
  saveRecords([]);
}

function getTodayRecords() {
  const today = dateKey(Date.now());
  return getRecords().filter((r) => dateKey(r.timestamp) === today);
}

function getGroupedRecords() {
  const map = {};
  getRecords().forEach((r) => {
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
  dateKey,
};

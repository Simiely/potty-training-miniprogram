// ============================================================
// 记录存储（小程序版，使用 wx 本地存储）
// 移植自 H5 项目的 src/utils/storage.js
// ============================================================
const { STORAGE_KEYS } = require('../config');

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
  const today = new Date().toDateString();
  return getRecords().filter((r) => new Date(r.timestamp).toDateString() === today);
}

function getGroupedRecords() {
  const map = {};
  getRecords().forEach((r) => {
    const d = new Date(r.timestamp).toDateString();
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
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

module.exports = {
  getRecords,
  addRecord,
  deleteRecord,
  clearAllRecords,
  getTodayRecords,
  getGroupedRecords,
};

const { TYPE_META } = require('../../config');
const { getTodayRecords, addRecord, deleteRecord } = require('../../utils/storage');
const { predictNextPoop } = require('../../utils/analysis');

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
const confidenceConfig = {
  high: { label: '高置信度 🎯', bg: '#E8F5E9', border: '#66BB6A', desc: '间隔非常规律，预测较准确' },
  medium: { label: '中等置信度 📊', bg: '#FFF8E1', border: '#FFA726', desc: '有一定规律，仅供参考' },
  low: { label: '低置信度（需要更多数据）📝', bg: '#FFEBEE', border: '#EF9A9A', desc: '数据波动较大，建议持续记录' },
};

function pad(n) { return n < 10 ? '0' + n : '' + n; }
function fmtTime(ts) {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fmtWindow(d) {
  if (!d) return '--';
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

Page({
  data: {
    navHeight: 64,
    stats: { pee: 0, poop: 0, underwear: 0, diaper: 0 },
    timeline: [],
    todayLabel: '',
    undoVisible: false,
    prediction: { hasEnough: false, sampleSize: 0 },
  },

  onLoad() {
    this.setData({
      navHeight: getApp().globalData.navHeight,
      isHarmony: getApp().globalData.isHarmony,
    });
    wx.setNavigationBarColor({ frontColor: '#ffffff', backgroundColor: '#FF8A65' });
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
    this.loadData();
  },
  onPullDownRefresh() { this.loadData(); wx.stopPullDownRefresh(); },

  loadData() {
    const today = getTodayRecords();
    const counts = { pee: 0, poop: 0, underwear: 0, diaper: 0 };
    today.forEach((r) => counts[r.type]++);
    const timeline = today
      .slice()
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .map((r) => ({
        id: r.id,
        type: r.type,
        emoji: TYPE_META[r.type].emoji,
        label: TYPE_META[r.type].label,
        color: TYPE_META[r.type].color,
        time: fmtTime(r.timestamp),
      }));

    const d = new Date();
    const todayLabel = `${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAYS[d.getDay()]}`;

    const pred = predictNextPoop();
    const conf = confidenceConfig[pred.confidence] || confidenceConfig.low;
    const now = new Date();
    let windowState = 'default';
    if (pred.predictedStart && pred.predictedEnd) {
      if (now >= pred.predictedStart && now <= pred.predictedEnd) windowState = 'active';
      else if (pred.predictedStart < now) windowState = 'passed';
    }

    this.setData({
      stats: counts,
      timeline,
      todayLabel,
      prediction: {
        hasEnough: pred.sampleSize >= 2,
        sampleSize: pred.sampleSize,
        avgHours: pred.avgHours,
        stdDevHours: pred.stdDevHours,
        windowStart: fmtWindow(pred.predictedStart),
        windowEnd: fmtWindow(pred.predictedEnd),
        confidence: pred.confidence,
        confLabel: conf.label,
        confDesc: conf.desc,
        windowState,
      },
    });
  },

  onRecord(e) {
    const type = e.currentTarget.dataset.type;
    const rec = addRecord(type);
    this.lastRecordId = rec.id;
    this.setData({ undoVisible: true });
    const meta = TYPE_META[type];
    wx.showToast({ title: `${meta.emoji} ${meta.label}记录成功！`, icon: 'none' });
    this.loadData();
    if (this._undoTimer) clearTimeout(this._undoTimer);
    this._undoTimer = setTimeout(() => this.setData({ undoVisible: false }), 5000);
  },

  onUndo() {
    if (!this.lastRecordId) return;
    deleteRecord(this.lastRecordId);
    this.lastRecordId = null;
    this.setData({ undoVisible: false });
    wx.showToast({ title: '已撤销上一条记录 ↩️', icon: 'none' });
    this.loadData();
  },
});

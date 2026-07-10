const { TYPE_META } = require('../../config');
const store = require('../../utils/store');
const profile = require('../../utils/profile');
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
    // —— 记录人 ——
    recorder: null,        // 当前记录人快照 {nickname, avatarUrl}
    profiles: [],          // 本机照顾者列表
    currentUserId: '',
    showManager: false,    // 选择记录人面板
    showEditor: false,     // 新增/编辑照顾者表单
    editId: '',            // 编辑中的 id（空=新增）
    editNickname: '',
    editAvatar: '',        // chooseAvatar 返回的临时路径
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
    this.refreshRecorder();
    this.loadData();
  },
  onPullDownRefresh() { this.loadData().then(() => wx.stopPullDownRefresh()); },

  // 同步当前记录人 + 列表（切换 tab 回来或编辑后调用）
  refreshRecorder() {
    this.setData({
      recorder: profile.getCurrentRecorder(),
      profiles: profile.getProfiles(),
      currentUserId: profile.getCurrentUserId(),
    });
  },

  async loadData() {
    const today = await store.getTodayRecords();
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
        recorder: r.recorder || null,
      }));

    const d = new Date();
    const todayLabel = `${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAYS[d.getDay()]}`;

    const all = await store.getRecords();
    const pred = predictNextPoop(all);
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
        progressWidth: Math.min(pred.sampleSize / 2 * 100, 100),
      },
    });
  },

  async onRecord(e) {
    const type = e.currentTarget.dataset.type;
    // 若尚未设置记录人，先弹选择面板
    if (!profile.getCurrentRecorder()) {
      this.setData({ showManager: true });
      wx.showToast({ title: '请先选择记录人', icon: 'none' });
      return;
    }
    const rec = await store.addRecord(type, profile.getCurrentRecorder());
    this.lastRecordId = rec.id;
    this.setData({ undoVisible: true });
    const meta = TYPE_META[type];
    wx.showToast({ title: `${meta.emoji} ${meta.label}记录成功！`, icon: 'none' });
    this.loadData();
    if (this._undoTimer) clearTimeout(this._undoTimer);
    this._undoTimer = setTimeout(() => this.setData({ undoVisible: false }), 5000);
  },

  async onUndo() {
    if (!this.lastRecordId) return;
    await store.deleteRecord(this.lastRecordId);
    this.lastRecordId = null;
    this.setData({ undoVisible: false });
    wx.showToast({ title: '已撤销上一条记录 ↩️', icon: 'none' });
    this.loadData();
  },

  // —— 记录人面板 ——
  noop() {}, // 阻止点击面板内容时冒泡关闭
  openManager() {
    this.refreshRecorder();
    this.setData({ showManager: true });
  },
  closeManager() { this.setData({ showManager: false }); },
  selectRecorder(e) {
    const id = e.currentTarget.dataset.id;
    profile.setCurrentUserId(id);
    this.refreshRecorder();
    this.setData({ showManager: false });
    wx.showToast({ title: '已切换记录人', icon: 'none' });
  },
  removeProfile(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除照顾者',
      content: '确定删除该记录人吗？已记录的数据不会删除。',
      success: (r) => {
        if (r.confirm) {
          profile.deleteProfile(id);
          this.refreshRecorder();
        }
      },
    });
  },

  // —— 新增/编辑照顾者 ——
  openEditor() {
    this.setData({
      showManager: false,
      showEditor: true,
      editId: '',
      editNickname: '',
      editAvatar: '',
    });
  },
  closeEditor() { this.setData({ showEditor: false }); },
  onChooseAvatar(e) {
    this.setData({ editAvatar: e.detail.avatarUrl });
  },
  onNickInput(e) {
    this.setData({ editNickname: e.detail.value });
  },
  async saveProfile() {
    const nickname = (this.data.editNickname || '').trim();
    if (!nickname) {
      wx.showToast({ title: '请填写昵称', icon: 'none' });
      return;
    }
    await profile.saveProfile({
      nickname,
      avatarTempPath: this.data.editAvatar,
      editId: this.data.editId,
    });
    this.setData({ showEditor: false });
    this.refreshRecorder();
    wx.showToast({ title: '已保存', icon: 'none' });
  },
});

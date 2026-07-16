const { TYPE_META } = require('../../config');
const store = require('../../utils/store');
const { dateKey } = require('../../utils/storage');
const { getDeviceId, detectTablet } = require('../../utils/device');
const profile = require('../../utils/profile');

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

function pad(n) { return n < 10 ? '0' + n : '' + n; }
function fmtTime(ts) {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseTimestamp(ts) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  return {
    date: `${y}-${m}-${day}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

Page({
  data: {
    navHeight: 64,
    uiMode: 'phone',
    navKey: 'history',
    recorder: null,
    groups: [],
    expanded: {},
    // 编辑时间
    showEditor: false,
    editRecordId: '',
    editDate: '',
    editTime: '',
  },

  onLoad() {
    this.setData({
      navHeight: getApp().globalData.navHeight,
      isHarmony: getApp().globalData.isHarmony,
      uiMode: detectTablet() ? 'tablet' : 'phone',
    });
    wx.setNavigationBarColor({ frontColor: '#ffffff', backgroundColor: '#FF8A65' });
  },

  onResize() {
    this.setData({ uiMode: detectTablet() ? 'tablet' : 'phone' });
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
    const rec = profile.getCurrentRecorder();
    this.setData({ recorder: rec || null });
    this.load();
  },
  onPullDownRefresh() { this.load(true).then(() => wx.stopPullDownRefresh()); },

  async load(forceRefresh = false) {
    try {
      await this._load(forceRefresh);
    } catch (e) {
      console.error('[history] load failed:', e);
      wx.showToast({ title: e.message || '读取失败，请检查网络/云环境', icon: 'none' });
    }
  },

  async _load(forceRefresh) {
    const todayStr = dateKey(Date.now());
    const grouped = await store.getGroupedRecords(forceRefresh);
    const currentDeviceId = getDeviceId();
    const currentOpenid = await store.getCurrentOpenid();
    const isCloud = store.cloudReady();
    const groups = grouped.map((g) => {
      const d = new Date(g.date);
      const records = g.records.map((r) => {
        // 云模式：严格按微信账号 _openid 精确判定（探针法获取，无需云函数）。
        // currentOpenid 为空（极端无网）时保守处理：不显示删除按钮，避免跨设备误显/误删。
        const canDel = isCloud
          ? !!(currentOpenid && r.creatorOpenid && currentOpenid === r.creatorOpenid)
          : (currentDeviceId === r.deviceId);
        return {
          id: r.id,
          type: r.type,
          timestamp: r.timestamp,
          emoji: TYPE_META[r.type].emoji,
          label: TYPE_META[r.type].label,
          color: TYPE_META[r.type].color,
          time: fmtTime(r.timestamp),
          recorder: r.recorder || null,
          // 规则：只有「今天」的记录可修改（历史记录只读）。编辑/删除按钮仅当天显示，
          // 仍需通过 canDel 的归属校验（仅能改自己创建的记录）。
          canEdit: g.isToday && canDel,
          canDelete: g.isToday && canDel,
        };
      });
      return {
        date: g.date,
        dateLabel: `${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAYS[d.getDay()]}`,
        isToday: g.date === todayStr,
        poopCount: g.poopCount,
        peeCount: g.peeCount,
        underwearCount: g.underwearCount,
        diaperCount: g.diaperCount,
        records,
      };
    });
    const totalCount = groups.reduce((s, g) => s + g.records.length, 0);
    const todayGroup = groups.find((g) => g.isToday);
    const todayCount = todayGroup ? todayGroup.records.length : 0;
    this.setData({ groups, totalCount, todayCount });
  },

  toggleDate(e) {
    const date = e.currentTarget.dataset.date;
    const expanded = Object.assign({}, this.data.expanded);
    expanded[date] = !expanded[date];
    this.setData({ expanded });
  },

  async onDelete(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条记录吗？此操作无法撤销。',
      success: async (r) => {
        if (r.confirm) {
          await store.deleteRecord(id);
          this.load();
          wx.showToast({ title: '已删除', icon: 'none' });
        }
      },
    });
  },

  // —— 编辑时间 ——
  noop() {},

  onEdit(e) {
    const id = e.currentTarget.dataset.id;
    const ts = e.currentTarget.dataset.ts;
    const parsed = parseTimestamp(ts);
    this.setData({
      showEditor: true,
      editRecordId: id,
      editDate: parsed.date,
      editTime: parsed.time,
    });
  },

  closeEditor() {
    this.setData({ showEditor: false });
  },

  onDateChange(e) {
    this.setData({ editDate: e.detail.value });
  },

  onTimeChange(e) {
    this.setData({ editTime: e.detail.value });
  },

  async saveEdit() {
    const { editRecordId, editDate, editTime } = this.data;
    const newTs = new Date(`${editDate}T${editTime}:00`).toISOString();
    await store.updateRecord(editRecordId, { timestamp: newTs });
    this.setData({ showEditor: false });
    this.load();
    wx.showToast({ title: '时间已更新', icon: 'success' });
  },

  onClearAll() {
    this._clearStep1();
  },

  _clearStep1() {
    wx.showModal({
      title: '⚠️ 清空我的记录 (1/3)',
      content: '仅删除你创建的记录，家人的记录不受影响。确定继续吗？',
      success: (r) => { if (r.confirm) this._clearStep2(); },
    });
  },

  _clearStep2() {
    wx.showModal({
      title: '⚠️⚠️ 再次确认 (2/3)',
      content: '你创建的记录将被永久清除，且无法恢复。确认继续吗？',
      success: (r) => { if (r.confirm) this._clearStep3(); },
    });
  },

  async _clearStep3() {
    wx.showModal({
      title: '⚠️⚠️⚠️ 最后一次确认 (3/3)',
      content: '此操作不可恢复！确认删除你的全部记录？',
      success: async (r) => {
        if (r.confirm) {
          try {
            await store.clearAllRecords();
            this.load();
            wx.showToast({ title: '已清空我的记录', icon: 'none' });
          } catch (e) {
            wx.showToast({ title: e.message || '清空失败，请重试', icon: 'none' });
          }
        }
      },
    });
  },
});

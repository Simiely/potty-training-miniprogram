const { TYPE_META } = require('../../config');
const store = require('../../utils/store');
const { dateKey } = require('../../utils/storage');
const { getDeviceId } = require('../../utils/device');

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
    });
    wx.setNavigationBarColor({ frontColor: '#ffffff', backgroundColor: '#FF8A65' });
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
    this.load();
  },
  onPullDownRefresh() { this.load().then(() => wx.stopPullDownRefresh()); },

  async load() {
    const todayStr = dateKey(Date.now());
    const grouped = await store.getGroupedRecords();
    const currentDeviceId = getDeviceId();
    const currentOpenid = await store.getCurrentOpenid();
    const isCloud = store.cloudReady();
    const groups = grouped.map((g) => {
      const d = new Date(g.date);
      const records = g.records.map((r) => {
        // 云模式：优先按微信账号 _openid 判断（需云函数已部署）；
        // 云函数未部署时降级为 deviceId，确保至少有按钮可用。
        const canDel = isCloud
          ? (currentOpenid
              ? (r.creatorOpenid && currentOpenid === r.creatorOpenid)
              : (currentDeviceId === r.deviceId))   // 云函数未部署时的降级
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
          canEdit: canDel,
          canDelete: canDel,
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
    this.setData({ groups });
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
          await store.clearAllRecords();
          this.load();
          wx.showToast({ title: '已清空我的记录', icon: 'none' });
        }
      },
    });
  },
});

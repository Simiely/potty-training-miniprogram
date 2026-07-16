const { detectTablet } = require('../utils/device');

Component({
  data: {
    selected: 0,
    tablet: false,
    list: [
      { pagePath: '/pages/record/record', text: '记录', icon: '/assets/tab-record.png' },
      { pagePath: '/pages/analysis/analysis', text: '分析', icon: '/assets/tab-analysis.png' },
      { pagePath: '/pages/history/history', text: '历史', icon: '/assets/tab-history.png' },
    ],
  },
  methods: {
    switchTab(e) {
      const idx = e.currentTarget.dataset.index;
      if (idx === this.data.selected) return;
      const url = this.data.list[idx].pagePath;
      // 点击即更新高亮（权威来源），不再依赖路由反推，避免切换时回跳到记录页。
      this.setData({ selected: idx });
      wx.switchTab({ url });
    },
    // 只用于计算大屏类（决定 Tab 栏自身是否用 px 尺寸），不再用路由推断 selected。
    refresh() {
      this.setData({ tablet: detectTablet() });
    },
  },
  pageLifetimes: {
    show() {
      this.refresh();
    },
  },
  attached() {
    this.refresh();
    try {
      this._onResize = () => this.refresh();
      wx.onWindowResize(this._onResize);
    } catch (e) { /* ignore */ }
  },
  detached() {
    try { if (this._onResize) wx.offWindowResize(this._onResize); } catch (e) { /* ignore */ }
  },
});

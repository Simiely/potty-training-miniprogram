Component({
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/record/record', text: '记录', icon: '/assets/tab-record.png' },
      { pagePath: '/pages/analysis/analysis', text: '分析', icon: '/assets/tab-analysis.png' },
      { pagePath: '/pages/history/history', text: '历史', icon: '/assets/tab-history.png' },
    ],
  },
  methods: {
    switchTab(e) {
      const idx = e.currentTarget.dataset.index;
      const url = this.data.list[idx].pagePath;
      wx.switchTab({ url });
      this.setData({ selected: idx });
    },
  },
});

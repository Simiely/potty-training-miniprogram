const { analyzeTrend, analyzeCommonTimes, getDailyAverage } = require('../../utils/analysis');
const store = require('../../utils/store');

Page({
  data: {
    navHeight: 64,
    trendDesc: '',
    intervals: [],
    commonTimes: [],
    chart: { labels: [], bars: [], pee: [], poop: [], underwear: [], diaper: [] },
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
      this.getTabBar().setData({ selected: 1 });
    }
    this.load();
  },
  onPullDownRefresh() { this.load().then(() => wx.stopPullDownRefresh()); },

  async load() {
    const records = await store.getRecords();

    const trend = analyzeTrend(records);
    const maxInterval = trend.intervals.length ? Math.max(...trend.intervals, 1) : 1;
    const intervals = trend.intervals.map((h) => ({
      h,
      pct: Math.max(Math.round((h / maxInterval) * 100), 8),
    }));

    const commonTimes = analyzeCommonTimes(records)
      .slice(0, 5)
      .map((c) => ({ label: `${c.label} (${c.count}次)`, hot: c.count >= 3 }));

    const daily = getDailyAverage(records);
    const maxVal = Math.max(1, ...daily.peeData, ...daily.poopData, ...daily.underwearData, ...daily.diaperData);
    const bars = daily.labels.map((_, i) => ({
      pee: (daily.peeData[i] / maxVal) * 100,
      poop: (daily.poopData[i] / maxVal) * 100,
      underwear: (daily.underwearData[i] / maxVal) * 100,
      diaper: (daily.diaperData[i] / maxVal) * 100,
    }));

    this.setData({
      trendDesc: trend.trendDesc,
      intervals,
      commonTimes,
      chart: {
        labels: daily.labels,
        bars,
        pee: daily.peeData,
        poop: daily.poopData,
        underwear: daily.underwearData,
        diaper: daily.diaperData,
      },
    });
  },
});

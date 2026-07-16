const { analyzeTrend, analyzeCommonTimes, getDailyAverage } = require('../../utils/analysis');
const { detectTablet } = require('../../utils/device');
const profile = require('../../utils/profile');
const store = require('../../utils/store');

Page({
  data: {
    navHeight: 64,
    uiMode: 'phone',
    navKey: 'analysis',
    recorder: null,
    trendDesc: '',
    intervals: [],
    commonTimes: [],
    dayCards: [],
    weekTotal: 0,
    kpiWeekTotal: 0,
    kpiDailyAvg: 0,
    kpiCommonTime: '—',
    stackBars: [],
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
      this.getTabBar().setData({ selected: 1 });
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
      console.error('[analysis] load failed:', e);
      wx.showToast({ title: e.message || '读取失败，请检查网络/云环境', icon: 'none' });
    }
  },

  async _load(forceRefresh) {
    const records = await store.getRecords(forceRefresh);

    const trend = analyzeTrend(records);
    const maxInterval = trend.intervals.length ? Math.max(...trend.intervals, 1) : 1;
    const intervals = trend.intervals.map((h) => ({
      h,
      pct: Math.max(Math.round((h / maxInterval) * 100), 8),
    }));

    const commonTimes = analyzeCommonTimes(records)
      .slice(0, 5)
      .map((c) => ({ time: c.label, count: c.count, hot: c.count >= 3 }));

    const daily = getDailyAverage(records);
    const maxVal = Math.max(
      1,
      ...daily.peeData, ...daily.poopData, ...daily.underwearData, ...daily.diaperData
    );
    const now = new Date();
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const dayCards = daily.labels.map((label, i) => {
      const d = new Date(now);
      d.setDate(now.getDate() - (daily.labels.length - 1 - i));
      const pee = daily.peeData[i];
      const poop = daily.poopData[i];
      const underwear = daily.underwearData[i];
      const diaper = daily.diaperData[i];
      return {
        label,
        weekday: weekdays[d.getDay()],
        total: pee + poop + underwear + diaper,
        types: [
          { name: '小便', icon: '💧', cls: 'pee', value: pee },
          { name: '大便', icon: '💩', cls: 'poop', value: poop },
          { name: '小内裤', icon: '🩲', cls: 'underwear', value: underwear },
          { name: '尿不湿', icon: '👶', cls: 'diaper', value: diaper },
        ],
      };
    }).reverse(); // 倒序：最新日期在最上方
    const weekTotal = dayCards.reduce((s, c) => s + c.total, 0);

    // 顶部 KPI（项 3）：本周记录 / 日均 / 最常见时段
    const dailyAvg = weekTotal ? +(weekTotal / 7).toFixed(1) : 0;
    const commonTime = commonTimes.length
      ? commonTimes[0].time
      : '—';

    // 近7天×4类堆叠柱状图（项 4）：各日按 maxDayTotal 归一化高度
    const maxDayTotal = Math.max(1, ...dayCards.map((c) => c.total));
    const stackBars = dayCards.map((c) => ({
      label: c.label,
      weekday: c.weekday,
      total: c.total,
      segments: c.types.map((t) => ({
        cls: t.cls,
        value: t.value,
        pct: maxDayTotal ? Math.round((t.value / maxDayTotal) * 100) : 0,
      })),
    }));

    this.setData({
      trendDesc: trend.trendDesc,
      intervals,
      commonTimes,
      dayCards,
      weekTotal,
      kpiWeekTotal: weekTotal,
      kpiDailyAvg: dailyAvg,
      kpiCommonTime: commonTime,
      stackBars,
    });
  },
});

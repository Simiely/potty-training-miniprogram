// ============================================================
// 分析逻辑（小程序版）
// 移植自 H5 项目的 src/utils/analysis.js（预测/趋势/时段/日均）
// 改造：所有函数接收 records 数组作为参数，不再直接依赖存储后端，
// 由页面通过 store 异步取数后传入，从而本地/云端模式统一。
// ============================================================
const { dateKey } = require('./storage');

function getRecentPoopRecords(records, n = 7) {
  return records
    .filter((r) => r.type === 'poop')
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, n)
    .reverse();
}

function calcIntervalStats(records) {
  if (records.length < 2) return { avgHours: 0, stdDevHours: 0 };
  const intervals = [];
  for (let i = 1; i < records.length; i++) {
    const prev = new Date(records[i - 1].timestamp);
    const curr = new Date(records[i].timestamp);
    intervals.push((curr - prev) / (1000 * 60 * 60));
  }
  const avg = intervals.reduce((s, v) => s + v, 0) / intervals.length;
  const variance =
    intervals.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / intervals.length;
  return {
    avgHours: Math.round(avg * 10) / 10,
    stdDevHours: Math.round(Math.sqrt(variance) * 10) / 10,
  };
}

function predictNextPoop(records) {
  const recs = getRecentPoopRecords(records, 7);
  if (recs.length < 2) {
    return {
      predictedStart: null,
      predictedEnd: null,
      avgHours: 0,
      stdDevHours: 0,
      confidence: 'low',
      sampleSize: recs.length,
    };
  }
  const { avgHours, stdDevHours } = calcIntervalStats(recs);
  const lastTime = new Date(recs[recs.length - 1].timestamp);
  const predictedStart = new Date(lastTime.getTime() + (avgHours - stdDevHours) * 3600000);
  const predictedEnd = new Date(lastTime.getTime() + (avgHours + stdDevHours) * 3600000);

  let confidence = 'low';
  if (recs.length >= 5) {
    const cv = avgHours > 0 ? stdDevHours / avgHours : 0;
    if (cv < 0.2) confidence = 'high';
    else if (cv < 0.4) confidence = 'medium';
  } else if (recs.length >= 3) {
    confidence = 'medium';
  }
  return { predictedStart, predictedEnd, avgHours, stdDevHours, confidence, sampleSize: recs.length };
}

function analyzeTrend(records) {
  const recs = getRecentPoopRecords(records, 7);
  if (recs.length < 3) {
    return { trend: 'stable', trendDesc: '数据不足，继续记录中…', intervals: [] };
  }
  const intervals = [];
  for (let i = 1; i < recs.length; i++) {
    const prev = new Date(recs[i - 1].timestamp);
    const curr = new Date(recs[i].timestamp);
    intervals.push(Math.round(((curr - prev) / (1000 * 60 * 60)) * 10) / 10);
  }
  if (intervals.length < 2) return { trend: 'stable', trendDesc: '间隔稳定', intervals };

  const n = intervals.length;
  const xs = Array.from({ length: n }, (_, i) => i);
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = intervals.reduce((a, b) => a + b, 0) / n;
  const slope =
    xs.reduce((s, x, i) => s + (x - xMean) * (intervals[i] - yMean), 0) /
    xs.reduce((s, x) => s + (x - xMean) ** 2, 0);

  let trend = 'stable';
  let trendDesc = '排便间隔保持稳定 🎯';
  if (slope < -0.5) {
    trend = 'shortening';
    trendDesc = '排便间隔在缩短，如厕训练有成效！🌟';
  } else if (slope > 0.5) {
    trend = 'lengthening';
    trendDesc = '排便间隔在变长，继续观察中 👀';
  }
  return { trend, trendDesc, intervals };
}

function analyzeCommonTimes(records) {
  const poop = records.filter((r) => r.type === 'poop');
  const hourBuckets = new Array(24).fill(0);
  poop.forEach((r) => {
    hourBuckets[new Date(r.timestamp).getHours()]++;
  });
  const timeLabels = [
    '凌晨 0-1', '凌晨 1-2', '凌晨 2-3', '凌晨 3-4', '凌晨 4-5', '早晨 5-6',
    '早晨 6-7', '早晨 7-8', '上午 8-9', '上午 9-10', '上午 10-11', '午前 11-12',
    '午后 12-13', '下午 13-14', '下午 14-15', '下午 15-16', '下午 16-17', '傍晚 17-18',
    '傍晚 18-19', '晚上 19-20', '晚上 20-21', '睡前 21-22', '睡前 22-23', '深夜 23-24',
  ];
  return hourBuckets
    .map((count, hour) => ({ hour, label: timeLabels[hour], count }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count);
}

function getDailyAverage(records) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, dateStr: dateKey(d.getTime()) });
  }
  const countByType = (type) =>
    days.map((day) =>
      records.filter(
        (r) => r.type === type && dateKey(r.timestamp) === day.dateStr
      ).length
    );
  return {
    labels: days.map((d) => d.label),
    peeData: countByType('pee'),
    poopData: countByType('poop'),
    underwearData: countByType('underwear'),
    diaperData: countByType('diaper'),
  };
}

module.exports = {
  predictNextPoop,
  analyzeTrend,
  analyzeCommonTimes,
  getDailyAverage,
};

const { STORAGE_KEYS, USE_CLOUD, CLOUD } = require('./config');

App({
  globalData: {
    statusBarHeight: 20,
    navHeight: 64, // statusBar + 44 内容区
    platform: '',  // wx.getDeviceInfo().platform
    system: '',    // wx.getDeviceInfo().system
    isHarmony: false, // 是否为鸿蒙（纯血鸿蒙 platform==='ohos'；开发者工具模拟时 system==='HarmonyOS'）
  },

  onLaunch() {
    // 读取窗口信息，供自定义导航栏计算高度
    let info;
    try {
      // 用 wx.getWindowInfo 取状态栏高度（自基础库 2.20.1 起提供，替代已停止维护的系统信息聚合接口）
      info = wx.getWindowInfo();
    } catch (e) {
      info = { statusBarHeight: 20 };
    }
    const statusBarHeight = info.statusBarHeight || 20;
    this.globalData.statusBarHeight = statusBarHeight;
    this.globalData.navHeight = statusBarHeight + 44;

    // HarmonyOS 兼容：用 wx.getDeviceInfo 判断平台（官方推荐做法）。
    // 真机纯血鸿蒙 platform==='ohos'；开发者工具模拟鸿蒙时 platform==='devtools' 且 system==='HarmonyOS'。
    try {
      const dev = wx.getDeviceInfo();
      this.globalData.platform = dev.platform || '';
      this.globalData.system = dev.system || '';
      this.globalData.isHarmony =
        dev.platform === 'ohos' || dev.system === 'HarmonyOS';
    } catch (e) {
      this.globalData.isHarmony = false;
    }

    // 云开发初始化（方案 B）：仅当 config.USE_CLOUD=true 且已配置环境 ID 时启用。
    // 去掉 wx.cloud 的前置判断，因为某些场景下 onLaunch 时 wx.cloud 尚未注入，
    // 但后续 page onShow 时 wx.cloud 可能已可用。用 try-catch 兜底，失败时降级本地存储。
    if (USE_CLOUD && CLOUD.ENV) {
      try {
        wx.cloud.init({ env: CLOUD.ENV, traceUser: true });
      } catch (e) {
        console.warn('[cloud] init failed at onLaunch, will retry on first use:', e);
      }
    }
    // 标记云初始化意图，供 profile.js 等模块在初次调用前补刀
    this.globalData.cloudInitAttempted = USE_CLOUD && !!CLOUD.ENV;
    this.globalData.cloudEnv = CLOUD.ENV;

    // 启动即检查是否已通过校验（授权 + 密码）。已校验则直接进入记录页，
    // 否则由 lock 页作为首页处理授权与密码。
    const verified = wx.getStorageSync(STORAGE_KEYS.VERIFIED);
    if (verified) {
      wx.switchTab({ url: '/pages/record/record' });
    }
  },
});

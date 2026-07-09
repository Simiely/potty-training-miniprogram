const { STORAGE_KEYS } = require('./config');

App({
  globalData: {
    statusBarHeight: 20,
    navHeight: 64, // statusBar + 44 内容区
  },

  onLaunch() {
    // 读取系统信息，供自定义导航栏计算高度
    let info;
    try {
      info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    } catch (e) {
      info = { statusBarHeight: 20 };
    }
    const statusBarHeight = info.statusBarHeight || 20;
    this.globalData.statusBarHeight = statusBarHeight;
    this.globalData.navHeight = statusBarHeight + 44;

    // 启动即检查是否已通过校验（授权 + 密码）。已校验则直接进入记录页，
    // 否则由 lock 页作为首页处理授权与密码。
    const verified = wx.getStorageSync(STORAGE_KEYS.VERIFIED);
    if (verified) {
      wx.switchTab({ url: '/pages/record/record' });
    }
  },
});

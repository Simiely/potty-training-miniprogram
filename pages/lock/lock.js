const { LOCK_PASSWORD, STORAGE_KEYS } = require('../../config');
const app = getApp();

Page({
  data: {
    navHeight: 64,      // 状态栏 + 胶囊内容区
    authorized: false,  // 是否已微信授权
    input: '',          // 当前输入的密码
    error: '',          // 错误提示
    shaking: false,     // 抖动动画
    dots: [0, 1, 2, 3],
    showBio: true,      // 是否展示指纹/面容按钮（鸿蒙上 SOTER 支持不确定，默认隐藏走密码）
  },

  onLoad() {
    // 已校验过（授权 + 密码正确）则直接进入，不再弹锁屏
    const verified = wx.getStorageSync(STORAGE_KEYS.VERIFIED);
    if (verified) {
      wx.switchTab({ url: '/pages/record/record' });
      return;
    }
    // 自定义导航下，把状态栏文字设为白色以适配暖色渐变
    wx.setNavigationBarColor({ frontColor: '#ffffff', backgroundColor: '#FF8A65' });
    // 鸿蒙（纯血 ohos）上 SOTER 生物认证可用性不确定，隐藏指纹/面容入口，统一走 4 位密码
    this.setData({
      navHeight: app.globalData.navHeight,
      showBio: !app.globalData.isHarmony,
    });
  },

  // 微信授权（真实项目用 res.code 换 openid）
  onAuth() {
    wx.login({
      success: (res) => {
        wx.setStorageSync(STORAGE_KEYS.OPENID, res.code || 'dev');
        this.setData({ authorized: true });
      },
      fail: () => wx.showToast({ title: '授权失败，请重试', icon: 'none' }),
    });
  },

  // 键盘输入
  onKey(e) {
    const k = e.currentTarget.dataset.k;
    if (k === 'del') {
      this.setData({ input: this.data.input.slice(0, -1), error: '' });
      return;
    }
    if (this.data.input.length >= 4 || this.data.shaking) return;
    const input = this.data.input + k;
    this.setData({ input });
    if (input.length === 4) this.verify(input);
  },

  // 校验固定密码
  verify(input) {
    if (input === LOCK_PASSWORD) {
      // 正确：标记已校验，之后免输，直接进入主界面
      wx.setStorageSync(STORAGE_KEYS.VERIFIED, true);
      wx.showToast({ title: '验证成功', icon: 'success' });
      setTimeout(() => wx.switchTab({ url: '/pages/record/record' }), 600);
    } else {
      // 错误：抖动 + 红点 + 提示，清空重输
      this.setData({ shaking: true, error: '密码错误，请重试' });
      setTimeout(() => this.setData({ shaking: false, input: '' }), 500);
    }
  },

  // 指纹 / 面容（设备支持时可用，失败回退密码）
  onBio() {
    if (!wx.startSoterAuthentication) {
      wx.showToast({ title: '设备不支持，请用密码', icon: 'none' });
      return;
    }
    wx.startSoterAuthentication({
      requestAuthMode: 'finger',
      challenge: 'potty-lock',
      authContent: '验证指纹进入',
      success: () => {
        wx.setStorageSync(STORAGE_KEYS.VERIFIED, true);
        wx.switchTab({ url: '/pages/record/record' });
      },
      fail: () => wx.showToast({ title: '指纹验证失败，请用密码', icon: 'none' }),
    });
  },
});

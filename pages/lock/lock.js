const { LOCK_PASSWORD, STORAGE_KEYS } = require('../../config');
const { detectTablet } = require('../../utils/device');

Page({
  data: {
    navHeight: 64,      // 状态栏 + 胶囊内容区
    uiMode: 'phone',
    authorized: true,   // 直接显示密码键盘（不再强制微信授权前置，避免游客/登录失败卡死）
    input: '',          // 当前输入的密码
    error: '',          // 错误提示
    shaking: false,     // 抖动动画
    dots: [0, 1, 2, 3],
    showBio: true,      // 是否展示指纹/面容按钮（鸿蒙上 SOTER 支持不确定，默认隐藏走密码）
    isHarmony: false,   // 是否鸿蒙设备（用于展示平台相关提示）
  },

  onLoad() {
    // 注意：不能把 getApp() 放在模块顶层——在 custom-tab-bar + lazyCodeLoading 下，
    // 页面模块可能在 App() 完成前被 require，顶层 getApp() 会返回 undefined，
    // 进而 onLoad 访问 app.globalData 崩溃。改为在 onLoad 内获取（页面生命周期
    // 一定晚于 App 初始化完成，此时 getApp() 必然有效，与其他页面做法一致）。
    const app = getApp();
    // 已校验过（授权 + 密码正确）则直接进入。
    // 关键：switchTab 必须延后到首帧渲染之后（setTimeout 0 / nextTick），
    // 否则在 custom-tab-bar + lazyCodeLoading 下会触发
    // 「routeDone with a webviewId 1 is not found」路由错误。
    const verified = wx.getStorageSync(STORAGE_KEYS.VERIFIED);
    if (verified) {
      setTimeout(() => wx.switchTab({ url: '/pages/record/record' }), 0);
      return;
    }
    // 自定义导航下，把状态栏文字设为白色以适配暖色渐变
    wx.setNavigationBarColor({ frontColor: '#ffffff', backgroundColor: '#FF8A65' });
    // 鸿蒙（纯血 ohos）上 SOTER 生物认证可用性不确定，隐藏指纹/面容入口，统一走 4 位密码
    this.setData({
      navHeight: app.globalData.navHeight,
      isHarmony: app.globalData.isHarmony,
      showBio: !app.globalData.isHarmony,
      uiMode: detectTablet() ? 'tablet' : 'phone',
    });
  },

  onResize() {
    this.setData({ uiMode: detectTablet() ? 'tablet' : 'phone' });
  },

  // 键盘输入（输满 4 位自动校验）
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

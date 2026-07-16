// 设备标识：首次运行时生成唯一 ID 并持久化到本地存储。
// 用于区分「本设备创建的记录」和「其他设备创建的记录」。
// 不依赖网络、云函数或用户身份，即时可用。
const KEY = '_potty_device_id';

let _deviceId = '';
try {
  _deviceId = wx.getStorageSync(KEY) || '';
} catch (e) { /* ignore */ }

function getDeviceId() {
  if (_deviceId) return _deviceId;
  _deviceId = `dev_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  try { wx.setStorageSync(KEY, _deviceId); } catch (e) { /* ignore */ }
  return _deviceId;
}

// 判定是否大屏 / 平板模式（横竖都算）。
//
// 设计目标：iPad / 平板上呈现「新的全屏平板仪表盘 UI」，且尺寸 1:1 不放大。
//   - app.json 保留 "resizable": true → iPad 占满真实逻辑尺寸（横屏≈1366pt）。
//   - 本函数判 true 后，页面根节点挂 .tablet 类，由 CSS 用 px 令牌驱动尺寸，
//     rpx 在超大屏上被放大的问题被 px 覆盖彻底规避（详见各页 .tablet 规则）。
//
// 为什么用「屏幕宽度 OR 设备型号」双条件兜底：
//   iPad 上 windowWidth 某些环境被限制为手机比例绘制区（~480px），
//   而 screenWidth 在开发者工具模拟器也未必返回 1366。
//   型号兜底（/iPad|tablet|平板|Pad|MatePad|MI PAD 等/）最稳，真机/模拟器 model 均命中。
let _logged = false;

function detectTablet() {
  let w = 0, model = '';
  try {
    const info = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync());
    w = Math.max(info.screenWidth || 0, info.windowWidth || 0);
  } catch (e) { /* ignore */ }
  try {
    model = (wx.getDeviceInfo ? wx.getDeviceInfo().model : wx.getSystemInfoSync().model) || '';
  } catch (e) { /* ignore */ }

  const isLargeDevice = /iPad|tablet|平板|Pad|MatePad|MI\s*PAD|Smart\s*Pad/i.test(model || '');
  const big = w >= 768 || isLargeDevice;

  if (!_logged) {
    _logged = true;
    console.log('[device] detectTablet =>', { screenW: w, model, big });
  }
  return big;
}

module.exports = { getDeviceId, detectTablet };

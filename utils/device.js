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

module.exports = { getDeviceId };

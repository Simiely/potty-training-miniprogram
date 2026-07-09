// ============================================================
// 全局配置
// ============================================================

// 锁屏固定密码（4 位数字）。请修改为你的实际密码。
// 仅首次打开小程序时需要输入；输入正确后设备被信任，之后不再弹锁屏。
const LOCK_PASSWORD = '2411';

// 本地存储 key
const STORAGE_KEYS = {
  RECORDS: 'potty_records',   // 如厕记录数组
  OPENID: 'wx_openid',        // 微信登录 code / openid
  VERIFIED: 'app_verified',   // 是否已授权并通过密码校验（之后免输）
};

// 记录类型的中文标签与语义色（与画板一致）
const TYPE_META = {
  pee: { label: '小便', emoji: '💧', color: '#42A5F5', soft: '#E3F2FD', text: '#1976D2' },
  poop: { label: '大便', emoji: '💩', color: '#FF7043', soft: '#FFF3E0', text: '#E64A19' },
  underwear: { label: '换小内裤', emoji: '🩲', color: '#66BB6A', soft: '#E8F5E9', text: '#388E3C' },
  diaper: { label: '换尿不湿', emoji: '👶', color: '#BA68C8', soft: '#F3E5F5', text: '#7B1FA2' },
};

module.exports = { LOCK_PASSWORD, STORAGE_KEYS, TYPE_META };

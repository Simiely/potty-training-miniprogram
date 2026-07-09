// ============================================================
// 全局配置
// ============================================================

// 锁屏固定密码（4 位数字）。请修改为你的实际密码。
// 仅首次打开小程序时需要输入；输入正确后设备被信任，之后不再弹锁屏。
const LOCK_PASSWORD = '2411';

// 本地存储 key
const STORAGE_KEYS = {
  RECORDS: 'potty_records',   // 如厕记录数组（本地模式）
  OPENID: 'wx_openid',        // 微信登录 code / openid
  VERIFIED: 'app_verified',   // 是否已授权并通过密码校验（之后免输）
  PROFILES: 'potty_profiles', // 本机照顾者档案列表 [{id, nickname, avatarUrl}]
  CURRENT_USER: 'potty_current_user', // 当前记录人 id
};

// ============================================================
// 云开发开关（方案 B：跨设备共享记录）
// 配置步骤：
//   1) 微信公众平台注册真实小程序，拿到 AppID，替换 project.config.json 的 appid
//   2) 开发者工具顶部「云开发」开通，新建【免费体验版】环境，复制环境 ID 填到下方 ENV
//   3) 云开发控制台新建集合 potty_records，权限设为「所有用户可读，仅创建者可写」
//   4) 把 USE_CLOUD 改为 true
// 未配置前 USE_CLOUD=false，工程仍按本地存储运行（touristappid 也能跑）。
// ============================================================
const USE_CLOUD = false;        // ⚠️ 待填：配置好云环境后改成 true（第 4 步）
const CLOUD = {
  ENV: '',                       // ⚠️ 待填：粘贴你的云开发环境 ID，如 cloud1-xxxxxx（第 2 步）
  COLLECTION_RECORDS: 'potty_records',
};

// 记录类型的中文标签与语义色（与画板一致）
const TYPE_META = {
  pee: { label: '小便', emoji: '💧', color: '#42A5F5', soft: '#E3F2FD', text: '#1976D2' },
  poop: { label: '大便', emoji: '💩', color: '#FF7043', soft: '#FFF3E0', text: '#E64A19' },
  underwear: { label: '换小内裤', emoji: '🩲', color: '#66BB6A', soft: '#E8F5E9', text: '#388E3C' },
  diaper: { label: '换尿不湿', emoji: '👶', color: '#BA68C8', soft: '#F3E5F5', text: '#7B1FA2' },
};

module.exports = { LOCK_PASSWORD, STORAGE_KEYS, TYPE_META, USE_CLOUD, CLOUD };

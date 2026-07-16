// ============================================================
// 全局配置
// ============================================================

// 锁屏固定密码（4 位数字）。⚠️ 这是「防误触/防小孩乱点」级别的软锁，不是安全防护：
//   密码明文写在代码里、校验状态存在本地 storage，清缓存即可绕过。
//   若需要真正的账号级安全，应改为绑定 wx.login 拿到的 openid 做服务端校验。
// 👉 占位默认值为 '0000'，请改为你自己的密码后再发布。
const LOCK_PASSWORD = '0000';

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
// 配置步骤（全部在 config + project.config.json 里完成，无需改业务代码）：
//   ① 微信公众平台注册真实小程序，拿到 AppID，替换 project.config.json 的 appid
//      （当前为 'touristappid' 占位，开发者工具可游客模式直接预览，但云能力不可用）
//   ② 开发者工具顶部「云开发」开通，新建【免费体验版】环境，复制环境 ID 填到下方 ENV
//   ③ 云开发控制台新建集合 potty_records，权限设为「所有用户可读，仅创建者可写」
//   ④ 把 USE_CLOUD 改为 true
// 默认 USE_CLOUD=false + ENV=''：工程按本地存储运行，无需任何配置即可直接预览。
// ============================================================
const USE_CLOUD = false;       // 默认关闭云同步；填好 ENV 后将此处改为 true
const CLOUD = {
  ENV: '',                                          // 👉 填写你的云开发环境 ID（cloud1-xxxx），留空则仅本地模式
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

# 宝宝如厕训练助手 · 微信小程序

帮助家长记录和分析宝宝如厕训练进度的微信小程序。支持本地存储和云开发（跨设备共享）两种模式。

## 快速开始

```bash
# 1. 克隆项目
git clone https://github.com/Simiely/potty-training-miniprogram.git

# 2. 微信开发者工具 → 导入项目 → 选择本目录

# 3. 修改配置（3 个必改项）
#    config.js:        LOCK_PASSWORD → 你的 4 位密码
#    config.js:        CLOUD.ENV     → 你的云环境 ID（不用云就跳过）
#    project.config.json: appid      → touristappid（本地调试）或真实 AppID

# 4. 编译运行
```

> **仅本地使用**：不改云配置也能跑，数据存手机本地。
> **跨设备共享**：需要配置云开发环境，见 [CLOUD_GUIDE.md](./CLOUD_GUIDE.md)。

---

## 功能

### 启动锁屏
微信授权后输入 4 位固定密码（仅首次），验证通过后不再弹出。支持指纹/面容解锁（非鸿蒙设备）。错误密码红点抖动提示。

### 记录页面
- 一键记录 4 种事件：小便 / 大便 / 换小内裤 / 换尿不湿
- 今日统计面板 + 时间线视图
- **预测面板**：根据历史间隔推算下次排便时间窗口，含置信度
- 撤销功能（5 秒内可撤回）
- 多记录人管理（家庭成员可切换，头像昵称快照存入记录）

### 分析页面
- 排便间隔趋势（线性回归，判断是缩短/稳定/变长）
- 常见排便时段热力图
- 近 7 天四类事件堆叠柱状图

### 历史页面
- 按日期分组，可展开折叠
- 编辑记录时间（支持修改日期和钟点）
- 单条删除 / 清空全部（3 次确认防误删）
- **账号级权限隔离**：云端模式下只有自己创建的记录才显示编辑/删除按钮

---

## 目录结构

```
├── app.js / app.json / app.wxss    # 应用入口及全局配置
├── config.js                        # 密码、存储 key、云配置、类型语义色
├── theme.json                       # 深浅色主题变量
├── pages/
│   ├── lock/          # 启动锁屏（微信授权 + 密码验证 + 生物认证）
│   ├── record/        # 记录 Tab（快速记录、统计、预测、记录人管理）
│   ├── analysis/      # 分析 Tab（趋势、时段、7 天堆叠图）
│   └── history/       # 历史 Tab（分组展开、编辑时间、删除、权限隔离）
├── custom-tab-bar/     # 自定义底部导航栏（暖橙主题）
├── utils/
│   ├── storage.js     # 本地存储 CRUD
│   ├── cloud.js       # 云开发 CRUD + openid 检测
│   ├── store.js       # 统一数据层（本地/云端自动切换）
│   ├── analysis.js    # 预测算法、趋势分析、时段统计
│   ├── profile.js     # 照顾者档案管理（头像上传）
│   ├── device.js      # 设备标识生成
│   └── platform.js    # 鸿蒙/平台检测
└── assets/             # Tab 图标
```

---

## 技术栈

- **原生微信小程序**（WXML / WXSS / JS），无需 npm 构建
- 双模式存储：本地 `wx.Storage` + 云端 `wx.cloud.database`
- 深色模式支持（CSS 变量 + `prefers-color-scheme`）
- 自定义导航栏 + 自定义 TabBar（暖橙渐变主题）
- HarmonyOS 兼容（`wx.getDeviceInfo()` 平台检测）
- SOTER 生物认证（指纹/面容）
- 数据层开放：`store.js` 一行配置切换本地/云端

---

## 开发参考

关键问题的排查记录和架构决策见 [DEV.md](./DEV.md)。

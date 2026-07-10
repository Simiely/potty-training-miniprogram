# 宝宝如厕训练助手 · 微信小程序

帮宝宝顺利完成如厕训练，家庭成员协同记录，数据云端同步。

## 功能

| 模块 | 说明 |
|------|------|
| **启动锁屏** | 首次打开需微信授权 + 4 位密码，通过后本设备信任，不再弹锁屏 |
| **记录** | 一键记录小便 / 大便 / 换小内裤 / 换尿不湿；今日统计 + 排便预测 + 撤销 |
| **分析** | 排便间隔趋势图、常见时段分布、近 7 天各类型堆叠图 |
| **历史** | 按天分组、可展开折叠、单条删除（仅自己的）、清空（三次确认） |
| **多人协同** | 支持多个照顾者，每人可选头像和昵称；云模式下跨设备实时同步 |

## 使用方式

### 模式一：本地单设备（开箱即用）

1. 微信开发者工具 → 导入项目 → 选择本项目目录
2. 用 `touristappid` 即可编译预览（无需注册）
3. 打开 `config.js`，将 `LOCK_PASSWORD` 改为你想要的 4 位密码
4. 编译运行

### 模式二：云开发同步（多设备共享）

1. 注册真实小程序 AppID：[mp.weixin.qq.com](https://mp.weixin.qq.com)
2. 将 `project.config.json` 中的 `appid` 改为你的 AppID
3. 开发者工具顶部 ☁️ **云开发** → 开通免费版 → 复制**环境 ID**
4. 云开发控制台 → 数据库 → 新建集合 `potty_records` → 权限选「所有用户可读，仅创建者可写」
5. 编辑 `config.js`，改两处：
   - `USE_CLOUD` 改为 `true`
   - `ENV` 填入你的环境 ID
6. 重新编译 → 上传体验版 → 多台设备扫码验证

> 详细云端部署步骤见 [CLOUD_GUIDE.md](./CLOUD_GUIDE.md)。

## 项目结构

```
├── app.js                  # 应用入口，云开发初始化，导航栏高度计算
├── app.json                # 全局配置（页面路由、自定义 tabBar、lazyCodeLoading）
├── app.wxss                # 全局样式
├── config.js                # 密码、存储 key、云开发开关、类型定义
├── project.config.json     # 工具配置（appid、packOptions 等）
├── theme.json              # 深色模式主题变量
├── pages/
│   ├── lock/               # 启动锁屏（授权 + 密码）
│   ├── record/             # 记录页（tab 1）
│   ├── analysis/           # 分析页（tab 2）
│   └── history/            # 历史页（tab 3）
├── custom-tab-bar/         # 自定义底部导航栏
├── components/             # 公共组件
├── utils/
│   ├── store.js            # 统一存储层（本地/云端自动切换）
│   ├── storage.js          # 本地存储（wx.setStorageSync）
│   ├── cloud.js            # 云开发数据层（数据库 + 云存储）
│   ├── device.js           # 设备唯一标识（区分自己和他人的记录）
│   ├── profile.js          # 照顾者档案管理（多记录人切换）
│   └── analysis.js         # 数据分析（趋势 / 时段 / 预测）
├── scripts/
│   ├── setup.js            # 交互式配置向导（AppID / 环境 ID）
│   ├── deploy.js           # 一键部署（配置 + 建集合 + 设权限）
│   └── init-cloud.js       # 自动建云集合
└── assets/                 # 图标资源
```

## 技术栈

- **框架**：原生微信小程序（WXML / WXSS / JS），零 npm 依赖
- **存储**：本地 storage → 云开发数据库（一行配置切换）
- **渲染**：支持深色模式（darkmode）
- **性能**：启用 `lazyCodeLoading` 组件按需注入，启动耗时 < 2s

## 清缓存与重测

- **重测锁屏**：开发者工具 → 清缓存 → 全部清除（清掉 `app_verified`）
- **清理云数据**：云开发控制台 → 数据库 → `potty_records` → 逐条删除或清空集合

# 开发笔记 · 关键问题与解决方案

本文档记录了开发过程中遇到的棘手 Bug 和架构决策，供后续维护参考。

---

## 1. `type="nickname"` 输入框导致保存按钮失效

**现象**：添加新照顾者时，输入昵称后点「保存」无反应，弹出「请填写昵称」。

**根因**：
```wxml
<!-- 问题代码：同时绑了 bindinput 和 bindblur -->
<input type="nickname" bindinput="onNickInput" bindblur="onNickInput" />
```
微信 `type="nickname"` 输入框在用户选择昵称后点击保存按钮时，**blur 事件在 tap 之前触发**，且 `e.detail.value` 返回空字符串。这会导致 `editNickname` 先被 `bindinput` 正确赋值，再被 `bindblur` 清空。`saveProfile()` 校验时发现 nickname 为空，直接拦截。

**修复**：只保留 `bindinput`，删掉 `bindblur`。

**涉及文件**：`pages/record/record.wxml`

---

## 2. `wx.cloud.init` 时机问题

**现象**：云开发模式下头像上传报 `Cloud API isn't enabled, please call wx.cloud.init first`。

**根因**：`app.js` 的 `onLaunch` 中检查了 `wx.cloud` 是否存在——但在某些环境下启动时 `wx.cloud` 尚未注入，守卫条件为假导致 init 被跳过。

**修复**：
- `app.js`：去掉 `wx.cloud` 前置判断，改为 try-catch 兜底，设置 `cloudInitAttempted` 标记
- `utils/profile.js`：新增 `ensureCloudInit()` 兜底函数，首次调用云 API 前补刀 init

**涉及文件**：`app.js`、`utils/profile.js`

---

## 3. `lazyCodeLoading` + 自定义 tabBar 的渲染层警告

**现象**：
```
[渲染层错误] Expected updated data but get first rendering data
```

**分析**：这是微信框架已知 Bug，`lazyCodeLoading: "requiredComponents"` + `custom-tab-bar` 组合触发。`onShow` 中的数据加载有时在首帧渲染完成前就执行了 `setData`。

**尝试过的方案及结果**：

| 方案 | 结果 |
|------|------|
| `onReady` + `_firstShow` 标记 | 引入锁屏页 Bug（密码输入后卡死） |
| `wx.nextTick` | 无效，警告依然出现 |
| `setTimeout` 延迟 switchTab | 无效 |

**最终决定**：不处理。这是框架级问题，不影响任何功能，微信审核不检查此项。DevTools 模拟器中会出现，真机上不一定复现。

**涉及文件**：无需修改（已全部 revert）

---

## 4. 云存储跨用户头像访问

**现象**：A 用户上传的头像，B 用户看不到（显示空白占位符）。

**根因**：云存储默认权限为「仅上传者可读」。A 上传头像得到 `cloud://xxx` fileID 写入数据库，B 读取记录时拿到同一个 fileID，但 B 没有读权限 → 图片加载 500。

**尝试过的方案**：

| 方案 | 结果 |
|------|------|
| `wx.cloud.getTempFileURL()` 批量转换 | 需要云存储设置为「所有用户可读」→ 免费版不支持 |
| 云存储权限改为「所有用户可读」 | 付费功能，不可用 |

**最终决定**：上传者自己能看到头像（走原始 `cloud://` 路径直读），其他用户显示 👤 占位符。`utils/cloud.js` 的 `resolveAvatarUrls()` 和 `toTempUrl()` 中转换失败时清空 URL 避免 500 错误。

**涉及文件**：`utils/cloud.js`

---

## 5. deviceId 替代 openid —— 区分自己和他人的记录

**问题**：历史页需要隐藏他人记录的删除按钮，需要一种方式判断「这条是不是我建的」。

**方案对比**：

| 方案 | 优点 | 缺点 |
|------|------|------|
| 云函数 `getWXContext().OPENID` | 官方标准 | 需要部署云函数；首次调用慢（200-500ms）；未部署时报错 |
| 从自己创建的记录读 `_openid` | 不需要云函数 | 内存变量重启丢失；首次无记录时拿不到 |
| **本地 deviceId** ✅ | 零依赖零部署零网络；即时可用 | 卸载小程序会重置（但此场景可接受） |

**最终采用 deviceId 方案**：
- `utils/device.js`：首次运行时生成 UUID 并持久化到 `wx.setStorageSync`
- 创建记录时写入 `deviceId` 字段
- 历史页 `canDelete = 本机deviceId === 记录.deviceId`

**涉及文件**：`utils/device.js`（新建）、`utils/cloud.js`、`utils/storage.js`、`pages/history/history.js`

---

## 6. 自定义 tabBar 遮挡底部按钮

**现象**：添加照顾者面板的「取消」「保存」按钮被自定义 tab 栏遮住，用户看不到。

**根因**：`.sheet` 底部 padding 只留了 `32rpx + 安全区`，但自定义 tab 栏自身占约 90rpx + 安全区。

**修复**：`.sheet` 的 `padding-bottom` 从 `32rpx` 改为 `140rpx`。

**涉及文件**：`pages/record/record.wxss`

---

## 7. 标签列宽度不一致（2 字 vs 4 字）

**现象**：历史记录中「小便」2 个字和「换小内裤」4 个字的标签宽度不同，导致后面的时间和记录人对不齐。

**修复**：给标签列的 `.hd-name`（历史页）和 `.tl-line .name`（记录页）加上 `min-width: 180rpx`，统一列宽。

**涉及文件**：`pages/history/history.wxss`、`pages/record/record.wxss`

---

## 8. 清空全部记录改为 3 次确认

**需求**：原版只有 1 次确认弹窗，容易误删。

**实现**：`onClearAll` 拆成 3 步链式调用 `wx.showModal`，任何一步「取消」都终止：
1. "确定要删除所有记录吗？此操作无法撤销。"
2. "所有历史数据将被永久清除，确认继续吗？"
3. "此操作不可恢复！确认删除全部记录？"

**涉及文件**：`pages/history/history.js`

---

## 9. 组件按需注入（审核要求）

**问题**：微信审核要求启用组件按需注入，否则不通过。

**修复**：`app.json` 中加入：
```json
"lazyCodeLoading": "requiredComponents"
```

**注意**：项目全部使用原生组件（view、text、image、input 等），无自定义组件声明遗漏问题，加这行直接通过。

**涉及文件**：`app.json`

---

## 10. 云数据库索引优化

**建议**：`potty_records` 集合高频使用 `orderBy('timestamp', 'desc')`，建议建立索引。

**操作**：云开发控制台 → 数据库 → `potty_records` → 索引管理 → 添加索引：
- 字段：`timestamp`
- 排序：降序

---

## 架构决策记录

### 存储层双模式设计（`utils/store.js`）

所有页面通过 `store.js` 访问数据，不直接调用 `storage.js` 或 `cloud.js`。`store.js` 根据 `config.USE_CLOUD` 自动切换后端，一行配置即可在本地/云端间切换。

### 记录人快照设计

记录创建时将照顾者信息（昵称、头像 URL）作为快照写入记录，而非存 ID 引用。这样即使照顾者后来被修改或删除，历史记录中的显示也不会变。

### 云模式下的日期键一致性

本地和云端都使用 `yyyy-MM-dd` 格式的日期键（`dateKey()` 函数），杜绝了 iOS/Android 的日期解析差异（如 iOS 不支持 `toDateString()`）。

---

## 调试技巧

- **重测锁屏**：开发者工具 → 清缓存 → 全部清除（清掉 `app_verified`）
- **检查云数据库**：☁️ 云开发 → 数据库 → `potty_records`
- **检查本地存储**：开发者工具 → 调试器 → Storage 标签页
- **降低基础库版本**：工具栏 → 详情 → 本地设置 → 切换基础库（避免灰度版本的不稳定）
- **游客模式限制**：`touristappid` 下 `wx.operateWXData`、`webapi_getwxaasyncsecinfo` 等 API 返回模拟数据/报错，换真实 AppID 后消失

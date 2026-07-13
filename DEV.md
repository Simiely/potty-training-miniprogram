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

## 5. deviceId 替代 openid —— 区分自己和他人的记录（已升级为 v2 方案，见 #11）

**问题**：历史页需要隐藏他人记录的删除按钮，需要一种方式判断「这条是不是我建的」。

**原始方案 deviceId**：
- `utils/device.js`：首次运行时生成 UUID 并持久化到 `wx.setStorageSync`
- 创建记录时写入 `deviceId` 字段
- 历史页 `canDelete = 本机deviceId === 记录.deviceId`

**问题**：deviceId 在清缓存/换设备后会变化，导致同一用户无法管理自己以前的记录。

**已升级为 openid 方案**，见 [第 11 节](#11-账号级权限隔离从-deviceid-到-_openid)。

**涉及文件**：`utils/device.js`、`utils/cloud.js`、`utils/storage.js`、`pages/history/history.js`

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

## 11. 账号级权限隔离：从 deviceId 到 _openid

**问题**：原 `canDelete` 用 `deviceId` 判断——清缓存后 deviceId 变化，同一用户无法管理自己的旧记录；换设备同理。

**最终方案**：云端模式用 `_openid`（微信云开发自动注入的账号标识）判断归属，本地模式保留 deviceId。

**openid 检测策略（无需云函数）**：
1. **创建回读**：`addRecord` 写完后立即 `doc(id).get()` 读取 `_openid` 并缓存
2. **多数票检测**：首次加载时取最近 10 条记录，出现次数最多的 `_openid` = 当前用户
3. **降级**：openid 为空时回退 deviceId 对比（兼容云函数未部署等场景）

**云函数方案（未采用）**：尝试创建 `getOpenid` 云函数返回 `cloud.getWXContext().OPENID`，但微信开发者工具的「上传并部署」需要特定云环境权限，在某些账号下不可用。最终采用纯客户端检测方案。

**涉及文件**：`utils/cloud.js`（新增 `getCurrentOpenid`、透传 `creatorOpenid`）、`pages/history/history.js`（`canDelete`/`canEdit` 逻辑）、`utils/store.js`

**参考**：`cloudfunctions/getOpenid/` 已删除（改用客户端检测）

---

## 12. 历史记录编辑时间功能

**需求**：允许修改已有记录的时间（补录或纠正误操作）。

**实现**：
- 每条记录右侧新增 🖊 编辑按钮
- 点击弹出底部半屏，内含 `picker mode="date"` 和 `picker mode="time"`
- 预填当前记录时间，修改后合并为 ISO 时间戳
- 数据层 `utils/storage.js` / `utils/cloud.js` / `utils/store.js` 全部新增 `updateRecord(id, updates)` 方法
- 编辑和删除按钮统一受 `canEdit`/`canDelete` 控制（权限逻辑一致）

**涉及文件**：`pages/history/history.js`、`pages/history/history.wxml`、`pages/history/history.wxss`、`utils/storage.js`、`utils/cloud.js`、`utils/store.js`

---

## 13. `block wx:if` / `block wx:else` 导致渲染层崩溃

**现象**：
```
[渲染层错误] Expected updated data but get first rendering data
Error: SystemError (webviewScriptError)
```
发生在两个场景：
- **锁屏页**：点击「微信授权」后 `authorized` 从 false 变 true，页面闪退卡死
- **历史页**：异步加载数据后 `groups` 从 空 变 非空，记录列表渲染异常

**根因**：`<block>` 是虚拟节点（不产生 DOM），`<block wx:if>/<block wx:else>` 配对时，微信框架的 diff 算法在数据首次变更为 true 时，将「首次渲染数据」与「更新数据」错误匹配。当 `lazyCodeLoading` 启用时此问题加剧。

**关键：这不是第 3 节的同类警告——第 3 节是 framework 层无害 warning，而这个是导致页面崩溃/卡死的严重 Bug！**

**修复（极小改动，极大效果）**：将 `<block wx:if>/<block wx:else>` 全部改为两个独立 `<view wx:if>`：
```wxml
<!-- 修复前（崩溃） -->
<block wx:if="{{!authorized}}"><button>授权</button></block>
<block wx:else><view>密码键盘</view></block>

<!-- 修复后（正常） -->
<view wx:if="{{!authorized}}"><button>授权</button></view>
<view wx:if="{{authorized}}"><view>密码键盘</view></view>
```
核心原理：`<view>` 是真实 DOM 节点，框架能正确追踪其数据绑定和 diff。

**涉及文件**：`pages/lock/lock.wxml`、`pages/history/history.wxml`

**教训**：微信小程序中永远不要用 `<block wx:if>/<block wx:else>` 配对控制两种互斥 UI 态。能用 `<view>` 就用 `<view>`。

---

## 14. Flex 布局溢出导致按钮不可见

**现象**：历史记录展开后，右侧的编辑/删除按钮不显示（视觉上消失，DOM 中存在）。

**根因**：`.hd-left` 设置了 `flex-wrap: wrap` 但没有约束宽度。当内容较长时（emoji + 标签 + 时间 + 头像 + 记录人名称），`.hd-left` 撑满整行，把 `.hd-actions`（编辑+删除按钮容器）挤出可视区域。

**修复**：
```css
.hd-left    { overflow: hidden; }        /* 内容不溢出容器 */
.hd-actions { flex-shrink: 0; }          /* 按钮容器永不被压缩 */
.hd-dot     { flex-shrink: 0; }          /* 小圆点不压缩 */
.hd-recorder { flex-shrink: 0; }         /* 记录人不压缩 */
.hd-time    { white-space: nowrap; }     /* 时间不折行 */
```

**涉及文件**：`pages/history/history.wxss`

---

## 15. 日期格式兼容 iOS 解析

**问题**：iOS Safari / WKWebView 不支持 `new Date("Thu Jul 09 2026")` 这种格式，会导致历史分组和排序全部出错。

**修复**：所有日期键使用 `yyyy-MM-dd` 格式（`dateKey()` 函数）：
```javascript
function dateKey(ts) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
```

**涉及文件**：`utils/storage.js`、`utils/cloud.js`

---

## 架构决策记录

### 存储层双模式设计（`utils/store.js`）

所有页面通过 `store.js` 访问数据，不直接调用 `storage.js` 或 `cloud.js`。`store.js` 根据 `config.USE_CLOUD` 自动切换后端，一行配置即可在本地/云端间切换。

### 记录人快照设计

记录创建时将照顾者信息（昵称、头像 URL）作为快照写入记录，而非存 ID 引用。这样即使照顾者后来被修改或删除，历史记录中的显示也不会变。

### 云模式下的日期键一致性

本地和云端都使用 `yyyy-MM-dd` 格式的日期键（`dateKey()` 函数），杜绝了 iOS/Android 的日期解析差异（如 iOS 不支持 `toDateString()`）。

### openid 检测：云函数 vs 客户端

| 方案 | 可靠性 | 复杂度 | 最终 |
|------|--------|--------|------|
| 云函数 `getWXContext().OPENID` | ⭐⭐⭐ 100% | 需部署 | ❌ 部署不可用 |
| 客户端从记录读 _openid | ⭐⭐ | 无 | ❌ 多人时猜错 |
| **创建回读 + 多数票** | ⭐⭐ 95% | 无 | ✅ 采用 |
| 纯 deviceId | ⭐ | 最简单 | ⚠️ 降级使用 |

---

## 调试技巧

- **重测锁屏**：开发者工具 → 清缓存 → 全部清除（清掉 `app_verified`）
- **检查云数据库**：☁️ 云开发 → 数据库 → `potty_records`
- **检查本地存储**：开发者工具 → 调试器 → Storage 标签页
- **降低基础库版本**：工具栏 → 详情 → 本地设置 → 切换基础库（避免灰度版本的不稳定）
- **游客模式限制**：`touristappid` 下 `wx.operateWXData`、`webapi_getwxaasyncsecinfo` 等 API 返回模拟数据/报错，换真实 AppID 后消失
- **查看当前 openid**：Console 中搜索 `[cloud]` 关键词
- **排查按钮不显示**：Console 中搜索 `[history]` 或检查 WXML 面板中 `hd-actions` 节点的子元素

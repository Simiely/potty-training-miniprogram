# 开发笔记 · 关键问题与解决方案

本文档记录了开发过程中遇到的棘手 Bug 和架构决策，供后续维护参考。

> **关于标记**：部分条目标注「working copy」—— 其方案已在本地工作副本（`Documents/xiaochengxu/potty-training-miniprogram-main`）中实现，但**尚未推送到本 GitHub 仓库**（仓库当前快照仍是基础版本：例如 `app.json` 未启用 `resizable`、tabBar 仍为早期 `.pill.on` 写法）。推送对应代码后文档即可与仓库完全对齐。未标注的条目均与仓库当前代码一致。
> iPad 大屏适配、渲染/路由错误根治、openid 探针法、云读取回归等均为 working copy 方案，见 #16–#22。

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

> **⚠️ 更正（working copy）**：此条结论在后续 working copy 中被推翻。`lazyCodeLoading + custom-tab-bar` 引发的首帧 setData 警告**可根治**——彻底删除 tabBar 的 `pageLifetimes.show` / `ready` / `attached` 首帧前 setData，高亮改由「点击 tab 的 `switchTab` 内 `setData` + 三页 `onShow` 调 `getTabBar().setData`」驱动即可消除。详见 #20。仓库当前快照仍是「不处理」状态。

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

> **⚠️ 更正（working copy）**：多数票检测在多人混合记录场景下会把当前用户误判为出现最多的他人 openid（自己看不到删除按钮、他人误显删除图标）。working copy 已改为更可靠的「探针法」检测 openid，见 #19。

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

---

## 16. iPad 大屏适配：为什么「改了没变」反复发生（working copy）

**现象**：加了 `@media(min-width:768px)` 平板样式、改了 px，iPad 上界面始终不变、字巨大、没利用屏幕。

**排查链（按顺序，每一层都是真因）**：

1. **缺 `resizable`**：`app.json` 没有 `"resizable": true` → iPad 被微信当成 iPhone 等比放大运行（两侧黑边 + 手机布局拉满全屏）。这是「没利用屏幕 / 字太大」的第一层根因。
2. **CSS 媒体查询在 iPad 小程序里不命中**：实测 `@media(min-width:768px)` 在微信 / iPad 模拟器下**不触发**（不是没落盘，是断点永远不满足），写在 @media 里的所有平板覆盖都无效。
3. **`windowWidth` 不是物理宽**：`wx.getWindowInfo().windowWidth` 在 iPad 上返回的是被微信限制为**手机比例**的「绘制区域宽度」（约 375~631px），**不是 iPad 物理宽**。所以 JS 用 `windowWidth>=768` 判定平板也永远 false。

**正确做法（最终落地）**：

- 判定平板用 **`screenWidth`**（物理屏总宽：iPad 横屏≈1366 / 竖屏≈1024，均≥768，且不受绘制区域缩放影响），回退 `screenWidth || windowWidth || 375`。
- 每个页面 `onLoad` 读 `screenWidth` → `setData({uiMode:'tablet'|'phone'})`，`onResize` 重算（支持旋转/分屏）。
- wxml 根节点挂 `{{uiMode}}`；所有平板样式写成 **`.tablet` 后代选择器**（`.tablet .appbar-title`、`.tablet .dash` …），由 JS 挂的类触发，**100% 可靠**，彻底绕开媒体查询。
- 全局 `.content` 限宽也从 `@media` 改为 `.tablet .content`。

**额外坑**：页面自身 wxss 里的同名基础规则会**覆盖**全局 `@media` 覆盖（源码顺序）。平板覆盖必须写进各页**自身**的 `.tablet` 块，不能只放全局 `app.wxss`。之前把 `.appbar/.appbar-title/.page` 的 px 覆盖放全局 → 被页面基础规则反超 → 顶栏仍走 rpx 巨字。

**经验**：微信小程序内做响应式，**优先 JS 判定 + 类切换，不要迷信 CSS 媒体查询**。

**涉及文件（working copy）**：`app.json`、`utils/device.js`、四个页面 `js/wxml/wxss`、`app.wxss`。

---

## 17. rpx 在 iPad 上被放大 → 平板必须用 px 覆盖（working copy）

**现象**：`resizable` 后 iPad 以真实逻辑尺寸运行，但内容仍整体偏大。

**根因**：rpx 始终按屏宽缩放。iPad 占满屏时 1rpx≈1.x px（约 1.82），所有 rpx 字号/间距被等比放大 → 字巨大、padding 溢出。

**修复**：平板态（`.tablet`）下用 **px** 重写关键字号 / 卡片 / 间距 / tabBar 自身尺寸（`.tabbar.tablet` 也要单独 px 覆盖）。

**经验**：凡是「iPad 上看起来太大」基本都是漏了某处 rpx 的 px 覆盖；逐元素补 `.tablet` 覆盖即可。

**涉及文件（working copy）**：`app.wxss`、各页 `wxss`、`custom-tab-bar/index.wxss`。

---

## 18. 底部 tab 选中垫（pill）变成长条（working copy）

**现象**：选中某个 tab 时，图标后的高亮垫变成横跨整格的「长条」，而不是紧凑地包住图标。

**根因**：`.pill` 用 `left/right` 内缩实现 → 垫片宽度 = 整个 tab 格宽减去内缩。手机每格窄（≈125rpx）不明显；iPad 每格≈455px → 垫片被拉成横跨整格的长条。

**修复**：`.pill` 改为**居中紧凑圆角垫**——`position:absolute; left:50%; margin-left:-N; width/height:固定值; top:固定值; border-radius`（手机 72rpx、平板 58px），只包住图标，不再随 tab 宽度拉伸。

**经验**：任何「想包住某个元素」的背景层，绝不要用 `left/right` 内缩去撑满父容器；用固定宽高 + 居中。

**涉及文件（working copy）**：`custom-tab-bar/index.wxss`。

---

## 19. openid 检测：多数票 → 探针法（working copy，supersede #11）

**现象（见 #11 多数票方案的缺陷）**：多人记录混合且他人记录更近/更多时，`getCurrentOpenid()` 用最近 10 条多数票把当前用户误判成出现最多的他人 openid → 自己的记录 `canDelete=false`（看不到删除按钮），被误判用户的记录 `canDelete=true`（误显删除图标）。完全吻合「自己删不了、别人误显删除图标」。

**修复（探针法，无需部署云函数）**：

- `detectOpenidByProbe()`：add 一条临时记录（`_probe:true`）→ 读其自动注入的 `_openid`（必为当前账号）→ 立即 remove，零残留、100% 可靠。
- `getCurrentOpenid()` 优先级：内存 → storage → 探针法探测并写回。
- `normalize()` 增加 `filter(r => !r._probe)` 双保险。
- 探针前先 `where({_probe:exists})` 清理历史残留，避免 remove 失败累积垃圾。

**涉及文件（working copy）**：`utils/cloud.js`、`pages/history/history.js`。

---

## 20. 渲染层错误 / Page route 错误的最终根治（working copy）

**现象**：

- `[渲染层错误] Expected updated data but get first rendering data`（冷启动 / 切 tab 弹红字，有时白屏）
- `[Page route 错误] routeDone with a webviewId X is not found`（切 tab 时）

**根因（统一）**：**首帧渲染期 setData / 首帧期 wx.switchTab**。

- 渲染错误：custom-tab-bar 在首帧渲染完成前（attached / ready / pageLifetimes.show）调 `setData({selected})`，与首帧提交竞争。
- 路由错误：入口 lock 页 `onLoad` 同步 `wx.switchTab` 进入 record，此时入口 webview 尚未注册完成，switchTab 销毁它，框架随后回送 routeDone 给已死的 webview → not found。

**最终修复（working copy，已根治）**：

- 高亮**仅**由点击 tab 的 `switchTab` 内 `setData({selected})` + 三页 `onShow` 调 `getTabBar().setData({selected:0/1/2})` 驱动；**彻底删除** custom-tab-bar 的 `pageLifetimes.show` / `ready` / `attached` 首帧前 setData。冷启动进记录页 selected 默认 0 与首页高亮一致，无需首帧前修正。
- 锁定 / 跳转类导航全部推迟到首帧后：`wx.nextTick` 或 `setTimeout(…,0)` 包裹 `wx.switchTab`。

**经验**：微信小程序里 **`custom-tab-bar` + `lazyCodeLoading` 绝对不要在首帧渲染完成前 setData**（attached / ready / pageLifetimes.show 都不行，`wx.nextTick` 在某些组合下也不可靠）；所有跨页导航用 `setTimeout(0)` / `nextTick` 推迟。

**注意**：开发者工具模拟器对 `custom-tab-bar + resizable` 的 `routeDone webviewId not found` 时序告警为**真机不出现、不影响功能**；若必须模拟器零告警，唯一彻底方案是弃用 custom-tab-bar 改用原生 tabBar（会失去自定义高亮样式），由产品决策。

**涉及文件（working copy）**：`custom-tab-bar/index.js`、`pages/{record,analysis,history}.js`、`pages/lock/lock.js`、`app.js`。

---

## 21. 云数据库读取慢 / 拿不到数据（working copy）

**现象**：把 `getRecords` 改为 `count()` + `Promise.all` 并行分页后，开发版既慢又偶发「拿不到数据」（无报错、无 toast、页面静默空）。

**根因**：

1. `getRecords` 串行 `await` 每一页（while 循环逐页 skip）→ 数据量大时 N 次网络往返叠加成秒级卡顿（原慢根因）。
2. `count()` 在部分基础库不应用 `where({timestamp:_.exists(true)})` 过滤 → 返回 total:0 → 函数直接 `return []`；store 把 `[]` 缓存进 `_cache`，同会话内反复返回空（静默空数据根因）。
3. `refreshRecorder` 每次切回记录页对**每个头像逐个串行** `getTempFileURL`（N+1 请求）。

**修复（working copy，对标已发布体验版）**：

- `getRecords` 回归**纯顺序分页**（`while` 逐页 `await`，直到某页 `page.length<20` 停止），带 `where({timestamp:_.exists(true)})` 恒真条件 + `catch` 抛错提示；不依赖 `count()`。数据量 <1000 用 skip 分页开销可忽略，且稳定。
- 头像批量：`toTempUrlBatch(fileIds)` 一次请求转多个 + `_tempUrlCache` 内存缓存（90 分钟 TTL），`refreshRecorder` 改用批量，切回页 90 分钟内零请求。

**经验**：`count()` + 并行在如厕数据量级提速有限且兼容性有雷；**稳定优先于微优化**。头像 N+1 请求用批量 + 缓存解决。

**涉及文件（working copy）**：`utils/cloud.js`、`pages/record/record.js`。

---

## 22. 元问题：修复「没落盘」与真实目录 vs 沙箱副本（working copy）

**现象**：多轮「改了代码但界面没变」，反复排查才发现改动没真正写进磁盘，或改错了副本。

**根因**：

1. Read / Edit 工具并行提交时曾报成功但磁盘未落盘（与历史「改了没变」同类坑）。
2. 真实工作副本在 `Documents/xiaochengxu/potty-training-miniprogram-main`，而 workbuddy 会话目录下有一份 sandbox 副本，两者混淆 → 改了沙箱、测的是真本。

**经验 / 流程**：

- 任何「改了没变」先 `grep` / `cat` 磁盘真实文件确认是否落盘，再怀疑逻辑。
- 明确唯一真实副本路径，不要对沙箱副本做功能修改（沙箱改动用户看不到）。
- 多文件改动后逐个 `node --check` + 重新编译验证。

**涉及文件**：流程规范，无特定代码文件。

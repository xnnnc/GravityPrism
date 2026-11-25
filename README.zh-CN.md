<div align="center">

<img src="assets/logo.svg" width="96" height="96" alt="Obsidian Prism Logo" />

# Obsidian Prism · 黑曜棱镜

**为 Google Antigravity 打造的原生光学界面套件**

四套深浅配色 · 会呼吸的 512K 上下文试管 · 推理等级滑块 · 像素伙伴 · 自定义动静态壁纸（Beta）· Chat 对话模式（Beta）

[**Türkçe**](./README.md) · [**English**](./README.en.md) · [**简体中文**](./README.zh-CN.md) · [**更新日志 (CHANGELOG)**](./CHANGELOG.md) · [**上游 Releases**](https://github.com/RMvdesi/obsidian-prism/releases)

<p>
  <a href="https://github.com/RMvdesi/obsidian-prism/releases"><img src="https://img.shields.io/github/v/release/RMvdesi/obsidian-prism?style=flat-square&color=3186ff&label=Release" alt="Latest Release" /></a>
  <img src="https://img.shields.io/badge/Version-1.0.7-0f172a?style=flat-square" alt="Version 1.0.7" />
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20Universal-1e293b?style=flat-square" alt="Platform" />
  <a href="https://github.com/RMvdesi/obsidian-prism/actions"><img src="https://img.shields.io/github/actions/workflow/status/RMvdesi/obsidian-prism/ci.yml?branch=main&style=flat-square&label=CI" alt="CI Status" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-GPL--3.0-2563eb?style=flat-square" alt="License: GPL-3.0" /></a>
  <a href="./NOTICE"><img src="https://img.shields.io/badge/Attribution-Required%20(NOTICE)-8b5cf6?style=flat-square" alt="Attribution Required" /></a>
</p>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/screenshots/hero-dark.webp" />
  <source media="(prefers-color-scheme: light)" srcset="assets/screenshots/hero-light.webp" />
  <img src="assets/screenshots/hero-dark.webp" width="100%" alt="Obsidian Prism v1.0.7 界面演示" />
</picture>

<sub>以上画面由离线渲染舞台直接运行本仓库前端源码逐帧录制，示例工作区与对话内容均为虚构。</sub>

</div>

> **非官方社区项目与商标免责声明 (Non-Affiliation Disclaimer)**
>
> **Obsidian Prism is an independent open-source project and is not affiliated with or endorsed by Google LLC.**
> 本项目为独立的开源社区工程，与 Google LLC 无任何隶属、赞助或官方背书关系；文中提及的 “Antigravity” 与 “Google” 仅作兼容性说明用途。

---

## 亮点

- **四套配色，一键换装**：深空黑曜、暖炭玄岩两套深色，白昼冷晶、暖白画册两套浅色，可跟随系统亮暗自动切换。
- **看得见的上下文**：输入框旁的小试管实时显示 512K 上下文用量，点开就能看到用量拆分和配额剩余预测。
- **推理等级，一拨就换**：模型菜单里内置星空滑块；选中 Orchestrator 时，滑块会变成一条会折射光线的切工水晶。
- **读得懂的思考过程与标题**：模型的思考内容支持实时转译成中文（沉浸 / 双语对照）与一键诊断，支持手动 HTTP/SOCKS5 代理、可选工具摘要与会话标题自动翻译。
- **自定义动静态背景壁纸（Beta 占位）**：已归入设置「Beta 内容」分类（目前几乎仅作占位展示，尚未成熟，大多不太能正常使用），默认关闭零占用。
- **桌面上的像素伙伴**：Clawd、小紫猫和三只迷你蟹会在输入框上方玩叠叠乐，还藏着一个彩虹彩蛋。
- **更顺手的工作台**：内置浏览器和大文件检视台、右键快捷菜单、长代码块折叠、会话大纲快速跳转。
- **Chat 对话模式（Beta）**：在写代码之外，多了一个专门聊天、整理资料的空间，和工程设置互不干扰。
- **轻、快、守规矩**：动画空闲时自动降到 0fps；本地服务只监听本机；设置改动 10 毫秒内生效，随时一键卸载还原。

---

## 界面预览

### 1. 四套配色

<p align="center">
  <img src="assets/screenshots/palettes.webp" width="100%" alt="四套深浅配色方案" />
</p>

| 主题预设 | 配置键值 | 侧栏底色 | 主画布 | 说明 |
| :--- | :--- | :--- | :--- | :--- |
| **深空黑曜** | `palette: "obsidian"` | `#09090B` | `#0E0E11` | 冷调深灰底色，高对比度代码阅读配色 |
| **暖炭玄岩** | `palette: "warm"` | `#10100F` | `#141413` | 暖炭褐底色，低蓝光夜间配色 |
| **白昼冷晶** | `lightPreset: "crystal"` | `#E8EEF6` | `#F4F7FB` | 冷调浅灰蓝侧栏与高明度工作区 |
| **暖白画册** | `lightPreset: "alabaster"` | `#EBE6DC` | `#F6F4EE` | 暖白纸色背景，柔和对比度浅色配色 |

### 2. 光学细节：上下文试管 · 推理滑块 · 切工水晶

点击底部试管可展开用量浮窗，查看上下文切片、5 小时配额与模型池余量；模型菜单里的推理等级滑块随档位点亮星辰，Orchestrator 则显示为切工水晶条。

<p align="center">
  <img src="assets/screenshots/optics.webp" width="100%" alt="512K 上下文试管、推理等级滑块与 Orchestrator 切工水晶" />
</p>

### 3. 像素伙伴

输入框上方的像素伙伴可以拖拽、叠成 5 层高塔；满足特定条件时，小紫猫会披上彩虹极光（无操作时自动休眠，可在设置中关闭）。

<p align="center">
  <img src="assets/screenshots/companions.webp" width="100%" alt="像素伙伴叠叠乐与彩虹彩蛋" />
</p>

### 4. Chat 对话模式（Beta）

默认关闭，可在 **设置 → 外观 → Beta 内容** 中开启。开启后侧栏顶部可在 Code 与 Chat 之间切换，用文件夹整理日常对话，权限按项目隔离，不改动全局工程设置。

<p align="center">
  <img src="assets/screenshots/chat-mode.webp" width="100%" alt="Chat 对话模式（Beta）" />
</p>

### 5. 更多能力

- **外观设置中心**：集成在 **设置 → 外观**，双栏光学布局、5 种界面语言、**33 项**端到端可校验配置（含侧栏导航折叠 `sidebarNavFold`、滚底动效 `scrollBottomMotion` 与「正式版 / Beta 尝鲜版」双更新通道）、三档场景预设（完整光效 / 专注编码 / 静默省电）、配置备份恢复与面板内一键更新。
- **思考转译与标题翻译（Channel 5 按需通道）**：关闭态默认 `0 B` 注入并支持热插拔；内置免配置机器翻译与本地/兼容模型流式转译，支持 OS 系统代理自动检测与手动 HTTP/SOCKS5 代理、可选工具摘要与会话标题自动翻译、卡片顶部「一键诊断」及源码路径/行号跳转。
- **自定义静态 / 动态视频壁纸（Channel 7 · Beta）**：实验性按需通道，默认关闭零占用；纯本机只读加载图片（JPG/PNG/WebP/GIF/AVIF）与动态视频（MP4/WebM），支持透明度/模糊/护眼遮罩调节、Browser Hole 自动避让及失焦/隐藏自动 `0fps` 暂停。
- **Omni 检视台与行内 Diff 预览（Channel 6）**：裸链接、本地路径一键在侧栏打开，文件变更支持行内 Diff 预览；超大视频、音频、PDF、表格、字体流式预览，右键菜单复制路径、定位文件、插入引用。
- **Smoked Obsidian 切面与工作台增强**：统一烟熏黑曜消息气泡、变更条、Artifact 卡片与石墨键帽；代码块顶栏吸顶、长代码块手动折叠、左侧会话导轨独立大纲入口与悬停大纲、`Alt+↑` / `Alt+↓` 上下轮跳转，以及会话区右键 `/btw` 侧边提问与 `/compact`、`/plan`、`/learn`、`/grill-me` 原生斜杠快捷指令。

<details>
<summary><strong>技术细节：性能、安全边界、遥测与配置（点击展开）</strong></summary>

**Obsidian Prism (`v1.0.7`)** 在不改动宿主业务逻辑、不触碰外部插件锁文件的前提下，通过原生七通道 Sidecar 插件架构为 Antigravity 桌面端提供 Smoked Obsidian 视觉界面、工作台交互与行内 Diff 增强、侧边栏内置浏览器与多格式流式检视台、模型配额遥测、思考过程转译及实验性动静态壁纸（Beta）：

- **四套深浅配色与细节微调**：内置深色（`obsidian` 深空黑曜、`warm` 暖炭玄岩）与浅色（`crystal` 白昼冷晶、`alabaster` 暖白画册）共四套主题，支持跟随系统/宿主亮暗切换；统一 Smoked Obsidian 烟熏黑曜切面（用户消息气泡、文件变更条、Artifact 卡片、石墨键帽与单层行内文件芯片）；提供 5 档工业强调色（跟随模型 / 钴蓝 `cobalt` / 鸢尾紫 `iris` / 琥珀金 `amber` / 纯银钛单色 `mono`）、3 档全局圆角、4 档代码等宽字体与连字开关、环境光浓度调节。
- **300Hz 高刷分频、五级水墨流式淡入与 `0fps` 语义余晖**：移除常驻大面积 `backdrop-filter` 模糊开销，休眠时 Canvas VRAM 主动回收至 `0x0`；对话流式吐字采用基于 `CSS.highlights` 的**五级水墨流式淡入**（零 DOM 节点包裹、零强制同步回流），在超长会话（`34k+` DOM 节点）与高刷屏下保持流畅零卡顿；推理稳态期背景极光自动限频至 `~30fps` 降低 GPU 占用，空闲 `1.2s` 后进入 `0fps` 休眠；支持「待用户决策 / 异常中止 / 长任务后台完成」三态无弹窗边缘余晖提示，静态定格后维持 `0fps` 零重绘。
- **宿主深水区工作台适配**：通过宿主原生 `preload` 协议向 `plugin://*` Sidecar 面板（Swarm、Pulse 等）按需同步 24 项主题色彩变量，消除跨源 `iframe` 浅色闪白；Markdown 与 Artifacts 代码块顶栏支持 Sticky 吸顶，已完成且 `>= 48` 行的长代码块提供手动折叠/展开（不做自动截断，收起时自动补偿滚动位置）；左侧原生会话导轨支持长会话章节刻度、悬停提问大纲与关键词过滤、一键折叠历史步骤及非编辑焦点下 `Alt+↑` / `Alt+↓` 上下轮跳转；统一底部终端与后台任务卡片的控制台凹槽（Console Well）样式。
- **Omni 宿主原生内置浏览器联动、右键菜单与流式检视台**：支持开关控制（`omniModule: "on" | "off"`）与链接打开位置配置（`linkTarget: "builtin" | "external"`）。全面贯彻**官方优先礼让**：对宿主原生 `<a href="http...">` 链接、页内搜索、外链确认弹窗及原生 `<= 200MB` 音视频/CSV/PDF/HTML 预览 100% 礼让官方能力；仅通过 `CSS.highlights`（Custom Highlight API）零 DOM 篡改激活纯文本裸 URL、`localhost` 端口与本地路径（左键链接可直达右侧多标签内置 Browser Tab），并在宿主右侧栏报体积超限（`> 20MB` / `> 200MB`）或无预览时原位接管为流式检视台（切回正常文件自动卸载）。日常阅读保持**零悬停浮窗干扰**，仅在右键点击裸链接、文件药丸、Artifact 卡片或 Mermaid 图表时弹出操作菜单（复制绝对/相对路径、在文件夹中定位选中、作为 `@引用` 填入输入框、内外部浏览器打开、图表缩放）。流式检视台基于仅监听 `127.0.0.1` 的 HTTP `206 Range` 流式网关，支持大体积视频逐帧检视、音频毫秒级波形打点、SVG/透明图棋盘格缩放画布（含 PNG 导出）、本地 HTML 响应式视口沙盒、PDF、`CSV/TSV/JSONL` 冻结表头检索与 `TTF/OTF/WOFF2` 字体样张预览。
- **纵深安全边界与本地隔离**：CDP 特权绑定（`__agPrism*`）强制校验顶层主 Frame 上下文，拒绝任何子 `<iframe>` 越权调用；本地流式网关与 Sidecar 实施 Fail-Closed `Host` 与跨站请求校验、UNC / NT 设备路径拦截、`realpath` 敏感凭据与 Google/Antigravity 核心凭据目录保护，下载更新实施预写内存 SHA-256 校验；行内 Diff RPC 强制校验 Git 仓边界、`.git` gitfile/UNC Fail-Closed、`--literal-pathspecs`、`--no-optional-locks` 与安全 `[filter]` 降级；本地 HTML 预览采用 `HMAC-SHA256` 单目录作用域只读子令牌与受限 `sandbox` 隔离，思考转译防跨源 `apiKey` 复用、禁用重定向并阻断云元数据与高危内网端口。
- **双窗口配额遥测与 512K 上下文指示**：遥测引擎对齐上游 [`ATtacK030130/antigrative-dashboard`](https://github.com/ATtacK030130/antigrative-dashboard) `v0.9.1`，支持全模型池 **5 小时 + 周度（Weekly）双窗口配额监控与线性耗尽预测**、**主会话与 Swarm/子代理 Token 消耗拆分**、**Cache 命中率**统计，以及基于 CDP 进程族谱的多实例归属识别；Studio 首页看板提供概览、趋势与模型配额三视图及按工作区筛选；遥测目录独立隔离，检测到外部独立插件时自动礼貌避让（Auto-Yield）。
- **双模思考转译工作台（Channel 5）**：拆分为独立按需通道（关闭态默认 `0 B` 注入），同时支持免配置**机器翻译**与 **OpenAI 兼容接口流式转译**，新增零依赖异步 OS 系统代理自动检测（Windows/macOS），放行本地免密端点（`localhost` / 局域网 Ollama、LM Studio、vLLM 等无需填写 API Key）；基于 `file://` 协议白名单还原思考内容中的源码路径与 `#L` 行号点击跳转；内置服务端并发限流（上限 `3`）与视口优先调度队列、单块失败重试与强制重译，支持「沉浸纯译文 / 双语上下对照」切换及双端缓存清理；API Key 与提示词以 `0600` 权限仅保存在本机配置目录。
- **Chat 对话模式 (Beta · 默认关闭)**：默认保持关闭，可在 **设置 → 外观 → Beta 内容** 中随时开启或关闭（`sidebarStudio: "on" | "off"`）。开启后可在侧栏顶部切换工程模式与专注日常交流、文档整理的 Chat 空间，提供独立文件夹/项目组织、多轮阅读视图与 Artifacts 侧边栏预览，并实行项目级权限隔离，避免改动全局工程设置。
- **七通道按需微内核、零-`eval` LZSS 与毫秒级热刷新**：前端拆解为 `ui-runtime.js` 微内核与 6 个高内聚控制器模块，结合零-`eval` 同步 UTF-16 LZSS 压缩将 Channel 1 静态主包稳守 `~685 KB` 内（远低于 `704 KB` 红线；Omni 检视台、Chat 侧栏、宿主汉化、思考转译 Channel 5、行内 Diff Channel 6 与动静态壁纸 Beta Channel 7 均按独立通道按需加载），配合 7 通道统一磁盘缓存（`.bundle-cache.json`）跨进程冷启动仅 `~26 ms`；设置中心覆盖 **33 项**可校验配置键（支持「正式版 / Beta 尝鲜版」双更新通道），内置三档场景预设、分类子标签页与自动剥离私钥凭据的脱敏 JSON 导入/导出备份，配置变更通过单飞增量广播在 `< 10 ms` 内热刷新生效。

</details>

---

## 快速安装指南 (Quick Start)

Obsidian Prism 提供 **「免环境图形安装包」** 与 **「源码部署原生插件」** 两种安装方式，原生兼容 **`Antigravity v2.33.0+`**（自动维护启动入口 `--remote-debugging-port=0` 并在客户端在线更新后支持一键带参重开恢复），刷新或重启客户端均自动生效，随时可无痕卸载还原：

### 方式一：图形化独立安装包（推荐普通用户 · 零外部依赖，免预装 Node.js）
点击下方直链下载对应系统安装包（或前往 [**GitHub Releases**](https://github.com/RMvdesi/obsidian-prism/releases) 查看历史版本与 Beta 预发布版）：
1. **Windows (`x64`)**：下载 [**`obsidian-prism-installer.exe`**](https://github.com/RMvdesi/obsidian-prism/releases/latest/download/obsidian-prism-installer.exe) 并双击运行，点击安装即可一键部署完整原生插件至 `~/.gemini/config/plugins/obsidian-prism`，自动复用 Antigravity 客户端内置运行时（无需系统预装 Node.js）无窗拉起全套七通道 Sidecar 能力并注册开机守护；再次运行同一程序可一键干净卸载还原。
2. **macOS (`Apple Silicon & Intel Universal`)**：下载 [**`Obsidian-Prism-macOS-universal.dmg`**](https://github.com/RMvdesi/obsidian-prism/releases/latest/download/Obsidian-Prism-macOS-universal.dmg)，挂载镜像并将 `Obsidian Prism.app` 拖入 `/Applications`（应用程序）文件夹，随后**双击运行一次 `Obsidian Prism.app`** 即可完成全套七通道原生插件部署与 `LaunchAgent` 自启配置（同一应用亦提供一键卸载还原）。

> **首次打开系统安全提示（未签名开源构建说明）**
> - **Windows SmartScreen**：首次运行安装器若弹出「Windows 已保护你的电脑」，请点击 **「更多信息」→「仍要运行」**。
> - **macOS 15+ Gatekeeper**：由于安装包采用开源 Ad-hoc 签名（未申请商业 Apple Developer ID 公证），首次打开若提示「未打开 / 无法验证开发者」，请打开 **「系统设置 → 隐私与安全性」** 滑至底部点击 **「仍要打开」**，或在终端执行以下命令清除浏览器下载隔离属性后重新双击：
>   ```bash
>   xattr -cr "/Applications/Obsidian Prism.app"
>   ```

### 方式二：源码部署为 Antigravity 原生插件（推荐开发者，支持面板内一键拉取 Git 更新）
```bash
git clone https://github.com/RMvdesi/obsidian-prism.git
cd obsidian-prism

# 部署至 ~/.gemini/config/plugins/obsidian-prism 并立即连接当前窗口
npm run install:plugin
```
安装完成后打开 **设置 (Settings) → 外观 (Appearance)**，展开 **「Obsidian Prism · 黑曜棱镜」** 区域即可调整各项参数。

### AI 助手代装标准流程 & 思考翻译排查清单
如果你使用 AI 助手（Claude Code、Cursor、Antigravity Agent 等）协助从源码安装，请**严格执行以下标准命令**完成部署与验收：
```bash
git clone https://github.com/RMvdesi/obsidian-prism.git
cd obsidian-prism

# 1. 必须执行完整原生插件部署（同步全部模块并启动后台常驻 Sidecar 守护进程）
npm run install:plugin

# 2. 必须执行安装状态自检，确认后台守护与按需通道均已就绪
node tools/install-plugin.cjs --status
```
- **严禁仅执行 `npm run inject` 替代安装**：`npm run inject` 仅做单次临时前端注入，**不会**将插件部署至 `~/.gemini/config/plugins/obsidian-prism`，也**不会**启动常驻 Sidecar 守护进程——这会导致思考翻译、本地遥测与动态壁纸等 Sidecar 通道离线，且在窗口刷新、重启或更新后立即失效。
- **核对 `--status` 自检项**：确认返回 JSON 中 `installed: true`、`daemonAlive: true`、`hasThoughtTranslator: true`、`hasWallpaperChannel: true`；若 `bareAntigravityRunning: true`（常见于客户端在线更新后裸启），请关闭 Antigravity 并通过已自动补齐 `--remote-debugging-port=0` 的桌面/开始菜单快捷方式重开一次即可激活。
- **思考过程翻译排查清单**：
  1. **出厂默认关闭**：思考过程翻译（Channel 5）默认关闭（`thoughtTranslate: "off"`，零注入），安装后需打开 **设置 (Settings) → 外观 (Appearance) → Obsidian Prism**，手动切换为 **机器翻译（免配置）** 或 **AI 模型流式转译**（按需可同时开启「会话标题自动翻译」）。
  2. **开启后无反应**：点击思考翻译设置卡片顶部的 **「一键诊断」** 按钮，即可一键核验守护桥接在线态、当前模式/模型配置、系统代理与上游网络连通性；也可重新执行 `node tools/install-plugin.cjs --status` 确认 `daemonAlive: true`。
  3. **更新或裸启后样式暂时回退**：若客户端刚完成在线自动更新且当次裸启无调试端口，接受守护进程弹出的温和重开恢复提示，或直接通过桌面/开始菜单快捷方式重启一次 Antigravity 即可恢复。

### 常见问题与 `Antigravity v2.33.0+` 兼容说明 (FAQ)
- **为什么客户端在线自动更新到 `v2.33.0+` 当次重启后界面暂时回到原生状态？**
  自 `Antigravity v2.33.0` 起，宿主将本地调试桥接改为显式按需启用（`--remote-debugging-port=0`，仅在本地 `127.0.0.1` 随机分配端口并写入受限鉴权文件），且客户端内置在线更新器（`quitAndInstall`）当次拉起进程时不携带命令行参数。Obsidian Prism 内置双层自动恢复机制：
  1. **日常启动零感生效**：安装器、插件脚本与后台守护会自动为桌面、开始菜单及任务栏固定栏的 `Antigravity` 快捷方式维护 `--remote-debugging-port=0` 参数（客户端升级重置快捷方式后会自动补回；卸载插件时精准剥离还原）。
  2. **在线更新裸启一键恢复**：当守护进程检测到运行中的客户端未开启本地桥接端口时，会弹出**单次确认提示框**（同一客户端进程生命周期最多提示 1 次，选择稍后不会重复弹窗），确认后将等待当前实例安全退出并自动带 `--remote-debugging-port=0` 重新打开恢复全套界面；macOS 用户亦可执行 `open -a "/Applications/Antigravity.app" --args --remote-debugging-port=0` 手动带参启动。

<details>
<summary><strong>命令行维护工具与仓库目录结构（点击展开）</strong></summary>

#### 常用开发与维护命令
```bash
npm run inject                 # 单次实时注入当前已打开的 Antigravity 窗口
npm run remove                 # 移除全部注入样式与组件，立即恢复宿主原生界面
npm run clean:legacy           # 清理历史旧版 app.asar 遗留块（保留汉化与外部插件）
npm run archive:conversations  # 检查本地对话库体积并离线安全归档历史子代理会话（支持无损还原）
npm test                       # 运行跨模块安全、性能与回归测试套件
npm run build:installer        # 编译 Windows 独立安装器 (.exe)
npm run build:macos            # 编译 macOS Universal 安装包 (.dmg)
```

#### 仓库核心目录结构
```text
obsidian-prism/
├── plugin.json                         # Antigravity 原生插件清单 (obsidian-prism@1.0.7)
├── LICENSE / NOTICE / CITATION.cff     # GPL-3.0 许可证、附加署名声明与仓库引用元数据
├── THIRD_PARTY_NOTICES.md              # 吸收整合的上游 MIT 项目完整版权与许可声明
├── assets/                             # 插件矢量图标与说明文档截图资源
├── cdp.js / inject.js / remove.js      # 零-eval LZSS 打包器 (<685KB)、7 通道磁盘缓存与注入卸载协议
├── style.css                           # 四套深浅主题、Smoked Obsidian 切面与宿主表面样式表
├── i18n-locales.js / i18n-core.js      # 简/繁/粤/英/日 5 语种多语言词条模块
├── motion-engine.js / animated-icons.js# 4 档二阶阻尼弹簧动画与微动态图标模块
├── ripple-core.js / conv-aura.js       # 300Hz 分频 WebGL2 地平线着色器与三态 0fps 语义余晖
├── smooth-caret.js / dual-mascot-rig.js# 读写分离编辑器光标跟随与桌面像素双宠模块
├── usage-core.js / vial-core.js        # 用量统计/双窗口配额预测纯函数与 512K 浅水波胶囊
├── pulse-vial-bridge.js                # 上下文切片拆分与 5h/周配额浮窗桥接器
├── settings-panel.js                   # 外观设置中心（33 项配置、场景预设、脱敏 JSON 备份）
├── home-studio-panel.js                # 控制器 1：Studio 新建会话看板（概览/趋势/配额三视图）
├── home-ripple-host.js                 # 控制器 2：首页字符波纹矩阵宿主控制器
├── model-glyph-crystal.js              # 控制器 3：模型星标与 WebGL2 棱镜状态栏控制器
├── stream-choreography.js              # 控制器 4：CSS.highlights 五级水墨流式淡入与表格行级防抖控制器
├── prism-rim-canvas.js                 # 控制器 5：近场指针边框高光控制器
├── host-workbench-enhancer.js          # 控制器 6：Sidecar 主题同步桥、代码折叠与导轨大纲控制器
├── ui-runtime.js                       # 前端微内核：配置热同步、DOM 观察器与生命周期编排
├── sidecars/daemon/                    # 七通道常驻守护进程 (设置/遥测/用量/Git/归档/思考/Omni/行内Diff/壁纸Beta)
├── vendor/                             # 遥测 (v0.9.1)、滑块、思考转译(Ch5)、行内Diff(Ch6)、壁纸Beta(Ch7)、omni-viewer、sidebar-studio 与 host-i18n
└── installer/ & tools/                 # Windows (C#) / macOS (Swift) 原生插件安装器与工具链
```
</details>

---

## 开源协议、二次开发规范与引用格式

### 1. 二次开发与分发协议 (`GPL-3.0-only` + `NOTICE`)
**Obsidian Prism**（`Copyright (C) 2026 RMvdesi`）采用 **[GNU General Public License v3.0 (`GPL-3.0-only`)](./LICENSE)** 开源发布，并附带基于 GPL-3.0 第 7 条的法定附加归属声明 **[`NOTICE`](./NOTICE)**。

基于本项目进行修改、二次开发、移植或打包再分发时，须遵守以下三项要求：
1. **同源开源义务（Copyleft）**：任何包含或修改自本项目代码的衍生插件、主题包或安装程序，整体须同样以 **`GPL-3.0`** 免费开放完整对应源代码，禁止闭源打包、代码混淆锁死或商业闭源售卖。
2. **保留署名与致谢链（Attribution Required）**：须在衍生仓库根目录完整保留 [`LICENSE`](./LICENSE)、[`NOTICE`](./NOTICE) 与 [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md)，并在 README 或设置界面保留对原作者 `RMvdesi` 及原仓库 `RMvdesi/obsidian-prism` 的来源链接。
3. **标注修改记录与非官方背书（Mark Modifications）**：修改过的文件须注明修改日期与变更摘要；未经书面许可不得以未修改的 `Obsidian Prism` 官方原版名义发布衍生版本。

#### 下游二次开发 README 署名模板
```markdown
> Built upon [Obsidian Prism](https://github.com/RMvdesi/obsidian-prism) by [@RMvdesi](https://github.com/RMvdesi), licensed under [GPL-3.0](https://www.gnu.org/licenses/gpl-3.0.html). Upstream component notices are preserved in `NOTICE` and `THIRD_PARTY_NOTICES.md`.
```

#### 引用格式 (`CITATION.cff` / BibTeX)
```bibtex
@software{rmvdesi_obsidian_prism_2026,
  author       = {RMvdesi},
  title        = {{Obsidian Prism: Modular Optical UI, Workbench Enhancements, Omni File Viewer, Quota Telemetry & Thought Translator for Antigravity}},
  year         = {2026},
  version      = {1.0.7},
  license      = {GPL-3.0-only},
  url          = {https://github.com/RMvdesi/obsidian-prism}
}
```

---

### 2. 上游开源项目与致谢 (Upstream Credits)

本项目吸收适配的第三方组件原采用 **MIT License**（与 `GPL-3.0-only` 兼容），完整原始版权声明与许可全文保留于 [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md)：

1. **[0DNANCY/agy-claude-style](https://github.com/0DNANCY/agy-claude-style)** — `MIT License`, `Copyright (c) 2026 0DNANCY`（基础配色框架、弹簧动画底座、WebGL2 地平线/字符波纹矩阵、像素宠物底座与打包器雏形）。
2. **[ATtacK030130/antigrative-dashboard](https://github.com/ATtacK030130/antigrative-dashboard)** (`v0.9.1`) — `MIT License`, `Copyright (c) 2026 AG Pulse contributors`（吸收适配于 `vendor/pulse-dashboard/`，用于实时吞吐速率、Cache 命中率、5h/周双窗口模型配额预测、主/子代理消耗拆分与多实例进程血缘归属）。
3. **[LLYSH-HANNARI/antigravity-Codex-Claude-effort-slider](https://github.com/LLYSH-HANNARI/antigravity-Codex-Claude-effort-slider)** — `MIT License`, `Copyright (c) 2026 月上寒 (LLYSH-HANNARI)`（吸收适配于 `vendor/effort-slider/`，用于模型菜单推理等级滑块与智能共存让位）。
4. **[yiheng8023/antigravity-chinese](https://github.com/yiheng8023/antigravity-chinese)** (`v3.3.19`) — `MIT License`, `Copyright (c) 2026 Antigravity Chinese Localization Contributors`（参考其 `zh-CN` 词库与前端 DOM 翻译匹配思路；本项目已在 `vendor/host-i18n/` 重构为 Zero-ASAR 纯 CDP Channel 4 按需通道，并新增四层未知插件通用自动礼让、防死循环熔断与 `WeakMap` 100% 无损还原）。
5. **[Nwflower/dsh-claude-style](https://github.com/Nwflower/dsh-claude-style)** — Studio 极简排版、输入框边框结构与暖白浅色配色参考致谢。
6. **[Microqian2th/dsh-codex-effort-slider](https://github.com/Microqian2th/dsh-codex-effort-slider)** — 轨道刻度分档、迟滞吸附与阻尼运动曲线参考致谢。
7. **[mobius/dsh-performance-slider](https://github.com/mobius/dsh-performance-slider)** — 性能档位滑块交互与实时反馈设计参考致谢。
8. **[claudenoshujin/claude-web](https://github.com/claudenoshujin/claude-web)** (by `lulu`) — 桌面宠物堆叠交互设计参考致谢（本项目物理逻辑为净室独立实现）。

---

### 3. 社区贡献者 (Community Contributors)

衷心感谢所有通过 Pull Request、安全加固、性能剖析与一线缺陷定位推动 Obsidian Prism 持续演进的社区伙伴！

- **完整社区贡献者荣誉名录与贡献详情**：请见 [**`CONTRIBUTORS.md`**](./CONTRIBUTORS.md)（永久收录全部 PR 贡献者与核心 Issue 定位反馈者，并同步留档于 [`CHANGELOG.md`](./CHANGELOG.md)）。
- 欢迎通过 [Issues](https://github.com/RMvdesi/obsidian-prism/issues) 与 [Pull Requests](https://github.com/RMvdesi/obsidian-prism/pulls) 一起参与打磨！

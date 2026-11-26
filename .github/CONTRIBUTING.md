# 贡献指南 / Contributing to Obsidian Prism

感谢你为 **Obsidian Prism（黑曜棱镜）** 贡献代码、问题复现与改进建议！

## 环境要求

- **Node.js >= 22.0.0**（仅使用内置 `fetch`、`WebSocket` 与 `node:test`，**保持 0 运行时 npm 依赖**）。

## 仓库目录规范（参考 RFC #69）

- **根目录**：仅保留核心元数据（`README.md`、`CHANGELOG.md`、`LICENSE`、`NOTICE`、`THIRD_PARTY_NOTICES.md`、`CITATION.cff`、`package.json`、`plugin.json`、`config.example.json`）及待 Phase 2 迁入 `src/` 的既有核心运行时模块；**请勿向根目录新增散落文档、脚本或临时文件**。
- **`.github/`**：GitHub 工作流、Issue/PR 模板、以及社区治理文档（`CONTRIBUTING.md`、`CODE_OF_CONDUCT.md`、`SECURITY.md`）。
- **根目录英文主文档**：`README.en.md` 与 `README.md` 同留根目录作为双语主入口；
- **`docs/`**：贡献者名录（`docs/CONTRIBUTORS.md`）与架构/衍生设计文档。
- **`scripts/`**：打包构建脚本、测试运行器（`scripts/run-tests.mjs`）及 Windows 辅助批处理（`scripts/win/*.bat`）。
- **`sidecars/` & `vendor/`**：原生后台守护进程与独立按需通道模块。
- **`test/`**：
  - `test/helpers/`：公共测试夹具（如 `test/helpers/mini-dom.mjs`，请直接复用而非复制粘贴 DOM mock）。
  - `test/gates/`：仓库结构、链接有效性、命名与卫生门禁（`npm run test:gates`）。
  - **测试命名约定**：新增回归测试请**优先追加到对应模块域的测试文件**，或按模块域命名（如 `settings-panel.test.mjs`）；**禁止新增 `v10x-*.test.mjs` 或 `issueXX-*.test.mjs` 按版本号命名的碎片测试文件**（CI 门禁会自动校验）。

## 本地开发与验证命令

```bash
# 1. 秒级运行仓库结构、链接与卫生门禁
npm run test:gates

# 2. 快速开发测试循环（跳过重型安装包打包/长时沙盒用例）
npm run test:fast

# 3. 运行完整零依赖测试套件（提交 PR 前必跑）
npm test

# 4. 启动本地 4 主题光学调试工作台 (127.0.0.1:4321)
npm run workbench

# 5. 安装并热部署至本机 Antigravity 插件目录
npm run install:plugin
```

## Pull Request 自检清单

1. 保持运行时 **0 外部依赖**（纯 Node >= 22 内置能力 + 浏览器原生 Web API）。
2. 所有修改文件保持 **UTF-8 无 BOM + LF 换行**；`style.css` 保持 **纯 ASCII、0 `:has()`、括号配平**，且 Channel 1 全 9 语种编译体积 `< 549,500 B`。
3. 严禁提交明文 API Key、私有内网地址、个人本机路径或编译后的 `.exe` / `.dmg` 二进制。
4. 保留 `GPL-3.0` 协议与 `NOTICE` / `THIRD_PARTY_NOTICES.md` 完整致谢链，并确保 `npm test` 全量 `0 fail`。

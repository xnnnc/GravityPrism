<div align="center">

<img src="assets/logo.svg" width="96" height="96" alt="Obsidian Prism Logo" />

# Obsidian Prism

**A native optical UI suite for Google Antigravity**

Four dark & daylight themes · A living 512K context vial · Reasoning effort slider · Pixel companions · Custom Static / Video Wallpaper (Beta) · Chat Mode (Beta)

[**Türkçe**](./README.md) · [**English**](./README.en.md) · [**简体中文**](./README.zh-CN.md) · [**Changelog**](./CHANGELOG.md) · [**Upstream Releases**](https://github.com/RMvdesi/obsidian-prism/releases)

<p>
  <a href="https://github.com/RMvdesi/obsidian-prism/releases"><img src="https://img.shields.io/github/v/release/RMvdesi/obsidian-prism?style=flat-square&color=3186ff&label=Release" alt="Latest Release" /></a>
  <img src="https://img.shields.io/badge/Version-1.2.0-0f172a?style=flat-square" alt="Version 1.2.0" />
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20Universal-1e293b?style=flat-square" alt="Platform" />
  <a href="https://github.com/RMvdesi/obsidian-prism/actions"><img src="https://img.shields.io/github/actions/workflow/status/RMvdesi/obsidian-prism/ci.yml?branch=main&style=flat-square&label=CI" alt="CI Status" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-GPL--3.0-2563eb?style=flat-square" alt="License: GPL-3.0" /></a>
  <a href="./NOTICE"><img src="https://img.shields.io/badge/Attribution-Required%20(NOTICE)-8b5cf6?style=flat-square" alt="Attribution Required" /></a>
</p>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/screenshots/hero-dark.webp" />
  <source media="(prefers-color-scheme: light)" srcset="assets/screenshots/hero-light.webp" />
  <img src="assets/screenshots/hero-dark.webp" width="100%" alt="Obsidian Prism v1.0.8-beta.3 showcase" />
</picture>

<sub>Footage is rendered frame by frame by an offline stage that runs this repository's front-end source directly. All workspaces and conversations shown are fictional.</sub>

</div>

> **Non-Affiliation & Trademark Disclaimer**
>
> **Obsidian Prism is an independent open-source project and is not affiliated with or endorsed by Google LLC.**
> References to “Antigravity” and “Google” are strictly for compatibility and descriptive purposes.

---

## Highlights

- **Four themes, one click**: Obsidian Dark and Warm Charcoal, plus Daylight Crystal and Warm Alabaster — with automatic light/dark following.
- **Context you can see**: A tiny vial next to the composer shows live 512K context usage; click it for a usage breakdown and quota forecasts.
- **Reasoning effort at your fingertips**: A starfield slider lives in the model menu; pick Orchestrator and it turns into a light-refracting cut-crystal bar.
- **Thinking & titles you can read**: Translate the model's thinking in real time (Immersive or Stacked Bilingual) with 1-Click Diagnose, manual HTTP/SOCKS5 proxy, and optional tool-summary & session-title translation.
- **Custom Static / Live Video Wallpaper (Beta)**: Located under Settings → **Beta**, off by default with zero overhead; loads local images and MP4/WebM videos read-only (experimental feature that may evolve across versions).
- **Pixel companions**: Clawd, a little purple cat and three mini crabs stack into a tower above the composer — with a hidden rainbow easter egg.
- **A friendlier workbench**: Built-in side-pane browser and large-file viewer, right-click actions, long code-block folding and conversation outline jumps.
- **Chat Mode (Beta)**: A dedicated space for everyday chats and notes, kept separate from your coding workspace and its settings.
- **Light, fast and well-behaved**: Animations idle down to 0fps, local services listen on loopback only, settings apply in under 10 ms, and everything uninstalls cleanly.

---

## Visual Overview

### 1. Four Themes

<p align="center">
  <img src="assets/screenshots/palettes.webp" width="100%" alt="Four dark and daylight themes" />
</p>

| Theme Preset | Config Key | Sidebar | Canvas | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Obsidian Dark** | `palette: "obsidian"` | `#09090B` | `#0E0E11` | Cool dark slate palette tuned for high-contrast code reading |
| **Warm Charcoal** | `palette: "warm"` | `#10100F` | `#141413` | Warm charcoal dark palette with reduced blue-light glare |
| **Daylight Crystal** | `lightPreset: "crystal"` | `#E8EEF6` | `#F4F7FB` | Cool slate-blue sidebar paired with a bright workspace canvas |
| **Warm Alabaster** | `lightPreset: "alabaster"` | `#EBE6DC` | `#F6F4EE` | Warm paper-tinted daylight palette with softer contrast |

### 2. Optical Details: Context Vial · Effort Slider · Cut Crystal

Click the vial to open the usage popover with context slices, 5-hour quota and model-pool headroom. The effort slider lights up its starfield as you climb tiers, and Orchestrator appears as a cut-crystal bar.

<p align="center">
  <img src="assets/screenshots/optics.webp" width="100%" alt="512K context vial, reasoning effort slider and Orchestrator cut crystal" />
</p>

### 3. Pixel Companions

Drag the companions above the composer and stack them five high; under the right conditions the purple cat dons a rainbow aurora cape. They doze off when idle and can be turned off in settings.

<p align="center">
  <img src="assets/screenshots/companions.webp" width="100%" alt="Pixel companions tower and rainbow easter egg" />
</p>

### 4. Chat Mode (Beta)

Off by default — enable it under **Settings → Appearance → Beta**. A switcher at the top of the sidebar flips between Code and Chat, with folders for everyday conversations and project-scoped permissions that never touch global Code settings.

<p align="center">
  <img src="assets/screenshots/chat-mode.webp" width="100%" alt="Chat Mode (Beta)" />
</p>

### 5. More Capabilities

- **Appearance Control Center**: Lives in **Settings → Appearance** — redesigned two-column modal, **8 UI languages** (zh-CN/zh-TW/en/ja/ko/es/fr/de), **36** end-to-end validated settings (including `sidebarNavFold`, `scrollBottomMotion`, and Stable / Beta update channels), three scene presets (Full Visuals / Deep Focus / Silent Eco), backup/restore and one-click updates.
- **Thought & Title Translator**: On-demand module that injects `0 B` by default when disabled with hot-plug support; zero-config machine translation or streaming local/compatible endpoints, OS proxy auto-detection + manual HTTP/SOCKS5 proxy, optional tool-summary & conversation-title translation, 1-Click Diagnose bar, and clickable source paths/line numbers.
- **Custom Static / Live Video Wallpaper (Beta)**: Experimental on-demand module, off by default (zero overhead); 100% local read-only streaming for images (JPG/PNG/WebP/GIF/AVIF) and videos (MP4/WebM) with opacity/blur/dim controls, Browser Hole avoidance, and automatic `0fps` pause on blur/hide.
- **Omni Browser, File Viewer & Inline Diff Preview**: Open bare links and local paths in the side pane, preview inline file diffs directly in conversation turns, stream huge videos/audio/PDFs/tables/fonts, and right-click to copy paths, reveal files or insert references.
- **Smoked Obsidian Surfaces & Workbench Enhancements**: Unified faceted message bubbles, file-change strips, Artifact cards and graphite keycaps; sticky code-block headers, manual folding for long code blocks, dedicated outline trigger and hover outlines on the conversation rail, `Alt+↑` / `Alt+↓` turn navigation, and conversation right-click `/btw` + native `/compact`, `/plan`, `/learn`, `/grill-me` slash commands.

<details>
<summary><strong>Technical details: performance, security, telemetry & configuration (click to expand)</strong></summary>

**Obsidian Prism (`v1.0.8-beta.3`)** provides Smoked Obsidian dark/daylight themes, host workbench & inline diff enhancements, a built-in side-pane browser and streaming multi-format file viewer, live quota telemetry, chain-of-thought translation, and experimental static/video wallpapers (Beta) for the Antigravity desktop client through a modular on-demand local plugin architecture — without altering host business logic or conflicting with external plugins:

- **Four Dark/Daylight Themes & Fine-Grained Controls**: Includes two dark palettes (**Obsidian Dark** & **Warm Charcoal**) and two daylight presets (**Daylight Crystal** & **Warm Alabaster**) with automatic host light/dark tracking, unified Smoked Obsidian faceted surfaces (message bubbles, file-change strips, Artifact cards, graphite keycaps, and single-frame inline file chips), plus 5 accent tones (Follow Model, Cobalt, Iris, Amber, and Graphite Monochrome `mono`), 3 corner radius scales, 4 code monospace font stacks with ligature toggle, and ambient glow intensity controls.
- **300Hz Split-Rate Pipeline, 5-Step Ink Streaming & `0fps` Semantic Afterglow**: Removes persistent multi-layer `backdrop-filter` blur passes and reclaims Canvas VRAM (`0x0`) during sleep; renders streaming responses with a `CSS.highlights`-based **5-step ink fade-in** (zero wrapper nodes, zero forced layout reflow, maintaining smooth high-refresh frame pacing even in `34k+`-node long sessions); caps steady-state background aurora rendering to `~30fps` on 300Hz displays and enters `0fps` idle sleep `1.2s` after activity ends. Provides non-intrusive three-state semantic edge cues (awaiting user decision, error halted, and background long-task completion) that freeze into `0fps` static snapshots.
- **Host Workbench & Extension Panel Integration**: Synchronizes 24 theme color variables in real time to `plugin://*` extension `iframe` panels (Swarm, Pulse, etc.) via the host `preload` `postMessage` protocol to prevent white flashes; adds sticky headers to Markdown and Artifact code blocks with manual fold/unfold controls for completed blocks (`>= 48` lines, never auto-truncated, with scroll-anchor compensation); enhances the left conversation rail with chapter tick styles, on-hover prompt outline filtering, historical step folding, and `Alt+↑` / `Alt+↓` turn navigation; unifies terminal and background task surfaces with four-theme Console Well styling.
- **Omni Native Browser Integration, Context Menu & Streaming File Viewer**: Configurable via `omniModule` (`"on" | "off"`) and `linkTarget` (`"builtin" | "external"`). Follows a **stock-first deference** rule: yields 100% of native `<a href="http...">` clicks, in-page search, external confirmation modals, and `<= 200MB` native media/CSV/PDF/HTML previews to Antigravity's built-in handlers. Uses `CSS.highlights` (Custom Highlight API) for zero-DOM-mutation activation of bare URLs, `localhost` ports, and local file paths (routing bare links to native right-pane Browser Tabs), and upgrades the side pane in-place only when the host shows size-limit (`> 20MB` / `> 200MB`) or unsupported-file notices (auto-unmounting when switching back). Preserves **zero hover-popup clutter** during reading — actions appear strictly on right-click (`contextmenu`) over bare links, file pills, Artifact cards, or Mermaid diagrams (copy absolute/relative paths, reveal in folder, insert as `@mention` into composer, open in side-pane/external browser, or zoom diagrams). Backed by a loopback-only (`127.0.0.1`) HTTP `206 Range` streaming gateway supporting frame-stepped large video inspection, millisecond audio waveform markers, checkerboard SVG/transparent-image zoom & PNG export, responsive local HTML sandboxes, PDF viewing, frozen-header `CSV/TSV/JSONL` search/sorting, and `TTF/OTF/WOFF2` font specimen waterfalls.
- **Defense-in-Depth Security & Local Isolation**: Enforces top-level main-frame verification on all privileged `__agPrism*` CDP bindings (rejecting sub-`<iframe>` RPC calls); hardens the loopback streaming gateway and background daemon with fail-closed `Host` and cross-site request checks, UNC/NT device-path blocking, `realpath` blocking of sensitive credential files and Google/Antigravity core credential directories, and in-memory pre-write SHA-256 verification on updates; enforces Git repo boundaries, fail-closed `.git` gitfile/UNC checks, `--literal-pathspecs`, `--no-optional-locks`, and safe `[filter]` downgrade on Inline Diff RPC; isolates local HTML previews with per-directory `HMAC-SHA256` read-only sub-tokens and restricted `sandbox` attributes (without `allow-same-origin`), while preventing cross-origin `apiKey` reuse, disabling upstream redirects, and blocking cloud-metadata/unsafe ports in thought translation requests.
- **Dual-Window Quota Telemetry & 512K Context Vial**: Aligns `vendor/pulse-dashboard/` with upstream [`ATtacK030130/antigrative-dashboard`](https://github.com/ATtacK030130/antigrative-dashboard) `v0.9.1` (MIT), supporting **5-hour and weekly quota pool tracking with linear depletion forecasts**, **main session vs. Swarm/subagent token attribution**, **cache hit rate** metrics, and CDP process-lineage multi-instance discovery. Exposes Overview, Trends, and Quotas views with workspace filtering on the Studio home dashboard, stores telemetry in an isolated local data directory, and yields automatically when standalone external plugins are active.
- **Dual-Mode Thought Translator**: Isolated into an on-demand module (`0 B` injected when off) supporting zero-config **Machine Translation** and **OpenAI-Compatible Streaming Translation**, with zero-dependency async Windows/macOS OS system proxy auto-detection and keyless local endpoints (`localhost` / LAN Ollama, LM Studio, vLLM without requiring an API key); safely restores `file://` source paths and `#L` line-number jump pills under a strict `file://`-only protocol allowlist; adds a concurrency-limited (`max = 3`) viewport-priority queue, per-block retry/re-translate controls, **Immersive vs. Stacked Bilingual** view modes, and cache management. API keys and custom prompts are stored locally in `~/.gemini/config/` (`0600` permissions).
- **Chat Mode (Beta · Off by Default)**: Off by default and toggleable anytime in **Settings → Appearance → Beta** (`sidebarStudio: "on" | "off"`). When enabled, adds a top-sidebar switcher between the Code workspace and a dedicated Chat space for everyday conversations and document organization, complete with folder/project grouping, clean multi-turn reading views, Artifacts preview, and project-scoped permission isolation that preserves global Code settings.
- **Modular On-Demand Microkernel, Zero-`eval` LZSS & Sub-10ms Config Sync**: Splits the runtime into a lean `ui-runtime.js` microkernel and 6 focused controller modules compiled with zero-`eval` synchronous UTF-16 LZSS compression (Omni viewer, Chat sidebar, Host i18n, Thought Translator, Inline Diff, and Wallpaper Beta load on-demand as separate modules) and a unified disk cache (`.bundle-cache.json`) achieving `~26 ms` cold-start builds. Covers **36** validated configuration keys (including Stable / Beta update channels) with `< 10 ms` single-flight incremental `refreshConfig` broadcast, three scene presets, categorized sub-tabs, and API-key-sanitized JSON export/import.

</details>

---

## Quick Start

Obsidian Prism provides **standalone GUI installers** (no Node.js required) and **source-based native plugin deployment**, natively compatible with **`Antigravity v2.33.0+`** (automatically maintaining `--remote-debugging-port=0` on launch shortcuts and offering one-click relaunch recovery after in-app updates), persisting cleanly across reloads and restarts:

### Option A: Standalone GUI Installer (Recommended · Zero External Dependencies, No Node.js Required)
Download the latest installer directly below (or browse all versions & Beta pre-releases on [**GitHub Releases**](https://github.com/RMvdesi/obsidian-prism/releases)):
1. **Windows (`x64`)**: Download [**`obsidian-prism-installer.exe`**](https://github.com/RMvdesi/obsidian-prism/releases/latest/download/obsidian-prism-installer.exe) and run it. With zero external runtime dependencies (no system Node.js installation needed), it deploys the complete local plugin to `~/.gemini/config/plugins/obsidian-prism`, reuses the bundled Antigravity runtime headlessly to activate the background daemon immediately, and registers background startup protection (re-run the same `.exe` anytime for a one-click clean uninstall).
2. **macOS (`Apple Silicon & Intel Universal`)**: Download [**`Obsidian-Prism-macOS-universal.dmg`**](https://github.com/RMvdesi/obsidian-prism/releases/latest/download/Obsidian-Prism-macOS-universal.dmg), mount the disk image, drag `Obsidian Prism.app` into `/Applications`, and **double-click `Obsidian Prism.app` once** to complete local plugin deployment and `LaunchAgent` setup (the same app also provides one-click clean uninstall).

> **First-Launch OS Security Prompt (Open-Source Build Note)**
> - **Windows SmartScreen**: Because the installer is built independently without a commercial EV code-signing certificate, if Windows shows *"Windows protected your PC"*, click **More info → Run anyway**.
> - **macOS 15+ Gatekeeper**: Because the Universal `.app` uses open-source ad-hoc signing (not notarized under a paid Apple Developer ID), if macOS blocks first launch due to browser quarantine, open **System Settings → Privacy & Security**, scroll down and click **Open Anyway**, or strip the quarantine attribute once in Terminal before launching:
>   ```bash
>   xattr -cr "/Applications/Obsidian Prism.app"
>   ```

### Option B: Native Plugin Deployment from Source (Recommended for Developers)
```bash
git clone https://github.com/RMvdesi/obsidian-prism.git
cd obsidian-prism

# Deploy to ~/.gemini/config/plugins/obsidian-prism and attach to running windows
npm run install:plugin
```
Then open **Settings → Appearance** in Antigravity to expand the **Obsidian Prism** control panel.

### Standard AI-Assisted Install Workflow & Thought Translator Checklist
If you ask an AI coding assistant (Claude Code, Cursor, Antigravity Agent, etc.) to install Obsidian Prism from source, **always run these two commands in order**:
```bash
git clone https://github.com/RMvdesi/obsidian-prism.git
cd obsidian-prism

# 1. Full local plugin deployment (syncs all modules and starts the persistent background daemon)
npm run install:plugin

# 2. Verify installation health, background daemon, and on-demand modules
node tools/install-plugin.cjs --status
```
- **Do NOT use `npm run inject` as an installer**: `npm run inject` only performs a one-shot temporary front-end injection. It does **not** install into `~/.gemini/config/plugins/obsidian-prism` and does **not** start the persistent background daemon — leaving Thought Translator, local telemetry, and wallpaper services offline and causing styles to disappear on reload, restart, or client update.
- **Verify `--status` output**: confirm `installed: true`, `daemonAlive: true`, `hasThoughtTranslator: true`, and `hasWallpaperChannel: true`. If `bareAntigravityRunning: true` (typical right after an in-app update relaunches without flags), close Antigravity and reopen it once via your configured Desktop or Start Menu shortcut (which automatically carries `--remote-debugging-port=0`).
- **Thought Translator Troubleshooting Checklist**:
  1. **OFF by default**: Thought Translator ships disabled (`thoughtTranslate: "off"`, `0 B` injected). Open **Settings → Appearance → Obsidian Prism** and explicitly select **Machine Translation (zero-config)** or **AI Streaming** (and optionally toggle automatic session-title translation).
  2. **No translation after enabling**: click the **1-Click Diagnose** button at the top of the Thought Translator settings card to inspect daemon bridge health, active mode/model configuration, OS proxy detection, and upstream connectivity — or re-run `node tools/install-plugin.cjs --status` to confirm `daemonAlive: true`.
  3. **UI reverted right after an Antigravity update**: accept the daemon/watcher's single non-repeating relaunch prompt, or simply restart Antigravity once via its configured shortcut.

### FAQ & `Antigravity v2.33.0+` Compatibility
- **Why did the UI temporarily revert to stock right after an in-app update to `Antigravity v2.33.0+`?**
  Starting in `Antigravity v2.33.0`, the host switched its local DevTools bridge to explicit opt-in (`--remote-debugging-port=0`, binding an ephemeral `127.0.0.1` port with a local token file), and Electron's built-in `quitAndInstall` updater relaunches the app once without command-line arguments. Obsidian Prism handles this automatically in two layers:
  1. **Zero-Friction Daily Launch**: Both the installer and background daemon automatically maintain `--remote-debugging-port=0` on user Desktop, Start Menu, and Taskbar `Antigravity` shortcuts (silently restoring the flag if an app update overwrites shortcuts, and cleanly stripping it upon uninstall).
  2. **One-Click Relaunch Recovery**: Whenever the daemon detects a running Antigravity instance launched without a local bridge port, it shows a **single non-repeating confirmation prompt** (at most once per host process lifetime) to gracefully close the current instance and relaunch with `--remote-debugging-port=0`; on macOS you can also launch via `open -a "/Applications/Antigravity.app" --args --remote-debugging-port=0`.

<details>
<summary><strong>CLI Utilities & Repository Structure (Click to expand)</strong></summary>

#### Common CLI Commands
```bash
npm run inject                 # One-shot live injection into running Antigravity windows
npm run remove                 # Cleanly remove all styles/widgets and restore stock UI
npm run clean:legacy           # Strip legacy blocks from historical app.asar archives
npm run archive:conversations  # Inspect conversation DB bloat & safely archive old subagent sessions offline (reversible)
npm test                       # Run cross-module security, bundle & regression tests
npm run build:installer        # Build standalone Windows installer (.exe)
npm run build:macos            # Build standalone macOS Universal bundle (.dmg)
```

#### Core Repository Layout
```text
obsidian-prism/
├── plugin.json                         # Antigravity native plugin manifest (obsidian-prism@1.0.8-beta.3)
├── LICENSE / NOTICE / CITATION.cff     # GPL-3.0 license, attribution terms & citation metadata
├── THIRD_PARTY_NOTICES.md              # Preserved copyright & license notices for MIT upstreams
├── assets/                             # Vector plugin icon & documentation screenshots
├── cdp.js / inject.js / remove.js      # Zero-eval LZSS compiler, on-demand disk cache & attach/removal
├── style.css                           # Four themes, Smoked Obsidian surfaces & workbench styles
├── i18n-locales.js / i18n-core.js      # 8-language localization tables (zh-CN/zh-TW/en/ja/ko/es/fr/de)
├── motion-engine.js / animated-icons.js# 4-tier damped spring physics & animated UI icons
├── ripple-core.js / conv-aura.js       # 300Hz split-rate WebGL2 horizon shader & 0fps semantic cues
├── smooth-caret.js / dual-mascot-rig.js# Read/write-separated caret tracking & pixel mascot rig
├── usage-core.js / vial-core.js        # Quota forecast functions & 512K shallow-water vial renderer
├── pulse-vial-bridge.js                # Context slice breakdown & 5h/weekly quota popover bridge
├── settings-panel.js                   # Settings UI (36 keys, scene presets, sanitized JSON backup)
├── home-studio-panel.js                # Controller 1: Studio home dashboard (Overview/Trends/Quotas)
├── home-ripple-host.js                 # Controller 2: Home glyph ripple matrix host controller
├── model-glyph-crystal.js              # Controller 3: Model glyph & WebGL2 prism bar controller
├── stream-choreography.js              # Controller 4: CSS.highlights 5-step ink fade & table row throttle
├── prism-rim-canvas.js                 # Controller 5: Cursor-reactive border highlight controller
├── host-workbench-enhancer.js          # Controller 6: Extension panel theme bridge, code fold & rail outline
├── ui-runtime.js                       # Frontend microkernel: fast config sync & lifecycle orchestration
├── sidecars/daemon/                    # Persistent local daemon (settings/metrics/usage/repo/archiver/thought/omni/inline-diff/wallpaper-beta)
├── vendor/                             # Telemetry (v0.9.1), effort-slider, thought-translator, inline-diff, wallpaper-beta, omni-viewer, sidebar-studio & host-i18n
└── installer/ & tools/                 # Windows (C#) / macOS (Swift) native-plugin installers & scripts
```
</details>

---

## License, Derivative Rules & Citation

### 1. Open-Source License & Mandatory Attribution (`GPL-3.0-only` + `NOTICE`)
**Obsidian Prism** (`Copyright (C) 2026 RMvdesi`) is licensed under the **[GNU General Public License v3.0 (`GPL-3.0-only`)](./LICENSE)** with mandatory Section 7 attribution terms in **[`NOTICE`](./NOTICE)**.

Any fork, modification, port, or redistribution must comply with all three requirements:
1. **Same-License Copyleft**: Any derivative plugin, theme bundle, or installer incorporating code from Obsidian Prism must be distributed under **`GPL-3.0`** with complete corresponding source code disclosed. Proprietary bundling, obfuscation lock-in, or closed-source commercial resale is prohibited.
2. **Preserve Attribution Chain**: Retain [`LICENSE`](./LICENSE), [`NOTICE`](./NOTICE), and [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md) intact, and keep visible credit linking back to `@RMvdesi` and `RMvdesi/obsidian-prism` in your README and settings UI.
3. **Mark Modifications & Non-Endorsement**: Document modification dates and summaries in altered files, and do not distribute modified forks under the unmodified `Obsidian Prism` name as official releases without written permission.

#### Downstream Attribution Snippet
```markdown
> Built upon [Obsidian Prism](https://github.com/RMvdesi/obsidian-prism) by [@RMvdesi](https://github.com/RMvdesi), licensed under [GPL-3.0](https://www.gnu.org/licenses/gpl-3.0.html). Upstream component notices are preserved in `NOTICE` and `THIRD_PARTY_NOTICES.md`.
```

#### Citation (`CITATION.cff` / BibTeX)
```bibtex
@software{rmvdesi_obsidian_prism_2026,
  author       = {RMvdesi},
  title        = {{Obsidian Prism: Modular Optical UI, Workbench Enhancements, Omni File Viewer, Quota Telemetry & Thought Translator for Antigravity}},
  year         = {2026},
  version      = {1.0.8-beta.3},
  license      = {GPL-3.0-only},
  url          = {https://github.com/RMvdesi/obsidian-prism}
}
```

---

### 2. Upstream Open-Source Credits

Absorbed and adapted third-party components were originally released under the **MIT License** (compatible with `GPL-3.0-only`), with full copyright and permission notices preserved in [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md):

1. **[0DNANCY/agy-claude-style](https://github.com/0DNANCY/agy-claude-style)** — `MIT License`, `Copyright (c) 2026 0DNANCY` (Base palette tokens, spring physics foundation, WebGL2 horizon/glyph wavefield, pixel mascot foundation, and initial bundler).
2. **[ATtacK030130/antigrative-dashboard](https://github.com/ATtacK030130/antigrative-dashboard)** (`v0.9.1`) — `MIT License`, `Copyright (c) 2026 AG Pulse contributors` (Absorbed and adapted in `vendor/pulse-dashboard/` for live token throughput, cache hit rate, 5h/weekly quota forecasting, main/subagent token attribution, and CDP process-lineage discovery).
3. **[LLYSH-HANNARI/antigravity-Codex-Claude-effort-slider](https://github.com/LLYSH-HANNARI/antigravity-Codex-Claude-effort-slider)** — `MIT License`, `Copyright (c) 2026 LLYSH-HANNARI` (Absorbed and adapted in `vendor/effort-slider/` for model-menu reasoning effort slider and smart coexistence yielding).
4. **[yiheng8023/antigravity-chinese](https://github.com/yiheng8023/antigravity-chinese)** (`v3.3.63`) — `MIT License`, `Copyright (c) 2026 Antigravity Chinese Localization Contributors` (Upstream `zh-CN` dictionary source & UI localization pattern reference; re-architected in `vendor/host-i18n/` as an on-demand runtime localization module without modifying host packages, featuring universal 4-layer auto-yield, ping-pong circuit breaker, and `WeakMap` lossless `destroy()`).
5. **[Nwflower/dsh-claude-style](https://github.com/Nwflower/dsh-claude-style)** — Minimalist Studio layout, composer framing, and warm alabaster daylight palette reference.
6. **[Microqian2th/dsh-codex-effort-slider](https://github.com/Microqian2th/dsh-codex-effort-slider)** — Detent track snapping, hysteresis thresholds, and damped motion curve reference.
7. **[mobius/dsh-performance-slider](https://github.com/mobius/dsh-performance-slider)** — Performance tier slider interaction and live visual feedback reference.
8. **[claudenoshujin/claude-web](https://github.com/claudenoshujin/claude-web)** (by `lulu`) — Mascot stacking interaction reference (clean-room independent physics implementation).
9. **[wp3171216237/dsh-TUI](https://github.com/wp3171216237/dsh-TUI)** — `MIT License`, `Copyright (c) 2026 chimney (@wp3171216237)` (Visual silhouette, cobalt-blue + white-belly palette, and water-spout animation concept reference for the **Deepy** DeepSeek pixel whale mascot, cleanly adapted in `dual-mascot-rig.js`).

---

### 3. Community Contributors

Heartfelt thanks to every community contributor whose Pull Requests, security hardening, performance profiling, and bug reports help shape Obsidian Prism!

- **Full Hall of Contributors & Detailed Credits**: See [**`docs/CONTRIBUTORS.md`**](./docs/CONTRIBUTORS.md) (permanently crediting all PR authors and key issue reporters, alongside release notes in [`CHANGELOG.md`](./CHANGELOG.md)).
- Contributions via [Issues](https://github.com/RMvdesi/obsidian-prism/issues) and [Pull Requests](https://github.com/RMvdesi/obsidian-prism/pulls) are always welcome!

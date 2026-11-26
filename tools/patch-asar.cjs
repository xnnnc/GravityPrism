"use strict";

/**
 * Antigravity Prism app.asar 无损清理、持久集成与热重载偏移守护工具 (tools/patch-asar.cjs)
 *
 * 核心能力：
 * 1. --clean-legacy：干净剥离历史旧版 /* __AG_CLAUDE_STYLE_START__ * / 代码块并清理残留 .agcs-staged*，
 *    100% 保留 宿主界面本地化补丁与 __AG_CODEX_EFFORT_SLIDER_START__ 滑块，
 *    同步重算 .antigravity_chinese_meta.json SHA-1 指纹。
 * 2. 运行期 ASAR 内存偏移绝对保护：检测到宿主客户端运行中时，严禁原地覆盖 app.asar（避免 Ctrl+Shift+R 偏移错位），
 *    改为写入 staged 归档并通过纯 Node detached + windowsHide 派生独立后台守护进程，
 *    待宿主退出后原子落盘替换 app.asar 并同步汉化指纹！
 * 3. --install / --restore / --status：支持新版 /* __AG_PRISM_START__ * / 独立标记写入与无损还原。
 */

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn, execFileSync } = require("node:child_process");

const ROOT_DIR = path.resolve(__dirname, "..");

let _cdp = null;
function getCdp() {
  if (!_cdp) {
    _cdp = require(path.join(ROOT_DIR, "cdp.js"));
  }
  return _cdp;
}

const PATCH_START_MARKER = "/* __AG_PRISM_START__ */";
const PATCH_END_MARKER = "/* __AG_PRISM_END__ */";
const LEGACY_PATCH_START_MARKER = "/* __AG_CLAUDE_STYLE_START__ */";
const LEGACY_PATCH_END_MARKER = "/* __AG_CLAUDE_STYLE_END__ */";
const CODEX_SLIDER_MARKER = "/* __AG_CODEX_EFFORT_SLIDER_START__ */";
const CHINESE_INJECTION_MARKER = "Antigravity Chinese Localization Injection";

const LEGACY_ONLY_CLEANUP_EXPRESSION = `(() => {
  try {
    document.getElementById('ag-claude-style-css')?.remove();
    if (window.__agClaudeStyle && !window.__agPrism) {
      if (typeof window.__agClaudeStyle.destroy === 'function') window.__agClaudeStyle.destroy();
      delete window.__agClaudeStyle;
    }
  } catch {}
  return { cleanedLegacy: true };
})()`;

function findDefaultAsarPath() {
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  const candidates = [
    path.join(localAppData, "Programs", "antigravity", "resources", "app.asar"),
    path.join(localAppData, "antigravity", "resources", "app.asar"),
    "/Applications/Antigravity.app/Contents/Resources/app.asar",
    "/usr/share/antigravity/resources/app.asar",
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

function normalizeComparePath(p) {
  const resolved = path.resolve(String(p || ""));
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isSubPathOf(targetPath, parentDir) {
  if (!targetPath || !parentDir) return false;
  const normTarget = normalizeComparePath(targetPath);
  const normParent = normalizeComparePath(parentDir);
  if (normTarget === normParent) return true;
  const rel = path.relative(normParent, normTarget);
  return Boolean(rel) && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function isDefaultSystemAsar(asarPath) {
  return normalizeComparePath(asarPath) === normalizeComparePath(findDefaultAsarPath());
}

function getPortFilePath() {
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "Antigravity", "DevToolsActivePort");
  }
  if (process.platform === "win32") {
    const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, "Antigravity", "DevToolsActivePort");
  }
  const xdg = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(xdg, "Antigravity", "DevToolsActivePort");
}

function readActiveCdpPortSync() {
  if (process.env.AG_CDP_PORT) {
    const envPort = parseInt(process.env.AG_CDP_PORT, 10);
    if (Number.isInteger(envPort) && envPort > 0) return envPort;
  }
  try {
    const text = fs.readFileSync(getPortFilePath(), "utf8");
    const port = parseInt(text.split(/\r?\n/)[0].trim(), 10);
    return Number.isInteger(port) && port > 0 ? port : null;
  } catch {
    return null;
  }
}

function isPidAlive(pid) {
  const num = Number(pid);
  if (!Number.isInteger(num) || num <= 0) return false;
  try {
    process.kill(num, 0);
    return true;
  } catch (err) {
    return Boolean(err && err.code === "EPERM");
  }
}

function probeCdpEndpointSync(port, timeoutMs = 450) {
  const p = Number(port);
  if (!Number.isInteger(p) || p <= 0 || p > 65535) return false;
  const waitMs = Math.max(120, Number(timeoutMs) || 450);
  const probeScript = [
    "const net = require('node:net');",
    `const sock = net.connect({ host: '127.0.0.1', port: ${p} });`,
    "let settled = false;",
    "const done = (code) => { if (!settled) { settled = true; try { sock.destroy(); } catch {} process.exit(code); } };",
    "sock.on('connect', () => done(0));",
    "sock.on('error', () => done(1));",
    `setTimeout(() => done(1), ${waitMs});`,
  ].join(" ");
  try {
    execFileSync(process.execPath, ["-e", probeScript], {
      stdio: "ignore",
      windowsHide: true,
      timeout: waitMs + 400,
    });
    return true;
  } catch {
    return false;
  }
}

function isAntigravityProcessRunningForAsar(resolvedAsar) {
  const appRoot = path.dirname(path.dirname(resolvedAsar));
  if (process.platform === "win32") {
    const exePath = path.join(appRoot, "Antigravity.exe");
    const defaultAsar = isDefaultSystemAsar(resolvedAsar);
    if (!defaultAsar && !fs.existsSync(exePath)) {
      return false;
    }
    try {
      const out = execFileSync(
        "tasklist",
        ["/FI", "IMAGENAME eq Antigravity.exe", "/FO", "CSV", "/NH"],
        { encoding: "utf8", windowsHide: true, timeout: 2500, stdio: ["ignore", "pipe", "ignore"] }
      );
      if (!String(out || "").toLowerCase().includes('"antigravity.exe"')) {
        return false;
      }
      // 检测到 Antigravity.exe 正在运行且目标可执行文件存在（或默认系统 ASAR）时 fail-closed 返回 true，
      // 统一走安全延迟替换通道，零 PowerShell / 零 WMI 进程路径查询
      return true;
    } catch {
      return false;
    }
  }

  if (process.platform === "darwin") {
    const macOsDir = path.resolve(path.dirname(resolvedAsar), "..", "MacOS");
    if (!isDefaultSystemAsar(resolvedAsar) && !fs.existsSync(macOsDir)) {
      return false;
    }
    try {
      const out = execFileSync("pgrep", ["-f", macOsDir], {
        encoding: "utf8",
        timeout: 2000,
        stdio: ["ignore", "pipe", "ignore"],
      });
      return Boolean(String(out || "").trim());
    } catch {
      return false;
    }
  }

  const linuxExe = path.join(appRoot, "antigravity");
  if (!isDefaultSystemAsar(resolvedAsar) && !fs.existsSync(linuxExe)) {
    return false;
  }
  try {
    const out = execFileSync("pgrep", ["-f", linuxExe], {
      encoding: "utf8",
      timeout: 2000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return Boolean(String(out || "").trim());
  } catch {
    return false;
  }
}

function isHostClientRunning(asarPath, opts = {}) {
  if (opts.assumeStopped) return false;
  if (opts.assumeRunning) return true;

  const resolved = path.resolve(asarPath || findDefaultAsarPath());
  if (typeof opts.isHostRunning === "function") {
    return Boolean(opts.isHostRunning(resolved));
  }
  if (opts.hostPid !== undefined && opts.hostPid !== null) {
    return isPidAlive(opts.hostPid);
  }
  if (opts.cdpPort !== undefined && opts.cdpPort !== null) {
    return probeCdpEndpointSync(opts.cdpPort, opts.cdpTimeoutMs || 600);
  }

  if (isSubPathOf(resolved, os.tmpdir()) && !isDefaultSystemAsar(resolved)) {
    return false;
  }

  if (isAntigravityProcessRunningForAsar(resolved)) {
    return true;
  }

  if (!opts.skipCdpProbe && isDefaultSystemAsar(resolved)) {
    const port = readActiveCdpPortSync();
    if (port && probeCdpEndpointSync(port, opts.cdpTimeoutMs || 450)) {
      return true;
    }
  }

  return false;
}

function computeIntegrity(buffer, blockSize = 4194304) {
  const fullHash = crypto.createHash("sha256").update(buffer).digest("hex");
  const blocks = [];
  for (let offset = 0; offset < buffer.length; offset += blockSize) {
    const slice = buffer.subarray(offset, Math.min(offset + blockSize, buffer.length));
    blocks.push(crypto.createHash("sha256").update(slice).digest("hex"));
  }
  if (blocks.length === 0) {
    blocks.push(crypto.createHash("sha256").update(Buffer.alloc(0)).digest("hex"));
  }
  return {
    algorithm: "SHA256",
    hash: fullHash,
    blockSize,
    blocks,
  };
}

function parseAsarArchive(asarBuffer) {
  const headerSize = asarBuffer.readUInt32LE(4);
  const jsonLen = asarBuffer.readUInt32LE(12);
  const dataStart = 8 + headerSize;
  const headerJson = asarBuffer.subarray(16, 16 + jsonLen).toString("utf8");
  const header = JSON.parse(headerJson);
  const payload = asarBuffer.subarray(dataStart);
  return { header, payload };
}

function buildAsarArchive(header, payloadBuffers) {
  const headerJsonBuf = Buffer.from(JSON.stringify(header), "utf8");
  const jsonLen = headerJsonBuf.length;
  const alignedJsonLen = Math.ceil(jsonLen / 4) * 4;
  const headerSize = alignedJsonLen + 8;
  const pickleHeader = Buffer.alloc(16 + alignedJsonLen);
  pickleHeader.writeUInt32LE(4, 0);
  pickleHeader.writeUInt32LE(headerSize, 4);
  pickleHeader.writeUInt32LE(headerSize - 4, 8);
  pickleHeader.writeUInt32LE(jsonLen, 12);
  headerJsonBuf.copy(pickleHeader, 16);
  return Buffer.concat([pickleHeader, ...payloadBuffers]);
}

function repackAsarTree(node, origPayload, currentPath, replacements, outChunks, state) {
  if (!node || typeof node !== "object" || !node.files) return;
  for (const name of Object.keys(node.files)) {
    const relPath = currentPath ? `${currentPath}/${name}` : name;
    const child = node.files[name];
    if (child && child.files) {
      repackAsarTree(child, origPayload, relPath, replacements, outChunks, state);
    } else if (child && !child.unpacked && child.offset !== undefined && typeof child.size === "number") {
      let fileBuf;
      if (replacements.has(relPath)) {
        fileBuf = replacements.get(relPath);
      } else {
        const oldOffset = Number(child.offset);
        fileBuf = origPayload.subarray(oldOffset, oldOffset + child.size);
      }
      child.offset = String(state.offset);
      child.size = fileBuf.length;
      if (child.integrity) {
        child.integrity = computeIntegrity(fileBuf, child.integrity.blockSize || 4194304);
      }
      outChunks.push(fileBuf);
      state.offset += fileBuf.length;
    }
  }
}

function stripMarkerBlock(source, startMarker, endMarker) {
  let cleaned = String(source || "");
  while (true) {
    const startIdx = cleaned.indexOf(startMarker);
    const endIdx = cleaned.indexOf(endMarker, startIdx >= 0 ? startIdx : 0);
    if (startIdx < 0 || endIdx <= startIdx) break;
    const before = cleaned.slice(0, startIdx).replace(/[ \t]*\r?\n$/, "");
    const after = cleaned.slice(endIdx + endMarker.length).replace(/^\r?\n/, "");
    cleaned = after ? `${before}\n${after}` : `${before}\n`;
  }
  return cleaned;
}

function unpatchPreloadContent(source) {
  let cleaned = stripMarkerBlock(source, LEGACY_PATCH_START_MARKER, LEGACY_PATCH_END_MARKER);
  cleaned = stripMarkerBlock(cleaned, PATCH_START_MARKER, PATCH_END_MARKER);
  return cleaned;
}

function patchPreloadContent(originalPreload, injectExpr) {
  const cleanBase = unpatchPreloadContent(originalPreload).replace(/\s+$/, "");
  const codeLiteral = JSON.stringify(String(injectExpr || ""));
  const snippet = [
    "",
    PATCH_START_MARKER,
    "try {",
    "  const __agPrismCode = " + codeLiteral + ";",
    "  const __agPrismInjectMainWorld = () => {",
    "    try {",
    "      const wf =",
    "        (typeof electron_1 !== 'undefined' && electron_1 && electron_1.webFrame) ||",
    "        (typeof require === 'function' ? require('electron')?.webFrame : null);",
    "      if (wf && typeof wf.executeJavaScript === 'function') {",
    "        void wf.executeJavaScript(__agPrismCode);",
    "      }",
    "    } catch (err) {",
    "      console.error('[Antigravity Prism] webFrame executeJavaScript error:', err);",
    "    }",
    "  };",
    "  if (typeof window !== 'undefined' && typeof document !== 'undefined') {",
    "    if (document.readyState === 'loading') {",
    "      window.addEventListener('DOMContentLoaded', __agPrismInjectMainWorld, { once: true });",
    "    } else {",
    "      __agPrismInjectMainWorld();",
    "    }",
    "  }",
    "} catch (err) {",
    "  console.error('[Antigravity Prism] Preload bootstrap error:', err);",
    "}",
    PATCH_END_MARKER,
    "",
  ].join("\n");
  return cleanBase + "\n" + snippet;
}

function readPreloadFromAsar(asarPath) {
  const rawAsar = fs.readFileSync(asarPath);
  const { header, payload } = parseAsarArchive(rawAsar);
  const preloadEntry = header.files?.dist?.files?.["preload.js"];
  if (!preloadEntry || preloadEntry.offset === undefined) {
    throw new Error(`未在 ASAR 中找到 dist/preload.js: ${asarPath}`);
  }
  const off = Number(preloadEntry.offset);
  const text = payload.subarray(off, off + preloadEntry.size).toString("utf8");
  return { rawAsar, header, payload, preloadEntry, preloadText: text };
}

function rebuildAsarWithPreload(asarPath, nextPreloadText) {
  const { header, payload } = readPreloadFromAsar(asarPath);
  const nextBuf = Buffer.from(nextPreloadText, "utf8");
  const replacements = new Map([["dist/preload.js", nextBuf]]);
  const outChunks = [];
  const state = { offset: 0 };
  repackAsarTree(header, payload, "", replacements, outChunks, state);
  return buildAsarArchive(header, outChunks);
}

function syncChineseLocalizationMeta(asarPath, bufferOpt) {
  try {
    const metaPath = path.join(path.dirname(asarPath), ".antigravity_chinese_meta.json");
    if (!fs.existsSync(metaPath)) return null;
    const buf = bufferOpt || fs.readFileSync(asarPath);
    if (!buf.includes(Buffer.from(CHINESE_INJECTION_MARKER))) return null;
    const fp = crypto.createHash("sha1").update(buf).digest("hex").slice(0, 16);
    let prev = {};
    try {
      prev = JSON.parse(fs.readFileSync(metaPath, "utf8")) || {};
    } catch {}
    const nextMeta = {
      ...prev,
      patched: true,
      patchedFingerprint: fp,
      timestamp: Date.now(),
    };
    fs.writeFileSync(metaPath, JSON.stringify(nextMeta, null, 2), "utf8");
    return fp;
  } catch (err) {
    console.warn(`[Antigravity Prism Asar] 同步汉化指纹失败: ${err.message}`);
    return null;
  }
}

function getBackupPath(asarPath) {
  return path.join(path.dirname(asarPath), `${path.basename(asarPath)}.prism.bak`);
}

function getStagedPath(asarPath) {
  return `${asarPath}.prism-staged`;
}

function getStagedMetaPath(asarPath) {
  return `${asarPath}.prism-staged.json`;
}

function cleanupLegacyAgcsStagedFiles(asarPath) {
  const dir = path.dirname(path.resolve(asarPath));
  const base = path.basename(asarPath);
  const removed = [];
  if (!fs.existsSync(dir)) return removed;
  try {
    for (const entry of fs.readdirSync(dir)) {
      if (entry.startsWith(`${base}.agcs-staged`)) {
        const full = path.join(dir, entry);
        try {
          fs.unlinkSync(full);
          removed.push(full);
        } catch {}
      }
    }
  } catch {}
  return removed;
}

function writeFileAtomicallySync(filePath, data, encoding) {
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    if (encoding) {
      fs.writeFileSync(tmpPath, data, encoding);
    } else {
      fs.writeFileSync(tmpPath, data);
    }
    try {
      fs.renameSync(tmpPath, filePath);
    } catch {
      if (encoding) {
        fs.writeFileSync(filePath, data, encoding);
      } else {
        fs.writeFileSync(filePath, data);
      }
      try {
        fs.unlinkSync(tmpPath);
      } catch {}
    }
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {}
    throw err;
  }
}

function ensureInitialBackup(asarPath) {
  const bakPath = getBackupPath(asarPath);
  if (fs.existsSync(bakPath)) return { created: false, backupPath: bakPath };
  const { preloadText } = readPreloadFromAsar(asarPath);
  if (preloadText.includes(PATCH_START_MARKER) || preloadText.includes(LEGACY_PATCH_START_MARKER)) {
    return { created: false, backupPath: bakPath };
  }
  fs.copyFileSync(asarPath, bakPath);
  return { created: true, backupPath: bakPath };
}

class GuardCdpClient {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.closed = false;
    this.onClose = null;

    ws.addEventListener("message", (evt) => {
      let msg;
      try {
        const raw = typeof evt.data === "string" ? evt.data : Buffer.from(evt.data).toString("utf8");
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      if (msg.method) {
        const cbs = this.listeners.get(msg.method);
        if (cbs) {
          for (const cb of cbs) {
            try {
              cb(msg.params || {});
            } catch {}
          }
        }
        return;
      }
      const entry = msg.id && this.pending.get(msg.id);
      if (!entry) return;
      this.pending.delete(msg.id);
      clearTimeout(entry.timer);
      if (msg.error) {
        entry.reject(new Error(msg.error.message || "CDP error"));
      } else {
        entry.resolve(msg.result);
      }
    });

    const handleClose = () => {
      if (this.closed) return;
      this.closed = true;
      for (const p of this.pending.values()) {
        clearTimeout(p.timer);
        p.reject(new Error("CDP closed"));
      }
      this.pending.clear();
      if (typeof this.onClose === "function") {
        try {
          this.onClose();
        } catch {}
      }
    };
    ws.addEventListener("close", handleClose);
    ws.addEventListener("error", handleClose);
  }

  static connect(wsUrl, timeoutMs = 2500) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(wsUrl);
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          ws.close();
        } catch {}
        reject(new Error("Guard CDP connect timeout"));
      }, timeoutMs);

      ws.addEventListener(
        "open",
        () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(new GuardCdpClient(ws));
        },
        { once: true }
      );
      ws.addEventListener(
        "error",
        () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(new Error("Guard CDP connect error"));
        },
        { once: true }
      );
    });
  }

  send(method, params = {}, timeoutMs = 3500) {
    if (this.closed) return Promise.reject(new Error("CDP closed"));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP ${method} timeout`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.ws.send(JSON.stringify({ id, method, params }));
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err);
      }
    });
  }

  on(method, cb) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(cb);
  }

  async evaluate(expression, awaitPromise = false) {
    const res = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise,
    });
    if (res && res.exceptionDetails) {
      throw new Error(res.exceptionDetails.text || "Runtime.evaluate exception");
    }
    return res?.result?.value;
  }

  close() {
    if (!this.closed) {
      this.closed = true;
      for (const p of this.pending.values()) {
        clearTimeout(p.timer);
        p.reject(new Error("CDP closed"));
      }
      this.pending.clear();
      try {
        this.ws.close();
      } catch {}
    }
  }
}

function extractInjectExprFromAsarIfPresent(asarPath) {
  try {
    const { preloadText } = readPreloadFromAsar(asarPath);
    for (const prefix of ["const __agPrismCode = ", "const __agClaudeStyleCode = "]) {
      const idx = preloadText.indexOf(prefix);
      if (idx < 0) continue;
      const start = idx + prefix.length;
      const end = preloadText.indexOf("\n", start);
      const rawLine = (end >= 0 ? preloadText.slice(start, end) : preloadText.slice(start)).trim();
      const jsonLiteral = rawLine.endsWith(";") ? rawLine.slice(0, -1).trim() : rawLine;
      return JSON.parse(jsonLiteral);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 使用 Node 原生 detached + windowsHide 派生独立后台无窗子进程（0 黑框、零 PowerShell、零 WMI）。
 */
function spawnBreakawayNodeProcess(nodeArgs, opts = {}) {
  const exe = process.execPath;
  const cwd = opts.cwd || ROOT_DIR;

  try {
    const spawnOpts = {
      cwd,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    };
    if (opts.env && typeof opts.env === "object") {
      spawnOpts.env = opts.env;
    }
    const child = spawn(exe, nodeArgs, spawnOpts);
    if (child && typeof child.on === "function") {
      child.on("error", () => {});
    }
    if (child && Number.isInteger(child.pid) && child.pid > 0) {
      child.unref();
      return { spawned: true, pid: child.pid, method: "node-detached-windowshide" };
    }
  } catch {
    // Ignore
  }

  return { spawned: false, pid: null, method: null };
}

function spawnDeferredFileSwap(stagedPath, targetPath, opts = {}) {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedStaged = path.resolve(stagedPath);
  const metaPath = getStagedMetaPath(resolvedTarget);
  const guardId = crypto.randomBytes(12).toString("hex");
  const mode = opts.mode || "install";
  const injectExpr =
    mode === "install"
      ? opts.injectExpr || extractInjectExprFromAsarIfPresent(resolvedStaged) || ""
      : "";

  const metaPayload = {
    guardId,
    mode,
    targetPath: resolvedTarget,
    stagedPath: resolvedStaged,
    injectExpr,
    removeExpr:
      mode === "clean-legacy"
        ? opts.removeExpr || LEGACY_ONLY_CLEANUP_EXPRESSION
        : opts.removeExpr || getCdp().REMOVE_EXPRESSION,
    cdpPort: opts.cdpPort ?? null,
    hostPid: opts.hostPid ?? null,
    pollIntervalMs: Math.max(100, Number(opts.pollIntervalMs) || 1500),
    maxAttempts: Math.max(10, Number(opts.maxAttempts) || 57600),
    createdAt: Date.now(),
  };

  try {
    writeFileAtomicallySync(metaPath, JSON.stringify(metaPayload, null, 2), "utf8");
    const procRes = spawnBreakawayNodeProcess([__filename, "--watch-deferred", metaPath], opts);
    return {
      spawned: procRes.spawned,
      pid: procRes.pid,
      method: procRes.method,
      guardId,
      metaPath,
    };
  } catch {
    return {
      spawned: false,
      pid: null,
      method: null,
      guardId,
      metaPath,
    };
  }
}

async function fetchCdpPagesForGuard(port) {
  const res = await fetch(`http://127.0.0.1:${port}/json/list`, {
    signal: AbortSignal.timeout(1200),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const targets = await res.json();
  if (!Array.isArray(targets)) return [];
  const skipRe = /Untitled|launchpad/i;
  return targets.filter(
    (t) =>
      t &&
      t.type === "page" &&
      t.webSocketDebuggerUrl &&
      !String(t.url || "").startsWith("devtools://") &&
      !String(t.url || "").startsWith("data:") &&
      !skipRe.test(`${t.title || ""} ${t.url || ""}`)
  );
}

async function runDeferredSwapDaemon(metaFilePath) {
  const resolvedMetaPath = path.resolve(metaFilePath);
  if (!fs.existsSync(resolvedMetaPath)) return;

  let meta;
  try {
    meta = JSON.parse(fs.readFileSync(resolvedMetaPath, "utf8"));
  } catch {
    return;
  }

  const {
    guardId,
    mode = "install",
    targetPath,
    stagedPath,
    cdpPort: pinnedPort = null,
    hostPid = null,
    pollIntervalMs = 1500,
    maxAttempts = 57600,
  } = meta;

  const cachedInjectExpr =
    mode === "install"
      ? meta.injectExpr || extractInjectExprFromAsarIfPresent(stagedPath) || ""
      : "";
  const cachedRemoveExpr = meta.removeExpr || FALLBACK_REMOVE_EXPRESSION;

  const sessions = new Map();

  const closeAllSessions = () => {
    for (const entry of sessions.values()) {
      try {
        if (entry.scriptId && !entry.client.closed) {
          entry.client
            .send("Page.removeScriptToEvaluateOnNewDocument", { identifier: entry.scriptId }, 500)
            .catch(() => {});
        }
        entry.client.close();
      } catch {}
    }
    sessions.clear();
  };

  const isStillActiveOwner = () => {
    if (!fs.existsSync(stagedPath)) return false;
    if (!fs.existsSync(resolvedMetaPath)) return false;
    try {
      const latest = JSON.parse(fs.readFileSync(resolvedMetaPath, "utf8"));
      return latest && latest.guardId === guardId;
    } catch {
      return true;
    }
  };

  const cleanupOwnedMeta = () => {
    try {
      if (fs.existsSync(resolvedMetaPath)) {
        const latest = JSON.parse(fs.readFileSync(resolvedMetaPath, "utf8"));
        if (!latest || latest.guardId === guardId) {
          fs.unlinkSync(resolvedMetaPath);
        }
      }
    } catch {}
  };

  const healEntry = async (entry) => {
    if (!entry || entry.healing || entry.client.closed) return;
    entry.healing = true;
    try {
      const probeState = await entry.client.evaluate(`(() => {
        const docEl = typeof document !== 'undefined' && document.documentElement;
        if (!docEl || document.readyState === 'loading') return 'loading';
        const hasPrism = docEl.hasAttribute('data-ag-prism');
        const hasLegacy = docEl.getAttribute('data-ag-cs-style') === '1' && !hasPrism;
        if (hasPrism) return 'prism';
        if (hasLegacy) return 'legacy';
        return docEl.getAttribute('data-ag-cs-style') === '1' ? 'present' : 'missing';
      })()`);
      if (mode === "install" && cachedInjectExpr && (probeState === "missing" || probeState === "legacy")) {
        await entry.client.evaluate(cachedInjectExpr);
      } else if (mode === "restore" && (probeState === "present" || probeState === "prism" || probeState === "legacy")) {
        await entry.client.evaluate(cachedRemoveExpr);
      } else if (mode === "clean-legacy" && probeState === "legacy") {
        await entry.client.evaluate(cachedRemoveExpr);
      }
    } catch {
    } finally {
      entry.healing = false;
    }
  };

  const attachPage = async (page) => {
    const client = await GuardCdpClient.connect(page.webSocketDebuggerUrl, 2000);
    const entry = { client, healing: false, scriptId: null };
    sessions.set(page.id, entry);
    client.onClose = () => {
      if (sessions.get(page.id) === entry) {
        sessions.delete(page.id);
      }
    };

    try {
      await client.send("Page.enable", {}, 2000);
      if (mode === "install" && cachedInjectExpr) {
        const newDocSource = `(() => {
          const __agRun = () => { try { ${cachedInjectExpr}; } catch {} };
          if (typeof document !== 'undefined' && document.readyState !== 'loading' && document.documentElement) {
            __agRun();
          } else if (typeof window !== 'undefined') {
            window.addEventListener('DOMContentLoaded', __agRun, { once: true });
          }
        })()`;
        const addRes = await client
          .send("Page.addScriptToEvaluateOnNewDocument", { source: newDocSource }, 2000)
          .catch(() => null);
        if (addRes && addRes.identifier) {
          entry.scriptId = addRes.identifier;
        }
      }
      const onReloadEvent = () => {
        setTimeout(() => {
          void healEntry(entry);
        }, 60);
      };
      client.on("Page.domContentLoadedEventFired", onReloadEvent);
      client.on("Page.loadEventFired", onReloadEvent);
    } catch {}

    await healEntry(entry);
  };

  let attempts = 0;
  let tickBusy = false;

  const finalizeSwapAndExit = () => {
    closeAllSessions();
    if (!fs.existsSync(stagedPath)) {
      cleanupOwnedMeta();
      process.exit(0);
    }
    try {
      fs.copyFileSync(stagedPath, targetPath);
      syncChineseLocalizationMeta(targetPath);
      cleanupLegacyAgcsStagedFiles(targetPath);
      try {
        fs.unlinkSync(stagedPath);
      } catch {}
      cleanupOwnedMeta();
      process.exit(0);
    } catch {
      // Retry on next tick if handle is briefly locked during shutdown
    }
  };

  const tick = async () => {
    if (tickBusy) return;
    tickBusy = true;
    try {
      attempts += 1;
      if (attempts > maxAttempts || !isStillActiveOwner()) {
        closeAllSessions();
        process.exit(0);
      }

      if (hostPid !== null && hostPid !== undefined) {
        if (!isPidAlive(hostPid)) {
          finalizeSwapAndExit();
          return;
        }
      }

      const port = pinnedPort || readActiveCdpPortSync();
      let cdpReachable = false;
      if (port) {
        try {
          const pages = await fetchCdpPagesForGuard(port);
          cdpReachable = true;
          const liveIds = new Set(pages.map((p) => p.id));
          for (const [id, entry] of sessions.entries()) {
            if (!liveIds.has(id)) {
              entry.client.close();
              sessions.delete(id);
            }
          }
          for (const page of pages) {
            const existing = sessions.get(page.id);
            if (!existing || existing.client.closed) {
              await attachPage(page).catch(() => {});
            } else {
              await healEntry(existing);
            }
          }
        } catch {
          cdpReachable = false;
          closeAllSessions();
        }
      }

      if ((hostPid === null || hostPid === undefined) && !cdpReachable) {
        const stillRunning = isHostClientRunning(targetPath, {
          skipCdpProbe: true,
        });
        if (!stillRunning) {
          finalizeSwapAndExit();
          return;
        }
      }
    } finally {
      tickBusy = false;
    }
  };

  await tick();
  setInterval(() => {
    void tick();
  }, pollIntervalMs);
}

function cleanupStagedArtifacts(targetPath) {
  const stagedPath = getStagedPath(targetPath);
  const metaPath = getStagedMetaPath(targetPath);
  try {
    if (fs.existsSync(stagedPath)) fs.unlinkSync(stagedPath);
  } catch {}
  try {
    if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
  } catch {}
}

function writeBufferAtomically(targetPath, buffer, opts = {}) {
  const stagedPath = getStagedPath(targetPath);
  const metaPath = getStagedMetaPath(targetPath);
  const hostRunning = !opts.forceDirect && isHostClientRunning(targetPath, opts);

  if (hostRunning) {
    writeFileAtomicallySync(stagedPath, buffer);
    if (opts.noSwap) {
      return {
        written: false,
        deferred: false,
        hostRunning: true,
        stagedPath,
        stagedMetaPath: null,
        guardPid: null,
        reason: "host-client-running",
      };
    }
    const swapRes = spawnDeferredFileSwap(stagedPath, targetPath, opts);
    return {
      written: false,
      deferred: Boolean(swapRes.spawned),
      hostRunning: true,
      stagedPath,
      stagedMetaPath: swapRes.metaPath,
      guardPid: swapRes.pid,
      spawnMethod: swapRes.method,
      reason: "host-client-running",
    };
  }

  writeFileAtomicallySync(stagedPath, buffer);
  try {
    fs.copyFileSync(stagedPath, targetPath);
    cleanupStagedArtifacts(targetPath);
    const fp = syncChineseLocalizationMeta(targetPath, buffer);
    return {
      written: true,
      deferred: false,
      hostRunning: false,
      stagedPath: null,
      stagedMetaPath: null,
      fingerprint: fp,
    };
  } catch (copyErr) {
    if (opts.noSwap) {
      return {
        written: false,
        deferred: false,
        hostRunning: false,
        stagedPath,
        stagedMetaPath: fs.existsSync(metaPath) ? metaPath : null,
        error: copyErr.message,
      };
    }
    const swapRes = spawnDeferredFileSwap(stagedPath, targetPath, opts);
    return {
      written: false,
      deferred: Boolean(swapRes.spawned),
      hostRunning: false,
      stagedPath,
      stagedMetaPath: swapRes.metaPath,
      guardPid: swapRes.pid,
      spawnMethod: swapRes.method,
      error: copyErr.message,
    };
  }
}

function patchAsarFile(asarPath, opts = {}) {
  const resolved = path.resolve(asarPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`未找到目标 app.asar: ${resolved}`);
  }
  const removedLegacyStaged = cleanupLegacyAgcsStagedFiles(resolved);
  const injectExpr = opts.injectExpr || getCdp().buildInjectExpression(opts.config);
  const backup = opts.skipBackup ? { created: false, backupPath: getBackupPath(resolved) } : ensureInitialBackup(resolved);
  const { preloadText } = readPreloadFromAsar(resolved);
  const nextPreload = patchPreloadContent(preloadText, injectExpr);
  const outBuf = rebuildAsarWithPreload(resolved, nextPreload);
  const writeRes = writeBufferAtomically(resolved, outBuf, {
    ...opts,
    mode: "install",
    injectExpr,
  });
  return {
    ok: true,
    asarPath: resolved,
    backupCreated: backup.created,
    backupPath: backup.backupPath,
    removedLegacyStaged,
    sizeBytes: outBuf.length,
    payloadBytes: Buffer.byteLength(injectExpr, "utf8"),
    ...writeRes,
  };
}

function restoreAsarFile(asarPath, opts = {}) {
  const resolved = path.resolve(asarPath);
  const stagedPath = getStagedPath(resolved);
  const hadStaged = fs.existsSync(stagedPath);
  const removedLegacyStaged = cleanupLegacyAgcsStagedFiles(resolved);
  if (!fs.existsSync(resolved)) {
    cleanupStagedArtifacts(resolved);
    throw new Error(`未找到目标 app.asar: ${resolved}`);
  }
  const { preloadText } = readPreloadFromAsar(resolved);
  if (!preloadText.includes(PATCH_START_MARKER) && !preloadText.includes(LEGACY_PATCH_START_MARKER)) {
    cleanupStagedArtifacts(resolved);
    return {
      ok: true,
      asarPath: resolved,
      changed: hadStaged || removedLegacyStaged.length > 0,
      written: false,
      deferred: false,
      canceledStaged: hadStaged,
      removedLegacyStaged,
    };
  }
  const cleanPreload = unpatchPreloadContent(preloadText);
  const outBuf = rebuildAsarWithPreload(resolved, cleanPreload);
  const writeRes = writeBufferAtomically(resolved, outBuf, {
    ...opts,
    mode: "restore",
    injectExpr: "",
  });
  return {
    ok: true,
    asarPath: resolved,
    changed: true,
    removedLegacyStaged,
    sizeBytes: outBuf.length,
    ...writeRes,
  };
}

/**
 * 清理历史旧版 /* __AG_CLAUDE_STYLE_START__ * / 代码块与残留 .agcs-staged* 文件，
 * 100% 保护汉化补丁与 Codex 滑块及运行期 ASAR 内存偏移！
 */
function cleanLegacyAsar(asarPath, opts = {}) {
  const resolved = path.resolve(asarPath);
  const removedLegacyStaged = cleanupLegacyAgcsStagedFiles(resolved);
  if (!fs.existsSync(resolved)) {
    throw new Error(`未找到目标 app.asar: ${resolved}`);
  }
  const { preloadText, rawAsar } = readPreloadFromAsar(resolved);
  const hadLegacyBlock = preloadText.includes(LEGACY_PATCH_START_MARKER);
  if (!hadLegacyBlock) {
    // 磁盘 app.asar 不含旧版块：零覆写，仅在不运行时核验汉化指纹
    let fingerprint = null;
    if (!isHostClientRunning(resolved, opts)) {
      fingerprint = syncChineseLocalizationMeta(resolved, rawAsar);
    }
    return {
      ok: true,
      asarPath: resolved,
      hadLegacyBlock: false,
      changed: removedLegacyStaged.length > 0,
      written: false,
      deferred: false,
      removedLegacyStaged,
      fingerprint,
    };
  }

  const strippedPreload = stripMarkerBlock(preloadText, LEGACY_PATCH_START_MARKER, LEGACY_PATCH_END_MARKER);
  const outBuf = rebuildAsarWithPreload(resolved, strippedPreload);
  const writeRes = writeBufferAtomically(resolved, outBuf, {
    ...opts,
    mode: "clean-legacy",
    injectExpr: "",
    removeExpr: LEGACY_ONLY_CLEANUP_EXPRESSION,
  });
  return {
    ok: true,
    asarPath: resolved,
    hadLegacyBlock: true,
    changed: true,
    removedLegacyStaged,
    sizeBytes: outBuf.length,
    ...writeRes,
  };
}

function inspectAsarStatus(asarPath, opts = {}) {
  const resolved = path.resolve(asarPath);
  const backupPath = getBackupPath(resolved);
  const stagedPath = getStagedPath(resolved);
  const stagedMetaPath = getStagedMetaPath(resolved);
  const metaPath = path.join(path.dirname(resolved), ".antigravity_chinese_meta.json");
  let chineseMeta = null;
  if (fs.existsSync(metaPath)) {
    try {
      chineseMeta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    } catch {}
  }
  const hostRunning = isHostClientRunning(resolved, opts);
  if (!fs.existsSync(resolved)) {
    return {
      exists: false,
      asarPath: resolved,
      hostRunning,
      backupPath,
      hasBackup: fs.existsSync(backupPath),
      stagedPath,
      hasStaged: fs.existsSync(stagedPath),
      hasStagedMeta: fs.existsSync(stagedMetaPath),
      chineseMeta,
    };
  }
  const stat = fs.statSync(resolved);
  const { preloadText, rawAsar, preloadEntry } = readPreloadFromAsar(resolved);
  const inspectPayload = (buf) => buf.includes(Buffer.from(CHINESE_INJECTION_MARKER));
  let stagedInfo = null;
  if (fs.existsSync(stagedPath)) {
    try {
      const stagedRead = readPreloadFromAsar(stagedPath);
      const sPrism = stagedRead.preloadText.includes(PATCH_START_MARKER);
      const sLegacy = stagedRead.preloadText.includes(LEGACY_PATCH_START_MARKER);
      stagedInfo = {
        sizeBytes: stagedRead.rawAsar.length,
        preloadOffset: Number(stagedRead.preloadEntry.offset),
        preloadSize: stagedRead.preloadEntry.size,
        hasPrism: sPrism,
        hasLegacyClaudeStyle: sLegacy,
        hasClaudeStyle: sPrism || sLegacy,
        hasCodexSlider: stagedRead.preloadText.includes(CODEX_SLIDER_MARKER),
        hasChinesePatch: inspectPayload(stagedRead.rawAsar),
      };
    } catch {}
  }
  const hasPrism = preloadText.includes(PATCH_START_MARKER);
  const hasLegacyClaudeStyle = preloadText.includes(LEGACY_PATCH_START_MARKER);
  return {
    exists: true,
    asarPath: resolved,
    hostRunning,
    sizeBytes: stat.size,
    preloadOffset: Number(preloadEntry.offset),
    preloadSize: preloadEntry.size,
    hasPrism,
    hasLegacyClaudeStyle,
    hasClaudeStyle: hasPrism || hasLegacyClaudeStyle,
    hasCodexSlider: preloadText.includes(CODEX_SLIDER_MARKER),
    hasChinesePatch: inspectPayload(rawAsar),
    backupPath,
    hasBackup: fs.existsSync(backupPath),
    stagedPath,
    hasStaged: fs.existsSync(stagedPath),
    hasStagedMeta: fs.existsSync(stagedMetaPath),
    stagedInfo,
    chineseMeta,
  };
}

async function applyCdpLive(mode, opts = {}) {
  const cdp = getCdp();
  const port = opts.cdpPort || cdp.readPort();
  if (!port) return { ok: false, skipped: true, reason: "no-port-file" };
  let pages;
  try {
    pages = await cdp.listPages(port);
  } catch (err) {
    return { ok: false, skipped: true, reason: err.message };
  }
  if (!Array.isArray(pages) || pages.length === 0) {
    return { ok: false, skipped: true, reason: "no-pages" };
  }
  const targetPages = opts.includeAllPages ? pages : pages.filter(cdp.isEligibleTarget);
  if (targetPages.length === 0) {
    return { ok: false, skipped: true, reason: "no-active-pages" };
  }
  const results = [];
  const injectExpr = mode === "install" ? opts.injectExpr || cdp.buildInjectExpression() : null;
  for (const page of targetPages) {
    let session = null;
    try {
      session = await cdp.CdpSession.connect(page.webSocketDebuggerUrl);
      const cleanExpr = mode === "clean-legacy" ? LEGACY_ONLY_CLEANUP_EXPRESSION : cdp.REMOVE_EXPRESSION;
      const removed = await session.evaluate(cleanExpr);
      let injected = null;
      if (injectExpr) {
        injected = await session.evaluate(injectExpr);
      }
      results.push({
        id: page.id,
        title: page.title || page.url,
        removed,
        injectedStatus: injected?.status || null,
        state: injected?.state || null,
      });
    } catch (err) {
      results.push({
        id: page.id,
        title: page.title || page.url,
        error: err.message,
      });
    } finally {
      if (session) session.close();
    }
  }
  return { ok: true, skipped: false, port, pages: results };
}

function parseCliArgs(argv) {
  const args = argv.slice(2);
  let action = "status";
  let asarPath = null;
  let noCdp = false;
  let noSwap = false;
  let forceDirect = false;
  let watchDeferredMeta = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--install") action = "install";
    else if (a === "--restore") action = "restore";
    else if (a === "--clean-legacy") action = "clean-legacy";
    else if (a === "--status") action = "status";
    else if (a === "--no-cdp") noCdp = true;
    else if (a === "--no-swap") noSwap = true;
    else if (a === "--force-direct") forceDirect = true;
    else if (a === "--watch-deferred" && args[i + 1]) {
      action = "watch-deferred";
      watchDeferredMeta = args[i + 1];
      i++;
    } else if (a === "--asar" && args[i + 1]) {
      asarPath = args[i + 1];
      i++;
    }
  }
  return {
    action,
    asarPath: asarPath || findDefaultAsarPath(),
    noCdp,
    noSwap,
    forceDirect,
    watchDeferredMeta,
  };
}

async function main() {
  const opts = parseCliArgs(process.argv);
  if (opts.action === "watch-deferred") {
    if (opts.watchDeferredMeta) {
      await runDeferredSwapDaemon(opts.watchDeferredMeta);
    }
    return;
  }
  if (opts.action === "status") {
    const status = inspectAsarStatus(opts.asarPath);
    console.log(JSON.stringify(status, null, 2));
    return;
  }
  if (opts.action === "clean-legacy") {
    const cleanRes = cleanLegacyAsar(opts.asarPath, {
      noSwap: opts.noSwap,
      forceDirect: opts.forceDirect,
    });
    let cdpRes = { ok: false, skipped: true, reason: "disabled" };
    if (!opts.noCdp) {
      cdpRes = await applyCdpLive("clean-legacy");
    }
    console.log(JSON.stringify({ action: "clean-legacy", clean: cleanRes, cdp: cdpRes }, null, 2));
    return;
  }
  if (opts.action === "install") {
    const injectExpr = getCdp().buildInjectExpression();
    const patchRes = patchAsarFile(opts.asarPath, {
      noSwap: opts.noSwap,
      forceDirect: opts.forceDirect,
      injectExpr,
    });
    let cdpRes = { ok: false, skipped: true, reason: "disabled" };
    if (!opts.noCdp) {
      cdpRes = await applyCdpLive("install", { injectExpr });
    }
    console.log(JSON.stringify({ action: "install", patch: patchRes, cdp: cdpRes }, null, 2));
    return;
  }
  if (opts.action === "restore") {
    const restoreRes = restoreAsarFile(opts.asarPath, {
      noSwap: opts.noSwap,
      forceDirect: opts.forceDirect,
    });
    let cdpRes = { ok: false, skipped: true, reason: "disabled" };
    if (!opts.noCdp) {
      cdpRes = await applyCdpLive("restore");
    }
    console.log(JSON.stringify({ action: "restore", restore: restoreRes, cdp: cdpRes }, null, 2));
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("[Antigravity Prism Asar] Fatal error:", err);
    process.exit(1);
  });
}

module.exports = {
  PATCH_START_MARKER,
  PATCH_END_MARKER,
  LEGACY_PATCH_START_MARKER,
  LEGACY_PATCH_END_MARKER,
  CODEX_SLIDER_MARKER,
  CHINESE_INJECTION_MARKER,
  findDefaultAsarPath,
  isPidAlive,
  isHostClientRunning,
  computeIntegrity,
  parseAsarArchive,
  buildAsarArchive,
  repackAsarTree,
  stripMarkerBlock,
  unpatchPreloadContent,
  patchPreloadContent,
  readPreloadFromAsar,
  rebuildAsarWithPreload,
  syncChineseLocalizationMeta,
  getBackupPath,
  getStagedPath,
  getStagedMetaPath,
  cleanupLegacyAgcsStagedFiles,
  ensureInitialBackup,
  spawnBreakawayNodeProcess,
  spawnDeferredFileSwap,
  runDeferredSwapDaemon,
  patchAsarFile,
  restoreAsarFile,
  cleanLegacyAsar,
  inspectAsarStatus,
  applyCdpLive,
  parseCliArgs,
};

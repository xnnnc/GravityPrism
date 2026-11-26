"use strict";

/**
 * Obsidian Prism 原生自启动插件一键同步安装器 (tools/install-plugin.cjs)
 *
 * 职责：
 * 1. 将 obsidian-prism 完整同步部署至 ~/.gemini/config/plugins/obsidian-prism
 *    （含 plugin.json、assets/logo.svg、THIRD_PARTY_NOTICES.md、sidecars/daemon/sidecar.json、全部运行时与 vendor/）；
 * 2. 自动停用并清理旧临时插件目录 ~/.gemini/config/plugins/antigravity-prism（若存在用户配置则平滑迁入新目录）；
 * 3. 写入 repo-meta.json 链接本地 Git 源码目录，支持设置面板「检查 / 同步 Git 更新」；
 * 4. 通过纯 Node detached + windowsHide 脱离派生确保后台守护实例已启动并接管当前 CDP 窗口！
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const { spawnBreakawayNodeProcess, isPidAlive } = require("./patch-asar.cjs");

const ROOT_DIR = path.resolve(__dirname, "..");
const {
  SYNC_ROOT_FILES,
  readPidFromLockFile,
  isExpectedDaemonProcess,
  ensureAntigravityShortcutsCdpFlag,
  restoreAntigravityShortcutsCdpFlag,
  detectRunningAntigravityHostSync,
  recordRelaunchPromptState,
} = require(path.join(ROOT_DIR, "cdp.js"));

function isAutomatedTestRuntime() {
  if (process.env.NODE_ENV === "test") return true;
  if (process.env.NODE_TEST_CONTEXT) return true;
  return Array.isArray(process.execArgv) && process.execArgv.some((a) => a === "--test" || a.startsWith("--test-"));
}

function pathsEqual(a, b, platform = process.platform) {
  if (!a || !b) return false;
  const ra = path.resolve(a);
  const rb = path.resolve(b);
  return platform === "win32" ? ra.toLowerCase() === rb.toLowerCase() : ra === rb;
}

function getDefaultPluginTargetDir() {
  return path.join(os.homedir(), ".gemini", "config", "plugins", "obsidian-prism");
}

function getLegacyTempPluginDir(targetDir = getDefaultPluginTargetDir(), platform = process.platform) {
  const parent = path.dirname(path.resolve(targetDir));
  const candidate = path.join(parent, "antigravity-prism");
  if (pathsEqual(candidate, targetDir, platform)) {
    return null;
  }
  return candidate;
}

function resolveHostGeminiConfigDir(targetDir, explicitHostDir = null, platform = process.platform) {
  if (explicitHostDir) return path.resolve(explicitHostDir);
  if (process.env.AG_PRISM_GEMINI_CONFIG_DIR) {
    return path.resolve(process.env.AG_PRISM_GEMINI_CONFIG_DIR);
  }
  const defaultTarget = path.resolve(getDefaultPluginTargetDir());
  const resolvedTarget = path.resolve(targetDir || defaultTarget);
  if (pathsEqual(resolvedTarget, defaultTarget, platform)) {
    return path.join(os.homedir(), ".gemini", "config");
  }
  const parentDir = path.dirname(resolvedTarget);
  if (path.basename(parentDir).toLowerCase() === "plugins") {
    return path.dirname(parentDir);
  }
  return null;
}

function isSubPath(candidate, baseDir) {
  if (!candidate || !baseDir) return false;
  const normCand = path.resolve(candidate);
  const normBase = path.resolve(baseDir);
  const cmpCand = process.platform === "win32" ? normCand.toLowerCase() : normCand;
  const cmpBase = process.platform === "win32" ? normBase.toLowerCase() : normBase;
  const prefix = cmpBase.endsWith(path.sep) ? cmpBase : cmpBase + path.sep;
  return cmpCand.startsWith(prefix);
}

function isAllowedTelemetryOverrideDir(candidatePath, hostConfigDir = null) {
  if (!candidatePath) return false;
  const resolved = path.resolve(candidatePath);
  if (isProtectedUserDataPath(resolved)) return false;
  const home = path.resolve(os.homedir());
  const allowedRoots = [path.join(home, ".gemini"), os.tmpdir()];
  if (process.platform === "darwin") {
    allowedRoots.push("/tmp", "/private/tmp");
  }
  if (hostConfigDir) {
    const resolvedCfg = path.resolve(hostConfigDir);
    const parent = path.dirname(resolvedCfg);
    if (path.basename(parent).toLowerCase() === ".gemini") {
      allowedRoots.push(parent);
    }
  }
  const underAllowedRoot = allowedRoots.some((root) => isSubPath(resolved, root));
  if (!underAllowedRoot) return false;
  const segments = resolved
    .split(/[\\/]+/)
    .filter(Boolean)
    .map((s) => s.toLowerCase());
  return segments.includes("telemetry") || segments.includes("obsidian-prism");
}

function resolveTelemetryDir(hostConfigDir, explicitTelemetryDir = null) {
  if (explicitTelemetryDir) return path.resolve(explicitTelemetryDir);
  if (process.env.AG_PRISM_TELEMETRY_DIR) {
    const envDir = process.env.AG_PRISM_TELEMETRY_DIR.trim();
    if (!envDir || !isAllowedTelemetryOverrideDir(envDir, hostConfigDir)) {
      return null;
    }
    return path.resolve(envDir);
  }
  if (!hostConfigDir) return null;
  const geminiRoot = path.dirname(path.resolve(hostConfigDir));
  return path.join(geminiRoot, "antigravity", "sidecar_data", "obsidian-prism", "telemetry");
}

function isAllowedAddonsOverrideDir(candidatePath, hostConfigDir = null) {
  if (!candidatePath) return false;
  const resolved = path.resolve(candidatePath);
  if (isProtectedUserDataPath(resolved)) return false;
  const home = path.resolve(os.homedir());
  const allowedRoots = [path.join(home, ".gemini"), os.tmpdir()];
  if (process.platform === "darwin") {
    allowedRoots.push("/tmp", "/private/tmp");
  }
  if (hostConfigDir) {
    const resolvedCfg = path.resolve(hostConfigDir);
    const parent = path.dirname(resolvedCfg);
    if (path.basename(parent).toLowerCase() === ".gemini") {
      allowedRoots.push(parent);
    }
  }
  const underAllowedRoot = allowedRoots.some((root) => isSubPath(resolved, root));
  if (!underAllowedRoot) return false;
  const segments = resolved
    .split(/[\\/]+/)
    .filter(Boolean)
    .map((s) => s.toLowerCase());
  return segments.includes("addons") || segments.includes("obsidian-prism");
}

function resolveAddonsDir(hostConfigDir, explicitAddonsDir = null) {
  if (explicitAddonsDir !== null && explicitAddonsDir !== undefined) {
    const explicitStr = typeof explicitAddonsDir === "string" ? explicitAddonsDir.trim() : "";
    if (!explicitStr || !isAllowedAddonsOverrideDir(explicitStr, hostConfigDir)) {
      return null;
    }
    return path.resolve(explicitStr);
  }
  if (process.env.AG_PRISM_ADDONS_DIR) {
    const envDir = process.env.AG_PRISM_ADDONS_DIR.trim();
    if (!envDir || !isAllowedAddonsOverrideDir(envDir, hostConfigDir)) {
      return null;
    }
    return path.resolve(envDir);
  }
  if (!hostConfigDir) return null;
  const geminiRoot = path.dirname(path.resolve(hostConfigDir));
  return path.join(geminiRoot, "antigravity", "sidecar_data", "obsidian-prism", "addons");
}

function isValidConfigJsonContent(raw) {
  try {
    const clean = String(raw || "").replace(/^\uFEFF/, "").trim();
    if (!clean) return false;
    const parsed = JSON.parse(clean);
    return Boolean(parsed && typeof parsed === "object" && !Array.isArray(parsed));
  } catch {
    return false;
  }
}

function safeUnlinkNoSymlink(filePath, label = "file") {
  const st = assertNotSymbolicLink(filePath, label);
  if (st && st.isFile()) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

function resolveSafeUsageCacheOverridePath(hostConfigDir, explicitPath = null) {
  const raw =
    typeof explicitPath === "string" && explicitPath.trim()
      ? explicitPath.trim()
      : typeof process.env.PRISM_USAGE_CACHE_PATH === "string"
        ? process.env.PRISM_USAGE_CACHE_PATH.trim()
        : "";
  if (!raw) return null;
  const resolved = path.resolve(raw);
  if (path.basename(resolved).toLowerCase() !== "obsidian-prism-usage-rollup-cache.json") {
    return null;
  }
  if (isProtectedUserDataPath(resolved)) return null;
  const parentDir = path.dirname(resolved);
  const geminiRoot = hostConfigDir ? path.dirname(path.resolve(hostConfigDir)) : null;
  const allowedRoots = [
    hostConfigDir ? path.resolve(hostConfigDir) : null,
    geminiRoot,
    path.join(os.homedir(), ".gemini"),
    os.tmpdir(),
  ].filter(Boolean);
  const norm = (p) => (process.platform === "win32" ? path.resolve(p).toLowerCase() : path.resolve(p));
  const parentNorm = norm(parentDir);
  const matchedRoot = allowedRoots.find((base) => {
    const baseNorm = norm(base);
    if (parentNorm === baseNorm) return true;
    const prefix = baseNorm.endsWith(path.sep) ? baseNorm : baseNorm + path.sep;
    return parentNorm.startsWith(prefix);
  });
  if (!matchedRoot) return null;
  let cur = parentDir;
  const stopNorm = norm(matchedRoot);
  for (let depth = 0; depth < 64; depth++) {
    try {
      const st = fs.lstatSync(cur);
      if (st.isSymbolicLink()) return null;
    } catch (err) {
      if (err && err.code !== "ENOENT") return null;
    }
    if (norm(cur) === stopNorm) break;
    const up = path.dirname(cur);
    if (!up || up === cur) break;
    cur = up;
  }
  return resolved;
}

function isProtectedUserDataPath(dirPath) {
  if (!dirPath) return true;
  const resolved = path.resolve(dirPath);
  const parsed = path.parse(resolved);
  if (resolved === parsed.root) return true;
  const segments = resolved
    .split(/[\\/]+/)
    .filter(Boolean)
    .map((s) => s.toLowerCase());
  if (
    segments.includes("conversations_archive") ||
    segments.includes("antigravity-spark") ||
    segments.includes("prism-knowledge-space")
  ) {
    return true;
  }
  const home = path.resolve(os.homedir());
  const resolvedLower = resolved.toLowerCase();
  const redlineRoots = [
    path.join(home, ".gemini", "antigravity", "conversations_archive"),
    path.join(home, ".gemini", "antigravity", "prism-knowledge-space"),
    path.join(home, "Documents", "Antigravity-Spark"),
  ];
  for (const r of redlineRoots) {
    const rLower = r.toLowerCase();
    if (
      resolvedLower === rLower ||
      resolvedLower.startsWith(rLower + path.sep) ||
      rLower.startsWith(resolvedLower + path.sep)
    ) {
      return true;
    }
  }
  if (
    resolvedLower === home.toLowerCase() ||
    resolvedLower === path.join(home, ".gemini").toLowerCase() ||
    resolvedLower === path.join(home, ".gemini", "config").toLowerCase() ||
    resolvedLower === path.join(home, ".gemini", "antigravity").toLowerCase()
  ) {
    return true;
  }
  return false;
}

function assertNotSymbolicLink(targetPath, label = "path") {
  try {
    const lst = fs.lstatSync(targetPath);
    if (lst.isSymbolicLink()) {
      throw new Error(`Refusing symbolic link ${label}: ${targetPath}`);
    }
    return lst;
  } catch (err) {
    if (err && err.code === "ENOENT") return null;
    throw err;
  }
}

const FS_RETRY_BACKOFFS_MS = [40, 80, 150, 250, 400];

function sleepSync(ms) {
  const duration = Math.max(1, Number(ms) || 1);
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, duration);
  } catch {
    const end = Date.now() + duration;
    while (Date.now() < end) {
      // Fallback busy-wait only when SharedArrayBuffer is unavailable
    }
  }
}

function isTransientFsError(err) {
  if (!err || !err.code) return false;
  return err.code === "EBUSY" || err.code === "EPERM" || err.code === "EACCES";
}

function clearReadOnlyIfRegularFile(filePath, label = "target file") {
  const st = assertNotSymbolicLink(filePath, label);
  if (st && st.isFile()) {
    try {
      if (process.platform === "win32") {
        fs.chmodSync(filePath, 0o666);
      } else if ((st.mode & 0o200) === 0) {
        fs.chmodSync(filePath, (st.mode & 0o777) | 0o200);
      }
    } catch {}
  }
}

function atomicWriteFileSync(filePath, content, options = {}) {
  assertNotSymbolicLink(filePath, "target file");
  const dir = path.dirname(filePath);
  assertNotSymbolicLink(dir, "target directory");
  fs.mkdirSync(dir, { recursive: true });
  assertNotSymbolicLink(dir, "target directory");
  const encoding = options.encoding !== undefined ? options.encoding : "utf8";
  const mode = options.mode !== undefined ? options.mode : 0o600;
  const tmpPath = `${filePath}.tmp.${process.pid}.${crypto.randomBytes(8).toString("hex")}`;
  let fd = null;
  try {
    fd = fs.openSync(tmpPath, "wx", mode);
    if (Buffer.isBuffer(content) || encoding === null) {
      fs.writeFileSync(fd, content);
    } else {
      fs.writeFileSync(fd, content, encoding);
    }
    try {
      fs.fsyncSync(fd);
    } catch {}
    fs.closeSync(fd);
    fd = null;
    try {
      fs.chmodSync(tmpPath, mode);
    } catch {}

    let lastErr = null;
    for (let attempt = 0; attempt <= FS_RETRY_BACKOFFS_MS.length; attempt++) {
      assertNotSymbolicLink(dir, "target directory");
      assertNotSymbolicLink(filePath, "target file");
      clearReadOnlyIfRegularFile(filePath, "target file");
      try {
        fs.renameSync(tmpPath, filePath);
        lastErr = null;
        break;
      } catch (err) {
        if (!isTransientFsError(err) || attempt >= FS_RETRY_BACKOFFS_MS.length) {
          throw err;
        }
        lastErr = err;
        sleepSync(FS_RETRY_BACKOFFS_MS[attempt]);
      }
    }
    if (lastErr) throw lastErr;
  } catch (err) {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {}
    }
    try {
      fs.unlinkSync(tmpPath);
    } catch {}
    throw err;
  }
}

function safeCopyFileNoSymlink(src, dst) {
  const srcStat = assertNotSymbolicLink(src, "source");
  if (!srcStat || !srcStat.isFile()) {
    throw new Error(`Refusing non-regular source file: ${src}`);
  }
  assertNotSymbolicLink(dst, "destination");
  const dstDir = path.dirname(dst);
  assertNotSymbolicLink(dstDir, "destination directory");
  fs.mkdirSync(dstDir, { recursive: true });
  assertNotSymbolicLink(dstDir, "destination directory");

  let lastErr = null;
  for (let attempt = 0; attempt <= FS_RETRY_BACKOFFS_MS.length; attempt++) {
    assertNotSymbolicLink(dst, "destination");
    clearReadOnlyIfRegularFile(dst, "destination");
    try {
      fs.copyFileSync(src, dst);
      return;
    } catch (err) {
      if (!isTransientFsError(err)) {
        throw err;
      }
      // 遇 Windows 共享读取占用时回退临时文件原子重命名替换
      const tmpPath = `${dst}.tmp.${process.pid}.${crypto.randomBytes(6).toString("hex")}`;
      try {
        fs.copyFileSync(src, tmpPath, fs.constants.COPYFILE_EXCL);
        assertNotSymbolicLink(dst, "destination");
        clearReadOnlyIfRegularFile(dst, "destination");
        fs.renameSync(tmpPath, dst);
        return;
      } catch (fallbackErr) {
        try {
          fs.unlinkSync(tmpPath);
        } catch {}
        lastErr = fallbackErr || err;
        if (attempt < FS_RETRY_BACKOFFS_MS.length) {
          sleepSync(FS_RETRY_BACKOFFS_MS[attempt]);
        }
      }
    }
  }
  if (lastErr) {
    const wrapped = new Error(
      `Failed to copy "${dst}" (${lastErr.code || lastErr.message}); file may be locked by Antigravity or antivirus software`
    );
    wrapped.code = lastErr.code;
    wrapped.cause = lastErr;
    throw wrapped;
  }
}

function syncHostPluginRegistry(configDir, enable) {
  if (!configDir) return false;
  const hostConfigPath = path.join(configDir, "config.json");
  try {
    assertNotSymbolicLink(configDir, "host config directory");
    assertNotSymbolicLink(hostConfigPath, "host config.json");
    if (enable) {
      fs.mkdirSync(configDir, { recursive: true });
      let hostObj = {};
      if (fs.existsSync(hostConfigPath)) {
        const raw = fs.readFileSync(hostConfigPath, "utf8").replace(/^\uFEFF/, "").trim();
        if (raw.length > 0) {
          const parsed = JSON.parse(raw);
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
          hostObj = parsed;
        }
      }
      hostObj.plugins = hostObj.plugins && typeof hostObj.plugins === "object" && !Array.isArray(hostObj.plugins) ? hostObj.plugins : {};
      const prevEntry = hostObj.plugins["obsidian-prism"];
      hostObj.plugins["obsidian-prism"] =
        prevEntry && typeof prevEntry === "object" && !Array.isArray(prevEntry)
          ? { ...prevEntry, enabled: true }
          : { enabled: true };
      if (hostObj.plugins["antigravity-prism"]) {
        delete hostObj.plugins["antigravity-prism"];
      }
      atomicWriteFileSync(hostConfigPath, JSON.stringify(hostObj, null, 2) + "\n", {
        encoding: "utf8",
        mode: 0o600,
      });
      return true;
    }

    if (fs.existsSync(hostConfigPath)) {
      const raw = fs.readFileSync(hostConfigPath, "utf8").replace(/^\uFEFF/, "").trim();
      if (raw.length > 0) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          let changed = false;
          if (parsed.plugins && typeof parsed.plugins === "object") {
            if ("obsidian-prism" in parsed.plugins) { delete parsed.plugins["obsidian-prism"]; changed = true; }
            if ("antigravity-prism" in parsed.plugins) { delete parsed.plugins["antigravity-prism"]; changed = true; }
          }
          if (parsed.sidecars && typeof parsed.sidecars === "object" && "obsidian-prism/daemon" in parsed.sidecars) {
            delete parsed.sidecars["obsidian-prism/daemon"];
            changed = true;
          }
          if (changed) {
            atomicWriteFileSync(hostConfigPath, JSON.stringify(parsed, null, 2) + "\n", {
              encoding: "utf8",
              mode: 0o600,
            });
          }
        }
      }
    }
    const cachePath = path.join(configDir, "obsidian-prism-thought-cache.json");
    const cacheStat = assertNotSymbolicLink(cachePath, "thought cache file");
    if (cacheStat && cacheStat.isFile()) {
      try { fs.unlinkSync(cachePath); } catch {}
    }
    return true;
  } catch {
    return false;
  }
}

const ROOT_FILES_TO_SYNC = SYNC_ROOT_FILES;

const MACOS_LAUNCHER_APP_NAME = "Antigravity Prism.app";
const MACOS_LAUNCHER_BUNDLE_ID = "io.github.rmvdesi.obsidian-prism.launcher";
const MACOS_LAUNCHER_MARKER_REL = path.join("Contents", "Resources", ".obsidian-prism-launcher");

function escapeXmlText(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function shellSingleQuote(str) {
  return "'" + String(str || "").replace(/'/g, "'\\''") + "'";
}

function normalizeMacosSystemRootPrefix(rawPath) {
  const trimmed = String(rawPath || "").trim();
  if (!trimmed) return "";
  let resolved = path.resolve(trimmed);
  if (process.platform === "darwin") {
    if (resolved === "/tmp") return "/private/tmp";
    if (resolved.startsWith("/tmp/")) return "/private" + resolved;
    if (resolved === "/var") return "/private/var";
    if (resolved.startsWith("/var/")) return "/private" + resolved;
  }
  return resolved;
}

function resolveLauncherChainStopRoot(dirPath, explicitStopRoot = null) {
  if (explicitStopRoot) return normalizeMacosSystemRootPrefix(explicitStopRoot);
  const norm = normalizeMacosSystemRootPrefix(dirPath);
  const home = normalizeMacosSystemRootPrefix(os.homedir());
  const tmp = normalizeMacosSystemRootPrefix(os.tmpdir());
  const cmp = (p) => (process.platform === "win32" ? p.toLowerCase() : p);
  const nCmp = cmp(norm);
  for (const cand of [home, tmp, "/private/tmp", "/private/var", "/Applications"].filter(Boolean)) {
    const cCmp = cmp(cand);
    const pfx = cCmp.endsWith(path.sep) ? cCmp : cCmp + path.sep;
    if (nCmp === cCmp || nCmp.startsWith(pfx)) {
      return cand;
    }
  }
  return path.parse(norm).root;
}

function assertNoSymbolicLinkInChain(targetPath, stopRoot = null, label = "path") {
  const normTarget = normalizeMacosSystemRootPrefix(targetPath);
  const normStop = resolveLauncherChainStopRoot(normTarget, stopRoot);
  if (!normTarget || !normStop) {
    throw new Error(`Refusing empty ${label}`);
  }
  const cmp = (p) => (process.platform === "win32" ? p.toLowerCase() : p);
  const stopCmp = cmp(normStop);
  let cur = normTarget;
  let reachedStop = false;
  for (let depth = 0; depth < 64; depth++) {
    try {
      const st = fs.lstatSync(cur);
      if (st.isSymbolicLink()) {
        throw new Error(`Refusing symbolic link in ${label} chain: ${cur}`);
      }
    } catch (err) {
      if (!err || err.code !== "ENOENT") {
        throw err;
      }
    }
    if (cmp(cur) === stopCmp) {
      reachedStop = true;
      break;
    }
    const parent = path.dirname(cur);
    if (!parent || parent === cur) break;
    cur = parent;
  }
  if (!reachedStop) {
    throw new Error(`Refusing unverified ${label} chain outside stop root: ${targetPath}`);
  }
}

function getDefaultMacosLauncherDir(opts = {}) {
  if (typeof opts.launcherDir === "string" && opts.launcherDir.trim()) {
    return path.resolve(opts.launcherDir.trim());
  }
  if (typeof process.env.AG_PRISM_LAUNCHER_DIR === "string" && process.env.AG_PRISM_LAUNCHER_DIR.trim()) {
    return path.resolve(process.env.AG_PRISM_LAUNCHER_DIR.trim());
  }
  return path.join(os.homedir(), "Applications");
}

function getMacosLauncherAppPath(opts = {}) {
  return path.join(getDefaultMacosLauncherDir(opts), MACOS_LAUNCHER_APP_NAME);
}

function normalizeMacosAntigravityAppPath(rawPath) {
  const fallback = "/Applications/Antigravity.app";
  const trimmed = String(rawPath || "").trim().replace(/^["']+|["']+$/g, "");
  if (!trimmed) return fallback;
  const posixClean = trimmed.replace(/\\/g, "/").replace(/\/+$/, "");
  const lower = posixClean.toLowerCase();
  const contentsIdx = lower.indexOf(".app/contents/");
  let normalized = posixClean;
  if (contentsIdx !== -1) {
    normalized = posixClean.slice(0, contentsIdx + 4);
  } else {
    const slashIdx = lower.indexOf(".app/");
    if (slashIdx !== -1) {
      normalized = posixClean.slice(0, slashIdx + 4);
    }
  }
  return normalized.toLowerCase().endsWith(".app") ? normalized : fallback;
}

function generateMacosLauncherInfoPlist(version = "1.0.8-beta.3") {
  const safeShort = escapeXmlText(version || "1.0.8-beta.3");
  const numericMatch = String(version || "1.0.8-beta.3").match(/^\d+(?:\.\d+){0,2}/);
  const safeBundleVer = escapeXmlText(numericMatch ? numericMatch[0] : "1.0.8");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleDisplayName</key>
  <string>Antigravity Prism</string>
  <key>CFBundleExecutable</key>
  <string>launch</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>CFBundleIdentifier</key>
  <string>${escapeXmlText(MACOS_LAUNCHER_BUNDLE_ID)}</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>Antigravity Prism</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>${safeShort}</string>
  <key>CFBundleSignature</key>
  <string>????</string>
  <key>CFBundleVersion</key>
  <string>${safeBundleVer}</string>
  <key>LSMinimumSystemVersion</key>
  <string>12.0</string>
  <key>LSUIElement</key>
  <false/>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
`;
}

function generateMacosLauncherScript(targetApp = "/Applications/Antigravity.app") {
  const normalizedTarget = normalizeMacosAntigravityAppPath(targetApp);
  const quotedTarget = shellSingleQuote(normalizedTarget);
  return [
    "#!/bin/sh",
    "set -eu",
    "",
    "# Obsidian Prism lossless wrapper launcher (never modifies Antigravity.app)",
    `PREFERRED_APP=${quotedTarget}`,
    "",
    "resolve_target_app() {",
    '  if [ -n "$PREFERRED_APP" ] && [ -d "$PREFERRED_APP" ]; then',
    "    printf '%s\\n' \"$PREFERRED_APP\"",
    "    return 0",
    "  fi",
    '  if [ -d "/Applications/Antigravity.app" ]; then',
    "    printf '%s\\n' \"/Applications/Antigravity.app\"",
    "    return 0",
    "  fi",
    '  if [ -d "$HOME/Applications/Antigravity.app" ]; then',
    "    printf '%s\\n' \"$HOME/Applications/Antigravity.app\"",
    "    return 0",
    "  fi",
    "  return 1",
    "}",
    "",
    'TARGET_APP="$(resolve_target_app || true)"',
    'if [ -z "$TARGET_APP" ]; then',
    "  NOT_FOUND_MSG=\"$(printf 'Antigravity.app was not found in /Applications or ~/Applications.\\n\\n未在 /Applications 或 ~/Applications 中找到 Antigravity.app。')\"",
    '  /usr/bin/osascript - "$NOT_FOUND_MSG" <<\'APPLESCRIPT\' >/dev/null 2>&1 || true',
    "on run argv",
    '  display dialog (item 1 of argv) with title "Antigravity Prism" buttons {"OK"} default button "OK"',
    "end run",
    "APPLESCRIPT",
    "  exit 1",
    "fi",
    "",
    "unset ELECTRON_RUN_AS_NODE",
    "",
    "detect_host_state() {",
    '  /bin/ps -ax -o pid=,command= | /usr/bin/awk -v app="$TARGET_APP" \'',
    "    BEGIN {",
    "      app_low = tolower(app)",
    '      main_pfx = app_low "/contents/macos/antigravity"',
    "      cdp_pid = 0",
    "      bare_pid = 0",
    "    }",
    "    {",
    "      pid = $1",
    "      cmd = $0",
    '      sub(/^[[:space:]]*[0-9]+[[:space:]]+/, "", cmd)',
    "      low = tolower(cmd)",
    '      if (index(low, "--type=") > 0 || index(low, "sidecar_sdk") > 0 || index(low, "main.mjs") > 0 || index(low, "watch.js") > 0) next',
    "      pos = index(low, main_pfx)",
    "      if (pos == 0) next",
    "      after = substr(low, pos + length(main_pfx), 1)",
    '      if (after != "" && after != " " && after != "\\t" && after != "\\"") next',
    '      if (index(low, "--remote-debugging-port") > 0) {',
    "        if (cdp_pid == 0) cdp_pid = pid",
    "      } else {",
    "        if (bare_pid == 0) bare_pid = pid",
    "      }",
    "    }",
    "    END {",
    '      if (cdp_pid > 0) printf "cdp %s\\n", cdp_pid',
    '      else if (bare_pid > 0) printf "bare %s\\n", bare_pid',
    '      else printf "none 0\\n"',
    "    }",
    "  '",
    "}",
    "",
    "list_family_pids() {",
    '  /bin/ps -ax -o pid=,command= | /usr/bin/awk -v app="$TARGET_APP" \'',
    "    BEGIN {",
    "      app_low = tolower(app)",
    '      macos_pfx = app_low "/contents/macos/"',
    '      fw_pfx = app_low "/contents/frameworks/"',
    "    }",
    "    {",
    "      pid = $1",
    "      cmd = $0",
    '      sub(/^[[:space:]]*[0-9]+[[:space:]]+/, "", cmd)',
    "      low = tolower(cmd)",
    '      if (index(low, "sidecars/daemon/main.mjs") > 0 || index(low, "/daemon/main.mjs") > 0 || index(low, "sidecar_sdk") > 0 || index(low, "obsidian-prism") > 0 || index(low, "antigravity-prism") > 0 || index(low, "agy-claude-style") > 0 || index(low, "/watch.js") > 0) next',
    "      if (index(low, macos_pfx) > 0 || index(low, fw_pfx) > 0) print pid",
    "    }",
    "  '",
    "}",
    "",
    "is_singleton_lock_held() {",
    '  LOCK_PATH="$HOME/Library/Application Support/Antigravity/SingletonLock"',
    '  if [ -L "$LOCK_PATH" ]; then',
    '    LINK_DEST="$(/usr/bin/readlink "$LOCK_PATH" 2>/dev/null || true)"',
    '    LOCK_PID="${LINK_DEST##*-}"',
    '    case "$LOCK_PID" in',
    "      ''|*[!0-9]*) return 0 ;;",
    '      *) /bin/kill -0 "$LOCK_PID" 2>/dev/null && return 0 || return 1 ;;',
    "    esac",
    "  fi",
    '  [ -e "$LOCK_PATH" ]',
    "}",
    "",
    "STATE_LINE=\"$(detect_host_state || printf 'none 0')\"",
    'HOST_STATE="${STATE_LINE%% *}"',
    'HOST_PID="${STATE_LINE#* }"',
    "",
    'if [ "$HOST_STATE" = "cdp" ]; then',
    '  exec /usr/bin/open -a "$TARGET_APP"',
    "fi",
    "",
    'if [ "$HOST_STATE" = "bare" ]; then',
    '  LOCALE_HINT="${AG_PRISM_LANG:-${LC_ALL:-${LANG:-}}}"',
    '  if [ -z "$LOCALE_HINT" ]; then',
    "    LOCALE_HINT=\"$(/usr/bin/defaults read -g AppleLanguages 2>/dev/null | /usr/bin/head -n 3 | /usr/bin/tr '\\n' ' ' || true)\"",
    "  fi",
    '  case "$LOCALE_HINT" in',
    "    *zh*|*ZH*|*cn*|*CN*)",
    '      PROMPT_BTN="立即重启并开启"',
    '      KEEP_BTN="保持现状"',
    '      PROMPT_TITLE="Antigravity Prism"',
    "      PROMPT_MSG=\"$(printf '检测到 Antigravity 当前正在运行，但未开启光学桥接端口（--remote-debugging-port=0）。\\n\\n是否温和重启 Antigravity 以激活 Obsidian Prism？')\"",
    "      ;;",
    "    *)",
    '      PROMPT_BTN="Relaunch with Prism"',
    '      KEEP_BTN="Keep Running"',
    '      PROMPT_TITLE="Antigravity Prism"',
    "      PROMPT_MSG=\"$(printf 'Antigravity is currently running without --remote-debugging-port=0.\\n\\nGracefully relaunch Antigravity now to enable Obsidian Prism?')\"",
    "      ;;",
    "  esac",
    '  USER_CHOICE="$(/usr/bin/osascript - "$PROMPT_MSG" "$PROMPT_TITLE" "$KEEP_BTN" "$PROMPT_BTN" <<\'APPLESCRIPT\' 2>/dev/null || true',
    "on run argv",
    "  set msgText to item 1 of argv",
    "  set titleText to item 2 of argv",
    "  set keepBtn to item 3 of argv",
    "  set relaunchBtn to item 4 of argv",
    "  set res to display dialog msgText with title titleText buttons {keepBtn, relaunchBtn} default button relaunchBtn",
    "  return button returned of res",
    "end run",
    "APPLESCRIPT",
    ')"',
    '  if [ "$USER_CHOICE" != "$PROMPT_BTN" ]; then',
    '    exec /usr/bin/open -a "$TARGET_APP"',
    "  fi",
    "",
    '  APP_BASE="$(/usr/bin/basename "$TARGET_APP")"',
    '  if [ "$TARGET_APP" = "/Applications/Antigravity.app" ] || [ "$APP_BASE" = "Antigravity.app" ]; then',
    '    /usr/bin/osascript -e \'tell application "Antigravity" to quit\' >/dev/null 2>&1 || /bin/kill -TERM "$HOST_PID" 2>/dev/null || true',
    "  else",
    '    /usr/bin/osascript - "$TARGET_APP" <<\'APPLESCRIPT\' >/dev/null 2>&1 || /bin/kill -TERM "$HOST_PID" 2>/dev/null || true',
    "on run argv",
    "  tell application (POSIX file (item 1 of argv) as text) to quit",
    "end run",
    "APPLESCRIPT",
    "  fi",
    "",
    "  WAIT_COUNT=0",
    '  while [ "$WAIT_COUNT" -lt 80 ]; do',
    '    ALIVE_PIDS="$(list_family_pids || true)"',
    '    if [ -z "$ALIVE_PIDS" ] && ! is_singleton_lock_held; then',
    "      break",
    "    fi",
    "    /bin/sleep 0.12",
    "    WAIT_COUNT=$((WAIT_COUNT + 1))",
    "  done",
    "",
    '  ALIVE_PIDS="$(list_family_pids || true)"',
    '  if [ -n "$ALIVE_PIDS" ]; then',
    "    for P in $ALIVE_PIDS; do",
    '      /bin/kill -TERM "$P" 2>/dev/null || true',
    "    done",
    "    HARD_COUNT=0",
    '    while [ "$HARD_COUNT" -lt 40 ]; do',
    '      ALIVE_PIDS="$(list_family_pids || true)"',
    '      if [ -z "$ALIVE_PIDS" ] && ! is_singleton_lock_held; then',
    "        break",
    "      fi",
    "      /bin/sleep 0.1",
    "      HARD_COUNT=$((HARD_COUNT + 1))",
    "    done",
    "  fi",
    "  /bin/sleep 0.5",
    "fi",
    "",
    'exec /usr/bin/open -na "$TARGET_APP" --args --remote-debugging-port=0',
    "",
  ].join("\n");
}

function isManagedMacosLauncherBundle(appPath) {
  if (!appPath) return false;
  try {
    const appStat = fs.lstatSync(appPath);
    if (appStat.isSymbolicLink() || !appStat.isDirectory()) return false;
    const contentsDir = path.join(appPath, "Contents");
    const contentsStat = fs.lstatSync(contentsDir);
    if (contentsStat.isSymbolicLink() || !contentsStat.isDirectory()) return false;

    const resourcesDir = path.join(contentsDir, "Resources");
    try {
      const resStat = fs.lstatSync(resourcesDir);
      if (resStat.isSymbolicLink()) return false;
      const markerPath = path.join(appPath, MACOS_LAUNCHER_MARKER_REL);
      const markerStat = fs.lstatSync(markerPath);
      if (!markerStat.isSymbolicLink() && markerStat.isFile()) {
        const parsed = JSON.parse(fs.readFileSync(markerPath, "utf8").replace(/^\uFEFF/, ""));
        if (parsed && typeof parsed === "object" && parsed.managedBy === "obsidian-prism") {
          return true;
        }
      }
    } catch {}

    const plistPath = path.join(contentsDir, "Info.plist");
    try {
      const plistStat = fs.lstatSync(plistPath);
      if (!plistStat.isSymbolicLink() && plistStat.isFile()) {
        const rawPlist = fs.readFileSync(plistPath, "utf8");
        if (
          /<key>\s*CFBundleIdentifier\s*<\/key>\s*<string>\s*io\.github\.rmvdesi\.obsidian-prism\.launcher\s*<\/string>/.test(
            rawPlist
          )
        ) {
          return true;
        }
      }
    } catch {}
    return false;
  } catch {
    return false;
  }
}

function createMacosLosslessLauncher(opts = {}) {
  const plat = opts.platformOverride || process.platform;
  if (plat !== "darwin") {
    return { supported: false, created: false, appPath: null, skippedReason: "non-darwin" };
  }
  const launcherDir = getDefaultMacosLauncherDir(opts);
  const appPath = path.join(launcherDir, MACOS_LAUNCHER_APP_NAME);
  assertNoSymbolicLinkInChain(launcherDir, opts.stopRoot || null, "launcher parent directory");
  const existingAppStat = assertNotSymbolicLink(appPath, "launcher app bundle");
  const existedBefore = Boolean(existingAppStat);
  if (existingAppStat) {
    if (!existingAppStat.isDirectory() || !isManagedMacosLauncherBundle(appPath)) {
      throw new Error(`Refusing to overwrite unmanaged app bundle: ${appPath}`);
    }
  }

  fs.mkdirSync(launcherDir, { recursive: true });
  assertNoSymbolicLinkInChain(launcherDir, opts.stopRoot || null, "launcher parent directory");

  const contentsDir = path.join(appPath, "Contents");
  const macosDir = path.join(contentsDir, "MacOS");
  const resourcesDir = path.join(contentsDir, "Resources");
  for (const dir of [appPath, contentsDir, macosDir, resourcesDir]) {
    assertNotSymbolicLink(dir, "launcher directory");
    fs.mkdirSync(dir, { recursive: true });
    assertNotSymbolicLink(dir, "launcher directory");
  }

  let version = opts.version || "";
  if (!version) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(opts.sourceDir || ROOT_DIR, "package.json"), "utf8"));
      version = pkg?.version || "1.0.8-beta.3";
    } catch {
      version = "1.0.8-beta.3";
    }
  }
  const targetApp = normalizeMacosAntigravityAppPath(opts.targetApp || "/Applications/Antigravity.app");
  const plistPath = path.join(contentsDir, "Info.plist");
  const pkgInfoPath = path.join(contentsDir, "PkgInfo");
  const markerPath = path.join(appPath, MACOS_LAUNCHER_MARKER_REL);
  const launchScriptPath = path.join(macosDir, "launch");

  const markerObj = {
    managedBy: "obsidian-prism",
    bundleIdentifier: MACOS_LAUNCHER_BUNDLE_ID,
    version,
    targetApp,
    createdAt: new Date().toISOString(),
  };

  atomicWriteFileSync(plistPath, generateMacosLauncherInfoPlist(version), { encoding: "utf8", mode: 0o644 });
  atomicWriteFileSync(pkgInfoPath, "APPL????", { encoding: "utf8", mode: 0o644 });
  atomicWriteFileSync(markerPath, JSON.stringify(markerObj, null, 2) + "\n", { encoding: "utf8", mode: 0o644 });
  atomicWriteFileSync(launchScriptPath, generateMacosLauncherScript(targetApp), { encoding: "utf8", mode: 0o755 });

  const iconCandidates = [
    opts.iconPath || null,
    path.join(opts.sourceDir || ROOT_DIR, "Obsidian Prism.app", "Contents", "Resources", "AppIcon.icns"),
  ].filter(Boolean);
  let iconCopied = false;
  for (const iconSrc of iconCandidates) {
    try {
      const iconStat = assertNotSymbolicLink(iconSrc, "launcher icon source");
      if (iconStat && iconStat.isFile()) {
        const iconBuf = fs.readFileSync(iconSrc);
        if (iconBuf.length > 0) {
          atomicWriteFileSync(path.join(resourcesDir, "AppIcon.icns"), iconBuf, { encoding: null, mode: 0o644 });
          iconCopied = true;
          break;
        }
      }
    } catch {}
  }

  return {
    supported: true,
    created: true,
    updated: existedBefore,
    appPath,
    targetApp,
    bundleId: MACOS_LAUNCHER_BUNDLE_ID,
    plistPath,
    markerPath,
    launchScriptPath,
    iconCopied,
  };
}

function removeMacosLosslessLauncher(opts = {}) {
  const plat = opts.platformOverride || process.platform;
  if (plat !== "darwin") {
    return { supported: false, removed: false, refused: false, appPath: null, skippedReason: "non-darwin" };
  }
  const launcherDir = getDefaultMacosLauncherDir(opts);
  const appPath = path.join(launcherDir, MACOS_LAUNCHER_APP_NAME);

  let appStat = null;
  try {
    appStat = fs.lstatSync(appPath);
  } catch (err) {
    if (err && err.code === "ENOENT") {
      return { supported: true, removed: false, refused: false, appPath, skippedReason: "not-found" };
    }
    return { supported: true, removed: false, refused: true, reason: "stat-error", appPath };
  }

  try {
    assertNoSymbolicLinkInChain(launcherDir, opts.stopRoot || null, "launcher parent directory");
  } catch {
    return { supported: true, removed: false, refused: true, reason: "symlink", appPath };
  }
  if (appStat.isSymbolicLink()) {
    return { supported: true, removed: false, refused: true, reason: "symlink", appPath };
  }
  if (!isManagedMacosLauncherBundle(appPath)) {
    return { supported: true, removed: false, refused: true, reason: "unmanaged-bundle", appPath };
  }

  fs.rmSync(appPath, { recursive: true, force: true });
  return {
    supported: true,
    removed: !fs.existsSync(appPath),
    refused: false,
    appPath,
  };
}

const LINUX_LAUNCHER_DESKTOP_NAME = "antigravity-prism.desktop";
const LINUX_LAUNCHER_ICON_NAME = "obsidian-prism.png";

const PNG_CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  return t;
})();

function pngCrc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = PNG_CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const combined = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(pngCrc32(combined), 0);
  return Buffer.concat([len, combined, crcBuf]);
}

function renderPrismIconPng(size = 256) {
  const dim = Math.max(16, Math.min(1024, Number(size) || 256));
  const rgba = Buffer.alloc(dim * dim * 4);
  const half = dim * 0.5;
  const maxR = dim * 0.4;
  for (let y = 0; y < dim; y++) {
    for (let x = 0; x < dim; x++) {
      const idx = (y * dim + x) * 4;
      const dx = (x + 0.5 - half) / maxR;
      const dy = (y + 0.5 - half) / maxR;
      const starMetric = Math.pow(Math.abs(dx), 0.62) + Math.pow(Math.abs(dy), 0.62);
      if (starMetric <= 1.04) {
        const edgeAlpha =
          starMetric <= 0.96
            ? 255
            : Math.max(0, Math.min(255, Math.round(((1.04 - starMetric) / 0.08) * 255)));
        let r, g, b;
        const diamond = Math.abs(dx) + Math.abs(dy);
        if (diamond <= 0.28) {
          r = 248; g = 250; b = 255;
        } else if (dx <= 0 && dy <= 0) {
          r = 66; g = 133; b = 244;
        } else if (dx > 0 && dy <= 0) {
          r = 234; g = 67; b = 53;
        } else if (dx > 0 && dy > 0) {
          r = 251; g = 188; b = 4;
        } else {
          r = 52; g = 168; b = 83;
        }
        rgba[idx] = r;
        rgba[idx + 1] = g;
        rgba[idx + 2] = b;
        rgba[idx + 3] = edgeAlpha;
      }
    }
  }
  const stride = dim * 4 + 1;
  const raw = Buffer.alloc(stride * dim);
  for (let y = 0; y < dim; y++) {
    raw[y * stride] = 0;
    rgba.copy(raw, y * stride + 1, y * dim * 4, (y + 1) * dim * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(dim, 0);
  ihdr.writeUInt32BE(dim, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    makePngChunk("IHDR", ihdr),
    makePngChunk("IDAT", idat),
    makePngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function getDefaultLinuxXdgDataHome(opts = {}) {
  const home = opts.homeDir ? path.resolve(opts.homeDir) : os.homedir();
  const env = opts.env || process.env;
  const hasCustomHome = Boolean(opts.homeDir && path.resolve(opts.homeDir) !== path.resolve(os.homedir()));
  if (!hasCustomHome && env && typeof env.XDG_DATA_HOME === "string" && env.XDG_DATA_HOME.trim()) {
    return path.resolve(env.XDG_DATA_HOME.trim());
  }
  return path.join(home, ".local", "share");
}

function getDefaultLinuxLauncherDir(opts = {}) {
  if (typeof opts.launcherDir === "string" && opts.launcherDir.trim()) {
    return path.resolve(opts.launcherDir.trim());
  }
  if (typeof process.env.AG_PRISM_LAUNCHER_DIR === "string" && process.env.AG_PRISM_LAUNCHER_DIR.trim()) {
    return path.resolve(process.env.AG_PRISM_LAUNCHER_DIR.trim());
  }
  return path.join(getDefaultLinuxXdgDataHome(opts), "applications");
}

function getLinuxLauncherDesktopPath(opts = {}) {
  return path.join(getDefaultLinuxLauncherDir(opts), LINUX_LAUNCHER_DESKTOP_NAME);
}

function getLinuxLauncherIconPath(opts = {}) {
  if (typeof opts.iconDir === "string" && opts.iconDir.trim()) {
    return path.join(path.resolve(opts.iconDir.trim()), LINUX_LAUNCHER_ICON_NAME);
  }
  return path.join(getDefaultLinuxXdgDataHome(opts), "icons", "hicolor", "256x256", "apps", LINUX_LAUNCHER_ICON_NAME);
}

function formatDesktopExecArg(arg) {
  const s = String(arg || "").replace(/[\r\n]+/g, "").trim();
  if (!s) return "antigravity";
  if (/[\s"'`\\$<>~|&;()*?#]/.test(s)) {
    const escaped = s.replace(/([\\"`$])/g, "\\$1");
    return `"${escaped}"`;
  }
  return s;
}

function resolveLinuxLauncherTargetExe(opts = {}) {
  const existsFn = typeof opts.existsSync === "function" ? opts.existsSync : fs.existsSync;
  const explicit = String(opts.targetExe || "").trim();
  if (explicit) return explicit;
  const env = opts.env || process.env;
  if (env && typeof env.APPIMAGE === "string" && env.APPIMAGE.trim()) {
    return env.APPIMAGE.trim();
  }
  const home = opts.homeDir ? path.resolve(opts.homeDir) : os.homedir();
  const candidates = [
    "/usr/share/antigravity/antigravity",
    "/opt/Antigravity/antigravity",
    "/usr/bin/antigravity",
    path.join(home, ".local", "bin", "antigravity"),
  ];
  for (const cand of candidates) {
    try {
      if (existsFn(cand)) return cand;
    } catch {}
  }
  return "antigravity";
}

function generateLinuxLauncherDesktop({ targetExe = "antigravity", iconPath = "obsidian-prism", version = "1.0.8-beta.3" } = {}) {
  const safeIcon = String(iconPath || "obsidian-prism").replace(/[\r\n]+/g, "").trim() || "obsidian-prism";
  const safeVersion = String(version || "1.0.8-beta.3").replace(/[\r\n]+/g, "").trim() || "1.0.8-beta.3";
  const execToken = formatDesktopExecArg(targetExe);
  return [
    "[Desktop Entry]",
    "Version=1.0",
    "Type=Application",
    "Name=Antigravity Prism",
    "GenericName=Antigravity (Obsidian Prism)",
    "Comment=Launch Antigravity with Obsidian Prism optical bridge (--remote-debugging-port=0)",
    `Exec=${execToken} --remote-debugging-port=0 %U`,
    `Icon=${safeIcon}`,
    "Terminal=false",
    "Categories=Development;IDE;",
    "StartupNotify=true",
    "StartupWMClass=antigravity",
    "X-ObsidianPrism-Managed=true",
    `X-ObsidianPrism-Version=${safeVersion}`,
    "",
  ].join("\n");
}

function isManagedLinuxLauncherDesktop(desktopPath) {
  if (!desktopPath) return false;
  try {
    const st = fs.lstatSync(desktopPath);
    if (st.isSymbolicLink() || !st.isFile()) return false;
    const content = fs.readFileSync(desktopPath, "utf8");
    return /^\s*X-ObsidianPrism-Managed\s*=\s*true\s*$/im.test(content);
  } catch {
    return false;
  }
}

function createLinuxLosslessLauncher(opts = {}) {
  const plat = opts.platformOverride || process.platform;
  if (plat !== "linux") {
    return { supported: false, created: false, desktopPath: null, appPath: null, iconPath: null, skippedReason: "non-linux" };
  }
  const appsDir = getDefaultLinuxLauncherDir(opts);
  const desktopPath = path.join(appsDir, LINUX_LAUNCHER_DESKTOP_NAME);
  const iconFilePath = getLinuxLauncherIconPath(opts);
  const iconDir = path.dirname(iconFilePath);
  const stopRoot = opts.stopRoot || opts.homeDir || null;

  assertNoSymbolicLinkInChain(appsDir, stopRoot, "Linux applications directory");
  const existingStat = assertNotSymbolicLink(desktopPath, "Linux launcher .desktop");
  const existedBefore = Boolean(existingStat);
  if (existingStat) {
    if (!existingStat.isFile() || !isManagedLinuxLauncherDesktop(desktopPath)) {
      throw new Error(`Refusing to overwrite unmanaged Linux desktop launcher: ${desktopPath}`);
    }
  }

  let version = opts.version || "";
  if (!version) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(opts.sourceDir || ROOT_DIR, "package.json"), "utf8"));
      version = pkg?.version || "1.0.8-beta.3";
    } catch {
      version = "1.0.8-beta.3";
    }
  }

  let iconWritten = false;
  let iconRef = "obsidian-prism";
  try {
    assertNoSymbolicLinkInChain(iconDir, stopRoot, "Linux icons directory");
    assertNotSymbolicLink(iconFilePath, "Linux launcher icon");
    fs.mkdirSync(iconDir, { recursive: true });
    const iconBuf = Buffer.isBuffer(opts.iconBuffer) ? opts.iconBuffer : renderPrismIconPng(256);
    atomicWriteFileSync(iconFilePath, iconBuf, { encoding: null, mode: 0o644 });
    iconWritten = true;
    iconRef = iconFilePath;
  } catch (err) {
    if (err && /symbolic link/i.test(err.message)) throw err;
  }

  fs.mkdirSync(appsDir, { recursive: true });
  assertNoSymbolicLinkInChain(appsDir, stopRoot, "Linux applications directory");
  const targetExe = resolveLinuxLauncherTargetExe(opts);
  const desktopContent = generateLinuxLauncherDesktop({ targetExe, iconPath: iconRef, version });
  atomicWriteFileSync(desktopPath, desktopContent, { encoding: "utf8", mode: 0o644 });

  return {
    supported: true,
    created: true,
    updated: existedBefore,
    managed: true,
    desktopPath,
    appPath: desktopPath,
    iconPath: iconWritten ? iconFilePath : null,
    iconWritten,
    targetExe,
  };
}

function removeLinuxLosslessLauncher(opts = {}) {
  const plat = opts.platformOverride || process.platform;
  if (plat !== "linux") {
    return { supported: false, removed: false, refused: false, desktopPath: null, appPath: null, skippedReason: "non-linux" };
  }
  const appsDir = getDefaultLinuxLauncherDir(opts);
  const desktopPath = path.join(appsDir, LINUX_LAUNCHER_DESKTOP_NAME);
  const iconFilePath = getLinuxLauncherIconPath(opts);
  const stopRoot = opts.stopRoot || opts.homeDir || null;

  let desktopStat = null;
  try {
    desktopStat = fs.lstatSync(desktopPath);
  } catch (err) {
    if (err && err.code === "ENOENT") {
      return { supported: true, removed: false, refused: false, desktopPath, appPath: desktopPath, skippedReason: "not-found" };
    }
    return { supported: true, removed: false, refused: true, reason: "stat-error", desktopPath, appPath: desktopPath };
  }

  try {
    assertNoSymbolicLinkInChain(appsDir, stopRoot, "Linux applications directory");
  } catch {
    return { supported: true, removed: false, refused: true, reason: "symlink", desktopPath, appPath: desktopPath };
  }
  if (desktopStat.isSymbolicLink()) {
    return { supported: true, removed: false, refused: true, reason: "symlink", desktopPath, appPath: desktopPath };
  }
  if (!isManagedLinuxLauncherDesktop(desktopPath)) {
    return { supported: true, removed: false, refused: true, reason: "unmanaged-desktop", desktopPath, appPath: desktopPath };
  }

  fs.unlinkSync(desktopPath);
  let iconRemoved = false;
  try {
    assertNoSymbolicLinkInChain(path.dirname(iconFilePath), stopRoot, "Linux icons directory");
    if (safeUnlinkNoSymlink(iconFilePath, "Linux launcher icon")) {
      iconRemoved = true;
    }
  } catch {}

  return {
    supported: true,
    removed: !fs.existsSync(desktopPath),
    iconRemoved,
    refused: false,
    desktopPath,
    appPath: desktopPath,
  };
}

const DIRS_TO_SYNC = [
  "assets",
  "vendor",
  "sidecars",
];

function shouldSkipSyncEntry(name) {
  if (name === "__pycache__" || name === ".DS_Store" || name === ".daemon.pid") return true;
  const lower = String(name || "").toLowerCase();
  if (lower.endsWith(".log") || lower.endsWith(".tmp")) return true;
  if (/\.tmp\.[a-z0-9._-]+$/i.test(name)) return true;
  return false;
}

function copyDirRecursiveSync(srcDir, dstDir) {
  const srcStat = assertNotSymbolicLink(srcDir, "source directory");
  if (!srcStat) return 0;
  if (!srcStat.isDirectory()) {
    throw new Error(`Refusing non-directory source: ${srcDir}`);
  }
  assertNotSymbolicLink(dstDir, "destination directory");
  fs.mkdirSync(dstDir, { recursive: true });
  assertNotSymbolicLink(dstDir, "destination directory");
  let copied = 0;
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (shouldSkipSyncEntry(entry.name)) continue;
    const srcPath = path.join(srcDir, entry.name);
    const dstPath = path.join(dstDir, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Refusing symbolic link entry: ${srcPath}`);
    }
    const entryStat = assertNotSymbolicLink(srcPath, "source");
    assertNotSymbolicLink(dstPath, "destination");
    if (entry.isDirectory() || (entryStat && entryStat.isDirectory())) {
      copied += copyDirRecursiveSync(srcPath, dstPath);
    } else if (entry.isFile() || (entryStat && entryStat.isFile())) {
      safeCopyFileNoSymlink(srcPath, dstPath);
      copied += 1;
    }
  }
  return copied;
}

const DAEMON_STOP_POLL_MS = 30;
const DAEMON_STOP_GRACEFUL_TIMEOUT_MS = 800;
const DAEMON_STOP_SIGKILL_WAIT_MS = 200;

// 发送 SIGTERM 后轮询等待守护彻底退出（超时则升级 SIGKILL 再短等），防止退出中临终 flush 复活已清理的缓存文件
async function terminatePidAndWait(pid, opts = {}) {
  const num = Number(pid);
  if (!Number.isInteger(num) || num <= 0 || num === process.pid) {
    return { signaled: false, exited: false, escalated: false };
  }
  const killFn = typeof opts.kill === "function" ? opts.kill : (p, sig) => process.kill(p, sig);
  const aliveFn = typeof opts.isPidAlive === "function" ? opts.isPidAlive : isPidAlive;
  const pollMs = Math.max(5, Number(opts.pollIntervalMs) || DAEMON_STOP_POLL_MS);
  const gracefulTimeoutMs = Math.max(
    0,
    opts.gracefulTimeoutMs !== undefined ? Number(opts.gracefulTimeoutMs) : DAEMON_STOP_GRACEFUL_TIMEOUT_MS
  );
  const killWaitMs = Math.max(
    0,
    opts.killWaitMs !== undefined ? Number(opts.killWaitMs) : DAEMON_STOP_SIGKILL_WAIT_MS
  );

  try {
    killFn(num, "SIGTERM");
  } catch (err) {
    if (err && err.code === "ESRCH") {
      return { signaled: false, exited: true, escalated: false };
    }
    throw err;
  }

  const gracefulDeadline = Date.now() + gracefulTimeoutMs;
  while (aliveFn(num)) {
    if (Date.now() >= gracefulDeadline) break;
    const remaining = gracefulDeadline - Date.now();
    await sleep(Math.min(pollMs, Math.max(1, remaining)));
  }

  if (!aliveFn(num)) {
    return { signaled: true, exited: true, escalated: false };
  }

  let escalated = false;
  try {
    killFn(num, "SIGKILL");
    escalated = true;
  } catch (err) {
    if (err && err.code === "ESRCH") {
      return { signaled: true, exited: true, escalated: false };
    }
  }

  const killDeadline = Date.now() + killWaitMs;
  while (aliveFn(num)) {
    if (Date.now() >= killDeadline) break;
    const remaining = killDeadline - Date.now();
    await sleep(Math.min(pollMs, Math.max(1, remaining)));
  }

  return { signaled: true, exited: !aliveFn(num), escalated };
}

async function stopExistingDaemonInDir(targetDir, opts = {}) {
  if (!targetDir || !fs.existsSync(targetDir)) return null;
  const pidFile = path.join(targetDir, ".daemon.pid");
  if (!fs.existsSync(pidFile)) return null;
  let killedPid = null;
  const aliveFn = typeof opts.isPidAlive === "function" ? opts.isPidAlive : isPidAlive;
  const checkExpected =
    typeof opts.isExpectedDaemonProcess === "function"
      ? opts.isExpectedDaemonProcess
      : (p) => isExpectedDaemonProcess(p, pidFile);
  try {
    const pid = readPidFromLockFile(pidFile);
    if (pid && aliveFn(pid) && checkExpected(pid)) {
      try {
        const res = await terminatePidAndWait(pid, opts);
        if (res.signaled) {
          killedPid = pid;
        }
      } catch {}
    }
  } catch {}
  try {
    clearReadOnlyIfRegularFile(pidFile, ".daemon.pid");
    fs.unlinkSync(pidFile);
  } catch {}
  return killedPid;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function verifyLiveWindowAttach(targetCdp, portOverride = null) {
  const port = portOverride || targetCdp.readPort();
  if (!port) return { cdpPort: null, attachedPages: [] };
  let active;
  try {
    active = await targetCdp.listPages(port);
  } catch {
    return { cdpPort: port, attachedPages: [], unreachable: true };
  }
  const attachedPages = [];
  for (const page of active) {
    let session = null;
    try {
      session = await targetCdp.CdpSession.connect(page.webSocketDebuggerUrl, 2500);
      const state = await session.evaluate(
        `(() => ({
        hasPrism: Boolean(window.__agPrism),
        hasRepoBridge: Boolean(window.__agPrismRepoBridge),
        hasSidebarBridge: Boolean(window.__agPrismSidebarBridge),
        version: document.documentElement?.getAttribute('data-ag-prism') || null,
        hasStyle: Boolean(document.getElementById('ag-prism-css')),
      }))()`,
        false,
        2000
      );
      if (state && state.hasPrism && state.hasStyle) {
        const rawTitle = page.title || page.url || "";
        const safeTitle =
          typeof targetCdp.redactSensitiveUrl === "function"
            ? targetCdp.redactSensitiveUrl(rawTitle)
            : String(rawTitle).replace(/([?&](?:token|auth|signature|key|secret)=)[^&\s#"']+/gi, "$1<REDACTED>");
        attachedPages.push({
          id: page.id,
          title: safeTitle,
          version: state.version,
          hasRepoBridge: state.hasRepoBridge,
          hasSidebarBridge: state.hasSidebarBridge,
        });
      }
    } catch {
    } finally {
      if (session) session.close();
    }
  }
  return { cdpPort: port, attachedPages };
}

async function installPlugin(opts = {}) {
  const sourceDir = path.resolve(opts.sourceDir || ROOT_DIR);
  const targetDir = path.resolve(opts.targetDir || getDefaultPluginTargetDir());
  const startDaemon = opts.startDaemon !== false;
  const cdpPort = opts.cdpPort || null;

  assertNotSymbolicLink(targetDir, "target directory");
  fs.mkdirSync(targetDir, { recursive: true });
  assertNotSymbolicLink(targetDir, "target directory");

  // Migrate config & clean legacy temporary sibling directory `antigravity-prism` if present
  let cleanedLegacyPluginDir = false;
  const legacyDir = opts.cleanLegacySibling !== false ? getLegacyTempPluginDir(targetDir) : null;
  if (legacyDir && !isProtectedUserDataPath(legacyDir)) {
    try {
      const legacyStat = assertNotSymbolicLink(legacyDir, "legacy plugin directory");
      if (legacyStat && legacyStat.isDirectory()) {
        await stopExistingDaemonInDir(legacyDir, opts.daemonStopOpts);
        const legacyCfg = path.join(legacyDir, "config.json");
        const newCfg = path.join(targetDir, "config.json");
        const legacyCfgStat = assertNotSymbolicLink(legacyCfg, "legacy config.json");
        if (legacyCfgStat && legacyCfgStat.isFile() && !fs.existsSync(newCfg)) {
          try {
            const legacyContent = fs.readFileSync(legacyCfg, "utf8");
            atomicWriteFileSync(newCfg, legacyContent, { encoding: "utf8", mode: 0o600 });
          } catch {}
        }
        fs.rmSync(legacyDir, { recursive: true, force: true });
        cleanedLegacyPluginDir = !fs.existsSync(legacyDir);
      }
    } catch {}
  }

  const stoppedOldPid = await stopExistingDaemonInDir(targetDir, opts.daemonStopOpts);

  let copiedFiles = 0;
  const missingOptional = [];
  for (const rel of ROOT_FILES_TO_SYNC) {
    const src = path.join(sourceDir, rel);
    const dst = path.join(targetDir, rel);
    const srcStat = assertNotSymbolicLink(src, "source");
    if (srcStat) {
      safeCopyFileNoSymlink(src, dst);
      copiedFiles += 1;
    } else {
      missingOptional.push(rel);
    }
  }

  for (const dirName of DIRS_TO_SYNC) {
    const srcSub = path.join(sourceDir, dirName);
    const dstSub = path.join(targetDir, dirName);
    copiedFiles += copyDirRecursiveSync(srcSub, dstSub);
  }

  // Record linked Git repository metadata so Sidecar can inspect/pull source repo
  const repoMetaPath = path.join(targetDir, "repo-meta.json");
  assertNotSymbolicLink(repoMetaPath, "repo-meta.json");
  try {
    atomicWriteFileSync(
      repoMetaPath,
      JSON.stringify({ sourceRepoDir: sourceDir, installedAt: new Date().toISOString() }, null, 2) + "\n",
      { encoding: "utf8", mode: 0o600 }
    );
  } catch (err) {
    if (err && /symbolic link/i.test(err.message)) throw err;
  }

  const hostConfigDir = resolveHostGeminiConfigDir(opts.targetDir ? targetDir : null, opts.hostConfigDir || null);
  const targetCfg = path.join(targetDir, "config.json");
  assertNotSymbolicLink(targetCfg, "target config.json");
  let preservedConfig = false;
  let restoredFromBackup = false;
  if (fs.existsSync(targetCfg)) {
    preservedConfig = true;
  } else {
    const backupCfgPath = hostConfigDir ? path.join(hostConfigDir, "obsidian-prism-config.backup.json") : null;
    const backupStat = backupCfgPath ? assertNotSymbolicLink(backupCfgPath, "backup config.json") : null;
    if (backupStat && backupStat.isFile()) {
      try {
        const backupRaw = fs.readFileSync(backupCfgPath, "utf8");
        if (isValidConfigJsonContent(backupRaw)) {
          atomicWriteFileSync(targetCfg, backupRaw, { encoding: "utf8", mode: 0o600 });
          preservedConfig = true;
          restoredFromBackup = true;
        }
      } catch {}
    }
    if (!fs.existsSync(targetCfg)) {
      const srcLocalCfg = path.join(sourceDir, "config.json");
      const srcExampleCfg = path.join(sourceDir, "config.example.json");
      const localCfgStat = assertNotSymbolicLink(srcLocalCfg, "source config.json");
      if (localCfgStat && localCfgStat.isFile()) {
        const cfgContent = fs.readFileSync(srcLocalCfg, "utf8");
        atomicWriteFileSync(targetCfg, cfgContent, { encoding: "utf8", mode: 0o600 });
        copiedFiles += 1;
      } else {
        const exampleCfgStat = assertNotSymbolicLink(srcExampleCfg, "source config.example.json");
        if (exampleCfgStat && exampleCfgStat.isFile()) {
          const cfgContent = fs.readFileSync(srcExampleCfg, "utf8");
          atomicWriteFileSync(targetCfg, cfgContent, { encoding: "utf8", mode: 0o600 });
          copiedFiles += 1;
        }
      }
    }
  }

  // If installing into default host plugin dir and user already configured obsidian-prism-thought.json
  // with no explicit `thoughtTranslate` preference yet, default to 'ai'.
  if (!opts.targetDir && fs.existsSync(targetCfg)) {
    try {
      assertNotSymbolicLink(targetCfg, "target config.json");
      const parsedCfg = JSON.parse(fs.readFileSync(targetCfg, "utf8"));
      if (parsedCfg && typeof parsedCfg === "object" && parsedCfg.thoughtTranslate === undefined) {
        const prismThoughtCfg = path.join(os.homedir(), ".gemini", "config", "obsidian-prism-thought.json");
        if (fs.existsSync(prismThoughtCfg)) {
          parsedCfg.thoughtTranslate = "ai";
          parsedCfg.thoughtTrigger = parsedCfg.thoughtTrigger || "preload";
          atomicWriteFileSync(targetCfg, JSON.stringify(parsedCfg, null, 2) + "\n", {
            encoding: "utf8",
            mode: 0o600,
          });
        }
      }
    } catch {}
  }

  // Ensure ~/.gemini/config/config.json (including 0-byte empty file) registers `obsidian-prism` cleanly
  const registrySynced = syncHostPluginRegistry(hostConfigDir, true);

  const effectivePlatform = opts.platformOverride || process.platform;
  const isDefaultTarget = pathsEqual(targetDir, getDefaultPluginTargetDir(), effectivePlatform);
  const hasExplicitShortcutScope = Boolean(opts.shortcutSearchDirs || opts.shortcutAdapter);
  const shouldSyncShortcuts =
    opts.syncShortcuts !== undefined
      ? Boolean(opts.syncShortcuts)
      : hasExplicitShortcutScope || (isDefaultTarget && !isAutomatedTestRuntime());

  let shortcuts = { supported: false, patched: [], alreadySet: [], skipped: [] };
  if (shouldSyncShortcuts) {
    shortcuts = ensureAntigravityShortcutsCdpFlag({
      pluginDir: targetDir,
      searchDirs: opts.shortcutSearchDirs || null,
      systemDirs: opts.shortcutSystemDirs || null,
      userApplicationsDir: opts.userApplicationsDir || null,
      homeDir: opts.homeDir || null,
      env: opts.env || null,
      shortcutAdapter: opts.shortcutAdapter,
      platformOverride: effectivePlatform,
    });
  }

  let launcher = { supported: effectivePlatform === "darwin" || effectivePlatform === "linux", created: false, appPath: null };
  if (effectivePlatform === "darwin") {
    const shouldCreateMacLauncher =
      opts.createLauncher === false
        ? false
        : opts.createLauncher === true || Boolean(opts.launcherDir)
          ? true
          : isDefaultTarget && !isAutomatedTestRuntime();
    if (shouldCreateMacLauncher) {
      try {
        launcher = createMacosLosslessLauncher({
          sourceDir,
          launcherDir: opts.launcherDir,
          targetApp: opts.targetApp,
          version: opts.version,
          iconPath: opts.iconPath,
          stopRoot: opts.launcherStopRoot,
          platformOverride: effectivePlatform,
        });
      } catch (err) {
        if (opts.strictLauncher) throw err;
        launcher = {
          supported: true,
          created: false,
          appPath: getMacosLauncherAppPath({ launcherDir: opts.launcherDir }),
          error: err && err.message ? err.message : String(err),
        };
      }
    }
  } else if (effectivePlatform === "linux") {
    const envForLinux = opts.env || process.env;
    const isPortableOrNoDesktop =
      Boolean(opts.targetExe) ||
      Boolean(envForLinux && typeof envForLinux.APPIMAGE === "string" && envForLinux.APPIMAGE.trim()) ||
      Number(shortcuts?.matched || 0) === 0;
    const shouldCreateLinuxLauncher =
      opts.createLauncher === false
        ? false
        : opts.createLauncher === true || Boolean(opts.launcherDir) || Boolean(opts.targetExe)
          ? true
          : isDefaultTarget && !isAutomatedTestRuntime() && isPortableOrNoDesktop;
    if (shouldCreateLinuxLauncher) {
      try {
        launcher = createLinuxLosslessLauncher({
          sourceDir,
          launcherDir: opts.launcherDir,
          iconDir: opts.iconDir,
          homeDir: opts.homeDir,
          env: opts.env,
          targetExe: opts.targetExe,
          version: opts.version,
          stopRoot: opts.launcherStopRoot,
          platformOverride: effectivePlatform,
        });
      } catch (err) {
        if (opts.strictLauncher) throw err;
        const dp = getLinuxLauncherDesktopPath({ launcherDir: opts.launcherDir, homeDir: opts.homeDir, env: opts.env });
        launcher = {
          supported: true,
          created: false,
          desktopPath: dp,
          appPath: dp,
          error: err && err.message ? err.message : String(err),
        };
      }
    }
  }

  // 默认开启 --defer-relaunch-prompt：若当前本机宿主已裸启运行，预先记入 .relaunch-prompt-state.json 避免弹窗打断正在进行的会话
  const deferRelaunchPrompt = opts.deferRelaunchPrompt !== false;
  let deferredRelaunchHost = null;
  if (deferRelaunchPrompt && !cdpPort && (typeof opts.hostProbe === "function" || (isDefaultTarget && !isAutomatedTestRuntime()))) {
    try {
      const targetCdpEarly = require(path.join(targetDir, "cdp.js"));
      let activePortNow = null;
      if (opts.portFile) {
        try {
          const text = fs.readFileSync(opts.portFile, "utf8");
          const parsed = parseInt(text.split(/\r?\n/)[0].trim(), 10);
          activePortNow = Number.isInteger(parsed) && parsed > 0 ? parsed : null;
        } catch {
          activePortNow = null;
        }
      } else {
        activePortNow = targetCdpEarly.readPort();
      }
      if (!activePortNow) {
        const runningHost = detectRunningAntigravityHostSync({ probeProcesses: opts.hostProbe });
        if (runningHost && runningHost.pid && !runningHost.hasDebugPortSwitch) {
          recordRelaunchPromptState(
            targetDir,
            runningHost.pid,
            runningHost.startMs || 0,
            "deferred",
            opts.stateExtraDirs || []
          );
          deferredRelaunchHost = {
            pid: runningHost.pid,
            startMs: runningHost.startMs || 0,
          };
        }
      }
    } catch {}
  }

  let daemonInfo = { started: false, pid: null, method: null, pidVerified: false };
  let liveCheck = { cdpPort: null, attachedPages: [] };

  if (startDaemon) {
    const daemonScript = path.join(targetDir, "sidecars", "daemon", "main.mjs");
    const daemonArgs = [daemonScript, "--root", targetDir, "--repo", sourceDir];
    if (cdpPort) daemonArgs.push("--port", String(cdpPort));

    const spawnRes = spawnBreakawayNodeProcess(daemonArgs, {
      cwd: path.dirname(daemonScript),
    });

    const pidFile = path.join(targetDir, ".daemon.pid");
    let verifiedPid = spawnRes.pid;
    let pidVerified = false;

    for (let i = 0; i < 20; i++) {
      if (fs.existsSync(pidFile)) {
        try {
          const info = JSON.parse(fs.readFileSync(pidFile, "utf8"));
          if (info && info.pid && isPidAlive(info.pid)) {
            verifiedPid = info.pid;
            pidVerified = true;
            break;
          }
        } catch {}
      }
      await sleep(150);
    }

    daemonInfo = {
      started: Boolean(spawnRes.spawned),
      pid: verifiedPid,
      method: spawnRes.method,
      pidVerified,
      stoppedOldPid,
    };

    try {
      const targetCdp = require(path.join(targetDir, "cdp.js"));
      for (let attempt = 0; attempt < 12; attempt++) {
        liveCheck = await verifyLiveWindowAttach(targetCdp, cdpPort);
        if (!liveCheck.cdpPort || liveCheck.unreachable || liveCheck.attachedPages.length > 0) {
          break;
        }
        await sleep(250);
      }
    } catch {}
  }

  const sidebarStudio = {
    hasService: fs.existsSync(path.join(targetDir, "vendor", "sidebar-studio", "sidebar-service.mjs")),
    hasClient: fs.existsSync(path.join(targetDir, "vendor", "sidebar-studio", "sidebar-client.js")),
  };

  const statusSnap = getPluginInstallStatus({
    targetDir,
    hostProbe: opts.hostProbe,
    watcherDir: opts.watcherDir,
    platformOverride: opts.platformOverride,
    probeHost: typeof opts.hostProbe === "function" || (isDefaultTarget && !isAutomatedTestRuntime()),
    bareAntigravityRunning:
      deferredRelaunchHost && deferredRelaunchHost.pid ? true : undefined,
  });

  const selfCheck = {
    hasThoughtTranslator: statusSnap.hasThoughtTranslator,
    hasWallpaperChannel: statusSnap.hasWallpaperChannel,
    bareAntigravityRunning: statusSnap.bareAntigravityRunning,
    watcherInstalled: statusSnap.watcherInstalled,
    thoughtTranslateMode: statusSnap.thoughtTranslateMode,
    thoughtTranslateDefaultOff: statusSnap.thoughtTranslateMode === "off",
    needsHostRelaunch: Boolean(
      statusSnap.bareAntigravityRunning ||
        (liveCheck && liveCheck.unreachable) ||
        (deferredRelaunchHost && deferredRelaunchHost.pid)
    ),
  };

  return {
    ok: true,
    targetDir,
    cleanedLegacyPluginDir,
    copiedFiles,
    missingOptional,
    preservedConfig,
    restoredFromBackup,
    registrySynced,
    shortcuts,
    launcher,
    deferredRelaunchHost,
    sidebarStudio,
    selfCheck,
    daemon: daemonInfo,
    live: liveCheck,
  };
}

async function uninstallPlugin(opts = {}) {
  const targetDir = path.resolve(opts.targetDir || getDefaultPluginTargetDir());
  const purgeData = opts.purgeData === true;
  if (isProtectedUserDataPath(targetDir)) {
    throw new Error(`Refusing to uninstall protected directory: ${targetDir}`);
  }
  const stoppedPid = await stopExistingDaemonInDir(targetDir, opts.daemonStopOpts);
  const legacyDir = getLegacyTempPluginDir(targetDir);
  if (legacyDir && !isProtectedUserDataPath(legacyDir)) {
    try {
      const legStat = assertNotSymbolicLink(legacyDir, "legacy plugin directory");
      if (legStat && legStat.isDirectory()) {
        await stopExistingDaemonInDir(legacyDir, opts.daemonStopOpts);
      }
    } catch {}
  }
  let removedDomPages = 0;

  if (!opts.noCdp) {
    try {
      const cdpPath = fs.existsSync(path.join(targetDir, "cdp.js"))
        ? path.join(targetDir, "cdp.js")
        : path.join(ROOT_DIR, "cdp.js");
      const cdp = require(cdpPath);
      const port = opts.cdpPort || cdp.readPort();
      if (port) {
        const pages = await cdp.listPages(port).catch(() => []);
        for (const p of pages) {
          let s = null;
          try {
            s = await cdp.CdpSession.connect(p.webSocketDebuggerUrl, 2000);
            await s.evaluate(cdp.REMOVE_EXPRESSION);
            removedDomPages += 1;
          } catch {
          } finally {
            if (s) s.close();
          }
        }
        if (typeof cdp.listSwarmTargets === "function" && cdp.SWARM_I18N_REMOVE_EXPRESSION) {
          const swarmTargets = await cdp.listSwarmTargets(port).catch(() => []);
          for (const st of swarmTargets) {
            let s = null;
            try {
              s = await cdp.CdpSession.connect(st.webSocketDebuggerUrl, 2000);
              await s.evaluate(cdp.SWARM_I18N_REMOVE_EXPRESSION);
            } catch {
            } finally {
              if (s) s.close();
            }
          }
        }
      }
    } catch {}
  }

  const effectivePlatform = opts.platformOverride || process.platform;
  const isDefaultTarget = pathsEqual(targetDir, getDefaultPluginTargetDir(), effectivePlatform);
  const hasExplicitShortcutScope = Boolean(opts.shortcutSearchDirs || opts.shortcutAdapter);
  const shouldSyncShortcuts =
    opts.syncShortcuts !== undefined
      ? Boolean(opts.syncShortcuts)
      : hasExplicitShortcutScope || (isDefaultTarget && !isAutomatedTestRuntime());

  let shortcuts = { supported: false, restored: [], skipped: [] };
  if (shouldSyncShortcuts) {
    shortcuts = restoreAntigravityShortcutsCdpFlag({
      pluginDir: targetDir,
      searchDirs: opts.shortcutSearchDirs || null,
      systemDirs: opts.shortcutSystemDirs || null,
      userApplicationsDir: opts.userApplicationsDir || null,
      homeDir: opts.homeDir || null,
      env: opts.env || null,
      shortcutAdapter: opts.shortcutAdapter,
      platformOverride: effectivePlatform,
    });
  }

  const shouldRemoveLauncher =
    opts.removeLauncher === false
      ? false
      : opts.removeLauncher === true || Boolean(opts.launcherDir)
        ? effectivePlatform === "darwin" || effectivePlatform === "linux"
        : (effectivePlatform === "darwin" || effectivePlatform === "linux") && isDefaultTarget && !isAutomatedTestRuntime();

  let launcher = { supported: effectivePlatform === "darwin" || effectivePlatform === "linux", removed: false, refused: false, appPath: null };
  if (shouldRemoveLauncher) {
    if (effectivePlatform === "darwin") {
      launcher = removeMacosLosslessLauncher({
        launcherDir: opts.launcherDir,
        stopRoot: opts.launcherStopRoot,
        platformOverride: effectivePlatform,
      });
    } else if (effectivePlatform === "linux") {
      launcher = removeLinuxLosslessLauncher({
        launcherDir: opts.launcherDir,
        iconDir: opts.iconDir,
        homeDir: opts.homeDir,
        env: opts.env,
        stopRoot: opts.launcherStopRoot,
        platformOverride: effectivePlatform,
      });
    }
  }

  const hostConfigDir = resolveHostGeminiConfigDir(opts.targetDir ? targetDir : null, opts.hostConfigDir || null);
  let backedUpConfig = null;
  if (!purgeData && hostConfigDir) {
    const targetCfg = path.join(targetDir, "config.json");
    try {
      const cfgStat = assertNotSymbolicLink(targetCfg, "config.json");
      if (cfgStat && cfgStat.isFile()) {
        const rawCfg = fs.readFileSync(targetCfg, "utf8");
        if (isValidConfigJsonContent(rawCfg)) {
          const backupCfgPath = path.join(hostConfigDir, "obsidian-prism-config.backup.json");
          atomicWriteFileSync(backupCfgPath, rawCfg, { encoding: "utf8", mode: 0o600 });
          backedUpConfig = backupCfgPath;
        }
      }
    } catch {}
  }

  syncHostPluginRegistry(hostConfigDir, false);

  if (fs.existsSync(targetDir)) {
    const tStat = assertNotSymbolicLink(targetDir, "target directory");
    if (tStat) {
      fs.rmSync(targetDir, { recursive: true, force: true });
    }
  }

  let cleanedLegacyPluginDir = false;
  if (legacyDir && !isProtectedUserDataPath(legacyDir)) {
    try {
      const legStat = assertNotSymbolicLink(legacyDir, "legacy plugin directory");
      if (legStat && legStat.isDirectory()) {
        fs.rmSync(legacyDir, { recursive: true, force: true });
        cleanedLegacyPluginDir = !fs.existsSync(legacyDir);
      }
    } catch {}
  }

  const purgedPaths = [];
  if (purgeData) {
    if (hostConfigDir) {
      try {
        assertNotSymbolicLink(hostConfigDir, "host config directory");
        const exactFiles = [
          "obsidian-prism-config.backup.json",
          "obsidian-prism-thought.json",
          "obsidian-prism-thought-cache.json",
          "obsidian-prism-usage-rollup-cache.json",
          "obsidian-prism-storage-guard-state.json",
          "obsidian-prism-sidebar.json",
          "obsidian-prism-sidebar.json.lock",
          "obsidian-prism-wallpaper.json",
          "obsidian-prism-suggester.json",
        ];
        for (const name of exactFiles) {
          const fp = path.join(hostConfigDir, name);
          if (safeUnlinkNoSymlink(fp, name)) purgedPaths.push(fp);
        }
        if (fs.existsSync(hostConfigDir)) {
          for (const entry of fs.readdirSync(hostConfigDir, { withFileTypes: true })) {
            if (entry.isSymbolicLink() || !entry.isFile()) continue;
            if (/^obsidian-prism-sidebar\.json\.v1.*\.bak$/i.test(entry.name)) {
              const fp = path.join(hostConfigDir, entry.name);
              if (safeUnlinkNoSymlink(fp, entry.name)) purgedPaths.push(fp);
            }
          }
        }
      } catch {}
    }

    const usageCacheOverride = resolveSafeUsageCacheOverridePath(hostConfigDir, opts.usageCachePath || null);
    if (usageCacheOverride) {
      try {
        if (safeUnlinkNoSymlink(usageCacheOverride, "obsidian-prism-usage-rollup-cache.json")) {
          purgedPaths.push(usageCacheOverride);
        }
      } catch {}
    }

    const telemetryDir = resolveTelemetryDir(hostConfigDir, opts.telemetryDir || null);
    if (telemetryDir && !isProtectedUserDataPath(telemetryDir) && fs.existsSync(telemetryDir)) {
      try {
        const pluginDataDir = path.dirname(telemetryDir);
        const sidecarDataDir = path.dirname(pluginDataDir);
        assertNotSymbolicLink(sidecarDataDir, "sidecar_data directory");
        assertNotSymbolicLink(pluginDataDir, "sidecar_data/obsidian-prism directory");
        const telStat = assertNotSymbolicLink(telemetryDir, "telemetry directory");
        if (telStat && telStat.isDirectory()) {
          fs.rmSync(telemetryDir, { recursive: true, force: true });
          purgedPaths.push(telemetryDir);
        }
      } catch {}
    }
  }

  if (purgeData || opts.purgeAddons === true) {
    const addonsDir = resolveAddonsDir(hostConfigDir, opts.addonsDir || null);
    if (addonsDir && !isProtectedUserDataPath(addonsDir) && fs.existsSync(addonsDir)) {
      try {
        const pluginDataDir = path.dirname(addonsDir);
        const sidecarDataDir = path.dirname(pluginDataDir);
        assertNoSymbolicLinkInChain(addonsDir, null, "addons directory");
        assertNotSymbolicLink(sidecarDataDir, "sidecar_data directory");
        assertNotSymbolicLink(pluginDataDir, "sidecar_data/obsidian-prism directory");
        const addonsStat = assertNotSymbolicLink(addonsDir, "addons directory");
        if (addonsStat && addonsStat.isDirectory()) {
          fs.rmSync(addonsDir, { recursive: true, force: true });
          purgedPaths.push(addonsDir);
        }
      } catch {}
    }
  }

  return {
    ok: true,
    targetDir,
    stoppedPid,
    removedDomPages,
    cleanedLegacyPluginDir,
    shortcuts,
    launcher,
    purgeData,
    backedUpConfig,
    purgedPaths,
  };
}

function isStandaloneWatcherInstalled(opts = {}) {
  const plat = opts.platformOverride || process.platform;
  const customDir = typeof opts.watcherDir === "string" && opts.watcherDir.trim() ? path.resolve(opts.watcherDir.trim()) : null;
  if (plat === "win32") {
    const base =
      customDir ||
      path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "obsidian-prism");
    return fs.existsSync(path.join(base, "obsidian-prism-watcher.exe"));
  }
  if (plat === "darwin") {
    const base =
      customDir ||
      path.join(os.homedir(), "Library", "Application Support", "obsidian-prism");
    return fs.existsSync(path.join(base, "obsidian-prism-watcher"));
  }
  if (plat === "linux") {
    const home = opts.homeDir ? path.resolve(opts.homeDir) : os.homedir();
    const env = opts.env || process.env;
    const hasCustomHome = Boolean(opts.homeDir && path.resolve(opts.homeDir) !== path.resolve(os.homedir()));
    const xdgData =
      !hasCustomHome && env && typeof env.XDG_DATA_HOME === "string" && env.XDG_DATA_HOME.trim()
        ? path.resolve(env.XDG_DATA_HOME.trim())
        : path.join(home, ".local", "share");
    const xdgConfig =
      !hasCustomHome && env && typeof env.XDG_CONFIG_HOME === "string" && env.XDG_CONFIG_HOME.trim()
        ? path.resolve(env.XDG_CONFIG_HOME.trim())
        : path.join(home, ".config");
    const base = customDir || path.join(xdgData, "obsidian-prism");
    if (fs.existsSync(path.join(base, "obsidian-prism-watcher"))) return true;
    if (!customDir && fs.existsSync(path.join(xdgConfig, "systemd", "user", "obsidian-prism.service"))) return true;
    return false;
  }
  return false;
}

function detectBareAntigravityRunningSync(opts = {}) {
  if (opts.bareAntigravityRunning !== undefined) {
    return Boolean(opts.bareAntigravityRunning);
  }
  const allowProbe =
    typeof opts.hostProbe === "function" ||
    opts.probeHost === true ||
    !isAutomatedTestRuntime();
  if (!allowProbe) return false;
  try {
    const runningHost = detectRunningAntigravityHostSync({ probeProcesses: opts.hostProbe });
    return Boolean(runningHost && runningHost.pid && !runningHost.hasDebugPortSwitch);
  } catch {
    return false;
  }
}

function readThoughtTranslateMode(targetDir) {
  try {
    const cfgPath = path.join(targetDir, "config.json");
    if (!fs.existsSync(cfgPath)) return "off";
    const parsed = JSON.parse(fs.readFileSync(cfgPath, "utf8").replace(/^\uFEFF/, ""));
    const raw = typeof parsed?.thoughtTranslate === "string" ? parsed.thoughtTranslate.trim().toLowerCase() : "";
    return raw || "off";
  } catch {
    return "off";
  }
}

function getPluginInstallStatus(opts = {}) {
  const targetDir = path.resolve(opts.targetDir || getDefaultPluginTargetDir());
  const pluginJsonPath = path.join(targetDir, "plugin.json");
  const sidecarJsonPath = path.join(targetDir, "sidecars", "daemon", "sidecar.json");
  const logoPath = path.join(targetDir, "assets", "logo.svg");
  const sidebarServicePath = path.join(targetDir, "vendor", "sidebar-studio", "sidebar-service.mjs");
  const sidebarClientPath = path.join(targetDir, "vendor", "sidebar-studio", "sidebar-client.js");
  const thoughtServicePath = path.join(targetDir, "vendor", "thought-translator", "translator-service.mjs");
  const wallpaperServicePath = path.join(targetDir, "vendor", "wallpaper", "wallpaper-service.mjs");
  const pidFile = path.join(targetDir, ".daemon.pid");

  let daemonPid = null;
  let daemonAlive = false;
  if (fs.existsSync(pidFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(pidFile, "utf8"));
      daemonPid = parsed?.pid || null;
      daemonAlive = Boolean(daemonPid && isPidAlive(daemonPid));
    } catch {}
  }

  const hasThoughtTranslator = fs.existsSync(thoughtServicePath);
  const hasWallpaperChannel = fs.existsSync(wallpaperServicePath);
  const bareAntigravityRunning = detectBareAntigravityRunningSync(opts);
  const watcherInstalled = isStandaloneWatcherInstalled(opts);
  const thoughtTranslateMode = readThoughtTranslateMode(targetDir);

  return {
    installed: fs.existsSync(pluginJsonPath) && fs.existsSync(sidecarJsonPath),
    targetDir,
    hasLogo: fs.existsSync(logoPath),
    hasSidecar: fs.existsSync(sidecarJsonPath),
    hasSidebarService: fs.existsSync(sidebarServicePath),
    hasSidebarClient: fs.existsSync(sidebarClientPath),
    hasThoughtTranslator,
    hasWallpaperChannel,
    bareAntigravityRunning,
    watcherInstalled,
    thoughtTranslateMode,
    daemonPid,
    daemonAlive,
  };
}

function formatInstallSelfCheckSummary(res) {
  const sc = (res && res.selfCheck) || {};
  const daemonAlive = Boolean(res?.daemon?.pidVerified || res?.daemon?.started);
  const patchedCount = Array.isArray(res?.shortcuts?.patched) ? res.shortcuts.patched.length : 0;
  const alreadySetCount = Array.isArray(res?.shortcuts?.alreadySet) ? res.shortcuts.alreadySet.length : 0;
  const skippedCount = Array.isArray(res?.shortcuts?.skipped) ? res.shortcuts.skipped.length : 0;
  const shadowCount = Array.isArray(res?.shortcuts?.shadowCreated) ? res.shortcuts.shadowCreated.length : 0;
  const attachedCount = Array.isArray(res?.live?.attachedPages) ? res.live.attachedPages.length : 0;
  const thoughtMode = sc.thoughtTranslateMode || "off";
  const isLinuxLauncher = Boolean(res?.launcher?.desktopPath);
  const launcherPath = res?.launcher?.desktopPath || res?.launcher?.appPath || null;
  const lines = [
    "",
    "================ Obsidian Prism 安装自检摘要 / Self-Check Summary ================",
    `[中文] 插件目录: ${res?.targetDir || getDefaultPluginTargetDir()}`,
    `[中文] 后台守护: ${daemonAlive ? "运行中 (PID " + (res?.daemon?.pid || "?") + ")" : "未启动"} | 已连接窗口: ${attachedCount} | 思考翻译模块: ${sc.hasThoughtTranslator ? "已就绪" : "缺失"} | 壁纸通道(Ch7): ${sc.hasWallpaperChannel ? "已就绪" : "缺失"} | 独立Watcher: ${sc.watcherInstalled ? "已安装" : "未安装(原生Sidecar/源码模式)"}`,
    `[中文] 快捷方式 --remote-debugging-port=0: 本次新补齐 ${patchedCount} 个，已就绪 ${alreadySetCount} 个${shadowCount > 0 ? `（含 ${shadowCount} 个 XDG 影子覆写，零 root 权限，卸载自动撤回）` : ""}${skippedCount > 0 ? `，权限不足跳过 ${skippedCount} 个（系统目录需管理员权限或安全拦截）` : ""}。`,
    ...(res?.registrySynced === false
      ? ["[中文] 提示: 未能自动写入 ~/.gemini/config/config.json（目标可能为符号链接或只读），请确认 plugins[\"obsidian-prism\"].enabled 为 true。"]
      : []),
    ...(res?.shortcuts?.error
      ? [`[中文] 快捷方式维护提示（非致命）: ${res.shortcuts.error}`]
      : []),
    ...(res?.launcher?.created && launcherPath
      ? [
          isLinuxLauncher
            ? `[中文] Linux 无损桌面启动器已就绪: ${launcherPath}（可从应用菜单一键带参启动，零修改 Antigravity 本体与 app.asar）。`
            : `[中文] macOS 无损启动器已就绪: ${launcherPath}（可拖进 Dock 一键带参启动，零修改 Antigravity.app 本体）。`,
        ]
      : []),
    ...(res?.launcher?.error
      ? [`[中文] ${isLinuxLauncher ? "Linux" : "macOS"} 无损启动器提示（非致命）: ${res.launcher.error}`]
      : []),
    thoughtMode === "off"
      ? "[中文] 提示: 思考过程翻译默认处于关闭态 (off, 0 B 注入)，请打开 Antigravity「设置 -> 外观 -> Obsidian Prism」手动开启「机器翻译」或「AI 流式转译」。"
      : `[中文] 思考过程翻译当前模式: ${thoughtMode}（如翻译异常，可在设置卡片点击「一键诊断」排查）。`,
    sc.bareAntigravityRunning || sc.needsHostRelaunch
      ? "[中文] 重要提醒: 检测到当前 Antigravity 为无调试端口裸启实例（常见于客户端在线更新后），请关闭并通过已修补的桌面/应用菜单快捷方式重新打开 Antigravity 一次即可自动激活！"
      : "[中文] 当前未检测到裸启冲突；随时可运行 `node tools/install-plugin.cjs --status` 复核插件状态。",
    `[EN] Plugin Dir: ${res?.targetDir || getDefaultPluginTargetDir()}`,
    `[EN] Daemon: ${daemonAlive ? "alive (PID " + (res?.daemon?.pid || "?") + ")" : "stopped"} | Attached Windows: ${attachedCount} | ThoughtTranslator: ${sc.hasThoughtTranslator ? "ready" : "missing"} | Wallpaper(Ch7): ${sc.hasWallpaperChannel ? "ready" : "missing"} | Watcher: ${sc.watcherInstalled ? "installed" : "not-installed"}`,
    ...(shadowCount > 0
      ? [`[EN] XDG Shadow Override: created ${shadowCount} user-level override(s) in ~/.local/share/applications (rootless, fully reverted on uninstall).`]
      : []),
    thoughtMode === "off"
      ? "[EN] Note: Thought Translator is OFF by default (0 B injected). Enable Machine or AI streaming mode in Settings -> Appearance -> Obsidian Prism."
      : `[EN] Thought Translator mode: ${thoughtMode} (use the 1-click Diagnose bar in Settings if translation fails).`,
    sc.bareAntigravityRunning || sc.needsHostRelaunch
      ? "[EN] Action Required: Antigravity is currently running bare without --remote-debugging-port=0 (common after an in-app update). Close and relaunch Antigravity once via a patched shortcut or launcher to activate."
      : "[EN] Status healthy. Run `node tools/install-plugin.cjs --status` anytime to verify.",
    ...(res?.launcher?.created && launcherPath
      ? [
          isLinuxLauncher
            ? `[EN] Linux lossless launcher ready: ${launcherPath} (1-click XDG launch without modifying Antigravity or app.asar).`
            : `[EN] macOS lossless launcher ready: ${launcherPath} (pin to Dock for 1-click launch without modifying Antigravity.app).`,
        ]
      : []),
    ...(res?.launcher?.error
      ? [`[EN] ${isLinuxLauncher ? "Linux" : "macOS"} launcher note (non-fatal): ${res.launcher.error}`]
      : []),
    "==================================================================================",
  ];
  return lines.join("\n");
}

function parseCliArgs(argv) {
  const args = argv.slice(2);
  let action = "install";
  let targetDir = null;
  let noDaemon = false;
  let noCdp = false;
  let cdpPort = null;
  let deferRelaunchPrompt = true;
  let noShortcuts = false;
  let purgeData = false;
  let createLauncher = undefined;
  let launcherDir = null;
  let targetExe = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--install") action = "install";
    else if (a === "--uninstall") action = "uninstall";
    else if (a === "--status") action = "status";
    else if (a === "--no-daemon") noDaemon = true;
    else if (a === "--no-cdp") noCdp = true;
    else if (a === "--defer-relaunch-prompt" || a === "--no-relaunch-prompt") deferRelaunchPrompt = true;
    else if (a === "--prompt-relaunch") deferRelaunchPrompt = false;
    else if (a === "--no-shortcuts") noShortcuts = true;
    else if (a === "--purge-data") purgeData = true;
    else if (a === "--create-launcher") createLauncher = true;
    else if (a === "--no-launcher") createLauncher = false;
    else if (a === "--launcher-dir" && args[i + 1]) launcherDir = args[++i];
    else if (a === "--target-exe" && args[i + 1]) targetExe = args[++i];
    else if (a === "--target" && args[i + 1]) targetDir = args[++i];
    else if (a === "--cdp-port" && args[i + 1]) cdpPort = parseInt(args[++i], 10);
  }
  return {
    action,
    targetDir,
    noDaemon,
    noCdp,
    cdpPort,
    deferRelaunchPrompt,
    noShortcuts,
    purgeData,
    createLauncher,
    launcherDir,
    targetExe,
  };
}

if (require.main === module) {
  const cli = parseCliArgs(process.argv);
  (async () => {
    if (cli.action === "status") {
      console.log(JSON.stringify(getPluginInstallStatus({ targetDir: cli.targetDir }), null, 2));
      return;
    }
    if (cli.action === "uninstall") {
      const res = await uninstallPlugin({
        targetDir: cli.targetDir,
        noCdp: cli.noCdp,
        cdpPort: cli.cdpPort,
        syncShortcuts: cli.noShortcuts ? false : undefined,
        purgeData: cli.purgeData,
        removeLauncher: cli.createLauncher === false ? false : undefined,
        launcherDir: cli.launcherDir,
      });
      console.log(JSON.stringify(res, null, 2));
      return;
    }
    const res = await installPlugin({
      targetDir: cli.targetDir,
      startDaemon: !cli.noDaemon,
      cdpPort: cli.cdpPort,
      deferRelaunchPrompt: cli.deferRelaunchPrompt,
      syncShortcuts: cli.noShortcuts ? false : undefined,
      createLauncher: cli.createLauncher,
      launcherDir: cli.launcherDir,
      targetExe: cli.targetExe,
    });
    console.log(JSON.stringify(res, null, 2));
    console.error(formatInstallSelfCheckSummary(res));
  })().catch((err) => {
    console.error("[Obsidian Prism InstallPlugin] Error:", err);
    process.exit(1);
  });
}

module.exports = {
  DAEMON_STOP_POLL_MS,
  DAEMON_STOP_GRACEFUL_TIMEOUT_MS,
  DAEMON_STOP_SIGKILL_WAIT_MS,
  MACOS_LAUNCHER_APP_NAME,
  MACOS_LAUNCHER_BUNDLE_ID,
  MACOS_LAUNCHER_MARKER_REL,
  LINUX_LAUNCHER_DESKTOP_NAME,
  LINUX_LAUNCHER_ICON_NAME,
  pathsEqual,
  renderPrismIconPng,
  getDefaultPluginTargetDir,
  getLegacyTempPluginDir,
  resolveHostGeminiConfigDir,
  resolveTelemetryDir,
  resolveAddonsDir,
  isProtectedUserDataPath,
  syncHostPluginRegistry,
  clearReadOnlyIfRegularFile,
  atomicWriteFileSync,
  copyDirRecursiveSync,
  getDefaultMacosLauncherDir,
  getMacosLauncherAppPath,
  normalizeMacosAntigravityAppPath,
  generateMacosLauncherInfoPlist,
  generateMacosLauncherScript,
  isManagedMacosLauncherBundle,
  createMacosLosslessLauncher,
  removeMacosLosslessLauncher,
  getDefaultLinuxLauncherDir,
  getLinuxLauncherDesktopPath,
  getLinuxLauncherIconPath,
  formatDesktopExecArg,
  resolveLinuxLauncherTargetExe,
  generateLinuxLauncherDesktop,
  isManagedLinuxLauncherDesktop,
  createLinuxLosslessLauncher,
  removeLinuxLosslessLauncher,
  installPlugin,
  uninstallPlugin,
  verifyLiveWindowAttach,
  getPluginInstallStatus,
  isStandaloneWatcherInstalled,
  detectBareAntigravityRunningSync,
  formatInstallSelfCheckSummary,
  terminatePidAndWait,
  stopExistingDaemonInDir,
  parseCliArgs,
};

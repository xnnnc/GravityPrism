// Stop watch/daemon processes and remove Obsidian Prism from every open Antigravity window.
// Passing --purge-data additionally removes Prism user configs, caches (including usage rollup cache), and telemetry safely.
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  PID_FILE,
  REMOVE_EXPRESSION,
  SWARM_I18N_REMOVE_EXPRESSION,
  redactSensitiveUrl,
  readPort,
  listPages,
  listSwarmTargets,
  CdpSession,
  readPidFromLockFile,
  isExpectedDaemonProcess,
} = require('./cdp');

const USAGE_ROLLUP_CACHE_FILENAME = 'obsidian-prism-usage-rollup-cache.json';
const REDLINE_DIR_SEGMENTS = new Set([
  'conversations_archive',
  'prism-knowledge-space',
  'antigravity-spark',
]);
const PURGE_EXACT_FILES = [
  'obsidian-prism-config.backup.json',
  'obsidian-prism-thought.json',
  'obsidian-prism-thought-cache.json',
  USAGE_ROLLUP_CACHE_FILENAME,
  'obsidian-prism-sidebar.json',
  'obsidian-prism-sidebar.json.lock',
  'obsidian-prism-wallpaper.json',
  'obsidian-prism-suggester.json',
];

function parseCliArgs(argv = process.argv.slice(2)) {
  let purgeData = false;
  for (const arg of argv) {
    if (arg === '--purge-data') purgeData = true;
  }
  return { purgeData };
}

function normalizeCmpPath(p) {
  const resolved = path.resolve(p);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function isWithinOrEqualDir(targetPath, rootDir) {
  if (!targetPath || !rootDir) return false;
  const t = normalizeCmpPath(targetPath);
  const r = normalizeCmpPath(rootDir);
  if (t === r) return true;
  const prefix = r.endsWith(path.sep) ? r : r + path.sep;
  return t.startsWith(prefix);
}

function hasRedlineSegment(targetPath) {
  const parts = path.resolve(targetPath).split(/[\\/]+/).filter(Boolean);
  return parts.some((seg) => REDLINE_DIR_SEGMENTS.has(seg.toLowerCase()));
}

function hasSymlinkInChain(targetPath, stopRoot) {
  let cur = path.resolve(targetPath);
  const stop = stopRoot ? normalizeCmpPath(stopRoot) : '';
  for (let depth = 0; depth < 64; depth++) {
    try {
      const st = fs.lstatSync(cur);
      if (st.isSymbolicLink()) return true;
    } catch (err) {
      if (err && err.code !== 'ENOENT') return true;
    }
    if (stop && normalizeCmpPath(cur) === stop) break;
    const parent = path.dirname(cur);
    if (!parent || parent === cur) break;
    cur = parent;
  }
  return false;
}

function safeUnlinkNoSymlink(filePath) {
  if (!filePath || hasRedlineSegment(filePath)) return false;
  try {
    const st = fs.lstatSync(filePath);
    if (st.isSymbolicLink() || !st.isFile()) return false;
    fs.unlinkSync(filePath);
    return true;
  } catch {
    return false;
  }
}

function resolveHostConfigDir(opts = {}) {
  const override = opts.hostConfigDir || process.env.AG_PRISM_GEMINI_CONFIG_DIR;
  if (typeof override === 'string' && override.trim()) {
    return path.resolve(override.trim());
  }
  return path.join(os.homedir(), '.gemini', 'config');
}

function resolveSafeUsageCacheOverride(candidate, hostConfigDir, geminiRoot) {
  if (typeof candidate !== 'string' || !candidate.trim()) return null;
  const resolvedFile = path.resolve(candidate.trim());
  if (path.basename(resolvedFile).toLowerCase() !== USAGE_ROLLUP_CACHE_FILENAME) return null;
  const parentDir = path.dirname(resolvedFile);
  if (hasRedlineSegment(resolvedFile)) return null;

  const allowedRoots = [
    hostConfigDir,
    geminiRoot,
    path.join(os.homedir(), '.gemini'),
    os.tmpdir(),
  ].filter(Boolean);

  const matchedRoot = allowedRoots.find((root) => isWithinOrEqualDir(parentDir, root));
  if (!matchedRoot) return null;
  if (hasSymlinkInChain(parentDir, matchedRoot)) return null;
  return resolvedFile;
}

function resolveSafeTelemetryDir(hostConfigDir, geminiRoot, envTelemetryDir) {
  const rawOverride = typeof envTelemetryDir === 'string' ? envTelemetryDir.trim() : '';
  if (rawOverride) {
    const candidate = path.resolve(rawOverride);
    if (hasRedlineSegment(candidate)) return null;
    const allowedRoots = [
      geminiRoot,
      path.join(os.homedir(), '.gemini'),
      os.tmpdir(),
    ].filter(Boolean);
    const matchedRoot = allowedRoots.find(
      (root) => isWithinOrEqualDir(candidate, root) && normalizeCmpPath(candidate) !== normalizeCmpPath(root)
    );
    if (!matchedRoot) return null;
    const segs = candidate.split(/[\\/]+/).filter(Boolean);
    const owned = segs.some((s) => s.toLowerCase() === 'telemetry' || s.toLowerCase() === 'obsidian-prism');
    if (!owned || hasSymlinkInChain(candidate, matchedRoot)) return null;
    return candidate;
  }
  if (!geminiRoot) return null;
  const defaultDir = path.join(geminiRoot, 'antigravity', 'sidecar_data', 'obsidian-prism', 'telemetry');
  if (hasRedlineSegment(defaultDir) || hasSymlinkInChain(defaultDir, geminiRoot)) return null;
  return defaultDir;
}

function resolveSafeAddonsDir(hostConfigDir, geminiRoot, envAddonsDir) {
  const rawOverride = typeof envAddonsDir === 'string' ? envAddonsDir.trim() : '';
  if (rawOverride) {
    const candidate = path.resolve(rawOverride);
    if (hasRedlineSegment(candidate)) return null;
    const allowedRoots = [
      geminiRoot,
      path.join(os.homedir(), '.gemini'),
      os.tmpdir(),
    ].filter(Boolean);
    const matchedRoot = allowedRoots.find(
      (root) => isWithinOrEqualDir(candidate, root) && normalizeCmpPath(candidate) !== normalizeCmpPath(root)
    );
    if (!matchedRoot) return null;
    const segs = candidate.split(/[\\/]+/).filter(Boolean);
    const owned = segs.some((s) => s.toLowerCase() === 'addons' || s.toLowerCase() === 'obsidian-prism');
    if (!owned || hasSymlinkInChain(candidate, matchedRoot)) return null;
    return candidate;
  }
  if (!geminiRoot) return null;
  const defaultDir = path.join(geminiRoot, 'antigravity', 'sidecar_data', 'obsidian-prism', 'addons');
  if (hasRedlineSegment(defaultDir) || hasSymlinkInChain(defaultDir, geminiRoot)) return null;
  return defaultDir;
}

function purgeUserPluginData(opts = {}) {
  // 绝对红线：严禁触碰 conversations_archive、Antigravity-Spark、prism-knowledge-space
  const purgedPaths = [];
  const hostConfigDir = resolveHostConfigDir(opts);
  const geminiRoot = hostConfigDir ? path.dirname(hostConfigDir) : null;

  if (hostConfigDir && !hasRedlineSegment(hostConfigDir) && fs.existsSync(hostConfigDir)) {
    try {
      const dirStat = fs.lstatSync(hostConfigDir);
      if (!dirStat.isSymbolicLink() && dirStat.isDirectory()) {
        for (const name of PURGE_EXACT_FILES) {
          const fp = path.join(hostConfigDir, name);
          if (safeUnlinkNoSymlink(fp)) purgedPaths.push(fp);
        }
        for (const entry of fs.readdirSync(hostConfigDir, { withFileTypes: true })) {
          if (entry.isSymbolicLink() || !entry.isFile()) continue;
          if (/^obsidian-prism-sidebar\.json\.v1.*\.bak$/i.test(entry.name)) {
            const fp = path.join(hostConfigDir, entry.name);
            if (safeUnlinkNoSymlink(fp)) purgedPaths.push(fp);
          }
        }
      }
    } catch {}
  }

  const usageCacheEnv = opts.usageCachePath !== undefined ? opts.usageCachePath : process.env.PRISM_USAGE_CACHE_PATH;
  const safeUsageOverride = resolveSafeUsageCacheOverride(usageCacheEnv, hostConfigDir, geminiRoot);
  if (safeUsageOverride && safeUnlinkNoSymlink(safeUsageOverride)) {
    purgedPaths.push(safeUsageOverride);
  }

  const envTel = opts.telemetryDir !== undefined ? opts.telemetryDir : process.env.AG_PRISM_TELEMETRY_DIR;
  const telemetryDir = resolveSafeTelemetryDir(hostConfigDir, geminiRoot, envTel);
  if (telemetryDir && fs.existsSync(telemetryDir)) {
    try {
      const telStat = fs.lstatSync(telemetryDir);
      if (!telStat.isSymbolicLink() && telStat.isDirectory()) {
        fs.rmSync(telemetryDir, { recursive: true, force: true });
        purgedPaths.push(telemetryDir);
      }
    } catch {}
  }

  const envAddons = opts.addonsDir !== undefined ? opts.addonsDir : process.env.AG_PRISM_ADDONS_DIR;
  const addonsDir = resolveSafeAddonsDir(hostConfigDir, geminiRoot, envAddons);
  if (addonsDir && fs.existsSync(addonsDir)) {
    try {
      const addonsStat = fs.lstatSync(addonsDir);
      if (!addonsStat.isSymbolicLink() && addonsStat.isDirectory()) {
        fs.rmSync(addonsDir, { recursive: true, force: true });
        purgedPaths.push(addonsDir);
      }
    } catch {}
  }

  return purgedPaths;
}

const DAEMON_STOP_POLL_MS = 30;
const DAEMON_STOP_GRACEFUL_TIMEOUT_MS = 800;
const DAEMON_STOP_SIGKILL_WAIT_MS = 200;

function isPidAlive(pid) {
  const num = Number(pid);
  if (!Number.isInteger(num) || num <= 0) return false;
  try {
    process.kill(num, 0);
    return true;
  } catch (err) {
    return Boolean(err && err.code === 'EPERM');
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 发送 SIGTERM 后轮询等待守护彻底退出（超时则升级 SIGKILL 再短等），防止退出中临终 flush 复活已清理的缓存文件
async function terminatePidAndWait(pid, opts = {}) {
  const num = Number(pid);
  if (!Number.isInteger(num) || num <= 0 || num === process.pid) {
    return { signaled: false, exited: false, escalated: false };
  }
  const killFn = typeof opts.kill === 'function' ? opts.kill : (p, sig) => process.kill(p, sig);
  const aliveFn = typeof opts.isPidAlive === 'function' ? opts.isPidAlive : isPidAlive;
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
    killFn(num, 'SIGTERM');
  } catch (err) {
    if (err && err.code === 'ESRCH') {
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
    killFn(num, 'SIGKILL');
    escalated = true;
  } catch (err) {
    if (err && err.code === 'ESRCH') {
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

async function stopPidFile(filePath, label, opts = {}) {
  let stoppedPid = null;
  try {
    if (!fs.existsSync(filePath)) return null;
    const pid = readPidFromLockFile(filePath);
    const checkExpected =
      typeof opts.isExpectedDaemonProcess === 'function'
        ? opts.isExpectedDaemonProcess
        : (p) => isExpectedDaemonProcess(p, filePath);
    if (pid && checkExpected(pid)) {
      try {
        const res = await terminatePidAndWait(pid, opts);
        if (res.signaled) {
          stoppedPid = pid;
          console.log(`[✓] 已停止${label} (PID ${pid})`);
        } else {
          console.log(`[i] ${label}未在运行`);
        }
      } catch {
        console.log(`[i] ${label}未在运行`);
      }
    }
    try {
      fs.unlinkSync(filePath);
    } catch {}
  } catch {}
  return stoppedPid;
}

async function stopWatcher(opts = {}) {
  const watchPidFile = opts.watchPidFile || PID_FILE;
  const daemonPidFile = opts.daemonPidFile || path.join(__dirname, '.daemon.pid');
  const stoppedWatchPid = await stopPidFile(watchPidFile, '守护进程', opts);
  const stoppedDaemonPid = await stopPidFile(daemonPidFile, 'Sidecar 守护进程', opts);
  return { stoppedWatchPid, stoppedDaemonPid };
}

async function main(argv = process.argv.slice(2), opts = {}) {
  const cli = parseCliArgs(argv);
  await stopWatcher(opts);
  const port = opts.noCdp ? null : readPort();
  if (!port) {
    console.log('[i] Antigravity 未运行，无需清理窗口');
  } else {
    let pages = null;
    try {
      pages = await listPages(port);
    } catch {
      console.log(`[i] 端口 ${port} 无响应，无需清理窗口`);
    }
    if (Array.isArray(pages)) {
      for (const page of pages) {
        const session = await CdpSession.connect(page.webSocketDebuggerUrl);
        try {
          const res = await session.evaluate(REMOVE_EXPRESSION);
          const safeTitle = redactSensitiveUrl(page.title || page.url || '');
          console.log(`[✓] 已恢复原生界面: ${safeTitle} (清理节点 ${res?.removed ?? 0})`);
        } finally {
          session.close();
        }
      }
    }
    let swarmTargets = [];
    try {
      swarmTargets = await listSwarmTargets(port);
    } catch {}
    if (Array.isArray(swarmTargets) && swarmTargets.length > 0) {
      for (const target of swarmTargets) {
        let session = null;
        try {
          session = await CdpSession.connect(target.webSocketDebuggerUrl, 2000);
          await session.evaluate(SWARM_I18N_REMOVE_EXPRESSION);
          const safeTitle = redactSensitiveUrl(target.title || target.url || 'Swarm');
          console.log(`[✓] 已恢复原生 Swarm 面板: ${safeTitle}`);
        } catch {
        } finally {
          if (session) session.close();
        }
      }
    }
  }

  if (cli.purgeData) {
    const purged = purgeUserPluginData(opts);
    console.log(`[✓] 已彻底清理用户插件配置与缓存 (${purged.length} 项)`);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`[✗] ${err.message}`);
    process.exit(1);
  });
}

module.exports = {
  USAGE_ROLLUP_CACHE_FILENAME,
  DAEMON_STOP_POLL_MS,
  DAEMON_STOP_GRACEFUL_TIMEOUT_MS,
  DAEMON_STOP_SIGKILL_WAIT_MS,
  parseCliArgs,
  resolveSafeAddonsDir,
  purgeUserPluginData,
  terminatePidAndWait,
  stopPidFile,
  stopWatcher,
  main,
};

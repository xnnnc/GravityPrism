#!/usr/bin/env node
/**
 * Obsidian Prism — Safe Antigravity Conversation Storage Health & Archiver
 *
 * 解决问题：
 *   Antigravity 官方 language_server.exe 启动时会把 ~/.gemini/antigravity/conversations/
 *   下的历史会话 .db（含大量不可见的后台子代理 / Swarm 子会话）加载进内存，长期积累易导致
 *   language_server.exe 开机即占 3~5 GB 内存。
 *
 * 安全红线（零数据丢失原则）：
 *   1. 绝不删除任何 .db 文件 —— 所有归档一律采用「移动备份 + manifest.json 清单」，随时可一键无损还原；
 *   2. 运行时 fail-closed 防锁破坏 —— 移动/还原前及每个会话处理前均复检 language_server 是否运行，
 *      任何检测命令失败/异常一律按“运行中”拒绝移动；
 *   3. 三件套捆绑移动 + 严控回滚异常 —— .db / .db-wal / .db-shm 同进同出，回滚失败显式升级并记录路径；
 *   4. 全路径链拒绝符号链接 + 排他随机临时文件 —— 逐级 lstatSync 拒绝祖先/末级 symlink，所有写盘均
 *      采用不可预测随机名 + O_EXCL ('wx') 排他创建；
 *   5. 唯一不可复用批次目录 + 默认仅归档已结束隐藏子代理 —— 100% 保留全部主对话。
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const GUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const DB_FILE_RE = /^([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\.db(?:-(wal|shm))?$/i;
const BATCH_NAME_RE = /^batch-[0-9T-]+(?:-[a-f0-9]{8})?$/;
const RUNNING_STATUS_RE = /RUNNING|IN_PROGRESS|GENERATING|ACTIVE/i;
const INDEX_FILENAME = '.last-catalog-index.json';
const LAST_ARCHIVE_RESULT_FILENAME = '.last-archive-result.json';
const ACTIVE_ARCHIVE_TASK_FILENAME = '.archive-task-active.json';
export const WARN_TOTAL_MB = 1536;
export const WARN_SUBAGENT_MB = 512;
export const WARN_LS_MEMORY_MB = 4096;
export const AUTO_ARCHIVE_SUBAGENT_MAX_AGE_HOURS = 2;
const DEFAULT_SUBAGENT_MAX_AGE_HOURS = 6;
const DEFAULT_MAIN_MAX_AGE_DAYS = 14;
const DEFAULT_KEEP_RECENT_MAIN = 20;
const MAX_CATALOG_ENTRIES = 8000;
const WIN_HOST_PROCESS_RE = /^(?:language_server[^"]*|antigravity|agy)\.exe$/i;
const WIN_LS_ONLY_PROCESS_RE = /^language_server[^"]*\.exe$/i;
const POSIX_LS_RE = /(?:^|\/)language_server(?:[^\s/]*)?(?:\s|$)/i;
const POSIX_ANTIGRAVITY_APP_RE = /(?:^|\/)Antigravity(?:\s+Helper(?:\s+\([^)]+\))?)?\.app\/Contents\/MacOS\//i;
const POSIX_HOST_ARGV0_RE = /^(?:["']?)(?:\S*\/)?(?:antigravity(?:\.appimage)?|agy)(?:["']?)(?:\s|$)/i;
const POSIX_ELECTRON_APP_RE = /(?:^|\/)antigravity\/resources\/app/i;
const POSIX_SELF_SCRIPT_RE = /(?:^|[\/\s"'])(?:conversation-archive\.mjs|archive-(?:subagents|old-main)\.(?:sh|command)|restore-(?:latest-archive|batch-[0-9T-]+(?:-[a-f0-9]{8})?)\.(?:sh|command))(?:["'\s]|$)/i;

function isRunningTrajectoryStatus(status) {
  if (status === 2 || status === '2' || status === 'CASCADE_RUN_STATUS_2') return true;
  return RUNNING_STATUS_RE.test(String(status || ''));
}

export function getDefaultAntigravityDir(homeDir = os.homedir()) {
  return path.join(homeDir, '.gemini', 'antigravity');
}

export function getDefaultConversationsDir(homeDir = os.homedir()) {
  return path.join(getDefaultAntigravityDir(homeDir), 'conversations');
}

export function getDefaultArchiveDir(homeDir = os.homedir()) {
  return path.join(getDefaultAntigravityDir(homeDir), 'conversations_archive');
}

function isDarwinSystemRootSymlink(curPath) {
  if (process.platform !== 'darwin') return false;
  if (curPath !== '/var' && curPath !== '/tmp') return false;
  try {
    const linkTarget = fs.readlinkSync(curPath);
    if (curPath === '/var') return linkTarget === 'private/var' || linkTarget === '/private/var';
    if (curPath === '/tmp') return linkTarget === 'private/tmp' || linkTarget === '/private/tmp';
  } catch {
    return false;
  }
  return false;
}

async function isDarwinSystemRootSymlinkAsync(curPath) {
  if (process.platform !== 'darwin') return false;
  if (curPath !== '/var' && curPath !== '/tmp') return false;
  try {
    const linkTarget = await fs.promises.readlink(curPath);
    if (curPath === '/var') return linkTarget === 'private/var' || linkTarget === '/private/var';
    if (curPath === '/tmp') return linkTarget === 'private/tmp' || linkTarget === '/private/tmp';
  } catch {
    return false;
  }
  return false;
}

async function assertPathChainNoSymlinksAsync(targetPath, label = 'path') {
  const resolved = path.resolve(targetPath);
  const parsed = path.parse(resolved);
  const rel = resolved.slice(parsed.root.length);
  const parts = rel.split(/[\\/]+/).filter(Boolean);
  let cur = parsed.root;
  let lastStat = null;
  for (let i = 0; i < parts.length; i++) {
    cur = path.join(cur, parts[i]);
    try {
      const st = await fs.promises.lstat(cur);
      if (st.isSymbolicLink()) {
        if (await isDarwinSystemRootSymlinkAsync(cur)) {
          lastStat = await fs.promises.stat(cur);
          continue;
        }
        throw new Error(`Refusing symbolic link in ${label} chain: ${cur}`);
      }
      lastStat = st;
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        lastStat = null;
        break;
      }
      throw err;
    }
  }
  return lastStat;
}

function assertPathChainNoSymlinks(targetPath, label = 'path') {
  const resolved = path.resolve(targetPath);
  const parsed = path.parse(resolved);
  const rel = resolved.slice(parsed.root.length);
  const parts = rel.split(/[\\/]+/).filter(Boolean);
  let cur = parsed.root;
  let lastStat = null;
  for (let i = 0; i < parts.length; i++) {
    cur = path.join(cur, parts[i]);
    try {
      const st = fs.lstatSync(cur);
      if (st.isSymbolicLink()) {
        if (isDarwinSystemRootSymlink(cur)) {
          lastStat = fs.statSync(cur);
          continue;
        }
        throw new Error(`Refusing symbolic link in ${label} chain: ${cur}`);
      }
      lastStat = st;
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        lastStat = null;
        break;
      }
      throw err;
    }
  }
  return lastStat;
}

function ensureSafeDir(dirPath) {
  const resolved = path.resolve(dirPath);
  const st = assertPathChainNoSymlinks(resolved, 'directory');
  if (!st) {
    fs.mkdirSync(resolved, { recursive: true, mode: 0o700 });
    const after = assertPathChainNoSymlinks(resolved, 'directory');
    if (!after || !after.isDirectory()) {
      throw new Error(`Failed to create safe directory: ${resolved}`);
    }
  } else if (!st.isDirectory()) {
    throw new Error(`Expected directory but found non-directory: ${resolved}`);
  }
  return resolved;
}

function createExclusiveBatchDir(archiveRoot, now = Date.now()) {
  const safeRoot = ensureSafeDir(archiveRoot);
  const stamp = new Date(now).toISOString().replace(/[:.]/g, '-').slice(0, 19);
  for (let attempt = 0; attempt < 5; attempt++) {
    const suffix = crypto.randomBytes(4).toString('hex');
    const batchName = `batch-${stamp}-${suffix}`;
    const batchDir = path.join(safeRoot, batchName);
    try {
      fs.mkdirSync(batchDir, { mode: 0o700 });
      assertPathChainNoSymlinks(batchDir, 'batch directory');
      return { batchName, batchDir };
    } catch (err) {
      if (err && err.code === 'EEXIST') continue;
      throw err;
    }
  }
  throw new Error('Unable to allocate unique batch directory');
}

function atomicWriteTextExclusiveSync(filePath, text, mode = 0o600) {
  const resolved = path.resolve(filePath);
  assertPathChainNoSymlinks(resolved, 'target file');
  ensureSafeDir(path.dirname(resolved));
  const tmp = `${resolved}.tmp.${crypto.randomBytes(8).toString('hex')}`;
  let fd = null;
  try {
    fd = fs.openSync(tmp, 'wx', mode);
    fs.writeFileSync(fd, text, { encoding: 'utf8' });
    try { fs.fsyncSync(fd); } catch {}
    fs.closeSync(fd);
    fd = null;
    try { fs.chmodSync(tmp, mode); } catch {}
    fs.renameSync(tmp, resolved);
  } catch (err) {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch {}
    }
    try { fs.unlinkSync(tmp); } catch {}
    throw err;
  }
}

function withArchiveLock(archiveDir, fn) {
  const safeRoot = ensureSafeDir(archiveDir);
  const lockPath = path.join(safeRoot, '.archive.lock');
  assertPathChainNoSymlinks(lockPath, 'archive lock');
  let fd = null;
  try {
    fd = fs.openSync(lockPath, 'wx', 0o600);
    fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }) + '\n', 'utf8');
    try { fs.fsyncSync(fd); } catch {}
    fs.closeSync(fd);
    fd = null;
  } catch (err) {
    if (fd !== null) { try { fs.closeSync(fd); } catch {} }
    if (err && err.code === 'EEXIST') {
      return {
        ok: false,
        code: 'ARCHIVE_LOCKED',
        error: `已有另一个归档/还原进程正在执行（锁文件存在：${lockPath}）。若确认无运行中进程，可手动移除该锁文件后重试。`,
      };
    }
    throw err;
  }
  try {
    return fn();
  } finally {
    try { fs.unlinkSync(lockPath); } catch {}
  }
}

function atomicWriteJsonSync(filePath, data) {
  atomicWriteTextExclusiveSync(filePath, JSON.stringify(data, null, 2) + '\n', 0o600);
}

function safeMoveFileSync(src, dst, { trustedParentDirs = false } = {}) {
  let srcStat;
  if (trustedParentDirs) {
    try {
      srcStat = fs.lstatSync(src);
    } catch (err) {
      if (err && err.code === 'ENOENT') srcStat = null;
      else throw err;
    }
    if (srcStat && srcStat.isSymbolicLink()) {
      throw new Error(`Refusing symbolic link in source file: ${src}`);
    }
  } else {
    srcStat = assertPathChainNoSymlinks(src, 'source file');
  }
  if (!srcStat || !srcStat.isFile()) {
    throw new Error(`Source is not a regular file: ${src}`);
  }

  let dstStat;
  if (trustedParentDirs) {
    try {
      dstStat = fs.lstatSync(dst);
    } catch (err) {
      if (err && err.code === 'ENOENT') dstStat = null;
      else throw err;
    }
    if (dstStat && dstStat.isSymbolicLink()) {
      throw new Error(`Refusing symbolic link in destination file: ${dst}`);
    }
  } else {
    dstStat = assertPathChainNoSymlinks(dst, 'destination file');
  }
  if (dstStat) {
    throw new Error(`Destination already exists: ${dst}`);
  }
  if (!trustedParentDirs) {
    ensureSafeDir(path.dirname(dst));
  }
  try {
    fs.renameSync(src, dst);
  } catch (err) {
    if (err && err.code === 'EXDEV') {
      const tmp = `${dst}.copy.${crypto.randomBytes(8).toString('hex')}`;
      try {
        fs.copyFileSync(src, tmp, fs.constants.COPYFILE_EXCL);
        const copied = fs.lstatSync(tmp);
        if (copied.isSymbolicLink() || !copied.isFile() || copied.size !== srcStat.size) {
          throw new Error(`Cross-device copy verification failed for ${path.basename(src)}`);
        }
        fs.renameSync(tmp, dst);
        fs.unlinkSync(src);
      } catch (copyErr) {
        try { fs.unlinkSync(tmp); } catch {}
        throw copyErr;
      }
      return;
    }
    throw err;
  }
}

const WIN_AGY_ONLY_PROCESS_RE = /^agy\.exe$/i;
const ARCHIVE_TRACE_FILENAME = 'archive-trace.log';
const MAX_ARCHIVE_TRACE_BYTES = 512 * 1024;
const AGY_ACP_SUBCOMMAND_RE = /(?:^|[\\/\s"'])agy(?:\.exe)?["']?\s+acp(?:\s|$)/i;

function getPlatformPathModule(platform = process.platform) {
  return platform === 'win32' ? path.win32 : path.posix;
}

function expandTildePath(p, homeDir, platform = process.platform) {
  const raw = String(p || '').trim();
  if (!raw || !homeDir) return raw;
  const pathMod = getPlatformPathModule(platform);
  if (raw === '~') return homeDir;
  if (raw.startsWith('~/') || (platform === 'win32' && raw.startsWith('~\\'))) {
    return pathMod.join(homeDir, raw.slice(2));
  }
  return raw;
}

function normalizePathForCompare(p, platform = process.platform, homeDir = '') {
  const expanded = expandTildePath(p, homeDir, platform);
  const raw = String(expanded || '').trim();
  if (!raw) return '';
  const pathMod = getPlatformPathModule(platform);
  const preNormalized = platform === 'win32' ? raw.replace(/\//g, '\\') : raw;
  const resolved = pathMod.resolve(preNormalized);
  return platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function extractCliFlagValue(cmdLine, flagName) {
  const s = String(cmdLine || '');
  const escaped = flagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const eqRe = new RegExp(`(?:^|\\s)${escaped}=(?:"([^"]+)"|'([^']+)'|(\\S+))`, 'i');
  const eqMatch = eqRe.exec(s);
  if (eqMatch) return (eqMatch[1] ?? eqMatch[2] ?? eqMatch[3] ?? '').trim();
  const spRe = new RegExp(`(?:^|\\s)${escaped}\\s+(?:"([^"]+)"|'([^']+)'|(\\S+))`, 'i');
  const spMatch = spRe.exec(s);
  if (spMatch) return (spMatch[1] ?? spMatch[2] ?? spMatch[3] ?? '').trim();
  return '';
}

/**
 * 判断命令行是否为第三方工具（如 T3 Code）派生的独立隔离存储区 `agy acp` 进程。
 * 严格 fail-closed：
 *   - 绝不豁免 language_server、Antigravity 桌面主程序或非 `acp` 子命令（如 `agy chat`）；
 *   - 前置校验 `--gemini-dir`：支持 `~` 展开，拒绝默认 `~/.gemini` 与 `~/.gemini/antigravity`；
 *   - 校验 `--app-data-dir`：完整路径（含 `~` 展开）全路径归一化对照默认数据目录，短名拒绝 `antigravity`；
 *   - 命令行缺失、为空或未显式指向独立非默认隔离目录时一律返回 false（按活跃宿主拦截）。
 */
export function isIsolatedExternalAgyCommandLine(
  cmdLine,
  {
    platform = process.platform,
    defaultGeminiDir = path.join(os.homedir(), '.gemini'),
    defaultAppDataDir = '',
    homeDir = '',
  } = {}
) {
  const s = String(cmdLine || '').trim();
  if (!s) return false;
  if (/language_server/i.test(s)) return false;
  if (!AGY_ACP_SUBCOMMAND_RE.test(s)) return false;

  const pathMod = getPlatformPathModule(platform);
  let defaultGem = '';
  let defaultGemAntigravity = '';
  let inferredHome = '';
  try {
    const baseGem = String(defaultGeminiDir || '').trim();
    const resolvedBaseGem = baseGem
      ? pathMod.resolve(platform === 'win32' ? baseGem.replace(/\//g, '\\') : baseGem)
      : '';
    inferredHome =
      String(homeDir || '').trim() ||
      (resolvedBaseGem ? pathMod.dirname(resolvedBaseGem) : os.homedir());
    defaultGem = normalizePathForCompare(baseGem, platform, inferredHome);
    defaultGemAntigravity = baseGem
      ? normalizePathForCompare(pathMod.join(baseGem, 'antigravity'), platform, inferredHome)
      : '';
  } catch {
    return false;
  }

  let hasIsolatedGeminiDir = false;
  const geminiDir = extractCliFlagValue(s, '--gemini-dir');
  if (geminiDir) {
    try {
      const targetGem = normalizePathForCompare(geminiDir, platform, inferredHome);
      if (!targetGem || targetGem === defaultGem || targetGem === defaultGemAntigravity) {
        return false;
      }
      hasIsolatedGeminiDir = true;
    } catch {
      return false;
    }
  }

  let hasIsolatedAppDataDir = false;
  const appDataDir = extractCliFlagValue(s, '--app-data-dir');
  if (appDataDir) {
    if (/[\\/]|^~(?:$|[\\/])/.test(appDataDir)) {
      try {
        const targetAppData = normalizePathForCompare(appDataDir, platform, inferredHome);
        if (!targetAppData) return false;
        const defaultAppDataCandidates = new Set();
        if (defaultGem) defaultAppDataCandidates.add(defaultGem);
        if (defaultGemAntigravity) defaultAppDataCandidates.add(defaultGemAntigravity);
        if (defaultAppDataDir) {
          defaultAppDataCandidates.add(normalizePathForCompare(defaultAppDataDir, platform, inferredHome));
        }
        if (platform === 'win32') {
          if (inferredHome) {
            defaultAppDataCandidates.add(
              normalizePathForCompare(path.win32.join(inferredHome, 'AppData', 'Roaming', 'Antigravity'), 'win32', inferredHome)
            );
            defaultAppDataCandidates.add(
              normalizePathForCompare(path.win32.join(inferredHome, 'AppData', 'Local', 'Antigravity'), 'win32', inferredHome)
            );
          }
          if (process.platform === 'win32') {
            defaultAppDataCandidates.add(
              normalizePathForCompare(path.win32.dirname(getDefaultWindowsAppStoragePath()), 'win32', inferredHome)
            );
          }
        } else if (platform === 'darwin' && inferredHome) {
          defaultAppDataCandidates.add(
            normalizePathForCompare(path.posix.join(inferredHome, 'Library', 'Application Support', 'Antigravity'), 'darwin', inferredHome)
          );
        } else if (inferredHome) {
          defaultAppDataCandidates.add(
            normalizePathForCompare(path.posix.join(inferredHome, '.config', 'Antigravity'), platform, inferredHome)
          );
        }
        if (defaultAppDataCandidates.has(targetAppData)) {
          return false;
        }
        hasIsolatedAppDataDir = true;
      } catch {
        return false;
      }
    } else {
      if (appDataDir.toLowerCase() === 'antigravity') {
        return false;
      }
      hasIsolatedAppDataDir = true;
    }
  }

  return hasIsolatedGeminiDir || hasIsolatedAppDataDir;
}

const WIN_AGY_CMD_CACHE_TTL_MS = 120_000;
const _winAgyCmdCacheByResolver = new WeakMap();

function getWinAgyCmdCache(resolverKey) {
  let cache = _winAgyCmdCacheByResolver.get(resolverKey);
  if (!cache) {
    cache = new Map();
    _winAgyCmdCacheByResolver.set(resolverKey, cache);
  }
  return cache;
}

function pruneWinAgyCmdCache(resolverKey, liveAgyPids = [], now = Date.now()) {
  if (typeof resolverKey !== 'function') return;
  const cache = getWinAgyCmdCache(resolverKey);
  if (cache.size === 0) return;
  const liveSet = new Set(liveAgyPids);
  for (const [pid, entry] of cache.entries()) {
    if (!liveSet.has(pid) || now - entry.at > WIN_AGY_CMD_CACHE_TTL_MS) {
      cache.delete(pid);
    }
  }
}

function resolveWindowsAgyCommandLinesCached(pids, resolver) {
  const validPids = Array.from(new Set(pids.filter((p) => Number.isInteger(p) && p > 0)));
  const map = new Map();
  if (typeof resolver !== 'function') return map;
  if (validPids.length === 0) {
    pruneWinAgyCmdCache(resolver, []);
    return map;
  }
  const now = Date.now();
  pruneWinAgyCmdCache(resolver, validPids, now);
  const cache = getWinAgyCmdCache(resolver);
  const missingPids = [];
  for (const pid of validPids) {
    const hit = cache.get(pid);
    if (hit && typeof hit.cmd === 'string' && hit.cmd) {
      map.set(pid, hit.cmd);
    } else {
      missingPids.push(pid);
    }
  }
  if (missingPids.length === 0) return map;

  const queried = resolver(missingPids);
  const fetchedAt = Date.now();
  for (const pid of missingPids) {
    const cmd = queried instanceof Map ? queried.get(pid) : queried?.[pid];
    if (typeof cmd === 'string' && cmd) {
      map.set(pid, cmd);
      cache.set(pid, { cmd, at: fetchedAt });
    }
  }
  return map;
}

export function parseWindowsTasklistCsvDetailed(
  csvText,
  {
    selfPid = process.pid,
    queryCommandLines = null,
    resolveAgyCommandLines = null,
    onLiveAgyPids = null,
    defaultGeminiDir = path.join(os.homedir(), '.gemini'),
    defaultAppDataDir = '',
  } = {}
) {
  const text = String(csvText || '').trim();
  if (!text) {
    return { running: true, blockers: [{ imageName: '<empty-tasklist>', pid: 0 }], ignoredAcp: [] };
  }
  let parsedCount = 0;
  const hardBlockers = [];
  const agyCandidates = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = /^\s*"([^"]+)"\s*,\s*"(\d+)",/.exec(line);
    if (!m) continue;
    parsedCount++;
    const imageName = m[1];
    const pid = Number(m[2]);
    // 当无全局 node 而以 Antigravity.exe (ELECTRON_RUN_AS_NODE=1) 运行离线归档脚本时，排除自身 PID，绝不排除 language_server
    if (
      Number.isInteger(selfPid) &&
      selfPid > 0 &&
      pid === selfPid &&
      !WIN_LS_ONLY_PROCESS_RE.test(imageName)
    ) {
      continue;
    }
    if (WIN_HOST_PROCESS_RE.test(imageName)) {
      if (WIN_AGY_ONLY_PROCESS_RE.test(imageName)) {
        agyCandidates.push({ imageName, pid });
      } else {
        hardBlockers.push({ imageName, pid });
      }
    }
  }
  // If tasklist returned non-CSV/error text with zero valid process rows -> fail-closed
  if (parsedCount === 0) {
    return { running: true, blockers: [{ imageName: '<invalid-tasklist-csv>', pid: 0 }], ignoredAcp: [] };
  }
  if (typeof onLiveAgyPids === 'function') {
    try { onLiveAgyPids(agyCandidates.map((c) => c.pid)); } catch {}
  }
  if (hardBlockers.length > 0) {
    return { running: true, blockers: hardBlockers, ignoredAcp: [] };
  }
  if (agyCandidates.length === 0) {
    return { running: false, blockers: [], ignoredAcp: [] };
  }
  const cmdResolver =
    typeof queryCommandLines === 'function'
      ? queryCommandLines
      : typeof resolveAgyCommandLines === 'function'
        ? resolveAgyCommandLines
        : null;
  // Windows 默认纯原生 tasklist 只读探针：无外部注入的 queryCommandLines 时对 agy.exe 严格 fail-closed 拦截
  if (!cmdResolver) {
    return { running: true, blockers: agyCandidates, ignoredAcp: [] };
  }
  try {
    const cmdMap = cmdResolver(agyCandidates.map((c) => c.pid));
    const blockers = [];
    const ignoredAcp = [];
    for (const cand of agyCandidates) {
      const cmd = cmdMap instanceof Map ? cmdMap.get(cand.pid) : cmdMap?.[cand.pid];
      if (
        cmd &&
        isIsolatedExternalAgyCommandLine(cmd, {
          platform: 'win32',
          defaultGeminiDir,
          defaultAppDataDir,
        })
      ) {
        ignoredAcp.push({ ...cand, isolatedAcp: true });
      } else {
        blockers.push(cand);
      }
    }
    return { running: blockers.length > 0, blockers, ignoredAcp };
  } catch {
    return { running: true, blockers: agyCandidates, ignoredAcp: [] };
  }
}

export function parseWindowsTasklistCsv(csvText, opts = {}) {
  return parseWindowsTasklistCsvDetailed(csvText, opts).running;
}

export function parsePosixProcessList(
  psText,
  {
    selfPid = process.pid,
    selfPpid = process.ppid,
    platform = process.platform === 'darwin' ? 'darwin' : 'linux',
    defaultGeminiDir = path.join(os.homedir(), '.gemini'),
    defaultAppDataDir = '',
  } = {}
) {
  const text = String(psText || '').trim();
  if (!text) return true; // unexpected empty output -> fail-closed
  let parsedCount = 0;
  for (const rawLine of text.split(/\r?\n/)) {
    const m = /^\s*(\d+)\s+(.+)$/.exec(rawLine);
    if (!m) continue;
    parsedCount++;
    const pid = Number(m[1]);
    const cmd = m[2].trim();
    if (pid === selfPid) continue;
    // Exclude current archiver script or its helper shell wrapper to avoid self-match
    if (
      POSIX_SELF_SCRIPT_RE.test(cmd) &&
      (pid === selfPpid || /^(?:["']?)(?:\S*\/)?(?:node|bash|sh|zsh|env)(?:["']?)(?:\s|$)/i.test(cmd))
    ) {
      continue;
    }
    if (
      POSIX_LS_RE.test(cmd) ||
      POSIX_ANTIGRAVITY_APP_RE.test(cmd) ||
      POSIX_ELECTRON_APP_RE.test(cmd)
    ) {
      return true;
    }
    if (POSIX_HOST_ARGV0_RE.test(cmd)) {
      if (
        isIsolatedExternalAgyCommandLine(cmd, {
          platform,
          defaultGeminiDir,
          defaultAppDataDir,
        })
      ) {
        continue;
      }
      return true;
    }
  }
  return parsedCount === 0;
}

export function inspectLanguageServerProcesses({
  platform = process.platform,
  exec = execFileSync,
  selfPid = process.pid,
  selfPpid = process.ppid,
  queryCommandLines = undefined,
  resolveAgyCommandLines = undefined,
  defaultGeminiDir = path.join(os.homedir(), '.gemini'),
  defaultAppDataDir = '',
} = {}) {
  try {
    if (platform === 'win32') {
      const out = exec(
        'tasklist.exe',
        ['/NH', '/FO', 'CSV'],
        { encoding: 'utf8', windowsHide: true, timeout: 6000, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }
      );
      const injectedResolver =
        typeof queryCommandLines === 'function'
          ? queryCommandLines
          : typeof resolveAgyCommandLines === 'function'
            ? resolveAgyCommandLines
            : null;
      const cachedResolver = injectedResolver
        ? (pids) => resolveWindowsAgyCommandLinesCached(pids, injectedResolver)
        : null;
      const onLiveAgyPids = injectedResolver
        ? (pids) => pruneWinAgyCmdCache(injectedResolver, pids)
        : null;
      return parseWindowsTasklistCsvDetailed(out, {
        selfPid,
        queryCommandLines: cachedResolver,
        onLiveAgyPids,
        defaultGeminiDir,
        defaultAppDataDir,
      });
    }
    const out = exec('ps', ['-ww', '-eo', 'pid=,args='], {
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: 8 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const posixPlatform = platform === 'darwin' ? 'darwin' : 'linux';
    const running = parsePosixProcessList(out, {
      selfPid,
      selfPpid,
      platform: posixPlatform,
      defaultGeminiDir,
      defaultAppDataDir,
    });
    return { running, blockers: running ? [{ imageName: 'posix-host', pid: 0 }] : [], ignoredAcp: [] };
  } catch (err) {
    // Any process query failure (non-zero exit, ENOENT, timeout, ENOBUFS) fails closed (true)
    return {
      running: true,
      blockers: [{ imageName: `<probe-error:${String(err?.code || 'ERR')}>`, pid: 0 }],
      ignoredAcp: [],
    };
  }
}

/**
 * Fail-closed check: returns true if language_server OR Antigravity/agy host is running,
 * or if process detection itself fails/errors/times out.
 * Note: offline CLI tool cannot enforce OS-level host startup mutex across closed-source
 * Antigravity; users must keep Antigravity closed until the archive command finishes.
 */
export function isLanguageServerRunning(opts = {}) {
  return inspectLanguageServerProcesses(opts).running;
}

const LOOP_RUNNING_CHECK_INTERVAL_MS = 500;

/**
 * 为批量文件移动循环构造节流版进程探针：
 *   - 入口已执行过一次无节流 fail-closed 检查；
 *   - 循环内对真实系统探针按 500ms 时间窗节流（避免 100+ 会话触发数百次 tasklist/ps 进程派生风暴），
 *     一旦检测到宿主启动立即锁定为 true，并包含系统时钟回拨保护；
 *   - 对单元测试注入的无标记同步 mock 函数保持逐次调用零节流。
 */
export function createLoopRunningChecker(
  isRunning,
  rawCheckRunning,
  minIntervalMs = LOOP_RUNNING_CHECK_INTERVAL_MS,
  nowFn = Date.now
) {
  const allowThrottle =
    rawCheckRunning === isLanguageServerRunning || Boolean(rawCheckRunning?.__allowLoopThrottle);
  if (!allowThrottle || !(minIntervalMs > 0)) {
    return isRunning;
  }
  let lastCheckedAt = nowFn();
  let latchedRunning = false;
  return () => {
    if (latchedRunning) return true;
    const now = nowFn();
    if (now < lastCheckedAt) lastCheckedAt = 0;
    if (now - lastCheckedAt < minIntervalMs) {
      return false;
    }
    lastCheckedAt = now;
    latchedRunning = Boolean(isRunning());
    return latchedRunning;
  };
}

export function appendArchiveTrace(archiveDir, event, detail = {}) {
  try {
    const safeDir = ensureSafeDir(archiveDir || getDefaultArchiveDir());
    const logPath = path.join(safeDir, ARCHIVE_TRACE_FILENAME);
    assertPathChainNoSymlinks(logPath, 'archive trace log');
    try {
      const st = fs.existsSync(logPath) ? fs.lstatSync(logPath) : null;
      if (st && st.isFile() && st.size > MAX_ARCHIVE_TRACE_BYTES) {
        const raw = fs.readFileSync(logPath, 'utf8');
        const keepChars = Math.floor(MAX_ARCHIVE_TRACE_BYTES / 2);
        const cut = Math.max(0, raw.length - keepChars);
        let tail;
        if (cut > 0 && raw[cut - 1] !== '\n') {
          const nl = raw.indexOf('\n', cut);
          tail = nl >= 0 ? raw.slice(nl + 1) : '';
        } else {
          tail = raw.slice(cut);
        }
        fs.writeFileSync(logPath, tail, { encoding: 'utf8', mode: 0o600 });
        try { fs.chmodSync(logPath, 0o600); } catch {}
      }
    } catch {}
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      pid: process.pid,
      event,
      ...detail,
    }) + '\n';
    fs.appendFileSync(logPath, line, { encoding: 'utf8', mode: 0o600 });
    try { fs.chmodSync(logPath, 0o600); } catch {}
  } catch {}
}

/**
 * 只读解析 Windows tasklist /NH /FO CSV 中 language_server 进程内存占用（严格只读，零跨进程操作）。
 */
export function parseWindowsTasklistMemoryCsv(csvText) {
  const text = String(csvText || '').trim();
  if (!text) return { ok: false, totalMb: 0, processCount: 0, pids: [], processes: [] };
  let parsedRows = 0;
  let totalKb = 0;
  const pids = [];
  const processes = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = /^\s*"([^"]+)"\s*,\s*"(\d+)"\s*,\s*"[^"]*"\s*,\s*"[^"]*"\s*,\s*"([^"]+)"\s*$/.exec(line);
    if (!m) continue;
    parsedRows += 1;
    const imageName = m[1];
    const pid = Number(m[2]);
    if (!WIN_LS_ONLY_PROCESS_RE.test(imageName)) continue;
    const kbDigits = m[3].replace(/[^\d]/g, '');
    const kb = kbDigits ? Number(kbDigits) : 0;
    if (Number.isFinite(kb) && kb > 0) totalKb += kb;
    if (Number.isInteger(pid) && pid > 0) pids.push(pid);
    processes.push({ pid, name: imageName, mb: Number((kb / 1024).toFixed(1)) });
  }
  if (parsedRows === 0) return { ok: false, totalMb: 0, processCount: 0, pids: [], processes: [] };
  return {
    ok: true,
    totalMb: Number((totalKb / 1024).toFixed(1)),
    processCount: processes.length,
    pids,
    processes,
  };
}

/**
 * 只读解析 POSIX ps -eo pid=,rss=,args= 中 language_server 进程常驻内存占用（KB -> MB）。
 */
export function parsePosixPsRss(psText, { selfPid = process.pid, selfPpid = process.ppid } = {}) {
  const text = String(psText || '').trim();
  if (!text) return { ok: false, totalMb: 0, processCount: 0, pids: [], processes: [] };
  let parsedRows = 0;
  let totalKb = 0;
  const pids = [];
  const processes = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const m = /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(rawLine);
    if (!m) continue;
    parsedRows += 1;
    const pid = Number(m[1]);
    const rssKb = Number(m[2]);
    const cmd = m[3].trim();
    if (pid === selfPid) continue;
    if (
      POSIX_SELF_SCRIPT_RE.test(cmd) &&
      (pid === selfPpid || /^(?:["']?)(?:\S*\/)?(?:node|bash|sh|zsh|env)(?:["']?)(?:\s|$)/i.test(cmd))
    ) {
      continue;
    }
    if (!POSIX_LS_RE.test(cmd)) continue;
    if (Number.isFinite(rssKb) && rssKb > 0) totalKb += rssKb;
    if (Number.isInteger(pid) && pid > 0) pids.push(pid);
    processes.push({ pid, name: 'language_server', mb: Number((rssKb / 1024).toFixed(1)) });
  }
  if (parsedRows === 0) return { ok: false, totalMb: 0, processCount: 0, pids: [], processes: [] };
  return {
    ok: true,
    totalMb: Number((totalKb / 1024).toFixed(1)),
    processCount: processes.length,
    pids,
    processes,
  };
}

function defaultExecFileAsync(file, args, options) {
  return new Promise((resolve, reject) => {
    execFile(file, args, options, (err, stdout) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(String(stdout || ''));
    });
  });
}

/**
 * 异步只读探测当前 language_server 进程内存占用（仅通过系统标准进程列表接口只读采集，零跨进程句柄操作，0 Google 风控）。
 */
export async function getLanguageServerMemoryStatsAsync({
  platform = process.platform,
  execAsync = defaultExecFileAsync,
  selfPid = process.pid,
  selfPpid = process.ppid,
} = {}) {
  try {
    if (platform === 'win32') {
      const out = await execAsync('tasklist.exe', ['/NH', '/FO', 'CSV'], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 6000,
        maxBuffer: 8 * 1024 * 1024,
      });
      return parseWindowsTasklistMemoryCsv(out);
    }
    const out = await execAsync('ps', ['-eo', 'pid=,rss=,args='], {
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: 8 * 1024 * 1024,
    });
    return parsePosixPsRss(out, { selfPid, selfPpid });
  } catch {
    return { ok: false, totalMb: 0, processCount: 0, pids: [], processes: [] };
  }
}

function parseSummaryTimeMs(raw) {
  if (raw === null || raw === undefined || raw === '') return 0;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    return raw < 1e11 ? Math.floor(raw * 1000) : Math.floor(raw);
  }
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return 0;
    if (/^\d+(?:\.\d+)?$/.test(s)) {
      const n = Number(s);
      if (!Number.isFinite(n) || n <= 0) return 0;
      return n < 1e11 ? Math.floor(n * 1000) : Math.floor(n);
    }
    const parsed = Date.parse(s);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }
  if (typeof raw === 'object') {
    const sec = Number(raw.seconds ?? raw.sec);
    if (Number.isFinite(sec) && sec > 0) {
      const nanos = Number(raw.nanos || 0);
      return Math.floor(sec * 1000 + (Number.isFinite(nanos) ? nanos / 1e6 : 0));
    }
  }
  return 0;
}

export function extractCatalogIndexFromSummaries(rawSummaries, extraSignals = null) {
  const map = {};
  const protectedMainIds = new Set();
  if (extraSignals && extraSignals.protectedMainIds) {
    const src = extraSignals.protectedMainIds;
    const iter = src instanceof Set || Array.isArray(src) ? src : Object.keys(src);
    for (const raw of iter) {
      const id = String(raw || '').trim().toLowerCase();
      if (GUID_RE.test(id)) protectedMainIds.add(id);
    }
  }
  const chapterTitleIds = new Set();
  if (extraSignals && extraSignals.chapterTitleIds) {
    const src = extraSignals.chapterTitleIds;
    const iter = src instanceof Set || Array.isArray(src) ? src : Object.keys(src);
    for (const raw of iter) {
      const id = String(raw || '').trim().toLowerCase();
      if (GUID_RE.test(id)) chapterTitleIds.add(id);
    }
  }
  const discoveredSubs = new Map();
  if (extraSignals && extraSignals.discoveredSubagents) {
    const rawDisc = extraSignals.discoveredSubagents;
    const pairs =
      rawDisc instanceof Map
        ? [...rawDisc.entries()]
        : Array.isArray(rawDisc)
          ? rawDisc.map((x) => (typeof x === 'string' ? [x, {}] : [x?.id || x?.cascadeId || '', x || {}]))
          : typeof rawDisc === 'object'
            ? Object.entries(rawDisc)
            : [];
    for (const [rawId, info] of pairs) {
      const id = String(rawId || '').trim().toLowerCase();
      if (!GUID_RE.test(id)) continue;
      const pid = String(info?.parentId || info?.parentConversationId || '').trim().toLowerCase();
      discoveredSubs.set(id, {
        ...(GUID_RE.test(pid) && pid !== id ? { parentId: pid } : {}),
        ...(Number(info?.lastModifiedMs) > 0 ? { lastModifiedMs: Number(info.lastModifiedMs) } : {}),
      });
    }
  }

  const entries = Array.isArray(rawSummaries)
    ? rawSummaries.map((s) => [s?.id || s?.cascadeId || '', s])
    : Object.entries(rawSummaries || {});
  for (const [rawId, s] of entries) {
    const id = String(rawId || s?.id || s?.cascadeId || '').trim().toLowerCase();
    if (!GUID_RE.test(id) || !s || typeof s !== 'object') continue;
    const meta = s.trajectoryMetadata && typeof s.trajectoryMetadata === 'object' ? s.trajectoryMetadata : {};
    const rawParentId = String(
      s.parentConversationId ||
        meta.parentConversationId ||
        s.parentId ||
        s.parentCascadeId ||
        meta.parentCascadeId ||
        s.parentTrajectoryId ||
        meta.parentTrajectoryId ||
        ''
    ).trim().toLowerCase();
    const parentId = rawParentId && rawParentId !== id ? rawParentId : '';
    const rawRootId = String(
      s.rootConversationId ||
        meta.rootConversationId ||
        s.rootId ||
        s.rootCascadeId ||
        meta.rootCascadeId ||
        ''
    ).trim().toLowerCase();
    const rootId = rawRootId && rawRootId !== id ? rawRootId : '';
    const swarmId = String(s.swarmId || meta.swarmId || '').trim();
    const subagentName = String(s.subagentName || meta.subagentName || '').trim();
    const selfPoison = Boolean((rawParentId && rawParentId === id) || (!parentId && rawRootId && rawRootId === id));
    const explicitSubagent = Boolean(
      (s.subagent === true && !selfPoison) ||
        Boolean(parentId) ||
        Boolean(rootId) ||
        Number(meta.nestingDepth || s.nestingDepth || 0) > 0 ||
        s.isSubagent === true ||
        meta.isSubagent === true ||
        Boolean(subagentName) ||
        Boolean(swarmId)
    );
    const discInfo = discoveredSubs.get(id) || null;
    const isProtectedMain = protectedMainIds.has(id) && !explicitSubagent;
    const subagent = !isProtectedMain && (explicitSubagent || Boolean(discInfo && !chapterTitleIds.has(id)));
    const discParent =
      discInfo?.parentId && String(discInfo.parentId).trim().toLowerCase() !== id
        ? String(discInfo.parentId).trim().toLowerCase()
        : '';
    const resolvedParentId = parentId || discParent || '';
    const lastModifiedMs =
      parseSummaryTimeMs(s.lastModifiedTime) ||
      parseSummaryTimeMs(s.modifiedAt) ||
      parseSummaryTimeMs(s.updatedAt) ||
      parseSummaryTimeMs(s.createdTime) ||
      (discInfo?.lastModifiedMs || 0);
    map[id] = {
      subagent,
      ...(isProtectedMain ? { protectedMain: true } : {}),
      ...(resolvedParentId ? { parentId: resolvedParentId } : {}),
      ...(rootId ? { rootId } : {}),
      status: String(s.status ?? ''),
      stepCount: Math.max(0, Number(s.stepCount ?? s.numTotalSteps ?? 0) || 0),
      title: String(s.summary || s.title || '').slice(0, 120),
      ...(lastModifiedMs > 0 ? { lastModifiedMs } : {}),
    };
  }

  // 补充写入通过主对话 invokeSubagent / delegatedConversations 发现但未出现在 Redux 摘要里的子代理
  for (const [id, discInfo] of discoveredSubs.entries()) {
    if (map[id]) continue;
    if (protectedMainIds.has(id) || chapterTitleIds.has(id)) continue;
    map[id] = {
      subagent: true,
      ...(discInfo.parentId ? { parentId: discInfo.parentId } : {}),
      status: '',
      stepCount: 0,
      title: '',
      source: 'discovered',
      ...(discInfo.lastModifiedMs > 0 ? { lastModifiedMs: discInfo.lastModifiedMs } : {}),
    };
  }

  // 将显式可见主对话白名单固化为 main，死守主对话
  for (const mainId of protectedMainIds) {
    if (!map[mainId]) {
      map[mainId] = {
        subagent: false,
        protectedMain: true,
        status: '',
        stepCount: 0,
        title: '',
      };
    }
  }
  return map;
}

export function saveCatalogIndex(archiveDir, rawSummaries, opts = {}) {
  const safeArchive = ensureSafeDir(archiveDir);
  const mergeExisting = opts?.mergeExisting !== false;
  const maxEntries = Number.isInteger(opts?.maxEntries) && opts.maxEntries > 0 ? opts.maxEntries : MAX_CATALOG_ENTRIES;
  const fresh = extractCatalogIndexFromSummaries(rawSummaries, opts?.extraSignals || null);

  let merged = fresh;
  if (mergeExisting) {
    const existing = loadCatalogIndex(safeArchive);
    if (existing && existing.entries && typeof existing.entries === 'object') {
      merged = Object.create(null);
      for (const [rawId, prev] of Object.entries(existing.entries)) {
        const id = String(rawId || '').trim().toLowerCase();
        if (!GUID_RE.test(id) || !prev || typeof prev !== 'object') continue;
        merged[id] = prev;
      }
      for (const [id, next] of Object.entries(fresh)) {
        const prev = merged[id];
        if (prev && prev.subagent === true && !next.subagent && !next.protectedMain) {
          // 防止 v2.34+ 剥离了父字段的 Redux / searchConversations 条目冲掉已权威确认的子代理分类
          merged[id] = {
            ...prev,
            ...(next.title && !prev.title ? { title: next.title } : {}),
            ...(next.status ? { status: next.status } : {}),
            ...(Number(next.stepCount) > Number(prev.stepCount || 0) ? { stepCount: next.stepCount } : {}),
            ...(Number(next.lastModifiedMs) > Number(prev.lastModifiedMs || 0) ? { lastModifiedMs: next.lastModifiedMs } : {}),
          };
        } else if (prev && prev.protectedMain === true && (!next.subagent || next.source === 'discovered')) {
          // 保留先前确认的侧栏可见主对话白名单标记，防后续无 DOM 摘要刷新或启发式 DOM 发现覆盖主对话保护
          merged[id] = next.subagent
            ? { ...prev, subagent: false, protectedMain: true }
            : { ...next, subagent: false, protectedMain: true };
        } else {
          merged[id] = next;
        }
      }
      const keys = Object.keys(merged);
      if (keys.length > maxEntries) {
        keys.sort((a, b) => (Number(merged[b]?.lastModifiedMs) || 0) - (Number(merged[a]?.lastModifiedMs) || 0));
        const trimmed = Object.create(null);
        for (let i = 0; i < maxEntries; i += 1) {
          trimmed[keys[i]] = merged[keys[i]];
        }
        merged = trimmed;
      }
    }
  }

  const plainEntries = {};
  for (const [k, v] of Object.entries(merged)) plainEntries[k] = v;
  const payload = {
    schema: 1,
    updatedAt: new Date().toISOString(),
    count: Object.keys(plainEntries).length,
    entries: plainEntries,
  };
  const indexPath = path.join(safeArchive, INDEX_FILENAME);
  atomicWriteJsonSync(indexPath, payload);
  return { indexPath, count: payload.count, entries: plainEntries };
}

export function loadCatalogIndex(archiveDir) {
  try {
    const indexPath = path.join(path.resolve(archiveDir), INDEX_FILENAME);
    const st = assertPathChainNoSymlinks(indexPath, 'catalog index');
    if (!st || !st.isFile()) return null;
    const parsed = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    if (!parsed || parsed.schema !== 1 || !parsed.entries || typeof parsed.entries !== 'object') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function loadCatalogIndexAsync(archiveDir) {
  try {
    const indexPath = path.join(path.resolve(archiveDir), INDEX_FILENAME);
    const st = await assertPathChainNoSymlinksAsync(indexPath, 'catalog index');
    if (!st || !st.isFile()) return null;
    const parsed = JSON.parse(await fs.promises.readFile(indexPath, 'utf8'));
    if (!parsed || parsed.schema !== 1 || !parsed.entries || typeof parsed.entries !== 'object') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function normalizeNonNegativeThreshold(value, fallback, { integer = false } = {}) {
  if (value === null || value === undefined || typeof value === 'boolean') return fallback;
  if (typeof value === 'string' && value.trim() === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return integer ? Math.floor(n) : n;
}

const ASYNC_SCAN_LSTAT_CONCURRENCY = 24;
const TOP_CONSUMERS_LIMIT = 5;

// 与 main.mjs sanitizeSecretText 对齐并补全 rk-/pk-/ak-/AKIA 及控制字符脱敏
const REPORT_URL_CREDENTIALS_RE = /https?:\/\/[^/\s:@]+:[^/\s@]+@/gi;
const REPORT_URL_SECRET_QUERY_RE = /([?&](?:token|auth|signature|key|secret)=)[^&\s#"']+/gi;
const REPORT_BEARER_RE = /\bBearer\s+[A-Za-z0-9._\-]{8,}\b/gi;
const REPORT_SECRET_TOKEN_RE =
  /(?:(?:sk|rk|pk|ak)[_-][A-Za-z0-9_\-]{6,}|AIza[A-Za-z0-9_\-]{12,}|AKIA[0-9A-Z]{12,}|xai-[A-Za-z0-9_\-]{8,}|ghp_[A-Za-z0-9]{12,}|github_pat_[A-Za-z0-9_]{12,})/gi;

export function sanitizeTitleForReport(raw) {
  return String(raw || '')
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .replace(REPORT_URL_CREDENTIALS_RE, 'https://***@')
    .replace(REPORT_URL_SECRET_QUERY_RE, '$1[REDACTED]')
    .replace(REPORT_BEARER_RE, 'Bearer [REDACTED]')
    .replace(REPORT_SECRET_TOKEN_RE, '[REDACTED]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 72);
}

function buildStorageScanReport({
  safeConvDir,
  safeArchiveDir,
  catalogEntries,
  catalogUpdatedAt,
  groups,
  totalBytes,
  walBytes,
  fileCount,
  subagentMaxAgeHours,
  mainMaxAgeDays,
  keepRecentMain,
  excluded,
  lsMemoryMb = null,
  now,
}) {
  const items = [];
  for (const g of groups.values()) {
    const info = catalogEntries ? catalogEntries[g.id] || null : null;
    const kind = info ? (info.subagent ? 'subagent' : 'main') : 'unknown';
    // 判龄严格免疫 .db-shm（Antigravity 重启会刷新全部 .db-shm 时间戳）及 0 字节空 .db-wal：
    // 优先使用宿主权威 RPC lastModifiedMs，缺失时以主 .db 与非空 .db-wal 的最新 mtime 兜底。
    const fileMtimeMs = Math.max(g.dbMtimeMs || 0, g.walNonEmptyMtimeMs || 0) || g.mtimeMs || 0;
    const rpcMs = info && Number(info.lastModifiedMs) > 0 ? Number(info.lastModifiedMs) : 0;
    const activityMs = rpcMs > 0 ? rpcMs : fileMtimeMs;
    const ageMs = Math.max(0, now - activityMs);
    items.push({
      id: g.id,
      kind,
      subagent: kind === 'subagent',
      bytes: g.bytes,
      mb: Number((g.bytes / 1048576).toFixed(2)),
      mtimeMs: activityMs,
      ageHours: Number((ageMs / 3600000).toFixed(2)),
      ageDays: Number((ageMs / 86400000).toFixed(2)),
      status: info?.status || '',
      running: isRunningTrajectoryStatus(info?.status),
      stepCount: info?.stepCount || 0,
      title: info?.title || '',
      parentId: info?.parentId || '',
      files: g.files,
      excluded: excluded.has(g.id),
    });
  }

  const safeKeepRecentMain = normalizeNonNegativeThreshold(keepRecentMain, DEFAULT_KEEP_RECENT_MAIN, { integer: true });
  const safeSubagentMaxAgeHours = normalizeNonNegativeThreshold(subagentMaxAgeHours, DEFAULT_SUBAGENT_MAX_AGE_HOURS);
  const safeMainMaxAgeDays = normalizeNonNegativeThreshold(mainMaxAgeDays, DEFAULT_MAIN_MAX_AGE_DAYS);

  const mainItems = items.filter((it) => it.kind === 'main').sort((a, b) => b.mtimeMs - a.mtimeMs);
  const protectedMainIds = new Set(mainItems.slice(0, safeKeepRecentMain).map((it) => it.id));

  const subagentMinAgeMs = safeSubagentMaxAgeHours * 3600000;
  const mainMinAgeMs = safeMainMaxAgeDays * 86400000;

  const archivableSubagents = [];
  const archivableOldMain = [];
  let subagentBytes = 0;
  let mainBytes = 0;
  let unknownBytes = 0;
  let subagentCount = 0;
  let mainCount = 0;
  let unknownCount = 0;

  for (const it of items) {
    if (it.kind === 'subagent') {
      subagentCount++;
      subagentBytes += it.bytes;
      if (!it.excluded && !it.running && now - it.mtimeMs >= subagentMinAgeMs) {
        archivableSubagents.push(it);
      }
    } else if (it.kind === 'main') {
      mainCount++;
      mainBytes += it.bytes;
      if (!it.excluded && !it.running && !protectedMainIds.has(it.id) && now - it.mtimeMs >= mainMinAgeMs) {
        archivableOldMain.push(it);
      }
    } else {
      unknownCount++;
      unknownBytes += it.bytes;
    }
  }

  archivableSubagents.sort((a, b) => b.bytes - a.bytes);
  archivableOldMain.sort((a, b) => b.bytes - a.bytes);

  const topConsumers = [...items]
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, TOP_CONSUMERS_LIMIT)
    .map((it) => ({
      id: it.id,
      kind: it.kind,
      mb: it.mb,
      ageDays: it.ageDays,
      running: it.running,
      title: sanitizeTitleForReport(it.title),
    }));

  const totalMb = Number((totalBytes / 1048576).toFixed(1));
  const subagentMb = Number((subagentBytes / 1048576).toFixed(1));
  const mainMb = Number((mainBytes / 1048576).toFixed(1));
  const unknownMb = Number((unknownBytes / 1048576).toFixed(1));
  const archivableSubagentBytes = archivableSubagents.reduce((s, x) => s + x.bytes, 0);
  const archivableOldMainBytes = archivableOldMain.reduce((s, x) => s + x.bytes, 0);
  const validLsMemMb = Number.isFinite(Number(lsMemoryMb)) && Number(lsMemoryMb) > 0 ? Number(Number(lsMemoryMb).toFixed(1)) : null;

  const warnReasons = [];
  if (totalMb >= WARN_TOTAL_MB) warnReasons.push('total');
  if (subagentMb >= WARN_SUBAGENT_MB) warnReasons.push('subagent');
  if (validLsMemMb !== null && validLsMemMb >= WARN_LS_MEMORY_MB) warnReasons.push('ls-memory');

  return {
    ok: true,
    convDir: safeConvDir,
    archiveDir: safeArchiveDir,
    hasCatalogIndex: Boolean(catalogEntries && Object.keys(catalogEntries).length > 0),
    catalogUpdatedAt,
    fileCount,
    conversationCount: items.length,
    totalBytes,
    totalMb,
    walMb: Number((walBytes / 1048576).toFixed(1)),
    mainCount,
    mainMb,
    subagentCount,
    subagentMb,
    unknownCount,
    unknownMb,
    archivableSubagentCount: archivableSubagents.length,
    archivableSubagentMb: Number((archivableSubagentBytes / 1048576).toFixed(1)),
    archivableOldMainCount: archivableOldMain.length,
    archivableOldMainMb: Number((archivableOldMainBytes / 1048576).toFixed(1)),
    lsMemoryMb: validLsMemMb,
    warn: warnReasons.length > 0,
    warnReasons,
    warnThresholds: { totalMb: WARN_TOTAL_MB, subagentMb: WARN_SUBAGENT_MB, lsMemoryMb: WARN_LS_MEMORY_MB },
    topConsumers,
    archivableSubagents,
    archivableOldMain,
  };
}

export function scanConversationStorage({
  convDir = getDefaultConversationsDir(),
  archiveDir = getDefaultArchiveDir(),
  summaries = null,
  extraSignals = null,
  subagentMaxAgeHours = DEFAULT_SUBAGENT_MAX_AGE_HOURS,
  mainMaxAgeDays = DEFAULT_MAIN_MAX_AGE_DAYS,
  keepRecentMain = DEFAULT_KEEP_RECENT_MAIN,
  excludeIds = [],
  lsMemoryMb = null,
  now = Date.now(),
} = {}) {
  const safeConvDir = path.resolve(convDir);
  const safeArchiveDir = path.resolve(archiveDir);
  const convStat = assertPathChainNoSymlinks(safeConvDir, 'conversations directory');
  const excluded = new Set((excludeIds || []).map((x) => String(x || '').trim().toLowerCase()).filter(Boolean));

  let catalogEntries = null;
  let catalogUpdatedAt = null;
  if (summaries && typeof summaries === 'object') {
    catalogEntries = extractCatalogIndexFromSummaries(summaries, extraSignals);
    catalogUpdatedAt = new Date(now).toISOString();
  } else {
    const loaded = loadCatalogIndex(safeArchiveDir);
    if (loaded) {
      catalogEntries = loaded.entries;
      catalogUpdatedAt = loaded.updatedAt || null;
    }
  }

  const groups = new Map();
  let totalBytes = 0;
  let walBytes = 0;
  let fileCount = 0;

  if (convStat && convStat.isDirectory()) {
    for (const dirent of fs.readdirSync(safeConvDir, { withFileTypes: true })) {
      if (dirent.isSymbolicLink() || !dirent.isFile()) continue;
      const m = DB_FILE_RE.exec(dirent.name);
      if (!m) continue;
      const id = m[1].toLowerCase();
      const suffix = m[2] ? m[2].toLowerCase() : 'db';
      const fullPath = path.join(safeConvDir, dirent.name);
      let st;
      try {
        st = fs.lstatSync(fullPath);
        if (st.isSymbolicLink() || !st.isFile()) continue;
      } catch {
        continue;
      }
      fileCount++;
      totalBytes += st.size;
      if (suffix === 'wal' || suffix === 'shm') walBytes += st.size;
      let g = groups.get(id);
      if (!g) {
        g = { id, files: [], bytes: 0, mtimeMs: 0, dbMtimeMs: 0, walNonEmptyMtimeMs: 0, hasDb: false };
        groups.set(id, g);
      }
      g.files.push({ name: dirent.name, bytes: st.size, suffix });
      g.bytes += st.size;
      if (suffix === 'db') {
        g.hasDb = true;
        if (st.mtimeMs > g.dbMtimeMs) g.dbMtimeMs = st.mtimeMs;
      } else if (suffix === 'wal' && st.size > 0) {
        if (st.mtimeMs > g.walNonEmptyMtimeMs) g.walNonEmptyMtimeMs = st.mtimeMs;
      }
      if (suffix !== 'shm' && st.mtimeMs > g.mtimeMs) g.mtimeMs = st.mtimeMs;
    }
  }

  return buildStorageScanReport({
    safeConvDir,
    safeArchiveDir,
    catalogEntries,
    catalogUpdatedAt,
    groups,
    totalBytes,
    walBytes,
    fileCount,
    subagentMaxAgeHours,
    mainMaxAgeDays,
    keepRecentMain,
    excluded,
    lsMemoryMb,
    now,
  });
}

export async function scanConversationStorageAsync({
  convDir = getDefaultConversationsDir(),
  archiveDir = getDefaultArchiveDir(),
  summaries = null,
  extraSignals = null,
  subagentMaxAgeHours = DEFAULT_SUBAGENT_MAX_AGE_HOURS,
  mainMaxAgeDays = DEFAULT_MAIN_MAX_AGE_DAYS,
  keepRecentMain = DEFAULT_KEEP_RECENT_MAIN,
  excludeIds = [],
  lsMemoryMb = null,
  now = Date.now(),
  concurrency = ASYNC_SCAN_LSTAT_CONCURRENCY,
} = {}) {
  const safeConvDir = path.resolve(convDir);
  const safeArchiveDir = path.resolve(archiveDir);
  const convStat = await assertPathChainNoSymlinksAsync(safeConvDir, 'conversations directory');
  const excluded = new Set((excludeIds || []).map((x) => String(x || '').trim().toLowerCase()).filter(Boolean));

  let catalogEntries = null;
  let catalogUpdatedAt = null;
  if (summaries && typeof summaries === 'object') {
    catalogEntries = extractCatalogIndexFromSummaries(summaries, extraSignals);
    catalogUpdatedAt = new Date(now).toISOString();
  } else {
    const loaded = await loadCatalogIndexAsync(safeArchiveDir);
    if (loaded) {
      catalogEntries = loaded.entries;
      catalogUpdatedAt = loaded.updatedAt || null;
    }
  }

  const groups = new Map();
  let totalBytes = 0;
  let walBytes = 0;
  let fileCount = 0;

  if (convStat && convStat.isDirectory()) {
    const dirents = await fs.promises.readdir(safeConvDir, { withFileTypes: true });
    const candidates = [];
    for (const dirent of dirents) {
      if (dirent.isSymbolicLink() || !dirent.isFile()) continue;
      const m = DB_FILE_RE.exec(dirent.name);
      if (!m) continue;
      candidates.push({
        name: dirent.name,
        id: m[1].toLowerCase(),
        suffix: m[2] ? m[2].toLowerCase() : 'db',
        fullPath: path.join(safeConvDir, dirent.name),
      });
    }

    const stats = new Array(candidates.length).fill(null);
    const maxWorkers = Math.max(1, Math.min(Number(concurrency) || ASYNC_SCAN_LSTAT_CONCURRENCY, candidates.length));
    let cursor = 0;
    const worker = async () => {
      while (true) {
        const idx = cursor++;
        if (idx >= candidates.length) return;
        try {
          const st = await fs.promises.lstat(candidates[idx].fullPath);
          if (!st.isSymbolicLink() && st.isFile()) {
            stats[idx] = st;
          }
        } catch {}
      }
    };
    if (candidates.length > 0) {
      await Promise.all(Array.from({ length: maxWorkers }, () => worker()));
    }

    for (let i = 0; i < candidates.length; i++) {
      const st = stats[i];
      if (!st) continue;
      const { name, id, suffix } = candidates[i];
      fileCount++;
      totalBytes += st.size;
      if (suffix === 'wal' || suffix === 'shm') walBytes += st.size;
      let g = groups.get(id);
      if (!g) {
        g = { id, files: [], bytes: 0, mtimeMs: 0, dbMtimeMs: 0, walNonEmptyMtimeMs: 0, hasDb: false };
        groups.set(id, g);
      }
      g.files.push({ name, bytes: st.size, suffix });
      g.bytes += st.size;
      if (suffix === 'db') {
        g.hasDb = true;
        if (st.mtimeMs > g.dbMtimeMs) g.dbMtimeMs = st.mtimeMs;
      } else if (suffix === 'wal' && st.size > 0) {
        if (st.mtimeMs > g.walNonEmptyMtimeMs) g.walNonEmptyMtimeMs = st.mtimeMs;
      }
      if (suffix !== 'shm' && st.mtimeMs > g.mtimeMs) g.mtimeMs = st.mtimeMs;
    }
  }

  return buildStorageScanReport({
    safeConvDir,
    safeArchiveDir,
    catalogEntries,
    catalogUpdatedAt,
    groups,
    totalBytes,
    walBytes,
    fileCount,
    subagentMaxAgeHours,
    mainMaxAgeDays,
    keepRecentMain,
    excluded,
    lsMemoryMb,
    now,
  });
}

function collectLiveCompanionFiles(convDir, id) {
  const suffixes = ['.db', '.db-wal', '.db-shm'];
  const found = [];
  for (const sfx of suffixes) {
    const name = `${id}${sfx}`;
    const full = path.join(convDir, name);
    const st = assertPathChainNoSymlinks(full, 'conversation file');
    if (st && st.isFile()) {
      found.push({ name, bytes: st.size });
    }
  }
  return found;
}

export function archiveConversations({
  convDir = getDefaultConversationsDir(),
  archiveDir = getDefaultArchiveDir(),
  summaries = null,
  mode = 'subagents',
  subagentMaxAgeHours = 6,
  mainMaxAgeDays = 14,
  keepRecentMain = 20,
  excludeIds = [],
  dryRun = false,
  now = Date.now(),
  checkRunning = isLanguageServerRunning,
} = {}) {
  const scan = scanConversationStorage({
    convDir,
    archiveDir,
    summaries,
    subagentMaxAgeHours,
    mainMaxAgeDays,
    keepRecentMain,
    excludeIds,
    now,
  });

  if (!scan.hasCatalogIndex) {
    return {
      ok: false,
      code: 'NO_CATALOG_INDEX',
      error: '未找到会话分类索引（无法区分隐藏子代理与主对话）。请在 Antigravity 运行时先执行 --prepare 或在设置面板点击「生成归档脚本」刷新索引。',
      scan,
    };
  }

  const targets =
    mode === 'subagents+old-main'
      ? [...scan.archivableSubagents, ...scan.archivableOldMain]
      : [...scan.archivableSubagents];

  const targetBytes = targets.reduce((s, x) => s + x.bytes, 0);
  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      mode,
      candidateCount: targets.length,
      candidateMb: Number((targetBytes / 1048576).toFixed(1)),
      remainingEstimatedMb: Number(Math.max(0, (scan.totalBytes - targetBytes) / 1048576).toFixed(1)),
      targets: targets.map((t) => ({ id: t.id, kind: t.kind, mb: t.mb, ageHours: t.ageHours, title: t.title })),
      scan,
    };
  }

  const isRunning = () => {
    try {
      return typeof checkRunning === 'function' ? Boolean(checkRunning()) : isLanguageServerRunning();
    } catch {
      return true; // fail-closed
    }
  };

  if (isRunning()) {
    return {
      ok: false,
      code: 'LANGUAGE_SERVER_RUNNING',
      error: '检测到 language_server 正在运行（或进程状态无法确认）。为防止损坏数据，请先完全退出 Antigravity，再运行归档脚本！',
      candidateCount: targets.length,
      candidateMb: Number((targetBytes / 1048576).toFixed(1)),
    };
  }

  if (targets.length === 0) {
    return {
      ok: true,
      dryRun: false,
      mode,
      movedCount: 0,
      movedMb: 0,
      batchDir: null,
      message: '当前没有符合归档条件的旧子代理或过期会话，无需移动。',
    };
  }

  return withArchiveLock(scan.archiveDir, () => {
    const { batchName, batchDir } = createExclusiveBatchDir(scan.archiveDir, now);
    const manifestPath = path.join(batchDir, 'manifest.json');
    const movedItems = [];
    const failedItems = [];
    const partialSplits = [];
    let movedBytes = 0;
    let abortedByHostRestart = false;

    const persistManifest = (status) => {
      const m = {
        schema: 1,
        status,
        batchName,
        createdAt: new Date(now).toISOString(),
        updatedAt: new Date().toISOString(),
        mode,
        sourceConvDir: scan.convDir,
        movedCount: movedItems.length,
        movedBytes,
        movedMb: Number((movedBytes / 1048576).toFixed(1)),
        failedCount: failedItems.length,
        rollbackFailed: partialSplits.length > 0,
        abortedByHostRestart,
        partialSplits,
        items: movedItems,
      };
      atomicWriteJsonSync(manifestPath, m);
      return m;
    };

    // Verify both parent directories once up front so per-file moves avoid O(depth) redundant parent lstat walks
    assertPathChainNoSymlinks(scan.convDir, 'conversations directory');
    assertPathChainNoSymlinks(batchDir, 'batch directory');

    // Write pre-move journal manifest BEFORE moving any file so crashes are always discoverable
    persistManifest('in-progress');

    const isRunningInLoop = createLoopRunningChecker(isRunning, checkRunning);

    for (const item of targets) {
      if (isRunningInLoop()) {
        abortedByHostRestart = true;
        failedItems.push({ id: item.id, error: 'LANGUAGE_SERVER_STARTED_MID_ARCHIVE' });
        break;
      }
      let liveFiles;
      try {
        liveFiles = collectLiveCompanionFiles(scan.convDir, item.id);
      } catch (err) {
        failedItems.push({ id: item.id, error: err?.message || String(err) });
        continue;
      }
      if (liveFiles.length === 0) continue;

      const movedFiles = [];
      let itemFailed = null;
      for (const f of liveFiles) {
        const src = path.join(scan.convDir, f.name);
        const dst = path.join(batchDir, f.name);
        try {
          safeMoveFileSync(src, dst, { trustedParentDirs: true });
          movedFiles.push(f.name);
        } catch (err) {
          itemFailed = err?.message || String(err);
          const rollbackErrors = [];
          for (const backName of [...movedFiles].reverse()) {
            try {
              safeMoveFileSync(path.join(batchDir, backName), path.join(scan.convDir, backName), {
                trustedParentDirs: true,
              });
            } catch (rbErr) {
              rollbackErrors.push({
                file: backName,
                stuckAt: path.join(batchDir, backName),
                expectedAt: path.join(scan.convDir, backName),
                error: rbErr?.message || String(rbErr),
              });
            }
          }
          if (rollbackErrors.length > 0) {
            partialSplits.push({ id: item.id, originalError: itemFailed, rollbackErrors });
          }
          break;
        }
      }
      if (itemFailed) {
        failedItems.push({ id: item.id, error: itemFailed });
        if (partialSplits.length > 0) {
          persistManifest('in-progress');
        }
      } else {
        const bundleBytes = liveFiles.reduce((s, f) => s + f.bytes, 0);
        movedBytes += bundleBytes;
        movedItems.push({
          id: item.id,
          kind: item.kind,
          bytes: bundleBytes,
          mb: Number((bundleBytes / 1048576).toFixed(2)),
          title: item.title,
          parentId: item.parentId,
          files: movedFiles,
        });
        // Checkpoint manifest periodically without triggering N hardware fsyncs on Windows Defender/NTFS;
        // crash recovery already scans batchDir directly for any in-progress manifest.
        if (movedItems.length % 25 === 0) {
          persistManifest('in-progress');
        }
      }
    }

    const finalManifest = persistManifest(abortedByHostRestart ? 'aborted' : 'completed');

    return {
      ok: failedItems.length === 0 && partialSplits.length === 0 && !abortedByHostRestart,
      ...(partialSplits.length > 0 ? { code: 'ROLLBACK_FAILED', error: '部分会话三件套回滚失败，请按 manifest.json 中的 partialSplits 核对文件位置。' } : {}),
      ...(abortedByHostRestart ? { code: 'LANGUAGE_SERVER_RUNNING', error: '归档途中检测到 Antigravity/language_server 启动，已立即中止剩余移动；已完成部分可通过 --restore latest 还原。' } : {}),
      dryRun: false,
      mode,
      batchName,
      batchDir,
      movedCount: movedItems.length,
      movedMb: finalManifest.movedMb,
      failedItems,
      partialSplits,
      remainingEstimatedMb: Number(Math.max(0, (scan.totalBytes - movedBytes) / 1048576).toFixed(1)),
    };
  });
}

function scanBatchDirForFallbackItems(batchDir) {
  const byId = new Map();
  let totalBytes = 0;
  for (const dirent of fs.readdirSync(batchDir, { withFileTypes: true })) {
    if (dirent.isSymbolicLink() || !dirent.isFile()) continue;
    const m = DB_FILE_RE.exec(dirent.name);
    if (!m) continue;
    const id = m[1].toLowerCase();
    const st = fs.lstatSync(path.join(batchDir, dirent.name));
    if (st.isSymbolicLink() || !st.isFile()) continue;
    totalBytes += st.size;
    let rec = byId.get(id);
    if (!rec) {
      rec = { id, files: [], bytes: 0 };
      byId.set(id, rec);
    }
    rec.files.push(dirent.name);
    rec.bytes += st.size;
  }
  return { items: [...byId.values()], totalBytes };
}

export function listArchiveBatches(archiveDir = getDefaultArchiveDir()) {
  const safeArchiveRoot = path.resolve(archiveDir);
  const st = assertPathChainNoSymlinks(safeArchiveRoot, 'archive directory');
  if (!st || !st.isDirectory()) return [];
  const batches = [];
  for (const dirent of fs.readdirSync(safeArchiveRoot, { withFileTypes: true })) {
    if (dirent.isSymbolicLink() || !dirent.isDirectory() || !BATCH_NAME_RE.test(dirent.name)) continue;
    const batchDir = path.join(safeArchiveRoot, dirent.name);
    const manifestPath = path.join(batchDir, 'manifest.json');
    let parsed = null;
    try {
      const mStat = assertPathChainNoSymlinks(manifestPath, 'batch manifest');
      if (mStat && mStat.isFile()) {
        const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        if (raw && raw.schema === 1) parsed = raw;
      }
    } catch {}
    if (parsed) {
      batches.push({
        batchName: dirent.name,
        batchDir,
        status: parsed.status || 'completed',
        createdAt: parsed.createdAt || '',
        mode: parsed.mode || 'subagents',
        movedCount: Number(parsed.movedCount || 0),
        movedMb: Number(parsed.movedMb || 0),
        rollbackFailed: Boolean(parsed.rollbackFailed),
      });
    } else {
      // Crash-recovery discovery: surface batches containing orphaned DB files even if manifest is absent/corrupt
      try {
        const fb = scanBatchDirForFallbackItems(batchDir);
        if (fb.items.length > 0) {
          batches.push({
            batchName: dirent.name,
            batchDir,
            status: 'recovered-no-manifest',
            createdAt: '',
            mode: 'unknown',
            movedCount: fb.items.length,
            movedMb: Number((fb.totalBytes / 1048576).toFixed(1)),
            rollbackFailed: false,
          });
        }
      } catch {}
    }
  }
  batches.sort((a, b) => String(b.batchName).localeCompare(String(a.batchName)));
  return batches;
}

export function restoreArchiveBatch({
  convDir = getDefaultConversationsDir(),
  archiveDir = getDefaultArchiveDir(),
  batchName = 'latest',
  checkRunning = isLanguageServerRunning,
} = {}) {
  const isRunning = () => {
    try {
      return typeof checkRunning === 'function' ? Boolean(checkRunning()) : isLanguageServerRunning();
    } catch {
      return true; // fail-closed
    }
  };
  if (isRunning()) {
    return {
      ok: false,
      code: 'LANGUAGE_SERVER_RUNNING',
      error: '检测到 Antigravity/language_server 正在运行（或状态无法确认）。请先完全退出 Antigravity，再执行一键还原。',
    };
  }
  const safeConvDir = ensureSafeDir(convDir);
  const safeArchiveRoot = path.resolve(archiveDir);
  return withArchiveLock(safeArchiveRoot, () => {
    const batches = listArchiveBatches(safeArchiveRoot);
    if (batches.length === 0) {
      return { ok: false, code: 'NO_BATCH', error: '未找到任何历史归档批次。' };
    }
    const chosen =
      batchName === 'latest'
        ? batches[0]
        : BATCH_NAME_RE.test(String(batchName || ''))
        ? batches.find((b) => b.batchName === batchName)
        : null;
    if (!chosen) {
      return { ok: false, code: 'BATCH_NOT_FOUND', error: `未找到指定归档批次: ${batchName}` };
    }
    const manifestPath = path.join(chosen.batchDir, 'manifest.json');
    let restoreItems = [];
    try {
      const mStat = assertPathChainNoSymlinks(manifestPath, 'batch manifest');
      if (mStat && mStat.isFile()) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        if (manifest && Array.isArray(manifest.items) && manifest.items.length > 0 && manifest.status === 'completed') {
          restoreItems = manifest.items;
        }
      }
    } catch {}
    // For missing/corrupt/in-progress manifests, synthesize directly from live files inside batchDir
    if (restoreItems.length === 0) {
      restoreItems = scanBatchDirForFallbackItems(chosen.batchDir).items;
    }

    const restored = [];
    const skipped = [];
    const failed = [];
    const partialSplits = [];

    assertPathChainNoSymlinks(chosen.batchDir, 'batch directory');
    assertPathChainNoSymlinks(safeConvDir, 'conversations directory');
    const isRunningInLoop = createLoopRunningChecker(isRunning, checkRunning);

    for (const item of restoreItems) {
      if (isRunningInLoop()) {
        failed.push({ id: item.id, error: 'LANGUAGE_SERVER_STARTED_MID_RESTORE' });
        break;
      }
      const files = (Array.isArray(item.files) ? item.files : []).filter((fn) => typeof fn === 'string' && DB_FILE_RE.test(fn));
      if (files.length === 0) continue;
      const anyConflict = files.some((fn) => fs.existsSync(path.join(safeConvDir, fn)));
      if (anyConflict) {
        skipped.push({ id: item.id, reason: 'destination-exists' });
        continue;
      }
      const doneFiles = [];
      let errMsg = null;
      for (const fn of files) {
        const src = path.join(chosen.batchDir, fn);
        const dst = path.join(safeConvDir, fn);
        if (!fs.existsSync(src)) continue;
        try {
          safeMoveFileSync(src, dst, { trustedParentDirs: true });
          doneFiles.push(fn);
        } catch (err) {
          errMsg = err?.message || String(err);
          const rollbackErrors = [];
          for (const bfn of [...doneFiles].reverse()) {
            try {
              safeMoveFileSync(path.join(safeConvDir, bfn), path.join(chosen.batchDir, bfn), {
                trustedParentDirs: true,
              });
            } catch (rbErr) {
              rollbackErrors.push({
                file: bfn,
                stuckAt: path.join(safeConvDir, bfn),
                expectedAt: path.join(chosen.batchDir, bfn),
                error: rbErr?.message || String(rbErr),
              });
            }
          }
          if (rollbackErrors.length > 0) {
            partialSplits.push({ id: item.id, originalError: errMsg, rollbackErrors });
          }
          break;
        }
      }
      if (errMsg) failed.push({ id: item.id, error: errMsg });
      else if (doneFiles.length > 0) restored.push(item.id);
    }

    return {
      ok: failed.length === 0 && partialSplits.length === 0,
      batchName: chosen.batchName,
      restoredCount: restored.length,
      skippedCount: skipped.length,
      failed,
      partialSplits,
    };
  });
}

function assertSafeHelperPath(p, label) {
  const s = String(p || '');
  if (!s || /[\r\n\0"&|<>^`$;!]/.test(s)) {
    throw new Error(`Unsafe characters in ${label}: refusing to generate shell script`);
  }
  return s;
}

function escapeBatchArg(p) {
  return `"${p.replace(/%/g, '%%')}"`;
}

function escapePosixSingleQuoted(p) {
  return `'${p.replace(/'/g, "'\\''")}'`;
}

export function validateBatchSelector(batchName = 'latest') {
  const raw = String(batchName ?? 'latest').trim() || 'latest';
  if (raw === 'latest') return 'latest';
  if (BATCH_NAME_RE.test(raw)) return raw;
  throw new Error(`Invalid archive batch name: ${raw.slice(0, 64)}`);
}

export function writeHelperScripts({
  scriptPath,
  archiveDir = getDefaultArchiveDir(),
  nodeExecPath = process.execPath,
  mode = 'subagents',
  subagentMaxAgeHours = AUTO_ARCHIVE_SUBAGENT_MAX_AGE_HOURS,
  mainDays = DEFAULT_MAIN_MAX_AGE_DAYS,
  keepRecentMain = DEFAULT_KEEP_RECENT_MAIN,
  restoreBatch = 'latest',
  writeArchiveScript = true,
  writeRestoreScript = true,
} = {}) {
  const safeArchive = ensureSafeDir(archiveDir);
  const absScript = assertSafeHelperPath(path.resolve(scriptPath), 'scriptPath');
  const isElectronHost = /antigravity(?:\.exe)?$/i.test(path.basename(nodeExecPath || ''));
  const safeNodeExec = isElectronHost ? 'node' : assertSafeHelperPath(path.resolve(nodeExecPath), 'nodeExecPath');
  const safeMode = mode === 'subagents+old-main' ? 'subagents+old-main' : 'subagents';
  const safeSubHours = normalizeNonNegativeThreshold(subagentMaxAgeHours, AUTO_ARCHIVE_SUBAGENT_MAX_AGE_HOURS);
  const safeMainDays = normalizeNonNegativeThreshold(mainDays, DEFAULT_MAIN_MAX_AGE_DAYS, { integer: true });
  const safeKeepMain = normalizeNonNegativeThreshold(keepRecentMain, DEFAULT_KEEP_RECENT_MAIN, { integer: true });
  const safeRestoreBatch = validateBatchSelector(restoreBatch);
  const archiveFlags =
    safeMode === 'subagents+old-main'
      ? `--archive --wait-exit --include-old-main --subagent-hours=${safeSubHours} --main-days=${safeMainDays} --keep-main=${safeKeepMain}`
      : `--archive --wait-exit --subagent-hours=${safeSubHours}`;
  const restoreFlags = `--restore ${safeRestoreBatch} --wait-exit`;

  if (process.platform === 'win32') {
    const nodeCmd = safeNodeExec === 'node' ? 'node' : escapeBatchArg(safeNodeExec);
    const scriptArg = escapeBatchArg(absScript);
    // subagents+old-main 与指定批次还原分别写入独立文件名，绝不静默覆盖默认子代理归档或最近还原脚本
    const archiveFilename = safeMode === 'subagents+old-main' ? 'archive-old-main.cmd' : '归档旧子代理释放内存.cmd';
    const restoreFilename = safeRestoreBatch === 'latest' ? '一键还原最近归档.cmd' : `restore-${safeRestoreBatch}.cmd`;
    const archiveCmdPath = path.join(safeArchive, archiveFilename);
    const restoreCmdPath = path.join(safeArchive, restoreFilename);
    if (writeArchiveScript) {
      const archiveBanner =
        safeMode === 'subagents+old-main'
          ? `echo  Obsidian Prism — 对话库安全归档工具（含 >${safeMainDays} 天旧主对话，保留最近 ${safeKeepMain} 条，只移动不删除）`
          : 'echo  Obsidian Prism — Antigravity 对话库安全归档工具（只移动不删除）';
      const archiveCmd = [
        '@echo off',
        'setlocal DisableDelayedExpansion',
        'chcp 65001 >nul',
        'echo ============================================================',
        archiveBanner,
        'echo ============================================================',
        'echo  请确认已完全关闭 Antigravity（等待 language_server.exe 退出）',
        'echo.',
        `${nodeCmd} ${scriptArg} ${archiveFlags}`,
        'echo.',
        'pause',
        '',
      ].join('\r\n');
      atomicWriteTextExclusiveSync(archiveCmdPath, archiveCmd, 0o600);
    }
    if (writeRestoreScript) {
      const restoreCmd = [
        '@echo off',
        'setlocal DisableDelayedExpansion',
        'chcp 65001 >nul',
        'echo ============================================================',
        `echo  Obsidian Prism — 一键无损还原对话归档 (${safeRestoreBatch})`,
        'echo ============================================================',
        'echo  请确认已完全关闭 Antigravity（等待 language_server.exe 退出）',
        'echo.',
        `${nodeCmd} ${scriptArg} ${restoreFlags}`,
        'echo.',
        'pause',
        '',
      ].join('\r\n');
      atomicWriteTextExclusiveSync(restoreCmdPath, restoreCmd, 0o600);
    }
    return {
      archiveScriptPath: writeArchiveScript ? archiveCmdPath : '',
      restoreScriptPath: writeRestoreScript ? restoreCmdPath : '',
      archiveDir: safeArchive,
      mode: safeMode,
      restoreBatch: safeRestoreBatch,
    };
  }

  const ext = process.platform === 'darwin' ? '.command' : '.sh';
  const nodeCmd = safeNodeExec === 'node' ? 'node' : escapePosixSingleQuoted(safeNodeExec);
  const scriptArg = escapePosixSingleQuoted(absScript);
  const archiveFilename = safeMode === 'subagents+old-main' ? `archive-old-main${ext}` : `archive-subagents${ext}`;
  const restoreFilename = safeRestoreBatch === 'latest' ? `restore-latest-archive${ext}` : `restore-${safeRestoreBatch}${ext}`;
  const archiveShPath = path.join(safeArchive, archiveFilename);
  const restoreShPath = path.join(safeArchive, restoreFilename);
  if (writeArchiveScript) {
    const archiveSh = `#!/usr/bin/env bash\nset -euo pipefail\n${nodeCmd} ${scriptArg} ${archiveFlags}\n`;
    atomicWriteTextExclusiveSync(archiveShPath, archiveSh, 0o700);
  }
  if (writeRestoreScript) {
    const restoreSh = `#!/usr/bin/env bash\nset -euo pipefail\n${nodeCmd} ${scriptArg} ${restoreFlags}\n`;
    atomicWriteTextExclusiveSync(restoreShPath, restoreSh, 0o700);
  }
  return {
    archiveScriptPath: writeArchiveScript ? archiveShPath : '',
    restoreScriptPath: writeRestoreScript ? restoreShPath : '',
    archiveDir: safeArchive,
    mode: safeMode,
    restoreBatch: safeRestoreBatch,
  };
}

const STORAGE_WB_I18N = {
  'zh-CN': {
    summary: '存储明细与无损归档工作台',
    archiveOldMain: '含 >14 天旧主对话',
    restoreBtn: '生成离线还原脚本',
    refreshBtn: '刷新',
    restoreReadyTpl: '还原脚本就绪（{0}）：{1}（退出 Antigravity 后运行）',
    oldMainReadyTpl: '旧主对话归档脚本就绪（可归档 {0} 项 / {1}）：{2}（退出 Antigravity 后运行）',
    breakdown: '空间构成',
    main: '主对话',
    subagent: '隐藏子代理',
    wal: 'WAL 日志',
    unknown: '未索引',
    lsMem: '后台服务内存',
    archivable: '可安全归档',
    archSub: '已结束子代理',
    archOld: '>14 天旧主对话（保留最近 20 条）',
    topTitle: '体积 Top 5 会话（只读）',
    batchTitle: '历史无损归档批次',
    none: '暂无',
    hint: '安全原则：只移动不删除，支持按批次无损还原；离线脚本请在退出 Antigravity 后运行。',
  },
  'zh-TW': {
    summary: '儲存明細與無損封存工作台',
    archiveOldMain: '含 >14 天舊主對話',
    restoreBtn: '產生離線還原腳本',
    refreshBtn: '重新整理',
    restoreReadyTpl: '還原腳本就緒（{0}）：{1}（退出 Antigravity 後執行）',
    oldMainReadyTpl: '舊主對話封存腳本就緒（可封存 {0} 項 / {1}）：{2}（退出 Antigravity 後執行）',
    breakdown: '空間構成',
    main: '主對話',
    subagent: '隱藏子代理',
    wal: 'WAL 日誌',
    unknown: '未索引',
    lsMem: '背景服務記憶體',
    archivable: '可安全封存',
    archSub: '已結束子代理',
    archOld: '>14 天舊主對話（保留最近 20 筆）',
    topTitle: '體積 Top 5 會話（唯讀）',
    batchTitle: '歷史無損封存批次',
    none: '暫無',
    hint: '安全原則：只移動不刪除，支援按批次無損還原；離線腳本請在退出 Antigravity 後執行。',
  },
  en: {
    summary: 'Storage Details & Lossless Archive Workbench',
    archiveOldMain: 'Include >14d Main',
    restoreBtn: 'Offline Restore Script',
    refreshBtn: 'Refresh',
    restoreReadyTpl: 'Restore script ready ({0}): {1} (quit Antigravity first)',
    oldMainReadyTpl: 'Old-main archive script ready ({0} items / {1}): {2} (quit Antigravity first)',
    breakdown: 'Breakdown',
    main: 'Main',
    subagent: 'Subagents',
    wal: 'WAL',
    unknown: 'Unindexed',
    lsMem: 'Background RAM',
    archivable: 'Archivable',
    archSub: 'Finished subagents',
    archOld: 'Old main >14d (keeps latest 20)',
    topTitle: 'Top 5 Largest Conversations (Read-only)',
    batchTitle: 'Lossless Archive Batches',
    none: 'None',
    hint: 'Zero-loss policy: move-only with manifest.json for per-batch restore; quit Antigravity before running helper scripts.',
  },
  ja: {
    summary: 'ストレージ詳細・無損失アーカイブ管理',
    archiveOldMain: '>14日前の主会話も含む',
    restoreBtn: 'オフライン復元スクリプト',
    refreshBtn: '更新',
    restoreReadyTpl: '復元スクリプト準備完了（{0}）：{1}（Antigravity 終了後に実行）',
    oldMainReadyTpl: '旧主会話スクリプト準備完了（{0} 件 / {1}）：{2}（Antigravity 終了後に実行）',
    breakdown: '容量内訳',
    main: '主会話',
    subagent: 'サブエージェント',
    wal: 'WAL',
    unknown: '未分類',
    lsMem: 'バックグラウンドメモリ',
    archivable: '安全にアーカイブ可能',
    archSub: '完了済みサブエージェント',
    archOld: '>14日前の主会話（最新20件保持）',
    topTitle: '容量 Top 5 会話（参照のみ）',
    batchTitle: '過去の無損失アーカイブバッチ',
    none: 'なし',
    hint: '安全方針：削除せず移動のみ（manifest.json 付でバッチ別復元可）。スクリプト実行前に Antigravity を終了してください。',
  },
  ko: {
    summary: '저장소 상세 및 무손실 아카이브 작업대',
    archiveOldMain: '14일 초과 기본 대화 포함',
    restoreBtn: '오프라인 복원 스크립트',
    refreshBtn: '새로고침',
    restoreReadyTpl: '복원 스크립트 준비됨 ({0}): {1} (Antigravity 종료 후 실행)',
    oldMainReadyTpl: '이전 기본 대화 스크립트 준비됨 ({0}건 / {1}): {2} (Antigravity 종료 후 실행)',
    breakdown: '용량 구성',
    main: '기본 대화',
    subagent: '서브에이전트',
    wal: 'WAL 로그',
    unknown: '미색인',
    lsMem: '백그라운드 메모리',
    archivable: '안전 아카이브 가능',
    archSub: '종료된 서브에이전트',
    archOld: '14일 초과 기본 대화 (최근 20개 유지)',
    topTitle: '용량 Top 5 대화 (읽기 전용)',
    batchTitle: '무손실 아카이브 배치 기록',
    none: '없음',
    hint: '무손실 원칙: 삭제 없이 이동만 수행하며 배치별 복원을 지원합니다. 스크립트 실행 전 Antigravity를 종료하세요.',
  },
  es: {
    summary: 'Detalles de almacenamiento y archivo sin pérdida',
    archiveOldMain: 'Incluir chats >14 d',
    restoreBtn: 'Script de restauración',
    refreshBtn: 'Actualizar',
    restoreReadyTpl: 'Script de restauración listo ({0}): {1} (cierra Antigravity primero)',
    oldMainReadyTpl: 'Script de chats >14 d listo ({0} elem. / {1}): {2} (cierra Antigravity primero)',
    breakdown: 'Desglose',
    main: 'Principales',
    subagent: 'Subagentes',
    wal: 'WAL',
    unknown: 'Sin indexar',
    lsMem: 'RAM en segundo plano',
    archivable: 'Archivable',
    archSub: 'Subagentes finalizados',
    archOld: 'Chats principales >14 d (conserva 20 recientes)',
    topTitle: 'Top 5 conversaciones por tamaño (solo lectura)',
    batchTitle: 'Lotes de archivo sin pérdida',
    none: 'Ninguno',
    hint: 'Política sin pérdida: solo mover con manifest.json y restauración por lote; cierra Antigravity antes de ejecutar scripts.',
  },
  fr: {
    summary: 'Détails de stockage et archivage sans perte',
    archiveOldMain: 'Inclure chats >14 j',
    restoreBtn: 'Script de restauration',
    refreshBtn: 'Actualiser',
    restoreReadyTpl: 'Script de restauration prêt ({0}) : {1} (fermez Antigravity d’abord)',
    oldMainReadyTpl: 'Script chats >14 j prêt ({0} élém. / {1}) : {2} (fermez Antigravity d’abord)',
    breakdown: 'Répartition',
    main: 'Principales',
    subagent: 'Sous-agents',
    wal: 'WAL',
    unknown: 'Non indexés',
    lsMem: 'RAM arrière-plan',
    archivable: 'Archivable',
    archSub: 'Sous-agents terminés',
    archOld: 'Chats principaux >14 j (garde les 20 derniers)',
    topTitle: 'Top 5 des conversations les plus volumineuses (lecture seule)',
    batchTitle: 'Lots d’archivage sans perte',
    none: 'Aucun',
    hint: 'Politique sans perte : déplacement seul avec manifest.json et restauration par lot ; fermez Antigravity avant d’exécuter les scripts.',
  },
  de: {
    summary: 'Speicherdetails & verlustfreie Archiv-Werkbank',
    archiveOldMain: 'Hauptchats >14 T. einschließen',
    restoreBtn: 'Offline-Wiederherstellungsskript',
    refreshBtn: 'Aktualisieren',
    restoreReadyTpl: 'Wiederherstellungsskript bereit ({0}): {1} (Antigravity vorher beenden)',
    oldMainReadyTpl: 'Archivskript >14 T. bereit ({0} Einträge / {1}): {2} (Antigravity vorher beenden)',
    breakdown: 'Aufschlüsselung',
    main: 'Hauptchats',
    subagent: 'Subagenten',
    wal: 'WAL',
    unknown: 'Nicht indiziert',
    lsMem: 'Hintergrund-RAM',
    archivable: 'Archivierbar',
    archSub: 'Beendete Subagenten',
    archOld: 'Alte Hauptchats >14 T. (behält letzte 20)',
    topTitle: 'Top 5 größte Unterhaltungen (nur Lesen)',
    batchTitle: 'Verlustfreie Archivstapel',
    none: 'Keine',
    hint: 'Verlustfrei-Richtlinie: nur Verschieben mit manifest.json und stapelweiser Wiederherstellung; Antigravity vor Skriptstart schließen.',
  },
};

export const WORKBENCH_SUPPORTED_LANGS = Object.freeze(['zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'es', 'fr', 'de']);

export function normalizeWorkbenchLang(lang = 'en') {
  const s = String(lang || '').trim().toLowerCase().replace(/_/g, '-');
  if (!s || s === 'auto') return 'en';
  if (s === 'zh-tw' || s === 'zh-hk' || s === 'zh-mo' || s.startsWith('zh-hant')) return 'zh-TW';
  if (s === 'zh' || s === 'zh-cn' || s === 'zh-sg' || s.startsWith('zh-hans') || s === 'yue' || s.startsWith('yue-') || s === 'zh-yue') return 'zh-CN';
  if (s === 'ja' || s.startsWith('ja-')) return 'ja';
  if (s === 'ko' || s.startsWith('ko-')) return 'ko';
  if (s === 'es' || s.startsWith('es-')) return 'es';
  if (s === 'fr' || s.startsWith('fr-')) return 'fr';
  if (s === 'de' || s.startsWith('de-')) return 'de';
  return 'en';
}

export function getStorageWorkbenchLabels(lang = 'en') {
  return STORAGE_WB_I18N[normalizeWorkbenchLang(lang)] || STORAGE_WB_I18N.en;
}

function fmtSizeMb(mb) {
  const n = Number(mb) || 0;
  return n >= 1024 ? `${(n / 1024).toFixed(2)} GB` : `${n.toFixed(1)} MB`;
}

export function formatStorageDetailReport(detail = {}, lang = 'en') {
  const L = getStorageWorkbenchLabels(lang);
  const lines = [];
  const unkPart = Number(detail.unknownCount) > 0 ? ` · ${L.unknown} ${detail.unknownCount} (${fmtSizeMb(detail.unknownMb)})` : '';
  const lsMemPart = Number(detail.lsMemoryMb) > 0 ? ` · ${L.lsMem} ${fmtSizeMb(detail.lsMemoryMb)}` : '';
  const subHours = Number.isFinite(Number(detail.subagentMaxAgeHours))
    ? Number(detail.subagentMaxAgeHours)
    : AUTO_ARCHIVE_SUBAGENT_MAX_AGE_HOURS;
  lines.push(
    `${L.breakdown}: ${fmtSizeMb(detail.totalMb)} (${detail.conversationCount || 0}) | ${L.main} ${detail.mainCount || 0} (${fmtSizeMb(detail.mainMb)}) · ${L.subagent} ${detail.subagentCount || 0} (${fmtSizeMb(detail.subagentMb)}) · ${L.wal} ${fmtSizeMb(detail.walMb)}${unkPart}${lsMemPart}`
  );
  lines.push(
    `${L.archivable}: ${L.archSub} (>${subHours}h) ${detail.archivableSubagentCount || 0} (${fmtSizeMb(detail.archivableSubagentMb)}) | ${L.archOld} ${detail.archivableOldMainCount || 0} (${fmtSizeMb(detail.archivableOldMainMb)})`
  );
  lines.push('');
  lines.push(`${L.topTitle}:`);
  const top = Array.isArray(detail.topConsumers) ? detail.topConsumers : [];
  if (top.length === 0) {
    lines.push(`  - ${L.none}`);
  } else {
    top.forEach((it, idx) => {
      const tag = it.kind === 'subagent' ? L.subagent : it.kind === 'main' ? L.main : L.unknown;
      const safeTitle = sanitizeTitleForReport(it.title);
      const titlePart = safeTitle ? ` · ${safeTitle}` : ` · ${String(it.id || '').slice(0, 8)}`;
      const agePart = Number.isFinite(it.ageDays) ? ` · ${Math.round(it.ageDays)}d` : '';
      lines.push(`  ${idx + 1}. [${tag}] ${fmtSizeMb(it.mb)}${agePart}${titlePart}`);
    });
  }
  lines.push('');
  lines.push(`${L.batchTitle}:`);
  const batches = Array.isArray(detail.batches) ? detail.batches : [];
  if (batches.length === 0) {
    lines.push(`  - ${L.none}`);
  } else {
    batches.forEach((b) => {
      const ts = b.createdAt ? ` · ${String(b.createdAt).slice(0, 16).replace('T', ' ')}` : '';
      lines.push(`  - ${b.batchName} (${b.movedCount || 0} / ${fmtSizeMb(b.movedMb)} · ${b.status || 'completed'}${ts})`);
    });
  }
  lines.push('');
  lines.push(L.hint);
  return lines.join('\n');
}

export function readLastArchiveResult(archiveDir = getDefaultArchiveDir()) {
  try {
    const filePath = path.join(path.resolve(archiveDir), LAST_ARCHIVE_RESULT_FILENAME);
    const st = assertPathChainNoSymlinks(filePath, 'last archive result');
    if (!st || !st.isFile() || st.size > 256 * 1024) return null;
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeLastArchiveResult(archiveDir = getDefaultArchiveDir(), result = {}) {
  try {
    const safeArchive = ensureSafeDir(archiveDir);
    const filePath = path.join(safeArchive, LAST_ARCHIVE_RESULT_FILENAME);
    const payload = {
      schema: 1,
      recordedAt: new Date().toISOString(),
      action: String(result.action || 'archive'),
      ok: Boolean(result.ok),
      code: result.code ? String(result.code) : '',
      error: result.error ? String(result.error).slice(0, 400) : '',
      movedCount: Number(result.movedCount || 0) || 0,
      movedMb: Number(result.movedMb || 0) || 0,
      restoredCount: Number(result.restoredCount || 0) || 0,
      batchName: result.batchName ? String(result.batchName) : '',
      relaunched: Boolean(result.relaunched),
      ...(result.manualQuitRequired ? { manualQuitRequired: true } : {}),
    };
    atomicWriteJsonSync(filePath, payload);
    return payload;
  } catch {
    return null;
  }
}

export function writeActiveArchiveTask(archiveDir = getDefaultArchiveDir(), info = {}) {
  try {
    const safeArchive = ensureSafeDir(archiveDir);
    const filePath = path.join(safeArchive, ACTIVE_ARCHIVE_TASK_FILENAME);
    const pidNum = Number(info.pid);
    const payload = {
      schema: 1,
      action: String(info.action || 'archive-and-restart'),
      pid: Number.isInteger(pidNum) && pidNum > 0 ? pidNum : 0,
      startedAt: new Date().toISOString(),
    };
    atomicWriteJsonSync(filePath, payload);
    return payload;
  } catch {
    return null;
  }
}

export function clearActiveArchiveTask(archiveDir = getDefaultArchiveDir(), expectedPid = 0) {
  try {
    const filePath = path.join(path.resolve(archiveDir), ACTIVE_ARCHIVE_TASK_FILENAME);
    const st = assertPathChainNoSymlinks(filePath, 'active archive task');
    if (!st || !st.isFile()) return false;
    if (Number.isInteger(expectedPid) && expectedPid > 0) {
      try {
        const cur = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (cur && Number.isInteger(cur.pid) && cur.pid > 0 && cur.pid !== expectedPid) {
          return false;
        }
      } catch {}
    }
    fs.unlinkSync(filePath);
    return true;
  } catch {
    return false;
  }
}

function normalizeMacAppBundlePath(rawPath) {
  const s = String(rawPath || '').trim();
  if (!s) return '/Applications/Antigravity.app';
  const m = /^(.+?\.app)(?:\/.*)?$/i.exec(s);
  if (m && m[1]) return m[1];
  return '/Applications/Antigravity.app';
}

const WIN_ENV_REG_KEY = 'HKCU\\Environment';
const APP_STORAGE_MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_GOMEMLIMIT_RE = /^(?:1536MiB|2GiB|2500MiB|3GiB|4GiB)$/;
const LINUX_ENVD_GOMEMLIMIT_LINE_RE = /^GOMEMLIMIT=([0-9]+(B|KiB|MiB|GiB|TiB))$/;

function parseWindowsRegQueryValue(output, valueName = 'GOMEMLIMIT') {
  const escaped = String(valueName || 'GOMEMLIMIT').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^\\s*${escaped}\\s+REG_(?:EXPAND_)?SZ\\s+(.+?)\\s*$`, 'im');
  for (const rawLine of String(output || '').split(/\r?\n/)) {
    const m = re.exec(rawLine);
    if (m && m[1]) return m[1].trim();
  }
  return '';
}

function isWindowsRegNotFoundError(err) {
  const msg = String(err?.stderr || err?.message || err || '');
  if (/access is denied|拒绝访问|permission denied|ENOENT|EACCES|EPERM/i.test(msg)) {
    return false;
  }
  if (/unable to find|cannot find|not found|找不到|見つかりません|찾을 수 없|no se encontr|introuvable|nicht gefunden/i.test(msg)) {
    return true;
  }
  return Number(err?.status) === 1 || Number(err?.code) === 1;
}

export function readWindowsUserGoMemLimitSync(opts = {}) {
  const execSyncFn = typeof opts.execFileSyncFn === 'function' ? opts.execFileSyncFn : execFileSync;
  try {
    const out = execSyncFn(
      'reg.exe',
      ['query', WIN_ENV_REG_KEY, '/v', 'GOMEMLIMIT'],
      { encoding: 'utf8', windowsHide: true, timeout: 4000, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    const value = parseWindowsRegQueryValue(out, 'GOMEMLIMIT');
    return { found: Boolean(value), notFound: !value, value };
  } catch (err) {
    if (isWindowsRegNotFoundError(err)) {
      return { found: false, notFound: true, value: '' };
    }
    return { found: false, notFound: false, value: '' };
  }
}

export function getDefaultWindowsAppStoragePath({ env = process.env, homeDir = os.homedir() } = {}) {
  const appData =
    typeof env?.APPDATA === 'string' && env.APPDATA.trim()
      ? env.APPDATA.trim()
      : path.join(homeDir, 'AppData', 'Roaming');
  return path.join(appData, 'Antigravity', 'app_storage.json');
}

/**
 * Windows 托盘防卡死守卫：
 *   在请求 Antigravity 优雅退出前，若 app_storage.json 中开启了 runInBackground="true"，
 *   通过全链路 lstatSync 非符号链接校验 + 原子排他写将其临时挂起为 "false"；
 *   并在调用方 finally 阶段重读磁盘最新 app_storage.json（保留宿主退出期间写入的布局/状态字段），
 *   带 3 次短重试无损恢复原值。
 */
export function suspendWindowsRunInBackgroundForQuit(appStoragePath, opts = {}) {
  const platform = opts.platform || process.platform;
  const resolved = appStoragePath ? path.resolve(String(appStoragePath)) : '';
  const noop = {
    suspended: false,
    filePath: resolved,
    originalValue: undefined,
    reason: 'skipped',
    restore: async () => false,
  };
  if (platform !== 'win32' || !resolved) return noop;

  const writeFn = typeof opts.writeAtomicFn === 'function' ? opts.writeAtomicFn : atomicWriteTextExclusiveSync;
  const readFn = typeof opts.readFileSyncFn === 'function' ? opts.readFileSyncFn : fs.readFileSync;
  let originalValue;
  try {
    const st = assertPathChainNoSymlinks(resolved, 'Antigravity app_storage.json');
    if (!st || !st.isFile() || st.size > APP_STORAGE_MAX_BYTES) {
      return { ...noop, reason: 'missing-or-invalid' };
    }
    const raw = readFn(resolved, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ...noop, reason: 'invalid-json' };
    }
    originalValue = parsed.runInBackground;
    if (originalValue !== 'true' && originalValue !== true) {
      return { ...noop, reason: 'not-enabled', originalValue };
    }
    const suspendedPayload = {
      ...parsed,
      runInBackground: typeof originalValue === 'boolean' ? false : 'false',
    };
    writeFn(resolved, JSON.stringify(suspendedPayload, null, 2) + '\n', 0o600);
  } catch (err) {
    return { ...noop, reason: 'error', error: String(err?.message || err) };
  }

  let restored = false;
  const restore = async ({ retries = 3, retryDelayMs = 50, sleepFn } = {}) => {
    if (restored) return true;
    const maxAttempts = Math.max(1, Math.min(10, Number(retries) || 3));
    const delayMs = Math.max(0, Math.min(2000, Number(retryDelayMs ?? 50)));
    const wait =
      typeof sleepFn === 'function'
        ? sleepFn
        : typeof opts.sleepFn === 'function'
          ? opts.sleepFn
          : (ms) => new Promise((r) => setTimeout(r, ms));
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const st = assertPathChainNoSymlinks(resolved, 'Antigravity app_storage.json');
        if (!st || !st.isFile() || st.size > APP_STORAGE_MAX_BYTES) {
          throw new Error('Antigravity app_storage.json missing or unsafe during restore');
        }
        const latestRaw = readFn(resolved, 'utf8');
        const latest = JSON.parse(latestRaw);
        if (!latest || typeof latest !== 'object' || Array.isArray(latest)) {
          throw new Error('Antigravity app_storage.json contains non-object JSON during restore');
        }
        latest.runInBackground = originalValue;
        writeFn(resolved, JSON.stringify(latest, null, 2) + '\n', 0o600);
        restored = true;
        return true;
      } catch (err) {
        if (/symbolic link/i.test(String(err?.message || ''))) {
          return false;
        }
        if (attempt < maxAttempts && delayMs > 0) {
          await wait(delayMs);
        }
      }
    }
    return false;
  };

  return {
    suspended: true,
    filePath: resolved,
    originalValue,
    reason: 'suspended',
    restore,
  };
}

export function readLinuxEnvDGoMemLimit(opts = {}) {
  const env = opts.env || process.env;
  const homeDir = opts.homeDir ? path.resolve(opts.homeDir) : os.homedir();
  const hasCustomHome = Boolean(opts.homeDir && path.resolve(opts.homeDir) !== path.resolve(os.homedir()));
  const xdgConfig =
    !hasCustomHome && env && typeof env.XDG_CONFIG_HOME === 'string' && env.XDG_CONFIG_HOME.trim()
      ? path.resolve(env.XDG_CONFIG_HOME.trim())
      : path.join(homeDir, '.config');
  const confPath = opts.envFile
    ? path.resolve(opts.envFile)
    : path.join(xdgConfig, 'environment.d', '90-obsidian-prism-gomemlimit.conf');
  try {
    const dirStat = fs.lstatSync(path.dirname(confPath));
    if (dirStat.isSymbolicLink() || !dirStat.isDirectory()) return '';
    const fileStat = fs.lstatSync(confPath);
    if (fileStat.isSymbolicLink() || !fileStat.isFile()) return '';
    const lines = fs.readFileSync(confPath, 'utf8').split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const m = LINUX_ENVD_GOMEMLIMIT_LINE_RE.exec(line);
      if (m && m[1]) return m[1];
    }
    return '';
  } catch {
    return '';
  }
}

export function resolveLinuxHostExecutable(exePath, opts = {}) {
  const existsFn = typeof opts.existsSync === 'function' ? opts.existsSync : fs.existsSync;
  const homeDir = opts.homeDir ? path.resolve(opts.homeDir) : os.homedir();
  const explicit = String(exePath || '').trim();
  if (explicit) {
    if (!explicit.includes('/') && !explicit.includes('\\')) {
      return explicit;
    }
    try {
      if (existsFn(explicit)) return explicit;
    } catch {}
  }
  const candidates = Array.isArray(opts.candidatePaths) && opts.candidatePaths.length > 0
    ? opts.candidatePaths
    : [
        '/usr/share/antigravity/antigravity',
        '/opt/Antigravity/antigravity',
        '/usr/bin/antigravity',
        path.join(homeDir, '.local', 'bin', 'antigravity'),
      ];
  for (const cand of candidates) {
    if (!cand) continue;
    try {
      if (existsFn(cand)) return cand;
    } catch {}
  }
  return 'antigravity';
}

function normalizeLoopbackCdpPort(rawPort) {
  const n = Number(rawPort);
  return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : 0;
}

function normalizeExpectedBrowserWsPath(rawPath) {
  const s = String(rawPath || '').trim();
  if (!s || /[\r\n\s]/.test(s) || !s.startsWith('/devtools/browser/')) return '';
  return s;
}

function isAntigravityCdpTarget(target) {
  if (!target || !target.webSocketDebuggerUrl) return false;
  const url = String(target.url || '').trim();
  const title = String(target.title || '').trim();
  if (!url) return false;
  const lowUrl = url.toLowerCase();
  if (
    (target.type === 'iframe' || target.type === 'page') &&
    /^plugin:\/\/swarm--swarm_board-\d+(?:\/|$)/i.test(lowUrl)
  ) {
    return true;
  }
  if (target.type !== 'page') return false;
  if (
    lowUrl.startsWith('devtools://') ||
    lowUrl.startsWith('data:') ||
    lowUrl.startsWith('about:') ||
    lowUrl.startsWith('chrome:') ||
    lowUrl.startsWith('chrome-extension:') ||
    lowUrl.startsWith('edge:') ||
    lowUrl.startsWith('blob:') ||
    lowUrl.startsWith('plugin:')
  ) {
    return false;
  }
  if (/\bvisual studio code\b/i.test(title) && !/\bantigravity\b/i.test(title)) {
    return false;
  }
  if (lowUrl.startsWith('vscode-file://') || lowUrl.startsWith('app://')) {
    return true;
  }
  if (lowUrl.startsWith('file://')) {
    return /workbench|antigravity/i.test(lowUrl) || /\bantigravity\b/i.test(title);
  }
  const m = /^(https?):\/\/(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?(\/[^?#]*)?(?:[?#]|$)/i.exec(url);
  if (!m) return false;
  const pathname = (m[3] || '/').toLowerCase();
  if (/^\/(?:viewer(?:\/|$)|sandbox(?:\/|$)|stream(?:\/|$)|api(?:\/|$))/.test(pathname)) {
    return false;
  }
  return /\bantigravity\b/i.test(title);
}

/**
 * 通过本机回环 CDP 浏览器端点发送标准 Browser.close 请求宿主优雅退出（触发 Electron app.quit()，
 * 避免 Windows 托盘拦截 WM_CLOSE 导致 CloseMainWindow() 仅最小化到托盘而不退出）。
 * 发送前严格校验 /json/version 与 /json/list 均属于本机 Antigravity 宿主实例，绝不误关其他应用；
 * 超时未收到 ACK 且未关闭时 fail-closed 返回 false，立即交由 OS 级温和退出回退。
 */
export async function requestCdpBrowserClose(cdpPort, opts = {}) {
  const port = normalizeLoopbackCdpPort(cdpPort);
  if (!port) return false;
  const fetchImpl = typeof opts.fetchImpl === 'function' ? opts.fetchImpl : globalThis.fetch;
  const WsCtor = typeof opts.WebSocketCtor === 'function' ? opts.WebSocketCtor : globalThis.WebSocket;
  if (typeof fetchImpl !== 'function' || typeof WsCtor !== 'function') return false;
  const timeoutMs = Math.max(200, Math.min(8000, Number(opts.timeoutMs) || 2500));
  const expectedPath = normalizeExpectedBrowserWsPath(opts.expectedBrowserWsPath);

  const fetchJsonLoopback = async (endpointPath) => {
    const controller = new AbortController();
    const fetchTimer = setTimeout(() => controller.abort(), Math.min(1500, timeoutMs));
    try {
      const res = await fetchImpl(`http://127.0.0.1:${port}${endpointPath}`, { signal: controller.signal });
      if (!res || !res.ok) return null;
      return await res.json();
    } catch {
      return null;
    } finally {
      clearTimeout(fetchTimer);
    }
  };

  const info = await fetchJsonLoopback('/json/version');
  if (!info || typeof info !== 'object') return false;
  const browserSig = `${String(info.Browser || '')} ${String(info['User-Agent'] || '')}`;
  if (/\bEdg\//i.test(browserSig) && !/\bAntigravity\b/i.test(browserSig)) {
    return false;
  }
  const wsUrl = typeof info.webSocketDebuggerUrl === 'string' ? info.webSocketDebuggerUrl.trim() : '';

  let parsed;
  try {
    parsed = new URL(wsUrl);
  } catch {
    return false;
  }
  const hostOk = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost' || parsed.hostname === '[::1]';
  const portNum = parsed.port ? Number(parsed.port) : 80;
  if (parsed.protocol !== 'ws:' || !hostOk || portNum !== port || !parsed.pathname.startsWith('/devtools/browser/')) {
    return false;
  }
  if (expectedPath && parsed.pathname !== expectedPath) {
    return false;
  }

  // 二次校验 /json/list 确认目标端口属于 Antigravity，防止复用端口误关 Chrome/Edge/VS Code/其他 Electron
  const targets = await fetchJsonLoopback('/json/list');
  if (!Array.isArray(targets) || !targets.some(isAntigravityCdpTarget)) {
    return false;
  }

  return new Promise((resolve) => {
    let settled = false;
    let sent = false;
    let ws = null;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        if (ws && typeof ws.close === 'function') ws.close();
      } catch {}
      resolve(Boolean(ok));
    };
    // 超时未收到 {id:1} ACK 且未正常关闭时一律 fail-closed 返回 false
    const timer = setTimeout(() => finish(false), timeoutMs);
    try {
      ws = new WsCtor(parsed.href);
    } catch {
      finish(false);
      return;
    }
    const onOpen = () => {
      try {
        ws.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
        sent = true;
      } catch {
        finish(false);
      }
    };
    const onMessage = (evt) => {
      try {
        const raw = typeof evt === 'string' ? evt : evt?.data;
        const msg = JSON.parse(String(raw || ''));
        if (msg && msg.id === 1) {
          finish(!msg.error);
        }
      } catch {}
    };
    const onClose = () => finish(sent);
    const onError = () => finish(false);
    if (typeof ws.addEventListener === 'function') {
      ws.addEventListener('open', onOpen, { once: true });
      ws.addEventListener('message', onMessage);
      ws.addEventListener('close', onClose, { once: true });
      ws.addEventListener('error', onError, { once: true });
    } else if (typeof ws.on === 'function') {
      ws.once('open', onOpen);
      ws.on('message', onMessage);
      ws.once('close', onClose);
      ws.once('error', onError);
    } else {
      finish(false);
    }
  });
}

export async function requestGracefulHostQuit(hostPid, exePath, platform = process.platform, opts = {}) {
  const detailed = Boolean(opts?.detailed);
  const makeResult = (ok, method, code = '', message = '') =>
    detailed
      ? { ok: Boolean(ok), method, manualQuitRequired: code === 'MANUAL_QUIT_REQUIRED', code, message }
      : Boolean(ok);
  const cdpPort = normalizeLoopbackCdpPort(opts?.cdpPort);
  const cdpCloseFn = typeof opts?.requestCdpClose === 'function' ? opts.requestCdpClose : requestCdpBrowserClose;
  if (cdpPort > 0) {
    try {
      const closedViaCdp = await cdpCloseFn(cdpPort, opts);
      if (closedViaCdp) return makeResult(true, 'cdp');
    } catch {}
  }
  const execSyncFn = typeof opts?.execFileSyncFn === 'function' ? opts.execFileSyncFn : execFileSync;
  const killFn = typeof opts?.killFn === 'function' ? opts.killFn : process.kill;
  try {
    if (platform === 'win32') {
      // Windows 零脚本/零强杀策略：无可用 loopback CDP 或 CDP 未响应时返回温和提示，引导用户手动完全退出
      return makeResult(
        false,
        'manual-required',
        'MANUAL_QUIT_REQUIRED',
        '当前无法通过本机 CDP 自动关闭 Antigravity，请先手动完全退出 Antigravity 后重试。'
      );
    }
    if (platform === 'darwin') {
      const appPath = normalizeMacAppBundlePath(exePath);
      try {
        execSyncFn(
          'osascript',
          ['-e', 'on run argv', '-e', 'tell application (item 1 of argv) to quit', '-e', 'end run', appPath],
          { timeout: 5000, stdio: 'ignore' }
        );
        return makeResult(true, 'osascript');
      } catch {}
      if (Number.isInteger(hostPid) && hostPid > 0) {
        try { killFn(hostPid, 'SIGTERM'); return makeResult(true, 'sigterm'); } catch {}
      }
      return makeResult(false, 'manual-required', 'MANUAL_QUIT_REQUIRED', '请手动完全退出 Antigravity 后重试。');
    }
    if (Number.isInteger(hostPid) && hostPid > 0) {
      try { killFn(hostPid, 'SIGTERM'); return makeResult(true, 'sigterm'); } catch {}
    }
    return makeResult(false, 'manual-required', 'MANUAL_QUIT_REQUIRED', '请手动完全退出 Antigravity 后重试。');
  } catch {
    return makeResult(false, 'manual-required', 'MANUAL_QUIT_REQUIRED', '请手动完全退出 Antigravity 后重试。');
  }
}

export function launchHostWithCdpFlag(exePath, platform = process.platform, opts = {}) {
  const baseEnv = opts && opts.env ? opts.env : process.env;
  const spawnFn = opts && typeof opts.spawnFn === 'function' ? opts.spawnFn : spawn;
  const existsFn = opts && typeof opts.existsSync === 'function' ? opts.existsSync : fs.existsSync;
  const execSyncFn = opts && typeof opts.execFileSyncFn === 'function' ? opts.execFileSyncFn : execFileSync;
  const cleanEnv = { ...baseEnv };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  if (platform === 'win32') {
    // 通过原生 reg.exe 同步读取最新的用户级 GOMEMLIMIT（仅白名单值），使设置后紧接一键重启即可立即生效
    const regResult = readWindowsUserGoMemLimitSync({ execFileSyncFn: execSyncFn });
    if (regResult.found) {
      if (ALLOWED_GOMEMLIMIT_RE.test(regResult.value)) cleanEnv.GOMEMLIMIT = regResult.value;
      else if (!regResult.value) delete cleanEnv.GOMEMLIMIT;
    } else if (regResult.notFound) {
      delete cleanEnv.GOMEMLIMIT;
    }
    const resolvedExe =
      String(exePath || '').trim() ||
      path.join(baseEnv.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Programs', 'antigravity', 'Antigravity.exe');
    if (!existsFn(resolvedExe)) return false;
    try {
      const child = spawnFn(resolvedExe, ['--remote-debugging-port=0'], {
        cwd: path.dirname(resolvedExe),
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
        env: cleanEnv,
      });
      if (child && typeof child.on === 'function') child.on('error', () => {});
      if (child && typeof child.unref === 'function') child.unref();
      return Boolean(child && child.pid);
    } catch {
      return false;
    }
  }
  if (platform === 'darwin') {
    const appPath = normalizeMacAppBundlePath(exePath);
    try {
      const child = spawnFn('/usr/bin/open', ['-na', appPath, '--args', '--remote-debugging-port=0'], {
        detached: true,
        stdio: 'ignore',
        env: cleanEnv,
      });
      if (child && typeof child.on === 'function') child.on('error', () => {});
      if (child && typeof child.unref === 'function') child.unref();
      return Boolean(child && child.pid);
    } catch {
      return false;
    }
  }
  const freshLinuxGoMem = readLinuxEnvDGoMemLimit({
    env: baseEnv,
    homeDir: opts.homeDir,
    envFile: opts.envFile,
  });
  if (freshLinuxGoMem) {
    cleanEnv.GOMEMLIMIT = freshLinuxGoMem;
  }
  const resolvedExe = resolveLinuxHostExecutable(exePath, opts);
  try {
    const spawnOpts = {
      detached: true,
      stdio: 'ignore',
      env: cleanEnv,
    };
    if (resolvedExe.includes('/') && path.isAbsolute(resolvedExe)) {
      const parentDir = path.dirname(resolvedExe);
      try {
        const existsFn = typeof opts.existsSync === 'function' ? opts.existsSync : fs.existsSync;
        if (existsFn(parentDir)) spawnOpts.cwd = parentDir;
      } catch {}
    }
    const child = spawnFn(resolvedExe, ['--remote-debugging-port=0'], spawnOpts);
    if (child && typeof child.on === 'function') child.on('error', () => {});
    if (child && typeof child.unref === 'function') child.unref();
    return Boolean(child && child.pid);
  } catch {
    return false;
  }
}

/**
 * 纯异步离线归档/还原与可选重启编排器：
 *   1) 如需重启：仅温和请求关闭 Antigravity（绝不强杀 language_server）
 *   2) 轮询等待 Antigravity 与 language_server 完全退出（超时则 fail-closed 中止）
 *   3) 退出后静置 3~5 秒并执行双重 fail-closed isLanguageServerRunning() 确认无锁
 *   4) 执行原子移动归档或无损还原（途中若宿主重开立刻安全中止）
 *   5) 如需重启：携带 --remote-debugging-port=0 重开 Antigravity
 */
export async function executeArchiveTaskSequence(task = {}, hooks = {}) {
  const action = String(task.action || 'archive-and-restart');
  const targetPlatform = hooks.platform || process.platform;
  const convDir = task.convDir ? path.resolve(String(task.convDir)) : getDefaultConversationsDir();
  const archiveDir = task.archiveDir ? path.resolve(String(task.archiveDir)) : getDefaultArchiveDir();
  const hostPid = Number(task.hostPid) || 0;
  const cdpPort = normalizeLoopbackCdpPort(task.cdpPort);
  const expectedBrowserWsPath = normalizeExpectedBrowserWsPath(task.cdpBrowserWsPath);
  const exePath = String(task.exePath || '').trim();
  const gracefulQuit = Boolean(task.gracefulQuit);
  const relaunch = Boolean(task.relaunch);
  const waitExitTimeoutMs = Math.max(500, Math.min(180000, Number(task.waitExitTimeoutMs) || 45000));
  const pollMs = Math.max(50, Math.min(3000, Number(task.pollMs) || 500));
  const settleMs = Math.max(0, Math.min(15000, Number(task.settleMs ?? 4000)));
  const recheckGapMs = Math.max(0, Math.min(5000, Number(task.recheckGapMs ?? 1500)));
  const relaunchDelayMs = Math.max(0, Math.min(5000, Number(task.relaunchDelayMs ?? 500)));

  const sleepFn = typeof hooks.sleep === 'function' ? hooks.sleep : (ms) => new Promise((r) => setTimeout(r, ms));
  const hasCustomCheck = typeof hooks.checkRunning === 'function';
  let lastInspect = { running: false, blockers: [], ignoredAcp: [] };
  const safeIsRunning = () => {
    try {
      if (hasCustomCheck) {
        const r = Boolean(hooks.checkRunning());
        lastInspect = { running: r, blockers: r ? [{ imageName: 'custom-hook', pid: 0 }] : [], ignoredAcp: [] };
        return r;
      }
      lastInspect = inspectLanguageServerProcesses({ platform: targetPlatform });
      return Boolean(lastInspect.running);
    } catch {
      lastInspect = { running: true, blockers: [{ imageName: 'exception', pid: 0 }], ignoredAcp: [] };
      return true; // fail-closed
    }
  };
  safeIsRunning.__allowLoopThrottle = !hasCustomCheck;
  const quitHost =
    typeof hooks.requestGracefulQuit === 'function'
      ? hooks.requestGracefulQuit
      : (pid, exe, quitOpts) => requestGracefulHostQuit(pid, exe, targetPlatform, quitOpts);
  const launchHost =
    typeof hooks.launchHost === 'function'
      ? hooks.launchHost
      : () => launchHostWithCdpFlag(exePath, targetPlatform);
  const runArchive = typeof hooks.archiveFn === 'function' ? hooks.archiveFn : archiveConversations;
  const runRestore = typeof hooks.restoreFn === 'function' ? hooks.restoreFn : restoreArchiveBatch;

  const explicitAppStoragePath =
    typeof hooks.appStoragePath === 'string' && hooks.appStoragePath.trim()
      ? hooks.appStoragePath.trim()
      : typeof task.appStoragePath === 'string' && task.appStoragePath.trim()
        ? task.appStoragePath.trim()
        : '';
  const hasAnyTestHook = Boolean(
    typeof hooks.requestGracefulQuit === 'function' ||
      typeof hooks.checkRunning === 'function' ||
      typeof hooks.launchHost === 'function' ||
      typeof hooks.archiveFn === 'function' ||
      typeof hooks.restoreFn === 'function' ||
      typeof hooks.sleep === 'function'
  );
  // 单测未显式传入 appStoragePath 时自动跳过，绝不触碰本机真实 %APPDATA%\Antigravity\app_storage.json
  const effectiveAppStoragePath = explicitAppStoragePath
    ? explicitAppStoragePath
    : !hasAnyTestHook && targetPlatform === 'win32'
      ? getDefaultWindowsAppStoragePath()
      : '';

  const seqStartedAt = Date.now();
  const trace = (event, detail = {}) => appendArchiveTrace(archiveDir, event, detail);

  writeActiveArchiveTask(archiveDir, { action, pid: process.pid });
  trace('TASK_START', { action, hostPid, exePath, gracefulQuit, relaunch, waitExitTimeoutMs, settleMs });
  try {
    let exited = !safeIsRunning();
    let quitRequested = false;
    let runInBgGuard = null;
    try {
      if (gracefulQuit && !exited) {
        if (targetPlatform === 'win32' && effectiveAppStoragePath) {
          runInBgGuard = suspendWindowsRunInBackgroundForQuit(effectiveAppStoragePath, {
            platform: targetPlatform,
            sleepFn,
            writeAtomicFn: hooks.writeAppStorageAtomicFn,
            readFileSyncFn: hooks.readAppStorageSyncFn,
          });
          trace('RUN_IN_BG_GUARD', { suspended: Boolean(runInBgGuard?.suspended), initialBlockers: lastInspect.blockers });
        }
        const firstQuit = await quitHost(hostPid, exePath, { cdpPort, expectedBrowserWsPath, attempt: 1 });
        quitRequested = Boolean(firstQuit && (firstQuit === true || firstQuit.ok === true));
        trace('QUIT_REQUESTED', { ok: quitRequested });
      }

      // 等待 Antigravity 与 language_server 完全退出
      const deadline = Date.now() + waitExitTimeoutMs;
      exited = !safeIsRunning();
      let nudged = false;
      let pollIter = 0;
      let lastPollTraceAt = 0;
      const nudgeAt = Date.now() + Math.min(5000, Math.floor(waitExitTimeoutMs / 3));
      while (!exited && Date.now() <= deadline) {
        await sleepFn(pollMs);
        pollIter += 1;
        if (!safeIsRunning()) {
          exited = true;
          break;
        }
        const nowPoll = Date.now();
        if (pollIter === 1 || nowPoll - lastPollTraceAt >= 2500) {
          lastPollTraceAt = nowPoll;
          trace('WAIT_POLL', {
            elapsedMs: nowPoll - seqStartedAt,
            blockers: lastInspect.blockers,
            ignoredAcp: lastInspect.ignoredAcp,
          });
        }
        if (gracefulQuit && !nudged && nowPoll >= nudgeAt) {
          nudged = true;
          if (targetPlatform === 'win32') {
            if (cdpPort > 0) {
              const retryQuit = await quitHost(hostPid, exePath, { cdpPort, expectedBrowserWsPath, attempt: 2 });
              if (retryQuit && (retryQuit === true || retryQuit.ok === true)) quitRequested = true;
              trace('WAIT_NUDGE', { elapsedMs: Date.now() - seqStartedAt, ok: quitRequested, blockers: lastInspect.blockers });
            }
          } else {
            const retryQuit = await quitHost(hostPid, exePath, { cdpPort: 0, attempt: 2 });
            if (retryQuit && (retryQuit === true || retryQuit.ok === true)) quitRequested = true;
            trace('WAIT_NUDGE', { elapsedMs: Date.now() - seqStartedAt, ok: quitRequested, blockers: lastInspect.blockers });
          }
        }
      }
    } finally {
      if (runInBgGuard && runInBgGuard.suspended) {
        let restoredBg = false;
        try {
          restoredBg = Boolean(
            await runInBgGuard.restore({
              retries: 3,
              retryDelayMs: Number.isFinite(Number(hooks.appStorageRestoreDelayMs))
                ? Number(hooks.appStorageRestoreDelayMs)
                : 50,
              sleepFn,
            })
          );
        } catch {}
        trace('RUN_IN_BG_RESTORED', { restored: restoredBg });
      }
    }
    if (!exited) {
      const manualQuitRequired = Boolean(gracefulQuit && !quitRequested);
      const out = manualQuitRequired
        ? {
            ok: false,
            action,
            code: 'MANUAL_QUIT_REQUIRED',
            manualQuitRequired: true,
            error: '当前无法通过本机 CDP 自动关闭 Antigravity，请先手动完全退出 Antigravity 后重试（未移动任何文件）。',
            relaunched: false,
          }
        : {
            ok: false,
            action,
            code: 'HOST_EXIT_TIMEOUT',
            error: '等待 Antigravity 与 language_server 退出超时，已安全中止，未移动任何文件。',
            relaunched: false,
          };
      trace(out.code, {
        elapsedMs: Date.now() - seqStartedAt,
        blockers: lastInspect.blockers,
        ignoredAcp: lastInspect.ignoredAcp,
      });
      writeLastArchiveResult(archiveDir, out);
      return out;
    }

    trace('HOST_EXITED', { elapsedMs: Date.now() - seqStartedAt, ignoredAcp: lastInspect.ignoredAcp });

    // 静置 3~5 秒 + 双重 fail-closed 复检
    if (settleMs > 0) await sleepFn(settleMs);
    if (safeIsRunning()) {
      trace('HOST_RESTARTED_DURING_SETTLE', { phase: 'settle-1', blockers: lastInspect.blockers });
      const out = {
        ok: false,
        action,
        code: 'HOST_RESTARTED_DURING_SETTLE',
        error: '静置等待期间检测到 Antigravity 重新启动，已安全中止。',
        relaunched: false,
      };
      writeLastArchiveResult(archiveDir, out);
      return out;
    }
    if (recheckGapMs > 0) await sleepFn(recheckGapMs);
    if (safeIsRunning()) {
      trace('HOST_RESTARTED_DURING_SETTLE', { phase: 'settle-2', blockers: lastInspect.blockers });
      const out = {
        ok: false,
        action,
        code: 'HOST_RESTARTED_DURING_SETTLE',
        error: '二次复检期间检测到 Antigravity 重新启动，已安全中止。',
        relaunched: false,
      };
      writeLastArchiveResult(archiveDir, out);
      return out;
    }

    trace('SETTLE_PASSED', { settleMs, recheckGapMs });

    let opRes;
    if (action === 'restore-and-restart' || action === 'restore') {
      opRes = runRestore({
        convDir,
        archiveDir,
        batchName: task.batchName || 'latest',
        checkRunning: safeIsRunning,
      });
    } else {
      opRes = runArchive({
        convDir,
        archiveDir,
        mode: task.mode === 'subagents+old-main' ? 'subagents+old-main' : 'subagents',
        subagentMaxAgeHours: Number.isFinite(Number(task.subagentMaxAgeHours))
          ? Number(task.subagentMaxAgeHours)
          : AUTO_ARCHIVE_SUBAGENT_MAX_AGE_HOURS,
        mainMaxAgeDays: Number.isFinite(Number(task.mainMaxAgeDays)) ? Number(task.mainMaxAgeDays) : DEFAULT_MAIN_MAX_AGE_DAYS,
        keepRecentMain: Number.isInteger(Number(task.keepRecentMain)) ? Number(task.keepRecentMain) : DEFAULT_KEEP_RECENT_MAIN,
        checkRunning: safeIsRunning,
      });
    }

    trace('ARCHIVE_OP_FINISHED', {
      ok: Boolean(opRes?.ok),
      code: opRes?.code || null,
      movedCount: opRes?.movedCount || 0,
      movedMb: opRes?.movedMb || 0,
      restoredCount: opRes?.restoredCount || 0,
      batchName: opRes?.batchName || '',
      error: opRes?.error || null,
    });

    let relaunched = false;
    if (relaunch && opRes?.code !== 'LANGUAGE_SERVER_RUNNING' && !safeIsRunning()) {
      if (relaunchDelayMs > 0) await sleepFn(relaunchDelayMs);
      if (!safeIsRunning()) {
        relaunched = Boolean(await launchHost(exePath, ['--remote-debugging-port=0']));
      }
    }

    trace('TASK_DONE', { ok: Boolean(opRes?.ok), relaunched, totalElapsedMs: Date.now() - seqStartedAt });

    const finalOut = {
      ...opRes,
      action,
      relaunched,
    };
    writeLastArchiveResult(archiveDir, finalOut);
    return finalOut;
  } finally {
    clearActiveArchiveTask(archiveDir, process.pid);
  }
}

function isElectronHostBinaryPath(rawPath) {
  const s = String(rawPath || '').trim();
  if (!s) return false;
  const base = path.basename(s);
  if (/^(?:antigravity|agy)(?:\.exe)?$/i.test(base)) return true;
  if (/Antigravity(?:\s+Helper(?:\s+\([^)]+\))?)?\.app[\\/]Contents[\\/]MacOS[\\/]/i.test(s)) return true;
  return false;
}

/**
 * 解析离线归档脱离任务所用的 Node 运行时：
 *   1) 当前进程为独立 node 时直接复用；
 *   2) 当前进程为 Electron 宿主（ELECTRON_RUN_AS_NODE=1）时，优先查找系统独立 node；
 *   3) 若宿主机未安装全局 node（纯安装版 Antigravity 常见），安全回退复用宿主二进制 + ELECTRON_RUN_AS_NODE=1
 *      （配合 parseWindowsTasklistCsv / parsePosixProcessList 排除 selfPid，绝不触发自检死锁或 ENOENT 崩溃）。
 */
export function resolveArchiveNodeRuntime(
  nodeExec = process.execPath,
  { platform = process.platform, whichSync = null, existsSync = fs.existsSync } = {}
) {
  const raw = String(nodeExec || '').trim();
  if (!raw) throw new Error('Unable to resolve Node runtime path');
  if (!isElectronHostBinaryPath(raw)) {
    return { execPath: assertSafeHelperPath(path.resolve(raw), 'nodeExecPath'), useElectronAsNode: false };
  }

  const candidates = [];
  const runWhich = (bin, args) => {
    try {
      const out =
        typeof whichSync === 'function'
          ? whichSync(bin, args)
          : execFileSync(bin, args, {
              encoding: 'utf8',
              windowsHide: true,
              timeout: 3000,
              stdio: ['ignore', 'pipe', 'ignore'],
            });
      for (const line of String(out || '').split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed) candidates.push(trimmed);
      }
    } catch {}
  };
  if (platform === 'win32') {
    runWhich('where.exe', ['node.exe']);
  } else {
    runWhich('which', ['node']);
    candidates.push('/opt/homebrew/bin/node', '/usr/local/bin/node', '/usr/bin/node');
  }

  for (const cand of candidates) {
    try {
      if (isElectronHostBinaryPath(cand)) continue;
      if (!existsSync(cand)) continue;
      const safeCand = assertSafeHelperPath(path.resolve(cand), 'nodeExecPath');
      return { execPath: safeCand, useElectronAsNode: false };
    } catch {}
  }

  const safeElectron = assertSafeHelperPath(path.resolve(raw), 'nodeExecPath');
  if (existsSync(safeElectron)) {
    return { execPath: safeElectron, useElectronAsNode: true };
  }
  throw new Error('No usable Node.js or Electron runtime found for detached archive task');
}

/**
 * 派生物理脱离当前进程树的独立离线任务进程（纯 Node 原生 detached spawn + unref）。
 */
export function spawnDetachedArchiveTask(task = {}, opts = {}) {
  const targetPlatform = opts.platform || process.platform;
  const archiveDir = ensureSafeDir(task.archiveDir || getDefaultArchiveDir());
  const scriptPath = assertSafeHelperPath(
    path.resolve(opts.scriptPath || fileURLToPath(import.meta.url)),
    'scriptPath'
  );
  const runtime = resolveArchiveNodeRuntime(opts.nodeExecPath || process.execPath, {
    platform: targetPlatform,
    whichSync: opts.whichSync,
    existsSync: opts.existsSync,
  });
  const safeNodeExec = runtime.execPath;
  const useElectronAsNode = runtime.useElectronAsNode;
  const taskFile = path.join(archiveDir, `.archive-task-${crypto.randomBytes(6).toString('hex')}.json`);

  const safePayload = {
    schema: 1,
    action: String(task.action || 'archive-and-restart'),
    convDir: path.resolve(task.convDir || getDefaultConversationsDir()),
    archiveDir,
    hostPid: Number(task.hostPid) || 0,
    cdpPort: normalizeLoopbackCdpPort(task.cdpPort),
    cdpBrowserWsPath: normalizeExpectedBrowserWsPath(task.cdpBrowserWsPath),
    exePath: String(task.exePath || '').trim(),
    gracefulQuit: Boolean(task.gracefulQuit),
    relaunch: Boolean(task.relaunch),
    mode: task.mode === 'subagents+old-main' ? 'subagents+old-main' : 'subagents',
    subagentMaxAgeHours: Number.isFinite(Number(task.subagentMaxAgeHours))
      ? Number(task.subagentMaxAgeHours)
      : AUTO_ARCHIVE_SUBAGENT_MAX_AGE_HOURS,
    batchName: String(task.batchName || 'latest'),
    settleMs: Number.isFinite(Number(task.settleMs)) ? Number(task.settleMs) : 4000,
    waitExitTimeoutMs: Number.isFinite(Number(task.waitExitTimeoutMs)) ? Number(task.waitExitTimeoutMs) : 45000,
    ...(typeof task.appStoragePath === 'string' && task.appStoragePath.trim()
      ? { appStoragePath: path.resolve(task.appStoragePath.trim()) }
      : {}),
  };
  atomicWriteJsonSync(taskFile, safePayload);

  if (typeof opts.spawnHook === 'function') {
    const hookRes = opts.spawnHook({ nodeExec: safeNodeExec, useElectronAsNode, scriptPath, taskFile, payload: safePayload });
    if (hookRes?.spawned && Number.isInteger(hookRes.pid) && hookRes.pid > 0) {
      writeActiveArchiveTask(archiveDir, { action: safePayload.action, pid: hookRes.pid });
    }
    return hookRes;
  }

  const baseEnv = opts.env && typeof opts.env === 'object' ? opts.env : process.env;
  const cleanEnv = { ...baseEnv };
  if (useElectronAsNode) cleanEnv.ELECTRON_RUN_AS_NODE = '1';
  else delete cleanEnv.ELECTRON_RUN_AS_NODE;

  const cleanupTaskFile = () => {
    try { fs.unlinkSync(taskFile); } catch {}
  };

  const spawnFn = typeof opts.spawnFn === 'function' ? opts.spawnFn : spawn;
  const safeTaskFile = targetPlatform === 'win32' ? assertSafeHelperPath(taskFile, 'taskFile') : taskFile;
  const spawnOpts = {
    detached: true,
    stdio: 'ignore',
    cwd: os.tmpdir(),
    env: cleanEnv,
    ...(targetPlatform === 'win32' ? { windowsHide: true } : {}),
  };

  try {
    const child = spawnFn(safeNodeExec, [scriptPath, `--run-task=${safeTaskFile}`], spawnOpts);
    if (child && typeof child.on === 'function') child.on('error', () => {});
    if (!child || !child.pid) {
      cleanupTaskFile();
      return { spawned: false, code: 'SPAWN_FAILED', error: 'Failed to launch detached archive worker', taskFile: '' };
    }
    if (typeof child.unref === 'function') child.unref();
    writeActiveArchiveTask(archiveDir, { action: safePayload.action, pid: child.pid });
    return { spawned: true, pid: child.pid, method: 'detached-spawn', useElectronAsNode, taskFile };
  } catch (err) {
    cleanupTaskFile();
    return { spawned: false, code: 'SPAWN_FAILED', error: String(err?.message || err), taskFile: '' };
  }
}

async function fetchLiveSummariesViaClient() {
  try {
    const clientUrl = new URL('../../vendor/pulse-dashboard/sidecars/panel/client.mjs', import.meta.url);
    const { AntigravityClient } = await import(clientUrl.href);
    const cli = new AntigravityClient();
    try {
      const res = await cli.call('GetAllCascadeTrajectories', { excludeSubtrajectories: false });
      return res?.trajectorySummaries || null;
    } finally {
      cli.dispose();
    }
  } catch {
    return null;
  }
}

async function waitForLanguageServerExit(timeoutMs = 120000) {
  if (!isLanguageServerRunning()) return true;
  console.log('[等待] 检测到 language_server 仍在运行。请完全退出 Antigravity，脚本检测到退出后将自动开始安全归档…');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    if (!isLanguageServerRunning()) {
      await new Promise((r) => setTimeout(r, 1500));
      return true;
    }
  }
  return false;
}

function parseStrictCliNonNegativeNumber(flagName, rawValue, { integer = false } = {}) {
  if (typeof rawValue !== 'string' || rawValue.trim() === '') {
    throw new Error(`Invalid CLI option ${flagName}: expected a non-empty non-negative finite number`);
  }
  const n = Number(rawValue.trim());
  if (!Number.isFinite(n) || n < 0 || (integer && !Number.isInteger(n))) {
    throw new Error(
      `Invalid CLI option ${flagName}=${rawValue}: expected a non-negative finite ${integer ? 'integer' : 'number'}`
    );
  }
  return n;
}

export function parseCliArgs(argv) {
  const opts = {
    action: 'scan',
    mode: 'subagents',
    subagentHours: DEFAULT_SUBAGENT_MAX_AGE_HOURS,
    mainDays: DEFAULT_MAIN_MAX_AGE_DAYS,
    keepRecentMain: DEFAULT_KEEP_RECENT_MAIN,
    dryRun: false,
    waitExit: false,
    json: false,
    restoreBatch: 'latest',
    runTaskFile: '',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--scan') opts.action = 'scan';
    else if (a === '--prepare') opts.action = 'prepare';
    else if (a === '--archive') opts.action = 'archive';
    else if (a === '--restore') {
      opts.action = 'restore';
      if (argv[i + 1] && !argv[i + 1].startsWith('--')) opts.restoreBatch = argv[++i];
    } else if (a === '--list-batches') opts.action = 'list';
    else if (a === '--run-task') {
      throw new Error('Invalid CLI option --run-task: missing "=value"');
    } else if (a.startsWith('--run-task=')) {
      const f = a.slice('--run-task='.length).trim();
      if (!f) throw new Error('Invalid CLI option --run-task: expected non-empty path');
      opts.action = 'run-task';
      opts.runTaskFile = f;
    }
    else if (a === '--include-old-main') opts.mode = 'subagents+old-main';
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--wait-exit') opts.waitExit = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--subagent-hours' || a === '--main-days' || a === '--keep-main') {
      throw new Error(`Invalid CLI option ${a}: missing "=value"`);
    } else if (a.startsWith('--subagent-hours=')) {
      opts.subagentHours = parseStrictCliNonNegativeNumber('--subagent-hours', a.slice('--subagent-hours='.length));
    } else if (a.startsWith('--main-days=')) {
      opts.mainDays = parseStrictCliNonNegativeNumber('--main-days', a.slice('--main-days='.length));
    } else if (a.startsWith('--keep-main=')) {
      opts.keepRecentMain = parseStrictCliNonNegativeNumber('--keep-main', a.slice('--keep-main='.length), {
        integer: true,
      });
    }
  }
  return opts;
}

export async function executeCli(argv = process.argv.slice(2), deps = {}) {
  const opts = parseCliArgs(argv);
  const convDir = deps.convDir || getDefaultConversationsDir();
  const archiveDir = deps.archiveDir || getDefaultArchiveDir();
  const checkRunning = typeof deps.isRunning === 'function' ? deps.isRunning : isLanguageServerRunning;
  const waitExitFn = typeof deps.waitExit === 'function' ? deps.waitExit : waitForLanguageServerExit;
  const logOut = typeof deps.log === 'function' ? deps.log : console.log;
  const logErr = typeof deps.error === 'function' ? deps.error : console.error;
  const setExitCode = typeof deps.setExitCode === 'function' ? deps.setExitCode : (c) => { process.exitCode = c; };

  if (opts.action === 'run-task') {
    const resolvedTask = path.resolve(opts.runTaskFile);
    const st = assertPathChainNoSymlinks(resolvedTask, 'archive task file');
    if (!st || !st.isFile() || st.size > 256 * 1024) {
      throw new Error('Archive task file missing or invalid');
    }
    const rawText = fs.readFileSync(resolvedTask, 'utf8');
    try { fs.unlinkSync(resolvedTask); } catch {}
    const task = JSON.parse(rawText);
    const res = await executeArchiveTaskSequence(task);
    if (opts.json) logOut(JSON.stringify(res, null, 2));
    if (!res.ok) setExitCode(1);
    return res;
  }

  if (opts.action === 'list') {
    const batches = listArchiveBatches(archiveDir);
    if (opts.json) logOut(JSON.stringify(batches, null, 2));
    else logOut(batches.length ? batches : '暂无归档批次。');
    return batches;
  }

  if (opts.action === 'prepare' || opts.action === 'scan') {
    const liveSums = typeof deps.fetchLiveSummaries === 'function' ? await deps.fetchLiveSummaries() : await fetchLiveSummariesViaClient();
    if (liveSums) saveCatalogIndex(archiveDir, liveSums);
    const report = scanConversationStorage({
      convDir,
      archiveDir,
      summaries: liveSums,
      subagentMaxAgeHours: opts.subagentHours,
      mainMaxAgeDays: opts.mainDays,
      keepRecentMain: opts.keepRecentMain,
    });
    let helpers = null;
    if (opts.action === 'prepare') {
      helpers = writeHelperScripts({
        scriptPath: fileURLToPath(import.meta.url),
        archiveDir,
        mode: opts.mode,
        subagentMaxAgeHours: opts.subagentHours,
        mainDays: opts.mainDays,
        keepRecentMain: opts.keepRecentMain,
      });
    }
    if (opts.json) {
      const { archivableSubagents, archivableOldMain, ...summary } = report;
      logOut(JSON.stringify({ ...summary, helpers }, null, 2));
      return { ...summary, helpers };
    }
    logOut(`[体检] 对话库路径: ${report.convDir}`);
    logOut(`[体检] 总大小: ${report.totalMb} MB（${report.conversationCount} 个会话，其中主对话 ${report.mainCount} 个 / ${report.mainMb} MB，隐藏子代理 ${report.subagentCount} 个 / ${report.subagentMb} MB）`);
    logOut(`[建议] 可安全归档的已结束子代理（>${opts.subagentHours}h）: ${report.archivableSubagentCount} 个，预计立省 ${report.archivableSubagentMb} MB`);
    if (helpers) {
      logOut(`[就绪] 一键安全归档脚本已生成: ${helpers.archiveScriptPath}`);
      logOut(`[就绪] 一键无损还原脚本已生成: ${helpers.restoreScriptPath}`);
    }
    return { report, helpers };
  }

  if (opts.action === 'archive') {
    if (!opts.dryRun && opts.waitExit && checkRunning()) {
      const exited = await waitExitFn(120000);
      if (!exited) {
        logErr('[中止] 等待超时，language_server 仍在运行。请完全退出 Antigravity 后重试。');
        setExitCode(1);
        return { ok: false, code: 'WAIT_EXIT_TIMEOUT' };
      }
    }
    const res = archiveConversations({
      convDir,
      archiveDir,
      mode: opts.mode,
      subagentMaxAgeHours: opts.subagentHours,
      mainMaxAgeDays: opts.mainDays,
      keepRecentMain: opts.keepRecentMain,
      dryRun: opts.dryRun,
      checkRunning,
    });
    if (!opts.dryRun && res.ok && Number(res.movedCount || 0) > 0) {
      writeLastArchiveResult(archiveDir, { ...res, action: 'archive', relaunched: false });
    }
    if (opts.json) logOut(JSON.stringify(res, null, 2));
    else if (!res.ok) {
      logErr(`[拒绝] ${res.error}`);
      setExitCode(1);
    } else if (res.dryRun) {
      logOut(`[预演] 将移动归档 ${res.candidateCount} 个会话（共 ${res.candidateMb} MB），归档后对话库预计降至 ${res.remainingEstimatedMb} MB（所有主对话保留不变）。`);
    } else {
      logOut(`[完成] 已安全移动归档 ${res.movedCount} 个会话（释放 ${res.movedMb} MB）到: ${res.batchDir}`);
      logOut(`[完成] 对话库剩余预计约 ${res.remainingEstimatedMb} MB。现在可以重新打开 Antigravity！`);
    }
    return res;
  }

  if (opts.action === 'restore') {
    let safeBatch;
    try {
      safeBatch = validateBatchSelector(opts.restoreBatch);
    } catch (err) {
      const errRes = { ok: false, code: 'INVALID_BATCH', error: err?.message || 'Invalid archive batch name' };
      if (opts.json) logOut(JSON.stringify(errRes, null, 2));
      else logErr(`[拒绝] ${errRes.error}`);
      setExitCode(1);
      return errRes;
    }
    if (opts.waitExit && checkRunning()) {
      const exited = await waitExitFn(120000);
      if (!exited) {
        const timeoutRes = {
          ok: false,
          code: 'WAIT_EXIT_TIMEOUT',
          error: '等待超时，language_server 仍在运行。请完全退出 Antigravity 后重试。',
        };
        if (opts.json) logOut(JSON.stringify(timeoutRes, null, 2));
        else logErr(`[中止] ${timeoutRes.error}`);
        setExitCode(1);
        return timeoutRes;
      }
    }
    const res = restoreArchiveBatch({ convDir, archiveDir, batchName: safeBatch, checkRunning });
    if (opts.json) logOut(JSON.stringify(res, null, 2));
    else if (!res.ok) {
      logErr(`[失败] ${res.error}`);
      setExitCode(1);
    } else {
      logOut(`[完成] 已无损还原批次 ${res.batchName}：恢复 ${res.restoredCount} 个会话（跳过冲突 ${res.skippedCount} 个）。`);
    }
    return res;
  }
  return null;
}

async function runCli() {
  await executeCli(process.argv.slice(2));
}

function resolveRealpathForEntry(targetPath) {
  if (typeof fs.realpathSync.native === 'function') {
    try {
      return fs.realpathSync.native(targetPath);
    } catch (err) {
      if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR' || err.code === 'EACCES' || err.code === 'EPERM')) {
        return path.resolve(targetPath);
      }
    }
  }
  try {
    return fs.realpathSync(targetPath);
  } catch {
    return path.resolve(targetPath);
  }
}

/**
 * 判断当前模块是否作为 CLI 主入口直接启动。
 * 解析符号链接与 Windows Junction（例如 ~/.gemini 迁至其他盘符），并在 Win32 下归一化盘符大小写。
 */
export function isMainEntry(argv1, moduleUrl = import.meta.url) {
  if (!argv1 || !moduleUrl) return false;
  const modulePath = String(moduleUrl).startsWith('file:') ? fileURLToPath(moduleUrl) : String(moduleUrl);
  const resolvedArgv = resolveRealpathForEntry(argv1);
  const resolvedSelf = resolveRealpathForEntry(modulePath);
  if (process.platform === 'win32') {
    return (
      resolvedArgv.replace(/^\\\\\?\\/, '').toLowerCase() ===
      resolvedSelf.replace(/^\\\\\?\\/, '').toLowerCase()
    );
  }
  return resolvedArgv === resolvedSelf;
}

const isEntry = isMainEntry(process.argv[1], import.meta.url);

if (isEntry) {
  runCli().catch((err) => {
    console.error('[错误]', err?.message || err);
    process.exitCode = 1;
  });
}

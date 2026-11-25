// Chrome DevTools Protocol (CDP) & zero-dependency bundle compiler for Obsidian Prism (obsidian-prism).
// Node >= 22: uses built-in fetch and WebSocket (zero external dependencies).
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, execFileSync, spawn } = require('child_process');

const STYLE_ID = 'ag-prism-css';
const LEGACY_STYLE_ID = 'ag-claude-style-css';
const PLUGIN_VERSION = '1.0.7';
const SETTING_BINDING = '__agPrismSetting';
const LEGACY_SETTING_BINDING = '__agClaudeStyleSetting';
const OMNI_BINDING = '__agPrismOmniCall';
const SIDEBAR_BINDING = '__agPrismSidebarCall';
const INLINE_DIFF_BINDING = '__agPrismInlineDiffCall';
const WALLPAPER_BINDING = '__agPrismWallpaperCall';
const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';

const APP_DATA = IS_MAC
  ? path.join(os.homedir(), 'Library', 'Application Support')
  : IS_WIN
  ? process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
  : process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');

const PORT_FILE = path.join(APP_DATA, 'Antigravity', 'DevToolsActivePort');
const PID_FILE = path.join(__dirname, '.watch.pid');
const CONFIG_FILE = path.join(__dirname, 'config.json');

const DEFAULT_CONFIG = {
  language: 'zh-CN',
  lang: 'zh-CN',
  palette: 'obsidian',
  lightPreset: 'crystal',
  motionLevel: 'ultra',
  targetFps: '180',
  telemetryModule: 'auto',
  effortSliderModule: 'auto',
  effortSliderStyle: 'classic',
  effortMemory: 'on',
  thoughtTranslate: 'off',
  thoughtTrigger: 'preload',
  homeLayout: 'studio',
  homeMode: 'studio',
  homeRipple: true,
  ripple: 'on',
  composerRestyle: true,
  composer: 'on',
  placeholderStyle: 'studio',
  promptStyle: 'studio',
  mascot: 'crab',
  logoInk: 'accent',
  sidebarRestyle: true,
  sidebar: 'on',
  sidebarCompact: false,
  sidebarNavFold: 'off',
  smoothCaret: true,
  scrollBottomMotion: 'smooth',
  contextMenu: true,
  accentTone: 'follow',
  cornerStyle: 'balanced',
  codeFont: 'default',
  codeLigatures: false,
  ambientIntensity: '100',
  thoughtView: 'immersive',
  omniModule: 'on',
  linkTarget: 'builtin',
  sidebarStudio: 'off',
  hostLocalization: 'auto',
  autoUpdate: 'off',
  updateChannel: 'stable',
  pollIntervalMs: 2500,
};

const VALIDATORS = {
  language: ['auto', 'zh-CN', 'zh-TW', 'yue', 'en', 'ja'],
  lang: ['auto', 'zh-CN', 'zh-TW', 'yue', 'en', 'ja'],
  palette: ['host', 'obsidian', 'warm', 'claude'],
  lightPreset: ['crystal', 'alabaster'],
  motionLevel: ['off', 'subtle', 'standard', 'ultra'],
  targetFps: ['60', '120', '180', 'native'],
  telemetryModule: ['auto', 'on', 'off'],
  effortSliderModule: ['auto', 'on', 'off'],
  effortSliderStyle: ['classic', 'prism', 'ferrofluid', 'orbital', 'oscilloscope', 'plasma', 'supernova', 'swarm'],
  effortMemory: ['on', 'off'],
  thoughtTranslate: ['off', 'machine', 'ai'],
  thoughtTrigger: ['preload', 'expand'],
  homeLayout: ['studio', 'classic', 'off'],
  homeMode: ['studio', 'classic', 'off'],
  homeRipple: 'boolean',
  ripple: ['on', 'off'],
  composerRestyle: 'boolean',
  composer: ['on', 'off'],
  placeholderStyle: ['studio', 'host'],
  promptStyle: ['studio', 'host'],
  mascot: ['crab', 'minis', 'dual', 'off'],
  logoInk: ['accent', 'foreground'],
  sidebarRestyle: 'boolean',
  sidebar: ['on', 'off'],
  sidebarCompact: 'boolean',
  sidebarNavFold: ['off', 'on'],
  smoothCaret: 'boolean',
  scrollBottomMotion: ['smooth', 'instant'],
  contextMenu: 'boolean',
  accentTone: ['follow', 'cobalt', 'iris', 'amber', 'mono'],
  cornerStyle: ['sharp', 'balanced', 'soft'],
  codeFont: ['default', 'jetbrains', 'cascadia', 'sfmono'],
  codeLigatures: 'boolean',
  ambientIntensity: ['0', '35', '70', '100'],
  thoughtView: ['immersive', 'bilingual'],
  omniModule: ['on', 'off'],
  linkTarget: ['builtin', 'external'],
  sidebarStudio: ['on', 'off'],
  hostLocalization: ['auto', 'on', 'off'],
  autoUpdate: ['on', 'off'],
  updateChannel: ['stable', 'beta'],
};

function validateConfigEntry(key, value) {
  if (key === 'pollIntervalMs') {
    return typeof value === 'number' && Number.isInteger(value) && value >= 500 && value <= 60000;
  }
  if (key === 'autoPromptCdpRelaunch') {
    return typeof value === 'boolean';
  }
  if (!Object.prototype.hasOwnProperty.call(VALIDATORS, key)) return false;
  const rule = VALIDATORS[key];
  if (rule === 'boolean') {
    return typeof value === 'boolean' || value === 'on' || value === 'off';
  }
  if (Array.isArray(rule)) {
    return typeof value === 'string' && rule.includes(value);
  }
  return false;
}

function reconcileConfigAliases(raw) {
  const out = raw && typeof raw === 'object' ? { ...raw } : {};
  const has = (k) => Object.prototype.hasOwnProperty.call(out, k);

  if (has('language')) {
    out.lang = out.language;
  } else if (has('lang')) {
    out.language = out.lang;
  }

  if (has('homeLayout')) {
    out.homeMode = out.homeLayout;
  } else if (has('homeMode')) {
    out.homeLayout = out.homeMode;
  }

  if (has('homeRipple')) {
    const on = out.homeRipple !== false && out.homeRipple !== 'off';
    out.homeRipple = on;
    out.ripple = on ? 'on' : 'off';
  } else if (has('ripple')) {
    const on = out.ripple !== 'off' && out.ripple !== false;
    out.homeRipple = on;
    out.ripple = on ? 'on' : 'off';
  }

  if (has('composerRestyle')) {
    const on = out.composerRestyle !== false && out.composerRestyle !== 'off';
    out.composerRestyle = on;
    out.composer = on ? 'on' : 'off';
  } else if (has('composer')) {
    const on = out.composer !== 'off' && out.composer !== false;
    out.composerRestyle = on;
    out.composer = on ? 'on' : 'off';
  }

  if (has('placeholderStyle')) {
    out.promptStyle = out.placeholderStyle;
  } else if (has('promptStyle')) {
    out.placeholderStyle = out.promptStyle;
  }

  if (has('sidebarRestyle')) {
    const on = out.sidebarRestyle !== false && out.sidebarRestyle !== 'off';
    out.sidebarRestyle = on;
    out.sidebar = on ? 'on' : 'off';
  } else if (has('sidebar')) {
    const on = out.sidebar !== 'off' && out.sidebar !== false;
    out.sidebarRestyle = on;
    out.sidebar = on ? 'on' : 'off';
  }

  if (has('sidebarCompact') && typeof out.sidebarCompact === 'string') {
    out.sidebarCompact = out.sidebarCompact === 'on' || out.sidebarCompact === 'true';
  }
  if (has('smoothCaret') && typeof out.smoothCaret === 'string') {
    out.smoothCaret = out.smoothCaret !== 'off' && out.smoothCaret !== 'false';
  }
  if (has('contextMenu') && typeof out.contextMenu === 'string') {
    out.contextMenu = out.contextMenu !== 'off' && out.contextMenu !== 'false';
  }
  if (has('codeLigatures') && typeof out.codeLigatures === 'string') {
    out.codeLigatures = out.codeLigatures === 'on' || out.codeLigatures === 'true';
  }
  for (const k of ['telemetryModule', 'effortSliderModule', 'effortMemory', 'omniModule', 'sidebarStudio', 'autoUpdate', 'sidebarNavFold']) {
    if (has(k) && typeof out[k] === 'boolean') {
      out[k] = out[k] ? 'on' : 'off';
    }
  }
  if (has('palette') && out.palette === 'claude') {
    out.palette = 'warm';
  }
  if (has('mascot') && out.mascot === 'dual') {
    out.mascot = 'crab';
  }
  return out;
}

let _configCache = { sig: '', value: null };

function invalidateConfigCache() {
  _configCache = { sig: '', value: null };
}

function readConfig() {
  try {
    const st = fs.statSync(CONFIG_FILE);
    if (!st.isFile()) {
      _configCache = { sig: '', value: null };
      return { ...DEFAULT_CONFIG };
    }
    const sig = `${st.mtimeMs}:${st.size}:${st.ctimeMs}`;
    if (_configCache.value && _configCache.sig === sig) {
      return { ..._configCache.value };
    }
    const diskRaw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    const merged = reconcileConfigAliases({ ...DEFAULT_CONFIG, ...reconcileConfigAliases(diskRaw) });
    _configCache = { sig, value: merged };
    return { ...merged };
  } catch {
    _configCache = { sig: '', value: null };
    return { ...DEFAULT_CONFIG };
  }
}

function writeConfig(nextConfig) {
  const normalized = reconcileConfigAliases({
    ...DEFAULT_CONFIG,
    ...(nextConfig && typeof nextConfig === 'object' ? reconcileConfigAliases(nextConfig) : {}),
  });
  const resolved = path.resolve(CONFIG_FILE);
  const dir = path.dirname(resolved);
  if (isSymlinkPathSync(dir) || isSymlinkPathSync(resolved)) {
    throw new Error(`Refusing symbolic link config path: ${resolved}`);
  }
  fs.mkdirSync(dir, { recursive: true });
  const content = JSON.stringify(normalized, null, 2) + '\n';
  const tmpPath = path.join(dir, `.config.json.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`);
  let fd = null;
  try {
    fd = fs.openSync(tmpPath, 'wx', 0o600);
    fs.writeFileSync(fd, content, 'utf8');
    fs.closeSync(fd);
    fd = null;
    try { fs.chmodSync(tmpPath, 0o600); } catch {}
    let renamed = false;
    let lastErr = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        fs.renameSync(tmpPath, resolved);
        renamed = true;
        break;
      } catch (err) {
        lastErr = err;
        if (!IS_WIN || !['EBUSY', 'EPERM', 'EACCES', 'EEXIST'].includes(err && err.code)) {
          throw err;
        }
      }
    }
    if (!renamed) {
      if (IS_WIN && ['EBUSY', 'EPERM', 'EACCES', 'EEXIST'].includes(lastErr && lastErr.code)) {
        if (isSymlinkPathSync(dir) || isSymlinkPathSync(resolved)) {
          throw new Error(`Refusing symbolic link config path: ${resolved}`);
        }
        fs.copyFileSync(tmpPath, resolved);
        try { fs.unlinkSync(tmpPath); } catch {}
      } else {
        throw lastErr;
      }
    }
    try { fs.chmodSync(resolved, 0o600); } catch {}
  } catch (err) {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch {}
    }
    try { fs.unlinkSync(tmpPath); } catch {}
    throw err;
  }
  // 写盘成功后立即失效缓存，防止同一毫秒写入后读到陈旧值
  invalidateConfigCache();
  return { ...normalized };
}

function readPort() {
  if (process.env.AG_CDP_PORT) return parseInt(process.env.AG_CDP_PORT, 10);
  try {
    const text = fs.readFileSync(PORT_FILE, 'utf8');
    const port = parseInt(text.split(/\r?\n/)[0].trim(), 10);
    return Number.isInteger(port) && port > 0 ? port : null;
  } catch {
    return null;
  }
}

// 统一解析纯整数或 JSON {"pid":12345} 锁文件，杜绝 parseInt("{...") -> NaN
function readPidFromLockFile(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (!raw) return null;
    if (/^\d+$/.test(raw)) {
      const n = parseInt(raw, 10);
      return Number.isInteger(n) && n > 0 ? n : null;
    }
    if (raw.startsWith('{')) {
      const parsed = JSON.parse(raw);
      const n = Number(parsed && parsed.pid);
      return Number.isInteger(n) && n > 0 ? n : null;
    }
  } catch {}
  return null;
}

function findDaemonLockMetaForPid(pid, customLockFile = null) {
  const candidates = [];
  if (customLockFile) candidates.push(customLockFile);
  candidates.push(path.join(__dirname, '.daemon.pid'));
  const envPluginDir = process.env.AG_PRISM_PLUGIN_DIR;
  if (envPluginDir) candidates.push(path.join(envPluginDir, '.daemon.pid'));
  candidates.push(path.join(os.homedir(), '.gemini', 'config', 'plugins', 'obsidian-prism', '.daemon.pid'));
  const seen = new Set();
  for (const filePath of candidates) {
    if (!filePath || seen.has(filePath)) continue;
    seen.add(filePath);
    try {
      if (!fs.existsSync(filePath)) continue;
      const raw = fs.readFileSync(filePath, 'utf8').trim();
      if (!raw) continue;
      if (/^\d+$/.test(raw) && parseInt(raw, 10) === pid) {
        return { matchedPid: true, startedAt: 0 };
      }
      if (raw.startsWith('{')) {
        const parsed = JSON.parse(raw);
        if (Number(parsed?.pid) === pid) {
          return { matchedPid: true, startedAt: Number(parsed?.startedAt || 0) };
        }
      }
    } catch {}
  }
  return { matchedPid: false, startedAt: 0 };
}

// 校验进程映像名、内核启动时间与命令行签名：既精准识别宿主以 Antigravity 二进制拉起的原生 Sidecar，又严防误杀宿主主进程/其他插件
function matchesExpectedDaemonSignature(imageName, commandLine = '', opts = null) {
  const img = String(imageName || '').trim().toLowerCase();
  const cmd = String(commandLine || '').replace(/\\/g, '/').toLowerCase();
  if (!img) return false;
  if (cmd && /--type=/.test(cmd)) {
    return false;
  }
  const matchedLockPid = Boolean(opts && opts.matchedLockPid);
  const lockStartedAt = Number((opts && opts.lockStartedAt) || 0);
  const processStartMs = Number((opts && opts.processStartMs) || 0);
  if (lockStartedAt > 0 && processStartMs > 0) {
    // 若进程在锁文件写入后 >5s 才创建（PID 复用）或早于锁文件 >120s（老主进程），一律拒绝
    if (processStartMs > lockStartedAt + 5000 || lockStartedAt - processStartMs > 120000) {
      return false;
    }
  }
  if (/\b(?:node|nodejs|obsidian-prism|watcher|agy-claude-style)(?:\.exe)?\b/.test(img)) {
    return true;
  }
  if (/(?:antigravity|electron|agy)(?:\.exe|\b)/.test(img)) {
    if (!cmd) return false;
    const hasPrismOwner = /(?:obsidian-prism|antigravity-prism|agy-claude-style)/.test(cmd);
    const hasDaemonEntry = /(?:sidecars\/daemon\/main\.mjs|\/daemon\/main\.mjs|\/watch\.js)\b/.test(cmd);
    if (hasPrismOwner && hasDaemonEntry) return true;
    // 宿主以插件子目录为 cwd 拉起 Sidecar 时命令行为 `Antigravity --import=.../sidecar_sdk/register_loader.js main.mjs`
    if (matchedLockPid && /sidecar_sdk\/register_loader\.js\b/.test(cmd) && /(?:^|\s|\/)main\.mjs(?:\s|"|'|$)/.test(cmd)) {
      return true;
    }
    return false;
  }
  return false;
}

// 单次系统探针同时获取进程映像名、启动时间与命令行，消除启动抢锁时连续拉起两次 powershell.exe
function inspectProcessSync(pid, opts = null) {
  const n = Number(pid);
  if (!Number.isInteger(n) || n <= 0) return null;
  try {
    process.kill(n, 0);
  } catch (err) {
    if (!err || err.code !== 'EPERM') return null;
  }
  const execFn = opts && typeof opts.execFileSyncFn === 'function' ? opts.execFileSyncFn : execFileSync;
  const platform = (opts && opts.platform) || process.platform;
  try {
    if (platform === 'win32') {
      const psScript =
        `$p = Get-Process -Id ${n} -ErrorAction SilentlyContinue; ` +
        `if (-not $p) { exit 0 }; ` +
        `$nm = [string]$p.ProcessName; ` +
        `$st = 0; try { $st = [long]([DateTimeOffset]$p.StartTime).ToUnixTimeMilliseconds() } catch {}; ` +
        `$cl = ''; try { $cl = [string](Get-CimInstance Win32_Process -Filter 'ProcessId = ${n}' -ErrorAction SilentlyContinue).CommandLine } catch {}; ` +
        `Write-Output ($nm + '|' + $st + '|' + $cl)`;
      const out = execFn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', psScript],
        {
          encoding: 'utf8',
          windowsHide: true,
          timeout: 8000,
          stdio: ['ignore', 'pipe', 'ignore'],
        }
      );
      const trimmed = String(out || '').trim();
      if (!trimmed) return null;
      const p1 = trimmed.indexOf('|');
      const p2 = p1 >= 0 ? trimmed.indexOf('|', p1 + 1) : -1;
      const imageName = p1 >= 0 ? trimmed.slice(0, p1).trim() : trimmed;
      const processStartMs = p1 >= 0 && p2 > p1 ? Number(trimmed.slice(p1 + 1, p2)) || 0 : 0;
      const commandLine = p2 >= 0 ? trimmed.slice(p2 + 1).trim() : '';
      if (!imageName) return null;
      return {
        pid: n,
        imageName,
        startTime: processStartMs,
        processStartMs,
        commandLine,
      };
    }
    if (platform === 'linux') {
      let imageName = '';
      let commandLine = '';
      try {
        imageName = fs.readFileSync(`/proc/${n}/comm`, 'utf8').trim();
      } catch {}
      try {
        const rawCmd = fs.readFileSync(`/proc/${n}/cmdline`);
        if (rawCmd && rawCmd.length > 0) {
          commandLine = rawCmd.toString('utf8').replace(/\0+/g, ' ').trim();
        }
      } catch {}
      if (!imageName && !commandLine) return null;
      return {
        pid: n,
        imageName: imageName || commandLine.split(/\s+/)[0] || '',
        startTime: 0,
        processStartMs: 0,
        commandLine,
      };
    }
    // macOS / 其他 POSIX：使用 ps 单次读取 args 与 comm
    const commOut = execFn('ps', ['-p', String(n), '-o', 'comm='], {
      encoding: 'utf8',
      timeout: 2500,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const imageName = String(commOut || '').trim();
    if (!imageName) return null;
    let commandLine = '';
    try {
      const argsOut = execFn('ps', ['-p', String(n), '-o', 'args='], {
        encoding: 'utf8',
        timeout: 2500,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      commandLine = String(argsOut || '').trim();
    } catch {}
    return {
      pid: n,
      imageName,
      startTime: 0,
      processStartMs: 0,
      commandLine,
    };
  } catch {
    return null;
  }
}

// 终止旧守护前核验进程映像名与启动时间/命令行，防止系统重启后 PID 复用误杀无关进程或宿主主窗口
function isExpectedDaemonProcess(pid, probeOverride = null) {
  const n = Number(pid);
  if (!Number.isInteger(n) || n <= 0 || n === process.pid) return false;
  const isObjOverride = Boolean(probeOverride && typeof probeOverride === 'object');
  const customLock =
    typeof probeOverride === 'string'
      ? probeOverride
      : isObjOverride && typeof probeOverride.lockFile === 'string'
      ? probeOverride.lockFile
      : null;
  const lockMeta = findDaemonLockMetaForPid(n, customLock);
  if (typeof probeOverride === 'function') {
    const info = probeOverride(n);
    if (!info) return false;
    return matchesExpectedDaemonSignature(info.imageName, info.commandLine, {
      matchedLockPid: Boolean(info.matchedLockPid ?? lockMeta.matchedPid),
      lockStartedAt: Number(info.lockStartedAt ?? lockMeta.startedAt ?? 0),
      processStartMs: Number(info.processStartMs ?? info.startTime ?? 0),
    });
  }
  if (isObjOverride && Object.prototype.hasOwnProperty.call(probeOverride, 'procInfo')) {
    const info = probeOverride.procInfo;
    if (!info) return false;
    return matchesExpectedDaemonSignature(info.imageName, info.commandLine, {
      matchedLockPid: Boolean(info.matchedLockPid ?? lockMeta.matchedPid),
      lockStartedAt: Number(info.lockStartedAt ?? lockMeta.startedAt ?? 0),
      processStartMs: Number(info.processStartMs ?? info.startTime ?? 0),
    });
  }
  try {
    process.kill(n, 0);
  } catch (err) {
    return Boolean(err && err.code === 'EPERM');
  }
  const info = inspectProcessSync(n);
  if (!info) return false;
  return matchesExpectedDaemonSignature(info.imageName, info.commandLine, {
    matchedLockPid: lockMeta.matchedPid,
    lockStartedAt: lockMeta.startedAt,
    processStartMs: Number(info.processStartMs ?? info.startTime ?? 0),
  });
}

const CDP_OPT_IN_SWITCH = '--remote-debugging-port=0';
const RELAUNCH_STATE_FILENAME = '.relaunch-prompt-state.json';
const PATCHED_SHORTCUTS_FILENAME = '.patched-shortcuts.json';

// 纯线性扫描检测命令行是否已显式携带 --remote-debugging-port（零嵌套正则，杜绝 ReDoS）
function hasRemoteDebuggingPortSwitch(commandLine) {
  const raw = String(commandLine || '');
  if (!raw) return false;
  const low = raw.toLowerCase();
  const needle = '--remote-debugging-port';
  let from = 0;
  while (from <= low.length - needle.length) {
    const idx = low.indexOf(needle, from);
    if (idx < 0) return false;
    const prev = idx === 0 ? ' ' : low[idx - 1];
    const afterIdx = idx + needle.length;
    const next = afterIdx >= low.length ? ' ' : low[afterIdx];
    const prevOk = prev === ' ' || prev === '\t' || prev === '"' || prev === "'";
    const nextOk = next === '=' || next === ' ' || next === '\t' || next === '"' || next === "'";
    if (prevOk && nextOk) return true;
    from = idx + needle.length;
  }
  return false;
}

// 无损追加 --remote-debugging-port=0（若已含任意 --remote-debugging-port 则原样保留）
function appendCdpFlagToArguments(rawArgs) {
  const orig = String(rawArgs || '');
  if (hasRemoteDebuggingPortSwitch(orig)) {
    return { args: orig, changed: false };
  }
  const trimmed = orig.trim();
  if (!trimmed) {
    return { args: CDP_OPT_IN_SWITCH, changed: true };
  }
  return { args: `${trimmed} ${CDP_OPT_IN_SWITCH}`, changed: true };
}

// 纯线性词法扫描剥离 --remote-debugging-port=0，100% 保留引号内空白与用户其余参数
function stripCdpFlagFromArguments(rawArgs) {
  const s = String(rawArgs || '');
  if (!s) return { args: '', changed: false };
  const tokens = [];
  let i = 0;
  const len = s.length;
  let removed = false;
  while (i < len) {
    while (i < len && (s[i] === ' ' || s[i] === '\t' || s[i] === '\r' || s[i] === '\n')) i++;
    if (i >= len) break;
    const start = i;
    let inQuote = '';
    while (i < len) {
      const ch = s[i];
      if (inQuote) {
        if (ch === '\\' && i + 1 < len) {
          i += 2;
          continue;
        }
        if (ch === inQuote) inQuote = '';
        i++;
      } else {
        if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') break;
        if (ch === '"' || ch === "'") inQuote = ch;
        i++;
      }
    }
    const tok = s.slice(start, i);
    const unquoted =
      (tok.startsWith('"') && tok.endsWith('"')) || (tok.startsWith("'") && tok.endsWith("'"))
        ? tok.slice(1, -1)
        : tok;
    if (unquoted.toLowerCase() === CDP_OPT_IN_SWITCH) {
      removed = true;
    } else {
      tokens.push(tok);
    }
  }
  if (!removed) return { args: s, changed: false };
  return { args: tokens.join(' '), changed: true };
}

// 严格按可执行文件名精确匹配 Antigravity.exe（自动排除 antigravity-tools.exe 与 Uninstall Antigravity.exe）
function isAntigravityShortcutTarget(targetPath) {
  const cleaned = String(targetPath || '').trim().replace(/^"+|"+$/g, '');
  if (!cleaned) return false;
  const parts = cleaned.split(/[\\/]/);
  const base = (parts[parts.length - 1] || '').trim().toLowerCase();
  return base === 'antigravity.exe';
}

// 精准识别真正的 Antigravity 主进程（过滤 --type= 渲染/GPU 子进程、sidecar_sdk 守护进程与第三方 antigravity-tools）
function isMainAntigravityProcessSignature(imageName, commandLine = '') {
  const rawImg = String(imageName || '').trim().replace(/^"+|"+$/g, '');
  const imgParts = rawImg.split(/[\\/]/);
  const baseImg = (imgParts[imgParts.length - 1] || '').trim().toLowerCase();
  if (baseImg !== 'antigravity' && baseImg !== 'antigravity.exe') {
    return false;
  }
  const normCmd = String(commandLine || '').replace(/\\/g, '/').toLowerCase();
  if (!normCmd) return true;
  if (normCmd.includes('--type=')) return false;
  if (
    normCmd.includes('sidecar_sdk') ||
    normCmd.includes('register_loader.js') ||
    normCmd.includes('sidecars/daemon/main.mjs') ||
    normCmd.includes('/daemon/main.mjs') ||
    normCmd.includes('/watch.js') ||
    normCmd.includes('--run-guard') ||
    normCmd.includes('antigravity-tools') ||
    normCmd.includes('uninstall antigravity')
  ) {
    return false;
  }
  return true;
}

const WIN_SHORTCUT_LIST_PS = [
  '$ErrorActionPreference = "SilentlyContinue"',
  '$ProgressPreference = "SilentlyContinue"',
  '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
  '$dirs = @()',
  'if ($env:AG_PRISM_LNK_DIRS) {',
  '  try { $rawDirs = ConvertFrom-Json -InputObject $env:AG_PRISM_LNK_DIRS; $dirs = if ($rawDirs -is [System.Array]) { $rawDirs } elseif ($null -ne $rawDirs) { @($rawDirs) } else { @() } } catch {}',
  '} else {',
  '  $dirs += [Environment]::GetFolderPath("Desktop")',
  '  if ($env:USERPROFILE) { $dirs += (Join-Path $env:USERPROFILE "Desktop") }',
  '  $dirs += [Environment]::GetFolderPath("Programs")',
  '  if ($env:APPDATA) { $dirs += (Join-Path $env:APPDATA "Microsoft\\Internet Explorer\\Quick Launch\\User Pinned\\TaskBar") }',
  '  $dirs += [Environment]::GetFolderPath("CommonDesktopDirectory")',
  '  $dirs += [Environment]::GetFolderPath("CommonPrograms")',
  '}',
  '$extra = @()',
  'if ($env:AG_PRISM_LNK_EXTRA) {',
  '  try { $rawExtra = ConvertFrom-Json -InputObject $env:AG_PRISM_LNK_EXTRA; $extra = if ($rawExtra -is [System.Array]) { $rawExtra } elseif ($null -ne $rawExtra) { @($rawExtra) } else { @() } } catch {}',
  '}',
  '$seen = New-Object "System.Collections.Generic.HashSet[string]" ([System.StringComparer]::OrdinalIgnoreCase)',
  '$files = New-Object "System.Collections.Generic.List[string]"',
  'foreach ($f in $extra) {',
  '  if ($f -and (Test-Path -LiteralPath $f -PathType Leaf) -and $f.EndsWith(".lnk", [System.StringComparison]::OrdinalIgnoreCase)) {',
  '    $full = [System.IO.Path]::GetFullPath($f)',
  '    if ($seen.Add($full)) { [void]$files.Add($full) }',
  '  }',
  '}',
  'foreach ($d in $dirs) {',
  '  if (-not $d -or -not (Test-Path -LiteralPath $d -PathType Container)) { continue }',
  '  foreach ($item in @(Get-ChildItem -LiteralPath $d -Filter "*.lnk" -File -ErrorAction SilentlyContinue)) {',
  '    if ($seen.Add($item.FullName)) { [void]$files.Add($item.FullName) }',
  '  }',
  '  foreach ($sub in @(Get-ChildItem -LiteralPath $d -Directory -ErrorAction SilentlyContinue)) {',
  '    foreach ($item2 in @(Get-ChildItem -LiteralPath $sub.FullName -Filter "*.lnk" -File -ErrorAction SilentlyContinue)) {',
  '      if ($seen.Add($item2.FullName)) { [void]$files.Add($item2.FullName) }',
  '    }',
  '  }',
  '}',
  'if ($files.Count -eq 0) { Write-Output "[]"; exit 0 }',
  '$ws = New-Object -ComObject WScript.Shell',
  '$items = New-Object "System.Collections.Generic.List[object]"',
  'foreach ($lnk in $files) {',
  '  try {',
  '    $sc = $ws.CreateShortcut($lnk)',
  '    $tp = [string]$sc.TargetPath',
  '    if (-not $tp) { continue }',
  '    [void]$items.Add([pscustomobject]@{ lnkPath = $lnk; targetPath = $tp; arguments = [string]$sc.Arguments })',
  '  } catch {}',
  '}',
  'if ($items.Count -eq 0) { Write-Output "[]" } elseif ($items.Count -eq 1) { Write-Output ("[" + ($items[0] | ConvertTo-Json -Compress) + "]") } else { $items | ConvertTo-Json -Compress }',
].join('\n');

const WIN_SHORTCUT_APPLY_PS = [
  '$ErrorActionPreference = "Stop"',
  '$ProgressPreference = "SilentlyContinue"',
  '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
  '$updates = @()',
  'if ($env:AG_PRISM_LNK_UPDATES) {',
  '  $rawUpd = ConvertFrom-Json -InputObject $env:AG_PRISM_LNK_UPDATES',
  '  $updates = if ($rawUpd -is [System.Array]) { $rawUpd } elseif ($null -ne $rawUpd) { @($rawUpd) } else { @() }',
  '}',
  '$ws = New-Object -ComObject WScript.Shell',
  '$applied = New-Object "System.Collections.Generic.List[string]"',
  '$skipped = New-Object "System.Collections.Generic.List[string]"',
  'foreach ($u in $updates) {',
  '  $p = [string]$u.lnkPath',
  '  if (-not $p) { continue }',
  '  try {',
  '    $sc = $ws.CreateShortcut($p)',
  '    $sc.Arguments = [string]$u.arguments',
  '    $sc.Save()',
  '    [void]$applied.Add($p)',
  '  } catch {',
  '    [void]$skipped.Add($p)',
  '  }',
  '}',
  '([pscustomobject]@{ applied = $applied.ToArray(); skipped = $skipped.ToArray() }) | ConvertTo-Json -Compress',
].join('\n');

const WIN_SHORTCUT_LIST_B64 = Buffer.from(WIN_SHORTCUT_LIST_PS, 'utf16le').toString('base64');
const WIN_SHORTCUT_APPLY_B64 = Buffer.from(WIN_SHORTCUT_APPLY_PS, 'utf16le').toString('base64');

function readPatchedShortcutsRecord(pluginDir) {
  if (!pluginDir) return [];
  try {
    const recFile = path.join(pluginDir, PATCHED_SHORTCUTS_FILENAME);
    if (!fs.existsSync(recFile)) return [];
    const parsed = JSON.parse(fs.readFileSync(recFile, 'utf8'));
    const list = Array.isArray(parsed?.patchedPaths) ? parsed.patchedPaths : [];
    return list.filter((p) => typeof p === 'string' && p.length > 0);
  } catch {
    return [];
  }
}

function writePatchedShortcutsRecord(pluginDir, pathsList) {
  if (!pluginDir) return;
  try {
    fs.mkdirSync(pluginDir, { recursive: true });
    const uniq = Array.from(new Set(pathsList.filter((p) => typeof p === 'string' && p.length > 0)));
    const recFile = path.join(pluginDir, PATCHED_SHORTCUTS_FILENAME);
    const tmpFile = `${recFile}.${process.pid}.tmp`;
    fs.writeFileSync(
      tmpFile,
      JSON.stringify({ patchedPaths: uniq, updatedAt: Date.now() }, null, 2) + '\n',
      { encoding: 'utf8', mode: 0o600 }
    );
    fs.renameSync(tmpFile, recFile);
  } catch {}
}

function runWindowsShortcutAdapter(searchDirs, extraFiles) {
  const env = { ...process.env };
  if (Array.isArray(searchDirs)) {
    env.AG_PRISM_LNK_DIRS = JSON.stringify(searchDirs.map((d) => path.resolve(d)));
  } else {
    delete env.AG_PRISM_LNK_DIRS;
  }
  if (Array.isArray(extraFiles) && extraFiles.length > 0) {
    env.AG_PRISM_LNK_EXTRA = JSON.stringify(extraFiles.map((f) => path.resolve(f)));
  } else {
    delete env.AG_PRISM_LNK_EXTRA;
  }
  const listOut = execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', WIN_SHORTCUT_LIST_B64],
    { encoding: 'utf8', env, windowsHide: true, timeout: 10000, stdio: ['ignore', 'pipe', 'ignore'] }
  );
  const rawJson = String(listOut || '').trim();
  const parsed = rawJson ? JSON.parse(rawJson) : [];
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  return {
    entries,
    applyUpdates(updates) {
      if (!Array.isArray(updates) || updates.length === 0) {
        return { applied: [], skipped: [] };
      }
      const applyEnv = { ...process.env, AG_PRISM_LNK_UPDATES: JSON.stringify(updates) };
      const applyOut = execFileSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', WIN_SHORTCUT_APPLY_B64],
        { encoding: 'utf8', env: applyEnv, windowsHide: true, timeout: 10000, stdio: ['ignore', 'pipe', 'ignore'] }
      );
      const res = JSON.parse(String(applyOut || '{}').trim() || '{}');
      return {
        applied: Array.isArray(res?.applied) ? res.applied : [],
        skipped: Array.isArray(res?.skipped) ? res.skipped : [],
      };
    },
  };
}

function execFileTextAsync(file, args, opts) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { encoding: 'utf8', windowsHide: true, ...opts }, (err, stdout) => {
      if (err) reject(err);
      else resolve(String(stdout || ''));
    });
  });
}

async function runWindowsShortcutAdapterAsync(searchDirs, extraFiles) {
  const env = { ...process.env };
  if (Array.isArray(searchDirs)) {
    env.AG_PRISM_LNK_DIRS = JSON.stringify(searchDirs.map((d) => path.resolve(d)));
  } else {
    delete env.AG_PRISM_LNK_DIRS;
  }
  if (Array.isArray(extraFiles) && extraFiles.length > 0) {
    env.AG_PRISM_LNK_EXTRA = JSON.stringify(extraFiles.map((f) => path.resolve(f)));
  } else {
    delete env.AG_PRISM_LNK_EXTRA;
  }
  const listOut = await execFileTextAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', WIN_SHORTCUT_LIST_B64],
    { env, timeout: 10000 }
  );
  const rawJson = String(listOut || '').trim();
  const parsed = rawJson ? JSON.parse(rawJson) : [];
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  return {
    entries,
    async applyUpdates(updates) {
      if (!Array.isArray(updates) || updates.length === 0) {
        return { applied: [], skipped: [] };
      }
      const applyEnv = { ...process.env, AG_PRISM_LNK_UPDATES: JSON.stringify(updates) };
      const applyOut = await execFileTextAsync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', WIN_SHORTCUT_APPLY_B64],
        { env: applyEnv, timeout: 10000 }
      );
      const res = JSON.parse(String(applyOut || '{}').trim() || '{}');
      return {
        applied: Array.isArray(res?.applied) ? res.applied : [],
        skipped: Array.isArray(res?.skipped) ? res.skipped : [],
      };
    },
  };
}

// 异步非阻塞版：供常驻 Daemon 事件循环后台巡检快捷方式，避免 execFileSync 卡死 CDP RPC 与 Omni 流式媒体
async function ensureAntigravityShortcutsCdpFlagAsync(opts = {}) {
  const isWinPlatform = opts.platformOverride ? opts.platformOverride === 'win32' : IS_WIN;
  if (!isWinPlatform && typeof opts.shortcutAdapter !== 'function') {
    return { supported: false, scanned: 0, matched: 0, patched: [], alreadySet: [], skipped: [] };
  }
  try {
    const adapter =
      typeof opts.shortcutAdapter === 'function'
        ? await opts.shortcutAdapter(opts.searchDirs || null, [])
        : await runWindowsShortcutAdapterAsync(opts.searchDirs || null, []);
    const entries = Array.isArray(adapter?.entries) ? adapter.entries : [];
    const updates = [];
    const alreadySet = [];
    let matched = 0;
    for (const item of entries) {
      if (!item || !isAntigravityShortcutTarget(item.targetPath)) continue;
      matched += 1;
      const next = appendCdpFlagToArguments(item.arguments);
      if (next.changed) {
        updates.push({ lnkPath: item.lnkPath, arguments: next.args });
      } else {
        alreadySet.push(item.lnkPath);
      }
    }
    const writeRes = updates.length > 0 ? await adapter.applyUpdates(updates) : { applied: [], skipped: [] };
    if (opts.pluginDir && writeRes.applied.length > 0) {
      const prev = readPatchedShortcutsRecord(opts.pluginDir);
      writePatchedShortcutsRecord(opts.pluginDir, [...prev, ...writeRes.applied]);
    }
    return {
      supported: true,
      scanned: entries.length,
      matched,
      patched: writeRes.applied,
      alreadySet,
      skipped: writeRes.skipped,
    };
  } catch (err) {
    return {
      supported: true,
      scanned: 0,
      matched: 0,
      patched: [],
      alreadySet: [],
      skipped: [],
      error: String(err && err.message ? err.message : err),
    };
  }
}

// 扫描并无损为 Antigravity.lnk 补齐 --remote-debugging-port=0（支持真实 Windows COM 与注入式沙箱适配器）
function ensureAntigravityShortcutsCdpFlag(opts = {}) {
  const isWinPlatform = opts.platformOverride ? opts.platformOverride === 'win32' : IS_WIN;
  if (!isWinPlatform && typeof opts.shortcutAdapter !== 'function') {
    return { supported: false, scanned: 0, matched: 0, patched: [], alreadySet: [], skipped: [] };
  }
  try {
    const adapter =
      typeof opts.shortcutAdapter === 'function'
        ? opts.shortcutAdapter(opts.searchDirs || null, [])
        : runWindowsShortcutAdapter(opts.searchDirs || null, []);
    const entries = Array.isArray(adapter?.entries) ? adapter.entries : [];
    const updates = [];
    const alreadySet = [];
    let matched = 0;
    for (const item of entries) {
      if (!item || !isAntigravityShortcutTarget(item.targetPath)) continue;
      matched += 1;
      const next = appendCdpFlagToArguments(item.arguments);
      if (next.changed) {
        updates.push({ lnkPath: item.lnkPath, arguments: next.args });
      } else {
        alreadySet.push(item.lnkPath);
      }
    }
    const writeRes = updates.length > 0 ? adapter.applyUpdates(updates) : { applied: [], skipped: [] };
    if (opts.pluginDir && writeRes.applied.length > 0) {
      const prev = readPatchedShortcutsRecord(opts.pluginDir);
      writePatchedShortcutsRecord(opts.pluginDir, [...prev, ...writeRes.applied]);
    }
    return {
      supported: true,
      scanned: entries.length,
      matched,
      patched: writeRes.applied,
      alreadySet,
      skipped: writeRes.skipped,
    };
  } catch (err) {
    return {
      supported: true,
      scanned: 0,
      matched: 0,
      patched: [],
      alreadySet: [],
      skipped: [],
      error: String(err && err.message ? err.message : err),
    };
  }
}

// 卸载时精准剥离 Antigravity.lnk 中的 --remote-debugging-port=0 并保留用户原有其他启动参数
function restoreAntigravityShortcutsCdpFlag(opts = {}) {
  const isWinPlatform = opts.platformOverride ? opts.platformOverride === 'win32' : IS_WIN;
  if (!isWinPlatform && typeof opts.shortcutAdapter !== 'function') {
    return { supported: false, restored: [], skipped: [] };
  }
  try {
    const recorded = opts.pluginDir ? readPatchedShortcutsRecord(opts.pluginDir) : [];
    const adapter =
      typeof opts.shortcutAdapter === 'function'
        ? opts.shortcutAdapter(opts.searchDirs || null, recorded)
        : runWindowsShortcutAdapter(opts.searchDirs || null, recorded);
    const entries = Array.isArray(adapter?.entries) ? adapter.entries : [];
    const updates = [];
    for (const item of entries) {
      if (!item || !isAntigravityShortcutTarget(item.targetPath)) continue;
      const next = stripCdpFlagFromArguments(item.arguments);
      if (next.changed) {
        updates.push({ lnkPath: item.lnkPath, arguments: next.args });
      }
    }
    const writeRes = updates.length > 0 ? adapter.applyUpdates(updates) : { applied: [], skipped: [] };
    if (opts.pluginDir) {
      try {
        const recFile = path.join(opts.pluginDir, PATCHED_SHORTCUTS_FILENAME);
        if (fs.existsSync(recFile)) fs.unlinkSync(recFile);
      } catch {}
    }
    return {
      supported: true,
      restored: writeRes.applied,
      skipped: writeRes.skipped,
    };
  } catch (err) {
    return {
      supported: true,
      restored: [],
      skipped: [],
      error: String(err && err.message ? err.message : err),
    };
  }
}

const WIN_HOST_PROBE_PS = [
  '$ErrorActionPreference = "SilentlyContinue"',
  '$ProgressPreference = "SilentlyContinue"',
  '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
  '$procs = @(Get-Process -Name "Antigravity" -ErrorAction SilentlyContinue)',
  'if ($procs.Count -eq 0) { Write-Output "[]"; exit 0 }',
  '$filter = ($procs | ForEach-Object { "ProcessId = " + $_.Id }) -join " OR "',
  '$cimMap = @{}',
  'try {',
  '  foreach ($c in @(Get-CimInstance Win32_Process -Filter $filter -ErrorAction SilentlyContinue)) {',
  '    $cimMap[[int]$c.ProcessId] = $c',
  '  }',
  '} catch {}',
  '$out = @(foreach ($p in $procs) {',
  '  $st = 0',
  '  try { $st = [long]([DateTimeOffset]$p.StartTime).ToUnixTimeMilliseconds() } catch {}',
  '  $cim = $cimMap[[int]$p.Id]',
  '  $exe = ""',
  '  try { $exe = [string]$p.Path } catch {}',
  '  if (-not $exe -and $cim) { $exe = [string]$cim.ExecutablePath }',
  '  $cmd = if ($cim) { [string]$cim.CommandLine } else { "" }',
  '  [pscustomobject]@{',
  '    pid = [int]$p.Id',
  '    imageName = [string]$p.ProcessName',
  '    startMs = $st',
  '    exePath = $exe',
  '    commandLine = $cmd',
  '  }',
  '})',
  'if ($out.Count -eq 0) { Write-Output "[]" } elseif ($out.Count -eq 1) { Write-Output ("[" + ($out[0] | ConvertTo-Json -Compress) + "]") } else { $out | ConvertTo-Json -Compress }',
].join('\n');

const WIN_HOST_PROBE_B64 = Buffer.from(WIN_HOST_PROBE_PS, 'utf16le').toString('base64');

// 解析 POSIX `ps -axo pid=,etime=,comm=,args=` 的 BSD/Linux etime（[[dd-]hh:]mm:ss）为毫秒
function parsePsElapsedMs(etimeStr) {
  const raw = String(etimeStr || '').trim();
  if (!raw) return 0;
  let days = 0;
  let rest = raw;
  const dashIdx = raw.indexOf('-');
  if (dashIdx > 0) {
    days = parseInt(raw.slice(0, dashIdx), 10) || 0;
    rest = raw.slice(dashIdx + 1);
  }
  const parts = rest.split(':').map((x) => parseInt(x, 10) || 0);
  let secs = 0;
  if (parts.length === 3) {
    secs = parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    secs = parts[0] * 60 + parts[1];
  } else if (parts.length === 1) {
    secs = parts[0];
  }
  return (days * 86400 + secs) * 1000;
}

function selectPrimaryHostCandidate(candidates, nowMs = Date.now()) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const mains = [];
  for (const c of candidates) {
    const pid = Number(c && c.pid);
    if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) continue;
    if (!isMainAntigravityProcessSignature(c.imageName, c.commandLine)) continue;
    const startMs = Number(c.startMs) > 0 ? Number(c.startMs) : 0;
    mains.push({
      pid,
      startMs,
      ageMs: startMs > 0 && nowMs >= startMs ? nowMs - startMs : 0,
      exePath: String(c.exePath || '').trim(),
      commandLine: String(c.commandLine || ''),
      hasDebugPortSwitch: hasRemoteDebuggingPortSwitch(c.commandLine),
    });
  }
  if (mains.length === 0) return null;
  mains.sort((a, b) => {
    if (a.startMs > 0 && b.startMs > 0 && a.startMs !== b.startMs) return a.startMs - b.startMs;
    return a.pid - b.pid;
  });
  return mains[0];
}

function parsePosixPsHostCandidates(psStdout, nowMs = Date.now()) {
  const lines = String(psStdout || '').split(/\r?\n/);
  const list = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = /^(\d+)\s+(\S+)\s+(.+)$/.exec(line);
    if (!m) continue;
    const pid = parseInt(m[1], 10);
    const elapsedMs = parsePsElapsedMs(m[2]);
    const cmdLine = m[3].trim();
    if (!cmdLine.toLowerCase().includes('antigravity')) continue;
    let firstExe = cmdLine;
    const macAppIdx = cmdLine.indexOf('.app/Contents/MacOS/');
    if (macAppIdx > 0) {
      const slashAfter = cmdLine.indexOf(' ', macAppIdx + 20);
      firstExe = slashAfter > 0 ? cmdLine.slice(0, slashAfter) : cmdLine;
    } else {
      const spIdx = cmdLine.indexOf(' ');
      firstExe = spIdx > 0 ? cmdLine.slice(0, spIdx) : cmdLine;
    }
    let appBundlePath = firstExe;
    const appEnd = firstExe.indexOf('.app/');
    if (appEnd > 0) {
      appBundlePath = firstExe.slice(0, appEnd + 4);
    }
    list.push({
      pid,
      imageName: firstExe,
      startMs: elapsedMs > 0 ? Math.max(1, nowMs - elapsedMs) : 0,
      exePath: IS_MAC && appBundlePath.endsWith('.app') ? appBundlePath : firstExe,
      commandLine: cmdLine,
    });
  }
  return list;
}

function detectRunningAntigravityHostSync(opts = {}) {
  const nowMs = Number(opts.nowMs) > 0 ? Number(opts.nowMs) : Date.now();
  if (typeof opts.probeProcesses === 'function') {
    return selectPrimaryHostCandidate(opts.probeProcesses(), nowMs);
  }
  try {
    if (IS_WIN) {
      const out = execFileSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', WIN_HOST_PROBE_B64],
        { encoding: 'utf8', windowsHide: true, timeout: 6000, stdio: ['ignore', 'pipe', 'ignore'] }
      );
      const trimmed = String(out || '').trim();
      if (!trimmed) return null;
      const parsed = JSON.parse(trimmed);
      return selectPrimaryHostCandidate(Array.isArray(parsed) ? parsed : [parsed], nowMs);
    }
    const psOut = execFileSync('ps', ['-axo', 'pid=,etime=,args='], {
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return selectPrimaryHostCandidate(parsePosixPsHostCandidates(psOut, nowMs), nowMs);
  } catch {
    return null;
  }
}

function detectRunningAntigravityHost(opts = {}) {
  const nowMs = Number(opts.nowMs) > 0 ? Number(opts.nowMs) : Date.now();
  if (typeof opts.probeProcesses === 'function') {
    return Promise.resolve(opts.probeProcesses()).then((list) => selectPrimaryHostCandidate(list, nowMs));
  }
  return new Promise((resolve) => {
    if (IS_WIN) {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', WIN_HOST_PROBE_B64],
        { encoding: 'utf8', windowsHide: true, timeout: 6000, maxBuffer: 1024 * 1024 },
        (err, stdout) => {
          if (err) {
            resolve(null);
            return;
          }
          try {
            const trimmed = String(stdout || '').trim();
            if (!trimmed) {
              resolve(null);
              return;
            }
            const parsed = JSON.parse(trimmed);
            resolve(selectPrimaryHostCandidate(Array.isArray(parsed) ? parsed : [parsed], nowMs));
          } catch {
            resolve(null);
          }
        }
      );
      return;
    }
    execFile(
      'ps',
      ['-axo', 'pid=,etime=,args='],
      { encoding: 'utf8', timeout: 3000, maxBuffer: 2 * 1024 * 1024 },
      (err, stdout) => {
        if (err) {
          resolve(null);
          return;
        }
        resolve(selectPrimaryHostCandidate(parsePosixPsHostCandidates(stdout, nowMs), nowMs));
      }
    );
  });
}

function getRelaunchPromptStatePaths(pluginDir, extraDirs = []) {
  const dirs = [];
  if (pluginDir) dirs.push(path.resolve(pluginDir));
  for (const d of extraDirs) {
    if (d) dirs.push(path.resolve(d));
  }
  if (!extraDirs || extraDirs.length === 0) {
    if (IS_WIN) {
      const localApp = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
      const watcherDir = path.join(localApp, 'obsidian-prism');
      if (fs.existsSync(watcherDir)) dirs.push(watcherDir);
    } else if (IS_MAC) {
      const macWatcherDir = path.join(os.homedir(), 'Library', 'Application Support', 'obsidian-prism');
      if (fs.existsSync(macWatcherDir)) dirs.push(macWatcherDir);
    }
  }
  const uniq = [];
  const seen = new Set();
  for (const dir of dirs) {
    const norm = IS_WIN ? dir.toLowerCase() : dir;
    if (seen.has(norm)) continue;
    seen.add(norm);
    uniq.push(path.join(dir, RELAUNCH_STATE_FILENAME));
  }
  return uniq;
}

// 与 C# / Swift Watcher 超集双向兼容的单次去重检查（容忍毫秒/秒级精度误差，同时防系统重启后 PID 复用）
function hasRelaunchBeenPromptedForHost(pluginDir, hostPid, hostStartMs = 0, extraDirs = []) {
  const pid = Number(hostPid);
  if (!Number.isInteger(pid) || pid <= 0) return false;
  const startMs = Number(hostStartMs) > 0 ? Number(hostStartMs) : 0;
  const exactKey = `${pid}:${startMs}`;
  const prefix = `${pid}:`;
  const files = getRelaunchPromptStatePaths(pluginDir, extraDirs);
  for (const file of files) {
    try {
      if (!fs.existsSync(file)) continue;
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!parsed || typeof parsed !== 'object') continue;
      if (parsed.key === exactKey || parsed.hostKey === exactKey) return true;
      const recordedPid = Number(parsed.hostPid);
      const recordedStart = Number(parsed.startTimeMs ?? parsed.hostStartMs ?? 0);
      if (recordedPid === pid) {
        if (!startMs || !recordedStart || Math.abs(recordedStart - startMs) <= 15000) {
          return true;
        }
      }
      const list = Array.isArray(parsed.promptedKeys)
        ? parsed.promptedKeys
        : Array.isArray(parsed.prompts)
        ? parsed.prompts
        : [];
      for (const item of list) {
        if (typeof item !== 'string') continue;
        if (item === exactKey) return true;
        if (item.startsWith(prefix)) {
          const itemStart = Number(item.slice(prefix.length)) || 0;
          if (!startMs || !itemStart || Math.abs(itemStart - startMs) <= 15000) {
            return true;
          }
        }
      }
    } catch {}
  }
  return false;
}

function recordRelaunchPromptState(pluginDir, hostPid, hostStartMs = 0, decision = 'prompted', extraDirs = []) {
  const pid = Number(hostPid);
  if (!Number.isInteger(pid) || pid <= 0 || !pluginDir) return null;
  const startMs = Number(hostStartMs) > 0 ? Math.trunc(Number(hostStartMs)) : 0;
  const key = `${pid}:${startMs}`;
  const files = getRelaunchPromptStatePaths(pluginDir, extraDirs);
  let prevKeys = [];
  for (const file of files) {
    try {
      if (!fs.existsSync(file)) continue;
      const oldObj = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Array.isArray(oldObj?.promptedKeys)) {
        prevKeys.push(...oldObj.promptedKeys.filter((x) => typeof x === 'string'));
      }
    } catch {}
  }
  const promptedKeys = Array.from(new Set([...prevKeys.slice(-24), key]));
  const payload = {
    hostPid: pid,
    startTimeMs: startMs,
    hostStartMs: startMs,
    key,
    hostKey: key,
    promptedKeys,
    decision: String(decision || 'prompted'),
    reason: String(decision || 'prompted'),
    updatedAt: Date.now(),
  };
  const jsonText = JSON.stringify(payload, null, 2) + '\n';
  for (const file of files) {
    try {
      const dir = path.dirname(file);
      fs.mkdirSync(dir, { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, jsonText, { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(tmp, file);
    } catch {}
  }
  return payload;
}

const WIN_MESSAGEBOX_PS = [
  '$ErrorActionPreference = "SilentlyContinue"',
  'Add-Type -AssemblyName System.Windows.Forms',
  '$res = [System.Windows.Forms.MessageBox]::Show(',
  '  [string]$env:AG_PRISM_DLG_BODY,',
  '  [string]$env:AG_PRISM_DLG_TITLE,',
  '  [System.Windows.Forms.MessageBoxButtons]::YesNo,',
  '  [System.Windows.Forms.MessageBoxIcon]::Information',
  ')',
  'Write-Output ([string]$res)',
].join('\n');

const WIN_MESSAGEBOX_B64 = Buffer.from(WIN_MESSAGEBOX_PS, 'utf16le').toString('base64');

const MAC_DIALOG_APPLESCRIPT = [
  'on run argv',
  '  set msgText to item 1 of argv',
  '  set titleText to item 2 of argv',
  '  set btnLater to item 3 of argv',
  '  set btnRelaunch to item 4 of argv',
  '  set dlg to display dialog msgText with title titleText buttons {btnLater, btnRelaunch} default button btnRelaunch with icon note',
  '  return button returned of dlg',
  'end run',
].join('\n');

function buildRelaunchDialogCopy(lang = 'zh-CN') {
  const low = String(lang || 'zh-CN').toLowerCase();
  const isZh = low.startsWith('zh') || low === 'yue';
  if (isZh) {
    return {
      title: 'Obsidian Prism',
      body:
        '检测到 Antigravity 已启动或完成更新，但未开启本地调试桥接参数（--remote-debugging-port=0），导致 Obsidian Prism 界面无法挂载。\n\n' +
        '是否立即重新打开 Antigravity 以恢复 Obsidian Prism 界面？\n' +
        '（若当前正在进行对话或有未保存内容，请选择“否 / 稍后”，下次通过快捷方式启动将自动生效。）',
      laterBtn: '稍后',
      relaunchBtn: '立即重开',
    };
  }
  return {
    title: 'Obsidian Prism',
    body:
      'Antigravity started or updated without --remote-debugging-port=0, so Obsidian Prism cannot attach.\n\n' +
      'Relaunch Antigravity now to restore Obsidian Prism?\n' +
      '(Choose "No / Later" if a task is running; shortcuts have been updated for next launch.)',
    laterBtn: 'Later',
    relaunchBtn: 'Relaunch Now',
  };
}

function promptUserForHostRelaunch(opts = {}) {
  const copy = buildRelaunchDialogCopy(opts.lang || 'zh-CN');
  if (typeof opts.dialogHook === 'function') {
    return Promise.resolve(opts.dialogHook(copy)).then((ans) => Boolean(ans));
  }
  return new Promise((resolve) => {
    if (IS_WIN) {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', WIN_MESSAGEBOX_B64],
        {
          encoding: 'utf8',
          windowsHide: true,
          timeout: 120000,
          env: {
            ...process.env,
            AG_PRISM_DLG_TITLE: copy.title,
            AG_PRISM_DLG_BODY: copy.body,
          },
        },
        (err, stdout) => {
          if (err) {
            resolve(false);
            return;
          }
          resolve(String(stdout || '').trim().toLowerCase() === 'yes');
        }
      );
      return;
    }
    if (IS_MAC) {
      execFile(
        'osascript',
        ['-e', MAC_DIALOG_APPLESCRIPT, copy.body, copy.title, copy.laterBtn, copy.relaunchBtn],
        { encoding: 'utf8', timeout: 120000 },
        (err, stdout) => {
          if (err) {
            resolve(false);
            return;
          }
          resolve(String(stdout || '').trim() === copy.relaunchBtn);
        }
      );
      return;
    }
    resolve(false);
  });
}

// 纯异步顺序控制模型：温和请求退出 -> 轮询确认单实例锁完全释放 -> 带 --remote-debugging-port=0 拉起（供单测与脱离微进程复用）
async function executeHostRelaunchSequence(task, hooks = {}) {
  const pid = Number(task && task.hostPid);
  const exePath = String((task && task.exePath) || '').trim();
  const maxWaitMs = Math.max(500, Number(task?.maxWaitMs) || 25000);
  const pollMs = Math.max(20, Number(task?.pollMs) || 250);
  const settleMs = Math.max(0, Number(task?.settleMs ?? 350));
  const sleepFn = typeof hooks.sleep === 'function' ? hooks.sleep : (ms) => new Promise((r) => setTimeout(r, ms));
  const requestGracefulQuit =
    typeof hooks.requestGracefulQuit === 'function' ? hooks.requestGracefulQuit : async () => true;
  const isHostStillRunning =
    typeof hooks.isHostStillRunning === 'function'
      ? hooks.isHostStillRunning
      : async () => {
          try {
            process.kill(pid, 0);
            return true;
          } catch (e) {
            return Boolean(e && e.code === 'EPERM');
          }
        };
  const launchWithCdpFlag =
    typeof hooks.launchWithCdpFlag === 'function' ? hooks.launchWithCdpFlag : async () => true;

  await requestGracefulQuit(pid, exePath);
  const deadline = Date.now() + maxWaitMs;
  let exited = false;
  while (Date.now() <= deadline) {
    const alive = await isHostStillRunning(pid, exePath);
    if (!alive) {
      exited = true;
      break;
    }
    await sleepFn(pollMs);
  }
  if (!exited) {
    return { relaunched: false, reason: 'host-did-not-exit' };
  }
  if (settleMs > 0) {
    await sleepFn(settleMs);
  }
  await launchWithCdpFlag(exePath, [CDP_OPT_IN_SWITCH]);
  return { relaunched: true, exePath, args: [CDP_OPT_IN_SWITCH] };
}

const WIN_DETACHED_RELAUNCH_PS = [
  '$ErrorActionPreference = "SilentlyContinue"',
  '$taskFile = [string]$env:AG_PRISM_RELAUNCH_TASK_FILE',
  'if (-not $taskFile -or -not (Test-Path -LiteralPath $taskFile -PathType Leaf)) { exit 0 }',
  '$task = Get-Content -LiteralPath $taskFile -Raw -Encoding UTF8 | ConvertFrom-Json',
  'Remove-Item -LiteralPath $taskFile -Force -ErrorAction SilentlyContinue',
  '$targetPid = [int]$task.hostPid',
  '$exePath = [string]$task.exePath',
  'if (-not $exePath) {',
  '  $exePath = Join-Path $env:LOCALAPPDATA "Programs\\antigravity\\Antigravity.exe"',
  '}',
  'if (-not (Test-Path -LiteralPath $exePath -PathType Leaf)) { exit 0 }',
  'function Test-MainHostAlive {',
  '  $ps = @(Get-Process -Name "Antigravity" -ErrorAction SilentlyContinue)',
  '  if ($ps.Count -eq 0) { return $false }',
  '  foreach ($p in $ps) {',
  '    if ($p.Id -eq $targetPid) { return $true }',
  '    $cl = [string](Get-CimInstance Win32_Process -Filter ("ProcessId = " + $p.Id) -ErrorAction SilentlyContinue).CommandLine',
  '    if ($cl -and ($cl -notmatch "--type=") -and ($cl -notmatch "sidecar_sdk") -and ($cl -notmatch "register_loader\\.js")) {',
  '      return $true',
  '    }',
  '  }',
  '  return $false',
  '}',
  'foreach ($p in @(Get-Process -Name "Antigravity" -ErrorAction SilentlyContinue)) {',
  '  if ($p.MainWindowHandle -ne 0) { $null = $p.CloseMainWindow() }',
  '}',
  '$exited = $false',
  'for ($i = 0; $i -lt 100; $i++) {',
  '  if (-not (Test-MainHostAlive)) { $exited = $true; break }',
  '  if ($i -eq 12) {',
  '    foreach ($p in @(Get-Process -Name "Antigravity" -ErrorAction SilentlyContinue)) {',
  '      if ($p.MainWindowHandle -ne 0) { $null = $p.CloseMainWindow() }',
  '    }',
  '  }',
  '  Start-Sleep -Milliseconds 250',
  '}',
  'if (-not $exited) { exit 0 }',
  'Start-Sleep -Milliseconds 350',
  '$workDir = Split-Path -Parent $exePath',
  'Start-Process -FilePath $exePath -ArgumentList "--remote-debugging-port=0" -WorkingDirectory $workDir | Out-Null',
].join('\n');

const WIN_DETACHED_RELAUNCH_B64 = Buffer.from(WIN_DETACHED_RELAUNCH_PS, 'utf16le').toString('base64');

const WIN_WMI_BREAKAWAY_PS = [
  '$ErrorActionPreference = "Stop"',
  '$cmd = "powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -EncodedCommand " + $env:AG_PRISM_HELPER_B64',
  '$psi = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ ShowWindow = [uint16]0 }',
  '$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $cmd; ProcessStartupInformation = $psi }',
  'if ($r -and $r.ReturnValue -eq 0 -and $r.ProcessId) { Write-Output $r.ProcessId }',
].join('\n');

const WIN_WMI_BREAKAWAY_B64 = Buffer.from(WIN_WMI_BREAKAWAY_PS, 'utf16le').toString('base64');

function normalizeMacAppBundlePath(rawPath) {
  const s = String(rawPath || '').trim();
  if (!s) return '/Applications/Antigravity.app';
  const m = /^(.+?\.app)(?:\/.*)?$/i.exec(s);
  if (m && m[1]) return m[1];
  return '/Applications/Antigravity.app';
}

const MAC_DETACHED_RELAUNCH_SH = [
  'target_pid="$1"',
  'app_path="$2"',
  'if [ -z "$app_path" ]; then app_path="/Applications/Antigravity.app"; fi',
  'unset ELECTRON_RUN_AS_NODE',
  'osascript -e \'on run argv\' -e \'tell application (item 1 of argv) to quit\' -e \'end run\' "$app_path" >/dev/null 2>&1 || osascript -e \'tell application "Antigravity" to quit\' >/dev/null 2>&1 || kill -TERM "$target_pid" >/dev/null 2>&1 || true',
  'lock_file="$HOME/Library/Application Support/Antigravity/SingletonLock"',
  'bundle_prefix="$app_path/Contents/MacOS/"',
  'i=0',
  'exited=0',
  'while [ "$i" -lt 120 ]; do',
  '  main_alive=0',
  '  helper_alive=0',
  '  lock_alive=0',
  '  if kill -0 "$target_pid" >/dev/null 2>&1; then main_alive=1; fi',
  '  if ps -ax -o command= 2>/dev/null | grep -F -- "$bundle_prefix" | grep -v grep >/dev/null 2>&1; then helper_alive=1; fi',
  '  if [ -e "$lock_file" ] || [ -L "$lock_file" ]; then lock_alive=1; fi',
  '  if [ "$main_alive" -eq 0 ] && [ "$helper_alive" -eq 0 ] && [ "$lock_alive" -eq 0 ]; then exited=1; break; fi',
  '  if [ "$i" -eq 40 ] && [ "$main_alive" -eq 1 ]; then kill -TERM "$target_pid" >/dev/null 2>&1 || true; fi',
  '  sleep 0.25',
  '  i=$((i + 1))',
  'done',
  'if [ "$exited" -ne 1 ] && kill -0 "$target_pid" >/dev/null 2>&1; then exit 0; fi',
  'sleep 0.5',
  'open -na "$app_path" --args --remote-debugging-port=0 >/dev/null 2>&1 &',
].join('\n');

// 派生物理脱离宿主进程树与 Job Object 的独立微进程执行「温和退出 -> 等单实例锁释放 -> 带参重开」
function spawnDetachedHostRelaunchHelper(task, opts = {}) {
  const hostPid = Number(task && task.hostPid);
  if (!Number.isInteger(hostPid) || hostPid <= 0) {
    return { spawned: false, reason: 'invalid-pid' };
  }
  if (typeof opts.spawnHook === 'function') {
    return opts.spawnHook({
      hostPid,
      exePath: task.exePath || '',
      args: [CDP_OPT_IN_SWITCH],
    });
  }
  if (IS_WIN) {
    const privateStateDir = path.join(os.homedir(), '.gemini', 'config', 'plugins', 'obsidian-prism');
    fs.mkdirSync(privateStateDir, { recursive: true });
    const privateTaskFile = path.join(privateStateDir, '.relaunch-task.json');
    const resolvedExe =
      task.exePath ||
      path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Programs', 'antigravity', 'Antigravity.exe');
    const tmpTaskFile = `${privateTaskFile}.${process.pid}.tmp`;
    fs.writeFileSync(
      tmpTaskFile,
      JSON.stringify({ hostPid, exePath: resolvedExe }, null, 2) + '\n',
      { encoding: 'utf8', mode: 0o600 }
    );
    fs.renameSync(tmpTaskFile, privateTaskFile);
    if (!opts.disableWmiBreakaway) {
      try {
        const wmiRunnerPs = `$env:AG_PRISM_RELAUNCH_TASK_FILE = [System.IO.Path]::Combine($env:USERPROFILE, '.gemini', 'config', 'plugins', 'obsidian-prism', '.relaunch-task.json'); powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -EncodedCommand ${WIN_DETACHED_RELAUNCH_B64}`;
        const wmiRunnerB64 = Buffer.from(wmiRunnerPs, 'utf16le').toString('base64');
        const out = execFileSync(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', WIN_WMI_BREAKAWAY_B64],
          {
            encoding: 'utf8',
            windowsHide: true,
            timeout: 6000,
            stdio: ['ignore', 'pipe', 'ignore'],
            env: { ...process.env, AG_PRISM_HELPER_B64: wmiRunnerB64 },
          }
        );
        const helperPid = parseInt(String(out || '').trim().split(/\s+/).pop(), 10);
        if (Number.isInteger(helperPid) && helperPid > 0) {
          return { spawned: true, pid: helperPid, method: 'wmi-breakaway' };
        }
      } catch {}
    }
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', WIN_DETACHED_RELAUNCH_B64],
      {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        env: { ...process.env, AG_PRISM_RELAUNCH_TASK_FILE: privateTaskFile },
      }
    );
    child.unref();
    return { spawned: true, pid: child.pid || null, method: 'detached-spawn' };
  }

  if (IS_MAC) {
    const appPath = normalizeMacAppBundlePath(task.exePath);
    const cleanEnv = { ...process.env };
    delete cleanEnv.ELECTRON_RUN_AS_NODE;
    const child = spawn('/usr/bin/nohup', ['/bin/sh', '-c', MAC_DETACHED_RELAUNCH_SH, 'sh', String(hostPid), appPath], {
      detached: true,
      stdio: 'ignore',
      env: cleanEnv,
    });
    child.unref();
    return { spawned: true, pid: child.pid || null, method: 'nohup-sh', appPath };
  }

  return { spawned: false, reason: 'unsupported-platform' };
}

function isEligibleTarget(target) {
  if (!target || target.type !== 'page' || !target.webSocketDebuggerUrl) return false;
  const url = String(target.url || '').trim();
  const title = String(target.title || '').trim();
  if (!url) return false;
  const lowUrl = url.toLowerCase();
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
  if (/^(?:untitled|launchpad)$/i.test(title) || /\/launchpad(?:\.html)?(?:[?#]|$)/i.test(lowUrl)) return false;

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
  if (/\bantigravity\b/i.test(title)) return true;
  if (m[1].toLowerCase() === 'https' && (!title || /^127\.0\.0\.1(?::\d+)?/.test(title))) {
    return true;
  }
  return false;
}

async function listPages(port) {
  const res = await fetch(`http://127.0.0.1:${port}/json/list`, {
    signal: AbortSignal.timeout(2000),
  });
  const targets = await res.json();
  return targets.filter(isEligibleTarget);
}

async function getBrowserWsUrl(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return null;
    const info = await res.json();
    return typeof info?.webSocketDebuggerUrl === 'string' ? info.webSocketDebuggerUrl : null;
  } catch {
    return null;
  }
}

class CdpSession {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.closed = false;
    this.onClose = null;
    this.listeners = new Map();
    ws.addEventListener('message', (evt) => {
      let msg;
      try {
        msg = JSON.parse(evt.data);
      } catch {
        return;
      }
      if (msg.method) {
        for (const cb of this.listeners.get(msg.method) || []) cb(msg.params);
        return;
      }
      const p = msg.id && this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.error) p.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else p.resolve(msg.result);
    });
    const markClosed = (reason) => {
      if (this.closed) return;
      this.closed = true;
      for (const p of this.pending.values()) {
        clearTimeout(p.timer);
        p.reject(new Error(reason || 'CDP connection closed'));
      }
      this.pending.clear();
      if (this.onClose) {
        try {
          this.onClose();
        } catch {}
      }
    };
    ws.addEventListener('close', () => markClosed('CDP connection closed'));
    ws.addEventListener('error', () => markClosed('CDP socket error'));
  }

  static connect(wsUrl, timeoutMs = 3000) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      const timer = setTimeout(() => {
        try {
          ws.close();
        } catch {}
        reject(new Error('CDP connect timeout'));
      }, timeoutMs);
      if (timer && typeof timer.unref === 'function') timer.unref();
      ws.addEventListener(
        'open',
        () => {
          clearTimeout(timer);
          resolve(new CdpSession(ws));
        },
        { once: true }
      );
      ws.addEventListener(
        'error',
        () => {
          clearTimeout(timer);
          reject(new Error('CDP connect failed'));
        },
        { once: true }
      );
    });
  }

  send(method, params = {}, timeoutMs = 5000) {
    if (this.closed) return Promise.reject(new Error('CDP connection closed'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP ${method} timeout`));
      }, timeoutMs);
      if (timer && typeof timer.unref === 'function') timer.unref();
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

  on(method, callback) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(callback);
  }

  async evaluate(expression, awaitPromise = false, timeoutMs = 4000) {
    const res = await this.send(
      'Runtime.evaluate',
      {
        expression,
        returnByValue: true,
        awaitPromise,
      },
      timeoutMs
    );
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
    }
    return res.result.value;
  }

  close() {
    if (!this.closed) this.ws.close();
  }
}

// ── Zero-Dependency Lexical CSS & JS Safe Minifiers ─────────────────────────
const REGEX_KW = new Set([
  'return', 'throw', 'case', 'delete', 'void', 'typeof',
  'instanceof', 'in', 'of', 'new', 'yield', 'await', 'else', 'do',
]);
const COND_KW = new Set(['if', 'while', 'for', 'with']);
const SAFE_PREV_NO_ASI = new Set([';', '{', ',', '(', '[', '=', ':', '?', '!', '&', '|', '^', '*', '%', '<', '>']);
const SAFE_NEXT_NO_ASI = new Set(['}', ')', ']', ';', ',', '?', ':']);
const RESERVED_OR_GLOBAL = new Set([
  'arguments', 'undefined', 'Infinity', 'NaN', 'globalThis', 'window', 'self', 'document', 'navigator',
  'location', 'localStorage', 'sessionStorage', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame',
  'requestIdleCallback', 'cancelIdleCallback', 'queueMicrotask', 'structuredClone', 'atob', 'btoa',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate',
  'MutationObserver', 'MutationRecord', 'IntersectionObserver', 'IntersectionObserverEntry',
  'ResizeObserver', 'ResizeObserverEntry', 'PerformanceObserver', 'IdleDeadline',
  'AbortController', 'AbortSignal', 'getComputedStyle', 'matchMedia',
  'getSelection', 'devicePixelRatio', 'innerWidth', 'innerHeight', 'visualViewport', 'fetch', 'WebSocket',
  'Worker', 'SharedWorker', 'BroadcastChannel', 'MessageChannel', 'MessagePort',
  'URL', 'URLSearchParams', 'Blob', 'File', 'FileReader', 'FormData', 'Headers', 'Request', 'Response',
  'TextEncoder', 'TextDecoder', 'crypto', 'console', 'module', 'exports', 'require', 'process', 'Buffer',
  '__dirname', '__filename', 'Promise', 'Object', 'Array', 'String', 'Number', 'Boolean', 'BigInt', 'Math',
  'Date', 'JSON', 'Map', 'Set', 'WeakMap', 'WeakSet', 'WeakRef', 'FinalizationRegistry',
  'ArrayBuffer', 'SharedArrayBuffer', 'Atomics', 'DataView', 'Uint8ClampedArray', 'Uint8Array',
  'Uint16Array', 'Uint32Array', 'Int8Array', 'Int16Array', 'Int32Array', 'Float32Array', 'Float64Array',
  'Intl', 'Error', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError', 'AggregateError', 'reportError',
  'RegExp', 'Symbol', 'Proxy', 'Reflect', 'encodeURIComponent', 'decodeURIComponent',
  'encodeURI', 'decodeURI', 'parseInt', 'parseFloat', 'isFinite', 'isNaN',
  'CSS', 'CSSStyleSheet', 'FontFace', 'Node', 'NodeFilter', 'DOMParser', 'XMLSerializer',
  'Element', 'HTMLElement', 'SVGElement', 'HTMLTemplateElement', 'DocumentFragment', 'ShadowRoot',
  'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'PointerEvent', 'FocusEvent', 'ClipboardItem',
  'Image', 'ImageData', 'ImageBitmap', 'createImageBitmap', 'Path2D', 'OffscreenCanvas',
  'OffscreenCanvasRenderingContext2D', 'CanvasRenderingContext2D', 'WebGL2RenderingContext', 'WebGLRenderingContext',
  'trustedTypes', 'TrustedTypes', 'customElements', 'indexedDB', 'caches', 'speechSynthesis',
]);

function isIdChar(ch) {
  if (!ch) return false;
  const c = ch.charCodeAt(0);
  return (
    (c >= 65 && c <= 90) ||
    (c >= 97 && c <= 122) ||
    (c >= 48 && c <= 57) ||
    c === 95 ||
    c === 36 ||
    c > 127
  );
}

function needsSpace(a, b) {
  if (!a || !b) return false;
  if (isIdChar(a) && isIdChar(b)) return true;
  if ((a === '+' && b === '+') || (a === '-' && b === '-')) return true;
  if (a === '/' && (b === '/' || b === '*')) return true;
  if (a === '<' && b === '!') return true;
  return false;
}

function minifyCss(css) {
  const n = css.length;
  const out = [];
  let i = 0;
  let pendingWS = false;
  const NO_SPACE_AFTER = new Set(['{', '}', ';', ',', '>', '~', '(', ':']);
  const NO_SPACE_BEFORE = new Set(['{', '}', ';', ',', '>', '~', ')']);
  const isHex = (c) => (c >= 48 && c <= 57) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102);
  const isIdCont = (c) =>
    (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 45;
  while (i < n) {
    const ch = css[i];
    if (ch === "'" || ch === '"') {
      if (pendingWS && out.length > 0 && !NO_SPACE_AFTER.has(out[out.length - 1])) {
        out.push(' ');
      }
      pendingWS = false;
      let j = i + 1;
      while (j < n) {
        if (css[j] === '\\') {
          j += 2;
          continue;
        }
        if (css[j] === ch) {
          j++;
          break;
        }
        j++;
      }
      out.push(css.slice(i, j));
      i = j;
      continue;
    }
    if (ch === '/' && css[i + 1] === '*') {
      i += 2;
      while (i < n && !(css[i] === '*' && css[i + 1] === '/')) i++;
      i += 2;
      pendingWS = true;
      continue;
    }
    if (
      (ch === 'u' || ch === 'U') &&
      (css[i + 1] === 'r' || css[i + 1] === 'R') &&
      (css[i + 2] === 'l' || css[i + 2] === 'L') &&
      css[i + 3] === '('
    ) {
      if (pendingWS && out.length > 0 && !NO_SPACE_AFTER.has(out[out.length - 1])) {
        out.push(' ');
      }
      pendingWS = false;
      let j = i + 4;
      let q = '';
      while (j < n) {
        const c = css[j];
        if (q) {
          if (c === '\\') { j += 2; continue; }
          if (c === q) q = '';
        } else {
          if (c === "'" || c === '"') q = c;
          else if (c === ')') { j++; break; }
        }
        j++;
      }
      out.push(css.slice(i, j));
      i = j;
      continue;
    }
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
      pendingWS = true;
      i++;
      continue;
    }
    if (ch === '}' && out.length > 0 && out[out.length - 1] === ';') {
      out.pop();
    }
    if (NO_SPACE_BEFORE.has(ch) || (ch === '!' && css.startsWith('!important', i))) {
      pendingWS = false;
      out.push(ch);
      i++;
      continue;
    }
    if (pendingWS && out.length > 0 && !NO_SPACE_AFTER.has(out[out.length - 1])) {
      out.push(' ');
    }
    pendingWS = false;
    if (
      ch === '#' &&
      i + 6 < n &&
      (i + 7 >= n || !isIdCont(css.charCodeAt(i + 7))) &&
      isHex(css.charCodeAt(i + 1)) &&
      isHex(css.charCodeAt(i + 2)) &&
      isHex(css.charCodeAt(i + 3)) &&
      isHex(css.charCodeAt(i + 4)) &&
      isHex(css.charCodeAt(i + 5)) &&
      isHex(css.charCodeAt(i + 6)) &&
      css[i + 1].toLowerCase() === css[i + 2].toLowerCase() &&
      css[i + 3].toLowerCase() === css[i + 4].toLowerCase() &&
      css[i + 5].toLowerCase() === css[i + 6].toLowerCase()
    ) {
      let k = i + 7;
      let pDepth = 0;
      let inDeclVal = false;
      while (k < n) {
        const kc = css[k];
        if (kc === "'" || kc === '"') {
          k++;
          while (k < n) {
            if (css[k] === '\\') { k += 2; continue; }
            if (css[k] === kc) { k++; break; }
            k++;
          }
          continue;
        }
        if (kc === '/' && css[k + 1] === '*') {
          k += 2;
          while (k < n && !(css[k] === '*' && css[k + 1] === '/')) k++;
          k += 2;
          continue;
        }
        if (kc === '(') pDepth++;
        else if (kc === ')') { if (pDepth > 0) pDepth--; }
        else if (pDepth === 0) {
          if (kc === ';' || kc === '}') { inDeclVal = true; break; }
          if (kc === '{') break;
        }
        k++;
      }
      if (inDeclVal) {
        out.push('#' + css[i + 1] + css[i + 3] + css[i + 5]);
        i += 7;
        continue;
      }
    }
    out.push(ch);
    i++;
  }
  return out.join('').trim();
}

function serializeJsValue(val) {
  return JSON.stringify(val).replace(/[<>\u2028\u2029]/g, (ch) =>
    `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`
  );
}

function serializeStringListExpr(list) {
  const arrExpr = serializeJsValue(list);
  if (!Array.isArray(list) || list.length < 8) return arrExpr;
  for (const sep of ['\x7f', '\u00fe', '\u00ff']) {
    if (list.every((s) => typeof s === 'string' && !s.includes(sep))) {
      const joinedExpr = `${serializeJsValue(list.join(sep))}.split(${serializeJsValue(sep)})`;
      if (Buffer.byteLength(joinedExpr, 'utf8') < Buffer.byteLength(arrExpr, 'utf8')) return joinedExpr;
    }
  }
  return arrExpr;
}

const PROTECTED_CSS_LITERALS = ['interaction-takeover-card', 'side-question-panel', 'ag-cs-home-panel'];

const LZSS_SAFE_ASCII = (() => {
  const arr = [];
  for (let c = 35; c <= 126; c++) {
    if (c !== 60 && c !== 62 && c !== 92) arr.push(c);
  }
  return arr; // 89 unescaped 1-byte JSON ASCII chars (no ", <, >, \)
})();

// 纯同步零-eval UTF-16 LZSS 压缩器（~2.7ms 解码，支持完整 BMP/CJK/Emoji 与首现受保护字面量原样保留）
function packLzssJsExpr(text, protectFirstList = []) {
  if (typeof text !== 'string' || text.length < 1024) return null;
  const n = text.length;
  const usedLow = new Uint8Array(2048);
  for (let i = 0; i < n; i++) {
    const cc = text.charCodeAt(i);
    if (cc >= 0x00a1 && cc < 0x0800) usedLow[cc] = 1;
  }
  // 寻找 0x00A1..0x07FF（全部 2 字节 UTF-8、无转义、无代理项）内最长连续空闲区间
  let bestStart = -1;
  let bestLen = 0;
  let curStart = -1;
  for (let cc = 0x00a1; cc <= 0x0800; cc++) {
    if (cc < 0x0800 && !usedLow[cc]) {
      if (curStart < 0) curStart = cc;
    } else if (curStart >= 0) {
      const len = cc - curStart;
      if (len > bestLen) {
        bestLen = len;
        bestStart = curStart;
      }
      curStart = -1;
    }
  }
  if (bestLen < 512) return null;

  const tokStart = bestStart;
  const tokEnd = bestStart + bestLen;
  const BASE = LZSS_SAFE_ASCII.length; // 89
  const shortSlots = Math.floor(bestLen * 0.72);
  const longBase = tokStart + shortSlots;
  const longSlots = bestLen - shortSlots;
  const shortMaxDist = Math.floor((shortSlots * BASE) / 24);
  const longMaxDist = Math.min(65535, Math.floor((longSlots * BASE * BASE) / 128));
  if (shortMaxDist < 64 || longMaxDist < 512) return null;

  const protectedPos = protectFirstList && protectFirstList.length > 0 ? new Uint8Array(n) : null;
  if (protectedPos) {
    for (let p = 0; p < protectFirstList.length; p++) {
      const lit = protectFirstList[p];
      if (!lit) continue;
      const idx = text.indexOf(lit);
      if (idx >= 0) {
        for (let k = 0; k < lit.length; k++) protectedPos[idx + k] = 1;
      }
    }
  }

  const charBytes = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const cc = text.charCodeAt(i);
    charBytes[i] =
      cc < 0x80
        ? cc === 34 || cc === 92
          ? 2
          : cc < 32 || cc === 60 || cc === 62
          ? 6
          : 1
        : cc < 0x800
        ? 2
        : 3;
  }

  const head = new Int32Array(65536);
  head.fill(-1);
  const prev = new Int32Array(n);
  prev.fill(-1);
  const hash3 = (pos) =>
    ((text.charCodeAt(pos) * 31 + text.charCodeAt(pos + 1)) * 31 + text.charCodeAt(pos + 2)) & 0xffff;
  const insert = (pos) => {
    if (pos + 2 >= n) return;
    const h = hash3(pos);
    prev[pos] = head[h];
    head[h] = pos;
  };
  const findBest = (pos) => {
    if (pos + 2 >= n) return { len: 0, dist: 0, gain: 0 };
    if (protectedPos && protectedPos[pos]) return { len: 0, dist: 0, gain: 0 };
    const c0 = text.charCodeAt(pos);
    if (c0 >= 0xdc00 && c0 <= 0xdfff) return { len: 0, dist: 0, gain: 0 };
    const h = hash3(pos);
    let cur = head[h];
    let bestMatchLen = 0;
    let bestDist = 0;
    let bestGain = 0;
    let steps = 0;
    let maxLen = Math.min(131, n - pos);
    if (protectedPos) {
      for (let k = 1; k < maxLen; k++) {
        if (protectedPos[pos + k]) {
          maxLen = k;
          break;
        }
      }
      if (maxLen < 3) return { len: 0, dist: 0, gain: 0 };
    }
    const c1 = text.charCodeAt(pos + 1);
    const c2 = text.charCodeAt(pos + 2);
    while (cur >= 0 && pos - cur <= longMaxDist && steps < 384) {
      steps++;
      if (
        text.charCodeAt(cur) === c0 &&
        text.charCodeAt(cur + 1) === c1 &&
        text.charCodeAt(cur + 2) === c2
      ) {
        let l = 3;
        let matchBytes = charBytes[pos] + charBytes[pos + 1] + charBytes[pos + 2];
        while (l < maxLen && text.charCodeAt(cur + l) === text.charCodeAt(pos + l)) {
          matchBytes += charBytes[pos + l];
          l++;
        }
        if (l > 0) {
          const lastC = text.charCodeAt(pos + l - 1);
          if (lastC >= 0xd800 && lastC <= 0xdbff) {
            matchBytes -= charBytes[pos + l - 1];
            l--;
          }
        }
        if (l >= 3) {
          const dist = pos - cur;
          const cost = dist <= shortMaxDist && l <= 26 ? 3 : l >= 4 ? 4 : 999;
          const gain = matchBytes - cost;
          if (gain > bestGain || (gain === bestGain && l > bestMatchLen)) {
            bestGain = gain;
            bestMatchLen = l;
            bestDist = dist;
            if (bestMatchLen === maxLen) break;
          }
        }
      }
      cur = prev[cur];
    }
    return { len: bestMatchLen, dist: bestDist, gain: bestGain };
  };

  const out = [];
  let i = 0;
  while (i < n) {
    const m = findBest(i);
    if (m.gain >= 1) {
      insert(i);
      const m2 = findBest(i + 1);
      if (m2.gain > m.gain + charBytes[i]) {
        out.push(text[i]);
        i++;
        continue;
      }
      if (m.dist <= shortMaxDist && m.len <= 26) {
        const st = (m.dist - 1) * 24 + (m.len - 3);
        out.push(String.fromCharCode(tokStart + Math.floor(st / BASE), LZSS_SAFE_ASCII[st % BASE]));
      } else {
        const st = (m.dist - 1) * 128 + (m.len - 4);
        const q = Math.floor(st / BASE);
        out.push(
          String.fromCharCode(
            longBase + Math.floor(q / BASE),
            LZSS_SAFE_ASCII[q % BASE],
            LZSS_SAFE_ASCII[st % BASE]
          )
        );
      }
      for (let k = 1; k < m.len; k++) insert(i + k);
      i += m.len;
    } else {
      insert(i);
      out.push(text[i]);
      i++;
    }
  }

  const encoded = out.join('');
  // 严格无损往返验证（与运行时解码器逐字节一致）
  const o = new Uint16Array(n);
  let p = 0;
  const decG = (c) => c - 35 - (c > 60) - (c > 62) - (c > 92);
  for (let idx = 0; idx < encoded.length; ) {
    const c = encoded.charCodeAt(idx++);
    if (c < tokStart || c >= tokEnd) {
      if (p >= n) return null;
      o[p++] = c;
      continue;
    }
    const v1 = decG(encoded.charCodeAt(idx++));
    let st;
    let l;
    let d;
    if (c < longBase) {
      st = (c - tokStart) * 89 + v1;
      l = 3 + (st % 24);
      d = 1 + ((st / 24) | 0);
    } else {
      st = ((c - longBase) * 89 + v1) * 89 + decG(encoded.charCodeAt(idx++));
      l = 4 + (st % 128);
      d = 1 + ((st / 128) | 0);
    }
    let q = p - d;
    if (q < 0 || p + l > n) return null;
    while (l-- > 0) o[p++] = o[q++];
  }
  if (p !== n) return null;
  let verify = '';
  for (let idx = 0; idx < p; idx += 16384) {
    verify += String.fromCharCode.apply(null, o.subarray(idx, Math.min(p, idx + 16384)));
  }
  if (verify !== text) return null;

  const rangeCheck = tokEnd === 2048 ? `c<${tokStart}||c>=2048` : `c<${tokStart}||c>=${tokEnd}`;
  return `(()=>{let s=${serializeJsValue(encoded)},o=new Uint16Array(${n}),p=0,g=c=>c-35-(c>60)-(c>62)-(c>92),r="",i=0;for(;i<s.length;){let c=s.charCodeAt(i++);if(${rangeCheck}){o[p++]=c;continue}let v=g(s.charCodeAt(i++)),t,l,d;if(c<${longBase}){t=(c-${tokStart})*89+v;l=3+t%24;d=1+(t/24|0)}else{t=((c-${longBase})*89+v)*89+g(s.charCodeAt(i++));l=4+t%128;d=1+(t/128|0)}for(let q=p-d;l--;)o[p++]=o[q++]}for(i=0;i<p;i+=16384)r+=String.fromCharCode.apply(null,o.subarray(i,i+16384<p?i+16384:p));return r})()`;
}

// Fast 2-gram pre-filter + Batch Top-K non-overlapping greedy phrase replacement
function collectWindowFrequencies(work, winLen, skipPua = false) {
  const n = work.length;
  const freq = new Map();
  if (n < winLen * 2) return freq;

  // L1-cache Uint16 2/3-gram hash pre-count skips ~92% of unique substrings without allocating slices!
  const gramCounts = new Uint16Array(65536);
  const limit = n - winLen;
  if (winLen >= 4) {
    for (let i = 0; i <= limit; i++) {
      const h = ((work.charCodeAt(i) & 0x3f) << 10) | ((work.charCodeAt(i + 1) & 0x1f) << 5) | (work.charCodeAt(i + 2) & 0x1f);
      if (gramCounts[h] < 65535) gramCounts[h]++;
    }
    for (let i = 0; i <= limit; i++) {
      const c0 = work.charCodeAt(i);
      if (skipPua && c0 >= 0xe000 && c0 <= 0xe00f) continue;
      const h = ((c0 & 0x3f) << 10) | ((work.charCodeAt(i + 1) & 0x1f) << 5) | (work.charCodeAt(i + 2) & 0x1f);
      if (gramCounts[h] < 2) continue;
      const cLast = work.charCodeAt(i + winLen - 1);
      if ((c0 >= 0xdc00 && c0 <= 0xdfff) || (cLast >= 0xd800 && cLast <= 0xdbff)) continue;
      const sub = work.slice(i, i + winLen);
      if (sub.includes('\x7f') || (skipPua && /[\uE000-\uE00F]/.test(sub))) continue;
      freq.set(sub, (freq.get(sub) || 0) + 1);
    }
  } else {
    for (let i = 0; i <= limit; i++) {
      const h = ((work.charCodeAt(i) & 0xff) << 8) | (work.charCodeAt(i + 1) & 0xff);
      if (gramCounts[h] < 65535) gramCounts[h]++;
    }
    for (let i = 0; i <= limit; i++) {
      const c0 = work.charCodeAt(i);
      if (skipPua && c0 >= 0xe000 && c0 <= 0xe00f) continue;
      const h = ((c0 & 0xff) << 8) | (work.charCodeAt(i + 1) & 0xff);
      if (gramCounts[h] < 2) continue;
      const cLast = work.charCodeAt(i + winLen - 1);
      if ((c0 >= 0xdc00 && c0 <= 0xdfff) || (cLast >= 0xd800 && cLast <= 0xdbff)) continue;
      const sub = work.slice(i, i + winLen);
      if (sub.includes('\x7f') || (skipPua && /[\uE000-\uE00F]/.test(sub))) continue;
      freq.set(sub, (freq.get(sub) || 0) + 1);
    }
  }
  return freq;
}

function applyBatchPhraseReplacements(work, freq, freeTokens, dict, tokChars, contiguous, minGain, batchLimit = 160, fixedLen = 0) {
  if (dict.length >= freeTokens.length) return { work, added: 0 };
  const dictExtra = contiguous ? 3 : 5;
  const candidates = [];
  for (const [phrase, approx] of freq.entries()) {
    if (approx < 2) continue;
    let estBytes = 0;
    for (let k = 0; k < phrase.length; k++) {
      const cc = phrase.charCodeAt(k);
      estBytes += cc < 0x80 ? 1 : cc < 0x800 ? 2 : 3;
    }
    if (estBytes <= 2) continue;
    const estGain = approx * (estBytes - 2) - (estBytes + dictExtra);
    if (estGain > minGain) {
      candidates.push({ phrase, estBytes, estGain });
    }
  }
  if (candidates.length === 0) return { work, added: 0 };
  candidates.sort((a, b) => b.estGain - a.estGain);

  const limit = Math.min(candidates.length, batchLimit * 2 + 48);
  const tentative = [];

  for (let idx = 0; idx < limit && tentative.length < batchLimit && dict.length + tentative.length < freeTokens.length; idx++) {
    const cand = candidates[idx];
    const phrase = cand.phrase;
    if (phrase.length < 2) continue;
    let overlaps = false;
    for (let c = 0; c < tentative.length; c++) {
      const prev = tentative[c].phrase;
      if (phrase.includes(prev) || prev.includes(phrase)) {
        overlaps = true;
        break;
      }
    }
    if (overlaps) continue;

    const tok = freeTokens[dict.length + tentative.length];
    const tokBytes = tok.charCodeAt(0) < 0x0800 ? 2 : 3;
    if (cand.estBytes <= tokBytes) continue;
    const approx = freq.get(phrase) || 0;
    const predGain = approx * (cand.estBytes - tokBytes) - (cand.estBytes + dictExtra);
    if (predGain <= minGain) continue;

    tentative.push({ phrase, tok, tokBytes });
  }

  if (tentative.length === 0) return { work, added: 0 };

  // O(N) zero-backtracking 2-byte Bloom/Mask scanner (~20x faster than alternation RegExp or N x split/join)
  const headMask = new Uint8Array(65536);
  const hitMap = new Map();
  let curWork = '';

  if (fixedLen >= 2) {
    const tokMap = new Map();
    for (const item of tentative) {
      headMask[((item.phrase.charCodeAt(0) & 0xff) << 8) | (item.phrase.charCodeAt(1) & 0xff)] = 1;
      tokMap.set(item.phrase, item);
      hitMap.set(item.phrase, 0);
    }
    const n = work.length;
    const endLimit = n - fixedLen;
    const outSegs = [];
    let lastPos = 0;
    let i = 0;
    while (i <= endLimit) {
      const h = ((work.charCodeAt(i) & 0xff) << 8) | (work.charCodeAt(i + 1) & 0xff);
      if (headMask[h]) {
        const sub = work.slice(i, i + fixedLen);
        const item = tokMap.get(sub);
        if (item) {
          if (i > lastPos) outSegs.push(work.slice(lastPos, i));
          outSegs.push(item.tok);
          hitMap.set(sub, (hitMap.get(sub) || 0) + 1);
          i += fixedLen;
          lastPos = i;
          continue;
        }
      }
      i++;
    }
    if (lastPos === 0) return { work, added: 0 };
    if (lastPos < n) outSegs.push(work.slice(lastPos));
    curWork = outSegs.join('');
  } else {
    const buckets = new Map();
    for (const item of tentative) {
      const p = item.phrase;
      headMask[((p.charCodeAt(0) & 0xff) << 8) | (p.charCodeAt(1) & 0xff)] = 1;
      const key32 = p.charCodeAt(0) * 65536 + p.charCodeAt(1);
      if (!buckets.has(key32)) buckets.set(key32, []);
      buckets.get(key32).push(item);
      hitMap.set(p, 0);
    }
    for (const list of buckets.values()) {
      list.sort((a, b) => b.phrase.length - a.phrase.length);
    }
    const n = work.length;
    const outSegs = [];
    let lastPos = 0;
    let i = 0;
    while (i < n - 1) {
      const c0 = work.charCodeAt(i);
      const c1 = work.charCodeAt(i + 1);
      if (headMask[((c0 & 0xff) << 8) | (c1 & 0xff)]) {
        const bList = buckets.get(c0 * 65536 + c1);
        if (bList) {
          let matched = null;
          for (let k = 0; k < bList.length; k++) {
            const candItem = bList[k];
            if (work.startsWith(candItem.phrase, i)) {
              matched = candItem;
              break;
            }
          }
          if (matched) {
            if (i > lastPos) outSegs.push(work.slice(lastPos, i));
            outSegs.push(matched.tok);
            hitMap.set(matched.phrase, (hitMap.get(matched.phrase) || 0) + 1);
            i += matched.phrase.length;
            lastPos = i;
            continue;
          }
        }
      }
      i++;
    }
    if (lastPos === 0) return { work, added: 0 };
    if (lastPos < n) outSegs.push(work.slice(lastPos));
    curWork = outSegs.join('');
  }

  const accepted = [];
  const fixupMap = new Map();
  for (const item of tentative) {
    const realHits = hitMap.get(item.phrase) || 0;
    const pBytes = Buffer.byteLength(JSON.stringify(item.phrase), 'utf8') - 2;
    const realGain = realHits * (pBytes - item.tokBytes) - (pBytes + dictExtra);
    if (realHits >= 2 && realGain > 0) {
      const targetTok = freeTokens[dict.length + accepted.length];
      if (item.tok !== targetTok) {
        fixupMap.set(item.tok, targetTok);
        item.tok = targetTok;
      }
      accepted.push(item);
    } else if (realHits > 0) {
      fixupMap.set(item.tok, item.phrase);
    }
  }

  if (fixupMap.size > 0) {
    const charList = [...fixupMap.keys()]
      .map((c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
      .join('');
    curWork = curWork.replace(new RegExp(`[${charList}]`, 'g'), (c) => fixupMap.get(c));
  }

  if (accepted.length === 0) return { work, added: 0 };

  for (const item of accepted) {
    dict.push(item.phrase);
    tokChars.push(item.tok);
  }

  return { work: curWork, added: accepted.length };
}

function packCssJsExpr(css) {
  const lzPacked = packLzssJsExpr(css, PROTECTED_CSS_LITERALS);
  if (lzPacked && Buffer.byteLength(lzPacked, 'utf8') + 12 < Buffer.byteLength(serializeJsValue(css), 'utf8')) {
    return lzPacked;
  }
  const TOKEN_BASE = 0x00a1;
  const MAX_DICT = 4800; // 0x00A1..0x1360 (1,887 2-byte + 2,913 3-byte UTF-8 chars, all < 0x2028)
  for (let i = 0; i < css.length; i++) {
    const cc = css.charCodeAt(i);
    if (cc >= TOKEN_BASE && cc < TOKEN_BASE + MAX_DICT) {
      return serializeJsValue(css);
    }
  }

  let work = css;
  for (let p = 0; p < PROTECTED_CSS_LITERALS.length; p++) {
    if (work.includes(String.fromCharCode(0xe000 + p))) return serializeJsValue(css);
    work = work.split(PROTECTED_CSS_LITERALS[p]).join(String.fromCharCode(0xe000 + p));
  }

  const freeTokens = [];
  for (let k = 0; k < MAX_DICT; k++) freeTokens.push(String.fromCharCode(TOKEN_BASE + k));
  const dict = [];
  const tokChars = [];

  const clauseRe = /[^{};,\u00A1-\u13FF\uE000-\uE00F]{5,64}[{};,]?/g;
  for (let round = 0; round < 6 && dict.length < 1200; round++) {
    const freq = new Map();
    const matches = work.match(clauseRe);
    if (!matches) break;
    for (let m = 0; m < matches.length; m++) {
      const s = matches[m];
      freq.set(s, (freq.get(s) || 0) + 1);
      const brk = s.indexOf(']');
      if (brk >= 4) {
        const sub = s.slice(0, brk + 1);
        freq.set(sub, (freq.get(sub) || 0) + 1);
      }
      const col = s.indexOf(':');
      if (col >= 4) {
        const sub = s.slice(0, col + 1);
        freq.set(sub, (freq.get(sub) || 0) + 1);
      }
    }
    const res = applyBatchPhraseReplacements(work, freq, freeTokens, dict, tokChars, true, 5, 220, 0);
    work = res.work;
    if (res.added < 6) break;
  }

  for (const winLen of [36, 24, 16, 11, 8, 6, 4, 3, 2]) {
    const maxPasses = winLen <= 4 ? 2 : 1;
    for (let pass = 0; pass < maxPasses && dict.length < MAX_DICT; pass++) {
      const freq = collectWindowFrequencies(work, winLen, true);
      const res = applyBatchPhraseReplacements(work, freq, freeTokens, dict, tokChars, true, 4, 360, winLen);
      work = res.work;
      if (res.added < 6) break;
    }
  }

  for (let p = 0; p < PROTECTED_CSS_LITERALS.length; p++) {
    work = work.split(String.fromCharCode(0xe000 + p)).join(PROTECTED_CSS_LITERALS[p]);
  }
  if (dict.length === 0) return serializeJsValue(css);

  // Fast multi-layer RegExp round-trip verification (identical to browser runtime decoder)
  const maxCodeHex = (TOKEN_BASE + dict.length - 1).toString(16).padStart(4, '0');
  const decRe = new RegExp(`[\\u00A1-\\u${maxCodeHex}]`, 'g');
  let verify = work;
  for (let f = 1, guard = 0; f && guard < 32; guard++) {
    f = 0;
    verify = verify.replace(decRe, (c) => {
      f = 1;
      return dict[c.charCodeAt(0) - TOKEN_BASE];
    });
  }
  if (verify !== css) return serializeJsValue(css);

  return `(()=>{let s=${serializeJsValue(work)},d=${serializeStringListExpr(dict)};for(let f=1;f;)f=0,s=s.replace(/[\\u00A1-\\u${maxCodeHex}]/g,(c)=>(f=1,d[c.charCodeAt(0)-${TOKEN_BASE}]));return s})()`;
}

const GLSL_RESERVED_IDS = new Set(
  (
    'attribute const uniform varying buffer shared coherent volatile restrict readonly writeonly layout centroid flat smooth noperspective patch sample ' +
    'break continue do for while switch case default if else subroutine in out inout invariant discard return struct precision highp mediump lowp true false void main ' +
    'float double int uint bool vec2 vec3 vec4 dvec2 dvec3 dvec4 bvec2 bvec3 bvec4 ivec2 ivec3 ivec4 uvec2 uvec3 uvec4 ' +
    'mat2 mat3 mat4 mat2x2 mat2x3 mat2x4 mat3x2 mat3x3 mat3x4 mat4x2 mat4x3 mat4x4 ' +
    'dmat2 dmat3 dmat4 dmat2x2 dmat2x3 dmat2x4 dmat3x2 dmat3x3 dmat3x4 dmat4x2 dmat4x3 dmat4x4 ' +
    'sampler1D sampler2D sampler3D samplerCube sampler2DRect sampler1DShadow sampler2DShadow samplerCubeShadow sampler2DRectShadow ' +
    'sampler1DArray sampler2DArray sampler1DArrayShadow sampler2DArrayShadow samplerBuffer sampler2DMS sampler2DMSArray ' +
    'isampler1D isampler2D isampler3D isamplerCube isampler2DRect isampler1DArray isampler2DArray isamplerBuffer isampler2DMS isampler2DMSArray ' +
    'usampler1D usampler2D usampler3D usamplerCube usampler2DRect usampler1DArray usampler2DArray usamplerBuffer usampler2DMS usampler2DMSArray ' +
    'samplerCubeArray samplerCubeArrayShadow isamplerCubeArray usamplerCubeArray ' +
    'radians degrees sin cos tan asin acos atan sinh cosh tanh asinh acosh atanh pow exp log exp2 log2 sqrt inversesqrt ' +
    'abs sign floor trunc round roundEven ceil fract mod modf min max clamp mix step smoothstep isnan isinf ' +
    'floatBitsToInt floatBitsToUint intBitsToFloat uintBitsToFloat packSnorm2x16 unpackSnorm2x16 packUnorm2x16 unpackUnorm2x16 packHalf2x16 unpackHalf2x16 ' +
    'length distance dot cross normalize faceforward reflect refract matrixCompMult outerProduct transpose determinant inverse ' +
    'lessThan lessThanEqual greaterThan greaterThanEqual equal notEqual any all not ' +
    'textureSize texture textureProj textureLod textureOffset texelFetch texelFetchOffset textureProjOffset textureLodOffset textureProjLod textureProjLodOffset ' +
    'textureGrad textureGradOffset textureProjGrad textureProjGradOffset dFdx dFdy fwidth'
  ).split(' ')
);
const GLSL_INTERFACE_QUALS = new Set(['uniform', 'in', 'out', 'varying', 'attribute', 'layout', 'buffer', 'shared']);
const GLSL_SHORT_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const GLSL_SHORT_REST = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

function minifyGlsl(glsl) {
  let noComments = '';
  for (let i = 0; i < glsl.length; ) {
    if (glsl[i] === '/' && glsl[i + 1] === '/') {
      i += 2;
      while (i < glsl.length && glsl[i] !== '\n') i++;
      continue;
    }
    if (glsl[i] === '/' && glsl[i + 1] === '*') {
      i += 2;
      while (i < glsl.length && !(glsl[i] === '*' && glsl[i + 1] === '/')) i++;
      i += 2;
      noComments += ' ';
      continue;
    }
    noComments += glsl[i++];
  }
  const lines = noComments
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const res = [];
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    if (line.startsWith('#')) {
      if (res.length > 0 && !res[res.length - 1].endsWith('\n')) res.push('\n');
      res.push(line + '\n');
    } else {
      res.push(
        line
          .replace(/\s+/g, ' ')
          .replace(/\s*([{}();,=*/<>?:])\s*/g, '$1')
          .replace(/\s*([+\-])\s*(?!\1)/g, '$1')
          .replace(/([+\-])\s+(?![+\-])/g, '$1')
          .replace(/(?<![\w.])(\d+\.\d*?[1-9])0+(?![\w.])/g, '$1')
          .replace(/(?<![\w.])(\d+)\.0+(?![\w.])/g, '$1.')
          .replace(/(?<![\w.])0(\.\d+)/g, '$1')
      );
    }
  }
  const compact = res.join('').trim();

  // Pass 1: Lex into preproc / num / id / ch tokens
  const tokens = [];
  const protectedIds = new Set();
  const allIds = new Set();
  const len = compact.length;
  for (let i = 0; i < len; ) {
    const ch = compact[i];
    if (ch === '#' && (i === 0 || compact[i - 1] === '\n')) {
      let j = i + 1;
      while (j < len && compact[j] !== '\n') j++;
      if (j < len && compact[j] === '\n') j++;
      const pre = compact.slice(i, j);
      tokens.push({ t: 'pre', v: pre });
      for (const m of pre.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) {
        protectedIds.add(m[0]);
        allIds.add(m[0]);
      }
      i = j;
      continue;
    }
    const c = compact.charCodeAt(i);
    if ((c >= 48 && c <= 57) || (ch === '.' && i + 1 < len && compact.charCodeAt(i + 1) >= 48 && compact.charCodeAt(i + 1) <= 57)) {
      const m = /^(?:0[xX][0-9a-fA-F]+|\d+\.\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?|\d+(?:[eE][+-]?\d+)?)[uUfF]?/.exec(
        compact.slice(i)
      );
      if (m) {
        tokens.push({ t: 'num', v: m[0] });
        i += m[0].length;
        continue;
      }
    }
    if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95) {
      let j = i + 1;
      while (j < len) {
        const cj = compact.charCodeAt(j);
        if ((cj >= 65 && cj <= 90) || (cj >= 97 && cj <= 122) || (cj >= 48 && cj <= 57) || cj === 95) j++;
        else break;
      }
      const id = compact.slice(i, j);
      tokens.push({ t: 'id', v: id });
      allIds.add(id);
      i = j;
      continue;
    }
    tokens.push({ t: 'ch', v: ch });
    i++;
  }

  // Pass 2: Collect protected identifiers (interface qualifiers, struct blocks/fields, dot members, reserved/gl_)
  let braceDepth = 0;
  let parenDepth = 0;
  let stmtIds = [];
  let stmtHasInterface = false;
  let structPending = false;
  let protectedBlockDepth = -1;
  let prevSig = null;

  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    if (tk.t === 'pre') continue;
    if (tk.t === 'ch' && (tk.v === ' ' || tk.v === '\n')) continue;

    if (tk.t === 'id') {
      const v = tk.v;
      if (prevSig && prevSig.t === 'ch' && prevSig.v === '.') {
        protectedIds.add(v);
      }
      if (GLSL_RESERVED_IDS.has(v) || v.startsWith('gl_') || v.startsWith('__')) {
        protectedIds.add(v);
      }
      if (protectedBlockDepth >= 0 || structPending) {
        protectedIds.add(v);
      }
      if (v === 'struct') {
        structPending = true;
      }
      if (braceDepth === 0) {
        if (parenDepth === 0 && GLSL_INTERFACE_QUALS.has(v)) {
          stmtHasInterface = true;
        }
        stmtIds.push(v);
      }
    } else if (tk.t === 'ch') {
      if (tk.v === '{') {
        if (stmtHasInterface || structPending) {
          for (const sid of stmtIds) protectedIds.add(sid);
          if (protectedBlockDepth < 0) protectedBlockDepth = braceDepth;
        }
        braceDepth++;
        if (braceDepth === 1) {
          stmtIds = [];
          stmtHasInterface = false;
        }
      } else if (tk.v === '}') {
        braceDepth = Math.max(0, braceDepth - 1);
        if (braceDepth === 0 && parenDepth === 0 && protectedBlockDepth < 0) {
          stmtIds = [];
          stmtHasInterface = false;
        }
      } else if (tk.v === '(') {
        parenDepth++;
      } else if (tk.v === ')') {
        parenDepth = Math.max(0, parenDepth - 1);
      } else if (tk.v === ';') {
        if (braceDepth === 0 && parenDepth === 0) {
          if (stmtHasInterface) {
            for (const sid of stmtIds) protectedIds.add(sid);
          }
          stmtIds = [];
          stmtHasInterface = false;
        }
        if (protectedBlockDepth >= 0 && braceDepth === protectedBlockDepth) {
          protectedBlockDepth = -1;
          structPending = false;
        } else if (structPending && protectedBlockDepth < 0) {
          structPending = false;
        }
      }
    }
    prevSig = tk;
  }

  // Pass 3: Count local renameable identifiers and assign shortest collision-free names by savings
  const counts = new Map();
  prevSig = null;
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    if (tk.t === 'pre') continue;
    if (tk.t === 'ch' && (tk.v === ' ' || tk.v === '\n')) continue;
    if (tk.t === 'id' && !(prevSig && prevSig.t === 'ch' && prevSig.v === '.') && !protectedIds.has(tk.v) && tk.v.length >= 2) {
      counts.set(tk.v, (counts.get(tk.v) || 0) + 1);
    }
    prevSig = tk;
  }

  const candidates = Array.from(counts.entries()).sort((a, b) => {
    const saveDiff = (b[0].length - 1) * b[1] - (a[0].length - 1) * a[1];
    return saveDiff !== 0 ? saveDiff : a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
  });

  const usedNames = new Set([...protectedIds, ...allIds]);
  const renameMap = new Map();
  let seqIdx = 0;
  const nextShortName = () => {
    const cLen = GLSL_SHORT_CHARS.length;
    const rLen = GLSL_SHORT_REST.length;
    while (true) {
      let cand = '';
      if (seqIdx < cLen) {
        cand = GLSL_SHORT_CHARS[seqIdx];
      } else {
        let rem = seqIdx - cLen;
        const first = GLSL_SHORT_CHARS[Math.floor(rem / rLen) % cLen];
        const second = GLSL_SHORT_REST[rem % rLen];
        cand = rem < cLen * rLen ? first + second : first + second + String(Math.floor(rem / (cLen * rLen)));
      }
      seqIdx++;
      if (!usedNames.has(cand) && !GLSL_RESERVED_IDS.has(cand) && !cand.startsWith('gl_') && !cand.startsWith('__')) {
        usedNames.add(cand);
        return cand;
      }
    }
  };

  for (const [orig] of candidates) {
    const cand = nextShortName();
    if (cand.length < orig.length) {
      renameMap.set(orig, cand);
    }
  }

  if (renameMap.size === 0) return compact;

  // Pass 4: Emit renamed GLSL
  const out = [];
  prevSig = null;
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    if (tk.t === 'pre') {
      out.push(tk.v);
      continue;
    }
    if (tk.t === 'ch' && (tk.v === ' ' || tk.v === '\n')) {
      out.push(tk.v);
      continue;
    }
    if (tk.t === 'id' && !(prevSig && prevSig.t === 'ch' && prevSig.v === '.') && renameMap.has(tk.v)) {
      out.push(renameMap.get(tk.v));
    } else {
      out.push(tk.v);
    }
    prevSig = tk;
  }
  return out.join('');
}

function tokenizeJs(src) {
  const n = src.length;
  const tokens = [];
  let lastWord = '';
  let lastOp = '';
  let closedCondParen = false;
  const parenStack = [];
  const tplBraceStack = [];

  const canStartRegex = () => {
    if (tokens.length === 0) return true;
    if (closedCondParen) return true;
    if (lastWord) return REGEX_KW.has(lastWord);
    if (
      lastOp === 'id' ||
      lastOp === 'num' ||
      lastOp === '++' ||
      lastOp === '--' ||
      lastOp === ')' ||
      lastOp === ']' ||
      lastOp === '.' ||
      lastOp === '?.' ||
      lastOp === 'regex' ||
      lastOp === "'" ||
      lastOp === '"' ||
      lastOp === '`'
    ) {
      return false;
    }
    return true;
  };

  const scanTemplate = (startIdx, isRootTpl) => {
    let j = startIdx;
    while (j < n) {
      const c = src[j];
      if (c === '\\') {
        j += 2;
        continue;
      }
      if (c === '`') {
        let body = src.slice(startIdx, j);
        if (isRootTpl && /^\s*#version\s+300\s+es\b/.test(body)) {
          body = minifyGlsl(body);
        }
        tokens.push({ type: 'lit', val: body + '`' });
        lastWord = '';
        lastOp = '`';
        closedCondParen = false;
        return j + 1;
      }
      if (c === '$' && src[j + 1] === '{') {
        tokens.push({ type: 'lit', val: src.slice(startIdx, j + 2) });
        tplBraceStack.push(1);
        lastWord = '';
        lastOp = '${';
        closedCondParen = false;
        return j + 2;
      }
      j++;
    }
    tokens.push({ type: 'lit', val: src.slice(startIdx) });
    return n;
  };

  let i = 0;
  while (i < n) {
    const ch = src[i];
    if (ch === ' ' || ch === '\t' || ch === '\r') {
      tokens.push({ type: 'ws', val: ' ' });
      i++;
      continue;
    }
    if (ch === '\n') {
      tokens.push({ type: 'nl', val: '\n' });
      i++;
      continue;
    }
    if (ch === '/' && src[i + 1] === '/') {
      i += 2;
      while (i < n && src[i] !== '\n') i++;
      tokens.push({ type: 'nl', val: '\n' });
      continue;
    }
    if (ch === '/' && src[i + 1] === '*') {
      i += 2;
      let hasNL = false;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') hasNL = true;
        i++;
      }
      i += 2;
      tokens.push({ type: hasNL ? 'nl' : 'ws', val: hasNL ? '\n' : ' ' });
      continue;
    }
    if (ch === "'" || ch === '"') {
      let j = i + 1;
      while (j < n) {
        if (src[j] === '\\') {
          j += 2;
          continue;
        }
        if (src[j] === ch) {
          j++;
          break;
        }
        j++;
      }
      tokens.push({ type: 'lit', val: src.slice(i, j) });
      lastWord = '';
      lastOp = ch;
      closedCondParen = false;
      i = j;
      continue;
    }
    if (ch === '`') {
      tokens.push({ type: 'lit', val: '`' });
      i = scanTemplate(i + 1, true);
      continue;
    }
    if (ch === '/' && canStartRegex()) {
      let j = i + 1;
      let classDepth = 0;
      let validRegex = false;
      while (j < n) {
        const rc = src[j];
        if (rc === '\n' || rc === '\r') break;
        if (rc === '\\') {
          if (j + 1 >= n || src[j + 1] === '\n' || src[j + 1] === '\r') break;
          j += 2;
          continue;
        }
        if (rc === '[') classDepth++;
        else if (rc === ']') {
          if (classDepth > 0) classDepth--;
        } else if (rc === '/' && classDepth === 0) {
          j++;
          validRegex = true;
          break;
        }
        j++;
      }
      if (validRegex) {
        while (j < n && /[a-z]/i.test(src[j])) j++;
        tokens.push({ type: 'lit', val: src.slice(i, j) });
        lastWord = '';
        lastOp = 'regex';
        closedCondParen = false;
        i = j;
        continue;
      }
    }
    // ES2022 Private class identifiers (#field)
    if (ch === '#' && i + 1 < n && isIdChar(src[i + 1])) {
      let j = i + 1;
      while (j < n && isIdChar(src[j])) j++;
      tokens.push({ type: 'punc', val: src.slice(i, j) });
      lastWord = '';
      lastOp = 'id';
      closedCondParen = false;
      i = j;
      continue;
    }
    if (isIdChar(ch)) {
      let j = i + 1;
      while (j < n && isIdChar(src[j])) j++;
      const word = src.slice(i, j);
      const isNum = ch >= '0' && ch <= '9';
      const afterMemberDot = lastOp === '.' || lastOp === '?.';
      tokens.push({ type: isNum ? 'lit' : 'id', val: word });
      if (isNum) {
        lastWord = '';
        lastOp = 'num';
      } else if (afterMemberDot) {
        // Property access (e.g. `state.in / w / 2`) must NEVER set lastWord to a REGEX_KW!
        lastWord = '';
        lastOp = 'id';
      } else {
        lastWord = word;
        lastOp = 'id';
      }
      closedCondParen = false;
      i = j;
      continue;
    }
    if (ch === '(') {
      parenStack.push(COND_KW.has(lastWord));
      tokens.push({ type: 'punc', val: '(' });
      lastWord = '';
      lastOp = '(';
      closedCondParen = false;
      i++;
      continue;
    }
    if (ch === ')') {
      const isCond = parenStack.pop() || false;
      tokens.push({ type: 'punc', val: ')' });
      lastWord = '';
      lastOp = ')';
      closedCondParen = isCond;
      i++;
      continue;
    }
    if (ch === '{') {
      if (tplBraceStack.length > 0) tplBraceStack[tplBraceStack.length - 1]++;
      tokens.push({ type: 'punc', val: '{' });
      lastWord = '';
      lastOp = '{';
      closedCondParen = false;
      i++;
      continue;
    }
    if (ch === '}') {
      if (tplBraceStack.length > 0) {
        tplBraceStack[tplBraceStack.length - 1]--;
        if (tplBraceStack[tplBraceStack.length - 1] === 0) {
          tplBraceStack.pop();
          tokens.push({ type: 'punc', val: '}' });
          i = scanTemplate(i + 1, false);
          continue;
        }
      }
      tokens.push({ type: 'punc', val: '}' });
      lastWord = '';
      lastOp = '}';
      closedCondParen = false;
      i++;
      continue;
    }
    if ((ch === '+' && src[i + 1] === '+') || (ch === '-' && src[i + 1] === '-')) {
      const op = src.slice(i, i + 2);
      tokens.push({ type: 'punc', val: op });
      lastWord = '';
      lastOp = op;
      closedCondParen = false;
      i += 2;
      continue;
    }
    if (ch === '?' && src[i + 1] === '.') {
      tokens.push({ type: 'punc', val: '?.' });
      lastWord = '';
      lastOp = '?.';
      closedCondParen = false;
      i += 2;
      continue;
    }
    if (ch === '=' && src[i + 1] === '>') {
      tokens.push({ type: 'punc', val: '=>' });
      lastWord = '';
      lastOp = '=>';
      closedCondParen = false;
      i += 2;
      continue;
    }
    if (
      (ch === '=' && src[i + 1] === '=' && src[i + 2] === '=') ||
      (ch === '!' && src[i + 1] === '=' && src[i + 2] === '=') ||
      (ch === '.' && src[i + 1] === '.' && src[i + 2] === '.')
    ) {
      const op3 = src.slice(i, i + 3);
      tokens.push({ type: 'punc', val: op3 });
      lastWord = '';
      lastOp = op3;
      closedCondParen = false;
      i += 3;
      continue;
    }
    if (
      (ch === '=' && src[i + 1] === '=') ||
      (ch === '!' && src[i + 1] === '=') ||
      (ch === '&' && src[i + 1] === '&') ||
      (ch === '|' && src[i + 1] === '|') ||
      (ch === '?' && src[i + 1] === '?')
    ) {
      const op2 = src.slice(i, i + 2);
      tokens.push({ type: 'punc', val: op2 });
      lastWord = '';
      lastOp = op2;
      closedCondParen = false;
      i += 2;
      continue;
    }
    tokens.push({ type: 'punc', val: ch });
    lastWord = '';
    lastOp = ch;
    closedCondParen = false;
    i++;
  }
  return tokens;
}

const JS_KEYWORDS = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default',
  'delete', 'do', 'else', 'enum', 'export', 'extends', 'false', 'finally', 'for',
  'function', 'if', 'implements', 'import', 'in', 'instanceof', 'interface', 'let',
  'new', 'null', 'of', 'package', 'private', 'protected', 'public', 'return',
  'static', 'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'var',
  'void', 'while', 'with', 'yield', 'async', 'await',
]);
const BLOCK_PREV_TOKENS = new Set([')', 'else', 'try', 'catch', 'finally', 'do', '=>', '{', '}', ';']);
const SAFE_BOOL_PREV = new Set(['=', '(', '[', ',', ':', '?', 'return', '===', '!==', '==', '!=', '&&', '||', '??', ';', '{']);
const PROTECTED_BUNDLE_LITERALS = [
  'interaction-takeover-card',
  'side-question-panel',
  'ag-prism-css',
  'ag-claude-style-css',
  'ag-cs-home-panel',
  'ag-prism-thought-raw-toggle',
  'ag-prism-thought-overlay',
];

function createShortNameGen(existingIds, unsafe, startIdx = 0) {
  const headChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$';
  const tailChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_$';
  let genIdx = startIdx;
  return () => {
    while (true) {
      let n = genIdx++;
      let s = headChars[n % headChars.length];
      n = Math.floor(n / headChars.length) - 1;
      while (n >= 0) {
        s += tailChars[n % tailChars.length];
        n = Math.floor(n / tailChars.length) - 1;
      }
      if (!existingIds.has(s) && !unsafe.has(s) && !JS_KEYWORDS.has(s)) {
        existingIds.add(s);
        return s;
      }
    }
  };
}

function mangleSafeLocals(tokens) {
  const sig = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type !== 'ws' && tokens[i].type !== 'nl') sig.push(tokens[i]);
  }
  const declared = new Set();
  const unsafe = new Set(RESERVED_OR_GLOBAL);
  const nonVarTokens = new Set();
  const shorthandTokens = new Set();
  const shorthandCounts = new Map();
  const counts = new Map();
  const minRefScope = new Map();
  const minDeclScope = new Map();
  const bStack = [];
  const ternaryAtDepth = [];
  const declDepths = new Set();
  let blockDepth = 0;
  let pendingBraceKind = '';

  const hasOuterDeclContext = () => {
    for (let d = 0; d <= bStack.length; d++) {
      if (declDepths.has(d)) return true;
    }
    return false;
  };

  const recordDecl = (name, depth) => {
    if (name.length < 2) return;
    declared.add(name);
    const prev = minDeclScope.get(name);
    if (prev === undefined || depth < prev) minDeclScope.set(name, depth);
  };

  const recordRef = (name, depth) => {
    const prev = minRefScope.get(name);
    if (prev === undefined || depth < prev) minRefScope.set(name, depth);
  };

  let lastColonWasCaseOrLabel = false;
  for (let i = 0; i < sig.length; i++) {
    const t = sig[i];
    const prev = i > 0 ? sig[i - 1] : null;
    const prev2 = i > 1 ? sig[i - 2] : null;
    const next = i + 1 < sig.length ? sig[i + 1] : null;

    if (t.type === 'lit' && t.val.endsWith('${')) {
      bStack.push('{_tpl');
      ternaryAtDepth[bStack.length] = 0;
      lastColonWasCaseOrLabel = false;
      continue;
    }

    if (t.type === 'punc') {
      const sd = bStack.length;
      if (t.val === '?') {
        ternaryAtDepth[sd] = (ternaryAtDepth[sd] || 0) + 1;
        lastColonWasCaseOrLabel = false;
        continue;
      }
      if (t.val === ':') {
        if ((ternaryAtDepth[sd] || 0) > 0) {
          ternaryAtDepth[sd]--;
          lastColonWasCaseOrLabel = false;
        } else {
          lastColonWasCaseOrLabel = (sd === 0 || bStack[sd - 1] === '{_blk');
        }
        continue;
      }
      const prevColonBlock = lastColonWasCaseOrLabel;
      lastColonWasCaseOrLabel = false;

      if (t.val === '(') {
        bStack.push('(');
        ternaryAtDepth[bStack.length] = 0;
      } else if (t.val === '[') {
        bStack.push('[');
        ternaryAtDepth[bStack.length] = 0;
      } else if (t.val === '{') {
        if (pendingBraceKind) {
          bStack.push(pendingBraceKind);
          if (pendingBraceKind === '{_cls') blockDepth++;
          pendingBraceKind = '';
        } else {
          const isBlock = !prev || BLOCK_PREV_TOKENS.has(prev.val) || prevColonBlock;
          bStack.push(isBlock ? '{_blk' : '{_obj');
          if (isBlock) blockDepth++;
        }
        ternaryAtDepth[bStack.length] = 0;
      } else if (t.val === ')' || t.val === ']' || t.val === '}') {
        declDepths.delete(bStack.length);
        ternaryAtDepth[bStack.length] = 0;
        const popped = bStack.pop();
        if ((popped === '{_blk' || popped === '{_cls') && blockDepth > 0) blockDepth--;
        if (t.val === '}') pendingBraceKind = '';
      } else if (t.val === ';') {
        declDepths.delete(bStack.length);
        ternaryAtDepth[sd] = 0;
        pendingBraceKind = '';
      } else if (t.val === '=' && !declDepths.has(bStack.length)) {
        pendingBraceKind = '';
      }
      continue;
    }
    lastColonWasCaseOrLabel = false;

    if (t.type !== 'id') continue;
    const name = t.val;
    if (name === 'class') {
      pendingBraceKind = '{_cls';
      declDepths.delete(bStack.length);
      continue;
    }
    if (name === 'import' || name === 'export') {
      if (next && next.val === '{') pendingBraceKind = '{_esm';
      declDepths.delete(bStack.length);
      continue;
    }
    if (name === 'const' || name === 'let' || name === 'var') {
      declDepths.add(bStack.length);
      pendingBraceKind = '';
      continue;
    }
    if (JS_KEYWORDS.has(name)) {
      if (name !== 'in' && name !== 'of' && name !== 'typeof' && name !== 'void' && name !== 'new' && name !== 'await' && name !== 'extends') {
        declDepths.delete(bStack.length);
        pendingBraceKind = '';
      }
      continue;
    }
    if (name.startsWith('__ag') || name === 'AntigravityCodexEffortSlider') {
      unsafe.add(name);
      continue;
    }

    const topBracket = bStack.length > 0 ? bStack[bStack.length - 1] : '{_blk';

    // Member property access (`obj.prop`, `obj?.prop`) is never an IdentifierReference
    if (prev && (prev.val === '.' || prev.val === '?.')) {
      nonVarTokens.add(t);
      continue;
    }
    if (topBracket === '{_cls' || topBracket === '{_esm') {
      unsafe.add(name);
      counts.set(name, (counts.get(name) || 0) + 1);
      continue;
    }
    // Non-shorthand object literal / destructuring property key (`{ prop: val }`) is never an IdentifierReference
    if (topBracket === '{_obj' && prev && (prev.val === '{' || prev.val === ',') && next && next.val === ':') {
      nonVarTokens.add(t);
      continue;
    }
    if (prev && prev.val === '...') {
      counts.set(name, (counts.get(name) || 0) + 1);
      if (hasOuterDeclContext() && next && (next.val === '}' || next.val === ']')) {
        recordDecl(name, blockDepth);
      } else {
        recordRef(name, blockDepth);
      }
      continue;
    }
    if (next && next.val === ':' && topBracket === '{_blk' && (!prev || prev.val === '{' || prev.val === ';' || prev.val === '}' || prev.val === ')')) {
      unsafe.add(name);
      counts.set(name, (counts.get(name) || 0) + 1);
      continue;
    }
    // Object shorthand property `{ foo }` or destructuring binding `{ foo, bar = 1 }`:
    // safely expandable to `{ foo: a }` / `{ foo: a, bar: b = 1 }`!
    if (
      topBracket === '{_obj' &&
      prev &&
      (prev.val === '{' || prev.val === ',') &&
      next &&
      (next.val === ',' || next.val === '}' || next.val === '=')
    ) {
      shorthandTokens.add(t);
      shorthandCounts.set(name, (shorthandCounts.get(name) || 0) + 1);
      counts.set(name, (counts.get(name) || 0) + 1);
      if (hasOuterDeclContext()) {
        recordDecl(name, blockDepth);
      } else {
        recordRef(name, blockDepth);
      }
      continue;
    }
    if (
      topBracket === '{_obj' &&
      prev &&
      (prev.val === '{' || prev.val === ',' || prev.val === ';') &&
      next &&
      (next.val === ',' || next.val === '}' || next.val === '=' || next.val === ';')
    ) {
      unsafe.add(name);
      counts.set(name, (counts.get(name) || 0) + 1);
      continue;
    }
    if (
      topBracket === '{_obj' &&
      next &&
      next.val === '(' &&
      (!prev || prev.val !== 'function') &&
      prev &&
      (prev.val === '}' || prev.val === '{' || prev.val === ';' || prev.val === ',')
    ) {
      nonVarTokens.add(t);
      continue;
    }
    if (next && next.val === '(' && prev && (prev.val === 'get' || prev.val === 'set' || prev.val === 'async' || prev.val === 'static')) {
      if (!prev2 || prev2.val !== 'function') {
        unsafe.add(name);
        counts.set(name, (counts.get(name) || 0) + 1);
        continue;
      }
    }

    counts.set(name, (counts.get(name) || 0) + 1);
    recordRef(name, blockDepth);

    if (
      declDepths.has(bStack.length) &&
      prev &&
      (prev.val === 'const' || prev.val === 'let' || prev.val === 'var' || prev.val === ',') &&
      next &&
      (next.val === '=' || next.val === ';' || next.val === ',' || next.val === 'of' || next.val === 'in' || next.val === ')')
    ) {
      recordDecl(name, blockDepth);
    }
    if (prev && prev.val === 'function' && next && next.val === '(') {
      recordDecl(name, blockDepth);
    }
    if (next && next.val === '=>' && (!prev || (prev.val !== '.' && prev.val !== '?.'))) {
      recordDecl(name, blockDepth + 1);
    }
    if (prev && prev.val === '(' && prev2 && prev2.val === 'catch' && next && next.val === ')') {
      recordDecl(name, blockDepth + 1);
    }
  }

  // Second pass: function / arrow parameter lists + catch bindings + expression-body arrows
  const paramDeclTokens = new Set();
  const paramOpenIndices = new Set();
  const paramCloseIndices = new Set();
  const exprArrowIndices = new Set();

  let scanBlockDepth = 0;
  const scanStack = [];
  const scanTernary = [];
  let scanColonBlk = false;
  let scanPendKind = '';
  for (let i = 0; i < sig.length; i++) {
    const tk0 = sig[i];
    const p0 = i > 0 ? sig[i - 1] : null;
    if (tk0.type === 'lit' && tk0.val.endsWith('${')) {
      scanStack.push('{_tpl');
      scanTernary[scanStack.length] = 0;
      scanColonBlk = false;
      continue;
    }
    if (tk0.type === 'id' && tk0.val === 'class') {
      scanPendKind = '{_cls';
      scanColonBlk = false;
    } else if (tk0.type === 'punc') {
      const sd = scanStack.length;
      if (tk0.val === '?') {
        scanTernary[sd] = (scanTernary[sd] || 0) + 1;
        scanColonBlk = false;
      } else if (tk0.val === ':') {
        if ((scanTernary[sd] || 0) > 0) {
          scanTernary[sd]--;
          scanColonBlk = false;
        } else {
          scanColonBlk = sd === 0 || scanStack[sd - 1] === '{_blk';
        }
      } else if (tk0.val === '(' || tk0.val === '[') {
        scanStack.push(tk0.val);
        scanTernary[scanStack.length] = 0;
        scanColonBlk = false;
      } else if (tk0.val === '{') {
        if (scanPendKind) {
          scanStack.push(scanPendKind);
          if (scanPendKind === '{_cls') scanBlockDepth++;
          scanPendKind = '';
        } else {
          const isBlk = !p0 || BLOCK_PREV_TOKENS.has(p0.val) || scanColonBlk;
          scanStack.push(isBlk ? '{_blk' : '{_obj');
          if (isBlk) scanBlockDepth++;
        }
        scanTernary[scanStack.length] = 0;
        scanColonBlk = false;
      } else if (tk0.val === ')' || tk0.val === ']' || tk0.val === '}') {
        scanTernary[scanStack.length] = 0;
        const pop = scanStack.pop();
        if ((pop === '{_blk' || pop === '{_cls') && scanBlockDepth > 0) scanBlockDepth--;
        if (tk0.val === '}') scanPendKind = '';
        scanColonBlk = false;
      } else if (tk0.val === ';') {
        scanTernary[sd] = 0;
        scanPendKind = '';
        scanColonBlk = false;
      } else {
        scanColonBlk = false;
      }
    } else {
      scanColonBlk = false;
    }

    // Single-identifier arrow `x => ...`
    if (tk0.type === 'id' && i + 1 < sig.length && sig[i + 1].val === '=>' && (!p0 || (p0.val !== '.' && p0.val !== '?.'))) {
      paramDeclTokens.add(tk0);
      if (i + 2 < sig.length && sig[i + 2].val !== '{') {
        exprArrowIndices.add(i + 1);
      }
    }
    // `catch (err) { ... }`
    if (tk0.val === '(' && p0 && p0.val === 'catch' && i + 2 < sig.length && sig[i + 1].type === 'id' && sig[i + 2].val === ')') {
      paramDeclTokens.add(sig[i + 1]);
      continue;
    }

    if (tk0.val !== '(') continue;
    const prev = p0;
    const prev2 = i > 1 ? sig[i - 2] : null;
    const isFnParams =
      (prev && prev.val === 'function') ||
      (prev && prev.type === 'id' && prev2 && prev2.val === 'function');
    let depth = 1;
    let braceDepth = 0;
    let bracketDepth = 0;
    let j = i + 1;
    const paramCandidates = [];
    const destructuredShorthands = [];
    while (j < sig.length && depth > 0) {
      const tk = sig[j];
      if (tk.type === 'lit' && tk.val.endsWith('${')) braceDepth++;
      else if (tk.val === '(') depth++;
      else if (tk.val === ')') depth--;
      else if (tk.val === '{') braceDepth++;
      else if (tk.val === '}' && braceDepth > 0) braceDepth--;
      else if (tk.val === '[') bracketDepth++;
      else if (tk.val === ']' && bracketDepth > 0) bracketDepth--;
      else if (depth === 1 && braceDepth === 0 && bracketDepth === 0 && tk.type === 'id') {
        const pPrev = sig[j - 1];
        const pNext = sig[j + 1];
        if (
          pPrev &&
          (pPrev.val === '(' || pPrev.val === ',' || pPrev.val === '...') &&
          pNext &&
          (pNext.val === ',' || pNext.val === ')' || pNext.val === '=')
        ) {
          if (tk.val.length >= 2) paramCandidates.push(tk);
        }
      } else if (depth === 1 && braceDepth === 0 && bracketDepth > 0 && tk.type === 'id') {
        // Array destructuring parameter `([a, b = 1]) => ...`
        const pPrev = sig[j - 1];
        const pNext = sig[j + 1];
        if (
          pPrev &&
          (pPrev.val === '[' || pPrev.val === ',' || pPrev.val === '...') &&
          pNext &&
          (pNext.val === ',' || pNext.val === ']' || pNext.val === '=')
        ) {
          if (tk.val.length >= 2) paramCandidates.push(tk);
        }
      } else if (depth === 1 && braceDepth > 0 && tk.type === 'id') {
        if (shorthandTokens.has(tk)) {
          if (tk.val.length >= 2) destructuredShorthands.push(tk);
        } else if (sig[j - 1] && sig[j - 1].val === '...' && sig[j + 1] && sig[j + 1].val === '}') {
          if (tk.val.length >= 2) paramCandidates.push(tk);
        }
      }
      j++;
    }
    const closeIdx = j - 1;
    const afterClose = j < sig.length ? sig[j] : null;
    if (isFnParams || (afterClose && afterClose.val === '=>')) {
      const bodyScopeDepth = scanBlockDepth + 1;
      paramOpenIndices.add(i);
      if (closeIdx > i) paramCloseIndices.add(closeIdx);
      if (afterClose && afterClose.val === '=>' && j + 1 < sig.length && sig[j + 1].val !== '{') {
        exprArrowIndices.add(j);
      }
      for (const pTk of paramCandidates) {
        paramDeclTokens.add(pTk);
        recordDecl(pTk.val, bodyScopeDepth);
      }
      for (const st of destructuredShorthands) {
        paramDeclTokens.add(st);
        recordDecl(st.val, bodyScopeDepth);
      }
    }
  }

  // Compute exact minRefScope treating parameter lists & expression-body arrows at their true inner body depth (+1)
  minRefScope.clear();
  {
    let rDepth = 0;
    let paramActive = 0;
    const rStack = [];
    const rTernary = [];
    let rColonBlk = false;
    const arrowExprStackLens = [];
    let pendKind = '';
    for (let i = 0; i < sig.length; i++) {
      const t = sig[i];
      const prev = i > 0 ? sig[i - 1] : null;
      if (t.type === 'lit' && t.val.endsWith('${')) {
        rStack.push('{_tpl');
        rTernary[rStack.length] = 0;
        rColonBlk = false;
        continue;
      }

      if (t.type === 'punc') {
        const sd = rStack.length;
        if (t.val === '?') {
          rTernary[sd] = (rTernary[sd] || 0) + 1;
          rColonBlk = false;
          continue;
        }
        if (t.val === ':') {
          if ((rTernary[sd] || 0) > 0) {
            rTernary[sd]--;
            rColonBlk = false;
          } else {
            rColonBlk = sd === 0 || rStack[sd - 1] === '{_blk';
          }
          continue;
        }
        const wasColonBlk = rColonBlk;
        rColonBlk = false;
        if (t.val === '=>' && exprArrowIndices.has(i)) {
          arrowExprStackLens.push(rStack.length);
          continue;
        }
        if (
          arrowExprStackLens.length > 0 &&
          (t.val === ';' || (t.val === ',' && rStack.length === arrowExprStackLens[arrowExprStackLens.length - 1]))
        ) {
          while (arrowExprStackLens.length > 0 && arrowExprStackLens[arrowExprStackLens.length - 1] >= rStack.length) {
            arrowExprStackLens.pop();
          }
        }
        if (t.val === '(') {
          rStack.push('(');
          rTernary[rStack.length] = 0;
          if (paramOpenIndices.has(i)) paramActive++;
        } else if (t.val === '[') {
          rStack.push('[');
          rTernary[rStack.length] = 0;
        } else if (t.val === '{') {
          if (pendKind) {
            rStack.push(pendKind);
            if (pendKind === '{_cls') rDepth++;
            pendKind = '';
          } else {
            const isBlk = !prev || BLOCK_PREV_TOKENS.has(prev.val) || wasColonBlk;
            rStack.push(isBlk ? '{_blk' : '{_obj');
            if (isBlk) rDepth++;
          }
          rTernary[rStack.length] = 0;
        } else if (t.val === ')' || t.val === ']' || t.val === '}') {
          if (t.val === ')' && paramCloseIndices.has(i) && paramActive > 0) paramActive--;
          rTernary[rStack.length] = 0;
          const pop = rStack.pop();
          if ((pop === '{_blk' || pop === '{_cls') && rDepth > 0) rDepth--;
          if (t.val === '}') pendKind = '';
          while (arrowExprStackLens.length > 0 && arrowExprStackLens[arrowExprStackLens.length - 1] > rStack.length) {
            arrowExprStackLens.pop();
          }
        } else if (t.val === ';') {
          rTernary[sd] = 0;
          pendKind = '';
        }
        continue;
      }
      rColonBlk = false;
      if (t.type !== 'id') continue;
      if (t.val === 'class') {
        pendKind = '{_cls';
        continue;
      }
      if (JS_KEYWORDS.has(t.val) || nonVarTokens.has(t) || paramDeclTokens.has(t) || unsafe.has(t.val)) continue;
      recordRef(t.val, rDepth + paramActive + arrowExprStackLens.length);
    }
  }

  // Outer-scope free-variable protection: if referenced at shallower depth than any local declaration,
  // it refers to an undeclared global/free identifier and MUST NOT be mangled!
  for (const name of declared) {
    const rDepth = minRefScope.get(name);
    const dDepth = minDeclScope.get(name);
    if (rDepth !== undefined && dDepth !== undefined && rDepth < dDepth) {
      unsafe.add(name);
    }
  }

  const existingIds = new Set(counts.keys());
  const nextShortName = createShortNameGen(existingIds, unsafe, 0);
  const nextTwoCharName = createShortNameGen(existingIds, unsafe, 53);

  const candidates = [];
  for (const name of declared) {
    if (unsafe.has(name)) continue;
    const c = counts.get(name) || 0;
    const sh = shorthandCounts.get(name) || 0;
    const estSave = (c - sh) * (name.length - 2) - sh * 3;
    if (estSave >= 3) candidates.push({ name, c, sh, estSave });
  }
  candidates.sort((a, b) => (b.c - b.sh) - (a.c - a.sh) || b.estSave - a.estSave);

  const renameMap = new Map();
  for (const cand of candidates) {
    const useSingle = cand.c - cand.sh >= 14;
    const short = useSingle ? nextShortName() : nextTwoCharName();
    const realSave = (cand.c - cand.sh) * (cand.name.length - short.length) - cand.sh * (1 + short.length);
    if (realSave >= 2) {
      renameMap.set(cand.name, short);
    }
  }

  const expandedTokens = [];
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    if (tk.type === 'id' && !nonVarTokens.has(tk) && renameMap.has(tk.val)) {
      const short = renameMap.get(tk.val);
      if (shorthandTokens.has(tk)) {
        expandedTokens.push({ type: 'id', val: tk.val });
        expandedTokens.push({ type: 'punc', val: ':' });
        expandedTokens.push({ type: 'id', val: short });
      } else {
        tk.val = short;
        expandedTokens.push(tk);
      }
    } else {
      expandedTokens.push(tk);
    }
  }
  tokens = expandedTokens;

  let prevS = null;
  const nextS = new Array(tokens.length).fill(null);
  let nxt = null;
  for (let i = tokens.length - 1; i >= 0; i--) {
    nextS[i] = nxt;
    if (tokens[i].type !== 'ws' && tokens[i].type !== 'nl') nxt = tokens[i];
  }
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    if (tk.type === 'ws' || tk.type === 'nl') continue;
    if (tk.type === 'id' && tk.val === 'const') {
      if (!prevS || prevS.val !== 'export') {
        tk.val = 'let';
      }
    } else if (tk.type === 'id' && (tk.val === 'true' || tk.val === 'false' || (tk.val === 'undefined' && !declared.has('undefined')))) {
      const ns = nextS[i];
      const afterDot = prevS && (prevS.val === '.' || prevS.val === '?.');
      const beforeKey = ns && (ns.val === ':' || ns.val === '(' || ns.val === '.' || ns.val === '=');
      if (!afterDot && !beforeKey && prevS && SAFE_BOOL_PREV.has(prevS.val)) {
        tk.type = 'punc';
        tk.val = tk.val === 'true' ? '!0' : tk.val === 'false' ? '!1' : 'void 0';
      }
    }
    prevS = tk;
  }

  const ARROW_UNPAREN_PREV = new Set(['=', ',', '(', '[', '{', ':', ';', '?', '&&', '||', '??', 'return', '=>', 'async']);
  const DEC_ZERO_STRIP_PREV = new Set([
    '=', '(', '[', ',', ':', '?', '+', '-', '*', '/', '%', '<', '>', '<=', '>=', '==', '===', '!=', '!==', '&&', '||', '??',
  ]);

  // Safe token-level compaction:
  // 1) Strip trailing commas before `}` / `]` (preserving array elisions `[a,,]`)
  // 2) Strip redundant semicolons immediately before `}` (preserving empty loop/if bodies `while(c);}`)
  // 3) Merge adjacent block-level `; const/let/var b = ...` into `, b = ...`
  // 4) Unparen single-identifier arrow parameters `(x)=>` -> `x=>` & strip leading zero on decimals `0.5` -> `.5`
  {
    const nextSigTok = new Array(tokens.length).fill(null);
    const nextSigIdx = new Array(tokens.length).fill(-1);
    let nxtT = null;
    let nxtI = -1;
    for (let i = tokens.length - 1; i >= 0; i--) {
      nextSigTok[i] = nxtT;
      nextSigIdx[i] = nxtI;
      if (tokens[i].type !== 'ws' && tokens[i].type !== 'nl') {
        nxtT = tokens[i];
        nxtI = i;
      }
    }

    const cStack = [];
    const cTernary = [];
    let cColonBlk = false;
    const activeDeclByDepth = new Map();
    let pendCls = '';
    let prevSigTok = null;
    let hadNL = false;
    const dropIdx = new Set();

    for (let i = 0; i < tokens.length; i++) {
      if (dropIdx.has(i)) continue;
      const tk = tokens[i];
      if (tk.type === 'ws') continue;
      if (tk.type === 'nl') {
        hadNL = true;
        continue;
      }

      // Cross-token leading-zero decimal strip: `'0' + '.' + digits` -> `'.' + digits`
      if (
        tk.type === 'lit' &&
        tk.val === '0' &&
        prevSigTok &&
        DEC_ZERO_STRIP_PREV.has(prevSigTok.val) &&
        i + 2 < tokens.length &&
        tokens[i + 1].type === 'punc' &&
        tokens[i + 1].val === '.' &&
        tokens[i + 2].type === 'lit' &&
        /^[0-9]+(?:[eE])?$/.test(tokens[i + 2].val)
      ) {
        dropIdx.add(i);
        continue;
      }

      if (
        tk.type === 'punc' &&
        tk.val === '(' &&
        (!prevSigTok || ARROW_UNPAREN_PREV.has(prevSigTok.val))
      ) {
        const idTok = nextSigTok[i];
        const idIdx = nextSigIdx[i];
        if (idTok && idTok.type === 'id' && !JS_KEYWORDS.has(idTok.val)) {
          const closeTok = nextSigTok[idIdx];
          const closeIdx = nextSigIdx[idIdx];
          if (closeTok && closeTok.val === ')') {
            const arrowTok = nextSigTok[closeIdx];
            if (arrowTok && arrowTok.val === '=>') {
              dropIdx.add(i);
              dropIdx.add(closeIdx);
              continue;
            }
          }
        }
      }

      const curDepth = cStack.length;
      const curTop = curDepth > 0 ? cStack[curDepth - 1] : '{_blk';

      // If an ASI-capable newline occurred at current declaration depth, reset active `let`/`var` merge state
      if (hadNL && prevSigTok && activeDeclByDepth.get(curDepth)) {
        const prevVal = prevSigTok.val;
        const pCh = prevVal[prevVal.length - 1];
        const nCh = tk.val[0];
        const safeNL =
          SAFE_PREV_NO_ASI.has(pCh) ||
          SAFE_NEXT_NO_ASI.has(nCh) ||
          prevVal === '=>' ||
          prevVal === '&&' ||
          prevVal === '||' ||
          prevVal === '??' ||
          ((pCh === '+' || pCh === '-') && prevVal !== '++' && prevVal !== '--');
        if (!safeNL) activeDeclByDepth.set(curDepth, '');
      }
      hadNL = false;

      if (tk.type === 'lit' && tk.val.endsWith('${')) {
        cStack.push('{_tpl');
        cTernary[cStack.length] = 0;
        cColonBlk = false;
        prevSigTok = tk;
        continue;
      }

      if (tk.type === 'id' && tk.val === 'class') pendCls = '{_cls';

      if (tk.type === 'punc') {
        if (tk.val === '?') {
          cTernary[curDepth] = (cTernary[curDepth] || 0) + 1;
          cColonBlk = false;
          prevSigTok = tk;
          continue;
        }
        if (tk.val === ':') {
          if ((cTernary[curDepth] || 0) > 0) {
            cTernary[curDepth]--;
            cColonBlk = false;
          } else {
            cColonBlk = curTop === '{_blk';
          }
          prevSigTok = tk;
          continue;
        }
        const wasColonBlk = cColonBlk;
        cColonBlk = false;

        if (tk.val === '(' || tk.val === '[') {
          cStack.push(tk.val);
          cTernary[cStack.length] = 0;
          prevSigTok = tk;
          continue;
        }
        if (tk.val === '{') {
          if (pendCls) {
            cStack.push(pendCls);
            pendCls = '';
          } else {
            const isBlk = !prevSigTok || BLOCK_PREV_TOKENS.has(prevSigTok.val) || wasColonBlk;
            cStack.push(isBlk ? '{_blk' : '{_obj');
          }
          cTernary[cStack.length] = 0;
          activeDeclByDepth.set(cStack.length, '');
          prevSigTok = tk;
          continue;
        }
        if (tk.val === ')' || tk.val === ']' || tk.val === '}') {
          cTernary[cStack.length] = 0;
          activeDeclByDepth.delete(cStack.length);
          const popped = cStack.pop();
          if (tk.val === '}' && popped === '{_cls') activeDeclByDepth.set(cStack.length, '');
          pendCls = '';
          prevSigTok = tk;
          continue;
        }

        const ns = nextSigTok[i];
        const nsIdx = nextSigIdx[i];

        // Trailing comma before `}` or `]`
        if (
          tk.val === ',' &&
          ns &&
          (ns.val === '}' || (ns.val === ']' && prevSigTok && prevSigTok.val !== ',' && prevSigTok.val !== '['))
        ) {
          dropIdx.add(i);
          continue;
        }

        // Consecutive block-level `; const x`, `; let x`, or `; var x` -> `, x`
        if (tk.val === ';' && (curTop === '{_blk' || curDepth === 0)) {
          const activeKw = activeDeclByDepth.get(curDepth);
          if (activeKw && ns && ns.type === 'id' && ns.val === activeKw) {
            const afterKw = nextSigTok[nsIdx];
            if (
              afterKw &&
              ((afterKw.type === 'id' && !JS_KEYWORDS.has(afterKw.val)) ||
                afterKw.val === '{' ||
                afterKw.val === '[')
            ) {
              tk.val = ',';
              dropIdx.add(nsIdx);
              prevSigTok = tk;
              continue;
            }
          }
          activeDeclByDepth.set(curDepth, '');
        }

        // Redundant `;` immediately before `}` (excluding `while(c);}` where prevSigTok is `)` or `do` or `;` or `{` or `:`)
        if (
          tk.val === ';' &&
          ns &&
          ns.val === '}' &&
          prevSigTok &&
          prevSigTok.val !== ')' &&
          prevSigTok.val !== '{' &&
          prevSigTok.val !== ';' &&
          prevSigTok.val !== ':' &&
          prevSigTok.val !== 'do'
        ) {
          dropIdx.add(i);
          continue;
        }
      }

      if (
        tk.type === 'id' &&
        (tk.val === 'const' || tk.val === 'let' || tk.val === 'var') &&
        (curTop === '{_blk' || curDepth === 0) &&
        (!prevSigTok || prevSigTok.val === '{' || prevSigTok.val === ';' || prevSigTok.val === '}')
      ) {
        const afterKw = nextSigTok[i];
        if (
          afterKw &&
          ((afterKw.type === 'id' && !JS_KEYWORDS.has(afterKw.val)) ||
            afterKw.val === '{' ||
            afterKw.val === '[')
        ) {
          activeDeclByDepth.set(curDepth, tk.val);
        }
      }

      prevSigTok = tk;
    }

    if (dropIdx.size > 0) {
      const compacted = [];
      for (let i = 0; i < tokens.length; i++) {
        if (!dropIdx.has(i)) compacted.push(tokens[i]);
      }
      tokens = compacted;
    }
  }

  return tokens;
}

const SAFE_STMT_START_KW = new Set([
  'const', 'let', 'var', 'function', 'if', 'for', 'while', 'return',
  'try', 'catch', 'finally', 'else', 'switch', 'case', 'default',
  'delete', 'throw', 'break', 'continue',
]);

const CTRL_PAREN_KW = new Set(['if', 'while', 'for', 'with']);
const NO_DROP_SEMI_PREV = new Set(['else', 'do', ':', ';', '{', 'try', 'finally']);

function serializeTokens(tokens) {
  const out = [];
  let lastCh = '';
  let lastTokenVal = '';
  let pendingNL = false;
  const parenIsCtrl = [];
  let lastRParenWasCtrl = false;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'ws') continue;
    if (t.type === 'nl') {
      pendingNL = true;
      continue;
    }
    const val = t.val;
    if (!val) continue;
    // Safely omit redundant statement-ending ';' immediately before '}' (never drop EmptyStatement after control headers/labels)
    if (val === ';' && !NO_DROP_SEMI_PREV.has(lastTokenVal) && !(lastTokenVal === ')' && lastRParenWasCtrl)) {
      let nextVal = '';
      for (let j = i + 1; j < tokens.length; j++) {
        if (tokens[j].type === 'ws' || tokens[j].type === 'nl' || !tokens[j].val) continue;
        nextVal = tokens[j].val;
        break;
      }
      if (nextVal === '}') continue;
    }
    if (val === '(') {
      parenIsCtrl.push(CTRL_PAREN_KW.has(lastTokenVal));
    } else if (val === ')') {
      lastRParenWasCtrl = parenIsCtrl.length ? parenIsCtrl.pop() : false;
    } else {
      lastRParenWasCtrl = false;
    }
    const nextCh = val[0];
    if (lastCh) {
      if (pendingNL) {
        const safeDropNL =
          SAFE_PREV_NO_ASI.has(lastCh) ||
          SAFE_NEXT_NO_ASI.has(nextCh) ||
          lastTokenVal === '=>' ||
          lastTokenVal === '&&' ||
          lastTokenVal === '||' ||
          lastTokenVal === '??' ||
          (lastCh === '}' && SAFE_STMT_START_KW.has(val)) ||
          ((lastCh === '+' || lastCh === '-') && lastTokenVal !== '++' && lastTokenVal !== '--');
        if (!safeDropNL) {
          out.push('\n');
          lastCh = '\n';
        } else if (needsSpace(lastCh, nextCh)) {
          out.push(' ');
          lastCh = ' ';
        }
      } else if (needsSpace(lastCh, nextCh)) {
        out.push(' ');
        lastCh = ' ';
      }
    }
    pendingNL = false;
    out.push(val);
    lastCh = val[val.length - 1];
    lastTokenVal = val;
  }
  return out.join('').trim();
}

function decodeSimpleJsString(lit) {
  if (!lit || lit.length < 2) return null;
  const q = lit[0];
  if ((q !== "'" && q !== '"') || lit[lit.length - 1] !== q) return null;
  let out = '';
  for (let i = 1; i < lit.length - 1; i++) {
    const c = lit[i];
    if (c !== '\\') {
      out += c;
      continue;
    }
    i++;
    if (i >= lit.length - 1) return null;
    const e = lit[i];
    if (e === 'n') out += '\n';
    else if (e === 'r') out += '\r';
    else if (e === 't') out += '\t';
    else if (e === '\\' || e === "'" || e === '"') out += e;
    else if (e === '0' && !/[0-9]/.test(lit[i + 1] || '')) out += '\0';
    else if (e === 'x' && /^[0-9a-fA-F]{2}/.test(lit.slice(i + 1, i + 3))) {
      out += String.fromCharCode(parseInt(lit.slice(i + 1, i + 3), 16));
      i += 2;
    } else if (e === 'u' && lit[i + 1] === '{') {
      const closeBrace = lit.indexOf('}', i + 2);
      if (closeBrace < 0 || closeBrace >= lit.length - 1) return null;
      const hex = lit.slice(i + 2, closeBrace);
      if (!/^[0-9a-fA-F]{1,6}$/.test(hex)) return null;
      const cp = parseInt(hex, 16);
      if (cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return null;
      out += String.fromCodePoint(cp);
      i = closeBrace;
    } else if (e === 'u' && /^[0-9a-fA-F]{4}/.test(lit.slice(i + 1, i + 5))) {
      const code = parseInt(lit.slice(i + 1, i + 5), 16);
      if (code >= 0xd800 && code <= 0xdbff) {
        if (lit.slice(i + 5, i + 7) === '\\u' && /^[0-9a-fA-F]{4}/.test(lit.slice(i + 7, i + 11))) {
          const low = parseInt(lit.slice(i + 7, i + 11), 16);
          if (low >= 0xdc00 && low <= 0xdfff) {
            out += String.fromCharCode(code, low);
            i += 10;
            continue;
          }
        }
        return null;
      }
      if (code >= 0xdc00 && code <= 0xdfff) return null;
      out += String.fromCharCode(code);
      i += 4;
    } else {
      return null;
    }
  }
  return out;
}

function hasLoneUtf16Surrogate(strVal) {
  for (let k = 0; k < strVal.length; k++) {
    const cc = strVal.charCodeAt(k);
    if (cc >= 0xd800 && cc <= 0xdbff) {
      const nx2 = strVal.charCodeAt(k + 1);
      if (nx2 >= 0xdc00 && nx2 <= 0xdfff) {
        k++;
        continue;
      }
      return true;
    }
    if (cc >= 0xdc00 && cc <= 0xdfff) return true;
  }
  return false;
}

function decodeSimpleTemplateBody(body) {
  let out = '';
  const n = body.length;
  for (let i = 0; i < n; i++) {
    const c = body[i];
    if (c === '\r') {
      out += '\n';
      if (body[i + 1] === '\n') i++;
      continue;
    }
    if (c !== '\\') {
      out += c;
      continue;
    }
    i++;
    if (i >= n) return null;
    const e = body[i];
    if (e === 'n') out += '\n';
    else if (e === 'r') out += '\r';
    else if (e === 't') out += '\t';
    else if (e === '\\' || e === '`' || e === '$' || e === "'" || e === '"') out += e;
    else if (e === '\n') continue;
    else if (e === '\r') {
      if (body[i + 1] === '\n') i++;
      continue;
    } else if (e === '0' && !/[0-9]/.test(body[i + 1] || '')) out += '\0';
    else if (e === 'x' && /^[0-9a-fA-F]{2}/.test(body.slice(i + 1, i + 3))) {
      out += String.fromCharCode(parseInt(body.slice(i + 1, i + 3), 16));
      i += 2;
    } else if (e === 'u' && body[i + 1] === '{') {
      const closeBrace = body.indexOf('}', i + 2);
      if (closeBrace < 0) return null;
      const hex = body.slice(i + 2, closeBrace);
      if (!/^[0-9a-fA-F]{1,6}$/.test(hex)) return null;
      const cp = parseInt(hex, 16);
      if (cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return null;
      out += String.fromCodePoint(cp);
      i = closeBrace;
    } else if (e === 'u' && /^[0-9a-fA-F]{4}/.test(body.slice(i + 1, i + 5))) {
      const code = parseInt(body.slice(i + 1, i + 5), 16);
      if (code >= 0xd800 && code <= 0xdfff) return null;
      out += String.fromCharCode(code);
      i += 4;
    } else {
      return null;
    }
  }
  return out;
}

function packTextJsExpr(text, maxDict = 5200) {
  if (text.length >= 8192) {
    const lzPacked = packLzssJsExpr(text, ['ag-cs-home-panel', 'SIDEBAR_STUDIO_CLIENT_V2']);
    if (lzPacked && Buffer.byteLength(lzPacked, 'utf8') + 12 < Buffer.byteLength(serializeJsValue(text), 'utf8')) {
      return lzPacked;
    }
  }
  const usedInText = new Set();
  for (let i = 0; i < text.length; i++) {
    const cc = text.charCodeAt(i);
    if ((cc >= 0x00a1 && cc <= 0x17ff) || (cc >= 0xe010 && cc <= 0xf8ff)) usedInText.add(cc);
  }
  const freeTokens = [];
  let contiguous = false;
  let TOKEN_BASE = 0x0100;
  for (const candBase of [0x00a1, 0x00b8, 0x0100]) {
    const contLimit = Math.min(0x17ff, candBase + maxDict - 1);
    let ok = true;
    for (let cc = candBase; cc <= contLimit; cc++) {
      if (usedInText.has(cc)) {
        ok = false;
        break;
      }
    }
    if (ok) {
      TOKEN_BASE = candBase;
      contiguous = true;
      for (let cc = candBase; cc <= contLimit && freeTokens.length < maxDict; cc++) {
        freeTokens.push(String.fromCharCode(cc));
      }
      break;
    }
  }
  if (!contiguous) {
    // Fill 2-byte UTF-8 slots first (0x00A1..0x07FF), then BMP Private Use Area 3-byte slots (0xE010..0xF8FF)
    for (let cc = 0x00a1; cc <= 0x07ff && freeTokens.length < maxDict; cc++) {
      if (cc === 0x00ad) continue;
      if (!usedInText.has(cc)) freeTokens.push(String.fromCharCode(cc));
    }
    for (let cc = 0xe010; cc <= 0xf8ff && freeTokens.length < maxDict; cc++) {
      if (!usedInText.has(cc)) freeTokens.push(String.fromCharCode(cc));
    }
  }
  if (freeTokens.length < 16) return serializeJsValue(text);

  let work = text;
  const dict = [];
  const tokChars = [];

  const wordRe = /[A-Za-z0-9_.#\-:;()=,{}\[\]\/ <>"']{4,56}/g;
  for (let round = 0; round < 6 && dict.length < Math.min(1400, freeTokens.length); round++) {
    const freq = new Map();
    const matches = work.match(wordRe);
    if (!matches) break;
    for (let m = 0; m < matches.length; m++) {
      freq.set(matches[m], (freq.get(matches[m]) || 0) + 1);
    }
    const res = applyBatchPhraseReplacements(work, freq, freeTokens, dict, tokChars, contiguous, 5, 240, 0);
    work = res.work;
    if (res.added < 6) break;
  }

  for (const winLen of [36, 24, 16, 11, 8, 6, 4, 3, 2]) {
    const maxPasses = winLen <= 4 ? 2 : 1;
    for (let pass = 0; pass < maxPasses && dict.length < freeTokens.length; pass++) {
      const freq = collectWindowFrequencies(work, winLen, false);
      const res = applyBatchPhraseReplacements(work, freq, freeTokens, dict, tokChars, contiguous, 4, 360, winLen);
      work = res.work;
      if (res.added < 6) break;
    }
  }

  const rawExpr = serializeJsValue(text);
  if (dict.length === 0) return rawExpr;

  let packed = '';
  if (contiguous) {
    const maxHex = (TOKEN_BASE + dict.length - 1).toString(16).padStart(4, '0');
    const baseHex = TOKEN_BASE.toString(16).padStart(4, '0');
    const decRe = new RegExp(`[\\u${baseHex}-\\u${maxHex}]`, 'g');
    let verify = work;
    for (let f = 1, guard = 0; f && guard < 32; guard++) {
      f = 0;
      verify = verify.replace(decRe, (c) => {
        f = 1;
        return dict[c.charCodeAt(0) - TOKEN_BASE];
      });
    }
    if (verify !== text) return rawExpr;
    packed = `(()=>{let s=${serializeJsValue(work)},d=${serializeStringListExpr(dict)};for(let f=1;f;)f=0,s=s.replace(/[\\u${baseHex}-\\u${maxHex}]/g,(c)=>(f=1,d[c.charCodeAt(0)-${TOKEN_BASE}]));return s})()`;
  } else {
    const decMap = new Map();
    for (let i = 0; i < dict.length; i++) decMap.set(tokChars[i], dict[i]);
    const decRe = /[\u00A1-\u07FF\uE010-\uF8FF]/g;
    let verify = work;
    for (let f = 1, guard = 0; f && guard < 32; guard++) {
      f = 0;
      verify = verify.replace(decRe, (c) => {
        const v = decMap.get(c);
        if (v === undefined) return c;
        f = 1;
        return v;
      });
    }
    if (verify !== text) return rawExpr;
    const skipChars = [String.fromCharCode(0x00ad)];
    for (const cc of usedInText) {
      if ((cc >= 0x00a1 && cc <= 0x07ff && cc !== 0x00ad) || (cc >= 0xe010 && cc <= 0xf8ff)) {
        skipChars.push(String.fromCharCode(cc));
      }
    }
    const skipStr = skipChars.join('');
    const litKPacked = `(()=>{let s=${serializeJsValue(work)},k=${serializeJsValue(tokChars.join(''))},d=${serializeStringListExpr(dict)},m=new Map(Array.from(k,(c,i)=>[c,d[i]]));for(let f=1;f;)f=0,s=s.replace(/[\\u00A1-\\u07FF\\uE010-\\uF8FF]/g,(c)=>{let v=m.get(c);return v===void 0?c:(f=1,v)});return s})()`;
    const genKPacked = `(()=>{let s=${serializeJsValue(work)},u=new Set(${serializeJsValue(skipStr)}),d=${serializeStringListExpr(dict)},m=new Map(),j=0,F=String.fromCharCode;for(let c=161;c<2048&&j<d.length;c++){let k=F(c);if(!u.has(k))m.set(k,d[j++])}for(let c=57360;c<63744&&j<d.length;c++){let k=F(c);if(!u.has(k))m.set(k,d[j++])}for(let f=1;f;)f=0,s=s.replace(/[\\u00A1-\\u07FF\\uE010-\\uF8FF]/g,(c)=>{let v=m.get(c);return v===void 0?c:(f=1,v)});return s})()`;
    packed = Buffer.byteLength(genKPacked, 'utf8') < Buffer.byteLength(litKPacked, 'utf8') ? genKPacked : litKPacked;
  }
  return Buffer.byteLength(packed, 'utf8') + 12 < Buffer.byteLength(rawExpr, 'utf8') ? packed : rawExpr;
}

// Collect poolable string literals & high-frequency member property accesses from a mangled token stream
function scanModulePoolCandidates(tokens, allowMemberProps = false) {
  const prevSig = new Array(tokens.length).fill(null);
  const prev2Sig = new Array(tokens.length).fill(null);
  const nextSig = new Array(tokens.length).fill(null);
  let last = null;
  let last2 = null;
  for (let i = 0; i < tokens.length; i++) {
    prevSig[i] = last;
    prev2Sig[i] = last2;
    if (tokens[i].type !== 'ws' && tokens[i].type !== 'nl') {
      last2 = last;
      last = tokens[i];
    }
  }
  last = null;
  for (let i = tokens.length - 1; i >= 0; i--) {
    nextSig[i] = last;
    if (tokens[i].type !== 'ws' && tokens[i].type !== 'nl') last = tokens[i];
  }

  const SEP = '\x7f';
  const occurrences = new Map();

  const addOcc = (strVal, kind, startIdx, endIdx, origBytes) => {
    if (!occurrences.has(strVal)) occurrences.set(strVal, []);
    occurrences.get(strVal).push({ kind, startIdx, endIdx, origBytes });
  };

  // Pre-pair brackets so rvalue object literals `{ key: expr }` can be distinguished from destructuring patterns
  const closeIdxByOpen = new Int32Array(tokens.length).fill(-1);
  if (allowMemberProps) {
    const pairStack = [];
    for (let i = 0; i < tokens.length; i++) {
      const tk = tokens[i];
      if (tk.type === 'lit' && tk.val.endsWith('${')) {
        pairStack.push(i);
      } else if (tk.type === 'punc') {
        if (tk.val === '(' || tk.val === '[' || tk.val === '{') {
          pairStack.push(i);
        } else if ((tk.val === ')' || tk.val === ']' || tk.val === '}') && pairStack.length > 0) {
          closeIdxByOpen[pairStack.pop()] = i;
        }
      }
    }
  }

  const ctxStack = [];
  const ctxTernary = [];
  let pendingClsBrace = false;
  let prevColonBlock = false;
  const inDestructOrParams = () => {
    for (let k = ctxStack.length - 1; k >= 0; k--) {
      if (ctxStack[k] === '{_blk' || ctxStack[k] === '{_cls') return false;
      if (ctxStack[k] === '{_pat' || ctxStack[k] === '(_params' || ctxStack[k] === '[_pat') return true;
    }
    return false;
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'ws' || t.type === 'nl') continue;

    if (allowMemberProps) {
      if (t.type === 'lit' && t.val.endsWith('${')) {
        ctxStack.push('{_tpl');
        ctxTernary[ctxStack.length] = 0;
        prevColonBlock = false;
        continue;
      }
      if (t.type === 'punc') {
        const d = ctxStack.length;
        if (t.val === '?') {
          ctxTernary[d] = (ctxTernary[d] || 0) + 1;
          prevColonBlock = false;
          continue;
        }
        if (t.val === ':') {
          if ((ctxTernary[d] || 0) > 0) {
            ctxTernary[d]--;
            prevColonBlock = false;
          } else {
            prevColonBlock = d === 0 || ctxStack[d - 1] === '{_blk';
          }
          continue;
        }
        const wasColonBlk = prevColonBlock;
        prevColonBlock = false;
        if (t.val === '(') {
          const p = prevSig[i];
          const cIdx = closeIdxByOpen[i];
          const afterClose = cIdx >= 0 ? nextSig[cIdx] : null;
          const isParams =
            (p && (p.val === 'function' || p.val === '*' || p.val === 'catch')) ||
            Boolean(afterClose && afterClose.val === '=>');
          ctxStack.push(isParams ? '(_params' : '(');
          ctxTernary[ctxStack.length] = 0;
          continue;
        }
        if (t.val === '[') {
          const cIdx = closeIdxByOpen[i];
          const afterClose = cIdx >= 0 ? nextSig[cIdx] : null;
          const isPat =
            inDestructOrParams() ||
            Boolean(afterClose && (afterClose.val === '=' || afterClose.val === 'of' || afterClose.val === 'in'));
          ctxStack.push(isPat ? '[_pat' : '[');
          ctxTernary[ctxStack.length] = 0;
          continue;
        }
        if (t.val === '{') {
          const p = prevSig[i];
          if (pendingClsBrace) {
            ctxStack.push('{_cls');
            pendingClsBrace = false;
          } else {
            const isBlk = !p || BLOCK_PREV_TOKENS.has(p.val) || wasColonBlk;
            if (isBlk) {
              ctxStack.push('{_blk');
            } else {
              const cIdx = closeIdxByOpen[i];
              const afterClose = cIdx >= 0 ? nextSig[cIdx] : null;
              const isPat =
                inDestructOrParams() ||
                Boolean(p && (p.val === 'const' || p.val === 'let' || p.val === 'var')) ||
                Boolean(afterClose && (afterClose.val === '=' || afterClose.val === 'of' || afterClose.val === 'in'));
              ctxStack.push(isPat ? '{_pat' : '{_obj');
            }
          }
          ctxTernary[ctxStack.length] = 0;
          continue;
        }
        if (t.val === ')' || t.val === ']' || t.val === '}') {
          ctxTernary[ctxStack.length] = 0;
          ctxStack.pop();
          if (t.val === '}') pendingClsBrace = false;
          continue;
        }
        if (t.val === ';') {
          ctxTernary[d] = 0;
          pendingClsBrace = false;
        }
        continue;
      }
      prevColonBlock = false;
      if (t.type === 'id' && t.val === 'class') {
        const p = prevSig[i];
        if (!p || (p.val !== '.' && p.val !== '?.')) pendingClsBrace = true;
      }
    }

    const curCtxTop = ctxStack.length > 0 ? ctxStack[ctxStack.length - 1] : '';

    // Safe member property access pooling (`.getAttribute` / `.max` -> `[p]`, `?.getAttribute` -> `?.[p]`)
    // & rvalue object literal key pooling (`{ trajectoryMetadata: x }` -> `{ [p]: x }`)
    if (allowMemberProps && t.type === 'id' && t.val.length >= 3 && !t.val.startsWith('__ag')) {
      const p = prevSig[i];
      const p2 = prev2Sig[i];
      const nx = nextSig[i];
      const afterNumericDot = p2 && p2.type === 'lit' && /^[0-9]/.test(p2.val);
      if (
        !afterNumericDot &&
        p &&
        (p.val === '.' || (p.val === '?.' && t.val.length >= 4)) &&
        (!p2 || (p2.val !== 'super' && p2.val !== 'new' && p2.val !== 'import')) &&
        /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(t.val) &&
        !PROTECTED_BUNDLE_LITERALS.some((sub) => t.val.includes(sub))
      ) {
        let dotIdx = i - 1;
        while (dotIdx >= 0 && (tokens[dotIdx].type === 'ws' || tokens[dotIdx].type === 'nl')) dotIdx--;
        if (dotIdx >= 0 && tokens[dotIdx] === p) {
          if (p.val === '.') {
            addOcc(t.val, 'dotProp', dotIdx, i, 1 + t.val.length);
          } else {
            addOcc(t.val, 'optProp', i, i, t.val.length);
          }
        }
      } else if (
        curCtxTop === '{_obj' &&
        t.val.length >= 4 &&
        t.val !== '__proto__' &&
        p &&
        (p.val === '{' || p.val === ',') &&
        nx &&
        nx.val === ':' &&
        /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(t.val) &&
        !PROTECTED_BUNDLE_LITERALS.some((sub) => t.val.includes(sub))
      ) {
        addOcc(t.val, 'optProp', i, i, t.val.length);
      }
      continue;
    }

    if (t.type !== 'lit') continue;
    let strVal = null;
    let endIdx = i;
    if (t.val[0] === "'" || t.val[0] === '"') {
      strVal = decodeSimpleJsString(t.val);
    } else if (t.val === '`' && i + 1 < tokens.length && tokens[i + 1].type === 'lit' && tokens[i + 1].val.endsWith('`')) {
      const p = prevSig[i];
      const canBeTagged =
        p &&
        (p.type === 'id' ||
          p.val === ')' ||
          p.val === ']' ||
          p.val === '}' ||
          p.val.endsWith("'") ||
          p.val.endsWith('"') ||
          p.val.endsWith('`'));
      if (!canBeTagged || (p && JS_KEYWORDS.has(p.val) && p.val !== 'this' && p.val !== 'super')) {
        const body = tokens[i + 1].val.slice(0, -1);
        if (!body.includes('${')) {
          strVal = decodeSimpleTemplateBody(body);
          if (strVal !== null) endIdx = i + 1;
        }
      }
    }
    if (strVal === null || strVal === 'use strict' || strVal.includes(SEP)) continue;
    const valBytes = Buffer.byteLength(strVal, 'utf8');
    if (valBytes < 3) continue;
    if (hasLoneUtf16Surrogate(strVal)) continue;
    if (PROTECTED_BUNDLE_LITERALS.some((sub) => strVal.includes(sub))) continue;

    const p = prevSig[i];
    const nx = nextSig[endIdx];
    if (nx && nx.val === ':') {
      if (
        allowMemberProps &&
        endIdx === i &&
        curCtxTop === '{_obj' &&
        valBytes >= 5 &&
        strVal !== '__proto__' &&
        p &&
        (p.val === '{' || p.val === ',')
      ) {
        addOcc(strVal, 'optProp', i, i, Buffer.byteLength(t.val, 'utf8'));
      }
      if (!p || p.val !== 'case') continue;
    }
    if (nx && nx.val === '(') continue;
    // Exempt class string-named fields/getters: `class A { 'foo' = 1; static 'bar' = 2; get 'baz'(){} }`
    if (nx && (nx.val === '=' || nx.val === ';') && p && (p.val === '{' || p.val === ';' || p.val === '}' || p.val === 'static')) {
      continue;
    }
    if (p && (p.val === 'import' || p.val === 'from' || p.val === 'get' || p.val === 'set' || p.val === 'async')) continue;

    let origBytes = Buffer.byteLength(t.val, 'utf8');
    if (endIdx > i) origBytes += Buffer.byteLength(tokens[endIdx].val, 'utf8');
    addOcc(strVal, 'str', i, endIdx, origBytes);
    i = endIdx;
  }

  return occurrences;
}

const SAFE_ALIAS_GLOBALS = new Set([
  'Math',
  'Number',
  'Boolean',
  'String',
  'Array',
  'Object',
  'JSON',
  'Promise',
  'Map',
  'Set',
  'WeakMap',
  'RegExp',
  'Error',
  'Date',
  'Uint8Array',
  'Uint16Array',
  'Int32Array',
  'Float32Array',
  'globalThis',
  'parseFloat',
  'parseInt',
  'isFinite',
  'encodeURIComponent',
  'decodeURIComponent',
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'performance',
]);

function applyModulePoolReplacements(tokens, selectedEntries, headerBuilder) {
  if (selectedEntries.length === 0) return serializeTokens(tokens);

  const usedIds = new Set();
  let lastSigVal = '';
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    if (tk.type === 'ws' || tk.type === 'nl') continue;
    if (tk.type === 'id' && lastSigVal !== '.' && lastSigVal !== '?.') usedIds.add(tk.val);
    lastSigVal = tk.val;
  }
  const nextVar = createShortNameGen(usedIds, RESERVED_OR_GLOBAL);
  const activeItems = [];
  let stagedVar = nextVar();

  for (const entry of selectedEntries) {
    const varName = stagedVar;
    let origSum = 0;
    let replSum = 0;
    for (const occ of entry.list) {
      origSum += occ.origBytes;
      replSum += occ.kind === 'str' ? varName.length : varName.length + 2;
    }
    const idxBytes =
      entry.poolIdx !== undefined
        ? entry.poolIdx < 88
          ? 1
          : entry.poolIdx < 1975
          ? 2
          : entry.poolIdx < 7863
          ? 3
          : 4
        : 2;
    const bindingOverhead = varName.length + 1 + idxBytes;
    if (origSum > replSum + bindingOverhead) {
      activeItems.push({ ...entry, varName });
      stagedVar = nextVar();
    }
  }

  if (activeItems.length === 0) return serializeTokens(tokens);

  // Safe per-module constant aliases for high-frequency guaranteed JS globals (e.g. `Math`, `Number`, `Boolean`)
  const prevSig = new Array(tokens.length).fill(null);
  const nextSig = new Array(tokens.length).fill(null);
  let last = null;
  for (let i = 0; i < tokens.length; i++) {
    prevSig[i] = last;
    if (tokens[i].type !== 'ws' && tokens[i].type !== 'nl') last = tokens[i];
  }
  last = null;
  for (let i = tokens.length - 1; i >= 0; i--) {
    nextSig[i] = last;
    if (tokens[i].type !== 'ws' && tokens[i].type !== 'nl') last = tokens[i];
  }

  const globalPositions = new Map();
  const poisonedGlobals = new Set();
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    if (tk.type !== 'id' || !SAFE_ALIAS_GLOBALS.has(tk.val)) continue;
    const p = prevSig[i];
    const nx = nextSig[i];
    if (p && (p.val === '.' || p.val === '?.' || p.val === 'function' || p.val === 'class')) continue;
    if (nx && nx.val === ':') continue;
    if (p && p.val === 'typeof') continue;
    if (
      nx &&
      (nx.val === '.' || nx.val === '?.' || nx.val === '(') &&
      !(p && (p.val === 'let' || p.val === 'const' || p.val === 'var' || p.val === 'static' || p.val === 'get' || p.val === 'set' || p.val === 'async' || p.val === '*'))
    ) {
      if (!globalPositions.has(tk.val)) globalPositions.set(tk.val, []);
      globalPositions.get(tk.val).push(i);
      continue;
    }
    if (
      (p &&
        (p.val === 'let' ||
          p.val === 'const' ||
          p.val === 'var' ||
          p.val === '++' ||
          p.val === '--' ||
          p.val === '...' ||
          p.val === '[' ||
          p.val === '(')) ||
      (nx && (nx.val === '=' || nx.val === '=>' || nx.val === '++' || nx.val === '--' || nx.val === ',' || nx.val === '}'))
    ) {
      if (p && (p.val === '{' || p.val === ',' || p.val === '[' || p.val === '(')) {
        // Check if `p.val === '('` is a normal call `fn(Math)` vs parameter `(Math) =>` / `function f(Math)` / `catch (Error)`
        if (p.val === '(' && nx && nx.val === ')' && i >= 2) {
          let prevBeforeParen = null;
          for (let k = i - 1; k >= 0; k--) {
            if (tokens[k].type === 'ws' || tokens[k].type === 'nl') continue;
            if (tokens[k] === p) {
              for (let m = k - 1; m >= 0; m--) {
                if (tokens[m].type !== 'ws' && tokens[m].type !== 'nl') {
                  prevBeforeParen = tokens[m];
                  break;
                }
              }
              break;
            }
          }
          const isParamList =
            (prevBeforeParen && (prevBeforeParen.val === 'function' || prevBeforeParen.val === 'catch' || prevBeforeParen.val === 'async')) ||
            Boolean(nextSig[i + 1] && nextSig[i + 1].val === '=>');
          if (!isParamList) {
            if (!globalPositions.has(tk.val)) globalPositions.set(tk.val, []);
            globalPositions.get(tk.val).push(i);
            continue;
          }
        }
        poisonedGlobals.add(tk.val);
        continue;
      }
      if (!nx || (nx.val !== ',' && nx.val !== '}')) {
        poisonedGlobals.add(tk.val);
        continue;
      }
    }
    if (!globalPositions.has(tk.val)) globalPositions.set(tk.val, []);
    globalPositions.get(tk.val).push(i);
  }

  const globalAliasDecls = [];
  const globalReplaceAt = new Map();
  for (const [gName, idxs] of globalPositions.entries()) {
    if (poisonedGlobals.has(gName) || idxs.length < 2) continue;
    const alias = nextVar();
    const save = idxs.length * (gName.length - alias.length) - (alias.length + 1 + gName.length + 1);
    if (save >= 4) {
      globalAliasDecls.push(`${alias}=${gName}`);
      for (const pos of idxs) globalReplaceAt.set(pos, alias);
    }
  }

  const replaceAt = new Map();
  for (const item of activeItems) {
    for (const occ of item.list) {
      replaceAt.set(occ.startIdx, { endIdx: occ.endIdx, kind: occ.kind, ref: item.varName });
    }
  }

  const newTokens = [];
  for (let i = 0; i < tokens.length; i++) {
    const rep = replaceAt.get(i);
    if (rep) {
      if (rep.kind === 'str') {
        newTokens.push({ type: 'id', val: rep.ref });
      } else {
        newTokens.push({ type: 'punc', val: '[' });
        newTokens.push({ type: 'id', val: rep.ref });
        newTokens.push({ type: 'punc', val: ']' });
      }
      i = rep.endIdx;
    } else if (globalReplaceAt.has(i)) {
      newTokens.push({ type: 'id', val: globalReplaceAt.get(i) });
    } else {
      newTokens.push(tokens[i]);
    }
  }

  const aliasPrefix = globalAliasDecls.length > 0 ? `let ${globalAliasDecls.join(',')};` : '';
  const bodyCode = aliasPrefix + serializeTokens(newTokens);
  return headerBuilder(activeItems, bodyCode);
}

function internAndPackModuleStrings(tokens) {
  const SEP = '\x7f';
  const occurrences = scanModulePoolCandidates(tokens, true);
  const selected = [];
  for (const [strVal, list] of occurrences.entries()) {
    const valBytes = Buffer.byteLength(strVal, 'utf8');
    const count = list.length;
    const totalOrig = list.reduce((s, x) => s + x.origBytes, 0);
    const hasStrLit = list.some((x) => x.kind === 'str');
    if ((count >= 2 && totalOrig > valBytes + 8 + count * 4) || (hasStrLit && valBytes >= 14)) {
      selected.push({ strVal, list, totalOrig });
    }
  }
  if (selected.length < 1) return null;
  selected.sort((a, b) => b.list.length - a.list.length || b.totalOrig - a.totalOrig);

  return applyModulePoolReplacements(tokens, selected, (activeItems, bodyCode) => {
    const varNames = activeItems.map((x) => x.varName);
    const joined = activeItems.map((x) => x.strVal).join(SEP);
    const packedExpr = packTextJsExpr(joined, 760);
    return `{const[${varNames.join(',')}]=${packedExpr}.split(${JSON.stringify(SEP)});${bodyCode}}`;
  });
}

function compactStaticStringArrayMap(src, constName) {
  const marker = `const ${constName} = {`;
  const start = src.indexOf(marker);
  if (start < 0) return src;
  let i = start + marker.length - 1;
  let depth = 0;
  let end = -1;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (ch === "'" || ch === '"') {
      const q = ch;
      i++;
      while (i < src.length) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === q) { i++; break; }
        i++;
      }
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
    i++;
  }
  if (end < 0) return src;
  const rawBlock = src.slice(start + `const ${constName} = `.length, end);
  let p = 0;
  const n = rawBlock.length;
  const skipWS = () => {
    while (p < n) {
      if (/\s/.test(rawBlock[p])) { p++; continue; }
      if (rawBlock[p] === '/' && rawBlock[p + 1] === '/') {
        while (p < n && rawBlock[p] !== '\n') p++;
        continue;
      }
      if (rawBlock[p] === '/' && rawBlock[p + 1] === '*') {
        p += 2;
        while (p < n && !(rawBlock[p] === '*' && rawBlock[p + 1] === '/')) p++;
        p += 2;
        continue;
      }
      break;
    }
  };
  const readStr = () => {
    const q = rawBlock[p];
    if (q !== "'" && q !== '"') return null;
    p++;
    let s = '';
    while (p < n) {
      const c = rawBlock[p++];
      if (c === q) return s;
      if (c === '\\') {
        const e = rawBlock[p++];
        if (e === 'n') s += '\n';
        else if (e === 'r') s += '\r';
        else if (e === 't') s += '\t';
        else if (e === '\\' || e === "'" || e === '"') s += e;
        else return null;
      } else {
        s += c;
      }
    }
    return null;
  };
  skipWS();
  if (rawBlock[p++] !== '{') return src;
  const rows = [];
  while (p < n) {
    skipWS();
    if (rawBlock[p] === '}') { p++; break; }
    let key = null;
    if (rawBlock[p] === "'" || rawBlock[p] === '"') key = readStr();
    else {
      const m = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(rawBlock.slice(p));
      if (!m) return src;
      key = m[0];
      p += key.length;
    }
    if (!key || key.includes('\t') || key.includes('\n')) return src;
    skipWS();
    if (rawBlock[p++] !== ':') return src;
    skipWS();
    if (rawBlock[p++] !== '[') return src;
    const arr = [key];
    while (p < n) {
      skipWS();
      if (rawBlock[p] === ']') { p++; break; }
      const item = readStr();
      if (item === null || item.includes('\t') || item.includes('\n')) return src;
      arr.push(item);
      skipWS();
      if (rawBlock[p] === ',') p++;
    }
    rows.push(arr.join('\t'));
    skipWS();
    if (rawBlock[p] === ',') p++;
  }
  let afterEnd = end;
  while (afterEnd < src.length && (src[afterEnd] === ' ' || src[afterEnd] === '\t')) afterEnd++;
  if (src[afterEnd] === ';') afterEnd++;
  const tableBlob = JSON.stringify(rows.join('\n'));
  const replacement = `const ${constName} = Object.fromEntries(${tableBlob}.split("\\n").map((r) => { const a = r.split("\\t"); return [a[0], a.slice(1)]; }));`;
  return src.slice(0, start) + replacement + src.slice(afterEnd);
}

// Balanced-brace template interpolation scanner for embedded CSS (safe with nested `{ ... }` in `${...}`)
function minifyEmbeddedCssTemplate(src) {
  return src.replace(/const CSS\s*=\s*`([\s\S]*?)`;/, (_, body) => {
    const slots = [];
    let safeBody = '';
    let i = 0;
    const n = body.length;
    while (i < n) {
      if (body[i] === '\\' && i + 1 < n) {
        safeBody += body.slice(i, i + 2);
        i += 2;
        continue;
      }
      if (body[i] === '$' && body[i + 1] === '{') {
        let j = i + 2;
        let depth = 1;
        while (j < n && depth > 0) {
          const ch = body[j];
          if (ch === "'" || ch === '"' || ch === '`') {
            const q = ch;
            j++;
            while (j < n) {
              if (body[j] === '\\') { j += 2; continue; }
              if (body[j] === q) { j++; break; }
              j++;
            }
            continue;
          }
          if (ch === '{') depth++;
          else if (ch === '}') depth--;
          j++;
        }
        if (depth === 0) {
          const expr = body.slice(i + 2, j - 1);
          slots.push(expr);
          safeBody += `__AGTPL${slots.length - 1}__`;
          i = j;
          continue;
        }
      }
      safeBody += body[i++];
    }
    const min = minifyCss(safeBody);
    const segs = min.split(/__AGTPL(\d+)__/);
    const jsConcat = segs
      .map((part, idx) => (idx % 2 === 0 ? JSON.stringify(part) : `(${slots[Number(part)]})`))
      .filter((part) => part !== '""')
      .join('+');
    return `const CSS=${jsConcat || '""'};`;
  });
}

function minifyJs(src) {
  return serializeTokens(mangleSafeLocals(tokenizeJs(src)));
}

function minifySingleSource(src) {
  const tokens = mangleSafeLocals(tokenizeJs(src));
  const plainMin = serializeTokens(tokens);
  const packedMin = internAndPackModuleStrings(tokens);
  if (packedMin && Buffer.byteLength(packedMin, 'utf8') + 40 < Buffer.byteLength(plainMin, 'utf8')) {
    return packedMin;
  }
  return plainMin;
}

const RUNTIME_PARTS = [
  'i18n-locales.js',
  'i18n-core.js',
  'usage-core.js',
  'crystal-prism-core.js',
  'animated-icons.js',
  'motion-engine.js',
  'ripple-core.js',
  'conv-aura.js',
  'smooth-caret.js',
  'dual-mascot-rig.js',
  'vial-core.js',
  'pulse-vial-bridge.js',
  'vendor/pulse-dashboard/inline-fallback.js',
  'vendor/effort-slider/slider-coexist.js',
  'settings-panel.js',
  'home-studio-panel.js',
  'home-ripple-host.js',
  'model-glyph-crystal.js',
  'stream-choreography.js',
  'prism-rim-canvas.js',
  'host-workbench-enhancer.js',
  'context-menu-btw.js',
  'ui-runtime.js',
];

const SYNC_ROOT_FILES = [
  'plugin.json',
  'package.json',
  'README.md',
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
  'config.example.json',
  'cdp.js',
  'inject.js',
  'remove.js',
  'style.css',
  ...RUNTIME_PARTS.filter((p) => !p.includes('/')),
];

const _mangledUnitCache = new Map();
let _unifiedBundleCache = { sig: '', bundleCode: '', partCodeByName: new Map() };
let _cssCache = { sig: '', minCss: '', packedExpr: '' };

const BUNDLE_CACHE_SCHEMA_VERSION = 2;
const BUNDLE_CACHE_FILENAME = '.bundle-cache.json';
const BUNDLE_CACHE_MAX_ENTRIES = 4;
const BUNDLE_CACHE_MAX_FILE_BYTES = 4 * 1024 * 1024;
const BUNDLE_CACHE_MAX_EXPR_BYTES = 2 * 1024 * 1024;
const BUNDLE_CACHE_MAX_BOOTCFG_BYTES = 64 * 1024;
const CHANNEL_CACHE_MAX_PAYLOAD_BYTES = 1024 * 1024;
const CHANNEL_CACHE_NAMES = ['omni', 'sidebar', 'hostI18n', 'thought', 'inlineDiff', 'wallpaper'];
const SHA256_HEX_RE = /^[0-9a-f]{64}$/;
const CODE_HASH_RE = /^[0-9a-z]{1,16}$/;

const _bundleCacheStats = {
  diskHits: 0,
  diskBaseHits: 0,
  diskMisses: 0,
  diskWrites: 0,
  diskWriteFailures: 0,
  diskReadFallbacks: 0,
  compileUnifiedRuns: 0,
  mangledUnitRuns: 0,
  cssMinifyRuns: 0,
  deferredExprHashRuns: 0,
  channelDiskHits: 0,
  channelDiskMisses: 0,
  channelCompileRuns: 0,
  channelHitsByName: { omni: 0, sidebar: 0, hostI18n: 0, thought: 0, inlineDiff: 0, wallpaper: 0 },
  lastOutcome: 'none',
  lastCachePath: null,
};

let _diskCacheLastSource = { sourceHash: '', codeHash: '' };
let _warmBaseCache = {
  statSig: '',
  sourceHash: '',
  codeHash: '',
  basePrefix: '',
  baseSuffix: '',
  baseSha256: '',
};
let _pendingDiskCachePersist = null;
const _pendingChannelCacheWrites = new Map();
let _cdpSelfHashCache = { sig: '', hash: '' };
let _lastCompiledSourceHash = '';

const BUNDLE_CACHE_ROOT_MEM_TTL_MS = 500;
let _bundleCacheRootCache = {
  resolved: '',
  sig: '',
  cachedAt: 0,
  parsed: null,
};

function invalidateBundleCacheRootCache(targetPath = null) {
  if (!targetPath) {
    _bundleCacheRootCache = { resolved: '', sig: '', cachedAt: 0, parsed: null };
    return;
  }
  const resolved = path.resolve(targetPath);
  if (_bundleCacheRootCache.resolved === resolved) {
    _bundleCacheRootCache = { resolved: '', sig: '', cachedAt: 0, parsed: null };
  }
}

function freezeBundleCacheRoot(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed;
  try {
    if (Array.isArray(parsed.entries)) {
      for (const ent of parsed.entries) {
        if (ent && typeof ent === 'object') Object.freeze(ent);
      }
      Object.freeze(parsed.entries);
    }
    if (parsed.channels && typeof parsed.channels === 'object' && !Array.isArray(parsed.channels)) {
      for (const name of Object.keys(parsed.channels)) {
        const ch = parsed.channels[name];
        if (ch && typeof ch === 'object') Object.freeze(ch);
      }
      Object.freeze(parsed.channels);
    }
    Object.freeze(parsed);
  } catch {}
  return parsed;
}

function getFileSig(filePath) {
  const st = fs.statSync(filePath);
  return `${st.mtimeMs}:${st.size}`;
}

function readCss() {
  const p = path.join(__dirname, 'style.css');
  const sig = getFileSig(p);
  if (_cssCache.sig !== sig) {
    _bundleCacheStats.cssMinifyRuns += 1;
    const minCss = minifyCss(fs.readFileSync(p, 'utf8'));
    _cssCache = { sig, minCss, packedExpr: '' };
  }
  return _cssCache.minCss;
}

function readPackedCssExpr() {
  readCss();
  if (!_cssCache.packedExpr) {
    _cssCache.packedExpr = packCssJsExpr(_cssCache.minCss);
  }
  return _cssCache.packedExpr;
}

function getEffectiveBundlePartNames() {
  const brandRel = 'assets/brand-mark-svg.js';
  if (fs.existsSync(path.join(__dirname, brandRel))) {
    return [brandRel, ...RUNTIME_PARTS];
  }
  return [...RUNTIME_PARTS];
}

function minifyEmbeddedGlslTemplates(src) {
  if (!src.includes('#version 300 es')) return src;
  return src.replace(/`(\s*#version\s+300\s+es\b(?:\\[\s\S]|(?!\$\{)[^`\\])*)`/g, (full, body) => {
    const decoded = decodeSimpleTemplateBody(body);
    if (decoded === null) return full;
    const min = minifyGlsl(decoded);
    return JSON.stringify(min);
  });
}

function stripJsFunctionsByName(src, replacementsByName) {
  const tokens = tokenizeJs(src);
  const out = [];
  const nextSig = (idx) => {
    for (let j = idx; j < tokens.length; j++) {
      if (tokens[j].type !== 'ws' && tokens[j].type !== 'nl') return j;
    }
    return -1;
  };
  const prevSigVal = (list) => {
    for (let k = list.length - 1; k >= 0; k--) {
      if (list[k].type !== 'ws' && list[k].type !== 'nl') return list[k].val;
    }
    return '';
  };
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    const prevV = prevSigVal(out);
    if (tk.type === 'id' && tk.val === 'function' && (!prevV || prevV === ';' || prevV === '}' || prevV === '{')) {
      const nameIdx = nextSig(i + 1);
      const nameTk = nameIdx >= 0 ? tokens[nameIdx] : null;
      if (nameTk && nameTk.type === 'id' && Object.prototype.hasOwnProperty.call(replacementsByName, nameTk.val)) {
        const parenStart = nextSig(nameIdx + 1);
        if (parenStart >= 0 && tokens[parenStart].type === 'punc' && tokens[parenStart].val === '(') {
          let pDepth = 0;
          let pEnd = -1;
          for (let j = parenStart; j < tokens.length; j++) {
            const t = tokens[j];
            if (t.type === 'punc' && t.val === '(') pDepth++;
            else if (t.type === 'punc' && t.val === ')') {
              pDepth--;
              if (pDepth === 0) { pEnd = j; break; }
            }
          }
          const braceStart = pEnd >= 0 ? nextSig(pEnd + 1) : -1;
          if (braceStart >= 0 && tokens[braceStart].type === 'punc' && tokens[braceStart].val === '{') {
            let bDepth = 0;
            let bEnd = -1;
            for (let j = braceStart; j < tokens.length; j++) {
              const t = tokens[j];
              if (t.type === 'lit' && t.val.endsWith('${')) bDepth++;
              else if (t.type === 'punc' && t.val === '{') bDepth++;
              else if (t.type === 'punc' && t.val === '}') {
                bDepth--;
                if (bDepth === 0) { bEnd = j; break; }
              }
            }
            if (bEnd >= 0) {
              const repl = replacementsByName[nameTk.val];
              if (repl) out.push(...tokenizeJs(repl));
              else out.push({ type: 'punc', val: ';' });
              i = bEnd;
              continue;
            }
          }
        }
      }
    }
    out.push(tk);
  }
  return serializeTokens(out);
}

function stripUnusedUpstreamMenuObserver(src) {
  const preCleaned = src
    .replace(/\bvar\s+(?:SET_TITLE_I18N|SET_HEAD_I18N|FILL_RADIUS_CSS|TRACK_HEIGHT|BASE_SPEEDUP|MIN_HEIGHT_SLOTS|CLAUDE_ROWS|CLAUDE_KNOB_[WHR]|TRACE_CAPACITY|traceRingBuffer)\s*=\s*(?:\{[^{}]*\}|[^;\n]+);?/g, '')
    .replace(/,\s*(?:label|hint|labelEn|hintEn)\s*:\s*"[^"]*"/g, '')
    .replace(/(?<!function\s)\btracePush\([^\n;]*\);?/g, '')
    .replace(/if\s*\(\s*typeof\s+window\s*!==\s*"undefined"\s*&&[\s\S]*?(?=\nreturn\s*\{)/, '')
    .replace(/(var\s+SLIDER_CSS\s*=\s*)("(?:\\.|[^"\\])*")/, (full, p1, lit) => {
      try {
        const rawCss = JSON.parse(lit);
        const cleaned = rawCss.replace(/\.ces-set[^{}]*\{[^{}]*\}/g, '');
        return p1 + serializeJsValue(minifyCss(cleaned));
      } catch {
        return full;
      }
    });
  return stripJsFunctionsByName(preCleaned, {
    installMenuObserver: 'function installMenuObserver(){return{stop:function(){},rescan:function(){},getCurrent:function(){return null;}};}',
    openSettingsPanel: 'function openSettingsPanel(){return function(){};}',
    installSettingsUi: 'function installSettingsUi(){return{stop:function(){}};}',
    findInferenceRow: '',
    traceClear: '',
    tracePush: 'function tracePush(){}',
    findSeatEffort: 'function findSeatEffort(){return null;}',
    starCountFor: '',
    resetSettings: '',
    writeSettings: '',
    dumpTrace: '',
    particleCountFor: '',
    starBrightnessFor: '',
  });
}

function preprocessPartToUnits(partName, rawSource) {
  const glslCleaned = minifyEmbeddedGlslTemplates(rawSource);
  if (
    partName === 'pulse-vial-bridge.js' ||
    partName === 'settings-panel.js' ||
    partName === 'home-studio-panel.js' ||
    partName === 'vendor/pulse-dashboard/inline-fallback.js'
  ) {
    return [{ key: partName, src: minifyEmbeddedCssTemplate(glslCleaned), prefix: '' }];
  }
  if (partName === 'i18n-locales.js') {
    return [{ key: partName, src: compactStaticStringArrayMap(glslCleaned, 'UI_TABLE'), prefix: '' }];
  }
  if (partName === 'vendor/effort-slider/slider-coexist.js') {
    const upstreamPath = path.join(__dirname, 'vendor', 'effort-slider', 'upstream-client.js');
    if (fs.existsSync(upstreamPath) && !glslCleaned.includes('AntigravityCodexEffortSlider = exportsObj')) {
      const upstreamRaw = stripUnusedUpstreamMenuObserver(fs.readFileSync(upstreamPath, 'utf8'));
      return [
        {
          key: 'vendor/effort-slider/upstream-client.js',
          src: upstreamRaw,
          prefix:
            'globalThis.__agCodexEffortSliderDisableAutoBoot=!0;if(typeof window!=="undefined")window.__agCodexEffortSliderDisableAutoBoot=!0;\n',
        },
        { key: partName, src: glslCleaned, prefix: '' },
      ];
    }
  }
  return [{ key: partName, src: glslCleaned, prefix: '' }];
}

function desugarInterpolatedTemplateTokens(tokens) {
  const out = [];
  let prevSig = null;

  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    if (
      tk.type === 'lit' &&
      tk.val === '`' &&
      i + 1 < tokens.length &&
      tokens[i + 1].type === 'lit' &&
      tokens[i + 1].val.endsWith('${')
    ) {
      const canBeTagged =
        prevSig &&
        (prevSig.type === 'id' ||
          prevSig.val === ')' ||
          prevSig.val === ']' ||
          prevSig.val === '}' ||
          prevSig.val.endsWith("'") ||
          prevSig.val.endsWith('"') ||
          prevSig.val.endsWith('`'));
      const untagged =
        !canBeTagged || (prevSig && JS_KEYWORDS.has(prevSig.val) && prevSig.val !== 'this' && prevSig.val !== 'super');

      if (untagged) {
        const chunks = [];
        const exprs = [];
        let cursor = i + 1;
        let ok = true;
        while (cursor < tokens.length) {
          const segTok = tokens[cursor];
          if (!segTok || segTok.type !== 'lit') {
            ok = false;
            break;
          }
          if (segTok.val.endsWith('`') && !segTok.val.endsWith('${')) {
            const dec = decodeSimpleTemplateBody(segTok.val.slice(0, -1));
            if (dec === null || hasLoneUtf16Surrogate(dec)) ok = false;
            else chunks.push(dec);
            cursor++;
            break;
          }
          if (!segTok.val.endsWith('${')) {
            ok = false;
            break;
          }
          const dec = decodeSimpleTemplateBody(segTok.val.slice(0, -2));
          if (dec === null || hasLoneUtf16Surrogate(dec)) {
            ok = false;
            break;
          }
          chunks.push(dec);
          cursor++;
          let braceDepth = 1;
          const exprStart = cursor;
          while (cursor < tokens.length && braceDepth > 0) {
            const et = tokens[cursor];
            if (et.type === 'lit' && et.val.endsWith('${')) braceDepth++;
            else if (et.type === 'punc' && et.val === '{') braceDepth++;
            else if (et.type === 'punc' && et.val === '}') braceDepth--;
            cursor++;
          }
          if (braceDepth !== 0) {
            ok = false;
            break;
          }
          exprs.push(tokens.slice(exprStart, cursor - 1));
        }

        const maxStaticLen = ok ? chunks.reduce((m, c) => Math.max(m, Buffer.byteLength(c, 'utf8')), 0) : 0;
        if (ok && chunks.length === exprs.length + 1 && maxStaticLen >= 12) {
          out.push({ type: 'punc', val: '(' });
          out.push({ type: 'lit', val: serializeJsValue(chunks[0]) });
          for (let k = 0; k < exprs.length; k++) {
            out.push({ type: 'punc', val: '+' });
            out.push({ type: 'punc', val: '(' });
            const inner = desugarInterpolatedTemplateTokens(exprs[k]);
            for (let m = 0; m < inner.length; m++) out.push(inner[m]);
            out.push({ type: 'punc', val: ')' });
            if (chunks[k + 1].length > 0) {
              out.push({ type: 'punc', val: '+' });
              out.push({ type: 'lit', val: serializeJsValue(chunks[k + 1]) });
            }
          }
          const closeParen = { type: 'punc', val: ')' };
          out.push(closeParen);
          prevSig = closeParen;
          i = cursor - 1;
          continue;
        }
      }
    }

    out.push(tk);
    if (tk.type !== 'ws' && tk.type !== 'nl') prevSig = tk;
  }

  return out;
}

function foldStaticCssConstTokens(tokens) {
  const sigIdx = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type !== 'ws' && tokens[i].type !== 'nl') sigIdx.push(i);
  }
  const edits = [];
  for (let s = 0; s + 3 < sigIdx.length; s++) {
    const t0 = tokens[sigIdx[s]];
    const t1 = tokens[sigIdx[s + 1]];
    const t2 = tokens[sigIdx[s + 2]];
    if (
      (t0.val !== 'const' && t0.val !== 'let' && t0.val !== 'var') ||
      t1.type !== 'id' ||
      t2.val !== '='
    ) {
      continue;
    }
    const isCssVar = /CSS/i.test(t1.val);
    const startSig = s + 3;
    const first = tokens[sigIdx[startSig]];
    // Case A: `[ elem1, elem2, ... ].join("sep")` — merges consecutive string literals & minifies CSS runs
    if (first.val === '[') {
      let depth = 1;
      let cur = startSig + 1;
      const elemRanges = [];
      let elemStart = cur;
      while (cur < sigIdx.length && depth > 0) {
        const v = tokens[sigIdx[cur]].val;
        if (v === '[' || v === '(' || v === '{') depth++;
        else if (v === ']' || v === ')' || v === '}') {
          depth--;
          if (depth === 0) {
            if (cur > elemStart) elemRanges.push([elemStart, cur - 1]);
            break;
          }
        } else if (depth === 1 && v === ',') {
          if (cur > elemStart) elemRanges.push([elemStart, cur - 1]);
          elemStart = cur + 1;
        }
        cur++;
      }
      if (
        depth === 0 &&
        elemRanges.length >= 2 &&
        cur + 4 < sigIdx.length &&
        tokens[sigIdx[cur]].val === ']' &&
        tokens[sigIdx[cur + 1]].val === '.' &&
        tokens[sigIdx[cur + 2]].val === 'join' &&
        tokens[sigIdx[cur + 3]].val === '('
      ) {
        let sep = ',';
        let closePos = cur + 4;
        let ok = true;
        if (tokens[sigIdx[closePos]].val === ')') {
          sep = ',';
        } else if (
          closePos + 1 < sigIdx.length &&
          tokens[sigIdx[closePos]].type === 'lit' &&
          (tokens[sigIdx[closePos]].val[0] === "'" || tokens[sigIdx[closePos]].val[0] === '"') &&
          tokens[sigIdx[closePos + 1]].val === ')'
        ) {
          const decSep = decodeSimpleJsString(tokens[sigIdx[closePos]].val);
          if (decSep === null) ok = false;
          else {
            sep = decSep;
            closePos += 1;
          }
        } else {
          ok = false;
        }
        const afterJoin = closePos + 1 < sigIdx.length ? tokens[sigIdx[closePos + 1]] : null;
        if (ok && (!afterJoin || afterJoin.val === ';' || afterJoin.val === ',')) {
          // Flatten each element: either pure string literal(s) `a + b` or general token slice
          const segments = [];
          let strRun = [];
          const flushStrRun = (trailingSep) => {
            if (strRun.length === 0) return;
            const joined = strRun.join(sep) + (trailingSep ? sep : '');
            const minChunk = isCssVar
              ? joined.replace(/^\s+/, '').replace(/\s{2,}/g, ' ').replace(/\s*([{};:,])\s*/g, '$1')
              : joined;
            segments.push([{ type: 'lit', val: serializeJsValue(minChunk) }]);
            strRun = [];
          };
          for (let rIdx = 0; rIdx < elemRanges.length; rIdx++) {
            const [es, ee] = elemRanges[rIdx];
            // Check if element is a single string literal
            if (
              es === ee &&
              tokens[sigIdx[es]].type === 'lit' &&
              (tokens[sigIdx[es]].val[0] === "'" || tokens[sigIdx[es]].val[0] === '"')
            ) {
              const dec = decodeSimpleJsString(tokens[sigIdx[es]].val);
              if (dec !== null) {
                strRun.push(dec);
                continue;
              }
            }
            if (!isCssVar) {
              segments.length = 0;
              strRun.length = 0;
              break;
            }
            flushStrRun(true);
            const exprSlice = tokens.slice(sigIdx[es], sigIdx[ee] + 1);
            const hasMore = rIdx + 1 < elemRanges.length;
            const wrapped = [{ type: 'punc', val: '(' }, ...exprSlice, { type: 'punc', val: ')' }];
            if (hasMore && sep.length > 0) {
              wrapped.push({ type: 'punc', val: '+' });
              wrapped.push({ type: 'lit', val: serializeJsValue(sep) });
            }
            segments.push(wrapped);
          }
          flushStrRun(false);
          if (segments.length === 1 && segments[0].length === 1 && segments[0][0].type === 'lit') {
            const fullRaw = decodeSimpleJsString(segments[0][0].val);
            const foldedText = fullRaw !== null ? (isCssVar ? minifyCss(fullRaw) : fullRaw) : null;
            edits.push({
              from: sigIdx[startSig],
              to: sigIdx[closePos],
              repTokens: [{ type: 'lit', val: foldedText !== null ? serializeJsValue(foldedText) : segments[0][0].val }],
            });
          } else if (isCssVar && segments.length > 0) {
            const repTokens = [];
            for (let k = 0; k < segments.length; k++) {
              if (k > 0) repTokens.push({ type: 'punc', val: '+' });
              for (const tk of segments[k]) repTokens.push(tk);
            }
            edits.push({ from: sigIdx[startSig], to: sigIdx[closePos], repTokens });
          }
          s = closePos;
          continue;
        }
      }
    }
    // Case B: `"str1" + "str2" + ...`
    if (first.type === 'lit' && (first.val[0] === "'" || first.val[0] === '"')) {
      const firstDec = decodeSimpleJsString(first.val);
      if (firstDec !== null) {
        const parts = [firstDec];
        let cur = startSig + 1;
        let lastTokPos = startSig;
        let ok = true;
        while (cur + 1 < sigIdx.length && tokens[sigIdx[cur]].val === '+') {
          const rhs = tokens[sigIdx[cur + 1]];
          if (rhs.type !== 'lit' || (rhs.val[0] !== "'" && rhs.val[0] !== '"')) {
            ok = false;
            break;
          }
          const dec = decodeSimpleJsString(rhs.val);
          if (dec === null) {
            ok = false;
            break;
          }
          parts.push(dec);
          lastTokPos = cur + 1;
          cur += 2;
        }
        const afterConcat = cur < sigIdx.length ? tokens[sigIdx[cur]] : null;
        if (ok && parts.length >= 2 && (!afterConcat || afterConcat.val === ';' || afterConcat.val === ',')) {
          const joinedText = parts.join('');
          const foldedText = isCssVar ? minifyCss(joinedText) : joinedText;
          edits.push({
            from: sigIdx[startSig],
            to: sigIdx[lastTokPos],
            repTokens: [{ type: 'lit', val: serializeJsValue(foldedText) }],
          });
          s = lastTokPos;
        }
      }
    }
  }
  if (edits.length === 0) return tokens;
  const out = [];
  let eIdx = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (eIdx < edits.length && i === edits[eIdx].from) {
      for (const rt of edits[eIdx].repTokens) out.push(rt);
      i = edits[eIdx].to;
      eIdx++;
    } else {
      out.push(tokens[i]);
    }
  }
  return out;
}

function getMangledUnit(unitKey, sig, src) {
  const hit = _mangledUnitCache.get(unitKey);
  if (hit && hit.sig === sig) return hit;
  _bundleCacheStats.mangledUnitRuns += 1;
  const tokens = desugarInterpolatedTemplateTokens(mangleSafeLocals(foldStaticCssConstTokens(tokenizeJs(src))));
  const occs = scanModulePoolCandidates(tokens, true);
  const entry = { sig, tokens, occs };
  _mangledUnitCache.set(unitKey, entry);
  return entry;
}

// Unified Bundle-Level Shared String & Member-Property Pool Compiler
function compileUnifiedBundle() {
  const partNames = getEffectiveBundlePartNames();
  const partMeta = [];
  const sigParts = [];

  for (const partName of partNames) {
    const fullPath = path.join(__dirname, partName);
    let sig = getFileSig(fullPath);
    if (partName === 'vendor/effort-slider/slider-coexist.js') {
      const upPath = path.join(__dirname, 'vendor', 'effort-slider', 'upstream-client.js');
      if (fs.existsSync(upPath)) sig += '|' + getFileSig(upPath);
    }
    sigParts.push(`${partName}:${sig}`);
    partMeta.push({ partName, fullPath, sig });
  }

  const totalSig = sigParts.join(';');
  if (_unifiedBundleCache.sig === totalSig) {
    return _unifiedBundleCache;
  }
  _bundleCacheStats.compileUnifiedRuns += 1;

  const SEP = '\x7f';
  const POOL_IDX_BASE = 0x00a1;
  const DIRECT_SINGLE_LIMIT = 7775; // 0x00A1..0x1EFF: 1,887 2-byte + 5,888 3-byte UTF-8 chars (all < 0x2028)
  const HI_CHAR_BASE = 0x1f00; // 0x1F00..0x1FFF + 0x00A1..0x00E0 = 16,384 overflow 2-char slots
  const MAX_SHARED_POOL = 12000;

  const compiledParts = [];
  const globalStats = new Map();

  for (const pm of partMeta) {
    const raw = fs.readFileSync(pm.fullPath, 'utf8');
    const units = preprocessPartToUnits(pm.partName, raw).map((u) => {
      const uSig = `${pm.sig}:${u.key}`;
      const mangled = getMangledUnit(u.key, uSig, u.src);
      for (const [strVal, list] of mangled.occs.entries()) {
        let g = globalStats.get(strVal);
        if (!g) {
          g = {
            strVal,
            valBytes: Buffer.byteLength(strVal, 'utf8'),
            totalOrig: 0,
            totalReplEst: 0,
            moduleHits: 0,
            totalOccs: 0,
            hasStr: false,
          };
          globalStats.set(strVal, g);
        }
        let unitOrig = 0;
        let unitRepl = 0;
        let unitHasStr = false;
        for (const occ of list) {
          unitOrig += occ.origBytes;
          unitRepl += occ.kind === 'str' ? 2 : 4;
          if (occ.kind === 'str') unitHasStr = true;
        }
        if (unitOrig > unitRepl + 2) {
          g.totalOrig += unitOrig;
          g.totalReplEst += unitRepl + 4;
          g.moduleHits += 1;
          g.totalOccs += list.length;
          if (unitHasStr) g.hasStr = true;
        }
      }
      return { ...u, tokens: mangled.tokens, occs: mangled.occs };
    });
    compiledParts.push({ partName: pm.partName, raw, units });
  }

  const poolCandidates = [];
  for (const g of globalStats.values()) {
    const lzPoolCost = g.valBytes >= 8 ? Math.ceil(g.valBytes * 0.62) + 2 : g.valBytes + 2;
    const netSave = g.totalOrig - (lzPoolCost + g.totalReplEst);
    // Multi-occurrence strings/props save via deduplication; single-occurrence strings >= 17B save via shared LZ phrase dictionary (skip pre-compressed high-entropy blobs).
    if ((g.totalOccs >= 2 && netSave >= 1) || (g.hasStr && g.valBytes >= 17 && !g.strVal.startsWith('^]t'))) {
      const sortScore = g.totalOccs >= 2 ? netSave + Math.floor(g.valBytes * 0.25) : Math.floor(g.valBytes * 0.35) - 5;
      poolCandidates.push({ ...g, netSave, sortScore });
    }
  }
  poolCandidates.sort((a, b) => b.sortScore - a.sortScore || b.totalOccs - a.totalOccs);
  const chosenPool = poolCandidates.slice(0, MAX_SHARED_POOL);
  // Assign 2-byte UTF-8 index slots (0..1791) to entries referenced by the most modules!
  chosenPool.sort((a, b) => b.moduleHits - a.moduleHits || b.totalOccs - a.totalOccs || b.sortScore - a.sortScore);

  const sharedPoolList = chosenPool.map((x) => x.strVal);
  const poolIndexMap = new Map();
  for (let idx = 0; idx < sharedPoolList.length; idx++) {
    poolIndexMap.set(sharedPoolList[idx], idx);
  }

  const ASCII_SLOT_COUNT = 88; // 0x23..0x3B (25) + 0x3F..0x5B (29) + 0x5D..0x7E (34): 1-byte unescaped ASCII
  const SINGLE_TOTAL_LIMIT = ASCII_SLOT_COUNT + DIRECT_SINGLE_LIMIT;
  const encodePoolIndex = (idx) => {
    if (idx < 25) return String.fromCharCode(35 + idx);
    if (idx < 54) return String.fromCharCode(38 + idx);
    if (idx < ASCII_SLOT_COUNT) return String.fromCharCode(39 + idx);
    if (idx < SINGLE_TOTAL_LIMIT) return String.fromCharCode(POOL_IDX_BASE + idx - ASCII_SLOT_COUNT);
    const rem = idx - SINGLE_TOTAL_LIMIT;
    return String.fromCharCode(HI_CHAR_BASE + (rem >> 6), POOL_IDX_BASE + (rem & 63));
  };

  const packedPoolExpr = packTextJsExpr(sharedPoolList.join(SEP), 5600);
  const bootstrapHeader =
    `globalThis.__agSP=${packedPoolExpr}.split(${JSON.stringify(SEP)});` +
    `globalThis.__agM=s=>{let p=globalThis.__agSP,r=[],i=0;for(;i<s.length;i++){let c=s.charCodeAt(i);r.push(p[c<${POOL_IDX_BASE}?(c<60?c-35:c<92?c-38:c-39):c<${HI_CHAR_BASE}?c-${POOL_IDX_BASE - ASCII_SLOT_COUNT}:${SINGLE_TOTAL_LIMIT}+((c-${HI_CHAR_BASE})<<6)+s.charCodeAt(++i)-${POOL_IDX_BASE}])}return r};`;

  const partCodeByName = new Map();
  const orderedCodes = [];

  for (let pIdx = 0; pIdx < compiledParts.length; pIdx++) {
    const cp = compiledParts[pIdx];
    const unitCodes = cp.units.map((u) => {
      const selected = [];
      for (const [strVal, list] of u.occs.entries()) {
        const poolIdx = poolIndexMap.get(strVal);
        if (poolIdx === undefined) continue;
        const totalOrig = list.reduce((s, x) => s + x.origBytes, 0);
        selected.push({ strVal, poolIdx, list, totalOrig });
      }
      selected.sort((a, b) => b.list.length - a.list.length || b.totalOrig - a.totalOrig);

      const plainMin = serializeTokens(u.tokens);
      const pooledCode = applyModulePoolReplacements(u.tokens, selected, (activeItems, bodyCode) => {
        const varNames = activeItems.map((x) => x.varName);
        const idxChars = activeItems.map((x) => encodePoolIndex(x.poolIdx)).join('');
        const bodySep = bodyCode.endsWith(';') || bodyCode.endsWith('}') ? bodyCode : bodyCode + ';';
        return `{let[${varNames.join(',')}]=__agM(${serializeJsValue(idxChars)});${bodySep}}`;
      });

      const bestBody =
        Buffer.byteLength(pooledCode, 'utf8') < Buffer.byteLength(plainMin, 'utf8')
          ? pooledCode
          : plainMin;
      const withSemi = bestBody.endsWith(';') || bestBody.endsWith('}') ? bestBody : bestBody + ';';
      return u.prefix + withSemi;
    });

    let finalPartCode = unitCodes.join('\n');
    if (pIdx === 0) {
      finalPartCode = bootstrapHeader + finalPartCode;
    }
    if (pIdx === compiledParts.length - 1) {
      finalPartCode += '\ndelete globalThis.__agSP;delete globalThis.__agM;';
    }
    partCodeByName.set(cp.partName, finalPartCode);
    orderedCodes.push(finalPartCode);
  }

  const bundleCode = orderedCodes.join('\n');
  if (process.env.AG_PRISM_DEV_WATCH !== '1') _mangledUnitCache.clear();
  _unifiedBundleCache = { sig: totalSig, bundleCode, partCodeByName };
  return _unifiedBundleCache;
}

function prepareRuntimePart(partName, rawSource) {
  const normName = String(partName || '').replace(/\\/g, '/');
  const fullPath = path.join(__dirname, normName);
  if (fs.existsSync(fullPath)) {
    try {
      const diskRaw = fs.readFileSync(fullPath, 'utf8');
      if (diskRaw === rawSource) {
        const unified = compileUnifiedBundle();
        if (unified.partCodeByName.has(normName)) {
          return unified.partCodeByName.get(normName);
        }
      }
    } catch {}
  }

  let prepped = rawSource;
  if (normName === 'pulse-vial-bridge.js') {
    prepped = minifyEmbeddedCssTemplate(prepped);
  } else if (normName === 'i18n-locales.js') {
    prepped = compactStaticStringArrayMap(prepped, 'UI_TABLE');
  } else if (normName === 'vendor/effort-slider/slider-coexist.js') {
    const upstreamPath = path.join(__dirname, 'vendor', 'effort-slider', 'upstream-client.js');
    if (fs.existsSync(upstreamPath) && !rawSource.includes('AntigravityCodexEffortSlider = exportsObj')) {
      const upstreamRaw = fs.readFileSync(upstreamPath, 'utf8');
      const upstreamMin = minifySingleSource(upstreamRaw);
      const wrapperMin = minifySingleSource(rawSource);
      return `globalThis.__agCodexEffortSliderDisableAutoBoot=!0;if(typeof window!=="undefined")window.__agCodexEffortSliderDisableAutoBoot=!0;\n${upstreamMin}\n${wrapperMin}`;
    }
  }
  return minifySingleSource(prepped);
}

function readRuntimeBundle() {
  return compileUnifiedBundle().bundleCode;
}

function computeHash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function resolveCurrentBundleCodeHash() {
  if (_unifiedBundleCache.bundleCode) {
    return computeHash(readRuntimeBundle());
  }
  if (_warmBaseCache.codeHash && _warmBaseCache.statSig) {
    try {
      if (getBundleSourceStatSig() === _warmBaseCache.statSig) {
        return _warmBaseCache.codeHash;
      }
    } catch {}
  }
  if (_diskCacheLastSource.sourceHash && _diskCacheLastSource.codeHash) {
    try {
      if (computeBundleSourceHash() === _diskCacheLastSource.sourceHash) {
        return _diskCacheLastSource.codeHash;
      }
    } catch {}
  }
  return computeHash(readRuntimeBundle());
}

function buildConfigRefreshExpression(customConfig, extraMeta = null) {
  const config = customConfig ? reconcileConfigAliases(customConfig) : readConfig();
  const codeHash = resolveCurrentBundleCodeHash();
  const bootCfg = {
    ...config,
    ...(extraMeta && typeof extraMeta === 'object' ? extraMeta : {}),
    binding: SETTING_BINDING,
    codeHash,
    __fromFile: true,
  };
  return `(() => {
    const cfg = ${JSON.stringify(bootCfg)};
    const api = window.__agPrism || window.__agClaudeStyle;
    if (api && api.version === ${JSON.stringify(PLUGIN_VERSION)} && api.codeHash === ${JSON.stringify(codeHash)} && typeof api.refreshConfig === 'function') {
      const applied = api.refreshConfig(cfg);
      if (applied === false) {
        return { refreshed: true, skippedStale: true, version: api.version };
      }
      const effectiveCfg = api.getState?.()?.cfg || cfg;
      try { window.__agPrismTelemetry?.sync?.(effectiveCfg); } catch {}
      try { window.__agPrismEffortSlider?.sync?.(effectiveCfg); } catch {}
      try { window.__agPrismThought?.sync?.(effectiveCfg); } catch {}
      try { window.__agPrismInlineDiff?.sync?.(effectiveCfg); } catch {}
      if (effectiveCfg?.omniModule === 'off') {
        try { window.__agPrismOmni?.destroy?.(); } catch {}
      } else {
        try { window.__agPrismOmni?.sync?.(effectiveCfg, window.__agPrismOmniServerMeta || null); } catch {}
      }
      if (effectiveCfg?.sidebarStudio !== 'on') {
        try { window.__agPrismSidebar?.sync?.(effectiveCfg, window.__agPrismSidebarMeta || null); } catch {}
        try { window.__agPrismSidebar?.destroy?.(); } catch {}
        try { delete window.__agPrismSidebar; } catch {}
        try {
          if (document.documentElement) {
            ['data-ag-prism-mode', 'data-ag-prism-chat-kind', 'data-ag-prism-chat-telemetry', 'data-ag-cs-space', 'data-ag-cs-space-palette', 'data-ag-cs-space-accent'].forEach((a) => document.documentElement.removeAttribute(a));
          }
        } catch {}
      } else {
        try { window.__agPrismSidebar?.sync?.(effectiveCfg, window.__agPrismSidebarMeta || null); } catch {}
      }
      try {
        const hiMode = effectiveCfg?.hostLocalization;
        const hiLang = effectiveCfg?.language;
        const navL = String((typeof navigator !== 'undefined' && navigator.language) || '').trim();
        if (hiMode === 'off' || (hiMode !== 'on' && ((hiLang && hiLang !== 'zh-CN' && hiLang !== 'auto') || (hiLang === 'auto' && navL && !/^zh(?:$|-(?:cn|hans|sg)(?:-|$))/i.test(navL))))) {
          window.__agPrismHostI18n?.destroy?.();
        }
      } catch {}
      if (document.documentElement) {
        if (effectiveCfg?.thoughtTranslate && effectiveCfg.thoughtTranslate !== 'off') {
          document.documentElement.setAttribute('data-ag-prism-thought-view', effectiveCfg.thoughtView === 'bilingual' ? 'bilingual' : 'immersive');
        } else {
          document.documentElement.removeAttribute('data-ag-prism-thought-view');
        }
        document.documentElement.setAttribute('data-ag-prism-sidebar-studio', effectiveCfg?.sidebarStudio === 'on' ? 'on' : 'off');
      }
      return { refreshed: true, version: api.version };
    }
    return { refreshed: false };
  })()`;
}

let _injectWrapperTemplate = null;

function getInjectWrapperTemplate() {
  if (_injectWrapperTemplate) return _injectWrapperTemplate;
  const rawTpl = `(() => {
    let _cssVal = null;
    const getCss = () => (_cssVal === null ? (_cssVal = __AG_INJ_CSS__) : _cssVal);
    const cleanupLegacyResidue = () => {
      try {
        const oldStyle = document.getElementById(${JSON.stringify(LEGACY_STYLE_ID)});
        if (oldStyle) oldStyle.remove();
      } catch {}
      try {
        const oldApi = window.__agClaudeStyle;
        if (oldApi && (!window.__agPrism || Number(oldApi.version) <= 2)) {
          if (typeof oldApi.destroy === 'function') oldApi.destroy();
          delete window.__agClaudeStyle;
        }
      } catch {}
    };
    const applyStyle = () => {
      const targetParent = document.head || document.documentElement;
      if (!targetParent) return;
      cleanupLegacyResidue();
      let style = document.getElementById(${JSON.stringify(STYLE_ID)});
      if (!style) {
        style = document.createElement('style');
        style.id = ${JSON.stringify(STYLE_ID)};
      }
      const flatKey = __AG_INJ_CSSHASH__;
      if (style.getAttribute?.('data-ag-cs-flat') !== flatKey + ':' + (style.textContent || '').length) {
        const css = getCss();
        if (style.textContent !== css) style.textContent = css;
        style.removeAttribute?.('data-ag-cs-flat');
        style.setAttribute?.('data-ag-cs-css-hash', flatKey);
      }
      if (style.parentNode !== targetParent || targetParent.lastElementChild !== style) {
        targetParent.appendChild(style);
      }
      try {
        window.__agPrism?.flattenCss?.();
      } catch {}
    };

    const mkRpcCore = (bindingKey, maxInflight, onTimeout, onError, disposedPayload) => {
      const pending = new Map();
      let seq = 0;
      const send = (buildReq, timeoutMs, extra, bypassLimit) =>
        new Promise((resolve) => {
          if (!bypassLimit && pending.size >= maxInflight) {
            resolve(onError('busy', true));
            return;
          }
          const id = ++seq;
          const item = extra ? { resolve, timer: null, ...extra } : { resolve, timer: null };
          item.arm = (ms = timeoutMs) => {
            clearTimeout(item.timer);
            item.timer = setTimeout(() => {
              pending.delete(id);
              resolve(onTimeout());
            }, ms);
          };
          item.arm();
          pending.set(id, item);
          try {
            window[bindingKey](JSON.stringify(buildReq(id)));
          } catch (err) {
            clearTimeout(item.timer);
            pending.delete(id);
            resolve(onError(String(err && err.message ? err.message : err), false));
          }
        });
      const resolve = (id, res) => {
        const item = pending.get(id);
        if (!item) return;
        clearTimeout(item.timer);
        pending.delete(id);
        item.resolve(res);
      };
      const dispose = () => {
        for (const item of pending.values()) {
          clearTimeout(item.timer);
          item.resolve(disposedPayload);
        }
        pending.clear();
      };
      return { pending, send, resolve, dispose };
    };

    const ensureRepoBridge = () => {
      try {
        if (window.__agPrismRepoBridge?.__prismBridgeReady) return;
        const core = mkRpcCore('__agPrismRepoCall', 8, () => ({ ok: false, timeout: true, noRemote: true, hasRemote: false }), (e) => ({ ok: false, error: e }), { ok: false, disposed: true });
        const callRepo = (inp) => {
          const payload = typeof inp === 'string' ? { action: inp } : inp && typeof inp === 'object' ? { ...inp } : { action: 'status' };
          const act = payload.action || 'status';
          if (typeof window.__agPrismRepoCall !== 'function') {
            return Promise.resolve({
              ok: false, offline: true, action: act, isGitRepo: false, noRemote: true, hasRemote: false,
              branch: 'local', commit: ${JSON.stringify(PLUGIN_VERSION)}, shortHash: ${JSON.stringify(PLUGIN_VERSION)},
              remoteUrl: '', hasUpdates: false, upToDate: true, updated: false, message: 'Sidecar daemon offline',
            });
          }
          return core.send((id) => ({ id, action: act, input: payload }), 16000).then((r) => (r && !r.action ? { ...r, action: act } : r));
        };
        Object.assign(callRepo, {
          __prismBridgeReady: true, call: callRepo, request: callRepo,
          status: () => callRepo({ action: 'status' }), pull: () => callRepo({ action: 'pull' }), sync: () => callRepo({ action: 'pull' }),
          resolve: core.resolve, dispose: core.dispose,
        });
        window.__agPrismRepoBridge = callRepo;
        window.__agPrismRepoResolve = core.resolve;
      } catch {}
    };

    const ensureThoughtBridge = () => {
      try {
        const cur = window.__agPrismThoughtBridge;
        if (cur && cur.__prismBridgeReady && typeof cur.cacheStats === 'function' && typeof cur.cancelTranslate === 'function') return;
        try { cur?.dispose?.(); } catch {}
        const core = mkRpcCore(
          '__agPrismThoughtCall',
          64,
          () => ({ ok: false, timeout: true, error: 'Request timed out' }),
          (e) => ({ ok: false, error: e }),
          { ok: false, disposed: true }
        );
        const sendRpc = (payload, onPartial, timeoutMs = 48000) => {
          const act = (payload && payload.action) || 'get-config';
          if (typeof window.__agPrismThoughtCall !== 'function') {
            return Promise.resolve({ ok: false, offline: true, action: act, error: 'Sidecar daemon offline' });
          }
          const isCtrl = act === 'cancel-translate' || act === 'cache-stats' || act === 'clear-cache';
          return core
            .send((id) => ({ id, action: act, input: payload }), timeoutMs, onPartial ? { onPartial, buf: '' } : null, isCtrl)
            .then((r) => (r && !r.action && !r.ok ? { ...r, action: act } : r));
        };
        const bridge = {
          __prismBridgeReady: true,
          call: (input) => sendRpc(input && typeof input === 'object' ? { ...input } : { action: String(input || 'get-config') }, null, 25000),
          translateStream: (opts, onPartial) => {
            const waitMs = Math.min(180000, 90000 + Math.max(0, core.pending.size - 2) * 30000);
            return sendRpc({ ...(opts && typeof opts === 'object' ? opts : {}), action: 'translate-stream', text: (opts && opts.text) || '', mode: (opts && opts.mode) || 'ai' }, onPartial, waitMs);
          },
          cancelTranslate: (v) => sendRpc(v && typeof v === 'object' ? { ...v, action: 'cancel-translate' } : { action: 'cancel-translate', requestId: v, key: v }, null, 8000),
          cacheStats: () => sendRpc({ action: 'cache-stats' }, null, 8000),
          clearCache: () => sendRpc({ action: 'clear-cache' }, null, 8000),
          onChunk: (id, chunk) => {
            const item = core.pending.get(id);
            if (!item || typeof item.onPartial !== 'function') return;
            let fullText = null;
            if (typeof chunk === 'string') {
              item.buf = chunk;
              fullText = chunk;
            } else if (chunk && typeof chunk === 'object' && typeof chunk.a === 'string') {
              const cur = typeof item.buf === 'string' ? item.buf : '';
              if ((chunk.o | 0) === cur.length) {
                item.buf = cur + chunk.a;
                fullText = item.buf;
              }
            }
            if (fullText !== null) {
              try { item.arm?.(60000); } catch {}
              try { item.onPartial(fullText); } catch {}
            }
          },
          resolve: core.resolve,
          dispose: core.dispose,
        };
        window.__agPrismThoughtBridge = bridge;
        window.__agPrismThoughtOnChunk = bridge.onChunk;
        window.__agPrismThoughtResolve = core.resolve;
      } catch {}
    };

    const ensureUsageBridge = () => {
      try {
        const cur = window.__agPrismUsageBridge;
        if (cur && cur.__prismBridgeReady && typeof cur.listSummaries === 'function') return;
        try { cur?.dispose?.(); } catch {}
        const failU = (extra) => ({ ok: false, records: [], summaries: [], ...extra });
        const core = mkRpcCore('__agPrismUsageCall', 12, () => failU({ timeout: true }), (e, busy) => failU(busy ? { busy: true } : { error: e }), failU({ disposed: true }));
        const sendUsageRpc = (reqObj, timeoutMs = 18000) =>
          typeof window.__agPrismUsageCall !== 'function' ? Promise.resolve(failU({ offline: true })) : core.send((id) => ({ id, ...reqObj }), timeoutMs);
        const fetchBatch = (itemsOrOpts, timeoutMs = 18000) => {
          if (itemsOrOpts && typeof itemsOrOpts === 'object' && !Array.isArray(itemsOrOpts)) {
            return sendUsageRpc({ action: itemsOrOpts.action || 'fetch-batch', items: Array.isArray(itemsOrOpts.items) ? itemsOrOpts.items : [], includeSummaries: Boolean(itemsOrOpts.includeSummaries) }, timeoutMs);
          }
          return sendUsageRpc({ action: 'fetch-batch', items: Array.isArray(itemsOrOpts) ? itemsOrOpts : [] }, timeoutMs);
        };
        const listSummaries = (timeoutMs = 12000) => sendUsageRpc({ action: 'list-summaries', items: [], includeSummaries: true }, timeoutMs);
        const bridge = {
          __prismBridgeReady: true,
          isOnline: () => typeof window.__agPrismUsageCall === 'function',
          fetchBatch,
          listSummaries,
          resolve: core.resolve,
          dispose: core.dispose,
        };
        window.__agPrismUsageBridge = bridge;
        window.__agPrismUsageResolve = core.resolve;
      } catch {}
    };

    const destroyModules = (includeMain) => {
      const ks = includeMain
        ? ['__agPrismTelemetry', '__agPrismEffortSlider', '__agPrismThought', '__agPrismOmni', '__agPrismContextMenu', '__agPrism']
        : ['__agPrismTelemetry', '__agPrismEffortSlider', '__agPrismThought', '__agPrismOmni', '__agPrismContextMenu'];
      for (const k of ks) {
        try { window[k]?.destroy?.(); } catch {}
      }
    };

    const stripForeignMount = () => {
      destroyModules(true);
      try { window.__agPrismInlineDiff?.destroy?.(); } catch {}
      try { window.__agPrismContextMenu?.destroy?.(); } catch {}
      try { window.__agPrismHostI18n?.destroy?.(); document.documentElement?.removeAttribute?.('data-ag-prism-host-i18n'); } catch {}
      try {
        document.documentElement?.removeAttribute?.('data-ag-cs-model-menu');
        document.querySelectorAll?.('[data-ag-cs-aux-dual],[data-ag-cs-model-overlay]').forEach((el) => {
          el.removeAttribute('data-ag-cs-aux-dual');
          el.removeAttribute('data-ag-cs-model-overlay');
        });
      } catch {}
      for (const k of ['__agPrismRepoBridge', '__agPrismThoughtBridge', '__agPrismUsageBridge', '__agPrismOmniBridge']) {
        try { window[k]?.dispose?.(); } catch {}
      }
      for (const id of [${JSON.stringify(STYLE_ID)},${JSON.stringify(LEGACY_STYLE_ID)},'ag-prism-settings-v101-css','ag-prism-studio-v101-css','ag-prism-omni-css','ag-prism-inline-diff-css']) {
        try { document.getElementById(id)?.remove(); } catch {}
      }
      try { document.querySelectorAll?.('[data-testid="prism-thought-ai-config"], [data-testid="prism-thought-general-config"], .ag-cs-ctx-menu, .ag-cs-ctx-toast, .ag-cs-inline-diff-box, .ag-cs-diff-ctx-menu')?.forEach?.((el) => el.remove()); } catch {}
      delete window.__agPrismThought;
      delete window.__agPrismThoughtSettingsUi;
      delete globalThis.__agPrismThoughtSettingsUi;
      delete window.__agPrismInlineDiff;
      delete globalThis.__agPrismInlineDiff;
      delete window.__agPrismInlineDiffFactory;
      delete globalThis.__agPrismInlineDiffFactory;
      delete window.__agPrismInlineDiffResolve;
      delete window.__agPrismOmni;
      delete window.__agPrismContextMenu;
      delete globalThis.__agPrismContextMenu;
      delete window.__agPrism;
      delete window.__agClaudeStyle;
    };

    const hasDomWorkbenchMarkers = () => {
      try {
        if (
          document.body &&
          document.body.classList &&
          (document.body.classList.contains('theme-standalone') || document.body.classList.contains('monaco-workbench'))
        ) {
          return true;
        }
        return Boolean(
          document.querySelector(
            '.agy-shell, .agy-home, [data-testid="aux-pane-split"], [data-testid="conversation-view"], [data-testid="agent-input-box"], [data-testid="model-selector-trigger"], .monaco-workbench'
          )
        );
      } catch {
        return false;
      }
    };

    const checkHostIdentity = () => {
      try {
        const loc = typeof window !== 'undefined' && window.location;
        const href = loc && typeof loc.href === 'string' ? loc.href : '';
        if (!href) return 'ok';
        const low = href.toLowerCase();
        if (low.startsWith('devtools://') || low.startsWith('data:') || low.startsWith('chrome:') || low.startsWith('chrome-extension:') || low.startsWith('edge:') || low.startsWith('blob:') || low.startsWith('plugin:')) {
          return 'reject';
        }
        if (low.startsWith('vscode-file://') || low.startsWith('app://') || low.startsWith('about:')) {
          const ttl = String(document.title || '').trim();
          return /^(?:untitled|launchpad)$/i.test(ttl) || /\\/launchpad(?:\\.html)?(?:[?#]|$)/i.test(low) ? 'reject' : 'ok';
        }
        const m = /^(https?):\\/\\/(127\\.0\\.0\\.1|localhost|\\[::1\\])(?::\\d+)?(\\/[^?#]*)?(?:[?#]|$)/i.exec(href);
        if (!m) {
          return low.startsWith('http:') || low.startsWith('https:') ? 'reject' : 'ok';
        }
        const pathname = (m[3] || '/').toLowerCase();
        if (/^\\/(?:viewer(?:\\/|$)|sandbox(?:\\/|$)|stream(?:\\/|$)|api(?:\\/|$))/.test(pathname)) {
          return 'reject';
        }
        if (hasDomWorkbenchMarkers()) return 'ok';
        const isPlainHttp = m[1].toLowerCase() === 'http';
        const rs = String(document.readyState || '');
        if (isPlainHttp) {
          return rs === 'loading' ? 'defer' : 'reject';
        }
        if (/\\bantigravity\\b/i.test(String(document.title || ''))) return 'ok';
        return rs === 'complete' ? 'reject' : 'ok';
      } catch {
        return 'ok';
      }
    };

    let status = 'ok';
    let mounted = false;
    const mount = () => {
      if (mounted || !document.documentElement) return;
      const hostVerdict = checkHostIdentity();
      if (hostVerdict === 'reject') {
        status = 'skipped-non-host';
        stripForeignMount();
        return;
      }
      if (hostVerdict === 'defer') {
        status = 'deferred';
        document.addEventListener('DOMContentLoaded', () => mount(), { once: true });
        return;
      }
      mounted = true;
      if (typeof window !== 'undefined' && window.addEventListener && String(document.readyState || '') !== 'complete') {
        window.addEventListener(
          'load',
          () => {
            if (checkHostIdentity() === 'reject') stripForeignMount();
          },
          { once: true }
        );
      }
      try {
        cleanupLegacyResidue();
        ensureRepoBridge();
        ensureThoughtBridge();
        ensureUsageBridge();
        if (document.head) applyStyle();
        else document.addEventListener('DOMContentLoaded', applyStyle, { once: true });
        const bootCfg = __AG_INJ_BOOTCFG__;
        const existingPrism = window.__agPrism || window.__agClaudeStyle;
        const bundleUnchanged = Boolean(
          existingPrism &&
            existingPrism.version === ${JSON.stringify(PLUGIN_VERSION)} &&
            existingPrism.codeHash === __AG_INJ_CODEHASH__ &&
            window.__agPrismTelemetry &&
            window.__agPrismEffortSlider
        );
        if (bundleUnchanged) {
          existingPrism.refreshConfig(bootCfg);
        } else {
          destroyModules(false);
          try {
            document.querySelectorAll('[data-ag-prism-fallback="1"]').forEach((n) => n.remove());
          } catch {}
          __AG_INJ_BUNDLE__();
          if (typeof globalThis.__agCsUiMain === 'function') {
            globalThis.__agCsUiMain(bootCfg);
          }
        }
        if (window.__agClaudeStyle && !window.__agPrism) {
          window.__agPrism = window.__agClaudeStyle;
        } else if (window.__agPrism) {
          window.__agClaudeStyle = window.__agPrism;
        }
        const liveState = window.__agPrism && typeof window.__agPrism.getState === 'function' ? window.__agPrism.getState() : null;
        const effectiveCfg = (liveState && liveState.cfg) || bootCfg;
        if (effectiveCfg?.omniModule === 'off') {
          try { window.__agPrismOmni?.destroy?.(); } catch {}
        } else {
          try { window.__agPrismOmni?.sync?.(effectiveCfg, window.__agPrismOmniServerMeta || null); } catch {}
        }
        if (document.documentElement) {
          if (!document.documentElement.hasAttribute('data-ag-prism')) document.documentElement.setAttribute('data-ag-prism', ${JSON.stringify(PLUGIN_VERSION)});
          if (effectiveCfg?.thoughtTranslate && effectiveCfg.thoughtTranslate !== 'off') document.documentElement.setAttribute('data-ag-prism-thought-view', effectiveCfg.thoughtView === 'bilingual' ? 'bilingual' : 'immersive');
          else document.documentElement.removeAttribute('data-ag-prism-thought-view');
        }
      } catch (e) {
        status = 'error: ' + (e && e.message ? e.message : String(e));
        if (typeof console !== 'undefined' && console.error) {
          console.error('[obsidian-prism] init error:', e);
        }
      }
    };

    if (document.documentElement) {
      mount();
    } else {
      status = 'deferred';
      const onReady = () => {
        if (document.documentElement) {
          document.removeEventListener('readystatechange', onReady);
          document.removeEventListener('DOMContentLoaded', onReady);
          mount();
        }
      };
      document.addEventListener('readystatechange', onReady);
      document.addEventListener('DOMContentLoaded', onReady);
    }
    const api = window.__agPrism || window.__agClaudeStyle;
    const st = api && typeof api.getState === 'function' ? api.getState() : null;
    return {
      version: ${JSON.stringify(PLUGIN_VERSION)},
      status,
      state: st,
    };
  })()`;
  _injectWrapperTemplate = minifySingleSource(rawTpl);
  return _injectWrapperTemplate;
}

function sha256Text(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

function getBundleSourceFiles() {
  const files = [
    { rel: 'cdp.js', fullPath: __filename, optional: false },
    { rel: 'style.css', fullPath: path.join(__dirname, 'style.css'), optional: false },
    { rel: 'assets/brand-mark-svg.js', fullPath: path.join(__dirname, 'assets', 'brand-mark-svg.js'), optional: true },
  ];
  for (const partName of RUNTIME_PARTS) {
    files.push({ rel: partName, fullPath: path.join(__dirname, partName), optional: false });
    if (partName === 'vendor/effort-slider/slider-coexist.js') {
      files.push({
        rel: 'vendor/effort-slider/upstream-client.js',
        fullPath: path.join(__dirname, 'vendor', 'effort-slider', 'upstream-client.js'),
        optional: true,
      });
    }
  }
  return files;
}

// 快速 stat 指纹（仅用于同进程热路径配合 _warmBaseCache 毫秒级刷新 config，跨进程冷启一律使用 SHA-256）
function getBundleSourceStatSig() {
  const parts = [];
  for (const item of getBundleSourceFiles()) {
    if (item.optional && !fs.existsSync(item.fullPath)) {
      parts.push(`${item.rel}:MISSING`);
      continue;
    }
    parts.push(`${item.rel}:${getFileSig(item.fullPath)}`);
  }
  return parts.join(';');
}

// 计算全部打包输入源文件的 SHA-256 内容指纹（100% 免疫 mtime 抖动与 git checkout）
function computeBundleSourceHash() {
  const hash = crypto.createHash('sha256');
  hash.update(`schema:${BUNDLE_CACHE_SCHEMA_VERSION}\0`);
  hash.update(`version:${PLUGIN_VERSION}\0`);
  hash.update(`consts:${STYLE_ID}:${LEGACY_STYLE_ID}:${SETTING_BINDING}\0`);
  for (const item of getBundleSourceFiles()) {
    hash.update(`file:${item.rel}\0`);
    if (item.optional && !fs.existsSync(item.fullPath)) {
      hash.update('MISSING\0');
      continue;
    }
    const buf = fs.readFileSync(item.fullPath);
    hash.update(`len:${buf.length}\0`);
    hash.update(buf);
    hash.update('\0');
  }
  return hash.digest('hex');
}

// 计算规范化后的有效 bootCfg 指纹（确保缓存命中输出与现场编译逐字节 100% 一致）
function computeBundleConfigHash(config) {
  const effective = {
    ...(config && typeof config === 'object' ? config : {}),
    binding: SETTING_BINDING,
    codeHash: '',
    __fromFile: true,
  };
  const serialized = JSON.stringify(effective);
  return crypto
    .createHash('sha256')
    .update(`cfg:v${BUNDLE_CACHE_SCHEMA_VERSION}\0`)
    .update(serialized)
    .digest('hex');
}

function resolveBundleCachePathOption(opts) {
  if (opts && (opts.cachePath === false || opts.cachePath === null || opts.noDiskCache === true)) {
    return null;
  }
  if (opts && typeof opts.cachePath === 'string') {
    const trimmed = opts.cachePath.trim();
    return trimmed ? path.resolve(trimmed) : null;
  }
  const envRaw = process.env.AG_PRISM_BUNDLE_CACHE_PATH;
  if (typeof envRaw === 'string' && envRaw.trim()) {
    const trimmed = envRaw.trim();
    if (/^(?:0|off|false|none)$/i.test(trimmed)) return null;
    return path.resolve(trimmed);
  }
  return null;
}

function isSymlinkPathSync(targetPath) {
  try {
    return fs.lstatSync(targetPath).isSymbolicLink();
  } catch (err) {
    if (err && err.code === 'ENOENT') return false;
    return true;
  }
}

function isValidBundleBaseTemplate(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  const hasOwn = (k) => Object.prototype.hasOwnProperty.call(parsed, k);
  if (!hasOwn('codeHash') || typeof parsed.codeHash !== 'string' || !CODE_HASH_RE.test(parsed.codeHash)) {
    return false;
  }
  if (!hasOwn('basePrefix') || typeof parsed.basePrefix !== 'string' || parsed.basePrefix.length === 0) {
    return false;
  }
  if (!hasOwn('baseSuffix') || typeof parsed.baseSuffix !== 'string' || parsed.baseSuffix.length === 0) {
    return false;
  }
  if (!hasOwn('baseSha256') || typeof parsed.baseSha256 !== 'string' || !SHA256_HEX_RE.test(parsed.baseSha256)) {
    return false;
  }
  const totalBytes = Buffer.byteLength(parsed.basePrefix, 'utf8') + Buffer.byteLength(parsed.baseSuffix, 'utf8');
  if (totalBytes <= 0 || totalBytes > BUNDLE_CACHE_MAX_EXPR_BYTES) return false;
  if (!parsed.baseSuffix.includes(JSON.stringify(parsed.codeHash))) return false;
  if (sha256Text(`${parsed.basePrefix}\0${parsed.baseSuffix}`) !== parsed.baseSha256) return false;
  return true;
}

function isValidBundleCacheEntry(entry, baseTemplate) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
  if (!baseTemplate) return false;
  const hasOwn = (k) => Object.prototype.hasOwnProperty.call(entry, k);
  if (!hasOwn('configHash') || typeof entry.configHash !== 'string' || !SHA256_HEX_RE.test(entry.configHash)) {
    return false;
  }
  if (
    !hasOwn('codeHash') ||
    typeof entry.codeHash !== 'string' ||
    !CODE_HASH_RE.test(entry.codeHash) ||
    entry.codeHash !== baseTemplate.codeHash
  ) {
    return false;
  }
  if (!hasOwn('exprSha256') || typeof entry.exprSha256 !== 'string' || !SHA256_HEX_RE.test(entry.exprSha256)) {
    return false;
  }
  if (!hasOwn('bootCfgJson') || typeof entry.bootCfgJson !== 'string' || entry.bootCfgJson.length === 0) {
    return false;
  }
  const cfgBytes = Buffer.byteLength(entry.bootCfgJson, 'utf8');
  if (cfgBytes <= 0 || cfgBytes > BUNDLE_CACHE_MAX_BOOTCFG_BYTES) return false;
  if (!entry.bootCfgJson.includes(`"codeHash":${JSON.stringify(entry.codeHash)}`)) return false;
  const assembled = baseTemplate.basePrefix + entry.bootCfgJson + baseTemplate.baseSuffix;
  const exprBytes = Buffer.byteLength(assembled, 'utf8');
  if (exprBytes <= 0 || exprBytes > BUNDLE_CACHE_MAX_EXPR_BYTES) return false;
  if (sha256Text(assembled) !== entry.exprSha256) return false;
  return true;
}

function loadVerifiedBundleCacheRootSync(cachePath, bypassMemCache = false) {
  const resolved = path.resolve(cachePath);
  const dir = path.dirname(resolved);
  if (isSymlinkPathSync(dir)) {
    invalidateBundleCacheRootCache(resolved);
    return { ok: false, reason: 'symlink-dir', parsed: null, fromMemCache: false };
  }
  let st;
  try {
    st = fs.lstatSync(resolved);
  } catch (err) {
    invalidateBundleCacheRootCache(resolved);
    if (err && err.code === 'ENOENT') {
      return { ok: false, reason: 'missing', parsed: null, fromMemCache: false };
    }
    return { ok: false, reason: 'stat-error', parsed: null, fromMemCache: false };
  }
  if (st.isSymbolicLink() || !st.isFile()) {
    invalidateBundleCacheRootCache(resolved);
    return { ok: false, reason: 'not-regular-file', parsed: null, fromMemCache: false };
  }
  if (st.size <= 0 || st.size > BUNDLE_CACHE_MAX_FILE_BYTES) {
    invalidateBundleCacheRootCache(resolved);
    return { ok: false, reason: 'size-out-of-range', parsed: null, fromMemCache: false };
  }
  const sig = `${st.mtimeMs}:${st.size}:${st.ctimeMs}:${st.ino || 0}`;
  const now = Date.now();
  if (
    !bypassMemCache &&
    _bundleCacheRootCache.parsed &&
    _bundleCacheRootCache.resolved === resolved &&
    _bundleCacheRootCache.sig === sig &&
    now >= _bundleCacheRootCache.cachedAt &&
    now - _bundleCacheRootCache.cachedAt <= BUNDLE_CACHE_ROOT_MEM_TTL_MS
  ) {
    return { ok: true, parsed: _bundleCacheRootCache.parsed, fromMemCache: true };
  }
  let parsed;
  try {
    const raw = fs.readFileSync(resolved, 'utf8');
    parsed = JSON.parse(raw);
  } catch {
    invalidateBundleCacheRootCache(resolved);
    return { ok: false, reason: 'parse-or-read-error', parsed: null, fromMemCache: false };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    invalidateBundleCacheRootCache(resolved);
    return { ok: false, reason: 'invalid-root', parsed: null, fromMemCache: false };
  }
  const hasOwn = (k) => Object.prototype.hasOwnProperty.call(parsed, k);
  if (!hasOwn('schemaVersion') || parsed.schemaVersion !== BUNDLE_CACHE_SCHEMA_VERSION) {
    invalidateBundleCacheRootCache(resolved);
    return { ok: false, reason: 'schema-mismatch', parsed: null, fromMemCache: false };
  }
  if (!hasOwn('pluginVersion') || parsed.pluginVersion !== PLUGIN_VERSION) {
    invalidateBundleCacheRootCache(resolved);
    return { ok: false, reason: 'version-mismatch', parsed: null, fromMemCache: false };
  }
  freezeBundleCacheRoot(parsed);
  _bundleCacheRootCache = {
    resolved,
    sig,
    cachedAt: now,
    parsed,
  };
  return { ok: true, parsed, fromMemCache: false };
}

function tryReadBundleCacheHitSync(cachePath, expectedSourceHash, expectedConfigHash) {
  try {
    const resolved = path.resolve(cachePath);
    for (let attempt = 0; attempt < 2; attempt++) {
      const loaded = loadVerifiedBundleCacheRootSync(resolved, attempt > 0);
      if (!loaded.ok) {
        return { hit: false, reason: loaded.reason, existingEntries: [], baseTemplate: null };
      }
      const parsed = loaded.parsed;
      const hasOwn = (k) => Object.prototype.hasOwnProperty.call(parsed, k);
      if (
        !hasOwn('sourceHash') ||
        typeof parsed.sourceHash !== 'string' ||
        !SHA256_HEX_RE.test(parsed.sourceHash) ||
        parsed.sourceHash !== expectedSourceHash
      ) {
        invalidateBundleCacheRootCache(resolved);
        if (loaded.fromMemCache && attempt === 0) continue;
        return { hit: false, reason: 'source-hash-mismatch', existingEntries: [], baseTemplate: null };
      }
      if (!hasOwn('entries') || !Array.isArray(parsed.entries)) {
        invalidateBundleCacheRootCache(resolved);
        if (loaded.fromMemCache && attempt === 0) continue;
        return { hit: false, reason: 'invalid-entries', existingEntries: [], baseTemplate: null };
      }
      if (!isValidBundleBaseTemplate(parsed)) {
        invalidateBundleCacheRootCache(resolved);
        if (loaded.fromMemCache && attempt === 0) continue;
        return { hit: false, reason: 'invalid-base-template', existingEntries: [], baseTemplate: null };
      }
      const baseTemplate = {
        codeHash: parsed.codeHash,
        basePrefix: parsed.basePrefix,
        baseSuffix: parsed.baseSuffix,
        baseSha256: parsed.baseSha256,
      };
      let retryFromDisk = false;
      for (const ent of parsed.entries) {
        if (
          ent &&
          typeof ent === 'object' &&
          !Array.isArray(ent) &&
          Object.prototype.hasOwnProperty.call(ent, 'configHash') &&
          ent.configHash === expectedConfigHash
        ) {
          if (isValidBundleCacheEntry(ent, baseTemplate)) {
            return {
              hit: true,
              reason: 'hit',
              expr: baseTemplate.basePrefix + ent.bootCfgJson + baseTemplate.baseSuffix,
              codeHash: ent.codeHash,
              existingEntries: [],
              baseTemplate,
            };
          }
          invalidateBundleCacheRootCache(resolved);
          if (loaded.fromMemCache && attempt === 0) {
            retryFromDisk = true;
            break;
          }
          return { hit: false, reason: 'corrupt-matching-entry', existingEntries: [], baseTemplate: null };
        }
      }
      if (retryFromDisk) continue;
      return { hit: false, reason: 'config-miss', existingEntries: parsed.entries, baseTemplate };
    }
    return { hit: false, reason: 'corrupt-matching-entry', existingEntries: [], baseTemplate: null };
  } catch {
    invalidateBundleCacheRootCache(cachePath);
    return { hit: false, reason: 'parse-or-read-error', existingEntries: [], baseTemplate: null };
  }
}

function writeBundleCacheAtomicSync(cachePath, payloadObj) {
  let tmpPath = null;
  let fd = null;
  try {
    const resolved = path.resolve(cachePath);
    const dir = path.dirname(resolved);
    if (isSymlinkPathSync(dir) || isSymlinkPathSync(resolved)) {
      return false;
    }
    fs.mkdirSync(dir, { recursive: true });
    const dirStat = fs.lstatSync(dir);
    if (dirStat.isSymbolicLink() || !dirStat.isDirectory()) {
      return false;
    }
    try {
      const existingStat = fs.lstatSync(resolved);
      if (existingStat.isSymbolicLink() || !existingStat.isFile()) {
        return false;
      }
    } catch (err) {
      if (!err || err.code !== 'ENOENT') return false;
    }

    const jsonText = JSON.stringify(payloadObj);
    if (Buffer.byteLength(jsonText, 'utf8') > BUNDLE_CACHE_MAX_FILE_BYTES) {
      return false;
    }

    const base = path.basename(resolved);
    const safeBase = base.startsWith('.') ? base.slice(1) : base;
    const rand = crypto.randomBytes(6).toString('hex');
    tmpPath = path.join(dir, `.${safeBase}.${process.pid}.${rand}.tmp`);
    fd = fs.openSync(tmpPath, 'wx', 0o600);
    fs.writeFileSync(fd, jsonText, 'utf8');
    fs.closeSync(fd);
    fd = null;
    try { fs.chmodSync(tmpPath, 0o600); } catch {}

    if (isSymlinkPathSync(dir) || isSymlinkPathSync(resolved)) {
      try { fs.unlinkSync(tmpPath); } catch {}
      return false;
    }

    let renamed = false;
    let lastErr = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        fs.renameSync(tmpPath, resolved);
        renamed = true;
        break;
      } catch (err) {
        lastErr = err;
        if (!IS_WIN || !['EBUSY', 'EPERM', 'EACCES', 'EEXIST'].includes(err && err.code)) {
          throw err;
        }
      }
    }
    if (!renamed) {
      if (IS_WIN && ['EBUSY', 'EPERM', 'EACCES', 'EEXIST'].includes(lastErr && lastErr.code)) {
        if (isSymlinkPathSync(dir) || isSymlinkPathSync(resolved)) {
          try { fs.unlinkSync(tmpPath); } catch {}
          return false;
        }
        fs.copyFileSync(tmpPath, resolved);
        try { fs.unlinkSync(tmpPath); } catch {}
      } else {
        throw lastErr;
      }
    }
    try { fs.chmodSync(resolved, 0o600); } catch {}
    invalidateBundleCacheRootCache(resolved);
    return true;
  } catch {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch {}
    }
    if (tmpPath) {
      try { fs.unlinkSync(tmpPath); } catch {}
    }
    invalidateBundleCacheRootCache(cachePath);
    return false;
  }
}

function getBundleCacheStats() {
  return {
    ..._bundleCacheStats,
    channelHitsByName: { ..._bundleCacheStats.channelHitsByName },
  };
}

function resetBundleCacheStats() {
  _bundleCacheStats.diskHits = 0;
  _bundleCacheStats.diskBaseHits = 0;
  _bundleCacheStats.diskMisses = 0;
  _bundleCacheStats.diskWrites = 0;
  _bundleCacheStats.diskWriteFailures = 0;
  _bundleCacheStats.diskReadFallbacks = 0;
  _bundleCacheStats.compileUnifiedRuns = 0;
  _bundleCacheStats.mangledUnitRuns = 0;
  _bundleCacheStats.cssMinifyRuns = 0;
  _bundleCacheStats.deferredExprHashRuns = 0;
  _bundleCacheStats.channelDiskHits = 0;
  _bundleCacheStats.channelDiskMisses = 0;
  _bundleCacheStats.channelCompileRuns = 0;
  _bundleCacheStats.channelHitsByName = { omni: 0, sidebar: 0, hostI18n: 0, thought: 0, inlineDiff: 0, wallpaper: 0 };
  _bundleCacheStats.lastOutcome = 'none';
  _bundleCacheStats.lastCachePath = null;
  try { _omniClientCache.cachedPaths?.clear?.(); } catch {}
  try { _sidebarClientCache.cachedPaths?.clear?.(); } catch {}
  try { _hostI18nCache.cachedPaths?.clear?.(); } catch {}
  try { _thoughtAssetsCache.cachedPaths?.clear?.(); } catch {}
  try { _inlineDiffClientCache.cachedPaths?.clear?.(); } catch {}
  try { _wallpaperAssetsCache.cachedPaths?.clear?.(); } catch {}
  invalidateBundleCacheRootCache();
}

function getCdpSelfSourceHash() {
  try {
    const sig = getFileSig(__filename);
    if (_cdpSelfHashCache.sig === sig && _cdpSelfHashCache.hash) {
      return _cdpSelfHashCache.hash;
    }
    const hash = crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex');
    _cdpSelfHashCache = { sig, hash };
    return hash;
  } catch {
    return PLUGIN_VERSION;
  }
}

function computeChannelSourceHash(channelName, fileEntries, extraTag = '') {
  const hash = crypto.createHash('sha256');
  hash.update(`schema:${BUNDLE_CACHE_SCHEMA_VERSION}\0version:${PLUGIN_VERSION}\0channel:${channelName}\0`);
  hash.update(`cdp:${getCdpSelfSourceHash()}\0`);
  if (extraTag) {
    hash.update(`extra:${extraTag}\0`);
  }
  for (const item of fileEntries) {
    hash.update(`file:${item.rel}\0`);
    const buf = Buffer.isBuffer(item.content) ? item.content : Buffer.from(String(item.content || ''), 'utf8');
    hash.update(`len:${buf.length}\0`);
    hash.update(buf);
    hash.update('\0');
  }
  return hash.digest('hex');
}

function isValidChannelCacheEntry(channelName, entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
  const hasOwn = (k) => Object.prototype.hasOwnProperty.call(entry, k);
  if (!hasOwn('sourceHash') || typeof entry.sourceHash !== 'string' || !SHA256_HEX_RE.test(entry.sourceHash)) {
    return false;
  }
  if (!hasOwn('codeHash') || typeof entry.codeHash !== 'string' || !CODE_HASH_RE.test(entry.codeHash)) {
    return false;
  }
  if (!hasOwn('payloadSha256') || typeof entry.payloadSha256 !== 'string' || !SHA256_HEX_RE.test(entry.payloadSha256)) {
    return false;
  }
  if (channelName === 'omni' || channelName === 'sidebar' || channelName === 'inlineDiff') {
    if (!hasOwn('minCode') || typeof entry.minCode !== 'string' || entry.minCode.length === 0) return false;
    if (Buffer.byteLength(entry.minCode, 'utf8') > CHANNEL_CACHE_MAX_PAYLOAD_BYTES) return false;
    if (channelName === 'sidebar' && /setPrefValues?/i.test(entry.minCode)) return false;
    if (computeHash(entry.minCode) !== entry.codeHash) return false;
    return sha256Text(`${entry.codeHash}\0${entry.minCode}`) === entry.payloadSha256;
  }
  if (channelName === 'hostI18n') {
    if (!hasOwn('minRuntime') || typeof entry.minRuntime !== 'string' || entry.minRuntime.length === 0) return false;
    if (!hasOwn('dictRaw') || typeof entry.dictRaw !== 'string' || entry.dictRaw.length === 0) return false;
    const totalBytes = Buffer.byteLength(entry.minRuntime, 'utf8') + Buffer.byteLength(entry.dictRaw, 'utf8');
    if (totalBytes > CHANNEL_CACHE_MAX_PAYLOAD_BYTES) return false;
    if (computeHash(`${entry.minRuntime}:${entry.dictRaw}`) !== entry.codeHash) return false;
    return sha256Text(`${entry.codeHash}\0${entry.minRuntime}\0${entry.dictRaw}`) === entry.payloadSha256;
  }
  if (channelName === 'thought' || channelName === 'wallpaper') {
    if (!hasOwn('minClient') || typeof entry.minClient !== 'string' || entry.minClient.length === 0) return false;
    if (!hasOwn('minSettingsUi') || typeof entry.minSettingsUi !== 'string' || entry.minSettingsUi.length === 0) return false;
    const totalBytes = Buffer.byteLength(entry.minClient, 'utf8') + Buffer.byteLength(entry.minSettingsUi, 'utf8');
    if (totalBytes > CHANNEL_CACHE_MAX_PAYLOAD_BYTES) return false;
    if (computeHash(`${entry.minClient}\n${entry.minSettingsUi}`) !== entry.codeHash) return false;
    return sha256Text(`${entry.codeHash}\0${entry.minClient}\0${entry.minSettingsUi}`) === entry.payloadSha256;
  }
  return false;
}

function readValidBundleCacheRootSync(cachePath, bypassMemCache = false) {
  try {
    const loaded = loadVerifiedBundleCacheRootSync(cachePath, bypassMemCache);
    return loaded.ok ? loaded.parsed : null;
  } catch {
    invalidateBundleCacheRootCache(cachePath);
    return null;
  }
}

function extractValidChannelsMap(rawChannels) {
  const out = {};
  if (!rawChannels || typeof rawChannels !== 'object' || Array.isArray(rawChannels)) {
    return out;
  }
  for (const name of CHANNEL_CACHE_NAMES) {
    if (!Object.prototype.hasOwnProperty.call(rawChannels, name)) continue;
    const ent = rawChannels[name];
    if (isValidChannelCacheEntry(name, ent)) {
      out[name] = ent;
    }
  }
  return out;
}

function tryReadChannelCacheHitSync(cachePath, channelName, expectedSourceHash) {
  const resolved = path.resolve(cachePath);
  for (let attempt = 0; attempt < 2; attempt++) {
    const loaded = loadVerifiedBundleCacheRootSync(resolved, attempt > 0);
    if (!loaded.ok || !loaded.parsed) {
      return { hit: false, reason: 'missing' };
    }
    const root = loaded.parsed;
    if (!root.channels || typeof root.channels !== 'object' || Array.isArray(root.channels)) {
      return { hit: false, reason: 'missing' };
    }
    if (!Object.prototype.hasOwnProperty.call(root.channels, channelName)) {
      return { hit: false, reason: 'channel-missing' };
    }
    const ent = root.channels[channelName];
    if (!ent || typeof ent !== 'object' || ent.sourceHash !== expectedSourceHash) {
      invalidateBundleCacheRootCache(resolved);
      if (loaded.fromMemCache && attempt === 0) continue;
      return { hit: false, reason: 'source-hash-mismatch' };
    }
    if (!isValidChannelCacheEntry(channelName, ent)) {
      invalidateBundleCacheRootCache(resolved);
      if (loaded.fromMemCache && attempt === 0) continue;
      return { hit: false, reason: 'corrupt-channel-entry' };
    }
    return { hit: true, entry: ent };
  }
  return { hit: false, reason: 'corrupt-channel-entry' };
}

function queuePendingChannelCacheWrite(cachePath, channelName, record) {
  if (!cachePath || !channelName || !record) return;
  const resolved = path.resolve(cachePath);
  let bucket = _pendingChannelCacheWrites.get(resolved);
  if (!bucket) {
    bucket = {};
    _pendingChannelCacheWrites.set(resolved, bucket);
  }
  bucket[channelName] = record;
}

function persistChannelsOnlySync(cachePath, channelUpdates) {
  if (!cachePath || !channelUpdates || typeof channelUpdates !== 'object') return false;
  const resolved = path.resolve(cachePath);
  const existing = readValidBundleCacheRootSync(resolved);
  const mergedChannels = {
    ...extractValidChannelsMap(existing?.channels),
    ...extractValidChannelsMap(channelUpdates),
  };
  if (Object.keys(mergedChannels).length === 0) return false;
  const payload =
    existing &&
    typeof existing.sourceHash === 'string' &&
    SHA256_HEX_RE.test(existing.sourceHash) &&
    Array.isArray(existing.entries) &&
    isValidBundleBaseTemplate(existing)
      ? {
          schemaVersion: BUNDLE_CACHE_SCHEMA_VERSION,
          pluginVersion: PLUGIN_VERSION,
          sourceHash: existing.sourceHash,
          codeHash: existing.codeHash,
          basePrefix: existing.basePrefix,
          baseSuffix: existing.baseSuffix,
          baseSha256: existing.baseSha256,
          entries: existing.entries,
          channels: mergedChannels,
        }
      : {
          schemaVersion: BUNDLE_CACHE_SCHEMA_VERSION,
          pluginVersion: PLUGIN_VERSION,
          channels: mergedChannels,
        };
  if (writeBundleCacheAtomicSync(resolved, payload)) {
    _bundleCacheStats.diskWrites += 1;
    return true;
  }
  _bundleCacheStats.diskWriteFailures += 1;
  return false;
}

function resolveChannelAssetsWithDiskCache({
  channelName,
  memCache,
  setMemCache,
  sig,
  fileEntries,
  extraTag = '',
  opts = null,
  compileFn,
  toCacheEntry,
  fromCacheEntry,
}) {
  const cachePath = resolveBundleCachePathOption(opts);
  const deferCacheWrite = Boolean(opts && opts.deferCacheWrite === true);
  if (!cachePath) {
    if (memCache && memCache.sig === sig && memCache.codeHash) {
      return memCache;
    }
    _bundleCacheStats.channelCompileRuns += 1;
    const compiled = compileFn();
    const nextMem = { ...compiled, sig, sourceHash: '', cachedPaths: new Set() };
    setMemCache(nextMem);
    return nextMem;
  }

  const resolvedCachePath = path.resolve(cachePath);
  _bundleCacheStats.lastCachePath = resolvedCachePath;
  const sourceHash = computeChannelSourceHash(channelName, fileEntries, extraTag);

  if (
    memCache &&
    memCache.sourceHash === sourceHash &&
    memCache.cachedPaths &&
    memCache.cachedPaths.has(resolvedCachePath)
  ) {
    return memCache;
  }

  const diskHit = tryReadChannelCacheHitSync(resolvedCachePath, channelName, sourceHash);
  if (diskHit.hit) {
    _bundleCacheStats.channelDiskHits += 1;
    _bundleCacheStats.channelHitsByName[channelName] =
      (_bundleCacheStats.channelHitsByName[channelName] || 0) + 1;
    const restored = fromCacheEntry(diskHit.entry);
    const cachedPaths =
      memCache && memCache.sourceHash === sourceHash && memCache.cachedPaths
        ? memCache.cachedPaths
        : new Set();
    cachedPaths.add(resolvedCachePath);
    const nextMem = { ...restored, sig, sourceHash, cachedPaths };
    setMemCache(nextMem);
    return nextMem;
  }

  _bundleCacheStats.channelDiskMisses += 1;
  let assets;
  if (memCache && memCache.sourceHash === sourceHash && memCache.codeHash) {
    assets = memCache;
  } else {
    _bundleCacheStats.channelCompileRuns += 1;
    assets = compileFn();
  }
  const record = toCacheEntry(assets, sourceHash);
  const cachedPaths =
    memCache && memCache.sourceHash === sourceHash && memCache.cachedPaths
      ? memCache.cachedPaths
      : new Set();
  if (deferCacheWrite) {
    queuePendingChannelCacheWrite(resolvedCachePath, channelName, record);
  } else if (persistChannelsOnlySync(resolvedCachePath, { [channelName]: record })) {
    cachedPaths.add(resolvedCachePath);
  }
  const nextMem = { ...assets, sig, sourceHash, cachedPaths };
  setMemCache(nextMem);
  return nextMem;
}

function compileBaseInjectTemplate() {
  const packedCss = readPackedCssExpr();
  const bundle = readRuntimeBundle();
  const codeHash = computeHash(bundle);
  const cssHashJson = JSON.stringify(computeHash(packedCss));
  const codeHashJson = JSON.stringify(codeHash);
  const tpl = getInjectWrapperTemplate();
  const marker = '__AG_INJ_BOOTCFG__';
  const idx = tpl.indexOf(marker);
  const hasUniqueMarker = idx >= 0 && tpl.indexOf(marker, idx + marker.length) === -1;
  if (hasUniqueMarker) {
    const tokenMap = {
      __AG_INJ_CSS__: packedCss,
      __AG_INJ_CSSHASH__: cssHashJson,
      __AG_INJ_CODEHASH__: codeHashJson,
      '__AG_INJ_BUNDLE__();': bundle,
    };
    const applyTokens = (s) =>
      s.replace(/__AG_INJ_CSSHASH__|__AG_INJ_CSS__|__AG_INJ_CODEHASH__|__AG_INJ_BUNDLE__\(\);/g, (m) => tokenMap[m]);
    const basePrefix = applyTokens(tpl.slice(0, idx));
    const baseSuffix = applyTokens(tpl.slice(idx + marker.length));
    const baseSha256 = sha256Text(`${basePrefix}\0${baseSuffix}`);
    return { codeHash, basePrefix, baseSuffix, baseSha256 };
  }
  return { codeHash, basePrefix: null, baseSuffix: null, baseSha256: null, packedCss, bundle, cssHashJson, codeHashJson };
}

function persistBundleCacheRecordSync(
  cachePath,
  sourceHash,
  baseForDisk,
  newEntry,
  existingRawEntries = null,
  extraChannels = null
) {
  if (!cachePath || !sourceHash || !baseForDisk || !newEntry) return false;
  const resolved = path.resolve(cachePath);
  let rawEntries = Array.isArray(existingRawEntries) ? existingRawEntries : null;
  let existingChannels = {};
  const existingRoot = readValidBundleCacheRootSync(resolved);
  if (existingRoot) {
    existingChannels = extractValidChannelsMap(existingRoot.channels);
    if (rawEntries === null && existingRoot.sourceHash === sourceHash && Array.isArray(existingRoot.entries)) {
      rawEntries = existingRoot.entries;
    }
  }
  if (rawEntries === null) {
    rawEntries = [];
  }
  const retained = [];
  const seen = new Set([newEntry.configHash]);
  for (const rawEnt of rawEntries) {
    if (retained.length >= BUNDLE_CACHE_MAX_ENTRIES - 1) break;
    if (
      rawEnt &&
      typeof rawEnt === 'object' &&
      !Array.isArray(rawEnt) &&
      Object.prototype.hasOwnProperty.call(rawEnt, 'configHash') &&
      typeof rawEnt.configHash === 'string' &&
      !seen.has(rawEnt.configHash) &&
      isValidBundleCacheEntry(rawEnt, baseForDisk)
    ) {
      seen.add(rawEnt.configHash);
      retained.push({
        configHash: rawEnt.configHash,
        codeHash: rawEnt.codeHash,
        bootCfgJson: rawEnt.bootCfgJson,
        exprSha256: rawEnt.exprSha256,
        updatedAt: Number.isFinite(Number(rawEnt.updatedAt)) ? Number(rawEnt.updatedAt) : 0,
      });
    }
  }
  const pendingForPath = _pendingChannelCacheWrites.get(resolved) || null;
  if (pendingForPath) {
    _pendingChannelCacheWrites.delete(resolved);
  }
  const mergedChannels = {
    ...existingChannels,
    ...extractValidChannelsMap(pendingForPath),
    ...extractValidChannelsMap(extraChannels),
  };
  const payload = {
    schemaVersion: BUNDLE_CACHE_SCHEMA_VERSION,
    pluginVersion: PLUGIN_VERSION,
    sourceHash,
    codeHash: baseForDisk.codeHash,
    basePrefix: baseForDisk.basePrefix,
    baseSuffix: baseForDisk.baseSuffix,
    baseSha256: baseForDisk.baseSha256,
    entries: [newEntry, ...retained],
    ...(Object.keys(mergedChannels).length > 0 ? { channels: mergedChannels } : {}),
  };
  if (writeBundleCacheAtomicSync(resolved, payload)) {
    _bundleCacheStats.diskWrites += 1;
    return true;
  }
  _bundleCacheStats.diskWriteFailures += 1;
  return false;
}

function markChannelCachedOnPath(cachePath, chMap) {
  if (!cachePath || !chMap || typeof chMap !== 'object') return;
  const resolved = path.resolve(cachePath);
  const byName = {
    omni: _omniClientCache,
    sidebar: _sidebarClientCache,
    hostI18n: _hostI18nCache,
    thought: _thoughtAssetsCache,
    inlineDiff: _inlineDiffClientCache,
    wallpaper: _wallpaperAssetsCache,
  };
  for (const name of CHANNEL_CACHE_NAMES) {
    const rec = chMap[name];
    const mem = byName[name];
    if (rec && mem && mem.sourceHash && mem.sourceHash === rec.sourceHash && mem.cachedPaths) {
      mem.cachedPaths.add(resolved);
    }
  }
}

function flushPendingBundleCache() {
  const pending = _pendingDiskCachePersist;
  _pendingDiskCachePersist = null;
  const pendingChannelsSnapshot = new Map(_pendingChannelCacheWrites);
  _pendingChannelCacheWrites.clear();

  let anyWritten = false;
  if (pending) {
    const resolved = path.resolve(pending.cachePath);
    const matchedChannels = pendingChannelsSnapshot.get(resolved) || null;
    if (matchedChannels) {
      pendingChannelsSnapshot.delete(resolved);
    }
    if (!pending.newEntry.exprSha256) {
      const exprText =
        typeof pending.deferredExpr === 'string'
          ? pending.deferredExpr
          : pending.baseForDisk.basePrefix + pending.newEntry.bootCfgJson + pending.baseForDisk.baseSuffix;
      pending.newEntry.exprSha256 = sha256Text(exprText);
      _bundleCacheStats.deferredExprHashRuns += 1;
    }
    if (
      persistBundleCacheRecordSync(
        resolved,
        pending.sourceHash,
        pending.baseForDisk,
        pending.newEntry,
        null,
        matchedChannels
      )
    ) {
      markChannelCachedOnPath(resolved, matchedChannels);
      anyWritten = true;
    }
  }

  for (const [chPath, chMap] of pendingChannelsSnapshot.entries()) {
    if (persistChannelsOnlySync(chPath, chMap)) {
      markChannelCachedOnPath(chPath, chMap);
      anyWritten = true;
    }
  }
  return anyWritten;
}

function buildInjectExpression(customConfig, opts = null) {
  const config = customConfig ? reconcileConfigAliases(customConfig) : readConfig();
  const cachePath = resolveBundleCachePathOption(opts);
  const deferCacheWrite = Boolean(opts && opts.deferCacheWrite === true);

  // 同进程配置热刷新快路径（broadcastConfigRefresh）：源 stat 未变化时直接复用已验签的内存基础模板（< 1ms，零磁盘阻塞）
  // P2-7a: 延迟对 676 KB 字符串计算 exprSha256 至 flushPendingBundleCache() 实际落盘时再执行，避免防抖期内重复白算哈希
  if (cachePath && deferCacheWrite && _warmBaseCache.basePrefix && _warmBaseCache.statSig) {
    try {
      if (getBundleSourceStatSig() === _warmBaseCache.statSig) {
        const codeHash = _warmBaseCache.codeHash;
        const bootCfgJson = JSON.stringify({ ...config, binding: SETTING_BINDING, codeHash, __fromFile: true });
        const expr = _warmBaseCache.basePrefix + bootCfgJson + _warmBaseCache.baseSuffix;
        const configHash = computeBundleConfigHash(config);
        _bundleCacheStats.diskBaseHits += 1;
        _bundleCacheStats.lastOutcome = 'warm-base-hit';
        _bundleCacheStats.lastCachePath = cachePath;
        _pendingDiskCachePersist = {
          cachePath,
          sourceHash: _warmBaseCache.sourceHash,
          baseForDisk: {
            codeHash,
            basePrefix: _warmBaseCache.basePrefix,
            baseSuffix: _warmBaseCache.baseSuffix,
            baseSha256: _warmBaseCache.baseSha256,
          },
          newEntry: {
            configHash,
            codeHash,
            bootCfgJson,
            exprSha256: null,
            updatedAt: Date.now(),
          },
          deferredExpr: expr,
        };
        return expr;
      }
    } catch {}
  }

  let sourceHash = '';
  let configHash = '';
  let existingRawEntries = [];
  let cachedBaseTemplate = null;
  let forceInvalidateMem = false;

  if (cachePath) {
    _bundleCacheStats.lastCachePath = cachePath;
    try {
      sourceHash = computeBundleSourceHash();
      configHash = computeBundleConfigHash(config);
      const lookup = tryReadBundleCacheHitSync(cachePath, sourceHash, configHash);
      if (lookup.hit) {
        _bundleCacheStats.diskHits += 1;
        _bundleCacheStats.lastOutcome = 'disk-hit';
        _diskCacheLastSource = { sourceHash, codeHash: lookup.codeHash };
        if (lookup.baseTemplate) {
          try {
            _warmBaseCache = {
              statSig: getBundleSourceStatSig(),
              sourceHash,
              ...lookup.baseTemplate,
            };
          } catch {}
        }
        return lookup.expr;
      }
      _bundleCacheStats.diskMisses += 1;
      if (lookup.reason === 'source-hash-mismatch') {
        forceInvalidateMem = true;
      } else if (lookup.reason !== 'missing' && lookup.reason !== 'config-miss') {
        _bundleCacheStats.diskReadFallbacks += 1;
      }
      if (Array.isArray(lookup.existingEntries)) {
        existingRawEntries = lookup.existingEntries;
      }
      if (lookup.reason === 'config-miss' && lookup.baseTemplate) {
        cachedBaseTemplate = lookup.baseTemplate;
      }
    } catch {
      _bundleCacheStats.diskMisses += 1;
      _bundleCacheStats.diskReadFallbacks += 1;
      sourceHash = '';
      configHash = '';
      existingRawEntries = [];
      cachedBaseTemplate = null;
    }
  }

  let codeHash = '';
  let bootCfgJson = '';
  let expr = '';
  let baseForDisk = null;

  if (cachedBaseTemplate) {
    codeHash = cachedBaseTemplate.codeHash;
    bootCfgJson = JSON.stringify({ ...config, binding: SETTING_BINDING, codeHash, __fromFile: true });
    expr = cachedBaseTemplate.basePrefix + bootCfgJson + cachedBaseTemplate.baseSuffix;
    baseForDisk = cachedBaseTemplate;
    _bundleCacheStats.diskBaseHits += 1;
    _bundleCacheStats.lastOutcome = 'disk-base-hit';
  } else {
    if (forceInvalidateMem || (sourceHash && _lastCompiledSourceHash && sourceHash !== _lastCompiledSourceHash)) {
      _cssCache = { sig: '', minCss: '', packedExpr: '' };
      _unifiedBundleCache = { sig: '', bundleCode: '', partCodeByName: new Map() };
      _mangledUnitCache.clear();
    }

    const compiledBase = compileBaseInjectTemplate();
    codeHash = compiledBase.codeHash;
    bootCfgJson = JSON.stringify({ ...config, binding: SETTING_BINDING, codeHash, __fromFile: true });
    if (compiledBase.basePrefix !== null && compiledBase.baseSuffix !== null) {
      expr = compiledBase.basePrefix + bootCfgJson + compiledBase.baseSuffix;
      baseForDisk = {
        codeHash,
        basePrefix: compiledBase.basePrefix,
        baseSuffix: compiledBase.baseSuffix,
        baseSha256: compiledBase.baseSha256,
      };
    } else {
      expr = getInjectWrapperTemplate()
        .replace('__AG_INJ_CSS__', () => compiledBase.packedCss)
        .replace('__AG_INJ_CSSHASH__', () => compiledBase.cssHashJson)
        .replace('__AG_INJ_BOOTCFG__', () => bootCfgJson)
        .replace('__AG_INJ_CODEHASH__', () => compiledBase.codeHashJson)
        .replace('__AG_INJ_BUNDLE__();', () => compiledBase.bundle);
    }
    if (sourceHash) {
      _lastCompiledSourceHash = sourceHash;
    }
    _bundleCacheStats.lastOutcome = 'compiled';
  }

  if (sourceHash && codeHash) {
    _diskCacheLastSource = { sourceHash, codeHash };
    if (baseForDisk) {
      try {
        _warmBaseCache = {
          statSig: getBundleSourceStatSig(),
          sourceHash,
          ...baseForDisk,
        };
      } catch {}
    }
  }

  if (cachePath && sourceHash && configHash && baseForDisk) {
    if (deferCacheWrite) {
      _pendingDiskCachePersist = {
        cachePath,
        sourceHash,
        baseForDisk,
        newEntry: {
          configHash,
          codeHash,
          bootCfgJson,
          exprSha256: null,
          updatedAt: Date.now(),
        },
        deferredExpr: expr,
      };
    } else {
      const newEntry = {
        configHash,
        codeHash,
        bootCfgJson,
        exprSha256: sha256Text(expr),
        updatedAt: Date.now(),
      };
      _pendingDiskCachePersist = null;
      persistBundleCacheRecordSync(cachePath, sourceHash, baseForDisk, newEntry, existingRawEntries);
    }
  }

  return expr;
}

let _omniClientCache = { sig: '', sourceHash: '', minCode: '', codeHash: '', cachedPaths: new Set() };

function readCompiledOmniClient(opts = null) {
  const omniPath = path.join(__dirname, 'vendor', 'omni-viewer', 'omni-client.js');
  if (!fs.existsSync(omniPath)) {
    return { minCode: '', codeHash: '' };
  }
  const sig = getFileSig(omniPath);
  const cachePath = resolveBundleCachePathOption(opts);
  if (!cachePath && _omniClientCache.sig === sig && _omniClientCache.codeHash) {
    return _omniClientCache;
  }
  const rawBuf = fs.readFileSync(omniPath);
  return resolveChannelAssetsWithDiskCache({
    channelName: 'omni',
    memCache: _omniClientCache,
    setMemCache: (v) => { _omniClientCache = v; },
    sig,
    fileEntries: [{ rel: 'vendor/omni-viewer/omni-client.js', content: rawBuf }],
    opts,
    compileFn: () => {
      const minCode = minifySingleSource(rawBuf.toString('utf8'));
      const codeHash = computeHash(minCode);
      return { minCode, codeHash };
    },
    toCacheEntry: (assets, sourceHash) => ({
      sourceHash,
      codeHash: assets.codeHash,
      minCode: assets.minCode,
      payloadSha256: sha256Text(`${assets.codeHash}\0${assets.minCode}`),
      updatedAt: Date.now(),
    }),
    fromCacheEntry: (entry) => ({
      minCode: entry.minCode,
      codeHash: entry.codeHash,
    }),
  });
}

// 第二通道独立注入：绝不挤占静态主包 680KiB 配额，支持服务端 serverMeta 热同步与 codeHash 快速跳过重挂载
function buildOmniClientExpression(serverMeta = null, customClientSource = null, opts = null) {
  const resolvedOpts = opts || (customClientSource && typeof customClientSource === 'object' ? customClientSource : null);
  let minCode = '';
  let codeHash = '';
  if (typeof customClientSource === 'string') {
    minCode = customClientSource ? minifySingleSource(customClientSource) : '';
    codeHash = minCode ? computeHash(minCode) : '';
  } else {
    const compiled = readCompiledOmniClient(resolvedOpts);
    minCode = compiled.minCode;
    codeHash = compiled.codeHash;
  }

  const metaJson = JSON.stringify(serverMeta && typeof serverMeta === 'object' ? serverMeta : null);
  const hashJson = JSON.stringify(codeHash);
  const verJson = JSON.stringify(PLUGIN_VERSION);

  return `(() => {
    try {
      const loc = typeof window !== 'undefined' && window.location;
      const href = loc && typeof loc.href === 'string' ? loc.href : '';
      if (href) {
        const low = href.toLowerCase();
        if (low.startsWith('devtools://') || low.startsWith('data:') || low.startsWith('chrome:') || low.startsWith('chrome-extension:') || low.startsWith('edge:') || low.startsWith('blob:') || low.startsWith('plugin:')) {
          return { ok: false, status: 'skipped-non-host' };
        }
        if (low.startsWith('vscode-file://') || low.startsWith('app://') || low.startsWith('about:')) {
          const ttl = String(document.title || '').trim();
          if (/^(?:untitled|launchpad)$/i.test(ttl) || /\\/launchpad(?:\\.html)?(?:[?#]|$)/i.test(low)) {
            return { ok: false, status: 'skipped-non-host' };
          }
        }
        if (low.startsWith('http:') || low.startsWith('https:')) {
          const m = /^(https?):\\/\\/(127\\.0\\.0\\.1|localhost|\\[::1\\])(?::\\d+)?(\\/[^?#]*)?(?:[?#]|$)/i.exec(href);
          if (!m) return { ok: false, status: 'skipped-non-host' };
          const pathname = (m[3] || '/').toLowerCase();
          if (/^\\/(?:viewer(?:\\/|$)|sandbox(?:\\/|$)|stream(?:\\/|$)|api(?:\\/|$))/.test(pathname)) {
            return { ok: false, status: 'skipped-non-host' };
          }
          const hasDomMarker =
            Boolean(window.__agPrism || window.__agClaudeStyle) ||
            Boolean(
              document.body &&
                document.body.classList &&
                (document.body.classList.contains('theme-standalone') || document.body.classList.contains('monaco-workbench'))
            ) ||
            Boolean(
              document.querySelector &&
                document.querySelector(
                  '.agy-shell, .agy-home, [data-testid="aux-pane-split"], [data-testid="conversation-view"], [data-testid="agent-input-box"], [data-testid="model-selector-trigger"], .monaco-workbench'
                )
            );
          const isPlainHttp = m[1].toLowerCase() === 'http';
          const hasTitleMarker = !isPlainHttp && /\\bantigravity\\b/i.test(String(document.title || ''));
          if (!hasDomMarker && !hasTitleMarker && (isPlainHttp || String(document.readyState || '') === 'complete')) {
            return { ok: false, status: 'skipped-non-host' };
          }
        }
      }
    } catch {}

    const serverMeta = ${metaJson};
    window.__agPrismOmniServerMeta = serverMeta;

    if (!window.__agPrismOmniBridge || !window.__agPrismOmniBridge.__prismBridgeReady) {
      try { window.__agPrismOmniBridge?.dispose?.(); } catch {}
      const pending = new Map();
      let seq = 0;
      const sendOmniRpc = (reqObj, timeoutMs = 15000) => {
        const payload = reqObj && typeof reqObj === 'object' ? { ...reqObj } : { action: String(reqObj || 'getServerInfo') };
        const act = payload.action || 'getServerInfo';
        if (act === 'getServerInfo' && window.__agPrismOmniServerMeta && window.__agPrismOmniServerMeta.baseUrl) {
          return Promise.resolve({ ok: true, ...window.__agPrismOmniServerMeta });
        }
        if (typeof window.${OMNI_BINDING} !== 'function') {
          return Promise.resolve({ ok: false, offline: true, action: act, error: 'Omni daemon offline' });
        }
        return new Promise((resolve) => {
          if (pending.size >= 32) {
            resolve({ ok: false, busy: true, action: act });
            return;
          }
          const id = ++seq;
          const timer = setTimeout(() => {
            pending.delete(id);
            resolve({ ok: false, timeout: true, action: act });
          }, timeoutMs);
          pending.set(id, { resolve, timer });
          try {
            window.${OMNI_BINDING}(JSON.stringify({ id, ...payload, action: act, input: payload }));
          } catch (err) {
            clearTimeout(timer);
            pending.delete(id);
            resolve({ ok: false, action: act, error: String(err && err.message ? err.message : err) });
          }
        });
      };
      const bridge = {
        __prismBridgeReady: true,
        isOnline: () => typeof window.${OMNI_BINDING} === 'function',
        getServerMeta: () => window.__agPrismOmniServerMeta || null,
        call: sendOmniRpc,
        getServerInfo: () => sendOmniRpc({ action: 'getServerInfo' }, 6000),
        resolvePath: (opts) => sendOmniRpc({ ...(typeof opts === 'string' ? { rawPath: opts } : opts), action: 'resolvePath' }, 8000),
        revealInFolder: (opts) => sendOmniRpc({ ...(typeof opts === 'string' ? { path: opts } : opts), action: 'revealInFolder' }, 10000),
        openExternal: (opts) => sendOmniRpc({ ...(typeof opts === 'string' ? { target: opts } : opts), action: 'openExternal' }, 10000),
        readTextSlice: (opts) => sendOmniRpc({ ...(typeof opts === 'string' ? { path: opts } : opts), action: 'readTextSlice' }, 15000),
        resolve: (id, res) => {
          const item = pending.get(id);
          if (!item) return;
          clearTimeout(item.timer);
          pending.delete(id);
          item.resolve(res);
        },
        dispose: () => {
          for (const item of pending.values()) {
            clearTimeout(item.timer);
            item.resolve({ ok: false, disposed: true });
          }
          pending.clear();
        },
      };
      window.__agPrismOmniBridge = bridge;
      if (typeof window.__agPrismOmniResolve !== 'function') {
        window.__agPrismOmniResolve = bridge.resolve;
      }
    }

    const omniHash = ${hashJson};
    if (!omniHash) {
      return { ok: true, status: 'bridge-only', version: ${verJson} };
    }
    let omniStatus = 'deferred';
    const mountOmni = () => {
      const prismApi = window.__agPrism || window.__agClaudeStyle;
      const st = prismApi && typeof prismApi.getState === 'function' ? prismApi.getState() : null;
      const cfg = (st && st.cfg) || {};
      const existing = window.__agPrismOmni;
      const reused = Boolean(existing && existing.codeHash === omniHash && typeof existing.sync === 'function');
      if (!reused) {
        try { existing?.destroy?.(); } catch {}
        ${minCode};
        if (window.__agPrismOmni && typeof window.__agPrismOmni === 'object') {
          window.__agPrismOmni.codeHash = omniHash;
        }
      }
      if (cfg.omniModule === 'off') {
        try { window.__agPrismOmni?.sync?.(cfg, serverMeta); } catch {}
        omniStatus = 'disabled';
        return;
      }
      omniStatus = reused ? 'synced' : window.__agPrismOmni ? 'mounted' : 'ready';
      try { window.__agPrismOmni?.sync?.(cfg, serverMeta); } catch {}
    };
    if (document.documentElement) {
      mountOmni();
    } else {
      document.addEventListener('DOMContentLoaded', mountOmni, { once: true });
    }
    return { ok: true, status: omniStatus, version: ${verJson}, codeHash: omniHash };
  })()`;
}

function serializeJsonForEval(val) {
  const raw = JSON.stringify(val === undefined ? null : val);
  return String(raw).replace(/[<>/\u2028\u2029]/g, (ch) =>
    `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`
  );
}

let _sidebarClientCache = { sig: '', sourceHash: '', minCode: '', codeHash: '', cachedPaths: new Set() };

function isSafeV2SidebarClientSource(src) {
  if (typeof src !== 'string' || !src.trim()) return false;
  if (!src.includes('SIDEBAR_STUDIO_CLIENT_V2')) return false;
  // 任何出现 setPrefValue / setPrefValues 标识符或字符串字面量的客户端源码一律拒载（含括号属性访问）
  if (/setPrefValues?/i.test(src)) return false;
  return true;
}

function readCompiledSidebarClient(opts = null) {
  const sidebarPath = path.join(__dirname, 'vendor', 'sidebar-studio', 'sidebar-client.js');
  if (!fs.existsSync(sidebarPath)) {
    return { minCode: '', codeHash: '' };
  }
  const sig = getFileSig(sidebarPath);
  const cachePath = resolveBundleCachePathOption(opts);
  if (!cachePath && _sidebarClientCache.sig === sig && _sidebarClientCache.codeHash) {
    return _sidebarClientCache;
  }
  const rawBuf = fs.readFileSync(sidebarPath);
  const rawText = rawBuf.toString('utf8');
  if (!isSafeV2SidebarClientSource(rawText)) {
    return { minCode: '', codeHash: '' };
  }
  return resolveChannelAssetsWithDiskCache({
    channelName: 'sidebar',
    memCache: _sidebarClientCache,
    setMemCache: (v) => { _sidebarClientCache = v; },
    sig,
    fileEntries: [{ rel: 'vendor/sidebar-studio/sidebar-client.js', content: rawBuf }],
    extraTag: 'v2safe',
    opts,
    compileFn: () => {
      const minCode = minifySingleSource(rawText);
      const codeHash = computeHash(minCode);
      return { minCode, codeHash };
    },
    toCacheEntry: (assets, sourceHash) => ({
      sourceHash,
      codeHash: assets.codeHash,
      minCode: assets.minCode,
      payloadSha256: sha256Text(`${assets.codeHash}\0${assets.minCode}`),
      updatedAt: Date.now(),
    }),
    fromCacheEntry: (entry) => ({
      minCode: entry.minCode,
      codeHash: entry.codeHash,
    }),
  });
}

// 第三通道独立注入（Sidebar Studio）：绝不挤占静态主包 670KiB 配额，支持服务端 meta 热同步、codeHash 快速跳过与热启停卸载
function buildSidebarStudioExpression(serverMeta = null, customClientSource = null, opts = null) {
  const resolvedOpts = opts || (customClientSource && typeof customClientSource === 'object' ? customClientSource : null);
  let minCode = '';
  let codeHash = '';
  if (typeof customClientSource === 'string') {
    minCode = customClientSource && isSafeV2SidebarClientSource(customClientSource)
      ? minifySingleSource(customClientSource)
      : '';
    codeHash = minCode ? computeHash(minCode) : '';
  } else {
    const compiled = readCompiledSidebarClient(resolvedOpts);
    minCode = compiled.minCode;
    codeHash = compiled.codeHash;
  }

  const metaJson = serializeJsonForEval(serverMeta && typeof serverMeta === 'object' ? serverMeta : null);
  const hashJson = serializeJsonForEval(codeHash);
  const verJson = serializeJsonForEval(PLUGIN_VERSION);

  return `(() => {
    try {
      const loc = typeof window !== 'undefined' && window.location;
      const href = loc && typeof loc.href === 'string' ? loc.href : '';
      if (href) {
        const low = href.toLowerCase();
        if (low.startsWith('devtools://') || low.startsWith('data:') || low.startsWith('chrome:') || low.startsWith('chrome-extension:') || low.startsWith('edge:') || low.startsWith('blob:') || low.startsWith('plugin:')) {
          return { ok: false, status: 'skipped-non-host' };
        }
        if (low.startsWith('vscode-file://') || low.startsWith('app://') || low.startsWith('about:')) {
          const ttl = String(document.title || '').trim();
          if (/^(?:untitled|launchpad)$/i.test(ttl) || /\\/launchpad(?:\\.html)?(?:[?#]|$)/i.test(low)) {
            return { ok: false, status: 'skipped-non-host' };
          }
        }
        if (low.startsWith('http:') || low.startsWith('https:')) {
          const m = /^(https?):\\/\\/(127\\.0\\.0\\.1|localhost|\\[::1\\])(?::\\d+)?(\\/[^?#]*)?(?:[?#]|$)/i.exec(href);
          if (!m) return { ok: false, status: 'skipped-non-host' };
          const pathname = (m[3] || '/').toLowerCase();
          if (/^\\/(?:viewer(?:\\/|$)|sandbox(?:\\/|$)|stream(?:\\/|$)|api(?:\\/|$))/.test(pathname)) {
            return { ok: false, status: 'skipped-non-host' };
          }
          const hasDomMarker =
            Boolean(window.__agPrism || window.__agClaudeStyle) ||
            Boolean(
              document.body &&
                document.body.classList &&
                (document.body.classList.contains('theme-standalone') || document.body.classList.contains('monaco-workbench'))
            ) ||
            Boolean(
              document.querySelector &&
                document.querySelector(
                  '.agy-shell, .agy-home, [data-testid="aux-pane-split"], [data-testid="conversation-view"], [data-testid="agent-input-box"], [data-testid="model-selector-trigger"], .monaco-workbench'
                )
            );
          const isPlainHttp = m[1].toLowerCase() === 'http';
          const hasTitleMarker = !isPlainHttp && /\\bantigravity\\b/i.test(String(document.title || ''));
          if (!hasDomMarker && !hasTitleMarker && (isPlainHttp || String(document.readyState || '') === 'complete')) {
            return { ok: false, status: 'skipped-non-host' };
          }
        }
      }
    } catch {}

    const serverMeta = ${metaJson};
    window.__agPrismSidebarMeta = serverMeta;

    if (!window.__agPrismSidebarBridge || !window.__agPrismSidebarBridge.__prismBridgeReady) {
      try { window.__agPrismSidebarBridge?.dispose?.(); } catch {}
      const pending = new Map();
      let seq = 0;
      const sendSidebarRpc = (reqObj, timeoutMs = 15000) => {
        const payload = reqObj && typeof reqObj === 'object' ? { ...reqObj } : { action: String(reqObj || 'get-state') };
        const act = payload.action || 'get-state';
        if (typeof window.${SIDEBAR_BINDING} !== 'function') {
          return Promise.resolve({ ok: false, offline: true, action: act, error: { code: 'CAPABILITY_UNAVAILABLE', message: 'Sidebar Studio daemon offline', retryable: true } });
        }
        return new Promise((resolve) => {
          if (pending.size >= 32) {
            resolve({ ok: false, busy: true, action: act, error: { code: 'BUSY', message: 'Sidebar RPC queue full', retryable: true } });
            return;
          }
          const id = ++seq;
          const timer = setTimeout(() => {
            pending.delete(id);
            resolve({ ok: false, timeout: true, action: act, error: { code: 'CAPABILITY_UNAVAILABLE', message: 'Sidebar RPC timeout', retryable: true } });
          }, timeoutMs);
          pending.set(id, { resolve, timer });
          try {
            window.${SIDEBAR_BINDING}(JSON.stringify({ id, version: 2, ...payload, action: act }));
          } catch (err) {
            clearTimeout(timer);
            pending.delete(id);
            resolve({ ok: false, action: act, error: { code: 'INVALID_ARGUMENT', message: String(err && err.message ? err.message : err) } });
          }
        });
      };
      const bridge = {
        __prismBridgeReady: true,
        schemaVersion: 2,
        isOnline: () => typeof window.${SIDEBAR_BINDING} === 'function',
        getMeta: () => window.__agPrismSidebarMeta || null,
        call: sendSidebarRpc,
        rpc: sendSidebarRpc,
        getState: () => sendSidebarRpc({ action: 'get-state' }, 8000),
        syncCatalog: (payload) => sendSidebarRpc({ action: 'sync-catalog', payload: payload && typeof payload === 'object' ? payload : {} }, 8000),
        createSparkBox: (opts) => sendSidebarRpc({ action: 'create-spark-box', payload: typeof opts === 'string' ? { name: opts } : (opts || {}) }, 15000),
        pickFolder: (opts) => sendSidebarRpc({ action: 'pick-folder', payload: opts && typeof opts === 'object' ? opts : {} }, 120000),
        revealFolder: (opts) => sendSidebarRpc({ action: 'reveal-folder', payload: typeof opts === 'string' ? { path: opts } : (opts || {}) }, 10000),
        resolve: (id, res) => {
          const item = pending.get(id);
          if (!item) return;
          clearTimeout(item.timer);
          pending.delete(id);
          item.resolve(res);
        },
        dispose: () => {
          for (const item of pending.values()) {
            clearTimeout(item.timer);
            item.resolve({ ok: false, disposed: true });
          }
          pending.clear();
        },
      };
      window.__agPrismSidebarBridge = bridge;
      if (typeof window.__agPrismSidebarResolve !== 'function') {
        window.__agPrismSidebarResolve = bridge.resolve;
      }
    }

    const cleanupSidebarDom = (preserveRuntimeState = false) => {
      try { window.__agPrismSidebar?.destroy?.({ preserveRuntimeState: Boolean(preserveRuntimeState) }); } catch {}
      try { delete window.__agPrismSidebar; } catch {}
      try {
        document.getElementById('ag-prism-sidebar-studio-css')?.remove();
        document.querySelectorAll('[data-ag-prism-sidebar-owned="1"], .ag-prism-sidebar-studio, .ag-prism-sidebar-rail, .ag-prism-sidebar-popover, .ag-prism-sidebar-modal').forEach((n) => n.remove());
        if (!preserveRuntimeState && document.documentElement) {
          ['data-ag-prism-mode', 'data-ag-prism-chat-kind', 'data-ag-prism-chat-telemetry', 'data-ag-cs-space', 'data-ag-cs-space-palette', 'data-ag-cs-space-accent'].forEach((a) => document.documentElement.removeAttribute(a));
        }
      } catch {}
    };

    const sidebarHash = ${hashJson};
    if (!sidebarHash) {
      const prismApi0 = window.__agPrism || window.__agClaudeStyle;
      const cfg0 = prismApi0 && typeof prismApi0.getState === 'function' ? prismApi0.getState()?.cfg || {} : {};
      if (cfg0.sidebarStudio !== 'on') {
        cleanupSidebarDom(false);
        return { ok: true, status: 'disabled', version: ${verJson} };
      }
      return { ok: true, status: 'bridge-only', version: ${verJson} };
    }

    let sidebarStatus = 'deferred';
    const mountSidebar = () => {
      const prismApi = window.__agPrism || window.__agClaudeStyle;
      const st = prismApi && typeof prismApi.getState === 'function' ? prismApi.getState() : null;
      const cfg = (st && st.cfg) || {};
      if (document.documentElement) {
        document.documentElement.setAttribute('data-ag-prism-sidebar-studio', cfg.sidebarStudio === 'on' ? 'on' : 'off');
      }
      if (cfg.sidebarStudio !== 'on') {
        cleanupSidebarDom(false);
        sidebarStatus = 'disabled';
        return;
      }
      const existing = window.__agPrismSidebar;
      const reused = Boolean(existing && !existing.destroyed && existing.codeHash === sidebarHash && typeof existing.sync === 'function');
      if (!reused) {
        cleanupSidebarDom(true);
        ${minCode};
        if (window.__agPrismSidebar && typeof window.__agPrismSidebar === 'object') {
          window.__agPrismSidebar.codeHash = sidebarHash;
        }
      }
      sidebarStatus = reused ? 'synced' : window.__agPrismSidebar ? 'mounted' : 'ready';
      try { window.__agPrismSidebar?.sync?.(cfg, serverMeta); } catch {}
    };
    if (document.documentElement) {
      mountSidebar();
    } else {
      document.addEventListener('DOMContentLoaded', mountSidebar, { once: true });
    }
    return { ok: true, status: sidebarStatus, version: ${verJson}, codeHash: sidebarHash };
  })()`;
}

let _hostI18nCache = { sig: '', sourceHash: '', minRuntime: '', dictRaw: '', codeHash: '', cachedPaths: new Set() };

function shouldEnableHostI18n(config, hostLocaleHint = null) {
  const cfg = config && typeof config === 'object' ? reconcileConfigAliases(config) : readConfig();
  const mode = cfg.hostLocalization || 'auto';
  if (mode === 'off') return false;
  if (mode === 'on') return true;
  const lang = cfg.language || cfg.lang || 'zh-CN';
  if (lang === 'zh-CN') return true;
  if (lang === 'auto') {
    let sysLocale = hostLocaleHint;
    if (!sysLocale) {
      try {
        const candidates = [process.env.LC_ALL, process.env.LC_MESSAGES, process.env.LANG];
        for (let i = 0; i < candidates.length; i++) {
          const val = String(candidates[i] || '').trim();
          if (val && !/^(?:c|posix)(?:[.@]|$)/i.test(val)) {
            sysLocale = val;
            break;
          }
        }
        if (!sysLocale) {
          sysLocale = Intl.DateTimeFormat().resolvedOptions().locale || '';
        }
      } catch {
        sysLocale = '';
      }
    }
    const stripped = String(sysLocale || '').trim().split(/[.@]/)[0];
    const norm = stripped.toLowerCase().replace(/_/g, '-');
    return norm === 'zh' || /^zh-(?:cn|hans|sg)(?:-|$)/.test(norm);
  }
  return false;
}

function readCompiledHostI18nAssets(opts = null) {
  const rtPath = path.join(__dirname, 'vendor', 'host-i18n', 'host-i18n-runtime.js');
  const dictPath = path.join(__dirname, 'vendor', 'host-i18n', 'zh-CN.json');
  if (!fs.existsSync(rtPath) || !fs.existsSync(dictPath)) {
    return { minRuntime: '', dictRaw: '', codeHash: '' };
  }
  const sig = `${getFileSig(rtPath)}|${getFileSig(dictPath)}`;
  const cachePath = resolveBundleCachePathOption(opts);
  if (!cachePath && _hostI18nCache.sig === sig && _hostI18nCache.codeHash) {
    return _hostI18nCache;
  }
  const rtBuf = fs.readFileSync(rtPath);
  const dictBuf = fs.readFileSync(dictPath);
  return resolveChannelAssetsWithDiskCache({
    channelName: 'hostI18n',
    memCache: _hostI18nCache,
    setMemCache: (v) => { _hostI18nCache = v; },
    sig,
    fileEntries: [
      { rel: 'vendor/host-i18n/host-i18n-runtime.js', content: rtBuf },
      { rel: 'vendor/host-i18n/zh-CN.json', content: dictBuf },
    ],
    opts,
    compileFn: () => {
      const minRuntime = minifySingleSource(rtBuf.toString('utf8'));
      const parsedDict = JSON.parse(dictBuf.toString('utf8'));
      const dictRaw = JSON.stringify(parsedDict).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
      const codeHash = computeHash(`${minRuntime}:${dictRaw}`);
      return { minRuntime, dictRaw, codeHash };
    },
    toCacheEntry: (assets, sourceHash) => ({
      sourceHash,
      codeHash: assets.codeHash,
      minRuntime: assets.minRuntime,
      dictRaw: assets.dictRaw,
      payloadSha256: sha256Text(`${assets.codeHash}\0${assets.minRuntime}\0${assets.dictRaw}`),
      updatedAt: Date.now(),
    }),
    fromCacheEntry: (entry) => ({
      minRuntime: entry.minRuntime,
      dictRaw: entry.dictRaw,
      codeHash: entry.codeHash,
    }),
  });
}

const HOST_I18N_REMOVE_EXPRESSION = `(() => {
  try { window.__agPrismHostI18n?.destroy?.(); } catch {}
  try { document.documentElement?.removeAttribute?.('data-ag-prism-host-i18n'); } catch {}
  try { delete window.__agPrismHostI18n; } catch {}
  try { delete globalThis.__agPrismHostI18n; } catch {}
  try { delete window.__agPrismHostI18nFactory; } catch {}
  try { delete globalThis.__agPrismHostI18nFactory; } catch {}
  return { ok: true, status: 'off' };
})()`;

// 第四通道独立注入（Host UI 简体中文按需本地化）：绝不打入静态主包，支持 4 层通用自动礼让与 100% 无损卸载
function buildHostI18nExpression(config = null, hostLocaleHint = null, opts = null) {
  let resolvedLocaleHint = hostLocaleHint;
  let resolvedOpts = opts;
  if (hostLocaleHint && typeof hostLocaleHint === 'object' && !resolvedOpts) {
    resolvedOpts = hostLocaleHint;
    resolvedLocaleHint = null;
  }
  const cfg = config && typeof config === 'object' ? reconcileConfigAliases(config) : readConfig();
  if (!shouldEnableHostI18n(cfg, resolvedLocaleHint)) {
    return '';
  }
  const { minRuntime, dictRaw, codeHash } = readCompiledHostI18nAssets(resolvedOpts);
  if (!minRuntime || !dictRaw) {
    return '';
  }
  const mode = cfg.hostLocalization === 'on' ? 'on' : 'auto';
  const modeJson = serializeJsonForEval(mode);
  const hashJson = serializeJsonForEval(codeHash);

  return `(() => {
    try {
      if (window.self !== window.top) return { ok: false, status: 'skipped-subframe' };
    } catch {
      return { ok: false, status: 'skipped-subframe' };
    }
    const hasDomMarker = () => {
      try {
        if (
          document.body &&
          document.body.classList &&
          (document.body.classList.contains('theme-standalone') || document.body.classList.contains('monaco-workbench'))
        ) {
          return true;
        }
        return Boolean(
          typeof document.querySelector === 'function' &&
            document.querySelector(
              '.agy-shell, .agy-home, [data-testid="aux-pane-split"], [data-testid="conversation-view"], [data-testid="agent-input-box"], [data-testid="model-selector-trigger"], .monaco-workbench'
            )
        );
      } catch {
        return false;
      }
    };
    let needDomMarkerOnReady = false;
    let isPlainHttpLocalhost = false;
    try {
      const loc = typeof window !== 'undefined' && window.location;
      const href = loc && typeof loc.href === 'string' ? loc.href : '';
      if (href) {
        const low = href.toLowerCase();
        if (low.startsWith('devtools://') || low.startsWith('data:') || low.startsWith('chrome:') || low.startsWith('chrome-extension:') || low.startsWith('edge:') || low.startsWith('blob:') || low.startsWith('plugin:')) {
          return { ok: false, status: 'skipped-non-host' };
        }
        if (low.startsWith('vscode-file://') || low.startsWith('app://') || low.startsWith('about:')) {
          const ttl = String(document.title || '').trim();
          if (/^(?:untitled|launchpad)$/i.test(ttl) || /\\/launchpad(?:\\.html)?(?:[?#]|$)/i.test(low)) {
            return { ok: false, status: 'skipped-non-host' };
          }
        }
        if (low.startsWith('http:') || low.startsWith('https:')) {
          const m = /^(https?):\\/\\/(127\\.0\\.0\\.1|localhost|\\[::1\\])(?::\\d+)?(\\/[^?#]*)?(?:[?#]|$)/i.exec(href);
          if (!m) return { ok: false, status: 'skipped-non-host' };
          const pathname = (m[3] || '/').toLowerCase();
          if (/^\\/(?:viewer(?:\\/|$)|sandbox(?:\\/|$)|stream(?:\\/|$)|api(?:\\/|$))/.test(pathname)) {
            return { ok: false, status: 'skipped-non-host' };
          }
          if (!hasDomMarker()) {
            isPlainHttpLocalhost = m[1].toLowerCase() === 'http';
            const rs = String(document.readyState || '');
            if (isPlainHttpLocalhost) {
              if (rs === 'loading') needDomMarkerOnReady = true;
              else return { ok: false, status: 'skipped-non-host' };
            } else if (!/\\bantigravity\\b/i.test(String(document.title || ''))) {
              if (rs === 'loading') needDomMarkerOnReady = true;
              else return { ok: false, status: 'skipped-non-host' };
            }
          }
        }
      }
    } catch {}

    let targetMode = ${modeJson};
    try {
      const liveCfg = window.__agPrism?.getState?.()?.cfg;
      if (liveCfg && typeof liveCfg === 'object') {
        if (liveCfg.hostLocalization === 'off') {
          try { window.__agPrismHostI18n?.destroy?.(); document.documentElement?.removeAttribute?.('data-ag-prism-host-i18n'); } catch {}
          return { ok: true, status: 'off', skippedByLiveCfg: true };
        }
        if (liveCfg.hostLocalization === 'on') {
          targetMode = 'on';
        } else {
          targetMode = 'auto';
          const liveLang = liveCfg.language || liveCfg.lang || '';
          if (liveLang && liveLang !== 'zh-CN' && liveLang !== 'auto') {
            try { window.__agPrismHostI18n?.destroy?.(); document.documentElement?.removeAttribute?.('data-ag-prism-host-i18n'); } catch {}
            return { ok: true, status: 'off', skippedByLiveCfg: true };
          }
          if (liveLang === 'auto') {
            const navLang = String(
              (typeof navigator !== 'undefined' && (navigator.language || (navigator.languages && navigator.languages[0]))) || ''
            )
              .trim()
              .split(/[.@]/)[0]
              .toLowerCase()
              .replace(/_/g, '-');
            if (navLang && navLang !== 'zh' && !/^zh-(?:cn|hans|sg)(?:-|$)/.test(navLang)) {
              try { window.__agPrismHostI18n?.destroy?.(); document.documentElement?.removeAttribute?.('data-ag-prism-host-i18n'); } catch {}
              return { ok: true, status: 'off', skippedByLiveCfg: true };
            }
          }
        }
      }
    } catch {}

    const targetHash = ${hashJson};
    const mountOrReuse = () => {
      if (needDomMarkerOnReady && !hasDomMarker() && (isPlainHttpLocalhost || !/\\bantigravity\\b/i.test(String(document.title || '')))) {
        return { ok: false, status: 'skipped-non-host' };
      }
      const existing = window.__agPrismHostI18n;
      if (existing && existing.__prismCodeHash === targetHash && typeof existing.getStatus === 'function') {
        const st = existing.getStatus();
        if (st && st.mode === targetMode) {
          return { ok: true, reused: true, codeHash: targetHash, ...st };
        }
        if (typeof existing.setMode === 'function') {
          const switched = existing.setMode(targetMode);
          return { ok: true, modeSwitched: true, codeHash: targetHash, ...switched };
        }
      }
      try { existing?.destroy?.(); } catch {}

      ${minRuntime};
      const factory = window.__agPrismHostI18nFactory || globalThis.__agPrismHostI18nFactory;
      if (!factory || typeof factory.mountHostI18n !== 'function') {
        return { ok: false, status: 'factory-missing' };
      }
      const inst = factory.mountHostI18n({
        root: window,
        doc: document,
        mode: targetMode,
        dict: ${dictRaw},
      });
      if (inst && typeof inst === 'object') {
        inst.__prismCodeHash = targetHash;
      }
      const cur = inst && typeof inst.getStatus === 'function' ? inst.getStatus() : { status: 'active' };
      return { ok: true, codeHash: targetHash, ...cur };
    };

    if (needDomMarkerOnReady && typeof document.addEventListener === 'function') {
      document.addEventListener('DOMContentLoaded', () => { try { mountOrReuse(); } catch {} }, { once: true });
      return { ok: true, status: 'deferred', codeHash: targetHash };
    }
    return mountOrReuse();
  })()`;
}

let _thoughtAssetsCache = { sig: '', sourceHash: '', minClient: '', minSettingsUi: '', codeHash: '', cachedPaths: new Set() };

function shouldEnableThought(config = null) {
  const cfg = config && typeof config === 'object' ? reconcileConfigAliases(config) : readConfig();
  const raw = typeof cfg.thoughtTranslate === 'string' ? cfg.thoughtTranslate.trim().toLowerCase() : '';
  if (!raw || raw === 'off' || raw === 'false' || raw === '0' || raw === 'none') {
    return false;
  }
  return VALIDATORS.thoughtTranslate.includes(raw) || raw === 'on' || raw === 'auto';
}

function readCompiledThoughtAssets(opts = null) {
  const clientPath = path.join(__dirname, 'vendor', 'thought-translator', 'thought-client.js');
  const settingsUiPath = path.join(__dirname, 'vendor', 'thought-translator', 'thought-settings-ui.js');
  if (!fs.existsSync(clientPath) || !fs.existsSync(settingsUiPath)) {
    return { sig: '', minClient: '', minSettingsUi: '', codeHash: '' };
  }
  const sig = `${getFileSig(clientPath)}|${getFileSig(settingsUiPath)}`;
  const cachePath = resolveBundleCachePathOption(opts);
  if (!cachePath && _thoughtAssetsCache.sig === sig && _thoughtAssetsCache.codeHash) {
    return _thoughtAssetsCache;
  }
  const clientBuf = fs.readFileSync(clientPath);
  const settingsBuf = fs.readFileSync(settingsUiPath);
  return resolveChannelAssetsWithDiskCache({
    channelName: 'thought',
    memCache: _thoughtAssetsCache,
    setMemCache: (v) => { _thoughtAssetsCache = v; },
    sig,
    fileEntries: [
      { rel: 'vendor/thought-translator/thought-client.js', content: clientBuf },
      { rel: 'vendor/thought-translator/thought-settings-ui.js', content: settingsBuf },
    ],
    opts,
    compileFn: () => {
      const minClient = minifySingleSource(clientBuf.toString('utf8'));
      const minSettingsUi = minifySingleSource(settingsBuf.toString('utf8'));
      const codeHash = computeHash(`${minClient}\n${minSettingsUi}`);
      return { minClient, minSettingsUi, codeHash };
    },
    toCacheEntry: (assets, sourceHash) => ({
      sourceHash,
      codeHash: assets.codeHash,
      minClient: assets.minClient,
      minSettingsUi: assets.minSettingsUi,
      payloadSha256: sha256Text(`${assets.codeHash}\0${assets.minClient}\0${assets.minSettingsUi}`),
      updatedAt: Date.now(),
    }),
    fromCacheEntry: (entry) => ({
      minClient: entry.minClient,
      minSettingsUi: entry.minSettingsUi,
      codeHash: entry.codeHash,
    }),
  });
}

const THOUGHT_REMOVE_EXPRESSION = `(() => {
  try { window.__agPrismThought?.destroy?.(); } catch {}
  try { document.querySelectorAll?.('[data-testid="prism-thought-ai-config"], [data-testid="prism-thought-general-config"]')?.forEach?.((el) => el.remove()); } catch {}
  try { delete window.__agPrismThought; } catch {}
  try { delete globalThis.__agPrismThought; } catch {}
  try { delete window.__agPrismThoughtSettingsUi; } catch {}
  try { delete globalThis.__agPrismThoughtSettingsUi; } catch {}
  try {
    const sec = document.getElementById?.('ag-cs-settings-sec') || document.getElementById?.('ag-prism-settings-sec');
    if (sec) {
      sec.__prismThoughtUiHandle = null;
      sec.__prismMountThoughtUi?.();
    }
  } catch {}
  return { ok: true, status: 'off' };
})()`;

// 第五通道独立注入（思维链实时转译 + AI 渠道工作台 UI）：默认 off 态 0 B Fail-Closed，支持零刷新热插拔与无损卸载
function buildThoughtExpression(config = null, opts = null) {
  const cfg = config && typeof config === 'object' ? reconcileConfigAliases(config) : readConfig();
  if (!shouldEnableThought(cfg)) {
    return '';
  }
  const { minClient, minSettingsUi, codeHash } = readCompiledThoughtAssets(opts);
  if (!minClient || !minSettingsUi) {
    return '';
  }
  const rawMode = String(cfg.thoughtTranslate || '').trim().toLowerCase();
  const normalizedBootMode = rawMode === 'machine' ? 'machine' : 'ai';
  const bootCfg = {
    ...cfg,
    thoughtTranslate: normalizedBootMode,
  };
  const bootCfgJson = serializeJsonForEval(bootCfg);
  const hashJson = serializeJsonForEval(codeHash);

  return `(() => {
    try {
      if (window.self !== window.top) return { ok: false, status: 'skipped-subframe' };
    } catch {
      return { ok: false, status: 'skipped-subframe' };
    }
    const hasDomMarker = () => {
      try {
        if (
          document.body &&
          document.body.classList &&
          (document.body.classList.contains('theme-standalone') || document.body.classList.contains('monaco-workbench'))
        ) {
          return true;
        }
        return Boolean(
          typeof document.querySelector === 'function' &&
            document.querySelector(
              '.agy-shell, .agy-home, [data-testid="aux-pane-split"], [data-testid="conversation-view"], [data-testid="agent-input-box"], [data-testid="model-selector-trigger"], .monaco-workbench'
            )
        );
      } catch {
        return false;
      }
    };
    let needDomMarkerOnReady = false;
    let isPlainHttpLocalhost = false;
    try {
      const loc = typeof window !== 'undefined' && window.location;
      const href = loc && typeof loc.href === 'string' ? loc.href : '';
      if (href) {
        const low = href.toLowerCase();
        if (low.startsWith('devtools://') || low.startsWith('data:') || low.startsWith('chrome:') || low.startsWith('chrome-extension:') || low.startsWith('edge:') || low.startsWith('blob:') || low.startsWith('plugin:')) {
          return { ok: false, status: 'skipped-non-host' };
        }
        if (low.startsWith('vscode-file://') || low.startsWith('app://') || low.startsWith('about:')) {
          const ttl = String(document.title || '').trim();
          if (/^(?:untitled|launchpad)$/i.test(ttl) || /\\/launchpad(?:\\.html)?(?:[?#]|$)/i.test(low)) {
            return { ok: false, status: 'skipped-non-host' };
          }
        }
        if (low.startsWith('http:') || low.startsWith('https:')) {
          const m = /^(https?):\\/\\/(127\\.0\\.0\\.1|localhost|\\[::1\\])(?::\\d+)?(\\/[^?#]*)?(?:[?#]|$)/i.exec(href);
          if (!m) return { ok: false, status: 'skipped-non-host' };
          const pathname = (m[3] || '/').toLowerCase();
          if (/^\\/(?:viewer(?:\\/|$)|sandbox(?:\\/|$)|stream(?:\\/|$)|api(?:\\/|$))/.test(pathname)) {
            return { ok: false, status: 'skipped-non-host' };
          }
          if (!hasDomMarker()) {
            isPlainHttpLocalhost = m[1].toLowerCase() === 'http';
            const rs = String(document.readyState || '');
            if (isPlainHttpLocalhost) {
              if (rs === 'loading') needDomMarkerOnReady = true;
              else return { ok: false, status: 'skipped-non-host' };
            } else if (!/\\bantigravity\\b/i.test(String(document.title || ''))) {
              if (rs === 'loading') needDomMarkerOnReady = true;
              else return { ok: false, status: 'skipped-non-host' };
            }
          }
        }
      }
    } catch {}

    const getSettingsSec = () => {
      try {
        return document.getElementById?.('ag-cs-settings-sec') || document.getElementById?.('ag-prism-settings-sec') || null;
      } catch {
        return null;
      }
    };
    const cleanupThought = () => {
      try { window.__agPrismThought?.destroy?.(); } catch {}
      try { document.querySelectorAll?.('[data-testid="prism-thought-ai-config"], [data-testid="prism-thought-general-config"]')?.forEach?.((el) => el.remove()); } catch {}
      try { delete window.__agPrismThought; } catch {}
      try { delete globalThis.__agPrismThought; } catch {}
      try { delete window.__agPrismThoughtSettingsUi; } catch {}
      try { delete globalThis.__agPrismThoughtSettingsUi; } catch {}
      try {
        const sec = getSettingsSec();
        if (sec) {
          sec.__prismThoughtUiHandle = null;
          sec.__prismMountThoughtUi?.();
        }
      } catch {}
    };
    const getLiveCfg = () => {
      try {
        const st = window.__agPrism?.getState?.();
        return st && st.cfg && typeof st.cfg === 'object' ? st.cfg : null;
      } catch {
        return null;
      }
    };

    const bootCfg = ${bootCfgJson};
    const initialLiveCfg = getLiveCfg();
    if (initialLiveCfg && initialLiveCfg.thoughtTranslate === 'off') {
      cleanupThought();
      return { ok: true, status: 'off', skippedByLiveCfg: true };
    }

    const targetHash = ${hashJson};
    const mountOrReuse = () => {
      if (needDomMarkerOnReady && !hasDomMarker() && (isPlainHttpLocalhost || !/\\bantigravity\\b/i.test(String(document.title || '')))) {
        return { ok: false, status: 'skipped-non-host' };
      }
      const liveCfg = getLiveCfg();
      if (liveCfg && liveCfg.thoughtTranslate === 'off') {
        cleanupThought();
        return { ok: true, status: 'off', skippedByLiveCfg: true };
      }
      const effectiveCfg = liveCfg || bootCfg;
      const existingThought = window.__agPrismThought;
      const existingUi = window.__agPrismThoughtSettingsUi || globalThis.__agPrismThoughtSettingsUi;
      if (
        existingThought &&
        existingThought.__prismCodeHash === targetHash &&
        existingUi &&
        existingUi.__prismCodeHash === targetHash
      ) {
        try { existingThought.sync?.(effectiveCfg); } catch {}
        try { window.__agPrism?.syncAbsorbed?.(); } catch {}
        try { getSettingsSec()?.__prismMountThoughtUi?.(); } catch {}
        return { ok: true, reused: true, codeHash: targetHash };
      }

      cleanupThought();
      ;${minClient};
      ;${minSettingsUi};

      const mountedThought = window.__agPrismThought || globalThis.__agPrismThought;
      const mountedUi = window.__agPrismThoughtSettingsUi || globalThis.__agPrismThoughtSettingsUi;
      if (mountedThought && typeof mountedThought === 'object') {
        mountedThought.__prismCodeHash = targetHash;
        try { window.__agPrismThought = mountedThought; } catch {}
        try { globalThis.__agPrismThought = mountedThought; } catch {}
      }
      if (mountedUi && typeof mountedUi === 'object') {
        mountedUi.__prismCodeHash = targetHash;
        try { window.__agPrismThoughtSettingsUi = mountedUi; } catch {}
        try { globalThis.__agPrismThoughtSettingsUi = mountedUi; } catch {}
      }
      try { mountedThought?.sync?.(effectiveCfg); } catch {}
      try { window.__agPrism?.syncAbsorbed?.(); } catch {}
      try { getSettingsSec()?.__prismMountThoughtUi?.(); } catch {}
      return { ok: true, status: 'mounted', codeHash: targetHash };
    };

    if ((needDomMarkerOnReady || !document.documentElement) && typeof document.addEventListener === 'function') {
      document.addEventListener('DOMContentLoaded', () => { try { mountOrReuse(); } catch {} }, { once: true });
      return { ok: true, status: 'deferred', codeHash: targetHash };
    }
    return mountOrReuse();
  })()`;
}

let _inlineDiffClientCache = { sig: '', sourceHash: '', minCode: '', codeHash: '', cachedPaths: new Set() };

function readCompiledInlineDiffClient(opts = null) {
  const clientPath = path.join(__dirname, 'vendor', 'inline-diff', 'inline-diff-client.js');
  if (!fs.existsSync(clientPath)) {
    return { sig: '', minCode: '', codeHash: '' };
  }
  const sig = getFileSig(clientPath);
  const cachePath = resolveBundleCachePathOption(opts);
  if (!cachePath && _inlineDiffClientCache.sig === sig && _inlineDiffClientCache.codeHash) {
    return _inlineDiffClientCache;
  }
  const rawBuf = fs.readFileSync(clientPath);
  return resolveChannelAssetsWithDiskCache({
    channelName: 'inlineDiff',
    memCache: _inlineDiffClientCache,
    setMemCache: (v) => { _inlineDiffClientCache = v; },
    sig,
    fileEntries: [{ rel: 'vendor/inline-diff/inline-diff-client.js', content: rawBuf }],
    opts,
    compileFn: () => {
      const minCode = minifySingleSource(rawBuf.toString('utf8'));
      const codeHash = computeHash(minCode);
      return { minCode, codeHash };
    },
    toCacheEntry: (assets, sourceHash) => ({
      sourceHash,
      codeHash: assets.codeHash,
      minCode: assets.minCode,
      payloadSha256: sha256Text(`${assets.codeHash}\0${assets.minCode}`),
      updatedAt: Date.now(),
    }),
    fromCacheEntry: (entry) => ({
      minCode: entry.minCode,
      codeHash: entry.codeHash,
    }),
  });
}

const INLINE_DIFF_REMOVE_EXPRESSION = `(() => {
  try { window.__agPrismInlineDiff?.destroy?.(); } catch {}
  try { document.getElementById?.('ag-prism-inline-diff-css')?.remove?.(); } catch {}
  try { document.querySelectorAll?.('.ag-cs-inline-diff-box, .ag-cs-diff-ctx-menu')?.forEach?.((el) => el.remove()); } catch {}
  try { delete window.__agPrismInlineDiff; } catch {}
  try { delete globalThis.__agPrismInlineDiff; } catch {}
  try { delete window.__agPrismInlineDiffFactory; } catch {}
  try { delete globalThis.__agPrismInlineDiffFactory; } catch {}
  try { delete window.__agPrismInlineDiffResolve; } catch {}
  return { ok: true, status: 'off' };
})()`;

// 第六通道独立注入（Inline Diff 展开预览 + 样式与右键菜单）：与 Channel 1 解耦，缺文件时安全返回 ''，支持 codeHash 幂等跳过与热重载
function buildInlineDiffInjectExpression(config = null, opts = null) {
  const cfg = config && typeof config === 'object' ? reconcileConfigAliases(config) : readConfig();
  let minCode = '';
  let codeHash = '';
  if (opts && typeof opts.customClientSource === 'string') {
    minCode = opts.customClientSource ? minifySingleSource(opts.customClientSource) : '';
    codeHash = minCode ? computeHash(minCode) : '';
  } else {
    const compiled = readCompiledInlineDiffClient(opts);
    minCode = compiled.minCode;
    codeHash = compiled.codeHash;
  }
  if (!minCode || !codeHash) {
    return '';
  }

  const bootCfgJson = serializeJsonForEval(cfg);
  const hashJson = serializeJsonForEval(codeHash);

  return `(() => {
    try {
      if (window.self !== window.top) return { ok: false, status: 'skipped-subframe' };
    } catch {
      return { ok: false, status: 'skipped-subframe' };
    }
    const hasDomMarker = () => {
      try {
        if (
          document.body &&
          document.body.classList &&
          (document.body.classList.contains('theme-standalone') || document.body.classList.contains('monaco-workbench'))
        ) {
          return true;
        }
        return Boolean(
          typeof document.querySelector === 'function' &&
            document.querySelector(
              '.agy-shell, .agy-home, [data-testid="aux-pane-split"], [data-testid="conversation-view"], [data-testid="agent-input-box"], [data-testid="model-selector-trigger"], .monaco-workbench'
            )
        );
      } catch {
        return false;
      }
    };
    let needDomMarkerOnReady = false;
    let isPlainHttpLocalhost = false;
    try {
      const loc = typeof window !== 'undefined' && window.location;
      const href = loc && typeof loc.href === 'string' ? loc.href : '';
      if (href) {
        const low = href.toLowerCase();
        if (low.startsWith('devtools://') || low.startsWith('data:') || low.startsWith('chrome:') || low.startsWith('chrome-extension:') || low.startsWith('edge:') || low.startsWith('blob:') || low.startsWith('plugin:')) {
          return { ok: false, status: 'skipped-non-host' };
        }
        if (low.startsWith('vscode-file://') || low.startsWith('app://') || low.startsWith('about:')) {
          const ttl = String(document.title || '').trim();
          if (/^(?:untitled|launchpad)$/i.test(ttl) || /\\/launchpad(?:\\.html)?(?:[?#]|$)/i.test(low)) {
            return { ok: false, status: 'skipped-non-host' };
          }
        }
        if (low.startsWith('http:') || low.startsWith('https:')) {
          const m = /^(https?):\\/\\/(127\\.0\\.0\\.1|localhost|\\[::1\\])(?::\\d+)?(\\/[^?#]*)?(?:[?#]|$)/i.exec(href);
          if (!m) return { ok: false, status: 'skipped-non-host' };
          const pathname = (m[3] || '/').toLowerCase();
          if (/^\\/(?:viewer(?:\\/|$)|sandbox(?:\\/|$)|stream(?:\\/|$)|api(?:\\/|$))/.test(pathname)) {
            return { ok: false, status: 'skipped-non-host' };
          }
          if (!hasDomMarker()) {
            isPlainHttpLocalhost = m[1].toLowerCase() === 'http';
            const rs = String(document.readyState || '');
            if (isPlainHttpLocalhost) {
              if (rs === 'loading') needDomMarkerOnReady = true;
              else return { ok: false, status: 'skipped-non-host' };
            } else if (!/\\bantigravity\\b/i.test(String(document.title || ''))) {
              if (rs === 'loading') needDomMarkerOnReady = true;
              else return { ok: false, status: 'skipped-non-host' };
            }
          }
        }
      }
    } catch {}

    const cleanupInlineDiff = () => {
      try { (window.__agPrismInlineDiff || globalThis.__agPrismInlineDiff)?.destroy?.(); } catch {}
      try { document.getElementById?.('ag-prism-inline-diff-css')?.remove?.(); } catch {}
      try { document.querySelectorAll?.('.ag-cs-inline-diff-box, .ag-cs-diff-ctx-menu')?.forEach?.((el) => el.remove()); } catch {}
      try { delete window.__agPrismInlineDiff; } catch {}
      try { delete globalThis.__agPrismInlineDiff; } catch {}
      try { delete window.__agPrismInlineDiffFactory; } catch {}
      try { delete globalThis.__agPrismInlineDiffFactory; } catch {}
      try { delete window.__agPrismInlineDiffResolve; } catch {}
    };
    const getLiveCfg = () => {
      try {
        const st = window.__agPrism?.getState?.();
        return st && st.cfg && typeof st.cfg === 'object' ? st.cfg : null;
      } catch {
        return null;
      }
    };

    const bootCfg = ${bootCfgJson};
    const targetHash = ${hashJson};
    const mountOrReuse = () => {
      if (needDomMarkerOnReady && !hasDomMarker() && (isPlainHttpLocalhost || !/\\bantigravity\\b/i.test(String(document.title || '')))) {
        return { ok: false, status: 'skipped-non-host' };
      }
      const effectiveCfg = getLiveCfg() || bootCfg;
      const existing = window.__agPrismInlineDiff || globalThis.__agPrismInlineDiff;
      if (existing && !existing.getDebugState?.()?.destroyed && existing.__prismCodeHash === targetHash && typeof existing.sync === 'function') {
        try { existing.sync(effectiveCfg); } catch {}
        return { ok: true, reused: true, codeHash: targetHash };
      }

      cleanupInlineDiff();
      ;${minCode};

      let mounted = window.__agPrismInlineDiff || globalThis.__agPrismInlineDiff;
      const factory = window.__agPrismInlineDiffFactory || globalThis.__agPrismInlineDiffFactory;
      if (!mounted && typeof factory === 'function') {
        try {
          mounted = factory({ window, document });
        } catch {}
      }
      if (mounted && typeof mounted === 'object') {
        mounted.__prismCodeHash = targetHash;
        try { window.__agPrismInlineDiff = mounted; } catch {}
        try { globalThis.__agPrismInlineDiff = mounted; } catch {}
      }
      if (typeof factory === 'function') {
        try { window.__agPrismInlineDiffFactory = factory; } catch {}
        try { globalThis.__agPrismInlineDiffFactory = factory; } catch {}
      }
      try { mounted?.sync?.(effectiveCfg); } catch {}
      return { ok: true, status: 'mounted', codeHash: targetHash };
    };

    if ((needDomMarkerOnReady || !document.documentElement) && typeof document.addEventListener === 'function') {
      document.addEventListener('DOMContentLoaded', () => { try { mountOrReuse(); } catch {} }, { once: true });
      return { ok: true, status: 'deferred', codeHash: targetHash };
    }
    return mountOrReuse();
  })()`;
}

let _wallpaperAssetsCache = { sig: '', sourceHash: '', minClient: '', minSettingsUi: '', codeHash: '', cachedPaths: new Set() };

function readCompiledWallpaperAssets(opts = null) {
  const clientPath = path.join(__dirname, 'vendor', 'wallpaper', 'wallpaper-client.js');
  const settingsUiPath = path.join(__dirname, 'vendor', 'wallpaper', 'wallpaper-settings-ui.js');
  if (!fs.existsSync(clientPath) || !fs.existsSync(settingsUiPath)) {
    return { sig: '', minClient: '', minSettingsUi: '', codeHash: '' };
  }
  const sig = `${getFileSig(clientPath)}|${getFileSig(settingsUiPath)}`;
  const cachePath = resolveBundleCachePathOption(opts);
  if (!cachePath && _wallpaperAssetsCache.sig === sig && _wallpaperAssetsCache.codeHash) {
    return _wallpaperAssetsCache;
  }
  const clientBuf = fs.readFileSync(clientPath);
  const settingsBuf = fs.readFileSync(settingsUiPath);
  return resolveChannelAssetsWithDiskCache({
    channelName: 'wallpaper',
    memCache: _wallpaperAssetsCache,
    setMemCache: (v) => { _wallpaperAssetsCache = v; },
    sig,
    fileEntries: [
      { rel: 'vendor/wallpaper/wallpaper-client.js', content: clientBuf },
      { rel: 'vendor/wallpaper/wallpaper-settings-ui.js', content: settingsBuf },
    ],
    opts,
    compileFn: () => {
      const minClient = minifySingleSource(clientBuf.toString('utf8'));
      const minSettingsUi = minifySingleSource(settingsBuf.toString('utf8'));
      const codeHash = computeHash(`${minClient}\n${minSettingsUi}`);
      return { minClient, minSettingsUi, codeHash };
    },
    toCacheEntry: (assets, sourceHash) => ({
      sourceHash,
      codeHash: assets.codeHash,
      minClient: assets.minClient,
      minSettingsUi: assets.minSettingsUi,
      payloadSha256: sha256Text(`${assets.codeHash}\0${assets.minClient}\0${assets.minSettingsUi}`),
      updatedAt: Date.now(),
    }),
    fromCacheEntry: (entry) => ({
      minClient: entry.minClient,
      minSettingsUi: entry.minSettingsUi,
      codeHash: entry.codeHash,
    }),
  });
}

const WALLPAPER_REMOVE_EXPRESSION = `(() => {
  try {
    document.querySelectorAll?.('#ag-prism-wallpaper-root video')?.forEach?.((v) => {
      try { v.pause?.(); } catch {}
      try { v.removeAttribute?.('src'); } catch {}
      try { v.src = ''; } catch {}
      try { v.load?.(); } catch {}
    });
  } catch {}
  try { (window.__agPrismWallpaper || globalThis.__agPrismWallpaper)?.destroy?.(); } catch {}
  try { (window.__agPrismWallpaperBridge || globalThis.__agPrismWallpaperBridge)?.dispose?.(); } catch {}
  try { document.getElementById?.('ag-prism-wallpaper-root')?.remove?.(); } catch {}
  try { document.getElementById?.('ag-prism-wallpaper-css')?.remove?.(); } catch {}
  try {
    const slot = document.querySelector?.('[data-testid="prism-wallpaper-slot"]');
    if (slot) {
      try { slot.__agPrismWpUiHandle?.destroy?.(); } catch {}
      slot.__agPrismWpUiHandle = null;
      while (slot.firstChild) slot.removeChild(slot.firstChild);
    }
  } catch {}
  try {
    const de = document.documentElement;
    if (de) {
      de.removeAttribute?.('data-ag-prism-wallpaper');
      de.removeAttribute?.('data-ag-prism-wallpaper-hole');
      if (de.style && typeof de.style.removeProperty === 'function') {
        ['--ag-prism-wp-opacity', '--ag-prism-wp-blur', '--ag-prism-wp-blur-pad', '--ag-prism-wp-dim', '--ag-prism-wp-fit'].forEach((p) =>
          de.style.removeProperty(p)
        );
      }
    }
  } catch {}
  try { delete window.__agPrismWallpaper; } catch {}
  try { delete globalThis.__agPrismWallpaper; } catch {}
  try { delete window.__agPrismWallpaperFactory; } catch {}
  try { delete globalThis.__agPrismWallpaperFactory; } catch {}
  try { delete window.__agPrismWallpaperSettingsUi; } catch {}
  try { delete globalThis.__agPrismWallpaperSettingsUi; } catch {}
  try { delete window.__prismMountWallpaperUi; } catch {}
  try { delete globalThis.__prismMountWallpaperUi; } catch {}
  try { delete window.__agPrismWallpaperBridge; } catch {}
  try { delete globalThis.__agPrismWallpaperBridge; } catch {}
  try { delete window.__agPrismWallpaperResolve; } catch {}
  try { delete globalThis.__agPrismWallpaperResolve; } catch {}
  return { ok: true, status: 'off' };
})()`;

// 第七通道独立注入（本地静态/动态背景壁纸引擎 + 5 语种设置卡片）：完全独立于 Channel 1，缺文件时安全返回 ''，支持 codeHash 幂等复用与零泄漏热卸载
function buildWallpaperExpression(config = null, opts = null) {
  let minClient = '';
  let minSettingsUi = '';
  let codeHash = '';
  if (opts && typeof opts.customClientSource === 'string' && typeof opts.customSettingsUiSource === 'string') {
    minClient = opts.customClientSource ? minifySingleSource(opts.customClientSource) : '';
    minSettingsUi = opts.customSettingsUiSource ? minifySingleSource(opts.customSettingsUiSource) : '';
    codeHash = minClient && minSettingsUi ? computeHash(`${minClient}\n${minSettingsUi}`) : '';
  } else {
    const compiled = readCompiledWallpaperAssets(opts);
    minClient = compiled.minClient;
    minSettingsUi = compiled.minSettingsUi;
    codeHash = compiled.codeHash;
  }
  if (!minClient || !minSettingsUi || !codeHash) {
    return '';
  }

  const hashJson = serializeJsonForEval(codeHash);

  return `(() => {
    try {
      if (window.self !== window.top) return { ok: false, status: 'skipped-subframe' };
    } catch {
      return { ok: false, status: 'skipped-subframe' };
    }
    const hasDomMarker = () => {
      try {
        if (
          document.body &&
          document.body.classList &&
          (document.body.classList.contains('theme-standalone') || document.body.classList.contains('monaco-workbench'))
        ) {
          return true;
        }
        return Boolean(
          typeof document.querySelector === 'function' &&
            document.querySelector(
              '.agy-shell, .agy-home, [data-testid="aux-pane-split"], [data-testid="conversation-view"], [data-testid="agent-input-box"], [data-testid="model-selector-trigger"], .monaco-workbench'
            )
        );
      } catch {
        return false;
      }
    };
    let needDomMarkerOnReady = false;
    let isPlainHttpLocalhost = false;
    try {
      const loc = typeof window !== 'undefined' && window.location;
      const href = loc && typeof loc.href === 'string' ? loc.href : '';
      if (href) {
        const low = href.toLowerCase();
        if (low.startsWith('devtools://') || low.startsWith('data:') || low.startsWith('chrome:') || low.startsWith('chrome-extension:') || low.startsWith('edge:') || low.startsWith('blob:') || low.startsWith('plugin:')) {
          return { ok: false, status: 'skipped-non-host' };
        }
        if (low.startsWith('vscode-file://') || low.startsWith('app://') || low.startsWith('about:')) {
          const ttl = String(document.title || '').trim();
          if (/^(?:untitled|launchpad)$/i.test(ttl) || /\\/launchpad(?:\\.html)?(?:[?#]|$)/i.test(low)) {
            return { ok: false, status: 'skipped-non-host' };
          }
        }
        if (low.startsWith('http:') || low.startsWith('https:')) {
          const m = /^(https?):\\/\\/(127\\.0\\.0\\.1|localhost|\\[::1\\])(?::\\d+)?(\\/[^?#]*)?(?:[?#]|$)/i.exec(href);
          if (!m) return { ok: false, status: 'skipped-non-host' };
          const pathname = (m[3] || '/').toLowerCase();
          if (/^\\/(?:viewer(?:\\/|$)|sandbox(?:\\/|$)|stream(?:\\/|$)|api(?:\\/|$))/.test(pathname)) {
            return { ok: false, status: 'skipped-non-host' };
          }
          if (!hasDomMarker()) {
            isPlainHttpLocalhost = m[1].toLowerCase() === 'http';
            const rs = String(document.readyState || '');
            if (isPlainHttpLocalhost) {
              if (rs === 'loading') needDomMarkerOnReady = true;
              else return { ok: false, status: 'skipped-non-host' };
            } else if (!/\\bantigravity\\b/i.test(String(document.title || ''))) {
              if (rs === 'loading') needDomMarkerOnReady = true;
              else return { ok: false, status: 'skipped-non-host' };
            }
          }
        }
      }
    } catch {}

    const mountSettingsSlot = () => {
      try {
        const sec = document.getElementById?.('ag-cs-settings-sec') || document.getElementById?.('ag-prism-settings-sec');
        if (sec && typeof sec.__prismMountWp === 'function') {
          sec.__prismMountWp();
          return;
        }
        const slot = document.querySelector?.('[data-testid="prism-wallpaper-slot"]');
        const fn = window.__prismMountWallpaperUi || globalThis.__prismMountWallpaperUi;
        if (slot && typeof fn === 'function') fn(slot, {});
      } catch {}
    };

    const cleanupWallpaper = () => {
      try {
        document.querySelectorAll?.('#ag-prism-wallpaper-root video')?.forEach?.((v) => {
          try { v.pause?.(); } catch {}
          try { v.removeAttribute?.('src'); } catch {}
          try { v.src = ''; } catch {}
          try { v.load?.(); } catch {}
        });
      } catch {}
      try { (window.__agPrismWallpaper || globalThis.__agPrismWallpaper)?.destroy?.(); } catch {}
      try { (window.__agPrismWallpaperBridge || globalThis.__agPrismWallpaperBridge)?.dispose?.(); } catch {}
      try { document.getElementById?.('ag-prism-wallpaper-root')?.remove?.(); } catch {}
      try { document.getElementById?.('ag-prism-wallpaper-css')?.remove?.(); } catch {}
      try {
        const slot = document.querySelector?.('[data-testid="prism-wallpaper-slot"]');
        if (slot) {
          try { slot.__agPrismWpUiHandle?.destroy?.(); } catch {}
          slot.__agPrismWpUiHandle = null;
          while (slot.firstChild) slot.removeChild(slot.firstChild);
        }
      } catch {}
      try { delete window.__agPrismWallpaper; } catch {}
      try { delete globalThis.__agPrismWallpaper; } catch {}
      try { delete window.__agPrismWallpaperFactory; } catch {}
      try { delete globalThis.__agPrismWallpaperFactory; } catch {}
      try { delete window.__agPrismWallpaperSettingsUi; } catch {}
      try { delete globalThis.__agPrismWallpaperSettingsUi; } catch {}
      try { delete window.__prismMountWallpaperUi; } catch {}
      try { delete globalThis.__prismMountWallpaperUi; } catch {}
      try { delete window.__agPrismWallpaperBridge; } catch {}
      try { delete globalThis.__agPrismWallpaperBridge; } catch {}
      try { delete window.__agPrismWallpaperResolve; } catch {}
      try { delete globalThis.__agPrismWallpaperResolve; } catch {}
    };

    const targetHash = ${hashJson};
    const mountOrReuse = () => {
      if (needDomMarkerOnReady && !hasDomMarker() && (isPlainHttpLocalhost || !/\\bantigravity\\b/i.test(String(document.title || '')))) {
        return { ok: false, status: 'skipped-non-host' };
      }
      const existing = window.__agPrismWallpaper || globalThis.__agPrismWallpaper;
      const existingUi = window.__agPrismWallpaperSettingsUi || globalThis.__agPrismWallpaperSettingsUi;
      if (
        existing &&
        !existing.getDebugState?.()?.destroyed &&
        existing.__prismCodeHash === targetHash &&
        existingUi &&
        existingUi.__prismCodeHash === targetHash
      ) {
        try { existing.sync?.(); } catch {}
        mountSettingsSlot();
        return { ok: true, reused: true, codeHash: targetHash };
      }

      cleanupWallpaper();
      ;${minClient};
      ;${minSettingsUi};

      let mounted = window.__agPrismWallpaper || globalThis.__agPrismWallpaper;
      const factory = window.__agPrismWallpaperFactory || globalThis.__agPrismWallpaperFactory;
      if (!mounted && typeof factory === 'function') {
        try {
          mounted = factory({ window, document });
        } catch {}
      }
      if (mounted && typeof mounted === 'object') {
        mounted.__prismCodeHash = targetHash;
        try { window.__agPrismWallpaper = mounted; } catch {}
        try { globalThis.__agPrismWallpaper = mounted; } catch {}
      }
      const mountedUi = window.__agPrismWallpaperSettingsUi || globalThis.__agPrismWallpaperSettingsUi;
      if (mountedUi && typeof mountedUi === 'object') {
        mountedUi.__prismCodeHash = targetHash;
        try { window.__agPrismWallpaperSettingsUi = mountedUi; } catch {}
        try { globalThis.__agPrismWallpaperSettingsUi = mountedUi; } catch {}
      }
      try { mounted?.sync?.(); } catch {}
      mountSettingsSlot();
      return { ok: true, status: 'mounted', codeHash: targetHash };
    };

    if ((needDomMarkerOnReady || !document.documentElement) && typeof document.addEventListener === 'function') {
      document.addEventListener('DOMContentLoaded', () => { try { mountOrReuse(); } catch {} }, { once: true });
      return { ok: true, status: 'deferred', codeHash: targetHash };
    }
    return mountOrReuse();
  })()`;
}

const REMOVE_EXPRESSION = `(() => {
  try {
    document.querySelectorAll?.('#ag-prism-wallpaper-root video')?.forEach?.((v) => {
      try { v.pause?.(); } catch {}
      try { v.removeAttribute?.('src'); } catch {}
      try { v.src = ''; } catch {}
      try { v.load?.(); } catch {}
    });
  } catch (e) {}
  try { (window.__agPrismWallpaper || globalThis.__agPrismWallpaper)?.destroy?.(); } catch (e) {}
  try { window.__agPrismInlineDiff?.destroy?.(); } catch (e) {}
  try {
    if (window.__agPrismTelemetry && typeof window.__agPrismTelemetry.destroy === 'function') {
      window.__agPrismTelemetry.destroy();
    }
  } catch (e) {}
  try {
    if (window.__agPrismEffortSlider && typeof window.__agPrismEffortSlider.destroy === 'function') {
      window.__agPrismEffortSlider.destroy();
    }
  } catch (e) {}
  try {
    if (window.__agPrismThought && typeof window.__agPrismThought.destroy === 'function') {
      window.__agPrismThought.destroy();
    }
  } catch (e) {}
  try {
    if (window.__agPrismOmni && typeof window.__agPrismOmni.destroy === 'function') {
      window.__agPrismOmni.destroy();
    }
  } catch (e) {}
  try {
    if (window.__agPrismSidebar && typeof window.__agPrismSidebar.destroy === 'function') {
      window.__agPrismSidebar.destroy({ preserveRuntimeState: false });
    }
  } catch (e) {}
  try {
    if (window.__agPrismHostI18n && typeof window.__agPrismHostI18n.destroy === 'function') {
      window.__agPrismHostI18n.destroy();
    }
  } catch (e) {}
  try {
    window.__agPrismContextMenu?.destroy?.();
  } catch (e) {}
  if (Array.isArray(globalThis.__agCsCleanups)) {
    while (globalThis.__agCsCleanups.length) {
      const fn = globalThis.__agCsCleanups.pop();
      try {
        if (typeof fn === 'function') fn();
      } catch (e) {}
    }
  }
  delete globalThis.__agCsCleanups;
  try {
    if (window.__agPrism && typeof window.__agPrism.destroy === 'function') {
      window.__agPrism.destroy();
    } else if (window.__agClaudeStyle && typeof window.__agClaudeStyle.destroy === 'function') {
      window.__agClaudeStyle.destroy();
    }
  } catch (e) {}
  if (window.__agCsI18n && typeof window.__agCsI18n.destroy === 'function') {
    window.__agCsI18n.destroy();
  }
  try {
    if (window.__agPrismRepoBridge && typeof window.__agPrismRepoBridge.dispose === 'function') {
      window.__agPrismRepoBridge.dispose();
    }
  } catch (e) {}
  try {
    if (window.__agPrismThoughtBridge && typeof window.__agPrismThoughtBridge.dispose === 'function') {
      window.__agPrismThoughtBridge.dispose();
    }
  } catch (e) {}
  try {
    if (window.__agPrismUsageBridge && typeof window.__agPrismUsageBridge.dispose === 'function') {
      window.__agPrismUsageBridge.dispose();
    }
  } catch (e) {}
  try {
    if (window.__agPrismOmniBridge && typeof window.__agPrismOmniBridge.dispose === 'function') {
      window.__agPrismOmniBridge.dispose();
    }
  } catch (e) {}
  try {
    if (window.__agPrismSidebarBridge && typeof window.__agPrismSidebarBridge.dispose === 'function') {
      window.__agPrismSidebarBridge.dispose();
    }
  } catch (e) {}
  try {
    if (window.__agPrismWallpaperBridge && typeof window.__agPrismWallpaperBridge.dispose === 'function') {
      window.__agPrismWallpaperBridge.dispose();
    }
  } catch (e) {}
  delete window.__agPrism;
  delete window.__agClaudeStyle;
  delete window.__agPrismTelemetry;
  delete window.__agPrismEffortSlider;
  delete window.__agPrismThought;
  delete window.__agPrismThoughtSettingsUi;
  delete window.__agPrismOmni;
  delete window.__agPrismOmniBridge;
  delete window.__agPrismOmniResolve;
  delete window.__agPrismOmniServerMeta;
  delete window.__agPrismSidebar;
  delete window.__agPrismSidebarBridge;
  delete window.__agPrismSidebarResolve;
  delete window.__agPrismSidebarMeta;
  delete window.__agPrismMetricsResolve;
  delete window.__agPrismRepoBridge;
  delete window.__agPrismRepoResolve;
  delete window.__agPrismThoughtBridge;
  delete window.__agPrismThoughtOnChunk;
  delete window.__agPrismThoughtResolve;
  delete window.__agPrismUsageBridge;
  delete window.__agPrismUsageResolve;
  try { delete window.__agPrismInlineDiff; } catch {}
  try { delete window.__agPrismInlineDiffFactory; } catch {}
  try { delete window.__agPrismInlineDiffResolve; } catch {}
  try { delete window.__agPrismWallpaper; } catch {}
  try { delete window.__agPrismWallpaperFactory; } catch {}
  try { delete window.__agPrismWallpaperSettingsUi; } catch {}
  try { delete window.__prismMountWallpaperUi; } catch {}
  try { delete window.__agPrismWallpaperBridge; } catch {}
  try { delete window.__agPrismWallpaperResolve; } catch {}
  delete window.__agPrismBrandLogoSvg;
  delete window.__agPrismHostI18n;
  delete window.__agPrismHostI18nFactory;
  delete window.__agPrismContextMenu;
  delete window.__agCsI18n;
  delete globalThis.__agSP;
  delete globalThis.__agM;
  delete globalThis.__agPrismBrandLogoSvg;
  delete globalThis.__agPrismHostI18n;
  delete globalThis.__agPrismHostI18nFactory;
  delete globalThis.__agPrismContextMenu;
  delete globalThis.__agPrismTelemetry;
  delete globalThis.__agPrismEffortSlider;
  delete globalThis.__agPrismThought;
  delete globalThis.__agPrismInlineDiff;
  delete globalThis.__agPrismInlineDiffFactory;
  delete globalThis.__agPrismWallpaper;
  delete globalThis.__agPrismWallpaperFactory;
  delete globalThis.__agPrismWallpaperSettingsUi;
  delete globalThis.__prismMountWallpaperUi;
  delete globalThis.__agPrismWallpaperBridge;
  delete globalThis.__agPrismWallpaperResolve;
  delete globalThis.__agPrismOmni;
  delete globalThis.__agPrismSidebar;
  delete globalThis.__agPrismThoughtSettingsUi;
  delete globalThis.__agPrismSettingsPanel;
  delete globalThis.__agPrismHomeStudioPanel;
  delete globalThis.__agPrismHomeRippleHost;
  delete globalThis.__agPrismModelGlyphCrystal;
  delete globalThis.__agPrismStreamChoreography;
  delete globalThis.__agPrismRimCanvas;
  delete globalThis.__agPrismHostEnhancer;
  delete globalThis.__agPrismConvAura;
  delete globalThis.__agPrismSmoothCaret;
  delete globalThis.__opChromaGatesSession;
  delete globalThis.AntigravityCodexEffortSlider;
  delete globalThis.__agCodexEffortSliderDisableAutoBoot;
  delete globalThis.__agCsUiMain;
  delete globalThis.__agDualMascotRig;
  delete globalThis.__agCrystalPrismCore;
  delete globalThis.__agVialCore;
  delete globalThis.__agMotionEngine;
  delete globalThis.__agAnimatedIcons;
  delete globalThis.__agCsPulseVialBridge;
  delete globalThis.__agCsCrabAssets;
  delete globalThis.__agCsMascotCore;
  delete globalThis.__agCsRippleCore;
  delete globalThis.__agCsUsageCore;
  delete globalThis.__agCsEffortCore;
  delete globalThis.__agCsPerfAssets;
  delete globalThis.__agCsI18nCore;
  delete globalThis.__agCsLocales;
  const root = document.documentElement;
  if (root) {
    [
      'data-ag-prism',
      'data-ag-cs-style',
      'data-ag-cs-theme',
      'data-ag-cs-palette',
      'data-ag-cs-light-preset',
      'data-ag-cs-motion',
      'data-ag-cs-target-fps',
      'data-ag-cs-telemetry',
      'data-ag-cs-effort-slider',
      'data-ag-cs-effort-style',
      'data-ces-slider-ready',
      'data-ag-cs-thought-translate',
      'data-ag-prism-thought-owner',
      'data-ag-cs-home',
      'data-ag-cs-composer',
      'data-ag-cs-logo-ink',
      'data-ag-cs-sidebar',
      'data-ag-cs-sidebar-compact',
      'data-ag-cs-sidebar-collapsed',
      'data-ag-cs-sb-fold',
      'data-ag-cs-has-crab',
      'data-ag-cs-model-menu',
      'data-ag-cs-takeover-open',
      'data-ag-cs-lang',
      'data-ag-cs-cjk',
      'data-ag-cs-effort-accent',
      'data-ag-cs-perf-backdrop',
      'data-ag-cs-accent',
      'data-ag-cs-corners',
      'data-ag-cs-code-font',
      'data-ag-cs-ligatures',
      'data-ag-cs-ambient',
      'data-ag-prism-thought-view',
      'data-ag-prism-omni',
      'data-ag-prism-link-target',
      'data-ag-prism-sidebar-studio',
      'data-ag-prism-host-i18n',
      'data-ag-prism-mode',
      'data-ag-prism-sidebar-host-sync',
      'data-ag-prism-sidebar-space',
      'data-ag-cs-space',
      'data-ag-cs-space-palette',
      'data-ag-cs-space-accent',
      'data-ag-cs-win-blur',
      'data-ag-cs-scroll-bottom',
      'data-ag-cs-resizing',
      'data-ag-cs-mascot-drag',
      'data-ag-prism-wallpaper',
      'data-ag-prism-wallpaper-hole',
    ].forEach((attr) => root.removeAttribute(attr));
    if (root.getAttribute('data-ag-cjk') === '1') root.removeAttribute('data-ag-cjk');
    if (root.style && typeof root.style.removeProperty === 'function') {
      root.style.removeProperty('--ag-spring-sidebar-ease');
      root.style.removeProperty('--ag-spring-sidebar-dur');
      ['--ag-prism-wp-opacity', '--ag-prism-wp-blur', '--ag-prism-wp-blur-pad', '--ag-prism-wp-dim', '--ag-prism-wp-fit'].forEach((p) =>
        root.style.removeProperty(p)
      );
    }
  }
  const chunkParents = new Set();
  Array.from(document.querySelectorAll('.ag-cs-stream-chunk, .ag-cs-thought-chunk, .ag-cs-code-scan'))
    .reverse()
    .forEach((el) => {
      const p = el.parentNode;
      if (el.classList) {
        el.classList.remove('ag-cs-stream-chunk', 'ag-cs-thought-chunk', 'ag-cs-code-scan');
      }
      const isPureSpan =
        el.tagName === 'SPAN' &&
        (!el.classList || el.classList.length === 0) &&
        (!el.attributes ||
          Array.from(el.attributes).every(
            (a) => a.name === 'class' || a.name.startsWith('data-ag-cs-')
          ));
      if (isPureSpan && p) {
        while (el.firstChild) p.insertBefore(el.firstChild, el);
        el.remove();
        chunkParents.add(p);
      } else {
        if (el.getAttribute && el.getAttribute('class') === '') el.removeAttribute('class');
        if (typeof el.normalize === 'function') el.normalize();
      }
    });
  chunkParents.forEach((p) => {
    if (p && typeof p.normalize === 'function') p.normalize();
  });
  document.querySelectorAll('[data-ag-cs-icon-injected]').forEach((btn) => {
    btn.querySelectorAll('.ag-anim-icon').forEach((ic) => ic.remove());
    btn.querySelectorAll('[data-ag-cs-orig-svg]').forEach((svg) => {
      svg.hidden = false;
      svg.removeAttribute('hidden');
      svg.removeAttribute('data-ag-cs-orig-svg');
    });
    btn.removeAttribute('data-ag-cs-icon-injected');
  });
  document.querySelectorAll('[data-ag-row-stagger]').forEach((el) => {
    if (el.style && typeof el.style.removeProperty === 'function') {
      el.style.removeProperty('--ag-row-i');
    }
  });
  document.querySelectorAll('[data-ag-cs-overview-shell]').forEach((el) => {
    el.removeAttribute('data-ag-cs-overview-shell');
    if (el.style && typeof el.style.removeProperty === 'function') {
      el.style.removeProperty('--ag-origin-x');
      el.style.removeProperty('--ag-origin-y');
    }
  });
  [
    'data-ag-cs-caustic',
    'data-ag-cs-fiber-camp',
    'data-ag-cs-sonar',
    'data-ag-cs-stage-glide',
    'data-ag-cs-liftoff-bubble',
    'data-ag-cs-thought-streaming',
    'data-ag-cs-spark-streaming',
    'data-ag-cs-prism-cv',
    'data-ag-cs-prism-mirror',
    'data-ag-cs-prism-reflect',
    'data-ag-cs-settings-dlg',
    'data-ag-cs-settings-nav',
    'data-ag-cs-nav-active',
    'data-ag-cs-code-folded',
    'data-ag-cs-aux-dual',
    'data-ag-cs-model-overlay',
    'data-ag-cs-model-submenu',
    'data-ag-cs-orch-l2',
    'data-ag-cs-orch-l3',
    'data-ces-orch-row',
    'data-ces-model-selected',
    'data-ag-cs-row-running',
    'data-ag-row-stagger',
    'data-ces-orch-b',
    'data-ces-orch-tunable',
    'data-pv-warn',
    'data-ag-inline-diff-open',
    'data-ag-inline-diff-host',
    'data-ag-sb-more-hidden',
    'data-ag-sb-more-item',
    'data-ag-scrolling',
    'data-ag-diff-chip',
    'data-ag-diff-chip-file',
    'data-ag-diff-chip-row',
    'data-ag-diff-stat',
    'data-ag-perm-selected',
    'data-ag-perm-sandbox-sep',
    'data-ag-sub-running',
    'data-ag-sub-sec-running',
    'data-ag-overview-running',
    'data-ag-queued-act',
    'data-ag-ov-sec-anim',
    'data-ag-ov-sec-closing',
    'data-ag-diff-anim',
    'data-ag-diff-state',
    'data-ag-cs-inline-diff',
    'data-ag-prism-scope',
  ].forEach((attr) => {
    document.querySelectorAll('[' + attr + ']').forEach((el) => el.removeAttribute(attr));
  });
  document.querySelectorAll('.ag-cs-inline-diff-box, .ag-cs-diff-ctx-menu, .ag-cs-sb-more-wrap').forEach((n) => n.remove());
  document.querySelectorAll('[data-ag-cs-prism-box]').forEach((el) => {
    el.removeAttribute('data-ag-cs-prism-box');
    if (el.style && typeof el.style.removeProperty === 'function') {
      el.style.removeProperty('--ag-px');
      el.style.removeProperty('--ag-py');
    }
  });
  document.querySelectorAll('[data-ag-cs-orch-active]').forEach((el) => el.removeAttribute('data-ag-cs-orch-active'));
  document.querySelectorAll('[data-ag-cs-auto-unfolded]').forEach((el) => el.removeAttribute('data-ag-cs-auto-unfolded'));
  // Only remove Prism-owned fallback nodes & styles; NEVER touch external Pulse or external Effort Slider instances!
  document.querySelectorAll('[data-ag-prism-fallback="1"]').forEach((n) => n.remove());
  if (typeof window !== 'undefined' && window && !window.__agPulseDispose && window.__agPulseInlineInstalled === true) {
    window.__agPulseInlineInstalled = false;
  }
  document.querySelectorAll('[data-ag-prism-hidden="1"]').forEach((hiddenExtPulse) => {
    hiddenExtPulse.removeAttribute('data-ag-prism-hidden');
    const st = hiddenExtPulse.style;
    if (st) {
      if (typeof st.removeProperty === 'function') {
        ['display', 'position', 'left', 'top', 'width', 'height', 'opacity', 'pointer-events', 'visibility', 'overflow'].forEach((p) =>
          st.removeProperty(p)
        );
      } else {
        st.display = '';
        st.position = '';
        st.left = '';
        st.top = '';
        st.width = '';
        st.height = '';
        st.opacity = '';
        st.pointerEvents = '';
        st.visibility = '';
        st.overflow = '';
      }
    }
  });
  try {
    if (typeof CSS !== 'undefined' && CSS && CSS.highlights && typeof CSS.highlights.delete === 'function') {
      ['ag-stream-f0', 'ag-stream-f1', 'ag-stream-f2', 'ag-stream-f3', 'ag-stream-f4'].forEach((k) => CSS.highlights.delete(k));
      if (typeof CSS.highlights.keys === 'function') {
        for (const k of Array.from(CSS.highlights.keys())) {
          if (typeof k === 'string' && k.startsWith('ag-omni-')) CSS.highlights.delete(k);
        }
      }
    }
  } catch (e) {}
  const prismSliderStyle = document.querySelector('#ag-codex-effort-slider-styles[data-ag-prism-slider="1"]');
  if (prismSliderStyle) prismSliderStyle.remove();
  const prismHideSlider = document.getElementById('ag-prism-effort-slider-hide');
  if (prismHideSlider) prismHideSlider.remove();
  document.querySelectorAll('style[data-ag-turbo-dedup]').forEach((s) => {
    s.disabled = false;
    try { if (s.sheet) s.sheet.disabled = false; } catch (e) {}
    s.removeAttribute('data-ag-turbo-dedup');
  });
  document.querySelectorAll('img[data-ag-turbo-img]').forEach((img) => img.removeAttribute('data-ag-turbo-img'));
  const nodes = document.querySelectorAll(
    '#' + ${JSON.stringify(STYLE_ID)} +
    ', #' + ${JSON.stringify(LEGACY_STYLE_ID)} +
    ', #ag-prism-host-alert-css, #ag-prism-settings-v101-css, #ag-prism-studio-v101-css, #ag-prism-omni-css, #ag-prism-sidebar-studio-css, #ag-prism-inline-diff-css, #ag-prism-wallpaper-root, #ag-prism-wallpaper-css, #ag-cs-settings-sec, [data-testid="prism-thought-ai-config"], [data-testid="prism-thought-general-config"], .ag-omni-dock, .ag-omni-menu, .ag-prism-omni-menu, .ag-prism-omni-pane, [data-ag-prism-omni-owned="1"], [data-ag-prism-sidebar-owned="1"], .ag-prism-sidebar-studio, .ag-prism-sidebar-rail, .ag-prism-sidebar-popover, .ag-prism-sidebar-modal, .ag-cs-home-panel, .ag-cs-home-panel-seat, .ag-cs-ripple-layer, .ag-cs-ripple-host, .ag-cs-conv-aura-host, .ag-cs-crab, .ag-cs-mascot, .ag-v2-mascot-stage, .ag-v2-habitat-prop, .ag-cs-crystal-bar, [data-testid="orchestrator-effort-bar"], .ag-cs-prism-rim-cv, .ag-cs-code-fold-btn, .ag-cs-nav-outline-popover, .ag-cs-nav-outline-trigger, .ag-cs-smooth-caret, .ag-cs-perf-backdrop, .ag-cs-ctx-menu, .ag-cs-ctx-toast'
  );
  nodes.forEach((n) => n.remove());
  return { removed: nodes.length };
})()`;

module.exports = {
  STYLE_ID,
  LEGACY_STYLE_ID,
  PLUGIN_VERSION,
  SETTING_BINDING,
  LEGACY_SETTING_BINDING,
  OMNI_BINDING,
  SIDEBAR_BINDING,
  INLINE_DIFF_BINDING,
  WALLPAPER_BINDING,
  PORT_FILE,
  PID_FILE,
  CONFIG_FILE,
  DEFAULT_CONFIG,
  VALIDATORS,
  validateConfigEntry,
  reconcileConfigAliases,
  isEligibleTarget,
  readPidFromLockFile,
  inspectProcessSync,
  matchesExpectedDaemonSignature,
  isExpectedDaemonProcess,
  CDP_OPT_IN_SWITCH,
  hasRemoteDebuggingPortSwitch,
  appendCdpFlagToArguments,
  stripCdpFlagFromArguments,
  isAntigravityShortcutTarget,
  isMainAntigravityProcessSignature,
  ensureAntigravityShortcutsCdpFlag,
  ensureAntigravityShortcutsCdpFlagAsync,
  restoreAntigravityShortcutsCdpFlag,
  detectRunningAntigravityHostSync,
  detectRunningAntigravityHost,
  getRelaunchPromptStatePaths,
  hasRelaunchBeenPromptedForHost,
  recordRelaunchPromptState,
  promptUserForHostRelaunch,
  executeHostRelaunchSequence,
  normalizeMacAppBundlePath,
  MAC_DETACHED_RELAUNCH_SH,
  spawnDetachedHostRelaunchHelper,
  RUNTIME_PARTS,
  SYNC_ROOT_FILES,
  REMOVE_EXPRESSION,
  readConfig,
  writeConfig,
  invalidateConfigCache,
  readCss,
  readPort,
  listPages,
  getBrowserWsUrl,
  CdpSession,
  minifyCss,
  minifyGlsl,
  minifyJs,
  stripJsFunctionsByName,
  prepareRuntimePart,
  computeHash,
  buildConfigRefreshExpression,
  buildInjectExpression,
  BUNDLE_CACHE_SCHEMA_VERSION,
  BUNDLE_CACHE_FILENAME,
  BUNDLE_CACHE_MAX_ENTRIES,
  computeBundleSourceHash,
  computeBundleConfigHash,
  getBundleCacheStats,
  resetBundleCacheStats,
  flushPendingBundleCache,
  buildOmniClientExpression,
  buildSidebarStudioExpression,
  shouldEnableHostI18n,
  buildHostI18nExpression,
  HOST_I18N_REMOVE_EXPRESSION,
  shouldEnableThought,
  buildThoughtExpression,
  THOUGHT_REMOVE_EXPRESSION,
  buildInlineDiffInjectExpression,
  INLINE_DIFF_REMOVE_EXPRESSION,
  buildWallpaperExpression,
  WALLPAPER_REMOVE_EXPRESSION,
  isSafeV2SidebarClientSource,
};

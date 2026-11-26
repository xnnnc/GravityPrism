// Chrome DevTools Protocol (CDP) & zero-dependency bundle compiler for Obsidian Prism (obsidian-prism).
// Node >= 22: uses built-in fetch and WebSocket (zero external dependencies).
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, execFileSync, spawn } = require('child_process');

const STYLE_ID = 'ag-prism-css';
const LEGACY_STYLE_ID = 'ag-claude-style-css';
const PLUGIN_VERSION = '1.2.0';
const SETTING_BINDING = '__agPrismSetting';
const LEGACY_SETTING_BINDING = '__agClaudeStyleSetting';
const OMNI_BINDING = '__agPrismOmniCall';
const SIDEBAR_BINDING = '__agPrismSidebarCall';
const INLINE_DIFF_BINDING = '__agPrismInlineDiffCall';
const WALLPAPER_BINDING = '__agPrismWallpaperCall';
const SUGGESTER_BINDING = '__agPrismSuggestCall';
const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';
const IS_LINUX = process.platform === 'linux';

const APP_DATA = IS_MAC
  ? path.join(os.homedir(), 'Library', 'Application Support')
  : IS_WIN
  ? process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
  : process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');

const PORT_FILE = path.join(APP_DATA, 'Antigravity', 'DevToolsActivePort');
const PID_FILE = path.join(__dirname, '.watch.pid');
const CONFIG_FILE = path.join(__dirname, 'config.json');

const DEFAULT_CONFIG = {
  language: 'en',
  lang: 'en',
  palette: 'obsidian',
  lightPreset: 'crystal',
  darkAuraStyle: 'prism',
  motionLevel: 'ultra',
  targetFps: '180',
  telemetryModule: 'auto',
  effortSliderModule: 'auto',
  effortSliderStyle: 'classic',
  effortMemory: 'on',
  periodicModelPicker: 'off',
  thoughtTranslate: 'off',
  thoughtTrigger: 'preload',
  homeLayout: 'studio',
  homeMode: 'studio',
  homeRipple: true,
  convRipple: 'off',
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
  darkAura: 'balanced',
  thoughtView: 'immersive',
  omniModule: 'on',
  linkTarget: 'builtin',
  sidebarStudio: 'off',
  hostLocalization: 'off',
  autoUpdate: 'off',
  updateChannel: 'stable',
  autoArchiveOnExit: false,
  pollIntervalMs: 2500,
};

const VALIDATORS = {
  language: ['auto', 'zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'es', 'fr', 'de'],
  lang: ['auto', 'zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'es', 'fr', 'de'],
  palette: ['host', 'obsidian', 'warm', 'claude'],
  lightPreset: ['crystal', 'alabaster'],
  darkAuraStyle: ['prism', 'neon'],
  motionLevel: ['off', 'subtle', 'standard', 'ultra'],
  targetFps: ['60', '120', '180', 'native'],
  telemetryModule: ['auto', 'on', 'off'],
  effortSliderModule: ['auto', 'on', 'off'],
  effortSliderStyle: ['classic', 'prism', 'ferrofluid', 'orbital', 'oscilloscope', 'plasma', 'supernova', 'swarm'],
  effortMemory: ['on', 'off'],
  periodicModelPicker: ['on', 'off'],
  thoughtTranslate: ['off', 'machine', 'ai'],
  thoughtTrigger: ['preload', 'expand'],
  homeLayout: ['studio', 'classic', 'off'],
  homeMode: ['studio', 'classic', 'off'],
  homeRipple: 'boolean',
  convRipple: ['off', 'subtle', 'medium', 'full'],
  ripple: ['on', 'off'],
  composerRestyle: 'boolean',
  composer: ['on', 'off'],
  placeholderStyle: ['studio', 'host'],
  promptStyle: ['studio', 'host'],
  mascot: ['crab', 'minis', 'quad', 'quad-minis', 'dual', 'off'],
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
  darkAura: ['subtle', 'balanced', 'vivid'],
  thoughtView: ['immersive', 'bilingual'],
  omniModule: ['on', 'off'],
  linkTarget: ['builtin', 'external'],
  sidebarStudio: ['on', 'off'],
  hostLocalization: ['auto', 'on', 'off'],
  autoUpdate: ['on', 'off'],
  updateChannel: ['stable', 'beta'],
  autoArchiveOnExit: 'boolean',
};

function normalizeMascotConfigValue(raw) {
  if (typeof raw !== 'string') return null;
  if (raw === 'dual') return 'crab';
  if (raw === 'off' || raw === 'crab' || raw === 'minis' || raw === 'quad' || raw === 'quad-minis') return raw;
  if (!raw.startsWith('r:') || raw.length <= 2) return null;
  const m = /^r:(?:([ckdw][0-4](?:,[ckdw][0-4])*)?(\+m)?)$/.exec(raw);
  if (!m) return null;
  const counts = { c: 0, k: 0, d: 0, w: 0 };
  const seen = new Set();
  let rawTotal = 0;
  let total = 0;
  if (m[1]) {
    for (const tok of m[1].split(',')) {
      const sp = tok[0];
      const cnt = Number(tok.slice(1));
      if (seen.has(sp) || !Number.isInteger(cnt) || cnt < 0 || cnt > 4) return null;
      seen.add(sp);
      rawTotal += cnt;
      const clamped = cnt > 0 ? 1 : 0;
      counts[sp] = clamped;
      total += clamped;
    }
  }
  if (rawTotal > 6 || total > 4) return null;
  const minis = Boolean(m[2]);
  if (total === 0 && !minis) return 'off';
  if (counts.c === 1 && counts.k === 1 && counts.d === 0 && counts.w === 0) return minis ? 'minis' : 'crab';
  if (counts.c === 1 && counts.k === 1 && counts.d === 1 && counts.w === 1) return minis ? 'quad-minis' : 'quad';
  const parts = [];
  for (const sp of ['c', 'k', 'd', 'w']) {
    if (counts[sp] > 0) parts.push(sp + counts[sp]);
  }
  return 'r:' + parts.join(',') + (minis ? '+m' : '');
}

function validateConfigEntry(key, value) {
  if (key === 'pollIntervalMs') {
    return typeof value === 'number' && Number.isInteger(value) && value >= 500 && value <= 60000;
  }
  if (key === 'autoPromptCdpRelaunch') {
    return typeof value === 'boolean';
  }
  if (key === 'mascot') {
    return normalizeMascotConfigValue(value) !== null;
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
  if (typeof out.language === 'string') {
    const lowLang = out.language.trim().toLowerCase().replace(/_/g, '-');
    if (lowLang === 'yue' || lowLang.startsWith('yue-') || lowLang === 'zh-yue' || lowLang.includes('cantonese')) {
      out.language = 'zh-CN';
      out.lang = 'zh-CN';
    }
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

  if (has('convRipple')) {
    const rawCr = out.convRipple;
    if (rawCr === true) {
      out.convRipple = 'medium';
    } else if (rawCr === false) {
      out.convRipple = 'off';
    } else if (typeof rawCr === 'string') {
      const lowCr = rawCr.trim().toLowerCase();
      if (lowCr === 'true' || lowCr === 'on') out.convRipple = 'medium';
      else if (lowCr === 'false' || lowCr === 'off') out.convRipple = 'off';
      else if (lowCr === 'subtle' || lowCr === 'medium' || lowCr === 'full') out.convRipple = lowCr;
    }
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
  if (has('autoArchiveOnExit') && typeof out.autoArchiveOnExit === 'string') {
    out.autoArchiveOnExit = out.autoArchiveOnExit === 'on' || out.autoArchiveOnExit === 'true';
  }
  for (const k of ['telemetryModule', 'effortSliderModule', 'effortMemory', 'periodicModelPicker', 'omniModule', 'sidebarStudio', 'autoUpdate', 'sidebarNavFold']) {
    if (has(k) && typeof out[k] === 'boolean') {
      out[k] = out[k] ? 'on' : 'off';
    }
  }
  if (has('palette') && out.palette === 'claude') {
    out.palette = 'warm';
  }
  if (has('mascot') && typeof out.mascot === 'string') {
    const normMascot = normalizeMascotConfigValue(out.mascot);
    if (normMascot !== null) out.mascot = normMascot;
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

// 解析 Windows `tasklist /FO CSV /NH`（含可选 `/V`）标准 RFC-4180 CSV 输出
function parseWindowsTasklistCsv(csvText) {
  const rows = [];
  const lines = String(csvText || '').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || !line.startsWith('"')) continue;
    const cols = [];
    let i = 0;
    while (i < line.length) {
      if (line[i] === '"') {
        i += 1;
        let val = '';
        while (i < line.length) {
          if (line[i] === '"') {
            if (i + 1 < line.length && line[i + 1] === '"') {
              val += '"';
              i += 2;
              continue;
            }
            i += 1;
            break;
          }
          val += line[i];
          i += 1;
        }
        cols.push(val);
        while (i < line.length && line[i] !== ',') i += 1;
        if (i < line.length && line[i] === ',') i += 1;
      } else {
        const comma = line.indexOf(',', i);
        if (comma < 0) {
          cols.push(line.slice(i).trim());
          break;
        }
        cols.push(line.slice(i, comma).trim());
        i = comma + 1;
      }
    }
    if (cols.length < 2) continue;
    const pid = parseInt(String(cols[1] || '').trim(), 10);
    if (!Number.isInteger(pid) || pid <= 0) continue;
    rows.push({
      imageName: String(cols[0] || '').trim(),
      pid,
      sessionName: cols[2] || '',
      memUsage: cols[4] || '',
      status: cols[5] || '',
      windowTitle: cols.length >= 9 ? String(cols[8] || '').trim() : '',
    });
  }
  return rows;
}

// 单次原生系统探针获取进程映像名、启动时间与命令行（Windows 使用原生 tasklist CSV，零 PowerShell / 零 WMI）
function inspectProcessSync(pid, opts = null) {
  const n = Number(pid);
  if (!Number.isInteger(n) || n <= 0) return null;
  try {
    process.kill(n, 0);
  } catch (err) {
    if (!err || err.code !== 'EPERM') return null;
  }
  const hasCustomExec = Boolean(opts && typeof opts.execFileSyncFn === 'function');
  const execFn = hasCustomExec ? opts.execFileSyncFn : execFileSync;
  const platform = (opts && opts.platform) || process.platform;
  try {
    if (platform === 'win32') {
      if (n === process.pid && !hasCustomExec) {
        const startMs = Math.max(1, Math.round(Date.now() - process.uptime() * 1000));
        return {
          pid: n,
          imageName: path.basename(process.execPath) || 'node.exe',
          startTime: startMs,
          processStartMs: startMs,
          commandLine: Array.isArray(process.argv) ? process.argv.join(' ') : '',
        };
      }
      const out = execFn(
        'tasklist',
        ['/FI', `PID eq ${n}`, '/FO', 'CSV', '/NH'],
        {
          encoding: 'utf8',
          windowsHide: true,
          timeout: 5000,
          stdio: ['ignore', 'pipe', 'ignore'],
        }
      );
      const rows = parseWindowsTasklistCsv(out);
      const matched = rows.find((r) => r.pid === n);
      if (!matched || !matched.imageName) return null;
      return {
        pid: n,
        imageName: matched.imageName,
        startTime: 0,
        processStartMs: 0,
        commandLine: '',
      };
    }
    if (platform === 'linux') {
      let imageName = '';
      let commandLine = '';
      let processStartMs = 0;
      try {
        imageName = fs.readFileSync(`/proc/${n}/comm`, 'utf8').trim();
      } catch {}
      try {
        const rawCmd = fs.readFileSync(`/proc/${n}/cmdline`);
        if (rawCmd && rawCmd.length > 0) {
          commandLine = rawCmd.toString('utf8').replace(/\0+/g, ' ').trim();
        }
      } catch {}
      try {
        const statText = fs.readFileSync(`/proc/${n}/stat`, 'utf8');
        const rparen = statText.lastIndexOf(')');
        if (rparen > 0) {
          const fields = statText.slice(rparen + 2).trim().split(/\s+/);
          const startTicks = Number(fields[19]);
          if (Number.isFinite(startTicks) && startTicks > 0) {
            const procStat = fs.readFileSync('/proc/stat', 'utf8');
            const btimeMatch = /^btime\s+(\d+)$/m.exec(procStat);
            if (btimeMatch) {
              const bootSec = Number(btimeMatch[1]);
              if (Number.isFinite(bootSec) && bootSec > 0) {
                processStartMs = Math.round(bootSec * 1000 + (startTicks / 100) * 1000);
              }
            }
          }
        }
      } catch {}
      if (!processStartMs && n === process.pid && !hasCustomExec) {
        processStartMs = Math.max(1, Math.round(Date.now() - process.uptime() * 1000));
      }
      if (!imageName && !commandLine) return null;
      return {
        pid: n,
        imageName: imageName || commandLine.split(/\s+/)[0] || '',
        startTime: processStartMs,
        processStartMs,
        commandLine,
      };
    }
    // macOS / 其他 POSIX：使用 ps 单次读取 args、comm 与 lstart（UTC）
    const posixEnv = { ...process.env, LC_ALL: 'C', TZ: 'UTC' };
    const commOut = execFn('ps', ['-p', String(n), '-o', 'comm='], {
      encoding: 'utf8',
      timeout: 2500,
      stdio: ['ignore', 'pipe', 'ignore'],
      env: posixEnv,
    });
    const imageName = String(commOut || '').trim();
    if (!imageName) return null;
    let commandLine = '';
    try {
      const argsOut = execFn('ps', ['-p', String(n), '-o', 'args='], {
        encoding: 'utf8',
        timeout: 2500,
        stdio: ['ignore', 'pipe', 'ignore'],
        env: posixEnv,
      });
      commandLine = String(argsOut || '').trim();
    } catch {}
    let processStartMs = 0;
    try {
      const lstartOut = execFn('ps', ['-p', String(n), '-o', 'lstart='], {
        encoding: 'utf8',
        timeout: 2500,
        stdio: ['ignore', 'pipe', 'ignore'],
        env: posixEnv,
      });
      const rawStart = String(lstartOut || '').trim().replace(/\s+/g, ' ');
      if (rawStart) {
        const hasTz = /(?:[+-]\d{2}:?\d{2}|UTC|GMT|Z)$/i.test(rawStart);
        const parsedMs = Date.parse(hasTz ? rawStart : `${rawStart} UTC`);
        if (Number.isFinite(parsedMs) && parsedMs > 0) {
          processStartMs = Math.round(parsedMs);
        }
      }
    } catch {}
    if (processStartMs <= 0 && n === process.pid && !hasCustomExec) {
      processStartMs = Math.max(1, Math.round(Date.now() - process.uptime() * 1000));
    }
    return {
      pid: n,
      imageName,
      startTime: processStartMs,
      processStartMs,
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

// 严格识别 Linux 下的 Antigravity 主可执行目标（原生二进制、.AppImage，排除 crashpad/language_server/tools/obsidian-prism）
function isAntigravityLinuxTarget(targetPath) {
  const cleaned = String(targetPath || '').trim().replace(/^["']+|["']+$/g, '');
  if (!cleaned) return false;
  const lowPath = cleaned.replace(/\\/g, '/').toLowerCase();
  if (
    lowPath.includes('antigravity-tools') ||
    lowPath.includes('antigravity_tools') ||
    lowPath.includes('uninstall') ||
    lowPath.includes('obsidian-prism') ||
    lowPath.includes('chrome_crashpad_handler') ||
    lowPath.includes('language_server')
  ) {
    return false;
  }
  const parts = lowPath.split('/');
  const base = (parts[parts.length - 1] || '').trim();
  if (!base) return false;
  if (base === 'antigravity') return true;
  if (/^antigravity(?:[-_.][a-z0-9._+-]+)?\.appimage$/i.test(base)) return true;
  return false;
}

// 精准识别真正的 Antigravity 主进程（过滤 --type= 渲染/GPU 子进程、crashpad、language_server、sidecar_sdk 守护进程与第三方 antigravity-tools）
function isMainAntigravityProcessSignature(imageName, commandLine = '') {
  const rawImg = String(imageName || '').trim().replace(/^["']+|["']+$/g, '');
  const normImg = rawImg.replace(/\\/g, '/').toLowerCase();
  if (
    normImg.includes('antigravity-tools') ||
    normImg.includes('antigravity_tools') ||
    normImg.includes('uninstall') ||
    normImg.includes('chrome_crashpad_handler') ||
    normImg.includes('language_server')
  ) {
    return false;
  }
  const imgParts = normImg.split('/');
  const baseImg = (imgParts[imgParts.length - 1] || '').trim();
  const isValidBase =
    baseImg === 'antigravity' ||
    baseImg === 'antigravity.exe' ||
    /^antigravity(?:[-_.][a-z0-9._+-]+)?\.appimage$/i.test(baseImg);
  if (!isValidBase) {
    return false;
  }
  const normCmd = String(commandLine || '').replace(/\\/g, '/').toLowerCase();
  if (!normCmd) return true;
  if (normCmd.includes('--type=')) return false;
  if (
    normCmd.includes('chrome_crashpad_handler') ||
    normCmd.includes('language_server') ||
    normCmd.includes('sidecar_sdk') ||
    normCmd.includes('register_loader.js') ||
    normCmd.includes('sidecars/daemon/main.mjs') ||
    normCmd.includes('/daemon/main.mjs') ||
    normCmd.includes('/watch.js') ||
    normCmd.includes('--run-guard') ||
    normCmd.includes('antigravity-tools') ||
    normCmd.includes('antigravity_tools') ||
    normCmd.includes('uninstall antigravity')
  ) {
    return false;
  }
  return true;
}

// 纯 Node MS-SHLLINK (.lnk) 二进制解析与无损参数更新器（零子进程、零 PowerShell、零外部 COM）
const LNK_HEADER_SIZE = 0x4c;
const LNK_MAX_FILE_BYTES = 1024 * 1024;
const LNK_SCAN_MAX_DEPTH = 3;
const LNK_SCAN_MAX_FILES = 2000;
const LNK_CLSID = Buffer.from([
  0x01, 0x14, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00,
  0xc0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46,
]);
const LNK_FLAG_HAS_IDLIST = 0x00000001;
const LNK_FLAG_HAS_LINK_INFO = 0x00000002;
const LNK_FLAG_HAS_NAME = 0x00000004;
const LNK_FLAG_HAS_RELATIVE_PATH = 0x00000008;
const LNK_FLAG_HAS_WORKING_DIR = 0x00000010;
const LNK_FLAG_HAS_ARGUMENTS = 0x00000020;
const LNK_FLAG_HAS_ICON_LOCATION = 0x00000040;
const LNK_FLAG_IS_UNICODE = 0x00000080;

function normalizeFsComparePath(p) {
  const resolved = path.resolve(String(p || ''));
  return IS_WIN ? resolved.toLowerCase() : resolved;
}

function assertSafeRegularFileSync(filePath, maxBytes = LNK_MAX_FILE_BYTES, opts = null) {
  const resolved = path.resolve(String(filePath || ''));
  if (!resolved) throw new Error('Empty file path');
  const parentDir = path.dirname(resolved);
  const parentStat = fs.lstatSync(parentDir);
  if (parentStat.isSymbolicLink() || !parentStat.isDirectory()) {
    throw new Error(`Refusing symbolic link or non-directory parent: ${parentDir}`);
  }
  const st = fs.lstatSync(resolved);
  if (st.isSymbolicLink() || !st.isFile()) {
    throw new Error(`Refusing symbolic link or non-regular file: ${resolved}`);
  }
  if (!opts || opts.checkRealpath !== false) {
    try {
      const real = fs.realpathSync(resolved);
      const realParent = fs.realpathSync(parentDir);
      const expected = path.join(realParent, path.basename(resolved));
      if (normalizeFsComparePath(real) !== normalizeFsComparePath(expected)) {
        throw new Error(`Refusing reparse point or redirected file: ${resolved}`);
      }
    } catch (err) {
      if (err && /Refusing /.test(String(err.message || ''))) throw err;
    }
  }
  if (Number.isFinite(maxBytes) && maxBytes > 0 && st.size > maxBytes) {
    throw new Error(`Refusing oversized file (${st.size} > ${maxBytes} bytes): ${resolved}`);
  }
  return { resolved, stat: st };
}

function readNullTerminatedAnsi(buf, start, limit) {
  if (start < 0 || start >= limit || limit > buf.length) return '';
  let end = start;
  while (end < limit && buf[end] !== 0) end += 1;
  return buf.subarray(start, end).toString('latin1');
}

function readNullTerminatedUtf16LE(buf, start, limit) {
  if (start < 0 || start + 1 >= limit || limit > buf.length) return '';
  let end = start;
  while (end + 1 < limit && buf.readUInt16LE(end) !== 0) end += 2;
  return buf.subarray(start, end).toString('utf16le');
}

function joinWinPathParts(base, suffix) {
  const b = String(base || '');
  const s = String(suffix || '');
  if (!b) return s;
  if (!s) return b;
  if (b.endsWith('\\') || b.endsWith('/') || s.startsWith('\\') || s.startsWith('/')) {
    return b + s;
  }
  return `${b}\\${s}`;
}

function expandWindowsEnvVars(rawPath, env = process.env) {
  const s = String(rawPath || '');
  if (!s.includes('%') || !env || typeof env !== 'object') return s;
  const envMap = new Map();
  for (const [k, v] of Object.entries(env)) {
    if (typeof v === 'string') envMap.set(k.toLowerCase(), v);
  }
  return s.replace(/%([A-Za-z0-9_()-]+)%/g, (match, name) => {
    const val = envMap.get(String(name).toLowerCase());
    return typeof val === 'string' && val.length > 0 ? val : match;
  });
}

function extractTargetFromLinkInfo(liBuf) {
  if (!Buffer.isBuffer(liBuf) || liBuf.length < 0x1c) return '';
  const liSize = liBuf.readUInt32LE(0);
  const liHeaderSize = liBuf.readUInt32LE(4);
  const liFlags = liBuf.readUInt32LE(8);
  if (liSize < 0x1c || liHeaderSize < 0x1c || liSize > liBuf.length) return '';

  const hasUniOffsets = liHeaderSize >= 0x24 && liBuf.length >= 0x24;
  const commonSuffixOff = liBuf.readUInt32LE(24);
  let commonSuffix = '';
  if (hasUniOffsets) {
    const commonSuffixUniOff = liBuf.readUInt32LE(32);
    if (commonSuffixUniOff >= liHeaderSize && commonSuffixUniOff < liSize) {
      commonSuffix = readNullTerminatedUtf16LE(liBuf, commonSuffixUniOff, liSize);
    }
  }
  if (!commonSuffix && commonSuffixOff >= liHeaderSize && commonSuffixOff < liSize) {
    commonSuffix = readNullTerminatedAnsi(liBuf, commonSuffixOff, liSize);
  }

  if (liFlags & 0x01) {
    let localBase = '';
    if (hasUniOffsets) {
      const localBaseUniOff = liBuf.readUInt32LE(28);
      if (localBaseUniOff >= liHeaderSize && localBaseUniOff < liSize) {
        localBase = readNullTerminatedUtf16LE(liBuf, localBaseUniOff, liSize);
      }
    }
    if (!localBase) {
      const localBaseOff = liBuf.readUInt32LE(16);
      if (localBaseOff >= liHeaderSize && localBaseOff < liSize) {
        localBase = readNullTerminatedAnsi(liBuf, localBaseOff, liSize);
      }
    }
    if (localBase) return joinWinPathParts(localBase, commonSuffix);
  }

  if (liFlags & 0x02) {
    const cnrlOff = liBuf.readUInt32LE(20);
    if (cnrlOff >= liHeaderSize && cnrlOff + 20 <= liSize) {
      const cnrlSize = liBuf.readUInt32LE(cnrlOff);
      const cnrlEnd = Math.min(liSize, cnrlOff + cnrlSize);
      if (cnrlSize >= 20 && cnrlEnd <= liSize) {
        const netNameOff = liBuf.readUInt32LE(cnrlOff + 8);
        let netName = '';
        if (netNameOff > 0x14 && cnrlOff + 24 <= cnrlEnd) {
          const netNameUniOff = liBuf.readUInt32LE(cnrlOff + 20);
          if (netNameUniOff > 0 && cnrlOff + netNameUniOff < cnrlEnd) {
            netName = readNullTerminatedUtf16LE(liBuf, cnrlOff + netNameUniOff, cnrlEnd);
          }
        }
        if (!netName && netNameOff >= 20 && cnrlOff + netNameOff < cnrlEnd) {
          netName = readNullTerminatedAnsi(liBuf, cnrlOff + netNameOff, cnrlEnd);
        }
        if (netName) return joinWinPathParts(netName, commonSuffix);
      }
    }
  }
  return '';
}

function extractTargetFromExtraData(extraBuf) {
  if (!Buffer.isBuffer(extraBuf) || extraBuf.length < 4) return '';
  let off = 0;
  while (off + 4 <= extraBuf.length) {
    const blockSize = extraBuf.readUInt32LE(off);
    if (blockSize < 4) break;
    if (off + blockSize > extraBuf.length) break;
    if (blockSize >= 8) {
      const sig = extraBuf.readUInt32LE(off + 4);
      // EnvironmentVariableDataBlock (MS-SHLLINK 2.5.4)
      if (sig === 0xa0000001 && blockSize >= 0x0314) {
        const uni = readNullTerminatedUtf16LE(extraBuf, off + 268, off + 268 + 520);
        if (uni) return expandWindowsEnvVars(uni);
        const ansi = readNullTerminatedAnsi(extraBuf, off + 8, off + 8 + 260);
        if (ansi) return expandWindowsEnvVars(ansi);
      }
    }
    off += blockSize;
  }
  return '';
}

function extractTargetFromIdList(idListBuf) {
  if (!Buffer.isBuffer(idListBuf) || idListBuf.length < 4) return '';
  let off = 0;
  let drive = '';
  const segments = [];
  while (off + 2 <= idListBuf.length) {
    const itemSize = idListBuf.readUInt16LE(off);
    if (itemSize === 0) break;
    if (itemSize < 3 || off + itemSize > idListBuf.length) break;
    const item = idListBuf.subarray(off, off + itemSize);
    const type = item[2];
    if (type >= 0x20 && type <= 0x2f && itemSize >= 6) {
      const drv = readNullTerminatedAnsi(item, 3, itemSize).trim();
      if (/^[A-Za-z]:\\?$/.test(drv)) {
        drive = drv.endsWith('\\') ? drv : `${drv}\\`;
      }
    } else if (type >= 0x30 && type <= 0x3f && itemSize >= 16) {
      let name = '';
      if (itemSize >= 20) {
        const extOff = item.readUInt16LE(itemSize - 2);
        if (extOff >= 14 && extOff + 10 <= itemSize - 2) {
          const extSize = item.readUInt16LE(extOff);
          const extVer = item.readUInt16LE(extOff + 2);
          const extSig = item.readUInt32LE(extOff + 4);
          if (extSig === 0xbeef0004 && extSize >= 16 && extOff + extSize <= itemSize) {
            let nameOff = 0;
            if (extVer === 3) nameOff = extOff + 20;
            else if (extVer === 7) nameOff = extOff + 38;
            else if (extVer === 8) nameOff = extOff + 42;
            else if (extVer >= 9) nameOff = extOff + 46;
            if (nameOff > 0 && nameOff + 2 <= extOff + extSize) {
              name = readNullTerminatedUtf16LE(item, nameOff, extOff + extSize);
            }
          }
        }
      }
      if (!name) {
        if ((type & 0x04) !== 0) {
          name = readNullTerminatedUtf16LE(item, 14, itemSize);
        } else {
          name = readNullTerminatedAnsi(item, 14, itemSize);
        }
      }
      if (name) segments.push(name);
    }
    off += itemSize;
  }
  if (!drive || segments.length === 0) return '';
  return `${drive}${segments.join('\\')}`;
}

function parseWindowsLnkBuffer(buf, lnkPath = '') {
  if (!Buffer.isBuffer(buf) || buf.length < LNK_HEADER_SIZE) {
    throw new Error('Invalid .lnk file: shorter than 76-byte ShellLinkHeader');
  }
  if (buf.length > LNK_MAX_FILE_BYTES) {
    throw new Error(`Invalid .lnk file: exceeds ${LNK_MAX_FILE_BYTES} bytes`);
  }
  const headerSize = buf.readUInt32LE(0);
  if (headerSize !== LNK_HEADER_SIZE) {
    throw new Error(`Invalid .lnk HeaderSize: 0x${headerSize.toString(16)}`);
  }
  if (!buf.subarray(4, 20).equals(LNK_CLSID)) {
    throw new Error('Invalid .lnk LinkCLSID');
  }
  const flags = buf.readUInt32LE(20);
  const isUnicode = Boolean(flags & LNK_FLAG_IS_UNICODE);
  let offset = LNK_HEADER_SIZE;

  let idListStart = offset;
  let idListEnd = offset;
  let idListPayload = null;
  if (flags & LNK_FLAG_HAS_IDLIST) {
    if (offset + 2 > buf.length) throw new Error('Truncated LinkTargetIDList size');
    const idListSize = buf.readUInt16LE(offset);
    if (offset + 2 + idListSize > buf.length) throw new Error('Truncated LinkTargetIDList payload');
    idListStart = offset;
    idListPayload = buf.subarray(offset + 2, offset + 2 + idListSize);
    offset += 2 + idListSize;
    idListEnd = offset;
  }

  let linkInfoStart = offset;
  let linkInfoEnd = offset;
  let linkInfoBuf = null;
  if (flags & LNK_FLAG_HAS_LINK_INFO) {
    if (offset + 4 > buf.length) throw new Error('Truncated LinkInfo size');
    const liSize = buf.readUInt32LE(offset);
    if (liSize < 0x1c || offset + liSize > buf.length) throw new Error('Invalid or truncated LinkInfo');
    linkInfoStart = offset;
    linkInfoBuf = buf.subarray(offset, offset + liSize);
    offset += liSize;
    linkInfoEnd = offset;
  }

  const stringDataStart = offset;
  const stringSpecs = [
    [LNK_FLAG_HAS_NAME, 'name'],
    [LNK_FLAG_HAS_RELATIVE_PATH, 'relativePath'],
    [LNK_FLAG_HAS_WORKING_DIR, 'workingDir'],
    [LNK_FLAG_HAS_ARGUMENTS, 'arguments'],
    [LNK_FLAG_HAS_ICON_LOCATION, 'iconLocation'],
  ];
  const strings = {
    name: null,
    relativePath: null,
    workingDir: null,
    arguments: null,
    iconLocation: null,
  };
  const stringOffsets = {};
  let argsStart = -1;
  let argsEnd = -1;

  for (const [bit, field] of stringSpecs) {
    if (field === 'arguments' && !(flags & bit)) {
      argsStart = offset;
      argsEnd = offset;
    }
    if (!(flags & bit)) continue;
    if (offset + 2 > buf.length) throw new Error(`Truncated StringData count for ${field}`);
    const countChars = buf.readUInt16LE(offset);
    const byteLen = isUnicode ? countChars * 2 : countChars;
    if (offset + 2 + byteLen > buf.length) throw new Error(`Truncated StringData payload for ${field}`);
    const fieldStart = offset;
    const rawStr = buf.subarray(offset + 2, offset + 2 + byteLen).toString(isUnicode ? 'utf16le' : 'latin1');
    offset += 2 + byteLen;
    strings[field] = rawStr;
    stringOffsets[field] = { start: fieldStart, end: offset, countChars };
    if (field === 'arguments') {
      argsStart = fieldStart;
      argsEnd = offset;
    }
  }

  const extraDataStart = offset;
  const extraDataBuf = buf.subarray(extraDataStart);

  // 4 级目标路径解析：LinkInfo -> ExtraData(EnvironmentVariableDataBlock) -> RELATIVE_PATH -> LinkTargetIDList
  let targetPath = linkInfoBuf ? extractTargetFromLinkInfo(linkInfoBuf) : '';
  if (!targetPath) {
    targetPath = extractTargetFromExtraData(extraDataBuf);
  }
  if (!targetPath && strings.relativePath) {
    if (lnkPath) {
      targetPath = path.win32.resolve(path.win32.dirname(String(lnkPath)), strings.relativePath);
    } else {
      targetPath = strings.relativePath;
    }
  }
  if (!targetPath && idListPayload) {
    targetPath = extractTargetFromIdList(idListPayload);
  }
  // 当 LinkInfo 仅含 ANSI 且含高位字节（非纯 ASCII 本地代码页）时，优先用 UTF-16LE 的 RELATIVE_PATH / IDList 还原准确 Unicode 路径
  if (targetPath && /[^\x00-\x7f]/.test(targetPath) && linkInfoBuf && linkInfoBuf.readUInt32LE(4) < 0x24) {
    const unicodeFallback =
      extractTargetFromExtraData(extraDataBuf) ||
      (isUnicode && strings.relativePath && lnkPath
        ? path.win32.resolve(path.win32.dirname(String(lnkPath)), strings.relativePath)
        : '') ||
      (idListPayload ? extractTargetFromIdList(idListPayload) : '');
    if (unicodeFallback) targetPath = unicodeFallback;
  }

  return {
    flags,
    isUnicode,
    hasArguments: Boolean(flags & LNK_FLAG_HAS_ARGUMENTS),
    targetPath: String(targetPath || ''),
    arguments: strings.arguments || '',
    name: strings.name,
    relativePath: strings.relativePath,
    workingDir: strings.workingDir,
    iconLocation: strings.iconLocation,
    offsets: {
      idListStart,
      idListEnd,
      linkInfoStart,
      linkInfoEnd,
      stringDataStart,
      argsStart,
      argsEnd,
      extraDataStart,
      stringOffsets,
    },
  };
}

function encodeLnkStringDataField(text, isUnicode) {
  const s = String(text || '');
  if (isUnicode) {
    if (s.length > 0xffff) {
      throw new Error('StringData field exceeds MS-SHLLINK 65535 UTF-16 code units limit');
    }
    const header = Buffer.allocUnsafe(2);
    header.writeUInt16LE(s.length, 0);
    return Buffer.concat([header, Buffer.from(s, 'utf16le')]);
  }
  const payload = Buffer.from(s, 'latin1');
  if (payload.length > 0xffff) {
    throw new Error('StringData field exceeds MS-SHLLINK 65535 ANSI bytes limit');
  }
  const header = Buffer.allocUnsafe(2);
  header.writeUInt16LE(payload.length, 0);
  return Buffer.concat([header, payload]);
}

// 严格遵守 MS-SHLLINK 规范更新 COMMAND_LINE_ARGUMENTS，100% 原样保留其余 Header/IDList/LinkInfo/StringData/ExtraData 字节
function updateWindowsLnkArguments(buf, nextArguments) {
  const parsed = parseWindowsLnkBuffer(buf);
  const nextStr = String(nextArguments || '');
  const wantHasArgs = nextStr.length > 0;
  const needUnicodeUpgrade = !parsed.isUnicode && wantHasArgs && /[^\x00-\x7f]/.test(nextStr);

  if (!needUnicodeUpgrade) {
    const nextFlags = wantHasArgs
      ? (parsed.flags | LNK_FLAG_HAS_ARGUMENTS) >>> 0
      : (parsed.flags & ~LNK_FLAG_HAS_ARGUMENTS) >>> 0;
    const prefix = Buffer.from(buf.subarray(0, parsed.offsets.argsStart));
    prefix.writeUInt32LE(nextFlags, 20);
    const suffix = buf.subarray(parsed.offsets.argsEnd);
    const argChunk = wantHasArgs ? encodeLnkStringDataField(nextStr, parsed.isUnicode) : Buffer.alloc(0);
    return Buffer.concat([prefix, argChunk, suffix]);
  }

  // ANSI .lnk 写入非 ASCII 参数时，升格 IsUnicode 并无损转码现有 StringData 字段，保留 Header/IDList/LinkInfo/ExtraData 原样
  const nextFlags = ((parsed.flags | LNK_FLAG_IS_UNICODE | LNK_FLAG_HAS_ARGUMENTS) >>> 0);
  const beforeStrings = Buffer.from(buf.subarray(0, parsed.offsets.stringDataStart));
  beforeStrings.writeUInt32LE(nextFlags, 20);
  const parts = [beforeStrings];
  if (parsed.flags & LNK_FLAG_HAS_NAME) parts.push(encodeLnkStringDataField(parsed.name || '', true));
  if (parsed.flags & LNK_FLAG_HAS_RELATIVE_PATH) parts.push(encodeLnkStringDataField(parsed.relativePath || '', true));
  if (parsed.flags & LNK_FLAG_HAS_WORKING_DIR) parts.push(encodeLnkStringDataField(parsed.workingDir || '', true));
  parts.push(encodeLnkStringDataField(nextStr, true));
  if (parsed.flags & LNK_FLAG_HAS_ICON_LOCATION) parts.push(encodeLnkStringDataField(parsed.iconLocation || '', true));
  parts.push(buf.subarray(parsed.offsets.extraDataStart));
  return Buffer.concat(parts);
}

function readWindowsLnkFileSync(lnkPath) {
  const { resolved } = assertSafeRegularFileSync(lnkPath, LNK_MAX_FILE_BYTES);
  const buf = fs.readFileSync(resolved);
  const parsed = parseWindowsLnkBuffer(buf, resolved);
  return {
    lnkPath: resolved,
    targetPath: parsed.targetPath,
    arguments: parsed.arguments,
    parsed,
  };
}

function writeFileAtomicallyNoSymlinkSync(filePath, data, opts = null) {
  const resolved = path.resolve(String(filePath || ''));
  const dir = path.dirname(resolved);
  const dirStat = fs.lstatSync(dir);
  if (dirStat.isSymbolicLink() || !dirStat.isDirectory()) {
    throw new Error(`Refusing symbolic link directory: ${dir}`);
  }
  if (fs.existsSync(resolved)) {
    assertSafeRegularFileSync(resolved, (opts && opts.maxBytes) || LNK_MAX_FILE_BYTES);
  }
  const mode = (opts && opts.mode) || 0o600;
  const tmpPath = path.join(dir, `.${path.basename(resolved)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`);
  let fd = null;
  try {
    fd = fs.openSync(tmpPath, 'wx', mode);
    if (Buffer.isBuffer(data)) {
      fs.writeFileSync(fd, data);
    } else {
      fs.writeFileSync(fd, String(data), 'utf8');
    }
    try {
      fs.fsyncSync(fd);
    } catch {}
    fs.closeSync(fd);
    fd = null;

    let renamed = false;
    let lastErr = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (fs.existsSync(resolved)) {
        assertSafeRegularFileSync(resolved, (opts && opts.maxBytes) || LNK_MAX_FILE_BYTES);
      }
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
        if (fs.existsSync(resolved)) {
          assertSafeRegularFileSync(resolved, (opts && opts.maxBytes) || LNK_MAX_FILE_BYTES);
        }
        fs.copyFileSync(tmpPath, resolved);
        try { fs.unlinkSync(tmpPath); } catch {}
      } else {
        throw lastErr;
      }
    }
  } catch (err) {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch {}
    }
    try { fs.unlinkSync(tmpPath); } catch {}
    throw err;
  }
}

function writeWindowsLnkArgumentsSync(lnkPath, nextArguments) {
  const { resolved } = assertSafeRegularFileSync(lnkPath, LNK_MAX_FILE_BYTES);
  const origBuf = fs.readFileSync(resolved);
  const nextBuf = updateWindowsLnkArguments(origBuf, nextArguments);
  // 写盘前自检：确保新二进制可被严格回读且参数 100% 匹配
  const verify = parseWindowsLnkBuffer(nextBuf, resolved);
  if (verify.arguments !== String(nextArguments || '')) {
    throw new Error('Updated .lnk verification mismatch');
  }
  writeFileAtomicallyNoSymlinkSync(resolved, nextBuf, { maxBytes: LNK_MAX_FILE_BYTES });
  return { lnkPath: resolved, bytes: nextBuf.length, arguments: verify.arguments };
}

function getDefaultWindowsShortcutDirs(env = process.env) {
  const e = env || process.env;
  const userProfile = e.USERPROFILE || os.homedir();
  const appData = e.APPDATA || path.join(userProfile, 'AppData', 'Roaming');
  const publicDir = e.PUBLIC || 'C:\\Users\\Public';
  const programData = e.ProgramData || 'C:\\ProgramData';
  const rawDirs = [
    path.join(userProfile, 'Desktop'),
    e.OneDrive ? path.join(e.OneDrive, 'Desktop') : '',
    e.OneDriveConsumer ? path.join(e.OneDriveConsumer, 'Desktop') : '',
    path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    path.join(appData, 'Microsoft', 'Internet Explorer', 'Quick Launch', 'User Pinned', 'TaskBar'),
    path.join(publicDir, 'Desktop'),
    path.join(programData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
  ].filter(Boolean);
  const seen = new Set();
  const uniq = [];
  for (const d of rawDirs) {
    const resolved = path.resolve(d);
    const key = resolved.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(resolved);
  }
  return uniq;
}

function collectWindowsLnkFilesSync(searchDirs, extraFiles) {
  const dirs = Array.isArray(searchDirs)
    ? searchDirs.filter((d) => typeof d === 'string' && d.trim()).map((d) => path.resolve(d))
    : getDefaultWindowsShortcutDirs();
  const extras = Array.isArray(extraFiles) ? extraFiles : [];
  const seenFiles = new Set();
  const seenDirs = new Set();
  const files = [];

  const pushIfValidLnk = (candidate) => {
    if (files.length >= LNK_SCAN_MAX_FILES) return;
    if (!candidate || !String(candidate).toLowerCase().endsWith('.lnk')) return;
    try {
      const { resolved } = assertSafeRegularFileSync(candidate, LNK_MAX_FILE_BYTES);
      const key = resolved.toLowerCase();
      if (seenFiles.has(key)) return;
      seenFiles.add(key);
      files.push(resolved);
    } catch {}
  };

  for (const f of extras) pushIfValidLnk(f);

  const walkDir = (dirPath, depth) => {
    if (depth > LNK_SCAN_MAX_DEPTH || files.length >= LNK_SCAN_MAX_FILES) return;
    let resolvedDir;
    try {
      resolvedDir = path.resolve(dirPath);
      const dirKey = resolvedDir.toLowerCase();
      if (seenDirs.has(dirKey)) return;
      const st = fs.lstatSync(resolvedDir);
      if (st.isSymbolicLink() || !st.isDirectory()) return;
      seenDirs.add(dirKey);
    } catch {
      return;
    }
    let entries;
    try {
      entries = fs.readdirSync(resolvedDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= LNK_SCAN_MAX_FILES) break;
      if (!entry || entry.isSymbolicLink()) continue;
      const fullPath = path.join(resolvedDir, entry.name);
      if (entry.isDirectory()) {
        if (depth < LNK_SCAN_MAX_DEPTH) {
          walkDir(fullPath, depth + 1);
        }
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.lnk')) {
        pushIfValidLnk(fullPath);
      }
    }
  };

  for (const d of dirs) walkDir(d, 0);
  return files;
}

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
  const lnkFiles = collectWindowsLnkFilesSync(searchDirs, extraFiles);
  const entries = [];
  for (const lnkPath of lnkFiles) {
    try {
      const info = readWindowsLnkFileSync(lnkPath);
      if (!info.targetPath) continue;
      entries.push({
        lnkPath: info.lnkPath,
        targetPath: info.targetPath,
        arguments: info.arguments,
      });
    } catch {}
  }
  return {
    entries,
    applyUpdates(updates) {
      if (!Array.isArray(updates) || updates.length === 0) {
        return { applied: [], skipped: [] };
      }
      const applied = [];
      const skipped = [];
      for (const u of updates) {
        const p = String((u && u.lnkPath) || '').trim();
        if (!p) continue;
        try {
          writeWindowsLnkArgumentsSync(p, String((u && u.arguments) || ''));
          applied.push(p);
        } catch {
          skipped.push(p);
        }
      }
      return { applied, skipped };
    },
  };
}

async function runWindowsShortcutAdapterAsync(searchDirs, extraFiles) {
  const syncAdapter = runWindowsShortcutAdapter(searchDirs, extraFiles);
  return {
    entries: syncAdapter.entries,
    async applyUpdates(updates) {
      return syncAdapter.applyUpdates(updates);
    },
  };
}

const LINUX_DESKTOP_SHADOW_MARKER = '# obsidian-prism-shadow-of=';
const LINUX_DESKTOP_FIELD_CODE_RE = /^%[fFuUdDnNickvm]$/;
const LINUX_DEFAULT_SYSTEM_DESKTOP_DIRS = Object.freeze([
  '/usr/share/applications',
  '/usr/local/share/applications',
  '/var/lib/snapd/desktop/applications',
]);
const LINUX_GOMEMLIMIT_LINE_RE = /^GOMEMLIMIT=([0-9]+(?:B|KiB|MiB|GiB|TiB))$/;

function getDefaultLinuxDesktopDirs(opts = {}) {
  const env = opts.env || process.env;
  const home = opts.homeDir ? path.resolve(opts.homeDir) : os.homedir();
  const hasCustomHome = Boolean(opts.homeDir && path.resolve(opts.homeDir) !== path.resolve(os.homedir()));
  const xdgDataHome =
    !hasCustomHome && env && typeof env.XDG_DATA_HOME === 'string' && env.XDG_DATA_HOME.trim()
      ? path.resolve(env.XDG_DATA_HOME.trim())
      : path.join(home, '.local', 'share');
  const userAppsDir = opts.userApplicationsDir
    ? path.resolve(opts.userApplicationsDir)
    : path.join(xdgDataHome, 'applications');
  const desktopDir = path.join(home, 'Desktop');
  return {
    userAppsDir,
    searchDirs: [
      userAppsDir,
      desktopDir,
      ...LINUX_DEFAULT_SYSTEM_DESKTOP_DIRS,
    ],
  };
}

// 线性词法分词器解析 freedesktop Desktop Entry Exec= 值（支持双引号、单引号与反斜杠转义）
function tokenizeDesktopExec(execValue) {
  const s = String(execValue || '');
  const tokens = [];
  let i = 0;
  const len = s.length;
  while (i < len) {
    while (i < len && (s[i] === ' ' || s[i] === '\t')) i++;
    if (i >= len) break;
    const start = i;
    let value = '';
    let inQuote = '';
    while (i < len) {
      const ch = s[i];
      if (inQuote === '"') {
        if (ch === '\\' && i + 1 < len) {
          value += s[i + 1];
          i += 2;
          continue;
        }
        if (ch === '"') {
          inQuote = '';
          i++;
          continue;
        }
        value += ch;
        i++;
      } else if (inQuote === "'") {
        if (ch === "'") {
          inQuote = '';
          i++;
          continue;
        }
        value += ch;
        i++;
      } else {
        if (ch === ' ' || ch === '\t') break;
        if (ch === '\\' && i + 1 < len) {
          value += s[i + 1];
          i += 2;
          continue;
        }
        if (ch === '"' || ch === "'") {
          inQuote = ch;
          i++;
          continue;
        }
        value += ch;
        i++;
      }
    }
    tokens.push({ raw: s.slice(start, i), value, start, end: i });
  }
  return tokens;
}

// 从 Exec= token 序列提取真正的目标可执行路径（自动跳过前置 env 与 KEY=VAL 环境变量赋值）
function extractDesktopExecTarget(execValue) {
  const tokens = tokenizeDesktopExec(execValue);
  if (tokens.length === 0) return { target: '', targetIndex: -1, tokens };
  let idx = 0;
  const firstBase = tokens[0].value.replace(/\\/g, '/').split('/').pop().toLowerCase();
  if (firstBase === 'env') {
    idx = 1;
    while (idx < tokens.length) {
      const val = tokens[idx].value;
      if (val === '--') {
        idx += 1;
        break;
      }
      if (val.startsWith('-')) {
        idx += val === '-u' || val === '--unset' || val === '-C' || val === '--chdir' ? 2 : 1;
        continue;
      }
      if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(val)) {
        idx += 1;
        continue;
      }
      break;
    }
  }
  if (idx >= tokens.length) return { target: '', targetIndex: -1, tokens };
  return { target: tokens[idx].value, targetIndex: idx, tokens };
}

// 无损修补单条 Desktop Entry Exec= 值：保留已有 --remote-debugging-port，并在 %U/%F 等占位符前精确插入
function patchDesktopExecLine(execValue) {
  const orig = String(execValue || '');
  const { target, targetIndex, tokens } = extractDesktopExecTarget(orig);
  if (targetIndex < 0 || !isAntigravityLinuxTarget(target)) {
    return { value: orig, changed: false, matched: false, alreadySet: false };
  }
  if (hasRemoteDebuggingPortSwitch(orig)) {
    return { value: orig, changed: false, matched: true, alreadySet: true };
  }
  let fieldCodeIdx = -1;
  for (let i = targetIndex + 1; i < tokens.length; i++) {
    if (LINUX_DESKTOP_FIELD_CODE_RE.test(tokens[i].value)) {
      fieldCodeIdx = i;
      break;
    }
  }
  const rawTokens = tokens.map((t) => t.raw);
  if (fieldCodeIdx >= 0) {
    rawTokens.splice(fieldCodeIdx, 0, CDP_OPT_IN_SWITCH);
  } else {
    rawTokens.push(CDP_OPT_IN_SWITCH);
  }
  return { value: rawTokens.join(' '), changed: true, matched: true, alreadySet: false };
}

// 精准剥离单条 Desktop Entry Exec= 值中的 --remote-debugging-port=0（保留自定义端口、引号与占位符顺序）
function stripDesktopExecLine(execValue) {
  const orig = String(execValue || '');
  const { target, targetIndex, tokens } = extractDesktopExecTarget(orig);
  if (targetIndex < 0 || !isAntigravityLinuxTarget(target)) {
    return { value: orig, changed: false, matched: false };
  }
  let removed = false;
  const kept = [];
  for (let i = 0; i < tokens.length; i++) {
    if (i > targetIndex && tokens[i].value.toLowerCase() === CDP_OPT_IN_SWITCH) {
      removed = true;
      continue;
    }
    kept.push(tokens[i].raw);
  }
  if (!removed) {
    return { value: orig, changed: false, matched: true };
  }
  return { value: kept.join(' '), changed: true, matched: true };
}

function readDesktopShadowMarker(content) {
  const lines = String(content || '').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith(LINUX_DESKTOP_SHADOW_MARKER)) {
      const orig = trimmed.slice(LINUX_DESKTOP_SHADOW_MARKER.length).trim();
      return orig || null;
    }
  }
  return null;
}

function isManagedPrismDesktopContent(content) {
  return /^\s*X-ObsidianPrism-Managed\s*=\s*true\s*$/im.test(String(content || ''));
}

// 解析并修补整份 .desktop 内容（支持 [Desktop Entry] 与多个 [Desktop Action ...] 段）
function patchDesktopEntryContent(rawContent, opts = {}) {
  const lines = String(rawContent || '').replace(/\r\n/g, '\n').split('\n');
  let inSupportedSection = false;
  let matched = false;
  let changed = false;
  let alreadySet = false;
  let patchedExecCount = 0;
  const outLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return line;
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      inSupportedSection = trimmed === '[Desktop Entry]' || trimmed.startsWith('[Desktop Action ');
      return line;
    }
    if (!inSupportedSection) return line;
    const execMatch = /^(\s*Exec\s*=\s*)(.*)$/.exec(line);
    if (!execMatch) return line;
    const res = patchDesktopExecLine(execMatch[2]);
    if (res.matched) {
      matched = true;
      if (res.changed) {
        changed = true;
        patchedExecCount += 1;
        return execMatch[1] + res.value;
      }
      if (res.alreadySet) {
        alreadySet = true;
      }
    }
    return line;
  });
  if (matched && changed && opts.shadowOf && !readDesktopShadowMarker(rawContent)) {
    const safeOrig = String(opts.shadowOf).replace(/[\r\n]+/g, ' ').trim();
    if (safeOrig) {
      outLines.unshift(`${LINUX_DESKTOP_SHADOW_MARKER}${safeOrig}`);
    }
  }
  return {
    content: outLines.join('\n'),
    matched,
    changed,
    alreadySet: matched && !changed && alreadySet,
    patchedExecCount,
  };
}

// 卸载还原整份 .desktop 内容中的 --remote-debugging-port=0
function stripDesktopEntryContent(rawContent) {
  const lines = String(rawContent || '').replace(/\r\n/g, '\n').split('\n');
  let inSupportedSection = false;
  let matched = false;
  let changed = false;
  const outLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return line;
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      inSupportedSection = trimmed === '[Desktop Entry]' || trimmed.startsWith('[Desktop Action ');
      return line;
    }
    if (!inSupportedSection) return line;
    const execMatch = /^(\s*Exec\s*=\s*)(.*)$/.exec(line);
    if (!execMatch) return line;
    const res = stripDesktopExecLine(execMatch[2]);
    if (res.matched) {
      matched = true;
      if (res.changed) {
        changed = true;
        return execMatch[1] + res.value;
      }
    }
    return line;
  });
  return { content: outLines.join('\n'), matched, changed };
}

function isPathInsideDir(filePath, dirPath) {
  if (!filePath || !dirPath) return false;
  const rel = path.relative(path.resolve(dirPath), path.resolve(filePath));
  return Boolean(rel && !rel.startsWith('..') && !path.isAbsolute(rel));
}

function isLinuxReadOnlyOrSystemDesktopPath(filePath, systemDirs) {
  const resolved = path.resolve(filePath);
  const dirs = Array.isArray(systemDirs) && systemDirs.length > 0 ? systemDirs : LINUX_DEFAULT_SYSTEM_DESKTOP_DIRS;
  for (const sysDir of dirs) {
    if (!sysDir) continue;
    const normSys = path.resolve(sysDir);
    if (resolved === normSys || isPathInsideDir(resolved, normSys)) {
      return true;
    }
  }
  try {
    fs.accessSync(resolved, fs.constants.W_OK);
    fs.accessSync(path.dirname(resolved), fs.constants.W_OK);
    return false;
  } catch {
    return true;
  }
}

function writeDesktopFileAtomicSync(filePath, content, fileMode = 0o644) {
  const resolved = path.resolve(filePath);
  const dir = path.dirname(resolved);
  if (isSymlinkPathSync(dir) || isSymlinkPathSync(resolved)) {
    throw new Error(`Refusing symbolic link desktop path: ${resolved}`);
  }
  fs.mkdirSync(dir, { recursive: true });
  if (isSymlinkPathSync(dir) || isSymlinkPathSync(resolved)) {
    throw new Error(`Refusing symbolic link desktop path: ${resolved}`);
  }
  const tmpPath = `${resolved}.tmp.${process.pid}.${crypto.randomBytes(6).toString('hex')}`;
  let fd = null;
  try {
    fd = fs.openSync(tmpPath, 'wx', fileMode);
    fs.writeFileSync(fd, content, 'utf8');
    fs.closeSync(fd);
    fd = null;
    try { fs.chmodSync(tmpPath, fileMode); } catch {}
    if (isSymlinkPathSync(dir) || isSymlinkPathSync(resolved)) {
      throw new Error(`Refusing symbolic link desktop path: ${resolved}`);
    }
    fs.renameSync(tmpPath, resolved);
    try { fs.chmodSync(resolved, fileMode); } catch {}
  } catch (err) {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch {}
    }
    try { fs.unlinkSync(tmpPath); } catch {}
    throw err;
  }
}

function ensureLinuxDesktopShortcutsCdpFlag(opts = {}) {
  const defaults = getDefaultLinuxDesktopDirs(opts);
  const userAppsDir = defaults.userAppsDir;
  const searchDirs = Array.isArray(opts.searchDirs) && opts.searchDirs.length > 0
    ? opts.searchDirs.map((d) => path.resolve(d))
    : defaults.searchDirs.map((d) => path.resolve(d));
  const systemDirs = Array.isArray(opts.systemDirs)
    ? [...LINUX_DEFAULT_SYSTEM_DESKTOP_DIRS, ...opts.systemDirs.map((d) => path.resolve(d))]
    : [...LINUX_DEFAULT_SYSTEM_DESKTOP_DIRS];

  let scanned = 0;
  let matched = 0;
  const patched = [];
  const alreadySet = [];
  const skipped = [];
  const shadowCreated = [];
  const seenFiles = new Set();
  const userBasenames = new Set();

  // 预先记录用户 applications 目录中已有的 .desktop basename，用于识别已存在的 XDG 覆盖
  try {
    if (fs.existsSync(userAppsDir) && !isSymlinkPathSync(userAppsDir)) {
      for (const name of fs.readdirSync(userAppsDir)) {
        if (name.endsWith('.desktop')) {
          userBasenames.add(name);
        }
      }
    }
  } catch {}

  for (const dir of searchDirs) {
    if (!dir) continue;
    try {
      const dirLst = fs.lstatSync(dir);
      if (dirLst.isSymbolicLink() || !dirLst.isDirectory()) {
        if (dirLst.isSymbolicLink()) skipped.push(dir);
        continue;
      }
    } catch {
      continue;
    }

    let names = [];
    try {
      names = fs.readdirSync(dir).filter((n) => n.endsWith('.desktop')).sort();
    } catch {
      continue;
    }

    for (const name of names) {
      const filePath = path.join(dir, name);
      if (seenFiles.has(filePath)) continue;
      seenFiles.add(filePath);

      let st;
      try {
        st = fs.lstatSync(filePath);
      } catch {
        continue;
      }
      if (st.isSymbolicLink()) {
        skipped.push(filePath);
        continue;
      }
      if (!st.isFile()) continue;

      const isSystemOrRo = isLinuxReadOnlyOrSystemDesktopPath(filePath, systemDirs);
      // 若系统目录的 .desktop 在用户 applications 目录已有同名条目，则遵循 XDG 优先级跳过
      if (isSystemOrRo && userBasenames.has(name) && !isPathInsideDir(filePath, userAppsDir)) {
        continue;
      }

      scanned += 1;
      let rawContent = '';
      try {
        rawContent = fs.readFileSync(filePath, 'utf8');
      } catch {
        skipped.push(filePath);
        continue;
      }

      const patchRes = patchDesktopEntryContent(rawContent, isSystemOrRo ? { shadowOf: filePath } : {});
      if (!patchRes.matched) continue;
      matched += 1;

      if (!patchRes.changed) {
        alreadySet.push(filePath);
        continue;
      }

      if (isSystemOrRo) {
        const shadowPath = path.join(userAppsDir, name);
        if (isSymlinkPathSync(userAppsDir) || isSymlinkPathSync(shadowPath)) {
          skipped.push(shadowPath);
          continue;
        }
        try {
          writeDesktopFileAtomicSync(shadowPath, patchRes.content, 0o644);
          userBasenames.add(name);
          patched.push(shadowPath);
          shadowCreated.push({ shadowPath, originalPath: filePath });
        } catch {
          skipped.push(filePath);
        }
      } else {
        try {
          const mode = (st.mode & 0o777) || 0o644;
          writeDesktopFileAtomicSync(filePath, patchRes.content, mode);
          patched.push(filePath);
        } catch {
          skipped.push(filePath);
        }
      }
    }
  }

  if (opts.pluginDir && patched.length > 0) {
    const prev = readPatchedShortcutsRecord(opts.pluginDir);
    writePatchedShortcutsRecord(opts.pluginDir, [...prev, ...patched]);
  }

  return {
    supported: true,
    scanned,
    matched,
    patched,
    alreadySet,
    skipped,
    shadowCreated,
  };
}

function restoreLinuxDesktopShortcutsCdpFlag(opts = {}) {
  const defaults = getDefaultLinuxDesktopDirs(opts);
  const userAppsDir = defaults.userAppsDir;
  const searchDirs = Array.isArray(opts.searchDirs) && opts.searchDirs.length > 0
    ? opts.searchDirs.map((d) => path.resolve(d))
    : [userAppsDir, path.join(opts.homeDir ? path.resolve(opts.homeDir) : os.homedir(), 'Desktop')];
  const systemDirs = Array.isArray(opts.systemDirs)
    ? [...LINUX_DEFAULT_SYSTEM_DESKTOP_DIRS, ...opts.systemDirs.map((d) => path.resolve(d))]
    : [...LINUX_DEFAULT_SYSTEM_DESKTOP_DIRS];

  const recorded = opts.pluginDir ? readPatchedShortcutsRecord(opts.pluginDir) : [];
  const candidates = new Set();
  for (const p of recorded) {
    if (typeof p === 'string' && p.endsWith('.desktop')) {
      candidates.add(path.resolve(p));
    }
  }
  for (const dir of searchDirs) {
    if (!dir) continue;
    try {
      const dirLst = fs.lstatSync(dir);
      if (dirLst.isSymbolicLink() || !dirLst.isDirectory()) continue;
      for (const name of fs.readdirSync(dir)) {
        if (name.endsWith('.desktop')) {
          candidates.add(path.join(dir, name));
        }
      }
    } catch {}
  }

  const restored = [];
  const skipped = [];
  const shadowRemoved = [];

  for (const filePath of candidates) {
    let st;
    try {
      st = fs.lstatSync(filePath);
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) {
      skipped.push(filePath);
      continue;
    }
    if (!st.isFile()) continue;
    if (isLinuxReadOnlyOrSystemDesktopPath(filePath, systemDirs)) {
      continue;
    }
    let rawContent = '';
    try {
      rawContent = fs.readFileSync(filePath, 'utf8');
    } catch {
      skipped.push(filePath);
      continue;
    }
    if (isManagedPrismDesktopContent(rawContent)) {
      continue;
    }
    const shadowOf = readDesktopShadowMarker(rawContent);
    if (shadowOf) {
      try {
        if (isSymlinkPathSync(path.dirname(filePath)) || isSymlinkPathSync(filePath)) {
          skipped.push(filePath);
          continue;
        }
        fs.unlinkSync(filePath);
        restored.push(filePath);
        shadowRemoved.push({ shadowPath: filePath, originalPath: shadowOf });
      } catch {
        skipped.push(filePath);
      }
      continue;
    }
    const stripped = stripDesktopEntryContent(rawContent);
    if (!stripped.changed) continue;
    try {
      const mode = (st.mode & 0o777) || 0o644;
      writeDesktopFileAtomicSync(filePath, stripped.content, mode);
      restored.push(filePath);
    } catch {
      skipped.push(filePath);
    }
  }

  if (opts.pluginDir) {
    try {
      const recFile = path.join(opts.pluginDir, PATCHED_SHORTCUTS_FILENAME);
      if (fs.existsSync(recFile) && !isSymlinkPathSync(recFile)) fs.unlinkSync(recFile);
    } catch {}
  }

  return {
    supported: true,
    restored,
    skipped,
    shadowRemoved,
  };
}

// 严格按白名单正则读取 ~/.config/environment.d/90-obsidian-prism-gomemlimit.conf（零 source / eval，拦截 symlink）
function readLinuxGoMemLimitFromEnvD(opts = {}) {
  const env = opts.env || process.env;
  const home = opts.homeDir ? path.resolve(opts.homeDir) : os.homedir();
  const hasCustomHome = Boolean(opts.homeDir && path.resolve(opts.homeDir) !== path.resolve(os.homedir()));
  const xdgConfig =
    !hasCustomHome && env && typeof env.XDG_CONFIG_HOME === 'string' && env.XDG_CONFIG_HOME.trim()
      ? path.resolve(env.XDG_CONFIG_HOME.trim())
      : path.join(home, '.config');
  const confPath = opts.envFile
    ? path.resolve(opts.envFile)
    : path.join(xdgConfig, 'environment.d', '90-obsidian-prism-gomemlimit.conf');
  try {
    const dir = path.dirname(confPath);
    if (isSymlinkPathSync(dir) || isSymlinkPathSync(confPath)) return '';
    const st = fs.lstatSync(confPath);
    if (!st.isFile()) return '';
    const lines = fs.readFileSync(confPath, 'utf8').split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const m = LINUX_GOMEMLIMIT_LINE_RE.exec(line);
      if (m && m[1]) return m[1];
    }
    return '';
  } catch {
    return '';
  }
}

// 异步非阻塞版：供常驻 Daemon 事件循环后台巡检快捷方式，避免 execFileSync 卡死 CDP RPC 与 Omni 流式媒体
async function ensureAntigravityShortcutsCdpFlagAsync(opts = {}) {
  const effectivePlatform = opts.platformOverride || process.platform;
  if (effectivePlatform === 'linux' && typeof opts.shortcutAdapter !== 'function') {
    return ensureLinuxDesktopShortcutsCdpFlag(opts);
  }
  const isWinPlatform = effectivePlatform === 'win32';
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

// 扫描并无损为 Antigravity 快捷方式（Windows .lnk / Linux XDG .desktop）补齐 --remote-debugging-port=0
function ensureAntigravityShortcutsCdpFlag(opts = {}) {
  const effectivePlatform = opts.platformOverride || process.platform;
  if (effectivePlatform === 'linux' && typeof opts.shortcutAdapter !== 'function') {
    return ensureLinuxDesktopShortcutsCdpFlag(opts);
  }
  const isWinPlatform = effectivePlatform === 'win32';
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

// 卸载时精准剥离 Antigravity 快捷方式（Windows .lnk / Linux XDG .desktop + Shadow Copy 撤回）中的 --remote-debugging-port=0
function restoreAntigravityShortcutsCdpFlag(opts = {}) {
  const effectivePlatform = opts.platformOverride || process.platform;
  if (effectivePlatform === 'linux' && typeof opts.shortcutAdapter !== 'function') {
    return restoreLinuxDesktopShortcutsCdpFlag(opts);
  }
  const isWinPlatform = effectivePlatform === 'win32';
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

function isElectronHostBinaryPath(rawPath) {
  const s = String(rawPath || '').trim();
  if (!s) return false;
  const base = path.basename(s);
  if (/^(?:antigravity|agy)(?:\.exe)?$/i.test(base)) return true;
  if (/Antigravity(?:\s+Helper(?:\s+\([^)]+\))?)?\.app[\\/]Contents[\\/]MacOS[\\/]/i.test(s)) return true;
  return false;
}

function resolveWindowsDetachedNodeRuntime(opts = {}) {
  const raw = String(opts.nodeExecPath || process.execPath || '').trim();
  const existsFn = typeof opts.existsSync === 'function' ? opts.existsSync : fs.existsSync;
  const execFn = typeof opts.execFileSyncFn === 'function' ? opts.execFileSyncFn : execFileSync;
  if (raw && !isElectronHostBinaryPath(raw)) {
    return { execPath: path.resolve(raw), useElectronAsNode: false };
  }
  const candidates = [];
  try {
    const out = execFn('where.exe', ['node.exe'], {
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
  for (const cand of candidates) {
    if (isElectronHostBinaryPath(cand)) continue;
    try {
      if (existsFn(cand)) {
        return { execPath: path.resolve(cand), useElectronAsNode: false };
      }
    } catch {}
  }
  if (raw) {
    return { execPath: path.resolve(raw), useElectronAsNode: true };
  }
  return { execPath: process.execPath, useElectronAsNode: isElectronHostBinaryPath(process.execPath) };
}

function normalizeLoopbackPort(rawPort) {
  const n = Number(rawPort);
  return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : 0;
}

function readPortFromCustomOrDefaultFile(portFile = null) {
  if (portFile) {
    try {
      const text = fs.readFileSync(portFile, 'utf8');
      const port = parseInt(text.split(/\r?\n/)[0].trim(), 10);
      return normalizeLoopbackPort(port) || null;
    } catch {
      return null;
    }
  }
  return normalizeLoopbackPort(readPort()) || null;
}

function isAntigravityCdpVersionInfo(info, port) {
  if (!info || typeof info !== 'object') return false;
  const browserSig = `${String(info.Browser || '')} ${String(info['User-Agent'] || '')}`;
  if (/\bEdg\//i.test(browserSig) && !/\bAntigravity\b/i.test(browserSig)) {
    return false;
  }
  const wsUrl = typeof info.webSocketDebuggerUrl === 'string' ? info.webSocketDebuggerUrl.trim() : '';
  if (!wsUrl) return false;
  try {
    const parsed = new URL(wsUrl);
    const hostOk = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost' || parsed.hostname === '[::1]';
    const portNum = parsed.port ? Number(parsed.port) : 80;
    return parsed.protocol === 'ws:' && hostOk && portNum === port && parsed.pathname.startsWith('/devtools/browser/');
  } catch {
    return false;
  }
}

async function probeLoopbackCdpVersionAsync(port, opts = {}) {
  const p = normalizeLoopbackPort(port);
  if (!p) return false;
  if (typeof opts.probeCdpVersionAsync === 'function') {
    return Boolean(await opts.probeCdpVersionAsync(p));
  }
  const fetchImpl = typeof opts.fetchImpl === 'function' ? opts.fetchImpl : globalThis.fetch;
  if (typeof fetchImpl !== 'function') return false;
  const timeoutMs = Math.max(200, Math.min(5000, Number(opts.timeoutMs) || 1000));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`http://127.0.0.1:${p}/json/version`, { signal: controller.signal });
    if (!res || !res.ok) return false;
    const info = await res.json();
    return isAntigravityCdpVersionInfo(info, p);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function probeLoopbackCdpVersionSync(port, opts = {}) {
  const p = normalizeLoopbackPort(port);
  if (!p) return false;
  if (typeof opts.probeCdpVersionSync === 'function') {
    return Boolean(opts.probeCdpVersionSync(p));
  }
  const timeoutMs = Math.max(200, Math.min(4000, Number(opts.timeoutMs) || 1000));
  const runtime = resolveWindowsDetachedNodeRuntime(opts);
  const env = { ...process.env };
  if (runtime.useElectronAsNode) env.ELECTRON_RUN_AS_NODE = '1';
  else delete env.ELECTRON_RUN_AS_NODE;
  const probeCode = [
    "const http = require('node:http');",
    `const req = http.get({ host: '127.0.0.1', port: ${p}, path: '/json/version', timeout: ${timeoutMs} }, (res) => {`,
    "  if (res.statusCode !== 200) { process.exit(1); }",
    "  let body = '';",
    "  res.setEncoding('utf8');",
    "  res.on('data', (c) => { body += c; if (body.length > 65536) process.exit(1); });",
    "  res.on('end', () => {",
    "    try {",
    "      const info = JSON.parse(body);",
    "      const sig = String(info.Browser || '') + ' ' + String(info['User-Agent'] || '');",
    "      if (/\\bEdg\\//i.test(sig) && !/\\bAntigravity\\b/i.test(sig)) process.exit(1);",
    "      const u = new URL(String(info.webSocketDebuggerUrl || ''));",
    `      const ok = u.protocol === 'ws:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost' || u.hostname === '[::1]') && Number(u.port || 80) === ${p} && u.pathname.startsWith('/devtools/browser/');`,
    "      process.exit(ok ? 0 : 1);",
    "    } catch { process.exit(1); }",
    "  });",
    "});",
    "req.on('timeout', () => { try { req.destroy(); } catch {} process.exit(1); });",
    "req.on('error', () => process.exit(1));",
  ].join(' ');
  try {
    execFileSync(runtime.execPath, ['-e', probeCode], {
      env,
      windowsHide: true,
      timeout: timeoutMs + 1000,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function resolveInstalledAntigravityExeWin(opts = {}) {
  const env = (opts && opts.env) || process.env;
  const existsFn = typeof opts.existsSync === 'function' ? opts.existsSync : fs.existsSync;
  if (opts && typeof opts.exePath === 'string' && opts.exePath.trim()) {
    return opts.exePath.trim();
  }
  const localApp = (env && env.LOCALAPPDATA) || path.join(os.homedir(), 'AppData', 'Local');
  const progFiles = (env && env.ProgramFiles) || 'C:\\Program Files';
  const candidates = [
    path.join(localApp, 'Programs', 'antigravity', 'Antigravity.exe'),
    path.join(localApp, 'antigravity', 'Antigravity.exe'),
    path.join(progFiles, 'Antigravity', 'Antigravity.exe'),
  ];
  if (isElectronHostBinaryPath(process.execPath) && String(process.execPath).toLowerCase().endsWith('.exe')) {
    candidates.unshift(process.execPath);
  }
  for (const c of candidates) {
    try {
      if (existsFn(c)) return c;
    } catch {}
  }
  return candidates[0];
}

function collectKnownPrismDaemonPids(opts = {}) {
  const excluded = new Set([process.pid]);
  if (Array.isArray(opts.excludePids)) {
    for (const p of opts.excludePids) {
      const n = Number(p);
      if (Number.isInteger(n) && n > 0) excluded.add(n);
    }
  }
  const lockFiles = Array.isArray(opts.daemonPidFiles)
    ? opts.daemonPidFiles
    : [
        path.join(__dirname, '.daemon.pid'),
        path.join(__dirname, '.watch.pid'),
        process.env.AG_PRISM_PLUGIN_DIR ? path.join(process.env.AG_PRISM_PLUGIN_DIR, '.daemon.pid') : '',
        path.join(os.homedir(), '.gemini', 'config', 'plugins', 'obsidian-prism', '.daemon.pid'),
      ];
  for (const lf of lockFiles) {
    if (!lf) continue;
    const pid = readPidFromLockFile(lf);
    if (pid && pid > 0) excluded.add(pid);
  }
  return excluded;
}

function readAntigravitySessionStartHintMs(opts = {}) {
  const dataDir =
    (opts && opts.antigravityDataDir) ||
    path.join(APP_DATA, 'Antigravity');
  const candidates = [
    opts && opts.portFile ? opts.portFile : path.join(dataDir, 'DevToolsActivePort'),
    path.join(dataDir, 'lockfile'),
    path.join(dataDir, 'SingletonLock'),
  ];
  for (const p of candidates) {
    try {
      const st = fs.statSync(p);
      if (st && st.mtimeMs > 0) return Math.round(st.mtimeMs);
    } catch {}
  }
  return 0;
}

const WIN_NON_MAIN_TITLES_RE = /^(?:|n\/a|暂缺|olemainthreadwndname|default ime|msctfime ui)$/i;

function isMeaningfulWindowsHostTitle(rawTitle) {
  const t = String(rawTitle || '').trim();
  if (!t || WIN_NON_MAIN_TITLES_RE.test(t)) return false;
  // 中文 CP936 "暂缺" 在 UTF-8 解码下为短替换符串（<=4 字符且全是 U+FFFD 或非可见 ASCII）
  if (t.length <= 4 && /^[\ufffd\x80-\xff]+$/.test(t)) return false;
  return true;
}

function buildWindowsHostCandidatesFromTasklist(csvText, opts = {}) {
  const rows = parseWindowsTasklistCsv(csvText);
  if (rows.length === 0) return [];
  const excluded = collectKnownPrismDaemonPids(opts);
  const matching = rows.filter(
    (r) => r.imageName.toLowerCase() === 'antigravity.exe' && !excluded.has(r.pid)
  );
  if (matching.length === 0) return [];

  const withTitle = matching.filter((r) => isMeaningfulWindowsHostTitle(r.windowTitle));
  const selectedRows = withTitle.length > 0 ? withTitle : matching;
  const exePath = resolveInstalledAntigravityExeWin(opts);
  const hasActiveCdp = Boolean(opts.hasActiveCdp);
  const startMsHint = Number(opts.startMsHint) > 0 ? Number(opts.startMsHint) : readAntigravitySessionStartHintMs(opts);
  const commandLine = hasActiveCdp ? `"${exePath}" ${CDP_OPT_IN_SWITCH}` : `"${exePath}"`;

  return selectedRows.map((r) => ({
    pid: r.pid,
    imageName: r.imageName,
    startMs: startMsHint,
    exePath,
    commandLine,
  }));
}

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

function extractPosixCommandExecutable(cmdLine) {
  const s = String(cmdLine || '').trim();
  if (!s) return '';
  if (s[0] === '"' || s[0] === "'") {
    const q = s[0];
    let out = '';
    for (let i = 1; i < s.length; i++) {
      const ch = s[i];
      if (q === '"' && ch === '\\' && i + 1 < s.length) {
        out += s[i + 1];
        i += 1;
        continue;
      }
      if (ch === q) break;
      out += ch;
    }
    return out;
  }
  const macAppIdx = s.indexOf('.app/Contents/MacOS/');
  if (macAppIdx > 0) {
    const slashAfter = s.indexOf(' ', macAppIdx + 20);
    return slashAfter > 0 ? s.slice(0, slashAfter) : s;
  }
  const linuxSpacedMatch = /^(\/[^\0]*?\/(?:antigravity(?:[-_.][^\s/]+\.appimage|\.appimage)?))(?=\s|$)/i.exec(s);
  if (linuxSpacedMatch && linuxSpacedMatch[1]) {
    return linuxSpacedMatch[1];
  }
  const spIdx = s.indexOf(' ');
  return spIdx > 0 ? s.slice(0, spIdx) : s;
}

function parseAppImageFromProcEnviron(rawEnviron) {
  if (!rawEnviron) return '';
  const text = Buffer.isBuffer(rawEnviron) ? rawEnviron.toString('utf8') : String(rawEnviron);
  const parts = text.split(/\0|\r?\n/);
  for (const entry of parts) {
    if (entry.startsWith('APPIMAGE=')) {
      const val = entry.slice('APPIMAGE='.length).trim();
      if (val) return val;
    }
  }
  return '';
}

function parsePosixPsHostCandidates(psStdout, nowMs = Date.now(), opts = null) {
  const effectivePlatform = (opts && opts.platformOverride) || process.platform;
  const isMacPlatform = effectivePlatform === 'darwin';
  const isLinuxPlatform = effectivePlatform === 'linux';
  const readProcExe =
    opts && typeof opts.readProcExe === 'function'
      ? opts.readProcExe
      : isLinuxPlatform && IS_LINUX
        ? (pid) => {
            try {
              return fs.readlinkSync(`/proc/${pid}/exe`);
            } catch {
              return '';
            }
          }
        : null;
  const readProcEnviron =
    opts && typeof opts.readProcEnviron === 'function'
      ? opts.readProcEnviron
      : isLinuxPlatform && IS_LINUX
        ? (pid) => {
            try {
              return fs.readFileSync(`/proc/${pid}/environ`);
            } catch {
              return '';
            }
          }
        : null;

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
    const lowCmd = cmdLine.toLowerCase();
    const looksRelevant = lowCmd.includes('antigravity') || lowCmd.includes('.mount_antigr');
    let procExe = '';
    let appImagePath = '';
    if (isLinuxPlatform && (looksRelevant || (opts && opts.probeAllProc))) {
      if (readProcExe) {
        try {
          procExe = String(readProcExe(pid) || '').replace(/\s+\(deleted\)$/, '').trim();
        } catch {
          procExe = '';
        }
      }
      if (readProcEnviron) {
        try {
          appImagePath = parseAppImageFromProcEnviron(readProcEnviron(pid));
        } catch {
          appImagePath = '';
        }
      }
    }
    if (!looksRelevant && !isAntigravityLinuxTarget(procExe) && !isAntigravityLinuxTarget(appImagePath)) {
      continue;
    }
    const firstExe = extractPosixCommandExecutable(cmdLine);
    let appBundlePath = firstExe;
    const appEnd = firstExe.indexOf('.app/');
    if (appEnd > 0) {
      appBundlePath = firstExe.slice(0, appEnd + 4);
    }
    let resolvedExePath = isMacPlatform && appBundlePath.endsWith('.app') ? appBundlePath : firstExe;
    let resolvedImageName = firstExe;
    if (isLinuxPlatform) {
      if (appImagePath && isAntigravityLinuxTarget(appImagePath)) {
        resolvedExePath = appImagePath;
        if (!isAntigravityLinuxTarget(resolvedImageName)) {
          resolvedImageName = appImagePath;
        }
      } else if (procExe && isAntigravityLinuxTarget(procExe)) {
        resolvedExePath = procExe;
        if (!isAntigravityLinuxTarget(resolvedImageName)) {
          resolvedImageName = procExe;
        }
      }
    }
    list.push({
      pid,
      imageName: resolvedImageName,
      startMs: elapsedMs > 0 ? Math.max(1, nowMs - elapsedMs) : 0,
      exePath: resolvedExePath,
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
  const effectivePlatform = opts.platformOverride || process.platform;
  const execSyncFn = typeof opts.execFileSyncFn === 'function' ? opts.execFileSyncFn : execFileSync;
  try {
    if (effectivePlatform === 'win32') {
      const out = execSyncFn(
        'tasklist',
        ['/FI', 'IMAGENAME eq Antigravity.exe', '/V', '/FO', 'CSV', '/NH'],
        { encoding: 'utf8', windowsHide: true, timeout: 6000, stdio: ['ignore', 'pipe', 'ignore'] }
      );
      const preliminary = buildWindowsHostCandidatesFromTasklist(out, { ...opts, hasActiveCdp: false });
      if (preliminary.length === 0) return null;
      const activePort = opts.cdpPort !== undefined ? normalizeLoopbackPort(opts.cdpPort) : readPortFromCustomOrDefaultFile(opts.portFile || null);
      const hasActiveCdp = activePort > 0 ? probeLoopbackCdpVersionSync(activePort, opts) : false;
      const candidates = hasActiveCdp
        ? buildWindowsHostCandidatesFromTasklist(out, { ...opts, hasActiveCdp: true })
        : preliminary;
      return selectPrimaryHostCandidate(candidates, nowMs);
    }
    const psOut = execSyncFn('ps', ['-axo', 'pid=,etime=,args='], {
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return selectPrimaryHostCandidate(parsePosixPsHostCandidates(psOut, nowMs, opts), nowMs);
  } catch {
    return null;
  }
}

function detectRunningAntigravityHost(opts = {}) {
  const nowMs = Number(opts.nowMs) > 0 ? Number(opts.nowMs) : Date.now();
  if (typeof opts.probeProcesses === 'function') {
    return Promise.resolve(opts.probeProcesses()).then((list) => selectPrimaryHostCandidate(list, nowMs));
  }
  const effectivePlatform = opts.platformOverride || process.platform;
  const execFn = typeof opts.execFileFn === 'function' ? opts.execFileFn : execFile;
  return new Promise((resolve) => {
    if (effectivePlatform === 'win32') {
      execFn(
        'tasklist',
        ['/FI', 'IMAGENAME eq Antigravity.exe', '/V', '/FO', 'CSV', '/NH'],
        { encoding: 'utf8', windowsHide: true, timeout: 6000, maxBuffer: 1024 * 1024 },
        (err, stdout) => {
          if (err) {
            resolve(null);
            return;
          }
          (async () => {
            try {
              const preliminary = buildWindowsHostCandidatesFromTasklist(stdout, { ...opts, hasActiveCdp: false });
              if (preliminary.length === 0) {
                resolve(null);
                return;
              }
              const activePort =
                opts.cdpPort !== undefined
                  ? normalizeLoopbackPort(opts.cdpPort)
                  : readPortFromCustomOrDefaultFile(opts.portFile || null);
              const hasActiveCdp = activePort > 0 ? await probeLoopbackCdpVersionAsync(activePort, opts) : false;
              const candidates = hasActiveCdp
                ? buildWindowsHostCandidatesFromTasklist(stdout, { ...opts, hasActiveCdp: true })
                : preliminary;
              resolve(selectPrimaryHostCandidate(candidates, nowMs));
            } catch {
              resolve(null);
            }
          })();
        }
      );
      return;
    }
    execFn(
      'ps',
      ['-axo', 'pid=,etime=,args='],
      { encoding: 'utf8', timeout: 3000, maxBuffer: 2 * 1024 * 1024 },
      (err, stdout) => {
        if (err) {
          resolve(null);
          return;
        }
        resolve(selectPrimaryHostCandidate(parsePosixPsHostCandidates(stdout, nowMs, opts), nowMs));
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
    } else if (IS_LINUX) {
      const xdgState = process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state');
      const linuxStateDir = path.join(xdgState, 'obsidian-prism');
      if (fs.existsSync(linuxStateDir)) dirs.push(linuxStateDir);
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

// Windows 桌面弹窗交由原生 C# 图形安装器/Watcher 处理，Node 侧不再派生 PowerShell MessageBox

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

let _cachedWinUiLocale = undefined;
let _winUiLocaleReaderOverride = null;

function _setWindowsUiLocaleReaderForTest(fn) {
  _winUiLocaleReaderOverride = typeof fn === 'function' ? fn : null;
  _cachedWinUiLocale = undefined;
}

function parseRegMultiSzFirstLocale(output) {
  const lines = String(output || '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = /\bREG_(?:MULTI_)?SZ\s+(.+)$/i.exec(lines[i]);
    if (!m) continue;
    const parts = m[1].split(/\\0|\s+/).map((s) => s.trim()).filter(Boolean);
    for (let j = 0; j < parts.length; j++) {
      if (/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(parts[j])) {
        return parts[j];
      }
    }
  }
  return '';
}

function readWindowsPreferredUiLanguage() {
  if (_winUiLocaleReaderOverride) {
    try {
      return String(_winUiLocaleReaderOverride() || '').trim();
    } catch {
      return '';
    }
  }
  if (!IS_WIN) return '';
  if (_cachedWinUiLocale !== undefined) return _cachedWinUiLocale;
  const keys = [
    ['HKCU\\Control Panel\\Desktop', 'PreferredUILanguages'],
    ['HKCU\\Control Panel\\Desktop\\MuiCached', 'MachinePreferredUILanguages'],
  ];
  let found = '';
  for (let i = 0; i < keys.length; i++) {
    try {
      const out = execFileSync('reg.exe', ['query', keys[i][0], '/v', keys[i][1]], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 1500,
      });
      const parsed = parseRegMultiSzFirstLocale(out);
      if (parsed) {
        found = parsed;
        break;
      }
    } catch {}
  }
  _cachedWinUiLocale = found;
  return found;
}

function detectSystemUiLocale(opts = null) {
  try {
    const candidates = [process.env.LC_ALL, process.env.LC_MESSAGES, process.env.LANG];
    for (let i = 0; i < candidates.length; i++) {
      const val = String(candidates[i] || '').trim();
      if (val && !/^(?:c|posix)(?:[.@]|$)/i.test(val)) {
        return val;
      }
    }
    if (!opts?.bypassWinUiLocale) {
      if (typeof opts?.winUiLocaleReader === 'function') {
        const custom = String(opts.winUiLocaleReader() || '').trim();
        if (custom) return custom;
      } else {
        const winUi = readWindowsPreferredUiLanguage();
        if (winUi) return winUi;
      }
    }
    return Intl.DateTimeFormat().resolvedOptions().locale || '';
  } catch {
    return '';
  }
}

function buildRelaunchDialogCopy(lang = 'auto') {
  const rawLang = !lang || String(lang).trim().toLowerCase() === 'auto' ? detectSystemUiLocale() : lang;
  const low = String(rawLang || 'en').toLowerCase();
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
  const copy = buildRelaunchDialogCopy(opts.lang || 'auto');
  if (typeof opts.dialogHook === 'function') {
    return Promise.resolve(opts.dialogHook(copy)).then((ans) => Boolean(ans));
  }
  const effectivePlatform = opts.platformOverride || process.platform;
  const execFn = typeof opts.execFileFn === 'function' ? opts.execFileFn : execFile;
  const env = opts.env || process.env;
  return new Promise((resolve) => {
    if (effectivePlatform === 'win32') {
      // Windows 图形弹窗统一交由原生 C# 安装器/Watcher 处理，Node 侧仅输出清晰 CLI 提示并返回 false（零 PowerShell 弹窗）
      const notice = {
        title: copy.title,
        body: copy.body,
        actionRequired: true,
        handledBy: 'cli-notice',
      };
      if (typeof opts.onCliNotice === 'function') {
        try {
          opts.onCliNotice(notice);
        } catch {}
      } else if (!opts.silent) {
        const stream = opts.outputStream || process.stderr;
        if (stream && typeof stream.write === 'function') {
          try {
            stream.write(`\n[${copy.title}] ${copy.body}\n`);
          } catch {}
        }
      }
      resolve(false);
      return;
    }
    if (effectivePlatform === 'darwin') {
      execFn(
        'osascript',
        ['-e', MAC_DIALOG_APPLESCRIPT, copy.body, copy.title, copy.laterBtn, copy.relaunchBtn],
        { encoding: 'utf8', timeout: 120000, env },
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
    if (effectivePlatform === 'linux') {
      const hasGuiSession = Boolean(
        (env && typeof env.DISPLAY === 'string' && env.DISPLAY.trim()) ||
          (env && typeof env.WAYLAND_DISPLAY === 'string' && env.WAYLAND_DISPLAY.trim())
      );
      if (!hasGuiSession) {
        resolve(false);
        return;
      }
      execFn(
        'zenity',
        [
          '--question',
          '--no-markup',
          '--title',
          copy.title,
          '--text',
          copy.body,
          '--ok-label',
          copy.relaunchBtn,
          '--cancel-label',
          copy.laterBtn,
        ],
        { encoding: 'utf8', timeout: 120000, env },
        (zenityErr) => {
          if (!zenityErr) {
            resolve(true);
            return;
          }
          if (zenityErr.code !== 'ENOENT') {
            resolve(false);
            return;
          }
          execFn(
            'kdialog',
            [
              '--title',
              copy.title,
              '--yesno',
              copy.body,
              '--yes-label',
              copy.relaunchBtn,
              '--no-label',
              copy.laterBtn,
            ],
            { encoding: 'utf8', timeout: 120000, env },
            (kdialogErr) => {
              resolve(!kdialogErr);
            }
          );
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

// 纯 Node Windows 脱离重启引擎：优雅处理 app_storage.json runInBackground 托盘陷阱 + loopback CDP Browser.close + 零 PowerShell/WMI
const APP_STORAGE_MAX_BYTES = 8 * 1024 * 1024;
const APP_STORAGE_RESTORE_RETRIES = 3;
const APP_STORAGE_RESTORE_RETRY_DELAY_MS = 50;
const RELAUNCH_TASK_MAX_BYTES = 1024 * 1024;

function getAntigravityAppStoragePath(opts = {}) {
  if (opts && typeof opts.appStoragePath === 'string' && opts.appStoragePath.trim()) {
    return path.resolve(opts.appStoragePath.trim());
  }
  const baseAppData =
    (opts && opts.appDataDir) ||
    (opts && opts.env && opts.env.APPDATA) ||
    APP_DATA;
  return path.join(baseAppData, 'Antigravity', 'app_storage.json');
}

function suspendAntigravityRunInBackground(appStoragePath, opts = {}) {
  const targetPath = getAntigravityAppStoragePath({ appStoragePath });
  if (!fs.existsSync(targetPath)) {
    return { modified: false, originalValue: undefined, path: targetPath, skippedReason: 'not-found' };
  }
  let resolved;
  try {
    ({ resolved } = assertSafeRegularFileSync(targetPath, APP_STORAGE_MAX_BYTES));
  } catch (err) {
    return {
      modified: false,
      originalValue: undefined,
      path: targetPath,
      skippedReason: String(err && err.message ? err.message : err),
    };
  }
  try {
    const raw = fs.readFileSync(resolved, 'utf8').replace(/^\uFEFF/, '');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { modified: false, originalValue: undefined, path: resolved, skippedReason: 'invalid-json-object' };
    }
    const cur = parsed.runInBackground;
    if (cur !== 'true' && cur !== true) {
      return { modified: false, originalValue: cur, path: resolved };
    }
    const nextVal = typeof cur === 'boolean' ? false : 'false';
    parsed.runInBackground = nextVal;
    const writeFn =
      typeof opts.writeFileSync === 'function'
        ? opts.writeFileSync
        : (p, data) => writeFileAtomicallyNoSymlinkSync(p, data, { maxBytes: APP_STORAGE_MAX_BYTES });
    writeFn(resolved, JSON.stringify(parsed, null, 2) + '\n');
    return { modified: true, originalValue: cur, path: resolved };
  } catch (err) {
    return {
      modified: false,
      originalValue: undefined,
      path: resolved,
      skippedReason: String(err && err.message ? err.message : err),
    };
  }
}

async function restoreAntigravityRunInBackground(appStoragePath, suspendState, opts = {}) {
  if (!suspendState || !suspendState.modified) {
    return { restored: false, skipped: true, attempts: 0 };
  }
  const targetPath = suspendState.path || getAntigravityAppStoragePath({ appStoragePath });
  const retries =
    Number.isInteger(opts.retries) && opts.retries > 0 ? opts.retries : APP_STORAGE_RESTORE_RETRIES;
  const retryDelayMs =
    Number.isFinite(Number(opts.retryDelayMs)) && Number(opts.retryDelayMs) >= 0
      ? Number(opts.retryDelayMs)
      : APP_STORAGE_RESTORE_RETRY_DELAY_MS;
  const sleepFn =
    typeof opts.sleep === 'function' ? opts.sleep : (ms) => new Promise((r) => setTimeout(r, ms));
  const readFn = typeof opts.readFileSync === 'function' ? opts.readFileSync : (p) => fs.readFileSync(p, 'utf8');
  const writeFn =
    typeof opts.writeFileSync === 'function'
      ? opts.writeFileSync
      : (p, data) => writeFileAtomicallyNoSymlinkSync(p, data, { maxBytes: APP_STORAGE_MAX_BYTES });

  let lastErr = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const { resolved } = assertSafeRegularFileSync(targetPath, APP_STORAGE_MAX_BYTES);
      const latestRaw = String(readFn(resolved) || '').replace(/^\uFEFF/, '');
      const latestObj = JSON.parse(latestRaw);
      if (!latestObj || typeof latestObj !== 'object' || Array.isArray(latestObj)) {
        throw new Error('Invalid app_storage.json root object');
      }
      latestObj.runInBackground = suspendState.originalValue;
      writeFn(resolved, JSON.stringify(latestObj, null, 2) + '\n');
      return {
        restored: true,
        attempts: attempt,
        path: resolved,
        restoredValue: suspendState.originalValue,
      };
    } catch (err) {
      lastErr = err;
      if (attempt < retries && retryDelayMs > 0) {
        await sleepFn(retryDelayMs);
      }
    }
  }
  return {
    restored: false,
    attempts: retries,
    path: targetPath,
    error: String(lastErr && lastErr.message ? lastErr.message : lastErr),
  };
}

function isAntigravityCdpCloseTarget(target) {
  if (!target || !target.webSocketDebuggerUrl) return false;
  const url = String(target.url || '').trim();
  const title = String(target.title || '').trim();
  if (!url) return false;
  if (isSwarmSidecarUrl(url)) return true;
  if (target.type !== 'page') return false;
  if (/\bvisual studio code\b/i.test(title) && !/\bantigravity\b/i.test(title)) {
    return false;
  }
  return isEligibleTarget(target);
}

// 通过本机回环 CDP 发送 Browser.close（严格双重校验 /json/version 与 /json/list 属于 Antigravity；严禁调用 timer.unref 避免 Node 22 早退）
async function requestLoopbackCdpBrowserClose(cdpPort, opts = {}) {
  const port = normalizeLoopbackPort(cdpPort);
  if (!port) return false;
  const fetchImpl = typeof opts.fetchImpl === 'function' ? opts.fetchImpl : globalThis.fetch;
  const WsCtor = typeof opts.WebSocketCtor === 'function' ? opts.WebSocketCtor : globalThis.WebSocket;
  if (typeof fetchImpl !== 'function' || typeof WsCtor !== 'function') return false;
  const timeoutMs = Math.max(200, Math.min(8000, Number(opts.timeoutMs) || 2500));

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

  const versionInfo = await fetchJsonLoopback('/json/version');
  if (!isAntigravityCdpVersionInfo(versionInfo, port)) {
    return false;
  }
  const targets = await fetchJsonLoopback('/json/list');
  if (!Array.isArray(targets) || !targets.some(isAntigravityCdpCloseTarget)) {
    return false;
  }

  const wsUrl = String(versionInfo.webSocketDebuggerUrl).trim();
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
    const timer = setTimeout(() => finish(false), timeoutMs);
    try {
      ws = new WsCtor(wsUrl);
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
        const raw = typeof evt === 'string' ? evt : evt && evt.data;
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

function isWindowsAntigravityHostAliveSync(hostPid, opts = {}) {
  const pid = Number(hostPid);
  const excluded = collectKnownPrismDaemonPids(opts);
  if (Number.isInteger(pid) && pid > 0 && !excluded.has(pid)) {
    try {
      process.kill(pid, 0);
      return true;
    } catch (err) {
      if (err && err.code === 'EPERM') return true;
    }
  }
  const targetExe = String((opts && opts.exePath) || '').trim();
  if (targetExe && !isAntigravityShortcutTarget(targetExe)) {
    return false;
  }
  const execSyncFn = typeof opts.execFileSyncFn === 'function' ? opts.execFileSyncFn : execFileSync;
  try {
    const out = execSyncFn(
      'tasklist',
      ['/FI', 'IMAGENAME eq Antigravity.exe', '/FO', 'CSV', '/NH'],
      { encoding: 'utf8', windowsHide: true, timeout: 4000, stdio: ['ignore', 'pipe', 'ignore'] }
    );
    const rows = parseWindowsTasklistCsv(out);
    return rows.some((r) => r.imageName.toLowerCase() === 'antigravity.exe' && !excluded.has(r.pid));
  } catch {
    return false;
  }
}

async function runWindowsDetachedRelaunchTask(task = {}, hooks = {}) {
  const hostPid = Number(task && task.hostPid) || 0;
  const exePath = String((task && task.exePath) || '').trim() || resolveInstalledAntigravityExeWin();
  const launchArgs =
    Array.isArray(task && task.args) && task.args.length > 0
      ? task.args.map((a) => String(a))
      : [CDP_OPT_IN_SWITCH];
  const maxWaitMs = Math.max(200, Math.min(180000, Number(task && task.maxWaitMs) || 25000));
  const pollMs = Math.max(20, Math.min(2000, Number(task && task.pollMs) || 250));
  const settleMs = Math.max(0, Math.min(10000, Number((task && task.settleMs) ?? 350)));
  const appStoragePath = getAntigravityAppStoragePath({
    appStoragePath: task && task.appStoragePath,
  });
  const cdpPort =
    normalizeLoopbackPort(task && task.cdpPort) ||
    normalizeLoopbackPort(readPortFromCustomOrDefaultFile((task && task.portFile) || null));

  const sleepFn = typeof hooks.sleep === 'function' ? hooks.sleep : (ms) => new Promise((r) => setTimeout(r, ms));
  const suspendFn =
    typeof hooks.suspendRunInBackground === 'function'
      ? hooks.suspendRunInBackground
      : (p) => suspendAntigravityRunInBackground(p);
  const restoreFn =
    typeof hooks.restoreRunInBackground === 'function'
      ? hooks.restoreRunInBackground
      : (p, st) => restoreAntigravityRunInBackground(p, st, hooks.restoreOpts || {});
  const requestCdpCloseFn =
    typeof hooks.requestCdpClose === 'function'
      ? hooks.requestCdpClose
      : (p) => requestLoopbackCdpBrowserClose(p, hooks.cdpCloseOpts || {});
  const isHostStillRunningFn =
    typeof hooks.isHostStillRunning === 'function'
      ? hooks.isHostStillRunning
      : () => isWindowsAntigravityHostAliveSync(hostPid, { excludePids: task && task.excludePids, exePath });
  const spawnFn = typeof hooks.spawnFn === 'function' ? hooks.spawnFn : spawn;
  const existsFn = typeof hooks.existsSync === 'function' ? hooks.existsSync : fs.existsSync;

  if (!hooks.launchHost && !hooks.spawnFn && (!exePath || !existsFn(exePath))) {
    return { relaunched: false, reason: 'missing-exe', exePath };
  }

  let suspendState = null;
  let restoreRes = null;
  let cdpClosed = false;
  let exited = false;

  try {
    suspendState = suspendFn(appStoragePath);
    if (cdpPort > 0) {
      try {
        cdpClosed = Boolean(await requestCdpCloseFn(cdpPort));
      } catch {
        cdpClosed = false;
      }
    }
    const deadline = Date.now() + maxWaitMs;
    while (Date.now() <= deadline) {
      const alive = await isHostStillRunningFn(hostPid, exePath);
      if (!alive) {
        exited = true;
        break;
      }
      await sleepFn(pollMs);
    }
  } finally {
    if (suspendState && suspendState.modified) {
      restoreRes = await restoreFn(appStoragePath, suspendState);
    }
  }

  if (!exited) {
    return {
      relaunched: false,
      reason: 'host-did-not-exit',
      exePath,
      cdpClosed,
      suspendState,
      restoreRes,
    };
  }

  if (settleMs > 0) {
    await sleepFn(settleMs);
  }

  if (typeof hooks.launchHost === 'function') {
    const ok = await hooks.launchHost(exePath, launchArgs);
    return {
      relaunched: Boolean(ok !== false),
      exePath,
      args: launchArgs,
      cdpClosed,
      suspendState,
      restoreRes,
    };
  }

  const cleanEnv = { ...(hooks.env || process.env) };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  try {
    const child = spawnFn(exePath, launchArgs, {
      cwd: path.dirname(exePath),
      detached: true,
      windowsHide: false,
      stdio: 'ignore',
      env: cleanEnv,
    });
    if (child && typeof child.on === 'function') child.on('error', () => {});
    if (child && typeof child.unref === 'function') child.unref();
    return {
      relaunched: Boolean(child),
      pid: (child && child.pid) || null,
      exePath,
      args: launchArgs,
      cdpClosed,
      suspendState,
      restoreRes,
    };
  } catch (err) {
    return {
      relaunched: false,
      reason: 'launch-failed',
      error: String(err && err.message ? err.message : err),
      exePath,
      args: launchArgs,
      cdpClosed,
      suspendState,
      restoreRes,
    };
  }
}

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

// 纯 POSIX sh 脱离重启脚本（所有动态参数经位置参数 "$1" "$2" 传入，零拼接、零强制终止、零宿主归档修改）
const LINUX_DETACHED_RELAUNCH_SH = [
  'target_pid="$1"',
  'exe_path="$2"',
  'unset ELECTRON_RUN_AS_NODE',
  'resolve_exe() {',
  '  if [ -n "$exe_path" ] && [ -x "$exe_path" ]; then',
  '    printf \'%s\\n\' "$exe_path"',
  '    return 0',
  '  fi',
  '  for cand in "/usr/share/antigravity/antigravity" "/opt/Antigravity/antigravity" "/usr/bin/antigravity" "$HOME/.local/bin/antigravity"; do',
  '    if [ -x "$cand" ]; then',
  '      printf \'%s\\n\' "$cand"',
  '      return 0',
  '    fi',
  '  done',
  '  if command -v antigravity >/dev/null 2>&1; then',
  '    command -v antigravity',
  '    return 0',
  '  fi',
  '  return 1',
  '}',
  'kill -TERM "$target_pid" >/dev/null 2>&1 || true',
  'xdg_cfg="${XDG_CONFIG_HOME:-$HOME/.config}"',
  'lock_file="$xdg_cfg/Antigravity/SingletonLock"',
  'i=0',
  'exited=0',
  'while [ "$i" -lt 120 ]; do',
  '  main_alive=0',
  '  lock_alive=0',
  '  if kill -0 "$target_pid" >/dev/null 2>&1; then main_alive=1; fi',
  '  if [ -L "$lock_file" ]; then',
  '    link_dest="$(readlink "$lock_file" 2>/dev/null || true)"',
  '    lock_pid="${link_dest##*-}"',
  '    case "$lock_pid" in',
  '      \'\'|*[!0-9]*) lock_alive=1 ;;',
  '      *) if kill -0 "$lock_pid" >/dev/null 2>&1; then lock_alive=1; fi ;;',
  '    esac',
  '  elif [ -e "$lock_file" ]; then',
  '    lock_alive=1',
  '  fi',
  '  if [ "$main_alive" -eq 0 ] && [ "$lock_alive" -eq 0 ]; then exited=1; break; fi',
  '  if [ "$i" -eq 40 ] && [ "$main_alive" -eq 1 ]; then kill -TERM "$target_pid" >/dev/null 2>&1 || true; fi',
  '  sleep 0.25',
  '  i=$((i + 1))',
  'done',
  'if [ "$exited" -ne 1 ] && kill -0 "$target_pid" >/dev/null 2>&1; then exit 0; fi',
  'sleep 0.5',
  'env_conf="$xdg_cfg/environment.d/90-obsidian-prism-gomemlimit.conf"',
  'if [ -f "$env_conf" ] && [ ! -L "$env_conf" ]; then',
  '  gomem_line="$(grep -E \'^GOMEMLIMIT=([0-9]+(B|KiB|MiB|GiB|TiB))$\' "$env_conf" 2>/dev/null | head -n 1 || true)"',
  '  if [ -n "$gomem_line" ]; then',
  '    export GOMEMLIMIT="${gomem_line#GOMEMLIMIT=}"',
  '  fi',
  'fi',
  'launch_exe="$(resolve_exe || true)"',
  'if [ -z "$launch_exe" ]; then exit 0; fi',
  'nohup "$launch_exe" --remote-debugging-port=0 >/dev/null 2>&1 </dev/null &',
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
  const effectivePlatform = opts.platformOverride || process.platform;
  const spawnFn = typeof opts.spawnFn === 'function' ? opts.spawnFn : spawn;
  if (effectivePlatform === 'win32') {
    const privateStateDir = opts.stateDir
      ? path.resolve(opts.stateDir)
      : path.join(os.homedir(), '.gemini', 'config', 'plugins', 'obsidian-prism');
    if (isSymlinkPathSync(privateStateDir)) {
      return { spawned: false, reason: 'symlink-state-dir' };
    }
    fs.mkdirSync(privateStateDir, { recursive: true });
    const privateTaskFile = path.join(
      privateStateDir,
      `.relaunch-task-${crypto.randomBytes(6).toString('hex')}.json`
    );
    const resolvedExe =
      String((task && task.exePath) || '').trim() ||
      resolveInstalledAntigravityExeWin(opts);
    const taskPayload = {
      schema: 1,
      hostPid,
      exePath: resolvedExe,
      args: Array.isArray(task.args) && task.args.length > 0 ? task.args : [CDP_OPT_IN_SWITCH],
      cdpPort: normalizeLoopbackPort(task.cdpPort) || normalizeLoopbackPort(readPortFromCustomOrDefaultFile(task.portFile || null)),
      appStoragePath: task.appStoragePath ? path.resolve(String(task.appStoragePath)) : getAntigravityAppStoragePath(opts),
      maxWaitMs: Number(task.maxWaitMs) || 25000,
      pollMs: Number(task.pollMs) || 250,
      settleMs: task.settleMs !== undefined ? Number(task.settleMs) : 350,
    };
    writeFileAtomicallyNoSymlinkSync(privateTaskFile, JSON.stringify(taskPayload, null, 2) + '\n', {
      maxBytes: RELAUNCH_TASK_MAX_BYTES,
      mode: 0o600,
    });

    const runtime = resolveWindowsDetachedNodeRuntime(opts);
    const helperPath = path.resolve(opts.helperPath || __filename);
    const cleanEnv = { ...(opts.env || process.env) };
    if (runtime.useElectronAsNode) {
      cleanEnv.ELECTRON_RUN_AS_NODE = '1';
    } else {
      delete cleanEnv.ELECTRON_RUN_AS_NODE;
    }

    try {
      const child = spawnFn(runtime.execPath, [helperPath, '--run-relaunch-task', privateTaskFile], {
        cwd: path.dirname(helperPath),
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        env: cleanEnv,
      });
      if (child && typeof child.on === 'function') child.on('error', () => {});
      if (child && typeof child.unref === 'function') child.unref();
      return {
        spawned: Boolean(child),
        pid: (child && child.pid) || null,
        method: 'node-detached-helper',
        taskFile: privateTaskFile,
        useElectronAsNode: runtime.useElectronAsNode,
      };
    } catch (err) {
      try { fs.unlinkSync(privateTaskFile); } catch {}
      return {
        spawned: false,
        reason: 'spawn-failed',
        error: String(err && err.message ? err.message : err),
      };
    }
  }

  if (effectivePlatform === 'darwin') {
    const appPath = normalizeMacAppBundlePath(task.exePath);
    const cleanEnv = { ...process.env };
    delete cleanEnv.ELECTRON_RUN_AS_NODE;
    const child = spawnFn('/usr/bin/nohup', ['/bin/sh', '-c', MAC_DETACHED_RELAUNCH_SH, 'sh', String(hostPid), appPath], {
      detached: true,
      stdio: 'ignore',
      env: cleanEnv,
    });
    if (child && typeof child.unref === 'function') child.unref();
    return { spawned: true, pid: (child && child.pid) || null, method: 'nohup-sh', appPath };
  }

  if (effectivePlatform === 'linux') {
    const exePath = String(task.exePath || '').trim();
    const cleanEnv = { ...(opts.env || process.env) };
    delete cleanEnv.ELECTRON_RUN_AS_NODE;
    const child = spawnFn('/bin/sh', ['-c', LINUX_DETACHED_RELAUNCH_SH, '--', String(hostPid), exePath], {
      detached: true,
      stdio: 'ignore',
      env: cleanEnv,
    });
    if (child && typeof child.unref === 'function') child.unref();
    return { spawned: true, pid: (child && child.pid) || null, method: 'linux-sh', exePath };
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

const SENSITIVE_URL_QUERY_RE = /([?&](?:token|auth|signature|key|secret)=)[^&\s#"']+/gi;
const SWARM_SIDECAR_HOST_RE = /^swarm--swarm_board-\d+$/;

function redactSensitiveUrl(rawUrl) {
  if (rawUrl === null || rawUrl === undefined) return '';
  return String(rawUrl)
    .replace(/(https?:\/\/)[^/\s:@]+:[^/\s@]+@/gi, '$1***@')
    .replace(SENSITIVE_URL_QUERY_RE, '$1<REDACTED>');
}

function isSwarmSidecarUrl(rawUrl) {
  const s = String(rawUrl || '').trim();
  if (!s) return false;
  try {
    const u = new URL(s);
    return (
      u.protocol === 'plugin:' &&
      SWARM_SIDECAR_HOST_RE.test(u.hostname || '') &&
      !u.port &&
      !u.username &&
      !u.password &&
      u.pathname === '/'
    );
  } catch {
    return false;
  }
}

async function listPages(port) {
  const res = await fetch(`http://127.0.0.1:${port}/json/list`, {
    signal: AbortSignal.timeout(2000),
  });
  const targets = await res.json();
  return targets.filter(isEligibleTarget);
}

async function listSwarmTargets(port) {
  const res = await fetch(`http://127.0.0.1:${port}/json/list`, {
    signal: AbortSignal.timeout(2000),
  });
  const targets = await res.json();
  if (!Array.isArray(targets)) return [];
  return targets
    .filter((t) => {
      if (!t || (t.type !== 'iframe' && t.type !== 'page') || !t.webSocketDebuggerUrl) return false;
      return isSwarmSidecarUrl(t.url);
    })
    .map((t) => ({
      ...t,
      url: redactSensitiveUrl(t.url || ''),
      title: redactSensitiveUrl(t.title || t.url || ''),
    }));
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
    this.sessionListeners = new Map();
    this._childSessions = new Map();
    ws.addEventListener('message', (evt) => {
      let msg;
      try {
        msg = JSON.parse(evt.data);
      } catch {
        return;
      }
      if (msg.method) {
        if (msg.sessionId) {
          const sMap = this.sessionListeners.get(msg.sessionId);
          if (sMap) {
            for (const cb of sMap.get(msg.method) || []) cb(msg.params);
          }
          return;
        }
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
      const children = [...this._childSessions.values()];
      this._childSessions.clear();
      this.sessionListeners.clear();
      for (const ch of children) {
        try {
          ch.detachLocal();
        } catch {}
      }
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

  send(method, params = {}, timeoutMs = 5000, sessionId = null) {
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
        const payload = sessionId ? { id, method, params, sessionId } : { id, method, params };
        this.ws.send(JSON.stringify(payload));
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

  onSessionEvent(sessionId, method, callback) {
    if (!sessionId || !method || typeof callback !== 'function') return;
    let sMap = this.sessionListeners.get(sessionId);
    if (!sMap) {
      sMap = new Map();
      this.sessionListeners.set(sessionId, sMap);
    }
    if (!sMap.has(method)) sMap.set(method, []);
    sMap.get(method).push(callback);
  }

  offSession(sessionId) {
    if (!sessionId) return;
    this.sessionListeners.delete(sessionId);
    this._childSessions.delete(sessionId);
  }

  createChildSession(sessionId, targetId = '') {
    const parent = this;
    let childClosed = false;
    const child = {
      sessionId: String(sessionId || ''),
      targetId: String(targetId || ''),
      parent,
      onClose: null,
      get closed() {
        return childClosed || parent.closed;
      },
      send(method, params = {}, timeoutMs = 5000) {
        if (childClosed || parent.closed) {
          return Promise.reject(new Error('CDP child session closed'));
        }
        return parent.send(method, params, timeoutMs, child.sessionId);
      },
      on(method, callback) {
        if (childClosed || parent.closed) return;
        parent.onSessionEvent(child.sessionId, method, callback);
      },
      async evaluate(expression, awaitPromise = false, timeoutMs = 4000) {
        const res = await child.send(
          'Runtime.evaluate',
          {
            expression,
            returnByValue: true,
            awaitPromise,
          },
          timeoutMs
        );
        if (res && res.exceptionDetails) {
          throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
        }
        return res && res.result ? res.result.value : undefined;
      },
      detachLocal() {
        if (childClosed) return;
        childClosed = true;
        parent.offSession(child.sessionId);
        if (typeof child.onClose === 'function') {
          try {
            child.onClose();
          } catch {}
        }
      },
      close() {
        if (childClosed) return;
        child.detachLocal();
        if (!parent.closed && child.sessionId) {
          parent.send('Target.detachFromTarget', { sessionId: child.sessionId }, 1500).catch(() => {});
        }
      },
    };
    if (child.sessionId) {
      this._childSessions.set(child.sessionId, child);
    }
    return child;
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

// 按需独立通道模块（不打入 Channel 1 主包以严控体积 < 550 KB，仍纳入 SYNC_ROOT_FILES 随安装包/热更新同步）
const DEFERRED_ROOT_MODULES = [
  'i18n-locales.js',
  'dual-mascot-rig.js',
  'settings-panel.js',
  'home-studio-panel.js',
];

const RUNTIME_PARTS = [
  'i18n-core.js',
  'usage-core.js',
  'crystal-prism-core.js',
  'animated-icons.js',
  'motion-engine.js',
  'ripple-core.js',
  'conv-aura.js',
  'smooth-caret.js',
  'vial-core.js',
  'pulse-vial-bridge.js',
  'vendor/pulse-dashboard/inline-fallback.js',
  'vendor/effort-slider/slider-coexist.js',
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
  ...DEFERRED_ROOT_MODULES,
  ...RUNTIME_PARTS.filter((p) => !p.includes('/')),
];

const _mangledUnitCache = new Map();
let _unifiedBundleCache = { sig: '', bundleCode: '', partCodeByName: new Map() };
let _cssCache = { sig: '', minCss: '', packedExpr: '' };

const BUNDLE_CACHE_SCHEMA_VERSION = 2;
const BUNDLE_CACHE_FILENAME = '.bundle-cache.json';
const BUNDLE_CACHE_MAX_ENTRIES = 4;
const BUNDLE_CACHE_MAX_FILE_BYTES = 6 * 1024 * 1024;
const BUNDLE_CACHE_MAX_EXPR_BYTES = 2 * 1024 * 1024;
const BUNDLE_CACHE_MAX_BOOTCFG_BYTES = 64 * 1024;
const CHANNEL_CACHE_MAX_PAYLOAD_BYTES = 2 * 1024 * 1024;
const CHANNEL_CACHE_NAMES = ['omni', 'sidebar', 'hostI18n', 'swarmI18n', 'thought', 'inlineDiff', 'wallpaper', 'periodicPicker', 'settings', 'mascot', 'suggester', 'homeStudio'];
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
  channelHitsByName: { omni: 0, sidebar: 0, hostI18n: 0, thought: 0, inlineDiff: 0, wallpaper: 0, periodicPicker: 0, settings: 0, mascot: 0, suggester: 0, homeStudio: 0 },
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
    .replace(/\bvar\s+SETTINGS_SCHEMA\s*=\s*_F\(\[[\s\S]*?(?=\r?\nfunction\s+schemaDefaults\b)/, '')
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
    schemaDefaults: 'function schemaDefaults(){return{v:1,motion:"fast",ticks:"highlight"};}',
    normalizeSettings: 'function normalizeSettings(r){var b={v:1,motion:"fast",ticks:"highlight"};if(!r||typeof r!=="object")return b;if(r.motion==="fast"||r.motion==="quick"||r.motion==="full")b.motion=r.motion;else if(!r.motion&&r.reducedMotion===true)b.motion="quick";if(r.ticks==="highlight"||r.ticks==="dim"||r.ticks==="hidden")b.ticks=r.ticks;return b;}',
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

// Channel 1 自身实际消费的最小运行时 key 集（Omni / InlineDiff 均在各自独立通道内自带完整 8 语表，无需重复打入 Channel 1 bootCfg）
const CH1_RUNTIME_UI_KEYS = Object.freeze([
  'cacheRead', 'cacheShort', 'effortTitle', 'fiveHourLabel',
  'homeLocalOnlyTag', 'homeLocalScopeNote', 'homeScopeActive', 'homeScopeActiveCount', 'homeScopeAll', 'homeScopeArchivedCount',
  'kpiCacheHit', 'kpiCalls', 'kpiDays', 'kpiFavModel', 'kpiSessions', 'kpiTokens',
  'noModelUsage',
  'optHost', 'optLightAlabaster', 'optLightCrystal', 'optMotionOff', 'optMotionStandard', 'optMotionSubtle',
  'optMotionUltra', 'optObsidian', 'optThoughtBilingual', 'optThoughtImmersive', 'optWarm',
  'quotaEmptyHint', 'quotaJustNow', 'quotaLoading', 'quotaPoolsTitle', 'refreshBtnTitle', 'sessionsUnit',
  'showLess', 'sidebarLessLabel', 'sidebarMoreLabel', 'studioPlaceholder', 'subagentsUnit', 'swarmBadge',
  'tabModels', 'tabOverview', 'tabQuotas', 'thinkingEllipsis', 'tokenUnit', 'tokensInShort', 'tokensOutShort',
  'weeklyLabel', 'workspaceAll', 'workspaceFilterAria',
]);

let _localesFreshCache = { sig: '', mod: null };

function loadLocalesModuleFresh() {
  const locPath = path.join(__dirname, 'i18n-locales.js');
  if (!fs.existsSync(locPath)) return null;
  try {
    const sig = getFileSig(locPath);
    if (_localesFreshCache.sig === sig && _localesFreshCache.mod) {
      return _localesFreshCache.mod;
    }
    try { delete require.cache[require.resolve(locPath)]; } catch {}
    const mod = require(locPath);
    _localesFreshCache = { sig, mod };
    return mod;
  } catch {
    return null;
  }
}

function normalizeLangIdNode(rawLang, fallback = 'en') {
  const raw = typeof rawLang === 'string' ? rawLang.trim().toLowerCase().replace(/_/g, '-') : '';
  if (!raw || raw === 'auto') return fallback;
  if (raw === 'en' || raw.startsWith('en-') || raw === 'english') return 'en';
  if (raw === 'ja' || raw.startsWith('ja-') || raw === 'jp' || raw === 'japanese') return 'ja';
  if (raw === 'ko' || raw.startsWith('ko-') || raw === 'kr' || raw === 'korean') return 'ko';
  if (raw === 'es' || raw.startsWith('es-') || raw === 'spanish') return 'es';
  if (raw === 'fr' || raw.startsWith('fr-') || raw === 'french') return 'fr';
  if (raw === 'de' || raw.startsWith('de-') || raw === 'german') return 'de';
  if (raw === 'yue' || raw.startsWith('yue-') || raw === 'zh-yue' || raw.includes('cantonese')) return 'zh-CN';
  if (raw === 'zh-tw' || raw === 'zh-hk' || raw.startsWith('zh-hk-') || raw === 'zh-mo' || raw === 'zh-hant' || raw.startsWith('zh-hant-') || raw === 'tw' || raw === 'hant') return 'zh-TW';
  if (raw === 'zh' || raw === 'zh-cn' || raw === 'zh-hans' || raw.startsWith('zh-')) return 'zh-CN';
  return fallback;
}

function resolveSystemLangNode(hostLocaleHint = null) {
  const sysLocale = hostLocaleHint || detectSystemUiLocale();
  const stripped = String(sysLocale || '').trim().split(/[.@]/)[0];
  return normalizeLangIdNode(stripped, 'en');
}

function extractSingleLangRuntimeSlice(mod, langId) {
  if (!mod) return {};
  const src =
    typeof mod.getRuntimeUiSlice === 'function'
      ? mod.getRuntimeUiSlice(langId)?.strings
      : typeof mod.getUiStrings === 'function'
        ? mod.getUiStrings(langId)
        : null;
  if (!src || typeof src !== 'object') return {};
  const out = {};
  for (let i = 0; i < CH1_RUNTIME_UI_KEYS.length; i++) {
    const k = CH1_RUNTIME_UI_KEYS[i];
    if (typeof src[k] === 'string') out[k] = src[k];
  }
  return out;
}

// 为 Channel 1 bootCfg 生成当前活跃语言（及 auto 模式下的 en 兜底）迷你运行时词典（列式编码消除双语重复键名），避免打包完整 8 语设置词典
function buildRuntimeUiSlicePayload(config) {
  const mod = loadLocalesModuleFresh();
  if (!mod) return null;
  const rawLang = (config && (config.language || config.lang)) || 'auto';
  const isAuto = String(rawLang).trim().toLowerCase() === 'auto';
  const primary = isAuto ? resolveSystemLangNode() : normalizeLangIdNode(rawLang, 'en');
  const pObj = extractSingleLangRuntimeSlice(mod, primary);
  const enObj = isAuto && primary !== 'en' ? extractSingleLangRuntimeSlice(mod, 'en') : null;
  const keys = CH1_RUNTIME_UI_KEYS.filter((k) => typeof pObj[k] === 'string' || typeof enObj?.[k] === 'string');
  const vals = { [primary]: keys.map((k) => pObj[k] ?? '') };
  if (enObj) vals.en = keys.map((k) => enObj[k] ?? '');
  return { active: primary, keys, vals };
}

let _configRefreshTemplate = '';

function getConfigRefreshTemplate() {
  if (_configRefreshTemplate) return _configRefreshTemplate;
  const rawTpl = `(() => {
    const cfg = __AG_REF_CFG__;
    const api = window.__agPrism || window.__agClaudeStyle;
    if (api && api.version === __AG_REF_VER__ && api.codeHash === __AG_REF_HASH__ && typeof api.refreshConfig === 'function') {
      const applied = api.refreshConfig(cfg);
      if (applied === false) return { refreshed: true, skippedStale: true, version: api.version };
      const effectiveCfg = api.getState?.()?.cfg || cfg;
      try { window.__agPrismTelemetry?.sync?.(effectiveCfg); } catch {}
      try { window.__agPrismEffortSlider?.sync?.(effectiveCfg); } catch {}
      try { window.__agPrismThought?.sync?.(effectiveCfg); } catch {}
      try { window.__agPrismInlineDiff?.sync?.(effectiveCfg); } catch {}
      if (effectiveCfg?.omniModule === 'off') { try { window.__agPrismOmni?.destroy?.(); } catch {} }
      else { try { window.__agPrismOmni?.sync?.(effectiveCfg, window.__agPrismOmniServerMeta || null); } catch {} }
      if (effectiveCfg?.sidebarStudio !== 'on') {
        try { window.__agPrismSidebar?.sync?.(effectiveCfg, window.__agPrismSidebarMeta || null); } catch {}
        try { window.__agPrismSidebar?.destroy?.(); } catch {}
        try { delete window.__agPrismSidebar; } catch {}
        try {
          if (document.documentElement) {
            ['data-ag-prism-mode','data-ag-prism-chat-kind','data-ag-prism-chat-telemetry','data-ag-cs-space','data-ag-cs-space-palette','data-ag-cs-space-accent'].forEach((a) => document.documentElement.removeAttribute(a));
          }
        } catch {}
      } else {
        try { window.__agPrismSidebar?.sync?.(effectiveCfg, window.__agPrismSidebarMeta || null); } catch {}
      }
      try {
        const hiMode = effectiveCfg?.hostLocalization;
        const hiLang = effectiveCfg?.language;
        const navL = String((typeof navigator !== 'undefined' && ((navigator.languages && navigator.languages[0]) || navigator.language)) || '').trim();
        if (hiMode === 'off') window.__agPrismHostI18n?.setMode?.('off');
        else if (hiMode === 'on') window.__agPrismHostI18n?.setMode?.('on');
        else if ((hiLang && hiLang !== 'zh-CN' && hiLang !== 'auto') || ((!hiLang || hiLang === 'auto') && navL && !/^zh(?:$|-(?:cn|hans|sg)(?:-|$))/i.test(navL))) window.__agPrismHostI18n?.destroy?.();
        else window.__agPrismHostI18n?.setMode?.('auto');
      } catch {}
      if (effectiveCfg?.mascot === 'off' || effectiveCfg?.mascot === false) {
        try {
          try { window.__agDualMascotRig?.dispose?.(); } catch {}
          try { (window.__agPrism || window.__agClaudeStyle)?.sync?.(); } catch {}
          document.querySelectorAll?.('.ag-cs-crab, .ag-cs-dual-stage, .ag-cs-crab-stage, .ag-cs-mascot-stage, .ag-v2-mascot-stage, .ag-v2-habitat-prop').forEach((n) => {
            try { n.__agMascotApi?.dispose?.(); } catch {}
            n.remove?.();
          });
          document.querySelectorAll?.('[data-ag-cs-crab-anchor]').forEach((n) => n.removeAttribute?.('data-ag-cs-crab-anchor'));
          document.documentElement?.removeAttribute?.('data-ag-cs-has-crab');
          document.documentElement?.removeAttribute?.('data-ag-cs-mascot-drag');
          delete window.__agDualMascotRig;
          delete globalThis.__agDualMascotRig;
          delete window.__agPrismMascotArt;
          delete globalThis.__agPrismMascotArt;
        } catch {}
      }
      if (effectiveCfg?.homeLayout && effectiveCfg.homeLayout !== 'studio') {
        try {
          (window.__agPrism || window.__agClaudeStyle)?.detachHomeStudio?.();
          document.getElementById?.('ag-prism-studio-v101-css')?.remove?.();
          document.querySelectorAll?.('.ag-cs-home-panel-seat,.ag-cs-home-panel')?.forEach?.((n) => n.remove());
          document.documentElement?.removeAttribute?.('data-ag-prism-scope');
          for (const k of ['__agPrismHomeStudioPanel', '__agHomeStudioPanel']) { delete window[k]; delete globalThis[k]; }
        } catch {}
      }
      // Channel 8 Periodic Picker is permanently disabled: always tear down stale instances/nodes on config refresh
      try {
        window.__agPrismPeriodicPicker?.destroy?.();
        ['data-ag-prism-periodic-picker','data-ag-pp-open','data-ag-pp-holding'].forEach((a) => document.documentElement?.removeAttribute?.(a));
        document.querySelectorAll?.('#ag-prism-periodic-picker-css,#ag-prism-periodic-picker-root,.ag-pp-hold-ring,.ag-pp-mini-keycap').forEach((n) => n.remove());
        ['__agPrismPeriodicPicker','__agPrismPeriodicPickerFactory','__agPrismKeyboard3D','__agPrismPeriodicKeyboard3D','__agPrismOledScreen','__agPrismGrainAssets','__agPeriodicAudioFx','__agPeriodicModelCatalog','__agPeriodicHostBridge','__agPeriodicBentoUi','__agPeriodicPbrGrainAssets','__agPeriodicOledScreen','__agPeriodicKeyboard3D'].forEach((k) => { try { delete window[k]; } catch {} try { delete globalThis[k]; } catch {} });
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
  _configRefreshTemplate = minifySingleSource(rawTpl);
  return _configRefreshTemplate;
}

function buildConfigRefreshExpression(customConfig, extraMeta = null) {
  const config = customConfig ? reconcileConfigAliases(customConfig) : readConfig();
  const codeHash = resolveCurrentBundleCodeHash();
  const hasExplicitLang = !customConfig || Object.prototype.hasOwnProperty.call(config, 'language') || Object.prototype.hasOwnProperty.call(config, 'lang');
  const uiSlice = hasExplicitLang ? buildRuntimeUiSlicePayload(config) : null;
  const bootCfg = {
    ...config,
    ...(uiSlice ? { __uiSlice: uiSlice } : {}),
    ...(extraMeta && typeof extraMeta === 'object' ? extraMeta : {}),
    binding: SETTING_BINDING,
    codeHash,
    __fromFile: true,
  };
  return getConfigRefreshTemplate()
    .replace('__AG_REF_CFG__', () => JSON.stringify(bootCfg))
    .replace('__AG_REF_VER__', () => JSON.stringify(PLUGIN_VERSION))
    .replace('__AG_REF_HASH__', () => JSON.stringify(codeHash));
}

let _injectWrapperTemplate = null;

function getInjectWrapperTemplate() {
  if (_injectWrapperTemplate) return _injectWrapperTemplate;
  const rawTpl = `(() => {
    const W = window, D = document, G = globalThis, isF = (v) => typeof v === 'function';
    const VER = ${JSON.stringify(PLUGIN_VERSION)}, SID = ${JSON.stringify(STYLE_ID)}, LSID = ${JSON.stringify(LEGACY_STYLE_ID)};
    let _css = null;
    const getCss = () => (_css === null ? (_css = __AG_INJ_CSS__) : _css);
    const cleanOld = () => {
      try { D.getElementById(LSID)?.remove(); } catch {}
      try {
        const o = W.__agClaudeStyle;
        if (o && (!W.__agPrism || Number(o.version) <= 2)) {
          if (isF(o.destroy)) o.destroy();
          delete W.__agClaudeStyle;
        }
      } catch {}
    };
    const applyStyle = () => {
      const p = D.head || D.documentElement;
      if (!p) return;
      cleanOld();
      let st = D.getElementById(SID);
      if (!st) { st = D.createElement('style'); st.id = SID; }
      const fk = __AG_INJ_CSSHASH__, flatOk = st.getAttribute?.('data-ag-cs-flat') === fk + ':' + (st.textContent || '').length;
      const rawOk = st.getAttribute?.('data-ag-cs-css-hash') === fk && (st.textContent || '').length > 0 && typeof CSS !== 'undefined' && CSS.supports?.('selector(&)');
      if (!flatOk && !rawOk) {
        const c = getCss();
        if (st.textContent !== c) st.textContent = c;
        st.removeAttribute?.('data-ag-cs-flat');
        st.setAttribute?.('data-ag-cs-css-hash', fk);
      }
      if (st.parentNode !== p || p.lastElementChild !== st) p.appendChild(st);
      try { W.__agPrism?.flattenCss?.(); } catch {}
    };

    const mkRpc = (bk, lim, onTo, onErr, disp) => {
      const pend = new Map();
      let seq = 0;
      const send = (mkReq, ms, ext, bypass) =>
        new Promise((res) => {
          if (!bypass && pend.size >= lim) { res(onErr('busy', true)); return; }
          const id = ++seq, it = ext ? { res, t: null, ...ext } : { res, t: null };
          it.arm = (d = ms) => { clearTimeout(it.t); it.t = setTimeout(() => { pend.delete(id); res(onTo()); }, d); };
          it.arm();
          pend.set(id, it);
          try { W[bk](JSON.stringify(mkReq(id))); }
          catch (e) { clearTimeout(it.t); pend.delete(id); res(onErr(String(e && e.message ? e.message : e), false)); }
        });
      const resolve = (id, r) => {
        const it = pend.get(id);
        if (!it) return;
        clearTimeout(it.t);
        pend.delete(id);
        it.res(r);
      };
      const dispose = () => {
        for (const it of pend.values()) { clearTimeout(it.t); it.res(disp); }
        pend.clear();
      };
      return { pend, send, resolve, dispose };
    };

    const ensureRepo = () => {
      try {
        if (W.__agPrismRepoBridge?.__prismBridgeReady) return;
        const c = mkRpc('__agPrismRepoCall', 8, () => ({ ok: false, timeout: true, noRemote: true, hasRemote: false }), (e) => ({ ok: false, error: e }), { ok: false, disposed: true });
        const fn = (inp) => {
          const p = typeof inp === 'string' ? { action: inp } : inp && typeof inp === 'object' ? { ...inp } : { action: 'status' };
          const a = p.action || 'status';
          if (!isF(W.__agPrismRepoCall)) {
            return Promise.resolve({
              ok: false, offline: true, action: a, isGitRepo: false, noRemote: true, hasRemote: false,
              branch: 'local', commit: VER, shortHash: VER, remoteUrl: '', hasUpdates: false, upToDate: true, updated: false, message: 'Sidecar daemon offline',
            });
          }
          return c.send((id) => ({ id, action: a, input: p }), 16000).then((r) => (r && !r.action ? { ...r, action: a } : r));
        };
        Object.assign(fn, {
          __prismBridgeReady: true, call: fn, request: fn,
          status: () => fn({ action: 'status' }), pull: () => fn({ action: 'pull' }), sync: () => fn({ action: 'pull' }),
          resolve: c.resolve, dispose: c.dispose,
        });
        W.__agPrismRepoBridge = fn;
        W.__agPrismRepoResolve = c.resolve;
      } catch {}
    };

    const ensureThought = () => {
      try {
        const cur = W.__agPrismThoughtBridge;
        if (cur?.__prismBridgeReady && isF(cur.cacheStats) && isF(cur.cancelTranslate)) return;
        try { cur?.dispose?.(); } catch {}
        const c = mkRpc('__agPrismThoughtCall', 64, () => ({ ok: false, timeout: true, error: 'Request timed out' }), (e) => ({ ok: false, error: e }), { ok: false, disposed: true });
        const rpc = (p, onP, ms = 48000) => {
          const a = p?.action || 'get-config';
          if (!isF(W.__agPrismThoughtCall)) return Promise.resolve({ ok: false, offline: true, action: a, error: 'Sidecar daemon offline' });
          const ctrl = a === 'cancel-translate' || a === 'cache-stats' || a === 'clear-cache';
          return c.send((id) => ({ id, action: a, input: p }), ms, onP ? { onP, buf: '' } : null, ctrl).then((r) => (r && !r.action && !r.ok ? { ...r, action: a } : r));
        };
        const b = {
          __prismBridgeReady: true,
          call: (i) => rpc(i && typeof i === 'object' ? { ...i } : { action: String(i || 'get-config') }, null, 25000),
          translateStream: (o, onP) => rpc({ ...(o && typeof o === 'object' ? o : {}), action: 'translate-stream', text: o?.text || '', mode: o?.mode || 'ai' }, onP, Math.min(180000, 90000 + Math.max(0, c.pend.size - 2) * 30000)),
          cancelTranslate: (v) => rpc(v && typeof v === 'object' ? { ...v, action: 'cancel-translate' } : { action: 'cancel-translate', requestId: v, key: v }, null, 8000),
          cacheStats: () => rpc({ action: 'cache-stats' }, null, 8000),
          clearCache: () => rpc({ action: 'clear-cache' }, null, 8000),
          onChunk: (id, ch) => {
            const it = c.pend.get(id);
            if (!it || !isF(it.onP)) return;
            let txt = null;
            if (typeof ch === 'string') { it.buf = txt = ch; }
            else if (ch && typeof ch === 'object' && typeof ch.a === 'string') {
              const s = typeof it.buf === 'string' ? it.buf : '';
              if ((ch.o | 0) === s.length) it.buf = txt = s + ch.a;
            }
            if (txt !== null) {
              try { it.arm?.(60000); } catch {}
              try { it.onP(txt); } catch {}
            }
          },
          resolve: c.resolve,
          dispose: c.dispose,
        };
        W.__agPrismThoughtBridge = b;
        W.__agPrismThoughtOnChunk = b.onChunk;
        W.__agPrismThoughtResolve = c.resolve;
      } catch {}
    };

    const ensureUsage = () => {
      try {
        const cur = W.__agPrismUsageBridge;
        if (cur?.__prismBridgeReady && isF(cur.listSummaries)) return;
        try { cur?.dispose?.(); } catch {}
        const fu = (x) => ({ ok: false, records: [], summaries: [], ...x });
        const c = mkRpc('__agPrismUsageCall', 12, () => fu({ timeout: true }), (e, b) => fu(b ? { busy: true } : { error: e }), fu({ disposed: true }));
        const rpc = (q, ms = 18000) => (!isF(W.__agPrismUsageCall) ? Promise.resolve(fu({ offline: true })) : c.send((id) => ({ id, ...q }), ms));
        const b = {
          __prismBridgeReady: true,
          isOnline: () => isF(W.__agPrismUsageCall),
          fetchBatch: (o, ms = 18000) => (o && typeof o === 'object' && !Array.isArray(o) ? rpc({ action: o.action || 'fetch-batch', items: Array.isArray(o.items) ? o.items : [], includeSummaries: Boolean(o.includeSummaries) }, ms) : rpc({ action: 'fetch-batch', items: Array.isArray(o) ? o : [] }, ms)),
          listSummaries: (ms = 12000) => rpc({ action: 'list-summaries', items: [], includeSummaries: true }, ms),
          resolve: c.resolve,
          dispose: c.dispose,
        };
        W.__agPrismUsageBridge = b;
        W.__agPrismUsageResolve = c.resolve;
      } catch {}
    };

    const destroyMods = (incMain) => {
      const ks = '__agPrismTelemetry,__agPrismEffortSlider,__agPrismThought,__agPrismOmni,__agPrismContextMenu'.split(',');
      if (incMain) ks.push('__agPrism');
      for (const k of ks) { try { W[k]?.destroy?.(); } catch {} }
    };

    const stripForeign = () => {
      destroyMods(true);
      for (const k of '__agPrismInlineDiff,__agPrismHostI18n,__agPrismPeriodicPicker'.split(',')) { try { W[k]?.destroy?.(); } catch {} }
      try {
        const de = D.documentElement;
        for (const a of 'data-ag-prism-host-i18n,data-ag-prism-periodic-picker,data-ag-pp-open,data-ag-cs-model-menu'.split(',')) de?.removeAttribute?.(a);
        D.querySelectorAll?.('[data-ag-cs-aux-dual],[data-ag-cs-model-overlay]').forEach((el) => {
          el.removeAttribute('data-ag-cs-aux-dual');
          el.removeAttribute('data-ag-cs-model-overlay');
        });
      } catch {}
      for (const k of '__agPrismRepoBridge,__agPrismThoughtBridge,__agPrismUsageBridge,__agPrismOmniBridge'.split(',')) { try { W[k]?.dispose?.(); } catch {} }
      for (const id of [SID, LSID, 'ag-prism-settings-v101-css', 'ag-prism-studio-v101-css', 'ag-prism-omni-css', 'ag-prism-inline-diff-css']) { try { D.getElementById(id)?.remove(); } catch {} }
      try { D.querySelectorAll?.('[data-testid="prism-thought-ai-config"],[data-testid="prism-thought-general-config"],.ag-cs-ctx-menu,.ag-cs-ctx-toast,.ag-cs-inline-diff-box,.ag-cs-diff-ctx-menu')?.forEach?.((el) => el.remove()); } catch {}
      for (const k of '__agPrismThought,__agPrismThoughtSettingsUi,__agPrismInlineDiff,__agPrismInlineDiffFactory,__agPrismInlineDiffResolve,__agPrismOmni,__agPrismContextMenu,__agPrism,__agClaudeStyle'.split(',')) {
        delete W[k];
        delete G[k];
      }
    };

    const hasMarkers = () => {
      try {
        const cl = D.body?.classList;
        if (cl && (cl.contains('theme-standalone') || cl.contains('monaco-workbench'))) return true;
        return Boolean(D.querySelector('.agy-shell,.agy-home,[data-testid="aux-pane-split"],[data-testid="conversation-view"],[data-testid="agent-input-box"],[data-testid="model-selector-trigger"],.monaco-workbench'));
      } catch { return false; }
    };

    const checkHost = () => {
      try {
        const href = typeof W.location?.href === 'string' ? W.location.href : '';
        if (!href) return 'ok';
        const low = href.toLowerCase();
        if (/^(?:devtools:\\/\\/|data:|chrome:|chrome-extension:|edge:|blob:|plugin:)/.test(low)) return 'reject';
        if (/^(?:vscode-file:\\/\\/|app:\\/\\/|about:)/.test(low)) {
          return /^(?:untitled|launchpad)$/i.test(String(D.title || '').trim()) || /\\/launchpad(?:\\.html)?(?:[?#]|$)/i.test(low) ? 'reject' : 'ok';
        }
        const m = /^(https?):\\/\\/(127\\.0\\.0\\.1|localhost|\\[::1\\])(?::\\d+)?(\\/[^?#]*)?(?:[?#]|$)/i.exec(href);
        if (!m) return /^https?:/.test(low) ? 'reject' : 'ok';
        if (/^\\/(?:viewer(?:\\/|$)|sandbox(?:\\/|$)|stream(?:\\/|$)|api(?:\\/|$))/.test((m[3] || '/').toLowerCase())) return 'reject';
        if (hasMarkers()) return 'ok';
        const rs = String(D.readyState || '');
        if (m[1].toLowerCase() === 'http') return rs === 'loading' ? 'defer' : 'reject';
        if (/\\bantigravity\\b/i.test(String(D.title || ''))) return 'ok';
        return rs === 'complete' ? 'reject' : 'ok';
      } catch { return 'ok'; }
    };

    let status = 'ok', mounted = false;
    const mount = () => {
      if (mounted || !D.documentElement) return;
      const v = checkHost();
      if (v === 'reject') { status = 'skipped-non-host'; stripForeign(); return; }
      if (v === 'defer') { status = 'deferred'; D.addEventListener('DOMContentLoaded', () => mount(), { once: true }); return; }
      mounted = true;
      if (W.addEventListener && String(D.readyState || '') !== 'complete') {
        W.addEventListener('load', () => { if (checkHost() === 'reject') stripForeign(); }, { once: true });
      }
      try {
        cleanOld();
        ensureRepo();
        ensureThought();
        ensureUsage();
        if (D.head) applyStyle();
        else D.addEventListener('DOMContentLoaded', applyStyle, { once: true });
        const bootCfg = __AG_INJ_BOOTCFG__;
        const cur = W.__agPrism || W.__agClaudeStyle;
        if (cur && cur.version === VER && cur.codeHash === __AG_INJ_CODEHASH__ && W.__agPrismTelemetry && W.__agPrismEffortSlider) {
          cur.refreshConfig(bootCfg);
        } else {
          destroyMods(false);
          try { D.querySelectorAll('[data-ag-prism-fallback="1"]').forEach((n) => n.remove()); } catch {}
          __AG_INJ_BUNDLE__();
          if (isF(G.__agCsUiMain)) G.__agCsUiMain(bootCfg);
        }
        if (W.__agClaudeStyle && !W.__agPrism) W.__agPrism = W.__agClaudeStyle;
        else if (W.__agPrism) W.__agClaudeStyle = W.__agPrism;
        const eCfg = (isF(W.__agPrism?.getState) ? W.__agPrism.getState()?.cfg : null) || bootCfg;
        if (eCfg?.omniModule === 'off') { try { W.__agPrismOmni?.destroy?.(); } catch {} }
        else { try { W.__agPrismOmni?.sync?.(eCfg, W.__agPrismOmniServerMeta || null); } catch {} }
        const de = D.documentElement;
        if (de) {
          if (!de.hasAttribute('data-ag-prism')) de.setAttribute('data-ag-prism', VER);
          if (eCfg?.thoughtTranslate && eCfg.thoughtTranslate !== 'off') de.setAttribute('data-ag-prism-thought-view', eCfg.thoughtView === 'bilingual' ? 'bilingual' : 'immersive');
          else de.removeAttribute('data-ag-prism-thought-view');
        }
      } catch (e) {
        status = 'error: ' + (e?.message || String(e));
        if (typeof console !== 'undefined' && console.error) console.error('[obsidian-prism] init error:', e);
      }
    };

    if (D.documentElement) mount();
    else {
      status = 'deferred';
      const onR = () => {
        if (D.documentElement) {
          D.removeEventListener('readystatechange', onR);
          D.removeEventListener('DOMContentLoaded', onR);
          mount();
        }
      };
      D.addEventListener('readystatechange', onR);
      D.addEventListener('DOMContentLoaded', onR);
    }
    const api = W.__agPrism || W.__agClaudeStyle;
    return { version: VER, status, state: isF(api?.getState) ? api.getState() : null };
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
    // i18n-locales.js 虽已拆至按需 Settings 通道，但其活跃语言迷你切片会打入 Channel 1 bootCfg.__uiSlice，故纳入源哈希确保缓存强一致
    { rel: 'i18n-locales.js', fullPath: path.join(__dirname, 'i18n-locales.js'), optional: true },
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
  const uiSlice = buildRuntimeUiSlicePayload(config);
  const effective = {
    ...(config && typeof config === 'object' ? config : {}),
    ...(uiSlice ? { __uiSlice: uiSlice } : {}),
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
  _bundleCacheStats.channelHitsByName = { omni: 0, sidebar: 0, hostI18n: 0, thought: 0, inlineDiff: 0, wallpaper: 0, periodicPicker: 0, settings: 0, mascot: 0, suggester: 0, homeStudio: 0 };
  _bundleCacheStats.lastOutcome = 'none';
  _bundleCacheStats.lastCachePath = null;
  try { _omniClientCache.cachedPaths?.clear?.(); } catch {}
  try { _sidebarClientCache.cachedPaths?.clear?.(); } catch {}
  try { _hostI18nCache.cachedPaths?.clear?.(); } catch {}
  try { _swarmI18nCache.cachedPaths?.clear?.(); } catch {}
  try { _thoughtAssetsCache.cachedPaths?.clear?.(); } catch {}
  try { _inlineDiffClientCache.cachedPaths?.clear?.(); } catch {}
  try { _wallpaperAssetsCache.cachedPaths?.clear?.(); } catch {}
  try { _periodicPickerCache.cachedPaths?.clear?.(); } catch {}
  try { _settingsChannelCache.cachedPaths?.clear?.(); } catch {}
  try { _mascotChannelCache.cachedPaths?.clear?.(); } catch {}
  try { _suggesterAssetsCache.cachedPaths?.clear?.(); } catch {}
  try { _homeStudioChannelCache.cachedPaths?.clear?.(); } catch {}
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
  if (channelName === 'hostI18n' || channelName === 'swarmI18n') {
    if (!hasOwn('minRuntime') || typeof entry.minRuntime !== 'string' || entry.minRuntime.length === 0) return false;
    if (!hasOwn('dictRaw') || typeof entry.dictRaw !== 'string' || entry.dictRaw.length === 0) return false;
    const totalBytes = Buffer.byteLength(entry.minRuntime, 'utf8') + Buffer.byteLength(entry.dictRaw, 'utf8');
    if (totalBytes > CHANNEL_CACHE_MAX_PAYLOAD_BYTES) return false;
    if (computeHash(`${entry.minRuntime}:${entry.dictRaw}`) !== entry.codeHash) return false;
    return sha256Text(`${entry.codeHash}\0${entry.minRuntime}\0${entry.dictRaw}`) === entry.payloadSha256;
  }
  if (channelName === 'thought' || channelName === 'wallpaper' || channelName === 'suggester') {
    if (!hasOwn('minClient') || typeof entry.minClient !== 'string' || entry.minClient.length === 0) return false;
    if (!hasOwn('minSettingsUi') || typeof entry.minSettingsUi !== 'string' || entry.minSettingsUi.length === 0) return false;
    const totalBytes = Buffer.byteLength(entry.minClient, 'utf8') + Buffer.byteLength(entry.minSettingsUi, 'utf8');
    if (totalBytes > CHANNEL_CACHE_MAX_PAYLOAD_BYTES) return false;
    if (computeHash(`${entry.minClient}\n${entry.minSettingsUi}`) !== entry.codeHash) return false;
    return sha256Text(`${entry.codeHash}\0${entry.minClient}\0${entry.minSettingsUi}`) === entry.payloadSha256;
  }
  if (channelName === 'periodicPicker' || channelName === 'settings' || channelName === 'mascot' || channelName === 'homeStudio') {
    if (!hasOwn('minRuntime') || typeof entry.minRuntime !== 'string' || entry.minRuntime.length === 0) return false;
    if (Buffer.byteLength(entry.minRuntime, 'utf8') > CHANNEL_CACHE_MAX_PAYLOAD_BYTES) return false;
    if (computeHash(entry.minRuntime) !== entry.codeHash) return false;
    return sha256Text(`${entry.codeHash}\0${entry.minRuntime}`) === entry.payloadSha256;
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
    swarmI18n: _swarmI18nCache,
    thought: _thoughtAssetsCache,
    inlineDiff: _inlineDiffClientCache,
    wallpaper: _wallpaperAssetsCache,
    periodicPicker: _periodicPickerCache,
    settings: _settingsChannelCache,
    mascot: _mascotChannelCache,
    suggester: _suggesterAssetsCache,
    homeStudio: _homeStudioChannelCache,
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
  const uiSlice = buildRuntimeUiSlicePayload(config);
  const buildBootCfgJson = (codeHash) =>
    JSON.stringify({
      ...config,
      ...(uiSlice ? { __uiSlice: uiSlice } : {}),
      binding: SETTING_BINDING,
      codeHash,
      __fromFile: true,
    });
  const cachePath = resolveBundleCachePathOption(opts);
  const deferCacheWrite = Boolean(opts && opts.deferCacheWrite === true);

  // 同进程配置热刷新快路径（broadcastConfigRefresh）：源 stat 未变化时直接复用已验签的内存基础模板（< 1ms，零磁盘阻塞）
  // P2-7a: 延迟对主包字符串计算 exprSha256 至 flushPendingBundleCache() 实际落盘时再执行，避免防抖期内重复白算哈希
  if (cachePath && deferCacheWrite && _warmBaseCache.basePrefix && _warmBaseCache.statSig) {
    try {
      if (getBundleSourceStatSig() === _warmBaseCache.statSig) {
        const codeHash = _warmBaseCache.codeHash;
        const bootCfgJson = buildBootCfgJson(codeHash);
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
    bootCfgJson = buildBootCfgJson(codeHash);
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
    bootCfgJson = buildBootCfgJson(codeHash);
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
  // off 模式挂载第四通道进入反向英文还原（温和压制外部运行时 DOM 汉化，零 app.asar 修改）
  if (mode === 'off') return true;
  if (mode === 'on') return true;
  const lang = cfg.language || cfg.lang || 'auto';
  if (lang === 'zh-CN') return true;
  if (lang === 'auto') {
    const sysLocale = hostLocaleHint || detectSystemUiLocale();
    const stripped = String(sysLocale || '').trim().split(/[.@]/)[0];
    const norm = stripped.toLowerCase().replace(/_/g, '-');
    return norm === 'zh' || /^zh-(?:cn|hans|sg)(?:-|$)/.test(norm);
  }
  return false;
}

function readCompiledHostI18nAssets(opts = null) {
  const rtPath = path.join(__dirname, 'vendor', 'host-i18n', 'host-i18n-runtime.js');
  const revPath = path.join(__dirname, 'vendor', 'host-i18n', 'reverse-patterns.js');
  const dictPath = path.join(__dirname, 'vendor', 'host-i18n', 'zh-CN.json');
  if (!fs.existsSync(rtPath) || !fs.existsSync(dictPath)) {
    return { minRuntime: '', dictRaw: '', codeHash: '' };
  }
  const hasRev = fs.existsSync(revPath);
  const sig = `${getFileSig(rtPath)}|${hasRev ? getFileSig(revPath) : 'norev'}|${getFileSig(dictPath)}`;
  const cachePath = resolveBundleCachePathOption(opts);
  if (!cachePath && _hostI18nCache.sig === sig && _hostI18nCache.codeHash) {
    return _hostI18nCache;
  }
  const rtBuf = fs.readFileSync(rtPath);
  const revBuf = hasRev ? fs.readFileSync(revPath) : null;
  const dictBuf = fs.readFileSync(dictPath);
  const fileEntries = [];
  if (revBuf) fileEntries.push({ rel: 'vendor/host-i18n/reverse-patterns.js', content: revBuf });
  fileEntries.push({ rel: 'vendor/host-i18n/host-i18n-runtime.js', content: rtBuf });
  fileEntries.push({ rel: 'vendor/host-i18n/zh-CN.json', content: dictBuf });
  return resolveChannelAssetsWithDiskCache({
    channelName: 'hostI18n',
    memCache: _hostI18nCache,
    setMemCache: (v) => { _hostI18nCache = v; },
    sig,
    fileEntries,
    opts,
    compileFn: () => {
      const minRev = revBuf ? minifySingleSource(revBuf.toString('utf8')) : '';
      const minRt = minifySingleSource(rtBuf.toString('utf8'));
      const minRuntime = minRev ? `${minRev};\n${minRt}` : minRt;
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
  try { delete window.__agPrismHostI18nReversePatterns; } catch {}
  try { delete globalThis.__agPrismHostI18nReversePatterns; } catch {}
  return { ok: true, status: 'off' };
})()`;

// 主帧 Electron Isolated Context 外部汉化器（如 preload 注入版 yiheng8023/antigravity-chinese、yuexps/Antigravity-Hans）可逆协同静音表达式
// 零 app.asar 修改、绝不修改 Map.prototype、绝不删改词典/缓存条目，退出或切回 auto/on 时 100% 无损恢复
const ISOLATED_HOST_I18N_PAUSE_EXPRESSION = `(() => {
  try {
    const g = globalThis;
    const prev = g.__agPrismIsoHostI18nState;
    if (prev && prev.paused) {
      return { ok: true, detected: true, paused: true, alreadyPaused: true, provider: prev.provider || null };
    }
    const st = {
      paused: false,
      provider: null,
      agyCachePaused: false,
      agyCacheRef: null,
      agyOrigHasDesc: null,
      agyOrigGetDesc: null,
      hansSwitched: false,
      hansPrevLang: null,
      patchObserverPaused: false,
      patchObserverRef: null,
      patchObserverTarget: null,
      patchObserverOpts: null,
    };
    if (
      g.__AGY_CACHE__ &&
      typeof g.__AGY_CACHE__.has === 'function' &&
      typeof g.__AGY_CACHE__.get === 'function' &&
      (g.__AGY_I18N_INITIALIZED__ || g.__AGY_I18N_DATA__)
    ) {
      const cache = g.__AGY_CACHE__;
      st.agyCacheRef = cache;
      st.agyOrigHasDesc = Object.getOwnPropertyDescriptor(cache, 'has') || null;
      st.agyOrigGetDesc = Object.getOwnPropertyDescriptor(cache, 'get') || null;
      Object.defineProperty(cache, 'has', { value: () => true, configurable: true, writable: true });
      Object.defineProperty(cache, 'get', { value: () => null, configurable: true, writable: true });
      st.agyCachePaused = true;
      st.paused = true;
      st.provider = 'yiheng8023';
    }
    if (typeof g.__antigravityZhSetLang === 'function') {
      let stored = null;
      try { stored = g.localStorage && g.localStorage.getItem('antigravityHansLang'); } catch {}
      const norm = stored !== null ? String(stored).trim().toLowerCase() : '';
      if (stored === null || (norm !== 'en' && norm !== 'en-us' && norm !== 'off' && norm !== 'false' && norm !== '0')) {
        st.hansPrevLang = stored && String(stored).trim() ? String(stored).trim() : 'zh-CN';
        try {
          g.__antigravityZhSetLang('en');
          st.hansSwitched = true;
          st.paused = true;
          if (!st.provider) st.provider = 'yuexps/Antigravity-Hans';
        } catch {}
      }
    } else if (
      g.__antigravityZhPatchObserver &&
      typeof g.__antigravityZhPatchObserver.disconnect === 'function' &&
      typeof g.__antigravityZhPatchObserver.observe === 'function'
    ) {
      try {
        const obs = g.__antigravityZhPatchObserver;
        st.patchObserverRef = obs;
        st.patchObserverTarget = obs._target || obs.target || (typeof document !== 'undefined' && (document.documentElement || document.body)) || null;
        st.patchObserverOpts = obs.options || { childList: true, subtree: true, characterData: true };
        obs.disconnect();
        st.patchObserverPaused = true;
        st.paused = true;
        if (!st.provider) st.provider = 'yuexps/Antigravity-Hans';
      } catch {}
    }
    if (!st.paused) {
      return { ok: true, detected: false, paused: false, alreadyPaused: false, provider: null };
    }
    g.__agPrismIsoHostI18nState = st;
    return { ok: true, detected: true, paused: true, alreadyPaused: false, provider: st.provider };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
})()`;

const ISOLATED_HOST_I18N_RESUME_EXPRESSION = `(() => {
  try {
    const g = globalThis;
    const st = g.__agPrismIsoHostI18nState;
    if (!st || !st.paused) {
      return { ok: true, resumed: false, provider: null };
    }
    try { delete g.__agPrismIsoHostI18nState; } catch { g.__agPrismIsoHostI18nState = null; }
    if (st.agyCachePaused && st.agyCacheRef) {
      try {
        if (st.agyOrigHasDesc) Object.defineProperty(st.agyCacheRef, 'has', st.agyOrigHasDesc);
        else delete st.agyCacheRef.has;
        if (st.agyOrigGetDesc) Object.defineProperty(st.agyCacheRef, 'get', st.agyOrigGetDesc);
        else delete st.agyCacheRef.get;
      } catch {}
      try {
        if (typeof g.__AGY_RUN_FULL_SCAN__ === 'function') g.__AGY_RUN_FULL_SCAN__();
      } catch {}
    }
    if (st.patchObserverPaused && st.patchObserverRef && st.patchObserverTarget) {
      try { st.patchObserverRef.observe(st.patchObserverTarget, st.patchObserverOpts); } catch {}
    }
    if (st.hansSwitched && typeof g.__antigravityZhSetLang === 'function') {
      try { g.__antigravityZhSetLang(st.hansPrevLang || 'zh-CN'); } catch {}
    }
    return { ok: true, resumed: true, provider: st.provider || null };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
})()`;

// 第四通道独立注入（Host UI 简体中文按需本地化 + off 态反向英文还原）：绝不打入静态主包，支持 4 层自动礼让、3 层温和压制与 100% 无损卸载
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
  const mode = cfg.hostLocalization === 'on' ? 'on' : cfg.hostLocalization === 'off' ? 'off' : 'auto';
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
          targetMode = 'off';
        } else if (liveCfg.hostLocalization === 'on') {
          targetMode = 'on';
        } else {
          targetMode = 'auto';
          const liveLang = liveCfg.language || liveCfg.lang || '';
          if (liveLang && liveLang !== 'zh-CN' && liveLang !== 'auto') {
            try { window.__agPrismHostI18n?.destroy?.(); document.documentElement?.removeAttribute?.('data-ag-prism-host-i18n'); } catch {}
            return { ok: true, status: 'off', skippedByLiveCfg: true };
          }
          if (!liveLang || liveLang === 'auto') {
            const navLang = String(
              (typeof navigator !== 'undefined' && ((navigator.languages && navigator.languages[0]) || navigator.language)) || ''
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
        const isHealthyForTarget =
          st &&
          st.mode === targetMode &&
          (targetMode === 'off'
            ? st.status === 'off-enforced' || st.status === 'off-blocked'
            : st.status === 'active' || st.status === 'yielded');
        if (isHealthyForTarget) {
          return { ok: true, reused: true, codeHash: targetHash, ...st };
        }
        if (typeof existing.setMode === 'function') {
          const switched = existing.setMode(targetMode);
          try { (window.__agPrism || window.__agClaudeStyle)?.sync?.(); } catch {}
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
      try { (window.__agPrism || window.__agClaudeStyle)?.sync?.(); } catch {}
      return { ok: true, codeHash: targetHash, ...cur };
    };

    if (needDomMarkerOnReady && typeof document.addEventListener === 'function') {
      document.addEventListener('DOMContentLoaded', () => { try { mountOrReuse(); } catch {} }, { once: true });
      return { ok: true, status: 'deferred', codeHash: targetHash };
    }
    return mountOrReuse();
  })()`;
}

let _swarmI18nCache = { sig: '', sourceHash: '', minRuntime: '', dictRaw: '', codeHash: '', cachedPaths: new Set() };

function shouldEnableSwarmI18n(config, hostLocaleHint = null) {
  const cfg = config && typeof config === 'object' ? reconcileConfigAliases(config) : readConfig();
  const mode = cfg.hostLocalization || 'auto';
  // 原生 Swarm 面板本身为英文：off 模式或非简体中文 auto 模式严格 0 附着 / 立即卸载还原英文
  if (mode === 'off') return false;
  return shouldEnableHostI18n(cfg, hostLocaleHint);
}

function readCompiledSwarmI18nAssets(opts = null) {
  const rtPath = path.join(__dirname, 'vendor', 'host-i18n', 'swarm-i18n-runtime.js');
  const dictPath = path.join(__dirname, 'vendor', 'host-i18n', 'swarm-zh-CN.json');
  if (!fs.existsSync(rtPath) || !fs.existsSync(dictPath)) {
    return { minRuntime: '', dictRaw: '', codeHash: '' };
  }
  const sig = `${getFileSig(rtPath)}|${getFileSig(dictPath)}`;
  const cachePath = resolveBundleCachePathOption(opts);
  if (!cachePath && _swarmI18nCache.sig === sig && _swarmI18nCache.codeHash) {
    return _swarmI18nCache;
  }
  const rtBuf = fs.readFileSync(rtPath);
  const dictBuf = fs.readFileSync(dictPath);
  const fileEntries = [
    { rel: 'vendor/host-i18n/swarm-i18n-runtime.js', content: rtBuf },
    { rel: 'vendor/host-i18n/swarm-zh-CN.json', content: dictBuf },
  ];
  return resolveChannelAssetsWithDiskCache({
    channelName: 'swarmI18n',
    memCache: _swarmI18nCache,
    setMemCache: (v) => { _swarmI18nCache = v; },
    sig,
    fileEntries,
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

const SWARM_I18N_REMOVE_EXPRESSION = `(() => {
  try { window.__agPrismSwarmI18n?.destroy?.(); } catch {}
  try { document.documentElement?.removeAttribute?.('data-ag-prism-swarm-i18n'); } catch {}
  try { delete window.__agPrismSwarmI18n; } catch {}
  try { delete globalThis.__agPrismSwarmI18n; } catch {}
  try { delete window.__agPrismSwarmI18nFactory; } catch {}
  try { delete globalThis.__agPrismSwarmI18nFactory; } catch {}
  return { ok: true, status: 'off' };
})()`;

// Issue #18 层 B：Swarm 独立侧栏 Webview (plugin://swarm--swarm_board-*) 按需纯 CDP 汉化表达式
// 零 app.asar 修改、0 B Channel 1 增量、支持按需磁盘缓存与 100% 无损英文还原
function buildSwarmI18nExpression(config = null, hostLocaleHint = null, opts = null) {
  let resolvedLocaleHint = hostLocaleHint;
  let resolvedOpts = opts;
  if (hostLocaleHint && typeof hostLocaleHint === 'object' && !resolvedOpts) {
    resolvedOpts = hostLocaleHint;
    resolvedLocaleHint = null;
  }
  const cfg = config && typeof config === 'object' ? reconcileConfigAliases(config) : readConfig();
  if (!shouldEnableSwarmI18n(cfg, resolvedLocaleHint)) {
    return '';
  }
  const { minRuntime, dictRaw, codeHash } = readCompiledSwarmI18nAssets(resolvedOpts);
  if (!minRuntime || !dictRaw) {
    return '';
  }
  const hashJson = serializeJsonForEval(codeHash);

  return `(() => {
    try {
      const loc = typeof window !== 'undefined' && window.location;
      if (
        !loc ||
        loc.protocol !== 'plugin:' ||
        !/^swarm--swarm_board-\\d+$/.test(String(loc.hostname || '')) ||
        loc.port ||
        loc.username ||
        loc.password ||
        String(loc.pathname || '/') !== '/'
      ) {
        return { ok: false, status: 'skipped-non-swarm-url' };
      }
    } catch {
      return { ok: false, status: 'skipped-non-swarm-url' };
    }

    const targetHash = ${hashJson};
    const mountOrReuse = () => {
      const existing = window.__agPrismSwarmI18n;
      if (existing && existing.__prismCodeHash === targetHash && typeof existing.getStatus === 'function') {
        const st = existing.getStatus();
        if (st && (st.status === 'active' || st.status === 'yielded')) {
          if (st.status === 'active' && typeof existing.scan === 'function') {
            try { existing.scan(); } catch {}
          }
          return { ok: true, reused: true, codeHash: targetHash, ...st };
        }
      }
      try { existing?.destroy?.(); } catch {}

      ${minRuntime};
      const factory = window.__agPrismSwarmI18nFactory || globalThis.__agPrismSwarmI18nFactory;
      if (!factory || typeof factory.mountSwarmI18n !== 'function') {
        return { ok: false, status: 'factory-missing' };
      }
      const inst = factory.mountSwarmI18n({
        root: window,
        doc: document,
        dict: ${dictRaw},
      });
      if (inst && typeof inst === 'object') {
        inst.__prismCodeHash = targetHash;
      }
      const cur = inst && typeof inst.getStatus === 'function' ? inst.getStatus() : { status: 'active' };
      return { ok: Boolean(inst && inst.ok !== false), codeHash: targetHash, ...cur };
    };

    if (typeof document !== 'undefined' && document.readyState === 'loading' && !document.body && typeof document.addEventListener === 'function') {
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

const PERIODIC_PICKER_MODULE_FILES = [
  'pbr-grain-assets.js',
  'audio-fx.js',
  'model-catalog.js',
  'host-bridge.js',
  'oled-cyber-screen.js',
  'keyboard-3d-gl.js',
  'bento-ui.js',
  'periodic-picker.js',
];

let _periodicPickerCache = { sig: '', sourceHash: '', minRuntime: '', codeHash: '', cachedPaths: new Set() };

function shouldEnablePeriodicPicker(_config) {
  return false;
}

function readCompiledPeriodicPickerAssets(opts = null) {
  const baseDir = path.join(__dirname, 'vendor', 'periodic-picker');
  const rtPath = path.join(baseDir, 'periodic-picker.js');
  if (!fs.existsSync(rtPath)) {
    return { sig: '', minRuntime: '', codeHash: '' };
  }
  const presentModules = [];
  const sigParts = [];
  for (const name of PERIODIC_PICKER_MODULE_FILES) {
    const filePath = path.join(baseDir, name);
    if (fs.existsSync(filePath)) {
      presentModules.push({ name, filePath, rel: `vendor/periodic-picker/${name}` });
      sigParts.push(`${name}:${getFileSig(filePath)}`);
    } else {
      sigParts.push(`${name}:none`);
    }
  }
  const sig = sigParts.join('|');
  const cachePath = resolveBundleCachePathOption(opts);
  if (!cachePath && _periodicPickerCache.sig === sig && _periodicPickerCache.codeHash) {
    return _periodicPickerCache;
  }
  const fileEntries = presentModules.map((mod) => ({
    rel: mod.rel,
    content: fs.readFileSync(mod.filePath),
  }));
  const extraTag = presentModules.map((mod) => mod.name).join(',');
  return resolveChannelAssetsWithDiskCache({
    channelName: 'periodicPicker',
    memCache: _periodicPickerCache,
    setMemCache: (v) => { _periodicPickerCache = v; },
    sig,
    fileEntries,
    extraTag,
    opts,
    compileFn: () => {
      const parts = [];
      for (const item of fileEntries) {
        const minPart = minifySingleSource(item.content.toString('utf8'));
        if (minPart) parts.push(minPart);
      }
      const minRuntime = parts.join(';\n');
      const codeHash = minRuntime ? computeHash(minRuntime) : '';
      return { minRuntime, codeHash };
    },
    toCacheEntry: (assets, sourceHash) => ({
      sourceHash,
      codeHash: assets.codeHash,
      minRuntime: assets.minRuntime,
      payloadSha256: sha256Text(`${assets.codeHash}\0${assets.minRuntime}`),
      updatedAt: Date.now(),
    }),
    fromCacheEntry: (entry) => ({
      minRuntime: entry.minRuntime,
      codeHash: entry.codeHash,
    }),
  });
}

const PERIODIC_PICKER_REMOVE_EXPRESSION = `(() => {
  try { window.__agPrismPeriodicPicker?.destroy?.(); } catch {}
  try { document.documentElement?.removeAttribute?.('data-ag-prism-periodic-picker'); } catch {}
  try { document.documentElement?.removeAttribute?.('data-ag-pp-open'); } catch {}
  try { document.documentElement?.removeAttribute?.('data-ag-pp-holding'); } catch {}
  try {
    document
      .querySelectorAll?.('#ag-prism-periodic-picker-css, #ag-prism-periodic-picker-root, .ag-pp-hold-ring, .ag-pp-mini-keycap')
      .forEach((n) => n.remove());
  } catch {}
  for (const k of ['__agPrismPeriodicPicker', '__agPrismPeriodicPickerFactory', '__agPrismKeyboard3D', '__agPrismPeriodicKeyboard3D', '__agPrismOledScreen', '__agPrismGrainAssets', '__agPeriodicAudioFx', '__agPeriodicModelCatalog', '__agPeriodicHostBridge', '__agPeriodicBentoUi', '__agPeriodicPbrGrainAssets', '__agPeriodicOledScreen', '__agPeriodicKeyboard3D']) {
    try { delete window[k]; } catch {}
    try { delete globalThis[k]; } catch {}
  }
  return { ok: true, status: 'off' };
})()`;

// 第八通道独立注入（元素周期表 3D 模型选择器）：绝不打入静态主包，支持 8 模块顺序合并、.bundle-cache.json 磁盘缓存、长按呼出与 100% 对称卸载
function buildPeriodicPickerExpression(config = null, opts = null) {
  const cfg = config && typeof config === 'object' ? reconcileConfigAliases(config) : readConfig();
  if (!shouldEnablePeriodicPicker(cfg)) {
    return '';
  }
  const { minRuntime, codeHash } = readCompiledPeriodicPickerAssets(opts);
  if (!minRuntime || !codeHash) {
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

    try {
      try {
        window.__agPrismPeriodicPicker?.destroy?.();
        document.documentElement?.removeAttribute?.('data-ag-prism-periodic-picker');
        document.documentElement?.removeAttribute?.('data-ag-pp-open');
        document.documentElement?.removeAttribute?.('data-ag-pp-holding');
        document.querySelectorAll?.('#ag-prism-periodic-picker-css, #ag-prism-periodic-picker-root, .ag-pp-hold-ring, .ag-pp-mini-keycap').forEach((n) => n.remove());
        for (const k of ['__agPrismPeriodicPicker', '__agPrismPeriodicPickerFactory', '__agPrismKeyboard3D', '__agPrismPeriodicKeyboard3D', '__agPrismOledScreen', '__agPrismGrainAssets', '__agPeriodicAudioFx', '__agPeriodicModelCatalog', '__agPeriodicHostBridge', '__agPeriodicBentoUi', '__agPeriodicPbrGrainAssets', '__agPeriodicOledScreen', '__agPeriodicKeyboard3D']) {
          try { delete window[k]; } catch {}
          try { delete globalThis[k]; } catch {}
        }
      } catch {}
      return { ok: true, status: 'off', skippedByLiveCfg: true };
    } catch {}

    const targetHash = ${hashJson};
    const mountOrReuse = () => {
      if (needDomMarkerOnReady && !hasDomMarker() && (isPlainHttpLocalhost || !/\\bantigravity\\b/i.test(String(document.title || '')))) {
        return { ok: false, status: 'skipped-non-host' };
      }
      const existing = window.__agPrismPeriodicPicker;
      if (existing && existing.__prismCodeHash === targetHash) {
        const st = typeof existing.getStatus === 'function' ? existing.getStatus() : null;
        const domActive = !document.documentElement || document.documentElement.getAttribute('data-ag-prism-periodic-picker') === '1';
        if ((!st || (st.status !== 'off' && st.status !== 'destroyed' && st.mode !== 'off')) && domActive) {
          return { ok: true, reused: true, codeHash: targetHash, ...(st && typeof st === 'object' ? st : {}) };
        }
      }
      try { existing?.destroy?.(); } catch {}

      ${minRuntime};
      const factory = window.__agPrismPeriodicPickerFactory || globalThis.__agPrismPeriodicPickerFactory;
      if (!factory || typeof factory.mountPeriodicPicker !== 'function') {
        return { ok: false, status: 'factory-missing' };
      }
      const inst = factory.mountPeriodicPicker({
        root: window,
        doc: document,
        mode: 'on',
      });
      if (inst && typeof inst === 'object') {
        inst.__prismCodeHash = targetHash;
        if (!window.__agPrismPeriodicPicker) window.__agPrismPeriodicPicker = inst;
      }
      const cur = inst && typeof inst.getStatus === 'function' ? inst.getStatus() : { status: 'active' };
      return { ok: true, codeHash: targetHash, ...(cur && typeof cur === 'object' ? cur : {}) };
    };

    if (needDomMarkerOnReady && typeof document.addEventListener === 'function') {
      document.addEventListener('DOMContentLoaded', () => { try { mountOrReuse(); } catch {} }, { once: true });
      return { ok: true, status: 'deferred', codeHash: targetHash };
    }
    return mountOrReuse();
  })()`;
}

// ── 第九通道：设置面板 + 全量 8 语言词典 + 八方旅人 WebGL2 选角舞台按需独立注入（不占 Channel 1 体积） ──
let _settingsChannelCache = { sig: '', sourceHash: '', minRuntime: '', codeHash: '', cachedPaths: new Set() };

function readCompiledSettingsChannelAssets(opts = null) {
  const locPath = path.join(__dirname, 'i18n-locales.js');
  const setPath = path.join(__dirname, 'settings-panel.js');
  if (!fs.existsSync(locPath) || !fs.existsSync(setPath)) {
    return { sig: '', minRuntime: '', codeHash: '' };
  }
  const brandPath = path.join(__dirname, 'assets', 'brand-mark-svg.js');
  const atlasPath = path.join(__dirname, 'vendor', 'clawd-mascot', 'tavern-atlas-data.js');
  const stageGlPath = path.join(__dirname, 'vendor', 'clawd-mascot', 'octopath-stage-webgl.js');
  const hasBrand = fs.existsSync(brandPath);
  const hasAtlas = fs.existsSync(atlasPath);
  const hasStageGl = fs.existsSync(stageGlPath);
  const sig = `${getFileSig(locPath)}|${hasBrand ? getFileSig(brandPath) : '0'}|${hasAtlas ? getFileSig(atlasPath) : '0'}|${hasStageGl ? getFileSig(stageGlPath) : '0'}|${getFileSig(setPath)}`;
  const cachePath = resolveBundleCachePathOption(opts);
  if (!cachePath && _settingsChannelCache.sig === sig && _settingsChannelCache.codeHash) {
    return _settingsChannelCache;
  }
  const locBuf = fs.readFileSync(locPath);
  const brandBuf = hasBrand ? fs.readFileSync(brandPath) : null;
  const atlasBuf = hasAtlas ? fs.readFileSync(atlasPath) : null;
  const stageGlBuf = hasStageGl ? fs.readFileSync(stageGlPath) : null;
  const setBuf = fs.readFileSync(setPath);
  const fileEntries = [{ rel: 'i18n-locales.js', content: locBuf }];
  if (brandBuf) fileEntries.push({ rel: 'assets/brand-mark-svg.js', content: brandBuf });
  if (atlasBuf) fileEntries.push({ rel: 'vendor/clawd-mascot/tavern-atlas-data.js', content: atlasBuf });
  if (stageGlBuf) fileEntries.push({ rel: 'vendor/clawd-mascot/octopath-stage-webgl.js', content: stageGlBuf });
  fileEntries.push({ rel: 'settings-panel.js', content: setBuf });
  return resolveChannelAssetsWithDiskCache({
    channelName: 'settings',
    memCache: _settingsChannelCache,
    setMemCache: (v) => { _settingsChannelCache = v; },
    sig,
    fileEntries,
    opts,
    compileFn: () => {
      const parts = [minifySingleSource(locBuf.toString('utf8'))];
      if (brandBuf) parts.push(minifySingleSource(brandBuf.toString('utf8')));
      if (atlasBuf) parts.push(atlasBuf.toString('utf8').trim());
      if (stageGlBuf) parts.push(minifySingleSource(minifyEmbeddedGlslTemplates(stageGlBuf.toString('utf8'))));
      parts.push(minifySingleSource(setBuf.toString('utf8')));
      const minRuntime = parts.join(';\n');
      const codeHash = computeHash(minRuntime);
      return { minRuntime, codeHash };
    },
    toCacheEntry: (assets, sourceHash) => ({
      sourceHash,
      codeHash: assets.codeHash,
      minRuntime: assets.minRuntime,
      payloadSha256: sha256Text(`${assets.codeHash}\0${assets.minRuntime}`),
      updatedAt: Date.now(),
    }),
    fromCacheEntry: (entry) => ({
      minRuntime: entry.minRuntime,
      codeHash: entry.codeHash,
    }),
  });
}

const SETTINGS_REMOVE_EXPRESSION = `(() => {
  try {
    const sec = document.getElementById('ag-cs-settings-sec');
    sec?.__agMascotStageApi?.dispose?.();
    sec?.remove?.();
  } catch {}
  try { delete window.__agPrismSettingsPanel; } catch {}
  try { delete globalThis.__agPrismSettingsPanel; } catch {}
  try { delete window.__agPrismBrandLogoSvg; } catch {}
  try { delete globalThis.__agPrismBrandLogoSvg; } catch {}
  try { delete window.__agOctopathStageWebGL; } catch {}
  try { delete globalThis.__agOctopathStageWebGL; } catch {}
  try { delete window.__agOctopathTavernAtlas; } catch {}
  try { delete globalThis.__agOctopathTavernAtlas; } catch {}
  return { ok: true, status: 'off' };
})()`;

function buildSettingsChannelExpression(config = null, opts = null) {
  let resolvedOpts = opts;
  if (config && typeof config === 'object' && ('cachePath' in config || 'noDiskCache' in config || 'deferCacheWrite' in config) && !resolvedOpts) {
    resolvedOpts = config;
  }
  const { minRuntime, codeHash } = readCompiledSettingsChannelAssets(resolvedOpts);
  if (!minRuntime || !codeHash) {
    return '';
  }
  const hashJson = serializeJsonForEval(codeHash);
  return `(() => {
    try {
      if (window.self !== window.top) return { ok: false, status: 'skipped-subframe' };
    } catch {
      return { ok: false, status: 'skipped-subframe' };
    }
    const targetHash = ${hashJson};
    const existingPanel = globalThis.__agPrismSettingsPanel || window.__agPrismSettingsPanel;
    const existingLoc = globalThis.__agCsLocales || window.__agCsLocales;
    if (existingPanel && existingPanel.__prismCodeHash === targetHash && existingLoc && existingLoc.__isFullLocales) {
      try { (window.__agPrism || window.__agClaudeStyle)?.sync?.(); } catch {}
      return { ok: true, reused: true, codeHash: targetHash };
    }
    try {
      const staleSec = document.getElementById?.('ag-cs-settings-sec');
      if (staleSec) {
        try { staleSec.querySelector?.('[data-testid="prism-wallpaper-slot"]')?.__agPrismWpUiHandle?.destroy?.(); } catch {}
        try { staleSec.querySelector?.('[data-testid="prism-suggester-slot"]')?.__agPrismSgUiHandle?.destroy?.(); } catch {}
        try { staleSec.__agMascotStageApi?.dispose?.(); } catch {}
        try { staleSec.__prismThoughtUiHandle = null; } catch {}
        staleSec.remove?.();
      }
    } catch {}
    ${minRuntime};
    try {
      const panel = globalThis.__agPrismSettingsPanel || window.__agPrismSettingsPanel;
      if (panel && typeof panel === 'object') {
        panel.__prismCodeHash = targetHash;
        window.__agPrismSettingsPanel = panel;
      }
      const loc = globalThis.__agCsLocales || window.__agCsLocales;
      if (loc && typeof loc === 'object') {
        loc.__isFullLocales = true;
        window.__agCsLocales = loc;
      }
    } catch {}
    try { (window.__agPrism || window.__agClaudeStyle)?.sync?.(); } catch {}
    try { document.getElementById('ag-cs-settings-sec')?.__prismMountThoughtUi?.(); } catch {}
    try { document.getElementById('ag-cs-settings-sec')?.__prismMountWp?.(); } catch {}
    try { (document.getElementById('ag-cs-settings-sec') || document.getElementById('ag-prism-settings-sec'))?.__prismMountSg?.(); } catch {}
    return { ok: true, codeHash: targetHash };
  })()`;
}

// ── 第十通道：双桌宠（dual-mascot-rig.js）配置门控独立注入（mascot === 'off' 时 0 B） ────
let _mascotChannelCache = { sig: '', sourceHash: '', minRuntime: '', codeHash: '', cachedPaths: new Set() };

function shouldEnableMascot(config = null) {
  const cfg = config && typeof config === 'object' ? reconcileConfigAliases(config) : readConfig();
  return cfg.mascot !== 'off' && cfg.mascot !== false;
}

function readCompiledMascotAssets(opts = null) {
  const mascotPath = path.join(__dirname, 'dual-mascot-rig.js');
  if (!fs.existsSync(mascotPath)) {
    return { sig: '', minRuntime: '', codeHash: '' };
  }
  const sig = getFileSig(mascotPath);
  const cachePath = resolveBundleCachePathOption(opts);
  if (!cachePath && _mascotChannelCache.sig === sig && _mascotChannelCache.codeHash) {
    return _mascotChannelCache;
  }
  const buf = fs.readFileSync(mascotPath);
  return resolveChannelAssetsWithDiskCache({
    channelName: 'mascot',
    memCache: _mascotChannelCache,
    setMemCache: (v) => { _mascotChannelCache = v; },
    sig,
    fileEntries: [{ rel: 'dual-mascot-rig.js', content: buf }],
    opts,
    compileFn: () => {
      const minRuntime = minifySingleSource(buf.toString('utf8'));
      const codeHash = computeHash(minRuntime);
      return { minRuntime, codeHash };
    },
    toCacheEntry: (assets, sourceHash) => ({
      sourceHash,
      codeHash: assets.codeHash,
      minRuntime: assets.minRuntime,
      payloadSha256: sha256Text(`${assets.codeHash}\0${assets.minRuntime}`),
      updatedAt: Date.now(),
    }),
    fromCacheEntry: (entry) => ({
      minRuntime: entry.minRuntime,
      codeHash: entry.codeHash,
    }),
  });
}

const MASCOT_REMOVE_EXPRESSION = `(() => {
  try { window.__agDualMascotRig?.dispose?.(); } catch {}
  try { (window.__agPrism || window.__agClaudeStyle)?.sync?.(); } catch {}
  try {
    document.querySelectorAll?.('.ag-cs-crab, .ag-cs-dual-stage, .ag-cs-crab-stage, .ag-cs-mascot-stage, .ag-v2-mascot-stage, .ag-v2-habitat-prop').forEach((n) => {
      try { n.__agMascotApi?.dispose?.(); } catch {}
      n.remove?.();
    });
  } catch {}
  try { document.querySelectorAll?.('[data-ag-cs-crab-anchor]').forEach((n) => n.removeAttribute?.('data-ag-cs-crab-anchor')); } catch {}
  try { document.documentElement?.removeAttribute?.('data-ag-cs-has-crab'); } catch {}
  try { document.documentElement?.removeAttribute?.('data-ag-cs-mascot-drag'); } catch {}
  try { delete window.__agDualMascotRig; } catch {}
  try { delete globalThis.__agDualMascotRig; } catch {}
  try { delete window.__agPrismMascotArt; } catch {}
  try { delete globalThis.__agPrismMascotArt; } catch {}
  return { ok: true, status: 'off' };
})()`;

function buildMascotChannelExpression(config = null, opts = null) {
  const cfg = config && typeof config === 'object' ? reconcileConfigAliases(config) : readConfig();
  if (!shouldEnableMascot(cfg)) {
    return '';
  }
  const { minRuntime, codeHash } = readCompiledMascotAssets(opts);
  if (!minRuntime || !codeHash) {
    return '';
  }
  const hashJson = serializeJsonForEval(codeHash);
  return `(() => {
    try {
      if (window.self !== window.top) return { ok: false, status: 'skipped-subframe' };
    } catch {
      return { ok: false, status: 'skipped-subframe' };
    }
    try {
      const liveCfg = window.__agPrism?.getState?.()?.cfg;
      if (liveCfg && (liveCfg.mascot === 'off' || liveCfg.mascot === false)) {
        try { window.__agDualMascotRig?.dispose?.(); } catch {}
        try { (window.__agPrism || window.__agClaudeStyle)?.sync?.(); } catch {}
        try {
          document.querySelectorAll?.('.ag-cs-crab, .ag-cs-dual-stage, .ag-cs-crab-stage, .ag-cs-mascot-stage, .ag-v2-mascot-stage, .ag-v2-habitat-prop').forEach((n) => {
            try { n.__agMascotApi?.dispose?.(); } catch {}
            n.remove?.();
          });
        } catch {}
        try { document.querySelectorAll?.('[data-ag-cs-crab-anchor]').forEach((n) => n.removeAttribute?.('data-ag-cs-crab-anchor')); } catch {}
        try { document.documentElement?.removeAttribute?.('data-ag-cs-has-crab'); document.documentElement?.removeAttribute?.('data-ag-cs-mascot-drag'); } catch {}
        try { delete window.__agDualMascotRig; delete globalThis.__agDualMascotRig; delete window.__agPrismMascotArt; delete globalThis.__agPrismMascotArt; } catch {}
        return { ok: true, status: 'off', skippedByLiveCfg: true };
      }
    } catch {}
    const targetHash = ${hashJson};
    const existing = globalThis.__agDualMascotRig || window.__agDualMascotRig;
    if (existing && existing.__prismCodeHash === targetHash) {
      try { (window.__agPrism || window.__agClaudeStyle)?.sync?.(); } catch {}
      return { ok: true, reused: true, codeHash: targetHash };
    }
    ${minRuntime};
    try {
      const mod = globalThis.__agDualMascotRig || window.__agDualMascotRig;
      if (mod && typeof mod === 'object') {
        mod.__prismCodeHash = targetHash;
        window.__agDualMascotRig = mod;
      }
    } catch {}
    try { (window.__agPrism || window.__agClaudeStyle)?.sync?.(); } catch {}
    return { ok: true, codeHash: targetHash };
  })()`;
}

// ── 第十一通道：Prompt Suggester（对话续写幽灵补全 + 8 语种 Beta 设置卡片） ────
let _suggesterAssetsCache = { sig: '', sourceHash: '', minClient: '', minSettingsUi: '', codeHash: '', cachedPaths: new Set() };

function readCompiledSuggesterAssets(opts = null) {
  const clientPath = path.join(__dirname, 'vendor', 'prompt-suggester', 'suggester-client.js');
  const settingsUiPath = path.join(__dirname, 'vendor', 'prompt-suggester', 'suggester-settings-ui.js');
  if (!fs.existsSync(clientPath) || !fs.existsSync(settingsUiPath)) {
    return { sig: '', minClient: '', minSettingsUi: '', codeHash: '' };
  }
  const sig = `${getFileSig(clientPath)}|${getFileSig(settingsUiPath)}`;
  const cachePath = resolveBundleCachePathOption(opts);
  if (!cachePath && _suggesterAssetsCache.sig === sig && _suggesterAssetsCache.codeHash) {
    return _suggesterAssetsCache;
  }
  const clientBuf = fs.readFileSync(clientPath);
  const settingsBuf = fs.readFileSync(settingsUiPath);
  return resolveChannelAssetsWithDiskCache({
    channelName: 'suggester',
    memCache: _suggesterAssetsCache,
    setMemCache: (v) => { _suggesterAssetsCache = v; },
    sig,
    fileEntries: [
      { rel: 'vendor/prompt-suggester/suggester-client.js', content: clientBuf },
      { rel: 'vendor/prompt-suggester/suggester-settings-ui.js', content: settingsBuf },
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

const SUGGESTER_REMOVE_EXPRESSION = `(() => {
  try { (window.__agPrismSuggester || globalThis.__agPrismSuggester)?.destroy?.(); } catch {}
  try { (window.__agPrismSuggesterBridge || globalThis.__agPrismSuggesterBridge)?.dispose?.(); } catch {}
  try { document.getElementById?.('ag-prism-suggester-css')?.remove?.(); } catch {}
  try { document.getElementById?.('ag-prism-model-dd-css')?.remove?.(); } catch {}
  try { document.querySelectorAll?.('[data-testid="prism-suggest-trigger"], [data-testid="prism-ghost-overlay"]')?.forEach?.((n) => n.remove()); } catch {}
  try {
    document.querySelectorAll?.('[data-ag-prism-ghost-active]')?.forEach?.((el) => {
      el.removeAttribute('data-ag-prism-ghost-active');
      el.style?.removeProperty?.('--ag-prism-ghost-min-h');
    });
  } catch {}
  try {
    const slot = document.querySelector?.('[data-testid="prism-suggester-slot"]');
    if (slot) {
      try { slot.__agPrismSgUiHandle?.destroy?.(); } catch {}
      slot.__agPrismSgUiHandle = null;
      while (slot.firstChild) slot.removeChild(slot.firstChild);
    }
  } catch {}
  try { document.documentElement?.removeAttribute?.('data-ag-prism-suggester'); } catch {}
  try { delete window.__agPrismSuggester; } catch {}
  try { delete globalThis.__agPrismSuggester; } catch {}
  try { delete window.__agPrismSuggesterFactory; } catch {}
  try { delete globalThis.__agPrismSuggesterFactory; } catch {}
  try { delete window.__agPrismSuggesterSettingsUi; } catch {}
  try { delete globalThis.__agPrismSuggesterSettingsUi; } catch {}
  try { delete window.__prismMountSuggesterUi; } catch {}
  try { delete globalThis.__prismMountSuggesterUi; } catch {}
  try { delete window.__agPrismSuggesterBridge; } catch {}
  try { delete globalThis.__agPrismSuggesterBridge; } catch {}
  try { delete window.__agPrismSuggesterResolve; } catch {}
  try { delete globalThis.__agPrismSuggesterResolve; } catch {}
  return { ok: true, status: 'off' };
})()`;

// 第十一通道独立注入（对话续写幽灵补全 + 8 语种 Beta 设置卡片）：完全独立于 Channel 1，缺文件时安全返回 ''，接入磁盘缓存并支持 codeHash 幂等复用与零泄漏热卸载
function buildSuggesterExpression(config = null, opts = null) {
  let resolvedOpts = opts;
  if (
    !resolvedOpts &&
    config &&
    typeof config === 'object' &&
    ('cachePath' in config || 'noDiskCache' in config || 'deferCacheWrite' in config || 'customClientSource' in config)
  ) {
    resolvedOpts = config;
  }
  let minClient = '';
  let minSettingsUi = '';
  let codeHash = '';
  if (
    resolvedOpts &&
    typeof resolvedOpts.customClientSource === 'string' &&
    typeof resolvedOpts.customSettingsUiSource === 'string'
  ) {
    minClient = resolvedOpts.customClientSource ? minifySingleSource(resolvedOpts.customClientSource) : '';
    minSettingsUi = resolvedOpts.customSettingsUiSource ? minifySingleSource(resolvedOpts.customSettingsUiSource) : '';
    codeHash = minClient && minSettingsUi ? computeHash(`${minClient}\n${minSettingsUi}`) : '';
  } else {
    const compiled = readCompiledSuggesterAssets(resolvedOpts);
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
        if (sec && typeof sec.__prismMountSg === 'function') {
          sec.__prismMountSg();
          return;
        }
        const slot = document.querySelector?.('[data-testid="prism-suggester-slot"]');
        const fn = window.__prismMountSuggesterUi || globalThis.__prismMountSuggesterUi;
        if (slot && typeof fn === 'function') fn(slot, {});
      } catch {}
    };

    const cleanupSuggester = () => {
      try { (window.__agPrismSuggester || globalThis.__agPrismSuggester)?.destroy?.(); } catch {}
      try { (window.__agPrismSuggesterBridge || globalThis.__agPrismSuggesterBridge)?.dispose?.(); } catch {}
      try { document.getElementById?.('ag-prism-suggester-css')?.remove?.(); } catch {}
      try { document.getElementById?.('ag-prism-model-dd-css')?.remove?.(); } catch {}
      try { document.querySelectorAll?.('[data-testid="prism-suggest-trigger"], [data-testid="prism-ghost-overlay"]')?.forEach?.((n) => n.remove()); } catch {}
      try {
        document.querySelectorAll?.('[data-ag-prism-ghost-active]')?.forEach?.((el) => {
          el.removeAttribute('data-ag-prism-ghost-active');
          el.style?.removeProperty?.('--ag-prism-ghost-min-h');
        });
      } catch {}
      try {
        const slot = document.querySelector?.('[data-testid="prism-suggester-slot"]');
        if (slot) {
          try { slot.__agPrismSgUiHandle?.destroy?.(); } catch {}
          slot.__agPrismSgUiHandle = null;
          while (slot.firstChild) slot.removeChild(slot.firstChild);
        }
      } catch {}
      try { delete window.__agPrismSuggester; } catch {}
      try { delete globalThis.__agPrismSuggester; } catch {}
      try { delete window.__agPrismSuggesterFactory; } catch {}
      try { delete globalThis.__agPrismSuggesterFactory; } catch {}
      try { delete window.__agPrismSuggesterSettingsUi; } catch {}
      try { delete globalThis.__agPrismSuggesterSettingsUi; } catch {}
      try { delete window.__prismMountSuggesterUi; } catch {}
      try { delete globalThis.__prismMountSuggesterUi; } catch {}
      try { delete window.__agPrismSuggesterBridge; } catch {}
      try { delete globalThis.__agPrismSuggesterBridge; } catch {}
      try { delete window.__agPrismSuggesterResolve; } catch {}
      try { delete globalThis.__agPrismSuggesterResolve; } catch {}
    };

    const targetHash = ${hashJson};
    const mountOrReuse = () => {
      if (needDomMarkerOnReady && !hasDomMarker() && (isPlainHttpLocalhost || !/\\bantigravity\\b/i.test(String(document.title || '')))) {
        return { ok: false, status: 'skipped-non-host' };
      }
      const existing = window.__agPrismSuggester || globalThis.__agPrismSuggester;
      const existingUi = window.__agPrismSuggesterSettingsUi || globalThis.__agPrismSuggesterSettingsUi;
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

      cleanupSuggester();
      ;${minClient};
      ;${minSettingsUi};

      let mounted = window.__agPrismSuggester || globalThis.__agPrismSuggester;
      const factory = window.__agPrismSuggesterFactory || globalThis.__agPrismSuggesterFactory;
      if (!mounted && typeof factory === 'function') {
        try {
          mounted = factory({ window, document });
        } catch {}
      }
      if (mounted && typeof mounted === 'object') {
        mounted.__prismCodeHash = targetHash;
        try { window.__agPrismSuggester = mounted; } catch {}
        try { globalThis.__agPrismSuggester = mounted; } catch {}
      }
      const mountedUi = window.__agPrismSuggesterSettingsUi || globalThis.__agPrismSuggesterSettingsUi;
      if (mountedUi && typeof mountedUi === 'object') {
        mountedUi.__prismCodeHash = targetHash;
        try { window.__agPrismSuggesterSettingsUi = mountedUi; } catch {}
        try { globalThis.__agPrismSuggesterSettingsUi = mountedUi; } catch {}
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

// ── 第十二通道：Studio 首页仪表盘（home-studio-panel.js）独立延迟注入（剥离 Channel 1 体积） ──
let _homeStudioChannelCache = { sig: '', sourceHash: '', minRuntime: '', codeHash: '', cachedPaths: new Set() };

function shouldEnableHomeStudio(config = null) {
  const cfg = config && typeof config === 'object' ? reconcileConfigAliases(config) : readConfig();
  return (cfg.homeLayout || cfg.homeMode || 'studio') === 'studio';
}

function readCompiledHomeStudioAssets(opts = null) {
  const studioPath = path.join(__dirname, 'home-studio-panel.js');
  if (!fs.existsSync(studioPath)) {
    return { sig: '', minRuntime: '', codeHash: '' };
  }
  const sig = getFileSig(studioPath);
  const cachePath = resolveBundleCachePathOption(opts);
  if (!cachePath && _homeStudioChannelCache.sig === sig && _homeStudioChannelCache.codeHash) {
    return _homeStudioChannelCache;
  }
  const buf = fs.readFileSync(studioPath);
  return resolveChannelAssetsWithDiskCache({
    channelName: 'homeStudio',
    memCache: _homeStudioChannelCache,
    setMemCache: (v) => { _homeStudioChannelCache = v; },
    sig,
    fileEntries: [{ rel: 'home-studio-panel.js', content: buf }],
    opts,
    compileFn: () => {
      const minRuntime = minifySingleSource(minifyEmbeddedCssTemplate(buf.toString('utf8')));
      const codeHash = computeHash(minRuntime);
      return { minRuntime, codeHash };
    },
    toCacheEntry: (assets, sourceHash) => ({
      sourceHash,
      codeHash: assets.codeHash,
      minRuntime: assets.minRuntime,
      payloadSha256: sha256Text(`${assets.codeHash}\0${assets.minRuntime}`),
      updatedAt: Date.now(),
    }),
    fromCacheEntry: (entry) => ({
      minRuntime: entry.minRuntime,
      codeHash: entry.codeHash,
    }),
  });
}

const HOME_STUDIO_REMOVE_EXPRESSION = `(() => {
  try { (window.__agPrism || window.__agClaudeStyle)?.detachHomeStudio?.(); } catch {}
  try { document.getElementById?.('ag-prism-studio-v101-css')?.remove?.(); } catch {}
  try { document.querySelectorAll?.('.ag-cs-home-panel-seat, .ag-cs-home-panel')?.forEach?.((n) => n.remove()); } catch {}
  try { document.documentElement?.removeAttribute?.('data-ag-prism-scope'); } catch {}
  try { delete window.__agPrismHomeStudioPanel; } catch {}
  try { delete globalThis.__agPrismHomeStudioPanel; } catch {}
  try { delete window.__agHomeStudioPanel; } catch {}
  try { delete globalThis.__agHomeStudioPanel; } catch {}
  return { ok: true, status: 'off' };
})()`;

// 第十二通道独立注入（Studio 首页用量仪表盘与缓存控制器）：完全独立于 Channel 1，接入磁盘缓存，支持幂等复用、热替换旧实例与零泄漏卸载
function buildHomeStudioChannelExpression(config = null, opts = null) {
  let resolvedCfg = config;
  let resolvedOpts = opts;
  if (
    !resolvedOpts &&
    config &&
    typeof config === 'object' &&
    ('cachePath' in config || 'noDiskCache' in config || 'deferCacheWrite' in config) &&
    !('homeLayout' in config) &&
    !('homeMode' in config)
  ) {
    resolvedOpts = config;
    resolvedCfg = null;
  }
  const cfg = resolvedCfg && typeof resolvedCfg === 'object' ? reconcileConfigAliases(resolvedCfg) : readConfig();
  if (!shouldEnableHomeStudio(cfg)) {
    return '';
  }
  const { minRuntime, codeHash } = readCompiledHomeStudioAssets(resolvedOpts);
  if (!minRuntime || !codeHash) {
    return '';
  }
  const hashJson = serializeJsonForEval(codeHash);
  return `(() => {
    try {
      if (window.self !== window.top) return { ok: false, status: 'skipped-subframe' };
    } catch {
      return { ok: false, status: 'skipped-subframe' };
    }
    try {
      const loc = typeof window !== 'undefined' && window.location;
      const href = loc && typeof loc.href === 'string' ? loc.href : '';
      if (href) {
        const low = href.toLowerCase();
        if (low.startsWith('devtools://') || low.startsWith('data:') || low.startsWith('chrome:') || low.startsWith('chrome-extension:') || low.startsWith('edge:') || low.startsWith('blob:') || low.startsWith('plugin:')) {
          return { ok: false, status: 'skipped-non-host' };
        }
      }
    } catch {}
    try {
      const liveCfg = (window.__agPrism || window.__agClaudeStyle)?.getState?.()?.cfg;
      if (liveCfg && typeof liveCfg === 'object' && (liveCfg.homeLayout || liveCfg.homeMode || 'studio') !== 'studio') {
        try { (window.__agPrism || window.__agClaudeStyle)?.detachHomeStudio?.(); } catch {}
        try { document.getElementById?.('ag-prism-studio-v101-css')?.remove?.(); } catch {}
        try { document.querySelectorAll?.('.ag-cs-home-panel-seat, .ag-cs-home-panel')?.forEach?.((n) => n.remove()); } catch {}
        try { document.documentElement?.removeAttribute?.('data-ag-prism-scope'); } catch {}
        try { delete window.__agPrismHomeStudioPanel; delete globalThis.__agPrismHomeStudioPanel; delete window.__agHomeStudioPanel; delete globalThis.__agHomeStudioPanel; } catch {}
        return { ok: true, status: 'off', skippedByLiveCfg: true };
      }
    } catch {}
    const targetHash = ${hashJson};
    const existing = globalThis.__agPrismHomeStudioPanel || window.__agPrismHomeStudioPanel || globalThis.__agHomeStudioPanel || window.__agHomeStudioPanel;
    if (existing && existing.__prismCodeHash === targetHash) {
      try {
        const api = window.__agPrism || window.__agClaudeStyle;
        if (typeof api?.syncHomeStudio === 'function') api.syncHomeStudio();
        else api?.sync?.();
      } catch {}
      return { ok: true, reused: true, codeHash: targetHash };
    }
    try { (window.__agPrism || window.__agClaudeStyle)?.detachHomeStudio?.(); } catch {}
    ${minRuntime};
    try {
      const mod = globalThis.__agPrismHomeStudioPanel || window.__agPrismHomeStudioPanel || globalThis.__agHomeStudioPanel || window.__agHomeStudioPanel;
      if (mod && typeof mod === 'object') {
        mod.__prismCodeHash = targetHash;
        window.__agPrismHomeStudioPanel = mod;
        globalThis.__agPrismHomeStudioPanel = mod;
        window.__agHomeStudioPanel = mod;
        globalThis.__agHomeStudioPanel = mod;
      }
    } catch {}
    try {
      const api = window.__agPrism || window.__agClaudeStyle;
      if (typeof api?.syncHomeStudio === 'function') api.syncHomeStudio();
      else api?.sync?.();
    } catch {}
    return { ok: true, status: 'mounted', codeHash: targetHash };
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
  try { (window.__agPrismSuggester || globalThis.__agPrismSuggester)?.destroy?.(); } catch (e) {}
  try { document.querySelector?.('[data-testid="prism-suggester-slot"]')?.__agPrismSgUiHandle?.destroy?.(); } catch (e) {}
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
    if (window.__agPrismPeriodicPicker && typeof window.__agPrismPeriodicPicker.destroy === 'function') {
      window.__agPrismPeriodicPicker.destroy();
    }
    document
      .querySelectorAll?.('#ag-prism-periodic-picker-css, #ag-prism-periodic-picker-root, .ag-pp-hold-ring, .ag-pp-mini-keycap')
      .forEach((n) => n.remove());
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
  try {
    if (window.__agPrismSuggesterBridge && typeof window.__agPrismSuggesterBridge.dispose === 'function') {
      window.__agPrismSuggesterBridge.dispose();
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
  try { delete window.__agPrismSuggester; } catch {}
  try { delete window.__agPrismSuggesterFactory; } catch {}
  try { delete window.__agPrismSuggesterSettingsUi; } catch {}
  try { delete window.__prismMountSuggesterUi; } catch {}
  try { delete window.__agPrismSuggesterBridge; } catch {}
  try { delete window.__agPrismSuggesterResolve; } catch {}
  delete window.__agPrismBrandLogoSvg;
  delete window.__agPrismHostI18n;
  delete window.__agPrismHostI18nFactory;
  delete window.__agPrismPeriodicPicker;
  delete window.__agPrismPeriodicPickerFactory;
  delete window.__agPrismKeyboard3D;
  delete window.__agPrismPeriodicKeyboard3D;
  delete window.__agPrismOledScreen;
  delete window.__agPrismGrainAssets;
  for (const k of ['__agPeriodicAudioFx', '__agPeriodicModelCatalog', '__agPeriodicHostBridge', '__agPeriodicBentoUi', '__agPeriodicPbrGrainAssets', '__agPeriodicOledScreen', '__agPeriodicKeyboard3D']) {
    try { delete window[k]; } catch {}
    try { delete globalThis[k]; } catch {}
  }
  try { document.documentElement?.removeAttribute?.('data-ag-pp-holding'); } catch {}
  delete window.__agPrismContextMenu;
  delete window.__agCsI18n;
  delete globalThis.__agSP;
  delete globalThis.__agM;
  delete globalThis.__agPrismBrandLogoSvg;
  delete globalThis.__agPrismHostI18n;
  delete globalThis.__agPrismHostI18nFactory;
  delete globalThis.__agPrismHostI18nReversePatterns;
  delete globalThis.__agPrismPeriodicPicker;
  delete globalThis.__agPrismPeriodicPickerFactory;
  delete globalThis.__agPrismKeyboard3D;
  delete globalThis.__agPrismPeriodicKeyboard3D;
  delete globalThis.__agPrismOledScreen;
  delete globalThis.__agPrismGrainAssets;
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
  delete globalThis.__agPrismSuggester;
  delete globalThis.__agPrismSuggesterFactory;
  delete globalThis.__agPrismSuggesterSettingsUi;
  delete globalThis.__prismMountSuggesterUi;
  delete globalThis.__agPrismSuggesterBridge;
  delete globalThis.__agPrismSuggesterResolve;
  delete globalThis.__agPrismOmni;
  delete globalThis.__agPrismSidebar;
  delete globalThis.__agPrismThoughtSettingsUi;
  delete globalThis.__agPrismSettingsPanel;
  try { delete window.__agPrismHomeStudioPanel; } catch {}
  try { delete window.__agHomeStudioPanel; } catch {}
  delete globalThis.__agPrismHomeStudioPanel;
  delete globalThis.__agHomeStudioPanel;
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
  delete globalThis.__agPrismMascotArt;
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
      'data-ag-cs-dark-aura',
      'data-ag-cs-dark-aura-style',
      'data-ag-prism-thought-view',
      'data-ag-prism-omni',
      'data-ag-prism-link-target',
      'data-ag-prism-sidebar-studio',
      'data-ag-prism-host-i18n',
      'data-ag-prism-periodic-picker',
      'data-ag-pp-open',
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
      'data-ag-prism-suggester',
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
    'data-ag-cs-crab-anchor',
    'data-ag-sp-running',
    'data-ag-cs-queued',
    'data-ag-cs-conv-seat',
    'data-ag-cs-home-sheet',
    'data-ag-cs-input-layer',
    'data-ag-cs-vp-wrap',
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
  document.querySelectorAll('[data-ag-prism-ghost-active]').forEach((el) => {
    el.removeAttribute('data-ag-prism-ghost-active');
    if (el.style && typeof el.style.removeProperty === 'function') {
      el.style.removeProperty('--ag-prism-ghost-min-h');
    }
  });
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
    ', #ag-prism-host-alert-css, #ag-prism-settings-v101-css, #ag-prism-studio-v101-css, #ag-prism-omni-css, #ag-prism-sidebar-studio-css, #ag-prism-periodic-picker-css, #ag-prism-periodic-picker-root, .ag-pp-hold-ring, .ag-pp-mini-keycap, #ag-prism-inline-diff-css, #ag-prism-wallpaper-root, #ag-prism-wallpaper-css, #ag-prism-suggester-css, #ag-prism-model-dd-css, [data-testid="prism-suggest-trigger"], [data-testid="prism-ghost-overlay"], #ag-prism-storage-guard, #ag-prism-storage-guard-css, #ag-cs-settings-sec, [data-testid="prism-thought-ai-config"], [data-testid="prism-thought-general-config"], .ag-omni-dock, .ag-omni-menu, .ag-prism-omni-menu, .ag-prism-omni-pane, [data-ag-prism-omni-owned="1"], [data-ag-prism-sidebar-owned="1"], .ag-prism-sidebar-studio, .ag-prism-sidebar-rail, .ag-prism-sidebar-popover, .ag-prism-sidebar-modal, .ag-cs-home-panel, .ag-cs-home-panel-seat, .ag-cs-ripple-layer, .ag-cs-ripple-host, .ag-cs-conv-aura-host, .ag-cs-crab, .ag-cs-dual-stage, .ag-cs-crab-stage, .ag-cs-mascot-stage, .ag-cs-mascot, .ag-v2-mascot-stage, .ag-v2-habitat-prop, .ag-cs-crystal-bar, [data-testid="orchestrator-effort-bar"], .ag-cs-prism-rim-cv, .ag-cs-code-fold-btn, .ag-cs-nav-outline-popover, .ag-cs-nav-outline-trigger, .ag-cs-smooth-caret, .ag-cs-perf-backdrop, .ag-cs-ctx-menu, .ag-cs-ctx-toast'
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
  SUGGESTER_BINDING,
  PORT_FILE,
  PID_FILE,
  CONFIG_FILE,
  DEFAULT_CONFIG,
  VALIDATORS,
  validateConfigEntry,
  reconcileConfigAliases,
  isEligibleTarget,
  isSwarmSidecarUrl,
  redactSensitiveUrl,
  readPidFromLockFile,
  parseWindowsTasklistCsv,
  inspectProcessSync,
  matchesExpectedDaemonSignature,
  isExpectedDaemonProcess,
  CDP_OPT_IN_SWITCH,
  LNK_MAX_FILE_BYTES,
  APP_STORAGE_MAX_BYTES,
  assertSafeRegularFileSync,
  parseWindowsLnkBuffer,
  updateWindowsLnkArguments,
  readWindowsLnkFileSync,
  writeWindowsLnkArgumentsSync,
  getDefaultWindowsShortcutDirs,
  collectWindowsLnkFilesSync,
  runWindowsShortcutAdapter,
  runWindowsShortcutAdapterAsync,
  resolveWindowsDetachedNodeRuntime,
  probeLoopbackCdpVersionAsync,
  probeLoopbackCdpVersionSync,
  buildWindowsHostCandidatesFromTasklist,
  getAntigravityAppStoragePath,
  suspendAntigravityRunInBackground,
  restoreAntigravityRunInBackground,
  requestLoopbackCdpBrowserClose,
  isWindowsAntigravityHostAliveSync,
  runWindowsDetachedRelaunchTask,
  IS_LINUX,
  LINUX_DESKTOP_SHADOW_MARKER,
  LINUX_GOMEMLIMIT_LINE_RE,
  hasRemoteDebuggingPortSwitch,
  appendCdpFlagToArguments,
  stripCdpFlagFromArguments,
  isAntigravityShortcutTarget,
  isAntigravityLinuxTarget,
  isMainAntigravityProcessSignature,
  tokenizeDesktopExec,
  extractDesktopExecTarget,
  patchDesktopExecLine,
  stripDesktopExecLine,
  readDesktopShadowMarker,
  isManagedPrismDesktopContent,
  patchDesktopEntryContent,
  stripDesktopEntryContent,
  getDefaultLinuxDesktopDirs,
  ensureLinuxDesktopShortcutsCdpFlag,
  restoreLinuxDesktopShortcutsCdpFlag,
  readLinuxGoMemLimitFromEnvD,
  ensureAntigravityShortcutsCdpFlag,
  ensureAntigravityShortcutsCdpFlagAsync,
  restoreAntigravityShortcutsCdpFlag,
  extractPosixCommandExecutable,
  parseAppImageFromProcEnviron,
  parsePosixPsHostCandidates,
  detectRunningAntigravityHostSync,
  detectRunningAntigravityHost,
  getRelaunchPromptStatePaths,
  hasRelaunchBeenPromptedForHost,
  recordRelaunchPromptState,
  promptUserForHostRelaunch,
  executeHostRelaunchSequence,
  normalizeMacAppBundlePath,
  MAC_DETACHED_RELAUNCH_SH,
  LINUX_DETACHED_RELAUNCH_SH,
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
  listSwarmTargets,
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
  readWindowsPreferredUiLanguage,
  detectSystemUiLocale,
  resolveSystemLangNode,
  _setWindowsUiLocaleReaderForTest,
  buildHostI18nExpression,
  buildRelaunchDialogCopy,
  HOST_I18N_REMOVE_EXPRESSION,
  shouldEnableSwarmI18n,
  buildSwarmI18nExpression,
  SWARM_I18N_REMOVE_EXPRESSION,
  ISOLATED_HOST_I18N_PAUSE_EXPRESSION,
  ISOLATED_HOST_I18N_RESUME_EXPRESSION,
  shouldEnableThought,
  buildThoughtExpression,
  THOUGHT_REMOVE_EXPRESSION,
  buildInlineDiffInjectExpression,
  INLINE_DIFF_REMOVE_EXPRESSION,
  buildWallpaperExpression,
  WALLPAPER_REMOVE_EXPRESSION,
  PERIODIC_PICKER_MODULE_FILES,
  shouldEnablePeriodicPicker,
  buildPeriodicPickerExpression,
  PERIODIC_PICKER_REMOVE_EXPRESSION,
  DEFERRED_ROOT_MODULES,
  buildSettingsChannelExpression,
  SETTINGS_REMOVE_EXPRESSION,
  shouldEnableMascot,
  buildMascotChannelExpression,
  MASCOT_REMOVE_EXPRESSION,
  buildSuggesterExpression,
  SUGGESTER_REMOVE_EXPRESSION,
  shouldEnableHomeStudio,
  buildHomeStudioChannelExpression,
  HOME_STUDIO_REMOVE_EXPRESSION,
  isSafeV2SidebarClientSource,
};

if (require.main === module) {
  const flagIdx = process.argv.indexOf('--run-relaunch-task');
  if (flagIdx >= 0 && process.argv[flagIdx + 1]) {
    const taskFilePath = path.resolve(String(process.argv[flagIdx + 1]));
    (async () => {
      try {
        const { resolved } = assertSafeRegularFileSync(taskFilePath, RELAUNCH_TASK_MAX_BYTES);
        const raw = fs.readFileSync(resolved, 'utf8').replace(/^\uFEFF/, '');
        try { fs.unlinkSync(resolved); } catch {}
        const task = JSON.parse(raw);
        if (!task || typeof task !== 'object' || Array.isArray(task)) return;
        await runWindowsDetachedRelaunchTask(task);
      } catch {}
    })();
  }
}

/**
 * Obsidian Prism — Optional Go Native GOMEMLIMIT User Environment Helper
 *
 * 设计与风控红线（100% 零 Google 风控）：
 *   1. 仅读写操作系统标准「用户级」环境变量 GOMEMLIMIT（Go 1.19+ 运行时原生支持的软内存上限）；
 *   2. 严禁修改任何 Antigravity 官方二进制、官方资源包或强行向运行中进程注入参数；
 *   3. 严格白名单值校验，绝不接受任意表达式或命令注入；
 *   4. 所有操作显式由用户触发，重启 Antigravity 后生效，随时可一键撤销清理。
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';

export const ALLOWED_GOMEMLIMIT_PRESETS = Object.freeze(['2GiB', '2500MiB', '3GiB', '4GiB']);
export const RECOMMENDED_GOMEMLIMIT = '2GiB';
const GOMEMLIMIT_VALUE_RE = /^(?:1536MiB|2GiB|2500MiB|3GiB|4GiB)$/;
const MAC_LAUNCH_AGENT_LABEL = 'com.obsidian-prism.gomemlimit';
const WIN_ENV_REG_KEY = 'HKCU\\Environment';

export function isValidGoMemLimitValue(raw) {
  return typeof raw === 'string' && GOMEMLIMIT_VALUE_RE.test(raw.trim());
}

export function parseWindowsRegQueryValue(output, valueName = 'GOMEMLIMIT') {
  const escaped = String(valueName || 'GOMEMLIMIT').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^\\s*${escaped}\\s+REG_(?:EXPAND_)?SZ\\s+(.+?)\\s*$`, 'im');
  for (const rawLine of String(output || '').split(/\r?\n/)) {
    const m = re.exec(rawLine);
    if (m && m[1]) return m[1].trim();
  }
  return '';
}

function isWindowsRegNotFoundError(err) {
  const msg = String(err?.message || err || '');
  if (/access is denied|拒绝访问|permission denied|ENOENT|EACCES|EPERM/i.test(msg)) {
    return false;
  }
  if (/unable to find|cannot find|not found|找不到|見つかりません|찾을 수 없|no se encontr|introuvable|nicht gefunden/i.test(msg)) {
    return true;
  }
  return Number(err?.code) === 1;
}

function defaultExecFileAsync(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, options, (err, stdout, stderr) => {
      if (err) {
        const msg = String(stderr || err.message || 'command failed').trim();
        const wrapped = new Error(msg);
        if (err.code !== undefined) wrapped.code = err.code;
        reject(wrapped);
        return;
      }
      resolve(String(stdout || ''));
    });
  });
}

function assertNoSymlinkChain(targetPath, label = 'path') {
  const resolved = path.resolve(targetPath);
  const parsed = path.parse(resolved);
  const parts = resolved.slice(parsed.root.length).split(/[\\/]+/).filter(Boolean);
  let cur = parsed.root;
  for (let i = 0; i < parts.length; i += 1) {
    cur = path.join(cur, parts[i]);
    try {
      const st = fs.lstatSync(cur);
      if (st.isSymbolicLink()) {
        if (process.platform === 'darwin' && (cur === '/var' || cur === '/tmp')) continue;
        throw new Error(`Refusing symbolic link in ${label}: ${cur}`);
      }
    } catch (err) {
      if (err && err.code === 'ENOENT') break;
      throw err;
    }
  }
}

function writeAtomicPrivateFile(filePath, content, mode = 0o600) {
  const resolved = path.resolve(filePath);
  assertNoSymlinkChain(resolved, 'GOMEMLIMIT config');
  const dir = path.dirname(resolved);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  assertNoSymlinkChain(dir, 'GOMEMLIMIT directory');
  const tmp = `${resolved}.tmp.${crypto.randomBytes(6).toString('hex')}`;
  let fd = null;
  try {
    fd = fs.openSync(tmp, 'wx', mode);
    fs.writeFileSync(fd, content, 'utf8');
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

function getMacLaunchAgentPlistPath(homeDir = os.homedir()) {
  return path.join(homeDir, 'Library', 'LaunchAgents', `${MAC_LAUNCH_AGENT_LABEL}.plist`);
}

function getLinuxEnvDFilePath(homeDir = os.homedir(), env = process.env) {
  const customHome = homeDir && path.resolve(homeDir) !== path.resolve(os.homedir());
  const xdgConfig =
    !customHome && typeof env?.XDG_CONFIG_HOME === 'string' && env.XDG_CONFIG_HOME.trim()
      ? env.XDG_CONFIG_HOME.trim()
      : path.join(homeDir, '.config');
  return path.join(xdgConfig, 'environment.d', '90-obsidian-prism-gomemlimit.conf');
}

function buildMacLaunchAgentPlist(value) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    `  <key>Label</key><string>${MAC_LAUNCH_AGENT_LABEL}</string>`,
    '  <key>ProgramArguments</key>',
    '  <array>',
    '    <string>/bin/launchctl</string>',
    '    <string>setenv</string>',
    '    <string>GOMEMLIMIT</string>',
    `    <string>${value}</string>`,
    '  </array>',
    '  <key>RunAtLoad</key><true/>',
    '</dict>',
    '</plist>',
    '',
  ].join('\n');
}

export function buildManualGoMemLimitGuide(platform = process.platform, value = RECOMMENDED_GOMEMLIMIT) {
  const v = isValidGoMemLimitValue(value) ? value : RECOMMENDED_GOMEMLIMIT;
  if (platform === 'win32') {
    return `setx GOMEMLIMIT ${v}`;
  }
  if (platform === 'darwin') {
    return `launchctl setenv GOMEMLIMIT ${v}`;
  }
  return `mkdir -p ~/.config/environment.d && echo "GOMEMLIMIT=${v}" > ~/.config/environment.d/90-obsidian-prism-gomemlimit.conf`;
}

export async function getGoMemLimitStatus({
  platform = process.platform,
  execAsync = defaultExecFileAsync,
  env = process.env,
  homeDir = os.homedir(),
  linuxEnvFile = null,
  macPlistPath = null,
} = {}) {
  const processEnvValue = typeof env?.GOMEMLIMIT === 'string' ? env.GOMEMLIMIT.trim() : '';
  let currentValue = '';
  let source = 'none';

  try {
    if (platform === 'win32') {
      try {
        const out = await execAsync(
          'reg.exe',
          ['query', WIN_ENV_REG_KEY, '/v', 'GOMEMLIMIT'],
          { encoding: 'utf8', windowsHide: true, timeout: 5000 }
        );
        currentValue = parseWindowsRegQueryValue(out, 'GOMEMLIMIT');
        if (currentValue) source = 'win-user-env';
      } catch (err) {
        if (!isWindowsRegNotFoundError(err)) throw err;
        currentValue = '';
      }
    } else if (platform === 'darwin') {
      try {
        const out = await execAsync('/bin/launchctl', ['getenv', 'GOMEMLIMIT'], { encoding: 'utf8', timeout: 4000 });
        currentValue = String(out || '').trim();
        if (currentValue) source = 'macos-launchctl';
      } catch {}
      if (!currentValue) {
        const plistPath = macPlistPath || getMacLaunchAgentPlistPath(homeDir);
        if (fs.existsSync(plistPath)) {
          assertNoSymlinkChain(plistPath, 'LaunchAgent plist');
          const xml = fs.readFileSync(plistPath, 'utf8');
          const m = /<string>GOMEMLIMIT<\/string>\s*<string>([^<]+)<\/string>/i.exec(xml);
          if (m && m[1]) {
            currentValue = m[1].trim();
            source = 'macos-launchagent';
          }
        }
      }
    } else {
      const envFile = linuxEnvFile || getLinuxEnvDFilePath(homeDir, env);
      if (fs.existsSync(envFile)) {
        assertNoSymlinkChain(envFile, 'environment.d file');
        const txt = fs.readFileSync(envFile, 'utf8');
        const m = /^\s*GOMEMLIMIT\s*=\s*([^\s#]+)\s*$/m.exec(txt);
        if (m && m[1]) {
          currentValue = m[1].trim();
          source = 'linux-environment-d';
        }
      }
      if (!currentValue && processEnvValue) {
        currentValue = processEnvValue;
        source = 'process-env';
      }
    }
  } catch {
    if (processEnvValue) {
      currentValue = processEnvValue;
      source = 'process-env';
    }
  }

  const restartRequired = Boolean(currentValue !== processEnvValue);
  return {
    ok: true,
    platform,
    configured: Boolean(currentValue),
    currentValue,
    processEnvValue,
    source,
    supportedAutoApply: platform === 'win32' || platform === 'darwin' || platform === 'linux',
    recommendedValue: RECOMMENDED_GOMEMLIMIT,
    presets: [...ALLOWED_GOMEMLIMIT_PRESETS],
    restartRequired,
    manualGuide: buildManualGoMemLimitGuide(platform, currentValue || RECOMMENDED_GOMEMLIMIT),
  };
}

export async function setGoMemLimit(rawValue, opts = {}) {
  const value = String(rawValue || '').trim();
  if (!isValidGoMemLimitValue(value)) {
    return {
      ok: false,
      code: 'INVALID_GOMEMLIMIT',
      error: `Invalid GOMEMLIMIT value; allowed presets: ${ALLOWED_GOMEMLIMIT_PRESETS.join(', ')}`,
    };
  }
  const platform = opts.platform || process.platform;
  const execAsync = typeof opts.execAsync === 'function' ? opts.execAsync : defaultExecFileAsync;
  const env = opts.env || process.env;
  const homeDir = opts.homeDir || os.homedir();

  try {
    if (platform === 'win32') {
      await execAsync(
        'reg.exe',
        ['add', WIN_ENV_REG_KEY, '/v', 'GOMEMLIMIT', '/t', 'REG_SZ', '/d', value, '/f'],
        {
          encoding: 'utf8',
          windowsHide: true,
          timeout: 12000,
          env,
        }
      );
    } else if (platform === 'darwin') {
      await execAsync('/bin/launchctl', ['setenv', 'GOMEMLIMIT', value], { encoding: 'utf8', timeout: 5000 });
      const plistPath = opts.macPlistPath || getMacLaunchAgentPlistPath(homeDir);
      writeAtomicPrivateFile(plistPath, buildMacLaunchAgentPlist(value), 0o600);
    } else if (platform === 'linux') {
      const envFile = opts.linuxEnvFile || getLinuxEnvDFilePath(homeDir, env);
      writeAtomicPrivateFile(envFile, `# Managed by Obsidian Prism (optional Go soft memory limit)\nGOMEMLIMIT=${value}\n`, 0o600);
    } else {
      return { ok: false, code: 'UNSUPPORTED_PLATFORM', error: `Unsupported platform: ${platform}` };
    }
    const status = await getGoMemLimitStatus({
      platform,
      execAsync,
      env,
      homeDir,
      linuxEnvFile: opts.linuxEnvFile,
      macPlistPath: opts.macPlistPath,
    });
    return { ...status, ok: true, appliedValue: value, restartRequired: true };
  } catch (err) {
    return { ok: false, code: 'APPLY_FAILED', error: String(err?.message || err) };
  }
}

export async function clearGoMemLimit(opts = {}) {
  const platform = opts.platform || process.platform;
  const execAsync = typeof opts.execAsync === 'function' ? opts.execAsync : defaultExecFileAsync;
  const env = opts.env || process.env;
  const homeDir = opts.homeDir || os.homedir();

  try {
    if (platform === 'win32') {
      try {
        await execAsync(
          'reg.exe',
          ['delete', WIN_ENV_REG_KEY, '/v', 'GOMEMLIMIT', '/f'],
          { encoding: 'utf8', windowsHide: true, timeout: 12000, env }
        );
      } catch (err) {
        if (!isWindowsRegNotFoundError(err)) throw err;
      }
    } else if (platform === 'darwin') {
      try {
        await execAsync('/bin/launchctl', ['unsetenv', 'GOMEMLIMIT'], { encoding: 'utf8', timeout: 5000 });
      } catch {}
      const plistPath = opts.macPlistPath || getMacLaunchAgentPlistPath(homeDir);
      if (fs.existsSync(plistPath)) {
        assertNoSymlinkChain(plistPath, 'LaunchAgent plist');
        fs.unlinkSync(plistPath);
      }
    } else if (platform === 'linux') {
      const envFile = opts.linuxEnvFile || getLinuxEnvDFilePath(homeDir, env);
      if (fs.existsSync(envFile)) {
        assertNoSymlinkChain(envFile, 'environment.d file');
        fs.unlinkSync(envFile);
      }
    } else {
      return { ok: false, code: 'UNSUPPORTED_PLATFORM', error: `Unsupported platform: ${platform}` };
    }
    const status = await getGoMemLimitStatus({
      platform,
      execAsync,
      env,
      homeDir,
      linuxEnvFile: opts.linuxEnvFile,
      macPlistPath: opts.macPlistPath,
    });
    return { ...status, ok: true, cleared: true, restartRequired: Boolean(env?.GOMEMLIMIT) };
  } catch (err) {
    return { ok: false, code: 'CLEAR_FAILED', error: String(err?.message || err) };
  }
}

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  PrismDaemon,
  THOUGHT_BINDING,
  WALLPAPER_BINDING,
} from '../sidecars/daemon/main.mjs';
import { buildInstaller } from '../scripts/build-installer.mjs';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const cdp = require(path.join(ROOT_DIR, 'cdp.js'));
const installTool = require(path.join(ROOT_DIR, 'tools', 'install-plugin.cjs'));
const removeMod = require(path.join(ROOT_DIR, 'remove.js'));

function execFileAsync(bin, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, opts, (err, stdout, stderr) => {
      if (err) {
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
        return;
      }
      resolve(stdout);
    });
  });
}

function mkTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function getWindowsCscPath() {
  const winDir = process.env.WINDIR || 'C:\\Windows';
  return [
    path.join(winDir, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
    path.join(winDir, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'),
  ].find((p) => fs.existsSync(p));
}

async function allocateClosedLoopbackPort() {
  const srv = net.createServer();
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const { port } = srv.address();
  await new Promise((resolve) => srv.close(resolve));
  return port;
}

async function waitFor(fn, timeoutMs = 8000, intervalMs = 120) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = null;
  while (Date.now() < deadline) {
    try {
      const val = await fn();
      if (val) return val;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw lastErr || new Error('Timed out waiting for condition');
}

function createFakeCdpSession(options = {}) {
  const listeners = new Map();
  const calls = [];
  const evals = [];
  const mainFrameId = options.mainFrameId || 'MAIN_F1';
  const mainCtxId = options.mainCtxId || 1;
  const isNonHost = Boolean(options.nonHost);

  const session = {
    closed: false,
    onClose: null,
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(fn);
    },
    emit(event, params) {
      for (const fn of listeners.get(event) || []) fn(params);
    },
    async send(method, params = {}) {
      calls.push({ method, params });
      if (method === 'Page.getFrameTree') {
        return { frameTree: { frame: { id: mainFrameId, url: options.url || 'https://127.0.0.1:9999/' } } };
      }
      if (method === 'Runtime.enable') {
        session.emit('Runtime.executionContextCreated', {
          context: {
            id: mainCtxId,
            auxData: { frameId: mainFrameId, isDefault: true, type: 'default' },
          },
        });
        return {};
      }
      if (method === 'Page.addScriptToEvaluateOnNewDocument') {
        return { identifier: `script-${calls.length}` };
      }
      if (method === 'Runtime.evaluate') {
        evals.push({ expression: params.expression, contextId: params.contextId });
        return { result: { type: 'undefined' } };
      }
      return {};
    },
    async evaluate(expression) {
      evals.push({ expression, direct: true });
      const s = String(expression || '');
      if (s.includes('globalThis.__agCsUiMain') || s.includes('__agPrism')) {
        if (s.includes('isHostDom') && s.includes('hasWallpaper')) {
          return {
            ready: true,
            isHostDom: !isNonHost,
            href: options.url || 'https://127.0.0.1:9999/',
            title: options.title || 'Antigravity',
            prismAttr: cdp.PLUGIN_VERSION,
            hasPrism: !isNonHost,
            hasRepoBridge: !isNonHost,
            hasThoughtBridge: !isNonHost,
            hasUsageBridge: !isNonHost,
            hasOmniBridge: !isNonHost,
            hasOmniServerMeta: !isNonHost,
            hasOmni: !isNonHost,
            omniMode: 'on',
            hasSidebarBridge: false,
            hasSidebar: false,
            sidebarMode: 'off',
            hasHostI18n: false,
            hasThought: false,
            hasThoughtSettingsUi: false,
            hasInlineDiff: !isNonHost,
            hasWallpaper: !isNonHost,
            hasWallpaperUi: !isNonHost,
            codeHash: '',
            hasLegacyCss: false,
            needsDashboardSync: false,
          };
        }
        if (!s.includes('globalThis.__agCsUiMain') && (s.includes('__prismMountWallpaperUi') || s.includes('__agPrismWallpaper'))) {
          return isNonHost ? { ok: false, status: 'skipped-non-host' } : { ok: true, status: 'mounted' };
        }
        return isNonHost
          ? { ok: false, status: 'skipped-non-host' }
          : { ok: true, status: 'ok', version: cdp.PLUGIN_VERSION };
      }
      return { ok: true, status: 'ok' };
    },
    close() {
      if (session.closed) return;
      session.closed = true;
      if (typeof session.onClose === 'function') session.onClose();
    },
    getCalls: () => calls,
    getEvals: () => evals,
  };
  return session;
}

test('盲区 1 & 4 (Windows C#): 死端口探活、非默认目录快捷方式扫描、depth<=3 与 Quick Launch 以及测试沙盒严格隔离', {
  skip: process.platform !== 'win32' ? 'Windows-only C# probe' : false,
}, async () => {
  const csc = getWindowsCscPath();
  assert.ok(csc, 'Expected .NET Framework csc.exe');

  const tmpDir = mkTempDir('ag-prism-b14-');
  const liveServer = http.createServer((req, res) => {
    if (req.url === '/json/list') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([
        {
          id: 'P1',
          type: 'page',
          title: 'Antigravity',
          url: 'https://127.0.0.1:9999/',
          webSocketDebuggerUrl: 'ws://127.0.0.1:1/p1',
        },
      ]));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  try {
    await new Promise((resolve) => liveServer.listen(0, '127.0.0.1', resolve));
    const livePort = liveServer.address().port;
    const deadPort = await allocateClosedLoopbackPort();

    const probeCs = path.join(tmpDir, 'Probe.cs');
    const probeExe = path.join(tmpDir, 'probe.exe');
    fs.writeFileSync(
      probeCs,
      [
        'using System;',
        'using System.Collections.Generic;',
        'using AgyClaudeStyle;',
        'class Probe {',
        '  static void Main(string[] args) {',
        '    int livePort = int.Parse(args[0]);',
        '    int deadPort = int.Parse(args[1]);',
        '    string customDir = args[2];',
        '    string defaultDir = args[3];',
        '    string tempInstallDir = args[4];',
        '    string sandboxShortcutDir = args[5];',
        '    string stateDir = args[6];',
        '    bool liveAlive = CdpHelper.IsPortAliveAsync(livePort, 1500).GetAwaiter().GetResult();',
        '    bool deadAlive = CdpHelper.IsPortAliveAsync(deadPort, 1000).GetAwaiter().GetResult();',
        '    ActivePortProbeResult deadProbe = CdpHelper.ProbeActivePortAsync(null).GetAwaiter().GetResult();',
        '    ActivePortProbeResult liveProbe = CdpHelper.ProbeActivePortAsync(livePort).GetAwaiter().GetResult();',
        '    List<string> customDirs = CdpHelper.GetShortcutCandidateDirs(customDir, defaultDir);',
        '    List<string> tempDirs = CdpHelper.GetShortcutCandidateDirs(tempInstallDir, defaultDir);',
        '    Environment.SetEnvironmentVariable("AG_PRISM_SHORTCUT_DIRS", sandboxShortcutDir);',
        '    int patched = CdpHelper.EnsureAntigravityShortcutsOptIn(tempInstallDir, defaultDir, stateDir, null);',
        '    var obj = new Dictionary<string, object>(StringComparer.Ordinal) {',
        '      { "liveAlive", liveAlive },',
        '      { "deadAlive", deadAlive },',
        '      { "deadProbeRaw", deadProbe.RawPort.HasValue ? (object)deadProbe.RawPort.Value : null },',
        '      { "deadProbeLive", deadProbe.LivePort.HasValue ? (object)deadProbe.LivePort.Value : null },',
        '      { "deadProbeStale", deadProbe.IsStalePort },',
        '      { "liveProbeLive", liveProbe.LivePort.HasValue ? (object)liveProbe.LivePort.Value : null },',
        '      { "liveProbeStale", liveProbe.IsStalePort },',
        '      { "liveProbePages", liveProbe.Pages != null ? liveProbe.Pages.Count : -1 },',
        '      { "customDirsCount", customDirs.Count },',
        '      { "tempDirsCount", tempDirs.Count },',
        '      { "patchedDepth3", patched }',
        '    };',
        '    Console.Write(MiniJson.Stringify(obj, false));',
        '  }',
        '}',
      ].join('\n'),
      'utf8'
    );

    execFileSync(
      csc,
      [
        '/nologo',
        '/utf8output',
        '/codepage:65001',
        '/target:exe',
        `/out:${probeExe}`,
        '/r:System.dll',
        '/r:System.Core.dll',
        '/r:System.Net.Http.dll',
        path.join(ROOT_DIR, 'installer', 'common', 'MiniJson.cs'),
        path.join(ROOT_DIR, 'installer', 'common', 'CdpClient.cs'),
        probeCs,
      ],
      { stdio: 'pipe' }
    );

    // 准备残留死端口的 DevToolsActivePort 文件与 depth=3 / depth=4 嵌套快捷方式
    const fakeAppData = path.join(tmpDir, 'appdata');
    const agDataDir = path.join(fakeAppData, 'Antigravity');
    const shortcutRoot = path.join(tmpDir, 'shortcuts');
    const depth3Dir = path.join(shortcutRoot, 'l1', 'l2', 'l3');
    const depth4Dir = path.join(shortcutRoot, 'l1', 'l2', 'l3', 'l4');
    const stateDir = path.join(tmpDir, 'state');
    fs.mkdirSync(agDataDir, { recursive: true });
    fs.mkdirSync(depth4Dir, { recursive: true });
    fs.writeFileSync(path.join(agDataDir, 'DevToolsActivePort'), `${deadPort}\n/devtools/browser/stale\n`, 'utf8');

    const fakeAgExe = path.join(tmpDir, 'Antigravity.exe');
    fs.writeFileSync(fakeAgExe, 'stub', 'utf8');
    const depth3Lnk = path.join(depth3Dir, 'Antigravity.lnk');
    const depth4Lnk = path.join(depth4Dir, 'Antigravity.lnk');
    const createPs = [
      '$sh = New-Object -ComObject WScript.Shell;',
      '$s3 = $sh.CreateShortcut($env:LNK3); $s3.TargetPath = $env:AG_EXE; $s3.Arguments = ""; $s3.Save();',
      '$s4 = $sh.CreateShortcut($env:LNK4); $s4.TargetPath = $env:AG_EXE; $s4.Arguments = ""; $s4.Save();',
    ].join(' ');
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', createPs], {
      env: { ...process.env, LNK3: depth3Lnk, LNK4: depth4Lnk, AG_EXE: fakeAgExe },
    });

    const cleanEnv = { ...process.env, APPDATA: fakeAppData };
    delete cleanEnv.NODE_ENV;
    delete cleanEnv.NODE_TEST_CONTEXT;
    delete cleanEnv.AG_CDP_PORT;
    delete cleanEnv.AG_PRISM_SHORTCUT_DIRS;
    delete cleanEnv.AG_PRISM_GEMINI_CONFIG_DIR;
    delete cleanEnv.AG_PRISM_ELECTRON_EXE;
    delete cleanEnv.PRISM_DISABLE_SHORTCUT_SYNC;
    delete cleanEnv.AG_PRISM_DISABLE_SHORTCUT_SYNC;

    const customNonDefaultDir = path.join('D:\\', 'CustomApps', 'obsidian-prism');
    const defaultInstallDir = path.join(process.env.LOCALAPPDATA || 'C:\\Users\\Default\\AppData\\Local', 'obsidian-prism');
    const tempInstallDir = path.join(tmpDir, 'installed-in-temp');

    const out = await execFileAsync(
      probeExe,
      [
        String(livePort),
        String(deadPort),
        customNonDefaultDir,
        defaultInstallDir,
        tempInstallDir,
        shortcutRoot,
        stateDir,
      ],
      { encoding: 'utf8', env: cleanEnv }
    );
    const res = JSON.parse(out);

    assert.equal(res.liveAlive, true, 'Live HTTP CDP port must probe alive');
    assert.equal(res.deadAlive, false, 'Closed dead port must probe not alive');
    assert.equal(res.deadProbeRaw, deadPort, 'RawPort must capture stale DevToolsActivePort number');
    assert.equal(res.deadProbeLive, null, 'Stale DevToolsActivePort must NOT be treated as a live port');
    assert.equal(res.deadProbeStale, true, 'Stale DevToolsActivePort must set IsStalePort = true');
    assert.equal(res.liveProbeLive, livePort);
    assert.equal(res.liveProbeStale, false);
    assert.equal(res.liveProbePages, 1);
    assert.ok(res.customDirsCount > 0, 'Non-default real install dir must no longer return empty shortcut dirs');
    assert.equal(res.tempDirsCount, 0, 'Temp sandbox install dir must remain strictly isolated (0 real desktop dirs)');
    assert.equal(res.patchedDepth3, 1, 'Depth <= 3 shortcut must be patched while depth 4 is bounded out');

    const readArgs = (lnkPath) =>
      execFileSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', '$sh = New-Object -ComObject WScript.Shell; Write-Output ($sh.CreateShortcut($env:L).Arguments)'],
        { encoding: 'utf8', env: { ...process.env, L: lnkPath } }
      ).trim();
    assert.equal(readArgs(depth3Lnk), '--remote-debugging-port=0', 'Depth 3 Start Menu/subfolder shortcut must be patched');
    assert.equal(readArgs(depth4Lnk), '', 'Depth 4 shortcut must remain untouched');
  } finally {
    await new Promise((resolve) => liveServer.close(resolve));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('盲区 1 (Windows Watcher E2E): 残留死端口 DevToolsActivePort 不再让 Watcher 哑火，自动进入裸启检测、修补快捷方式并防刷屏', {
  skip: process.platform !== 'win32' ? 'Windows-only Watcher E2E' : false,
}, async () => {
  const workDir = mkTempDir('ag-prism-deadport-e2e-');
  const installerExe = path.join(workDir, 'installer.exe');
  const installDir = path.join(workDir, 'installed');
  const pluginDir = path.join(workDir, 'plugins', 'obsidian-prism');
  const fakeAppData = path.join(workDir, 'appdata');
  const agDir = path.join(fakeAppData, 'Antigravity');
  const shortcutDir = path.join(workDir, 'shortcuts');
  const outInstall = path.join(workDir, 'install.json');

  fs.mkdirSync(agDir, { recursive: true });
  fs.mkdirSync(shortcutDir, { recursive: true });

  const deadPort = await allocateClosedLoopbackPort();
  fs.writeFileSync(path.join(agDir, 'DevToolsActivePort'), `${deadPort}\n/devtools/browser/old\n`, 'utf8');

  const fakeAgExe = path.join(workDir, 'Antigravity.exe');
  fs.writeFileSync(fakeAgExe, 'stub', 'utf8');
  const agLnk = path.join(shortcutDir, 'Antigravity.lnk');
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      '$sh = New-Object -ComObject WScript.Shell; $s = $sh.CreateShortcut($env:L); $s.TargetPath = $env:E; $s.Arguments = ""; $s.Save();',
    ],
    { env: { ...process.env, L: agLnk, E: fakeAgExe } }
  );

  const dummyBareHost = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    stdio: 'ignore',
    windowsHide: true,
  });

  try {
    buildInstaller({ outputPath: installerExe });
    const env = {
      ...process.env,
      APPDATA: fakeAppData,
      AG_PRISM_SHORTCUT_DIRS: shortcutDir,
      AG_PRISM_MOCK_BARE_HOST_PID: String(dummyBareHost.pid),
      AG_PRISM_MOCK_BARE_HOST_UPTIME_MS: '12000',
      AG_PRISM_MOCK_RELAUNCH_DECISION: 'no',
    };
    delete env.NODE_ENV;
    delete env.NODE_TEST_CONTEXT;
    delete env.AG_CDP_PORT;
    delete env.PRISM_NO_RELAUNCH_PROMPT;
    delete env.AG_PRISM_NO_RELAUNCH_PROMPT;

    await new Promise((resolve, reject) => {
      const child = spawn(
        installerExe,
        [
          '--silent',
          '--no-autostart',
          '--no-kill-legacy',
          '--no-native-daemon',
          '--install-dir',
          installDir,
          '--plugin-dir',
          pluginDir,
          '--out',
          outInstall,
        ],
        { stdio: 'ignore', windowsHide: true, env }
      );
      child.on('error', reject);
      child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`installer exit ${code}`))));
    });

    // 即使 DevToolsActivePort 存在残留死端口，Watcher 必须穿透进入裸启检测并写入 .relaunch-prompt-state.json
    const promptStatePath = path.join(pluginDir, '.relaunch-prompt-state.json');
    const stateObj = await waitFor(() => {
      if (!fs.existsSync(promptStatePath)) return null;
      const parsed = JSON.parse(fs.readFileSync(promptStatePath, 'utf8'));
      return parsed.hostPid === dummyBareHost.pid && parsed.decision === 'no' ? parsed : null;
    }, 10000, 150);
    assert.equal(stateObj.hostPid, dummyBareHost.pid);
    assert.equal(stateObj.decision, 'no');

    // 验证快捷方式已补齐 --remote-debugging-port=0
    const lnkArgs = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', '$sh = New-Object -ComObject WScript.Shell; Write-Output ($sh.CreateShortcut($env:L).Arguments)'],
      { encoding: 'utf8', env: { ...process.env, L: agLnk } }
    ).trim();
    assert.equal(lnkArgs, '--remote-debugging-port=0');

    // 等待超过一轮轮询后验证死端口日志仅记录 1 次（防止日志刷屏）
    await new Promise((r) => setTimeout(r, 2400));
    const watchLogPath = path.join(installDir, 'watch.log');
    const logText = fs.existsSync(watchLogPath) ? fs.readFileSync(watchLogPath, 'utf8') : '';
    const staleMatches = logText.match(/检测到残留无效调试端口|Detected stale debug port/g) || [];
    assert.equal(staleMatches.length, 1, `Expected stale-port log deduplicated to 1 occurrence, got ${staleMatches.length}`);
  } finally {
    try { dummyBareHost.kill(); } catch {}
    try {
      const pidFile = path.join(installDir, '.watch.pid');
      if (fs.existsSync(pidFile)) {
        const pid = parseInt(fs.readFileSync(pidFile, 'utf8'), 10);
        if (pid) process.kill(pid);
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch {}
  }
});

test('盲区 2 (tools/install-plugin.cjs): --status 升级字段、中英文自检摘要与 stdout 纯 JSON 兼容', async () => {
  const workDir = mkTempDir('ag-prism-b2-');
  try {
    const hostCfgDir = path.join(workDir, '.gemini', 'config');
    const targetDir = path.join(hostCfgDir, 'plugins', 'obsidian-prism');
    const fakeWatcherDir = path.join(workDir, 'watcher-dir');
    fs.mkdirSync(fakeWatcherDir, { recursive: true });

    const installRes = await installTool.installPlugin({
      sourceDir: ROOT_DIR,
      targetDir,
      hostConfigDir: hostCfgDir,
      startDaemon: false,
      syncShortcuts: false,
      watcherDir: fakeWatcherDir,
      hostProbe: () => [
        { pid: 4242, imageName: 'Antigravity.exe', commandLine: '"C:\\Antigravity\\Antigravity.exe"', startMs: Date.now() - 20000 },
      ],
    });
    assert.equal(installRes.ok, true);
    assert.equal(installRes.selfCheck.hasThoughtTranslator, true);
    assert.equal(installRes.selfCheck.hasWallpaperChannel, true);
    assert.equal(installRes.selfCheck.bareAntigravityRunning, true);
    assert.equal(installRes.selfCheck.watcherInstalled, false);
    assert.equal(installRes.selfCheck.thoughtTranslateMode, 'off');

    const statusBare = installTool.getPluginInstallStatus({
      targetDir,
      watcherDir: fakeWatcherDir,
      hostProbe: () => [
        { pid: 4242, imageName: 'Antigravity.exe', commandLine: '"C:\\Antigravity\\Antigravity.exe"' },
      ],
    });
    assert.equal(statusBare.installed, true);
    assert.equal(statusBare.hasThoughtTranslator, true);
    assert.equal(statusBare.hasWallpaperChannel, true);
    assert.equal(statusBare.bareAntigravityRunning, true);
    assert.equal(statusBare.watcherInstalled, false);

    // 放入 Watcher 二进制后检测 watcherInstalled=true；传入带参进程后 bareAntigravityRunning=false
    const watcherBinName = process.platform === 'darwin' ? 'obsidian-prism-watcher' : 'obsidian-prism-watcher.exe';
    fs.writeFileSync(path.join(fakeWatcherDir, watcherBinName), 'stub', 'utf8');
    const statusWithWatcher = installTool.getPluginInstallStatus({
      targetDir,
      watcherDir: fakeWatcherDir,
      platformOverride: process.platform === 'darwin' ? 'darwin' : 'win32',
      hostProbe: () => [
        { pid: 4242, imageName: 'Antigravity.exe', commandLine: '"C:\\Antigravity\\Antigravity.exe" --remote-debugging-port=0' },
      ],
    });
    assert.equal(statusWithWatcher.watcherInstalled, true);
    assert.equal(statusWithWatcher.bareAntigravityRunning, false);

    // 自检摘要同时包含中文与英文指引（默认关闭思考翻译 + 裸启重开提示）
    const summary = installTool.formatInstallSelfCheckSummary(installRes);
    assert.ok(summary.includes('思考过程翻译默认处于关闭态'));
    assert.ok(summary.includes('Thought Translator is OFF by default'));
    assert.ok(summary.includes('裸启'));
    assert.ok(summary.includes('Action Required'));

    // CLI --status 输出纯合法 JSON
    const cliStatusOut = execFileSync(
      process.execPath,
      [path.join(ROOT_DIR, 'tools', 'install-plugin.cjs'), '--status', '--target', targetDir],
      { encoding: 'utf8', env: { ...process.env, NODE_ENV: 'test' } }
    );
    const parsedCliStatus = JSON.parse(cliStatusOut);
    assert.equal(parsedCliStatus.installed, true);
    assert.equal(parsedCliStatus.hasThoughtTranslator, true);
    assert.equal(parsedCliStatus.hasWallpaperChannel, true);
    assert.equal(typeof parsedCliStatus.bareAntigravityRunning, 'boolean');
    assert.equal(typeof parsedCliStatus.watcherInstalled, 'boolean');
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});

test('盲区 3 (sidecars/daemon/main.mjs): 端口切换、全窗口断开重连与活跃窗口 0->N 恢复时立即复位 45 分钟快捷方式退避', async () => {
  const workDir = mkTempDir('ag-prism-b3-');
  const portFile = path.join(workDir, 'DevToolsActivePort');
  try {
    let activePort = 41001;
    let currentPages = [
      { id: 'P1', type: 'page', title: 'Antigravity', url: 'https://127.0.0.1:9999/', webSocketDebuggerUrl: 'ws://127.0.0.1:41001/p1' },
    ];
    let syncCalls = 0;
    const fakeSessions = new Map();

    fs.writeFileSync(portFile, `${activePort}\n/devtools/browser/1\n`, 'utf8');

    const daemon = new PrismDaemon({
      rootDir: ROOT_DIR,
      bundleCachePath: false,
      portFile,
      enabledCheck: () => true,
      enableAutoUpdateTimer: false,
      silent: true,
      shortcutCheckIntervalMs: 300000,
      shortcutBackoffIntervalMs: 45 * 60 * 1000,
      relaunchHooks: {
        syncShortcuts: () => {
          syncCalls += 1;
          return { supported: true, patched: [], skipped: [], alreadySet: ['Antigravity.lnk'], matched: 1 };
        },
      },
    });
    daemon.running = true;
    daemon.cdp = {
      ...daemon.cdp,
      listPages: async () => currentPages,
      CdpSession: {
        connect: async (wsUrl) => {
          const s = createFakeCdpSession({ url: 'https://127.0.0.1:9999/' });
          fakeSessions.set(wsUrl, s);
          return s;
        },
      },
    };

    // 1. 首次建立退避态（allClean = true, 45 分钟退避）
    await daemon.tick();
    daemon._maybeSyncShortcuts(true, { hasActivePort: true });
    assert.equal(syncCalls, 1);
    assert.equal(daemon._shortcutAllClean, true);

    // 常规 tick 在 45 分钟退避内不触发同步
    await daemon.tick();
    assert.equal(syncCalls, 1, 'Routine tick during 45m backoff must not resync shortcuts');

    // 2. 宿主重启切换 CDP 端口 -> 立即复位退避并触发同步！
    activePort = 41002;
    fs.writeFileSync(portFile, `${activePort}\n/devtools/browser/2\n`, 'utf8');
    currentPages = [
      { id: 'P2', type: 'page', title: 'Antigravity', url: 'https://127.0.0.1:9999/', webSocketDebuggerUrl: 'ws://127.0.0.1:41002/p2' },
    ];
    await daemon.tick();
    assert.equal(syncCalls, 2, 'Port change must reset 45m backoff and immediately resync shortcuts');

    // 3. 全部窗口断开后重连 -> 立即复位退避并触发同步！
    for (const s of fakeSessions.values()) s.close();
    fakeSessions.clear();
    assert.equal(daemon.sessions.size, 0);
    assert.equal(daemon._disconnectedAllSessions, true);
    currentPages = [
      { id: 'P3', type: 'page', title: 'Antigravity', url: 'https://127.0.0.1:9999/', webSocketDebuggerUrl: 'ws://127.0.0.1:41002/p3' },
    ];
    await daemon.tick();
    assert.equal(syncCalls, 3, 'Reconnecting after all windows disconnected must reset 45m backoff and resync');

    // 4. 活跃窗口数从 0 恢复到 >0（模拟未设 _disconnectedAllSessions 但 sessions 从 0 变为 1）-> 立即复位并同步！
    daemon.sessions.clear();
    daemon._disconnectedAllSessions = false;
    daemon._prevAttachedCount = 0;
    daemon._shortcutAllClean = true;
    daemon._lastShortcutCheckAt = Date.now();
    currentPages = [
      { id: 'P4', type: 'page', title: 'Antigravity', url: 'https://127.0.0.1:9999/', webSocketDebuggerUrl: 'ws://127.0.0.1:41002/p4' },
    ];
    await daemon.tick();
    assert.equal(syncCalls, 4, 'Active window count recovering from 0 -> 1 must reset 45m backoff and resync');

    await daemon.stop(false);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});

test('盲区 5 (macOS Watcher): 版本+PID+startTime 感知重开提示自动复位与死端口探活契约', () => {
  const watcherSwift = fs.readFileSync(
    path.join(ROOT_DIR, 'installer', 'macos', 'Watcher', 'main.swift'),
    'utf8'
  );
  assert.equal(watcherSwift.includes('\r\n'), false, 'macOS Watcher main.swift must use pure LF');
  assert.equal(watcherSwift.startsWith('\uFEFF'), false, 'macOS Watcher main.swift must not have UTF-8 BOM');

  // 死端口探活（盲区 1 macOS 对齐）
  assert.ok(watcherSwift.includes('if let probed = try? CdpHelper.listPages(port: rp)'), 'macOS Watcher must actively probe DevToolsActivePort');
  assert.ok(watcherSwift.includes('检测到残留无效调试端口'), 'macOS Watcher logs stale port once');
  assert.ok(watcherSwift.includes('if livePort == nil && overridePort == nil'), 'macOS Watcher enters bare host flow when port is dead');

  // 盲区 5：版本 + PID + startTime 记录与自动复位
  assert.ok(watcherSwift.includes('private func readHostAppVersion(appPath: String) -> String'));
  assert.ok(watcherSwift.includes('CFBundleShortVersionString'));
  assert.ok(watcherSwift.includes('"hostVersion": .string(hostVersion)'));
  assert.ok(watcherSwift.includes('private func hasPromptedForHostWithVersion('));
  assert.ok(watcherSwift.includes('private func recordPromptedForHostWithVersion('));
  assert.ok(watcherSwift.includes('try? fm.removeItem(atPath: statePath)'), 'Old state file must be cleared/reset on new PID or version');

  // 语义等价状态机仿真验证
  const stateMatches = (obj, pid, startTimeMs, hostVersion) => {
    const savedVer = String(obj.hostVersion || '').trim();
    if (hostVersion && savedVer && savedVer !== hostVersion) return false;
    if (Number(obj.hostPid) !== pid) return false;
    const savedStart = Number(obj.hostStartMs || obj.startTimeMs || 0);
    if (savedStart > 0 && startTimeMs > 0 && Math.abs(savedStart - startTimeMs) > 15000) return false;
    return true;
  };
  const savedDeclined = { hostPid: 500, hostStartMs: 100000, hostVersion: '2.33.0(100)', decision: 'no' };
  assert.equal(stateMatches(savedDeclined, 500, 102000, '2.33.0(100)'), true, 'Same PID/startTime/version stays muted');
  assert.equal(stateMatches(savedDeclined, 501, 102000, '2.33.0(100)'), false, 'New PID resets declined state');
  assert.equal(stateMatches(savedDeclined, 500, 102000, '2.34.0(200)'), false, 'Updated host version resets declined state');
  assert.equal(stateMatches(savedDeclined, 500, 200000, '2.33.0(100)'), false, 'PID reuse with shifted startTime resets declined state');
});

test('任务 2: Daemon 透传思考 diagnose、接入 Channel 7 壁纸通道（mainFrame 门禁 / 非宿主 removeBinding / 多窗广播 / stop dispose）', async () => {
  const diagCalls = [];
  const wallpaperActions = [];
  let disposedWallpaper = 0;

  const mockThoughtSvc = {
    async diagnose(input) {
      diagCalls.push(input);
      return { ok: true, mode: input.mode || 'ai', profileReady: true, connectivity: { ok: true, latencyMs: 12 } };
    },
  };
  const mockWallpaperSvc = {
    _cfg: { enabled: false, mediaPath: '', mediaType: 'none', mediaUrl: '', opacity: 0.25, blurPx: 0, dimOverlay: 0.4, fit: 'cover', pauseOnBlur: true },
    getConfigSync() {
      return { ...this._cfg };
    },
    isEnabledSync() {
      return Boolean(this._cfg.enabled);
    },
    async handleAction(action, payload) {
      wallpaperActions.push({ action, payload });
      if (action === 'save-config') {
        this._cfg = { ...this._cfg, ...payload };
      }
      return { ok: true, action, config: this.getConfigSync() };
    },
    dispose() {
      disposedWallpaper += 1;
    },
  };

  const daemon = new PrismDaemon({
    rootDir: ROOT_DIR,
    bundleCachePath: false,
    enabledCheck: () => true,
    enableAutoUpdateTimer: false,
    silent: true,
    thoughtService: mockThoughtSvc,
    wallpaperService: mockWallpaperSvc,
  });
  daemon.running = true;

  try {
    // 确认 cdp.js 导出与常量对齐
    assert.equal(WALLPAPER_BINDING, '__agPrismWallpaperCall');
    assert.equal(cdp.WALLPAPER_BINDING, '__agPrismWallpaperCall');
    assert.equal(typeof cdp.buildWallpaperExpression, 'function');
    assert.equal(typeof cdp.WALLPAPER_REMOVE_EXPRESSION, 'string');
    assert.doesNotThrow(() => new vm.Script(cdp.buildWallpaperExpression()), 'Channel 7 expression must parse cleanly');
    assert.doesNotThrow(() => new vm.Script(cdp.WALLPAPER_REMOVE_EXPRESSION), 'Channel 7 remove expression must parse cleanly');

    // 1) attachTarget 两个合法主窗口 + 一个非宿主页面
    const hostSession1 = createFakeCdpSession({ mainFrameId: 'MAIN_1', mainCtxId: 11, title: 'Antigravity 1' });
    const hostSession2 = createFakeCdpSession({ mainFrameId: 'MAIN_2', mainCtxId: 22, title: 'Antigravity 2' });
    const nonHostSession = createFakeCdpSession({ mainFrameId: 'OTHER_1', mainCtxId: 33, title: 'External', nonHost: true });

    const sessionQueue = {
      'ws://host/1': hostSession1,
      'ws://host/2': hostSession2,
      'ws://other/1': nonHostSession,
    };
    daemon.cdp = {
      ...daemon.cdp,
      CdpSession: {
        connect: async (wsUrl) => sessionQueue[wsUrl],
      },
    };

    const entry1 = await daemon.attachTarget({ id: 'H1', type: 'page', title: 'Antigravity 1', url: 'https://127.0.0.1:9999/', webSocketDebuggerUrl: 'ws://host/1' });
    const entry2 = await daemon.attachTarget({ id: 'H2', type: 'page', title: 'Antigravity 2', url: 'https://127.0.0.1:9999/', webSocketDebuggerUrl: 'ws://host/2' });
    const ignoredRes = await daemon.attachTarget({ id: 'N1', type: 'page', title: 'External', url: 'https://127.0.0.1:9999/', webSocketDebuggerUrl: 'ws://other/1' });

    assert.ok(entry1 && entry2, 'Valid host targets must attach');
    assert.equal(ignoredRes, null, 'Non-host target must be skipped and detached');
    assert.ok(
      hostSession1.getCalls().some((c) => c.method === 'Runtime.addBinding' && c.params?.name === WALLPAPER_BINDING),
      'Host window must register WALLPAPER_BINDING'
    );
    assert.ok(
      nonHostSession.getCalls().some((c) => c.method === 'Runtime.removeBinding' && c.params?.name === WALLPAPER_BINDING),
      'Non-host target must call Runtime.removeBinding for WALLPAPER_BINDING'
    );
    assert.equal(entry1.wallpaperMounted, true);
    assert.ok(entry1.wallpaperScriptId, 'Host window must register Channel 7 via Page.addScriptToEvaluateOnNewDocument');

    // 2) THOUGHT_BINDING action === 'diagnose' 正确透传到 translatorService.diagnose
    await daemon.handleBindingCall(entry1, {
      name: THOUGHT_BINDING,
      payload: JSON.stringify({ id: 7, action: 'diagnose', input: { mode: 'ai', timeoutMs: 3000 } }),
      executionContextId: 11,
    });
    assert.equal(diagCalls.length, 1);
    assert.equal(diagCalls[0].mode, 'ai');
    assert.ok(
      hostSession1.getEvals().some((e) => String(e.expression).includes('__agPrismThoughtResolve(7,') && String(e.expression).includes('"profileReady":true')),
      'diagnose result must resolve back to __agPrismThoughtResolve'
    );

    // 3) 子 iframe 尝试调用 WALLPAPER_BINDING 必须被 mainFrame 门禁严格拒绝
    hostSession1.emit('Runtime.executionContextCreated', {
      context: { id: 99, auxData: { frameId: 'SUB_IFRAME', isDefault: true, type: 'default' } },
    });
    await daemon.handleBindingCall(entry1, {
      name: WALLPAPER_BINDING,
      payload: JSON.stringify({ id: 101, action: 'get-config' }),
      executionContextId: 99,
    });
    assert.equal(wallpaperActions.length, 0, 'Sub-iframe WALLPAPER_BINDING call must be strictly blocked');

    // 4) 合法主 Frame 调用 WALLPAPER_BINDING save-config -> 响应当前窗口并多窗口广播到 entry2
    await daemon.handleBindingCall(entry1, {
      name: WALLPAPER_BINDING,
      payload: JSON.stringify({ id: 102, action: 'save-config', payload: { enabled: true, opacity: 0.42 } }),
      executionContextId: 11,
    });
    assert.equal(wallpaperActions.length, 1);
    assert.equal(wallpaperActions[0].action, 'save-config');
    assert.ok(
      hostSession1.getEvals().some((e) => String(e.expression).includes('__agPrismWallpaperResolve(102,') && String(e.expression).includes('"opacity":0.42')),
      'Main-frame WALLPAPER_BINDING call must resolve via __agPrismWallpaperResolve'
    );
    assert.ok(
      hostSession2.getEvals().some((e) => String(e.expression).includes('window.__agPrismWallpaper?.applyConfig?.(') && String(e.expression).includes('"opacity":0.42') && e.contextId === 22),
      'save-config must broadcast updated wallpaper config to other attached host windows with explicit contextId'
    );
  } finally {
    // 5) stop() 必须释放 wallpaperService.dispose()
    await daemon.stop(false);
  }
  assert.equal(disposedWallpaper, 1, 'daemon.stop() must call wallpaperService.dispose()');
});

test('任务 2 & 3: 四端 --purge-data 补齐 obsidian-prism-wallpaper.json（普通卸载保留）且 README 补齐 AI 代装与思考翻译自检章节', async () => {
  // 1) remove.js & tools/install-plugin.cjs 实测普通卸载保留、--purge-data 清理
  const workDir = mkTempDir('ag-prism-wp-purge-');
  try {
    const hostCfgDir = path.join(workDir, '.gemini', 'config');
    const targetDir = path.join(hostCfgDir, 'plugins', 'obsidian-prism');
    fs.mkdirSync(hostCfgDir, { recursive: true });
    const wpCfg = path.join(hostCfgDir, 'obsidian-prism-wallpaper.json');
    fs.writeFileSync(wpCfg, '{"enabled":true}', 'utf8');

    await installTool.installPlugin({
      sourceDir: ROOT_DIR,
      targetDir,
      hostConfigDir: hostCfgDir,
      startDaemon: false,
      syncShortcuts: false,
    });
    await installTool.uninstallPlugin({
      targetDir,
      hostConfigDir: hostCfgDir,
      noCdp: true,
      syncShortcuts: false,
      purgeData: false,
    });
    assert.equal(fs.existsSync(wpCfg), true, 'Default uninstall must preserve obsidian-prism-wallpaper.json');

    await installTool.uninstallPlugin({
      targetDir,
      hostConfigDir: hostCfgDir,
      noCdp: true,
      syncShortcuts: false,
      purgeData: true,
    });
    assert.equal(fs.existsSync(wpCfg), false, 'install-plugin --purge-data must remove obsidian-prism-wallpaper.json');

    // remove.js purgeUserPluginData 实测
    fs.writeFileSync(wpCfg, '{"enabled":true}', 'utf8');
    const purged = removeMod.purgeUserPluginData({ hostConfigDir: hostCfgDir });
    assert.ok(purged.includes(wpCfg));
    assert.equal(fs.existsSync(wpCfg), false, 'remove.js --purge-data must remove obsidian-prism-wallpaper.json');
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }

  // 2) Windows & macOS Setup 源码白名单核验
  const winSetup = fs.readFileSync(path.join(ROOT_DIR, 'installer', 'setup', 'Program.cs'), 'utf8');
  const macSetup = fs.readFileSync(path.join(ROOT_DIR, 'installer', 'macos', 'Setup', 'main.swift'), 'utf8');
  assert.ok(winSetup.includes('"obsidian-prism-wallpaper.json"'), 'Windows Setup --purge-data must include obsidian-prism-wallpaper.json');
  assert.ok(macSetup.includes('"obsidian-prism-wallpaper.json"'), 'macOS Setup --purge-data must include obsidian-prism-wallpaper.json');

  // 3) README.md & README.en.md AI 代装规范与思考翻译自检核验
  const readmeZh = fs.readFileSync(path.join(ROOT_DIR, 'README.zh-CN.md'), 'utf8');
  const readmeEn = fs.readFileSync(path.join(ROOT_DIR, 'README.en.md'), 'utf8');
  assert.ok(readmeZh.includes('npm run install:plugin') && readmeZh.includes('node tools/install-plugin.cjs --status'));
  assert.ok(readmeZh.includes('严禁仅执行 `npm run inject`'));
  assert.ok(readmeZh.includes('一键诊断'));
  assert.ok(readmeEn.includes('npm run install:plugin') && readmeEn.includes('node tools/install-plugin.cjs --status'));
  assert.ok(readmeEn.includes('Do NOT use `npm run inject`'));
  assert.ok(readmeEn.includes('1-Click Diagnose'));
});

test('#229 [P1-6] (Windows C#): 内存级 hostKey 去重兜底、ACCESS_DENIED/无窗跳过 PowerShell 风暴、连续 2 次探活判死与 ConnectionRefused 立即判死', {
  skip: process.platform !== 'win32' ? 'Windows-only C# probe' : false,
}, async () => {
  const csc = getWindowsCscPath();
  assert.ok(csc, 'Expected .NET Framework csc.exe');

  const tmpDir = mkTempDir('ag-prism-p16-');
  const openSockets = new Set();
  const hangingServer = http.createServer((req, res) => {
    // 故意挂起 /json/list 请求以触发 HttpClient 2s 瞬态超时
  });
  hangingServer.on('connection', (sock) => {
    openSockets.add(sock);
    sock.on('close', () => openSockets.delete(sock));
  });

  try {
    await new Promise((resolve) => hangingServer.listen(0, '127.0.0.1', resolve));
    const hangPort = hangingServer.address().port;
    const deadPort = await allocateClosedLoopbackPort();

    // 构造一个占位的普通文件作为“不可写目录”，使磁盘 .relaunch-prompt-state.json 写入必然失败
    const blockedDirFile = path.join(tmpDir, 'readonly-blocker-file');
    fs.writeFileSync(blockedDirFile, 'not-a-directory', 'utf8');

    const probeCs = path.join(tmpDir, 'ProbeP16.cs');
    const probeExe = path.join(tmpDir, 'probe-p16.exe');
    fs.writeFileSync(
      probeCs,
      [
        'using System;',
        'using System.Collections.Generic;',
        'using System.Diagnostics;',
        'using System.IO;',
        'using AgyClaudeStyle;',
        'class ProbeP16 {',
        '  static void Main(string[] args) {',
        '    int deadPort = int.Parse(args[0]);',
        '    int hangPort = int.Parse(args[1]);',
        '    string blockedDir = args[2];',
        '',
        '    // 1) 内存级 HashSet<string> 已提示 hostKey 兜底（即使磁盘写盘失败也绝不无限重弹）',
        '    bool beforeRecord = CdpHelper.HasPromptedForHost(77777, 1700000000000L, blockedDir, blockedDir);',
        '    CdpHelper.RecordPromptedForHost(77777, 1700000000000L, "prompted", blockedDir, blockedDir);',
        '    bool afterRecordExact = CdpHelper.HasPromptedForHost(77777, 1700000000000L, blockedDir, blockedDir);',
        '    bool afterRecordJitter = CdpHelper.HasPromptedForHost(77777, 1700000005000L, blockedDir, blockedDir);',
        '    bool differentPid = CdpHelper.HasPromptedForHost(77778, 1700000000000L, blockedDir, blockedDir);',
        '    bool reusedPidLaterStart = CdpHelper.HasPromptedForHost(77777, 1700000030000L, blockedDir, blockedDir);',
        '',
        '    // 2) QueryProcessCommandLineFast / QueryWindowsProcessCommandLine 区分 ACCESS_DENIED 并立即跳过 PowerShell',
        '    bool selfDenied;',
        '    string selfCmd = CdpHelper.QueryProcessCommandLineFast(Process.GetCurrentProcess().Id, out selfDenied);',
        '    int deniedPid = -1;',
        '    Process[] allProcs = Process.GetProcesses();',
        '    for (int i = 0; i < allProcs.Length; i++) {',
        '      int pid = allProcs[i].Id;',
        '      try { allProcs[i].Dispose(); } catch { }',
        '      if (pid <= 0 || pid == Process.GetCurrentProcess().Id) continue;',
        '      bool d;',
        '      string c = CdpHelper.QueryProcessCommandLineFast(pid, out d);',
        '      if (d && string.IsNullOrEmpty(c)) {',
        '        deniedPid = pid;',
        '        break;',
        '      }',
        '    }',
        '    bool deniedQueryFlag = false;',
        '    string deniedCmd = "";',
        '    long deniedElapsedMs = -1;',
        '    if (deniedPid > 0) {',
        '      Stopwatch sw = Stopwatch.StartNew();',
        '      deniedCmd = CdpHelper.QueryWindowsProcessCommandLine(deniedPid, true, out deniedQueryFlag);',
        '      sw.Stop();',
        '      deniedElapsedMs = sw.ElapsedMilliseconds;',
        '    }',
        '    Stopwatch swNoWin = Stopwatch.StartNew();',
        '    bool noWinDenied;',
        '    string noWinCmd = CdpHelper.QueryWindowsProcessCommandLine(999999, false, out noWinDenied);',
        '    swNoWin.Stop();',
        '',
        '    // 3) ProbeActivePortAsync: ConnectionRefused 立即判死 vs 瞬态超时有活跃会话时需连续 2 次失败判死',
        '    ActivePortProbeResult refusedWithActive = CdpHelper.ProbeActivePortAsync(deadPort, true, 0).GetAwaiter().GetResult();',
        '    ActivePortProbeResult timeoutFirstWithActive = CdpHelper.ProbeActivePortAsync(hangPort, true, 0).GetAwaiter().GetResult();',
        '    ActivePortProbeResult timeoutSecondWithActive = CdpHelper.ProbeActivePortAsync(hangPort, true, timeoutFirstWithActive.ConsecutiveFailures).GetAwaiter().GetResult();',
        '    ActivePortProbeResult timeoutWithoutActive = CdpHelper.ProbeActivePortAsync(hangPort, false, 0).GetAwaiter().GetResult();',
        '',
        '    var obj = new Dictionary<string, object>(StringComparer.Ordinal) {',
        '      { "beforeRecord", beforeRecord },',
        '      { "afterRecordExact", afterRecordExact },',
        '      { "afterRecordJitter", afterRecordJitter },',
        '      { "differentPid", differentPid },',
        '      { "reusedPidLaterStart", reusedPidLaterStart },',
        '      { "selfDenied", selfDenied },',
        '      { "selfCmdNonEmpty", !string.IsNullOrEmpty(selfCmd) },',
        '      { "deniedPid", deniedPid },',
        '      { "deniedQueryFlag", deniedQueryFlag },',
        '      { "deniedCmdEmpty", string.IsNullOrEmpty(deniedCmd) },',
        '      { "deniedElapsedMs", deniedElapsedMs },',
        '      { "noWinCmdEmpty", string.IsNullOrEmpty(noWinCmd) },',
        '      { "noWinElapsedMs", swNoWin.ElapsedMilliseconds },',
        '      { "refusedIsRefused", refusedWithActive.IsConnectionRefused },',
        '      { "refusedIsTimeout", refusedWithActive.IsTransientTimeout },',
        '      { "refusedIsStale", refusedWithActive.IsStalePort },',
        '      { "timeout1IsRefused", timeoutFirstWithActive.IsConnectionRefused },',
        '      { "timeout1IsTimeout", timeoutFirstWithActive.IsTransientTimeout },',
        '      { "timeout1Consecutive", timeoutFirstWithActive.ConsecutiveFailures },',
        '      { "timeout1IsStale", timeoutFirstWithActive.IsStalePort },',
        '      { "timeout2IsRefused", timeoutSecondWithActive.IsConnectionRefused },',
        '      { "timeout2IsTimeout", timeoutSecondWithActive.IsTransientTimeout },',
        '      { "timeout2Consecutive", timeoutSecondWithActive.ConsecutiveFailures },',
        '      { "timeout2IsStale", timeoutSecondWithActive.IsStalePort },',
        '      { "timeoutNoActiveIsTimeout", timeoutWithoutActive.IsTransientTimeout },',
        '      { "timeoutNoActiveIsStale", timeoutWithoutActive.IsStalePort }',
        '    };',
        '    Console.Write(MiniJson.Stringify(obj, false));',
        '  }',
        '}',
      ].join('\n'),
      'utf8'
    );

    execFileSync(
      csc,
      [
        '/nologo',
        '/utf8output',
        '/codepage:65001',
        '/target:exe',
        `/out:${probeExe}`,
        '/r:System.dll',
        '/r:System.Core.dll',
        '/r:System.Net.Http.dll',
        path.join(ROOT_DIR, 'installer', 'common', 'MiniJson.cs'),
        path.join(ROOT_DIR, 'installer', 'common', 'CdpClient.cs'),
        probeCs,
      ],
      { stdio: 'pipe' }
    );

    const out = await execFileAsync(probeExe, [String(deadPort), String(hangPort), blockedDirFile], {
      encoding: 'utf8',
    });
    const res = JSON.parse(out);

    // 1) 内存级去重兜底验证
    assert.equal(res.beforeRecord, false, 'Unseen hostKey must return false before record');
    assert.equal(res.afterRecordExact, true, 'Memory HashSet<string> must remember hostKey even when disk write fails');
    assert.equal(res.afterRecordJitter, true, 'Memory hostKey check must tolerate <=15s startTime jitter');
    assert.equal(res.differentPid, false, 'Different PID must not be muted');
    assert.equal(res.reusedPidLaterStart, false, 'Reused PID with shifted startTime (>15s) must not be muted');

    // 2) ACCESS_DENIED 与无窗快速跳过 PowerShell 重试验证
    assert.equal(res.selfDenied, false);
    assert.equal(res.selfCmdNonEmpty, true);
    if (res.deniedPid > 0) {
      assert.equal(res.deniedQueryFlag, true, 'ACCESS_DENIED process must report accessDenied=true');
      assert.equal(res.deniedCmdEmpty, true);
      assert.ok(
        res.deniedElapsedMs >= 0 && res.deniedElapsedMs < 1000,
        `ACCESS_DENIED query must skip PowerShell immediately (<1000ms), got ${res.deniedElapsedMs}ms`
      );
    }
    assert.equal(res.noWinCmdEmpty, true);
    assert.ok(
      res.noWinElapsedMs >= 0 && res.noWinElapsedMs < 500,
      `Windowless / missing PID query must skip PowerShell (<500ms), got ${res.noWinElapsedMs}ms`
    );

    // 3) 探活区分 ConnectionRefused 与连续 2 次瞬态超时判死
    assert.equal(res.refusedIsRefused, true, 'Closed port must be classified as IsConnectionRefused=true');
    assert.equal(res.refusedIsTimeout, false);
    assert.equal(res.refusedIsStale, true, 'ConnectionRefused must mark IsStalePort=true immediately even with active session');

    assert.equal(res.timeout1IsRefused, false);
    assert.equal(res.timeout1IsTimeout, true, 'Hanging port must be classified as IsTransientTimeout=true');
    assert.equal(res.timeout1Consecutive, 1);
    assert.equal(res.timeout1IsStale, false, 'First transient timeout with active attached session must NOT mark IsStalePort=true');

    assert.equal(res.timeout2IsRefused, false);
    assert.equal(res.timeout2IsTimeout, true);
    assert.equal(res.timeout2Consecutive, 2);
    assert.equal(res.timeout2IsStale, true, 'Second consecutive timeout with active session must mark IsStalePort=true');

    assert.equal(res.timeoutNoActiveIsTimeout, true);
    assert.equal(res.timeoutNoActiveIsStale, true, 'Timeout without active attached session must mark IsStalePort=true');

    // 4) 源码防误判与 Watcher 循环联动契约
    const cdpClientSrc = fs.readFileSync(path.join(ROOT_DIR, 'installer', 'common', 'CdpClient.cs'), 'utf8');
    const watcherProgSrc = fs.readFileSync(path.join(ROOT_DIR, 'installer', 'watcher', 'Program.cs'), 'utf8');
    assert.ok(
      cdpClientSrc.includes('if (!accessDenied && windowFallbackCandidate == null && hasMainWindow)'),
      'FindBareAntigravityMainProcess must never activate windowFallbackCandidate on ACCESS_DENIED'
    );
    assert.ok(
      watcherProgSrc.includes('HashSet<string> promptedHostKeysInProcess'),
      'Windows Watcher loop must maintain in-memory HashSet<string> fallback for prompted hostKeys'
    );
    assert.ok(
      watcherProgSrc.includes('ProbeActivePortAsync(overridePort, hasActiveAttached, consecutiveProbeFailures)'),
      'Windows Watcher loop must pass active-session & consecutive-failure context to ProbeActivePortAsync'
    );
    assert.ok(
      watcherProgSrc.includes('!isTransientProbeGrace'),
      'Windows Watcher must suppress bare-host prompt during single transient probe timeout grace'
    );
  } finally {
    for (const s of openSockets) {
      try { s.destroy(); } catch {}
    }
    await new Promise((resolve) => hangingServer.close(resolve));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('#229 [P1-6] (macOS Swift): 进程内 Set<String> 去重兜底与写盘前清理悬空软链(lstat/unlink)', () => {
  const watcherSwift = fs.readFileSync(
    path.join(ROOT_DIR, 'installer', 'macos', 'Watcher', 'main.swift'),
    'utf8'
  );
  assert.equal(watcherSwift.includes('\r\n'), false, 'main.swift must remain pure LF');
  assert.equal(watcherSwift.startsWith('\uFEFF'), false, 'main.swift must not have UTF-8 BOM');

  // 1) 进程内 Set<String> 去重兜底
  assert.ok(watcherSwift.includes('private var promptedHostKeys: Set<String> = []'), 'macOS Watcher must keep in-memory Set<String> of prompted hostKeys');
  assert.ok(watcherSwift.includes('if isPromptedInMemory(pid: bare.pid, startTimeMs: bare.startTimeMs, hostVersion: hostVersion)'), 'hasPromptedForHostWithVersion must check in-memory Set<String> first');
  assert.ok(watcherSwift.includes('rememberPromptedInMemory(pid: bare.pid, startTimeMs: bare.startTimeMs, hostVersion: hostVersion)'), 'recordPromptedForHostWithVersion must record into in-memory Set<String> before disk write');

  // 2) 写盘前无条件清理旧路径（含 lstat 存在但目标失效的悬空软链），不再依赖 fm.fileExists 门控
  assert.ok(watcherSwift.includes('if lstat(path, stPtr) == 0'), 'macOS Watcher must check lstat to remove dangling symlinks');
  assert.ok(watcherSwift.includes('_ = unlink(path)'), 'macOS Watcher must unlink dangling symlinks before atomic move/rename');
  assert.ok(watcherSwift.includes('removePathIncludingDanglingSymlink(statePath)'), 'recordPromptedForHostWithVersion must unconditionally remove old path/dangling symlink before atomic write');
  assert.equal(
    /if\s+fm\.fileExists\(atPath:\s*statePath\)\s*\{\s*try\?\s*fm\.removeItem\(atPath:\s*statePath\)\s*\}/.test(watcherSwift),
    false,
    'recordPromptedForHostWithVersion must NOT gate statePath removal behind fm.fileExists (fails on dangling symlink)'
  );
  assert.ok(watcherSwift.includes('try? fm.removeItem(atPath: tmpPath)'), 'Failed atomic write must clean up leftover tmpPath');
});

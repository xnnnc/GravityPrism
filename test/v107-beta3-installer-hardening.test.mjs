import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildInstaller } from '../scripts/build-installer.mjs';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const cliInstaller = require(path.join(ROOT_DIR, 'tools', 'install-plugin.cjs'));

function findCsc() {
  const winDir = process.env.WINDIR || 'C:\\Windows';
  return [
    path.join(winDir, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
    path.join(winDir, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'),
  ].find((p) => fs.existsSync(p));
}

function runExeAllowFail(exePath, args, timeoutMs = 25000, customEnv = null) {
  return new Promise((resolve, reject) => {
    const child = spawn(exePath, args, {
      stdio: 'ignore',
      windowsHide: true,
      env: customEnv || process.env,
    });
    const timer = setTimeout(() => {
      try { child.kill(); } catch {}
      reject(new Error(`Timeout running ${path.basename(exePath)} ${args.join(' ')}`));
    }, timeoutMs);
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ code });
    });
  });
}

test('all hardened installer source files use pure LF and UTF-8 without BOM', () => {
  const files = [
    path.join(ROOT_DIR, 'installer', 'setup', 'Program.cs'),
    path.join(ROOT_DIR, 'installer', 'common', 'CdpClient.cs'),
    path.join(ROOT_DIR, 'installer', 'watcher', 'Program.cs'),
    path.join(ROOT_DIR, 'installer', 'macos', 'Setup', 'main.swift'),
    path.join(ROOT_DIR, 'installer', 'macos', 'Common', 'CdpClient.swift'),
    path.join(ROOT_DIR, 'tools', 'install-plugin.cjs'),
  ];
  for (const fp of files) {
    const buf = fs.readFileSync(fp);
    assert.equal(
      buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf,
      false,
      `${path.basename(fp)} must not contain UTF-8 BOM`
    );
    const txt = buf.toString('utf8');
    assert.equal(txt.includes('\r\n'), false, `${path.basename(fp)} must use pure LF line endings`);
  }
});

test(
  'Windows C# ReparsePoint tag classifier allows WOF/OneDrive/Dedup non-redirect tags while strictly blocking Symlink/Junction/unknown tags (Fail-Closed)',
  { skip: process.platform !== 'win32' ? 'Windows-only NTFS ReparsePoint probe' : false },
  () => {
    const csc = findCsc();
    assert.ok(csc, 'Expected .NET Framework csc.exe on Windows');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-prism-reparse-probe-'));
    try {
      const probeCs = path.join(tmpDir, 'ReparseProbe.cs');
      const probeExe = path.join(tmpDir, 'reparse-probe.exe');
      const realDir = path.join(tmpDir, 'real-dir');
      const junctionDir = path.join(tmpDir, 'junction-dir');
      fs.mkdirSync(realDir, { recursive: true });
      execFileSync('cmd.exe', ['/c', 'mklink', '/J', junctionDir, realDir], { stdio: 'ignore' });

      fs.writeFileSync(
        probeCs,
        [
          'using System;',
          'using System.Collections.Generic;',
          'using AgyClaudeStyle;',
          'class ReparseProbe {',
          '  static void Main(string[] args) {',
          '    uint jTag;',
          '    bool jUnsafe = CdpHelper.IsUnsafeReparsePoint(args[0], out jTag);',
          '    uint rTag;',
          '    bool rUnsafe = CdpHelper.IsUnsafeReparsePoint(args[1], out rTag);',
          '    var res = new Dictionary<string, object>(StringComparer.Ordinal) {',
          '      { "wofSafe", CdpHelper.IsSafeNonRedirectReparseTag(0x80000017u) },',
          '      { "dedupSafe", CdpHelper.IsSafeNonRedirectReparseTag(0x80000013u) },',
          '      { "onedriveSafe", CdpHelper.IsSafeNonRedirectReparseTag(0x80000021u) },',
          '      { "cloud0Safe", CdpHelper.IsSafeNonRedirectReparseTag(0x9000001Au) },',
          '      { "cloudFSafe", CdpHelper.IsSafeNonRedirectReparseTag(0x9000F01Au) },',
          '      { "symlinkSafe", CdpHelper.IsSafeNonRedirectReparseTag(0xA000000Cu) },',
          '      { "mountSafe", CdpHelper.IsSafeNonRedirectReparseTag(0xA0000003u) },',
          '      { "lxSymlinkSafe", CdpHelper.IsSafeNonRedirectReparseTag(0xA000001Du) },',
          '      { "appExecSafe", CdpHelper.IsSafeNonRedirectReparseTag(0x8000001Bu) },',
          '      { "unknownSafe", CdpHelper.IsSafeNonRedirectReparseTag(0xDEADBEEFu) },',
          '      { "zeroSafe", CdpHelper.IsSafeNonRedirectReparseTag(0u) },',
          '      { "junctionUnsafe", jUnsafe },',
          '      { "junctionDesc", CdpHelper.DescribeReparseTag(jTag) },',
          '      { "realUnsafe", rUnsafe }',
          '    };',
          '    Console.Write(MiniJson.Stringify(res, false));',
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

      const out = JSON.parse(execFileSync(probeExe, [junctionDir, realDir], { encoding: 'utf8' }));
      assert.equal(out.wofSafe, true, 'WOF CompactOS tag must be allowed');
      assert.equal(out.dedupSafe, true, 'NTFS Dedup tag must be allowed');
      assert.equal(out.onedriveSafe, true, 'Legacy OneDrive tag must be allowed');
      assert.equal(out.cloud0Safe, true, 'Cloud Filter base tag must be allowed');
      assert.equal(out.cloudFSafe, true, 'Cloud Filter F tag must be allowed');

      assert.equal(out.symlinkSafe, false, 'Symlink tag must be blocked');
      assert.equal(out.mountSafe, false, 'Junction/MountPoint tag must be blocked');
      assert.equal(out.lxSymlinkSafe, false, 'WSL symlink tag must be blocked');
      assert.equal(out.appExecSafe, false, 'AppExecLink tag must be blocked');
      assert.equal(out.unknownSafe, false, 'Unknown reparse tag must Fail-Closed');
      assert.equal(out.zeroSafe, false, 'Zero reparse tag must Fail-Closed');

      assert.equal(out.junctionUnsafe, true, 'Real NTFS junction must be rejected as unsafe');
      assert.ok(out.junctionDesc.includes('0xA0000003'), `Expected Junction tag in description, got: ${out.junctionDesc}`);
      assert.equal(out.realUnsafe, false, 'Normal directory must be allowed');
    } finally {
      try { execFileSync('cmd.exe', ['/c', 'rmdir', path.join(tmpDir, 'junction-dir')], { stdio: 'ignore' }); } catch {}
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
);

test(
  'Windows installer.exe handles read-only/hidden files, shared-read locked main.mjs, legacy antigravity-prism cleanup, read-only & locked shortcuts, and structured junction error reporting',
  { skip: process.platform !== 'win32' ? 'Windows-only installer.exe hardening E2E' : false },
  async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-prism-win-harden-'));
    const installerExe = path.join(workDir, 'installer.exe');
    const installDir = path.join(workDir, 'installed');
    const cfgDir = path.join(workDir, '.gemini', 'config');
    const pluginsRoot = path.join(cfgDir, 'plugins');
    const pluginDir = path.join(pluginsRoot, 'obsidian-prism');
    const legacyDir = path.join(pluginsRoot, 'antigravity-prism');
    const shortcutDir = path.join(workDir, 'shortcuts');
    const fakeBinDir = path.join(workDir, 'fake-bin');
    const outInstall = path.join(workDir, 'install.json');
    const outJunctionErr = path.join(workDir, 'junction-err.json');
    let readerLockChild = null;
    let lockedLnkHolder = null;

    try {
      buildInstaller({ outputPath: installerExe });

      // 1) Prepare pre-existing read-only + hidden files and legacy sibling directory
      fs.mkdirSync(installDir, { recursive: true });
      fs.mkdirSync(path.join(pluginDir, 'sidecars', 'daemon'), { recursive: true });
      fs.mkdirSync(legacyDir, { recursive: true });
      fs.mkdirSync(shortcutDir, { recursive: true });
      fs.mkdirSync(fakeBinDir, { recursive: true });

      const roStyle = path.join(installDir, 'style.css');
      const roWatcher = path.join(installDir, 'obsidian-prism-watcher.exe');
      const roMainMjs = path.join(pluginDir, 'sidecars', 'daemon', 'main.mjs');
      const roPluginJson = path.join(pluginDir, 'plugin.json');
      const roWatchPid = path.join(installDir, '.watch.pid');
      const legacyCfg = path.join(legacyDir, 'config.json');

      fs.writeFileSync(roStyle, '/* stale readonly hidden css */', 'utf8');
      fs.writeFileSync(roWatcher, 'stale-watcher-stub', 'utf8');
      fs.writeFileSync(roMainMjs, '// stale readonly main.mjs', 'utf8');
      fs.writeFileSync(roPluginJson, '{"stale":true}', 'utf8');
      fs.writeFileSync(roWatchPid, '999999', 'utf8');
      fs.writeFileSync(legacyCfg, JSON.stringify({ palette: 'warm', motionLevel: 'subtle' }), 'utf8');

      // Mark existing targets ReadOnly + Hidden (bare FileMode.Create throws UnauthorizedAccessException on Windows!)
      for (const fp of [roStyle, roWatcher, roMainMjs, roPluginJson, roWatchPid]) {
        execFileSync('attrib.exe', ['+R', '+H', fp], { stdio: 'ignore' });
      }

      // Hold a shared-read handle on main.mjs simulating a live Antigravity v2.34 sidecar reading it
      const lockReadyFile = path.join(workDir, 'lock.ready');
      readerLockChild = spawn(
        process.execPath,
        [
          '-e',
          `const fs = require('node:fs'); const fd = fs.openSync(process.argv[1], 'r'); fs.writeFileSync(process.argv[2], 'ok'); setInterval(() => {}, 1000);`,
          roMainMjs,
          lockReadyFile,
        ],
        { stdio: 'ignore', windowsHide: true }
      );
      const waitDeadline = Date.now() + 4000;
      while (!fs.existsSync(lockReadyFile) && Date.now() < waitDeadline) {
        await new Promise((r) => setTimeout(r, 40));
      }
      assert.equal(fs.existsSync(lockReadyFile), true, 'reader lock helper must be holding main.mjs');

      // Prepare 2 Antigravity shortcuts: one ReadOnly (should be cleared & patched), one write-locked (must be skipped non-fatally)
      const fakeAgExe = path.join(fakeBinDir, 'Antigravity.exe');
      fs.writeFileSync(fakeAgExe, 'stub', 'utf8');
      const roLnk = path.join(shortcutDir, 'Antigravity-RO.lnk');
      const lockedLnk = path.join(shortcutDir, 'Antigravity-Locked.lnk');
      const mkLnksPs = [
        '$sh = New-Object -ComObject WScript.Shell;',
        '$s1 = $sh.CreateShortcut($env:LNK1); $s1.TargetPath = $env:AG_EXE; $s1.Arguments = ""; $s1.Save();',
        '$s2 = $sh.CreateShortcut($env:LNK2); $s2.TargetPath = $env:AG_EXE; $s2.Arguments = ""; $s2.Save();',
      ].join(' ');
      execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', mkLnksPs], {
        env: { ...process.env, LNK1: roLnk, LNK2: lockedLnk, AG_EXE: fakeAgExe },
      });
      execFileSync('attrib.exe', ['+R', roLnk], { stdio: 'ignore' });

      // Hold read-shared lock on lockedLnk (readable TargetPath, refuses Save()) to simulate a protected ProgramData shortcut
      const lnkLockReady = path.join(workDir, 'lnklock.ready');
      lockedLnkHolder = spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          '$fs = [System.IO.File]::Open($env:LOCK_LNK, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read); Set-Content -Path $env:READY_FILE -Value "1"; Start-Sleep -Seconds 30; $fs.Close()',
        ],
        {
          stdio: 'ignore',
          windowsHide: true,
          env: { ...process.env, LOCK_LNK: lockedLnk, READY_FILE: lnkLockReady },
        }
      );
      const lnkDeadline = Date.now() + 5000;
      while (!fs.existsSync(lnkLockReady) && Date.now() < lnkDeadline) {
        await new Promise((r) => setTimeout(r, 50));
      }
      assert.equal(fs.existsSync(lnkLockReady), true, 'locked shortcut holder must be active');

      const testEnv = {
        ...process.env,
        APPDATA: path.join(workDir, 'appdata'),
        AG_PRISM_GEMINI_CONFIG_DIR: cfgDir,
        AG_PRISM_SHORTCUT_DIRS: shortcutDir,
        PRISM_NO_RELAUNCH_PROMPT: '1',
      };
      delete testEnv.NODE_ENV;

      const installRun = await runExeAllowFail(
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
        25000,
        testEnv
      );
      assert.equal(installRun.code, 0, 'installer.exe must succeed despite read-only/hidden files, shared-read lock, and locked shortcut');

      const res = JSON.parse(fs.readFileSync(outInstall, 'utf8'));
      assert.equal(res.ok, true);
      assert.equal(res.nativePluginDeployed, true);
      assert.equal(res.patchedShortcuts, 1, 'Read-only Antigravity-RO.lnk must be cleared and patched');
      assert.equal(res.skippedShortcuts, 1, 'Protected/locked Antigravity-Locked.lnk must be skipped non-fatally');
      assert.ok(Array.isArray(res.warnings) && res.warnings.length >= 1, 'Skipped shortcut warning must be recorded');

      // Verify read-only/hidden/locked files were actually overwritten with real payload
      assert.ok(fs.readFileSync(roStyle, 'utf8').length > 200, 'ReadOnly+Hidden style.css must be updated');
      assert.ok(fs.statSync(roWatcher).size > 20 * 1024, 'ReadOnly+Hidden watcher.exe must be updated');
      assert.ok(fs.readFileSync(roMainMjs, 'utf8').includes('PrismDaemon'), 'Shared-read locked main.mjs must be updated');
      assert.equal(JSON.parse(fs.readFileSync(roPluginJson, 'utf8')).name, 'obsidian-prism');

      // Verify legacy antigravity-prism sibling was cleaned & config migrated
      assert.equal(fs.existsSync(legacyDir), false, 'Legacy antigravity-prism sibling must be cleaned');
      assert.equal(JSON.parse(fs.readFileSync(path.join(installDir, 'config.json'), 'utf8')).palette, 'warm');

      // Verify no stale .tmp.* files remain
      const leftTmps = fs.readdirSync(installDir).filter((n) => n.includes('.tmp.'));
      assert.deepEqual(leftTmps, [], 'No stale .tmp.* files should remain in installDir');

      // Verify read-only shortcut now has --remote-debugging-port=0
      const roArgs = execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          '$sh = New-Object -ComObject WScript.Shell; Write-Output ($sh.CreateShortcut($env:TEST_LNK).Arguments)',
        ],
        { encoding: 'utf8', env: { ...process.env, TEST_LNK: roLnk } }
      ).trim();
      assert.equal(roArgs, '--remote-debugging-port=0');

      // 2) Verify real NTFS Junction pluginDir is strictly refused with structured diagnostics
      const victimDir = path.join(workDir, 'victim-dir');
      const evilInstallDir = path.join(workDir, 'evil-inst');
      const evilPluginJunction = path.join(workDir, 'evil-plugin-junction');
      fs.mkdirSync(victimDir, { recursive: true });
      execFileSync('cmd.exe', ['/c', 'mklink', '/J', evilPluginJunction, victimDir], { stdio: 'ignore' });

      const jRun = await runExeAllowFail(
        installerExe,
        [
          '--silent',
          '--no-autostart',
          '--no-kill-legacy',
          '--no-native-daemon',
          '--install-dir',
          evilInstallDir,
          '--plugin-dir',
          evilPluginJunction,
          '--out',
          outJunctionErr,
        ],
        20000,
        testEnv
      );
      assert.notEqual(jRun.code, 0, 'Junction pluginDir must be rejected with non-zero exit');
      assert.deepEqual(fs.readdirSync(victimDir), [], 'Junction target victimDir must remain untouched');
      const jErr = JSON.parse(fs.readFileSync(outJunctionErr, 'utf8'));
      assert.equal(jErr.ok, false);
      assert.equal(jErr.failedStep, 'prepare-dirs');
      assert.ok(jErr.error.includes('0xA0000003'), `Error must identify Junction tag, got: ${jErr.error}`);
      assert.ok(jErr.failedPath.toLowerCase().includes('evil-plugin-junction'));
      assert.ok(jErr.errorType.includes('InvalidOperationException'));
      assert.ok(
        /符号链接|目录联接|symlink|junction/i.test(String(jErr.hint || '')),
        `Expected symlink/junction hint, got: ${jErr.hint}`
      );
    } finally {
      if (readerLockChild) {
        try { readerLockChild.kill(); } catch {}
      }
      if (lockedLnkHolder) {
        try { lockedLnkHolder.kill(); } catch {}
      }
      try {
        const wPidFile = path.join(installDir, '.watch.pid');
        if (fs.existsSync(wPidFile)) {
          const wPid = parseInt(fs.readFileSync(wPidFile, 'utf8'), 10);
          if (wPid) process.kill(wPid);
        }
      } catch {}
      try { execFileSync('cmd.exe', ['/c', 'rmdir', path.join(workDir, 'evil-plugin-junction')], { stdio: 'ignore' }); } catch {}
      await new Promise((r) => setTimeout(r, 150));
      try {
        fs.rmSync(workDir, { recursive: true, force: true });
      } catch {}
    }
  }
);

test('tools/install-plugin.cjs overwrites read-only files cleanly, preserves symlink refusal, and reports skipped shortcuts / unsynced registry in summary', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-prism-cli-harden-'));
  try {
    const cfgDir = path.join(tmpDir, '.gemini', 'config');
    const targetDir = path.join(cfgDir, 'plugins', 'obsidian-prism');
    fs.mkdirSync(path.join(targetDir, 'sidecars', 'daemon'), { recursive: true });

    const roPlugin = path.join(targetDir, 'plugin.json');
    const roMain = path.join(targetDir, 'sidecars', 'daemon', 'main.mjs');
    const roPid = path.join(targetDir, '.daemon.pid');
    const roHostCfg = path.join(cfgDir, 'config.json');
    fs.writeFileSync(roPlugin, '{"stale":true}', 'utf8');
    fs.writeFileSync(roMain, '// stale', 'utf8');
    fs.writeFileSync(roPid, JSON.stringify({ pid: 999999 }), 'utf8');
    fs.writeFileSync(roHostCfg, '{}\n', 'utf8');

    for (const fp of [roPlugin, roMain, roPid, roHostCfg]) {
      fs.chmodSync(fp, 0o444);
    }

    const res = await cliInstaller.installPlugin({
      sourceDir: ROOT_DIR,
      targetDir,
      hostConfigDir: cfgDir,
      startDaemon: false,
      syncShortcuts: false,
    });
    assert.equal(res.ok, true);
    assert.equal(res.registrySynced, true);
    assert.equal(JSON.parse(fs.readFileSync(roPlugin, 'utf8')).name, 'obsidian-prism');
    assert.ok(fs.readFileSync(roMain, 'utf8').includes('PrismDaemon'));
    assert.equal(JSON.parse(fs.readFileSync(roHostCfg, 'utf8')).plugins['obsidian-prism'].enabled, true);

    // Self-check summary surfaces skipped shortcuts and registry warning cleanly
    const summary = cliInstaller.formatInstallSelfCheckSummary({
      ...res,
      registrySynced: false,
      shortcuts: { supported: true, patched: [], alreadySet: [], skipped: ['C:\\ProgramData\\Antigravity.lnk'] },
    });
    assert.ok(summary.includes('权限不足跳过 1 个'));
    assert.ok(summary.includes('config.json'));

    // Symlink targetDir must still be refused (zero security regression)
    const realTarget = path.join(tmpDir, 'real-target');
    const linkTarget = path.join(tmpDir, 'link-target');
    fs.mkdirSync(realTarget, { recursive: true });
    fs.symlinkSync(realTarget, linkTarget, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(
      () =>
        cliInstaller.installPlugin({
          sourceDir: ROOT_DIR,
          targetDir: linkTarget,
          hostConfigDir: cfgDir,
          startDaemon: false,
          syncShortcuts: false,
        }),
      /symbolic link/i
    );
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
});

test('Windows CdpClient and macOS Setup main.swift contain v1.0.7-beta.3 installer hardening contracts', () => {
  const cdpCs = fs.readFileSync(path.join(ROOT_DIR, 'installer', 'common', 'CdpClient.cs'), 'utf8');
  assert.ok(cdpCs.includes('IsSafeNonRedirectReparseTag'), 'CdpClient.cs must distinguish safe WOF/Cloud reparse tags');
  assert.ok(cdpCs.includes('IsUnsafeReparsePoint'), 'CdpClient.cs must expose IsUnsafeReparsePoint');
  assert.ok(cdpCs.includes('ClearReadOnlyAndHiddenAttributes'), 'CdpClient.cs must clear ReadOnly/Hidden before overwrite');
  assert.ok(cdpCs.includes('Google Antigravity'), 'CdpClient.cs must match Google Antigravity uninstall registry entries');
  assert.ok(cdpCs.includes('"--import="'), 'CdpClient.cs FindBareAntigravityMainProcess must exclude --import= sidecars');
  assert.ok(cdpCs.includes('out int skippedCount'), 'CdpClient.cs EnsureAntigravityShortcutsOptIn must report skipped shortcuts');

  const setupCs = fs.readFileSync(path.join(ROOT_DIR, 'installer', 'setup', 'Program.cs'), 'utf8');
  assert.ok(setupCs.includes('class InstallerStepException'), 'Program.cs must carry structured step/path diagnostics');
  assert.ok(setupCs.includes('WriteZipEntryWithRetry'), 'Program.cs must retry locked/readonly ZIP writes');
  assert.ok(setupCs.includes('TryCleanupLegacySiblingPluginDir'), 'Program.cs must clean legacy antigravity-prism sibling');
  assert.ok(setupCs.includes('FormatFailureLogBlock'), 'Program.cs must format clear failure reports');

  const macSwift = fs.readFileSync(path.join(ROOT_DIR, 'installer', 'macos', 'Setup', 'main.swift'), 'utf8');
  assert.ok(macSwift.includes('clearReadOnlyPermissionsNoSymlink'), 'main.swift must clear readonly permissions safely');
  assert.ok(macSwift.includes('copyItemSafelyWithRetry'), 'main.swift must retry locked/readonly copies and block symlinks');
  assert.ok(macSwift.includes('cleanupLegacySiblingPluginDir'), 'main.swift must clean legacy antigravity-prism sibling');
  assert.ok(macSwift.includes('配置 LaunchAgent 登录自启失败（非致命'), 'main.swift must degrade non-fatally when LaunchAgent fails');
  assert.match(
    macSwift,
    /static func runInstall[\s\S]*?isDangerousRootPath\(installDir\)/,
    'main.swift runInstall must guard dangerous root paths'
  );
});

test(
  'Windows C# SyncHostPluginRegistry updates read-only host config.json cleanly and protects symlinked config.json without destroying it',
  { skip: process.platform !== 'win32' ? 'Windows-only C# registry sync probe' : false },
  () => {
    const csc = findCsc();
    assert.ok(csc, 'Expected .NET Framework csc.exe on Windows');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-prism-reg-probe-'));
    try {
      const probeCs = path.join(tmpDir, 'RegProbe.cs');
      const probeExe = path.join(tmpDir, 'reg-probe.exe');

      const roCfgDir = path.join(tmpDir, 'ro-cfg');
      const roPluginDir = path.join(roCfgDir, 'plugins', 'obsidian-prism');
      fs.mkdirSync(roPluginDir, { recursive: true });
      const roCfgPath = path.join(roCfgDir, 'config.json');
      fs.writeFileSync(roCfgPath, '{"plugins":{"other":{"enabled":true}}}\n', 'utf8');
      execFileSync('attrib.exe', ['+R', roCfgPath], { stdio: 'ignore' });

      const symCfgDir = path.join(tmpDir, 'sym-cfg');
      const symPluginDir = path.join(symCfgDir, 'plugins', 'obsidian-prism');
      fs.mkdirSync(symPluginDir, { recursive: true });
      const externalRealCfg = path.join(tmpDir, 'external-real-config.json');
      const symCfgPath = path.join(symCfgDir, 'config.json');
      fs.writeFileSync(externalRealCfg, '{"plugins":{"keep":true}}\n', 'utf8');
      let symlinkReady = false;
      try {
        fs.symlinkSync(externalRealCfg, symCfgPath, 'file');
        symlinkReady = true;
      } catch {}

      fs.writeFileSync(
        probeCs,
        [
          'using System;',
          'using System.Collections.Generic;',
          'using AgyClaudeStyle;',
          'class RegProbe {',
          '  static void Main(string[] args) {',
          '    string r1;',
          '    bool ok1 = CdpHelper.SyncHostPluginRegistry(args[0], true, out r1);',
          '    string r2 = "";',
          '    bool ok2 = false;',
          '    if (args.Length > 1 && !string.IsNullOrEmpty(args[1])) {',
          '      ok2 = CdpHelper.SyncHostPluginRegistry(args[1], true, out r2);',
          '    }',
          '    var res = new Dictionary<string, object>(StringComparer.Ordinal) {',
          '      { "roOk", ok1 },',
          '      { "roReason", r1 ?? "" },',
          '      { "symOk", ok2 },',
          '      { "symReason", r2 ?? "" }',
          '    };',
          '    Console.Write(MiniJson.Stringify(res, false));',
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

      const out = JSON.parse(
        execFileSync(probeExe, symlinkReady ? [roPluginDir, symPluginDir] : [roPluginDir], { encoding: 'utf8' })
      );
      assert.equal(out.roOk, true, `Read-only host config.json must be synced cleanly, reason: ${out.roReason}`);
      const roParsed = JSON.parse(fs.readFileSync(roCfgPath, 'utf8'));
      assert.deepEqual(roParsed.plugins['obsidian-prism'], { enabled: true });
      assert.deepEqual(roParsed.plugins.other, { enabled: true });

      if (symlinkReady) {
        assert.equal(out.symOk, false, 'Symlinked host config.json must be refused without overwriting');
        assert.ok(out.symReason.includes('0xA000000C'), `Expected Symlink tag in reason, got: ${out.symReason}`);
        assert.equal(fs.lstatSync(symCfgPath).isSymbolicLink(), true, 'Original config.json symlink must remain intact');
        assert.deepEqual(JSON.parse(fs.readFileSync(externalRealCfg, 'utf8')), { plugins: { keep: true } });
      }
    } finally {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    }
  }
);

test('tools/install-plugin.cjs enforces POSIX least-privilege chmod, COPYFILE_EXCL, and thought-cache symlink guard', () => {
  const src = fs.readFileSync(path.join(ROOT_DIR, 'tools', 'install-plugin.cjs'), 'utf8');
  assert.ok(src.includes('process.platform === "win32"'), 'clearReadOnlyIfRegularFile must branch on win32 vs POSIX');
  assert.ok(src.includes('(st.mode & 0o200) === 0'), 'POSIX clearReadOnlyIfRegularFile must only add owner write bit when missing');
  assert.ok(src.includes('(st.mode & 0o777) | 0o200'), 'POSIX clearReadOnlyIfRegularFile must preserve existing bits without making files world-writable');
  assert.ok(src.includes('fs.constants.COPYFILE_EXCL'), 'safeCopyFileNoSymlink fallback tmp copy must use COPYFILE_EXCL');
  assert.match(
    src,
    /obsidian-prism-thought-cache\.json[\s\S]{0,180}assertNotSymbolicLink/,
    'syncHostPluginRegistry must verify thought-cache is not a symlink before unlink'
  );

  // Exercise POSIX branch logic directly even when running on Windows
  const origPlatformDesc = Object.getOwnPropertyDescriptor(process, 'platform');
  const origLstat = fs.lstatSync;
  const origChmod = fs.chmodSync;
  const chmodCalls = [];
  let fakeMode = 0o100400;
  try {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    fs.lstatSync = () => ({ isSymbolicLink: () => false, isFile: () => true, mode: fakeMode });
    fs.chmodSync = (p, m) => {
      chmodCalls.push({ p, m });
    };

    // 0o400 -> 0o600 (never 0o666!)
    cliInstaller.clearReadOnlyIfRegularFile('/fake/secret-config.json', 'config');
    assert.deepEqual(chmodCalls, [{ p: '/fake/secret-config.json', m: 0o600 }]);

    // 0o444 -> 0o644 (never 0o666!)
    chmodCalls.length = 0;
    fakeMode = 0o100444;
    cliInstaller.clearReadOnlyIfRegularFile('/fake/plugin.js', 'plugin');
    assert.deepEqual(chmodCalls, [{ p: '/fake/plugin.js', m: 0o644 }]);

    // 0o600 already owner-writable -> no chmodSync call at all
    chmodCalls.length = 0;
    fakeMode = 0o100600;
    cliInstaller.clearReadOnlyIfRegularFile('/fake/already-writable.json', 'config');
    assert.deepEqual(chmodCalls, []);
  } finally {
    fs.lstatSync = origLstat;
    fs.chmodSync = origChmod;
    if (origPlatformDesc) {
      Object.defineProperty(process, 'platform', origPlatformDesc);
    }
  }

  // Runtime test: syncHostPluginRegistry(disable) refuses deleting symlinked obsidian-prism-thought-cache.json
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-prism-cli-cache-sym-'));
  try {
    const cfgDir = path.join(tmpDir, '.gemini', 'config');
    fs.mkdirSync(cfgDir, { recursive: true });
    const victimFile = path.join(tmpDir, 'victim-secret.txt');
    fs.writeFileSync(victimFile, 'DO_NOT_DELETE', 'utf8');
    const cacheLink = path.join(cfgDir, 'obsidian-prism-thought-cache.json');
    let linkCreated = false;
    try {
      fs.symlinkSync(victimFile, cacheLink, 'file');
      linkCreated = true;
    } catch {}
    if (linkCreated) {
      const ok = cliInstaller.syncHostPluginRegistry(cfgDir, false);
      assert.equal(ok, false, 'syncHostPluginRegistry(disable) must refuse symlinked thought cache');
      assert.equal(fs.lstatSync(cacheLink).isSymbolicLink(), true, 'Symlink must remain untouched');
      assert.equal(fs.readFileSync(victimFile, 'utf8'), 'DO_NOT_DELETE');
    }
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
});

test('macOS CdpClient.swift, macOS Setup main.swift, and Windows watcher/setup contain R2 red-team hardening contracts', () => {
  const macCdp = fs.readFileSync(path.join(ROOT_DIR, 'installer', 'macos', 'Common', 'CdpClient.swift'), 'utf8');
  assert.ok(macCdp.includes('lstat(path, &st)'), 'CdpClient.swift must use lstat for Fail-Closed symlink checks');
  assert.ok(macCdp.includes('errno != ENOENT'), 'CdpClient.swift must Fail-Closed on non-ENOENT lstat errors');
  assert.ok(macCdp.includes('hasSymbolicLinkInHostConfigChain'), 'CdpClient.swift must validate ~/.gemini -> cfgDir ancestor chain');
  assert.ok(macCdp.includes('O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW'), 'CdpClient.swift must create tmp files with O_CREAT|O_EXCL|O_NOFOLLOW');
  assert.ok(macCdp.includes('mode_t(0o600)'), 'CdpClient.swift must create tmp files with 0o600 permissions');
  assert.ok(macCdp.includes('UUID().uuidString'), 'CdpClient.swift must use unique unpredictable tmp filename');
  assert.ok(macCdp.includes('errno == EINTR'), 'CdpClient.swift write loop must handle EINTR');
  assert.ok(macCdp.includes('unlink(tmpPath)'), 'CdpClient.swift must unlink tmpPath on failure');
  assert.equal(macCdp.includes('let tmpPath = path + ".tmp"'), false, 'CdpClient.swift must not use predictable .tmp filename');
  assert.equal(
    macCdp.includes('content.write(toFile: path'),
    false,
    'CdpClient.swift must never fall back to overwriting path in-place when rename fails'
  );
  assert.match(
    macCdp,
    /obsidian-prism-thought-cache\.json[\s\S]{0,160}isSymbolicLinkOrUnsafePath/,
    'CdpClient.swift must check thought-cache symlink before removal'
  );

  const macMain = fs.readFileSync(path.join(ROOT_DIR, 'installer', 'macos', 'Setup', 'main.swift'), 'utf8');
  assert.ok(macMain.includes('getppid()'), 'main.swift must exclude getppid() when stopping orphan daemons');
  assert.ok(macMain.includes('extractExecutableBasename'), 'main.swift must verify argv[0]/comm basename whitelist');
  assert.ok(macMain.includes('"antigravity helper (plugin)"'), 'main.swift basename whitelist must cover Antigravity Helper (Plugin)');
  assert.ok(macMain.includes('base + "/sidecars/daemon/main.mjs"'), 'main.swift must match exact combined plugin entry paths');
  assert.ok(macMain.includes('cmd.contains("--root ") || cmd.contains("sidecar_sdk") || cmd.contains("--import=")'), 'main.swift must require daemon features for Antigravity main binary');
  assert.ok(macMain.includes('hasSymbolicLinkInChain(installDir, stopRoot:'), 'main.swift runInstall must check installDir ancestor chain');
  assert.ok(macMain.includes('hasSymbolicLinkInChain(pluginDir, stopRoot:'), 'main.swift runInstall must check pluginDir ancestor chain');
  assert.ok(macMain.includes('_ = fputs('), 'main.swift must discard fputs return value to avoid Swift compiler warning');
  assert.equal(/(?<!_ = )fputs\(/.test(macMain), false, 'main.swift must not have bare fputs() calls');
  assert.match(
    macMain,
    /func copyItemSafelyWithRetry[\s\S]*?\.tmp\.\\\(getpid\(\)\)\.[\s\S]*?\.old\.\\\(getpid\(\)\)\./,
    'main.swift copyItemSafelyWithRetry must copy to unique tmp path first and roll back on replacement failure'
  );

  const watcherCs = fs.readFileSync(path.join(ROOT_DIR, 'installer', 'watcher', 'Program.cs'), 'utf8');
  assert.ok(watcherCs.includes('IsUnsafeReparsePoint(_pidFile)'), 'watcher Program.cs must guard _pidFile against unsafe reparse points');
  assert.ok(watcherCs.includes('IsUnsafeReparsePoint(_logFile)'), 'watcher Program.cs must guard _logFile against unsafe reparse points');

  const setupCs = fs.readFileSync(path.join(ROOT_DIR, 'installer', 'setup', 'Program.cs'), 'utf8');
  assert.ok(setupCs.includes('bool movedToOld = false;'), 'setup Program.cs must track movedToOld for PE rollback');
  assert.ok(setupCs.includes('File.Move(staleOld, destPath)'), 'setup Program.cs must roll back staleOld when stage-2 PE replacement fails');
  assert.ok(setupCs.includes('QuotePathArgumentStrict'), 'setup Program.cs must validate and quote custom path arguments');
  assert.ok(setupCs.includes('depth > 8'), 'setup Program.cs CleanupStaleOldFiles must recurse safely with max depth 8');

  const cdpCs = fs.readFileSync(path.join(ROOT_DIR, 'installer', 'common', 'CdpClient.cs'), 'utf8');
  assert.ok(cdpCs.includes('ERROR_FILE_NOT_FOUND'), 'CdpClient.cs IsUnsafeReparsePoint must check Win32 ERROR_FILE_NOT_FOUND');
  assert.ok(cdpCs.includes('ERROR_PATH_NOT_FOUND'), 'CdpClient.cs IsUnsafeReparsePoint must check Win32 ERROR_PATH_NOT_FOUND');
  assert.ok(cdpCs.includes('HasUnsafeReparsePointInChain'), 'CdpClient.cs must verify ~/.gemini -> cfgDir ancestor chain');
});

test(
  'Windows C# R2 security probe verifies Fail-Closed IsUnsafeReparsePoint (wildcards/dangling/long-path/ancestor-chain), exact orphan daemon matching, strict path quoting, CopyFileWithRetry symlink throw, and recursive CleanupStaleOldFiles',
  { skip: process.platform !== 'win32' ? 'Windows-only C# R2 security probe' : false },
  () => {
    const csc = findCsc();
    assert.ok(csc, 'Expected .NET Framework csc.exe on Windows');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-prism-r2-sec-probe-'));
    const cleanupJunctions = [];
    try {
      const probeCs = path.join(tmpDir, 'R2SecProbe.cs');
      const probeExe = path.join(tmpDir, 'r2-sec-probe.exe');

      // 1) Dangling/broken NTFS junction (target deleted after mklink /J)
      const doomedTarget = path.join(tmpDir, 'doomed-target');
      const brokenJunction = path.join(tmpDir, 'broken-junction');
      fs.mkdirSync(doomedTarget, { recursive: true });
      execFileSync('cmd.exe', ['/c', 'mklink', '/J', brokenJunction, doomedTarget], { stdio: 'ignore' });
      cleanupJunctions.push(brokenJunction);
      fs.rmdirSync(doomedTarget);

      // 2) Long path >= 248 chars normal file
      let longDir = tmpDir;
      for (let i = 0; i < 8; i++) {
        longDir = path.join(longDir, `seg_${i}_0123456789abcdef0123456789`);
      }
      const extLongDir = `\\\\?\\${longDir}`;
      fs.mkdirSync(extLongDir, { recursive: true });
      const longFile = path.join(longDir, 'normal-file.txt');
      fs.writeFileSync(`\\\\?\\${longFile}`, 'ok', 'utf8');
      assert.ok(longFile.length >= 248, `Expected longFile length >= 248, got ${longFile.length}`);

      // 3) Ancestor chain junction: tmpDir/chain-test/.gemini -> victimGemini
      const chainRoot = path.join(tmpDir, 'chain-test');
      const victimGemini = path.join(tmpDir, 'victim-gemini');
      const evilGeminiJunction = path.join(chainRoot, '.gemini');
      fs.mkdirSync(chainRoot, { recursive: true });
      fs.mkdirSync(victimGemini, { recursive: true });
      execFileSync('cmd.exe', ['/c', 'mklink', '/J', evilGeminiJunction, victimGemini], { stdio: 'ignore' });
      cleanupJunctions.push(evilGeminiJunction);
      const chainPluginDir = path.join(evilGeminiJunction, 'config', 'plugins', 'obsidian-prism');

      // 4) CleanupStaleOldFiles nested tree + external junction protection
      const cleanRoot = path.join(tmpDir, 'clean-root');
      const nestedDir = path.join(cleanRoot, 'sub1', 'sub2');
      const extKeepDir = path.join(tmpDir, 'ext-keep');
      const nestedJunction = path.join(cleanRoot, 'linked-sub');
      fs.mkdirSync(nestedDir, { recursive: true });
      fs.mkdirSync(extKeepDir, { recursive: true });
      const nestedOldFile = path.join(nestedDir, 'helper.dll.old.123.1.0');
      const extOldFile = path.join(extKeepDir, 'keep.dll.old.999.1.0');
      fs.writeFileSync(nestedOldFile, 'stale', 'utf8');
      fs.writeFileSync(extOldFile, 'must-keep', 'utf8');
      execFileSync('cmd.exe', ['/c', 'mklink', '/J', nestedJunction, extKeepDir], { stdio: 'ignore' });
      cleanupJunctions.push(nestedJunction);

      // 5) CopyFileWithRetry source/dest junction refusal (must throw InvalidOperationException, not silently return)
      const copySrc = path.join(tmpDir, 'copy-src.txt');
      fs.writeFileSync(copySrc, 'payload', 'utf8');

      fs.writeFileSync(
        probeCs,
        [
          'using System;',
          'using System.Collections.Generic;',
          'using System.IO;',
          'using System.Reflection;',
          'using AgyClaudeStyle;',
          'using AgyClaudeStyle.Installer;',
          'class R2SecProbe {',
          '  static void Main(string[] args) {',
          '    string brokenJ = args[0];',
          '    string longFile = args[1];',
          '    string chainPluginDir = args[2];',
          '    string cleanRoot = args[3];',
          '    string copySrc = args[4];',
          '    string tmpDir = args[5];',
          '',
          '    uint brokenTag;',
          '    bool brokenUnsafe = CdpHelper.IsUnsafeReparsePoint(brokenJ, out brokenTag);',
          '    bool starUnsafe = CdpHelper.IsUnsafeReparsePoint(tmpDir + "\\\\*.json");',
          '    bool qmarkUnsafe = CdpHelper.IsUnsafeReparsePoint(tmpDir + "\\\\a?.json");',
          '    bool invalidNameUnsafe = CdpHelper.IsUnsafeReparsePoint(tmpDir + "\\\\bad|name.json");',
          '    bool driveRootUnsafe = CdpHelper.IsUnsafeReparsePoint(Path.GetPathRoot(tmpDir));',
          '    bool missingUnsafe = CdpHelper.IsUnsafeReparsePoint(Path.Combine(tmpDir, "definitely-missing-xyz.json"));',
          '    bool longNormalUnsafe = CdpHelper.IsUnsafeReparsePoint(longFile);',
          '',
          '    string chainReason;',
          '    bool chainRegOk = CdpHelper.SyncHostPluginRegistry(chainPluginDir, true, out chainReason);',
          '',
          '    string pDir = @"C:\\Users\\Alice\\.gemini\\config\\plugins\\obsidian-prism";',
          '    bool matchNodeExact = InstallerCore.IsExactOrphanDaemonCommand(',
          '      "\\"C:\\\\Program Files\\\\nodejs\\\\node.exe\\" \\"" + pDir + "\\\\sidecars\\\\daemon\\\\main.mjs\\" --root \\"" + pDir + "\\"",',
          '      pDir, false, false);',
          '    bool matchAgDaemon = InstallerCore.IsExactOrphanDaemonCommand(',
          '      "\\"C:\\\\Antigravity.exe\\" --import=file:///sidecar_sdk/register_loader.js \\"" + pDir + "\\\\sidecars\\\\daemon\\\\main.mjs\\"",',
          '      pDir, true, false);',
          '    bool rejectOtherPlugin = InstallerCore.IsExactOrphanDaemonCommand(',
          '      "node.exe \\"C:\\\\other\\\\daemon\\\\main.mjs\\" --dir \\"" + pDir + "\\"",',
          '      pDir, false, false);',
          '    bool rejectAgGui = InstallerCore.IsExactOrphanDaemonCommand(',
          '      "\\"C:\\\\Antigravity.exe\\" \\"" + pDir + "\\\\sidecars\\\\daemon\\\\main.mjs\\"",',
          '      pDir, true, true);',
          '    bool rejectAgNoFeature = InstallerCore.IsExactOrphanDaemonCommand(',
          '      "\\"C:\\\\Antigravity.exe\\" \\"" + pDir + "\\\\sidecars\\\\daemon\\\\main.mjs\\"",',
          '      pDir, true, false);',
          '    bool rejectRenderer = InstallerCore.IsExactOrphanDaemonCommand(',
          '      "\\"C:\\\\Antigravity.exe\\" --type=renderer --root \\"" + pDir + "\\" \\"" + pDir + "\\\\sidecars\\\\daemon\\\\main.mjs\\"",',
          '      pDir, true, false);',
          '    bool rejectSuffixMismatch = InstallerCore.IsExactOrphanDaemonCommand(',
          '      "node.exe \\"" + pDir + "\\\\sidecars\\\\daemon\\\\main.mjs.bak\\"",',
          '      pDir, false, false);',
          '',
          '    string quotedRoot = InstallerCore.QuotePathArgumentStrict(@"C:\\", "--dir");',
          '    bool rejectedQuoteArg = false;',
          '    try { InstallerCore.QuotePathArgumentStrict("C:\\\\evil\\"path", "--dir"); }',
          '    catch (InvalidOperationException) { rejectedQuoteArg = true; }',
          '',
          '    MethodInfo copyMethod = typeof(InstallerCore).GetMethod("CopyFileWithRetry", BindingFlags.NonPublic | BindingFlags.Static);',
          '    bool copyThrewOnJunction = false;',
          '    try { copyMethod.Invoke(null, new object[] { copySrc, brokenJ, true }); }',
          '    catch (TargetInvocationException tie) { copyThrewOnJunction = tie.InnerException is InvalidOperationException; }',
          '',
          '    MethodInfo cleanMethod = typeof(InstallerCore).GetMethod("CleanupStaleOldFiles", BindingFlags.NonPublic | BindingFlags.Static);',
          '    cleanMethod.Invoke(null, new object[] { cleanRoot, 0 });',
          '',
          '    var res = new Dictionary<string, object>(StringComparer.Ordinal) {',
          '      { "brokenUnsafe", brokenUnsafe },',
          '      { "brokenDesc", CdpHelper.DescribeReparseTag(brokenTag) },',
          '      { "starUnsafe", starUnsafe },',
          '      { "qmarkUnsafe", qmarkUnsafe },',
          '      { "invalidNameUnsafe", invalidNameUnsafe },',
          '      { "driveRootUnsafe", driveRootUnsafe },',
          '      { "missingUnsafe", missingUnsafe },',
          '      { "longNormalUnsafe", longNormalUnsafe },',
          '      { "chainRegOk", chainRegOk },',
          '      { "chainReason", chainReason ?? "" },',
          '      { "matchNodeExact", matchNodeExact },',
          '      { "matchAgDaemon", matchAgDaemon },',
          '      { "rejectOtherPlugin", rejectOtherPlugin },',
          '      { "rejectAgGui", rejectAgGui },',
          '      { "rejectAgNoFeature", rejectAgNoFeature },',
          '      { "rejectRenderer", rejectRenderer },',
          '      { "rejectSuffixMismatch", rejectSuffixMismatch },',
          '      { "quotedRoot", quotedRoot },',
          '      { "rejectedQuoteArg", rejectedQuoteArg },',
          '      { "copyThrewOnJunction", copyThrewOnJunction }',
          '    };',
          '    Console.Write(MiniJson.Stringify(res, false));',
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
          '/warnaserror',
          '/target:exe',
          '/main:R2SecProbe',
          `/out:${probeExe}`,
          '/r:System.dll',
          '/r:System.Core.dll',
          '/r:System.Drawing.dll',
          '/r:System.IO.Compression.dll',
          '/r:System.IO.Compression.FileSystem.dll',
          '/r:System.Net.Http.dll',
          '/r:System.Windows.Forms.dll',
          path.join(ROOT_DIR, 'installer', 'common', 'MiniJson.cs'),
          path.join(ROOT_DIR, 'installer', 'common', 'CdpClient.cs'),
          path.join(ROOT_DIR, 'installer', 'setup', 'Program.cs'),
          probeCs,
        ],
        { stdio: 'pipe' }
      );

      const out = JSON.parse(
        execFileSync(probeExe, [brokenJunction, longFile, chainPluginDir, cleanRoot, copySrc, tmpDir], {
          encoding: 'utf8',
          env: { ...process.env, AG_PRISM_GEMINI_CONFIG_DIR: '' },
        })
      );

      assert.equal(out.brokenUnsafe, true, 'Dangling/broken NTFS junction must be rejected');
      assert.ok(out.brokenDesc.includes('0xA0000003'), `Expected Junction tag for broken junction, got: ${out.brokenDesc}`);
      assert.equal(out.starUnsafe, true, 'Wildcard * path must Fail-Closed');
      assert.equal(out.qmarkUnsafe, true, 'Wildcard ? path must Fail-Closed');
      assert.equal(out.invalidNameUnsafe, true, 'Invalid Win32 path error must Fail-Closed');
      assert.equal(out.driveRootUnsafe, false, 'Drive root must not be flagged as unsafe reparse point');
      assert.equal(out.missingUnsafe, false, 'Missing path (ENOENT) must return false');
      assert.equal(out.longNormalUnsafe, false, 'Normal file at >=248 char path must be handled via \\\\?\\ prefix');

      assert.equal(out.chainRegOk, false, 'SyncHostPluginRegistry must reject junction in .gemini ancestor chain');
      assert.ok(out.chainReason.includes('0xA0000003'), `Expected Junction tag in chain reason, got: ${out.chainReason}`);
      assert.deepEqual(fs.readdirSync(victimGemini), [], 'Victim directory behind .gemini junction must remain untouched');

      assert.equal(out.matchNodeExact, true, 'Exact node daemon command must match');
      assert.equal(out.matchAgDaemon, true, 'Headless Antigravity sidecar daemon with --import/sidecar_sdk must match');
      assert.equal(out.rejectOtherPlugin, false, 'Other plugin daemon referencing pluginDir as argument must NOT match');
      assert.equal(out.rejectAgGui, false, 'Antigravity GUI window opening main.mjs must NOT match');
      assert.equal(out.rejectAgNoFeature, false, 'Antigravity main binary without daemon feature must NOT match');
      assert.equal(out.rejectRenderer, false, 'Antigravity --type=renderer must NOT match');
      assert.equal(out.rejectSuffixMismatch, false, 'Suffix mismatch (main.mjs.bak) must NOT match');

      assert.equal(out.quotedRoot, '"C:\\\\"');
      assert.equal(out.rejectedQuoteArg, true, 'QuotePathArgumentStrict must reject paths containing double quotes');
      assert.equal(out.copyThrewOnJunction, true, 'CopyFileWithRetry must throw InvalidOperationException on reparse point rather than silently returning');

      assert.equal(fs.existsSync(nestedOldFile), false, 'CleanupStaleOldFiles must recursively delete nested *.old.* files');
      assert.equal(fs.existsSync(extOldFile), true, 'CleanupStaleOldFiles must skip NTFS junctions and preserve external files');
    } finally {
      for (const j of cleanupJunctions) {
        try { execFileSync('cmd.exe', ['/c', 'rmdir', j], { stdio: 'ignore' }); } catch {}
      }
      try {
        fs.rmSync(`\\\\?\\${tmpDir}`, { recursive: true, force: true });
      } catch {
        try {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {}
      }
    }
  }
);

test('PID reuse & ancestor-chain hardening contracts across Windows C# and macOS Swift installers', () => {
  const cdpCs = fs.readFileSync(path.join(ROOT_DIR, 'installer', 'common', 'CdpClient.cs'), 'utf8');
  assert.ok(
    cdpCs.includes('QueryWindowsProcessCommandLine(proc.Id, false, out accessDenied)'),
    'CdpClient.cs IsExpectedPrismDaemonProcess must inspect PEB command line for node/watcher processes'
  );
  assert.ok(
    cdpCs.includes('name == "obsidian-prism-watcher"'),
    'CdpClient.cs must require exact obsidian-prism-watcher name before bypassing PEB command line check'
  );

  const setupCs = fs.readFileSync(path.join(ROOT_DIR, 'installer', 'setup', 'Program.cs'), 'utf8');
  assert.ok(
    setupCs.includes('AssertNoReparsePointChain(installDir, ResolveInstallChainStopRoot(installDir))'),
    'setup Program.cs must validate installDir ancestor chain up to ResolveInstallChainStopRoot'
  );
  assert.ok(
    setupCs.includes('AssertNoReparsePointChain(pluginDir, ResolveInstallChainStopRoot(pluginDir))'),
    'setup Program.cs must validate pluginDir ancestor chain up to ResolveInstallChainStopRoot'
  );

  const macCdp = fs.readFileSync(path.join(ROOT_DIR, 'installer', 'macos', 'Common', 'CdpClient.swift'), 'utf8');
  assert.ok(
    macCdp.includes('runPsQuery(pid: pid, format: "command=")'),
    'CdpClient.swift isExpectedDaemonProcess must inspect ps command= for node/watcher processes'
  );

  const macMain = fs.readFileSync(path.join(ROOT_DIR, 'installer', 'macos', 'Setup', 'main.swift'), 'utf8');
  assert.match(
    macMain,
    /func stopWatcherInDir[\s\S]*?if !isSymbolicLink\(pidFile\)/,
    'main.swift stopWatcherInDir must guard .watch.pid read/delete with !isSymbolicLink(pidFile)'
  );
  assert.match(
    macMain,
    /func stopWatcherInDir[\s\S]*?matchesExactCommandPath\(/,
    'main.swift stopWatcherInDir must use matchesExactCommandPath for watcher process boundary matching'
  );
});

test(
  'Windows C# IsExpectedPrismDaemonProcess blocks PID reuse on unrelated node.exe and setup rejects ancestor NTFS junction under installDir',
  { skip: process.platform !== 'win32' ? 'Windows-only PID reuse & ancestor junction probe' : false },
  async () => {
    const csc = findCsc();
    assert.ok(csc, 'Expected .NET Framework csc.exe on Windows');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-prism-pid-reuse-'));
    const children = [];
    const junctionPath = path.join(tmpDir, 'ancestor-junction');
    try {
      const fakePluginDir = path.join(tmpDir, 'custom-plugin-dir');
      const unrelatedReady = path.join(tmpDir, 'unrelated.ready');
      const prismReady = path.join(tmpDir, 'prism.ready');

      const waitReady = async (file, proc) => {
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
          if (fs.existsSync(file)) return;
          if (proc.exitCode !== null) throw new Error(`Child exited early with ${proc.exitCode}`);
          await new Promise((r) => setTimeout(r, 15));
        }
        throw new Error(`Timed out waiting for ${file}`);
      };

      const unrelatedNode = spawn(
        process.execPath,
        [
          '-e',
          `require('node:fs').writeFileSync(process.argv[1], '1'); setInterval(() => {}, 1000);`,
          unrelatedReady,
        ],
        { stdio: 'ignore', windowsHide: true }
      );
      children.push(unrelatedNode);

      const prismNode = spawn(
        process.execPath,
        [
          '-e',
          `require('node:fs').writeFileSync(process.argv[1], '1'); setInterval(() => {}, 1000);`,
          prismReady,
          path.join(fakePluginDir, 'sidecars', 'daemon', 'main.mjs'),
        ],
        { stdio: 'ignore', windowsHide: true }
      );
      children.push(prismNode);

      await waitReady(unrelatedReady, unrelatedNode);
      await waitReady(prismReady, prismNode);

      const probeCs = path.join(tmpDir, 'PidReuseProbe.cs');
      const probeExe = path.join(tmpDir, 'pid-reuse-probe.exe');
      fs.writeFileSync(
        probeCs,
        [
          'using System;',
          'using System.Collections.Generic;',
          'using System.Diagnostics;',
          'using AgyClaudeStyle;',
          'class PidReuseProbe {',
          '  static void Main(string[] args) {',
          '    int unrelatedPid = int.Parse(args[0]);',
          '    int prismPid = int.Parse(args[1]);',
          '    string pDir = args[2];',
          '    bool unrelatedWithPlugin = false;',
          '    bool unrelatedNoPlugin = false;',
          '    bool prismWithPlugin = false;',
          '    using (Process p1 = Process.GetProcessById(unrelatedPid)) {',
          '      unrelatedWithPlugin = CdpHelper.IsExpectedPrismDaemonProcess(p1, pDir);',
          '      unrelatedNoPlugin = CdpHelper.IsExpectedPrismDaemonProcess(p1, null);',
          '    }',
          '    using (Process p2 = Process.GetProcessById(prismPid)) {',
          '      prismWithPlugin = CdpHelper.IsExpectedPrismDaemonProcess(p2, pDir);',
          '    }',
          '    var res = new Dictionary<string, object>(StringComparer.Ordinal) {',
          '      { "unrelatedWithPlugin", unrelatedWithPlugin },',
          '      { "unrelatedNoPlugin", unrelatedNoPlugin },',
          '      { "prismWithPlugin", prismWithPlugin }',
          '    };',
          '    Console.Write(MiniJson.Stringify(res, false));',
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
          '/warnaserror',
          '/target:exe',
          '/main:PidReuseProbe',
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

      const probeOut = JSON.parse(
        execFileSync(probeExe, [String(unrelatedNode.pid), String(prismNode.pid), fakePluginDir], { encoding: 'utf8' })
      );
      assert.equal(probeOut.unrelatedWithPlugin, false, 'Unrelated node.exe PID reuse must be rejected');
      assert.equal(probeOut.unrelatedNoPlugin, false, 'Unrelated node.exe without pluginDir must be rejected');
      assert.equal(probeOut.prismWithPlugin, true, 'Genuine Prism sidecar node.exe must be accepted');

      // Also verify setup rejects an ancestor NTFS junction under installDir
      const installerExe = path.join(tmpDir, 'installer.exe');
      buildInstaller({ outputPath: installerExe });
      const victimTarget = path.join(tmpDir, 'victim-target');
      fs.mkdirSync(victimTarget, { recursive: true });
      execFileSync('cmd.exe', ['/c', 'mklink', '/J', junctionPath, victimTarget], { stdio: 'ignore' });
      const nestedInstallDir = path.join(junctionPath, 'nested', 'obsidian-prism');
      const safePluginDir = path.join(tmpDir, 'safe-plugin');
      const outErr = path.join(tmpDir, 'ancestor-err.json');
      const testEnv = {
        ...process.env,
        APPDATA: path.join(tmpDir, 'appdata'),
        AG_PRISM_GEMINI_CONFIG_DIR: path.join(tmpDir, '.gemini', 'config'),
        AG_PRISM_SHORTCUT_DIRS: path.join(tmpDir, 'shortcuts'),
        PRISM_NO_RELAUNCH_PROMPT: '1',
      };
      delete testEnv.NODE_ENV;
      const run = await runExeAllowFail(
        installerExe,
        [
          '--silent',
          '--no-autostart',
          '--no-kill-legacy',
          '--no-native-daemon',
          '--install-dir',
          nestedInstallDir,
          '--plugin-dir',
          safePluginDir,
          '--out',
          outErr,
        ],
        20000,
        testEnv
      );
      assert.notEqual(run.code, 0, 'installer.exe must reject installDir with ancestor NTFS junction');
      assert.deepEqual(fs.readdirSync(victimTarget), [], 'Ancestor junction target must remain untouched');
      const errJson = JSON.parse(fs.readFileSync(outErr, 'utf8'));
      assert.equal(errJson.failedStep, 'prepare-dirs');
      assert.ok(errJson.error.includes('0xA0000003'), `Expected Junction tag in error, got: ${errJson.error}`);
    } finally {
      for (const c of children) {
        try { c.kill(); } catch {}
      }
      try { execFileSync('cmd.exe', ['/c', 'rmdir', junctionPath], { stdio: 'ignore' }); } catch {}
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
);


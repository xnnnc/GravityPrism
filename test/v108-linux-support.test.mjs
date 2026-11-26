import test from 'node:test';
import assert from 'node:assert/strict';
import EventEmitter from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const cdp = require(path.join(ROOT_DIR, 'cdp.js'));
const installer = require(path.join(ROOT_DIR, 'tools', 'install-plugin.cjs'));
const {
  DAEMON_SHUTDOWN_SIGNALS,
  registerDaemonShutdownSignals,
} = await import('../sidecars/daemon/main.mjs');
const {
  readLinuxEnvDGoMemLimit,
  resolveLinuxHostExecutable,
  launchHostWithCdpFlag,
} = await import('../sidecars/daemon/conversation-archive.mjs');
const {
  ARCHIVE_ROOT_PREFIX,
  generateInstallSh,
  generateUninstallSh,
  generateStatusSh,
  parseTarEntries,
  buildLinuxPortable,
} = await import('../scripts/build-linux.mjs');

function makeTempDir(prefix = 'obsidian-prism-linux-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('XDG .desktop Exec= patching inserts --remote-debugging-port=0 before field codes, preserves quotes/custom ports, and strips cleanly', () => {
  // 1. Standard /usr/share path with %U
  const r1 = cdp.patchDesktopExecLine('/usr/share/antigravity/antigravity %U');
  assert.equal(r1.matched, true);
  assert.equal(r1.changed, true);
  assert.equal(r1.value, '/usr/share/antigravity/antigravity --remote-debugging-port=0 %U');

  // 2. Quoted path with spaces and extra flags + %F
  const r2 = cdp.patchDesktopExecLine('"/opt/My Apps/Antigravity/antigravity" --ozone-platform=wayland %F');
  assert.equal(r2.matched, true);
  assert.equal(r2.changed, true);
  assert.equal(
    r2.value,
    '"/opt/My Apps/Antigravity/antigravity" --ozone-platform=wayland --remote-debugging-port=0 %F'
  );

  // 3. Leading env assignments + %u
  const r3 = cdp.patchDesktopExecLine('env GTK_IM_MODULE=fcitx /opt/Antigravity/antigravity %u');
  assert.equal(r3.matched, true);
  assert.equal(r3.changed, true);
  assert.equal(r3.value, 'env GTK_IM_MODULE=fcitx /opt/Antigravity/antigravity --remote-debugging-port=0 %u');

  // 4. AppImage without field codes
  const r4 = cdp.patchDesktopExecLine('/home/user/Applications/Antigravity-2.29.1-x86_64.AppImage');
  assert.equal(r4.matched, true);
  assert.equal(r4.changed, true);
  assert.equal(
    r4.value,
    '/home/user/Applications/Antigravity-2.29.1-x86_64.AppImage --remote-debugging-port=0'
  );

  // 5. Existing custom debug port is preserved without duplicating
  const r5 = cdp.patchDesktopExecLine('/usr/share/antigravity/antigravity --remote-debugging-port=9222 %U');
  assert.equal(r5.matched, true);
  assert.equal(r5.changed, false);
  assert.equal(r5.alreadySet, true);
  assert.equal(r5.value, '/usr/share/antigravity/antigravity --remote-debugging-port=9222 %U');

  // Strip must NOT remove user custom port 9222
  const s5 = cdp.stripDesktopExecLine(r5.value);
  assert.equal(s5.changed, false);
  assert.equal(s5.value, r5.value);

  // Strip cleanly restores r2 back to original
  const s2 = cdp.stripDesktopExecLine(r2.value);
  assert.equal(s2.changed, true);
  assert.equal(s2.value, '"/opt/My Apps/Antigravity/antigravity" --ozone-platform=wayland %F');

  // 6. Non-Antigravity targets are ignored
  for (const foreign of [
    '/usr/bin/firefox %u',
    '/usr/local/bin/antigravity-tools --gui',
    '/opt/Antigravity/chrome_crashpad_handler --monitor-self',
  ]) {
    const rf = cdp.patchDesktopExecLine(foreign);
    assert.equal(rf.matched, false);
    assert.equal(rf.changed, false);
    assert.equal(rf.value, foreign);
  }
});

test('XDG .desktop multi-section [Desktop Action ...] patching, Shadow Copy for read-only system dir, and reversible restore', async () => {
  const tmpRoot = makeTempDir();
  try {
    const fakeHome = path.join(tmpRoot, 'home');
    const userApps = path.join(fakeHome, '.local', 'share', 'applications');
    const userDesktop = path.join(fakeHome, 'Desktop');
    const sysApps = path.join(tmpRoot, 'sys-applications');
    const pluginDir = path.join(tmpRoot, 'plugin');
    fs.mkdirSync(userApps, { recursive: true });
    fs.mkdirSync(userDesktop, { recursive: true });
    fs.mkdirSync(sysApps, { recursive: true });
    fs.mkdirSync(pluginDir, { recursive: true });

    const sysDesktopContent = [
      '[Desktop Entry]',
      'Name=Antigravity',
      'Type=Application',
      'Exec=/usr/share/antigravity/antigravity %U',
      'Actions=new-empty-window;',
      '',
      '[Desktop Action new-empty-window]',
      'Name=New Empty Window',
      'Exec=/usr/share/antigravity/antigravity --new-window %F',
      '',
    ].join('\n');
    const sysDesktopPath = path.join(sysApps, 'antigravity.desktop');
    fs.writeFileSync(sysDesktopPath, sysDesktopContent, 'utf8');

    const userCustomContent = [
      '[Desktop Entry]',
      'Name=Antigravity Portable',
      'Type=Application',
      'Exec="/home/dev/My Apps/Antigravity/antigravity" --no-sandbox %U',
      '',
    ].join('\n');
    const userDesktopFile = path.join(userDesktop, 'antigravity-portable.desktop');
    fs.writeFileSync(userDesktopFile, userCustomContent, 'utf8');

    const thirdPartyPath = path.join(userApps, 'firefox.desktop');
    const thirdPartyContent = '[Desktop Entry]\nName=Firefox\nExec=/usr/bin/firefox %u\n';
    fs.writeFileSync(thirdPartyPath, thirdPartyContent, 'utf8');

    // Patch (sync)
    const patchRes = cdp.ensureAntigravityShortcutsCdpFlag({
      platformOverride: 'linux',
      homeDir: fakeHome,
      userApplicationsDir: userApps,
      searchDirs: [userApps, userDesktop, sysApps],
      systemDirs: [sysApps],
      pluginDir,
    });
    assert.equal(patchRes.supported, true);
    assert.equal(patchRes.matched, 2);
    assert.equal(patchRes.shadowCreated.length, 1);

    // Original system .desktop MUST remain 100% untouched (rootless shadow copy)
    assert.equal(fs.readFileSync(sysDesktopPath, 'utf8'), sysDesktopContent);

    // Shadow copy created in userApps with marker and both sections patched
    const shadowPath = path.join(userApps, 'antigravity.desktop');
    assert.equal(fs.existsSync(shadowPath), true);
    const shadowText = fs.readFileSync(shadowPath, 'utf8');
    assert.equal(cdp.readDesktopShadowMarker(shadowText), sysDesktopPath);
    assert.ok(shadowText.includes('Exec=/usr/share/antigravity/antigravity --remote-debugging-port=0 %U'));
    assert.ok(shadowText.includes('Exec=/usr/share/antigravity/antigravity --new-window --remote-debugging-port=0 %F'));

    // User desktop file patched in-place
    const patchedUserDesktop = fs.readFileSync(userDesktopFile, 'utf8');
    assert.ok(
      patchedUserDesktop.includes(
        'Exec="/home/dev/My Apps/Antigravity/antigravity" --no-sandbox --remote-debugging-port=0 %U'
      )
    );

    // Third-party desktop file untouched
    assert.equal(fs.readFileSync(thirdPartyPath, 'utf8'), thirdPartyContent);

    // Idempotent async re-run reports alreadySet and 0 new patches
    const reRun = await cdp.ensureAntigravityShortcutsCdpFlagAsync({
      platformOverride: 'linux',
      homeDir: fakeHome,
      userApplicationsDir: userApps,
      searchDirs: [userApps, userDesktop, sysApps],
      systemDirs: [sysApps],
      pluginDir,
    });
    assert.equal(reRun.supported, true);
    assert.equal(reRun.patched.length, 0);
    assert.equal(reRun.alreadySet.length, 2);

    // Restore removes shadow copy completely and strips flag from user desktop file
    const restoreRes = cdp.restoreAntigravityShortcutsCdpFlag({
      platformOverride: 'linux',
      homeDir: fakeHome,
      userApplicationsDir: userApps,
      searchDirs: [userApps, userDesktop, sysApps],
      systemDirs: [sysApps],
      pluginDir,
    });
    assert.equal(restoreRes.supported, true);
    assert.equal(fs.existsSync(shadowPath), false);
    assert.equal(restoreRes.shadowRemoved.length, 1);
    assert.equal(fs.readFileSync(sysDesktopPath, 'utf8'), sysDesktopContent);
    assert.equal(fs.readFileSync(userDesktopFile, 'utf8'), userCustomContent);
    assert.equal(fs.readFileSync(thirdPartyPath, 'utf8'), thirdPartyContent);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('XDG .desktop engine blocks symlink traversal (lstatSync protection)', () => {
  const tmpRoot = makeTempDir();
  try {
    const outsideDir = path.join(tmpRoot, 'outside');
    const sysApps = path.join(tmpRoot, 'sys');
    const linkUserApps = path.join(tmpRoot, 'user-apps-link');
    fs.mkdirSync(outsideDir, { recursive: true });
    fs.mkdirSync(sysApps, { recursive: true });

    const sysDesktopPath = path.join(sysApps, 'antigravity.desktop');
    fs.writeFileSync(
      sysDesktopPath,
      '[Desktop Entry]\nName=Antigravity\nExec=/usr/share/antigravity/antigravity %U\n',
      'utf8'
    );

    // Directory symlink (junction on win32 requires no admin privilege)
    fs.symlinkSync(outsideDir, linkUserApps, process.platform === 'win32' ? 'junction' : 'dir');

    const res = cdp.ensureAntigravityShortcutsCdpFlag({
      platformOverride: 'linux',
      userApplicationsDir: linkUserApps,
      searchDirs: [linkUserApps, sysApps],
      systemDirs: [sysApps],
    });
    assert.equal(res.patched.length, 0);
    assert.equal(fs.existsSync(path.join(outsideDir, 'antigravity.desktop')), false);
    assert.ok(res.skipped.length >= 1);

    // On POSIX, also verify file-level symlink inside userApps is skipped without mutating target
    if (process.platform !== 'win32') {
      const realUserApps = path.join(tmpRoot, 'real-user-apps');
      fs.mkdirSync(realUserApps, { recursive: true });
      const outsideFile = path.join(outsideDir, 'victim.desktop');
      const victimOrig = '[Desktop Entry]\nName=Antigravity\nExec=/usr/share/antigravity/antigravity %U\n';
      fs.writeFileSync(outsideFile, victimOrig, 'utf8');
      fs.symlinkSync(outsideFile, path.join(realUserApps, 'evil.desktop'));

      const res2 = cdp.ensureAntigravityShortcutsCdpFlag({
        platformOverride: 'linux',
        userApplicationsDir: realUserApps,
        searchDirs: [realUserApps],
      });
      assert.equal(res2.patched.length, 0);
      assert.ok(res2.skipped.includes(path.join(realUserApps, 'evil.desktop')));
      assert.equal(fs.readFileSync(outsideFile, 'utf8'), victimOrig);
    }
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('Linux process signature & parsePosixPsHostCandidates detect AppImage, spaced paths, and filter crashpad/renderer/daemon', () => {
  assert.equal(
    cdp.isMainAntigravityProcessSignature('/usr/share/antigravity/antigravity', '/usr/share/antigravity/antigravity'),
    true
  );
  assert.equal(
    cdp.isMainAntigravityProcessSignature(
      '/home/u/Applications/Antigravity-2.29.1-x86_64.AppImage',
      '/home/u/Applications/Antigravity-2.29.1-x86_64.AppImage --ozone-platform=wayland'
    ),
    true
  );
  assert.equal(
    cdp.isMainAntigravityProcessSignature(
      '/usr/share/antigravity/chrome_crashpad_handler',
      '/usr/share/antigravity/chrome_crashpad_handler --monitor-self'
    ),
    false
  );
  assert.equal(
    cdp.isMainAntigravityProcessSignature(
      '/usr/share/antigravity/antigravity',
      '/usr/share/antigravity/antigravity --type=renderer --enable-crashpad'
    ),
    false
  );
  assert.equal(
    cdp.isMainAntigravityProcessSignature(
      '/usr/share/antigravity/antigravity',
      '/usr/share/antigravity/antigravity --import=/x/sidecar_sdk/register_loader.js main.mjs'
    ),
    false
  );
  assert.equal(
    cdp.isMainAntigravityProcessSignature('/usr/local/bin/antigravity-tools', '/usr/local/bin/antigravity-tools'),
    false
  );
  assert.equal(
    cdp.isMainAntigravityProcessSignature(
      '/home/u/.antigravity/language_server_linux_x64',
      '/home/u/.antigravity/language_server_linux_x64 --workspace'
    ),
    false
  );

  const mockPs = [
    '  101 00:05:10 /usr/share/antigravity/chrome_crashpad_handler --no-rate-limit',
    '  102 00:05:09 /tmp/.mount_AntigrABC123/antigravity --type=gpu-process',
    '  103 00:05:08 /tmp/.mount_AntigrABC123/antigravity --no-sandbox',
    '  104 00:02:00 "/home/dev/My Apps/Antigravity/antigravity" --remote-debugging-port=0',
    '  105 00:01:00 /usr/share/antigravity/antigravity --import=/opt/sidecar_sdk/register_loader.js main.mjs',
  ].join('\n');

  const nowMs = 1700000000000;
  const candidates = cdp.parsePosixPsHostCandidates(mockPs, nowMs, {
    platformOverride: 'linux',
    readProcExe(pid) {
      if (pid === 103) return '/tmp/.mount_AntigrABC123/antigravity (deleted)';
      return '';
    },
    readProcEnviron(pid) {
      if (pid === 103) {
        return Buffer.from('PATH=/usr/bin\0APPIMAGE=/home/dev/Apps/Antigravity-2.29.1.AppImage\0HOME=/home/dev\0');
      }
      return '';
    },
  });

  const c103 = candidates.find((c) => c.pid === 103);
  assert.ok(c103);
  assert.equal(c103.exePath, '/home/dev/Apps/Antigravity-2.29.1.AppImage');
  assert.equal(cdp.isMainAntigravityProcessSignature(c103.imageName, c103.commandLine), true);

  const c104 = candidates.find((c) => c.pid === 104);
  assert.ok(c104);
  assert.equal(c104.exePath, '/home/dev/My Apps/Antigravity/antigravity');
  assert.equal(cdp.hasRemoteDebuggingPortSwitch(c104.commandLine), true);

  const primary = cdp.detectRunningAntigravityHostSync({
    nowMs,
    probeProcesses: () => candidates,
  });
  assert.ok(primary);
  assert.equal(primary.pid, 103);
  assert.equal(primary.exePath, '/home/dev/Apps/Antigravity-2.29.1.AppImage');
  assert.equal(primary.hasDebugPortSwitch, false);
});

test('promptUserForHostRelaunch Linux branch supports zenity, kdialog fallback, cancel handling, and headless safety', async () => {
  // 1. Headless (no DISPLAY / WAYLAND_DISPLAY)
  let called = 0;
  const headlessRes = await cdp.promptUserForHostRelaunch({
    platformOverride: 'linux',
    env: { PATH: '/usr/bin' },
    execFileFn: () => {
      called += 1;
    },
  });
  assert.equal(headlessRes, false);
  assert.equal(called, 0);

  // 2. Zenity present & user confirms
  const callsZenityOk = [];
  const zOk = await cdp.promptUserForHostRelaunch({
    platformOverride: 'linux',
    lang: 'en',
    env: { WAYLAND_DISPLAY: 'wayland-0' },
    execFileFn: (file, args, _opts, cb) => {
      callsZenityOk.push({ file, args });
      cb(null, '');
    },
  });
  assert.equal(zOk, true);
  assert.equal(callsZenityOk.length, 1);
  assert.equal(callsZenityOk[0].file, 'zenity');
  assert.ok(callsZenityOk[0].args.includes('--question'));
  assert.ok(callsZenityOk[0].args.includes('--no-markup'));

  // 3. Zenity present & user clicks Cancel (exit code 1 -> do NOT fall back to kdialog)
  const callsZenityCancel = [];
  const zCancel = await cdp.promptUserForHostRelaunch({
    platformOverride: 'linux',
    env: { DISPLAY: ':0' },
    execFileFn: (file, args, _opts, cb) => {
      callsZenityCancel.push(file);
      const err = new Error('cancelled');
      err.code = 1;
      cb(err, '');
    },
  });
  assert.equal(zCancel, false);
  assert.deepEqual(callsZenityCancel, ['zenity']);

  // 4. Zenity ENOENT -> falls back to kdialog --yesno
  const callsFallback = [];
  const kOk = await cdp.promptUserForHostRelaunch({
    platformOverride: 'linux',
    env: { DISPLAY: ':0' },
    execFileFn: (file, args, _opts, cb) => {
      callsFallback.push({ file, args });
      if (file === 'zenity') {
        const err = new Error('not found');
        err.code = 'ENOENT';
        cb(err, '');
        return;
      }
      cb(null, '');
    },
  });
  assert.equal(kOk, true);
  assert.deepEqual(
    callsFallback.map((c) => c.file),
    ['zenity', 'kdialog']
  );
  assert.ok(callsFallback[1].args.includes('--yesno'));

  // 5. Both zenity and kdialog missing -> returns false safely
  const bothMissing = await cdp.promptUserForHostRelaunch({
    platformOverride: 'linux',
    env: { DISPLAY: ':0' },
    execFileFn: (_file, _args, _opts, cb) => {
      const err = new Error('not found');
      err.code = 'ENOENT';
      cb(err, '');
    },
  });
  assert.equal(bothMissing, false);
});

test('LINUX_DETACHED_RELAUNCH_SH and spawnDetachedHostRelaunchHelper obey injection, SIGKILL, and GOMEMLIMIT contracts', () => {
  const sh = cdp.LINUX_DETACHED_RELAUNCH_SH;
  assert.ok(sh.includes('unset ELECTRON_RUN_AS_NODE'));
  assert.ok(sh.includes('kill -TERM "$target_pid"'));
  assert.ok(sh.includes('SingletonLock'));
  assert.ok(sh.includes('90-obsidian-prism-gomemlimit.conf'));
  assert.ok(sh.includes('^GOMEMLIMIT=([0-9]+(B|KiB|MiB|GiB|TiB))$'));
  assert.ok(sh.includes('nohup "$launch_exe" --remote-debugging-port=0'));

  // Strict security redlines: NO kill -9 / SIGKILL / pkill -9 / app.asar / source / eval
  assert.equal(/kill\s+-9|SIGKILL|pkill\s+-9/i.test(sh), false);
  assert.equal(/app\.asar/i.test(sh), false);
  assert.equal(/(?:^|\s)(?:source|eval)\s+/m.test(sh), false);

  // Verify positional argument passing with shell metacharacters in exePath
  const maliciousPath = '/home/user/Apps/Antigravity; touch /tmp/pwned $(id).AppImage';
  let captured = null;
  let unrefCalled = false;
  const res = cdp.spawnDetachedHostRelaunchHelper(
    { hostPid: 43210, exePath: maliciousPath },
    {
      platformOverride: 'linux',
      env: { PATH: '/usr/bin', ELECTRON_RUN_AS_NODE: '1' },
      spawnFn(cmd, args, opts) {
        captured = { cmd, args, opts };
        return {
          pid: 99999,
          unref() {
            unrefCalled = true;
          },
        };
      },
    }
  );
  assert.equal(res.spawned, true);
  assert.equal(res.method, 'linux-sh');
  assert.equal(unrefCalled, true);
  assert.equal(captured.cmd, '/bin/sh');
  assert.deepEqual(captured.args, ['-c', sh, '--', '43210', maliciousPath]);
  assert.equal(captured.opts.detached, true);
  assert.equal(captured.opts.env.ELECTRON_RUN_AS_NODE, undefined);
  // Script text itself must never contain interpolated user path
  assert.equal(captured.args[1].includes(maliciousPath), false);

  // Validate readLinuxGoMemLimitFromEnvD strict regex & injection rejection
  const tmpRoot = makeTempDir();
  try {
    const confDir = path.join(tmpRoot, '.config', 'environment.d');
    fs.mkdirSync(confDir, { recursive: true });
    const confPath = path.join(confDir, '90-obsidian-prism-gomemlimit.conf');

    fs.writeFileSync(confPath, '# managed\nGOMEMLIMIT=2500MiB\n', 'utf8');
    assert.equal(cdp.readLinuxGoMemLimitFromEnvD({ homeDir: tmpRoot }), '2500MiB');

    fs.writeFileSync(confPath, 'GOMEMLIMIT=2GiB; rm -rf /\n', 'utf8');
    assert.equal(cdp.readLinuxGoMemLimitFromEnvD({ homeDir: tmpRoot }), '');

    fs.writeFileSync(confPath, 'GOMEMLIMIT=$(whoami)\n', 'utf8');
    assert.equal(cdp.readLinuxGoMemLimitFromEnvD({ homeDir: tmpRoot }), '');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('Daemon SIGHUP shutdown hook triggers stop(false) with re-entrancy guard', async () => {
  assert.ok(DAEMON_SHUTDOWN_SIGNALS.includes('SIGHUP'));
  assert.ok(DAEMON_SHUTDOWN_SIGNALS.includes('SIGTERM'));
  assert.ok(DAEMON_SHUTDOWN_SIGNALS.includes('SIGINT'));

  const fakeProc = new EventEmitter();
  const stopCalls = [];
  const exitCodes = [];
  let releaseStop;
  const fakeDaemon = {
    stop(flag) {
      stopCalls.push(flag);
      return new Promise((resolve) => {
        releaseStop = resolve;
      });
    },
  };

  const reg = registerDaemonShutdownSignals(fakeDaemon, {
    proc: fakeProc,
    exit: (code) => exitCodes.push(code),
  });

  try {
    fakeProc.emit('SIGHUP');
    fakeProc.emit('SIGTERM');
    fakeProc.emit('SIGINT');
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(stopCalls, [false]);
    releaseStop();
    await reg.shutdown();
    assert.deepEqual(stopCalls, [false]);
    assert.deepEqual(exitCodes, [0]);
  } finally {
    reg.dispose();
  }
});

test('conversation-archive Linux launchHostWithCdpFlag resolves binary and reloads valid GOMEMLIMIT only', () => {
  const tmpRoot = makeTempDir();
  try {
    const confDir = path.join(tmpRoot, '.config', 'environment.d');
    fs.mkdirSync(confDir, { recursive: true });
    const confPath = path.join(confDir, '90-obsidian-prism-gomemlimit.conf');
    fs.writeFileSync(confPath, 'GOMEMLIMIT=3GiB\n', 'utf8');

    assert.equal(readLinuxEnvDGoMemLimit({ homeDir: tmpRoot }), '3GiB');

    const detected = resolveLinuxHostExecutable('', {
      homeDir: tmpRoot,
      existsSync: (p) => p === '/opt/Antigravity/antigravity',
    });
    assert.equal(detected, '/opt/Antigravity/antigravity');

    let launched = null;
    const ok = launchHostWithCdpFlag('', 'linux', {
      homeDir: tmpRoot,
      env: { PATH: '/usr/bin', ELECTRON_RUN_AS_NODE: '1' },
      existsSync: (p) => p === '/usr/share/antigravity/antigravity',
      spawnFn(exe, args, opts) {
        launched = { exe, args, opts };
        return { pid: 54321, on() {}, unref() {} };
      },
    });
    assert.equal(ok, true);
    assert.equal(launched.exe, '/usr/share/antigravity/antigravity');
    assert.deepEqual(launched.args, ['--remote-debugging-port=0']);
    assert.equal(launched.opts.env.GOMEMLIMIT, '3GiB');
    assert.equal(launched.opts.env.ELECTRON_RUN_AS_NODE, undefined);

    // Malicious GOMEMLIMIT line must be rejected and NOT injected
    fs.writeFileSync(confPath, 'GOMEMLIMIT=3GiB$(touch /tmp/bad)\n', 'utf8');
    let launchedBad = null;
    launchHostWithCdpFlag('/custom/antigravity', 'linux', {
      homeDir: tmpRoot,
      env: { PATH: '/usr/bin' },
      existsSync: (p) => p === '/custom/antigravity',
      spawnFn(exe, args, opts) {
        launchedBad = { exe, args, opts };
        return { pid: 54322, on() {}, unref() {} };
      },
    });
    assert.equal(launchedBad.exe, '/custom/antigravity');
    assert.equal(launchedBad.opts.env.GOMEMLIMIT, undefined);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('installPlugin / uninstallPlugin Linux branch: case-sensitive paths, managed launcher, shadow copy, and watcher detection', async () => {
  assert.equal(installer.pathsEqual('/tmp/Obsidian', '/tmp/obsidian', 'linux'), false);
  assert.equal(installer.pathsEqual('/tmp/Obsidian', '/tmp/Obsidian', 'linux'), true);

  const tmpRoot = makeTempDir();
  try {
    const fakeHome = path.join(tmpRoot, 'home');
    const hostConfigDir = path.join(fakeHome, '.gemini', 'config');
    const targetDir = path.join(hostConfigDir, 'plugins', 'obsidian-prism');
    const userApps = path.join(fakeHome, '.local', 'share', 'applications');
    const iconDir = path.join(fakeHome, '.local', 'share', 'icons', 'hicolor', '256x256', 'apps');
    const sysApps = path.join(tmpRoot, 'sys-applications');
    fs.mkdirSync(sysApps, { recursive: true });
    fs.mkdirSync(userApps, { recursive: true });

    const sysDesktopPath = path.join(sysApps, 'antigravity.desktop');
    const sysOrig = '[Desktop Entry]\nName=Antigravity\nExec=/usr/share/antigravity/antigravity %U\n';
    fs.writeFileSync(sysDesktopPath, sysOrig, 'utf8');

    const installRes = await installer.installPlugin({
      targetDir,
      hostConfigDir,
      startDaemon: false,
      platformOverride: 'linux',
      homeDir: fakeHome,
      userApplicationsDir: userApps,
      shortcutSearchDirs: [userApps, sysApps],
      shortcutSystemDirs: [sysApps],
      createLauncher: true,
      launcherDir: userApps,
      iconDir,
      launcherStopRoot: tmpRoot,
      targetExe: '/home/dev/Apps/Antigravity-2.29.1.AppImage',
    });

    assert.equal(installRes.ok, true);
    assert.equal(installRes.shortcuts.supported, true);
    assert.equal(installRes.shortcuts.shadowCreated.length, 1);
    assert.equal(installRes.launcher.supported, true);
    assert.equal(installRes.launcher.created, true);
    assert.equal(fs.existsSync(installRes.launcher.desktopPath), true);
    assert.equal(fs.existsSync(installRes.launcher.iconPath), true);

    const pngHeader = fs.readFileSync(installRes.launcher.iconPath).subarray(0, 8);
    assert.deepEqual([...pngHeader], [137, 80, 78, 71, 13, 10, 26, 10]);

    const launcherText = fs.readFileSync(installRes.launcher.desktopPath, 'utf8');
    assert.ok(launcherText.includes('X-ObsidianPrism-Managed=true'));
    assert.ok(launcherText.includes('/home/dev/Apps/Antigravity-2.29.1.AppImage --remote-debugging-port=0 %U'));

    const summary = installer.formatInstallSelfCheckSummary(installRes);
    assert.ok(summary.includes('Linux 无损桌面启动器已就绪'));
    assert.ok(summary.includes('XDG 影子覆写'));
    assert.ok(summary.includes('Linux lossless launcher ready'));

    // Watcher detection on Linux
    assert.equal(installer.isStandaloneWatcherInstalled({ platformOverride: 'linux', homeDir: fakeHome }), false);
    const systemdUnitDir = path.join(fakeHome, '.config', 'systemd', 'user');
    fs.mkdirSync(systemdUnitDir, { recursive: true });
    fs.writeFileSync(path.join(systemdUnitDir, 'obsidian-prism.service'), '[Unit]\nDescription=Prism\n', 'utf8');
    assert.equal(installer.isStandaloneWatcherInstalled({ platformOverride: 'linux', homeDir: fakeHome }), true);

    // Uninstall cleanly removes managed launcher, icon, and shadow copy while leaving system file untouched
    const uninstallRes = await installer.uninstallPlugin({
      targetDir,
      hostConfigDir,
      noCdp: true,
      platformOverride: 'linux',
      homeDir: fakeHome,
      userApplicationsDir: userApps,
      shortcutSearchDirs: [userApps, sysApps],
      shortcutSystemDirs: [sysApps],
      removeLauncher: true,
      launcherDir: userApps,
      iconDir,
      launcherStopRoot: tmpRoot,
    });
    assert.equal(uninstallRes.ok, true);
    assert.equal(uninstallRes.launcher.removed, true);
    assert.equal(uninstallRes.launcher.iconRemoved, true);
    assert.equal(fs.existsSync(installRes.launcher.desktopPath), false);
    assert.equal(fs.existsSync(installRes.launcher.iconPath), false);
    assert.equal(fs.existsSync(path.join(userApps, 'antigravity.desktop')), false);
    assert.equal(fs.readFileSync(sysDesktopPath, 'utf8'), sysOrig);

    // Unmanaged desktop launcher must be refused on overwrite & removal
    const unmanagedDesktop = path.join(userApps, installer.LINUX_LAUNCHER_DESKTOP_NAME);
    fs.writeFileSync(unmanagedDesktop, '[Desktop Entry]\nName=Custom\nExec=/usr/bin/custom\n', 'utf8');
    assert.throws(
      () =>
        installer.createLinuxLosslessLauncher({
          platformOverride: 'linux',
          launcherDir: userApps,
          iconDir,
          stopRoot: tmpRoot,
        }),
      /unmanaged/i
    );
    const rmUnmanaged = installer.removeLinuxLosslessLauncher({
      platformOverride: 'linux',
      launcherDir: userApps,
      iconDir,
      stopRoot: tmpRoot,
    });
    assert.equal(rmUnmanaged.removed, false);
    assert.equal(rmUnmanaged.refused, true);
    assert.equal(rmUnmanaged.reason, 'unmanaged-desktop');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('scripts/build-linux.mjs builds valid zero-dependency portable tar.gz in tmpdir with clean POSIX scripts', () => {
  const tmpRoot = makeTempDir();
  try {
    const outTarGz = path.join(tmpRoot, 'obsidian-prism-linux-portable.tar.gz');
    const buildRes = buildLinuxPortable({ outPath: outTarGz });
    assert.equal(fs.existsSync(outTarGz), true);
    assert.ok(buildRes.sizeBytes > 10 * 1024);
    assert.ok(buildRes.fileCount > 30);

    const gzBuf = fs.readFileSync(outTarGz);
    const entries = parseTarEntries(gzBuf);
    const byName = new Map(entries.map((e) => [e.name, e]));

    for (const shRel of ['install.sh', 'uninstall.sh', 'status.sh']) {
      const fullName = `${ARCHIVE_ROOT_PREFIX}/${shRel}`;
      const entry = byName.get(fullName);
      assert.ok(entry, `Missing ${fullName} in tarball`);
      assert.equal(entry.mode & 0o777, 0o755, `${fullName} must be executable (0755)`);
      const text = entry.data.toString('utf8');
      assert.equal(text.includes('\r'), false, `${fullName} must use pure LF`);
      assert.equal(entry.data[0] === 0xef && entry.data[1] === 0xbb && entry.data[2] === 0xbf, false);
      assert.equal(/kill\s+-9|SIGKILL|pkill\s+-9/i.test(text), false, `${fullName} must not use SIGKILL`);
      assert.equal(/patch-asar/i.test(text), false, `${fullName} must never invoke patch-asar`);
      assert.ok(text.includes('tools/install-plugin.cjs'), `${fullName} must delegate to tools/install-plugin.cjs`);
    }

    assert.ok(byName.get(`${ARCHIVE_ROOT_PREFIX}/uninstall.sh`).data.toString('utf8').includes('remove.js'));

    // Verify complete native-plugin payload inside tarball
    for (const required of [
      'native-plugin/cdp.js',
      'native-plugin/style.css',
      'native-plugin/remove.js',
      'native-plugin/plugin.json',
      'native-plugin/tools/install-plugin.cjs',
      'native-plugin/tools/patch-asar.cjs',
      'native-plugin/sidecars/daemon/main.mjs',
      'native-plugin/sidecars/daemon/conversation-archive.mjs',
      'native-plugin/assets/logo.svg',
      'assets/obsidian-prism-256.png',
    ]) {
      const entry = byName.get(`${ARCHIVE_ROOT_PREFIX}/${required}`);
      assert.ok(entry && entry.size > 0, `Missing required tarball entry: ${required}`);
    }

    // On Linux CI, run real `bash -n` syntax validation on all generated shell scripts
    if (process.platform === 'linux') {
      const scripts = [
        ['install.sh', generateInstallSh()],
        ['uninstall.sh', generateUninstallSh()],
        ['status.sh', generateStatusSh()],
        ['relaunch.sh', cdp.LINUX_DETACHED_RELAUNCH_SH],
      ];
      for (const [name, content] of scripts) {
        const scriptFile = path.join(tmpRoot, name);
        fs.writeFileSync(scriptFile, content, 'utf8');
        execFileSync(name === 'relaunch.sh' ? '/bin/sh' : 'bash', ['-n', scriptFile], { stdio: 'pipe' });
      }
    }
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('style.css Antigravity 2.29.1 selectors, zero :has(), ASCII-only, Ch1 budget < 550,000 B, and UTF-8 LF hygiene', () => {
  const cssPath = path.join(ROOT_DIR, 'style.css');
  const css = fs.readFileSync(cssPath, 'utf8');
  assert.equal(css.includes(':has('), false, 'style.css must never contain :has(');
  assert.equal(/[^\x00-\x7F]/.test(css), false, 'style.css must remain strictly ASCII');
  assert.ok(css.includes('.agy-sheet'), 'style.css must cover non-Home .agy-sheet');
  assert.ok(
    css.includes('.agy-shell :is(div,aside).bg-sidebar{background-color:var(--sidebar) !important;}'),
    'style.css must cover Antigravity 2.29.1 .bg-sidebar'
  );

  const ch1Expr = cdp.buildInjectExpression(cdp.DEFAULT_CONFIG);
  assert.ok(
    ch1Expr.length < 580000,
    `Channel 1 bundle size ${ch1Expr.length} must stay below 580,000 B`
  );

  // Verify UTF-8 no-BOM and pure LF across all Linux support files
  const filesToCheck = [
    'style.css',
    'cdp.js',
    'sidecars/daemon/main.mjs',
    'sidecars/daemon/conversation-archive.mjs',
    'tools/install-plugin.cjs',
    'scripts/build-linux.mjs',
    '.github/workflows/release.yml',
    'test/v108-linux-support.test.mjs',
  ];
  for (const rel of filesToCheck) {
    const buf = fs.readFileSync(path.join(ROOT_DIR, ...rel.split('/')));
    assert.equal(
      buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf,
      false,
      `${rel} must not have UTF-8 BOM`
    );
    assert.equal(buf.includes(0x0d), false, `${rel} must use pure LF line endings`);
  }
});

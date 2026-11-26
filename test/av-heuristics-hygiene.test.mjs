import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

import {
  PrismDaemon,
  isSensitiveInlineDiffPath,
  parseTasklistCsvImageName,
  queryWindowsProcessImageNameSync,
  sanitizeSecretText as daemonSanitizeSecretText,
  verifyDaemonPidLockToken,
} from '../sidecars/daemon/main.mjs';
import {
  SECRET_TOKEN_RE,
  URL_SECRET_QUERY_RE,
  sanitizeSecretText,
} from '../sidecars/daemon/redact.mjs';
import { collectNativePluginEntries } from '../scripts/build-common.mjs';

const require = createRequire(import.meta.url);
const ROOT_DIR = path.resolve(import.meta.dirname, '..');

function readUtf8Strict(relPath) {
  const abs = path.join(ROOT_DIR, relPath);
  const buf = fs.readFileSync(abs);
  const hasBom = buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  assert.equal(hasBom, false, `${relPath} must have 0 UTF-8 BOM`);
  const text = buf.toString('utf8');
  assert.equal(text.includes('\r\n'), false, `${relPath} must use LF (0 CRLF)`);
  return text;
}

test('av-hygiene 1: main.mjs & track-3 daemon modules have zero PowerShell/Win32_Process/EncodedCommand, zero inline credential wordlists, and zero inline token prefixes', () => {
  const mainSrc = readUtf8Strict('sidecars/daemon/main.mjs');
  const archiveSrc = readUtf8Strict('sidecars/daemon/conversation-archive.mjs');
  const redactSrc = readUtf8Strict('sidecars/daemon/redact.mjs');
  const rulesSrc = readUtf8Strict('sidecars/daemon/sensitive-path-rules.json');
  readUtf8Strict('test/av-heuristics-hygiene.test.mjs');

  assert.doesNotThrow(() => JSON.parse(rulesSrc), 'sensitive-path-rules.json must be valid JSON');

  const mainForbiddenPatterns = [
    ['power' + 'shell', new RegExp('power' + 'shell', 'i')],
    ['Win32_' + 'Process', new RegExp('Win32_' + 'Process', 'i')],
    ['Encoded' + 'Command', new RegExp('Encoded' + 'Command', 'i')],
    ['-WindowStyle Hidden', new RegExp('-WindowStyle\\s+Hidden', 'i')],
    ['WScript.' + 'Shell', new RegExp('WScript\\.' + 'Shell', 'i')],
  ];
  for (const [label, re] of mainForbiddenPatterns) {
    assert.equal(re.test(mainSrc), false, `sidecars/daemon/main.mjs must contain 0 ${label}`);
  }

  const archiveForbiddenPatterns = [
    ...mainForbiddenPatterns,
    ['Get-' + 'CimInstance', new RegExp('Get-' + 'CimInstance', 'i')],
    ['wm' + 'ic', new RegExp('\\bwm' + 'ic\\b', 'i')],
  ];
  for (const [label, re] of archiveForbiddenPatterns) {
    assert.equal(re.test(archiveSrc), false, `sidecars/daemon/conversation-archive.mjs must contain 0 ${label}`);
  }

  const inlineCredentialLiterals = [
    'login ' + 'data',
    'login ' + 'data-journal',
    'local ' + 'state',
    'cookies-' + 'journal',
    'web ' + 'data',
    'state.' + 'vscdb',
    'config/' + 'sam',
    '.' + 'gnupg',
  ];
  const lowerMain = mainSrc.toLowerCase();
  for (const lit of inlineCredentialLiterals) {
    assert.equal(
      lowerMain.includes(lit),
      false,
      `sidecars/daemon/main.mjs must not inline credential literal "${lit}"`
    );
  }

  const inlineTokenPrefixes = ['sk' + '-', 'AI' + 'za', 'ghp' + '_', 'github_' + 'pat_'];
  for (const prefix of inlineTokenPrefixes) {
    assert.equal(
      mainSrc.includes(prefix),
      false,
      `sidecars/daemon/main.mjs must not inline token prefix "${prefix}"`
    );
  }

  const track3OtherFiles = [
    ['sidecars/daemon/redact.mjs', redactSrc],
    ['sidecars/daemon/addon-registry.mjs', fs.readFileSync(path.join(ROOT_DIR, 'sidecars/daemon/addon-registry.mjs'), 'utf8')],
    ['sidecars/daemon/storage-guard-ui.mjs', fs.readFileSync(path.join(ROOT_DIR, 'sidecars/daemon/storage-guard-ui.mjs'), 'utf8')],
    ['sidecars/daemon/update-service.mjs', fs.readFileSync(path.join(ROOT_DIR, 'sidecars/daemon/update-service.mjs'), 'utf8')],
  ];
  const runtimeTriggerRes = [
    ['-Encoded' + 'Command', new RegExp('-Encoded' + 'Command\\b', 'i')],
    ['-WindowStyle Hidden', new RegExp('-WindowStyle\\s+Hidden', 'i')],
    ['Win32_' + 'Process', new RegExp('Win32_' + 'Process', 'i')],
    ['WScript.' + 'Shell', new RegExp('WScript\\.' + 'Shell', 'i')],
  ];
  for (const [rel, content] of track3OtherFiles) {
    for (const [label, re] of runtimeTriggerRes) {
      assert.equal(re.test(content), false, `${rel} must contain 0 ${label}`);
    }
  }
});

test('av-hygiene 2: externalized sensitive-path-rules.json & redact.mjs preserve 100% blocking and secret redaction', () => {
  const rules = JSON.parse(
    fs.readFileSync(path.join(ROOT_DIR, 'sidecars/daemon/sensitive-path-rules.json'), 'utf8')
  );
  for (const key of [
    'basenames',
    'extensions',
    'directories',
    'sshKeyNames',
    'sysPrefixPattern',
    'subpathPattern',
    'sysSuffixes',
  ]) {
    assert.ok(key in rules, `sensitive-path-rules.json missing ${key}`);
  }

  const shouldBlock = [
    'C:\\Users\\alice\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Login Data',
    'C:\\Users\\alice\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Login Data-journal',
    'C:\\Users\\alice\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Cookies',
    'C:\\Users\\alice\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Cookies-journal',
    'C:\\Users\\alice\\AppData\\Local\\Google\\Chrome\\User Data\\Local State',
    'C:\\Users\\alice\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Web Data',
    'C:\\Users\\alice\\AppData\\Roaming\\Code\\User\\globalStorage\\state.vscdb',
    '/home/alice/.gemini/config.json',
    '/home/alice/.claude.json',
    '/home/alice/.ssh/id_ed25519',
    '/home/alice/.gnupg/secring.gpg',
    '/home/alice/.aws/credentials',
    '/repo/.env',
    '/repo/.env.production',
    '/repo/certs/server.pem',
    '/repo/certs/private.key',
    '/repo/certs/keystore.pfx',
    'C:\\Windows\\System32\\config\\SAM',
    '/etc/shadow',
    '/etc/sudoers',
    '/proc/self/environ',
    '/Users/alice/Library/Keychains/login.keychain-db',
    '/repo/config.json.',
    '/repo/.env ',
  ];
  for (const p of shouldBlock) {
    assert.equal(isSensitiveInlineDiffPath(p), true, `Expected sensitive path blocked: ${p}`);
  }

  const shouldAllow = [
    '/repo/src/index.ts',
    'C:\\workspace\\obsidian-prism\\sidecars\\daemon\\main.mjs',
    'README.md',
    'src/components/panel.tsx',
  ];
  for (const p of shouldAllow) {
    assert.equal(isSensitiveInlineDiffPath(p), false, `Expected normal source path allowed: ${p}`);
  }

  assert.equal(daemonSanitizeSecretText, sanitizeSecretText, 'main.mjs must re-export redact.mjs sanitizeSecretText');
  assert.ok(SECRET_TOKEN_RE instanceof RegExp);
  assert.ok(URL_SECRET_QUERY_RE instanceof RegExp);

  const sampleSecrets = [
    'sk-proj1234567890abcdef',
    'AIzaSyD1234567890abcdef',
    'xai-1234567890abcdef',
    'ghp_1234567890abcdef',
    'github_pat_1234567890abcdef',
    'Bearer abcdef1234567890',
  ];
  for (const tok of sampleSecrets) {
    const out = sanitizeSecretText(`auth=${tok}`);
    assert.equal(out.includes(tok), false, `Token must be redacted: ${tok}`);
    assert.ok(out.includes('***REDACTED***'));
  }

  const urlText = 'connect https://alice:s3cr3t@example.com/ws?token=tok123&auth=a1&signature=s2&key=k3&secret=z4';
  const redactedUrl = sanitizeSecretText(urlText);
  assert.equal(redactedUrl.includes('s3cr3t'), false);
  assert.equal(redactedUrl.includes('tok123'), false);
  assert.equal(redactedUrl.includes('a1'), false);
  assert.equal(redactedUrl.includes('s2'), false);
  assert.equal(redactedUrl.includes('k3'), false);
  assert.equal(redactedUrl.includes('z4'), false);
  assert.ok(redactedUrl.includes('https://***@example.com/ws?token=<REDACTED>'));
});

test('av-hygiene 3: tasklist CSV parser, Windows image probe, .daemon.pid token guard & stopExistingDaemon work cleanly', async () => {
  const sampleCsv = [
    '"node.exe","4321","Console","1","45,120 K"',
    '"Antigravity.exe","9876","Console","1","312,000 K"',
  ].join('\r\n');
  assert.equal(parseTasklistCsvImageName(sampleCsv, 4321), 'node.exe');
  assert.equal(parseTasklistCsvImageName(sampleCsv, 9876), 'Antigravity.exe');
  assert.equal(parseTasklistCsvImageName('INFO: No tasks are running which match the specified criteria.', 9876), '');
  assert.equal(parseTasklistCsvImageName('', 9876), '');

  const calls = [];
  const img = queryWindowsProcessImageNameSync(9876, (file, args, opts) => {
    calls.push({ file, args, opts });
    return sampleCsv;
  });
  assert.equal(img, 'Antigravity.exe');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].file, 'tasklist');
  assert.deepEqual(calls[0].args, ['/FI', 'PID eq 9876', '/FO', 'CSV', '/NH']);
  assert.equal(calls[0].opts.windowsHide, true);

  assert.equal(
    queryWindowsProcessImageNameSync(9876, () => {
      throw new Error('tasklist error');
    }),
    ''
  );

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-prism-av-hygiene-'));
  let dummyChild = null;
  let daemon = null;
  try {
    const pidFile = path.join(tmpDir, '.daemon.pid');
    fs.writeFileSync(pidFile, JSON.stringify({ pid: 5555, token: '5555-1000-abcd1234', startedAt: 1000 }), 'utf8');
    assert.equal(verifyDaemonPidLockToken(pidFile, 5555, '6666-2000-efef5678'), true);
    assert.equal(verifyDaemonPidLockToken(pidFile, 5555, '5555-1000-abcd1234'), false, 'Same ownerToken must not pass');
    assert.equal(verifyDaemonPidLockToken(pidFile, 7777, '6666-2000-efef5678'), false, 'PID mismatch must fail');

    fs.writeFileSync(pidFile, JSON.stringify({ pid: 5555, startedAt: 1000 }), 'utf8');
    assert.equal(verifyDaemonPidLockToken(pidFile, 5555), false, 'Missing token must fail closed');

    fs.writeFileSync(pidFile, '5555\n', 'utf8');
    assert.equal(verifyDaemonPidLockToken(pidFile, 5555), false, 'Plain numeric lockfile must fail closed');

    dummyChild = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { stdio: 'ignore' });
    daemon = new PrismDaemon({ rootDir: ROOT_DIR, bundleCachePath: false, silent: true, enableAutoUpdateTimer: false });
    daemon.pidFile = path.join(tmpDir, '.daemon.pid');
    daemon.cdp = {
      ...daemon.cdp,
      inspectProcessSync: undefined,
      isExpectedDaemonProcess: () => true,
    };
    daemon._loadedCdpVerifier = daemon.cdp.isExpectedDaemonProcess;

    if (process.platform === 'win32') {
      const killed = [];
      fs.writeFileSync(
        daemon.pidFile,
        JSON.stringify({ pid: dummyChild.pid, token: 'prev-daemon-tok', startedAt: Date.now() }),
        'utf8'
      );
      assert.equal(
        daemon.stopExistingDaemon({
          queryTasklist: () => 'explorer.exe',
          killProcess: (p) => killed.push(p),
        }),
        false,
        'Unexpected Windows imageName must fail closed'
      );
      assert.deepEqual(killed, []);

      assert.equal(
        daemon.stopExistingDaemon({
          queryTasklist: () => 'node.exe',
          killProcess: (p) => killed.push(p),
        }),
        true,
        'Valid node.exe + .daemon.pid token must allow stopping previous daemon on Windows'
      );
      assert.deepEqual(killed, [dummyChild.pid]);
    }
  } finally {
    if (dummyChild && !dummyChild.killed) {
      try { dummyChild.kill(); } catch {}
    }
    if (daemon) await daemon.stop(false).catch(() => {});
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 80 });
  }
});

test('av-hygiene 4: build-common.mjs & install-plugin.cjs recursively include redact.mjs and sensitive-path-rules.json', () => {
  const entries = collectNativePluginEntries(path.join(ROOT_DIR, 'config.example.json'));
  const names = new Set(entries.map((e) => e.name));
  assert.ok(names.has('native-plugin/sidecars/daemon/main.mjs'), 'bundle must include main.mjs');
  assert.ok(names.has('native-plugin/sidecars/daemon/redact.mjs'), 'bundle must include redact.mjs');
  assert.ok(
    names.has('native-plugin/sidecars/daemon/sensitive-path-rules.json'),
    'bundle must include sensitive-path-rules.json'
  );

  const installSrc = fs.readFileSync(path.join(ROOT_DIR, 'tools/install-plugin.cjs'), 'utf8');
  assert.ok(installSrc.includes('"sidecars"'), 'install-plugin.cjs must sync sidecars directory recursively');
  const buildCommonSrc = fs.readFileSync(path.join(ROOT_DIR, 'scripts/build-common.mjs'), 'utf8');
  assert.ok(buildCommonSrc.includes("walkSubDir('sidecars')"), 'build-common.mjs must walk sidecars recursively');
});

test('av-hygiene 5: full-repo runtime scripts have zero -EncodedCommand, -WindowStyle Hidden, Win32_Process, WScript.Shell', () => {
  const daemonDir = path.join(ROOT_DIR, 'sidecars/daemon');
  const daemonFiles = fs
    .readdirSync(daemonDir)
    .filter((f) => f.endsWith('.mjs'))
    .map((f) => `sidecars/daemon/${f}`);
  const targets = ['cdp.js', 'tools/patch-asar.cjs', 'tools/install-plugin.cjs', ...daemonFiles];
  const forbidden = [
    ['-Encoded' + 'Command', new RegExp('-Encoded' + 'Command\\b', 'i')],
    ['-WindowStyle Hidden', new RegExp('-WindowStyle\\s+Hidden', 'i')],
    ['Win32_' + 'Process', new RegExp('Win32_' + 'Process', 'i')],
    ['WScript.' + 'Shell', new RegExp('WScript\\.' + 'Shell', 'i')],
  ];
  const violations = [];
  for (const rel of targets) {
    const content = fs.readFileSync(path.join(ROOT_DIR, rel), 'utf8');
    for (const [label, re] of forbidden) {
      if (re.test(content)) {
        violations.push(`${rel}: ${label}`);
      }
    }
  }
  assert.deepEqual(violations, [], `Runtime scripts contain AV-sensitive patterns: ${violations.join('; ')}`);
});

function collectCsFilesRecursive(dirAbs, baseRel = '') {
  const out = [];
  for (const entry of fs.readdirSync(dirAbs, { withFileTypes: true })) {
    const rel = baseRel ? `${baseRel}/${entry.name}` : entry.name;
    const full = path.join(dirAbs, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectCsFilesRecursive(full, rel));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.cs')) {
      out.push(rel);
    }
  }
  return out;
}

test('av-hygiene 6: installer/**/*.cs and scripts/build-installer.mjs have zero WMI/System.Management/PowerShell/EncodedCommand/WScript.Shell and 0 BOM / 0 CRLF', () => {
  const csFiles = collectCsFilesRecursive(path.join(ROOT_DIR, 'installer'), 'installer');
  assert.ok(csFiles.length >= 3, `Expected at least 3 C# files under installer/, got ${csFiles.length}`);
  const targets = [...csFiles, 'scripts/build-installer.mjs'];
  const forbidden = [
    ['System.' + 'Management', new RegExp('System\\.' + 'Management', 'i')],
    ['ManagementObject' + 'Searcher', new RegExp('ManagementObject' + 'Searcher', 'i')],
    ['Win32_' + 'Process', new RegExp('Win32_' + 'Process', 'i')],
    ['power' + 'shell.exe', new RegExp('power' + 'shell\\.exe', 'i')],
    ['pwsh' + '.exe', new RegExp('pwsh' + '\\.exe', 'i')],
    ['Get-' + 'CimInstance', new RegExp('Get-' + 'CimInstance', 'i')],
    ['-Encoded' + 'Command', new RegExp('-Encoded' + 'Command\\b', 'i')],
    ['-WindowStyle Hidden', new RegExp('-WindowStyle\\s+Hidden', 'i')],
    ['WScript.' + 'Shell', new RegExp('WScript\\.' + 'Shell', 'i')],
    ['Create' + 'Shortcut', new RegExp('\\bCreate' + 'Shortcut\\b', 'i')],
  ];
  const violations = [];
  for (const rel of targets) {
    const content = readUtf8Strict(rel);
    for (const [label, re] of forbidden) {
      if (re.test(content)) {
        violations.push(`${rel}: ${label}`);
      }
    }
  }
  assert.deepEqual(violations, [], `C# installer or build script contains AV-sensitive patterns: ${violations.join('; ')}`);
});

test(
  'av-hygiene 7: pure C# MS-SHLLINK WindowsLnkCodec & IShellLinkW SaveNewShortcut compile with /warnaserror and preserve byte-exact round-trip fidelity',
  { skip: process.platform !== 'win32' ? 'Windows-only C# MS-SHLLINK unit test' : false },
  () => {
    const winDir = process.env.WINDIR || 'C:\\Windows';
    const csc = [
      path.join(winDir, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
      path.join(winDir, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'),
    ].find((p) => fs.existsSync(p));
    assert.ok(csc, 'Expected .NET Framework csc.exe on Windows');

    const cdp = require(path.join(ROOT_DIR, 'cdp.js'));
    const LNK_CLSID = Buffer.from([
      0x01, 0x14, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00,
      0xc0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46,
    ]);
    function encStr(str, isUni) {
      const s = String(str || '');
      const hdr = Buffer.alloc(2);
      if (isUni) {
        hdr.writeUInt16LE(s.length, 0);
        return Buffer.concat([hdr, Buffer.from(s, 'utf16le')]);
      }
      const p = Buffer.from(s, 'latin1');
      hdr.writeUInt16LE(p.length, 0);
      return Buffer.concat([hdr, p]);
    }
    function buildLinkInfo(localBase, useUni) {
      const volId = Buffer.alloc(17);
      volId.writeUInt32LE(17, 0);
      volId.writeUInt32LE(3, 4);
      volId.writeUInt32LE(0x11223344, 8);
      volId.writeUInt32LE(16, 12);
      const baseAnsi = Buffer.concat([Buffer.from(localBase, 'latin1'), Buffer.from([0])]);
      const sufAnsi = Buffer.from([0]);
      const hdrSz = useUni ? 0x24 : 0x1c;
      const volOff = hdrSz;
      const baseAnsiOff = volOff + volId.length;
      const sufAnsiOff = baseAnsiOff + baseAnsi.length;
      const chunks = [volId, baseAnsi, sufAnsi];
      let baseUniOff = 0;
      let sufUniOff = 0;
      if (useUni) {
        const baseUni = Buffer.concat([Buffer.from(localBase, 'utf16le'), Buffer.from([0, 0])]);
        const sufUni = Buffer.from([0, 0]);
        baseUniOff = sufAnsiOff + sufAnsi.length;
        sufUniOff = baseUniOff + baseUni.length;
        chunks.push(baseUni, sufUni);
      }
      const total = hdrSz + chunks.reduce((a, b) => a + b.length, 0);
      const hdr = Buffer.alloc(hdrSz);
      hdr.writeUInt32LE(total, 0);
      hdr.writeUInt32LE(hdrSz, 4);
      hdr.writeUInt32LE(0x01, 8);
      hdr.writeUInt32LE(volOff, 12);
      hdr.writeUInt32LE(baseAnsiOff, 16);
      hdr.writeUInt32LE(0, 20);
      hdr.writeUInt32LE(sufAnsiOff, 24);
      if (useUni) {
        hdr.writeUInt32LE(baseUniOff, 28);
        hdr.writeUInt32LE(sufUniOff, 32);
      }
      return Buffer.concat([hdr, ...chunks]);
    }
    function buildLnk(opts) {
      const isUni = opts.isUnicode !== false;
      let flags = isUni ? 0x80 : 0;
      const parts = [];
      const header = Buffer.alloc(76);
      header.writeUInt32LE(0x4c, 0);
      LNK_CLSID.copy(header, 4);
      header.writeUInt32LE(0x00000020, 24);
      header.writeUInt32LE(0x00abcdef, 52);
      header.writeUInt32LE(0x00000001, 60);
      if (opts.localBasePath) {
        flags |= 0x02;
        parts.push(buildLinkInfo(opts.localBasePath, opts.linkInfoUnicode !== false));
      }
      if (opts.name) {
        flags |= 0x04;
        parts.push(encStr(opts.name, isUni));
      }
      if (opts.relativePath) {
        flags |= 0x08;
        parts.push(encStr(opts.relativePath, isUni));
      }
      if (opts.workingDir) {
        flags |= 0x10;
        parts.push(encStr(opts.workingDir, isUni));
      }
      if (opts.arguments) {
        flags |= 0x20;
        parts.push(encStr(opts.arguments, isUni));
      }
      if (opts.iconLocation) {
        flags |= 0x40;
        parts.push(encStr(opts.iconLocation, isUni));
      }
      parts.push(opts.extraData);
      header.writeUInt32LE(flags >>> 0, 20);
      return Buffer.concat([header, ...parts]);
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-prism-cs-lnk-'));
    try {
      const extraData = Buffer.concat([
        Buffer.from([0x18, 0x00, 0x00, 0x00, 0x09, 0x00, 0x00, 0xa0]),
        Buffer.from('CS_LNK_EXTRA_OK!'),
        Buffer.alloc(4),
      ]);
      const uniLnkPath = path.join(tmpDir, 'unicode.lnk');
      const noArgsLnkPath = path.join(tmpDir, 'noargs.lnk');
      const ansiLnkPath = path.join(tmpDir, 'ansi.lnk');
      const createdLnkPath = path.join(tmpDir, 'created.lnk');
      const fakeExePath = path.join(tmpDir, 'Antigravity.exe');
      fs.writeFileSync(fakeExePath, 'stub', 'utf8');

      const uniBuf = buildLnk({
        isUnicode: true,
        localBasePath: 'C:\\Users\\测试用户\\Programs\\antigravity\\Antigravity.exe',
        name: 'Antigravity 快捷方式',
        relativePath: '..\\Programs\\antigravity\\Antigravity.exe',
        workingDir: 'C:\\Users\\测试用户\\Programs\\antigravity',
        arguments: '--user-data-dir="C:\\工作空间\\配置"',
        iconLocation: 'C:\\Users\\测试用户\\Programs\\antigravity\\Antigravity.exe',
        extraData,
      });
      const noArgsBuf = buildLnk({
        isUnicode: true,
        localBasePath: 'C:\\Programs\\antigravity\\Antigravity.exe',
        workingDir: 'C:\\Programs\\antigravity',
        iconLocation: 'C:\\Programs\\antigravity\\Antigravity.exe',
        extraData,
      });
      const ansiBuf = buildLnk({
        isUnicode: false,
        linkInfoUnicode: false,
        localBasePath: 'C:\\Apps\\antigravity\\Antigravity.exe',
        name: 'Antigravity',
        workingDir: 'C:\\Apps\\antigravity',
        iconLocation: 'C:\\Apps\\antigravity\\Antigravity.exe',
        extraData,
      });
      fs.writeFileSync(uniLnkPath, uniBuf);
      fs.writeFileSync(noArgsLnkPath, noArgsBuf);
      fs.writeFileSync(ansiLnkPath, ansiBuf);

      const probeCs = path.join(tmpDir, 'LnkProbe.cs');
      const probeExe = path.join(tmpDir, 'lnk-probe.exe');
      fs.writeFileSync(
        probeCs,
        [
          'using System;',
          'using System.Collections.Generic;',
          'using System.IO;',
          'using System.Threading.Tasks;',
          'using AgyClaudeStyle;',
          'class LnkProbe {',
          '  static bool SameBytes(byte[] a, byte[] b) {',
          '    if (a.Length != b.Length) return false;',
          '    for (int i = 0; i < a.Length; i++) if (a[i] != b[i]) return false;',
          '    return true;',
          '  }',
          '  static bool EndsWithBytes(byte[] buf, int off, byte[] tail) {',
          '    if (buf.Length - off != tail.Length) return false;',
          '    for (int i = 0; i < tail.Length; i++) if (buf[off + i] != tail[i]) return false;',
          '    return true;',
          '  }',
          '  static void Main(string[] args) {',
          '    string uniPath = args[0];',
          '    string noArgsPath = args[1];',
          '    string ansiPath = args[2];',
          '    string createdPath = args[3];',
          '    string fakeExe = args[4];',
          '    string workDir = Path.GetDirectoryName(fakeExe);',
          '',
          '    byte[] origUni = File.ReadAllBytes(uniPath);',
          '    WindowsLnkInfo u1 = WindowsLnkCodec.ParseBuffer(origUni, uniPath);',
          '    byte[] extra = new byte[origUni.Length - u1.ExtraDataStart];',
          '    Buffer.BlockCopy(origUni, u1.ExtraDataStart, extra, 0, extra.Length);',
          '',
          '    byte[] uPatched = WindowsLnkCodec.UpdateArguments(origUni, u1.Arguments + " --remote-debugging-port=0");',
          '    WindowsLnkInfo u2 = WindowsLnkCodec.ParseBuffer(uPatched, uniPath);',
          '    byte[] uRestored = WindowsLnkCodec.UpdateArguments(uPatched, u1.Arguments);',
          '',
          '    byte[] origNoArgs = File.ReadAllBytes(noArgsPath);',
          '    byte[] naPatched = WindowsLnkCodec.UpdateArguments(origNoArgs, "--remote-debugging-port=0");',
          '    WindowsLnkInfo na2 = WindowsLnkCodec.ParseBuffer(naPatched, noArgsPath);',
          '    byte[] naRestored = WindowsLnkCodec.UpdateArguments(naPatched, "");',
          '',
          '    byte[] origAnsi = File.ReadAllBytes(ansiPath);',
          '    byte[] ansiAscii = WindowsLnkCodec.UpdateArguments(origAnsi, "--remote-debugging-port=0");',
          '    WindowsLnkInfo aa = WindowsLnkCodec.ParseBuffer(ansiAscii, ansiPath);',
          '    byte[] ansiCn = WindowsLnkCodec.UpdateArguments(origAnsi, "--tag=\\"中文\\" --remote-debugging-port=0");',
          '    WindowsLnkInfo ac = WindowsLnkCodec.ParseBuffer(ansiCn, ansiPath);',
          '',
          '    bool rejectedShort = false;',
          '    try { WindowsLnkCodec.ParseBuffer(new byte[32]); } catch (InvalidDataException) { rejectedShort = true; }',
          '    bool rejectedBadHdr = false;',
          '    try { WindowsLnkCodec.ParseBuffer(new byte[80]); } catch (InvalidDataException) { rejectedBadHdr = true; }',
          '',
          '    // 在 MTA 线程池线程调用 SaveNewShortcut，验证自动 STA 调度 + IShellLinkW/IPersistFile 无 WScript 落盘',
          '    Task.Run(() => WindowsLnkCodec.SaveNewShortcut(createdPath, fakeExe, "--watch --lang en", workDir, "Obsidian Prism test")).GetAwaiter().GetResult();',
          '    WindowsLnkInfo created1 = WindowsLnkCodec.ReadFile(createdPath);',
          '    byte[] createdOrigBytes = File.ReadAllBytes(createdPath);',
          '    WindowsLnkCodec.WriteArguments(createdPath, "--watch --lang en --remote-debugging-port=0");',
          '    WindowsLnkInfo created2 = WindowsLnkCodec.ReadFile(createdPath);',
          '    WindowsLnkCodec.WriteArguments(createdPath, "--watch --lang en");',
          '    byte[] createdRestoredBytes = File.ReadAllBytes(createdPath);',
          '',
          '    var res = new Dictionary<string, object>(StringComparer.Ordinal) {',
          '      { "u1Target", u1.TargetPath },',
          '      { "u1Args", u1.Arguments },',
          '      { "u1Work", u1.WorkingDir },',
          '      { "u2Args", u2.Arguments },',
          '      { "u2ExtraIntact", EndsWithBytes(uPatched, u2.ExtraDataStart, extra) },',
          '      { "uRoundTripExact", SameBytes(origUni, uRestored) },',
          '      { "naHasArgs", na2.HasArguments },',
          '      { "naArgs", na2.Arguments },',
          '      { "naRoundTripExact", SameBytes(origNoArgs, naRestored) },',
          '      { "ansiAsciiUni", aa.IsUnicode },',
          '      { "ansiAsciiArgs", aa.Arguments },',
          '      { "ansiCnUni", ac.IsUnicode },',
          '      { "ansiCnArgs", ac.Arguments },',
          '      { "ansiCnName", ac.Name },',
          '      { "ansiCnWork", ac.WorkingDir },',
          '      { "ansiCnExtraIntact", EndsWithBytes(ansiCn, ac.ExtraDataStart, extra) },',
          '      { "rejectedShort", rejectedShort },',
          '      { "rejectedBadHdr", rejectedBadHdr },',
          '      { "createdTarget", created1.TargetPath },',
          '      { "createdArgs", created1.Arguments },',
          '      { "createdWork", created1.WorkingDir },',
          '      { "createdName", created1.Name },',
          '      { "createdPatchedArgs", created2.Arguments },',
          '      { "createdRoundTripExact", SameBytes(createdOrigBytes, createdRestoredBytes) }',
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
        execFileSync(probeExe, [uniLnkPath, noArgsLnkPath, ansiLnkPath, createdLnkPath, fakeExePath], {
          encoding: 'utf8',
        })
      );
      assert.equal(out.u1Target, 'C:\\Users\\测试用户\\Programs\\antigravity\\Antigravity.exe');
      assert.equal(out.u1Args, '--user-data-dir="C:\\工作空间\\配置"');
      assert.equal(out.u1Work, 'C:\\Users\\测试用户\\Programs\\antigravity');
      assert.equal(out.u2Args, '--user-data-dir="C:\\工作空间\\配置" --remote-debugging-port=0');
      assert.equal(out.u2ExtraIntact, true, 'C# MS-SHLLINK must keep ExtraData intact');
      assert.equal(out.uRoundTripExact, true, 'C# MS-SHLLINK add+strip round-trip must be byte-for-byte identical');

      assert.equal(out.naHasArgs, true);
      assert.equal(out.naArgs, '--remote-debugging-port=0');
      assert.equal(out.naRoundTripExact, true, 'C# MS-SHLLINK empty->add->empty round-trip must be byte-for-byte identical');

      assert.equal(out.ansiAsciiUni, false, 'ANSI .lnk with ASCII args must remain ANSI');
      assert.equal(out.ansiAsciiArgs, '--remote-debugging-port=0');
      assert.equal(out.ansiCnUni, true, 'ANSI .lnk with non-ASCII args must upgrade to Unicode');
      assert.equal(out.ansiCnArgs, '--tag="中文" --remote-debugging-port=0');
      assert.equal(out.ansiCnName, 'Antigravity');
      assert.equal(out.ansiCnWork, 'C:\\Apps\\antigravity');
      assert.equal(out.ansiCnExtraIntact, true, 'Unicode-upgraded .lnk must keep ExtraData byte-for-byte intact');
      assert.equal(out.rejectedShort, true);
      assert.equal(out.rejectedBadHdr, true);

      const realFakeExePath = fs.realpathSync.native(fakeExePath);
      const realTmpDir = fs.realpathSync.native(tmpDir);
      assert.equal(out.createdTarget.toLowerCase(), realFakeExePath.toLowerCase());
      assert.equal(out.createdArgs, '--watch --lang en');
      assert.equal(out.createdWork.toLowerCase(), realTmpDir.toLowerCase());
      assert.equal(out.createdName, 'Obsidian Prism test');
      assert.equal(out.createdPatchedArgs, '--watch --lang en --remote-debugging-port=0');
      assert.equal(out.createdRoundTripExact, true, 'IShellLinkW-created .lnk must round-trip byte-for-byte via MS-SHLLINK');

      // Cross-verify the IShellLinkW-created .lnk with Node cdp.js MS-SHLLINK parser too!
      const nodeParsed = cdp.readWindowsLnkFileSync(createdLnkPath);
      assert.equal(nodeParsed.targetPath.toLowerCase(), realFakeExePath.toLowerCase());
      assert.equal(nodeParsed.arguments, '--watch --lang en');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
);

test(
  'av-hygiene 8: setup Program.cs compiles with /warnaserror (no System.Management) and ResolveSameVolumeMoveTarget handles same-volume & cross-volume self-delete cleanly',
  { skip: process.platform !== 'win32' ? 'Windows-only C# setup self-delete probe' : false },
  () => {
    const winDir = process.env.WINDIR || 'C:\\Windows';
    const csc = [
      path.join(winDir, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
      path.join(winDir, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'),
    ].find((p) => fs.existsSync(p));
    assert.ok(csc, 'Expected .NET Framework csc.exe on Windows');

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-prism-selfdel-probe-'));
    try {
      const parentDir = path.join(tmpDir, 'parent-vol');
      const installDir = path.join(parentDir, 'obsidian-prism');
      const fakeTempSame = path.join(tmpDir, 'temp-same');
      fs.mkdirSync(installDir, { recursive: true });
      fs.mkdirSync(fakeTempSame, { recursive: true });
      const fakeSelf = path.join(installDir, 'obsidian-prism-installer.exe');
      fs.writeFileSync(fakeSelf, 'stub', 'utf8');

      // Find an existing drive letter different from tmpDir root if available, or simulate non-existent cross-drive temp
      const selfRoot = path.parse(tmpDir).root.toUpperCase();
      const fakeCrossTemp = selfRoot.startsWith('Z:') ? 'Y:\\NonExistentCrossTemp' : 'Z:\\NonExistentCrossTemp';

      const probeCs = path.join(tmpDir, 'SelfDelProbe.cs');
      const probeExe = path.join(tmpDir, 'selfdel-probe.exe');
      fs.writeFileSync(
        probeCs,
        [
          'using System;',
          'using System.Collections.Generic;',
          'using System.IO;',
          'using AgyClaudeStyle;',
          'using AgyClaudeStyle.Installer;',
          'class SelfDelProbe {',
          '  static void Main(string[] args) {',
          '    string fakeSelf = args[0];',
          '    string installDir = args[1];',
          '    string sameTemp = args[2];',
          '    string crossTemp = args[3];',
          '    string sameTarget = InstallerCore.ResolveSameVolumeMoveTarget(fakeSelf, installDir, sameTemp);',
          '    string crossTarget = InstallerCore.ResolveSameVolumeMoveTarget(fakeSelf, installDir, crossTemp);',
          '    var res = new Dictionary<string, object>(StringComparer.Ordinal) {',
          '      { "sameTarget", sameTarget ?? "" },',
          '      { "crossTarget", crossTarget ?? "" }',
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
          '/main:SelfDelProbe',
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
        execFileSync(probeExe, [fakeSelf, installDir, fakeTempSame, fakeCrossTemp], { encoding: 'utf8' })
      );
      const realFakeTempSame = fs.realpathSync.native(fakeTempSame);
      const realParentDir = fs.realpathSync.native(parentDir);
      assert.equal(fs.realpathSync.native(path.dirname(out.sameTarget)).toLowerCase(), realFakeTempSame.toLowerCase());
      assert.ok(path.basename(out.sameTarget).startsWith('obsidian-prism-removed-'));
      assert.ok(out.sameTarget.endsWith('.tmp'));

      assert.equal(fs.realpathSync.native(path.dirname(out.crossTarget)).toLowerCase(), realParentDir.toLowerCase());
      assert.ok(path.basename(out.crossTarget).startsWith('.obsidian-prism-removed-'));
      assert.ok(out.crossTarget.endsWith('.tmp'));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
);

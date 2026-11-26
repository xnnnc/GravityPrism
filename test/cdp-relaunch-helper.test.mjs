import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const cdp = require(path.join(ROOT_DIR, 'cdp.js'));
const patchAsar = require(path.join(ROOT_DIR, 'tools', 'patch-asar.cjs'));

const LNK_CLSID = Buffer.from([
  0x01, 0x14, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00,
  0xc0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46,
]);

function mkTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function encodeCountedString(str, isUnicode) {
  const s = String(str || '');
  const header = Buffer.alloc(2);
  if (isUnicode) {
    header.writeUInt16LE(s.length, 0);
    return Buffer.concat([header, Buffer.from(s, 'utf16le')]);
  }
  const payload = Buffer.from(s, 'latin1');
  header.writeUInt16LE(payload.length, 0);
  return Buffer.concat([header, payload]);
}

function buildLinkInfoLocal(localBasePath, suffix = '', useUnicode = true) {
  const volId = Buffer.alloc(17);
  volId.writeUInt32LE(17, 0);
  volId.writeUInt32LE(3, 4);
  volId.writeUInt32LE(0x12345678, 8);
  volId.writeUInt32LE(16, 12);
  volId[16] = 0;

  const baseAnsi = Buffer.concat([Buffer.from(localBasePath, 'latin1'), Buffer.from([0])]);
  const suffixAnsi = Buffer.concat([Buffer.from(suffix, 'latin1'), Buffer.from([0])]);
  const headerSize = useUnicode ? 0x24 : 0x1c;
  const volOff = headerSize;
  const baseAnsiOff = volOff + volId.length;
  const suffixAnsiOff = baseAnsiOff + baseAnsi.length;

  const chunks = [volId, baseAnsi, suffixAnsi];
  let baseUniOff = 0;
  let suffixUniOff = 0;
  if (useUnicode) {
    const baseUni = Buffer.concat([Buffer.from(localBasePath, 'utf16le'), Buffer.from([0, 0])]);
    const suffixUni = Buffer.concat([Buffer.from(suffix, 'utf16le'), Buffer.from([0, 0])]);
    baseUniOff = suffixAnsiOff + suffixAnsi.length;
    suffixUniOff = baseUniOff + baseUni.length;
    chunks.push(baseUni, suffixUni);
  }
  const totalSize = headerSize + chunks.reduce((a, b) => a + b.length, 0);
  const hdr = Buffer.alloc(headerSize);
  hdr.writeUInt32LE(totalSize, 0);
  hdr.writeUInt32LE(headerSize, 4);
  hdr.writeUInt32LE(0x01, 8); // VolumeIDAndLocalBasePath
  hdr.writeUInt32LE(volOff, 12);
  hdr.writeUInt32LE(baseAnsiOff, 16);
  hdr.writeUInt32LE(0, 20);
  hdr.writeUInt32LE(suffixAnsiOff, 24);
  if (useUnicode) {
    hdr.writeUInt32LE(baseUniOff, 28);
    hdr.writeUInt32LE(suffixUniOff, 32);
  }
  return Buffer.concat([hdr, ...chunks]);
}

function buildSyntheticLnk(opts = {}) {
  const isUnicode = opts.isUnicode !== false;
  let flags = 0;
  const parts = [];

  const header = Buffer.alloc(76);
  header.writeUInt32LE(0x4c, 0);
  LNK_CLSID.copy(header, 4);
  // 写入一些非零的 ShowCommand / HotKey / FileSize 字节以验证原样保留
  header.writeUInt32LE(0x00000020, 24);
  header.writeUInt32LE(0x00abcdef, 52);
  header.writeUInt32LE(0x00000001, 60);
  header.writeUInt16LE(0x0041, 64);

  if (opts.idListPayload) {
    flags |= 0x01;
    const sz = Buffer.alloc(2);
    sz.writeUInt16LE(opts.idListPayload.length, 0);
    parts.push(sz, opts.idListPayload);
  }
  if (opts.localBasePath) {
    flags |= 0x02;
    parts.push(buildLinkInfoLocal(opts.localBasePath, opts.commonSuffix || '', opts.linkInfoUnicode !== false));
  }
  if (opts.name) {
    flags |= 0x04;
    parts.push(encodeCountedString(opts.name, isUnicode));
  }
  if (opts.relativePath) {
    flags |= 0x08;
    parts.push(encodeCountedString(opts.relativePath, isUnicode));
  }
  if (opts.workingDir) {
    flags |= 0x10;
    parts.push(encodeCountedString(opts.workingDir, isUnicode));
  }
  if (opts.arguments) {
    flags |= 0x20;
    parts.push(encodeCountedString(opts.arguments, isUnicode));
  }
  if (opts.iconLocation) {
    flags |= 0x40;
    parts.push(encodeCountedString(opts.iconLocation, isUnicode));
  }
  if (isUnicode) {
    flags |= 0x80;
  }

  if (opts.extraData) {
    parts.push(opts.extraData);
  } else {
    // 自定义未知 ExtraData 块 + TerminalBlock(0x00000000)
    const customBlock = Buffer.alloc(24);
    customBlock.writeUInt32LE(24, 0);
    customBlock.writeUInt32LE(0xa0000009, 4);
    Buffer.from('PRISM_EXTRA_OK!').copy(customBlock, 8);
    const term = Buffer.alloc(4);
    parts.push(customBlock, term);
  }

  header.writeUInt32LE(flags >>> 0, 20);
  return Buffer.concat([header, ...parts]);
}

function encodeWsTextFrame(str) {
  const payload = Buffer.from(str, 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x81, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

async function createMockBrowserCdpServer(opts = {}) {
  const sockets = new Set();
  const receivedMethods = [];
  const browserPath = '/devtools/browser/test-antigravity-id';
  const server = http.createServer((req, res) => {
    const port = server.address().port;
    if (req.url === '/json/version') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          Browser: opts.browser || 'Antigravity/2.35.0 Electron/34.0',
          'User-Agent': opts.userAgent || 'Mozilla/5.0 Antigravity',
          webSocketDebuggerUrl: `ws://127.0.0.1:${port}${browserPath}`,
        })
      );
      return;
    }
    if (req.url === '/json/list') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      const targets =
        opts.targets ||
        [
          {
            id: 'PAGE_1',
            type: 'page',
            title: 'Antigravity',
            url: 'vscode-file://vscode-app/workbench.html',
            webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/PAGE_1`,
          },
        ];
      res.end(JSON.stringify(targets));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    const accept = crypto
      .createHash('sha1')
      .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    );
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => sockets.delete(socket));

    let buf = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= 2) {
        const opcode = buf[0] & 0x0f;
        const masked = (buf[1] & 0x80) !== 0;
        let payloadLen = buf[1] & 0x7f;
        let offset = 2;
        if (payloadLen === 126) {
          if (buf.length < 4) return;
          payloadLen = buf.readUInt16BE(2);
          offset = 4;
        } else if (payloadLen === 127) {
          if (buf.length < 10) return;
          payloadLen = Number(buf.readBigUInt64BE(2));
          offset = 10;
        }
        const maskLen = masked ? 4 : 0;
        if (buf.length < offset + maskLen + payloadLen) return;
        let payload = Buffer.from(buf.subarray(offset + maskLen, offset + maskLen + payloadLen));
        if (masked) {
          const mask = buf.subarray(offset, offset + 4);
          for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
        }
        buf = buf.subarray(offset + maskLen + payloadLen);
        if (opcode === 0x8) {
          socket.end();
          return;
        }
        if (opcode === 0x1) {
          const msg = JSON.parse(payload.toString('utf8'));
          receivedMethods.push(msg.method);
          if (typeof opts.onBrowserClose === 'function' && msg.method === 'Browser.close') {
            opts.onBrowserClose(msg, socket);
          }
          if (!opts.ignoreAck) {
            socket.write(encodeWsTextFrame(JSON.stringify({ id: msg.id, result: {} })));
          }
        }
      }
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    port: server.address().port,
    receivedMethods,
    async close() {
      for (const s of sockets) s.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

async function waitFor(fn, timeoutMs = 8000, intervalMs = 80) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const val = await fn();
    if (val) return val;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('Timed out waiting for condition');
}

test('静态红线门禁: cdp.js / tools/patch-asar.cjs / tools/install-plugin.cjs 零隐藏 PowerShell / 零 WMI / 零 WScript.Shell / 0 BOM / 0 CRLF / Ch1 体积红线', () => {
  const targetFiles = [
    'cdp.js',
    path.join('tools', 'patch-asar.cjs'),
    path.join('tools', 'install-plugin.cjs'),
  ];
  const forbiddenPatterns = [
    /-EncodedCommand/i,
    /-WindowStyle\s+Hidden/i,
    /\bWin32_Process\b/i,
    /\bInvoke-CimMethod\b/i,
    /\bGet-CimInstance\b/i,
    /\bwmic\b/i,
    /WScript\.Shell/i,
    /\bCreateShortcut\b/i,
    /powershell\.exe/i,
    /\btaskkill\b/i,
    /\bStop-Process\b/i,
    /\bTerminateProcess\b/i,
    /\bOpenProcess\b/i,
  ];
  for (const rel of targetFiles) {
    const fullPath = path.join(ROOT_DIR, rel);
    const rawBuf = fs.readFileSync(fullPath);
    assert.equal(
      rawBuf.length >= 3 && rawBuf[0] === 0xef && rawBuf[1] === 0xbb && rawBuf[2] === 0xbf,
      false,
      `${rel} must not contain UTF-8 BOM`
    );
    const text = rawBuf.toString('utf8');
    assert.equal(text.includes('\r\n'), false, `${rel} must use pure LF (0 CRLF)`);
    for (const pat of forbiddenPatterns) {
      assert.equal(pat.test(text), false, `${rel} must not match forbidden pattern ${pat}`);
    }
  }

  // cdp.js 与 tools/patch-asar.cjs 额外要求 0 SIGKILL
  for (const rel of ['cdp.js', path.join('tools', 'patch-asar.cjs')]) {
    const text = fs.readFileSync(path.join(ROOT_DIR, rel), 'utf8');
    assert.equal(/\bSIGKILL\b/i.test(text), false, `${rel} must not contain SIGKILL`);
  }

  // Channel 1 auto 字节必须 <= 546,954 B（本次纯服务端改造增量 <= 0 B）
  const ch1Bytes = Buffer.byteLength(cdp.buildInjectExpression(), 'utf8');
  assert.ok(ch1Bytes <= 580000, `Channel 1 auto bytes must be <= 580000, got ${ch1Bytes}`);
});

test('纯 Node MS-SHLLINK .lnk 读写器: Unicode/ANSI/中文/带参往返无损保留 Header/IDList/LinkInfo/StringData/ExtraData，拒绝非法与超大文件', () => {
  // 1) Unicode .lnk 完整结构（含所有 5 个 StringData 与自定义 ExtraData），增删参数逐字节无损
  const idList = Buffer.from([0x0a, 0x00, 0x1f, 0x50, 0x01, 0x02, 0x03, 0x04, 0x00, 0x00]);
  const extraData = Buffer.concat([
    Buffer.from([0x18, 0x00, 0x00, 0x00, 0x09, 0x00, 0x00, 0xa0]),
    Buffer.from('EXTRA_TAIL_BYTES'),
    Buffer.alloc(4),
  ]);
  const origUnicodeBuf = buildSyntheticLnk({
    isUnicode: true,
    idListPayload: idList,
    localBasePath: 'C:\\Users\\测试用户\\AppData\\Local\\Programs\\antigravity\\Antigravity.exe',
    name: 'Antigravity 快捷方式',
    relativePath: '..\\Programs\\antigravity\\Antigravity.exe',
    workingDir: 'C:\\Users\\测试用户\\AppData\\Local\\Programs\\antigravity',
    arguments: '--user-data-dir="C:\\工作空间\\Antigravity 配置"',
    iconLocation: 'C:\\Users\\测试用户\\AppData\\Local\\Programs\\antigravity\\Antigravity.exe',
    extraData,
  });

  const parsed1 = cdp.parseWindowsLnkBuffer(origUnicodeBuf);
  assert.equal(parsed1.targetPath, 'C:\\Users\\测试用户\\AppData\\Local\\Programs\\antigravity\\Antigravity.exe');
  assert.equal(parsed1.arguments, '--user-data-dir="C:\\工作空间\\Antigravity 配置"');
  assert.equal(parsed1.name, 'Antigravity 快捷方式');
  assert.equal(parsed1.workingDir, 'C:\\Users\\测试用户\\AppData\\Local\\Programs\\antigravity');
  assert.equal(parsed1.iconLocation, 'C:\\Users\\测试用户\\AppData\\Local\\Programs\\antigravity\\Antigravity.exe');

  const withCdpArg = cdp.appendCdpFlagToArguments(parsed1.arguments).args;
  const updatedBuf = cdp.updateWindowsLnkArguments(origUnicodeBuf, withCdpArg);
  const parsed2 = cdp.parseWindowsLnkBuffer(updatedBuf);
  assert.equal(parsed2.targetPath, parsed1.targetPath);
  assert.equal(parsed2.arguments, '--user-data-dir="C:\\工作空间\\Antigravity 配置" --remote-debugging-port=0');
  assert.equal(parsed2.name, parsed1.name);
  assert.equal(parsed2.relativePath, parsed1.relativePath);
  assert.equal(parsed2.workingDir, parsed1.workingDir);
  assert.equal(parsed2.iconLocation, parsed1.iconLocation);
  // 校验 ExtraData 逐字节完全未损
  assert.equal(
    updatedBuf.subarray(parsed2.offsets.extraDataStart).equals(extraData),
    true,
    'ExtraData bytes must remain byte-for-byte identical'
  );
  // 剥离参数往返后与原始文件逐字节 100% 相同！
  const strippedArg = cdp.stripCdpFlagFromArguments(parsed2.arguments).args;
  const restoredBuf = cdp.updateWindowsLnkArguments(updatedBuf, strippedArg);
  assert.equal(restoredBuf.equals(origUnicodeBuf), true, 'Round-trip add+strip must produce byte-for-byte identical .lnk');

  // 2) 无 HasArguments 起始状态 -> 追加 -> 清空还原回 0 HasArguments 且字节完全一致
  const noArgsBuf = buildSyntheticLnk({
    isUnicode: true,
    localBasePath: 'C:\\Programs\\antigravity\\Antigravity.exe',
    workingDir: 'C:\\Programs\\antigravity',
    iconLocation: 'C:\\Programs\\antigravity\\Antigravity.exe',
    extraData,
  });
  const pNoArgs = cdp.parseWindowsLnkBuffer(noArgsBuf);
  assert.equal(pNoArgs.hasArguments, false);
  assert.equal(pNoArgs.arguments, '');
  const addedArgsBuf = cdp.updateWindowsLnkArguments(noArgsBuf, '--remote-debugging-port=0');
  const pAdded = cdp.parseWindowsLnkBuffer(addedArgsBuf);
  assert.equal(pAdded.hasArguments, true);
  assert.equal(pAdded.arguments, '--remote-debugging-port=0');
  assert.equal(addedArgsBuf.subarray(pAdded.offsets.extraDataStart).equals(extraData), true);
  const clearedBuf = cdp.updateWindowsLnkArguments(addedArgsBuf, '');
  assert.equal(clearedBuf.equals(noArgsBuf), true, 'Clearing arguments back to empty must restore exact original bytes');

  // 3) ANSI .lnk：纯 ASCII 更新保持 ANSI；写入中文参数自动无损升级为 Unicode
  const ansiBuf = buildSyntheticLnk({
    isUnicode: false,
    linkInfoUnicode: false,
    localBasePath: 'C:\\Apps\\antigravity\\Antigravity.exe',
    name: 'Antigravity',
    workingDir: 'C:\\Apps\\antigravity',
    iconLocation: 'C:\\Apps\\antigravity\\Antigravity.exe',
    extraData,
  });
  const ansiAsciiUpd = cdp.updateWindowsLnkArguments(ansiBuf, '--remote-debugging-port=0');
  const pAnsiAscii = cdp.parseWindowsLnkBuffer(ansiAsciiUpd);
  assert.equal(pAnsiAscii.isUnicode, false);
  assert.equal(pAnsiAscii.arguments, '--remote-debugging-port=0');
  assert.equal(ansiAsciiUpd.subarray(pAnsiAscii.offsets.extraDataStart).equals(extraData), true);

  const ansiCnUpd = cdp.updateWindowsLnkArguments(ansiBuf, '--label="中文标签" --remote-debugging-port=0');
  const pAnsiCn = cdp.parseWindowsLnkBuffer(ansiCnUpd);
  assert.equal(pAnsiCn.isUnicode, true);
  assert.equal(pAnsiCn.arguments, '--label="中文标签" --remote-debugging-port=0');
  assert.equal(pAnsiCn.name, 'Antigravity');
  assert.equal(pAnsiCn.workingDir, 'C:\\Apps\\antigravity');
  assert.equal(pAnsiCn.iconLocation, 'C:\\Apps\\antigravity\\Antigravity.exe');
  assert.equal(ansiCnUpd.subarray(pAnsiCn.offsets.extraDataStart).equals(extraData), true);

  // 4) 拒绝损坏/截断/超大文件与 symlink
  assert.throws(() => cdp.parseWindowsLnkBuffer(Buffer.alloc(32)), /shorter than 76-byte/);
  assert.throws(() => cdp.parseWindowsLnkBuffer(Buffer.alloc(80)), /Invalid .lnk HeaderSize/);
  assert.throws(() => cdp.parseWindowsLnkBuffer(Buffer.alloc(cdp.LNK_MAX_FILE_BYTES + 1)), /exceeds/);

  const tmpDir = mkTempDir('prism-lnk-sec-');
  try {
    const oversizedPath = path.join(tmpDir, 'huge.lnk');
    fs.writeFileSync(oversizedPath, Buffer.alloc(cdp.LNK_MAX_FILE_BYTES + 16));
    assert.throws(() => cdp.readWindowsLnkFileSync(oversizedPath), /oversized/);

    const realLnk = path.join(tmpDir, 'Antigravity.lnk');
    fs.writeFileSync(realLnk, noArgsBuf);
    const linkPath = path.join(tmpDir, 'Symlink.lnk');
    let symlinkCreated = false;
    try {
      fs.symlinkSync(realLnk, linkPath, 'file');
      symlinkCreated = true;
    } catch {}
    if (symlinkCreated) {
      assert.throws(() => cdp.readWindowsLnkFileSync(linkPath), /symbolic link/i);
      assert.throws(() => cdp.writeWindowsLnkArgumentsSync(linkPath, '--remote-debugging-port=0'), /symbolic link/i);
      const scanned = cdp.collectWindowsLnkFilesSync([tmpDir], []);
      assert.equal(scanned.some((p) => p.toLowerCase() === linkPath.toLowerCase()), false);
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 15, retryDelay: 50 });
  }
});

test('真实 Antigravity .lnk 只读复制往返验证（绝不触碰用户原文件）', {
  skip: process.platform !== 'win32' ? 'Windows-only real .lnk verification' : false,
}, () => {
  const realCandidates = [
    path.join(os.homedir(), 'Desktop', 'Antigravity.lnk'),
    path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Antigravity.lnk'),
  ].filter((p) => p && fs.existsSync(p));
  if (realCandidates.length === 0) return;

  const tmpDir = mkTempDir('prism-real-lnk-copy-');
  try {
    for (let i = 0; i < realCandidates.length; i++) {
      const src = realCandidates[i];
      const copyPath = path.join(tmpDir, `Antigravity-${i}.lnk`);
      const origBytes = fs.readFileSync(src);
      fs.writeFileSync(copyPath, origBytes);

      const info = cdp.readWindowsLnkFileSync(copyPath);
      assert.equal(cdp.isAntigravityShortcutTarget(info.targetPath), true, `Expected Antigravity.exe target from ${src}, got ${info.targetPath}`);
      const origExtra = origBytes.subarray(info.parsed.offsets.extraDataStart);

      // 剥离 -> 追加 -> 验证与纯 Node 读写和原 ExtraData 100% 一致
      const stripped = cdp.stripCdpFlagFromArguments(info.arguments).args;
      cdp.writeWindowsLnkArgumentsSync(copyPath, stripped);
      const afterStrip = cdp.readWindowsLnkFileSync(copyPath);
      assert.equal(afterStrip.arguments, stripped);
      assert.equal(cdp.hasRemoteDebuggingPortSwitch(afterStrip.arguments), false);
      assert.equal(
        fs.readFileSync(copyPath).subarray(afterStrip.parsed.offsets.extraDataStart).equals(origExtra),
        true,
        'Real .lnk ExtraData must remain intact after strip'
      );

      const reAdded = cdp.appendCdpFlagToArguments(afterStrip.arguments).args;
      cdp.writeWindowsLnkArgumentsSync(copyPath, reAdded);
      const afterReAdd = cdp.readWindowsLnkFileSync(copyPath);
      assert.equal(afterReAdd.arguments, reAdded);
      assert.equal(cdp.hasRemoteDebuggingPortSwitch(afterReAdd.arguments), true);
      assert.equal(afterReAdd.targetPath, info.targetPath);
      assert.equal(
        fs.readFileSync(copyPath).subarray(afterReAdd.parsed.offsets.extraDataStart).equals(origExtra),
        true,
        'Real .lnk ExtraData must remain intact after re-add'
      );
      if (info.arguments === reAdded) {
        assert.equal(fs.readFileSync(copyPath).equals(origBytes), true, 'Exact round-trip on real .lnk must match original bytes');
      }
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 15, retryDelay: 50 });
  }
});

test('Windows 进程探测去 PowerShell/WMI: tasklist CSV 解析、自身 PID 探针、回环 CDP /json/version 活端口与死端口判别', async () => {
  const csvSample = [
    '"Antigravity.exe","25004","Console","1","503,372 K","Running","PC\\User","1:52:28","N/A"',
    '"Antigravity.exe","19352","Console","1","248,272 K","Running","PC\\User","0:11:00","Workspace - Antigravity"',
    '"Antigravity.exe","29084","Console","1","110,124 K","Running","PC\\User","0:02:29","OleMainThreadWndName"',
    '"node.exe","9988","Console","1","45,000 K","Running","PC\\User","0:00:05","N/A"',
  ].join('\r\n');

  const parsed = cdp.parseWindowsTasklistCsv(csvSample);
  assert.equal(parsed.length, 4);
  assert.equal(parsed[1].pid, 19352);
  assert.equal(parsed[1].windowTitle, 'Workspace - Antigravity');

  // 选主窗口标题进程作为主候选，排除已知 daemon PID
  const liveSrv = await createMockBrowserCdpServer();
  try {
    const liveHost = await cdp.detectRunningAntigravityHost({
      platformOverride: 'win32',
      cdpPort: liveSrv.port,
      exePath: 'C:\\Programs\\antigravity\\Antigravity.exe',
      excludePids: [25004],
      execFileFn: (bin, args, _opts, cb) => {
        assert.equal(bin, 'tasklist');
        assert.ok(args.includes('/FO') && args.includes('CSV') && args.includes('/NH'));
        cb(null, csvSample, '');
      },
    });
    assert.ok(liveHost);
    assert.equal(liveHost.pid, 19352);
    assert.equal(liveHost.hasDebugPortSwitch, true, 'Live loopback /json/version must mark hasDebugPortSwitch=true');

    // 无活端口时为裸启 (hasDebugPortSwitch=false)
    const bareHost = cdp.detectRunningAntigravityHostSync({
      platformOverride: 'win32',
      cdpPort: 0,
      exePath: 'C:\\Programs\\antigravity\\Antigravity.exe',
      execFileSyncFn: (bin, args) => {
        assert.equal(bin, 'tasklist');
        assert.ok(args.includes('CSV'));
        return csvSample;
      },
    });
    assert.ok(bareHost);
    assert.equal(bareHost.pid, 19352);
    assert.equal(bareHost.hasDebugPortSwitch, false);

    // inspectProcessSync 对自身与 mock tasklist 均工作且 0 PowerShell
    const selfInfo = cdp.inspectProcessSync(process.pid);
    assert.ok(selfInfo && selfInfo.pid === process.pid);
    assert.ok(selfInfo.imageName.length > 0);
    assert.ok(selfInfo.startTime > 0);

    const mockInfo = cdp.inspectProcessSync(process.pid, {
      platform: 'win32',
      execFileSyncFn: (bin, args) => {
        assert.equal(bin, 'tasklist');
        assert.ok(args.includes(`PID eq ${process.pid}`));
        return `"node.exe","${process.pid}","Console","1","32,000 K"\r\n`;
      },
    });
    assert.equal(mockInfo.imageName, 'node.exe');
    assert.equal(mockInfo.pid, process.pid);

    const mockDarwinInfo = cdp.inspectProcessSync(process.pid, {
      platform: 'darwin',
      execFileSyncFn: (bin, args, opts) => {
        assert.equal(bin, 'ps');
        assert.equal(opts?.env?.TZ, 'UTC');
        assert.equal(opts?.env?.LC_ALL, 'C');
        const fmt = args[args.length - 1];
        if (fmt === 'comm=') return 'node\n';
        if (fmt === 'args=') return '/usr/local/bin/node server.js\n';
        if (fmt === 'lstart=') return 'Thu Nov 26 01:50:35 2026\n';
        throw new Error(`Unexpected ps format: ${fmt}`);
      },
    });
    assert.equal(mockDarwinInfo.imageName, 'node');
    assert.equal(mockDarwinInfo.commandLine, '/usr/local/bin/node server.js');
    assert.equal(mockDarwinInfo.startTime, Date.parse('Thu Nov 26 01:50:35 2026 UTC'));
    assert.equal(mockDarwinInfo.processStartMs, mockDarwinInfo.startTime);
  } finally {
    await liveSrv.close();
  }
});

test('Windows promptUserForHostRelaunch 不再派生隐藏 PowerShell，输出清晰 CLI 提示并返回 false', async () => {
  let execCalled = false;
  let capturedNotice = null;
  const ans = await cdp.promptUserForHostRelaunch({
    platformOverride: 'win32',
    lang: 'zh-CN',
    execFileFn: () => {
      execCalled = true;
    },
    onCliNotice: (n) => {
      capturedNotice = n;
    },
  });
  assert.equal(ans, false);
  assert.equal(execCalled, false, 'Windows promptUserForHostRelaunch must NOT spawn any process');
  assert.ok(capturedNotice && capturedNotice.handledBy === 'cli-notice');
  assert.ok(capturedNotice.body.includes('--remote-debugging-port=0'));
});

test('app_storage.json runInBackground 托盘陷阱挂起与带 3 次 50ms 重试无损恢复（含并发写入保留、8MB 门禁、symlink 防护）', async () => {
  const tmpDir = mkTempDir('prism-app-storage-');
  try {
    const storagePath = path.join(tmpDir, 'app_storage.json');
    fs.writeFileSync(
      storagePath,
      JSON.stringify({ runInBackground: 'true', theme: 'obsidian', keepMe: 123 }, null, 2),
      'utf8'
    );

    const suspended = cdp.suspendAntigravityRunInBackground(storagePath);
    assert.equal(suspended.modified, true);
    assert.equal(suspended.originalValue, 'true');
    assert.equal(JSON.parse(fs.readFileSync(storagePath, 'utf8')).runInBackground, 'false');

    // 模拟宿主退出前写入了新键
    const midObj = JSON.parse(fs.readFileSync(storagePath, 'utf8'));
    midObj.lastWindowBounds = '1440x900';
    fs.writeFileSync(storagePath, JSON.stringify(midObj, null, 2), 'utf8');

    // 模拟前 2 次读取遇到瞬态锁错误，第 3 次成功（验证 3 次 50ms 短重试）
    let readAttempts = 0;
    const sleepCalls = [];
    const restored = await cdp.restoreAntigravityRunInBackground(storagePath, suspended, {
      retries: 3,
      retryDelayMs: 50,
      sleep: async (ms) => {
        sleepCalls.push(ms);
      },
      readFileSync: (p) => {
        readAttempts += 1;
        if (readAttempts < 3) {
          const e = new Error('EBUSY');
          e.code = 'EBUSY';
          throw e;
        }
        return fs.readFileSync(p, 'utf8');
      },
    });
    assert.equal(restored.restored, true);
    assert.equal(restored.attempts, 3);
    assert.deepEqual(sleepCalls, [50, 50]);

    const finalObj = JSON.parse(fs.readFileSync(storagePath, 'utf8'));
    assert.equal(finalObj.runInBackground, 'true', 'runInBackground must be restored to "true"');
    assert.equal(finalObj.lastWindowBounds, '1440x900', 'Fresh keys written by host during shutdown must be preserved');
    assert.equal(finalObj.keepMe, 123);

    // 原值为 "false" 时不修改
    fs.writeFileSync(storagePath, JSON.stringify({ runInBackground: 'false' }), 'utf8');
    const noopState = cdp.suspendAntigravityRunInBackground(storagePath);
    assert.equal(noopState.modified, false);

    // 超过 8 MB 时 fail-closed 拒绝修改
    const hugePath = path.join(tmpDir, 'huge_app_storage.json');
    fs.writeFileSync(hugePath, Buffer.alloc(cdp.APP_STORAGE_MAX_BYTES + 128, 0x20));
    const hugeRes = cdp.suspendAntigravityRunInBackground(hugePath);
    assert.equal(hugeRes.modified, false);
    assert.match(hugeRes.skippedReason || '', /oversized/i);

    // Symlink 时 fail-closed 拒绝修改
    const linkStorage = path.join(tmpDir, 'link_app_storage.json');
    let symlinkCreated = false;
    try {
      fs.symlinkSync(storagePath, linkStorage, 'file');
      symlinkCreated = true;
    } catch {}
    if (symlinkCreated) {
      const symRes = cdp.suspendAntigravityRunInBackground(linkStorage);
      assert.equal(symRes.modified, false);
      assert.match(symRes.skippedReason || '', /symbolic link/i);
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 15, retryDelay: 50 });
  }
});

test('requestLoopbackCdpBrowserClose 双重校验 /json/version + /json/list，放行 Antigravity 并拒绝非宿主页面', async () => {
  const agSrv = await createMockBrowserCdpServer();
  const chromeSrv = await createMockBrowserCdpServer({
    browser: 'Chrome/132.0',
    userAgent: 'Mozilla/5.0 Chrome/132.0',
    targets: [
      {
        id: 'TAB_1',
        type: 'page',
        title: 'Google Search',
        url: 'https://www.google.com/',
        webSocketDebuggerUrl: 'ws://127.0.0.1:1/devtools/page/TAB_1',
      },
    ],
  });
  try {
    const ok = await cdp.requestLoopbackCdpBrowserClose(agSrv.port, { timeoutMs: 2000 });
    assert.equal(ok, true);
    assert.deepEqual(agSrv.receivedMethods, ['Browser.close']);

    const rejected = await cdp.requestLoopbackCdpBrowserClose(chromeSrv.port, { timeoutMs: 1500 });
    assert.equal(rejected, false, 'Non-Antigravity CDP server must be rejected fail-closed');
    assert.deepEqual(chromeSrv.receivedMethods, []);
  } finally {
    await agSrv.close();
    await chromeSrv.close();
  }
});

test('runWindowsDetachedRelaunchTask 事务时序: suspend -> CDP Browser.close -> 等退出 -> 先恢复 app_storage.json -> 再拉起新宿主；超时必恢复', async () => {
  const tmpDir = mkTempDir('prism-relaunch-seq-');
  try {
    const appStoragePath = path.join(tmpDir, 'app_storage.json');
    const fakeExe = path.join(tmpDir, 'Antigravity.exe');
    fs.writeFileSync(fakeExe, 'stub', 'utf8');
    fs.writeFileSync(appStoragePath, JSON.stringify({ runInBackground: 'true', marker: 'v1' }, null, 2), 'utf8');

    const timeline = [];
    let polls = 0;
    const res = await cdp.runWindowsDetachedRelaunchTask(
      {
        hostPid: 556677,
        exePath: fakeExe,
        cdpPort: 45555,
        appStoragePath,
        maxWaitMs: 2000,
        pollMs: 20,
        settleMs: 0,
      },
      {
        sleep: async () => {},
        requestCdpClose: async (p) => {
          assert.equal(p, 45555);
          assert.equal(JSON.parse(fs.readFileSync(appStoragePath, 'utf8')).runInBackground, 'false');
          timeline.push('cdp-close');
          return true;
        },
        isHostStillRunning: async () => {
          polls += 1;
          if (polls === 2) {
            const obj = JSON.parse(fs.readFileSync(appStoragePath, 'utf8'));
            obj.flushedOnExit = true;
            fs.writeFileSync(appStoragePath, JSON.stringify(obj, null, 2), 'utf8');
            timeline.push('host-exited');
            return false;
          }
          return true;
        },
        spawnFn: (exe, args, opts) => {
          // 关键断言：拉起宿主前必须已恢复 runInBackground="true" 且清理 ELECTRON_RUN_AS_NODE！
          const diskBeforeLaunch = JSON.parse(fs.readFileSync(appStoragePath, 'utf8'));
          assert.equal(diskBeforeLaunch.runInBackground, 'true');
          assert.equal(diskBeforeLaunch.flushedOnExit, true);
          assert.equal(opts.detached, true);
          assert.equal(opts.windowsHide, false);
          assert.equal(opts.stdio, 'ignore');
          assert.equal(opts.env.ELECTRON_RUN_AS_NODE, undefined);
          timeline.push(`spawn:${path.basename(exe)}:${args.join(',')}`);
          return { pid: 889900, on() {}, unref() {} };
        },
      }
    );
    assert.equal(res.relaunched, true);
    assert.equal(res.cdpClosed, true);
    assert.equal(res.restoreRes.restored, true);
    assert.deepEqual(timeline, [
      'cdp-close',
      'host-exited',
      'spawn:Antigravity.exe:--remote-debugging-port=0',
    ]);

    // 宿主未退出超时路径：必须依然恢复 runInBackground="true" 且绝不拉起新进程
    let spawnedOnTimeout = false;
    const timeoutRes = await cdp.runWindowsDetachedRelaunchTask(
      {
        hostPid: 556677,
        exePath: fakeExe,
        cdpPort: 45555,
        appStoragePath,
        maxWaitMs: 200,
        pollMs: 25,
        settleMs: 0,
      },
      {
        requestCdpClose: async () => true,
        isHostStillRunning: async () => true,
        spawnFn: () => {
          spawnedOnTimeout = true;
          return { pid: 1, on() {}, unref() {} };
        },
      }
    );
    assert.equal(timeoutRes.relaunched, false);
    assert.equal(timeoutRes.reason, 'host-did-not-exit');
    assert.equal(spawnedOnTimeout, false);
    assert.equal(JSON.parse(fs.readFileSync(appStoragePath, 'utf8')).runInBackground, 'true');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 15, retryDelay: 50 });
  }
});

test('端到端纯 Node 脱离重启 Helper (cdp.js --run-relaunch-task) + tools/patch-asar.cjs spawnBreakawayNodeProcess', async () => {
  const tmpDir = mkTempDir('prism-e2e-relaunch-');
  let dummyHost = null;
  let mockCdp = null;
  try {
    const stateDir = path.join(tmpDir, 'state');
    const appStoragePath = path.join(tmpDir, 'app_storage.json');
    const launchMarker = path.join(tmpDir, 'launched.json');
    const markerScript = path.join(tmpDir, 'mark-launched.cjs');
    fs.writeFileSync(appStoragePath, JSON.stringify({ runInBackground: 'true', keep: 'ok' }, null, 2), 'utf8');
    fs.writeFileSync(
      markerScript,
      [
        "const fs = require('node:fs');",
        `const storage = JSON.parse(fs.readFileSync(${JSON.stringify(appStoragePath)}, 'utf8'));`,
        `fs.writeFileSync(${JSON.stringify(launchMarker)}, JSON.stringify({`,
        "  argv: process.argv.slice(2),",
        "  electronRunAsNode: process.env.ELECTRON_RUN_AS_NODE || null,",
        "  runInBackgroundAtLaunch: storage.runInBackground,",
        "  exitFlushPreserved: Boolean(storage.exitFlush),",
        "}), 'utf8');",
      ].join('\n'),
      'utf8'
    );

    dummyHost = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      stdio: 'ignore',
      windowsHide: true,
    });

    mockCdp = await createMockBrowserCdpServer({
      onBrowserClose: () => {
        // 模拟宿主收到 Browser.close 后写入状态并正常退出
        const cur = JSON.parse(fs.readFileSync(appStoragePath, 'utf8'));
        cur.exitFlush = true;
        fs.writeFileSync(appStoragePath, JSON.stringify(cur, null, 2), 'utf8');
        try { dummyHost.kill(); } catch {}
      },
    });

    const spawnRes = cdp.spawnDetachedHostRelaunchHelper(
      {
        hostPid: dummyHost.pid,
        exePath: process.execPath,
        args: [markerScript, cdp.CDP_OPT_IN_SWITCH],
        cdpPort: mockCdp.port,
        appStoragePath,
        maxWaitMs: 6000,
        pollMs: 50,
        settleMs: 50,
      },
      {
        platformOverride: 'win32',
        stateDir,
      }
    );
    assert.equal(spawnRes.spawned, true);
    assert.equal(spawnRes.method, 'node-detached-helper');
    assert.ok(spawnRes.pid > 0);

    const markerData = await waitFor(() => {
      if (!fs.existsSync(launchMarker)) return null;
      return JSON.parse(fs.readFileSync(launchMarker, 'utf8'));
    }, 8000, 80);

    assert.deepEqual(markerData.argv, ['--remote-debugging-port=0']);
    assert.equal(markerData.electronRunAsNode, null);
    assert.equal(markerData.runInBackgroundAtLaunch, 'true', 'runInBackground must be restored before relaunch');
    assert.equal(markerData.exitFlushPreserved, true);
    assert.equal(fs.existsSync(spawnRes.taskFile), false, 'One-shot relaunch task file must be cleaned up');

    // 验证 tools/patch-asar.cjs spawnBreakawayNodeProcess 使用纯 Node detached 模式（零 PowerShell / 零 WMI）
    const breakawayMarker = path.join(tmpDir, 'breakaway-ok.txt');
    const bRes = patchAsar.spawnBreakawayNodeProcess(
      ['-e', `require('node:fs').writeFileSync(${JSON.stringify(breakawayMarker)}, 'OK', 'utf8')`],
      { cwd: os.tmpdir() }
    );
    assert.equal(bRes.spawned, true);
    assert.equal(bRes.method, 'node-detached-windowshide');
    assert.ok(bRes.pid > 0);
    const bText = await waitFor(() => (fs.existsSync(breakawayMarker) ? fs.readFileSync(breakawayMarker, 'utf8') : null), 5000, 60);
    assert.equal(bText, 'OK');
    await waitFor(() => !patchAsar.isPidAlive(bRes.pid) && !patchAsar.isPidAlive(spawnRes.pid), 5000, 40);
  } finally {
    if (dummyHost) {
      try { dummyHost.kill(); } catch {}
    }
    if (mockCdp) {
      await mockCdp.close().catch(() => {});
    }
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 15, retryDelay: 50 });
  }
});

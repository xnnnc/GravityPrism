import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {
  OmniServer,
  OMNI_BINDING,
  OMNI_VERSION,
  isSensitiveFilePath,
  isBlockedUncPath,
  detectPreviewKind,
} from '../vendor/omni-viewer/omni-server.mjs';

function httpGetRaw(urlStr, headers = {}) {
  const u = new URL(urlStr);
  return httpGetRawPath(Number(u.port), u.pathname + u.search, headers);
}

function httpGetRawPath(port, rawPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port, path: rawPath, headers }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body,
          text: body.toString('utf8'),
        });
      });
    });
    req.on('error', reject);
  });
}

test('OmniServer binds 127.0.0.1:0 with 64-hex random token and enforces token auth', async (t) => {
  const server = new OmniServer();
  t.after(async () => {
    await server.stop();
  });

  const info = await server.start();
  assert.equal(OMNI_BINDING, '__agPrismOmniCall');
  assert.equal(info.ok, true);
  assert.ok(info.port > 0);
  assert.match(info.baseUrl, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.match(info.token, /^[0-9a-f]{64}$/);
  assert.equal(info.version, OMNI_VERSION);

  const noTok = await httpGetRaw(`${info.baseUrl}/health`);
  assert.equal(noTok.statusCode, 401);

  const wrongTok = await httpGetRaw(`${info.baseUrl}/health?token=${'0'.repeat(64)}`);
  assert.equal(wrongTok.statusCode, 401);

  const queryOk = await httpGetRaw(`${info.baseUrl}/health?token=${info.token}`);
  assert.equal(queryOk.statusCode, 200);
  const queryJson = JSON.parse(queryOk.text);
  assert.equal(queryJson.ok, true);
  assert.equal(queryJson.pid, process.pid);
  assert.equal(queryJson.version, OMNI_VERSION);

  const headerOk = await httpGetRaw(`${info.baseUrl}/health`, {
    'x-prism-token': info.token,
  });
  assert.equal(headerOk.statusCode, 200);
  assert.equal(JSON.parse(headerOk.text).ok, true);
});

test('OmniServer /meta bounded slice reading and /stream RFC 7233 HTTP 206 Range streaming + abort cleanup', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-omni-stream-'));
  const server = new OmniServer({ rootDir: tmpDir });
  t.after(async () => {
    await server.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
  const info = await server.start();

  // 1. Text / CSV metadata & paged slice
  const csvPath = path.join(tmpDir, 'metrics.csv');
  const csvRows = ['id,model,latency_ms'];
  for (let i = 1; i <= 120; i++) {
    csvRows.push(`${i},carbon-high,${100 + i}`);
  }
  const csvContent = csvRows.join('\n') + '\n';
  fs.writeFileSync(csvPath, csvContent, 'utf8');

  const metaRes1 = await httpGetRaw(
    `${info.baseUrl}/meta?token=${info.token}&path=${encodeURIComponent(csvPath)}&headBytes=64&offset=0`
  );
  assert.equal(metaRes1.statusCode, 200);
  const meta1 = JSON.parse(metaRes1.text);
  assert.equal(meta1.ok, true);
  assert.equal(meta1.name, 'metrics.csv');
  assert.equal(meta1.ext, '.csv');
  assert.equal(meta1.isBinary, false);
  assert.equal(meta1.previewKind, 'table');
  assert.equal(meta1.truncated, true);
  assert.equal(meta1.nextOffset, 64);
  assert.equal(Buffer.byteLength(meta1.textSlice, 'utf8'), 64);

  // 2. Binary MP4 & Font metadata + HTTP 206 Partial Content byte ranges
  const mp4Path = path.join(tmpDir, 'demo-clip.mp4');
  const totalBytes = 4096;
  const binaryBuf = Buffer.alloc(totalBytes);
  for (let i = 0; i < totalBytes; i++) {
    binaryBuf[i] = i % 251; // includes 0x00 bytes so binary sniff triggers too
  }
  fs.writeFileSync(mp4Path, binaryBuf);

  const mp4MetaRes = await httpGetRaw(
    `${info.baseUrl}/meta?token=${info.token}&path=${encodeURIComponent(mp4Path)}`
  );
  assert.equal(mp4MetaRes.statusCode, 200);
  const mp4Meta = JSON.parse(mp4MetaRes.text);
  assert.equal(mp4Meta.isBinary, true);
  assert.equal(mp4Meta.previewKind, 'video');
  assert.equal(mp4Meta.size, totalBytes);
  assert.equal(mp4Meta.textSlice, undefined);

  const streamUrl = `${info.baseUrl}/stream?token=${info.token}&path=${encodeURIComponent(mp4Path)}`;

  // Full 200 stream
  const fullRes = await httpGetRaw(streamUrl);
  assert.equal(fullRes.statusCode, 200);
  assert.equal(fullRes.headers['accept-ranges'], 'bytes');
  assert.equal(fullRes.body.length, totalBytes);
  assert.ok(fullRes.body.equals(binaryBuf));

  // First chunk Range: bytes=0-127
  const r1 = await httpGetRaw(streamUrl, { Range: 'bytes=0-127' });
  assert.equal(r1.statusCode, 206);
  assert.equal(r1.headers['accept-ranges'], 'bytes');
  assert.equal(r1.headers['content-range'], `bytes 0-127/${totalBytes}`);
  assert.equal(Number(r1.headers['content-length']), 128);
  assert.ok(r1.body.equals(binaryBuf.subarray(0, 128)));

  // Middle chunk Range: bytes=500-999
  const r2 = await httpGetRaw(streamUrl, { Range: 'bytes=500-999' });
  assert.equal(r2.statusCode, 206);
  assert.equal(r2.headers['content-range'], `bytes 500-999/${totalBytes}`);
  assert.ok(r2.body.equals(binaryBuf.subarray(500, 1000)));

  // Suffix Range: bytes=-64
  const rSuffix = await httpGetRaw(streamUrl, { Range: 'bytes=-64' });
  assert.equal(rSuffix.statusCode, 206);
  assert.equal(rSuffix.headers['content-range'], `bytes ${totalBytes - 64}-${totalBytes - 1}/${totalBytes}`);
  assert.ok(rSuffix.body.equals(binaryBuf.subarray(totalBytes - 64)));

  // Out-of-bounds Range -> 416
  const r416 = await httpGetRaw(streamUrl, { Range: `bytes=${totalBytes + 100}-${totalBytes + 200}` });
  assert.equal(r416.statusCode, 416);
  assert.equal(r416.headers['content-range'], `bytes */${totalBytes}`);

  // Client mid-stream abort safety on larger file
  const largePath = path.join(tmpDir, 'large-video.webm');
  fs.writeFileSync(largePath, crypto.randomBytes(512 * 1024));
  await new Promise((resolve, reject) => {
    const req = http.get(
      `${info.baseUrl}/stream?token=${info.token}&path=${encodeURIComponent(largePath)}`,
      { headers: { Range: 'bytes=0-500000' } },
      (res) => {
        res.once('data', () => {
          req.destroy();
          setTimeout(resolve, 40);
        });
      }
    );
    req.on('error', () => resolve());
    setTimeout(() => reject(new Error('stream abort test timed out')), 3000);
  });

  // Server remains healthy immediately after aborted stream
  const postAbortHealth = await httpGetRaw(`${info.baseUrl}/health?token=${info.token}`);
  assert.equal(postAbortHealth.statusCode, 200);
});

test('OmniServer blocks sensitive files with 403 across HTTP routes and RPC actions', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-omni-sec-'));
  const server = new OmniServer({ rootDir: tmpDir });
  t.after(async () => {
    await server.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
  const info = await server.start();

  const sensitiveNames = [
    '.env',
    '.env.local',
    'tls-cert.pem',
    'service.key',
    'keys.txt',
    'credentials.json',
    'secrets.json',
  ];

  for (const name of sensitiveNames) {
    const filePath = path.join(tmpDir, name);
    fs.writeFileSync(filePath, 'TOP_SECRET=1\n', 'utf8');
    assert.equal(isSensitiveFilePath(filePath), true, `Expected ${name} to be flagged sensitive`);

    for (const route of ['meta', 'stream', 'sandbox-init', 'viewer']) {
      const res = await httpGetRaw(
        `${info.baseUrl}/${route}?token=${info.token}&path=${encodeURIComponent(filePath)}`
      );
      assert.equal(res.statusCode, 403, `Expected 403 on /${route} for ${name}, got ${res.statusCode}`);
    }

    const rpcSlice = await server.handleRpcAction('readTextSlice', { path: filePath });
    assert.equal(rpcSlice.ok, false, `Expected RPC readTextSlice to reject ${name}`);
  }
});

test('OmniServer /sandbox-init and /sandbox/<tok>/<mountId>/... serve relative assets and block ../ or symlink escapes', async (t) => {
  const outerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-omni-outer-'));
  const siteDir = path.join(outerDir, 'webapp');
  fs.mkdirSync(path.join(siteDir, 'assets'), { recursive: true });
  const outsideSecret = path.join(outerDir, 'outside-secret.txt');
  fs.writeFileSync(outsideSecret, 'OUTSIDE_DATA', 'utf8');

  const htmlFile = path.join(siteDir, 'index.html');
  const cssFile = path.join(siteDir, 'style.css');
  const jsFile = path.join(siteDir, 'assets', 'app.js');
  const localEnvFile = path.join(siteDir, '.env');

  fs.writeFileSync(htmlFile, '<!doctype html><link rel="stylesheet" href="./style.css"><script src="./assets/app.js"></script>', 'utf8');
  fs.writeFileSync(cssFile, 'body { color: #222; }', 'utf8');
  fs.writeFileSync(jsFile, 'window.__sandboxLoaded = true;', 'utf8');
  fs.writeFileSync(localEnvFile, 'HIDDEN=1', 'utf8');

  let hasOutsideSymlink = false;
  const symlinkPath = path.join(siteDir, 'escape-link.txt');
  try {
    fs.symlinkSync(outsideSecret, symlinkPath);
    hasOutsideSymlink = true;
  } catch {
    hasOutsideSymlink = false;
  }

  const server = new OmniServer({ rootDir: siteDir });
  t.after(async () => {
    await server.stop();
    fs.rmSync(outerDir, { recursive: true, force: true });
  });
  const info = await server.start();

  const initRes = await httpGetRaw(
    `${info.baseUrl}/sandbox-init?token=${info.token}&path=${encodeURIComponent(htmlFile)}`
  );
  assert.equal(initRes.statusCode, 200);
  const initJson = JSON.parse(initRes.text);
  assert.equal(initJson.ok, true);
  assert.ok(initJson.mountId);
  assert.equal(
    initJson.sandboxUrl.includes(info.token),
    false,
    'SEC-1: sandboxUrl must never embed master gateway token'
  );
  const sandboxMatch = /\/sandbox\/([0-9a-f]{64})\/([0-9a-f]{16,32})\/index\.html$/.exec(initJson.sandboxUrl);
  assert.ok(sandboxMatch, `Expected HMAC sandboxTok in ${initJson.sandboxUrl}`);
  const sandboxTok = sandboxMatch[1];
  assert.notEqual(sandboxTok, info.token);
  assert.equal(sandboxMatch[2], initJson.mountId);

  // Master token must be rejected on /sandbox/ route, and sandboxTok must be rejected on privileged APIs
  const masterOnSandbox = await httpGetRaw(`${info.baseUrl}/sandbox/${info.token}/${initJson.mountId}/index.html`);
  assert.equal(masterOnSandbox.statusCode, 401);
  const sandboxTokOnMeta = await httpGetRaw(
    `${info.baseUrl}/meta?token=${sandboxTok}&path=${encodeURIComponent(htmlFile)}`
  );
  assert.equal(sandboxTokOnMeta.statusCode, 401);
  const sandboxTokOnStream = await httpGetRaw(
    `${info.baseUrl}/stream?token=${sandboxTok}&path=${encodeURIComponent(htmlFile)}`
  );
  assert.equal(sandboxTokOnStream.statusCode, 401);

  // Entry HTML and relative assets load cleanly via scoped read-only sandboxTok
  const entryHtmlRes = await httpGetRaw(initJson.sandboxUrl);
  assert.equal(entryHtmlRes.statusCode, 200);
  assert.ok(entryHtmlRes.text.includes('./assets/app.js'));

  const baseMountUrl = `${info.baseUrl}/sandbox/${sandboxTok}/${initJson.mountId}`;
  const cssRes = await httpGetRaw(`${baseMountUrl}/style.css`);
  assert.equal(cssRes.statusCode, 200);
  assert.ok(cssRes.text.includes('color: #222'));

  const jsRes = await httpGetRaw(`${baseMountUrl}/assets/app.js`);
  assert.equal(jsRes.statusCode, 200);
  assert.ok(jsRes.text.includes('__sandboxLoaded'));

  // Raw un-normalized traversal attempts over wire must return 403
  const rawMountPrefix = `/sandbox/${sandboxTok}/${initJson.mountId}`;
  const travRawDotDot = await httpGetRawPath(info.port, `${rawMountPrefix}/../outside-secret.txt`);
  assert.equal(travRawDotDot.statusCode, 403);

  const travEncoded = await httpGetRawPath(info.port, `${rawMountPrefix}/%2e%2e/outside-secret.txt`);
  assert.equal(travEncoded.statusCode, 403);

  const travBackslash = await httpGetRawPath(info.port, `${rawMountPrefix}/%2e%2e%5coutside-secret.txt`);
  assert.equal(travBackslash.statusCode, 403);

  // Sensitive .env inside mounted directory must still return 403
  const envInMount = await httpGetRaw(`${baseMountUrl}/.env`);
  assert.equal(envInMount.statusCode, 403);

  // Symlink pointing outside mount root must return 403
  if (hasOutsideSymlink) {
    const symRes = await httpGetRaw(`${baseMountUrl}/escape-link.txt`);
    assert.equal(symRes.statusCode, 403);
  }

  // Sliding TTL expiration evicts idle sandbox mounts
  const ttlServer = new OmniServer({ rootDir: siteDir, sandboxTtlMs: 40 });
  const ttlInfo = await ttlServer.start();
  try {
    const ttlInit = JSON.parse(
      (await httpGetRaw(`${ttlInfo.baseUrl}/sandbox-init?token=${ttlInfo.token}&path=${encodeURIComponent(htmlFile)}`)).text
    );
    assert.equal((await httpGetRaw(ttlInit.sandboxUrl)).statusCode, 200);
    await new Promise((r) => setTimeout(r, 65));
    assert.equal((await httpGetRaw(ttlInit.sandboxUrl)).statusCode, 404, 'Expired sandbox mount must return 404');
  } finally {
    await ttlServer.stop();
  }
});

test('OmniServer /viewer renders HTML workbench and all 5 RPC actions validate paths & protocols', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-omni-rpc-'));
  const srcDir = path.join(tmpDir, 'src');
  fs.mkdirSync(srcDir, { recursive: true });
  const tsFile = path.join(srcDir, 'widget.ts');
  fs.writeFileSync(tsFile, 'export const answer = 42;\nexport const label = "prism";\n', 'utf8');
  const svgFile = path.join(srcDir, 'badge.svg');
  fs.writeFileSync(svgFile, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6"/></svg>', 'utf8');
  const unsafeScript = path.join(srcDir, 'danger.bat');
  fs.writeFileSync(unsafeScript, '@echo off\r\n', 'utf8');

  const revealed = [];
  const openedExternal = [];
  const server = new OmniServer({
    rootDir: tmpDir,
    execHooks: {
      revealInFolder: async (p) => {
        revealed.push(p);
      },
      openExternal: async (target) => {
        openedExternal.push(target);
      },
    },
  });
  t.after(async () => {
    await server.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
  const info = await server.start();

  // /viewer route with SVG file & Mermaid mode + corners=['sharp','balanced','soft'] default 'balanced'
  const viewerSvg = await httpGetRaw(
    `${info.baseUrl}/viewer?token=${info.token}&path=${encodeURIComponent(svgFile)}&theme=dark&palette=obsidian&accent=amber&lang=zh-CN`
  );
  assert.equal(viewerSvg.statusCode, 200);
  assert.match(String(viewerSvg.headers['content-type'] || ''), /text\/html/i);
  assert.ok(viewerSvg.text.toLowerCase().includes('<html'));
  assert.ok(
    viewerSvg.text.includes('data-ag-cs-corners="balanced"') || viewerSvg.text.includes('"corners":"balanced"'),
    'Default /viewer corners must be balanced'
  );

  const viewerSharp = await httpGetRaw(
    `${info.baseUrl}/viewer?token=${info.token}&kind=mermaid&corners=sharp&lang=en`
  );
  assert.equal(viewerSharp.statusCode, 200);
  assert.ok(viewerSharp.text.includes('data-ag-cs-corners="sharp"') || viewerSharp.text.includes('"corners":"sharp"'));

  const viewerMermaid = await httpGetRaw(
    `${info.baseUrl}/viewer?token=${info.token}&kind=mermaid&theme=light&lightPreset=paper&corners=invalid-pill&lang=en`
  );
  assert.equal(viewerMermaid.statusCode, 200);
  assert.ok(viewerMermaid.text.toLowerCase().includes('<html'));
  assert.ok(
    viewerMermaid.text.includes('data-ag-cs-corners="balanced"') || viewerMermaid.text.includes('"corners":"balanced"'),
    'Invalid corners parameter must fall back to balanced'
  );

  // RPC 1: getServerInfo
  const srvInfo = await server.handleRpcAction('getServerInfo', {});
  assert.equal(srvInfo.ok, true);
  assert.equal(srvInfo.port, info.port);
  assert.equal(srvInfo.token, info.token);

  // RPC 2: resolvePath (@mention + #L10-L20 + file:/// + :line:col)
  const relResolved = await server.handleRpcAction('resolvePath', {
    rawPath: '@src/widget.ts#L2-L5',
    workspaceHint: tmpDir,
  });
  assert.equal(relResolved.ok, true);
  assert.equal(relResolved.exists, true);
  assert.equal(relResolved.path, tsFile);
  assert.equal(relResolved.line, 2);
  assert.equal(relResolved.endLine, 5);

  const fileUrlStr =
    process.platform === 'win32'
      ? `file:///${svgFile.replace(/\\/g, '/')}:1:3`
      : `file://${svgFile}:1:3`;
  const urlResolved = await server.handleRpcAction('resolvePath', { rawPath: fileUrlStr });
  assert.equal(urlResolved.ok, true);
  assert.equal(urlResolved.exists, true);
  assert.equal(urlResolved.path, svgFile);
  assert.equal(urlResolved.line, 1);
  assert.equal(urlResolved.col, 3);
  assert.equal(detectPreviewKind('.svg', 'image/svg+xml', false), 'svg');

  // RPC 3: revealInFolder
  const revOk = await server.handleRpcAction('revealInFolder', { path: tsFile });
  assert.equal(revOk.ok, true);
  assert.deepEqual(revealed, [tsFile]);

  // RPC 4: openExternal (allow https: + safe file; reject javascript: and executable .bat)
  const extHttp = await server.handleRpcAction('openExternal', { target: 'https://github.com/RMvdesi/obsidian-prism' });
  assert.equal(extHttp.ok, true);
  const extFile = await server.handleRpcAction('openExternal', { target: svgFile });
  assert.equal(extFile.ok, true);
  assert.equal(openedExternal.length, 2);

  const extJs = await server.handleRpcAction('openExternal', { target: 'javascript:alert(1)' });
  assert.equal(extJs.ok, false);
  const extBat = await server.handleRpcAction('openExternal', { target: unsafeScript });
  assert.equal(extBat.ok, false);
  assert.equal(openedExternal.length, 2);

  // RPC 5: readTextSlice
  const sliceRes = await server.handleRpcAction('readTextSlice', {
    path: tsFile,
    offset: 0,
    maxBytes: 24,
  });
  assert.equal(sliceRes.ok, true);
  assert.equal(sliceRes.truncated, true);
  assert.equal(sliceRes.textSlice, 'export const answer = 42');
});

test('OmniServer SEC-3/5/6 & WB-4: Host/Origin/CSP/Referrer-Policy, remote UNC block, obsidian-prism-thought & symlink guard, and UTF-8 multibyte boundary slicing', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-omni-hardening-'));
  const server = new OmniServer({ rootDir: tmpDir });
  t.after(async () => {
    await server.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
  const info = await server.start();

  // 1. SEC-5: Anti-DNS-Rebinding Host check, Cross-Site Origin rejection, CSP & Referrer-Policy, no wildcard CORS
  const dnsRebind = await httpGetRawPath(info.port, `/health?token=${info.token}`, {
    Host: 'rebind.attacker.invalid',
  });
  assert.equal(dnsRebind.statusCode, 403, 'Forged Host header must be rejected with 403');

  const crossOrigin = await httpGetRaw(`${info.baseUrl}/health?token=${info.token}`, {
    Origin: 'https://evil.example.com',
  });
  assert.equal(crossOrigin.statusCode, 403, 'External web Origin must be rejected with 403');

  const crossFetchApi = await httpGetRaw(`${info.baseUrl}/health?token=${info.token}`, {
    'Sec-Fetch-Site': 'cross-site',
    'Sec-Fetch-Dest': 'empty',
  });
  assert.equal(crossFetchApi.statusCode, 403, 'Cross-site XHR/fetch to JSON API must be rejected');

  const hostHealth = await httpGetRaw(`${info.baseUrl}/health?token=${info.token}`, {
    Origin: 'vscode-file://vscode-app',
  });
  assert.equal(hostHealth.statusCode, 200, 'Trusted Electron vscode-file:// Origin must be allowed');
  assert.equal(hostHealth.headers['referrer-policy'], 'no-referrer');
  assert.equal(hostHealth.headers['access-control-allow-origin'], undefined, 'Wildcard CORS must not be set on JSON APIs');

  const iframeViewer = await httpGetRaw(`${info.baseUrl}/viewer?token=${info.token}&kind=mermaid`, {
    'Sec-Fetch-Site': 'cross-site',
    'Sec-Fetch-Dest': 'iframe',
    'Sec-Fetch-Mode': 'navigate',
  });
  assert.equal(iframeViewer.statusCode, 200, 'Host iframe navigation to /viewer must succeed');
  assert.equal(iframeViewer.headers['referrer-policy'], 'no-referrer');
  assert.match(String(iframeViewer.headers['content-security-policy'] || ''), /connect-src 'self'/);
  assert.match(String(iframeViewer.headers['content-security-policy'] || ''), /base-uri 'none'/);
  assert.match(String(iframeViewer.headers['content-security-policy'] || ''), /object-src 'none'/);

  // 2. SEC-6: Remote Windows UNC SMB hash leak defense & dangerous shell executable extensions
  assert.equal(isBlockedUncPath('\\\\198.51.100.42\\share\\ diagram.svg'), true);
  assert.equal(isBlockedUncPath('file://198.51.100.42/share/diagram.svg'), true);
  assert.equal(isBlockedUncPath('\\\\wsl.localhost\\Ubuntu\\home\\dev\\notes.md'), false);
  assert.equal(isBlockedUncPath(path.join(tmpDir, 'local.md')), false);

  const uncMeta = await httpGetRaw(
    `${info.baseUrl}/meta?token=${info.token}&path=${encodeURIComponent('\\\\198.51.100.42\\share\\secret.txt')}`
  );
  assert.equal(uncMeta.statusCode, 403);
  const uncRpc = await server.handleRpcAction('resolvePath', { rawPath: '\\\\198.51.100.42\\share\\secret.txt' });
  assert.equal(uncRpc.ok, false);

  for (const ext of ['.lnk', '.url', '.scf', '.exe', '.dll', '.js', '.mjs']) {
    const f = path.join(tmpDir, `payload${ext}`);
    fs.writeFileSync(f, 'test', 'utf8');
    const openRes = await server.handleRpcAction('openExternal', { target: f });
    assert.equal(openRes.ok, false, `openExternal must block dangerous extension ${ext}`);
  }

  // 3. SEC-3: Expanded sensitive credential patterns (obsidian-prism-thought.json, etc.) + realpath symlink guard
  const extraSensitive = [
    'obsidian-prism-thought.json',
    '.git-credentials',
    '.pypirc',
    'kubeconfig',
    'Cookies',
    'Login Data',
    'vault.kdbx',
    'deploy.ppk',
  ];
  for (const name of extraSensitive) {
    const p = path.join(tmpDir, name);
    fs.writeFileSync(p, '{"apiKey":"secret"}', 'utf8');
    assert.equal(isSensitiveFilePath(p), true, `${name} must be detected as sensitive`);
    const r = await httpGetRaw(`${info.baseUrl}/meta?token=${info.token}&path=${encodeURIComponent(p)}`);
    assert.equal(r.statusCode, 403, `/meta must block ${name} with 403`);
  }

  const secretThought = path.join(tmpDir, 'obsidian-prism-thought.json');
  const benignAlias = path.join(tmpDir, 'public-notes.txt');
  let createdSymlink = false;
  try {
    fs.symlinkSync(secretThought, benignAlias);
    createdSymlink = true;
  } catch {}
  if (createdSymlink) {
    const symMeta = await httpGetRaw(`${info.baseUrl}/meta?token=${info.token}&path=${encodeURIComponent(benignAlias)}`);
    assert.equal(symMeta.statusCode, 403, 'Symlink pointing to sensitive file must be blocked via realpath check');
    const symSlice = await server.handleRpcAction('readTextSlice', { path: benignAlias });
    assert.equal(symSlice.ok, false);
  }

  // 4. WB-4: Multibyte UTF-8 boundary rollback (3-byte CJK + 4-byte supplementary emoji, zero U+FFFD corruption)
  const utf8Sample = '曜石棱镜光学引擎🚀跨分片多字节边界无损还原验证！\n'.repeat(12);
  const utf8File = path.join(tmpDir, 'utf8-multibyte.md');
  fs.writeFileSync(utf8File, utf8Sample, 'utf8');

  let cursor = 0;
  let assembled = '';
  let guardSteps = 0;
  while (guardSteps++ < 500) {
    const chunkRes = await server.handleRpcAction('readTextSlice', {
      path: utf8File,
      offset: cursor,
      maxBytes: 17, // Prime byte chunk size guaranteed to cut across 3-byte CJK and 4-byte emoji boundaries
    });
    assert.equal(chunkRes.ok, true);
    assert.equal(chunkRes.textSlice.includes('\uFFFD'), false, `Chunk at offset ${cursor} must never contain U+FFFD`);
    assembled += chunkRes.textSlice;
    if (!chunkRes.truncated) break;
    assert.ok(chunkRes.nextOffset > cursor, 'nextOffset must strictly advance');
    cursor = chunkRes.nextOffset;
  }
  assert.equal(assembled, utf8Sample, 'Concatenated UTF-8 slices must match original multibyte text 100%');
});

test('OmniServer /sandbox/ enforces strict opaque-origin CSP on .html/.htm and /viewer supports full 8+1 locales', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-omni-b3-'));
  const htmlFile = path.join(tmpDir, 'demo.html');
  const htmFile = path.join(tmpDir, 'legacy.htm');
  const cssFile = path.join(tmpDir, 'app.css');
  const svgFile = path.join(tmpDir, 'vector.svg');
  const xhtmlFile = path.join(tmpDir, 'doc.xhtml');
  fs.writeFileSync(htmlFile, '<!doctype html><link rel="stylesheet" href="./app.css"><script>window.__ok=1;</script>', 'utf8');
  fs.writeFileSync(htmFile, '<!doctype html><h1>HTM</h1>', 'utf8');
  fs.writeFileSync(cssFile, 'body{margin:0}', 'utf8');
  fs.writeFileSync(svgFile, '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 'utf8');
  fs.writeFileSync(xhtmlFile, '<html xmlns="http://www.w3.org/1999/xhtml"><body>x</body></html>', 'utf8');

  const server = new OmniServer({ rootDir: tmpDir });
  t.after(async () => {
    await server.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
  const info = await server.start();

  const expectedSandboxCsp = "sandbox allow-scripts; connect-src 'none'; form-action 'none'; navigate-to 'none'";
  for (const targetFile of [htmlFile, htmFile]) {
    const initRes = await httpGetRaw(
      `${info.baseUrl}/sandbox-init?token=${info.token}&path=${encodeURIComponent(targetFile)}`
    );
    assert.equal(initRes.statusCode, 200);
    const { sandboxUrl } = JSON.parse(initRes.text);
    const sbRes = await httpGetRaw(sandboxUrl);
    assert.equal(sbRes.statusCode, 200);
    assert.equal(sbRes.headers['content-security-policy'], expectedSandboxCsp);
    assert.equal(String(sbRes.headers['content-security-policy']).includes("default-src 'none'"), false);
  }

  // Relative CSS inside /sandbox/ remains readable without breaking styling
  const initHtml = JSON.parse(
    (await httpGetRaw(`${info.baseUrl}/sandbox-init?token=${info.token}&path=${encodeURIComponent(htmlFile)}`)).text
  );
  const cssUrl = initHtml.sandboxUrl.replace(/demo\.html$/, 'app.css');
  const cssRes = await httpGetRaw(cssUrl);
  assert.equal(cssRes.statusCode, 200);
  assert.equal(cssRes.text, 'body{margin:0}');

  // Direct /sandbox/ access to .svg / .xhtml enforces strict default-src 'none' sandbox CSP
  const strictDocCsp = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
  for (const assetName of ['vector.svg', 'doc.xhtml']) {
    const assetRes = await httpGetRaw(initHtml.sandboxUrl.replace(/demo\.html$/, assetName));
    assert.equal(assetRes.statusCode, 200);
    assert.equal(
      assetRes.headers['content-security-policy'],
      strictDocCsp,
      `/sandbox/ must enforce strict sandbox CSP on ${assetName}`
    );
  }

  // /viewer accepts all 8 locales + yue compatibility and falls back invalid locales to zh-CN
  for (const lang of ['zh-CN', 'zh-TW', 'yue', 'en', 'ja', 'ko', 'es', 'fr', 'de']) {
    const res = await httpGetRaw(`${info.baseUrl}/viewer?token=${info.token}&kind=mermaid&lang=${encodeURIComponent(lang)}`);
    assert.equal(res.statusCode, 200);
    assert.ok(res.text.includes(`<html lang="${lang}"`), `/viewer must preserve lang="${lang}"`);
  }
  const fallbackRes = await httpGetRaw(`${info.baseUrl}/viewer?token=${info.token}&kind=mermaid&lang=xx-INVALID`);
  assert.equal(fallbackRes.statusCode, 200);
  assert.ok(fallbackRes.text.includes('<html lang="zh-CN"'));
});

test('OmniServer CORS hardening: zero wildcard *, reflects verified local Origin or /sandbox/ null Origin with Vary: Origin', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-omni-cors-'));
  const htmlFile = path.join(tmpDir, 'index.html');
  const txtFile = path.join(tmpDir, 'sample.txt');
  fs.writeFileSync(htmlFile, '<!doctype html><h1>Sandbox</h1>', 'utf8');
  fs.writeFileSync(txtFile, 'hello omni cors', 'utf8');

  const server = new OmniServer({ rootDir: tmpDir });
  t.after(async () => {
    await server.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
  const info = await server.start();

  const httpReq = (method, urlStr, headers = {}) =>
    new Promise((resolve, reject) => {
      const u = new URL(urlStr);
      const req = http.request(
        { hostname: '127.0.0.1', port: Number(u.port), path: u.pathname + u.search, method, headers },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }));
        }
      );
      req.on('error', reject);
      req.end();
    });

  const streamUrl = `${info.baseUrl}/stream?token=${info.token}&path=${encodeURIComponent(txtFile)}`;
  const sbInit = JSON.parse(
    (await httpGetRaw(`${info.baseUrl}/sandbox-init?token=${info.token}&path=${encodeURIComponent(htmlFile)}`)).text
  );
  const sandboxUrl = sbInit.sandboxUrl;

  // 1) No Origin -> no Access-Control-Allow-Origin (never *), includes Vary: Origin
  const noOriginStream = await httpGetRaw(streamUrl);
  assert.equal(noOriginStream.statusCode, 200);
  assert.equal(noOriginStream.headers['access-control-allow-origin'], undefined);
  assert.equal(noOriginStream.headers.vary, 'Origin');

  // 2) Verified local Origins -> reflected verbatim + Vary: Origin (never *) on GET & OPTIONS
  for (const okOrigin of ['vscode-file://vscode-app', info.baseUrl, 'http://localhost:3000']) {
    const getRes = await httpGetRaw(streamUrl, { Origin: okOrigin });
    assert.equal(getRes.statusCode, 200);
    assert.equal(getRes.headers['access-control-allow-origin'], okOrigin);
    assert.notEqual(getRes.headers['access-control-allow-origin'], '*');
    assert.equal(getRes.headers.vary, 'Origin');

    const optRes = await httpReq('OPTIONS', streamUrl, { Origin: okOrigin });
    assert.equal(optRes.statusCode, 204);
    assert.equal(optRes.headers['access-control-allow-origin'], okOrigin);
    assert.notEqual(optRes.headers['access-control-allow-origin'], '*');
    assert.equal(optRes.headers.vary, 'Origin');
  }

  // 3) Opaque sandbox Origin: null -> allowed & reflected on /sandbox/ (GET & OPTIONS), NOT reflected on /stream
  const sbNullGet = await httpGetRaw(sandboxUrl, { Origin: 'null' });
  assert.equal(sbNullGet.statusCode, 200);
  assert.equal(sbNullGet.headers['access-control-allow-origin'], 'null');
  assert.equal(sbNullGet.headers.vary, 'Origin');

  const sbNullOpt = await httpReq('OPTIONS', sandboxUrl, { Origin: 'null' });
  assert.equal(sbNullOpt.statusCode, 204);
  assert.equal(sbNullOpt.headers['access-control-allow-origin'], 'null');
  assert.equal(sbNullOpt.headers.vary, 'Origin');

  const streamNullGet = await httpGetRaw(streamUrl, { Origin: 'null' });
  assert.equal(streamNullGet.statusCode, 200);
  assert.equal(streamNullGet.headers['access-control-allow-origin'], undefined);
  assert.equal(streamNullGet.headers.vary, 'Origin');

  // 4) Untrusted external Origin -> 403 on GET & OPTIONS with no CORS reflection
  const evilOpt = await httpReq('OPTIONS', streamUrl, { Origin: 'https://evil.example.com' });
  assert.equal(evilOpt.statusCode, 403);
  assert.equal(evilOpt.headers['access-control-allow-origin'], undefined);
});

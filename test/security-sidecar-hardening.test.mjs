import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import EventEmitter from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const importRel = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);

// 轻量可运行 Mock DOM，用于真实在 VM 中驱动 workbench-page.mjs 前端脚本
function createWorkbenchMockDom({ fetchImpl, onImageLoad, onCanvasCreate } = {}) {
  let doc = null;
  const createdCanvases = [];

  function makeNode(tag, ns = '') {
    const attrs = new Map();
    const listeners = new Map();
    const children = [];
    const classes = new Set();
    let _text = '';
    const styleObj = {
      _props: {},
      setProperty(k, v) { this._props[k] = String(v); },
      getPropertyValue(k) { return this._props[k] || ''; },
      removeProperty(k) { delete this._props[k]; },
    };

    const node = {
      tagName: ns ? String(tag) : String(tag).toUpperCase(),
      nodeName: ns ? String(tag) : String(tag).toUpperCase(),
      namespaceURI: ns || 'http://www.w3.org/1999/xhtml',
      nodeType: 1,
      style: styleObj,
      children,
      parentElement: null,
      parentNode: null,
      hidden: false,
      disabled: false,
      type: '',
      value: '',
      width: 0,
      height: 0,
      clientWidth: 800,
      clientHeight: 600,
      duration: 10,
      currentTime: 0,
      paused: true,
      volume: 1,
      muted: false,
      playbackRate: 1,
      src: '',
      srcdoc: '',
      onclick: null,
      get id() { return attrs.get('id') || ''; },
      set id(v) { attrs.set('id', String(v)); },
      get className() { return Array.from(classes).join(' '); },
      set className(v) {
        classes.clear();
        for (const c of String(v || '').split(/\s+/).filter(Boolean)) classes.add(c);
      },
      classList: {
        contains: (c) => classes.has(c),
        add: (...cs) => cs.forEach((c) => classes.add(c)),
        remove: (...cs) => cs.forEach((c) => classes.delete(c)),
        toggle: (c, f) => {
          const on = f === undefined ? !classes.has(c) : Boolean(f);
          if (on) classes.add(c);
          else classes.delete(c);
          return on;
        },
      },
      get childNodes() { return children; },
      get firstChild() { return children[0] || null; },
      get attributes() {
        return Array.from(attrs.entries()).map(([name, value]) => ({ name, value }));
      },
      get textContent() {
        return children.length ? children.map((c) => c.textContent).join('') : _text;
      },
      set textContent(v) {
        children.length = 0;
        _text = String(v ?? '');
      },
      setAttribute(k, v) {
        const key = String(k);
        const val = String(v);
        attrs.set(key, val);
        if (key === 'class') this.className = val;
        if (key === 'src') this.src = val;
      },
      setAttributeNS(_ns, k, v) {
        this.setAttribute(k, v);
      },
      getAttribute(k) {
        if (k === 'src' && this.src) return this.src;
        return attrs.has(k) ? attrs.get(k) : null;
      },
      hasAttribute(k) {
        if (k === 'src' && this.src) return true;
        return attrs.has(k);
      },
      removeAttribute(k) {
        attrs.delete(k);
        if (k === 'src') this.src = '';
      },
      appendChild(ch) {
        if (!ch) return ch;
        if (typeof ch === 'string') ch = doc.createTextNode(ch);
        if (ch.parentNode && typeof ch.parentNode.removeChild === 'function') {
          ch.parentNode.removeChild(ch);
        }
        ch.parentElement = this;
        ch.parentNode = this;
        children.push(ch);
        return ch;
      },
      append(...nodes) {
        for (const n of nodes) this.appendChild(n);
      },
      insertBefore(ch, ref) {
        if (!ch) return ch;
        if (ch.parentNode && typeof ch.parentNode.removeChild === 'function') {
          ch.parentNode.removeChild(ch);
        }
        ch.parentElement = this;
        ch.parentNode = this;
        const idx = ref ? children.indexOf(ref) : -1;
        if (idx >= 0) children.splice(idx, 0, ch);
        else children.push(ch);
        return ch;
      },
      removeChild(ch) {
        const idx = children.indexOf(ch);
        if (idx >= 0) children.splice(idx, 1);
        ch.parentElement = null;
        ch.parentNode = null;
        return ch;
      },
      replaceChildren(...nodes) {
        for (const old of [...children]) {
          old.parentElement = null;
          old.parentNode = null;
        }
        children.length = 0;
        for (const n of nodes) this.appendChild(n);
      },
      remove() {
        if (this.parentNode) this.parentNode.removeChild(this);
      },
      addEventListener(ev, fn) {
        if (!listeners.has(ev)) listeners.set(ev, []);
        listeners.get(ev).push(fn);
      },
      removeEventListener(ev, fn) {
        const arr = listeners.get(ev);
        if (!arr) return;
        const idx = arr.indexOf(fn);
        if (idx >= 0) arr.splice(idx, 1);
      },
      click() {
        if (typeof this.onclick === 'function') this.onclick({ preventDefault() {}, stopPropagation() {} });
        for (const fn of [...(listeners.get('click') || [])]) {
          fn({ type: 'click', target: this, preventDefault() {}, stopPropagation() {} });
        }
      },
      pause() { this.paused = true; },
      play() { this.paused = false; return Promise.resolve(); },
      load() {},
      getBoundingClientRect() {
        return { left: 0, top: 0, width: 640, height: 360, right: 640, bottom: 360 };
      },
      getContext() {
        return {
          imageSmoothingEnabled: false,
          imageSmoothingQuality: 'low',
          clearRect() {},
          fillRect() {},
          beginPath() {},
          moveTo() {},
          lineTo() {},
          stroke() {},
          fill() {},
          scale() {},
          drawImage() {},
          set fillStyle(_v) {},
          set strokeStyle(_v) {},
          set lineWidth(_v) {},
        };
      },
      toBlob(cb, mime) {
        cb(new Blob(['png'], { type: mime || 'image/png' }));
      },
      querySelectorAll(sel) {
        const out = [];
        const walk = (n) => {
          for (const c of n.children || []) {
            if (c.nodeType === 1) {
              if (matchesSelector(c, sel)) out.push(c);
              walk(c);
            }
          }
        };
        walk(this);
        return out;
      },
      querySelector(sel) {
        return this.querySelectorAll(sel)[0] || null;
      },
    };

    if (String(tag).toLowerCase() === 'canvas') {
      createdCanvases.push(node);
      if (onCanvasCreate) onCanvasCreate(node);
    }
    return node;
  }

  function matchesSelector(node, sel) {
    return sel.split(',').some((part) => {
      const s = part.trim();
      if (!s) return false;
      if (s.startsWith('#')) return node.id === s.slice(1);
      if (s.startsWith('.')) return node.classList.contains(s.slice(1));
      const m = /^([a-zA-Z0-9_-]+)?(?:\.([a-zA-Z0-9_-]+))?$/.exec(s);
      if (!m) return false;
      if (m[1] && node.tagName.toLowerCase() !== m[1].toLowerCase()) return false;
      if (m[2] && !node.classList.contains(m[2])) return false;
      return true;
    });
  }

  const html = makeNode('html');
  const body = makeNode('body');
  const app = makeNode('div');
  app.id = 'wb-app';
  const badge = makeNode('span');
  badge.id = 'wb-kind-badge';
  const title = makeNode('span');
  title.id = 'wb-title';
  const pills = makeNode('div');
  pills.id = 'wb-meta-pills';
  const tools = makeNode('div');
  tools.id = 'wb-mode-tools';
  const stage = makeNode('main');
  stage.id = 'wb-stage';
  const toast = makeNode('div');
  toast.id = 'wb-toast';
  app.append(badge, title, pills, tools, stage);
  body.append(app, toast);
  html.append(body);

  doc = {
    documentElement: html,
    body,
    createElement: (t) => makeNode(t),
    createElementNS: (ns, t) => makeNode(t, ns),
    createTextNode: (t) => ({
      nodeType: 3,
      nodeValue: String(t ?? ''),
      textContent: String(t ?? ''),
      parentNode: null,
      parentElement: null,
      children: [],
    }),
    getElementById: (id) => html.querySelector(`#${id}`),
    querySelector: (s) => html.querySelector(s),
    querySelectorAll: (s) => html.querySelectorAll(s),
    addEventListener() {},
    removeEventListener() {},
  };

  const winListeners = new Map();
  const win = {
    document: doc,
    location: { search: '', hash: '', href: 'http://127.0.0.1:43210/viewer' },
    devicePixelRatio: 1,
    navigator: { clipboard: { writeText: async () => {} } },
    URLSearchParams,
    Blob,
    Float32Array,
    Uint8Array,
    AbortController,
    URL: {
      createObjectURL: () => 'blob:mock-url',
      revokeObjectURL: () => {},
    },
    getComputedStyle: () => ({ getPropertyValue: () => '#999' }),
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    setTimeout: (fn) => {
      const t = setTimeout(fn, 0);
      t.unref?.();
      return t;
    },
    clearTimeout,
    addEventListener(ev, fn) {
      if (!winListeners.has(ev)) winListeners.set(ev, []);
      winListeners.get(ev).push(fn);
    },
    removeEventListener(ev, fn) {
      const arr = winListeners.get(ev);
      if (!arr) return;
      const idx = arr.indexOf(fn);
      if (idx >= 0) arr.splice(idx, 1);
    },
    dispatchEvent(evName) {
      for (const fn of [...(winListeners.get(evName) || [])]) fn({ type: evName });
    },
    fetch: fetchImpl,
    Image: class MockImage {
      set src(v) {
        this._src = v;
        queueMicrotask(() => {
          if (onImageLoad) onImageLoad(this);
          if (typeof this.onload === 'function') this.onload();
        });
      }
      get src() { return this._src || ''; }
    },
  };
  win.window = win;
  win.self = win;
  win.globalThis = win;

  return { win, doc, stage, tools, createdCanvases };
}

function extractInlineWorkbenchScript(html) {
  const openTag = '<script>';
  const closeTag = '</script>';
  const start = html.lastIndexOf(openTag);
  const end = start >= 0 ? html.indexOf(closeTag, start + openTag.length) : -1;
  assert.ok(start >= 0 && end > start, 'renderWorkbenchHtml must emit an inline <script> block');
  const scriptBody = html.slice(start + openTag.length, end);
  assert.ok(scriptBody.length > 0, 'renderWorkbenchHtml must emit a non-empty inline <script> block');
  return scriptBody;
}

function flushAsync(ms = 25) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sendRawHttp10NoHost(port, rawPath) {
  return new Promise((resolve, reject) => {
    const sock = net.connect({ host: '127.0.0.1', port }, () => {
      sock.write(`GET ${rawPath} HTTP/1.0\r\n\r\n`);
    });
    const chunks = [];
    sock.on('data', (c) => chunks.push(c));
    sock.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    sock.on('error', reject);
  });
}

test('security-sidecar 1: omni-server blocks extended UNC bypasses, empty/missing Host header, expanded exec/sensitive lists & safe revealInFolder', async (t) => {
  const { OmniServer, isBlockedUncPath, isSensitiveFilePath } = await importRel('vendor/omni-viewer/omni-server.mjs');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-prism-sec-omni-'));
  const revealedHooks = [];
  const server = new OmniServer({
    rootDir: tmpDir,
    execHooks: {
      revealInFolder: async (p, meta) => {
        revealedHooks.push({ p, meta });
      },
    },
  });
  t.after(async () => {
    await server.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
  const info = await server.start();

  // 1) Extended UNC / GLOBAL / GLOBALROOT Mup interception (while preserving local/WSL & normal drives)
  const blockedUncCases = [
    '\\\\?\\GLOBAL\\UNC\\evil.local\\share\\a.txt',
    '//?/GLOBAL/UNC/evil.local/share/a.txt',
    '\\\\?\\GLOBAL\\GLOBAL\\UNC\\evil.local\\share\\a.txt',
    '\\\\?\\GLOBALROOT\\Device\\Mup\\evil.local\\share\\a.txt',
    '//?/GLOBALROOT/Device/Mup/198.51.100.9/share/a.txt',
    '\\\\.\\UNC\\evil.local\\share\\a.txt',
  ];
  for (const p of blockedUncCases) {
    assert.equal(isBlockedUncPath(p), true, `Expected extended UNC blocked: ${p}`);
  }

  const allowedLocalCases = [
    '\\\\?\\GLOBAL\\UNC\\localhost\\share\\a.txt',
    '\\\\?\\GLOBAL\\UNC\\127.0.0.1\\share\\a.txt',
    '\\\\?\\GLOBAL\\UNC\\wsl.localhost\\Ubuntu\\home\\a.txt',
    '\\\\?\\GLOBAL\\UNC\\wsl$\\Ubuntu\\home\\a.txt',
    '\\\\?\\C:\\Users\\demo\\notes.md',
    'C:\\Users\\demo\\notes.md',
  ];
  for (const p of allowedLocalCases) {
    assert.equal(isBlockedUncPath(p), false, `Expected local/WSL path allowed: ${p}`);
  }

  // 2) Expanded SENSITIVE_BASENAMES blocked both in helper & live HTTP /meta
  const expandedSensitive = [
    '.envrc',
    '.pgpass',
    '.bash_history',
    'ConsoleHost_history.txt',
    'hosts.yml',
    'logins.json',
    'key4.db',
    'obsidian-prism-sidebar.json',
  ];
  for (const name of expandedSensitive) {
    const f = path.join(tmpDir, name);
    fs.writeFileSync(f, 'secret-data\n', 'utf8');
    assert.equal(isSensitiveFilePath(f), true, `Expected sensitive basename blocked: ${name}`);
    const rpcRes = await server.handleRpcAction('readTextSlice', { path: f });
    assert.equal(rpcRes.ok, false, `readTextSlice must block ${name}`);
    assert.equal(rpcRes.status, 403);
  }

  // 3) Expanded BLOCKED_EXTERNAL_EXEC_EXTS & openExternal blocked flag
  for (const ext of ['.psm1', '.psd1', '.ws', '.sct', '.chm', '.iso', '.img', '.vhd', '.vhdx', '.inf']) {
    const f = path.join(tmpDir, `payload${ext}`);
    fs.writeFileSync(f, 'stub', 'utf8');
    const res = await server.handleRpcAction('openExternal', { target: f });
    assert.equal(res.ok, false, `openExternal must block ${ext}`);
    assert.equal(res.blocked, true, `openExternal must set blocked=true for ${ext}`);
  }

  const uncOpenRes = await server.handleRpcAction('openExternal', {
    target: '\\\\?\\GLOBAL\\UNC\\attacker.invalid\\x\\a.txt',
  });
  assert.equal(uncOpenRes.ok, false);
  assert.equal(uncOpenRes.blocked, true);

  const protoOpenRes = await server.handleRpcAction('openExternal', {
    target: 'javascript:alert(1)',
  });
  assert.equal(protoOpenRes.ok, false);
  assert.equal(protoOpenRes.blocked, true);

  // 4) _isValidHostHeader fail-closed for missing/empty Host (unit + real HTTP/1.0 wire test)
  assert.equal(server._isValidHostHeader({ headers: {} }), false);
  assert.equal(server._isValidHostHeader({ headers: { host: '' } }), false);
  assert.equal(server._isValidHostHeader({ headers: { host: '   ' } }), false);
  assert.equal(server._isValidHostHeader({ headers: { host: `127.0.0.1:${info.port}` } }), true);

  const rawNoHostResp = await sendRawHttp10NoHost(info.port, `/health?token=${info.token}`);
  assert.match(rawNoHostResp, /^HTTP\/1\.1 403\b/, 'HTTP/1.0 request without Host header must fail closed with 403');

  // 5) revealInFolder preserves execHooks & absPath compatibility and blocks extended UNC
  const safeFile = path.join(tmpDir, 'readme.md');
  fs.writeFileSync(safeFile, '# ok\n', 'utf8');
  const revOk = await server.handleRpcAction('revealInFolder', { path: safeFile });
  assert.equal(revOk.ok, true);
  assert.equal(revOk.absPath, safeFile);
  assert.equal(revealedHooks.length, 1);
  assert.equal(revealedHooks[0].p, safeFile);

  const revUnc = await server.handleRpcAction('revealInFolder', {
    path: '\\\\?\\GLOBALROOT\\Device\\Mup\\evil.invalid\\share\\a.txt',
  });
  assert.equal(revUnc.ok, false);
});

test('security-sidecar 2: workbench-page /sandbox-init failure renders .wb-empty without ReferenceError or /stream downgrade, blocks CSS image-set, caps SVG raster dimensions, and aborts waveform decode on cleanup', async () => {
  const { renderWorkbenchHtml } = await importRel('vendor/omni-viewer/workbench-page.mjs');

  // 2A) Real VM + Mock DOM: /sandbox-init returns HTTP 500 -> showSandboxFail renders .wb-empty, zero ReferenceError, zero /stream fetch
  {
    const fetchedUrls = [];
    const unhandled = [];
    const onUnhandled = (err) => unhandled.push(err);
    process.on('unhandledRejection', onUnhandled);
    try {
      const html = renderWorkbenchHtml({
        kind: 'html',
        path: '/tmp/untrusted.html',
        baseUrl: 'http://127.0.0.1:43210',
        token: 'tok-test',
        lang: 'zh-CN',
      });
      const scriptSrc = extractInlineWorkbenchScript(html);
      const { win, stage } = createWorkbenchMockDom({
        fetchImpl: async (url) => {
          const s = String(url);
          fetchedUrls.push(s);
          if (s.includes('/meta')) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                ok: true,
                kind: 'html',
                size: 64,
                mime: 'text/html',
                textSlice: '<h1>sandbox</h1>',
              }),
            };
          }
          if (s.includes('/sandbox-init')) {
            return {
              ok: false,
              status: 500,
              json: async () => ({ ok: false, error: 'sandbox init failed' }),
            };
          }
          throw new Error(`Unexpected fetch URL: ${s}`);
        },
      });

      vm.runInNewContext(scriptSrc, win, { filename: 'workbench-sandbox-500.js' });
      await flushAsync(40);

      assert.equal(unhandled.length, 0, `Unexpected unhandledRejection: ${unhandled[0]}`);
      assert.ok(fetchedUrls.some((u) => u.includes('/sandbox-init')), 'Must call /sandbox-init');
      assert.equal(
        fetchedUrls.some((u) => u.includes('/stream')),
        false,
        'Must NEVER downgrade failed /sandbox-init to same-origin /stream'
      );

      const frameWrap = stage.querySelector('.wb-sandbox-frame-wrap');
      assert.ok(frameWrap, 'Sandbox frame wrapper must exist');
      const emptyErr = frameWrap.querySelector('.wb-empty');
      assert.ok(emptyErr, 'showSandboxFail must render div.wb-empty');
      assert.equal(emptyErr.textContent, '加载失败');
      assert.equal(frameWrap.querySelector('iframe'), null, 'Iframe must be replaced on sandbox failure');
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  }

  // 2B) Real VM + Mock DOM: /sandbox-init network rejection -> also renders .wb-empty without ReferenceError or /stream
  {
    const fetchedUrls = [];
    const unhandled = [];
    const onUnhandled = (err) => unhandled.push(err);
    process.on('unhandledRejection', onUnhandled);
    try {
      const html = renderWorkbenchHtml({
        kind: 'html',
        path: '/tmp/offline.html',
        baseUrl: 'http://127.0.0.1:43210',
        token: 'tok-test',
        lang: 'en',
      });
      const scriptSrc = extractInlineWorkbenchScript(html);
      const { win, stage } = createWorkbenchMockDom({
        fetchImpl: async (url) => {
          const s = String(url);
          fetchedUrls.push(s);
          if (s.includes('/meta')) {
            return {
              ok: true,
              status: 200,
              json: async () => ({ ok: true, kind: 'html', size: 32, mime: 'text/html', textSlice: '<p>x</p>' }),
            };
          }
          if (s.includes('/sandbox-init')) {
            throw new Error('ECONNRESET');
          }
          throw new Error(`Unexpected fetch URL: ${s}`);
        },
      });

      vm.runInNewContext(scriptSrc, win, { filename: 'workbench-sandbox-reject.js' });
      await flushAsync(40);

      assert.equal(unhandled.length, 0, `Unexpected unhandledRejection: ${unhandled[0]}`);
      assert.equal(fetchedUrls.some((u) => u.includes('/stream')), false);
      const emptyErr = stage.querySelector('.wb-sandbox-frame-wrap')?.querySelector('.wb-empty');
      assert.ok(emptyErr, 'Rejected /sandbox-init must render .wb-empty');
      assert.equal(emptyErr.textContent, 'Failed to load file');
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  }

  // 2C) Real VM + Mock DOM: SVG CSS image-set() stripped & rasterizeSvgToPng caps outW/outH to 8192 and 33,554,432 px
  {
    const hugeSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="20000" height="20000" viewBox="0 0 20000 20000">' +
      '<defs><linearGradient id="safeGrad"><stop offset="0%" stop-color="#000"/></linearGradient></defs>' +
      '<rect width="100" height="100" style="fill: url(#safeGrad); background-image: image-set(url(\'https://evil.invalid/a.png\') 1x); mask-image: -webkit-image-set(\'https://evil.invalid/b.png\' 1x)"/>' +
      '</svg>';
    const html = renderWorkbenchHtml({
      kind: 'svg',
      rawContent: hugeSvg,
      name: 'huge.svg',
      lang: 'en',
    });
    const scriptSrc = extractInlineWorkbenchScript(html);
    const { win, stage, tools, createdCanvases } = createWorkbenchMockDom({
      fetchImpl: async () => ({ ok: false, status: 404 }),
    });

    vm.runInNewContext(scriptSrc, win, { filename: 'workbench-svg-sec.js' });
    await flushAsync(30);

    const rect = stage.querySelector('rect');
    assert.ok(rect, 'Sanitized SVG rect must be mounted');
    const sanitizedStyle = String(rect.getAttribute('style') || '');
    assert.ok(sanitizedStyle.includes('url(#safeGrad)'), 'Safe fragment url(#safeGrad) must be preserved');
    assert.equal(/image-set\(/i.test(sanitizedStyle), false, 'image-set() / -webkit-image-set() must be stripped');

    // Click 2x PNG export button to execute rasterizeSvgToPng on 20000x20000 SVG
    const pngBtn = tools.querySelectorAll('button').find((b) => /2x\s*PNG/i.test(b.textContent));
    assert.ok(pngBtn, 'Expected 2x PNG export button in SVG toolbar');
    pngBtn.click();
    await flushAsync(30);

    const rasterCanvas = createdCanvases.find((c) => c.width > 0 && c.height > 0);
    assert.ok(rasterCanvas, 'rasterizeSvgToPng must allocate target canvas');
    assert.ok(rasterCanvas.width <= 8192, `Canvas width must be capped <= 8192, got ${rasterCanvas.width}`);
    assert.ok(rasterCanvas.height <= 8192, `Canvas height must be capped <= 8192, got ${rasterCanvas.height}`);
    assert.ok(
      rasterCanvas.width * rasterCanvas.height <= 33554432,
      `Canvas pixel area must be capped <= 33554432, got ${rasterCanvas.width * rasterCanvas.height}`
    );
    assert.equal(rasterCanvas.width, 5792, '20000x20000 square SVG must scale down to 5792x5792 under 33,554,432 px cap');
    assert.equal(rasterCanvas.height, 5792);
  }

  // 2D) Real VM + Mock DOM: Audio waveform decode passes AbortSignal and aborts when stage cleans up
  {
    let capturedSignal = null;
    const html = renderWorkbenchHtml({
      kind: 'audio',
      path: '/tmp/clip.mp3',
      baseUrl: 'http://127.0.0.1:43210',
      token: 'tok-audio',
      lang: 'en',
    });
    const scriptSrc = extractInlineWorkbenchScript(html);
    const { win } = createWorkbenchMockDom({
      fetchImpl: (url, init) => {
        const s = String(url);
        if (s.includes('/meta')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ ok: true, kind: 'audio', size: 4096, mime: 'audio/mpeg' }),
          });
        }
        if (s.includes('/stream')) {
          capturedSignal = init?.signal || null;
          return new Promise(() => {}); // keep pending until aborted
        }
        return Promise.resolve({ ok: false, status: 404 });
      },
    });
    win.AudioContext = class MockAudioContext {
      decodeAudioData() { return new Promise(() => {}); }
      close() { return Promise.resolve(); }
    };

    vm.runInNewContext(scriptSrc, win, { filename: 'workbench-audio-abort.js' });
    await flushAsync(30);

    assert.ok(capturedSignal, 'Audio waveform fetch must receive an AbortSignal');
    assert.equal(capturedSignal.aborted, false, 'AbortSignal should not be aborted while mounted');

    // Trigger stage switch via hashchange -> runs cleanupFn() -> aborts waveform decode
    win.location.hash = '#raw=' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"><circle r="5"/></svg>');
    win.dispatchEvent('hashchange');
    await flushAsync(30);

    assert.equal(capturedSignal.aborted, true, 'AbortSignal must be aborted when audio stage unmounts');
  }
});

test('security-sidecar 3: sidebar-service disables pick-folder in sandboxMode, runs pick-folder outside serialized queue, blocks UNC paths & retries Windows rename', async (t) => {
  const { SidebarStudioService } = await importRel('vendor/sidebar-studio/sidebar-service.mjs');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-prism-sec-sb-'));
  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 1) sandboxMode blocks pick-folder early
  const sandboxSvc = new SidebarStudioService({
    statePath: path.join(tmpDir, 'sidebar-sandbox.json'),
    sandboxMode: true,
  });
  t.after(async () => {
    await sandboxSvc.dispose();
  });
  const pickSandboxRes = await sandboxSvc.handleAction('pick-folder', {});
  assert.equal(pickSandboxRes.ok, false);
  assert.match(String(pickSandboxRes.error?.message || pickSandboxRes.error || ''), /sandboxMode/i);

  // 2) pick-folder bypasses serialized _enqueue queue & strips blocked UNC initialDir
  let capturedEnv = null;
  const mockExecFile = async (_cmd, _args, opts) => {
    capturedEnv = opts?.env || null;
    const picked = path.join(tmpDir, 'chosen');
    if (process.platform === 'win32') {
      return { stdout: Buffer.from(picked, 'utf8').toString('base64') };
    }
    return { stdout: picked };
  };
  const realSvc = new SidebarStudioService({
    statePath: path.join(tmpDir, 'sidebar-real.json'),
    sandboxMode: false,
    execFile: mockExecFile,
  });
  t.after(async () => {
    await realSvc.dispose();
  });

  // Block the serialized queue with a pending task; pick-folder must still finish immediately
  let releaseQueue;
  const queueGate = new Promise((resolve) => { releaseQueue = resolve; });
  const blocker = realSvc._enqueue(() => queueGate);
  try {
    const pickRes = await Promise.race([
      realSvc.handleRpcAction('pick-folder', {
        initialDir: '\\\\?\\GLOBAL\\UNC\\evil.invalid\\share',
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('pick-folder was blocked by serialized queue')), 500)),
    ]);
    assert.equal(pickRes.ok, true);
    assert.equal(pickRes.canceled, false);
    assert.equal(capturedEnv?.AG_PRISM_PICK_INIT_DIR, '', 'Blocked UNC initialDir must be rejected before invoking picker');
  } finally {
    releaseQueue();
    await blocker;
  }

  // 3) revealFolder rejects extended UNC & GLOBALROOT Mup paths
  for (const badPath of [
    '\\\\?\\GLOBAL\\UNC\\evil.invalid\\share',
    '\\\\?\\GLOBALROOT\\Device\\Mup\\evil.invalid\\share',
  ]) {
    const openRes = await realSvc.revealFolder({ path: badPath });
    assert.equal(openRes.ok, false);
    assert.match(String(openRes.error || ''), /无效/);
  }

  // 4) On Windows, _persistState retries transient EBUSY up to 4 attempts (3 retries) with backoff
  if (process.platform === 'win32') {
    const origRenameSync = fs.renameSync;
    let renameCalls = 0;
    try {
      fs.renameSync = (src, dest) => {
        renameCalls += 1;
        if (renameCalls <= 3) {
          const e = new Error('EBUSY simulated');
          e.code = 'EBUSY';
          throw e;
        }
        return origRenameSync.call(fs, src, dest);
      };
      realSvc._saveStateAtomic(realSvc._state);
      assert.equal(renameCalls, 4, 'Expected 4 total attempts (3 retries) on transient Windows EBUSY');
    } finally {
      fs.renameSync = origRenameSync;
    }
  }
});

test('security-sidecar 4: update-service verifies SHA-256 in memory before disk write, cancels non-OK bodies, matches SHA256SUMS case-insensitively & guards spawn errors', async (t) => {
  const { UpdateService } = await importRel('sidecars/daemon/update-service.mjs');
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-prism-sec-upd-'));
  t.after(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  // 1) Tampered binary fails SHA-256 in memory BEFORE touching disk or calling spawnFn
  {
    const expectedSha = 'a'.repeat(64);
    const badPayload = Buffer.from('tampered-installer-binary');
    const svc = new UpdateService({
      currentVersion: '1.0.5',
      platform: 'win32',
      tmpRoot,
      fetchFn: async (url) => {
        if (String(url).includes('/releases/latest')) {
          return {
            ok: true,
            status: 200,
            headers: new Map(),
            json: async () => ({
              tag_name: 'v1.0.6',
              draft: false,
              prerelease: false,
              html_url: 'https://github.com/xnnnc/GravityPrism/releases/tag/v1.0.6',
              assets: [
                {
                  name: 'gravity-prism-installer.exe',
                  browser_download_url: 'https://github.com/xnnnc/GravityPrism/releases/download/v1.0.6/gravity-prism-installer.exe',
                  digest: `sha256:${expectedSha}`,
                },
              ],
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          headers: new Map(),
          arrayBuffer: async () => badPayload.buffer.slice(badPayload.byteOffset, badPayload.byteOffset + badPayload.byteLength),
        };
      },
      spawnFn: () => {
        throw new Error('spawnFn must NEVER be called on sha256_mismatch');
      },
    });
    const res = await svc.applyReleaseUpdate({ confirm: true });
    assert.equal(res.ok, false);
    assert.equal(res.error, 'sha256_mismatch');
    assert.deepEqual(
      fs.readdirSync(tmpRoot),
      [],
      'Untrusted payload must fail SHA-256 in memory before creating temp dir or writing .exe'
    );
  }

  // 2) Non-OK SHA256SUMS and download responses cancel response bodies
  {
    let shaCanceled = false;
    const svcShaErr = new UpdateService({
      currentVersion: '1.0.5',
      platform: 'win32',
      tmpRoot,
      fetchFn: async (url) => {
        if (String(url).includes('/releases/latest')) {
          return {
            ok: true,
            status: 200,
            headers: new Map(),
            json: async () => ({
              tag_name: 'v1.0.6',
              draft: false,
              prerelease: false,
              html_url: 'https://github.com/xnnnc/GravityPrism/releases/tag/v1.0.6',
              assets: [
                {
                  name: 'gravity-prism-installer.exe',
                  browser_download_url: 'https://github.com/xnnnc/GravityPrism/releases/download/v1.0.6/gravity-prism-installer.exe',
                },
                {
                  name: 'SHA256SUMS.txt',
                  browser_download_url: 'https://github.com/xnnnc/GravityPrism/releases/download/v1.0.6/SHA256SUMS.txt',
                },
              ],
            }),
          };
        }
        return {
          ok: false,
          status: 503,
          headers: new Map(),
          body: { cancel: async () => { shaCanceled = true; } },
        };
      },
    });
    const shaErrRes = await svcShaErr.applyReleaseUpdate({ confirm: true });
    assert.equal(shaErrRes.ok, false);
    assert.equal(shaErrRes.error, 'sha256sums_http_503');
    assert.equal(shaCanceled, true, 'Non-OK SHA256SUMS response body must be canceled');

    let dlCanceled = false;
    const svcDlErr = new UpdateService({
      currentVersion: '1.0.5',
      platform: 'win32',
      tmpRoot,
      fetchFn: async (url) => {
        if (String(url).includes('/releases/latest')) {
          return {
            ok: true,
            status: 200,
            headers: new Map(),
            json: async () => ({
              tag_name: 'v1.0.6',
              draft: false,
              prerelease: false,
              html_url: 'https://github.com/xnnnc/GravityPrism/releases/tag/v1.0.6',
              assets: [
                {
                  name: 'gravity-prism-installer.exe',
                  browser_download_url: 'https://github.com/xnnnc/GravityPrism/releases/download/v1.0.6/gravity-prism-installer.exe',
                  digest: `sha256:${'b'.repeat(64)}`,
                },
              ],
            }),
          };
        }
        return {
          ok: false,
          status: 502,
          headers: new Map(),
          body: { cancel: async () => { dlCanceled = true; } },
        };
      },
    });
    const dlErrRes = await svcDlErr.applyReleaseUpdate({ confirm: true });
    assert.equal(dlErrRes.ok, false);
    assert.equal(dlErrRes.error, 'download_http_502');
    assert.equal(dlCanceled, true, 'Non-OK download response body must be canceled');
  }

  // 3) Case-insensitive SHA256SUMS asset name match + spawn child error listener prevents crash
  {
    const goodPayload = Buffer.from('MZ-valid-installer-payload');
    const goodSha = crypto.createHash('sha256').update(goodPayload).digest('hex');
    const fakeChild = new EventEmitter();
    fakeChild.unref = () => {};
    let spawnedExe = '';

    const svcOk = new UpdateService({
      currentVersion: '1.0.5',
      platform: 'win32',
      tmpRoot,
      fetchFn: async (url) => {
        const s = String(url);
        if (s.includes('/releases/latest')) {
          return {
            ok: true,
            status: 200,
            headers: new Map(),
            json: async () => ({
              tag_name: 'v1.0.6',
              draft: false,
              prerelease: false,
              html_url: 'https://github.com/xnnnc/GravityPrism/releases/tag/v1.0.6',
              assets: [
                {
                  name: 'gravity-prism-installer.exe',
                  browser_download_url: 'https://github.com/xnnnc/GravityPrism/releases/download/v1.0.6/gravity-prism-installer.exe',
                },
                {
                  name: 'SHA256SUMS.txt',
                  browser_download_url: 'https://github.com/xnnnc/GravityPrism/releases/download/v1.0.6/SHA256SUMS.txt',
                },
              ],
            }),
          };
        }
        if (s.includes('SHA256SUMS.txt')) {
          const sumsBuf = Buffer.from(`${goodSha.toUpperCase()}  GRAVITY-PRISM-INSTALLER.EXE\n`, 'utf8');
          return {
            ok: true,
            status: 200,
            headers: new Map(),
            arrayBuffer: async () => sumsBuf.buffer.slice(sumsBuf.byteOffset, sumsBuf.byteOffset + sumsBuf.byteLength),
          };
        }
        return {
          ok: true,
          status: 200,
          headers: new Map(),
          arrayBuffer: async () => goodPayload.buffer.slice(goodPayload.byteOffset, goodPayload.byteOffset + goodPayload.byteLength),
        };
      },
      spawnFn: (exe) => {
        spawnedExe = exe;
        return fakeChild;
      },
    });

    const okRes = await svcOk.applyReleaseUpdate({ confirm: true });
    assert.equal(okRes.ok, true);
    assert.equal(okRes.sha256Verified, true);
    assert.equal(okRes.sha256, goodSha);
    assert.ok(spawnedExe.endsWith('gravity-prism-installer.exe'));
    assert.ok(fakeChild.listenerCount('error') >= 1, 'spawn child must attach an error listener');
    assert.doesNotThrow(() => fakeChild.emit('error', new Error('simulated spawn ENOENT')));
  }
});

test('security-sidecar 5: inject.js isolates injectOnce errors (preserving Channel 5), enforces fail-closed mainFrame context & dynamically adds SIDEBAR_BINDING on hot toggle', async () => {
  const injectSrc = fs.readFileSync(path.join(ROOT, 'inject.js'), 'utf8');

  function loadInjectHarness({ initialConfig, pages, connectHandler, watchMode = false }) {
    let configState = { ...initialConfig };
    const writtenFiles = new Map();
    const watchers = [];
    const intervals = [];

    const mockFs = {
      writeFileSync(p, data) {
        writtenFiles.set(String(p), String(data));
        if (String(p) === '/mock/config.json') {
          configState = JSON.parse(String(data));
        }
      },
      appendFileSync() {},
      readFileSync(p) {
        if (writtenFiles.has(String(p))) return writtenFiles.get(String(p));
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      },
      unlinkSync() {},
      watch(_dir, _opts, cb) {
        const w = { cb, close() {} };
        watchers.push(w);
        return w;
      },
    };

    const mockCdp = {
      PORT_FILE: '/mock/port',
      PID_FILE: '/mock/pid',
      CONFIG_FILE: '/mock/config.json',
      SETTING_BINDING: '__agPrismSetSetting',
      LEGACY_SETTING_BINDING: '__agPrismLegacySet',
      OMNI_BINDING: '__agPrismOmniCall',
      SIDEBAR_BINDING: '__agPrismSidebarCall',
      validateConfigEntry: () => true,
      reconcileConfigAliases: (patch) => patch,
      isEligibleTarget: () => true,
      readConfig: () => ({ ...configState }),
      writeConfig: (next) => {
        configState = { ...next };
        writtenFiles.set('/mock/config.json', JSON.stringify(next, null, 2) + '\n');
      },
      readPidFromLockFile: () => null,
      isExpectedDaemonProcess: () => false,
      readPort: () => 9222,
      listPages: async () => pages,
      CdpSession: {
        connect: connectHandler,
      },
      buildInjectExpression: () => '/*MAIN_EXPR*/',
      buildConfigRefreshExpression: () => '/*FAST_REFRESH_EXPR*/',
      buildOmniClientExpression: () => '/*OMNI_EXPR*/',
      buildSidebarStudioExpression: () => '/*SIDEBAR_EXPR*/',
      shouldEnableHostI18n: () => false,
      buildHostI18nExpression: () => '',
      HOST_I18N_REMOVE_EXPRESSION: '/*HOST_I18N_REMOVE*/',
      shouldEnableThought: (cfg) => Boolean(cfg?.thoughtTranslate && cfg.thoughtTranslate !== 'off'),
      buildThoughtExpression: () => '/*THOUGHT_EXPR*/',
      THOUGHT_REMOVE_EXPRESSION: '/*THOUGHT_REMOVE_EXPR*/',
    };

    const mockProcess = new EventEmitter();
    mockProcess.argv = watchMode ? ['node', 'inject.js', '--watch'] : ['node', 'inject.js'];
    mockProcess.pid = 424242;
    mockProcess.kill = () => { throw new Error('ESRCH'); };
    mockProcess.exit = (code) => { throw new Error(`process.exit(${code})`); };

    const moduleObj = { exports: {} };
    const reqFn = (spec) => {
      if (spec === 'fs') return mockFs;
      if (spec === 'path') return path;
      if (spec === './cdp') return mockCdp;
      throw new Error(`Unexpected require: ${spec}`);
    };
    reqFn.cache = {};
    reqFn.resolve = (spec) => spec;
    reqFn.main = {}; // not equal to moduleObj, so script exports cleanly without auto-running

    const sandbox = {
      require: reqFn,
      module: moduleObj,
      exports: moduleObj.exports,
      __dirname: ROOT,
      __filename: path.join(ROOT, 'inject.js'),
      process: mockProcess,
      console: { log() {}, error() {}, warn() {} },
      Buffer,
      setTimeout,
      clearTimeout,
      setInterval: (fn, ms) => {
        const id = { fn, ms };
        intervals.push(id);
        return id;
      },
      clearInterval() {},
    };

    vm.runInNewContext(injectSrc, sandbox, { filename: 'inject.js' });
    return {
      exports: moduleObj.exports,
      getConfig: () => ({ ...configState }),
      setConfig: (patch) => { configState = { ...configState, ...patch }; },
      watchers,
      intervals,
    };
  }

  function createFakeCdpSession({ mainFrameId = 'main-frame-1', hasFrameTree = true } = {}) {
    const handlers = new Map();
    const sent = [];
    const evaluated = [];
    let closed = false;
    let nextScriptId = 1;
    const session = {
      get closed() { return closed; },
      onClose: null,
      sent,
      evaluated,
      on(event, fn) {
        if (!handlers.has(event)) handlers.set(event, []);
        handlers.get(event).push(fn);
      },
      async emitEvent(event, params) {
        for (const fn of [...(handlers.get(event) || [])]) {
          await fn(params);
        }
      },
      async send(method, params) {
        sent.push({ method, params });
        if (method === 'Page.getFrameTree') {
          return hasFrameTree ? { frameTree: { frame: { id: mainFrameId } } } : null;
        }
        if (method === 'Page.addScriptToEvaluateOnNewDocument') {
          return { identifier: `script-${nextScriptId++}` };
        }
        return {};
      },
      async evaluate(expression) {
        evaluated.push(expression);
        if (expression === '/*MAIN_EXPR*/') return { version: '1.0.7', status: 'ok' };
        if (expression === '/*FAST_REFRESH_EXPR*/') return { refreshed: true, skippedStale: false };
        if (expression === '/*THOUGHT_EXPR*/') return { ok: true };
        return { ok: true };
      },
      close() {
        closed = true;
      },
    };
    return session;
  }

  // 5A) injectOnce isolates per-window connection error and preserves Channel 5 thoughtExpr / THOUGHT_REMOVE_EXPRESSION
  {
    const goodSession = createFakeCdpSession();
    const harness = loadInjectHarness({
      initialConfig: { sidebarStudio: 'off', thoughtTranslate: 'on' },
      pages: [
        { id: 'bad-win', title: 'Broken Window', webSocketDebuggerUrl: 'ws://bad' },
        { id: 'good-win', title: 'Good Window', webSocketDebuggerUrl: 'ws://good' },
      ],
      connectHandler: async (wsUrl) => {
        if (wsUrl === 'ws://bad') throw new Error('ECONNREFUSED bad window');
        return goodSession;
      },
    });

    await harness.exports.injectOnce();
    assert.ok(goodSession.evaluated.includes('/*MAIN_EXPR*/'), 'Good window must still receive main expression');
    assert.ok(goodSession.evaluated.includes('/*THOUGHT_EXPR*/'), 'Channel 5 thoughtExpr must be preserved in injectOnce');
    assert.equal(goodSession.closed, true, 'Good window session must be closed in finally');

    const offSession = createFakeCdpSession();
    const offHarness = loadInjectHarness({
      initialConfig: { sidebarStudio: 'off', thoughtTranslate: 'off' },
      pages: [{ id: 'w2', title: 'Off Window', webSocketDebuggerUrl: 'ws://off' }],
      connectHandler: async () => offSession,
    });
    await offHarness.exports.injectOnce();
    assert.ok(
      offSession.evaluated.includes('/*THOUGHT_REMOVE_EXPR*/'),
      'Channel 5 THOUGHT_REMOVE_EXPRESSION must be preserved when thoughtTranslate is off'
    );
  }

  // 5B) watch() with default sidebarStudio: 'off' does NOT register SIDEBAR_BINDING on startup,
  //     rejects untrusted/non-default/subframe contexts (fail-closed), and dynamically calls
  //     Runtime.addBinding({ name: SIDEBAR_BINDING }) when toggled to 'on' via SETTING_BINDING or fs.watch apply().
  {
    const sessionsByUrl = new Map();
    const s1 = createFakeCdpSession({ mainFrameId: 'main-frame-1' });
    const s2 = createFakeCdpSession({ mainFrameId: 'main-frame-2' });
    sessionsByUrl.set('ws://win-1', s1);
    sessionsByUrl.set('ws://win-2', s2);

    const activePages = [{ id: 'win-1', title: 'Primary Window', webSocketDebuggerUrl: 'ws://win-1' }];
    const harness = loadInjectHarness({
      initialConfig: { sidebarStudio: 'off', thoughtTranslate: 'off' },
      pages: activePages,
      watchMode: true,
      connectHandler: async (wsUrl) => sessionsByUrl.get(wsUrl),
    });

    await harness.exports.watch();

    const sidebarBindingsBefore = s1.sent.filter(
      (c) => c.method === 'Runtime.addBinding' && c.params?.name === '__agPrismSidebarCall'
    );
    assert.equal(sidebarBindingsBefore.length, 0, 'SIDEBAR_BINDING must NOT be registered when sidebarStudio is off');

    // Untrusted contexts must all be rejected fail-closed by isTrustedMainFrameContext
    // (1) Unknown contextId
    await s1.emitEvent('Runtime.bindingCalled', {
      name: '__agPrismSetSetting',
      payload: JSON.stringify({ key: 'sidebarStudio', value: 'on' }),
      executionContextId: 999,
    });
    assert.equal(harness.getConfig().sidebarStudio, 'off', 'Unknown executionContextId must be rejected');

    // (2) Missing auxData.isDefault (must require aux.isDefault === true)
    await s1.emitEvent('Runtime.executionContextCreated', {
      context: { id: 2, auxData: { frameId: 'main-frame-1', type: 'default' } },
    });
    await s1.emitEvent('Runtime.bindingCalled', {
      name: '__agPrismSetSetting',
      payload: JSON.stringify({ key: 'sidebarStudio', value: 'on' }),
      executionContextId: 2,
    });
    assert.equal(harness.getConfig().sidebarStudio, 'off', 'Context missing auxData.isDefault === true must be rejected');

    // (3) Subframe context (frameId !== mainFrameId)
    await s1.emitEvent('Runtime.executionContextCreated', {
      context: { id: 3, auxData: { frameId: 'sub-frame-evil', isDefault: true, type: 'default' } },
    });
    await s1.emitEvent('Runtime.bindingCalled', {
      name: '__agPrismSetSetting',
      payload: JSON.stringify({ key: 'sidebarStudio', value: 'on' }),
      executionContextId: 3,
    });
    assert.equal(harness.getConfig().sidebarStudio, 'off', 'Subframe context must be rejected');

    // (4) Isolated world context (type !== 'default')
    await s1.emitEvent('Runtime.executionContextCreated', {
      context: { id: 4, auxData: { frameId: 'main-frame-1', isDefault: true, type: 'isolated' } },
    });
    await s1.emitEvent('Runtime.bindingCalled', {
      name: '__agPrismSetSetting',
      payload: JSON.stringify({ key: 'sidebarStudio', value: 'on' }),
      executionContextId: 4,
    });
    assert.equal(harness.getConfig().sidebarStudio, 'off', 'Isolated world context must be rejected');

    // (5) Trusted mainFrame default context toggles sidebarStudio -> 'on'
    await s1.emitEvent('Runtime.executionContextCreated', {
      context: { id: 10, auxData: { frameId: 'main-frame-1', isDefault: true, type: 'default' } },
    });
    await s1.emitEvent('Runtime.bindingCalled', {
      name: '__agPrismSetSetting',
      payload: JSON.stringify({ key: 'sidebarStudio', value: 'on' }),
      executionContextId: 10,
    });

    assert.equal(harness.getConfig().sidebarStudio, 'on');
    const sidebarBindingsAfterToggle = s1.sent.filter(
      (c) => c.method === 'Runtime.addBinding' && c.params?.name === '__agPrismSidebarCall'
    );
    assert.equal(
      sidebarBindingsAfterToggle.length,
      1,
      'Toggling sidebarStudio to on must dynamically register SIDEBAR_BINDING via Runtime.addBinding'
    );

    // Subsequent setting update (also verifies Channel 5 hot-toggle preservation) must NOT duplicate Runtime.addBinding
    await s1.emitEvent('Runtime.bindingCalled', {
      name: '__agPrismSetSetting',
      payload: JSON.stringify({ key: 'thoughtTranslate', value: 'on' }),
      executionContextId: 10,
    });
    const sidebarBindingsAfterSecondToggle = s1.sent.filter(
      (c) => c.method === 'Runtime.addBinding' && c.params?.name === '__agPrismSidebarCall'
    );
    assert.equal(sidebarBindingsAfterSecondToggle.length, 1, 'ensureSidebarBinding must be idempotent once bound');
    assert.ok(s1.evaluated.includes('/*THOUGHT_EXPR*/'), 'Channel 5 thoughtExpr must be injected on hot toggle');

    // (6) Also verify apply() path via fs.watch hot-reload when a window attached while sidebarStudio was 'off'
    harness.setConfig({ sidebarStudio: 'off' });
    activePages.push({ id: 'win-2', title: 'Second Window', webSocketDebuggerUrl: 'ws://win-2' });
    await harness.intervals[0].fn(); // tick() attaches win-2 while sidebarStudio is 'off'
    assert.equal(
      s2.sent.filter((c) => c.method === 'Runtime.addBinding' && c.params?.name === '__agPrismSidebarCall').length,
      0,
      'win-2 must not bind SIDEBAR_BINDING when attached under sidebarStudio: off'
    );

    // External config change + fs.watch reload triggers apply(entry) -> dynamically binds SIDEBAR_BINDING on win-2
    harness.setConfig({ sidebarStudio: 'on' });
    harness.watchers[0].cb('change', 'style.css');
    await flushAsync(260);
    assert.equal(
      s2.sent.filter((c) => c.method === 'Runtime.addBinding' && c.params?.name === '__agPrismSidebarCall').length,
      1,
      'apply() during hot reload must dynamically register SIDEBAR_BINDING on previously off windows'
    );
  }
});

test('security-sidecar 6: red-team hardening for NT device/mixed-slash UNC whitelist, sidebar-service decoupling, /stream active-doc CSP, kind=pdf sandbox bypass defense & Win32 updater cwd', async (t) => {
  const { OmniServer, isBlockedUncPath: omniIsBlockedUncPath } = await importRel('vendor/omni-viewer/omni-server.mjs');
  const { renderWorkbenchHtml } = await importRel('vendor/omni-viewer/workbench-page.mjs');
  const { SidebarStudioService, isBlockedUncPath: sidebarIsBlockedUncPath } = await importRel('vendor/sidebar-studio/sidebar-service.mjs');
  const { UpdateService } = await importRel('sidecars/daemon/update-service.mjs');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-prism-sec-redteam6-'));
  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 1) Strict UNC / NT device whitelist & mixed-slash blocking in BOTH omni-server and decoupled sidebar-service
  const sidebarSrc = fs.readFileSync(path.join(ROOT, 'vendor', 'sidebar-studio', 'sidebar-service.mjs'), 'utf8');
  assert.equal(
    /omni-viewer\/omni-server\.mjs/.test(sidebarSrc),
    false,
    'sidebar-service.mjs must inline isBlockedUncPath and never import ../omni-viewer/omni-server.mjs'
  );

  const blockedBypassPaths = [
    '\\\\?\\GLOBALROOT\\Device\\LanmanRedirector\\evil.invalid\\share\\a.txt',
    '\\\\?\\GLOBALROOT\\Device\\WebDavRedirector\\evil.invalid\\share\\a.txt',
    '\\\\?\\GLOBALROOT\\Device\\Mup\\evil.invalid\\share\\a.txt',
    '\\\\?\\GLOBALROOT\\Device\\Mup\\;LanmanRedirector\\;Z:0\\evil.invalid\\share',
    '//?/GLOBALROOT/Device/LanmanRedirector/evil.invalid/share/a.txt',
    '\\\\.\\Device\\Mup\\evil.invalid\\share',
    '\\\\.\\pipe\\malicious',
    '/\\evil.invalid\\share\\a.txt',
    '\\/evil.invalid/share/a.txt',
    '/\\?\\GLOBALROOT\\Device\\LanmanRedirector\\evil.invalid\\share',
    'file:///\\evil.invalid\\share\\a.txt',
  ];
  for (const p of blockedBypassPaths) {
    assert.equal(omniIsBlockedUncPath(p), true, `omni-server must block NT device / mixed-slash UNC: ${p}`);
    assert.equal(sidebarIsBlockedUncPath(p), true, `sidebar-service must block NT device / mixed-slash UNC: ${p}`);
  }

  const allowedWhitelistPaths = [
    '\\\\?\\C:\\Users\\demo\\notes.md',
    '\\\\?\\GLOBAL\\UNC\\localhost\\share\\a.txt',
    '\\\\?\\GLOBAL\\UNC\\127.0.0.1\\share\\a.txt',
    '\\\\?\\GLOBAL\\UNC\\wsl.localhost\\Ubuntu\\home\\a.txt',
    '\\\\?\\GLOBAL\\UNC\\wsl$\\Ubuntu\\home\\a.txt',
    '\\\\?\\UNC\\localhost\\share\\a.txt',
    'C:\\Users\\demo\\notes.md',
  ];
  for (const p of allowedWhitelistPaths) {
    assert.equal(omniIsBlockedUncPath(p), false, `omni-server must allow local whitelist path: ${p}`);
    assert.equal(sidebarIsBlockedUncPath(p), false, `sidebar-service must allow local whitelist path: ${p}`);
  }

  // 2) sidebar-service pickFolder & revealFolder must reject mixed-slash / NT device paths BEFORE fs.realpathSync
  {
    let capturedPickEnv = null;
    const sbSvc = new SidebarStudioService({
      statePath: path.join(tmpDir, 'sidebar-decoupled.json'),
      sandboxMode: false,
      execFile: async (_cmd, _args, opts) => {
        capturedPickEnv = opts?.env || null;
        return { stdout: '' };
      },
    });
    t.after(async () => {
      await sbSvc.dispose();
    });

    const origRealpathSync = fs.realpathSync;
    let realpathHits = 0;
    fs.realpathSync = (...args) => {
      realpathHits += 1;
      return origRealpathSync.apply(fs, args);
    };
    try {
      for (const badPath of [
        '/\\remote.invalid\\share',
        '\\/remote.invalid/share',
        '\\\\?\\GLOBALROOT\\Device\\LanmanRedirector\\remote.invalid\\share',
        '\\\\?\\GLOBALROOT\\Device\\WebDavRedirector\\remote.invalid\\share',
        '\\\\?\\GLOBALROOT\\Device\\Mup\\remote.invalid\\share',
      ]) {
        const rev = await sbSvc.revealFolder({ path: badPath });
        assert.equal(rev.ok, false, `revealFolder must reject ${badPath}`);
        const pick = await sbSvc.pickFolder({ initialDir: badPath });
        assert.equal(pick.ok, true);
        assert.equal(capturedPickEnv?.AG_PRISM_PICK_INIT_DIR, '', `pickFolder must strip blocked initialDir ${badPath}`);
      }
      assert.equal(
        realpathHits,
        0,
        'pickFolder & revealFolder must block mixed-slash and NT device paths BEFORE invoking fs.realpathSync'
      );
    } finally {
      fs.realpathSync = origRealpathSync;
    }
  }

  // 3) OmniServer /stream attaches strict sandbox CSP for non-sandbox .html/.htm/.xhtml/.svg (and NOT for /sandbox/ or .pdf)
  {
    const omni = new OmniServer({ rootDir: tmpDir });
    t.after(async () => {
      await omni.stop();
    });
    const info = await omni.start();

    const httpGet = (urlStr) =>
      new Promise((resolve, reject) => {
        http
          .get(urlStr, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () =>
              resolve({
                statusCode: res.statusCode,
                headers: res.headers,
                body: Buffer.concat(chunks).toString('utf8'),
              })
            );
          })
          .on('error', reject);
      });

    const expectedCsp = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
    for (const [name, content] of [
      ['page.html', '<html><body><script>alert(1)</script></body></html>'],
      ['page.htm', '<html><body>htm</body></html>'],
      ['page.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml"><body>xhtml</body></html>'],
      ['vec.svg', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'],
    ]) {
      const f = path.join(tmpDir, name);
      fs.writeFileSync(f, content, 'utf8');
      const r = await httpGet(`${info.baseUrl}/stream?token=${info.token}&path=${encodeURIComponent(f)}`);
      assert.equal(r.statusCode, 200);
      assert.equal(
        r.headers['content-security-policy'],
        expectedCsp,
        `/stream must attach strict sandbox CSP header for ${name}`
      );
    }

    const pdfFile = path.join(tmpDir, 'sample.pdf');
    fs.writeFileSync(pdfFile, '%PDF-1.4\n%%EOF\n', 'utf8');
    const pdfRes = await httpGet(`${info.baseUrl}/stream?token=${info.token}&path=${encodeURIComponent(pdfFile)}`);
    assert.equal(pdfRes.statusCode, 200);
    assert.equal(pdfRes.headers['content-security-policy'], undefined, '/stream for .pdf must not force sandbox CSP');

    // Sandbox HTML route (/sandbox/<tok>/<mountId>/page.html) must keep normal interactive preview without default-src none
    const htmlFile = path.join(tmpDir, 'page.html');
    const initResp = await httpGet(`${info.baseUrl}/sandbox-init?token=${info.token}&path=${encodeURIComponent(htmlFile)}`);
    assert.equal(initResp.statusCode, 200);
    const initJson = JSON.parse(initResp.body);
    const sbResp = await httpGet(initJson.sandboxUrl);
    assert.equal(sbResp.statusCode, 200);
    assert.equal(sbResp.headers['content-security-policy'], undefined, 'Isolated /sandbox/ HTML must not set default-src none CSP');
  }

  // 4) Workbench kind=pdf must NEVER render unsandboxed .wb-pdf-frame for .html or .svg
  {
    // 4A) kind=pdf pointing at .html -> downgraded to sandboxed HTML via /sandbox-init
    const fetchedHtml = [];
    const htmlPage = renderWorkbenchHtml({
      kind: 'pdf',
      path: '/tmp/evil.html',
      baseUrl: 'http://127.0.0.1:43210',
      token: 'tok-master',
      lang: 'en',
    });
    const htmlScript = extractInlineWorkbenchScript(htmlPage);
    const domHtml = createWorkbenchMockDom({
      fetchImpl: async (url) => {
        const s = String(url);
        fetchedHtml.push(s);
        if (s.includes('/meta')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ ok: true, kind: 'html', size: 64, mime: 'text/html', textSlice: '<script>steal()</script>' }),
          };
        }
        if (s.includes('/sandbox-init')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ ok: true, url: 'http://127.0.0.1:43210/sandbox/scoped/m1/evil.html' }),
          };
        }
        throw new Error(`Unexpected fetch URL: ${s}`);
      },
    });
    vm.runInNewContext(htmlScript, domHtml.win, { filename: 'wb-kind-pdf-html.js' });
    await flushAsync(40);
    assert.equal(domHtml.stage.querySelector('.wb-pdf-frame'), null, 'kind=pdf must NEVER mount unsandboxed .wb-pdf-frame for .html');
    const sbFrame = domHtml.stage.querySelector('.wb-sandbox-frame');
    assert.ok(sbFrame, 'kind=pdf with .html must fall back to sandboxed HTML iframe');
    assert.ok(String(sbFrame.getAttribute('sandbox') || '').includes('allow-scripts'));
    assert.ok(fetchedHtml.some((u) => u.includes('/sandbox-init')));

    // 4B) kind=pdf pointing at .svg -> downgraded to sanitized SVG stage (zero .wb-pdf-frame)
    const svgPage = renderWorkbenchHtml({
      kind: 'pdf',
      path: '/tmp/evil.svg',
      baseUrl: 'http://127.0.0.1:43210',
      token: 'tok-master',
      lang: 'en',
    });
    const svgScript = extractInlineWorkbenchScript(svgPage);
    const domSvg = createWorkbenchMockDom({
      fetchImpl: async (url) => {
        const s = String(url);
        if (s.includes('/meta')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ok: true,
              kind: 'svg',
              size: 80,
              mime: 'image/svg+xml',
              textSlice: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><circle r="5"/></svg>',
            }),
          };
        }
        return { ok: false, status: 404 };
      },
    });
    vm.runInNewContext(svgScript, domSvg.win, { filename: 'wb-kind-pdf-svg.js' });
    await flushAsync(40);
    assert.equal(domSvg.stage.querySelector('.wb-pdf-frame'), null, 'kind=pdf must NEVER mount unsandboxed .wb-pdf-frame for .svg');
    assert.equal(domSvg.stage.querySelector('script'), null, 'Downgraded SVG must sanitize inline <script>');
    assert.ok(domSvg.stage.querySelector('circle'), 'Downgraded SVG must render sanitized vector elements');

    // 4C) kind=pdf pointing at .html when /meta fails -> still must NEVER mount .wb-pdf-frame
    const errPage = renderWorkbenchHtml({
      kind: 'pdf',
      path: '/tmp/offline-evil.html',
      baseUrl: 'http://127.0.0.1:43210',
      token: 'tok-master',
      lang: 'en',
    });
    const errScript = extractInlineWorkbenchScript(errPage);
    const domErr = createWorkbenchMockDom({
      fetchImpl: async () => {
        throw new Error('network error');
      },
    });
    vm.runInNewContext(errScript, domErr.win, { filename: 'wb-kind-pdf-offline.js' });
    await flushAsync(40);
    assert.equal(domErr.stage.querySelector('.wb-pdf-frame'), null, 'kind=pdf with .html must NEVER mount .wb-pdf-frame even if /meta fails');

    // 4D) Legitimate .pdf + application/pdf continues to mount native .wb-pdf-frame
    const realPdfPage = renderWorkbenchHtml({
      kind: 'pdf',
      path: '/tmp/spec.pdf',
      baseUrl: 'http://127.0.0.1:43210',
      token: 'tok-master',
      lang: 'en',
    });
    const realPdfScript = extractInlineWorkbenchScript(realPdfPage);
    const domRealPdf = createWorkbenchMockDom({
      fetchImpl: async (url) => {
        if (String(url).includes('/meta')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ ok: true, kind: 'pdf', size: 1024, mime: 'application/pdf' }),
          };
        }
        return { ok: false, status: 404 };
      },
    });
    vm.runInNewContext(realPdfScript, domRealPdf.win, { filename: 'wb-real-pdf.js' });
    await flushAsync(40);
    const pdfFrame = domRealPdf.stage.querySelector('.wb-pdf-frame');
    assert.ok(pdfFrame, 'Verified .pdf with application/pdf must still render native .wb-pdf-frame');
    assert.ok(String(pdfFrame.src || '').includes('/stream'));
  }

  // 5) UpdateService on Win32 spawns installer with cwd set to System32 (never writable tmpRoot)
  {
    const updRoot = fs.mkdtempSync(path.join(tmpDir, 'upd-cwd-'));
    const payload = Buffer.from('MZ-installer-cwd-check');
    const sha = crypto.createHash('sha256').update(payload).digest('hex');
    let capturedSpawnOpts = null;
    const fakeChild = new EventEmitter();
    fakeChild.unref = () => {};

    const updSvc = new UpdateService({
      currentVersion: '1.0.6',
      platform: 'win32',
      tmpRoot: updRoot,
      fetchFn: async (url) => {
        if (String(url).includes('/releases/latest')) {
          return {
            ok: true,
            status: 200,
            headers: new Map(),
            json: async () => ({
              tag_name: 'v1.0.7',
              draft: false,
              prerelease: false,
              html_url: 'https://github.com/xnnnc/GravityPrism/releases/tag/v1.0.7',
              assets: [
                {
                  name: 'gravity-prism-installer.exe',
                  browser_download_url: 'https://github.com/xnnnc/GravityPrism/releases/download/v1.0.7/gravity-prism-installer.exe',
                  digest: `sha256:${sha}`,
                },
              ],
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          headers: new Map(),
          arrayBuffer: async () => payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength),
        };
      },
      spawnFn: (_exe, _args, opts) => {
        capturedSpawnOpts = opts;
        return fakeChild;
      },
    });

    const applyRes = await updSvc.applyReleaseUpdate({ confirm: true });
    assert.equal(applyRes.ok, true);
    assert.equal(
      capturedSpawnOpts?.cwd,
      path.join(process.env.SystemRoot || 'C:\\Windows', 'System32'),
      'Win32 installer spawn must use System32 as cwd to prevent DLL preloading from TEMP'
    );
  }
});

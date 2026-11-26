import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import {
  WALLPAPER_CONFIG_FILENAME,
  DEFAULT_WALLPAPER_CONFIG,
  MAX_BLOB_FALLBACK_BYTES,
  resolveWallpaperConfigPath,
  validateWallpaperMediaPath,
  verifyMediaMagicBytes,
  writeConfigFileAtomicSync,
  createWallpaperService,
} from '../vendor/wallpaper/wallpaper-service.mjs';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const cdp = require(path.join(ROOT, 'cdp.js'));
const wallpaperClientMod = require(path.join(ROOT, 'vendor', 'wallpaper', 'wallpaper-client.js'));
const wallpaperSettingsUiMod = require(path.join(ROOT, 'vendor', 'wallpaper', 'wallpaper-settings-ui.js'));
const settingsPanelMod = require(path.join(ROOT, 'settings-panel.js'));

const NO_TR_ATTRS = [
  ['translate', 'no'],
  ['data-no-translate', 'true'],
  ['data-ag-localization-skip', 'true'],
  ['data-agy-no-translate', 'true'],
  ['data-antigravity-zh-skip', '1'],
  ['data-ag-no-i18n', ''],
];

function mkTempDir(prefix = 'prism-wp-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function makeValidPngBuffer(extraBytes = 16) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([sig, Buffer.alloc(extraBytes, 0x41)]);
}

function makeValidJpegBuffer() {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
}

function makeValidGifBuffer() {
  return Buffer.from('GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff!\xf9\x04\x01\x00\x00\x00\x00,', 'binary');
}

function makeValidWebpBuffer() {
  const b = Buffer.alloc(20, 0);
  b.write('RIFF', 0, 'ascii');
  b.writeUInt32LE(12, 4);
  b.write('WEBP', 8, 'ascii');
  b.write('VP8 ', 12, 'ascii');
  return b;
}

function makeValidAvifBuffer() {
  const b = Buffer.alloc(24, 0);
  b.writeUInt32BE(24, 0);
  b.write('ftyp', 4, 'ascii');
  b.write('avif', 8, 'ascii');
  b.write('mif1', 16, 'ascii');
  b.write('avif', 20, 'ascii');
  return b;
}

function makeValidMp4Buffer(payloadLen = 128) {
  const head = Buffer.alloc(24, 0);
  head.writeUInt32BE(24, 0);
  head.write('ftyp', 4, 'ascii');
  head.write('isom', 8, 'ascii');
  head.writeUInt32BE(0x200, 12);
  head.write('isom', 16, 'ascii');
  head.write('mp41', 20, 'ascii');
  const body = Buffer.alloc(payloadLen);
  for (let i = 0; i < payloadLen; i++) body[i] = i & 0xff;
  return Buffer.concat([head, body]);
}

function makeValidWebmBuffer() {
  return Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01]);
}

function checkBalancedBraces(css) {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === '\\' && (inSingle || inDouble)) {
      i += 1;
      continue;
    }
    if (!inDouble && ch === "'") {
      inSingle = !inSingle;
      continue;
    }
    if (!inSingle && ch === '"') {
      inDouble = !inDouble;
      continue;
    }
    if (inSingle || inDouble) continue;
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth < 0) return false;
    }
  }
  return depth === 0 && !inSingle && !inDouble;
}

function httpRequestRaw(urlStr, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: opts.method || 'GET',
        headers: opts.headers || {},
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

function createDomSandbox() {
  const docListeners = new Map();
  const winListeners = new Map();
  const observers = [];
  const createdUrls = [];
  const revokedUrls = [];
  let urlSeq = 1;
  let doc = null;

  function notifyObservers(target, attrName) {
    for (const obs of observers) {
      if (!obs.active || obs.target !== target) continue;
      if (Array.isArray(obs.filter) && !obs.filter.includes(attrName)) continue;
      obs.cb([{ type: 'attributes', target, attributeName: attrName }]);
    }
  }

  class MockMutationObserver {
    constructor(cb) {
      this.cb = cb;
      this.active = false;
      this.target = null;
      this.filter = null;
      observers.push(this);
    }
    observe(target, opts = {}) {
      this.active = true;
      this.target = target;
      this.filter = opts.attributeFilter || null;
    }
    disconnect() {
      this.active = false;
    }
  }

  function makeNode(tag, initAttrs = {}) {
    const attrs = new Map(Object.entries(initAttrs).map(([k, v]) => [k, String(v)]));
    const cls = new Set(String(initAttrs.class || '').split(/\s+/).filter(Boolean));
    const elListeners = new Map();
    const children = [];
    const styleProps = new Map();
    let _text = '';
    let _src = '';

    const node = {
      nodeType: 1,
      tagName: String(tag).toUpperCase(),
      ownerDocument: null,
      parentElement: null,
      parentNode: null,
      children,
      childNodes: children,
      hidden: false,
      disabled: false,
      value: '',
      muted: false,
      loop: false,
      playsInline: false,
      paused: true,
      _playCalls: 0,
      _pauseCalls: 0,
      _loadCalls: 0,
      _ops: [],
      style: {
        display: '',
        setProperty(k, v) {
          styleProps.set(k, String(v));
          this[k] = String(v);
        },
        getPropertyValue(k) {
          return styleProps.get(k) || '';
        },
        removeProperty(k) {
          styleProps.delete(k);
          delete this[k];
        },
      },
      classList: {
        add(...cs) {
          for (const c of cs) if (c) cls.add(c);
          attrs.set('class', [...cls].join(' '));
        },
        remove(...cs) {
          for (const c of cs) cls.delete(c);
          attrs.set('class', [...cls].join(' '));
        },
        contains(c) {
          return cls.has(c);
        },
      },
      get id() {
        return attrs.get('id') || '';
      },
      set id(v) {
        if (v) attrs.set('id', String(v));
        else attrs.delete('id');
      },
      get className() {
        return [...cls].join(' ');
      },
      set className(v) {
        cls.clear();
        String(v || '')
          .split(/\s+/)
          .filter(Boolean)
          .forEach((c) => cls.add(c));
        if (cls.size) attrs.set('class', [...cls].join(' '));
        else attrs.delete('class');
      },
      get src() {
        return _src;
      },
      set src(v) {
        _src = String(v || '');
        if (_src) attrs.set('src', _src);
        node._ops.push(`src=${_src}`);
      },
      get isConnected() {
        let cur = this;
        while (cur.parentElement) cur = cur.parentElement;
        return cur === html;
      },
      get firstChild() {
        return children[0] || null;
      },
      get textContent() {
        return children.length && !_text ? children.map((c) => c.textContent).join('') : _text;
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
        if (key === 'id') attrs.set('id', val);
        if (key === 'hidden') this.hidden = true;
        if (key === 'src') _src = val;
        notifyObservers(this, key);
      },
      getAttribute(k) {
        return attrs.has(String(k)) ? attrs.get(String(k)) : null;
      },
      hasAttribute(k) {
        return attrs.has(String(k));
      },
      removeAttribute(k) {
        const key = String(k);
        attrs.delete(key);
        if (key === 'hidden') this.hidden = false;
        if (key === 'src') {
          _src = '';
          this._ops.push('removeAttribute:src');
        }
        notifyObservers(this, key);
      },
      appendChild(ch) {
        if (ch.parentElement) ch.remove();
        ch.parentElement = this;
        ch.parentNode = this;
        ch.ownerDocument = doc;
        children.push(ch);
        return ch;
      },
      insertBefore(ch, ref) {
        if (ch.parentElement) ch.remove();
        ch.parentElement = this;
        ch.parentNode = this;
        ch.ownerDocument = doc;
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
      remove() {
        if (this.parentElement) this.parentElement.removeChild(this);
      },
      addEventListener(type, fn) {
        if (!elListeners.has(type)) elListeners.set(type, new Set());
        elListeners.get(type).add(fn);
      },
      removeEventListener(type, fn) {
        elListeners.get(type)?.delete(fn);
      },
      dispatchEvent(ev) {
        const e = typeof ev === 'string' ? { type: ev } : { ...ev };
        e.target = this;
        e.preventDefault = e.preventDefault || (() => {});
        e.stopPropagation = e.stopPropagation || (() => {});
        for (const fn of [...(elListeners.get(e.type) || [])]) fn(e);
      },
      click() {
        this.dispatchEvent({ type: 'click' });
      },
      focus() {
        doc.activeElement = this;
      },
      play() {
        this.paused = false;
        this._playCalls += 1;
        this._ops.push('play');
        return Promise.resolve();
      },
      pause() {
        this.paused = true;
        this._pauseCalls += 1;
        this._ops.push('pause');
      },
      load() {
        this._loadCalls += 1;
        this._ops.push('load');
      },
      closest(sel) {
        let cur = this;
        while (cur) {
          if (matchesSelector(cur, sel)) return cur;
          cur = cur.parentElement;
        }
        return null;
      },
      querySelector(sel) {
        return this.querySelectorAll(sel)[0] || null;
      },
      querySelectorAll(sel) {
        const out = [];
        const walk = (n) => {
          for (const ch of n.children) {
            if (matchesSelector(ch, sel)) out.push(ch);
            walk(ch);
          }
        };
        walk(this);
        return out;
      },
    };
    return node;
  }

  function matchSingleToken(el, token) {
    let rem = token.trim();
    if (!rem) return false;
    const tagM = /^[a-zA-Z0-9_-]+/.exec(rem);
    if (tagM) {
      if (el.tagName !== tagM[0].toUpperCase()) return false;
      rem = rem.slice(tagM[0].length);
    }
    while (rem.length > 0) {
      if (rem[0] === '#') {
        const m = /^#([a-zA-Z0-9_-]+)/.exec(rem);
        if (!m || el.id !== m[1]) return false;
        rem = rem.slice(m[0].length);
      } else if (rem[0] === '.') {
        const m = /^\.([a-zA-Z0-9_-]+)/.exec(rem);
        if (!m || !el.classList.contains(m[1])) return false;
        rem = rem.slice(m[0].length);
      } else if (rem[0] === '[') {
        const m = /^\[([^\]=]+)(?:="([^"]*)")?\]/.exec(rem);
        if (!m) return false;
        const ok = m[2] === undefined ? el.hasAttribute(m[1]) : el.getAttribute(m[1]) === m[2];
        if (!ok) return false;
        rem = rem.slice(m[0].length);
      } else {
        return false;
      }
    }
    return true;
  }

  function matchesSelector(el, selector) {
    return String(selector || '')
      .split(',')
      .some((part) => {
        const tokens = part.trim().split(/\s+/).filter(Boolean);
        if (!tokens.length) return false;
        if (!matchSingleToken(el, tokens[tokens.length - 1])) return false;
        let cur = el.parentElement;
        let idx = tokens.length - 2;
        while (cur && idx >= 0) {
          if (matchSingleToken(cur, tokens[idx])) idx -= 1;
          cur = cur.parentElement;
        }
        return idx < 0;
      });
  }

  const html = makeNode('html');
  const head = makeNode('head');
  const body = makeNode('body', { class: 'monaco-workbench' });
  html.appendChild(head);
  html.appendChild(body);

  doc = {
    readyState: 'complete',
    hidden: false,
    activeElement: null,
    documentElement: html,
    head,
    body,
    createElement: (t) => {
      const n = makeNode(t);
      n.ownerDocument = doc;
      return n;
    },
    getElementById: (id) => html.querySelector(`#${id}`),
    querySelector: (s) => html.querySelector(s),
    querySelectorAll: (s) => html.querySelectorAll(s),
    addEventListener(t, fn) {
      if (!docListeners.has(t)) docListeners.set(t, new Set());
      docListeners.get(t).add(fn);
    },
    removeEventListener(t, fn) {
      docListeners.get(t)?.delete(fn);
    },
    dispatchEvent(ev) {
      const e = typeof ev === 'string' ? { type: ev } : ev;
      for (const fn of [...(docListeners.get(e.type) || [])]) fn(e);
    },
  };
  html.ownerDocument = doc;
  head.ownerDocument = doc;
  body.ownerDocument = doc;

  class MockBlob {
    constructor(parts, opts = {}) {
      this.parts = parts;
      this.type = opts.type || '';
    }
  }

  const mockURL = {
    createObjectURL(blob) {
      const u = `blob:obsidian-prism/${urlSeq++}`;
      createdUrls.push({ url: u, type: blob?.type || '' });
      return u;
    },
    revokeObjectURL(u) {
      revokedUrls.push(u);
    },
  };

  const sandbox = {
    window: null,
    globalThis: null,
    self: null,
    top: null,
    document: doc,
    location: { href: 'vscode-file://vscode-app/workbench.html' },
    MutationObserver: MockMutationObserver,
    Blob: MockBlob,
    URL: mockURL,
    Buffer,
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    addEventListener(t, fn) {
      if (!winListeners.has(t)) winListeners.set(t, new Set());
      winListeners.get(t).add(fn);
    },
    removeEventListener(t, fn) {
      winListeners.get(t)?.delete(fn);
    },
    dispatchEvent(ev) {
      const e = typeof ev === 'string' ? { type: ev } : ev;
      for (const fn of [...(winListeners.get(e.type) || [])]) fn(e);
    },
    setTimeout,
    clearTimeout,
    Math,
    Date,
    JSON,
    Map,
    Set,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Promise,
    RegExp,
    Error,
    Uint8Array,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  sandbox.top = sandbox;

  return {
    sandbox,
    html,
    head,
    body,
    doc,
    makeNode,
    docListeners,
    winListeners,
    observers,
    createdUrls,
    revokedUrls,
  };
}

// ── 1. Security Path & Magic Bytes Validation ───────────────────────────────

test('wallpaper-service: blocks .svg, .html, scripts, UNC, NT device paths, sensitive dirs, symlinks, and spoofed magic bytes', () => {
  const tmpDir = mkTempDir('prism-wp-sec-');
  try {
    // 1) Disallowed extensions even when file exists
    const svgFile = path.join(tmpDir, 'xss.svg');
    const htmlFile = path.join(tmpDir, 'evil.html');
    const jsFile = path.join(tmpDir, 'payload.js');
    fs.writeFileSync(svgFile, '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    fs.writeFileSync(htmlFile, '<html><script>alert(1)</script></html>');
    fs.writeFileSync(jsFile, 'alert(1)');

    assert.equal(validateWallpaperMediaPath(svgFile).code, 'unsupported-extension');
    assert.equal(validateWallpaperMediaPath(htmlFile).code, 'unsupported-extension');
    assert.equal(validateWallpaperMediaPath(jsFile).code, 'unsupported-extension');

    // 2) UNC / extended / NT device paths / URL schemes
    for (const bad of [
      '\\\\evil-server\\share\\wall.png',
      '//evil-server/share/wall.png',
      '\\\\?\\C:\\temp\\wall.png',
      '\\\\.\\PhysicalDrive0.png',
      'C:\\temp\\CON.png',
      'C:\\temp\\NUL.jpg',
      'file:///C:/temp/wall.png',
      'https://example.com/wall.png',
      'javascript:alert(1).png',
      'C:\\temp\\bad\x00.png',
    ]) {
      const r = validateWallpaperMediaPath(bad);
      assert.equal(r.ok, false, `Must reject dangerous path: ${bad}`);
    }

    // 3) Sensitive system and credential directories
    for (const sensitive of [
      path.join(tmpDir, '.ssh', 'id_rsa.png'),
      path.join(tmpDir, '.aws', 'credentials.png'),
      path.join(tmpDir, '.gemini', 'config', 'secret.png'),
      path.join(tmpDir, '.config', 'gcloud', 'adc.png'),
      'C:\\Windows\\Web\\Wallpaper\\img0.jpg',
      '/etc/passwd.png',
      '/proc/self/environ.png',
    ]) {
      const r = validateWallpaperMediaPath(sensitive);
      assert.equal(r.ok, false, `Must block sensitive path: ${sensitive}`);
      assert.equal(r.code, 'blocked-sensitive-path', `Expected blocked-sensitive-path for ${sensitive}, got ${r.code}`);
    }

    // 4) Symlink / junction escape blocking
    const validPng = path.join(tmpDir, 'valid.png');
    fs.writeFileSync(validPng, makeValidPngBuffer());
    const sensitiveSubDir = path.join(tmpDir, '.gemini');
    fs.mkdirSync(sensitiveSubDir, { recursive: true });
    const secretPng = path.join(sensitiveSubDir, 'token.png');
    fs.writeFileSync(secretPng, makeValidPngBuffer());

    // Directory junction/symlink escaping into .gemini must be caught by realpathSync
    const escapeLinkDir = path.join(tmpDir, 'innocent-dir');
    fs.symlinkSync(sensitiveSubDir, escapeLinkDir, process.platform === 'win32' ? 'junction' : 'dir');
    const escapedCheck = validateWallpaperMediaPath(path.join(escapeLinkDir, 'token.png'));
    assert.equal(escapedCheck.ok, false, 'Directory symlink escaping into .gemini must be rejected');
    assert.equal(escapedCheck.code, 'blocked-sensitive-path');

    // File symlink (when OS permits creating file symlinks)
    const fileLink = path.join(tmpDir, 'link.png');
    let createdFileLink = false;
    try {
      fs.symlinkSync(validPng, fileLink, 'file');
      createdFileLink = true;
    } catch {}
    if (createdFileLink) {
      const linkCheck = validateWallpaperMediaPath(fileLink);
      assert.equal(linkCheck.ok, false);
      assert.equal(linkCheck.code, 'symlink-not-allowed');
    }

    // 5) Spoofed magic bytes (HTML/SVG renamed to .png, PNG renamed to .mp4, AVIF renamed to .mp4)
    const spoofPng = path.join(tmpDir, 'spoof.png');
    fs.writeFileSync(spoofPng, '<svg>not a png</svg>');
    assert.equal(validateWallpaperMediaPath(spoofPng).code, 'invalid-magic-bytes');

    const spoofMp4 = path.join(tmpDir, 'spoof.mp4');
    fs.writeFileSync(spoofMp4, makeValidPngBuffer());
    assert.equal(validateWallpaperMediaPath(spoofMp4).code, 'invalid-magic-bytes');

    const avifAsMp4 = path.join(tmpDir, 'avif-as-mp4.mp4');
    fs.writeFileSync(avifAsMp4, makeValidAvifBuffer());
    assert.equal(validateWallpaperMediaPath(avifAsMp4).code, 'invalid-magic-bytes');

    // 6) All 8 allowed real media types pass with accurate mime/mediaType
    const samples = [
      ['a.jpg', makeValidJpegBuffer(), 'image', 'image/jpeg'],
      ['b.jpeg', makeValidJpegBuffer(), 'image', 'image/jpeg'],
      ['c.png', makeValidPngBuffer(), 'image', 'image/png'],
      ['d.webp', makeValidWebpBuffer(), 'image', 'image/webp'],
      ['e.gif', makeValidGifBuffer(), 'image', 'image/gif'],
      ['f.avif', makeValidAvifBuffer(), 'image', 'image/avif'],
      ['g.mp4', makeValidMp4Buffer(), 'video', 'video/mp4'],
      ['h.webm', makeValidWebmBuffer(), 'video', 'video/webm'],
    ];
    for (const [name, buf, expectedType, expectedMime] of samples) {
      const p = path.join(tmpDir, name);
      fs.writeFileSync(p, buf);
      const res = validateWallpaperMediaPath(p);
      assert.equal(res.ok, true, `Expected valid ${name} to pass, got ${res.code}: ${res.error}`);
      assert.equal(res.mediaType, expectedType);
      assert.equal(res.mimeType, expectedMime);
    }

    assert.equal(verifyMediaMagicBytes('.png', Buffer.from('not-png'), 7), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ── 2. Config Persistence, Lazy 127.0.0.1 HTTP 206 Range Streaming & Security Headers ──

test('wallpaper-service: atomic config persistence, lazy 127.0.0.1 HTTP 206 Range streaming, token/CORS checks, and clean port release', async () => {
  const tmpDir = mkTempDir('prism-wp-http-');
  const cfgPath = path.join(tmpDir, WALLPAPER_CONFIG_FILENAME);
  const mp4Bytes = makeValidMp4Buffer(512);
  const mp4File = path.join(tmpDir, 'loop.mp4');
  fs.writeFileSync(mp4File, mp4Bytes);

  // Verify env override resolution
  const prevEnv = process.env.PRISM_WALLPAPER_CONFIG_PATH;
  process.env.PRISM_WALLPAPER_CONFIG_PATH = cfgPath;
  assert.equal(resolveWallpaperConfigPath(), path.resolve(cfgPath));
  if (prevEnv === undefined) delete process.env.PRISM_WALLPAPER_CONFIG_PATH;
  else process.env.PRISM_WALLPAPER_CONFIG_PATH = prevEnv;

  const svc = createWallpaperService({ configPath: cfgPath });
  try {
    // Initially disabled -> lazy server must NOT be started
    const initCfg = svc.getConfigSync();
    assert.equal(initCfg.version, 1);
    assert.equal(initCfg.enabled, false);
    assert.equal(initCfg.serverRunning, false);
    assert.equal(initCfg.mediaUrl, '');
    assert.equal(svc.isEnabledSync(), false);

    // Save config with out-of-range sliders -> clamped atomically + starts 127.0.0.1:0 server
    const saved = await svc.handleAction('save-config', {
      enabled: true,
      mediaPath: mp4File,
      opacity: 9.9,
      blurPx: 99,
      dimOverlay: -2,
      fit: 'contain',
      pauseOnBlur: false,
    });
    assert.equal(saved.ok, true);
    assert.equal(saved.serverRunning, true);
    assert.equal(svc.isEnabledSync(), true);
    assert.equal(saved.config.opacity, 0.85);
    assert.equal(saved.config.blurPx, 24);
    assert.equal(saved.config.dimOverlay, 0);
    assert.equal(saved.config.fit, 'contain');
    assert.equal(saved.config.pauseOnBlur, false);
    assert.equal(saved.config.mediaType, 'video');
    assert.match(saved.config.mediaUrl, /^http:\/\/127\.0\.0\.1:\d+\/wallpaper\/[a-f0-9]{64}\/\d+$/);

    // Zero stray .tmp files after atomic write
    const filesInDir = fs.readdirSync(tmpDir);
    assert.equal(filesInDir.some((f) => f.endsWith('.tmp')), false);
    const persisted = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    assert.equal(persisted.enabled, true);
    assert.equal(persisted.fit, 'contain');

    const mediaUrl = saved.config.mediaUrl;
    const parsedUrl = new URL(mediaUrl);

    // Full GET -> 200 + strict security headers (NO ACAO: *)
    const fullRes = await httpRequestRaw(mediaUrl);
    assert.equal(fullRes.statusCode, 200);
    assert.equal(fullRes.headers['content-type'], 'video/mp4');
    assert.match(String(fullRes.headers['cache-control']), /no-store/);
    assert.equal(fullRes.headers['x-content-type-options'], 'nosniff');
    assert.equal(fullRes.headers['accept-ranges'], 'bytes');
    assert.equal(fullRes.headers['access-control-allow-origin'], undefined);
    assert.deepEqual(fullRes.body, mp4Bytes);

    // Allowed local origin -> reflected explicitly (never *)
    const localOriginRes = await httpRequestRaw(mediaUrl, {
      method: 'HEAD',
      headers: { Origin: 'vscode-file://vscode-app' },
    });
    assert.equal(localOriginRes.statusCode, 200);
    assert.equal(localOriginRes.headers['access-control-allow-origin'], 'vscode-file://vscode-app');
    assert.notEqual(localOriginRes.headers['access-control-allow-origin'], '*');
    assert.equal(localOriginRes.body.length, 0);

    // Untrusted third-party Origin -> 403 Forbidden
    const evilOriginRes = await httpRequestRaw(mediaUrl, {
      headers: { Origin: 'https://evil.example.com' },
    });
    assert.equal(evilOriginRes.statusCode, 403);
    assert.equal(evilOriginRes.headers['access-control-allow-origin'], undefined);

    // HTTP 206 Range streaming (start-end, suffix, and invalid 416)
    const rangeRes = await httpRequestRaw(mediaUrl, { headers: { Range: 'bytes=10-49' } });
    assert.equal(rangeRes.statusCode, 206);
    assert.equal(rangeRes.headers['content-range'], `bytes 10-49/${mp4Bytes.length}`);
    assert.equal(Number(rangeRes.headers['content-length']), 40);
    assert.deepEqual(rangeRes.body, mp4Bytes.subarray(10, 50));

    const suffixRes = await httpRequestRaw(mediaUrl, { headers: { Range: 'bytes=-16' } });
    assert.equal(suffixRes.statusCode, 206);
    assert.equal(suffixRes.headers['content-range'], `bytes ${mp4Bytes.length - 16}-${mp4Bytes.length - 1}/${mp4Bytes.length}`);
    assert.deepEqual(suffixRes.body, mp4Bytes.subarray(mp4Bytes.length - 16));

    const badRangeRes = await httpRequestRaw(mediaUrl, { headers: { Range: 'bytes=999999-' } });
    assert.equal(badRangeRes.statusCode, 416);

    // Wrong token -> 403, wrong rev -> 403, wrong path -> 404, POST -> 405
    const wrongTokUrl = `http://127.0.0.1:${parsedUrl.port}/wallpaper/${'0'.repeat(64)}/1`;
    assert.equal((await httpRequestRaw(wrongTokUrl)).statusCode, 403);
    const wrongRevUrl = mediaUrl.replace(/\/\d+$/, '/999');
    assert.equal((await httpRequestRaw(wrongRevUrl)).statusCode, 403);
    assert.equal((await httpRequestRaw(`http://127.0.0.1:${parsedUrl.port}/other/path`)).statusCode, 404);
    assert.equal((await httpRequestRaw(`http://127.0.0.1:${parsedUrl.port}/wallpaper/../etc/passwd`)).statusCode, 404);
    assert.equal((await httpRequestRaw(mediaUrl, { method: 'POST' })).statusCode, 405);

    // Disabling immediately closes server & frees port
    const disabledRes = await svc.handleAction('save-config', { enabled: false });
    assert.equal(disabledRes.ok, true);
    assert.equal(disabledRes.serverRunning, false);
    await assert.rejects(() => httpRequestRaw(mediaUrl), /ECONNREFUSED|ECONNRESET|socket hang up/i);

    // Re-enable then dispose() releases port
    const reEnabled = await svc.handleAction('save-config', { enabled: true });
    assert.equal(reEnabled.serverRunning, true);
    const secondUrl = reEnabled.config.mediaUrl;
    await svc.dispose();
    await assert.rejects(() => httpRequestRaw(secondUrl), /ECONNREFUSED|ECONNRESET|socket hang up/i);
  } finally {
    await svc.dispose();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ── 3. Blob Fallback Size Cap & Native Picker Parameterization ──────────────

test('wallpaper-service: get-media-blob supports <= 8 MB images, rejects > 8 MB images & videos, and pick-media uses safe parameterized execFile', async () => {
  const tmpDir = mkTempDir('prism-wp-blob-');
  const cfgPath = path.join(tmpDir, WALLPAPER_CONFIG_FILENAME);
  const smallPng = path.join(tmpDir, 'small.png');
  const hugePng = path.join(tmpDir, 'huge.png');
  const vidMp4 = path.join(tmpDir, 'clip.mp4');
  const badSvg = path.join(tmpDir, 'bad.svg');

  const smallBuf = makeValidPngBuffer(64);
  fs.writeFileSync(smallPng, smallBuf);
  fs.writeFileSync(hugePng, Buffer.concat([makeValidPngBuffer(0), Buffer.alloc(MAX_BLOB_FALLBACK_BYTES + 1024, 0x00)]));
  fs.writeFileSync(vidMp4, makeValidMp4Buffer(64));
  fs.writeFileSync(badSvg, '<svg/>');

  // Static security audit: zero shell execution in wallpaper-service.mjs
  const svcSource = fs.readFileSync(path.join(ROOT, 'vendor', 'wallpaper', 'wallpaper-service.mjs'), 'utf8');
  assert.equal(/(?<![.\w])execSync\s*\(|(?<![.\w])exec\s*\(|shell\s*:\s*true/.test(svcSource), false, 'Must never spawn a shell');
  assert.equal(/import\s*\{[^}]*\b(?:exec|execSync)\b[^}]*\}\s*from\s*['"]node:child_process['"]/.test(svcSource), false, 'Must only import execFile');

  const svc = createWallpaperService({ configPath: cfgPath });
  try {
    // <= 8 MB static image succeeds
    await svc.handleAction('save-config', { enabled: true, mediaPath: smallPng });
    const blobOk = await svc.handleAction('get-media-blob');
    assert.equal(blobOk.ok, true);
    assert.equal(blobOk.mimeType, 'image/png');
    assert.equal(blobOk.size, smallBuf.length);
    assert.deepEqual(Buffer.from(blobOk.base64, 'base64'), smallBuf);

    // > 8 MB static image rejected by cap
    await svc.handleAction('save-config', { enabled: true, mediaPath: hugePng });
    const blobTooBig = await svc.handleAction('get-media-blob');
    assert.equal(blobTooBig.ok, false);
    assert.equal(blobTooBig.code, 'blob-size-limit-exceeded');

    // Video rejected by Blob fallback (must use local stream)
    await svc.handleAction('save-config', { enabled: true, mediaPath: vidMp4 });
    const blobVid = await svc.handleAction('get-media-blob');
    assert.equal(blobVid.ok, false);
    assert.equal(blobVid.code, 'blob-image-only');

    // Clear media disables and empties config
    const cleared = await svc.handleAction('clear-media');
    assert.equal(cleared.ok, true);
    assert.equal(cleared.config.enabled, false);
    assert.equal(cleared.config.mediaPath, '');
    assert.equal(cleared.serverRunning, false);
  } finally {
    await svc.dispose();
  }

  // Native picker: Windows parameterized powershell.exe -EncodedCommand
  const winCalls = [];
  const winSvc = createWallpaperService({
    configPath: path.join(tmpDir, 'win.json'),
    platform: 'win32',
    execFileImpl(file, args, opts, cb) {
      winCalls.push({ file, args, opts });
      cb(null, `${smallPng}\r\n`, '');
    },
  });
  try {
    const picked = await winSvc.handleAction('pick-media');
    assert.equal(picked.ok, true);
    assert.equal(picked.config.enabled, true);
    assert.equal(picked.mediaType, 'image');
    assert.equal(winCalls.length, 1);
    assert.equal(winCalls[0].file, 'powershell.exe');
    assert.ok(winCalls[0].args.includes('-EncodedCommand'));
    assert.ok(winCalls[0].args.includes('-STA'));
  } finally {
    await winSvc.dispose();
  }

  // Native picker: Windows selecting disallowed .svg gets blocked by post-pick validation
  const winSvgSvc = createWallpaperService({
    configPath: path.join(tmpDir, 'winsvg.json'),
    platform: 'win32',
    execFileImpl(_file, _args, _opts, cb) {
      cb(null, badSvg, '');
    },
  });
  try {
    const pickedBad = await winSvgSvc.handleAction('pick-media');
    assert.equal(pickedBad.ok, false);
    assert.equal(pickedBad.code, 'unsupported-extension');
  } finally {
    await winSvgSvc.dispose();
  }

  // Native picker: macOS osascript cancel handling (-128)
  const macCalls = [];
  const macSvc = createWallpaperService({
    configPath: path.join(tmpDir, 'mac.json'),
    platform: 'darwin',
    execFileImpl(file, args, opts, cb) {
      macCalls.push({ file, args, opts });
      const err = new Error('User canceled (-128)');
      cb(err, '', 'execution error: User canceled. (-128)');
    },
  });
  try {
    const macRes = await macSvc.handleAction('pick-media');
    assert.equal(macRes.ok, true);
    assert.equal(macRes.canceled, true);
    assert.equal(macCalls[0].file, 'osascript');
  } finally {
    await macSvc.dispose();
  }

  // Native picker: Linux returns manual-input-required
  const linuxSvc = createWallpaperService({
    configPath: path.join(tmpDir, 'linux.json'),
    platform: 'linux',
  });
  try {
    const linuxRes = await linuxSvc.handleAction('pick-media');
    assert.equal(linuxRes.ok, false);
    assert.equal(linuxRes.manualRequired, true);
    assert.equal(linuxRes.code, 'manual-input-required');
  } finally {
    await linuxSvc.dispose();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ── 4. Frontend Client Engine: Zero innerHTML, Browser Hole, 0fps Sleep, CSP Fallback & destroy() ──

test('wallpaper-client.js: 0 innerHTML, 0 :has(), balanced CSS, Browser Hole avoidance, 0fps video sleep, CSP Blob fallback, and full destroy()', async () => {
  const clientSrc = fs.readFileSync(path.join(ROOT, 'vendor', 'wallpaper', 'wallpaper-client.js'), 'utf8');
  assert.equal(/\.innerHTML\s*=/.test(clientSrc), false, 'wallpaper-client.js must have 0 innerHTML assignments');
  assert.equal(wallpaperClientMod.WALLPAPER_CSS.includes(':has('), false, 'WALLPAPER_CSS must contain 0 :has()');
  assert.equal(checkBalancedBraces(wallpaperClientMod.WALLPAPER_CSS), true, 'WALLPAPER_CSS must have balanced braces');

  const env = createDomSandbox();
  const hostChild = env.makeNode('div', { class: 'agy-shell' });
  env.body.appendChild(hostChild);

  let blobCalls = 0;
  const smallPngB64 = makeValidPngBuffer(16).toString('base64');
  env.sandbox.__agPrismWallpaperCall = (rawJson) => {
    const req = JSON.parse(rawJson);
    if (req.action === 'get-media-blob') {
      blobCalls += 1;
      setTimeout(() => {
        env.sandbox.__agPrismWallpaperResolve(req.id, {
          ok: true,
          mimeType: 'image/png',
          size: 24,
          base64: smallPngB64,
          rev: req.payload?.rev || 1,
        });
      }, 0);
    }
  };

  const client = wallpaperClientMod.createWallpaperClient({ window: env.sandbox, document: env.doc });

  // Disabled state -> zero wallpaper root, zero html[data-ag-prism-wallpaper]
  assert.equal(env.doc.getElementById('ag-prism-wallpaper-root'), null);
  assert.equal(env.html.getAttribute('data-ag-prism-wallpaper'), null);

  // 1) Activate video wallpaper -> inserted beneath host content with 5+1 anti-translation attrs
  client.applyConfig({
    enabled: true,
    mediaPath: 'C:/wall/demo.mp4',
    mediaType: 'video',
    mediaUrl: 'http://127.0.0.1:45555/wallpaper/abc/1',
    opacity: 0.4,
    blurPx: 6,
    dimOverlay: 0.5,
    fit: 'cover',
    pauseOnBlur: true,
    rev: 1,
    serverRunning: true,
  });

  const wpRoot = env.doc.getElementById('ag-prism-wallpaper-root');
  assert.ok(wpRoot, 'Wallpaper root must be mounted when enabled');
  assert.equal(env.body.children[0], wpRoot, 'Wallpaper root must be first child at bottom of document.body');
  assert.equal(env.html.getAttribute('data-ag-prism-wallpaper'), 'on');
  for (const [k, v] of NO_TR_ATTRS) {
    assert.equal(wpRoot.getAttribute(k), v, `#ag-prism-wallpaper-root must stamp ${k}="${v}"`);
  }

  const videoEl = wpRoot.querySelector('video');
  assert.ok(videoEl, 'Must render <video> for video wallpaper');
  assert.equal(videoEl.muted, true);
  assert.equal(videoEl.loop, true);
  assert.equal(videoEl.playsInline, true);
  assert.equal(videoEl.getAttribute('preload'), 'metadata');
  assert.equal(videoEl.paused, false, 'Video should play while visible/focused/home/motion-on');

  // 2) 0fps sleep triggers: document.hidden, win-blur, chat mode, motion=off, browser hole
  env.doc.hidden = true;
  env.doc.dispatchEvent('visibilitychange');
  assert.equal(videoEl.paused, true, 'Video must pause on document.hidden');
  env.doc.hidden = false;
  env.doc.dispatchEvent('visibilitychange');
  assert.equal(videoEl.paused, false, 'Video must resume when document becomes visible');

  env.html.setAttribute('data-ag-cs-win-blur', '1');
  assert.equal(videoEl.paused, true, 'Video must pause on html[data-ag-cs-win-blur="1"]');
  env.html.removeAttribute('data-ag-cs-win-blur');
  assert.equal(videoEl.paused, false, 'Video must resume when win-blur clears');

  env.html.setAttribute('data-ag-prism-mode', 'chat');
  assert.equal(videoEl.paused, true, 'Video must pause in chat mode');
  env.html.setAttribute('data-ag-prism-mode', 'home');
  assert.equal(videoEl.paused, false, 'Video must resume leaving chat mode');

  env.html.setAttribute('data-ag-cs-motion', 'off');
  assert.equal(videoEl.paused, true, 'Video must pause on motion=off');
  env.html.setAttribute('data-ag-cs-motion', 'ultra');
  assert.equal(videoEl.paused, false, 'Video must resume when motion re-enabled');

  // 3) Browser Hole avoidance (main + drawer)
  env.body.setAttribute('data-has-browser-hole', 'true');
  assert.equal(wpRoot.hidden, true);
  assert.equal(env.html.getAttribute('data-ag-prism-wallpaper-hole'), '1');
  assert.equal(videoEl.paused, true, 'Video must pause during browser hole');
  env.body.removeAttribute('data-has-browser-hole');
  assert.equal(wpRoot.hidden, false);
  assert.equal(videoEl.paused, false);

  env.body.setAttribute('data-has-drawer-browser-hole', 'true');
  assert.equal(wpRoot.hidden, true);
  assert.equal(videoEl.paused, true);
  env.body.removeAttribute('data-has-drawer-browser-hole');
  assert.equal(wpRoot.hidden, false);

  // 4) Switch to static image -> old video must be properly released (pause -> removeAttribute('src') -> load)
  const prevVideoOps = videoEl._ops;
  client.applyConfig({
    enabled: true,
    mediaPath: 'C:/wall/photo.png',
    mediaType: 'image',
    mediaUrl: 'http://127.0.0.1:45555/wallpaper/def/2',
    rev: 2,
    serverRunning: true,
  });
  const pauseIdx = prevVideoOps.lastIndexOf('pause');
  const rmSrcIdx = prevVideoOps.lastIndexOf('removeAttribute:src');
  const loadIdx = prevVideoOps.lastIndexOf('load');
  assert.ok(pauseIdx >= 0 && rmSrcIdx > pauseIdx && loadIdx > rmSrcIdx, 'Video teardown must call pause -> removeAttribute(src) -> load');

  // 5) CSP <img> onerror triggers single get-media-blob -> Blob ObjectURL fallback
  const imgEl = wpRoot.querySelector('img');
  assert.ok(imgEl, 'Must render <img> for image wallpaper');
  imgEl.dispatchEvent('error');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(blobCalls, 1);
  assert.equal(env.createdUrls.length, 1);
  assert.equal(imgEl.src, env.createdUrls[0].url);
  assert.equal(client.getState().renderMode, 'blob-fallback');

  // 6) destroy() revokes ObjectURL, removes DOM + <style> + html attr + CSS vars + listeners
  client.destroy();
  assert.deepEqual(env.revokedUrls, [env.createdUrls[0].url], 'destroy() must revoke active ObjectURL');
  assert.equal(env.doc.getElementById('ag-prism-wallpaper-root'), null);
  assert.equal(env.doc.getElementById('ag-prism-wallpaper-css'), null);
  assert.equal(env.html.getAttribute('data-ag-prism-wallpaper'), null);
  assert.equal(env.html.style.getPropertyValue('--ag-prism-wp-opacity'), '');
  assert.equal(client.getDebugState().destroyed, true);
  assert.equal(env.observers.every((o) => !o.active), true, 'All MutationObservers must disconnect on destroy()');
  assert.equal(env.docListeners.get('visibilitychange')?.size || 0, 0);
  assert.equal(env.winListeners.get('blur')?.size || 0, 0);
  assert.equal(env.winListeners.get('focus')?.size || 0, 0);
});

// ── 5. Five-Locale Settings UI & settings-panel.js Minimal Slot Integration ──

test('wallpaper-settings-ui.js: 0 innerHTML, 8 locales + yue migration, 5+1 anti-translation, and settings-panel.js appearance slot wiring', async () => {
  const uiSrc = fs.readFileSync(path.join(ROOT, 'vendor', 'wallpaper', 'wallpaper-settings-ui.js'), 'utf8');
  assert.equal(/\.innerHTML\s*=/.test(uiSrc), false, 'wallpaper-settings-ui.js must have 0 innerHTML assignments');

  // Verify 8 locale packs exist, mark Beta explicitly, and have distinct titles
  const locales = ['zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'es', 'fr', 'de'];
  const titles = new Set();
  for (const loc of locales) {
    const pack = wallpaperSettingsUiMod.WALLPAPER_I18N[loc];
    assert.ok(pack, `Locale pack ${loc} must exist`);
    assert.ok(pack.title && pack.pickBtn && pack.opacityLabel && pack.errUnsupportedExt);
    assert.ok(pack.title.includes('(Beta)'), `Locale ${loc} wallpaper title must clearly show (Beta)`);
    assert.ok(/Beta/i.test(pack.desc), `Locale ${loc} wallpaper description must clearly mention Beta`);
    titles.add(pack.title);
  }
  assert.equal(titles.size, 8, 'All 8 locales must provide distinct localized titles');

  const env = createDomSandbox();
  const rpcLog = [];
  env.sandbox.__agPrismWallpaperCall = (raw) => {
    const req = JSON.parse(raw);
    rpcLog.push(req);
    const resp =
      req.action === 'pick-media'
        ? { ok: false, manualRequired: true, code: 'manual-input-required' }
        : req.action === 'clear-media'
        ? { ok: true, config: { ...DEFAULT_WALLPAPER_CONFIG, enabled: false, mediaPath: '' } }
        : {
            ok: true,
            config: {
              ...DEFAULT_WALLPAPER_CONFIG,
              ...req.payload,
              enabled: req.payload?.enabled ?? true,
              mediaPath: req.payload?.mediaPath ?? '/tmp/demo.png',
              mediaType: 'image',
              mediaUrl: 'http://127.0.0.1:41234/wallpaper/aa/1',
              rev: 1,
            },
          };
    setTimeout(() => env.sandbox.__agPrismWallpaperResolve(req.id, resp), 0);
  };

  const client = wallpaperClientMod.createWallpaperClient({ window: env.sandbox, document: env.doc });
  env.sandbox.__agPrismWallpaper = client;
  env.sandbox.__prismMountWallpaperUi = wallpaperSettingsUiMod.mountWallpaperUi;

  // Mount slot and test all 8 locales + yue->zh-CN migration + interactions
  const slot = env.makeNode('div', { 'data-testid': 'prism-wallpaper-slot' });
  env.body.appendChild(slot);
  const handle = wallpaperSettingsUiMod.mountWallpaperUi(slot, {
    window: env.sandbox,
    document: env.doc,
    lang: 'zh-CN',
  });
  assert.ok(handle && handle.root);
  for (const [k, v] of NO_TR_ATTRS) {
    assert.equal(handle.root.getAttribute(k), v, `Wallpaper settings card must stamp ${k}="${v}"`);
  }

  for (const loc of locales) {
    handle.updateLang(loc);
    assert.equal(handle.root.getAttribute('data-ag-cs-lang'), loc);
    assert.equal(handle.root.querySelector('.ag-prism-wp-title').textContent, wallpaperSettingsUiMod.WALLPAPER_I18N[loc].title);
  }
  handle.updateLang('yue');
  assert.equal(handle.root.getAttribute('data-ag-cs-lang'), 'zh-CN');
  assert.equal(handle.root.querySelector('.ag-prism-wp-title').textContent, wallpaperSettingsUiMod.WALLPAPER_I18N['zh-CN'].title);

  // Click pick button -> Linux manual input hint shown
  handle.updateLang('en');
  handle.root.querySelector('[data-testid="prism-wp-pick-btn"]').click();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(
    handle.root.querySelector('[data-testid="prism-wp-status"]').textContent,
    wallpaperSettingsUiMod.WALLPAPER_I18N.en.stManualLinux
  );

  // Slider preview + change persists via save-config
  const blurSlider = handle.root.querySelector('[data-testid="prism-wp-blur"]');
  blurSlider.value = '12';
  blurSlider.dispatchEvent('input');
  blurSlider.dispatchEvent('change');
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(rpcLog.some((r) => r.action === 'save-config' && r.payload.blurPx === 12));

  // Verify settings-panel.js mounts the slot inside Appearance group and invokes W.__prismMountWallpaperUi (including on lang switch)
  const dlg = env.makeNode('div', { role: 'dialog' });
  const panel = env.makeNode('div', { class: 'p-6 flex flex-col gap-4' });
  const h2 = env.makeNode('h2');
  h2.textContent = 'Appearance';
  const wrap = env.makeNode('div', { class: 'flex flex-col gap-8' });
  const anchorSec = env.makeNode('div', { class: 'space-y-2' });
  wrap.appendChild(anchorSec);
  panel.appendChild(h2);
  panel.appendChild(wrap);
  dlg.appendChild(panel);
  env.body.appendChild(dlg);

  let mountCalls = 0;
  let capturedSlot = null;
  let lastMountLang = '';
  let activeLang = 'en';
  globalThis.__prismMountWallpaperUi = (slotEl, ctx) => {
    mountCalls += 1;
    capturedSlot = slotEl;
    lastMountLang = ctx?.lang || '';
    return wallpaperSettingsUiMod.mountWallpaperUi(slotEl, { ...ctx, window: env.sandbox, document: env.doc });
  };
  try {
    const origDoc = globalThis.document;
    globalThis.document = env.doc;
    const mountPanel = () =>
      settingsPanelMod.mountOrSyncSettingsSection({
        version: '1.0.7-beta.3',
        lazyFold: false,
        getLang: () => activeLang,
        uiText: () => ({
          grpAppearance: 'Appearance',
          grpBeta: 'Beta Features',
          betaPlaceholderNotice: 'Note: This section contains experimental features that are off by default and may evolve across versions.',
          sectionTitle: 'Obsidian Prism',
        }),
        isZh: () => activeLang.startsWith('zh'),
        resolveSettingRowActiveValue: (k) => cdp.DEFAULT_CONFIG[k],
        isSettingButtonMatch: (_k, vj, cur) => vj === JSON.stringify(cur),
        saveSetting: () => {},
        saveSettingsBatch: () => {},
        formatSettingsSummary: () => 'Obsidian',
        getThoughtTranslateMode: () => 'off',
        runGuardedMut: (fn) => fn(),
      });
    try {
      mountPanel();
      assert.ok(mountCalls >= 1, 'settings-panel.js must invoke __prismMountWallpaperUi');
      assert.ok(capturedSlot, 'settings-panel.js must pass [data-testid="prism-wallpaper-slot"]');
      assert.equal(capturedSlot.getAttribute('data-testid'), 'prism-wallpaper-slot');
      assert.ok(capturedSlot.closest('[data-ag-cs-group="beta"]'), 'Wallpaper slot must live inside Beta group');
      assert.equal(capturedSlot.closest('[data-ag-cs-group="appearance"]'), null, 'Wallpaper slot must no longer live inside Appearance group');
      const betaNotice = env.doc.querySelector('[data-ag-cs-group="beta"] [data-testid="prism-beta-notice"]');
      assert.ok(betaNotice && /experimental/i.test(betaNotice.textContent), 'Beta group must render explicit experimental notice');
      assert.equal(lastMountLang, 'en');

      // Switch language en -> ja and verify wallpaper UI remounts/syncs with ja locale
      activeLang = 'ja';
      mountPanel();
      assert.equal(lastMountLang, 'ja');
      assert.equal(
        capturedSlot.querySelector('.ag-prism-wp-title').textContent,
        wallpaperSettingsUiMod.WALLPAPER_I18N.ja.title
      );
    } finally {
      globalThis.document = origDoc;
    }
  } finally {
    delete globalThis.__prismMountWallpaperUi;
    client.destroy();
  }
});

// ── 6. cdp.js Channel 7 Compilation, Isolation from RUNTIME_PARTS, Disk Cache & Removal ──

test('cdp.js Channel 7: WALLPAPER_BINDING, 0 in RUNTIME_PARTS, vm.Script parse, idempotent mount, disk cache hit, and full removal', () => {
  assert.equal(cdp.WALLPAPER_BINDING, '__agPrismWallpaperCall');
  assert.equal(
    cdp.RUNTIME_PARTS.some((p) => p.includes('wallpaper')),
    false,
    'vendor/wallpaper/* must NEVER enter Channel 1 RUNTIME_PARTS'
  );

  const expr = cdp.buildWallpaperExpression(cdp.DEFAULT_CONFIG);
  assert.ok(expr.length > 1000, 'Channel 7 expression must compile non-empty');
  assert.doesNotThrow(() => new vm.Script(expr));
  assert.doesNotThrow(() => new vm.Script(cdp.WALLPAPER_REMOVE_EXPRESSION));
  assert.doesNotThrow(() => new vm.Script(cdp.REMOVE_EXPRESSION));

  // Verify REMOVE_EXPRESSION cleans wallpaper artifacts
  for (const token of ['#ag-prism-wallpaper-root', '#ag-prism-wallpaper-css', 'data-ag-prism-wallpaper', '__agPrismWallpaper']) {
    assert.ok(cdp.REMOVE_EXPRESSION.includes(token), `REMOVE_EXPRESSION must clean ${token}`);
  }

  // Sandbox mount + idempotent reuse + WALLPAPER_REMOVE_EXPRESSION cleanup
  const env = createDomSandbox();
  const r1 = vm.runInNewContext(expr, env.sandbox);
  assert.equal(r1.ok, true);
  assert.equal(r1.status, 'mounted');
  assert.equal(typeof env.sandbox.__agPrismWallpaper, 'object');
  assert.equal(typeof env.sandbox.__prismMountWallpaperUi, 'function');
  assert.equal(typeof env.sandbox.__agPrismWallpaperResolve, 'function');
  assert.equal(typeof env.sandbox.__agPrismWallpaperBridge?.resolve, 'function');

  const r2 = vm.runInNewContext(expr, env.sandbox);
  assert.equal(r2.ok, true);
  assert.equal(r2.reused, true);

  // Verify minified Channel 7 __prismMountWallpaperUi renders cleanly across locales
  const packedSlot = env.makeNode('div', { 'data-testid': 'prism-wallpaper-slot' });
  env.body.appendChild(packedSlot);
  const packedUiHandle = env.sandbox.__prismMountWallpaperUi(packedSlot, { lang: 'zh-CN' });
  assert.ok(packedUiHandle && packedUiHandle.root);
  assert.equal(packedSlot.querySelector('.ag-prism-wp-title').textContent, wallpaperSettingsUiMod.WALLPAPER_I18N['zh-CN'].title);
  packedUiHandle.updateLang('ja');
  assert.equal(packedSlot.querySelector('.ag-prism-wp-title').textContent, wallpaperSettingsUiMod.WALLPAPER_I18N.ja.title);

  // Activate a video then run WALLPAPER_REMOVE_EXPRESSION
  env.sandbox.__agPrismWallpaper.applyConfig({
    enabled: true,
    mediaPath: 'C:/wall/v.mp4',
    mediaType: 'video',
    mediaUrl: 'http://127.0.0.1:49999/wallpaper/aa/1',
    rev: 1,
    serverRunning: true,
  });
  const vid = env.doc.querySelector('#ag-prism-wallpaper-root video');
  assert.ok(vid);

  const rmRes = vm.runInNewContext(cdp.WALLPAPER_REMOVE_EXPRESSION, env.sandbox);
  assert.equal(rmRes.ok, true);
  assert.equal(vid._pauseCalls >= 1, true);
  assert.equal(vid._loadCalls >= 1, true);
  assert.equal(env.doc.getElementById('ag-prism-wallpaper-root'), null);
  assert.equal(env.doc.getElementById('ag-prism-wallpaper-css'), null);
  assert.equal(env.html.getAttribute('data-ag-prism-wallpaper'), null);
  assert.equal(env.sandbox.__agPrismWallpaper, undefined);
  assert.equal(env.sandbox.__prismMountWallpaperUi, undefined);

  // Disk cache round-trip in isolated tmp dir (zero repo .bundle-cache.json leftover)
  const cacheDir = mkTempDir('prism-wp-cache-');
  const cachePath = path.join(cacheDir, '.bundle-cache.json');
  try {
    cdp.resetBundleCacheStats();
    const cold = cdp.buildWallpaperExpression(cdp.DEFAULT_CONFIG, { cachePath });
    assert.equal(fs.existsSync(cachePath), true);
    const cacheJson = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    assert.ok(cacheJson.channels && cacheJson.channels.wallpaper, 'Wallpaper channel must be stored in disk cache');

    // Clear in-memory cache via fresh require and verify disk cache hit
    const resolvedCdp = require.resolve(path.join(ROOT, 'cdp.js'));
    delete require.cache[resolvedCdp];
    const freshCdp = require(resolvedCdp);
    const hit = freshCdp.buildWallpaperExpression(freshCdp.DEFAULT_CONFIG, { cachePath });
    assert.equal(hit, cold, 'Disk cache hit must be byte-identical to cold compile');
    assert.equal(freshCdp.getBundleCacheStats().channelHitsByName.wallpaper, 1);
  } finally {
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }
});

// ── 7. Red-Team Regressions (#229 Security + #230 Perf/Compat) ─────────────

test('red-team #229 [P0-1, P1-1, P2-1, P2-3]: NTFS 8.3 short paths, AppData/Local/Antigravity, ReDoS-free strip, malformed ftyp boxSize, DereferenceLinks', () => {
  const tmpDir = mkTempDir('prism-wp-rt-p01-');
  try {
    // 1) /appdata/local/antigravity must be blocked
    const localAgy = path.join(tmpDir, 'AppData', 'Local', 'Antigravity', 'cache.png');
    const localRes = validateWallpaperMediaPath(localAgy);
    assert.equal(localRes.ok, false);
    assert.equal(localRes.code, 'blocked-sensitive-path');

    // 2) Unexpanded Windows 8.3 short segment (e.g. 1PASSW~1 directory) must fail-closed on Windows
    const shortDir = path.join(tmpDir, '1PASSW~1');
    fs.mkdirSync(shortDir, { recursive: true });
    const shortPng = path.join(shortDir, 'secret.png');
    fs.writeFileSync(shortPng, makeValidPngBuffer());
    const shortRes = validateWallpaperMediaPath(shortPng);
    if (process.platform === 'win32') {
      assert.equal(shortRes.ok, false, 'Windows 8.3 short segment must fail-closed');
      assert.equal(shortRes.code, 'blocked-sensitive-path');

      // Real NTFS 8.3 short alias C:\PROGRA~3 expands via realpathSync.native to C:\ProgramData
      if (fs.existsSync('C:\\PROGRA~3')) {
        const progDataRes = validateWallpaperMediaPath('C:\\PROGRA~3\\fake-not-used.png');
        // Either blocked before/after resolution or ENOENT; verify any existing file under PROGRA~3 would be blocked
        assert.equal(progDataRes.ok, false);
      }
    }

    // 3) ReDoS hygiene: zero polynomial /.replace(\/\/+\$/, '')/ in wallpaper-service.mjs + fast linear handling of 40k trailing slashes
    const svcSrc = fs.readFileSync(path.join(ROOT, 'vendor', 'wallpaper', 'wallpaper-service.mjs'), 'utf8');
    assert.equal(svcSrc.includes(".replace(/\\/+$/, '')"), false, 'Must not contain polynomial trailing-slash regex');
    assert.equal(svcSrc.includes('$dlg.DereferenceLinks = $true'), true, 'Windows OpenFileDialog must set DereferenceLinks = $true');

    const t0 = Date.now();
    const slashDir = 'C:/safe-dir' + '/'.repeat(40000);
    const slashPng = path.join(tmpDir, 'ok.png');
    fs.writeFileSync(slashPng, makeValidPngBuffer());
    const slashRes = validateWallpaperMediaPath(slashPng, { extraBlockedDirs: [slashDir] });
    const elapsedMs = Date.now() - t0;
    assert.equal(slashRes.ok, true);
    assert.ok(elapsedMs < 500, `Trailing slash normalization must be linear, took ${elapsedMs}ms`);

    // 4) Malformed ftyp boxSize (1 or 2..15) must reject even if trailing payload contains valid brand words like 'dash'/'isom'/'avif'
    for (const badSize of [1, 2, 8, 12, 15]) {
      const crafted = Buffer.alloc(32, 0);
      crafted.writeUInt32BE(badSize, 0);
      crafted.write('ftyp', 4, 'ascii');
      crafted.write('xxxx', 8, 'ascii');
      crafted.write('dash', 16, 'ascii');
      crafted.write('isom', 20, 'ascii');
      crafted.write('avif', 24, 'ascii');
      assert.equal(verifyMediaMagicBytes('.mp4', crafted, crafted.length), false, `Must reject .mp4 with boxSize=${badSize}`);
      assert.equal(verifyMediaMagicBytes('.avif', crafted, crafted.length), false, `Must reject .avif with boxSize=${badSize}`);
    }
    // Valid boxSize=16 (minimal ftyp box with major brand only) and boxSize=0 still pass
    const minValidMp4 = Buffer.alloc(16, 0);
    minValidMp4.writeUInt32BE(16, 0);
    minValidMp4.write('ftyp', 4, 'ascii');
    minValidMp4.write('isom', 8, 'ascii');
    assert.equal(verifyMediaMagicBytes('.mp4', minValidMp4, minValidMp4.length), true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('red-team #229 [P0-2, P2-1]: handleHttpRequest prevents read-time TOCTOU (magic spoof, size DoS, parent junction swap), adds sandbox CSP, leaks 0 fds', async () => {
  const tmpDir = mkTempDir('prism-wp-rt-p02-');
  const cfgPath = path.join(tmpDir, WALLPAPER_CONFIG_FILENAME);
  const subDir = path.join(tmpDir, 'media-box');
  const sensitiveDir = path.join(tmpDir, '.gemini');
  fs.mkdirSync(subDir, { recursive: true });
  fs.mkdirSync(sensitiveDir, { recursive: true });

  const mediaFile = path.join(subDir, 'wall.png');
  const validPng = makeValidPngBuffer(64);
  fs.writeFileSync(mediaFile, validPng);
  fs.writeFileSync(path.join(sensitiveDir, 'wall.png'), makeValidPngBuffer(32));

  const svc = createWallpaperService({ configPath: cfgPath, maxImageBytes: 512 });
  try {
    const saved = await svc.handleAction('save-config', { enabled: true, mediaPath: mediaFile });
    assert.equal(saved.ok, true);
    const url = saved.config.mediaUrl;

    // 1) Normal GET & HEAD carry sandbox CSP header
    const okRes = await httpRequestRaw(url);
    assert.equal(okRes.statusCode, 200);
    assert.equal(okRes.headers['content-security-policy'], "default-src 'none'; sandbox");
    assert.deepEqual(okRes.body, validPng);

    const headRes = await httpRequestRaw(url, { method: 'HEAD' });
    assert.equal(headRes.statusCode, 200);
    assert.equal(headRes.headers['content-security-policy'], "default-src 'none'; sandbox");
    assert.equal(headRes.body.length, 0);

    // 2) TOCTOU in-place overwrite with sensitive non-media payload -> 403 Invalid media signature
    fs.writeFileSync(mediaFile, 'PRIVATE_KEY=super-secret-credential-token-12345');
    const spoofRes = await httpRequestRaw(url);
    assert.equal(spoofRes.statusCode, 403);
    assert.equal(spoofRes.body.toString('utf8').includes('super-secret'), false);

    // 3) TOCTOU size inflation beyond maxImageBytes -> 413 Payload Too Large
    fs.writeFileSync(mediaFile, makeValidPngBuffer(1024));
    const oversizeRes = await httpRequestRaw(url);
    assert.equal(oversizeRes.statusCode, 413);

    // 4) Restore valid file then swap parent directory with junction/symlink into .gemini -> 403 Invalid target
    fs.rmSync(subDir, { recursive: true, force: true });
    fs.symlinkSync(sensitiveDir, subDir, process.platform === 'win32' ? 'junction' : 'dir');
    const swapRes = await httpRequestRaw(url);
    assert.equal(swapRes.statusCode, 403, 'Parent directory junction swap to .gemini must be blocked at read time');

    // 5) Zero fd leak check: swap link & temp files can be removed immediately without EBUSY on Windows
    fs.rmSync(subDir, { recursive: true, force: true });
  } finally {
    await svc.dispose();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('red-team #229 [P0-3]: PRISM_WALLPAPER_CONFIG_PATH boundary enforcement, nlink>1 copyFileSync guard, and caught config-write-failed errors', async () => {
  const tmpDir = mkTempDir('prism-wp-rt-p03-');
  const defaultExpected = path.join(os.homedir(), '.gemini', 'config', WALLPAPER_CONFIG_FILENAME);
  const prevEnv = process.env.PRISM_WALLPAPER_CONFIG_PATH;
  try {
    // 1) Disallowed PRISM_WALLPAPER_CONFIG_PATH values must safely fall back to defaultPath
    const externalDir = path.join(os.homedir(), 'Documents');
    const symEscapeDir = path.join(tmpDir, 'sym-escape');
    const outsideTargetDir = path.join(tmpDir, 'real-target');
    fs.mkdirSync(outsideTargetDir, { recursive: true });
    fs.symlinkSync(outsideTargetDir, symEscapeDir, process.platform === 'win32' ? 'junction' : 'dir');

    const dangerousEnvPaths = [
      path.join(os.homedir(), '.gitconfig'),
      path.join(ROOT, 'package.json'),
      path.join(os.homedir(), '.gemini', 'config', 'settings.json'),
      path.join(externalDir, WALLPAPER_CONFIG_FILENAME),
      '\\\\evil-host\\share\\' + WALLPAPER_CONFIG_FILENAME,
      '\\\\?\\C:\\temp\\' + WALLPAPER_CONFIG_FILENAME,
      path.join(tmpDir, 'CON', WALLPAPER_CONFIG_FILENAME),
      path.join(os.homedir(), '.gemini', 'conversations_archive', WALLPAPER_CONFIG_FILENAME),
      path.join(os.homedir(), '.gemini', 'prism-knowledge-space', WALLPAPER_CONFIG_FILENAME),
      path.join(os.homedir(), '.gemini', 'antigravity-spark', WALLPAPER_CONFIG_FILENAME),
      path.join(tmpDir, '.ssh', WALLPAPER_CONFIG_FILENAME),
      path.join(symEscapeDir, WALLPAPER_CONFIG_FILENAME),
    ];
    for (const badEnv of dangerousEnvPaths) {
      process.env.PRISM_WALLPAPER_CONFIG_PATH = badEnv;
      assert.equal(
        resolveWallpaperConfigPath(),
        defaultExpected,
        `Dangerous PRISM_WALLPAPER_CONFIG_PATH must fall back to default: ${badEnv}`
      );
    }

    // Valid overrides inside ~/.gemini or os.tmpdir() with exact filename are accepted
    const validTmpCfg = path.join(tmpDir, 'nested-ok', WALLPAPER_CONFIG_FILENAME);
    process.env.PRISM_WALLPAPER_CONFIG_PATH = validTmpCfg;
    assert.equal(resolveWallpaperConfigPath(), path.resolve(validTmpCfg));

    const validGeminiCfg = path.join(os.homedir(), '.gemini', 'config', WALLPAPER_CONFIG_FILENAME);
    process.env.PRISM_WALLPAPER_CONFIG_PATH = validGeminiCfg;
    assert.equal(resolveWallpaperConfigPath(), path.resolve(validGeminiCfg));

    // 2) copyFileSync fallback refuses hardlinked target (nlink > 1) and preserves original file
    const originalFile = path.join(tmpDir, 'precious-original.txt');
    const hardlinkCfg = path.join(tmpDir, WALLPAPER_CONFIG_FILENAME);
    fs.writeFileSync(originalFile, 'ORIGINAL_UNTOUCHED_CONTENT');
    let hardlinkCreated = false;
    try {
      fs.linkSync(originalFile, hardlinkCfg);
      hardlinkCreated = true;
    } catch {}
    if (hardlinkCreated && process.platform === 'win32') {
      const busyFs = {
        ...fs,
        renameSync() {
          const e = new Error('EBUSY simulated');
          e.code = 'EBUSY';
          throw e;
        },
      };
      assert.throws(
        () => writeConfigFileAtomicSync(hardlinkCfg, { ...DEFAULT_WALLPAPER_CONFIG, enabled: true }, busyFs),
        /hardlinked|nlink/i
      );
      assert.equal(fs.readFileSync(originalFile, 'utf8'), 'ORIGINAL_UNTOUCHED_CONTENT');
    }

    // 3) savePatch & clear-media catch write errors and return { ok: false, code: 'config-write-failed' }
    const unwritableCfgPath = path.join(tmpDir, 'dir-collision', WALLPAPER_CONFIG_FILENAME);
    fs.mkdirSync(unwritableCfgPath, { recursive: true }); // directory occupies target file path
    const errSvc = createWallpaperService({ configPath: unwritableCfgPath });
    try {
      const saveFail = await errSvc.handleAction('save-config', { opacity: 0.5 });
      assert.equal(saveFail.ok, false);
      assert.equal(saveFail.code, 'config-write-failed');

      const clearFail = await errSvc.handleAction('clear-media');
      assert.equal(clearFail.ok, false);
      assert.equal(clearFail.code, 'config-write-failed');
    } finally {
      await errSvc.dispose();
    }
  } finally {
    if (prevEnv === undefined) delete process.env.PRISM_WALLPAPER_CONFIG_PATH;
    else process.env.PRISM_WALLPAPER_CONFIG_PATH = prevEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('red-team #229 [P1-3]: pick-media single-flight mutex, dispose() kills orphan picker child, and get-media-blob async single-flight with concurrency <= 1', async () => {
  const tmpDir = mkTempDir('prism-wp-rt-p13-');
  const pngA = path.join(tmpDir, 'a.png');
  const pngB = path.join(tmpDir, 'b.png');
  fs.writeFileSync(pngA, makeValidPngBuffer(48));
  fs.writeFileSync(pngB, makeValidPngBuffer(64));

  // Verify getMediaBlob no longer uses synchronous fs.readFileSync
  const svcSrc = fs.readFileSync(path.join(ROOT, 'vendor', 'wallpaper', 'wallpaper-service.mjs'), 'utf8');
  const blobFnIdx = svcSrc.indexOf('async function getMediaBlob');
  assert.ok(blobFnIdx > 0);
  assert.equal(svcSrc.slice(blobFnIdx).includes('readFileSync'), false, 'getMediaBlob must be fully async without readFileSync');

  try {
    // 1) Concurrent pick-media calls share single-flight promise (only 1 child spawned)
    let spawnCount = 0;
    let releasePicker = null;
    const sfSvc = createWallpaperService({
      configPath: path.join(tmpDir, 'sf-pick.json'),
      platform: 'win32',
      execFileImpl(_file, _args, _opts, cb) {
        spawnCount += 1;
        releasePicker = () => cb(null, `${pngA}\r\n`, '');
        return { killed: false, kill() { this.killed = true; } };
      },
    });
    try {
      const calls = [
        sfSvc.handleAction('pick-media'),
        sfSvc.handleAction('pick-media'),
        sfSvc.handleAction('pick-media'),
        sfSvc.handleAction('pick-media'),
      ];
      await new Promise((r) => setTimeout(r, 10));
      assert.equal(spawnCount, 1, 'Concurrent pick-media must spawn only 1 OS picker child');
      releasePicker();
      const results = await Promise.all(calls);
      for (const r of results) {
        assert.equal(r.ok, true);
        assert.equal(r.config.enabled, true);
      }
    } finally {
      await sfSvc.dispose();
    }

    // 2) dispose() immediately kills in-flight picker child
    let killCalls = 0;
    let pendingCb = null;
    const killSvc = createWallpaperService({
      configPath: path.join(tmpDir, 'kill-pick.json'),
      platform: 'win32',
      execFileImpl(_file, _args, _opts, cb) {
        pendingCb = cb;
        return {
          killed: false,
          kill() {
            killCalls += 1;
            this.killed = true;
            const err = new Error('SIGTERM');
            setTimeout(() => pendingCb(err, '', ''), 0);
          },
        };
      },
    });
    const inFlightPick = killSvc.handleAction('pick-media');
    await new Promise((r) => setTimeout(r, 10));
    await killSvc.dispose();
    assert.equal(killCalls, 1, 'dispose() must kill active picker child process');
    const killedRes = await inFlightPick;
    assert.equal(killedRes.ok, false);
    assert.equal(killedRes.code, 'service-disposed');

    // 3) get-media-blob: same-rev single-flight (1 open for 5 concurrent calls) + cross-rev concurrency <= 1
    let openCalls = 0;
    let activeOpens = 0;
    let peakConcurrentOpens = 0;
    const delayedFsPromises = {
      async open(p, flags) {
        openCalls += 1;
        activeOpens += 1;
        if (activeOpens > peakConcurrentOpens) peakConcurrentOpens = activeOpens;
        await new Promise((r) => setTimeout(r, 25));
        const realFh = await fs.promises.open(p, flags);
        return {
          stat: () => realFh.stat(),
          read: (...a) => realFh.read(...a),
          async close() {
            activeOpens -= 1;
            return realFh.close();
          },
        };
      },
    };

    const blobSvc = createWallpaperService({
      configPath: path.join(tmpDir, 'blob-sf.json'),
      fsPromises: delayedFsPromises,
    });
    try {
      await blobSvc.handleAction('save-config', { enabled: true, mediaPath: pngA });
      const sameRevResults = await Promise.all([
        blobSvc.handleAction('get-media-blob'),
        blobSvc.handleAction('get-media-blob'),
        blobSvc.handleAction('get-media-blob'),
        blobSvc.handleAction('get-media-blob'),
        blobSvc.handleAction('get-media-blob'),
      ]);
      assert.equal(openCalls, 1, 'Same-rev concurrent get-media-blob must share 1 single-flight read');
      assert.equal(peakConcurrentOpens, 1);
      for (const r of sameRevResults) {
        assert.equal(r.ok, true);
        assert.equal(r.mimeType, 'image/png');
      }

      // Cross-rev concurrent reads must serialize (peak concurrency strictly <= 1)
      const p1 = blobSvc.handleAction('get-media-blob');
      await blobSvc.handleAction('save-config', { enabled: true, mediaPath: pngB });
      const p2 = blobSvc.handleAction('get-media-blob');
      const [r1, r2] = await Promise.all([p1, p2]);
      assert.equal(r1.ok, true);
      assert.equal(r2.ok, true);
      assert.equal(peakConcurrentOpens, 1, 'Concurrent disk reads across revs must stay capped at 1');
    } finally {
      await blobSvc.dispose();
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('red-team #229 [P1-2] & #230 [P0-1, P1-7, P2-3, P2-4]: no bootWpCfg token in expr, sync always refreshes, safe z-index:-1 CSS, bridge-offline recovery, blur=0 filter:none, hasFocus/pointerdown, slot destroy & ctx.lang priority', async () => {
  // 1) #229 [P1-2]: buildWallpaperExpression never embeds dynamic mediaUrl/token/mediaPath
  const secretToken = 'deadbeef'.repeat(8);
  const secretUrl = `http://127.0.0.1:54321/wallpaper/${secretToken}/9`;
  const secretPath = 'C:/Users/Alice/Pictures/private-wall.png';
  const exprWithInit = cdp.buildWallpaperExpression(cdp.DEFAULT_CONFIG, {
    initialWallpaperConfig: {
      enabled: true,
      mediaPath: secretPath,
      mediaType: 'image',
      mediaUrl: secretUrl,
      rev: 9,
    },
  });
  assert.equal(exprWithInit.includes(secretToken), false, 'Channel 7 expr must never inline Bearer token');
  assert.equal(exprWithInit.includes(secretUrl), false, 'Channel 7 expr must never inline mediaUrl');
  assert.equal(exprWithInit.includes(secretPath), false, 'Channel 7 expr must never inline mediaPath');

  // 2) #230 [P0-1, P1-7, P2-3]: WALLPAPER_CSS structural guards
  const css = wallpaperClientMod.WALLPAPER_CSS;
  assert.equal(css.includes('body>:not(#ag-prism-wallpaper-root)'), false, 'Must NOT demote body fixed children to position:relative');
  assert.equal(css.includes(':has('), false, 'WALLPAPER_CSS must contain 0 :has()');
  assert.equal(checkBalancedBraces(css), true, 'WALLPAPER_CSS must have balanced braces');
  assert.match(css, /#ag-prism-wallpaper-root\{[^}]*z-index:-1;[^}]*background:var\(--body-background,var\(--background,#0B0B0E\)\)/);
  assert.ok(css.includes('>body:not([data-has-browser-hole="true"])'), 'Must make body background transparent when wallpaper is on');
  assert.ok(css.includes('[data-main-content-body]'), 'Must include [data-main-content-body] translucency for palette="host"');
  assert.ok(css.includes('aside,[data-testid="sidebar-split"]>div:first-child'), 'Must include sidebar translucency');
  assert.ok(css.includes('[data-testid="conversation-view"]::before{display:none !important;'), 'Must hide opaque top fade seam on conversation-view');
  assert.ok(css.includes('filter:var(--ag-prism-wp-filter,blur(4px))'), 'Must drive filter via --ag-prism-wp-filter so blurPx=0 sets filter:none');

  // 3) #229 [P1-2], #230 [P1-7, P2-3]: runtime behavior in DOM sandbox
  const env = createDomSandbox();
  env.doc.hasFocus = () => false; // Start blurred

  let getConfigCalls = 0;
  let remoteConfig = {
    ...DEFAULT_WALLPAPER_CONFIG,
    enabled: true,
    mediaPath: 'C:/wall/v.mp4',
    mediaType: 'video',
    mediaUrl: 'http://127.0.0.1:45556/wallpaper/fresh/2',
    blurPx: 0,
    rev: 2,
    serverRunning: true,
  };

  // Start offline -> refresh() sets lastError = 'bridge-offline'
  const client = wallpaperClientMod.createWallpaperClient({ window: env.sandbox, document: env.doc });
  const offlineRes = await client.refresh();
  assert.equal(offlineRes.offline, true);
  assert.equal(client.getState().lastError, 'bridge-offline');

  // Reconnect bridge -> even when wallpaper is disabled (needRebuild === false), refresh() clears bridge-offline
  env.sandbox.__agPrismWallpaperCall = (rawJson) => {
    const req = JSON.parse(rawJson);
    if (req.action === 'get-config') {
      getConfigCalls += 1;
      setTimeout(() => {
        env.sandbox.__agPrismWallpaperResolve(req.id, { ok: true, config: remoteConfig });
      }, 0);
    }
  };

  remoteConfig = { ...DEFAULT_WALLPAPER_CONFIG, enabled: false, mediaPath: '', mediaUrl: '', rev: 0 };
  await client.refresh();
  assert.equal(client.getState().lastError, '', 'Daemon reconnect must clear stuck bridge-offline even when disabled');

  // Re-test sync(bootCfgWithOldUrl) ALWAYS calls refresh() when online
  const prevCalls = getConfigCalls;
  remoteConfig = {
    ...DEFAULT_WALLPAPER_CONFIG,
    enabled: true,
    mediaPath: 'C:/wall/v.mp4',
    mediaType: 'video',
    mediaUrl: 'http://127.0.0.1:45556/wallpaper/fresh/3',
    blurPx: 0,
    pauseOnBlur: true,
    rev: 3,
    serverRunning: true,
  };
  client.sync({
    enabled: true,
    mediaPath: 'C:/wall/stale.mp4',
    mediaType: 'video',
    mediaUrl: 'http://127.0.0.1:45556/wallpaper/stale/1',
    rev: 1,
  });
  await new Promise((r) => setTimeout(r, 25));
  assert.ok(getConfigCalls > prevCalls, 'sync() must always call refresh() when bridge is online even if bootCfg has mediaUrl');
  assert.equal(client.getState().rev, 3);

  // blurPx === 0 sets --ag-prism-wp-filter: none; blurPx === 8 sets blur(8px)
  assert.equal(env.html.style.getPropertyValue('--ag-prism-wp-filter'), 'none');
  client.previewVisualVars({ blurPx: 8 });
  assert.equal(env.html.style.getPropertyValue('--ag-prism-wp-filter'), 'blur(8px)');
  client.previewVisualVars({ blurPx: 0 });
  assert.equal(env.html.style.getPropertyValue('--ag-prism-wp-filter'), 'none');

  // doc.hasFocus() === false at init pauses video; passive pointerdown resets winBlurred = false and resumes playback
  const vid = env.doc.querySelector('#ag-prism-wallpaper-root video');
  assert.ok(vid);
  assert.equal(vid.paused, true, 'Video must start paused when doc.hasFocus() === false');
  env.doc.dispatchEvent({ type: 'pointerdown' });
  assert.equal(vid.paused, false, 'pointerdown on document must reset winBlurred=false and resume video');

  // Also test applyConfig clears bridge-offline when online without rebuild
  delete env.sandbox.__agPrismWallpaperCall;
  await client.refresh();
  assert.equal(client.getState().lastError, 'bridge-offline');
  env.sandbox.__agPrismWallpaperCall = () => {};
  client.applyConfig({ ...client.getState() });
  assert.equal(client.getState().lastError, '', 'applyConfig while online must clear bridge-offline even when needRebuild=false');

  client.destroy();
  assert.equal(env.docListeners.get('pointerdown')?.size || 0, 0, 'destroy() must clean up pointerdown listener');

  // 4) #230 [P2-4]: resolveLang prefers explicit ctx.lang over ctx.getLang()
  const langSlot = env.makeNode('div', { 'data-testid': 'prism-wallpaper-slot' });
  env.body.appendChild(langSlot);
  const langHandle = wallpaperSettingsUiMod.mountWallpaperUi(langSlot, {
    window: env.sandbox,
    document: env.doc,
    lang: 'ja',
    getLang: () => 'en',
  });
  assert.equal(langHandle.root.getAttribute('data-ag-cs-lang'), 'ja');
  assert.equal(langHandle.root.querySelector('.ag-prism-wp-title').textContent, wallpaperSettingsUiMod.WALLPAPER_I18N.ja.title);
  langHandle.destroy();

  // 5) #230 [P2-4]: settings-panel.js destroys old wpSlot handle before existing.remove() on lang switch
  const dlg = env.makeNode('div', { role: 'dialog' });
  const panel = env.makeNode('div', { class: 'p-6 flex flex-col gap-4' });
  const h2 = env.makeNode('h2');
  h2.textContent = 'Appearance';
  const wrap = env.makeNode('div', { class: 'flex flex-col gap-8' });
  const anchorSec = env.makeNode('div', { class: 'space-y-2' });
  wrap.appendChild(anchorSec);
  panel.appendChild(h2);
  panel.appendChild(wrap);
  dlg.appendChild(panel);
  env.body.appendChild(dlg);

  let destroyCount = 0;
  let activeLang = 'en';
  globalThis.__prismMountWallpaperUi = (slotEl, ctx) => {
    const h = wallpaperSettingsUiMod.mountWallpaperUi(slotEl, { ...ctx, window: env.sandbox, document: env.doc });
    const origDestroy = h.destroy.bind(h);
    h.destroy = () => {
      destroyCount += 1;
      origDestroy();
    };
    return h;
  };
  const origDoc = globalThis.document;
  globalThis.document = env.doc;
  try {
    const mountPanel = () =>
      settingsPanelMod.mountOrSyncSettingsSection({
        version: '1.0.7-beta.3',
        lazyFold: false,
        getLang: () => activeLang,
        uiText: () => ({ grpAppearance: 'Appearance', sectionTitle: 'Obsidian Prism' }),
        isZh: () => activeLang.startsWith('zh'),
        resolveSettingRowActiveValue: (k) => cdp.DEFAULT_CONFIG[k],
        isSettingButtonMatch: (_k, vj, cur) => vj === JSON.stringify(cur),
        saveSetting: () => {},
        saveSettingsBatch: () => {},
        formatSettingsSummary: () => 'Obsidian',
        getThoughtTranslateMode: () => 'off',
        runGuardedMut: (fn) => fn(),
      });
    mountPanel();
    assert.equal(destroyCount, 0);
    activeLang = 'zh-CN';
    mountPanel();
    assert.equal(destroyCount, 1, 'Language switch rebuild must call old wpSlot.__agPrismWpUiHandle.destroy() before existing.remove()');
  } finally {
    globalThis.document = origDoc;
    delete globalThis.__prismMountWallpaperUi;
  }
});

test('Issue #59 regression: WALLPAPER_CSS penetrates v2.34+ inset-shell, sheet, nested flex-1 containers & .bg-sidebar in dark/light themes while keeping Browser Hole avoidance', () => {
  const css = wallpaperClientMod.WALLPAPER_CSS;
  const src = fs.readFileSync(path.join(ROOT, 'vendor', 'wallpaper', 'wallpaper-client.js'), 'utf8');

  // Strict ASCII, 0 :has(), balanced braces, 0 innerHTML in executable code
  assert.equal(/[^\x00-\x7f]/.test(css), false, 'WALLPAPER_CSS must remain strictly pure ASCII');
  assert.equal(css.includes(':has('), false, 'WALLPAPER_CSS must contain 0 :has() selectors');
  assert.equal(checkBalancedBraces(css), true, 'WALLPAPER_CSS must have balanced braces');
  const codeWithoutComments = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '');
  assert.equal(/\binnerHTML\b/.test(codeWithoutComments), false, 'wallpaper-client.js must contain 0 innerHTML usage');

  // Dark + light outer shell & sheet containers must be transparent (no outer color-mix stacking)
  assert.ok(
    css.includes(
      'html[data-ag-prism-wallpaper="on"]:not([data-ag-prism-wallpaper-hole="1"]) :is(.agy-shell,.agy-inset-shell,.agy-sheet,[data-ag-cs-home-sheet="1"],[data-main-content-body]):not([data-has-browser-hole="true"]):not([data-has-drawer-browser-hole="true"]){background:transparent !important;background-color:transparent !important;}'
    ),
    'Dark outer shell/inset-shell/sheet/home-sheet/main-content-body must be transparent with Browser Hole avoidance'
  );
  assert.ok(
    css.includes(
      'html[data-ag-prism-wallpaper="on"][data-ag-cs-theme="light"]:not([data-ag-prism-wallpaper-hole="1"]) :is(.agy-shell,.agy-inset-shell,.agy-sheet,[data-ag-cs-home-sheet="1"],[data-main-content-body]):not([data-has-browser-hole="true"]):not([data-has-drawer-browser-hole="true"])'
    ),
    'Light mode [data-ag-cs-theme="light"] must also clear .agy-inset-shell and .agy-sheet backgrounds'
  );
  assert.ok(
    css.includes(
      'body:is(.theme-light,.light-theme,.light) :is(.agy-shell,.agy-inset-shell,.agy-sheet,[data-ag-cs-home-sheet="1"],[data-main-content-body]):not([data-has-browser-hole="true"]):not([data-has-drawer-browser-hole="true"]){background:transparent !important;background-color:transparent !important;}'
    ),
    'Light mode body class fallback must also clear .agy-inset-shell and .agy-sheet backgrounds'
  );

  // Nested two-layer flex-1 containers inside .agy-sheet must be transparent with Browser Hole avoidance
  assert.ok(
    css.includes(
      'html[data-ag-prism-wallpaper="on"]:not([data-ag-prism-wallpaper-hole="1"]) .agy-sheet:not([data-has-browser-hole="true"]):not([data-has-drawer-browser-hole="true"])>div.flex-1.min-h-0.flex.flex-col,html[data-ag-prism-wallpaper="on"]:not([data-ag-prism-wallpaper-hole="1"]) .agy-sheet:not([data-has-browser-hole="true"]):not([data-has-drawer-browser-hole="true"])>div.flex-1.min-h-0.flex.flex-col>div.flex-1.min-w-0.h-full{background:transparent !important;background-color:transparent !important;}'
    ),
    'Nested .agy-sheet > div.flex-1.min-h-0.flex.flex-col and > div.flex-1.min-w-0.h-full must be transparent'
  );

  // Sidebar rule keeps existing substring order and appends .agy-shell .bg-sidebar in both dark and light rules
  const sidebarMatches = css.match(/:is\(aside,\[data-testid="sidebar-split"\]>div:first-child,\.agy-shell \.bg-sidebar\)/g) || [];
  assert.equal(sidebarMatches.length, 3, 'Dark + 2 light sidebar selectors must all include .agy-shell .bg-sidebar after existing order');

  // Tuned conversation seat scrims (dark ~52%, light ~66%)
  assert.ok(
    css.includes('[data-ag-cs-conv-seat="1"]:not([data-has-browser-hole="true"]):not([data-has-drawer-browser-hole="true"]){background-color:color-mix(in srgb,var(--background,#0B0B0E) 52%,transparent) !important;}'),
    'Dark conv-seat scrim should use 52% color-mix for balanced wallpaper visibility and readability'
  );
  assert.ok(
    css.includes('[data-ag-cs-conv-seat="1"]:not([data-has-browser-hole="true"]):not([data-has-drawer-browser-hole="true"]){background-color:color-mix(in srgb,var(--background,#F4F7FB) 66%,transparent) !important;}'),
    'Light conv-seat scrim should use 66% color-mix for balanced wallpaper visibility and readability'
  );
});

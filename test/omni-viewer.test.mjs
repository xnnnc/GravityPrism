import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import {
  WORKBENCH_I18N,
  detectWorkbenchKind,
  parseDelimitedTable,
  parseJsonLinesTable,
  formatTimecodeMs,
  renderWorkbenchHtml,
} from '../vendor/omni-viewer/workbench-page.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKBENCH_FILE = path.resolve(__dirname, '../vendor/omni-viewer/workbench-page.mjs');
const SELF_TEST_FILE = fileURLToPath(import.meta.url);

// ── Lightweight DOM + VM Harness for Executing Rendered Workbench Pages ─────

class MockStyle {
  constructor() {
    this._props = new Map();
  }
  setProperty(k, v) {
    this._props.set(k, String(v));
  }
  getPropertyValue(k) {
    return this._props.get(k) || '';
  }
}

class MockElement {
  constructor(tagName, ownerDoc) {
    this.tagName = String(tagName || 'div').toUpperCase();
    this.ownerDocument = ownerDoc;
    this.id = '';
    this.className = '';
    this.title = '';
    this.type = '';
    this.value = '';
    this.placeholder = '';
    this.src = '';
    this.srcdoc = '';
    this.href = '';
    this.download = '';
    this.alt = '';
    this.hidden = false;
    this.disabled = false;
    this.controls = false;
    this.loop = false;
    this.playsInline = false;
    this.selected = false;
    this.style = new MockStyle();
    this.children = [];
    this.parentNode = null;
    this._attrs = new Map();
    this._listeners = new Map();
    this._text = '';
    this._innerHTML = '';
    this.clientWidth = this.tagName === 'CANVAS' ? 600 : 800;
    this.clientHeight = this.tagName === 'CANVAS' ? 112 : 500;

    // Media simulation fields
    this.readyState = 4;
    this.paused = true;
    this.ended = false;
    this.currentTime = 0;
    this.duration = 12.5;
    this.playbackRate = 1;
    this.videoWidth = 1920;
    this.videoHeight = 1080;

    // Canvas simulation fields
    this.width = 300;
    this.height = 150;
    this._drawCalls = 0;
  }

  get textContent() {
    if (this.children.length === 0) return this._text;
    return this._text + this.children.map((c) => c.textContent).join('');
  }
  set textContent(v) {
    this.children = [];
    this._innerHTML = '';
    this._text = String(v ?? '');
  }

  get innerHTML() {
    if (!this._innerHTML && this.children.length > 0) {
      return this.children.map((c) => c._serializeMockXml()).join('');
    }
    return this._innerHTML;
  }
  set innerHTML(v) {
    const html = String(v ?? '');
    this._innerHTML = html;
    this._text = '';
    this.children = [];
    if (/<svg[\s>]/i.test(html)) {
      const svgNode = new MockElement('svg', this.ownerDocument);
      const vb = html.match(/\bviewBox\s*=\s*["']([^"']+)["']/i);
      if (vb) svgNode.setAttribute('viewBox', vb[1]);
      svgNode.parentNode = this;
      this.children.push(svgNode);
    }
  }

  _serializeMockXml() {
    const escTxt = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const escAtt = (s) => escTxt(s).replace(/"/g, '&quot;');
    if (this._isText) return escTxt(this._text);
    const name = this._origTag || this.tagName.toLowerCase();
    let out = `<${name}`;
    for (const [k, v] of this._attrs.entries()) {
      out += ` ${k}="${escAtt(v)}"`;
    }
    if (this.children.length === 0 && !this._text) {
      return `${out}/>`;
    }
    out += '>';
    if (this._text) out += escTxt(this._text);
    for (const c of this.children) {
      out += c._serializeMockXml();
    }
    out += `</${name}>`;
    return out;
  }

  setAttribute(k, v) {
    const val = String(v);
    this._attrs.set(k, val);
    if (k === 'id') this.id = val;
    if (k === 'class') this.className = val;
  }
  getAttribute(k) {
    return this._attrs.has(k) ? this._attrs.get(k) : null;
  }
  removeAttribute(k) {
    this._attrs.delete(k);
    if (k === 'src') this.src = '';
  }

  get firstChild() {
    return this.children[0] || null;
  }

  insertBefore(child, refNode) {
    if (!child) return child;
    if (child.parentNode) {
      const idx = child.parentNode.children.indexOf(child);
      if (idx >= 0) child.parentNode.children.splice(idx, 1);
    }
    child.parentNode = this;
    const refIdx = refNode ? this.children.indexOf(refNode) : -1;
    if (refIdx >= 0) this.children.splice(refIdx, 0, child);
    else this.children.push(child);
    return child;
  }

  appendChild(child) {
    if (!child) return child;
    if (child.parentNode) {
      const idx = child.parentNode.children.indexOf(child);
      if (idx >= 0) child.parentNode.children.splice(idx, 1);
    }
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  append(...nodes) {
    for (const n of nodes) {
      if (typeof n === 'string') {
        const span = new MockElement('span', this.ownerDocument);
        span.textContent = n;
        this.appendChild(span);
      } else if (n) {
        this.appendChild(n);
      }
    }
  }

  replaceChildren(...nodes) {
    for (const c of this.children) c.parentNode = null;
    this.children = [];
    this._text = '';
    this._innerHTML = '';
    this.append(...nodes);
  }

  remove() {
    if (!this.parentNode) return;
    const idx = this.parentNode.children.indexOf(this);
    if (idx >= 0) this.parentNode.children.splice(idx, 1);
    this.parentNode = null;
  }

  contains(target) {
    if (target === this) return true;
    for (const c of this.children) {
      if (c.contains(target)) return true;
    }
    return false;
  }

  addEventListener(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type).add(fn);
  }
  removeEventListener(type, fn) {
    this._listeners.get(type)?.delete(fn);
  }
  dispatchEvent(type, init = {}) {
    const ev = {
      type,
      target: this,
      preventDefault() {
        this.defaultPrevented = true;
      },
      ...init,
    };
    const set = this._listeners.get(type);
    if (set) {
      for (const fn of Array.from(set)) fn(ev);
    }
    const propHandler = this[`on${type}`];
    if (typeof propHandler === 'function') propHandler(ev);
    return ev;
  }

  click() {
    return this.dispatchEvent('click', { button: 0 });
  }
  select() {}
  setPointerCapture() {}
  releasePointerCapture() {}

  getBoundingClientRect() {
    return { left: 0, top: 0, width: this.clientWidth, height: this.clientHeight };
  }

  play() {
    this.paused = false;
    this.dispatchEvent('play');
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
    this.dispatchEvent('pause');
  }
  load() {}

  getContext(kind) {
    if (kind !== '2d') return null;
    const self = this;
    return {
      fillStyle: '#000',
      strokeStyle: '#000',
      lineWidth: 1,
      globalAlpha: 1,
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high',
      setTransform() {},
      clearRect() {},
      fillRect() {
        self._drawCalls += 1;
      },
      beginPath() {},
      moveTo() {},
      lineTo() {},
      stroke() {
        self._drawCalls += 1;
      },
      drawImage() {
        self._drawCalls += 1;
      },
    };
  }

  toBlob(cb, mime = 'image/png') {
    const blob = new Blob([new Uint8Array([137, 80, 78, 71])], { type: mime });
    cb(blob);
  }

  matchesSelector(sel) {
    if (this._isText) return false;
    if (sel.startsWith('#')) return this.id === sel.slice(1);
    if (sel.startsWith('.')) {
      const cls = sel.slice(1);
      return this.className.split(/\s+/).includes(cls);
    }
    return this.tagName === sel.toUpperCase();
  }

  querySelector(sel) {
    for (const c of this.children) {
      if (c.matchesSelector(sel)) return c;
      const found = c.querySelector(sel);
      if (found) return found;
    }
    return null;
  }

  querySelectorAll(sel) {
    const out = [];
    for (const c of this.children) {
      if (c.matchesSelector(sel)) out.push(c);
      out.push(...c.querySelectorAll(sel));
    }
    return out;
  }
}

function bootRenderedWorkbenchInVm(html, options = {}) {
  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/i);
  assert.ok(scriptMatch, 'rendered HTML should contain an inline <script>');
  const inlineCode = scriptMatch[1];

  // Validate syntax via vm.Script compilation
  const compiled = new vm.Script(inlineCode, { filename: 'workbench-inline.js' });

  const doc = {
    title: '',
    documentElement: null,
    body: null,
    fonts: {
      added: [],
      add(face) {
        this.added.push(face);
      },
    },
    createElement(tag) {
      const el = new MockElement(tag, doc);
      el._origTag = String(tag || 'div');
      return el;
    },
    createElementNS(_ns, tag) {
      const el = new MockElement(tag, doc);
      el._origTag = String(tag || 'svg');
      return el;
    },
    createTextNode(txt) {
      const t = new MockElement('#text', doc);
      t._isText = true;
      t._text = String(txt ?? '');
      return t;
    },
    getElementById(id) {
      return doc.documentElement.querySelector(`#${id}`);
    },
    execCommand() {
      return true;
    },
  };

  const htmlEl = new MockElement('html', doc);
  const htmlTagMatch = html.match(/<html\s+([^>]+)>/i);
  if (htmlTagMatch) {
    const attrRe = /([a-z0-9_-]+)="([^"]*)"/gi;
    let m;
    while ((m = attrRe.exec(htmlTagMatch[1])) !== null) {
      htmlEl.setAttribute(m[1], m[2]);
    }
  }
  const bodyEl = new MockElement('body', doc);
  htmlEl.appendChild(bodyEl);
  doc.documentElement = htmlEl;
  doc.body = bodyEl;

  for (const [id, tag, cls] of [
    ['wb-kind-badge', 'span', 'wb-badge'],
    ['wb-title', 'span', 'wb-filename'],
    ['wb-meta-pills', 'div', 'wb-top-left'],
    ['wb-mode-tools', 'div', 'wb-top-right'],
    ['wb-stage', 'main', ''],
    ['wb-toast', 'div', ''],
  ]) {
    const node = new MockElement(tag, doc);
    node.setAttribute('id', id);
    if (cls) node.className = cls;
    bodyEl.appendChild(node);
  }

  let nextRafId = 1;
  const rafCallbacks = new Map();
  const requestAnimationFrame = (cb) => {
    const id = nextRafId++;
    rafCallbacks.set(id, cb);
    return id;
  };
  const cancelAnimationFrame = (id) => {
    rafCallbacks.delete(id);
  };
  const flushRaf = (maxTurns = 5) => {
    let turns = 0;
    while (rafCallbacks.size > 0 && turns < maxTurns) {
      turns += 1;
      const batch = Array.from(rafCallbacks.entries());
      rafCallbacks.clear();
      for (const [, fn] of batch) fn(16 * turns);
    }
  };

  const fetchCalls = [];
  const defaultFetch = async (url) => {
    fetchCalls.push(String(url));
    if (typeof options.onFetch === 'function') {
      const custom = await options.onFetch(String(url));
      if (custom) return custom;
    }
    return {
      ok: true,
      status: 200,
      async json() {
        return { ok: true, size: 1024, mime: 'text/plain', textSlice: 'default text' };
      },
      async text() {
        return 'default text';
      },
      async arrayBuffer() {
        return new ArrayBuffer(16);
      },
    };
  };

  const clipboardLog = { texts: [], items: [] };
  const downloads = [];
  const parentMessages = [];
  const winListeners = new Map();

  const origAppend = bodyEl.appendChild.bind(bodyEl);
  bodyEl.appendChild = (node) => {
    if (node && node.tagName === 'A' && node.download) {
      downloads.push({ download: node.download, href: node.href });
    }
    return origAppend(node);
  };

  class MockImage extends MockElement {
    constructor() {
      super('img', doc);
      this.naturalWidth = 1024;
      this.naturalHeight = 512;
    }
    set src(v) {
      this._src = String(v || '');
      if (!this._src) return;
      queueMicrotask(() => {
        if (typeof this.onload === 'function') this.onload();
      });
    }
    get src() {
      return this._src || '';
    }
  }

  class MockFontFace {
    constructor(family, source) {
      this.family = family;
      this.source = source;
    }
    load() {
      if (options.failFontLoad) return Promise.reject(new Error('corrupted font table'));
      return Promise.resolve(this);
    }
  }

  class MockClipboardItem {
    constructor(record) {
      this.record = record;
    }
  }

  const urlObj = new URL(options.locationHref || 'http://127.0.0.1:43199/viewer');
  const win = {
    devicePixelRatio: 2,
    location: {
      href: urlObj.href,
      origin: urlObj.origin,
      search: urlObj.search,
      hash: urlObj.hash,
    },
    parent: null,
    addEventListener(type, fn) {
      if (!winListeners.has(type)) winListeners.set(type, new Set());
      winListeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      winListeners.get(type)?.delete(fn);
    },
    dispatchWindowEvent(type, ev = {}) {
      const set = winListeners.get(type);
      if (set) {
        for (const fn of Array.from(set)) fn({ type, ...ev });
      }
    },
    postMessageToSelf(data, customSource) {
      const set = winListeners.get('message');
      const src = customSource === undefined ? win.parent : customSource;
      if (set) {
        for (const fn of Array.from(set)) fn({ data, source: src });
      }
    },
  };
  win.parent = options.topLevelTab
    ? win
    : {
        postMessage(msg) {
          parentMessages.push(msg);
        },
      };

  const CustomURL = Object.assign(
    function (...args) {
      return new URL(...args);
    },
    {
      createObjectURL() {
        return 'blob:http://127.0.0.1:43199/mock-blob-id';
      },
      revokeObjectURL() {},
    }
  );

  const sandbox = {
    window: win,
    document: doc,
    location: win.location,
    navigator: {
      clipboard: {
        async writeText(t) {
          clipboardLog.texts.push(String(t));
        },
        async write(items) {
          clipboardLog.items.push(...items);
        },
      },
    },
    URL: CustomURL,
    URLSearchParams,
    Blob,
    Image: MockImage,
    FontFace: MockFontFace,
    ClipboardItem: MockClipboardItem,
    fetch: defaultFetch,
    requestAnimationFrame,
    cancelAnimationFrame,
    setTimeout,
    clearTimeout,
    getComputedStyle(elNode) {
      const accent = elNode.getAttribute('data-wb-accent') || 'follow';
      const accentMap = {
        cobalt: '#669DF6',
        iris: '#A58AF8',
        amber: '#F2B84B',
        mono: '#D4D7E0',
        follow: '#669DF6',
      };
      return {
        getPropertyValue(prop) {
          if (prop === '--wb-accent') return accentMap[accent] || '#669DF6';
          if (prop === '--wb-muted') return '#8A8A98';
          if (prop === '--wb-accent-soft') return 'rgba(102,157,246,0.15)';
          return '';
        },
      };
    },
  };

  compiled.runInNewContext(sandbox);

  const settle = async () => {
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setImmediate(r));
    }
  };

  return {
    doc,
    win,
    htmlEl,
    stageEl: doc.getElementById('wb-stage'),
    toolsEl: doc.getElementById('wb-mode-tools'),
    pillsEl: doc.getElementById('wb-meta-pills'),
    badgeEl: doc.getElementById('wb-kind-badge'),
    titleEl: doc.getElementById('wb-title'),
    toastEl: doc.getElementById('wb-toast'),
    fetchCalls,
    clipboardLog,
    downloads,
    parentMessages,
    flushRaf,
    pendingRafCount: () => rafCallbacks.size,
    settle,
  };
}

// ── 1. Unit Tests: Pure Parsers, Formatters & Kind Detection ────────────────

test('detectWorkbenchKind covers all media, vector, sandbox, table, font & fallback types', () => {
  assert.equal(detectWorkbenchKind('/clips/demo.MP4'), 'video');
  assert.equal(detectWorkbenchKind('C:\\media\\capture.webm?token=123#t=5'), 'video');
  assert.equal(detectWorkbenchKind('/sound/voice.flac'), 'audio');
  assert.equal(detectWorkbenchKind('/sound/podcast.m4a'), 'audio');
  assert.equal(detectWorkbenchKind('/icons/logo.svg#L10-L20'), 'svg');
  assert.equal(detectWorkbenchKind('/shots/hero.webp'), 'image');
  assert.equal(detectWorkbenchKind('/shots/transparent.avif'), 'image');
  assert.equal(detectWorkbenchKind('/pages/landing.html'), 'html');
  assert.equal(detectWorkbenchKind('/docs/manual.pdf'), 'pdf');
  assert.equal(detectWorkbenchKind('/data/metrics.csv'), 'table');
  assert.equal(detectWorkbenchKind('/data/export.tsv'), 'table');
  assert.equal(detectWorkbenchKind('/logs/events.jsonl'), 'table');
  assert.equal(detectWorkbenchKind('/logs/stream.ndjson'), 'table');
  assert.equal(detectWorkbenchKind('/fonts/JetBrainsMono.woff2'), 'font');
  assert.equal(detectWorkbenchKind('/fonts/Inter.ttf'), 'font');
  assert.equal(detectWorkbenchKind('/diagrams/flow.mmd'), 'mermaid');

  // Extensionless paths resolved via MIME fallback
  assert.equal(detectWorkbenchKind('/blob/raw-1', 'video/quicktime; charset=binary'), 'video');
  assert.equal(detectWorkbenchKind('/blob/raw-2', 'audio/ogg'), 'audio');
  assert.equal(detectWorkbenchKind('/blob/raw-3', 'image/svg+xml'), 'svg');
  assert.equal(detectWorkbenchKind('/blob/raw-4', 'image/png'), 'image');
  assert.equal(detectWorkbenchKind('/blob/raw-5', 'application/pdf'), 'pdf');
  assert.equal(detectWorkbenchKind('/blob/raw-6', 'application/x-ndjson'), 'table');
  assert.equal(detectWorkbenchKind('/blob/raw-7', 'font/otf'), 'font');
  assert.equal(detectWorkbenchKind('/notes/README.md', 'text/markdown'), 'text');
  assert.equal(detectWorkbenchKind('', ''), 'text');
});

test('parseDelimitedTable handles RFC4180 quotes, embedded CRLF newlines, BOM & TSV auto-detect', () => {
  const csv =
    '\uFEFFid,title,notes\r\n' +
    '1,"Alpha, ""Core""",normal\r\n' +
    '2,"Multi\r\nLine\nCell",42\r\n' +
    '3,short\r\n';
  const res = parseDelimitedTable(csv);
  assert.equal(res.delimiter, ',');
  assert.deepEqual(res.headers, ['id', 'title', 'notes']);
  assert.equal(res.rows.length, 3);
  assert.deepEqual(res.rows[0], ['1', 'Alpha, "Core"', 'normal']);
  assert.deepEqual(res.rows[1], ['2', 'Multi\r\nLine\nCell', '42']);
  assert.deepEqual(res.rows[2], ['3', 'short', '']);

  const tsv = 'metric\tp50\tp99\nlatency_ms\t12.4\t48.9\n';
  const tsvRes = parseDelimitedTable(tsv);
  assert.equal(tsvRes.delimiter, '\t');
  assert.deepEqual(tsvRes.headers, ['metric', 'p50', 'p99']);
  assert.deepEqual(tsvRes.rows, [['latency_ms', '12.4', '48.9']]);
});

test('parseJsonLinesTable collects union columns and tolerates malformed lines without throwing', () => {
  const jsonl = [
    '{"step":1,"status":"ok","meta":{"ms":12}}',
    'not-valid-json-line',
    '{"step":2,"extra":"yes"}',
    '[1,2,3]',
    '',
  ].join('\n');

  const res = parseJsonLinesTable(jsonl);
  assert.equal(res.malformedCount, 1);
  assert.deepEqual(res.headers, ['step', 'status', 'meta', '_raw_invalid', 'extra', 'value']);
  assert.equal(res.rows.length, 4);
  assert.equal(res.rows[0][0], '1');
  assert.equal(res.rows[0][2], '{"ms":12}');
  assert.equal(res.rows[1][3], 'not-valid-json-line');
  assert.equal(res.rows[2][4], 'yes');
  assert.equal(res.rows[3][5], '[1,2,3]');
});

test('formatTimecodeMs formats millisecond precision and guards invalid inputs', () => {
  assert.equal(formatTimecodeMs(0), '00:00.000');
  assert.equal(formatTimecodeMs(65.042), '01:05.042');
  assert.equal(formatTimecodeMs(3723.5), '01:02:03.500');
  assert.equal(formatTimecodeMs(-9), '00:00.000');
  assert.equal(formatTimecodeMs(Number.NaN), '00:00.000');
});

// ── 2. SSR Security, Zero-CDN & Theme/URL Contract Tests ────────────────────

test('renderWorkbenchHtml escapes XSS vectors, embeds zero external CDNs, and respects theme contract', () => {
  const xssPayload = '</script><script>globalThis.__xss = 1;</script>';
  const html = renderWorkbenchHtml({
    path: `/project/${xssPayload}.svg`,
    name: `bad"${xssPayload}`,
    rawContent: `<svg viewBox="0 0 100 50"><text>${xssPayload}</text></svg>`,
    theme: 'light',
    palette: 'warm',
    lightPreset: 'alabaster',
    accent: 'amber',
    corners: 'sharp',
    lang: 'en',
  });

  assert.ok(!html.includes('<script>globalThis.__xss'), 'must escape </script> breakout inside inline JS and HTML');
  assert.match(html, /data-wb-theme="light"/);
  assert.match(html, /data-wb-palette="warm"/);
  assert.match(html, /data-wb-light-preset="alabaster"/);
  assert.match(html, /data-wb-accent="amber"/);
  assert.match(html, /data-wb-corners="sharp"/);
  assert.match(html, /lang="en"/);

  // Verify zero external HTTP(S) resources (only W3C SVG namespace literal is allowed)
  const urls = html.match(/https?:\/\/[^\s"'<>\\]+/g) || [];
  for (const u of urls) {
    assert.equal(u, 'http://www.w3.org/2000/svg', `unexpected external URL in self-contained workbench: ${u}`);
  }
});

// ── 3. Interactive Engine Tests in VM + Mock DOM ────────────────────────────

test('Engine 1 (Video & Audio): frame stepping, A-B loop, PNG frame capture, markers & 0fps audio pause', async () => {
  // Part A: Video Workbench driven via client URL query parameters on empty renderWorkbenchHtml({})
  const videoHtml = renderWorkbenchHtml({});
  const videoEnv = bootRenderedWorkbenchInVm(videoHtml, {
    locationHref: 'http://127.0.0.1:43199/viewer?token=tok1&path=%2Fmedia%2Fdemo.mp4&theme=dark&lang=zh-CN',
    onFetch: async (url) => {
      if (url.includes('/meta')) {
        return {
          ok: true,
          async json() {
            return { ok: true, name: 'demo.mp4', size: 10485760, mime: 'video/mp4', isBinary: true };
          },
        };
      }
      return null;
    },
  });
  await videoEnv.settle();

  assert.equal(videoEnv.badgeEl.textContent, 'VIDEO');
  const videoEl = videoEnv.stageEl.querySelector('video');
  assert.ok(videoEl, 'video element should be mounted');
  assert.match(videoEl.src, /\/stream\?token=tok1&path=%2Fmedia%2Fdemo\.mp4/);

  videoEl.dispatchEvent('loadedmetadata');
  assert.match(videoEnv.pillsEl.textContent, /1920×1080/);
  assert.match(videoEnv.pillsEl.textContent, /10\.00 MB/);

  const buttons = videoEnv.stageEl.querySelectorAll('button');
  const findBtn = (txt) => buttons.find((b) => b.textContent.includes(txt));

  // Frame stepping (+1F / -1F = 1/30s)
  videoEl.currentTime = 1.0;
  findBtn('1帧 >').click();
  assert.ok(Math.abs(videoEl.currentTime - (1.0 + 1 / 30)) < 1e-6);
  findBtn('< 1帧').click();
  assert.ok(Math.abs(videoEl.currentTime - 1.0) < 1e-6);

  // A-B Loop wraparound
  videoEl.currentTime = 2.0;
  findBtn('设 A 点').click();
  videoEl.currentTime = 4.0;
  findBtn('设 B 点').click();
  videoEl.currentTime = 4.25;
  videoEl.dispatchEvent('timeupdate');
  assert.equal(videoEl.currentTime, 2.0, 'reaching B point should loop back to A point');

  // Frame PNG download & clipboard copy
  findBtn('下载帧 PNG').click();
  assert.equal(videoEnv.downloads.length, 1);
  assert.match(videoEnv.downloads[0].download, /^frame-.*\.png$/);

  findBtn('复制帧').click();
  await videoEnv.settle();
  assert.equal(videoEnv.clipboardLog.items.length, 1);

  // Markers add & copy
  videoEl.currentTime = 5.123;
  findBtn('+ 打点').click();
  findBtn('复制时间点').click();
  await videoEnv.settle();
  assert.ok(videoEnv.clipboardLog.texts.includes('00:05.123'));

  // Part B: Audio Waveform scrubbing, theme refresh & strict 0fps pause discipline
  const audioHtml = renderWorkbenchHtml({
    baseUrl: 'http://127.0.0.1:43199',
    token: 'tok2',
    path: '/audio/sample.wav',
    lang: 'en',
  });
  const audioEnv = bootRenderedWorkbenchInVm(audioHtml, {
    onFetch: async (url) => {
      if (url.includes('/meta')) {
        return {
          ok: true,
          async json() {
            return { ok: true, name: 'sample.wav', size: 512000, mime: 'audio/wav', isBinary: true };
          },
        };
      }
      return null;
    },
  });
  await audioEnv.settle();
  audioEnv.flushRaf(1);

  assert.equal(audioEnv.badgeEl.textContent, 'AUDIO');
  const audioEl = audioEnv.stageEl.querySelector('audio');
  const waveCanvas = audioEnv.stageEl.querySelector('.wb-wave-canvas');
  assert.ok(audioEl && waveCanvas, 'audio element and waveform canvas must mount');

  // Scrubbing waveform seeks audio
  audioEl.duration = 20;
  waveCanvas.clientWidth = 400;
  waveCanvas.dispatchEvent('pointerdown', { clientX: 200, pointerId: 1 });
  waveCanvas.dispatchEvent('pointerup', { clientX: 200, pointerId: 1 });
  assert.equal(audioEl.currentTime, 10);

  // Play starts rAF loop; pause immediately cancels rAF to 0fps
  await audioEl.play();
  assert.equal(audioEnv.pendingRafCount(), 1, 'playing audio schedules rAF');
  audioEl.pause();
  assert.equal(audioEnv.pendingRafCount(), 0, 'paused audio must drop to 0 pending rAF (0fps)');

  // Live theme sync redraws paused waveform in 1 shot without starting rAF loop
  const drawsBefore = waveCanvas._drawCalls;
  audioEnv.win.postMessageToSelf({
    type: 'ag-prism-workbench-sync',
    theme: 'light',
    accent: 'cobalt',
  });
  assert.ok(waveCanvas._drawCalls > drawsBefore, 'paused waveform redraws on theme change');
  assert.equal(audioEnv.pendingRafCount(), 0, 'theme redraw stays at 0fps');
});

test('Engine 2 & 5 (SVG & Mermaid Vector Lens): XSS sanitization, wheel zoom, drag pan, PNG export & postMessage sync', async () => {
  const html = renderWorkbenchHtml({
    kind: 'mermaid',
    lang: 'zh-CN',
  });
  const env = bootRenderedWorkbenchInVm(html);
  await env.settle();

  // Initially waiting for diagram payload
  assert.match(env.stageEl.textContent, /等待传入图表数据/);

  // Inject SVG with malicious script & onload via ag-prism-workbench-sync and switch to Japanese + Alabaster
  env.win.postMessageToSelf({
    type: 'ag-prism-workbench-sync',
    theme: 'light',
    palette: 'warm',
    lightPreset: 'alabaster',
    accent: 'iris',
    corners: 'soft',
    lang: 'ja',
    kind: 'mermaid',
    title: 'Architecture Flow',
    rawContent:
      '<svg viewBox="0 0 400 200" onload="evil()"><script>evil()</script><rect width="400" height="200"/></svg>',
  });
  await env.settle();
  env.flushRaf(2);

  assert.equal(env.htmlEl.getAttribute('data-wb-theme'), 'light');
  assert.equal(env.htmlEl.getAttribute('data-wb-light-preset'), 'alabaster');
  assert.equal(env.htmlEl.getAttribute('data-wb-accent'), 'iris');
  assert.equal(env.htmlEl.getAttribute('data-wb-corners'), 'soft');
  assert.equal(env.htmlEl.getAttribute('lang'), 'ja');
  assert.equal(env.titleEl.textContent, 'Architecture Flow');
  assert.match(env.pillsEl.textContent, /400×200/);

  const viewport = env.stageEl.querySelector('.wb-panzoom-viewport');
  const layer = env.stageEl.querySelector('.wb-panzoom-layer');
  assert.ok(viewport && layer);
  assert.ok(!layer.innerHTML.includes('<script'), 'sanitizeSvgMarkup must strip <script>');
  assert.ok(!/onload\s*=/i.test(layer.innerHTML), 'sanitizeSvgMarkup must strip inline event handlers');

  // Wheel zoom & pointer drag pan
  const initialTransform = layer.style.transform;
  viewport.dispatchEvent('wheel', { clientX: 200, clientY: 150, deltaY: -120 });
  assert.notEqual(layer.style.transform, initialTransform, 'wheel should update layer scale/pan transform');

  const afterWheelTransform = layer.style.transform;
  viewport.dispatchEvent('pointerdown', { button: 0, clientX: 100, clientY: 100, pointerId: 1 });
  viewport.dispatchEvent('pointermove', { clientX: 160, clientY: 135, pointerId: 1 });
  viewport.dispatchEvent('pointerup', { clientX: 160, clientY: 135, pointerId: 1 });
  assert.notEqual(layer.style.transform, afterWheelTransform, 'pointer drag should pan layer');

  // Backdrop switch & 2x PNG export
  const toolBtns = env.toolsEl.querySelectorAll('button');
  const darkBgBtn = toolBtns.find((b) => b.getAttribute('data-bg-id') === 'dark');
  darkBgBtn.click();
  assert.equal(viewport.getAttribute('data-backdrop'), 'dark');

  const png2xBtn = toolBtns.find((b) => b.textContent === '2x PNG');
  png2xBtn.click();
  await env.settle();
  assert.equal(env.downloads.length, 1);
  assert.match(env.downloads[0].download, /-2x\.png$/);

  assert.ok(
    env.parentMessages.some((m) => m.type === 'ag-prism-workbench-ready' && m.kind === 'mermaid'),
    'must notify parent frame when workbench is ready'
  );
  assert.equal(env.pendingRafCount(), 0, 'stationary vector canvas stays at 0fps');
});

test('Engine 3 (HTML Responsive Sandbox & PDF): /sandbox-init mount, viewport presets, split mode & PDF iframe', async () => {
  const html = renderWorkbenchHtml({
    baseUrl: 'http://127.0.0.1:43199',
    token: 'tok-sbx',
    path: '/site/index.html',
    lang: 'en',
  });
  const env = bootRenderedWorkbenchInVm(html, {
    onFetch: async (url) => {
      if (url.includes('/meta')) {
        return {
          ok: true,
          async json() {
            return { ok: true, name: 'index.html', size: 2048, mime: 'text/html', textSlice: '<h1>Hello</h1>' };
          },
        };
      }
      if (url.includes('/sandbox-init')) {
        return {
          ok: true,
          async json() {
            return { ok: true, url: '/sandbox/tok-sbx/m1/index.html' };
          },
        };
      }
      return null;
    },
  });
  await env.settle();

  const frameWrap = env.stageEl.querySelector('.wb-sandbox-frame-wrap');
  const frame = env.stageEl.querySelector('.wb-sandbox-frame');
  assert.equal(frame.src, 'http://127.0.0.1:43199/sandbox/tok-sbx/m1/index.html');

  const toolBtns = env.toolsEl.querySelectorAll('button');
  toolBtns.find((b) => b.getAttribute('data-vp') === 'mobile').click();
  assert.equal(frameWrap.style.width, '390px');
  toolBtns.find((b) => b.getAttribute('data-vp') === 'tablet').click();
  assert.equal(frameWrap.style.width, '768px');

  toolBtns.find((b) => b.textContent === 'Split').click();
  await env.settle();
  const srcPane = env.stageEl.querySelector('.wb-source-pane');
  assert.equal(srcPane.hidden, false);
  assert.equal(srcPane.textContent, '<h1>Hello</h1>');

  // PDF stream reader check
  const pdfHtml = renderWorkbenchHtml({
    baseUrl: 'http://127.0.0.1:43199',
    token: 'tok-pdf',
    path: '/docs/spec.pdf',
  });
  const pdfEnv = bootRenderedWorkbenchInVm(pdfHtml, {
    onFetch: async (url) => {
      if (url.includes('/meta')) {
        return {
          ok: true,
          async json() {
            return { ok: true, name: 'spec.pdf', size: 40960, mime: 'application/pdf', isBinary: true };
          },
        };
      }
      return null;
    },
  });
  await pdfEnv.settle();
  const pdfFrame = pdfEnv.stageEl.querySelector('.wb-pdf-frame');
  assert.ok(pdfFrame);
  assert.match(pdfFrame.src, /\/stream\?token=tok-pdf&path=%2Fdocs%2Fspec\.pdf/);
});

test('Engine 4 (CSV/JSONL Table & Font Waterfall): filter, numeric sort, chunked Load More & FontFace waterfall', async () => {
  // Part A: Table with numeric sort, search filter, and incremental /meta?offset= Load More
  const csvPart1 = 'name,score\nzeta,9\nalpha,100\nbeta,25\n';
  const csvPart2 = 'omega,500\n';

  const tblHtml = renderWorkbenchHtml({
    baseUrl: 'http://127.0.0.1:43199',
    token: 'tok-csv',
    path: '/data/scores.csv',
    lang: 'en',
  });
  const tblEnv = bootRenderedWorkbenchInVm(tblHtml, {
    onFetch: async (url) => {
      if (url.includes('offset=0')) {
        return {
          ok: true,
          async json() {
            return {
              ok: true,
              name: 'scores.csv',
              size: 4096,
              mime: 'text/csv',
              textSlice: csvPart1,
              truncated: true,
              nextOffset: csvPart1.length,
            };
          },
        };
      }
      if (url.includes(`offset=${csvPart1.length}`)) {
        return {
          ok: true,
          async json() {
            return {
              ok: true,
              textSlice: csvPart2,
              truncated: false,
              nextOffset: 0,
            };
          },
        };
      }
      return null;
    },
  });
  await tblEnv.settle();

  const getBodyColumnValues = (colIndex) => {
    const tbody = tblEnv.stageEl.querySelector('tbody');
    return tbody.children.map((tr) => tr.children[colIndex + 1].textContent);
  };

  assert.deepEqual(getBodyColumnValues(0), ['zeta', 'alpha', 'beta']);

  // Click 'score' header -> numeric ascending (9, 25, 100), NOT lexicographical ('100', '25', '9')
  const headers = tblEnv.stageEl.querySelectorAll('th');
  headers[2].click();
  assert.deepEqual(getBodyColumnValues(1), ['9', '25', '100']);

  // Second click -> numeric descending (100, 25, 9)
  headers[2].click();
  const headersAfterAsc = tblEnv.stageEl.querySelectorAll('th');
  assert.match(headersAfterAsc[2].textContent, /↓/);
  assert.deepEqual(getBodyColumnValues(1), ['100', '25', '9']);

  // Incremental chunk Load More
  const loadMoreBtn = tblEnv.stageEl.querySelectorAll('button').find((b) => b.textContent === 'Load More');
  assert.equal(loadMoreBtn.hidden, false);
  await loadMoreBtn.onclick();
  await tblEnv.settle();
  assert.deepEqual(getBodyColumnValues(1), ['500', '100', '25', '9']);
  assert.equal(loadMoreBtn.hidden, true, 'Load More hides once truncated=false');

  // Search filter
  const searchInput = tblEnv.stageEl.querySelector('input');
  searchInput.value = 'bet';
  searchInput.oninput();
  assert.deepEqual(getBodyColumnValues(0), ['beta']);

  // Part B: Font specimen waterfall (12 / 16 / 24 / 36 / 56px + FontFace load + ligature toggle)
  const fontHtml = renderWorkbenchHtml({
    baseUrl: 'http://127.0.0.1:43199',
    token: 'tok-font',
    path: '/fonts/PrismMono.woff2',
    lang: 'en',
  });
  const fontEnv = bootRenderedWorkbenchInVm(fontHtml, {
    onFetch: async (url) => {
      if (url.includes('/meta')) {
        return {
          ok: true,
          async json() {
            return { ok: true, name: 'PrismMono.woff2', size: 88120, mime: 'font/woff2', isBinary: true };
          },
        };
      }
      return null;
    },
  });
  await fontEnv.settle();

  assert.equal(fontEnv.doc.fonts.added.length, 1, 'FontFace should load from /stream and register in document.fonts');
  const samples = fontEnv.stageEl.querySelectorAll('.wb-font-sample');
  assert.equal(samples.length, 5, 'must render 12/16/24/36/56px waterfall rows');
  assert.deepEqual(
    samples.map((s) => s.style.fontSize),
    ['12px', '16px', '24px', '36px', '56px']
  );

  const fontInput = fontEnv.toolsEl.querySelector('input');
  fontInput.value = 'Custom Glyph Preview !== =>';
  fontInput.oninput();
  assert.ok(samples.every((s) => s.textContent === 'Custom Glyph Preview !== =>'));

  const ligaBtn = fontEnv.toolsEl.querySelector('button');
  assert.match(samples[0].style.fontFeatureSettings, /"liga" 1/);
  ligaBtn.click();
  assert.match(samples[0].style.fontFeatureSettings, /"liga" 0/);
});

test('Bitmap Image pan-zoom, JSONL grid mounting & 5-locale + host theme-change postMessage compatibility', async () => {
  // Bitmap image natural dimensions & 1:1 zoom
  const imgHtml = renderWorkbenchHtml({
    baseUrl: 'http://127.0.0.1:43199',
    token: 'tok-img',
    path: '/assets/sprite.webp',
    lang: 'yue',
  });
  const imgEnv = bootRenderedWorkbenchInVm(imgHtml, {
    onFetch: async (url) => {
      if (url.includes('/meta')) {
        return {
          ok: true,
          async json() {
            return { ok: true, name: 'sprite.webp', size: 65536, mime: 'image/webp', isBinary: true };
          },
        };
      }
      return null;
    },
  });
  await imgEnv.settle();
  imgEnv.flushRaf(2);

  assert.equal(imgEnv.badgeEl.textContent, 'IMAGE');
  assert.match(imgEnv.pillsEl.textContent, /1024×512/);
  const btns = imgEnv.toolsEl.querySelectorAll('button');
  assert.ok(btns.some((b) => b.textContent === '棋盤格'), 'Cantonese (yue) locale label should render');
  btns.find((b) => b.textContent === '1:1').click();
  assert.match(imgEnv.toolsEl.textContent, /100%/);

  // Host theme-change compatibility message
  imgEnv.win.postMessageToSelf({
    type: 'theme-change',
    payload: {
      themeType: 'light',
      cssVariables: { '--wb-accent': '#2563EB' },
    },
  });
  assert.equal(imgEnv.htmlEl.getAttribute('data-wb-theme'), 'light');
  assert.equal(imgEnv.htmlEl.style.getPropertyValue('--wb-accent'), '#2563EB');

  // Switch to zh-TW JSONL grid via ag-prism-workbench-sync
  imgEnv.win.postMessageToSelf({
    type: 'ag-prism-workbench-sync',
    lang: 'zh-TW',
    kind: 'table',
    path: '/logs/trace.jsonl',
    rawContent: '{"id":1,"msg":"init"}\n{"id":2,"msg":"ready"}\n',
  });
  await imgEnv.settle();
  assert.equal(imgEnv.badgeEl.textContent, 'TABLE');
  assert.match(imgEnv.stageEl.textContent, /ready/);
  assert.ok(
    imgEnv.toolsEl.querySelectorAll('button').some((b) => b.textContent === '純文字'),
    'Traditional Chinese (zh-TW) locale label should render'
  );
});

test('Plain text fallback stage supports line-wrap toggle, clipboard copy & chunked Load More', async () => {
  const txtHtml = renderWorkbenchHtml({
    baseUrl: 'http://127.0.0.1:43199',
    token: 'tok-txt',
    path: '/logs/daemon.log',
    lang: 'zh-CN',
  });
  const txtEnv = bootRenderedWorkbenchInVm(txtHtml, {
    onFetch: async (url) => {
      if (url.includes('offset=0')) {
        return {
          ok: true,
          async json() {
            return {
              ok: true,
              name: 'daemon.log',
              size: 512,
              mime: 'text/plain',
              textSlice: 'line-1\n',
              truncated: true,
              nextOffset: 7,
            };
          },
        };
      }
      if (url.includes('offset=7')) {
        return {
          ok: true,
          async json() {
            return { ok: true, textSlice: 'line-2\n', truncated: false, nextOffset: 0 };
          },
        };
      }
      return null;
    },
  });
  await txtEnv.settle();

  const pre = txtEnv.stageEl.querySelector('pre');
  assert.equal(pre.getAttribute('data-wrap'), '1');
  const btns = txtEnv.toolsEl.querySelectorAll('button');
  btns.find((b) => b.textContent === '自动换行').click();
  assert.equal(pre.getAttribute('data-wrap'), '0');

  const moreBtn = btns.find((b) => b.textContent === '加载更多切片');
  await moreBtn.onclick();
  await txtEnv.settle();
  assert.equal(pre.textContent, 'line-1\nline-2\n');
  assert.equal(moreBtn.hidden, true);
});

test('Security & resilience regressions: opaque HTML sandbox, foreignObject/SMIL SVG strip, parent-only postMessage, truncated JSONL & corrupt font', async () => {
  // 1. HTML sandbox must NOT carry allow-same-origin
  const sbxHtml = renderWorkbenchHtml({
    baseUrl: 'http://127.0.0.1:43199',
    token: 'tok-sec',
    path: '/untrusted/app.html',
    sandboxUrl: 'http://127.0.0.1:43199/sandbox/subtok/m1/app.html',
  });
  const sbxEnv = bootRenderedWorkbenchInVm(sbxHtml, {
    onFetch: async (url) => {
      if (url.includes('/meta')) {
        return { ok: true, async json() { return { ok: true, name: 'app.html', size: 120, mime: 'text/html' }; } };
      }
      return null;
    },
  });
  await sbxEnv.settle();
  const sbxFrame = sbxEnv.stageEl.querySelector('.wb-sandbox-frame');
  const sbxAttr = sbxFrame.getAttribute('sandbox') || '';
  assert.equal(sbxAttr.includes('allow-same-origin'), false, 'HTML sandbox must not include allow-same-origin');
  assert.equal(sbxFrame.src, 'http://127.0.0.1:43199/sandbox/subtok/m1/app.html');

  // 2. Spoofed postMessage from child iframe (ev.source !== window.parent) must be rejected
  sbxEnv.win.postMessageToSelf(
    { type: 'ag-prism-workbench-sync', theme: 'light', path: '/etc/passwd' },
    { spoofedChildFrame: true }
  );
  await sbxEnv.settle();
  assert.equal(sbxEnv.htmlEl.getAttribute('data-wb-theme'), 'dark', 'spoofed child postMessage must be ignored');

  // 3. SVG sanitizer strips <!DOCTYPE/!ENTITY> XML bombs, nested <scr<script>ipt>, <foreignObject>, <iframe>, <animate>, <set>, @import/external CSS url(), javascript: href & external <image>
  sbxEnv.win.postMessageToSelf({
    type: 'ag-prism-workbench-sync',
    kind: 'mermaid',
    rawContent:
      '<!DOCTYPE svg [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;">]>' +
      '<svg viewBox="0 0 200 100">' +
      '<style>@import url("https://198.51.100.7/evil-ext-css"); .ok-node { fill: url(#grad-ok); background: url("https://198.51.100.7/evil-ext-bg"); width: expression(alert(1)); }</style>' +
      '<script>if (1 < 2) evil()</script>' +
      '<scr<script>ipt>nestedEvil()</scr</script>ipt>' +
      '<foreignObject><div><img src="x"><iframe srcdoc="evil"></iframe></div></foreignObject>' +
      '<animate attributeName="href" to="javascript:evil()"/>' +
      '<set attributeName="onload" to="evil()"/>' +
      '<a href="javascript:evil()"><text>bad &amp; escaped</text></a>' +
      '<image href="https://198.51.100.7/evil-ext-img"/>' +
      '<image href="data:image/png;base64,iVBORw0KGgo=" width="10" height="10"/>' +
      '<use href="#ok-id"/>' +
      '</svg>',
  });
  await sbxEnv.settle();
  const svgLayer = sbxEnv.stageEl.querySelector('.wb-panzoom-layer');
  assert.ok(!/foreignObject|iframe|<animate|<set|<script|javascript:|evil-ext-|@import|expression/i.test(svgLayer.innerHTML));
  assert.match(svgLayer.innerHTML, /#ok-id/);
  assert.match(svgLayer.innerHTML, /#grad-ok/);
  assert.match(svgLayer.innerHTML, /data:image\/png;base64,iVBORw0KGgo=/);

  const wbSrc = fs.readFileSync(WORKBENCH_FILE, 'utf8');
  assert.equal(/DOMParser|XMLSerializer|\.innerHTML\s*=/.test(wbSrc), false, 'workbench-page.mjs must contain zero DOMParser/XMLSerializer/innerHTML sinks');

  // 4. Truncated >256KB JSONL slice strips trailing half-line until Load More completes it
  const jlPart1 = '{"id":1,"status":"ok"}\n{"id":2,"stat';
  const jlPart2 = 'us":"done"}\n';
  const jlHtml = renderWorkbenchHtml({
    baseUrl: 'http://127.0.0.1:43199',
    token: 'tok-jl',
    path: '/logs/big.jsonl',
    lang: 'en',
  });
  const jlEnv = bootRenderedWorkbenchInVm(jlHtml, {
    onFetch: async (url) => {
      if (url.includes('offset=0')) {
        return {
          ok: true,
          async json() {
            return { ok: true, name: 'big.jsonl', size: 300000, mime: 'application/jsonl', textSlice: jlPart1, truncated: true, nextOffset: jlPart1.length };
          },
        };
      }
      if (url.includes(`offset=${jlPart1.length}`)) {
        return {
          ok: true,
          async json() {
            return { ok: true, textSlice: jlPart2, truncated: false, nextOffset: 0 };
          },
        };
      }
      return null;
    },
  });
  await jlEnv.settle();
  const thTextsBefore = jlEnv.stageEl.querySelectorAll('th').map((t) => t.textContent);
  assert.ok(!thTextsBefore.includes('_raw_invalid'), 'trailing half-line of truncated slice must not create _raw_invalid column');
  const moreBtn = jlEnv.stageEl.querySelectorAll('button').find((b) => b.textContent === 'Load More');
  await moreBtn.onclick();
  await jlEnv.settle();
  assert.match(jlEnv.stageEl.textContent, /done/);

  // 5. Corrupt font surfaces loadError instead of silent success
  const badFontHtml = renderWorkbenchHtml({
    baseUrl: 'http://127.0.0.1:43199',
    token: 'tok-badf',
    path: '/fonts/broken.ttf',
    lang: 'en',
  });
  const badFontEnv = bootRenderedWorkbenchInVm(badFontHtml, {
    failFontLoad: true,
    onFetch: async (url) => {
      if (url.includes('/meta')) {
        return { ok: true, async json() { return { ok: true, name: 'broken.ttf', size: 128, mime: 'font/ttf', isBinary: true }; } };
      }
      return null;
    },
  });
  await badFontEnv.settle();
  assert.match(badFontEnv.pillsEl.textContent, /Failed to load file/);

  // 6. Top-level native Browser Tab mode (window.parent === window): #raw=... Mermaid hash, hashchange & Prism Omni title
  const svg1 = '<svg viewBox="0 0 280 90"><rect width="280" height="90"/></svg>';
  const svg2 = '<svg viewBox="0 0 640 360"><circle cx="50" cy="50" r="40"/></svg>';
  const tabHtml = renderWorkbenchHtml({ kind: 'mermaid', name: 'Sequence Flow' });
  assert.match(tabHtml, /<title>Sequence Flow · Prism Omni<\/title>/);
  assert.equal(/Antigravity/i.test(tabHtml), false, 'Workbench HTML must never include host title keyword Antigravity');

  const tabEnv = bootRenderedWorkbenchInVm(tabHtml, {
    topLevelTab: true,
    locationHref: `http://127.0.0.1:43199/viewer?token=t1&kind=mermaid#raw=${encodeURIComponent(svg1)}`,
  });
  await tabEnv.settle();
  tabEnv.flushRaf(2);
  assert.equal(tabEnv.doc.title, 'Sequence Flow · Prism Omni');
  assert.match(tabEnv.pillsEl.textContent, /280×90/);
  assert.equal(tabEnv.parentMessages.length, 0, 'top-level Browser Tab must not postMessage to itself');

  // Dynamic #raw=... hashchange updates Mermaid canvas in-place without full reload
  tabEnv.win.location.hash = `#raw=${encodeURIComponent(svg2)}&title=Updated%20Flow`;
  tabEnv.win.dispatchWindowEvent('hashchange');
  await tabEnv.settle();
  tabEnv.flushRaf(2);
  assert.equal(tabEnv.doc.title, 'Updated Flow · Prism Omni');
  assert.match(tabEnv.pillsEl.textContent, /640×360/);

  // 7. style.css preserves transparent browser-hole cutout for host native wcvBrowser
  const styleCss = fs.readFileSync(path.resolve(__dirname, '../style.css'), 'utf8');
  assert.match(styleCss, /body:not\(\[data-has-browser-hole="true"\]\)/);
  assert.match(styleCss, /\.agy-shell[\s\S]{0,120}:not\(\[data-has-browser-hole="true"\]\)/);
  assert.match(styleCss, /\.browser-hole-ancestor\[data-has-browser-hole="true"\][\s\S]{0,360}background-color:transparent !important/);
});

test('Compliance & copy hygiene: zero machine path leaks, zero secret patterns, zero hyperbolic copy', () => {
  const bannedPatterns = [
    new RegExp(['work', 'space_', 'program'].join(''), 'i'),
    new RegExp(['Users', 'Administrator'].join('\\\\'), 'i'),
    new RegExp(['ema', '_', 'persona'].join(''), 'i'),
    new RegExp(['\\bs', 'k-[A-Za-z0-9]{10,}'].join('')),
    new RegExp(
      [
        ['宇宙', '第一'].join(''),
        ['颠覆', '性'].join(''),
        ['史诗', '级'].join(''),
        ['吊', '打'].join(''),
        ['遥遥', '领先'].join(''),
        ['黑科', '技'].join(''),
      ].join('|')
    ),
  ];

  for (const file of [WORKBENCH_FILE, SELF_TEST_FILE]) {
    const content = fs.readFileSync(file, 'utf8');
    for (const re of bannedPatterns) {
      assert.equal(re.test(content), false, `compliance check failed (${re}) in ${path.basename(file)}`);
    }
  }
});

test('WO-MAIN-001C: omni-client pre-paints dark overlay against white flash & workbench-page syncs --ag-cs-tonal-* + --font-sans', async () => {
  const clientSrc = fs.readFileSync(path.resolve(__dirname, '../vendor/omni-viewer/omni-client.js'), 'utf8');
  assert.ok(clientSrc.includes('opacity:0;transition:opacity 140ms ease'), 'omni-client overlay must start hidden until ready to prevent white flash');
  assert.ok(clientSrc.includes('data-wb-ready="1"'), 'omni-client overlay must reveal via data-wb-ready="1"');
  assert.ok(clientSrc.includes('ag-prism-workbench-ready'), 'omni-client must listen for ag-prism-workbench-ready');

  const html = renderWorkbenchHtml({ kind: 'text', name: 'demo.md' });
  assert.ok(html.includes('Google Sans'), 'workbench-page must default to zero-external Google Sans stack');
  assert.ok(html.includes('ag-prism-workbench-ready'), 'workbench-page must notify parent when ready');

  const env = bootRenderedWorkbenchInVm(html, {
    locationHref: 'http://127.0.0.1:43199/viewer?token=t1&kind=text',
  });
  await env.settle();
  env.win.dispatchWindowEvent('message', {
    source: env.win.parent,
    data: {
      type: 'theme-change',
      payload: {
        themeType: 'dark',
        cssVariables: {
          '--ag-cs-tonal-0': '#09090b',
          '--ag-cs-tonal-1': '#0e0e11',
          '--ag-cs-tonal-2': '#151519',
          '--ag-cs-tonal-3': '#1c1c22',
          '--font-sans': "'Google Sans', sans-serif",
        },
      },
    },
  });
  assert.equal(env.htmlEl.style.getPropertyValue('--wb-bg'), '#09090b');
  assert.equal(env.htmlEl.style.getPropertyValue('--wb-surface'), '#0e0e11');
  assert.equal(env.htmlEl.style.getPropertyValue('--wb-panel'), '#151519');
  assert.equal(env.htmlEl.style.getPropertyValue('--wb-elevated'), '#1c1c22');
  assert.equal(env.htmlEl.style.getPropertyValue('--wb-font-sans'), "'Google Sans', sans-serif");
});

test('Battle 3: strict HTML sandbox="allow-scripts", srcdoc CSP meta, /sandbox-init fail-closed, SVG light/dark checker & XSS strip, and full 8+1 locales (0 CJK in non-CJK)', async () => {
  // 1. HTML iframe sandbox MUST strictly equal 'allow-scripts' + referrerpolicy='no-referrer' + sandbox badge
  const htmlFilePage = renderWorkbenchHtml({
    baseUrl: 'http://127.0.0.1:43199',
    token: 'tok-b3-html',
    path: '/workspace/demo.html',
    lang: 'en',
  });
  const htmlEnv = bootRenderedWorkbenchInVm(htmlFilePage, {
    onFetch: async (url) => {
      if (url.includes('/meta')) {
        return {
          ok: true,
          async json() {
            return { ok: true, name: 'demo.html', size: 128, mime: 'text/html', textSlice: '<h1>Demo</h1><script>1+1</script>' };
          },
        };
      }
      if (url.includes('/sandbox-init')) {
        return {
          ok: true,
          async json() {
            return { ok: true, url: '/sandbox/subtok99/m1/demo.html' };
          },
        };
      }
      return null;
    },
  });
  await htmlEnv.settle();

  const htmlFrame = htmlEnv.stageEl.querySelector('.wb-sandbox-frame');
  assert.ok(htmlFrame);
  assert.equal(htmlFrame.getAttribute('sandbox'), 'allow-scripts', 'HTML iframe sandbox must strictly equal allow-scripts');
  assert.equal(htmlFrame.getAttribute('referrerpolicy'), 'no-referrer', 'HTML iframe must set referrerpolicy="no-referrer"');
  for (const forbidden of ['allow-same-origin', 'allow-top-navigation', 'allow-popups', 'allow-forms', 'allow-modals']) {
    assert.equal(htmlFrame.getAttribute('sandbox').includes(forbidden), false, `HTML sandbox must never contain ${forbidden}`);
  }
  const htmlBadge = htmlEnv.toolsEl.querySelector('.wb-sandbox-badge');
  assert.ok(htmlBadge, 'HTML toolbar must show sandbox isolation badge');
  assert.equal(htmlBadge.textContent, 'Sandbox Isolated');

  // 2. HTML srcdoc mode injects connect-src 'none'; form-action 'none' CSP meta while keeping raw source unmodified
  const rawHtml = '<!doctype html><html><body><div id="a">hi</div><script>window.x=1;</script></body></html>';
  const srcdocPage = renderWorkbenchHtml({
    kind: 'html',
    lang: 'zh-CN',
    rawContent: rawHtml,
  });
  const srcdocEnv = bootRenderedWorkbenchInVm(srcdocPage);
  await srcdocEnv.settle();
  const srcdocFrame = srcdocEnv.stageEl.querySelector('.wb-sandbox-frame');
  assert.ok(srcdocFrame);
  assert.equal(srcdocFrame.getAttribute('sandbox'), 'allow-scripts');
  assert.equal(srcdocFrame.getAttribute('referrerpolicy'), 'no-referrer');
  assert.ok(
    String(srcdocFrame.srcdoc || '').includes('<meta http-equiv="Content-Security-Policy" content="connect-src \'none\'; form-action \'none\'">'),
    'srcdoc must inject strict connect-src/form-action CSP meta'
  );
  assert.ok(String(srcdocFrame.srcdoc || '').includes('<script>window.x=1;</script>'), 'srcdoc must preserve inline script animations');
  const srcdocSourcePane = srcdocEnv.stageEl.querySelector('.wb-source-pane');
  assert.equal(srcdocSourcePane.textContent, rawHtml, 'Source view must preserve original HTML unmodified');

  // 3. /sandbox-init failure must NEVER downgrade to /stream
  const failFetches = [];
  const failPage = renderWorkbenchHtml({
    baseUrl: 'http://127.0.0.1:43199',
    token: 'tok-fail',
    path: '/workspace/broken.html',
    lang: 'en',
  });
  const failEnv = bootRenderedWorkbenchInVm(failPage, {
    onFetch: async (url) => {
      failFetches.push(url);
      if (url.includes('/meta')) {
        return { ok: true, async json() { return { ok: true, name: 'broken.html', size: 32, mime: 'text/html' }; } };
      }
      if (url.includes('/sandbox-init')) {
        return { ok: false, status: 500, async json() { return { ok: false, error: 'mount failed' }; } };
      }
      return null;
    },
  });
  await failEnv.settle();
  assert.equal(failFetches.some((u) => u.includes('/stream')), false, '/sandbox-init failure must never fall back to /stream');
  assert.ok(failEnv.stageEl.querySelector('.wb-empty'), '/sandbox-init failure must render .wb-empty error box');

  // 4. SVG file stage: XSS stripping + light/dark transparent checkerboard switching + Fit/1:1/+/- zoom + sandbox badge
  let svgMetaCalls = 0;
  const svgPage = renderWorkbenchHtml({
    baseUrl: 'http://127.0.0.1:43199',
    token: 'tok-svg',
    path: '/assets/logo.svg',
    lang: 'zh-CN',
  });
  const svgEnv = bootRenderedWorkbenchInVm(svgPage, {
    onFetch: async (url) => {
      if (url.includes('/meta')) {
        svgMetaCalls += 1;
        return {
          ok: true,
          async json() {
            return {
              ok: true,
              name: 'logo.svg',
              size: 256,
              mime: 'image/svg+xml',
              textSlice:
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80" onload="xss()">' +
                '<script>alert(1)</script><foreignObject><div>evil</div></foreignObject>' +
                '<rect width="120" height="80" fill="#669DF6"/></svg>',
            };
          },
        };
      }
      return null;
    },
  });
  await svgEnv.settle();
  svgEnv.flushRaf(2);

  const svgViewport = svgEnv.stageEl.querySelector('.wb-panzoom-viewport');
  const svgLayer = svgEnv.stageEl.querySelector('.wb-panzoom-layer');
  assert.ok(svgViewport && svgLayer);
  assert.equal(svgViewport.getAttribute('data-backdrop'), 'checker');
  assert.ok(!/<script|onload|foreignObject/i.test(svgLayer.innerHTML), 'SVG DOM must strip script/onload/foreignObject');
  assert.ok(svgLayer.innerHTML.includes('<rect'), 'Safe SVG geometry must remain');
  const svgBadge = svgEnv.toolsEl.querySelector('.wb-sandbox-badge');
  assert.ok(svgBadge);
  assert.equal(svgBadge.textContent, '沙盒隔离');

  const svgBtns = svgEnv.toolsEl.querySelectorAll('button');
  for (const bgId of ['checker-light', 'checker-dark', 'dark', 'light', 'checker']) {
    const btn = svgBtns.find((b) => b.getAttribute('data-bg-id') === bgId);
    assert.ok(btn, `SVG toolbar must include backdrop button data-bg-id="${bgId}"`);
    btn.click();
    assert.equal(svgViewport.getAttribute('data-backdrop'), bgId);
  }

  const tfBeforeZoom = svgLayer.style.transform;
  svgBtns.find((b) => b.textContent === '+').click();
  assert.notEqual(svgLayer.style.transform, tfBeforeZoom, '+ zoom button must update transform');
  const tfAfterZoomIn = svgLayer.style.transform;
  svgBtns.find((b) => b.textContent === '−').click();
  assert.notEqual(svgLayer.style.transform, tfAfterZoomIn, '− zoom button must update transform');
  svgBtns.find((b) => b.textContent === '1:1').click();
  assert.match(svgEnv.toolsEl.textContent, /100%/);
  svgBtns.find((b) => b.textContent === '适应窗口').click();

  // Visible-state reload message refreshes once; hidden-state skips refresh
  const callsBeforeReload = svgMetaCalls;
  svgEnv.doc.visibilityState = 'hidden';
  svgEnv.win.postMessageToSelf({ type: 'ag-prism-workbench-reload', path: '/assets/logo.svg' });
  await svgEnv.settle();
  assert.equal(svgMetaCalls, callsBeforeReload, 'Hidden document must ignore reload message');
  svgEnv.doc.visibilityState = 'visible';
  svgEnv.win.postMessageToSelf({ type: 'ag-prism-workbench-reload', path: '/assets/logo.svg' });
  await svgEnv.settle();
  assert.equal(svgMetaCalls, callsBeforeReload + 1, 'Visible document must reload on parent reload message');

  // 5. Full 8+1 locales coverage & strict 0 CJK in non-CJK locales (en/ko/es/fr/de)
  const cjkRe = /[\u3400-\u9FFF\uF900-\uFAFF]/;
  const localeCols = ['zh-CN', 'zh-TW', 'yue', 'en', 'ja', 'ko', 'es', 'fr', 'de'];
  for (const [key, row] of Object.entries(WORKBENCH_I18N)) {
    assert.equal(row.length, localeCols.length, `WORKBENCH_I18N.${key} must provide all 9 locale columns`);
    for (let i = 0; i < localeCols.length; i++) {
      assert.ok(typeof row[i] === 'string' && row[i].length > 0, `WORKBENCH_I18N.${key}[${localeCols[i]}] must be non-empty`);
      if (['en', 'ko', 'es', 'fr', 'de'].includes(localeCols[i])) {
        assert.equal(cjkRe.test(row[i]), false, `WORKBENCH_I18N.${key}[${localeCols[i]}] must contain 0 CJK chars: ${row[i]}`);
      }
    }
  }

  for (const [lang, expectedBadge, expectedLightChecker] of [
    ['ko', '샌드박스 격리', '밝은 체커'],
    ['es', 'Aislado en sandbox', 'Damero claro'],
    ['fr', 'Isolé en sandbox', 'Damier clair'],
    ['de', 'Sandbox-isoliert', 'Helles Raster'],
  ]) {
    const p = renderWorkbenchHtml({
      kind: 'svg',
      lang,
      rawContent: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg>',
    });
    assert.ok(p.includes(`<html lang="${lang}"`), `renderWorkbenchHtml must emit lang="${lang}"`);
    const e = bootRenderedWorkbenchInVm(p);
    await e.settle();
    assert.equal(e.toolsEl.querySelector('.wb-sandbox-badge')?.textContent, expectedBadge);
    assert.ok(
      e.toolsEl.querySelectorAll('button').some((b) => b.textContent === expectedLightChecker),
      `${lang} toolbar must render localized light checkerboard label`
    );
  }
});

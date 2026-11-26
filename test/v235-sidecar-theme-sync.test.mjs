import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const enhancerMod = require(path.join(ROOT, 'host-workbench-enhancer.js'));
const cdp = require(path.join(ROOT, 'cdp.js'));

function createFakeDom() {
  const attrsMap = new WeakMap();
  class FakeNode {
    constructor(nodeType, tagName = '') {
      this.nodeType = nodeType;
      this.tagName = tagName ? tagName.toUpperCase() : '';
      this.childNodes = [];
      this.parentNode = null;
      this.ownerDocument = null;
      this._listeners = new Map();
      this.dataset = {};
      this.hidden = false;
      this.style = {
        _props: new Map(),
        setProperty(k, v) { this._props.set(k, String(v)); },
        getPropertyValue(k) { return this._props.get(k) || ''; },
        removeProperty(k) { this._props.delete(k); },
      };
      this.classList = {
        _set: new Set(),
        add: (...cs) => cs.forEach((c) => { if (c) this.classList._set.add(c); this._syncClass(); }),
        remove: (...cs) => cs.forEach((c) => { this.classList._set.delete(c); this._syncClass(); }),
        toggle: (c, f) => {
          const on = f === undefined ? !this.classList._set.has(c) : Boolean(f);
          if (on) this.classList._set.add(c); else this.classList._set.delete(c);
          this._syncClass();
          return on;
        },
        contains: (c) => this.classList._set.has(c),
      };
      attrsMap.set(this, new Map());
    }
    _syncClass() { attrsMap.get(this).set('class', [...this.classList._set].join(' ')); }
    get parentElement() { return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null; }
    get children() { return this.childNodes.filter((c) => c.nodeType === 1); }
    get firstChild() { return this.childNodes[0] || null; }
    get firstElementChild() { return this.children[0] || null; }
    get lastElementChild() { return this.children[this.children.length - 1] || null; }
    get nextSibling() {
      if (!this.parentNode) return null;
      const idx = this.parentNode.childNodes.indexOf(this);
      return idx >= 0 ? this.parentNode.childNodes[idx + 1] || null : null;
    }
    get nextElementSibling() {
      let cur = this.nextSibling;
      while (cur && cur.nodeType !== 1) cur = cur.nextSibling;
      return cur || null;
    }
    get isConnected() {
      let cur = this;
      while (cur) {
        if (cur === doc.documentElement) return true;
        cur = cur.parentNode;
      }
      return false;
    }
    get className() { return this.getAttribute('class') || ''; }
    set className(v) {
      this.classList._set.clear();
      String(v || '').split(/\s+/).filter(Boolean).forEach((c) => this.classList._set.add(c));
      this._syncClass();
    }
    get id() { return this.getAttribute('id') || ''; }
    set id(v) { this.setAttribute('id', v); }
    get textContent() {
      if (this.nodeType === 3) return this.nodeValue || '';
      return this.childNodes.map((c) => c.textContent).join('');
    }
    set textContent(v) {
      if (this.nodeType === 3) { this.nodeValue = String(v ?? ''); return; }
      for (const c of this.childNodes) c.parentNode = null;
      this.childNodes = [];
      const s = String(v ?? '');
      if (s) this.appendChild(doc.createTextNode(s));
    }
    setAttribute(k, v) {
      const val = String(v);
      attrsMap.get(this).set(k, val);
      if (k === 'class') {
        this.classList._set.clear();
        val.split(/\s+/).filter(Boolean).forEach((c) => this.classList._set.add(c));
      }
    }
    getAttribute(k) { const m = attrsMap.get(this); return m.has(k) ? m.get(k) : null; }
    hasAttribute(k) { return attrsMap.get(this).has(k); }
    removeAttribute(k) { attrsMap.get(this).delete(k); }
    appendChild(child) {
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      child.ownerDocument = doc;
      this.childNodes.push(child);
      return child;
    }
    insertBefore(child, ref) {
      if (!ref) return this.appendChild(child);
      if (child.parentNode) child.parentNode.removeChild(child);
      const idx = this.childNodes.indexOf(ref);
      child.parentNode = this;
      child.ownerDocument = doc;
      if (idx < 0) this.childNodes.push(child);
      else this.childNodes.splice(idx, 0, child);
      return child;
    }
    removeChild(child) {
      const idx = this.childNodes.indexOf(child);
      if (idx >= 0) { this.childNodes.splice(idx, 1); child.parentNode = null; }
      return child;
    }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
    contains(other) {
      let cur = other;
      while (cur) { if (cur === this) return true; cur = cur.parentNode; }
      return false;
    }
    addEventListener(type, fn) {
      if (!this._listeners.has(type)) this._listeners.set(type, []);
      this._listeners.get(type).push(fn);
    }
    removeEventListener(type, fn) {
      const arr = this._listeners.get(type);
      if (!arr) return;
      const i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
    }
    matches(sel) { return matchesSelector(this, sel); }
    closest(sel) {
      let cur = this;
      while (cur && cur.nodeType === 1) {
        if (matchesSelector(cur, sel)) return cur;
        cur = cur.parentElement;
      }
      return null;
    }
    querySelectorAll(sel) {
      const out = [];
      const walk = (n) => {
        for (const c of n.childNodes) {
          if (c.nodeType === 1) {
            if (matchesSelector(c, sel)) out.push(c);
            walk(c);
          }
        }
      };
      walk(this);
      return out;
    }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    getElementsByTagName(tag) {
      const want = String(tag || '').toUpperCase();
      const out = [];
      const walk = (n) => {
        for (const c of n.childNodes) {
          if (c.nodeType === 1) {
            if (want === '*' || c.tagName === want) out.push(c);
            walk(c);
          }
        }
      };
      walk(this);
      return out;
    }
    getBoundingClientRect() { return { left: 0, top: 0, width: 480, height: 640, right: 480, bottom: 640 }; }
    getContext() { return null; }
  }

  function matchSingle(el, raw) {
    const s = raw.trim();
    if (!s) return false;
    if (s.includes(' ')) {
      const parts = s.split(/\s+/);
      if (!matchSingle(el, parts[parts.length - 1])) return false;
      let cur = el.parentElement;
      for (let i = parts.length - 2; i >= 0; i--) {
        let found = false;
        while (cur) {
          if (matchSingle(cur, parts[i])) { found = true; cur = cur.parentElement; break; }
          cur = cur.parentElement;
        }
        if (!found) return false;
      }
      return true;
    }
    let rest = s;
    const tagMatch = /^[a-zA-Z0-9-]+/.exec(rest);
    if (tagMatch) {
      if (el.tagName !== tagMatch[0].toUpperCase()) return false;
      rest = rest.slice(tagMatch[0].length);
    }
    while (rest) {
      if (rest[0] === '.') {
        const m = /^\.([a-zA-Z0-9_-]+)/.exec(rest);
        if (!m || !el.classList.contains(m[1])) return false;
        rest = rest.slice(m[0].length);
      } else if (rest[0] === '#') {
        const m = /^#([a-zA-Z0-9_-]+)/.exec(rest);
        if (!m || el.id !== m[1]) return false;
        rest = rest.slice(m[0].length);
      } else if (rest[0] === '[') {
        const m = /^\[([a-zA-Z0-9_-]+)(?:(\^=|=)["']?([^\]"']*)["']?)?\]/.exec(rest);
        if (!m) return false;
        const [, ak, op, av] = m;
        const cur = el.getAttribute(ak);
        if (!op) { if (!el.hasAttribute(ak)) return false; }
        else if (op === '=') { if (cur !== av) return false; }
        else if (op === '^=') { if (!cur || !cur.startsWith(av)) return false; }
        rest = rest.slice(m[0].length);
      } else {
        return false;
      }
    }
    return true;
  }
  function matchesSelector(el, sel) {
    if (!el || el.nodeType !== 1) return false;
    return String(sel || '').split(',').some((part) => matchSingle(el, part));
  }

  const doc = {
    nodeType: 9,
    readyState: 'complete',
    hidden: false,
    _listeners: new Map(),
    createElement(tag) {
      const n = new FakeNode(1, tag);
      n.ownerDocument = doc;
      return n;
    },
    createTextNode(txt) {
      const n = new FakeNode(3);
      n.nodeValue = String(txt ?? '');
      n.ownerDocument = doc;
      return n;
    },
    getElementById(id) { return doc.documentElement.querySelector(`#${id}`); },
    querySelector(sel) { return doc.documentElement.querySelector(sel); },
    querySelectorAll(sel) { return doc.documentElement.querySelectorAll(sel); },
    addEventListener(type, fn) {
      if (!this._listeners.has(type)) this._listeners.set(type, []);
      this._listeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const arr = this._listeners.get(type);
      if (!arr) return;
      const i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
    },
  };
  doc.documentElement = doc.createElement('html');
  doc.head = doc.createElement('head');
  doc.body = doc.createElement('body');
  doc.documentElement.appendChild(doc.head);
  doc.documentElement.appendChild(doc.body);
  return { doc };
}

test('v2.35.1: host-workbench-enhancer sync({ l: true }) pushes theme to dynamically mounted sidecar iframes without route/theme switch', () => {
  const { doc } = createFakeDom();
  doc.documentElement.setAttribute('data-ag-cs-theme', 'dark');
  doc.documentElement.setAttribute('data-ag-cs-palette', 'obsidian');
  const vars = {
    '--background': '#0B0B0E',
    '--foreground': '#F2F2F5',
    '--primary': '#669DF6',
    'color-scheme': 'dark',
  };
  const win = {
    document: doc,
    location: { origin: 'https://127.0.0.1:7020' },
    getComputedStyle: () => ({ getPropertyValue: (k) => vars[k] || '' }),
    addEventListener() {},
    removeEventListener() {},
  };
  doc.defaultView = win;

  const ctl = enhancerMod.createHostEnhancerController({
    doc,
    win,
    getConfig: () => ({ palette: 'obsidian', lightPreset: 'crystal', accentTone: 'follow' }),
  });

  try {
    // Initial full sync before any sidecar panel is opened
    ctl.sync();
    assert.equal(ctl.getDebugState().postMessageCount, 0);

    // Simulate Antigravity v2.35.1 auto-opening a plugin panel link inside side panel mid-conversation
    const slot = doc.createElement('div');
    slot.setAttribute('data-testid', 'sidecar-iframe-slot');
    const iframe = doc.createElement('iframe');
    iframe.setAttribute('data-testid', 'sidecar-iframe');
    iframe.setAttribute('src', 'plugin://partner-analytics--panel/');
    const posted = [];
    iframe.contentWindow = {
      postMessage(msg, targetOrigin) {
        posted.push({ msg, targetOrigin });
      },
    };
    slot.appendChild(iframe);
    doc.body.appendChild(slot);

    // Only dirtyFlags.l is raised by ui-runtime when a sidecar iframe mounts mid-conversation
    ctl.sync({ l: true });
    assert.equal(posted.length, 1, 'newly mounted plugin sidecar iframe must immediately receive theme-change on { l: true }');
    assert.equal(posted[0].msg.type, 'theme-change');
    assert.equal(posted[0].msg.payload.themeType, 'dark');
    assert.equal(posted[0].msg.payload.cssVariables['--background'], '#0B0B0E');
    assert.equal(posted[0].targetOrigin, '*');

    // Subsequent { l: true } sync with unchanged theme & iframe must remain zero-overhead (deduped)
    ctl.sync({ l: true });
    assert.equal(posted.length, 1, 'already-synced sidecar iframe must not receive redundant postMessage');
  } finally {
    ctl.destroy();
  }
});

test('v2.35.1: ui-runtime MutationObserver routes mid-conversation sidecar-iframe-slot mount to theme bridge', async () => {
  const { doc } = createFakeDom();
  const conv = doc.createElement('div');
  conv.setAttribute('data-testid', 'conversation-view');
  conv.setAttribute('data-cascade-id', '22222222-2222-2222-2222-222222222222');
  doc.body.appendChild(conv);

  const sidePanel = doc.createElement('div');
  sidePanel.setAttribute('data-testid', 'side-panel');
  doc.body.appendChild(sidePanel);

  const observers = [];
  class MockMutationObserver {
    constructor(cb) {
      this.cb = cb;
      this.targets = [];
      observers.push(this);
    }
    observe(target, opts) { this.targets.push({ target, opts }); }
    disconnect() { this.targets = []; }
    takeRecords() { return []; }
    trigger(records) { this.cb(records, this); }
  }

  const vars = {
    '--background': '#0B0B0E',
    '--foreground': '#F2F2F5',
    '--primary': '#669DF6',
    'color-scheme': 'dark',
  };
  const store = new Map();
  const rafCallbacks = [];
  const sandbox = {
    window: null,
    globalThis: null,
    document: doc,
    console,
    setTimeout,
    clearTimeout,
    setInterval: () => 0,
    clearInterval: () => {},
    performance: { now: () => Date.now() },
    navigator: { language: 'en' },
    location: {
      origin: 'https://127.0.0.1:7020',
      href: 'https://127.0.0.1:7020/c/22222222-2222-2222-2222-222222222222',
      pathname: '/c/22222222-2222-2222-2222-222222222222',
    },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    requestAnimationFrame: (fn) => {
      rafCallbacks.push(fn);
      return rafCallbacks.length;
    },
    cancelAnimationFrame: () => {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    getComputedStyle: () => ({
      display: 'block',
      visibility: 'visible',
      opacity: '1',
      position: 'static',
      getPropertyValue: (k) => vars[k] || '',
    }),
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
    MutationObserver: MockMutationObserver,
    HTMLElement: Object,
    Element: Object,
    Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  doc.defaultView = sandbox;

  const expr = cdp.buildInjectExpression({ ...cdp.DEFAULT_CONFIG, hostLocalization: 'off', language: 'en' });
  assert.ok(Buffer.byteLength(expr, 'utf8') < 580000, 'Channel 1 payload must remain under 580,000 B budget');
  const res = vm.runInNewContext(expr, sandbox);
  assert.equal(res.status, 'ok');

  const flushRafs = () => {
    let guard = 0;
    while (rafCallbacks.length && guard++ < 12) {
      const batch = rafCallbacks.splice(0);
      for (const fn of batch) fn(Date.now());
    }
  };

  try {
    flushRafs();
    const mainObs = observers.find((o) => o.targets.some((t) => t.target === doc.documentElement));
    assert.ok(mainObs, 'ui-runtime main MutationObserver must be active');

    // Insert a plugin panel slot containing a plain iframe (without data-testid on the iframe itself)
    const slot = doc.createElement('div');
    slot.setAttribute('data-testid', 'sidecar-iframe-slot');
    const iframe = doc.createElement('iframe');
    iframe.setAttribute('src', 'plugin://clickup--tasks/');
    const posted = [];
    iframe.contentWindow = {
      postMessage(msg, targetOrigin) {
        posted.push({ msg, targetOrigin });
      },
    };
    slot.appendChild(iframe);
    sidePanel.appendChild(slot);

    mainObs.trigger([{ type: 'childList', target: sidePanel, addedNodes: [slot], removedNodes: [] }]);
    flushRafs();
    await new Promise((r) => setTimeout(r, 20));
    flushRafs();

    assert.equal(posted.length, 1, 'ui-runtime must forward sidecar-iframe-slot mount to host-workbench-enhancer theme bridge');
    assert.equal(posted[0].msg.type, 'theme-change');
    assert.equal(posted[0].msg.payload.themeType, 'dark');
  } finally {
    sandbox.__agPrism?.destroy?.();
  }
});

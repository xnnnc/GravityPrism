import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const PERIODIC_DIR = path.join(ROOT_DIR, 'vendor', 'periodic-picker');
const require = createRequire(import.meta.url);
const cdp = require(path.join(ROOT_DIR, 'cdp.js'));

const PERIODIC_MODULES = [
  'pbr-grain-assets.js',
  'audio-fx.js',
  'model-catalog.js',
  'host-bridge.js',
  'oled-cyber-screen.js',
  'keyboard-3d-gl.js',
  'bento-ui.js',
  'periodic-picker.js',
];

function createDomSandbox({ pathname = '/conv-1' } = {}) {
  let nowMs = 20000;
  let nextTimerId = 1;
  let nextIntervalId = 1;
  let nextRafId = 1;
  const timers = new Map();
  const intervals = new Map();
  const rafs = new Map();
  const observers = new Set();
  const observedCalls = [];
  const docCap = new Map();
  const docBub = new Map();
  const winCap = new Map();
  const winBub = new Map();

  function splitSel(sel) {
    return String(sel || '').split(',').map((s) => s.trim()).filter(Boolean);
  }
  function matchCompound(el, part) {
    if (!el || el.nodeType !== 1 || !part) return false;
    let rest = part;
    const tagM = /^[a-zA-Z0-9_-]+/.exec(rest);
    if (tagM) {
      if (el.tagName !== tagM[0].toUpperCase()) return false;
      rest = rest.slice(tagM[0].length);
    }
    const toks = rest.match(/#[a-zA-Z0-9_-]+|\.[a-zA-Z0-9_-]+|\[[^\]]+\]/g) || [];
    if (toks.join('') !== rest) return false;
    for (const t of toks) {
      if (t[0] === '#') {
        if (el.id !== t.slice(1)) return false;
      } else if (t[0] === '.') {
        if (!el.classList.contains(t.slice(1))) return false;
      } else {
        const inner = t.slice(1, -1);
        const eq = inner.indexOf('=');
        if (eq === -1) {
          if (!el.hasAttribute(inner.trim())) return false;
        } else {
          let k = inner.slice(0, eq).trim();
          const want = inner.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
          if (k.endsWith('*')) {
            k = k.slice(0, -1);
            if (!(el.getAttribute(k) || '').includes(want)) return false;
          } else if (el.getAttribute(k) !== want) {
            return false;
          }
        }
      }
    }
    return true;
  }
  function matchSimple(el, sel) {
    const parts = String(sel || '').trim().split(/\s+/);
    if (!parts[0]) return false;
    if (!matchCompound(el, parts[parts.length - 1])) return false;
    let cur = el.parentElement;
    for (let i = parts.length - 2; i >= 0; i -= 1) {
      while (cur && !matchCompound(cur, parts[i])) cur = cur.parentElement;
      if (!cur) return false;
      cur = cur.parentElement;
    }
    return true;
  }
  function matches(el, sel) {
    return splitSel(sel).some((s) => matchSimple(el, s));
  }

  function createEvent(type, init = {}, target = null) {
    return {
      type,
      target,
      currentTarget: null,
      button: init.button ?? 0,
      pointerId: init.pointerId ?? 1,
      pointerType: init.pointerType ?? 'mouse',
      clientX: init.clientX ?? 0,
      clientY: init.clientY ?? 0,
      key: init.key ?? '',
      ctrlKey: Boolean(init.ctrlKey),
      metaKey: Boolean(init.metaKey),
      altKey: Boolean(init.altKey),
      shiftKey: Boolean(init.shiftKey),
      bubbles: init.bubbles !== false,
      cancelable: init.cancelable !== false,
      defaultPrevented: false,
      propagationStopped: false,
      immediatePropagationStopped: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.propagationStopped = true; },
      stopImmediatePropagation() { this.propagationStopped = true; this.immediatePropagationStopped = true; },
    };
  }

  function createTextNode(text) {
    return {
      nodeType: 3,
      nodeValue: String(text ?? ''),
      parentNode: null,
      parentElement: null,
      get textContent() { return this.nodeValue; },
      set textContent(v) { this.nodeValue = String(v ?? ''); },
    };
  }

  function makeEl(tag, { id = '', className = '', attrs = {}, text = '', rect = null } = {}) {
    const attrMap = new Map(Object.entries(attrs));
    const classSet = new Set(String(className).split(/\s+/).filter(Boolean));
    const listeners = { capture: new Map(), bubble: new Map() };
    const children = [];
    const childNodes = [];
    const styleProps = {};
    const boxRect = rect || { left: 100, top: 100, right: 260, bottom: 132, width: 160, height: 32 };
    const node = {
      nodeType: 1,
      tagName: String(tag).toUpperCase(),
      id,
      type: '',
      hidden: false,
      disabled: attrMap.has('disabled'),
      children,
      childNodes,
      parentNode: null,
      parentElement: null,
      width: 640,
      height: 360,
      scrollTop: 0,
      scrollHeight: 0,
      clientHeight: 0,
      get isConnected() {
        let cur = this;
        while (cur) {
          if (cur === doc.documentElement) return true;
          cur = cur.parentNode;
        }
        return false;
      },
      style: {
        setProperty(k, v) { styleProps[k] = String(v); },
        getPropertyValue(k) { return styleProps[k] || ''; },
        removeProperty(k) { delete styleProps[k]; },
        get display() { return styleProps.display || ''; },
        set display(v) { styleProps.display = String(v); },
      },
      classList: {
        add: (...cs) => cs.forEach((c) => c && classSet.add(c)),
        remove: (...cs) => cs.forEach((c) => classSet.delete(c)),
        toggle: (c, f) => {
          const on = f === undefined ? !classSet.has(c) : Boolean(f);
          if (on) classSet.add(c); else classSet.delete(c);
          return on;
        },
        contains: (c) => classSet.has(c),
      },
      get className() { return Array.from(classSet).join(' '); },
      set className(v) {
        classSet.clear();
        String(v || '').split(/\s+/).filter(Boolean).forEach((c) => classSet.add(c));
      },
      get textContent() {
        return childNodes.map((c) => (c.nodeType === 3 ? c.nodeValue : c.textContent)).join('');
      },
      set textContent(v) {
        for (const c of childNodes) { c.parentNode = null; c.parentElement = null; }
        childNodes.length = 0;
        children.length = 0;
        const s = String(v ?? '');
        if (s) this.appendChild(createTextNode(s));
      },
      get firstChild() { return childNodes[0] || null; },
      get firstElementChild() { return children[0] || null; },
      get nextSibling() {
        if (!this.parentNode) return null;
        const list = this.parentNode.childNodes || [];
        const i = list.indexOf(this);
        return i >= 0 ? list[i + 1] || null : null;
      },
      appendChild(ch) {
        if (ch.parentNode && typeof ch.parentNode.removeChild === 'function') ch.parentNode.removeChild(ch);
        ch.parentNode = this;
        ch.parentElement = this;
        childNodes.push(ch);
        if (ch.nodeType === 1) children.push(ch);
        return ch;
      },
      insertBefore(ch, ref) {
        if (!ref) return this.appendChild(ch);
        if (ch.parentNode && typeof ch.parentNode.removeChild === 'function') ch.parentNode.removeChild(ch);
        ch.parentNode = this;
        ch.parentElement = this;
        const ci = childNodes.indexOf(ref);
        if (ci >= 0) childNodes.splice(ci, 0, ch); else childNodes.push(ch);
        if (ch.nodeType === 1) {
          const ei = children.indexOf(ref);
          if (ei >= 0) children.splice(ei, 0, ch); else children.push(ch);
        }
        return ch;
      },
      removeChild(ch) {
        const ci = childNodes.indexOf(ch);
        if (ci >= 0) childNodes.splice(ci, 1);
        const ei = children.indexOf(ch);
        if (ei >= 0) children.splice(ei, 1);
        ch.parentNode = null;
        ch.parentElement = null;
        return ch;
      },
      remove() { if (this.parentNode) this.parentNode.removeChild(this); },
      setAttribute(k, v) {
        const s = String(v);
        attrMap.set(k, s);
        if (k === 'id') this.id = s;
        if (k === 'class') this.className = s;
        if (k === 'disabled') this.disabled = true;
      },
      getAttribute(k) {
        if (k === 'id' && this.id) return this.id;
        return attrMap.has(k) ? attrMap.get(k) : null;
      },
      hasAttribute(k) {
        if (k === 'id' && this.id) return true;
        return attrMap.has(k);
      },
      removeAttribute(k) {
        attrMap.delete(k);
        if (k === 'id') this.id = '';
        if (k === 'disabled') this.disabled = false;
      },
      contains(other) {
        let cur = other;
        while (cur) { if (cur === this) return true; cur = cur.parentNode; }
        return false;
      },
      matches(sel) { return matches(this, sel); },
      closest(sel) {
        let cur = this;
        while (cur && cur.nodeType === 1) {
          if (matches(cur, sel)) return cur;
          cur = cur.parentElement;
        }
        return null;
      },
      querySelectorAll(sel) {
        const out = [];
        const walk = (n) => {
          for (const ch of n.children) {
            if (matches(ch, sel)) out.push(ch);
            walk(ch);
          }
        };
        walk(this);
        return out;
      },
      querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
      getBoundingClientRect() { return boxRect; },
      focus() { doc.activeElement = this; },
      blur() { if (doc.activeElement === this) doc.activeElement = body; },
      cloneNode(deep) {
        const cp = makeEl(this.tagName, { id: this.id, className: this.className, attrs: Object.fromEntries(attrMap), rect: boxRect });
        if (deep) {
          for (const ch of childNodes) {
            cp.appendChild(ch.nodeType === 3 ? createTextNode(ch.nodeValue) : ch.cloneNode(true));
          }
        }
        return cp;
      },
      addEventListener(type, fn, opts) {
        const cap = typeof opts === 'boolean' ? opts : Boolean(opts && opts.capture);
        const m = cap ? listeners.capture : listeners.bubble;
        if (!m.has(type)) m.set(type, new Set());
        m.get(type).add(fn);
      },
      removeEventListener(type, fn, opts) {
        const cap = typeof opts === 'boolean' ? opts : Boolean(opts && opts.capture);
        const m = cap ? listeners.capture : listeners.bubble;
        m.get(type)?.delete(fn);
      },
      _getListeners(type, cap) {
        const m = cap ? listeners.capture : listeners.bubble;
        return Array.from(m.get(type) || []);
      },
      dispatchEvent(evObj) {
        const ev = evObj && evObj.type ? evObj : createEvent('click', {}, this);
        ev.target = this;
        const chain = [];
        let cur = this;
        while (cur) { chain.unshift(cur); cur = cur.parentNode || null; }
        for (const el of chain) {
          ev.currentTarget = el;
          for (const fn of el._getListeners(ev.type, true)) {
            fn.call(el, ev);
            if (ev.immediatePropagationStopped) return !ev.defaultPrevented;
          }
          if (ev.propagationStopped) return !ev.defaultPrevented;
        }
        for (let i = chain.length - 1; i >= 0; i -= 1) {
          const el = chain[i];
          ev.currentTarget = el;
          for (const fn of el._getListeners(ev.type, false)) {
            fn.call(el, ev);
            if (ev.immediatePropagationStopped) return !ev.defaultPrevented;
          }
          if (ev.propagationStopped || !ev.bubbles) break;
        }
        return !ev.defaultPrevented;
      },
    };
    if (text) node.appendChild(createTextNode(text));
    return node;
  }

  const html = makeEl('html', { attrs: { 'data-ag-cs-theme': 'dark', 'data-ag-cs-lang': 'zh-CN' } });
  const head = makeEl('head');
  const body = makeEl('body', { className: 'monaco-workbench' });
  html.appendChild(head);
  html.appendChild(body);

  const doc = {
    nodeType: 9,
    documentElement: html,
    head,
    body,
    readyState: 'complete',
    hidden: false,
    visibilityState: 'visible',
    activeElement: body,
    createElement: (t) => makeEl(t),
    createElementNS: (_ns, t) => makeEl(t),
    createTextNode: (t) => createTextNode(t),
    getElementById: (id) => (html.id === id ? html : html.querySelector('#' + id)),
    querySelector: (sel) => html.querySelector(sel),
    querySelectorAll: (sel) => html.querySelectorAll(sel),
    addEventListener(type, fn, opts) {
      const cap = typeof opts === 'boolean' ? opts : Boolean(opts && opts.capture);
      const m = cap ? docCap : docBub;
      if (!m.has(type)) m.set(type, new Set());
      m.get(type).add(fn);
    },
    removeEventListener(type, fn, opts) {
      const cap = typeof opts === 'boolean' ? opts : Boolean(opts && opts.capture);
      const m = cap ? docCap : docBub;
      m.get(type)?.delete(fn);
    },
    _getListeners(type, cap) {
      const m = cap ? docCap : docBub;
      return Array.from(m.get(type) || []);
    },
  };
  html.parentNode = doc;

  const countMap = (m) => {
    let n = 0;
    for (const s of m.values()) n += s.size;
    return n;
  };

  const fakeDate = Object.assign(function DateMock(...a) { return new Date(...a); }, { now: () => nowMs });
  const fakeSetTimeout = (fn, ms = 0) => {
    const id = nextTimerId++;
    timers.set(id, { id, fn, runAt: nowMs + Math.max(0, Number(ms) || 0) });
    return id;
  };
  const fakeClearTimeout = (id) => { timers.delete(id); };
  const fakeSetInterval = (fn, ms = 0) => {
    const id = nextIntervalId++;
    const step = Math.max(1, Number(ms) || 1);
    intervals.set(id, { id, fn, step, runAt: nowMs + step });
    return id;
  };
  const fakeClearInterval = (id) => { intervals.delete(id); };
  const fakeRaf = (fn) => {
    const id = nextRafId++;
    rafs.set(id, fn);
    return id;
  };
  const fakeCancelRaf = (id) => { rafs.delete(id); };

  function advanceTime(ms) {
    const target = nowMs + ms;
    while (true) {
      let best = null;
      let kind = '';
      for (const t of timers.values()) {
        if (t.runAt <= target && (!best || t.runAt < best.runAt)) { best = t; kind = 'timeout'; }
      }
      for (const it of intervals.values()) {
        if (it.runAt <= target && (!best || it.runAt < best.runAt)) { best = it; kind = 'interval'; }
      }
      if (!best) break;
      nowMs = best.runAt;
      if (kind === 'timeout') {
        timers.delete(best.id);
        best.fn();
      } else {
        best.runAt += best.step;
        best.fn();
      }
    }
    nowMs = target;
  }

  class MockMO {
    constructor(cb) { this._cb = cb; this._observed = []; }
    observe(target, opts) {
      const entry = { target, opts: opts || {} };
      this._observed.push(entry);
      observedCalls.push(entry);
      observers.add(this);
    }
    disconnect() { this._observed.length = 0; observers.delete(this); }
  }
  function triggerMutations(target, records) {
    for (const obs of Array.from(observers)) {
      if (obs._observed.some((e) => e.target === target)) obs._cb(records, obs);
    }
  }

  const storage = new Map();
  const win = {
    document: doc,
    location: { href: 'vscode-file://vscode-app/index.html', pathname },
    history: { pushState() {}, replaceState() {} },
    performance: { now: () => nowMs },
    navigator: { language: 'zh-CN' },
    devicePixelRatio: 1,
    innerWidth: 1280,
    innerHeight: 800,
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
    },
    getComputedStyle: () => ({ borderRadius: '8px', getPropertyValue: () => '' }),
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    CSS: { supports: () => true },
    MutationObserver: MockMO,
    ResizeObserver: class { observe() {} disconnect() {} },
    KeyboardEvent: class { constructor(type, init = {}) { return createEvent(type, init); } },
    setTimeout: fakeSetTimeout,
    clearTimeout: fakeClearTimeout,
    setInterval: fakeSetInterval,
    clearInterval: fakeClearInterval,
    requestAnimationFrame: fakeRaf,
    cancelAnimationFrame: fakeCancelRaf,
    addEventListener(type, fn, opts) {
      const cap = typeof opts === 'boolean' ? opts : Boolean(opts && opts.capture);
      const m = cap ? winCap : winBub;
      if (!m.has(type)) m.set(type, new Set());
      m.get(type).add(fn);
    },
    removeEventListener(type, fn, opts) {
      const cap = typeof opts === 'boolean' ? opts : Boolean(opts && opts.capture);
      const m = cap ? winCap : winBub;
      m.get(type)?.delete(fn);
    },
  };
  doc.defaultView = win;
  win.window = win;
  win.self = win;
  win.top = win;

  const sandbox = {
    window: win,
    self: win,
    top: win,
    document: doc,
    location: win.location,
    localStorage: win.localStorage,
    navigator: win.navigator,
    performance: win.performance,
    innerWidth: win.innerWidth,
    innerHeight: win.innerHeight,
    devicePixelRatio: 1,
    addEventListener: win.addEventListener.bind(win),
    removeEventListener: win.removeEventListener.bind(win),
    getComputedStyle: win.getComputedStyle,
    matchMedia: win.matchMedia,
    CSS: win.CSS,
    MutationObserver: MockMO,
    ResizeObserver: win.ResizeObserver,
    KeyboardEvent: win.KeyboardEvent,
    Date: fakeDate,
    setTimeout: fakeSetTimeout,
    clearTimeout: fakeClearTimeout,
    setInterval: fakeSetInterval,
    clearInterval: fakeClearInterval,
    requestAnimationFrame: fakeRaf,
    cancelAnimationFrame: fakeCancelRaf,
    Float32Array, Uint16Array, Uint8Array, Uint8ClampedArray, Uint32Array, Int32Array,
    Map, Set, WeakMap, WeakSet, Array, Object, String, Number, Boolean, Math, JSON, RegExp, Error, TypeError, Function, Promise, Intl,
    encodeURIComponent, parseFloat, parseInt, isFinite, isNaN, console,
    atob: (b64) => Buffer.from(String(b64), 'base64').toString('binary'),
  };
  sandbox.globalThis = sandbox;
  win.globalThis = sandbox;
  vm.createContext(sandbox);

  return {
    sandbox,
    win,
    doc,
    html,
    body,
    makeEl,
    createTextNode,
    createEvent,
    advanceTime,
    triggerMutations,
    getObservedCalls: () => observedCalls.slice(),
    getCounts: () => ({
      docListeners: countMap(docCap) + countMap(docBub),
      winListeners: countMap(winCap) + countMap(winBub),
      activeTimers: timers.size,
      activeIntervals: intervals.size,
      activeObservers: observers.size,
    }),
  };
}

test('style.css: zero -webkit-mask:var(--_m0) / background:var(--_x0), 6 CSSOM-safe masks, 0 :has(), 0 non-ASCII & Ch1 9-lang < 549,500 B', () => {
  const css = fs.readFileSync(path.join(ROOT_DIR, 'style.css'), 'utf8');
  assert.equal(css.includes('-webkit-mask:var(--_m0)'), false, 'must not contain CSSOM-dropped -webkit-mask:var(--_m0)');
  assert.equal(css.includes('--_m0'), false, 'must remove obsolete --_m0 token');
  assert.equal(css.includes('background:var(--_x0)'), false, 'must not contain background:var(--_x0) shorthand');
  assert.equal(css.includes('background-color:var(--_x0)'), true, 'input-cancel-button must use background-color:var(--_x0)');
  const safeMasks = css.match(/mask:linear-gradient\(#000 0 0\) content-box exclude,linear-gradient\(#000 0 0\);/g) || [];
  assert.equal(safeMasks.length, 6, 'all 6 border masks must use CSSOM round-trip safe mask syntax');
  assert.equal(/:has\(/.test(css), false, 'style.css must have 0 :has()');
  assert.equal(/[^\x00-\x7F]/.test(css), false, 'style.css must be 100% ASCII');

  const langs = ['auto', 'zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'es', 'fr', 'de'];
  for (const lang of langs) {
    const expr = cdp.buildInjectExpression({ ...cdp.DEFAULT_CONFIG, language: lang }, { bundleCachePath: '' });
    const bytes = Buffer.byteLength(expr, 'utf8');
    assert.ok(bytes < 580000, `Channel 1 (${lang}) must be strictly < 580,000 B, got ${bytes}`);
  }
});

test('model-glyph-crystal & ui-runtime: readButtonLabelWithoutGlyph skips mini-keycap/running suffix; locked/session-switch never misfires Hero D fiber pulse while unlocked same-session switch still fires', () => {
  const env = createDomSandbox({ pathname: '/conv-a' });
  const glyphSrc = fs.readFileSync(path.join(ROOT_DIR, 'model-glyph-crystal.js'), 'utf8');
  vm.runInContext(glyphSrc, env.sandbox);
  const mgc = env.sandbox.__agPrismModelGlyphCrystal;
  assert.ok(mgc && typeof mgc.readButtonLabelWithoutGlyph === 'function');

  // 1) Visible text ignores .ag-cs-model-glyph, .ag-pp-mini-keycap, and running aria-label suffix
  const btn = env.makeEl('button', {
    attrs: {
      'data-testid': 'model-selector-trigger',
      'aria-label': 'Gemini 4 Carbon (High)',
    },
  });
  const glyphSpan = env.makeEl('span', { className: 'ag-cs-model-glyph', text: 'G' });
  const keycapSpan = env.makeEl('span', { className: 'ag-pp-mini-keycap', text: '6C' });
  const labelSpan = env.makeEl('span', { text: 'Gemini 4 Carbon (High)' });
  btn.appendChild(glyphSpan);
  btn.appendChild(keycapSpan);
  btn.appendChild(labelSpan);

  const sigIdle = mgc.readButtonLabelWithoutGlyph(btn);
  assert.equal(sigIdle, 'Gemini 4 Carbon (High)');

  btn.setAttribute('aria-label', 'Gemini 4 Carbon (High), model cannot be changed while agent is running');
  assert.equal(mgc.readButtonLabelWithoutGlyph(btn), sigIdle, 'running aria-label must not mutate visible signature');

  // 2) Empty visible text falls back to data-model-label first, then stripped aria-label
  const emptyBtn = env.makeEl('button', {
    attrs: {
      'data-model-label': 'Gemini 4 Neon (Medium)',
      'aria-label': 'Gemini 4 Neon (Medium), model cannot be changed while running',
    },
  });
  emptyBtn.appendChild(env.makeEl('span', { className: 'ag-pp-mini-keycap', text: '10Ne' }));
  assert.equal(mgc.readButtonLabelWithoutGlyph(emptyBtn), 'Gemini 4 Neon (Medium)');
  emptyBtn.removeAttribute('data-model-label');
  assert.equal(mgc.readButtonLabelWithoutGlyph(emptyBtn), 'Gemini 4 Neon (Medium)');

  // 3) Full ui-runtime syncComposers Hero D guard test
  const runtimeEnv = createDomSandbox({ pathname: '/conv-1' });
  const convView = runtimeEnv.makeEl('div', { attrs: { 'data-testid': 'conversation-view' } });
  const inputBox = runtimeEnv.makeEl('div', { attrs: { 'data-testid': 'agent-input-box' } });
  const card = runtimeEnv.makeEl('div', { className: 'surface-composer-card' });
  const trigger = runtimeEnv.makeEl('button', {
    attrs: { 'data-testid': 'model-selector-trigger', 'aria-label': 'Gemini 4 Carbon (High)' },
    text: 'Gemini 4 Carbon (High)',
  });
  card.appendChild(trigger);
  inputBox.appendChild(card);
  convView.appendChild(inputBox);
  runtimeEnv.body.appendChild(convView);

  const injectExpr = cdp.buildInjectExpression({ lang: 'zh-CN', motionLevel: 'ultra' });
  const res = vm.runInContext(injectExpr, runtimeEnv.sandbox);
  assert.equal(res.status, 'ok');
  assert.equal(card.hasAttribute('data-ag-cs-fiber-camp'), false, 'initial mount must not fire fiber pulse');

  // Adding mini-keycap + running aria-label + disabled (turn start / end) must NOT misfire fiber pulse
  trigger.appendChild(runtimeEnv.makeEl('span', { className: 'ag-pp-mini-keycap', text: '6C' }));
  trigger.setAttribute('disabled', '');
  trigger.setAttribute('aria-label', 'Gemini 4 Carbon (High), model cannot be changed while agent is running');
  runtimeEnv.win.__agClaudeStyle.sync();
  assert.equal(card.hasAttribute('data-ag-cs-fiber-camp'), false, 'mini-keycap + locked aria-label must not fire fiber pulse');

  // Even if label changes while locked, fiber pulse must be blocked
  trigger.textContent = 'Claude Opus 4.6 Thinking';
  runtimeEnv.win.__agClaudeStyle.sync();
  assert.equal(card.hasAttribute('data-ag-cs-fiber-camp'), false, 'locked trigger must block Hero D fiber pulse');

  // Unlock back to idle (same label)
  trigger.removeAttribute('disabled');
  trigger.setAttribute('aria-label', 'Claude Opus 4.6 Thinking');
  runtimeEnv.win.__agClaudeStyle.sync();
  assert.equal(card.hasAttribute('data-ag-cs-fiber-camp'), false);

  // Switching conversation (pathname change) with a different model must NOT misfire fiber pulse
  runtimeEnv.win.location.pathname = '/conv-2';
  trigger.textContent = 'Gemini 4 Neon (High)';
  runtimeEnv.win.__agClaudeStyle.sync();
  assert.equal(card.hasAttribute('data-ag-cs-fiber-camp'), false, 'session switch must not misfire Hero D fiber pulse');

  // Same session, unlocked, switching model MUST fire Hero D fiber pulse normally
  trigger.textContent = 'Claude Opus 4.6 Thinking';
  runtimeEnv.win.__agClaudeStyle.sync();
  assert.equal(card.getAttribute('data-ag-cs-fiber-camp'), 'claude', 'unlocked same-session model switch must fire Hero D fiber pulse');

  vm.runInContext(cdp.REMOVE_EXPRESSION, runtimeEnv.sandbox);
});

test('periodic-picker: blocks open/hold/replay when running & auto-collapses on mid-session lock or switching to running same/different-model session', () => {
  const env = createDomSandbox({ pathname: '/conv-idle' });
  for (const mod of PERIODIC_MODULES) {
    vm.runInContext(fs.readFileSync(path.join(PERIODIC_DIR, mod), 'utf8'), env.sandbox);
  }
  const factory = env.sandbox.__agPrismPeriodicPickerFactory;

  const sidebarItem = env.makeEl('button', { attrs: { 'data-testid': 'sidebar-conv-item' }, text: 'Running Conv' });
  env.body.appendChild(sidebarItem);

  const inputBox = env.makeEl('div', { attrs: { 'data-testid': 'agent-input-box' } });
  const triggerBtn = env.makeEl('button', {
    attrs: { 'data-testid': 'model-selector-trigger', 'aria-haspopup': 'menu' },
    text: 'Gemini 4 Carbon (High)',
  });
  inputBox.appendChild(triggerBtn);
  env.body.appendChild(inputBox);

  const cHigh = { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-c-high' };
  const neHigh = { label: 'Gemini 4 Neon (High)', modelId: 'gemini-4-ne-high' };
  const hostState = {
    conversationId: 'conv-idle',
    selectedModel: cHigh,
    modelOptions: [cHigh, neHigh],
    setModelConfigByLabelForConversation: () => true,
  };
  env.win.__agPeriodicMockHost = hostState;

  let triggerClickCount = 0;
  triggerBtn.addEventListener('click', () => { triggerClickCount += 1; });

  const inst = factory.mountPeriodicPicker({ root: env.win, doc: env.doc, mode: 'on' });

  // ── 1) Running/locked states block open(), pointerdown/hold-ring, mousedown, and pointerup replay ──
  const lockCases = [
    {
      name: 'disabled attr',
      apply: () => triggerBtn.setAttribute('disabled', ''),
      clear: () => triggerBtn.removeAttribute('disabled'),
    },
    {
      name: 'aria-disabled=true',
      apply: () => triggerBtn.setAttribute('aria-disabled', 'true'),
      clear: () => triggerBtn.removeAttribute('aria-disabled'),
    },
    {
      name: 'data-disabled bare',
      apply: () => triggerBtn.setAttribute('data-disabled', ''),
      clear: () => triggerBtn.removeAttribute('data-disabled'),
    },
    {
      name: 'visible input-cancel-button',
      apply: () => inputBox.appendChild(env.makeEl('button', { attrs: { 'data-testid': 'input-cancel-button' } })),
      clear: () => inputBox.querySelector('[data-testid="input-cancel-button"]')?.remove(),
    },
  ];

  for (const lc of lockCases) {
    lc.apply();
    assert.equal(inst.open(triggerBtn), false, `open() must refuse when locked (${lc.name})`);
    assert.equal(inst.isOpen(), false);
    assert.equal(env.doc.getElementById('ag-prism-periodic-picker-root'), null);

    triggerClickCount = 0;
    triggerBtn.dispatchEvent(env.createEvent('pointerdown', { button: 0, clientX: 120, clientY: 112 }));
    triggerBtn.dispatchEvent(env.createEvent('mousedown', { button: 0, clientX: 120, clientY: 112 }));
    env.advanceTime(500);
    assert.equal(env.doc.querySelector('.ag-pp-hold-ring'), null, `must not spawn hold-ring (${lc.name})`);
    assert.equal(inst.isOpen(), false, `long-press must not open picker (${lc.name})`);
    triggerBtn.dispatchEvent(env.createEvent('pointerup', { button: 0, clientX: 120, clientY: 112 }));
    assert.equal(triggerClickCount, 0, `must not replay native click while locked (${lc.name})`);
    assert.equal(env.getCounts().activeIntervals, 0, 'closed state must have 0 interval timers');
    lc.clear();
  }

  // Mid-hold lock race: press while idle -> turn starts at 80ms -> ring/open/replay all aborted
  triggerClickCount = 0;
  triggerBtn.dispatchEvent(env.createEvent('pointerdown', { button: 0, clientX: 120, clientY: 112 }));
  env.advanceTime(80);
  triggerBtn.setAttribute('disabled', '');
  env.advanceTime(400);
  assert.equal(env.doc.querySelector('.ag-pp-hold-ring'), null, 'mid-hold lock must cancel hold-ring');
  assert.equal(inst.isOpen(), false, 'mid-hold lock must cancel openTimer');
  triggerBtn.dispatchEvent(env.createEvent('pointerup', { button: 0, clientX: 120, clientY: 112 }));
  assert.equal(triggerClickCount, 0, 'mid-hold lock must not replay click on pointerup');
  triggerBtn.removeAttribute('disabled');

  // ── 2) Open picker auto-collapses when current session becomes running ──
  // 2a) Attribute-only lock detected by local MutationObserver (never observes body/documentElement)
  assert.equal(inst.open(triggerBtn), true);
  assert.equal(inst.isOpen(), true);
  assert.equal(env.getCounts().activeIntervals, 1, 'openLockGuardTimer must run while picker is open');

  const localObsCalls = env.getObservedCalls().filter((c) => c.target === inputBox || c.target === triggerBtn);
  assert.ok(localObsCalls.length > 0, 'must attach local session trigger MutationObserver');
  const latestLocalObs = localObsCalls[localObsCalls.length - 1];
  assert.notEqual(latestLocalObs.target, env.body);
  assert.notEqual(latestLocalObs.target, env.html);
  assert.equal(latestLocalObs.opts.attributes, true);
  for (const attr of ['disabled', 'aria-disabled', 'data-disabled', 'data-model-label']) {
    assert.ok(latestLocalObs.opts.attributeFilter.includes(attr), `attributeFilter must include ${attr}`);
  }

  triggerBtn.setAttribute('disabled', '');
  env.triggerMutations(latestLocalObs.target, [{ type: 'attributes', attributeName: 'disabled', target: triggerBtn }]);
  assert.equal(inst.isOpen(), false, 'attribute-only lock mutation must immediately collapse open picker');
  assert.equal(env.getCounts().activeIntervals, 0, 'openLockGuardTimer must be cleared on collapse');
  triggerBtn.removeAttribute('disabled');

  // 2b) Even without MO firing, 280ms openLockGuardTimer catches running cancel button and collapses cleanly
  assert.equal(inst.open(triggerBtn), true);
  assert.equal(inst.isOpen(), true);
  const cancelBtn = env.makeEl('button', { attrs: { 'data-testid': 'input-cancel-button' } });
  inputBox.appendChild(cancelBtn);
  env.advanceTime(290);
  assert.equal(inst.isOpen(), false, '280ms openLockGuardTimer must collapse picker when input enters running state');
  assert.equal(env.getCounts().activeIntervals, 0, 'interval timer must be cleared after lock guard collapse');
  cancelBtn.remove();

  // ── 3) Open picker auto-collapses when switching from idle session to running session (same model OR different model) ──
  // 3a) Switch to RUNNING session with SAME model (Gemini 4 Carbon High), rendered 150ms after sidebar click -> 200ms followup catches it before fullSig early return
  assert.equal(inst.open(triggerBtn), true);
  assert.equal(inst.isOpen(), true);
  sidebarItem.dispatchEvent(env.createEvent('click', { button: 0 }));
  env.advanceTime(150);
  // React mounts new session state with identical model signature but locked
  hostState.conversationId = 'conv-running-same-model';
  triggerBtn.setAttribute('aria-disabled', 'true');
  env.advanceTime(60); // 210ms total -> hits 200ms click followup sync
  assert.equal(inst.isOpen(), false, 'switching to same-model running session must collapse picker (must not early-return on same fullSig)');
  assert.equal(env.getCounts().activeIntervals, 0);
  triggerBtn.removeAttribute('aria-disabled');

  // 3b) Switch via history.pushState to RUNNING session with DIFFERENT model (Gemini 4 Neon High), rendered 150ms after pushState -> 220ms route followup catches it
  assert.equal(inst.open(triggerBtn), true);
  assert.equal(inst.isOpen(), true);
  env.win.history.pushState({}, '', '#conv-running-diff-model');
  env.advanceTime(150);
  hostState.conversationId = 'conv-running-diff-model';
  hostState.selectedModel = neHigh;
  triggerBtn.textContent = 'Gemini 4 Neon (High)';
  triggerBtn.setAttribute('data-disabled', '');
  env.advanceTime(80); // 230ms total -> hits 220ms route followup sync
  assert.equal(inst.isOpen(), false, 'switching to different-model running session must collapse picker');
  assert.equal(env.getCounts().activeIntervals, 0);
  triggerBtn.removeAttribute('data-disabled');

  // 3c) Calling open() while already open against a now-locked trigger closes existing overlay and returns false
  assert.equal(inst.open(triggerBtn), true);
  triggerBtn.setAttribute('disabled', '');
  assert.equal(inst.open(triggerBtn), false);
  assert.equal(inst.isOpen(), false);
  triggerBtn.removeAttribute('disabled');

  inst.destroy();
  const counts = env.getCounts();
  assert.equal(counts.docListeners, 0, 'destroy() must clean all document listeners');
  assert.equal(counts.winListeners, 0, 'destroy() must clean all window listeners');
  assert.equal(counts.activeTimers, 0, 'destroy() must clean all timeouts');
  assert.equal(counts.activeIntervals, 0, 'destroy() must clean all intervals');
  assert.equal(counts.activeObservers, 0, 'destroy() must disconnect all observers');
});

test('prism-rim + ui-runtime: data-ag-pp-open="1" keeps composer, step-plan, home-panel & mirror rims responsive via window capture while preserving picker bubble firewall, layout transitionend sync, and win-blur/hidden reclaim', () => {
  const env = createDomSandbox({ pathname: '/conv-rim-pp' });
  const rafs = new Map();
  let nextRaf = 1;
  env.win.requestAnimationFrame = (fn) => { const id = nextRaf++; rafs.set(id, fn); return id; };
  env.win.cancelAnimationFrame = (id) => { rafs.delete(id); };
  env.sandbox.requestAnimationFrame = env.win.requestAnimationFrame;
  env.sandbox.cancelAnimationFrame = env.win.cancelAnimationFrame;
  const flushRafs = (dt = 20) => {
    env.advanceTime(dt);
    const list = Array.from(rafs.entries());
    rafs.clear();
    for (const [, fn] of list) fn(env.win.performance.now());
  };

  // Patch makeEl / createElement so nodes expose ownerDocument/dataset/nextElementSibling and <canvas> exposes 2D context
  const origMakeEl = env.makeEl;
  const origCreateEl = env.doc.createElement;
  const enhanceEl = (el) => {
    if (!el || el._rimEnhanced) return el;
    el._rimEnhanced = true;
    el.ownerDocument = env.doc;
    if (!el.dataset) el.dataset = {};
    if (!('nextElementSibling' in el)) {
      Object.defineProperty(el, 'nextElementSibling', {
        get() {
          if (!this.parentNode) return null;
          const list = this.parentNode.children || [];
          const i = list.indexOf(this);
          return i >= 0 ? list[i + 1] || null : null;
        },
      });
    }
    if (el.tagName !== 'CANVAS') return el;
    const strokes = [];
    let tx = 0;
    let ty = 0;
    const ctx = {
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      lineWidth: 1,
      strokeStyle: null,
      fillStyle: null,
      clearRect() { el._cleared = (el._cleared || 0) + 1; },
      save() {},
      restore() { tx = 0; ty = 0; },
      translate(x, y) { tx = x; ty = y; },
      clip() {},
      fillRect() {},
      fill() {},
      beginPath() {},
      roundRect() {},
      moveTo() {},
      lineTo() {},
      arcTo() {},
      closePath() {},
      stroke() { strokes.push({ w: el.width, h: el.height, tx, ty }); },
      createRadialGradient() { return { addColorStop() {} }; },
      createLinearGradient() { return { addColorStop() {} }; },
    };
    el._strokes = strokes;
    el.getContext = (k) => (k === '2d' ? ctx : null);
    return el;
  };
  env.makeEl = (tag, opts) => enhanceEl(origMakeEl(tag, opts));
  env.doc.createElement = (tag) => enhanceEl(origCreateEl(tag));
  enhanceEl(env.html);
  enhanceEl(env.body);
  env.doc.hasFocus = () => true;

  // Full browser-faithful capture->target->bubble dispatch including window phase
  const winCapListeners = new Map();
  const winBubListeners = new Map();
  const origWinAdd = env.win.addEventListener.bind(env.win);
  const origWinRem = env.win.removeEventListener.bind(env.win);
  env.win.addEventListener = (type, fn, opts) => {
    const cap = typeof opts === 'boolean' ? opts : Boolean(opts && opts.capture);
    const m = cap ? winCapListeners : winBubListeners;
    if (!m.has(type)) m.set(type, new Set());
    m.get(type).add(fn);
    return origWinAdd(type, fn, opts);
  };
  env.win.removeEventListener = (type, fn, opts) => {
    const cap = typeof opts === 'boolean' ? opts : Boolean(opts && opts.capture);
    const m = cap ? winCapListeners : winBubListeners;
    m.get(type)?.delete(fn);
    return origWinRem(type, fn, opts);
  };
  env.sandbox.addEventListener = env.win.addEventListener;
  env.sandbox.removeEventListener = env.win.removeEventListener;

  const dispatchBrowserEvent = (target, type, init = {}) => {
    const ev = env.createEvent(type, init, target);
    if (init.propertyName) ev.propertyName = init.propertyName;
    const chain = [];
    let cur = target;
    while (cur) { chain.unshift(cur); cur = cur.parentNode || null; }
    // 1) window capture
    ev.currentTarget = env.win;
    for (const fn of Array.from(winCapListeners.get(type) || [])) {
      fn.call(env.win, ev);
      if (ev.immediatePropagationStopped) return ev;
    }
    if (ev.propagationStopped) return ev;
    // 2) document + ancestors capture
    for (const el of chain) {
      ev.currentTarget = el;
      for (const fn of el._getListeners(type, true)) {
        fn.call(el, ev);
        if (ev.immediatePropagationStopped) return ev;
      }
      if (ev.propagationStopped) return ev;
    }
    // 3) target + ancestors bubble
    for (let i = chain.length - 1; i >= 0; i -= 1) {
      const el = chain[i];
      ev.currentTarget = el;
      for (const fn of el._getListeners(type, false)) {
        fn.call(el, ev);
        if (ev.immediatePropagationStopped) return ev;
      }
      if (ev.propagationStopped || !ev.bubbles) return ev;
    }
    // 4) window bubble
    ev.currentTarget = env.win;
    for (const fn of Array.from(winBubListeners.get(type) || [])) {
      fn.call(env.win, ev);
      if (ev.immediatePropagationStopped) return ev;
    }
    return ev;
  };

  // Build scene: composer card + visible step-plan + home-panel + overview mirror card + periodic picker root with bubble firewall
  const convView = env.makeEl('div', { attrs: { 'data-testid': 'conversation-view' } });
  const stepPlanRect = { left: 120, top: 80, right: 620, bottom: 200, width: 500, height: 120 };
  const stepPlan = env.makeEl('div', { attrs: { 'data-testid': 'step-plan', 'aria-expanded': 'true' }, rect: stepPlanRect });
  let composerRect = { left: 120, top: 520, right: 680, bottom: 640, width: 560, height: 120 };
  const inputBox = env.makeEl('div', { attrs: { 'data-testid': 'agent-input-box' } });
  const composerCard = env.makeEl('div', { className: 'surface-composer-card', rect: composerRect });
  composerCard.getBoundingClientRect = () => composerRect;
  const triggerBtn = env.makeEl('button', {
    attrs: { 'data-testid': 'model-selector-trigger' },
    text: 'Gemini 4 Carbon (High)',
  });
  composerCard.appendChild(triggerBtn);
  inputBox.appendChild(composerCard);

  const homePanel = env.makeEl('div', {
    className: 'ag-cs-home-panel',
    attrs: { 'data-ag-cs-prism-box': '1', 'data-ag-cs-prism-mirror': '1' },
    rect: { left: 740, top: 120, right: 1180, bottom: 340, width: 440, height: 220 },
  });
  const overviewMirror = env.makeEl('div', {
    attrs: { 'data-testid': 'overview-panel', 'data-ag-cs-prism-box': '1', 'data-ag-cs-prism-mirror': '1' },
    rect: { left: 740, top: 420, right: 1180, bottom: 600, width: 440, height: 180 },
  });

  // Periodic picker root enforcing its 300Hz bubble firewall (stops pointermove/pointerover from bubbling to host body)
  const pickerRoot = env.makeEl('div', {
    id: 'ag-prism-periodic-picker-root',
    rect: { left: 120, top: 644, right: 680, bottom: 860, width: 560, height: 216 },
  });
  const pickerCanvas = env.makeEl('canvas', { className: 'ag-pp-gl-canvas' });
  pickerRoot.appendChild(pickerCanvas);
  const stopBubble = (ev) => { ev.stopPropagation(); };
  for (const evType of ['pointerover', 'pointerout', 'mouseover', 'mouseout', 'pointermove']) {
    pickerRoot.addEventListener(evType, stopBubble);
  }

  let hostBubbleHits = 0;
  for (const evType of ['pointerover', 'pointerout', 'mouseover', 'mouseout', 'pointermove']) {
    env.body.addEventListener(evType, () => { hostBubbleHits += 1; });
  }

  convView.appendChild(stepPlan);
  convView.appendChild(inputBox);
  convView.appendChild(pickerRoot);
  env.body.appendChild(convView);
  env.body.appendChild(homePanel);
  env.body.appendChild(overviewMirror);

  // Inject full Channel 1 runtime
  const injectExpr = cdp.buildInjectExpression({ ...cdp.DEFAULT_CONFIG, language: 'zh-CN', motionLevel: 'ultra' }, { bundleCachePath: '' });
  const res = vm.runInContext(injectExpr, env.sandbox);
  assert.equal(res.status, 'ok');

  // Verify pointermove is bound on window capture phase so picker stopPropagation cannot starve prism rims
  assert.ok((winCapListeners.get('pointermove')?.size || 0) >= 1, 'ui-runtime must listen to pointermove in window capture phase');

  // Initial pointermove populates rim canvases on all containers
  dispatchBrowserEvent(composerCard, 'pointermove', { clientX: 300, clientY: 560 });
  flushRafs();
  const compCv = composerCard.querySelector('.ag-cs-prism-rim-cv');
  const spCv = stepPlan.querySelector('.ag-cs-prism-rim-cv');
  const homeCv = homePanel.querySelector('.ag-cs-prism-rim-cv');
  const ovCv = overviewMirror.querySelector('.ag-cs-prism-rim-cv');
  assert.ok(compCv && compCv.width > 0 && compCv.height > 0, 'composer rim canvas must draw initially');
  assert.ok(spCv && homeCv && ovCv, 'step-plan, home-panel & overview mirror must all mount rim canvases');

  // 1) Open periodic picker (data-ag-pp-open="1") & fire MutationObserver: existing rim canvases MUST NOT be cleared/reclaimed
  env.html.setAttribute('data-ag-pp-open', '1');
  env.triggerMutations(env.html, [{ type: 'attributes', attributeName: 'data-ag-pp-open', target: env.html }]);
  assert.ok(compCv.width > 0 && compCv.height > 0, 'opening periodic picker must NOT shrink composer rim canvas');

  // 2) Pointer moves INSIDE periodic picker near composer top/bottom edge:
  //    picker bubble firewall keeps hostBubbleHits === 0, yet composer rim still redraws with updated coords!
  hostBubbleHits = 0;
  const compStrokesBefore = compCv._strokes.length;
  dispatchBrowserEvent(pickerCanvas, 'pointerover', { clientX: 410, clientY: 660 });
  dispatchBrowserEvent(pickerCanvas, 'pointermove', { clientX: 410, clientY: 660 });
  assert.equal(hostBubbleHits, 0, 'picker 300Hz bubble firewall must still block pointerover/pointermove from reaching host body');
  flushRafs();
  assert.ok(compCv._strokes.length > compStrokesBefore, 'composer rim canvas must redraw while pointer moves inside periodic picker');
  assert.ok(compCv.width > 0 && compCv.height > 0);
  const lastCompStroke1 = compCv._strokes.at(-1);

  // Move horizontally across composer while data-ag-pp-open="1" -> highlight coordinates track pointer
  dispatchBrowserEvent(composerCard, 'pointermove', { clientX: 540, clientY: 580 });
  flushRafs();
  const lastCompStroke2 = compCv._strokes.at(-1);
  assert.ok(lastCompStroke2.tx > lastCompStroke1.tx + 80, 'composer rim highlight must track horizontal pointer movement while pp-open');

  // 3) Other containers (step-plan, home-panel, overview-panel) ALSO stay responsive while data-ag-pp-open="1"
  const spStrokesBefore = spCv._strokes.length;
  dispatchBrowserEvent(stepPlan, 'pointermove', { clientX: 260, clientY: 130 });
  flushRafs();
  assert.ok(spCv.width > 0 && spCv.height > 0 && spCv._strokes.length > spStrokesBefore, 'step-plan rim must draw while data-ag-pp-open="1"');

  const homeStrokesBefore = homeCv._strokes.length;
  const ovStrokesBefore = ovCv._strokes.length;
  dispatchBrowserEvent(homePanel, 'pointermove', { clientX: 880, clientY: 360 });
  flushRafs();
  assert.ok(homeCv.width > 0 && homeCv.height > 0 && homeCv._strokes.length > homeStrokesBefore, 'home-panel rim must draw while data-ag-pp-open="1"');
  assert.ok(ovCv.width > 0 && ovCv.height > 0 && ovCv._strokes.length > ovStrokesBefore, 'overview mirror rim must draw while data-ag-pp-open="1"');

  // 4) Drawer height transition pushes composer upward -> transitionend(height) immediately invalidates cached rect (no 1500ms wait)
  composerRect = { left: 120, top: 240, right: 680, bottom: 360, width: 560, height: 120 };
  dispatchBrowserEvent(pickerRoot, 'transitionend', { propertyName: 'height' });
  const strokesBeforeShift = compCv._strokes.length;
  dispatchBrowserEvent(composerCard, 'pointermove', { clientX: 310, clientY: 280 });
  flushRafs();
  assert.ok(compCv._strokes.length > strokesBeforeShift, 'composer rim must immediately follow new layout rect after drawer height transitionend');
  assert.ok(Math.abs(compCv._strokes.at(-1).ty - (280 - 240 + 1)) <= 2, 'composer rim localY must match shifted rect top=240');

  // 5) Real window blur / document hidden / pointerleave still pause & reclaim cleanly
  env.html.setAttribute('data-ag-cs-win-blur', '1');
  const strokesBeforeBlur = compCv._strokes.length;
  dispatchBrowserEvent(composerCard, 'pointermove', { clientX: 350, clientY: 290 });
  // Note: ui-runtime wakes blur on pointermove; verify direct hidden state reclaims to 0x0 immediately
  env.doc.hidden = true;
  dispatchBrowserEvent(env.doc, 'visibilitychange');
  assert.equal(compCv.width, 0, 'document.hidden must reclaim composer rim canvas to 0x0');
  assert.equal(spCv.width, 0, 'document.hidden must reclaim step-plan rim canvas to 0x0');
  assert.equal(homeCv.width, 0, 'document.hidden must reclaim home-panel rim canvas to 0x0');
  assert.equal(ovCv.width, 0, 'document.hidden must reclaim overview rim canvas to 0x0');
  assert.equal(rafs.size, 0, 'document.hidden must leave 0 pending rAF');

  // Restore visible, draw once, then pointerleave clears cleanly
  env.doc.hidden = false;
  env.html.removeAttribute('data-ag-cs-win-blur');
  dispatchBrowserEvent(composerCard, 'pointermove', { clientX: 340, clientY: 290 });
  flushRafs();
  assert.ok(compCv.width > 0 && compCv._strokes.length > strokesBeforeBlur);
  const clearedBeforeLeave = compCv._cleared || 0;
  dispatchBrowserEvent(env.html, 'pointerleave');
  flushRafs();
  assert.ok((compCv._cleared || 0) > clearedBeforeLeave, 'pointerleave must clear composer rim canvas');

  env.html.removeAttribute('data-ag-pp-open');
  vm.runInContext(cdp.REMOVE_EXPRESSION, env.sandbox);
  assert.equal(winCapListeners.get('pointermove')?.size || 0, 0, 'remove expression must cleanly unbind capture pointermove listener');
});

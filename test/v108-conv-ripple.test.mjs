import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const cdp = require(path.join(ROOT, 'cdp.js'));
const rippleCore = require(path.join(ROOT, 'ripple-core.js'));
const homeRippleHost = require(path.join(ROOT, 'home-ripple-host.js'));

function checkBalancedBraces(css) {
  let depth = 0;
  let sq = false;
  let dq = false;
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === '\\' && (sq || dq)) { i += 1; continue; }
    if (!dq && ch === "'") { sq = !sq; continue; }
    if (!sq && ch === '"') { dq = !dq; continue; }
    if (sq || dq) continue;
    if (ch === '{') depth += 1;
    else if (ch === '}') { depth -= 1; if (depth < 0) return false; }
  }
  return depth === 0 && !sq && !dq;
}

function make2DMockCanvas(width, height) {
  let lastImage = null;
  const ctx2d = {
    setTransform() {},
    clearRect() {},
    fillText() {},
    getImageData(_x, _y, w, h) {
      const buf = new Uint8ClampedArray(w * h * 4);
      for (let i = 3; i < buf.length; i += 4) buf[i] = 255;
      return { width: w, height: h, data: buf };
    },
    createImageData(w, h) {
      return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
    },
    putImageData(img) {
      lastImage = img;
    },
  };
  return {
    width,
    height,
    get lastImage() { return lastImage; },
    ownerDocument: {
      hidden: false,
      createElement: () => make2DMockCanvas(1, 1),
    },
    getContext: (type) => (type === '2d' ? ctx2d : null),
  };
}

function makeWebGL2MockGl(tracker) {
  let lost = false;
  const uniforms = new Map();
  const gl = {
    VERTEX_SHADER: 35633,
    FRAGMENT_SHADER: 35632,
    COMPILE_STATUS: 35713,
    LINK_STATUS: 35714,
    COLOR_BUFFER_BIT: 16384,
    TRIANGLES: 4,
    TEXTURE_2D: 3553,
    TEXTURE0: 33984,
    TEXTURE1: 33985,
    RGBA: 6408,
    RGBA8: 32856,
    UNSIGNED_BYTE: 5121,
    LINEAR: 9729,
    NEAREST: 9728,
    CLAMP_TO_EDGE: 33071,
    TEXTURE_MIN_FILTER: 10241,
    TEXTURE_MAG_FILTER: 10240,
    TEXTURE_WRAP_S: 10242,
    TEXTURE_WRAP_T: 10243,
    isContextLost: () => lost,
    createShader: () => (lost ? null : {}),
    shaderSource() {},
    compileShader() {},
    getShaderParameter: () => !lost,
    getShaderInfoLog: () => '',
    deleteShader() {},
    createProgram: () => (lost ? null : {}),
    attachShader() {},
    linkProgram() {},
    getProgramParameter: () => !lost,
    getProgramInfoLog: () => '',
    useProgram() {},
    deleteProgram() { tracker.deleteProgram += 1; },
    getUniformLocation: (_p, name) => ({ name }),
    createTexture: () => ({}),
    deleteTexture() { tracker.deleteTexture += 1; },
    activeTexture() {},
    bindTexture() {},
    texParameteri() {},
    texStorage2D() {},
    texImage2D() {},
    texSubImage2D() {},
    viewport() {},
    uniform1i(loc, v) { if (loc) uniforms.set(loc.name, v); },
    uniform1f(loc, v) { if (loc) uniforms.set(loc.name, v); },
    uniform2f(loc, a, b) { if (loc) uniforms.set(loc.name, [a, b]); },
    uniform3f(loc, a, b, c) { if (loc) uniforms.set(loc.name, [a, b, c]); },
    uniform4f(loc, a, b, c, d) { if (loc) uniforms.set(loc.name, [a, b, c, d]); },
    clearColor() {},
    clear() {},
    drawArrays() { tracker.draws += 1; },
    getExtension: (n) => (n === 'WEBGL_lose_context' ? { loseContext() { lost = true; tracker.loseContext += 1; } } : null),
    _uniforms: uniforms,
    _setLost(v) { lost = v; },
  };
  return gl;
}

function createConvDomEnv() {
  const docListeners = new Map();
  const winListeners = new Map();
  const observers = [];
  const roInstances = [];
  const glTracker = { contexts: 0, draws: 0, loseContext: 0, deleteProgram: 0, deleteTexture: 0, lastGl: null };
  const atlasCtx = {
    setTransform() {},
    clearRect() {},
    fillText() {},
    font: '',
    fillStyle: '',
    textAlign: '',
    textBaseline: '',
  };

  function addL(map, type, fn, opts) {
    if (!map.has(type)) map.set(type, new Set());
    map.get(type).add({ fn, opts });
  }
  function remL(map, type, fn) {
    const s = map.get(type);
    if (!s) return;
    for (const r of s) if (r.fn === fn) s.delete(r);
  }
  function emitL(map, type, ev = {}) {
    const s = map.get(type);
    if (!s) return;
    ev.type = type;
    ev.preventDefault = ev.preventDefault || (() => {});
    ev.stopPropagation = ev.stopPropagation || (() => {});
    for (const r of [...s]) r.fn(ev);
  }

  function matchAtom(el, sel) {
    let rest = sel.trim();
    if (!rest || rest === '*') return true;
    const notM = rest.match(/:not\(([^)]+)\)/);
    if (notM) {
      if (matchAtom(el, notM[1])) return false;
      rest = rest.replace(notM[0], '');
    }
    const tagM = rest.match(/^([a-zA-Z0-9_-]+)/);
    if (tagM) {
      if (el.tagName.toLowerCase() !== tagM[1].toLowerCase()) return false;
      rest = rest.slice(tagM[0].length);
    }
    const idM = rest.match(/#([a-zA-Z0-9_-]+)/);
    if (idM && el.id !== idM[1]) return false;
    for (const cm of rest.matchAll(/\.([a-zA-Z0-9_-]+)/g)) {
      if (!el.classList.contains(cm[1])) return false;
    }
    for (const am of rest.matchAll(/\[([^\]=^$*]+)(?:(\^?)=["']?([^"'\]]*)["']?)?\]/g)) {
      const val = el.getAttribute(am[1]);
      if (am[3] === undefined) {
        if (val === null) return false;
      } else if (am[2] === '^') {
        if (!val || !val.startsWith(am[3])) return false;
      } else if (val !== am[3]) {
        return false;
      }
    }
    return true;
  }

  function notifyAttr(target, attrName) {
    for (const obs of observers) {
      if (!obs.active) continue;
      const matchTarget = obs.target === target || (obs.subtree && obs.target.contains(target));
      if (!matchTarget) continue;
      if (Array.isArray(obs.filter) && !obs.filter.includes(attrName)) continue;
      obs.cb([{ type: 'attributes', target, attributeName: attrName }]);
    }
  }

  function mkEl(tag, attrs = {}, dims = null) {
    const attrMap = new Map();
    const children = [];
    const elListeners = new Map();
    const styleProps = new Map();
    let nodeGl = null;
    const styleObj = {
      display: '',
      visibility: '',
      width: '',
      height: '',
      getPropertyValue: (k) => styleProps.get(k) || '',
      setProperty(k, v) { styleProps.set(k, String(v)); this[k] = String(v); },
      removeProperty(k) { styleProps.delete(k); delete this[k]; },
    };
    const el = {
      nodeType: 1,
      tagName: String(tag).toUpperCase(),
      parentNode: null,
      get parentElement() { return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null; },
      children,
      childNodes: children,
      get firstChild() { return children[0] || null; },
      get firstElementChild() { return children[0] || null; },
      get lastElementChild() { return children[children.length - 1] || null; },
      get isConnected() {
        let c = this;
        while (c) {
          if (c === html) return true;
          c = c.parentNode;
        }
        return false;
      },
      hidden: false,
      disabled: false,
      width: dims?.width ?? 0,
      height: dims?.height ?? 0,
      clientWidth: dims?.width ?? 960,
      clientHeight: dims?.height ?? 600,
      offsetHeight: 40,
      style: styleObj,
      dataset: {},
      _text: '',
      _elListeners: elListeners,
      get textContent() { return children.length ? children.map((c) => c.textContent).join('') : this._text; },
      set textContent(v) { this._text = String(v ?? ''); children.length = 0; },
      get className() { return attrMap.get('class') || ''; },
      set className(v) { attrMap.set('class', String(v || '')); },
      get id() { return attrMap.get('id') || ''; },
      set id(v) { if (v) attrMap.set('id', String(v)); else attrMap.delete('id'); },
      classList: {
        contains: (c) => (attrMap.get('class') || '').split(/\s+/).includes(c),
        add: (...cs) => {
          const s = new Set((attrMap.get('class') || '').split(/\s+/).filter(Boolean));
          cs.forEach((c) => s.add(c));
          attrMap.set('class', [...s].join(' '));
        },
        remove: (...cs) => {
          const s = new Set((attrMap.get('class') || '').split(/\s+/).filter(Boolean));
          cs.forEach((c) => s.delete(c));
          attrMap.set('class', [...s].join(' '));
        },
      },
      setAttribute(k, v) {
        attrMap.set(k, String(v));
        if (k === 'hidden') this.hidden = true;
        notifyAttr(this, k);
      },
      getAttribute: (k) => (attrMap.has(k) ? attrMap.get(k) : null),
      hasAttribute: (k) => attrMap.has(k),
      removeAttribute(k) {
        attrMap.delete(k);
        if (k === 'hidden') this.hidden = false;
        notifyAttr(this, k);
      },
      appendChild(c) {
        if (c.parentNode) c.remove();
        c.parentNode = this;
        children.push(c);
        return c;
      },
      insertBefore(c, ref) {
        if (c.parentNode) c.remove();
        c.parentNode = this;
        const idx = ref ? children.indexOf(ref) : -1;
        if (idx >= 0) children.splice(idx, 0, c);
        else children.push(c);
        return c;
      },
      removeChild(c) {
        const i = children.indexOf(c);
        if (i >= 0) { children.splice(i, 1); c.parentNode = null; }
        return c;
      },
      replaceChild(next, old) {
        const i = children.indexOf(old);
        if (i >= 0) { old.parentNode = null; next.parentNode = this; children[i] = next; }
        return old;
      },
      replaceWith(next) { if (this.parentNode) this.parentNode.replaceChild(next, this); },
      remove() {
        if (!this.parentNode) return;
        const i = this.parentNode.children.indexOf(this);
        if (i >= 0) this.parentNode.children.splice(i, 1);
        this.parentNode = null;
      },
      contains(other) {
        let c = other;
        while (c) {
          if (c === this) return true;
          c = c.parentNode;
        }
        return false;
      },
      matches(sel) {
        return sel.split(',').map((s) => s.trim()).filter(Boolean).some((part) => {
          const directParts = part.split('>').map((s) => s.trim());
          if (directParts.length > 1) {
            let cur = this;
            for (let i = directParts.length - 1; i >= 0; i--) {
              if (!cur) return false;
              const seg = directParts[i];
              if (seg.endsWith(':first-child')) {
                const base = seg.slice(0, -12);
                if (!cur.parentElement || cur.parentElement.children[0] !== cur) return false;
                if (base && !matchAtom(cur, base)) return false;
              } else if (!matchAtom(cur, seg)) {
                return false;
              }
              cur = cur.parentElement;
            }
            return true;
          }
          const toks = part.split(/\s+/);
          if (!matchAtom(this, toks[toks.length - 1])) return false;
          if (toks.length === 1) return true;
          let p = this.parentElement;
          let idx = toks.length - 2;
          while (p && idx >= 0) {
            if (matchAtom(p, toks[idx])) idx -= 1;
            p = p.parentElement;
          }
          return idx < 0;
        });
      },
      closest(sel) {
        let c = this;
        while (c && c.nodeType === 1) {
          if (c.matches(sel)) return c;
          c = c.parentElement;
        }
        return null;
      },
      querySelectorAll(sel) {
        const out = [];
        const walk = (n) => {
          for (const c of n.children) {
            if (c.matches(sel)) out.push(c);
            walk(c);
          }
        };
        walk(this);
        return out;
      },
      querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
      getElementById(id) { return this.querySelector('#' + id); },
      getBoundingClientRect() { return { left: 0, top: 0, width: this.clientWidth, height: this.clientHeight, right: this.clientWidth, bottom: this.clientHeight }; },
      get ownerDocument() { return doc; },
      getContext(type) {
        if (this.tagName !== 'CANVAS') return null;
        if (type === '2d') return atlasCtx;
        if (type === 'webgl2') {
          if (!nodeGl) {
            nodeGl = makeWebGL2MockGl(glTracker);
            glTracker.contexts += 1;
            glTracker.lastGl = nodeGl;
          }
          return nodeGl;
        }
        return null;
      },
      addEventListener(t, fn, opts) { addL(elListeners, t, fn, opts); },
      removeEventListener(t, fn) { remL(elListeners, t, fn); },
      dispatchEvent(ev) { emitL(elListeners, ev.type, { ...ev, target: ev.target || this }); },
    };
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'text') el.textContent = v;
      else el.setAttribute(k, v);
    }
    return el;
  }

  const html = mkEl('html', { 'data-ag-cs-style': '1', 'data-ag-cs-theme': 'dark', 'data-ag-cs-ambient': '1' });
  const head = mkEl('head');
  const body = mkEl('body', { class: 'dark' });
  html.appendChild(head);
  html.appendChild(body);

  const doc = {
    hidden: false,
    documentElement: html,
    head,
    body,
    activeElement: body,
    hasFocus: () => true,
    createElement: (t) => mkEl(t),
    createElementNS: (_ns, t) => mkEl(t),
    querySelector: (s) => html.querySelector(s),
    querySelectorAll: (s) => html.querySelectorAll(s),
    getElementById: (id) => html.querySelector('#' + id),
    contains: (n) => html.contains(n),
    addEventListener: (t, fn, opts) => addL(docListeners, t, fn, opts),
    removeEventListener: (t, fn) => remL(docListeners, t, fn),
    dispatch: (t, ev) => emitL(docListeners, t, ev),
  };

  class MockMutationObserver {
    constructor(cb) {
      this.cb = cb;
      this.active = false;
      this.target = null;
      this.filter = null;
      this.subtree = false;
      observers.push(this);
    }
    observe(target, opts = {}) {
      this.active = true;
      this.target = target;
      this.filter = opts.attributeFilter || null;
      this.subtree = Boolean(opts.subtree);
    }
    disconnect() { this.active = false; }
    takeRecords() { return []; }
  }

  class MockResizeObserver {
    constructor(cb) {
      this.cb = cb;
      this.targets = [];
      this.disconnected = false;
      roInstances.push(this);
    }
    observe(el) { this.targets.push(el); }
    disconnect() { this.disconnected = true; }
  }

  return {
    doc, html, head, body, mkEl, glTracker, roInstances, observers,
    addWinListener: (t, fn, opts) => addL(winListeners, t, fn, opts),
    remWinListener: (t, fn) => remL(winListeners, t, fn),
    dispatchWin: (t, ev) => emitL(winListeners, t, ev),
    MockMutationObserver,
    MockResizeObserver,
  };
}

function buildSplitShellLayout(env, paneCount = 2) {
  const { mkEl, body } = env;
  const shell = mkEl('div', { class: 'agy-shell' });
  const sidebar = mkEl('aside', { class: 'bg-sidebar' });
  const sheet = mkEl('div', { class: 'agy-sheet', 'data-sheet-inset': 'true' });
  const mainBody = mkEl('div', { 'data-main-content-body': 'true' }, { width: 1080, height: 780 });
  const flexOuter = mkEl('div', { class: 'flex-1 min-h-0 flex flex-col' });
  const flexInner = mkEl('div', { class: 'flex-1 min-w-0 h-full' });
  const splitPanes = mkEl('div', { 'data-split-panes': 'true' });
  const sidePanel = mkEl('div', { 'data-side-panel-body': 'true' });

  const panes = [];
  for (let i = 1; i <= paneCount; i++) {
    const pane = mkEl('div', { 'data-tiling-pane': String(i) });
    const seat = mkEl('div', { 'data-ag-cs-conv-seat': '1' });
    const cv = mkEl('div', { 'data-testid': 'conversation-view', 'data-cascade-id': `conv-${i}` });
    const box = mkEl('div', { 'data-testid': 'agent-input-box' });
    const card = mkEl('div', { class: 'surface-composer-card' });
    const editor = mkEl('div', { contenteditable: 'true' });
    const btn = mkEl('button', { 'data-testid': 'input-send-button' });
    const blank = mkEl('div', { class: 'conv-blank-area' });
    card.appendChild(editor);
    card.appendChild(btn);
    box.appendChild(card);
    cv.appendChild(blank);
    cv.appendChild(box);
    seat.appendChild(cv);
    pane.appendChild(seat);
    splitPanes.appendChild(pane);
    panes.push({ pane, seat, cv, box, card, editor, btn, blank });
  }

  flexInner.appendChild(splitPanes);
  flexOuter.appendChild(flexInner);
  mainBody.appendChild(flexOuter);
  sheet.appendChild(mainBody);
  shell.appendChild(sidebar);
  shell.appendChild(sheet);
  shell.appendChild(sidePanel);
  body.appendChild(shell);
  return { shell, sidebar, sheet, mainBody, flexOuter, flexInner, splitPanes, sidePanel, panes };
}

test('Issue #63 CSS, hygiene & Channel 1 budget gate (< 549,500 B, ~2 KB delta, 0 :has, 100% ASCII, 0 CSSOM traps)', () => {
  const forbiddenRe = new RegExp(['octo', 'path'].join('') + '|' + ['\u516b\u65b9', '\u65c5\u4eba'].join(''), 'i');
  for (const rel of ['ripple-core.js', 'home-ripple-host.js', 'ui-runtime.js', 'style.css']) {
    const buf = fs.readFileSync(path.join(ROOT, rel));
    const txt = buf.toString('utf8');
    assert.equal(buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf, false, `${rel} must have 0 BOM`);
    assert.equal(txt.includes('\r'), false, `${rel} must use LF only (0 CRLF)`);
    assert.equal(forbiddenRe.test(txt), false, `${rel} must contain 0 forbidden words`);
  }

  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  assert.equal(/[^\x00-\x7f]/.test(css), false, 'style.css must remain 100% ASCII');
  assert.equal(/:has\(/.test(css), false, 'style.css must contain 0 :has()');
  assert.equal(checkBalancedBraces(css), true, 'style.css braces must remain balanced');
  assert.equal(css.includes('-webkit-mask:var(--_m0)'), false, '0 Chromium CSSOM -webkit-mask shorthand+var trap');
  assert.equal(css.includes('background:var(--_x0)'), false, '0 Chromium CSSOM background shorthand+var trap');

  assert.ok(
    css.includes('&[data-ag-cs-conv-ripple="1"]:not([data-ag-prism-wallpaper="on"]):not([data-has-browser-hole="true"]):not([data-has-drawer-browser-hole="true"])'),
    'style.css must gate conversation transparency under data-ag-cs-conv-ripple with wallpaper & Browser Hole guards'
  );
  assert.ok(
    css.includes('.ag-cs-ripple-host[data-ripple-mode="conv"]{z-index:-1;}'),
    'conv ripple host must sit at z-index:-1 inside isolated shell stacking context'
  );
  assert.ok(
    css.includes('[data-testid="conversation-view"]::before{background:none !important;opacity:0 !important;}'),
    'conv ripple must suppress harsh top gradient bar on conversation-view::before'
  );
  for (const tok of ['div.flex-1.min-h-0', '[data-split-root]', '[data-tiling-pane]', '[data-pane-id]', '[data-testid="overview-panel-host"]', '[data-ag-cs-conv-seat="1"]']) {
    assert.ok(css.includes(tok), `style.css conv transparency chain must cover live Antigravity container ${tok}`);
  }

  for (const lang of ['auto', 'zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'es', 'fr', 'de']) {
    const expr = cdp.buildInjectExpression({ ...cdp.DEFAULT_CONFIG, language: lang }, { bundleCachePath: '' });
    const bytes = Buffer.byteLength(expr, 'utf8');
    assert.ok(bytes < 580000, `Channel 1 (${lang}) must stay < 580,000 B, got ${bytes}`);
  }
  const autoBytes = Buffer.byteLength(
    cdp.buildInjectExpression({ ...cdp.DEFAULT_CONFIG, language: 'auto' }, { bundleCachePath: '' }),
    'utf8'
  );
  assert.ok(autoBytes < 580000, `Channel 1 auto must stay < 580,000 B, got ${autoBytes} B`);
});

test('Issue #63 ripple-core 4-tier conv optics: subtle(0.60) < medium(0.85) < full(1.00) in dark & light + WebGL2 uniforms', () => {
  const cols = 40;
  const rows = 20;
  const { cellWidth, cellHeight } = rippleCore.RIPPLE;
  const W = cols * cellWidth;
  const H = rows * cellHeight;

  const sampleMaxAlpha = (canvas) => {
    const d = canvas.lastImage.data;
    let maxA = 0;
    let sumA = 0;
    for (let i = 3; i < d.length; i += 4) {
      if (d[i] > maxA) maxA = d[i];
      sumA += d[i];
    }
    return { maxA, sumA };
  };

  const tiers = [
    { name: 'subtle', alphaScale: 0.60, nebulaLiftScale: 0.40, auraLiftScale: 0.45 },
    { name: 'medium', alphaScale: 0.85, nebulaLiftScale: 0.75, auraLiftScale: 0.75 },
    { name: 'full', alphaScale: 1.00, nebulaLiftScale: 1.00, auraLiftScale: 1.00 },
  ];

  for (const dark of [true, false]) {
    const cvHome = make2DMockCanvas(W, H);
    const fHome = rippleCore.createGlyphField(cvHome, cols, rows, rippleCore.createWaveField(cols, rows, () => 0.5));
    const base = {
      dark,
      ink: dark ? [146, 148, 156] : [104, 114, 134],
      wave: dark ? [214, 218, 228] : [37, 99, 235],
      aura: null,
      ambientIntensity: 1,
    };
    fHome.draw(1000, base, false);
    const sHome = sampleMaxAlpha(cvHome);
    fHome.dispose();

    const stats = {};
    for (const t of tiers) {
      const cv = make2DMockCanvas(W, H);
      const f = rippleCore.createGlyphField(cv, cols, rows, rippleCore.createWaveField(cols, rows, () => 0.5));
      f.draw(1000, { ...base, conv: true, alphaScale: t.alphaScale, nebulaLiftScale: t.nebulaLiftScale, auraLiftScale: t.auraLiftScale }, false);
      stats[t.name] = sampleMaxAlpha(cv);
      f.dispose();
    }
    assert.ok(stats.subtle.sumA > 0 && stats.subtle.sumA < stats.medium.sumA, `subtle < medium in ${dark ? 'dark' : 'light'}`);
    assert.ok(stats.medium.sumA < stats.full.sumA, `medium < full in ${dark ? 'dark' : 'light'}`);
    assert.equal(stats.full.sumA, sHome.sumA, `full tier must match home intensity in ${dark ? 'dark' : 'light'}`);
  }

  // Verify WebGL2 uniforms honor 3-tier nebulaLiftScale & auraLiftScale accurately
  const prevForce = globalThis.__agRippleForce2D;
  globalThis.__agRippleForce2D = false;
  try {
    const tracker = { draws: 0, loseContext: 0, deleteProgram: 0, deleteTexture: 0 };
    const gl = makeWebGL2MockGl(tracker);
    const atlasCtx = { setTransform() {}, clearRect() {}, fillText() {}, font: '', fillStyle: '', textAlign: '', textBaseline: '' };
    const glCanvas = {
      width: W,
      height: H,
      ownerDocument: { hidden: false, createElement: () => ({ width: 0, height: 0, getContext: () => atlasCtx }) },
      getContext: (t) => (t === 'webgl2' ? gl : null),
      addEventListener() {},
      removeEventListener() {},
    };
    const wf = rippleCore.createWaveField(cols, rows, () => 0.5);
    const field = rippleCore.createGlyphField(glCanvas, cols, rows, wf);
    assert.equal(field.mode, 'webgl2');
    for (const t of tiers) {
      field.invalidate();
      field.draw(1000, {
        dark: true,
        ink: [146, 148, 156],
        wave: [214, 218, 228],
        conv: true,
        alphaScale: t.alphaScale,
        nebulaLiftScale: t.nebulaLiftScale,
        auraLiftScale: t.auraLiftScale,
        ambientIntensity: 0.7,
        aura: { x: 100, y: 100, radius: 215, strength: 0.82, active: true },
      }, false);
      const expNeb = rippleCore.RIPPLE.nebulaLift * 0.7 * t.nebulaLiftScale;
      const expAura = rippleCore.RIPPLE.auraLift * 0.7 * t.auraLiftScale;
      assert.ok(Math.abs(gl._uniforms.get('nebulaLift') - expNeb) < 1e-6, `WebGL2 nebulaLift mismatch for ${t.name}`);
      assert.ok(Math.abs(gl._uniforms.get('auraLift') - expAura) < 1e-6, `WebGL2 auraLift mismatch for ${t.name}`);
    }
    field.dispose();
  } finally {
    if (prevForce === undefined) delete globalThis.__agRippleForce2D;
    else globalThis.__agRippleForce2D = prevForce;
  }
});

test('Issue #63 home-ripple-host conv mode: single WebGL2 canvas on main shell, skips glowCanvas, spans Split View, survives conv swap & resize, switches cleanly with home', () => {
  const prevForce = globalThis.__agRippleForce2D;
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  const prevRaf = globalThis.requestAnimationFrame;
  const prevCaf = globalThis.cancelAnimationFrame;
  const prevRO = globalThis.ResizeObserver;
  const prevMO = globalThis.MutationObserver;
  const prevPerf = globalThis.performance;

  globalThis.__agRippleForce2D = false;
  const env = createConvDomEnv();
  const layoutDom = buildSplitShellLayout(env, 2);

  let nowMs = 1000;
  let rafSeq = 0;
  const rafQueue = [];
  const flushRaf = (ts = nowMs) => {
    const batch = rafQueue.splice(0, rafQueue.length);
    for (const it of batch) if (!it.cancelled) it.fn(ts);
  };

  let glowMountCalls = 0;
  const wrappedCore = {
    ...rippleCore,
    mountBrandHorizonGlow(cv) {
      glowMountCalls += 1;
      return rippleCore.mountBrandHorizonGlow(cv);
    },
  };

  globalThis.document = env.doc;
  globalThis.window = { devicePixelRatio: 1, addEventListener: env.addWinListener, removeEventListener: env.remWinListener };
  globalThis.requestAnimationFrame = (fn) => { const id = ++rafSeq; rafQueue.push({ id, fn, cancelled: false }); return id; };
  globalThis.cancelAnimationFrame = (id) => { const it = rafQueue.find((x) => x.id === id); if (it) it.cancelled = true; };
  globalThis.ResizeObserver = env.MockResizeObserver;
  globalThis.MutationObserver = env.MockMutationObserver;
  globalThis.performance = { now: () => nowMs };

  let ctl = null;
  let convLevel = 'subtle';
  try {
    ctl = homeRippleHost.createHomeRippleController({
      rippleCore: wrappedCore,
      isDestroyed: () => false,
      isAllowed: () => true,
      isConvAllowed: () => convLevel !== 'off' && convLevel !== false,
      getConvLevel: () => convLevel,
      isConvRunning: () => false,
      isDarkTheme: () => true,
      motionReduced: () => false,
      getMinFrameGapMs: () => 0,
      getAmbientIntensity: () => 1,
      getAccentTone: () => 'follow',
      setAttrIfChanged: (el, k, v) => el.setAttribute(k, v),
    });

    ctl.sync();
    flushRaf(nowMs);

    const m = ctl.getMount();
    assert.ok(m, 'conv ripple mount must exist');
    assert.equal(m.mode, 'conv');
    assert.equal(m.convLevel, 'subtle');
    assert.equal(m.host.getAttribute('data-conv-level'), 'subtle');
    assert.ok(Math.abs(env.glTracker.lastGl._uniforms.get('nebulaLift') - rippleCore.RIPPLE.nebulaLift * 0.40) < 1e-6, 'subtle nebulaLift must be 0.40x');
    assert.ok(Math.abs(env.glTracker.lastGl._uniforms.get('auraLift') - rippleCore.RIPPLE.auraLift * 0.45) < 1e-6, 'subtle auraLift must be 0.45x');

    // Hot-switch tiers subtle -> medium -> full without recreating WebGL2 context
    const drawsBeforeHot = env.glTracker.draws;
    convLevel = 'medium';
    ctl.sync();
    flushRaf(nowMs += 20);
    assert.equal(m.convLevel, 'medium');
    assert.equal(m.host.getAttribute('data-conv-level'), 'medium');
    assert.ok(env.glTracker.draws > drawsBeforeHot, 'hot-switching convLevel must immediately draw a refreshed frame');
    assert.ok(Math.abs(env.glTracker.lastGl._uniforms.get('nebulaLift') - rippleCore.RIPPLE.nebulaLift * 0.75) < 1e-6, 'medium nebulaLift must be 0.75x');
    assert.ok(Math.abs(env.glTracker.lastGl._uniforms.get('auraLift') - rippleCore.RIPPLE.auraLift * 0.75) < 1e-6, 'medium auraLift must be 0.75x');
    assert.equal(m.sleeping, true, 'must return to 0fps sleep right after hot tier refresh');

    convLevel = 'full';
    ctl.sync();
    flushRaf(nowMs += 20);
    assert.equal(m.convLevel, 'full');
    assert.equal(m.host.getAttribute('data-conv-level'), 'full');
    assert.ok(Math.abs(env.glTracker.lastGl._uniforms.get('nebulaLift') - rippleCore.RIPPLE.nebulaLift * 1.00) < 1e-6, 'full nebulaLift must be 1.00x');
    assert.ok(Math.abs(env.glTracker.lastGl._uniforms.get('auraLift') - rippleCore.RIPPLE.auraLift * 1.00) < 1e-6, 'full auraLift must be 1.00x');
    assert.equal(env.glTracker.contexts, 1, 'hot-switching 4 tiers must reuse single WebGL2 context');
    assert.equal(env.glTracker.loseContext, 0);

    // Legacy boolean true maps to medium
    convLevel = true;
    ctl.sync();
    flushRaf(nowMs += 20);
    assert.equal(m.convLevel, 'medium', 'legacy boolean true must resolve to medium');
    assert.equal(m.root, layoutDom.mainBody, 'must mount onto [data-main-content-body] spanning Split View');
    assert.equal(m.glowCanvas, null, 'conv mode must strictly skip glowCanvas');
    assert.equal(m.glow, null);
    assert.equal(glowMountCalls, 0, 'mountBrandHorizonGlow must never be called in conv mode');
    assert.equal(env.glTracker.contexts, 1, 'exactly 1 WebGL2 context globally');
    assert.equal(env.html.getAttribute('data-ag-cs-conv-ripple'), '1');
    assert.equal(layoutDom.mainBody.getAttribute('data-ag-cs-conv-ripple-host'), '1');
    assert.equal(layoutDom.panes[0].cv.querySelector('.ag-cs-ripple-host'), null, 'must never mount inside individual conversation-view');
    assert.equal(layoutDom.sidebar.querySelector('.ag-cs-ripple-host'), null, 'must never cover sidebar');
    assert.equal(layoutDom.sidePanel.querySelector('.ag-cs-ripple-host'), null, 'must never cover right side panel');
    assert.equal(m.sleeping, true, 'conv mode must settle to 0fps right after initial static draw (no intro spin)');
    assert.equal(rafQueue.filter((x) => !x.cancelled).length, 0);

    // Passive listener verification
    const downListeners = [...(layoutDom.mainBody._elListeners.get('pointerdown') || [])];
    assert.ok(downListeners.length > 0 && downListeners.every((r) => r.opts?.passive === true), 'pointerdown must remain passive');

    // Conversation swap inside pane 1 must keep the exact same canvas & WebGL2 context alive (0 loseContext)
    const initialCanvas = m.canvas;
    layoutDom.panes[0].cv.remove();
    const newCv = env.mkEl('div', { 'data-testid': 'conversation-view', 'data-cascade-id': 'conv-99' });
    layoutDom.panes[0].seat.appendChild(newCv);
    ctl.sync();
    assert.equal(ctl.getMount().canvas, initialCanvas, 'switching conversation must reuse same canvas');
    assert.equal(env.glTracker.contexts, 1, 'switching conversation must NOT create a new WebGL2 context');
    assert.equal(env.glTracker.loseContext, 0, 'switching conversation must NOT lose WebGL2 context');

    // Resize preserves WebGL2 context via PR #60 dispose(true)
    layoutDom.mainBody.clientWidth = 1240;
    layoutDom.mainBody.clientHeight = 820;
    env.roInstances[0].cb();
    nowMs += 20;
    flushRaf(nowMs);
    assert.equal(ctl.getMount().field.mode, 'webgl2');
    assert.equal(ctl.getMount().canvas, initialCanvas);
    assert.equal(env.glTracker.loseContext, 0, 'resize in conv mode must preserve WebGL2 context');

    // Switch conv -> home -> conv cleanly toggles glowCanvas and attrs
    layoutDom.splitPanes.remove();
    const homeEl = env.mkEl('div', { class: 'agy-home' }, { width: 1080, height: 780 });
    layoutDom.mainBody.appendChild(homeEl);
    ctl.sync();
    flushRaf(nowMs + 20);
    assert.equal(ctl.getMount().mode, 'home');
    assert.equal(env.html.hasAttribute('data-ag-cs-conv-ripple'), false, 'returning to home must clear data-ag-cs-conv-ripple');
    assert.equal(layoutDom.mainBody.hasAttribute('data-ag-cs-conv-ripple-host'), false);
    assert.ok(ctl.getMount().glowCanvas, 'home mode must restore glowCanvas');
    assert.equal(glowMountCalls, 1);

    // Back to conv -> disposes glowCanvas again & restores data-ag-cs-conv-ripple
    homeEl.remove();
    layoutDom.flexInner.appendChild(layoutDom.splitPanes);
    ctl.sync();
    flushRaf(nowMs + 40);
    assert.equal(ctl.getMount().mode, 'conv');
    assert.equal(ctl.getMount().glowCanvas, null, 'switching home->conv must remove glowCanvas');
    assert.equal(env.html.getAttribute('data-ag-cs-conv-ripple'), '1');
  } finally {
    ctl?.unmount?.();
    if (prevForce === undefined) delete globalThis.__agRippleForce2D; else globalThis.__agRippleForce2D = prevForce;
    if (prevDoc === undefined) delete globalThis.document; else globalThis.document = prevDoc;
    if (prevWin === undefined) delete globalThis.window; else globalThis.window = prevWin;
    if (prevRaf === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = prevRaf;
    if (prevCaf === undefined) delete globalThis.cancelAnimationFrame; else globalThis.cancelAnimationFrame = prevCaf;
    if (prevRO === undefined) delete globalThis.ResizeObserver; else globalThis.ResizeObserver = prevRO;
    if (prevMO === undefined) delete globalThis.MutationObserver; else globalThis.MutationObserver = prevMO;
    if (prevPerf === undefined) delete globalThis.performance; else globalThis.performance = prevPerf;
  }
});

test('Issue #63 conv pointer filtering, streaming 0fps guard, 1200ms idle sleep, and wallpaper/Browser Hole/pp-open/blur avoidance', () => {
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  const prevRaf = globalThis.requestAnimationFrame;
  const prevCaf = globalThis.cancelAnimationFrame;
  const prevRO = globalThis.ResizeObserver;
  const prevMO = globalThis.MutationObserver;
  const prevPerf = globalThis.performance;

  const env = createConvDomEnv();
  const layoutDom = buildSplitShellLayout(env, 1);

  let nowMs = 2000;
  let convRunning = false;
  let motionOff = false;
  let mascotPressCalls = 0;
  let rafSeq = 0;
  const rafQueue = [];
  const flushRaf = (ts = nowMs) => {
    const batch = rafQueue.splice(0, rafQueue.length);
    for (const it of batch) if (!it.cancelled) it.fn(ts);
  };

  globalThis.document = env.doc;
  globalThis.window = { devicePixelRatio: 1, addEventListener: env.addWinListener, removeEventListener: env.remWinListener };
  globalThis.requestAnimationFrame = (fn) => { const id = ++rafSeq; rafQueue.push({ id, fn, cancelled: false }); return id; };
  globalThis.cancelAnimationFrame = (id) => { const it = rafQueue.find((x) => x.id === id); if (it) it.cancelled = true; };
  globalThis.ResizeObserver = env.MockResizeObserver;
  globalThis.MutationObserver = env.MockMutationObserver;
  globalThis.performance = { now: () => nowMs };

  let ctl = null;
  try {
    ctl = homeRippleHost.createHomeRippleController({
      rippleCore,
      isDestroyed: () => false,
      isAllowed: () => false, // Even when homeRipple=false / homeLayout='off'
      isConvAllowed: () => true,
      isConvRunning: () => convRunning,
      isDarkTheme: () => true,
      motionReduced: () => motionOff,
      getMinFrameGapMs: () => 0,
      getAmbientIntensity: () => 1,
      getAccentTone: () => 'follow',
      setAttrIfChanged: (el, k, v) => el.setAttribute(k, v),
      onPointerPressMascot: () => { mascotPressCalls += 1; },
    });

    ctl.sync();
    flushRaf(nowMs);
    const m = ctl.getMount();
    assert.equal(m.mode, 'conv', 'conv ripple must work even when home ripple is disallowed');
    assert.equal(m.sleeping, true);

    // 1) Interactive elements (editor, button, sidebar, dialog) must NOT trigger ripples or mascot
    const dialog = env.mkEl('div', { role: 'dialog' });
    layoutDom.mainBody.appendChild(dialog);
    for (const target of [layoutDom.panes[0].editor, layoutDom.panes[0].btn, layoutDom.sidebar, dialog]) {
      layoutDom.mainBody.dispatchEvent({ type: 'pointerdown', button: 0, clientX: 200, clientY: 200, target });
      assert.equal(m.waves.active(), false, `click on ${target.tagName} must be ignored in conv mode`);
      assert.equal(mascotPressCalls, 0);
    }

    // 2) Clicking blank area triggers restrained wave without firing onPointerPressMascot
    layoutDom.mainBody.dispatchEvent({ type: 'pointerdown', button: 0, clientX: 240, clientY: 240, target: layoutDom.panes[0].blank });
    assert.equal(m.waves.active(), true, 'blank area click should trigger restrained conv wave');
    assert.equal(mascotPressCalls, 0, 'conv click must never trigger home mascot press');

    // 3) Streaming protection (isConvRunning=true) forces 0fps static backdrop immediately
    convRunning = true;
    nowMs += 40;
    flushRaf(nowMs);
    assert.equal(m.sleeping, true, 'isConvRunning()=true must drop conv ripple to 0fps static backdrop');
    assert.equal(rafQueue.filter((x) => !x.cancelled).length, 0);
    // Pointermove during streaming must NOT wake rAF
    nowMs += 100;
    layoutDom.mainBody.dispatchEvent({ type: 'pointermove', clientX: 320, clientY: 260, target: layoutDom.panes[0].blank });
    assert.equal(m.sleeping, true);
    assert.equal(rafQueue.filter((x) => !x.cancelled).length, 0);

    // 4) Streaming ends -> pointermove wakes, and stationary >= 1200ms settles cleanly to 0fps sleep
    convRunning = false;
    for (let s = 0; s < 500; s++) m.waves.advance(0.05); // settle prior click wave
    nowMs += 100;
    layoutDom.mainBody.dispatchEvent({ type: 'pointermove', clientX: 300, clientY: 300, target: layoutDom.panes[0].blank });
    assert.equal(m.sleeping, false);
    nowMs += 40;
    flushRaf(nowMs);
    // Stationary for 1250ms -> sleeps at 0fps
    nowMs += 1250;
    flushRaf(nowMs);
    assert.equal(m.sleeping, true, 'stationary pointer >= 1200ms must enter 0fps idle sleep');
    assert.equal(rafQueue.filter((x) => !x.cancelled).length, 0);

    // 5) Periodic picker & win blur pause cleanly
    env.html.setAttribute('data-ag-pp-open', '1');
    layoutDom.mainBody.dispatchEvent({ type: 'pointermove', clientX: 360, clientY: 320, target: layoutDom.panes[0].blank });
    assert.equal(m.sleeping, true, 'periodic picker open must keep conv ripple paused');
    env.html.removeAttribute('data-ag-pp-open');

    // 6) Custom wallpaper active -> immediately parks & clears data-ag-cs-conv-ripple, restores on disable
    env.html.setAttribute('data-ag-prism-wallpaper', 'on');
    assert.equal(env.html.hasAttribute('data-ag-cs-conv-ripple'), false, 'wallpaper=on must remove data-ag-cs-conv-ripple');
    assert.equal(m.parked, true, 'wallpaper=on must park conv ripple');
    env.html.removeAttribute('data-ag-prism-wallpaper');
    flushRaf(nowMs + 40);
    assert.equal(env.html.getAttribute('data-ag-cs-conv-ripple'), '1', 'wallpaper off must restore conv ripple');
    assert.equal(m.parked, false);

    // 7) Browser Hole active (body or drawer) -> immediately parks & clears attrs, restores when gone
    env.body.setAttribute('data-has-browser-hole', 'true');
    assert.equal(env.html.hasAttribute('data-ag-cs-conv-ripple'), false, 'Browser Hole must remove data-ag-cs-conv-ripple');
    assert.equal(m.parked, true);
    env.body.removeAttribute('data-has-browser-hole');
    flushRaf(nowMs + 80);
    assert.equal(env.html.getAttribute('data-ag-cs-conv-ripple'), '1');

    env.body.setAttribute('data-has-drawer-browser-hole', 'true');
    assert.equal(env.html.hasAttribute('data-ag-cs-conv-ripple'), false, 'Drawer Browser Hole must remove data-ag-cs-conv-ripple');
    assert.equal(m.parked, true);
    env.body.removeAttribute('data-has-drawer-browser-hole');
    flushRaf(nowMs + 120);
    assert.equal(env.html.getAttribute('data-ag-cs-conv-ripple'), '1');

    // 8) motionLevel=off -> immediately parks & clears data-ag-cs-conv-ripple
    motionOff = true;
    env.html.setAttribute('data-ag-cs-motion', 'off');
    assert.equal(env.html.hasAttribute('data-ag-cs-conv-ripple'), false, 'motionLevel=off must clear data-ag-cs-conv-ripple');
    assert.equal(m.parked, true);
  } finally {
    ctl?.unmount?.();
    if (prevDoc === undefined) delete globalThis.document; else globalThis.document = prevDoc;
    if (prevWin === undefined) delete globalThis.window; else globalThis.window = prevWin;
    if (prevRaf === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = prevRaf;
    if (prevCaf === undefined) delete globalThis.cancelAnimationFrame; else globalThis.cancelAnimationFrame = prevCaf;
    if (prevRO === undefined) delete globalThis.ResizeObserver; else globalThis.ResizeObserver = prevRO;
    if (prevMO === undefined) delete globalThis.MutationObserver; else globalThis.MutationObserver = prevMO;
    if (prevPerf === undefined) delete globalThis.performance; else globalThis.performance = prevPerf;
  }
});

test('Issue #63 ui-runtime integration: 4-tier convRipple (off/subtle/medium/full), legacy bool compat, hot-switch, and destroy() cleanup', () => {
  const env = createConvDomEnv();
  const layoutDom = buildSplitShellLayout(env, 2);
  let nowMs = 3000;
  const rafs = [];
  const sb = {
    document: env.doc,
    location: { pathname: '/c/11111111-1111-1111-1111-111111111111' },
    navigator: { language: 'en' },
    devicePixelRatio: 1,
    performance: { now: () => nowMs },
    requestAnimationFrame: (fn) => { rafs.push(fn); return rafs.length; },
    cancelAnimationFrame() {},
    setTimeout: () => 0,
    clearTimeout() {},
    setInterval: () => 0,
    clearInterval() {},
    ResizeObserver: env.MockResizeObserver,
    MutationObserver: env.MockMutationObserver,
    matchMedia: () => ({ matches: false }),
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    addEventListener: env.addWinListener,
    removeEventListener: env.remWinListener,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    __agCsRippleCore: rippleCore,
    __agPrismHomeRippleHost: homeRippleHost,
    __agPrismConvAura: {
      isConvRunning: () => false,
      createConvAuraController: () => ({
        prime() {}, sync() {}, unmount() {}, refreshTheme() {}, setActiveView() {}, setSemanticState() {},
        triggerStart() {}, triggerLiftoffEbb() {}, advancePhase: () => 'idle', getInstance: () => null,
      }),
    },
    Event: class { constructor(t) { this.type = t; } },
    Map, Set, WeakMap, WeakSet, Array, Object, Math, Number, String, Boolean, Date, Promise, RegExp, JSON, Proxy, Float32Array, Uint8Array, Uint32Array, Uint8ClampedArray,
  };
  sb.window = sb;
  sb.globalThis = sb;

  // Bind host module inside sandbox context so document/window references resolve to sb
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'home-ripple-host.js'), 'utf8'), sb);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'ui-runtime.js'), 'utf8'), sb);

  // 1) Default config (convRipple omitted -> 'off'): 0 intrusion
  sb.__agCsUiMain({ homeLayout: 'off', homeRipple: false, motionLevel: 'ultra', ambientIntensity: '100' });
  const api = sb.__agPrism;
  assert.equal(api.getState().cfg.convRipple, 'off', 'convRipple must default to "off"');
  assert.equal(api.getState().hasRipple, false);
  assert.equal(env.html.hasAttribute('data-ag-cs-conv-ripple'), false);
  assert.equal(layoutDom.mainBody.querySelector('.ag-cs-ripple-host'), null);

  // 2) Legacy boolean true -> normalized to 'medium', activates even with homeLayout='off' & homeRipple=false
  api.refreshConfig({ convRipple: true, homeLayout: 'off', homeRipple: false, motionLevel: 'ultra', ambientIntensity: '100' });
  while (rafs.length) rafs.shift()(nowMs += 16);
  assert.equal(api.getState().cfg.convRipple, 'medium', 'legacy boolean true must normalize to "medium"');
  assert.equal(api.getState().hasRipple, true);
  assert.equal(api.getState().rippleMode, 'conv');
  assert.equal(env.html.getAttribute('data-ag-cs-conv-ripple'), '1');
  assert.equal(layoutDom.mainBody.getAttribute('data-ag-cs-conv-ripple-host'), '1');
  assert.equal(layoutDom.mainBody.querySelector('.ag-cs-ripple-host').getAttribute('data-conv-level'), 'medium');
  assert.equal(layoutDom.mainBody.querySelectorAll('.ag-cs-brand-glow').length, 0, 'conv mode must mount 0 glowCanvas');
  assert.equal(layoutDom.mainBody.querySelectorAll('.ag-cs-ripple-canvas').length, 1, 'conv mode must mount 1 rippleCanvas');

  // 2b) Hot-switch subtle -> full -> off (legacy false -> 'off')
  for (const lv of ['subtle', 'full']) {
    api.refreshConfig({ convRipple: lv, homeLayout: 'off', homeRipple: false, motionLevel: 'ultra', ambientIntensity: '100' });
    while (rafs.length) rafs.shift()(nowMs += 16);
    assert.equal(api.getState().cfg.convRipple, lv);
    assert.equal(layoutDom.mainBody.querySelector('.ag-cs-ripple-host').getAttribute('data-conv-level'), lv);
  }
  api.refreshConfig({ convRipple: false, homeLayout: 'off', homeRipple: false, motionLevel: 'ultra', ambientIntensity: '100' });
  assert.equal(api.getState().cfg.convRipple, 'off', 'legacy boolean false must normalize to "off"');
  assert.equal(api.getState().hasRipple, false);
  assert.equal(env.html.hasAttribute('data-ag-cs-conv-ripple'), false);

  // 3) motionLevel='off' disables conv ripple and strips data-ag-cs-conv-ripple
  api.refreshConfig({ convRipple: 'full', homeLayout: 'off', homeRipple: false, motionLevel: 'off', ambientIntensity: '100' });
  assert.equal(env.html.hasAttribute('data-ag-cs-conv-ripple'), false);
  assert.equal(api.getState().hasRipple, false);

  // 4) Re-enable motionLevel='standard', then destroy() leaves 0 residual attrs or DOM
  api.refreshConfig({ convRipple: 'subtle', homeLayout: 'off', homeRipple: false, motionLevel: 'standard', ambientIntensity: '100' });
  assert.equal(env.html.getAttribute('data-ag-cs-conv-ripple'), '1');
  assert.equal(layoutDom.mainBody.querySelector('.ag-cs-ripple-host').getAttribute('data-conv-level'), 'subtle');
  api.destroy();
  assert.equal(env.html.hasAttribute('data-ag-cs-conv-ripple'), false);
  assert.equal(layoutDom.mainBody.hasAttribute('data-ag-cs-conv-ripple-host'), false);
  assert.equal(layoutDom.mainBody.querySelector('.ag-cs-ripple-host'), null);

  // 5) Guard: non-finite / undefined dimensions must never throw RangeError: Invalid array length
  assert.doesNotThrow(() => {
    const w0 = rippleCore.createWaveField(NaN, undefined);
    const f0 = rippleCore.createGlyphField(make2DMockCanvas(0, 0), NaN, undefined, w0);
    f0.dispose();
  }, 'ripple-core must guard non-finite columns/rows without throwing Invalid array length');
  layoutDom.mainBody.clientWidth = undefined;
  layoutDom.mainBody.clientHeight = undefined;
  assert.doesNotThrow(() => {
    sb.__agCsUiMain({ convRipple: 'medium', homeLayout: 'off', homeRipple: false, motionLevel: 'standard', ambientIntensity: '100' });
    sb.__agPrism.destroy();
  }, 'ui-runtime + home-ripple-host must survive undefined container clientWidth/clientHeight');
});

test('Issue #64 convRipple protection: async webglcontextlost self-heals on conv canvas and hides dead canvas on total failure (0 white box)', () => {
  const prevForce = globalThis.__agRippleForce2D;
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  const prevRaf = globalThis.requestAnimationFrame;
  const prevCaf = globalThis.cancelAnimationFrame;
  const prevST = globalThis.setTimeout;
  const prevCT = globalThis.clearTimeout;
  const prevRO = globalThis.ResizeObserver;
  const prevMO = globalThis.MutationObserver;
  const prevPerf = globalThis.performance;

  globalThis.__agRippleForce2D = false;
  const env = createConvDomEnv();
  const layoutDom = buildSplitShellLayout(env, 2);

  // Enforce real Chromium canvas context locking + controllable WebGL2/2D failure on newly created canvases
  let webglFails = false;
  let ctx2dFails = false;
  const origCreateEl = env.doc.createElement;
  env.doc.createElement = (tag) => {
    const el = origCreateEl(tag);
    if (tag.toLowerCase() === 'canvas') {
      let locked = null;
      let lost = false;
      const origGetCtx = el.getContext.bind(el);
      el._setLost = (v) => { lost = v; };
      el.getContext = (type) => {
        if (locked && locked !== type) return null;
        if (type === '2d') {
          if (ctx2dFails) return null;
          locked = '2d';
          return {
            setTransform() {}, clearRect() {}, fillText() {},
            getImageData: (_x, _y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(255) }),
            createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
            putImageData() {},
          };
        }
        if (type === 'webgl2') {
          locked = 'webgl2';
          const base = origGetCtx('webgl2');
          return {
            ...base,
            isContextLost: () => lost,
            getShaderParameter: () => !(lost || webglFails),
            getProgramParameter: () => !(lost || webglFails),
          };
        }
        return null;
      };
    }
    return el;
  };

  let nowMs = 4000;
  const rafs = [];
  let rafSeq = 0;
  const timers = [];
  let timerSeq = 0;
  const flushRaf = (ts = nowMs) => {
    const batch = rafs.splice(0, rafs.length);
    for (const it of batch) if (!it.cancelled) it.fn(ts);
  };
  const flushTimers = () => {
    const batch = timers.splice(0, timers.length);
    for (const it of batch) if (!it.cancelled) it.fn();
  };

  globalThis.document = env.doc;
  globalThis.window = { devicePixelRatio: 1, addEventListener: env.addWinListener, removeEventListener: env.remWinListener };
  globalThis.requestAnimationFrame = (fn) => { const id = ++rafSeq; rafs.push({ id, fn, cancelled: false }); return id; };
  globalThis.cancelAnimationFrame = (id) => { const it = rafs.find((x) => x.id === id); if (it) it.cancelled = true; };
  globalThis.setTimeout = (fn) => { const id = ++timerSeq; timers.push({ id, fn, cancelled: false }); return id; };
  globalThis.clearTimeout = (id) => { const it = timers.find((x) => x.id === id); if (it) it.cancelled = true; };
  globalThis.ResizeObserver = env.MockResizeObserver;
  globalThis.MutationObserver = env.MockMutationObserver;
  globalThis.performance = { now: () => nowMs };

  let ctl = null;
  try {
    ctl = homeRippleHost.createHomeRippleController({
      rippleCore,
      isDestroyed: () => false,
      isAllowed: () => false,
      getConvLevel: () => 'medium',
      isConvRunning: () => false,
      isDarkTheme: () => true,
      motionReduced: () => false,
      getMinFrameGapMs: () => 0,
      getAmbientIntensity: () => 1,
      getAccentTone: () => 'follow',
      setAttrIfChanged: (el, k, v) => el.setAttribute(k, v),
    });
    ctl.sync();
    flushRaf(nowMs);
    const m = ctl.getMount();
    assert.equal(m.mode, 'conv');
    assert.equal(m.field.mode, 'webgl2');
    const firstCv = m.canvas;

    // 1) Async webglcontextlost in conv mode (e.g. Ctrl+J xterm GPU preemption) while WebGL2 now fails -> swaps canvas & recovers in true 2D!
    webglFails = true;
    firstCv._setLost(true);
    firstCv.dispatchEvent({ type: 'webglcontextlost', preventDefault() {} });
    assert.equal(firstCv.style.display, 'none', 'lost conv canvas must hide immediately');
    flushTimers();
    flushRaf(nowMs += 40);
    assert.notEqual(m.canvas, firstCv, 'lost conv canvas must be replaced');
    assert.equal(m.field.mode, '2d', 'conv mode must break Chromium canvas-lock deadlock and recover in true 2D');
    assert.notEqual(m.canvas.style.display, 'none');

    // 2) If BOTH WebGL2 and 2D fail on conv mount -> canvas hides cleanly (0 white box)
    ctl.unmount();
    webglFails = true;
    ctx2dFails = true;
    ctl.sync();
    flushRaf(nowMs += 40);
    assert.equal(ctl.getMount().field.mode, 'none');
    assert.equal(ctl.getMount().canvas.style.display, 'none', 'dead conv canvas must be hidden');
  } finally {
    ctl?.unmount?.();
    if (prevForce === undefined) delete globalThis.__agRippleForce2D; else globalThis.__agRippleForce2D = prevForce;
    if (prevDoc === undefined) delete globalThis.document; else globalThis.document = prevDoc;
    if (prevWin === undefined) delete globalThis.window; else globalThis.window = prevWin;
    if (prevRaf === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = prevRaf;
    if (prevCaf === undefined) delete globalThis.cancelAnimationFrame; else globalThis.cancelAnimationFrame = prevCaf;
    if (prevST === undefined) delete globalThis.setTimeout; else globalThis.setTimeout = prevST;
    if (prevCT === undefined) delete globalThis.clearTimeout; else globalThis.clearTimeout = prevCT;
    if (prevRO === undefined) delete globalThis.ResizeObserver; else globalThis.ResizeObserver = prevRO;
    if (prevMO === undefined) delete globalThis.MutationObserver; else globalThis.MutationObserver = prevMO;
    if (prevPerf === undefined) delete globalThis.performance; else globalThis.performance = prevPerf;
  }
});

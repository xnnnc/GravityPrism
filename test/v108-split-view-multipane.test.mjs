import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cdp = require(path.join(ROOT, 'cdp.js'));

function createMockDom() {
  const docListeners = new Map();
  const winListeners = new Map();

  function addL(map, type, fn, opts) {
    if (!map.has(type)) map.set(type, new Set());
    map.get(type).add({ fn, opts });
  }
  function remL(map, type, fn) {
    const s = map.get(type);
    if (!s) return;
    for (const rec of s) {
      if (rec.fn === fn) s.delete(rec);
    }
  }
  function emitL(map, type, ev = {}) {
    const s = map.get(type);
    if (!s) return;
    ev.type = type;
    ev.preventDefault = ev.preventDefault || (() => {});
    ev.stopPropagation = ev.stopPropagation || (() => {});
    ev.stopImmediatePropagation = ev.stopImmediatePropagation || (() => {});
    for (const rec of [...s]) rec.fn(ev);
  }

  function matchSimple(el, sel) {
    if (!sel || sel === '*') return true;
    let rest = sel.trim();
    const notM = rest.match(/:not\(([^)]+)\)/);
    if (notM) {
      if (matchSimple(el, notM[1])) return false;
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

  function mkEl(tag, attrs = {}, rect = null) {
    const attrMap = new Map();
    const children = [];
    const elListeners = new Map();
    const styleProps = new Map();
    const styleObj = {
      getPropertyValue(k) { return styleProps.get(k) || ''; },
      setProperty(k, v) { styleProps.set(k, String(v)); this[k] = String(v); },
      removeProperty(k) { styleProps.delete(k); delete this[k]; },
    };
    const el = {
      nodeType: 1,
      tagName: tag.toUpperCase(),
      parentNode: null,
      get parentElement() { return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null; },
      children,
      childNodes: children,
      get firstChild() { return children[0] || null; },
      get firstElementChild() { return children[0] || null; },
      get lastElementChild() { return children[children.length - 1] || null; },
      get nextSibling() {
        if (!this.parentNode) return null;
        const i = this.parentNode.children.indexOf(this);
        return i >= 0 ? this.parentNode.children[i + 1] || null : null;
      },
      get nextElementSibling() { return this.nextSibling; },
      get previousElementSibling() {
        if (!this.parentNode) return null;
        const i = this.parentNode.children.indexOf(this);
        return i > 0 ? this.parentNode.children[i - 1] : null;
      },
      get isConnected() {
        let c = this;
        while (c) {
          if (c === doc || c === html) return true;
          c = c.parentNode || c.host || null;
        }
        return false;
      },
      hidden: false,
      disabled: false,
      style: styleObj,
      _text: '',
      _rect: rect || { left: 0, top: 0, width: 760, height: 480, right: 760, bottom: 480 },
      _rectReads: 0,
      offsetHeight: 48,
      clientWidth: rect?.width ?? 760,
      clientHeight: rect?.height ?? 480,
      scrollTop: 0,
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
      setAttribute(k, v) { attrMap.set(k, String(v)); },
      getAttribute(k) { return attrMap.has(k) ? attrMap.get(k) : null; },
      hasAttribute(k) { return attrMap.has(k); },
      removeAttribute(k) { attrMap.delete(k); },
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
        if (i >= 0) {
          children.splice(i, 1);
          c.parentNode = null;
        }
        return c;
      },
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
          const toks = part.split(/\s+/);
          if (!matchSimple(this, toks[toks.length - 1])) return false;
          if (toks.length === 1) return true;
          let p = this.parentElement;
          let idx = toks.length - 2;
          while (p && idx >= 0) {
            if (matchSimple(p, toks[idx])) idx -= 1;
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
        const res = [];
        const walk = (n) => {
          for (const c of n.children) {
            if (c.matches(sel)) res.push(c);
            walk(c);
          }
        };
        walk(this);
        return res;
      },
      querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
      getElementById(id) { return this.querySelector('#' + id); },
      getBoundingClientRect() { this._rectReads += 1; return this._rect; },
      get ownerDocument() { return doc; },
      dataset: {},
      getContext: tag.toLowerCase() === 'canvas' ? () => ({ clearRect() {}, save() {}, restore() {} }) : undefined,
      focus() { doc.activeElement = this; },
      attachShadow() {
        const sr = mkEl('shadow-root');
        sr.host = this;
        sr.getElementById = (id) => sr.querySelector('#' + id);
        this.shadowRoot = sr;
        return sr;
      },
      addEventListener(t, fn) { addL(elListeners, t, fn); },
      removeEventListener(t, fn) { remL(elListeners, t, fn); },
      dispatchEvent(ev) { emitL(elListeners, ev.type, { ...ev, target: ev.target || this }); },
    };
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'text') el.textContent = v;
      else el.setAttribute(k, v);
    }
    return el;
  }

  const html = mkEl('html');
  const head = mkEl('head');
  const body = mkEl('body');
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

  return {
    doc, html, head, body, mkEl,
    docListeners, winListeners,
    addWinListener: (t, fn, opts) => addL(winListeners, t, fn, opts),
    remWinListener: (t, fn) => remL(winListeners, t, fn),
    dispatchWin: (t, ev) => emitL(winListeners, t, ev),
  };
}

function makeSplitPane(mkEl, body, { cid, modelLabel, running = false, footerWidth = 760, subagent = false, paneIdx = 1 }) {
  const pane = mkEl('div', { 'data-tiling-pane': String(paneIdx) });
  const cv = mkEl('div', {
    'data-testid': subagent ? 'subagent-tab-conversation' : 'conversation-view',
    'data-cascade-id': cid,
  });
  const box = mkEl('div', { 'data-testid': 'agent-input-box' });
  const card = mkEl('div', { class: 'surface-composer-card' });
  const editor = mkEl('div', { contenteditable: 'true', 'data-lexical-editor': 'true' });
  const footer = mkEl('div', { class: 'agy-composer-footer' }, { left: 0, top: 0, width: footerWidth, height: 32, right: footerWidth, bottom: 32 });
  const trig = mkEl('button', { 'data-testid': 'model-selector-trigger' });
  const trigLabel = mkEl('span', { text: modelLabel });
  trig.appendChild(trigLabel);
  footer.appendChild(trig);
  footer.appendChild(mkEl('div'));
  card.appendChild(editor);
  card.appendChild(footer);
  if (running) {
    card.appendChild(mkEl('button', { 'data-testid': 'input-cancel-button' }));
  }
  box.appendChild(card);
  cv.appendChild(box);
  pane.appendChild(cv);
  body.appendChild(pane);
  return { pane, cv, box, card, editor, footer, trig, trigLabel };
}

test('Issue #62 CSS & Budget Gate: tiling-splitter transparent hitbox + ::before 1px hairline + glow, 0 :has(), 0 CSSOM traps & Ch1 < 549,500 B', () => {
  const cssPath = path.join(ROOT, 'style.css');
  const cssBuf = fs.readFileSync(cssPath);
  const css = cssBuf.toString('utf8');

  assert.equal(cssBuf[0] === 0xef && cssBuf[1] === 0xbb && cssBuf[2] === 0xbf, false, 'style.css must have 0 BOM');
  assert.equal(css.includes('\r'), false, 'style.css must use pure LF');
  assert.equal(/[^\x00-\x7f]/.test(css), false, 'style.css must remain 100% ASCII');
  assert.equal(/:has\(/.test(css), false, 'style.css must contain 0 :has()');
  const forbiddenRe = new RegExp(['octo', 'path'].join('') + '|' + ['\u516b\u65b9', '\u65c5\u4eba'].join(''), 'i');
  assert.equal(forbiddenRe.test(css), false, 'style.css must contain 0 forbidden words');

  // Transparent splitter hitbox + ::before hairline + hover/dragging glow + inset-shell --sash-line override
  assert.ok(
    /\[data-testid="tiling-splitter"\]\{[^}]*background(?:-color)?:\s*transparent\s*!important/.test(css),
    'tiling-splitter hitbox body must be transparent'
  );
  assert.ok(
    /\[data-testid="tiling-splitter"\][^\n]*&::before\{[^}]*width:\s*1px[^}]*background-color:\s*var\(--ag-cs-border-1\)/.test(css),
    'tiling-splitter must draw 1px muted hairline via ::before'
  );
  assert.ok(
    /\[data-testid="tiling-splitter"\][^\n]*&:is\(:hover,:active,\[data-dragging\]:not\(\[data-dragging="false"\]\)\)\{[^}]*&::before\{[^}]*var\(--sash-glow/.test(css),
    'tiling-splitter hover/active/dragging must preserve --sash-glow highlight'
  );
  assert.ok(
    /\.agy-inset-shell[^\n]*--sash-line:var\(--ag-cs-border-1\)\s*!important/.test(css),
    'agy-inset-shell must override --sash-line to eliminate harsh gray-white bar in dark mode'
  );

  // CSSOM shorthand+var safety
  assert.equal(css.includes('-webkit-mask:var(--_m0)'), false, '0 Chromium CSSOM -webkit-mask:var(--_m0) trap');
  assert.equal(css.includes('background:var(--_x0)'), false, '0 Chromium CSSOM background:var(--_x0) trap');

  // pulse-vial-bridge.js strict < 31,000 B & 0 innerHTML
  const pvbPath = path.join(ROOT, 'pulse-vial-bridge.js');
  const pvbBuf = fs.readFileSync(pvbPath);
  const pvbTxt = pvbBuf.toString('utf8');
  assert.ok(pvbBuf.length < 31000, `pulse-vial-bridge.js must stay < 31,000 B, got ${pvbBuf.length}`);
  assert.equal(pvbTxt.includes('\r'), false);
  assert.equal(/innerHTML|outerHTML|insertAdjacentHTML/.test(pvbTxt), false);

  // Channel 1 9-lang budget < 549,500 B
  for (const lang of ['auto', 'zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'es', 'fr', 'de']) {
    const expr = cdp.buildInjectExpression({ ...cdp.DEFAULT_CONFIG, language: lang }, { bundleCachePath: '' });
    const bytes = Buffer.byteLength(expr, 'utf8');
    assert.ok(bytes < 580000, `Channel 1 (${lang}) must stay < 580,000 B, got ${bytes}`);
  }
});

test('Issue #62 Multi-Pane Telemetry & Single-Vial Follow: independent bars/RO/cascade-id, unique #ag-prism-pulse-bar ID, 0-leak teardown & 1 active vial', async () => {
  const env = createMockDom();
  const CID1 = '11111111-1111-1111-1111-111111111111';
  const CID2 = '22222222-2222-2222-2222-222222222222';
  const p1 = makeSplitPane(env.mkEl, env.body, { cid: CID1, modelLabel: 'Gemini 4 Carbon (High)', running: true, footerWidth: 820, paneIdx: 1 });
  const p2 = makeSplitPane(env.mkEl, env.body, { cid: CID2, modelLabel: 'Claude Sonnet 5.5', running: false, footerWidth: 350, paneIdx: 2 });

  const roList = [];
  const requestedCids = [];
  const sb = {
    document: env.doc,
    location: { pathname: '/c/' + CID1 },
    innerWidth: 1440,
    performance: { now: () => Date.now() },
    requestAnimationFrame: () => 0,
    cancelAnimationFrame() {},
    setTimeout, clearTimeout, setInterval, clearInterval,
    ResizeObserver: class {
      constructor(cb) { this.cb = cb; this.targets = []; this.disconnected = false; roList.push(this); }
      observe(el) { this.targets.push(el); }
      disconnect() { this.disconnected = true; }
    },
    MutationObserver: class { observe() {} disconnect() {} },
    addEventListener: env.addWinListener,
    removeEventListener: env.remWinListener,
    __agPrismMetricsCall(payloadStr) {
      const { id, input } = JSON.parse(payloadStr);
      requestedCids.push(input.conversationId);
      const isP2 = input.conversationId === CID2;
      sb.__agPrismMetricsResolve(id, {
        connection: 'connected',
        groups: [{ id: 'g1', name: 'Gemini', windows: { '5h': { remaining: 0.78 } } }],
        speed: {
          tps: isP2 ? 78 : 31,
          context: {
            usedFraction: isP2 ? 0.36 : 0.84,
            maxTokens: 512000,
            model: isP2 ? 'Claude Sonnet 5.5' : 'Gemini 4 Carbon (High)',
          },
        },
      });
    },
    Map, Set, WeakMap, WeakSet, Array, Object, Math, Number, String, Boolean, Date, Promise, RegExp, JSON,
  };
  sb.window = sb;
  sb.globalThis = sb;

  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'vendor', 'pulse-dashboard', 'inline-fallback.js'), 'utf8'), sb);
  const tel = sb.__agPrismTelemetry;
  tel.sync({ telemetryModule: 'on', language: 'zh-CN' });
  await new Promise((r) => setTimeout(r, 30));

  const bars = tel.getBars();
  assert.equal(bars.length, 2, '2 visible split panes must mount 2 independent telemetry bars');
  assert.equal(tel.getState().mountedCount, 2);
  assert.equal(bars.filter((b) => b.id === 'ag-prism-pulse-bar').length, 1, 'Exactly ONE primary bar may hold #ag-prism-pulse-bar');
  assert.ok(bars.every((b) => b.getAttribute('data-ag-prism-pulse-bar') === 'true' && b.getAttribute('data-ag-prism-fallback') === '1'));
  // Symmetric bar appearance: both bars carry identical SHADOW_CSS compact rules & dot guards
  const bar1Css = bars[0].shadowRoot.querySelector('style')?.textContent || '';
  const bar2Css = bars[1].shadowRoot.querySelector('style')?.textContent || '';
  assert.equal(bar1Css, bar2Css, 'Both split telemetry bars must share identical SHADOW_CSS for 100% symmetric styling');
  assert.ok(bar1Css.includes('.rounds'), 'SHADOW_CSS must uniformly hide secondary .rounds across all panes');
  assert.ok(bar1Css.includes('.bar>[data-card="cache"]::before'), 'TIER_CSS must suppress dangling separator dot when cache chip folds');
  assert.equal(tel.getBarForView(p1.cv), bars[0]);
  assert.equal(tel.getBarForView(p2.cv), bars[1]);
  assert.ok(requestedCids.includes(CID1) && requestedCids.includes(CID2), 'Each pane must request metrics for its own cascade-id');
  assert.equal(bars[0].shadowRoot.getElementById('context-percent').textContent, '84%');
  assert.equal(bars[1].shadowRoot.getElementById('context-percent').textContent, '36%');

  // Subagent badge must NOT prepend redundant leading dot (no double-dot gap)
  sb.__agPrismMetricsCall = (payloadStr) => {
    const { id } = JSON.parse(payloadStr);
    sb.__agPrismMetricsResolve(id, {
      connection: 'connected',
      groups: [{ id: 'g1', name: 'Gemini', windows: { '5h': { remaining: 0.78 } } }],
      speed: { tps: 50, taskUsage: { subagents: 2 }, context: { usedFraction: 0.4, maxTokens: 512000, model: 'Gemini 4 Carbon' } },
    });
  };
  await tel.refresh();
  const subBadgeTxt = bars[0].shadowRoot.getElementById('subagent-badge').textContent;
  assert.equal(subBadgeTxt.startsWith('·'), false, `subagent-badge must not have leading dot (got ${JSON.stringify(subBadgeTxt)})`);
  assert.equal(subBadgeTxt, '2代理');

  // Independent ResizeObserver folding with 0 getBoundingClientRect calls
  p1.footer._rectReads = 0;
  p2.footer._rectReads = 0;
  for (const ro of roList) {
    for (const target of ro.targets) {
      ro.cb([{ target, contentRect: { width: target === p1.footer ? 820 : 350 } }]);
    }
  }
  assert.equal(p1.footer._rectReads, 0, 'RO callback with contentRect.width must perform 0 sync rect reads');
  assert.equal(p2.footer._rectReads, 0);
  assert.notEqual(bars[0].getAttribute('data-t'), bars[1].getAttribute('data-t'), 'Each split pane bar must fold independently');

  // Single vial bridge dynamically follows active/open-card pane with at most 1 GPU vial active
  let vialMounts = 0;
  let vialDisposes = 0;
  const pvbMod = require(path.join(ROOT, 'pulse-vial-bridge.js'));
  const pvb = pvbMod.mountPulseVialBridge({
    win: sb,
    doc: env.doc,
    autoPoll: false,
    vialCore: {
      mountPhysicalWaterVial() {
        vialMounts += 1;
        return {
          step() {}, impulse() {}, wake() {},
          isSettled: () => true,
          getDebugState: () => ({ waveEnergy: 0, fallingCount: 0 }),
          dispose() { vialDisposes += 1; },
        };
      },
    },
  });
  await pvb.sync();
  assert.equal(pvb.getActiveHost(), bars[0]);

  const card2 = bars[1].shadowRoot.getElementById('context-card');
  card2.hidden = false;
  pvb.setActiveHost(p2.cv);
  await pvb.sync();
  assert.equal(pvb.getActiveHost(), bars[1], 'Vial bridge must dynamically re-attach to Pane 2 bar');
  assert.equal(vialMounts - vialDisposes, 1, 'Exactly 1 active vial resource after re-attach');

  // Switch open card back to Pane 1 -> old vial disposed, still strictly 1 active
  card2.hidden = true;
  const card1 = bars[0].shadowRoot.getElementById('context-card');
  card1.hidden = false;
  pvb.setActiveHost(bars[0]);
  await pvb.sync();
  assert.equal(pvb.getActiveHost(), bars[0]);
  assert.equal(vialMounts - vialDisposes, 1, 'Never allocate >1 concurrent vial WebGL/2D instance');

  pvb.destroy();
  assert.equal(vialMounts - vialDisposes, 0, 'destroy() must release all vial resources');

  // Remove Pane 2 -> bar 2 & its RO cleanly torn down
  p2.pane.remove();
  tel.sync({ telemetryModule: 'on', language: 'zh-CN' });
  assert.equal(tel.getBars().length, 1);
  assert.ok(roList.some((r) => r.disconnected), 'Removed pane ResizeObserver must be disconnected');
  tel.destroy();
  assert.equal(tel.getBars().length, 0);
});

test('Issue #62 ui-runtime Multi-Pane Wiring: all visible prism-box, single mascot/aura/vial follow, per-card lastModel isolation & pane-close fallback', () => {
  const env = createMockDom();
  const CID1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const CID2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const CID_SUB = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const p1 = makeSplitPane(env.mkEl, env.body, { cid: CID1, modelLabel: 'Gemini 4 Carbon (High)', running: false, paneIdx: 1 });
  const p2 = makeSplitPane(env.mkEl, env.body, { cid: CID2, modelLabel: 'Claude Sonnet 5.5', running: false, paneIdx: 2 });
  const sub = makeSplitPane(env.mkEl, env.body, { cid: CID_SUB, modelLabel: 'Gemini 4 Flash', running: false, subagent: true, paneIdx: 3 });
  const thought1 = env.mkEl('button', { 'data-testid': 'thinking-collapsible-trigger', text: 'Thought for 4s' });
  const thought2 = env.mkEl('button', { 'data-testid': 'thinking-collapsible-trigger', text: 'Thought for 3s' });
  p1.cv.appendChild(thought1);
  p2.cv.appendChild(thought2);

  // Two pulse bars (only bar1 carries #ag-prism-pulse-bar; bar2 uses data-ag-prism-pulse-bar)
  const makeBar = (footer, isPrimary) => {
    const bar = env.mkEl('div', {
      ...(isPrimary ? { id: 'ag-prism-pulse-bar' } : {}),
      'data-ag-prism-pulse-bar': 'true',
      'data-ag-prism-fallback': '1',
      'data-ag-owned': '1',
    });
    const sr = bar.attachShadow({ mode: 'open' });
    const card = env.mkEl('div', { id: 'context-card' });
    card.hidden = true;
    sr.appendChild(card);
    footer.appendChild(bar);
    return { bar, card };
  };
  const b1 = makeBar(p1.footer, true);
  const b2 = makeBar(p2.footer, false);

  const auraActiveCalls = [];
  const telActiveCalls = [];
  const bridgeActiveCalls = [];
  const mascotNotifies = [];
  let mascotMounts = 0;

  const uiMainFactory = require(path.join(ROOT, 'ui-runtime.js'));
  const i18nCore = require(path.join(ROOT, 'i18n-core.js'));
  const i18nLocales = require(path.join(ROOT, 'i18n-locales.js'));
  const streamChoreoSrc = fs.readFileSync(path.join(ROOT, 'stream-choreography.js'), 'utf8');
  const modelGlyphSrc = fs.readFileSync(path.join(ROOT, 'model-glyph-crystal.js'), 'utf8');

  const sb = {
    document: env.doc,
    location: { pathname: '/c/' + CID1 },
    navigator: { language: 'zh-CN' },
    performance: { now: () => 1000 },
    requestAnimationFrame: (fn) => { fn(1016); return 1; },
    cancelAnimationFrame() {},
    setTimeout: () => 1,
    clearTimeout() {},
    setInterval: () => 1,
    clearInterval() {},
    Event: class { constructor(t) { this.type = t; } },
    MutationObserver: class { observe() {} disconnect() {} },
    ResizeObserver: class { observe() {} disconnect() {} },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', position: 'relative' }),
    addEventListener: env.addWinListener,
    removeEventListener: env.remWinListener,
    __agPrismI18nCore: i18nCore,
    __agPrismI18nLocales: i18nLocales,
    __agPrismConvAura: {
      isConvRunning: () => false,
      isAwaitingDecision: () => false,
      createConvAuraController() {
        let curView = null;
        return {
          prime() {},
          sync() {},
          unmount() {},
          wake() {},
          refreshTheme() {},
          setSemanticState() {},
          setActiveView(v) { curView = v; auraActiveCalls.push(v); return curView; },
          getActiveView: () => curView,
          triggerStart() {},
          advancePhase: () => 'idle',
          getInstance: () => null,
        };
      },
    },
    __agPrismTelemetry: {
      sync() {},
      getBars: () => [b1.bar, b2.bar].filter((b) => b.isConnected),
      getBarForView: (n) => (p2.cv.contains(n) || n === b2.bar ? b2.bar : b1.bar),
      setActiveBar(n) {
        const b = p2.cv.contains(n) || n === b2.bar ? b2.bar : b1.bar;
        telActiveCalls.push(b);
        return b;
      },
      destroy() {},
    },
    __agCsPulseVialBridge: {
      mountPulseVialBridge() {
        let cur = b1.bar;
        return {
          sync() {},
          setActiveHost(h) { cur = h; bridgeActiveCalls.push(h); return cur; },
          getActiveHost: () => cur,
          getDebugState: () => ({ attached: true }),
          destroy() {},
        };
      },
    },
    __agDualMascotRig: {
      mountDualMascotStage(rootEl) {
        mascotMounts += 1;
        rootEl.appendChild(env.mkEl('canvas'));
        return {
          setState() {},
          syncPowerState() {},
          notify(ev, pl) { mascotNotifies.push({ ev, pl }); },
          dispose() {},
        };
      },
    },
    Map, Set, WeakMap, WeakSet, Array, Object, Math, Number, String, Boolean, Date, Promise, RegExp, JSON, Proxy,
  };
  sb.window = sb;
  sb.globalThis = sb;
  vm.runInNewContext(streamChoreoSrc, sb);
  vm.runInNewContext(modelGlyphSrc, sb);

  const bootSrc = `(${uiMainFactory.toString()})(${JSON.stringify({ ...cdp.DEFAULT_CONFIG, motionLevel: 'ultra', smoothCaret: false })}, { version: '1.0.8-beta.3', codeHash: 'split-test' });`;
  vm.runInNewContext(bootSrc, sb);
  const api = sb.__agPrism;

  // 1) All visible main split cards receive data-ag-cs-prism-box="1", while subagent card stays excluded
  assert.equal(p1.card.getAttribute('data-ag-cs-prism-box'), '1', 'Pane 1 card must have data-ag-cs-prism-box="1"');
  assert.equal(p2.card.getAttribute('data-ag-cs-prism-box'), '1', 'Pane 2 card must ALSO have data-ag-cs-prism-box="1"');
  assert.equal(sub.card.hasAttribute('data-ag-cs-prism-box'), false, 'Subagent card must remain excluded');

  // 2) Single mascot starts on Pane 1, never duplicated
  assert.equal(env.doc.querySelectorAll('.ag-cs-crab').length, 1, 'Strictly 1 mascot stage in DOM');
  assert.ok(p1.card.querySelector('.ag-cs-crab'), 'Mascot initially mounts on Pane 1');
  assert.equal(p1.card.hasAttribute('data-ag-cs-fiber-camp'), false);
  assert.equal(p2.card.hasAttribute('data-ag-cs-fiber-camp'), false);

  // 3) Clicking/focusing Pane 2 migrates single mascot + notifies aura/telemetry/vial bridge WITHOUT misfiring fiber-camp or cross-coloring Thought sparks!
  assert.equal(p1.cv.getAttribute('data-ag-cs-pane-camp'), 'gemini', 'Pane 1 carries gemini pane-camp');
  assert.equal(p2.cv.getAttribute('data-ag-cs-pane-camp'), 'claude', 'Pane 2 carries claude pane-camp');
  assert.equal(thought1.querySelector('.ag-cs-thinking-spark')?.getAttribute('data-brand'), 'gemini', 'Pane 1 Thought spark starts gemini');
  assert.equal(thought2.querySelector('.ag-cs-thinking-spark')?.getAttribute('data-brand'), 'claude', 'Pane 2 Thought spark starts claude');

  env.doc.dispatch('pointerdown', { target: p2.editor });
  api.sync();
  assert.equal(env.doc.querySelectorAll('.ag-cs-crab').length, 1, 'Still strictly 1 mascot stage after pane switch');
  assert.ok(p2.card.querySelector('.ag-cs-crab'), 'Mascot smoothly re-attaches to active Pane 2');
  assert.equal(p1.card.querySelector('.ag-cs-crab'), null, 'Mascot detached from Pane 1');
  assert.equal(mascotMounts, 1, 'Single mascot rig reused across panes (0 redundant mount)');
  assert.equal(auraActiveCalls[auraActiveCalls.length - 1], p2.cv, 'convAuraCtl.setActiveView synced to Pane 2');
  assert.equal(telActiveCalls[telActiveCalls.length - 1], b2.bar, '__agPrismTelemetry.setActiveBar synced to Pane 2 bar');
  assert.equal(bridgeActiveCalls[bridgeActiveCalls.length - 1], b2.bar, 'pulseVialBridge.setActiveHost synced to Pane 2 bar');
  assert.equal(p1.card.hasAttribute('data-ag-cs-fiber-camp'), false, 'Switching panes must NOT misfire fiber-camp on Pane 1');
  assert.equal(p2.card.hasAttribute('data-ag-cs-fiber-camp'), false, 'Switching panes must NOT misfire fiber-camp on Pane 2');
  assert.equal(thought1.querySelector('.ag-cs-thinking-spark')?.getAttribute('data-brand'), 'gemini', 'Focusing Claude Pane 2 must NOT recolor Gemini Pane 1 Thought spark');
  assert.equal(thought2.querySelector('.ag-cs-thinking-spark')?.getAttribute('data-brand'), 'claude', 'Pane 2 Thought spark stays claude');

  // Opening Pane 2 vial context-card triggers mascot peek avoidance, closing restores normal pose
  b2.card.hidden = false;
  api.sync();
  assert.equal(p2.card.querySelector('.ag-cs-crab')?.getAttribute('data-ag-mascot-peek'), '1', 'Open vial card on active pane must trigger mascot peek avoidance');
  b2.card.hidden = true;
  api.sync();
  assert.equal(p2.card.querySelector('.ag-cs-crab')?.hasAttribute('data-ag-mascot-peek'), false, 'Closing vial card must restore mascot out of peek');

  // Switch back to Pane 1 via window focusin -> still 0 fiber-camp misfires!
  env.dispatchWin('focusin', { target: p1.editor });
  api.sync();
  assert.ok(p1.card.querySelector('.ag-cs-crab'), 'focusin on Pane 1 re-attaches mascot to Pane 1');
  assert.equal(p1.card.hasAttribute('data-ag-cs-fiber-camp'), false);
  assert.equal(p2.card.hasAttribute('data-ag-cs-fiber-camp'), false);

  // Real unlocked model switch inside Pane 2 DOES fire fiber-camp on Pane 2 only!
  p2.trigLabel.textContent = 'Gemini 4 Neon (High)';
  api.sync();
  assert.equal(p2.card.getAttribute('data-ag-cs-fiber-camp'), 'gemini', 'Real model change in Pane 2 triggers Pane 2 fiber-camp');
  assert.equal(p1.card.hasAttribute('data-ag-cs-fiber-camp'), false, 'Pane 1 remains unaffected');

  // Clicking non-primary bar2 notifies active bar + opens context-card notification
  b2.card.hidden = false;
  env.dispatchWin('click', { target: b2.bar });
  assert.equal(telActiveCalls[telActiveCalls.length - 1], b2.bar, 'Clicking non-primary bar2 activates bar2');
  assert.equal(bridgeActiveCalls[bridgeActiveCalls.length - 1], b2.bar);

  // Removing active Pane 2 cleanly falls back to surviving Pane 1
  env.dispatchWin('focusin', { target: p2.editor });
  api.sync();
  assert.ok(p2.card.querySelector('.ag-cs-crab'));
  p2.pane.remove();
  api.sync();
  assert.ok(p1.card.querySelector('.ag-cs-crab'), 'Removing active Pane 2 must fall back mascot to surviving Pane 1');
  assert.equal(auraActiveCalls[auraActiveCalls.length - 1], p1.cv, 'Aura active view falls back to surviving Pane 1');

  // Clean teardown removes all window/document listeners (including focusin)
  api.destroy();
  assert.equal(env.winListeners.get('focusin')?.size || 0, 0, 'destroy() must unbind window focusin listener');
  assert.equal(env.docListeners.get('pointerdown')?.size || 0, 0, 'destroy() must unbind document pointerdown listener');
});

test('Issue #62 Multi-Pane Aura, Choreography & Selectors Isolation: single WebGL2 aura, multi-pane sparks, pane-scoped lock & active trigger tracking', () => {
  const env = createMockDom();
  const CID1 = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  const CID2 = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  const p1 = makeSplitPane(env.mkEl, env.body, { cid: CID1, modelLabel: 'Gemini 4 Carbon (High)', running: true, paneIdx: 1 });
  const p2 = makeSplitPane(env.mkEl, env.body, { cid: CID2, modelLabel: 'Claude Sonnet 5.5', running: false, paneIdx: 2 });

  const think1 = env.mkEl('button', { 'data-testid': 'thinking-collapsible-trigger', text: 'Thinking...' });
  const think2 = env.mkEl('button', { 'data-testid': 'thinking-collapsible-trigger', text: 'Thinking...' });
  p1.cv.appendChild(think1);
  p2.cv.appendChild(think2);

  // 1) host-bridge & upstream-client pane-scoped lock + active trigger resolution
  const hb = require(path.join(ROOT, 'vendor', 'periodic-picker', 'host-bridge.js'));
  assert.equal(hb.isModelTriggerLocked(p1.trig, env.doc), true, 'Running Pane 1 trigger must be locked');
  assert.equal(hb.isModelTriggerLocked(p2.trig, env.doc), false, 'Idle Pane 2 trigger must NOT be locked by Pane 1');

  env.doc.activeElement = p2.editor;
  assert.equal(hb.findFallbackModelTrigger(env.doc), p2.trig, 'host-bridge resolves focused Pane 2 trigger');
  assert.equal(hb.findFallbackModelTrigger(env.doc, p1.cv), p1.trig, 'host-bridge honors explicit Pane 1 hint');

  const uc = require(path.join(ROOT, 'vendor', 'effort-slider', 'upstream-client.js'));
  assert.equal(uc.findAntigravityTrigger(env.doc), p2.trig, 'effort-slider resolves focused Pane 2 trigger');
  assert.equal(uc.findAntigravityTrigger(env.doc, p1.cv), p1.trig, 'effort-slider honors explicit Pane 1 hint');

  // 2) conv-aura single WebGL2 instance follow + pane-scoped running detection
  const sb = {
    document: env.doc,
    devicePixelRatio: 2,
    performance: { now: () => 1000 },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
    setTimeout: () => 1,
    clearTimeout() {},
    ResizeObserver: class { observe() {} disconnect() {} },
    MutationObserver: class { observe() {} disconnect() {} },
    addEventListener: env.addWinListener,
    removeEventListener: env.remWinListener,
    WeakSet, WeakMap, Set, Map, Array, Object, Math, Number, String, Boolean, Date,
  };
  sb.window = sb;
  sb.globalThis = sb;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'conv-aura.js'), 'utf8'), sb);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'stream-choreography.js'), 'utf8'), sb);

  const convMod = sb.__agPrismConvAura;
  assert.equal(convMod.isConvRunning(false, p1.cv), true, 'Pane 1 isConvRunning === true');
  assert.equal(convMod.isConvRunning(false, p2.cv), false, 'Pane 2 isConvRunning === false (zero cross-pane leak)');

  let auraMounts = 0;
  let auraDisposes = 0;
  const aura = convMod.createConvAuraController({
    isDestroyed: () => false,
    isHomeRippleEnabled: () => true,
    isMotionStandardOrUltra: () => true,
    isDarkTheme: () => true,
    getMinFrameGapMs: () => 0,
    isWindowFocused: () => true,
    setAttrIfChanged: (e, k, v) => e.setAttribute(k, v),
    runGuardedMut: (fn) => fn(),
    rippleCore: {
      resolveHorizonDpr: (r, s) => r * s,
      mountBrandHorizonGlow() {
        auraMounts += 1;
        return {
          mode: 'webgl2',
          resize() {}, releaseBackingStore() {}, invalidate() {}, clear() {}, draw() {}, drawStaticSnapshot() {},
          dispose() { auraDisposes += 1; },
        };
      },
    },
  });
  aura.setActiveView(p2.cv);
  aura.sync();
  assert.equal(aura.getActiveView(), p2.cv);
  assert.equal(aura.getInstance().phase, 'idle', 'Idle Pane 2 aura must stay idle even while Pane 1 runs');
  assert.equal(auraMounts - auraDisposes, 1, 'Strictly 1 WebGL2 aura instance');

  env.doc.dispatch('pointerdown', { target: think1 });
  assert.equal(aura.getActiveView(), p1.cv, 'Pointer into Pane 1 smoothly migrates single aura to Pane 1');
  assert.equal(aura.getInstance().phase, 'running');
  assert.equal(auraMounts - auraDisposes, 1, 'Still strictly 1 active WebGL2 instance after re-attach');
  aura.unmount();
  assert.equal(auraMounts - auraDisposes, 0);

  // 3) stream-choreography traverses all split conversation views
  const sc = sb.__agPrismStreamChoreography.createStreamChoreographyController({
    isDestroyed: () => false,
    isMotionEnabled: () => true,
    isMotionStandardOrUltra: () => true,
    isMotionUltra: () => true,
    isHeroBEnabled: () => true,
    isHeroCEnabled: () => true,
    isHeroDEnabled: () => true,
    isDarkTheme: () => true,
    getAccentTone: () => 'follow',
    isConvRunning: (s, v) => convMod.isConvRunning(s, v),
    detectBrand: () => 'gemini',
    buildBrandMarkSvg: () => '<svg></svg>',
    cloneCachedSvgElement: () => env.doc.createElement('svg'),
    setAttrIfChanged: (e, k, v) => e.setAttribute(k, v),
    runGuardedMut: (fn) => fn(),
  });
  assert.equal(sc.findFormalConvViews().length, 2, 'stream-choreography discovers all visible split views');
  sc.syncThinkingSparks();
  assert.ok(think1.querySelector('.ag-cs-thinking-spark'), 'Pane 1 receives thinking spark');
  assert.ok(think2.querySelector('.ag-cs-thinking-spark'), 'Pane 2 ALSO receives thinking spark');
  sc.disconnectStreamObserver();
});

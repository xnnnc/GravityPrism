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
const cdp = require('../cdp.js');
const { PrismDaemon } = await import('../sidecars/daemon/main.mjs');

test('ui-runtime isolates sidebar hover mutations (0 sync/icon cascade), detects stop-button SVGs, guards flattenCss on CSS Nesting, throttles wakeWinBlur, and avoids 5s darkAura poll drift', () => {
  const uiSrc = fs.readFileSync(path.join(ROOT, 'ui-runtime.js'), 'utf8');
  let moCb = null;
  let pollCb = null;
  let timerSeq = 1;
  const timers = new Map();
  let blurTimerCreations = 0;
  let now = 2000;
  let hasFocusVal = true;
  const winListeners = new Map();
  let styleRewrites = 0;

  function mkNode(tag, attrs = {}) {
    const attrMap = new Map(Object.entries(attrs).map(([k, v]) => [k, String(v)]));
    const children = [];
    const node = {
      nodeType: 1, tagName: String(tag).toUpperCase(), parentElement: null, parentNode: null,
      children, childNodes: children, isConnected: true, hidden: false, style: { setProperty() {}, removeProperty() {} },
      get firstElementChild() { return children[0] || null; },
      get lastElementChild() { return children[children.length - 1] || null; },
      get className() { return attrMap.get('class') || ''; },
      set className(v) { attrMap.set('class', String(v || '')); },
      get id() { return attrMap.get('id') || ''; },
      set id(v) { attrMap.set('id', String(v || '')); },
      classList: {
        contains: (c) => (attrMap.get('class') || '').split(/\s+/).includes(c),
        add() {}, remove() {},
      },
      getAttribute: (k) => (attrMap.has(k) ? attrMap.get(k) : null),
      setAttribute(k, v) { attrMap.set(k, String(v)); },
      hasAttribute: (k) => attrMap.has(k),
      removeAttribute(k) { attrMap.delete(k); },
      appendChild(c) { c.parentElement = c.parentNode = this; children.push(c); return c; },
      removeChild(c) { const i = children.indexOf(c); if (i >= 0) children.splice(i, 1); c.parentElement = c.parentNode = null; return c; },
      matches(sel) {
        return sel.split(',').some((p) => {
          const s = p.trim();
          if (s === 'aside') return this.tagName === 'ASIDE';
          if (s === 'button') return this.tagName === 'BUTTON';
          if (s === 'svg') return this.tagName === 'SVG';
          if (s.startsWith('.')) return this.classList.contains(s.slice(1));
          const tidM = s.match(/\[data-testid="([^"]+)"\]/);
          if (tidM) return this.getAttribute('data-testid') === tidM[1];
          return false;
        });
      },
      closest(sel) {
        let cur = this;
        while (cur) { if (cur.matches?.(sel)) return cur; cur = cur.parentElement; }
        return null;
      },
      querySelector(sel) {
        for (const c of children) {
          if (c.matches?.(sel)) return c;
          const hit = c.querySelector?.(sel);
          if (hit) return hit;
        }
        return null;
      },
      querySelectorAll(sel) {
        const out = [];
        const walk = (el) => {
          for (const c of el.children) {
            if (c.matches?.(sel)) out.push(c);
            walk(c);
          }
        };
        walk(this);
        return out;
      },
      contains(other) {
        let cur = other;
        while (cur) { if (cur === this) return true; cur = cur.parentElement; }
        return false;
      },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 240, height: 32, right: 240, bottom: 32 }),
    };
    return node;
  }

  const html = mkNode('html', { 'data-ag-cs-style': '1' });
  const body = mkNode('body');
  const aside = mkNode('aside');
  const row = mkNode('div', { 'data-testid': 'conversation-row-sidebar' });
  aside.appendChild(row);
  body.appendChild(aside);
  const divSidebar = mkNode('div', { 'data-testid': 'sidebar-split' });
  const divRow = mkNode('div', { 'data-testid': 'conversation-row-sidebar' });
  divSidebar.appendChild(divRow);
  body.appendChild(divSidebar);
  html.appendChild(body);

  let rawCss = 'html[data-ag-cs-style]{& .a{color:red;}}';
  const prismStyleEl = {
    id: 'ag-prism-css',
    attrs: new Map([['data-ag-cs-css-hash', 'h1']]),
    sheet: { cssRules: [{ type: 1, selectorText: 'html[data-ag-cs-style]', style: { cssText: '' }, cssRules: [] }] },
    get textContent() { return rawCss; },
    set textContent(v) { styleRewrites += 1; rawCss = String(v); },
    getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; },
    setAttribute(k, v) { this.attrs.set(k, String(v)); },
  };

  let opticsRefreshes = 0;
  const rafs = [];
  const doc = {
    documentElement: html, body, head: mkNode('head'), hidden: false,
    hasFocus: () => hasFocusVal,
    getElementById: (id) => (id === 'ag-prism-css' ? prismStyleEl : null),
    createElement: (t) => mkNode(t),
    querySelector: (s) => html.querySelector(s),
    querySelectorAll: (s) => html.querySelectorAll(s),
    addEventListener() {}, removeEventListener() {},
  };
  const sb = {
    document: doc, location: { pathname: '/' }, navigator: { language: 'en' }, devicePixelRatio: 1,
    CSS: { supports: (q) => q === 'selector(&)' },
    performance: { now: () => now },
    requestAnimationFrame: (fn) => { rafs.push(fn); return rafs.length; },
    cancelAnimationFrame() {},
    setTimeout(fn, ms = 0) {
      const id = timerSeq++;
      if (ms === 1200) blurTimerCreations += 1;
      timers.set(id, { fn, ms });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    setInterval(fn) { pollCb = fn; return 1; },
    clearInterval() {},
    MutationObserver: class { constructor(cb) { moCb = cb; } observe() {} disconnect() {} },
    ResizeObserver: class { observe() {} disconnect() {} },
    matchMedia: () => ({ matches: false }),
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    addEventListener(t, fn) { if (!winListeners.has(t)) winListeners.set(t, new Set()); winListeners.get(t).add(fn); },
    removeEventListener(t, fn) { winListeners.get(t)?.delete(fn); },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    __agAnimatedIcons: { renderIcon: () => '<svg></svg>' },
    __agPrismConvAura: {
      createController: () => ({
        prime() {}, sync() {}, wake() {}, triggerStart() {}, triggerError() {}, setActiveView() {},
        refreshTheme() { opticsRefreshes += 1; },
        getState: () => ({}),
        destroy() {},
      }),
    },
    Map, Set, WeakMap, WeakSet, Array, Object, Math, Number, String, Boolean, Date, Promise, RegExp, JSON,
  };
  sb.window = sb; sb.globalThis = sb;
  vm.runInNewContext(uiSrc, sb);
  sb.__agCsUiMain({ motionLevel: 'ultra', sidebarRestyle: true, homeLayout: 'off', homeRipple: false, darkAura: 'vivid', darkAuraStyle: 'neon' });

  // 0) Red-Team Hardening #1: flattenMainStyleSheet() skips BOTH startup and hot-sync flattenCss() when CSS.supports('selector(&)') is true
  assert.equal(styleRewrites, 0, 'startup must skip flattenMainStyleSheet when CSS Nesting is natively supported');
  sb.__agPrism.flattenCss();
  assert.equal(styleRewrites, 0, 'hot-sync W.__agPrism.flattenCss() must also early-return when CSS Nesting is natively supported');

  // 0b) Red-Team Hardening #3: 5s poll expectedThemeKey includes darkAura & darkAuraStyle (0 spurious theme refreshes)
  assert.equal(html.getAttribute('data-ag-cs-dark-aura'), 'vivid');
  assert.equal(html.getAttribute('data-ag-cs-dark-aura-style'), 'neon');
  const opticsBeforePoll = opticsRefreshes;
  assert.equal(typeof pollCb, 'function', '5s poll timer must be registered');
  pollCb();
  pollCb();
  assert.equal(opticsRefreshes, opticsBeforePoll, '5s poll must NOT spuriously refresh optics when darkAura/darkAuraStyle is unchanged');

  // 1) 20 sidebar hover button (with SVG, in both <aside> and non-<aside> <div> wrappers) -> 0 runSync & 0 iconIncrementalRuns
  const perf0 = sb.__agPrism.getState().perf;
  for (let i = 0; i < 20; i++) {
    const targetRow = i % 2 === 0 ? row : divRow;
    const hoverBtn = mkNode('button', { class: 'hover-act' });
    hoverBtn.appendChild(mkNode('svg', { class: 'lucide lucide-ellipsis' }));
    targetRow.appendChild(hoverBtn);
    moCb([{ type: 'childList', target: targetRow, addedNodes: [hoverBtn], removedNodes: [] }]);
    targetRow.removeChild(hoverBtn);
    moCb([{ type: 'childList', target: targetRow, addedNodes: [], removedNodes: [hoverBtn] }]);
  }
  while (rafs.length) rafs.shift()(now += 16);
  const perf1 = sb.__agPrism.getState().perf;
  assert.equal(perf1.syncCount, perf0.syncCount, 'Sidebar hover button add/remove must trigger 0 runSync calls');
  assert.equal(perf1.iconIncrementalRuns, perf0.iconIncrementalRuns, 'Sidebar hover button must trigger 0 iconIncrementalRuns');

  // 1b) Red-Team Hardening #2: Stop button SVG (.lucide-square / .lucide-circle-stop) inside sidebar row MUST trigger runSync
  const stopBtn = mkNode('button', { class: 'stop-act' });
  stopBtn.appendChild(mkNode('svg', { class: 'lucide lucide-square' }));
  row.appendChild(stopBtn);
  moCb([{ type: 'childList', target: row, addedNodes: [stopBtn], removedNodes: [] }]);
  while (rafs.length) rafs.shift()(now += 16);
  const perfAfterSquare = sb.__agPrism.getState().perf;
  assert.ok(perfAfterSquare.syncCount > perf1.syncCount, '.lucide-square stop button inside sidebar row must schedule sidebar sync');

  const circleStopSvg = mkNode('svg', { class: 'lucide lucide-circle-stop' });
  Object.defineProperty(circleStopSvg, 'className', { get: () => ({ baseVal: 'lucide lucide-circle-stop' }) });
  divRow.appendChild(circleStopSvg);
  moCb([{ type: 'childList', target: divRow, addedNodes: [circleStopSvg], removedNodes: [] }]);
  while (rafs.length) rafs.shift()(now += 16);
  const perfAfterCircleStop = sb.__agPrism.getState().perf;
  assert.ok(perfAfterCircleStop.syncCount > perfAfterSquare.syncCount, 'SVGAnimatedString .lucide-circle-stop inside sidebar row must schedule sidebar sync');

  // 2) Unfocused pointermove wakes BLUR_ATTR in 0ms and throttles rapid re-arms within 400ms
  hasFocusVal = false;
  blurTimerCreations = 0;
  for (const fn of winListeners.get('blur') || []) fn();
  assert.equal(blurTimerCreations, 1);
  for (const [id, t] of [...timers.entries()]) { if (t.ms === 1200) { timers.delete(id); t.fn(); } }
  assert.equal(html.getAttribute('data-ag-cs-win-blur'), '1');

  blurTimerCreations = 0;
  const pmFns = [...(winListeners.get('pointermove') || [])];
  for (const fn of pmFns) fn({ clientX: 10, clientY: 10 });
  assert.equal(html.getAttribute('data-ag-cs-win-blur'), null, 'First pointermove must wake blur attr in 0ms');
  assert.equal(blurTimerCreations, 1, 'First wake re-arms 1 blur timer');

  for (let i = 0; i < 30; i++) {
    now += 6;
    for (const fn of pmFns) fn({ clientX: 10 + i, clientY: 20 + i });
  }
  assert.equal(blurTimerCreations, 1, 'Rapid pointermove within 400ms must throttle blur timer re-arms');
  sb.__agPrism.destroy();
});

test('style.css excludes hover-card-popup from backdrop-filter and enforces Light Mode contrast & mascot clearance', () => {
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  assert.ok(
    css.includes('.agy-overlay:not([data-hover-card-popup]):not([data-testid="model-selector-panel"]),.surface-glass:not([data-hover-card-popup]),'),
    'style.css must exclude [data-hover-card-popup] from backdrop-filter on both .agy-overlay and .surface-glass'
  );
  assert.ok(css.includes('margin:10px auto 28px !important;'), 'conversation viewport wrapper must reserve 28px bottom margin clearance for dual mascots');
  assert.ok(css.includes('padding-bottom:72px !important;'), 'studio home must reserve 72px bottom clearance for dual mascots');
  assert.ok(css.includes('--muted-foreground:#4B5B73 !important;'), 'Crystal light muted foreground must meet WCAG AA contrast');
  assert.ok(css.includes('--muted-foreground:#574F45 !important;'), 'Alabaster light muted foreground must meet WCAG AA contrast');
});

test('PR #76 real sidebar-split, 2-level Base UI HoverCard portal isolation, host-i18n 120ms debounce & Ch4 hostI18nCodeHash hot-heal', async () => {
  function mkEl(tag, attrs = {}) {
    const a = new Map(Object.entries(attrs).map(([k, v]) => [k, String(v)]));
    const ch = [];
    const el = {
      nodeType: 1, tagName: String(tag).toUpperCase(), parentElement: null, parentNode: null,
      children: ch, childNodes: ch, isConnected: true, hidden: false, style: { setProperty() {}, removeProperty() {} },
      get firstElementChild() { return ch.find((n) => n.nodeType === 1) || null; },
      get lastElementChild() { for (let i = ch.length - 1; i >= 0; i--) if (ch[i].nodeType === 1) return ch[i]; return null; },
      get nextElementSibling() {
        const p = this.parentElement;
        if (!p) return null;
        const idx = p.children.indexOf(this);
        return idx >= 0 ? p.children.slice(idx + 1).find((n) => n.nodeType === 1) || null : null;
      },
      get className() { return a.get('class') || ''; },
      set className(v) { a.set('class', String(v || '')); },
      get id() { return a.get('id') || ''; },
      set id(v) { a.set('id', String(v || '')); },
      get textContent() { return ch.map((c) => (c.nodeType === 3 ? c.nodeValue : c.textContent)).join(''); },
      set textContent(v) { ch.length = 0; if (v) ch.push({ nodeType: 3, nodeValue: String(v), parentElement: this, parentNode: this, isConnected: true }); },
      classList: { contains: (c) => (a.get('class') || '').split(/\s+/).includes(c), add() {}, remove() {} },
      getAttribute: (k) => (a.has(k) ? a.get(k) : null),
      setAttribute(k, v) { a.set(k, String(v)); },
      hasAttribute: (k) => a.has(k),
      removeAttribute(k) { a.delete(k); },
      appendChild(c) { c.parentElement = c.parentNode = this; ch.push(c); return c; },
      removeChild(c) { const i = ch.indexOf(c); if (i >= 0) ch.splice(i, 1); c.parentElement = c.parentNode = null; return c; },
      remove() { this.parentElement?.removeChild(this); this.isConnected = false; },
      matches(sel) {
        return String(sel).split(',').some((raw) => {
          const s = raw.trim();
          if (s === '[data-testid="sidebar-split"]>div:first-child') {
            return this.tagName === 'DIV' && this.parentElement?.getAttribute?.('data-testid') === 'sidebar-split' && this.parentElement.children[0] === this;
          }
          if (s === 'aside') return this.tagName === 'ASIDE';
          if (s === 'button') return this.tagName === 'BUTTON';
          if (s === 'svg') return this.tagName === 'SVG';
          if (s === '[data-hover-card-popup]') return this.hasAttribute('data-hover-card-popup');
          const tidM = s.match(/^\[data-testid="([^"]+)"\]$/);
          if (tidM) return this.getAttribute('data-testid') === tidM[1];
          const clsM = s.match(/^\.([a-zA-Z0-9_-]+)$/);
          if (clsM) return this.classList.contains(clsM[1]);
          return false;
        });
      },
      closest(sel) { let cur = this; while (cur) { if (cur.matches?.(sel)) return cur; cur = cur.parentElement; } return null; },
      querySelector(sel) {
        for (const c of ch) {
          if (c.nodeType !== 1) continue;
          if (c.matches?.(sel)) return c;
          const hit = c.querySelector?.(sel);
          if (hit) return hit;
        }
        return null;
      },
      querySelectorAll(sel) {
        const out = [];
        const walk = (n) => {
          for (const c of n.children || []) {
            if (c.nodeType !== 1) continue;
            if (c.matches?.(sel)) out.push(c);
            walk(c);
          }
        };
        walk(this);
        return out;
      },
      contains(o) { let cur = o; while (cur) { if (cur === this) return true; cur = cur.parentElement; } return false; },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 240, height: 32, right: 240, bottom: 32 }),
    };
    return el;
  }

  function mkTwoLevelHoverCard(text = 'Updated 2 days ago', withFocusGuard = false) {
    const portal = mkEl('div', { 'data-base-ui-portal': '' });
    if (withFocusGuard) portal.appendChild(mkEl('span', { 'data-floating-ui-focus-guard': '' }));
    const pos = mkEl('div', { role: 'presentation' });
    const popup = mkEl('div', { 'data-hover-card-popup': '', class: 'agy-overlay surface-glass' });
    const span = mkEl('span');
    span.textContent = text;
    popup.appendChild(span);
    pos.appendChild(popup);
    portal.appendChild(pos);
    return { portal, pos, popup, span };
  }

  // 1) prism-rim-canvas: clears lit rim once on entering real sidebar-split>div:first-child, then schedules 0 rAFs even after markDirty()
  {
    const rimSrc = fs.readFileSync(path.join(ROOT, 'prism-rim-canvas.js'), 'utf8');
    let now = 1000, rafSeq = 1, rafCalls = 0, strokes = 0, clears = 0;
    const rafs = new Map();
    const html = mkEl('html', { 'data-ag-cs-motion': 'ultra', 'data-ag-cs-ambient': '100' });
    const body = mkEl('body');
    const split = mkEl('div', { 'data-testid': 'sidebar-split' });
    const sbPane = mkEl('div');
    const projHdr = mkEl('button', { 'data-testid': 'project-header' });
    const convRow = mkEl('div', { 'data-testid': 'conversation-row-sidebar' });
    sbPane.appendChild(projHdr);
    sbPane.appendChild(convRow);
    split.appendChild(sbPane);
    const compBox = mkEl('div', { 'data-ag-cs-prism-box': '1', class: 'surface-composer-card' });
    compBox.getBoundingClientRect = () => ({ left: 320, top: 600, width: 600, height: 80, right: 920, bottom: 680 });
    body.appendChild(split);
    body.appendChild(compBox);
    html.appendChild(body);
    const hc = mkTwoLevelHoverCard();
    body.appendChild(hc.portal);

    const mkCtx = () => ({
      save() {}, restore() {}, translate() {}, clip() {}, beginPath() {}, roundRect() {},
      clearRect() { clears++; }, stroke() { strokes++; }, fillRect() {},
      createRadialGradient: () => ({ addColorStop() {} }),
      createLinearGradient: () => ({ addColorStop() {} }),
    });
    const doc = {
      documentElement: html, body, hidden: false,
      createElement(t) {
        const n = mkEl(t);
        if (t === 'canvas') { n.width = 0; n.height = 0; n.getContext = () => mkCtx(); }
        return n;
      },
      querySelector: (s) => html.querySelector(s),
      querySelectorAll: (s) => (s === '[data-ag-cs-prism-box="1"]' ? [compBox] : html.querySelectorAll(s)),
      getElementById: () => null,
      addEventListener() {}, removeEventListener() {},
    };
    const sb = {
      document: doc, devicePixelRatio: 1, performance: { now: () => now },
      requestAnimationFrame(cb) { rafCalls++; const id = rafSeq++; rafs.set(id, cb); return id; },
      cancelAnimationFrame(id) { rafs.delete(id); },
      setTimeout: () => 1, clearTimeout() {},
      getComputedStyle: () => ({ borderTopLeftRadius: '12px' }),
      addEventListener() {}, removeEventListener() {},
      Map, Set, Array, Object, Math, Number, String, Boolean, RegExp,
    };
    sb.window = sb; sb.globalThis = sb;
    vm.runInNewContext(rimSrc, sb);
    const ctl = sb.__agPrismRimCanvas.createPrismRimCanvasController({
      isDestroyed: () => false, isDarkTheme: () => true, motionReduced: () => false,
      getMinFrameGapMs: () => 0, getAmbientIntensity: () => 1, getAccentTone: () => 'follow',
      canMountRealCanvas: () => true, setAttrIfChanged: (e, k, v) => e.setAttribute(k, v),
      runGuardedMut: (fn) => fn(), getActiveCrystalTrack: () => null,
    });
    const flushRafs = () => { const list = [...rafs.values()]; rafs.clear(); for (const fn of list) fn(now += 16); };

    ctl.onPointerMove({ clientX: 420, clientY: 630, target: compBox });
    flushRafs();
    assert.ok(strokes > 0, 'Composer rim should draw when pointer is over composer');

    const rafBeforeEnter = rafCalls;
    ctl.onPointerMove({ clientX: 120, clientY: 220, target: projHdr });
    assert.equal(rafCalls - rafBeforeEnter, 1, 'Entering sidebar with lit rim should schedule 1 clear rAF');
    flushRafs();
    assert.equal(ctl.getLastPointerPos().x, -9999);

    ctl.markDirty();
    const rafAfterClear = rafCalls, strokesAfterClear = strokes, clearsAfterClear = clears;
    const targets = [sbPane, projHdr, convRow, hc.popup];
    for (let i = 0; i < 16; i++) {
      ctl.onPointerMove({ clientX: 100 + i, clientY: 160 + i * 20, target: targets[i % targets.length] });
    }
    assert.equal(rafCalls, rafAfterClear, 'Sidebar & HoverCard pointermoves must schedule 0 rAFs even when dirty');
    assert.equal(strokes, strokesAfterClear, 'Sidebar & HoverCard pointermoves must execute 0 strokes');
    assert.equal(clears, clearsAfterClear, 'Sidebar & HoverCard pointermoves must execute 0 clearRects');
    ctl.teardown();
  }

  // 2) ui-runtime: 2-level Base UI HoverCard portals, data-state/class/aria-expanded flips, and sibling hover buttons trigger 0 runSync
  {
    const uiSrc = fs.readFileSync(path.join(ROOT, 'ui-runtime.js'), 'utf8');
    let moCb = null, now = 2000;
    const html = mkEl('html', { 'data-ag-cs-style': '1' });
    const body = mkEl('body');
    const split = mkEl('div', { 'data-testid': 'sidebar-split' });
    const sbPane = mkEl('div');
    const projHdr = mkEl('button', { 'data-testid': 'project-header' });
    const convList = mkEl('div', { 'data-testid': 'conversation-list-sidebar' });
    const rowWrap = mkEl('div', { class: 'group relative' });
    const rowEl = mkEl('button', { 'data-testid': 'conversation-row-sidebar', 'data-selected': 'false' });
    rowWrap.appendChild(rowEl);
    convList.appendChild(rowWrap);
    sbPane.appendChild(projHdr);
    sbPane.appendChild(convList);
    split.appendChild(sbPane);
    body.appendChild(split);
    html.appendChild(body);
    const rafs = [];
    const doc = {
      documentElement: html, body, head: mkEl('head'), hidden: false,
      hasFocus: () => true, getElementById: () => null,
      createElement: (t) => mkEl(t),
      querySelector: (s) => html.querySelector(s),
      querySelectorAll: (s) => html.querySelectorAll(s),
      addEventListener() {}, removeEventListener() {},
    };
    const sb = {
      document: doc, location: { pathname: '/' }, navigator: { language: 'en' }, devicePixelRatio: 1,
      CSS: { supports: () => true }, performance: { now: () => now },
      requestAnimationFrame: (fn) => { rafs.push(fn); return rafs.length; },
      cancelAnimationFrame() {}, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
      MutationObserver: class { constructor(cb) { moCb = cb; } observe() {} disconnect() {} },
      ResizeObserver: class { observe() {} disconnect() {} },
      matchMedia: () => ({ matches: false }), getComputedStyle: () => ({ getPropertyValue: () => '' }),
      addEventListener() {}, removeEventListener() {},
      localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
      __agAnimatedIcons: { renderIcon: () => '<svg></svg>' },
      Map, Set, WeakMap, WeakSet, Array, Object, Math, Number, String, Boolean, Date, Promise, RegExp, JSON,
    };
    sb.window = sb; sb.globalThis = sb;
    vm.runInNewContext(uiSrc, sb);
    sb.__agCsUiMain({ motionLevel: 'ultra', sidebarRestyle: true, homeLayout: 'off', homeRipple: false });

    const p0 = sb.__agPrism.getState().perf;
    for (let i = 0; i < 10; i++) {
      const hc = mkTwoLevelHoverCard(`Updated ${i}d ago`, i % 2 === 1);
      body.appendChild(hc.portal);
      moCb([{ type: 'childList', target: body, addedNodes: [hc.portal], removedNodes: [] }]);
      body.removeChild(hc.portal);
      moCb([{ type: 'childList', target: body, addedNodes: [], removedNodes: [hc.portal] }]);

      rowEl.setAttribute('data-state', i % 2 === 0 ? 'open' : 'closed');
      moCb([
        { type: 'attributes', attributeName: 'data-state', target: rowEl },
        { type: 'attributes', attributeName: 'aria-expanded', target: rowEl },
        { type: 'attributes', attributeName: 'class', target: rowEl },
      ]);

      const actBtn = mkEl('button');
      actBtn.appendChild(mkEl('svg'));
      const host = i % 2 === 0 ? projHdr : rowWrap;
      host.appendChild(actBtn);
      moCb([{ type: 'childList', target: host, addedNodes: [actBtn], removedNodes: [] }]);
      host.removeChild(actBtn);
      moCb([{ type: 'childList', target: host, addedNodes: [], removedNodes: [actBtn] }]);
    }
    while (rafs.length) rafs.shift()(now += 16);
    const p1 = sb.__agPrism.getState().perf;
    assert.equal(p1.syncCount, p0.syncCount, 'HoverCard portals, data-state flips, and sibling hover buttons must trigger 0 runSync calls');
    assert.equal(p1.iconIncrementalRuns, p0.iconIncrementalRuns, 'HoverCard portals and sibling hover buttons must trigger 0 iconIncrementalRuns');

    rowEl.setAttribute('data-selected', 'true');
    moCb([{ type: 'attributes', attributeName: 'data-selected', target: rowEl }]);
    while (rafs.length) rafs.shift()(now += 16);
    assert.ok(sb.__agPrism.getState().perf.syncCount > p1.syncCount, 'Real data-selected change must still sync');
    sb.__agPrism.destroy();
  }

  // 3) pulse inline-fallback & effort-slider slider-coexist: 0 QSA / 0 scans on HoverCard portals & real sidebar-split
  {
    const pulseSrc = fs.readFileSync(path.join(ROOT, 'vendor/pulse-dashboard/inline-fallback.js'), 'utf8');
    const html = mkEl('html'), body = mkEl('body');
    const split = mkEl('div', { 'data-testid': 'sidebar-split' });
    const sbPane = mkEl('div');
    const projHdr = mkEl('button', { 'data-testid': 'project-header' });
    const convRow = mkEl('div', { 'data-testid': 'conversation-row-sidebar' });
    sbPane.appendChild(projHdr); sbPane.appendChild(convRow); split.appendChild(sbPane);
    body.appendChild(split); html.appendChild(body);
    let qsaCount = 0;
    const mos = [];
    const doc = {
      documentElement: html, body, head: mkEl('head'), hidden: false,
      getElementById: () => null, createElement: (t) => mkEl(t),
      querySelector: (s) => html.querySelector(s),
      querySelectorAll: (s) => { qsaCount++; return html.querySelectorAll(s); },
      addEventListener() {}, removeEventListener() {},
    };
    const sb = {
      document: doc, location: { pathname: '/c/1' },
      MutationObserver: class { constructor(cb) { mos.push(cb); } observe() {} disconnect() {} },
      setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
      addEventListener() {}, removeEventListener() {},
      Map, Set, WeakMap, Array, Object, Math, Number, String, Boolean, Date, Promise, RegExp, JSON,
    };
    sb.window = sb; sb.globalThis = sb;
    vm.runInNewContext(pulseSrc, sb);
    const ctl = sb.__agPrismTelemetry.createTelemetryController({ window: sb, document: doc });
    ctl.sync({ telemetryModule: 'auto' });
    const seatCb = mos[mos.length - 1];
    assert.ok(seatCb, 'inline-fallback must attach seatObs');
    const q0 = qsaCount;
    const hc = mkTwoLevelHoverCard('Updated 2 days ago', true);
    seatCb([{ type: 'childList', target: body, addedNodes: [hc.portal], removedNodes: [] }]);
    seatCb([{ type: 'childList', target: body, addedNodes: [], removedNodes: [hc.portal] }]);
    seatCb([{ type: 'childList', target: projHdr, addedNodes: [mkEl('button')], removedNodes: [] }]);
    seatCb([{ type: 'childList', target: convRow, addedNodes: [mkEl('button')], removedNodes: [] }]);
    assert.equal(qsaCount, q0, 'inline-fallback seatObs must perform 0 querySelectorAll calls for HoverCard portals & sidebar hover mutations');
    ctl.destroy();

    const slSrc = fs.readFileSync(path.join(ROOT, 'vendor/effort-slider/slider-coexist.js'), 'utf8');
    let slMoCb = null;
    const slSb = {
      document: doc,
      MutationObserver: class { constructor(cb) { slMoCb = cb; } observe() {} disconnect() {} takeRecords() { return []; } },
      AntigravityCodexEffortSlider: {
        installCodexEffortSlider({ MutationObserver: MO }) {
          const o = new MO(() => {});
          o.observe(doc.body, { childList: true, subtree: true });
          return { stop() { o.disconnect(); }, rescan() {}, setRememberEffort() {} };
        },
      },
      setTimeout: () => 1, clearTimeout() {},
      Map, Set, WeakMap, Array, Object, Math, Number, String, Boolean, Date, RegExp, JSON,
    };
    slSb.window = slSb; slSb.globalThis = slSb;
    vm.runInNewContext(slSrc, slSb);
    const slCtl = slSb.__agPrismEffortSlider.createEffortSliderController({ window: slSb, document: doc });
    slCtl.sync({ effortSliderModule: 'on' });
    assert.ok(slMoCb, 'slider-coexist must attach throttled MutationObserver');
    const st0 = slCtl.getState().perfStats;
    slMoCb([{ type: 'childList', target: body, addedNodes: [hc.portal], removedNodes: [] }]);
    slMoCb([{ type: 'childList', target: body, addedNodes: [], removedNodes: [hc.portal] }]);
    slMoCb([{ type: 'childList', target: projHdr, addedNodes: [mkEl('button')], removedNodes: [] }]);
    slMoCb([{ type: 'childList', target: sbPane, addedNodes: [mkEl('span')], removedNodes: [] }]);
    const st1 = slCtl.getState().perfStats;
    assert.equal(st1.executedScans, st0.executedScans, 'slider-coexist must execute 0 scans on HoverCard portals & sidebar-split');
    assert.equal(st1.skippedIrrelevant - st0.skippedIrrelevant, 4, 'slider-coexist must classify all 4 HoverCard/sidebar batches as skippedIrrelevant');
    slCtl.destroy();
  }

  // 4) host-i18n-runtime: skips pointerenter on sidebar rows/project-header & debounces rapid HoverCard mounts (120ms)
  {
    const i18nMod = require(path.join(ROOT, 'vendor/host-i18n/host-i18n-runtime.js'));
    let moCb = null, hoverFn = null, rafCount = 0, tmSeq = 1;
    const timers = new Map();
    const html = mkEl('html'), body = mkEl('body');
    const split = mkEl('div', { 'data-testid': 'sidebar-split' });
    const sbPane = mkEl('div');
    const projHdr = mkEl('button', { 'data-testid': 'project-header' });
    const convRow = mkEl('div', { 'data-testid': 'conversation-row-sidebar' });
    sbPane.appendChild(projHdr); sbPane.appendChild(convRow); split.appendChild(sbPane);
    body.appendChild(split); html.appendChild(body);
    const doc = {
      documentElement: html, body, hidden: false, readyState: 'complete',
      hasFocus: () => true,
      createTreeWalker: () => ({ nextNode: () => null }),
      querySelector: (s) => html.querySelector(s),
      querySelectorAll: (s) => html.querySelectorAll(s),
      addEventListener(t, fn) { if (t === 'pointerenter') hoverFn = fn; },
      removeEventListener() {},
    };
    const win = {
      document: doc, location: { pathname: '/' },
      addEventListener() {}, removeEventListener() {},
      MutationObserver: class { constructor(cb) { if (!moCb) moCb = cb; } observe() {} disconnect() {} takeRecords() { return []; } },
    };
    const inst = i18nMod.mountHostI18n({
      root: win, doc, mode: 'on',
      MutationObserver: win.MutationObserver,
      nowFn: () => 5000,
      rafFn: () => { rafCount++; return rafCount; },
      cancelRafFn: () => {},
      setTimeoutFn: (fn, ms) => { const id = tmSeq++; timers.set(id, { fn, ms }); return id; },
      clearTimeoutFn: (id) => { timers.delete(id); },
    });
    assert.ok(moCb && hoverFn, 'host-i18n must install observer and pointerenter handler');

    const tmBeforeHover = timers.size;
    hoverFn({ type: 'pointerenter', target: convRow });
    hoverFn({ type: 'pointerenter', target: projHdr });
    assert.equal(timers.size, tmBeforeHover, 'host-i18n pointerenter on sidebar rows/project-header must early-return with 0 timers');

    const raf0 = rafCount;
    let lastHc = null;
    for (let i = 0; i < 5; i++) {
      const hc = mkTwoLevelHoverCard(`Updated ${i}d ago`, true);
      body.appendChild(hc.portal);
      moCb([{ type: 'childList', target: body, addedNodes: [hc.portal], removedNodes: [] }]);
      if (i < 4) { body.removeChild(hc.portal); hc.portal.isConnected = false; }
      lastHc = hc;
    }
    assert.equal(rafCount, raf0, 'Rapid HoverCard burst must trigger 0 immediate host-i18n rAF flushes');
    const hcTimers = [...timers.values()].filter((t) => t.ms === 120);
    assert.equal(hcTimers.length, 1, 'Rapid HoverCard burst must coalesce into exactly 1 120ms debounce timer');
    hcTimers[0].fn();
    assert.equal(rafCount, raf0 + 1, 'Settled connected HoverCard must flush once after 120ms debounce');
    assert.equal(lastHc.portal.isConnected, true);
    inst.destroy();
  }

  // 5) Vendor sidebar-split selector parity
  for (const rel of ['vendor/omni-viewer/omni-client.js', 'vendor/prompt-suggester/suggester-client.js']) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.ok(src.includes('sidebar-split'), `${rel} must cover real [data-testid="sidebar-split"] sidebar container`);
  }

  // 6) PrismDaemon Ch4 hostI18nCodeHash hot-heal replaces stale hostI18nScriptId & re-evaluates
  {
    const daemon = new PrismDaemon({
      rootDir: ROOT,
      enableStorageGuardTimer: false,
      enableAutoUpdateTimer: false,
      silent: true,
    });
    daemon.cdp = {
      ...cdp,
      PLUGIN_VERSION: cdp.PLUGIN_VERSION,
      readConfig: () => ({
        ...cdp.DEFAULT_CONFIG,
        mascot: 'off',
        homeLayout: 'off',
        periodicModelPicker: 'off',
        telemetryModule: 'off',
        omniModule: 'off',
        sidebarStudio: 'off',
        hostLocalization: 'on',
        thoughtTranslate: 'off',
      }),
    };
    daemon.codeHash = 'ch1-same-hash';
    daemon.injectExpr = '(() => ({ status: "ok" }))()';
    daemon.hostI18nExpr = '(() => { const targetHash = "hi-hash-new"; return { ok: true }; })()';
    const ops = [];
    const entry = {
      wsUrl: 'ws://127.0.0.1/page/1',
      pageId: 'p1',
      title: 'Antigravity',
      url: 'https://127.0.0.1:13605/c/1',
      sidebarHostVerified: true,
      inlineDiffSkipped: true,
      wallpaperSkipped: true,
      suggesterSkipped: true,
      hostI18nMounted: true,
      hostI18nScriptId: 'hi-script-old',
      session: {
        closed: false,
        evaluate: async (expr) => {
          if (typeof expr === 'string' && expr.includes('hi-hash-new')) {
            ops.push('hi-eval');
            return { ok: true };
          }
          return {
            ready: true,
            isHostDom: true,
            prismAttr: cdp.PLUGIN_VERSION,
            hasPrism: true,
            hasRepoBridge: true,
            hasThoughtBridge: true,
            hasUsageBridge: true,
            hasLegacyCss: false,
            codeHash: 'ch1-same-hash',
            hasHostI18n: true,
            hostI18nMode: 'on',
            hostI18nCodeHash: 'hi-hash-old',
            hasSettingsPanel: false,
            hasSettingsDialog: false,
            settingsCodeHash: '',
            needsSettingsChannel: false,
          };
        },
        send: async (method, params) => {
          if (method === 'Page.removeScriptToEvaluateOnNewDocument') ops.push(`rm:${params.identifier}`);
          if (method === 'Page.addScriptToEvaluateOnNewDocument') { ops.push('add-hi'); return { identifier: 'hi-script-new' }; }
          return { result: { value: null } };
        },
      },
    };
    await daemon.verifyAndHealEntry(entry, true);
    assert.ok(ops.includes('rm:hi-script-old'), 'must remove stale hostI18nScriptId on hash mismatch');
    assert.equal(entry.hostI18nScriptId, 'hi-script-new');
    assert.ok(ops.includes('hi-eval'), 'must evaluate upgraded hostI18nExpr on hostI18nCodeHash mismatch');
    await daemon.stop(false, { skipAutoArchive: true });
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, '..');

test('perf guard 1: cdp.stripJsFunctionsByName handles regex /}/, comments, and nested template ${ {a:1} } safely', () => {
  const cdp = require(path.join(ROOT, 'cdp.js'));
  const sample = [
    'function keepBefore() { return 1; }',
    'function targetFn(x) {',
    '  // comment with unmatched }',
    '  /* block comment { */',
    '  const re = /foo}bar{/g;',
    '  const tpl = `hello ${ ({ a: 1, b: { c: 2 } }).a } world`;',
    '  return re.test(tpl) ? x : 0;',
    '}',
    'async function asyncKeep() { return 99; }',
    'function keepAfter() { return 42; }',
  ].join('\n');

  const sample2 = `${sample}\nvar IIFE_VAL = (function namedIife(){return 99;})();`;
  const stripped = cdp.stripJsFunctionsByName(sample2, {
    targetFn: 'function targetFn(){return 7;}',
    asyncKeep: '',
    namedIife: '',
  });
  assert.ok(stripped.includes('async function asyncKeep()'), 'async function must be safely preserved');
  assert.ok(stripped.includes('function namedIife()'), 'named function expression IIFE must not be stripped');
  const res = vm.runInNewContext(`${stripped}; [keepBefore(), targetFn(9), keepAfter(), typeof asyncKeep, IIFE_VAL]`, {});
  assert.deepEqual(Array.from(res), [1, 7, 42, 'function', 99]);
});

test('perf guard 2: home-ripple-host enters 0fps idle sleep after 1200ms stationary pointer without clearing visual aura', () => {
  const src = fs.readFileSync(path.join(ROOT, 'home-ripple-host.js'), 'utf8');
  let now = 1000;
  let rafSeq = 1;
  const rafs = new Map();
  let drawCalls = 0;
  const fakeCanvas = {
    width: 1280, height: 720, style: {}, isConnected: true,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
    getContext: () => null, setAttribute() {},
  };
  const fakeHome = {
    isConnected: true, style: {}, clientWidth: 1280, clientHeight: 720,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
    insertBefore() {}, appendChild() {}, addEventListener() {}, removeEventListener() {},
    querySelector: () => null, setAttribute() {}, removeAttribute() {},
  };
  const makeHostEl = () => {
    const attrs = new Map();
    return {
      style: {}, isConnected: true, className: '', children: [],
      setAttribute(k, v) { attrs.set(k, String(v)); },
      getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
      hasAttribute(k) { return attrs.has(k); },
      removeAttribute(k) { attrs.delete(k); },
      appendChild(c) { this.children.push(c); return c; },
      remove() { this.isConnected = false; },
    };
  };
  let cvCount = 0;
  const fakeDoc = {
    hidden: false,
    documentElement: { getAttribute: () => 'obsidian', classList: { contains: () => false } },
    body: { classList: { contains: () => false } },
    createElement(tag) { return tag === 'canvas' ? (++cvCount === 1 ? { ...fakeCanvas } : fakeCanvas) : makeHostEl(); },
    querySelector: (sel) => (sel.includes('agy-home') ? fakeHome : null),
    querySelectorAll: () => [], addEventListener() {}, removeEventListener() {},
  };
  const sb = {
    window: null, document: fakeDoc, performance: { now: () => now },
    requestAnimationFrame(cb) { const id = rafSeq++; rafs.set(id, cb); return id; },
    cancelAnimationFrame(id) { rafs.delete(id); },
    getComputedStyle: () => ({ color: 'rgb(220,220,220)', backgroundColor: 'rgb(14,15,20)', fontFamily: 'monospace', getPropertyValue: () => '' }),
    ResizeObserver: class { observe() {} disconnect() {} },
    setTimeout, clearTimeout, Math, Number, String, Boolean, Array, Object, Map, Set,
  };
  sb.window = sb; sb.globalThis = sb;
  vm.runInNewContext(src, sb);

  const ctl = sb.__agPrismHomeRippleHost.createHomeRippleController({
    rippleCore: {
      RIPPLE: { cellWidth: 16, cellHeight: 24, skimStep: 24, clickImpulse: 1 },
      parseCssColorToRgb: () => null,
      createWaveField: () => ({ advance() {}, active: () => false, impulse() {}, clear() {} }),
      createGlyphField: () => ({ mode: 'webgl2', busy: () => false, needsDraw: () => false, draw() { drawCalls++; }, invalidate() {}, setCalmZones() {}, dispose() {} }),
      createHorizonGlow: () => ({ resize() {}, draw() {}, clear() {}, dispose() {} }),
    },
    isDestroyed: () => false, isAllowed: () => true, isDarkTheme: () => true, motionReduced: () => false,
    getMinFrameGapMs: () => 5.5, getAmbientIntensity: () => 1, getAccentTone: () => 'cobalt', setAttrIfChanged() {}, onPointerPressMascot() {},
  });
  ctl.sync(fakeHome);
  now = 5000;
  ctl.getMount().onMove({ clientX: 400, clientY: 300, pointerType: 'mouse' });
  drawCalls = 0;
  let drawsAfter1500ms = 0;
  for (let i = 0; i < 180; i++) {
    now += 16.67;
    const cbs = [...rafs.values()];
    rafs.clear();
    const before = drawCalls;
    for (const cb of cbs) cb(now);
    if (i >= 90) drawsAfter1500ms += drawCalls - before;
  }
  assert.equal(ctl.getMount().sleeping, true, 'Must enter 0fps idle sleep after 1200ms stationary pointer');
  assert.equal(drawsAfter1500ms, 0, 'Must perform 0 draws once stationary beyond idle sleep window');
});

test('perf guard 3: conv-aura O(1) indicator cache immediately exits running when React mutates data-testid in place', () => {
  const src = fs.readFileSync(path.join(ROOT, 'conv-aura.js'), 'utf8');
  let now = 1000;
  let btnTestId = 'stop-button';
  let btnVisible = true;
  const stopBtn = {
    nodeType: 1,
    isConnected: true,
    style: {},
    getAttribute: (k) => (k === 'data-testid' ? btnTestId : null),
    matches: (sel) => sel.includes(`"${btnTestId}"`),
    closest: () => null,
    checkVisibility: () => btnVisible,
  };
  let qsaCalls = 0;
  const fakeDoc = {
    hidden: false,
    querySelectorAll(sel) {
      qsaCalls++;
      if (sel.includes('stop-button') && btnTestId === 'stop-button') return [stopBtn];
      return [];
    },
  };
  const sb = {
    window: null, document: fakeDoc, performance: { now: () => now },
    WeakSet, Set, Map, Array, Object, Math, Number, String, Boolean,
  };
  sb.window = sb; sb.globalThis = sb;
  vm.runInNewContext(src, sb);

  const api = sb.__agPrismConvAura;
  assert.equal(api.isConvRunning(), true);
  assert.equal(qsaCalls, 1);

  // Advance beyond 200ms TTL while button is still live stop-button -> O(1) cache hit with 0 querySelectorAll!
  now += 250;
  assert.equal(api.isConvRunning(), true);
  assert.equal(qsaCalls, 1, 'O(1) indicator fast-path should skip querySelectorAll while indicator matches & is visible');

  // React mutates same DOM node in place from stop-button -> send-button -> must immediately exit running!
  btnTestId = 'send-button';
  now += 250;
  assert.equal(api.isConvRunning(), false, 'In-place data-testid mutation must invalidate O(1) indicator cache immediately');
  assert.equal(qsaCalls, 2);

  // Restore stop-button then hide via CSS class (checkVisibility -> false) -> must exit running!
  btnTestId = 'stop-button';
  now += 250;
  assert.equal(api.isConvRunning(), true);
  btnVisible = false;
  now += 250;
  assert.equal(api.isConvRunning(), false, 'CSS-hidden indicator must invalidate O(1) indicator cache immediately');
});

test('perf guard 4: host-workbench-enhancer pruneUnsubs clears WeakSet so detached-then-reattached navRail rebinds cleanly', () => {
  const src = fs.readFileSync(path.join(ROOT, 'host-workbench-enhancer.js'), 'utf8');
  let addCount = 0;
  let removeCount = 0;
  const rail = {
    nodeType: 1,
    isConnected: true,
    addEventListener() { addCount++; },
    removeEventListener() { removeCount++; },
    querySelectorAll: () => [],
    closest: () => null,
  };
  let railsInDoc = [rail];
  const fakeDoc = {
    documentElement: { getAttribute: () => 'obsidian', classList: { contains: () => false } },
    body: { classList: { contains: () => false } },
    querySelectorAll: (sel) => (sel === '[data-testid="conversation-navigator"]' ? railsInDoc : []),
    querySelector: () => null,
  };
  const sb = {
    window: { addEventListener() {}, removeEventListener() {} },
    document: fakeDoc,
    WeakMap, WeakSet, Set, Map, Array, Object, Math, Number, String, Boolean, Date, setTimeout, clearTimeout,
  };
  sb.globalThis = sb;
  vm.runInNewContext(src, sb);

  const ctl = sb.__agPrismHostEnhancer.createHostEnhancerController({
    document: fakeDoc,
    window: sb.window,
    getLang: () => 'zh-CN',
    isDestroyed: () => false,
    isConvRunning: () => false,
    runGuardedMut: (fn) => fn(),
    setAttrIfChanged() {},
  });

  ctl.sync();
  assert.equal(addCount, 3, 'Initial navRail attach registers 3 pointer listeners');

  // Detach rail -> sync() prunes listeners and clears WeakSet
  rail.isConnected = false;
  railsInDoc = [];
  ctl.sync();
  assert.equal(removeCount, 3, 'Detached navRail must remove its 3 pointer listeners immediately');

  // Reattach same DOM node -> sync() must rebind cleanly instead of being permanently ignored by WeakSet
  rail.isConnected = true;
  railsInDoc = [rail];
  ctl.sync();
  assert.equal(addCount, 6, 'Reattached navRail must rebind listeners cleanly after prune');
  ctl.destroy();
});

test('perf guard 5: thought-client CRLF + inner ```foo code lines keep O(1) incremental checkpoint identical to full parse', () => {
  const clientSrc = fs.readFileSync(path.join(ROOT, 'vendor', 'thought-translator', 'thought-client.js'), 'utf8');
  const patchedSrc = clientSrc.replace(
    '__memCache: memCache,',
    '__benchRender: renderIncrementalStreamDom, __benchSplit: splitMarkdownBlocks, __memCache: memCache,'
  );
  function makeNode(nodeType, tagOrText) {
    return {
      nodeType, tagName: nodeType === 1 ? String(tagOrText).toUpperCase() : undefined, className: '',
      data: nodeType === 3 ? String(tagOrText) : undefined, nodeValue: nodeType === 3 ? String(tagOrText) : undefined,
      parentNode: null, parentElement: null, childNodes: [], attrs: new Map(), style: {}, isConnected: true,
      appendChild(c) { c.parentNode = this; c.parentElement = this; this.childNodes.push(c); return c; },
      removeChild(c) { const idx = this.childNodes.indexOf(c); if (idx >= 0) this.childNodes.splice(idx, 1); c.parentNode = null; c.parentElement = null; },
      remove() { if (this.parentNode) this.parentNode.removeChild(this); },
      setAttribute(k, v) { this.attrs.set(k, String(v)); },
      getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; },
      hasAttribute(k) { return this.attrs.has(k); },
      removeAttribute(k) { this.attrs.delete(k); },
      appendData(s) { this.data += s; this.nodeValue = this.data; },
      get firstChild() { return this.childNodes[0] || null; },
      get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; },
      get textContent() { return this.nodeType === 3 ? this.data : this.childNodes.map((c) => c.textContent).join(''); },
      set textContent(v) { if (this.nodeType === 3) { this.data = String(v); this.nodeValue = this.data; return; } this.childNodes = []; if (v !== '' && v != null) this.appendChild(makeNode(3, String(v))); },
      querySelectorAll: () => [], querySelector: () => null, closest: () => null, addEventListener() {}, removeEventListener() {},
    };
  }
  const fakeDoc = {
    hidden: false, documentElement: makeNode(1, 'html'), head: makeNode(1, 'head'), body: makeNode(1, 'body'),
    createElement: (tag) => { const el = makeNode(1, tag); el.ownerDocument = fakeDoc; return el; },
    createTextNode: (t) => { const tn = makeNode(3, t); tn.ownerDocument = fakeDoc; return tn; },
    createDocumentFragment: () => makeNode(11, ''), createRange: () => ({ setStart() {}, setEnd() {} }),
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {},
  };
  const sb = {
    window: null, document: fakeDoc, CSS: { highlights: new Map() }, Highlight: class extends Set {},
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    performance: { now: () => 1000 }, requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    MutationObserver: class { observe() {} disconnect() {} }, setTimeout, clearTimeout,
    Map, Set, WeakMap, WeakSet, Array, Object, Math, Number, String, Boolean, Date, RegExp, JSON,
  };
  sb.window = sb; sb.globalThis = sb;
  vm.runInNewContext(patchedSrc, sb);

  const crlfMd = [
    '第一段分析上下文。',
    '',
    '```js',
    'const sample = "```foo should NOT close fence";',
    'console.log(sample);',
    '```',
    '',
    '- 列表项一',
    '- 列表项二',
    '',
    '最后一段结论收尾。',
  ].join('\r\n');

  const blocks = sb.__agPrismThought.__benchSplit(crlfMd, false);
  assert.equal(blocks.filter((b) => b.k === 'pre').length, 1, 'Inner ```foo line must not prematurely close code fence');
  assert.ok(blocks.find((b) => b.k === 'pre').x.includes('console.log(sample);'));

  const panel = fakeDoc.createElement('div');
  const body = fakeDoc.createElement('div');
  panel.appendChild(body);
  for (let n = 8; n <= crlfMd.length; n += 13) {
    sb.__agPrismThought.__benchRender(panel, body, crlfMd.slice(0, n), 1000 + n, false);
  }
  sb.__agPrismThought.__benchRender(panel, body, crlfMd, 2000, false);
  assert.ok(body.textContent.includes('第一段分析上下文。'));
  assert.ok(body.textContent.includes('console.log(sample);'));
  assert.ok(body.textContent.includes('最后一段结论收尾。'));
});

test('perf guard 6: upstream-client unbind clears __cesAgBound so reused panel rebinds cleanly', () => {
  const up = fs.readFileSync(path.join(ROOT, 'vendor', 'effort-slider', 'upstream-client.js'), 'utf8');
  assert.ok(up.includes('panel.__cesAgBound = true;'));
  assert.ok(up.includes('delete panel.__cesAgBound;'), 'Unbind must delete panel.__cesAgBound (not a mismatched typo)');
  assert.equal(up.includes('__cesAgPanelBound'), false);
});

test('perf guard 7: style.css & omni-client have zero :has(), unscoped ::highlight(), universal * motion-off, or *:nth-last-child', () => {
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  assert.equal((css.match(/:has\(/g) || []).length, 0, 'style.css must contain zero :has() selectors (avoid Blink full-subtree RecalcStyle)');
  assert.equal(/[^\x00-\x7F]/.test(css), false, 'style.css must contain zero non-ASCII characters');
  assert.ok(css.includes('[data-testid="aux-pane-split"][data-ag-cs-aux-dual="1"]'), 'aux-pane-split dual layout must use O(1) data-ag-cs-aux-dual attribute');
  assert.ok(css.includes('html[data-ag-cs-model-menu="1"] .ag-cs-crab'), 'model menu crab click-through must use O(1) root attribute');
  assert.ok(css.includes('.agy-overlay[data-ag-cs-model-overlay="1"]'), 'model menu overlay z-index must use O(1) overlay attribute');
  assert.equal(/^\s*::highlight\(/m.test(css), false, 'style.css must anchor ::highlight() to :root (not universal *)');
  assert.ok(css.includes(':root::highlight(ag-stream-f0)'), 'style.css must use O(1) :root::highlight() inheritance');
  assert.equal(css.includes('&,& *,& *::before,& *::after'), false, 'motion=off universal * rule must be mounted on demand only');
  assert.equal(css.includes('*:nth-last-child('), false, 'autoscroll-viewport must not use backward positional *:nth-last-child');

  const omniSrc = fs.readFileSync(path.join(ROOT, 'vendor', 'omni-viewer', 'omni-client.js'), 'utf8');
  assert.ok(omniSrc.includes("':root::highlight(ag-omni-url)"), 'omni-client ::highlight rules must anchor to :root');
  assert.ok(omniSrc.includes("':root::highlight(ag-omni-path)"), 'omni-client ::highlight rules must anchor to :root');
});

test('perf guard 8: stream-choreography slices bulk syncWorkedForAutoUnfold clicks per frame and cancels on session swap', () => {
  const src = fs.readFileSync(path.join(ROOT, 'stream-choreography.js'), 'utf8');
  const rafCbs = [];
  const clicks = [];
  const mkBtn = (id, tid, expanded) => {
    const attrs = new Map([['data-testid', tid], ['aria-expanded', expanded]]);
    return {
      id,
      tagName: 'BUTTON',
      nodeType: 1,
      isConnected: true,
      getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
      setAttribute: (k, v) => attrs.set(k, String(v)),
      removeAttribute: (k) => attrs.delete(k),
      hasAttribute: (k) => attrs.has(k),
      click() {
        clicks.push(id);
        attrs.set('aria-expanded', 'true');
      },
      querySelectorAll: () => [],
    };
  };
  const innerBtns = [0, 1, 2, 3, 4, 5].map((i) => mkBtn(`inner-${i}`, 'tool-group-collapsible', 'false'));
  const scope = {
    nodeType: 1,
    isConnected: true,
    querySelectorAll: (sel) => (sel.includes('tool-group-collapsible') ? innerBtns : []),
  };
  const outer = mkBtn('outer-0', 'worked-for-collapsible', 'true');
  outer.nextElementSibling = scope;
  const fakeDoc = {
    documentElement: { getAttribute: () => 'ultra' },
    body: {},
    querySelectorAll: (sel) => (sel.includes('worked-for-collapsible') ? [outer] : []),
  };
  const sb = {
    document: fakeDoc,
    window: {},
    performance: { now: () => 1000 },
    requestAnimationFrame: (fn) => {
      rafCbs.push(fn);
      return rafCbs.length;
    },
    cancelAnimationFrame: () => {},
    setTimeout,
    clearTimeout,
    Map, Set, WeakMap, WeakSet, Array, Object, Math, Number, String, Boolean, Date, RegExp,
  };
  sb.window = sb;
  sb.globalThis = sb;
  vm.runInNewContext(src, sb);
  const ctl = sb.__agPrismStreamChoreography.createStreamChoreographyController({
    isDestroyed: () => false,
    isMotionStandardOrUltra: () => true,
    isMotionUltra: () => true,
    isConvRunning: () => false,
    isThoughtIsolatedNode: () => false,
    isThoughtMutationRecord: () => false,
    isManagedThoughtPanel: () => false,
    setAttrIfChanged: (el, k, v) => el.setAttribute(k, v),
    runGuardedMut: (fn) => fn(),
  });

  ctl.syncWorkedForAutoUnfold();
  assert.deepEqual(clicks, ['inner-5', 'inner-4'], 'Sync frame must click only newest 2 collapsed tool groups');
  assert.equal(rafCbs.length, 1, 'Remaining historical tool groups must queue into next animation frame');

  // Step 1 frame -> clicks next 2
  rafCbs.shift()();
  assert.deepEqual(clicks, ['inner-5', 'inner-4', 'inner-3', 'inner-2']);

  // Cancel on session swap -> remaining queued clicks are dropped
  ctl.cancelDeferredHydration();
  while (rafCbs.length) rafCbs.shift()();
  assert.equal(clicks.length, 4, 'cancelDeferredHydration must cancel remaining historical clicks');
});

test('perf guard 9: thought-client api.sync(cfg) is idempotent on repeated identical config calls', () => {
  const src = fs.readFileSync(path.join(ROOT, 'vendor', 'thought-translator', 'thought-client.js'), 'utf8');
  let qsaCount = 0;
  let timerCount = 0;
  const fakeDoc = {
    hidden: false,
    documentElement: { getAttribute: () => null, setAttribute() {}, removeAttribute() {}, hasAttribute: () => false },
    body: { addEventListener() {}, removeEventListener() {} },
    querySelectorAll: () => {
      qsaCount += 1;
      return [];
    },
    querySelector: () => null,
    getElementById: () => null,
    addEventListener() {},
    removeEventListener() {},
  };
  const sb = {
    document: fakeDoc,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    performance: { now: () => 1000 },
    requestAnimationFrame: () => 0,
    cancelAnimationFrame() {},
    MutationObserver: class { observe() {} disconnect() {} },
    setTimeout: (fn, ms) => {
      timerCount += 1;
      return setTimeout(fn, ms);
    },
    clearTimeout,
    Map, Set, WeakMap, WeakSet, Array, Object, Math, Number, String, Boolean, Date, RegExp, JSON,
  };
  sb.window = sb;
  sb.globalThis = sb;
  vm.runInNewContext(src, sb);

  const cfg = { thoughtTranslate: 'ai', thoughtTrigger: 'expand', thoughtView: 'immersive', language: 'zh-CN' };
  sb.__agPrismThought.sync(cfg);
  const qsaAfterFirst = qsaCount;
  const timersAfterFirst = timerCount;

  // Repeated identical sync calls (e.g. during streaming/tool-chain updates) must do 0 DOM scans and 0 reschedules
  for (let i = 0; i < 10; i++) sb.__agPrismThought.sync(cfg);
  assert.equal(qsaCount, qsaAfterFirst, 'Repeated identical sync() must perform 0 extra querySelectorAll scans');
  assert.equal(timerCount, timersAfterFirst, 'Repeated identical sync() must not schedule extra scan timers');
  sb.__agPrismThought.destroy();
});

test('perf guard 10: ui-runtime runGuardedMut drains MO records & default bundle stays under 690 KiB', () => {
  const cdp = require(path.join(ROOT, 'cdp.js'));
  const uiSrc = fs.readFileSync(path.join(ROOT, 'ui-runtime.js'), 'utf8');
  assert.ok(uiSrc.includes('mainObserver.takeRecords()'), 'runGuardedMut must synchronously drain mainObserver records');
  assert.ok(uiSrc.includes('if (!force && key === lastAbsorbedSyncKey) return;'), 'syncAbsorbedModules must gate identical calls');
  const bytes = Buffer.byteLength(cdp.buildInjectExpression(), 'utf8');
  assert.ok(bytes < 690 * 1024, `Expected default bundle < 690 KiB, got ${bytes}`);
});

test('perf guard 11: style.css enables offscreen content-visibility, sidebar containment, zero global * wildcards, and runtime flattener compiles nested/:is() rules', () => {
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  assert.ok(css.includes('content-visibility:auto'), 'style.css must apply content-visibility:auto to offscreen expanded bodies/turns');
  assert.ok(css.includes('contain-intrinsic-size:auto 26px'), 'style.css must apply step-level content-visibility:auto to expanded tool-group step rows');
  assert.ok(css.includes('[data-testid="sidebar-split"]>div:first-child{contain:style;'), 'sidebar container must isolate style via contain:style without trapping position:fixed descendants');
  assert.equal(/html\[[^\]]+\]\s*&/.test(css), false, 'style.css must not use html[...] & self-nesting that produces duplicate html prefixes');
  assert.equal(/:is\([^)]*::(?:before|after)/.test(css), false, 'style.css must not place ::before/::after pseudo-elements inside :is(...)');
  assert.equal(css.includes('.divide-y>*+*'), false, 'must not use global *+* universal selector');
  assert.equal(css.includes('.ag-anim-icon{display:inline-block;flex-shrink:0;overflow:visible;vertical-align:middle;pointer-events:none;transform-origin:50% 50%;& *{'), false, 'must not use universal * inside .ag-anim-icon');
  assert.equal(css.includes('.ag-cs-crab{opacity:0 !important;pointer-events:none !important;& *{'), false, 'must not use universal * inside .ag-cs-crab');
  assert.equal(css.includes('&>*{display:none !important;}'), false, 'must not use universal >* inside new-conversation svg');

  // Verify flattenMainStyleSheet logic in ui-runtime.js expands nested & and :is(...) idempotently
  const uiSrc = fs.readFileSync(path.join(ROOT, 'ui-runtime.js'), 'utf8');
  const fnMatch = uiSrc.match(/function flattenMainStyleSheet\(\)[\s\S]*?\n  \}/);
  assert.ok(fnMatch, 'flattenMainStyleSheet must exist in ui-runtime.js');
  const attrs = new Map([['data-ag-cs-css-hash', 'h1']]);
  const fakeStyle = {
    textContent: 'orig',
    getAttribute: (k) => attrs.get(k) || null,
    setAttribute: (k, v) => attrs.set(k, String(v)),
    sheet: {
      cssRules: [
        {
          type: 1,
          selectorText: 'html[data-ag-cs-style]',
          style: { cssText: '--x: 1;' },
          cssRules: [
            {
              type: 1,
              selectorText: '& :is(.a, [data-b="1"])',
              style: { cssText: 'color: red;' },
              cssRules: [],
            },
          ],
        },
        { type: 7, cssText: '@keyframes k{to{opacity:1}}' },
      ],
    },
  };
  const sb = {
    CODE_HASH: 'c1',
    runGuardedMut: (fn) => fn(),
    document: { getElementById: (id) => (id === 'ag-prism-css' ? fakeStyle : null) },
  };
  vm.runInNewContext(`${fnMatch[0]}; flattenMainStyleSheet();`, sb);
  assert.equal(attrs.get('data-ag-cs-flat'), `h1:${fakeStyle.textContent.length}`);
  assert.ok(fakeStyle.textContent.includes('html[data-ag-cs-style] .a,html[data-ag-cs-style] [data-b="1"]{color: red;}'));
  assert.ok(fakeStyle.textContent.includes('@keyframes k{to{opacity:1}}'));
  assert.equal(fakeStyle.textContent.includes(':is('), false);
  // If an older watcher overwrites textContent without clearing data-ag-cs-flat, length mismatch forces immediate re-flatten
  fakeStyle.textContent = '/* stale unflattened css */';
  vm.runInNewContext(`${fnMatch[0]}; flattenMainStyleSheet();`, sb);
  assert.equal(attrs.get('data-ag-cs-flat'), `h1:${fakeStyle.textContent.length}`);
  assert.ok(fakeStyle.textContent.includes('html[data-ag-cs-style] .a,html[data-ag-cs-style] [data-b="1"]{color: red;}'));
});

test('perf guard 12: prism-rim-canvas skips canvas resize when inactive and stream-choreography avoids hover getBoundingClientRect reflows', () => {
  const rimSrc = fs.readFileSync(path.join(ROOT, 'prism-rim-canvas.js'), 'utf8');
  let widthWrites = 0;
  let clearCalls = 0;
  const fakeCv = {
    _w: 100, _h: 40, isConnected: true,
    classList: { contains: (c) => c === 'ag-cs-prism-rim-cv' },
    get width() { return this._w; },
    set width(v) { widthWrites++; this._w = v; },
    get height() { return this._h; },
    set height(v) { widthWrites++; this._h = v; },
    getContext: () => ({ clearRect() { clearCalls++; }, createRadialGradient: () => ({ addColorStop() {} }) }),
    setAttribute() {}, remove() {},
  };
  const fakeBox = {
    isConnected: true, firstElementChild: fakeCv,
    getAttribute: (k) => (k === 'data-ag-cs-prism-box' ? '1' : null),
    getBoundingClientRect: () => ({ left: 600, top: 600, right: 900, bottom: 680, width: 300, height: 80 }),
    appendChild() {}, style: { setProperty() {} },
  };
  fakeCv.parentElement = fakeBox;
  let rafCb = null;
  const sb = {
    window: { devicePixelRatio: 2 },
    performance: { now: () => 5000 },
    requestAnimationFrame: (cb) => { rafCb = cb; return 1; },
    cancelAnimationFrame() {},
    getComputedStyle: () => ({ borderTopLeftRadius: '10px' }),
    document: {
      documentElement: { getAttribute: () => 'standard' },
      querySelectorAll: (s) => (s.includes('data-ag-cs-prism-box') ? [fakeBox] : []),
    },
    Set, Map, Array, Math, Number, String, Boolean,
  };
  sb.globalThis = sb;
  vm.runInNewContext(rimSrc, sb);
  const ctl = sb.__agPrismRimCanvas.createPrismRimCanvasController({
    isDestroyed: () => false,
    isDarkTheme: () => true,
    motionReduced: () => false,
    getMinFrameGapMs: () => 0,
    getAmbientIntensity: () => 1,
    getAccentTone: () => 'follow',
    canMountRealCanvas: () => true,
    setAttrIfChanged() {},
    runGuardedMut: (fn) => fn(),
  });
  // Pointer hovering far left sidebar (x=40, y=120) — far outside box [600..900, 600..680]
  ctl.onPointerMove({ clientX: 40, clientY: 120 });
  rafCb(5000);
  assert.equal(widthWrites, 0, 'inactive off-range pointer must not mutate canvas width/height attributes');
  assert.equal(clearCalls, 1, 'inactive canvas clears once then becomes idempotent');
  ctl.onPointerMove({ clientX: 42, clientY: 140 });
  rafCb(5020);
  assert.equal(widthWrites, 0);
  assert.equal(clearCalls, 1, 'subsequent sidebar mousemoves must do 0 clearRect and 0 attribute writes');

  // stream-choreography measureNewLensOverlays skips rectOf when trigger is stale (>900ms)
  const choreoSrc = fs.readFileSync(path.join(ROOT, 'stream-choreography.js'), 'utf8');
  let rectCalls = 0;
  const fakeOv = {
    getBoundingClientRect() { rectCalls++; return { left: 0, top: 0, width: 100, height: 50 }; },
    querySelectorAll: () => [],
    style: { setProperty() {} },
  };
  let nowT = 5000;
  const sb2 = {
    performance: { now: () => nowT },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
    document: {
      documentElement: { getAttribute: () => 'ultra' },
      querySelectorAll: (s) => (s.includes('.agy-overlay') ? [fakeOv] : []),
    },
    Set, Map, WeakSet, WeakMap, Array, Math, Number, String, Boolean,
  };
  sb2.globalThis = sb2;
  vm.runInNewContext(choreoSrc, sb2);
  const sc = sb2.__agPrismStreamChoreography.createStreamChoreographyController({
    isDestroyed: () => false,
    isMotionStandardOrUltra: () => true,
    isMotionUltra: () => true,
    isConvRunning: () => false,
    setAttrIfChanged() {},
  });
  // Stale click (> 900ms ago) — pure sidebar hover overlay must NOT call getBoundingClientRect()
  sc.heroState.lastTriggerOrigin = { x: 10, y: 10, at: 1000 };
  const resStale = sc.measureNewLensOverlays();
  assert.equal(resStale.length, 1);
  assert.equal(resStale[0].rect, null);
  assert.equal(rectCalls, 0, 'stale trigger must not call getBoundingClientRect() on hover overlays');
  // Fresh click (within 900ms) — DOES measure rect for lens origin
  sc.heroState.lastTriggerOrigin = { x: 10, y: 10, at: 4800 };
  const resFresh = sc.measureNewLensOverlays();
  assert.equal(rectCalls, 1, 'fresh click must still measure overlay rect for lens origin');
  assert.ok(resFresh[0].rect);
});

test('perf guard 13: thought-client skips checkVisibility on unchanged translated/streaming panels & upstream-client filters streaming/sidebar mutations', () => {
  const thSrc = fs.readFileSync(path.join(ROOT, 'vendor/thought-translator/thought-client.js'), 'utf8');
  // Verify scanNow checks cache hit & streaming pending BEFORE calling isHiddenByAncestor
  const scanIdx = thSrc.indexOf('function scanNow()');
  const scanSlice = thSrc.slice(scanIdx, scanIdx + 1600);
  const idxReady = scanSlice.indexOf("ga(panel, A_RDY) === '1'");
  const idxHidden = scanSlice.indexOf('isHiddenByAncestor(btn, panel)');
  assert.ok(idxReady > 0 && idxHidden > 0 && idxReady < idxHidden, 'scanNow must short-circuit translated unchanged panels BEFORE isHiddenByAncestor (checkVisibility)');

  // Verify upstream-client Antigravity MutationObserver ignores autoscroll-viewport & non-selector characterData
  const upSrc = fs.readFileSync(path.join(ROOT, 'vendor/effort-slider/upstream-client.js'), 'utf8');
  let moCb = null;
  let queryCalls = 0;
  const fakeDoc = {
    body: {
      nodeType: 1,
      querySelector: () => { queryCalls++; return null; },
      querySelectorAll: () => [],
      appendChild() {},
    },
    head: { appendChild() {} },
    documentElement: { getAttribute: () => null },
    getElementById: () => null,
    createElement: () => ({ id: '', textContent: '', style: {}, setAttribute() {}, appendChild() {}, classList: { add() {}, remove() {} } }),
    querySelector: () => { queryCalls++; return null; },
    querySelectorAll: () => [],
  };
  const sb = {
    window: null,
    document: fakeDoc,
    __agCodexEffortSliderDisableAutoBoot: true,
    MutationObserver: class {
      constructor(cb) { moCb = cb; }
      observe() {}
      disconnect() {}
    },
    Set, Map, Array, Object, Math, Number, String, Boolean, Date, RegExp, JSON,
  };
  sb.window = sb;
  sb.globalThis = sb;
  vm.runInNewContext(upSrc, sb);
  const obs = sb.AntigravityCodexEffortSlider.installAntigravityObserver({ document: fakeDoc, window: sb, MutationObserver: sb.MutationObserver });
  const baselineQueries = queryCalls;
  // Simulate streaming characterData inside conversation and childList inside autoscroll-viewport & sidebar
  const convNode = { nodeType: 1, closest: (sel) => (sel.includes('autoscroll-viewport') ? {} : null) };
  const textNode = { nodeType: 3, parentElement: convNode };
  moCb([
    { type: 'characterData', target: textNode },
    { type: 'childList', target: convNode },
  ]);
  assert.equal(queryCalls, baselineQueries, 'streaming characterData and autoscroll-viewport mutations must perform 0 scan() queries');
  obs.stop();
});

test('perf guard 14: flattenMainStyleSheet preserves :not(:is(...)), prefix &, and minifyCss keeps quoted strings/URLs/IDs intact', () => {
  const uiSrc = fs.readFileSync(path.join(ROOT, 'ui-runtime.js'), 'utf8');
  const fnMatch = uiSrc.match(/function flattenMainStyleSheet\(\)[\s\S]*?\n  \}/);
  assert.ok(fnMatch, 'flattenMainStyleSheet must exist in ui-runtime.js');
  const attrs = new Map([['data-ag-cs-css-hash', 'h2']]);
  const fakeStyle = {
    textContent: 'orig',
    getAttribute: (k) => attrs.get(k) || null,
    setAttribute: (k, v) => attrs.set(k, String(v)),
    sheet: {
      cssRules: [
        {
          type: 1,
          selectorText: 'html[x] .card',
          style: { cssText: '' },
          cssRules: [
            { type: 1, selectorText: '.dark &', style: { cssText: 'opacity: 1;' }, cssRules: [] },
            { type: 1, selectorText: '&:not(:is(.a,.b))', style: { cssText: 'display: block;' }, cssRules: [] },
            { type: 1, selectorText: '& [data-x=":is(p,q)"]', style: { cssText: 'color: blue;' }, cssRules: [] },
          ],
        },
      ],
    },
  };
  const sb = {
    CODE_HASH: 'c2',
    runGuardedMut: (fn) => fn(),
    document: { getElementById: (id) => (id === 'ag-prism-css' ? fakeStyle : null) },
  };
  vm.runInNewContext(`${fnMatch[0]}; flattenMainStyleSheet();`, sb);
  assert.ok(fakeStyle.textContent.includes('.dark :is(html[x] .card){opacity: 1;}'), 'prefix & with ancestor combinator must preserve :is(...)');
  assert.ok(fakeStyle.textContent.includes('html[x] .card:not(:is(.a,.b)){display: block;}'), 'must never expand :is() inside :not()');
  assert.ok(fakeStyle.textContent.includes('html[x] .card [data-x=":is(p,q)"]{color: blue;}'), 'must never expand :is() inside quoted attribute values');

  const cdpSrc = fs.readFileSync(path.join(ROOT, 'cdp.js'), 'utf8');
  const minMatch = cdpSrc.match(/function minifyCss\(css\)[\s\S]*?\n\}/);
  assert.ok(minMatch, 'minifyCss must exist in cdp.js');
  const sbCss = { Set };
  vm.runInNewContext(`${minMatch[0]}; globalThis.minifyCss = minifyCss;`, sbCss);
  const sample = '#aabbcc-box { content: "v: 0.5 #aabbcc !important"; background: url(/files/0.5.png); color: red !important; }';
  const out = sbCss.minifyCss(sample);
  assert.ok(out.includes('#aabbcc-box{'), 'must preserve ID selectors');
  assert.ok(out.includes('content:"v: 0.5 #aabbcc !important"'), 'must preserve quoted string contents verbatim');
  assert.ok(out.includes('url(/files/0.5.png)'), 'must preserve url() decimals');
  assert.ok(out.includes('color:red!important'), 'must still minify safe colons and !important');
});

test('perf guard 15: conv-aura prime+sync(true) avoids post-write checkVisibility thrash, stream-choreography guards convEntrySeq reentrancy, and upstream-client whitelists fallback trigger & attrs', () => {
  // 1) conv-aura prime() + sync(true) reuses pre-measured indicator without re-invoking checkVisibility in Phase 2
  const auraSrc = fs.readFileSync(path.join(ROOT, 'conv-aura.js'), 'utf8');
  let checkVisCalls = 0;
  const stopBtn = {
    nodeType: 1,
    isConnected: true,
    style: {},
    matches: (sel) => sel.includes('stop-button'),
    closest: () => null,
    checkVisibility: () => { checkVisCalls++; return true; },
  };
  const convHost = {
    nodeType: 1, isConnected: true, parentElement: null,
    insertBefore() {}, firstChild: null,
    getBoundingClientRect: () => ({ width: 800, height: 600 }),
    querySelectorAll: () => [],
  };
  convHost.parentElement = {
    nodeType: 1, isConnected: true, firstChild: convHost,
    insertBefore() {}, getBoundingClientRect: () => ({ width: 800, height: 600 }),
  };
  const fakeDoc = {
    hidden: false,
    documentElement: { getAttribute: () => 'standard' },
    querySelector: (s) => (s.includes('conversation-view') ? convHost : null),
    querySelectorAll: (s) => (s.includes('conversation-view') ? [convHost] : s.includes('stop-button') ? [stopBtn] : []),
    createElement: () => ({
      className: '', isConnected: true,
      style: { setProperty() {} },
      setAttribute() {}, getAttribute: () => null, hasAttribute: () => false, removeAttribute() {},
      appendChild() {}, remove() {},
    }),
    addEventListener() {}, removeEventListener() {},
  };
  let tNow = 1000;
  const sbAura = {
    window: null, document: fakeDoc, performance: { now: () => tNow },
    WeakSet, Set, Map, Array, Object, Math, Number, String, Boolean,
    setTimeout: () => 1, clearTimeout() {},
  };
  sbAura.window = sbAura; sbAura.globalThis = sbAura;
  vm.runInNewContext(auraSrc, sbAura);
  const ctl = sbAura.__agPrismConvAura.createConvAuraController({
    isDestroyed: () => false,
    isHomeRippleEnabled: () => true,
    isDarkTheme: () => true,
    isMotionStandardOrUltra: () => true,
    getAmbientIntensity: () => 1,
    getSpectrumMode: () => 'prism',
    setAttrIfChanged() {},
    runGuardedMut: (fn) => fn(),
  });
  ctl.prime();
  assert.equal(checkVisCalls, 1, 'prime() measures visibility once before DOM writes');
  ctl.sync(true);
  assert.equal(checkVisCalls, 1, 'sync(true) must reuse primed cache without redundant checkVisibility reflow');
  tNow += 300;
  ctl.advancePhase(tNow, true);
  assert.equal(checkVisCalls, 1, 'drawNow anim loop must skip synchronous checkVisibility within 2000ms while indicator matches');
  tNow += 2100;
  ctl.advancePhase(tNow, true);
  assert.equal(checkVisCalls, 2, 'drawNow anim loop performs full checkVisibility safety check after 2000ms');

  // 2) stream-choreography convEntrySeq cancels stale frame2Fn when fn() synchronously calls cancelDeferredHydration
  const scSrc = fs.readFileSync(path.join(ROOT, 'stream-choreography.js'), 'utf8');
  let timerCb = null;
  let rafCb = null;
  let t2 = 5000;
  const sbSc = {
    performance: { now: () => t2 },
    setTimeout: (cb) => { timerCb = cb; return 1; },
    clearTimeout() { timerCb = null; },
    requestAnimationFrame: (cb) => { rafCb = cb; return 1; },
    cancelAnimationFrame() { rafCb = null; },
    document: { documentElement: { getAttribute: () => 'ultra' }, querySelectorAll: () => [] },
    Set, Map, WeakSet, WeakMap, Array, Math, Number, String, Boolean,
  };
  sbSc.globalThis = sbSc;
  vm.runInNewContext(scSrc, sbSc);
  const sc = sbSc.__agPrismStreamChoreography.createStreamChoreographyController({
    isDestroyed: () => false,
    isMotionStandardOrUltra: () => true,
    isMotionUltra: () => true,
    isConvRunning: () => false,
    setAttrIfChanged() {},
  });
  let frame2Ran = 0;
  sc.scheduleDeferredConvEntry(
    () => { sc.cancelDeferredHydration(); return true; },
    50,
    () => { frame2Ran++; }
  );
  timerCb();
  if (rafCb) rafCb();
  assert.equal(frame2Ran, 0, 'frame2Fn must never fire if fn() synchronously cancels deferred hydration');

  // 3) upstream-client MutationObserver allows fallback button[aria-label^="Select model"] characterData & attributes
  const upSrc = fs.readFileSync(path.join(ROOT, 'vendor/effort-slider/upstream-client.js'), 'utf8');
  let moCb = null;
  let obsOpts = null;
  let qCount = 0;
  const docUp = {
    body: { nodeType: 1, querySelector: () => { qCount++; return null; }, querySelectorAll: () => [], appendChild() {} },
    head: { appendChild() {} },
    documentElement: { getAttribute: () => null },
    getElementById: () => null,
    createElement: () => ({ id: '', textContent: '', style: {}, setAttribute() {}, appendChild() {}, classList: { add() {}, remove() {} } }),
    querySelector: () => { qCount++; return null; },
    querySelectorAll: () => [],
  };
  const sbUp = {
    window: null, document: docUp, __agCodexEffortSliderDisableAutoBoot: true,
    MutationObserver: class {
      constructor(cb) { moCb = cb; }
      observe(_t, o) { obsOpts = o; }
      disconnect() {}
    },
    Set, Map, Array, Object, Math, Number, String, Boolean, Date, RegExp, JSON,
  };
  sbUp.window = sbUp; sbUp.globalThis = sbUp;
  vm.runInNewContext(upSrc, sbUp);
  const obs = sbUp.AntigravityCodexEffortSlider.installAntigravityObserver({ document: docUp, window: sbUp, MutationObserver: sbUp.MutationObserver });
  assert.equal(obsOpts.attributes, true, 'must observe whitelisted menu state attributes');
  const q0 = qCount;
  const fallbackBtn = { nodeType: 1, closest: (sel) => (sel.includes('Select model') ? {} : null) };
  moCb([{ type: 'attributes', target: fallbackBtn }]);
  assert.ok(qCount > q0, 'whitelisted attributes on fallback Select model trigger must trigger scan()');
  const q1 = qCount;
  const sidebarNode = { nodeType: 1, closest: (sel) => (sel.includes('sidebar-split') ? {} : null) };
  moCb([{ type: 'attributes', target: sidebarNode }]);
  assert.equal(qCount, q1, 'attributes on sidebar nodes must be ignored with 0 scan() queries');
  obs.stop();
});

test('perf guard 16: smooth-caret avoids sel.isCollapsed forced layout, prism-rim-canvas skips rAF when pointer is far idle, and hover-card-popup is excluded from lens-in & composer/settings sync', () => {
  // 1) smooth-caret reads Range.collapsed/endContainer/endOffset without touching Selection.isCollapsed/focusNode
  const caretSrc = fs.readFileSync(path.join(ROOT, 'smooth-caret.js'), 'utf8');
  let selPropReads = 0;
  const textNode = { nodeType: 3, nodeValue: 'hi' };
  const fakeEd = {
    isConnected: true, isContentEditable: true,
    childNodes: [textNode], firstChild: textNode, textContent: 'hi',
    scrollLeft: 0, scrollTop: 0, scrollHeight: 20, clientHeight: 20,
    parentElement: {
      isConnected: true, clientLeft: 0, clientTop: 0, scrollLeft: 0, scrollTop: 0,
      hasAttribute: () => true, querySelector: () => null,
      getBoundingClientRect: () => ({ left: 10, top: 10, width: 300, height: 40 }),
    },
    contains: () => true,
    hasAttribute: () => true,
    getAttribute: () => 'true',
    getBoundingClientRect: () => ({ left: 10, top: 10, width: 300, height: 40 }),
    querySelectorAll: () => [],
  };
  const fakeSel = {
    rangeCount: 1,
    get isCollapsed() { selPropReads++; return true; },
    get focusNode() { selPropReads++; return textNode; },
    get focusOffset() { selPropReads++; return 2; },
    getRangeAt: () => ({
      collapsed: true,
      startContainer: textNode, startOffset: 2,
      endContainer: textNode, endOffset: 2,
      getClientRects: () => [{ left: 25, top: 14, height: 18 }],
    }),
  };
  const sbCaret = {
    window: { devicePixelRatio: 1 },
    document: {
      activeElement: fakeEd,
      getSelection: () => fakeSel,
      querySelectorAll: () => [fakeEd],
    },
    getComputedStyle: () => ({ paddingLeft: '8', paddingTop: '8', fontSize: '14', lineHeight: '22' }),
    WeakMap, Set, Map, Array, Math, Number, String, Boolean, Date,
  };
  sbCaret.globalThis = sbCaret;
  vm.runInNewContext(caretSrc, sbCaret);
  const caretCtl = sbCaret.__agPrismSmoothCaret.createSmoothCaretController({
    isDestroyed: () => false, isEnabled: () => true, setAttrIfChanged() {}, runGuardedMut: (fn) => fn(),
  });
  const snap = caretCtl.measureSnapshot(false, false);
  assert.equal(snap.length, 1);
  assert.equal(selPropReads, 0, 'smooth-caret must read pure-DOM Range properties instead of forced-layout Selection.isCollapsed/focusNode');

  // 2) prism-rim-canvas skips scheduling rAF on subsequent far-idle sidebar pointer moves
  const rimSrc = fs.readFileSync(path.join(ROOT, 'prism-rim-canvas.js'), 'utf8');
  let rafScheduled = 0;
  let lastRaf = null;
  let nowT = 5000;
  const fakeCv = {
    width: 100, height: 40, isConnected: true,
    classList: { contains: (c) => c === 'ag-cs-prism-rim-cv' },
    getContext: () => ({ clearRect() {}, createRadialGradient: () => ({ addColorStop() {} }) }),
    setAttribute() {}, remove() {},
  };
  const fakeBox = {
    isConnected: true, firstElementChild: fakeCv,
    getAttribute: (k) => (k === 'data-ag-cs-prism-box' ? '1' : null),
    getBoundingClientRect: () => ({ left: 600, top: 600, right: 900, bottom: 680, width: 300, height: 80 }),
    appendChild() {}, style: { setProperty() {} },
  };
  fakeCv.parentElement = fakeBox;
  const sbRim = {
    window: { devicePixelRatio: 1 },
    performance: { now: () => nowT },
    requestAnimationFrame: (cb) => { rafScheduled++; lastRaf = cb; return rafScheduled; },
    cancelAnimationFrame() {},
    getComputedStyle: () => ({ borderTopLeftRadius: '10px' }),
    document: {
      documentElement: { getAttribute: () => 'ultra' },
      querySelectorAll: (s) => (s.includes('data-ag-cs-prism-box') ? [fakeBox] : []),
    },
    Set, Map, Array, Math, Number, String, Boolean,
  };
  sbRim.globalThis = sbRim;
  vm.runInNewContext(rimSrc, sbRim);
  const rimCtl = sbRim.__agPrismRimCanvas.createPrismRimCanvasController({
    isDestroyed: () => false, isDarkTheme: () => true, motionReduced: () => false,
    getMinFrameGapMs: () => 0, getAmbientIntensity: () => 1, getAccentTone: () => 'follow',
    canMountRealCanvas: () => true, setAttrIfChanged() {}, runGuardedMut: (fn) => fn(),
  });
  rimCtl.onPointerMove({ clientX: 40, clientY: 120 });
  assert.equal(rafScheduled, 1);
  lastRaf(nowT);
  nowT += 40;
  rimCtl.onPointerMove({ clientX: 45, clientY: 160 });
  assert.equal(rafScheduled, 1, 'far-idle sidebar pointer moves must schedule 0 rAFs once canvases are cleared');

  // 3) style.css, stream-choreography, and ui-runtime all exclude ephemeral [data-hover-card-popup]
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  const uiSrc = fs.readFileSync(path.join(ROOT, 'ui-runtime.js'), 'utf8');
  const scSrc = fs.readFileSync(path.join(ROOT, 'stream-choreography.js'), 'utf8');
  assert.ok(css.includes('.agy-overlay:not([data-hover-card-popup])'), 'style.css must exclude hover cards from ag-cs-lens-in animation');
  assert.ok(scSrc.includes("ha(ov, 'data-hover-card-popup')"), 'stream-choreography must skip hover cards in measureNewLensOverlays');
  assert.ok(uiSrc.includes("'data-hover-card-popup'"), 'ui-runtime must short-circuit hover cards in classifyDirtySubtree');
});

test('perf guard 17: pulse-dashboard keep-alive agent & includeMessages:false, bounded daemon RAM budgets, and lazy sidebar/telemetry release', async () => {
  const http = await import('node:http');
  const { AntigravityClient } = await import('../vendor/pulse-dashboard/sidecars/panel/client.mjs');
  const { PrismDaemon } = await import('../sidecars/daemon/main.mjs');

  // 1) client.mjs must never disable HTTP pooling via agent:false and must default includeMessages:false
  const clientSrc = fs.readFileSync(path.join(ROOT, 'vendor/pulse-dashboard/sidecars/panel/client.mjs'), 'utf8');
  assert.equal(/agent:\s*false/.test(clientSrc), false, 'client.mjs must reuse keep-alive HttpAgent instead of agent:false');

  let receivedBody = null;
  let receivedConn = '';
  const srv = http.createServer((req, res) => {
    receivedConn = String(req.headers.connection || '');
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      receivedBody = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ generatorMetadata: [] }));
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const client = new AntigravityClient();
  try {
    const port = srv.address().port;
    assert.equal(client.agent?.keepAlive, true, 'AntigravityClient must use a keepAlive HttpAgent');
    client.discover = async () => ({ port, csrf: 'test-csrf', pid: 1 });
    await client.call('GetCascadeTrajectoryGeneratorMetadata', { cascadeId: '11111111-1111-1111-1111-111111111111', generatorMetadataOffset: 0 });
    assert.equal(receivedBody.includeMessages, false, 'GetCascadeTrajectoryGeneratorMetadata must default includeMessages:false');
    assert.equal(receivedConn.toLowerCase(), 'keep-alive', 'RPC request must use HTTP keep-alive');
  } finally {
    client.dispose();
    await new Promise((r) => srv.close(r));
  }

  // 2) Verify tightened RAM / polling budgets across pulse-dashboard & thought-translator
  const readerSrc = fs.readFileSync(path.join(ROOT, 'vendor/pulse-dashboard/sidecars/panel/trajectory-reader.mjs'), 'utf8');
  const storeSrc = fs.readFileSync(path.join(ROOT, 'vendor/pulse-dashboard/sidecars/panel/store.mjs'), 'utf8');
  const delSrc = fs.readFileSync(path.join(ROOT, 'vendor/pulse-dashboard/sidecars/panel/delegated-usage.mjs'), 'utf8');
  const bgStatSrc = fs.readFileSync(path.join(ROOT, 'vendor/pulse-dashboard/sidecars/panel/background-statistics.mjs'), 'utf8');
  const bgWorkSrc = fs.readFileSync(path.join(ROOT, 'vendor/pulse-dashboard/sidecars/panel/background-worker.mjs'), 'utf8');
  const usageSrc = fs.readFileSync(path.join(ROOT, 'vendor/pulse-dashboard/sidecars/panel/usage.mjs'), 'utf8');
  const thoughtSrc = fs.readFileSync(path.join(ROOT, 'vendor/thought-translator/translator-service.mjs'), 'utf8');
  const mainSrc = fs.readFileSync(path.join(ROOT, 'sidecars/daemon/main.mjs'), 'utf8');

  assert.ok(readerSrc.includes('budgetBytes=4*1024*1024') && readerSrc.includes('summaryAt>=6000') && readerSrc.includes('trajectoryVerbosity:2'), 'trajectory-reader must use 4 MiB budget, 6s summary TTL, and compact trajectoryVerbosity:2');
  assert.ok(storeSrc.includes('updatedAt < 4500') && storeSrc.includes('this.sessions.size > 32'), 'store must use 4.5s hot TTL and 32-session cap');
  assert.ok(delSrc.includes('budgetBytes=2*1024*1024') && delSrc.includes('refreshMs=15000'), 'delegated-usage must use 2 MiB budget and 15s refresh');
  assert.ok(bgStatSrc.includes('maxOldGenerationSizeMb:48'), 'background-statistics worker V8 cap must be 48 MB');
  assert.ok(bgWorkSrc.includes('++revisions>1') && bgWorkSrc.includes('sleep(8000)') && bgWorkSrc.includes('trajectoryVerbosity:2'), 'background-worker must cap active-session restarts to 1 with 8s backoff and verbosity 2');
  assert.ok(usageSrc.includes('maxOldGenerationSizeMb:32') && usageSrc.includes('livePollMs=3000') && usageSrc.includes('maxCandidates=10'), 'usage worker V8 cap must be 32 MB, live poll 3s, and maxCandidates 10');
  assert.ok(thoughtSrc.includes('opts.maxCacheEntries || 400'), 'thought-translator in-memory cache default must be capped at 400');
  assert.equal((mainSrc.match(/includeMessages:\s*false/g) || []).length >= 2, true, 'main.mjs generator metadata calls must pass includeMessages:false');

  // 2b) TrajectoryJson zero-allocation discard fast-path preserves strict JSON validation
  const { TrajectoryJson } = await import('../vendor/pulse-dashboard/sidecars/panel/trajectory-json.mjs');
  const tj = new TrajectoryJson();
  tj.write('{"steps":[{"type":"PLANNER_RESPONSE","hugeDroppedBlob":"abc\\n\\u0041\\"def\\\\ghi","metadata":{"startedAt":"2026-11-20T00:00:00Z"}}]}');
  const parsedTj = tj.end();
  assert.equal(parsedTj.steps[0].type, 'PLANNER_RESPONSE');
  assert.equal(parsedTj.steps[0].hugeDroppedBlob, undefined);
  assert.equal(parsedTj.steps[0].metadata.startedAt, '2026-11-20T00:00:00Z');
  assert.throws(() => {
    const bad = new TrajectoryJson();
    bad.write('{"steps":[{"hugeDroppedBlob":"bad\nnewline"}]}');
  }, 'discard fast-path must still reject unescaped control chars');
  assert.throws(() => {
    const bad2 = new TrajectoryJson();
    bad2.write('{"steps":[{"hugeDroppedBlob":"bad\\x20escape"}]}');
  }, 'discard fast-path must still reject invalid escape sequences');
  assert.throws(() => {
    const bad3 = new TrajectoryJson();
    bad3.write('{"steps":[{"hugeDroppedBlob":"bad\\u123Z"}]}');
  }, 'discard fast-path must still reject invalid unicode escapes');

  // 3) PrismDaemon skips compiling 284KB sidebar-client.js when sidebarStudio is off and releases idle telemetry
  const daemon = Object.create(PrismDaemon.prototype);
  daemon.rootDir = ROOT;
  daemon._readCdpFileSig = () => null;
  let sidebarBuildCalls = 0;
  daemon.cdp = {
    readConfig: () => ({ sidebarStudio: 'off', telemetryModule: 'off' }),
    buildInjectExpression: () => 'main',
    buildSidebarStudioExpression: () => { sidebarBuildCalls++; return 'sb'; },
  };
  daemon.rebuildBundle();
  assert.equal(sidebarBuildCalls, 0, 'rebuildBundle must skip compiling sidebar-client.js when sidebarStudio is off');
  assert.equal(daemon.sidebarExpr, '');

  let disposedCount = 0;
  daemon._lazyStore = { dispose() { disposedCount++; }, client: { dispose() { disposedCount++; } } };
  daemon._lazyUsage = { dispose() { disposedCount++; } };
  daemon._lazyLsClient = daemon._lazyStore.client;
  daemon._backendSummariesCache = { list: [], byId: new Map() };
  daemon._lastTelemetryActivityAt = Date.now() - 200000;
  assert.equal(daemon._releaseIdleTelemetry(false), true, 'idle telemetry must release after 120s inactivity');
  assert.equal(disposedCount, 2, 'idle release must dispose usage & store once without double-disposing shared client');
  assert.equal(daemon._lazyStore, null);
  assert.equal(daemon._lazyUsage, null);
  assert.equal(daemon._lazyLsClient, null);
  assert.equal(daemon._backendSummariesCache, null);
});

test('perf guard 18: live-host-adapter bounds lastKnownById to <=2000 and sidebar-client parses host timestamps deterministically & skips no-op list rebuilds', async () => {
  const { createLiveHostAdapter } = await import('../vendor/sidebar-studio/live-host-adapter.mjs');
  const adapter = createLiveHostAdapter();
  // Push 3 batches of 900 distinct conversations (2,700 total) and verify LRU cap <= 2000 while preserving active batch
  for (let batch = 0; batch < 3; batch++) {
    const items = [];
    for (let i = 0; i < 900; i++) {
      const id = `cid-${batch}-${i}`;
      items.push({ cascadeId: id, title: `Chat ${id}`, status: 'idle', updatedAt: batch * 10000 + i + 1 });
    }
    adapter.syncFromRenderer({ catalog: { health: 'ready', items } });
  }
  const snap = adapter.getCatalog();
  const keys = Object.keys(snap.lastKnownById);
  assert.ok(keys.length <= 2000, `lastKnownById must be bounded to <=2000, got ${keys.length}`);
  assert.ok(snap.lastKnownById['cid-2-899'], 'newest active batch items must always be retained');
  assert.equal(snap.lastKnownById['cid-0-0'], undefined, 'oldest stale entries must be evicted beyond 2000 cap');

  // Verify sidebar-client.js parseHostTsMs handles ISO strings, protobuf {seconds, nanos}, numbers, and missing values without Date.now()/NaN
  const sbSrc = fs.readFileSync(path.join(ROOT, 'vendor/sidebar-studio/sidebar-client.js'), 'utf8');
  const parseMatch = sbSrc.match(/function parseHostTsMs\(raw\)[\s\S]*?\n    \}/);
  assert.ok(parseMatch, 'parseHostTsMs helper must exist in sidebar-client.js');
  const sbTs = { Number, Math, Date };
  vm.runInNewContext(`${parseMatch[0]}; globalThis.parseHostTsMs = parseHostTsMs;`, sbTs);
  assert.equal(sbTs.parseHostTsMs('2026-11-20T08:00:00Z'), Date.parse('2026-11-20T08:00:00Z'));
  assert.equal(sbTs.parseHostTsMs({ seconds: 1700000000, nanos: 500000000 }), 1700000000500);
  assert.equal(sbTs.parseHostTsMs(1700000000), 1700000000000);
  assert.equal(sbTs.parseHostTsMs(1700000000123), 1700000000123);
  assert.equal(sbTs.parseHostTsMs(undefined), 0, 'missing timestamp must return deterministic 0, never Date.now() or NaN');
  assert.equal(sbTs.parseHostTsMs('not-a-date'), 0);

  assert.ok(sbSrc.includes('document.hidden') && sbSrc.includes('? 60 : 280'), 'scheduleCatalogSync must skip hidden tabs and throttle steady-state sync to 280ms');
  assert.ok(sbSrc.includes('cachedSidebarSlots') && sbSrc.includes('invalidateSidebarSlotsCache'), 'resolveNativeSidebarSlots must cache slot geometry');
  assert.ok(sbSrc.includes('buildChatListRenderSig') && sbSrc.includes('renderSig === lastChatListRenderSig'), 'renderChatSidebarList must skip redundant DOM teardowns');
});

test('perf guard 19: conversation-archive safely moves finished subagent DB+WAL+SHM bundles, refuses while language_server runs, restores losslessly, and keeps default bundle < 670 KiB', async () => {
  const os = await import('node:os');
  const arch = await import('../sidecars/daemon/conversation-archive.mjs');
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-prism-arch-'));
  try {
    const convDir = path.join(tmpRoot, 'conversations');
    const archiveDir = path.join(tmpRoot, 'conversations_archive');
    fs.mkdirSync(convDir, { recursive: true });

    const subOldId = '11111111-1111-4111-8111-111111111111';
    const subRunningId = '22222222-2222-4222-8222-222222222222';
    const mainId = '33333333-3333-4333-8333-333333333333';
    const oldTime = new Date(Date.now() - 12 * 3600000);

    for (const [fn, content] of [
      [`${subOldId}.db`, 'sub-old-db-bytes'],
      [`${subOldId}.db-wal`, 'sub-old-wal'],
      [`${subOldId}.db-shm`, 'sub-old-shm'],
      [`${subRunningId}.db`, 'sub-running-db'],
      [`${mainId}.db`, 'main-db-precious'],
    ]) {
      const fp = path.join(convDir, fn);
      fs.writeFileSync(fp, content, 'utf8');
      fs.utimesSync(fp, oldTime, oldTime);
    }

    // 1) Fail-closed without catalog index
    const noIdx = arch.archiveConversations({ convDir, archiveDir, checkRunning: () => false });
    assert.equal(noIdx.ok, false);
    assert.equal(noIdx.code, 'NO_CATALOG_INDEX');

    // 2) Save catalog index with authoritative lastModifiedTime (even if .db-shm was just touched on startup)
    fs.utimesSync(path.join(convDir, `${subOldId}.db-shm`), new Date(), new Date());
    arch.saveCatalogIndex(archiveDir, {
      [subOldId]: {
        status: 'CASCADE_RUN_STATUS_IDLE',
        stepCount: 120,
        lastModifiedTime: oldTime.toISOString(),
        trajectoryMetadata: { parentConversationId: mainId },
      },
      [subRunningId]: { status: 'CASCADE_RUN_STATUS_RUNNING', stepCount: 5, trajectoryMetadata: { parentConversationId: mainId } },
      [mainId]: { summary: 'Main Task', status: 'CASCADE_RUN_STATUS_IDLE', stepCount: 300, trajectoryMetadata: {} },
    });
    const scan = arch.scanConversationStorage({ convDir, archiveDir, subagentMaxAgeHours: 6 });
    assert.equal(scan.mainCount, 1);
    assert.equal(scan.subagentCount, 2);
    assert.equal(scan.archivableSubagentCount, 1, 'only finished subagent exceeding age threshold is archivable');

    // 3) Must refuse to move files while language_server is running
    const blocked = arch.archiveConversations({ convDir, archiveDir, subagentMaxAgeHours: 6, checkRunning: () => true });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.code, 'LANGUAGE_SERVER_RUNNING');
    assert.equal(fs.existsSync(path.join(convDir, `${subOldId}.db`)), true);

    // 4) Archive cleanly when language_server is stopped: moves db+wal+shm atomically, preserves main & running subagent
    const moved = arch.archiveConversations({ convDir, archiveDir, subagentMaxAgeHours: 6, checkRunning: () => false });
    assert.equal(moved.ok, true);
    assert.equal(moved.movedCount, 1);
    assert.equal(fs.existsSync(path.join(convDir, `${subOldId}.db`)), false);
    assert.equal(fs.existsSync(path.join(convDir, `${subOldId}.db-wal`)), false);
    assert.equal(fs.existsSync(path.join(convDir, `${subOldId}.db-shm`)), false);
    assert.equal(fs.existsSync(path.join(convDir, `${mainId}.db`)), true, 'main conversation must never be moved in subagents mode');
    assert.equal(fs.existsSync(path.join(convDir, `${subRunningId}.db`)), true, 'running subagent must never be moved');
    assert.equal(fs.existsSync(path.join(moved.batchDir, 'manifest.json')), true);

    // 5) Restore losslessly
    const restored = arch.restoreArchiveBatch({ convDir, archiveDir, batchName: 'latest', checkRunning: () => false });
    assert.equal(restored.ok, true);
    assert.equal(restored.restoredCount, 1);
    assert.equal(fs.readFileSync(path.join(convDir, `${subOldId}.db`), 'utf8'), 'sub-old-db-bytes');
    assert.equal(fs.readFileSync(path.join(convDir, `${subOldId}.db-wal`), 'utf8'), 'sub-old-wal');
    assert.equal(fs.readFileSync(path.join(convDir, `${subOldId}.db-shm`), 'utf8'), 'sub-old-shm');

    // 5b) Crash recovery: batch directory missing manifest.json is still discovered & restorable
    const orphanBatch = path.join(archiveDir, 'batch-2026-11-20T00-00-00-deadbeef');
    fs.mkdirSync(orphanBatch, { recursive: true });
    const orphanId = '44444444-4444-4444-8444-444444444444';
    fs.writeFileSync(path.join(orphanBatch, `${orphanId}.db`), 'orphan-crash-db', 'utf8');
    const batches = arch.listArchiveBatches(archiveDir);
    assert.ok(batches.some((b) => b.batchName === 'batch-2026-11-20T00-00-00-deadbeef' && b.status === 'recovered-no-manifest'));
    const recRes = arch.restoreArchiveBatch({ convDir, archiveDir, batchName: 'batch-2026-11-20T00-00-00-deadbeef', checkRunning: () => false });
    assert.equal(recRes.ok, true);
    assert.equal(recRes.restoredCount, 1);
    assert.equal(fs.readFileSync(path.join(convDir, `${orphanId}.db`), 'utf8'), 'orphan-crash-db');

    // 6) Helper scripts generation, fail-closed checkRunning error & shell injection rejection
    const checkErrBlocked = arch.archiveConversations({
      convDir,
      archiveDir,
      subagentMaxAgeHours: 6,
      checkRunning: () => { throw new Error('tasklist unavailable'); },
    });
    assert.equal(checkErrBlocked.ok, false);
    assert.equal(checkErrBlocked.code, 'LANGUAGE_SERVER_RUNNING', 'checkRunning throwing must fail-closed');
    assert.throws(() => {
      arch.writeHelperScripts({ scriptPath: 'C:\\bad&calc\\script.mjs', archiveDir });
    }, 'writeHelperScripts must reject shell metacharacters');
    const helpers = arch.writeHelperScripts({
      scriptPath: path.join(ROOT, 'sidecars', 'daemon', 'conversation-archive.mjs'),
      archiveDir,
    });
    assert.ok(fs.existsSync(helpers.archiveScriptPath) && fs.existsSync(helpers.restoreScriptPath));
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('perf guard 20: Host Turbo alert.css dedup+restore, async img, hidden sidecar iframe skip, blur 1.2s pause / 0ms wake, idle fxCanvas 0x0 reclamation, and bundle < 690 KiB', () => {
  const cdp = require(path.join(ROOT, 'cdp.js'));
  const enhancerMod = require(path.join(ROOT, 'host-workbench-enhancer.js'));
  const rig = require(path.join(ROOT, 'dual-mascot-rig.js'));

  // 1) Hard size budget: default bundle < 690 KiB (706,560 B) / <= 704,000 B & pulse-vial-bridge.js < 31,000 B
  const defaultExpr = cdp.buildInjectExpression(cdp.DEFAULT_CONFIG);
  const bundleBytes = Buffer.byteLength(defaultExpr, 'utf8');
  assert.ok(bundleBytes < 690 * 1024, `Default bundle must stay < 690 KiB (706560 B), got ${bundleBytes} B`);
  const pvBytes = fs.statSync(path.join(ROOT, 'pulse-vial-bridge.js')).size;
  assert.ok(pvBytes < 31000, `pulse-vial-bridge.js must stay < 31000 B, got ${pvBytes} B`);

  // 2) CSS guards (T2/T3/T4/T5): hidden dot animation:none, valid blur pause (no pseudo-elements inside :is()), iframe contain:strict, safe pre/table contain
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  assert.ok(
    css.includes('[data-agent-state-dot]:nth-child(n+2){display:none !important;animation:none !important;}'),
    'Hidden status spinner dots must clear native animation'
  );
  assert.ok(css.includes('iframe[src^="plugin://"]{contain:strict;'), 'plugin:// sidecar iframes must have contain:strict');
  assert.ok(
    css.includes('pre:not([data-ag-cs-rich-pre="1"]),pre>div:is(.border,.bg-muted)>div:nth-child(2),.agy-md-table.md-table-frame,table:not(.md-table-el)){contain:layout style;}'),
    'Read-only code bodies and Markdown tables must have safe contain:layout style without contain:paint'
  );
  const blurRuleMatch = css.match(/html\[data-ag-cs-style\](?:\[data-ag-cs-win-blur="1"\]|:is\(\[data-ag-cs-win-blur="1"\],\[data-ag-pp-open="1"\]\))\{[^\n]+\}/);
  assert.ok(blurRuleMatch, 'style.css must define window-blur animation pause rule');
  assert.ok(
    blurRuleMatch[0].includes('animation-play-state:paused !important;') &&
      blurRuleMatch[0].includes('[data-testid="status-loading-spinner"]::before') &&
      blurRuleMatch[0].includes('.shimmer-text-mask') &&
      blurRuleMatch[0].includes('.shimmer-text-content'),
    'Window-blur rule must pause spinner, dot, and shimmer animations'
  );
  assert.equal(/:is\([^)]*::(?:before|after)/.test(blurRuleMatch[0]), false, 'Pseudo-elements must never be placed inside :is()');

  // 3) Live runtime test for T1 (alert.css dedup + lossless restore without removing React nodes), T2 (async img), and T5 (1.2s blur / 0ms focus wake)
  const uiSrc = fs.readFileSync(path.join(ROOT, 'ui-runtime.js'), 'utf8');
  function mkEl(tag, attrs = {}) {
    const attrMap = new Map(Object.entries(attrs));
    const el = {
      nodeType: 1,
      tagName: String(tag).toUpperCase(),
      parentElement: null,
      parentNode: null,
      children: [],
      childNodes: [],
      isConnected: true,
      disabled: false,
      sheet: tag === 'style' ? { disabled: false } : undefined,
      style: { setProperty() {}, removeProperty() {} },
      textContent: '',
      get id() { return attrMap.get('id') || ''; },
      set id(v) { if (v) attrMap.set('id', String(v)); else attrMap.delete('id'); },
      get className() { return attrMap.get('class') || ''; },
      set className(v) { if (v) attrMap.set('class', String(v)); else attrMap.delete('class'); },
      classList: { add() {}, remove() {}, contains: () => false },
      getAttribute: (k) => (attrMap.has(k) ? attrMap.get(k) : null),
      setAttribute: (k, v) => attrMap.set(k, String(v)),
      hasAttribute: (k) => attrMap.has(k),
      removeAttribute: (k) => attrMap.delete(k),
      appendChild(ch) {
        ch.parentElement = this;
        ch.parentNode = this;
        this.children.push(ch);
        this.childNodes.push(ch);
        return ch;
      },
      remove() {
        const p = this.parentNode;
        if (!p) return;
        const i = p.children.indexOf(this);
        if (i >= 0) p.children.splice(i, 1);
        const j = p.childNodes.indexOf(this);
        if (j >= 0) p.childNodes.splice(j, 1);
        this.parentElement = null;
        this.parentNode = null;
        this.isConnected = false;
      },
      closest(sel) {
        let cur = this;
        while (cur) {
          if (sel === '[data-prism-ignore]' && cur.hasAttribute('data-prism-ignore')) return cur;
          cur = cur.parentElement;
        }
        return null;
      },
      contains(o) {
        let cur = o;
        while (cur) {
          if (cur === this) return true;
          cur = cur.parentNode;
        }
        return false;
      },
      querySelectorAll(sel) {
        const out = [];
        const walk = (n) => {
          for (const c of n.children) {
            let hit = false;
            if (sel === 'style:not([id]):not([data-ag-turbo-dedup])') {
              hit = c.tagName === 'STYLE' && !c.id && !c.hasAttribute('data-ag-turbo-dedup');
            } else if (sel === 'img:not([data-ag-turbo-img])') {
              hit = c.tagName === 'IMG' && !c.hasAttribute('data-ag-turbo-img');
            } else if (sel === 'style[data-ag-turbo-dedup]') {
              hit = c.tagName === 'STYLE' && c.hasAttribute('data-ag-turbo-dedup');
            } else if (sel === 'img[data-ag-turbo-img]') {
              hit = c.tagName === 'IMG' && c.hasAttribute('data-ag-turbo-img');
            }
            if (hit) out.push(c);
            walk(c);
          }
        };
        walk(this);
        return out;
      },
      querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
      addEventListener() {},
      removeEventListener() {},
    };
    return el;
  }

  const html = mkEl('html');
  const head = mkEl('head');
  const body = mkEl('body');
  html.appendChild(head);
  html.appendChild(body);

  const bubble = mkEl('div');
  body.appendChild(bubble);
  const alertCss = '/* Copied from remark-github-blockquote-alert/alert.css */\n.markdown-alert{padding:8px;}';
  const dupStyles = [mkEl('style'), mkEl('style'), mkEl('style')];
  for (const s of dupStyles) { s.textContent = alertCss; bubble.appendChild(s); }
  const keepStyle = mkEl('style', { id: 'keep-style' });
  keepStyle.textContent = alertCss;
  head.appendChild(keepStyle);

  const imgNormal = mkEl('img', { src: 'icon.svg' });
  const imgIgnored = mkEl('img', { src: 'raw.png', 'data-prism-ignore': '1' });
  bubble.appendChild(imgNormal);
  bubble.appendChild(imgIgnored);

  const winListeners = new Map();
  const docListeners = new Map();
  const timers = new Map();
  let nextTid = 1;
  let hasFocusVal = true;

  const doc = {
    documentElement: html,
    head,
    body,
    hidden: false,
    hasFocus: () => hasFocusVal,
    createElement: (t) => mkEl(t),
    getElementById(id) {
      const find = (n) => {
        if (n.id === id) return n;
        for (const c of n.children) { const r = find(c); if (r) return r; }
        return null;
      };
      return find(html);
    },
    querySelectorAll: (sel) => html.querySelectorAll(sel),
    querySelector: (sel) => html.querySelector(sel),
    addEventListener(type, fn) {
      if (!docListeners.has(type)) docListeners.set(type, new Set());
      docListeners.get(type).add(fn);
    },
    removeEventListener(type, fn) { docListeners.get(type)?.delete(fn); },
  };
  const win = {
    location: { pathname: '/chat' },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    addEventListener(type, fn) {
      if (!winListeners.has(type)) winListeners.set(type, new Set());
      winListeners.get(type).add(fn);
    },
    removeEventListener(type, fn) { winListeners.get(type)?.delete(fn); },
    dispatch(type, ev = {}) {
      for (const fn of Array.from(winListeners.get(type) || [])) fn(ev);
    },
  };
  class MockMO {
    observe() {}
    disconnect() {}
    takeRecords() { return []; }
  }
  const sbUi = {
    window: win,
    document: doc,
    location: win.location,
    localStorage: win.localStorage,
    MutationObserver: MockMO,
    performance: { now: () => 1000 },
    setTimeout: (fn, ms) => { const id = nextTid++; timers.set(id, { fn, ms }); return id; },
    clearTimeout: (id) => { timers.delete(id); },
    setInterval: () => 9999,
    clearInterval: () => {},
    requestAnimationFrame: (fn) => { const id = nextTid++; timers.set(id, { fn, ms: 16 }); return id; },
    cancelAnimationFrame: (id) => { timers.delete(id); },
    console,
    Set, Map, WeakMap, WeakSet, Array, Object, Math, Number, String, Boolean, Date, RegExp, JSON,
  };
  sbUi.globalThis = sbUi;
  vm.runInNewContext(uiSrc, sbUi);
  sbUi.__agCsUiMain({}, { version: '1.0.6', codeHash: 'test' });

  // Verify T1: 1 singleton hoisted in head, all 3 duplicate bubble styles kept in React DOM but disabled=true
  const singleton = doc.getElementById('ag-prism-host-alert-css');
  assert.ok(singleton && singleton.parentNode === head, 'Singleton alert.css style must be hoisted into <head>');
  assert.equal(singleton.textContent, alertCss);
  for (const s of dupStyles) {
    assert.equal(s.parentNode, bubble, 'Duplicate <style> must NEVER be removed from React DOM tree');
    assert.equal(s.disabled, true, 'Duplicate <style> must be disabled=true');
    assert.equal(s.sheet.disabled, true, 'Duplicate style.sheet must be disabled=true');
    assert.equal(s.getAttribute('data-ag-turbo-dedup'), '1');
  }
  assert.equal(keepStyle.disabled, false, 'Styles with an id must never be deduplicated');

  // Verify T2: <img> gets async decoding & lazy loading; data-prism-ignore is skipped
  assert.equal(imgNormal.decoding, 'async');
  assert.equal(imgNormal.getAttribute('decoding'), 'async');
  assert.equal(imgNormal.getAttribute('loading'), 'lazy');
  assert.equal(imgIgnored.getAttribute('decoding'), null, '[data-prism-ignore] images must be skipped');

  // Verify T5: blur sets data-ag-cs-win-blur="1" after 1200ms debounce, focus wakes in 0ms
  const fireBlurTimers = () => {
    const entries = [...timers.entries()].filter(([, t]) => t.ms === 1200);
    for (const [id, t] of entries) {
      timers.delete(id);
      t.fn();
    }
    return entries.length;
  };
  hasFocusVal = false;
  win.dispatch('blur');
  assert.equal(html.getAttribute('data-ag-cs-win-blur'), null, 'Must not blur-pause immediately before 1200ms debounce');
  assert.equal(fireBlurTimers(), 1, 'Expected one 1200ms window blur debounce timer');
  assert.equal(html.getAttribute('data-ag-cs-win-blur'), '1', 'Window blur > 1200ms must set data-ag-cs-win-blur="1"');

  hasFocusVal = true;
  win.dispatch('focus');
  assert.equal(html.getAttribute('data-ag-cs-win-blur'), null, 'Window focus must clear data-ag-cs-win-blur in 0ms');

  // Blur cancelled by quick focus before 1200ms must leave no pending timer
  hasFocusVal = false;
  win.dispatch('blur');
  win.dispatch('focus');
  assert.equal([...timers.values()].filter((t) => t.ms === 1200).length, 0, 'Focus before 1200ms must cancel pending blur timer');

  // Pointer passing over an unfocused window wakes in 0ms and re-arms 1200ms sleep if still unfocused
  hasFocusVal = false;
  win.dispatch('blur');
  fireBlurTimers();
  assert.equal(html.getAttribute('data-ag-cs-win-blur'), '1');
  win.dispatch('pointermove', { clientX: 10, clientY: 10 });
  assert.equal(html.getAttribute('data-ag-cs-win-blur'), null, 'pointermove must wake blur immediately in 0ms');
  assert.equal([...timers.values()].filter((t) => t.ms === 1200).length, 1, 'unfocused pointermove wake must re-arm 1200ms blur timer');
  fireBlurTimers();
  assert.equal(html.getAttribute('data-ag-cs-win-blur'), '1', 're-armed blur timer must return unfocused window to low-power pause');

  // Verify initial-blur boot: if window is already unfocused on mount, onWinBlur arms automatically
  assert.ok(uiSrc.includes("if (typeof document.hasFocus === 'function' && !document.hasFocus()) onWinBlur();"), 'startLifecycle must arm blur timer when mounted while already unfocused');

  // Verify destroy() restores 100% of deduped styles and removes singleton & blur listeners
  hasFocusVal = false;
  win.dispatch('blur');
  fireBlurTimers();
  assert.equal(html.getAttribute('data-ag-cs-win-blur'), '1');
  win.__agPrism.destroy();
  assert.equal(doc.getElementById('ag-prism-host-alert-css'), null, 'destroy() must remove singleton alert.css');
  for (const s of dupStyles) {
    assert.equal(s.disabled, false, 'destroy() must restore duplicate <style> disabled=false');
    assert.equal(s.sheet.disabled, false);
    assert.equal(s.hasAttribute('data-ag-turbo-dedup'), false);
  }
  assert.equal(html.hasAttribute('data-ag-cs-win-blur'), false, 'destroy() must remove data-ag-cs-win-blur');
  assert.equal((winListeners.get('blur') || new Set()).size, 0, 'destroy() must unbind window blur listener');
  assert.equal((winListeners.get('focus') || new Set()).size, 0, 'destroy() must unbind window focus listener');

  // 4) T3: Hidden 0x0 sidecar iframe skips theme sampling & postMessage, then hydrates immediately on ResizeObserver reveal
  let roCallback = null;
  let hiddenRect = { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 };
  const hiddenMsgs = [];
  const hiddenIframe = mkEl('iframe', { 'data-testid': 'sidecar-iframe', src: 'plugin://swarm--swarm_board/' });
  hiddenIframe.getBoundingClientRect = () => ({ ...hiddenRect });
  hiddenIframe.contentWindow = { postMessage: (msg) => hiddenMsgs.push(msg) };
  const enhHtml = mkEl('html', { 'data-ag-cs-style': '1', 'data-ag-cs-theme': 'dark', 'data-ag-cs-palette': 'obsidian' });
  const enhBody = mkEl('body');
  enhHtml.appendChild(enhBody);
  enhBody.appendChild(hiddenIframe);
  const enhDoc = {
    documentElement: enhHtml,
    body: enhBody,
    querySelectorAll: (sel) => (sel.includes('sidecar-iframe') ? [hiddenIframe] : []),
    querySelector: () => null,
  };
  const enhWin = {
    innerHeight: 900,
    getComputedStyle: () => ({ getPropertyValue: (k) => (k === '--background' ? '#0B0B0E' : k === 'color-scheme' ? 'dark' : '') }),
    ResizeObserver: class {
      constructor(cb) { roCallback = cb; }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
    addEventListener() {},
    removeEventListener() {},
  };
  const enhCtl = enhancerMod.createHostEnhancerController({ doc: enhDoc, win: enhWin, getLang: () => 'zh-CN' });
  enhCtl.sync();
  assert.equal(hiddenMsgs.length, 0, 'Hidden 0x0 sidecar iframe must receive 0 postMessages');
  assert.equal(enhCtl.getDebugState().themeSampleCount, 0, 'All-hidden sidecar iframes must skip getComputedStyle');

  hiddenRect = { left: 0, top: 0, width: 480, height: 700, right: 480, bottom: 700 };
  assert.equal(typeof roCallback, 'function', 'Host enhancer must attach ResizeObserver to sidecar iframes');
  roCallback([{ target: hiddenIframe, contentRect: { width: 480, height: 700 } }]);
  assert.equal(hiddenMsgs.length, 1, 'Revealing hidden sidecar iframe must push theme-change immediately');
  enhCtl.destroy();

  // 5) T6: dual-mascot-rig fxCanvas starts 0x0 (display:none), allocates during chromaResonance sparks, and shrinks back to 0x0
  const hostChildren = [];
  const makeRigEl = (tag) => {
    const el = {
      tagName: String(tag).toUpperCase(),
      className: '',
      width: 300,
      height: 150,
      clientWidth: 640,
      style: { display: '', width: '', height: '', transform: '' },
      children: [],
      dataset: {},
      setAttribute() {},
      getAttribute: () => null,
      appendChild(ch) { this.children.push(ch); ch.parentNode = this; return ch; },
      remove() {},
      addEventListener() {},
      removeEventListener() {},
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 48, right: 640, bottom: 48 }),
      getContext: () => ({
        save() {}, restore() {}, translate() {}, scale() {}, rotate() {}, drawImage() {},
        setTransform() {}, clearRect() {}, fillRect() {},
        imageSmoothingEnabled: false, fillStyle: '', globalAlpha: 1,
      }),
    };
    return el;
  };
  const rigHost = makeRigEl('div');
  rigHost.appendChild = (ch) => { hostChildren.push(ch); rigHost.children.push(ch); ch.parentNode = rigHost; return ch; };
  const rigWin = {
    devicePixelRatio: 1,
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    addEventListener() {},
    removeEventListener() {},
  };
  const rigDoc = {
    hidden: false,
    defaultView: rigWin,
    createElement: (t) => { const e = makeRigEl(t); e.ownerDocument = rigDoc; return e; },
    addEventListener() {},
    removeEventListener() {},
  };
  rigHost.ownerDocument = rigDoc;
  let rigTickFn = null;
  const origSetInt = globalThis.setInterval;
  const origClrInt = globalThis.clearInterval;
  const origSetTo = globalThis.setTimeout;
  const origClrTo = globalThis.clearTimeout;
  globalThis.setInterval = (fn) => { rigTickFn = fn; return 1; };
  globalThis.clearInterval = () => {};
  globalThis.setTimeout = () => 1;
  globalThis.clearTimeout = () => {};
  const rigStage = rig.mountDualMascotStage(rigHost, {
    miniPileEnabled: true,
    reducedMotion: false,
  });
  try {
    const fxCanvas = hostChildren.find((c) => c.className === 'ag-v2-chroma-fx');
    assert.ok(fxCanvas, 'Expected ag-v2-chroma-fx canvas');
    assert.equal(fxCanvas.width, 0, 'Idle fxCanvas must start with width=0 (no default 300x150 GPU texture)');
    assert.equal(fxCanvas.height, 0, 'Idle fxCanvas must start with height=0');
    assert.equal(fxCanvas.style.display, 'none', 'Idle fxCanvas must be display:none');

    // Trigger 3-stage chromaResonance burst -> fxCanvas allocates dynamically
    rigStage.stackOnto('cowboy', 'clawd');
    rigStage.stackOnto('cat', 'cowboy');
    rigStage.notify('model-shift');
    rigStage.notify('code-copied');
    for (let i = 0; i < 4; i++) rigStage.poke('cat');
    assert.equal(rigStage.getLayoutSnapshot().chromaResonance.active, true);
    assert.ok(typeof rigTickFn === 'function', 'Mascot heartbeat must be scheduled');
    rigTickFn();
    assert.ok(fxCanvas.width > 0 && fxCanvas.height > 0, 'Active chroma burst must allocate fxCanvas on demand');
    assert.equal(fxCanvas.style.display, '', 'Active chroma burst must show fxCanvas');

    // Toggle chromaResonance off and step ticks until trailing sparks fade -> fxCanvas reclaims back to 0x0 + display:none
    for (let i = 0; i < 4; i++) rigStage.poke('cat');
    assert.equal(rigStage.getLayoutSnapshot().chromaResonance.active, false);
    for (let k = 0; k < 40; k++) rigTickFn();
    assert.equal(rigStage.getLayoutSnapshot().chromaResonance.sparkCount, 0);
    assert.equal(fxCanvas.width, 0, 'fxCanvas must reclaim to width=0 once sparks end');
    assert.equal(fxCanvas.height, 0, 'fxCanvas must reclaim to height=0 once sparks end');
    assert.equal(fxCanvas.style.display, 'none', 'fxCanvas must return to display:none once sparks end');
  } finally {
    rigStage.dispose();
    globalThis.setInterval = origSetInt;
    globalThis.clearInterval = origClrInt;
    globalThis.setTimeout = origSetTo;
    globalThis.clearTimeout = origClrTo;
  }
});

test('perf guard 21: Issues #2/#3/#5/#7/#8 + PR #6 + #35 queued-message 3-gears fix + #36 external zh coexistence & bundle <= 704KB', () => {
  const cdp = require(path.join(ROOT, 'cdp.js'));
  const mgc = require(path.join(ROOT, 'model-glyph-crystal.js'));
  const scMod = require(path.join(ROOT, 'stream-choreography.js'));
  const settingsPanel = require(path.join(ROOT, 'settings-panel.js'));
  const i18nCore = require(path.join(ROOT, 'i18n-core.js'));
  const i18nLocales = require(path.join(ROOT, 'i18n-locales.js'));
  const uiMainFactory = require(path.join(ROOT, 'ui-runtime.js'));
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');

  // 1) CSS & REMOVE_EXPRESSION hygiene: 0 :has(), 0 non-ASCII, stepped animations, blur/off backdrop-filter:none, fold-body contain:layout style, Issue #8 scrollbar fix
  assert.equal((css.match(/:has\(/g) || []).length, 0, 'style.css must contain zero :has() selectors');
  assert.equal(/[^\x00-\x7F]/.test(css), false, 'style.css must contain zero non-ASCII characters');
  assert.ok(css.includes('ag-cs-spark-orbit 2.4s steps(36) infinite'), 'PR #6: spark orbit must use discrete steps(36)');
  assert.ok(css.includes('ag-cs-orbit-spin 2.4s steps(36) infinite'), 'PR #6: spinner orbit must use discrete steps(36)');
  assert.ok(css.includes('ag-cs-comet-tip 1.1s steps(18) infinite'), 'PR #6: streaming comet tip must use discrete steps(18)');
  assert.ok(
    css.includes('html[data-ag-cs-style]:is([data-ag-cs-win-blur="1"],[data-ag-cs-motion="off"])') &&
      css.includes('backdrop-filter:none !important;'),
    'Issue #2: win-blur & motion=off must disable backdrop-filter on transient overlays'
  );
  assert.ok(
    css.includes('& .ag-cs-settings-fold-body{display:none;') && css.includes('contain:layout style;}'),
    'Issue #3: .ag-cs-settings-fold-body must use display:none + contain:layout style instead of max-height transition'
  );
  assert.ok(
    css.includes('& div[role="dialog"]:not(.agy-overlay){animation:ag-cs-subtle-in'),
    'Issue #3: plain dialogs must use lightweight ag-cs-subtle-in'
  );
  assert.equal(css.includes(',[data-testid="autoscroll-viewport"],'), false, 'Issue #8: scrollbar rule must exclude autoscroll-viewport');
  assert.equal(css.includes('scrollbar-width:thin'), false, 'Issue #8: scrollbar rule must omit scrollbar-width:thin so ::-webkit-scrollbar stays active on Windows');
  for (const attr of ['data-ag-cs-model-menu', 'data-ag-cs-aux-dual', 'data-ag-cs-model-overlay']) {
    assert.ok(cdp.REMOVE_EXPRESSION.includes(attr) || cdp.REMOVE_EXPRESSION.includes(attr.replace('data-ag-cs-', '')), `REMOVE_EXPRESSION must clean ${attr}`);
  }

  // 2) Issue #3: stream-choreography measureNewLensOverlays() must NOT measure div[role="dialog"]
  let dialogRectReads = 0;
  const prevDoc = globalThis.document;
  globalThis.document = {
    documentElement: { getAttribute: () => 'ultra' },
    querySelectorAll: (sel) => {
      assert.equal(sel.includes('role="dialog"'), false, 'measureNewLensOverlays selector must omit div[role="dialog"]');
      if (sel.includes('.agy-overlay')) return [];
      return [{ getBoundingClientRect: () => { dialogRectReads += 1; return { left: 0, top: 0, width: 400, height: 300 }; } }];
    },
  };
  try {
    const scCtl = scMod.createStreamChoreographyController({ isDestroyed: () => false, isMotionStandardOrUltra: () => true });
    assert.equal(scCtl.measureNewLensOverlays().length, 0);
    assert.equal(dialogRectReads, 0);
  } finally {
    if (prevDoc === undefined) delete globalThis.document;
    else globalThis.document = prevDoc;
  }

  // 3) #36 External zh effort suffix normalization in model-glyph-crystal
  assert.deepEqual(mgc.parseModelLabelInfo('Claude Opus 4.6 (高思考)'), { brand: 'claude', tier: 'high', isOrchestrator: false, camp: 'claude' });
  assert.deepEqual(mgc.parseModelLabelInfo('Gemini 3.1 Pro（中等）'), { brand: 'gemini', tier: 'medium', isOrchestrator: false, camp: 'gemini' });
  assert.deepEqual(mgc.parseModelLabelInfo('GPT-5.2 (低)'), { brand: 'openai', tier: 'low', isOrchestrator: false, camp: 'gemini' });
  assert.equal(mgc.parseModelLabelInfo('Orchestrator (自动)').isOrchestrator, true);

  // 4) Live VM check for Issue #5 aux-pane-split guard, #35 queued-message 3-gears fix, #36 external zh UI skip, and Issue #7 zero 600-btn rescan & Read-then-Write settings click
  let moCb = null;
  let totalRectReads = 0;
  const makeDomNode = (tag, attrs = {}) => {
    const attrMap = new Map(Object.entries(attrs).map(([k, v]) => [k, String(v)]));
    const clsSet = new Set(String(attrs.class || '').split(/\s+/).filter(Boolean));
    const node = {
      nodeType: 1,
      tagName: String(tag).toUpperCase(),
      id: attrs.id || '',
      className: attrs.class || '',
      textContent: '',
      innerHTML: '',
      hidden: false,
      disabled: false,
      isConnected: true,
      parentElement: null,
      parentNode: null,
      children: [],
      childNodes: [],
      style: {
        display: '',
        width: '',
        opacity: '',
        setProperty(k, v) { this[k] = v; },
        removeProperty(k) { delete this[k]; },
        getPropertyValue(k) { return this[k] || ''; },
      },
      classList: {
        add: (...cs) => cs.forEach((c) => clsSet.add(c)),
        remove: (...cs) => cs.forEach((c) => clsSet.delete(c)),
        contains: (c) => clsSet.has(c),
        toggle: (c, f) => (f ? clsSet.add(c) : clsSet.delete(c)),
      },
      _listeners: new Map(),
      addEventListener(ev, fn) {
        if (!this._listeners.has(ev)) this._listeners.set(ev, []);
        this._listeners.get(ev).push(fn);
      },
      removeEventListener() {},
      click() {
        const ls = this._listeners.get('click') || [];
        const ev = { type: 'click', target: this, stopPropagation() {}, preventDefault() {} };
        for (const fn of ls) fn(ev);
      },
      getAttribute: (k) => (attrMap.has(k) ? attrMap.get(k) : null),
      setAttribute(k, v) {
        attrMap.set(k, String(v));
        if (k === 'id') this.id = String(v);
        if (k === 'class') {
          this.className = String(v);
          clsSet.clear();
          String(v).split(/\s+/).filter(Boolean).forEach((c) => clsSet.add(c));
        }
      },
      hasAttribute: (k) => attrMap.has(k),
      removeAttribute: (k) => attrMap.delete(k),
      appendChild(ch) {
        if (!ch) return ch;
        if (ch.parentElement && ch.parentElement !== this) {
          const idx = ch.parentElement.children.indexOf(ch);
          if (idx >= 0) ch.parentElement.children.splice(idx, 1);
        }
        ch.parentElement = ch.parentNode = this;
        if (!this.children.includes(ch)) this.children.push(ch);
        return ch;
      },
      insertBefore(ch, ref) {
        if (!ch) return ch;
        ch.parentElement = ch.parentNode = this;
        const idx = ref ? this.children.indexOf(ref) : -1;
        if (idx >= 0) this.children.splice(idx, 0, ch);
        else this.children.push(ch);
        return ch;
      },
      removeChild(ch) {
        const i = this.children.indexOf(ch);
        if (i >= 0) this.children.splice(i, 1);
        ch.parentElement = ch.parentNode = null;
        return ch;
      },
      remove() {
        this.parentElement?.removeChild(this);
      },
      get firstElementChild() { return this.children[0] || null; },
      get lastElementChild() { return this.children[this.children.length - 1] || null; },
      get firstChild() { return this.children[0] || null; },
      get childElementCount() { return this.children.length; },
      getBoundingClientRect() {
        totalRectReads += 1;
        return { left: 10, top: 10, width: 64, height: 26 };
      },
      matches(sel) {
        return sel.split(',').some((raw) => {
          const s = raw.trim();
          if (!s) return false;
          if (s.startsWith('#')) return this.id === s.slice(1);
          if (s === 'button') return this.tagName === 'BUTTON';
          if (s === 'svg') return this.tagName === 'SVG';
          if (s === 'h2') return this.tagName === 'H2';
          if (s === 'div.p-6') return this.tagName === 'DIV' && clsSet.has('p-6');
          if (s === 'div.space-y-2') return this.tagName === 'DIV' && clsSet.has('space-y-2');
          if (s === '[role="dialog"] h2') return this.tagName === 'H2' && Boolean(this.closest('[role="dialog"]'));
          if (s === 'button[data-ag-cs-key]') return this.tagName === 'BUTTON' && attrMap.has('data-ag-cs-key');
          if (s === 'button[data-ag-cs-preset]') return this.tagName === 'BUTTON' && attrMap.has('data-ag-cs-preset');
          const mBtnKey = s.match(/^button\[data-ag-cs-key="([^"]+)"\]$/);
          if (mBtnKey) return this.tagName === 'BUTTON' && attrMap.get('data-ag-cs-key') === mBtnKey[1];
          const mAttrVal = s.match(/^\[([a-zA-Z0-9_-]+)="([^"]+)"\]$/);
          if (mAttrVal) return attrMap.get(mAttrVal[1]) === mAttrVal[2];
          const mAttrOnly = s.match(/^\[([a-zA-Z0-9_-]+)\]$/);
          if (mAttrOnly) return attrMap.has(mAttrOnly[1]);
          if (s.startsWith('.')) return clsSet.has(s.slice(1));
          return false;
        });
      },
      closest(sel) {
        let cur = this;
        while (cur) {
          if (cur.matches?.(sel)) return cur;
          cur = cur.parentElement;
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
      querySelector(sel) {
        return this.querySelectorAll(sel)[0] || null;
      },
    };
    return node;
  };

  const htmlEl = makeDomNode('html');
  const headEl = makeDomNode('head');
  const mainStyle = makeDomNode('style', { id: 'ag-prism-css' });
  headEl.appendChild(mainStyle);
  const bodyEl = makeDomNode('body', { class: 'dark' });
  htmlEl.appendChild(headEl);
  htmlEl.appendChild(bodyEl);

  // Aux split with 2 visible panes
  const auxSplit = makeDomNode('div', { 'data-testid': 'aux-pane-split' });
  const auxLeft = makeDomNode('div');
  const auxDivider = makeDomNode('div');
  const auxRight = makeDomNode('div');
  auxSplit.appendChild(auxLeft);
  auxSplit.appendChild(auxDivider);
  auxSplit.appendChild(auxRight);
  bodyEl.appendChild(auxSplit);

  // Queued messages 3 action buttons (#35) + external zh widget (#36) + real settings button
  const makeIconBtn = (attrs, svgCls) => {
    const b = makeDomNode('button', attrs);
    b.appendChild(makeDomNode('svg', { class: svgCls, width: '15' }));
    return b;
  };
  const qEdit = makeIconBtn({ 'aria-label': 'Edit queued message: 在设置里可选择模型与动效配置' }, 'lucide lucide-pencil');
  const qDel = makeIconBtn({ 'aria-label': 'Delete queued message: Check settings panel' }, 'lucide lucide-trash-2');
  const qSend = makeIconBtn({ 'aria-label': 'Send now: copy settings json' }, 'lucide lucide-send');
  const extZhBtn = makeIconBtn({ id: 'agy-theme-switcher', 'aria-label': '设置' }, '');
  const realSetBtn = makeIconBtn({ 'data-testid': 'settings-button', 'aria-label': 'Settings' }, 'lucide lucide-settings');
  for (const b of [qEdit, qDel, qSend, extZhBtn, realSetBtn]) bodyEl.appendChild(b);

  // Settings dialog
  const dlg = makeDomNode('div', { role: 'dialog' });
  const dlgBody = makeDomNode('div', { class: 'p-6' });
  const h2 = makeDomNode('h2');
  h2.textContent = '外观';
  const hostSec = makeDomNode('div', { class: 'space-y-2' });
  dlgBody.appendChild(h2);
  dlgBody.appendChild(hostSec);
  dlg.appendChild(dlgBody);
  bodyEl.appendChild(dlg);

  const storeMap = new Map([['ag-prism:settings-open', '1']]);
  const storageObj = {
    getItem: (k) => (storeMap.has(k) ? storeMap.get(k) : null),
    setItem: (k, v) => storeMap.set(k, String(v)),
    removeItem: (k) => storeMap.delete(k),
  };
  const findById = (root, id) => {
    if (root.id === id) return root;
    for (const c of root.children) {
      const f = findById(c, id);
      if (f) return f;
    }
    return null;
  };
  const fakeDoc = {
    documentElement: htmlEl,
    head: headEl,
    body: bodyEl,
    hidden: false,
    activeElement: null,
    hasFocus: () => true,
    createElement: (t) => makeDomNode(t),
    getElementById: (id) => findById(htmlEl, id),
    querySelector: (s) => htmlEl.querySelector(s),
    querySelectorAll: (s) => htmlEl.querySelectorAll(s),
    addEventListener() {},
    removeEventListener() {},
  };
  const rafQueue = [];
  const flushRaf = () => {
    while (rafQueue.length) rafQueue.shift()(16);
  };
  const sb = {
    document: fakeDoc,
    window: {
      document: fakeDoc,
      localStorage: storageObj,
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {},
    },
    localStorage: storageObj,
    navigator: { language: 'zh-CN' },
    location: { pathname: '/' },
    performance: { now: () => 100 },
    MutationObserver: class {
      constructor(cb) { if (!moCb) moCb = cb; }
      observe() {}
      disconnect() {}
      takeRecords() { return []; }
    },
    requestAnimationFrame: (cb) => { rafQueue.push(cb); return rafQueue.length; },
    cancelAnimationFrame() {},
    setTimeout: () => 1,
    clearTimeout() {},
    setInterval: () => 1,
    clearInterval() {},
    __agCsI18nCore: i18nCore,
    __agCsLocales: i18nLocales,
    __agMotionEngine: { glideIndicator() {}, bindMicroInteractions: () => ({ unbind() {} }) },
    __agAnimatedIcons: { renderIcon: (name) => `<svg class="ag-anim-icon" data-icon="${name}"></svg>` },
    Set, WeakSet, Map, WeakMap, Array, Object, Number, Math, String, Boolean, JSON, Promise, Proxy,
  };
  sb.globalThis = sb;
  sb.window.globalThis = sb;

  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'settings-panel.js'), 'utf8'), sb);
  vm.runInNewContext(`(${uiMainFactory.toString()})(${JSON.stringify(cdp.DEFAULT_CONFIG)})`, sb);
  const api = sb.window.__agPrism;
  assert.ok(api, 'ui-runtime must initialize cleanly');

  // Verify Issue #5 aux-pane-split O(1) attribute guard
  assert.equal(auxSplit.getAttribute('data-ag-cs-aux-dual'), '1', 'Dual visible aux panes must receive data-ag-cs-aux-dual="1"');
  auxRight.hidden = true;
  api.sync();
  assert.equal(auxSplit.hasAttribute('data-ag-cs-aux-dual'), false, 'Collapsing right aux pane must clear data-ag-cs-aux-dual');

  // Verify #35 queued-message buttons & #36 external zh widget NEVER receive settings-gear
  assert.equal(qEdit.hasAttribute('data-ag-cs-icon-injected'), false, 'Queued message Edit button must NOT turn into settings-gear');
  assert.equal(qDel.hasAttribute('data-ag-cs-icon-injected'), false, 'Queued message Delete button must NOT turn into settings-gear');
  assert.equal(qSend.hasAttribute('data-ag-cs-icon-injected'), false, 'Queued message Send button must NOT turn into settings-gear');
  assert.equal(extZhBtn.hasAttribute('data-ag-cs-icon-injected'), false, 'External zh switcher must be skipped');
  assert.equal(realSetBtn.getAttribute('data-ag-cs-icon-injected'), 'settings-gear', 'Genuine settings button must still receive settings-gear');

  // Verify Issue #7: clicking a setting button triggers ZERO iconFullRuns and <= 2 Read-then-Write rect reads (not 238x)
  const fullRunsBefore = api.getState().perf.iconFullRuns;
  totalRectReads = 0;
  const sec = fakeDoc.getElementById('ag-cs-settings-sec');
  assert.ok(sec, 'Settings section must be mounted');
  const cobaltBtn = sec.querySelectorAll('button[data-ag-cs-key="accentTone"]').find((b) => b.getAttribute('data-ag-cs-val') === '"cobalt"');
  assert.ok(cobaltBtn, 'accentTone=cobalt button must exist');
  cobaltBtn.click();
  flushRaf();
  assert.equal(api.getState().cfg.accentTone, 'cobalt');
  assert.equal(api.getState().perf.iconFullRuns, fullRunsBefore, 'Issue #7: clicking setting row must NOT trigger full-app 600-button icon rescan');
  assert.ok(totalRectReads <= 2, `Issue #7: clicking setting row must read <= 2 rects (Read-then-Write), got ${totalRectReads}`);

  // Clicking an already-selected setting button performs 0 rect reads and 0 extra syncs
  totalRectReads = 0;
  const syncsBeforeRepeat = api.getState().perf.syncCount;
  cobaltBtn.click();
  flushRaf();
  assert.equal(totalRectReads, 0, 'Re-clicking already active setting button must perform 0 rect reads');
  assert.equal(api.getState().perf.syncCount, syncsBeforeRepeat, 'Re-clicking already active setting button must be a no-op');

  // Plain dialog inner childList / attribute mutations must NOT dirty buttons or trigger icon rescans
  const innerSpan = makeDomNode('span');
  dlgBody.appendChild(innerSpan);
  moCb?.([{ type: 'childList', target: dlgBody, addedNodes: [innerSpan], removedNodes: [] }]);
  flushRaf();
  assert.equal(api.getState().perf.iconFullRuns, fullRunsBefore);

  api.destroy();

  // 5) Hard bundle size gate <= 704,000 B
  const finalBytes = Buffer.byteLength(cdp.buildInjectExpression(cdp.DEFAULT_CONFIG), 'utf8');
  assert.ok(finalBytes <= 704000, `Expected buildInjectExpression <= 704,000 B, got ${finalBytes} B`);
});

test('perf guard 22: home-ripple-host coalesces burst ResizeObserver ticks via rAF (canceling on park & unmount) & ui-runtime WeakMap caches icon target scans with full SVG/role/tooltip signature', () => {
  // 1) home-ripple-host ResizeObserver coalescing + park()/unmount() rAF cancellation
  const rippleHostSrc = fs.readFileSync(path.join(ROOT, 'home-ripple-host.js'), 'utf8');
  let roCb = null;
  let rafIdSeq = 0;
  const rafs = new Map();
  let fieldResizes = 0;
  const homeEl = {
    isConnected: true,
    clientWidth: 800,
    clientHeight: 500,
    children: [],
    appendChild(c) { c.parentElement = this; this.children.push(c); return c; },
    insertBefore(c) { c.parentElement = this; this.children.push(c); return c; },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: homeEl.clientWidth, height: homeEl.clientHeight }),
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  const makeEl = (tag) => ({
    tagName: String(tag).toUpperCase(),
    className: '',
    width: 0,
    height: 0,
    style: { setProperty() {} },
    children: [],
    setAttribute() {},
    getAttribute: () => null,
    hasAttribute: () => false,
    removeAttribute() {},
    appendChild(c) { c.parentElement = this; this.children.push(c); return c; },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); },
    remove() {},
    addEventListener() {},
    removeEventListener() {},
  });
  const doc = {
    hidden: false,
    documentElement: { getAttribute: () => 'ultra', hasAttribute: () => false },
    body: makeEl('body'),
    createElement: makeEl,
    querySelector: (s) => (s === '.agy-home' ? homeEl : null),
    querySelectorAll: () => [],
    addEventListener() {},
    removeEventListener() {},
  };
  const sb = {
    document: doc,
    window: { devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, getComputedStyle: () => ({ getPropertyValue: () => '' }) },
    performance: { now: () => 1000 },
    requestAnimationFrame: (fn) => { const id = ++rafIdSeq; rafs.set(id, fn); return id; },
    cancelAnimationFrame: (id) => { rafs.delete(id); },
    setTimeout,
    clearTimeout,
    ResizeObserver: class {
      constructor(cb) { roCb = cb; }
      observe() {}
      disconnect() {}
    },
    Map, Set, WeakMap, Math, Number, String, Boolean, Array, Object,
  };
  sb.globalThis = sb;
  vm.runInNewContext(rippleHostSrc, sb);

  const ctl = sb.__agPrismHomeRippleHost.createHomeRippleController({
    rippleCore: {
      RIPPLE: { cellWidth: 11, cellHeight: 17, gridMinCols: 8, gridMinRows: 6 },
      createWaveField: () => ({ advance() {}, step() {}, excite() {}, skimmer() {}, clear() {}, resize() {}, load: () => 0, maxAmp: () => 0, busy: () => false }),
      createGlyphField: () => { fieldResizes += 1; return { draw() {}, invalidate() {}, clear() {}, dispose() {}, busy: () => false }; },
      mountBrandHorizonGlow: () => ({ mode: '2d', resize() {}, draw() {}, drawStaticSnapshot() {}, invalidate() {}, clear() {}, dispose() {} }),
      resolveHorizonDpr: (d, s) => d * s,
    },
    isDestroyed: () => false,
    isAllowed: () => true,
    isDarkTheme: () => true,
    motionReduced: () => false,
    getMinFrameGapMs: () => 0,
    setAttrIfChanged() {},
  });

  ctl.sync();
  assert.equal(typeof roCb, 'function', 'home-ripple-host must register ResizeObserver');
  // Drain initial mount rAF
  for (const [id, fn] of Array.from(rafs.entries())) { rafs.delete(id); fn(1000); }
  const resizesBefore = fieldResizes;
  homeEl.clientWidth = 920;
  // Fire 5 burst ResizeObserver notifications within the same frame -> must coalesce to 1 resize on next rAF
  for (let i = 0; i < 5; i++) roCb([]);
  assert.equal(fieldResizes, resizesBefore, 'ResizeObserver burst must defer layout to rAF instead of synchronous layout storms');
  for (const [id, fn] of Array.from(rafs.entries())) { rafs.delete(id); fn(1016); }
  assert.equal(fieldResizes, resizesBefore + 1, '5 burst ResizeObserver callbacks must coalesce into exactly 1 field resize');

  // park() must cancel any pending ResizeObserver rAF cleanly
  homeEl.clientWidth = 980;
  roCb([]);
  assert.ok(rafs.size >= 1, 'ResizeObserver should enqueue rRaf before park()');
  ctl.park();
  assert.equal(rafs.size, 0, 'park() must cancel pending ResizeObserver rAF');

  // Re-sync and verify unmount() also cancels any pending ResizeObserver rAF cleanly
  ctl.sync();
  for (const [id, fn] of Array.from(rafs.entries())) { rafs.delete(id); fn(1032); }
  homeEl.clientWidth = 1040;
  roCb([]);
  ctl.unmount();
  assert.equal(rafs.size, 0, 'unmount() must cancel pending ResizeObserver rAF');

  // enterIdleSleep() via window blur must also cancel any pending ResizeObserver rAF cleanly (#193 P2-2)
  const winListeners = new Map();
  sb.window.addEventListener = (t, fn) => {
    if (!winListeners.has(t)) winListeners.set(t, []);
    winListeners.get(t).push(fn);
  };
  sb.window.removeEventListener = (t, fn) => {
    const a = winListeners.get(t);
    if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); }
  };
  ctl.sync();
  for (const [id, fn] of Array.from(rafs.entries())) { rafs.delete(id); fn(1048); }
  homeEl.clientWidth = 1100;
  roCb([]);
  assert.ok(rafs.size >= 1, 'ResizeObserver should enqueue rRaf before blur enterIdleSleep()');
  for (const fn of [...(winListeners.get('blur') || [])]) fn();
  assert.equal(rafs.size, 0, 'enterIdleSleep() must cancel pending ResizeObserver rAF');
  ctl.unmount();

  // 1b) #193 [P2-2]: ripple-core dirty check includes semMix convergence guard so 2D/still never short-circuits mid-fade
  const rippleCoreMod = require(path.join(ROOT, 'ripple-core.js'));
  let draws2d = 0;
  const mockCtx2d = {
    clearRect() {},
    save() {},
    restore() {},
    fillRect() { draws2d += 1; },
    createImageData(w, h) { return { data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: w, height: h }; },
    putImageData() { draws2d += 1; },
    createRadialGradient() { return { addColorStop() {} }; },
    createLinearGradient() { return { addColorStop() {} }; },
    setTransform() {},
  };
  const mockCanvas = {
    width: 320,
    height: 180,
    style: {},
    getContext: (t) => (t === '2d' ? mockCtx2d : null),
  };
  const glow = rippleCoreMod.mountBrandHorizonGlow(mockCanvas, { dark: true });
  assert.equal(glow.mode, '2d');
  // First draw enters awaiting-decision semantic (semMix advances from 0 -> 0.04, unconverged < 1)
  assert.equal(glow.draw(1000, { dark: true, semantic: 'awaiting-decision' }), true);
  // 5ms later (< 2D frameGap 14ms) with identical semanticCode, dirty MUST stay true because |1 - semMix| > 0.005
  assert.equal(
    glow.draw(1005, { dark: true, semantic: 'awaiting-decision' }),
    true,
    'unconverged semMix must keep dirty=true so semantic transition does not stall mid-fade'
  );
  // Static still draw snaps semMix to target 1; subsequent still draw with converged semMix returns false
  assert.equal(glow.draw(1020, { dark: true, semantic: 'awaiting-decision', still: true }), true);
  assert.equal(
    glow.draw(1025, { dark: true, semantic: 'awaiting-decision', still: true }),
    false,
    'converged semMix on still frame must skip redundant redraw'
  );
  assert.ok(draws2d >= 3);
  glow.dispose();

  // 2) ui-runtime iconSigMap WeakMap fast-path presence, thought-isolation ordering & full signature guard
  const uiSrc = fs.readFileSync(path.join(ROOT, 'ui-runtime.js'), 'utf8');
  const fnIdx = uiSrc.indexOf('function syncHostAnimatedIcons(');
  assert.ok(fnIdx > 0);
  const fnSlice = uiSrc.slice(fnIdx - 60, fnIdx + 1800);
  assert.ok(fnSlice.includes('const iconSigMap = new WeakMap();'), 'ui-runtime must hold WeakMap iconSigMap for syncHostAnimatedIcons');
  assert.ok(
    fnSlice.indexOf('if (isThoughtIsolatedNode(btn)) continue;') < fnSlice.indexOf('iconSigMap.get(btn)'),
    'isThoughtIsolatedNode(btn) must run before iconSigMap lookup so thought overlays are never cached as host targets'
  );
  assert.ok(fnSlice.includes("ga(btn, 'data-tooltip-id')"), 'bSig must include data-tooltip-id');
  assert.ok(fnSlice.includes("ga(btn, 'role')"), 'bSig must include role');
  assert.ok(fnSlice.includes('rawSvgCls'), 'bSig must include original <svg> className to prevent stale copy->check->copy hits');
});

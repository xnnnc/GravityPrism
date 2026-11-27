import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { assertCssHygiene, assertFileHygiene } from './helpers/mini-dom.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, '..');
const cdp = require(path.join(ROOT, 'cdp.js'));

function makeNode(tag, attrs = {}) {
  const attrMap = new Map(Object.entries(attrs));
  const children = [];
  const listeners = new Map();
  let offsetHeightReads = 0;
  const node = {
    nodeType: 1,
    tagName: String(tag || 'DIV').toUpperCase(),
    id: attrs.id || '',
    className: attrs.class || '',
    children,
    parentElement: null,
    parentNode: null,
    isConnected: true,
    style: {},
    classList: {
      contains: (c) => String(node.className || '').split(/\s+/).includes(c),
      add: (c) => {
        const s = new Set(String(node.className || '').split(/\s+/).filter(Boolean));
        s.add(c);
        node.className = Array.from(s).join(' ');
      },
      remove: (c) => {
        const s = new Set(String(node.className || '').split(/\s+/).filter(Boolean));
        s.delete(c);
        node.className = Array.from(s).join(' ');
      },
    },
    get offsetHeight() {
      offsetHeightReads += 1;
      return 31;
    },
    get _offsetHeightReads() {
      return offsetHeightReads;
    },
    get firstElementChild() { return children[0] || null; },
    get nextElementSibling() {
      if (!this.parentElement) return null;
      const idx = this.parentElement.children.indexOf(this);
      return idx >= 0 ? this.parentElement.children[idx + 1] || null : null;
    },
    appendChild(ch) {
      ch.parentElement = this;
      ch.parentNode = this;
      children.push(ch);
      return ch;
    },
    insertBefore(ch, ref) {
      ch.parentElement = this;
      ch.parentNode = this;
      const idx = ref ? children.indexOf(ref) : -1;
      if (idx >= 0) children.splice(idx, 0, ch);
      else children.push(ch);
      return ch;
    },
    remove() {
      if (!this.parentElement) return;
      const idx = this.parentElement.children.indexOf(this);
      if (idx >= 0) this.parentElement.children.splice(idx, 1);
      this.parentElement = null;
      this.parentNode = null;
    },
    getAttribute(k) { return attrMap.has(k) ? attrMap.get(k) : null; },
    setAttribute(k, v) { attrMap.set(k, String(v)); if (k === 'id') this.id = String(v); },
    hasAttribute(k) { return attrMap.has(k); },
    removeAttribute(k) { attrMap.delete(k); },
    addEventListener(t, fn) {
      if (!listeners.has(t)) listeners.set(t, []);
      listeners.get(t).push(fn);
    },
    removeEventListener(t, fn) {
      const a = listeners.get(t);
      if (!a) return;
      const i = a.indexOf(fn);
      if (i >= 0) a.splice(i, 1);
    },
    matches(sel) {
      return sel.split(',').some((raw) => {
        const s = raw.trim();
        if (!s) return false;
        const mEq = s.match(/^\[([^=\]]+)="([^"]*)"\]$/);
        if (mEq) return this.getAttribute(mEq[1]) === mEq[2];
        const mInc = s.match(/^\[([^=\]]+)\*="([^"]*)"\]$/);
        if (mInc) return String(this.getAttribute(mInc[1]) || '').includes(mInc[2]);
        const mHas = s.match(/^\[([^\]]+)\]$/);
        if (mHas) return this.hasAttribute(mHas[1]);
        if (s.startsWith('.')) return this.classList.contains(s.slice(1));
        if (s.startsWith('#')) return this.id === s.slice(1);
        return this.tagName === s.toUpperCase();
      });
    },
    closest(sel) {
      let cur = this;
      while (cur) {
        if (cur.matches && cur.matches(sel)) return cur;
        cur = cur.parentElement;
      }
      return null;
    },
    querySelectorAll(sel) {
      const out = [];
      const walk = (n) => {
        for (const ch of n.children || []) {
          if (ch.matches && ch.matches(sel)) out.push(ch);
          walk(ch);
        }
      };
      walk(this);
      return out;
    },
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
  };
  return node;
}

test('v2.36.0 Floating Composer compatibility, CSS hygiene, and clean teardown tokens', () => {
  const cssPath = path.join(ROOT, 'style.css');
  assertCssHygiene(cssPath);
  const css = fs.readFileSync(cssPath, 'utf8');
  assert.ok(
    css.includes('[data-ag-cs-floating-composer="1"],[data-testid*="floating-composer"],[data-floating-composer]'),
    'style.css must theme v2.36.0 floating composer using theme surface variables'
  );
  assert.ok(
    css.includes('.ag-cs-smooth-caret[data-ag-cs-caret-visible="1"][data-ag-cs-caret-typing="1"]{animation:none;opacity:1;transition-duration:18ms;}'),
    'smooth caret must use crisp 18ms transition while actively typing'
  );

  assert.ok(cdp.REMOVE_EXPRESSION.includes('data-ag-cs-stream-active'), 'REMOVE_EXPRESSION must clean data-ag-cs-stream-active');
  assert.ok(cdp.REMOVE_EXPRESSION.includes('data-ag-cs-floating-composer'), 'REMOVE_EXPRESSION must clean data-ag-cs-floating-composer');

  const uiSrc = fs.readFileSync(path.join(ROOT, 'ui-runtime.js'), 'utf8');
  assert.ok(uiSrc.includes('data-ag-cs-floating-composer'), 'ui-runtime must stamp data-ag-cs-floating-composer on floating/side-panel composers');
  assert.ok(uiSrc.includes('isFloatingCard'), 'ui-runtime must distinguish floating composers from primary conversation composers');
  assert.ok(uiSrc.includes('[data-lexical-editor="true"],[contenteditable="true"],textarea,input'), 'ui-runtime MutationObserver must skip editor typing mutations');

  const glyphSrc = fs.readFileSync(path.join(ROOT, 'model-glyph-crystal.js'), 'utf8');
  assert.ok(
    glyphSrc.includes('data-base-ui-tooltip-trigger'),
    'model-glyph-crystal must skip standalone v2.36.0 info/tooltip trigger buttons'
  );

  const pulseFbSrc = fs.readFileSync(path.join(ROOT, 'vendor/pulse-dashboard/inline-fallback.js'), 'utf8');
  assert.ok(pulseFbSrc.includes('data-ag-cs-floating-composer="1"'), 'pulse inline-fallback must exclude floating composer from anchor hijacking');
  assert.ok(pulseFbSrc.includes('[data-lexical-editor="true"],[contenteditable="true"]'), 'pulse inline-fallback must ignore editor typing mutations');

  const effortSrc = fs.readFileSync(path.join(ROOT, 'vendor/effort-slider/upstream-client.js'), 'utf8');
  assert.ok(effortSrc.includes('[data-lexical-editor="true"],[contenteditable="true"]'), 'effort-slider noiseSel must ignore editor typing mutations');
  assert.ok(effortSrc.includes('if (!doc.activeElement || doc.activeElement === doc.body) return;'), 'effort-slider onTrigLeave must fast-bail when no model trigger is focused');

  const omniSrc = fs.readFileSync(path.join(ROOT, 'vendor/omni-viewer/omni-client.js'), 'utf8');
  assert.ok(omniSrc.includes('cur.isContentEditable') && omniSrc.includes('floating-composer'), 'omni-client must ignore editor typing and floating composer mutations');
});

test('host-workbench-enhancer left sidebar hover triggers 0 pMo reflows and composer-only sync skips heavy scans', () => {
  const enhancerMod = require(path.join(ROOT, 'host-workbench-enhancer.js'));
  const doc = makeNode('HTML');
  const body = makeNode('BODY');
  doc.appendChild(body);
  doc.documentElement = doc;
  doc.body = body;
  doc.createElement = (tag) => makeNode(tag);

  const sb = makeNode('DIV', { 'data-testid': 'conversation-list-sidebar' });
  const list = makeNode('DIV');
  const rowWrap = makeNode('DIV', { 'data-index': '0' });
  const row = makeNode('DIV', { 'data-testid': 'conversation-row-sidebar' });
  const hoverBtn = makeNode('BUTTON', { 'aria-label': 'Archive' });
  row.appendChild(hoverBtn);
  rowWrap.appendChild(row);
  list.appendChild(rowWrap);
  sb.appendChild(list);
  body.appendChild(sb);

  const observers = [];
  let rafCount = 0;
  let inlineDiffSyncCalls = 0;

  class MockMO {
    constructor(cb) {
      this.cb = cb;
      this.observed = [];
      observers.push(this);
    }
    observe(target, opts) { this.observed.push({ target, opts }); }
    disconnect() { this.disconnected = true; }
  }

  const win = {
    document: doc,
    MutationObserver: MockMO,
    requestAnimationFrame(fn) {
      rafCount += 1;
      fn();
      return rafCount;
    },
    cancelAnimationFrame() {},
    addEventListener() {},
    removeEventListener() {},
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    __agPrismInlineDiff: {
      sync() { inlineDiffSyncCalls += 1; },
      unbindHooks() {},
    },
  };

  const ctl = enhancerMod.createHostEnhancerController({ doc, win });
  try {
    // Full sync attaches pMo to sidebar list without forcing offsetHeight reflows when pinned/hidden are empty
    ctl.sync({ s: true });
    assert.equal(rowWrap._offsetHeightReads, 0, 'applyProjLayout must fast-bail with 0 offsetHeight reads when no projects are pinned/hidden');
    assert.equal(observers.length >= 1, true, 'pMo must attach to sidebar list');

    const pMo = observers[observers.length - 1];
    const rafBeforeHover = rafCount;

    // Simulate rapid hover mutations inside a sidebar chat row (action button mount + inline style toggle)
    pMo.cb([
      { type: 'childList', target: row },
      { type: 'attributes', target: hoverBtn, attributeName: 'style' },
    ]);
    assert.equal(rafCount, rafBeforeHover, 'Hover mutations inside conversation-row-sidebar must NOT schedule sidebar project layout sync');

    // Simulate genuine virtualizer scroll style update on direct row wrapper -> MUST schedule sync
    pMo.cb([{ type: 'attributes', target: rowWrap, attributeName: 'style' }]);
    assert.equal(rafCount, rafBeforeHover + 1, 'Virtualizer wrapper style mutation must still schedule sidebar project sync');

    // Composer-only dirty flag { c: true } must NOT trigger inlineDiff.sync()
    const diffBefore = inlineDiffSyncCalls;
    ctl.sync({ c: true });
    assert.equal(inlineDiffSyncCalls, diffBefore, 'Composer-only sync({ c: true }) must skip inlineDiff.sync()');
  } finally {
    ctl.destroy();
  }
});

test('stream-choreography toggles data-ag-cs-stream-active on documentElement and smooth-caret exposes isQueued()', () => {
  const streamMod = require(path.join(ROOT, 'stream-choreography.js'));
  const caretMod = require(path.join(ROOT, 'smooth-caret.js'));

  const rootEl = makeNode('HTML');
  const body = makeNode('BODY');
  const doc = {
    documentElement: rootEl,
    body,
    querySelectorAll: () => [],
    querySelector: () => null,
  };
  const prevDoc = globalThis.document;
  globalThis.document = doc;
  try {
    let running = true;
    const ctl = streamMod.createStreamChoreographyController({
      isDestroyed: () => false,
      isMotionStandardOrUltra: () => false,
      isMotionUltra: () => false,
      isConvRunning: () => running,
      setAttrIfChanged: (el, k, v) => {
        if (el.getAttribute(k) !== String(v)) el.setAttribute(k, String(v));
      },
      runGuardedMut: (fn) => fn(),
    });

    ctl.syncDualStreamEngine();
    assert.equal(rootEl.getAttribute('data-ag-cs-stream-active'), '1', 'data-ag-cs-stream-active must be set while conversation is running');

    running = false;
    ctl.syncDualStreamEngine();
    assert.equal(rootEl.hasAttribute('data-ag-cs-stream-active'), false, 'data-ag-cs-stream-active must be cleared once conversation stops');

    running = true;
    ctl.syncDualStreamEngine();
    assert.equal(rootEl.getAttribute('data-ag-cs-stream-active'), '1');
    ctl.disconnectStreamObserver();
    assert.equal(rootEl.hasAttribute('data-ag-cs-stream-active'), false, 'disconnectStreamObserver must clear data-ag-cs-stream-active');
  } finally {
    globalThis.document = prevDoc;
  }

  const caretCtl = caretMod.createSmoothCaretController({
    docOf: () => doc,
    isEnabled: () => false,
    isDestroyed: () => false,
    runGuardedMut: (fn) => fn(),
  });
  assert.equal(typeof caretCtl.isQueued, 'function', 'smooth-caret controller must expose isQueued()');
  assert.equal(caretCtl.isQueued(), false);
});

test('Channel 1 bundle remains < 580,000 B across all 9 languages and parses cleanly', () => {
  assertFileHygiene([
    path.join(ROOT, 'ui-runtime.js'),
    path.join(ROOT, 'host-workbench-enhancer.js'),
    path.join(ROOT, 'stream-choreography.js'),
    path.join(ROOT, 'smooth-caret.js'),
    path.join(ROOT, 'prism-rim-canvas.js'),
    path.join(ROOT, 'motion-engine.js'),
    path.join(ROOT, 'model-glyph-crystal.js'),
    path.join(ROOT, 'test/floating-composer-and-perf.test.mjs'),
  ]);

  for (const lang of ['auto', 'zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'es', 'fr', 'de']) {
    const expr = cdp.buildInjectExpression({ ...cdp.DEFAULT_CONFIG, language: lang }, { bundleCachePath: '' });
    const bytes = Buffer.byteLength(expr, 'utf8');
    assert.ok(bytes < 580000, `Channel 1 (${lang}) must stay < 580,000 B, got ${bytes}`);
    if (lang === 'auto') assert.doesNotThrow(() => new vm.Script(expr));
  }
});

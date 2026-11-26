import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const cdp = require(path.join(ROOT, 'cdp.js'));

function createMiniDom({ hasLayout = false, hooks = null } = {}) {
  const makeEl = (tag, opts = {}) => {
    const attrs = new Map(Object.entries(opts.attrs || {}));
    if (opts.id) attrs.set('id', opts.id);
    if (opts.className) attrs.set('class', opts.className);
    const styles = new Map();
    const children = [];
    const node = {
      nodeType: 1,
      tagName: tag.toUpperCase(),
      parentElement: null,
      children,
      childNodes: children,
      _text: opts.text || '',
      _rect: opts.rect || null,
      _offsetHeight: opts.offsetHeight,
      _checkVis: opts.checkVisibility,
      _csDisplay: opts.csDisplay,
      _csVisibility: opts.csVisibility,
      _csPosition: opts.csPosition,
      get id() { return attrs.get('id') || ''; },
      set id(v) { attrs.set('id', String(v)); },
      get className() { return attrs.get('class') || ''; },
      set className(v) { attrs.set('class', String(v)); },
      get hidden() { return attrs.has('hidden'); },
      set hidden(v) { if (v) attrs.set('hidden', ''); else attrs.delete('hidden'); },
      get childElementCount() { return children.length; },
      get firstElementChild() { return children[0] || null; },
      get offsetHeight() {
        hooks?.onRead?.('offsetHeight', this);
        if (typeof this._offsetHeight === 'number') return this._offsetHeight;
        if (this._rect) return this._rect.height;
        return hasLayout ? 40 : 0;
      },
      get textContent() {
        return this._text + children.map((c) => c.textContent).join('');
      },
      set textContent(v) {
        this._text = String(v);
        children.length = 0;
      },
      get isConnected() {
        let cur = this;
        while (cur) {
          if (cur === html) return true;
          cur = cur.parentElement;
        }
        return false;
      },
      classList: {
        contains: (c) => (attrs.get('class') || '').split(/\s+/).filter(Boolean).includes(c),
        add: (...cs) => {
          const set = new Set((attrs.get('class') || '').split(/\s+/).filter(Boolean));
          cs.forEach((c) => set.add(c));
          attrs.set('class', [...set].join(' '));
        },
        remove: (...cs) => {
          const set = new Set((attrs.get('class') || '').split(/\s+/).filter(Boolean));
          cs.forEach((c) => set.delete(c));
          attrs.set('class', [...set].join(' '));
        },
      },
      style: {
        get display() { return styles.get('display') || ''; },
        set display(v) { if (v) styles.set('display', String(v)); else styles.delete('display'); },
        get visibility() { return styles.get('visibility') || ''; },
        set visibility(v) { if (v) styles.set('visibility', String(v)); else styles.delete('visibility'); },
        get position() { return styles.get('position') || ''; },
        set position(v) { if (v) styles.set('position', String(v)); else styles.delete('position'); },
        setProperty(k, v) {
          hooks?.onWrite?.('style.setProperty', node, String(k));
          styles.set(String(k), String(v));
        },
        getPropertyValue(k) { return styles.get(String(k)) || ''; },
        removeProperty(k) {
          hooks?.onWrite?.('style.removeProperty', node, String(k));
          styles.delete(String(k));
        },
      },
      getBoundingClientRect() {
        hooks?.onRead?.('getBoundingClientRect', this);
        if (this._rect) return { left: 0, top: 0, width: 320, height: 40, ...this._rect };
        if (hasLayout) return { left: 0, top: 0, width: 320, height: 40, right: 320, bottom: 40 };
        return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 };
      },
      checkVisibility() {
        hooks?.onRead?.('checkVisibility', this);
        if (typeof this._checkVis === 'function') return this._checkVis();
        if (typeof this._checkVis === 'boolean') return this._checkVis;
        return !this.hidden && styles.get('display') !== 'none' && styles.get('visibility') !== 'hidden';
      },
      getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
      setAttribute: (k, v) => {
        hooks?.onWrite?.('setAttribute', node, String(k));
        attrs.set(k, String(v));
      },
      hasAttribute: (k) => attrs.has(k),
      removeAttribute: (k) => {
        hooks?.onWrite?.('removeAttribute', node, String(k));
        attrs.delete(k);
      },
      appendChild(child) {
        if (child.parentElement) child.remove();
        child.parentElement = this;
        children.push(child);
        return child;
      },
      insertBefore(child, ref) {
        if (child.parentElement) child.remove();
        child.parentElement = this;
        const idx = children.indexOf(ref);
        if (idx >= 0) children.splice(idx, 0, child);
        else children.push(child);
        return child;
      },
      remove() {
        if (!this.parentElement) return;
        const arr = this.parentElement.children;
        const idx = arr.indexOf(this);
        if (idx >= 0) arr.splice(idx, 1);
        this.parentElement = null;
      },
      matches(sel) {
        return String(sel).split(',').map((s) => s.trim()).filter(Boolean).some((s) => {
          const parts = s.trim().split(/\s+/);
          const leaf = parts[parts.length - 1];
          if (leaf.startsWith('#')) return this.id === leaf.slice(1).replace(/\\/g, '');
          if (leaf.startsWith('.')) return this.classList.contains(leaf.slice(1));
          const am = leaf.match(/^([a-zA-Z0-9_-]*)\[([^=\]]+)(?:="([^"]*)")?\]$/);
          if (am) {
            if (am[1] && this.tagName !== am[1].toUpperCase()) return false;
            if (am[3] !== undefined) return this.getAttribute(am[2]) === am[3];
            return this.hasAttribute(am[2]);
          }
          return this.tagName === leaf.toUpperCase();
        });
      },
      closest(sel) {
        let cur = this;
        while (cur) {
          if (cur.matches(sel)) return cur;
          cur = cur.parentElement;
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
      querySelector(sel) {
        return this.querySelectorAll(sel)[0] || null;
      },
      addEventListener() {},
      removeEventListener() {},
    };
    return node;
  };

  const html = makeEl('html');
  const head = makeEl('head');
  const body = makeEl('body', { className: 'theme-dark' });
  html.appendChild(head);
  html.appendChild(body);

  const observers = [];
  const rafQueue = [];
  const timers = new Set();

  const doc = {
    documentElement: html,
    head,
    body,
    hidden: false,
    readyState: 'complete',
    createElement: (t) => makeEl(t),
    getElementById: (id) => {
      const find = (n) => (n.id === id ? n : n.children.map(find).find(Boolean) || null);
      return find(html);
    },
    querySelector: (s) => html.querySelector(s),
    querySelectorAll: (s) => html.querySelectorAll(s),
    addEventListener() {},
    removeEventListener() {},
  };

  const sandbox = {
    window: null,
    globalThis: null,
    document: doc,
    navigator: { language: 'zh-CN' },
    location: { pathname: '/' },
    localStorage: {
      _m: {},
      getItem(k) { return this._m[k] || null; },
      setItem(k, v) { this._m[k] = String(v); },
      removeItem(k) { delete this._m[k]; },
    },
    getComputedStyle: (el) => {
      hooks?.onRead?.('getComputedStyle', el);
      return {
        display: el?._csDisplay !== undefined ? el._csDisplay : (el?.style?.display || ''),
        visibility: el?._csVisibility !== undefined ? el._csVisibility : (el?.style?.visibility || ''),
        position: el?._csPosition !== undefined ? el._csPosition : (el?.style?.position || ''),
        getPropertyValue: (k) => el?.style?.getPropertyValue?.(k) || '',
      };
    },
    matchMedia: () => ({ matches: false }),
    MutationObserver: class {
      constructor(cb) { this.cb = cb; this.opts = null; observers.push(this); }
      observe(_t, opts) { this.opts = opts; }
      disconnect() {}
      takeRecords() { return []; }
    },
    ResizeObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame: (fn) => { rafQueue.push(fn); return rafQueue.length; },
    cancelAnimationFrame: () => {},
    setTimeout: (fn, ms) => { const id = setTimeout(fn, ms); timers.add(id); return id; },
    clearTimeout: (id) => { timers.delete(id); clearTimeout(id); },
    setInterval: () => 1,
    clearInterval: () => {},
    performance: { now: () => Date.now() },
    Math, Date, JSON, Map, Set, Array, Object, String, Number, Boolean, Promise, Uint8Array, Float32Array, Intl,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  const flushRaf = () => {
    while (rafQueue.length) {
      const fn = rafQueue.shift();
      fn(Date.now());
    }
  };
  const cleanupTimers = () => {
    for (const id of timers) clearTimeout(id);
    timers.clear();
  };

  return { makeEl, html, head, body, doc, sandbox, observers, flushRaf, cleanupTimers };
}

test('Task 1: syncCrabClearance ignores hidden/collapsed/zero-height/decor beforeShell nodes and keeps ask_question takeover card raised & unoccluded', () => {
  const { makeEl, html, body, sandbox, observers, flushRaf, cleanupTimers } = createMiniDom({ hasLayout: true });

  const convView = makeEl('div', { attrs: { 'data-testid': 'conversation-view' } });
  const rtcWrap = makeEl('div', { className: 'relative z-10 flex flex-col gap-1 min-h-0' });
  const takeoverWrap = makeEl('div', { className: 'relative z-[1] mb-1 flex flex-col min-h-0' });
  const takeoverCard = makeEl('div', { className: 'agy-takeover-frame', attrs: { 'data-testid': 'interaction-takeover-card' } });
  takeoverWrap.appendChild(takeoverCard);

  const contentsWrap = makeEl('div', { className: 'contents' });
  const inputBox = makeEl('div', { attrs: { 'data-testid': 'agent-input-box' } });

  // Various false-positive lower clearance nodes before composerShell
  const emptyShellWrap = makeEl('div', { className: 'flex flex-col' });
  emptyShellWrap.appendChild(makeEl('div', { rect: { height: 0, width: 320 } }));

  const hiddenWrap = makeEl('div');
  const hiddenChild = makeEl('div', { text: 'stale hidden banner' });
  hiddenChild.hidden = true;
  hiddenWrap.appendChild(hiddenChild);

  const ariaHiddenWrap = makeEl('div', { attrs: { 'aria-hidden': 'true' }, text: 'sr status' });
  const dispNoneWrap = makeEl('div', { text: 'display none' });
  dispNoneWrap.style.display = 'none';

  const collapsedWrap = makeEl('div', { className: 'grid grid-rows-[0fr]' });
  collapsedWrap.appendChild(makeEl('div', { text: 'collapsed drawer text' }));

  const prismDecorWrap = makeEl('div', { className: 'ag-cs-prism-rim-cv', text: 'decor' });
  const zeroHeightWrap = makeEl('div', { text: 'zero height css box', rect: { height: 0, width: 320 }, offsetHeight: 0 });

  const composerShell = makeEl('div', { id: 'antigravity.agentSidePanelInputBox', className: 'surface-composer' });
  const card = makeEl('div', { className: 'surface-composer-card', rect: { height: 96, width: 640 }, offsetHeight: 96 });
  card.appendChild(makeEl('div', { className: 'agy-composer-footer' }));
  composerShell.appendChild(card);

  for (const n of [emptyShellWrap, hiddenWrap, ariaHiddenWrap, dispNoneWrap, collapsedWrap, prismDecorWrap, zeroHeightWrap, composerShell]) {
    inputBox.appendChild(n);
  }
  contentsWrap.appendChild(inputBox);
  rtcWrap.appendChild(takeoverWrap);
  rtcWrap.appendChild(contentsWrap);
  convView.appendChild(rtcWrap);

  // Also mount a subagent tab with its own composer & takeover card (must never steal or clear primary takeover)
  const subTab = makeEl('div', { attrs: { 'data-testid': 'subagent-tab-conversation' } });
  const subTakeover = makeEl('div', { attrs: { 'data-testid': 'interaction-takeover-card' } });
  const subInputBox = makeEl('div', { attrs: { 'data-testid': 'agent-input-box' } });
  const subCard = makeEl('div', { className: 'surface-composer-card', rect: { height: 80, width: 400 }, offsetHeight: 80 });
  subInputBox.appendChild(subCard);
  subTab.appendChild(subTakeover);
  subTab.appendChild(subInputBox);
  body.appendChild(convView);
  body.appendChild(subTab);

  try {
    const res = vm.runInNewContext(cdp.buildInjectExpression(cdp.DEFAULT_CONFIG), sandbox);
    assert.equal(res.status, 'ok');

    // None of the hidden/empty/collapsed/zero-height/decor nodes may steal data-ag-cs-queued
    for (const fake of [emptyShellWrap, hiddenWrap, ariaHiddenWrap, dispNoneWrap, collapsedWrap, prismDecorWrap, zeroHeightWrap]) {
      assert.equal(fake.hasAttribute('data-ag-cs-queued'), false, 'Non-visible/decor beforeShell node must not steal lower clearance');
    }

    // Primary takeover card wrapper gets clearance and html marks takeover-open so mascot yields z-index & pointer-events
    assert.equal(takeoverWrap.getAttribute('data-ag-cs-takeover'), '1');
    assert.equal(takeoverWrap.style.getPropertyValue('margin-bottom'), '46px');
    assert.equal(html.getAttribute('data-ag-cs-takeover-open'), '1');

    // Subagent tab takeover card stays completely untouched
    assert.equal(subTakeover.hasAttribute('data-ag-cs-takeover'), false);

    // Chat mode cleanly strips both data-ag-cs-takeover and html[data-ag-cs-takeover-open]
    const mainMo = observers.find((o) => Array.isArray(o.opts?.attributeFilter) && o.opts.attributeFilter.includes('data-ag-prism-mode'));
    assert.ok(mainMo, 'Main MutationObserver must be registered');
    html.setAttribute('data-ag-prism-mode', 'chat');
    mainMo.cb([{ type: 'attributes', target: html, attributeName: 'data-ag-prism-mode' }]);
    flushRaf();
    assert.equal(takeoverWrap.hasAttribute('data-ag-cs-takeover'), false);
    assert.equal(html.hasAttribute('data-ag-cs-takeover-open'), false);

    // Returning to code mode restores clearance & takeover-open
    html.setAttribute('data-ag-prism-mode', 'code');
    mainMo.cb([{ type: 'attributes', target: html, attributeName: 'data-ag-prism-mode' }]);
    flushRaf();
    assert.equal(takeoverWrap.getAttribute('data-ag-cs-takeover'), '1');
    assert.equal(html.getAttribute('data-ag-cs-takeover-open'), '1');

    // Hiding takeoverCard via class="hidden" triggers MO attribute sync and clears takeover-open cleanly
    takeoverCard.classList.add('hidden');
    mainMo.cb([{ type: 'attributes', target: takeoverCard, attributeName: 'class' }]);
    flushRaf();
    assert.equal(takeoverWrap.hasAttribute('data-ag-cs-takeover'), false);
    assert.equal(html.hasAttribute('data-ag-cs-takeover-open'), false);

    // Unhiding restores it
    takeoverCard.classList.remove('hidden');
    mainMo.cb([{ type: 'attributes', target: takeoverCard, attributeName: 'class' }]);
    flushRaf();
    assert.equal(takeoverWrap.getAttribute('data-ag-cs-takeover'), '1');
    assert.equal(html.getAttribute('data-ag-cs-takeover-open'), '1');

    // REMOVE_EXPRESSION strips takeover attributes cleanly
    vm.runInNewContext(cdp.REMOVE_EXPRESSION, sandbox);
    assert.equal(takeoverWrap.hasAttribute('data-ag-cs-takeover'), false);
    assert.equal(takeoverWrap.style.getPropertyValue('margin-bottom'), '');
    assert.equal(html.hasAttribute('data-ag-cs-takeover-open'), false);
  } finally {
    cleanupTimers();
  }
});

test('Task 1 fallback: v2.34 non-sibling interaction-takeover-card inside outer flex-col gets direct 52px clearance on delayed mount (layout-less fake DOM)', () => {
  const { makeEl, html, body, sandbox, observers, flushRaf, cleanupTimers } = createMiniDom({ hasLayout: false });

  const convView = makeEl('div', { attrs: { 'data-testid': 'conversation-view' } });
  // v2.34 layout where interaction-takeover-card sits in an outer flex-col, NOT a direct sibling of inputBox's wrapper
  const outerCol = makeEl('div', { className: 'flex flex-col w-full gap-2 min-h-0' });
  const inputOuter = makeEl('div', { className: 'w-full' }); // NOT .contents!
  const inputBox = makeEl('div', { attrs: { 'data-testid': 'agent-input-box' } });
  const composerShell = makeEl('div', { id: 'antigravity.agentSidePanelInputBox', className: 'surface-composer' });
  const card = makeEl('div', { className: 'surface-composer-card' });
  card.appendChild(makeEl('div', { className: 'agy-composer-footer' }));
  composerShell.appendChild(card);
  inputBox.appendChild(composerShell);
  inputOuter.appendChild(inputBox);
  outerCol.appendChild(inputOuter);
  convView.appendChild(outerCol);
  body.appendChild(convView);

  try {
    const res = vm.runInNewContext(cdp.buildInjectExpression(cdp.DEFAULT_CONFIG), sandbox);
    assert.equal(res.status, 'ok');
    assert.equal(html.hasAttribute('data-ag-cs-takeover-open'), false);

    // Delayed mount of interaction-takeover-card directly inside outerCol (shared with inputOuter, so target is card itself -> 52px!)
    const mainMo = observers.find((o) => Array.isArray(o.opts?.attributeFilter) && o.opts.attributeFilter.includes('data-cascade-id'));
    assert.ok(mainMo);
    const directTakeover = makeEl('div', { className: 'agy-takeover-frame', attrs: { 'data-testid': 'interaction-takeover-card' } });
    outerCol.insertBefore(directTakeover, inputOuter);
    mainMo.cb([{ type: 'childList', target: outerCol, addedNodes: [directTakeover], removedNodes: [] }]);
    flushRaf();

    assert.equal(directTakeover.getAttribute('data-ag-cs-takeover'), '1');
    assert.equal(directTakeover.style.getPropertyValue('margin-bottom'), '52px');
    assert.equal(outerCol.hasAttribute('data-ag-cs-takeover'), false, 'Shared parent containing agent-input-box must NEVER receive takeover clearance');
    assert.equal(html.getAttribute('data-ag-cs-takeover-open'), '1');

    // Removing the card clears html[data-ag-cs-takeover-open]
    directTakeover.remove();
    mainMo.cb([{ type: 'childList', target: outerCol, addedNodes: [], removedNodes: [directTakeover] }]);
    flushRaf();
    assert.equal(html.hasAttribute('data-ag-cs-takeover-open'), false);
  } finally {
    cleanupTimers();
  }
});

test('Task 2, 3, 4 & Invariants: Q&A selected contrast (.bg-secondary.border-border), subagent-only spinner dash, orbital dead-CSS cleanup, flattener & < 685KB budget', () => {
  const cssPath = path.join(ROOT, 'style.css');
  const uiPath = path.join(ROOT, 'ui-runtime.js');
  const cssBuf = fs.readFileSync(cssPath);
  const uiBuf = fs.readFileSync(uiPath);
  const css = cssBuf.toString('utf8');
  const ui = uiBuf.toString('utf8');

  // ── Global invariants ────────────────────────────────────────────────
  assert.equal((css.match(/:has\(/g) || []).length, 0, 'style.css must have zero :has() selectors');
  assert.equal([...css].filter((ch) => ch.charCodeAt(0) > 127).length, 0, 'style.css must be pure ASCII');
  let depth = 0;
  for (const ch of css) {
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      assert.ok(depth >= 0, 'style.css braces must never underflow');
    }
  }
  assert.equal(depth, 0, 'style.css braces must be completely balanced');
  assert.equal(cssBuf.includes(13), false, 'style.css must be pure LF');
  assert.equal(uiBuf.includes(13), false, 'ui-runtime.js must be pure LF');
  assert.equal(cssBuf[0] === 0xef && cssBuf[1] === 0xbb && cssBuf[2] === 0xbf, false, 'style.css must have no UTF-8 BOM');
  assert.equal(uiBuf[0] === 0xef && uiBuf[1] === 0xbb && uiBuf[2] === 0xbf, false, 'ui-runtime.js must have no UTF-8 BOM');

  const channel1 = cdp.buildInjectExpression(cdp.DEFAULT_CONFIG);
  const channel1Bytes = Buffer.byteLength(channel1, 'utf8');
  assert.ok(channel1Bytes < 685000, `Channel 1 bundle (${channel1Bytes} B) must stay strictly < 685,000 B`);

  // ── Task 1 CSS stacking & clearance contracts ────────────────────────
  assert.ok(
    /html\[data-ag-cs-takeover-open="1"\]\s+\.ag-cs-crab\{z-index:[1-8]\s*!important;/.test(css) &&
      css.includes('pointer-events:none !important;'),
    'Active takeover must drop mascot stage z-index <= 8 (< interaction-takeover-card z-index 12) and neutralize pointer-events'
  );
  assert.equal(
    css.includes('[data-ag-cs-takeover="1"]){padding-bottom:14px !important;}'),
    false,
    'Takeover rule must not set conflicting padding-bottom:14px overridden by padding:0'
  );
  assert.equal(
    css.includes('& [data-ag-cs-takeover="1"] [data-testid="interaction-takeover-card"]{margin-bottom:6px !important;}'),
    false,
    'Takeover rule must not rely on collapsible child margin-bottom:6px inside non-flex block wrappers'
  );
  assert.ok(
    css.includes('& [data-ag-cs-takeover="1"]{margin-bottom:52px !important;position:relative !important;z-index:12 !important;&:not([data-testid="interaction-takeover-card"]):not([data-testid="side-question-panel"]){padding-bottom:6px !important;}}'),
    'Takeover rule must guarantee 52px net bottom clearance without margin collapsing in both wrapper and direct modes'
  );
  assert.ok(
    cdp.REMOVE_EXPRESSION.includes("'data-ag-cs-takeover-open'"),
    'cdp.js REMOVE_EXPRESSION must strip data-ag-cs-takeover-open as fallback even if destroy() is skipped'
  );

  // ── Task 2: Q&A option selected state contrast (dark + light + write-in) ──
  const qaLines = css.split('\n').filter((l) => l.includes('[data-testid="ask-question-option"]'));
  assert.equal(qaLines.length, 2, 'style.css must have exactly 2 ask-question-option rules (dark base + light override)');
  const [darkQa, lightQa] = qaLines;
  assert.equal(css.includes('.agy-takeover-card [data-testid="ask-question-option"]'), false, 'Must preserve .agy-takeover-card liner contract');
  assert.ok(darkQa.includes('label[for$="-__write_in__"]'), 'Dark Q&A rule must style write-in label selection as well');
  assert.ok(lightQa.includes('label[for$="-__write_in__"]'), 'Light Q&A rule must override write-in label tokens as well');
  assert.ok(
    darkQa.includes('&:is(.bg-secondary.border-border,[aria-selected="true"],[aria-checked="true"],[data-selected="true"],[data-pressed])'),
    'Selected Q&A selector must match Antigravity v2.34 .bg-secondary.border-border along with ARIA/data attributes'
  );
  assert.ok(darkQa.includes('width:2.5px'), 'Selected Q&A option must render a prominent 2.5px glowing left indicator bar');
  assert.ok(darkQa.includes('[data-testid$="-shortcut-badge"]'), 'Q&A rule must highlight shortcut badge on selected options');
  assert.ok(darkQa.includes('[data-testid$="-option-text"]'), 'Q&A rule must brighten selected option text vs dimmed unselected text');
  assert.equal(
    /(sk-[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/.test(css),
    false,
    'style.css must never trip CI secret hygiene regex (e.g. ask-question-option-text matching sk- + 20 chars)'
  );
  assert.ok(
    darkQa.includes('&:hover:where(:not(.cursor-not-allowed))'),
    'Q&A hover rule must exclude disabled .cursor-not-allowed options without raising specificity above ARIA selected states'
  );
  assert.ok(
    css.includes('& [data-testid="ask-question-writein"]{background-color:transparent !important;border:0 !important;box-shadow:none !important;color:var(--foreground) !important;outline:none !important;}'),
    'ask-question-writein textarea must remain transparent and borderless inside the selected write-in option capsule'
  );
  assert.ok(
    darkQa.includes('var(--primary,#669DF6)') && lightQa.includes('var(--primary,#2563EB)'),
    'Q&A selected tokens must adapt to accent / --primary in dark & light themes'
  );

  // ── Task 3: Subagent-only running spinner dash (primary stays 4x4 dot) ──
  const baseSpinnerLine = css.split('\n').find((l) => l.startsWith('html[data-ag-cs-style] [data-testid="status-loading-spinner"]{')) || '';
  assert.ok(
    baseSpinnerLine.includes('width:4px !important;height:4px !important;min-width:4px !important;min-height:4px !important;margin:0 !important;border-radius:999px !important;'),
    'Primary status-loading-spinner must keep its 4px x 4px glowing center dot untouched'
  );
  const subSpinnerLine =
    css.split('\n').find((l) => l.includes('[data-testid="subagent-node"]') && l.includes('[data-agent-state-dot]:first-child')) || '';
  assert.ok(subSpinnerLine, 'Must define dedicated subagent-only spinner core dash rule');
  assert.ok(
    subSpinnerLine.includes('[data-testid="subagent-node"]') &&
      subSpinnerLine.includes('[data-testid="running-row"]') &&
      subSpinnerLine.includes('[data-testid="background-task-row"]') &&
      subSpinnerLine.includes('[data-ag-sub-running="1"]'),
    'Subagent spinner dash rule must match subagent-node, running-row, background-task-row, and data-ag-sub-running="1"'
  );
  assert.ok(
    subSpinnerLine.includes('width:7px !important;height:2px !important;min-width:7px !important;min-height:2px !important;border-radius:999px !important;'),
    'Subagent spinner core must be a crisp centered 7px x 2px pill dash'
  );
  assert.equal(
    subSpinnerLine.includes('conversation-row-sidebar') || subSpinnerLine.includes('data-ag-cs-row-running'),
    false,
    'Subagent spinner dash rule must NEVER target primary conversation-row-sidebar rows'
  );

  // ── Task 4: Home Studio orbital dead CSS cleanup ─────────────────────
  for (const dead of ['.ag-cs-orbital-backdrop', '.ag-cs-orbit-arc', '.ag-cs-orbit-reticle', '.ag-cs-orbit-node']) {
    assert.equal(css.includes(dead), false, `Dead Home Studio orbital CSS selector ${dead} must be purged`);
  }
  assert.ok(
    css.includes('html[data-ag-cs-style][data-ag-cs-accent="mono"] :is(.ag-cs-settings-brand-svg,.ag-cs-settings-brand-mark svg){filter:grayscale(1);}'),
    'Mono accent grayscale rule for .ag-cs-settings-brand-svg and .ag-cs-settings-brand-mark svg must be preserved'
  );
  assert.ok(css.includes('.ag-cs-glyph-orbit') && css.includes('ag-cs-orbit-spin'), 'Active glyph/spinner orbit styles must remain intact');

  // ── Verify flattenMainStyleSheet expands both Task 2 and Task 3 rules cleanly ──
  const fnMatch = ui.match(/function flattenMainStyleSheet\(\)[\s\S]*?\n  \}/);
  assert.ok(fnMatch, 'flattenMainStyleSheet must exist in ui-runtime.js');
  const styleEl = {
    textContent: '',
    attrs: new Map([['data-ag-cs-css-hash', 'qa-test']]),
    getAttribute(k) { return this.attrs.get(k) || null; },
    setAttribute(k, v) { this.attrs.set(k, String(v)); },
    sheet: {
      cssRules: [
        {
          type: 1,
          selectorText: 'html[data-ag-cs-style]',
          style: { cssText: '' },
          cssRules: [
            {
              type: 1,
              selectorText: '& :is([data-testid="ask-question-option"],label[for$="-__write_in__"])',
              style: { cssText: 'position:relative;' },
              cssRules: [
                {
                  type: 1,
                  selectorText: '&:is(.bg-secondary.border-border,[aria-selected="true"])',
                  style: { cssText: 'background:var(--_q5) !important;' },
                  cssRules: [
                    {
                      type: 1,
                      selectorText: '& [data-testid$="-shortcut-badge"]',
                      style: { cssText: 'background:var(--_q0) !important;' },
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: 1,
          selectorText: 'html[data-ag-cs-style] :is([data-testid="subagent-node"],[data-ag-sub-running="1"]) [data-testid="status-loading-spinner"] [data-agent-state-dot]:first-child',
          style: { cssText: 'width:7px !important;height:2px !important;' },
        },
      ],
    },
  };
  const sb = {
    CODE_HASH: 'qa-test',
    runGuardedMut: (fn) => fn(),
    document: { getElementById: (id) => (id === 'ag-prism-css' ? styleEl : null) },
  };
  vm.runInNewContext(`${fnMatch[0]}; flattenMainStyleSheet();`, sb);
  assert.ok(
    styleEl.textContent.includes('html[data-ag-cs-style] [data-testid="ask-question-option"].bg-secondary.border-border,') &&
      styleEl.textContent.includes('{background:var(--_q5) !important;}'),
    'Flattener must expand Q&A .bg-secondary.border-border selected rule'
  );
  assert.ok(
    styleEl.textContent.includes('html[data-ag-cs-style] label[for$="-__write_in__"].bg-secondary.border-border [data-testid$="-shortcut-badge"],') &&
      styleEl.textContent.includes('{background:var(--_q0) !important;}'),
    'Flattener must expand write-in selected shortcut badge rule'
  );
  assert.ok(
    styleEl.textContent.includes('html[data-ag-cs-style] [data-testid="subagent-node"] [data-testid="status-loading-spinner"] [data-agent-state-dot]:first-child,') &&
      styleEl.textContent.includes('html[data-ag-cs-style] [data-ag-sub-running="1"] [data-testid="status-loading-spinner"] [data-agent-state-dot]:first-child{width:7px !important;height:2px !important;}'),
    'Flattener must expand subagent-only spinner dash rule cleanly'
  );
});

test('Red-Team P0 #1A: display:contents wrappers (0x0 rect & checkVisibility=false) never break takeover or beforeShell queued clearance', () => {
  const { makeEl, html, body, sandbox, observers, flushRaf, cleanupTimers } = createMiniDom({ hasLayout: true });

  const convView = makeEl('div', { attrs: { 'data-testid': 'conversation-view' } });
  const rtcWrap = makeEl('div', { className: 'relative z-10 flex flex-col gap-1 min-h-0' });

  // Takeover card wrapped by a CSS display:contents intermediate node (0x0 & checkVisibility()===false per CSSOM)
  const takeoverWrap = makeEl('div', { className: 'relative z-[1] mb-1' });
  const tkContents = makeEl('div', {
    className: 'contents',
    csDisplay: 'contents',
    rect: { width: 0, height: 0 },
    offsetHeight: 0,
    checkVisibility: false,
  });
  const takeoverCard = makeEl('div', { className: 'agy-takeover-frame', attrs: { 'data-testid': 'interaction-takeover-card' } });
  tkContents.appendChild(takeoverCard);
  takeoverWrap.appendChild(tkContents);

  // Input box wrapped in .contents; beforeShell contains a queued-messages-card inside a .contents wrapper
  const inputSlot = makeEl('div', {
    className: 'contents',
    csDisplay: 'contents',
    rect: { width: 0, height: 0 },
    offsetHeight: 0,
    checkVisibility: false,
  });
  const inputBox = makeEl('div', { attrs: { 'data-testid': 'agent-input-box' } });
  const queuedOuter = makeEl('div', { className: 'relative z-[1]' });
  const queuedContents = makeEl('div', {
    className: 'contents',
    csDisplay: 'contents',
    rect: { width: 0, height: 0 },
    offsetHeight: 0,
    checkVisibility: false,
  });
  const queuedCard = makeEl('div', { attrs: { 'data-testid': 'queued-messages-card' }, text: '1 queued message' });
  queuedContents.appendChild(queuedCard);
  queuedOuter.appendChild(queuedContents);

  // A .contents wrapper explicitly forced display:none must STILL be treated as hidden
  const hiddenContents = makeEl('div', {
    className: 'contents',
    rect: { width: 0, height: 0 },
    offsetHeight: 0,
    checkVisibility: false,
  });
  hiddenContents.style.display = 'none';
  hiddenContents.appendChild(makeEl('div', { attrs: { 'data-testid': 'queued-messages-card' }, text: 'hidden queued' }));

  const composerShell = makeEl('div', { id: 'antigravity.agentSidePanelInputBox', className: 'surface-composer' });
  const card = makeEl('div', { className: 'surface-composer-card', rect: { height: 96, width: 640 }, offsetHeight: 96 });
  card.appendChild(makeEl('div', { className: 'agy-composer-footer' }));
  composerShell.appendChild(card);

  inputBox.appendChild(hiddenContents);
  inputBox.appendChild(queuedOuter);
  inputBox.appendChild(composerShell);
  inputSlot.appendChild(inputBox);
  rtcWrap.appendChild(takeoverWrap);
  rtcWrap.appendChild(inputSlot);
  convView.appendChild(rtcWrap);
  body.appendChild(convView);

  try {
    const res = vm.runInNewContext(cdp.buildInjectExpression(cdp.DEFAULT_CONFIG), sandbox);
    assert.equal(res.status, 'ok');

    // Normal visible queued card docks crab on its roof with zero gap (data-ag-cs-queued cleared),
    // display:none .contents stays ignored, and takeoverWrap receives clearance cleanly
    assert.equal(queuedOuter.getAttribute('data-ag-cs-queued'), null);
    assert.equal(queuedCard.getAttribute('data-ag-cs-crab-anchor'), 'queued');
    assert.equal(card.getAttribute('data-ag-cs-crab-anchor'), null);
    assert.equal(hiddenContents.hasAttribute('data-ag-cs-queued'), false);
    assert.equal(hiddenContents.hasAttribute('data-ag-cs-crab-anchor'), false);
    assert.equal(tkContents.hasAttribute('data-ag-cs-takeover'), false, 'display:contents wrapper must never receive margin-bottom clearance');
    assert.equal(takeoverWrap.getAttribute('data-ag-cs-takeover'), '1');
    // Takeover card inside .contents is NOT misclassified as hidden -> html[data-ag-cs-takeover-open="1"] is set
    assert.equal(html.getAttribute('data-ag-cs-takeover-open'), '1');

    // Removing queuedCard hands crab anchor back to composer card while keeping takeoverWrap clearance
    const mainMo = observers.find((o) => Array.isArray(o.opts?.attributeFilter) && o.opts.attributeFilter.includes('hidden'));
    assert.ok(mainMo, 'Main MutationObserver must include hidden in attributeFilter');
    queuedCard.remove();
    mainMo.cb([{ type: 'childList', target: queuedContents, addedNodes: [], removedNodes: [queuedCard] }]);
    flushRaf();
    assert.equal(queuedOuter.hasAttribute('data-ag-cs-queued'), false);
    assert.equal(queuedCard.hasAttribute('data-ag-cs-crab-anchor'), false);
    assert.equal(card.getAttribute('data-ag-cs-crab-anchor'), 'composer');
    assert.equal(tkContents.hasAttribute('data-ag-cs-takeover'), false, 'display:contents wrapper must never receive margin-bottom clearance');
    assert.equal(takeoverWrap.getAttribute('data-ag-cs-takeover'), '1');
    assert.equal(html.getAttribute('data-ag-cs-takeover-open'), '1');

    // Direct .contents parent with no non-contents wrapper falls back to card itself (52px)
    takeoverWrap.remove();
    const directContents = makeEl('div', {
      className: 'contents',
      csDisplay: 'contents',
      rect: { width: 0, height: 0 },
      offsetHeight: 0,
      checkVisibility: false,
    });
    const directCard = makeEl('div', { attrs: { 'data-testid': 'interaction-takeover-card' } });
    directContents.appendChild(directCard);
    rtcWrap.insertBefore(directContents, inputSlot);
    mainMo.cb([{ type: 'childList', target: rtcWrap, addedNodes: [directContents], removedNodes: [takeoverWrap] }]);
    flushRaf();
    assert.equal(directContents.hasAttribute('data-ag-cs-takeover'), false);
    assert.equal(directCard.getAttribute('data-ag-cs-takeover'), '1');
    assert.equal(directCard.style.getPropertyValue('margin-bottom'), '52px');
    assert.equal(html.getAttribute('data-ag-cs-takeover-open'), '1');
  } finally {
    cleanupTimers();
  }
});

test('Red-Team P0 #1B & P1 #4: running-items-panel grid-rows-[1fr] at 0px frame 0 keeps clearance in both shell!==inputBox and shell===inputBox layouts', () => {
  for (const sameShell of [false, true]) {
    const { makeEl, body, sandbox, observers, flushRaf, cleanupTimers } = createMiniDom({ hasLayout: true });

    const convView = makeEl('div', { attrs: { 'data-testid': 'conversation-view' } });
    const inputBox = makeEl('div', { attrs: { 'data-testid': 'agent-input-box' } });
    const runningWrap = makeEl('div', {
      className: 'relative z-[1]',
      rect: { width: 320, height: 0 },
      offsetHeight: 0,
    });
    const runningPanel = makeEl('div', {
      className: 'grid grid-rows-[0fr]',
      attrs: { 'data-testid': 'running-items-panel' },
      rect: { width: 320, height: 0 },
      offsetHeight: 0,
    });
    runningWrap.appendChild(runningPanel);

    const card = makeEl('div', { className: 'surface-composer-card', rect: { height: 96, width: 640 }, offsetHeight: 96 });
    card.appendChild(makeEl('div', { className: 'agy-composer-footer' }));

    if (sameShell) {
      // shell === inputBox (no #antigravity.agentSidePanelInputBox intermediate shell)
      inputBox.appendChild(runningWrap);
      inputBox.appendChild(card);
    } else {
      const composerShell = makeEl('div', { id: 'antigravity.agentSidePanelInputBox', className: 'surface-composer' });
      composerShell.appendChild(runningWrap);
      composerShell.appendChild(card);
      inputBox.appendChild(composerShell);
    }
    convView.appendChild(inputBox);
    body.appendChild(convView);

    try {
      const res = vm.runInNewContext(cdp.buildInjectExpression(cdp.DEFAULT_CONFIG), sandbox);
      assert.equal(res.status, 'ok');
      assert.equal(runningWrap.hasAttribute('data-ag-cs-queued'), false, `Collapsed 0fr panel must not take clearance (sameShell=${sameShell})`);

      // Transition frame 0: class flips to grid-rows-[1fr] while rect.height is still 0
      const mainMo = observers.find((o) => Array.isArray(o.opts?.attributeFilter) && o.opts.attributeFilter.includes('hidden'));
      assert.ok(mainMo);
      runningPanel.className = 'grid grid-rows-[1fr]';
      mainMo.cb([{ type: 'attributes', target: runningPanel, attributeName: 'class' }]);
      flushRaf();
      assert.equal(
        runningWrap.getAttribute('data-ag-cs-queued'),
        '1',
        `Expanded 1fr running-items-panel at 0px frame 0 must immediately take clearance (sameShell=${sameShell})`
      );
      assert.equal(runningWrap.style.getPropertyValue('margin-bottom'), '46px');

      // Explicit hidden attr on expanded panel must still suppress clearance
      runningPanel.hidden = true;
      mainMo.cb([{ type: 'attributes', target: runningPanel, attributeName: 'hidden' }]);
      flushRaf();
      assert.equal(runningWrap.hasAttribute('data-ag-cs-queued'), false, `Hidden 1fr panel must clear queued attr (sameShell=${sameShell})`);

      // Unhide restores clearance immediately even at 0px frame 0
      runningPanel.hidden = false;
      mainMo.cb([{ type: 'attributes', target: runningPanel, attributeName: 'hidden' }]);
      flushRaf();
      assert.equal(runningWrap.getAttribute('data-ag-cs-queued'), '1');
    } finally {
      cleanupTimers();
    }
  }
});

test('Red-Team P0 #2 & P1 #5 & P2 #8: dual non-subagent composers preserve primary takeover-open, hidden wrapper triggers cleanup & recovery, REMOVE_EXPRESSION fallback strips takeover-open, and fixed/absolute wrappers are skipped', () => {
  const { makeEl, html, body, sandbox, observers, flushRaf, cleanupTimers } = createMiniDom({ hasLayout: true });

  // Primary composer inside conversation-view with visible takeover card
  const convView1 = makeEl('div', { attrs: { 'data-testid': 'conversation-view' } });
  const rtcWrap1 = makeEl('div', { className: 'relative z-10 flex flex-col gap-1 min-h-0' });
  const takeoverWrap1 = makeEl('div', { className: 'relative z-[1] mb-1' });
  const takeoverCard1 = makeEl('div', { className: 'agy-takeover-frame', attrs: { 'data-testid': 'interaction-takeover-card' } });
  takeoverWrap1.appendChild(takeoverCard1);
  const inputBox1 = makeEl('div', { attrs: { 'data-testid': 'agent-input-box' } });
  const card1 = makeEl('div', { className: 'surface-composer-card', rect: { height: 96, width: 640 }, offsetHeight: 96 });
  card1.appendChild(makeEl('div', { className: 'agy-composer-footer' }));
  inputBox1.appendChild(card1);
  rtcWrap1.appendChild(takeoverWrap1);
  rtcWrap1.appendChild(inputBox1);
  convView1.appendChild(rtcWrap1);

  // Second NON-subagent composer outside any conversation-view (tests scope must stay limited to wrap2, never fallback to document)
  const auxPaneWrap = makeEl('div', { className: 'flex flex-col' });
  const staleAuxTakeover = makeEl('div', { attrs: { 'data-testid': 'interaction-takeover-card', 'data-ag-cs-takeover': '1' } });
  staleAuxTakeover.style.setProperty('margin-bottom', '52px', 'important');
  const inputBox2 = makeEl('div', { attrs: { 'data-testid': 'agent-input-box' } });
  const card2 = makeEl('div', { className: 'surface-composer-card', rect: { height: 80, width: 420 }, offsetHeight: 80 });
  inputBox2.appendChild(card2);
  auxPaneWrap.appendChild(staleAuxTakeover);
  auxPaneWrap.appendChild(inputBox2);

  body.appendChild(convView1);
  body.appendChild(auxPaneWrap);

  try {
    const res = vm.runInNewContext(cdp.buildInjectExpression(cdp.DEFAULT_CONFIG), sandbox);
    assert.equal(res.status, 'ok');

    // Non-primary card2 must NEVER erase html[data-ag-cs-takeover-open] or primary card1's takeoverWrap1 clearance
    assert.equal(html.getAttribute('data-ag-cs-takeover-open'), '1', 'Secondary non-subagent card must not erase html[data-ag-cs-takeover-open]');
    assert.equal(takeoverWrap1.getAttribute('data-ag-cs-takeover'), '1', 'Secondary non-subagent card must not clear primary takeover clearance');
    assert.equal(staleAuxTakeover.hasAttribute('data-ag-cs-takeover'), false, 'Secondary card should still clear stale takeover inside its own wrap');

    const mainMo = observers.find((o) => Array.isArray(o.opts?.attributeFilter) && o.opts.attributeFilter.includes('hidden'));
    assert.ok(mainMo);

    // P1 #5: hiding untagged wrapper via class="hidden" triggers MO cleanup and clears html[data-ag-cs-takeover-open]
    takeoverWrap1.classList.add('hidden');
    mainMo.cb([{ type: 'attributes', target: takeoverWrap1, attributeName: 'class' }]);
    flushRaf();
    assert.equal(takeoverWrap1.hasAttribute('data-ag-cs-takeover'), false);
    assert.equal(html.hasAttribute('data-ag-cs-takeover-open'), false);

    // Removing class="hidden" on the same wrapper restores clearance & takeover-open
    takeoverWrap1.classList.remove('hidden');
    mainMo.cb([{ type: 'attributes', target: takeoverWrap1, attributeName: 'class' }]);
    flushRaf();
    assert.equal(takeoverWrap1.getAttribute('data-ag-cs-takeover'), '1');
    assert.equal(html.getAttribute('data-ag-cs-takeover-open'), '1');

    // Hiding wrapper via hidden attribute also triggers cleanup and recovery
    takeoverWrap1.hidden = true;
    mainMo.cb([{ type: 'attributes', target: takeoverWrap1, attributeName: 'hidden' }]);
    flushRaf();
    assert.equal(takeoverWrap1.hasAttribute('data-ag-cs-takeover'), false);
    assert.equal(html.hasAttribute('data-ag-cs-takeover-open'), false);

    takeoverWrap1.hidden = false;
    mainMo.cb([{ type: 'attributes', target: takeoverWrap1, attributeName: 'hidden' }]);
    flushRaf();
    assert.equal(takeoverWrap1.getAttribute('data-ag-cs-takeover'), '1');
    assert.equal(html.getAttribute('data-ag-cs-takeover-open'), '1');

    // P2 #8: fallback single-child wrapper with position:fixed/absolute must be skipped so floating layout is untouched
    takeoverWrap1.remove();
    const floatHost = makeEl('div', { className: 'floating-layer' });
    const fixedWrap = makeEl('div', { className: 'fixed bottom-4 right-4', csPosition: 'fixed' });
    const sidePanel = makeEl('div', { attrs: { 'data-testid': 'side-question-panel' } });
    fixedWrap.appendChild(sidePanel);
    floatHost.appendChild(fixedWrap);
    convView1.appendChild(floatHost);
    mainMo.cb([{ type: 'childList', target: convView1, addedNodes: [floatHost], removedNodes: [takeoverWrap1] }]);
    flushRaf();
    assert.equal(fixedWrap.hasAttribute('data-ag-cs-takeover'), false, 'position:fixed wrapper must NEVER receive data-ag-cs-takeover');
    assert.equal(sidePanel.getAttribute('data-ag-cs-takeover'), '1', 'Clearance must fall back to side-question-panel itself');
    assert.equal(html.getAttribute('data-ag-cs-takeover-open'), '1');

    // P1 #5: Even if __agPrism.destroy() throws/skips, cdp.REMOVE_EXPRESSION fallback strips html[data-ag-cs-takeover-open]
    sandbox.window.__agPrism = { destroy() { throw new Error('simulated destroy crash'); } };
    sandbox.window.__agClaudeStyle = sandbox.window.__agPrism;
    vm.runInNewContext(cdp.REMOVE_EXPRESSION, sandbox);
    assert.equal(html.hasAttribute('data-ag-cs-takeover-open'), false, 'REMOVE_EXPRESSION fallback must clear data-ag-cs-takeover-open');
  } finally {
    cleanupTimers();
  }
});

test('Red-Team P1 #3: syncCrabClearance performs zero layout reads after clearance writes (no Phase 2 Forced Reflow) and short-circuits inline display:none & checkVisibility()===false', () => {
  const events = [];
  let tracking = false;
  const hooks = {
    onRead(kind, el) {
      if (tracking) events.push({ op: 'R', kind, el });
    },
    onWrite(kind, el, detail) {
      if (tracking && (detail === 'data-ag-cs-queued' || detail === 'data-ag-cs-crab-anchor' || detail === 'data-ag-cs-takeover' || detail === 'data-ag-cs-takeover-open' || detail === 'data-ag-cs-menu-open' || detail === 'margin-bottom')) {
        events.push({ op: 'W', kind, el, detail });
      }
    },
  };

  const { makeEl, body, sandbox, observers, flushRaf, cleanupTimers } = createMiniDom({ hasLayout: true, hooks });

  const convView = makeEl('div', { attrs: { 'data-testid': 'conversation-view' } });
  const rtcWrap = makeEl('div', { className: 'relative z-10 flex flex-col gap-1 min-h-0' });
  const takeoverWrap = makeEl('div', { className: 'relative z-[1] mb-1' });
  const takeoverCard = makeEl('div', { className: 'agy-takeover-frame', attrs: { 'data-testid': 'interaction-takeover-card' } });
  takeoverWrap.appendChild(takeoverCard);

  const inputBox = makeEl('div', { attrs: { 'data-testid': 'agent-input-box' } });
  const inlineNoneNode = makeEl('div', { text: 'inline hidden' });
  inlineNoneNode.style.display = 'none';
  const checkVisFalseNode = makeEl('div', { text: 'offscreen hidden', checkVisibility: false });
  const queuedNode = makeEl('div', { attrs: { 'data-testid': 'queued-messages-card' }, text: 'queued' });
  const composerShell = makeEl('div', { id: 'antigravity.agentSidePanelInputBox', className: 'surface-composer' });
  const card = makeEl('div', { className: 'surface-composer-card', rect: { height: 96, width: 640 }, offsetHeight: 96 });
  card.appendChild(makeEl('div', { className: 'agy-composer-footer' }));
  composerShell.appendChild(card);

  inputBox.appendChild(inlineNoneNode);
  inputBox.appendChild(checkVisFalseNode);
  inputBox.appendChild(queuedNode);
  inputBox.appendChild(composerShell);
  rtcWrap.appendChild(takeoverWrap);
  rtcWrap.appendChild(inputBox);
  convView.appendChild(rtcWrap);
  body.appendChild(convView);

  try {
    const res = vm.runInNewContext(cdp.buildInjectExpression(cdp.DEFAULT_CONFIG), sandbox);
    assert.equal(res.status, 'ok');

    const mainMo = observers.find((o) => Array.isArray(o.opts?.attributeFilter) && o.opts.attributeFilter.includes('hidden'));
    assert.ok(mainMo);

    assert.equal(queuedNode.getAttribute('data-ag-cs-queued'), null);
    assert.equal(queuedNode.getAttribute('data-ag-cs-crab-anchor'), 'queued');
    assert.equal(takeoverWrap.getAttribute('data-ag-cs-takeover'), '1');

    // Toggle queuedNode & takeoverCard off so syncComposers performs real docking/clearance DOM writes in a normal incremental MO frame
    queuedNode.classList.add('hidden');
    takeoverCard.classList.add('hidden');
    events.length = 0;
    tracking = true;
    mainMo.cb([
      { type: 'attributes', target: queuedNode, attributeName: 'class' },
      { type: 'attributes', target: takeoverCard, attributeName: 'class' },
    ]);
    flushRaf();
    tracking = false;

    assert.equal(queuedNode.getAttribute('data-ag-cs-crab-anchor'), null);
    assert.equal(card.getAttribute('data-ag-cs-crab-anchor'), 'composer');
    assert.equal(takeoverWrap.hasAttribute('data-ag-cs-takeover'), false);

    const firstWriteIdx = events.findIndex((e) => e.op === 'W');
    assert.ok(firstWriteIdx >= 0, 'Expected clearance DOM writes during incremental sync');
    const readsAfterWrite = events.slice(firstWriteIdx + 1).filter((e) => e.op === 'R');
    assert.equal(
      readsAfterWrite.length,
      0,
      `Phase 2 must perform 0 layout/style reads after clearance writes, got: ${JSON.stringify(readsAfterWrite.map((r) => r.kind))}`
    );

    // Inline display:none node must short-circuit without calling getComputedStyle/getBoundingClientRect
    const inlineNoneReads = events.filter((e) => e.op === 'R' && e.el === inlineNoneNode);
    assert.equal(inlineNoneReads.length, 0, 'Inline style.display="none" must short-circuit before getComputedStyle/rc');

    // checkVisibility()===false node must short-circuit before calling getBoundingClientRect
    const cvFalseRectReads = events.filter((e) => e.op === 'R' && e.el === checkVisFalseNode && e.kind === 'getBoundingClientRect');
    assert.equal(cvFalseRectReads.length, 0, 'checkVisibility()===false must short-circuit before getBoundingClientRect');
  } finally {
    cleanupTimers();
  }
});

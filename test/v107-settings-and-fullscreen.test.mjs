'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

function makeStyleObj(owner) {
  const props = new Map();
  const syncAttrFromProps = () => {
    // Keep inline style object reactive without clobbering raw style attr unless set directly
    owner._inlineStyleMap = props;
  };
  return new Proxy(
    {
      setProperty(k, v) {
        props.set(String(k), String(v));
        syncAttrFromProps();
      },
      getPropertyValue(k) {
        return props.get(String(k)) || '';
      },
      removeProperty(k) {
        props.delete(String(k));
        syncAttrFromProps();
      },
    },
    {
      get(target, prop) {
        if (prop in target) return target[prop];
        return props.get(String(prop)) || '';
      },
      set(_target, prop, value) {
        if (value === '' || value === null || value === undefined) props.delete(String(prop));
        else props.set(String(prop), String(value));
        syncAttrFromProps();
        return true;
      },
    }
  );
}

function makeMiniNode(tag, attrs = {}, rect = null) {
  const attrMap = new Map();
  for (const [k, v] of Object.entries(attrs)) attrMap.set(k, String(v));
  const listeners = new Map();
  const node = {
    nodeType: 1,
    tagName: String(tag || 'DIV').toUpperCase(),
    children: [],
    parentElement: null,
    parentNode: null,
    hidden: false,
    disabled: false,
    checked: false,
    _text: '',
    _html: '',
    _rect: rect || { left: 0, top: 0, width: 320, height: 32, right: 320, bottom: 32 },
    get id() { return attrMap.get('id') || ''; },
    set id(v) { attrMap.set('id', String(v)); },
    get className() { return attrMap.get('class') || ''; },
    set className(v) { attrMap.set('class', String(v)); },
    get textContent() {
      if (this.children.length > 0 && !this._text) return this.children.map((c) => c.textContent).join('');
      return this._text;
    },
    set textContent(v) {
      this._text = String(v ?? '');
      this.children = [];
    },
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = String(v ?? ''); },
    get isConnected() {
      let cur = this;
      while (cur.parentElement) cur = cur.parentElement;
      return cur.tagName === 'HTML';
    },
    get firstElementChild() { return this.children[0] || null; },
    get lastElementChild() { return this.children[this.children.length - 1] || null; },
    get firstChild() { return this.children[0] || null; },
    get classList() {
      const getSet = () => new Set((attrMap.get('class') || '').split(/\s+/).filter(Boolean));
      const save = (s) => attrMap.set('class', [...s].join(' '));
      return {
        contains: (c) => getSet().has(c),
        add: (...cs) => { const s = getSet(); cs.forEach((c) => s.add(c)); save(s); },
        remove: (...cs) => { const s = getSet(); cs.forEach((c) => s.delete(c)); save(s); },
      };
    },
    getAttribute(k) { return attrMap.has(k) ? attrMap.get(k) : null; },
    setAttribute(k, v) {
      attrMap.set(k, String(v));
      if (k === 'hidden') this.hidden = true;
    },
    removeAttribute(k) {
      attrMap.delete(k);
      if (k === 'hidden') this.hidden = false;
    },
    hasAttribute(k) { return attrMap.has(k); },
    appendChild(child) {
      if (!child) return child;
      if (child.parentElement) {
        const idx = child.parentElement.children.indexOf(child);
        if (idx >= 0) child.parentElement.children.splice(idx, 1);
      }
      child.parentElement = this;
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    insertBefore(child, ref) {
      if (!ref) return this.appendChild(child);
      if (child.parentElement) {
        const oldIdx = child.parentElement.children.indexOf(child);
        if (oldIdx >= 0) child.parentElement.children.splice(oldIdx, 1);
      }
      child.parentElement = this;
      child.parentNode = this;
      const idx = this.children.indexOf(ref);
      if (idx >= 0) this.children.splice(idx, 0, child);
      else this.children.push(child);
      return child;
    },
    remove() {
      if (!this.parentElement) return;
      const idx = this.parentElement.children.indexOf(this);
      if (idx >= 0) this.parentElement.children.splice(idx, 1);
      this.parentElement = null;
      this.parentNode = null;
    },
    contains(other) {
      let cur = other;
      while (cur) {
        if (cur === this) return true;
        cur = cur.parentElement;
      }
      return false;
    },
    addEventListener(ev, fn) {
      if (!listeners.has(ev)) listeners.set(ev, new Set());
      listeners.get(ev).add(fn);
    },
    removeEventListener(ev, fn) { listeners.get(ev)?.delete(fn); },
    dispatchEvent(ev) {
      const e = ev && typeof ev === 'object' ? ev : { type: String(ev || '') };
      if (!e.target) e.target = this;
      if (!e.stopPropagation) e.stopPropagation = () => {};
      if (!e.preventDefault) e.preventDefault = () => {};
      for (const fn of [...(listeners.get(e.type) || [])]) fn(e);
    },
    click() { this.dispatchEvent({ type: 'click', target: this }); },
    getBoundingClientRect() { return { ...this._rect }; },
    matches(sel) { return matchesSelectorList(this, sel); },
    closest(sel) {
      let cur = this;
      while (cur) {
        if (matchesSelectorList(cur, sel)) return cur;
        cur = cur.parentElement;
      }
      return null;
    },
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
    querySelectorAll(sel) {
      const out = [];
      const walk = (n) => {
        for (const c of n.children) {
          if (matchesSelectorList(c, sel)) out.push(c);
          walk(c);
        }
      };
      walk(this);
      return out;
    },
  };
  node.style = makeStyleObj(node);
  return node;
}

function matchesSimple(el, raw) {
  let s = raw.trim();
  if (!s) return false;
  if (s === '*') return true;
  const tagMatch = s.match(/^([a-zA-Z0-9_-]+)/);
  if (tagMatch) {
    if (el.tagName !== tagMatch[1].toUpperCase()) return false;
    s = s.slice(tagMatch[0].length);
  }
  const idRe = /#([a-zA-Z0-9_-]+)/g;
  let m;
  while ((m = idRe.exec(s))) {
    if (el.id !== m[1]) return false;
  }
  const clsRe = /\.([a-zA-Z0-9_-]+)/g;
  while ((m = clsRe.exec(s))) {
    if (!el.classList.contains(m[1])) return false;
  }
  const attrRe = /\[([^\]=*~^$|]+)(?:([*^$|~]?=)"([^"]*)")?\]/g;
  while ((m = attrRe.exec(s))) {
    const [, k, op, val] = m;
    if (!op) {
      if (!el.hasAttribute(k)) return false;
    } else {
      const got = el.getAttribute(k);
      if (got === null) return false;
      if (op === '=' && got !== val) return false;
      if (op === '*=' && !got.includes(val)) return false;
      if (op === '^=' && !got.startsWith(val)) return false;
      if (op === '$=' && !got.endsWith(val)) return false;
    }
  }
  return true;
}

function matchesComplex(el, sel) {
  const parts = sel.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return false;
  if (!matchesSimple(el, parts[parts.length - 1])) return false;
  let cur = el.parentElement;
  for (let i = parts.length - 2; i >= 0; i--) {
    let found = false;
    while (cur) {
      if (matchesSimple(cur, parts[i])) {
        found = true;
        cur = cur.parentElement;
        break;
      }
      cur = cur.parentElement;
    }
    if (!found) return false;
  }
  return true;
}

function matchesSelectorList(el, selector) {
  return String(selector || '')
    .split(',')
    .some((part) => matchesComplex(el, part));
}

function bootUiRuntime(initialCfg = {}, opts = {}) {
  const cdp = require(path.join(ROOT, 'cdp.js'));
  const uiMainFactory = require(path.join(ROOT, 'ui-runtime.js'));
  const i18nCore = require(path.join(ROOT, 'i18n-core.js'));
  const i18nLocales = require(path.join(ROOT, 'i18n-locales.js'));

  const html = makeMiniNode('html');
  const head = makeMiniNode('head');
  const body = makeMiniNode('body');
  html.appendChild(head);
  html.appendChild(body);
  if (typeof opts.setupDom === 'function') opts.setupDom({ html, head, body });

  const docListeners = new Map();
  const winListeners = new Map();
  const docAddLog = [];
  const docRemoveLog = [];
  const fakeDoc = {
    hidden: false,
    documentElement: html,
    head,
    body,
    activeElement: null,
    hasFocus: () => true,
    createElement: (t) => makeMiniNode(t),
    getElementById: (id) => html.querySelector(`#${id}`),
    querySelector: (s) => html.querySelector(s),
    querySelectorAll: (s) => html.querySelectorAll(s),
    addEventListener(ev, fn, opt) {
      docAddLog.push({ ev, fn, opt });
      if (!docListeners.has(ev)) docListeners.set(ev, new Set());
      docListeners.get(ev).add(fn);
    },
    removeEventListener(ev, fn, opt) {
      docRemoveLog.push({ ev, fn, opt });
      docListeners.get(ev)?.delete(fn);
    },
  };
  const dispatchDoc = (type, ev = {}) => {
    const payload = { type, ...ev };
    for (const fn of [...(docListeners.get(type) || [])]) fn(payload);
  };

  const moInstances = [];
  class FakeMO {
    constructor(cb) { this.cb = cb; this.targets = []; moInstances.push(this); }
    observe(target, o) { this.targets.push({ target, opts: o }); }
    disconnect() { this.targets = []; }
    takeRecords() { return []; }
  }

  let now = 5000;
  let nextTid = 1;
  const timers = new Map();
  const rafs = [];
  const settingCalls = [];

  const sb = {
    window: null,
    document: fakeDoc,
    location: { pathname: '/chat', href: 'http://localhost/chat' },
    performance: { now: () => now },
    devicePixelRatio: 1,
    innerHeight: 900,
    innerWidth: 1400,
    localStorage: {
      _m: new Map(),
      getItem(k) { return this._m.has(k) ? this._m.get(k) : null; },
      setItem(k, v) { this._m.set(k, String(v)); },
      removeItem(k) { this._m.delete(k); },
    },
    getComputedStyle: () => ({ borderTopLeftRadius: '10px', getPropertyValue: () => '' }),
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    addEventListener(ev, fn) {
      if (!winListeners.has(ev)) winListeners.set(ev, new Set());
      winListeners.get(ev).add(fn);
    },
    removeEventListener(ev, fn) { winListeners.get(ev)?.delete(fn); },
    MutationObserver: FakeMO,
    requestAnimationFrame: (fn) => { rafs.push(fn); return rafs.length; },
    cancelAnimationFrame: () => {},
    setTimeout: (fn, ms = 0) => { const id = nextTid++; timers.set(id, { fn, at: now + ms }); return id; },
    clearTimeout: (id) => { timers.delete(id); },
    setInterval: () => 1,
    clearInterval: () => {},
    __agCsI18nCore: i18nCore,
    __agCsLocales: i18nLocales,
    __agMotionEngine: { glideIndicator() {}, bindMicroInteractions: () => ({ unbind() {} }) },
    __agAnimatedIcons: { renderIcon: (name) => `<path data-icon="${name}"/>` },
    __agPrismSetting: (raw) => { try { settingCalls.push(JSON.parse(raw)); } catch {} },
    Set, WeakSet, Map, WeakMap, Array, Object, Number, Math, String, Boolean, JSON, Promise, Date, RegExp,
    ...(opts.extraGlobals || {}),
  };
  sb.window = sb;
  sb.globalThis = sb;

  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'stream-choreography.js'), 'utf8'), sb);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'prism-rim-canvas.js'), 'utf8'), sb);
  const bootCfg = { ...cdp.DEFAULT_CONFIG, ...initialCfg };
  vm.runInNewContext(`(${uiMainFactory.toString()})(${JSON.stringify(bootCfg)})`, sb);

  const flushRafs = () => {
    const batch = rafs.splice(0, rafs.length);
    for (const fn of batch) fn(now);
  };

  return {
    sb,
    api: sb.window.__agPrism,
    html,
    body,
    docListeners,
    docAddLog,
    docRemoveLog,
    dispatchDoc,
    moInstances,
    settingCalls,
    flushRafs,
  };
}

test('#1 aux-pane-split fullscreen fix: data-split-overlaid, position:absolute, and split-transition drop data-ag-cs-aux-dual immediately and restore on exit', () => {
  let auxSplit, auxLeft, auxSash, auxRight;
  const ctx = bootUiRuntime({}, {
    setupDom({ body }) {
      auxSplit = makeMiniNode('div', { 'data-testid': 'aux-pane-split' });
      auxLeft = makeMiniNode('div', { style: 'width: 600px' });
      auxSash = makeMiniNode('div', { role: 'separator' });
      auxRight = makeMiniNode('div', { style: 'width: 400px' });
      auxSplit.appendChild(auxLeft);
      auxSplit.appendChild(auxSash);
      auxSplit.appendChild(auxRight);
      body.appendChild(auxSplit);
    },
  });

  assert.equal(auxSplit.getAttribute('data-ag-cs-aux-dual'), '1', 'Initial dual split must carry data-ag-cs-aux-dual="1"');

  const axMo = ctx.moInstances.find((m) => m.targets.some((t) => t.target === auxSplit));
  assert.ok(axMo, 'axO MutationObserver must observe aux-pane-split');
  const splitObs = axMo.targets.find((t) => t.target === auxSplit);
  assert.equal(splitObs.opts.attributes, true, 'axO must observe attributes on aux-pane-split');
  assert.ok(splitObs.opts.attributeFilter.includes('data-split-transition'), 'axO must filter data-split-transition on aux-pane-split');
  const rightObs = axMo.targets.find((t) => t.target === auxRight);
  assert.ok(rightObs.opts.attributeFilter.includes('data-split-overlaid'), 'axO must filter data-split-overlaid on split panes');

  // Case A: right pane overlaid (fullscreen maximize)
  auxRight.setAttribute('data-split-overlaid', 'true');
  axMo.cb([{ type: 'attributes', target: auxRight, attributeName: 'data-split-overlaid' }]);
  assert.equal(auxSplit.hasAttribute('data-ag-cs-aux-dual'), false, 'data-split-overlaid="true" on right pane must drop data-ag-cs-aux-dual');

  // Restore from overlaid -> dual returns
  auxRight.removeAttribute('data-split-overlaid');
  axMo.cb([{ type: 'attributes', target: auxRight, attributeName: 'data-split-overlaid' }]);
  assert.equal(auxSplit.getAttribute('data-ag-cs-aux-dual'), '1', 'Clearing data-split-overlaid must restore data-ag-cs-aux-dual="1"');

  // Case B: left pane overlaid
  auxLeft.setAttribute('data-split-overlaid', 'true');
  axMo.cb([{ type: 'attributes', target: auxLeft, attributeName: 'data-split-overlaid' }]);
  assert.equal(auxSplit.hasAttribute('data-ag-cs-aux-dual'), false, 'data-split-overlaid="true" on left pane must drop data-ag-cs-aux-dual');
  auxLeft.removeAttribute('data-split-overlaid');
  axMo.cb([{ type: 'attributes', target: auxLeft, attributeName: 'data-split-overlaid' }]);
  assert.equal(auxSplit.getAttribute('data-ag-cs-aux-dual'), '1');

  // Case C: style.position === 'absolute'
  auxRight.style.position = 'absolute';
  axMo.cb([{ type: 'attributes', target: auxRight, attributeName: 'style' }]);
  assert.equal(auxSplit.hasAttribute('data-ag-cs-aux-dual'), false, 'style.position=absolute must drop data-ag-cs-aux-dual');
  auxRight.style.position = '';
  axMo.cb([{ type: 'attributes', target: auxRight, attributeName: 'style' }]);
  assert.equal(auxSplit.getAttribute('data-ag-cs-aux-dual'), '1');

  // Case D: inline style attribute contains position: absolute
  auxRight.setAttribute('style', 'position: absolute; inset: 0; width: 100%;');
  axMo.cb([{ type: 'attributes', target: auxRight, attributeName: 'style' }]);
  assert.equal(auxSplit.hasAttribute('data-ag-cs-aux-dual'), false, 'Inline style attr position:absolute must drop data-ag-cs-aux-dual');
  auxRight.setAttribute('style', 'width: 400px;');
  axMo.cb([{ type: 'attributes', target: auxRight, attributeName: 'style' }]);
  assert.equal(auxSplit.getAttribute('data-ag-cs-aux-dual'), '1');

  // Case E: data-split-transition in maximizing / restoring / closing
  for (const tr of ['maximizing', 'restoring', 'closing']) {
    auxSplit.setAttribute('data-split-transition', tr);
    axMo.cb([{ type: 'attributes', target: auxSplit, attributeName: 'data-split-transition' }]);
    assert.equal(auxSplit.hasAttribute('data-ag-cs-aux-dual'), false, `data-split-transition="${tr}" must drop data-ag-cs-aux-dual`);
  }
  auxSplit.removeAttribute('data-split-transition');
  axMo.cb([{ type: 'attributes', target: auxSplit, attributeName: 'data-split-transition' }]);
  assert.equal(auxSplit.getAttribute('data-ag-cs-aux-dual'), '1', 'Exiting transition must restore data-ag-cs-aux-dual="1"');

  ctx.api.destroy();
});

test('#3 motionLevel=subtle restores injected host animated icons immediately', () => {
  let toggleBtn, origSvg;
  const ctx = bootUiRuntime({ motionLevel: 'ultra' }, {
    setupDom({ body }) {
      toggleBtn = makeMiniNode('button', { 'data-testid': 'toggle-aux-sidebar' });
      origSvg = makeMiniNode('svg', { width: '16', height: '16' });
      toggleBtn.appendChild(origSvg);
      body.appendChild(toggleBtn);
    },
  });

  assert.ok(toggleBtn.getAttribute('data-ag-cs-icon-injected'), 'ultra motion must inject animated icon');
  assert.ok(toggleBtn.querySelector('.ag-anim-icon'), 'animated svg must be mounted');
  assert.equal(origSvg.hasAttribute('data-ag-cs-orig-svg'), true);

  // Switch to subtle -> must restore original icon cleanly
  ctx.api.saveSettingsBatch({ motionLevel: 'subtle' });
  ctx.flushRafs();
  assert.equal(toggleBtn.hasAttribute('data-ag-cs-icon-injected'), false, 'subtle motion must clear data-ag-cs-icon-injected');
  assert.equal(toggleBtn.querySelector('.ag-anim-icon'), null, 'subtle motion must remove injected .ag-anim-icon');
  assert.equal(origSvg.hasAttribute('data-ag-cs-orig-svg'), false, 'original svg marker must be cleaned');
  assert.equal(origSvg.hidden, false, 'original svg must be visible again');

  // Switch back to standard -> re-injects cleanly
  ctx.api.saveSettingsBatch({ motionLevel: 'standard' });
  ctx.flushRafs();
  assert.ok(toggleBtn.getAttribute('data-ag-cs-icon-injected'), 'standard motion must re-inject animated icon');

  ctx.api.destroy();
});

test('#5 legacy aliases normalize claude->warm & dual->crab, #7b thoughtView omits attr when off, #8b palette=host light avoids alabaster split-brain', () => {
  let capturedSpectrumFn = null;
  const ctx = bootUiRuntime(
    { palette: 'claude', mascot: 'dual', thoughtTranslate: 'off', thoughtView: 'immersive', lightPreset: 'alabaster' },
    {
      extraGlobals: {
        __agPrismConvAura: {
          isConvRunning: () => false,
          createConvAuraController(opts) {
            capturedSpectrumFn = opts.getSpectrumMode;
            return {
              prime() {},
              sync() {},
              unmount() {},
              refreshTheme() {},
              triggerStart() {},
              triggerLiftoffEbb() {},
              advancePhase: () => 'idle',
              getInstance: () => null,
            };
          },
        },
      },
    }
  );

  // #5: boot normalization
  assert.equal(ctx.html.getAttribute('data-ag-cs-palette'), 'warm', 'palette=claude must normalize to warm on root attr');
  assert.equal(ctx.api.getState().cfg.palette, 'warm');
  assert.equal(ctx.api.getState().cfg.mascot, 'crab', 'mascot=dual must normalize to crab');

  // #5: saveSettingsBatch normalizes wire payload too
  ctx.api.saveSettingsBatch({ palette: 'claude', mascot: 'dual' });
  const lastCall = ctx.settingCalls[ctx.settingCalls.length - 1];
  assert.equal(lastCall?.entries?.palette, 'warm');
  assert.equal(lastCall?.entries?.mascot, 'crab');

  // #7b: thoughtTranslate=off must NOT write data-ag-prism-thought-view
  assert.equal(ctx.html.hasAttribute('data-ag-prism-thought-view'), false, 'thoughtTranslate=off must omit data-ag-prism-thought-view');
  ctx.api.saveSettingsBatch({ thoughtView: 'bilingual' });
  assert.equal(ctx.html.hasAttribute('data-ag-prism-thought-view'), false, 'changing thoughtView while thoughtTranslate=off must still omit attr');
  ctx.api.saveSettingsBatch({ thoughtTranslate: 'machine' });
  assert.equal(ctx.html.getAttribute('data-ag-prism-thought-view'), 'bilingual', 'enabling thoughtTranslate must stamp data-ag-prism-thought-view');
  ctx.api.saveSettingsBatch({ thoughtTranslate: 'off' });
  assert.equal(ctx.html.hasAttribute('data-ag-prism-thought-view'), false, 'disabling thoughtTranslate must remove data-ag-prism-thought-view');

  // #8b: light mode + lightPreset=alabaster only applies warm spectrum to obsidian (NOT host)
  ctx.body.classList.add('theme-light');
  assert.equal(typeof capturedSpectrumFn, 'function');
  ctx.api.saveSettingsBatch({ palette: 'host', lightPreset: 'alabaster', accentTone: 'follow' });
  assert.equal(capturedSpectrumFn(), 'default', 'palette=host in light+alabaster must stay default (no warm split-brain)');
  ctx.api.saveSettingsBatch({ palette: 'obsidian', lightPreset: 'alabaster', accentTone: 'follow' });
  assert.equal(capturedSpectrumFn(), 'warm', 'palette=obsidian in light+alabaster must resolve warm');
  ctx.api.saveSettingsBatch({ palette: 'warm', lightPreset: 'crystal', accentTone: 'follow' });
  assert.equal(capturedSpectrumFn(), 'warm', 'palette=warm must always resolve warm');

  ctx.api.destroy();
});

test('#7a smoothCaret=false dynamically unbinds all 9 document caret listeners with 0 callbacks and rebinds cleanly on toggle', () => {
  const CARET_EVENTS = ['keyup', 'mouseup', 'input', 'selectionchange', 'focusin', 'focusout', 'scroll', 'compositionupdate', 'compositionend'];
  let caretQueueCalls = 0;
  let caretTeardownCalls = 0;

  const ctx = bootUiRuntime(
    { smoothCaret: false },
    {
      extraGlobals: {
        __agPrismSmoothCaret: {
          createSmoothCaretController() {
            return {
              queue() { caretQueueCalls += 1; },
              sync() {},
              measureSnapshot: () => [],
              applyMutations() {},
              bumpMetricsEpoch() {},
              teardown() { caretTeardownCalls += 1; },
            };
          },
        },
      },
    }
  );

  // Strict contract: never bind click/mousedown on document
  assert.equal(ctx.docListeners.get('click')?.size || 0, 0);
  assert.equal(ctx.docListeners.get('mousedown')?.size || 0, 0);

  // Boot with smoothCaret=false -> 0 caret listeners bound
  for (const ev of CARET_EVENTS) {
    assert.equal(ctx.docListeners.get(ev)?.size || 0, 0, `Event "${ev}" must have 0 listeners when smoothCaret=false at boot`);
    ctx.dispatchDoc(ev, {});
  }
  assert.equal(caretQueueCalls, 0, 'Dispatching all 9 caret events while smoothCaret=false must trigger 0 callbacks');

  // Toggle smoothCaret=true -> all 9 caret listeners bind
  ctx.api.saveSettingsBatch({ smoothCaret: true });
  for (const ev of CARET_EVENTS) {
    assert.equal(ctx.docListeners.get(ev)?.size || 0, 1, `Event "${ev}" must bind 1 listener when smoothCaret=true`);
  }

  // Toggle smoothCaret=false -> all 9 caret listeners unbind & teardown runs
  const tdBefore = caretTeardownCalls;
  ctx.api.saveSettingsBatch({ smoothCaret: false });
  for (const ev of CARET_EVENTS) {
    assert.equal(ctx.docListeners.get(ev)?.size || 0, 0, `Event "${ev}" must unbind when smoothCaret switches to false`);
  }
  assert.ok(caretTeardownCalls > tdBefore, 'Disabling smoothCaret must invoke smoothCaretCtl.teardown()');

  // Toggle back on, then destroy -> symmetric cleanup to 0
  ctx.api.saveSettingsBatch({ smoothCaret: true });
  ctx.api.destroy();
  for (const ev of CARET_EVENTS) {
    assert.equal(ctx.docListeners.get(ev)?.size || 0, 0, `Event "${ev}" must be cleaned on destroy()`);
  }
});

test('2-2A homeRipple=false decouples from convAura (stays active while ambient>0, stops when ambient=0, sleeps when motion=off)', () => {
  let auraOpts = null;
  let rippleOpts = null;

  const ctx = bootUiRuntime(
    { homeRipple: false, ambientIntensity: '100', motionLevel: 'ultra', homeLayout: 'studio' },
    {
      extraGlobals: {
        __agPrismHomeRippleHost: {
          createHomeRippleController(opts) {
            rippleOpts = opts;
            return { sync() {}, unmount() {}, refreshTheme() {}, getMount: () => null };
          },
        },
        __agPrismConvAura: {
          isConvRunning: () => false,
          createConvAuraController(opts) {
            auraOpts = opts;
            return {
              prime() {},
              sync() {},
              unmount() {},
              refreshTheme() {},
              triggerStart() {},
              triggerLiftoffEbb() {},
              advancePhase: () => 'idle',
              getInstance: () => null,
            };
          },
        },
      },
    }
  );

  assert.ok(auraOpts && rippleOpts);
  assert.equal(rippleOpts.isAllowed(), false, 'Home ripple must still obey homeRipple=false');
  assert.equal(auraOpts.isHomeRippleEnabled(), true, 'convAura must remain enabled when homeRipple=false and ambientIntensity=100');
  assert.equal(auraOpts.isMotionStandardOrUltra(), true);

  // Setting ambientIntensity='0' disables convAura
  ctx.api.saveSettingsBatch({ ambientIntensity: '0' });
  assert.equal(auraOpts.isHomeRippleEnabled(), false, 'convAura must disable when ambientIntensity=0');

  // Restoring ambientIntensity='70' + motionLevel='off' keeps aura enabled but stops living motion
  ctx.api.saveSettingsBatch({ ambientIntensity: '70', motionLevel: 'off' });
  assert.equal(auraOpts.isHomeRippleEnabled(), true);
  assert.equal(auraOpts.isMotionStandardOrUltra(), false, 'motionLevel=off must still freeze convAura living frames');

  ctx.api.destroy();
});

test('#6 updateChannel sends { version, channel } immediately without 40ms race & #8a dims all 5 parent-child setting pairs', async () => {
  const settingsPanel = require(path.join(ROOT, 'settings-panel.js'));
  const i18nCore = require(path.join(ROOT, 'i18n-core.js'));
  const i18nLocales = require(path.join(ROOT, 'i18n-locales.js'));

  const html = makeMiniNode('html', { 'data-ag-cs-theme': 'dark' });
  const head = makeMiniNode('head');
  const body = makeMiniNode('body');
  const dialog = makeMiniNode('div', { role: 'dialog' });
  const panel = makeMiniNode('div', { class: 'p-6' });
  const h2 = makeMiniNode('h2');
  h2.textContent = 'Appearance';
  const anchorSec = makeMiniNode('div', { class: 'space-y-2' });
  panel.appendChild(h2);
  panel.appendChild(anchorSec);
  dialog.appendChild(panel);
  body.appendChild(dialog);
  html.appendChild(head);
  html.appendChild(body);

  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  const prevLs = globalThis.localStorage;
  const repoCalls = [];
  const lsMap = new Map([['ag-prism:settings-open', '1']]);

  globalThis.localStorage = {
    getItem: (k) => (lsMap.has(k) ? lsMap.get(k) : null),
    setItem: (k, v) => lsMap.set(k, String(v)),
    removeItem: (k) => lsMap.delete(k),
  };
  globalThis.document = {
    documentElement: html,
    head,
    body,
    createElement: (t) => makeMiniNode(t),
    getElementById: (id) => html.querySelector(`#${id}`),
    querySelector: (s) => html.querySelector(s),
    querySelectorAll: (s) => html.querySelectorAll(s),
  };
  globalThis.window = {
    __agPrismRepoBridge: (arg) => {
      repoCalls.push(arg);
      return Promise.resolve({
        ok: true,
        action: arg.action,
        channel: arg.channel || 'stable',
        hasUpdate: arg.channel === 'beta',
        latestVersion: arg.channel === 'beta' ? '1.0.7-beta.1' : '1.0.6',
        currentVersion: '1.0.6',
      });
    },
  };

  const state = {
    palette: 'obsidian',
    lightPreset: 'crystal',
    accentTone: 'follow',
    cornerStyle: 'balanced',
    ambientIntensity: '100',
    motionLevel: 'ultra',
    targetFps: '180',
    homeLayout: 'studio',
    homeRipple: true,
    convRipple: 'off',
    logoInk: 'accent',
    language: 'zh-CN',
    hostLocalization: 'auto',
    composerRestyle: true,
    placeholderStyle: 'studio',
    smoothCaret: true,
    contextMenu: true,
    codeFont: 'default',
    codeLigatures: false,
    mascot: 'crab',
    sidebarRestyle: true,
    sidebarCompact: false,
    thoughtTranslate: 'off',
    thoughtTrigger: 'preload',
    thoughtView: 'immersive',
    telemetryModule: 'auto',
    effortSliderModule: 'auto',
    omniModule: 'on',
    linkTarget: 'builtin',
    sidebarStudio: 'off',
    autoUpdate: 'off',
    updateChannel: 'stable',
  };

  const mountOrSync = () => {
    settingsPanel.mountOrSyncSettingsSection({
      version: '1.0.6',
      lazyFold: false,
      getLang: () => state.language,
      uiText: (l) => i18nLocales.getUiStrings(l),
      isZh: () => true,
      i18nCore,
      formatSettingsSummary: () => 'summary',
      resolveSettingRowActiveValue: (k) => state[k],
      isSettingButtonMatch: (k, valJson, cur) => JSON.parse(valJson) === cur,
      saveSetting: (k, v) => { state[k] = v; },
      saveSettingsBatch: (p) => { Object.assign(state, p); },
      getThoughtTranslateMode: () => state.thoughtTranslate,
      handledGroupClicks: new WeakSet(),
      runSettingsGroupGlide: null,
      runGuardedMut: (fn) => fn(),
    });
  };

  try {
    mountOrSync();
    const sec = html.querySelector(`#${settingsPanel.SETTINGS_SEC_ID}`);
    assert.ok(sec);

    const rowOf = (k) => sec.querySelector(`[data-ag-cs-row="${k}"]`);
    const btnOf = (k, v) =>
      sec.querySelectorAll(`button[data-ag-cs-key="${k}"]`).find((b) => b.getAttribute('data-ag-cs-val') === JSON.stringify(v));

    // #6: clicking updateChannel=beta immediately invokes update-status with { version: '1.0.6', channel: 'beta' } (0ms delay!)
    const callsBefore = repoCalls.length;
    btnOf('updateChannel', 'beta').click();
    assert.equal(repoCalls.length, callsBefore + 1, 'updateChannel click must invoke update-status synchronously without 40ms setTimeout');
    assert.equal(repoCalls[repoCalls.length - 1].action, 'update-status');
    assert.equal(repoCalls[repoCalls.length - 1].channel, 'beta');
    assert.equal(repoCalls[repoCalls.length - 1].version, '1.0.6');
    await Promise.resolve();
    await Promise.resolve();
    const badge = sec.querySelector('[data-ag-cs-update-badge]');
    assert.equal(badge.hidden, false, 'Beta update response must immediately light up update badge');

    // #8a: initial state has thoughtTranslate='off' -> thoughtTrigger & thoughtView already dimmed
    for (const k of ['thoughtTrigger', 'thoughtView']) {
      assert.equal(rowOf(k).style.opacity, '0.55', `${k} must dim when thoughtTranslate=off`);
      assert.equal(rowOf(k).getAttribute('data-ag-cs-dimmed'), '1');
    }
    btnOf('thoughtTranslate', 'machine').click();
    for (const k of ['thoughtTrigger', 'thoughtView']) {
      assert.equal(rowOf(k).style.opacity, '', `${k} must restore when thoughtTranslate=machine`);
      assert.equal(rowOf(k).hasAttribute('data-ag-cs-dimmed'), false);
    }

    // composerRestyle=false -> placeholderStyle dims
    btnOf('composerRestyle', false).click();
    assert.equal(rowOf('placeholderStyle').style.opacity, '0.55');
    assert.equal(rowOf('placeholderStyle').getAttribute('data-ag-cs-dimmed'), '1');
    btnOf('composerRestyle', true).click();
    assert.equal(rowOf('placeholderStyle').style.opacity, '');
    assert.equal(rowOf('placeholderStyle').hasAttribute('data-ag-cs-dimmed'), false);

    // sidebarRestyle=false -> sidebarCompact dims
    btnOf('sidebarRestyle', false).click();
    assert.equal(rowOf('sidebarCompact').style.opacity, '0.55');
    assert.equal(rowOf('sidebarCompact').getAttribute('data-ag-cs-dimmed'), '1');
    btnOf('sidebarRestyle', true).click();
    assert.equal(rowOf('sidebarCompact').style.opacity, '');
    assert.equal(rowOf('sidebarCompact').hasAttribute('data-ag-cs-dimmed'), false);

    // homeLayout=off -> homeRipple dims, while convRipple stays active (not dimmed)
    btnOf('homeLayout', 'off').click();
    assert.equal(rowOf('homeRipple').style.opacity, '0.55');
    assert.equal(rowOf('homeRipple').getAttribute('data-ag-cs-dimmed'), '1');
    assert.equal(rowOf('convRipple').style.opacity, '');
    assert.equal(rowOf('convRipple').hasAttribute('data-ag-cs-dimmed'), false);
    btnOf('homeLayout', 'studio').click();
    assert.equal(rowOf('homeRipple').style.opacity, '');
    assert.equal(rowOf('homeRipple').hasAttribute('data-ag-cs-dimmed'), false);

    // motionLevel=off -> both homeRipple and convRipple dim together; restoring motionLevel restores both
    btnOf('motionLevel', 'off').click();
    assert.equal(rowOf('homeRipple').style.opacity, '0.55');
    assert.equal(rowOf('homeRipple').getAttribute('data-ag-cs-dimmed'), '1');
    assert.equal(rowOf('convRipple').style.opacity, '0.55');
    assert.equal(rowOf('convRipple').getAttribute('data-ag-cs-dimmed'), '1');
    btnOf('motionLevel', 'ultra').click();
    assert.equal(rowOf('homeRipple').style.opacity, '');
    assert.equal(rowOf('homeRipple').hasAttribute('data-ag-cs-dimmed'), false);
    assert.equal(rowOf('convRipple').style.opacity, '');
    assert.equal(rowOf('convRipple').hasAttribute('data-ag-cs-dimmed'), false);

    // convRipple 4-tier segmented control sits adjacent right after homeRipple and updates state.convRipple cleanly
    const hrRow = rowOf('homeRipple');
    const crRow = rowOf('convRipple');
    const sibs = hrRow.parentElement.children;
    assert.equal(sibs.indexOf(crRow), sibs.indexOf(hrRow) + 1);
    const crBtns = crRow.querySelectorAll('button[data-ag-cs-key="convRipple"]');
    assert.deepEqual(
      crBtns.map((b) => b.getAttribute('data-ag-cs-val')),
      ['"off"', '"subtle"', '"medium"', '"full"']
    );
    assert.equal(crBtns[0].parentElement.hasAttribute('data-ui-kind'), false, '4-tier convRipple must render as segmented group, not switch');
    for (const tier of ['subtle', 'medium', 'full', 'off']) {
      btnOf('convRipple', tier).click();
      assert.equal(state.convRipple, tier);
      assert.equal(btnOf('convRipple', tier).getAttribute('aria-pressed'), 'true');
    }

    // omniModule=off -> linkTarget dims
    btnOf('omniModule', 'off').click();
    assert.equal(rowOf('linkTarget').style.opacity, '0.55');
    assert.equal(rowOf('linkTarget').getAttribute('data-ag-cs-dimmed'), '1');
    btnOf('omniModule', 'on').click();
    assert.equal(rowOf('linkTarget').style.opacity, '');
    assert.equal(rowOf('linkTarget').hasAttribute('data-ag-cs-dimmed'), false);
  } finally {
    globalThis.document = prevDoc;
    globalThis.window = prevWin;
    globalThis.localStorage = prevLs;
  }
});

test('CSS hygiene, dual-split :not([data-split-overlaid]), dead brand SVG CSS removal, 8-locale setTargetFpsDesc & Channel 1 < 550,000 B', () => {
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  assert.equal(/:has\(/.test(css), false, 'style.css must have 0 :has() selectors');
  assert.equal(/[^\x00-\x7F]/.test(css), false, 'style.css must have 0 non-ASCII characters');
  assert.equal((css.match(/\{/g) || []).length, (css.match(/\}/g) || []).length, 'style.css braces must be balanced');

  // #1 CSS double-insurance
  assert.ok(css.includes('&>div:first-child:not([data-split-overlaid="true"]){min-width:min(332px,46%) !important;}'));
  assert.ok(css.includes('&>div:last-child:not([data-split-overlaid="true"]){max-width:calc(100% - min(332px,46%) - 1px) !important;}'));

  // 2-3 dead logoInk settings brand rect/stroke rules removed, mono grayscale preserved
  assert.equal(css.includes('.ag-cs-settings-brand-mark svg) path:nth-of-type(n+2)'), false, 'Dead brand SVG path stroke rule must be removed');
  assert.equal(css.includes('.ag-cs-settings-brand-mark svg){& rect{'), false, 'Dead brand SVG rect fill rule must be removed');
  assert.ok(
    css.includes(':is(.ag-cs-settings-brand-svg,.ag-cs-settings-brand-mark svg){filter:grayscale(1);}'),
    'accentTone=mono must apply grayscale(1) to settings brand SVG'
  );

  // 2-1A i18n-locales.js 8-locale setTargetFpsDesc check + yue->zh-CN migration
  const i18nCore = require(path.join(ROOT, 'i18n-core.js'));
  const locales = require(path.join(ROOT, 'i18n-locales.js'));
  for (const lang of ['zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'es', 'fr', 'de']) {
    const desc = locales.getUiStrings(lang).setTargetFpsDesc;
    assert.ok(typeof desc === 'string' && desc.length >= 20, `${lang} setTargetFpsDesc must be non-empty`);
  }
  assert.ok(locales.getUiStrings('zh-CN').setTargetFpsDesc.includes('水晶条/药水瓶'));
  assert.ok(locales.getUiStrings('zh-TW').setTargetFpsDesc.includes('水晶條/藥水瓶'));
  assert.equal(i18nCore.normalizeLanguage('yue'), 'zh-CN');
  assert.equal(locales.getRuntimeUiSlice('yue').lang, 'zh-CN');
  assert.ok(locales.getUiStrings(i18nCore.normalizeLanguage('yue')).setTargetFpsDesc.includes('水晶条/药水瓶'));
  assert.ok(/crystal bar.*vial/i.test(locales.getUiStrings('en').setTargetFpsDesc));
  assert.ok(locales.getUiStrings('ja').setTargetFpsDesc.includes('クリスタル/バイアル'));
  assert.ok(locales.getUiStrings('ko').setTargetFpsDesc.includes('바이알'));
  assert.ok(locales.getUiStrings('es').setTargetFpsDesc.includes('barra de cristal'));
  assert.ok(locales.getUiStrings('fr').setTargetFpsDesc.includes('barre cristal'));
  assert.ok(locales.getUiStrings('de').setTargetFpsDesc.includes('Phiole'));

  // Channel 1 budget check (< 550,000 B after Ch9/Ch10 split)
  const cdp = require(path.join(ROOT, 'cdp.js'));
  const expr = cdp.buildInjectExpression(cdp.DEFAULT_CONFIG);
  const bytes = Buffer.byteLength(expr, 'utf8');
  assert.ok(bytes < 580000, `Channel 1 bundle must stay < 580,000 B, got ${bytes} B`);
});

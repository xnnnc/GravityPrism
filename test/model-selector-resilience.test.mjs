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

globalThis.__agCodexEffortSliderDisableAutoBoot = true;
const upstreamLib = require('../vendor/effort-slider/upstream-client.js');
const sliderCoexist = require('../vendor/effort-slider/slider-coexist.js');
const mgc = require('../model-glyph-crystal.js');
const cdp = require('../cdp.js');

/**
 * 构建支持 CSS 复合选择器、classList、捕获/冒泡事件分发与 React Fiber 挂载的轻量仿真 DOM。
 */
function createSimEnv(options = {}) {
  const listenersByNode = new WeakMap();
  const winListeners = new Map();
  let fakeNow = 1000;
  let rafSeq = 0;
  const rafQueue = [];

  function makeClassList(el) {
    const tokens = () => String(el.className || '').trim().split(/\s+/).filter(Boolean);
    return {
      add(...cls) {
        const s = new Set(tokens());
        cls.forEach((c) => c && s.add(c));
        el.className = Array.from(s).join(' ');
      },
      remove(...cls) {
        const drop = new Set(cls);
        el.className = tokens().filter((c) => !drop.has(c)).join(' ');
      },
      contains(c) {
        return tokens().includes(c);
      },
      toggle(c, force) {
        const has = tokens().includes(c);
        const on = force === undefined ? !has : Boolean(force);
        if (on) this.add(c);
        else this.remove(c);
        return on;
      },
    };
  }

  function matchSimple(node, sel) {
    if (!node || node.nodeType !== 1) return false;
    let rest = sel.trim();
    if (!rest) return false;
    // tag prefix
    const tagM = rest.match(/^([a-zA-Z0-9_-]+)/);
    if (tagM) {
      if (node.tagName !== tagM[1].toUpperCase()) return false;
      rest = rest.slice(tagM[0].length);
    }
    while (rest.length > 0) {
      if (rest[0] === '#') {
        const m = rest.match(/^#([a-zA-Z0-9_-]+)/);
        if (!m || node.id !== m[1]) return false;
        rest = rest.slice(m[0].length);
      } else if (rest[0] === '.') {
        const m = rest.match(/^\.([a-zA-Z0-9_-]+)/);
        if (!m || !node.classList.contains(m[1])) return false;
        rest = rest.slice(m[0].length);
      } else if (rest[0] === '[') {
        const m = rest.match(/^\[([a-zA-Z0-9_-]+)(?:(\^?=)"([^"]*)")?\]/);
        if (!m) return false;
        const val = node.getAttribute(m[1]);
        if (val === null) return false;
        if (m[2] === '=' && val !== m[3]) return false;
        if (m[2] === '^=' && !val.startsWith(m[3])) return false;
        rest = rest.slice(m[0].length);
      } else {
        return false;
      }
    }
    return true;
  }

  function matchesSelector(node, selectorList) {
    return String(selectorList)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .some((sel) => matchSimple(node, sel));
  }

  function makeEl(tag, opts = {}) {
    const attrs = new Map();
    const styleProps = new Map();
    const listeners = { capture: new Map(), bubble: new Map() };
    const el = {
      nodeType: 1,
      tagName: String(tag).toUpperCase(),
      children: [],
      childNodes: [],
      parentNode: null,
      parentElement: null,
      isConnected: true,
      hidden: false,
      className: opts.className || '',
      _text: opts.text || '',
      _visible: opts.visible !== false,
      style: {
        setProperty(k, v) { styleProps.set(k, String(v)); },
        getPropertyValue(k) { return styleProps.get(k) || ''; },
        removeProperty(k) { styleProps.delete(k); },
        get color() { return styleProps.get('color') || ''; },
        set color(v) { if (v) styleProps.set('color', String(v)); else styleProps.delete('color'); },
        get opacity() { return styleProps.get('opacity') || ''; },
        set opacity(v) { if (v) styleProps.set('opacity', String(v)); else styleProps.delete('opacity'); },
        get fontWeight() { return styleProps.get('fontWeight') || ''; },
        set fontWeight(v) { if (v) styleProps.set('fontWeight', String(v)); else styleProps.delete('fontWeight'); },
        get display() { return styleProps.get('display') || ''; },
        set display(v) { if (v) styleProps.set('display', String(v)); else styleProps.delete('display'); },
        get width() { return styleProps.get('width') || ''; },
        set width(v) { styleProps.set('width', String(v)); },
        get left() { return styleProps.get('left') || ''; },
        set left(v) { styleProps.set('left', String(v)); },
        get background() { return styleProps.get('background') || ''; },
        set background(v) { styleProps.set('background', String(v)); },
      },
      get id() { return attrs.get('id') || ''; },
      set id(v) { attrs.set('id', String(v)); },
      get firstChild() { return el.childNodes[0] || null; },
      get firstElementChild() { return el.children[0] || null; },
      get nextSibling() {
        if (!el.parentNode) return null;
        const arr = el.parentNode.childNodes;
        const idx = arr.indexOf(el);
        return idx >= 0 ? arr[idx + 1] || null : null;
      },
      get nextElementSibling() {
        if (!el.parentNode) return null;
        const arr = el.parentNode.children;
        const idx = arr.indexOf(el);
        return idx >= 0 ? arr[idx + 1] || null : null;
      },
      get textContent() {
        if (el.childNodes.length === 0) return el._text;
        return el.childNodes.map((c) => (c.nodeType === 3 ? c.nodeValue : c.textContent)).join('');
      },
      set textContent(v) {
        el._text = String(v ?? '');
        el.children = [];
        el.childNodes = [];
      },
      get innerHTML() { return el._innerHTML || ''; },
      set innerHTML(v) {
        el._innerHTML = String(v || '');
        if (!v) { el.children = []; el.childNodes = []; el._text = ''; }
      },
      setAttribute(k, v) { attrs.set(k, String(v)); },
      getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
      hasAttribute(k) { return attrs.has(k); },
      removeAttribute(k) { attrs.delete(k); },
      checkVisibility() { return el._visible; },
      getBoundingClientRect() { return { left: 0, top: 0, width: 220, height: 28, right: 220, bottom: 28 }; },
      blur() {},
      focus() {},
      appendChild(child) {
        if (child.parentNode) child.parentNode.removeChild(child);
        child.parentNode = el;
        child.parentElement = el;
        child.isConnected = el.isConnected;
        el.childNodes.push(child);
        if (child.nodeType === 1) el.children.push(child);
        return child;
      },
      insertBefore(child, ref) {
        if (!ref) return el.appendChild(child);
        if (child.parentNode) child.parentNode.removeChild(child);
        child.parentNode = el;
        child.parentElement = el;
        child.isConnected = el.isConnected;
        const cnIdx = el.childNodes.indexOf(ref);
        if (cnIdx >= 0) el.childNodes.splice(cnIdx, 0, child);
        else el.childNodes.push(child);
        if (child.nodeType === 1) {
          el.children = el.childNodes.filter((n) => n.nodeType === 1);
        }
        return child;
      },
      removeChild(child) {
        const ci = el.childNodes.indexOf(child);
        if (ci >= 0) el.childNodes.splice(ci, 1);
        const ei = el.children.indexOf(child);
        if (ei >= 0) el.children.splice(ei, 1);
        child.parentNode = null;
        child.parentElement = null;
        child.isConnected = false;
        return child;
      },
      remove() { if (el.parentNode) el.parentNode.removeChild(el); },
      contains(other) {
        let cur = other;
        while (cur) {
          if (cur === el) return true;
          cur = cur.parentNode;
        }
        return false;
      },
      closest(sel) {
        let cur = el;
        while (cur && cur.nodeType === 1) {
          if (matchesSelector(cur, sel)) return cur;
          cur = cur.parentElement;
        }
        return null;
      },
      querySelector(sel) { return el.querySelectorAll(sel)[0] || null; },
      querySelectorAll(sel) {
        const out = [];
        const walk = (n) => {
          for (const c of n.children || []) {
            if (matchesSelector(c, sel)) out.push(c);
            walk(c);
          }
        };
        walk(el);
        return out;
      },
      addEventListener(type, fn, useCapture) {
        const bucket = useCapture ? listeners.capture : listeners.bubble;
        if (!bucket.has(type)) bucket.set(type, []);
        bucket.get(type).push(fn);
      },
      removeEventListener(type, fn, useCapture) {
        const bucket = useCapture ? listeners.capture : listeners.bubble;
        const arr = bucket.get(type);
        if (!arr) return;
        const idx = arr.indexOf(fn);
        if (idx >= 0) arr.splice(idx, 1);
      },
      dispatchEvent(ev) {
        const pathNodes = [];
        let cur = el;
        while (cur) {
          pathNodes.unshift(cur);
          cur = cur.parentElement;
        }
        ev.target = el;
        ev.defaultPrevented = false;
        ev._stopped = false;
        ev._immStopped = false;
        ev.preventDefault = () => { ev.defaultPrevented = true; };
        ev.stopPropagation = () => { ev._stopped = true; };
        ev.stopImmediatePropagation = () => { ev._stopped = true; ev._immStopped = true; };
        for (const node of pathNodes) {
          const ls = listenersByNode.get(node);
          const fns = ls ? [...(ls.capture.get(ev.type) || [])] : [];
          for (const fn of fns) {
            if (ev._immStopped) break;
            fn(ev);
          }
          if (ev._stopped) return !ev.defaultPrevented;
        }
        for (let i = pathNodes.length - 1; i >= 0; i--) {
          const node = pathNodes[i];
          const ls = listenersByNode.get(node);
          const fns = ls ? [...(ls.bubble.get(ev.type) || [])] : [];
          for (const fn of fns) {
            if (ev._immStopped) break;
            fn(ev);
          }
          if (ev._stopped) return !ev.defaultPrevented;
        }
        return !ev.defaultPrevented;
      },
    };
    el.classList = makeClassList(el);
    listenersByNode.set(el, listeners);
    if (opts.attrs) {
      for (const [k, v] of Object.entries(opts.attrs)) el.setAttribute(k, v);
    }
    return el;
  }

  function makeText(v) {
    return { nodeType: 3, nodeValue: String(v), parentNode: null, parentElement: null };
  }

  const html = makeEl('html');
  const head = makeEl('head');
  const body = makeEl('body');
  html.appendChild(head);
  html.appendChild(body);

  let lsGets = 0;
  const lsMap = new Map();
  const localStorage = {
    getItem(k) { lsGets += 1; return lsMap.has(k) ? lsMap.get(k) : null; },
    setItem(k, v) { lsMap.set(k, String(v)); },
    removeItem(k) { lsMap.delete(k); },
    get _getCount() { return lsGets; },
  };

  const observers = [];
  class FakeMO {
    constructor(cb) {
      this.cb = cb;
      this.records = [];
      observers.push(this);
    }
    observe() {}
    disconnect() { this.records = []; }
    takeRecords() { const r = this.records.slice(); this.records = []; return r; }
    trigger(recs) { this.cb(recs, this); }
  }

  const doc = {
    documentElement: html,
    head,
    body,
    hidden: false,
    activeElement: null,
    createElement: (t) => makeEl(t),
    createTextNode: (v) => makeText(v),
    getElementById: (id) => html.querySelector(`#${id}`),
    querySelector: (s) => html.querySelector(s),
    querySelectorAll: (s) => html.querySelectorAll(s),
    addEventListener(t, fn, c) { html.addEventListener(t, fn, c); },
    removeEventListener(t, fn, c) { html.removeEventListener(t, fn, c); },
  };

  const win = {
    document: doc,
    localStorage,
    MutationObserver: FakeMO,
    performance: { now: () => fakeNow },
    requestAnimationFrame(cb) {
      const id = ++rafSeq;
      rafQueue.push({ id, cb });
      return id;
    },
    cancelAnimationFrame(id) {
      const idx = rafQueue.findIndex((r) => r.id === id);
      if (idx >= 0) rafQueue.splice(idx, 1);
    },
    getComputedStyle: () => ({ backgroundColor: 'rgb(14, 14, 18)' }),
    matchMedia: () => ({ matches: false }),
    Event: class { constructor(t) { this.type = t; } },
    CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } },
    addEventListener(t, fn) {
      if (!winListeners.has(t)) winListeners.set(t, []);
      winListeners.get(t).push(fn);
    },
    removeEventListener(t, fn) {
      const arr = winListeners.get(t);
      if (!arr) return;
      const idx = arr.indexOf(fn);
      if (idx >= 0) arr.splice(idx, 1);
    },
    dispatchEvent(ev) {
      for (const fn of [...(winListeners.get(ev.type) || [])]) fn(ev);
    },
    __agCodexEffortSliderDisableAutoBoot: true,
    setTimeout,
    clearTimeout,
  };
  doc.defaultView = win;

  function makeTrigger(labelText, effortText = '') {
    const btn = makeEl('button', { attrs: { 'data-testid': 'model-selector-trigger', 'aria-label': `Select model, current: ${labelText}` } });
    const outer = makeEl('span', { className: 'min-w-0' });
    outer.appendChild(makeText(labelText));
    if (effortText) {
      const sp = makeEl('span', { className: 'opacity-70', text: ` ${effortText}` });
      outer.appendChild(sp);
    }
    btn.appendChild(outer);
    return btn;
  }

  function makePanel() {
    const panel = makeEl('div', { attrs: { 'data-testid': 'model-selector-panel' } });
    const listWrap = makeEl('div');
    panel.appendChild(listWrap);
    return { panel, listWrap };
  }

  function addGroupRow(listWrap, baseName, effortLabel) {
    const mi = makeEl('div', { attrs: { role: 'menuitem' }, className: 'agy-overlay-item text-secondary-foreground' });
    const gs = makeEl('span', { attrs: { 'data-testid': 'model-selector-effort-group', 'data-model-base': baseName }, text: baseName });
    const eff = makeEl('span', { text: effortLabel });
    mi.appendChild(gs);
    mi.appendChild(eff);
    listWrap.appendChild(mi);
    return { row: mi, groupSpan: gs, effortSpan: eff };
  }

  function addSingleRow(listWrap, label, omitAttr = false) {
    const attrs = { 'data-testid': 'model-selector-item' };
    if (!omitAttr) attrs['data-model-label'] = label;
    const row = makeEl('div', { attrs, text: label });
    listWrap.appendChild(row);
    return row;
  }

  function attachFiberChain(el, { selectorCtx, popoverProps, convId, globalModelCtx }) {
    const chain = [];
    if (selectorCtx) chain.push({ memoizedProps: { value: selectorCtx } });
    if (popoverProps) chain.push({ memoizedProps: popoverProps });
    if (convId !== undefined) chain.push({ memoizedProps: { conversationId: convId, placement: 'top-start' } });
    if (globalModelCtx) chain.push({ memoizedProps: { value: globalModelCtx } });
    for (let i = 0; i < chain.length - 1; i++) chain[i].return = chain[i + 1];
    el.__reactFiber$test = chain[0] || null;
  }

  function simulateNativeClick(target, nativeOnClick) {
    const pu = { type: 'pointerup', button: 0, bubbles: true };
    const mu = { type: 'mouseup', button: 0, bubbles: true };
    const ck = { type: 'click', button: 0, bubbles: true };
    const host = target.closest('[data-testid="model-selector-panel"],[role="menu"],[role="listbox"],.agy-overlay');
    let nativeCalled = false;
    const handler = (ev) => {
      nativeCalled = true;
      if (typeof nativeOnClick === 'function') nativeOnClick(ev);
    };
    if (host) host.addEventListener('click', handler, false);
    target.dispatchEvent(pu);
    target.dispatchEvent(mu);
    target.dispatchEvent(ck);
    if (host) host.removeEventListener('click', handler, false);
    return { pu, mu, ck, nativeCalled };
  }

  return {
    html, head, body, doc, win, localStorage, observers, rafQueue,
    makeEl, makeText, makeTrigger, makePanel, addGroupRow, addSingleRow, attachFiberChain, simulateNativeClick,
    advanceRaf() {
      const batch = rafQueue.splice(0, rafQueue.length);
      fakeNow += 16;
      for (const item of batch) item.cb(fakeNow);
      return batch.length;
    },
  };
}

test('Scenario 1 (Jio / 普通会员): 3.8 Flash 4档(含Minimal)联动保活，Claude (Thinking)/GPT-OSS/二次点击100%放行关闭菜单', () => {
  const env = createSimEnv();
  const flashMin = { label: 'Gemini 3.8 Flash (Minimal)', modelId: 'gemini-3.8-flash-minimal', value: 1317 };
  const flashLow = { label: 'Gemini 3.8 Flash (Low)', modelId: 'gemini-3.8-flash-low', value: 1320 };
  const flashMed = { label: 'Gemini 3.8 Flash (Medium)', modelId: 'gemini-3.8-flash-medium', value: 1319 };
  const flashHigh = { label: 'Gemini 3.8 Flash (High)', modelId: 'gemini-3.8-flash-high', value: 1318 };
  const claudeSon = { label: 'Claude Sonnet 4.6 (Thinking)', modelId: 'claude-sonnet-4-6-thinking', value: 1410 };
  const claudeOpus = { label: 'Claude Opus 4.6 (Thinking)', modelId: 'claude-opus-4-6-thinking', value: 1411 };
  const gptOss = { label: 'GPT-OSS 120B (Medium)', modelId: 'gpt-oss-120b-medium', value: 342 };

  const modelOptions = [flashMin, flashLow, flashMed, flashHigh, claudeSon, claudeOpus, gptOss];
  let selectedModel = claudeSon;
  let isOpen = true;
  const committed = [];

  const selectorCtx = {
    effortIndex: new Map([['gemini-3.8-flash', new Map([['minimal', flashMin], ['low', flashLow], ['medium', flashMed], ['high', flashHigh]])]]),
    modelOptions,
    get selectedModel() { return selectedModel; },
  };
  const popoverProps = {
    modelOptions,
    get selectedModel() { return selectedModel; },
    get open() { return isOpen; },
    setIsOpen(v) { isOpen = Boolean(v); },
    setSelectedModel(opt) { selectedModel = opt; isOpen = false; },
  };
  const globalModelCtx = {
    setModelConfigByLabelForConversation(label, convId, keepOpen) {
      committed.push({ label, convId, keepOpen });
      selectedModel = modelOptions.find((o) => o.label === label) || selectedModel;
    },
  };

  const trigger = env.makeTrigger('Claude Sonnet 4.6 (Thinking)');
  env.body.appendChild(trigger);
  const { panel, listWrap } = env.makePanel();
  const flashRow = env.addGroupRow(listWrap, 'Gemini 3.8 Flash', 'Medium');
  const sonRow = env.addSingleRow(listWrap, claudeSon.label);
  const opusRow = env.addSingleRow(listWrap, claudeOpus.label);
  const gptRow = env.addSingleRow(listWrap, gptOss.label);
  env.body.appendChild(panel);
  env.attachFiberChain(panel, { selectorCtx, popoverProps, convId: 'conv-jio', globalModelCtx });

  const agObs = upstreamLib.installAntigravityObserver({ document: env.doc, window: env.win, MutationObserver: env.win.MutationObserver });
  assert.equal(env.html.getAttribute('data-ces-slider-ready'), '1', 'Valid ctx + open panel must set data-ces-slider-ready="1"');
  assert.ok(panel.querySelector('.ces-ag-section'), 'Must mount effort slider section');

  // 1) 从 Claude Sonnet 4.6 (Thinking) 点击切换到 Gemini 3.8 Flash -> 拦截保持菜单常开，下方滑条联动为 4 档 (Minimal..High)
  const resSwitch = env.simulateNativeClick(flashRow.groupSpan, () => { isOpen = false; });
  assert.equal(resSwitch.pu._stopped, true);
  assert.equal(resSwitch.ck.defaultPrevented, true);
  assert.equal(resSwitch.nativeCalled, false, 'Switching to a new tunable multi-effort model must keep menu open');
  assert.equal(isOpen, true);
  assert.equal(committed.length, 1);
  assert.equal(committed[0].label, 'Gemini 3.8 Flash (Medium)');
  assert.equal(panel.querySelectorAll('.ces-tick').length, 4, '3.8 Flash must show 4 ticks (Minimal/Low/Medium/High)');

  // 键盘切到 Minimal 档验证联动
  const sliderRoot = panel.querySelector('.ces-root');
  sliderRoot.dispatchEvent({ type: 'keydown', key: 'Home' });
  assert.equal(selectedModel.label, 'Gemini 3.8 Flash (Minimal)');
  assert.equal(panel.querySelector('.ces-ag-effort-value').textContent, 'Minimal');

  // 2) 再次点击当前已选中的 Gemini 3.8 Flash -> 100% 放行原生事件让菜单关闭
  const resSecond = env.simulateNativeClick(flashRow.groupSpan, () => { isOpen = false; });
  assert.equal(resSecond.pu._stopped, false);
  assert.equal(resSecond.ck.defaultPrevented, false);
  assert.equal(resSecond.nativeCalled, true, 'Re-clicking already-selected model must pass through to close menu');
  assert.equal(isOpen, false);

  // 3) 重新打开菜单并点击 Claude Opus 4.6 (Thinking) 与 GPT-OSS 120B (Medium) -> 100% 放行原生关闭
  isOpen = true;
  for (const singleRow of [opusRow, gptRow, sonRow]) {
    isOpen = true;
    const r = env.simulateNativeClick(singleRow, () => { isOpen = false; });
    assert.equal(r.pu._stopped, false, `pointerup must pass through for ${singleRow.getAttribute('data-model-label')}`);
    assert.equal(r.mu._stopped, false);
    assert.equal(r.ck.defaultPrevented, false);
    assert.equal(r.nativeCalled, true);
    assert.equal(isOpen, false);
  }

  // 4) 面板关闭后 data-ces-slider-ready 立刻清除
  panel.remove();
  agObs.rescan();
  assert.equal(env.html.hasAttribute('data-ces-slider-ready'), false);
  agObs.stop();
});


test('Scenario 2 (Ultra 20x + v2.34.0): slug effortIndex + 无 eKa.Provider + 可调 Orchestrator 全链路正常', () => {
  const env = createSimEnv();
  const neonLow = { label: 'Gemini 4 Neon (Low)', modelId: 'gemini-4-neon-low', value: 1534 };
  const neonMed = { label: 'Gemini 4 Neon (Medium)', modelId: 'gemini-4-neon-medium', value: 1533 };
  const neonHigh = { label: 'Gemini 4 Neon (High)', modelId: 'gemini-4-neon-high', value: 1532 };
  const neonXHigh = { label: 'Gemini 4 Neon (XHigh)', modelId: 'gemini-4-neon-xhigh', value: 1535 };
  const opusLow = { label: 'Claude Opus 5.5 (Low)', modelId: 'claude-opus-5-5-low', value: 1400 };
  const opusHigh = { label: 'Claude Opus 5.5 (High)', modelId: 'claude-opus-5-5-high', value: 1402 };
  const orchNeon = { label: 'Orchestrator (Neon)', modelId: 'gemini-pro-orchestrator-neon', value: 1537 };

  const planners = [neonLow, neonMed, neonHigh, neonXHigh];
  const modelOptions = [...planners, opusLow, opusHigh, orchNeon];
  let selectedModel = orchNeon;
  let isOpen = true;
  const orchSelectCalls = [];
  const unwrappedCalls = [];

  const selectorCtx = {
    effortIndex: new Map([
      ['gemini-4-neon', new Map([['low', neonLow], ['medium', neonMed], ['high', neonHigh], ['xhigh', neonXHigh]])],
      ['claude-opus-5-5', new Map([['low', opusLow], ['high', opusHigh]])],
    ]),
    modelOptions,
    get selectedModel() { return selectedModel; },
    orchestratorPlanners: planners,
    orchestratorPlannerIndex: new Map([['gemini-4-neon', new Map([['low', neonLow], ['medium', neonMed], ['high', neonHigh], ['xhigh', neonXHigh]])]]),
    orchestratorDefaultPlanner: neonXHigh,
    orchestratorPick: {
      model: null,
      select(v) { orchSelectCalls.push(v); this.model = v === 0 ? null : v; },
    },
  };
  const popoverProps = {
    modelOptions,
    get selectedModel() { return selectedModel; },
    get open() { return isOpen; },
    setIsOpen(v) { isOpen = Boolean(v); },
    setSelectedModel(opt) { unwrappedCalls.push(opt.label); selectedModel = opt; },
  };

  const trigger = env.makeTrigger('Orchestrator');
  env.body.appendChild(trigger);
  const { panel, listWrap } = env.makePanel();
  const orchRow = env.makeEl('div', { attrs: { role: 'menuitem', 'data-testid': 'model-selector-orchestrator' }, text: 'Orchestrator' });
  listWrap.appendChild(orchRow);
  const opusRow = env.addGroupRow(listWrap, 'Claude Opus 5.5', 'High');
  env.body.appendChild(panel);
  env.attachFiberChain(panel, { selectorCtx, popoverProps, convId: 'conv-ultra' }); // 无 globalModelCtx (无 eKa.Provider)

  const agObs = upstreamLib.installAntigravityObserver({ document: env.doc, window: env.win, MutationObserver: env.win.MutationObserver });
  assert.equal(env.html.getAttribute('data-ces-slider-ready'), '1');
  assert.equal(panel.getAttribute('data-ces-orch-tunable'), 'true');

  // 拖动/按键调整 Orchestrator planner 档位
  const sliderRoot = panel.querySelector('.ces-root');
  sliderRoot.dispatchEvent({ type: 'keydown', key: 'Home' });
  assert.equal(orchSelectCalls[0], neonLow.value, 'Orchestrator slider must invoke orchestratorPick.select');

  // 点击 Orchestrator 行本身不吞原生事件
  const rOrch = env.simulateNativeClick(orchRow, () => { isOpen = false; });
  assert.equal(rOrch.ck.defaultPrevented, false);
  assert.equal(rOrch.nativeCalled, true);

  // 点击新多档 Claude Opus 5.5 -> 降级走 unwrappedSetSelectedModel 并保持菜单常开
  isOpen = true;
  const rOpus = env.simulateNativeClick(opusRow.groupSpan);
  assert.equal(rOpus.ck.defaultPrevented, true);
  assert.deepEqual(unwrappedCalls, ['Claude Opus 5.5 (Low)']);
  assert.equal(selectedModel.label, 'Claude Opus 5.5 (Low)');
  assert.equal(isOpen, true);

  panel.remove();
  agObs.rescan();
  assert.equal(env.html.hasAttribute('data-ces-slider-ready'), false);
  agObs.stop();
});


test('Scenario 3 (Antigravity v2.33 旧版): 展示名键 + eKa.Provider 提交正常，且提交失败时严格 Fail-Open', () => {
  const env = createSimEnv();
  const hLow = { label: 'Gemini 4 Hydrogen (Low)', modelId: 'h-low', value: 1 };
  const hHigh = { label: 'Gemini 4 Hydrogen (High)', modelId: 'h-high', value: 2 };
  const cLow = { label: 'Claude 4.5 (Low)', modelId: 'c-low', value: 3 };
  const cHigh = { label: 'Claude 4.5 (High)', modelId: 'c-high', value: 4 };
  let selectedModel = hLow;
  let shouldFailCommit = false;
  const commits = [];

  const selectorCtx = {
    effortIndex: new Map([
      ['Gemini 4 Hydrogen', new Map([['low', hLow], ['high', hHigh]])],
      ['Claude 4.5', new Map([['low', cLow], ['high', cHigh]])],
    ]),
    modelOptions: [hLow, hHigh, cLow, cHigh],
    get selectedModel() { return selectedModel; },
  };
  const globalModelCtx = {
    setModelConfigByLabelForConversation(label, convId, keepOpen) {
      if (shouldFailCommit) throw new Error('boom');
      commits.push({ label, convId, keepOpen });
      selectedModel = selectorCtx.modelOptions.find((o) => o.label === label) || selectedModel;
    },
  };

  const trigger = env.makeTrigger('Gemini 4 Hydrogen', 'Low');
  env.body.appendChild(trigger);
  const { panel, listWrap } = env.makePanel();
  const cRow = env.addGroupRow(listWrap, 'Claude 4.5', 'High');
  env.body.appendChild(panel);
  env.attachFiberChain(panel, { selectorCtx, convId: 'conv-233', globalModelCtx });

  const agObs = upstreamLib.installAntigravityObserver({ document: env.doc, window: env.win, MutationObserver: env.win.MutationObserver });
  const rOk = env.simulateNativeClick(cRow.groupSpan);
  assert.equal(rOk.ck.defaultPrevented, true);
  assert.equal(commits.length, 1);
  assert.equal(commits[0].keepOpen, true);

  // 模拟提交失败 -> 切换到另一个未选中行时必须 Fail-Open 放行给原生点击
  shouldFailCommit = true;
  const hRow = env.addGroupRow(listWrap, 'Gemini 4 Hydrogen', 'Low');
  const rFail = env.simulateNativeClick(hRow.groupSpan);
  assert.equal(rFail.ck.defaultPrevented, false, 'Failed _commitAgOpt must NOT swallow click');
  assert.equal(rFail.nativeCalled, true, 'Failed _commitAgOpt must fall through to native click');
  agObs.stop();
});


test('Scenario 4 (未知老版 / 未来新版 Fiber 失效): 零挂载、不设 data-ces-slider-ready、点击 0 拦截 100% 透传', () => {
  const env = createSimEnv();
  const trigger = env.makeTrigger('Unknown Model');
  env.body.appendChild(trigger);
  const { panel, listWrap } = env.makePanel();
  const gRow = env.addGroupRow(listWrap, 'Future Model X', 'High');
  const sRow = env.addSingleRow(listWrap, 'Future Model Y');
  env.body.appendChild(panel);
  // 刻意不挂任何 __reactFiber$

  const agObs = upstreamLib.installAntigravityObserver({ document: env.doc, window: env.win, MutationObserver: env.win.MutationObserver });
  assert.equal(env.html.hasAttribute('data-ces-slider-ready'), false, 'Native submenu CSS must remain unhidden when Fiber ctx is null');
  assert.equal(panel.querySelector('.ces-ag-section'), null, 'Must not mount broken slider section when ctx is null');

  for (const target of [gRow.groupSpan, sRow]) {
    const res = env.simulateNativeClick(target);
    assert.equal(res.pu._stopped, false);
    assert.equal(res.mu._stopped, false);
    assert.equal(res.ck.defaultPrevented, false);
    assert.equal(res.ck._stopped, false);
    assert.equal(res.nativeCalled, true);
  }
  agObs.stop();
});


test('Scenario 5 (多触发器分屏 + 自定义模型 + 双 Observer 防互激 + 体积红线): 全部契约达成', async () => {
  const env = createSimEnv();

  // 1) 多触发器分屏：子代理触发器在前且被包裹在 [data-testid="subagent-tab-conversation"]，主触发器在后；panel 自带独立 Fiber
  const subWrap = env.makeEl('div', { attrs: { 'data-testid': 'subagent-tab-conversation' } });
  const subTrigger = env.makeTrigger('Subagent Old Model');
  subWrap.appendChild(subTrigger);
  env.body.appendChild(subWrap);

  const mainTrigger = env.makeTrigger('Main Model');
  env.body.appendChild(mainTrigger);
  const pickedTrig = upstreamLib.findAntigravityTrigger(env.doc);
  assert.equal(pickedTrig, mainTrigger, 'findAntigravityTrigger must skip subagent-tab-conversation trigger');

  // panel 拥有与 mainTrigger 不同的独立 Fiber 上下文，验证 getLiveContext 优先读取 panel
  const fLow = { label: 'Gemini 3.8 Flash (Low)', modelId: 'f-low', value: 10 };
  const fHigh = { label: 'Gemini 3.8 Flash (High)', modelId: 'f-high', value: 11 };
  const customOpt = { label: 'My Custom Endpoint', modelId: 'custom-1', isCustom: true, value: 99 };
  env.attachFiberChain(mainTrigger, {
    selectorCtx: { effortIndex: new Map(), modelOptions: [customOpt], selectedModel: customOpt },
    globalModelCtx: { setModelConfigByLabelForConversation() {} },
  });
  const { panel, listWrap } = env.makePanel();
  const flashRow = env.addGroupRow(listWrap, 'Gemini 3.8 Flash', 'Low');
  const customRow = env.addSingleRow(listWrap, 'My Custom Endpoint', true); // 缺失 data-model-label
  env.body.appendChild(panel);
  let activeModel = customOpt;
  env.attachFiberChain(panel, {
    selectorCtx: {
      effortIndex: new Map([['gemini-3.8-flash', new Map([['low', fLow], ['high', fHigh]])]]),
      modelOptions: [fLow, fHigh, customOpt],
      get selectedModel() { return activeModel; },
    },
    globalModelCtx: {
      setModelConfigByLabelForConversation(l) { activeModel = l === fHigh.label ? fHigh : fLow; },
    },
  });

  // 2) 通过 slider-coexist 启动，验证菜单打开期间 0ms 首开 + 32ms 合并节流
  const ctl = sliderCoexist.createEffortSliderController({ window: env.win, document: env.doc });
  ctl.sync({ effortSliderModule: 'on' });
  assert.equal(env.html.getAttribute('data-ces-slider-ready'), '1');

  // 自定义模型 & 缺失 data-model-label 行 -> 100% 放行原生点击不吞死，且选中态回退匹配文本生效
  assert.equal(customRow.getAttribute('data-ces-model-selected'), 'true');
  const rCustom = env.simulateNativeClick(customRow);
  assert.equal(rCustom.ck.defaultPrevented, false);
  assert.equal(rCustom.nativeCalled, true);

  // 触发 50 次高频 DOM mutation（含 panel 内变化 + 被忽略的 glyph/caret 节点）-> 32ms 合并窗口内节流
  const mo = env.observers[0];
  const baseScans = ctl.getState().perfStats.executedScans;
  const glyphNode = env.makeEl('span', { className: 'ag-cs-panel-row-glyph' });
  panel.appendChild(glyphNode);
  for (let i = 0; i < 20; i++) mo.trigger([{ type: 'childList', target: glyphNode, addedNodes: [] }]);
  assert.equal(ctl.getState().perfStats.executedScans, baseScans, 'Ignored glyph mutations must execute 0 scans');

  for (let i = 0; i < 30; i++) mo.trigger([{ type: 'childList', target: flashRow.row, addedNodes: [] }]);
  const afterImmediate = ctl.getState().perfStats.executedScans;
  assert.ok(afterImmediate <= baseScans + 1, `Expected at most 1 immediate scan on open, got ${afterImmediate - baseScans}`);
  await new Promise((r) => setTimeout(r, 60));
  const afterWindow = ctl.getState().perfStats.executedScans;
  assert.ok(afterWindow <= baseScans + 2, `30 burst mutations inside open menu must coalesce into <=2 scans, got ${afterWindow - baseScans}`);

  // 2b) 菜单刚从 DOM 移除时（仅触发外层 body childList），节流器必须立即放行一次 flush 清理 data-ces-slider-ready
  assert.equal(env.html.getAttribute('data-ces-slider-ready'), '1', 'data-ces-slider-ready must be 1 while panel is mounted');
  panel.remove();
  mo.trigger([{ type: 'childList', target: env.body, addedNodes: [], removedNodes: [panel] }]);
  assert.equal(env.html.hasAttribute('data-ces-slider-ready'), false, 'Closing model panel must immediately clear data-ces-slider-ready without waiting for destroy()');

  // 3) readSettings 内存缓存校验：storage 事件失效后重读 1 次，后续 20 次读取 0 额外 getItem
  const getsBefore = env.localStorage._getCount;
  env.localStorage.setItem('ag.codexEffortSlider.settings.v1', JSON.stringify({ motion: 'fast', ticks: 'highlight' }));
  env.win.dispatchEvent(Object.assign(new env.win.Event('storage'), { key: 'ag.codexEffortSlider.settings.v1' }));
  for (let i = 0; i < 20; i++) {
    assert.equal(upstreamLib.motionMode(env.win, null, env.doc), 'fast');
  }
  assert.equal(env.localStorage._getCount - getsBefore, 1, 'readSettings must cache settings in memory instead of reading localStorage every frame');
  env.localStorage.setItem('ag.codexEffortSlider.settings.v1', JSON.stringify({ motion: 'quick', ticks: 'dim' }));
  env.win.dispatchEvent(Object.assign(new env.win.Event('storage'), { key: 'ag.codexEffortSlider.settings.v1' }));
  assert.equal(upstreamLib.motionMode(env.win, null, env.doc), 'quick', 'storage event must invalidate readSettings cache');
  assert.equal(env.localStorage._getCount - getsBefore, 2);

  // 4) ui-runtime OWN_PLUGIN_SELECTOR & 模型选择器展开保留桌宠交接动画校验
  const uiSrc = fs.readFileSync(path.join(ROOT, 'ui-runtime.js'), 'utf8');
  assert.ok(uiSrc.includes('.ces-ag-section, .ces-set, #ag-codex-effort-slider-styles'));
  assert.equal(uiSrc.includes("document.querySelector?.('[data-testid=\"model-selector-panel\"]')"), false);

  // 5) model-glyph-crystal Orchestrator WebGL2 首帧 rAF 延后挂载与 teardown 取消
  let webglMountCalls = 0;
  const mCtl = mgc.createModelGlyphCrystalController({
    animatedIcons: null,
    crystalPrismCore: {
      mountCrystalPrismBar() {
        webglMountCalls += 1;
        return { step() {}, isIdle: () => true, setPointerClient() {}, setReduceMotion() {}, wake() {}, dispose() {} };
      },
    },
    isDestroyed: () => false,
    isComposerRestyleEnabled: () => true,
    isZh: () => true,
    isDarkTheme: () => true,
    motionReduced: () => false,
    getMinFrameGapMs: () => 0,
    canMountRealCanvas: () => true,
    getLastPointerPos: () => null,
    setAttrIfChanged: (el, k, v) => el.setAttribute(k, v),
  });
  const orchPanelEnv = createSimEnv();
  const { panel: orchPanel, listWrap: orchWrap } = orchPanelEnv.makePanel();
  const orchItem = orchPanelEnv.makeEl('button', { attrs: { 'data-selected': 'true' }, text: 'Orchestrator' });
  orchWrap.appendChild(orchItem);
  orchPanelEnv.body.appendChild(orchPanel);
  const prevDoc = globalThis.document;
  const prevRaf = globalThis.requestAnimationFrame;
  const prevCaf = globalThis.cancelAnimationFrame;
  globalThis.document = orchPanelEnv.doc;
  globalThis.requestAnimationFrame = orchPanelEnv.win.requestAnimationFrame.bind(orchPanelEnv.win);
  globalThis.cancelAnimationFrame = orchPanelEnv.win.cancelAnimationFrame.bind(orchPanelEnv.win);
  try {
    mCtl.syncModelSelectorPanel({ isOrchestrator: true, brand: 'antigravity', tier: 'auto' });
    assert.equal(webglMountCalls, 0, 'First menu open must defer heavy WebGL2 shader compile to next rAF frame');
    mCtl.teardownCrystalMount();
    orchPanelEnv.advanceRaf();
    assert.equal(webglMountCalls, 0, 'teardownCrystalMount must cancel pending mountRafId before rAF fires');
  } finally {
    globalThis.document = prevDoc;
    globalThis.requestAnimationFrame = prevRaf;
    globalThis.cancelAnimationFrame = prevCaf;
  }

  // 6) 体积红线与 REMOVE_EXPRESSION 清理校验
  const expr = cdp.buildInjectExpression(cdp.DEFAULT_CONFIG);
  const bytes = Buffer.byteLength(expr, 'utf8');
  assert.ok(bytes < 690 * 1024, `Default bundle must be strictly < 706,560 B (690 KiB), got ${bytes}`);
  assert.ok(bytes <= 704000, `Default bundle must stay <= 704,000 B, got ${bytes}`);
  const pulseBytes = fs.statSync(path.join(ROOT, 'pulse-vial-bridge.js')).size;
  assert.ok(pulseBytes < 31000, `pulse-vial-bridge.js must stay < 31,000 B, got ${pulseBytes}`);
  assert.ok(cdp.REMOVE_EXPRESSION.includes("'data-ces-slider-ready'"));

  ctl.destroy();
  assert.equal(env.html.hasAttribute('data-ces-slider-ready'), false);
});

test('Scenario 6 (Pro 会员矩阵): 含 Argon/Flash/Claude/GPT-OSS 与只含 Argon 的 Orchestrator（无 Carbon），禁用态模型绝不误提交且 100% Fail-Open', () => {
  const env = createSimEnv();
  const argLow = { label: 'Gemini 4 Argon (Low)', modelId: 'gemini-4-argon-low', value: 1201 };
  const argMed = { label: 'Gemini 4 Argon (Medium)', modelId: 'gemini-4-argon-medium', value: 1202 };
  const argHigh = { label: 'Gemini 4 Argon (High)', modelId: 'gemini-4-argon-high', value: 1203 };
  const flashLow = { label: 'Gemini 3.8 Flash (Low)', modelId: 'gemini-3.8-flash-low', value: 1320 };
  const flashHigh = { label: 'Gemini 3.8 Flash (High)', modelId: 'gemini-3.8-flash-high', value: 1318 };
  const claudeSon = { label: 'Claude Sonnet 4.6 (Thinking)', modelId: 'claude-sonnet-4-6-thinking', value: 1410 };
  const gptOss = { label: 'GPT-OSS 120B (Medium)', modelId: 'gpt-oss-120b-medium', value: 342 };
  const neonLockedLow = { label: 'Gemini 4 Neon (Low)', modelId: 'gemini-4-neon-low', value: 1534, disabled: true };
  const neonLockedHigh = { label: 'Gemini 4 Neon (High)', modelId: 'gemini-4-neon-high', value: 1532, disabled: true };
  const proDisabledLow = { label: 'Gemini 4 Pro Locked (Low)', modelId: 'gemini-4-pro-locked-low', value: 1550 };
  const proDisabledHigh = { label: 'Gemini 4 Pro Locked (High)', modelId: 'gemini-4-pro-locked-high', value: 1551 };
  const orchArgon = { label: 'Orchestrator (Argon)', modelId: 'gemini-pro-orchestrator-argon', value: 1299 };

  const planners = [argLow, argMed, argHigh]; // 只含 Argon（无 Carbon）
  const modelOptions = [
    argLow, argMed, argHigh, flashLow, flashHigh, claudeSon, gptOss,
    neonLockedLow, neonLockedHigh, proDisabledLow, proDisabledHigh, orchArgon,
  ];
  let selectedModel = orchArgon;
  let isOpen = true;
  const commits = [];
  const orchPicks = [];

  const selectorCtx = {
    effortIndex: new Map([
      ['gemini-4-argon', new Map([['low', argLow], ['medium', argMed], ['high', argHigh]])],
      ['gemini-3.8-flash', new Map([['low', flashLow], ['high', flashHigh]])],
      ['gemini-4-neon', new Map([['low', neonLockedLow], ['high', neonLockedHigh]])],
      ['gemini-4-pro-locked', new Map([['low', proDisabledLow], ['high', proDisabledHigh]])],
    ]),
    modelOptions,
    get selectedModel() { return selectedModel; },
    orchestratorPlanners: planners,
    orchestratorPlannerIndex: new Map([['gemini-4-argon', new Map([['low', argLow], ['medium', argMed], ['high', argHigh]])]]),
    orchestratorDefaultPlanner: argMed,
    orchestratorPick: { model: null, select(v) { orchPicks.push(v); this.model = v === 0 ? null : v; } },
  };
  const globalModelCtx = {
    setModelConfigByLabelForConversation(label) {
      commits.push(label);
      selectedModel = modelOptions.find((o) => o.label === label) || selectedModel;
    },
  };

  const trigger = env.makeTrigger('Orchestrator');
  env.body.appendChild(trigger);
  const { panel, listWrap } = env.makePanel();
  const orchRow = env.makeEl('div', { attrs: { role: 'menuitem', 'data-testid': 'model-selector-orchestrator' }, text: 'Orchestrator' });
  listWrap.appendChild(orchRow);
  const argonRow = env.addGroupRow(listWrap, 'Gemini 4 Argon', 'Medium');
  const flashRow = env.addGroupRow(listWrap, 'Gemini 3.8 Flash', 'Low');
  env.addSingleRow(listWrap, claudeSon.label);
  env.addSingleRow(listWrap, gptOss.label);
  const neonAttrDisabledRow = env.addGroupRow(listWrap, 'Gemini 4 Neon', 'High');
  neonAttrDisabledRow.row.setAttribute('aria-disabled', 'true');
  const dataDisabledRow = env.addGroupRow(listWrap, 'Gemini 4 Pro Locked', 'Low');
  dataDisabledRow.row.setAttribute('data-disabled', '');
  env.body.appendChild(panel);
  env.attachFiberChain(panel, { selectorCtx, convId: 'conv-pro', globalModelCtx });

  const agObs = upstreamLib.installAntigravityObserver({ document: env.doc, window: env.win, MutationObserver: env.win.MutationObserver });
  assert.equal(env.html.getAttribute('data-ces-slider-ready'), '1');

  // 1) 只含 Argon 的 Orchestrator 滑条联动正常，无 Carbon 不触发空引用异常
  const sliderRoot = panel.querySelector('.ces-root');
  assert.equal(panel.querySelectorAll('.ces-tick').length, 3);
  sliderRoot.dispatchEvent({ type: 'keydown', key: 'End' });
  assert.equal(orchPicks[0], argHigh.value);

  // 2) 禁用态行（aria-disabled="true" / targetOption.disabled===true / data-disabled）绝不调用 _commitAgOpt 且 100% 放行原生事件
  const commitsBeforeDisabled = commits.length;
  for (const disTarget of [neonAttrDisabledRow.groupSpan, dataDisabledRow.groupSpan]) {
    const rDis = env.simulateNativeClick(disTarget, () => { isOpen = false; });
    assert.equal(rDis.pu._stopped, false);
    assert.equal(rDis.mu._stopped, false);
    assert.equal(rDis.ck.defaultPrevented, false);
    assert.equal(rDis.nativeCalled, true);
  }
  assert.equal(commits.length, commitsBeforeDisabled, 'Disabled/restricted models must NEVER call _commitAgOpt');

  // 3) 切到可调 Gemini 4 Argon 与 Gemini 3.8 Flash 正常联动并保持菜单常开
  isOpen = true;
  const rArg = env.simulateNativeClick(argonRow.groupSpan);
  assert.equal(rArg.ck.defaultPrevented, true);
  assert.equal(selectedModel.label, 'Gemini 4 Argon (Medium)');
  assert.equal(isOpen, true);

  const rFlash = env.simulateNativeClick(flashRow.groupSpan);
  assert.equal(rFlash.ck.defaultPrevented, true);
  assert.equal(selectedModel.label, 'Gemini 3.8 Flash (Low)');
  assert.equal(panel.querySelectorAll('.ces-tick').length, 2);

  agObs.stop();
});

test('Scenario 7 (R1~R5 防风控加固): 拖动松手单次提交 + 零原型链篡改 + startCascade stage 缓存 + 零 Google 直连 + 节流/分帧折叠', async () => {
  // R1: 拖动跨越 4 档 (Low -> Medium -> High -> Extra)，pointerdown/pointermove 期间 0 次提交，pointerup 松手仅提交 1 次
  const env = createSimEnv();
  const commits = [];
  const rowEl = env.makeEl('div', { className: 'ces-ag-effort-row' });
  const valEl = env.makeEl('span', { className: 'ces-ag-effort-value' });
  const container = env.makeEl('div', { className: 'ces-inline' });
  rowEl.appendChild(valEl);
  rowEl.appendChild(container);
  env.body.appendChild(rowEl);

  let official = 'low';
  const mountR1 = upstreamLib.mountCodexEffortSlider({
    container,
    row: rowEl,
    valueElement: valEl,
    document: env.doc,
    window: env.win,
    seat: {
      isClaude: false,
      locked: false,
      effortLevels: [
        { effort: 'low', label: 'Low' },
        { effort: 'medium', label: 'Medium' },
        { effort: 'high', label: 'High' },
        { effort: 'xhigh', label: 'Extra' },
      ],
      get currentEffort() { return official; },
      selectEffort(item) {
        const eff = typeof item === 'string' ? item : item.effort;
        commits.push(eff);
        official = eff;
      },
    },
  });
  const track = container.querySelector('.ces-track');
  assert.ok(track);
  // track rect width = 220, usable = 220 - 28 = 192, centers at x = 14, 78, 142, 206
  track.dispatchEvent({ type: 'pointerdown', button: 0, clientX: 14, pointerId: 1 });
  track.dispatchEvent({ type: 'pointermove', buttons: 1, clientX: 78, pointerId: 1 });
  assert.equal(valEl.textContent, 'Medium', 'pointermove must update visual preview immediately');
  track.dispatchEvent({ type: 'pointermove', buttons: 1, clientX: 142, pointerId: 1 });
  assert.equal(valEl.textContent, 'High');
  track.dispatchEvent({ type: 'pointermove', buttons: 1, clientX: 206, pointerId: 1 });
  assert.equal(valEl.textContent, 'Extra');
  assert.equal(commits.length, 0, 'R1: dragging across 4 tiers must trigger 0 commits before pointerup');

  track.dispatchEvent({ type: 'pointerup', button: 0, clientX: 206, pointerId: 1 });
  assert.deepEqual(commits, ['xhigh'], 'R1: pointerup must commit exactly 1 time with final tier');

  // 拖出又拖回原档位再松手 -> 0 次提交
  track.dispatchEvent({ type: 'pointerdown', button: 0, clientX: 206, pointerId: 2 });
  track.dispatchEvent({ type: 'pointermove', buttons: 1, clientX: 78, pointerId: 2 });
  track.dispatchEvent({ type: 'pointermove', buttons: 1, clientX: 206, pointerId: 2 });
  track.dispatchEvent({ type: 'pointerup', button: 0, clientX: 206, pointerId: 2 });
  assert.equal(commits.length, 1, 'R1: dragging away and returning to official tier before pointerup must trigger 0 extra commits');
  mountR1.unmount();

  // R2: 源码与运行时零 HTMLElement.prototype.focus / Element.prototype.focus 篡改
  const upSrc = fs.readFileSync(path.join(ROOT, 'vendor', 'effort-slider', 'upstream-client.js'), 'utf8');
  assert.equal(upSrc.includes('HTMLElement.prototype'), false, 'R2: upstream-client.js must not reference HTMLElement.prototype');
  assert.equal(upSrc.includes('Element.prototype'), false, 'R2: upstream-client.js must not reference Element.prototype');

  const envR2 = createSimEnv();
  const editor = envR2.makeEl('div', { attrs: { contenteditable: 'true' } });
  let blurCalls = 0;
  editor.blur = () => { blurCalls += 1; };
  envR2.body.appendChild(editor);
  const oLow = { label: 'Gemini 4 Neon (Low)', modelId: 'n-low', value: 1 };
  const oHigh = { label: 'Gemini 4 Neon (High)', modelId: 'n-high', value: 2 };
  const cLow = { label: 'Claude 4.5 (Low)', modelId: 'c-low', value: 3 };
  const cHigh = { label: 'Claude 4.5 (High)', modelId: 'c-high', value: 4 };
  let selR2 = oLow;
  const { panel: pR2, listWrap: lwR2 } = envR2.makePanel();
  const cRowR2 = envR2.addGroupRow(lwR2, 'Claude 4.5', 'High');
  envR2.body.appendChild(pR2);
  envR2.attachFiberChain(pR2, {
    selectorCtx: {
      effortIndex: new Map([
        ['Gemini 4 Neon', new Map([['low', oLow], ['high', oHigh]])],
        ['Claude 4.5', new Map([['low', cLow], ['high', cHigh]])],
      ]),
      modelOptions: [oLow, oHigh, cLow, cHigh],
      get selectedModel() { return selR2; },
    },
    popoverProps: {
      modelOptions: [oLow, oHigh, cLow, cHigh],
      get selectedModel() { return selR2; },
      open: true,
      setIsOpen() {},
      setSelectedModel(opt) {
        selR2 = opt;
        envR2.doc.activeElement = editor;
        editor.dispatchEvent({ type: 'focus' });
      },
    },
  });
  const protoFocus = function () {};
  const FakeHTMLElement = { prototype: { focus: protoFocus } };
  const FakeElement = { prototype: { focus: protoFocus } };
  const prevHtmlEl = globalThis.HTMLElement;
  const prevEl = globalThis.Element;
  const prevDoc = globalThis.document;
  globalThis.HTMLElement = FakeHTMLElement;
  globalThis.Element = FakeElement;
  globalThis.document = envR2.doc;
  try {
    const obsR2 = upstreamLib.installAntigravityObserver({ document: envR2.doc, window: envR2.win, MutationObserver: envR2.win.MutationObserver });
    envR2.simulateNativeClick(cRowR2.groupSpan);
    assert.equal(FakeHTMLElement.prototype.focus, protoFocus, 'R2: HTMLElement.prototype.focus must stay untouched');
    assert.equal(FakeElement.prototype.focus, protoFocus, 'R2: Element.prototype.focus must stay untouched');
    assert.ok(blurCalls >= 1, 'R2: scoped focus listener on editor must neutralize focus theft without prototype mutation');
    obsR2.stop();
  } finally {
    if (prevHtmlEl === undefined) delete globalThis.HTMLElement; else globalThis.HTMLElement = prevHtmlEl;
    if (prevEl === undefined) delete globalThis.Element; else globalThis.Element = prevEl;
    if (prevDoc === undefined) delete globalThis.document; else globalThis.document = prevDoc;
  }

  // R3: sidebar-client.js 缓存 startCascade 命中 stage，二次新建会话仅 1 次 RPC（0 次试探报错）
  const sbSrc = fs.readFileSync(path.join(ROOT, 'vendor', 'sidebar-studio', 'sidebar-client.js'), 'utf8');
  assert.ok(sbSrc.includes('cachedStartCascadeStage'), 'R3: sidebar-client.js must cache winning startCascade stage');
  let startStageCalls = 0;
  const sbEnv = createSimEnv();
  const fakeLs = {
    async startCascade(arg) {
      startStageCalls += 1;
      // 拒绝 stage1 (含 workspace)，只接受 stage2 (无 workspace)
      if (arg.customAgentSpec && 'workspace' in arg.customAgentSpec) {
        throw new Error('unsupported workspace field');
      }
      return { cascadeId: `cid-${startStageCalls}` };
    },
    async sendUserCascadeMessage() { return {}; },
  };
  const rootEl = sbEnv.makeEl('div', { attrs: { id: 'root' } });
  rootEl.__reactFiber$r3 = {
    tag: 10,
    memoizedProps: { value: { store: { getState: () => ({ trajectorySummaries: { summaries: {} } }), subscribe: () => () => {} } } },
    sibling: {
      tag: 10,
      memoizedProps: { value: { sendUserCascadeMessage: async () => ({}) } },
      sibling: {
        tag: 10,
        memoizedProps: { value: { navigate: () => {}, subscribe: () => () => {} } },
        sibling: {
          tag: 10,
          memoizedProps: { value: { core: { projectManagementService: { projectsStateProvider: { getState: () => [] }, lsClient: fakeLs } } } },
        },
      },
    },
  };
  sbEnv.body.appendChild(rootEl);
  const sbCtx = {
    window: null,
    globalThis: null,
    document: sbEnv.doc,
    localStorage: sbEnv.localStorage,
    MutationObserver: sbEnv.win.MutationObserver,
    ResizeObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame: sbEnv.win.requestAnimationFrame,
    cancelAnimationFrame: sbEnv.win.cancelAnimationFrame,
    getComputedStyle: sbEnv.win.getComputedStyle,
    performance: sbEnv.win.performance,
    setTimeout,
    clearTimeout,
    Map, Set, Array, Object, Math, Number, String, Boolean, Date, RegExp, JSON, Promise, Error, URL,
    __agPrismSidebarResolve: undefined,
    __agPrismSidebarMeta: { baseUrl: 'http://127.0.0.1:0' },
  };
  sbCtx.window = sbCtx;
  sbCtx.globalThis = sbCtx;
  vm.runInNewContext(sbSrc, sbCtx);
  sbCtx.__agPrismSidebar.sync({ sidebarStudio: 'on' });
  await new Promise((r) => setTimeout(r, 15));
  const ops = sbCtx.__agPrismSidebarHostOps;
  const r1 = await ops.reserveSession({ idempotencyKey: 'r3-1', scopeRef: 's1', kind: 'knowledge', title: 'T1', dirPath: '' });
  assert.equal(r1.ok, true);
  assert.equal(startStageCalls, 2, 'First reserveSession probes stage1 -> falls back to stage2 (2 calls)');
  const r2 = await ops.reserveSession({ idempotencyKey: 'r3-2', scopeRef: 's1', kind: 'knowledge', title: 'T2', dirPath: '' });
  assert.equal(r2.ok, true);
  assert.equal(startStageCalls, 3, 'R3: second reserveSession must hit cached stage2 directly in 1 call (0 failing probes)');
  sbCtx.__agPrismSidebar.destroy();

  // R4: cdp.js 主编译包零 translate.googleapis.com 直连，Daemon 离线直接提示 offline
  const expr = cdp.buildInjectExpression(cdp.DEFAULT_CONFIG);
  const googleTransRe = new RegExp(['translate', 'googleapis', 'com'].join('\\.'), 'i');
  assert.equal(googleTransRe.test(expr), false, 'R4: compiled bundle must contain zero translate.googleapis.com');
  assert.ok(Buffer.byteLength(expr, 'utf8') <= 704000, 'Default bundle must stay <= 704,000 B (< 690 KiB)');

  // R5: inline-widget.cjs QUOTA_HOVER_COOLDOWN >= 20000 & MANUAL_REFRESH_COOLDOWN >= 5000 + host-workbench-enhancer 分帧折叠
  const iwSrc = fs.readFileSync(path.join(ROOT, 'vendor', 'pulse-dashboard', 'compat', 'inline-widget.cjs'), 'utf8');
  const qm = iwSrc.match(/QUOTA_HOVER_COOLDOWN=(\d+)/);
  assert.ok(qm && Number(qm[1]) >= 20000, 'R5: QUOTA_HOVER_COOLDOWN must be >= 20000ms');
  const mm = iwSrc.match(/MANUAL_REFRESH_COOLDOWN=(\d+)/);
  assert.ok(mm && Number(mm[1]) >= 5000, 'R5: MANUAL_REFRESH_COOLDOWN must be >= 5000ms');

  const hweSrc = fs.readFileSync(path.join(ROOT, 'host-workbench-enhancer.js'), 'utf8');
  const hweEnv = createSimEnv();
  const conv = hweEnv.makeEl('div', { attrs: { 'data-testid': 'conversation-view' } });
  const turn1 = hweEnv.makeEl('div', { attrs: { 'data-testid': 'user-input-step' } });
  const turn2 = hweEnv.makeEl('div', { attrs: { 'data-testid': 'user-input-step' } });
  conv.appendChild(turn1);
  let foldClicks = 0;
  for (let i = 0; i < 6; i++) {
    const b = hweEnv.makeEl('button', { attrs: { 'data-testid': 'worked-for-collapsible', 'aria-expanded': 'true' } });
    b.click = () => { foldClicks += 1; b.setAttribute('aria-expanded', 'false'); };
    b.compareDocumentPosition = (other) => (other === turn2 ? 2 : 4);
    conv.appendChild(b);
  }
  conv.appendChild(turn2);
  turn2.compareDocumentPosition = () => 2; // preceding relative to earlier nodes
  hweEnv.body.appendChild(conv);

  const hweSb = {
    document: hweEnv.doc,
    window: hweEnv.win,
    requestAnimationFrame: hweEnv.win.requestAnimationFrame.bind(hweEnv.win),
    cancelAnimationFrame: hweEnv.win.cancelAnimationFrame.bind(hweEnv.win),
    performance: hweEnv.win.performance,
    MutationObserver: hweEnv.win.MutationObserver,
    ResizeObserver: class { observe() {} disconnect() {} },
    getComputedStyle: hweEnv.win.getComputedStyle,
    setTimeout,
    clearTimeout,
    Map, Set, WeakMap, WeakSet, Array, Object, Math, Number, String, Boolean,
  };
  hweSb.window = hweSb;
  hweSb.globalThis = hweSb;
  vm.runInNewContext(hweSrc, hweSb);
  const hweCtl = hweSb.__agPrismHostEnhancer.createHostEnhancerController({
    isDestroyed: () => false,
    isDarkTheme: () => true,
    isZh: () => true,
    getLang: () => 'zh-CN',
    setAttrIfChanged: (el, k, v) => el.setAttribute(k, v),
    runGuardedMut: (fn) => fn(),
  });
  const totalFold = hweCtl.foldHistoricalSteps();
  assert.equal(totalFold, 6, 'R5: foldHistoricalSteps must return total matched count');
  assert.equal(foldClicks, 2, 'R5: first frame must click only 2 collapsibles');
  hweEnv.advanceRaf();
  assert.equal(foldClicks, 4, 'R5: second frame clicks next 2 collapsibles');
  hweCtl.destroy();
  hweEnv.advanceRaf();
  assert.equal(foldClicks, 4, 'R5: destroy() must cancel remaining pending foldRafId');
});

test('Scenario 8 (Orchestrator 集群切入 + 右侧子菜单选型保持常开): 点击集群行与子菜单均不退出选择页且严格 Fail-Open（含中英 L3 与共享外层防误伤）', () => {
  const env = createSimEnv();
  const neonLow = { label: 'Gemini 4 Neon (Low)', modelId: 'gemini-4-neon-low', value: 1534 };
  const neonMed = { label: 'Gemini 4 Neon (Medium)', modelId: 'gemini-4-neon-medium', value: 1533 };
  const neonHigh = { label: 'Gemini 4 Neon (High)', modelId: 'gemini-4-neon-high', value: 1532 };
  const neonXHigh = { label: 'Gemini 4 Neon (XHigh)', modelId: 'gemini-4-neon-xhigh', value: 1535 };
  const carbLow = { label: 'Gemini 4 Carbon (Low)', modelId: 'gemini-4-carbon-low', value: 1520 };
  const carbMed = { label: 'Gemini 4 Carbon (Medium)', modelId: 'gemini-4-carbon-medium', value: 1521 };
  const carbHigh = { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-carbon-high', value: 1522 };
  const opusLow = { label: 'Claude Opus 5.5 (Low)', modelId: 'claude-opus-5-5-low', value: 1400 };
  const opusMed = { label: 'Claude Opus 5.5 (Medium)', modelId: 'claude-opus-5-5-medium', value: 1401 };
  const opusHigh = { label: 'Claude Opus 5.5 (High)', modelId: 'claude-opus-5-5-high', value: 1402 };
  const orchNeon = { label: 'Orchestrator (Neon)', modelId: 'gemini-pro-orchestrator-neon', value: 1537 };

  const planners = [neonLow, neonMed, neonHigh, neonXHigh, carbLow, carbMed, carbHigh, opusLow, opusMed, opusHigh];
  const modelOptions = [...planners, orchNeon];
  let selectedModel = neonXHigh;
  let isOpen = true;
  const commits = [];
  const orchPicks = [];

  const plannerIdx = new Map([
    ['gemini-4-neon', new Map([['low', neonLow], ['medium', neonMed], ['high', neonHigh], ['xhigh', neonXHigh]])],
    ['gemini-4-carbon', new Map([['low', carbLow], ['medium', carbMed], ['high', carbHigh]])],
    ['claude-opus-5-5', new Map([['low', opusLow], ['medium', opusMed], ['high', opusHigh]])],
  ]);
  const selectorCtx = {
    effortIndex: plannerIdx,
    modelOptions,
    get selectedModel() { return selectedModel; },
    orchestratorPlanners: planners,
    orchestratorPlannerIndex: plannerIdx,
    orchestratorDefaultPlanner: neonXHigh,
    orchestratorPick: {
      model: null,
      select(v) { orchPicks.push(v); this.model = v === 0 ? null : v; },
    },
  };
  const globalModelCtx = {
    setModelConfigByLabelForConversation(label, convId, keepOpen) {
      commits.push({ label, convId, keepOpen });
      selectedModel = modelOptions.find((o) => o.label === label) || selectedModel;
    },
  };

  const trigger = env.makeTrigger('Gemini 4 Neon', 'Extra');
  env.body.appendChild(trigger);
  const { panel, listWrap } = env.makePanel();
  const neonRow = env.addGroupRow(listWrap, 'Gemini 4 Neon', 'Extra');
  const orchRow = env.makeEl('div', { attrs: { role: 'menuitem', 'data-testid': 'model-selector-orchestrator' }, text: 'Orchestrator Gemini 4 Neon Extra New' });
  listWrap.appendChild(orchRow);
  env.body.appendChild(panel);
  env.attachFiberChain(panel, { selectorCtx, convId: 'conv-orch-8', globalModelCtx });

  const agObs = upstreamLib.installAntigravityObserver({ document: env.doc, window: env.win, MutationObserver: env.win.MutationObserver });

  // 校验 SLIDER_CSS 使用标准合法的顶层选择器（不含 Chromium 静默丢弃的 :is(>svg...)）
  const sliderStyle = env.doc.getElementById('ag-codex-effort-slider-styles');
  assert.ok(sliderStyle, 'Slider style tag must be injected');
  assert.equal(sliderStyle.textContent.includes(':is(>svg'), false, 'SLIDER_CSS must NOT contain invalid :is(>svg...) relative selector');
  assert.equal(
    sliderStyle.textContent.includes("[data-ces-orch-row='1']>svg:last-child:not(:first-child):not(.lucide-check)"),
    true,
    'SLIDER_CSS must use standard top-level selector to hide L2 chevron arrow'
  );

  // 1) 从普通模型 (Gemini 4 Neon) 初次点击 Orchestrator 行 -> 拦截关闭并保持选择页常开
  const rEnterOrch = env.simulateNativeClick(orchRow, () => { isOpen = false; });
  assert.equal(rEnterOrch.pu._stopped, true);
  assert.equal(rEnterOrch.ck.defaultPrevented, true);
  assert.equal(rEnterOrch.nativeCalled, false, 'Switching from normal model to Orchestrator must keep menu open');
  assert.equal(isOpen, true);
  assert.equal(selectedModel, orchNeon);
  assert.equal(panel.getAttribute('data-ces-orch-tunable'), 'true');
  assert.equal(orchRow.getAttribute('data-ces-model-selected'), 'true');
  assert.equal(neonRow.row.getAttribute('data-ces-model-selected'), 'false');

  // 2) 再次点击已选中的 Orchestrator 行 -> 放行原生事件关闭菜单
  const rSecondOrch = env.simulateNativeClick(orchRow, () => { isOpen = false; });
  assert.equal(rSecondOrch.ck.defaultPrevented, false);
  assert.equal(rSecondOrch.nativeCalled, true);
  assert.equal(isOpen, false);
  isOpen = true;

  // 3) 挂载右侧 Orchestrator Layer 2 规划模型子菜单（sibling portal）+ Layer 3 推理档位子菜单（Low / Medium ✓ / High）+ 无关右键菜单
  const subOverlay = env.makeEl('div', { className: 'agy-overlay' });
  const subMenu = env.makeEl('div', { attrs: { role: 'menu' } });
  const subNeon = env.makeEl('div', { attrs: { role: 'menuitemradio' }, text: 'Gemini 4 Neon Medium' });
  const subCarb = env.makeEl('div', { attrs: { role: 'menuitemradio' }, text: 'Gemini 4 Carbon Medium' });
  const subOpus = env.makeEl('div', { attrs: { role: 'menuitemradio' }, text: 'Claude Opus 5.5 Medium' });
  const subDis = env.makeEl('div', { attrs: { role: 'menuitemradio', 'aria-disabled': 'true' }, text: 'Gemini 4 Carbon Medium' });
  subMenu.appendChild(subNeon);
  subMenu.appendChild(subCarb);
  subMenu.appendChild(subOpus);
  subMenu.appendChild(subDis);
  subOverlay.appendChild(subMenu);
  env.body.appendChild(subOverlay);

  const l3Overlay = env.makeEl('div', { className: 'agy-overlay' });
  const l3Menu = env.makeEl('div', { attrs: { role: 'menu' } });
  l3Menu.appendChild(env.makeEl('div', { attrs: { role: 'menuitem' }, text: 'Low' }));
  l3Menu.appendChild(env.makeEl('div', { attrs: { role: 'menuitem' }, text: 'Medium ✓' }));
  l3Menu.appendChild(env.makeEl('div', { attrs: { role: 'menuitem' }, text: 'High' }));
  l3Overlay.appendChild(l3Menu);
  env.body.appendChild(l3Overlay);

  // 中文汉化后的 L3 纯档位子菜单，且与 L2 共享同一外层 .agy-overlay 容器 -> 必须仅隐藏中文 L3 菜单，绝不可误藏共享的 subOverlay！
  const zhL3Menu = env.makeEl('div', { attrs: { role: 'menu' } });
  zhL3Menu.appendChild(env.makeEl('div', { attrs: { role: 'menuitem' }, text: '低' }));
  zhL3Menu.appendChild(env.makeEl('div', { attrs: { role: 'menuitem' }, text: '中等 ✓' }));
  zhL3Menu.appendChild(env.makeEl('div', { attrs: { role: 'menuitem' }, text: '高思考' }));
  zhL3Menu.appendChild(env.makeEl('div', { attrs: { role: 'menuitem' }, text: '超高' }));
  subOverlay.appendChild(zhL3Menu);

  const unrelatedMenu = env.makeEl('div', { attrs: { role: 'menu' } });
  const copyItem = env.makeEl('div', { attrs: { role: 'menuitem' }, text: 'Copy' });
  const pasteItem = env.makeEl('div', { attrs: { role: 'menuitem' }, text: 'Paste' });
  unrelatedMenu.appendChild(copyItem);
  unrelatedMenu.appendChild(pasteItem);
  env.body.appendChild(unrelatedMenu);

  agObs.rescan();
  assert.equal(subMenu.getAttribute('data-ag-cs-model-submenu'), '1');
  assert.equal(subMenu.getAttribute('data-ag-cs-orch-l2'), '1');
  assert.equal(subOverlay.getAttribute('data-ag-cs-model-submenu'), '1');
  assert.equal(subNeon.getAttribute('data-ces-orch-row'), '1');
  assert.equal(subNeon.getAttribute('data-ces-model-selected'), 'true');
  assert.equal(l3Menu.getAttribute('data-ag-cs-orch-l3'), '1', 'Redundant Layer 3 effort submenu must be hidden');
  assert.equal(l3Overlay.getAttribute('data-ag-cs-orch-l3'), '1', 'Layer 3 dedicated overlay must be hidden');
  assert.equal(zhL3Menu.getAttribute('data-ag-cs-orch-l3'), '1', 'Localized Chinese Layer 3 effort submenu must be hidden');
  assert.equal(subOverlay.hasAttribute('data-ag-cs-orch-l3'), false, 'Shared overlay containing Layer 2 must NEVER be hidden as Layer 3');
  assert.equal(unrelatedMenu.hasAttribute('data-ag-cs-model-submenu'), false, 'Unrelated context menu must never be touched');
  assert.equal(unrelatedMenu.hasAttribute('data-ag-cs-orch-l3'), false, 'Unrelated context menu must never be hidden as Layer 3');

  // 4) 在 Layer 2 子菜单中点击 Claude Opus 5.5 -> 拦截 pointerdown/mousedown/pointerup/mouseup/click、保持常开并切到 claude 主题
  const pdEv = { type: 'pointerdown', button: 0, bubbles: true };
  const mdEv = { type: 'mousedown', button: 0, bubbles: true };
  subOpus.dispatchEvent(pdEv);
  subOpus.dispatchEvent(mdEv);
  assert.equal(pdEv._stopped, true, 'pointerdown on Layer 2 planner must be stopped');
  assert.equal(mdEv._stopped, true, 'mousedown on Layer 2 planner must be stopped');
  assert.equal(mdEv.defaultPrevented, true, 'mousedown on Layer 2 planner must preventDefault to avoid blur-close');

  const rPickOpus = env.simulateNativeClick(subOpus, () => { isOpen = false; });
  assert.equal(rPickOpus.pu._stopped, true);
  assert.equal(rPickOpus.ck.defaultPrevented, true);
  assert.equal(rPickOpus.nativeCalled, false, 'Clicking new Orchestrator planner in submenu must keep model selector open');
  assert.equal(isOpen, true);
  assert.equal(orchPicks[orchPicks.length - 1], opusMed.value);
  assert.equal(subOpus.getAttribute('data-ces-model-selected'), 'true');
  assert.equal(subNeon.getAttribute('data-ces-model-selected'), 'false');
  assert.equal(panel.querySelector('.ces-root').getAttribute('data-theme'), 'claude');

  // 立即拖动/按键调整刚刚切到的 Claude Opus 5.5 档位 (Home -> Low)
  panel.querySelector('.ces-root').dispatchEvent({ type: 'keydown', key: 'Home' });
  assert.equal(orchPicks[orchPicks.length - 1], opusLow.value);

  // 5) 禁用 planner 与无关菜单 100% Fail-Open
  const picksBeforeDis = orchPicks.length;
  const rDis = env.simulateNativeClick(subDis, () => { isOpen = false; });
  assert.equal(rDis.ck.defaultPrevented, false);
  assert.equal(rDis.nativeCalled, true);
  assert.equal(orchPicks.length, picksBeforeDis);

  isOpen = true;
  const rCopy = env.simulateNativeClick(copyItem, () => { isOpen = false; });
  assert.equal(rCopy.ck.defaultPrevented, false);
  assert.equal(rCopy.nativeCalled, true);

  // 6) 先切回普通模型 Gemini 4 Neon，再直接点无 role="menu" 的 .agy-overlay + <button> 形态 Layer 2 -> 真正拦截冒泡、同时切入 Orchestrator + Carbon 且保持常开
  subOverlay.remove();
  agObs.rescan();
  const btnOverlay = env.makeEl('div', { className: 'agy-overlay' });
  const btnNeon = env.makeEl('button', { text: 'Gemini 4 Neon Medium' });
  const btnCarb = env.makeEl('button', { text: 'Gemini 4 Carbon Medium' });
  btnOverlay.appendChild(btnNeon);
  btnOverlay.appendChild(btnCarb);
  env.body.appendChild(btnOverlay);
  agObs.rescan();
  assert.equal(btnOverlay.getAttribute('data-ag-cs-orch-l2'), '1', 'Overlay without role=menu containing button planner rows must still be detected as Layer 2');

  isOpen = true;
  const rBackNeon = env.simulateNativeClick(neonRow.groupSpan, () => { isOpen = false; });
  assert.equal(rBackNeon.ck.defaultPrevented, true);
  assert.equal(selectedModel.label.startsWith('Gemini 4 Neon'), true);
  assert.equal(isOpen, true);

  // 校验 simulateNativeClick 对 .agy-overlay 真正挂载了冒泡监听，且点击未选中的 btnCarb 会被拦截，再次点击已选中的 btnCarb 会 Fail-Open 触发原生冒泡
  const rDirectCarb = env.simulateNativeClick(btnCarb, () => { isOpen = false; });
  assert.equal(rDirectCarb.ck.defaultPrevented, true);
  assert.equal(rDirectCarb.nativeCalled, false, 'Clicking .agy-overlay button planner must intercept click before bubbling to .agy-overlay');
  assert.equal(isOpen, true);
  assert.equal(selectedModel, orchNeon);
  assert.equal(orchPicks[orchPicks.length - 1], carbMed.value);
  assert.equal(btnCarb.getAttribute('data-ces-model-selected'), 'true');

  const rRepeatCarb = env.simulateNativeClick(btnCarb, () => { isOpen = false; });
  assert.equal(rRepeatCarb.ck.defaultPrevented, false, 'Re-clicking already selected planner must Fail-Open');
  assert.equal(rRepeatCarb.nativeCalled, true, 'simulateNativeClick must actually observe bubbling on .agy-overlay when Fail-Open');

  // 7) 面板关闭后自动解绑 Layer 2 监听并清理 Layer 2 / Layer 3 标记
  panel.remove();
  agObs.rescan();
  assert.equal(btnOverlay.hasAttribute('data-ag-cs-model-submenu'), false);
  assert.equal(btnOverlay.hasAttribute('data-ag-cs-orch-l2'), false);
  assert.equal(btnCarb.hasAttribute('data-ces-orch-row'), false);
  assert.equal(l3Menu.hasAttribute('data-ag-cs-orch-l3'), false);
  assert.equal(l3Overlay.hasAttribute('data-ag-cs-orch-l3'), false);

  // 8) 残留脏属性时 stop() 必须通过 _clrAgDom 彻底兜底清理
  btnOverlay.setAttribute('data-ag-cs-model-submenu', '1');
  btnOverlay.setAttribute('data-ag-cs-orch-l2', '1');
  l3Menu.setAttribute('data-ag-cs-orch-l3', '1');
  btnCarb.setAttribute('data-ces-orch-row', '1');
  env.html.setAttribute('data-ces-slider-ready', '1');
  agObs.stop();
  assert.equal(btnOverlay.hasAttribute('data-ag-cs-model-submenu'), false);
  assert.equal(btnOverlay.hasAttribute('data-ag-cs-orch-l2'), false);
  assert.equal(l3Menu.hasAttribute('data-ag-cs-orch-l3'), false);
  assert.equal(btnCarb.hasAttribute('data-ces-orch-row'), false);
  assert.equal(env.html.hasAttribute('data-ces-slider-ready'), false);
});

test('Scenario 9 (PR #12 + Issue #16): valEl 逻辑档位追踪 + _sameEffTxt 覆盖简繁英别名，首次挂载零闪英文/零 rise 闪烁且卸载清缓存', () => {
  const env = createSimEnv();
  const rowEl = env.makeEl('div', { className: 'ces-ag-effort-row' });
  const valEl = env.makeEl('span', { className: 'ces-ag-effort-value' });
  const container = env.makeEl('div', { className: 'ces-inline' });
  rowEl.appendChild(valEl);
  rowEl.appendChild(container);
  env.body.appendChild(rowEl);

  let official = 'medium';
  const mount = upstreamLib.mountCodexEffortSlider({
    container,
    row: rowEl,
    valueElement: valEl,
    document: env.doc,
    window: env.win,
    seat: {
      isClaude: false,
      locked: false,
      effortLevels: [
        { effort: 'minimal', label: 'Minimal' },
        { effort: 'low', label: 'Low' },
        { effort: 'medium', label: 'Medium' },
        { effort: 'high', label: 'High' },
        { effort: 'xhigh', label: 'Extra' },
      ],
      get currentEffort() { return official; },
      selectEffort() {},
    },
  });

  // 1) Initial mount fills empty valEl without replaying ces-text-rise
  assert.equal(valEl.textContent, 'Medium');
  assert.equal(valEl.classList.contains('ces-text-rise'), false, 'Initial mount must not trigger rise flicker');

  // 2) External i18n rewrites (Simplified/Traditional/Parenthesized/Unknown locale) cause 0 overwrites and 0 rise animations
  for (const localized of ['中', '中等', '（中等）', '中等思考', 'Moyen']) {
    valEl.textContent = localized;
    mount.refresh();
    assert.equal(valEl.textContent, localized, `refresh() must preserve external translation "${localized}"`);
    assert.equal(valEl.classList.contains('ces-text-rise'), false);
    assert.equal(valEl.classList.contains('is-claude-changing'), false);
  }

  // 3) Empty DOM with non-empty target must self-heal back to target label
  valEl.textContent = '';
  mount.refresh();
  assert.equal(valEl.textContent, 'Medium', 'Empty valEl must be rewritten when logical label is non-empty');

  // 4) Genuine tier transition updates text and triggers rise animation once
  valEl.textContent = '中等';
  official = 'high';
  mount.refresh();
  assert.equal(valEl.textContent, 'High');
  assert.equal(valEl.classList.contains('ces-text-rise'), true, 'Real tier transition must still trigger rise animation');

  // Traditional Chinese alias for xhigh pre-populated before mount must not flash English or replay rise
  mount.unmount();
  assert.equal(valEl.__cesLastLabel, undefined, 'unmount() must clear __cesLastLabel to avoid stale cache on remount');

  valEl.classList.remove('ces-text-rise', 'is-claude-changing');
  valEl.textContent = '（極高思考）';
  official = 'xhigh';
  const remount = upstreamLib.mountCodexEffortSlider({
    container,
    row: rowEl,
    valueElement: valEl,
    document: env.doc,
    window: env.win,
    seat: {
      isClaude: false,
      locked: false,
      effortLevels: [
        { effort: 'low', label: 'Low' },
        { effort: 'medium', label: 'Medium' },
        { effort: 'high', label: 'High' },
        { effort: 'xhigh', label: 'Extra' },
      ],
      get currentEffort() { return official; },
      selectEffort() {},
    },
  });
  assert.equal(valEl.textContent, '（極高思考）', 'Initial mount on pre-localized Traditional Chinese valEl must not flash English');
  assert.equal(valEl.classList.contains('ces-text-rise'), false, 'Initial mount on pre-localized valEl must not trigger rise');
  remount.unmount();
});

test('Scenario 10 (PR #12 + Issue #16): 三处统一防乒乓 (valEl / effortSpan / sib) + allInsideSlider 自激抑制 + 关滑块清缓存', () => {
  const env = createSimEnv();
  const neonLow = { label: 'Gemini 4 Neon (Low)', modelId: 'gemini-4-neon-low', value: 1534 };
  const neonMed = { label: 'Gemini 4 Neon (Medium)', modelId: 'gemini-4-neon-medium', value: 1533 };
  const neonHigh = { label: 'Gemini 4 Neon (High)', modelId: 'gemini-4-neon-high', value: 1532 };
  const neonXHigh = { label: 'Gemini 4 Neon (XHigh)', modelId: 'gemini-4-neon-xhigh', value: 1535 };
  const carbLow = { label: 'Gemini 4 Carbon (Low)', modelId: 'gemini-4-carbon-low', value: 1520 };
  const carbMed = { label: 'Gemini 4 Carbon (Medium)', modelId: 'gemini-4-carbon-medium', value: 1521 };
  const carbHigh = { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-carbon-high', value: 1522 };
  const modelOptions = [neonLow, neonMed, neonHigh, neonXHigh, carbLow, carbMed, carbHigh];
  let selectedModel = neonMed;

  const selectorCtx = {
    effortIndex: new Map([
      ['gemini-4-neon', new Map([['low', neonLow], ['medium', neonMed], ['high', neonHigh], ['xhigh', neonXHigh]])],
      ['gemini-4-carbon', new Map([['low', carbLow], ['medium', carbMed], ['high', carbHigh]])],
    ]),
    modelOptions,
    get selectedModel() { return selectedModel; },
  };
  const globalModelCtx = {
    setModelConfigByLabelForConversation(label) {
      selectedModel = modelOptions.find((o) => o.label === label) || selectedModel;
    },
  };

  const trigger = env.makeTrigger('Gemini 4 Neon', 'Medium');
  const effortSpan = trigger.querySelector('span.opacity-70');
  env.body.appendChild(trigger);

  const { panel, listWrap } = env.makePanel();
  const neonRow = env.addGroupRow(listWrap, 'Gemini 4 Neon', 'Medium');
  const carbRow = env.addGroupRow(listWrap, 'Gemini 4 Carbon', 'Medium');
  env.body.appendChild(panel);
  env.attachFiberChain(panel, { selectorCtx, convId: 'conv-i18n-10', globalModelCtx });
  env.attachFiberChain(trigger, { selectorCtx, convId: 'conv-i18n-10', globalModelCtx });

  const agObs = upstreamLib.installAntigravityObserver({
    document: env.doc,
    window: env.win,
    MutationObserver: env.win.MutationObserver,
  });

  const valEl = panel.querySelector('.ces-ag-effort-value');
  assert.ok(valEl, 'Slider value element must be mounted');
  assert.equal(valEl.textContent, 'Medium');
  assert.equal(valEl.classList.contains('ces-text-rise'), false, 'Panel mount must not replay ces-text-rise');

  // Simulate external Chinese i18n rewriting all three sites simultaneously
  valEl.textContent = '中等';
  effortSpan.textContent = ' 中等';
  neonRow.effortSpan.textContent = '中等';
  carbRow.effortSpan.textContent = '中思考';

  let valWrites = 0, trigWrites = 0, sibWrites = 0;
  const wrapTextWrite = (el, onWrite) => {
    const desc = Object.getOwnPropertyDescriptor(el, 'textContent');
    Object.defineProperty(el, 'textContent', {
      configurable: true,
      get: desc.get,
      set(v) { onWrite(v); desc.set.call(this, v); },
    });
  };
  wrapTextWrite(valEl, () => { valWrites += 1; });
  wrapTextWrite(effortSpan, () => { trigWrites += 1; });
  wrapTextWrite(neonRow.effortSpan, () => { sibWrites += 1; });

  // Multiple rescans with unchanged tier must cause ZERO overwrites on all 3 sites
  for (let i = 0; i < 5; i += 1) agObs.rescan();
  assert.equal(valWrites, 0, 'valEl must have 0 ping-pong overwrites');
  assert.equal(trigWrites, 0, 'trigger effortSpan must have 0 ping-pong overwrites');
  assert.equal(sibWrites, 0, 'menu row sib must have 0 ping-pong overwrites');
  assert.equal(valEl.textContent, '中等');
  assert.equal(effortSpan.textContent, ' 中等');
  assert.equal(neonRow.effortSpan.textContent, '中等');
  assert.equal(carbRow.effortSpan.textContent, '中思考');

  // allInsideSlider self-trigger guard: mutations strictly inside .ces-ag-section must skip scan()
  const mo = env.observers[env.observers.length - 1];
  let getSelectedReads = 0;
  const origSelDesc = Object.getOwnPropertyDescriptor(selectorCtx, 'selectedModel');
  Object.defineProperty(selectorCtx, 'selectedModel', {
    configurable: true,
    get() { getSelectedReads += 1; return origSelDesc.get(); },
  });
  const readsBeforeInsideMut = getSelectedReads;
  mo.trigger([{ type: 'characterData', target: valEl }]);
  assert.equal(getSelectedReads, readsBeforeInsideMut, 'allInsideSlider mutation must skip scan() completely');

  // Genuine tier switch Medium -> Extra (xhigh) must update all 3 sites cleanly
  selectedModel = neonXHigh;
  agObs.rescan();
  assert.equal(valEl.textContent, 'Extra');
  assert.equal(effortSpan.textContent, ' Extra');
  assert.equal(neonRow.effortSpan.textContent, 'Extra');

  // External i18n translates Extra -> 極高 (Traditional Chinese) -> again 0 ping-pong overwrites
  valEl.textContent = '極高';
  effortSpan.textContent = ' 極高';
  neonRow.effortSpan.textContent = '極高思考';
  const w1 = valWrites, w2 = trigWrites, w3 = sibWrites;
  agObs.rescan();
  agObs.rescan();
  assert.equal(valWrites, w1);
  assert.equal(trigWrites, w2);
  assert.equal(sibWrites, w3);

  // Empty DOM on sib must still be restored when logical label is non-empty
  neonRow.effortSpan.textContent = '';
  agObs.rescan();
  assert.equal(neonRow.effortSpan.textContent, 'Extra', 'Empty sib must be restored even if __cesLastText matched');

  // Stopping observer clears __cesLastText & __cesLastLabel so remount never sees stale cache
  agObs.stop();
  assert.equal(effortSpan.__cesLastText, undefined, '_clrAgDom must clear effortSpan.__cesLastText');
  assert.equal(neonRow.effortSpan.__cesLastText, undefined, '_clrAgDom/_unmntSec must clear sib.__cesLastText');
  assert.equal(valEl.__cesLastLabel, undefined, '_unmntSec must clear valEl.__cesLastLabel');
});

test('Scenario 11 (PR #35 / Issue #34 View Usage false-positive Orchestrator L2 regression): View Usage popup containing Gemini 4 Argon quota rows must never be bound as Orchestrator L2 submenu or switch model to Orchestrator on click', () => {
  const env = createSimEnv();
  const neonHigh = { label: 'Gemini 4 Neon (High)', modelId: 'gemini-4-neon-high', value: 1532 };
  const neonMed = { label: 'Gemini 4 Neon (Medium)', modelId: 'gemini-4-neon-medium', value: 1533 };
  const argonHigh = { label: 'Gemini 4 Argon (High)', modelId: 'gemini-4-argon-high', value: 1417 };
  const argonMed = { label: 'Gemini 4 Argon (Medium)', modelId: 'gemini-4-argon-medium', value: 1418 };
  const argonXHigh = { label: 'Gemini 4 Argon (Extra)', modelId: 'gemini-4-argon-xhigh', value: 1419 };
  const orchNeon = { label: 'Orchestrator (Neon)', modelId: 'gemini-pro-orchestrator-neon', value: 1537 };

  const planners = [neonHigh, neonMed, argonHigh, argonMed, argonXHigh];
  const modelOptions = [...planners, orchNeon];
  let selectedModel = neonHigh;
  const commits = [];
  const orchPicks = [];

  const plannerIdx = new Map([
    ['gemini-4-neon', new Map([['medium', neonMed], ['high', neonHigh]])],
    ['gemini-4-argon', new Map([['medium', argonMed], ['high', argonHigh], ['xhigh', argonXHigh]])],
  ]);
  const selectorCtx = {
    effortIndex: plannerIdx,
    modelOptions,
    get selectedModel() { return selectedModel; },
    orchestratorPlanners: planners,
    orchestratorPlannerIndex: plannerIdx,
    orchestratorDefaultPlanner: neonHigh,
    orchestratorPick: {
      model: argonMed.value,
      select(v) { orchPicks.push(v); this.model = v; },
    },
  };
  const globalModelCtx = {
    setModelConfigByLabelForConversation(label, convId, keepOpen) {
      commits.push({ label, convId, keepOpen });
      selectedModel = modelOptions.find((o) => o.label === label) || selectedModel;
    },
  };

  const trigger = env.makeTrigger('Gemini 4 Neon', 'High');
  env.body.appendChild(trigger);
  const { panel, listWrap } = env.makePanel();
  env.addGroupRow(listWrap, 'Gemini 4 Neon', 'High');
  env.addGroupRow(listWrap, 'Gemini 4 Argon', 'Medium');
  const orchRow = env.makeEl('div', { attrs: { role: 'menuitem', 'data-testid': 'model-selector-orchestrator' }, text: 'Orchestrator Gemini 4 Argon Medium New' });
  listWrap.appendChild(orchRow);
  const viewUsageRow = env.makeEl('div', { attrs: { role: 'menuitem', 'aria-haspopup': 'menu' }, text: 'View Usage' });
  panel.appendChild(viewUsageRow);
  env.body.appendChild(panel);
  env.attachFiberChain(panel, { selectorCtx, convId: 'conv-usage-11', globalModelCtx });

  // Build exact Antigravity v2.34 View Usage nested popup:
  // outer <div data-side="right" role="presentation"> wrapping <div data-side="right" tabindex="-1" role="menu" class="agy-overlay">
  const usagePositioner = env.makeEl('div', {
    className: 'z-[6000]',
    attrs: { 'data-side': 'right', 'data-align': 'start', 'data-nested': '', role: 'presentation' },
  });
  const usageMenu = env.makeEl('div', {
    className: 'agy-overlay surface-glass bg-card',
    attrs: { 'data-side': 'right', 'data-align': 'start', 'data-nested': '', tabindex: '-1', role: 'menu' },
  });
  const usageBody = env.makeEl('div', {
    text: 'UsageRefreshing...Gemini ModelsWeekly limit57% leftResets in 5d 14h5h limit97% leftResets in 4h 28mClaude and GPT modelsWeekly limit61% leftResets in 3d 12h5h limit100% leftGemini 4 Argon57% leftWeekly limit, resets in 6d 22h',
  });
  const argonLabelSpan = env.makeEl('span', { text: 'Gemini 4 Argon' });
  usageBody.appendChild(argonLabelSpan);
  usageMenu.appendChild(usageBody);
  usagePositioner.appendChild(usageMenu);
  env.body.appendChild(usagePositioner);

  // Also test a short-text quota card carrying [data-testid="quota-progress-circle"]
  const quotaCard = env.makeEl('div', { className: 'agy-overlay', attrs: { role: 'menu', 'data-side': 'right' } });
  const quotaRing = env.makeEl('div', { attrs: { 'data-testid': 'quota-progress-circle' } });
  const quotaRow = env.makeEl('div', { attrs: { role: 'menuitem' }, text: 'Gemini 4 Argon' });
  quotaCard.appendChild(quotaRing);
  quotaCard.appendChild(quotaRow);
  env.body.appendChild(quotaCard);

  // Also test non-prefix container text ("Usage for Gemini 4 Argon") -> must NOT match prefix-only _mPlan
  const nonPrefixBox = env.makeEl('div', { attrs: { role: 'menu', 'data-side': 'right' } });
  const nonPrefixRow = env.makeEl('div', { attrs: { role: 'menuitem' }, text: 'Usage for Gemini 4 Argon' });
  nonPrefixBox.appendChild(nonPrefixRow);
  env.body.appendChild(nonPrefixBox);

  const agObs = upstreamLib.installAntigravityObserver({
    document: env.doc,
    window: env.win,
    MutationObserver: env.win.MutationObserver,
  });
  agObs.rescan();

  // Neither the outer presentation wrapper nor the inner Usage menu / quota-progress-circle / non-prefix box may be bound as Orchestrator L2
  assert.equal(usagePositioner.hasAttribute('data-ag-cs-orch-l2'), false, 'Usage positioner must never be tagged data-ag-cs-orch-l2');
  assert.equal(usageMenu.hasAttribute('data-ag-cs-orch-l2'), false, 'Usage menu must never be tagged data-ag-cs-orch-l2');
  assert.equal(usageMenu.hasAttribute('data-ces-orch-row'), false, 'Usage menu container must never be tagged data-ces-orch-row');
  assert.equal(quotaCard.hasAttribute('data-ag-cs-orch-l2'), false, 'Quota card with quota-progress-circle must never be tagged data-ag-cs-orch-l2');
  assert.equal(nonPrefixBox.hasAttribute('data-ag-cs-orch-l2'), false, 'Non-prefix row "Usage for Gemini 4 Argon" must never match _mPlan');

  // Clicking inside the Usage panel (even without quota-progress-circle testids) must NEVER switch model to Orchestrator
  env.simulateNativeClick(argonLabelSpan, () => {});
  env.simulateNativeClick(usageMenu, () => {});
  env.simulateNativeClick(quotaRow, () => {});
  env.simulateNativeClick(nonPrefixRow, () => {});
  assert.equal(selectedModel, neonHigh, 'Active model must remain Gemini 4 Neon (High) after clicking Usage/quota panels');
  assert.equal(commits.length, 0, 'Clicking Usage panel must trigger 0 model commits');
  assert.equal(orchPicks.length, 0, 'Clicking Usage panel must trigger 0 orchestratorPick.select calls');

  // Genuine Orchestrator L2 submenu with multi-word tail effort ("Gemini 4 Argon Extra High") still works via linear tail stripping
  const realL2 = env.makeEl('div', { className: 'agy-overlay', attrs: { role: 'menu', 'data-side': 'right' } });
  const realArgon = env.makeEl('div', { attrs: { role: 'menuitemradio' }, text: 'Gemini 4 Argon Extra High' });
  const realNeon = env.makeEl('div', { attrs: { role: 'menuitemradio' }, text: 'Gemini 4 Neon High' });
  realL2.appendChild(realArgon);
  realL2.appendChild(realNeon);
  env.body.appendChild(realL2);
  agObs.rescan();
  assert.equal(realL2.getAttribute('data-ag-cs-orch-l2'), '1', 'Real Orchestrator L2 with multi-word tail effort must still bind');
  assert.equal(realArgon.getAttribute('data-ces-orch-row'), '1', 'Linear tail stripper must recognize "Gemini 4 Argon Extra High"');
  // Clicking the outer container realL2 directly (it === m / _isBox) must NOT trigger commit
  env.simulateNativeClick(realL2, () => {});
  assert.equal(commits.length, 0, 'Clicking outer L2 box itself must not trigger commit');

  agObs.stop();
});

test('Scenario 12 (Issue #80 / v2.35.1 nested Orchestrator L3 inside L2): L2 never hides, unbinds, or gets tagged orch-l3 even with 5 nested effort rows', () => {
  const env = createSimEnv();
  const neonMin = { label: 'Gemini 4 Neon (Minimal)', modelId: 'gemini-4-neon-min', value: 1531 };
  const neonLow = { label: 'Gemini 4 Neon (Low)', modelId: 'gemini-4-neon-low', value: 1534 };
  const neonMed = { label: 'Gemini 4 Neon (Medium)', modelId: 'gemini-4-neon-medium', value: 1533 };
  const neonHigh = { label: 'Gemini 4 Neon (High)', modelId: 'gemini-4-neon-high', value: 1532 };
  const neonXHigh = { label: 'Gemini 4 Neon (Extra)', modelId: 'gemini-4-neon-xhigh', value: 1535 };
  const carbMed = { label: 'Gemini 4 Carbon (Medium)', modelId: 'gemini-4-carbon-medium', value: 1521 };
  const carbHigh = { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-carbon-high', value: 1522 };
  const orchNeon = { label: 'Orchestrator (Neon)', modelId: 'gemini-pro-orchestrator-neon', value: 1537 };

  const planners = [neonMin, neonLow, neonMed, neonHigh, neonXHigh, carbMed, carbHigh];
  const modelOptions = [...planners, orchNeon];
  let selectedModel = orchNeon;
  let isOpen = true;
  const orchPicks = [];

  const plannerIdx = new Map([
    ['gemini-4-neon', new Map([['minimal', neonMin], ['low', neonLow], ['medium', neonMed], ['high', neonHigh], ['xhigh', neonXHigh]])],
    ['gemini-4-carbon', new Map([['medium', carbMed], ['high', carbHigh]])],
  ]);
  const selectorCtx = {
    effortIndex: plannerIdx,
    modelOptions,
    get selectedModel() { return selectedModel; },
    orchestratorPlanners: planners,
    orchestratorPlannerIndex: plannerIdx,
    orchestratorDefaultPlanner: neonHigh,
    orchestratorPick: {
      model: neonMed.value,
      select(v) { orchPicks.push(v); this.model = v; },
    },
  };
  const globalModelCtx = {
    setModelConfigByLabelForConversation(label) {
      selectedModel = modelOptions.find((o) => o.label === label) || selectedModel;
    },
  };

  const trigger = env.makeTrigger('Orchestrator', 'Medium');
  env.body.appendChild(trigger);
  const { panel, listWrap } = env.makePanel();
  const orchRow = env.makeEl('div', { attrs: { role: 'menuitem', 'data-testid': 'model-selector-orchestrator' }, text: 'Orchestrator Gemini 4 Neon Medium' });
  listWrap.appendChild(orchRow);
  env.body.appendChild(panel);
  env.attachFiberChain(panel, { selectorCtx, convId: 'conv-issue80-12', globalModelCtx });

  // Build exact v2.35.1 DOM: L2 positioner -> L2 menu (.agy-overlay[data-side]) -> 2 planner rows + nested L3 positioner -> L3 menu -> 5 effort rows
  // Cold-mount L2 + nested L3 simultaneously BEFORE installing observer so L2 is not yet in _boundSubs
  const l2Pos = env.makeEl('div', { attrs: { role: 'presentation', 'data-side': 'right', 'data-nested': '' } });
  const l2Menu = env.makeEl('div', { className: 'agy-overlay', attrs: { role: 'menu', 'data-side': 'right' } });
  const l2Neon = env.makeEl('div', { attrs: { role: 'menuitemradio', 'data-testid': 'orchestrator-picker-row', 'data-model-base': 'Gemini 4 Neon' }, text: 'Gemini 4 Neon Medium' });
  const l2Carb = env.makeEl('div', { attrs: { role: 'menuitemradio', 'data-testid': 'orchestrator-picker-row', 'data-model-base': 'Gemini 4 Carbon' }, text: 'Gemini 4 Carbon High' });
  l2Menu.appendChild(l2Neon);
  l2Menu.appendChild(l2Carb);

  const l3Pos = env.makeEl('div', { attrs: { role: 'presentation', 'data-side': 'right', 'data-nested': '' } });
  const l3Menu = env.makeEl('div', { className: 'agy-overlay', attrs: { role: 'menu', 'data-side': 'right' } });
  for (const tier of ['Minimal', 'Low', 'Medium', 'High', 'Extra']) {
    l3Menu.appendChild(env.makeEl('div', { attrs: { role: 'menuitemradio', 'data-testid': 'orchestrator-picker-effort' }, text: tier }));
  }
  l3Pos.appendChild(l3Menu);
  l2Menu.appendChild(l3Pos);
  l2Pos.appendChild(l2Menu);
  env.body.appendChild(l2Pos);

  const agObs = upstreamLib.installAntigravityObserver({ document: env.doc, window: env.win, MutationObserver: env.win.MutationObserver });

  // 1) SLIDER_CSS keeps v108-i18n prefix intact while excluding L2 rows & data-ag-cs-orch-l2 on both [role='menu'] and div[role='presentation']
  const css = env.doc.getElementById('ag-codex-effort-slider-styles').textContent;
  assert.ok(
    css.includes("html[data-ces-slider-ready='1'] [role='menu']:has([data-testid='orchestrator-picker-effort']):not(:has([data-testid='model-selector-panel'])):not(:has([data-testid='orchestrator-picker-row'])):not([data-ag-cs-orch-l2='1'])"),
    'SLIDER_CSS [role=menu] L3 rule must preserve prefix and exclude L2 rows/marker'
  );
  assert.ok(
    css.includes("html[data-ces-slider-ready='1'] div[role='presentation']:has([data-testid='orchestrator-picker-effort']):not(:has([data-testid='model-selector-panel'])):not(:has([data-testid='orchestrator-picker-row'])):not(:has([data-ag-cs-orch-l2='1']))"),
    'SLIDER_CSS div[role=presentation] L3 rule must exclude L2 positioner wrapper'
  );

  // 2) Cold-mounted L2 with 5 nested L3 effort items stays bound as L2 and NEVER gets tagged orch-l3
  assert.equal(l2Menu.getAttribute('data-ag-cs-orch-l2'), '1', 'L2 menu must stay bound despite 5 nested L3 effort items');
  assert.equal(l2Menu.getAttribute('data-ag-cs-model-submenu'), '1');
  assert.equal(l2Pos.getAttribute('data-ag-cs-model-submenu'), '1', 'Outer L2 presentation wrapper must receive data-ag-cs-model-submenu=1');
  assert.equal(l2Menu.hasAttribute('data-ag-cs-orch-l3'), false, 'L2 menu must NEVER be tagged data-ag-cs-orch-l3');
  assert.equal(l2Pos.hasAttribute('data-ag-cs-orch-l3'), false, 'Outer L2 positioner must NEVER be tagged data-ag-cs-orch-l3');
  assert.equal(l2Neon.getAttribute('data-ces-orch-row'), '1');
  assert.equal(l2Carb.getAttribute('data-ces-orch-row'), '1');

  // 3) Nested L3 menu & its own L3 wrapper are hidden cleanly
  assert.equal(l3Menu.getAttribute('data-ag-cs-orch-l3'), '1', 'Nested L3 menu must be tagged data-ag-cs-orch-l3');
  assert.equal(l3Pos.getAttribute('data-ag-cs-orch-l3'), '1', 'Nested L3 dedicated positioner must be tagged data-ag-cs-orch-l3');

  // 4) Direct flat nested [data-testid="orchestrator-picker-effort"] container without inner [role="menu"] also never unbinds L2
  l3Pos.remove();
  const flatEffWrap = env.makeEl('div', { attrs: { 'data-testid': 'orchestrator-picker-effort' } });
  for (const tier of ['Minimal', 'Low', 'Medium', 'High', 'Extra']) {
    flatEffWrap.appendChild(env.makeEl('div', { attrs: { role: 'menuitemradio' }, text: tier }));
  }
  l2Menu.appendChild(flatEffWrap);
  agObs.rescan();
  assert.equal(l2Menu.getAttribute('data-ag-cs-orch-l2'), '1', 'L2 must stay bound when flat orchestrator-picker-effort children are nested directly');
  assert.equal(l2Menu.hasAttribute('data-ag-cs-orch-l3'), false);
  assert.equal(l2Pos.hasAttribute('data-ag-cs-orch-l3'), false);
  assert.equal(flatEffWrap.getAttribute('data-ag-cs-orch-l3'), '1');

  // 5) Clicking Carbon in L2 still commits smoothly while keeping menu open
  const rCarb = env.simulateNativeClick(l2Carb, () => { isOpen = false; });
  assert.equal(rCarb.ck.defaultPrevented, true);
  assert.equal(rCarb.nativeCalled, false);
  assert.equal(isOpen, true);
  assert.equal(orchPicks[orchPicks.length - 1], carbMed.value);

  // 6) 3-layer Base-UI wrapper (#root > presentation[data-side][data-nested] > .agy-overlay[data-side] > [role=menu]): both outer layers get submenu attr, #root untouched, and cleanup is symmetric
  l2Pos.remove();
  l2Menu.isConnected = false;
  agObs.rescan();
  assert.equal(l2Pos.hasAttribute('data-ag-cs-model-submenu'), false, 'Detached outer L2 positioner must clean up data-ag-cs-model-submenu');
  const appRoot = env.makeEl('div', { attrs: { id: 'root' } });
  const l2Pos3 = env.makeEl('div', { attrs: { role: 'presentation', 'data-side': 'right', 'data-nested': '' } });
  const l2Pop3 = env.makeEl('div', { className: 'agy-overlay', attrs: { 'data-side': 'right' } });
  const l2Menu3 = env.makeEl('div', { attrs: { role: 'menu' } });
  l2Menu3.appendChild(env.makeEl('div', { attrs: { role: 'menuitemradio', 'data-testid': 'orchestrator-picker-row' }, text: 'Gemini 4 Neon Medium' }));
  l2Menu3.appendChild(env.makeEl('div', { attrs: { role: 'menuitemradio', 'data-testid': 'orchestrator-picker-row' }, text: 'Gemini 4 Carbon High' }));
  const sharedL3 = env.makeEl('div', { attrs: { role: 'menu' } });
  sharedL3.appendChild(env.makeEl('div', { attrs: { role: 'menuitemradio', 'data-testid': 'orchestrator-picker-effort' }, text: 'Low' }));
  sharedL3.appendChild(env.makeEl('div', { attrs: { role: 'menuitemradio', 'data-testid': 'orchestrator-picker-effort' }, text: 'High' }));
  l2Pop3.appendChild(l2Menu3);
  l2Pop3.appendChild(sharedL3);
  l2Pos3.appendChild(l2Pop3);
  appRoot.appendChild(l2Pos3);
  env.body.appendChild(appRoot);
  agObs.rescan();
  assert.equal(l2Menu3.getAttribute('data-ag-cs-orch-l2'), '1');
  assert.equal(l2Pop3.getAttribute('data-ag-cs-model-submenu'), '1');
  assert.equal(l2Pos3.getAttribute('data-ag-cs-model-submenu'), '1', 'Outer Base-UI presentation wrapper must receive data-ag-cs-model-submenu=1');
  assert.equal(appRoot.hasAttribute('data-ag-cs-model-submenu'), false, '#root must never be tagged data-ag-cs-model-submenu');
  assert.equal(l2Pop3.hasAttribute('data-ag-cs-orch-l3'), false, 'Shared overlay containing orchestrator-picker-row must never be tagged orch-l3');
  assert.equal(l2Pos3.hasAttribute('data-ag-cs-orch-l3'), false, 'Outer L2 positioner must never be tagged orch-l3');
  assert.equal(sharedL3.getAttribute('data-ag-cs-orch-l3'), '1', 'Dedicated sibling L3 effort menu must be hidden');

  agObs.stop();
  assert.equal(l2Menu3.hasAttribute('data-ag-cs-orch-l2'), false);
  assert.equal(l2Pop3.hasAttribute('data-ag-cs-model-submenu'), false);
  assert.equal(l2Pos3.hasAttribute('data-ag-cs-model-submenu'), false);
  assert.equal(sharedL3.hasAttribute('data-ag-cs-orch-l3'), false);
});

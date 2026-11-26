import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

globalThis.__agCodexEffortSliderDisableAutoBoot = true;
const cdp = require(path.join(ROOT, 'cdp.js'));
const sliderCoexist = require(path.join(ROOT, 'vendor', 'effort-slider', 'slider-coexist.js'));
const upstreamSlider = require(path.join(ROOT, 'vendor', 'effort-slider', 'upstream-client.js'));
const enhancerMod = require(path.join(ROOT, 'host-workbench-enhancer.js'));

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
      this.disabled = false;
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
      if (k === 'disabled') this.disabled = true;
      if (k === 'class') {
        this.classList._set.clear();
        val.split(/\s+/).filter(Boolean).forEach((c) => this.classList._set.add(c));
      }
    }
    getAttribute(k) { const m = attrsMap.get(this); return m.has(k) ? m.get(k) : null; }
    hasAttribute(k) { return attrsMap.get(this).has(k); }
    removeAttribute(k) {
      attrsMap.get(this).delete(k);
      if (k === 'disabled') this.disabled = false;
    }
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
    addEventListener(type, fn, capture = false) {
      const key = `${type}:${capture ? 1 : 0}`;
      if (!this._listeners.has(key)) this._listeners.set(key, []);
      this._listeners.get(key).push(fn);
    }
    removeEventListener(type, fn, capture = false) {
      const key = `${type}:${capture ? 1 : 0}`;
      const arr = this._listeners.get(key);
      if (!arr) return;
      const i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
    }
    dispatchEvent(ev) {
      ev.target = ev.target || this;
      ev.preventDefault = ev.preventDefault || (() => { ev.defaultPrevented = true; });
      ev.stopPropagation = ev.stopPropagation || (() => {});
      const pathNodes = [];
      let cur = this;
      while (cur) { pathNodes.push(cur); cur = cur.parentNode; }
      pathNodes.push(doc);
      for (let i = pathNodes.length - 1; i >= 0; i--) {
        const arr = (pathNodes[i]._listeners.get(`${ev.type}:1`) || []).slice();
        for (const fn of arr) fn.call(pathNodes[i], ev);
      }
      for (let i = 0; i < pathNodes.length; i++) {
        const arr = (pathNodes[i]._listeners.get(`${ev.type}:0`) || []).slice();
        for (const fn of arr) fn.call(pathNodes[i], ev);
      }
      return !ev.defaultPrevented;
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
    getBoundingClientRect() { return { left: 0, top: 0, width: 240, height: 28, right: 240, bottom: 28 }; }
    getContext() {
      return {
        clearRect() {}, fillRect() {}, save() {}, restore() {},
        createLinearGradient() { return { addColorStop() {} }; },
      };
    }
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
    addEventListener(type, fn, capture = false) {
      const key = `${type}:${capture ? 1 : 0}`;
      if (!this._listeners.has(key)) this._listeners.set(key, []);
      this._listeners.get(key).push(fn);
    },
    removeEventListener(type, fn, capture = false) {
      const key = `${type}:${capture ? 1 : 0}`;
      const arr = this._listeners.get(key);
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
  const store = new Map();
  const win = {
    document: doc,
    innerWidth: 1200,
    innerHeight: 800,
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    addEventListener() {},
    removeEventListener() {},
    AntigravityCodexEffortSlider: upstreamSlider,
  };
  doc.defaultView = win;
  return { doc, win };
}

test('v2.35.0: effortMemory restores remembered Medium on Orchestrator & Executor when host defaults to High, with 0 redundant commits when already matched', async () => {
  const { doc, win } = createFakeDom();
  const neonLow = { label: 'Gemini 4 Neon (Low)', value: 1534 };
  const neonMed = { label: 'Gemini 4 Neon (Medium)', value: 1533 };
  const neonHigh = { label: 'Gemini 4 Neon (High)', value: 1532 };
  const neonXHigh = { label: 'Gemini 4 Neon (XHigh)', value: 1535 };
  const opusMed = { label: 'Claude Opus 5.5 (Medium)', value: 1401 };
  const opusHigh = { label: 'Claude Opus 5.5 (High)', value: 1402 };
  const orchOpt = { label: 'Orchestrator (Neon)', modelId: 'gemini-pro-orchestrator-neon', value: 1537 };

  const effortIndex = new Map([
    ['Gemini 4 Neon', new Map([['low', neonLow], ['medium', neonMed], ['high', neonHigh], ['xhigh', neonXHigh]])],
    ['Claude Opus 5.5', new Map([['medium', opusMed], ['high', opusHigh]])],
  ]);

  const committedModels = [];
  const committedOrch = [];
  const allOpts = [neonLow, neonMed, neonHigh, neonXHigh, opusMed, opusHigh, orchOpt];
  const fiberProps = {
    selectedModel: neonMed,
    modelOptions: allOpts,
    effortIndex,
    orchestratorPlanners: [neonLow, neonMed, neonHigh, neonXHigh, opusMed, opusHigh],
    orchestratorPlannerIndex: effortIndex,
    // Antigravity v2.35.0: default Orchestrator planner starts at High
    orchestratorDefaultPlanner: neonHigh,
    orchestratorPick: {
      model: neonMed.value,
      select(v) {
        fiberProps.orchestratorPick.model = v;
        committedOrch.push(v);
      },
    },
    setModelConfigByLabelForConversation(lbl) {
      const hit = allOpts.find((o) => o.label === lbl);
      if (hit) fiberProps.selectedModel = hit;
      committedModels.push(lbl);
    },
  };

  const trig = doc.createElement('button');
  trig.setAttribute('data-testid', 'model-selector-trigger');
  const providerFiber = { memoizedProps: { value: fiberProps }, return: null };
  trig.__reactFiber$v235 = { memoizedProps: fiberProps, return: providerFiber };
  doc.body.appendChild(trig);

  const ctl = sliderCoexist.createEffortSliderController({ window: win, document: doc });
  ctl.sync({ effortSliderModule: 'off', effortMemory: 'on' });

  // 1) Remember Neon Medium for Executor, switch to Opus High, then click Neon row where v2.35 native click picks High -> must restore Medium
  fiberProps.selectedModel = opusHigh;
  const panel = doc.createElement('div');
  panel.setAttribute('data-testid', 'model-selector-panel');
  panel.__reactFiber$v235 = { memoizedProps: fiberProps, return: providerFiber };
  const neonItem = doc.createElement('div');
  neonItem.setAttribute('role', 'menuitem');
  const neonGrp = doc.createElement('span');
  neonGrp.setAttribute('data-testid', 'model-selector-effort-group');
  neonGrp.setAttribute('data-model-base', 'Gemini 4 Neon');
  neonGrp.textContent = 'Gemini 4 Neon';
  const neonSib = doc.createElement('span');
  neonSib.textContent = 'High';
  neonItem.appendChild(neonGrp);
  neonItem.appendChild(neonSib);
  panel.appendChild(neonItem);
  doc.body.appendChild(panel);

  ctl.sync({ effortSliderModule: 'off', effortMemory: 'on' });
  assert.equal(neonSib.textContent, 'Medium');

  committedModels.length = 0;
  neonItem.dispatchEvent({ type: 'click', target: neonGrp });
  fiberProps.selectedModel = neonHigh; // v2.35 host defaults to High
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(committedModels, ['Gemini 4 Neon (Medium)'], 'must restore remembered Medium when v2.35 host defaults to High');

  // 2) If host native click already selected Medium (e.g. v2.34), guard must make 0 redundant commits
  fiberProps.selectedModel = opusHigh;
  committedModels.length = 0;
  neonItem.dispatchEvent({ type: 'click', target: neonGrp });
  fiberProps.selectedModel = neonMed; // host already selected Medium
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(committedModels, [], 'must avoid redundant commit when host already selected remembered tier');

  // 3) Remember Neon Medium in Orchestrator (where orchDef = Neon High), switch away, click Orchestrator L2 Neon row -> must restore Medium
  fiberProps.selectedModel = orchOpt;
  fiberProps.orchestratorPick.model = neonMed.value;
  ctl.sync({ effortSliderModule: 'off', effortMemory: 'on' });

  fiberProps.selectedModel = opusHigh;
  const orchNeonRow = doc.createElement('div');
  orchNeonRow.setAttribute('data-testid', 'orchestrator-picker-row');
  orchNeonRow.setAttribute('data-model-base', 'Gemini 4 Neon');
  doc.body.appendChild(orchNeonRow);

  committedOrch.length = 0;
  orchNeonRow.dispatchEvent({ type: 'click', target: orchNeonRow });
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(committedOrch, [neonMed.value], 'Orchestrator effortMemory must restore remembered Medium when orchDef is High');
  // Host finishes switching to Orchestrator with restored Medium, clearing the short-lived restore lock
  fiberProps.selectedModel = orchOpt;
  ctl.sync({ effortSliderModule: 'off', effortMemory: 'on' });

  // 4) If remembered Orchestrator effort equals orchDef (High), guard skips redundant commit
  fiberProps.orchestratorPick.model = neonHigh.value;
  ctl.sync({ effortSliderModule: 'off', effortMemory: 'on' });
  fiberProps.selectedModel = opusHigh;
  committedOrch.length = 0;
  orchNeonRow.dispatchEvent({ type: 'click', target: orchNeonRow });
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(committedOrch, [], 'Orchestrator effortMemory must skip redundant commit when remembered effort matches orchDef High');

  ctl.destroy();
});

test('v2.35.0: locked model trigger during running turn locks effort slider, blocks commits, and unlocks cleanly after turn ends', () => {
  const { doc, win } = createFakeDom();
  const neonLow = { label: 'Gemini 4 Neon (Low)', value: 1534 };
  const neonHigh = { label: 'Gemini 4 Neon (High)', value: 1532 };
  const effortIndex = new Map([['Gemini 4 Neon', new Map([['low', neonLow], ['high', neonHigh]])]]);

  const commits = [];
  const fiberProps = {
    selectedModel: neonHigh,
    modelOptions: [neonLow, neonHigh],
    effortIndex,
    setModelConfigByLabelForConversation(lbl) {
      commits.push(lbl);
      const hit = [neonLow, neonHigh].find((o) => o.label === lbl);
      if (hit) fiberProps.selectedModel = hit;
    },
  };

  const trig = doc.createElement('button');
  trig.setAttribute('data-testid', 'model-selector-trigger');
  const providerFiber = { memoizedProps: { value: fiberProps }, return: null };
  trig.__reactFiber$lock = { memoizedProps: fiberProps, return: providerFiber };
  doc.body.appendChild(trig);

  const panel = doc.createElement('div');
  panel.setAttribute('data-testid', 'model-selector-panel');
  const listWrap = doc.createElement('div');
  panel.appendChild(listWrap);
  panel.__reactFiber$lock = { memoizedProps: fiberProps, return: providerFiber };
  doc.body.appendChild(panel);

  const observedFilters = [];
  class CaptureMO {
    constructor(cb) { this.cb = cb; }
    observe(_t, opts) { if (opts?.attributeFilter) observedFilters.push(opts.attributeFilter); }
    disconnect() {}
    takeRecords() { return []; }
  }

  const inst = upstreamSlider.installAntigravityObserver({ document: doc, window: win, MutationObserver: CaptureMO });
  try {
    assert.ok(
      observedFilters.some((f) => f.includes('disabled') && f.includes('aria-disabled') && f.includes('data-disabled')),
      'observer must watch disabled/aria-disabled/data-disabled attribute changes on trigger'
    );

    const sliderRoot = panel.querySelector('.ces-root');
    const track = panel.querySelector('.ces-track');
    assert.ok(sliderRoot && track);
    assert.equal(sliderRoot.getAttribute('aria-disabled'), 'false');
    assert.equal(track.classList.contains('is-locked'), false);

    // Lock trigger via native disabled / aria-disabled / bare data-disabled (mid-turn in v2.35.0)
    for (const lockCase of [
      () => trig.setAttribute('disabled', ''),
      () => { trig.removeAttribute('disabled'); trig.setAttribute('aria-disabled', 'true'); },
      () => { trig.removeAttribute('aria-disabled'); trig.setAttribute('data-disabled', ''); },
    ]) {
      lockCase();
      inst.rescan();
      assert.equal(sliderRoot.getAttribute('aria-disabled'), 'true');
      assert.equal(track.classList.contains('is-locked'), true);
      commits.length = 0;
      sliderRoot.dispatchEvent({ type: 'keydown', key: 'ArrowLeft' });
      assert.deepEqual(commits, [], 'locked trigger must block keyboard effort commits mid-turn');
    }

    // Unlock trigger via data-disabled="false" -> slider unlocks and accepts commits again
    trig.setAttribute('data-disabled', 'false');
    inst.rescan();
    assert.equal(sliderRoot.getAttribute('aria-disabled'), 'false');
    assert.equal(track.classList.contains('is-locked'), false);
    sliderRoot.dispatchEvent({ type: 'keydown', key: 'ArrowLeft' });
    assert.deepEqual(commits, ['Gemini 4 Neon (Low)'], 'unlocked trigger must resume effort commits');
  } finally {
    inst.stop();
  }
});

test('v2.35.0: style.css handles locked model/permissions triggers with zero :has() and within 549,500 B Ch1 budget, and host-enhancer ignores locked permissions click', () => {
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  assert.equal(/:has\(/.test(css), false, 'style.css must maintain 0 :has()');
  assert.ok(
    css.includes('& :is([data-testid="model-selector-trigger"],[data-testid="permissions-selector-trigger"]):is(:disabled,[aria-disabled="true"],[data-disabled]:not([data-disabled="false"])){opacity:.58 !important;cursor:not-allowed !important;transform:none !important;}'),
    'style.css must style locked model/permissions triggers with shared merged rule (opacity, not-allowed cursor, transform:none)'
  );
  assert.ok(
    css.includes('&:not(:disabled,[aria-disabled="true"],[data-disabled=""],[data-disabled="true"]):hover{'),
    'model-selector-trigger hover rule must exclude disabled/locked states'
  );
  assert.ok(
    css.includes('&:not(:disabled,[aria-disabled="true"],[data-disabled=""],[data-disabled="true"]):is(:hover,[aria-expanded="true"]){'),
    'permissions-selector-trigger hover/expanded rule must exclude disabled/locked states'
  );
  assert.ok(
    css.includes('& [data-testid="permissions-selector-trigger"]:not(:disabled,[aria-disabled="true"],[data-disabled=""],[data-disabled="true"]):is(:hover,[aria-expanded="true"]){'),
    'light theme permissions-selector-trigger hover rule must exclude disabled/locked states'
  );

  for (const lang of ['auto', 'zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'es', 'fr', 'de']) {
    const payloadBytes = Buffer.byteLength(cdp.buildInjectExpression({ ...cdp.DEFAULT_CONFIG, language: lang }, { bundleCachePath: '' }), 'utf8');
    assert.ok(payloadBytes < 580000, `Channel 1 (${lang}) payload must stay < 580,000 B, got ${payloadBytes}`);
  }

  // Verify host-workbench-enhancer ignores clicks on disabled permissions-selector-trigger
  const { doc } = createFakeDom();
  let rafCalls = 0;
  const clickListeners = [];
  const win = {
    document: doc,
    requestAnimationFrame() { rafCalls += 1; return 1; },
    cancelAnimationFrame() {},
    addEventListener(type, fn, cap) { if (type === 'click' && cap) clickListeners.push(fn); },
    removeEventListener() {},
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
  };
  const ctl = enhancerMod.createHostEnhancerController({ doc, win });
  try {
    const btn = doc.createElement('button');
    btn.setAttribute('data-testid', 'permissions-selector-trigger');
    btn.setAttribute('aria-disabled', 'true');
    doc.body.appendChild(btn);

    for (const fn of clickListeners) fn({ target: btn });
    assert.equal(rafCalls, 0, 'clicking a locked permissions trigger must not schedule menu sync rAF');

    btn.removeAttribute('aria-disabled');
    btn.setAttribute('data-disabled', '');
    for (const fn of clickListeners) fn({ target: btn });
    assert.equal(rafCalls, 0, 'clicking a bare data-disabled permissions trigger must not schedule menu sync rAF');

    btn.setAttribute('data-disabled', 'false');
    for (const fn of clickListeners) fn({ target: btn });
    assert.equal(rafCalls, 1, 'clicking an unlocked permissions trigger must schedule menu sync rAF');
  } finally {
    ctl.destroy();
  }
});

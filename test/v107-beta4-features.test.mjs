import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const cdp = require(path.join(ROOT, 'cdp.js'));
const locales = require(path.join(ROOT, 'i18n-locales.js'));
const sliderCoexist = require(path.join(ROOT, 'vendor', 'effort-slider', 'slider-coexist.js'));
const upstreamSlider = require(path.join(ROOT, 'vendor', 'effort-slider', 'upstream-client.js'));
const hostI18nFactory = require(path.join(ROOT, 'vendor', 'host-i18n', 'host-i18n-runtime.js'));
const dualMascotRig = require(path.join(ROOT, 'dual-mascot-rig.js'));

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
    _syncClass() {
      attrsMap.get(this).set('class', [...this.classList._set].join(' '));
    }
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
      if (k === 'class') {
        this.classList._set.clear();
        val.split(/\s+/).filter(Boolean).forEach((c) => this.classList._set.add(c));
      }
    }
    getAttribute(k) { const m = attrsMap.get(this); return m.has(k) ? m.get(k) : null; }
    hasAttribute(k) { return attrsMap.get(this).has(k); }
    removeAttribute(k) { attrsMap.get(this).delete(k); }
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
      const pathNodes = [];
      let cur = this;
      while (cur) { pathNodes.push(cur); cur = cur.parentNode; }
      pathNodes.push(doc);
      // capture
      for (let i = pathNodes.length - 1; i >= 0; i--) {
        const arr = (pathNodes[i]._listeners.get(`${ev.type}:1`) || []).slice();
        for (const fn of arr) fn.call(pathNodes[i], ev);
      }
      // bubble
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
    getBoundingClientRect() { return { left: 0, top: 0, width: 400, height: 80, right: 400, bottom: 80 }; }
    getContext() {
      return {
        clearRect() {}, fillRect() {}, save() {}, restore() {}, translate() {}, scale() {},
        beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, rect() {}, clip() {}, fill() {}, stroke() {},
        setTransform() {}, createLinearGradient() { return { addColorStop() {} }; },
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
    devicePixelRatio: 1,
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
  return { doc, win, store };
}

test('v1.0.7-beta.4: dual-mascot-rig peek mode enforces full pointer pass-through and zero interaction', () => {
  const { doc } = createFakeDom();
  const host = doc.createElement('div');
  host.className = 'ag-cs-crab ag-cs-dual-stage';
  doc.body.appendChild(host);

  const rig = dualMascotRig.mountDualMascotStage(host, { yieldMode: 'none', reducedMotion: true, miniPileEnabled: true });
  assert.ok(rig);
  assert.equal(host.getAttribute('data-ag-mascot-peek'), null);
  const actors = host.querySelectorAll('.ag-v2-mascot-actor');
  assert.equal(actors.length, 2);
  for (const a of actors) {
    assert.equal(a.getAttribute('tabindex'), '-1', 'Issue #58 Bug 3: decorative mascot actors must stay out of Tab order');
  }
  const miniCrabs = host.querySelectorAll('.ag-v2-mini-crab-canvas');
  assert.ok(miniCrabs.length > 0, 'mini-crabs must mount when miniPileEnabled is true');

  // Switch into peek mode
  rig.setState({ yieldMode: 'peek' });
  assert.equal(host.getAttribute('data-ag-mascot-peek'), '1');
  for (const a of actors) {
    assert.equal(a.getAttribute('tabindex'), '-1');
    assert.equal(a.getAttribute('aria-hidden'), 'true');
    assert.equal(a.style.pointerEvents, 'none');
    assert.equal(a.style.zIndex, '8');
  }
  for (const mc of miniCrabs) {
    assert.equal(mc.style.pointerEvents, 'none', 'mini-crabs must disable pointer events in peek mode');
    assert.equal(mc.style.zIndex, '8', 'mini-crabs must drop to z-index 8 behind popups in peek mode');
    assert.match(mc.style.transform || '', /translate3d\([^,]+,\s*2px,\s*0\)/, 'mini-crabs must gently crouch by +2px in peek mode');
  }

  // Dispatch pointerdown + contextmenu while peeking -> must NOT call preventDefault / stopPropagation
  let prevented = false;
  let stopped = false;
  const evDown = {
    type: 'pointerdown',
    button: 0,
    clientX: 10,
    clientY: 10,
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; prevented = true; },
    stopPropagation() { stopped = true; },
  };
  actors[0].dispatchEvent(evDown);
  assert.equal(prevented, false, 'pointerdown in peek mode must pass through without preventDefault');
  assert.equal(stopped, false, 'pointerdown in peek mode must pass through without stopPropagation');

  const evCtx = {
    type: 'contextmenu',
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; prevented = true; },
    stopPropagation() { stopped = true; },
  };
  actors[0].dispatchEvent(evCtx);
  assert.equal(prevented, false, 'contextmenu in peek mode must pass through');

  // Return to normal mode
  rig.setState({ yieldMode: 'none' });
  assert.equal(host.getAttribute('data-ag-mascot-peek'), null);
  for (const a of actors) {
    assert.equal(a.getAttribute('tabindex'), '-1', 'Issue #58 Bug 3: exiting peek must keep mascot actors at tabindex="-1"');
    assert.equal(a.style.pointerEvents, '');
  }
  for (const mc of miniCrabs) {
    assert.equal(mc.style.pointerEvents, 'auto', 'mini-crabs must restore pointerEvents=auto after exiting peek');
    assert.equal(mc.style.zIndex, '25', 'mini-crabs must restore normal z-index after exiting peek');
  }

  rig.dispose();

  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  assert.ok(css.includes('.ag-cs-crab[data-ag-mascot-peek="1"]'), 'style.css must style peek pass-through');
  assert.ok(
    /\.ag-cs-crab\[data-ag-mascot-peek="1"\][^{]*\{z-index:8 !important;/.test(css),
    'peek mascot stage must sit at z-index 8 (> prism rim 7, < takeover card 12)'
  );
  assert.ok(
    css.includes('& .surface-composer-card>.ag-cs-prism-rim-cv,& [data-ag-cs-prism-reflect="bottom"]>.ag-cs-prism-rim-cv{') &&
      /\.surface-composer-card>\.ag-cs-prism-rim-cv[^{]*\{[^}]*z-index:7 !important;/.test(css),
    'prism rim canvas must sit at z-index 7 so peeking mascots cover the rim cleanly'
  );
  assert.ok(
    css.includes('[data-testid="input-box-bottom-toolbar"]{pointer-events:none !important;'),
    'Issue #39: input-box-bottom-toolbar transparent container must pass pointer events through to mascot stage'
  );
  assert.ok(!/:has\(/.test(css), 'style.css must stay 0 :has()');
});

test('v1.0.7-beta.4: effortMemory guard remembers per-model & Orchestrator effort when slider is off', async () => {
  const { doc, win } = createFakeDom();
  const argonLow = { label: 'Gemini 4 Argon (Low)', value: 101 };
  const argonMed = { label: 'Gemini 4 Argon (Medium)', value: 102 };
  const argonHigh = { label: 'Gemini 4 Argon (High)', value: 103 };
  const neonMed = { label: 'Gemini 4 Neon (Medium)', value: 201 };
  const neonHigh = { label: 'Gemini 4 Neon (High)', value: 202 };
  const orchOpt = { label: 'Orchestrator', modelId: 'gemini-pro-orchestrator', value: 300 };
  const opusLow = { label: 'Claude Opus 5.5 (Low)', value: 401 };
  const opusMed = { label: 'Claude Opus 5.5 (Medium)', value: 402 };
  const opusHigh = { label: 'Claude Opus 5.5 (High)', value: 403 };

  const effortIndex = new Map([
    ['Gemini 4 Argon', new Map([['low', argonLow], ['medium', argonMed], ['high', argonHigh]])],
    ['Gemini 4 Neon', new Map([['medium', neonMed], ['high', neonHigh]])],
  ]);
  const orchIdx = new Map([
    ['Claude Opus 5.5', new Map([['low', opusLow], ['medium', opusMed], ['high', opusHigh]])],
  ]);

  let selectedModel = argonHigh;
  let orchModelVal = opusLow.value;
  let setIsOpenCalls = 0;
  const committedModels = [];
  const committedKeepOpenArgs = [];
  const committedOrch = [];
  const allModelOpts = [argonLow, argonMed, argonHigh, neonMed, neonHigh, orchOpt];

  const fiberProps = {
    selectedModel,
    modelOptions: allModelOpts,
    effortIndex,
    orchestratorPlanners: [opusLow, opusMed, opusHigh],
    orchestratorPlannerIndex: orchIdx,
    orchestratorDefaultPlanner: opusMed,
    orchestratorPick: {
      model: orchModelVal,
      select(v) {
        orchModelVal = v;
        fiberProps.orchestratorPick.model = v;
        committedOrch.push(v);
      },
    },
    setModelConfigByLabelForConversation(lbl, _cid, keepOpen) {
      const hit = allModelOpts.find((o) => o.label === lbl);
      if (hit) {
        selectedModel = hit;
        fiberProps.selectedModel = hit;
      }
      committedModels.push(lbl);
      committedKeepOpenArgs.push(keepOpen);
    },
    setSelectedModel(opt) {
      selectedModel = opt;
      fiberProps.selectedModel = opt;
      committedModels.push(opt.label);
    },
    setIsOpen() { setIsOpenCalls += 1; },
  };

  const trig = doc.createElement('button');
  trig.setAttribute('data-testid', 'model-selector-trigger');
  const providerFiber = { memoizedProps: { value: fiberProps }, return: null };
  trig.__reactFiber$test = { memoizedProps: fiberProps, return: providerFiber };
  doc.body.appendChild(trig);

  const ctl = sliderCoexist.createEffortSliderController({ window: win, document: doc });
  const st1 = ctl.sync({ effortSliderModule: 'off', effortMemory: 'on' });
  assert.equal(st1.mountedPrism, false);
  assert.equal(st1.memoryGuardActive, true);
  assert.equal(doc.getElementById('ag-codex-effort-slider-styles'), null, 'slider CSS must not mount when slider is off');

  // Switch host selection to Neon Medium, then open native panel
  fiberProps.selectedModel = neonMed;
  const panel = doc.createElement('div');
  panel.setAttribute('data-testid', 'model-selector-panel');
  panel.__reactFiber$test = { memoizedProps: fiberProps, return: providerFiber };

  const argonItem = doc.createElement('div');
  argonItem.setAttribute('role', 'menuitem');
  const argonGrp = doc.createElement('span');
  argonGrp.setAttribute('data-testid', 'model-selector-effort-group');
  argonGrp.setAttribute('data-model-base', 'Gemini 4 Argon');
  argonGrp.textContent = 'Gemini 4 Argon';
  const argonSib = doc.createElement('span');
  argonSib.textContent = 'Medium';
  argonItem.appendChild(argonGrp);
  argonItem.appendChild(argonSib);
  panel.appendChild(argonItem);
  doc.body.appendChild(panel);

  ctl.sync({ effortSliderModule: 'off', effortMemory: 'on' });
  assert.equal(argonSib.textContent, 'High', 'non-selected model row should display remembered High instead of Medium');

  // Click Argon main row (simulates native onDesktopClick switching to Medium, guard restores High in microtask)
  argonItem.dispatchEvent({ type: 'click', target: argonGrp });
  fiberProps.selectedModel = argonMed; // native click selects Medium
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(fiberProps.selectedModel.label, 'Gemini 4 Argon (High)');
  assert.equal(setIsOpenCalls, 0, 'memory guard must NOT force menu open');
  assert.deepEqual(committedKeepOpenArgs, [false], 'setModelConfigByLabelForConversation must receive keepOpen=false in memory-only mode');

  // Explicit click inside Thinking effort submenu for Medium must NOT be overridden
  const subOpt = doc.createElement('span');
  subOpt.setAttribute('data-testid', 'model-selector-effort-option');
  subOpt.setAttribute('data-effort', 'medium');
  subOpt.textContent = 'Medium';
  doc.body.appendChild(subOpt);
  committedModels.length = 0;
  subOpt.dispatchEvent({ type: 'click', target: subOpt });
  fiberProps.selectedModel = argonMed;
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(committedModels.length, 0, 'explicit submenu click must not be overridden');

  // Record Orchestrator Opus Low, switch away to Neon, then click Orchestrator L2 row -> restores Low
  fiberProps.selectedModel = orchOpt;
  fiberProps.orchestratorPick.model = opusLow.value;
  ctl.sync({ effortSliderModule: 'off', effortMemory: 'on' });

  fiberProps.selectedModel = neonMed;
  const orchL2Row = doc.createElement('div');
  orchL2Row.setAttribute('data-testid', 'orchestrator-picker-row');
  orchL2Row.setAttribute('data-model-base', 'Claude Opus 5.5');
  const orchL2Eff = doc.createElement('span');
  orchL2Eff.className = 'shrink-0 opacity-70';
  orchL2Eff.textContent = 'Medium';
  orchL2Row.appendChild(orchL2Eff);
  doc.body.appendChild(orchL2Row);

  ctl.sync({ effortSliderModule: 'off', effortMemory: 'on' });
  assert.equal(orchL2Eff.textContent, 'Low', 'Orchestrator L2 row should display remembered Low');

  committedOrch.length = 0;
  orchL2Row.dispatchEvent({ type: 'click', target: orchL2Row });
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(committedOrch, [opusLow.value]);

  // Fallback non-testid Orchestrator L2 submenu click must ALSO restore remembered Low, while L3 explicit click must NOT override
  const nonTestIdSub = doc.createElement('div');
  nonTestIdSub.setAttribute('role', 'menu');
  const subPlanItem = doc.createElement('div');
  subPlanItem.setAttribute('role', 'menuitem');
  subPlanItem.textContent = 'Claude Opus 5.5';
  nonTestIdSub.appendChild(subPlanItem);
  doc.body.appendChild(nonTestIdSub);

  committedOrch.length = 0;
  subPlanItem.dispatchEvent({ type: 'click', target: subPlanItem });
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(committedOrch, [opusLow.value], 'non-testid Orchestrator L2 fallback must restore remembered Low');

  const nonTestIdL3 = doc.createElement('div');
  nonTestIdL3.setAttribute('role', 'menu');
  const l3Med = doc.createElement('div');
  l3Med.setAttribute('role', 'menuitem');
  l3Med.textContent = 'Medium';
  nonTestIdL3.appendChild(l3Med);
  doc.body.appendChild(nonTestIdL3);

  committedOrch.length = 0;
  l3Med.dispatchEvent({ type: 'click', target: l3Med });
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(committedOrch, [], 'explicit L3 effort click must NOT be overridden');

  // Turning effortMemory off stops guard completely
  const stOff = ctl.sync({ effortSliderModule: 'off', effortMemory: 'off' });
  assert.equal(stOff.memoryGuardActive, false);
  ctl.destroy();
});

test('v1.0.7-beta.4: host-i18n rollbackAllSnapshots restores detached-then-reattached nodes without leaks', () => {
  const { doc, win } = createFakeDom();
  const btn = doc.createElement('button');
  btn.setAttribute('aria-label', 'Settings');
  const txt = doc.createTextNode('Settings');
  btn.appendChild(txt);
  doc.body.appendChild(btn);

  const inst = hostI18nFactory.mountHostI18n({
    root: win,
    doc,
    mode: 'on',
    dict: { exact: { Settings: '设置' } },
  });
  assert.equal(txt.nodeValue, '设置');
  assert.equal(btn.getAttribute('aria-label'), '设置');

  // Simulate React temporarily detaching node while tracker prunes, then reattaching same node
  doc.body.removeChild(btn);
  inst.getStatus(); // triggers countTranslatedUnits -> prune()
  doc.body.appendChild(btn);

  // Destroy must STILL roll back both text and aria-label!
  inst.destroy();
  assert.equal(txt.nodeValue, 'Settings');
  assert.equal(btn.getAttribute('aria-label'), 'Settings');
});

test('v1.0.7-beta.4: effort slider settings popup & new i18n keys have complete English translations', () => {
  const { doc, win } = createFakeDom();
  doc.documentElement.setAttribute('data-ag-cs-lang', 'en');
  const close = upstreamSlider.openSettingsPanel({ document: doc, window: win });
  const dlg = doc.querySelector('.ces-set');
  assert.ok(dlg);
  assert.ok(!/[\u4e00-\u9fff]/.test(dlg.textContent), `English slider settings popup leaked Chinese: ${dlg.textContent}`);
  assert.ok(dlg.textContent.includes('Effort Slider'));
  assert.ok(dlg.textContent.includes('Animation'));
  assert.ok(dlg.textContent.includes('Close'));
  close();

  for (const lang of ['zh-CN', 'zh-TW', 'yue', 'en', 'ja']) {
    const ui = locales.getUiStrings(lang);
    assert.ok(ui.setEffortMemoryTitle, `missing setEffortMemoryTitle for ${lang}`);
    assert.ok(ui.setEffortMemoryDesc, `missing setEffortMemoryDesc for ${lang}`);
    assert.ok(ui.hostI18nOffExtHint, `missing hostI18nOffExtHint for ${lang}`);
  }
  const enUi = locales.getUiStrings('en');
  assert.ok(!/[\u4e00-\u9fff]/.test(enUi.setEffortMemoryTitle + enUi.setEffortMemoryDesc + enUi.hostI18nOffExtHint));
});

test('v1.0.7-beta.4: Issue #38 macOS relaunch normalizes .app bundle, strips ELECTRON_RUN_AS_NODE, waits for Helpers & SingletonLock, uses open -na', () => {
  assert.equal(
    cdp.normalizeMacAppBundlePath('/Applications/Antigravity.app/Contents/MacOS/Antigravity'),
    '/Applications/Antigravity.app'
  );
  assert.equal(
    cdp.normalizeMacAppBundlePath('/Users/alice/Applications/Antigravity.app/Contents/Frameworks/Antigravity Helper.app'),
    '/Users/alice/Applications/Antigravity.app'
  );
  assert.equal(cdp.normalizeMacAppBundlePath(''), '/Applications/Antigravity.app');

  const sh = cdp.MAC_DETACHED_RELAUNCH_SH;
  assert.ok(sh.includes('unset ELECTRON_RUN_AS_NODE'));
  assert.ok(sh.includes('SingletonLock'));
  assert.ok(sh.includes('Contents/MacOS/'));
  assert.ok(sh.includes('open -na "$app_path" --args --remote-debugging-port=0'));
  assert.ok(sh.includes('on run argv'), 'AppleScript quit must use argv instead of string interpolation');
});

test('v1.0.7-beta.4: ui-runtime switches host-i18n to off reverse-restore on off and destroys on auto+en, loads Ch9 Settings, and toggles mascot peek on takeover/queued/model-menu', () => {
  const vm = require('node:vm');
  const { doc, win } = createFakeDom();
  doc.documentElement.setAttribute('data-ag-prism-host-i18n', 'active');

  let hostI18nDestroyed = 0;
  let hostI18nModes = [];
  win.__agPrismHostI18n = {
    destroy() {
      hostI18nDestroyed += 1;
      doc.documentElement.removeAttribute('data-ag-prism-host-i18n');
    },
    setMode(m) {
      hostI18nModes.push(m);
      doc.documentElement.setAttribute('data-ag-prism-host-i18n', m === 'off' ? 'off-enforced' : 'active');
    },
  };
  win.performance = { now: () => Date.now() };
  win.requestAnimationFrame = () => 0;
  win.cancelAnimationFrame = () => {};
  win.setTimeout = setTimeout;
  win.clearTimeout = clearTimeout;
  win.setInterval = () => 0;
  win.clearInterval = () => {};
  win.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  win.getComputedStyle = () => ({ display: 'block', visibility: 'visible', opacity: '1', position: 'static', getPropertyValue: () => '' });
  win.ResizeObserver = class { observe() {} disconnect() {} };
  win.MutationObserver = class { observe() {} disconnect() {} takeRecords() { return []; } };
  win.HTMLElement = Object;
  win.Element = Object;
  win.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3 };
  win.navigator = { language: 'zh-CN' };

  // Build composer + model-selector + takeover card + settings panel with external zh marker
  const conv = doc.createElement('div');
  conv.setAttribute('data-testid', 'conversation-view');
  const inputBox = doc.createElement('div');
  inputBox.setAttribute('data-testid', 'agent-input-box');
  const card = doc.createElement('div');
  card.className = 'surface-composer-card';
  const trig = doc.createElement('button');
  trig.setAttribute('data-testid', 'model-selector-trigger');
  trig.textContent = 'Gemini 4 Argon Medium';
  card.appendChild(trig);
  inputBox.appendChild(card);
  conv.appendChild(inputBox);
  doc.body.appendChild(conv);

  const extBadge = doc.createElement('div');
  extBadge.setAttribute('data-agy-hans-ui', '1');
  doc.body.appendChild(extBadge);

  const sandbox = {
    window: null,
    globalThis: null,
    document: doc,
    console,
    setTimeout,
    clearTimeout,
    setInterval: () => 0,
    clearInterval: () => {},
    performance: win.performance,
    navigator: win.navigator,
    location: { href: 'https://127.0.0.1:7020/c/11111111-1111-1111-1111-111111111111', pathname: '/c/11111111-1111-1111-1111-111111111111' },
    localStorage: win.localStorage,
    requestAnimationFrame: win.requestAnimationFrame,
    cancelAnimationFrame: win.cancelAnimationFrame,
    matchMedia: win.matchMedia,
    getComputedStyle: win.getComputedStyle,
    ResizeObserver: win.ResizeObserver,
    MutationObserver: win.MutationObserver,
    HTMLElement: win.HTMLElement,
    Element: win.Element,
    Node: win.Node,
    __agPrismHostI18n: win.__agPrismHostI18n,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  doc.defaultView = sandbox;

  const expr = cdp.buildInjectExpression({ ...cdp.DEFAULT_CONFIG, hostLocalization: 'on', language: 'zh-CN' });
  const res = vm.runInNewContext(expr, sandbox);
  assert.equal(res.status, 'ok');
  try {
    // Initially no popup/card -> mascot NOT peeking
    const crab = card.querySelector('.ag-cs-crab');
    assert.ok(crab);
    assert.equal(crab.getAttribute('data-ag-mascot-peek'), null);

    // Add visible Q&A takeover card -> mascot enters peek mode
    const tk = doc.createElement('div');
    tk.setAttribute('data-testid', 'interaction-takeover-card');
    tk.textContent = 'Question?';
    conv.insertBefore(tk, inputBox);
    sandbox.__agPrism.sync();
    assert.equal(crab.getAttribute('data-ag-mascot-peek'), '1', 'takeover card must trigger peek');

    // Remove takeover card, open native model menu -> Issue #58: native model menu must NOT force mascot peek (keeps crabs visible while style.css:534 blocks misclicks)
    tk.remove();
    const mdl = doc.createElement('div');
    mdl.setAttribute('data-testid', 'model-selector-panel');
    doc.body.appendChild(mdl);
    sandbox.__agPrism.sync();
    assert.equal(doc.documentElement.getAttribute('data-ag-cs-model-menu'), '1', 'native model menu must still mark data-ag-cs-model-menu for pointer-events passthrough');
    assert.equal(crab.getAttribute('data-ag-mascot-peek'), null, 'native model menu must NOT force mascot peek');
    mdl.remove();
    sandbox.__agPrism.sync();
    assert.equal(doc.documentElement.getAttribute('data-ag-cs-model-menu'), null);

    // 3D Periodic Table Picker (data-ag-pp-open="1") must still trigger peek (0fps sleep)
    doc.documentElement.setAttribute('data-ag-pp-open', '1');
    sandbox.__agPrism.sync();
    assert.equal(crab.getAttribute('data-ag-mascot-peek'), '1', '3D periodic table picker must still trigger peek');
    doc.documentElement.removeAttribute('data-ag-pp-open');
    sandbox.__agPrism.sync();
    assert.equal(crab.getAttribute('data-ag-mascot-peek'), null, 'closing periodic picker must exit peek');

    // Queued / running sibling banner above composer card must still trigger peek
    const queuedBanner = doc.createElement('div');
    queuedBanner.textContent = 'Queued message';
    inputBox.insertBefore(queuedBanner, card);
    sandbox.__agPrism.sync();
    assert.equal(queuedBanner.getAttribute('data-ag-cs-queued'), '1', 'queued sibling above composer must be marked data-ag-cs-queued="1"');
    assert.equal(crab.getAttribute('data-ag-mascot-peek'), '1', 'queued card above composer must still trigger peek');

    // Remove queued banner -> mascot leaves peek mode
    queuedBanner.remove();
    sandbox.__agPrism.sync();
    assert.equal(crab.getAttribute('data-ag-mascot-peek'), null, 'closing overlays must exit peek');

    // Toggle hostLocalization to 'off' -> immediately calls window.__agPrismHostI18n.setMode('off') (reverse English restore)
    const beforeDestroy = hostI18nDestroyed;
    const beforeModesLen = hostI18nModes.length;
    sandbox.__agPrism.saveSettingsBatch({ hostLocalization: 'off' });
    sandbox.__agPrism.sync();
    assert.equal(hostI18nDestroyed, beforeDestroy, 'switching hostLocalization to off must call setMode("off") instead of destroy()');
    assert.equal(hostI18nModes.slice(beforeModesLen).at(-1), 'off', 'switching hostLocalization to off must call setMode("off")');
    assert.equal(doc.documentElement.getAttribute('data-ag-prism-host-i18n'), 'off-enforced');

    // Settings panel (Channel 9 on-demand) in hostLocalization === 'off' with [data-agy-hans-ui] shows external localization notice
    const dlg = doc.createElement('div');
    dlg.setAttribute('role', 'dialog');
    const pane = doc.createElement('div');
    pane.className = 'p-6';
    const h2 = doc.createElement('h2');
    h2.textContent = 'Appearance';
    pane.appendChild(h2);
    const nativeSec = doc.createElement('div');
    nativeSec.className = 'space-y-2';
    pane.appendChild(nativeSec);
    dlg.appendChild(pane);
    doc.body.appendChild(dlg);
    const settingsRes = vm.runInNewContext(cdp.buildSettingsChannelExpression(), sandbox);
    assert.equal(settingsRes.ok, true);
    sandbox.__agPrism.sync();

    const sec = doc.getElementById('ag-cs-settings-sec');
    assert.ok(sec);
    const toggleBtn = sec.querySelector('button[aria-expanded]');
    if (toggleBtn && toggleBtn.getAttribute('aria-expanded') === 'false') {
      toggleBtn.dispatchEvent({ type: 'click', target: toggleBtn });
    }
    sandbox.__agPrism.sync();
    const hiDesc = sec.querySelector('[data-ag-cs-row="hostLocalization"] [data-k="d"]');
    assert.ok(hiDesc);
    assert.equal(hiDesc.textContent, locales.getUiStrings('zh-CN').hostI18nOffExtHint);
    assert.equal(hiDesc.getAttribute('data-ag-cs-hi-warn'), 'ext');

    // Switching to auto + English immediately calls window.__agPrismHostI18n.destroy() and shows the external-i18n warning pill
    const beforeAutoEnDestroy = hostI18nDestroyed;
    sandbox.__agPrism.saveSettingsBatch({ hostLocalization: 'auto', language: 'en' });
    sandbox.__agPrism.sync();
    assert.ok(hostI18nDestroyed > beforeAutoEnDestroy, 'switching hostLocalization to auto + en must immediately call destroy()');
    assert.equal(doc.documentElement.getAttribute('data-ag-prism-host-i18n'), null);
    const secEn = doc.getElementById('ag-cs-settings-sec');
    const toggleBtnEn = secEn?.querySelector('button[aria-expanded]');
    if (toggleBtnEn && toggleBtnEn.getAttribute('aria-expanded') === 'false') {
      toggleBtnEn.dispatchEvent({ type: 'click', target: toggleBtnEn });
    }
    sandbox.__agPrism.sync();
    const hiDescEn = secEn?.querySelector('[data-ag-cs-row="hostLocalization"] [data-k="d"]');
    assert.ok(hiDescEn);
    assert.equal(hiDescEn.textContent, locales.getUiStrings('en').hostI18nOffExtHint);
    assert.equal(hiDescEn.getAttribute('data-ag-cs-hi-warn'), 'ext');
  } finally {
    sandbox.__agPrism?.destroy?.();
  }
});

test('v1.0.7: thought-client auto-translates asynchronously updated & newly added conversation titles without observing chat stream', async () => {
  const vm = require('node:vm');
  const { doc, win } = createFakeDom();
  const observers = [];
  class MockMutationObserver {
    constructor(cb) {
      this.cb = cb;
      this.targets = [];
      observers.push(this);
    }
    observe(target, opts) { this.targets.push({ target, opts }); }
    disconnect() { this.targets = []; }
    takeRecords() { return []; }
    trigger(records) { this.cb(records, this); }
  }

  // Sidebar list with an initial placeholder new conversation row
  const listEl = doc.createElement('div');
  listEl.setAttribute('data-testid', 'conversation-list-sidebar');
  const row1 = doc.createElement('div');
  row1.setAttribute('data-testid', 'conversation-row-sidebar');
  const row1Span = doc.createElement('span');
  row1Span.className = 'truncate';
  const row1Text = doc.createTextNode('New Conversation');
  row1Span.appendChild(row1Text);
  row1.appendChild(row1Span);
  listEl.appendChild(row1);
  doc.body.appendChild(listEl);

  // Top breadcrumb nav (workspace + active conversation title)
  const nav = doc.createElement('nav');
  const bc1 = doc.createElement('a');
  bc1.setAttribute('data-testid', 'breadcrumb-segment');
  bc1.appendChild(doc.createTextNode('obsidian-prism'));
  const bc2 = doc.createElement('a');
  bc2.setAttribute('data-testid', 'breadcrumb-segment');
  const bc2Span = doc.createElement('span');
  bc2Span.className = 'truncate';
  const bc2Text = doc.createTextNode('New Conversation');
  bc2Span.appendChild(bc2Text);
  bc2.appendChild(bc2Span);
  nav.appendChild(bc1);
  nav.appendChild(bc2);
  doc.body.appendChild(nav);

  // Chat stream area (must NEVER be observed by titleObserver)
  const convView = doc.createElement('div');
  convView.setAttribute('data-testid', 'conversation-view');
  const autoScroll = doc.createElement('div');
  autoScroll.setAttribute('data-testid', 'autoscroll-viewport');
  convView.appendChild(autoScroll);
  doc.body.appendChild(convView);

  const dict = {
    'New Conversation': '新会话',
    'Optimize Async Title Sync': '优化异步标题同步',
    'Debug WebGL Rim Layer': '调试 WebGL 棱镜层',
  };
  const batchCalls = [];
  const bridge = {
    async call(req) {
      if (req?.action === 'get-cache') return { ok: true, entries: {}, translateTitles: true };
      return { ok: true };
    },
    async translateStream(req) {
      const payload = JSON.parse(req.text);
      batchCalls.push(payload.items);
      return { ok: true, items: payload.items.map((s) => dict[s] || s) };
    },
  };

  const sandbox = {
    window: null,
    globalThis: null,
    document: doc,
    console,
    setTimeout,
    clearTimeout,
    performance: { now: () => Date.now() },
    navigator: { language: 'zh-CN' },
    localStorage: win.localStorage,
    MutationObserver: MockMutationObserver,
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
    __agPrismThoughtBridge: bridge,
    innerHeight: 900,
    innerWidth: 1400,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  doc.defaultView = sandbox;

  const thoughtSrc = fs.readFileSync(path.join(ROOT, 'vendor', 'thought-translator', 'thought-client.js'), 'utf8');
  vm.runInNewContext(thoughtSrc, sandbox);
  const th = sandbox.__agPrismThought;
  assert.ok(th);

  try {
    th.sync({ thoughtTranslate: 'machine', language: 'zh-CN', translateTitles: true });
    th.scanImmediate();
    await new Promise((r) => setTimeout(r, 30));

    assert.equal(row1Text.nodeValue, '新会话');
    assert.equal(bc2Text.nodeValue, '新会话');
    assert.ok(th.__observedTitleRoots.has(listEl), 'titleObserver must observe conversation-list-sidebar');
    assert.ok(th.__observedTitleRoots.has(nav), 'titleObserver must observe breadcrumb nav');
    assert.equal(th.__observedTitleRoots.has(doc.body), false, 'titleObserver must NEVER observe document.body');
    assert.equal(th.__observedTitleRoots.has(convView), false, 'titleObserver must NEVER observe conversation-view');

    const titleObs = observers.find((o) => o.targets.some((t) => t.target === listEl));
    assert.ok(titleObs, 'title MutationObserver must be active');

    // Echo of our own translation write must NOT trigger another RPC
    const callsAfterInit = batchCalls.length;
    titleObs.trigger([{ type: 'characterData', target: row1Text }]);
    await new Promise((r) => setTimeout(r, 180));
    assert.equal(batchCalls.length, callsAfterInit, 'self-written translated text must not loop-trigger scan');

    // Simulate Antigravity backend asynchronously replacing placeholder text in-place (characterData)
    row1Text.nodeValue = 'Optimize Async Title Sync';
    bc2Text.nodeValue = 'Optimize Async Title Sync';
    titleObs.trigger([
      { type: 'characterData', target: row1Text },
      { type: 'characterData', target: bc2Text },
    ]);
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(row1Text.nodeValue, '优化异步标题同步', 'sidebar new conversation title must auto-translate on async characterData update');
    assert.equal(bc2Text.nodeValue, '优化异步标题同步', 'breadcrumb new conversation title must auto-translate on async characterData update');
    assert.equal(batchCalls.length, callsAfterInit + 1, 'simultaneous sidebar+breadcrumb updates must coalesce into 1 batch RPC');

    // Simulate a brand new sidebar row inserted dynamically (childList)
    const row2 = doc.createElement('div');
    row2.setAttribute('data-testid', 'conversation-row-sidebar');
    const row2Span = doc.createElement('span');
    row2Span.className = 'truncate';
    const row2Text = doc.createTextNode('Debug WebGL Rim Layer');
    row2Span.appendChild(row2Text);
    row2.appendChild(row2Span);
    listEl.appendChild(row2);
    titleObs.trigger([{ type: 'childList', target: listEl, addedNodes: [row2] }]);
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(row2Text.nodeValue, '调试 WebGL 棱镜层', 'newly inserted sidebar row must auto-translate');

    // Disabling translateTitles disconnects titleObserver and restores latest English originals (NOT stale placeholder)
    th.setTranslateTitles(false);
    assert.equal(th.__observedTitleRoots.size, 0, 'disabling translateTitles must disconnect titleObserver');
    assert.equal(row1Text.nodeValue, 'Optimize Async Title Sync');
    assert.equal(bc2Text.nodeValue, 'Optimize Async Title Sync');
    assert.equal(row2Text.nodeValue, 'Debug WebGL Rim Layer');
  } finally {
    th.destroy();
  }
});

test('v1.0.7 / Issue #58: full-body gentle crouch peek (no hard bottom clip) + prism rim ambient bounce light preserves 0fps sleep and dedups micro-jitter', () => {
  // 1. Verify peek pose renders full body grounded to maxY=9 (no hard cut) across all 4 species
  for (const kind of ['clawd', 'cat', 'dragon', 'whale']) {
    for (let t = 0; t < 4; t++) {
      const layers = dualMascotRig.buildClipLayers(kind, 'peek', t, { clipTick: t });
      const bodyRows = new Set();
      let maxY = -99;
      for (const l of layers) {
        if (!l || l.grounded) continue;
        for (let r = 0; r < (l.rows || []).length; r++) {
          if (/[^. ]/.test(l.rows[r])) {
            const y = l.oy + r;
            bodyRows.add(y);
            if (y > maxY) maxY = y;
          }
        }
      }
      assert.equal(maxY, 9, `${kind} peek crouch must keep full body/legs grounded at y=9, got ${maxY}`);
      const sortedYs = [...bodyRows].sort((a, b) => a - b);
      for (let i = 1; i < sortedYs.length; i++) {
        assert.equal(sortedYs[i] - sortedYs[i - 1], 1, `${kind} peek crouch must have zero vertical row gaps`);
      }
    }
  }

  // 2. Mount rig in reducedMotion (0fps sleep) with canvas tracking clip() & source-atop gradients
  const { doc, win } = createFakeDom();
  const compositeOps = [];
  const gradCalls = [];
  let clipCalls = 0;
  const origCreate = doc.createElement.bind(doc);
  doc.createElement = (tag) => {
    const el = origCreate(tag);
    if (String(tag).toLowerCase() === 'canvas') {
      el.width = 0;
      el.height = 0;
      el.getContext = () => ({
        setTransform() {},
        clearRect() {},
        fillRect() {},
        save() {},
        restore() {},
        translate() {},
        scale() {},
        rotate() {},
        beginPath() {},
        rect() {},
        moveTo() {},
        lineTo() {},
        closePath() {},
        clip() { clipCalls += 1; },
        drawImage() {},
        set globalCompositeOperation(v) { compositeOps.push(v); },
        get globalCompositeOperation() { return compositeOps[compositeOps.length - 1] || 'source-over'; },
        createRadialGradient(x0, y0, r0, x1, y1, r1) {
          const stops = [];
          gradCalls.push({ x0, y0, r0, x1, y1, r1, stops });
          return { addColorStop(o, c) { stops.push([o, c]); } };
        },
        fillStyle: '',
        imageSmoothingEnabled: false,
      });
    }
    return el;
  };
  win.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  const host = doc.createElement('div');
  host.getBoundingClientRect = () => ({ left: 0, top: 0, width: 520, height: 84, right: 520, bottom: 84 });
  doc.body.appendChild(host);

  const rig = dualMascotRig.mountDualMascotStage(host, {
    doc,
    win,
    initialCamp: 'gemini',
    miniPile: false,
    reducedMotion: true,
  });

  try {
    // Enter peek mode: actor gently crouches (+3px) at zIndex 8 with data-ag-mascot-peek="1" and ZERO hard bottom clip()
    clipCalls = 0;
    rig.setState({ yieldMode: 'peek' });
    const peekSnap = rig.getLayoutSnapshot();
    assert.equal(host.getAttribute('data-ag-mascot-peek'), '1', 'peek must preserve data-ag-mascot-peek="1" contract');
    assert.equal(peekSnap.perf.timerIntervalMs, 0, 'reducedMotion must keep 0fps sleep');
    assert.equal(peekSnap.actors[0].renderCache.lastY, 3, 'gentle crouch peek must lower actor by +3px without hard clipping');
    assert.equal(clipCalls, 0, 'Issue #58 Bug 1: peek mode must NOT hard-clip lower body via ctx.clip()');
    assert.equal(host.querySelector('.ag-v2-mascot-actor')?.style?.zIndex, '8', 'peek actor z-index must sit at 8 above rim (7) and below cards (12)');
    assert.equal(host.querySelector('.ag-v2-mascot-actor')?.getAttribute('tabindex'), '-1', 'peek actor must keep tabindex="-1"');

    // Activate composer rim bounce light directly below cat
    const catCx = peekSnap.actors.find((a) => a.id === 'cat').worldCx;
    const drawsBefore = peekSnap.perf.canvasDraws;
    compositeOps.length = 0;
    gradCalls.length = 0;

    rig.setRimLight({ active: true, localX: catCx, strength: 0.9, toneKey: 'cobalt', dark: true });
    const litSnap = rig.getLayoutSnapshot();
    assert.equal(litSnap.perf.timerIntervalMs, 0, 'setRimLight must NEVER wake 0fps sleep timer');
    assert.equal(litSnap.rimLight.active, true);
    assert.equal(litSnap.rimLight.toneKey, 'cobalt');
    assert.ok(litSnap.perf.canvasDraws > drawsBefore, 'illuminating rim near actor must repaint canvas once');
    assert.ok(compositeOps.includes('source-atop'), 'rim bounce light must paint inside silhouette via source-atop');
    assert.ok(gradCalls.some((g) => g.stops.some(([, c]) => c.includes('148,228,255'))), 'cobalt dark bounce palette must be applied');
    assert.ok(litSnap.actors.find((a) => a.id === 'cat').renderCache.tintState.includes(':r'), 'lit actor tintState must include quantized rim bounce key');

    // Micro-jitter within quantization bucket must dedup with 0 extra draws
    const drawsLit = litSnap.perf.canvasDraws;
    rig.setRimLight({ active: true, localX: catCx + 1, strength: 0.905, toneKey: 'cobalt', dark: true });
    assert.equal(rig.getLayoutSnapshot().perf.canvasDraws, drawsLit, 'micro-jitter inside same quantized bucket must not redraw');

    // While periodic picker is open (data-ag-pp-open="1"), setRimLight must preserve 0fps sleep & skip repaint
    doc.documentElement.setAttribute('data-ag-pp-open', '1');
    rig.setRimLight({ active: true, localX: catCx, strength: 0.5, toneKey: 'iris', dark: true });
    assert.equal(rig.getLayoutSnapshot().perf.canvasDraws, drawsLit, 'setRimLight must skip repaint while periodic picker is open');
    assert.equal(rig.getLayoutSnapshot().perf.timerIntervalMs, 0, 'periodic picker open must preserve 0fps sleep');
    doc.documentElement.removeAttribute('data-ag-pp-open');

    // Clearing rim light resets tintState cleanly and stays 0fps
    rig.setRimLight({ active: false });
    const offSnap = rig.getLayoutSnapshot();
    assert.equal(offSnap.rimLight.active, false);
    assert.equal(offSnap.perf.timerIntervalMs, 0);
    assert.equal(offSnap.actors.find((a) => a.id === 'cat').renderCache.tintState.includes(':r'), false, 'clearing rim light must restore clean tintState');
  } finally {
    rig.dispose();
  }
});

test('v1.0.7: prism-rim-canvas emits quantized onComposerRimUpdate on hover near composer top edge and clears on leave/ambient=0/hidden', () => {
  const rimMod = require(path.join(ROOT, 'prism-rim-canvas.js'));
  const { doc, win } = createFakeDom();
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  const prevRaf = globalThis.requestAnimationFrame;
  const prevCaf = globalThis.cancelAnimationFrame;

  const box = doc.createElement('div');
  box.className = 'surface-composer-card';
  box.setAttribute('data-ag-cs-prism-box', '1');
  box.getBoundingClientRect = () => ({ left: 100, top: 400, right: 620, bottom: 520, width: 520, height: 120 });
  doc.body.appendChild(box);

  let ambientVal = 100;
  let rafQueue = [];
  const events = [];

  globalThis.document = doc;
  globalThis.window = win;
  globalThis.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };
  globalThis.cancelAnimationFrame = () => { rafQueue = []; };
  const flushRaf = () => { const q = rafQueue.splice(0); q.forEach((fn) => fn(performance.now())); };

  const ctrl = rimMod.createPrismRimCanvasController({
    isDestroyed: () => false,
    isDarkTheme: () => true,
    motionReduced: () => false,
    getMinFrameGapMs: () => 0,
    getAmbientIntensity: () => ambientVal,
    getAccentTone: () => 'iris',
    canMountRealCanvas: () => false,
    setAttrIfChanged: (el, k, v) => el?.setAttribute?.(k, v),
    runGuardedMut: (fn) => fn(),
    getActiveCrystalTrack: () => null,
    onComposerRimUpdate: (info) => events.push(info),
  });

  try {
    // Move pointer directly onto composer top rim (y=402 -> ly=2)
    ctrl.onPointerMove({ clientX: 260, clientY: 402 });
    flushRaf();
    assert.equal(events.length, 1);
    assert.equal(events[0].active, true);
    assert.equal(events[0].toneKey, 'iris');
    assert.equal(events[0].dark, true);
    assert.ok(events[0].strength > 0.9, 'pointer right at composer top edge must yield high bounce strength');
    assert.equal(events[0].localX, 160);

    // Setting ambientIntensity=0 must emit active:false once
    ambientVal = 0;
    ctrl.invalidateMetrics();
    assert.equal(events[events.length - 1].active, false, 'ambient=0 must immediately turn off mascot rim bounce');
    const offCount = events.length;

    // Repeated invalidation while already off must dedup (no duplicate off spam)
    ctrl.invalidateMetrics();
    assert.equal(events.length, offCount, 'repeated inactive clears must deduplicate');

    // Re-enable ambient and hide document -> shrinkRims(1) must also clear bounce light
    ambientVal = 100;
    ctrl.onPointerMove({ clientX: 300, clientY: 406 });
    flushRaf();
    assert.equal(events[events.length - 1].active, true);
    doc.hidden = true;
    ctrl.invalidateMetrics();
    assert.equal(events[events.length - 1].active, false, 'document.hidden shrink must clear mascot rim bounce');
  } finally {
    ctrl.teardown();
    globalThis.document = prevDoc;
    globalThis.window = prevWin;
    globalThis.requestAnimationFrame = prevRaf;
    globalThis.cancelAnimationFrame = prevCaf;
  }
});

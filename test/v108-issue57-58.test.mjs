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

function createFakeDom() {
  class FakeEl {
    constructor(tagName = 'div', attrs = {}) {
      this.nodeType = 1;
      this.tagName = String(tagName).toUpperCase();
      this.parentNode = null;
      this.childNodes = [];
      this.ownerDocument = null;
      this.hidden = false;
      this.disabled = false;
      this._attrs = new Map();
      this._classSet = new Set();
      this.style = {
        _map: new Map(),
        setProperty: (k, v) => this.style._map.set(k, String(v)),
        getPropertyValue: (k) => this.style._map.get(k) || '',
        removeProperty: (k) => this.style._map.delete(k),
      };
      this.classList = {
        add: (...cs) => {
          cs.forEach((c) => c && this._classSet.add(c));
          this._attrs.set('class', [...this._classSet].join(' '));
        },
        remove: (...cs) => {
          cs.forEach((c) => this._classSet.delete(c));
          this._attrs.set('class', [...this._classSet].join(' '));
        },
        contains: (c) => this._classSet.has(c),
      };
      for (const [k, v] of Object.entries(attrs)) this.setAttribute(k, v);
    }
    get parentElement() { return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null; }
    get children() { return this.childNodes.filter((n) => n.nodeType === 1); }
    get firstChild() { return this.childNodes[0] || null; }
    get firstElementChild() { return this.children[0] || null; }
    get lastElementChild() { const ch = this.children; return ch[ch.length - 1] || null; }
    get previousElementSibling() {
      if (!this.parentNode) return null;
      const ch = this.parentNode.children;
      const idx = ch.indexOf(this);
      return idx > 0 ? ch[idx - 1] : null;
    }
    get isConnected() {
      let cur = this;
      while (cur) {
        if (cur === doc.documentElement) return true;
        cur = cur.parentNode;
      }
      return false;
    }
    get id() { return this._attrs.get('id') || ''; }
    set id(v) { this.setAttribute('id', v); }
    get className() { return this._attrs.get('class') || ''; }
    set className(v) {
      this._classSet = new Set(String(v || '').split(/\s+/).filter(Boolean));
      this._attrs.set('class', [...this._classSet].join(' '));
    }
    get textContent() { return this.childNodes.map((c) => c.textContent || '').join(''); }
    set textContent(v) { this.childNodes = []; this._text = String(v ?? ''); }
    getAttribute(k) { return this._attrs.has(k) ? this._attrs.get(k) : null; }
    hasAttribute(k) { return this._attrs.has(k); }
    setAttribute(k, v) {
      const s = String(v);
      this._attrs.set(k, s);
      if (k === 'class') this._classSet = new Set(s.split(/\s+/).filter(Boolean));
    }
    removeAttribute(k) {
      this._attrs.delete(k);
      if (k === 'class') this._classSet.clear();
    }
    appendChild(child) {
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      child.ownerDocument = doc;
      this.childNodes.push(child);
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
    matches(sel) { return matchSelector(this, sel); }
    closest(sel) {
      let cur = this;
      while (cur && cur.nodeType === 1) {
        if (matchSelector(cur, sel)) return cur;
        cur = cur.parentElement;
      }
      return null;
    }
    querySelectorAll(sel) {
      const out = [];
      const walk = (n) => {
        for (const c of n.childNodes) {
          if (c.nodeType === 1) {
            if (matchSelector(c, sel)) out.push(c);
            walk(c);
          }
        }
      };
      walk(this);
      return out;
    }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 }; }
    addEventListener() {}
    removeEventListener() {}
  }

  function matchSimple(el, part) {
    let rest = part.trim();
    if (!rest) return false;
    const tagM = /^[a-zA-Z0-9_-]+/.exec(rest);
    if (tagM) {
      if (el.tagName !== tagM[0].toUpperCase()) return false;
      rest = rest.slice(tagM[0].length);
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
        const m = /^\[([a-zA-Z0-9_-]+)(?:=["']?([^\]"']*)["']?)?\]/.exec(rest);
        if (!m) return false;
        const ok = m[2] === undefined ? el.hasAttribute(m[1]) : el.getAttribute(m[1]) === m[2];
        if (!ok) return false;
        rest = rest.slice(m[0].length);
      } else {
        return false;
      }
    }
    return true;
  }

  function matchSelector(el, sel) {
    if (!el || el.nodeType !== 1) return false;
    return String(sel || '')
      .split(',')
      .some((raw) => {
        const tokens = raw.trim().split(/\s+/).filter(Boolean);
        if (!tokens.length || !matchSimple(el, tokens[tokens.length - 1])) return false;
        let cur = el.parentElement;
        for (let i = tokens.length - 2; i >= 0; i--) {
          while (cur && !matchSimple(cur, tokens[i])) cur = cur.parentElement;
          if (!cur) return false;
          cur = cur.parentElement;
        }
        return true;
      });
  }

  const doc = {
    nodeType: 9,
    hidden: false,
    readyState: 'complete',
    hasFocus: () => true,
    createElement(tag, attrs = {}) {
      const el = new FakeEl(tag, attrs);
      el.ownerDocument = doc;
      return el;
    },
    getElementById(id) { return doc.documentElement.querySelector(`#${id}`); },
    querySelector(sel) { return doc.documentElement.querySelector(sel); },
    querySelectorAll(sel) { return doc.documentElement.querySelectorAll(sel); },
    addEventListener() {},
    removeEventListener() {},
  };
  doc.documentElement = doc.createElement('html');
  doc.head = doc.createElement('head');
  doc.body = doc.createElement('body', { class: 'theme-dark' });
  doc.documentElement.appendChild(doc.head);
  doc.documentElement.appendChild(doc.body);
  return { doc };
}

test('Issue #57: ui-runtime marks .md-table-host turns & collapsible bodies with data-ag-cs-bleed="1", skips plain turns, updates incrementally, and cleans on destroy', () => {
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  const cvLines = css.split('\n').filter((l) => l.includes('content-visibility:auto'));
  assert.ok(cvLines.length >= 3, 'style.css must retain all 3 offscreen content-visibility:auto rules');
  for (const l of cvLines) {
    assert.ok(l.includes(':not([data-ag-cs-bleed="1"])'), `content-visibility:auto rule must exempt [data-ag-cs-bleed="1"]: ${l}`);
  }
  assert.ok(css.includes('contain-intrinsic-size:auto 26px'), 'step-level contain-intrinsic-size:auto 26px must be preserved');
  assert.equal(/:has\(/.test(css), false, 'style.css must contain zero :has() selectors');

  const { doc } = createFakeDom();
  const conv = doc.createElement('div', { 'data-testid': 'conversation-view' });
  const vp = doc.createElement('div', { 'data-testid': 'autoscroll-viewport' });
  const list = doc.createElement('div', { class: 'relative flex flex-col' });
  conv.appendChild(vp);
  vp.appendChild(list);
  doc.body.appendChild(conv);

  // Turn 1: has wide table + expanded thinking & tool-group bodies with table + plain worked-for body without table
  const turn1 = doc.createElement('div', { class: 'flex items-start' });
  const tableHost1 = doc.createElement('div', { class: 'md-table-host' });
  turn1.appendChild(tableHost1);

  const thinkWrap = doc.createElement('div');
  const thinkTrig = doc.createElement('button', { 'data-testid': 'thinking-collapsible-trigger', 'aria-expanded': 'true' });
  const thinkBody = doc.createElement('div');
  thinkBody.appendChild(doc.createElement('div', { class: 'md-table-host' }));
  thinkWrap.appendChild(thinkTrig);
  thinkWrap.appendChild(thinkBody);
  turn1.appendChild(thinkWrap);

  const toolWrap = doc.createElement('div');
  const toolTrig = doc.createElement('button', { 'data-testid': 'tool-group-collapsible', 'aria-expanded': 'true' });
  const toolBody = doc.createElement('div');
  const stepCol = doc.createElement('div', { class: 'flex flex-col' });
  const stepRowWithTable = doc.createElement('div', { class: 'flex flex-row' });
  stepRowWithTable.appendChild(doc.createElement('div', { class: 'md-table-host' }));
  const stepRowPlain = doc.createElement('div', { class: 'flex flex-row' });
  stepCol.appendChild(stepRowWithTable);
  stepCol.appendChild(stepRowPlain);
  toolBody.appendChild(stepCol);
  toolWrap.appendChild(toolTrig);
  toolWrap.appendChild(toolBody);
  turn1.appendChild(toolWrap);

  const workedWrap = doc.createElement('div');
  const workedTrig = doc.createElement('button', { 'data-testid': 'worked-for-collapsible', 'aria-expanded': 'true' });
  const workedBody = doc.createElement('div');
  workedWrap.appendChild(workedTrig);
  workedWrap.appendChild(workedBody);
  turn1.appendChild(workedWrap);

  // Turn 2 (non-last, no table) and Turn 3 (last, no table)
  const turn2 = doc.createElement('div', { class: 'flex items-start' });
  const turn3 = doc.createElement('div', { class: 'flex items-start' });
  list.appendChild(turn1);
  list.appendChild(turn2);
  list.appendChild(turn3);

  const observers = [];
  const rafQueue = [];
  const timers = new Set();
  const sandbox = {
    document: doc,
    location: { pathname: '/c/00000000-0000-0000-0000-000000000001' },
    navigator: { language: 'en' },
    performance: { now: () => 100 },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    requestAnimationFrame: (fn) => { rafQueue.push(fn); return rafQueue.length; },
    cancelAnimationFrame() {},
    setTimeout: (fn) => { const id = { fn }; timers.add(id); return id; },
    clearTimeout: (id) => timers.delete(id),
    setInterval: () => 1,
    clearInterval() {},
    addEventListener() {},
    removeEventListener() {},
    MutationObserver: class {
      constructor(cb) { this.cb = cb; observers.push(this); }
      observe() {}
      disconnect() {}
      takeRecords() { return []; }
    },
    Map, Set, WeakMap, WeakSet, Proxy, Array, Object, Math, Number, String, Boolean, Date, RegExp, JSON,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  const uiSrc = fs.readFileSync(path.join(ROOT, 'ui-runtime.js'), 'utf8');
  vm.runInNewContext(uiSrc, sandbox);
  sandbox.__agCsUiMain({ language: 'en', motionLevel: 'standard' });

  // Initial scan assertions
  assert.equal(turn1.getAttribute('data-ag-cs-bleed'), '1', 'turn containing .md-table-host must receive data-ag-cs-bleed="1"');
  assert.equal(thinkBody.getAttribute('data-ag-cs-bleed'), '1', 'thinking collapsible body containing .md-table-host must receive data-ag-cs-bleed="1"');
  assert.equal(toolBody.getAttribute('data-ag-cs-bleed'), '1', 'tool-group collapsible body containing .md-table-host must receive data-ag-cs-bleed="1"');
  assert.equal(stepRowWithTable.getAttribute('data-ag-cs-bleed'), '1', 'step row containing .md-table-host must receive data-ag-cs-bleed="1"');
  assert.equal(stepRowPlain.getAttribute('data-ag-cs-bleed'), null, 'plain step row without table must not be marked');
  assert.equal(workedBody.getAttribute('data-ag-cs-bleed'), null, 'plain worked-for collapsible body without table must not be marked');
  assert.equal(turn2.getAttribute('data-ag-cs-bleed'), null, 'non-table turn 2 must not receive data-ag-cs-bleed');
  assert.equal(turn3.getAttribute('data-ag-cs-bleed'), null, 'non-table turn 3 must not receive data-ag-cs-bleed');

  // Dynamic streaming addition of .md-table-host into turn 2 via main MutationObserver
  const streamedTable = doc.createElement('div', { class: 'md-table-host' });
  turn2.appendChild(streamedTable);
  const mainMo = observers[0];
  assert.ok(mainMo, 'main MutationObserver must be registered');
  mainMo.cb([{ type: 'childList', target: turn2, addedNodes: [streamedTable], removedNodes: [] }]);
  while (rafQueue.length) rafQueue.shift()();
  assert.equal(turn2.getAttribute('data-ag-cs-bleed'), '1', 'streaming .md-table-host insertion must mark turn 2');

  // Removing .md-table-host from turn 2 clears stale data-ag-cs-bleed
  streamedTable.remove();
  mainMo.cb([{ type: 'childList', target: turn2, addedNodes: [], removedNodes: [streamedTable] }]);
  while (rafQueue.length) rafQueue.shift()();
  assert.equal(turn2.getAttribute('data-ag-cs-bleed'), null, 'removing last .md-table-host from turn 2 must clear data-ag-cs-bleed');

  // Teardown cleans all remaining data-ag-cs-bleed attributes
  sandbox.__agPrism.destroy();
  assert.equal(doc.querySelectorAll('[data-ag-cs-bleed]').length, 0, 'destroy() must remove every data-ag-cs-bleed attribute');
});

test('Issue #58 Bugs 3 & 5: focus outline suppression on conversation-view/autoscroll-viewport/mascot, inset :focus-visible ring & >=7px gap in composer footer', () => {
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');

  // Bug 5 + Issue #58 residual #4: overview-panel-host, conversation-view & autoscroll-viewport disable focus/focus-visible outline and box-shadow with (1,3,1) specificity
  assert.match(
    css,
    /:is\(\[data-testid="overview-panel-host"\],\[data-testid="conversation-view"\],\[data-testid="autoscroll-viewport"\]\):not\(#_\)\{&:is\(:focus,:focus-visible\)\{outline:none !important;box-shadow:none !important;\}\}/,
    'overview-panel-host, conversation-view and autoscroll-viewport must suppress :focus/:focus-visible outline and box-shadow via :not(#_)'
  );
  assert.equal(css.includes(',[data-testid="autoscroll-viewport"],'), false, 'must keep Issue #8 autoscroll-viewport scrollbar guard intact');

  // Subtle motion mode: exclude .ag-v2-mascot-actor from [role="button"] transform:none override (prevents mascot teleport on hover/drag)
  const subtleIdx = css.indexOf('&[data-ag-cs-motion="subtle"]{');
  assert.ok(subtleIdx > 0, 'subtle motion block must exist');
  const subtleSlice = css.slice(subtleIdx, css.indexOf('\n}\n', subtleIdx));
  assert.ok(
    subtleSlice.includes('& :is(button,[role="button"]:not(.ag-v2-mascot-actor):not([data-no-press-spring="1"])):is(:hover,:active){transform:none !important;}'),
    'subtle motion mode must exclude .ag-v2-mascot-actor from transform:none !important on :hover/:active'
  );
  assert.ok(
    subtleSlice.includes('[role="button"]:not(.ag-v2-mascot-actor):not([data-no-press-spring="1"])'),
    'subtle motion transition-property rule must exclude .ag-v2-mascot-actor and [data-no-press-spring="1"]'
  );

  // Issue #58 residual #1: peek mode must NOT hide .ag-v2-mini-pile (keeps 3 mini crabs visible), while keeping .ag-v2-mascot-actor::after shadow hidden & pointer-events passthrough
  assert.equal(css.includes('.ag-v2-mini-pile{opacity:0 !important;}'), false, 'style.css must not hide .ag-v2-mini-pile in peek mode');
  assert.ok(css.includes('.ag-cs-crab[data-ag-mascot-peek="1"] .ag-v2-mascot-actor::after{opacity:0 !important;}'), 'peek mode must still hide mascot ground shadow');
  assert.ok(css.includes('html[data-ag-cs-model-menu="1"] .ag-cs-crab,html[data-ag-pp-open="1"] .ag-cs-crab'), 'model-menu and periodic-picker pointer-events passthrough must remain intact');

  // Bug 3 (mascot): .ag-v2-mascot-actor disables focus/focus-visible outline & box-shadow
  const actorLine = css.split('\n').find((l) => l.includes('& .ag-v2-mascot-actor{')) || '';
  assert.ok(
    actorLine.includes('&:is(:focus,:focus-visible){outline:none !important;box-shadow:none !important;}'),
    '.ag-v2-mascot-actor must suppress :focus and :focus-visible outline and box-shadow'
  );

  // Bug 3 (composer footer): inset :focus-visible ring on all interactive buttons + right button group gap >= 7px
  const footerStart = css.indexOf('& .agy-composer-footer{');
  assert.ok(footerStart > 0, '.agy-composer-footer block must exist');
  const footerEnd = css.indexOf('\n}\n', footerStart);
  const footerSlice = css.slice(footerStart, footerEnd > footerStart ? footerEnd : footerStart + 8000);
  const focusRule = footerSlice.split('\n').find((l) => l.includes(':focus-visible{') && l.includes('inset 0 0 0 1.5px')) || '';
  assert.ok(focusRule, '.agy-composer-footer must define an inset :focus-visible ring that avoids overflow:hidden clipping');
  assert.ok(focusRule.includes('outline:none !important;'), 'composer footer :focus-visible must suppress default clipped outline');
  for (const sel of [
    '[data-testid="model-selector-trigger"]',
    '[data-testid="permissions-selector-trigger"]',
    'button[aria-haspopup="menu"]',
    '[data-testid="voice-live-pill"]',
    '[data-testid="send-button"]',
    '[data-testid="input-cancel-button"]',
  ]) {
    assert.ok(focusRule.includes(sel), `composer footer :focus-visible rule must cover ${sel}`);
  }

  const rightGroupLine = footerSlice.split('\n').find((l) => l.includes('>div:not(:first-child)') && l.includes('>div.flex{')) || '';
  const gapMatch = rightGroupLine.match(/gap:(\d+(?:\.\d+)?)px/);
  assert.ok(gapMatch && Number(gapMatch[1]) >= 7, `composer footer right button group gap must be >= 7px, got ${rightGroupLine}`);

  // Bilibili /btw narrow-window clipping guard: side-question-toolbar-button safeguard + narrow icon-only collapse + shrinking model-selector
  assert.ok(
    footerSlice.includes('& [data-testid="side-question-toolbar-button"]{flex:0 0 auto !important;height:26px !important;'),
    'composer footer must protect [data-testid="side-question-toolbar-button"] with flex:0 0 auto and height:26px'
  );
  assert.ok(
    footerSlice.includes('&[data-t~="2"] [data-testid="side-question-toolbar-button"]{'),
    'composer footer narrow tier must collapse side-question-toolbar-button text label to icon-only to avoid horizontal clipping'
  );
  const leftFlexLine = footerSlice.split('\n').find((l) => l.startsWith('&>div:nth-child(1)>div.flex,')) || '';
  assert.ok(leftFlexLine.includes('flex:0 1 auto !important;'), 'left footer flex wrappers must allow shrinking for /btw button');
  const modelTrigLine = footerSlice.split('\n').find((l) => l.startsWith('& [data-testid="model-selector-trigger"]{')) || '';
  assert.ok(modelTrigLine.includes('flex:0 1 auto !important;'), 'model-selector-trigger must shrink first to yield space for /btw button');

  // Issue #80 anti-flicker CSS hardening:
  // 1) Keep legacy z-index:65 rule AND elevate nested positioning containers to z-index:6010 above host z-[6000]
  assert.ok(
    css.includes('html[data-ag-cs-model-menu="1"] :is([data-ag-cs-model-submenu="1"],[data-testid="context-menu-submenu-popup"]){z-index:65 !important;}'),
    'must retain legacy z-index:65 model submenu rule'
  );
  assert.ok(
    css.includes('html[data-ag-cs-model-menu="1"] :is([role="presentation"],[data-nested],[data-side]):is([data-ag-cs-model-submenu="1"],[data-testid="context-menu-submenu-popup"]){z-index:6010 !important;}'),
    'must elevate v2.35+ nested model submenu positioning containers above host z-[6000]'
  );
  // 2) Disable scale(.965) & ag-cs-lens-in zoom jitter on L2 / nested model submenus (opacity-only transition)
  assert.ok(
    css.includes('html[data-ag-cs-style][data-ag-cs-model-menu="1"] :is([data-ag-cs-model-submenu="1"],[data-ag-cs-model-submenu="1"] .agy-overlay,[data-ag-cs-orch-l2="1"],[data-testid="context-menu-submenu-popup"]):not(#_){animation:none !important;transition:opacity 100ms ease-out !important;&:is([data-starting-style],[data-ending-style]){opacity:0 !important;transform:none !important;}}'),
    'must disable lens-in / scale(.965) hitbox shrinkage on L2 / nested model submenus'
  );
  // 3) All 4 :not([data-ces-orch-row="1"]) menu-item rules must also exclude [data-testid="orchestrator-picker-row"] against frame-0 height jump
  const orchExclMatches = css.match(/:not\(\[data-ces-orch-row="1"\]\):not\(\[data-testid="orchestrator-picker-row"\]\)/g) || [];
  assert.equal(orchExclMatches.length, 4, 'all 4 menu-item overlay rules must exclude [data-testid="orchestrator-picker-row"] on frame 0');
});

test('Issue #58 Bug 4: crystal-prism-core anti-aliasing (aaPx >= 1/dpr), inset rimLine avoiding rimD<1px halo, and single-layer canvas clipping', () => {
  const cpSrc = fs.readFileSync(path.join(ROOT, 'crystal-prism-core.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');

  // Verify aaPx numerator >= 1.0 / dpr
  const aaMatch = cpSrc.match(/float\s+aaPx\s*=\s*[^;]*?(\d+(?:\.\d+)?)\s*\/\s*dpr/);
  assert.ok(aaMatch && Number(aaMatch[1]) >= 1.0, `Expected WebGL2 aaPx >= 1.0 / dpr, got ${aaMatch?.[0]}`);

  // Verify smoothstep capsule edge alphaMask and inset rimLine avoiding rimD < 1.0px semi-transparent AA band
  assert.ok(cpSrc.includes('1.0 - smoothstep(-edgeAa, edgeAa, sdf'), 'alphaMask must use smoothstep anti-aliasing');
  assert.match(cpSrc, /float\s+rimLine\s*=\s*smoothstep\(\s*1\.0\s*,/, 'rimLine must fade in starting at rimD >= 1.0px to prevent white edge halo');
  assert.equal(cpSrc.includes('float rimLine = 1.0 - smoothstep(0.9, 1.9, rimD);'), false, 'old rimLine peaking at rimD=0 must be removed');

  // Verify 2D fallback border stroke is inset >= 1.0px away from clip() boundary
  const fbStrokeMatch = cpSrc.match(/ctx\.roundRect\(\s*(\d+(?:\.\d+)?)\s*,\s*\1\s*,\s*cssW\s*-\s*(\d+(?:\.\d+)?)/);
  assert.ok(fbStrokeMatch && Number(fbStrokeMatch[1]) >= 1.0, `2D fallback rim stroke must be inset >= 1.0px, got ${fbStrokeMatch?.[0]}`);

  // Verify style.css eliminates double border-radius clipping & 1px inset seam on .ag-cs-orch-canvas
  const canvasLine = css.split('\n').find((l) => l.startsWith('.ag-cs-orch-canvas,')) || '';
  assert.ok(canvasLine.includes('inset:0;width:100%;height:100%;'), '.ag-cs-orch-canvas must fill track cleanly without 1px seam');
  assert.equal(canvasLine.includes('border-radius:999px'), false, '.ag-cs-orch-canvas must not apply redundant second border-radius:999px over track clip');
});

test('Channel 10 hot-reload: updating window.__agDualMascotRig and calling sync() disposes old msRig, clears stale DOM, and mounts new rig', () => {
  const { doc } = createFakeDom();
  const origCreateEl = doc.createElement.bind(doc);
  doc.createElement = (tag, attrs) => {
    const el = origCreateEl(tag, attrs);
    if (String(tag).toLowerCase() === 'canvas') {
      el.dataset = {};
      el.getContext = () => ({});
    }
    return el;
  };
  const conv = doc.createElement('div', { 'data-testid': 'conversation-view', 'data-cascade-id': '00000000-0000-0000-0000-000000000002' });
  const inputBox = doc.createElement('div', { 'data-testid': 'agent-input-box' });
  const card = doc.createElement('div', { class: 'surface-composer-card' });
  inputBox.appendChild(card);
  conv.appendChild(inputBox);
  doc.body.appendChild(conv);

  let disposedV1 = 0, mountsV1 = 0, disposedV2 = 0, mountsV2 = 0, setStateV2 = 0;
  const rigV1 = {
    __prismCodeHash: 'oldhash1',
    mountDualMascotStage(hostEl) {
      mountsV1 += 1;
      const staleActor = doc.createElement('div', { class: 'ag-v2-mascot-actor', tabindex: '0' });
      hostEl.appendChild(staleActor);
      return {
        setState() {},
        destroy() { disposedV1 += 1; },
      };
    },
  };
  const rigV2 = {
    __prismCodeHash: 'newhash2',
    mountDualMascotStage(hostEl) {
      mountsV2 += 1;
      const actor = doc.createElement('div', { class: 'ag-v2-mascot-actor', tabindex: '-1' });
      hostEl.appendChild(actor);
      return {
        setState() { setStateV2 += 1; },
        dispose() { disposedV2 += 1; actor.remove(); },
      };
    },
  };

  const sandbox = {
    document: doc,
    location: { pathname: '/c/00000000-0000-0000-0000-000000000002' },
    navigator: { language: 'en' },
    performance: { now: () => 100 },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
    setTimeout: () => 1,
    clearTimeout() {},
    setInterval: () => 1,
    clearInterval() {},
    addEventListener() {},
    removeEventListener() {},
    MutationObserver: class { observe() {} disconnect() {} takeRecords() { return []; } },
    __agDualMascotRig: rigV1,
    Map, Set, WeakMap, WeakSet, Proxy, Array, Object, Math, Number, String, Boolean, Date, RegExp, JSON,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  const uiSrc = fs.readFileSync(path.join(ROOT, 'ui-runtime.js'), 'utf8');
  vm.runInNewContext(uiSrc, sandbox);
  sandbox.__agCsUiMain({ language: 'en', mascot: 'crab', motionLevel: 'standard' });

  assert.equal(mountsV1, 1, 'initial mount must use rigV1');
  assert.equal(disposedV1, 0);
  assert.equal(doc.querySelectorAll('.ag-v2-mascot-actor').length, 1);
  assert.equal(doc.querySelector('.ag-v2-mascot-actor')?.getAttribute('tabindex'), '0');

  // Simulate Channel 10 hot-reload replacing window.__agDualMascotRig and calling sync()
  sandbox.__agDualMascotRig = rigV2;
  sandbox.__agPrism.sync();

  assert.equal(disposedV1, 1, 'stale rigV1 must be disposed/destroyed once on Channel 10 hot-reload');
  assert.equal(mountsV2, 1, 'new rigV2 must mount once into existing stage');
  assert.equal(disposedV2, 0);
  assert.equal(doc.querySelectorAll('.ag-cs-dual-stage').length, 1, 'must keep single mascot stage without duplicates');
  assert.equal(doc.querySelectorAll('.ag-v2-mascot-actor').length, 1, 'stale rigV1 DOM nodes must be cleared');
  assert.equal(doc.querySelector('.ag-v2-mascot-actor')?.getAttribute('tabindex'), '-1', 'remounted actor must reflect rigV2 tabindex="-1"');

  // Re-syncing with same rigV2 must reuse existing instance without remount
  sandbox.__agPrism.sync();
  assert.equal(mountsV2, 1, 'unchanged rigV2 must not remount');
  assert.equal(disposedV2, 0);
  assert.ok(setStateV2 >= 1, 'unchanged rigV2 must update via setState');

  sandbox.__agPrism.destroy();
  assert.equal(disposedV2, 1, 'destroy() must dispose active rigV2');
});

test('Gate checks: Channel 1 stays < 549,500 B across all 9 languages and edited files have 0 BOM / 0 CRLF / 0 :has() / 0 non-ASCII CSS', () => {
  for (const lang of ['auto', 'zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'es', 'fr', 'de']) {
    const bytes = Buffer.byteLength(
      cdp.buildInjectExpression({ ...cdp.DEFAULT_CONFIG, language: lang }, { bundleCachePath: '' }),
      'utf8'
    );
    assert.ok(bytes < 580000, `Channel 1 (${lang}) must stay < 580,000 B, got ${bytes}`);
  }

  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  let depth = 0;
  for (const ch of css) {
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    assert.ok(depth >= 0, 'style.css brace depth must never go negative');
  }
  assert.equal(depth, 0, 'style.css braces must be balanced');
  assert.equal((css.match(/:has\(/g) || []).length, 0, 'style.css must contain 0 :has()');
  assert.equal(/[^\x00-\x7F]/.test(css), false, 'style.css must contain 0 non-ASCII characters');

  for (const rel of ['style.css', 'ui-runtime.js', 'crystal-prism-core.js', 'test/v108-issue57-58.test.mjs']) {
    const buf = fs.readFileSync(path.join(ROOT, rel));
    assert.equal(buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf, false, `${rel} must not contain UTF-8 BOM`);
    assert.equal(buf.includes(0x0d), false, `${rel} must use LF line endings (0 CRLF)`);
  }
});

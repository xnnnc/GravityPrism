import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = import.meta.dirname;

const enhancerMod = require(path.join(__dirname, '..', 'host-workbench-enhancer.js'));
const inlineDiffMod = require(path.join(__dirname, '..', 'vendor', 'inline-diff', 'inline-diff-client.js'));
const streamMod = require(path.join(__dirname, '..', 'stream-choreography.js'));

// ── Lightweight Deterministic DOM Harness (Zero External Dependencies) ─────
function createClassList(el) {
  const set = new Set();
  const syncAttr = () => {
    const str = Array.from(set).join(' ');
    if (str) el._attrs.set('class', str);
    else el._attrs.delete('class');
  };
  return {
    _syncFromString(str) {
      set.clear();
      for (const tok of String(str || '').split(/\s+/).filter(Boolean)) set.add(tok);
    },
    add(...tokens) {
      for (const t of tokens) if (t) set.add(t);
      syncAttr();
    },
    remove(...tokens) {
      for (const t of tokens) set.delete(t);
      syncAttr();
    },
    contains(t) {
      return set.has(t);
    },
    toString() {
      return Array.from(set).join(' ');
    },
  };
}

function matchesSimpleSelector(el, rawSel) {
  if (!el || el.nodeType !== 1) return false;
  const sel = rawSel.trim();
  if (!sel) return false;

  // Descendant combinator support (e.g. '[data-testid="planner-response-text"] pre')
  if (sel.includes(' ')) {
    const parts = sel.split(/\s+/).filter(Boolean);
    if (!matchesSimpleSelector(el, parts[parts.length - 1])) return false;
    let cur = el.parentElement;
    for (let i = parts.length - 2; i >= 0; i--) {
      while (cur && !matchesSimpleSelector(cur, parts[i])) {
        cur = cur.parentElement;
      }
      if (!cur) return false;
      cur = cur.parentElement;
    }
    return true;
  }

  let rem = sel;
  const tagMatch = rem.match(/^[a-zA-Z0-9-]+/);
  if (tagMatch) {
    if (el.tagName.toLowerCase() !== tagMatch[0].toLowerCase()) return false;
    rem = rem.slice(tagMatch[0].length);
  }

  for (const im of rem.matchAll(/#([a-zA-Z0-9_\\.-]+)/g)) {
    const expectedId = im[1].replace(/\\/g, '');
    if ((el.id || el.getAttribute('id') || '') !== expectedId) return false;
  }
  rem = rem.replace(/#[a-zA-Z0-9_\\.-]+/g, '');

  for (const cm of rem.matchAll(/\.([a-zA-Z0-9_-]+)/g)) {
    if (!el.classList.contains(cm[1])) return false;
  }
  rem = rem.replace(/\.[a-zA-Z0-9_-]+/g, '');

  for (const am of rem.matchAll(/\[([a-zA-Z0-9_-]+)(?:="([^"]*)")?\]/g)) {
    const attrName = am[1];
    const expectedVal = am[2];
    if (!el.hasAttribute(attrName)) return false;
    if (expectedVal !== undefined && el.getAttribute(attrName) !== expectedVal) return false;
  }
  return true;
}

function matchesAnySelector(el, selectorList) {
  const parts = String(selectorList || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const p of parts) {
    if (matchesSimpleSelector(el, p)) return true;
  }
  return false;
}

function createMockEnv(initialVars = {}) {
  const computedVars = new Map(
    Object.entries({
      'color-scheme': 'dark',
      '--background': '#0B0B0E',
      '--content': '#0E0E11',
      '--sidebar': '#09090B',
      '--card': '#141418',
      '--card-border': 'rgba(255,255,255,0.088)',
      '--border': 'rgba(255,255,255,0.072)',
      '--secondary': '#1C1C22',
      '--secondary-foreground': '#C4C4CE',
      '--muted': '#141418',
      '--muted-foreground': '#8A8A98',
      '--foreground': '#F2F2F5',
      '--placeholder': '#626270',
      '--primary': '#669DF6',
      '--primary-foreground': '#FFFFFF',
      '--link': '#8AB4F8',
      '--error': '#E5534B',
      ...initialVars,
    })
  );

  let orderCounter = 0;

  function createElement(tag, attrs = {}) {
    const listeners = new Map();
    const el = {
      nodeType: 1,
      tagName: String(tag || 'div').toUpperCase(),
      ownerDocument: null,
      parentElement: null,
      parentNode: null,
      children: [],
      childNodes: [],
      isConnected: true,
      hidden: false,
      disabled: false,
      value: '',
      placeholder: '',
      scrollTop: 0,
      _text: '',
      _rect: { left: 0, top: 0, width: 600, height: 40, bottom: 40, right: 600 },
      _attrs: new Map(),
      _order: ++orderCounter,
      style: {
        _props: new Map(),
        setProperty(k, v) {
          this._props.set(k, String(v));
        },
        getPropertyValue(k) {
          return this._props.get(k) || '';
        },
        removeProperty(k) {
          this._props.delete(k);
        },
      },
      get id() {
        return this._attrs.get('id') || '';
      },
      set id(val) {
        const s = String(val || '');
        if (s) this._attrs.set('id', s);
        else this._attrs.delete('id');
      },
      get className() {
        return this._attrs.get('class') || '';
      },
      set className(val) {
        const s = String(val || '');
        if (s) this._attrs.set('class', s);
        else this._attrs.delete('class');
        this.classList._syncFromString(s);
      },
      get textContent() {
        if (this.childNodes.length === 0) return this._text;
        return this.childNodes.map((c) => (c.nodeType === 3 ? c.data : c.textContent)).join('');
      },
      set textContent(val) {
        this.children = [];
        this.childNodes = [];
        this._text = String(val ?? '');
      },
      get firstChild() {
        return this.childNodes[0] || null;
      },
      get firstElementChild() {
        return this.children[0] || null;
      },
      get lastElementChild() {
        return this.children[this.children.length - 1] || null;
      },
      get nextElementSibling() {
        if (!this.parentElement) return null;
        const idx = this.parentElement.children.indexOf(this);
        return idx >= 0 && idx + 1 < this.parentElement.children.length ? this.parentElement.children[idx + 1] : null;
      },
      get previousElementSibling() {
        if (!this.parentElement) return null;
        const idx = this.parentElement.children.indexOf(this);
        return idx > 0 ? this.parentElement.children[idx - 1] : null;
      },
      setAttribute(k, v) {
        const str = String(v);
        this._attrs.set(k, str);
        if (k === 'class') this.classList._syncFromString(str);
      },
      getAttribute(k) {
        return this._attrs.has(k) ? this._attrs.get(k) : null;
      },
      hasAttribute(k) {
        return this._attrs.has(k);
      },
      removeAttribute(k) {
        this._attrs.delete(k);
        if (k === 'class') this.classList._syncFromString('');
      },
      appendChild(child) {
        if (!child) return child;
        if (child.parentElement) child.remove();
        child.parentElement = this;
        child.parentNode = this;
        child.ownerDocument = this.ownerDocument;
        child._order = ++orderCounter;
        this.childNodes.push(child);
        if (child.nodeType === 1) this.children.push(child);
        return child;
      },
      insertBefore(child, ref) {
        if (!ref) return this.appendChild(child);
        if (child.parentElement) child.remove();
        child.parentElement = this;
        child.parentNode = this;
        child.ownerDocument = this.ownerDocument;
        child._order = ++orderCounter;
        const cnIdx = this.childNodes.indexOf(ref);
        if (cnIdx >= 0) this.childNodes.splice(cnIdx, 0, child);
        else this.childNodes.push(child);
        if (child.nodeType === 1) {
          const elIdx = this.children.indexOf(ref);
          if (elIdx >= 0) this.children.splice(elIdx, 0, child);
          else this.children.push(child);
        }
        return child;
      },
      removeChild(child) {
        const ci = this.childNodes.indexOf(child);
        if (ci >= 0) this.childNodes.splice(ci, 1);
        const ei = this.children.indexOf(child);
        if (ei >= 0) this.children.splice(ei, 1);
        child.parentElement = null;
        child.parentNode = null;
        return child;
      },
      remove() {
        if (this.parentElement) this.parentElement.removeChild(this);
      },
      contains(other) {
        let cur = other;
        while (cur) {
          if (cur === this) return true;
          cur = cur.parentElement;
        }
        return false;
      },
      compareDocumentPosition(other) {
        if (!other || other === this) return 0;
        return (other._order || 0) > (this._order || 0) ? 4 : 2;
      },
      closest(sel) {
        let cur = this;
        while (cur) {
          if (matchesAnySelector(cur, sel)) return cur;
          cur = cur.parentElement;
        }
        return null;
      },
      querySelectorAll(sel) {
        const out = [];
        const walk = (node) => {
          for (const ch of node.children) {
            if (matchesAnySelector(ch, sel)) out.push(ch);
            walk(ch);
          }
        };
        walk(this);
        return out;
      },
      querySelector(sel) {
        return this.querySelectorAll(sel)[0] || null;
      },
      getBoundingClientRect() {
        return { ...this._rect };
      },
      addEventListener(type, fn) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(fn);
      },
      removeEventListener(type, fn) {
        listeners.get(type)?.delete(fn);
      },
      dispatchEvent(ev) {
        const evt = ev || { type: 'unknown' };
        if (!evt.target) evt.target = this;
        const set = listeners.get(evt.type);
        if (set) {
          for (const fn of Array.from(set)) fn(evt);
        }
      },
      click() {
        this.dispatchEvent({ type: 'click', target: this, preventDefault() {}, stopPropagation() {} });
      },
    };
    el.classList = createClassList(el);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  }

  function createTextNode(data) {
    return { nodeType: 3, data: String(data ?? ''), parentElement: null, parentNode: null };
  }

  const html = createElement('html', {
    'data-ag-cs-style': '1',
    'data-ag-cs-theme': 'dark',
    'data-ag-cs-palette': 'obsidian',
    'data-ag-cs-light-preset': 'crystal',
    'data-ag-cs-lang': 'zh-CN',
  });
  const body = createElement('body');
  html.appendChild(body);

  const winListeners = new Map();
  const win = {
    innerHeight: 960,
    getComputedStyle(el) {
      const cs = el && el._computedStyle ? el._computedStyle : null;
      return {
        display: cs?.display || '',
        flexDirection: cs?.flexDirection || '',
        getPropertyValue(prop) {
          if (cs && prop in cs) return cs[prop];
          if (cs && prop === 'flex-direction' && cs.flexDirection) return cs.flexDirection;
          return computedVars.get(prop) || '';
        },
      };
    },
    addEventListener(type, fn) {
      if (!winListeners.has(type)) winListeners.set(type, new Set());
      winListeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      winListeners.get(type)?.delete(fn);
    },
    dispatchEvent(ev) {
      const set = winListeners.get(ev.type);
      if (set) {
        for (const fn of Array.from(set)) fn(ev);
      }
    },
  };

  const doc = {
    documentElement: html,
    body,
    activeElement: null,
    createElement: (t) => {
      const n = createElement(t);
      n.ownerDocument = doc;
      return n;
    },
    createElementNS: (_ns, t) => {
      const n = createElement(t);
      n.ownerDocument = doc;
      return n;
    },
    createTextNode,
    querySelectorAll: (sel) => html.querySelectorAll(sel),
    querySelector: (sel) => html.querySelector(sel),
  };
  html.ownerDocument = doc;
  body.ownerDocument = doc;

  return { doc, win, html, body, computedVars, createElement, createTextNode };
}

// ── Test 1: Sidecar (`plugin://*`) 4-Theme PostMessage Bridge & 0fps Dedup ─
test('Sidecar 4-theme bridge pushes computed tokens to Swarm/Pulse iframes, deduplicates at 0fps, and re-pushes on load/theme shift', () => {
  const env = createMockEnv();
  const messagesA = [];
  const messagesB = [];

  const swarmFrame = env.createElement('iframe', {
    'data-testid': 'sidecar-iframe',
    src: 'plugin://swarm--swarm_board-13791/?token=abc',
  });
  swarmFrame.contentWindow = { postMessage: (msg, targetOrigin) => messagesA.push({ msg, targetOrigin }) };

  const slotDiv = env.createElement('div', { 'data-testid': 'sidecar-iframe-slot' });
  const pulseFrame = env.createElement('iframe', { src: 'plugin://antigravity-pulse--panel-13794/' });
  pulseFrame.contentWindow = { postMessage: (msg, targetOrigin) => messagesB.push({ msg, targetOrigin }) };
  slotDiv.appendChild(pulseFrame);

  env.body.appendChild(swarmFrame);
  env.body.appendChild(slotDiv);

  env.win.__agPrismInlineDiff = inlineDiffMod.createInlineDiffClient({
    win: env.win,
    doc: env.doc,
    getLang: () => 'zh-CN',
  });

  const ctl = enhancerMod.createHostEnhancerController({
    doc: env.doc,
    win: env.win,
    getLang: () => 'zh-CN',
  });

  ctl.sync();
  assert.equal(messagesA.length, 1, 'Swarm iframe should receive initial theme-change');
  assert.equal(messagesB.length, 1, 'Slot iframe should receive initial theme-change');
  assert.equal(messagesA[0].targetOrigin, '*');
  assert.equal(messagesA[0].msg.type, 'theme-change');
  assert.equal(messagesA[0].msg.payload.themeType, 'dark');
  assert.equal(messagesA[0].msg.payload.cssVariables['--background'], '#0B0B0E');
  assert.equal(messagesA[0].msg.payload.cssVariables['--accent'], '#669DF6');

  // Repeated sync() while idle must perform ZERO postMessage and ZERO extra getComputedStyle calls (0fps idle!)
  const sampleCountBefore = ctl.getDebugState().themeSampleCount;
  ctl.sync();
  ctl.sync();
  assert.equal(messagesA.length, 1, 'Idle sync() must not spam postMessage');
  assert.equal(ctl.getDebugState().themeSampleCount, sampleCountBefore, 'Idle sync() must skip getComputedStyle');

  // Switch to Warm Alabaster Light theme -> onThemeChange() must broadcast warm light tokens
  env.html.setAttribute('data-ag-cs-theme', 'light');
  env.html.setAttribute('data-ag-cs-palette', 'warm');
  env.html.setAttribute('data-ag-cs-light-preset', 'alabaster');
  env.computedVars.set('color-scheme', 'light');
  env.computedVars.set('--background', '#F6F4EE');
  env.computedVars.set('--primary', '#C25934');

  ctl.onThemeChange();
  assert.equal(messagesA.length, 2);
  assert.equal(messagesA[1].msg.payload.themeType, 'light');
  assert.equal(messagesA[1].msg.payload.cssVariables['--background'], '#F6F4EE');
  assert.equal(messagesA[1].msg.payload.cssVariables['--primary'], '#C25934');

  // Simulate late iframe reload -> load listener must immediately re-hydrate tokens
  swarmFrame.dispatchEvent({ type: 'load' });
  assert.equal(messagesA.length, 3, 'Iframe load event must re-push latest theme');

  ctl.destroy();
  swarmFrame.dispatchEvent({ type: 'load' });
  assert.equal(messagesA.length, 3, 'Destroyed controller must detach iframe load listeners');
});

// ── Test 2: Code Block Sticky Header + Manual Fold (>=48 Lines) + Scroll Anchor ─
test('Code block enhancer marks sticky header, never auto-folds, protects active streaming block, and anchors scrollTop on manual fold', () => {
  const env = createMockEnv();
  let running = true;

  const convView = env.createElement('div', { 'data-testid': 'conversation-view' });
  const viewport = env.createElement('div', { 'data-testid': 'autoscroll-viewport' });
  viewport._rect = { left: 0, top: 100, width: 800, height: 600, bottom: 700, right: 800 };
  viewport.scrollTop = 900;
  convView.appendChild(viewport);

  const prose = env.createElement('div', { 'data-testid': 'planner-response-text' });
  viewport.appendChild(prose);

  function buildHostCodeBlock(lineCount, rectTop = 120) {
    const pre = env.createElement('pre');
    const card = env.createElement('div', { class: 'relative my-2 rounded-xl bg-muted border' });
    card._rect = { left: 20, top: rectTop, width: 720, height: 1200, bottom: rectTop + 1200, right: 740 };
    const header = env.createElement('div', { class: 'min-h-7 relative flex items-center justify-between border-b px-2' });
    const langLabel = env.createElement('div');
    langLabel.textContent = 'typescript';
    const actions = env.createElement('div', { class: 'flex items-center gap-2' });
    const copyBtn = env.createElement('button', { 'aria-label': 'Copy code' });
    actions.appendChild(copyBtn);
    header.appendChild(langLabel);
    header.appendChild(actions);

    const bodyWrap = env.createElement('div', { class: 'p-3' });
    const codeBlock = env.createElement('div', { class: 'code-block' });
    for (let i = 0; i < lineCount; i++) {
      const ln = env.createElement('div', { class: 'code-line' });
      ln.textContent = `const line_${i} = ${i};`;
      codeBlock.appendChild(ln);
    }
    bodyWrap.appendChild(codeBlock);
    card.appendChild(header);
    card.appendChild(bodyWrap);
    pre.appendChild(card);
    return { pre, card, header, actions };
  }

  // 1) Short block (20 lines) -> sticky attr set, NO fold button
  const shortBlk = buildHostCodeBlock(20, 140);
  prose.appendChild(shortBlk.pre);

  // 2) Completed 64-line block (followed by another block) -> gets manual fold button, NOT auto-folded
  const tallDoneBlk = buildHostCodeBlock(64, -350); // top (-350) is scrolled 450px above viewport top (100)!
  prose.appendChild(tallDoneBlk.pre);

  // 3) Trailing active streaming 80-line block -> protected while running === true
  const streamingBlk = buildHostCodeBlock(80, 400);
  prose.appendChild(streamingBlk.pre);

  env.body.appendChild(convView);

  const ctl = enhancerMod.createHostEnhancerController({
    doc: env.doc,
    win: env.win,
    getLang: () => 'zh-CN',
    isConvRunning: () => running,
  });

  ctl.sync();

  assert.equal(shortBlk.header.getAttribute('data-ag-cs-code-sticky'), '1');
  assert.equal(shortBlk.header.querySelector('.ag-cs-code-fold-btn'), null, 'Short block (<48L) must not show fold button');

  const foldBtn = tallDoneBlk.header.querySelector('.ag-cs-code-fold-btn');
  assert.ok(foldBtn, 'Completed >=48L block must mount manual fold button');
  assert.equal(foldBtn.textContent, '折叠 (64行)');
  assert.equal(tallDoneBlk.card.hasAttribute('data-ag-cs-code-folded'), false, 'Must NEVER auto-fold code blocks');

  assert.equal(
    streamingBlk.header.querySelector('.ag-cs-code-fold-btn'),
    null,
    'Actively streaming trailing block must not mount fold button prematurely'
  );

  // Finish streaming -> trailing 80-line block now receives manual fold button
  running = false;
  ctl.sync();
  assert.ok(streamingBlk.header.querySelector('.ag-cs-code-fold-btn'), 'Finished block mounts fold button after stream ends');

  // Click manual fold on tallDoneBlk whose header is above viewport -> folds AND compensates viewport.scrollTop!
  foldBtn.click();
  assert.equal(tallDoneBlk.card.getAttribute('data-ag-cs-code-folded'), '1');
  assert.equal(foldBtn.getAttribute('aria-expanded'), 'false');
  assert.equal(foldBtn.textContent, '展开 (64行)');
  // Initial scrollTop 900 + (-350 - 100 - 12) = 438
  assert.equal(viewport.scrollTop, 438, 'Manual fold must anchor scrollTop back to block header');

  // Click again -> expands cleanly
  foldBtn.click();
  assert.equal(tallDoneBlk.card.hasAttribute('data-ag-cs-code-folded'), false);
  assert.equal(foldBtn.textContent, '折叠 (64行)');

  ctl.destroy();
  assert.equal(env.doc.querySelectorAll('.ag-cs-code-fold-btn').length, 0);
});

// ── Test 3: Navigator Rail Outline, Filter, Fold Historical Steps & Alt+Up/Down ─
test('Navigator rail outline indexes chapters + prompts without permanent bottom clutter, folds historical steps preserving latest turn, and jumps via Alt+Up/Down', () => {
  const env = createMockEnv();
  const convView = env.createElement('div', { 'data-testid': 'conversation-view' });
  const navRail = env.createElement('nav', { 'data-testid': 'conversation-navigator' });

  let chapterClicked = 0;
  const chBtn = env.createElement('button', {
    'data-testid': 'conversation-navigator-group',
    'data-group-key': 'chapter:0',
    'aria-label': '11月16日 · 69 turns',
  });
  chBtn.addEventListener('click', () => {
    chapterClicked += 1;
  });
  navRail.appendChild(chBtn);

  for (let t = 70; t <= 72; t++) {
    navRail.appendChild(
      env.createElement('button', {
        'data-testid': 'conversation-navigator-turn',
        'aria-label': `Turn ${t} of 72`,
      })
    );
  }
  convView.appendChild(navRail);

  const vp = env.createElement('div', { 'data-testid': 'autoscroll-viewport' });
  vp._rect = { left: 0, top: 0, width: 900, height: 500, bottom: 500, right: 900 };
  vp.scrollTop = 600;
  convView.appendChild(vp);

  function addTurn(promptText, topY) {
    const step = env.createElement('div', { 'data-testid': 'user-input-step' });
    step._rect = { left: 40, top: topY, width: 700, height: 60, bottom: topY + 60, right: 740 };
    const msg = env.createElement('div', { 'data-testid': 'user-message-content' });
    msg.textContent = promptText;
    step.appendChild(msg);
    vp.appendChild(step);

    const resp = env.createElement('div', { 'data-testid': 'agent-response' });
    const wf = env.createElement('button', { 'data-testid': 'worked-for-collapsible', 'aria-expanded': 'true' });
    wf.addEventListener('click', () => {
      wf.setAttribute('aria-expanded', wf.getAttribute('aria-expanded') === 'true' ? 'false' : 'true');
    });
    const th = env.createElement('button', { 'data-testid': 'thinking-collapsible-trigger', 'aria-expanded': 'true' });
    th.addEventListener('click', () => {
      th.setAttribute('aria-expanded', th.getAttribute('aria-expanded') === 'true' ? 'false' : 'true');
    });
    resp.appendChild(wf);
    resp.appendChild(th);
    vp.appendChild(resp);
    return { step, wf, th };
  }

  const t70 = addTurn('排查 Swarm 面板白屏原因', -420);
  const t71 = addTurn('修复代码块双重边框与吸顶', 80);
  const t72 = addTurn('补充全量单测与体积校验', 410);
  env.body.appendChild(convView);

  env.win.__agPrismInlineDiff = inlineDiffMod.createInlineDiffClient({
    win: env.win,
    doc: env.doc,
    getLang: () => 'zh-CN',
  });

  const ctl = enhancerMod.createHostEnhancerController({
    doc: env.doc,
    win: env.win,
    getLang: () => 'zh-CN',
  });
  ctl.sync();

  // Zero permanent clutter before hover!
  assert.equal(env.doc.querySelector('.ag-cs-nav-outline-popover'), null, 'No DOM popover mounted before rail interaction');

  // Hover left rail -> opens outline popover with chapter + turns #70..#72
  navRail.dispatchEvent({ type: 'pointerenter' });
  const pop = env.doc.querySelector('.ag-cs-nav-outline-popover');
  assert.ok(pop && !pop.hidden, 'Hovering rail opens outline popover');
  assert.equal(pop.querySelector('.ag-cs-nav-outline-title')?.textContent, '提问导航 · 72 轮');
  assert.equal(pop.querySelectorAll('.ag-cs-nav-outline-chapter').length, 1);
  assert.equal(pop.querySelectorAll('.ag-cs-nav-outline-item').length, 3);
  assert.equal(pop.querySelector('.ag-cs-nav-outline-item')?.getAttribute('data-turn-num'), '70');

  // Chapter click delegates cleanly to host native button
  pop.querySelector('.ag-cs-nav-outline-chapter').click();
  assert.equal(chapterClicked, 1);

  // Filter input narrows items in real time
  const search = pop.querySelector('.ag-cs-nav-outline-search');
  search.value = '吸顶';
  search.dispatchEvent({ type: 'input' });
  const filteredItems = pop.querySelectorAll('.ag-cs-nav-outline-item');
  assert.equal(filteredItems.length, 1);
  assert.equal(filteredItems[0].getAttribute('data-turn-num'), '71');

  // Fold historical steps: collapses t70 & t71, strictly preserves latest turn t72!
  pop.querySelector('.ag-cs-nav-fold-steps-btn').click();
  assert.equal(t70.wf.getAttribute('aria-expanded'), 'false');
  assert.equal(t70.th.getAttribute('aria-expanded'), 'false');
  assert.equal(t71.wf.getAttribute('aria-expanded'), 'false');
  assert.equal(t72.wf.getAttribute('aria-expanded'), 'true', 'Latest turn worked-for must stay expanded');
  assert.equal(t72.th.getAttribute('aria-expanded'), 'true', 'Latest turn thinking must stay expanded');

  // Alt+ArrowUp jumps to previous turn above viewport (t70 at -420) and triggers sonar
  let prevented = false;
  env.win.dispatchEvent({
    type: 'keydown',
    key: 'ArrowUp',
    altKey: true,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    target: env.body,
    preventDefault() {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  assert.equal(t70.step.getAttribute('data-ag-cs-sonar'), '1');

  // Alt+ArrowDown inside an editable input must NOT be hijacked
  const editor = env.createElement('div', { contenteditable: 'true' });
  env.body.appendChild(editor);
  let hijackedInEditor = false;
  env.win.dispatchEvent({
    type: 'keydown',
    key: 'ArrowDown',
    altKey: true,
    target: editor,
    preventDefault() {
      hijackedInEditor = true;
    },
  });
  assert.equal(hijackedInEditor, false, 'Must never hijack Alt+Arrow inside editable composer/inputs');

  ctl.destroy();
});

// ── Test 4: Stream Choreography Edge-Case Anti-Flicker Guards ─────────────
test('stream-choreography prevents outer <pre> flicker on TextNode appends, keeps inline <code> paragraphs vertical, and coalesces table scans per <tr>', () => {
  const env = createMockEnv();
  const prevDoc = globalThis.document;
  globalThis.document = env.doc;

  try {
    const conv = env.createElement('div', { 'data-testid': 'conversation-view' });
    const prose = env.createElement('div', { 'data-testid': 'planner-response-text' });
    conv.appendChild(prose);
    env.body.appendChild(conv);

    const pre = env.createElement('pre');
    const codeBlock = env.createElement('div', { class: 'code-block' });
    const line1 = env.createElement('div', { class: 'code-line' });
    codeBlock.appendChild(line1);
    pre.appendChild(codeBlock);
    prose.appendChild(pre);

    const table = env.createElement('table');
    const tbody = env.createElement('tbody');
    const tr = env.createElement('tr');
    tbody.appendChild(tr);
    table.appendChild(tbody);
    prose.appendChild(table);

    const streamCtl = streamMod.createStreamChoreographyController({
      motionEngine: null,
      isDestroyed: () => false,
      isComposerRestyleEnabled: () => true,
      isMotionStandardOrUltra: () => true,
      isMotionUltra: () => true,
      isConvRunning: () => true,
      isThoughtIsolatedNode: () => false,
      isThoughtMutationRecord: () => false,
      isManagedThoughtPanel: () => false,
      setAttrIfChanged: (el, k, v) => el.setAttribute(k, v),
      runGuardedMut: (fn) => fn(),
      cloneCachedSvgElement: () => null,
      buildBrandMarkSvg: () => '',
      applySingleHostIcon: () => {},
      rippleCtl: null,
      convAuraCtl: { triggerLiftoffEbb() {} },
      notifyMascot: () => {},
    });

    // 1) Appending plain TextNode inside <pre>/code-line must NOT slap .ag-cs-code-scan onto outer <pre> or .code-block
    const txt = env.createTextNode('const x = 42;');
    line1.appendChild(txt);
    streamCtl.onStreamMutations([{ type: 'childList', target: line1, addedNodes: [txt] }]);
    assert.equal(pre.classList.contains('ag-cs-code-scan'), false, 'Outer <pre> must never flicker on TextNode append');
    assert.equal(codeBlock.classList.contains('ag-cs-code-scan'), false);

    // 2) Paragraph containing inline <code> must receive vertical .ag-cs-stream-chunk, NOT horizontal .ag-cs-code-scan
    const para = env.createElement('p');
    const inlineCode = env.createElement('code');
    inlineCode.textContent = 'style.css';
    para.appendChild(inlineCode);
    prose.appendChild(para);
    streamCtl.onStreamMutations([{ type: 'childList', target: prose, addedNodes: [para] }]);
    assert.equal(para.classList.contains('ag-cs-stream-chunk'), true, 'Paragraph with inline <code> should use vertical stream-chunk');
    assert.equal(para.classList.contains('ag-cs-code-scan'), false, 'Paragraph with inline <code> must not use horizontal code-scan');

    // 3) Appending multiple <td> cells into a <tr> coalesces onto the parent <tr> once, never per-cell
    const td1 = env.createElement('td');
    const td2 = env.createElement('td');
    tr.appendChild(td1);
    tr.appendChild(td2);
    streamCtl.onStreamMutations([{ type: 'childList', target: tr, addedNodes: [td1, td2] }]);
    assert.equal(tr.classList.contains('ag-cs-code-scan'), true, 'Parent <tr> receives coalesced scan');
    assert.equal(td1.classList.contains('ag-cs-code-scan'), false, 'Individual <td> must not animate separately');
    assert.equal(td2.classList.contains('ag-cs-code-scan'), false);

    streamCtl.clearTransientTimers();
  } finally {
    globalThis.document = prevDoc;
  }
});

// ── Test 5: style.css Wave 2 Optical, Surface, Schema & Thought Contracts ─
test('style.css covers all 6 Wave-2 config hooks, eliminates double borders & entity-pill underline, purges warm-theme cold-blue leaks, and styles thought-translator V2 tokens', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');

  let depth = 0;
  for (const ch of css) {
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    assert.ok(depth >= 0, 'Unbalanced closing brace in style.css');
  }
  assert.equal(depth, 0, 'Curly braces in style.css must be 100% balanced');

  // 1) All 6 new schema hooks
  for (const hook of [
    'data-ag-cs-accent="cobalt"',
    'data-ag-cs-accent="iris"',
    'data-ag-cs-accent="amber"',
    'data-ag-cs-accent="mono"',
    'data-ag-cs-corners="sharp"',
    'data-ag-cs-corners="balanced"',
    'data-ag-cs-corners="soft"',
    'data-ag-cs-code-font="jetbrains"',
    'data-ag-cs-code-font="cascadia"',
    'data-ag-cs-code-font="sfmono"',
    'data-ag-cs-ligatures="1"',
    'data-ag-cs-ambient="0"',
    'data-ag-cs-ambient="0.35"',
    'data-ag-cs-ambient="0.7"',
    'data-ag-prism-thought-view="bilingual"',
    'data-ag-cs-cjk="1"',
  ]) {
    assert.ok(css.includes(hook), `Expected style.css to implement Wave 2 attribute hook: ${hook}`);
  }

  // 2) Host deep-surface fixes (code sticky, manual fold, table frame, entity-pill exclusion, console well, sidecar slot, navigator group)
  for (const selector of [
    '[data-testid="sidecar-iframe-slot"]',
    'pre>div:is(.border,.bg-muted)',
    'position:sticky;top:0;z-index:3',
    '.ag-cs-code-fold-btn',
    'data-ag-cs-code-folded="1"',
    '.agy-md-table.md-table-frame',
    ':not([data-testid="entity-pill"])',
    '[data-testid="running-items-panel"]',
    '[data-testid="background-task-command"]',
    '[data-testid="subagent-node"]',
    '[data-testid="artifact-row"]',
    '[data-testid="artifact-view"]',
    '[data-testid="aux-pane-split"]',
    '[data-testid="conversation-navigator-group"]',
    '.ag-cs-nav-outline-popover',
    '--glass-highlight:var(--ag-cs-specular) !important',
    '::selection',
  ]) {
    assert.ok(css.includes(selector), `Expected style.css to include deep-surface rule: ${selector}`);
  }

  // 3) Thought translator Wave-1 (#123) 6 semantic selectors
  for (const thoughtSel of [
    '.ag-prism-thought-file-pill',
    '.ag-prism-thought-fallback-badge',
    '.ag-prism-thought-retranslate-btn',
    '.ag-prism-thought-error-bar',
    '.ag-prism-thought-retry-btn',
    '.ag-cs-thought-cache-badge',
    'data-op-zh-failed="1"',
  ]) {
    assert.ok(css.includes(thoughtSel), `Expected style.css to style thought-translator selector: ${thoughtSel}`);
  }

  // 4) Bug-hunt #153 optical, gating & corner parity contracts
  for (const contract of [
    '--ag-ambient-mul:1;--ag-accent-prism-mul:1',
    '[data-ag-cs-accent="cobalt"]>body',
    '[data-ag-cs-accent="mono"]>body',
    '[data-ag-cs-palette="host"]>body',
    '[data-ag-cs-telemetry="off"] :is(#ag-pulse-status-bar,[data-ag-pulse-bar="true"]){display:none !important;}',
    '[data-ag-cs-composer="on"]:not([data-ag-cs-telemetry="off"]) .agy-composer-footer>#ag-pulse-status-bar',
    ':is(.agy-composer-footer,[data-testid="input-box-bottom-toolbar"]){position:relative !important;z-index:32 !important;}',
    ':is(#ag-prism-pulse-bar,[data-ag-prism-pulse-bar],#ag-pulse-status-bar):not([data-layout="blocked"]){z-index:36 !important;}',
    '[data-ag-cs-composer="off"] .surface-composer-card>.ag-cs-prism-rim-cv{display:none !important;',
    '&:not([data-ag-cs-home="off"]) .agy-home{',
    '[data-ag-cs-sidebar="on"][data-ag-cs-sidebar-compact="on"]',
    '[data-ag-cs-sidebar="on"][data-ag-cs-sidebar-collapsed="1"]',
    '[data-testid="conversation-navigator"]{pointer-events:auto !important;}',
    '.ag-cs-nav-outline-popover::before',
    '.code-line,kbd,[data-lexical-editor="true"] code,.monaco-editor .view-lines,.xterm,.xterm-rows',
    '[data-ag-cs-logo-ink="foreground"]',
    '.ag-cs-settings-brand-svg',
  ]) {
    assert.ok(css.includes(contract), `Expected style.css to enforce #153 fix contract: ${contract}`);
  }

  // 5) D11 dead-rule purge, high-frequency 5 native surfaces & hard redlines
  for (const dead of [
    '.reactTooltipCoretooltip',
    '.cm-content',
    '.ag-m3-diff-actions',
    '[data-testid="toast-notification"]',
    '[data-testid="add-resource-menu"]',
    '[data-testid="running-items-card"]',
    '.markdown-frontmatter',
    '.ag-cs-perm-deck',
    '[data-ag-perm-hosted="1"]',
    '.ag-cs-inline-diff-head',
    '.ag-cs-inline-diff-float',
    '--ag-cs-sheen',
    '--ag-cs-code-well',
    '--ag-cs-sidebar-hover',
    '--ag-cs-sidebar-sel-bar',
    '--ag-cs-sidebar-sel-glow',
    '--ag-cs-bubble-sh',
    '--ag-cs-card-header-sh',
  ]) {
    assert.equal(css.includes(dead), false, `D11/D12 purge must remove dead/obsolete token or selector: ${dead}`);
  }
  for (const ch6Sel of [
    '[data-ag-diff-chip="1"]',
    '.ag-cs-diff-ctx-menu',
    '.ag-cs-inline-diff-loading',
  ]) {
    const hasOwnRule = ch6Sel.startsWith('.') ? css.includes(`${ch6Sel}{`) : css.includes(ch6Sel);
    assert.equal(hasOwnRule, false, `Channel 1 style.css must decouple Inline Diff rule ${ch6Sel} into Channel 6`);
    assert.ok(inlineDiffMod.INLINE_DIFF_CSS.includes(ch6Sel), `Channel 6 inline-diff-client.js CSS must cover ${ch6Sel}`);
  }
  for (const d11Sel of [
    '[data-ag-perm-selected="1"]',
    '[data-testid="permissions-sandbox-hint"]',
    '.surface-glass',
    '.surface-opaque',
    'button.surface-opaque:hover',
    '.agy-takeover-frame',
    '.agy-takeover-card',
    '[data-testid="ask-question-option"]',
    '[data-testid="ask-question-writein"]',
    '[data-testid="permission-target-editor"]',
    '.agy-card',
    '.agy-callout',
    '.agy-tip-card',
    '.agy-field',
    '.agy-textarea',
    '.agy-select-trigger',
    '[data-slot="toggle-group"]',
    '.agy-live-dock-slot',
    '[data-testid="autonomous-mode-inline"]',
    '[data-testid="background-task-row"]',
    '[data-testid="subagent-stop"]',
    '.code-line.selected',
    '.code-line.active-commenting',
    '.xterm-scrollable-element>.scrollbar',
    '.artifact-card',
    '.proceed-button',
    '.aux-drawer-popup',
    '.agy-aux-tab',
    '[data-testid="empty-file-open-button"]',
    '.agy-inset-shell',
    '[data-tiling-pane]',
    '[data-testid="tiling-splitter"]',
    '[data-sash-handle]',
    '[data-side-panel-strip]',
    '[data-peek-surface]',
    '--sash-line:',
    '--sash-glow:',
    '--sdk-color-surface:',
    '--sdk-color-canvas:',
    '--sdk-toolbar-bg:',
    '--sdk-sidebar-bg:',
    '--sdk-primary:',
    '--sdk-border:',
    '.pdf-toolbar',
    '.pdf-sidebar',
    '.floating-comment-card',
    '.comment-card',
    '.reactTooltipComponentarrow',
    '.toast-root',
    '.agy-sidebar-raised',
  ]) {
    assert.ok(css.includes(d11Sel), `Expected style.css to cover D11 native surface selector/token: ${d11Sel}`);
  }
  assert.equal(/[^\x00-\x7F]/.test(css), false, 'style.css must contain zero non-ASCII chars');
  assert.equal(/:has\(/.test(css), false, 'style.css must contain zero :has()');
  assert.equal(/blur\((?:20|24)px\)/.test(css), false, 'style.css must not use blur(20px|24px)');
  assert.equal(css.includes('scrollbar-width:thin'), false, 'style.css must not use scrollbar-width:thin');
  const scrollBottomRule = css.split('\n').find((l) => l.includes('& .agy-scroll-bottom{')) || '';
  assert.equal(scrollBottomRule.includes('position:relative'), false, '.agy-scroll-bottom must never set position:relative');
  const overviewShellRule = css.split('\n').find((l) => l.includes('& [data-ag-cs-overview-shell="1"]{')) || '';
  assert.equal(overviewShellRule.includes('position:relative'), false, '[data-ag-cs-overview-shell="1"] must never override native absolute floating positioning');

  const enhancerSrc = fs.readFileSync(path.join(__dirname, '..', 'host-workbench-enhancer.js'), 'utf8');
  assert.equal(enhancerSrc.includes('doc.click'), false, 'host-workbench-enhancer.js must have 0 doc.click');
  assert.equal(enhancerSrc.includes('innerHTML'), false, 'host-workbench-enhancer.js must have 0 innerHTML');
  assert.equal(enhancerSrc.includes('setPrefValue'), false, 'host-workbench-enhancer.js must have 0 setPrefValue');
  assert.equal(enhancerSrc.includes('syncPermissionsOpticalDeck'), false, 'Obsolete syncPermissionsOpticalDeck must be removed');

  const jbLine = css.split('\n').find((l) => l.includes('[data-ag-cs-code-font="jetbrains"]')) || '';
  assert.equal(
    jbLine.includes('Google Sans Code'),
    false,
    'jetbrains stack must fallback to Cascadia/Fira/Consolas rather than identical Google Sans Code'
  );
});

// ── Test 6: #153 8-Language Live Refresh + yue->zh-CN Migration, Warm-Light Sidecar Parity, Mid-History Turn Math & Group-Card Yield ─
test('Host enhancer supports 8 languages + yue->zh-CN migration + live switch, aligns warm-light sidecar to prism-alabaster, resolves mid-history turn numbers, and yields to host group-card', () => {
  const env = createMockEnv();
  let curLang = 'yue';

  // Sidecar warm-light parity check (palette=warm + lightPreset=crystal in light mode -> prism-alabaster)
  env.html.setAttribute('data-ag-cs-theme', 'light');
  env.html.setAttribute('data-ag-cs-palette', 'warm');
  env.html.setAttribute('data-ag-cs-light-preset', 'crystal');
  env.computedVars.set('color-scheme', 'light');

  const pushed = [];
  const sideFrame = env.createElement('iframe', { 'data-testid': 'sidecar-iframe', src: 'plugin://swarm--board/' });
  sideFrame.contentWindow = { postMessage: (msg) => pushed.push(msg) };
  env.body.appendChild(sideFrame);

  // Conversation with 100 total turns scrolled to mid-history (#27, #28 active, #29)
  const convView = env.createElement('div', { 'data-testid': 'conversation-view' });
  const navRail = env.createElement('nav', { 'data-testid': 'conversation-navigator' });
  const grpBtn = env.createElement('button', {
    'data-testid': 'conversation-navigator-group',
    'aria-label': 'Earlier turns',
  });
  navRail.appendChild(grpBtn);
  for (let t = 1; t <= 100; t++) {
    const dot = env.createElement('button', {
      'data-testid': 'conversation-navigator-turn',
      'aria-label': `Turn ${t} of 100`,
    });
    if (t === 28) dot.setAttribute('aria-current', 'true');
    navRail.appendChild(dot);
  }
  convView.appendChild(navRail);

  const vp = env.createElement('div', { 'data-testid': 'autoscroll-viewport' });
  vp._rect = { left: 0, top: 0, width: 900, height: 600, bottom: 600, right: 900 };
  convView.appendChild(vp);

  const prose = env.createElement('div', { 'data-testid': 'planner-response-text' });
  const pre = env.createElement('pre');
  const card = env.createElement('div', { class: 'bg-muted border' });
  const hdr = env.createElement('div', { class: 'border-b justify-between' });
  const bodyWrap = env.createElement('div');
  for (let i = 0; i < 52; i++) {
    const ln = env.createElement('div', { class: 'code-line' });
    ln.textContent = `line ${i}`;
    bodyWrap.appendChild(ln);
  }
  card.appendChild(hdr);
  card.appendChild(bodyWrap);
  pre.appendChild(card);
  prose.appendChild(pre);
  vp.appendChild(prose);

  function addMidTurn(txt, topY) {
    const step = env.createElement('div', { 'data-testid': 'user-input-step' });
    step._rect = { left: 40, top: topY, width: 700, height: 50, bottom: topY + 50, right: 740 };
    step.textContent = txt;
    vp.appendChild(step);
    return step;
  }
  addMidTurn('Mid turn A', -120);
  addMidTurn('Mid turn B (active in viewport)', 150);
  addMidTurn('Mid turn C', 460);
  env.body.appendChild(convView);

  const ctl = enhancerMod.createHostEnhancerController({
    doc: env.doc,
    win: env.win,
    getLang: () => curLang,
    isConvRunning: () => false,
  });

  ctl.sync();

  assert.equal(pushed.length, 1);
  assert.equal(pushed[0].payload.theme, 'prism-alabaster', 'Light + warm palette must push prism-alabaster');

  const foldBtn = hdr.querySelector('.ag-cs-code-fold-btn');
  assert.ok(foldBtn);
  assert.equal(foldBtn.textContent, '折叠 (52行)', 'Legacy yue must migrate smoothly to zh-CN label instead of English fallback');

  // Open outline -> verify migrated zh-CN texts and mid-history turn numbers (#27, #28, #29)
  navRail.dispatchEvent({ type: 'pointerenter', target: navRail });
  const pop = env.doc.querySelector('.ag-cs-nav-outline-popover');
  assert.ok(pop && !pop.hidden);
  assert.equal(pop.querySelector('.ag-cs-nav-fold-steps-btn')?.textContent, '收起步骤');
  const turnNums = pop.querySelectorAll('.ag-cs-nav-outline-item').map((n) => n.getAttribute('data-turn-num'));
  assert.deepEqual(turnNums, ['27', '28', '29'], 'Mid-history virtualized slice must anchor to active turn dot #28');

  // Switch across all 8 languages dynamically -> sync()/onThemeChange(false) refreshes fold button & open outline immediately
  for (const [nextLang, expFold, expFoldSteps] of [
    ['zh-TW', '摺疊 (52行)', '收起步驟'],
    ['ja', '折りたたむ (52行)', '手順を畳む'],
    ['ko', '접기 (52줄)', '단계 접기'],
    ['es', 'Contraer (52L)', 'Contraer pasos'],
    ['fr', 'Replier (52L)', 'Replier étapes'],
    ['de', 'Einklappen (52Z)', 'Schritte einklappen'],
    ['en', 'Fold (52L)', 'Fold Steps'],
  ]) {
    curLang = nextLang;
    ctl.onThemeChange(false);
    assert.equal(foldBtn.textContent, expFold, `foldBtn mismatch for ${nextLang}`);
    assert.equal(pop.querySelector('.ag-cs-nav-fold-steps-btn')?.textContent, expFoldSteps, `foldSteps mismatch for ${nextLang}`);
  }

  // Hovering a group chapter dot or presence of host native group-card yields cleanly without overlapping
  navRail.dispatchEvent({ type: 'pointerover', target: grpBtn });
  assert.equal(pop.hidden, true, 'Hovering group dot must yield to host native chapter preview card');

  const hostGroupCard = env.createElement('div', { 'data-testid': 'conversation-navigator-group-card' });
  convView.appendChild(hostGroupCard);
  assert.equal(ctl.openNavOutline(navRail), false, 'Must not open outline while host group-card is visible');

  ctl.destroy();
});

// ── Test 7: #153 Stream Choreography Decoupled Composer Gate, Mono Sparks & Motion-Tier Cleanup ─
test('stream-choreography keeps sparks/auto-unfold independent of composerRestyle, supports mono sparks, and purges transient classes on motion downgrade', () => {
  const env = createMockEnv();
  const prevDoc = globalThis.document;
  globalThis.document = env.doc;

  try {
    let motionUltra = true;
    const conv = env.createElement('div', { 'data-testid': 'conversation-view' });
    const trig = env.createElement('button', { 'data-testid': 'thinking-collapsible-trigger' });
    trig.textContent = 'Thinking...';
    conv.appendChild(trig);

    const outerWf = env.createElement('button', { 'data-testid': 'worked-for-collapsible', 'aria-expanded': 'true' });
    const wfBody = env.createElement('div');
    let innerClicked = 0;
    const innerTg = env.createElement('button', { 'data-testid': 'tool-group-collapsible', 'aria-expanded': 'false' });
    innerTg.addEventListener('click', () => {
      innerClicked += 1;
      innerTg.setAttribute('aria-expanded', 'true');
    });
    wfBody.appendChild(innerTg);
    conv.appendChild(outerWf);
    conv.appendChild(wfBody);

    const prose = env.createElement('div', { 'data-testid': 'planner-response-text' });
    const p = env.createElement('p');
    prose.appendChild(p);
    conv.appendChild(prose);
    env.body.appendChild(conv);

    const monoCalls = [];
    const streamCtl = streamMod.createStreamChoreographyController({
      motionEngine: null,
      isDestroyed: () => false,
      isComposerRestyleEnabled: () => false, // composerRestyle OFF must NOT kill conversation sparks/unfold!
      isMotionStandardOrUltra: () => motionUltra,
      isMotionUltra: () => motionUltra,
      isConvRunning: () => true,
      isThoughtIsolatedNode: () => false,
      isThoughtMutationRecord: () => false,
      isManagedThoughtPanel: () => false,
      setAttrIfChanged: (el, k, v) => el.setAttribute(k, v),
      runGuardedMut: (fn) => fn(),
      cloneCachedSvgElement: () => null,
      buildBrandMarkSvg: (_brand, _sz, _tier, mono) => {
        monoCalls.push(mono);
        return '<svg></svg>';
      },
      applySingleHostIcon: () => {},
      rippleCtl: null,
      convAuraCtl: { triggerLiftoffEbb() {} },
      notifyMascot: () => {},
    });

    env.html.setAttribute('data-ag-cs-accent', 'mono');
    streamCtl.syncThinkingSparks({ brand: 'antigravity' });
    assert.ok(trig.querySelector('.ag-cs-thinking-spark'), 'Thinking spark must mount even when composerRestyle is false');
    assert.equal(monoCalls[monoCalls.length - 1], true, 'accent="mono" must request monochrome spark SVG');

    streamCtl.syncWorkedForAutoUnfold();
    assert.equal(innerClicked, 1, 'Tool-group auto-unfold must remain active when composerRestyle is false');

    streamCtl.onStreamMutations([{ type: 'childList', target: prose, addedNodes: [p] }]);
    assert.equal(p.classList.contains('ag-cs-stream-chunk'), true);

    // Downgrade motionLevel from ultra -> off: disconnectStreamObserver must purge transient classes immediately
    motionUltra = false;
    streamCtl.disconnectStreamObserver();
    assert.equal(p.classList.contains('ag-cs-stream-chunk'), false, 'Transient stream-chunk must be cleared on motion downgrade');

    streamCtl.clearTransientTimers();
  } finally {
    globalThis.document = prevDoc;
  }
});

test('WO-MAIN-001C: SIDECAR_THEME_VARS propagates --ag-cs-tonal-0..4 & --font-sans, and data-cascade-id switch resets outline filter/popover', () => {
  for (const key of ['--ag-cs-tonal-0', '--ag-cs-tonal-1', '--ag-cs-tonal-2', '--ag-cs-tonal-3', '--ag-cs-tonal-4', '--font-sans']) {
    assert.ok(enhancerMod.SIDECAR_THEME_VARS.includes(key), `SIDECAR_THEME_VARS must include ${key}`);
  }

  const env = createMockEnv();
  env.computedVars.set('--ag-cs-tonal-0', '#09090b');
  env.computedVars.set('--ag-cs-tonal-2', '#151519');
  env.computedVars.set('--font-sans', "'Google Sans', sans-serif");

  const msgs = [];
  const iframe = env.createElement('iframe', { 'data-testid': 'sidecar-iframe', src: 'plugin://swarm--board/' });
  iframe.contentWindow = { postMessage: (msg) => msgs.push(msg) };
  env.body.appendChild(iframe);

  const conv = env.createElement('div', { 'data-testid': 'conversation-view', 'data-cascade-id': 'conv-alpha' });
  const vp = env.createElement('div', { 'data-testid': 'autoscroll-viewport' });
  const nav = env.createElement('div', { 'data-testid': 'conversation-navigator' });
  const step1 = env.createElement('div', { 'data-testid': 'user-input-step' });
  const msg1 = env.createElement('div', { 'data-testid': 'user-message-content' });
  msg1.textContent = 'First conversation question';
  step1.appendChild(msg1);
  vp.appendChild(step1);
  conv.appendChild(vp);
  conv.appendChild(nav);
  env.body.appendChild(conv);

  env.win.__agPrismInlineDiff = inlineDiffMod.createInlineDiffClient({
    win: env.win,
    doc: env.doc,
    getLang: () => 'zh-CN',
  });

  const ctl = enhancerMod.createHostEnhancerController({
    doc: env.doc,
    win: env.win,
    getLang: () => 'zh-CN',
  });

  try {
    ctl.sync();
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].payload.cssVariables['--ag-cs-tonal-0'], '#09090b');
    assert.equal(msgs[0].payload.cssVariables['--font-sans'], "'Google Sans', sans-serif");

    assert.equal(ctl.openNavOutline(nav), true);
    assert.equal(ctl.getDebugState().outlineOpen, true);
    assert.equal(ctl.getDebugState().lastCascadeId, 'conv-alpha');

    const searchInput = conv.querySelector('.ag-cs-nav-outline-search');
    assert.ok(searchInput);
    searchInput.value = 'First';
    searchInput.dispatchEvent({ type: 'input' });

    // Switch conversation data-cascade-id -> must reset search, clear lastOutlineSig & close stale popover
    conv.setAttribute('data-cascade-id', 'conv-beta');
    msg1.textContent = 'Brand new beta question';
    ctl.sync();
    assert.equal(ctl.getDebugState().lastCascadeId, 'conv-beta');
    assert.equal(ctl.getDebugState().outlineOpen, false, 'Switching data-cascade-id must close previous session outline popover');
    assert.equal(searchInput.value, '', 'Switching data-cascade-id must clear previous outline filter text');

    assert.equal(ctl.openNavOutline(nav), true);
    const items = conv.querySelectorAll('.ag-cs-nav-outline-item');
    assert.equal(items.length, 1);
    assert.ok(items[0].textContent.includes('Brand new beta question'), 'Reopened outline must render new session turns cleanly');
  } finally {
    ctl.destroy();
  }
});

// ── Test 8: D11 Vertical Inline Diff, Async Daemon RPC, Opt-In sidebarNavFold & Fast Scroll-to-Bottom ──
test('D11: vertical flex-row->flex-col inline diff (no header bar + floating SVG icons), opt-in sidebarNavFold off/on restore, and fast scroll-to-bottom glide', () => {
  const env = createMockEnv();

  // 1) Sidebar with 3 native items (New Chat, Automations, Extensions)
  const navBox = env.createElement('div', { 'data-testid': 'sidebar-navigation-items' });
  const navBtns = ['新建会话', '自动化', '自定义扩展'].map((txt) => {
    const b = env.createElement('button');
    b.textContent = txt;
    navBox.appendChild(b);
    return b;
  });
  env.body.appendChild(navBox);

  // 2) Host-realistic nested flex-row -> flex-col tool call row (no data-testid="tool-call-row")
  const colList = env.createElement('div', { class: 'flex flex-col' });
  colList._computedStyle = { display: 'flex', flexDirection: 'column' };
  const fullRow = env.createElement('div', { class: 'group flex w-full items-center' });
  fullRow._computedStyle = { display: 'flex', flexDirection: 'row' };
  const innerRow = env.createElement('div', { class: 'flex items-center gap-1' });
  innerRow._computedStyle = { display: 'flex', flexDirection: 'row' };
  const spanWrap = env.createElement('span');
  spanWrap._computedStyle = { display: 'inline' };

  let nativeSidebarClicks = 0;
  const fileChip = env.createElement('span', { class: 'inline-pill', 'data-tooltip-id': 'tip-file' });
  fileChip.textContent = 'style.css';
  const badgeWrap = env.createElement('span', { class: 'inline-flex items-center' });
  const diffBadge = env.createElement('span', {
    'data-testid': 'diff-line-count',
    'data-tooltip-id': 'tip-open-diff',
    'data-ag-diff-json': JSON.stringify({
      file: 'style.css',
      additions: 2,
      deletions: 1,
      oldText: 'a\nb',
      newText: 'a\nc\nd',
    }),
  });
  diffBadge.textContent = '+2 -1';
  diffBadge.click = () => { nativeSidebarClicks++; };
  badgeWrap.appendChild(diffBadge);
  spanWrap.appendChild(fileChip);
  spanWrap.appendChild(badgeWrap);
  innerRow.appendChild(spanWrap);
  fullRow.appendChild(innerRow);
  const siblingAfter = env.createElement('div', { class: 'group flex w-full' });
  colList.appendChild(fullRow);
  colList.appendChild(siblingAfter);
  env.body.appendChild(colList);

  // 2b) Native permissions-menu with Fiber selected: true
  const permMenu = env.createElement('div', { 'data-testid': 'permissions-menu' });
  const optAsk = env.createElement('button', { 'data-testid': 'permissions-preset-option-ask' });
  optAsk.__reactFiber$test = { memoizedProps: { selected: false }, return: null };
  const optTurbo = env.createElement('button', { 'data-testid': 'permissions-preset-option-turbo' });
  optTurbo.__reactFiber$test = { memoizedProps: { selected: true }, return: null };
  permMenu.appendChild(optAsk);
  permMenu.appendChild(optTurbo);
  env.body.appendChild(permMenu);

  // 3) Conversation viewport + Scroll-to-Bottom button
  const conv = env.createElement('div', { 'data-testid': 'conversation-view' });
  const vp = env.createElement('div', { 'data-testid': 'autoscroll-viewport' });
  vp.scrollHeight = 2000;
  vp.clientHeight = 600;
  vp.scrollTop = 0;
  const scrollBtn = env.createElement('button', { class: 'agy-scroll-bottom' });
  conv.appendChild(vp);
  conv.appendChild(scrollBtn);
  env.body.appendChild(conv);

  let scrollMode = 'smooth';
  let navFoldMode = 'off';
  const rafQueue = [];
  let nowMs = 0;
  env.win.performance = { now: () => nowMs };
  env.win.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };
  env.win.cancelAnimationFrame = () => {};

  const getD11Cfg = () => ({ scrollBottomMotion: scrollMode, sidebarNavFold: navFoldMode, motionLevel: 'ultra' });
  env.win.__agPrismInlineDiff = inlineDiffMod.createInlineDiffClient({
    win: env.win,
    doc: env.doc,
    getLang: () => 'zh-CN',
    getConfig: getD11Cfg,
  });

  const ctl = enhancerMod.createHostEnhancerController({
    doc: env.doc,
    win: env.win,
    getLang: () => 'zh-CN',
    getConfig: getD11Cfg,
  });

  try {
    // sidebarNavFold: 'off' (default) -> zero folding, zero .ag-cs-sb-more-wrap
    ctl.sync();
    assert.equal(navBox.querySelector('.ag-cs-sb-more-wrap'), null, 'sidebarNavFold=off must not mount More wrap');
    for (const b of navBtns) {
      assert.equal(b.hasAttribute('data-ag-sb-more-hidden'), false, 'sidebarNavFold=off must keep all nav items visible');
    }

    // Switch sidebarNavFold: 'on' -> preserve index 0 (New Chat), fold index >= 1 into More (2)
    navFoldMode = 'on';
    ctl.sync();
    assert.equal(navBtns[0].hasAttribute('data-ag-sb-more-hidden'), false, 'Index 0 must stay permanently visible');
    assert.equal(navBtns[1].getAttribute('data-ag-sb-more-hidden'), '1', 'Index 1 must be folded when sidebarNavFold=on');
    assert.equal(navBtns[2].getAttribute('data-ag-sb-more-hidden'), '1', 'Index 2 must be folded when sidebarNavFold=on');
    const moreBtn = navBox.querySelector('.ag-cs-sb-more-btn');
    assert.ok(moreBtn, 'Must mount More button when sidebarNavFold=on');
    assert.equal(moreBtn.querySelector('.ag-cs-sb-more-lbl')?.textContent, '更多 (2)');

    // Expand More -> reveals index >= 1 with rail marker
    moreBtn.dispatchEvent({ type: 'click', preventDefault() {}, stopPropagation() {} });
    assert.equal(navBtns[1].hasAttribute('data-ag-sb-more-hidden'), false, 'Expanding More reveals index 1');
    assert.equal(navBtns[2].getAttribute('data-ag-sb-more-item'), '1', 'Revealed overflow item receives rail marker');

    // Switch sidebarNavFold back to 'off' -> immediately removes More wrap and restores all items cleanly
    navFoldMode = 'off';
    ctl.sync();
    assert.equal(navBox.querySelector('.ag-cs-sb-more-wrap'), null, 'Disabling sidebarNavFold must immediately remove More wrap');
    for (const b of navBtns) {
      assert.equal(b.hasAttribute('data-ag-sb-more-hidden'), false);
      assert.equal(b.hasAttribute('data-ag-sb-more-item'), false);
    }

    // Re-enable before final destroy check
    navFoldMode = 'on';
    ctl.sync();
    assert.ok(navBox.querySelector('.ag-cs-sb-more-wrap'));

    // Unified diff chip merges file + badge, suppresses native hover tooltip, and marks selected permissions option
    assert.equal(spanWrap.getAttribute('data-ag-diff-chip'), '1', 'File chip and diff badge must merge into unified chip');
    assert.equal(fileChip.getAttribute('data-ag-diff-chip-file'), '1');
    assert.equal(diffBadge.hasAttribute('data-tooltip-id'), false, 'Native hover tooltip must be suppressed');
    assert.equal(optTurbo.getAttribute('data-ag-perm-selected'), '1', 'Selected permissions option must be marked');
    assert.equal(optAsk.hasAttribute('data-ag-perm-selected'), false);

    // Vertical flex-row -> flex-col inline diff insertion directly beneath fullRow inside colList (zero floating buttons)
    assert.equal(ctl.toggleInlineDiffPreview(diffBadge), true);
    const box = colList.querySelector('.ag-cs-inline-diff-box');
    assert.ok(box, 'Must mount inline diff box inside vertical column container');
    assert.equal(box.parentElement, colList, 'Box must be inserted into vertical flex-col parent, never horizontally inside flex-row');
    assert.equal(fullRow.nextElementSibling, box, 'Box must sit directly below fullRow');
    assert.equal(innerRow.querySelector('.ag-cs-inline-diff-box'), null, 'Box must never be inserted inside horizontal innerRow');
    assert.equal(box.querySelector('.ag-cs-inline-diff-head'), null, 'Minimal sheet must have ZERO redundant .ag-cs-inline-diff-head bar');
    assert.equal(box.querySelector('.ag-cs-inline-diff-float'), null, 'D12 minimal sheet must have ZERO floating buttons (moved to right-click menu)');
    assert.equal(diffBadge.getAttribute('data-ag-inline-diff-open'), '1');
    assert.equal(spanWrap.getAttribute('data-ag-inline-diff-open'), '1');
    assert.equal(fullRow.getAttribute('data-ag-inline-diff-host'), '1');
    assert.ok(box.querySelectorAll('.ag-cs-inline-diff-line.is-add').length >= 2);
    assert.ok(box.querySelectorAll('.ag-cs-inline-diff-line.is-del').length >= 1);

    // Right-click on merged chip or diff box opens Obsidian context menu; clicking "Open in Sidebar" triggers native badge click
    let ctxPrevented = false;
    env.win.dispatchEvent({
      type: 'contextmenu',
      target: fileChip,
      clientX: 120,
      clientY: 160,
      preventDefault() { ctxPrevented = true; },
      stopPropagation() {},
    });
    assert.equal(ctxPrevented, true, 'Right-click on merged diff chip must open custom Obsidian menu');
    const ctxMenu = env.body.querySelector('.ag-cs-diff-ctx-menu');
    assert.ok(ctxMenu, 'Must mount .ag-cs-diff-ctx-menu on right-click');
    const ctxItems = ctxMenu.querySelectorAll('.ag-cs-diff-ctx-item');
    assert.ok(ctxItems.length >= 2, 'Context menu must provide toggle + open in sidebar');
    ctxItems[1].dispatchEvent({ type: 'click', preventDefault() {}, stopPropagation() {} });
    assert.equal(nativeSidebarClicks, 1, 'Sidebar menu item must trigger native diff click');
    assert.equal(env.body.querySelector('.ag-cs-diff-ctx-menu'), null, 'Context menu must close after click');

    // Toggling again closes inline diff cleanly
    assert.equal(ctl.toggleInlineDiffPreview(diffBadge), true);
    assert.equal(colList.querySelector('.ag-cs-inline-diff-box'), null);
    assert.equal(fullRow.hasAttribute('data-ag-inline-diff-host'), false);
    assert.equal(diffBadge.hasAttribute('data-ag-inline-diff-open'), false);
    assert.equal(spanWrap.hasAttribute('data-ag-inline-diff-open'), false);

    // Fast inertial scroll-to-bottom glide
    assert.equal(ctl.runFastScrollToBottom(scrollBtn), true);
    assert.equal(scrollBtn.getAttribute('data-ag-scrolling'), '1');
    nowMs = 200;
    rafQueue.shift()();
    assert.ok(vp.scrollTop > 700 && vp.scrollTop < 1400, `Expected fast inertial mid-flight scrollTop, got ${vp.scrollTop}`);
    nowMs = 700;
    rafQueue.shift()();
    assert.equal(vp.scrollTop, 1400, 'Scroll glide must settle cleanly at bottom');
    assert.equal(scrollBtn.hasAttribute('data-ag-scrolling'), false);

    // Instant mode yields to native scroll
    scrollMode = 'instant';
    assert.equal(ctl.runFastScrollToBottom(scrollBtn), false, 'Instant setting must yield to native instant jump');
  } finally {
    ctl.destroy();
    assert.equal(navBox.querySelector('.ag-cs-sb-more-wrap'), null, 'destroy must remove More button');
    assert.equal(navBtns[1].hasAttribute('data-ag-sb-more-hidden'), false, 'destroy must unhide folded nav items');
    assert.equal(navBtns[1].hasAttribute('data-ag-sb-more-item'), false, 'destroy must clear overflow rail markers');
    assert.equal(optTurbo.hasAttribute('data-ag-perm-selected'), false, 'destroy must clear perm selected marker');
    // Channel 1 destroy() must unbindHooks only and keep independent Channel 6 alive
    assert.equal(env.win.__agPrismInlineDiff.getDebugState().destroyed, false, 'Channel 1 destroy must NOT kill Channel 6');
    assert.equal(typeof env.win.__agPrismInlineDiffResolve, 'function', 'Channel 1 destroy must keep __agPrismInlineDiffResolve alive');
    const ch6 = env.win.__agPrismInlineDiff;
    ch6.destroy();
    assert.equal(ch6.getDebugState().destroyed, true);
    assert.equal(env.win.__agPrismInlineDiff, undefined, 'Channel 6 destroy must delete win.__agPrismInlineDiff');
    assert.equal(env.win.__agPrismInlineDiffResolve, undefined, 'Channel 6 destroy must clean __agPrismInlineDiffResolve');
    assert.equal(diffBadge.getAttribute('data-tooltip-id'), 'tip-open-diff', 'Channel 6 destroy must restore original tooltip id');
    assert.equal(spanWrap.hasAttribute('data-ag-diff-chip'), false, 'Channel 6 destroy must clear diff chip marker');
  }
});

// ── Test 9: D11-1 Async PrismDaemon Inline Diff RPC (__agPrismInlineDiffCall / Resolve) ──
test('D11-1: async inline diff extracts Fiber fileDiff.uri, displays loading pulse, renders daemon diff safely via textContent, handles binary & cleans up on destroy', async () => {
  const env = createMockEnv();
  const colList = env.createElement('div', { class: 'flex flex-col' });
  colList._computedStyle = { display: 'flex', flexDirection: 'column' };
  const rowA = env.createElement('div', { class: 'group flex w-full' });
  rowA._computedStyle = { display: 'flex', flexDirection: 'row' };
  const badgeA = env.createElement('span', { 'data-testid': 'diff-line-count' });
  badgeA.textContent = '+1 -1';
  badgeA.__reactFiber$test = {
    memoizedProps: {},
    return: {
      memoizedProps: {
        fileDiff: {
          uri: 'file:///C:/workspace/demo.js',
          diffStats: { additions: 1, deletions: 1 },
        },
      },
      return: null,
    },
  };
  rowA.appendChild(badgeA);
  colList.appendChild(rowA);

  const rowB = env.createElement('div', { class: 'group flex w-full' });
  rowB._computedStyle = { display: 'flex', flexDirection: 'row' };
  const badgeB = env.createElement('span', { 'data-testid': 'diff-line-count' });
  badgeB.textContent = '+0 -0';
  badgeB.__reactFiber$test = {
    memoizedProps: { fileDiff: { uri: 'file:///C:/workspace/logo.png' } },
    return: null,
  };
  rowB.appendChild(badgeB);
  colList.appendChild(rowB);
  env.body.appendChild(colList);

  const rpcCalls = [];
  env.win.__agPrismInlineDiffCall = (rawPayload) => {
    rpcCalls.push(JSON.parse(rawPayload));
  };

  env.win.__agPrismInlineDiff = inlineDiffMod.createInlineDiffClient({
    win: env.win,
    doc: env.doc,
    getLang: () => 'zh-CN',
  });

  const ctl = enhancerMod.createHostEnhancerController({
    doc: env.doc,
    win: env.win,
    getLang: () => 'zh-CN',
  });

  try {
    assert.equal(typeof env.win.__agPrismInlineDiffResolve, 'function', 'Controller must register __agPrismInlineDiffResolve');

    // 1) Open badgeA -> shows 22px loading strip and sends readInlineDiff RPC with extracted Fiber uri
    assert.equal(ctl.toggleInlineDiffPreview(badgeA), true);
    assert.equal(rpcCalls.length, 1);
    assert.equal(rpcCalls[0].action, 'readInlineDiff');
    assert.equal(rpcCalls[0].uri, 'file:///C:/workspace/demo.js');
    assert.equal(Number.isSafeInteger(rpcCalls[0].id), true);

    const boxA = rowA.nextElementSibling;
    assert.ok(boxA && boxA.classList.contains('ag-cs-inline-diff-box'));
    assert.ok(boxA.querySelector('.ag-cs-inline-diff-loading'), 'Must render lightweight loading bar while awaiting daemon');

    // Resolve daemon RPC with real diff lines (including XSS-like angle brackets to verify pure textContent rendering)
    env.win.__agPrismInlineDiffResolve(rpcCalls[0].id, {
      ok: true,
      mode: 'git-diff',
      fileName: 'demo.js',
      additions: 1,
      deletions: 1,
      lines: [
        { kind: 'hunk', ln: '', sign: '@@', text: '@@ -1,2 +1,2 @@' },
        { kind: 'del', ln: '1', sign: '-', text: 'const oldVal = 1;' },
        { kind: 'add', ln: '1', sign: '+', text: 'const newVal = "<img onerror=alert(1)>";' },
      ],
    });
    await new Promise((r) => setImmediate(r));

    assert.equal(boxA.querySelector('.ag-cs-inline-diff-loading'), null, 'Loading bar must be replaced after RPC resolves');
    const addLines = boxA.querySelectorAll('.ag-cs-inline-diff-line.is-add');
    const delLines = boxA.querySelectorAll('.ag-cs-inline-diff-line.is-del');
    assert.equal(addLines.length, 1);
    assert.equal(delLines.length, 1);
    assert.equal(addLines[0].querySelector('.ag-cs-inline-diff-code')?.textContent, 'const newVal = "<img onerror=alert(1)>";');
    assert.equal(boxA.querySelector('img'), null, 'Must render code via pure textContent with zero HTML injection');

    // 2) Open badgeB -> resolves as binary -> renders lightweight binary notice
    assert.equal(ctl.toggleInlineDiffPreview(badgeB), true);
    assert.equal(rpcCalls.length, 2);
    assert.equal(rpcCalls[1].uri, 'file:///C:/workspace/logo.png');
    env.win.__agPrismInlineDiffResolve(rpcCalls[1].id, {
      ok: true,
      mode: 'binary',
      fileName: 'logo.png',
      lines: [],
    });
    await new Promise((r) => setImmediate(r));
    const boxB = rowB.nextElementSibling;
    assert.ok(boxB.querySelector('.ag-cs-inline-diff-empty')?.textContent.includes('二进制'), 'Binary response must show concise binary hint');
  } finally {
    ctl.destroy();
    assert.equal(env.win.__agPrismInlineDiff.getDebugState().destroyed, false, 'Channel 1 destroy must NOT kill Channel 6');
    assert.equal(typeof env.win.__agPrismInlineDiffResolve, 'function');
    env.win.__agPrismInlineDiff.destroy();
    assert.equal(env.win.__agPrismInlineDiffResolve, undefined, 'Channel 6 destroy must remove __agPrismInlineDiffResolve');
    assert.equal(colList.querySelectorAll('.ag-cs-inline-diff-box').length, 0, 'Channel 6 destroy must remove all inline diff boxes');
  }
});

// ── Test 11: D13 Full-Width Row Breakout, Action-Verb Exclusion & Zero-Noise Permissions Guard ──
test('D13: inline diff escapes narrow 255px inner block to full-width 754px step row, keeps action verb outside chip, and hides sandbox noise cleanly', async () => {
  const env = createMockEnv();
  const colList = env.createElement('div', { class: 'flex flex-col' });
  colList._computedStyle = { display: 'flex', flexDirection: 'column' };

  const fullStepRow = env.createElement('div', { class: 'group flex w-full min-w-0 items-center' });
  fullStepRow._computedStyle = { display: 'flex', flexDirection: 'row' };
  fullStepRow._rect = { left: 0, top: 0, width: 754, height: 32, right: 754, bottom: 32 };

  const narrowBlockWrap = env.createElement('div', { class: 'truncate overflow-hidden' });
  narrowBlockWrap._computedStyle = { display: 'block', flexDirection: 'row' };
  narrowBlockWrap._rect = { left: 0, top: 0, width: 255, height: 24, right: 255, bottom: 24 };

  const innerActionRow = env.createElement('div', { class: 'flex flex-row items-center gap-1 overflow-hidden' });
  innerActionRow._computedStyle = { display: 'flex', flexDirection: 'row' };
  innerActionRow._rect = { left: 0, top: 0, width: 255, height: 24, right: 255, bottom: 24 };

  const verbSpan = env.createElement('span');
  verbSpan.textContent = 'Created';
  const chipWrap = env.createElement('span', { class: 'inline-flex items-center gap-1 overflow-hidden' });
  const filePill = env.createElement('span', { 'data-testid': 'entity-pill', class: 'inline-pill' });
  filePill.textContent = 'sync-hot-reload.mjs';
  const diffBadge = env.createElement('span', { 'data-testid': 'diff-line-count' });
  const statAdd = env.createElement('span');
  statAdd.textContent = '+1';
  const statZero = env.createElement('span');
  statZero.textContent = '-0';
  diffBadge.appendChild(statAdd);
  diffBadge.appendChild(statZero);
  diffBadge.__reactFiber$d14 = {
    memoizedProps: { fileDiff: { uri: 'file:///C:/workspace/sync-hot-reload.mjs', additions: 1, deletions: 0 } },
    return: null,
  };

  chipWrap.appendChild(filePill);
  chipWrap.appendChild(diffBadge);
  innerActionRow.appendChild(verbSpan);
  innerActionRow.appendChild(chipWrap);
  narrowBlockWrap.appendChild(innerActionRow);
  fullStepRow.appendChild(narrowBlockWrap);
  colList.appendChild(fullStepRow);

  const permMenu = env.createElement('div', { 'data-testid': 'permissions-menu' });
  const permOpts = env.createElement('div', { 'data-testid': 'permissions-project-options' });
  const optTurbo = env.createElement('div', { 'data-testid': 'permissions-preset-option-turbo' });
  optTurbo.__reactFiber$d13 = { memoizedProps: { selected: true }, return: null };
  permOpts.appendChild(optTurbo);
  const sep = env.createElement('div', { role: 'separator' });
  const hint = env.createElement('div', { 'data-testid': 'permissions-sandbox-hint' });
  permMenu.appendChild(permOpts);
  permMenu.appendChild(sep);
  permMenu.appendChild(hint);

  env.body.appendChild(colList);
  env.body.appendChild(permMenu);

  const d14Rpc = [];
  env.win.__agPrismInlineDiffCall = (raw) => d14Rpc.push(JSON.parse(raw));

  env.win.__agPrismInlineDiff = inlineDiffMod.createInlineDiffClient({
    win: env.win,
    doc: env.doc,
    getLang: () => 'zh-CN',
  });

  const ctl = enhancerMod.createHostEnhancerController({
    doc: env.doc,
    win: env.win,
    getLang: () => 'zh-CN',
  });

  try {
    ctl.sync();
    // Action verb 'Created' stays outside [data-ag-diff-chip="1"]; only [entity-pill + diff-line-count] is wrapped
    assert.equal(chipWrap.getAttribute('data-ag-diff-chip'), '1', 'Inner file+diff pair must become merged chip');
    assert.equal(innerActionRow.hasAttribute('data-ag-diff-chip'), false, 'Outer row containing Created verb must NOT become chip');
    assert.equal(innerActionRow.getAttribute('data-ag-diff-chip-row'), '1', 'Overflow-hidden wrapper receives row unclip marker');
    assert.equal(statAdd.getAttribute('data-ag-diff-stat'), 'add', '+N receives luminous add stat');
    assert.equal(statZero.getAttribute('data-ag-diff-stat'), 'zero', '-0 receives muted zero stat');

    // Permissions sandbox separator is marked cleanly alongside Fiber selected state
    assert.equal(optTurbo.getAttribute('data-ag-perm-selected'), '1');
    assert.equal(sep.getAttribute('data-ag-perm-sandbox-sep'), '1');

    // Opening inline diff must attach after fullStepRow (754px), NOT inside narrowBlockWrap (255px)
    assert.equal(ctl.toggleInlineDiffPreview(diffBadge), true);
    const diffBox = fullStepRow.nextElementSibling;
    assert.equal(diffBox?.classList.contains('ag-cs-inline-diff-box'), true, 'Diff box must mount at full-width 754px step row');
    assert.equal(narrowBlockWrap.querySelector('.ag-cs-inline-diff-box'), null, 'Diff box must never mount inside 255px narrow wrapper');

    // Leading @@ hunk must be hidden; cumulative multi-line diff renders merged bar, ┆ continuation rails, and long-line badge
    env.win.__agPrismInlineDiffResolve(d14Rpc[0].id, {
      ok: true,
      mode: 'git-diff',
      additions: 3,
      deletions: 1,
      lines: [
        { kind: 'hunk', ln: '', sign: '@@', text: '@@ -38,4 +38,6 @@' },
        { kind: 'add', ln: '38', sign: '+', text: 'const a = 1;' },
        { kind: 'add', ln: '39', sign: '+', text: 'const b = 2;' },
        { kind: 'add', ln: '40', sign: '+', text: 'const veryLongLineTruncatedByDaemon = true;…' },
        { kind: 'hunk', ln: '', sign: '@@', text: '@@ -120,2 +122,3 @@' },
        { kind: 'del', ln: '120', sign: '-', text: 'const oldVal = 0;' },
      ],
    });
    await new Promise((r) => setImmediate(r));
    const hunkGaps = diffBox.querySelectorAll('.ag-cs-inline-diff-line.is-hunk');
    assert.equal(hunkGaps.length, 1, 'Leading hunk hidden; only inter-hunk gap rendered');
    assert.equal(hunkGaps[0].textContent, '⋯', 'Inter-hunk gap must not render ugly @@ header text');

    assert.equal(diffBox.querySelector('.ag-cs-inline-diff-merged-bar'), null, 'Merged top header bar must stay hidden for clean +/- code focus');

    const addLines = diffBox.querySelectorAll('.ag-cs-inline-diff-line.is-add');
    assert.equal(addLines.length, 3);
    assert.equal(addLines[0].querySelector('.ag-cs-inline-diff-sign')?.textContent, '+', 'First row in contiguous add group shows +');
    assert.equal(addLines[1].querySelector('.ag-cs-inline-diff-sign')?.textContent, '┆', 'Continuation row shows ┆ merged connector');
    assert.equal(addLines[2].querySelector('.ag-cs-inline-diff-sign')?.textContent, '┆', 'End row shows ┆ merged connector');
    assert.ok(addLines[2].querySelector('.ag-cs-inline-diff-wrap-tag'), 'Truncated single long line renders wrap indicator tag');

    const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
    assert.equal(css.includes('grid-template-rows:1fr'), false, 'Diff box must NOT use layout-thrashing grid-template-rows transition');
    assert.ok(css.includes('ag-cs-diff-unfold') && css.includes('ag-cs-diff-fold'), 'Diff box must use GPU compositor unfold/fold keyframes');
    const bqRule = css.split('\n').find((l) => l.includes('& blockquote{')) || '';
    assert.ok(bqRule.includes('border:none !important') && bqRule.includes('transparent 98%') && bqRule.includes('box-shadow:0 0 4px'), 'Blockquote must use calm flat wash with gentle right fade (98%) and subtle left glow');
    assert.equal(bqRule.includes('radial-gradient'), false, 'Blockquote must not have harsh radial spotlight on multi-line expanded blocks');
    assert.ok(css.includes('& [data-ag-cs-overview-shell="1"]{height:auto !important;bottom:auto !important;'), 'Overview shell must auto-fit content height');
    const ovRule = css.split('\n').find((l) => l.includes('& [data-ag-cs-overview-shell="1"]{')) || '';
    assert.ok(ovRule.includes('opacity') && ovRule.includes('transform') && ovRule.includes('[data-ending-style]'), 'Overview shell must preserve smooth open/close opacity+transform transition');
    assert.ok(css.includes('[data-ag-ov-sec-anim="open"]') && css.includes('[data-ag-ov-sec-anim="closing"]'), 'Overview inner sections must have unfold/fold GPU animations');
    assert.ok(css.includes('[data-ui-kind="switch"]') && css.includes('.ag-cs-switch-thumb'), 'Settings panel must define optical switch track and thumb');
    assert.ok(css.includes('[data-testid="queued-messages-card"]') && css.includes('ag-cs-queued-in'), 'Queued messages card must match composer optics with entry motion');
    assert.ok(css.includes('padding-bottom:14px !important'), 'Queued wrapper must add extra vertical clearance for mascot stage');
    assert.ok(css.includes('[data-testid="user-message-media-scroll"]'), 'User message uploaded media thumbnails must be styled cohesively');
    assert.ok(css.includes(':not([role="menuitemcheckbox"])'), 'Customize Sections menuitemcheckbox must be excluded from blue selected box');
    assert.ok(css.includes('[data-ag-overview-running="1"]'), 'Overview shell must support subagent running ambient halo');
    assert.ok(css.includes('[data-ag-sub-running="1"]'), 'Running subagent row must support softened nebula ambient wash');
    assert.ok(css.includes('background:var(--_rb) !important'), 'Sidebar running conversation row preserves classic --_rb rail');
    assert.ok(css.includes('[data-ag-cs-prism-mirror="1"]>.ag-cs-prism-rim-cv'), 'Overview mirror rim canvas selector must exist');
    assert.ok(css.includes('[data-testid="permissions-sandbox-hint"],& [data-ag-perm-sandbox-sep="1"]'), 'Permissions menu must hide sandbox boilerplate & separator');

    // Verify subagent running ambient detection & clean recovery
    const ovShell = env.createElement('div', { 'data-ag-cs-overview-shell': '1' });
    const ovPanel = env.createElement('div', { 'data-testid': 'overview-panel' });
    const secDiv = env.createElement('div', { class: 'p-1' });
    const secHeadBtn = env.createElement('button');
    const subNode = env.createElement('button', { 'data-testid': 'subagent-node' });
    const spin = env.createElement('span', { 'data-testid': 'status-loading-spinner' });
    subNode.appendChild(spin);
    secDiv.appendChild(secHeadBtn);
    secDiv.appendChild(subNode);
    ovPanel.appendChild(secDiv);
    ovShell.appendChild(ovPanel);
    env.body.appendChild(ovShell);

    ctl.sync();
    assert.equal(subNode.getAttribute('data-ag-sub-running'), '1', 'Running subagent row receives ambient attribute');
    assert.equal(secHeadBtn.getAttribute('data-ag-sub-sec-running'), '1', 'Subagent section header receives running glow');
    assert.equal(ovShell.getAttribute('data-ag-overview-running'), '1', 'Overview shell receives running horizon halo');

    spin.remove();
    ctl.sync();
    assert.equal(subNode.hasAttribute('data-ag-sub-running'), false, 'Completed subagent clears row ambient');
    assert.equal(secHeadBtn.hasAttribute('data-ag-sub-sec-running'), false, 'Completed section clears running glow');
    assert.equal(ovShell.hasAttribute('data-ag-overview-running'), false, 'Completed overview returns to pure obsidian 0fps');
  } finally {
    ctl.destroy();
    assert.equal(sep.hasAttribute('data-ag-perm-sandbox-sep'), false, 'destroy must remove data-ag-perm-sandbox-sep');
    assert.equal(env.win.__agPrismInlineDiff.getDebugState().destroyed, false, 'Channel 1 destroy must NOT kill Channel 6');
    env.win.__agPrismInlineDiff.destroy();
    assert.equal(innerActionRow.hasAttribute('data-ag-diff-chip-row'), false, 'Channel 6 destroy must remove data-ag-diff-chip-row');
    assert.equal(statAdd.hasAttribute('data-ag-diff-stat'), false, 'Channel 6 destroy must remove data-ag-diff-stat');
  }
});

// ── Test 12: Wave D18.5 / D19 Sash Transparent Hitbox, Staggered Nested Scrollbars & REMOVE_EXPRESSION Parity ──
test('Wave D18.5 / D19: [data-sash-handle] stays transparent at rest, nested scrollbars stagger without overlap, and REMOVE_EXPRESSION strips D18 attributes', () => {
  const vm = require('node:vm');
  const cdp = require(path.join(__dirname, '..', 'cdp.js'));
  const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');

  // 1) [data-sash-handle] 8px sidebar resize hitbox must stay transparent with zero shadow at rest, revealing .bg-border only on hover/active
  const sashIdx = css.indexOf('[data-sash-handle]{');
  assert.ok(sashIdx >= 0, 'style.css must define [data-sash-handle] rule');
  const sashLine = css.slice(sashIdx, css.indexOf('\n', sashIdx) > sashIdx ? css.indexOf('\n', sashIdx) : sashIdx + 520);
  assert.match(
    sashLine,
    /^\[data-sash-handle\]\{background:(?:transparent|0 0)\s*!important;box-shadow:none\s*!important;/,
    '[data-sash-handle] outer 8px hitbox must stay transparent with box-shadow:none so it never renders as a permanent thick line'
  );
  assert.match(sashLine, /\.bg-border\{[^}]*opacity:0\s*!important/, '[data-sash-handle] inner .bg-border must remain opacity:0 at rest');
  assert.match(sashLine, /:is\(:hover,:active\)\s*\.bg-border\{/, '[data-sash-handle] inner .bg-border must only illuminate on :hover/:active');

  // 2) Staggered nested collapsible scroll containers (margin-right offset + overscroll-behavior-y:auto without stripping host max-height)
  const tier1Rule = css.split('\n').find((l) => l.includes('[data-testid="autoscroll-viewport"] .bleed-contain.overflow-y-auto{')) || '';
  assert.ok(
    tier1Rule.includes('margin-right:10px !important') &&
      tier1Rule.includes('padding-right:8px !important') &&
      tier1Rule.includes('overscroll-behavior-y:auto !important'),
    'Tier-1 outer collapsible scroll container must indent margin-right:10px + padding-right:8px and chain overscroll-behavior-y:auto'
  );
  assert.equal(tier1Rule.includes('max-height:none'), false, 'Nested scroll rules must preserve host native max-height caps');

  const tier2Rule =
    css.split('\n').find((l) => l.includes('[data-testid="autoscroll-viewport"] .bleed-contain .overflow-y-auto{')) || '';
  assert.ok(
    tier2Rule.includes('margin-right:14px !important') &&
      tier2Rule.includes('padding-right:8px !important') &&
      tier2Rule.includes('overscroll-behavior-y:auto !important'),
    'Tier-2 inner step scroll container must stagger margin-right:14px + padding-right:8px and chain overscroll-behavior-y:auto'
  );
  assert.ok(
    inlineDiffMod.INLINE_DIFF_CSS.includes('[data-testid="autoscroll-viewport"] .bleed-contain .ag-cs-inline-diff-body{margin-right:14px !important;padding-right:8px !important;overscroll-behavior-y:auto !important;}'),
    'Channel 6 inline-diff-body must retain Tier-2 margin-right:14px + padding-right:8px + overscroll-behavior-y:auto'
  );

  const tier3Rule =
    css
      .split('\n')
      .find((l) => l.includes('[data-testid="autoscroll-viewport"] .bleed-contain .overflow-y-auto :is(.overflow-y-auto,pre){')) || '';
  assert.ok(
    tier3Rule.includes('margin-right:12px !important') && tier3Rule.includes('overscroll-behavior-y:auto !important'),
    'Tier-3 deeply nested scroll container must stagger margin-right:12px and chain overscroll-behavior-y:auto'
  );
  assert.ok(
    inlineDiffMod.INLINE_DIFF_CSS.includes('[data-testid="autoscroll-viewport"] .bleed-contain .overflow-y-auto .ag-cs-inline-diff-body{margin-right:12px !important;overscroll-behavior-y:auto !important;}'),
    'Channel 6 inline-diff-body must retain Tier-3 margin-right:12px + overscroll-behavior-y:auto'
  );

  // 3) Floating overlay sub-scrollbar narrow hitbox (9px) + resting filament (3.5px/.38) -> hover/active (4.5px/.95)
  const fixedScrollRule =
    css.split('\n').find((l) => l.includes('[data-testid="overlay-scrollbar"].fixed[data-orientation="vertical"]{')) || '';
  assert.ok(fixedScrollRule.includes('width:9px !important;'), 'Floating vertical sub-scrollbar hitbox must narrow from 12px to 9px');
  assert.ok(
    fixedScrollRule.includes(':not(:hover):not([data-hovered="true"]):not([data-dragging="true"]):not([data-expanded="true"]) [data-testid="overlay-scrollbar-thumb"]{width:3.5px !important;opacity:.38 !important;}'),
    'Floating sub-scrollbar thumb must shrink to 3.5px / 0.38 filament when pointer is not interacting with track'
  );
  assert.ok(
    fixedScrollRule.includes(':is(:hover,[data-hovered="true"],[data-dragging="true"],[data-expanded="true"]) [data-testid="overlay-scrollbar-thumb"]{width:4.5px !important;opacity:.95 !important;'),
    'Floating sub-scrollbar thumb must expand cleanly to 4.5px / 0.95 on hover/drag/expand'
  );
  assert.ok(
    css.includes('& pre{&::-webkit-scrollbar{width:4px;height:4px;}&::-webkit-scrollbar-thumb{background:transparent;}'),
    'Fallback webkit sub-scrollbars for pre must slim to 4px and stay transparent until hover'
  );
  assert.ok(
    inlineDiffMod.INLINE_DIFF_CSS.includes('& .ag-cs-inline-diff-body{&::-webkit-scrollbar{width:4px;height:4px;display:block;}'),
    'Channel 6 inline-diff-body fallback webkit sub-scrollbar must slim to 4px'
  );

  // 4) cdp.REMOVE_EXPRESSION fallback teardown parity for Wave D18 attributes
  const d18Attrs = [
    'data-ag-cs-prism-reflect',
    'data-ag-cs-settings-dlg',
    'data-ag-cs-settings-nav',
    'data-ag-cs-nav-active',
  ];
  for (const attr of d18Attrs) {
    assert.ok(cdp.REMOVE_EXPRESSION.includes(attr), `cdp.REMOVE_EXPRESSION must include ${attr}`);
  }

  const env = createMockEnv();
  const qCard = env.createElement('div', { 'data-testid': 'queued-messages-card', 'data-ag-cs-prism-reflect': 'bottom' });
  const dlg = env.createElement('div', { role: 'dialog', 'data-ag-cs-settings-dlg': '1' });
  const nav = env.createElement('nav', { 'data-ag-cs-settings-nav': '1' });
  const navBtn = env.createElement('button', { 'data-ag-cs-nav-active': '1' });
  nav.appendChild(navBtn);
  dlg.appendChild(nav);
  env.body.appendChild(qCard);
  env.body.appendChild(dlg);

  const mockDoc = { ...env.doc, getElementById: () => null };
  vm.runInNewContext(cdp.REMOVE_EXPRESSION, { window: env.win, document: mockDoc, CSS: undefined });

  for (const [el, attr] of [
    [qCard, 'data-ag-cs-prism-reflect'],
    [dlg, 'data-ag-cs-settings-dlg'],
    [nav, 'data-ag-cs-settings-nav'],
    [navBtn, 'data-ag-cs-nav-active'],
  ]) {
    assert.equal(el.hasAttribute(attr), false, `REMOVE_EXPRESSION execution must strip residual ${attr}`);
  }
});

// ── Test 13: Wave D20 Takeover Bottom-Reflect Mounting, Smoked Obsidian Artifact/Takeover Facets & Pulse Z-Index Unseal ──
test('Wave D20: ui-runtime mounts bottom prism-reflect on interaction-takeover-card dynamically, and style.css enforces smoked-obsidian artifacts, keycap proceed button, transparent takeover liner, and pulse z-index 36 > 12', async () => {
  const vm = require('node:vm');
  const cdp = require(path.join(__dirname, '..', 'cdp.js'));
  const uiRuntimeSrc = fs.readFileSync(path.join(__dirname, '..', 'ui-runtime.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');

  // 1) Static contract & live VM verification of ui-runtime.js bottom prism-reflect on [data-testid="interaction-takeover-card"]
  assert.ok(
    uiRuntimeSrc.includes('\'[data-testid="queued-messages-card"], [data-testid="interaction-takeover-card"]\''),
    'syncQueuedPrismBoxes must query both queued-messages-card and interaction-takeover-card'
  );

  const timers = new Set();
  const observers = [];
  const env = createMockEnv();
  const head = env.createElement('head');
  env.html.insertBefore(head, env.body);
  env.body.className = 'theme-dark';

  const convView = env.createElement('div', { 'data-testid': 'conversation-view' });
  const rtcWrap = env.createElement('div', { class: 'relative z-10 flex flex-col gap-1 min-h-0' });
  const contentsWrap = env.createElement('div', { class: 'contents' });
  const inputBox = env.createElement('div', { 'data-testid': 'agent-input-box' });
  const composerShell = env.createElement('div', { id: 'antigravity.agentSidePanelInputBox', class: 'surface-composer' });
  const composerCard = env.createElement('div', { class: 'surface-composer-card' });
  const composerFooter = env.createElement('div', { class: 'agy-composer-footer' });
  composerCard.appendChild(composerFooter);
  composerShell.appendChild(composerCard);
  inputBox.appendChild(composerShell);
  contentsWrap.appendChild(inputBox);
  rtcWrap.appendChild(contentsWrap);
  convView.appendChild(rtcWrap);

  const subConv = env.createElement('div', { 'data-testid': 'subagent-tab-conversation' });
  const subTakeover = env.createElement('div', { 'data-testid': 'interaction-takeover-card' });
  subConv.appendChild(subTakeover);
  env.body.appendChild(convView);
  env.body.appendChild(subConv);

  const doc = {
    ...env.doc,
    head,
    hidden: false,
    readyState: 'complete',
    getElementById(id) {
      const find = (n) => (n.id === id ? n : n.children.map(find).find(Boolean) || null);
      return find(env.html);
    },
    addEventListener: env.doc.addEventListener || (() => {}),
    removeEventListener: env.doc.removeEventListener || (() => {}),
  };

  let nextRafId = 1;
  const rafMap = new Map();
  const sandbox = {
    window: null,
    globalThis: null,
    document: doc,
    navigator: { language: 'zh-CN' },
    location: { pathname: '/' },
    localStorage: { _m: {}, getItem(k) { return this._m[k] || null; }, setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; } },
    getComputedStyle: (el) => env.win.getComputedStyle(el),
    matchMedia: () => ({ matches: false }),
    MutationObserver: class {
      constructor(cb) {
        this.cb = cb;
        this.opts = null;
        observers.push(this);
      }
      observe(_target, opts) { this.opts = opts; }
      disconnect() {}
      takeRecords() { return []; }
    },
    ResizeObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame: (fn) => { const id = nextRafId++; rafMap.set(id, fn); return id; },
    cancelAnimationFrame: (id) => { rafMap.delete(id); },
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
    const batch = Array.from(rafMap.entries());
    for (const [id, fn] of batch) {
      if (!rafMap.has(id)) continue;
      rafMap.delete(id);
      fn(Date.now());
    }
  };

  try {
    const res = vm.runInNewContext(cdp.buildInjectExpression(cdp.DEFAULT_CONFIG), sandbox);
    assert.equal(res.status, 'ok');
    assert.equal(subTakeover.hasAttribute('data-ag-cs-prism-reflect'), false, 'Subagent tab takeover card must remain excluded');

    const mainMo = observers.find((o) => Array.isArray(o.opts?.attributeFilter) && o.opts.attributeFilter.includes('data-cascade-id'));
    assert.ok(mainMo, 'ui-runtime main MutationObserver must be active');

    // Simulate dynamic Q&A / permission takeover card popup via wrapper insertion -> MO must trigger dirtyFlags.c immediately
    const takeoverWrap = env.createElement('div', { class: 'relative z-[1] mb-1 flex flex-col min-h-0' });
    const takeoverCard = env.createElement('div', { class: 'agy-takeover-frame', 'data-testid': 'interaction-takeover-card' });
    takeoverWrap.appendChild(takeoverCard);
    rtcWrap.insertBefore(takeoverWrap, contentsWrap);
    mainMo.cb([{ type: 'childList', target: rtcWrap, addedNodes: [takeoverWrap], removedNodes: [] }]);
    flushRaf();

    assert.equal(takeoverCard.getAttribute('data-ag-cs-prism-box'), '1', 'Takeover card popup must mount data-ag-cs-prism-box="1"');
    assert.equal(takeoverCard.getAttribute('data-ag-cs-prism-reflect'), 'bottom', 'Takeover card popup must mount data-ag-cs-prism-reflect="bottom"');
    assert.equal(subTakeover.hasAttribute('data-ag-cs-prism-box'), false, 'Subagent takeover card must still be excluded');

    // Switching to chat mode (data-ag-prism-mode="chat") symmetrically strips prism-box/reflect and cleans --ag-px/--ag-py
    takeoverCard.style.setProperty('--ag-px', '128px');
    takeoverCard.style.setProperty('--ag-py', '16px');
    env.html.setAttribute('data-ag-prism-mode', 'chat');
    mainMo.cb([{ type: 'attributes', target: env.html, attributeName: 'data-ag-prism-mode' }]);
    flushRaf();
    assert.equal(takeoverCard.hasAttribute('data-ag-cs-prism-box'), false, 'Chat mode must strip data-ag-cs-prism-box');
    assert.equal(takeoverCard.hasAttribute('data-ag-cs-prism-reflect'), false, 'Chat mode must strip data-ag-cs-prism-reflect');
    assert.equal(takeoverCard.style.getPropertyValue('--ag-px'), '', 'Chat mode teardown must clear --ag-px');
    assert.equal(takeoverCard.style.getPropertyValue('--ag-py'), '', 'Chat mode teardown must clear --ag-py');

    // Returning to code mode restores bottom prism reflection; disabling composerRestyle cleans it up again
    env.html.setAttribute('data-ag-prism-mode', 'code');
    mainMo.cb([{ type: 'attributes', target: env.html, attributeName: 'data-ag-prism-mode' }]);
    flushRaf();
    assert.equal(takeoverCard.getAttribute('data-ag-cs-prism-reflect'), 'bottom', 'Code mode must restore data-ag-cs-prism-reflect="bottom"');

    takeoverCard.style.setProperty('--ag-px', '64px');
    takeoverCard.style.setProperty('--ag-py', '8px');
    sandbox.window.__agPrism.refreshConfig({ ...cdp.DEFAULT_CONFIG, composerRestyle: false });
    assert.equal(takeoverCard.hasAttribute('data-ag-cs-prism-box'), false, 'composerRestyle:false must strip data-ag-cs-prism-box');
    assert.equal(takeoverCard.hasAttribute('data-ag-cs-prism-reflect'), false, 'composerRestyle:false must strip data-ag-cs-prism-reflect');
    assert.equal(takeoverCard.style.getPropertyValue('--ag-px'), '');
    assert.equal(takeoverCard.style.getPropertyValue('--ag-py'), '');
  } finally {
    try { sandbox.window.__agPrism?.destroy?.(); } catch {}
    for (const id of timers) clearTimeout(id);
  }

  // 2) style.css Artifact card smoked-obsidian facet, unboxed header first-child, and inset gradient divider on div.mt-1
  const artifactFacetLine =
    css.split('\n').find((l) => l.includes(':is([data-testid="artifact-card"],[data-testid="bubble-artifact-card"],.artifact-card')) || '';
  assert.ok(
    artifactFacetLine.includes('background-color:var(--_k0) !important') &&
      artifactFacetLine.includes('border:1px solid var(--_kb) !important') &&
      artifactFacetLine.includes('box-shadow:var(--_ks2) !important'),
    'Artifact cards must adopt smoked-obsidian facet tokens (--_k0 / --_kb / --_ks2)'
  );
  const artifactHdrFirstLine =
    css.split('\n').find((l) => l.includes('[data-testid="artifact-card-header"]>:first-child')) || '';
  assert.ok(
    artifactHdrFirstLine.includes(':first-child :is(a,button,span,div)') &&
      artifactHdrFirstLine.includes('background:transparent !important') &&
      artifactHdrFirstLine.includes('border-color:transparent !important') &&
      artifactHdrFirstLine.includes('padding-inline:0 !important'),
    'Artifact card header first-child must strip nested grey pill chrome cleanly'
  );
  const artifactFooterDividerLine =
    css.split('\n').find((l) => l.includes('[data-testid="artifact-card"]>div.mt-1{')) || '';
  assert.ok(
    artifactFooterDividerLine.includes('&::before{') &&
      artifactFooterDividerLine.includes('linear-gradient(90deg,transparent,var(--_kd) 12%,var(--_kd) 88%,transparent)'),
    'Artifact card action footer div.mt-1 must render an inset fade hairline divider'
  );

  // 3) .proceed-button raised graphite keycap (--_k2, zero plastic primary-16% tint) & ghost secondary buttons
  const proceedLine = css.split('\n').find((l) => l.startsWith('& .proceed-button{')) || '';
  assert.ok(
    proceedLine.includes('background-color:var(--_k2) !important') && proceedLine.includes('border-radius:8px !important'),
    '.proceed-button must use raised graphite keycap token var(--_k2)'
  );
  assert.equal(
    proceedLine.includes('color-mix(in srgb,var(--primary) 16%'),
    false,
    '.proceed-button must purge legacy plastic primary-16% tinted fill'
  );
  const ghostArtifactBtnLine =
    css.split('\n').find((l) => l.includes(':is([data-testid="artifact-card"],[data-testid="bubble-artifact-card"]) button:not(.proceed-button){')) || '';
  assert.ok(
    ghostArtifactBtnLine.includes('background:transparent !important') &&
      ghostArtifactBtnLine.includes('border-color:transparent !important') &&
      ghostArtifactBtnLine.includes('box-shadow:none !important'),
    'Secondary Open / split buttons inside artifact cards must be borderless ghost buttons'
  );

  // 4) [data-testid="interaction-takeover-card"] smoked-obsidian shell, transparent .agy-takeover-card liner (no inner option tampering), and bottom rim selector
  const takeoverShellLine =
    css.split('\n').find((l) => l.includes(':is([data-testid="queued-messages-card"],[data-testid="interaction-takeover-card"],.agy-takeover-frame){')) || '';
  assert.ok(
    takeoverShellLine.includes('background-color:var(--_k0) !important') &&
      takeoverShellLine.includes('border:1px solid var(--_kb) !important') &&
      takeoverShellLine.includes('animation:ag-cs-queued-in'),
    'interaction-takeover-card outer shell must align with queued-messages-card smoked-obsidian facet'
  );
  const takeoverLinerLine = css.split('\n').find((l) => l.startsWith('& .agy-takeover-card{')) || '';
  assert.ok(
    takeoverLinerLine.includes('background:transparent !important') &&
      takeoverLinerLine.includes('border:0 !important') &&
      takeoverLinerLine.includes('box-shadow:none !important'),
    '.agy-takeover-card inner liner must be transparent and borderless'
  );
  assert.equal(
    takeoverLinerLine.includes('ask-question-option') || css.includes('.agy-takeover-card [data-testid="ask-question-option"]'),
    false,
    '.agy-takeover-card rule must NOT tamper with inner ask-question-option styling'
  );
  assert.ok(
    css.includes('& [data-ag-cs-prism-reflect="bottom"]>.ag-cs-prism-rim-cv{') ||
      css.includes(',& [data-ag-cs-prism-reflect="bottom"]>.ag-cs-prism-rim-cv{'),
    'style.css must define shared [data-ag-cs-prism-reflect="bottom"]>.ag-cs-prism-rim-cv rule'
  );
  assert.ok(
    css.includes('[data-ag-cs-composer="off"] [data-ag-cs-prism-reflect="bottom"]>.ag-cs-prism-rim-cv'),
    'style.css must hide bottom-reflect prism canvas when composer restyle is off'
  );

  // 5) Stacking context unseal (.surface-composer-card z-index:auto) & #ag-prism-pulse-bar z-index (36) > interaction-takeover-card (12)
  assert.ok(
    css.includes('& .surface-composer-card{z-index:auto !important;}'),
    '.surface-composer-card must set z-index:auto !important to unseal Tailwind z-[1] stacking context'
  );
  const pulseZMatch = css.match(/:is\(#ag-prism-pulse-bar,\[data-ag-prism-pulse-bar\],#ag-pulse-status-bar\):not\(\[data-layout="blocked"\]\)\{z-index:(\d+)\s*!important;\}/);
  const takeoverZMatch = css.match(/\[data-testid="interaction-takeover-card"[^\n{]*\{[^}]*z-index:(\d+)\s*!important;/);
  assert.ok(pulseZMatch && takeoverZMatch, 'Both #ag-prism-pulse-bar and interaction-takeover-card z-index rules must exist');
  const pulseZ = Number(pulseZMatch[1]);
  const takeoverZ = Number(takeoverZMatch[1]);
  assert.equal(pulseZ, 36, '#ag-prism-pulse-bar must sit at z-index: 36');
  assert.equal(takeoverZ, 12, 'interaction-takeover-card must sit at z-index: 12');
  assert.ok(pulseZ > takeoverZ, '#ag-prism-pulse-bar must layer strictly above interaction-takeover-card so context preview is never occluded');
});

test('Navigator outline mounts dedicated trigger, yields to Base UI turn tooltips without overlap, keeps legacy turn compat, and cleans up', async () => {
  const cdp = require(path.join(__dirname, '..', 'cdp.js'));
  const env = createMockEnv();
  const conv = env.createElement('div', { 'data-testid': 'conversation-view' });
  const vp = env.createElement('div', { 'data-testid': 'autoscroll-viewport' });
  vp._rect = { left: 0, top: 0, width: 600, height: 600, right: 600, bottom: 600 };
  const turn1 = env.createElement('div', { 'data-testid': 'user-input-step' });
  turn1._rect = { left: 0, top: 40, width: 600, height: 40, right: 600, bottom: 80 };
  turn1.textContent = 'First turn prompt';
  const turn2 = env.createElement('div', { 'data-testid': 'user-input-step' });
  turn2._rect = { left: 0, top: 200, width: 600, height: 40, right: 600, bottom: 240 };
  turn2.textContent = 'Second turn prompt';
  vp.appendChild(turn1);
  vp.appendChild(turn2);

  const rail = env.createElement('div', { 'data-testid': 'conversation-navigator' });
  const gapWrap = env.createElement('div', { class: 'flex shrink-0 items-center' });
  const baseUiDot = env.createElement('button', {
    'data-testid': 'conversation-navigator-turn',
    'data-base-ui-tooltip-trigger': '',
    'aria-label': 'Turn 1 of 2',
  });
  const groupBtn = env.createElement('button', {
    'data-testid': 'conversation-navigator-group',
    'aria-label': 'Chapter 1',
  });
  gapWrap.appendChild(baseUiDot);
  rail.appendChild(gapWrap);
  rail.appendChild(groupBtn);
  conv.appendChild(rail);
  conv.appendChild(vp);
  env.body.appendChild(conv);

  let curLang = 'zh-CN';
  const ctl = enhancerMod.createHostEnhancerController({ doc: env.doc, win: env.win, getLang: () => curLang });
  try {
    ctl.sync();
    const trig = rail.querySelector('.ag-cs-nav-outline-trigger');
    assert.ok(trig, 'nav rail must mount dedicated .ag-cs-nav-outline-trigger button');
    assert.equal(trig.getAttribute('data-ag-owned'), '1');
    // #193 [P2-3]: localized aria-label on mount & live language switch
    assert.equal(trig.getAttribute('aria-label'), '提问导航', 'trigger aria-label must follow getStrings() on mount');
    curLang = 'en';
    ctl.sync();
    assert.equal(trig.getAttribute('aria-label'), 'Outline', 'trigger aria-label must update when language switches to en');
    curLang = 'ja';
    ctl.onThemeChange(false);
    assert.equal(trig.getAttribute('aria-label'), 'プロンプト目次', 'trigger aria-label must update on onThemeChange language switch');

    // On Base UI rails, hovering turn dot, gap wrapper, OR rail padding must NEVER flash/open outline
    rail.dispatchEvent({ type: 'pointerenter', target: rail });
    rail.dispatchEvent({ type: 'pointerover', target: gapWrap });
    rail.dispatchEvent({ type: 'pointerover', target: baseUiDot });
    assert.equal(env.doc.querySelector('.ag-cs-nav-outline-popover'), null, 'Base UI rail padding/gap/dot hover must never spawn outline');

    // Entering trigger button opens outline cleanly
    trig.dispatchEvent({ type: 'pointerenter', target: trig });
    const pop = env.doc.querySelector('.ag-cs-nav-outline-popover');
    assert.ok(pop && !pop.hidden && pop.getAttribute('data-open') === '1', 'Trigger hover must open outline');

    // #193 [P0-1]: Diagonal travel across Base UI rail blank/gap schedules grace hide (NOT 0ms close),
    // and entering popover cancels the hide timer cleanly!
    rail.dispatchEvent({ type: 'pointerover', target: gapWrap });
    assert.equal(pop.hidden, false, 'Diagonal travel over Base UI rail blank/gap must keep outline open during grace delay');
    pop.dispatchEvent({ type: 'pointerenter', target: pop });
    await new Promise((r) => setTimeout(r, 260));
    assert.equal(pop.hidden, false, 'Entering popover within grace delay must cancel scheduled hide');

    // Leaving trigger onto rail blank WITHOUT entering popover closes after grace delay
    rail.dispatchEvent({ type: 'pointerover', target: rail });
    assert.equal(pop.hidden, false, 'Hovering rail blank must not close at 0ms');
    await new Promise((r) => setTimeout(r, 260));
    assert.equal(pop.hidden, true, 'Hovering rail blank without entering popover must close after grace delay');

    // Moving directly onto a Base UI turn dot closes immediately (0ms) for native tooltip
    trig.dispatchEvent({ type: 'pointerenter', target: trig });
    assert.equal(pop.hidden, false);
    rail.dispatchEvent({ type: 'pointerover', target: baseUiDot });
    assert.equal(pop.hidden, true, 'Moving directly onto a Base UI turn dot must close outline immediately (0ms)');

    // Moving directly onto a navigator group also closes immediately (0ms)
    trig.dispatchEvent({ type: 'pointerenter', target: trig });
    assert.equal(pop.hidden, false);
    rail.dispatchEvent({ type: 'pointerover', target: groupBtn });
    assert.equal(pop.hidden, true, 'Moving directly onto a navigator group must close outline immediately (0ms)');

    // Trigger click toggles closed -> open -> closed
    trig.dispatchEvent({ type: 'click', target: trig });
    assert.equal(pop.hidden, false, 'Trigger click must reopen closed outline');
    trig.dispatchEvent({ type: 'click', target: trig });
    assert.equal(pop.hidden, true, 'Trigger click must toggle open outline closed');

    // Base UI toggled into data-trigger-disabled + data-turn-index state (e.g. during blur/scroll) must STILL suppress rail hover!
    baseUiDot.removeAttribute('data-base-ui-tooltip-trigger');
    baseUiDot.setAttribute('data-trigger-disabled', '');
    baseUiDot.setAttribute('data-turn-index', '0');
    rail.dispatchEvent({ type: 'pointerenter', target: rail });
    rail.dispatchEvent({ type: 'pointerover', target: baseUiDot });
    assert.equal(pop.hidden, true, 'Base UI rail in data-trigger-disabled/data-turn-index state must still suppress rail hover');

    // Legacy rail (without Base UI tooltip / turn-index attrs) keeps backwards-compatible hover open
    baseUiDot.removeAttribute('data-trigger-disabled');
    baseUiDot.removeAttribute('data-turn-index');
    rail.dispatchEvent({ type: 'pointerenter', target: baseUiDot });
    assert.equal(pop.hidden, false, 'Legacy rail without Base UI tooltips keeps hover open');

    assert.ok(cdp.REMOVE_EXPRESSION.includes('.ag-cs-nav-outline-trigger'), 'REMOVE_EXPRESSION must clean up .ag-cs-nav-outline-trigger');
  } finally {
    ctl.destroy();
    assert.equal(rail.querySelector('.ag-cs-nav-outline-trigger'), null, 'destroy() must remove .ag-cs-nav-outline-trigger');
  }
});

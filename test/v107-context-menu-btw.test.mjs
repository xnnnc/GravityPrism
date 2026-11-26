import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, '..');
const ctxMenuMod = require(path.join(ROOT, 'context-menu-btw.js'));

const NO_TR_ATTRS = [
  ['translate', 'no'],
  ['data-no-translate', 'true'],
  ['data-ag-localization-skip', 'true'],
  ['data-agy-no-translate', 'true'],
  ['data-antigravity-zh-skip', '1'],
  ['data-ag-no-i18n', '1'],
];

function assertNoTranslateAttrs(el, label) {
  assert.ok(el, `${label} must exist`);
  for (const [k, v] of NO_TR_ATTRS) {
    assert.equal(el.getAttribute(k), v, `${label} must have ${k}="${v}"`);
  }
}

// ── Lightweight Deterministic DOM Harness ───────────────────────────────────
function matchesSingle(el, rawSel) {
  if (!el || el.nodeType !== 1) return false;
  const sel = rawSel.trim();
  if (!sel) return false;
  if (sel.includes(' ')) {
    const parts = sel.split(/\s+/).filter(Boolean);
    if (!matchesSingle(el, parts[parts.length - 1])) return false;
    let cur = el.parentElement;
    for (let i = parts.length - 2; i >= 0; i--) {
      while (cur && !matchesSingle(cur, parts[i])) cur = cur.parentElement;
      if (!cur) return false;
      cur = cur.parentElement;
    }
    return true;
  }
  let rem = sel;
  const tagM = rem.match(/^[a-zA-Z0-9-]+/);
  if (tagM) {
    if (el.tagName.toLowerCase() !== tagM[0].toLowerCase()) return false;
    rem = rem.slice(tagM[0].length);
  }
  const idM = rem.match(/#([a-zA-Z0-9_\\.-]+)/);
  if (idM) {
    if (el.id !== idM[1].replace(/\\/g, '')) return false;
    rem = rem.replace(idM[0], '');
  }
  for (const cm of rem.matchAll(/\.([a-zA-Z0-9_-]+)/g)) {
    if (!el.classList.contains(cm[1])) return false;
  }
  rem = rem.replace(/\.[a-zA-Z0-9_-]+/g, '');
  for (const am of rem.matchAll(/\[([a-zA-Z0-9_-]+)(?:="([^"]*)")?\]/g)) {
    if (!el.hasAttribute(am[1])) return false;
    if (am[2] !== undefined && el.getAttribute(am[1]) !== am[2]) return false;
  }
  return true;
}

function matchesAny(el, selList) {
  for (const part of String(selList || '').split(',')) {
    if (part.trim() && matchesSingle(el, part.trim())) return true;
  }
  return false;
}

function createMockEnv(opts = {}) {
  const docListeners = new Map();
  const winListeners = new Map();
  const execCalls = [];
  const pendingTimers = new Map();
  const pendingRafs = new Map();
  let timerSeq = 1;
  let rafSeq = 1;
  let activeFocus = null;
  let selectionState = { text: '', isCollapsed: true, anchorNode: null };
  let execCommandHandler = opts.execCommand || null;

  const trackAdd = (map, type, fn, cap = false) => {
    const key = `${type}:${cap ? 1 : 0}`;
    if (!map.has(key)) map.set(key, []);
    const arr = map.get(key);
    if (!arr.includes(fn)) arr.push(fn);
  };
  const trackDel = (map, type, fn, cap = false) => {
    const key = `${type}:${cap ? 1 : 0}`;
    const arr = map.get(key);
    if (!arr) return;
    const idx = arr.indexOf(fn);
    if (idx >= 0) arr.splice(idx, 1);
  };
  const countListeners = (map) => {
    let n = 0;
    for (const arr of map.values()) n += arr.length;
    return n;
  };
  const fireMap = (map, type, ev) => {
    for (const cap of [1, 0]) {
      const list = [...(map.get(`${type}:${cap}`) || [])];
      for (const fn of list) fn(ev);
    }
  };

  function makeEl(tag, init = {}) {
    const attrs = new Map();
    const classes = new Set();
    const elListeners = new Map();
    const children = [];
    let _text = init.text || '';
    const el = {
      nodeType: 1,
      tagName: String(tag || 'div').toUpperCase(),
      parentElement: null,
      parentNode: null,
      children,
      childNodes: children,
      isConnected: false,
      disabled: Boolean(init.disabled),
      value: init.value || '',
      isContentEditable: Boolean(init.isContentEditable),
      offsetWidth: init.width || 0,
      offsetHeight: init.height || 0,
      _rect: init.rect || { left: 0, top: 0, width: init.width || 0, height: init.height || 0 },
      _dispatched: [],
      style: {
        cssText: '',
        setProperty(k, v) { this[k] = String(v); },
        removeProperty(k) { delete this[k]; },
      },
      classList: {
        contains: (c) => classes.has(c),
        add: (...cs) => { cs.forEach((c) => c && classes.add(c)); attrs.set('class', [...classes].join(' ')); },
        remove: (...cs) => { cs.forEach((c) => classes.delete(c)); attrs.set('class', [...classes].join(' ')); },
      },
      get id() { return attrs.get('id') || ''; },
      set id(v) { if (v) attrs.set('id', String(v)); else attrs.delete('id'); },
      get className() { return [...classes].join(' '); },
      set className(v) {
        classes.clear();
        String(v || '').split(/\s+/).filter(Boolean).forEach((c) => classes.add(c));
        if (classes.size) attrs.set('class', [...classes].join(' '));
        else attrs.delete('class');
      },
      get firstElementChild() { return children[0] || null; },
      get textContent() {
        if (children.length && !_text) return children.map((c) => c.textContent).join('');
        return _text;
      },
      set textContent(v) {
        children.length = 0;
        _text = String(v ?? '');
      },
      setAttribute(k, v) {
        const sv = String(v);
        attrs.set(k, sv);
        if (k === 'class') this.className = sv;
        if (k === 'contenteditable' && sv === 'true') this.isContentEditable = true;
      },
      getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
      hasAttribute(k) { return attrs.has(k); },
      removeAttribute(k) { attrs.delete(k); },
      appendChild(ch) {
        if (ch.parentElement) ch.parentElement.removeChild(ch);
        ch.parentElement = el;
        ch.parentNode = el;
        children.push(ch);
        const markConn = (n, val) => { n.isConnected = val; for (const c of n.children || []) markConn(c, val); };
        if (el.isConnected) markConn(ch, true);
        return ch;
      },
      removeChild(ch) {
        const idx = children.indexOf(ch);
        if (idx >= 0) children.splice(idx, 1);
        ch.parentElement = null;
        ch.parentNode = null;
        const markConn = (n) => { n.isConnected = false; for (const c of n.children || []) markConn(c); };
        markConn(ch);
        return ch;
      },
      remove() {
        if (el.parentElement) el.parentElement.removeChild(el);
        else el.isConnected = false;
      },
      contains(target) {
        let cur = target;
        while (cur) {
          if (cur === el) return true;
          cur = cur.parentElement;
        }
        return false;
      },
      closest(sel) {
        let cur = el;
        while (cur) {
          if (matchesAny(cur, sel)) return cur;
          cur = cur.parentElement;
        }
        return null;
      },
      querySelectorAll(sel) {
        const out = [];
        const walk = (n) => {
          for (const c of n.children) {
            if (matchesAny(c, sel)) out.push(c);
            walk(c);
          }
        };
        walk(el);
        return out;
      },
      querySelector(sel) { return el.querySelectorAll(sel)[0] || null; },
      addEventListener(type, fn) {
        if (!elListeners.has(type)) elListeners.set(type, []);
        elListeners.get(type).push(fn);
      },
      removeEventListener(type, fn) {
        const arr = elListeners.get(type);
        if (!arr) return;
        const idx = arr.indexOf(fn);
        if (idx >= 0) arr.splice(idx, 1);
      },
      dispatchEvent(ev) {
        el._dispatched.push(ev);
        const list = [...(elListeners.get(ev.type) || [])];
        for (const fn of list) fn(ev);
        return true;
      },
      click() {
        const ev = { type: 'click', target: el, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; } };
        el.dispatchEvent(ev);
      },
      focus() { activeFocus = el; el._focused = (el._focused || 0) + 1; },
      select() { el._selected = true; },
      getBoundingClientRect() { return { ...el._rect }; },
    };
    if (init.id) el.id = init.id;
    if (init.className) el.className = init.className;
    if (init.attrs) for (const [k, v] of Object.entries(init.attrs)) el.setAttribute(k, v);
    return el;
  }

  const documentElement = makeEl('html', { attrs: { 'data-ag-cs-lang': opts.docLang || 'zh-CN', 'data-ag-cs-motion': opts.motionLevel || 'ultra' } });
  documentElement.isConnected = true;
  documentElement.clientWidth = opts.innerWidth || 1280;
  documentElement.clientHeight = opts.innerHeight || 800;

  const body = makeEl('body');
  documentElement.appendChild(body);

  const rootEl = makeEl('div', { id: 'root' });
  body.appendChild(rootEl);

  const convView = makeEl('div', { attrs: { 'data-testid': 'conversation-view' } });
  const msgPara = makeEl('p', { text: 'Hello from assistant message' });
  convView.appendChild(msgPara);
  rootEl.appendChild(convView);

  const doc = {
    documentElement,
    body,
    createElement: (tag) => makeEl(tag),
    createElementNS: (_ns, tag) => makeEl(tag),
    getElementById: (id) => documentElement.querySelector(`#${id}`),
    querySelector: (sel) => documentElement.querySelector(sel),
    querySelectorAll: (sel) => documentElement.querySelectorAll(sel),
    addEventListener: (t, fn, cap) => trackAdd(docListeners, t, fn, Boolean(cap)),
    removeEventListener: (t, fn, cap) => trackDel(docListeners, t, fn, Boolean(cap)),
    dispatchDocEvent: (type, ev) => fireMap(docListeners, type, ev),
    getSelection: () => ({
      isCollapsed: selectionState.isCollapsed,
      anchorNode: selectionState.anchorNode,
      toString: () => selectionState.text,
      removeAllRanges() { selectionState.rangesCleared = true; },
      addRange(r) { selectionState.lastRange = r; },
    }),
    createRange: () => ({
      selectNodeContents(n) { this.target = n; },
      collapse(toStart) { this.collapsed = true; this.toStart = toStart; },
    }),
    execCommand(cmd, ui, val) {
      execCalls.push({ cmd, ui, val });
      if (execCommandHandler) return execCommandHandler(cmd, val, activeFocus);
      return false;
    },
  };

  const clipboardWrites = [];
  let clipboardFail = false;
  const nav = {
    language: opts.navLang || 'zh-CN',
    clipboard: {
      async writeText(text) {
        if (clipboardFail) throw new Error('clipboard denied');
        clipboardWrites.push(text);
      },
    },
  };

  const loc = { pathname: opts.pathname !== undefined ? opts.pathname : '/c/cascade-alpha-001' };

  const win = {
    innerWidth: opts.innerWidth || 1280,
    innerHeight: opts.innerHeight || 800,
    navigator: nav,
    location: loc,
    getSelection: doc.getSelection,
    addEventListener: (t, fn, cap) => trackAdd(winListeners, t, fn, Boolean(cap)),
    removeEventListener: (t, fn, cap) => trackDel(winListeners, t, fn, Boolean(cap)),
    dispatchWinEvent: (type, ev = {}) => fireMap(winListeners, type, ev),
    setTimeout: (fn, ms) => {
      const id = timerSeq++;
      const handle = setTimeout(() => {
        pendingTimers.delete(id);
        fn();
      }, ms);
      pendingTimers.set(id, { handle, fn, ms });
      return id;
    },
    clearTimeout: (id) => {
      const rec = pendingTimers.get(id);
      if (rec) {
        clearTimeout(rec.handle);
        pendingTimers.delete(id);
      }
    },
    requestAnimationFrame: (fn) => {
      const id = rafSeq++;
      pendingRafs.set(id, fn);
      return id;
    },
    cancelAnimationFrame: (id) => {
      pendingRafs.delete(id);
    },
  };

  function flushRafs() {
    const entries = [...pendingRafs.entries()];
    pendingRafs.clear();
    for (const [, fn] of entries) fn();
  }

  function makeContextMenuEvent(target, extra = {}) {
    const ev = {
      type: 'contextmenu',
      target,
      clientX: extra.clientX ?? 200,
      clientY: extra.clientY ?? 180,
      shiftKey: Boolean(extra.shiftKey),
      defaultPrevented: false,
      stopped: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.stopped = true; },
    };
    doc.dispatchDocEvent('contextmenu', ev);
    return ev;
  }

  return {
    doc,
    win,
    nav,
    loc,
    body,
    rootEl,
    convView,
    msgPara,
    makeEl,
    execCalls,
    clipboardWrites,
    pendingTimers,
    pendingRafs,
    flushRafs,
    makeContextMenuEvent,
    setSelection(text, anchorNode = msgPara) {
      selectionState = { text: String(text || ''), isCollapsed: !text, anchorNode };
    },
    setClipboardFail(v) { clipboardFail = Boolean(v); },
    setExecCommandHandler(fn) { execCommandHandler = fn; },
    getActiveFocus: () => activeFocus,
    getDocListenerCount: () => countListeners(docListeners),
    getWinListenerCount: () => countListeners(winListeners),
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

test('1. UMD / browser singleton export & hot-reload cleanup contract', () => {
  assert.equal(typeof ctxMenuMod.createContextMenuController, 'function');
  for (const m of ['sync', 'destroy', 'isOpen', 'getState', 'openAt', 'close', 'triggerBtw', 'triggerSlashCommand']) {
    assert.equal(typeof ctxMenuMod[m], 'function', `module export must expose ${m}()`);
  }

  const env = createMockEnv();
  const src = fs.readFileSync(path.join(ROOT, 'context-menu-btw.js'), 'utf8');
  const sb = {
    window: env.win,
    document: env.doc,
    navigator: env.nav,
    location: env.loc,
    setTimeout: env.win.setTimeout,
    clearTimeout: env.win.clearTimeout,
    requestAnimationFrame: env.win.requestAnimationFrame,
    cancelAnimationFrame: env.win.cancelAnimationFrame,
    Math, Number, String, Boolean, Array, Object, Set, WeakSet, RegExp, Promise,
  };
  sb.globalThis = sb;
  vm.runInNewContext(src, sb);
  assert.ok(sb.__agPrismContextMenu);
  assert.equal(env.win.__agPrismContextMenu, sb.__agPrismContextMenu);
  assert.equal(env.getDocListenerCount(), 1, 'initial singleton mounts exactly 1 contextmenu listener');

  const firstApi = sb.__agPrismContextMenu;
  // Hot reload: running script again destroys previous singleton cleanly without duplicating listeners
  vm.runInNewContext(src, sb);
  assert.equal(firstApi.getState().destroyed, true, 'old singleton must be destroyed on hot-reload');
  assert.equal(env.getDocListenerCount(), 1, 'hot-reload must not duplicate contextmenu listeners');
  sb.__agPrismContextMenu.destroy();
  assert.equal(env.getDocListenerCount(), 0);
});

test('2. Native Redux /btw dispatches exact 4 actions with quote (and 3 without), preserves main draft, and focuses side panel', () => {
  const env = createMockEnv({ pathname: '/c/conv-xyz-999' });
  const dispatched = [];
  const fakeStore = {
    dispatch(action) { dispatched.push(action); },
    getState() { return {}; },
  };
  // Attach Fiber on conversation-view pointing upward via .return to Redux Provider
  const providerFiber = { memoizedProps: { value: { store: fakeStore } }, return: null };
  const leafFiber = { memoizedProps: {}, return: providerFiber };
  env.convView.__reactFiber$test123 = leafFiber;

  // Main composer with existing draft (MUST remain untouched!)
  const composerBox = env.makeEl('div', { attrs: { 'data-testid': 'agent-input-box' } });
  const mainEd = env.makeEl('div', { attrs: { contenteditable: 'true' }, text: 'My precious unsent draft' });
  composerBox.appendChild(mainEd);
  env.rootEl.appendChild(composerBox);

  // Side panel input for async rAF focus verification
  const sideScope = env.makeEl('div', { attrs: { 'data-side-panel-focus-scope': 'true' } });
  const sideEd = env.makeEl('div', { attrs: { contenteditable: 'true' } });
  sideScope.appendChild(sideEd);
  env.rootEl.appendChild(sideScope);

  const ctl = ctxMenuMod.createContextMenuController({ doc: env.doc, win: env.win, nav: env.nav, loc: env.loc, stepDelayMs: 0 });
  const resWithSel = ctl.triggerBtw('  Why does OAuth refresh loop here?  ');
  assert.deepEqual(resWithSel, { ok: true, mode: 'redux', cascadeId: 'conv-xyz-999', quoted: true });
  assert.equal(dispatched.length, 4);

  const expectedScope = { kind: 'cascadeId', cascadeId: 'conv-xyz-999' };
  const expectedContent = { type: 'sideQuestionView', sideQuestionView: {} };
  assert.deepEqual(dispatched[0], { type: 'sidePanelV2/setContent', payload: { panelScope: expectedScope, content: expectedContent, tabId: 'side_question__draft' } });
  assert.deepEqual(dispatched[1], { type: 'sidePanel/setContent', payload: { panelScope: expectedScope, content: expectedContent, tabId: 'side_question__draft' } });
  assert.deepEqual(dispatched[2], { type: 'sidePanel/setSidePanelOpen', payload: { panelScope: expectedScope, isOpen: true } });
  assert.deepEqual(dispatched[3], { type: 'sideQuestion/enqueueDraftSideQuestionQuote', payload: { parentCascadeId: 'conv-xyz-999', text: 'Why does OAuth refresh loop here?' } });
  assert.equal(mainEd.textContent, 'My precious unsent draft', 'Redux /btw must NEVER touch main composer draft');

  env.flushRafs();
  assert.equal(env.getActiveFocus(), sideEd, 'side panel input should receive focus on rAF');

  // Without selection: only 3 actions dispatched (no quote action)
  dispatched.length = 0;
  const resPlain = ctl.triggerBtw('');
  assert.deepEqual(resPlain, { ok: true, mode: 'redux', cascadeId: 'conv-xyz-999', quoted: false });
  assert.equal(dispatched.length, 3);
  assert.equal(dispatched.some((a) => a.type === 'sideQuestion/enqueueDraftSideQuestionQuote'), false);
  ctl.destroy();
});

test('3. Redux discovery via #root __reactContainer$ downward BFS, sidebar cascadeId fallback, and home no-conversation guard', () => {
  const env = createMockEnv({ pathname: '/' });
  const dispatched = [];
  const fakeStore = { dispatch: (a) => dispatched.push(a), getState: () => ({}) };
  // React 18 __reactContainer$ downward tree
  const deepProvider = { memoizedProps: { value: { store: fakeStore } }, child: null, sibling: null };
  const appFiber = { memoizedProps: {}, child: deepProvider, sibling: null };
  env.rootEl.__reactContainer$r18 = { stateNode: { current: { child: appFiber } } };

  const ctl = ctxMenuMod.createContextMenuController({ doc: env.doc, win: env.win, nav: env.nav, loc: env.loc, stepDelayMs: 0 });

  // Home page with no selected sidebar row -> friendly toast + safe fail
  const homeRes = ctl.triggerBtw('');
  assert.equal(homeRes.ok, false);
  assert.equal(homeRes.reason, 'no-cascade-id');
  const toast = env.doc.querySelector('.ag-cs-ctx-toast');
  assertNoTranslateAttrs(toast, 'no-conversation toast');
  assert.ok(toast.textContent.includes('会话'));

  // Add selected sidebar row with data-cascade-id fallback
  const row = env.makeEl('div', { attrs: { 'data-testid': 'conversation-row-sidebar', 'data-selected': 'true', 'data-cascade-id': 'sidebar-cid-77' } });
  env.rootEl.appendChild(row);
  const res = ctl.triggerBtw('check sidebar cid');
  assert.equal(res.ok, true);
  assert.equal(res.cascadeId, 'sidebar-cid-77');
  assert.equal(dispatched.length, 4);
  ctl.destroy();
});

test('4. /btw graceful fallback chain when Redux store is absent (native button -> empty composer -> draft guard)', () => {
  const env = createMockEnv();
  const composerBox = env.makeEl('div', { attrs: { 'data-testid': 'agent-input-box' } });
  const mainEd = env.makeEl('div', { attrs: { contenteditable: 'true' }, text: '' });
  composerBox.appendChild(mainEd);
  env.rootEl.appendChild(composerBox);

  let nativeClicks = 0;
  const nativeBtwBtn = env.makeEl('button', { attrs: { 'data-testid': 'selection-btw-button' } });
  nativeBtwBtn.addEventListener('click', () => { nativeClicks++; });
  env.rootEl.appendChild(nativeBtwBtn);

  const ctl = ctxMenuMod.createContextMenuController({ doc: env.doc, win: env.win, nav: env.nav, loc: env.loc, stepDelayMs: 0 });

  // Fallback 1: selection + native selection-btw-button
  const r1 = ctl.triggerBtw('selected snippet');
  assert.deepEqual(r1, { ok: true, mode: 'native-button', quoted: true });
  assert.equal(nativeClicks, 1);
  assert.equal(mainEd.textContent, '');

  // Fallback 2: remove native button -> writes /btw <selection> into EMPTY composer
  nativeBtwBtn.remove();
  const r2 = ctl.triggerBtw('fallback quote');
  assert.deepEqual(r2, { ok: true, mode: 'fallback-composer', quoted: true });
  assert.equal(mainEd.textContent, '/btw fallback quote');

  // Fallback 2 draft protection: composer is now non-empty -> refuse overwrite & show toast
  const r3 = ctl.triggerBtw('new selection');
  assert.equal(r3.ok, false);
  assert.equal(r3.reason, 'draft-not-empty');
  assert.equal(mainEd.textContent, '/btw fallback quote', 'existing draft must never be overwritten');
  assert.ok(env.doc.querySelector('.ag-cs-ctx-toast'));
  ctl.destroy();
});

test('5. Direct-submit slash commands: curated whitelist, slash menu option click, quote append, send button & Enter fallback, draft guard', async () => {
  const env = createMockEnv();
  const composerBox = env.makeEl('div', { attrs: { 'data-testid': 'agent-input-box' } });
  const mainEd = env.makeEl('div', { attrs: { contenteditable: 'true' }, text: '' });
  const sendBtn = env.makeEl('button', { attrs: { 'data-testid': 'input-send-button' } });
  let sendClicks = 0;
  sendBtn.addEventListener('click', () => { sendClicks++; });
  composerBox.appendChild(mainEd);
  composerBox.appendChild(sendBtn);
  env.rootEl.appendChild(composerBox);

  // Slash command listbox with /compact and /plan + distractor /planner
  const listbox = env.makeEl('div', { attrs: { role: 'listbox' } });
  const optCompact = env.makeEl('div', { attrs: { role: 'option' }, text: '/compact Compress context' });
  const optPlanner = env.makeEl('div', { attrs: { role: 'option' }, text: '/planner Legacy' });
  const optPlan = env.makeEl('div', { attrs: { role: 'option' }, text: '/plan Enter planning mode' });
  const clickedOpts = [];
  optCompact.addEventListener('click', () => { clickedOpts.push('/compact'); mainEd.textContent = '[CHIP:/compact]'; });
  optPlanner.addEventListener('click', () => { clickedOpts.push('/planner'); });
  optPlan.addEventListener('click', () => { clickedOpts.push('/plan'); mainEd.textContent = '[CHIP:/plan]'; });
  listbox.appendChild(optCompact);
  listbox.appendChild(optPlanner);
  listbox.appendChild(optPlan);
  env.rootEl.appendChild(listbox);

  const ctl = ctxMenuMod.createContextMenuController({ doc: env.doc, win: env.win, nav: env.nav, loc: env.loc, stepDelayMs: 0 });

  // Disallowed commands must be rejected
  for (const banned of ['/schedule', '/goal', '/teamwork', '/browser', '/boost']) {
    const res = await ctl.triggerSlashCommand(banned, 'x');
    assert.equal(res.ok, false, `${banned} must be rejected`);
    assert.equal(res.reason, 'unsupported-command');
  }

  // (a) /compact direct submit via listbox option + send button
  const cRes = await ctl.triggerSlashCommand('/compact', 'ignored quote');
  assert.deepEqual(cRes, { ok: true, command: '/compact', pickedFromMenu: true, hasQuote: false, submitMethod: 'click-send-button' });
  assert.deepEqual(clickedOpts, ['/compact']);
  assert.equal(sendClicks, 1);

  // (b) Draft protection when composer is non-empty
  mainEd.textContent = 'Existing user draft';
  const dRes = await ctl.triggerSlashCommand('/learn', 'some insight');
  assert.equal(dRes.ok, false);
  assert.equal(dRes.reason, 'draft-not-empty');
  assert.equal(mainEd.textContent, 'Existing user draft');
  assertNoTranslateAttrs(env.doc.querySelector('.ag-cs-ctx-toast'), 'draft protection toast');

  // (c) /plan with selection -> picks exact /plan (not /planner), appends newline + quote, submits via send button
  mainEd.textContent = '';
  const pRes = await ctl.triggerSlashCommand('/plan', 'Refactor auth middleware');
  assert.deepEqual(pRes, { ok: true, command: '/plan', pickedFromMenu: true, hasQuote: true, submitMethod: 'click-send-button' });
  assert.deepEqual(clickedOpts, ['/compact', '/plan']);
  assert.equal(mainEd.textContent, '[CHIP:/plan]\nRefactor auth middleware');
  assert.equal(sendClicks, 2);

  // (d) Enter key fallback when send button is disabled & slash menu absent
  listbox.remove();
  sendBtn.disabled = true;
  mainEd.textContent = '';
  mainEd._dispatched.length = 0;
  const gRes = await ctl.triggerSlashCommand('/grill-me', 'API schema choice');
  assert.deepEqual(gRes, { ok: true, command: '/grill-me', pickedFromMenu: false, hasQuote: true, submitMethod: 'enter-key' });
  assert.equal(mainEd.textContent, '/grill-me\nAPI schema choice');
  const enterEv = mainEd._dispatched.find((e) => e.type === 'keydown' && e.key === 'Enter');
  assert.ok(enterEv, 'must dispatch Enter keydown when send button is disabled/missing');
  ctl.destroy();
});

test('6. Contextmenu interception scope, Shift+Right-click escape hatch, disabled state, and full exclusion passthrough', () => {
  const env = createMockEnv();
  const ctl = ctxMenuMod.createContextMenuController({ doc: env.doc, win: env.win, nav: env.nav, loc: env.loc, stepDelayMs: 0 });

  // Normal right-click inside conversation-view -> intercepted
  const okEv = env.makeContextMenuEvent(env.msgPara, { clientX: 220, clientY: 160 });
  assert.equal(okEv.defaultPrevented, true);
  assert.equal(ctl.isOpen(), true);
  ctl.close();

  // Shift + Right-click inside conversation-view -> 100% passthrough
  const shiftEv = env.makeContextMenuEvent(env.msgPara, { shiftKey: true });
  assert.equal(shiftEv.defaultPrevented, false, 'Shift+Right-click must pass through to native menu');
  assert.equal(ctl.isOpen(), false);

  // Disabled module -> 100% passthrough
  ctl.sync({ enabled: false });
  const disEv = env.makeContextMenuEvent(env.msgPara);
  assert.equal(disEv.defaultPrevented, false, 'disabled module must pass through');
  assert.equal(ctl.isOpen(), false);
  ctl.sync({ enabled: true });

  // Outside conversation-view -> passthrough
  const outsideNode = env.makeEl('div', { text: 'header' });
  env.rootEl.appendChild(outsideNode);
  assert.equal(env.makeContextMenuEvent(outsideNode).defaultPrevented, false);

  // All excluded regions nested inside or alongside conversation-view -> 100% passthrough
  const excludedSamples = [
    env.makeEl('div', { attrs: { 'data-testid': 'agent-input-box' } }),
    env.makeEl('div', { attrs: { contenteditable: 'true' } }),
    env.makeEl('input'),
    env.makeEl('textarea'),
    env.makeEl('select'),
    env.makeEl('div', { attrs: { role: 'textbox' } }),
    env.makeEl('div', { className: 'monaco-editor' }),
    env.makeEl('div', { className: 'cm-editor' }),
    env.makeEl('aside'),
    env.makeEl('div', { attrs: { 'data-testid': 'conversation-row-sidebar' } }),
    env.makeEl('div', { attrs: { 'data-side-panel-focus-scope': 'true' } }),
    env.makeEl('div', { attrs: { 'data-testid': 'side-question-panel' } }),
    env.makeEl('div', { attrs: { role: 'dialog' } }),
    env.makeEl('div', { attrs: { role: 'menu' } }),
    env.makeEl('div', { className: 'ag-omni-menu' }),
    env.makeEl('section', { id: 'ag-prism-settings-sec' }),
    env.makeEl('div', { className: 'ces-set' }),
    env.makeEl('div', { attrs: { 'data-ag-zh-widget': '1' } }),
    env.makeEl('a', { attrs: { href: 'https://example.com/docs' } }),
    env.makeEl('button', { text: 'Copy code' }),
    env.makeEl('div', { attrs: { role: 'button' }, text: 'Toggle fold' }),
  ];
  for (const container of excludedSamples) {
    const inner = env.makeEl('span', { text: 'child' });
    container.appendChild(inner);
    env.convView.appendChild(container);
    const ev = env.makeContextMenuEvent(inner);
    assert.equal(ev.defaultPrevented, false, `excluded target <${container.tagName} id="${container.id}" class="${container.className}"> must passthrough`);
    assert.equal(ctl.isOpen(), false);
  }
  ctl.destroy();
});

test('7. Dual-mode curated menu (plain vs selection), no banned commands, SVG icons, no-translate attrs, and clipboard copy fallback', async () => {
  const env = createMockEnv();
  const ctl = ctxMenuMod.createContextMenuController({ doc: env.doc, win: env.win, nav: env.nav, loc: env.loc, stepDelayMs: 0 });

  // Plain mode (no selection)
  const plainEl = ctl.openAt(120, 120, { selectedText: '' });
  assertNoTranslateAttrs(plainEl, 'plain context menu');
  assert.equal(plainEl.getAttribute('role'), 'menu');
  assert.equal(plainEl.getAttribute('data-ag-cs-ctx-mode'), 'plain');
  assert.deepEqual(ctl.getState().actions, ['btw', 'compact', 'learn', 'grill-me']);
  assert.equal(plainEl.querySelector('[data-ctx-quote="1"]'), null);
  assert.equal(plainEl.querySelector('[data-ctx-action="btw"]').classList.contains('is-primary'), true);
  assert.equal(plainEl.querySelectorAll('svg').length, 4);

  // Selection mode
  const longSel = 'A'.repeat(70);
  const selEl = ctl.openAt(150, 150, { selectedText: longSel });
  assertNoTranslateAttrs(selEl, 'selection context menu');
  assert.equal(selEl.getAttribute('data-ag-cs-ctx-mode'), 'selection');
  assert.deepEqual(ctl.getState().actions, ['copy', 'btw', 'plan', 'compact', 'learn', 'grill-me']);
  const quoteEl = selEl.querySelector('[data-ctx-quote="1"]');
  assert.ok(quoteEl && quoteEl.textContent.includes('…'), 'long selection preview must truncate cleanly');
  const menuText = selEl.textContent;
  for (const banned of ['/schedule', '/goal', '/teamwork', '/browser', '/boost']) {
    assert.equal(menuText.includes(banned), false, `menu must never expose ${banned}`);
  }
  const badges = selEl.querySelectorAll('kbd').map((k) => k.textContent);
  assert.deepEqual(badges, ['/btw', '/plan', '/compact', '/learn', '/grill-me']);

  // Copy via Clipboard API
  selEl.querySelector('[data-ctx-action="copy"]').click();
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(env.clipboardWrites, [longSel]);
  assert.equal(ctl.isOpen(), false);
  assertNoTranslateAttrs(env.doc.querySelector('.ag-cs-ctx-toast'), 'copy toast');

  // Copy fallback via execCommand('copy') when navigator.clipboard rejects
  env.setClipboardFail(true);
  env.setExecCommandHandler((cmd) => cmd === 'copy');
  const selEl2 = ctl.openAt(150, 150, { selectedText: 'Fallback copy text' });
  selEl2.querySelector('[data-ctx-action="copy"]').click();
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(env.execCalls.some((c) => c.cmd === 'copy'), 'must fallback to execCommand("copy")');
  assert.equal(env.doc.querySelector('textarea'), null, 'temporary textarea must be cleaned up');
  ctl.destroy();
});

test('8. 8-language live sync (zh-CN, zh-TW, en, ja, ko, es, fr, de) + yue->zh-CN migration including live refresh while open', () => {
  const env = createMockEnv();
  const ctl = ctxMenuMod.createContextMenuController({ doc: env.doc, win: env.win, nav: env.nav, loc: env.loc, stepDelayMs: 0 });

  const expectations = [
    ['zh-CN', 'zh-CN', '复制', '打开侧边会话'],
    ['zh-TW', 'zh-TW', '複製', '開啟側邊會話'],
    ['zh-HK', 'zh-TW', '複製', '開啟側邊會話'],
    ['yue', 'zh-CN', '复制', '打开侧边会话'],
    ['en', 'en', 'Copy', 'Open side chat'],
    ['ja', 'ja', 'コピー', 'サイド会話を開く'],
    ['ko', 'ko', '복사', '사이드 채팅 열기'],
    ['es', 'es', 'Copiar', 'Abrir chat lateral'],
    ['fr', 'fr', 'Copier', 'Ouvrir le chat latéral'],
    ['de', 'de', 'Kopieren', 'Seitenchat öffnen'],
  ];

  ctl.openAt(100, 100, { selectedText: 'hello' });
  for (const [lang, expectedAttr, copyWord] of expectations) {
    ctl.sync({ lang });
    const m = env.doc.querySelector('.ag-cs-ctx-menu');
    assert.equal(m.getAttribute('data-ag-cs-ctx-lang'), expectedAttr);
    assert.equal(m.querySelector('[data-ctx-action="copy"] span').textContent, copyWord);
  }
  ctl.close();

  for (const [lang, , , btwPlainWord] of expectations) {
    ctl.sync({ lang });
    const m = ctl.openAt(100, 100, { selectedText: '' });
    assert.equal(m.querySelector('[data-ctx-action="btw"] span').textContent, btwPlainWord);
  }
  ctl.destroy();
});

test('9. Viewport edge overflow clamping, keyboard navigation, and auto-dismiss triggers', () => {
  const env = createMockEnv({ innerWidth: 1000, innerHeight: 600 });
  const dispatched = [];
  env.convView.__reactFiber$k = { memoizedProps: { value: { store: { dispatch: (a) => dispatched.push(a), getState: () => ({}) } } } };

  const ctl = ctxMenuMod.createContextMenuController({ doc: env.doc, win: env.win, nav: env.nav, loc: env.loc, stepDelayMs: 0 });

  // Bottom-right corner clamps cleanly within [8, vw - w - 8] x [8, vh - h - 8]
  const m1 = ctl.openAt(995, 595, { selectedText: 'edge test' });
  const p1 = ctl.getState().position;
  assert.equal(p1.flipX, true);
  assert.equal(p1.flipY, true);
  assert.ok(p1.left >= 8 && p1.left + p1.width <= 1000 - 8, `left out of viewport: ${JSON.stringify(p1)}`);
  assert.ok(p1.top >= 8 && p1.top + p1.height <= 600 - 8, `top out of viewport: ${JSON.stringify(p1)}`);
  assert.equal(m1.style.transformOrigin, '100% 100%');

  // Negative coords clamp to >= 8
  ctl.openAt(-40, -25, { selectedText: '' });
  const p2 = ctl.getState().position;
  assert.equal(p2.left, 8);
  assert.equal(p2.top, 8);

  // Keyboard navigation: ArrowDown -> Home/End -> ArrowUp -> Enter triggers active item
  const sendKey = (key) => {
    const ev = { type: 'keydown', key, preventDefault() { this.p = true; }, stopPropagation() { this.s = true; } };
    env.doc.dispatchDocEvent('keydown', ev);
    return ev;
  };
  sendKey('ArrowDown');
  assert.equal(ctl.getState().activeIndex, 0); // btw
  sendKey('End');
  assert.equal(ctl.getState().activeIndex, 3); // grill-me
  sendKey('Home');
  assert.equal(ctl.getState().activeIndex, 0); // btw
  sendKey('Enter');
  assert.equal(ctl.isOpen(), false, 'Enter must close menu and trigger action');
  assert.equal(dispatched.length, 3, 'Enter on /btw must dispatch 3 Redux actions');

  // Auto-dismiss triggers: Escape, outside mousedown, window blur, resize, scroll
  ctl.openAt(100, 100, { selectedText: '' });
  sendKey('Escape');
  assert.equal(ctl.isOpen(), false, 'Escape dismisses menu');

  ctl.openAt(100, 100, { selectedText: '' });
  env.doc.dispatchDocEvent('mousedown', { type: 'mousedown', target: env.msgPara });
  assert.equal(ctl.isOpen(), false, 'outside mousedown dismisses menu');

  ctl.openAt(100, 100, { selectedText: '' });
  env.win.dispatchWinEvent('blur');
  assert.equal(ctl.isOpen(), false, 'window blur dismisses menu');

  ctl.openAt(100, 100, { selectedText: '' });
  env.win.dispatchWinEvent('resize');
  assert.equal(ctl.isOpen(), false, 'window resize dismisses menu');

  ctl.openAt(100, 100, { selectedText: '' });
  env.doc.dispatchDocEvent('scroll', { type: 'scroll', target: env.convView });
  assert.equal(ctl.isOpen(), false, 'document scroll dismisses menu');

  ctl.destroy();
});

test('10. destroy() guarantees zero listener/timer/rAF/DOM leaks and style.css hygiene (0 :has(), 0 non-ASCII, balanced braces)', () => {
  const env = createMockEnv();
  env.convView.__reactFiber$z = { memoizedProps: { value: { store: { dispatch() {}, getState: () => ({}) } } } };
  const ctl = ctxMenuMod.createContextMenuController({ doc: env.doc, win: env.win, nav: env.nav, loc: env.loc, stepDelayMs: 50, toastDurationMs: 5000 });

  ctl.openAt(100, 100, { selectedText: 'leak check' });
  ctl.triggerBtw('schedule raf');
  assert.ok(env.getDocListenerCount() > 1);
  assert.ok(env.getWinListenerCount() > 0);
  assert.ok(env.pendingRafs.size > 0);

  ctl.destroy();
  assert.equal(ctl.getState().destroyed, true);
  assert.equal(ctl.isOpen(), false);
  assert.equal(env.getDocListenerCount(), 0, 'all document listeners must be removed on destroy()');
  assert.equal(env.getWinListenerCount(), 0, 'all window listeners must be removed on destroy()');
  assert.equal(env.pendingTimers.size, 0, 'all timers must be cleared on destroy()');
  assert.equal(env.pendingRafs.size, 0, 'all rAFs must be cancelled on destroy()');
  assert.equal(env.doc.querySelectorAll('.ag-cs-ctx-menu,.ag-cs-ctx-toast').length, 0);

  // Post-destroy right-click is ignored
  const afterEv = env.makeContextMenuEvent(env.msgPara);
  assert.equal(afterEv.defaultPrevented, false);
  assert.equal(ctl.openAt(50, 50), null);

  // style.css hygiene checks
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  assert.equal((css.match(/:has\(/g) || []).length, 0, 'style.css must have 0 :has() selectors');
  assert.equal(/[^\x00-\x7F]/.test(css), false, 'style.css must have 0 non-ASCII characters');
  let depth = 0;
  for (const ch of css) {
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      assert.ok(depth >= 0, 'style.css closing brace overflow');
    }
  }
  assert.equal(depth, 0, 'style.css braces must be perfectly balanced');
  assert.ok(css.includes('.ag-cs-ctx-menu'), 'style.css must style .ag-cs-ctx-menu');
  assert.ok(css.includes('.ag-cs-ctx-toast'), 'style.css must style .ag-cs-ctx-toast');
  assert.ok(css.includes('[data-ag-cs-motion="off"]') && css.includes('.ag-cs-ctx-menu'), 'style.css must disable context menu motion in motion=off');
});

test('11. Composer fallback locators (#antigravity.agentSidePanelInputBox, textarea), side-panel exclusion, and editable selection ignore', async () => {
  const env = createMockEnv();
  // Put a side-question-panel contenteditable FIRST in DOM to prove it is never mistaken for main composer
  const sidePanel = env.makeEl('div', { attrs: { 'data-testid': 'side-question-panel' } });
  const sideEd = env.makeEl('div', { attrs: { contenteditable: 'true' } });
  sidePanel.appendChild(sideEd);
  env.rootEl.appendChild(sidePanel);

  // Fallback main composer: #antigravity.agentSidePanelInputBox
  const legacyBox = env.makeEl('div', { id: 'antigravity.agentSidePanelInputBox' });
  const legacyEd = env.makeEl('div', { attrs: { contenteditable: 'true' }, text: '' });
  legacyBox.appendChild(legacyEd);
  env.rootEl.appendChild(legacyBox);

  const ctl = ctxMenuMod.createContextMenuController({ doc: env.doc, win: env.win, nav: env.nav, loc: env.loc, stepDelayMs: 0 });

  // Selection anchored inside editable composer must NOT leak into conversation context menu
  env.setSelection('composer draft selection', legacyEd);
  const m = ctl.openAt(120, 120);
  assert.equal(m.getAttribute('data-ag-cs-ctx-mode'), 'plain', 'editable selection must be ignored');
  ctl.close();

  // Direct slash command hits #antigravity.agentSidePanelInputBox and does not touch sidePanel input
  const r1 = await ctl.triggerSlashCommand('/learn', 'key finding');
  assert.equal(r1.ok, true);
  assert.equal(r1.submitMethod, 'enter-key');
  assert.equal(legacyEd.textContent, '/learn\nkey finding');
  assert.equal(sideEd.textContent, '');

  // Textarea composer fallback when contenteditable is removed
  legacyBox.remove();
  const taBox = env.makeEl('div', { attrs: { 'data-testid': 'agent-input-box' } });
  const ta = env.makeEl('textarea', { value: '' });
  taBox.appendChild(ta);
  env.rootEl.appendChild(taBox);

  const r2 = await ctl.triggerSlashCommand('/compact');
  assert.equal(r2.ok, true);
  assert.equal(ta.value, '/compact');
  assert.ok(ta._dispatched.some((e) => e.type === 'input' && e.inputType === 'insertText'));
  assert.ok(ta._dispatched.some((e) => e.type === 'keydown' && e.key === 'Enter'));
  ctl.destroy();
});

test('12. Red-team robustness: Phase-1 upward .return store lookup beats deep 6500-node subtree, multi-round delayed slash menu polling, rawPos lang switch, and cdp REMOVE_EXPRESSION integration', async () => {
  // (a) Phase-1 upward .return must find Provider immediately even with a huge 6500-node child subtree
  const env = createMockEnv({ innerWidth: 1000, innerHeight: 600, pathname: '/c/deep-conv-42' });
  const dispatched = [];
  const store = { dispatch: (a) => dispatched.push(a), getState: () => ({}) };
  let tail = { memoizedProps: {}, child: null, sibling: null };
  for (let i = 0; i < 6500; i++) tail = { memoizedProps: {}, child: tail, sibling: null };
  const providerFiber = { memoizedProps: { value: { store } }, return: null };
  env.convView.__reactFiber$deep = { memoizedProps: {}, return: { memoizedProps: {}, return: providerFiber }, child: tail, sibling: null };

  const ctl = ctxMenuMod.createContextMenuController({ doc: env.doc, win: env.win, nav: env.nav, loc: env.loc, stepDelayMs: 0 });
  const btwRes = ctl.triggerBtw('deep subtree quote');
  assert.deepEqual(btwRes, { ok: true, mode: 'redux', cascadeId: 'deep-conv-42', quoted: true });
  assert.equal(dispatched.length, 4);

  // (b) Delayed slash command listbox mounting on the 2nd polling round still gets clicked & submitted
  const composerBox = env.makeEl('div', { attrs: { 'data-testid': 'agent-input-box' } });
  const mainEd = env.makeEl('div', { attrs: { contenteditable: 'true' }, text: '' });
  const sendBtn = env.makeEl('button', { attrs: { 'data-testid': 'send-button' } });
  let sendCount = 0;
  sendBtn.addEventListener('click', () => { sendCount++; });
  composerBox.appendChild(mainEd);
  composerBox.appendChild(sendBtn);
  env.rootEl.appendChild(composerBox);

  let slashPolls = 0;
  let optionClicked = 0;
  const origQsa = env.doc.querySelectorAll;
  env.doc.querySelectorAll = (sel) => {
    if (String(sel).includes('role="option"')) {
      slashPolls++;
      if (slashPolls >= 2) {
        const opt = env.makeEl('div', { attrs: { role: 'option' }, text: '/learn Capture learnings' });
        opt.addEventListener('click', () => { optionClicked++; mainEd.textContent = '[CHIP:/learn]'; });
        return [opt];
      }
      return [];
    }
    return origQsa(sel);
  };
  const slashRes = await ctl.triggerSlashCommand('/learn', 'delayed mount check');
  assert.deepEqual(slashRes, { ok: true, command: '/learn', pickedFromMenu: true, hasQuote: true, submitMethod: 'click-send-button' });
  assert.equal(slashPolls, 2, 'polling must stop immediately on round 2 once option is matched');
  assert.equal(optionClicked, 1);
  assert.equal(sendCount, 1);
  assert.equal(mainEd.textContent, '[CHIP:/learn]\ndelayed mount check');
  env.doc.querySelectorAll = origQsa;

  // (c) Switching lang while flipped near right edge must anchor to rawPos without double-flipping left
  ctl.openAt(990, 590, { selectedText: 'flip check' });
  const beforePos = ctl.getState().position;
  assert.equal(beforePos.flipX, true);
  ctl.sync({ lang: 'en' });
  const afterPos = ctl.getState().position;
  assert.equal(afterPos.left, beforePos.left, 'lang switch while open must reuse rawPos without double left-shift');
  assert.equal(afterPos.top, beforePos.top);
  ctl.destroy();

  // (d) Lightweight integration check: cdp.buildInjectExpression({ contextMenu: false }) & REMOVE_EXPRESSION
  const cdp = require(path.join(ROOT, 'cdp.js'));
  const exprOff = cdp.buildInjectExpression({ contextMenu: false });
  assert.doesNotThrow(() => new vm.Script(exprOff));
  assert.ok(exprOff.includes('"contextMenu":false'), 'buildInjectExpression({ contextMenu: false }) must serialize contextMenu:false');
  assert.ok(exprOff.includes('__agPrismContextMenu'), 'Channel 1 bundle must include context-menu-btw.js');

  // Execute REMOVE_EXPRESSION in lightweight VM sandbox and verify __agPrismContextMenu + DOM nodes are cleaned up
  let destroyCalled = 0;
  const rmEnv = createMockEnv();
  const orphanMenu = rmEnv.makeEl('div', { className: 'ag-cs-ctx-menu' });
  const orphanToast = rmEnv.makeEl('div', { className: 'ag-cs-ctx-toast' });
  rmEnv.body.appendChild(orphanMenu);
  rmEnv.body.appendChild(orphanToast);
  const rmSb = {
    window: rmEnv.win,
    document: rmEnv.doc,
    localStorage: { removeItem() {} },
    Object, Array, Set, Map, String, Number, Boolean,
  };
  rmSb.globalThis = rmSb;
  rmEnv.win.__agPrismContextMenu = rmSb.__agPrismContextMenu = { destroy() { destroyCalled++; } };
  vm.runInNewContext(cdp.REMOVE_EXPRESSION, rmSb);
  assert.equal(destroyCalled, 1, 'REMOVE_EXPRESSION must invoke __agPrismContextMenu.destroy()');
  assert.equal(rmEnv.win.__agPrismContextMenu, undefined);
  assert.equal(rmSb.__agPrismContextMenu, undefined);
  assert.equal(rmEnv.doc.querySelectorAll('.ag-cs-ctx-menu,.ag-cs-ctx-toast').length, 0, 'REMOVE_EXPRESSION must strip .ag-cs-ctx-menu & .ag-cs-ctx-toast');
});

test('13. P0 triggerSlashCommand concurrency mutex (busy) and mid-flight cascadeId / composer detach abort (zero accidental send)', async () => {
  const env = createMockEnv({ pathname: '/c/session-alpha' });
  const composerBox = env.makeEl('div', { attrs: { 'data-testid': 'agent-input-box' } });
  const mainEd = env.makeEl('div', { attrs: { contenteditable: 'true' }, text: '' });
  const sendBtn = env.makeEl('button', { attrs: { 'data-testid': 'input-send-button' } });
  let sendClicks = 0;
  sendBtn.addEventListener('click', () => { sendClicks++; });
  composerBox.appendChild(mainEd);
  composerBox.appendChild(sendBtn);
  env.rootEl.appendChild(composerBox);

  const ctl = ctxMenuMod.createContextMenuController({ doc: env.doc, win: env.win, nav: env.nav, loc: env.loc, stepDelayMs: 12 });

  // (a) Concurrent re-entry while in flight returns { ok: false, reason: 'busy' } without disturbing first command
  const p1 = ctl.triggerSlashCommand('/plan', 'first quote');
  const p2 = ctl.triggerSlashCommand('/compact');
  const r2 = await p2;
  assert.equal(r2.ok, false);
  assert.equal(r2.reason, 'busy');
  assert.equal(r2.command, '/compact');

  const r1 = await p1;
  assert.equal(r1.ok, true);
  assert.equal(r1.command, '/plan');
  assert.equal(sendClicks, 1);

  // (b) Mid-flight cascadeId switch aborts before submit (zero send click, zero Enter keydown) and releases mutex
  mainEd.textContent = '';
  mainEd._dispatched.length = 0;
  sendClicks = 0;
  const pSwitch = ctl.triggerSlashCommand('/plan', 'must not send to session-beta');
  setTimeout(() => { env.loc.pathname = '/c/session-beta'; }, 6);
  const rSwitch = await pSwitch;
  assert.equal(rSwitch.ok, false);
  assert.equal(rSwitch.reason, 'session-changed');
  assert.equal(rSwitch.command, '/plan');
  assert.equal(sendClicks, 0, 'must NEVER click send button after switching conversation mid-flight');
  assert.equal(
    mainEd._dispatched.some((e) => e.type === 'keydown' && e.key === 'Enter'),
    false,
    'must NEVER dispatch Enter after switching conversation mid-flight'
  );

  // (c) Mid-flight editor detach (ed.isConnected === false) also aborts cleanly and releases mutex
  mainEd.textContent = '';
  mainEd._dispatched.length = 0;
  sendClicks = 0;
  const pDetach = ctl.triggerSlashCommand('/learn', 'detach guard');
  setTimeout(() => { composerBox.remove(); }, 6);
  const rDetach = await pDetach;
  assert.equal(rDetach.ok, false);
  assert.equal(rDetach.reason, 'session-changed');
  assert.equal(sendClicks, 0, 'must NEVER submit after composer detaches');

  // Lock must be released in finally: subsequent call succeeds once composer is remounted & cleared
  env.rootEl.appendChild(composerBox);
  mainEd.textContent = '';
  const rAfter = await ctl.triggerSlashCommand('/compact');
  assert.equal(rAfter.ok, true);
  assert.equal(sendClicks, 1);

  ctl.destroy();
});

test('14. P0 Redux resilience: findStore throw, store.dispatch TypeError, and no-op action rename silently fallback to native-button / fallback-composer with zero uncaught errors', async () => {
  // (a) store.dispatch throws TypeError -> fallback to native-button first, then fallback-composer
  const env = createMockEnv({ pathname: '/c/conv-resilient-1' });
  const composerBox = env.makeEl('div', { attrs: { 'data-testid': 'agent-input-box' } });
  const mainEd = env.makeEl('div', { attrs: { contenteditable: 'true' }, text: '' });
  composerBox.appendChild(mainEd);
  env.rootEl.appendChild(composerBox);

  let nativeClicks = 0;
  const nativeBtn = env.makeEl('button', { attrs: { 'data-testid': 'selection-btw-button' } });
  nativeBtn.addEventListener('click', () => { nativeClicks++; });
  env.rootEl.appendChild(nativeBtn);

  let dispatchAttempts = 0;
  const throwingStore = {
    dispatch() { dispatchAttempts++; throw new TypeError('Redux store signature changed'); },
    getState() { return { v: 1 }; },
  };
  env.convView.__reactFiber$err = { memoizedProps: { value: { store: throwingStore } }, return: null };

  const ctl = ctxMenuMod.createContextMenuController({
    doc: env.doc,
    win: env.win,
    nav: env.nav,
    loc: env.loc,
    stepDelayMs: 0,
    copyText: async () => { throw new Error('copy rejected'); },
  });

  const r1 = ctl.triggerBtw('quote with throwing dispatch');
  assert.deepEqual(r1, { ok: true, mode: 'native-button', quoted: true });
  assert.equal(dispatchAttempts, 4, 'all 4 dispatches are isolated individually via safe()');
  assert.equal(nativeClicks, 1);
  assert.equal(mainEd.textContent, '');

  // Without native-button -> smooth fallback to empty composer
  nativeBtn.remove();
  const r2 = ctl.triggerBtw('composer fallback quote');
  assert.deepEqual(r2, { ok: true, mode: 'fallback-composer', quoted: true });
  assert.equal(mainEd.textContent, '/btw composer fallback quote');

  // (b) Action renamed in future host -> store.dispatch succeeds without throwing, but store.getState() returns identical ref and no side panel appears -> fallback
  const frozenState = { sidePanel: { open: false } };
  let noopDispatches = 0;
  const noopStore = {
    dispatch() { noopDispatches++; },
    getState() { return frozenState; },
  };
  env.convView.__reactFiber$err = { memoizedProps: { value: { store: noopStore } }, return: null };

  env.rootEl.appendChild(nativeBtn);
  const r3 = ctl.triggerBtw('renamed action native fallback');
  assert.deepEqual(r3, { ok: true, mode: 'native-button', quoted: true });
  assert.equal(noopDispatches, 4);
  assert.equal(nativeClicks, 2);

  nativeBtn.remove();
  mainEd.textContent = '';
  const r4 = ctl.triggerBtw('renamed action composer fallback');
  assert.deepEqual(r4, { ok: true, mode: 'fallback-composer', quoted: true });
  assert.equal(mainEd.textContent, '/btw renamed action composer fallback');

  // If side panel IS present in DOM, unchanged getState still recognizes redux success
  const sidePanel = env.makeEl('div', { attrs: { 'data-testid': 'side-question-panel' } });
  env.rootEl.appendChild(sidePanel);
  const r5 = ctl.triggerBtw('side panel visible');
  assert.deepEqual(r5, { ok: true, mode: 'redux', cascadeId: 'conv-resilient-1', quoted: true });
  sidePanel.remove();

  // (c) findStore() getter throws -> safe() catches and falls back to composer
  Object.defineProperty(env.convView, '__reactFiber$err', {
    configurable: true,
    enumerable: true,
    get() { throw new Error('Fiber proxy trap'); },
  });
  mainEd.textContent = '';
  const r6 = ctl.triggerBtw('fiber getter throw fallback');
  assert.deepEqual(r6, { ok: true, mode: 'fallback-composer', quoted: true });
  assert.equal(mainEd.textContent, '/btw fiber getter throw fallback');

  // (d) runAction swallows rejected Promise without UnhandledPromiseRejection
  let unhandled = 0;
  const onUnhandled = () => { unhandled++; };
  process.on('unhandledRejection', onUnhandled);
  try {
    const m = ctl.openAt(120, 120, { selectedText: 'trigger copy rejection' });
    m.querySelector('[data-ctx-action="copy"]').click();
    await new Promise((r) => setTimeout(r, 15));
    assert.equal(unhandled, 0, 'runAction must attach .catch(() => {}) to prevent unhandled rejections');
  } finally {
    process.off('unhandledRejection', onUnhandled);
    ctl.destroy();
  }
});

test('15. P1-4 regressions: pre-quote duplicate guard never false-blocks <p>/<br> collapsed /plan quotes & React controlled <textarea> uses native prototype value setter', async () => {
  // (a) Simulate contenteditable/Lexical turning '\n' into <p>/<br> so ed.textContent has NO newline separator
  const env = createMockEnv();
  const box = env.makeEl('div', { attrs: { 'data-testid': 'agent-input-box' } });
  const ed = env.makeEl('div', { attrs: { contenteditable: 'true' }, text: '' });
  const sendBtn = env.makeEl('button', { attrs: { 'data-testid': 'input-send-button' } });
  let sendClicks = 0;
  sendBtn.addEventListener('click', () => { sendClicks += 1; });
  box.appendChild(ed);
  box.appendChild(sendBtn);
  env.rootEl.appendChild(box);

  env.setExecCommandHandler((cmd, val) => {
    if (cmd !== 'insertText') return false;
    // Strip '\n' as W3C textContent does across <p>/<br> block boundaries
    ed.textContent = String(ed.textContent || '') + String(val).replace(/\n/g, '');
    return true;
  });

  const ctl = ctxMenuMod.createContextMenuController({ doc: env.doc, win: env.win, nav: env.nav, loc: env.loc, stepDelayMs: 0 });
  const validCollapsed = await ctl.triggerSlashCommand('/plan', '/plan refactor auth token flow');
  assert.equal(validCollapsed.ok, true, 'Valid quote starting with /plan must NOT be falsely blocked when <p>/<br> collapses newline in textContent');
  assert.equal(validCollapsed.pickedFromMenu, false);
  assert.equal(ed.textContent, '/plan/plan refactor auth token flow');
  assert.equal(sendClicks, 1);

  // Real double-write of the command itself is STILL intercepted BEFORE quote insertion
  ed.textContent = '';
  sendClicks = 0;
  let quoteInserted = false;
  env.setExecCommandHandler((cmd, val) => {
    if (cmd !== 'insertText') return false;
    if (val === '/learn') ed.textContent = '/learn/learn';
    else { quoteInserted = true; ed.textContent += val; }
    return true;
  });
  const dupBlocked = await ctl.triggerSlashCommand('/learn', 'valid quote should never be inserted');
  assert.equal(dupBlocked.ok, false);
  assert.equal(dupBlocked.reason, 'duplicate-command');
  assert.equal(quoteInserted, false, 'Pre-quote guard must abort before inserting quote');
  assert.equal(sendClicks, 0);

  // (b) React controlled <textarea>: prototype value setter must be invoked instead of instance wrapper
  box.remove();
  const taBox = env.makeEl('div', { attrs: { 'data-testid': 'agent-input-box' } });
  const ta = env.makeEl('textarea', { value: '' });
  let nativeBacking = '';
  let protoSetterCalls = 0;
  let instanceSetterCalls = 0;
  let reactTracker = '';
  let reactChangeEvents = 0;
  function FakeHTMLTextAreaElement() {}
  Object.defineProperty(FakeHTMLTextAreaElement.prototype, 'value', {
    configurable: true,
    get() { return nativeBacking; },
    set(v) { protoSetterCalls += 1; nativeBacking = String(v); },
  });
  env.win.HTMLTextAreaElement = FakeHTMLTextAreaElement;
  Object.setPrototypeOf(ta, FakeHTMLTextAreaElement.prototype);
  // React attaches an instance descriptor that advances _valueTracker when written directly
  Object.defineProperty(ta, 'value', {
    configurable: true,
    get() { return nativeBacking; },
    set(v) { instanceSetterCalls += 1; nativeBacking = String(v); reactTracker = nativeBacking; },
  });
  ta.addEventListener('input', () => {
    if (nativeBacking !== reactTracker) {
      reactChangeEvents += 1;
      reactTracker = nativeBacking;
    }
  });
  taBox.appendChild(ta);
  env.rootEl.appendChild(taBox);

  const taRes = await ctl.triggerSlashCommand('/plan', 'Controlled textarea quote');
  assert.equal(taRes.ok, true);
  assert.equal(nativeBacking, '/plan\nControlled textarea quote');
  assert.equal(protoSetterCalls, 2, 'insertText must write via HTMLTextAreaElement.prototype value setter (command + quote)');
  assert.equal(instanceSetterCalls, 0, 'insertText must bypass instance value setter so React _valueTracker sees dirty diff');
  assert.equal(reactChangeEvents, 2, 'React controlled onChange must fire on each input event');
  ctl.destroy();
});

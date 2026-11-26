import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = import.meta.dirname;
const ROOT_DIR = path.join(__dirname, '..');
const CLIENT_PATH = path.join(ROOT_DIR, 'vendor', 'omni-viewer', 'omni-client.js');

const omniMod = require(CLIENT_PATH);

// ── Deterministic Lightweight DOM + Highlight + MutationObserver Harness ────
function splitSelectorTopLevelCommas(selectorList) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < selectorList.length; i++) {
    const ch = selectorList[i];
    if (ch === '[' || ch === '(') depth++;
    else if (ch === ']' || ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function matchesSimpleToken(el, rawSel) {
  if (!el || el.nodeType !== 1) return false;
  const sel = rawSel.trim();
  if (!sel) return false;
  if (sel === '*') return true;

  if (/\s/.test(sel)) {
    const tokens = sel.replace(/\s*>\s*/g, ' > ').trim().split(/\s+/);
    let idx = tokens.length - 1;
    if (!matchesSimpleToken(el, tokens[idx])) return false;
    idx--;
    let cur = el.parentElement;
    while (idx >= 0) {
      if (tokens[idx] === '>') {
        idx--;
        if (!cur || !matchesSimpleToken(cur, tokens[idx])) return false;
        cur = cur.parentElement;
        idx--;
      } else {
        while (cur && !matchesSimpleToken(cur, tokens[idx])) {
          cur = cur.parentElement;
        }
        if (!cur) return false;
        cur = cur.parentElement;
        idx--;
      }
    }
    return true;
  }

  let rem = sel;
  const notStyleMatch = rem.match(/:not\(\[style\*="([^"]+)"\]\)/);
  if (notStyleMatch) {
    const curStyle = String(el.getAttribute('style') || '');
    if (curStyle.includes(notStyleMatch[1])) return false;
    rem = rem.replace(notStyleMatch[0], '');
  }

  const idMatch = rem.match(/#([A-Za-z0-9_\\.-]+)/);
  if (idMatch) {
    const wantId = idMatch[1].replace(/\\/g, '');
    if (el.id !== wantId) return false;
    rem = rem.replace(idMatch[0], '');
  }

  const tagMatch = rem.match(/^[A-Za-z0-9-]+/);
  if (tagMatch) {
    if (el.tagName.toLowerCase() !== tagMatch[0].toLowerCase()) return false;
    rem = rem.slice(tagMatch[0].length);
  }

  for (const cm of rem.matchAll(/\.([A-Za-z0-9_-]+)/g)) {
    if (!el.classList.contains(cm[1])) return false;
  }
  rem = rem.replace(/\.[A-Za-z0-9_-]+/g, '');

  for (const am of rem.matchAll(/\[([A-Za-z0-9_:-]+)(?:(\^=|\*=|=)"([^"]*)")?\]/g)) {
    const attrName = am[1];
    const op = am[2];
    const expected = am[3];
    if (!el.hasAttribute(attrName)) return false;
    if (op) {
      const actual = String(el.getAttribute(attrName) ?? '');
      if (op === '=' && actual !== expected) return false;
      if (op === '^=' && !actual.startsWith(expected)) return false;
      if (op === '*=' && !actual.includes(expected)) return false;
    }
  }
  return true;
}

function matchesSelectorList(el, selectorList) {
  for (const part of splitSelectorTopLevelCommas(String(selectorList || ''))) {
    if (matchesSimpleToken(el, part)) return true;
  }
  return false;
}

function createFakeDomEnvironment(opts = {}) {
  const mutationObservers = new Set();

  class FakeEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.bubbles = Boolean(init.bubbles);
      this.cancelable = init.cancelable !== false;
      this.button = init.button ?? 0;
      this.ctrlKey = Boolean(init.ctrlKey);
      this.metaKey = Boolean(init.metaKey);
      this.shiftKey = Boolean(init.shiftKey);
      this.altKey = Boolean(init.altKey);
      this.clientX = init.clientX ?? 120;
      this.clientY = init.clientY ?? 140;
      this.key = init.key || '';
      this.data = init.data ?? null;
      this.origin = init.origin ?? '';
      this.source = init.source ?? null;
      this.inputType = init.inputType || '';
      this.defaultPrevented = false;
      this._stopped = false;
      this.target = null;
      this.currentTarget = null;
    }
    preventDefault() {
      if (this.cancelable) this.defaultPrevented = true;
    }
    stopPropagation() {
      this._stopped = true;
    }
  }

  function notifyMutations(record) {
    for (const obs of Array.from(mutationObservers)) {
      obs._deliver([record]);
    }
  }

  class FakeNode {
    constructor(nodeType) {
      this.nodeType = nodeType;
      this.parentNode = null;
      this.childNodes = [];
      this._listeners = new Map();
    }
    get parentElement() {
      return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null;
    }
    get firstChild() {
      return this.childNodes[0] || null;
    }
    get isConnected() {
      let cur = this;
      while (cur.parentNode) cur = cur.parentNode;
      return cur === doc || cur === doc.documentElement;
    }
    addEventListener(type, fn, optsOrCap = false) {
      const capture = typeof optsOrCap === 'boolean' ? optsOrCap : Boolean(optsOrCap?.capture);
      if (!this._listeners.has(type)) this._listeners.set(type, []);
      this._listeners.get(type).push({ fn, capture });
    }
    removeEventListener(type, fn, optsOrCap = false) {
      const capture = typeof optsOrCap === 'boolean' ? optsOrCap : Boolean(optsOrCap?.capture);
      const list = this._listeners.get(type);
      if (!list) return;
      this._listeners.set(
        type,
        list.filter((item) => !(item.fn === fn && item.capture === capture))
      );
    }
    dispatchEvent(ev) {
      if (!ev.target) ev.target = this;
      const chain = [];
      let cur = this;
      while (cur) {
        chain.push(cur);
        cur = cur.parentNode;
      }
      for (let i = chain.length - 1; i >= 0; i--) {
        if (ev._stopped) break;
        const node = chain[i];
        const list = node._listeners.get(ev.type) || [];
        for (const item of [...list]) {
          if (item.capture) {
            ev.currentTarget = node;
            item.fn.call(node, ev);
            if (ev._stopped) break;
          }
        }
      }
      const maxBubble = ev.bubbles ? chain.length : 1;
      for (let i = 0; i < maxBubble; i++) {
        if (ev._stopped) break;
        const node = chain[i];
        const list = node._listeners.get(ev.type) || [];
        for (const item of [...list]) {
          if (!item.capture) {
            ev.currentTarget = node;
            item.fn.call(node, ev);
            if (ev._stopped) break;
          }
        }
      }
      return !ev.defaultPrevented;
    }
  }

  class FakeTextNode extends FakeNode {
    constructor(text) {
      super(3);
      this._val = String(text ?? '');
    }
    get nodeValue() {
      return this._val;
    }
    set nodeValue(v) {
      this._val = String(v ?? '');
      notifyMutations({ type: 'characterData', target: this, addedNodes: [], removedNodes: [] });
    }
    get textContent() {
      return this._val;
    }
    set textContent(v) {
      this.nodeValue = v;
    }
    remove() {
      if (this.parentNode) this.parentNode.removeChild(this);
    }
  }

  class FakeFragment extends FakeNode {
    constructor() {
      super(11);
    }
    appendChild(node) {
      if (node.parentNode) node.parentNode.removeChild(node);
      node.parentNode = this;
      this.childNodes.push(node);
      return node;
    }
  }

  class FakeElement extends FakeNode {
    constructor(tagName) {
      super(1);
      this.tagName = String(tagName || 'DIV').toUpperCase();
      this._attrs = new Map();
      this.style = {};
      this.hidden = false;
      this.disabled = false;
      this.tabIndex = 0;
      this._rect = { left: 800, top: 60, width: 520, height: 760, x: 800, y: 60 };
      const self = this;
      const clsSet = new Set();
      this.classList = {
        _sync(str) {
          clsSet.clear();
          for (const t of String(str || '').split(/\s+/).filter(Boolean)) clsSet.add(t);
        },
        add(...toks) {
          for (const t of toks) if (t) clsSet.add(t);
          self._attrs.set('class', Array.from(clsSet).join(' '));
        },
        remove(...toks) {
          for (const t of toks) clsSet.delete(t);
          const s = Array.from(clsSet).join(' ');
          if (s) self._attrs.set('class', s);
          else self._attrs.delete('class');
        },
        contains(t) {
          return clsSet.has(t);
        },
      };
      if (this.tagName === 'IFRAME') {
        this._postedMessages = [];
        this.contentWindow = {
          postMessage: (msg, origin) => {
            this._postedMessages.push({ msg, origin });
          },
        };
      }
    }
    get id() { return this._attrs.get('id') || ''; }
    set id(v) { if (v) this.setAttribute('id', v); else this.removeAttribute('id'); }
    get className() { return this._attrs.get('class') || ''; }
    set className(v) { this.setAttribute('class', v); }
    get src() { return this._attrs.get('src') || ''; }
    set src(v) { this.setAttribute('src', v); }
    get title() { return this._attrs.get('title') || ''; }
    set title(v) { this.setAttribute('title', v); }
    get firstElementChild() { return this.childNodes.find((n) => n.nodeType === 1) || null; }
    get children() { return this.childNodes.filter((n) => n.nodeType === 1); }
    get textContent() { return this.childNodes.map((c) => c.textContent).join(''); }
    set textContent(v) {
      for (const c of this.childNodes) c.parentNode = null;
      this.childNodes = [];
      if (v !== '' && v !== null && v !== undefined) {
        const tn = new FakeTextNode(String(v));
        tn.parentNode = this;
        this.childNodes.push(tn);
      }
    }
    get outerHTML() {
      const attrs = Array.from(this._attrs.entries())
        .map(([k, val]) => `${k}="${String(val).replace(/"/g, '&quot;')}"`)
        .join(' ');
      const open = attrs ? `<${this.tagName.toLowerCase()} ${attrs}>` : `<${this.tagName.toLowerCase()}>`;
      const inner = this.childNodes
        .map((c) => (c.nodeType === 1 ? c.outerHTML : c.nodeValue))
        .join('');
      return `${open}${inner}</${this.tagName.toLowerCase()}>`;
    }
    setAttribute(name, val) {
      const s = String(val);
      this._attrs.set(name, s);
      if (name === 'class') this.classList._sync(s);
      notifyMutations({ type: 'attributes', target: this, attributeName: name, addedNodes: [], removedNodes: [] });
    }
    getAttribute(name) { return this._attrs.has(name) ? this._attrs.get(name) : null; }
    hasAttribute(name) { return this._attrs.has(name); }
    removeAttribute(name) {
      this._attrs.delete(name);
      if (name === 'class') this.classList._sync('');
      notifyMutations({ type: 'attributes', target: this, attributeName: name, addedNodes: [], removedNodes: [] });
    }
    appendChild(node) {
      if (node.nodeType === 11) {
        const moved = [...node.childNodes];
        node.childNodes = [];
        for (const ch of moved) {
          ch.parentNode = this;
          this.childNodes.push(ch);
        }
        notifyMutations({ type: 'childList', target: this, addedNodes: moved, removedNodes: [] });
        return node;
      }
      if (node.parentNode) node.parentNode.removeChild(node);
      node.parentNode = this;
      this.childNodes.push(node);
      notifyMutations({ type: 'childList', target: this, addedNodes: [node], removedNodes: [] });
      return node;
    }
    insertBefore(newNode, refNode) {
      const idx = this.childNodes.indexOf(refNode);
      if (idx === -1) throw new Error("NotFoundError: Failed to execute 'insertBefore' on 'Node'");
      if (newNode.nodeType === 11) {
        const moved = [...newNode.childNodes];
        newNode.childNodes = [];
        for (const ch of moved) ch.parentNode = this;
        this.childNodes.splice(idx, 0, ...moved);
        notifyMutations({ type: 'childList', target: this, addedNodes: moved, removedNodes: [] });
        return newNode;
      }
      if (newNode.parentNode) newNode.parentNode.removeChild(newNode);
      newNode.parentNode = this;
      this.childNodes.splice(idx, 0, newNode);
      notifyMutations({ type: 'childList', target: this, addedNodes: [newNode], removedNodes: [] });
      return newNode;
    }
    replaceChild(newNode, oldNode) {
      const idx = this.childNodes.indexOf(oldNode);
      if (idx === -1) throw new Error("NotFoundError: Failed to execute 'replaceChild' on 'Node'");
      oldNode.parentNode = null;
      if (newNode.nodeType === 11) {
        const moved = [...newNode.childNodes];
        newNode.childNodes = [];
        for (const ch of moved) ch.parentNode = this;
        this.childNodes.splice(idx, 1, ...moved);
        notifyMutations({ type: 'childList', target: this, addedNodes: moved, removedNodes: [oldNode] });
        return oldNode;
      }
      if (newNode.parentNode) newNode.parentNode.removeChild(newNode);
      newNode.parentNode = this;
      this.childNodes.splice(idx, 1, newNode);
      notifyMutations({ type: 'childList', target: this, addedNodes: [newNode], removedNodes: [oldNode] });
      return oldNode;
    }
    removeChild(child) {
      const idx = this.childNodes.indexOf(child);
      if (idx === -1) throw new Error("NotFoundError: Failed to execute 'removeChild' on 'Node'");
      this.childNodes.splice(idx, 1);
      child.parentNode = null;
      notifyMutations({ type: 'childList', target: this, addedNodes: [], removedNodes: [child] });
      return child;
    }
    remove() {
      if (this.parentNode) this.parentNode.removeChild(this);
    }
    normalize() {
      const merged = [];
      for (const ch of this.childNodes) {
        if (ch.nodeType === 3 && merged.length && merged[merged.length - 1].nodeType === 3) {
          merged[merged.length - 1]._val += ch._val;
          ch.parentNode = null;
        } else {
          merged.push(ch);
        }
      }
      this.childNodes = merged;
    }
    matches(sel) { return matchesSelectorList(this, sel); }
    querySelectorAll(sel) {
      const hits = [];
      const walk = (n) => {
        for (const ch of n.childNodes) {
          if (ch.nodeType === 1) {
            if (matchesSelectorList(ch, sel)) hits.push(ch);
            walk(ch);
          }
        }
      };
      walk(this);
      return hits;
    }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    getBoundingClientRect() { return { ...this._rect }; }
    focus() { doc.activeElement = this; }
    click() {
      const ev = new FakeEvent('click', { bubbles: true, cancelable: true, button: 0 });
      this.dispatchEvent(ev);
    }
  }

  class FakeMutationObserver {
    constructor(cb) {
      this._cb = cb;
      this._opts = null;
      this._target = null;
    }
    observe(target, options = {}) {
      this._target = target;
      this._opts = options;
      mutationObservers.add(this);
    }
    disconnect() { mutationObservers.delete(this); }
    _deliver(records) {
      if (!this._opts) return;
      const filtered = records.filter((r) => {
        if (r.type === 'attributes') {
          if (!this._opts.attributes) return false;
          if (this._target && r.target !== this._target && !this._opts.subtree) return false;
          if (Array.isArray(this._opts.attributeFilter) && !this._opts.attributeFilter.includes(r.attributeName)) {
            return false;
          }
          return true;
        }
        return Boolean(this._opts.childList || this._opts.characterData);
      });
      if (filtered.length) this._cb(filtered);
    }
  }

  const doc = new FakeNode(9);
  doc.hidden = false;
  doc.documentElement = new FakeElement('HTML');
  doc.documentElement.parentNode = doc;
  doc.childNodes.push(doc.documentElement);
  doc.head = new FakeElement('HEAD');
  doc.body = new FakeElement('BODY');
  doc.documentElement.appendChild(doc.head);
  doc.documentElement.appendChild(doc.body);
  doc.activeElement = doc.body;

  doc.createElement = (tag) => new FakeElement(tag);
  doc.createTextNode = (txt) => new FakeTextNode(txt);
  doc.createDocumentFragment = () => new FakeFragment();
  doc.querySelectorAll = (sel) => doc.documentElement.querySelectorAll(sel);
  doc.querySelector = (sel) => doc.documentElement.querySelector(sel);
  doc.getElementById = (id) => doc.querySelector(`#${id}`);

  let clipboardText = '';
  let selectionText = '';
  let mockCaretHit = null;

  const win = new FakeNode(9);
  win.document = doc;
  win.innerWidth = 1440;
  win.innerHeight = 900;
  win.location = opts.location || {
    href: 'https://127.0.0.1:1714/c/11111111-2222-4333-8444-555555555555',
    pathname: '/c/11111111-2222-4333-8444-555555555555',
    search: '',
  };
  win.Event = FakeEvent;
  win.InputEvent = FakeEvent;
  win.MutationObserver = FakeMutationObserver;

  if (opts.enableCssHighlights) {
    win.Highlight = class FakeHighlight extends Set {};
    win.CSS = { highlights: new Map() };
    doc.createRange = () => ({
      startContainer: null,
      startOffset: 0,
      endContainer: null,
      endOffset: 0,
      setStart(n, o) { this.startContainer = n; this.startOffset = o; },
      setEnd(n, o) { this.endContainer = n; this.endOffset = o; },
      getClientRects() {
        return [{ left: 10, top: 10, right: 500, bottom: 40 }];
      },
    });
    doc.caretRangeFromPoint = () => mockCaretHit;
  }

  win.navigator = {
    clipboard: {
      writeText: async (txt) => { clipboardText = String(txt); },
    },
  };
  win.getSelection = () => ({ toString: () => selectionText });

  const externalOpened = [];
  const revealedFiles = [];
  const rpcCalls = [];

  win.electronNative = {
    openExternal: async (target) => { externalOpened.push(target); },
    revealInFilePicker: async (target) => { revealedFiles.push(target); },
    ...(opts.wcvBrowser ? { wcvBrowser: opts.wcvBrowser } : {}),
  };

  win.__agPrismOmniCall = (jsonStr) => {
    const req = JSON.parse(jsonStr);
    rpcCalls.push(req);
    if (typeof opts.onRpc === 'function') {
      const reply = opts.onRpc(req);
      if (reply !== undefined) {
        queueMicrotask(() => {
          win.__agPrismOmniResolve?.(req.id, reply);
        });
      }
    }
  };

  return {
    window: win,
    document: doc,
    FakeEvent,
    externalOpened,
    revealedFiles,
    rpcCalls,
    getClipboard: () => clipboardText,
    setSelection: (txt) => { selectionText = txt; },
    setCaretHit: (node, offset) => {
      mockCaretHit = node ? { startContainer: node, startOffset: offset } : null;
    },
  };
}

// Mounts a realistic Antigravity `#root` React Fiber with Redux `store` (`sidePanel` + `sidePanelV2`) & optional `browserCtx`
function mountMockHostRoot(document, { withBrowserCtx = true, withV2 = true, overviewOpen = false } = {}) {
  const cascadeId = '11111111-2222-4333-8444-555555555555';
  const dispatched = [];
  const state = {
    multiConvoLayout: {
      rootNode: { type: 'pane', id: 'pane-1', cascadeId },
      focusedPaneId: 'pane-1',
    },
    sidePanel: {
      conversationPanes: {
        [cascadeId]: { tabs: [], activeTabId: 'overview', isPaneOpen: false },
      },
    },
    ...(withV2
      ? {
          sidePanelV2: {
            conversationPanes: {
              [cascadeId]: { tabs: [], activeTabId: undefined },
            },
            overviewPanelOpen: { [cascadeId]: overviewOpen },
          },
        }
      : {}),
  };

  const store = {
    getState: () => state,
    dispatch: (action) => {
      dispatched.push(action);
      const { type, payload } = action || {};
      if (type === 'sidePanel/setSidePanelOpen' && payload?.treeId?.kind === 'cascadeId') {
        const cid = payload.treeId.cascadeId;
        state.sidePanel.conversationPanes[cid] ??= { tabs: [], isPaneOpen: false };
        state.sidePanel.conversationPanes[cid].isPaneOpen = Boolean(payload.isOpen);
      } else if (type === 'sidePanelV2/setOverviewPanelOpen' && payload?.cascadeId) {
        state.sidePanelV2.overviewPanelOpen[payload.cascadeId] = Boolean(payload.open);
      } else if (type === 'sidePanelV2/setContent' && (payload?.panelScope || payload?.treeId)?.kind === 'cascadeId') {
        const cid = (payload.panelScope || payload.treeId).cascadeId;
        const pane = (state.sidePanelV2.conversationPanes[cid] ??= { tabs: [] });
        const idx = pane.tabs.findIndex((t) => t.id === payload.tabId);
        const tabObj = { id: payload.tabId, content: payload.content, isPreview: false };
        if (idx >= 0) pane.tabs[idx] = tabObj;
        else pane.tabs.push(tabObj);
        if (!payload.background) pane.activeTabId = payload.tabId;
      } else if (type === 'sidePanelV2/setActiveTab' && (payload?.panelScope || payload?.treeId)?.kind === 'cascadeId') {
        const pane = state.sidePanelV2.conversationPanes[(payload.panelScope || payload.treeId).cascadeId];
        if (pane) pane.activeTabId = payload.tabId;
      } else if (type === 'sidePanel/setContent' && payload?.treeId?.kind === 'cascadeId') {
        const cid = payload.treeId.cascadeId;
        const pane = (state.sidePanel.conversationPanes[cid] ??= { tabs: [] });
        const idx = pane.tabs.findIndex((t) => t.id === payload.tabId);
        const tabObj = { id: payload.tabId, content: payload.content, isPreview: false };
        if (idx >= 0) pane.tabs[idx] = tabObj;
        else pane.tabs.push(tabObj);
        if (!payload.background) pane.activeTabId = payload.tabId;
      }
      return action;
    },
  };

  const contextCalls = [];
  const browserCtxNode = withBrowserCtx
    ? {
        memoizedProps: {
          value: {
            isBrowserPaneAvailable: true,
            getTargetTreeId: () => ({ kind: 'cascadeId', cascadeId }),
            openUrlInBrowserPane: (url, opts = {}) => {
              contextCalls.push({ url, opts });
              const tabId = opts.preferredTabId || `browser__native_${contextCalls.length}`;
              const target = withV2 ? 'sidePanelV2/setContent' : 'sidePanel/setContent';
              store.dispatch({
                type: target,
                payload: {
                  treeId: opts.targetTreeId || { kind: 'cascadeId', cascadeId },
                  tabId,
                  keepOpen: true,
                  background: false,
                  content: {
                    type: 'customView',
                    customView: {
                      customPaneKey: 'browser',
                      serializedInputs: JSON.stringify({ tabId, initialUrl: url, entryUrl: url }),
                    },
                  },
                },
              });
              return true;
            },
          },
        },
        child: null,
        sibling: null,
      }
    : null;

  const rootEl = document.createElement('div');
  rootEl.id = 'root';
  rootEl.__reactContainer$test = {
    memoizedProps: { store },
    child: browserCtxNode,
    sibling: null,
  };
  document.body.appendChild(rootEl);

  return { rootEl, store, state, dispatched, contextCalls, cascadeId };
}

function flushMicrotasks() {
  return new Promise((resolve) => setTimeout(resolve, 18));
}

// ── 1. Pure Parsers, Stable Hash & Path Utilities ───────────────────────────
test('URI decoding, line range parsing, relative path calculation, stable hash & preview kind mapping', () => {
  const winParsed = omniMod.parseFileUriToPath(
    'file:///d%3A/projects/prism-app/src/main.tsx#L18-L42'
  );
  assert.equal(winParsed.filePath, 'd:\\projects\\prism-app\\src\\main.tsx');
  assert.equal(winParsed.lineStart, 18);
  assert.equal(winParsed.lineEnd, 42);

  const posixParsed = omniMod.parseFileUriToPath('file:///opt/work/demo/report.csv:95:4');
  assert.equal(posixParsed.filePath, '/opt/work/demo/report.csv');
  assert.equal(posixParsed.lineStart, 95);
  assert.equal(posixParsed.lineEnd, null);

  const ideScheme = omniMod.parseFileUriToPath('antigravity-ide://file/d:/projects/prism-app/README.md#L7');
  assert.equal(ideScheme.filePath, 'd:\\projects\\prism-app\\README.md');
  assert.equal(ideScheme.lineStart, 7);

  assert.equal(
    omniMod.computeRelativePath('D:\\projects\\prism-app\\src\\ui\\card.ts#L10-L20', 'd:/projects/prism-app'),
    'src/ui/card.ts#L10-L20'
  );
  assert.equal(omniMod.shortStableHash('assets/intro.mp4'), omniMod.shortStableHash('assets/intro.mp4'));
  assert.notEqual(omniMod.shortStableHash('assets/intro.mp4'), omniMod.shortStableHash('assets/outro.mp4'));
  assert.equal(omniMod.detectPreviewKind('/media/demo.mp4'), 'video');
  assert.equal(omniMod.detectPreviewKind('/media/voice.wav'), 'audio');
  assert.equal(omniMod.detectPreviewKind('/media/icon.svg'), 'svg');
  assert.equal(omniMod.detectPreviewKind('/media/data.jsonl'), 'table');
  assert.equal(omniMod.detectPreviewKind('/media/mono.woff2'), 'font');
  assert.equal(omniMod.detectPreviewKind('/media/page.html'), 'html');
  assert.equal(omniMod.detectPreviewKind('/media/spec.pdf'), 'pdf');
});

// ── 2. Native Host Browser Tab Routing (Yields Host `<a href>`, Handles `.ag-prism-thought-overlay a` & Bare Links) ─
test('yields host-native http(s) <a href> to Antigravity v2.33.0+ router, while routing .ag-prism-thought-overlay links with Ctrl/Cmd inversion & zero .ag-omni-dock', async () => {
  const env = createFakeDomEnvironment();
  const { window, document, FakeEvent, externalOpened } = env;
  const host = mountMockHostRoot(document, { withBrowserCtx: true, withV2: true, overviewOpen: true });

  // Plant a stale legacy `.ag-omni-dock` and polluted `mainPane.style.flex` to verify automatic cleanup!
  const auxSplit = document.createElement('div');
  auxSplit.setAttribute('data-testid', 'aux-pane-split');
  const mainPane = document.createElement('div');
  mainPane.style.flex = '1 1 0%';
  mainPane.style.minWidth = '320px';
  const staleDock = document.createElement('aside');
  staleDock.className = 'ag-omni-dock';
  staleDock.setAttribute('data-testid', 'ag-omni-dock');
  auxSplit.appendChild(mainPane);
  auxSplit.appendChild(staleDock);

  const resp = document.createElement('div');
  resp.setAttribute('data-testid', 'planner-response-text');

  // Host-native Markdown `<a href>` (must yield 100% to Antigravity's native `defaultLinkOpenTarget` & `S4a` menu!)
  const hostLink = document.createElement('a');
  hostLink.setAttribute('href', 'https://antigravity.google/docs');
  hostLink.textContent = 'Host Native Link';
  resp.appendChild(hostLink);

  // Prism-owned `.ag-prism-thought-overlay` link (no host React `uB()` hook -> handled by Omni!)
  const thoughtOverlay = document.createElement('div');
  thoughtOverlay.className = 'ag-prism-thought-overlay';
  const link = document.createElement('a');
  link.setAttribute('href', 'https://github.com/org/repo');
  link.textContent = 'GitHub Repo';
  thoughtOverlay.appendChild(link);
  resp.appendChild(thoughtOverlay);

  const dlLink = document.createElement('a');
  dlLink.setAttribute('href', 'https://example.org/release.zip');
  dlLink.setAttribute('download', 'release.zip');
  dlLink.textContent = 'Download ZIP';
  thoughtOverlay.appendChild(dlLink);

  mainPane.appendChild(resp);
  document.body.appendChild(auxSplit);

  const client = omniMod.createOmniClient({ window, document });
  client.sync(
    { omniModule: 'on', linkTarget: 'builtin' },
    { baseUrl: 'http://127.0.0.1:43999', token: 'tok123' }
  );

  // Legacy `.ag-omni-dock` is purged immediately on `sync()` and `mainPane` flex is healed!
  assert.equal(document.querySelector('.ag-omni-dock'), null);
  assert.equal(mainPane.style.flex, '');
  assert.equal(mainPane.style.flexGrow, '1');
  assert.equal(mainPane.style.minWidth, '300px');

  // Host-native `<a href="https://...">` left-click AND right-click MUST NOT be intercepted!
  const hostClickEv = new FakeEvent('click', { bubbles: true, cancelable: true, button: 0 });
  hostLink.dispatchEvent(hostClickEv);
  assert.equal(hostClickEv.defaultPrevented, false, 'Must yield host-native <a href> left-click to official router');
  assert.equal(host.contextCalls.length, 0);

  const hostCtxEv = new FakeEvent('contextmenu', { bubbles: true, cancelable: true });
  hostLink.dispatchEvent(hostCtxEv);
  assert.equal(hostCtxEv.defaultPrevented, false, 'Must yield host-native <a href> right-click to official S4a menu');
  assert.equal(document.querySelector('[data-testid="ag-omni-context-menu"]'), null);

  // `<a download>` must NOT be intercepted even inside `.ag-prism-thought-overlay`
  const dlEv = new FakeEvent('click', { bubbles: true, cancelable: true, button: 0 });
  dlLink.dispatchEvent(dlEv);
  assert.equal(dlEv.defaultPrevented, false);

  // `.ag-prism-thought-overlay` link opens via host React Context `openUrlInBrowserPane` with ZERO `.ag-omni-dock`!
  const clickEv1 = new FakeEvent('click', { bubbles: true, cancelable: true, button: 0 });
  link.dispatchEvent(clickEv1);
  await flushMicrotasks();

  assert.equal(clickEv1.defaultPrevented, true);
  assert.equal(externalOpened.length, 0);
  assert.equal(document.querySelector('.ag-omni-dock'), null, 'Must NEVER create rogue .ag-omni-dock');
  assert.equal(host.contextCalls.length, 1);
  assert.equal(host.contextCalls[0].url, 'https://github.com/org/repo');
  assert.equal(host.state.sidePanel.conversationPanes[host.cascadeId].isPaneOpen, true);
  assert.equal(host.state.sidePanelV2.overviewPanelOpen[host.cascadeId], false);
  assert.equal(client.getState().lastOpenedTab?.method, 'context');

  // Ctrl+Click inverts to external system browser
  link.dispatchEvent(new FakeEvent('click', { bubbles: true, cancelable: true, button: 0, ctrlKey: true }));
  await flushMicrotasks();
  assert.deepEqual(externalOpened, ['https://github.com/org/repo']);

  // Switch linkTarget to 'external': plain click opens external, Meta+Click opens native host tab
  client.sync({ linkTarget: 'external' });
  link.dispatchEvent(new FakeEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  await flushMicrotasks();
  assert.equal(externalOpened.length, 2);

  link.setAttribute('href', 'https://github.com/org/repo/pulls');
  link.dispatchEvent(new FakeEvent('click', { bubbles: true, cancelable: true, button: 0, metaKey: true }));
  await flushMicrotasks();
  assert.equal(host.contextCalls.length, 2);
  assert.equal(host.contextCalls[1].url, 'https://github.com/org/repo/pulls');

  client.destroy();
});

// ── 3. Direct Redux `sidePanelV2` Fallback Dispatch & Title Synchronization ──
test('falls back to Redux sidePanelV2/setContent + setActiveTab when React Context is absent and sets friendly pageTitle', async () => {
  const env = createFakeDomEnvironment();
  const { window, document } = env;
  const host = mountMockHostRoot(document, { withBrowserCtx: false, withV2: true });

  const client = omniMod.createOmniClient({ window, document });
  client.sync(
    { omniModule: 'on', linkTarget: 'builtin' },
    { baseUrl: 'http://127.0.0.1:43999', token: 'tok_rdx' }
  );

  await client.openUrl('https://developer.mozilla.org/en-US/docs/Web', 'builtin');
  assert.equal(client.getState().lastOpenedTab?.method, 'redux');
  assert.equal(host.state.sidePanel.conversationPanes[host.cascadeId].isPaneOpen, true);

  const v2SetContent = host.dispatched.find((a) => a.type === 'sidePanelV2/setContent');
  const v2SetActive = host.dispatched.find((a) => a.type === 'sidePanelV2/setActiveTab');
  assert.deepEqual(v2SetContent?.payload?.panelScope, { kind: 'cascadeId', cascadeId: host.cascadeId });
  assert.deepEqual(v2SetActive?.payload?.panelScope, { kind: 'cascadeId', cascadeId: host.cascadeId });

  const paneTabs = host.state.sidePanelV2.conversationPanes[host.cascadeId].tabs;
  assert.equal(paneTabs.length, 1);
  assert.equal(paneTabs[0].content.type, 'customView');
  assert.equal(paneTabs[0].content.customView.customPaneKey, 'browser');
  const parsedWebInputs = JSON.parse(paneTabs[0].content.customView.serializedInputs);
  assert.equal(parsedWebInputs.initialUrl, 'https://developer.mozilla.org/en-US/docs/Web');

  // Opening a local file routes `/viewer?...` to a native Browser Tab with `prism-omni__<hash>` & `pageTitle`
  await client.openFile('/workspace/demo/video/preview.mp4', { lineStart: 12, lineEnd: 24 });
  assert.equal(paneTabs.length, 2);
  const fileTab = paneTabs[1];
  assert.match(fileTab.id, /^prism-omni__[a-z0-9]+$/);
  const parsedFileInputs = JSON.parse(fileTab.content.customView.serializedInputs);
  assert.equal(parsedFileInputs.pageTitle, 'preview.mp4 #L12-L24');
  assert.match(parsedFileInputs.initialUrl, /^http:\/\/127\.0\.0\.1:43999\/viewer\?token=tok_rdx&path=/);

  // Re-opening the same file reuses the exact same `prism-omni__<hash>` tab without tab bloat!
  await client.openFile('/workspace/demo/video/preview.mp4');
  assert.equal(paneTabs.length, 2);

  client.destroy();
});

// ── 4. Right-Click Menu, Thought Code Chips, Composer @Mention & Aux Origin-Locked Sync ─
test('right-clicking file pills & thought code chips opens native workbench tab, reveals, inserts @mention, and locks Aux postMessage origin', async () => {
  const env = createFakeDomEnvironment({
    onRpc(req) {
      if (req.action === 'getServerInfo') {
        return { ok: true, baseUrl: 'http://127.0.0.1:45120', token: 'sec_tok_99' };
      }
      if (req.action === 'resolvePath') {
        return {
          ok: true,
          exists: true,
          absPath: '/projects/demo/assets/intro.mp4',
          relPath: 'assets/intro.mp4',
        };
      }
      return { ok: true };
    },
  });
  const { window, document, FakeEvent, revealedFiles, getClipboard } = env;
  const host = mountMockHostRoot(document, { withBrowserCtx: true, withV2: true });

  document.documentElement.setAttribute('data-ag-cs-theme', 'dark');
  document.documentElement.setAttribute('data-ag-cs-palette', 'obsidian');
  document.documentElement.setAttribute('data-ag-cs-accent', 'cobalt');
  document.documentElement.setAttribute('data-ag-cs-lang', 'zh-CN');

  const composerBox = document.createElement('div');
  composerBox.setAttribute('data-testid', 'agent-input-box');
  const ce = document.createElement('div');
  ce.setAttribute('contenteditable', 'true');
  ce.textContent = '请检查这个视频';
  composerBox.appendChild(ce);
  document.body.appendChild(composerBox);

  const pill = document.createElement('button');
  pill.className = 'inline-pill';
  pill.setAttribute('data-uri', 'file:///projects/demo/assets/intro.mp4');
  pill.setAttribute('title', '/projects/demo/assets/intro.mp4');
  pill.textContent = 'intro.mp4';
  document.body.appendChild(pill);

  const thoughtCode = document.createElement('code');
  thoughtCode.className = 'ag-prism-thought-code';
  thoughtCode.textContent = 'vendor/omni-viewer/omni-server.mjs#L114';
  document.body.appendChild(thoughtCode);
  const tcMeta = omniMod.extractTargetMeta(thoughtCode);
  assert.equal(tcMeta?.kind, 'file');
  assert.equal(tcMeta?.filePath, 'vendor/omni-viewer/omni-server.mjs');
  assert.equal(tcMeta?.lineStart, 114);

  // Also mount a native Aux `binary-file-no-preview` view to verify inline switcher + SEC-7 postMessage origin lock
  const binShell = document.createElement('div');
  binShell.className = 'relative h-full w-full';
  const binLeaf = document.createElement('div');
  binLeaf.setAttribute('data-testid', 'binary-file-no-preview');
  binLeaf.setAttribute('data-file-uri', 'file:///projects/demo/assets/intro.mp4');
  binShell.appendChild(binLeaf);
  document.body.appendChild(binShell);

  const client = omniMod.createOmniClient({ window, document });
  client.sync({ omniModule: 'on' });

  // Composer editable area is never hijacked
  const ceCtx = new FakeEvent('contextmenu', { bubbles: true, cancelable: true });
  ce.dispatchEvent(ceCtx);
  assert.equal(ceCtx.defaultPrevented, false);

  // Right-click `.inline-pill` -> insert @mention -> reveal -> copy-rel-path -> open-preview (in native host tab!)
  pill.dispatchEvent(new FakeEvent('contextmenu', { bubbles: true, cancelable: true }));
  document.querySelector('[data-omni-action="insert-mention"]').click();
  assert.match(ce.textContent, /^请检查这个视频 @[A-Za-z0-9_./-]*intro\.mp4 $/);

  pill.dispatchEvent(new FakeEvent('contextmenu', { bubbles: true, cancelable: true }));
  document.querySelector('[data-omni-action="reveal-folder"]').click();
  await flushMicrotasks();
  assert.equal(revealedFiles.length, 1);

  pill.dispatchEvent(new FakeEvent('contextmenu', { bubbles: true, cancelable: true }));
  document.querySelector('[data-omni-action="copy-rel-path"]').click();
  await flushMicrotasks();
  assert.equal(getClipboard(), 'assets/intro.mp4');

  pill.dispatchEvent(new FakeEvent('contextmenu', { bubbles: true, cancelable: true }));
  document.querySelector('[data-omni-action="open-preview"]').click();
  await flushMicrotasks();

  const paneTabs = host.state.sidePanelV2.conversationPanes[host.cascadeId].tabs;
  assert.equal(paneTabs.length, 1);
  const tabInputs = JSON.parse(paneTabs[0].content.customView.serializedInputs);
  assert.equal(tabInputs.pageTitle, 'intro.mp4');
  assert.match(tabInputs.initialUrl, /^http:\/\/127\.0\.0\.1:45120\/viewer\?token=sec_tok_99/);
  assert.match(tabInputs.initialUrl, /palette=obsidian/);
  assert.match(tabInputs.initialUrl, /accent=cobalt/);

  // Inline Aux switcher SEC-7 origin-locked postMessage verification
  const switcher = binShell.querySelector('[data-testid="ag-omni-aux-switcher"]');
  assert.ok(switcher);
  switcher.children[0].click(); // Click `检视台视图`
  await flushMicrotasks();

  const auxIframe = binShell.querySelector('[data-testid="ag-omni-aux-iframe"]');
  assert.ok(auxIframe);
  assert.equal(auxIframe._postedMessages.at(-1).origin, 'http://127.0.0.1:45120');

  const countBeforeSpoof = auxIframe._postedMessages.length;
  window.dispatchEvent(
    new FakeEvent('message', {
      data: { type: 'ag-prism-workbench-ready' },
      origin: 'https://evil.example.com',
      source: auxIframe.contentWindow,
    })
  );
  assert.equal(auxIframe._postedMessages.length, countBeforeSpoof);

  window.dispatchEvent(
    new FakeEvent('message', {
      data: { type: 'ag-prism-workbench-ready' },
      origin: 'http://127.0.0.1:45120',
      source: auxIframe.contentWindow,
    })
  );
  assert.equal(auxIframe._postedMessages.length, countBeforeSpoof + 1);

  client.destroy();
});

// ── 5a. HS-2 Zero-DOM-Mutation `CSS.highlights` Engine (React 19 Safe!) ──────
test('CSS.highlights engine highlights bare URLs & paths with ZERO TextNode splitting so React removeChild never throws', async () => {
  const env = createFakeDomEnvironment({ enableCssHighlights: true });
  const { window, document, FakeEvent, setCaretHit } = env;
  const host = mountMockHostRoot(document, { withBrowserCtx: true, withV2: true });

  const resp = document.createElement('div');
  resp.setAttribute('data-testid', 'planner-response-text');

  const streamingPara = document.createElement('p');
  streamingPara.setAttribute('data-ag-cs-spark-streaming', '1');
  streamingPara.textContent = 'Streaming https://partial.example.org';
  resp.appendChild(streamingPara);

  const para = document.createElement('p');
  const origTextNode = document.createTextNode(
    'Check https://docs.example.com/api(v2)。 Also src/core/engine.ts#L15-L30!'
  );
  para.appendChild(origTextNode);
  resp.appendChild(para);
  document.body.appendChild(resp);

  const client = omniMod.createOmniClient({ window, document });
  client.sync({ omniModule: 'on', linkTarget: 'builtin' }, { baseUrl: 'http://127.0.0.1:47000', token: 'tok_hl' });

  assert.equal(client.getState().highlightMode, 'css-highlights');
  assert.equal(para.childNodes.length, 1);
  assert.equal(para.firstChild, origTextNode);
  assert.equal(document.querySelectorAll('.ag-omni-autolink').length, 0);

  const urlHl = window.CSS.highlights.get('ag-omni-url');
  const pathHl = window.CSS.highlights.get('ag-omni-path');
  assert.equal(urlHl.size, 1);
  assert.equal(pathHl.size, 1);

  setCaretHit(origTextNode, 10);
  para.dispatchEvent(new FakeEvent('mousemove', { bubbles: true, clientX: 80, clientY: 20 }));
  assert.equal(document.documentElement.getAttribute('data-ag-omni-hover-token'), '1');

  // Left-clicking at token coordinates opens native host Browser Tab
  para.dispatchEvent(new FakeEvent('click', { bubbles: true, cancelable: true, button: 0, clientX: 80, clientY: 20 }));
  await flushMicrotasks();
  assert.equal(host.contextCalls.at(-1)?.url, 'https://docs.example.com/api(v2)');

  // Right-clicking at file path coordinates opens file context menu
  setCaretHit(origTextNode, 52);
  para.dispatchEvent(new FakeEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 20 }));
  assert.ok(document.querySelector('[data-testid="ag-omni-context-menu"]'));

  // Simulate React 19 `commitDeletion` removing original `HostText` node -> ZERO `NotFoundError`!
  assert.doesNotThrow(() => para.removeChild(origTextNode));

  client.destroy();
  assert.equal(window.CSS.highlights.size, 0);
});

// ── 5b. Fallback `<span>` Linkifier (Headless Environments Without CSS.highlights) ─
test('fallback span linkifier works when CSS.highlights is unavailable and strictly skips pre/code/composer/thought-overlay', () => {
  const env = createFakeDomEnvironment({ enableCssHighlights: false });
  const { window, document } = env;

  const resp = document.createElement('div');
  resp.setAttribute('data-testid', 'planner-response-text');

  const para = document.createElement('p');
  para.textContent =
    '(See https://docs.example.com/api(v2))。 Also check localhost:5173/health and src/core/engine.ts#L15-L30!';

  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.textContent = 'const url = "https://do-not-touch.example.com"; // src/secret/raw.ts';
  pre.appendChild(code);

  const thoughtOverlay = document.createElement('div');
  thoughtOverlay.className = 'ag-prism-thought-overlay';
  thoughtOverlay.textContent = 'Translated thought mentioning https://skip-thought.example.com and lib/a.js';

  resp.appendChild(para);
  resp.appendChild(pre);
  resp.appendChild(thoughtOverlay);
  document.body.appendChild(resp);

  const client = omniMod.createOmniClient({ window, document });
  client.sync({ omniModule: 'on' });

  assert.equal(client.getState().highlightMode, 'span-fallback');
  const autolinks = para.querySelectorAll('.ag-omni-autolink');
  assert.equal(autolinks.length, 3);
  assert.equal(autolinks[0].getAttribute('data-omni-url'), 'https://docs.example.com/api(v2)');
  assert.equal(autolinks[1].getAttribute('data-omni-url'), 'http://localhost:5173/health');
  assert.equal(autolinks[2].getAttribute('data-omni-path'), 'src/core/engine.ts');

  assert.equal(pre.querySelectorAll('.ag-omni-autolink').length, 0);
  assert.equal(thoughtOverlay.querySelectorAll('.ag-omni-autolink').length, 0);

  client.sync({ omniModule: 'off' });
  assert.equal(document.querySelectorAll('.ag-omni-autolink').length, 0);
  assert.equal(
    para.textContent,
    '(See https://docs.example.com/api(v2))。 Also check localhost:5173/health and src/core/engine.ts#L15-L30!'
  );
  client.destroy();
});

// ── 6. Mermaid `#raw=` Native Tab Zoom + Real Host Aux Selectors + Re-Entrant Sync ─
test('Mermaid zoom opens native Browser Tab with #raw=<svg> hash, decorates real host Aux selectors, and supports re-entrant sync', async () => {
  const env = createFakeDomEnvironment();
  const { window, document } = env;
  const host = mountMockHostRoot(document, { withBrowserCtx: true, withV2: true });

  const mermaidWrap = document.createElement('div');
  mermaidWrap.className = 'mermaid';
  const svg = document.createElement('svg');
  svg.setAttribute('id', 'mermaid-diagram-1');
  svg.setAttribute('viewBox', '0 0 200 100');
  mermaidWrap.appendChild(svg);
  document.body.appendChild(mermaidWrap);

  const binShell = document.createElement('div');
  binShell.className = 'relative h-full w-full';
  const binLeaf = document.createElement('div');
  binLeaf.setAttribute('data-testid', 'binary-file-no-preview');
  binLeaf.__reactFiber$mock = {
    return: { memoizedProps: { fileUri: 'file:///projects/demo/fonts/JetBrainsMono.woff2' } },
  };
  binShell.appendChild(binLeaf);
  document.body.appendChild(binShell);

  const csvBox = document.createElement('div');
  csvBox.setAttribute('data-testid', 'csv-file-viewer');
  csvBox.__reactFiber$mock = { return: { key: 'file:///projects/demo/data/bench.tsv', memoizedProps: {} } };
  document.body.appendChild(csvBox);

  const normalVideoShell = document.createElement('div');
  normalVideoShell.className = 'relative h-full w-full';
  normalVideoShell.__reactFiber$mock = { return: { memoizedProps: { fileUri: 'file:///projects/demo/media/clip-80mb.mp4' } } };
  normalVideoShell.appendChild(document.createElement('video'));
  document.body.appendChild(normalVideoShell);

  const client = omniMod.createOmniClient({ window, document });
  client.sync({ omniModule: 'on' }, { baseUrl: 'http://127.0.0.1:46000', token: 'tok_mmd' });

  const zoomBtn = mermaidWrap.querySelector('[data-testid="ag-omni-mermaid-zoom"]');
  assert.ok(zoomBtn);
  zoomBtn.click();
  await flushMicrotasks();

  const paneTabs = host.state.sidePanelV2.conversationPanes[host.cascadeId].tabs;
  assert.equal(paneTabs.length, 1);
  assert.equal(paneTabs[0].id, 'prism-omni__mermaid');
  const mmdInputs = JSON.parse(paneTabs[0].content.customView.serializedInputs);
  assert.match(mmdInputs.initialUrl, /^http:\/\/127\.0\.0\.1:46000\/viewer\?token=tok_mmd.*kind=mermaid/);
  assert.match(decodeURIComponent(mmdInputs.initialUrl), /#raw=<svg id="mermaid-diagram-1"/);

  const binSwitcher = binShell.querySelector('[data-testid="ag-omni-aux-switcher"]');
  assert.ok(binSwitcher, 'Unsupported binary-file-no-preview must still get Omni rescue switcher');
  assert.equal(csvBox.querySelectorAll('[data-testid="ag-omni-aux-switcher"]').length, 0, 'Must yield native csv-file-viewer');
  assert.equal(normalVideoShell.querySelectorAll('[data-testid="ag-omni-aux-switcher"]').length, 0, 'Must yield native <=200MB <video>');

  client.destroy();
  client.sync({ omniModule: 'on' }, { baseUrl: 'http://127.0.0.1:46000', token: 'tok_mmd' });
  assert.equal(client.getState().enabled, true);
  client.destroy();
});

// ── 6b. #236/#241 >20MB Video Host Error Auto-Takeover & Same-Slot File Switch ─
test('auto-replaces host >20MB File Pane error (UHc without data-testid) with inline streaming viewer and reconciles same-slot file switches', async () => {
  const env = createFakeDomEnvironment();
  const { window, document } = env;
  mountMockHostRoot(document, { withBrowserCtx: true, withV2: true });

  const auxSplit = document.createElement('div');
  auxSplit.setAttribute('data-testid', 'aux-pane-split');
  const mainPane = document.createElement('div');
  const rightPane = document.createElement('div');
  auxSplit.appendChild(mainPane);
  auxSplit.appendChild(rightPane);
  document.body.appendChild(auxSplit);

  // Build exact host File Pane DOM (`Ey` .relative.h-full.w-full -> scroll div -> `UHc` error div without data-testid)
  const fileShell = document.createElement('div');
  fileShell.className = 'relative h-full w-full';
  const fiberState = {
    memoizedProps: {
      fileUri: 'file:///d%3A/projects/demo/media/launch-1080p60.mp4',
      tabId: 'file__mp4_1',
    },
  };
  fileShell.__reactFiber$host = { return: fiberState };

  const scrollBox = document.createElement('div');
  scrollBox.className = 'flex flex-col h-full w-full pl-2 overflow-y-auto';
  const errBox = document.createElement('div');
  errBox.className = 'flex flex-col items-center justify-center w-full h-full text-center';
  const errTitle = document.createElement('p');
  errTitle.textContent = 'Failed to read file content';
  const errDetail = document.createElement('p');
  errDetail.textContent = 'File exceeds the 20MB display limit (36MB).';
  errBox.appendChild(errTitle);
  errBox.appendChild(errDetail);
  scrollBox.appendChild(errBox);
  fileShell.appendChild(scrollBox);
  rightPane.appendChild(fileShell);

  const client = omniMod.createOmniClient({ window, document });
  client.sync({ omniModule: 'on' }, { baseUrl: 'http://127.0.0.1:46500', token: 'tok_vid' });
  await flushMicrotasks();

  // Immediately auto-activates inline Workbench streaming iframe and hides the >20MB error!
  const switcher1 = fileShell.querySelector('[data-testid="ag-omni-aux-switcher"]');
  const iframe1 = fileShell.querySelector('[data-testid="ag-omni-aux-iframe"]');
  assert.ok(switcher1, 'Must mount Aux switcher on UHc >20MB error shell');
  assert.ok(iframe1, 'Must auto-mount inline streaming iframe without user clicking button');
  assert.equal(iframe1.hidden, false);
  assert.equal(scrollBox.style.display, 'none', 'Host 20MB error box must be hidden');
  assert.match(iframe1.src, /^http:\/\/127\.0\.0\.1:46500\/viewer\?token=tok_vid.*launch-1080p60\.mp4/);
  assert.match(iframe1.src, /kind=video/);

  // Same-slot switch to a second >200MB video (v2.33.0+ media limit) updates the inline streaming iframe!
  fiberState.memoizedProps = {
    fileUri: 'file:///d%3A/projects/demo/media/keynote-4k.mp4',
    tabId: 'file__mp4_2',
  };
  errDetail.replaceChild(
    document.createTextNode('File exceeds the 200MB display limit (273MB).'),
    errDetail.firstChild
  );
  await new Promise((r) => setTimeout(r, 95));

  const iframe2 = fileShell.querySelector('[data-testid="ag-omni-aux-iframe"]');
  assert.ok(iframe2);
  assert.match(iframe2.src, /keynote-4k\.mp4/);

  // Same-slot switch to an <=200MB video supported natively by Antigravity v2.33.0+ cleanly unmounts the Omni overlay!
  fiberState.memoizedProps = {
    fileUri: 'file:///d%3A/projects/demo/media/short-demo-40mb.mp4',
    tabId: 'file__mp4_3',
  };
  errBox.remove();
  const nativeVideo = document.createElement('video');
  nativeVideo.setAttribute('src', 'blob:https://127.0.0.1:10725/native-vid');
  scrollBox.appendChild(nativeVideo);
  await new Promise((r) => setTimeout(r, 85));

  assert.equal(fileShell.querySelector('[data-testid="ag-omni-aux-iframe"]'), null, 'Must yield to native <=200MB video');
  assert.equal(fileShell.querySelector('[data-testid="ag-omni-aux-switcher"]'), null);
  assert.equal(scrollBox.style.display, '', 'Native <=200MB video scroll box must be restored');

  client.destroy();
});

// ── 6c. Battle 3: Aux Auto-Preview for .html/.htm/.svg + Sandbox Badge + 8-Locale + Clean Unmount ─
test('auto-previews normal .html/.htm/.svg in aux-pane-split without error banner, toggles Source, unmounts on .ts, excludes native containers, and renders 8-locale 5+1 sandbox badge', async () => {
  const env = createFakeDomEnvironment();
  const { window, document } = env;
  mountMockHostRoot(document, { withBrowserCtx: true, withV2: true });
  document.documentElement.setAttribute('data-ag-cs-lang', 'zh-CN');

  const auxSplit = document.createElement('div');
  auxSplit.setAttribute('data-testid', 'aux-pane-split');
  const mainPane = document.createElement('div');
  const convView = document.createElement('div');
  convView.setAttribute('data-testid', 'conversation-view');
  const convShell = document.createElement('div');
  convShell.className = 'relative h-full w-full';
  convShell.__reactFiber$host = { return: { memoizedProps: { fileUri: 'file:///projects/demo/ignored-in-conv.html' } } };
  convView.appendChild(convShell);
  mainPane.appendChild(convView);

  const rightPane = document.createElement('div');
  auxSplit.appendChild(mainPane);
  auxSplit.appendChild(rightPane);
  document.body.appendChild(auxSplit);

  // Excluded containers inside aux-pane-split that must NEVER be hijacked
  const asideBox = document.createElement('aside');
  const asideShell = document.createElement('div');
  asideShell.className = 'relative h-full w-full';
  asideShell.__reactFiber$host = { return: { memoizedProps: { fileUri: 'file:///projects/demo/sidebar.html' } } };
  asideBox.appendChild(asideShell);
  rightPane.appendChild(asideBox);

  const homeBox = document.createElement('div');
  homeBox.className = 'agy-home';
  const homeShell = document.createElement('div');
  homeShell.className = 'relative h-full w-full';
  homeShell.__reactFiber$host = { return: { memoizedProps: { fileUri: 'file:///projects/demo/home.svg' } } };
  homeBox.appendChild(homeShell);
  rightPane.appendChild(homeBox);

  const csvShell = document.createElement('div');
  csvShell.className = 'relative h-full w-full';
  csvShell.__reactFiber$host = { return: { memoizedProps: { fileUri: 'file:///projects/demo/fake.html' } } };
  const csvChild = document.createElement('div');
  csvChild.setAttribute('data-testid', 'csv-file-viewer');
  csvShell.appendChild(csvChild);
  rightPane.appendChild(csvShell);

  const vidShell = document.createElement('div');
  vidShell.className = 'relative h-full w-full';
  vidShell.__reactFiber$host = { return: { memoizedProps: { fileUri: 'file:///projects/demo/fake.svg' } } };
  vidShell.appendChild(document.createElement('video'));
  rightPane.appendChild(vidShell);

  // Normal host File Pane shell opening an ordinary .html file (NO error banner!)
  const fileShell = document.createElement('div');
  fileShell.className = 'relative h-full w-full';
  const fiberState = {
    memoizedProps: {
      fileUri: 'file:///projects/demo/landing/index.html',
      tabId: 'file__html_1',
    },
  };
  fileShell.__reactFiber$host = { return: fiberState };
  const editorBox = document.createElement('div');
  editorBox.className = 'monaco-editor-host';
  editorBox.textContent = '<!doctype html><h1>Preview Me</h1>';
  fileShell.appendChild(editorBox);
  rightPane.appendChild(fileShell);

  const client = omniMod.createOmniClient({ window, document });
  client.sync({ omniModule: 'on' }, { baseUrl: 'http://127.0.0.1:46600', token: 'tok_b3' });
  await flushMicrotasks();

  // 1) Excluded containers must have ZERO switchers
  assert.equal(convShell.querySelector('[data-testid="ag-omni-aux-switcher"]'), null, 'conversation-view must be excluded');
  assert.equal(asideShell.querySelector('[data-testid="ag-omni-aux-switcher"]'), null, 'aside must be excluded');
  assert.equal(homeShell.querySelector('[data-testid="ag-omni-aux-switcher"]'), null, '.agy-home must be excluded');
  assert.equal(csvShell.querySelector('[data-testid="ag-omni-aux-switcher"]'), null, 'csv-file-viewer must be excluded');
  assert.equal(vidShell.querySelector('[data-testid="ag-omni-aux-switcher"]'), null, '<video> container must be excluded');

  // 2) Normal .html shell auto-activates rendered preview immediately
  const switcher = fileShell.querySelector('[data-testid="ag-omni-aux-switcher"]');
  const iframe = fileShell.querySelector('[data-testid="ag-omni-aux-iframe"]');
  const badge = fileShell.querySelector('[data-testid="ag-omni-sandbox-badge"]');
  assert.ok(switcher, 'Normal .html shell must mount .ag-omni-aux-bar');
  assert.ok(iframe, 'Normal .html shell must auto-activate preview iframe');
  assert.equal(iframe.hidden, false);
  assert.equal(editorBox.style.display, 'none', 'Native source editor must be hidden in preview mode');
  assert.match(iframe.src, /^http:\/\/127\.0\.0\.1:46600\/viewer\?token=tok_b3.*landing%2Findex\.html/);
  assert.match(iframe.src, /kind=html/);
  assert.equal(switcher.children[0].textContent, '预览', 'children[0] must remain Preview button');
  assert.equal(switcher.children[1].textContent, '源码', 'children[1] must remain Source button');

  // 3) Sandbox badge carries full 5+1 anti-translate attributes
  assert.ok(badge, 'Sandbox isolation badge must render for .html/.htm/.svg');
  assert.equal(badge.className, 'ag-omni-sandbox-badge');
  assert.equal(badge.textContent, '沙盒隔离');
  for (const [attr, expected] of [
    ['translate', 'no'],
    ['data-no-translate', 'true'],
    ['data-ag-localization-skip', 'true'],
    ['data-agy-no-translate', 'true'],
    ['data-antigravity-zh-skip', '1'],
    ['data-ag-no-i18n', ''],
  ]) {
    assert.equal(badge.getAttribute(attr), expected, `Sandbox badge must set ${attr}="${expected}"`);
    assert.equal(switcher.getAttribute(attr), expected, `Aux bar must set ${attr}="${expected}"`);
  }

  // 4) All 8 locales update switcher & badge cleanly with 0 CJK in non-CJK locales
  const cjkRe = /[\u3400-\u9FFF\uF900-\uFAFF]/;
  const expectedBadges = {
    'zh-CN': '沙盒隔离',
    'zh-TW': '沙盒隔離',
    en: 'Sandbox Isolated',
    ja: 'サンドボックス隔離',
    ko: '샌드박스 격리',
    es: 'Aislado en sandbox',
    fr: 'Isolé en sandbox',
    de: 'Sandbox-isoliert',
  };
  for (const [lang, expectedBadge] of Object.entries(expectedBadges)) {
    document.documentElement.setAttribute('data-ag-cs-lang', lang);
    client.sync({ omniModule: 'on' });
    assert.equal(badge.textContent, expectedBadge, `Badge text mismatch for ${lang}`);
    if (['en', 'ko', 'es', 'fr', 'de'].includes(lang)) {
      assert.equal(cjkRe.test(badge.textContent), false, `${lang} badge must contain 0 CJK chars`);
      assert.equal(cjkRe.test(switcher.children[0].textContent), false, `${lang} preview btn must contain 0 CJK chars`);
      assert.equal(cjkRe.test(switcher.children[1].textContent), false, `${lang} source btn must contain 0 CJK chars`);
    }
  }
  document.documentElement.setAttribute('data-ag-cs-lang', 'zh-CN');
  client.sync({ omniModule: 'on' });

  // 5) Clicking Source button restores native editor & hides iframe; clicking Preview returns to iframe
  switcher.children[1].click();
  await flushMicrotasks();
  assert.equal(iframe.hidden, true, 'Iframe must hide when switched to Source');
  assert.equal(editorBox.style.display, '', 'Native editor must be restored in Source mode');

  switcher.children[0].click();
  await flushMicrotasks();
  assert.equal(iframe.hidden, false, 'Iframe must reappear when switched back to Preview');
  assert.equal(editorBox.style.display, 'none');

  // 6) Same-slot switch to .htm and then .svg keeps auto-preview & updates viewer kind
  fiberState.memoizedProps = { fileUri: 'file:///projects/demo/legacy/page.htm', tabId: 'file__htm_1' };
  editorBox.appendChild(document.createTextNode(' '));
  await new Promise((r) => setTimeout(r, 90));
  assert.match(fileShell.querySelector('[data-testid="ag-omni-aux-iframe"]').src, /page\.htm/);
  assert.match(fileShell.querySelector('[data-testid="ag-omni-aux-iframe"]').src, /kind=html/);

  fiberState.memoizedProps = { fileUri: 'file:///projects/demo/icons/logo.svg', tabId: 'file__svg_1' };
  editorBox.appendChild(document.createTextNode(' '));
  await new Promise((r) => setTimeout(r, 90));
  const svgIframe = fileShell.querySelector('[data-testid="ag-omni-aux-iframe"]');
  assert.ok(svgIframe);
  assert.match(svgIframe.src, /logo\.svg/);
  assert.match(svgIframe.src, /kind=svg/);
  assert.ok(fileShell.querySelector('[data-testid="ag-omni-sandbox-badge"]'), 'SVG preview must retain sandbox badge');

  // 7) Switching same slot to a normal source file (.ts) cleanly unmounts overlay & restores native editor
  fiberState.memoizedProps = { fileUri: 'file:///projects/demo/src/app.ts', tabId: 'file__ts_1' };
  editorBox.appendChild(document.createTextNode(' '));
  await new Promise((r) => setTimeout(r, 90));
  assert.equal(fileShell.querySelector('[data-testid="ag-omni-aux-switcher"]'), null, 'Switching to .ts must unmount aux bar');
  assert.equal(fileShell.querySelector('[data-testid="ag-omni-aux-iframe"]'), null, 'Switching to .ts must unmount preview iframe');
  assert.equal(editorBox.style.display, '', 'Native editor must be cleanly restored after switching to .ts');

  client.destroy();
});

// ── 6b. 0-rAF Pointer Fast Path, Dialog/Mascot Mutation Filtering & Streaming Debounce ─
test('pointermove takes 0-rAF fast path over non-highlighted DOM, ignores [role="dialog"] unless [data-omni-scan], and routes childList TextNodes to CSS.highlights', async () => {
  const env = createFakeDomEnvironment({ enableCssHighlights: true });
  const { window, document, FakeEvent, setCaretHit } = env;
  mountMockHostRoot(document, { withBrowserCtx: true, withV2: true });

  let rafCalls = 0;
  window.requestAnimationFrame = (cb) => {
    rafCalls += 1;
    const id = rafCalls;
    queueMicrotask(() => cb(Date.now()));
    return id;
  };
  window.cancelAnimationFrame = () => {};

  const resp = document.createElement('div');
  resp.setAttribute('data-testid', 'agent-response');
  const hlPara = document.createElement('p');
  const hlText = document.createTextNode('Visit https://fastpath.example.com/docs now');
  hlPara.appendChild(hlText);
  const plainPara = document.createElement('p');
  plainPara.textContent = 'Plain paragraph without any bare links or file paths';
  resp.appendChild(hlPara);
  resp.appendChild(plainPara);
  document.body.appendChild(resp);

  const client = omniMod.createOmniClient({ window, document });
  client.sync({ omniModule: 'on', linkTarget: 'builtin' }, { baseUrl: 'http://127.0.0.1:47000', token: 'tok_perf' });

  const urlHl = window.CSS.highlights.get('ag-omni-url');
  assert.equal(urlHl.size, 1);

  // 1) Moving pointer across non-highlighted elements schedules ZERO requestAnimationFrame callbacks
  rafCalls = 0;
  for (let i = 0; i < 12; i++) {
    plainPara.dispatchEvent(new FakeEvent('mousemove', { bubbles: true, clientX: 40 + i, clientY: 30 }));
    document.body.dispatchEvent(new FakeEvent('mousemove', { bubbles: true, clientX: 50 + i, clientY: 60 }));
  }
  assert.equal(rafCalls, 0, 'Pointer moving over ordinary non-highlighted elements must return synchronously with 0 rAF');

  // Moving onto highlighted parent schedules rAF and activates hover cursor
  setCaretHit(hlText, 10);
  hlPara.dispatchEvent(new FakeEvent('mousemove', { bubbles: true, clientX: 80, clientY: 20 }));
  assert.equal(rafCalls, 1, 'Pointer over highlighted parent element must schedule 1 rAF');
  await new Promise((r) => queueMicrotask(r));
  assert.equal(document.documentElement.getAttribute('data-ag-omni-hover-token'), '1');

  // Moving back onto plain element clears hover cursor synchronously with 0 new rAF
  plainPara.dispatchEvent(new FakeEvent('mousemove', { bubbles: true, clientX: 40, clientY: 30 }));
  assert.equal(rafCalls, 1, 'Leaving highlighted element to ordinary region must not schedule extra rAF');
  assert.equal(document.documentElement.getAttribute('data-ag-omni-hover-token'), null);

  // 2) Unmarked [role="dialog"], #ag-cs-settings-sec, sidebar rows, smooth caret & mascot nodes are ignored
  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');
  const dialogResp = document.createElement('div');
  dialogResp.setAttribute('data-testid', 'planner-response-text');
  dialogResp.textContent = 'https://ignored-dialog.example.com';
  dialog.appendChild(dialogResp);
  document.body.appendChild(dialog);

  const settingsSec = document.createElement('section');
  settingsSec.id = 'ag-cs-settings-sec';
  const secInner = document.createElement('div');
  secInner.className = 'markdown-body';
  secInner.textContent = 'https://ignored-settings.example.com';
  settingsSec.appendChild(secInner);
  document.body.appendChild(settingsSec);

  const sidebarRow = document.createElement('button');
  sidebarRow.setAttribute('data-testid', 'conversation-row-sidebar');
  sidebarRow.textContent = 'https://ignored-sidebar.example.com';
  document.body.appendChild(sidebarRow);

  const mascot = document.createElement('div');
  mascot.className = 'ag-v2-mascot-actor ag-v2-chroma-fx ag-cs-smooth-caret';
  mascot.textContent = 'https://ignored-mascot.example.com';
  document.body.appendChild(mascot);

  await new Promise((r) => setTimeout(r, 90));
  assert.equal(urlHl.size, 1, 'Mutations in unmarked [role="dialog"], #ag-cs-settings-sec, sidebar & mascot must be skipped');

  // Explicitly opted-in [role="dialog"][data-omni-scan="true"] is still scanned!
  const optInDialog = document.createElement('div');
  optInDialog.setAttribute('role', 'dialog');
  optInDialog.setAttribute('data-omni-scan', 'true');
  optInDialog.appendChild(document.createTextNode('Opt-in https://dialog-optin.example.com/ok'));
  document.body.appendChild(optInDialog);

  await new Promise((r) => setTimeout(r, 150));
  assert.equal(urlHl.size, 2, 'Dialog explicitly marked with data-omni-scan="true" must still be highlighted');

  // 3) Streaming childList new TextNode routes through 480ms text highlight debounce
  document.documentElement.setAttribute('data-ag-cs-stream-active', '1');
  const streamedText = document.createTextNode('Streamed https://streamed-fast.example.com/v1');
  plainPara.appendChild(streamedText);
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(urlHl.size, 2, 'Streaming TextNode highlight must debounce past 200ms (480ms window)');
  await new Promise((r) => setTimeout(r, 340));
  assert.equal(urlHl.size, 3, 'Streaming TextNode must highlight cleanly after 480ms debounce');

  client.destroy();
});

// ── 7. CSS Token Alignment, Zero Legacy Dock Residue, vm.Script & Bundle Budget ─
test('omni-client.js has zero persist:ag-prism-omni or custom dock creation, aligns style.css tokens, passes vm.Script + buildOmniClientExpression', () => {
  const clientCode = fs.readFileSync(CLIENT_PATH, 'utf8');
  const testCode = fs.readFileSync(path.join(__dirname, 'omni-client.test.mjs'), 'utf8');

  assert.equal(clientCode.includes('persist:ag-prism-omni'), false, 'Must not contain rogue WCV partition');
  assert.equal(clientCode.includes('ensureDockMounted'), false, 'Must not contain custom dock builder');

  const lines = clientCode.split('\n');
  const emptyRatio = lines.filter((l) => !l.trim()).length / lines.length;
  assert.ok(emptyRatio < 0.12, `Expected clean low blank-line ratio (< 12%), got ${(emptyRatio * 100).toFixed(1)}%`);
  assert.equal(/\n\n\n/.test(clientCode), false, 'Must not contain consecutive blank line bloat');

  assert.match(clientCode, /--ag-cs-accent/);
  assert.match(clientCode, /--ag-cs-r-lg|--ag-cs-r-sm/);
  assert.match(clientCode, /--ag-cs-popover-bg/);
  assert.match(clientCode, /--ag-cs-mono-stack/);
  assert.equal(/--ag-accent\b|--ag-radius-md\b|--ag-code-font-family\b/.test(clientCode), false);

  assert.doesNotThrow(() => new vm.Script(clientCode, { filename: 'omni-client.js' }));

  const forbiddenPatterns = [
    new RegExp(['work', 'space_program'].join(''), 'i'),
    new RegExp(['Users', '\\\\', 'Administrator'].join(''), 'i'),
    new RegExp(['ema', '_persona'].join(''), 'i'),
    new RegExp(['\\bsk', '-[A-Za-z0-9]{12,}'].join('')),
  ];
  for (const re of forbiddenPatterns) {
    assert.equal(re.test(clientCode), false, `Forbidden pattern ${re} matched in omni-client.js`);
    assert.equal(re.test(testCode), false, `Forbidden pattern ${re} matched in omni-client.test.mjs`);
  }

  const cdp = require(path.join(ROOT_DIR, 'cdp.js'));
  const staticExpr = cdp.buildInjectExpression(cdp.DEFAULT_CONFIG);
  assert.ok(Buffer.byteLength(staticExpr, 'utf8') < 690 * 1024);

  if (typeof cdp.buildOmniClientExpression === 'function') {
    const omniExpr = cdp.buildOmniClientExpression({ baseUrl: 'http://127.0.0.1:48123', token: 'tok_2nd' });
    assert.doesNotThrow(() => new vm.Script(omniExpr, { filename: 'omni-2nd-channel.js' }));
    const env = createFakeDomEnvironment({ enableCssHighlights: true });
    env.document.title = 'Antigravity';
    const ctx = vm.createContext({
      window: env.window,
      document: env.document,
      globalThis: env.window,
      setTimeout,
      clearTimeout,
      queueMicrotask,
      Promise,
    });
    const res = vm.runInContext(omniExpr, ctx);
    assert.equal(res.ok, true);
    assert.equal(env.window.__agPrismOmni?.getState().highlightMode, 'css-highlights');
    env.window.__agPrismOmni.destroy();
  }
});

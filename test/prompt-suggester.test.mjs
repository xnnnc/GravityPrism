import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import {
  ALLOWED_SUGGESTER_ACTIONS,
  PromptSuggesterService,
  curateChatModelList,
  detectConversationLang,
  parseSingleSuggestion,
  sanitizeConversationTurns,
  sanitizeSuggesterConfig,
} from '../vendor/prompt-suggester/suggester-service.mjs';
import {
  PrismDaemon,
  SUGGESTER_BINDING,
  THOUGHT_BINDING,
} from '../sidecars/daemon/main.mjs';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const cdp = require(path.join(ROOT_DIR, 'cdp.js'));

const CJK_RE = /[\u3400-\u9FFF\uF900-\uFAFF]/;

// 轻量 FakeDOM 工厂：支持标签+属性、复合选择器、捕获/冒泡事件及可选 Observer/Listener 计数探针
function createFakeSuggesterDom(opts = {}) {
  const {
    lang = 'zh-CN',
    withMutationObserverSpy = false,
    withComposer = true,
  } = opts;

  class FakeElement {
    constructor(tagName, ownerDocument) {
      this.tagName = String(tagName || 'DIV').toUpperCase();
      this.nodeType = 1;
      this.ownerDocument = ownerDocument;
      this.parentNode = null;
      this.childNodes = [];
      this.attributes = new Map();
      this.listeners = new Map();
      this.className = '';
      this.id = '';
      this.hidden = false;
      this.isConnected = true;
      this._text = '';
      const styleMap = new Map();
      this.style = {
        display: '',
        visibility: '',
        opacity: '',
        setProperty: (k, v) => styleMap.set(k, String(v)),
        getPropertyValue: (k) => styleMap.get(k) || '',
        removeProperty: (k) => styleMap.delete(k),
      };
    }
    get parentElement() {
      return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null;
    }
    get firstChild() {
      return this.childNodes[0] || null;
    }
    get lastElementChild() {
      for (let i = this.childNodes.length - 1; i >= 0; i--) {
        if (this.childNodes[i].nodeType === 1) return this.childNodes[i];
      }
      return null;
    }
    get nextSibling() {
      if (!this.parentNode) return null;
      const idx = this.parentNode.childNodes.indexOf(this);
      return idx >= 0 ? this.parentNode.childNodes[idx + 1] || null : null;
    }
    get textContent() {
      if (this.childNodes.length === 0) return this._text;
      return this.childNodes.map((c) => (c.nodeType === 3 ? c.nodeValue : c.textContent)).join('');
    }
    set textContent(v) {
      this.childNodes = [];
      this._text = String(v ?? '');
    }
    setAttribute(k, v) {
      const val = String(v);
      this.attributes.set(k, val);
      if (k === 'id') this.id = val;
      if (k === 'class') this.className = val;
    }
    getAttribute(k) {
      if (k === 'id' && this.id) return this.id;
      if (k === 'class' && this.className) return this.className;
      return this.attributes.has(k) ? this.attributes.get(k) : null;
    }
    hasAttribute(k) {
      return this.attributes.has(k);
    }
    removeAttribute(k) {
      this.attributes.delete(k);
      if (k === 'id') this.id = '';
      if (k === 'class') this.className = '';
    }
    appendChild(child) {
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      child.isConnected = true;
      this.childNodes.push(child);
      return child;
    }
    removeChild(child) {
      const idx = this.childNodes.indexOf(child);
      if (idx >= 0) {
        this.childNodes.splice(idx, 1);
        child.parentNode = null;
        child.isConnected = false;
      }
      return child;
    }
    remove() {
      if (this.parentNode) this.parentNode.removeChild(this);
    }
    contains(other) {
      let cur = other;
      while (cur) {
        if (cur === this) return true;
        cur = cur.parentNode;
      }
      return false;
    }
    matches(sel) {
      return sel.split(',').some((raw) => {
        const s = raw.trim();
        if (!s) return false;
        if (s.startsWith('#') && !s.includes(' ') && !s.includes('[')) return this.id === s.slice(1);
        if (s.startsWith('.') && !s.includes(' ') && !s.includes('[')) {
          return this.className.split(/\s+/).includes(s.slice(1));
        }
        const tagAttrEq = /^([a-zA-Z0-9_-]+)\[([^=\]]+)="([^"]*)"\]$/.exec(s);
        if (tagAttrEq) {
          return this.tagName === tagAttrEq[1].toUpperCase() && this.getAttribute(tagAttrEq[2]) === tagAttrEq[3];
        }
        const tagAttrHas = /^([a-zA-Z0-9_-]+)\[([^=\]]+)\]$/.exec(s);
        if (tagAttrHas) {
          return this.tagName === tagAttrHas[1].toUpperCase() && this.hasAttribute(tagAttrHas[2]);
        }
        const attrEq = /^\[([^=\]]+)="([^"]*)"\]$/.exec(s);
        if (attrEq) return this.getAttribute(attrEq[1]) === attrEq[2];
        const attrHas = /^\[([^=\]]+)\]$/.exec(s);
        if (attrHas) return this.hasAttribute(attrHas[1]);
        const attrPrefixAndEq = /^\[([a-zA-Z0-9_-]+)\^="([^"]*)"\]\[([^=\]]+)="([^"]*)"\]$/.exec(s);
        if (attrPrefixAndEq) {
          const v = this.getAttribute(attrPrefixAndEq[1]) || '';
          return v.startsWith(attrPrefixAndEq[2]) && this.getAttribute(attrPrefixAndEq[3]) === attrPrefixAndEq[4];
        }
        const compoundCls = /^\.([\w-]+)\s+\.([\w-]+)$/.exec(s);
        if (compoundCls) {
          return (
            this.className.split(/\s+/).includes(compoundCls[2]) &&
            Boolean(this.parentElement?.closest(`.${compoundCls[1]}`))
          );
        }
        const compound = /^\.([\w-]+)\s+\[([^=\]]+)="([^"]*)"\]$/.exec(s);
        if (compound) {
          return (
            this.getAttribute(compound[2]) === compound[3] &&
            Boolean(this.closest(`.${compound[1]}`))
          );
        }
        return this.tagName === s.toUpperCase();
      });
    }
    closest(sel) {
      let cur = this;
      while (cur && cur.nodeType === 1) {
        if (cur.matches(sel)) return cur;
        cur = cur.parentElement;
      }
      return null;
    }
    querySelectorAll(sel) {
      const out = [];
      const visit = (n) => {
        for (const c of n.childNodes) {
          if (c.nodeType === 1) {
            if (c.matches(sel)) out.push(c);
            visit(c);
          }
        }
      };
      visit(this);
      return out;
    }
    querySelector(sel) {
      return this.querySelectorAll(sel)[0] || null;
    }
    addEventListener(type, fn, optsArg) {
      const cap = Boolean(typeof optsArg === 'object' ? optsArg?.capture : optsArg);
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push({ fn, cap });
    }
    removeEventListener(type, fn, optsArg) {
      const cap = Boolean(typeof optsArg === 'object' ? optsArg?.capture : optsArg);
      const arr = this.listeners.get(type);
      if (!arr) return;
      this.listeners.set(
        type,
        arr.filter((x) => !(x.fn === fn && x.cap === cap))
      );
    }
    dispatchEvent(ev) {
      ev.target = ev.target || this;
      const chain = [];
      let cur = this;
      while (cur) {
        chain.unshift(cur);
        cur = cur.parentNode || (cur !== this.ownerDocument ? this.ownerDocument : null);
      }
      for (const node of chain) {
        const list = node.listeners?.get(ev.type) || [];
        for (const item of [...list]) {
          if (item.cap) {
            item.fn(ev);
            if (ev._immediateStopped) return !ev.defaultPrevented;
          }
        }
        if (ev._stopped) return !ev.defaultPrevented;
      }
      for (let i = chain.length - 1; i >= 0; i--) {
        const list = chain[i].listeners?.get(ev.type) || [];
        for (const item of [...list]) {
          if (!item.cap) {
            item.fn(ev);
            if (ev._immediateStopped) return !ev.defaultPrevented;
          }
        }
        if (ev._stopped) return !ev.defaultPrevented;
      }
      return !ev.defaultPrevented;
    }
    focus() {
      this.ownerDocument.activeElement = this;
    }
  }

  let execCommandCount = 0;
  let lexicalDispatchCount = 0;
  let insertedBuffer = '';
  let lexicalEl = null;

  const docListenerStats = {
    captureAdded: 0,
    captureRemoved: 0,
    get activeCaptureCount() {
      let n = 0;
      for (const arr of fakeDoc.listeners.values()) {
        for (const item of arr) {
          if (item.cap) n += 1;
        }
      }
      return n;
    },
  };

  const fakeDoc = {
    nodeType: 9,
    readyState: 'complete',
    listeners: new Map(),
    activeElement: null,
    execCommand(cmd, _ui, val) {
      if (cmd === 'insertText' && lexicalEl) {
        execCommandCount += 1;
        Promise.resolve().then(() => {
          insertedBuffer += val;
          lexicalEl.__lexicalTextContent = insertedBuffer;
          lexicalEl.textContent = insertedBuffer;
        });
        return true;
      }
      return false;
    },
    createElement(tag) {
      return new FakeElement(tag, fakeDoc);
    },
    createElementNS(_ns, tag) {
      return new FakeElement(tag, fakeDoc);
    },
    createTextNode(v) {
      return { nodeType: 3, nodeValue: String(v) };
    },
    addEventListener(type, fn, optsArg) {
      const cap = Boolean(typeof optsArg === 'object' ? optsArg?.capture : optsArg);
      if (cap) docListenerStats.captureAdded += 1;
      return FakeElement.prototype.addEventListener.call(this, type, fn, optsArg);
    },
    removeEventListener(type, fn, optsArg) {
      const cap = Boolean(typeof optsArg === 'object' ? optsArg?.capture : optsArg);
      if (cap) docListenerStats.captureRemoved += 1;
      return FakeElement.prototype.removeEventListener.call(this, type, fn, optsArg);
    },
    getElementById(id) {
      if (fakeDoc.documentElement.id === id) return fakeDoc.documentElement;
      return fakeDoc.documentElement.querySelector(`#${id}`);
    },
    querySelector(sel) {
      if (fakeDoc.documentElement.matches(sel)) return fakeDoc.documentElement;
      return fakeDoc.documentElement.querySelector(sel);
    },
    querySelectorAll(sel) {
      const out = [];
      if (fakeDoc.documentElement.matches(sel)) out.push(fakeDoc.documentElement);
      return out.concat(fakeDoc.documentElement.querySelectorAll(sel));
    },
  };

  fakeDoc.documentElement = new FakeElement('html', fakeDoc);
  if (lang) fakeDoc.documentElement.setAttribute('data-ag-cs-lang', lang);
  fakeDoc.head = new FakeElement('head', fakeDoc);
  fakeDoc.body = new FakeElement('body', fakeDoc);
  fakeDoc.documentElement.appendChild(fakeDoc.head);
  fakeDoc.documentElement.appendChild(fakeDoc.body);

  let convView = null;
  let composer = null;
  let caretHost = null;
  let footer = null;
  let sgSlot = null;

  if (withComposer) {
    convView = fakeDoc.createElement('div');
    convView.setAttribute('data-testid', 'conversation-view');
    convView.setAttribute('data-cascade-id', 'cascade-a');
    const uMsg = fakeDoc.createElement('div');
    uMsg.setAttribute('data-testid', 'user-message-content');
    uMsg.appendChild(fakeDoc.createTextNode('验证4060迁移效果'));
    convView.appendChild(uMsg);
    fakeDoc.body.appendChild(convView);

    composer = fakeDoc.createElement('div');
    composer.className = 'surface-composer';
    caretHost = fakeDoc.createElement('div');
    caretHost.setAttribute('data-ag-cs-caret-host', '1');
    lexicalEl = fakeDoc.createElement('div');
    lexicalEl.setAttribute('contenteditable', 'true');
    lexicalEl.setAttribute('data-lexical-editor', 'true');
    lexicalEl.__lexicalTextContent = '';
    const ctrlCmd = { type: 'CONTROLLED_TEXT_INSERTION_COMMAND' };
    lexicalEl.__lexicalEditor = {
      _commands: new Map([[ctrlCmd, true]]),
      focus() {
        lexicalEl.focus();
      },
      dispatchCommand(cmd, payload) {
        if (cmd === ctrlCmd) {
          lexicalDispatchCount += 1;
          Promise.resolve().then(() => {
            insertedBuffer += payload;
            lexicalEl.__lexicalTextContent = insertedBuffer;
            lexicalEl.textContent = insertedBuffer;
          });
          return true;
        }
        return false;
      },
    };
    const placeholder = fakeDoc.createElement('p');
    placeholder.setAttribute('data-ag-cs-placeholder', '描述任务或提出问题');
    caretHost.appendChild(lexicalEl);
    caretHost.appendChild(placeholder);

    footer = fakeDoc.createElement('div');
    footer.className = 'agy-composer-footer';
    composer.appendChild(caretHost);
    composer.appendChild(footer);
    fakeDoc.body.appendChild(composer);
  }

  sgSlot = fakeDoc.createElement('div');
  sgSlot.setAttribute('data-testid', 'prism-suggester-slot');
  sgSlot.hidden = true;
  sgSlot.style.display = 'none';
  fakeDoc.body.appendChild(sgSlot);

  const observerStats = {
    created: 0,
    observed: 0,
    disconnected: 0,
    active: 0,
  };

  class FakeMutationObserver {
    constructor(cb) {
      this._cb = cb;
      this._observing = false;
      observerStats.created += 1;
    }
    observe() {
      if (!this._observing) {
        this._observing = true;
        observerStats.observed += 1;
        observerStats.active += 1;
      }
    }
    disconnect() {
      if (this._observing) {
        this._observing = false;
        observerStats.disconnected += 1;
        observerStats.active = Math.max(0, observerStats.active - 1);
      }
    }
  }

  class FakeEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.bubbles = Boolean(init.bubbles);
      this.defaultPrevented = false;
    }
    preventDefault() {
      this.defaultPrevented = true;
    }
    stopPropagation() {
      this._stopped = true;
    }
    stopImmediatePropagation() {
      this._immediateStopped = true;
      this._stopped = true;
    }
  }

  let fakeNow = 1_000_000;
  const fakeWin = {
    document: fakeDoc,
    Date: { now: () => fakeNow },
    location: { href: 'vscode-file://vscode-app/workbench.html' },
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
    Event: FakeEvent,
    ...(withMutationObserverSpy ? { MutationObserver: FakeMutationObserver } : {}),
  };
  fakeWin.window = fakeWin;
  fakeWin.self = fakeWin;
  fakeWin.top = fakeWin;
  fakeDoc.defaultView = fakeWin;

  return {
    FakeElement,
    fakeDoc,
    fakeWin,
    convView,
    composer,
    caretHost,
    lexicalEl,
    footer,
    sgSlot,
    observerStats,
    docListenerStats,
    getNow: () => fakeNow,
    advanceNow: (ms) => {
      fakeNow += ms;
    },
    getCounts: () => ({ execCommandCount, lexicalDispatchCount, insertedBuffer }),
    resetInserted: () => {
      insertedBuffer = '';
      if (lexicalEl) {
        lexicalEl.__lexicalTextContent = '';
        lexicalEl.textContent = '';
      }
    },
  };
}

test('Channel 1 stays strictly < 550,000 B and Channel 11 suggester sources obey 0 innerHTML, 0 :has(), pure ASCII CSS, and 0 brand name-dropping', () => {
  const ch1 = cdp.buildInjectExpression();
  const ch1Bytes = Buffer.byteLength(ch1, 'utf8');
  assert.ok(ch1Bytes < 580000, `Expected Channel 1 < 580,000 B, got ${ch1Bytes} B`);

  const ch11 = cdp.buildSuggesterExpression();
  assert.ok(ch11.length > 1000, 'Expected non-empty Channel 11 expression');
  new vm.Script(ch11);
  new vm.Script(cdp.SUGGESTER_REMOVE_EXPRESSION);

  for (const rel of [
    'vendor/prompt-suggester/suggester-client.js',
    'vendor/prompt-suggester/suggester-settings-ui.js',
    'vendor/prompt-suggester/suggester-service.mjs',
  ]) {
    const src = fs.readFileSync(path.join(ROOT_DIR, rel), 'utf8');
    const codeOnly = src.replace(/\/\/.*$/gm, '');
    assert.equal(/\binnerHTML\b/.test(codeOnly), false, `${rel} must not use innerHTML`);
    assert.equal(/:has\s*\(/.test(codeOnly), false, `${rel} must not use :has() selectors`);
    assert.equal(/t3\s*code/i.test(src), false, `${rel} must not expose third-party product names`);
    assert.equal(/Channel\s+8/i.test(src), false, `${rel} must use Channel 11 instead of legacy Channel 8`);
  }

  const clientSrc = fs.readFileSync(
    path.join(ROOT_DIR, 'vendor', 'prompt-suggester', 'suggester-client.js'),
    'utf8'
  );
  const cssBlockMatch = clientSrc.match(/const SUGGESTER_CSS = \[([\s\S]*?)\]\.join/);
  assert.ok(cssBlockMatch, 'Expected SUGGESTER_CSS block');
  assert.equal(/[^\x00-\x7F]/.test(cssBlockMatch[1]), false, 'SUGGESTER_CSS must be pure ASCII');

  // 确认 daemon SUGGESTER_ALLOWED_ACTIONS 与 ALLOWED_SUGGESTER_ACTIONS 1:1 对齐
  const daemonSrc = fs.readFileSync(path.join(ROOT_DIR, 'sidecars', 'daemon', 'main.mjs'), 'utf8');
  const allowMatch = daemonSrc.match(/const SUGGESTER_ALLOWED_ACTIONS = new Set\(\[([\s\S]*?)\]\);/);
  assert.ok(allowMatch, 'Expected SUGGESTER_ALLOWED_ACTIONS in daemon main.mjs');
  const daemonActions = Array.from(allowMatch[1].matchAll(/'([^']+)'/g), (m) => m[1]).sort();
  assert.deepEqual(daemonActions, Array.from(ALLOWED_SUGGESTER_ACTIONS).sort());

  // 确认 settings-panel.js 在 Beta 分组中挂载 prism-suggester-slot，且 Channel 9 按需加载包含 __prismMountSg 兜底
  const panelSrc = fs.readFileSync(path.join(ROOT_DIR, 'settings-panel.js'), 'utf8');
  assert.ok(
    /if\s*\(grp\.id\s*===\s*'beta'\)\s*\{\s*sgSlot\s*=/.test(panelSrc),
    'prism-suggester-slot must be mounted inside the Beta settings group'
  );
  const ch9 = cdp.buildSettingsChannelExpression();
  assert.ok(ch9.includes('__prismMountSg'), 'Channel 9 buildSettingsChannelExpression must call __prismMountSg fallback');
});

test('Fail-Closed: sanitizeSuggesterConfig({}) and empty/corrupt disk config strictly default to enabled: false', async () => {
  assert.equal(sanitizeSuggesterConfig({}).enabled, false, 'Empty object must default to enabled: false');
  assert.equal(sanitizeSuggesterConfig(null).enabled, false, 'Null input must default to enabled: false');
  assert.equal(
    sanitizeSuggesterConfig({ ttlMinutes: 20, activeProfileId: 'p1' }).enabled,
    false,
    'Config omitting enabled must NEVER fail-open to enabled: true'
  );
  assert.equal(sanitizeSuggesterConfig({ enabled: true }).enabled, true);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-sg-failclosed-'));
  try {
    const cfgPath = path.join(tmpDir, 'obsidian-prism-suggester.json');
    let upstreamCalls = 0;
    const mockTr = {
      loadStore: () => ({ activeProfileId: 'p1', profiles: [{ id: 'p1', name: 'P1', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', apiKey: 'sk-test1234567890' }] }),
      _resolveEffectiveCredentials: () => ({ baseUrl: 'https://api.openai.com/v1', baseUrlError: '', apiKey: 'sk-test1234567890', model: 'gpt-4o-mini' }),
      async _request() {
        upstreamCalls += 1;
        return { ok: true, status: 200, async text() { return '{}'; } };
      },
    };

    // 空 JSON 对象落盘
    fs.writeFileSync(cfgPath, '{}', 'utf8');
    const svc1 = new PromptSuggesterService({ configDir: tmpDir, translatorService: mockTr });
    assert.equal(svc1.loadConfig().enabled, false);
    const r1 = await svc1.handleAction('suggest', { turns: [{ role: 'assistant', text: 'Done.' }], lang: 'en' });
    assert.equal(r1.ok, false);
    assert.equal(r1.reason, 'disabled');
    assert.equal(upstreamCalls, 0);

    // 损坏 JSON 落盘
    fs.writeFileSync(cfgPath, '{corrupted json', 'utf8');
    const svc2 = new PromptSuggesterService({ configDir: tmpDir, translatorService: mockTr });
    assert.equal(svc2.loadConfig().enabled, false);
    const r2 = await svc2.handleAction('suggest', { turns: [{ role: 'assistant', text: 'Done.' }], lang: 'en' });
    assert.equal(r2.ok, false);
    assert.equal(r2.reason, 'disabled');
    assert.equal(upstreamCalls, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('PromptSuggesterService shares profiles bidirectionally while keeping independent activeProfileId, supports fetch-models, and redacts secrets across all profiles', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-sg-svc-'));
  try {
    // 1) Beta 默认严格关闭（enabled: false -> 0 意外 API 请求）
    const unconfSvc = new PromptSuggesterService({
      configDir: tmpDir,
      translatorService: {
        loadStore: () => ({ activeProfileId: 'empty', profiles: [{ id: 'empty', name: 'Default' }] }),
        _resolveEffectiveCredentials: () => ({
          baseUrl: 'https://api.openai.com/v1',
          baseUrlError: '',
          apiKey: '',
          model: '',
        }),
      },
    });
    assert.equal(unconfSvc.loadConfig().enabled, false, 'Beta feature must default to enabled: false');
    const disabledByDefaultRes = await unconfSvc.handleAction('suggest', {
      turns: [{ role: 'assistant', text: '需要继续吗？' }],
      lang: 'zh-CN',
    });
    assert.equal(disabledByDefaultRes.ok, false);
    assert.equal(disabledByDefaultRes.reason, 'disabled');

    // 1b) 开启但未配置密钥 -> 返回 ai-not-configured
    unconfSvc.saveConfig({ enabled: true });
    const unconfRes = await unconfSvc.handleAction('suggest', {
      turns: [{ role: 'assistant', text: '需要继续吗？' }],
      lang: 'zh-CN',
    });
    assert.equal(unconfRes.ok, false);
    assert.equal(unconfRes.reason, 'ai-not-configured');
    assert.equal(unconfRes.suggestion, undefined);

    // 2) 共享凭据池：多渠道联合脱敏 + 模型 ID 独立保存
    let upstreamCalls = 0;
    let lastBody = null;
    const sharedStore = {
      activeProfileId: 'p1',
      profiles: [
        {
          id: 'p1',
          name: 'Gemini AI Studio',
          baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
          model: 'gemini-flash-lite-latest',
          apiKey: 'AIzaSySecretTestKey1234567890',
        },
        {
          id: 'p2',
          name: 'Custom Relay',
          baseUrl: 'https://relay.example.com/v1',
          model: 'custom-fast',
          apiKey: 'custom-nonstandard-token-987654321',
        },
      ],
    };

    const mockTranslator = {
      loadStore: () => sharedStore,
      getSanitizedConfig: () => ({
        ok: true,
        activeProfileId: sharedStore.activeProfileId,
        profiles: sharedStore.profiles.map((p) => ({
          id: p.id,
          name: p.name,
          baseUrl: p.baseUrl,
          model: p.model,
          hasApiKey: Boolean(p.apiKey),
          maskedKey: p.apiKey ? '••••' : '',
        })),
      }),
      saveConfig(input = {}) {
        const prevMap = new Map(sharedStore.profiles.map((p) => [p.id, p]));
        sharedStore.activeProfileId = input.activeProfileId || sharedStore.activeProfileId;
        sharedStore.profiles = input.profiles.map((p) => ({
          id: p.id,
          name: p.name,
          baseUrl: p.baseUrl,
          model: p.model,
          apiKey: p.apiKey || (p.keepExistingKey ? prevMap.get(p.id)?.apiKey || '' : ''),
        }));
        return { ok: true };
      },
      async fetchModels() {
        return { ok: true, count: 2, latencyMs: 12, models: ['gemini-3-flash-preview', 'gemini-flash-lite-latest'] };
      },
      _resolveEffectiveCredentials(input = {}) {
        const target = sharedStore.profiles.find((p) => p.id === (input.profileId || sharedStore.activeProfileId));
        if (target) {
          return {
            baseUrl: target.baseUrl,
            baseUrlError: '',
            apiKey: target.apiKey,
            model: input.model || target.model,
          };
        }
        return { baseUrl: 'https://api.openai.com/v1', baseUrlError: '', apiKey: '', model: '' };
      },
      async _request(_url, init) {
        upstreamCalls += 1;
        lastBody = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify({
              choices: [
                {
                  message: {
                    content: '本地4060的实验跑完了，帮我看一下结果，这个方向还值得继续做吗？',
                  },
                },
              ],
            });
          },
        };
      },
    };

    const svc = new PromptSuggesterService({
      configDir: tmpDir,
      translatorService: mockTranslator,
    });

    const saveRes = await svc.handleAction('save-config', {
      enabled: true,
      activeProfileId: 'p1',
      profiles: [
        {
          id: 'p1',
          name: 'Gemini AI Studio',
          baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
          model: 'gemini-3-flash-preview',
          apiKey: '',
          keepExistingKey: true,
        },
        {
          id: 'p2',
          name: 'Custom Relay',
          baseUrl: 'https://relay.example.com/v1',
          model: 'custom-fast',
          apiKey: '',
          keepExistingKey: true,
        },
      ],
    });
    assert.equal(saveRes.ok, true);
    assert.equal(
      sharedStore.profiles[0].model,
      'gemini-flash-lite-latest',
      'Modifying model in Suggester MUST NOT overwrite Thought Translator model on the same provider!'
    );
    assert.equal(saveRes.profiles[0].model, 'gemini-3-flash-preview');
    assert.equal(saveRes.backend.model, 'gemini-3-flash-preview');

    const modelsRes = await svc.handleAction('fetch-models', { profileId: 'p1' });
    assert.equal(modelsRes.ok, true);
    assert.deepEqual(modelsRes.models, ['gemini-3-flash-preview', 'gemini-flash-lite-latest']);

    const turns = [
      {
        role: 'user',
        text: '帮我接入 key AIzaSySecretTestKey1234567890、sk-abcdef1234567890 与 custom-nonstandard-token-987654321',
      },
      { role: 'assistant', text: '跑完后，把同轮 L4/4060 对照表和两条时间线发给我就够了。' },
    ];

    const res1 = await svc.handleAction('suggest', { turns, lang: 'zh-CN' });
    assert.equal(res1.ok, true);
    assert.equal(res1.engine, 'ai');
    assert.equal(res1.profileName, 'Gemini AI Studio');
    assert.equal(res1.suggestion, '本地4060的实验跑完了，帮我看一下结果，这个方向还值得继续做吗？');
    assert.equal(upstreamCalls, 1);

    assert.equal(lastBody.model, 'gemini-3-flash-preview');
    assert.equal(lastBody.reasoning_effort, 'low');
    assert.ok(lastBody.messages.length >= 3);

    const sentUserContent = JSON.stringify(lastBody.messages);
    assert.equal(sentUserContent.includes('AIzaSySecretTestKey1234567890'), false);
    assert.equal(sentUserContent.includes('sk-abcdef1234567890'), false);
    assert.equal(
      sentUserContent.includes('custom-nonstandard-token-987654321'),
      false,
      'All saved profile apiKeys (even non-active profiles) must be redacted from turns'
    );
    assert.ok(sentUserContent.includes('***REDACTED***'));

    const res2 = await svc.handleAction('suggest', { turns, lang: 'zh-CN' });
    assert.equal(res2.ok, true);
    assert.equal(res2.cached, true);
    assert.equal(upstreamCalls, 1);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('parseSingleSuggestion cleans output and detectConversationLang supports 8 languages without yue', () => {
  assert.equal(
    parseSingleSuggestion('太厉害了！帮我跑一下单元测试看看'),
    '帮我跑一下单元测试看看'
  );
  assert.equal(
    parseSingleSuggestion('Awesome! Run the test suite next\nSecond unwanted line'),
    'Run the test suite next'
  );
  assert.equal(parseSingleSuggestion('[实验数据或运行结果]'), '');
  assert.equal(
    parseSingleSuggestion('我去设置里看下现在Beta内容里的配置是不是清爽多了。'),
    '',
    'Self-action monologue MUST be rejected — suggestions must be prompts for the AI'
  );
  assert.equal(
    detectConversationLang([{ role: 'user', text: '你认为哪种模型提供方案好' }], 'zh-CN'),
    'zh-CN',
    'Simplified Chinese containing 方案 must NEVER be misclassified as zh-TW'
  );
  assert.equal(
    detectConversationLang([{ role: 'user', text: '請幫我檢查這個設定與驗證結果' }], 'zh-CN'),
    'zh-TW'
  );
  assert.equal(detectConversationLang([{ role: 'user', text: 'テストを実行してください' }]), 'ja');
  assert.equal(detectConversationLang([{ role: 'user', text: '단위 테스트를 실행해 주세요' }]), 'ko');
  assert.equal(
    detectConversationLang([{ role: 'user', text: 'Ejecuta las pruebas unitarias ahora' }], 'es'),
    'es',
    'Spanish fallback must NOT be overwritten to en by latinWords >= 2'
  );
  assert.equal(
    detectConversationLang([{ role: 'user', text: 'Lance les tests unitaires maintenant' }], 'fr'),
    'fr',
    'French fallback must NOT be overwritten to en by latinWords >= 2'
  );
  assert.equal(
    detectConversationLang([{ role: 'user', text: 'Fuehre bitte die Tests aus' }], 'de'),
    'de',
    'German fallback must NOT be overwritten to en by latinWords >= 2'
  );
  assert.notEqual(
    detectConversationLang([{ role: 'user', text: '咁樣做唔好意思啊喺邊度' }], 'yue'),
    'yue',
    'Legacy yue must NEVER be returned'
  );
  assert.equal(sanitizeConversationTurns([{ role: 'user', text: 'hello' }]).length, 1);

  const curated = curateChatModelList([
    'antigravity-preview-latest',
    'aqa',
    'deep-research-preview-04-2026',
    'gemini-2.5-computer-use-preview-10-2025',
    'gemini-2.5-pro',
    'gemini-2.5-flash-image',
    'gemini-2.5-flash-native-audio-latest',
    'gemini-2.5-flash-preview-tts',
    'gemini-3-flash-preview',
    'gemini-embedding-001',
    'lyria-3.5',
    'genie-4',
    'whisper-1',
    'dall-e-3',
  ]);
  assert.deepEqual(
    curated,
    ['gemini-3-flash-preview', 'gemini-2.5-pro'],
    'Non-chat models must be filtered out and fast models ranked first'
  );
  assert.deepEqual(
    curateChatModelList(['custom-local-embedding-only']),
    ['custom-local-embedding-only'],
    'Safety fallback: never return empty list when a custom endpoint only has non-standard names'
  );
});

test('Auto-only Ghost UI: zero ✨ button, fires strictly ONCE after reply completion, and zero double-insertion on Tab', async () => {
  const dom = createFakeSuggesterDom({ lang: 'zh-CN' });
  const { fakeDoc, fakeWin, convView, lexicalEl, footer, sgSlot } = dom;

  // 植入旧版 ✨ 按钮，验证启动时自动清除
  const legacySparkle = fakeDoc.createElement('button');
  legacySparkle.setAttribute('data-testid', 'prism-suggest-trigger');
  footer.appendChild(legacySparkle);

  let suggestRpcCount = 0;
  const EXPECTED = '本地4060的实验跑完了，帮我看一下结果，这个方向还值得继续做吗？';
  const storedCfg = { enabled: true, ttlMinutes: 15 };
  fakeWin.__agPrismSuggestCall = (rawPayload) => {
    const msg = JSON.parse(rawPayload);
    setTimeout(() => {
      if (msg.action === 'get-config') {
        fakeWin.__agPrismSuggesterResolve(msg.id, {
          ok: true,
          config: storedCfg,
          backend: { aiReady: true, profileName: 'Gemini AI Studio', model: 'gemini-3-flash-preview' },
        });
      } else if (msg.action === 'suggest') {
        suggestRpcCount += 1;
        fakeWin.__agPrismSuggesterResolve(msg.id, {
          ok: true,
          engine: 'ai',
          suggestion: EXPECTED,
        });
      } else {
        fakeWin.__agPrismSuggesterResolve(msg.id, { ok: true });
      }
    }, 5);
  };

  const ctx = vm.createContext(fakeWin);
  const evalRes = vm.runInContext(cdp.buildSuggesterExpression(), ctx);
  assert.equal(evalRes.ok, true);
  await new Promise((r) => setTimeout(r, 20));

  // 1) 零 ✨ 按钮 + 设置卡片挂载完整
  assert.equal(fakeDoc.querySelector('[data-testid="prism-suggest-trigger"]'), null);
  assert.equal(sgSlot.hidden, false, 'Settings slot must be unhidden when UI mounts');
  assert.equal(sgSlot.style.display, '', 'Settings slot display:none must be cleared');
  assert.ok(fakeDoc.querySelector('[data-testid="prism-suggester-card"]'), 'Settings card must be mounted');
  assert.ok(fakeDoc.querySelector('[data-testid="prism-sg-enable-off"]'), 'Off button must be mounted');
  assert.ok(fakeDoc.querySelector('[data-testid="prism-sg-ai-config"]'), 'Standard Thought-style AI config box must be mounted');
  assert.ok(fakeDoc.querySelector('[data-testid="prism-sg-fetch-models-btn"]'), 'Fetch models button must be mounted');
  assert.equal(suggestRpcCount, 0, 'Must NOT fire on static history load');

  // 2) 模拟主对话运行中 -> 完成状态切换
  const cancelBtn = fakeDoc.createElement('button');
  cancelBtn.setAttribute('data-testid', 'input-cancel-button');
  footer.appendChild(cancelBtn);
  fakeWin.__agPrismSuggester.checkAgentStateTransition();

  const aMsg = fakeDoc.createElement('div');
  aMsg.setAttribute('data-testid', 'planner-response-text');
  aMsg.appendChild(fakeDoc.createTextNode('跑完后把对照表发给我就够了。'));
  convView.appendChild(aMsg);
  cancelBtn.remove();
  fakeWin.__agPrismSuggester.checkAgentStateTransition();

  await new Promise((r) => setTimeout(r, 820));
  assert.equal(suggestRpcCount, 1, 'Must fire suggest RPC once after turn completion');

  fakeWin.__agPrismSuggester.checkAgentStateTransition();
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(suggestRpcCount, 1, 'Must NEVER fire twice for the same completed reply');

  const overlay = fakeDoc.querySelector('[data-testid="prism-ghost-overlay"]');
  assert.ok(overlay);
  assert.equal(overlay.textContent, `${EXPECTED}\u21e5 Tab`, 'Overlay must only contain suggestion + ⇥ Tab');

  // 2b) 切换到历史空闲会话 cascade-b -> 立即隐藏且不发 RPC
  convView.setAttribute('data-cascade-id', 'cascade-b');
  fakeWin.__agPrismSuggester.checkAgentStateTransition();
  assert.equal(fakeDoc.querySelector('[data-testid="prism-ghost-overlay"]'), null);
  await new Promise((r) => setTimeout(r, 820));
  assert.equal(suggestRpcCount, 1);

  // 2c) 从运行中会话 cascade-c 切回空闲会话 cascade-b -> 绝不误触发
  convView.setAttribute('data-cascade-id', 'cascade-c');
  footer.appendChild(cancelBtn);
  fakeWin.__agPrismSuggester.checkAgentStateTransition();
  convView.setAttribute('data-cascade-id', 'cascade-b');
  cancelBtn.remove();
  fakeWin.__agPrismSuggester.checkAgentStateTransition();
  await new Promise((r) => setTimeout(r, 820));
  assert.equal(suggestRpcCount, 1);

  // 2d) /btw 侧栏问答结束 -> 绝不误触发主输入框建议
  const sidePanel = fakeDoc.createElement('div');
  sidePanel.setAttribute('data-testid', 'side-question-panel');
  const sideCancel = fakeDoc.createElement('button');
  sideCancel.setAttribute('data-testid', 'input-cancel-button');
  sidePanel.appendChild(sideCancel);
  fakeDoc.body.appendChild(sidePanel);
  fakeWin.__agPrismSuggester.checkAgentStateTransition();
  sideCancel.remove();
  fakeWin.__agPrismSuggester.checkAgentStateTransition();
  await new Promise((r) => setTimeout(r, 820));
  assert.equal(suggestRpcCount, 1);

  // 2e) 切回 cascade-a -> 0 额外 RPC 即时恢复内存建议
  convView.setAttribute('data-cascade-id', 'cascade-a');
  fakeWin.__agPrismSuggester.checkAgentStateTransition();
  assert.equal(suggestRpcCount, 1);
  assert.ok(fakeDoc.querySelector('[data-testid="prism-ghost-overlay"]'));

  // 3) 焦点在主输入框按 Tab -> 单次 Lexical 上屏，0 重复
  lexicalEl.focus();
  const tabEv = new fakeWin.Event('keydown', { bubbles: true });
  tabEv.key = 'Tab';
  lexicalEl.dispatchEvent(tabEv);
  await new Promise((r) => setTimeout(r, 15));

  assert.equal(dom.getCounts().lexicalDispatchCount, 1, 'Must dispatch Lexical insertion command exactly once');
  assert.equal(dom.getCounts().execCommandCount, 0, 'Must NOT also call execCommand when Lexical handled insertion');
  assert.equal(dom.getCounts().insertedBuffer, EXPECTED, 'Inserted text must NOT be duplicated');
  assert.equal(fakeDoc.querySelector('[data-testid="prism-ghost-overlay"]'), null);

  // 3b) 清空未发送草稿立即恢复幽灵提示
  dom.advanceNow(200);
  dom.resetInserted();
  lexicalEl.dispatchEvent(new fakeWin.Event('input', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 35));
  assert.equal(suggestRpcCount, 1);
  assert.ok(fakeDoc.querySelector('[data-testid="prism-ghost-overlay"]'));

  // 自定义输入隐藏 -> 清空恢复 -> Escape 永久关闭当前轮
  lexicalEl.__lexicalTextContent = '我自己先打几个字';
  lexicalEl.textContent = '我自己先打几个字';
  lexicalEl.dispatchEvent(new fakeWin.Event('input', { bubbles: true }));
  assert.equal(fakeDoc.querySelector('[data-testid="prism-ghost-overlay"]'), null);

  dom.resetInserted();
  lexicalEl.dispatchEvent(new fakeWin.Event('input', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 35));
  assert.ok(fakeDoc.querySelector('[data-testid="prism-ghost-overlay"]'));

  const escEv = new fakeWin.Event('keydown', { bubbles: true });
  escEv.key = 'Escape';
  lexicalEl.dispatchEvent(escEv);
  assert.equal(fakeDoc.querySelector('[data-testid="prism-ghost-overlay"]'), null);

  // 4) 后台任务完成 + TTL 过期 + 延迟 hydration
  dom.resetInserted();
  const rowFresh = fakeDoc.createElement('div');
  rowFresh.setAttribute('data-testid', 'conversation-row-sidebar');
  rowFresh.setAttribute('data-cascade-id', 'cascade-bg-fresh');
  rowFresh.setAttribute('data-ag-cs-row-running', '1');

  const rowStale = fakeDoc.createElement('div');
  rowStale.setAttribute('data-testid', 'conversation-row-sidebar');
  rowStale.setAttribute('data-cascade-id', 'cascade-bg-stale');
  rowStale.setAttribute('data-ag-cs-row-running', '1');

  fakeDoc.body.appendChild(rowFresh);
  fakeDoc.body.appendChild(rowStale);
  fakeWin.__agPrismSuggester.checkAgentStateTransition();

  rowFresh.removeAttribute('data-ag-cs-row-running');
  rowStale.removeAttribute('data-ag-cs-row-running');
  fakeWin.__agPrismSuggester.checkAgentStateTransition();
  assert.equal(suggestRpcCount, 1);

  dom.advanceNow(3 * 60 * 1000);
  convView.setAttribute('data-cascade-id', 'cascade-bg-fresh');
  fakeWin.__agPrismSuggester.checkAgentStateTransition();
  await new Promise((r) => setTimeout(r, 420));
  assert.equal(suggestRpcCount, 2);
  assert.ok(fakeDoc.querySelector('[data-testid="prism-ghost-overlay"]'));

  dom.advanceNow(20 * 60 * 1000);
  fakeWin.__agPrismSuggester.checkAgentStateTransition();
  assert.equal(fakeDoc.querySelector('[data-testid="prism-ghost-overlay"]'), null);

  convView.setAttribute('data-cascade-id', 'cascade-bg-stale');
  fakeWin.__agPrismSuggester.checkAgentStateTransition();
  await new Promise((r) => setTimeout(r, 420));
  assert.equal(suggestRpcCount, 2);
  assert.equal(fakeDoc.querySelector('[data-testid="prism-ghost-overlay"]'), null);

  const rowHydrate = fakeDoc.createElement('div');
  rowHydrate.setAttribute('data-testid', 'conversation-row-sidebar');
  rowHydrate.setAttribute('data-cascade-id', 'cascade-bg-hydrate');
  const sbSpinner = fakeDoc.createElement('div');
  sbSpinner.setAttribute('data-testid', 'status-loading-spinner');
  rowHydrate.appendChild(sbSpinner);
  fakeDoc.body.appendChild(rowHydrate);
  fakeWin.__agPrismSuggester.checkAgentStateTransition();

  sbSpinner.remove();
  fakeWin.__agPrismSuggester.checkAgentStateTransition();

  const savedAgentNode = convView.querySelector('[data-testid="planner-response-text"]');
  if (savedAgentNode) savedAgentNode.remove();
  convView.setAttribute('data-cascade-id', 'cascade-bg-hydrate');
  fakeWin.__agPrismSuggester.checkAgentStateTransition();

  setTimeout(() => {
    const delayedReply = fakeDoc.createElement('div');
    delayedReply.setAttribute('data-testid', 'planner-response-text');
    delayedReply.appendChild(fakeDoc.createTextNode('已完成模型列表清洗，是否需要把闭环静默判定提到第一优先级？'));
    convView.appendChild(delayedReply);
    fakeWin.__agPrismSuggester.checkAgentStateTransition();
  }, 500);

  await new Promise((r) => setTimeout(r, 950));
  assert.equal(suggestRpcCount, 3);
  assert.ok(fakeDoc.querySelector('[data-testid="prism-ghost-overlay"]'));

  fakeWin.__agPrismSuggester.dismissGhost({ markDismissed: true });
  rowHydrate.appendChild(sbSpinner);
  fakeWin.__agPrismSuggester.checkAgentStateTransition();
  const nextReply = fakeDoc.createElement('div');
  nextReply.setAttribute('data-testid', 'planner-response-text');
  nextReply.appendChild(fakeDoc.createTextNode('已修复延迟挂载丢提示的问题，还要调整静默优先级吗？'));
  convView.appendChild(nextReply);
  sbSpinner.remove();
  fakeWin.__agPrismSuggester.checkAgentStateTransition();
  await new Promise((r) => setTimeout(r, 850));
  assert.equal(suggestRpcCount, 4);
  assert.ok(fakeDoc.querySelector('[data-testid="prism-ghost-overlay"]'));
  fakeWin.__agPrismSuggester.destroy();
});

test('Zero-overhead disabled state: enabled: false starts 0 MutationObserver & 0 capture listeners, and toggling on -> off disconnects and releases immediately', async () => {
  const dom = createFakeSuggesterDom({ lang: 'en', withMutationObserverSpy: true });
  const { fakeDoc, fakeWin, observerStats, docListenerStats } = dom;

  fakeWin.__agPrismSuggestCall = (rawPayload) => {
    const msg = JSON.parse(rawPayload);
    setTimeout(() => {
      if (msg.action === 'get-config') {
        fakeWin.__agPrismSuggesterResolve(msg.id, {
          ok: true,
          config: { enabled: false, ttlMinutes: 15 },
          backend: { aiReady: true, profileName: 'Default', model: 'gpt-4o-mini' },
        });
      } else {
        fakeWin.__agPrismSuggesterResolve(msg.id, { ok: true });
      }
    }, 5);
  };

  const ctx = vm.createContext(fakeWin);
  const evalRes = vm.runInContext(cdp.buildSuggesterExpression(), ctx);
  assert.equal(evalRes.ok, true);
  await new Promise((r) => setTimeout(r, 25));

  // 默认关闭态：0 Observer、0 document 捕获监听、0 运行时样式标签
  const offState = fakeWin.__agPrismSuggester.getDebugState();
  assert.equal(offState.config.enabled, false);
  assert.equal(offState.active, false);
  assert.equal(offState.observerActive, false);
  assert.equal(offState.listenerCount, 0);
  assert.equal(observerStats.created, 0, 'Disabled state must NEVER create MutationObserver');
  assert.equal(observerStats.active, 0, 'Disabled state must have 0 active MutationObserver');
  assert.equal(docListenerStats.activeCaptureCount, 0, 'Disabled state must bind 0 document capture listeners');
  assert.equal(fakeDoc.getElementById('ag-prism-suggester-css'), null, 'Disabled state must NOT inject runtime CSS');

  // 切换到开启态 -> 启动监控与捕获监听
  fakeWin.__agPrismSuggester.applyConfig(
    { enabled: true, ttlMinutes: 15 },
    { aiReady: true, profileName: 'Default', model: 'gpt-4o-mini' }
  );
  const onState = fakeWin.__agPrismSuggester.getDebugState();
  assert.equal(onState.config.enabled, true);
  assert.equal(onState.active, true);
  assert.equal(onState.observerActive, true);
  assert.ok(onState.listenerCount > 0, 'Enabled state must register capture listeners');
  assert.equal(observerStats.active, 1, 'Enabled state must activate exactly 1 MutationObserver');
  assert.ok(docListenerStats.activeCaptureCount > 0);
  assert.ok(fakeDoc.getElementById('ag-prism-suggester-css'), 'Enabled state must inject runtime CSS');

  // 切回关闭态 -> 立即 disconnect()、清空监听、移除运行时样式
  fakeWin.__agPrismSuggester.applyConfig(
    { enabled: false, ttlMinutes: 15 },
    { aiReady: true, profileName: 'Default', model: 'gpt-4o-mini' }
  );
  const backOffState = fakeWin.__agPrismSuggester.getDebugState();
  assert.equal(backOffState.config.enabled, false);
  assert.equal(backOffState.active, false);
  assert.equal(backOffState.observerActive, false);
  assert.equal(backOffState.listenerCount, 0);
  assert.equal(observerStats.active, 0, 'Toggling back to off must disconnect MutationObserver immediately');
  assert.ok(observerStats.disconnected >= 1);
  assert.equal(docListenerStats.activeCaptureCount, 0, 'Toggling back to off must remove all capture listeners');
  assert.equal(fakeDoc.getElementById('ag-prism-suggester-css'), null, 'Toggling back to off must remove runtime CSS');

  fakeWin.__agPrismSuggester.destroy();
});

test('Shortcut safety: Tab does NOT hijack when html[data-ag-pp-open="1"] or focus is on an external button', async () => {
  const dom = createFakeSuggesterDom({ lang: 'en' });
  const { fakeDoc, fakeWin, convView, lexicalEl, footer } = dom;
  const SUGGESTION = 'Run the full test suite next.';

  fakeWin.__agPrismSuggestCall = (rawPayload) => {
    const msg = JSON.parse(rawPayload);
    setTimeout(() => {
      if (msg.action === 'get-config') {
        fakeWin.__agPrismSuggesterResolve(msg.id, {
          ok: true,
          config: { enabled: true, ttlMinutes: 15 },
          backend: { aiReady: true, profileName: 'Default', model: 'gpt-4o-mini' },
        });
      } else if (msg.action === 'suggest') {
        fakeWin.__agPrismSuggesterResolve(msg.id, { ok: true, engine: 'ai', suggestion: SUGGESTION });
      } else {
        fakeWin.__agPrismSuggesterResolve(msg.id, { ok: true });
      }
    }, 5);
  };

  const ctx = vm.createContext(fakeWin);
  vm.runInContext(cdp.buildSuggesterExpression(), ctx);
  await new Promise((r) => setTimeout(r, 20));

  // 触发一次幽灵建议展示
  const cancelBtn = fakeDoc.createElement('button');
  cancelBtn.setAttribute('data-testid', 'input-cancel-button');
  footer.appendChild(cancelBtn);
  fakeWin.__agPrismSuggester.checkAgentStateTransition();

  const aMsg = fakeDoc.createElement('div');
  aMsg.setAttribute('data-testid', 'planner-response-text');
  aMsg.appendChild(fakeDoc.createTextNode('All patches applied cleanly.'));
  convView.appendChild(aMsg);
  cancelBtn.remove();
  fakeWin.__agPrismSuggester.checkAgentStateTransition();
  await new Promise((r) => setTimeout(r, 820));
  assert.ok(fakeDoc.querySelector('[data-testid="prism-ghost-overlay"]'), 'Ghost overlay must be active');

  // 场景 1：周期表 3D 面板开启（html[data-ag-pp-open="1"]）时，Tab 严禁劫持
  fakeDoc.documentElement.setAttribute('data-ag-pp-open', '1');
  lexicalEl.focus();
  const tabPp = new fakeWin.Event('keydown', { bubbles: true });
  tabPp.key = 'Tab';
  lexicalEl.dispatchEvent(tabPp);
  await new Promise((r) => setTimeout(r, 15));
  assert.equal(tabPp.defaultPrevented, false, 'Tab must NOT be prevented when Periodic Picker is open');
  assert.equal(dom.getCounts().lexicalDispatchCount, 0, 'Must NOT insert suggestion while Periodic Picker is open');
  fakeDoc.documentElement.removeAttribute('data-ag-pp-open');

  // 场景 2：模型菜单打开（html[data-ag-cs-model-menu="1"]）时，Tab 严禁劫持
  fakeDoc.documentElement.setAttribute('data-ag-cs-model-menu', '1');
  const tabMenu = new fakeWin.Event('keydown', { bubbles: true });
  tabMenu.key = 'Tab';
  lexicalEl.dispatchEvent(tabMenu);
  assert.equal(tabMenu.defaultPrevented, false, 'Tab must NOT be prevented when model menu is open');
  assert.equal(dom.getCounts().lexicalDispatchCount, 0);
  fakeDoc.documentElement.removeAttribute('data-ag-cs-model-menu');

  // 场景 3：焦点位于外部按钮时，Tab 严禁劫持
  const extBtn = fakeDoc.createElement('button');
  extBtn.id = 'external-toolbar-btn';
  extBtn.textContent = 'External';
  fakeDoc.body.appendChild(extBtn);
  extBtn.focus();
  const tabExt = new fakeWin.Event('keydown', { bubbles: true });
  tabExt.key = 'Tab';
  extBtn.dispatchEvent(tabExt);
  await new Promise((r) => setTimeout(r, 15));
  assert.equal(tabExt.defaultPrevented, false, 'Tab must NOT hijack focus navigation on external buttons');
  assert.equal(dom.getCounts().lexicalDispatchCount, 0, 'Must NOT insert suggestion when external button is focused');

  // 场景 4：焦点回到主输入框且无阻断浮层 -> Tab 正常接受建议
  lexicalEl.focus();
  const tabOk = new fakeWin.Event('keydown', { bubbles: true });
  tabOk.key = 'Tab';
  lexicalEl.dispatchEvent(tabOk);
  await new Promise((r) => setTimeout(r, 15));
  assert.equal(tabOk.defaultPrevented, true, 'Tab on focused main composer must accept ghost suggestion');
  assert.equal(dom.getCounts().lexicalDispatchCount, 1);
  assert.equal(dom.getCounts().insertedBuffer, SUGGESTION);

  fakeWin.__agPrismSuggester.destroy();
});

test('Zero style leak: #ag-prism-model-dd-css is completely removed by UI destroy(), SUGGESTER_REMOVE_EXPRESSION, and REMOVE_EXPRESSION', async () => {
  const dom = createFakeSuggesterDom({ lang: 'en' });
  const { fakeDoc, fakeWin, sgSlot } = dom;

  fakeWin.__agPrismSuggestCall = (rawPayload) => {
    const msg = JSON.parse(rawPayload);
    setTimeout(() => {
      fakeWin.__agPrismSuggesterResolve(msg.id, {
        ok: true,
        config: { enabled: true, ttlMinutes: 15 },
        backend: { aiReady: true, profileName: 'Default', model: 'gpt-4o-mini' },
        profiles: [],
      });
    }, 5);
  };

  const ctx = vm.createContext(fakeWin);
  vm.runInContext(cdp.buildSuggesterExpression(), ctx);
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(fakeDoc.getElementById('ag-prism-model-dd-css'), 'Model dropdown CSS must be injected on settings mount');
  assert.ok(fakeDoc.getElementById('ag-prism-suggester-css'), 'Runtime CSS must be injected when enabled');

  // 1) Settings UI handle.destroy() 彻底删除 #ag-prism-model-dd-css
  assert.ok(sgSlot.__agPrismSgUiHandle, 'Expected mounted UI handle on slot');
  sgSlot.__agPrismSgUiHandle.destroy();
  assert.equal(fakeDoc.getElementById('ag-prism-model-dd-css'), null, 'Settings UI destroy() must remove #ag-prism-model-dd-css');

  // 2) 重新挂载后运行 SUGGESTER_REMOVE_EXPRESSION -> 同时删除 #ag-prism-model-dd-css 与 #ag-prism-suggester-css
  fakeWin.__prismMountSuggesterUi(sgSlot, { lang: 'en' });
  assert.ok(fakeDoc.getElementById('ag-prism-model-dd-css'));
  vm.runInContext(cdp.SUGGESTER_REMOVE_EXPRESSION, ctx);
  assert.equal(fakeDoc.getElementById('ag-prism-model-dd-css'), null, 'SUGGESTER_REMOVE_EXPRESSION must remove #ag-prism-model-dd-css');
  assert.equal(fakeDoc.getElementById('ag-prism-suggester-css'), null, 'SUGGESTER_REMOVE_EXPRESSION must remove #ag-prism-suggester-css');
  assert.equal(fakeWin.__agPrismSuggester, undefined);
  assert.equal(fakeWin.__agPrismSuggesterSettingsUi, undefined);

  // 3) 重新挂载后运行全量 REMOVE_EXPRESSION -> 同时删除 #ag-prism-model-dd-css、#ag-prism-suggester-css 及属性
  vm.runInContext(cdp.buildSuggesterExpression(), ctx);
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(fakeDoc.getElementById('ag-prism-model-dd-css'));
  assert.ok(fakeDoc.getElementById('ag-prism-suggester-css'));
  vm.runInContext(cdp.REMOVE_EXPRESSION, ctx);
  assert.equal(fakeDoc.getElementById('ag-prism-model-dd-css'), null, 'REMOVE_EXPRESSION must remove #ag-prism-model-dd-css');
  assert.equal(fakeDoc.getElementById('ag-prism-suggester-css'), null, 'REMOVE_EXPRESSION must remove #ag-prism-suggester-css');
  assert.equal(fakeWin.__agPrismSuggester, undefined);
  assert.equal(fakeWin.__prismMountSuggesterUi, undefined);
});

test('8-language alignment (no yue, 0 CJK leak in en/es/fr/de) and .bundle-cache.json channels.suggester disk cache hit', async () => {
  // Part A: 8 语词典与规范化校验
  const dom = createFakeSuggesterDom({ lang: 'en', withComposer: false });
  const { fakeDoc, fakeWin, sgSlot } = dom;
  fakeWin.__agPrismSuggestCall = (rawPayload) => {
    const msg = JSON.parse(rawPayload);
    setTimeout(() => {
      fakeWin.__agPrismSuggesterResolve(msg.id, {
        ok: true,
        config: { enabled: false, ttlMinutes: 15 },
        backend: { aiReady: false, profileName: '', model: '' },
        profiles: [],
      });
    }, 5);
  };
  const ctx = vm.createContext(fakeWin);
  vm.runInContext(cdp.buildSuggesterExpression(), ctx);
  await new Promise((r) => setTimeout(r, 20));

  const uiApi = fakeWin.__agPrismSuggesterSettingsUi;
  assert.ok(uiApi, 'Expected __agPrismSuggesterSettingsUi');
  assert.equal(uiApi.normalizeLang('yue'), 'zh-CN', 'yue must normalize to zh-CN');
  assert.equal(uiApi.normalizeLang('zh-HK'), 'zh-TW', 'zh-HK must normalize to zh-TW');
  assert.equal(uiApi.normalizeLang('zh-MO'), 'zh-TW', 'zh-MO must normalize to zh-TW');
  assert.equal(uiApi.normalizeLang('xx-ZZ'), '', 'Unknown lang normalizes to empty string');
  fakeDoc.documentElement.setAttribute('data-ag-cs-lang', 'xx-ZZ');
  assert.equal(uiApi.resolveLang(fakeDoc, {}), 'en', 'Unknown language must fall back to en');

  // 逐一验证全部 8 语渲染，其中 en/es/fr/de 严格 0 CJK 泄漏
  const ALL_8_LANGS = ['zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'es', 'fr', 'de'];
  const ZERO_CJK_LANGS = new Set(['en', 'es', 'fr', 'de']);
  for (const lang of ALL_8_LANGS) {
    sgSlot.__agPrismSgUiHandle.updateLang(lang);
    const cardText = sgSlot.textContent;
    assert.ok(cardText.length > 20, `Rendered card for ${lang} must be non-empty`);
    if (ZERO_CJK_LANGS.has(lang)) {
      assert.equal(
        CJK_RE.test(cardText),
        false,
        `Language ${lang} must have 0 CJK leakage, got snippet: ${cardText.slice(0, 120)}`
      );
    }
  }

  // 静态验证两份前端源码词典不含 yue 键，且 ARIA_LABELS 覆盖完整 8 语
  const uiSrc = fs.readFileSync(path.join(ROOT_DIR, 'vendor', 'prompt-suggester', 'suggester-settings-ui.js'), 'utf8');
  const clientSrc = fs.readFileSync(path.join(ROOT_DIR, 'vendor', 'prompt-suggester', 'suggester-client.js'), 'utf8');
  assert.equal(/^\s*['"]?yue['"]?\s*:/m.test(uiSrc), false, 'suggester-settings-ui.js must not declare yue locale key');
  assert.equal(/^\s*['"]?yue['"]?\s*:/m.test(clientSrc), false, 'suggester-client.js must not declare yue locale key');
  const ariaMatch = clientSrc.match(/const ARIA_LABELS = \{([\s\S]*?)\};/);
  assert.ok(ariaMatch, 'Expected ARIA_LABELS in suggester-client.js');
  for (const l of ALL_8_LANGS) {
    assert.ok(ariaMatch[1].includes(l), `ARIA_LABELS must cover ${l}`);
  }
  for (const l of ZERO_CJK_LANGS) {
    const m = new RegExp(`['"]?${l}['"]?\\s*:\\s*\\{[^}]*accept\\s*:\\s*'([^']+)'`).exec(ariaMatch[1]);
    assert.ok(m, `Expected ARIA_LABELS.${l}.accept`);
    assert.equal(CJK_RE.test(m[1]), false, `ARIA_LABELS.${l} must have 0 CJK`);
  }
  fakeWin.__agPrismSuggester.destroy();

  // Part B: .bundle-cache.json channels.suggester 磁盘缓存写入与冷重载命中
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-sg-cache-'));
  const cachePath = path.join(tmpDir, '.bundle-cache.json');
  try {
    cdp.resetBundleCacheStats();
    const coldExpr = cdp.buildSuggesterExpression(null, { cachePath });
    assert.ok(coldExpr.length > 1000);
    assert.equal(fs.existsSync(cachePath), true, '.bundle-cache.json must be written');
    const diskJson = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    assert.ok(diskJson.channels && diskJson.channels.suggester, 'channels.suggester must be persisted in .bundle-cache.json');
    assert.match(diskJson.channels.suggester.sourceHash, /^[0-9a-f]{64}$/);
    assert.match(diskJson.channels.suggester.payloadSha256, /^[0-9a-f]{64}$/);

    // 模拟冷启：清空 require.cache 重新加载 cdp.js，确认直接命中磁盘缓存 0 编译
    const cdpPath = require.resolve(path.join(ROOT_DIR, 'cdp.js'));
    delete require.cache[cdpPath];
    const freshCdp = require(cdpPath);
    freshCdp.resetBundleCacheStats();
    const hitExpr = freshCdp.buildSuggesterExpression(null, { cachePath });
    assert.equal(hitExpr, coldExpr, 'Disk cache hit must match cold compile byte-for-byte');
    const stats = freshCdp.getBundleCacheStats();
    assert.equal(stats.channelHitsByName.suggester, 1, 'channelHitsByName.suggester must be 1 on cold disk hit');
    assert.equal(stats.channelCompileRuns, 0, 'Cold disk hit must skip re-compiling suggester assets');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('P0 cross-card & cross-window profiles bidirectional sync across THOUGHT_BINDING and SUGGESTER_BINDING (save-config & test-connection)', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-sg-sync-'));
  let daemon = null;
  try {
    const sharedStore = {
      activeProfileId: 'p1',
      profiles: [
        {
          id: 'p1',
          name: 'Gemini AI Studio',
          baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
          model: 'gemini-flash-lite-latest',
          apiKey: 'AIzaSyInitialKey111111111',
        },
      ],
    };

    const mockThoughtSvc = {
      loadStore: () => sharedStore,
      getSanitizedConfig: () => ({
        ok: true,
        activeProfileId: sharedStore.activeProfileId,
        profiles: sharedStore.profiles.map((p) => ({
          id: p.id,
          name: p.name,
          baseUrl: p.baseUrl,
          model: p.model,
          hasApiKey: Boolean(p.apiKey),
          maskedKey: p.apiKey ? '••••' : '',
        })),
      }),
      saveConfig(input = {}) {
        if (Array.isArray(input.profiles)) {
          const prevMap = new Map(sharedStore.profiles.map((p) => [p.id, p]));
          sharedStore.profiles = input.profiles.map((p) => ({
            id: p.id,
            name: p.name,
            baseUrl: p.baseUrl,
            model: p.model,
            apiKey: p.apiKey || (p.keepExistingKey ? prevMap.get(p.id)?.apiKey || '' : ''),
          }));
        }
        if (input.activeProfileId) sharedStore.activeProfileId = input.activeProfileId;
        return { ok: true, activeProfileId: sharedStore.activeProfileId };
      },
      _resolveEffectiveCredentials(input = {}) {
        const target = sharedStore.profiles.find((p) => p.id === (input.profileId || sharedStore.activeProfileId));
        return target
          ? { baseUrl: target.baseUrl, baseUrlError: '', apiKey: target.apiKey, model: input.model || target.model }
          : { baseUrl: '', baseUrlError: '', apiKey: '', model: '' };
      },
      async testConnection() {
        return { ok: true, latencyMs: 18, model: 'gemini-3-flash-preview' };
      },
    };

    const sgSvc = new PromptSuggesterService({
      configDir: tmpDir,
      translatorService: mockThoughtSvc,
    });

    daemon = new PrismDaemon({
      rootDir: ROOT_DIR,
      thoughtService: mockThoughtSvc,
      suggesterService: sgSvc,
      silent: true,
      enableAutoUpdateTimer: false,
      enableStorageGuardTimer: false,
    });

    const makeMockEntry = (id, ctxId, frameId) => {
      const evals = [];
      const entry = {
        wsUrl: `ws://127.0.0.1:9222/devtools/page/${id}`,
        mainFrameId: frameId,
        hasFrameTree: true,
        contextFrames: new Map([[ctxId, { frameId, isDefault: true, type: 'default', docGen: 1 }]]),
        sidebarHostVerified: true,
        sidebarVerifiedDocument: 1,
        sidebarDocument: 1,
        sidebarHostContextId: ctxId,
        suggesterSkipped: false,
        session: {
          closed: false,
          async send(method, params) {
            if (method === 'Runtime.evaluate') {
              evals.push({ expression: params.expression, contextId: params.contextId });
            }
            return { result: { value: true } };
          },
          close() {
            this.closed = true;
          },
        },
      };
      return { entry, evals };
    };

    const winA = makeMockEntry('winA', 101, 'frame-A');
    const winB = makeMockEntry('winB', 202, 'frame-B');
    daemon.sessions.set(winA.entry.wsUrl, winA.entry);
    daemon.sessions.set(winB.entry.wsUrl, winB.entry);

    // 1) THOUGHT_BINDING save-config -> 双向反向通知本窗口与另一窗口的 Suggester UI 重载 profiles（并同步另一窗口 Thought UI）
    await daemon.handleBindingCall(winA.entry, {
      name: THOUGHT_BINDING,
      executionContextId: 101,
      payload: JSON.stringify({
        id: 1,
        action: 'save-config',
        input: {
          activeProfileId: 'p1',
          profiles: [
            ...sharedStore.profiles,
            {
              id: 'p2',
              name: 'New Thought Provider',
              baseUrl: 'https://api.example.com/v1',
              model: 'fast-mini',
              apiKey: 'sk-brand-new-secret-999999',
            },
          ],
        },
      }),
    });

    assert.ok(
      winA.evals.some((e) => e.expression.includes('__agPrismSuggesterSettingsUi?.reloadProfiles?.()')),
      'THOUGHT_BINDING save-config must notify current window Suggester UI to reloadProfiles()'
    );
    assert.ok(
      winB.evals.some(
        (e) =>
          e.expression.includes('__agPrismSuggesterSettingsUi?.reloadProfiles?.()') &&
          e.expression.includes('__prismThoughtUiHandle?.reloadConfig?.()') &&
          e.contextId === 202
      ),
      'THOUGHT_BINDING save-config must broadcast reloadProfiles() and Thought UI reloadConfig() to peer windows'
    );

    winA.evals.length = 0;
    winB.evals.length = 0;

    // 2) SUGGESTER_BINDING save-config -> 同步全部窗口 applyConfig + reloadProfiles + 思考转译 UI reloadConfig
    await daemon.handleBindingCall(winA.entry, {
      name: SUGGESTER_BINDING,
      executionContextId: 101,
      payload: JSON.stringify({
        id: 2,
        action: 'save-config',
        payload: {
          enabled: true,
          activeProfileId: 'p1',
          profiles: [
            {
              id: 'p1',
              name: 'Gemini AI Studio',
              baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
              model: 'gemini-3-flash-preview',
              apiKey: '',
              keepExistingKey: true,
            },
          ],
        },
      }),
    });

    assert.ok(
      winA.evals.some((e) => e.expression.includes('__prismThoughtUiHandle?.reloadConfig?.()')),
      'SUGGESTER_BINDING save-config must notify current window Thought UI'
    );
    assert.ok(
      winB.evals.some(
        (e) =>
          e.expression.includes('__agPrismSuggester?.applyConfig?.(') &&
          e.expression.includes('__agPrismSuggesterSettingsUi?.reloadProfiles?.()') &&
          e.expression.includes('__prismThoughtUiHandle?.reloadConfig?.()') &&
          e.contextId === 202
      ),
      'SUGGESTER_BINDING save-config must broadcast applyConfig, reloadProfiles, and Thought UI reloadConfig to peer windows'
    );

    winA.evals.length = 0;
    winB.evals.length = 0;

    // 3) SUGGESTER_BINDING test-connection（内含 saveWorkbenchConfig）-> 同样触发全窗口同步并通知思考转译 UI
    await daemon.handleBindingCall(winA.entry, {
      name: SUGGESTER_BINDING,
      executionContextId: 101,
      payload: JSON.stringify({
        id: 3,
        action: 'test-connection',
        payload: {
          enabled: true,
          activeProfileId: 'p1',
          profiles: [
            {
              id: 'p1',
              name: 'Gemini AI Studio Updated',
              baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
              model: 'gemini-3-flash-preview',
              apiKey: 'AIzaSyRotatedKey222222222',
              keepExistingKey: false,
            },
          ],
        },
      }),
    });

    assert.equal(sharedStore.profiles[0].apiKey, 'AIzaSyRotatedKey222222222', 'test-connection must persist updated profile key');
    assert.ok(
      winA.evals.some(
        (e) =>
          e.expression.includes('__prismThoughtUiHandle?.reloadConfig?.()') &&
          e.expression.includes('__agPrismSuggester?.applyConfig?.(')
      ),
      'SUGGESTER_BINDING test-connection must sync current window Thought UI and Suggester config'
    );
    assert.ok(
      winB.evals.some(
        (e) =>
          e.expression.includes('__agPrismSuggester?.applyConfig?.(') &&
          e.expression.includes('__agPrismSuggesterSettingsUi?.reloadProfiles?.()') &&
          e.expression.includes('__prismThoughtUiHandle?.reloadConfig?.()') &&
          e.contextId === 202
      ),
      'SUGGESTER_BINDING test-connection must broadcast updated config & profiles sync to peer windows'
    );
  } finally {
    if (daemon) await daemon.stop(false).catch(() => {});
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('UX regression: reusing mounted Suggester card on settings sync updates language without calling refreshState() or wiping unsaved form drafts', async () => {
  const dom = createFakeSuggesterDom({ lang: 'en', withComposer: false });
  const { fakeDoc, fakeWin, sgSlot } = dom;
  let getConfigCalls = 0;

  fakeWin.__agPrismSuggestCall = (rawPayload) => {
    const msg = JSON.parse(rawPayload);
    if (msg.action === 'get-config') getConfigCalls += 1;
    setTimeout(() => {
      fakeWin.__agPrismSuggesterResolve(msg.id, {
        ok: true,
        config: { enabled: true, ttlMinutes: 15, activeProfileId: 'default' },
        backend: { aiReady: false, profileName: 'Default', model: 'gpt-4o-mini' },
        profiles: [
          {
            id: 'default',
            name: 'Default',
            baseUrl: 'https://api.openai.com/v1',
            model: 'gpt-4o-mini',
            hasApiKey: false,
            maskedKey: '',
          },
        ],
      });
    }, 5);
  };

  const ctx = vm.createContext(fakeWin);
  vm.runInContext(cdp.buildSuggesterExpression(), ctx);
  await new Promise((r) => setTimeout(r, 25));

  const firstHandle = sgSlot.__agPrismSgUiHandle;
  assert.ok(firstHandle, 'Expected mounted Suggester handle');
  const callsBeforeSync = getConfigCalls;
  assert.ok(callsBeforeSync >= 1, 'Initial mount should fetch config at least once');

  const urlInput = sgSlot.querySelector('[data-testid="prism-sg-base-url"]');
  const modelInput = sgSlot.querySelector('[data-testid="prism-sg-model-input"]');
  const keyInput = sgSlot.querySelector('[data-testid="prism-sg-api-key"]');
  assert.ok(urlInput && modelInput && keyInput, 'Expected baseUrl, model, and apiKey form inputs');

  // Simulate user typing unsaved values into all three fields
  urlInput.value = 'https://custom.proxy.local/v1';
  urlInput.dispatchEvent(new fakeWin.Event('input'));
  modelInput.value = 'gemini-2.5-flash-draft';
  modelInput.dispatchEvent(new fakeWin.Event('input'));
  keyInput.value = 'sk-unsaved-draft-key-999999';
  keyInput.dispatchEvent(new fakeWin.Event('input'));

  // Simulate repeated settings-panel sync calling mountSuggesterUi on existing slot (same lang & switched lang)
  const reusedSameLang = fakeWin.__prismMountSuggesterUi(sgSlot, { lang: 'en' });
  const reusedZh = fakeWin.__prismMountSuggesterUi(sgSlot, { lang: 'zh-CN' });
  await new Promise((r) => setTimeout(r, 25));

  assert.equal(reusedSameLang, firstHandle);
  assert.equal(reusedZh, firstHandle);
  assert.equal(getConfigCalls, callsBeforeSync, 'Reusing existingHandle must NEVER re-trigger refreshState()/get-config');
  assert.equal(urlInput.value, 'https://custom.proxy.local/v1', 'Unsaved Base URL must be preserved');
  assert.equal(modelInput.value, 'gemini-2.5-flash-draft', 'Unsaved Model must be preserved');
  assert.equal(keyInput.value, 'sk-unsaved-draft-key-999999', 'Unsaved API Key draft must be preserved');
  assert.equal(firstHandle.root.getAttribute('data-ag-cs-lang'), 'zh-CN', 'Language update must still apply cleanly');

  fakeWin.__agPrismSuggester.destroy();
});

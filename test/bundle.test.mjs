import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const cdp = require('../cdp.js');

test('buildInjectExpression and REMOVE_EXPRESSION compile cleanly and stay within budget (< 690 KiB)', () => {
  const injectExpr = cdp.buildInjectExpression();
  const removeExpr = cdp.REMOVE_EXPRESSION;
  const payloadBytes = Buffer.byteLength(injectExpr, 'utf8');
  assert.doesNotThrow(() => new vm.Script(injectExpr));
  assert.doesNotThrow(() => new vm.Script(removeExpr));
  assert.ok(payloadBytes < 690 * 1024, `Expected unified Prism payload < 690KB, got ${payloadBytes} bytes`);
  assert.ok(injectExpr.includes('ag-prism-css'));
  assert.ok(injectExpr.includes('ag-cs-home-panel'));
  assert.equal(injectExpr.includes('__agCsPerfAssets'), false);
  assert.equal(injectExpr.includes('__agCsEffortCore'), false);
  assert.ok(removeExpr.includes('window.__agPrism.destroy'));
  for (const token of [
    'data-ag-cs-scroll-bottom',
    'data-ag-cs-sb-fold',
    '__agPrismInlineDiffResolve',
    '__agPrismInlineDiff',
    '__agPrismInlineDiffFactory',
    'ag-prism-inline-diff-css',
    'data-pv-warn',
    'data-ag-inline-diff-open',
    'data-ag-inline-diff-host',
    'data-ag-sb-more-hidden',
    'data-ag-sb-more-item',
    'data-ag-scrolling',
    '.ag-cs-inline-diff-box',
    '.ag-cs-sb-more-wrap',
    '.ag-v2-habitat-prop',
  ]) {
    assert.ok(removeExpr.includes(token), `REMOVE_EXPRESSION must clean ${token}`);
  }
  assert.equal(removeExpr.includes('data-ag-perm-hosted'), false, 'REMOVE_EXPRESSION must drop obsolete data-ag-perm-hosted');
  assert.equal(removeExpr.includes('.ag-cs-perm-deck'), false, 'REMOVE_EXPRESSION must drop obsolete .ag-cs-perm-deck');
});

test('inject expression mounts cleanly without model-button or telemetry conflict, and REMOVE_EXPRESSION restores DOM', async () => {
  function makeNode(tag, opts = {}) {
    const attrs = new Map(Object.entries(opts.attrs || {}));
    const listeners = new Map();
    const children = [];
    const classes = new Set((opts.className || '').split(/\s+/).filter(Boolean));
    const node = {
      tagName: tag.toUpperCase(),
      id: opts.id || '',
      style: {
        _props: {},
        setProperty(k, v) { this._props[k] = String(v); },
        getPropertyValue(k) { return this._props[k] || ''; },
        removeProperty(k) { delete this._props[k]; },
      },
      classList: {
        contains: (c) => classes.has(c),
        add: (c) => classes.add(c),
        remove: (c) => classes.delete(c),
      },
      get className() { return Array.from(classes).join(' '); },
      set className(v) { classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => classes.add(c)); },
      children,
      parentElement: null,
      parentNode: null,
      isConnected: true,
      _text: opts.text || '',
      get textContent() {
        return children.length ? children.map((c) => c.textContent).join('') : this._text;
      },
      set textContent(v) {
        children.length = 0;
        this._text = String(v);
      },
      set innerHTML(html) {
        children.length = 0;
        this._html = html;
      },
      get innerHTML() { return this._html || ''; },
      get childElementCount() { return children.length; },
      get firstChild() { return children[0] || null; },
      get nextSibling() {
        if (!this.parentElement) return null;
        const idx = this.parentElement.children.indexOf(this);
        return idx >= 0 ? this.parentElement.children[idx + 1] || null : null;
      },
      get lastElementChild() { return children[children.length - 1] || null; },
      clientWidth: opts.clientWidth ?? 900,
      clientHeight: opts.clientHeight ?? 700,
      width: 0,
      height: 0,
      appendChild(ch) {
        ch.parentElement = this;
        ch.parentNode = this;
        children.push(ch);
        return ch;
      },
      insertBefore(ch, ref) {
        ch.parentElement = this;
        ch.parentNode = this;
        const idx = ref ? children.indexOf(ref) : -1;
        if (idx >= 0) children.splice(idx, 0, ch);
        else children.push(ch);
        return ch;
      },
      removeChild(ch) {
        const idx = children.indexOf(ch);
        if (idx >= 0) children.splice(idx, 1);
        ch.parentElement = null;
        ch.parentNode = null;
        return ch;
      },
      remove() {
        if (this.parentElement) this.parentElement.removeChild(this);
      },
      setAttribute(k, v) {
        attrs.set(k, String(v));
        if (k === 'id') this.id = String(v);
      },
      getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
      hasAttribute(k) { return attrs.has(k); },
      removeAttribute(k) { attrs.delete(k); },
      toggleAttribute(k, force) {
        const on = force === undefined ? !attrs.has(k) : Boolean(force);
        if (on) attrs.set(k, ''); else attrs.delete(k);
        return on;
      },
      addEventListener(ev, cb) {
        if (!listeners.has(ev)) listeners.set(ev, []);
        listeners.get(ev).push(cb);
      },
      removeEventListener(ev, cb) {
        const arr = listeners.get(ev);
        if (!arr) return;
        const idx = arr.indexOf(cb);
        if (idx >= 0) arr.splice(idx, 1);
      },
      dispatch(ev, payload = {}) {
        const list = listeners.get(ev) || [];
        for (const fn of [...list]) fn({ type: ev, stopPropagation() {}, preventDefault() {}, ...payload });
      },
      getContext() { return null; },
      getBoundingClientRect() { return { left: 0, top: 0, right: 480, bottom: 300, width: 480, height: 300 }; },
      animate() { return { cancel() {}, finished: Promise.resolve() }; },
      closest(sel) {
        let cur = this;
        while (cur) {
          if (matches(cur, sel)) return cur;
          cur = cur.parentElement;
        }
        return null;
      },
      querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
      querySelectorAll(sel) {
        const out = [];
        const walk = (n) => {
          for (const c of n.children) {
            if (matches(c, sel)) out.push(c);
            walk(c);
          }
        };
        walk(this);
        return out;
      },
    };
    return node;
  }

  function matchesSimple(node, simple) {
    let rest = simple.trim();
    if (!rest) return false;
    const tagMatch = /^[a-zA-Z0-9_-]+/.exec(rest);
    if (tagMatch) {
      if (node.tagName !== tagMatch[0].toUpperCase()) return false;
      rest = rest.slice(tagMatch[0].length);
    }
    while (rest.length > 0) {
      if (rest[0] === '#') {
        const m = /^#([a-zA-Z0-9_-]+)/.exec(rest);
        if (!m || node.id !== m[1]) return false;
        rest = rest.slice(m[0].length);
      } else if (rest[0] === '.') {
        const m = /^\.([a-zA-Z0-9_-]+)/.exec(rest);
        if (!m || !node.classList.contains(m[1])) return false;
        rest = rest.slice(m[0].length);
      } else if (rest[0] === '[') {
        const m = /^\[([^\]=]+)(?:="([^"]*)")?\]/.exec(rest);
        if (!m) return false;
        const ok = m[2] === undefined ? node.hasAttribute(m[1]) : node.getAttribute(m[1]) === m[2];
        if (!ok) return false;
        rest = rest.slice(m[0].length);
      } else {
        return false;
      }
    }
    return true;
  }

  function matches(node, selector) {
    return selector.split(',').some((part) => {
      const tokens = part.trim().split(/\s+/).filter(Boolean);
      if (tokens.length === 0) return false;
      if (!matchesSimple(node, tokens[tokens.length - 1])) return false;
      let cur = node.parentElement;
      let idx = tokens.length - 2;
      while (cur && idx >= 0) {
        if (matchesSimple(cur, tokens[idx])) idx--;
        cur = cur.parentElement;
      }
      return idx < 0;
    });
  }

  const html = makeNode('html');
  const head = makeNode('head');
  const body = makeNode('body', { className: 'theme-dark' });
  html.appendChild(head);
  html.appendChild(body);

  // Build simulated Antigravity Home DOM
  const home = makeNode('div', { className: 'agy-home' });
  const scrollWrap = makeNode('div');
  const scrollCol = makeNode('div');
  const greeting = makeNode('div', { attrs: { 'data-testid': 'home-greeting' } });
  const h1 = makeNode('h1', { className: 'home-greeting-title', text: 'Welcome back, girl. Where should we pick up?' });
  greeting.appendChild(h1);
  scrollCol.appendChild(greeting);
  scrollWrap.appendChild(scrollCol);
  home.appendChild(scrollWrap);

  const inputBox = makeNode('div', { id: 'antigravity.agentSidePanelInputBox', attrs: { 'data-testid': 'agent-input-box' } });
  const queuedWrap = makeNode('div', { className: 'relative z-[1] flex flex-col gap-2 w-full hidden-if-empty mb-2' });
  const queuedCard = makeNode('div', { text: '排队中的消息 1 · 智能体完成后发送' });
  queuedWrap.appendChild(queuedCard);
  inputBox.appendChild(queuedWrap);
  const composerShell = makeNode('div', { id: 'antigravity.agentSidePanelInputBox', className: 'surface-composer' });
  const card = makeNode('div', { className: 'surface-composer-card' });
  const editorWrap = makeNode('div', { className: 'relative w-full' });
  const placeholder = makeNode('p', { className: 'pointer-events-none', text: '有问题尽管问' });
  const editorEl = makeNode('div', { attrs: { contenteditable: 'true', 'data-lexical-editor': 'true' } });
  editorWrap.appendChild(placeholder);
  editorWrap.appendChild(editorEl);
  const footer = makeNode('div', { className: 'agy-composer-footer' });
  const modelBtn = makeNode('button', { attrs: { 'data-testid': 'model-selector-trigger' } });
  const modelSpan = makeNode('span', { text: 'Gemini 4 Argon' });
  const effortSpan = makeNode('span', { className: 'opacity-70', text: ' Low' });
  modelSpan.appendChild(effortSpan);
  modelBtn.appendChild(modelSpan);
  footer.appendChild(modelBtn);
  card.appendChild(editorWrap);
  card.appendChild(footer);
  composerShell.appendChild(card);
  inputBox.appendChild(composerShell);
  home.appendChild(inputBox);
  body.appendChild(home);

  // Simulated Settings dialog containing General BEFORE Appearance
  const dialog = makeNode('div', { attrs: { role: 'dialog' } });
  const generalPanel = makeNode('div', { className: 'p-6 flex flex-col gap-4' });
  const generalH2 = makeNode('h2', { text: '常规' });
  const generalSec = makeNode('div', { className: 'space-y-2' });
  generalPanel.appendChild(generalH2);
  generalPanel.appendChild(generalSec);
  const appearancePanel = makeNode('div', { className: 'p-6 flex flex-col gap-4' });
  const appearanceH2 = makeNode('h2', { text: '外观' });
  const appearanceWrap = makeNode('div', { className: 'flex flex-col gap-8' });
  const appearanceSec = makeNode('div', { className: 'space-y-2' });
  appearanceWrap.appendChild(appearanceSec);
  appearancePanel.appendChild(appearanceH2);
  appearancePanel.appendChild(appearanceWrap);
  dialog.appendChild(generalPanel);
  dialog.appendChild(appearancePanel);
  body.appendChild(dialog);

  const docListeners = new Map();
  const doc = {
    documentElement: html,
    head,
    body,
    hidden: false,
    createElement: (t) => makeNode(t),
    getElementById: (id) => html.querySelector('#' + id),
    querySelector: (s) => html.querySelector(s),
    querySelectorAll: (s) => html.querySelectorAll(s),
    addEventListener(ev, fn) {
      if (!docListeners.has(ev)) docListeners.set(ev, []);
      docListeners.get(ev).push(fn);
    },
    removeEventListener(ev, fn) {
      const arr = docListeners.get(ev);
      if (!arr) return;
      const idx = arr.indexOf(fn);
      if (idx >= 0) arr.splice(idx, 1);
    },
  };

  const timers = new Set();
  const winListeners = new Map();
  const sandbox = {
    window: null,
    globalThis: null,
    document: doc,
    navigator: { language: 'zh-CN' },
    location: { pathname: '/' },
    addEventListener(ev, cb) {
      if (!winListeners.has(ev)) winListeners.set(ev, []);
      winListeners.get(ev).push(cb);
    },
    removeEventListener(ev, cb) {
      const arr = winListeners.get(ev);
      if (!arr) return;
      const idx = arr.indexOf(cb);
      if (idx >= 0) arr.splice(idx, 1);
    },
    dispatchWin(ev, payload = {}) {
      for (const fn of [...(winListeners.get(ev) || [])]) fn({ type: ev, ...payload });
    },
    // Inject stale legacy localStorage flags to assert DISABLED_LEGACY_FLAGS locks them off
    localStorage: {
      _m: {
        'agClaudeStyle.settings.v1': JSON.stringify({
          palette: 'host',
          composerRestyle: false,
        }),
        'agClaudeStyle.settings.v3': JSON.stringify({
        }),
      },
      getItem(k) { return this._m[k] || null; },
      setItem(k, v) { this._m[k] = String(v); },
    },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    matchMedia: () => ({ matches: false }),
    MutationObserver: class { observe() {} disconnect() {} },
    ResizeObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame: (fn) => { const id = setTimeout(() => fn(typeof fakeNow === 'number' ? fakeNow : Date.now()), 8); timers.add(id); return id; },
    cancelAnimationFrame: (id) => { timers.delete(id); clearTimeout(id); },
    setTimeout: (fn, ms) => { const id = setTimeout(fn, ms); timers.add(id); return id; },
    clearTimeout: (id) => { timers.delete(id); clearTimeout(id); },
    setInterval: () => 1,
    clearInterval: () => {},
    performance: { now: () => Date.now() },
    Math, Date, JSON, Map, Set, Array, Object, String, Number, Boolean, Promise, Uint8Array, Float32Array, Intl,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  try {
    const res = vm.runInNewContext(cdp.buildInjectExpression(cdp.DEFAULT_CONFIG), sandbox);
    assert.equal(res.status, 'ok');
    assert.equal(html.getAttribute('data-ag-cs-style'), '1');
    assert.equal(html.getAttribute('data-ag-cs-palette'), 'obsidian');
    assert.equal(html.getAttribute('data-ag-cs-home'), 'studio');
    assert.equal(h1.textContent, '接下来做什么？');
    assert.equal(placeholder.getAttribute('data-ag-cs-placeholder'), '描述任务或提出问题');

    // Coexistence & zero-interference guarantees
    assert.equal(sandbox.window.__agCsI18n, undefined);
    assert.equal(sandbox.globalThis.__agCsEffortCore, undefined);
    assert.equal(sandbox.globalThis.__agCsPerfAssets, undefined);
    assert.equal(sandbox.window.__agClaudeStyle.openEffortPopover, undefined);
    assert.equal(sandbox.window.__agClaudeStyle.openContextPopover, undefined);
    assert.equal(effortSpan.hasAttribute('data-ag-cs-effort'), false);
    assert.equal(effortSpan.classList.contains('ag-cs-effort-badge'), false);
    assert.equal(
      body.querySelectorAll('.ag-cs-inline-stats, .ag-cs-context-ring, .ag-cs-ctx-popover, .ag-cs-effort-popover, .ag-cs-turn-bar, .ag-cs-perf-backdrop').length,
      0
    );

    // Ensure document does NOT register click/mousedown/keydown capture interceptors for model selector
    assert.equal((docListeners.get('click') || []).length, 0);
    assert.equal((docListeners.get('mousedown') || []).length, 0);
    let stopped = false;
    let prevented = false;
    for (const fn of docListeners.get('pointerdown') || []) {
      fn({
        type: 'pointerdown',
        target: effortSpan,
        stopPropagation() { stopped = true; },
        stopImmediatePropagation() { stopped = true; },
        preventDefault() { prevented = true; },
      });
    }
    assert.equal(stopped, false);
    assert.equal(prevented, false);

    // Legacy telemetry flags forced off even when stored in localStorage
    assert.ok(sandbox.window.__agPrism, 'Expected window.__agPrism exposed');
    assert.equal(sandbox.window.__agClaudeStyle, sandbox.window.__agPrism, 'Expected legacy alias pointing to __agPrism');
    const st = sandbox.window.__agPrism.getState();
    assert.equal(st.version, '1.0.7');
    assert.equal(html.getAttribute('data-ag-prism'), '1.0.7');
    assert.equal(html.getAttribute('data-ag-cs-light-preset'), 'crystal');
    assert.equal(html.getAttribute('data-ag-cs-telemetry'), 'auto');
    assert.equal(html.getAttribute('data-ag-cs-effort-slider'), 'auto');
    assert.equal(st.cfg.palette, 'obsidian');

    // Home UI mounts, optical glyph & prism rim mount (without hairline orbital backdrop), and Clawd queued clearance works
    assert.ok(head.querySelector('#ag-prism-css'));
    assert.ok(home.querySelector('.ag-cs-home-panel'));
    assert.equal(home.querySelector('.ag-cs-orbital-backdrop'), null, 'Home Studio must not inject hairline .ag-cs-orbital-backdrop');
    assert.ok(home.querySelector('.ag-cs-ripple-host'));
    assert.ok(home.querySelector('.ag-cs-brand-glow'));
    assert.ok(home.querySelector('.ag-cs-ripple-canvas'));
    assert.ok(card.querySelector('.ag-cs-crab'));
    assert.equal(card.getAttribute('data-ag-cs-prism-box'), '1');
    const glyph = modelBtn.querySelector('.ag-cs-model-glyph');
    assert.ok(glyph, 'Expected official brand model glyph on model-selector-trigger');
    assert.equal(modelBtn.firstChild, glyph);
    assert.equal(glyph.getAttribute('data-brand'), 'gemini');
    assert.equal(glyph.getAttribute('data-tier'), 'low');
    assert.equal(queuedWrap.getAttribute('data-ag-cs-queued'), '1');
    assert.equal(queuedWrap.style.getPropertyValue('margin-bottom'), '46px');

    // Smooth typing caret overlay is mounted on editor host
    assert.equal(editorWrap.getAttribute('data-ag-cs-caret-host'), '1');
    assert.ok(editorWrap.querySelector('.ag-cs-smooth-caret'));

    // Prismatic CSS tokens & GPU compositor blur purge rules
    const injectedCss = head.querySelector('#ag-prism-css')?.textContent || '';
    assert.equal(injectedCss.includes('blur(20px) saturate(140%)'), false, 'Heavy composer backdrop-filter must be purged');
    assert.ok(
      injectedCss.includes('border-radius: 4px') ||
        injectedCss.includes('border-radius:4px') ||
        injectedCss.includes('--ag-cs-r-sm:4px') ||
        injectedCss.includes('--ag-cs-r-sm: 4px')
    );
    assert.ok(injectedCss.includes('margin-bottom: 46px !important') || injectedCss.includes('margin-bottom:46px!important'));
    assert.ok(injectedCss.includes('z-index: 12 !important') || injectedCss.includes('z-index:12!important'));
    assert.equal(injectedCss.includes('.ag-cs-effort-popover'), false);
    assert.equal(injectedCss.includes('.ag-cs-ctx-popover'), false);

    // Settings section mounts ONLY in Appearance, rebranded to Obsidian Prism collapsible banner + About & 6 credits
    assert.equal(sandbox.window.__agPrism.brand, 'Obsidian Prism');
    assert.equal(generalPanel.querySelector('#ag-cs-settings-sec'), null);
    const settingsSec = appearancePanel.querySelector('#ag-cs-settings-sec');
    assert.ok(settingsSec);
    assert.equal(settingsSec.querySelector('h3')?.textContent, 'Obsidian Prism · 黑曜棱镜');
    assert.equal(settingsSec.querySelector('.ag-cs-settings-ver')?.textContent, 'v1.0.7');
    const brandMarkHtml = settingsSec.querySelector('.ag-cs-settings-brand-mark')?.innerHTML || '';
    assert.ok(
      brandMarkHtml.includes('ag-cs-brand-logo-svg') || brandMarkHtml.includes('ag-cs-settings-brand-svg'),
      'Expected vector Obsidian Prism brand mark in collapsible header'
    );

    // Default collapsed ('0') on first visit; clicking banner expands and persists '1'
    const foldHead = settingsSec.querySelector('.ag-cs-settings-fold-head');
    const foldBody = settingsSec.querySelector('.ag-cs-settings-fold-body');
    assert.ok(foldHead && foldBody, 'Expected collapsible banner header and body');
    assert.equal(settingsSec.getAttribute('data-open'), '0');
    assert.equal(foldHead.getAttribute('aria-expanded'), 'false');
    assert.equal(foldBody.children.length, 0, 'Collapsed settings foldBody must be lazily deferred until first expand');
    foldHead.dispatch('click');
    assert.equal(settingsSec.getAttribute('data-open'), '1');
    assert.equal(foldHead.getAttribute('aria-expanded'), 'true');
    assert.ok(foldBody.children.length > 0, 'Expanding foldHead must lazily hydrate settings foldBody');
    assert.equal(sandbox.localStorage.getItem('ag-prism:settings-open'), '1');

    const settingGroups = settingsSec.querySelectorAll('.ag-cs-settings-group');
    assert.equal(settingGroups.length, 6);
    assert.deepEqual(
      settingGroups.map((g) => g.getAttribute('data-ag-cs-group')),
      ['appearance', 'interaction', 'thought', 'modules', 'beta', 'about']
    );
    const thoughtCfgBoxBefore = settingsSec.querySelector('[data-testid="prism-thought-ai-config"]');
    assert.equal(thoughtCfgBoxBefore, null, 'Default off mode must NOT bundle or mount Channel 5 thought AI config card');
    assert.equal(sandbox.window.__agPrismThought, undefined, 'Default off mode must have 0 thought runtime');
    assert.equal(sandbox.window.__agPrismThoughtSettingsUi, undefined, 'Default off mode must have 0 thought UI runtime');

    // Hot-plug Channel 5 while settings panel is already open
    sandbox.window.__agPrism.refreshConfig({ ...cdp.DEFAULT_CONFIG, thoughtTranslate: 'ai' });
    const thoughtExprAi = cdp.buildThoughtExpression({ ...cdp.DEFAULT_CONFIG, thoughtTranslate: 'ai' });
    assert.ok(thoughtExprAi.length > 0, 'Expected non-empty Channel 5 expression in ai mode');
    const thoughtMountRes = vm.runInNewContext(thoughtExprAi, sandbox);
    assert.equal(thoughtMountRes.ok, true);
    assert.equal(thoughtMountRes.status, 'mounted');
    const thoughtCfgBox = settingsSec.querySelector('[data-testid="prism-thought-ai-config"]');
    assert.ok(thoughtCfgBox, 'Expected built-in OpenAI thought translator config card hot-mounted into open settingsSec');
    assert.equal(thoughtCfgBox.hidden, false, 'Thought AI config card should be visible when mode is ai');

    // Verify About section: Git status/sync button + 8 upstream repo external links + GPL-3.0 & upstream MIT notices + Google disclaimer
    const aboutBox = settingsSec.querySelector('.ag-cs-about-box');
    assert.ok(aboutBox, 'Expected .ag-cs-about-box inside About group');
    const creditLinks = aboutBox.querySelectorAll('a');
    assert.equal(creditLinks.length, 8, 'Expected all 8 upstream credited repository links');
    assert.deepEqual(
      creditLinks.map((a) => a.getAttribute('href')),
      [
        'https://github.com/0DNANCY/agy-claude-style',
        'https://github.com/ATtacK030130/antigrative-dashboard',
        'https://github.com/LLYSH-HANNARI/antigravity-Codex-Claude-effort-slider',
        'https://github.com/yiheng8023/antigravity-chinese',
        'https://github.com/Nwflower/dsh-claude-style',
        'https://github.com/Microqian2th/dsh-codex-effort-slider',
        'https://github.com/mobius/dsh-performance-slider',
        'https://github.com/claudenoshujin/claude-web',
      ]
    );
    for (const a of creditLinks) {
      assert.equal(a.getAttribute('target'), '_blank');
      assert.equal(a.getAttribute('rel'), 'noopener noreferrer');
    }
    const licPreText = aboutBox.querySelector('details.ag-cs-about-license pre')?.textContent || '';
    assert.ok(licPreText.includes('GNU General Public License v3.0'));
    assert.ok(licPreText.includes('RMvdesi'));
    assert.ok(licPreText.includes('MIT License'));
    assert.ok(
      aboutBox.querySelector('.ag-cs-about-disclaimer')?.textContent?.includes('not affiliated with or endorsed by Google LLC')
    );
    assert.ok(aboutBox.querySelector('button[data-ag-cs-repo-sync]'), 'Expected Git sync button in About box');

    const settingKeys = new Set(
      appearancePanel
        .querySelectorAll('#ag-cs-settings-sec button')
        .map((b) => b.getAttribute('data-ag-cs-key'))
        .filter(Boolean)
    );
    assert.equal(settingKeys.size, 35);
    for (const expectedKey of [
      'palette',
      'lightPreset',
      'motionLevel',
      'scrollBottomMotion',
      'targetFps',
      'homeLayout',
      'homeRipple',
      'logoInk',
      'language',
      'hostLocalization',
      'effortMemory',
      'composerRestyle',
      'placeholderStyle',
      'smoothCaret',
      'contextMenu',
      'mascot',
      'sidebarRestyle',
      'sidebarCompact',
      'sidebarNavFold',
      'thoughtTranslate',
      'thoughtTrigger',
      'telemetryModule',
      'sidebarStudio',
      'autoUpdate',
      'updateChannel',
      'effortSliderModule',
      'effortSliderStyle',
      'accentTone',
      'cornerStyle',
      'codeFont',
      'codeLigatures',
      'ambientIntensity',
      'thoughtView',
    ]) {
      assert.ok(settingKeys.has(expectedKey), `Missing settings control for ${expectedKey}`);
    }

    // Verify all 5 language buttons switch dashboard, greeting, placeholder & settings copy + emit CDP binding
    const bindingCalls = [];
    sandbox[cdp.SETTING_BINDING] = (payload) => bindingCalls.push(JSON.parse(payload));
    const getLangBtns = () =>
      appearancePanel
        .querySelectorAll('#ag-cs-settings-sec button')
        .filter((b) => b.getAttribute('data-ag-cs-key') === 'language');

    const checkLangSwitch = (targetLang, hostTitle, expectedSettingsLangTitle, expectedOverviewTab, expectedGreeting, expectedPlaceholder) => {
      appearanceH2.textContent = hostTitle;
      const btn = getLangBtns().find((b) => b.getAttribute('data-ag-cs-val') === JSON.stringify(targetLang));
      assert.ok(btn, `Expected language button for ${targetLang}`);
      btn.dispatch('click');
      assert.equal(html.getAttribute('data-ag-cs-lang'), targetLang);
      const secNow = appearancePanel.querySelector('#ag-cs-settings-sec');
      assert.ok(secNow);
      assert.equal(secNow.getAttribute('data-ag-cs-lang'), targetLang);
      assert.equal(secNow.querySelector('[data-ag-cs-row="language"] [data-k="t"]')?.textContent, expectedSettingsLangTitle);
      assert.equal(home.querySelector('.ag-cs-home-tab[data-tab="overview"]')?.textContent, expectedOverviewTab);
      assert.equal(h1.textContent, expectedGreeting);
      assert.equal(placeholder.getAttribute('data-ag-cs-placeholder'), expectedPlaceholder);
    };

    checkLangSwitch('zh-TW', '外觀', '介面語言', '概覽', '接下來做什麼？', '描述任務或提出問題');
    checkLangSwitch('yue', '外觀', '介面語言', '概覽', '跟住想做啲咩？', '寫低你想做嘅任務或者問題');
    checkLangSwitch('en', 'Appearance', 'UI Language', 'Overview', "What's up next?", 'How can I help you today?');
    assert.equal(html.hasAttribute('data-ag-cs-cjk'), false);
    checkLangSwitch('ja', '外観', '表示言語', '概要', '次は何をしますか？', 'タスクの説明や質問を入力してください');
    assert.equal(html.getAttribute('data-ag-cs-cjk'), '1');
    checkLangSwitch('zh-CN', '外观', '界面语言', '概览', '接下来做什么？', '描述任务或提出问题');

    assert.deepEqual(
      bindingCalls.map((c) => [c.key, c.value]),
      [
        ['language', 'zh-TW'],
        ['language', 'yue'],
        ['language', 'en'],
        ['language', 'ja'],
        ['language', 'zh-CN'],
      ]
    );
    appearanceH2.textContent = '外观';

    // Switching palette/mascot externally syncs root attrs & setting button active state immediately (claude alias normalized to warm)
    sandbox.window.__agPrism.refreshConfig({ ...cdp.DEFAULT_CONFIG, palette: 'claude' });
    assert.equal(html.getAttribute('data-ag-cs-palette'), 'warm');
    const warmBtn = appearancePanel
      .querySelectorAll('#ag-cs-settings-sec button')
      .find((b) => b.getAttribute('data-ag-cs-key') === 'palette' && b.getAttribute('data-ag-cs-val') === '"warm"');
    assert.ok(warmBtn, 'Expected Alabaster Warm palette button');
    assert.equal(warmBtn.textContent, 'Alabaster 暖岩');
    assert.equal(warmBtn.getAttribute('aria-pressed'), 'true');
    assert.equal(warmBtn.hasAttribute('data-pressed'), true);

    // Verify Wave 2 6 new settings root attributes, saveSettingsBatch (`patch-batch`), and hostEnhancer integration
    assert.equal(sandbox.window.__agPrism.getState().hasHostEnhancer, true);
    assert.equal(html.getAttribute('data-ag-cs-accent'), 'follow');
    assert.equal(html.getAttribute('data-ag-cs-corners'), 'balanced');
    assert.equal(html.getAttribute('data-ag-cs-code-font'), 'default');
    assert.equal(html.getAttribute('data-ag-cs-ligatures'), '0');
    assert.equal(html.getAttribute('data-ag-cs-ambient'), '1');
    assert.equal(html.getAttribute('data-ag-prism-thought-view'), null);

    const beforeBatchLen = bindingCalls.length;
    sandbox.window.__agPrism.saveSettingsBatch({
      accentTone: 'iris',
      cornerStyle: 'soft',
      codeFont: 'jetbrains',
      codeLigatures: true,
      ambientIntensity: '70',
      thoughtTranslate: 'machine',
      thoughtView: 'bilingual',
    });
    assert.equal(html.getAttribute('data-ag-cs-accent'), 'iris');
    assert.equal(html.getAttribute('data-ag-cs-corners'), 'soft');
    assert.equal(html.getAttribute('data-ag-cs-code-font'), 'jetbrains');
    assert.equal(html.getAttribute('data-ag-cs-ligatures'), '1');
    assert.equal(html.getAttribute('data-ag-cs-ambient'), '0.7');
    assert.equal(html.getAttribute('data-ag-prism-thought-view'), 'bilingual');
    const batchCall = bindingCalls.slice(beforeBatchLen).find((c) => c.action === 'patch-batch');
    assert.ok(batchCall, 'Expected patch-batch payload over setting binding');
    assert.equal(batchCall.entries.accentTone, 'iris');
    assert.equal(batchCall.entries.ambientIntensity, '70');
    assert.equal(html.getAttribute('data-ag-cs-target-fps'), '180');

    // HS-1: mascot 'minis' ("双宠+三蟹") must be preserved verbatim over wire (never downgraded to 'crab')
    const beforeMinisLen = bindingCalls.length;
    sandbox.window.__agPrism.saveSettingsBatch({ mascot: 'minis', targetFps: '120' });
    const minisBatch = bindingCalls.slice(beforeMinisLen).find((c) => c.action === 'patch-batch');
    assert.equal(minisBatch?.entries?.mascot, 'minis');
    assert.equal(html.getAttribute('data-ag-cs-target-fps'), '120');

    // HS-5: disabling sidebarRestyle unlocks any active `[` collapsed attribute
    html.setAttribute('data-ag-cs-sidebar-collapsed', '1');
    sandbox.window.__agPrism.saveSettingsBatch({ sidebarRestyle: false });
    assert.equal(html.hasAttribute('data-ag-cs-sidebar-collapsed'), false);

    // CP-2: file-driven config refresh updates mutable base config so cross-window `storage` events & zero-arg refreshConfig() never roll back to boot defaults
    sandbox.window.__agPrism.refreshConfig({ ...cdp.DEFAULT_CONFIG, palette: 'warm', accentTone: 'cobalt', __fromFile: true });
    assert.equal(html.getAttribute('data-ag-cs-palette'), 'warm');
    assert.equal(html.getAttribute('data-ag-cs-accent'), 'cobalt');
    sandbox.dispatchWin('storage', { key: 'ag-prism:config' });
    assert.equal(html.getAttribute('data-ag-cs-palette'), 'warm', 'Cross-window storage sync must not revert file-refreshed palette');
    sandbox.window.__agPrism.refreshConfig();
    assert.equal(html.getAttribute('data-ag-cs-palette'), 'warm', 'Zero-arg refreshConfig() must not revert file-refreshed palette');
    assert.equal(html.getAttribute('data-ag-cs-accent'), 'cobalt');

    // Verify sidebarNavFold defaults to 'off', toggles data-ag-cs-sb-fold & getState().cfg, and REMOVE_EXPRESSION cleans it + __agPrismInlineDiffResolve
    assert.equal(html.getAttribute('data-ag-cs-sb-fold'), 'off');
    assert.equal(sandbox.window.__agPrism.getState().cfg.sidebarNavFold, 'off');
    sandbox.window.__agPrism.saveSettingsBatch({ sidebarNavFold: 'on' });
    assert.equal(html.getAttribute('data-ag-cs-sb-fold'), 'on');
    assert.equal(sandbox.window.__agPrism.getState().cfg.sidebarNavFold, 'on');
    sandbox.window.__agPrismInlineDiffResolve = () => {};

    // Teardown cleanly removes everything and restores host greeting text
    const rem = vm.runInNewContext(cdp.REMOVE_EXPRESSION, sandbox);
    assert.ok(rem.removed >= 1);
    assert.equal(html.hasAttribute('data-ag-prism'), false);
    assert.equal(html.hasAttribute('data-ag-cs-sb-fold'), false);
    assert.equal(sandbox.window.__agPrismInlineDiffResolve, undefined);
    assert.equal(html.hasAttribute('data-ag-cs-target-fps'), false);
    assert.equal(html.hasAttribute('data-ag-cs-style'), false);
    assert.equal(html.hasAttribute('data-ag-cs-light-preset'), false);
    assert.equal(html.hasAttribute('data-ag-cs-telemetry'), false);
    assert.equal(html.hasAttribute('data-ag-cs-effort-slider'), false);
    assert.equal(html.hasAttribute('data-ag-cs-thought-translate'), false);
    assert.equal(html.hasAttribute('data-ag-cs-accent'), false);
    assert.equal(html.hasAttribute('data-ag-cs-corners'), false);
    assert.equal(html.hasAttribute('data-ag-cs-code-font'), false);
    assert.equal(html.hasAttribute('data-ag-cs-ligatures'), false);
    assert.equal(html.hasAttribute('data-ag-cs-ambient'), false);
    assert.equal(html.hasAttribute('data-ag-prism-thought-view'), false);
    assert.equal(sandbox.window.__agPrismThought, undefined);
    assert.equal(sandbox.globalThis.__agPrismHostEnhancer, undefined);
    assert.equal(html.hasAttribute('data-ag-cs-lang'), false);
    assert.equal(html.hasAttribute('data-ag-cs-cjk'), false);
    assert.equal(sandbox.globalThis.__agCsCleanups, undefined);
    assert.equal(h1.textContent, 'Welcome back, girl. Where should we pick up?');
    assert.equal(placeholder.hasAttribute('data-ag-cs-placeholder'), false);
    assert.equal(effortSpan.hasAttribute('data-ag-cs-effort'), false);
    assert.equal(home.querySelector('.ag-cs-home-panel'), null);
    assert.equal(home.querySelector('.ag-cs-orbital-backdrop'), null);
    assert.equal(home.querySelector('.ag-cs-ripple-host'), null);
    assert.equal(home.querySelector('.ag-cs-brand-glow'), null);
    assert.equal(home.querySelector('.ag-cs-ripple-canvas'), null);
    assert.equal(card.querySelector('.ag-cs-crab'), null);
    assert.equal(card.hasAttribute('data-ag-cs-prism-box'), false);
    assert.equal(modelBtn.querySelector('.ag-cs-model-glyph'), null);
    assert.equal(sandbox.globalThis.__agDualMascotRig, undefined);
    assert.equal(sandbox.globalThis.__agCrystalPrismCore, undefined);
    assert.equal(sandbox.globalThis.__agVialCore, undefined);
    assert.equal(sandbox.globalThis.__agMotionEngine, undefined);
    assert.equal(sandbox.globalThis.__agAnimatedIcons, undefined);
    assert.equal(sandbox.globalThis.__agCsPulseVialBridge, undefined);
    assert.equal(dialog.querySelector('#ag-cs-settings-sec'), null);
  } finally {
    for (const id of timers) clearTimeout(id);
  }
});

test('buildInjectExpression defers cleanly when documentElement is null at document-start and mounts on DOMContentLoaded', () => {
  const docListeners = new Map();
  let htmlEl = null;
  let headEl = null;
  let bodyEl = null;
  const attrs = new Map();
  const makeStub = (tag) => ({
    tagName: tag.toUpperCase(),
    id: '',
    children: [],
    parentNode: null,
    parentElement: null,
    classList: { contains: () => false, add() {}, remove() {} },
    get lastElementChild() { return this.children[this.children.length - 1] || null; },
    appendChild(c) { c.parentNode = this; c.parentElement = this; this.children.push(c); return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; c.parentElement = null; return c; },
    remove() { if (this.parentElement) this.parentElement.removeChild(this); },
    setAttribute(k, v) { attrs.set(k, String(v)); if (k === 'id') this.id = String(v); },
    getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
    hasAttribute(k) { return attrs.has(k); },
    removeAttribute(k) { attrs.delete(k); },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    style: { setProperty() {}, getPropertyValue() { return ''; }, removeProperty() {} },
  });

  const doc = {
    get documentElement() { return htmlEl; },
    get head() { return headEl; },
    get body() { return bodyEl; },
    hidden: false,
    readyState: 'loading',
    createElement: (t) => makeStub(t),
    getElementById(id) {
      return headEl?.children?.find((c) => c.id === id) || htmlEl?.children?.find((c) => c.id === id) || null;
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener(ev, fn) {
      if (!docListeners.has(ev)) docListeners.set(ev, []);
      docListeners.get(ev).push(fn);
    },
    removeEventListener(ev, fn) {
      const arr = docListeners.get(ev);
      if (!arr) return;
      const idx = arr.indexOf(fn);
      if (idx >= 0) arr.splice(idx, 1);
    },
  };

  const observedNodes = [];
  const timers = new Set();
  const winListeners = new Map();
  const sandbox = {
    window: null,
    globalThis: null,
    document: doc,
    navigator: { language: 'zh-CN' },
    location: { pathname: '/' },
    addEventListener(ev, cb) {
      if (!winListeners.has(ev)) winListeners.set(ev, []);
      winListeners.get(ev).push(cb);
    },
    removeEventListener(ev, cb) {
      const arr = winListeners.get(ev);
      if (!arr) return;
      const idx = arr.indexOf(cb);
      if (idx >= 0) arr.splice(idx, 1);
    },
    dispatchWin(ev, payload = {}) {
      for (const fn of [...(winListeners.get(ev) || [])]) fn({ type: ev, ...payload });
    },
    localStorage: { _m: {}, getItem(k) { return this._m[k] || null; }, setItem(k, v) { this._m[k] = String(v); } },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    matchMedia: () => ({ matches: false }),
    MutationObserver: class {
      observe(node) {
        if (!node) throw new TypeError('parameter 1 is not of type Node');
        observedNodes.push(node);
      }
      disconnect() {}
    },
    ResizeObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame: (fn) => { const id = setTimeout(() => fn(typeof fakeNow === 'number' ? fakeNow : Date.now()), 8); timers.add(id); return id; },
    cancelAnimationFrame: (id) => { timers.delete(id); clearTimeout(id); },
    setTimeout: (fn, ms) => { const id = setTimeout(fn, ms); timers.add(id); return id; },
    clearTimeout: (id) => { timers.delete(id); clearTimeout(id); },
    setInterval: () => 1,
    clearInterval: () => {},
    performance: { now: () => Date.now() },
    Math, Date, JSON, Map, Set, Array, Object, String, Number, Boolean, Promise, Uint8Array, Float32Array, Intl,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  try {
    const res = vm.runInNewContext(cdp.buildInjectExpression(), sandbox);
    assert.equal(res.status, 'deferred');
    assert.equal(sandbox.window.__agClaudeStyle, undefined);

    htmlEl = makeStub('html');
    headEl = makeStub('head');
    bodyEl = makeStub('body');
    htmlEl.appendChild(headEl);
    htmlEl.appendChild(bodyEl);
    doc.readyState = 'interactive';
    for (const fn of [...(docListeners.get('DOMContentLoaded') || [])]) fn();

    assert.ok(sandbox.window.__agPrism, 'Expected __agPrism to mount after DOMContentLoaded');
    assert.ok(observedNodes.includes(htmlEl), 'Expected root observer to observe htmlEl');
    assert.ok(headEl.children.some((c) => c.id === cdp.STYLE_ID));
    assert.equal(attrs.get('data-ag-cs-style'), '1');

    vm.runInNewContext(cdp.REMOVE_EXPRESSION, sandbox);
    assert.equal(sandbox.window.__agClaudeStyle, undefined);
  } finally {
    for (const id of timers) clearTimeout(id);
  }
});

test('Q&A takeover card, side-question panel, and running tasks clear Clawd mascot without double spacing', async () => {
  const timers = new Set();
  const makeEl = (tag, opts = {}) => {
    const attrs = new Map(Object.entries(opts.attrs || {}));
    const classes = new Set((opts.className || '').split(/\s+/).filter(Boolean));
    const children = [];
    const matchesSimple = (node, simple) => {
      let rest = simple.trim();
      if (!rest) return false;
      const tagMatch = /^[a-zA-Z0-9_-]+/.exec(rest);
      if (tagMatch) {
        if (node.tagName !== tagMatch[0].toUpperCase()) return false;
        rest = rest.slice(tagMatch[0].length);
      }
      while (rest.length > 0) {
        if (rest[0] === '#') {
          const m = /^#((?:\\.|[a-zA-Z0-9_-])+)/.exec(rest);
          if (!m || node.id !== m[1].replace(/\\/g, '')) return false;
          rest = rest.slice(m[0].length);
        } else if (rest[0] === '.') {
          const m = /^\.([a-zA-Z0-9_-]+)/.exec(rest);
          if (!m || !node.classList.contains(m[1])) return false;
          rest = rest.slice(m[0].length);
        } else if (rest[0] === '[') {
          const m = /^\[([^\]=]+)(?:="([^"]*)")?\]/.exec(rest);
          if (!m) return false;
          const ok = m[2] === undefined ? node.hasAttribute(m[1]) : node.getAttribute(m[1]) === m[2];
          if (!ok) return false;
          rest = rest.slice(m[0].length);
        } else {
          return false;
        }
      }
      return true;
    };
    const matchesChain = (node, selector) =>
      selector.split(',').some((part) => {
        const tokens = part.trim().split(/\s+/).filter(Boolean);
        if (tokens.length === 0 || !matchesSimple(node, tokens[tokens.length - 1])) return false;
        let cur = node.parentElement;
        let idx = tokens.length - 2;
        while (cur && idx >= 0) {
          if (matchesSimple(cur, tokens[idx])) idx -= 1;
          cur = cur.parentElement;
        }
        return idx < 0;
      });
    const node = {
      tagName: tag.toUpperCase(),
      id: attrs.get('id') || opts.id || '',
      children,
      parentElement: null,
      parentNode: null,
      isConnected: true,
      _text: opts.text || '',
      clientWidth: 640,
      offsetWidth: 640,
      clientHeight: 40,
      offsetHeight: 40,
      style: {
        _props: {},
        setProperty(k, v) { this._props[k] = String(v); },
        getPropertyValue(k) { return this._props[k] || ''; },
        removeProperty(k) { delete this._props[k]; },
      },
      classList: {
        contains: (c) => classes.has(c),
        add: (c) => classes.add(c),
        remove: (c) => classes.delete(c),
      },
      get className() { return Array.from(classes).join(' '); },
      set className(v) { classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => classes.add(c)); },
      get textContent() { return children.length ? children.map((c) => c.textContent).join('') : this._text; },
      set textContent(v) { children.length = 0; this._text = String(v); },
      get childElementCount() { return children.length; },
      get firstChild() { return children[0] || null; },
      get nextSibling() {
        if (!this.parentElement) return null;
        const i = this.parentElement.children.indexOf(this);
        return i >= 0 ? this.parentElement.children[i + 1] || null : null;
      },
      get lastElementChild() { return children[children.length - 1] || null; },
      appendChild(c) { c.parentElement = this; c.parentNode = this; children.push(c); return c; },
      insertBefore(c, ref) {
        c.parentElement = this;
        c.parentNode = this;
        const idx = ref ? children.indexOf(ref) : -1;
        if (idx >= 0) children.splice(idx, 0, c);
        else children.push(c);
        return c;
      },
      removeChild(c) { const i = children.indexOf(c); if (i >= 0) children.splice(i, 1); c.parentElement = null; c.parentNode = null; return c; },
      remove() { if (this.parentElement) this.parentElement.removeChild(this); },
      setAttribute(k, v) { attrs.set(k, String(v)); if (k === 'id') node.id = String(v); },
      getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
      hasAttribute(k) { return attrs.has(k); },
      removeAttribute(k) { attrs.delete(k); },
      addEventListener() {},
      removeEventListener() {},
      getContext() { return null; },
      getBoundingClientRect() { return { left: 0, top: 0, right: 640, bottom: 40, width: 640, height: 40 }; },
      animate() { return { cancel() {}, finished: Promise.resolve() }; },
      closest(sel) { let cur = this; while (cur) { if (matchesChain(cur, sel)) return cur; cur = cur.parentElement; } return null; },
      querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
      querySelectorAll(sel) {
        const out = [];
        const walk = (n) => {
          for (const c of n.children) {
            if (matchesChain(c, sel)) out.push(c);
            walk(c);
          }
        };
        walk(this);
        return out;
      },
    };
    return node;
  };

  const html = makeEl('html');
  const head = makeEl('head');
  const body = makeEl('body', { className: 'theme-dark' });
  html.appendChild(head);
  html.appendChild(body);

  const convView = makeEl('div', { attrs: { 'data-testid': 'conversation-view' } });
  const rtcWrap = makeEl('div', { className: 'relative z-10 flex flex-col gap-1 min-h-0' });
  const takeoverWrap = makeEl('div', { className: 'relative z-[1] mb-1 flex flex-col min-h-0' });
  const takeoverCard = makeEl('div', { className: 'agy-takeover-frame', attrs: { 'data-testid': 'interaction-takeover-card' } });
  takeoverWrap.appendChild(takeoverCard);

  const contentsWrap = makeEl('div', { className: 'contents' });
  const inputBox = makeEl('div', { attrs: { 'data-testid': 'agent-input-box' } });
  const queuedWrap = makeEl('div', { className: 'relative z-[1] flex flex-col gap-2 w-full hidden-if-empty mb-2' });
  const composerShell = makeEl('div', { id: 'antigravity.agentSidePanelInputBox', className: 'surface-composer' });
  const runningWrap = makeEl('div', { className: 'relative z-[1]' });
  const runningPanel = makeEl('div', { className: 'grid grid-rows-[0fr]', attrs: { 'data-testid': 'running-items-panel' } });
  runningWrap.appendChild(runningPanel);
  const card = makeEl('div', { className: 'surface-composer-card' });
  const footer = makeEl('div', { className: 'agy-composer-footer' });
  card.appendChild(footer);
  composerShell.appendChild(runningWrap);
  composerShell.appendChild(card);
  inputBox.appendChild(queuedWrap);
  inputBox.appendChild(composerShell);
  contentsWrap.appendChild(inputBox);

  rtcWrap.appendChild(takeoverWrap);
  rtcWrap.appendChild(contentsWrap);
  convView.appendChild(rtcWrap);
  body.appendChild(convView);

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
    localStorage: { _m: {}, getItem(k) { return this._m[k] || null; }, setItem(k, v) { this._m[k] = String(v); } },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    matchMedia: () => ({ matches: false }),
    MutationObserver: class { observe() {} disconnect() {} },
    ResizeObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame: (fn) => setTimeout(() => fn(Date.now()), 5),
    cancelAnimationFrame: (id) => clearTimeout(id),
    setTimeout: (fn, ms) => { const id = setTimeout(fn, ms); timers.add(id); return id; },
    clearTimeout: (id) => { timers.delete(id); clearTimeout(id); },
    setInterval: () => 1,
    clearInterval: () => {},
    performance: { now: () => Date.now() },
    Math, Date, JSON, Map, Set, Array, Object, String, Number, Boolean, Promise, Uint8Array, Float32Array, Intl,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  try {
    const res = vm.runInNewContext(cdp.buildInjectExpression(cdp.DEFAULT_CONFIG), sandbox);
    assert.equal(res.status, 'ok');

    // 1. Q&A takeover card alone: wrapper raised by 46px with data-ag-cs-takeover="1"
    assert.equal(takeoverWrap.getAttribute('data-ag-cs-takeover'), '1');
    assert.equal(takeoverWrap.style.getPropertyValue('margin-bottom'), '46px');
    assert.equal(queuedWrap.hasAttribute('data-ag-cs-queued'), false);
    assert.equal(runningWrap.hasAttribute('data-ag-cs-queued'), false);

    // 2. When queued message is also present, queuedWrap takes the 46px clearance and takeoverWrap avoids double spacing
    const queuedItem = makeEl('div', { text: '排队中的消息' });
    queuedWrap.appendChild(queuedItem);
    sandbox.window.__agClaudeStyle.refreshConfig(cdp.DEFAULT_CONFIG);
    assert.equal(queuedWrap.getAttribute('data-ag-cs-queued'), '1');
    assert.equal(queuedWrap.style.getPropertyValue('margin-bottom'), '46px');
    assert.equal(takeoverWrap.hasAttribute('data-ag-cs-takeover'), false);
    assert.equal(takeoverWrap.style.getPropertyValue('margin-bottom'), '');

    // 3. When queued clears and side-question-panel sits below takeoverWrap, side-question-panel takes clearance
    queuedItem.remove();
    const sideQ = makeEl('div', { attrs: { 'data-testid': 'side-question-panel' } });
    rtcWrap.insertBefore(sideQ, contentsWrap);
    sandbox.window.__agClaudeStyle.refreshConfig(cdp.DEFAULT_CONFIG);
    assert.equal(sideQ.getAttribute('data-ag-cs-takeover'), '1');
    assert.equal(sideQ.style.getPropertyValue('margin-bottom'), '46px');
    assert.equal(takeoverWrap.hasAttribute('data-ag-cs-takeover'), false);

    // 4. When running-items-panel expands (grid-rows-[1fr]), its wrapper takes the 46px clearance
    runningPanel.className = 'grid grid-rows-[1fr]';
    sandbox.window.__agClaudeStyle.refreshConfig(cdp.DEFAULT_CONFIG);
    assert.equal(runningWrap.getAttribute('data-ag-cs-queued'), '1');
    assert.equal(runningWrap.style.getPropertyValue('margin-bottom'), '46px');
    assert.equal(sideQ.hasAttribute('data-ag-cs-takeover'), false);
    assert.equal(takeoverWrap.hasAttribute('data-ag-cs-takeover'), false);

    // 5. Turning mascot off clears all takeover/queued clearances cleanly
    runningPanel.className = 'grid grid-rows-[0fr]';
    sideQ.remove();
    sandbox.window.__agClaudeStyle.refreshConfig({ ...cdp.DEFAULT_CONFIG, mascot: 'off' });
    assert.equal(takeoverWrap.hasAttribute('data-ag-cs-takeover'), false);
    assert.equal(takeoverWrap.style.getPropertyValue('margin-bottom'), '');
    assert.equal(runningWrap.hasAttribute('data-ag-cs-queued'), false);

    // 6. Re-enable crab, verify takeover clearance returns, then verify REMOVE_EXPRESSION tears down cleanly
    sandbox.window.__agClaudeStyle.refreshConfig(cdp.DEFAULT_CONFIG);
    assert.equal(takeoverWrap.getAttribute('data-ag-cs-takeover'), '1');
    assert.equal(takeoverWrap.style.getPropertyValue('margin-bottom'), '46px');
    vm.runInNewContext(cdp.REMOVE_EXPRESSION, sandbox);
    assert.equal(takeoverWrap.hasAttribute('data-ag-cs-takeover'), false);
    assert.equal(takeoverWrap.style.getPropertyValue('margin-bottom'), '');

    const injectedCss = cdp.buildInjectExpression(cdp.DEFAULT_CONFIG);
    assert.ok(injectedCss.includes('interaction-takeover-card'));
    assert.ok(injectedCss.includes('side-question-panel'));
  } finally {
    for (const id of timers) clearTimeout(id);
  }
});

test('v3.5.1 mounts dual mascot stage, brand optical glyphs, Orchestrator crystal bar, thinking spark, sidebar shortcut, and Pulse vial bridge', async () => {
  const timers = new Set();
  const winListeners = new Map();

  function makeCanvasCtx2D() {
    return {
      canvas: { width: 96, height: 84 },
      save() {},
      restore() {},
      clearRect() {},
      fillRect() {},
      strokeRect() {},
      beginPath() {},
      closePath() {},
      moveTo() {},
      lineTo() {},
      arc() {},
      arcTo() {},
      roundRect() {},
      setLineDash() {},
      ellipse() {},
      quadraticCurveTo() {},
      bezierCurveTo() {},
      clip() {},
      fill() {},
      stroke() {},
      translate() {},
      rotate() {},
      scale() {},
      setTransform() {},
      drawImage() {},
      fillText() {},
      createLinearGradient() { return { addColorStop() {} }; },
      createRadialGradient() { return { addColorStop() {} }; },
      createImageData(w, h) {
        return { data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: w, height: h };
      },
      getImageData(x, y, w, h) {
        return { data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: w, height: h };
      },
      putImageData() {},
    };
  }

  let docRef = null;
  function makeNode(tag, opts = {}) {
    const attrs = new Map(Object.entries(opts.attrs || {}));
    const classes = new Set((opts.className || '').split(/\s+/).filter(Boolean));
    const listeners = new Map();
    const children = [];
    const dataset = new Proxy(
      {},
      {
        get(_, prop) {
          const k = 'data-' + String(prop).replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
          return attrs.has(k) ? attrs.get(k) : undefined;
        },
        set(_, prop, val) {
          const k = 'data-' + String(prop).replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
          attrs.set(k, String(val));
          return true;
        },
      }
    );

    const matchesSimple = (node, simple) => {
      let rest = simple.trim();
      if (!rest) return false;
      const cleanIdx = rest.indexOf(':not(');
      let negSel = null;
      if (cleanIdx >= 0 && rest.endsWith(')')) {
        negSel = rest.slice(cleanIdx + 5, -1);
        rest = rest.slice(0, cleanIdx);
      }
      const tagMatch = /^[a-zA-Z0-9_-]+/.exec(rest);
      if (tagMatch) {
        if (node.tagName !== tagMatch[0].toUpperCase()) return false;
        rest = rest.slice(tagMatch[0].length);
      }
      while (rest.length > 0) {
        if (rest[0] === '#') {
          const m = /^#((?:\\.|[a-zA-Z0-9_-])+)/.exec(rest);
          if (!m || node.id !== m[1].replace(/\\/g, '')) return false;
          rest = rest.slice(m[0].length);
        } else if (rest[0] === '.') {
          const m = /^\.([a-zA-Z0-9_-]+)/.exec(rest);
          if (!m || !node.classList.contains(m[1])) return false;
          rest = rest.slice(m[0].length);
        } else if (rest[0] === '[') {
          const m = /^\[([^\]=]+)(?:="([^"]*)")?\]/.exec(rest);
          if (!m) return false;
          const ok = m[2] === undefined ? node.hasAttribute(m[1]) : node.getAttribute(m[1]) === m[2];
          if (!ok) return false;
          rest = rest.slice(m[0].length);
        } else {
          return false;
        }
      }
      if (negSel && matchesSimple(node, negSel)) return false;
      return true;
    };

    const matchesChain = (node, selector) =>
      selector.split(',').some((part) => {
        const tokens = part.trim().split(/\s+/).filter(Boolean);
        if (tokens.length === 0 || !matchesSimple(node, tokens[tokens.length - 1])) return false;
        let cur = node.parentElement;
        let idx = tokens.length - 2;
        while (cur && idx >= 0) {
          if (matchesSimple(cur, tokens[idx])) idx--;
          cur = cur.parentElement;
        }
        return idx < 0;
      });

    const node = {
      tagName: tag.toUpperCase(),
      id: attrs.get('id') || opts.id || '',
      dataset,
      get ownerDocument() { return docRef; },
      children,
      parentElement: null,
      parentNode: null,
      isConnected: true,
      hidden: Boolean(opts.hidden),
      shadowRoot: null,
      _text: opts.text || '',
      clientWidth: opts.clientWidth ?? 720,
      clientHeight: opts.clientHeight ?? 480,
      offsetWidth: opts.clientWidth ?? 720,
      offsetHeight: opts.clientHeight ?? 48,
      width: opts.width ?? 96,
      height: opts.height ?? 84,
      style: {
        _props: {},
        display: '',
        transform: '',
        transition: '',
        zIndex: '',
        opacity: '',
        width: '',
        height: '',
        setProperty(k, v) { this._props[k] = String(v); },
        getPropertyValue(k) { return this._props[k] || ''; },
        removeProperty(k) { delete this._props[k]; },
      },
      classList: {
        contains: (c) => classes.has(c),
        add: (c) => classes.add(c),
        remove: (c) => classes.delete(c),
      },
      get className() { return Array.from(classes).join(' '); },
      set className(v) { classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => classes.add(c)); },
      get textContent() { return children.length ? children.map((c) => c.textContent).join('') : this._text; },
      set textContent(v) { children.length = 0; this._text = String(v); },
      set innerHTML(h) { children.length = 0; this._html = String(h); },
      get innerHTML() { return this._html || ''; },
      get childElementCount() { return children.length; },
      get firstChild() { return children[0] || null; },
      get lastElementChild() { return children[children.length - 1] || null; },
      get nextSibling() {
        if (!this.parentElement) return null;
        const i = this.parentElement.children.indexOf(this);
        return i >= 0 ? this.parentElement.children[i + 1] || null : null;
      },
      appendChild(c) { c.parentElement = this; c.parentNode = this; children.push(c); return c; },
      insertBefore(c, ref) {
        c.parentElement = this;
        c.parentNode = this;
        const idx = ref ? children.indexOf(ref) : -1;
        if (idx >= 0) children.splice(idx, 0, c);
        else children.push(c);
        return c;
      },
      removeChild(c) { const i = children.indexOf(c); if (i >= 0) children.splice(i, 1); c.parentElement = null; c.parentNode = null; return c; },
      remove() { if (this.parentElement) this.parentElement.removeChild(this); },
      setAttribute(k, v) { attrs.set(k, String(v)); if (k === 'id') node.id = String(v); },
      getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
      hasAttribute(k) { return attrs.has(k); },
      removeAttribute(k) { attrs.delete(k); },
      toggleAttribute(k, f) {
        const on = f === undefined ? !attrs.has(k) : Boolean(f);
        if (on) attrs.set(k, ''); else attrs.delete(k);
        return on;
      },
      addEventListener(ev, cb) { if (!listeners.has(ev)) listeners.set(ev, []); listeners.get(ev).push(cb); },
      removeEventListener(ev, cb) { const a = listeners.get(ev); if (a) { const i = a.indexOf(cb); if (i >= 0) a.splice(i, 1); } },
      getContext(kind) { return kind === '2d' ? makeCanvasCtx2D() : null; },
      getBoundingClientRect() { return { left: 20, top: 20, right: 620, bottom: 104, width: 600, height: 84 }; },
      animate() { return { cancel() {}, finished: Promise.resolve() }; },
      closest(sel) { let cur = this; while (cur) { if (matchesChain(cur, sel)) return cur; cur = cur.parentElement; } return null; },
      querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
      querySelectorAll(sel) {
        const out = [];
        const walk = (n) => { for (const c of n.children) { if (matchesChain(c, sel)) out.push(c); walk(c); } };
        walk(this);
        return out;
      },
      getElementById(id) {
        const find = (n) => (n.id === id ? n : n.children.map(find).find(Boolean) || null);
        return find(this);
      },
    };
    return node;
  }

  const html = makeNode('html');
  const head = makeNode('head');
  const body = makeNode('body', { className: 'theme-dark' });
  html.appendChild(head);
  html.appendChild(body);

  // Conversation view with thinking trigger & composer
  const convView = makeNode('div', { attrs: { 'data-testid': 'conversation-view' } });
  const thinkTrig = makeNode('button', { attrs: { 'data-testid': 'thinking-collapsible-trigger' } });
  thinkTrig.appendChild(makeNode('span', { text: '正在推演...' }));
  convView.appendChild(thinkTrig);

  const inputBox = makeNode('div', { attrs: { 'data-testid': 'agent-input-box' } });
  const card = makeNode('div', { className: 'surface-composer-card' });
  const editorWrap = makeNode('div', { className: 'relative w-full' });
  const editorEl = makeNode('div', { attrs: { contenteditable: 'true', 'data-lexical-editor': 'true' } });
  editorWrap.appendChild(editorEl);
  const footer = makeNode('div', { className: 'agy-composer-footer' });
  const modelBtn = makeNode('button', { attrs: { 'data-testid': 'model-selector-trigger', 'aria-label': 'Select model, current: Orchestrator' } });
  const modelSpan = makeNode('span', { text: 'Orchestrator' });
  modelBtn.appendChild(modelSpan);
  footer.appendChild(modelBtn);
  card.appendChild(editorWrap);
  card.appendChild(footer);
  inputBox.appendChild(card);
  convView.appendChild(inputBox);
  body.appendChild(convView);

  // Model selector panel with .ces-ag-section, .ces-ag-effort-row, live menuitem structure & non-model row
  const modelPanel = makeNode('div', { attrs: { 'data-testid': 'model-selector-panel' } });
  const hoverHydrogenOpt = makeNode('button', { attrs: { 'aria-selected': 'true', 'data-highlighted': '' }, text: 'Gemini 4 Hydrogen Extra' });
  const orchOpt = makeNode('button', { attrs: { 'data-selected': 'true' }, text: 'Orchestrator (Carbon)' });
  const claudeMenuItem = makeNode('div', {
    className: 'agy-overlay-item text-secondary-foreground hover:text-foreground',
    attrs: { role: 'menuitem', 'data-ces-model-selected': 'false' },
  });
  const claudeLead = makeNode('span', { className: 'flex items-center gap-1.5 min-w-0' });
  const claudeName = makeNode('span', { attrs: { 'data-testid': 'model-selector-effort-group' }, text: 'Claude Sonnet 4.6' });
  const claudeBadge = makeNode('span', { className: 'rounded-full', text: '新建' });
  claudeLead.appendChild(claudeName);
  claudeMenuItem.appendChild(claudeLead);
  claudeMenuItem.appendChild(claudeBadge);
  const usageMenuItem = makeNode('div', { className: 'agy-overlay-item', attrs: { role: 'menuitem' }, text: '查看用量明细' });
  const cesSec = makeNode('div', { className: 'ces-ag-section' });
  const cesRow = makeNode('div', { className: 'ces-ag-effort-row' });
  cesSec.appendChild(cesRow);
  modelPanel.appendChild(hoverHydrogenOpt);
  modelPanel.appendChild(orchOpt);
  modelPanel.appendChild(claudeMenuItem);
  modelPanel.appendChild(usageMenuItem);
  modelPanel.appendChild(cesSec);
  body.appendChild(modelPanel);

  // Simulated #ag-pulse-status-bar with open shadowRoot
  const pulseHost = makeNode('div', { id: 'ag-pulse-status-bar' });
  const shadowRoot = makeNode('div');
  const ctxChip = makeNode('button', { className: 'chip', attrs: { 'data-card': 'context' } });
  const ctxRing = makeNode('span', { id: 'context-ring' });
  const ctxPct = makeNode('span', { id: 'context-percent', text: '42%' });
  ctxChip.appendChild(ctxRing);
  ctxChip.appendChild(ctxPct);
  const ctxCard = makeNode('div', { id: 'context-card', className: 'card context-card' });
  const ctxHeading = makeNode('div', { className: 'heading', text: '上下文窗口' });
  const ctxTrack = makeNode('div', { id: 'context-track' });
  const ctxFill = makeNode('div', { id: 'context-fill' });
  ctxTrack.appendChild(ctxFill);
  ctxCard.appendChild(ctxHeading);
  ctxCard.appendChild(ctxTrack);
  shadowRoot.appendChild(ctxChip);
  shadowRoot.appendChild(ctxCard);
  pulseHost.shadowRoot = shadowRoot;
  body.appendChild(pulseHost);

  docRef = {
    documentElement: html,
    head,
    body,
    hidden: false,
    defaultView: null,
    createElement: (t) => makeNode(t),
    getElementById: (id) => html.getElementById(id),
    querySelector: (s) => html.querySelector(s),
    querySelectorAll: (s) => html.querySelectorAll(s),
    addEventListener() {},
    removeEventListener() {},
  };

  const sandbox = {
    window: null,
    globalThis: null,
    document: docRef,
    devicePixelRatio: 1,
    navigator: { language: 'zh-CN' },
    location: { pathname: '/' },
    localStorage: { _m: {}, getItem(k) { return this._m[k] || null; }, setItem(k, v) { this._m[k] = String(v); } },
    agPulseHost: {
      async getMetrics() {
        return {
          speed: {
            tps: 68.5,
            latestTps: 72.4,
            ttftSeconds: 0.34,
            modelSeconds: 4.2,
            toolSeconds: 1.4,
            context: { usedTokens: 107520, maxTokens: 256000, usedFraction: 0.42, model: 'Gemini 4 Carbon' },
          },
        };
      },
    },
    addEventListener(ev, cb) { if (!winListeners.has(ev)) winListeners.set(ev, []); winListeners.get(ev).push(cb); },
    removeEventListener(ev, cb) { const a = winListeners.get(ev); if (a) { const i = a.indexOf(cb); if (i >= 0) a.splice(i, 1); } },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    MutationObserver: class { observe() {} disconnect() {} },
    ResizeObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame: (fn) => { const id = setTimeout(() => fn(typeof fakeNow === 'number' ? fakeNow : Date.now()), 8); timers.add(id); return id; },
    cancelAnimationFrame: (id) => { timers.delete(id); clearTimeout(id); },
    setTimeout: (fn, ms) => { const id = setTimeout(fn, ms); timers.add(id); return id; },
    clearTimeout: (id) => { timers.delete(id); clearTimeout(id); },
    setInterval: () => 1,
    clearInterval: () => {},
    performance: { now: () => Date.now() },
    Uint8ClampedArray,
    Math, Date, JSON, Map, Set, WeakMap, WeakSet, Array, Object, String, Number, Boolean, Promise, Uint8Array, Uint32Array, Int32Array, Float32Array, Intl, RegExp, Error, TypeError, encodeURIComponent, parseInt, parseFloat, isFinite, isNaN,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  docRef.defaultView = sandbox;

  try {
    const res = vm.runInNewContext(cdp.buildInjectExpression(cdp.DEFAULT_CONFIG), sandbox);
    assert.equal(res.status, 'ok');

    // 1. Dual mascot stage mounts 2 real actor canvases (Clawd & Cat, 96x84)
    const stageEl = card.querySelector('.ag-cs-crab');
    assert.ok(stageEl && stageEl.classList.contains('ag-cs-dual-stage'));
    const actorCanvases = stageEl.querySelectorAll('.ag-v2-mascot-canvas');
    assert.equal(actorCanvases.length, 2);
    assert.equal(actorCanvases[0].width, 96);
    assert.equal(actorCanvases[0].height, 84);
    assert.equal(sandbox.window.__agClaudeStyle.getState().hasDualRig, true);

    // 2. Official brand glyph on Orchestrator -> antigravity / auto
    const glyph = modelBtn.querySelector('.ag-cs-model-glyph');
    assert.ok(glyph);
    assert.equal(glyph.getAttribute('data-brand'), 'antigravity');
    assert.equal(glyph.getAttribute('data-tier'), 'auto');
    assert.ok(glyph.innerHTML.includes('ag-spark-orbit-svg'));

    // 3. Orchestrator effort bar stays locked & model-selector-panel rows mount optical brand glyphs
    const orchBar = modelPanel.querySelector('[data-testid="orchestrator-effort-bar"]');
    assert.ok(orchBar);
    assert.equal(modelPanel.getAttribute('data-ag-cs-orch-active'), '1');
    assert.equal(orchBar.getAttribute('data-row-hidden'), 'false');
    assert.equal(cesRow.getAttribute('data-row-hidden'), 'true');

    const hydrogenRowGlyph = hoverHydrogenOpt.querySelector('.ag-cs-panel-row-glyph');
    const orchRowGlyph = orchOpt.querySelector('.ag-cs-panel-row-glyph');
    const claudeRowGlyph = claudeMenuItem.querySelector('.ag-cs-panel-row-glyph');
    assert.ok(hydrogenRowGlyph, 'Expected .ag-cs-panel-row-glyph on Gemini option row');
    assert.equal(hydrogenRowGlyph.getAttribute('data-brand'), 'gemini');
    assert.equal(hydrogenRowGlyph.getAttribute('data-tier'), 'xhigh');
    assert.equal(hydrogenRowGlyph.getAttribute('data-selected'), 'false');
    assert.ok(orchRowGlyph, 'Expected .ag-cs-panel-row-glyph on Orchestrator option row');
    assert.equal(orchRowGlyph.getAttribute('data-brand'), 'antigravity');
    assert.equal(orchRowGlyph.getAttribute('data-tier'), 'auto');
    assert.equal(orchRowGlyph.getAttribute('data-selected'), 'true');
    assert.equal(orchRowGlyph.style.getPropertyValue('opacity'), '1');
    assert.ok(claudeRowGlyph, 'Expected .ag-cs-panel-row-glyph inside live menuitem lead flex container');
    assert.equal(claudeRowGlyph.getAttribute('data-brand'), 'claude');
    assert.equal(claudeRowGlyph.getAttribute('data-selected'), 'false');
    assert.equal(claudeRowGlyph.style.getPropertyValue('opacity'), '0.78');
    assert.equal(claudeLead.firstChild, claudeRowGlyph);
    assert.equal(claudeName.textContent, 'Claude Sonnet 4.6');
    assert.equal(claudeBadge.textContent, '新建');
    assert.equal(usageMenuItem.querySelector('.ag-cs-panel-row-glyph'), null, 'Non-model menu item must be skipped');

    // Verify live Base UI selection via data-ces-model-selected="true" lights up brand glow & inline opacity: 1
    orchOpt.setAttribute('data-selected', 'false');
    claudeMenuItem.setAttribute('data-ces-model-selected', 'true');
    claudeMenuItem.className = 'agy-overlay-item text-foreground';
    modelBtn.setAttribute('aria-label', 'Select model, current: Claude Sonnet 4.6');
    modelSpan.textContent = 'Claude Sonnet 4.6';
    sandbox.window.__agClaudeStyle.refreshConfig(cdp.DEFAULT_CONFIG);
    assert.equal(claudeRowGlyph.getAttribute('data-selected'), 'true');
    assert.equal(claudeRowGlyph.style.getPropertyValue('opacity'), '1');
    assert.ok(claudeRowGlyph.style.getPropertyValue('filter').includes('drop-shadow'));
    assert.ok(claudeRowGlyph.innerHTML.includes('var(--glyph-color-hi)'));
    claudeMenuItem.setAttribute('data-ces-model-selected', 'false');
    claudeMenuItem.className = 'agy-overlay-item text-secondary-foreground hover:text-foreground';

    // Switch committed model to Gemini 4 Hydrogen Extra -> hides crystal bar, restores native effort row, updates glyph to gemini/xhigh
    orchOpt.setAttribute('data-selected', 'false');
    hoverHydrogenOpt.setAttribute('data-selected', 'true');
    modelBtn.setAttribute('aria-label', 'Select model, current: Gemini 4 Hydrogen Extra');
    modelSpan.textContent = 'Gemini 4 Hydrogen Extra';
    sandbox.window.__agClaudeStyle.refreshConfig(cdp.DEFAULT_CONFIG);
    assert.equal(glyph.getAttribute('data-brand'), 'gemini');
    assert.equal(glyph.getAttribute('data-tier'), 'xhigh');
    assert.equal(hydrogenRowGlyph.getAttribute('data-selected'), 'true');
    assert.equal(orchRowGlyph.getAttribute('data-selected'), 'false');
    assert.equal(modelPanel.hasAttribute('data-ag-cs-orch-active'), false);
    assert.equal(orchBar.getAttribute('data-row-hidden'), 'true');
    assert.equal(cesRow.getAttribute('data-row-hidden'), 'false');

    // Disabling composerRestyle cleanly removes panel row glyphs, and re-enabling restores them idempotently
    sandbox.window.__agClaudeStyle.refreshConfig({ ...cdp.DEFAULT_CONFIG, composerRestyle: false });
    assert.equal(modelPanel.querySelectorAll('.ag-cs-panel-row-glyph').length, 0);
    sandbox.window.__agClaudeStyle.refreshConfig(cdp.DEFAULT_CONFIG);
    assert.equal(modelPanel.querySelectorAll('.ag-cs-panel-row-glyph').length, 3);

    // 4. Thinking spark mounts on thinking-collapsible-trigger
    const spark = thinkTrig.querySelector('.ag-cs-thinking-spark');
    assert.ok(spark);
    assert.equal(spark.getAttribute('data-brand'), 'gemini');
    assert.equal(spark.getAttribute('data-state'), 'streaming');

    // 5. Window '[' keydown toggles sidebar collapsed attribute only outside editors
    for (const fn of winListeners.get('keydown') || []) {
      fn({ key: '[', target: editorEl });
    }
    assert.equal(html.hasAttribute('data-ag-cs-sidebar-collapsed'), false);
    for (const fn of winListeners.get('keydown') || []) {
      fn({ key: '[', target: body });
    }
    assert.equal(html.getAttribute('data-ag-cs-sidebar-collapsed'), '1');

    // 6. Pulse status bar shadowRoot bridged cleanly with vial rail & toggle button
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(sandbox.window.__agClaudeStyle.getState().hasPulseBridge, true);
    assert.equal(pulseHost.getAttribute('data-pv-mode'), 'vial');
    assert.equal(ctxCard.getAttribute('data-ag-pulse-vial-mode'), 'vial');
    assert.ok(shadowRoot.querySelector('[data-ag-pulse-vial-toggle="1"]'));
    assert.ok(shadowRoot.querySelector('canvas[data-vial-canvas="true"]'));

    // 7. Full teardown via REMOVE_EXPRESSION restores host & cleans all v3.5.1 / v3.6 nodes
    vm.runInNewContext(cdp.REMOVE_EXPRESSION, sandbox);
    assert.equal(html.hasAttribute('data-ag-cs-sidebar-collapsed'), false);
    assert.equal(card.querySelector('.ag-cs-crab'), null);
    assert.equal(modelBtn.querySelector('.ag-cs-model-glyph'), null);
    assert.equal(modelPanel.querySelectorAll('.ag-cs-panel-row-glyph').length, 0);
    assert.equal(orchOpt.textContent, 'Orchestrator (Carbon)');
    assert.equal(hoverHydrogenOpt.textContent, 'Gemini 4 Hydrogen Extra');
    assert.equal(modelPanel.querySelector('[data-testid="orchestrator-effort-bar"]'), null);
    assert.equal(modelPanel.hasAttribute('data-ag-cs-orch-active'), false);
    assert.equal(thinkTrig.querySelector('.ag-cs-thinking-spark'), null);
    assert.equal(pulseHost.hasAttribute('data-pv-mode'), false);
    assert.equal(ctxCard.hasAttribute('data-ag-pulse-vial-mode'), false);
    assert.equal(shadowRoot.querySelector('[data-ag-pulse-vial-toggle="1"]'), null);
  } finally {
    for (const id of timers) clearTimeout(id);
  }
});

test('v3.6.1 auto-unfolds inner thinking & tool collapsibles idempotently and drives 4-state conversation horizon aura (< 690 KiB)', async () => {
  const injectExpr = cdp.buildInjectExpression(cdp.DEFAULT_CONFIG);
  const totalBytes = Buffer.byteLength(injectExpr, 'utf8');
  assert.ok(totalBytes < 690 * 1024, `Expected total bundle < 690KB, got ${totalBytes}`);

  const timers = new Set();
  const winListeners = new Map();
  let fakeNow = 10000;
  let disposedGlowCount = 0;

  function makeCtx2D() {
    return {
      canvas: { width: 120, height: 80 },
      save() {},
      restore() {},
      clearRect() {},
      fillRect() {},
      strokeRect() {},
      beginPath() {},
      closePath() {},
      moveTo() {},
      lineTo() {},
      arc() {},
      arcTo() {},
      roundRect() {},
      setLineDash() {},
      ellipse() {},
      quadraticCurveTo() {},
      bezierCurveTo() {},
      clip() {},
      fill() {},
      stroke() {},
      translate() {},
      rotate() {},
      scale() {},
      setTransform() {},
      drawImage() {},
      fillText() {},
      createLinearGradient() { return { addColorStop() {} }; },
      createRadialGradient() { return { addColorStop() {} }; },
      createImageData(w, h) {
        return { data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: w, height: h };
      },
      getImageData(x, y, w, h) {
        return { data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: w, height: h };
      },
      putImageData() {},
    };
  }

  let docRef = null;
  function makeNode(tag, opts = {}) {
    const attrs = new Map(Object.entries(opts.attrs || {}));
    const classes = new Set((opts.className || '').split(/\s+/).filter(Boolean));
    const listeners = new Map();
    const children = [];

    const matchesSimple = (node, simple) => {
      let rest = simple.trim();
      if (!rest) return false;
      const tagMatch = /^[a-zA-Z0-9_-]+/.exec(rest);
      if (tagMatch) {
        if (node.tagName !== tagMatch[0].toUpperCase()) return false;
        rest = rest.slice(tagMatch[0].length);
      }
      while (rest.length > 0) {
        if (rest[0] === '#') {
          const m = /^#((?:\\.|[a-zA-Z0-9_-])+)/.exec(rest);
          if (!m || node.id !== m[1].replace(/\\/g, '')) return false;
          rest = rest.slice(m[0].length);
        } else if (rest[0] === '.') {
          const m = /^\.([a-zA-Z0-9_-]+)/.exec(rest);
          if (!m || !node.classList.contains(m[1])) return false;
          rest = rest.slice(m[0].length);
        } else if (rest[0] === '[') {
          const m = /^\[([^\]=]+)(?:="([^"]*)")?\]/.exec(rest);
          if (!m) return false;
          const ok = m[2] === undefined ? node.hasAttribute(m[1]) : node.getAttribute(m[1]) === m[2];
          if (!ok) return false;
          rest = rest.slice(m[0].length);
        } else {
          return false;
        }
      }
      return true;
    };

    const matchesChain = (node, selector) =>
      selector.split(',').some((part) => {
        const tokens = part.trim().split(/\s+/).filter(Boolean);
        if (tokens.length === 0 || !matchesSimple(node, tokens[tokens.length - 1])) return false;
        let cur = node.parentElement;
        let idx = tokens.length - 2;
        while (cur && idx >= 0) {
          if (matchesSimple(cur, tokens[idx])) idx--;
          cur = cur.parentElement;
        }
        return idx < 0;
      });

    const node = {
      tagName: tag.toUpperCase(),
      nodeType: 1,
      id: attrs.get('id') || opts.id || '',
      dataset: {},
      get ownerDocument() { return docRef; },
      children,
      parentElement: null,
      parentNode: null,
      isConnected: true,
      hidden: false,
      disabled: false,
      _text: opts.text || '',
      _clicks: 0,
      clientWidth: 960,
      clientHeight: 640,
      width: 120,
      height: 80,
      style: {
        _props: {},
        display: '',
        visibility: '',
        opacity: '',
        setProperty(k, v) { this._props[k] = String(v); },
        getPropertyValue(k) { return this._props[k] || ''; },
        removeProperty(k) { delete this._props[k]; },
      },
      classList: {
        contains: (c) => classes.has(c),
        add: (c) => classes.add(c),
        remove: (c) => classes.delete(c),
      },
      get className() { return Array.from(classes).join(' '); },
      set className(v) { classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => classes.add(c)); },
      get textContent() { return children.length ? children.map((c) => c.textContent).join('') : this._text; },
      set textContent(v) { children.length = 0; this._text = String(v); },
      set innerHTML(h) { children.length = 0; this._html = String(h); },
      get innerHTML() { return this._html || ''; },
      get childElementCount() { return children.length; },
      get firstChild() { return children[0] || null; },
      get lastElementChild() { return children[children.length - 1] || null; },
      get nextElementSibling() {
        if (!this.parentElement) return null;
        const i = this.parentElement.children.indexOf(this);
        return i >= 0 ? this.parentElement.children[i + 1] || null : null;
      },
      get nextSibling() { return this.nextElementSibling; },
      appendChild(c) { c.parentElement = this; c.parentNode = this; children.push(c); return c; },
      insertBefore(c, ref) {
        c.parentElement = this;
        c.parentNode = this;
        const idx = ref ? children.indexOf(ref) : -1;
        if (idx >= 0) children.splice(idx, 0, c);
        else children.push(c);
        return c;
      },
      removeChild(c) {
        const i = children.indexOf(c);
        if (i >= 0) children.splice(i, 1);
        c.parentElement = null;
        c.parentNode = null;
        c.isConnected = false;
        return c;
      },
      remove() { if (this.parentElement) this.parentElement.removeChild(this); },
      setAttribute(k, v) { attrs.set(k, String(v)); if (k === 'id') node.id = String(v); },
      getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
      hasAttribute(k) { return attrs.has(k); },
      removeAttribute(k) {
        if (k === 'webglcontextlost') disposedGlowCount++;
        attrs.delete(k);
      },
      toggleAttribute(k, f) {
        const on = f === undefined ? !attrs.has(k) : Boolean(f);
        if (on) attrs.set(k, ''); else attrs.delete(k);
        return on;
      },
      click() {
        this._clicks += 1;
        if (this.hasAttribute('aria-expanded')) {
          this.setAttribute('aria-expanded', this.getAttribute('aria-expanded') === 'true' ? 'false' : 'true');
        }
      },
      addEventListener(ev, cb) { if (!listeners.has(ev)) listeners.set(ev, []); listeners.get(ev).push(cb); },
      removeEventListener(ev, cb) {
        if (ev === 'webglcontextlost') disposedGlowCount++;
        const a = listeners.get(ev);
        if (a) { const i = a.indexOf(cb); if (i >= 0) a.splice(i, 1); }
      },
      getContext(kind) { return kind === '2d' ? makeCtx2D() : null; },
      getBoundingClientRect() { return { left: 0, top: 0, right: 960, bottom: 640, width: 960, height: 640 }; },
      closest(sel) { let cur = this; while (cur) { if (matchesChain(cur, sel)) return cur; cur = cur.parentElement; } return null; },
      querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
      querySelectorAll(sel) {
        const out = [];
        const walk = (n) => { for (const c of n.children) { if (matchesChain(c, sel)) out.push(c); walk(c); } };
        walk(this);
        return out;
      },
      getElementById(id) {
        const find = (n) => (n.id === id ? n : n.children.map(find).find(Boolean) || null);
        return find(this);
      },
    };
    return node;
  }

  const html = makeNode('html');
  const head = makeNode('head');
  const body = makeNode('body', { className: 'theme-dark' });
  html.appendChild(head);
  html.appendChild(body);

  const stageWrap = makeNode('div', { className: 'conv-shell' });
  const convView = makeNode('div', { attrs: { 'data-testid': 'conversation-view' } });

  // Build 2-tier worked-for collapsible structure
  const turnWrap = makeNode('div');
  const workedBtn = makeNode('button', {
    attrs: { 'data-testid': 'worked-for-collapsible', 'aria-expanded': 'false' },
    text: 'Worked for 12s',
  });
  const workedBody = makeNode('div');
  const thinkChild = makeNode('button', {
    attrs: { 'data-testid': 'thinking-collapsible-trigger', 'aria-expanded': 'false' },
    text: 'Thought for 6s',
  });
  const toolChild = makeNode('button', {
    attrs: { 'data-testid': 'tool-group-collapsible', 'aria-expanded': 'false' },
    text: 'Ran 3 tools',
  });
  workedBody.appendChild(thinkChild);
  workedBody.appendChild(toolChild);
  turnWrap.appendChild(workedBtn);
  turnWrap.appendChild(workedBody);
  convView.appendChild(turnWrap);

  // Composer with send-button initially
  const inputBox = makeNode('div', { attrs: { 'data-testid': 'agent-input-box' } });
  const card = makeNode('div', { className: 'surface-composer-card' });
  const sendBtn = makeNode('button', { attrs: { 'data-testid': 'send-button' } });
  card.appendChild(sendBtn);
  inputBox.appendChild(card);
  convView.appendChild(inputBox);
  stageWrap.appendChild(convView);
  body.appendChild(stageWrap);

  docRef = {
    documentElement: html,
    head,
    body,
    hidden: false,
    defaultView: null,
    createElement: (t) => makeNode(t),
    getElementById: (id) => html.getElementById(id),
    querySelector: (s) => html.querySelector(s),
    querySelectorAll: (s) => html.querySelectorAll(s),
    addEventListener() {},
    removeEventListener() {},
  };

  const sandbox = {
    window: null,
    globalThis: null,
    document: docRef,
    devicePixelRatio: 1,
    navigator: { language: 'zh-CN' },
    location: { pathname: '/c/12345678-1234-1234-1234-1234567890ab' },
    localStorage: { _m: {}, getItem(k) { return this._m[k] || null; }, setItem(k, v) { this._m[k] = String(v); } },
    addEventListener(ev, cb) { if (!winListeners.has(ev)) winListeners.set(ev, []); winListeners.get(ev).push(cb); },
    removeEventListener(ev, cb) { const a = winListeners.get(ev); if (a) { const i = a.indexOf(cb); if (i >= 0) a.splice(i, 1); } },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    MutationObserver: class { observe() {} disconnect() {} },
    ResizeObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame: (fn) => { const id = setTimeout(() => fn(typeof fakeNow === 'number' ? fakeNow : Date.now()), 8); timers.add(id); return id; },
    cancelAnimationFrame: (id) => { timers.delete(id); clearTimeout(id); },
    setTimeout: (fn, ms) => { const id = setTimeout(fn, ms); timers.add(id); return id; },
    clearTimeout: (id) => { timers.delete(id); clearTimeout(id); },
    setInterval: () => 1,
    clearInterval: () => {},
    performance: { now: () => fakeNow },
    Uint8ClampedArray,
    Math, Date, JSON, Map, Set, WeakMap, WeakSet, Array, Object, String, Number, Boolean, Promise, Uint8Array, Uint32Array, Int32Array, Float32Array, Intl, RegExp, Error, TypeError, Function, encodeURIComponent, parseInt, parseFloat, isFinite, isNaN,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  docRef.defaultView = sandbox;

  try {
    const res = vm.runInNewContext(injectExpr, sandbox);
    assert.equal(res.status, 'ok');

    // 1. Conversation aura mounts idempotently at convView.parentElement head in 'idle' phase
    const auraHost = stageWrap.querySelector('.ag-cs-conv-aura-host');
    assert.ok(auraHost, 'Expected .ag-cs-conv-aura-host mounted on conversation parent');
    assert.equal(stageWrap.firstChild, auraHost);
    assert.ok(auraHost.querySelector('canvas.ag-cs-conv-glow'));
    assert.equal(sandbox.window.__agClaudeStyle.getState().hasConvAura, true);
    assert.equal(sandbox.window.__agClaudeStyle.getState().convAuraPhase, 'idle');

    // 2. While worked-for-collapsible is collapsed, inner triggers stay untouched
    assert.equal(thinkChild.getAttribute('aria-expanded'), 'false');
    assert.equal(toolChild.getAttribute('aria-expanded'), 'false');
    assert.equal(thinkChild._clicks, 0);
    assert.equal(toolChild._clicks, 0);

    // 3. Opening worked-for-collapsible auto-unfolds tool-group-collapsible ONLY, keeping thinking collapsed by default
    workedBtn.setAttribute('aria-expanded', 'true');
    for (const fn of winListeners.get('click') || []) {
      fn({ target: workedBtn });
    }
    await new Promise((r) => setTimeout(r, 42));
    assert.equal(workedBtn.getAttribute('data-ag-cs-outer-open'), '1');
    assert.equal(thinkChild.getAttribute('aria-expanded'), 'false', 'Thinking block must stay collapsed by default');
    assert.equal(toolChild.getAttribute('aria-expanded'), 'true', 'Tool group must auto-unfold to avoid 3-tier nesting');
    assert.equal(thinkChild.hasAttribute('data-ag-cs-auto-unfolded'), false);
    assert.equal(toolChild.getAttribute('data-ag-cs-auto-unfolded'), '1');
    assert.equal(thinkChild._clicks, 0);
    assert.equal(toolChild._clicks, 1);

    // 4. Respect manual collapse: user folds toolChild back -> subsequent sync() MUST NOT re-open it
    toolChild.click();
    assert.equal(toolChild.getAttribute('aria-expanded'), 'false');
    sandbox.window.__agClaudeStyle.sync();
    sandbox.window.__agClaudeStyle.refreshConfig(cdp.DEFAULT_CONFIG);
    assert.equal(toolChild.getAttribute('aria-expanded'), 'false');
    assert.equal(toolChild._clicks, 2, 'Plugin must never override manual secondary collapse');

    // 5. Reset mechanism: closing outer worked-for-collapsible and re-opening allows fresh auto-unfold of toolChild
    workedBtn.setAttribute('aria-expanded', 'false');
    sandbox.window.__agClaudeStyle.sync();
    assert.equal(workedBtn.hasAttribute('data-ag-cs-outer-open'), false);
    assert.equal(toolChild.hasAttribute('data-ag-cs-auto-unfolded'), false);
    workedBtn.setAttribute('aria-expanded', 'true');
    sandbox.window.__agClaudeStyle.sync();
    assert.equal(toolChild.getAttribute('aria-expanded'), 'true');
    assert.equal(thinkChild.getAttribute('aria-expanded'), 'false');

    // 6. 4-State Conversation Aura transitions: idle -> start -> running -> complete -> idle
    const cancelBtn = makeNode('button', { attrs: { 'data-testid': 'input-cancel-button' } });
    card.appendChild(cancelBtn);
    sandbox.window.__agClaudeStyle.sync();
    assert.equal(sandbox.window.__agClaudeStyle.getState().convAuraPhase, 'start');
    assert.equal(auraHost.getAttribute('data-aura-phase'), 'start');

    // Advance past 1.15s start surge -> enters steady running state
    fakeNow += 1200;
    assert.equal(sandbox.window.__agClaudeStyle.getState().convAuraPhase, 'running');
    assert.equal(auraHost.getAttribute('data-aura-phase'), 'running');

    // Cancel button disappears -> enters 1.40s complete chime state
    cancelBtn.remove();
    sandbox.window.__agClaudeStyle.sync();
    assert.equal(sandbox.window.__agClaudeStyle.getState().convAuraPhase, 'complete');
    assert.equal(auraHost.getAttribute('data-aura-phase'), 'complete');

    // Advance past 1.40s complete chime -> settles back to quiet idle state
    fakeNow += 1450;
    assert.equal(sandbox.window.__agClaudeStyle.getState().convAuraPhase, 'idle');
    assert.equal(auraHost.getAttribute('data-aura-phase'), 'idle');

    // Clicking send-button also sparks start surge immediately
    for (const fn of winListeners.get('click') || []) {
      fn({ target: sendBtn });
    }
    assert.equal(sandbox.window.__agClaudeStyle.getState().convAuraPhase, 'start');

    // 7. REMOVE_EXPRESSION disposes aura and cleans all DOM nodes & marker attributes
    vm.runInNewContext(cdp.REMOVE_EXPRESSION, sandbox);
    assert.equal(stageWrap.querySelector('.ag-cs-conv-aura-host'), null);
    assert.ok(disposedGlowCount >= 1, 'Expected glow.dispose() to clean up canvas listeners');
    assert.equal(workedBtn.hasAttribute('data-ag-cs-outer-open'), false);
    assert.equal(thinkChild.hasAttribute('data-ag-cs-auto-unfolded'), false);
    assert.equal(toolChild.hasAttribute('data-ag-cs-auto-unfolded'), false);
  } finally {
    for (const id of timers) clearTimeout(id);
  }
});

test('v3.7 orchestrates 4-tier motionLevel, Hero A~E optical transitions, dual-track streaming 250ms unwrap, cryo-lens, and lossless host icons', async () => {
  const injectExpr = cdp.buildInjectExpression(cdp.DEFAULT_CONFIG);
  const timers = new Set();
  const winListeners = new Map();
  const docListeners = new Map();
  const activeObservers = [];
  let fakeNow = 20000;

  function makeCtx2D() {
    return {
      canvas: { width: 200, height: 120 },
      save() {}, restore() {}, clearRect() {}, fillRect() {}, strokeRect() {},
      beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, arcTo() {},
      roundRect() {}, setLineDash() {}, ellipse() {}, quadraticCurveTo() {}, bezierCurveTo() {},
      clip() {}, fill() {}, stroke() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
      drawImage() {}, fillText() {},
      createLinearGradient() { return { addColorStop() {} }; },
      createRadialGradient() { return { addColorStop() {} }; },
      createImageData(w, h) { return { data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: w, height: h }; },
      getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: w, height: h }; },
      putImageData() {},
    };
  }

  let docRef = null;
  function makeTextNode(text) {
    return {
      nodeType: 3,
      nodeName: '#text',
      parentNode: null,
      parentElement: null,
      nodeValue: String(text ?? ''),
      get textContent() { return this.nodeValue; },
      set textContent(v) { this.nodeValue = String(v ?? ''); },
      get nextSibling() {
        if (!this.parentNode) return null;
        const arr = this.parentNode.childNodes;
        const i = arr.indexOf(this);
        return i >= 0 ? arr[i + 1] || null : null;
      },
    };
  }

  function makeNode(tag, opts = {}) {
    const attrs = new Map(Object.entries(opts.attrs || {}));
    const classes = new Set((opts.className || '').split(/\s+/).filter(Boolean));
    const listeners = new Map();
    const childNodes = [];
    let rectBox = opts.rect || { left: 100, top: 200, right: 500, bottom: 260, width: 400, height: 60 };

    const matchesSimple = (node, simple) => {
      if (!node || node.nodeType !== 1) return false;
      let rest = simple.trim();
      if (!rest) return false;
      const tagMatch = /^[a-zA-Z0-9_-]+/.exec(rest);
      if (tagMatch) {
        if (node.tagName !== tagMatch[0].toUpperCase()) return false;
        rest = rest.slice(tagMatch[0].length);
      }
      while (rest.length > 0) {
        if (rest[0] === '#') {
          const m = /^#((?:\\.|[a-zA-Z0-9_-])+)/.exec(rest);
          if (!m || node.id !== m[1].replace(/\\/g, '')) return false;
          rest = rest.slice(m[0].length);
        } else if (rest[0] === '.') {
          const m = /^\.([a-zA-Z0-9_-]+)/.exec(rest);
          if (!m || !node.classList.contains(m[1])) return false;
          rest = rest.slice(m[0].length);
        } else if (rest[0] === '[') {
          const m = /^\[([^\]=]+)(?:="([^"]*)")?\]/.exec(rest);
          if (!m) return false;
          const ok = m[2] === undefined ? node.hasAttribute(m[1]) : node.getAttribute(m[1]) === m[2];
          if (!ok) return false;
          rest = rest.slice(m[0].length);
        } else {
          return false;
        }
      }
      return true;
    };

    const matchesChain = (node, selector) =>
      selector.split(',').some((part) => {
        const tokens = part.trim().split(/\s+/).filter(Boolean);
        if (tokens.length === 0 || !matchesSimple(node, tokens[tokens.length - 1])) return false;
        let cur = node.parentElement;
        let idx = tokens.length - 2;
        while (cur && idx >= 0) {
          if (matchesSimple(cur, tokens[idx])) idx--;
          cur = cur.parentElement;
        }
        return idx < 0;
      });

    const node = {
      tagName: tag.toUpperCase(),
      nodeType: 1,
      id: attrs.get('id') || opts.id || '',
      dataset: {},
      get ownerDocument() { return docRef; },
      childNodes,
      get children() { return childNodes.filter((n) => n.nodeType === 1); },
      parentElement: null,
      parentNode: null,
      isConnected: true,
      hidden: false,
      disabled: false,
      scrollTop: 0,
      clientWidth: rectBox.width || 960,
      clientHeight: rectBox.height || 640,
      width: 120,
      height: 80,
      _setRect(r) { rectBox = r; },
      style: {
        _props: {},
        setProperty(k, v) { this._props[k] = String(v); },
        getPropertyValue(k) { return this._props[k] || ''; },
        removeProperty(k) { delete this._props[k]; },
      },
      classList: {
        contains: (c) => classes.has(c),
        add: (c) => classes.add(c),
        remove: (c) => classes.delete(c),
      },
      get className() { return Array.from(classes).join(' '); },
      set className(v) { classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => classes.add(c)); },
      get textContent() { return childNodes.map((c) => c.textContent).join(''); },
      set textContent(v) {
        childNodes.length = 0;
        const s = String(v ?? '');
        if (s.length > 0) this.appendChild(makeTextNode(s));
      },
      set innerHTML(h) {
        childNodes.length = 0;
        this._html = String(h ?? '');
      },
      get innerHTML() { return this._html || ''; },
      get childElementCount() { return this.children.length; },
      get firstChild() { return childNodes[0] || null; },
      get firstElementChild() { return this.children[0] || null; },
      get lastElementChild() { const ch = this.children; return ch[ch.length - 1] || null; },
      get nextSibling() {
        if (!this.parentNode) return null;
        const i = this.parentNode.childNodes.indexOf(this);
        return i >= 0 ? this.parentNode.childNodes[i + 1] || null : null;
      },
      get nextElementSibling() {
        if (!this.parentElement) return null;
        const elSibs = this.parentElement.children;
        const i = elSibs.indexOf(this);
        return i >= 0 ? elSibs[i + 1] || null : null;
      },
      get previousElementSibling() {
        if (!this.parentElement) return null;
        const elSibs = this.parentElement.children;
        const i = elSibs.indexOf(this);
        return i > 0 ? elSibs[i - 1] || null : null;
      },
      appendChild(c) {
        if (c.parentNode) c.parentNode.removeChild(c);
        c.parentElement = this;
        c.parentNode = this;
        c.isConnected = true;
        childNodes.push(c);
        return c;
      },
      insertBefore(c, ref) {
        if (c.parentNode) c.parentNode.removeChild(c);
        c.parentElement = this;
        c.parentNode = this;
        c.isConnected = true;
        const idx = ref ? childNodes.indexOf(ref) : -1;
        if (idx >= 0) childNodes.splice(idx, 0, c);
        else childNodes.push(c);
        return c;
      },
      removeChild(c) {
        const i = childNodes.indexOf(c);
        if (i >= 0) childNodes.splice(i, 1);
        c.parentElement = null;
        c.parentNode = null;
        c.isConnected = false;
        return c;
      },
      remove() { if (this.parentNode) this.parentNode.removeChild(this); },
      normalize() {
        for (let i = 0; i < childNodes.length; i++) {
          const cur = childNodes[i];
          if (cur.nodeType === 3) {
            if (!cur.nodeValue) {
              childNodes.splice(i, 1);
              i--;
              continue;
            }
            while (i + 1 < childNodes.length && childNodes[i + 1].nodeType === 3) {
              cur.nodeValue += childNodes[i + 1].nodeValue;
              childNodes[i + 1].parentNode = null;
              childNodes[i + 1].parentElement = null;
              childNodes.splice(i + 1, 1);
            }
          }
        }
      },
      setAttribute(k, v) { attrs.set(k, String(v)); if (k === 'id') node.id = String(v); },
      getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
      hasAttribute(k) { return attrs.has(k); },
      removeAttribute(k) { attrs.delete(k); },
      toggleAttribute(k, f) {
        const on = f === undefined ? !attrs.has(k) : Boolean(f);
        if (on) attrs.set(k, ''); else attrs.delete(k);
        return on;
      },
      animate(kf, o) {
        this._lastAnim = { kf, o };
        return { finished: Promise.resolve(), cancel() {}, commitStyles() {} };
      },
      addEventListener(ev, cb) { if (!listeners.has(ev)) listeners.set(ev, []); listeners.get(ev).push(cb); },
      removeEventListener(ev, cb) {
        const a = listeners.get(ev);
        if (a) { const i = a.indexOf(cb); if (i >= 0) a.splice(i, 1); }
      },
      dispatch(ev, payload = {}) {
        const evObj = { type: ev, target: this, ...payload };
        for (const cb of listeners.get(ev) || []) cb(evObj);
      },
      matches(sel) { return matchesChain(this, sel); },
      getContext(kind) { return kind === '2d' ? makeCtx2D() : null; },
      getBoundingClientRect() { return { ...rectBox }; },
      closest(sel) { let cur = this; while (cur) { if (matchesChain(cur, sel)) return cur; cur = cur.parentElement; } return null; },
      querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
      querySelectorAll(sel) {
        const out = [];
        const walk = (n) => { for (const c of n.children) { if (matchesChain(c, sel)) out.push(c); walk(c); } };
        walk(this);
        return out;
      },
      getElementById(id) {
        const find = (n) => (n.id === id ? n : n.children.map(find).find(Boolean) || null);
        return find(this);
      },
    };
    if (opts.text) node.textContent = opts.text;
    return node;
  }

  const html = makeNode('html');
  const head = makeNode('head');
  const body = makeNode('body', { className: 'theme-dark' });
  html.appendChild(head);
  html.appendChild(body);

  // Sidebar with 2 conversation rows + real host <a data-testid="new-conversation-button"> & non-sidebar buttons
  const sidebar = makeNode('aside', { rect: { left: 0, top: 0, right: 240, bottom: 800, width: 240, height: 800 } });
  const newConvBtn = makeNode('a', { attrs: { 'data-testid': 'new-conversation-button', href: '/' } });
  newConvBtn.appendChild(makeNode('svg', { attrs: { width: '16', height: '16' } }));
  const sidebarToggleBtn = makeNode('button', { attrs: { 'data-testid': 'sidebar-toggle-button' } });
  sidebarToggleBtn.appendChild(makeNode('svg', { attrs: { width: '16', height: '16' } }));
  const addProjBtn = makeNode('button', {
    attrs: { 'data-testid': 'sidebar-add-project-button', 'aria-label': '新建项目', 'data-ag-cs-icon-injected': 'panel-left' },
  });
  addProjBtn.appendChild(makeNode('svg', { className: 'ag-anim-icon' }));
  addProjBtn.appendChild(makeNode('svg', { attrs: { width: '16', height: '16', hidden: '', 'data-ag-cs-orig-svg': '1' } }));
  const overviewToggleBtn = makeNode('button', {
    attrs: { 'data-testid': 'toggle-overview-panel', 'aria-label': '切换概览面板' },
  });
  overviewToggleBtn.appendChild(makeNode('svg', { attrs: { width: '16', height: '16' } }));
  const autoBtn = makeNode('button', { attrs: { 'data-testid': 'automations-button' } });
  autoBtn.appendChild(makeNode('svg', { attrs: { width: '16', height: '16' } }));
  const copyMsgBtn = makeNode('button', { attrs: { 'aria-label': 'Copy message' } });
  copyMsgBtn.appendChild(makeNode('svg', { attrs: { width: '15', height: '15' } }));
  sidebar.appendChild(newConvBtn);
  sidebar.appendChild(sidebarToggleBtn);
  sidebar.appendChild(addProjBtn);
  sidebar.appendChild(overviewToggleBtn);
  sidebar.appendChild(autoBtn);
  sidebar.appendChild(copyMsgBtn);

  const rowList = makeNode('div', { rect: { left: 8, top: 100, right: 232, bottom: 500, width: 224, height: 400 } });
  const row0 = makeNode('div', {
    attrs: { 'data-testid': 'conversation-row-sidebar', 'data-selected': 'true' },
    rect: { left: 8, top: 110, right: 232, bottom: 138, width: 224, height: 28 },
  });
  const row1 = makeNode('div', {
    attrs: { 'data-testid': 'conversation-row-sidebar', 'data-selected': 'false' },
    rect: { left: 8, top: 144, right: 232, bottom: 172, width: 224, height: 28 },
  });
  rowList.appendChild(row0);
  rowList.appendChild(row1);
  sidebar.appendChild(rowList);
  body.appendChild(sidebar);

  // Start on .agy-home for Hero A liftoff test
  const stageShell = makeNode('div', { rect: { left: 240, top: 0, right: 1280, bottom: 800, width: 1040, height: 800 } });
  const home = makeNode('div', { className: 'agy-home', rect: { left: 240, top: 0, right: 1280, bottom: 800, width: 1040, height: 800 } });
  const homeGreet = makeNode('div', { attrs: { 'data-testid': 'home-greeting' } });
  homeGreet.appendChild(makeNode('h1', { text: 'Hello' }));
  const homeInputBox = makeNode('div', {
    attrs: { 'data-testid': 'agent-input-box' },
    rect: { left: 420, top: 420, right: 1100, bottom: 510, width: 680, height: 90 },
  });
  const homeCard = makeNode('div', { className: 'surface-composer-card' });
  const homeSendBtn = makeNode('button', { attrs: { 'data-testid': 'input-send-button' } });
  homeSendBtn.appendChild(makeNode('svg', { attrs: { width: '15', height: '15' } }));
  homeCard.appendChild(homeSendBtn);
  homeInputBox.appendChild(homeCard);
  home.appendChild(homeGreet);
  home.appendChild(homeInputBox);
  stageShell.appendChild(home);
  body.appendChild(stageShell);

  // Settings dialog for motionLevel & group glide test
  const dialog = makeNode('div', { attrs: { role: 'dialog' }, rect: { left: 320, top: 100, right: 960, bottom: 700, width: 640, height: 600 } });
  const appPanel = makeNode('div', { className: 'p-6' });
  appPanel.appendChild(makeNode('h2', { text: '外观' }));
  appPanel.appendChild(makeNode('div', { className: 'space-y-2' }));
  dialog.appendChild(appPanel);
  body.appendChild(dialog);

  docRef = {
    documentElement: html,
    head,
    body,
    hidden: false,
    defaultView: null,
    createElement: (t) => makeNode(t),
    createTextNode: (t) => makeTextNode(t),
    getElementById: (id) => html.getElementById(id),
    querySelector: (s) => html.querySelector(s),
    querySelectorAll: (s) => html.querySelectorAll(s),
    addEventListener(ev, cb) { if (!docListeners.has(ev)) docListeners.set(ev, []); docListeners.get(ev).push(cb); },
    removeEventListener(ev, cb) { const a = docListeners.get(ev); if (a) { const i = a.indexOf(cb); if (i >= 0) a.splice(i, 1); } },
  };

  const sandbox = {
    window: null,
    globalThis: null,
    document: docRef,
    innerWidth: 1280,
    innerHeight: 800,
    devicePixelRatio: 1,
    navigator: { language: 'zh-CN' },
    location: { pathname: '/' },
    localStorage: { _m: {}, getItem(k) { return this._m[k] || null; }, setItem(k, v) { this._m[k] = String(v); } },
    addEventListener(ev, cb) { if (!winListeners.has(ev)) winListeners.set(ev, []); winListeners.get(ev).push(cb); },
    removeEventListener(ev, cb) { const a = winListeners.get(ev); if (a) { const i = a.indexOf(cb); if (i >= 0) a.splice(i, 1); } },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    MutationObserver: class {
      constructor(cb) { this.cb = cb; this.target = null; }
      observe(target, opts) { this.target = target; this.opts = opts; activeObservers.push(this); }
      disconnect() { const i = activeObservers.indexOf(this); if (i >= 0) activeObservers.splice(i, 1); this.target = null; }
    },
    ResizeObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame: (fn) => { const id = setTimeout(() => fn(typeof fakeNow === 'number' ? fakeNow : Date.now()), 8); timers.add(id); return id; },
    cancelAnimationFrame: (id) => { timers.delete(id); clearTimeout(id); },
    setTimeout: (fn, ms) => { const id = setTimeout(fn, ms); timers.add(id); return id; },
    clearTimeout: (id) => { timers.delete(id); clearTimeout(id); },
    setInterval: () => 1,
    clearInterval: () => {},
    performance: { now: () => fakeNow },
    CSS: { supports: () => true },
    Uint8ClampedArray,
    Math, Date, JSON, Map, Set, WeakMap, WeakSet, Array, Object, String, Number, Boolean, Promise, Uint8Array, Uint32Array, Int32Array, Float32Array, Intl, RegExp, Error, TypeError, Function, encodeURIComponent, parseInt, parseFloat, isFinite, isNaN,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  docRef.defaultView = sandbox;

  const fireWinClick = (target) => {
    for (const cb of winListeners.get('click') || []) cb({ type: 'click', target });
  };
  const fireDocDown = (target, x = 400, y = 300) => {
    for (const cb of docListeners.get('pointerdown') || []) cb({ type: 'pointerdown', target, clientX: x, clientY: y, button: 0 });
  };

  try {
    const res = vm.runInNewContext(injectExpr, sandbox);
    assert.equal(res.status, 'ok');

    // 1. Default motionLevel = 'ultra' & host icons non-destructively hydrated (including <a data-testid="new-conversation-button">)
    assert.equal(html.getAttribute('data-ag-cs-motion'), 'ultra');
    assert.equal(newConvBtn.getAttribute('data-ag-cs-icon-injected'), 'sparkles-pen');
    assert.equal(sidebarToggleBtn.getAttribute('data-ag-cs-icon-injected'), 'panel-left');
    assert.equal(addProjBtn.hasAttribute('data-ag-cs-icon-injected'), false, 'sidebar-add-project-button must self-heal and never become panel-left');
    assert.equal(addProjBtn.querySelector('.ag-anim-icon'), null);
    assert.equal(addProjBtn.querySelector('svg')?.hasAttribute('hidden'), false);
    assert.equal(overviewToggleBtn.hasAttribute('data-ag-cs-icon-injected'), false, 'toggle-overview-panel must not become panel-left');
    assert.equal(autoBtn.getAttribute('data-ag-cs-icon-injected'), 'zap-bolt');
    assert.equal(homeSendBtn.getAttribute('data-ag-cs-icon-injected'), 'arrow-up-launch');
    assert.equal(copyMsgBtn.getAttribute('data-ag-cs-icon-injected'), 'copy-check');
    assert.ok(newConvBtn.querySelector('.ag-anim-icon'));
    assert.equal(newConvBtn.querySelector('[data-ag-cs-orig-svg]')?.hasAttribute('hidden'), true);

    // Clicking copy button plays check icon state
    fireWinClick(copyMsgBtn);
    assert.equal(copyMsgBtn.querySelector('.ag-anim-icon')?.getAttribute('data-icon-state'), 'check');

    // Settings motionLevel row switches tier & glides indicator; 'off' restores original host SVGs!
    let glideCalls = 0;
    const origGlide = sandbox.__agMotionEngine.glideIndicator;
    appPanel.querySelector('[data-ag-cs-fold-toggle]')?.dispatch('click');
    const motionBtns = appPanel.querySelectorAll('#ag-cs-settings-sec button').filter((b) => b.getAttribute('data-ag-cs-key') === 'motionLevel');
    assert.equal(motionBtns.length, 4);
    const stdBtn = motionBtns.find((b) => b.getAttribute('data-ag-cs-val') === '"standard"');
    const offBtn = motionBtns.find((b) => b.getAttribute('data-ag-cs-val') === '"off"');
    const ultraBtn = motionBtns.find((b) => b.getAttribute('data-ag-cs-val') === '"ultra"');
    assert.equal(ultraBtn.getAttribute('aria-pressed'), 'true');
    // Spy via pill creation during click
    stdBtn.dispatch('click');
    assert.equal(html.getAttribute('data-ag-cs-motion'), 'standard');
    assert.ok(body.querySelector('.ag-cs-pill-glide'), 'Expected shared pill glide indicator in standard tier');
    offBtn.dispatch('click');
    assert.equal(html.getAttribute('data-ag-cs-motion'), 'off');
    assert.equal(newConvBtn.hasAttribute('data-ag-cs-icon-injected'), false, 'Motion off must restore original SVG');
    assert.equal(newConvBtn.querySelector('.ag-anim-icon'), null);
    ultraBtn.dispatch('click');
    assert.equal(html.getAttribute('data-ag-cs-motion'), 'ultra');
    assert.equal(newConvBtn.getAttribute('data-ag-cs-icon-injected'), 'sparkles-pen');
    void origGlide;
    void glideCalls;

    // 2. Hero A: Liftoff from .agy-home -> formal [data-testid="conversation-view"]
    fireWinClick(homeSendBtn);
    home.remove();
    const convView = makeNode('div', {
      attrs: { 'data-testid': 'conversation-view' },
      rect: { left: 240, top: 0, right: 1280, bottom: 800, width: 1040, height: 800 },
    });
    const viewport = makeNode('div', { attrs: { 'data-testid': 'autoscroll-viewport' } });
    const turn0 = makeNode('div', { attrs: { 'data-testid': 'user-input-step' } });
    const turn1 = makeNode('div', { attrs: { 'data-testid': 'user-input-step' } });
    const firstBubble = makeNode('div', { attrs: { 'data-testid': 'user-message-bubble' }, text: 'Launch!' });
    turn0.appendChild(firstBubble);
    viewport.appendChild(turn0);
    viewport.appendChild(turn1);
    convView.appendChild(viewport);

    const navWrap = makeNode('div');
    const navTurn0 = makeNode('button', { attrs: { 'data-testid': 'conversation-navigator-turn', 'data-turn-index': '0' } });
    const navTurn1 = makeNode('button', { attrs: { 'data-testid': 'conversation-navigator-turn', 'data-turn-index': '1' } });
    navWrap.appendChild(navTurn0);
    navWrap.appendChild(navTurn1);
    convView.appendChild(navWrap);

    const convInputBox = makeNode('div', {
      attrs: { 'data-testid': 'agent-input-box' },
      rect: { left: 420, top: 700, right: 1100, bottom: 780, width: 680, height: 80 },
    });
    const convCard = makeNode('div', { className: 'surface-composer-card' });
    const modelTrigger = makeNode('button', {
      attrs: { 'data-testid': 'model-selector-trigger' },
      text: 'Gemini 4 Carbon High',
      rect: { left: 430, top: 702, right: 610, bottom: 730, width: 180, height: 28 },
    });
    convCard.appendChild(modelTrigger);
    convInputBox.appendChild(convCard);
    convView.appendChild(convInputBox);
    stageShell.appendChild(convView);

    sandbox.window.__agClaudeStyle.sync();
    const liftoffVeil = body.querySelector('.ag-cs-liftoff-veil');
    assert.ok(liftoffVeil, 'Expected .ag-cs-liftoff-veil mounted on Hero A liftoff');
    assert.ok(liftoffVeil.querySelector('.ag-cs-liftoff-ring'));
    assert.equal(liftoffVeil.style.getPropertyValue('--ag-lift-x'), '760px');
    assert.equal(liftoffVeil.style.getPropertyValue('--ag-lift-y'), '465px');
    assert.equal(firstBubble.getAttribute('data-ag-cs-liftoff-bubble'), '1');
    assert.ok(convInputBox._lastAnim, 'Expected FLIP spring dock animation on bottom agent-input-box');
    const stAfterLiftoff = sandbox.window.__agClaudeStyle.getState();
    assert.ok(stAfterLiftoff.convAuraOptics.strength > 0.85, 'Expected high-water liftoff aura ebb start (~0.92)');

    // 3. Hero B2: Sidebar session switch -> .ag-cs-sidebar-glide-pill + data-ag-cs-stage-glide="up"
    row0.setAttribute('data-selected', 'false');
    row1.setAttribute('data-selected', 'true');
    sandbox.window.__agClaudeStyle.sync();
    assert.ok(body.querySelector('.ag-cs-sidebar-glide-pill'), 'Expected .ag-cs-sidebar-glide-pill on row switch');
    assert.equal(viewport.getAttribute('data-ag-cs-stage-glide'), 'up');

    row1.setAttribute('data-selected', 'false');
    row0.setAttribute('data-selected', 'true');
    sandbox.window.__agClaudeStyle.sync();
    assert.equal(viewport.getAttribute('data-ag-cs-stage-glide'), 'down');

    // 4. Hero C: Changed files card caustic + >= 6000ms long-run completion caustic
    const changedHdr = makeNode('div', {
      attrs: { 'data-testid': 'changed-files-card-header' },
      rect: { left: 420, top: 260, right: 980, bottom: 300, width: 560, height: 40 },
    });
    viewport.appendChild(changedHdr);
    sandbox.window.__agClaudeStyle.sync();
    assert.equal(changedHdr.getAttribute('data-ag-cs-caustic'), '1');

    // Short run (< 6000ms) MUST NOT trigger composer caustic
    const cancelBtn = makeNode('button', { attrs: { 'data-testid': 'input-cancel-button' } });
    convCard.appendChild(cancelBtn);
    sandbox.window.__agClaudeStyle.sync();
    fakeNow += 2500;
    cancelBtn.remove();
    sandbox.window.__agClaudeStyle.sync();
    assert.equal(convCard.hasAttribute('data-ag-cs-caustic'), false, 'Short <6s run must not trigger composer caustic');

    // Long run (>= 6000ms) MUST trigger composer caustic
    convCard.appendChild(cancelBtn);
    sandbox.window.__agClaudeStyle.sync();
    fakeNow += 6500;

    // 5. While streaming in ultra tier: Dual-Track Streaming + 250ms pure-text unwrap guard!
    const thinkTrig = makeNode('button', {
      attrs: { 'data-testid': 'thinking-collapsible-trigger', 'aria-expanded': 'true' },
      text: 'Thinking...',
    });
    const thinkBody = makeNode('div');
    const proseArt = makeNode('div', { attrs: { 'data-testid': 'planner-response-text' } });
    const codePre = makeNode('pre');
    proseArt.appendChild(codePre);
    viewport.appendChild(thinkTrig);
    viewport.appendChild(thinkBody);
    viewport.appendChild(proseArt);
    sandbox.window.__agClaudeStyle.sync();

    assert.equal(thinkBody.getAttribute('data-ag-cs-thought-streaming'), '1');
    const streamObs = activeObservers.find((o) => o.target === convView);
    assert.ok(streamObs, 'Expected dedicated streaming MutationObserver attached to conversation-view');

    // Emit thought chunk, code line, and natural language prose paragraph
    const thoughtP = makeNode('p', { text: 'Analyzing optics...' });
    thinkBody.appendChild(thoughtP);
    const codeLine = makeNode('span', { text: 'const x = 42;' });
    codePre.appendChild(codeLine);
    const proseP = makeNode('p', { text: 'Hello crystal world' });
    proseArt.appendChild(proseP);
    fakeNow += 40;
    streamObs.cb([
      { type: 'childList', target: thinkBody, addedNodes: [thoughtP] },
      { type: 'childList', target: codePre, addedNodes: [codeLine] },
      { type: 'childList', target: proseArt, addedNodes: [proseP] },
    ]);

    assert.equal(thoughtP.classList.contains('ag-cs-thought-chunk'), true);
    assert.equal(codeLine.classList.contains('ag-cs-code-scan'), true, 'Code block additions must use zero-blur .ag-cs-code-scan');
    assert.equal(codeLine.querySelector('.ag-cs-stream-chunk'), null, 'Code block must NEVER be blurred with .ag-cs-stream-chunk');
    assert.equal(proseP.classList.contains('ag-cs-stream-chunk'), true, 'Natural prose element must be tagged with .ag-cs-stream-chunk');
    assert.equal(proseP.childNodes.length, 1, 'Must NEVER splice React TextNodes or insert wrapper spans');
    assert.equal(proseP.childNodes[0].nodeType, 3, 'React TextNode must remain untouched');
    assert.equal(proseP.textContent, 'Hello crystal world');

    // Wait > 250ms -> .ag-cs-stream-chunk class MUST auto-remove cleanly with zero DOM tree mutation!
    for (let w = 0; w < 24 && proseP.classList.contains('ag-cs-stream-chunk'); w++) {
      await new Promise((r) => setTimeout(r, 25));
    }
    assert.equal(proseP.classList.contains('ag-cs-stream-chunk'), false, 'Stream chunk class must clear within 250ms');
    assert.equal(proseP.childNodes.length, 1);
    assert.equal(proseP.childNodes[0].nodeType, 3, 'Text node remains untouched');
    assert.equal(proseP.textContent, 'Hello crystal world');

    // Finish >= 6000ms run -> triggers Hero C composer caustic & cleans thought-streaming immediately
    cancelBtn.remove();
    sandbox.window.__agClaudeStyle.sync();
    assert.equal(convCard.getAttribute('data-ag-cs-caustic'), '1', 'Long >=6s run completion must trigger composer caustic');
    assert.equal(thinkBody.hasAttribute('data-ag-cs-thought-streaming'), false);

    // 6. Hero D: Switching model signature triggers data-ag-cs-fiber-camp
    assert.equal(convCard.hasAttribute('data-ag-cs-fiber-camp'), false, 'Initial mount must not trigger fiber pulse');
    modelTrigger.textContent = 'Claude Opus 4.6 Thinking';
    sandbox.window.__agClaudeStyle.sync();
    assert.equal(convCard.getAttribute('data-ag-cs-fiber-camp'), 'claude');

    modelTrigger.textContent = 'Orchestrator';
    sandbox.window.__agClaudeStyle.sync();
    assert.equal(convCard.getAttribute('data-ag-cs-fiber-camp'), 'antigravity');

    // 7. Hero E: Clicking timeline navigator turn triggers sonar on its own split-pane conversation-view
    fireWinClick(navTurn1);
    assert.equal(turn1.getAttribute('data-ag-cs-sonar'), '1');
    assert.equal(turn0.hasAttribute('data-ag-cs-sonar'), false);

    const convViewRight = makeNode('div', { attrs: { 'data-testid': 'conversation-view' } });
    const rightTurn0 = makeNode('div', { attrs: { 'data-testid': 'user-input-step' } });
    const rightNav0 = makeNode('button', { attrs: { 'data-testid': 'conversation-navigator-turn', 'data-turn-index': '0' } });
    convViewRight.appendChild(rightTurn0);
    convViewRight.appendChild(rightNav0);
    stageShell.appendChild(convViewRight);
    fireWinClick(rightNav0);
    assert.equal(rightTurn0.getAttribute('data-ag-cs-sonar'), '1', 'Right split-pane navigator must target right pane turn');
    assert.equal(turn0.hasAttribute('data-ag-cs-sonar'), false, 'Left pane turn0 must not be hit by right pane navigator');
    convViewRight.remove();

    // 8. Anchor Cryo-Lens overlay origin & --ag-row-i stagger injection
    fireDocDown(modelTrigger, 520, 710);
    const overlay = makeNode('div', {
      className: 'agy-overlay',
      rect: { left: 420, top: 440, right: 740, bottom: 700, width: 320, height: 260 },
    });
    for (let i = 0; i < 4; i++) {
      overlay.appendChild(makeNode('div', { attrs: { role: 'menuitem' }, text: `Item ${i}` }));
    }
    body.appendChild(overlay);
    sandbox.window.__agClaudeStyle.sync();
    assert.equal(overlay.style.getPropertyValue('--ag-origin-x'), '100px');
    assert.equal(overlay.style.getPropertyValue('--ag-origin-y'), '276px');
    assert.equal(overlay.children[0].style.getPropertyValue('--ag-row-i'), '0');
    assert.equal(overlay.children[3].style.getPropertyValue('--ag-row-i'), '3');

    // 9. Hero B1: Returning from formal conversation -> .agy-home triggers tide swell
    convView.remove();
    stageShell.appendChild(home);
    sandbox.window.__agClaudeStyle.sync();
    assert.equal(sandbox.window.__agClaudeStyle.getState().hasRipple, true);

    // Clean teardown via REMOVE_EXPRESSION
    vm.runInNewContext(cdp.REMOVE_EXPRESSION, sandbox);
    assert.equal(html.hasAttribute('data-ag-cs-motion'), false);
    assert.equal(body.querySelector('.ag-cs-liftoff-veil'), null);
    assert.equal(body.querySelector('.ag-cs-sidebar-glide-pill'), null);
    assert.equal(newConvBtn.hasAttribute('data-ag-cs-icon-injected'), false);
    assert.equal(newConvBtn.querySelector('.ag-anim-icon'), null);
    assert.equal(newConvBtn.querySelector('svg')?.hasAttribute('hidden'), false);
  } finally {
    for (const id of timers) clearTimeout(id);
  }
});

test('Prism v1.0 regression guard: Thought Translator overlay (.ag-prism-thought-overlay & .ag-prism-thought-raw-toggle) suffers 0 child mutations, 0 normalize, and 0 flicker; lightPreset & 0fps idle aura sleep work cleanly', async () => {
  const injectExpr = cdp.buildInjectExpression(cdp.DEFAULT_CONFIG);
  const timers = new Set();
  const activeObservers = [];
  let fakeNow = 50000;

  let docRef = null;
  function makeTextNode(text) {
    return {
      nodeType: 3,
      nodeName: '#text',
      parentNode: null,
      parentElement: null,
      nodeValue: String(text ?? ''),
      get textContent() { return this.nodeValue; },
      set textContent(v) { this.nodeValue = String(v ?? ''); },
      get nextSibling() {
        if (!this.parentNode) return null;
        const arr = this.parentNode.childNodes;
        const i = arr.indexOf(this);
        return i >= 0 ? arr[i + 1] || null : null;
      },
    };
  }

  function makeNode(tag, opts = {}) {
    const attrs = new Map(Object.entries(opts.attrs || {}));
    const classes = new Set((opts.className || '').split(/\s+/).filter(Boolean));
    const listeners = new Map();
    const childNodes = [];
    let rectBox = opts.rect || { left: 0, top: 0, right: 1000, bottom: 750, width: 1000, height: 750 };

    const matchesSimple = (node, simple) => {
      if (!node || node.nodeType !== 1) return false;
      let rest = simple.trim();
      if (!rest) return false;
      const tagMatch = /^[a-zA-Z0-9_-]+/.exec(rest);
      if (tagMatch) {
        if (node.tagName !== tagMatch[0].toUpperCase()) return false;
        rest = rest.slice(tagMatch[0].length);
      }
      while (rest.length > 0) {
        if (rest[0] === '#') {
          const m = /^#((?:\\.|[a-zA-Z0-9_-])+)/.exec(rest);
          if (!m || node.id !== m[1].replace(/\\/g, '')) return false;
          rest = rest.slice(m[0].length);
        } else if (rest[0] === '.') {
          const m = /^\.([a-zA-Z0-9_-]+)/.exec(rest);
          if (!m || !node.classList.contains(m[1])) return false;
          rest = rest.slice(m[0].length);
        } else if (rest[0] === '[') {
          const m = /^\[([^\]=]+)(?:="([^"]*)")?\]/.exec(rest);
          if (!m) return false;
          const ok = m[2] === undefined ? node.hasAttribute(m[1]) : node.getAttribute(m[1]) === m[2];
          if (!ok) return false;
          rest = rest.slice(m[0].length);
        } else {
          return false;
        }
      }
      return true;
    };

    const matchesChain = (node, selector) =>
      selector.split(',').some((part) => {
        const tokens = part.trim().split(/\s+/).filter(Boolean);
        if (tokens.length === 0 || !matchesSimple(node, tokens[tokens.length - 1])) return false;
        let cur = node.parentElement;
        let idx = tokens.length - 2;
        while (cur && idx >= 0) {
          if (matchesSimple(cur, tokens[idx])) idx--;
          cur = cur.parentElement;
        }
        return idx < 0;
      });

    const node = {
      tagName: tag.toUpperCase(),
      nodeType: 1,
      id: attrs.get('id') || opts.id || '',
      dataset: {},
      get ownerDocument() { return docRef; },
      childNodes,
      get children() { return childNodes.filter((n) => n.nodeType === 1); },
      parentElement: null,
      parentNode: null,
      isConnected: true,
      hidden: Boolean(opts.hidden),
      disabled: false,
      clientWidth: rectBox.width || 1000,
      clientHeight: rectBox.height || 750,
      width: 120,
      height: 80,
      _normalizeCalls: 0,
      _attrMutations: 0,
      _classMutations: 0,
      style: {
        _props: {},
        setProperty(k, v) { this._props[k] = String(v); },
        getPropertyValue(k) { return this._props[k] || ''; },
        removeProperty(k) { delete this._props[k]; },
      },
      classList: {
        contains: (c) => classes.has(c),
        add: (c) => { node._classMutations += 1; classes.add(c); },
        remove: (c) => { node._classMutations += 1; classes.delete(c); },
      },
      get className() { return Array.from(classes).join(' '); },
      set className(v) { node._classMutations += 1; classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => classes.add(c)); },
      get textContent() { return childNodes.map((c) => c.textContent).join(''); },
      set textContent(v) {
        childNodes.length = 0;
        const s = String(v ?? '');
        if (s.length > 0) this.appendChild(makeTextNode(s));
      },
      set innerHTML(h) { childNodes.length = 0; this._html = String(h ?? ''); },
      get innerHTML() { return this._html || ''; },
      get childElementCount() { return this.children.length; },
      get firstChild() { return childNodes[0] || null; },
      get firstElementChild() { return this.children[0] || null; },
      get lastElementChild() { const ch = this.children; return ch[ch.length - 1] || null; },
      get nextElementSibling() {
        if (!this.parentElement) return null;
        const elSibs = this.parentElement.children;
        const i = elSibs.indexOf(this);
        return i >= 0 ? elSibs[i + 1] || null : null;
      },
      get previousElementSibling() {
        if (!this.parentElement) return null;
        const elSibs = this.parentElement.children;
        const i = elSibs.indexOf(this);
        return i > 0 ? elSibs[i - 1] || null : null;
      },
      appendChild(c) {
        if (c.parentNode) c.parentNode.removeChild(c);
        c.parentElement = this;
        c.parentNode = this;
        c.isConnected = true;
        childNodes.push(c);
        return c;
      },
      insertBefore(c, ref) {
        if (c.parentNode) c.parentNode.removeChild(c);
        c.parentElement = this;
        c.parentNode = this;
        c.isConnected = true;
        const idx = ref ? childNodes.indexOf(ref) : -1;
        if (idx >= 0) childNodes.splice(idx, 0, c);
        else childNodes.push(c);
        return c;
      },
      removeChild(c) {
        const i = childNodes.indexOf(c);
        if (i >= 0) childNodes.splice(i, 1);
        c.parentElement = null;
        c.parentNode = null;
        c.isConnected = false;
        return c;
      },
      remove() { if (this.parentNode) this.parentNode.removeChild(this); },
      normalize() { this._normalizeCalls += 1; },
      setAttribute(k, v) { node._attrMutations += 1; attrs.set(k, String(v)); if (k === 'id') node.id = String(v); },
      getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
      hasAttribute(k) { return attrs.has(k); },
      removeAttribute(k) { node._attrMutations += 1; attrs.delete(k); },
      toggleAttribute(k, f) {
        node._attrMutations += 1;
        const on = f === undefined ? !attrs.has(k) : Boolean(f);
        if (on) attrs.set(k, ''); else attrs.delete(k);
        return on;
      },
      addEventListener(ev, cb) { if (!listeners.has(ev)) listeners.set(ev, []); listeners.get(ev).push(cb); },
      removeEventListener(ev, cb) { const a = listeners.get(ev); if (a) { const i = a.indexOf(cb); if (i >= 0) a.splice(i, 1); } },
      dispatch(ev, payload = {}) {
        const evObj = { type: ev, target: this, ...payload };
        for (const cb of listeners.get(ev) || []) cb(evObj);
      },
      getContext(kind) {
        if (kind !== '2d') return null;
        return {
          canvas: { width: 200, height: 100 },
          save() {}, restore() {}, clearRect() {}, fillRect() {}, strokeRect() {},
          beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, arcTo() {},
          roundRect() {}, setLineDash() {}, ellipse() {}, quadraticCurveTo() {}, bezierCurveTo() {},
          clip() {}, fill() {}, stroke() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
          drawImage() {}, fillText() {},
          createLinearGradient() { return { addColorStop() {} }; },
          createRadialGradient() { return { addColorStop() {} }; },
          createImageData(w, h) { return { data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: w, height: h }; },
          getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: w, height: h }; },
          putImageData() {},
        };
      },
      getBoundingClientRect() { return { ...rectBox }; },
      closest(sel) { let cur = this; while (cur) { if (matchesChain(cur, sel)) return cur; cur = cur.parentElement; } return null; },
      querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
      querySelectorAll(sel) {
        const out = [];
        const walk = (n) => { for (const c of n.children) { if (matchesChain(c, sel)) out.push(c); walk(c); } };
        walk(this);
        return out;
      },
      getElementById(id) {
        const find = (n) => (n.id === id ? n : n.children.map(find).find(Boolean) || null);
        return find(this);
      },
    };
    if (opts.text) node.textContent = opts.text;
    return node;
  }

  const html = makeNode('html', {
    attrs: { 'data-ag-prism-thought-owner': 'obsidian-prism-thought' },
  });
  const head = makeNode('head');
  const body = makeNode('body', { className: 'theme-light' });
  html.appendChild(head);
  html.appendChild(body);

  const stageShell = makeNode('div', { rect: { left: 0, top: 0, right: 1000, bottom: 750, width: 1000, height: 750 } });
  const convView = makeNode('div', {
    attrs: { 'data-testid': 'conversation-view' },
    rect: { left: 0, top: 0, right: 1000, bottom: 750, width: 1000, height: 750 },
  });

  // Construct Thought Chinese Thought Translation DOM inside expanded thinking panel
  const thinkTrig = makeNode('button', {
    attrs: { 'data-testid': 'thinking-collapsible-trigger', 'aria-expanded': 'true', 'data-op-thought-state': 'streaming' },
    text: '正在思考...',
  });
  const thinkPanel = makeNode('div', {
    attrs: { 'data-op-zh-ready': '1' },
  });
  const thoughtOverlay = makeNode('div', { className: 'ag-prism-thought-overlay' });
  const thoughtBody = makeNode('span', { className: 'ag-prism-thought-body', text: '正在规划增量调度...' });
  const thoughtRawToggle = makeNode('button', { className: 'ag-prism-thought-raw-toggle', attrs: { 'aria-label': 'Copy / 查看原文' } });
  thoughtRawToggle.appendChild(makeNode('svg', { className: 'lucide-copy', attrs: { width: '14', height: '14' } }));
  thoughtRawToggle.appendChild(makeTextNode('原文'));
  thoughtOverlay.appendChild(thoughtBody);
  thoughtOverlay.appendChild(thoughtRawToggle);
  const hiddenEngP = makeNode('p', { hidden: true, text: 'Planning incremental scheduler...' });
  thinkPanel.appendChild(thoughtOverlay);
  thinkPanel.appendChild(hiddenEngP);
  convView.appendChild(thinkTrig);
  convView.appendChild(thinkPanel);

  const inputBox = makeNode('div', { attrs: { 'data-testid': 'agent-input-box' } });
  const card = makeNode('div', { className: 'surface-composer-card' });
  const sendBtn = makeNode('button', { attrs: { 'data-testid': 'send-button' } });
  card.appendChild(sendBtn);
  inputBox.appendChild(card);
  convView.appendChild(inputBox);
  stageShell.appendChild(convView);
  body.appendChild(stageShell);

  // Settings dialog for lightPreset & absorbed module switches
  const dialog = makeNode('div', { attrs: { role: 'dialog' } });
  const appPanel = makeNode('div', { className: 'p-6' });
  appPanel.appendChild(makeNode('h2', { text: '外观' }));
  appPanel.appendChild(makeNode('div', { className: 'space-y-2' }));
  dialog.appendChild(appPanel);
  body.appendChild(dialog);

  docRef = {
    documentElement: html,
    head,
    body,
    hidden: false,
    defaultView: null,
    createElement: (t) => makeNode(t),
    createTextNode: (t) => makeTextNode(t),
    getElementById: (id) => html.getElementById(id),
    querySelector: (s) => html.querySelector(s),
    querySelectorAll: (s) => html.querySelectorAll(s),
    addEventListener() {},
    removeEventListener() {},
  };

  const telemetrySyncCalls = [];
  const sliderSyncCalls = [];

  const sandbox = {
    window: null,
    globalThis: null,
    document: docRef,
    innerWidth: 1000,
    innerHeight: 750,
    devicePixelRatio: 1,
    navigator: { language: 'zh-CN' },
    location: { pathname: '/c/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
    localStorage: {
      _m: {
        // Seed legacy colon storage to verify migration -> ag-prism:config
        'ag-claude-style:config': JSON.stringify({ palette: 'obsidian', lightPreset: 'crystal' }),
      },
      getItem(k) { return this._m[k] || null; },
      setItem(k, v) { this._m[k] = String(v); },
    },
    addEventListener() {},
    removeEventListener() {},
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    MutationObserver: class {
      constructor(cb) { this.cb = cb; this.target = null; }
      observe(target, opts) { this.target = target; this.opts = opts; activeObservers.push(this); }
      disconnect() { const i = activeObservers.indexOf(this); if (i >= 0) activeObservers.splice(i, 1); this.target = null; }
    },
    ResizeObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame: (fn) => { const id = setTimeout(() => fn(typeof fakeNow === 'number' ? fakeNow : Date.now()), 8); timers.add(id); return id; },
    cancelAnimationFrame: (id) => { timers.delete(id); clearTimeout(id); },
    setTimeout: (fn, ms) => { const id = setTimeout(fn, ms); timers.add(id); return id; },
    clearTimeout: (id) => { timers.delete(id); clearTimeout(id); },
    setInterval: () => 1,
    clearInterval: () => {},
    performance: { now: () => fakeNow },
    CSS: { supports: () => true },
    Uint8ClampedArray,
    Math, Date, JSON, Map, Set, WeakMap, WeakSet, Array, Object, String, Number, Boolean, Promise, Uint8Array, Uint32Array, Int32Array, Float32Array, Intl, RegExp, Error, TypeError, Function, encodeURIComponent, parseInt, parseFloat, isFinite, isNaN,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  docRef.defaultView = sandbox;

  try {
    // Make conversation initially idle (temporarily clear streaming attr on thinkTrig) to test 0fps idle sleep first!
    thinkTrig.removeAttribute('data-op-thought-state');
    thinkTrig.textContent = '已思考 4 秒';

    const res = vm.runInNewContext(injectExpr, sandbox);
    assert.equal(res.status, 'ok');

    // ── Check 0: Legacy storage migrated to localStorage['ag-prism:config'] ──
    assert.ok(sandbox.localStorage.getItem('ag-prism:config'), 'Expected legacy ag-claude-style:config migrated to ag-prism:config');

    // ── Check ③: Conversation horizon aura 32% height + 20fps~45fps living flow in standard/ultra + 0fps sleep in subtle/off ──
    const auraHost = stageShell.querySelector('.ag-cs-conv-aura-host');
    assert.ok(auraHost, 'Expected .ag-cs-conv-aura-host mounted');
    assert.equal(auraHost.style.getPropertyValue('height'), '32%');
    assert.equal(auraHost.style.getPropertyValue('bottom'), '0');
    assert.equal(auraHost.hasAttribute('data-aura-sleep'), false, 'Ultra/Standard idle aura must keep breathing (never frozen)');

    const stIdle = sandbox.window.__agPrism.getState();
    assert.equal(stIdle.convAuraPhase, 'idle');
    assert.equal(stIdle.convAuraSleeping, false, 'Expected convAuraSleeping === false in ultra idle living flow');
    assert.equal(stIdle.convAuraCanvasSize.height, Math.round(750 * 0.32), 'Canvas height must be 32% of parent (68% pixel savings)');
    assert.equal(stIdle.convAuraOptics.frameMs, 110, 'Idle living flow runs at low-power 110ms (~9fps)');
    assert.equal(stIdle.convAuraOptics.speed, 0.72, 'Idle living flow speed must be 0.72');
    assert.ok(Math.abs(stIdle.convAuraOptics.strength - 0.52) < 0.05, 'Daylight idle aura base strength must breathe around 0.52');
    const drawsAtMount = stIdle.convAuraDrawCount;
    assert.ok(drawsAtMount >= 1);

    // Advance clock & poll up to 600ms -> continuous living flow draws new frames cleanly even on loaded CI runners
    fakeNow += 180;
    let drawsAfterFlow = drawsAtMount;
    for (let w = 0; w < 24; w++) {
      await new Promise((r) => setTimeout(r, 25));
      drawsAfterFlow = sandbox.window.__agPrism.getState().convAuraDrawCount;
      if (drawsAfterFlow > drawsAtMount) break;
    }
    assert.ok(drawsAfterFlow > drawsAtMount, `Expected continuous living aura frames in ultra idle (${drawsAfterFlow} > ${drawsAtMount})`);

    // Switch motionLevel to 'subtle' -> enters true 0fps static sleep!
    sandbox.window.__agPrism.refreshConfig({ ...cdp.DEFAULT_CONFIG, lightPreset: 'crystal', motionLevel: 'subtle' });
    assert.equal(sandbox.window.__agPrism.getState().convAuraSleeping, true, 'Subtle motion tier must sleep at 0fps');
    assert.equal(auraHost.getAttribute('data-aura-sleep'), '1');
    const drawsWhenSleeping = sandbox.window.__agPrism.getState().convAuraDrawCount;
    fakeNow += 1500;
    await new Promise((r) => setTimeout(r, 70));
    assert.equal(sandbox.window.__agPrism.getState().convAuraDrawCount, drawsWhenSleeping, 'Subtle/off aura must draw 0 extra frames while sleeping');

    // Switch back to 'ultra' -> wakes living flow immediately!
    sandbox.window.__agPrism.refreshConfig({ ...cdp.DEFAULT_CONFIG, lightPreset: 'crystal', motionLevel: 'ultra' });
    assert.equal(sandbox.window.__agPrism.getState().convAuraSleeping, false);

    // Also test About Git Repo Sync button with mocked __agPrismRepoBridge (no-remote & remote pull)
    appPanel.querySelector('[data-ag-cs-fold-toggle]')?.dispatch('click');
    const repoSyncBtn = appPanel.querySelector('button[data-ag-cs-repo-sync]');
    const repoChip = appPanel.querySelector('[data-ag-cs-repo-status]');
    assert.ok(repoSyncBtn && repoChip, 'Expected Git sync button & status chip');
    let repoCalls = [];
    sandbox.window.__agPrismRepoBridge = (req) => {
      repoCalls.push(req.action);
      if (req.action === 'status') {
        return Promise.resolve({ ok: true, branch: 'main', shortHash: 'abc1234', hasRemote: true, remoteUrl: 'https://github.com/example/obsidian-prism.git' });
      }
      return Promise.resolve({ ok: true, updated: true, branch: 'main', shortHash: 'def5678' });
    };
    repoSyncBtn.dispatch('click');
    await new Promise((r) => setTimeout(r, 30));
    assert.deepEqual(repoCalls, ['status', 'pull']);
    assert.equal(repoChip.getAttribute('data-status'), 'updated');
    assert.ok(repoChip.textContent.includes('def5678'));

    // ── Check ①: Thought Chinese thought translation 100% isolation & zero raw-toggle button flicker ──
    const rawToggleMutBefore = thoughtRawToggle._attrMutations + thoughtRawToggle._classMutations;
    const overlayMutBefore = thoughtOverlay._attrMutations + thoughtOverlay._classMutations;
    assert.equal(thoughtRawToggle.hasAttribute('data-ag-cs-icon-injected'), false, 'Raw toggle button must NEVER be hijacked by host icon injector');
    assert.equal(thoughtRawToggle.querySelector('.ag-anim-icon'), null);

    // Enter streaming state
    thinkTrig.setAttribute('data-op-thought-state', 'streaming');
    thinkTrig.textContent = '正在思考...';
    const cancelBtn = makeNode('button', { attrs: { 'data-testid': 'input-cancel-button' } });
    card.appendChild(cancelBtn);
    sandbox.window.__agPrism.sync();

    // Outer shell gets comet streaming marker, while inner nodes remain untouched; verify start/running optics
    assert.equal(thinkPanel.getAttribute('data-ag-cs-thought-streaming'), '1', 'Outer panel shell should carry streaming comet attribute');
    const stStart = sandbox.window.__agPrism.getState();
    assert.equal(stStart.convAuraPhase, 'start');
    assert.equal(stStart.convAuraOptics.frameMs, 22);
    assert.equal(stStart.convAuraOptics.speed, 1.95);
    assert.equal(stStart.convAuraOptics.surge, 0.5);
    fakeNow += 1500;
    sandbox.window.__agPrism.sync();
    const stRunning = sandbox.window.__agPrism.getState();
    assert.equal(stRunning.convAuraPhase, 'running');
    assert.equal(stRunning.convAuraOptics.frameMs, 32);
    assert.equal(stRunning.convAuraOptics.speed, 1.45);
    assert.equal(stRunning.convAuraOptics.prism, 0.7);
    const rootObs = activeObservers.find((o) => o.target === html);
    const streamObs = activeObservers.find((o) => o.target === convView);
    assert.ok(rootObs && streamObs, 'Expected root and stream MutationObservers');

    const syncCountBeforeThought = sandbox.window.__agPrism.getState().perf.syncCount;

    // Simulate continuous Thought Chinese overlay updates + hidden native English streaming chunks
    for (let step = 0; step < 5; step++) {
      fakeNow += 80;
      const newEngSpan = makeNode('span', { text: ` English step ${step}` });
      hiddenEngP.appendChild(newEngSpan);
      const newZhText = makeTextNode(` 中文思考增量 ${step}`);
      thoughtBody.appendChild(newZhText);

      // Fire root observer with Thought mutations -> must be 100% ignored (0 sync!)
      rootObs.cb([
        { type: 'childList', target: thoughtBody, addedNodes: [newZhText], removedNodes: [] },
        { type: 'attributes', target: thoughtRawToggle, attributeName: 'class' },
      ]);

      // Fire streaming observer with both Thought overlay & hidden English child inside Thought-managed panel -> 0 chunks, 0 normalize!
      streamObs.cb([
        { type: 'childList', target: thoughtBody, addedNodes: [newZhText], removedNodes: [] },
        { type: 'childList', target: hiddenEngP, addedNodes: [newEngSpan], removedNodes: [] },
        { type: 'childList', target: thinkPanel, addedNodes: [newEngSpan], removedNodes: [] },
      ]);
    }

    await new Promise((r) => setTimeout(r, 280));
    assert.equal(sandbox.window.__agPrism.getState().perf.syncCount, syncCountBeforeThought, 'Thought overlay mutations must trigger 0 root syncs');
    assert.equal(thinkPanel.querySelectorAll('.ag-cs-thought-chunk, .ag-cs-stream-chunk').length, 0, '0 chunk spans allowed inside Thought thought panel');
    assert.equal(thinkPanel._normalizeCalls, 0, '0 normalize() calls allowed on Thought thought panel');
    assert.equal(hiddenEngP._normalizeCalls, 0, '0 normalize() calls allowed on hidden English node inside Thought panel');
    assert.equal(thoughtOverlay._normalizeCalls, 0, '0 normalize() calls allowed on Thought overlay');
    assert.equal(
      thoughtRawToggle._attrMutations + thoughtRawToggle._classMutations,
      rawToggleMutBefore,
      'Thought "原文" toggle button must experience 0 attribute/class mutations (zero flicker!)'
    );
    assert.equal(
      thoughtOverlay._attrMutations + thoughtOverlay._classMutations,
      overlayMutBefore,
      'Thought overlay container must experience 0 attribute/class mutations'
    );

    // Also verify incremental button queue on non-Thought button insertion
    const fullRunsBefore = sandbox.window.__agPrism.getState().perf.iconFullRuns;
    const incRunsBefore = sandbox.window.__agPrism.getState().perf.iconIncrementalRuns;
    const dynamicCopyBtn = makeNode('button', { attrs: { 'aria-label': 'Copy snippet' } });
    dynamicCopyBtn.appendChild(makeNode('svg', { attrs: { width: '15', height: '15' } }));
    convView.appendChild(dynamicCopyBtn);
    rootObs.cb([{ type: 'childList', target: convView, addedNodes: [dynamicCopyBtn], removedNodes: [] }]);
    for (let w = 0; w < 16 && !dynamicCopyBtn.getAttribute('data-ag-cs-icon-injected'); w++) {
      await new Promise((r) => setTimeout(r, 25));
    }
    assert.equal(dynamicCopyBtn.getAttribute('data-ag-cs-icon-injected'), 'copy-check');
    assert.equal(sandbox.window.__agPrism.getState().perf.iconFullRuns, fullRunsBefore, 'Incremental button mutation must NOT run full-page button scan');
    assert.ok(sandbox.window.__agPrism.getState().perf.iconIncrementalRuns > incRunsBefore, 'Expected incremental button hydration run');

    // ── Check ②: Dual lightPreset ('crystal' / 'alabaster') & absorbed module switches sync root attrs + controllers ──
    sandbox.window.__agPrismTelemetry = { sync: (c) => telemetrySyncCalls.push(c.telemetryModule), destroy() {} };
    sandbox.window.__agPrismEffortSlider = { sync: (c) => sliderSyncCalls.push(c.effortSliderModule), destroy() {} };

    const alabasterBtn = appPanel
      .querySelectorAll('#ag-cs-settings-sec button')
      .find((b) => b.getAttribute('data-ag-cs-key') === 'lightPreset' && b.getAttribute('data-ag-cs-val') === '"alabaster"');
    assert.ok(alabasterBtn, 'Expected Warm Alabaster button in settings');
    alabasterBtn.dispatch('click');
    assert.equal(html.getAttribute('data-ag-cs-light-preset'), 'alabaster');

    const crystalBtn = appPanel
      .querySelectorAll('#ag-cs-settings-sec button')
      .find((b) => b.getAttribute('data-ag-cs-key') === 'lightPreset' && b.getAttribute('data-ag-cs-val') === '"crystal"');
    crystalBtn.dispatch('click');
    assert.equal(html.getAttribute('data-ag-cs-light-preset'), 'crystal');

    const teleOffBtn = appPanel
      .querySelectorAll('#ag-cs-settings-sec button')
      .find((b) => b.getAttribute('data-ag-cs-key') === 'telemetryModule' && b.getAttribute('data-ag-cs-val') === '"off"');
    const sliderOnBtn = appPanel
      .querySelectorAll('#ag-cs-settings-sec button')
      .find((b) => b.getAttribute('data-ag-cs-key') === 'effortSliderModule' && b.getAttribute('data-ag-cs-val') === '"on"');
    assert.ok(teleOffBtn && sliderOnBtn, 'Expected absorbed module buttons in settings');
    teleOffBtn.dispatch('click');
    sliderOnBtn.dispatch('click');
    assert.equal(html.getAttribute('data-ag-cs-telemetry'), 'off');
    assert.equal(html.getAttribute('data-ag-cs-effort-slider'), 'on');
    assert.ok(telemetrySyncCalls.includes('off'), 'Expected __agPrismTelemetry.sync called with "off"');
    assert.ok(sliderSyncCalls.includes('on'), 'Expected __agPrismEffortSlider.sync called with "on"');

    vm.runInNewContext(cdp.REMOVE_EXPRESSION, sandbox);
  } finally {
    for (const id of timers) clearTimeout(id);
  }
});

test('v1.0.1 compiler safety fixes, unified shared string pool (< 690 KiB CI budget), warm cache < 35ms, and 6-module microkernel + Omni second channel', async () => {
  // 1. Property keyword `.in / w / 2` division must NOT be mis-tokenized as regex literal
  const propKeywordSrc = `
    function compute(state, width) {
      const half = state.in / width / 2;
      const opt = state?.return / width / 2;
      return half + opt;
    }
  `;
  const minProp = cdp.minifyJs(propKeywordSrc);
  const propFn = vm.runInNewContext(`(${minProp})`, {});
  assert.equal(propFn({ in: 40, return: 20 }, 5), 6);

  // 2. Outer undeclared free variable must NOT be mangled when inner function shadows same name
  const freeVarSrc = `
    function outerRead() {
      const a = externalFreeGlobal.count;
      function innerHelper(externalFreeGlobal) {
        return externalFreeGlobal * 2;
      }
      return a + innerHelper(5);
    }
  `;
  const minFree = cdp.minifyJs(freeVarSrc);
  const freeFn = vm.runInNewContext(`(${minFree})`, { externalFreeGlobal: { count: 7 } });
  assert.equal(freeFn(), 17);

  // 3. Template interpolation `${...}` & spread `...obj` must keep bracket stack balanced so locals mangle cleanly
  const tplSpreadSrc = `
    function buildSummary(baseConfig) {
      const tag = \`v-\${baseConfig.ver}\`;
      const longInternalCounter = 10;
      const mergedConfig = { ...baseConfig, count: longInternalCounter + longInternalCounter };
      return \`\${tag}:\${mergedConfig.count}\`;
    }
  `;
  const minTplSpread = cdp.minifyJs(tplSpreadSrc);
  assert.equal(minTplSpread.includes('longInternalCounter'), false, 'Expected local after template interpolation to be mangled');
  assert.equal(minTplSpread.includes('mergedConfig'), false, 'Expected spread-assigned local to be mangled');
  const tplSpreadFn = vm.runInNewContext(`(${minTplSpread})`, {});
  assert.equal(tplSpreadFn({ ver: '1.0.1' }), 'v-1.0.1:20');

  // 4. Balanced-brace embedded CSS template minification + Unicode `\u{...}` & class string field safety
  const unicodeAndClassSrc = `
    (() => {
      class Bucket {
        'raw-key' = 'keep';
        static 'stat-key' = 42;
      }
      const emoji = '\\u{1F52E}';
      const b = new Bucket();
      return b['raw-key'] + ':' + Bucket['stat-key'] + ':' + emoji.codePointAt(0);
    })()
  `;
  const partOut = cdp.prepareRuntimePart('synthetic-test.js', unicodeAndClassSrc);
  assert.equal(vm.runInNewContext(partOut, {}), 'keep:42:128302');

  // 5. Unified shared pool payload < 690 KiB CI hard ceiling (updated for Settings Uninstall & 5-lang Thought Translator) & warm config rebuild cache hit
  const expr1 = cdp.buildInjectExpression();
  const payloadBytes = Buffer.byteLength(expr1, 'utf8');
  assert.ok(
    payloadBytes < 690 * 1024,
    `Expected unified bundle payload < ${690 * 1024} bytes (690 KiB), got ${payloadBytes}`
  );
  // Omni & Channel 5 Thought modules must never bloat static RUNTIME_PARTS
  for (const part of cdp.RUNTIME_PARTS) {
    assert.equal(part.includes('omni-viewer'), false, `Omni module ${part} must load via second channel, not RUNTIME_PARTS`);
    assert.equal(part.includes('thought-translator'), false, `Thought module ${part} must load via Channel 5, not RUNTIME_PARTS`);
  }
  assert.equal(
    cdp.RUNTIME_PARTS.includes('vendor/thought-translator/thought-client.js'),
    false,
    'vendor/thought-translator/thought-client.js must not appear in cdp.RUNTIME_PARTS'
  );
  assert.equal(
    cdp.RUNTIME_PARTS.includes('vendor/thought-translator/thought-settings-ui.js'),
    false,
    'vendor/thought-translator/thought-settings-ui.js must not appear in cdp.RUNTIME_PARTS'
  );
  const cacheStatsBeforeWarm = cdp.getBundleCacheStats();
  const tWarm0 = performance.now();
  const expr2 = cdp.buildInjectExpression({ palette: 'warm', motionLevel: 'subtle', accentTone: 'iris' });
  const warmElapsed = performance.now() - tWarm0;
  const cacheStatsAfterWarm = cdp.getBundleCacheStats();
  // Deterministic verification that warm config rebuild reuses the compiled template cache
  // without re-running unified compilation, JS mangling, or CSS minification.
  assert.equal(
    cacheStatsAfterWarm.compileUnifiedRuns,
    cacheStatsBeforeWarm.compileUnifiedRuns,
    'Warm config rebuild must reuse compiled unified template cache without recompiling'
  );
  assert.equal(
    cacheStatsAfterWarm.mangledUnitRuns,
    cacheStatsBeforeWarm.mangledUnitRuns,
    'Warm config rebuild must not re-mangle runtime units'
  );
  assert.equal(
    cacheStatsAfterWarm.cssMinifyRuns,
    cacheStatsBeforeWarm.cssMinifyRuns,
    'Warm config rebuild must not re-minify style.css'
  );
  // Relax absolute latency bound from 35ms to 150ms to avoid GC/CPU-steal flakes on shared
  // Windows/macOS CI runners while still catching accidental full-compile regressions (~800ms+).
  assert.ok(warmElapsed < 150, `Expected warm config rebuild < 150ms, got ${warmElapsed.toFixed(2)}ms`);
  assert.ok(expr2.includes('"palette":"warm"'));
  assert.ok(expr2.includes('"accentTone":"iris"'));

  // 6. All 6 extracted/Wave2 microkernel domain modules registered in RUNTIME_PARTS & SYNC_ROOT_FILES
  for (const modName of [
    'home-studio-panel.js',
    'home-ripple-host.js',
    'model-glyph-crystal.js',
    'stream-choreography.js',
    'prism-rim-canvas.js',
    'host-workbench-enhancer.js',
  ]) {
    assert.ok(cdp.RUNTIME_PARTS.includes(modName), `Missing ${modName} in RUNTIME_PARTS`);
    assert.ok(cdp.SYNC_ROOT_FILES.includes(modName), `Missing ${modName} in SYNC_ROOT_FILES`);
  }

  // 7. Lightweight config refresh expression + thought/usage bridge enhancements
  const refreshExpr = cdp.buildConfigRefreshExpression({ palette: 'warm', lightPreset: 'alabaster', accentTone: 'cobalt' });
  assert.ok(Buffer.byteLength(refreshExpr, 'utf8') < 4096);
  assert.ok(refreshExpr.includes('refreshConfig'));

  // 8. CP-1 & CP-2: Target eligibility guard, in-page foreign preview guard, and bidirectional alias reconciliation
  assert.equal(
    cdp.isEligibleTarget({ type: 'page', title: 'Workspace - Antigravity', url: 'https://127.0.0.1:3053/c/123', webSocketDebuggerUrl: 'ws://127.0.0.1:3014/1' }),
    true
  );
  assert.equal(
    cdp.isEligibleTarget({ type: 'page', title: 'AI Rap Video Generator', url: 'http://127.0.0.1:3115/', webSocketDebuggerUrl: 'ws://127.0.0.1:3014/2' }),
    false,
    'Plain HTTP user preview webapp without Antigravity title must be rejected'
  );
  assert.equal(
    cdp.isEligibleTarget({ type: 'page', title: 'Antigravity', url: 'https://evil.example.com/', webSocketDebuggerUrl: 'ws://127.0.0.1:3014/3' }),
    false,
    'External non-loopback origin must always be rejected even with spoofed title'
  );
  assert.equal(
    cdp.isEligibleTarget({
      type: 'page',
      title: 'antigravity-spec.md · Prism Omni',
      url: 'http://127.0.0.1:5169/viewer?token=abc&path=antigravity-spec.md',
      webSocketDebuggerUrl: 'ws://127.0.0.1:3014/4',
    }),
    false,
    'Omni /viewer gateway pages must always be rejected even when filename contains antigravity'
  );
  assert.equal(
    cdp.isEligibleTarget({
      type: 'page',
      title: 'Antigravity Sandbox Preview',
      url: 'http://127.0.0.1:5169/sandbox/abcd1234/index.html',
      webSocketDebuggerUrl: 'ws://127.0.0.1:3014/5',
    }),
    false,
    'Omni /sandbox pages must always be rejected'
  );
  // #304/#310: Swarm "Full View" ("Untitled Conversation - ... - Antigravity") & Untitled/launchpad file tabs MUST remain eligible!
  assert.equal(
    cdp.isEligibleTarget({
      type: 'page',
      title: 'Untitled Conversation - antigravity - Antigravity',
      url: 'https://127.0.0.1:14472/c/11111111-2222-4333-8444-555555555555',
      webSocketDebuggerUrl: 'ws://127.0.0.1:14470/swarm-fullview',
    }),
    true,
    'Swarm Full View ("Untitled Conversation - ... - Antigravity") must never be rejected'
  );
  assert.equal(
    cdp.isEligibleTarget({
      type: 'page',
      title: 'Untitled.md - my-launchpad - Antigravity',
      url: 'https://127.0.0.1:14472/c/123?project=my-launchpad&tab=file__Untitled.md',
      webSocketDebuggerUrl: 'ws://127.0.0.1:14470/file-tab',
    }),
    true,
    'Workbench tabs or project names containing Untitled/launchpad must remain eligible'
  );
  assert.equal(
    cdp.isEligibleTarget({
      type: 'page',
      title: 'Untitled',
      url: 'vscode-file://vscode-app/blank.html',
      webSocketDebuggerUrl: 'ws://127.0.0.1:14470/bare-untitled',
    }),
    false,
    'Bare auxiliary "Untitled" shell page must still be rejected'
  );
  assert.equal(
    cdp.isEligibleTarget({
      type: 'page',
      title: 'Antigravity',
      url: 'vscode-file://vscode-app/out/vs/code/electron-sandbox/launchpad/launchpad.html',
      webSocketDebuggerUrl: 'ws://127.0.0.1:14470/launchpad',
    }),
    false,
    'Legacy launchpad.html target must still be rejected'
  );

  // #306/#310: REMOVE_EXPRESSION restores all 9 offscreen HIDE_PROPS on external Pulse & cleans CSS.highlights
  {
    const removedProps = [];
    const hlMap = new Map([
      ['ag-stream-f0', new Set()],
      ['ag-stream-f4', new Set()],
      ['ag-omni-url', new Set()],
      ['host-custom-hl', new Set()],
    ]);
    const hiddenExtBar = {
      removeAttribute(k) {
        if (k === 'data-ag-prism-hidden') this._unhidden = true;
      },
      style: {
        removeProperty(p) {
          removedProps.push(p);
        },
      },
    };
    const remDoc = {
      documentElement: null,
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: (sel) => (sel === '[data-ag-prism-hidden="1"]' ? [hiddenExtBar] : []),
    };
    const remWin = { __agPulseInlineInstalled: true, document: remDoc };
    vm.runInNewContext(cdp.REMOVE_EXPRESSION, {
      window: remWin,
      document: remDoc,
      globalThis: remWin,
      CSS: { highlights: hlMap },
    });
    assert.equal(hiddenExtBar._unhidden, true);
    assert.equal(remWin.__agPulseInlineInstalled, false, 'REMOVE_EXPRESSION must release __agPulseInlineInstalled guard when __agPulseDispose is absent');
    for (const prop of ['display', 'position', 'left', 'top', 'width', 'height', 'opacity', 'pointer-events', 'visibility', 'overflow']) {
      assert.ok(removedProps.includes(prop), `REMOVE_EXPRESSION must removeProperty('${prop}') on [data-ag-prism-hidden="1"]`);
    }
    assert.equal(hlMap.has('ag-stream-f0'), false);
    assert.equal(hlMap.has('ag-stream-f4'), false);
    assert.equal(hlMap.has('ag-omni-url'), false);
    assert.equal(hlMap.has('host-custom-hl'), true, 'Host non-Prism highlights must remain untouched');
  }

  // #304/#310: PrismDaemon.tick() must NEVER fire REMOVE_EXPRESSION on a live session whose in-page DOM is still a valid workbench
  {
    const { PrismDaemon } = await import('../sidecars/daemon/main.mjs');
    const daemon = new PrismDaemon({ overridePort: 14470, enabledCheck: () => true, silent: true });
    daemon.running = true;
    daemon.isCurrentOwner = () => true;
    daemon.cdp = {
      ...cdp,
      listPages: async () => [], // Simulate transient moment where target dropped out of static listPages
    };
    let removeFired = false;
    let hostDomPresent = true;
    const mockSession = {
      closed: false,
      send: async () => ({}),
      evaluate: async (expr) => {
        if (expr === cdp.REMOVE_EXPRESSION) removeFired = true;
        return {
          ready: true,
          isHostDom: hostDomPresent,
          href: 'https://127.0.0.1:14472/c/child-subagent',
          prismAttr: cdp.PLUGIN_VERSION,
          hasPrism: true,
          hasRepoBridge: true,
          hasThoughtBridge: true,
          hasUsageBridge: true,
          hasOmniBridge: true,
          hasOmniServerMeta: true,
          hasOmni: true,
          omniMode: 'off',
          codeHash: daemon.codeHash || '',
          hasLegacyCss: false,
          needsDashboardSync: false,
        };
      },
      close() {
        this.closed = true;
      },
    };
    daemon.sessions.set('ws://127.0.0.1:14470/live-workbench', {
      wsUrl: 'ws://127.0.0.1:14470/live-workbench',
      pageId: 'live-1',
      url: 'https://127.0.0.1:14472/c/parent',
      title: 'Parent - Antigravity',
      session: mockSession,
      scriptId: '1',
      omniScriptId: null,
    });
    await daemon.tick();
    assert.equal(removeFired, false, 'Daemon must NEVER send REMOVE_EXPRESSION while live in-page workbench DOM is present');
    assert.equal(daemon.sessions.has('ws://127.0.0.1:14470/live-workbench'), true);

    hostDomPresent = false;
    await daemon.tick();
    assert.equal(removeFired, true, 'Once non-host page lacks workbench DOM, daemon cleanly detaches with REMOVE_EXPRESSION');
    assert.equal(daemon.sessions.has('ws://127.0.0.1:14470/live-workbench'), false);
  }
  const reconciledLegacy = cdp.reconcileConfigAliases({ ripple: 'off', homeMode: 'classic', lang: 'en', sidebar: 'off' });
  assert.equal(reconciledLegacy.homeRipple, false);
  assert.equal(reconciledLegacy.homeLayout, 'classic');
  assert.equal(reconciledLegacy.language, 'en');
  assert.equal(reconciledLegacy.sidebarRestyle, false);

  // In-page host identity guard aborts cleanly on foreign user preview pages
  const foreignStyles = [];
  const foreignDoc = {
    title: 'AI Rap Video Generator',
    readyState: 'complete',
    documentElement: { setAttribute() {}, hasAttribute: () => false, removeAttribute() {} },
    head: { appendChild: (el) => foreignStyles.push(el) },
    body: { classList: { contains: () => false } },
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    removeEventListener() {},
  };
  const foreignWin = { location: { href: 'http://127.0.0.1:3115/' }, document: foreignDoc, addEventListener() {} };
  const foreignSandbox = { window: foreignWin, document: foreignDoc, globalThis: foreignWin, setTimeout, clearTimeout };
  const foreignRes = vm.runInNewContext(expr1, foreignSandbox);
  assert.equal(foreignRes.status, 'skipped-non-host');
  assert.equal(foreignStyles.length, 0);
  assert.equal(foreignWin.__agPrism, undefined);

  // 9. 26-key Omni validators & second-channel buildOmniClientExpression lifecycle
  for (const k of Object.keys(cdp.VALIDATORS)) {
    assert.ok(Object.prototype.hasOwnProperty.call(cdp.DEFAULT_CONFIG, k), `Missing default config for ${k}`);
  }
  assert.ok(Object.keys(cdp.VALIDATORS).includes('omniModule') && Object.keys(cdp.VALIDATORS).includes('linkTarget'));
  assert.equal(cdp.validateConfigEntry('omniModule', 'on'), true);
  assert.equal(cdp.validateConfigEntry('omniModule', 'off'), true);
  assert.equal(cdp.validateConfigEntry('omniModule', 'invalid'), false);
  assert.equal(cdp.validateConfigEntry('linkTarget', 'builtin'), true);
  assert.equal(cdp.validateConfigEntry('linkTarget', 'external'), true);
  assert.equal(cdp.validateConfigEntry('linkTarget', 'popup'), false);

  const syntheticOmniClient = `
    (() => {
      let syncCalls = 0;
      let destroyed = false;
      let enabled = false;
      window.__agPrismOmni = {
        version: '1.0.1',
        sync(cfg, meta) {
          syncCalls += 1;
          enabled = !(cfg && cfg.omniModule === 'off');
          if (enabled) destroyed = false;
          this.lastCfg = cfg;
          this.lastMeta = meta;
        },
        destroy() {
          destroyed = true;
          enabled = false;
        },
        stats() {
          return { syncCalls, destroyed, enabled };
        }
      };
    })();
  `;
  const fakeMeta = { baseUrl: 'http://127.0.0.1:45678', port: 45678, token: 'a'.repeat(64), version: '1.0.1' };
  const omniExpr = cdp.buildOmniClientExpression(fakeMeta, syntheticOmniClient);
  const rpcPayloads = [];
  const hostDoc = {
    title: 'Obsidian Prism - Antigravity',
    readyState: 'complete',
    documentElement: { setAttribute() {}, hasAttribute: () => true, removeAttribute() {} },
    body: { classList: { contains: (c) => c === 'monaco-workbench' } },
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  const hostWin = {
    location: { href: 'vscode-file://vscode-app/workbench.html' },
    document: hostDoc,
    __agPrism: { getState: () => ({ cfg: { omniModule: 'on', linkTarget: 'builtin' } }) },
    [cdp.OMNI_BINDING]: (raw) => rpcPayloads.push(JSON.parse(raw)),
  };
  hostWin.window = hostWin;
  const omniSandbox = { window: hostWin, document: hostDoc, location: hostWin.location, globalThis: hostWin, setTimeout, clearTimeout };

  const mountRes = vm.runInNewContext(omniExpr, omniSandbox);
  assert.equal(mountRes.ok, true);
  assert.equal(mountRes.status, 'mounted');
  assert.equal(hostWin.__agPrismOmniServerMeta.port, 45678);
  assert.equal(hostWin.__agPrismOmni.lastMeta.token, 'a'.repeat(64));
  assert.equal(hostWin.__agPrismOmni.stats().syncCalls, 1);
  assert.equal(hostWin.__agPrismOmni.stats().enabled, true);

  // Fast codeHash reuse path only invokes sync() without re-mounting
  const syncRes = vm.runInNewContext(omniExpr, omniSandbox);
  assert.equal(syncRes.status, 'synced');
  assert.equal(hostWin.__agPrismOmni.stats().syncCalls, 2);

  // Bridge RPC roundtrip
  const pendingRpc = hostWin.__agPrismOmniBridge.resolvePath({ rawPath: 'README.md#L5' });
  assert.equal(rpcPayloads.length, 1);
  assert.equal(rpcPayloads[0].action, 'resolvePath');
  hostWin.__agPrismOmniBridge.resolve(rpcPayloads[0].id, { ok: true, exists: true, line: 5 });
  const rpcResult = await pendingRpc;
  assert.equal(rpcResult.ok, true);
  assert.equal(rpcResult.line, 5);

  // Disabling omniModule puts window.__agPrismOmni into dormant state while keeping handle alive for re-enable
  hostWin.__agPrism = { getState: () => ({ cfg: { omniModule: 'off', linkTarget: 'external' } }) };
  const disableRes = vm.runInNewContext(omniExpr, omniSandbox);
  assert.equal(disableRes.status, 'disabled');
  assert.ok(hostWin.__agPrismOmni, 'Dormant handle must remain registered for instant re-entry');
  assert.equal(hostWin.__agPrismOmni.stats().enabled, false);

  // Cold boot with initial omniModule: 'off' still registers dormant handle so pure in-page off -> on wakes without re-injection
  const coldOffWin = {
    location: { href: 'vscode-file://vscode-app/workbench.html' },
    document: hostDoc,
    __agPrism: { getState: () => ({ cfg: { omniModule: 'off', linkTarget: 'builtin' } }) },
  };
  coldOffWin.window = coldOffWin;
  const coldOffSandbox = { window: coldOffWin, document: hostDoc, location: coldOffWin.location, globalThis: coldOffWin, setTimeout, clearTimeout };
  const coldOffRes = vm.runInNewContext(omniExpr, coldOffSandbox);
  assert.equal(coldOffRes.status, 'disabled');
  assert.ok(coldOffWin.__agPrismOmni, 'Cold-off boot must still register __agPrismOmni');
  assert.equal(coldOffWin.__agPrismOmni.stats().enabled, false);
  coldOffWin.__agPrismOmni.sync({ omniModule: 'on', linkTarget: 'builtin' }, coldOffWin.__agPrismOmniServerMeta);
  assert.equal(coldOffWin.window.__agPrismOmni.stats().enabled, true, 'In-page off -> on toggle must wake immediately without re-injection');

  // 10. Compiler cross-token `0.x -> .x` safety, SAFE_ALIAS_GLOBALS destructuring shadow guard, & JSON lockfile PID reader
  const decMin = cdp.minifyJs('const r = a ? 0.5 : 0.25; const tag = "v0.5"; const obj = { v0: 0.75 }; return [r, tag, obj.v0];');
  assert.equal(new Function('a', decMin)(true).join(','), '0.5,v0.5,0.75');
  assert.ok(decMin.includes('.5') && decMin.includes('"v0.5"'), '0.5 should compact to .5 without touching string literals');

  const shadowSrc = `(() => {
    const [Map] = [42];
    const fn = (Error) => [Error, Math.max(1, 3), Math.min(2, 5), Math.abs(-7), Math.floor(1.9)];
    return Map + fn(8)[0] + fn(8)[4];
  })()`;
  const shadowPacked = cdp.prepareRuntimePart('__synthetic-shadow-check.js', shadowSrc);
  assert.equal(vm.runInNewContext(shadowPacked, { Math }), 51, 'Destructured/parameter globals must never collide with SAFE_ALIAS_GLOBALS');

  const tmpPidDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-pid-parse-'));
  try {
    const jsonPidFile = path.join(tmpPidDir, '.daemon.pid');
    fs.writeFileSync(jsonPidFile, JSON.stringify({ pid: 54321, token: 'abc' }), 'utf8');
    assert.equal(cdp.readPidFromLockFile(jsonPidFile), 54321);
    const plainPidFile = path.join(tmpPidDir, '.watch.pid');
    fs.writeFileSync(plainPidFile, '65432\n', 'utf8');
    assert.equal(cdp.readPidFromLockFile(plainPidFile), 65432);
  } finally {
    fs.rmSync(tmpPidDir, { recursive: true, force: true });
  }

  // 11. Native Sidecar process signature verification (Windows/macOS/Linux) & plain-HTTP title-spoof Omni token guard
  assert.equal(cdp.matchesExpectedDaemonSignature('node.exe', 'node watch.js'), true);
  assert.equal(cdp.matchesExpectedDaemonSignature('obsidian-prism-watcher.exe', ''), true);
  assert.equal(
    cdp.matchesExpectedDaemonSignature(
      'Antigravity.exe',
      '"C:\\Programs\\Antigravity\\Antigravity.exe" --import=file:///app/sidecar_sdk/register_loader.js C:\\plugins\\obsidian-prism\\sidecars\\daemon\\main.mjs'
    ),
    true,
    'Host-spawned Antigravity.exe running obsidian-prism/sidecars/daemon/main.mjs must be recognized'
  );
  assert.equal(
    cdp.matchesExpectedDaemonSignature(
      '/Applications/Antigravity.app/Contents/MacOS/Antigravity',
      '/Applications/Antigravity.app/Contents/MacOS/Antigravity --import=file:///sidecar_sdk/register_loader.js /Users/dev/.gemini/config/plugins/obsidian-prism/sidecars/daemon/main.mjs'
    ),
    true,
    'macOS host-spawned Antigravity sidecar daemon must be recognized'
  );
  assert.equal(
    cdp.matchesExpectedDaemonSignature('Antigravity.exe', '"C:\\Programs\\Antigravity\\Antigravity.exe" --remote-debugging-port=3014'),
    false,
    'Main Antigravity GUI process must NEVER be treated as Prism daemon'
  );
  assert.equal(
    cdp.matchesExpectedDaemonSignature(
      'Antigravity.exe',
      '"C:\\Programs\\Antigravity\\Antigravity.exe" --type=renderer --field-trial-handle=1234'
    ),
    false,
    'Electron renderer process must NEVER be treated as Prism daemon'
  );
  assert.equal(
    cdp.matchesExpectedDaemonSignature(
      'Antigravity.exe',
      '"C:\\Programs\\Antigravity\\Antigravity.exe" --import=file:///app/register_loader.js C:\\plugins\\antigravity-pulse\\sidecars\\panel\\main.mjs'
    ),
    false,
    'Sibling plugin sidecar must NEVER be treated as Prism daemon'
  );
  assert.equal(
    cdp.isExpectedDaemonProcess(999991, () => ({
      imageName: 'Antigravity.exe',
      commandLine: 'Antigravity.exe --import=register_loader.js /plugins/obsidian-prism/sidecars/daemon/main.mjs',
    })),
    true
  );
  assert.equal(
    cdp.isExpectedDaemonProcess(999992, () => ({
      imageName: 'Antigravity.exe',
      commandLine: 'Antigravity.exe',
    })),
    false
  );
  assert.equal(
    cdp.matchesExpectedDaemonSignature(
      'Antigravity',
      '"Antigravity.exe" --import=file:///lib/sidecar_sdk/register_loader.js main.mjs',
      { matchedLockPid: true, lockStartedAt: 1794981121743, processStartMs: 1794981119683 }
    ),
    true,
    'Host relative-cwd sidecar matching .daemon.pid startedAt window must be recognized'
  );
  assert.equal(
    cdp.matchesExpectedDaemonSignature(
      'Antigravity',
      '"Antigravity.exe" --import=file:///lib/sidecar_sdk/register_loader.js main.mjs',
      { matchedLockPid: true, lockStartedAt: 1794900000000, processStartMs: 1794981119683 }
    ),
    false,
    'Stale .daemon.pid after reboot/PID reuse must be rejected via processStartMs mismatch'
  );

  // Plain-HTTP wcvBrowser webapp with "Antigravity" in document.title must be rejected by both bundles (0 token leak)
  const spoofAppDoc = {
    title: 'My Antigravity Clone WebApp',
    readyState: 'complete',
    documentElement: { setAttribute() {}, hasAttribute: () => false, removeAttribute() {} },
    head: { appendChild() {} },
    body: { classList: { contains: () => false } },
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    removeEventListener() {},
  };
  const spoofAppWin = { location: { href: 'http://127.0.0.1:5173/dashboard' }, document: spoofAppDoc, addEventListener() {} };
  spoofAppWin.window = spoofAppWin;
  const spoofAppSandbox = { window: spoofAppWin, document: spoofAppDoc, location: spoofAppWin.location, globalThis: spoofAppWin, setTimeout, clearTimeout };
  const spoofMainRes = vm.runInNewContext(expr1, spoofAppSandbox);
  assert.equal(spoofMainRes.status, 'skipped-non-host');
  const spoofOmniRes = vm.runInNewContext(omniExpr, spoofAppSandbox);
  assert.equal(spoofOmniRes.status, 'skipped-non-host');
  assert.equal(spoofAppWin.__agPrismOmniServerMeta, undefined, 'Omni server token must NEVER be injected into non-host wcvBrowser pages');
});

test('Antigravity v2.33.0+ dual-layer CDP opt-in guard: shortcut lossless patch/restore, main-host filter, single-prompt dedup & single-instance-lock safe relaunch', async () => {
  const { execFileSync } = require('node:child_process');
  const { installPlugin, uninstallPlugin } = require('../tools/install-plugin.cjs');
  const { PrismDaemon } = await import('../sidecars/daemon/main.mjs');

  // 1. Target filtering & lossless argument append/strip (preserving inner quotes & existing custom port)
  assert.equal(cdp.isAntigravityShortcutTarget('C:\\Users\\Dev\\AppData\\Local\\Programs\\antigravity\\Antigravity.exe'), true);
  assert.equal(cdp.isAntigravityShortcutTarget('C:\\Tools\\antigravity-tools.exe'), false);
  assert.equal(cdp.isAntigravityShortcutTarget('C:\\Programs\\antigravity\\Uninstall Antigravity.exe'), false);

  assert.deepEqual(cdp.appendCdpFlagToArguments(''), {
    args: '--remote-debugging-port=0',
    changed: true,
  });
  assert.deepEqual(cdp.appendCdpFlagToArguments('--disable-gpu --user-data-dir="C:\\My   Profile"'), {
    args: '--disable-gpu --user-data-dir="C:\\My   Profile" --remote-debugging-port=0',
    changed: true,
  });
  assert.deepEqual(cdp.appendCdpFlagToArguments('--remote-debugging-port=9222'), {
    args: '--remote-debugging-port=9222',
    changed: false,
  });
  assert.deepEqual(
    cdp.stripCdpFlagFromArguments('--disable-gpu --remote-debugging-port=0 --user-data-dir="C:\\My   Profile"'),
    {
      args: '--disable-gpu --user-data-dir="C:\\My   Profile"',
      changed: true,
    }
  );
  assert.deepEqual(cdp.stripCdpFlagFromArguments('--remote-debugging-port=9222'), {
    args: '--remote-debugging-port=9222',
    changed: false,
  });

  // 2. Main host process signature filtering (excludes --type= children, sidecar_sdk daemons, and antigravity-tools)
  const mixedCandidates = [
    {
      pid: 20010,
      imageName: 'Antigravity.exe',
      startMs: 1795046342000,
      exePath: 'C:\\Programs\\antigravity\\Antigravity.exe',
      commandLine: '"C:\\Programs\\antigravity\\Antigravity.exe" --import=file:///lib/sidecar_sdk/register_loader.js main.mjs',
    },
    {
      pid: 20011,
      imageName: 'Antigravity.exe',
      startMs: 1795046341000,
      exePath: 'C:\\Programs\\antigravity\\Antigravity.exe',
      commandLine: '"C:\\Programs\\antigravity\\Antigravity.exe" --type=renderer --lang=zh-CN',
    },
    {
      pid: 20012,
      imageName: 'antigravity-tools.exe',
      startMs: 1795046300000,
      exePath: 'C:\\Tools\\antigravity-tools.exe',
      commandLine: '"C:\\Tools\\antigravity-tools.exe"',
    },
    {
      pid: 111868,
      imageName: 'Antigravity.exe',
      startMs: 1795046338000,
      exePath: 'C:\\Programs\\antigravity\\Antigravity.exe',
      commandLine: '"C:\\Programs\\antigravity\\Antigravity.exe" --updated',
    },
  ];
  const detectedHost = cdp.detectRunningAntigravityHostSync({
    nowMs: 1795046350000,
    probeProcesses: () => mixedCandidates,
  });
  assert.ok(detectedHost);
  assert.equal(detectedHost.pid, 111868);
  assert.equal(detectedHost.hasDebugPortSwitch, false);

  // 3. Single-instance-lock safe relaunch sequence: MUST wait for old host exit before spawning new host
  const events = [];
  let pollCount = 0;
  const seqRes = await cdp.executeHostRelaunchSequence(
    { hostPid: 111868, exePath: '/Applications/Antigravity.app', maxWaitMs: 2000, pollMs: 10, settleMs: 0 },
    {
      sleep: async () => {},
      requestGracefulQuit: async (pid) => {
        events.push(`quit:${pid}`);
      },
      isHostStillRunning: async () => {
        pollCount += 1;
        events.push(`poll:${pollCount}`);
        return pollCount < 4;
      },
      launchWithCdpFlag: async (exe, args) => {
        events.push(`launch:${exe}:${args.join(',')}`);
      },
    }
  );
  assert.equal(seqRes.relaunched, true);
  assert.deepEqual(events, [
    'quit:111868',
    'poll:1',
    'poll:2',
    'poll:3',
    'poll:4',
    'launch:/Applications/Antigravity.app:--remote-debugging-port=0',
  ]);

  const abortEvents = [];
  const abortRes = await cdp.executeHostRelaunchSequence(
    { hostPid: 111868, exePath: 'Antigravity.exe', maxWaitMs: 30, pollMs: 10, settleMs: 0 },
    {
      sleep: async () => new Promise((r) => setTimeout(r, 12)),
      requestGracefulQuit: async () => abortEvents.push('quit'),
      isHostStillRunning: async () => true,
      launchWithCdpFlag: async () => abortEvents.push('launch-should-not-run'),
    }
  );
  assert.equal(abortRes.relaunched, false);
  assert.equal(abortRes.reason, 'host-did-not-exit');
  assert.deepEqual(abortEvents, ['quit']);

  // 4. Sandbox installPlugin (--defer-relaunch-prompt + shortcut patch/restore) & PrismDaemon boot log + single-prompt dedup
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-v233-guard-'));
  try {
    const pluginDir = path.join(tmpRoot, 'plugins', 'obsidian-prism');
    const hostCfgDir = path.join(tmpRoot, 'host-cfg');
    const watcherStateDir = path.join(tmpRoot, 'watcher-state');
    const missingPortFile = path.join(tmpRoot, 'DevToolsActivePort-missing');
    fs.mkdirSync(watcherStateDir, { recursive: true });

    const mockShortcuts = new Map([
      ['Desktop/Antigravity.lnk', { targetPath: 'C:\\Programs\\antigravity\\Antigravity.exe', arguments: '' }],
      ['StartMenu/Antigravity.lnk', { targetPath: 'C:\\Programs\\antigravity\\Antigravity.exe', arguments: '--disable-gpu' }],
      ['StartMenu/Antigravity Tools.lnk', { targetPath: 'C:\\Tools\\antigravity-tools.exe', arguments: '' }],
      ['TaskBar/Antigravity.lnk', { targetPath: 'C:\\Programs\\antigravity\\Antigravity.exe', arguments: '--remote-debugging-port=9222' }],
    ]);
    const shortcutAdapter = () => ({
      entries: Array.from(mockShortcuts.entries()).map(([lnkPath, v]) => ({
        lnkPath,
        targetPath: v.targetPath,
        arguments: v.arguments,
      })),
      applyUpdates(updates) {
        const applied = [];
        for (const u of updates) {
          const item = mockShortcuts.get(u.lnkPath);
          if (item) {
            item.arguments = u.arguments;
            applied.push(u.lnkPath);
          }
        }
        return { applied, skipped: [] };
      },
    });

    const hostStartMs = Date.now() - 20000;
    const installRes = await installPlugin({
      targetDir: pluginDir,
      hostConfigDir: hostCfgDir,
      startDaemon: false,
      platformOverride: 'win32',
      portFile: missingPortFile,
      shortcutAdapter,
      stateExtraDirs: [watcherStateDir],
      hostProbe: () => [
        {
          pid: 334455,
          imageName: 'Antigravity.exe',
          startMs: hostStartMs,
          exePath: 'C:\\Programs\\antigravity\\Antigravity.exe',
          commandLine: '"C:\\Programs\\antigravity\\Antigravity.exe" --updated',
        },
      ],
    });
    assert.equal(installRes.ok, true);
    assert.equal(installRes.shortcuts.patched.length, 2);
    assert.equal(mockShortcuts.get('Desktop/Antigravity.lnk').arguments, '--remote-debugging-port=0');
    assert.equal(mockShortcuts.get('StartMenu/Antigravity.lnk').arguments, '--disable-gpu --remote-debugging-port=0');
    assert.equal(mockShortcuts.get('StartMenu/Antigravity Tools.lnk').arguments, '', 'Third-party Antigravity Tools.lnk must NOT be touched');
    assert.equal(mockShortcuts.get('TaskBar/Antigravity.lnk').arguments, '--remote-debugging-port=9222', 'Custom debug port must be preserved');
    assert.deepEqual(installRes.deferredRelaunchHost, { pid: 334455, startMs: hostStartMs });

    // Real Windows COM .lnk round-trip verification with >=2 dirs & >=2 .lnk files inside isolated temp folder
    if (process.platform === 'win32') {
      const lnkDirA = path.join(tmpRoot, 'real-shortcuts-desktop');
      const lnkDirB = path.join(tmpRoot, 'real-shortcuts-programs');
      const subDirB = path.join(lnkDirB, 'Antigravity');
      fs.mkdirSync(lnkDirA, { recursive: true });
      fs.mkdirSync(subDirB, { recursive: true });
      const realAgyLnk1 = path.join(lnkDirA, 'Antigravity.lnk');
      const realAgyLnk2 = path.join(subDirB, 'Antigravity.lnk');
      const realToolsLnk = path.join(lnkDirB, 'Antigravity Tools.lnk');
      const createLnkPs = [
        '$ProgressPreference = "SilentlyContinue"',
        '$ws = New-Object -ComObject WScript.Shell',
        '$s1 = $ws.CreateShortcut($env:TEST_AGY_LNK1); $s1.TargetPath = "C:\\Windows\\System32\\Antigravity.exe"; $s1.Arguments = ""; $s1.Save()',
        '$s2 = $ws.CreateShortcut($env:TEST_AGY_LNK2); $s2.TargetPath = "C:\\Windows\\System32\\Antigravity.exe"; $s2.Arguments = "--foo"; $s2.Save()',
        '$s3 = $ws.CreateShortcut($env:TEST_TOOLS_LNK); $s3.TargetPath = "C:\\Windows\\System32\\antigravity-tools.exe"; $s3.Arguments = ""; $s3.Save()',
      ].join('\n');
      execFileSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(createLnkPs, 'utf16le').toString('base64')],
        {
          env: { ...process.env, TEST_AGY_LNK1: realAgyLnk1, TEST_AGY_LNK2: realAgyLnk2, TEST_TOOLS_LNK: realToolsLnk },
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'ignore'],
        }
      );
      const realEnsure = cdp.ensureAntigravityShortcutsCdpFlag({ pluginDir, searchDirs: [lnkDirA, lnkDirB] });
      assert.equal(realEnsure.patched.length, 2);
      assert.equal(realEnsure.skipped.length, 0);
      const readPatchedPs =
        '$ProgressPreference = "SilentlyContinue"; $ws = New-Object -ComObject WScript.Shell; Write-Output ($ws.CreateShortcut($env:TEST_AGY_LNK1).Arguments + "|" + $ws.CreateShortcut($env:TEST_AGY_LNK2).Arguments + "|" + $ws.CreateShortcut($env:TEST_TOOLS_LNK).Arguments)';
      const patchedState = execFileSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(readPatchedPs, 'utf16le').toString('base64')],
        {
          env: { ...process.env, TEST_AGY_LNK1: realAgyLnk1, TEST_AGY_LNK2: realAgyLnk2, TEST_TOOLS_LNK: realToolsLnk },
          encoding: 'utf8',
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'ignore'],
        }
      ).trim();
      assert.equal(patchedState, '--remote-debugging-port=0|--foo --remote-debugging-port=0|');
      const realRestore = cdp.restoreAntigravityShortcutsCdpFlag({ pluginDir, searchDirs: [lnkDirA, lnkDirB] });
      assert.equal(realRestore.restored.length, 2);
      const readBack = execFileSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(readPatchedPs, 'utf16le').toString('base64')],
        {
          env: { ...process.env, TEST_AGY_LNK1: realAgyLnk1, TEST_AGY_LNK2: realAgyLnk2, TEST_TOOLS_LNK: realToolsLnk },
          encoding: 'utf8',
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'ignore'],
        }
      ).trim();
      assert.equal(readBack, '|--foo|');
    }

    // PrismDaemon boot heartbeat log + deferred PID skip + single-prompt dedup + relaunch spawn on fresh host PID
    let activeMockHost = {
      pid: 334455,
      startMs: hostStartMs + 2500, // 2.5s clock jitter tolerance between installer & daemon/watcher
      exePath: 'C:\\Programs\\antigravity\\Antigravity.exe',
      hasDebugPortSwitch: false,
    };
    let promptCalls = 0;
    let promptDecision = false;
    const spawnedTasks = [];

    const daemon = new PrismDaemon({
      rootDir: pluginDir,
      portFile: missingPortFile,
      pollIntervalMs: 200,
      noPortRelaunchThresholdMs: 60,
      relaunchHooks: {
        stateExtraDirs: [watcherStateDir],
        syncShortcuts: () => ({ supported: true, patched: [] }),
        detectHost: async () => activeMockHost,
        promptUser: async () => {
          promptCalls += 1;
          return promptDecision;
        },
        spawnRelaunch: async (task) => {
          spawnedTasks.push(task);
          return { spawned: true, method: 'mock-breakaway' };
        },
      },
    });

    daemon.start({ claimPid: false, watchFiles: false });
    try {
      await new Promise((r) => setTimeout(r, 160));
      await daemon.tick();
      const logContent = fs.readFileSync(path.join(pluginDir, 'daemon.log'), 'utf8');
      assert.match(logContent, /\[boot\] PrismDaemon started \(pid=\d+, activePort=none,/);
      assert.equal(promptCalls, 0, 'Host pre-recorded by --defer-relaunch-prompt must NOT trigger a prompt');

      // Simulate client auto-update spawning a new bare host PID 445566; user clicks "Later" -> prompts ONCE only
      activeMockHost = {
        pid: 445566,
        startMs: Date.now() - 15000,
        exePath: 'C:\\Programs\\antigravity\\Antigravity.exe',
        hasDebugPortSwitch: false,
      };
      promptDecision = false;
      await daemon.tick();
      await daemon.tick();
      await daemon.tick();
      assert.equal(promptCalls, 1, 'Same bare host PID must prompt at most once even across repeated ticks');
      assert.equal(spawnedTasks.length, 0);

      // Simulate another bare launch PID 556677 where user confirms "Yes" -> spawns detached relaunch helper once
      activeMockHost = {
        pid: 556677,
        startMs: Date.now() - 15000,
        exePath: 'C:\\Programs\\antigravity\\Antigravity.exe',
        hasDebugPortSwitch: false,
      };
      promptDecision = true;
      await daemon.tick();
      await daemon.tick();
      assert.equal(promptCalls, 2);
      assert.equal(spawnedTasks.length, 1);
      assert.equal(spawnedTasks[0].hostPid, 556677);
    } finally {
      await daemon.stop(false);
    }

    // Uninstall restores patched shortcuts cleanly while preserving user flags
    const uninstRes = await uninstallPlugin({
      targetDir: pluginDir,
      hostConfigDir: hostCfgDir,
      noCdp: true,
      platformOverride: 'win32',
      shortcutAdapter,
    });
    assert.equal(uninstRes.ok, true);
    assert.equal(uninstRes.shortcuts.restored.length, 2);
    assert.equal(mockShortcuts.get('Desktop/Antigravity.lnk').arguments, '');
    assert.equal(mockShortcuts.get('StartMenu/Antigravity.lnk').arguments, '--disable-gpu');
    assert.equal(mockShortcuts.get('TaskBar/Antigravity.lnk').arguments, '--remote-debugging-port=9222');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

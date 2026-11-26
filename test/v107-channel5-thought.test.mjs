import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

import { PrismDaemon, THOUGHT_BINDING } from '../sidecars/daemon/main.mjs';

const require = createRequire(import.meta.url);
const ROOT_DIR = path.resolve(import.meta.dirname, '..');
const cdp = require(path.join(ROOT_DIR, 'cdp.js'));
const installPluginTool = require(path.join(ROOT_DIR, 'tools', 'install-plugin.cjs'));

function createSimulatedDomSandbox(opts = {}) {
  let doc = null;
  let html = null;
  function makeNode(tag, nodeOpts = {}) {
    const attrs = new Map(Object.entries(nodeOpts.attrs || {}));
    const listeners = new Map();
    const children = [];
    const classes = new Set((nodeOpts.className || '').split(/\s+/).filter(Boolean));
    let hiddenVal = Boolean(nodeOpts.hidden);
    const node = {
      tagName: tag.toUpperCase(),
      nodeType: 1,
      id: nodeOpts.id || '',
      value: nodeOpts.value ?? '',
      type: nodeOpts.type || '',
      disabled: false,
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
        toggle: (c, force) => {
          const on = force === undefined ? !classes.has(c) : Boolean(force);
          if (on) classes.add(c);
          else classes.delete(c);
          return on;
        },
      },
      get className() { return Array.from(classes).join(' '); },
      set className(v) {
        classes.clear();
        String(v || '').split(/\s+/).filter(Boolean).forEach((c) => classes.add(c));
      },
      get hidden() { return hiddenVal; },
      set hidden(v) { hiddenVal = Boolean(v); },
      children,
      get childNodes() { return children; },
      parentElement: null,
      parentNode: null,
      get isConnected() {
        return this === html || Boolean(this.parentElement && this.parentElement.isConnected);
      },
      _text: nodeOpts.text || '',
      get textContent() {
        return children.length ? children.map((c) => c.textContent).join('') : this._text;
      },
      set textContent(v) {
        children.length = 0;
        this._text = String(v ?? '');
      },
      set innerHTML(htmlStr) {
        children.length = 0;
        this._html = String(htmlStr ?? '');
      },
      get innerHTML() { return this._html || ''; },
      get childElementCount() { return children.length; },
      get firstChild() { return children[0] || null; },
      get lastElementChild() { return children[children.length - 1] || null; },
      get nextSibling() {
        if (!this.parentElement) return null;
        const idx = this.parentElement.children.indexOf(this);
        return idx >= 0 ? this.parentElement.children[idx + 1] || null : null;
      },
      get nextElementSibling() { return this.nextSibling; },
      clientWidth: nodeOpts.clientWidth ?? 900,
      clientHeight: nodeOpts.clientHeight ?? 700,
      scrollTop: 0,
      scrollHeight: 200,
      width: 0,
      height: 0,
      appendChild(ch) {
        if (!ch) return ch;
        if (ch.parentElement) ch.parentElement.removeChild(ch);
        ch.parentElement = this;
        ch.parentNode = this;
        ch.ownerDocument = doc;
        children.push(ch);
        return ch;
      },
      insertBefore(ch, ref) {
        if (!ch) return ch;
        if (ch.parentElement) ch.parentElement.removeChild(ch);
        ch.parentElement = this;
        ch.parentNode = this;
        ch.ownerDocument = doc;
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
        if (on) attrs.set(k, '');
        else attrs.delete(k);
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
        for (const fn of [...list]) fn({ type: ev, target: this, stopPropagation() {}, preventDefault() {}, ...payload });
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

  html = makeNode('html');
  const head = makeNode('head');
  const body = makeNode('body', { className: opts.bodyClassName ?? 'theme-dark monaco-workbench' });
  html.appendChild(head);
  html.appendChild(body);

  if (opts.withHostMarkers !== false) {
    const home = makeNode('div', { className: 'agy-home' });
    const dialog = makeNode('div', { attrs: { role: 'dialog' } });
    const appearancePanel = makeNode('div', { className: 'p-6 flex flex-col gap-4' });
    appearancePanel.appendChild(makeNode('h2', { text: '外观' }));
    const appearanceWrap = makeNode('div', { className: 'flex flex-col gap-8' });
    appearanceWrap.appendChild(makeNode('div', { className: 'space-y-2' }));
    appearancePanel.appendChild(appearanceWrap);
    dialog.appendChild(appearancePanel);
    body.appendChild(home);
    body.appendChild(dialog);
  }

  const docListeners = new Map();
  doc = {
    readyState: opts.readyState || 'complete',
    title: opts.title ?? 'Obsidian Prism - Antigravity',
    documentElement: html,
    head,
    body,
    hidden: false,
    createElement: (t) => makeNode(t),
    createTextNode: (t) => ({ nodeType: 3, textContent: String(t ?? ''), nodeValue: String(t ?? ''), remove() {} }),
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
    dispatch(ev, payload = {}) {
      for (const fn of [...(docListeners.get(ev) || [])]) fn({ type: ev, ...payload });
    },
  };

  const timers = new Set();
  const winListeners = new Map();
  const storageMap = Object.create(null);
  const sandbox = {
    window: null,
    globalThis: null,
    self: null,
    top: null,
    document: doc,
    navigator: { language: 'zh-CN' },
    location: { href: opts.href ?? 'vscode-file://vscode-app/workbench.html', pathname: opts.pathname ?? '/workbench.html' },
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
    localStorage: {
      getItem(k) { return Object.prototype.hasOwnProperty.call(storageMap, k) ? storageMap[k] : null; },
      setItem(k, v) { storageMap[k] = String(v); },
      removeItem(k) { delete storageMap[k]; },
    },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    matchMedia: () => ({ matches: false }),
    MutationObserver: class { observe() {} disconnect() {} },
    ResizeObserver: class { observe() {} disconnect() {} },
    IntersectionObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame: (fn) => { const id = setTimeout(() => fn(Date.now()), 4); timers.add(id); return id; },
    cancelAnimationFrame: (id) => { timers.delete(id); clearTimeout(id); },
    setTimeout: (fn, ms) => { const id = setTimeout(fn, ms); timers.add(id); return id; },
    clearTimeout: (id) => { timers.delete(id); clearTimeout(id); },
    setInterval: () => 1,
    clearInterval: () => {},
    performance: { now: () => Date.now() },
    URL,
    Math, Date, JSON, Map, Set, WeakMap, WeakSet, Array, Object, String, Number, Boolean, Promise, Uint8Array, Float32Array, Intl, RegExp, Error,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  sandbox.top = opts.subframe ? {} : sandbox;
  if (typeof opts.onSettingBinding === 'function') {
    sandbox[cdp.SETTING_BINDING] = opts.onSettingBinding;
  }

  return {
    sandbox,
    html,
    head,
    body,
    doc,
    cleanup() {
      for (const id of timers) clearTimeout(id);
      timers.clear();
    },
  };
}

test('Channel 5 (1/5): Channel 1 isolation & byte budget ceiling (< 685,000 B) and RUNTIME_PARTS exclusion', () => {
  const mainExpr = cdp.buildInjectExpression(cdp.DEFAULT_CONFIG);
  const bytes = Buffer.byteLength(mainExpr, 'utf8');
  assert.ok(bytes < 685000, `Expected default Channel 1 payload < 685,000 B, got ${bytes} B`);
  assert.equal(mainExpr.includes('__agPrismThought='), false, 'Channel 1 must NOT define __agPrismThought');
  assert.equal(mainExpr.includes('__agPrismThoughtSettingsUi='), false, 'Channel 1 must NOT define __agPrismThoughtSettingsUi');
  assert.equal(
    cdp.RUNTIME_PARTS.includes('vendor/thought-translator/thought-client.js'),
    false,
    'thought-client.js must not appear in cdp.RUNTIME_PARTS'
  );
  assert.equal(
    cdp.RUNTIME_PARTS.includes('vendor/thought-translator/thought-settings-ui.js'),
    false,
    'thought-settings-ui.js must not appear in cdp.RUNTIME_PARTS'
  );
});

test('Channel 5 (2/5): shouldEnableThought gating & Fail-Closed 0 B in off mode vs compilable expression in enabled modes', () => {
  for (const offMode of ['off', '', 'false', '0', 'none']) {
    const cfg = { ...cdp.DEFAULT_CONFIG, thoughtTranslate: offMode };
    assert.equal(cdp.shouldEnableThought(cfg), false, `Expected shouldEnableThought=false for "${offMode}"`);
    assert.equal(cdp.buildThoughtExpression(cfg), '', `Expected 0 B fail-closed expression for "${offMode}"`);
  }

  for (const onMode of ['ai', 'machine', 'on', 'auto']) {
    const cfg = { ...cdp.DEFAULT_CONFIG, thoughtTranslate: onMode };
    assert.equal(cdp.shouldEnableThought(cfg), true, `Expected shouldEnableThought=true for "${onMode}"`);
    const expr = cdp.buildThoughtExpression(cfg);
    assert.ok(Buffer.byteLength(expr, 'utf8') > 0, `Expected non-empty Channel 5 expression for "${onMode}"`);
    assert.doesNotThrow(() => new Function(expr), `Channel 5 expression for "${onMode}" must compile cleanly`);
  }
});

test('Channel 5 (3/5): security boundary guards reject subframe, devtools, external origins, launchpad, /viewer/, and liveCfg off', () => {
  const expr = cdp.buildThoughtExpression({ ...cdp.DEFAULT_CONFIG, thoughtTranslate: 'ai' });

  // 1. Subframe
  {
    const env = createSimulatedDomSandbox({ subframe: true });
    try {
      const res = vm.runInNewContext(expr, env.sandbox);
      assert.equal(res.ok, false);
      assert.equal(res.status, 'skipped-subframe');
      assert.equal(env.sandbox.window.__agPrismThought, undefined);
      assert.equal(env.sandbox.window.__agPrismThoughtSettingsUi, undefined);
    } finally {
      env.cleanup();
    }
  }

  // 2. Non-host targets: devtools://, external https://example.com, launchpad, /viewer/
  const nonHostCases = [
    { label: 'devtools://', href: 'devtools://devtools/bundled/inspector.html', withHostMarkers: false, bodyClassName: '' },
    { label: 'external https', href: 'https://example.com/', withHostMarkers: false, bodyClassName: '' },
    { label: 'launchpad url', href: 'vscode-file://vscode-app/launchpad.html', title: 'Launchpad', withHostMarkers: false, bodyClassName: '' },
    { label: 'launchpad title', href: 'vscode-file://vscode-app/index.html', title: 'Launchpad', withHostMarkers: false, bodyClassName: '' },
    { label: '/viewer/', href: 'http://127.0.0.1:3053/viewer/conv-1', withHostMarkers: false, bodyClassName: '' },
  ];
  for (const tc of nonHostCases) {
    const env = createSimulatedDomSandbox(tc);
    try {
      const res = vm.runInNewContext(expr, env.sandbox);
      assert.equal(res.ok, false, `Expected ok=false for ${tc.label}`);
      assert.equal(res.status, 'skipped-non-host', `Expected skipped-non-host for ${tc.label}`);
      assert.equal(env.sandbox.window.__agPrismThought, undefined);
      assert.equal(env.sandbox.window.__agPrismThoughtSettingsUi, undefined);
    } finally {
      env.cleanup();
    }
  }

  // 3. liveCfg.thoughtTranslate === 'off' overrides stale Channel 5 script
  {
    const env = createSimulatedDomSandbox();
    try {
      const mainRes = vm.runInNewContext(cdp.buildInjectExpression(cdp.DEFAULT_CONFIG), env.sandbox);
      assert.equal(mainRes.status, 'ok');
      assert.equal(env.sandbox.window.__agPrism.getState().cfg.thoughtTranslate, 'off');

      const res = vm.runInNewContext(expr, env.sandbox);
      assert.equal(res.ok, true);
      assert.equal(res.status, 'off');
      assert.equal(res.skippedByLiveCfg, true);
      assert.equal(env.sandbox.window.__agPrismThought, undefined);
      assert.equal(env.sandbox.window.__agPrismThoughtSettingsUi, undefined);
    } finally {
      env.cleanup();
    }
  }
});

test('Channel 5 (4/5): zero-reload hot-plug lifecycle on already-open settings panel, machine toggle, THOUGHT_REMOVE_EXPRESSION, remount, and REMOVE_EXPRESSION cleanup', () => {
  const env = createSimulatedDomSandbox();
  try {
    // 1. Mount Channel 1 in default off mode, load Channel 9 Settings on demand, and open settings fold panel
    const mainRes = vm.runInNewContext(cdp.buildInjectExpression(cdp.DEFAULT_CONFIG), env.sandbox);
    assert.equal(mainRes.status, 'ok');
    const settingsChRes = vm.runInNewContext(cdp.buildSettingsChannelExpression(), env.sandbox);
    assert.equal(settingsChRes.ok, true);
    const settingsSec = env.doc.getElementById('ag-cs-settings-sec');
    assert.ok(settingsSec, 'Expected settings section mounted');
    const foldHead = settingsSec.querySelector('.ag-cs-settings-fold-head');
    assert.ok(foldHead, 'Expected fold header');
    foldHead.dispatch('click');
    assert.equal(settingsSec.getAttribute('data-body-built'), '1', 'Settings panel must be expanded with data-body-built="1"');
    assert.equal(settingsSec.querySelector('[data-testid="prism-thought-ai-config"]'), null, 'off mode must have no config box');

    // 2. Switch config to ai & run Channel 5 -> hot-mounts into open settingsSec with hidden=false
    env.sandbox.window.__agPrism.refreshConfig({ ...cdp.DEFAULT_CONFIG, thoughtTranslate: 'ai' });
    const aiExpr = cdp.buildThoughtExpression({ ...cdp.DEFAULT_CONFIG, thoughtTranslate: 'ai' });
    const mount1 = vm.runInNewContext(aiExpr, env.sandbox);
    assert.equal(mount1.ok, true);
    assert.equal(mount1.status, 'mounted');
    assert.ok(env.sandbox.window.__agPrismThought);
    assert.ok(env.sandbox.window.__agPrismThoughtSettingsUi);
    let cfgBox = settingsSec.querySelector('[data-testid="prism-thought-ai-config"]');
    assert.ok(cfgBox, 'Channel 5 must hot-mount config box into already-open settings panel');
    assert.equal(cfgBox.hidden, false, 'Config box must be visible in ai mode');

    // 3. Second execution hits reused: true
    const reuseRes = vm.runInNewContext(aiExpr, env.sandbox);
    assert.equal(reuseRes.ok, true);
    assert.equal(reuseRes.reused, true);
    assert.equal(reuseRes.codeHash, mount1.codeHash);

    // 4. Switch to machine mode -> config box hides (hidden === true)
    env.sandbox.window.__agPrism.refreshConfig({ ...cdp.DEFAULT_CONFIG, thoughtTranslate: 'machine' });
    const machineExpr = cdp.buildThoughtExpression({ ...cdp.DEFAULT_CONFIG, thoughtTranslate: 'machine' });
    const machineRes = vm.runInNewContext(machineExpr, env.sandbox);
    assert.equal(machineRes.ok, true);
    cfgBox = settingsSec.querySelector('[data-testid="prism-thought-ai-config"]');
    assert.ok(cfgBox);
    assert.equal(cfgBox.hidden, true, 'Config box must be hidden when mode is machine');

    // 5. THOUGHT_REMOVE_EXPRESSION cleans globals & config box DOM cleanly
    const thRem = vm.runInNewContext(cdp.THOUGHT_REMOVE_EXPRESSION, env.sandbox);
    assert.equal(thRem.ok, true);
    assert.equal(thRem.status, 'off');
    assert.equal(env.sandbox.window.__agPrismThought, undefined);
    assert.equal(env.sandbox.globalThis.__agPrismThought, undefined);
    assert.equal(env.sandbox.window.__agPrismThoughtSettingsUi, undefined);
    assert.equal(env.sandbox.globalThis.__agPrismThoughtSettingsUi, undefined);
    assert.equal(settingsSec.querySelector('[data-testid="prism-thought-ai-config"]'), null);

    // 6. Switch back to ai & re-execute Channel 5 -> seamlessly remounts
    env.sandbox.window.__agPrism.refreshConfig({ ...cdp.DEFAULT_CONFIG, thoughtTranslate: 'ai' });
    const remountRes = vm.runInNewContext(aiExpr, env.sandbox);
    assert.equal(remountRes.ok, true);
    assert.equal(remountRes.status, 'mounted');
    const remountedBox = settingsSec.querySelector('[data-testid="prism-thought-ai-config"]');
    assert.ok(remountedBox, 'Channel 5 must remount config box after THOUGHT_REMOVE_EXPRESSION');
    assert.equal(remountedBox.hidden, false);

    // 7. Full REMOVE_EXPRESSION removes globals & config box DOM cleanly
    const fullRem = vm.runInNewContext(cdp.REMOVE_EXPRESSION, env.sandbox);
    assert.ok(fullRem.removed >= 1);
    assert.equal(env.sandbox.window.__agPrismThought, undefined);
    assert.equal(env.sandbox.globalThis.__agPrismThought, undefined);
    assert.equal(env.sandbox.window.__agPrismThoughtSettingsUi, undefined);
    assert.equal(env.sandbox.globalThis.__agPrismThoughtSettingsUi, undefined);
    assert.equal(env.doc.querySelector('[data-testid="prism-thought-ai-config"]'), null);
  } finally {
    env.cleanup();
  }
});

test('Channel 5 (5/5): PrismDaemon Channel 5 lifecycle (off skip, off->ai hot-inject, _verifyAndHealEntryUnlocked self-heal, ai->off cleanup, detachAll zero orphans)', async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-prism-ch5-daemon-'));
  const targetPluginDir = path.join(workDir, 'obsidian-prism');
  await installPluginTool.installPlugin({
    targetDir: targetPluginDir,
    noCdp: true,
    skipHostConfig: true,
    startDaemon: false,
  });

  const sockets = new Set();
  const pageConns = new Map();
  let scriptSeq = 0;
  const activeScripts = new Map();
  const addScriptCalls = [];
  const removeScriptCalls = [];
  const addBindingCalls = [];

  function sendWs(socket, obj) {
    if (socket.destroyed) return;
    const payload = Buffer.from(JSON.stringify(obj), 'utf8');
    let header;
    if (payload.length < 126) {
      header = Buffer.from([0x81, payload.length]);
    } else if (payload.length < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = 126;
      header.writeUInt16BE(payload.length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x81;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(payload.length), 2);
    }
    socket.write(Buffer.concat([header, payload]));
  }

  const pageEnv = createSimulatedDomSandbox({
    onSettingBinding(payload) {
      const sock = pageConns.get('page-main');
      if (sock) {
        sendWs(sock, {
          method: 'Runtime.bindingCalled',
          params: { name: cdp.SETTING_BINDING, payload: String(payload), executionContextId: 1 },
        });
      }
    },
  });
  const vmCtx = vm.createContext(pageEnv.sandbox);
  const topFrameId = 'TOP_MAIN_FRAME_CH5';

  const server = http.createServer((req, res) => {
    if (req.url === '/json/list' || req.url === '/json') {
      const addr = server.address();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify([
          {
            id: 'page-main',
            type: 'page',
            title: 'Obsidian Prism - Antigravity',
            url: 'vscode-file://vscode-app/workbench.html',
            webSocketDebuggerUrl: `ws://127.0.0.1:${addr.port}/devtools/page/page-main`,
          },
        ])
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });

  server.on('upgrade', (req, socket) => {
    sockets.add(socket);
    socket.on('close', () => {
      sockets.delete(socket);
      if (pageConns.get('page-main') === socket) pageConns.delete('page-main');
    });
    const accept = crypto
      .createHash('sha1')
      .update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' +
        accept +
        '\r\n\r\n'
    );
    pageConns.set('page-main', socket);

    let buf = Buffer.alloc(0);
    let frags = [];
    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= 2) {
        const fin = (buf[0] & 0x80) !== 0;
        const opcode = buf[0] & 0x0f;
        const masked = (buf[1] & 0x80) !== 0;
        let len = buf[1] & 0x7f;
        let off = 2;
        if (len === 126) {
          if (buf.length < 4) return;
          len = buf.readUInt16BE(2);
          off = 4;
        } else if (len === 127) {
          if (buf.length < 10) return;
          len = Number(buf.readBigUInt64BE(2));
          off = 10;
        }
        const mLen = masked ? 4 : 0;
        if (buf.length < off + mLen + len) return;
        const data = Buffer.from(buf.subarray(off + mLen, off + mLen + len));
        if (masked) {
          const mask = buf.subarray(off, off + 4);
          for (let i = 0; i < len; i++) data[i] ^= mask[i & 3];
        }
        buf = buf.subarray(off + mLen + len);
        if (opcode === 0x8) {
          socket.end();
          return;
        }
        if (opcode !== 0x1 && opcode !== 0x0) continue;
        frags.push(data);
        if (!fin) continue;
        let msg;
        try {
          msg = JSON.parse(Buffer.concat(frags).toString('utf8'));
          frags = [];
        } catch {
          frags = [];
          continue;
        }

        if (msg.method === 'Page.getFrameTree') {
          sendWs(socket, { id: msg.id, result: { frameTree: { frame: { id: topFrameId } } } });
        } else if (msg.method === 'Runtime.enable') {
          sendWs(socket, { id: msg.id, result: {} });
          sendWs(socket, {
            method: 'Runtime.executionContextCreated',
            params: { context: { id: 1, auxData: { frameId: topFrameId, isDefault: true, type: 'default' } } },
          });
        } else if (msg.method === 'Runtime.addBinding') {
          addBindingCalls.push(msg.params?.name || '');
          sendWs(socket, { id: msg.id, result: {} });
        } else if (msg.method === 'Page.addScriptToEvaluateOnNewDocument') {
          const id = `sc-${++scriptSeq}`;
          const source = msg.params?.source || '';
          activeScripts.set(id, source);
          addScriptCalls.push({ id, source });
          sendWs(socket, { id: msg.id, result: { identifier: id } });
        } else if (msg.method === 'Page.removeScriptToEvaluateOnNewDocument') {
          const rmId = msg.params?.identifier;
          activeScripts.delete(rmId);
          removeScriptCalls.push(rmId);
          sendWs(socket, { id: msg.id, result: {} });
        } else if (msg.method === 'Runtime.evaluate') {
          let val = null;
          try {
            val = vm.runInContext(msg.params.expression, vmCtx);
          } catch {}
          let safeVal;
          try {
            safeVal = val === undefined ? undefined : JSON.parse(JSON.stringify(val));
          } catch {
            safeVal = { ok: Boolean(val?.ok) };
          }
          sendWs(socket, {
            id: msg.id,
            result: { result: safeVal === undefined ? { type: 'undefined' } : { type: 'object', value: safeVal } },
          });
        } else {
          sendWs(socket, { id: msg.id, result: {} });
        }
      }
    });
  });

  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  const waitBroadcastDrain = async (daemonInst) => {
    for (let w = 0; w < 60; w++) {
      await new Promise((r) => setTimeout(r, 20));
      if (!daemonInst._broadcastRunning && !daemonInst._broadcastPending) break;
    }
    await new Promise((r) => setTimeout(r, 30));
  };

  let daemon = null;
  try {
    daemon = new PrismDaemon({
      rootDir: targetPluginDir,
      overridePort: port,
      pollIntervalMs: 1000,
      silent: true,
    });
    daemon.claimOwnership();
    daemon.running = true;

    // 1. Default off mode: never compiles or registers thoughtScriptId
    const tickRes = await daemon.tick();
    assert.equal(tickRes.attached, 1);
    const entry = [...daemon.sessions.values()][0];
    assert.ok(entry, 'Expected attached session entry');
    assert.equal(daemon.thoughtExpr, '', 'off mode must not compile thoughtExpr');
    assert.equal(entry.thoughtScriptId, null, 'off mode must not register thoughtScriptId');
    assert.equal(entry.thoughtMounted, false);
    assert.equal(
      addScriptCalls.some((c) => c.source.includes('__agPrismThoughtSettingsUi=')),
      false,
      'off mode must not register Channel 5 script'
    );
    assert.equal(pageEnv.sandbox.window.__agPrismThought, undefined);
    assert.equal(pageEnv.sandbox.window.__agPrismThoughtSettingsUi, undefined);

    // Expand settings panel while off to test live hot-plug via daemon broadcast
    const settingsSec = pageEnv.doc.getElementById('ag-cs-settings-sec');
    assert.ok(settingsSec);
    settingsSec.querySelector('.ag-cs-settings-fold-head').dispatch('click');
    assert.equal(settingsSec.querySelector('[data-testid="prism-thought-ai-config"]'), null);

    // 2. off -> ai hot-injection registers thoughtScriptId and mounts Channel 5
    pageEnv.sandbox.window.__agPrism.saveSettingsBatch({ thoughtTranslate: 'ai' });
    await waitBroadcastDrain(daemon);
    assert.ok(daemon.thoughtExpr.length > 0, 'ai mode must compile thoughtExpr');
    assert.ok(entry.thoughtScriptId, 'off -> ai must register thoughtScriptId');
    const thoughtScriptId1 = entry.thoughtScriptId;
    assert.equal(entry.thoughtMounted, true);
    assert.ok(activeScripts.get(thoughtScriptId1)?.includes('__agPrismThoughtSettingsUi='));
    assert.ok(addBindingCalls.includes(THOUGHT_BINDING));
    assert.ok(pageEnv.sandbox.window.__agPrismThought);
    assert.ok(pageEnv.sandbox.window.__agPrismThoughtSettingsUi);
    const hotBox = settingsSec.querySelector('[data-testid="prism-thought-ai-config"]');
    assert.ok(hotBox);
    assert.equal(hotBox.hidden, false);

    // 3. _verifyAndHealEntryUnlocked self-heals missing thought globals & thoughtScriptId
    activeScripts.delete(thoughtScriptId1);
    entry.thoughtScriptId = null;
    entry.thoughtMounted = false;
    vm.runInContext(
      'delete window.__agPrismThought; delete globalThis.__agPrismThought; delete window.__agPrismThoughtSettingsUi; delete globalThis.__agPrismThoughtSettingsUi;',
      vmCtx
    );
    assert.equal(pageEnv.sandbox.window.__agPrismThought, undefined);
    const healOutcome = await daemon._verifyAndHealEntryUnlocked(entry, true);
    assert.equal(healOutcome.alive, true);
    assert.ok(entry.thoughtScriptId && entry.thoughtScriptId !== thoughtScriptId1, 'Heal must re-register thoughtScriptId');
    assert.equal(entry.thoughtMounted, true);
    assert.ok(pageEnv.sandbox.window.__agPrismThought);
    assert.ok(pageEnv.sandbox.window.__agPrismThoughtSettingsUi);
    const healedThoughtScriptId = entry.thoughtScriptId;

    // 4. ai -> off cleans DOM/globals and removes thoughtScriptId via Page.removeScriptToEvaluateOnNewDocument
    pageEnv.sandbox.window.__agPrism.saveSettingsBatch({ thoughtTranslate: 'off' });
    await waitBroadcastDrain(daemon);
    assert.equal(daemon.thoughtExpr, '');
    assert.equal(entry.thoughtScriptId, null);
    assert.equal(entry.thoughtMounted, false);
    assert.ok(removeScriptCalls.includes(healedThoughtScriptId), 'ai -> off must remove thoughtScriptId');
    assert.equal(pageEnv.sandbox.window.__agPrismThought, undefined);
    assert.equal(pageEnv.sandbox.window.__agPrismThoughtSettingsUi, undefined);
    assert.equal(settingsSec.querySelector('[data-testid="prism-thought-ai-config"]'), null);

    // 5. Re-enable ai then detachAll() removes thoughtScriptId & leaves zero orphans
    pageEnv.sandbox.window.__agPrism.saveSettingsBatch({ thoughtTranslate: 'ai' });
    await waitBroadcastDrain(daemon);
    assert.ok(entry.thoughtScriptId);
    const finalThoughtScriptId = entry.thoughtScriptId;
    await daemon.detachAll(true);
    assert.ok(removeScriptCalls.includes(finalThoughtScriptId), 'detachAll must remove thoughtScriptId');
    assert.equal(activeScripts.size, 0, 'detachAll must leave zero active NewDocument scripts');
    assert.equal(daemon.sessions.size, 0);
    assert.equal(pageEnv.sandbox.window.__agPrismThought, undefined);
    assert.equal(pageEnv.sandbox.window.__agPrismThoughtSettingsUi, undefined);
    await daemon.stop(false);
    daemon = null;
  } finally {
    if (daemon) await daemon.stop(false).catch(() => {});
    pageEnv.cleanup();
    await installPluginTool.uninstallPlugin({ targetDir: targetPluginDir, noCdp: true }).catch(() => {});
    for (const s of sockets) s.destroy();
    await new Promise((r) => server.close(r));
    fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 80 });
  }
});

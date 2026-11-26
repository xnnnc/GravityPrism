import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { PrismDaemon, sanitizeSecretText } from '../sidecars/daemon/main.mjs';
import { createManifest } from '../scripts/build-common.mjs';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const cdp = require(path.join(ROOT, 'cdp.js'));
const swarmRuntime = require(path.join(ROOT, 'vendor', 'host-i18n', 'swarm-i18n-runtime.js'));
const swarmDict = JSON.parse(fs.readFileSync(path.join(ROOT, 'vendor', 'host-i18n', 'swarm-zh-CN.json'), 'utf8'));

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function createSwarmTestDom(locUrl = 'plugin://swarm--swarm_board-4808/?token=FAKE_TOKEN_123&conversationId=conv-1') {
  const listenersByTarget = new WeakMap();

  function makeTextNode(text) {
    return {
      nodeType: 3,
      _val: String(text),
      get nodeValue() { return this._val; },
      set nodeValue(v) { this._val = String(v); },
      get textContent() { return this._val; },
      set textContent(v) { this._val = String(v); },
      parentNode: null,
      parentElement: null,
      isConnected: true,
    };
  }

  function makeEl(tag, opts = {}) {
    const attrs = Object.create(null);
    const hasAttr = (k) => Object.prototype.hasOwnProperty.call(attrs, k);
    const childNodes = [];
    const el = {
      nodeType: 1,
      tagName: String(tag).toUpperCase(),
      childNodes,
      parentNode: null,
      parentElement: null,
      isConnected: true,
      _value: undefined,
      get children() {
        return childNodes.filter((n) => n.nodeType === 1);
      },
      get id() {
        return attrs.id || '';
      },
      set id(v) {
        attrs.id = String(v);
      },
      get className() {
        return attrs.class || '';
      },
      set className(v) {
        attrs.class = String(v);
      },
      classList: {
        contains(c) {
          return String(attrs.class || '').split(/\s+/).includes(c);
        },
      },
      get value() {
        if (el._value !== undefined) return el._value;
        if (hasAttr('value')) return attrs.value;
        return '';
      },
      set value(v) {
        el._value = String(v);
        attrs.value = String(v);
      },
      get textContent() {
        return childNodes.map((n) => (n.nodeType === 3 ? n.nodeValue : n.textContent)).join('');
      },
      set textContent(v) {
        for (const c of childNodes) {
          c.parentNode = null;
          c.parentElement = null;
        }
        childNodes.length = 0;
        if (v !== '' && v !== null && v !== undefined) {
          el.append(makeTextNode(v));
        }
      },
      setAttribute(k, v) {
        attrs[k] = String(v);
      },
      getAttribute(k) {
        return hasAttr(k) ? attrs[k] : null;
      },
      hasAttribute(k) {
        return hasAttr(k);
      },
      removeAttribute(k) {
        delete attrs[k];
      },
      append(...nodes) {
        for (const n of nodes) {
          const item = typeof n === 'string' ? makeTextNode(n) : n;
          item.parentNode = el;
          item.parentElement = el;
          item.isConnected = true;
          childNodes.push(item);
        }
        return el;
      },
      getElementById(id) {
        let found = null;
        const walk = (node) => {
          for (const c of node.childNodes || []) {
            if (c.nodeType !== 1) continue;
            if (!found && c.id === id) found = c;
            if (!found) walk(c);
          }
        };
        walk(el);
        return found;
      },
      querySelector(sel) {
        return el.querySelectorAll(sel)[0] || null;
      },
      querySelectorAll(sel) {
        const out = [];
        const parts = String(sel).split(',').map((s) => s.trim()).filter(Boolean);
        const matchOne = (node, p) => {
          if (p.startsWith('#')) return node.id === p.slice(1);
          if (p.startsWith('.')) return node.classList.contains(p.slice(1));
          const am = /^\[([a-zA-Z0-9_-]+)(?:="([^"]*)")?\]$/.exec(p);
          if (am) {
            if (!node.hasAttribute(am[1])) return false;
            if (am[2] !== undefined && node.getAttribute(am[1]) !== am[2]) return false;
            return true;
          }
          return node.tagName === p.toUpperCase();
        };
        const walk = (node) => {
          for (const c of node.childNodes || []) {
            if (c.nodeType !== 1) continue;
            if (parts.some((p) => matchOne(c, p))) out.push(c);
            walk(c);
          }
        };
        walk(el);
        return out;
      },
    };
    if (opts.id) el.id = opts.id;
    if (opts.className) el.className = opts.className;
    if (opts.value !== undefined) el.value = opts.value;
    if (opts.attrs) {
      for (const [k, v] of Object.entries(opts.attrs)) el.setAttribute(k, v);
    }
    if (opts.text !== undefined) el.append(makeTextNode(opts.text));
    return el;
  }

  const documentElement = makeEl('html');
  const body = makeEl('body');
  documentElement.append(body);

  const observers = [];
  class FakeMutationObserver {
    constructor(cb) {
      this.cb = cb;
      this.disconnected = false;
      this.observeCalls = 0;
      this.disconnectCalls = 0;
      observers.push(this);
    }
    observe() {
      this.disconnected = false;
      this.observeCalls += 1;
    }
    disconnect() {
      this.disconnected = true;
      this.disconnectCalls += 1;
    }
    trigger() {
      if (!this.disconnected) this.cb([], this);
    }
  }

  const addEv = (target, ev, fn) => {
    let m = listenersByTarget.get(target);
    if (!m) {
      m = Object.create(null);
      listenersByTarget.set(target, m);
    }
    if (!m[ev]) m[ev] = [];
    m[ev].push(fn);
  };
  const rmEv = (target, ev, fn) => {
    const m = listenersByTarget.get(target);
    const arr = m && m[ev];
    if (!arr) return;
    const i = arr.indexOf(fn);
    if (i >= 0) arr.splice(i, 1);
  };
  const emitEv = (target, ev) => {
    const m = listenersByTarget.get(target);
    const arr = m && m[ev];
    if (!arr) return;
    for (const fn of [...arr]) fn({ type: ev });
  };

  let parsedLoc;
  try {
    parsedLoc = new URL(locUrl);
  } catch {
    parsedLoc = { protocol: '', hostname: '', port: '', username: '', password: '', pathname: '', href: locUrl };
  }

  let nextRaf = 1;
  const rafQueue = new Map();

  const doc = {
    hidden: false,
    readyState: 'complete',
    documentElement,
    body,
    getElementById: (id) => documentElement.getElementById(id),
    querySelector: (sel) => documentElement.querySelector(sel),
    querySelectorAll: (sel) => documentElement.querySelectorAll(sel),
    addEventListener: (ev, fn) => addEv(doc, ev, fn),
    removeEventListener: (ev, fn) => rmEv(doc, ev, fn),
    emit: (ev) => emitEv(doc, ev),
  };

  const win = {
    document: doc,
    location: {
      protocol: parsedLoc.protocol,
      hostname: parsedLoc.hostname,
      port: parsedLoc.port,
      username: parsedLoc.username,
      password: parsedLoc.password,
      pathname: parsedLoc.pathname,
      href: parsedLoc.href,
    },
    MutationObserver: FakeMutationObserver,
    requestAnimationFrame(cb) {
      const id = nextRaf++;
      rafQueue.set(id, cb);
      return id;
    },
    cancelAnimationFrame(id) {
      rafQueue.delete(id);
    },
    flushRaf() {
      const cbs = [...rafQueue.values()];
      rafQueue.clear();
      for (const cb of cbs) cb();
    },
    addEventListener: (ev, fn) => addEv(win, ev, fn),
    removeEventListener: (ev, fn) => rmEv(win, ev, fn),
    emit: (ev) => emitEv(win, ev),
  };

  return { win, doc, makeEl, makeTextNode, observers, rafQueue };
}

test('swarm-board-i18n 1: strict URL boundary, zero token leak across url/title/logs, and listSwarmTargets redaction', async () => {
  // Valid Swarm sidecar URLs
  assert.equal(cdp.isSwarmSidecarUrl('plugin://swarm--swarm_board-4808/'), true);
  assert.equal(
    cdp.isSwarmSidecarUrl('plugin://swarm--swarm_board-4808/?token=SECRET_TOK_99&conversationId=abc-123'),
    true
  );

  // Fail-closed rejections
  for (const bad of [
    '',
    null,
    undefined,
    'https://swarm--swarm_board-4808/',
    'http://127.0.0.1:4808/',
    'plugin://other--swarm_board-4808/',
    'plugin://swarm--swarm_board-abc/',
    'plugin://swarm--swarm_board-4808:9000/',
    'plugin://user:pass@swarm--swarm_board-4808/',
    'plugin://swarm--swarm_board-4808/nested',
    'about:srcdoc',
    'data:text/html,<h1>Hi</h1>',
    'vscode-file://vscode-app/workbench.html',
  ]) {
    assert.equal(cdp.isSwarmSidecarUrl(bad), false, `Expected isSwarmSidecarUrl to reject: ${String(bad)}`);
  }

  // Existing isEligibleTarget must NEVER be relaxed for plugin:// Swarm targets
  assert.equal(
    cdp.isEligibleTarget({
      type: 'page',
      url: 'plugin://swarm--swarm_board-4808/?token=SECRET',
      title: 'plugin://swarm--swarm_board-4808/?token=SECRET',
      webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/1',
    }),
    false
  );

  // URL + title token redaction in both cdp.redactSensitiveUrl and daemon sanitizeSecretText
  const leaked =
    'plugin://swarm--swarm_board-4808/?token=PLAIN_SECRET_TOKEN_XYZ&auth=AUTH123&signature=SIG456&key=K789&secret=S000&conversationId=conv-42';
  const redactedCdp = cdp.redactSensitiveUrl(leaked);
  const redactedDaemon = sanitizeSecretText(leaked);
  for (const out of [redactedCdp, redactedDaemon]) {
    assert.equal(out.includes('PLAIN_SECRET_TOKEN_XYZ'), false);
    assert.equal(out.includes('AUTH123'), false);
    assert.equal(out.includes('SIG456'), false);
    assert.equal(out.includes('K789'), false);
    assert.equal(out.includes('S000'), false);
    assert.ok(out.includes('token=<REDACTED>'));
    assert.ok(out.includes('auth=<REDACTED>'));
    assert.ok(out.includes('signature=<REDACTED>'));
    assert.ok(out.includes('conversationId=conv-42'));
  }

  // listSwarmTargets filters only valid Swarm targets and redacts both url and title
  const rawTargets = [
    {
      id: 't-swarm-1',
      type: 'iframe',
      url: 'plugin://swarm--swarm_board-4808/?token=RAW_TOKEN_ONE&conversationId=c1',
      title: 'plugin://swarm--swarm_board-4808/?token=RAW_TOKEN_ONE&conversationId=c1',
      webSocketDebuggerUrl: 'ws://127.0.0.1:19999/devtools/page/t-swarm-1',
    },
    {
      id: 't-other',
      type: 'iframe',
      url: 'plugin://other--panel-4808/?token=OTHER',
      title: 'other',
      webSocketDebuggerUrl: 'ws://127.0.0.1:19999/devtools/page/t-other',
    },
    {
      id: 't-host',
      type: 'page',
      url: 'vscode-file://vscode-app/workbench.html',
      title: 'Antigravity',
      webSocketDebuggerUrl: 'ws://127.0.0.1:19999/devtools/page/t-host',
    },
  ];
  const srv = http.createServer((req, res) => {
    if (req.url === '/json/list') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(rawTargets));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  try {
    const port = srv.address().port;
    const found = await cdp.listSwarmTargets(port);
    assert.equal(found.length, 1);
    assert.equal(found[0].id, 't-swarm-1');
    assert.equal(found[0].url.includes('RAW_TOKEN_ONE'), false);
    assert.equal(found[0].title.includes('RAW_TOKEN_ONE'), false);
    assert.ok(found[0].url.includes('token=<REDACTED>'));
    assert.ok(found[0].title.includes('token=<REDACTED>'));
    assert.equal(cdp.isSwarmSidecarUrl(found[0].url), true);
  } finally {
    await new Promise((resolve) => srv.close(resolve));
  }
});

test('swarm-board-i18n 2: Ch1 zero byte delta, zh-CN.json intact, dictionary & runtime hygiene, on-demand disk cache', () => {
  // Channel 1 zero delta: RUNTIME_PARTS must not include any swarm i18n file
  assert.equal(
    cdp.RUNTIME_PARTS.some((p) => /swarm/i.test(p)),
    false,
    'RUNTIME_PARTS must not contain swarm-i18n files'
  );

  // Layer A zh-CN.json (v3.3.63: exact=4763, patterns=405)
  const hostDict = JSON.parse(fs.readFileSync(path.join(ROOT, 'vendor', 'host-i18n', 'zh-CN.json'), 'utf8'));
  assert.equal(Object.keys(hostDict.exact).length, 4763);
  assert.equal(hostDict.patterns.length, 405);

  // UTF-8 no BOM, pure LF, no new Map() in swarm-i18n-runtime.js
  for (const rel of ['vendor/host-i18n/swarm-zh-CN.json', 'vendor/host-i18n/swarm-i18n-runtime.js']) {
    const buf = fs.readFileSync(path.join(ROOT, rel));
    assert.equal(buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf, false, `${rel} must have no UTF-8 BOM`);
    const txt = buf.toString('utf8');
    assert.equal(txt.includes('\r\n'), false, `${rel} must use LF line endings`);
  }
  const rtSrc = fs.readFileSync(path.join(ROOT, 'vendor', 'host-i18n', 'swarm-i18n-runtime.js'), 'utf8');
  assert.equal(/new\s+Map\s*\(/.test(rtSrc), false, 'swarm-i18n-runtime.js must not use new Map()');

  // Dictionary completeness & safe anchored patterns & .o2-rmeta leading digit
  assert.ok(Object.keys(swarmDict.exact).length >= 130, 'swarm-zh-CN.json must have >= 130 exact entries');
  for (const listName of ['patterns', 'optionPatterns']) {
    for (const item of swarmDict[listName]) {
      assert.ok(item.regex.startsWith('^') && item.regex.endsWith('$'), `Pattern must be ^...$ anchored: ${item.regex}`);
      // Reject classic nested-quantifier ReDoS constructs
      assert.equal(/\([^)]*[+*][^)]*\)[+*{]/.test(item.regex), false, `Potential ReDoS nested quantifier: ${item.regex}`);
      assert.doesNotThrow(() => new RegExp(item.regex));
    }
  }
  const eng = swarmRuntime.createSwarmI18nEngine(swarmDict);
  const rmetaZh = eng.translate('2 of 5 tasks done');
  assert.ok(rmetaZh && /^\d+/.test(rmetaZh), `.o2-rmeta translation must keep leading digits, got: ${rmetaZh}`);
  assert.equal(rmetaZh.replace(/^\d+/, '4'), '4 / 5 项任务已完成');
  assert.ok(swarmDict.protectedUiKeys && swarmDict.protectedUiKeys.team === 'The team');

  // Gate matrix for shouldEnableSwarmI18n
  assert.equal(cdp.shouldEnableSwarmI18n({ hostLocalization: 'off', language: 'zh-CN' }), false);
  assert.equal(cdp.shouldEnableSwarmI18n({ hostLocalization: 'on', language: 'en' }), true);
  assert.equal(cdp.shouldEnableSwarmI18n({ hostLocalization: 'auto', language: 'zh-CN' }), true);
  assert.equal(cdp.shouldEnableSwarmI18n({ hostLocalization: 'auto', language: 'en' }), false);
  assert.equal(cdp.shouldEnableSwarmI18n({ hostLocalization: 'auto', language: 'auto' }, 'en-US'), false);
  assert.equal(cdp.shouldEnableSwarmI18n({ hostLocalization: 'auto', language: 'auto' }, 'zh-CN'), true);
  assert.equal(cdp.buildSwarmI18nExpression({ hostLocalization: 'off', language: 'zh-CN' }), '');

  // On-demand disk cache for swarmI18n + PrismDaemon.rebuildBundle() does NOT precompile swarmI18n
  const tmpDir = makeTempDir('ag-swarm-cache-');
  const cachePath = path.join(tmpDir, '.bundle-cache.json');
  try {
    cdp.resetBundleCacheStats();
    const coldExpr = cdp.buildSwarmI18nExpression({ hostLocalization: 'on' }, null, { cachePath });
    assert.ok(coldExpr.length > 1000);
    assert.equal(fs.existsSync(cachePath), true);

    // Reload fresh cdp.js to verify true disk cache hit for swarmI18n
    const cdpPath = require.resolve(path.join(ROOT, 'cdp.js'));
    const prevMod = require.cache[cdpPath];
    delete require.cache[cdpPath];
    try {
      const freshCdp = require(cdpPath);
      freshCdp.resetBundleCacheStats();
      const hitExpr = freshCdp.buildSwarmI18nExpression({ hostLocalization: 'on' }, null, { cachePath });
      assert.equal(hitExpr, coldExpr);
      const st = freshCdp.getBundleCacheStats();
      assert.equal(st.channelHitsByName.swarmI18n, 1);
      assert.equal(st.channelCompileRuns, 0);
    } finally {
      if (prevMod) require.cache[cdpPath] = prevMod;
    }

    // rebuildBundle must leave swarmI18nExpr empty (deferred on demand)
    const d = new PrismDaemon({ rootDir: ROOT, silent: true, bundleCachePath: cachePath });
    d.rebuildBundle();
    assert.equal(d.swarmI18nExpr, '');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // Manifest + installer/uninstaller static contract
  const manifest = createManifest();
  assert.equal(manifest.swarmI18nRemoveExpression, cdp.SWARM_I18N_REMOVE_EXPRESSION);
  const progCs = fs.readFileSync(path.join(ROOT, 'installer', 'setup', 'Program.cs'), 'utf8');
  assert.ok(progCs.includes('swarmI18nRemoveExpression'));
  assert.ok(progCs.includes('ListSwarmTargetsAsync'));
  assert.ok(progCs.includes('RedactSensitiveUrl'));
  const macSwift = fs.readFileSync(path.join(ROOT, 'installer', 'macos', 'Setup', 'main.swift'), 'utf8');
  assert.ok(macSwift.includes('swarmI18nRemoveExpression'));
  assert.ok(macSwift.includes('listSwarmTargets'));
  assert.ok(macSwift.includes('redactSensitiveUrl'));
});

test('swarm-board-i18n 3: sandbox DOM translation, exemptions, <option>.value safety, viewCopy/ASAR yield, Map hijack defense, lossless destroy()', () => {
  const env = createSwarmTestDom();
  const { win, doc, makeEl } = env;

  // Build representative Swarm board DOM
  const titleEl = makeEl('h1', { id: 'swarm-title', text: 'Running' }); // dynamic title, must stay untouched
  const liveLabel = makeEl('span', { id: 'live-label', text: 'Live' });
  const tabs = makeEl('nav', { attrs: { 'data-testid': 'swarm-tabs', 'aria-label': 'Swarm views' } });
  const tabOverview = makeEl('button', { id: 'tabbtn-overview', text: 'Overview' });
  const tabFeed = makeEl('button', { id: 'tabbtn-feed', text: 'Board' });
  const tabMembers = makeEl('button', { id: 'tabbtn-members', text: 'Members' });
  const tabGraph = makeEl('button', { id: 'tabbtn-graph', text: 'Graph' });
  tabs.append(tabOverview, tabFeed, tabMembers, tabGraph);

  // Whitelisted <select> elements + non-whitelisted #replay-speed
  const selAgent = makeEl('select', { id: 'f-agent', value: 'coder-1' });
  const optAgentAll = makeEl('option', { value: '', text: 'From anyone' });
  const optAgent1 = makeEl('option', { value: 'coder-1', text: 'From coder-1' });
  selAgent.append(optAgentAll, optAgent1);

  const selMention = makeEl('select', { id: 'f-mention', value: '@all' });
  const optMAll = makeEl('option', { value: '@all', text: 'To @all' });
  const optMNone = makeEl('option', { value: '@none', text: 'To no one' });
  const optMUser = makeEl('option', { value: 'worker-2', text: 'To worker-2' });
  selMention.append(optMAll, optMNone, optMUser);

  const selChannel = makeEl('select', { id: 'f-channel', value: 'backend' });
  const optChAll = makeEl('option', { value: '', text: 'All channels' });
  const optChArch = makeEl('option', { value: 'backend', text: '#backend (archived)' });
  selChannel.append(optChAll, optChArch);

  const selTiming = makeEl('select', { id: 'replay-timing', value: 'even' });
  const optEven = makeEl('option', { value: 'even', text: 'Even pacing' });
  const optReal = makeEl('option', { value: 'real', text: 'Real-time gaps' });
  selTiming.append(optEven, optReal);

  const selSpeed = makeEl('select', { id: 'replay-speed', value: '2' });
  const optSpeed2 = makeEl('option', { value: '2', text: '2×' });
  selSpeed.append(optSpeed2);

  // #channel-tabs: All & #main tooltip allowed; custom channel name exempt
  const channelTabs = makeEl('div', { id: 'channel-tabs' });
  const chAllBtn = makeEl('button', {
    className: 'channel-tab',
    attrs: { 'data-channel': '', 'data-testid': 'swarm-channel-tab', title: 'Posts in every channel' },
    text: 'All',
  });
  const chMainBtn = makeEl('button', {
    className: 'channel-tab',
    attrs: { 'data-channel': 'main', 'data-testid': 'swarm-channel-tab', title: 'main: the whole swarm reads it' },
    text: '#main',
  });
  const chCustomBtn = makeEl('button', {
    className: 'channel-tab',
    attrs: { 'data-channel': 'Running', 'data-testid': 'swarm-channel-tab', title: 'Running' },
    text: '#Running',
  });
  channelTabs.append(chAllBtn, chMainBtn, chCustomBtn);

  // Content isolation exemptions
  const ovFrame = makeEl('div', { id: 'ov-frame' });
  const ovFrameInner = makeEl('button', { text: 'Overview' });
  ovFrame.append(ovFrameInner);

  const rawPre = makeEl('pre', { id: 'raw', text: 'Board' });
  const rawMeta = makeEl('div', { id: 'raw-meta', text: 'Members' });
  const msgBody = makeEl('div', { className: 'msg-body', text: 'Overview' });
  const sysText = makeEl('span', { className: 'sys-text', text: 'Running' });
  const msgAuthor = makeEl('span', { className: 'msg-author', text: 'Active' });
  const msgTo = makeEl('span', { className: 'msg-to', text: 'Waiting' });
  const mentionSpan = makeEl('span', { className: 'mention', attrs: { title: 'Everyone in #backend' }, text: '@Active' });
  const msgChannel = makeEl('button', {
    className: 'msg-channel',
    attrs: { title: 'Posted in #dev; click to show only #dev' },
    text: '#dev',
  });
  const seqRef = makeEl('button', { className: 'seq-ref', text: 'Live' });
  const codeEl = makeEl('code', { text: 'Export GIF' });
  const preEl = makeEl('pre', { text: 'Board' });

  // Hive / o2 structure including exemptions, .o2-thn > span Now, .o2-rmeta, stall banner, onboarding, viewCopy.ui
  const ovPlain = makeEl('div', { id: 'ov-plain', className: 'o2' });
  const ovStatus = makeEl('div', { id: 'ov-status' });
  const ovWho = makeEl('span', { className: 'ov-who', text: 'Running' });
  const ovFresh = makeEl('span', { className: 'ov-fresh', text: 'read #12 · updated 2m ago' });
  ovStatus.append(ovWho, ovFresh);

  const goalSec = makeEl('section', { className: 'o2-goal' });
  const goalLbl = makeEl('div', { className: 'o2-glbl', text: 'Goal' });
  const goalP = makeEl('p', { text: 'Running' }); // exempt
  goalSec.append(goalLbl, goalP);

  const thnP = makeEl('p', { className: 'o2-thn' });
  const thnNowSpan = makeEl('span', { text: 'Now' }); // allowed!
  const thnBodyText = env.makeTextNode('Waiting'); // exempt!
  thnP.append(thnNowSpan, thnBodyText);

  const thgP = makeEl('p', { className: 'o2-thg', text: 'Done' });
  const runtB = makeEl('b', { className: 'o2-runt', text: 'Done' });
  const runNoteP = makeEl('p', { className: 'o2-runnote', text: 'Waiting' });
  const runSumP = makeEl('p', { className: 'o2-runsum', text: 'Running' });
  const doneM = makeEl('div', { className: 'o2-donem', text: 'Active' });
  const cbDiv = makeEl('div', { className: 'o2-cb' });
  const cbB = makeEl('b', { text: 'Blocked' });
  const cbP = makeEl('p', { text: 'Running' });
  const cbWho = makeEl('div', { className: 'o2-who', text: 'Coordinator' });
  cbDiv.append(cbB, cbP, cbWho);
  const mauth = makeEl('span', { className: 'o2-mauth', text: 'Active' });
  const mrole = makeEl('div', { className: 'o2-mrole', text: 'Waiting' });
  const mts = makeEl('span', { className: 'o2-mts', text: 'Done' });
  const sttxt = makeEl('p', { className: 'o2-sttxt', text: 'Stuck' });
  const ackDiv = makeEl('div', { className: 'o2-ack', text: 'Done' });

  const rmetaP = makeEl('p', { className: 'o2-rmeta', text: '2 of 5 tasks done' });
  const stallSec = makeEl('section', { className: 'o2-stall', attrs: { 'data-testid': 'swarm-stall-banner' } });
  const stallB = makeEl('b', { text: 'Swarm stalled — no agents working' });
  stallSec.append(stallB, sttxt);

  const exportBtn = makeEl('button', { id: 'graph-export-gif', attrs: { title: 'Export graph replay as an animated GIF' } });
  const exportLbl = makeEl('span', { id: 'graph-export-gif-label', text: 'Export GIF' });
  exportBtn.append(exportLbl);

  // viewCopy.ui protected slots
  const teamSec = makeEl('section', { className: 'o2-team' });
  const teamH = makeEl('h3', { className: 'o2-h', text: 'Running' }); // custom label set by narrator!
  teamSec.append(teamH);
  const runSec = makeEl('section', { className: 'o2-run' });
  const runH = makeEl('div', { className: 'o2-runh' });
  const runHB = makeEl('b', { text: 'Running' }); // NOT customized -> should translate
  runH.append(runHB);
  runSec.append(runH);

  win.SwarmHive = { viewCopy: { ui: { team: 'Running' } } };

  ovPlain.append(
    goalSec, thnP, thgP, runtB, runNoteP, runSumP, doneM, cbDiv,
    mauth, mrole, mts, ackDiv, rmetaP, stallSec, teamSec, runSec
  );

  doc.body.append(
    titleEl, liveLabel, tabs, selAgent, selMention, selChannel, selTiming, selSpeed,
    channelTabs, ovFrame, rawPre, rawMeta, msgBody, sysText, msgAuthor, msgTo,
    mentionSpan, msgChannel, seqRef, codeEl, preEl, ovStatus, ovPlain, exportBtn
  );

  // Test Map.prototype poison defense at the same time
  const origHas = Map.prototype.has;
  const origGet = Map.prototype.get;
  let inst;
  try {
    Map.prototype.has = () => true;
    Map.prototype.get = () => 'POISONED';

    inst = swarmRuntime.mountSwarmI18n({ root: win, doc, dict: swarmDict });
  } finally {
    Map.prototype.has = origHas;
    Map.prototype.get = origGet;
  }

  assert.equal(inst.status, 'active');
  assert.equal(doc.documentElement.getAttribute('data-ag-prism-swarm-i18n'), 'active');

  // Translated UI text & attrs
  assert.equal(liveLabel.textContent, '实时');
  assert.equal(tabOverview.textContent, '概览');
  assert.equal(tabFeed.textContent, '消息板');
  assert.equal(tabMembers.textContent, '成员');
  assert.equal(tabGraph.textContent, '关系图');
  assert.equal(tabs.getAttribute('aria-label'), '蜂群视图');
  assert.equal(exportLbl.textContent, '导出 GIF');
  assert.equal(exportBtn.getAttribute('title'), '将图谱回放导出为动态 GIF');
  assert.equal(stallB.textContent, '蜂群已停滞 — 当前无成员工作');
  assert.equal(goalLbl.textContent, '目标');
  assert.equal(thnNowSpan.textContent, '当前');
  assert.equal(ovFresh.textContent, '已读至 #12 · 更新于 2m ago');
  assert.equal(chAllBtn.textContent, '全部');
  assert.equal(chAllBtn.getAttribute('title'), '全部频道的消息');
  assert.equal(chMainBtn.textContent, '#main');
  assert.equal(chMainBtn.getAttribute('title'), 'main：整个蜂群都会收到');
  assert.equal(mentionSpan.getAttribute('title'), '#backend 频道的所有成员');
  assert.equal(msgChannel.getAttribute('title'), '发布于 #dev；点击仅查看 #dev');

  // Whitelisted <select>/<option>: textContent translated, .value strictly untouched
  assert.equal(optAgentAll.textContent, '任意发送者');
  assert.equal(optAgent1.textContent, '来自 coder-1');
  assert.equal(optAgent1.value, 'coder-1');
  assert.equal(selAgent.value, 'coder-1');
  assert.equal(optMAll.textContent, '发送给 @all');
  assert.equal(optMAll.value, '@all');
  assert.equal(optMNone.textContent, '未提及任何人');
  assert.equal(optMNone.value, '@none');
  assert.equal(optMUser.textContent, '发给 worker-2');
  assert.equal(optMUser.value, 'worker-2');
  assert.equal(optChAll.textContent, '全部频道');
  assert.equal(optChArch.textContent, '#backend（已归档）');
  assert.equal(optChArch.value, 'backend');
  assert.equal(optEven.textContent, '匀速回放');
  assert.equal(optEven.value, 'even');
  assert.equal(optReal.textContent, '真实时间间隔');
  assert.equal(optReal.value, 'real');
  assert.equal(optSpeed2.textContent, '2×');
  assert.equal(optSpeed2.value, '2');

  // viewCopy.ui yield: team was customized to 'Running', so teamH stayed untouched; runHB translated
  assert.equal(teamH.textContent, 'Running', 'SwarmHive.viewCopy.ui custom label must be yielded');
  assert.equal(runHB.textContent, '进行中');

  // ALL content isolation exemptions strictly preserved
  assert.equal(titleEl.textContent, 'Running');
  assert.equal(ovFrameInner.textContent, 'Overview');
  assert.equal(rawPre.textContent, 'Board');
  assert.equal(rawMeta.textContent, 'Members');
  assert.equal(msgBody.textContent, 'Overview');
  assert.equal(sysText.textContent, 'Running');
  assert.equal(msgAuthor.textContent, 'Active');
  assert.equal(msgTo.textContent, 'Waiting');
  assert.equal(mentionSpan.textContent, '@Active');
  assert.equal(msgChannel.textContent, '#dev');
  assert.equal(seqRef.textContent, 'Live');
  assert.equal(codeEl.textContent, 'Export GIF');
  assert.equal(preEl.textContent, 'Board');
  assert.equal(ovWho.textContent, 'Running');
  assert.equal(goalP.textContent, 'Running');
  assert.equal(thnBodyText.nodeValue, 'Waiting');
  assert.equal(thgP.textContent, 'Done');
  assert.equal(runtB.textContent, 'Done');
  assert.equal(runNoteP.textContent, 'Waiting');
  assert.equal(runSumP.textContent, 'Running');
  assert.equal(doneM.textContent, 'Active');
  assert.equal(cbB.textContent, 'Blocked');
  assert.equal(cbP.textContent, 'Running');
  assert.equal(cbWho.textContent, 'Coordinator');
  assert.equal(mauth.textContent, 'Active');
  assert.equal(mrole.textContent, 'Waiting');
  assert.equal(mts.textContent, 'Done');
  assert.equal(sttxt.textContent, 'Stuck');
  assert.equal(ackDiv.textContent, 'Done');
  assert.equal(chCustomBtn.textContent, '#Running');
  assert.equal(chCustomBtn.getAttribute('title'), 'Running');

  // .o2-rmeta keeps leading digit and survives hive.js in-place .replace(/^\d+/, f.done)
  assert.equal(rmetaP.textContent, '2 / 5 项任务已完成');
  rmetaP.childNodes[0].nodeValue = rmetaP.childNodes[0].nodeValue.replace(/^\d+/, '4');
  assert.equal(rmetaP.textContent, '4 / 5 项任务已完成');

  // 0fps hibernation when hidden or blurred
  doc.hidden = true;
  doc.emit('visibilitychange');
  env.observers[0].trigger();
  assert.equal(env.rafQueue.size, 0, 'Hidden document must not schedule rAF');
  doc.hidden = false;
  doc.emit('visibilitychange');
  assert.equal(env.rafQueue.size, 1, 'Visible document flushes deferred scan');
  win.flushRaf();

  // Lossless destroy() restores 100% English + clears root attr & global handle
  inst.destroy();
  assert.equal(doc.documentElement.getAttribute('data-ag-prism-swarm-i18n'), null);
  assert.equal(win.__agPrismSwarmI18n, undefined);
  assert.equal(liveLabel.textContent, 'Live');
  assert.equal(tabOverview.textContent, 'Overview');
  assert.equal(tabFeed.textContent, 'Board');
  assert.equal(tabMembers.textContent, 'Members');
  assert.equal(tabs.getAttribute('aria-label'), 'Swarm views');
  assert.equal(exportLbl.textContent, 'Export GIF');
  assert.equal(exportBtn.getAttribute('title'), 'Export graph replay as an animated GIF');
  assert.equal(optAgent1.textContent, 'From coder-1');
  assert.equal(optAgent1.value, 'coder-1');
  assert.equal(optChArch.textContent, '#backend (archived)');
  assert.equal(thnNowSpan.textContent, 'Now');
  assert.equal(rmetaP.textContent, '4 of 5 tasks done');
  assert.equal(chAllBtn.textContent, 'All');
  assert.equal(chMainBtn.getAttribute('title'), 'main: the whole swarm reads it');

  // External ASAR i18n yield (window.__AGY_SWARM_I18N__ & [data-agy-i18n])
  const ext1 = createSwarmTestDom();
  ext1.win.__AGY_SWARM_I18N__ = true;
  const extTabs = ext1.makeEl('nav', { attrs: { 'data-testid': 'swarm-tabs' } });
  const extBtn = ext1.makeEl('button', { id: 'tabbtn-feed', text: 'Board' });
  extTabs.append(extBtn);
  ext1.doc.body.append(extTabs);
  const y1 = swarmRuntime.mountSwarmI18n({ root: ext1.win, doc: ext1.doc, dict: swarmDict });
  assert.equal(y1.status, 'yielded');
  assert.equal(extBtn.textContent, 'Board');

  const ext2 = createSwarmTestDom();
  const extDomTabs = ext2.makeEl('nav', { attrs: { 'data-testid': 'swarm-tabs', 'data-agy-i18n': '1' } });
  const extDomBtn = ext2.makeEl('button', { id: 'tabbtn-feed', text: 'Board' });
  extDomTabs.append(extDomBtn);
  ext2.doc.body.append(extDomTabs);
  const y2 = swarmRuntime.mountSwarmI18n({ root: ext2.win, doc: ext2.doc, dict: swarmDict });
  assert.equal(y2.status, 'yielded');
  assert.equal(extDomBtn.textContent, 'Board');

  // Gate rejections: non-Swarm URL and missing DOM sentinel
  const badUrlEnv = createSwarmTestDom('https://example.com/');
  badUrlEnv.doc.body.append(badUrlEnv.makeEl('nav', { attrs: { 'data-testid': 'swarm-tabs' } }));
  const rBadUrl = swarmRuntime.mountSwarmI18n({ root: badUrlEnv.win, doc: badUrlEnv.doc, dict: swarmDict });
  assert.equal(rBadUrl.status, 'skipped-non-swarm-url');

  const noSentinelEnv = createSwarmTestDom();
  noSentinelEnv.doc.body.append(noSentinelEnv.makeEl('div', { text: 'Board' }));
  const rNoDom = swarmRuntime.mountSwarmI18n({ root: noSentinelEnv.win, doc: noSentinelEnv.doc, dict: swarmDict });
  assert.equal(rNoDom.status, 'skipped-non-swarm-dom');

  // End-to-end VM execution of buildSwarmI18nExpression + SWARM_I18N_REMOVE_EXPRESSION
  const vmEnv = createSwarmTestDom();
  const vmTabs = vmEnv.makeEl('nav', { attrs: { 'data-testid': 'swarm-tabs' } });
  const vmBtn = vmEnv.makeEl('button', { id: 'tabbtn-feed', text: 'Board' });
  vmTabs.append(vmBtn);
  vmEnv.doc.body.append(vmTabs);
  const expr = cdp.buildSwarmI18nExpression({ hostLocalization: 'on' });
  const ctx = vm.createContext({
    window: vmEnv.win,
    document: vmEnv.doc,
    setTimeout,
    clearTimeout,
  });
  ctx.globalThis = ctx.window;
  const res1 = vm.runInContext(expr, ctx);
  assert.equal(res1.ok, true);
  assert.equal(res1.status, 'active');
  assert.equal(vmBtn.textContent, '消息板');
  const res2 = vm.runInContext(expr, ctx);
  assert.equal(res2.reused, true);
  const resRm = vm.runInContext(cdp.SWARM_I18N_REMOVE_EXPRESSION, ctx);
  assert.equal(resRm.status, 'off');
  assert.equal(vmBtn.textContent, 'Board');
  assert.equal(vmEnv.win.__agPrismSwarmI18n, undefined);
});

test('swarm-board-i18n 4: CdpSession flattened child session multiplexing and Daemon OOPIF state machine + hot toggle + detachAll', async () => {
  // Part A: CdpSession flattened multiplexing
  const sentFrames = [];
  const wsListeners = new Map();
  const fakeWs = {
    addEventListener(ev, fn) {
      if (!wsListeners.has(ev)) wsListeners.set(ev, []);
      wsListeners.get(ev).push(fn);
    },
    send(raw) {
      const msg = JSON.parse(raw);
      sentFrames.push(msg);
      queueMicrotask(() => {
        for (const fn of wsListeners.get('message') || []) {
          fn({ data: JSON.stringify({ id: msg.id, result: { ok: true, echoMethod: msg.method, echoSessionId: msg.sessionId || null } }) });
        }
      });
    },
    close() {
      for (const fn of wsListeners.get('close') || []) fn({});
    },
    emitEvent(payload) {
      for (const fn of wsListeners.get('message') || []) fn({ data: JSON.stringify(payload) });
    },
  };

  const parent = new cdp.CdpSession(fakeWs);
  const child = parent.createChildSession('sess-swarm-1', 'target-swarm-1');
  let childEventHits = 0;
  let parentEventHits = 0;
  parent.on('Page.loadEventFired', () => { parentEventHits += 1; });
  child.on('Page.loadEventFired', () => { childEventHits += 1; });

  const cRes = await child.send('Page.enable', {});
  assert.equal(cRes.echoSessionId, 'sess-swarm-1');
  fakeWs.emitEvent({ method: 'Page.loadEventFired', params: {}, sessionId: 'sess-swarm-1' });
  assert.equal(childEventHits, 1);
  assert.equal(parentEventHits, 0);
  fakeWs.emitEvent({ method: 'Page.loadEventFired', params: {} });
  assert.equal(parentEventHits, 1);
  assert.equal(childEventHits, 1);

  child.close();
  assert.equal(child.closed, true);
  assert.equal(parent.sessionListeners.has('sess-swarm-1'), false);
  assert.ok(sentFrames.some((f) => f.method === 'Target.detachFromTarget' && f.params?.sessionId === 'sess-swarm-1'));
  parent.close();

  // Part B: Daemon Mock CDP OOPIF state machine
  const tmpDir = makeTempDir('ag-swarm-daemon-');
  let daemon = null;
  try {
    let liveCfg = { ...cdp.DEFAULT_CONFIG, omniModule: 'off', sidebarStudio: 'off', hostLocalization: 'on', language: 'zh-CN' };
    const cdpCalls = [];
    const browserEventMap = new Map();
    const childSessionEventMap = new Map();
    let seqId = 1;
    const mockTargets = [
      {
        targetId: 'swarm-tid-1',
        type: 'iframe',
        url: 'plugin://swarm--swarm_board-4808/?token=SUPER_SECRET_ALPHA&conversationId=c1',
        title: 'plugin://swarm--swarm_board-4808/?token=SUPER_SECRET_ALPHA&conversationId=c1',
      },
      {
        targetId: 'unrelated-iframe',
        type: 'iframe',
        url: 'https://example.com/widget',
        title: 'Widget',
      },
    ];

    const mockBrowserSession = {
      closed: false,
      onClose: null,
      on(method, cb) {
        if (!browserEventMap.has(method)) browserEventMap.set(method, []);
        browserEventMap.get(method).push(cb);
      },
      emit(method, params) {
        for (const cb of browserEventMap.get(method) || []) cb(params);
      },
      onSessionEvent(sid, method, cb) {
        if (!childSessionEventMap.has(sid)) childSessionEventMap.set(sid, new Map());
        const m = childSessionEventMap.get(sid);
        if (!m.has(method)) m.set(method, []);
        m.get(method).push(cb);
      },
      offSession(sid) {
        childSessionEventMap.delete(sid);
      },
      async send(method, params = {}, _timeout = 5000, sessionId = null) {
        cdpCalls.push({ method, params, sessionId });
        if (method === 'Target.setDiscoverTargets') return {};
        if (method === 'Target.getTargets') return { targetInfos: [...mockTargets] };
        if (method === 'Target.attachToTarget') return { sessionId: `sid-${params.targetId}-${seqId++}` };
        if (method === 'Target.detachFromTarget') return {};
        if (method === 'Page.enable') return {};
        if (method === 'Page.addScriptToEvaluateOnNewDocument') return { identifier: `scr-${seqId++}` };
        if (method === 'Page.removeScriptToEvaluateOnNewDocument') return {};
        if (method === 'Runtime.evaluate') return { result: { value: { ok: true, status: 'active' } } };
        return {};
      },
      close() {
        this.closed = true;
        if (this.onClose) this.onClose();
      },
    };

    daemon = new PrismDaemon({ rootDir: ROOT, silent: false });
    daemon.logFile = path.join(tmpDir, 'daemon.log');
    daemon.running = true;
    daemon.cdp = {
      ...cdp,
      readConfig: () => ({ ...liveCfg }),
      getBrowserWsUrl: async () => 'ws://127.0.0.1:11370/devtools/browser/mock',
      CdpSession: {
        connect: async () => mockBrowserSession,
      },
    };

    // 1) ensureBrowserDiscovery subscribes and immediately sweeps already-open Swarm iframe
    await daemon.ensureBrowserDiscovery(11370);
    await new Promise((r) => setTimeout(r, 30));

    assert.equal(daemon.swarmSessions.size, 1);
    assert.ok(daemon.swarmSessions.has('swarm-tid-1'));
    const entry1 = daemon.swarmSessions.get('swarm-tid-1');
    assert.equal(entry1.url.includes('SUPER_SECRET_ALPHA'), false);
    assert.equal(entry1.title.includes('SUPER_SECRET_ALPHA'), false);
    assert.ok(entry1.url.includes('token=<REDACTED>'));

    // Verify 0 Runtime.addBinding and 0 main-bundle injection on Swarm child session
    const swarmChildCalls = cdpCalls.filter((c) => c.sessionId === entry1.sessionId);
    assert.ok(swarmChildCalls.some((c) => c.method === 'Page.enable'));
    assert.ok(swarmChildCalls.some((c) => c.method === 'Page.addScriptToEvaluateOnNewDocument'));
    assert.ok(swarmChildCalls.some((c) => c.method === 'Runtime.evaluate'));
    assert.equal(swarmChildCalls.some((c) => c.method === 'Runtime.addBinding'), false);
    assert.ok(cdpCalls.some((c) => c.method === 'Target.attachToTarget' && c.params?.flatten === true));

    // Verify daemon.log has zero secret token leakage
    const logTxt = fs.existsSync(daemon.logFile) ? fs.readFileSync(daemon.logFile, 'utf8') : '';
    assert.equal(logTxt.includes('SUPER_SECRET_ALPHA'), false, 'daemon.log must never contain raw Swarm token');

    // 2) Dynamic Target.targetCreated attaches second Swarm iframe; Target.targetDestroyed cleans it up
    mockBrowserSession.emit('Target.targetCreated', {
      targetInfo: {
        targetId: 'swarm-tid-2',
        type: 'iframe',
        url: 'plugin://swarm--swarm_board-5900/?token=SECOND_SECRET_BETA',
        title: 'plugin://swarm--swarm_board-5900/?token=SECOND_SECRET_BETA',
      },
    });
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(daemon.swarmSessions.size, 2);
    const sid2 = daemon.swarmSessions.get('swarm-tid-2').sessionId;
    mockBrowserSession.emit('Target.targetDestroyed', { targetId: 'swarm-tid-2' });
    assert.equal(daemon.swarmSessions.size, 1);
    assert.equal(childSessionEventMap.has(sid2), false, 'Destroyed target must release sessionListeners');

    // 3) Hot toggle hostLocalization: 'off' cleans DOM, removes script, detaches target
    liveCfg = { ...liveCfg, hostLocalization: 'off' };
    const callsBeforeOff = cdpCalls.length;
    await daemon.broadcastConfigRefresh();
    assert.equal(daemon.swarmSessions.size, 0);
    const offCalls = cdpCalls.slice(callsBeforeOff);
    assert.ok(
      offCalls.some((c) => c.method === 'Page.removeScriptToEvaluateOnNewDocument' && c.sessionId === entry1.sessionId)
    );
    assert.ok(
      offCalls.some(
        (c) =>
          c.method === 'Runtime.evaluate' &&
          c.sessionId === entry1.sessionId &&
          String(c.params?.expression || '').includes('__agPrismSwarmI18n')
      )
    );
    assert.ok(
      offCalls.some((c) => c.method === 'Target.detachFromTarget' && c.params?.sessionId === entry1.sessionId)
    );

    // 4) Hot toggle back to 'on' re-scans and re-attaches open Swarm iframe
    liveCfg = { ...liveCfg, hostLocalization: 'on' };
    await daemon.broadcastConfigRefresh();
    assert.equal(daemon.swarmSessions.size, 1);
    const reattachedSid = daemon.swarmSessions.get('swarm-tid-1').sessionId;

    // 5) detachAll(true) cleans DOM & detaches before closing browserSession
    const callsBeforeDetachAll = cdpCalls.length;
    await daemon.detachAll(true);
    assert.equal(daemon.swarmSessions.size, 0);
    const detachCalls = cdpCalls.slice(callsBeforeDetachAll);
    assert.ok(
      detachCalls.some((c) => c.method === 'Runtime.evaluate' && c.sessionId === reattachedSid)
    );
    assert.ok(
      detachCalls.some((c) => c.method === 'Target.detachFromTarget' && c.params?.sessionId === reattachedSid)
    );

    const finalLogTxt = fs.existsSync(daemon.logFile) ? fs.readFileSync(daemon.logFile, 'utf8') : '';
    assert.equal(finalLogTxt.includes('SUPER_SECRET_ALPHA'), false);
    assert.equal(finalLogTxt.includes('SECOND_SECRET_BETA'), false);
  } finally {
    if (daemon) await daemon.stop(false, { skipAutoArchive: true }).catch(() => {});
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('swarm-board-i18n 5: install-plugin verifyLiveWindowAttach redacts query secrets and mascot cleanup clears __agPrismMascotArt', async () => {
  const installPluginTool = require(path.join(ROOT, 'tools', 'install-plugin.cjs'));
  const mockTargetCdp = {
    readPort: () => 11370,
    redactSensitiveUrl: cdp.redactSensitiveUrl,
    listPages: async () => [
      {
        id: 'win-1',
        title: 'Antigravity — https://127.0.0.1:4808/?token=SECRET_TITLE_TOK&auth=SECRET_AUTH&key=SECRET_KEY&conversationId=c9',
        url: 'https://127.0.0.1:4808/?token=SECRET_URL_TOK&conversationId=c9',
        webSocketDebuggerUrl: 'ws://127.0.0.1:11370/devtools/page/win-1',
      },
    ],
    CdpSession: {
      connect: async () => ({
        evaluate: async () => ({
          hasPrism: true,
          hasRepoBridge: true,
          hasSidebarBridge: false,
          version: cdp.PLUGIN_VERSION,
          hasStyle: true,
        }),
        close() {},
      }),
    },
  };

  const res = await installPluginTool.verifyLiveWindowAttach(mockTargetCdp, 11370);
  assert.equal(res.attachedPages.length, 1);
  const t = res.attachedPages[0].title;
  assert.equal(t.includes('SECRET_TITLE_TOK'), false);
  assert.equal(t.includes('SECRET_AUTH'), false);
  assert.equal(t.includes('SECRET_KEY'), false);
  assert.ok(t.includes('token=<REDACTED>'));
  assert.ok(t.includes('auth=<REDACTED>'));
  assert.ok(t.includes('key=<REDACTED>'));
  assert.ok(t.includes('conversationId=c9'));

  // Fallback redaction when targetCdp lacks redactSensitiveUrl
  const resFallback = await installPluginTool.verifyLiveWindowAttach(
    { ...mockTargetCdp, redactSensitiveUrl: undefined },
    11370
  );
  assert.equal(resFallback.attachedPages[0].title.includes('SECRET_TITLE_TOK'), false);
  assert.ok(resFallback.attachedPages[0].title.includes('token=<REDACTED>'));

  // MASCOT_REMOVE_EXPRESSION & REMOVE_EXPRESSION clear __agPrismMascotArt
  const mkCtx = () => {
    const winObj = {
      __agDualMascotRig: { active: true },
      __agPrismMascotArt: { draw: () => {} },
    };
    const docObj = {
      documentElement: {
        getAttribute: () => null,
        removeAttribute() {},
        style: { removeProperty() {} },
        classList: { remove() {} },
      },
      body: {
        getAttribute: () => null,
        removeAttribute() {},
        classList: { remove() {} },
      },
      querySelectorAll: () => [],
      querySelector: () => null,
      getElementById: () => null,
    };
    const ctx = vm.createContext({ window: winObj, document: docObj, globalThis: winObj });
    return { ctx, winObj };
  };

  const m1 = mkCtx();
  vm.runInContext(cdp.MASCOT_REMOVE_EXPRESSION, m1.ctx);
  assert.equal(m1.winObj.__agDualMascotRig, undefined);
  assert.equal(m1.winObj.__agPrismMascotArt, undefined);

  const m2 = mkCtx();
  vm.runInContext(cdp.REMOVE_EXPRESSION, m2.ctx);
  assert.equal(m2.winObj.__agDualMascotRig, undefined);
  assert.equal(m2.winObj.__agPrismMascotArt, undefined);
});

test('Battle 5: detectExternalSwarmI18n yields to Antigravity-Hans, 3169657175, renkeshui, Zero-Touch, generic attrs & html[lang^="zh"]', () => {
  const mkReadyEnv = () => {
    const env = createSwarmTestDom();
    const nav = env.makeEl('nav', { attrs: { 'data-testid': 'swarm-tabs' } });
    const btn = env.makeEl('button', { id: 'tabbtn-feed', text: 'Board' });
    nav.append(btn);
    env.doc.body.append(nav);
    return { ...env, btn };
  };

  // 1) Global markers across external localization providers
  for (const globalKey of [
    '__antigravityZhPatchInstalled',
    '__agyI18n',
    '__antigravity_i18n_runner_active',
    '__antigravityZh',
    '__AGY_SWARM_I18N__',
  ]) {
    const env = mkReadyEnv();
    env.win[globalKey] = true;
    assert.equal(swarmRuntime.detectExternalSwarmI18n(env.win, env.doc), 'global-marker', `Must detect ${globalKey}`);
    const inst = swarmRuntime.mountSwarmI18n({ root: env.win, doc: env.doc, dict: swarmDict });
    assert.equal(inst.status, 'yielded', `mountSwarmI18n must yield on ${globalKey}`);
    assert.equal(env.btn.textContent, 'Board');
  }

  // 2) Antigravity-Hans localStorage antigravityHansLang ('zh-CN' yields, 'en'/'off' does not)
  const envHansZh = mkReadyEnv();
  envHansZh.win.localStorage = { getItem: (k) => (k === 'antigravityHansLang' ? 'zh-CN' : null) };
  assert.equal(swarmRuntime.detectExternalSwarmI18n(envHansZh.win, envHansZh.doc), 'storage-marker');
  const envHansEn = mkReadyEnv();
  envHansEn.win.localStorage = { getItem: (k) => (k === 'antigravityHansLang' ? 'en' : null) };
  assert.equal(swarmRuntime.detectExternalSwarmI18n(envHansEn.win, envHansEn.doc), null);

  // 3) DOM markers: [data-agy-hans-ui], [data-ag-cn], [data-i18n-patched], [data-translated], #agy-theme-switcher
  for (const attr of ['data-agy-hans-ui', 'data-ag-cn', 'data-i18n-patched', 'data-translated']) {
    const env = mkReadyEnv();
    env.doc.body.setAttribute(attr, '1');
    assert.equal(swarmRuntime.detectExternalSwarmI18n(env.win, env.doc), 'dom-marker', `Must detect [${attr}]`);
  }
  const envTheme = mkReadyEnv();
  envTheme.doc.body.append(envTheme.makeEl('div', { id: 'agy-theme-switcher' }));
  assert.equal(swarmRuntime.detectExternalSwarmI18n(envTheme.win, envTheme.doc), 'dom-marker');

  // 4) html[lang^="zh"] yields, html[lang="en"] does not
  const envLangZh = mkReadyEnv();
  envLangZh.doc.documentElement.setAttribute('lang', 'zh-CN');
  assert.equal(swarmRuntime.detectExternalSwarmI18n(envLangZh.win, envLangZh.doc), 'html-lang-zh');
  const envLangEn = mkReadyEnv();
  envLangEn.doc.documentElement.setAttribute('lang', 'en');
  assert.equal(swarmRuntime.detectExternalSwarmI18n(envLangEn.win, envLangEn.doc), null);
});

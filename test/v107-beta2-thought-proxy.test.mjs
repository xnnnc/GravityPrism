import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import {
  ThoughtTranslatorService,
  parseProxyUrl,
  validateProxyUrl,
  maskProxyUrl,
  parseWindowsRegProxyOutput,
  parseMacScutilProxyOutput,
  resolveSystemProxy,
  isAlreadyTargetLang,
  splitOversizedThought,
  protectToolSummaryIdentifiers,
  restoreToolSummaryIdentifiers,
  isToolSummaryTranslatable,
  redactSecrets,
} from '../vendor/thought-translator/translator-service.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

// ── Lightweight DOM mock (supports MutationObserver, visibilitychange, classList, nextElementSibling) ──
function createMockDomEnv(extraGlobals = {}) {
  const listenersByNode = new WeakMap();
  const docListeners = new Map();
  const observers = [];
  let doc = null;

  const notifyObservers = (target, type, extra = {}) => {
    for (const obs of observers) {
      if (!obs.active || !obs.target) continue;
      let cur = target;
      let hit = false;
      while (cur) {
        if (cur === obs.target) {
          hit = true;
          break;
        }
        if (!obs.opts?.subtree) break;
        cur = cur.parentElement;
      }
      if (!hit) continue;
      if (type === 'attributes' && !obs.opts?.attributes) continue;
      if (type === 'attributes' && obs.opts?.attributeFilter && !obs.opts.attributeFilter.includes(extra.attributeName)) continue;
      if (type === 'characterData' && !obs.opts?.characterData) continue;
      if (type === 'childList' && !obs.opts?.childList) continue;
      obs.cb([{ type, target, ...extra }]);
    }
  };

  class MockMutationObserver {
    constructor(cb) {
      this.cb = cb;
      this.target = null;
      this.opts = null;
      this.active = false;
      observers.push(this);
    }
    observe(target, opts = {}) {
      this.target = target;
      this.opts = opts;
      this.active = true;
    }
    disconnect() {
      this.active = false;
      this.target = null;
    }
  }

  function makeClassList(el) {
    const getList = () => String(el.className || '').split(/\s+/).filter(Boolean);
    return {
      contains: (c) => getList().includes(c),
      add: (...cs) => {
        const s = new Set(getList());
        cs.forEach((c) => c && s.add(c));
        el.className = Array.from(s).join(' ');
        notifyObservers(el, 'attributes', { attributeName: 'class' });
      },
      remove: (...cs) => {
        const s = new Set(getList());
        cs.forEach((c) => s.delete(c));
        el.className = Array.from(s).join(' ');
        notifyObservers(el, 'attributes', { attributeName: 'class' });
      },
    };
  }

  function matchSimpleSelector(el, sel) {
    if (!el || el.nodeType !== 1) return false;
    const parts = sel.split(',').map((s) => s.trim()).filter(Boolean);
    for (const part of parts) {
      let ok = true;
      let rest = part;
      const tagM = /^([a-zA-Z][a-zA-Z0-9-]*)/.exec(rest);
      if (tagM) {
        if (String(el.tagName || '').toUpperCase() !== tagM[1].toUpperCase()) ok = false;
        rest = rest.slice(tagM[0].length);
      }
      const clsMatches = rest.match(/\.[A-Za-z0-9_-]+/g) || [];
      for (const cm of clsMatches) {
        if (!el.classList.contains(cm.slice(1))) ok = false;
      }
      const attrRe = /\[([a-zA-Z0-9_-]+)(?:(\*?=)"([^"]*)")?\]/g;
      let am;
      while ((am = attrRe.exec(rest)) !== null) {
        const val = el.getAttribute(am[1]);
        if (am[2] === '=') {
          if (val !== am[3]) ok = false;
        } else if (am[2] === '*=') {
          if (!String(val || '').includes(am[3])) ok = false;
        } else if (val === null) {
          ok = false;
        }
      }
      if (ok) return true;
    }
    return false;
  }

  function createTextNode(str) {
    let val = String(str ?? '');
    const tn = {
      nodeType: 3,
      parentElement: null,
      ownerDocument: null,
      get isConnected() {
        let cur = tn.parentElement;
        while (cur) {
          if (cur === rootBody || cur === docEl) return true;
          cur = cur.parentElement;
        }
        return false;
      },
      get nodeValue() {
        return val;
      },
      set nodeValue(v) {
        val = String(v ?? '');
        notifyObservers(tn, 'characterData');
      },
      get textContent() {
        return val;
      },
      set textContent(v) {
        val = String(v ?? '');
        notifyObservers(tn, 'characterData');
      },
      appendData(d) {
        val += String(d ?? '');
        notifyObservers(tn, 'characterData');
      },
    };
    return tn;
  }

  function createElement(tag, initAttrs = {}) {
    const attrs = new Map();
    const childNodes = [];
    let classNameVal = '';
    const styleObj = {
      removeProperty(k) {
        delete this[k];
        if (k === 'min-height') delete this.minHeight;
      },
    };

    const el = {
      nodeType: 1,
      tagName: String(tag).toUpperCase(),
      parentElement: null,
      ownerDocument: null,
      childNodes,
      style: styleObj,
      hidden: false,
      disabled: false,
      value: '',
      title: '',
      placeholder: '',
      type: '',
      scrollTop: 0,
      offsetHeight: 40,
      get children() {
        return childNodes.filter((n) => n.nodeType === 1);
      },
      get firstChild() {
        return childNodes[0] || null;
      },
      get nextElementSibling() {
        const p = el.parentElement;
        if (!p) return null;
        const sibs = p.children;
        const idx = sibs.indexOf(el);
        return idx >= 0 && idx + 1 < sibs.length ? sibs[idx + 1] : null;
      },
      get previousElementSibling() {
        const p = el.parentElement;
        if (!p) return null;
        const sibs = p.children;
        const idx = sibs.indexOf(el);
        return idx > 0 ? sibs[idx - 1] : null;
      },
      get isConnected() {
        if (el === rootBody || el === docEl) return true;
        let cur = el.parentElement;
        while (cur) {
          if (cur === rootBody || cur === docEl) return true;
          cur = cur.parentElement;
        }
        return false;
      },
      get className() {
        return classNameVal;
      },
      set className(v) {
        classNameVal = String(v || '');
        attrs.set('class', classNameVal);
        notifyObservers(el, 'attributes', { attributeName: 'class' });
      },
      get textContent() {
        return childNodes.map((c) => (c.nodeType === 3 ? c.nodeValue : c.textContent)).join('');
      },
      set textContent(v) {
        childNodes.length = 0;
        if (v !== '' && v !== null && v !== undefined) {
          const tn = createTextNode(v);
          tn.parentElement = el;
          tn.ownerDocument = doc;
          childNodes.push(tn);
        }
        notifyObservers(el, 'childList');
      },
      getAttribute(k) {
        if (k === 'class') return attrs.has('class') ? attrs.get('class') : classNameVal || null;
        return attrs.has(k) ? attrs.get(k) : null;
      },
      setAttribute(k, v) {
        const sv = String(v);
        attrs.set(k, sv);
        if (k === 'class') classNameVal = sv;
        notifyObservers(el, 'attributes', { attributeName: k });
      },
      removeAttribute(k) {
        attrs.delete(k);
        if (k === 'class') classNameVal = '';
        notifyObservers(el, 'attributes', { attributeName: k });
      },
      hasAttribute(k) {
        return attrs.has(k);
      },
      toggleAttribute(k, force) {
        const next = force !== undefined ? Boolean(force) : !attrs.has(k);
        if (next) el.setAttribute(k, '');
        else el.removeAttribute(k);
        return next;
      },
      appendChild(child) {
        if (!child) return child;
        if (child.parentElement && child.parentElement !== el) {
          child.parentElement.removeChild(child);
        } else if (child.parentElement === el) {
          const idx = childNodes.indexOf(child);
          if (idx >= 0) childNodes.splice(idx, 1);
        }
        child.parentElement = el;
        child.ownerDocument = doc;
        childNodes.push(child);
        notifyObservers(el, 'childList');
        return child;
      },
      insertBefore(child, ref) {
        if (!child) return child;
        if (child.parentElement) child.parentElement.removeChild(child);
        child.parentElement = el;
        child.ownerDocument = doc;
        const idx = ref ? childNodes.indexOf(ref) : -1;
        if (idx >= 0) childNodes.splice(idx, 0, child);
        else childNodes.push(child);
        notifyObservers(el, 'childList');
        return child;
      },
      removeChild(child) {
        const idx = childNodes.indexOf(child);
        if (idx >= 0) {
          childNodes.splice(idx, 1);
          child.parentElement = null;
          notifyObservers(el, 'childList');
        }
        return child;
      },
      remove() {
        if (el.parentElement) el.parentElement.removeChild(el);
      },
      addEventListener(ev, fn) {
        let mp = listenersByNode.get(el);
        if (!mp) listenersByNode.set(el, (mp = new Map()));
        if (!mp.has(ev)) mp.set(ev, []);
        mp.get(ev).push(fn);
      },
      removeEventListener(ev, fn) {
        const arr = listenersByNode.get(el)?.get(ev);
        if (!arr) return;
        const idx = arr.indexOf(fn);
        if (idx >= 0) arr.splice(idx, 1);
      },
      dispatch(ev, payload = {}) {
        const arr = listenersByNode.get(el)?.get(ev) || [];
        const eventObj = {
          type: ev,
          target: el,
          preventDefault() {},
          stopPropagation() {},
          ...payload,
        };
        for (const fn of Array.from(arr)) fn(eventObj);
      },
      click() {
        el.dispatch('click');
      },
      querySelectorAll(sel) {
        const out = [];
        const walk = (n) => {
          for (const c of n.children || []) {
            if (matchSimpleSelector(c, sel)) out.push(c);
            walk(c);
          }
        };
        walk(el);
        return out;
      },
      querySelector(sel) {
        return el.querySelectorAll(sel)[0] || null;
      },
      closest(sel) {
        let cur = el;
        while (cur && cur.nodeType === 1) {
          if (matchSimpleSelector(cur, sel)) return cur;
          cur = cur.parentElement;
        }
        return null;
      },
      getBoundingClientRect() {
        return el._boundingRect || { top: 80, bottom: 160, left: 20, right: 620, width: 600, height: 80 };
      },
    };
    el.classList = makeClassList(el);
    for (const [k, v] of Object.entries(initAttrs)) el.setAttribute(k, v);
    return el;
  }

  const docEl = createElement('html');
  docEl.clientHeight = 900;
  docEl.clientWidth = 1440;
  const rootBody = createElement('body');
  docEl.appendChild(rootBody);

  const storageMap = new Map();
  const localStorage = {
    getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
    setItem: (k, v) => storageMap.set(k, String(v)),
    removeItem: (k) => storageMap.delete(k),
    clear: () => storageMap.clear(),
  };

  doc = {
    documentElement: docEl,
    body: rootBody,
    hidden: false,
    visibilityState: 'visible',
    createElement: (tag, attrs) => {
      const e = createElement(tag, attrs);
      e.ownerDocument = doc;
      return e;
    },
    createTextNode: (str) => {
      const tn = createTextNode(str);
      tn.ownerDocument = doc;
      return tn;
    },
    querySelectorAll: (sel) => docEl.querySelectorAll(sel),
    querySelector: (sel) => docEl.querySelector(sel),
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
    dispatchDocEvent(ev) {
      for (const fn of Array.from(docListeners.get(ev) || [])) fn({ type: ev });
    },
  };
  docEl.ownerDocument = doc;
  rootBody.ownerDocument = doc;

  const sandbox = {
    document: doc,
    localStorage,
    innerHeight: 900,
    innerWidth: 1440,
    console,
    URL,
    Date,
    Math,
    Set,
    Map,
    WeakMap,
    RegExp,
    JSON,
    Promise,
    Number,
    String,
    Boolean,
    Array,
    Object,
    setTimeout,
    clearTimeout,
    MutationObserver: MockMutationObserver,
    ...extraGlobals,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  return { doc, docEl, rootBody, sandbox, observers };
}

// ── Local RFC 1928 + RFC 1929 SOCKS5 mock server (pure node:net) ──
function createMockSocks5Server({ requireAuth = null, routeMap, onConnectEvent = null, onTlsPeek = null }) {
  const activeSockets = new Set();
  const track = (s) => {
    activeSockets.add(s);
    s.once('close', () => activeSockets.delete(s));
  };

  const server = net.createServer((clientSock) => {
    track(clientSock);
    let stage = 'greeting';
    let buf = Buffer.alloc(0);
    let authUser = '';

    const closeClient = () => {
      clientSock.on('error', () => {});
      try {
        clientSock.destroy();
      } catch {}
    };

    const onData = (chunk) => {
      buf = buf.length ? Buffer.concat([buf, chunk]) : Buffer.from(chunk);
      while (true) {
        if (stage === 'greeting') {
          if (buf.length < 2) return;
          const ver = buf[0];
          const nMethods = buf[1];
          if (buf.length < 2 + nMethods) return;
          const methods = Array.from(buf.subarray(2, 2 + nMethods));
          buf = buf.subarray(2 + nMethods);
          if (ver !== 0x05) return closeClient();
          if (requireAuth) {
            if (!methods.includes(0x02)) {
              clientSock.write(Buffer.from([0x05, 0xff]));
              return closeClient();
            }
            stage = 'auth';
            clientSock.write(Buffer.from([0x05, 0x02]));
          } else {
            if (!methods.includes(0x00)) {
              clientSock.write(Buffer.from([0x05, 0xff]));
              return closeClient();
            }
            stage = 'request';
            clientSock.write(Buffer.from([0x05, 0x00]));
          }
        } else if (stage === 'auth') {
          if (buf.length < 2) return;
          const aVer = buf[0];
          const uLen = buf[1];
          if (buf.length < 2 + uLen + 1) return;
          const user = buf.subarray(2, 2 + uLen).toString('utf8');
          const pLen = buf[2 + uLen];
          if (buf.length < 2 + uLen + 1 + pLen) return;
          const pass = buf.subarray(3 + uLen, 3 + uLen + pLen).toString('utf8');
          buf = buf.subarray(3 + uLen + pLen);
          if (aVer !== 0x01 || user !== requireAuth.username || pass !== requireAuth.password) {
            clientSock.write(Buffer.from([0x01, 0x01]));
            return closeClient();
          }
          authUser = user;
          stage = 'request';
          clientSock.write(Buffer.from([0x01, 0x00]));
        } else if (stage === 'request') {
          if (buf.length < 4) return;
          const ver = buf[0];
          const cmd = buf[1];
          const atyp = buf[3];
          if (ver !== 0x05 || cmd !== 0x01) {
            clientSock.write(Buffer.from([0x05, 0x07, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
            return closeClient();
          }
          let host = '';
          let headerLen = 0;
          if (atyp === 0x01) {
            if (buf.length < 10) return;
            host = `${buf[4]}.${buf[5]}.${buf[6]}.${buf[7]}`;
            headerLen = 10;
          } else if (atyp === 0x03) {
            if (buf.length < 5) return;
            const dLen = buf[4];
            if (buf.length < 5 + dLen + 2) return;
            host = buf.subarray(5, 5 + dLen).toString('utf8');
            headerLen = 5 + dLen + 2;
          } else if (atyp === 0x04) {
            if (buf.length < 22) return;
            host = '::1';
            headerLen = 22;
          } else {
            clientSock.write(Buffer.from([0x05, 0x08, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
            return closeClient();
          }
          const port = buf.readUInt16BE(headerLen - 2);
          const remainder = buf.subarray(headerLen);
          buf = Buffer.alloc(0);

          if (onConnectEvent) onConnectEvent({ atyp, host, port, authUser });

          const route = routeMap(host, port);
          if (!route) {
            clientSock.write(Buffer.from([0x05, 0x05, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
            return closeClient();
          }

          clientSock.removeListener('data', onData);
          if (route.mode === 'tls-peek') {
            clientSock.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 127, 0, 0, 1, 0, 0]));
            const handlePeek = (firstChunk) => {
              if (onTlsPeek) onTlsPeek(Buffer.from(firstChunk));
              closeClient();
            };
            if (remainder.length > 0) handlePeek(remainder);
            else clientSock.once('data', handlePeek);
            return;
          }

          const upstream = net.connect({ host: route.host, port: route.port }, () => {
            clientSock.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 127, 0, 0, 1, 0, 0]));
            if (remainder.length > 0) upstream.write(remainder);
            clientSock.pipe(upstream);
            upstream.pipe(clientSock);
          });
          track(upstream);
          upstream.on('error', () => {
            try {
              clientSock.write(Buffer.from([0x05, 0x05, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
            } catch {}
            closeClient();
          });
          clientSock.on('close', () => {
            if (!upstream.destroyed) upstream.destroy();
          });
          upstream.on('close', () => {
            if (!clientSock.destroyed) clientSock.destroy();
          });
          return;
        }
      }
    };

    clientSock.on('data', onData);
    clientSock.on('error', () => {});
  });

  return { server, activeSockets };
}

test('1) cdp.js: merges PR #20 nav-outline-trigger cleanup, excludes thought from RUNTIME_PARTS, and aligns Channel 5 queued/streaming timeouts', () => {
  const cdp = require(path.join(ROOT_DIR, 'cdp.js'));

  assert.equal(
    cdp.RUNTIME_PARTS.some((p) => p.includes('thought-translator')),
    false,
    'Channel 1 RUNTIME_PARTS must never contain any thought-translator file'
  );
  assert.ok(
    cdp.REMOVE_EXPRESSION.includes('.ag-cs-nav-outline-trigger'),
    'REMOVE_EXPRESSION must clean up PR #20 .ag-cs-nav-outline-trigger'
  );
  assert.ok(
    cdp.REMOVE_EXPRESSION.includes('[data-testid="prism-thought-general-config"]'),
    'REMOVE_EXPRESSION must clean up machine-mode companion config card'
  );
  assert.ok(
    cdp.THOUGHT_REMOVE_EXPRESSION.includes('[data-testid="prism-thought-general-config"]'),
    'THOUGHT_REMOVE_EXPRESSION must clean up machine-mode companion config card'
  );

  // Verify dynamic queue timeout & onChunk timeout refresh inside compiled Channel 1 Thought Bridge
  const scheduledTimeouts = [];
  const clearedIds = [];
  let timerIdSeq = 0;
  const bindingPayloads = [];
  const { sandbox } = createMockDomEnv({
    __agPrismThoughtCall: (jsonStr) => {
      bindingPayloads.push(JSON.parse(jsonStr));
    },
    setTimeout: (fn, ms) => {
      const id = ++timerIdSeq;
      scheduledTimeouts.push({ id, ms, fn });
      return id;
    },
    clearTimeout: (id) => {
      if (id) clearedIds.push(id);
    },
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    performance: { now: () => Date.now() },
  });

  // Extract ensureThoughtBridge via real buildInjectExpression
  const injectExpr = cdp.buildInjectExpression(cdp.DEFAULT_CONFIG);
  vm.runInNewContext(injectExpr, sandbox);
  const bridge = sandbox.window.__agPrismThoughtBridge;
  assert.ok(bridge && typeof bridge.translateStream === 'function', 'Channel 1 must mount __agPrismThoughtBridge');

  scheduledTimeouts.length = 0;
  clearedIds.length = 0;
  const partials = [];
  const p1 = bridge.translateStream({ text: 'Thought 1', mode: 'ai' }, (s) => partials.push(s));
  const p2 = bridge.translateStream({ text: 'Thought 2', mode: 'ai' }, () => {});
  const p3 = bridge.translateStream({ text: 'Thought 3', mode: 'ai' }, () => {});
  const p4 = bridge.translateStream({ text: 'Thought 4 (queued behind 3 slots)', mode: 'ai' }, () => {});

  const timeoutsFor4 = scheduledTimeouts.map((t) => t.ms);
  assert.ok(timeoutsFor4[0] >= 90000, `1st request timeout should be >= 90000ms, got ${timeoutsFor4[0]}`);
  assert.ok(
    timeoutsFor4[3] >= 120000,
    `4th queued request timeout must scale up (>= 120000ms) so MAX_CONCURRENCY=3 queue never falsely times out at 50s, got ${timeoutsFor4[3]}`
  );

  // Streaming chunk on req #1 must refresh timer (clear old timer & arm fresh 60s timer)
  const req1Id = bindingPayloads[0].id;
  const beforeChunkCount = scheduledTimeouts.length;
  bridge.onChunk(req1Id, '正在流式翻译…');
  assert.equal(partials[0], '正在流式翻译…');
  assert.ok(scheduledTimeouts.length > beforeChunkCount, 'onChunk progress must re-arm timeout timer');
  assert.equal(scheduledTimeouts[scheduledTimeouts.length - 1].ms, 60000, 'onChunk refresh timer should be 60000ms');

  bridge.dispose();
  assert.ok(p1 && p2 && p3 && p4);
});

test('2) Native Node SOCKS5/SOCKS5H tunnel: RFC 1928 no-auth, RFC 1929 auth + remote DNS, TLS-over-SOCKS5, credential redaction & zero socket leaks', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-socks5-e2e-'));
  const targetSockets = new Set();
  const seenTargetHeaders = [];

  const targetServer = http.createServer((req, res) => {
    seenTargetHeaders.push({ url: req.url, headers: { ...req.headers } });
    if (req.url === '/v1/models') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: [{ id: 'socks5-routed-model' }] }));
      return;
    }
    if (req.url === '/v1/chat/completions') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      res.write('data: {"choices":[{"delta":{"content":"SOCKS5 "}}]}\n\n');
      setTimeout(() => {
        if (!res.writableEnded) {
          res.write('data: {"choices":[{"delta":{"content":"流式成功"}}]}\n\n');
          res.write('data: [DONE]\n\n');
          res.end();
        }
      }, 15);
      return;
    }
    if (req.url === '/hang') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.write('wait');
      return;
    }
    res.writeHead(404);
    res.end('not found');
  });
  targetServer.on('connection', (s) => {
    targetSockets.add(s);
    s.once('close', () => targetSockets.delete(s));
  });
  await new Promise((r) => targetServer.listen(0, '127.0.0.1', r));
  const targetPort = targetServer.address().port;

  const noAuthConnects = [];
  const noAuthSocks = createMockSocks5Server({
    requireAuth: null,
    routeMap: (host) =>
      host === 'external.socks5-noauth.test' ? { host: '127.0.0.1', port: targetPort } : null,
    onConnectEvent: (e) => noAuthConnects.push(e),
  });
  await new Promise((r) => noAuthSocks.server.listen(0, '127.0.0.1', r));
  const noAuthPort = noAuthSocks.server.address().port;

  const secretUser = 'prismSocksUser';
  const secretPass = 'S3cr3t@Pass#99';
  const authConnects = [];
  const tlsHellos = [];
  const authSocks = createMockSocks5Server({
    requireAuth: { username: secretUser, password: secretPass },
    routeMap: (host) => {
      if (host === 'external.socks5-auth.test') return { host: '127.0.0.1', port: targetPort };
      if (host === 'external.socks5-tls.test') return { mode: 'tls-peek' };
      return null;
    },
    onConnectEvent: (e) => authConnects.push(e),
    onTlsPeek: (buf) => tlsHellos.push(buf),
  });
  await new Promise((r) => authSocks.server.listen(0, '127.0.0.1', r));
  const authPort = authSocks.server.address().port;

  try {
    // A) RFC 1928 no-auth SOCKS5 HTTP forwarding (no Proxy-Authorization leaked to target)
    const svcNoAuth = new ThoughtTranslatorService({ configDir: tmpDir, proxyEnv: {} });
    const saveNoAuth = svcNoAuth.saveConfig({
      customProxyUrl: `socks5://127.0.0.1:${noAuthPort}`,
      profiles: [{ id: 'default', name: 'S5', baseUrl: 'http://external.socks5-noauth.test/v1', apiKey: 'sk-s5-1', model: 'm1' }],
    });
    assert.equal(saveNoAuth.ok, true);
    const modelsRes = await svcNoAuth.fetchModels({});
    assert.equal(modelsRes.ok, true, `Expected SOCKS5 no-auth fetchModels ok, got ${modelsRes.error}`);
    assert.deepEqual(modelsRes.models, ['socks5-routed-model']);
    assert.equal(noAuthConnects[0].atyp, 0x03, 'Hostname must use ATYP=0x03 remote domain resolution');
    assert.equal(noAuthConnects[0].host, 'external.socks5-noauth.test');
    assert.equal(seenTargetHeaders[0].headers['proxy-authorization'], undefined, 'Must never leak Proxy-Authorization over SOCKS5');
    svcNoAuth.dispose();

    // B) RFC 1929 username/password auth SOCKS5H + SSE streaming + masked config round-trip
    const encodedPass = encodeURIComponent(secretPass);
    const rawAuthProxy = `socks5h://${secretUser}:${encodedPass}@127.0.0.1:${authPort}`;
    const svcAuth = new ThoughtTranslatorService({ configDir: tmpDir, proxyEnv: {} });
    const saveAuth = svcAuth.saveConfig({
      customProxyUrl: rawAuthProxy,
      profiles: [{ id: 'default', name: 'S5H', baseUrl: 'http://external.socks5-auth.test/v1', apiKey: 'sk-s5-2', model: 'm2' }],
    });
    assert.equal(saveAuth.ok, true);
    assert.equal(saveAuth.hasProxyCredentials, true);
    assert.equal(saveAuth.customProxyUrl.includes(secretPass), false, 'Sanitized config must never expose raw proxy password');
    assert.equal(saveAuth.customProxyUrl.includes(secretUser), false, 'Sanitized config must never expose raw proxy username');
    assert.ok(saveAuth.customProxyUrl.includes('••••@'), 'Sanitized config must return masked sentinel');

    // Saving back the masked sentinel must preserve real credentials seamlessly
    const roundTrip = svcAuth.saveConfig({ customProxyUrl: saveAuth.customProxyUrl });
    assert.equal(roundTrip.ok, true);
    assert.equal(roundTrip.hasProxyCredentials, true);

    const streamChunks = [];
    const trRes = await svcAuth.translateThought({
      text: 'Checking SOCKS5H authenticated streaming translation tunnel end to end.',
      mode: 'ai',
      onPartial: (p) => streamChunks.push(p),
    });
    assert.equal(trRes.ok, true, `Expected SOCKS5H SSE translation ok, got ${trRes.error}`);
    assert.equal(trRes.text, 'SOCKS5 流式成功');
    assert.equal(authConnects[0].authUser, secretUser);

    // C) TLS-over-SOCKS5H: verify real TLS ClientHello + SNI arrives inside authenticated SOCKS5 tunnel
    await assert.rejects(() =>
      svcAuth._request('https://external.socks5-tls.test/v1/models', { method: 'GET', redirect: 'error' })
    );
    assert.equal(tlsHellos.length, 1, 'Expected TLS ClientHello delivered inside SOCKS5H tunnel');
    assert.equal(tlsHellos[0][0], 0x16, 'First byte must be TLS Handshake record (0x16)');
    assert.equal(tlsHellos[0][1], 0x03, 'Second byte must be TLS version major (0x03)');
    assert.ok(
      tlsHellos[0].includes(Buffer.from('external.socks5-tls.test', 'ascii')),
      'TLS-over-SOCKS5 must send target domain in ClientHello SNI'
    );

    // D) AbortSignal cancels in-flight SOCKS5 tunnel cleanly (no leaked sockets)
    const ac = new AbortController();
    const hangPromise = svcAuth._request('http://external.socks5-auth.test/hang', {
      method: 'GET',
      signal: ac.signal,
    });
    setTimeout(() => ac.abort(), 30);
    const hangRes = await hangPromise.catch((e) => ({ aborted: true, msg: e.message }));
    if (hangRes && !hangRes.aborted && hangRes.text) {
      await assert.rejects(() => hangRes.text());
    }
    svcAuth.dispose();

    // E) Wrong SOCKS5 credentials fail cleanly AND redact username/password from all error text
    const badPass = 'WrongTopSecret777';
    const svcBadAuth = new ThoughtTranslatorService({ configDir: tmpDir, proxyEnv: {} });
    svcBadAuth.saveConfig({
      customProxyUrl: `socks5h://${secretUser}:${badPass}@127.0.0.1:${authPort}`,
      profiles: [{ id: 'default', name: 'Bad', baseUrl: 'http://external.socks5-auth.test/v1', apiKey: 'sk-s5-3', model: 'm3' }],
    });
    const badRes = await svcBadAuth.fetchModels({});
    assert.equal(badRes.ok, false);
    assert.match(badRes.error, /SOCKS5 authentication failed/i);
    assert.equal(badRes.error.includes(secretUser), false, 'Error must redact SOCKS5 username');
    assert.equal(badRes.error.includes(badPass), false, 'Error must redact SOCKS5 password');
    assert.equal(
      redactSecrets(`failed via socks5h://${secretUser}:${badPass}@127.0.0.1:1080`).includes(badPass),
      false,
      'redactSecrets must scrub socks5h:// userinfo'
    );
    svcBadAuth.dispose();

    // F) Strict proxy URL security validation (rejects CRLF, control chars, encoded CRLF, SSRF, bad ports/schemes)
    for (const badProxy of [
      'http://127.0.0.1:7890\r\nX-Injected: 1',
      'socks5://127.0.0.1:1080\n',
      'socks5://user%0d%0a:pass@127.0.0.1:1080',
      'ftp://127.0.0.1:21',
      'socks4://127.0.0.1:1080',
      'socks5://127.0.0.1:0',
      'socks5://127.0.0.1:70000',
      'socks5://169.254.169.254:1080',
      'socks5://metadata.google.internal:1080',
      `socks5://${'a'.repeat(260)}:pass@127.0.0.1:1080`,
    ]) {
      assert.equal(validateProxyUrl(badProxy).ok, false, `Must reject unsafe/malformed proxy: ${JSON.stringify(badProxy)}`);
      assert.equal(parseProxyUrl(badProxy), null);
    }

    // Allow sockets to finish closing cleanly
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(noAuthSocks.activeSockets.size, 0, 'No-auth SOCKS5 server must have 0 leaked sockets');
    assert.equal(authSocks.activeSockets.size, 0, 'Auth SOCKS5 server must have 0 leaked sockets');
  } finally {
    for (const s of [...targetSockets, ...noAuthSocks.activeSockets, ...authSocks.activeSockets]) {
      try { s.destroy(); } catch {}
    }
    await Promise.all([
      new Promise((r) => targetServer.close(r)),
      new Promise((r) => noAuthSocks.server.close(r)),
      new Promise((r) => authSocks.server.close(r)),
    ]);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('3) Custom proxy priority, proxyMode (auto/custom/direct), OS SOCKS5 detection, backward compat & instant proxy cache refresh', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-proxy-prio-'));
  try {
    // Legacy config without new fields loads cleanly with safe defaults
    const cfgPath = path.join(tmpDir, 'obsidian-prism-thought.json');
    fs.writeFileSync(
      cfgPath,
      JSON.stringify({
        version: 1,
        stylePreset: 'technical',
        activeProfileId: 'default',
        profiles: [{ id: 'default', name: 'Old', baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o-mini' }],
      }),
      'utf8'
    );

    let osProbeCalls = 0;
    const svc = new ThoughtTranslatorService({
      configDir: tmpDir,
      proxyEnv: { ALL_PROXY: 'socks5h://127.0.0.1:10800' },
      proxyPlatform: 'win32',
      proxyExecFileSync: () => {
        osProbeCalls++;
        return '    ProxyEnable    REG_DWORD    0x1\r\n    ProxyServer    REG_SZ    http=127.0.0.1:7890\r\n';
      },
    });

    const initial = svc.getSanitizedConfig();
    assert.equal(initial.customProxyUrl, '');
    assert.equal(initial.proxyMode, 'auto');
    assert.equal(initial.translateToolSummaries, false, 'translateToolSummaries must default to false');

    // Empty customProxyUrl -> follows ALL_PROXY socks5h env var
    const pEnv = svc._resolveProxyForUrl('https://translate.googleapis.com/translate_a/single');
    assert.equal(pEnv?.protocol, 'socks5h:');
    assert.equal(pEnv?.port, 10800);

    // Custom proxy takes priority over env + OS proxy
    const saveCustom = svc.saveConfig({ customProxyUrl: 'socks5://127.0.0.1:10888' });
    assert.equal(saveCustom.ok, true);
    const pCustom = svc._resolveProxyForUrl('https://translate.googleapis.com/translate_a/single');
    assert.equal(pCustom?.protocol, 'socks5:');
    assert.equal(pCustom?.port, 10888);

    // Loopback ALWAYS bypasses custom proxy (local Ollama/LM Studio safety)
    assert.equal(svc._resolveProxyForUrl('http://127.0.0.1:11434/v1/models'), null);
    assert.equal(svc._resolveProxyForUrl('http://localhost:11434/v1/models'), null);

    // proxyMode='direct' bypasses custom + env + OS proxy
    svc.saveConfig({ proxyMode: 'direct' });
    assert.equal(svc._resolveProxyForUrl('https://translate.googleapis.com/translate_a/single'), null);

    // Clearing customProxyUrl + switching to auto immediately invalidates 30s OS cache
    const svcOs = new ThoughtTranslatorService({
      configDir: tmpDir,
      proxyEnv: {},
      proxyPlatform: 'win32',
      proxyExecFileSync: () => {
        osProbeCalls++;
        return `    ProxyEnable    REG_DWORD    0x1\r\n    ProxyServer    REG_SZ    http=127.0.0.1:${7890 + osProbeCalls}\r\n`;
      },
    });
    svcOs.saveConfig({ proxyMode: 'auto', customProxyUrl: '' });
    const firstOs = svcOs._resolveProxyForUrl('https://translate.googleapis.com/translate_a/single');
    const cachedOs = svcOs._resolveProxyForUrl('https://translate.googleapis.com/translate_a/single');
    assert.equal(firstOs.port, cachedOs.port, 'OS proxy should be cached within 30s');
    const beforeSaveCalls = osProbeCalls;
    // Saving config invalidates 30s OS proxy cache immediately
    svcOs.saveConfig({ customProxyUrl: 'http://127.0.0.1:9999' });
    assert.equal(svcOs._resolveProxyForUrl('https://translate.googleapis.com/translate_a/single')?.port, 9999);
    svcOs.saveConfig({ customProxyUrl: '' });
    const refreshedOs = svcOs._resolveProxyForUrl('https://translate.googleapis.com/translate_a/single');
    assert.ok(osProbeCalls > beforeSaveCalls, 'saveConfig must immediately refresh OS proxy cache');
    assert.notEqual(refreshedOs.port, firstOs.port);

    // macOS scutil SOCKS-only detection & Windows socks-only detection
    const macSocksOnly = parseMacScutilProxyOutput(
      '<dictionary> {\n  HTTPEnable : 0\n  HTTPSEnable : 0\n  SOCKSEnable : 1\n  SOCKSProxy : 127.0.0.1\n  SOCKSPort : 6154\n}\n'
    );
    assert.equal(macSocksOnly.enabled, true);
    assert.equal(macSocksOnly.socks?.protocol, 'socks5h:');
    assert.equal(macSocksOnly.socks?.port, 6154);
    const resolvedMac = resolveSystemProxy('https://translate.googleapis.com/translate_a/single', {
      env: {},
      osConfig: macSocksOnly,
    });
    assert.equal(resolvedMac?.protocol, 'socks5h:');
    assert.equal(resolvedMac?.port, 6154);

    const winSocksOnly = parseWindowsRegProxyOutput(
      '    ProxyEnable    REG_DWORD    0x1\r\n    ProxyServer    REG_SZ    socks=127.0.0.1:1080\r\n'
    );
    const resolvedWin = resolveSystemProxy('https://api.openai.com/v1/models', {
      env: {},
      osConfig: winSocksOnly,
    });
    assert.equal(resolvedWin?.protocol, 'socks5h:');
    assert.equal(resolvedWin?.port, 1080);

    // Invalid customProxyUrl rejected cleanly without corrupting existing saved config
    const badSave = svc.saveConfig({ customProxyUrl: 'http://127.0.0.1:7890\r\nBad: 1' });
    assert.equal(badSave.ok, false);
    assert.match(badSave.error, /control characters|Invalid proxy/i);

    assert.equal(maskProxyUrl('socks5h://bob:pw123@127.0.0.1:1080'), 'socks5h://••••@127.0.0.1:1080');
    svc.dispose();
    svcOs.dispose();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('4) Issue #27 five root-cause regressions: streaming wakeup without flags.l, quiet-gate flicker rescue, fine quickPanelStamp, >48k chunking/notice, and cooldown trigger-badge retry', async () => {
  const clientSrc = fs.readFileSync(path.join(ROOT_DIR, 'vendor', 'thought-translator', 'thought-client.js'), 'utf8');

  // A) Backend >48k oversized thought language check & safe chunked translation (never silently skipped!)
  const oversizedText = Array.from({ length: 650 }, (_, i) =>
    `Paragraph ${i}: Investigating performance bottlenecks in the asynchronous proxy scheduler and verifying boundary conditions.`
  ).join('\n\n');
  assert.ok(oversizedText.length > 52000, `Expected >52k chars, got ${oversizedText.length}`);
  assert.equal(isAlreadyTargetLang(oversizedText, 'zh-CN'), false, '>48k English thought must NOT be falsely treated as already target language');
  const split = splitOversizedThought(oversizedText, 48000, 96000);
  assert.ok(split.chunks.length >= 2, 'Oversized >48k thought must split into safe chunks at paragraph boundaries');
  assert.equal(split.truncated, false);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-oversize-'));
  let gtxBatches = 0;
  const mockSvc = new ThoughtTranslatorService({
    configDir: tmpDir,
    fetchImpl: async (url) => {
      gtxBatches++;
      const q = new URL(String(url)).searchParams.get('q') || '';
      return new Response(JSON.stringify([[[`译:${q.slice(0, 24)}`, q]]]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });
  const bigRes = await mockSvc.translateThought({ text: oversizedText, mode: 'machine', targetLang: 'zh-CN' });
  assert.equal(bigRes.ok, true);
  assert.equal(bigRes.skipped, undefined, 'Oversized thought must NOT be silently skipped');
  assert.ok(gtxBatches >= 1);
  assert.ok(bigRes.text.includes('译:'));
  mockSvc.dispose();
  fs.rmSync(tmpDir, { recursive: true, force: true });

  // B) Frontend 5 root-cause E2E tests in mock DOM
  const translateCalls = [];
  let forceNextFail = null;
  const { doc, docEl, rootBody, sandbox } = createMockDomEnv({
    __agPrismThoughtBridge: {
      call: async ({ action }) =>
        action === 'get-cache' ? { ok: true, stylePreset: 'technical', translateToolSummaries: false, entries: {} } : { ok: true },
      translateStream: async (opts, onPartial) => {
        translateCalls.push({ ...opts });
        if (forceNextFail) {
          const errObj = forceNextFail;
          forceNextFail = null;
          return errObj;
        }
        const out = `已译(${opts.text.length}): ${opts.text.slice(0, 32)}`;
        if (onPartial) onPartial(out);
        return { ok: true, text: out, engine: opts.mode === 'machine' ? 'machine' : 'ai' };
      },
      cancelTranslate: async () => ({ ok: true }),
    },
  });
  docEl.setAttribute('data-ag-cs-lang', 'zh-CN');
  docEl.setAttribute('data-ag-cs-motion', 'off');
  vm.runInNewContext(clientSrc, sandbox);
  const api = sandbox.__agPrismThought;

  try {
    api.sync({ thoughtTranslate: 'machine', thoughtTrigger: 'expand' });
    await new Promise((r) => setTimeout(r, 40));

    // RC-1: Streaming ends via shimmer removal + text change WITHOUT anyone calling api.scan()
    const btn1 = doc.createElement('button', { 'data-testid': 'thinking-collapsible-trigger', 'aria-expanded': 'true' });
    const shimmer = doc.createElement('span', { class: 'animate-shimmer-text' });
    shimmer.textContent = 'Thinking';
    btn1.appendChild(shimmer);
    const panel1 = doc.createElement('div');
    const p1 = doc.createElement('p');
    p1.textContent = 'Analyzing streaming completion wakeup without structural childList addition.';
    panel1.appendChild(p1);
    rootBody.appendChild(btn1);
    rootBody.appendChild(panel1);

    api.scanImmediate();
    assert.equal(panel1.getAttribute('data-op-zh-pending'), '1', 'Streaming panel should show pending state');

    // Simulate host sleeping/hidden (0 polling while hidden), then waking + finishing shimmer without calling api.scan()
    doc.hidden = true;
    doc.visibilityState = 'hidden';
    doc.dispatchDocEvent('visibilitychange');
    doc.hidden = false;
    doc.visibilityState = 'visible';
    shimmer.classList.remove('animate-shimmer-text');
    shimmer.textContent = 'Thought for 4s';
    doc.dispatchDocEvent('visibilitychange');

    // Wait for streaming watcher + FINISH_GATE (450ms) + QUIET_GATE (900ms)
    await new Promise((r) => setTimeout(r, 1200));
    assert.equal(panel1.getAttribute('data-op-zh-ready'), '1', 'RC-1: Must auto-wake and translate after shimmer removal without external scan()');

    // RC-3a: Fine quickPanelStamp catches middle paragraph change (same length & last char)
    const btn2 = doc.createElement('button', { 'data-testid': 'thinking-collapsible-trigger', 'aria-expanded': 'true' });
    btn2.textContent = 'Thought for 2s';
    const panel2 = doc.createElement('div');
    const mp1 = doc.createElement('p');
    mp1.textContent = 'First unchanged paragraph stays identical.';
    const mp2 = doc.createElement('p');
    mp2.textContent = 'Middle English alpha reasoning step one.';
    const mp3 = doc.createElement('p');
    mp3.textContent = 'Final unchanged paragraph stays identical.';
    panel2.appendChild(mp1);
    panel2.appendChild(mp2);
    panel2.appendChild(mp3);
    rootBody.appendChild(btn2);
    rootBody.appendChild(panel2);

    api.scanImmediate();
    await new Promise((r) => setTimeout(r, 120));
    assert.equal(panel2.getAttribute('data-op-zh-ready'), '1');
    const prevCalls = translateCalls.length;
    // Mutate ONLY middle paragraph to exact same length and same last char '.'
    mp2.textContent = 'Middle English bravo reasoning step two.';
    assert.equal(mp2.textContent.length, 'Middle English alpha reasoning step one.'.length);
    api.scanImmediate();
    await new Promise((r) => setTimeout(r, 1050));
    assert.ok(translateCalls.length > prevCalls, 'RC-3a: Fine quickPanelStamp must detect middle paragraph edits of equal length');

    // RC-2: Quiet-gate transient aria-expanded flicker rescues panel instead of silently abandoning
    const btn3 = doc.createElement('button', { 'data-testid': 'thinking-collapsible-trigger', 'aria-expanded': 'true' });
    btn3.textContent = 'Thought for 3s';
    const panel3 = doc.createElement('div');
    const fp = doc.createElement('p');
    fp.textContent = 'Initial draft English sentence to enter quiet gate.';
    panel3.appendChild(fp);
    rootBody.appendChild(btn3);
    rootBody.appendChild(panel3);
    api.scanImmediate();
    await new Promise((r) => setTimeout(r, 80));
    // Trigger quiet gate via content update
    fp.textContent = 'Updated final English sentence waiting through quiet gate flicker.';
    api.scanImmediate();
    // Brief React flicker: aria-expanded drops to false right around timer firing, then returns to true within 80ms
    setTimeout(() => btn3.setAttribute('aria-expanded', 'false'), 880);
    setTimeout(() => btn3.setAttribute('aria-expanded', 'true'), 970);
    await new Promise((r) => setTimeout(r, 1250));
    assert.ok(
      panel3.querySelector('.ag-prism-thought-body')?.textContent.includes('Updated final English'),
      'RC-2: Transient aria-expanded flicker during QUIET_GATE_MS must be rescued and translated'
    );

    // RC-3b: >48k oversized block translates safely and mounts truncation badge instead of silent skip
    const btnBig = doc.createElement('button', { 'data-testid': 'thinking-collapsible-trigger', 'aria-expanded': 'true' });
    btnBig.textContent = 'Thought for 9s';
    const panelBig = doc.createElement('div');
    const pBig = doc.createElement('p');
    pBig.textContent = oversizedText;
    panelBig.appendChild(pBig);
    rootBody.appendChild(btnBig);
    rootBody.appendChild(panelBig);
    api.scanImmediate();
    await new Promise((r) => setTimeout(r, 120));
    assert.equal(panelBig.getAttribute('data-op-zh-ready'), '1', 'RC-3b: >48k thought block must translate instead of silent skip');
    const truncBadge = panelBig.querySelector('[data-testid="thought-truncated-badge"]');
    assert.ok(truncBadge && !truncBadge.hidden, 'RC-3b: >48k thought block must display clear truncation notice badge');
    assert.equal(truncBadge.getAttribute('translate'), 'no', 'Truncation badge must have anti-translation attrs');

    // RC-4 & RC-5: Proxy failure shows localized error reason + trigger header status badge; clicking badge clears cooldown & retries immediately!
    forceNextFail = {
      ok: false,
      error: 'SOCKS5 CONNECT rejected via socks5h://secretUser:secretPass@127.0.0.1:1080',
    };
    const btnFail = doc.createElement('button', { 'data-testid': 'thinking-collapsible-trigger', 'aria-expanded': 'true' });
    btnFail.textContent = 'Thought for 5s';
    const panelFail = doc.createElement('div');
    const pFail = doc.createElement('p');
    pFail.textContent = 'Evaluating proxy unreachable failure badge and manual cooldown bypass retry flow.';
    panelFail.appendChild(pFail);
    rootBody.appendChild(btnFail);
    rootBody.appendChild(panelFail);

    api.scanImmediate();
    await new Promise((r) => setTimeout(r, 120));
    assert.equal(panelFail.getAttribute('data-op-zh-failed'), '1');
    const errBar = panelFail.querySelector('.ag-prism-thought-error-bar');
    assert.ok(errBar && errBar.textContent.includes('代理'), 'Error bar should classify proxy failure clearly');
    assert.equal(errBar.title.includes('secretPass'), false, 'Error tooltip must redact proxy credentials');

    const trigBadge = btnFail.querySelector('[data-testid="thought-trigger-status-badge"]');
    assert.ok(trigBadge, 'Failed/cooldown block must mount lightweight status badge on trigger header');
    assert.equal(trigBadge.getAttribute('data-fail-reason'), 'proxy');
    assert.equal(trigBadge.getAttribute('translate'), 'no', 'Trigger status badge must carry anti-translation attrs');
    assert.equal(btnFail.getAttribute('translate'), null, 'Host trigger button itself must NEVER receive anti-translation attrs');

    // Clicking trigger status badge bypasses cooldown immediately and recovers translation
    trigBadge.click();
    await new Promise((r) => setTimeout(r, 120));
    assert.equal(panelFail.getAttribute('data-op-zh-ready'), '1', 'Manual click on trigger status badge must bypass cooldown & succeed');
    assert.equal(btnFail.querySelector('[data-testid="thought-trigger-status-badge"]'), null, 'Trigger status badge must clear after recovery');
  } finally {
    api.destroy();
  }
});

test('5) Issue #27 tool execution summaries: default OFF, merged single batch request, strict identifier protection, fail-closed integrity, and instant lossless restore on OFF', async () => {
  // A) Identifier protection & restoration unit checks
  const sample1 = 'Read A1_R1.log #L1-38 with --tail (Exited with code 0)';
  const p1 = protectToolSummaryIdentifiers(sample1);
  assert.ok(p1.tokens.includes('A1_R1.log'));
  assert.ok(p1.tokens.includes('#L1-38'));
  assert.ok(p1.tokens.includes('--tail'));
  assert.ok(p1.tokens.includes('Exited with code 0'));
  assert.equal(p1.masked.includes('A1_R1.log'), false);
  const r1 = restoreToolSummaryIdentifiers(
    p1.masked.replace('Read', '读取').replace('with', '使用'),
    p1.tokens
  );
  assert.equal(r1.ok, true);
  assert.ok(r1.text.includes('A1_R1.log') && r1.text.includes('#L1-38') && r1.text.includes('--tail') && r1.text.includes('Exited with code 0'));

  const sample2 = 'Inspect experiment plan xlsx and `git status --short` in vendor/thought-translator/thought-client.js#L1-38';
  const p2 = protectToolSummaryIdentifiers(sample2);
  assert.ok(p2.tokens.some((t) => t.toLowerCase() === 'xlsx'));
  assert.ok(p2.tokens.includes('`git status --short`'));
  assert.ok(p2.tokens.includes('vendor/thought-translator/thought-client.js#L1-38'));

  // Fail-closed check: corrupted/missing placeholder must fail restoration instead of mangling filename
  const corrupted = restoreToolSummaryIdentifiers('读取 被损坏的文本', p1.tokens);
  assert.equal(corrupted.ok, false);
  assert.ok(corrupted.missing.length > 0);

  // Pure identifier/exit-code lines are NOT translatable
  assert.equal(isToolSummaryTranslatable('A1_R1.log #L1-38', 'zh-CN'), false);
  assert.equal(isToolSummaryTranslatable('Exited with code 0', 'zh-CN'), false);
  assert.equal(isToolSummaryTranslatable('已运行 list workspace root directory', 'zh-CN'), true);
  assert.equal(isToolSummaryTranslatable('List key project directories finished', 'zh-CN'), true);

  // B) Backend + Frontend E2E merged batch translation + default OFF + lossless restore
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-tool-sum-'));
  let gtxCalls = 0;
  const svc = new ThoughtTranslatorService({
    configDir: tmpDir,
    fetchImpl: async (url) => {
      gtxCalls++;
      const q = new URL(String(url)).searchParams.get('q') || '';
      const out = q
        .replace(/list workspace root directory/gi, '列出工作区根目录')
        .replace(/List key project directories finished/gi, '列出关键项目目录 已完成')
        .replace(/\bRead\b/g, '读取')
        .replace(/\bwith\b/g, '使用')
        .replace(/Inspect experiment plan/gi, '检查实验计划');
      return new Response(JSON.stringify([[[out, q]]]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });

  // Verify fail-closed on backend when upstream drops a placeholder
  const svcCorrupt = new ThoughtTranslatorService({
    configDir: tmpDir,
    fetchImpl: async () =>
      new Response(JSON.stringify([[['[0] 读取 被破坏的占位符', '']]]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  });
  const corruptRes = await svcCorrupt.translateToolSummariesBatch({
    items: ['Read A1_R1.log #L1-38'],
    mode: 'machine',
    targetLang: 'zh-CN',
  });
  assert.equal(corruptRes.ok, true);
  assert.equal(corruptRes.items[0], 'Read A1_R1.log #L1-38', 'Dropped placeholder must fail-closed to exact raw text');
  svcCorrupt.dispose();

  const clientSrc = fs.readFileSync(path.join(ROOT_DIR, 'vendor', 'thought-translator', 'thought-client.js'), 'utf8');
  const batchRpcCalls = [];
  const { doc, docEl, rootBody, sandbox } = createMockDomEnv({
    __agPrismThoughtBridge: {
      call: async ({ action, ...rest }) => {
        if (action === 'get-cache') return svc.getWarmCacheSnapshot();
        if (action === 'get-config') return svc.getSanitizedConfig();
        if (action === 'save-config') return svc.saveConfig(rest);
        return { ok: true };
      },
      translateStream: async (opts) => {
        if (String(opts.mode || '').startsWith('tool-batch:')) batchRpcCalls.push(opts);
        return svc.translateThought(opts);
      },
      cancelTranslate: async () => ({ ok: true }),
    },
  });
  docEl.setAttribute('data-ag-cs-lang', 'zh-CN');
  vm.runInNewContext(clientSrc, sandbox);
  const api = sandbox.__agPrismThought;

  try {
    // Build realistic "正在探索" tool-group DOM
    const toolTrig = doc.createElement('button', { 'data-testid': 'tool-group-collapsible', 'aria-expanded': 'true' });
    toolTrig.textContent = '正在探索';
    const toolPanel = doc.createElement('div');
    const origRows = [
      '已运行 list workspace root directory',
      'List key project directories finished',
      'Read A1_R1.log #L1-38 with --tail (Exited with code 0)',
      'Inspect experiment plan xlsx',
    ];
    const rowSpans = origRows.map((txt) => {
      const row = doc.createElement('div', { class: 'flex flex-row' });
      const sp = doc.createElement('span');
      sp.textContent = txt;
      row.appendChild(sp);
      toolPanel.appendChild(row);
      return sp;
    });
    // Also include a file link inside the container that MUST stay untouched
    const fileAnchor = doc.createElement('a', { href: 'file:///workspace/A1_R1.log' });
    fileAnchor.textContent = 'A1_R1.log';
    toolPanel.appendChild(fileAnchor);

    rootBody.appendChild(toolTrig);
    rootBody.appendChild(toolPanel);

    // 1) Default OFF: 0 tool-batch RPC calls, all rows remain original
    api.sync({ thoughtTranslate: 'machine', thoughtTrigger: 'expand' });
    api.scanImmediate();
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(api.getTranslateToolSummaries(), false, 'translateToolSummaries must default to false');
    assert.equal(batchRpcCalls.length, 0, 'Default OFF must send 0 tool-summary batch requests');
    assert.deepEqual(rowSpans.map((s) => s.textContent), origRows);

    // 2) Turn ON: all 4 rows merge into ONE single batch RPC call & preserve every technical identifier!
    api.setTranslateToolSummaries(true);
    api.scanImmediate();
    await new Promise((r) => setTimeout(r, 120));
    assert.equal(batchRpcCalls.length, 1, 'All 4 tool summary rows in one container must merge into 1 single batch request');
    assert.equal(gtxCalls, 1, 'Single merged batch must perform only 1 upstream GTX request');
    assert.equal(rowSpans[0].textContent, '已运行 列出工作区根目录');
    assert.equal(rowSpans[1].textContent, '列出关键项目目录 已完成');
    assert.ok(
      rowSpans[2].textContent.includes('读取') &&
        rowSpans[2].textContent.includes('A1_R1.log') &&
        rowSpans[2].textContent.includes('#L1-38') &&
        rowSpans[2].textContent.includes('--tail') &&
        rowSpans[2].textContent.includes('Exited with code 0'),
      `Identifiers must stay intact in translated tool row, got: ${rowSpans[2].textContent}`
    );
    assert.ok(
      rowSpans[3].textContent.includes('检查实验计划') && rowSpans[3].textContent.includes('xlsx'),
      `xlsx extension must stay intact, got: ${rowSpans[3].textContent}`
    );
    assert.equal(fileAnchor.textContent, 'A1_R1.log', 'Native file anchor must remain completely untouched');

    // 3) Turn OFF: instant lossless restoration of all 4 rows!
    api.setTranslateToolSummaries(false);
    assert.deepEqual(
      rowSpans.map((s) => s.textContent),
      origRows,
      'Turning translateToolSummaries off must immediately and losslessly restore exact raw text'
    );
  } finally {
    api.destroy();
    svc.dispose();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('6) thought-settings-ui.js: custom proxy URL live validation, 8-locale sync + yue migration, tool-summaries default-off toggle, and machine-mode companion card', async () => {
  const settingsUiSrc = fs.readFileSync(
    path.join(ROOT_DIR, 'vendor', 'thought-translator', 'thought-settings-ui.js'),
    'utf8'
  );

  const savedPayloads = [];
  let toolSumState = false;
  const { doc, docEl, rootBody, sandbox } = createMockDomEnv({
    __agPrismThoughtBridge: {
      call: async () => ({ ok: true }),
      cacheStats: async () => ({ ok: true, entries: 0 }),
    },
    __agPrismThought: {
      getViewMode: () => 'immersive',
      setViewMode: () => {},
      getLocalCacheStats: () => ({ memEntries: 0 }),
      setTranslateToolSummaries: (v) => {
        toolSumState = Boolean(v);
      },
      getConfig: async () => ({
        ok: true,
        stylePreset: 'technical',
        viewMode: 'immersive',
        proxyMode: 'auto',
        customProxyUrl: '',
        hasProxyCredentials: false,
        translateToolSummaries: false,
        activeProfileId: 'default',
        profiles: [{ id: 'default', name: 'Primary', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', hasApiKey: false }],
      }),
      saveConfig: async (payload) => {
        savedPayloads.push(payload);
        return {
          ok: true,
          stylePreset: payload.stylePreset || 'technical',
          viewMode: payload.viewMode || 'immersive',
          proxyMode: payload.proxyMode || 'auto',
          customProxyUrl: payload.customProxyUrl || '',
          hasProxyCredentials: false,
          translateToolSummaries: Boolean(payload.translateToolSummaries),
          activeProfileId: 'default',
          profiles: [{ id: 'default', name: 'Primary', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', hasApiKey: false }],
        };
      },
      scan: () => {},
    },
  });

  docEl.setAttribute('data-ag-cs-lang', 'zh-CN');
  vm.runInNewContext(settingsUiSrc, sandbox);
  const hostCard = doc.createElement('div', { class: 'ag-cs-settings-card' });
  rootBody.appendChild(hostCard);

  const uiHandle = sandbox.__agPrismThoughtSettingsUi.createThoughtAiConfigBox({
    mkEl: (tag, cls) => {
      const e = doc.createElement(tag);
      if (cls) e.className = cls;
      return e;
    },
    btnClass: 'seg-btn',
    ui: {},
    getMode: () => 'ai',
    runGuardedMut: (fn) => fn(),
  });
  hostCard.appendChild(uiHandle.box);
  await new Promise((r) => setTimeout(r, 20));

  const proxyInput = uiHandle.box.querySelector('[data-testid="thought-custom-proxy-url"]');
  const proxyHint = uiHandle.box.querySelector('[data-testid="thought-custom-proxy-hint"]');
  const saveBtn = uiHandle.box.querySelector('[data-testid="thought-save-btn"]');
  const toolToggle = uiHandle.box.querySelector('[data-testid="thought-tool-summaries-toggle"]');
  assert.ok(proxyInput && proxyHint && saveBtn && toolToggle);

  // Default OFF for tool summaries toggle
  assert.equal(toolToggle.getAttribute('aria-checked'), 'false');
  toolToggle.click();
  assert.equal(toolToggle.getAttribute('aria-checked'), 'true');
  assert.equal(toolSumState, true);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(savedPayloads.some((p) => p.translateToolSummaries === true), true);

  // Real-time proxy URL validation: invalid blocks save, valid SOCKS5H saves
  const prevSaveCount = savedPayloads.length;
  proxyInput.value = 'ftp://invalid-scheme:21';
  proxyInput.dispatch('input');
  assert.equal(proxyHint.getAttribute('data-state'), 'err');
  saveBtn.click();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(savedPayloads.length, prevSaveCount, 'Invalid proxy URL must block save');

  proxyInput.value = 'socks5h://127.0.0.1:1080';
  proxyInput.dispatch('input');
  assert.equal(proxyHint.getAttribute('data-state'), 'ok');
  saveBtn.click();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(savedPayloads[savedPayloads.length - 1].customProxyUrl, 'socks5h://127.0.0.1:1080');

  // 8-locale sync check + yue->zh-CN migration
  for (const [loc, expectProxyWord] of [
    ['zh-CN', '自定义代理地址'],
    ['zh-TW', '自訂代理位址'],
    ['yue', '自定义代理地址'],
    ['en', 'Custom Proxy URL'],
    ['ja', 'カスタムプロキシ URL'],
    ['ko', '사용자 프록시 URL'],
    ['es', 'URL de proxy personalizada'],
    ['fr', 'URL de proxy personnalisée'],
    ['de', 'Eigene Proxy-URL'],
  ]) {
    docEl.setAttribute('data-ag-cs-lang', loc);
    uiHandle.onLanguageChanged(loc);
    assert.ok(
      uiHandle.box.textContent.includes(expectProxyWord),
      `Locale ${loc} must render proxy label "${expectProxyWord}"`
    );
  }

  // Machine mode keeps prism-thought-ai-config hidden while surfacing companion card with 5+1 anti-translation attrs
  uiHandle.onModeSwitched('machine');
  assert.equal(uiHandle.box.hidden, true, 'AI config box must remain hidden in machine mode');
  const genCard = hostCard.querySelector('[data-testid="prism-thought-general-config"]');
  assert.ok(genCard && !genCard.hidden, 'Machine mode must mount visible general config card for proxy & tool summaries');
  assert.equal(genCard.getAttribute('translate'), 'no');
  assert.equal(genCard.getAttribute('data-ag-no-i18n'), '');
  assert.ok(genCard.querySelector('[data-testid="thought-custom-proxy-url"]'));
  assert.ok(genCard.querySelector('[data-testid="thought-tool-summaries-toggle"]'));

  // Switch back to AI -> companion card removes cleanly and controls move back into AI box
  uiHandle.onModeSwitched('ai');
  assert.equal(uiHandle.box.hidden, false);
  assert.equal(hostCard.querySelector('[data-testid="prism-thought-general-config"]'), null);
  assert.ok(uiHandle.box.querySelector('[data-testid="thought-custom-proxy-url"]'));
});

test('7) Workspace cleanliness: zero .bundle-cache.json leftover in repository root', () => {
  assert.equal(
    fs.existsSync(path.join(ROOT_DIR, '.bundle-cache.json')),
    false,
    'Repository root must not contain leftover .bundle-cache.json'
  );
});

test('8) Red-team #192 [P0-2]: tool-batch rejects >64KB payload, flattens newlines/escapes [N], rejects duplicate idx & removes single-item unnumbered blind accept', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-rt-p02-'));
  try {
    const capturedQueries = [];
    const svc = new ThoughtTranslatorService({
      configDir: tmpDir,
      fetchImpl: async (url) => {
        const q = new URL(String(url)).searchParams.get('q') || '';
        capturedQueries.push(q);
        const out = q
          .replace(/Check build status/gi, '检查构建状态')
          .replace(/Read audit log/gi, '读取审计日志')
          .replace(/forged/gi, '伪造内容');
        return new Response(JSON.stringify([[[out, q]]]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });

    // A) >65536 payload rejected BEFORE JSON.parse
    const hugePayload = JSON.stringify({ v: 1, items: ['A'.repeat(70000)] });
    assert.ok(hugePayload.length > 65536);
    const hugeRes = await svc.translateThought({ text: hugePayload, mode: 'tool-batch:machine', targetLang: 'zh-CN' });
    assert.equal(hugeRes.ok, false);
    assert.match(hugeRes.error, /too large/i);
    assert.equal(capturedQueries.length, 0);

    // B) Newline + [0] injection inside item[1] must be flattened & escaped so item[0] is never spoofed,
    //    and legitimate [0] token restores losslessly
    const injRes = await svc.translateToolSummariesBatch({
      items: ['Check build status', 'Read audit log\r\n[0] forged'],
      mode: 'machine',
      targetLang: 'zh-CN',
    });
    assert.equal(injRes.ok, true);
    assert.equal(capturedQueries.length, 1);
    const sentLines = capturedQueries[0].split('\n');
    assert.equal(sentLines.length, 2, 'Newlines inside items must be flattened so no forged numbered line is created');
    assert.equal(/\[0\]/.test(sentLines[1].replace(/^\[1\]\s*/, '')), false, 'Inner [0] must be escaped before upstream');
    assert.equal(injRes.items[0], '检查构建状态', 'item[0] must not be spoofed by item[1]');
    assert.ok(injRes.items[1].includes('[0]') && injRes.items[1].includes('读取审计日志'), 'Legitimate [0] restores losslessly');
    svc.dispose();

    // C) Duplicate idx in upstream response is treated as protocol poisoning -> blanked, falls back to raw, never cached
    const dupSvc = new ThoughtTranslatorService({
      configDir: tmpDir,
      fetchImpl: async () =>
        new Response(JSON.stringify([[['[0] 合法首译\n[0] 伪造覆盖译文\n[1] 正常第二条', '']]]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    });
    const dupRes = await dupSvc.translateToolSummariesBatch({
      items: ['Check first clean summary', 'Inspect second clean summary'],
      mode: 'machine',
      targetLang: 'zh-CN',
      force: true,
    });
    assert.equal(dupRes.ok, true);
    assert.equal(dupRes.details[0].translated, false, 'Duplicate [0] must be treated as poisoned and fall back to raw');
    assert.equal(dupRes.items[0], 'Check first clean summary');
    assert.equal(dupRes.details[1].translated, true);
    assert.equal(dupRes.items[1], '正常第二条');
    assert.equal(
      Array.from(dupSvc.memCache.values()).some((v) => v.includes('伪造覆盖译文') || v.includes('合法首译')),
      false,
      'Poisoned duplicate idx must never be persisted to memCache'
    );

    // Direct unit check on _parseNumberedBatchLines (2x and 3x duplicates + expectedCount===1 unnumbered refusal)
    assert.deepEqual(
      dupSvc._parseNumberedBatchLines('[0] a\n[0] b\n[0] c\n[1] ok', 2),
      ['', 'ok'],
      'Triple duplicate idx must remain blanked'
    );
    assert.deepEqual(
      dupSvc._parseNumberedBatchLines('Sorry, I cannot translate that request.', 1),
      [''],
      'expectedCount === 1 without [0] prefix must NEVER be blindly accepted'
    );
    assert.deepEqual(dupSvc._parseNumberedBatchLines('[0] 正常单条译文', 1), ['正常单条译文']);

    // D) Single-item unnumbered AI refusal falls back to raw & is never cached
    const refuseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-rt-p02-refuse-'));
    const aiRefuseSvc = new ThoughtTranslatorService({
      configDir: refuseDir,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({ choices: [{ message: { content: 'Rate limit exceeded, please retry later.' } }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        ),
    });
    aiRefuseSvc.saveConfig({
      profiles: [{ id: 'default', name: 'AI', baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-test-1', model: 'gpt-4o-mini' }],
    });
    const refuseRes = await aiRefuseSvc.translateToolSummariesBatch({
      items: ['Check project workspace layout'],
      mode: 'ai',
      targetLang: 'zh-CN',
      force: true,
    });
    assert.equal(refuseRes.ok, true);
    assert.equal(refuseRes.details[0].translated, false);
    assert.equal(refuseRes.items[0], 'Check project workspace layout');
    assert.equal(aiRefuseSvc.memCache.size, 0, 'Unnumbered refusal must not poison cache');
    dupSvc.dispose();
    aiRefuseSvc.dispose();
    fs.rmSync(refuseDir, { recursive: true, force: true });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('9) Red-team #192 [P1-1 & P2-3 UI]: proxyMode=auto ignores customProxyUrl, mask mismatch rejected consistently, auto-switch custom on input, and unloaded save/test guard', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-rt-p11-'));
  try {
    // A) Legacy config with non-empty customProxyUrl and missing proxyMode normalizes to 'custom'
    const cfgFile = path.join(tmpDir, 'obsidian-prism-thought.json');
    fs.writeFileSync(
      cfgFile,
      JSON.stringify({
        version: 1,
        customProxyUrl: 'socks5://alice:secretPw@127.0.0.1:1080',
        profiles: [{ id: 'default', name: 'P', baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-1', model: 'm1' }],
      }),
      'utf8'
    );
    const svc = new ThoughtTranslatorService({
      configDir: tmpDir,
      proxyEnv: { HTTPS_PROXY: 'http://127.0.0.1:7890' },
    });
    const loadedCfg = svc.getSanitizedConfig();
    assert.equal(loadedCfg.proxyMode, 'custom', '_normalizeStore must infer proxyMode=custom when customProxyUrl is set without proxyMode');
    assert.equal(svc._resolveProxyForUrl('https://api.openai.com/v1/models')?.port, 1080);

    // B) Switching to proxyMode='auto' while keeping customProxyUrl must follow env/OS proxy, NOT customProxyUrl!
    const autoSaved = svc.saveConfig({ proxyMode: 'auto', customProxyUrl: loadedCfg.customProxyUrl });
    assert.equal(autoSaved.ok, true);
    assert.equal(autoSaved.proxyMode, 'auto');
    const autoResolved = svc._resolveProxyForUrl('https://api.openai.com/v1/models');
    assert.equal(autoResolved?.protocol, 'http:');
    assert.equal(autoResolved?.port, 7890, 'proxyMode=auto must NOT be hijacked by saved customProxyUrl');

    // Explicit one-shot override without proxyMode still uses customProxyUrl; with proxyMode='auto' ignores it
    const oneshot = svc._resolveProxyForUrl('https://api.openai.com/v1/models', {
      customProxyUrl: 'http://127.0.0.1:9191',
    });
    assert.equal(oneshot?.port, 9191);
    const oneshotAuto = svc._resolveProxyForUrl('https://api.openai.com/v1/models', {
      proxyMode: 'auto',
      customProxyUrl: 'http://127.0.0.1:9191',
    });
    assert.equal(oneshotAuto?.port, 7890);

    // C) Mutated masked proxy URL (e.g. changing port :1080 -> :1081 while keeping ••••) is rejected everywhere
    const mutatedMask = 'socks5://••••@127.0.0.1:1081';
    assert.equal(svc.saveConfig({ proxyMode: 'custom', customProxyUrl: mutatedMask }).ok, false);
    assert.equal(svc._extractProxyOverride({ proxyMode: 'custom', customProxyUrl: mutatedMask }).ok, false);
    assert.equal(
      svc._resolveConfiguredCustomProxy('https://api.openai.com/v1/models', {
        proxyMode: 'custom',
        customProxyUrl: mutatedMask,
      }).proxy,
      null,
      'Mutated masked proxy must never silently fall back to old :1080 address'
    );
    // Exact unmodified mask still passes both _extractProxyOverride & _resolveConfiguredCustomProxy
    assert.equal(svc._extractProxyOverride({ proxyMode: 'custom', customProxyUrl: loadedCfg.customProxyUrl }).ok, true);
    assert.equal(
      svc._resolveConfiguredCustomProxy('https://api.openai.com/v1/models', {
        proxyMode: 'custom',
        customProxyUrl: loadedCfg.customProxyUrl,
      }).proxy?.port,
      1080
    );
    svc.dispose();

    // D) thought-settings-ui.js: unloaded guard + auto-switch custom on input + auto/direct skip custom URL block
    const settingsUiSrc = fs.readFileSync(
      path.join(ROOT_DIR, 'vendor', 'thought-translator', 'thought-settings-ui.js'),
      'utf8'
    );
    let resolveGetConfig = null;
    const savedPayloads = [];
    const { doc, docEl, rootBody, sandbox } = createMockDomEnv({
      __agPrismThoughtBridge: {
        call: async () => ({ ok: true }),
        cacheStats: async () => ({ ok: true, entries: 0 }),
      },
      __agPrismThought: {
        getViewMode: () => 'immersive',
        setViewMode: () => {},
        getLocalCacheStats: () => ({ memEntries: 0 }),
        getConfig: () =>
          new Promise((resolve) => {
            resolveGetConfig = resolve;
          }),
        saveConfig: async (payload) => {
          savedPayloads.push(payload);
          return {
            ok: true,
            stylePreset: payload.stylePreset || 'technical',
            viewMode: payload.viewMode || 'immersive',
            proxyMode: payload.proxyMode || 'auto',
            customProxyUrl: payload.customProxyUrl ?? 'socks5://127.0.0.1:1080',
            hasProxyCredentials: false,
            translateToolSummaries: false,
            activeProfileId: payload.activeProfileId || 'p1',
            profiles: payload.profiles || [],
          };
        },
        testConnection: async () => ({ ok: true, latencyMs: 12, model: 'm1', reply: '连通正常' }),
        scan: () => {},
      },
    });
    docEl.setAttribute('data-ag-cs-lang', 'zh-CN');
    vm.runInNewContext(settingsUiSrc, sandbox);

    const uiHandle = sandbox.__agPrismThoughtSettingsUi.createThoughtAiConfigBox({
      mkEl: (tag, cls) => {
        const e = doc.createElement(tag);
        if (cls) e.className = cls;
        return e;
      },
      btnClass: 'seg-btn',
      ui: {},
      getMode: () => 'ai',
      runGuardedMut: (fn) => fn(),
    });
    rootBody.appendChild(uiHandle.box);

    const saveBtn = uiHandle.box.querySelector('[data-testid="thought-save-btn"]');
    const testBtn = uiHandle.box.querySelector('[data-testid="thought-test-btn"]');
    const proxyInput = uiHandle.box.querySelector('[data-testid="thought-custom-proxy-url"]');
    const autoBtn = uiHandle.box.querySelector('[data-proxy-mode="auto"]');
    const customBtn = uiHandle.box.querySelector('[data-proxy-mode="custom"]');
    const directBtn = uiHandle.box.querySelector('[data-proxy-mode="direct"]');

    // Before getConfig() resolves: saveBtn/testBtn disabled & click blocked to protect multi-profile store
    assert.equal(saveBtn.disabled, true, 'saveBtn must be disabled while hasThoughtBridge() && !state.loaded');
    assert.equal(testBtn.disabled, true, 'testBtn must be disabled while hasThoughtBridge() && !state.loaded');
    saveBtn.click();
    testBtn.click();
    await new Promise((r) => setTimeout(r, 15));
    assert.equal(savedPayloads.length, 0, 'Clicking save/test before initial config load must not overwrite profiles');

    // Resolve getConfig() with 2 profiles -> buttons unlock
    resolveGetConfig({
      ok: true,
      stylePreset: 'technical',
      viewMode: 'immersive',
      proxyMode: 'auto',
      customProxyUrl: '',
      hasProxyCredentials: false,
      translateToolSummaries: false,
      activeProfileId: 'p2',
      profiles: [
        { id: 'p1', name: 'P1', baseUrl: 'https://api.openai.com/v1', model: 'm1', hasApiKey: true, maskedKey: 'sk-••11' },
        { id: 'p2', name: 'P2', baseUrl: 'https://api.openai.com/v1', model: 'm2', hasApiKey: true, maskedKey: 'sk-••22' },
      ],
    });
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(saveBtn.disabled, false);
    assert.equal(testBtn.disabled, false);

    // Editing proxy input from 'auto' automatically switches mode to 'custom'
    proxyInput.value = 'ftp://bad-draft';
    proxyInput.dispatch('input');
    assert.equal(customBtn.getAttribute('aria-pressed'), 'true', 'Typing non-empty proxy URL must auto-switch auto -> custom');

    // Switching to 'auto' skips invalid custom URL blocking on save & omits invalid draft customProxyUrl
    autoBtn.click();
    assert.equal(autoBtn.getAttribute('aria-pressed'), 'true');
    saveBtn.click();
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(savedPayloads.length, 1, 'auto mode save must NOT be blocked by invalid leftover custom proxy URL');
    assert.equal(savedPayloads[0].proxyMode, 'auto');
    assert.equal('customProxyUrl' in savedPayloads[0], false, 'auto mode must omit invalid draft customProxyUrl');
    assert.equal(savedPayloads[0].profiles.length, 2);

    // Switching to 'direct' also skips invalid custom URL blocking
    proxyInput.value = 'ftp://still-invalid';
    proxyInput.dispatch('input');
    directBtn.click();
    saveBtn.click();
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(savedPayloads.length, 2, 'direct mode save must NOT be blocked by invalid leftover custom proxy URL');
    assert.equal(savedPayloads[1].proxyMode, 'direct');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('10) Red-team #192 [P1-2, P1-3 & P2-4]: detached DOM pruning, React TextNode reuse orig refresh, __OPID/__OPCODE collision immunity, and toolSummaryFailedUntil 512 cap', async () => {
  // A) P1-3: __OPID_N__ collision prevention
  assert.equal(isToolSummaryTranslatable('Check `__OPID_0__` in `foo.js`', 'zh-CN'), false);
  assert.equal(isToolSummaryTranslatable('Inspect __ OPID_1 __ value in config', 'zh-CN'), false);
  const directProt = protectToolSummaryIdentifiers('Check `__OPID_0__` in `foo.js`');
  assert.ok(directProt.masked.includes('__OPID_0__') === false || directProt.tokens.includes('`__OPID_0__`'));
  const directRest = restoreToolSummaryIdentifiers(directProt.masked.replace('Check', '检查'), directProt.tokens);
  assert.equal(directRest.ok, true);
  assert.ok(directRest.text.includes('`__OPID_0__`') && directRest.text.includes('`foo.js`'));

  // P1-3: _translateMachineBatch with __OPCODE_0__ in source uses random nonce so source literal is untouched
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-rt-p13-'));
  try {
    let seenGtxQuery = '';
    const svc = new ThoughtTranslatorService({
      configDir: tmpDir,
      fetchImpl: async (url) => {
        seenGtxQuery = new URL(String(url)).searchParams.get('q') || '';
        const out = seenGtxQuery.replace(/Verify literal/gi, '验证字面量').replace(/\band\b/gi, '与');
        return new Response(JSON.stringify([[[out, seenGtxQuery]]]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });
    const opOut = await svc._translateMachineBatch('Verify literal __OPCODE_0__ and `realCode()`', 'zh-CN');
    assert.equal(seenGtxQuery.includes('__OPCODE_0__'), true, 'Original literal __OPCODE_0__ must stay untouched');
    assert.equal(opOut.includes('__OPCODE_0__'), true, 'Restored output must preserve literal __OPCODE_0__');
    assert.equal(opOut.includes('`realCode()`'), true, 'Restored output must restore backtick code span');
    svc.dispose();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // B) P1-2 + P1-3 + P2-4 on thought-client.js
  const clientSrc = fs.readFileSync(path.join(ROOT_DIR, 'vendor', 'thought-translator', 'thought-client.js'), 'utf8');
  let failBatchNext = false;
  const sentBatches = [];
  const { doc, docEl, rootBody, sandbox } = createMockDomEnv({
    __agPrismThoughtBridge: {
      call: async ({ action }) =>
        action === 'get-cache' ? { ok: true, stylePreset: 'technical', translateToolSummaries: true, entries: {} } : { ok: true },
      translateStream: async (opts) => {
        if (String(opts.mode || '').startsWith('tool-batch:')) {
          const parsed = JSON.parse(opts.text);
          sentBatches.push(parsed.items);
          if (failBatchNext) return { ok: false, error: 'upstream fail' };
          return {
            ok: true,
            items: parsed.items.map((s) => `译:${s}`),
          };
        }
        return { ok: true, text: 'ok' };
      },
      cancelTranslate: async () => ({ ok: true }),
    },
  });
  docEl.setAttribute('data-ag-cs-lang', 'zh-CN');
  vm.runInNewContext(clientSrc, sandbox);
  const api = sandbox.__agPrismThought;

  try {
    const trig = doc.createElement('button', { 'data-testid': 'tool-group-collapsible', 'aria-expanded': 'true' });
    trig.textContent = 'Exploring';
    const panel = doc.createElement('div');
    const row1 = doc.createElement('span');
    row1.textContent = 'Running integration tests';
    const row2 = doc.createElement('span');
    row2.textContent = 'Inspect temporary build output';
    const opidRow = doc.createElement('span');
    opidRow.textContent = 'Check __OPID_0__ placeholder handling';
    panel.appendChild(row1);
    panel.appendChild(row2);
    panel.appendChild(opidRow);
    rootBody.appendChild(trig);
    rootBody.appendChild(panel);

    api.sync({ thoughtTranslate: 'machine', thoughtTrigger: 'expand' });
    api.setTranslateToolSummaries(true);
    api.scanImmediate();
    await new Promise((r) => setTimeout(r, 40));

    // P1-3 client check: __OPID_0__ row skipped and untouched
    assert.equal(opidRow.textContent, 'Check __OPID_0__ placeholder handling');
    assert.equal(row1.textContent, '译:Running integration tests');
    assert.equal(row2.textContent, '译:Inspect temporary build output');
    assert.equal(api.__toolSummaryRecords.size, 2);

    // P1-2a: Detaching row2 and rescanning must immediately prune detached DOM from toolSummaryRecords
    row2.remove();
    api.scanImmediate();
    assert.equal(api.__toolSummaryRecords.size, 1, 'Detached tool summary TextNode must be pruned on scan');

    // P1-2b: React reuses the exact same TextNode inside row1 with brand-new English text
    const reusedTn = row1.firstChild;
    reusedTn.nodeValue = 'Finished compiling workspace bundle';
    api.scanImmediate();
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(reusedTn.nodeValue, '译:Finished compiling workspace bundle');

    // Turning OFF tool summaries must restore the NEW original text, NOT the stale "Running integration tests"
    api.setTranslateToolSummaries(false);
    assert.equal(
      reusedTn.nodeValue,
      'Finished compiling workspace bundle',
      'Reused TextNode must restore to new raw text instead of rolling back to stale orig'
    );

    // P2-4: toolSummaryFailedUntil enforces max 512 entries with oldest-entry eviction
    failBatchNext = true;
    api.setTranslateToolSummaries(true);
    for (let batchIdx = 0; batchIdx < 30; batchIdx++) {
      while (panel.firstChild) panel.removeChild(panel.firstChild);
      for (let j = 0; j < 20; j++) {
        const sp = doc.createElement('span');
        sp.textContent = `Analyze synthetic module batch${batchIdx} item${j}`;
        panel.appendChild(sp);
      }
      api.scanImmediate();
      await new Promise((r) => setTimeout(r, 8));
    }
    assert.ok(
      api.__toolSummaryFailedUntil.size <= 512 && api.__toolSummaryFailedUntil.size > 0,
      `toolSummaryFailedUntil must stay capped at <= 512, got ${api.__toolSummaryFailedUntil.size}`
    );
    assert.equal(
      api.__toolSummaryFailedUntil.has('machine:zh-CN:Analyze synthetic module batch0 item0'),
      false,
      'Oldest failed entry must be evicted once capacity exceeds 512'
    );
  } finally {
    api.destroy();
  }
});

test('11) Red-team #192 [P2-1 & P2-2]: CONNECT 15s timeout, handover RST crash guard, and socks5: local DNS + SSRF check vs socks5h: remote DNS', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-rt-p2-'));
  const servers = [];
  const sockets = new Set();
  const track = (s) => {
    sockets.add(s);
    s.once('close', () => sockets.delete(s));
  };

  try {
    // A) _openConnectTunnel enforces independent handshake timeout against hanging proxy
    const hangProxy = net.createServer((sock) => {
      track(sock);
      sock.on('error', () => {});
      // Never respond to CONNECT
    });
    servers.push(hangProxy);
    await new Promise((r) => hangProxy.listen(0, '127.0.0.1', r));
    const hangPort = hangProxy.address().port;

    const svcTimeout = new ThoughtTranslatorService({
      configDir: tmpDir,
      connectHandshakeTimeoutMs: 120,
      proxyEnv: {},
    });
    await assert.rejects(
      () =>
        svcTimeout._openConnectTunnel(
          { protocol: 'http:', hostname: '127.0.0.1', port: hangPort },
          'api.openai.com:443',
          '',
          null
        ),
      /CONNECT handshake timed out/i
    );
    svcTimeout.dispose();

    // B) Handover RST after CONNECT 200 does not crash process with unhandled error event
    const rstProxy = net.createServer((sock) => {
      track(sock);
      sock.on('error', () => {});
      sock.once('data', () => {
        sock.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        setTimeout(() => {
          try {
            sock.resetAndDestroy ? sock.resetAndDestroy() : sock.destroy();
          } catch {}
        }, 5);
      });
    });
    servers.push(rstProxy);
    await new Promise((r) => rstProxy.listen(0, '127.0.0.1', r));
    const rstPort = rstProxy.address().port;

    const svcRst = new ThoughtTranslatorService({ configDir: tmpDir, proxyEnv: {} });
    const tun = await svcRst._openConnectTunnel(
      { protocol: 'http:', hostname: '127.0.0.1', port: rstPort },
      'api.openai.com:443',
      '',
      null
    );
    assert.ok(tun.listenerCount('error') >= 1, 'Handover tunnel socket must retain fallback error listener');
    await new Promise((r) => setTimeout(r, 30));
    try { tun.destroy(); } catch {}
    svcRst.dispose();

    // C) socks5: local DNS -> ATYP=0x01/0x04 + SSRF fail-closed; socks5h: skips local DNS -> ATYP=0x03
    const targetSrv = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: [{ id: 'dns-ok-model' }] }));
    });
    targetSrv.on('connection', track);
    servers.push(targetSrv);
    await new Promise((r) => targetSrv.listen(0, '127.0.0.1', r));
    const targetPort = targetSrv.address().port;

    const socksEvents = [];
    const mockSocks = createMockSocks5Server({
      requireAuth: null,
      routeMap: () => ({ host: '127.0.0.1', port: targetPort }),
      onConnectEvent: (ev) => socksEvents.push(ev),
    });
    servers.push(mockSocks.server);
    await new Promise((r) => mockSocks.server.listen(0, '127.0.0.1', r));
    const socksPort = mockSocks.server.address().port;

    let dnsCalls = 0;
    const svcSocksV4 = new ThoughtTranslatorService({
      configDir: tmpDir,
      proxyEnv: {},
      dnsLookup: async (host) => {
        dnsCalls++;
        if (host === 'pub-v4.example.test') return { address: '93.184.216.34', family: 4 };
        if (host === 'pub-v6.example.test') return { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 };
        if (host === 'rebind-ssrf.example.test') return { address: '169.254.169.254', family: 4 };
        throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' });
      },
    });
    svcSocksV4.saveConfig({
      proxyMode: 'custom',
      customProxyUrl: `socks5://127.0.0.1:${socksPort}`,
      profiles: [{ id: 'default', name: 'S5', baseUrl: 'http://pub-v4.example.test/v1', apiKey: 'sk-1', model: 'm1' }],
    });

    // IPv4 resolved locally -> ATYP=0x01
    const rV4 = await svcSocksV4.fetchModels({});
    assert.equal(rV4.ok, true);
    assert.equal(socksEvents[0].atyp, 0x01, 'socks5: must send ATYP=0x01 when local DNS resolves IPv4');
    assert.equal(socksEvents[0].host, '93.184.216.34');

    // IPv6 resolved locally -> ATYP=0x04
    const rV6 = await svcSocksV4.fetchModels({ baseUrl: 'http://pub-v6.example.test/v1' });
    assert.equal(rV6.ok, true);
    assert.equal(socksEvents[1].atyp, 0x04, 'socks5: must send ATYP=0x04 when local DNS resolves IPv6');

    // SSRF IP from DNS rebinding -> blocked before any SOCKS5 packet is sent!
    const eventsBeforeSsrf = socksEvents.length;
    const rSsrf = await svcSocksV4.fetchModels({ baseUrl: 'http://rebind-ssrf.example.test/v1' });
    assert.equal(rSsrf.ok, false);
    assert.match(rSsrf.error, /SSRF/i);
    assert.equal(socksEvents.length, eventsBeforeSsrf, 'SSRF resolved IP must abort before opening SOCKS5 tunnel');

    // Local DNS ENOTFOUND -> safely falls back to ATYP=0x03 remote domain resolution
    const rFallback = await svcSocksV4.fetchModels({ baseUrl: 'http://unresolved.example.test/v1' });
    assert.equal(rFallback.ok, true);
    assert.equal(socksEvents[socksEvents.length - 1].atyp, 0x03);
    assert.equal(socksEvents[socksEvents.length - 1].host, 'unresolved.example.test');

    // socks5h: must NEVER call local DNS lookup and always send ATYP=0x03
    const dnsBeforeSocks5h = dnsCalls;
    svcSocksV4.saveConfig({ proxyMode: 'custom', customProxyUrl: `socks5h://127.0.0.1:${socksPort}` });
    const r5h = await svcSocksV4.fetchModels({ baseUrl: 'http://pub-v4.example.test/v1' });
    assert.equal(r5h.ok, true);
    assert.equal(dnsCalls, dnsBeforeSocks5h, 'socks5h: must skip local DNS completely');
    assert.equal(socksEvents[socksEvents.length - 1].atyp, 0x03);
    assert.equal(socksEvents[socksEvents.length - 1].host, 'pub-v4.example.test');

    svcSocksV4.dispose();
  } finally {
    for (const s of sockets) {
      try { s.destroy(); } catch {}
    }
    await Promise.all(servers.map((srv) => new Promise((r) => srv.close(r))));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('12) Red-team #193 [P0-2]: cdp.js cleans up ag-prism-studio-v101-css and data-ag-prism-scope in both stripForeignMount & REMOVE_EXPRESSION', () => {
  const cdp = require(path.join(ROOT_DIR, 'cdp.js'));
  assert.ok(
    cdp.REMOVE_EXPRESSION.includes('#ag-prism-studio-v101-css'),
    'cdp.js REMOVE_EXPRESSION must remove #ag-prism-studio-v101-css'
  );
  assert.ok(
    cdp.REMOVE_EXPRESSION.includes("'data-ag-prism-scope'"),
    'cdp.js REMOVE_EXPRESSION must remove data-ag-prism-scope'
  );

  // Runtime verification: stripForeignMount removes #ag-prism-studio-v101-css on non-host page
  const { doc, docEl, rootBody, sandbox } = createMockDomEnv({
    location: { href: 'devtools://devtools/bundled/inspector.html' },
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
  });
  doc.getElementById = (id) => docEl.querySelector(`[id="${id}"]`);
  const studioCss = doc.createElement('style', { id: 'ag-prism-studio-v101-css' });
  studioCss.textContent = '.stale{}';
  rootBody.appendChild(studioCss);
  assert.ok(doc.getElementById('ag-prism-studio-v101-css'));
  const injectExpr = cdp.buildInjectExpression(cdp.DEFAULT_CONFIG);
  const res = vm.runInNewContext(injectExpr, sandbox);
  assert.equal(res.status, 'skipped-non-host');
  assert.equal(
    doc.getElementById('ag-prism-studio-v101-css'),
    null,
    'cdp.js stripForeignMount must remove #ag-prism-studio-v101-css at runtime'
  );

  // Runtime verification: REMOVE_EXPRESSION removes both #ag-prism-studio-v101-css and html[data-ag-prism-scope]
  const studioCss2 = doc.createElement('style', { id: 'ag-prism-studio-v101-css' });
  rootBody.appendChild(studioCss2);
  docEl.setAttribute('data-ag-prism-scope', 'ssh:prod-box');
  // Patch querySelectorAll on doc to include docEl itself for attribute cleanup
  doc.querySelectorAll = (sel) => {
    const resList = docEl.querySelectorAll(sel);
    if (sel === '[data-ag-prism-scope]' && docEl.hasAttribute('data-ag-prism-scope')) {
      return [docEl, ...resList];
    }
    return resList;
  };
  vm.runInNewContext(cdp.REMOVE_EXPRESSION, sandbox);
  assert.equal(doc.getElementById('ag-prism-studio-v101-css'), null, 'REMOVE_EXPRESSION must remove #ag-prism-studio-v101-css');
  assert.equal(docEl.getAttribute('data-ag-prism-scope'), null, 'REMOVE_EXPRESSION must strip data-ag-prism-scope');
});

test('13) CodeQL High alerts zero-regression: 0 rejectUnauthorized:false, 0 HTML script regexp, 0 innerHTML in thought UI/client', () => {
  const thoughtTestSrc = fs.readFileSync(path.join(ROOT_DIR, 'test', 'thought-translator.test.mjs'), 'utf8');
  assert.equal(
    /rejectUnauthorized\s*:\s*false/.test(thoughtTestSrc),
    false,
    'test/thought-translator.test.mjs must contain 0 occurrences of rejectUnauthorized: false (CodeQL #32 & #33)'
  );

  const secHardeningSrc = fs.readFileSync(path.join(ROOT_DIR, 'test', 'security-sidecar-hardening.test.mjs'), 'utf8');
  const openScriptRegexMarker = '/<' + 'script';
  const closeScriptRegexMarker = 'script>/';
  const hasHtmlScriptFilterRegex = secHardeningSrc
    .split(/\r?\n/)
    .some((line) => {
      const lower = line.toLowerCase();
      const idx = lower.indexOf(openScriptRegexMarker);
      return idx >= 0 && lower.indexOf(closeScriptRegexMarker, idx + openScriptRegexMarker.length) > idx;
    });
  assert.equal(
    hasHtmlScriptFilterRegex,
    false,
    'test/security-sidecar-hardening.test.mjs must not use HTML <script> filtering regex (CodeQL #34)'
  );
  assert.ok(
    secHardeningSrc.includes("html.lastIndexOf(openTag)") || secHardeningSrc.includes("html.lastIndexOf('<script>')"),
    'extractInlineWorkbenchScript must use linear lastIndexOf/indexOf parsing'
  );

  const clientSrc = fs.readFileSync(path.join(ROOT_DIR, 'vendor', 'thought-translator', 'thought-client.js'), 'utf8');
  const uiSrc = fs.readFileSync(path.join(ROOT_DIR, 'vendor', 'thought-translator', 'thought-settings-ui.js'), 'utf8');
  assert.equal(/\.innerHTML\s*=/.test(clientSrc), false, 'thought-client.js must have 0 innerHTML writes');
  assert.equal(/\.innerHTML\s*=/.test(uiSrc), false, 'thought-settings-ui.js must have 0 innerHTML writes');
  assert.equal(clientSrc.includes('/\\s*$/'), false, 'thought-client.js must not contain unanchored /\\s*$/ regex (CodeQL polynomial-redos)');

  const cdp = require(path.join(ROOT_DIR, 'cdp.js'));
  const ch1Expr = cdp.buildInjectExpression(cdp.DEFAULT_CONFIG);
  assert.equal(
    ch1Expr.includes('thought-diagnose-btn') || ch1Expr.includes('thought-titles-toggle') || ch1Expr.includes('scanConversationTitles'),
    false,
    'Conversation title translation & one-click diagnostics must add 0 B to Channel 1 bundle'
  );
  const ch5Expr = cdp.buildThoughtExpression({ ...cdp.DEFAULT_CONFIG, thoughtTranslate: 'ai' });
  assert.ok(ch5Expr.length > 0 && new vm.Script(ch5Expr), 'Channel 5 thought bundle must parse cleanly via vm.Script');
  // Execute packed/minified Channel 5 bundle in a clean VM sandbox to verify runtime integrity after mangling/LZSS
  const ch5Env = createMockDomEnv({
    location: { href: 'vscode-file://vscode-app/index.html' },
    __agPrismThoughtCall: () => {},
  });
  ch5Env.sandbox.self = ch5Env.sandbox.window;
  ch5Env.sandbox.top = ch5Env.sandbox.window;
  ch5Env.rootBody.classList.add('theme-standalone');
  const ch5Res = vm.runInNewContext(ch5Expr, ch5Env.sandbox);
  assert.equal(ch5Res?.ok, true, `Packed Channel 5 must mount cleanly (got ${JSON.stringify(ch5Res)})`);
  assert.equal(typeof ch5Env.sandbox.__agPrismThought?.getTranslateTitles, 'function');
  assert.equal(typeof ch5Env.sandbox.__agPrismThought?.setTranslateTitles, 'function');
  assert.equal(typeof ch5Env.sandbox.__agPrismThought?.diagnose, 'function');
  assert.equal(typeof ch5Env.sandbox.__agPrismThoughtSettingsUi?.createThoughtAiConfigBox, 'function');
  const packedBox = ch5Env.sandbox.__agPrismThoughtSettingsUi.createThoughtAiConfigBox({
    mkEl: (t, c) => ch5Env.doc.createElement(t, c ? { class: c } : {}),
    btnClass: 'btn',
    getMode: () => 'ai',
    getLang: () => 'zh-CN',
  });
  assert.ok(packedBox.box.querySelector('[data-testid="thought-diagnose-btn"]'));
  assert.ok(packedBox.box.querySelector('[data-testid="thought-titles-toggle"]'));
  ch5Env.sandbox.__agPrismThought.destroy();
});

test('14) Conversation titles auto-translation: config persistence, safe filtering, identifier protection, React TextNode reuse, detached pruning, lossless restore & 8-locale UI', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-titles-'));
  try {
    // A) Legacy config backward compat: missing translateTitles defaults to false
    const legacyFile = path.join(tmpDir, 'obsidian-prism-thought.json');
    fs.writeFileSync(
      legacyFile,
      JSON.stringify({
        version: 1,
        stylePreset: 'technical',
        activeProfileId: 'default',
        profiles: [{ id: 'default', name: 'P1', baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o-mini' }],
      }),
      'utf8'
    );

    const gtxBatchCalls = [];
    const svc = new ThoughtTranslatorService({
      configDir: tmpDir,
      fetchImpl: async (url) => {
        const q = new URL(String(url)).searchParams.get('q') || '';
        gtxBatchCalls.push(q);
        const translated = q
          .replace(/Optimize project performance/g, '优化项目性能')
          .replace(/Refactor /g, '重构 ')
          .replace(/ proxy timeout/g, ' 代理超时')
          .replace(/Fix login redirect flow/g, '修复登录重定向流程')
          .replace(/Debug memory leak in daemon/g, '调试守护进程内存泄漏');
        return new Response(JSON.stringify([[[translated, q]]]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });

    const initialCfg = svc.getSanitizedConfig();
    assert.equal(initialCfg.translateTitles, false, 'translateTitles must default to false for legacy configs');
    assert.equal(svc.getWarmCacheSnapshot().translateTitles, false, 'get-cache snapshot must expose translateTitles=false');

    const savedOn = svc.saveConfig({ translateTitles: true });
    assert.equal(savedOn.ok, true);
    assert.equal(savedOn.translateTitles, true);
    assert.equal(svc.getSanitizedConfig().translateTitles, true);
    assert.equal(svc.getWarmCacheSnapshot().translateTitles, true);
    const persistedJson = JSON.parse(fs.readFileSync(legacyFile, 'utf8'));
    assert.equal(persistedJson.translateTitles, true, 'translateTitles must persist to obsidian-prism-thought.json');

    // Reset back to false to verify default-off runtime gating before enabling
    svc.saveConfig({ translateTitles: false });

    // B) Client-side scanning, strict filtering, sidebarStudio dedup, React reuse & detached cleanup
    const clientSrc = fs.readFileSync(path.join(ROOT_DIR, 'vendor', 'thought-translator', 'thought-client.js'), 'utf8');
    const batchRpcCalls = [];
    const { doc, docEl, rootBody, sandbox } = createMockDomEnv({
      __agPrism: { getState: () => ({ cfg: { sidebarStudio: 'on', language: 'zh-CN' } }) },
      __agPrismThoughtBridge: {
        call: async ({ action, ...rest }) => {
          if (action === 'get-cache') return svc.getWarmCacheSnapshot();
          if (action === 'get-config') return svc.getSanitizedConfig();
          if (action === 'save-config') return svc.saveConfig(rest);
          return { ok: true };
        },
        translateStream: async (opts) => {
          if (String(opts.mode || '').startsWith('tool-batch:')) batchRpcCalls.push(opts);
          return svc.translateThought(opts);
        },
        cancelTranslate: async () => ({ ok: true }),
      },
    });
    docEl.setAttribute('data-ag-cs-lang', 'zh-CN');
    docEl.setAttribute('data-ag-prism-sidebar-studio', 'on');
    vm.runInNewContext(clientSrc, sandbox);
    const api = sandbox.__agPrismThought;

    // Sidebar row 1: English title + timestamp + child button + badge
    const row1 = doc.createElement('button', { 'data-testid': 'conversation-row-sidebar' });
    const row1Title = doc.createElement('span');
    row1Title.textContent = 'Optimize project performance';
    const row1Time = doc.createElement('span');
    row1Time.textContent = '2m';
    const row1TimeYesterday = doc.createElement('span');
    row1TimeYesterday.textContent = 'Yesterday';
    const row1Badge = doc.createElement('span', { class: 'status-badge badge' });
    row1Badge.textContent = 'Running now';
    const row1SubBtn = doc.createElement('button');
    row1SubBtn.textContent = 'Delete conversation';
    row1.appendChild(row1Title);
    row1.appendChild(row1Time);
    row1.appendChild(row1TimeYesterday);
    row1.appendChild(row1Badge);
    row1.appendChild(row1SubBtn);
    rootBody.appendChild(row1);

    // Sidebar row 2: English title with PascalCase identifier + pure filename + short word + Chinese title
    const row2 = doc.createElement('div', { 'data-testid': 'conversation-row-sidebar' });
    const row2Title = doc.createElement('span');
    row2Title.textContent = 'Refactor ThoughtTranslatorService proxy timeout';
    const row2File = doc.createElement('span');
    row2File.textContent = 'package.json';
    const row2Short = doc.createElement('span');
    row2Short.textContent = 'Hi';
    const row2Zh = doc.createElement('span');
    row2Zh.textContent = '已经中文的会话标题';
    row2.appendChild(row2Title);
    row2.appendChild(row2File);
    row2.appendChild(row2Short);
    row2.appendChild(row2Zh);
    rootBody.appendChild(row2);

    // History row 3: English title + __OPID collision title
    const row3 = doc.createElement('div', { 'data-testid': 'conversation-row-history' });
    const row3Title = doc.createElement('span');
    row3Title.textContent = 'Fix login redirect flow';
    const row3Opid = doc.createElement('span');
    row3Opid.textContent = 'Check __OPID_0__ title safety';
    row3.appendChild(row3Title);
    row3.appendChild(row3Opid);
    rootBody.appendChild(row3);

    // Breadcrumb segments: workspace slug (skip) + active title (translate)
    const bcWorkspace = doc.createElement('span', { 'data-testid': 'breadcrumb-segment' });
    bcWorkspace.textContent = 'obsidian-prism-dev';
    const bcTitle = doc.createElement('span', { 'data-testid': 'breadcrumb-segment' });
    bcTitle.textContent = 'Optimize project performance';
    rootBody.appendChild(bcWorkspace);
    rootBody.appendChild(bcTitle);

    // Prism Sidebar Studio owned duplicate row: MUST be skipped when sidebarStudio === 'on'
    const prismSidebar = doc.createElement('div', { 'data-ag-prism-sidebar-owned': '1', class: 'ag-prism-sb-chat-list' });
    const dupRow = doc.createElement('div', { 'data-testid': 'conversation-row-sidebar' });
    const dupTitle = doc.createElement('span');
    dupTitle.textContent = 'Optimize project performance';
    dupRow.appendChild(dupTitle);
    prismSidebar.appendChild(dupRow);
    rootBody.appendChild(prismSidebar);

    // Default OFF: zero requests, all titles untouched
    api.sync({ thoughtTranslate: 'machine', thoughtTrigger: 'expand', language: 'zh-CN' });
    api.scanImmediate();
    await new Promise((r) => setTimeout(r, 35));
    assert.equal(batchRpcCalls.length, 0, 'translateTitles=false must send 0 batch requests');
    assert.equal(row1Title.textContent, 'Optimize project performance');

    // Enable translateTitles: single merged batch translates eligible titles only
    api.setTranslateTitles(true);
    api.scanImmediate();
    await new Promise((r) => setTimeout(r, 50));

    assert.equal(batchRpcCalls.length, 1, 'All eligible titles must be merged into 1 tool-batch request');
    assert.equal(row1Title.textContent, '优化项目性能');
    assert.equal(bcTitle.textContent, '优化项目性能');
    assert.equal(row2Title.textContent, '重构 ThoughtTranslatorService 代理超时', 'Code identifier must be preserved verbatim');
    assert.equal(row3Title.textContent, '修复登录重定向流程');

    // Strictly skipped nodes remain 100% untouched
    assert.equal(row1Time.textContent, '2m');
    assert.equal(row1TimeYesterday.textContent, 'Yesterday');
    assert.equal(row1Badge.textContent, 'Running now');
    assert.equal(row1SubBtn.textContent, 'Delete conversation');
    assert.equal(row2File.textContent, 'package.json');
    assert.equal(row2Short.textContent, 'Hi');
    assert.equal(row2Zh.textContent, '已经中文的会话标题');
    assert.equal(row3Opid.textContent, 'Check __OPID_0__ title safety');
    assert.equal(bcWorkspace.textContent, 'obsidian-prism-dev');
    assert.equal(dupTitle.textContent, 'Optimize project performance', 'Prism Sidebar Studio owned duplicate row must be skipped');
    assert.equal(api.__titleRecords.size, 4, 'Exactly 4 connected title TextNodes tracked');

    // React TextNode reuse: overwrite row3Title TextNode in-place with a new conversation title
    const reusedTn = row3Title.childNodes[0];
    reusedTn.nodeValue = 'Debug memory leak in daemon';
    api.scanImmediate();
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(row3Title.textContent, '调试守护进程内存泄漏');

    // Detached DOM pruning: remove row2 and rescan -> detached record pruned immediately
    row2.remove();
    api.scanImmediate();
    assert.equal(api.__titleRecords.size, 3, 'Detached title DOM node must be pruned on next scan');

    // Disable toggle -> 100% lossless restore (reused TextNode restores to NEW orig, never stale old orig!)
    api.setTranslateTitles(false);
    assert.equal(row1Title.textContent, 'Optimize project performance');
    assert.equal(bcTitle.textContent, 'Optimize project performance');
    assert.equal(row3Title.textContent, 'Debug memory leak in daemon', 'Reused TextNode must restore to new orig, not stale old title');
    assert.equal(row1Title.getAttribute('data-op-title-tr'), null);
    assert.equal(api.__titleRecords.size, 0);

    // Re-enable then destroy() -> also 100% lossless restore
    api.setTranslateTitles(true);
    api.scanImmediate();
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(row1Title.textContent, '优化项目性能');
    api.destroy();
    assert.equal(row1Title.textContent, 'Optimize project performance');
    assert.equal(bcTitle.textContent, 'Optimize project performance');
    assert.equal(row3Title.textContent, 'Debug memory leak in daemon');

    // C) Settings UI toggle: visible in both ai & machine modes, 5+1 no-translate attrs, 5 locales, persists translateTitles
    const uiSrc = fs.readFileSync(path.join(ROOT_DIR, 'vendor', 'thought-translator', 'thought-settings-ui.js'), 'utf8');
    const savedPayloads = [];
    const clientCalls = [];
    const uiEnv = createMockDomEnv({
      __agPrismThoughtBridge: { call: async () => ({ ok: true }) },
      __agPrismThought: {
        getViewMode: () => 'immersive',
        getLocalCacheStats: () => ({ memEntries: 0 }),
        getConfig: async () => svc.getSanitizedConfig(),
        saveConfig: async (payload) => {
          savedPayloads.push(payload);
          return svc.saveConfig(payload);
        },
        setTranslateTitles: (v, opts) => {
          clientCalls.push({ v, opts });
          return v;
        },
      },
    });
    vm.runInNewContext(uiSrc, uiEnv.sandbox);
    const { createThoughtAiConfigBox } = uiEnv.sandbox.__agPrismThoughtSettingsUi;
    const hostWrap = uiEnv.doc.createElement('div');
    uiEnv.rootBody.appendChild(hostWrap);
    let curMode = 'ai';
    let curLang = 'zh-CN';
    const uiHandle = createThoughtAiConfigBox({
      mkEl: (t, c) => uiEnv.doc.createElement(t, c ? { class: c } : {}),
      btnClass: 'btn',
      getMode: () => curMode,
      getLang: () => curLang,
    });
    hostWrap.appendChild(uiHandle.box);

    const titlesRow = uiHandle.box.querySelector('[data-testid="thought-titles-row"]');
    const titlesToggle = uiHandle.box.querySelector('[data-testid="thought-titles-toggle"]');
    const titlesDesc = uiHandle.box.querySelector('[data-testid="thought-titles-desc"]');
    assert.ok(titlesRow && titlesToggle && titlesDesc, 'thought-titles-toggle must exist in AI mode');
    assert.equal(titlesToggle.getAttribute('aria-checked'), 'false', 'titles toggle defaults to off');
    for (const [k, v] of [
      ['translate', 'no'],
      ['data-no-translate', 'true'],
      ['data-ag-localization-skip', 'true'],
      ['data-agy-no-translate', 'true'],
      ['data-antigravity-zh-skip', '1'],
      ['data-ag-no-i18n', ''],
    ]) {
      assert.equal(titlesRow.getAttribute(k), v, `titles row must carry anti-translation attr ${k}=${v}`);
    }

    // 8-locale label & description verification (+ yue->zh-CN migration)
    const seenDescs = new Set();
    for (const loc of ['zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'es', 'fr', 'de']) {
      curLang = loc;
      uiHandle.onLanguageChanged(loc);
      assert.ok(titlesDesc.textContent.length > 15, `titles desc must be non-empty for ${loc}`);
      seenDescs.add(titlesDesc.textContent);
    }
    assert.equal(seenDescs.size, 8, 'All 8 locales must have distinct localized title-translation descriptions');
    const zhDesc = (() => {
      curLang = 'zh-CN';
      uiHandle.onLanguageChanged('zh-CN');
      return titlesDesc.textContent;
    })();
    curLang = 'yue';
    uiHandle.onLanguageChanged('yue');
    assert.equal(titlesDesc.textContent, zhDesc, 'Legacy yue must migrate smoothly to zh-CN');

    // Switch to machine mode -> companion card still exposes thought-titles-toggle
    curMode = 'machine';
    uiHandle.onModeSwitched('machine');
    const machineCard = hostWrap.querySelector('[data-testid="prism-thought-general-config"]');
    assert.ok(machineCard && !machineCard.hidden);
    const machineToggle = machineCard.querySelector('[data-testid="thought-titles-toggle"]');
    assert.ok(machineToggle, 'thought-titles-toggle must remain visible in machine companion card');

    // Click toggle -> calls client setTranslateTitles + persists translateTitles: true
    machineToggle.click();
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(machineToggle.getAttribute('aria-checked'), 'true');
    assert.equal(clientCalls.length, 1);
    assert.equal(clientCalls[0].v, true);
    assert.ok(savedPayloads.some((p) => p.translateTitles === true));

    svc.dispose();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

function hasUrlHostname(rawUrl, expectedHostname) {
  try {
    return new URL(String(rawUrl)).hostname === expectedHostname;
  } catch {
    return false;
  }
}

test('15) One-click Thought Diagnostics: all states, 5s bounded timeout, strict secret redaction & 8-locale 4-item UI strip', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-diag-'));
  try {
    // A) Off mode & incomplete AI profile (no network call)
    let fetchHits = 0;
    const svc = new ThoughtTranslatorService({
      configDir: tmpDir,
      proxyEnv: {},
      resolveSystemProxy: () => 'http://osUser:OsSecretPass99@127.0.0.1:8888',
      fetchImpl: async (url, init) => {
        fetchHits++;
        const u = String(url);
        if (u.includes('11434/v1/models')) {
          return new Response(JSON.stringify({ data: [{ id: 'qwen2.5:7b' }] }), { status: 200 });
        }
        if (hasUrlHostname(u, 'auth-fail.example.test')) {
          return new Response('Invalid token sk-leaktest1234567890 via http://alice:ProxySecret42@127.0.0.1:7890', {
            status: 401,
          });
        }
        if (hasUrlHostname(u, 'hang.example.test')) {
          return new Promise((_resolve, reject) => {
            const onAbort = () => {
              const e = new Error('The operation was aborted due to timeout');
              e.name = 'TimeoutError';
              reject(e);
            };
            if (init?.signal?.aborted) {
              onAbort();
              return;
            }
            init?.signal?.addEventListener('abort', onAbort, { once: true });
          });
        }
        if (hasUrlHostname(u, 'translate.googleapis.com')) {
          return new Response(JSON.stringify([[['好的', 'ok']]]), { status: 200 });
        }
        return new Response('{}', { status: 200 });
      },
    });
    svc.saveConfig({
      translateToolSummaries: true,
      translateTitles: true,
      proxyMode: 'custom',
      customProxyUrl: 'http://alice:ProxySecret42@127.0.0.1:7890',
      profiles: [
        { id: 'default', name: 'Cloud', baseUrl: 'https://auth-fail.example.test/v1', apiKey: '', model: 'gpt-4o-mini' },
      ],
    });

    // 1) mode=off -> skipped connectivity, flags & redacted proxies reported
    const diagOff = await svc.diagnose({ mode: 'off' });
    assert.equal(diagOff.ok, true);
    assert.equal(diagOff.mode, 'off');
    assert.equal(diagOff.proxyMode, 'custom');
    assert.equal(diagOff.effectiveProxy, 'http://••••@127.0.0.1:7890');
    assert.equal(diagOff.osProxyDetected, 'http://••••@127.0.0.1:8888');
    assert.equal(diagOff.translateToolSummaries, true);
    assert.equal(diagOff.translateTitles, true);
    assert.equal(diagOff.connectivity.skipped, true);
    assert.equal(diagOff.connectivity.reason, 'mode_off');
    assert.equal(fetchHits, 0);
    const offJson = JSON.stringify(diagOff);
    assert.equal(offJson.includes('ProxySecret42'), false, 'Custom proxy password must never appear in diagnose output');
    assert.equal(offJson.includes('OsSecretPass99'), false, 'OS proxy password must never appear in diagnose output');

    // 2) mode=ai with missing API key -> profileReady=false, zero network probes
    const diagIncomplete = await svc.diagnose({ mode: 'ai' });
    assert.equal(diagIncomplete.profileReady, false);
    assert.ok(diagIncomplete.profileIssues.includes('missing_api_key'));
    assert.equal(diagIncomplete.connectivity.ok, false);
    assert.equal(diagIncomplete.connectivity.reason, 'missing_api_key');
    assert.equal(fetchHits, 0);

    // 3) mode=ai with keyless local Ollama endpoint -> profileReady=true & connectivity ok
    const diagLocal = await svc.diagnose({
      mode: 'ai',
      baseUrl: 'http://127.0.0.1:11434/v1',
      model: 'qwen2.5:7b',
      proxyMode: 'direct',
    });
    assert.equal(diagLocal.profileReady, true);
    assert.equal(diagLocal.proxyMode, 'direct');
    assert.equal(diagLocal.effectiveProxy, '');
    assert.equal(diagLocal.connectivity.ok, true);
    assert.equal(diagLocal.connectivity.reason, 'ok');

    // 4) mode=ai upstream 401 echoing secrets -> auth_error + 100% secret redaction
    const diagAuth = await svc.diagnose({
      mode: 'ai',
      baseUrl: 'https://auth-fail.example.test/v1',
      model: 'gpt-4o-mini',
      apiKey: 'sk-leaktest1234567890',
      proxyMode: 'direct',
    });
    assert.equal(diagAuth.profileReady, true);
    assert.equal(diagAuth.connectivity.ok, false);
    assert.equal(diagAuth.connectivity.reason, 'auth_error');
    const authJson = JSON.stringify(diagAuth);
    assert.equal(authJson.includes('sk-leaktest1234567890'), false, 'API key must be redacted from diagnose response');
    assert.equal(authJson.includes('ProxySecret42'), false, 'Proxy password must be redacted from diagnose response');

    // 5) mode=machine -> probes GTX and succeeds; bounded timeout test returns reason=timeout quickly
    const diagMachine = await svc.diagnose({ mode: 'machine', proxyMode: 'direct' });
    assert.equal(diagMachine.mode, 'machine');
    assert.equal(diagMachine.connectivity.ok, true);
    assert.equal(diagMachine.connectivity.target, 'gtx');

    const t0 = Date.now();
    const diagTimeout = await svc.diagnose({
      mode: 'ai',
      baseUrl: 'https://hang.example.test/v1',
      model: 'gpt-4o-mini',
      apiKey: 'sk-timeouttest12345',
      proxyMode: 'direct',
      timeoutMs: 120,
    });
    assert.equal(diagTimeout.connectivity.ok, false);
    assert.equal(diagTimeout.connectivity.reason, 'timeout');
    assert.ok(Date.now() - t0 < 2000, 'Bounded timeout probe must abort promptly');

    // B) Settings UI one-click diagnostics strip: offline, online healthy, 4-item status & 5 locales
    const uiSrc = fs.readFileSync(path.join(ROOT_DIR, 'vendor', 'thought-translator', 'thought-settings-ui.js'), 'utf8');
    const copiedCmds = [];
    let onlineMode = false;
    let diagReturn = diagMachine;
    const uiEnv = createMockDomEnv({
      navigator: { clipboard: { writeText: async (s) => copiedCmds.push(s) } },
      __agPrismThought: {
        getViewMode: () => 'immersive',
        getLocalCacheStats: () => ({ memEntries: 0 }),
        getConfig: async () => svc.getSanitizedConfig(),
        diagnose: async () => diagReturn,
      },
    });
    // Offline first: no __agPrismThoughtBridge
    vm.runInNewContext(uiSrc, uiEnv.sandbox);
    const { createThoughtAiConfigBox } = uiEnv.sandbox.__agPrismThoughtSettingsUi;
    const hostWrap = uiEnv.doc.createElement('div');
    uiEnv.rootBody.appendChild(hostWrap);
    let curLang = 'zh-CN';
    const uiHandle = createThoughtAiConfigBox({
      mkEl: (t, c) => uiEnv.doc.createElement(t, c ? { class: c } : {}),
      btnClass: 'btn',
      getMode: () => 'machine',
      getLang: () => curLang,
    });
    hostWrap.appendChild(uiHandle.box);
    uiHandle.onModeSwitched('machine');

    const machineCard = hostWrap.querySelector('[data-testid="prism-thought-general-config"]');
    const diagBtn = machineCard.querySelector('[data-testid="thought-diagnose-btn"]');
    const diagPanel = machineCard.querySelector('[data-testid="thought-diagnose-panel"]');
    assert.ok(diagBtn && diagPanel, 'Diagnose button and 4-item feedback panel must exist in companion card');
    assert.equal(diagPanel.hidden, true, 'Diagnose panel starts collapsed');
    for (const [k, v] of [
      ['translate', 'no'],
      ['data-no-translate', 'true'],
      ['data-ag-localization-skip', 'true'],
      ['data-agy-no-translate', 'true'],
      ['data-antigravity-zh-skip', '1'],
      ['data-ag-no-i18n', ''],
    ]) {
      assert.equal(diagPanel.getAttribute(k), v, `diag panel must carry anti-translation attr ${k}=${v}`);
    }

    // Offline click -> 4 items populated + copyable command shown
    diagBtn.click();
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(diagPanel.hidden, false);
    const bridgeItem = diagPanel.querySelector('[data-testid="thought-diag-bridge"]');
    const profItem = diagPanel.querySelector('[data-testid="thought-diag-profile"]');
    const connItem = diagPanel.querySelector('[data-testid="thought-diag-connectivity"]');
    const remItem = diagPanel.querySelector('[data-testid="thought-diag-remedy"]');
    const cmdWrap = diagPanel.querySelector('[data-testid="thought-diag-cmd-wrap"]');
    const cmdCode = diagPanel.querySelector('[data-testid="thought-diag-cmd"]');
    const copyBtn = diagPanel.querySelector('[data-testid="thought-diag-copy-cmd"]');
    assert.equal(bridgeItem.getAttribute('data-state'), 'err');
    assert.equal(connItem.getAttribute('data-state'), 'err');
    assert.equal(cmdWrap.hidden, false, 'Offline diagnostics must surface copyable status command');
    assert.equal(cmdCode.textContent, 'node tools/install-plugin.cjs --status');
    copyBtn.click();
    await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(copiedCmds, ['node tools/install-plugin.cjs --status']);

    // Online healthy click -> bridge/profile/connectivity/remedy all ok & cmd hidden
    onlineMode = true;
    if (onlineMode) uiEnv.sandbox.__agPrismThoughtBridge = { call: async () => diagReturn };
    diagBtn.click();
    await new Promise((r) => setTimeout(r, 25));
    assert.equal(bridgeItem.getAttribute('data-state'), 'ok');
    assert.equal(profItem.getAttribute('data-state'), 'ok');
    assert.equal(connItem.getAttribute('data-state'), 'ok');
    assert.equal(remItem.getAttribute('data-state'), 'ok');
    assert.equal(cmdWrap.hidden, true, 'Healthy diagnostics should hide error troubleshooting command');

    // 8-locale live refresh on diagnose button & panel
    const diagBtnLabels = new Set();
    for (const loc of ['zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'es', 'fr', 'de']) {
      curLang = loc;
      uiHandle.onLanguageChanged(loc);
      diagBtnLabels.add(`${loc}:${diagBtn.textContent}:${bridgeItem.textContent}`);
    }
    assert.equal(diagBtnLabels.size, 8, 'All 8 locales must refresh diagnose button & 4-item panel');

    svc.dispose();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('16) Red-team #229 regressions: full secret redaction (URL-encoded/Base64/env/osCfg/socks4), diagnose body cancel on 200/404/405 & zero-ReDoS whitespace slicing', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-rt229-'));
  try {
    const customApiKey = 'gw_secret+token/99=end';
    const encApiKey = encodeURIComponent(customApiKey);
    const envPass = 'EnvP@ss!42/abc';
    const encEnvPass = encodeURIComponent(envPass);
    const envB64 = Buffer.from(`envUser:${envPass}`, 'utf8').toString('base64');
    const osSocksPass = 'OsSocks#88!';
    const encOsSocksPass = encodeURIComponent(osSocksPass);
    const osSocksB64 = Buffer.from(`osSocks:${osSocksPass}`, 'utf8').toString('base64');
    const socks4Raw = 'socks4://legacyUser:LegacySocks4Pass!@127.0.0.1:1080';

    let cancelCount = 0;
    let readBodyCount = 0;
    const makeTrackableResponse = (status, bodyText) => ({
      ok: status >= 200 && status < 300,
      status,
      body: {
        cancel: async () => {
          cancelCount++;
        },
        getReader: () => {
          readBodyCount++;
          let done = false;
          const bytes = Buffer.from(String(bodyText || ''), 'utf8');
          return {
            read: async () => {
              if (done) return { done: true, value: undefined };
              done = true;
              return { done: false, value: bytes };
            },
            cancel: async () => {
              cancelCount++;
            },
          };
        },
      },
      text: async () => {
        readBodyCount++;
        return String(bodyText || '');
      },
    });

    const svc = new ThoughtTranslatorService({
      configDir: tmpDir,
      proxyPlatform: 'win32',
      proxyExecFileAsync: async () =>
        [
          'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
          '    ProxyEnable    REG_DWORD    0x1',
          `    ProxyServer    REG_SZ    http=http://osHttp:OsHttpPass77!@127.0.0.1:8118;socks=socks5h://osSocks:${encOsSocksPass}@127.0.0.1:1089`,
        ].join('\r\n'),
      proxyEnv: {
        HTTPS_PROXY: `http://envUser:${encEnvPass}@127.0.0.1:7891`,
        ALL_PROXY: socks4Raw,
      },
      fetchImpl: async (url) => {
        const u = String(url);
        if (hasUrlHostname(u, 'leak-a.example.test')) {
          return makeTrackableResponse(401, `k=${encApiKey} e=${encEnvPass} b=${envB64}`);
        }
        if (hasUrlHostname(u, 'leak-b.example.test')) {
          return makeTrackableResponse(401, `s=${encOsSocksPass} sb=${osSocksB64} u=${socks4Raw}`);
        }
        if (hasUrlHostname(u, 'ok-200.example.test')) {
          return makeTrackableResponse(200, '{"data":[' + '{"id":"m"},'.repeat(5000) + ']}');
        }
        if (hasUrlHostname(u, 'notfound-404.example.test')) {
          return makeTrackableResponse(404, 'not found giant body');
        }
        if (hasUrlHostname(u, 'method-405.example.test')) {
          return makeTrackableResponse(405, 'method not allowed giant body');
        }
        if (hasUrlHostname(u, 'translate.googleapis.com')) {
          return makeTrackableResponse(200, JSON.stringify([[['好的', 'ok']]]));
        }
        return makeTrackableResponse(200, '{}');
      },
    });

    // 1) All encoded/Base64/env/osCfg/socks4 secrets (each < 180 chars, well inside snippet window) must be 100% redacted
    const diagLeakA = await svc.diagnose({
      mode: 'ai',
      baseUrl: 'https://leak-a.example.test/v1',
      model: 'custom-model',
      apiKey: customApiKey,
      proxyMode: 'direct',
    });
    const diagLeakB = await svc.diagnose({
      mode: 'ai',
      baseUrl: 'https://leak-b.example.test/v1',
      model: 'custom-model',
      apiKey: customApiKey,
      proxyMode: 'direct',
    });
    assert.equal(diagLeakA.connectivity.ok, false);
    assert.equal(diagLeakA.connectivity.reason, 'auth_error');
    assert.equal(diagLeakB.connectivity.ok, false);
    assert.equal(diagLeakB.connectivity.reason, 'auth_error');
    assert.ok(diagLeakA.connectivity.error.includes('k=***REDACTED*** e=***REDACTED*** b=***REDACTED***'));
    assert.ok(diagLeakB.connectivity.error.includes('s=***REDACTED*** sb=***REDACTED***'));
    assert.ok(diagLeakB.connectivity.error.includes('socks4://***REDACTED***@127.0.0.1:1080'));
    const leakStr = JSON.stringify([diagLeakA, diagLeakB]);
    for (const forbidden of [
      customApiKey,
      encApiKey,
      envPass,
      encEnvPass,
      envB64,
      'OsHttpPass77!',
      osSocksPass,
      encOsSocksPass,
      osSocksB64,
      'LegacySocks4Pass!',
      'legacyUser:LegacySocks4Pass!',
    ]) {
      assert.equal(leakStr.includes(forbidden), false, `diagnose output must redact secret form: ${forbidden}`);
    }

    // 2) HTTP 200 / 404 / 405 & GTX 200 must cancel response body without reading 64KB payload
    cancelCount = 0;
    readBodyCount = 0;
    const d200 = await svc.diagnose({ mode: 'ai', baseUrl: 'https://ok-200.example.test/v1', model: 'm', apiKey: 'sk-test123456', proxyMode: 'direct' });
    const d404 = await svc.diagnose({ mode: 'ai', baseUrl: 'https://notfound-404.example.test/v1', model: 'm', apiKey: 'sk-test123456', proxyMode: 'direct' });
    const d405 = await svc.diagnose({ mode: 'ai', baseUrl: 'https://method-405.example.test/v1', model: 'm', apiKey: 'sk-test123456', proxyMode: 'direct' });
    const dGtx = await svc.diagnose({ mode: 'machine', proxyMode: 'direct' });
    assert.equal(d200.connectivity.ok, true);
    assert.equal(d404.connectivity.ok, true);
    assert.equal(d404.connectivity.reason, 'endpoint_reachable');
    assert.equal(d405.connectivity.ok, true);
    assert.equal(d405.connectivity.reason, 'endpoint_reachable');
    assert.equal(dGtx.connectivity.ok, true);
    assert.equal(readBodyCount, 0, 'HTTP 200/404/405 diagnose probes must NOT read response body');
    assert.equal(cancelCount, 4, 'HTTP 200/404/405/GTX-200 diagnose probes must cancel response body stream');

    // 3) Wide-scheme userinfo redaction in thought-settings-ui.js & thought-client.js
    const uiSrc = fs.readFileSync(path.join(ROOT_DIR, 'vendor', 'thought-translator', 'thought-settings-ui.js'), 'utf8');
    const uiEnv = createMockDomEnv({
      __agPrismThoughtBridge: { call: async () => ({ ok: true }) },
      __agPrismThought: {
        getViewMode: () => 'immersive',
        getLocalCacheStats: () => ({ memEntries: 0 }),
        getConfig: async () => svc.getSanitizedConfig(),
        diagnose: async () => ({
          ok: true,
          bridgeOnline: true,
          mode: 'ai',
          proxyMode: 'custom',
          effectiveProxy: '',
          osProxyDetected: '',
          profileReady: true,
          profileIssues: [],
          connectivity: {
            ok: false,
            latencyMs: 12,
            reason: 'proxy_error',
            error: 'dial socks4://bob:TopSecretSocks4@127.0.0.1:1080 failed',
          },
        }),
      },
    });
    vm.runInNewContext(uiSrc, uiEnv.sandbox);
    const uiHandle = uiEnv.sandbox.__agPrismThoughtSettingsUi.createThoughtAiConfigBox({
      mkEl: (t, c) => uiEnv.doc.createElement(t, c ? { class: c } : {}),
      btnClass: 'btn',
      getMode: () => 'ai',
      getLang: () => 'zh-CN',
    });
    uiEnv.rootBody.appendChild(uiHandle.box);
    uiHandle.box.querySelector('[data-testid="thought-diagnose-btn"]').click();
    await new Promise((r) => setTimeout(r, 30));
    const connText = uiHandle.box.querySelector('[data-testid="thought-diag-connectivity"]').textContent;
    assert.equal(connText.includes('TopSecretSocks4'), false, 'UI diagnostics must redact socks4:// userinfo');
    assert.ok(connText.includes('socks4://***REDACTED***@127.0.0.1:1080'), 'UI diagnostics must mask socks4:// userinfo');

    // thought-client.js sanitizeClientErrorText wide-scheme redaction + zero-ReDoS oversized whitespace skipping
    const clientSrc = fs.readFileSync(path.join(ROOT_DIR, 'vendor', 'thought-translator', 'thought-client.js'), 'utf8');
    const cEnv = createMockDomEnv({
      __agPrismThoughtBridge: {
        call: async () => ({ ok: true, entries: {}, translateTitles: true }),
        translateStream: async (opts) => {
          if (String(opts.mode || '').startsWith('tool-batch:')) {
            const items = JSON.parse(opts.text).items;
            return { ok: true, items: items.map((s) => s.replace('Optimize project performance', '优化项目性能')) };
          }
          return { ok: false, error: 'proxy socks4://bob:ClientSocks4Pass@127.0.0.1:1080 refused' };
        },
        cancelTranslate: async () => ({ ok: true }),
      },
    });
    cEnv.docEl.setAttribute('data-ag-cs-lang', 'zh-CN');
    vm.runInNewContext(clientSrc, cEnv.sandbox);
    const cApi = cEnv.sandbox.__agPrismThought;

    const trig = cEnv.doc.createElement('button', { 'data-testid': 'thinking-collapsible-trigger', 'aria-expanded': 'true' });
    trig.textContent = 'Thought for 2s';
    const panel = cEnv.doc.createElement('div');
    const pNode = cEnv.doc.createElement('p');
    pNode.textContent = 'Analyzing proxy settings for upstream OpenAI requests now.';
    panel.appendChild(pNode);
    cEnv.rootBody.appendChild(trig);
    cEnv.rootBody.appendChild(panel);

    const rowWhitespace = cEnv.doc.createElement('div', { 'data-testid': 'conversation-row-sidebar' });
    const paddedTitle = cEnv.doc.createElement('span');
    paddedTitle.textContent = '  Optimize project performance  ';
    rowWhitespace.appendChild(paddedTitle);
    cEnv.rootBody.appendChild(rowWhitespace);

    const rowHuge = cEnv.doc.createElement('div', { 'data-testid': 'conversation-row-sidebar' });
    const hugeSpan = cEnv.doc.createElement('span');
    hugeSpan.textContent = `${' '.repeat(25000)}Optimize project performance${' '.repeat(25000)}`;
    rowHuge.appendChild(hugeSpan);
    cEnv.rootBody.appendChild(rowHuge);

    const t0 = Date.now();
    cApi.sync({ thoughtTranslate: 'ai', thoughtTrigger: 'expand', language: 'zh-CN', translateTitles: true });
    cApi.scanImmediate();
    await new Promise((r) => setTimeout(r, 40));
    const elapsed = Date.now() - t0;
    assert.ok(elapsed < 1000, `Zero-ReDoS title scan must stay linear & fast (got ${elapsed}ms)`);
    assert.equal(paddedTitle.textContent, '  优化项目性能  ', 'Zero-regex slicing must preserve leading & trailing whitespace');
    assert.equal(hugeSpan.textContent.includes('优化项目性能'), false, 'Oversized (>1024) title TextNode must be skipped');
    const errTextEl = panel.querySelector('.ag-prism-thought-error-text');
    assert.ok(errTextEl, 'Failed thought panel should render error bar');
    assert.equal(errTextEl.textContent.includes('ClientSocks4Pass'), false, 'thought-client error UI must never leak socks4 password');
    cApi.destroy();

    svc.dispose();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('17) Red-team #230 regressions: sidebarStudio attr, breadcrumb last-segment-only, sidebar primary-title-only, unloaded diagnose & late get-cache race', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-rt230-'));
  try {
    // A) #230 [P1-5]: data-ag-prism-sidebar-studio attr (without W.__agPrism), multi-segment breadcrumbs & sidebar primary title only
    const clientSrc = fs.readFileSync(path.join(ROOT_DIR, 'vendor', 'thought-translator', 'thought-client.js'), 'utf8');
    const translatedInputs = [];
    const { doc, docEl, rootBody, sandbox } = createMockDomEnv({
      __agPrismThoughtBridge: {
        call: async () => ({ ok: true, entries: {}, translateTitles: false, translateToolSummaries: false }),
        translateStream: async (opts) => {
          const items = JSON.parse(opts.text).items;
          translatedInputs.push(...items);
          return { ok: true, items: items.map((s) => `[译] ${s}`) };
        },
        cancelTranslate: async () => ({ ok: true }),
      },
    });
    docEl.setAttribute('data-ag-cs-lang', 'zh-CN');
    docEl.setAttribute('data-ag-prism-sidebar-studio', 'on');
    vm.runInNewContext(clientSrc, sandbox);
    const api = sandbox.__agPrismThought;

    // 1) Sidebar Studio node without data-ag-prism-sidebar-owned but with .ag-prism-sb-* class -> must be skipped via data-ag-prism-sidebar-studio="on"
    const sbStudioWrap = doc.createElement('div', { class: 'ag-prism-sb-chat-list' });
    const sbStudioRow = doc.createElement('div', { 'data-testid': 'conversation-row-sidebar' });
    const sbStudioTitle = doc.createElement('span');
    sbStudioTitle.textContent = 'Sidebar Studio duplicate row';
    sbStudioRow.appendChild(sbStudioTitle);
    sbStudioWrap.appendChild(sbStudioRow);
    rootBody.appendChild(sbStudioWrap);

    // 2) Single-segment breadcrumb (workspace folder only) inside <header> -> MUST NOT translate
    const singleBcHeader = doc.createElement('header');
    const singleBcSeg = doc.createElement('span', { 'data-testid': 'breadcrumb-segment' });
    singleBcSeg.textContent = 'Client Portal';
    singleBcHeader.appendChild(singleBcSeg);
    rootBody.appendChild(singleBcHeader);

    // 3) Three-segment wrapped breadcrumb inside <nav> -> MUST translate ONLY the last segment
    const multiBcNav = doc.createElement('nav', { 'aria-label': 'Breadcrumb' });
    const bcWrap1 = doc.createElement('div');
    const bcSeg1 = doc.createElement('span', { 'data-testid': 'breadcrumb-segment' });
    bcSeg1.textContent = 'Client Portal';
    bcWrap1.appendChild(bcSeg1);
    const bcWrap2 = doc.createElement('div');
    const bcSeg2 = doc.createElement('span', { 'data-testid': 'breadcrumb-segment' });
    bcSeg2.textContent = 'Build Tools';
    bcWrap2.appendChild(bcSeg2);
    const bcWrap3 = doc.createElement('div');
    const bcSeg3 = doc.createElement('span', { 'data-testid': 'breadcrumb-segment' });
    bcSeg3.textContent = 'Fix login redirect flow';
    bcWrap3.appendChild(bcSeg3);
    multiBcNav.appendChild(bcWrap1);
    multiBcNav.appendChild(bcWrap2);
    multiBcNav.appendChild(bcWrap3);
    rootBody.appendChild(multiBcNav);

    // 4) Sidebar row with prefix status/time + primary title + plain English subtitle line -> ONLY primary title translated
    const sbRow1 = doc.createElement('div', { 'data-testid': 'conversation-row-sidebar' });
    const sbStatus = doc.createElement('span');
    sbStatus.textContent = 'Active';
    const sbPrimary = doc.createElement('div');
    sbPrimary.textContent = 'Optimize project performance';
    const sbSubtitle = doc.createElement('div');
    sbSubtitle.textContent = 'Updated auth middleware in Client Portal';
    sbRow1.appendChild(sbStatus);
    sbRow1.appendChild(sbPrimary);
    sbRow1.appendChild(sbSubtitle);
    rootBody.appendChild(sbRow1);

    // 5) Sidebar row whose primary title is already Chinese + English subtitle -> MUST NOT fall through to translate subtitle
    const sbRowZh = doc.createElement('div', { 'data-testid': 'conversation-row-sidebar' });
    const sbZhPrimary = doc.createElement('span');
    sbZhPrimary.textContent = '优化登录重定向流程';
    const sbZhSubtitle = doc.createElement('span');
    sbZhSubtitle.textContent = 'Working on payment gateway webhook';
    sbRowZh.appendChild(sbZhPrimary);
    sbRowZh.appendChild(sbZhSubtitle);
    rootBody.appendChild(sbRowZh);

    // 6) History row with explicit data-testid="conversation-title" & subtitle -> ONLY explicit title translated
    const histRow = doc.createElement('div', { 'data-testid': 'conversation-row-history' });
    const histWs = doc.createElement('span');
    histWs.textContent = 'Client Portal';
    const histTitle = doc.createElement('span', { 'data-testid': 'conversation-title' });
    histTitle.textContent = 'Debug memory leak in daemon';
    const histSub = doc.createElement('span', { 'data-testid': 'conversation-subtitle' });
    histSub.textContent = 'Modified five files yesterday';
    histRow.appendChild(histWs);
    histRow.appendChild(histTitle);
    histRow.appendChild(histSub);
    rootBody.appendChild(histRow);

    api.sync({ thoughtTranslate: 'machine', thoughtTrigger: 'expand', language: 'zh-CN' });
    api.setTranslateTitles(true);
    api.scanImmediate();
    await new Promise((r) => setTimeout(r, 40));

    assert.equal(sbStudioTitle.textContent, 'Sidebar Studio duplicate row', 'data-ag-prism-sidebar-studio="on" must exclude .ag-prism-sb-* rows');
    assert.equal(singleBcSeg.textContent, 'Client Portal', 'Single-segment breadcrumb workspace name must never be translated');
    assert.equal(bcSeg1.textContent, 'Client Portal', 'First breadcrumb segment workspace folder name must never be translated');
    assert.equal(bcSeg2.textContent, 'Build Tools', 'Middle breadcrumb segment must never be translated');
    assert.equal(bcSeg3.textContent, '[译] Fix login redirect flow', 'Last segment of multi-segment breadcrumb must be translated');
    assert.equal(sbStatus.textContent, 'Active');
    assert.equal(sbPrimary.textContent, '[译] Optimize project performance', 'Sidebar primary title must be translated');
    assert.equal(sbSubtitle.textContent, 'Updated auth middleware in Client Portal', 'Sidebar subtitle line must never be translated');
    assert.equal(sbZhPrimary.textContent, '优化登录重定向流程');
    assert.equal(sbZhSubtitle.textContent, 'Working on payment gateway webhook', 'English subtitle under Chinese primary title must never be translated');
    assert.equal(histWs.textContent, 'Client Portal');
    assert.equal(histTitle.textContent, '[译] Debug memory leak in daemon');
    assert.equal(histSub.textContent, 'Modified five files yesterday');
    assert.equal(translatedInputs.includes('Client Portal'), false);
    assert.equal(translatedInputs.includes('Build Tools'), false);
    assert.equal(translatedInputs.includes('Updated auth middleware in Client Portal'), false);
    assert.equal(translatedInputs.includes('Working on payment gateway webhook'), false);
    api.destroy();

    // B) #230 [P1-6] Part 1: thought-client.js late get-cache must NOT overwrite explicit user toggle for translateTitles / translateToolSummaries
    let resolveLateCache;
    const lateCachePromise = new Promise((r) => {
      resolveLateCache = r;
    });
    const raceEnv = createMockDomEnv({
      __agPrismThoughtBridge: {
        call: async ({ action }) => {
          if (action === 'get-cache') return lateCachePromise;
          return { ok: true };
        },
        translateStream: async (opts) => {
          const items = JSON.parse(opts.text).items;
          return { ok: true, items: items.map((s) => `[译] ${s}`) };
        },
        cancelTranslate: async () => ({ ok: true }),
      },
    });
    raceEnv.docEl.setAttribute('data-ag-cs-lang', 'zh-CN');
    vm.runInNewContext(clientSrc, raceEnv.sandbox);
    const raceApi = raceEnv.sandbox.__agPrismThought;
    const raceRow = raceEnv.doc.createElement('div', { 'data-testid': 'conversation-row-sidebar' });
    const raceTitle = raceEnv.doc.createElement('span');
    raceTitle.textContent = 'Refactor proxy timeout handling';
    raceRow.appendChild(raceTitle);
    raceEnv.rootBody.appendChild(raceRow);

    // Boot triggers get-cache (still pending), then user explicitly enables both switches before get-cache resolves
    raceApi.sync({ thoughtTranslate: 'machine', thoughtTrigger: 'expand', language: 'zh-CN' });
    raceApi.setTranslateTitles(true);
    raceApi.setTranslateToolSummaries(true);
    raceApi.scanImmediate();
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(raceTitle.textContent, '[译] Refactor proxy timeout handling');

    // Now stale get-cache response arrives with old false values
    resolveLateCache({ ok: true, entries: {}, translateTitles: false, translateToolSummaries: false });
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(raceApi.getTranslateTitles(), true, 'Late stale get-cache must not overwrite explicit translateTitles=true');
    assert.equal(raceApi.getTranslateToolSummaries(), true, 'Late stale get-cache must not overwrite explicit translateToolSummaries=true');
    assert.equal(raceTitle.textContent, '[译] Refactor proxy timeout handling', 'Late stale get-cache must not trigger restoreAllTitles()');
    raceApi.destroy();

    // C) #230 [P1-6] Part 2: thought-settings-ui.js runDiagnostics before state.loaded waits for real config and never sends OpenAI placeholders
    const svc = new ThoughtTranslatorService({
      configDir: tmpDir,
      proxyEnv: {},
      fetchImpl: async (url) => {
        if (String(url).includes('11434/v1/models')) {
          return new Response(JSON.stringify({ data: [{ id: 'qwen2.5:7b' }] }), { status: 200 });
        }
        return new Response('Unauthorized', { status: 401 });
      },
    });
    svc.saveConfig({
      proxyMode: 'direct',
      activeProfileId: 'ollama',
      profiles: [
        { id: 'ollama', name: 'Local Ollama', baseUrl: 'http://127.0.0.1:11434/v1', apiKey: '', model: 'qwen2.5:7b' },
      ],
    });

    const uiSrc = fs.readFileSync(path.join(ROOT_DIR, 'vendor', 'thought-translator', 'thought-settings-ui.js'), 'utf8');

    // Case C1: getConfig() resolves slightly after clicking Diagnose -> waits for real config before calling diagnose()
    const diagPayloads1 = [];
    const uiEnv1 = createMockDomEnv({
      __agPrismThoughtBridge: { call: async () => ({ ok: true }) },
      __agPrismThought: {
        getViewMode: () => 'immersive',
        getLocalCacheStats: () => ({ memEntries: 0 }),
        getConfig: async () => {
          await new Promise((r) => setTimeout(r, 35));
          return svc.getSanitizedConfig();
        },
        diagnose: async (payload) => {
          diagPayloads1.push(payload);
          return svc.diagnose(payload);
        },
      },
    });
    vm.runInNewContext(uiSrc, uiEnv1.sandbox);
    const ui1 = uiEnv1.sandbox.__agPrismThoughtSettingsUi.createThoughtAiConfigBox({
      mkEl: (t, c) => uiEnv1.doc.createElement(t, c ? { class: c } : {}),
      btnClass: 'btn',
      getMode: () => 'ai',
      getLang: () => 'zh-CN',
    });
    uiEnv1.rootBody.appendChild(ui1.box);
    // Click immediately while state.loaded === false
    const waitDiagState = async (box, expected, timeoutMs = 5000) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (box.querySelector('[data-testid="thought-diag-connectivity"]').getAttribute('data-state') === expected) return;
        await new Promise((r) => setTimeout(r, 15));
      }
    };
    ui1.box.querySelector('[data-testid="thought-diagnose-btn"]').click();
    await waitDiagState(ui1.box, 'ok');
    assert.equal(diagPayloads1.length, 1);
    assert.equal(diagPayloads1[0].baseUrl, 'http://127.0.0.1:11434/v1', 'runDiagnostics must await real config instead of sending OpenAI placeholder');
    assert.equal(diagPayloads1[0].model, 'qwen2.5:7b');
    assert.equal(ui1.box.querySelector('[data-testid="thought-diag-profile"]').getAttribute('data-state'), 'ok');
    assert.equal(ui1.box.querySelector('[data-testid="thought-diag-connectivity"]').getAttribute('data-state'), 'ok');

    // Case C2: getConfig() fails (state.loaded stays false) -> runDiagnostics omits placeholder profileId/baseUrl/model/proxyMode so backend uses persisted disk config
    const diagPayloads2 = [];
    const uiEnv2 = createMockDomEnv({
      __agPrismThoughtBridge: { call: async () => ({ ok: true }) },
      __agPrismThought: {
        getViewMode: () => 'immersive',
        getLocalCacheStats: () => ({ memEntries: 0 }),
        getConfig: async () => ({ ok: false }),
        diagnose: async (payload) => {
          diagPayloads2.push(payload);
          return svc.diagnose(payload);
        },
      },
    });
    vm.runInNewContext(uiSrc, uiEnv2.sandbox);
    const ui2 = uiEnv2.sandbox.__agPrismThoughtSettingsUi.createThoughtAiConfigBox({
      mkEl: (t, c) => uiEnv2.doc.createElement(t, c ? { class: c } : {}),
      btnClass: 'btn',
      getMode: () => 'ai',
      getLang: () => 'zh-CN',
    });
    uiEnv2.rootBody.appendChild(ui2.box);
    ui2.box.querySelector('[data-testid="thought-diagnose-btn"]').click();
    await waitDiagState(ui2.box, 'ok');
    assert.equal(diagPayloads2.length, 1);
    assert.equal('baseUrl' in diagPayloads2[0], false, 'Unloaded runDiagnostics must omit placeholder baseUrl');
    assert.equal('model' in diagPayloads2[0], false, 'Unloaded runDiagnostics must omit placeholder model');
    assert.equal('profileId' in diagPayloads2[0], false, 'Unloaded runDiagnostics must omit placeholder profileId');
    assert.equal('proxyMode' in diagPayloads2[0], false, 'Unloaded runDiagnostics must omit placeholder proxyMode');
    assert.equal(ui2.box.querySelector('[data-testid="thought-diag-profile"]').getAttribute('data-state'), 'ok');
    assert.equal(ui2.box.querySelector('[data-testid="thought-diag-connectivity"]').getAttribute('data-state'), 'ok');

    svc.dispose();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('18) Red-team #256 [P1 #7]: composeAbortSignal uses managed ref-d timeout across GTX/AI-non-stream/AI-stream/batch with 0 leaked timers or abort listeners', async () => {
  const svcSrc = fs.readFileSync(path.join(ROOT_DIR, 'vendor', 'thought-translator', 'translator-service.mjs'), 'utf8');
  assert.equal(svcSrc.includes('AbortSignal.timeout('), false, 'translator-service.mjs must have 0 native AbortSignal.timeout() calls');
  const managedFnMatch = /function createManagedTimeoutSignal\([\s\S]*?\n\}/.exec(svcSrc);
  assert.ok(managedFnMatch, 'createManagedTimeoutSignal must exist');
  assert.equal(managedFnMatch[0].includes('.unref('), false, 'createManagedTimeoutSignal must keep ref-d timer (never call timer.unref())');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-managed-abort-'));
  const origSetTimeout = globalThis.setTimeout;
  const origClearTimeout = globalThis.clearTimeout;
  const activeTimers = new Map();
  const countReqTimeouts = () => [...activeTimers.values()].filter((ms) => ms === 9000 || ms === 30000 || ms === 45000 || ms === 45).length;

  globalThis.setTimeout = (...args) => {
    const ms = Number(args[1]) || 0;
    const wrappedCb = () => {
      activeTimers.delete(id);
      return args[0]();
    };
    const id = origSetTimeout(wrappedCb, ...args.slice(1));
    activeTimers.set(id, ms);
    return id;
  };
  globalThis.clearTimeout = (id) => {
    activeTimers.delete(id);
    return origClearTimeout(id);
  };

  try {
    let aiAttempts = 0;
    let batchAttempts = 0;
    const svc = new ThoughtTranslatorService({
      configDir: tmpDir,
      proxyEnv: {},
      fetchImpl: async (url, init = {}) => {
        const u = String(url);
        if (hasUrlHostname(u, 'translate.googleapis.com')) {
          return new Response(JSON.stringify([[['你好世界', 'Hello world']]]), { status: 200 });
        }
        if (u.includes('/hang-external')) {
          return new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(init.signal.reason || new Error('Aborted')), { once: true });
          });
        }
        if (u.includes('/models')) {
          return new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(init.signal.reason || new Error('Aborted')), { once: true });
          });
        }
        if (u.includes('/chat/completions')) {
          const body = JSON.parse(String(init.body || '{}'));
          if (body.stream === false) {
            batchAttempts += 1;
            if (batchAttempts === 1) {
              return new Response('Bad Request: unsupported enable_thinking', { status: 400 });
            }
            return new Response(JSON.stringify({ choices: [{ message: { content: '[0] 读取配置文件' } }] }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            });
          }
          aiAttempts += 1;
          if (aiAttempts === 1) {
            return new Response('Bad Request: unsupported enable_thinking', { status: 400 });
          }
          if (aiAttempts === 2) {
            return new Response(JSON.stringify({ choices: [{ message: { content: '非流式译文' } }] }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            });
          }
          const enc = new TextEncoder();
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"流式"}}]}\n\n'));
              controller.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"译文"}}]}\n\n'));
              controller.enqueue(enc.encode('data: [DONE]\n\n'));
              controller.close();
            },
          });
          return new Response(stream, {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          });
        }
        return new Response('Not Found', { status: 404 });
      },
    });

    svc.saveConfig({
      proxyMode: 'direct',
      activeProfileId: 'qwen-local',
      profiles: [
        { id: 'qwen-local', name: 'Qwen Local', baseUrl: 'http://127.0.0.1:11434/v1', apiKey: '', model: 'qwen3:8b' },
      ],
    });

    // 1) GTX machine translate cleans up 9s managed timeout
    const gtxOut = await svc.translateMachine('Analyze the performance bottleneck carefully', null, 'zh-CN');
    assert.equal(gtxOut, '你好世界');
    assert.equal(countReqTimeouts(), 0, 'GTX translateMachine must leave 0 active timeout timers');

    // 2) AI non-streaming (including 400 noThink retry) cleans up BOTH 45s managed timeouts
    const aiNonStream = await svc.translateAiStream('Thinking step one carefully', null, null, 'zh-CN');
    assert.equal(aiNonStream.text, '非流式译文');
    assert.equal(aiAttempts, 2, 'AI non-stream must exercise 400 retry branch');
    assert.equal(countReqTimeouts(), 0, 'AI non-stream + retry must leave 0 active timeout timers');

    // 3) AI streaming cleans up 45s managed timeout after stream drains
    const partials = [];
    const aiStream = await svc.translateAiStream('Thinking step two carefully', (s) => partials.push(s), null, 'zh-CN');
    assert.equal(aiStream.text, '流式译文');
    assert.equal(countReqTimeouts(), 0, 'AI streaming must leave 0 active timeout timers');

    // 4) AI tool-summary batch (including 400 noThink retry) cleans up BOTH 30s managed timeouts
    const batchRes = await svc.translateToolSummariesBatch({
      items: ['Read config file'],
      mode: 'ai',
      targetLang: 'zh-CN',
    });
    assert.equal(batchRes.ok, true);
    assert.equal(batchRes.items[0], '读取配置文件');
    assert.equal(batchAttempts, 2, 'AI batch must exercise 400 retry branch');
    assert.equal(countReqTimeouts(), 0, 'AI batch + retry must leave 0 active timeout timers');

    // 5) External AbortSignal listener is removed on normal completion AND timer is cleared on early external abort
    const extCtl = new AbortController();
    let extAdds = 0;
    let extRemoves = 0;
    const origAdd = extCtl.signal.addEventListener.bind(extCtl.signal);
    const origRem = extCtl.signal.removeEventListener.bind(extCtl.signal);
    extCtl.signal.addEventListener = (...a) => { extAdds += 1; return origAdd(...a); };
    extCtl.signal.removeEventListener = (...a) => { extRemoves += 1; return origRem(...a); };

    await svc.translateMachine('Analyze the performance bottleneck carefully', extCtl.signal, 'zh-CN');
    assert.equal(countReqTimeouts(), 0, 'Completed GTX with externalSignal must leave 0 active timers');
    assert.equal(extRemoves, extAdds, 'Completed GTX with externalSignal must remove all attached abort listeners');

    // Early external abort during hanging AI request
    svc.saveConfig({
      proxyMode: 'direct',
      activeProfileId: 'hang-local',
      profiles: [
        { id: 'hang-local', name: 'Hang Local', baseUrl: 'http://127.0.0.1:11434/hang-external', apiKey: '', model: 'qwen3:8b' },
      ],
    });
    const abortCtl2 = new AbortController();
    const pendingAi = svc.translateAiStream('Should abort early cleanly', null, abortCtl2.signal, 'zh-CN');
    await new Promise((r) => origSetTimeout(r, 15));
    abortCtl2.abort(new Error('caller cancelled'));
    await assert.rejects(pendingAi);
    assert.equal(countReqTimeouts(), 0, 'Early external abort must clear timeout timer immediately');

    // 6) Diagnose short timeout resolves cleanly with TimeoutError and leaves 0 timers
    const diag = await svc.diagnose({
      mode: 'ai',
      baseUrl: 'http://127.0.0.1:11434/v1',
      model: 'qwen3:8b',
      proxyMode: 'direct',
      timeoutMs: 45,
    });
    assert.equal(diag.connectivity.ok, false);
    assert.equal(diag.connectivity.reason, 'timeout');
    assert.equal(countReqTimeouts(), 0, 'Timed-out diagnose must leave 0 active timers');

    svc.dispose();
    assert.equal(activeTimers.size, 0, 'svc.dispose() must clear all remaining timers including cache debounce');
  } finally {
    globalThis.setTimeout = origSetTimeout;
    globalThis.clearTimeout = origClearTimeout;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

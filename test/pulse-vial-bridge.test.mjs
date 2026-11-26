import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const BRIDGE_PATH = path.join(ROOT_DIR, 'pulse-vial-bridge.js');

const bridgeMod = require(BRIDGE_PATH);
const vialCore = require(path.join(ROOT_DIR, 'vial-core.js'));

function createPulseMockEnv({ cascadeId = '11111111-2222-4333-8444-555555555555' } = {}) {
  const winListeners = new Map();
  const docListeners = new Map();
  const storageData = new Map();
  const rafQueue = new Map();
  let nextRafId = 1;

  function createStyleObj(owner) {
    const props = new Map();
    const syncAttr = () => {
      const css = [...props.entries()].map(([k, v]) => `${k}:${v}`).join(';');
      if (css) owner._attrs.set('style', css);
      else owner._attrs.delete('style');
    };
    return new Proxy(
      {
        setProperty(k, v) {
          props.set(k, String(v));
          syncAttr();
        },
        getPropertyValue(k) {
          return props.get(k) || '';
        },
        removeProperty(k) {
          props.delete(k);
          syncAttr();
        },
      },
      {
        get(target, prop) {
          if (prop in target) return target[prop];
          if (typeof prop === 'string') return props.get(prop) || '';
          return undefined;
        },
        set(target, prop, value) {
          if (typeof prop === 'string') {
            if (value === '' || value == null) props.delete(prop);
            else props.set(prop, String(value));
            syncAttr();
          }
          return true;
        },
      }
    );
  }

  function matchSingleToken(el, token) {
    if (!token || !el._attrs) return false;
    let rest = token.trim();
    if (!rest) return false;
    if (rest.includes('>') || rest.includes(' ')) return false;

    const tagMatch = rest.match(/^[a-zA-Z0-9-]+/);
    if (tagMatch) {
      if (el.tagName !== tagMatch[0].toUpperCase()) return false;
      rest = rest.slice(tagMatch[0].length);
    }

    const idMatches = [...rest.matchAll(/#([a-zA-Z0-9_-]+)/g)];
    for (const m of idMatches) {
      if (el.getAttribute('id') !== m[1]) return false;
    }

    const clsMatches = [...rest.matchAll(/\.([a-zA-Z0-9_-]+)/g)];
    if (clsMatches.length) {
      const list = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean);
      for (const m of clsMatches) {
        if (!list.includes(m[1])) return false;
      }
    }

    const attrMatches = [...rest.matchAll(/\[([a-zA-Z0-9_-]+)(?:=["']?([^"'\]\s]+)["']?)?\]/g)];
    for (const m of attrMatches) {
      if (!el.hasAttribute(m[1])) return false;
      if (m[2] !== undefined && el.getAttribute(m[1]) !== m[2]) return false;
    }

    return true;
  }

  function matchesSelector(el, selector) {
    return String(selector)
      .split(',')
      .some((part) => matchSingleToken(el, part.trim()));
  }

  function walkTree(rootNode, cb) {
    for (const child of rootNode.children || []) {
      cb(child);
      walkTree(child, cb);
    }
  }

  function createNode(tagName, attrs = {}) {
    const _attrs = new Map();
    const listeners = new Map();
    const el = {
      tagName: String(tagName).toUpperCase(),
      _attrs,
      children: [],
      parentNode: null,
      parentElement: null,
      shadowRoot: null,
      isConnected: true,
      textContent: '',
      hidden: false,
      get id() {
        return _attrs.get('id') || '';
      },
      set id(v) {
        _attrs.set('id', String(v));
      },
      get className() {
        return _attrs.get('class') || '';
      },
      set className(v) {
        _attrs.set('class', String(v));
      },
      get firstChild() {
        return el.children[0] || null;
      },
      get nextSibling() {
        if (!el.parentNode) return null;
        const idx = el.parentNode.children.indexOf(el);
        return idx >= 0 && idx + 1 < el.parentNode.children.length ? el.parentNode.children[idx + 1] : null;
      },
      dataset: new Proxy(
        {},
        {
          get(_, prop) {
            const k = 'data-' + String(prop).replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
            return _attrs.get(k);
          },
          set(_, prop, val) {
            const k = 'data-' + String(prop).replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
            _attrs.set(k, String(val));
            return true;
          },
        }
      ),
      setAttribute(k, v) {
        if (k === 'hidden') el.hidden = true;
        _attrs.set(k, String(v));
      },
      getAttribute(k) {
        return _attrs.has(k) ? _attrs.get(k) : null;
      },
      hasAttribute(k) {
        return _attrs.has(k);
      },
      removeAttribute(k) {
        if (k === 'hidden') el.hidden = false;
        _attrs.delete(k);
      },
      appendChild(child) {
        if (child.parentNode) child.remove();
        child.parentNode = el;
        child.parentElement = el.tagName === '#SHADOW-ROOT' ? null : el;
        child.isConnected = el.isConnected;
        el.children.push(child);
        return child;
      },
      insertBefore(child, ref) {
        if (!ref) return el.appendChild(child);
        const idx = el.children.indexOf(ref);
        if (idx < 0) return el.appendChild(child);
        if (child.parentNode) child.remove();
        child.parentNode = el;
        child.parentElement = el.tagName === '#SHADOW-ROOT' ? null : el;
        child.isConnected = el.isConnected;
        el.children.splice(idx, 0, child);
        return child;
      },
      removeChild(child) {
        const idx = el.children.indexOf(child);
        if (idx >= 0) {
          el.children.splice(idx, 1);
          child.parentNode = null;
          child.parentElement = null;
          child.isConnected = false;
        }
        return child;
      },
      remove() {
        if (el.parentNode) el.parentNode.removeChild(el);
      },
      attachShadow({ mode }) {
        const sr = createNode('#shadow-root');
        sr.mode = mode;
        sr.host = el;
        sr.isConnected = el.isConnected;
        el.shadowRoot = sr;
        return sr;
      },
      getElementById(targetId) {
        let hit = null;
        walkTree(el, (n) => {
          if (!hit && n.getAttribute('id') === targetId) hit = n;
        });
        return hit;
      },
      querySelector(sel) {
        return el.querySelectorAll(sel)[0] || null;
      },
      querySelectorAll(sel) {
        const res = [];
        walkTree(el, (n) => {
          if (matchesSelector(n, sel)) res.push(n);
        });
        return res;
      },
      matches(sel) {
        return matchesSelector(el, sel);
      },
      closest(sel) {
        let cur = el;
        while (cur) {
          if (cur.matches && cur.matches(sel)) return cur;
          cur = cur.parentElement;
        }
        return null;
      },
      addEventListener(type, fn) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(fn);
      },
      removeEventListener(type, fn) {
        listeners.get(type)?.delete(fn);
      },
      dispatchEvent(evt) {
        const e = {
          target: el,
          preventDefault() {},
          stopPropagation() {},
          ...evt,
        };
        for (const fn of [...(listeners.get(e.type) || [])]) fn(e);
      },
      getContext(kind) {
        if (kind !== '2d') return null;
        return {
          save() {},
          restore() {},
          setTransform() {},
          clearRect() {},
          beginPath() {},
          moveTo() {},
          lineTo() {},
          arcTo() {},
          closePath() {},
          fill() {},
          stroke() {},
          translate() {},
          rotate() {},
          ellipse() {},
          fillRect() {},
          fillText() {},
          drawImage() {},
          createLinearGradient() {
            return { addColorStop() {} };
          },
        };
      },
      getBoundingClientRect() {
        return { left: 0, top: 0, width: Number(_attrs.get('width')) || 96, height: Number(_attrs.get('height')) || 220 };
      },
    };
    el.style = createStyleObj(el);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'text') el.textContent = String(v);
      else el.setAttribute(k, v);
    }
    return el;
  }

  const docRoot = createNode('html');
  const body = createNode('body', { class: 'theme-dark' });
  docRoot.appendChild(body);

  const cascadeWrap = createNode('div', cascadeId ? { 'data-cascade-id': cascadeId } : {});
  body.appendChild(cascadeWrap);

  function buildPulseStatusBar() {
    const barHost = createNode('div', { id: 'ag-pulse-status-bar' });
    const sr = barHost.attachShadow({ mode: 'open' });

    const bar = createNode('div', { class: 'bar' });
    const speedChip = createNode('button', { class: 'chip', 'data-card': 'speed' });
    speedChip.appendChild(createNode('svg'));
    speedChip.appendChild(createNode('span', { class: 'rounds dim', id: 'rounds', text: '3r' }));
    speedChip.appendChild(createNode('strong', { id: 'tps', text: '42.0' }));
    speedChip.appendChild(createNode('span', { text: 'tok/s' }));
    const cacheChip = createNode('button', { class: 'chip', 'data-card': 'cache' });
    cacheChip.appendChild(createNode('svg'));
    cacheChip.appendChild(createNode('span', { class: 'cache-total', id: 'cache-total', text: '181.3M tok' }));
    cacheChip.appendChild(createNode('span', { class: 'dim', text: '·' }));
    cacheChip.appendChild(createNode('span', { 'data-i18n': 'cache', text: '缓存命中' }));
    cacheChip.appendChild(createNode('strong', { id: 'cache-rate', text: '86.9%' }));
    const ctxChip = createNode('button', { class: 'chip', 'data-card': 'context' });
    ctxChip.appendChild(createNode('span', { class: 'context-ring', id: 'context-ring' }));
    ctxChip.appendChild(createNode('span', { class: 'context-label', 'data-i18n': 'contextShort', text: 'Ctx' }));
    ctxChip.appendChild(createNode('strong', { id: 'context-percent', text: '46%' }));
    bar.appendChild(speedChip);
    bar.appendChild(cacheChip);
    bar.appendChild(ctxChip);
    sr.appendChild(bar);

    const speedCard = createNode('section', { class: 'card', id: 'speed-card', hidden: '' });
    speedCard.appendChild(createNode('dd', { id: 'ttft', text: '0.92s' }));
    speedCard.appendChild(createNode('dd', { id: 'latest-rate', text: '55.2 tok/s' }));
    sr.appendChild(speedCard);

    const ctxCard = createNode('section', { class: 'card context-card', id: 'context-card' });
    ctxCard.hidden = false;
    ctxCard.style.left = '980px';
    const heading = createNode('div', { class: 'heading' });
    const titleSpan = createNode('span', { text: 'Context window' });
    heading.appendChild(titleSpan);
    ctxCard.appendChild(heading);
    ctxCard.appendChild(createNode('strong', { id: 'context-summary', text: '46% used · 54% left' }));
    ctxCard.appendChild(createNode('p', { id: 'context-tokens', text: '118K / 256K tok' }));
    const track = createNode('div', { class: 'track', id: 'context-track' });
    const fill = createNode('i', { id: 'context-fill' });
    fill.style.width = '46%';
    track.appendChild(fill);
    ctxCard.appendChild(track);
    const dl = createNode('dl');
    dl.appendChild(createNode('dd', { id: 'context-model', text: 'Gemini 4 Carbon High' }));
    ctxCard.appendChild(dl);
    ctxCard.appendChild(createNode('p', { class: 'footnote', id: 'context-note', text: 'Latest request estimate' }));
    sr.appendChild(ctxCard);

    return barHost;
  }

  let pulseHostEl = buildPulseStatusBar();
  cascadeWrap.appendChild(pulseHostEl);

  const doc = {
    hidden: false,
    documentElement: docRoot,
    body,
    createElement: (tag) => createNode(tag),
    getElementById(id) {
      return docRoot.getElementById(id);
    },
    querySelector(sel) {
      return docRoot.querySelector(sel);
    },
    querySelectorAll(sel) {
      return docRoot.querySelectorAll(sel);
    },
    addEventListener(type, fn) {
      if (!docListeners.has(type)) docListeners.set(type, new Set());
      docListeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      docListeners.get(type)?.delete(fn);
    },
    dispatchDocEvent(evt) {
      for (const fn of [...(docListeners.get(evt.type) || [])]) fn(evt);
    },
  };

  const storage = {
    getItem: (k) => (storageData.has(k) ? storageData.get(k) : null),
    setItem: (k, v) => storageData.set(k, String(v)),
    removeItem: (k) => storageData.delete(k),
  };

  let schemeOverride = 'dark';
  const win = {
    document: doc,
    localStorage: storage,
    innerWidth: 1280,
    devicePixelRatio: 1,
    __agPulseRuntimeVersion: 'pulse-runtime-v083-intact',
    __agVialCore: vialCore,
    location: { pathname: `/c/${cascadeId}` },
    setScheme(s) {
      schemeOverride = s;
    },
    getComputedStyle() {
      return {
        colorScheme: schemeOverride || '',
        getPropertyValue: (p) => (p === '--pulse-scheme' ? schemeOverride : ''),
      };
    },
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame(cb) {
      const id = nextRafId++;
      rafQueue.set(id, cb);
      return id;
    },
    cancelAnimationFrame(id) {
      rafQueue.delete(id);
    },
    stepRaf(nowMs) {
      const entries = [...rafQueue.entries()];
      rafQueue.clear();
      for (const [, cb] of entries) cb(nowMs);
      return entries.length;
    },
    getPendingRafCount: () => rafQueue.size,
    addEventListener(type, fn) {
      if (!winListeners.has(type)) winListeners.set(type, new Set());
      winListeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      winListeners.get(type)?.delete(fn);
    },
    dispatchWindowEvent(evt) {
      for (const fn of [...(winListeners.get(evt.type) || [])]) fn(evt);
    },
  };

  return {
    win,
    doc,
    storage,
    cascadeWrap,
    buildPulseStatusBar,
    getPulseHost: () => pulseHostEl,
    replacePulseHost() {
      pulseHostEl.remove();
      pulseHostEl.isConnected = false;
      pulseHostEl = buildPulseStatusBar();
      cascadeWrap.appendChild(pulseHostEl);
      return pulseHostEl;
    },
  };
}

test('pulse-vial-bridge stays strictly under 31,000 bytes budget, avoids innerHTML, and supports browser UMD + CJS', () => {
  const src = fs.readFileSync(BRIDGE_PATH, 'utf8');
  const byteSize = Buffer.byteLength(src.replace(/\r\n/g, '\n'), 'utf8');
  assert.ok(byteSize < 31000, `Expected < 31000 bytes, got ${byteSize}`);
  assert.equal(src.includes('.innerHTML'), false, 'Bridge must use TrustedHTML-safe DOM creation without innerHTML');

  assert.equal(bridgeMod.STORAGE_KEY, 'agCs.pulseVialMode.v1');
  assert.equal(bridgeMod.HOST_ID, 'ag-pulse-status-bar');
  assert.equal(typeof bridgeMod.mountPulseVialBridge, 'function');

  const sandbox = { window: {} };
  sandbox.globalThis = sandbox.window;
  vm.runInNewContext(src, sandbox);
  assert.equal(typeof sandbox.window.__agCsPulseVialBridge?.mountPulseVialBridge, 'function');
});

test('peaceful coexistence: preserves #ag-pulse-status-bar, __agPulseRuntimeVersion, and all 8 original render IDs', async () => {
  const env = createPulseMockEnv();
  const originalHost = env.getPulseHost();
  const sr = originalHost.shadowRoot;

  let lastInput = null;
  env.win.agPulseHost = {
    getMetrics: async (input) => {
      lastInput = input;
      return {
        connection: 'live',
        speed: {
          tps: 58.6,
          latestTps: 64.2,
          ttftSeconds: 0.76,
          modelSeconds: 4.2,
          toolSeconds: 1.4,
          rounds: 3,
          context: {
            usedTokens: 133120,
            maxTokens: 256000,
            remainingTokens: 122880,
            usedFraction: 0.52,
            remainingFraction: 0.48,
            model: 'Claude Opus 4.6',
            sampledAt: new Date().toISOString(),
            source: 'rpc',
          },
        },
      };
    },
  };

  const prevDoc = globalThis.document;
  globalThis.document = env.doc;
  let bridge;
  try {
    bridge = bridgeMod.mountPulseVialBridge({
      win: env.win,
      doc: env.doc,
      storage: env.storage,
      vialCore,
      autoPoll: false,
      allowMultiple: true,
    });
    const st = await bridge.sync();

    assert.equal(env.getPulseHost(), originalHost, 'Host #ag-pulse-status-bar node must not be replaced');
    assert.equal(env.win.__agPulseRuntimeVersion, 'pulse-runtime-v083-intact', 'Runtime version must remain untouched');
    assert.equal(lastInput?.conversationId, '11111111-2222-4333-8444-555555555555', 'Must pass valid conversationId GUID');

    const requiredIds = [
      'context-percent',
      'context-ring',
      'context-summary',
      'context-tokens',
      'context-model',
      'context-note',
      'context-fill',
      'context-track',
    ];
    for (const id of requiredIds) {
      const node = sr.getElementById(id);
      assert.ok(node, `Original #${id} must never be deleted from shadowRoot`);
      node.textContent = node.textContent;
      node.style.setProperty('--test-noop', '1');
    }

    assert.equal(st.attached, true);
    assert.equal(st.mode, 'vial');
    assert.equal(st.vialMounted, true);
    assert.equal(st.camp, 'claude');
    assert.equal(st.critical, false);
    assert.equal(st.streaming, true);
    assert.ok(Math.abs(st.ratios[0] + st.ratios[1] + st.ratios[2] - 0.52) < 1e-6);

    const styleEl = sr.querySelector('style[data-ag-cs-pulse-style="1"]');
    assert.ok(styleEl && styleEl.textContent.includes('#context-track'), 'Must inject smooth CSS hiding style');
    assert.equal(styleEl.textContent.includes('Consolas'), false, 'Must replace legacy Consolas with modern UI sans + tabular-nums');
    assert.ok(styleEl.textContent.includes('rgba(255,255,255,.06)'), 'Rail must use subtle 1px divider');
    assert.ok(styleEl.textContent.includes('box-shadow:none'), 'Vial well must float cleanly without dark pit shadow in dark mode');
    assert.ok(styleEl.textContent.includes('.pv-btn::before') && styleEl.textContent.includes('.card-language'));
    assert.equal(originalHost.style.getPropertyValue('--pv-tint'), '#3186ff');
    assert.equal(st.vialDebug.fallingCount, 0);
    const segColors = [...sr.querySelectorAll('[data-layer-slice]')].map((n) => n.style.getPropertyValue('--sc'));
    assert.deepEqual(segColors, ['#1b49b2', '#3186ff', '#5cc6fc']);
    const card = sr.getElementById('context-card');
    assert.equal(card.getAttribute('data-ag-pulse-vial-mode'), 'vial');
    assert.equal(card.getAttribute('data-ag-pulse-card-width'), '396');
    assert.equal(card.style.getPropertyValue('--pv-cx'), '-108px');

    const toggleBtn = sr.querySelector('[data-ag-pulse-vial-toggle="1"]');
    assert.equal(toggleBtn?.textContent, 'Vial', 'Unset language must default cleanly to English without Chinese leak');
    const canvas = sr.querySelector('canvas[data-vial-canvas="true"]');
    assert.ok(canvas);

    const heading = card.querySelector('.heading');
    heading.dispatchEvent({ type: 'pointerdown', clientX: 200 });
    env.win.dispatchWindowEvent({ type: 'pointermove', clientX: 226 });
    env.win.dispatchWindowEvent({ type: 'pointerup', clientX: 226 });
    const afterDrag = bridge.getDebugState();
    assert.ok(afterDrag.vialDebug.waveEnergy > 0.5);
  } finally {
    bridge?.destroy();
    globalThis.document = prevDoc;
  }
});

test('true 0fps sleep & 0ms wake: pauses requestAnimationFrame when vial.isSettled() === true and wakes immediately on pointer/data/poll activity', async () => {
  const env = createPulseMockEnv();
  // 静态非流式快照（sampledAt 为旧时间戳，latestTps = 0 => streaming = false）
  env.win.agPulseHost = {
    getMetrics: async () => ({
      connection: 'live',
      speed: {
        tps: 44.0,
        latestTps: 0,
        ttftSeconds: 0.55,
        rounds: 2,
        context: {
          usedTokens: 128000,
          maxTokens: 512000,
          usedFraction: 0.25,
          model: 'Gemini 4 Carbon',
          sampledAt: '2020-01-01T00:00:00Z',
        },
      },
    }),
  };

  const prevDoc = globalThis.document;
  delete globalThis.document;
  let bridge;
  try {
    bridge = bridgeMod.mountPulseVialBridge({
      win: env.win,
      doc: env.doc,
      storage: env.storage,
      vialCore,
      autoPoll: true,
      pollIntervalMs: 1200,
      allowMultiple: true,
    });
    await bridge.sync();

    // 初始入场未满 1.1s，rAF 活跃运行
    assert.equal(bridge.getDebugState().rafActive, true, 'rAF must run during initial entry convergence');

    // 推进帧跨过 1.1s 静止收敛窗口（每次 +45ms，跑 35 帧 = 1.57s）
    let tNow = 1000;
    for (let i = 0; i < 40 && env.win.getPendingRafCount() > 0; i++) {
      tNow += 45;
      env.win.stepRaf(tNow);
    }

    const slept = bridge.getDebugState();
    assert.equal(slept.vialSettled, true, 'Vial must settle once calm and >=1.1s');
    assert.equal(slept.rafActive, false, 'tickR must stop scheduling rAF (0fps true sleep!)');
    assert.equal(env.win.getPendingRafCount(), 0, 'Pending rAF queue must be completely empty (0fps)');

    // 鼠标划入卡片 -> 0ms 立即唤醒 tickR！
    const card = env.getPulseHost().shadowRoot.getElementById('context-card');
    card.dispatchEvent({ type: 'pointerenter' });
    assert.equal(bridge.getDebugState().rafActive, true, 'Pointer enter on card must wake tickR in 0ms');

    // 验证卡片关闭且无活动时轮询自动拉长至 3000ms，且 document.hidden / telemetry="off" 时 100% 挂起
    card.hidden = true;
    env.win.__agPulseExternalBridge({ event: 'card' });
    assert.equal(bridge.getDebugState().rafActive, false, 'Closing card must immediately stop rAF');
    assert.equal(bridge.getDebugState().pollIntervalMs, 3000, 'Closed idle card must stretch poll interval to 3000ms');

    env.doc.hidden = true;
    env.doc.dispatchDocEvent({ type: 'visibilitychange' });
    assert.equal(bridge.getDebugState().pollSuspended, true, 'document.hidden must suspend background polling completely');
    assert.equal(bridge.getDebugState().pollIntervalMs, 0);

    env.doc.hidden = false;
    env.doc.documentElement.setAttribute('data-ag-cs-telemetry', 'off');
    await bridge.sync();
    assert.equal(bridge.getDebugState().pollSuspended, true, 'data-ag-cs-telemetry="off" must suspend polling & rAF');
  } finally {
    bridge?.destroy();
    if (prevDoc !== undefined) globalThis.document = prevDoc;
  }
});

test('dual daylight presets: syncs data-ag-cs-light-preset="crystal|alabaster" to ShadowHost with #FFFFFF card & recessed porcelain/linen well', async () => {
  const env = createPulseMockEnv();
  const observerRecords = [];
  env.win.MutationObserver = class {
    constructor(cb) {
      this.cb = cb;
      observerRecords.push(this);
    }
    observe() {}
    disconnect() {}
  };

  env.win.setScheme('light');
  env.doc.body.className = 'theme-light';
  const host = env.getPulseHost();
  const sr = host.shadowRoot;

  const prevDoc = globalThis.document;
  delete globalThis.document;
  const bridge = bridgeMod.mountPulseVialBridge({
    win: env.win,
    doc: env.doc,
    storage: env.storage,
    vialCore,
    autoPoll: false,
    allowMultiple: true,
  });

  try {
    await bridge.sync();
    const css = sr.querySelector('style[data-ag-cs-pulse-style="1"]')?.textContent || '';
    assert.equal(css.includes('undefined'), false, 'Macro expansion must not emit undefined');
    assert.equal(css.includes('$'), false, 'All $ macros must be fully expanded');

    // 默认浅色预设为 crystal，纯白 #FFFFFF 底色 + 微凹冷瓷底衬 #EEF3FA + 暖白亚麻底衬 #F2EFE7 + 刻度 rgba(30,41,59,.62)
    assert.equal(host.getAttribute('data-pv-light'), '1');
    assert.equal(host.getAttribute('data-pv-preset'), 'crystal');
    assert.ok(css.includes('--c:#FFFFFF'), 'Light mode card must use crisp pure white #FFFFFF background');
    assert.ok(css.includes('#EEF3FA'), 'Daylight Crystal well must feature #EEF3FA cold porcelain recess');
    assert.ok(css.includes('#F2EFE7'), 'Warm Alabaster well must feature #F2EFE7 warm linen recess');
    assert.ok(css.includes('rgba(30,41,59,.62)'), 'Light mode telemetry/scale text must use crisp slate rgba(30,41,59,.62)');

    // 切换至 alabaster 暖白画册
    env.doc.documentElement.setAttribute('data-ag-cs-light-preset', 'alabaster');
    for (const rec of observerRecords) rec.cb([]);
    assert.equal(host.getAttribute('data-pv-preset'), 'alabaster');
    assert.equal(bridge.getDebugState().lightPreset, 'alabaster');

    // 切回 crystal
    env.doc.documentElement.setAttribute('data-ag-cs-light-preset', 'crystal');
    for (const rec of observerRecords) rec.cb([]);
    assert.equal(host.getAttribute('data-pv-preset'), 'crystal');

    bridge.destroy();
    assert.equal(host.hasAttribute('data-pv-preset'), false, 'destroy() must remove data-pv-preset cleanly');
  } finally {
    bridge.destroy();
    if (prevDoc !== undefined) globalThis.document = prevDoc;
  }
});

test('dual-mode toggle, DOM fallback, __agPulseExternalBridge hook, borderless stream, and cryo-lens motion tiers remain 100% intact', async () => {
  const env = createPulseMockEnv();
  const observerRecords = [];
  env.win.MutationObserver = class {
    constructor(cb) {
      this.cb = cb;
      observerRecords.push(this);
    }
    observe() {}
    disconnect() {}
  };
  let prevCalled = 0;
  const priorHook = () => {
    prevCalled++;
  };
  env.win.__agPulseExternalBridge = priorHook;

  const host = env.getPulseHost();
  const sr = host.shadowRoot;
  sr.getElementById('context-percent').textContent = '88%';
  sr.getElementById('context-model').textContent = 'Gemini 4 Carbon High';

  const prevDoc = globalThis.document;
  delete globalThis.document;
  const bridge = bridgeMod.mountPulseVialBridge({
    win: env.win,
    doc: env.doc,
    storage: env.storage,
    vialCore,
    autoPoll: false,
    allowMultiple: true,
  });

  try {
    const stCrit = await bridge.sync();
    assert.equal(stCrit.critical, true);
    assert.equal(stCrit.maxTokens, 512000);

    const css = sr.querySelector('style[data-ag-cs-pulse-style="1"]')?.textContent || '';
    assert.ok(css.includes('background:transparent!important'));
    assert.ok(css.includes(':host(:not(.icons-only))'));
    assert.ok(css.includes('transform-origin:calc(100% - 28px) 0%'));
    assert.ok(css.includes(':host([data-pv-motion="subtle"])'));
    assert.ok(css.includes(':host([data-pv-motion="off"])'));

    for (const tier of ['subtle', 'off', 'standard', 'ultra']) {
      env.doc.documentElement.setAttribute('data-ag-cs-motion', tier);
      for (const rec of observerRecords) rec.cb([]);
      assert.equal(host.getAttribute('data-pv-motion'), tier);
    }

    const toggleBtn = sr.querySelector('[data-ag-pulse-vial-toggle="1"]');
    toggleBtn.dispatchEvent({ type: 'click' });
    assert.equal(env.storage.getItem('agCs.pulseVialMode.v1'), 'bar');
    assert.equal(sr.querySelector('canvas[data-vial-canvas="true"]'), null);

    env.win.__agPulseExternalBridge({
      event: 'render',
      data: {
        speed: {
          tps: 72.4,
          latestTps: 80.1,
          ttftSeconds: 0.61,
          context: { usedTokens: 192000, maxTokens: 256000, usedFraction: 0.75, model: 'Claude Sonnet 4.6', sampledAt: new Date().toISOString() },
        },
      },
    });
    assert.equal(prevCalled, 1);
    assert.equal(bridge.getDebugState().camp, 'claude');

    bridge.destroy();
    assert.equal(env.win.__agPulseExternalBridge, priorHook);
    assert.equal(sr.querySelector('[data-ag-cs-pulse-style="1"]'), null);
    assert.equal(host.hasAttribute('data-pv-mode'), false);
  } finally {
    bridge.destroy();
    if (prevDoc !== undefined) globalThis.document = prevDoc;
  }
});

test('cross-closure hot re-injection idempotence: purges legacy legacy-style orphan nodes and hands off __agCsPulseBridgeInst cleanly without duplicating .pv-btn', async () => {
  const env = createPulseMockEnv();
  const host = env.getPulseHost();
  const sr = host.shadowRoot;
  const card = sr.getElementById('context-card');
  const heading = card.querySelector('.heading');

  // 1. 模拟旧版 legacy-style 遗留在 shadowRoot 里的孤儿 style、.pv-btn 与 .pv-rail（无当前闭包句柄）
  const legacyStyle = env.doc.createElement('style');
  legacyStyle.setAttribute('data-ag-cs-pulse-style', '1');
  sr.appendChild(legacyStyle);
  const legacyBtn = env.doc.createElement('button');
  legacyBtn.className = 'pv-btn';
  legacyBtn.setAttribute('data-ag-pulse-vial-toggle', '1');
  legacyBtn.setAttribute('data-ag-cs-pulse-injected', '1');
  heading.appendChild(legacyBtn);
  const legacyRail = env.doc.createElement('aside');
  legacyRail.className = 'pv-rail';
  legacyRail.setAttribute('data-ag-cs-pulse-injected', '1');
  card.insertBefore(legacyRail, card.firstChild);

  const src = fs.readFileSync(BRIDGE_PATH, 'utf8');
  const sandbox = {
    window: env.win,
    globalThis: env.win,
    setTimeout,
    clearTimeout,
    Date,
    Math,
    Number,
  };

  const prevDoc = globalThis.document;
  delete globalThis.document;
  let lastInst = null;
  try {
    // 2. 连续 3 次在全新 IIFE 闭包中重跑脚本并挂载单例（模拟真机热更新 / 多次注入）
    for (let run = 0; run < 3; run++) {
      vm.runInNewContext(src, sandbox);
      lastInst = env.win.__agCsPulseVialBridge.mountPulseVialBridge({
        win: env.win,
        doc: env.doc,
        storage: env.storage,
        vialCore,
        autoPoll: false,
      });
      await lastInst.sync();

      assert.equal(sr.querySelectorAll('.pv-btn').length, 1, `Run #${run + 1}: .pv-btn count must be strictly 1`);
      assert.equal(sr.querySelectorAll('style[data-ag-cs-pulse-style="1"]').length, 1, `Run #${run + 1}: style count must be strictly 1`);
      assert.equal(sr.querySelectorAll('.pv-rail').length, 1, `Run #${run + 1}: .pv-rail count must be strictly 1`);
      assert.equal(sr.querySelectorAll('.pv-cb').length, 1, `Run #${run + 1}: .pv-cb count must be strictly 1`);
      assert.equal(sr.querySelectorAll('.pv-bw').length, 1, `Run #${run + 1}: .pv-bw count must be strictly 1`);
      assert.equal(env.win.__agCsPulseBridgeInst, lastInst, 'Singleton handle must point to latest instance');
    }

    lastInst.destroy();
    assert.equal(env.win.__agCsPulseBridgeInst, undefined, 'destroy() must clear __agCsPulseBridgeInst reference');
    assert.equal(sr.querySelectorAll('.pv-btn').length, 0);
  } finally {
    lastInst?.destroy?.();
    if (prevDoc !== undefined) globalThis.document = prevDoc;
  }
});

test('v1.0.1 interactive slice hover, >=80% /compact button, 5h+weekly quota forecast, sibling pool switcher, Swarm split & #five-quota-section yield', async () => {
  const env = createPulseMockEnv();
  const host = env.getPulseHost();
  const sr = host.shadowRoot;
  const composerInput = env.doc.createElement('textarea');
  env.doc.body.appendChild(composerInput);

  const nowMs = Date.now();
  const capturedInputs = [];
  env.win.agPulseHost = {
    getMetrics: async (input) => {
      capturedInputs.push(input);
      return {
        connection: 'live',
        speed: {
          tps: 62.5,
          latestTps: 0,
          ttftSeconds: 0.48,
          rounds: 5,
          modelSeconds: 6.0,
          toolSeconds: 3.0,
          taskUsage: {
            subagents: 3,
            own: { totalTokens: 140000 },
            delegated: { totalTokens: 85000 },
            total: { totalTokens: 225000 },
          },
          context: {
            usedTokens: 430080,
            maxTokens: 512000,
            usedFraction: 0.84,
            model: 'Gemini 4 Carbon (High)',
            sampledAt: '2020-01-01T00:00:00Z',
          },
        },
        groups: [
          {
            id: 'gemini',
            name: 'Gemini',
            windows: {
              '5h': { available: true, id: 'gemini-5h', remaining: 0.65, resetAt: new Date(nowMs + 2 * 3600 * 1000).toISOString() },
              weekly: { available: true, id: 'gemini-weekly', remaining: 0.80, resetAt: new Date(nowMs + 4 * 86400 * 1000).toISOString() },
            },
          },
          {
            id: 'gemini-argon-wtu',
            name: 'Gemini (Argon)',
            windows: {
              '5h': { available: false },
              weekly: { available: true, id: 'gemini-argon-wtu-weekly', remaining: 0.25, resetAt: new Date(nowMs + 5 * 86400 * 1000).toISOString() },
            },
          },
        ],
      };
    },
  };

  const prevDoc = globalThis.document;
  delete globalThis.document;
  const bridge = bridgeMod.mountPulseVialBridge({
    win: env.win,
    doc: env.doc,
    storage: env.storage,
    vialCore,
    autoPoll: false,
    allowMultiple: true,
  });

  try {
    await bridge.sync();

    // 1. Must NEVER pass usageSync: true in background/popover getMetrics calls
    for (const inp of capturedInputs) {
      assert.equal(Boolean(inp?.usageSync), false, 'getMetrics call must never request blocking usageSync: true');
    }

    // 2. High water >= 80% exposes /compact button and fills composer on click
    const compactBtn = sr.querySelector('[data-ag-pulse-compact="1"]');
    assert.ok(compactBtn && compactBtn.hidden === false, '/compact button must be visible when fill >= 80%');
    compactBtn.dispatchEvent({ type: 'click' });
    assert.equal(composerInput.value, '/compact');

    // 3. Hovering .pv-seg updates hoveredSlice (0/1/2) & telemetry readout, and resets on pointerleave (default en without Chinese leak)
    const segs = sr.querySelectorAll('[data-layer-slice]');
    assert.equal(segs.length, 3);
    segs[2].dispatchEvent({ type: 'pointerenter' });
    assert.equal(bridge.getDebugState().hoveredSlice, 2);
    assert.match(sr.querySelector('[data-ag-pulse-telemetry="1"]').textContent, /Tool Output/);
    segs[2].dispatchEvent({ type: 'pointerleave' });
    assert.equal(bridge.getDebugState().hoveredSlice, -1);
    assert.match(sr.querySelector('[data-ag-pulse-telemetry="1"]').textContent, /TTFT/);

    // 4. Lower-half quota panel (#256): 100% true remaining solid bars (zero zebra hatch), health-tier badge (>35% ok, <=35% tight, <=15% low), sibling switcher, and pill Swarm tag
    const qtSec = sr.querySelector('[data-ag-pulse-quotas="1"]');
    assert.ok(qtSec && qtSec.hidden === false, 'Quota section must render when external #five-quota-section is absent');
    assert.equal(sr.querySelector('[data-ag-pulse-quota-title="1"]').textContent, 'Gemini');
    assert.equal(sr.querySelector('[data-ag-pulse-pace="1"]').getAttribute('data-pace'), 'ok', '>35% remaining must show calm ok badge, never anxious exhaust badge');
    assert.equal(qtSec.querySelectorAll('.pv-qrow').length, 2, 'Gemini group has both 5h and weekly windows');
    assert.equal(qtSec.querySelectorAll('.pv-qf, [data-ag-pulse-forecast]').length, 0, 'Zebra forecast hatch elements must be completely eliminated');
    assert.equal(qtSec.querySelector('[data-ag-pulse-quota-fill="5h"]')?.style?.width, '65.0%', '5h solid bar must reflect 100% true remaining quota (65.0%)');
    assert.equal(qtSec.querySelector('[data-ag-pulse-quota-fill="weekly"]')?.style?.width, '80.0%', 'Weekly solid bar must reflect 100% true remaining quota (80.0%)');
    const taskSplit = sr.querySelector('[data-ag-pulse-qtask="1"]');
    assert.equal(taskSplit.hidden, false);
    assert.match(taskSplit.textContent, /Swarm\/Sub\(3\)/);

    // Click sibling Argon pill (remaining: 0.25 <= 0.35) -> switches to Argon weekly window & amber 'tight' health tier (25.0% solid bar)
    const qTabs = sr.querySelectorAll('[data-ag-pulse-qgroup]');
    assert.equal(qTabs.length, 2);
    qTabs[1].dispatchEvent({ type: 'click' });
    assert.equal(sr.querySelector('[data-ag-pulse-quota-title="1"]').textContent, 'Gemini (Argon)');
    assert.equal(qtSec.querySelectorAll('.pv-qrow').length, 1, 'Argon group renders only its weekly window');
    assert.equal(sr.querySelector('[data-ag-pulse-pace="1"]').getAttribute('data-pace'), 'tight');
    assert.equal(qtSec.querySelector('[data-ag-pulse-quota-fill="weekly"]')?.style?.width, '25.0%');
    assert.equal(qtSec.querySelector('.pv-qrow')?.getAttribute('data-warn'), '1');

    // 5. If external antigravity-pulse v0.9.1 already rendered #five-quota-section, yield to avoid duplicate quota bars
    const extQuota = env.doc.createElement('section');
    extQuota.id = 'five-quota-section';
    sr.getElementById('context-card').appendChild(extQuota);
    await bridge.sync();
    assert.equal(qtSec.hidden, true, 'Must auto-hide .pv-qt when external #five-quota-section is present');
  } finally {
    bridge.destroy();
    if (prevDoc !== undefined) globalThis.document = prevDoc;
  }
});

test('v0.9.1 live compatibility: [data-ag-pulse-bar="true"][data-scope="main"] host, .context-hero 2-row grid, .quota-details yield, 30 --pulse-* overrides, nested #usage-dashboard ShadowRoot UD_CSS, and data-layout="blocked" guard', async () => {
  const env = createPulseMockEnv();
  const observerRecords = [];
  env.win.MutationObserver = class {
    constructor(cb) {
      this.cb = cb;
      observerRecords.push(this);
    }
    observe() {}
    disconnect() {}
  };

  // Replace legacy #ag-pulse-status-bar with v0.9.1 data-ag-pulse-bar="true" [data-scope="main"] host
  const legacyHost = env.getPulseHost();
  legacyHost.remove();
  legacyHost.isConnected = false;

  const v9Host = env.doc.createElement('div');
  v9Host.setAttribute('data-ag-pulse-bar', 'true');
  v9Host.setAttribute('data-scope', 'main');
  v9Host.setAttribute('data-pulse-theme', 'dark');
  const sr = v9Host.attachShadow({ mode: 'open' });

  const bar = env.doc.createElement('div');
  bar.className = 'bar';
  const ctxChip = env.doc.createElement('button');
  ctxChip.className = 'chip';
  ctxChip.setAttribute('data-card', 'context');
  const ctxRing = env.doc.createElement('span');
  ctxRing.id = 'context-ring';
  const ctxPct = env.doc.createElement('strong');
  ctxPct.id = 'context-percent';
  ctxPct.textContent = '62%';
  ctxChip.appendChild(ctxRing);
  ctxChip.appendChild(ctxPct);
  bar.appendChild(ctxChip);
  sr.appendChild(bar);

  const card = env.doc.createElement('section');
  card.className = 'card context-card';
  card.id = 'context-card';
  card.hidden = false;
  const hero = env.doc.createElement('div');
  hero.className = 'heading context-hero';
  const heroLabel = env.doc.createElement('span');
  heroLabel.className = 'hero-label';
  heroLabel.textContent = '上下文窗口';
  const heroModel = env.doc.createElement('span');
  heroModel.id = 'context-model';
  heroModel.textContent = 'Gemini 4 Carbon (High)';
  hero.appendChild(heroLabel);
  hero.appendChild(heroModel);
  card.appendChild(hero);

  const track = env.doc.createElement('div');
  track.className = 'track';
  track.id = 'context-track';
  const fill = env.doc.createElement('i');
  fill.id = 'context-fill';
  fill.style.width = '62%';
  track.appendChild(fill);
  card.appendChild(track);

  // v0.9.1 native .quota-details without legacy #five-quota-section ID
  const quotaDetails = env.doc.createElement('div');
  quotaDetails.className = 'quota-details';
  card.appendChild(quotaDetails);

  const usageEntry = env.doc.createElement('div');
  usageEntry.id = 'usage-entry';
  card.appendChild(usageEntry);
  sr.appendChild(card);

  // v0.9.1 <dialog id="usage-dashboard"> with nested shell ShadowRoot (usage-ui.cjs#L5-8)
  const usageDialog = env.doc.createElement('dialog');
  usageDialog.id = 'usage-dashboard';
  const usageShell = env.doc.createElement('div');
  const usageInnerSr = usageShell.attachShadow({ mode: 'open' });
  usageDialog.appendChild(usageShell);
  sr.appendChild(usageDialog);

  const updateDialog = env.doc.createElement('dialog');
  updateDialog.id = 'plugin-update-dialog';
  sr.appendChild(updateDialog);

  env.cascadeWrap.appendChild(v9Host);

  env.win.agPulseHost = {
    getMetrics: async () => ({
      connection: 'live',
      speed: {
        tps: 51.4,
        latestTps: 0,
        ttftSeconds: 0.62,
        rounds: 4,
        context: {
          usedTokens: 158720,
          maxTokens: 256000,
          usedFraction: 0.62,
          model: 'Gemini 4 Carbon (High)',
          sampledAt: '2020-01-01T00:00:00Z',
        },
      },
      groups: [
        {
          id: 'gemini',
          name: 'Gemini',
          windows: { '5h': { available: true, remaining: 0.72, resetAt: new Date(Date.now() + 3600e3).toISOString() } },
        },
      ],
    }),
  };

  const prevDoc = globalThis.document;
  delete globalThis.document;
  const bridge = bridgeMod.mountPulseVialBridge({
    win: env.win,
    doc: env.doc,
    storage: env.storage,
    vialCore,
    autoPoll: false,
    allowMultiple: true,
  });

  try {
    const st = await bridge.sync();
    assert.equal(st.attached, true);
    assert.equal(card.getAttribute('data-ag-pulse-card-width'), '396');
    assert.ok(hero.querySelector('.pv-acts'), '.pv-acts must mount inside .heading.context-hero');

    // .quota-details presence must suppress Prism fallback .pv-qt
    const pvQt = sr.querySelector('[data-ag-pulse-quotas="1"]');
    assert.equal(pvQt?.hidden, true, '.pv-qt must yield when v0.9.1 .quota-details exists');

    // Main stylesheet checks: 30 --pulse-* overrides, 2-row grid, blocked guard, dialogs
    const mainCss = sr.querySelector('style[data-ag-cs-pulse-style="1"]')?.textContent || '';
    assert.equal(mainCss.includes('undefined'), false);
    assert.equal(mainCss.includes('$'), false);
    assert.equal(mainCss.includes('?'), false);
    for (const token of [
      '--pulse-page:var(--pg)!important',
      '--pulse-background:var(--bg)!important',
      '--pulse-card:var(--cd)!important',
      '--pulse-border:var(--b)!important',
      '--pulse-font-mono:var(--mo)!important',
      '#context-card>.heading.context-hero{display:grid!important',
      ':host([data-layout="blocked"])',
      '#usage-dashboard',
      '#plugin-update-dialog',
    ]) {
      assert.ok(mainCss.includes(token), `Main CSS must contain ${token}`);
    }

    // Nested #usage-dashboard ShadowRoot UD_CSS check
    const udStyle = usageInnerSr.querySelector('style[data-ag-cs-pulse-style="1"]');
    assert.ok(udStyle, 'Must inject UD_CSS into #usage-dashboard nested firstElementChild.shadowRoot');
    assert.equal(udStyle.textContent.includes('undefined'), false);
    assert.equal(udStyle.textContent.includes('$'), false);
    assert.equal(udStyle.textContent.includes('?'), false);
    assert.ok(udStyle.textContent.includes('.metric{') && udStyle.textContent.includes('.heat-wrap'));

    // Live sync of palette="warm", accent="mono", corners="soft"
    env.doc.documentElement.setAttribute('data-ag-cs-palette', 'warm');
    env.doc.documentElement.setAttribute('data-ag-cs-accent', 'mono');
    env.doc.documentElement.setAttribute('data-ag-cs-corners', 'soft');
    for (const rec of observerRecords) rec.cb([]);
    assert.equal(v9Host.getAttribute('data-pv-pal'), 'warm');
    assert.equal(v9Host.getAttribute('data-pv-accent'), 'mono');
    assert.equal(v9Host.getAttribute('data-pv-corners'), 'soft');
    assert.equal(v9Host.style.getPropertyValue('--ac'), '#94a3b8');

    // Route safety guard: data-layout="blocked" treats card as closed & sleeps rAF at 0fps
    v9Host.setAttribute('data-layout', 'blocked');
    for (const rec of observerRecords) rec.cb([]);
    assert.equal(bridge.getDebugState().cardOpen, false);
    assert.equal(bridge.getDebugState().rafActive, false);

    // Clean teardown removes nested UD_CSS as well
    bridge.destroy();
    assert.equal(usageInnerSr.querySelector('style[data-ag-cs-pulse-style="1"]'), null);
  } finally {
    bridge.destroy();
    if (prevDoc !== undefined) globalThis.document = prevDoc;
  }
});

test('OP-5.2 / HS-8.3 / UX-9 & <31,000B gate: light+warm alabaster alignment, targetFps=60 rAF throttling, and live 8-language switching', async () => {
  const rawSrc = fs.readFileSync(BRIDGE_PATH, 'utf8');
  assert.equal(rawSrc.includes('\r'), false, 'pulse-vial-bridge.js must use LF line endings');
  assert.ok(Buffer.byteLength(rawSrc, 'utf8') < 31000, `pulse-vial-bridge.js must stay < 31,000B, got ${Buffer.byteLength(rawSrc, 'utf8')}`);
  assert.equal(/innerHTML|outerHTML|insertAdjacentHTML/.test(rawSrc), false, 'Zero innerHTML allowed');

  const env = createPulseMockEnv();
  const observerRecords = [];
  env.win.MutationObserver = class {
    constructor(cb) {
      this.cb = cb;
      observerRecords.push(this);
    }
    observe() {}
    disconnect() {}
  };

  env.win.setScheme('light');
  env.doc.body.className = 'theme-light';
  const host = env.getPulseHost();
  const sr = host.shadowRoot;

  let stepCalls = 0;
  const mockVialCore = {
    mountPhysicalWaterVial() {
      return {
        step() {
          stepCalls++;
        },
        isSettled() {
          return false;
        },
        wake() {},
        impulse() {},
        dispose() {},
        getDebugState() {
          return { rendererMode: '2d' };
        },
      };
    },
  };

  env.win.agPulseHost = {
    getMetrics: async () => ({
      connection: 'live',
      speed: {
        tps: 48.0,
        latestTps: 50.0,
        ttftSeconds: 0.4,
        rounds: 3,
        taskUsage: {
          subagents: 3,
          own: { totalTokens: 60000 },
          delegated: { totalTokens: 40000 },
          total: { totalTokens: 100000 },
        },
        context: {
          usedTokens: 220000,
          maxTokens: 256000,
          usedFraction: 0.86,
          model: 'Gemini 4 Carbon',
          sampledAt: new Date().toISOString(),
        },
      },
      groups: [
        {
          id: 'gemini',
          name: 'Gemini',
          windows: { '5h': { available: true, remaining: 0.75, resetAt: new Date(Date.now() + 7200e3).toISOString() } },
        },
      ],
    }),
  };

  const prevDoc = globalThis.document;
  delete globalThis.document;
  const bridge = bridgeMod.mountPulseVialBridge({
    win: env.win,
    doc: env.doc,
    storage: env.storage,
    vialCore: mockVialCore,
    autoPoll: false,
    allowMultiple: true,
  });

  try {
    await bridge.sync();

    // 1. OP-5.2: Light mode + palette="warm" automatically aligns data-pv-preset="alabaster" (#F2EFE7 warm well)
    assert.equal(host.getAttribute('data-pv-preset'), 'crystal');
    env.doc.documentElement.setAttribute('data-ag-cs-palette', 'warm');
    for (const rec of observerRecords) rec.cb([]);
    assert.equal(host.getAttribute('data-pv-preset'), 'alabaster');
    assert.equal(bridge.getDebugState().lightPreset, 'alabaster');

    // 2. UX-9: Unset/auto defaults cleanly to English (zero Chinese leak), plus live 8-language switching & yue->zh-CN migration
    const toggleBtn = sr.querySelector('[data-ag-pulse-vial-toggle="1"]');
    const segs = sr.querySelectorAll('[data-layer-slice]');
    const taskSplit = sr.querySelector('[data-ag-pulse-qtask="1"]');
    assert.equal(toggleBtn.textContent, 'Vial', 'Unset language must default to English without Chinese leak');
    env.doc.documentElement.setAttribute('data-ag-cs-lang', 'auto');
    for (const rec of observerRecords) rec.cb([]);
    assert.equal(toggleBtn.textContent, 'Vial', 'auto without Chinese navigator.language must stay clean English');

    for (const [langAttr, expToggle, expSplitRe, expToolRe] of [
      ['zh-CN', '实体试管', /主会话 .* Swarm\/子代理\(3\)/, /工具输出/],
      ['yue', '实体试管', /主会话 .* Swarm\/子代理\(3\)/, /工具输出/],
      ['zh-TW', '實體試管', /主會話 .* Swarm\/子代理\(3\)/, /工具輸出/],
      ['zh-HK', '實體試管', /主會話 .* Swarm\/子代理\(3\)/, /工具輸出/],
      ['en', 'Vial', /Main .* Swarm\/Sub\(3\)/, /Tool Output/],
      ['ja', '試験管', /メイン .* Swarm\/サブ\(3\)/, /ツール出力/],
      ['ko', '시험관', /메인 .* Swarm\/서브\(3\)/, /도구 출력/],
      ['es', 'Tubo', /Principal .* Swarm\/Sub\(3\)/, /Salida/],
      ['fr', 'Fiole', /Principal .* Swarm\/Sous\(3\)/, /Outils/],
      ['de', 'Gefäß', /Haupt .* Swarm\/Sub\(3\)/, /Ausgabe/],
    ]) {
      env.doc.documentElement.setAttribute('data-ag-cs-lang', langAttr);
      for (const rec of observerRecords) rec.cb([]);
      assert.equal(toggleBtn.textContent, expToggle, `Toggle label mismatch for ${langAttr}`);
      assert.match(taskSplit.textContent, expSplitRe, `Task split mismatch for ${langAttr}`);
      segs[2].dispatchEvent({ type: 'pointerenter' });
      assert.match(sr.querySelector('[data-ag-pulse-telemetry="1"]').textContent, expToolRe, `Telemetry hover mismatch for ${langAttr}`);
      segs[2].dispatchEvent({ type: 'pointerleave' });
    }

    // 3. HS-8.3: targetFps="60" throttles 180Hz (5ms) rAF callbacks to ~60Hz (>=15.2ms)
    env.doc.documentElement.setAttribute('data-ag-cs-target-fps', '60');
    for (const rec of observerRecords) rec.cb([]);
    assert.equal(bridge.getDebugState().targetFps, '60');

    // First frame at t=1000 executes and anchors t0=1000
    env.win.stepRaf(1000);
    const baseSteps = stepCalls;
    // Next two 180Hz ticks (+5ms, +10ms) must be skipped by throttle (<15.2ms)
    env.win.stepRaf(1005);
    env.win.stepRaf(1010);
    assert.equal(stepCalls, baseSteps, '5ms/10ms rAF ticks must be throttled when targetFps="60"');
    // At t=1016 (+16ms >= 15.2ms), frame executes cleanly
    env.win.stepRaf(1016);
    assert.equal(stepCalls, baseSteps + 1, '16ms tick must execute step cleanly under targetFps="60"');

    // 4. #256 & UX-B4: Zero zebra stripes, zero .pv-qf tick line, hidden #context-note boilerplate, no dashed .pv-qtask border, and /compact double-click safety
    const styleTxt = sr.querySelector('style[data-ag-cs-pulse-style="1"]')?.textContent || '';
    assert.equal(styleTxt.includes('repeating-linear-gradient'), false, 'Zebra hatch stripes must be 100% eliminated');
    assert.equal(styleTxt.includes('.pv-qf'), false, 'Forecast tick line must be 100% eliminated');
    assert.ok(styleTxt.includes('#context-card[data-ag-pulse-vial-mode] :is(#context-track,#context-note)'), 'Meaningless #context-note tail must be hidden');
    assert.equal(styleTxt.includes('dl.stats-grid>.span-row,.pv-qtask'), false, 'Harsh dashed line above .pv-qtask must be removed');
    const cmpBtn = sr.querySelector('[data-ag-pulse-compact="1"]');
    cmpBtn.dispatchEvent({ type: 'click' });
    cmpBtn.dispatchEvent({ type: 'click' });
  } finally {
    bridge.destroy();
    if (prevDoc !== undefined) globalThis.document = prevDoc;
  }
});

test('#209 live resilience: 1800ms agPulseHost timeout fallback to __agPrismMetricsBridge, unstuck "—" quota rescue, 96x220 non-zero canvas lock & hidden-host skip', async () => {
  const env = createPulseMockEnv();
  // Create a hidden external bar FIRST in DOM order to verify fH() skips hidden/blocked bars and binds visible fallback bar!
  const hiddenExt = env.getPulseHost();
  hiddenExt.setAttribute('data-ag-prism-hidden', '1');
  hiddenExt.style.display = 'none';

  const visibleFallback = env.doc.createElement('div');
  visibleFallback.id = 'ag-prism-pulse-bar';
  visibleFallback.setAttribute('data-ag-prism-fallback', '1');
  visibleFallback.setAttribute('data-ag-prism-pulse-bar', 'true');
  const sr = visibleFallback.attachShadow({ mode: 'open' });

  const bar = env.doc.createElement('div');
  bar.className = 'bar';
  const ctxChip = env.doc.createElement('button');
  ctxChip.className = 'chip';
  ctxChip.setAttribute('data-card', 'context');
  const ctxPct = env.doc.createElement('strong');
  ctxPct.id = 'context-percent';
  ctxPct.textContent = '10%';
  ctxChip.appendChild(ctxPct);
  bar.appendChild(ctxChip);
  sr.appendChild(bar);

  const card = env.doc.createElement('section');
  card.className = 'card context-card';
  card.id = 'context-card';
  card.hidden = false;
  const heading = env.doc.createElement('div');
  heading.className = 'heading';
  card.appendChild(heading);
  const track = env.doc.createElement('div');
  track.id = 'context-track';
  card.appendChild(track);

  // Simulate external empty/stuck quota skeleton (#five-balance = '—', #week-balance = '—')
  const stuckQuotaDetails = env.doc.createElement('div');
  stuckQuotaDetails.className = 'quota-details';
  const b5 = env.doc.createElement('strong');
  b5.id = 'five-balance';
  b5.textContent = '—';
  const bw = env.doc.createElement('strong');
  bw.id = 'week-balance';
  bw.textContent = '—';
  stuckQuotaDetails.appendChild(b5);
  stuckQuotaDetails.appendChild(bw);
  card.appendChild(stuckQuotaDetails);
  sr.appendChild(card);
  env.cascadeWrap.appendChild(visibleFallback);

  // External agPulseHost hangs forever (simulating live 4.18s+ stall)
  env.win.agPulseHost = {
    getMetrics: () => new Promise(() => {}),
  };

  let fallbackCalls = 0;
  env.win.__agPrismMetricsBridge = {
    getMetrics: async () => {
      fallbackCalls += 1;
      return {
        connection: 'ok',
        speed: {
          tps: 92.4,
          latestTps: 98.1,
          ttftSeconds: 0.35,
          rounds: 6,
          taskUsage: {
            subagents: 2,
            own: { totalTokens: 80000 },
            delegated: { totalTokens: 40000 },
            total: { totalTokens: 120000 },
          },
          context: {
            usedTokens: 204800,
            maxTokens: 256000,
            usedFraction: 0.8,
            model: 'Gemini 4 Carbon High',
            sampledAt: new Date().toISOString(),
          },
        },
        groups: [
          {
            id: 'gemini',
            name: 'Gemini',
            windows: {
              '5h': { available: true, remaining: 0.64, resetAt: new Date(Date.now() + 7200e3).toISOString() },
            },
          },
        ],
      };
    },
  };

  const prevDoc = globalThis.document;
  delete globalThis.document;
  const bridge = bridgeMod.mountPulseVialBridge({
    win: env.win,
    doc: env.doc,
    storage: env.storage,
    vialCore,
    autoPoll: false,
    allowMultiple: true,
  });

  try {
    const t0 = Date.now();
    const st = await bridge.sync();
    const elapsed = Date.now() - t0;

    assert.equal(st.attached, true);
    assert.ok(fallbackCalls >= 1, 'Must fall back to __agPrismMetricsBridge when agPulseHost stalls');
    assert.ok(elapsed >= 1700 && elapsed < 3200, `Expected ~1800ms race fallback, got ${elapsed}ms`);
    assert.equal(visibleFallback.getAttribute('data-pv-mode'), 'vial', 'Must attach to visible fallback bar, skipping hidden external bar');
    assert.equal(hiddenExt.hasAttribute('data-pv-mode'), false, 'Hidden external bar must remain untouched');
    assert.equal(visibleFallback.style.getPropertyValue('flex-shrink'), '0', 'Visible non-icon bar must lock flex-shrink: 0');
    assert.equal(st.usedFraction, 0.8);
    assert.equal(st.quotaGroups, 1);

    const css = sr.querySelector('style[data-ag-cs-pulse-style="1"]')?.textContent || '';
    assert.equal(css.includes(';,--pulse-'), false, 'PV CSS variables must have zero stray commas');
    assert.ok(
      css.includes('.pv-slot,.pv-cv{width:96px!important;height:220px!important;min-width:96px;min-height:220px;flex:none;display:block}'),
      'Vial slot & canvas must lock explicit 96x220 non-zero geometry'
    );

    const cv = sr.querySelector('canvas.pv-cv');
    assert.ok(cv);
    assert.equal(cv.getAttribute('width'), '96');
    assert.equal(cv.getAttribute('height'), '220');

    // Because #five-balance & #week-balance were stuck at '—', Prism .pv-qt must automatically unhide and show live 64% quota!
    const pvQt = sr.querySelector('[data-ag-pulse-quotas="1"]');
    assert.equal(pvQt.hidden, false, 'Must rescue stuck "—" quota skeleton with live Prism quota rows');
    assert.match(pvQt.querySelector('.pv-qval')?.textContent || '', /64%/);

    // #219 guard: external Pulse orphan sweeper `[id^="ag-pulse-status-bar"],[data-ag-pulse-bar]` must NEVER match `#ag-prism-pulse-bar`!
    assert.equal(visibleFallback.hasAttribute('data-ag-pulse-bar'), false);
    assert.equal(visibleFallback.getAttribute('data-ag-prism-pulse-bar'), 'true');
  } finally {
    bridge.destroy();
    if (prevDoc !== undefined) globalThis.document = prevDoc;
  }
});

test('inline-fallback mounts isolated #ag-prism-pulse-bar invisible to external orphan sweeper and auto-reattaches via MutationObserver (#219)', async () => {
  const inlineMod = require('../vendor/pulse-dashboard/inline-fallback.js');
  const env = createPulseMockEnv();
  const mutObservers = [];
  env.win.MutationObserver = class {
    constructor(cb) {
      this.cb = cb;
      mutObservers.push(this);
    }
    observe() {}
    disconnect() {
      const idx = mutObservers.indexOf(this);
      if (idx >= 0) mutObservers.splice(idx, 1);
    }
  };
  const footer = env.doc.createElement('div');
  footer.className = 'agy-composer-footer flex items-center';
  const leftSlot = env.doc.createElement('div');
  const sendBtn = env.doc.createElement('button');
  footer.appendChild(leftSlot);
  footer.appendChild(sendBtn);
  env.doc.body.appendChild(footer);

  // Mark default external #ag-pulse-status-bar with data-ag-pulse-bar to simulate live #218 collision
  const extBar = env.getPulseHost();
  extBar.setAttribute('data-ag-pulse-bar', 'true');
  extBar.setAttribute('data-layout', 'blocked');

  const ctrl = inlineMod.createTelemetryController({ window: env.win, document: env.doc });
  try {
    const st = ctrl.sync({ telemetryModule: 'on', language: 'zh-CN' });
    assert.equal(st.mountedFallback, true);
    assert.equal(extBar.getAttribute('data-ag-prism-hidden'), '1', 'telemetryModule=on must hide external bar');

    const prismBar = env.doc.getElementById('ag-prism-pulse-bar');
    assert.ok(prismBar, 'Must mount #ag-prism-pulse-bar');
    assert.equal(prismBar.getAttribute('data-ag-prism-pulse-bar'), 'true');
    assert.equal(prismBar.getAttribute('data-ag-prism-fallback'), '1');
    assert.equal(prismBar.hasAttribute('data-ag-pulse-bar'), false, 'Must NOT carry data-ag-pulse-bar');
    assert.equal(prismBar.id.startsWith('ag-pulse-status-bar'), false, 'ID must NOT start with ag-pulse-status-bar');
    assert.equal(prismBar.parentElement, footer, 'Must seat inside .agy-composer-footer');
    assert.equal(footer.children[1], prismBar, 'Must seat before trailing send button');

    // Simulate external Pulse orphan sweeper query `[id^="ag-pulse-status-bar"],[data-ag-pulse-bar]`
    const swept = [...env.doc.querySelectorAll('[data-ag-pulse-bar="true"]'), env.doc.getElementById('ag-pulse-status-bar')].filter(Boolean);
    assert.equal(swept.includes(prismBar), false, 'External orphan sweeper query must NOT match Prism bar');

    // Simulate accidental DOM removal (e.g. React footer re-render) and verify MutationObserver auto-reattach within 80ms
    prismBar.remove();
    assert.equal(prismBar.parentElement, null);
    for (const obs of [...mutObservers]) obs.cb([]);
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(prismBar.parentElement, footer, 'seatObs must auto-reattach #ag-prism-pulse-bar into .agy-composer-footer');

    // #241: Verify compact inward-right card CSS & New Conversation (.agy-home / '/') route suppression + recovery
    const shadowStyle = prismBar.shadowRoot.querySelector('style')?.textContent || '';
    assert.ok(shadowStyle.includes('box-sizing:border-box'), 'Fallback shadow CSS must enforce border-box');
    assert.ok(
      shadowStyle.includes('.card{position:absolute;right:0;left:auto;bottom:calc(100% + 10px);width:min(304px'),
      'Fallback .card must anchor right:0 inward above the trigger bar instead of viewport right:18px'
    );
    assert.equal(prismBar.shadowRoot.getElementById('context-card')?.querySelector('[data-fb-i18n="ctxHeading"]')?.textContent, '上下文窗口');
    assert.equal(prismBar.shadowRoot.getElementById('context-note')?.hidden, true, '#256: meaningless "Prism 实时遥测同步" footnote must stay hidden');

    // Switch route to New Conversation ('/' + .agy-home) -> must unmount #ag-prism-pulse-bar & suppress external bar
    const homeEl = env.doc.createElement('div');
    homeEl.className = 'agy-home';
    env.doc.body.appendChild(homeEl);
    env.win.location.pathname = '/';
    for (const obs of [...mutObservers]) obs.cb([]);
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(ctrl.getState().mountedFallback, false, 'Must unmount #ag-prism-pulse-bar on New Conversation (.agy-home) page');
    assert.equal(env.doc.getElementById('ag-prism-pulse-bar'), null);
    assert.equal(extBar.getAttribute('data-ag-prism-hidden'), '1', 'External bar must stay hidden on New Conversation page');

    // Navigate back into active conversation (/c/<uuid>) -> must auto-remount within 80ms!
    homeEl.remove();
    env.win.location.pathname = '/c/11111111-2222-4333-8444-555555555555';
    for (const obs of [...mutObservers]) obs.cb([]);
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(ctrl.getState().mountedFallback, true, 'Must auto-restore #ag-prism-pulse-bar when entering /c/<uuid> conversation');
    assert.ok(env.doc.getElementById('ag-prism-pulse-bar'));
  } finally {
    ctrl.destroy();
  }
});

test('WO-MAIN-001B: pulse-vial-bridge writes data-pv-warn="1" at >=80% and clears with hysteresis <=78%, plus pauses on data-ag-cs-win-blur', async () => {
  const env = createPulseMockEnv();
  let frac = 0.82;
  env.win.agPulseHost = {
    getMetrics: async () => ({
      connection: 'live',
      speed: {
        tps: 52.0,
        latestTps: 52.0,
        ttftSeconds: 0.4,
        rounds: 4,
        context: {
          usedTokens: Math.round(512000 * frac),
          maxTokens: 512000,
          usedFraction: frac,
          model: 'Gemini 4 Carbon',
          sampledAt: new Date().toISOString(),
        },
      },
    }),
  };

  const prevDoc = globalThis.document;
  delete globalThis.document;
  let bridge;
  try {
    bridge = bridgeMod.mountPulseVialBridge({
      win: env.win,
      doc: env.doc,
      storage: env.storage,
      vialCore,
      autoPoll: false,
      allowMultiple: true,
    });
    await bridge.sync();
    const host = env.getPulseHost();
    assert.equal(host.getAttribute('data-pv-warn'), '1', 'fraction >= 0.80 must stamp data-pv-warn="1"');

    // Inside hysteresis band (0.79) must keep warn active
    frac = 0.79;
    await bridge.sync();
    assert.equal(host.getAttribute('data-pv-warn'), '1', 'fraction 0.79 inside hysteresis band must preserve data-pv-warn="1"');

    // Drop to/below 0.78 clears data-pv-warn
    frac = 0.78;
    await bridge.sync();
    assert.equal(host.hasAttribute('data-pv-warn'), false, 'fraction <= 0.78 must clear data-pv-warn');

    // Re-trigger at 0.80 and verify 0.72 clears
    frac = 0.80;
    await bridge.sync();
    assert.equal(host.getAttribute('data-pv-warn'), '1', 'fraction 0.80 must re-trigger data-pv-warn="1"');
    frac = 0.72;
    await bridge.sync();
    assert.equal(host.hasAttribute('data-pv-warn'), false, 'fraction 0.72 must clear data-pv-warn');

    // Window blur gate stops rAF
    env.doc.documentElement.setAttribute('data-ag-cs-win-blur', '1');
    await bridge.sync();
    assert.equal(bridge.getDebugState().rafActive, false, 'data-ag-cs-win-blur="1" must stop vial rAF');
  } finally {
    bridge?.destroy();
    if (prevDoc !== undefined) globalThis.document = prevDoc;
  }
});

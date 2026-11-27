import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const cdp = require('../cdp.js');
const enhancerMod = require('../host-workbench-enhancer.js');
const i18nCore = require('../i18n-core.js');
const i18nLocales = require('../i18n-locales.js');
const settingsPanel = require('../settings-panel.js');

function checkBalancedDelimiters(src) {
  const stack = [];
  const pairs = { '}': '{', ')': '(', ']': '[' };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{' || ch === '(' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ')' || ch === ']') {
      if (stack.pop() !== pairs[ch]) return false;
    }
  }
  return stack.length === 0;
}

function extractGlslTemplates(relPath) {
  const src = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  const out = [];
  const re = /`(\s*#version\s+300\s+es\b[\s\S]*?)`/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    out.push(m[1]);
  }
  return out;
}

test('GLSL minifyGlsl preserves preprocessor directives, interfaces, structs, swizzles, built-ins, and all 4 real WebGL2 shaders', () => {
  // 1) Synthetic edge-case shader covering #define, layout, uniform block, struct, swizzle, gl_*, scientific literals, and out params
  const synthetic = `#version 300 es
    #define MAX_STEPS 4
    precision highp float;
    layout(location = 0) in vec2 aPos;
    in vec2 vUv;
    out vec4 fragColor;
    uniform vec2 u_res;
    uniform SceneBlock {
      vec4 blockColor;
      float blockExposure;
    } uScene;
    struct LightRig {
      vec3 direction;
      float intensity;
    } gRig;

    void helperCalc(vec2 inputPos, out vec2 computedVec, inout float accumValue) {
      float longLocalFactor = 1e-5 + 0.5000 + float(MAX_STEPS);
      vec3 litDir = normalize(gRig.direction);
      computedVec = inputPos.yx * longLocalFactor + litDir.xy * gRig.intensity;
      accumValue += dot(computedVec, u_res) + uScene.blockExposure;
    }

    void main() {
      vec2 tempOut = vec2(0.0);
      float totalEnergy = 0.0;
      helperCalc(vUv + aPos, tempOut, totalEnergy);
      fragColor = vec4(tempOut, totalEnergy, uScene.blockColor.a) + gl_FragCoord * 0.0;
    }
  `;

  const minSyn = cdp.minifyGlsl(synthetic);
  assert.ok(minSyn.startsWith('#version 300 es\n'), 'Must keep #version 300 es on line 1');
  assert.ok(minSyn.includes('#define MAX_STEPS 4\n'), 'Must keep #define directive intact');
  assert.ok(minSyn.includes('MAX_STEPS'), 'Must preserve macro identifier usage');
  assert.ok(minSyn.includes('layout(location=0)in vec2 aPos;'), 'Must protect layout/in interface');
  assert.ok(minSyn.includes('in vec2 vUv;'), 'Must protect varying in');
  assert.ok(minSyn.includes('out vec4 fragColor;'), 'Must protect fragment out');
  assert.ok(minSyn.includes('uniform vec2 u_res;'), 'Must protect uniform');
  assert.ok(minSyn.includes('uniform SceneBlock{vec4 blockColor;float blockExposure;}uScene;'), 'Must protect UBO name, fields & instance');
  assert.ok(minSyn.includes('struct LightRig{vec3 direction;float intensity;}gRig;'), 'Must protect struct name, fields & instance');
  assert.ok(minSyn.includes('gRig.direction') && minSyn.includes('gRig.intensity'), 'Must protect struct member access');
  assert.ok(minSyn.includes('uScene.blockExposure') && minSyn.includes('uScene.blockColor.a'), 'Must protect UBO member access');
  assert.ok(minSyn.includes('.yx') && minSyn.includes('.xy'), 'Must protect swizzles');
  assert.ok(minSyn.includes('gl_FragCoord'), 'Must protect gl_* built-ins');
  assert.ok(minSyn.includes('1e-5'), 'Must preserve scientific notation literals');
  assert.ok(minSyn.includes('void main()'), 'Must preserve main entry point');
  assert.equal(minSyn.includes('longLocalFactor'), false, 'Local variable should be shortened');
  assert.equal(minSyn.includes('helperCalc'), false, 'Internal helper function should be shortened');
  assert.equal(minSyn.includes('totalEnergy'), false, 'Local main variable should be shortened');
  assert.ok(checkBalancedDelimiters(minSyn), 'Delimiters must remain balanced');

  // 2) All 4 real WebGL2 shader pairs in repository
  const shaderSpecs = [
    {
      file: 'crystal-prism-core.js',
      expectedCount: 2,
      mustKeepPerShader: [
        ['aPos', 'vUv', 'gl_Position', 'main'],
        [
          'vUv',
          'fragColor',
          'u_res',
          'u_dpr',
          'u_time',
          'u_dark',
          'u_pointer',
          'u_proximity',
          'u_reduce',
          'u_glints',
          'u_glintU',
          'u_glintV',
          'u_wake',
          'u_accent',
          'u_ambient',
          'main',
        ],
      ],
    },
    {
      file: 'ripple-core.js',
      expectedCount: 4,
      mustKeepPerShader: [
        ['gl_VertexID', 'gl_Position', 'main'],
        [
          'cells',
          'atlas',
          'size',
          'grid',
          'cellPixels',
          'atlasCell',
          'glyphCount',
          'ink',
          'wave',
          'aura',
          'optics',
          'auraLift',
          'auraPhase',
          'lightMode',
          'neb0',
          'neb1',
          'neb2',
          'nebOpt',
          'nebulaLift',
          'spectrumMode',
          'color',
          'gl_FragCoord',
          'main',
        ],
        ['gl_VertexID', 'gl_Position', 'main'],
        [
          'uRes',
          'uDpr',
          'uTime',
          'uDark',
          'uReach',
          'uIntensity',
          'uStretch',
          'uPresence',
          'uPrism',
          'uSurge',
          'uSpeed',
          'uSpectrum',
          'uSemantic',
          'outColor',
          'gl_FragCoord',
          'main',
        ],
      ],
    },
    {
      file: 'vial-core.js',
      expectedCount: 2,
      mustKeepPerShader: [
        ['a_pos', 'v_uv', 'gl_Position', 'main'],
        [
          'v_uv',
          'outColor',
          'u_res',
          'u_time',
          'u_dark',
          'u_fill',
          'u_tilt',
          'u_tint',
          'u_camp',
          'u_accent',
          'u_critical',
          'u_pendant',
          'u_wetL',
          'u_wetR',
          'u_hoverSlice',
          'u_wave',
          'u_drops',
          'u_bubbles',
          'u_bubShape',
          'u_raySlope',
          'u_ratios',
          'main',
        ],
      ],
    },
  ];

  let totalRawBytes = 0;
  let totalMinBytes = 0;
  for (const spec of shaderSpecs) {
    const templates = extractGlslTemplates(spec.file);
    assert.equal(templates.length, spec.expectedCount, `Expected ${spec.expectedCount} shaders in ${spec.file}`);
    templates.forEach((rawGlsl, idx) => {
      const minified = cdp.minifyGlsl(rawGlsl);
      totalRawBytes += Buffer.byteLength(rawGlsl, 'utf8');
      totalMinBytes += Buffer.byteLength(minified, 'utf8');
      assert.ok(minified.startsWith('#version 300 es\n'), `${spec.file}[${idx}] must start with #version 300 es`);
      assert.ok(checkBalancedDelimiters(minified), `${spec.file}[${idx}] delimiters must be balanced`);
      assert.equal(/voidmain\b/.test(minified), false, `${spec.file}[${idx}] must not glue void and main`);
      for (const sym of spec.mustKeepPerShader[idx]) {
        const symRe = new RegExp(`\\b${sym}\\b`);
        assert.ok(symRe.test(minified), `${spec.file}[${idx}] must preserve interface symbol "${sym}"`);
      }
    });
  }
  assert.ok(totalRawBytes - totalMinBytes > 12000, `Expected significant GLSL size reduction, got ${totalRawBytes} -> ${totalMinBytes}`);
});

test('CSS minifyCss safely shortens 6-digit hex colors in declarations while preserving ID selectors, 8-digit hex, strings, and url()', () => {
  const input = [
    '#aabbcc { color: #ffffff; background: #AABBCC !important; border: 1px solid #334455; }',
    '#aabbcc-box { content: "keep #ffffff here"; background: url(/a/b.png#ffffff); fill: #aabbccdd; }',
    '.grad { background: linear-gradient(90deg, #000000 0%, #ffeedd 100%); }',
  ].join('\n');
  const out = cdp.minifyCss(input);
  assert.ok(out.includes('#aabbcc{color:#fff;background:#ABC!important;border:1px solid #345}'), `Unexpected decl minify: ${out}`);
  assert.ok(out.includes('#aabbcc-box{'), 'Must preserve ID selector with hyphen');
  assert.ok(out.includes('content:"keep #ffffff here"'), 'Must preserve quoted string');
  assert.ok(out.includes('url(/a/b.png#ffffff)'), 'Must preserve url() hash fragment');
  assert.ok(out.includes('fill:#aabbccdd'), 'Must preserve 8-digit RGBA hex');
  assert.ok(out.includes('linear-gradient(90deg,#000 0%,#fed 100%)'), `Must shorten hex inside functions: ${out}`);
});

test('host-workbench-enhancer enforces iframe postMessage protocol/origin allowlist and short-circuits sealed <pre> scans', () => {
  const mkNode = (tag, attrs = {}) => {
    const map = new Map(Object.entries(attrs));
    const listeners = new Map();
    const cls = new Set(String(attrs.class || '').split(/\s+/).filter(Boolean));
    const rawChildren = [];
    const el = {
      nodeType: 1,
      tagName: tag.toUpperCase(),
      _rawChildren: rawChildren,
      children: rawChildren,
      childNodes: [],
      parentElement: null,
      parentNode: null,
      isConnected: true,
      hidden: false,
      style: { setProperty() {}, removeProperty() {} },
      _attrs: map,
      _text: '',
      get textContent() {
        return this.children.length ? this.children.map((c) => c.textContent).join('') : this._text;
      },
      set textContent(v) {
        this._text = String(v ?? '');
      },
      get className() {
        return [...cls].join(' ');
      },
      set className(v) {
        cls.clear();
        for (const c of String(v || '').split(/\s+/).filter(Boolean)) cls.add(c);
        map.set('class', [...cls].join(' '));
      },
      classList: {
        add: (...a) => a.forEach((c) => cls.add(c)),
        remove: (...a) => a.forEach((c) => cls.delete(c)),
        contains: (c) => cls.has(c),
      },
      getAttribute: (k) => (map.has(k) ? map.get(k) : null),
      setAttribute: (k, v) => map.set(k, String(v)),
      hasAttribute: (k) => map.has(k),
      removeAttribute: (k) => map.delete(k),
      appendChild(c) {
        c.parentElement = this;
        c.parentNode = this;
        this.children.push(c);
        this.childNodes.push(c);
        return c;
      },
      insertBefore(c, ref) {
        c.parentElement = this;
        c.parentNode = this;
        const idx = this.children.indexOf(ref);
        if (idx >= 0) this.children.splice(idx, 0, c);
        else this.children.push(c);
        return c;
      },
      remove() {
        if (!this.parentElement) return;
        const i = this.parentElement.children.indexOf(this);
        if (i >= 0) this.parentElement.children.splice(i, 1);
        this.parentElement = null;
      },
      contains(other) {
        let cur = other;
        while (cur) {
          if (cur === this) return true;
          cur = cur.parentElement;
        }
        return false;
      },
      closest(sel) {
        let cur = this;
        while (cur) {
          if (sel.includes('artifact-view') && cur.getAttribute('data-testid') === 'artifact-view') return cur;
          cur = cur.parentElement;
        }
        return null;
      },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 400 }),
      addEventListener(t, fn) {
        if (!listeners.has(t)) listeners.set(t, new Set());
        listeners.get(t).add(fn);
      },
      removeEventListener(t, fn) {
        listeners.get(t)?.delete(fn);
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
        return idx >= 0 ? this.parentElement.children[idx + 1] || null : null;
      },
      querySelectorAll(sel) {
        const res = [];
        const walk = (n) => {
          for (const ch of n._rawChildren) {
            const matchIframe = sel.includes('sidecar-iframe') && ch.tagName === 'IFRAME' && ch.getAttribute('data-testid') === 'sidecar-iframe';
            const matchPre = sel.includes('pre') && ch.tagName === 'PRE';
            const matchResp = sel.includes('planner-response-text') && ch.getAttribute('data-testid') === 'planner-response-text';
            const matchConv = sel.includes('conversation-view') && ch.getAttribute('data-testid') === 'conversation-view';
            const matchCodeLine = sel === '.code-line' && ch.classList.contains('code-line');
            const matchFoldBtn = sel === '.ag-cs-code-fold-btn' && ch.classList.contains('ag-cs-code-fold-btn');
            if (matchIframe || matchPre || matchResp || matchConv || matchCodeLine || matchFoldBtn) res.push(ch);
            walk(ch);
          }
        };
        walk(this);
        return res;
      },
      querySelector(sel) {
        return this.querySelectorAll(sel)[0] || null;
      },
    };
    return el;
  };

  const html = mkNode('html', { 'data-ag-cs-theme': 'dark', 'data-ag-cs-palette': 'obsidian', 'data-ag-cs-lang': 'en' });
  const body = mkNode('body');
  html.appendChild(body);

  const cases = [
    { src: 'plugin://swarm--board-1/', allow: true, expectedOrigin: '*' },
    { src: 'vscode-webview://abc123/index.html', allow: true, expectedOrigin: '*' },
    { src: 'http://127.0.0.1:4321/panel?a=1', allow: true, expectedOrigin: 'http://127.0.0.1:4321' },
    { src: 'http://localhost:8080/x', allow: true, expectedOrigin: 'http://localhost:8080' },
    { src: 'https://127.0.0.1:8443/x', allow: true, expectedOrigin: 'https://127.0.0.1:8443' },
    { src: 'https://localhost/x', allow: true, expectedOrigin: 'https://localhost' },
    { src: '/same-origin/panel.html', allow: true, expectedOrigin: 'https://127.0.0.1:9443' },
    { src: 'https://evil.example.com/steal', allow: false },
    { src: 'http://127.0.0.1.evil.example.com/', allow: false },
    { src: 'http://localhost@evil.example.com/', allow: false },
    { src: '//evil.example.com/proto-relative', allow: false },
    { src: 'javascript:alert(1)', allow: false },
    { src: 'data:text/html,<h1>x</h1>', allow: false },
    { src: '', allow: false },
  ];

  const sentLog = new Map();
  for (const tc of cases) {
    const f = mkNode('iframe', tc.src ? { 'data-testid': 'sidecar-iframe', src: tc.src } : { 'data-testid': 'sidecar-iframe' });
    const hits = [];
    f.contentWindow = { postMessage: (msg, origin) => hits.push({ msg, origin }) };
    sentLog.set(tc, hits);
    body.appendChild(f);
  }

  // Sealed historical <pre> short-circuit check
  const conv = mkNode('div', { 'data-testid': 'conversation-view' });
  const histResp = mkNode('div', { 'data-testid': 'planner-response-text' });
  const pre = mkNode('pre');
  const card = mkNode('div', { class: 'bg-muted border' });
  const hdr = mkNode('div', { class: 'border-b justify-between' });
  const codeBody = mkNode('div');
  for (let i = 0; i < 6; i++) {
    const ln = mkNode('div', { class: 'code-line' });
    ln.textContent = `const x${i} = ${i};`;
    codeBody.appendChild(ln);
  }
  card.appendChild(hdr);
  card.appendChild(codeBody);
  pre.appendChild(card);
  histResp.appendChild(pre);
  const latestResp = mkNode('div', { 'data-testid': 'planner-response-text' });
  conv.appendChild(histResp);
  conv.appendChild(latestResp);
  body.appendChild(conv);

  let preChildrenReads = 0;
  const rawPreChildren = pre.children;
  Object.defineProperty(pre, 'children', {
    get() {
      preChildrenReads += 1;
      return rawPreChildren;
    },
    configurable: true,
  });

  const doc = {
    documentElement: html,
    body,
    createElement: (t) => mkNode(t),
    querySelectorAll: (s) => html.querySelectorAll(s),
    querySelector: (s) => html.querySelector(s),
  };
  const win = {
    innerHeight: 900,
    location: { origin: 'https://127.0.0.1:9443' },
    getComputedStyle: () => ({ getPropertyValue: () => '#111' }),
    addEventListener() {},
    removeEventListener() {},
  };

  const ctl = enhancerMod.createHostEnhancerController({ doc, win, getLang: () => 'en' });
  ctl.sync();

  for (const tc of cases) {
    const hits = sentLog.get(tc);
    if (tc.allow) {
      assert.equal(hits.length, 1, `Expected allowed iframe src="${tc.src}" to receive 1 postMessage`);
      assert.equal(hits[0].origin, tc.expectedOrigin, `Unexpected targetOrigin for src="${tc.src}"`);
    } else {
      assert.equal(hits.length, 0, `Blocked iframe src="${tc.src}" must receive 0 postMessage calls`);
    }
  }

  // Second sync() must short-circuit sealed historical <pre> without iterating pre.children
  assert.ok(preChildrenReads >= 1, 'Initial sync should inspect pre.children');
  const readsAfterFirstSync = preChildrenReads;
  ctl.sync();
  assert.equal(preChildrenReads, readsAfterFirstSync, 'Sealed historical <pre> must short-circuit without reading pre.children again');

  ctl.destroy();

  const enhancerSrc = fs.readFileSync(path.join(ROOT, 'host-workbench-enhancer.js'), 'utf8');
  assert.equal(enhancerSrc.includes('boundFoldBtns'), false, 'Dead boundFoldBtns WeakSet must be removed');
});

test('ui-runtime teardownCore cancels healBlockedExternalPulseBar 220ms timer and ignores late callbacks when destroyed', () => {
  const uiSrc = fs.readFileSync(path.join(ROOT, 'ui-runtime.js'), 'utf8');
  const scheduled = new Map();
  let nextTid = 1;
  let clearedIds = [];
  let resizeEvents = 0;

  const footerAttrs = new Map();
  const footer = {
    classList: { contains: (c) => c === 'agy-composer-footer' },
    getBoundingClientRect: () => ({ width: 640 }),
    getAttribute: (k) => (footerAttrs.has(k) ? footerAttrs.get(k) : null),
    setAttribute: (k, v) => footerAttrs.set(k, String(v)),
    removeAttribute: (k) => footerAttrs.delete(k),
  };
  const pulseBar = {
    parentElement: footer,
    getAttribute: (k) => (k === 'data-layout' ? 'blocked' : null),
  };

  const htmlAttrs = new Map();
  const html = {
    nodeType: 1,
    style: { setProperty() {}, removeProperty() {} },
    getAttribute: (k) => (htmlAttrs.has(k) ? htmlAttrs.get(k) : null),
    setAttribute: (k, v) => htmlAttrs.set(k, String(v)),
    hasAttribute: (k) => htmlAttrs.has(k),
    removeAttribute: (k) => htmlAttrs.delete(k),
  };
  const doc = {
    hidden: false,
    documentElement: html,
    head: { appendChild() {} },
    body: { classList: { contains: () => false }, querySelectorAll: () => [] },
    getElementById: (id) => (id === 'ag-pulse-status-bar' ? pulseBar : null),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    removeEventListener() {},
    createElement: () => ({ style: {}, setAttribute() {}, remove() {} }),
  };
  const win = {
    document: doc,
    location: { href: 'vscode-file://vscode-app/workbench.html', pathname: '/' },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent(ev) {
      if (ev?.type === 'resize') resizeEvents += 1;
    },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
  };

  const sandbox = {
    window: win,
    document: doc,
    globalThis: null,
    Event: class Event {
      constructor(type) {
        this.type = type;
      }
    },
    MutationObserver: class {
      observe() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    },
    WeakSet,
    WeakMap,
    Set,
    Map,
    Proxy,
    performance: { now: () => 0 },
    setTimeout: (fn, ms) => {
      const id = nextTid++;
      scheduled.set(id, { fn, ms });
      return id;
    },
    clearTimeout: (id) => {
      clearedIds.push(id);
      scheduled.delete(id);
    },
    setInterval: () => 999,
    clearInterval: () => {},
  };
  sandbox.globalThis = sandbox;
  win.globalThis = sandbox;

  vm.runInNewContext(uiSrc, sandbox);
  sandbox.__agCsUiMain({ ...cdp.DEFAULT_CONFIG, telemetryModule: 'auto' });

  // Find the 220ms pulse heal timer scheduled during startup
  const healEntry = Array.from(scheduled.entries()).find(([, rec]) => rec.ms === 220);
  assert.ok(healEntry, 'Expected healBlockedExternalPulseBar to schedule a 220ms timer');
  assert.equal(footerAttrs.get('role'), 'banner', 'Footer should temporarily get role="banner" before heal completes');
  const [healId, { fn: healCb }] = healEntry;
  const resizeBeforeDestroy = resizeEvents;

  // Destroy runtime before 220ms elapses -> timer must be cleared and late invocation must be a no-op
  win.__agPrism.destroy();
  assert.ok(clearedIds.includes(healId), 'teardownCore must clearTimeout the 220ms heal timer');
  assert.equal(scheduled.has(healId), false, '220ms heal timer must be removed from pending timers');

  // Even if callback fires late, destroyed guard must prevent DOM mutation and resize dispatch
  healCb();
  assert.equal(footerAttrs.get('role'), 'banner', 'Destroyed guard must prevent late role mutation');
  assert.equal(resizeEvents, resizeBeforeDestroy, 'Destroyed guard must prevent late resize dispatch');
});

test('settings-panel persists Beta sub-tab, localizes Conversation DB Health across all 5 languages, and routes via __agPrismRepoBridge', async () => {
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  const prevStorage = globalThis.localStorage;

  const storeMap = new Map([['ag-prism:settings-open', '1']]);
  const storage = {
    getItem: (k) => (storeMap.has(k) ? storeMap.get(k) : null),
    setItem: (k, v) => storeMap.set(k, String(v)),
    removeItem: (k) => storeMap.delete(k),
  };

  function makeEl(tag, ownerDoc) {
    const cls = new Set();
    const attrs = new Map();
    const listeners = new Map();
    const el = {
      nodeType: 1,
      tagName: tag.toUpperCase(),
      ownerDocument: ownerDoc,
      id: '',
      _text: '',
      innerHTML: '',
      hidden: false,
      disabled: false,
      style: {},
      children: [],
      parentElement: null,
      parentNode: null,
      get isConnected() {
        let p = el;
        while (p) {
          if (p === ownerDoc.documentElement) return true;
          p = p.parentElement;
        }
        return false;
      },
      get className() {
        return [...cls].join(' ');
      },
      set className(v) {
        cls.clear();
        for (const c of String(v || '').split(/\s+/).filter(Boolean)) cls.add(c);
      },
      get textContent() {
        return el.children.length ? el._text + el.children.map((c) => c.textContent).join('') : el._text;
      },
      set textContent(v) {
        el._text = String(v ?? '');
        el.children.length = 0;
      },
      classList: {
        add: (...a) => a.forEach((c) => c && cls.add(c)),
        remove: (...a) => a.forEach((c) => cls.delete(c)),
        contains: (c) => cls.has(c),
      },
      setAttribute(k, v) {
        attrs.set(k, String(v));
        if (k === 'id') el.id = String(v);
        if (k === 'hidden') el.hidden = true;
      },
      getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
      hasAttribute: (k) => attrs.has(k),
      removeAttribute(k) {
        attrs.delete(k);
        if (k === 'hidden') el.hidden = false;
      },
      toggleAttribute(k, f) {
        const on = f === undefined ? !attrs.has(k) : Boolean(f);
        if (on) attrs.set(k, '');
        else attrs.delete(k);
        return on;
      },
      appendChild(c) {
        if (c.parentElement) c.remove();
        c.parentElement = el;
        c.parentNode = el;
        el.children.push(c);
        return c;
      },
      removeChild(c) {
        const i = el.children.indexOf(c);
        if (i >= 0) el.children.splice(i, 1);
        c.parentElement = null;
        c.parentNode = null;
        return c;
      },
      remove() {
        if (el.parentElement) el.parentElement.removeChild(el);
      },
      closest(sel) {
        let cur = el;
        while (cur) {
          if (matches(cur, sel)) return cur;
          cur = cur.parentElement;
        }
        return null;
      },
      querySelectorAll(sel) {
        const out = [];
        const walk = (n) => {
          for (const c of n.children) {
            if (matches(c, sel)) out.push(c);
            walk(c);
          }
        };
        walk(el);
        return out;
      },
      querySelector: (sel) => el.querySelectorAll(sel)[0] || null,
      addEventListener(t, fn) {
        if (!listeners.has(t)) listeners.set(t, []);
        listeners.get(t).push(fn);
      },
      click() {
        for (const fn of listeners.get('click') || []) fn({ stopPropagation() {}, preventDefault() {} });
      },
    };
    return el;
  }

  function matches(el, selList) {
    return selList.split(',').some((raw) => {
      const s = raw.trim();
      if (!s) return false;
      if (s.startsWith('#')) return el.id === s.slice(1);
      let rest = s;
      const tm = rest.match(/^[a-zA-Z0-9-]+/);
      if (tm) {
        if (el.tagName !== tm[0].toUpperCase()) return false;
        rest = rest.slice(tm[0].length);
      }
      for (const m of rest.matchAll(/\.([a-zA-Z0-9_-]+)/g)) {
        if (!el.classList.contains(m[1])) return false;
      }
      for (const m of rest.matchAll(/\[([^\]=]+)(?:="([^"]*)")?\]/g)) {
        if (!el.hasAttribute(m[1])) return false;
        if (m[2] !== undefined && el.getAttribute(m[1]) !== m[2]) return false;
      }
      return true;
    });
  }

  const doc = {
    documentElement: null,
    head: null,
    body: null,
    createElement: (t) => makeEl(t, doc),
    getElementById: (id) => doc.documentElement.querySelector('#' + id),
    querySelectorAll: (s) => doc.documentElement.querySelectorAll(s),
    querySelector: (s) => doc.documentElement.querySelector(s),
  };
  doc.documentElement = makeEl('html', doc);
  doc.head = makeEl('head', doc);
  doc.body = makeEl('body', doc);
  doc.documentElement.appendChild(doc.head);
  doc.documentElement.appendChild(doc.body);

  const dialog = makeEl('div', doc);
  dialog.setAttribute('role', 'dialog');
  const panel = makeEl('div', doc);
  const h2 = makeEl('h2', doc);
  h2.textContent = 'Appearance';
  const anchor = makeEl('div', doc);
  anchor.className = 'space-y-2';
  panel.appendChild(h2);
  panel.appendChild(anchor);
  dialog.appendChild(panel);
  doc.body.appendChild(dialog);

  const repoActions = [];
  const win = {
    document: doc,
    localStorage: storage,
    __agPrismRepoBridge: ({ action }) => {
      repoActions.push(action);
      if (action === 'storage-health') {
        return { ok: true, totalMb: 1280, mainCount: 18, subagentCount: 42, subagentMb: 780, warn: true };
      }
      if (action === 'prepare-archive') {
        return { ok: true, archivableSubagentCount: 39, archivableSubagentMb: 720, archiveScriptPath: '/tmp/archive-subagents.sh' };
      }
      return { ok: true, noRemote: true, branch: 'local' };
    },
  };

  globalThis.document = doc;
  globalThis.window = win;
  globalThis.localStorage = storage;

  const state = settingsPanel.getDefaultSettingsPatch();
  const mount = () =>
    settingsPanel.mountOrSyncSettingsSection({
      version: '1.0.6',
      getLang: () => state.language,
      uiText: (l) => i18nLocales.getUiStrings(l),
      isZh: () => state.language !== 'en' && state.language !== 'ja',
      i18nCore,
      formatSettingsSummary: () => 'summary',
      resolveSettingRowActiveValue: (k) => state[k],
      isSettingButtonMatch: (_k, valJson, cur) => JSON.parse(valJson) === cur,
      saveSetting: (k, v) => { state[k] = v; },
      saveSettingsBatch: (p) => Object.assign(state, p),
      getThoughtTranslateMode: () => state.thoughtTranslate,
      handledGroupClicks: new WeakSet(),
      runSettingsGroupGlide: () => {},
      runGuardedMut: (fn) => fn(),
    });

  try {
    // 1) Beta sub-tab persists across panel close/reopen
    mount();
    let sec = doc.getElementById(settingsPanel.SETTINGS_SEC_ID);
    const betaTab = sec.querySelector('button[data-ag-cs-subtab="beta"]');
    assert.ok(betaTab, 'Beta subtab button must exist');
    betaTab.click();
    assert.equal(storage.getItem('ag-prism:settings-subtab'), 'beta');

    // Simulate panel close & reopen
    sec.remove();
    mount();
    sec = doc.getElementById(settingsPanel.SETTINGS_SEC_ID);
    assert.equal(sec.querySelector('button[data-ag-cs-subtab="beta"]').getAttribute('aria-selected'), 'true', 'Beta subtab must stay selected on reopen');
    assert.equal(sec.querySelector('[data-ag-cs-group="beta"]').hidden, false, 'Beta group must remain visible on reopen');
    assert.equal(sec.querySelector('[data-ag-cs-group="appearance"]').hidden, true, 'Non-Beta groups must stay hidden when Beta subtab is restored');

    // 2) Storage health & archive UI uses 5-language i18n-locales entries and __agPrismRepoBridge
    const requiredStorageKeys = [
      'storageHealthTitle',
      'storageHealthIdle',
      'storageArchiveBtn',
      'storageOk',
      'storageWarn',
      'storageSummaryTpl',
      'storageReadyTpl',
    ];
    for (const lang of ['zh-CN', 'zh-TW', 'yue', 'en', 'ja']) {
      const ui = i18nLocales.getUiStrings(lang);
      for (const k of requiredStorageKeys) {
        assert.ok(typeof ui[k] === 'string' && ui[k].trim().length > 0, `Missing ${k} for ${lang}`);
      }
      state.language = lang;
      sec.remove();
      mount();
      sec = doc.getElementById(settingsPanel.SETTINGS_SEC_ID);
      const chip = sec.querySelector('[data-ag-cs-storage-status]');
      const archiveBtn = sec.querySelector('[data-ag-cs-storage-archive="1"]');
      assert.equal(archiveBtn.textContent, ui.storageArchiveBtn, `Archive button must localize for ${lang}`);
      await new Promise((r) => setTimeout(r, 10));
      assert.equal(chip.getAttribute('data-status'), 'warn');
      assert.ok(chip.textContent.includes(ui.storageWarn), `Health chip must include localized warn copy for ${lang}: ${chip.textContent}`);

      archiveBtn.click();
      await new Promise((r) => setTimeout(r, 10));
      assert.equal(chip.getAttribute('data-status'), 'updated');
      assert.ok(chip.textContent.includes('/tmp/archive-subagents.sh'), `Ready chip must display script path for ${lang}`);
    }
    assert.ok(repoActions.includes('storage-health') && repoActions.includes('prepare-archive'), 'Storage actions must route through __agPrismRepoBridge');

    const spSrc = fs.readFileSync(path.join(ROOT, 'settings-panel.js'), 'utf8');
    assert.equal(spSrc.includes('localRepoPending'), false, 'Duplicate localRepoPending RPC bridge must be removed from settings-panel.js');
  } finally {
    if (prevDoc === undefined) delete globalThis.document;
    else globalThis.document = prevDoc;
    if (prevWin === undefined) delete globalThis.window;
    else globalThis.window = prevWin;
    if (prevStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = prevStorage;
  }
});

test('Main bundle budget <= 704,000 B (< 690 KiB / 706,560 B CI hard limit), sidebarStudio defaults off, dead CSS removed, and v1.0.8-beta.3 metadata aligned', () => {
  assert.equal(cdp.DEFAULT_CONFIG.sidebarStudio, 'off', 'DEFAULT_CONFIG.sidebarStudio must remain "off"');
  const expr = cdp.buildInjectExpression(cdp.DEFAULT_CONFIG);
  const bytes = Buffer.byteLength(expr, 'utf8');
  assert.ok(bytes < 690 * 1024, `Bundle must stay strictly < 706,560 B (690 KiB), got ${bytes} B`);
  assert.ok(bytes <= 704000, `Bundle target <= 704,000 B (headroom >= 2,560 B), got ${bytes} B`);

  const cssRaw = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  assert.equal(cssRaw.includes('data-ag-cs-route'), false, 'Dead selector data-ag-cs-route must be removed from style.css');

  // Verify compiled SLIDER_CSS retains html[data-ces-slider-ready='1']-gated submenu hiding rules, never emits bare ungated [role='menu']:has(), and strips dead .ces-set* CSS
  const styles = [];
  const mkEl = (tag) => ({
    tagName: String(tag).toUpperCase(),
    style: { setProperty() {}, removeProperty() {} },
    children: [],
    attrs: new Map(),
    _text: '',
    set textContent(v) {
      this._text = String(v);
      if (this.tagName === 'STYLE') styles.push(this._text);
    },
    get textContent() { return this._text; },
    setAttribute(k, v) { this.attrs.set(k, String(v)); },
    getAttribute(k) { return this.attrs.get(k) || null; },
    hasAttribute(k) { return this.attrs.has(k); },
    removeAttribute(k) { this.attrs.delete(k); },
    appendChild(c) { this.children.push(c); return c; },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    addEventListener() {},
    removeEventListener() {},
    classList: { add() {}, remove() {}, contains() { return false; } },
  });
  const mockDoc = {
    readyState: 'complete',
    documentElement: mkEl('html'),
    head: mkEl('head'),
    body: mkEl('body'),
    createElement: mkEl,
    getElementById: () => null,
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  const sandbox = {
    document: mockDoc,
    location: { href: 'vscode-file://vscode-app/workbench.html' },
    addEventListener: () => {},
    removeEventListener: () => {},
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    MutationObserver: function () { return { observe() {}, disconnect() {} }; },
    ResizeObserver: function () { return { observe() {}, disconnect() {} }; },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    performance: { now: () => 0 },
    navigator: { userAgent: '' },
    URL, Map, Set, WeakMap, WeakSet, Promise, console, Math, Date, JSON, Array, Object, String, Number, Boolean, Uint8Array, Float32Array, Intl,
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  const runRes = vm.runInNewContext(expr, sandbox);
  assert.equal(runRes?.status, 'ok');
  const injectedCss = styles.join('\n');
  assert.ok(
    injectedCss.includes("html[data-ces-slider-ready='1'] [role='menu']:has([data-testid='model-selector-effort-option'])"),
    'Compiled bundle must retain html[data-ces-slider-ready=1]-gated [role=menu]:has(model-selector-effort-option) CSS'
  );
  assert.ok(
    injectedCss.includes("html[data-ces-slider-ready='1'] [role='menuitem']:has([data-testid='model-selector-effort-group'])>.group-hover"),
    'Compiled bundle must retain gated menuitem group-hover CSS'
  );
  const ungatedMenuHas = [...injectedCss.matchAll(/\[role='menu(?:item)?'\]:has\(/g)].filter((m) => {
    const before = injectedCss.slice(Math.max(0, m.index - 70), m.index);
    return !before.includes("html[data-ces-slider-ready='1']");
  });
  assert.equal(ungatedMenuHas.length, 0, 'Must NEVER emit bare ungated [role=menu*]:has() rules');
  assert.equal(injectedCss.includes('.ces-set-head'), false, 'Dead .ces-set* settings modal CSS must remain stripped');
  assert.ok(injectedCss.includes('data-ces-model-selected'), 'Active model-selected SLIDER_CSS rule must be preserved in bundle');

  // Verify release metadata consistency
  const wbApp = fs.readFileSync(path.join(ROOT, 'workbench/app.js'), 'utf8');
  assert.ok(wbApp.includes('Obsidian Prism v1.0.8-beta.3') && wbApp.includes('GPL-3.0 · 7 CREDITS'), 'workbench/app.js must reflect v1.0.8-beta.3 and GPL-3.0');
  assert.equal(wbApp.includes('Obsidian Prism v1.0.0'), false);
  assert.equal(wbApp.includes('MIT · 7 CREDITS'), false);

  const bugTpl = fs.readFileSync(path.join(ROOT, '.github/ISSUE_TEMPLATE/bug_report.md'), 'utf8');
  assert.ok(bugTpl.includes('`v1.0.8-beta.3`'));
  const manifest = fs.readFileSync(path.join(ROOT, 'installer/setup/app.manifest'), 'utf8');
  assert.ok(manifest.includes('version="1.2.4.0"'));
  for (const rel of [
    'vendor/omni-viewer/omni-client.js',
    'vendor/thought-translator/thought-client.js',
    'vendor/thought-translator/thought-settings-ui.js',
    'vendor/wallpaper/wallpaper-client.js',
    'vendor/wallpaper/wallpaper-settings-ui.js',
  ]) {
    const firstLine = fs.readFileSync(path.join(ROOT, rel), 'utf8').split(/\r?\n/)[0];
    assert.ok(firstLine.includes('v1.0.8-beta.3'), `${rel} header comment must be v1.0.8-beta.3`);
  }
  const changelog = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
  assert.ok(changelog.includes('## [1.0.8-beta.3]') && changelog.includes('## [1.0.8-beta.2]') && changelog.includes('## [1.0.8-beta.1]') && changelog.includes('## [1.0.7]') && !changelog.includes('## [1.0.7-beta.') && changelog.includes('## [1.0.6]') && changelog.includes('## [1.0.5]') && changelog.includes('## [1.0.4]') && changelog.includes('## [1.0.3]') && changelog.includes('## [1.0.2]') && changelog.includes('archive:conversations'));
});

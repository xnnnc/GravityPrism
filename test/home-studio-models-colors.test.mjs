import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');

function makeRichDomNode(tagName, attrs = {}) {
  const attrMap = new Map(Object.entries(attrs).map(([k, v]) => [k, String(v)]));
  const styleProps = new Map();
  const style = new Proxy(
    {
      setProperty(k, v) {
        styleProps.set(k, String(v));
      },
      getPropertyValue(k) {
        return styleProps.get(k) || '';
      },
    },
    {
      get(target, prop) {
        if (prop in target) return target[prop];
        if (typeof prop === 'string') return styleProps.get(prop) || '';
        return undefined;
      },
      set(target, prop, value) {
        if (typeof prop === 'string') styleProps.set(prop, String(value));
        return true;
      },
    }
  );
  const node = {
    tagName: String(tagName || 'div').toUpperCase(),
    children: [],
    parentElement: null,
    style,
    textContent: '',
    isConnected: false,
    get id() {
      return attrMap.get('id') || '';
    },
    set id(v) {
      attrMap.set('id', String(v));
    },
    get className() {
      return attrMap.get('class') || '';
    },
    set className(v) {
      attrMap.set('class', String(v));
    },
    get childElementCount() {
      return this.children.length;
    },
    get firstElementChild() {
      return this.children[0] || null;
    },
    get previousSibling() {
      if (!this.parentElement) return null;
      const i = this.parentElement.children.indexOf(this);
      return i > 0 ? this.parentElement.children[i - 1] : null;
    },
    get nextSibling() {
      if (!this.parentElement) return null;
      const i = this.parentElement.children.indexOf(this);
      return i >= 0 ? this.parentElement.children[i + 1] || null : null;
    },
    set innerHTML(v) {
      if (v === '') {
        for (const c of this.children) {
          c.parentElement = null;
          c.isConnected = false;
        }
        this.children.length = 0;
      }
    },
    setAttribute(k, v) {
      attrMap.set(k, String(v));
    },
    getAttribute(k) {
      return attrMap.has(k) ? attrMap.get(k) : null;
    },
    removeAttribute(k) {
      attrMap.delete(k);
    },
    appendChild(child) {
      if (!child) return child;
      child.parentElement = this;
      child.isConnected = this.isConnected || this.tagName === 'HTML';
      const markConn = (el, conn) => {
        el.isConnected = conn;
        for (const c of el.children) markConn(c, conn);
      };
      markConn(child, child.isConnected);
      this.children.push(child);
      return child;
    },
    insertBefore(child, ref) {
      if (!ref) return this.appendChild(child);
      const idx = this.children.indexOf(ref);
      if (idx < 0) return this.appendChild(child);
      child.parentElement = this;
      const conn = this.isConnected || this.tagName === 'HTML';
      const markConn = (el) => {
        el.isConnected = conn;
        for (const c of el.children) markConn(c);
      };
      markConn(child);
      this.children.splice(idx, 0, child);
      return child;
    },
    removeChild(child) {
      const idx = this.children.indexOf(child);
      if (idx >= 0) {
        this.children.splice(idx, 1);
        child.parentElement = null;
        child.isConnected = false;
      }
      return child;
    },
    addEventListener() {},
    removeEventListener() {},
    contains(target) {
      if (target === this) return true;
      return this.children.some((c) => c.contains(target));
    },
    querySelectorAll(sel) {
      const out = [];
      const matchSimple = (el, s) => {
        if (s.startsWith('#')) return el.id === s.slice(1);
        if (s.startsWith('.')) return el.className.split(/\s+/).includes(s.slice(1));
        const am = s.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
        if (am) return am[2] === undefined ? el.getAttribute(am[1]) !== null : el.getAttribute(am[1]) === am[2];
        return el.tagName === s.toUpperCase();
      };
      const visit = (el) => {
        for (const c of el.children) {
          if (matchSimple(c, sel)) out.push(c);
          visit(c);
        }
      };
      visit(this);
      return out;
    },
    querySelector(sel) {
      return this.querySelectorAll(sel)[0] || null;
    },
  };
  return node;
}

test('Issue #82: resolveHomeModelColours assigns 100% distinct, family-intuitive, order-stable dark/light colors for 8..30+ models', () => {
  const panelMod = require(path.join(ROOT, 'home-studio-panel.js'));
  assert.equal(typeof panelMod.resolveHomeModelColours, 'function');

  // 1) 同阵营多模型（Gemini x4 + Claude x2 + GPT x2 + DeepSeek x1 + Qwen x1 = 10 models）
  const models10 = [
    'Gemini 4 Carbon',
    'Gemini 4 Neon',
    'Gemini 4 Hydrogen',
    'Gemini 3.1 Pro',
    'Claude Opus 4.5',
    'Claude Sonnet 4.5',
    'GPT-5',
    'o3-mini',
    'DeepSeek R1',
    'Qwen 2.5 Max',
  ];
  const mapA = panelMod.resolveHomeModelColours(models10);
  const mapB = panelMod.resolveHomeModelColours([...models10].reverse());
  assert.deepEqual(mapA, mapB, 'Color assignment must be deterministic regardless of input array order');

  const darkSet10 = new Set(models10.map((id) => mapA[id].dark));
  const lightSet10 = new Set(models10.map((id) => mapA[id].light));
  assert.equal(darkSet10.size, models10.length, 'All 10 models must get distinct dark hex colors');
  assert.equal(lightSet10.size, models10.length, 'All 10 models must get distinct light hex colors');

  // 验证阵营色调保持直觉一致（Gemini 偏蓝青靛、Claude 偏暖琥珀橙珊瑚、GPT 偏翠绿薄荷、DeepSeek 偏紫）
  for (const gId of ['Gemini 4 Carbon', 'Gemini 4 Neon', 'Gemini 4 Hydrogen', 'Gemini 3.1 Pro']) {
    assert.equal(mapA[gId].camp, 'gemini');
  }
  assert.equal(mapA['Claude Opus 4.5'].camp, 'claude');
  assert.equal(mapA['Claude Sonnet 4.5'].camp, 'claude');
  assert.equal(mapA['GPT-5'].camp, 'gpt');
  assert.equal(mapA['o3-mini'].camp, 'gpt');
  assert.equal(mapA['DeepSeek R1'].camp, 'deepseek');

  // 2) > 10 models（16 models, 含 7 个同阵营 Gemini 溢出到全局不重复色板）
  const models16 = [
    ...models10,
    'Gemini 3 Flash',
    'Gemini 2.5 Pro',
    'Gemini 2.0 Flash',
    'Claude Haiku 4.5',
    'Codex Mini',
    'Llama 4 Maverick',
  ];
  const map16 = panelMod.resolveHomeModelColours(models16);
  assert.equal(new Set(models16.map((id) => map16[id].dark)).size, 16, '16 models must have 16 unique dark colors');
  assert.equal(new Set(models16.map((id) => map16[id].light)).size, 16, '16 models must have 16 unique light colors');

  // 3) 超大规模 32 models 触发动态黄金角扩展调色板仍 100% 互异
  const models32 = Array.from({ length: 32 }, (_, i) => `Custom-Model-${i + 1}`);
  const map32 = panelMod.resolveHomeModelColours(models32);
  assert.equal(new Set(models32.map((id) => map32[id].dark)).size, 32, '32 models must still produce 32 unique dark colors');
  assert.equal(new Set(models32.map((id) => map32[id].light)).size, 32, '32 models must still produce 32 unique light colors');
  for (const id of models32) {
    assert.match(map32[id].dark, /^#[0-9A-F]{6}$/);
    assert.match(map32[id].light, /^#[0-9A-F]{6}$/);
  }
});

test('Issue #82: Models tab renders matching unique segment & legend swatch colors for 12+ models with light/dark CSS support', () => {
  const src = fs.readFileSync(path.join(ROOT, 'home-studio-panel.js'), 'utf8');
  const usageCore = require(path.join(ROOT, 'usage-core.js'));

  const html = makeRichDomNode('html');
  html.isConnected = true;
  const head = makeRichDomNode('head');
  const body = makeRichDomNode('body');
  const home = makeRichDomNode('div', { class: 'agy-home' });
  const greeting = makeRichDomNode('div', { 'data-testid': 'home-greeting' });
  home.appendChild(greeting);
  body.appendChild(home);
  html.appendChild(head);
  html.appendChild(body);

  const clickHandlers = new WeakMap();
  const origCreate = makeRichDomNode;
  const fakeDoc = {
    documentElement: html,
    head,
    body,
    title: 'obsidian-prism',
    createElement: (t) => {
      const n = origCreate(t);
      n.addEventListener = (ev, fn) => {
        if (ev === 'click') clickHandlers.set(n, fn);
      };
      return n;
    },
    createElementNS: (_ns, t) => origCreate(t),
    getElementById: (id) => html.querySelector(`#${id}`),
    querySelector: (s) => html.querySelector(s),
    querySelectorAll: (s) => html.querySelectorAll(s),
  };

  const sb = {
    document: fakeDoc,
    window: null,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    requestAnimationFrame: () => 0,
    cancelAnimationFrame() {},
    setTimeout,
    clearTimeout,
    Map,
    Set,
    Array,
    Object,
    Math,
    Number,
    String,
    Boolean,
    Date,
    JSON,
    Promise,
  };
  sb.window = sb;
  sb.globalThis = sb;
  vm.runInNewContext(src, sb);

  const modelList = [
    'Gemini 4 Carbon',
    'Gemini 4 Neon',
    'Gemini 4 Hydrogen',
    'Gemini 3.1 Pro',
    'Gemini 3 Flash',
    'Claude Opus 4.5',
    'Claude Sonnet 4.5',
    'Claude Haiku 4.5',
    'GPT-5',
    'o3-mini',
    'DeepSeek R1',
    'Qwen 2.5 Max',
  ];
  const dayModels = Object.fromEntries(modelList.map((id, idx) => [id, (12 - idx) * 1000]));
  const stubUsageCore = {
    ...usageCore,
    HOME_MODEL_ROWS: 20,
    aggregateUsageRollup: () => ({
      workspaces: [],
      sessions: 12,
      calls: 48,
      tokens: 78000,
      subagentTokens: 0,
      cacheHitRate: 0.5,
      activeDays: 1,
      model: modelList[0],
      grid: { cells: [] },
      models: modelList.map((id, idx) => ({
        id,
        tokens: (12 - idx) * 1000,
        sessions: 1,
        input: (12 - idx) * 700,
        output: (12 - idx) * 300,
        cacheHitRate: 0.5,
      })),
      modelDays: [{ date: '2026-11-25', models: dayModels }],
    }),
  };

  const ctl = sb.__agPrismHomeStudioPanel.createHomeStudioPanelController({
    usageCore: stubUsageCore,
    isDestroyed: () => false,
    getHomeLayout: () => 'studio',
    getLang: () => 'en',
    uiText: () => ({}),
    getDisplayName: () => '',
    ensureHooks: () => null,
    canMountRealCanvas: () => false,
    setAttrIfChanged: (el, k, v) => el.setAttribute(k, v),
    runGuardedMut: (fn) => fn(),
  });

  ctl.renderHomePanel();
  const modelsTabBtn = home.querySelector('[data-tab="models"]');
  assert.ok(modelsTabBtn);
  clickHandlers.get(modelsTabBtn)();

  const styleEl = fakeDoc.getElementById('ag-prism-studio-v101-css');
  assert.ok(styleEl && styleEl.textContent.includes('[data-ag-mc]{background-color:var(--_mc-d);'));
  assert.ok(styleEl.textContent.includes('data-ag-cs-theme="light"') && styleEl.textContent.includes('var(--_mc-l)'));

  const swatches = home.querySelectorAll('.ag-cs-home-model-swatch');
  const segs = home.querySelectorAll('.ag-cs-home-chart-seg');
  assert.equal(swatches.length, 12);
  assert.equal(segs.length, 12);

  const swatchDark = swatches.map((s) => s.style.getPropertyValue('--_mc-d'));
  const swatchLight = swatches.map((s) => s.style.getPropertyValue('--_mc-l'));
  const segDark = segs.map((s) => s.style.getPropertyValue('--_mc-d'));
  assert.equal(new Set(swatchDark).size, 12, 'All 12 rendered legend swatches must have unique dark colors');
  assert.equal(new Set(swatchLight).size, 12, 'All 12 rendered legend swatches must have unique light colors');
  assert.deepEqual(new Set(segDark), new Set(swatchDark), 'Stacked bar segments and legend swatches must use the exact same color set');
});

test('Issue #82 hygiene: home-studio-panel.js keeps LF, 0 BOM, 0 forbidden words, and 0 B Channel 1 impact', () => {
  const cdp = require(path.join(ROOT, 'cdp.js'));
  assert.equal(cdp.RUNTIME_PARTS.includes('home-studio-panel.js'), false, 'home-studio-panel.js must remain deferred (0 B Channel 1 impact)');
  const panelRaw = fs.readFileSync(path.join(ROOT, 'home-studio-panel.js'));
  assert.equal(panelRaw[0] === 0xef && panelRaw[1] === 0xbb && panelRaw[2] === 0xbf, false, '0 BOM');
  const panelText = panelRaw.toString('utf8');
  assert.equal(panelText.includes('\r\n'), false, '0 CRLF');
  assert.equal(/八方旅人|octopath/i.test(panelText), false, '0 forbidden words');
  assert.equal(panelText.includes(':has('), false, '0 :has( in home-studio-panel.js');
});

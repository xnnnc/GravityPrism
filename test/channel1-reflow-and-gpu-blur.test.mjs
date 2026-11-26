import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

test('upstream-client skips checkVisibility() on single trigger and filters sidebar/hover-card mutations in memoryOnly mode', () => {
  const upSrc = fs.readFileSync(path.join(ROOT, 'vendor/effort-slider/upstream-client.js'), 'utf8');
  let moCb = null;
  let queries = 0;
  let trigCheckVis = 0;
  const singleTrig = {
    nodeType: 1, isConnected: true, hidden: false, style: {},
    matches: () => true, closest: () => null, getAttribute: () => null, hasAttribute: () => false,
    checkVisibility() { trigCheckVis++; return true; },
  };
  const fakeDoc = {
    body: { nodeType: 1, querySelector: () => { queries++; return null; }, querySelectorAll: () => [], appendChild() {} },
    head: { appendChild() {} },
    documentElement: { getAttribute: () => null },
    getElementById: () => null,
    createElement: () => ({ id: '', textContent: '', style: {}, setAttribute() {}, appendChild() {}, classList: { add() {}, remove() {} } }),
    querySelector: () => { queries++; return null; },
    querySelectorAll: (sel) => (String(sel).includes('model-selector-trigger') ? [singleTrig] : []),
    addEventListener() {}, removeEventListener() {},
  };
  const sb = {
    window: null, document: fakeDoc, __agCodexEffortSliderDisableAutoBoot: true,
    MutationObserver: class { constructor(cb) { moCb = cb; } observe() {} disconnect() {} },
    Set, Map, WeakMap, Array, Object, Math, Number, String, Boolean, Date, Promise, RegExp, JSON,
  };
  sb.window = sb; sb.globalThis = sb;
  vm.runInNewContext(upSrc, sb);

  assert.equal(sb.AntigravityCodexEffortSlider.findAntigravityTrigger(fakeDoc), singleTrig);
  assert.equal(trigCheckVis, 0, 'Single-trigger findAntigravityTrigger must skip synchronous checkVisibility() reflow');

  const obs = sb.AntigravityCodexEffortSlider.installEffortMemoryGuard({ document: fakeDoc, window: sb, MutationObserver: sb.MutationObserver });
  const baseQ = queries;
  const hoverCard = { nodeType: 1, closest: (s) => (s.includes('data-hover-card-popup') ? {} : null) };
  const asideRow = { nodeType: 1, closest: (s) => (s.includes('aside') ? {} : null) };
  moCb([{ type: 'childList', target: hoverCard }, { type: 'childList', target: asideRow }]);
  assert.equal(queries, baseQ, 'installEffortMemoryGuard must skip hover-card and aside mutations with 0 scan() queries');
  obs.stop();
});

test('conv-aura, crystal-prism-core, and sidebar-client enforce ForcedReflow and heavy GPU blur guards', () => {
  const convAuraSrc = fs.readFileSync(path.join(ROOT, 'conv-aura.js'), 'utf8');
  assert.ok(
    convAuraSrc.includes('mountBrandHorizonGlow(glowCanvas, { width: 0, height: 0 })'),
    'conv-aura.js must pass zero initial dimensions to mountBrandHorizonGlow'
  );

  const sbClient = fs.readFileSync(path.join(ROOT, 'vendor/sidebar-studio/sidebar-client.js'), 'utf8');
  assert.equal(sbClient.includes('feGaussianBlur'), false, 'sidebar-client.js must not ship 11-filter feGaussianBlur brand SVG');
  assert.equal(sbClient.includes('blur(96px)'), false, 'sidebar-client.js must not use blur(96px) aura orbs');

  const crystalCore = require(path.join(ROOT, 'crystal-prism-core.js'));
  let rectCalls = 0;
  const mockCv = {
    width: 240, height: 28,
    getBoundingClientRect() { rectCalls++; return { left: 100, top: 200, width: 240, height: 28 }; },
    getContext: (t) => (t === '2d' ? { save() {}, restore() {}, clearRect() {}, beginPath() {}, roundRect() {}, clip() {}, fillRect() {}, stroke() {}, moveTo() {}, lineTo() {}, arc() {}, setTransform() {}, createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }) } : null),
    addEventListener() {}, removeEventListener() {},
  };
  const bar = crystalCore.mountCrystalPrismBar(mockCv, { force2D: true, getState: () => ({ isDark: true }) });
  const baseRectCalls = rectCalls;
  for (let i = 0; i < 20; i++) bar.setPointerClient(120 + i * 2, 210);
  assert.equal(rectCalls, baseRectCalls, 'mountCrystalPrismBar.setPointerClient must reuse cached rect across rapid pointer moves');
  bar.dispose();
});

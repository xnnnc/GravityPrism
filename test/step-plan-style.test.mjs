import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const cdp = require('../cdp.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('step-plan checklist card and home-panel align with Obsidian Prism floating overview-shell optics across light and dark themes', () => {
  const rawBuf = fs.readFileSync(path.join(ROOT, 'style.css'));
  assert.equal(rawBuf[0] === 0xef && rawBuf[1] === 0xbb && rawBuf[2] === 0xbf, false, 'style.css must have 0 UTF-8 BOM');
  const css = rawBuf.toString('utf8');
  assert.equal(css.includes('\r'), false, 'style.css must have 0 CRLF');

  const lightBlockIdx = css.indexOf('html[data-ag-cs-style][data-ag-cs-theme="light"]');
  assert.ok(lightBlockIdx > 0, 'style.css must contain light-theme override block');

  const baseSection = css.slice(0, lightBlockIdx);
  const lightSection = css.slice(lightBlockIdx);

  const spLine = css.split('\n').find((l) => l.includes('[data-testid="step-plan-item"]{')) || '';
  assert.ok(spLine.length > 0, 'must style step-plan-item');

  // PR #43 + v1.0.8 layered monochrome mirror optics & 5-state obsidian star-core icons on step-plan
  assert.ok(spLine.includes('& [data-testid="step-plan"]{'), 'must style step-plan card');
  assert.ok(spLine.includes('border-radius:13px !important;'), 'step-plan must match overview-shell 13px radius');
  assert.ok(spLine.includes('var(--ag-cs-menu-bg,var(--ag-cs-panel-bg,rgba(14,16,22,.94)))'), 'step-plan must share overview-shell dark obsidian surface');
  assert.ok(spLine.includes('radial-gradient(108% 52px at 50% 0%,rgba(168,200,255,.048) 0%,transparent 74%),var(--ag-cs-menu-sheen)'), 'step-plan must layer restrained cool-silver top diffusion over sheen');
  assert.ok(spLine.includes('var(--ag-cs-menu-bd)'), 'step-plan must share overview-shell 1px stepped border');
  assert.ok(spLine.includes('inset 0 1px 0 rgba(235,243,255,.14)'), 'step-plan must render crisp icy-silver top specular edge');
  assert.ok(spLine.includes('&[data-ag-sp-running="1"]{') && spLine.includes('rgba(56,176,255,.15)'), 'running step-plan must render nebula cyan-violet top ambient glow');
  assert.ok(spLine.includes('& [data-testid="step-plan-chip"]{'), 'must style step-plan-chip');
  assert.ok(spLine.includes('&[data-status="in_progress"]{--_sc:var(--warning);') && spLine.includes('&>svg{'), 'must differentiate paused in_progress svg with static amber obsidian core');
  assert.ok(spLine.includes('&[data-status="done"]{--_sc:var(--success);') && spLine.includes('drop-shadow('), 'done state must render obsidian star-core emerald ring + glowing checkmark');
  assert.ok(spLine.includes('&[data-status="pending"]{') && spLine.includes('width:3.5px;height:3.5px;'), 'pending state must render obsidian well + centered 3.5px dormant star dot');
  assert.ok(spLine.includes('&[data-status="failed"]{--_sc:var(--error);'), 'failed state must render obsidian core + crimson ring + cross');
  assert.ok(spLine.includes('&[data-status="skipped"]{') && spLine.includes('width:6px;height:1.5px;'), 'skipped state must render dashed ring + centered 6x1.5px dash');
  assert.ok(spLine.includes('translate:-50% -50%;') && !spLine.includes('transform:translate('), 'pseudo-element centering must use individual translate before individual rotate');
  assert.equal(spLine.includes('opacity:'), false, 'step-plan-item text must not stack low opacity over --muted-foreground');

  // Overview-shell & step-plan 4s GPU opacity breathing ambient + strict pause guards
  assert.ok(baseSection.includes('@keyframes ag-ov-br{'), 'must define GPU-only opacity breathing keyframe for running ambient');
  assert.ok(baseSection.includes('animation:ag-ov-br 4s ease-in-out infinite;'), 'running overview-shell & step-plan ::after must breathe over 4s');
  assert.ok(baseSection.includes('[data-ag-overview-running="1"]::after,& [data-ag-sp-running="1"]::after,') && baseSection.includes('animation-play-state:paused !important;'), 'win-blur/pp-open must pause running ambient breathing');
  assert.ok(baseSection.includes('html[data-ag-cs-style]:not(#_) :is(.no-transitions,.no-transitions *){transition:none !important;animation:none !important;}'), 'must preserve v2.35.1 .no-transitions session-switch freeze');
  assert.ok(baseSection.includes('& [data-lexical-editor="true"]{min-height:40px !important;font-size:14px !important;line-height:22px !important;transition:none !important;}'), 'must disable lexical editor 100ms collapse transition');
  assert.ok(baseSection.includes(':not([data-testid*="home-wallpaper"]):not([class*="home-wallpaper"])'), 'must yield to v2.35.1 native home-wallpaper layer');

  // State transition keyframe, reduced-motion (--_sa:none), and Windows High Contrast fallback
  const kfLine = css.split('\n').find((l) => l.includes('@keyframes ag-sp-in{')) || '';
  assert.ok(kfLine.length > 0, 'must define restrained ag-sp-in transition keyframe');
  assert.equal(kfLine.includes('scale(1.08)'), false, 'step-plan transition must avoid bounce overshoot');
  assert.ok(baseSection.includes('@media (forced-colors:active){[data-testid="step-plan-item"]>:first-child{&>svg{display:block !important;}'), 'forced-colors must restore native SVG icons');
  assert.ok(baseSection.includes('--ag-spring-sidebar:linear;--_sa:none;'), 'motion="off" must disable step-plan state animations via --_sa:none');
  assert.ok(baseSection.includes('@media (prefers-reduced-motion:reduce){html[data-ag-cs-style]{--_sa:none;}'), 'prefers-reduced-motion must disable step-plan state animations via --_sa:none');
  assert.ok(baseSection.includes('--ag-cs-run-core:#FFFFFF;--_si:#000;'), 'light theme must flip inner glyph tint polarity via --_si:#000');

  // Home panel upgraded to floating overview-shell material while preserving backdrop-filter:none & zero blur(
  const homePanelLine = css.split('\n').find((l) => l.startsWith('.ag-cs-home-panel{')) || '';
  assert.ok(homePanelLine.includes('border-radius:13px;'), '.ag-cs-home-panel must share overview-shell 13px radius');
  assert.ok(homePanelLine.includes('var(--ag-cs-menu-bg,'), '.ag-cs-home-panel must share overview-shell obsidian surface');
  assert.ok(homePanelLine.includes('var(--ag-cs-menu-sheen)'), '.ag-cs-home-panel must share overview-shell top-light sheen');
  assert.ok(homePanelLine.includes('backdrop-filter:none') && !homePanelLine.includes('blur('), '.ag-cs-home-panel must keep backdrop-filter:none with zero blur(');

  // Shared inset:0 prism-rim canvas positioning for overview-shell, step-plan, and home-panel
  assert.ok(baseSection.includes('[data-ag-cs-prism-mirror="1"]>.ag-cs-prism-rim-cv,& [data-testid="step-plan"]>.ag-cs-prism-rim-cv,& .ag-cs-home-panel>.ag-cs-prism-rim-cv{'), 'step-plan and home-panel must mount inset:0 prism-rim canvas');

  // Light theme crystal floating surface alignment
  assert.ok(lightSection.includes('& [data-testid="step-plan"]{background-color:var(--ag-cs-menu-bg-l,'), 'light theme must align step-plan with crystal overview-shell');
  assert.ok(lightSection.includes('& .ag-cs-home-panel{background-color:var(--ag-cs-menu-bg-l,'), 'light theme must align home-panel with crystal overview-shell');

  // CSS hygiene & brace balance & Channel 1 budget
  assert.equal(/:has\(/.test(css), false, 'style.css must have 0 :has() selectors');
  assert.equal(/[^\x00-\x7F]/.test(css), false, 'style.css must remain pure ASCII');
  let depth = 0;
  for (const ch of css) {
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    assert.ok(depth >= 0, 'style.css must never close unopened brace');
  }
  assert.equal(depth, 0, 'style.css braces must be balanced');

  const minified = cdp.minifyCss(css);
  assert.ok(minified.includes('[data-testid="step-plan"]'), 'minified CSS must retain step-plan rules');
  assert.ok(minified.includes('[data-testid="step-plan-item"]'), 'minified CSS must retain step-plan-item rules');
  for (const lang of ['auto', 'zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'es', 'fr', 'de']) {
    const ch1Bytes = Buffer.byteLength(cdp.buildInjectExpression({ ...cdp.DEFAULT_CONFIG, language: lang }, { bundleCachePath: '' }), 'utf8');
    assert.ok(ch1Bytes < 580000, `Channel 1 (${lang}) bundle (${ch1Bytes} B) must stay < 580,000 B`);
  }
});

test('prism-rim-canvas caps step-plan rims to newest 2 visible expanded cards, mounts/recycles home-panel rim, and honors pp-open & motion=off 0fps sleep', () => {
  const rimSrc = fs.readFileSync(path.join(ROOT, 'prism-rim-canvas.js'), 'utf8');
  let now = 1000;
  let rafSeq = 1;
  const rafs = new Map();
  let ioCb = null;
  const ioObserved = new Set();

  const makeEl = (tag, opts = {}) => {
    const attrs = new Map(Object.entries(opts.attrs || {}));
    const kids = [];
    const el = {
      tagName: tag.toUpperCase(),
      className: opts.className || '',
      isConnected: true,
      hidden: false,
      parentElement: null,
      style: {
        display: '',
        visibility: '',
        setProperty() {},
        removeProperty() {},
      },
      _rect: opts.rect || { left: 100, top: 100, right: 500, bottom: 260, width: 400, height: 160 },
      get children() { return kids; },
      get firstElementChild() { return kids[0] || null; },
      get nextElementSibling() {
        const p = this.parentElement;
        if (!p) return null;
        const idx = p.children.indexOf(this);
        return idx >= 0 ? p.children[idx + 1] || null : null;
      },
      classList: { contains: (c) => el.className.split(/\s+/).includes(c) },
      getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
      setAttribute: (k, v) => attrs.set(k, String(v)),
      hasAttribute: (k) => attrs.has(k),
      removeAttribute: (k) => attrs.delete(k),
      appendChild(c) { c.parentElement = el; c.isConnected = true; kids.push(c); return c; },
      remove() {
        this.isConnected = false;
        if (this.parentElement) {
          const i = this.parentElement.children.indexOf(this);
          if (i >= 0) this.parentElement.children.splice(i, 1);
          this.parentElement = null;
        }
      },
      querySelector: (s) => (s === '.ag-cs-prism-rim-cv' ? kids.find((k) => k.classList.contains('ag-cs-prism-rim-cv')) || null : null),
      getBoundingClientRect: () => el._rect,
    };
    if (tag === 'canvas') {
      el.width = 0;
      el.height = 0;
      el._strokeStops = [];
      el.getContext = (t) => (t === '2d' ? {
        globalAlpha: 1,
        lineWidth: 1,
        strokeStyle: null,
        fillStyle: null,
        save() {},
        restore() {},
        clip() {},
        fillRect() {},
        translate() {},
        clearRect() {},
        beginPath() {},
        roundRect() {},
        moveTo() {},
        lineTo() {},
        closePath() {},
        fill() {},
        stroke() { if (this.strokeStyle?._stops) el._strokeStops = this.strokeStyle._stops.slice(); },
        createRadialGradient: () => { const _stops = []; return { _stops, addColorStop(o, c) { _stops.push([o, c]); } }; },
        createLinearGradient: () => ({ addColorStop() {} }),
      } : null);
    }
    return el;
  };

  // 4 step-plan cards: sp0 (oldest, visible), sp1 (visible), sp2 (newest visible), sp3 (offscreen below viewport)
  const sp0 = makeEl('div', { attrs: { 'data-testid': 'step-plan' }, rect: { left: 80, top: 60, right: 480, bottom: 180, width: 400, height: 120 } });
  const sp1 = makeEl('div', { attrs: { 'data-testid': 'step-plan' }, rect: { left: 80, top: 220, right: 480, bottom: 340, width: 400, height: 120 } });
  const sp2 = makeEl('div', { attrs: { 'data-testid': 'step-plan' }, rect: { left: 80, top: 380, right: 480, bottom: 500, width: 400, height: 120 } });
  const sp3 = makeEl('div', { attrs: { 'data-testid': 'step-plan' }, rect: { left: 80, top: 1200, right: 480, bottom: 1320, width: 400, height: 120 } });
  const homePanel = makeEl('section', { className: 'ag-cs-home-panel', attrs: { 'data-ag-cs-prism-box': '1' }, rect: { left: 120, top: 120, right: 640, bottom: 440, width: 520, height: 320 } });
  const allPlans = [sp0, sp1, sp2, sp3];
  const allHosts = () => [...allPlans, homePanel].filter((e) => e.isConnected);

  const htmlAttrs = new Map([['data-ag-cs-motion', 'standard'], ['data-ag-cs-ambient', '1']]);
  const htmlEl = {
    getAttribute: (k) => (htmlAttrs.has(k) ? htmlAttrs.get(k) : null),
    setAttribute: (k, v) => htmlAttrs.set(k, String(v)),
    removeAttribute: (k) => htmlAttrs.delete(k),
    addEventListener() {},
    removeEventListener() {},
  };

  const fakeDoc = {
    hidden: false,
    documentElement: htmlEl,
    createElement: (t) => makeEl(t),
    getElementById: () => null,
    addEventListener() {},
    removeEventListener() {},
    querySelectorAll(sel) {
      if (sel.includes('[data-testid="step-plan"]')) return allPlans.filter((e) => e.isConnected);
      if (sel.includes('[data-ag-cs-prism-box="1"]')) return allHosts().filter((e) => e.getAttribute('data-ag-cs-prism-box') === '1');
      if (sel.includes('.ag-cs-prism-rim-cv')) return allHosts().map((h) => h.querySelector('.ag-cs-prism-rim-cv')).filter(Boolean);
      if (sel.includes('[data-ag-cs-prism-cv]')) return allHosts().filter((h) => h.hasAttribute('data-ag-cs-prism-cv'));
      return [];
    },
  };

  const flushRaf = (dt = 16) => {
    now += dt;
    const list = [...rafs.values()];
    rafs.clear();
    list.forEach((fn) => fn(now));
  };

  const sb = {
    document: fakeDoc,
    innerWidth: 1440,
    innerHeight: 900,
    devicePixelRatio: 1,
    performance: { now: () => now },
    requestAnimationFrame: (fn) => { const id = rafSeq++; rafs.set(id, fn); return id; },
    cancelAnimationFrame: (id) => rafs.delete(id),
    setTimeout: () => 0,
    clearTimeout() {},
    getComputedStyle: () => ({ borderTopLeftRadius: '13px' }),
    IntersectionObserver: class {
      constructor(cb) { ioCb = cb; }
      observe(el) { ioObserved.add(el); }
      unobserve(el) { ioObserved.delete(el); }
      disconnect() { ioObserved.clear(); }
    },
    addEventListener() {},
    removeEventListener() {},
    Set, WeakSet, Map, Array, Math, Number, String, Boolean,
  };
  sb.window = sb;
  sb.globalThis = sb;
  vm.runInNewContext(rimSrc, sb);

  const ctl = sb.__agPrismRimCanvas.createPrismRimCanvasController({
    isDestroyed: () => false,
    isDarkTheme: () => true,
    motionReduced: () => false,
    getMinFrameGapMs: () => 0,
    getAmbientIntensity: () => 1,
    getAccentTone: () => 'follow',
    canMountRealCanvas: () => true,
    setAttrIfChanged: (el, k, v) => el.setAttribute(k, v),
    runGuardedMut: (fn) => fn(),
  });

  // 1) Initial pointer move mounts ONLY newest 2 visible expanded step-plans (sp2, sp1) + homePanel with monochrome ice-silver mirror rim
  ctl.onPointerMove({ clientX: 200, clientY: 300 });
  flushRaf();
  assert.equal(sp2.getAttribute('data-ag-cs-prism-box'), '1');
  assert.equal(sp1.getAttribute('data-ag-cs-prism-box'), '1');
  assert.equal(sp2.getAttribute('data-ag-cs-prism-mirror'), '1', 'mounted step-plan must enable monochrome mirror rim');
  assert.equal(sp1.getAttribute('data-ag-cs-prism-mirror'), '1', 'mounted step-plan must enable monochrome mirror rim');
  assert.equal(homePanel.getAttribute('data-ag-cs-prism-mirror'), '1', 'home-panel must enable monochrome mirror rim');
  assert.equal(sp0.getAttribute('data-ag-cs-prism-box'), null, '3rd older step-plan must not mount rim canvas');
  assert.equal(sp0.getAttribute('data-ag-cs-prism-mirror'), null, 'unmounted step-plan must not carry prism-mirror');
  assert.equal(sp3.getAttribute('data-ag-cs-prism-box'), null, 'offscreen step-plan must not mount rim canvas');
  assert.ok(sp2.querySelector('.ag-cs-prism-rim-cv'));
  assert.ok(sp1.querySelector('.ag-cs-prism-rim-cv'));
  assert.equal(sp0.querySelector('.ag-cs-prism-rim-cv'), null);
  const homeCv1 = homePanel.querySelector('.ag-cs-prism-rim-cv');
  assert.ok(homeCv1 && homeCv1.width === 520 && homeCv1.height === 320, 'home-panel rim canvas must mount at exact inset:0 bounds');
  assert.ok(homeCv1._strokeStops.some(([, c]) => c === 'rgba(232,240,252,0.56)'), 'home-panel rim must stroke ice-silver monochrome mirror edge (no rainbow)');
  assert.ok(sp1.querySelector('.ag-cs-prism-rim-cv')._strokeStops.some(([, c]) => c === 'rgba(232,240,252,0.56)'), 'step-plan rim must stroke ice-silver monochrome mirror edge (no rainbow)');

  // 2) Scrolling sp2 out of viewport via IntersectionObserver immediately unmounts & reclaims 0x0 VRAM, promoting sp0
  const sp2Cv = sp2.querySelector('.ag-cs-prism-rim-cv');
  ioCb([
    { target: sp0, isIntersecting: true, boundingClientRect: sp0._rect },
    { target: sp1, isIntersecting: true, boundingClientRect: sp1._rect },
    { target: sp2, isIntersecting: false, boundingClientRect: { left: 80, top: -200, right: 480, bottom: -80, width: 400, height: 120 } },
    { target: sp3, isIntersecting: false, boundingClientRect: sp3._rect },
  ]);
  assert.equal(sp2.getAttribute('data-ag-cs-prism-box'), null, 'scrolled-out step-plan must lose prism-box immediately');
  assert.equal(sp2.getAttribute('data-ag-cs-prism-mirror'), null, 'scrolled-out step-plan must lose prism-mirror immediately');
  assert.equal(sp2.querySelector('.ag-cs-prism-rim-cv'), null, 'scrolled-out step-plan canvas must be removed immediately');
  assert.equal(sp2Cv.width, 0, 'scrolled-out step-plan canvas VRAM must shrink to 0x0');
  assert.equal(sp0.getAttribute('data-ag-cs-prism-box'), '1', 'visible expanded sp0 should be promoted into top-2 slot');
  assert.equal(sp0.getAttribute('data-ag-cs-prism-mirror'), '1', 'promoted sp0 must gain prism-mirror immediately');

  // 3) Collapsing sp1 immediately unmounts its rim canvas on markDirty()
  const sp1Cv = sp1.querySelector('.ag-cs-prism-rim-cv');
  sp1.setAttribute('aria-expanded', 'false');
  ctl.markDirty();
  assert.equal(sp1.getAttribute('data-ag-cs-prism-box'), null, 'collapsed step-plan must lose prism-box immediately');
  assert.equal(sp1.getAttribute('data-ag-cs-prism-mirror'), null, 'collapsed step-plan must lose prism-mirror immediately');
  assert.equal(sp1.querySelector('.ag-cs-prism-rim-cv'), null);
  assert.equal(sp1Cv.width, 0, 'collapsed step-plan canvas VRAM must shrink to 0x0');

  // 4) Periodic picker open (data-ag-pp-open="1") keeps prism/mirror rims responsive while win-blur/hidden still sleeps & reclaims
  ctl.onPointerMove({ clientX: 210, clientY: 140 });
  flushRaf();
  assert.ok(homePanel.querySelector('.ag-cs-prism-rim-cv').width > 0);
  htmlEl.setAttribute('data-ag-pp-open', '1');
  ctl.pauseForOverlay();
  assert.ok(homePanel.querySelector('.ag-cs-prism-rim-cv').width > 0, 'pp-open must keep prism/mirror rim canvases active');
  ctl.onPointerMove({ clientX: 220, clientY: 160 });
  assert.ok(rafs.size > 0, 'pp-open must stay responsive on pointermove');
  flushRaf();
  assert.ok(homePanel.querySelector('.ag-cs-prism-rim-cv').width > 0);
  // Real window blur / document hidden still pauses 0fps & reclaims VRAM
  htmlEl.setAttribute('data-ag-cs-win-blur', '1');
  ctl.pauseForOverlay();
  ctl.onPointerMove({ clientX: 225, clientY: 165 });
  assert.equal(rafs.size, 0, 'win-blur must stay 0fps on pointermove');
  fakeDoc.hidden = true;
  ctl.pauseForOverlay();
  assert.equal(homePanel.querySelector('.ag-cs-prism-rim-cv').width, 0, 'hidden document must reclaim rim canvas to 0x0');
  fakeDoc.hidden = false;
  htmlEl.removeAttribute('data-ag-cs-win-blur');
  htmlEl.removeAttribute('data-ag-pp-open');

  // 5) Home panel innerHTML reset (tab switch) self-heals rim canvas on next move, and detaching home-panel reclaims immediately
  homePanel.querySelector('.ag-cs-prism-rim-cv').remove();
  ctl.onPointerMove({ clientX: 240, clientY: 200 });
  flushRaf();
  const homeCv2 = homePanel.querySelector('.ag-cs-prism-rim-cv');
  assert.ok(homeCv2 && homeCv2 !== homeCv1 && homeCv2.width === 520, 'home-panel rim canvas must self-heal after tab re-render');

  homePanel.isConnected = false;
  ctl.markDirty();
  assert.equal(homeCv2.width, 0, 'leaving home view must immediately reclaim home-panel rim canvas to 0x0');

  // 6) motion="off" immediately reclaims all canvases to 0x0 & stops rAF
  htmlEl.setAttribute('data-ag-cs-motion', 'off');
  ctl.markDirty();
  assert.equal(sp0.querySelector('.ag-cs-prism-rim-cv'), null);
  ctl.onPointerMove({ clientX: 240, clientY: 100 });
  assert.equal(rafs.size, 0, 'motion=off must stay 0fps');

  ctl.teardown();
});

test('model-selector trigger relaxes container cap to min(300px,100%) and excludes .ag-pp-mini-keycap badge from truncation/collapse', () => {
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  // 1) 外层容器允许在 300px 内完整展示模型名与 [10Ne] 徽章，超窄窗口按 flex:0 1 auto 等比收缩
  assert.ok(
    css.includes('div.no-focus-agent-input{flex:0 1 auto !important;min-width:0 !important;max-width:min(300px,100%) !important;overflow:hidden !important;}'),
    'no-focus-agent-input must use flex:0 1 auto and max-width:min(300px,100%)',
  );
  // 2) 常规与窄窗 data-t~="1" 折叠规则均排除 .ag-pp-mini-keycap，防止迷你快捷键徽章被截断或隐藏
  assert.ok(
    css.includes('& [data-testid="model-selector-trigger"]>span:not(.ag-cs-model-glyph):not(.ag-pp-mini-keycap){'),
    'normal model-selector label span rule must exclude .ag-pp-mini-keycap',
  );
  assert.ok(
    css.includes('&[data-t~="1"] [data-testid="model-selector-trigger"]>span:not(.ag-cs-model-glyph):not(.ag-pp-mini-keycap),&[data-t~="2"] [data-testid="permissions-selector-trigger"]>span{'),
    'compact data-t~="1" collapse rule must exclude .ag-pp-mini-keycap',
  );
});

test('host-workbench-enhancer detects status-task-running, enforces grid-rows-[1fr], stamps data-ag-sp-running on active step-plan, and cleans up on destroy', () => {
  const enhancerMod = require('../host-workbench-enhancer.js');
  const makeNode = (tag, opts = {}) => {
    const attrs = new Map(Object.entries(opts.attrs || {}));
    const kids = [];
    const n = {
      nodeType: 1,
      tagName: tag.toUpperCase(),
      className: opts.className || '',
      parentElement: null,
      children: kids,
      getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
      setAttribute: (k, v) => attrs.set(k, String(v)),
      hasAttribute: (k) => attrs.has(k),
      removeAttribute: (k) => attrs.delete(k),
      appendChild(c) { c.parentElement = n; kids.push(c); return c; },
      remove() {},
      matches(sel) {
        return String(sel).split(',').map((s) => s.trim()).filter(Boolean).some((part) => {
          const tokens = part.split(/\s+/);
          const leaf = tokens[tokens.length - 1];
          const matchLeaf = (el, expr) => {
            if (!el) return false;
            let rem = expr;
            const cls = [];
            rem = rem.replace(/\.((?:\\.|[^.\[\s])+)/g, (_, c) => { cls.push(c.replace(/\\/g, '')); return ''; });
            const attrRe = /\[([^=\]]+)(?:="([^"]*)")?\]/g;
            let m;
            while ((m = attrRe.exec(rem))) {
              if (m[2] !== undefined ? el.getAttribute(m[1]) !== m[2] : !el.hasAttribute(m[1])) return false;
            }
            const tagPart = rem.replace(attrRe, '').trim();
            if (tagPart && el.tagName !== tagPart.toUpperCase()) return false;
            const cList = String(el.className || '').split(/\s+/).filter(Boolean);
            return cls.every((c) => cList.includes(c));
          };
          if (!matchLeaf(n, leaf)) return false;
          if (tokens.length === 1) return true;
          let cur = n.parentElement;
          for (let i = tokens.length - 2; i >= 0; i--) {
            while (cur && !matchLeaf(cur, tokens[i])) cur = cur.parentElement;
            if (!cur) return false;
            cur = cur.parentElement;
          }
          return true;
        });
      },
      querySelectorAll(sel) {
        const out = [];
        const walk = (x) => { for (const c of x.children) { if (c.matches(sel)) out.push(c); walk(c); } };
        walk(n);
        return out;
      },
      querySelector(sel) { return n.querySelectorAll(sel)[0] || null; },
    };
    return n;
  };

  const doc = makeNode('document');
  const html = makeNode('html');
  const body = makeNode('body');
  doc.appendChild(html);
  html.appendChild(body);
  doc.documentElement = html;
  doc.body = body;

  // 1) Collapsed running-items-panel (grid-rows-[0fr]) containing a task-running icon must NOT falsely trigger overview-running
  const runPanel = makeNode('div', { className: 'grid grid-rows-[0fr]', attrs: { 'data-testid': 'running-items-panel' } });
  const bgRowHidden = makeNode('div', { attrs: { 'data-testid': 'background-task-row' } });
  bgRowHidden.appendChild(makeNode('svg', { attrs: { 'data-testid': 'status-task-running' } }));
  runPanel.appendChild(bgRowHidden);

  const ovShell = makeNode('div', { attrs: { 'data-ag-cs-overview-shell': '1' } });
  const ovPanel = makeNode('div', { attrs: { 'data-testid': 'overview-panel' } });
  const sec = makeNode('div', { className: 'p-1' });
  const secBtn = makeNode('button');
  const bgRowOv = makeNode('div', { attrs: { 'data-testid': 'background-task-row' } });
  sec.appendChild(secBtn);
  sec.appendChild(bgRowOv);
  ovPanel.appendChild(sec);
  ovShell.appendChild(ovPanel);

  // 2) Two step-plan cards: spActive has in_progress + status-loading-spinner; spPaused has in_progress + static svg only
  const spActive = makeNode('div', { attrs: { 'data-testid': 'step-plan' } });
  const itemActive = makeNode('div', { attrs: { 'data-testid': 'step-plan-item', 'data-status': 'in_progress' } });
  itemActive.appendChild(makeNode('span', { attrs: { 'data-testid': 'status-loading-spinner' } }));
  spActive.appendChild(itemActive);

  const spPaused = makeNode('div', { attrs: { 'data-testid': 'step-plan' } });
  const itemPaused = makeNode('div', { attrs: { 'data-testid': 'step-plan-item', 'data-status': 'in_progress' } });
  itemPaused.appendChild(makeNode('svg'));
  spPaused.appendChild(itemPaused);

  body.appendChild(runPanel);
  body.appendChild(ovShell);
  body.appendChild(spActive);
  body.appendChild(spPaused);

  const ctl = enhancerMod.createHostEnhancerController({
    doc,
    win: { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) },
    getConfig: () => ({}),
    isDestroyed: () => false,
    runGuardedMut: (fn) => fn(),
  });

  ctl.sync({ o: true });
  assert.equal(ovShell.getAttribute('data-ag-overview-running'), null, 'collapsed 0fr running-items-panel must not trigger overview-running');
  assert.equal(spActive.getAttribute('data-ag-sp-running'), '1', 'active step-plan with spinner must receive data-ag-sp-running="1"');
  assert.equal(spPaused.getAttribute('data-ag-sp-running'), null, 'paused step-plan without spinner must not receive data-ag-sp-running');

  // Expanding running-items-panel to grid-rows-[1fr] or mounting status-task-running inside overview activates ambient
  runPanel.className = 'grid grid-rows-[1fr]';
  ctl.sync({ o: true });
  assert.equal(ovShell.getAttribute('data-ag-overview-running'), '1', 'expanded 1fr running-items-panel with status-task-running must activate overview-running');

  runPanel.className = 'grid grid-rows-[0fr]';
  bgRowOv.appendChild(makeNode('svg', { attrs: { 'data-testid': 'status-task-running' } }));
  ctl.sync({ o: true });
  assert.equal(bgRowOv.getAttribute('data-ag-sub-running'), '1', 'background-task-row with status-task-running must get data-ag-sub-running="1"');
  assert.equal(secBtn.getAttribute('data-ag-sub-sec-running'), '1');
  assert.equal(ovShell.getAttribute('data-ag-overview-running'), '1');

  ctl.destroy();
  assert.equal(spActive.getAttribute('data-ag-sp-running'), null, 'destroy() must strip data-ag-sp-running');
  assert.equal(ovShell.getAttribute('data-ag-overview-running'), null, 'destroy() must strip data-ag-overview-running');
});

test('stream-choreography decouples triggerHeroALiftoff / triggerHeroBHomeReturn from v2.35.1 animate-fade-in & no-transitions', () => {
  const scMod = require('../stream-choreography.js');
  const springCalls = [];
  const staggerCalls = [];
  const motionEngine = {
    spring(el, kfs, opts) { springCalls.push({ el, kfs, opts }); },
    stagger(els, kfs, opts) { staggerCalls.push({ els, kfs, opts }); },
  };

  const makeEl = (attrs = {}, cls = '', rect = { left: 0, top: 600, width: 640, height: 100 }) => {
    const m = new Map(Object.entries(attrs));
    const el = {
      nodeType: 1,
      tagName: 'DIV',
      className: cls,
      parentElement: null,
      children: [],
      style: { setProperty() {}, removeProperty() {} },
      classList: { contains: (c) => String(el.className || '').split(/\s+/).includes(c), remove() {} },
      getAttribute: (k) => (m.has(k) ? m.get(k) : null),
      setAttribute: (k, v) => m.set(k, String(v)),
      hasAttribute: (k) => m.has(k),
      removeAttribute: (k) => m.delete(k),
      appendChild(c) { c.parentElement = el; el.children.push(c); return c; },
      remove() {},
      getBoundingClientRect: () => rect,
      matches(sel) {
        return String(sel).split(',').map((s) => s.trim()).some((s) => {
          if (s.startsWith('.')) return el.classList.contains(s.slice(1));
          const am = s.match(/^\[([^=\]]+)="([^"]*)"\]$/);
          return am ? el.getAttribute(am[1]) === am[2] : false;
        });
      },
      closest(sel) { let c = el; while (c) { if (c.matches(sel)) return c; c = c.parentElement; } return null; },
      querySelectorAll(sel) {
        const out = [];
        const walk = (x) => { for (const c of x.children) { if (c.matches(sel)) out.push(c); walk(c); } };
        walk(el);
        return out;
      },
      querySelector(sel) { return el.querySelectorAll(sel)[0] || null; },
    };
    return el;
  };

  const prevDoc = globalThis.document;
  const body = makeEl();
  const home = makeEl({}, 'agy-home animate-fade-in');
  home.appendChild(makeEl({ 'data-testid': 'home-greeting' }, '', { left: 0, top: 120, width: 520, height: 40 }));
  home.appendChild(makeEl({}, 'ag-cs-home-panel', { left: 0, top: 180, width: 520, height: 280 }));
  home.appendChild(makeEl({ 'data-testid': 'agent-input-box' }, '', { left: 0, top: 480, width: 520, height: 96 }));

  const conv = makeEl({ 'data-testid': 'conversation-view' });
  const fadeWrap = makeEl({}, 'w-full transition-opacity animate-fade-in');
  const convInput = makeEl({ 'data-testid': 'agent-input-box' }, '', { left: 0, top: 820, width: 640, height: 96 });
  fadeWrap.appendChild(convInput);
  conv.appendChild(fadeWrap);
  body.appendChild(home);
  body.appendChild(conv);

  globalThis.document = {
    body,
    documentElement: makeEl(),
    createElement: () => makeEl(),
    querySelector: (s) => body.querySelector(s),
    querySelectorAll: (s) => body.querySelectorAll(s),
  };

  try {
    const ctl = scMod.createStreamChoreographyController({
      motionEngine,
      isDestroyed: () => false,
      isMotionStandardOrUltra: () => true,
      isMotionUltra: () => true,
      setAttrIfChanged: (el, k, v) => el.setAttribute(k, v),
      runGuardedMut: (fn) => fn(),
    });
    // 1) Initialize in Home -> samples home composer rect (top=480)
    ctl.syncHeroRouteChoreography({ inHome: true, formalConv: null, checkCaustics: false });
    // 2) Transition Home -> Conv (input wrapped in v2.35.1 .animate-fade-in) -> triggers triggerHeroALiftoff with clamped dy
    ctl.syncHeroRouteChoreography({ inHome: false, formalConv: conv, convInputRect: { left: 0, top: 820, width: 640, height: 96 }, checkCaustics: false });
    assert.equal(springCalls.length, 1);
    const dyMatch = springCalls[0].kfs[0].transform.match(/translateY\((-?\d+)px\)/);
    assert.ok(dyMatch, 'liftoff spring must animate translateY');
    const dy = Number(dyMatch[1]);
    assert.ok(dy >= -24 && dy <= 0, `liftoff under .animate-fade-in must clamp dy to [-24, 0], got ${dy}`);

    // 3) Transition Conv -> Home -> triggers triggerHeroBHomeReturn without conflicting opacity keyframe
    ctl.syncHeroRouteChoreography({ inHome: true, formalConv: null, checkCaustics: false });
    assert.equal(staggerCalls.length, 1);
    assert.equal('opacity' in staggerCalls[0].kfs[0], false, 'triggerHeroBHomeReturn must omit conflicting opacity keyframe');
    assert.equal('opacity' in staggerCalls[0].kfs[1], false, 'triggerHeroBHomeReturn must omit conflicting opacity keyframe');
    ctl.flushAllStreamArtifacts();
  } finally {
    if (prevDoc === undefined) delete globalThis.document;
    else globalThis.document = prevDoc;
  }
});

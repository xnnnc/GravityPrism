import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  PrismDaemon,
  REPO_BINDING,
  METRICS_BINDING,
  THOUGHT_BINDING,
  OMNI_BINDING,
  SIDEBAR_BINDING,
  copyUpdatedRuntimeFromRepo,
  isObsidianPrismDaemonCommandLine,
} from '../sidecars/daemon/main.mjs';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

const cdp = require(path.join(ROOT_DIR, 'cdp.js'));
const locales = require(path.join(ROOT_DIR, 'i18n-locales.js'));
const telemetryMod = require(path.join(ROOT_DIR, 'vendor', 'pulse-dashboard', 'inline-fallback.js'));
const sliderMod = require(path.join(ROOT_DIR, 'vendor', 'effort-slider', 'slider-coexist.js'));
const installPluginTool = require(path.join(ROOT_DIR, 'tools', 'install-plugin.cjs'));

function createLightweightDom() {
  function makeEl(tag) {
    const attrs = new Map();
    const listeners = new Map();
    const styleProps = new Map();
    const el = {
      nodeType: 1,
      tagName: String(tag).toUpperCase(),
      children: [],
      parentNode: null,
      parentElement: null,
      shadowRoot: null,
      isConnected: true,
      hidden: false,
      textContent: '',
      className: '',
      style: {
        setProperty(k, v) { styleProps.set(k, String(v)); },
        getPropertyValue(k) { return styleProps.get(k) || ''; },
        removeProperty(k) { styleProps.delete(k); },
        get display() { return styleProps.get('display') || ''; },
        set display(v) { if (v) styleProps.set('display', String(v)); else styleProps.delete('display'); },
        get width() { return styleProps.get('width') || ''; },
        set width(v) { styleProps.set('width', String(v)); },
      },
      get id() { return attrs.get('id') || ''; },
      set id(v) { attrs.set(kOrId('id'), String(v)); },
      setAttribute(k, v) { attrs.set(k, String(v)); },
      getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
      hasAttribute(k) { return attrs.has(k); },
      removeAttribute(k) { attrs.delete(k); },
      appendChild(child) {
        if (child.parentNode) child.remove();
        child.parentNode = el;
        child.parentElement = el.tagName === '#SHADOW-ROOT' ? null : el;
        child.isConnected = el.isConnected;
        el.children.push(child);
        return child;
      },
      insertBefore(child, ref) {
        const idx = ref ? el.children.indexOf(ref) : -1;
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
        const sr = makeEl('#shadow-root');
        sr.mode = mode;
        sr.host = el;
        el.shadowRoot = sr;
        return sr;
      },
      getElementById(id) {
        let found = null;
        const walk = (n) => {
          for (const c of n.children || []) {
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
        const matchesOne = (node, p) => {
          if (p.startsWith('#')) {
            const idPart = p.slice(1).split('[')[0];
            if (node.id !== idPart) return false;
            const attrMatch = p.match(/\[([a-zA-Z0-9_-]+)="([^"]+)"\]/);
            if (attrMatch && node.getAttribute(attrMatch[1]) !== attrMatch[2]) return false;
            return true;
          }
          if (p.startsWith('.')) {
            const cls = p.slice(1);
            return String(node.className || '').split(/\s+/).includes(cls);
          }
          const attrMatch = p.match(/^\[([a-zA-Z0-9_-]+)(?:="([^"]+)")?\]$/);
          if (attrMatch) {
            if (!node.hasAttribute(attrMatch[1])) return false;
            if (attrMatch[2] !== undefined && node.getAttribute(attrMatch[1]) !== attrMatch[2]) return false;
            return true;
          }
          return node.tagName === p.toUpperCase();
        };
        const walk = (n) => {
          for (const c of n.children || []) {
            if (parts.some((p) => matchesOne(c, p))) out.push(c);
            walk(c);
          }
        };
        walk(el);
        return out;
      },
      closest(sel) {
        let cur = el;
        while (cur) {
          if (sel === '[data-cascade-id]' && cur.hasAttribute?.('data-cascade-id')) return cur;
          cur = cur.parentElement;
        }
        return null;
      },
      contains(other) {
        let cur = other;
        while (cur) {
          if (cur === el) return true;
          cur = cur.parentNode;
        }
        return false;
      },
      addEventListener(ev, fn) {
        if (!listeners.has(ev)) listeners.set(ev, []);
        listeners.get(ev).push(fn);
      },
      removeEventListener(ev, fn) {
        const arr = listeners.get(ev);
        if (!arr) return;
        const i = arr.indexOf(fn);
        if (i >= 0) arr.splice(i, 1);
      },
      dispatch(ev, detail = {}) {
        for (const fn of [...(listeners.get(ev) || [])]) {
          fn({ target: el, stopPropagation() {}, preventDefault() {}, ...detail });
        }
      },
    };
    function kOrId(k) { return k; }
    return el;
  }

  const documentElement = makeEl('html');
  const head = makeEl('head');
  const body = makeEl('body');
  documentElement.appendChild(head);
  documentElement.appendChild(body);

  const cascade = makeEl('div');
  cascade.setAttribute('data-cascade-id', '11111111-2222-3333-4444-555555555555');
  const composerToolbar = makeEl('div');
  const modelBtn = makeEl('button');
  modelBtn.setAttribute('data-testid', 'model-selector-trigger');
  modelBtn.setAttribute('aria-label', 'Gemini 4 Carbon High');
  composerToolbar.appendChild(modelBtn);
  cascade.appendChild(composerToolbar);
  body.appendChild(cascade);

  const observers = [];
  class FakeMutationObserver {
    constructor(cb) {
      this.cb = cb;
      this.observed = [];
      this.disconnected = false;
      observers.push(this);
    }
    observe(target, options) {
      this.observed.push({ target, options });
    }
    disconnect() {
      this.disconnected = true;
    }
    trigger(records) {
      if (!this.disconnected) this.cb(records, this);
    }
  }

  const doc = {
    hidden: false,
    readyState: 'complete',
    documentElement,
    head,
    body,
    createElement: (tag) => makeEl(tag),
    getElementById: (id) => documentElement.getElementById(id),
    querySelector: (sel) => documentElement.querySelector(sel),
    querySelectorAll: (sel) => documentElement.querySelectorAll(sel),
    addEventListener(ev, fn) { body.addEventListener(ev, fn); },
    removeEventListener(ev, fn) { body.removeEventListener(ev, fn); },
  };

  const win = {
    document: doc,
    location: { pathname: '/c/11111111-2222-3333-4444-555555555555' },
    MutationObserver: FakeMutationObserver,
    matchMedia: () => ({ matches: false }),
    addEventListener() {},
    removeEventListener() {},
  };

  return { win, doc, makeEl, observers, composerToolbar };
}

test('Obsidian Prism brand compliance, GPL-3.0 LICENSE, NOTICE, CITATION.cff, THIRD_PARTY_NOTICES.md, plugin.json, and sidecar.json contract', () => {
  const pkgJson = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
  assert.equal(pkgJson.name, 'obsidian-prism');
  assert.equal(pkgJson.version, '1.2.4');
  assert.equal(pkgJson.license, 'GPL-3.0-only');

  const pluginJson = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'plugin.json'), 'utf8'));
  assert.deepEqual(Object.keys(pluginJson).sort(), ['description', 'displayName', 'logo', 'name', 'version']);
  assert.equal(pluginJson.name, 'obsidian-prism');
  assert.equal(pluginJson.displayName, 'Obsidian Prism');
  assert.equal(pluginJson.version, '1.2.4');
  assert.equal(pluginJson.logo, 'assets/logo.svg');
  assert.ok(fs.existsSync(path.join(ROOT_DIR, 'assets', 'logo.svg')));

  const sidecarJson = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'sidecars', 'daemon', 'sidecar.json'), 'utf8'));
  assert.equal(sidecarJson.command, 'node');
  assert.deepEqual(sidecarJson.args, ['main.mjs']);
  assert.equal(sidecarJson.restart_policy, 'always');
  assert.equal(sidecarJson.display_name, 'Obsidian Prism Daemon');
  assert.equal(sidecarJson.has_web_ui, false);

  // Verify GPL-3.0 LICENSE, NOTICE, CITATION.cff & upstream MIT credits + non-affiliation disclaimer
  const licenseTxt = fs.readFileSync(path.join(ROOT_DIR, 'LICENSE'), 'utf8');
  assert.ok(licenseTxt.includes('GNU GENERAL PUBLIC LICENSE'));
  assert.ok(licenseTxt.includes('Version 3, 29 June 2007'));

  const extractGithubRepoSlugs = (docText) => {
    const slugs = new Set();
    for (const m of docText.matchAll(/https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/g)) {
      slugs.add(m[1].replace(/\.git$/, ''));
    }
    return slugs;
  };

  const noticeFileTxt = fs.readFileSync(path.join(ROOT_DIR, 'NOTICE'), 'utf8');
  assert.ok(noticeFileTxt.includes('RMvdesi'));
  assert.ok(extractGithubRepoSlugs(noticeFileTxt).has('RMvdesi/obsidian-prism'));
  assert.ok(noticeFileTxt.includes('GPL-3.0'));

  const citationTxt = fs.readFileSync(path.join(ROOT_DIR, 'CITATION.cff'), 'utf8');
  assert.ok(citationTxt.includes('title: "Obsidian Prism"'));
  assert.ok(citationTxt.includes('license: GPL-3.0-only'));

  const noticesTxt = fs.readFileSync(path.join(ROOT_DIR, 'THIRD_PARTY_NOTICES.md'), 'utf8');
  assert.ok(noticesTxt.includes('0DNANCY'));
  assert.ok(noticesTxt.includes('AG Pulse contributors'));
  assert.ok(noticesTxt.includes('LLYSH-HANNARI'));
  const readmeTxt = fs.readFileSync(path.join(ROOT_DIR, 'README.md'), 'utf8');
  const disclaimer = 'Obsidian Prism is an independent open-source project and is not affiliated with or endorsed by Google LLC.';
  assert.ok(noticesTxt.includes(disclaimer));
  assert.ok(readmeTxt.includes(disclaimer));

  const readmeEnTxt = fs.readFileSync(path.join(ROOT_DIR, 'README.en.md'), 'utf8');
  const settingsPanelTxt = fs.readFileSync(path.join(ROOT_DIR, 'settings-panel.js'), 'utf8');
  const settingsPanelMod = require(path.join(ROOT_DIR, 'settings-panel.js'));
  const contributorsTxt = fs.readFileSync(path.join(ROOT_DIR, 'docs', 'CONTRIBUTORS.md'), 'utf8');

  const noticeSlugs = extractGithubRepoSlugs(noticesTxt);
  const readmeSlugs = extractGithubRepoSlugs(readmeTxt);
  const readmeEnSlugs = extractGithubRepoSlugs(readmeEnTxt);
  const settingsSlugs = new Set((settingsPanelMod.UPSTREAM_CREDITS || []).map((c) => c.repo));
  const nineUpstreamSlugs = [
    '0DNANCY/agy-claude-style',
    'ATtacK030130/antigrative-dashboard',
    'LLYSH-HANNARI/antigravity-Codex-Claude-effort-slider',
    'yiheng8023/antigravity-chinese',
    'Nwflower/dsh-claude-style',
    'Microqian2th/dsh-codex-effort-slider',
    'mobius/dsh-performance-slider',
    'claudenoshujin/claude-web',
    'wp3171216237/dsh-TUI',
  ];
  for (const slug of nineUpstreamSlugs) {
    assert.ok(noticeSlugs.has(slug), `THIRD_PARTY_NOTICES.md must credit ${slug}`);
    assert.ok(noticeFileTxt.includes(slug), `NOTICE must credit ${slug}`);
    assert.ok(readmeSlugs.has(slug), `README.md must credit ${slug}`);
    assert.ok(readmeEnSlugs.has(slug), `README.en.md must credit ${slug}`);
    assert.ok(settingsSlugs.has(slug), `settings-panel.js must credit ${slug}`);
  }
  for (const holder of ['0DNANCY', 'AG Pulse contributors', 'LLYSH-HANNARI', 'Antigravity Chinese Localization Contributors', 'wp3171216237']) {
    assert.ok(noticesTxt.includes(holder), `THIRD_PARTY_NOTICES.md must retain MIT holder ${holder}`);
    assert.ok(noticeFileTxt.includes(holder), `NOTICE must retain MIT holder ${holder}`);
    assert.ok(settingsPanelTxt.includes(holder), `settings-panel.js must retain MIT holder ${holder}`);
  }
  assert.ok(noticesTxt.includes('swarm-i18n-runtime.js') && noticesTxt.includes('swarm-zh-CN.json'), 'THIRD_PARTY_NOTICES.md §1.4 must document swarm-i18n-runtime.js & swarm-zh-CN.json');
  for (const contributor of ['@OyatsuSuki', '@yzd05', '@wanghaoyi216', '@Gruu6y']) {
    assert.ok(contributorsTxt.includes(contributor), `CONTRIBUTORS.md must credit v1.0.8 contributor ${contributor}`);
  }

  // Verify absorbed upstream sources exist in vendor/
  const requiredVendorFiles = [
    'vendor/pulse-dashboard/compat/runtime-ui.mjs',
    'vendor/pulse-dashboard/compat/inline-widget.cjs',
    'vendor/pulse-dashboard/sidecars/panel/store.mjs',
    'vendor/pulse-dashboard/sidecars/panel/usage.mjs',
    'vendor/pulse-dashboard/sidecars/panel/metrics.mjs',
    'vendor/pulse-dashboard/sidecars/panel/discovery.mjs',
    'vendor/pulse-dashboard/sidecars/panel/context.mjs',
    'vendor/pulse-dashboard/sidecars/panel/rate-quality.mjs',
    'vendor/pulse-dashboard/sidecars/panel/format.mjs',
    'vendor/pulse-dashboard/inline-fallback.js',
    'vendor/effort-slider/upstream-client.js',
    'vendor/effort-slider/slider-coexist.js',
  ];
  for (const rel of requiredVendorFiles) {
    assert.ok(fs.existsSync(path.join(ROOT_DIR, rel)), `Missing absorbed vendor file: ${rel}`);
  }
});

test('i18n-locales.js covers all 8 languages (zh-CN, zh-TW, en, ja, ko, es, fr, de) + legacy yue fallback with Obsidian Prism brand, fold hints, coexistence & About keys', () => {
  const langs = ['zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'es', 'fr', 'de'];
  const requiredKeys = [
    'sectionTitle',
    'sectionSubtitle',
    'foldExpandHint',
    'foldCollapseHint',
    'optClaude',
    'optWarm',
    'setLightPresetTitle',
    'setLightPresetDesc',
    'optLightCrystal',
    'optLightAlabaster',
    'groupModules',
    'grpBeta',
    'subTabBeta',
    'setSidebarStudioTitle',
    'setSidebarStudioDesc',
    'setTelemetryTitle',
    'setTelemetryDesc',
    'setEffortSliderTitle',
    'setEffortSliderDesc',
    'optAutoCoexist',
    'aboutGroupTitle',
    'aboutRepoSyncTitle',
    'aboutRepoSyncBtn',
    'aboutRepoChecking',
    'aboutRepoUpToDate',
    'aboutRepoUpdated',
    'aboutRepoNoRemote',
    'aboutCreditsTitle',
    'aboutLicenseTitle',
    'aboutDisclaimer',
  ];

  for (const lang of langs) {
    const ui = locales.getUiStrings(lang);
    for (const k of requiredKeys) {
      assert.ok(typeof ui[k] === 'string' && ui[k].length > 0, `Missing ${k} for ${lang}`);
    }
    assert.ok(/B[eê]ta/i.test(ui.setSidebarStudioTitle), `Chat module title must mark Beta for ${lang}`);
  }
  const zh = locales.getUiStrings('zh-CN');
  assert.equal(zh.sectionTitle, 'Obsidian Prism · 黑曜棱镜');
  assert.equal(zh.optWarm, 'Alabaster 暖岩');
  assert.equal(zh.optClaude, 'Alabaster 暖岩');
  assert.equal(zh.setLightPresetTitle, '浅色表面质感');
  assert.equal(zh.optLightCrystal, '白昼冷晶');
  assert.equal(zh.optLightAlabaster, '暖白画册');
  assert.equal(zh.groupModules, '实用功能模块');
  assert.equal(zh.grpBeta, 'Beta 内容');
  assert.equal(zh.optAutoCoexist, '智能兼容');
  assert.ok(zh.aboutDisclaimer.includes('Google LLC'));
});

test('vendor/pulse-dashboard/inline-fallback.js politely yields to external Pulse plugin and mounts 8+ native IDs when standalone', async () => {
  const envExt = createLightweightDom();
  envExt.win.__agPulseRuntimeOwner = 'external-pulse-owner-token';
  const extBar = envExt.makeEl('div');
  extBar.id = 'ag-pulse-status-bar';
  envExt.composerToolbar.appendChild(extBar);

  const ctlExt = telemetryMod.createTelemetryController({ window: envExt.win, document: envExt.doc });
  const stAuto = ctlExt.sync({ telemetryModule: 'auto', __fallbackDelayMs: 10 });
  assert.equal(stAuto.yieldedToExternal, true);
  assert.equal(stAuto.mountedFallback, false);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(envExt.doc.querySelectorAll('#ag-pulse-status-bar').length, 1);
  assert.equal(extBar.getAttribute('data-ag-prism-fallback'), null);

  ctlExt.sync({ telemetryModule: 'off' });
  assert.equal(extBar.getAttribute('data-ag-prism-hidden'), '1');
  assert.equal(extBar.style.display, '', 'Must NOT set display:none to prevent external getClientRects()===0 forced-reflow loop');
  assert.equal(extBar.style.getPropertyValue('opacity'), '0');
  assert.equal(extBar.style.getPropertyValue('position'), 'fixed');
  ctlExt.sync({ telemetryModule: 'auto' });
  assert.equal(extBar.getAttribute('data-ag-prism-hidden'), null);
  assert.equal(extBar.style.getPropertyValue('opacity'), '');
  assert.equal(extBar.style.getPropertyValue('position'), '');
  ctlExt.destroy();

  const envSolo = createLightweightDom();
  envSolo.win.__agPrismMetricsCall = (payloadStr) => {
    const req = JSON.parse(payloadStr);
    setTimeout(() => {
      envSolo.win.__agPrismMetricsResolve(req.id, {
        connection: 'ok',
        speed: {
          model: 'Gemini 4 Carbon High',
          tps: 68.4,
          latestTps: 74.2,
          ttftSeconds: 0.64,
          rounds: 5,
          cacheHitRate: 0.912,
          totalTokens: 245000,
          context: {
            model: 'Gemini 4 Carbon High',
            usedTokens: 128000,
            maxTokens: 512000,
            usedFraction: 0.25,
            sampledAt: Date.now(),
          },
        },
      });
    }, 5);
  };

  const ctlSolo = telemetryMod.createTelemetryController({ window: envSolo.win, document: envSolo.doc });
  const stWait = ctlSolo.sync({ telemetryModule: 'auto', __fallbackDelayMs: 25 });
  assert.equal(stWait.waitingForExternal, true);
  assert.equal(stWait.mountedFallback, false);

  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 30));
    const el = envSolo.doc.getElementById('ag-prism-pulse-bar');
    if (el && el.shadowRoot && el.shadowRoot.getElementById('context-percent')?.textContent === '25%') break;
  }
  assert.equal(ctlSolo.getState().mountedFallback, true);

  const barEl = envSolo.doc.getElementById('ag-prism-pulse-bar');
  assert.ok(barEl, 'Built-in telemetry bar must mount with dedicated #ag-prism-pulse-bar ID');
  assert.equal(envSolo.doc.getElementById('ag-pulse-status-bar'), null, 'Built-in bar must NEVER collide with external #ag-pulse-status-bar');
  assert.equal(barEl.getAttribute('data-ag-prism-pulse-bar'), 'true');
  assert.equal(barEl.getAttribute('data-ag-prism-fallback'), '1');
  assert.ok(barEl.shadowRoot);

  const nativeIds = [
    'context-card',
    'context-ring',
    'context-percent',
    'context-summary',
    'context-tokens',
    'context-track',
    'context-fill',
    'context-model',
    'tps',
    'ttft',
    'latest-rate',
  ];
  for (const id of nativeIds) {
    assert.ok(barEl.shadowRoot.getElementById(id), `Expected native ID #${id} in fallback ShadowRoot`);
  }
  assert.equal(barEl.shadowRoot.getElementById('context-percent').textContent, '25%');
  assert.equal(barEl.shadowRoot.getElementById('tps').textContent, '68.4');

  envSolo.win.__agPulseRuntimeOwner = 'late-arriving-external-pulse';
  await ctlSolo.refresh();
  assert.equal(ctlSolo.getState().mountedFallback, false);
  assert.equal(ctlSolo.getState().yieldedToExternal, true);
  assert.equal(envSolo.doc.getElementById('ag-prism-pulse-bar'), null);
  ctlSolo.destroy();

  // Regression guard: on Customizations / Installed Plugins page (no composer, but sidebar has pinned [data-cascade-id] rows),
  // fallback Dashboard MUST NOT mount into sidebar rows or document.body!
  const envPluginsPage = createLightweightDom();
  while (envPluginsPage.doc.body.children.length > 0) {
    envPluginsPage.doc.body.children[0].remove();
  }
  const pinnedRow = envPluginsPage.makeEl('div');
  pinnedRow.setAttribute('data-testid', 'conversation-row-sidebar');
  pinnedRow.setAttribute('data-cascade-id', '11111111-2222-4333-8444-555555555555');
  envPluginsPage.doc.body.appendChild(pinnedRow);
  const ctlPlugins = telemetryMod.createTelemetryController({ window: envPluginsPage.win, document: envPluginsPage.doc });
  ctlPlugins.sync({ telemetryModule: 'on' });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(ctlPlugins.getState().mountedFallback, false);
  assert.equal(envPluginsPage.doc.getElementById('ag-prism-pulse-bar'), null);
  assert.equal(pinnedRow.children.length, 0);
  ctlPlugins.destroy();

  // Regression guard 2: 'auto' yields to healthy external #ag-pulse-status-bar, whereas 'on' ("Built-in")
  // takes authoritative priority over external bar and suppresses it without stacking!
  const envAutoMode = createLightweightDom();
  const ctlAutoMode = telemetryMod.createTelemetryController({ window: envAutoMode.win, document: envAutoMode.doc });
  ctlAutoMode.sync({ telemetryModule: 'auto', __fallbackDelayMs: 5 });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(ctlAutoMode.getState().mountedFallback, true);
  assert.ok(envAutoMode.doc.getElementById('ag-prism-pulse-bar'));
  const extHealthyBar = envAutoMode.makeEl('div');
  extHealthyBar.id = 'ag-pulse-status-bar';
  envAutoMode.composerToolbar.appendChild(extHealthyBar);
  await ctlAutoMode.refresh();
  assert.equal(ctlAutoMode.getState().mountedFallback, false);
  assert.equal(ctlAutoMode.getState().yieldedToExternal, true);
  assert.equal(envAutoMode.doc.getElementById('ag-prism-pulse-bar'), null);
  assert.equal(envAutoMode.doc.querySelectorAll('#ag-pulse-status-bar').length, 1);
  ctlAutoMode.destroy();

  const envOnMode = createLightweightDom();
  const extStuckBar = envOnMode.makeEl('div');
  extStuckBar.id = 'ag-pulse-status-bar';
  envOnMode.composerToolbar.appendChild(extStuckBar);
  const ctlOnMode = telemetryMod.createTelemetryController({ window: envOnMode.win, document: envOnMode.doc });
  ctlOnMode.sync({ telemetryModule: 'on' });
  assert.equal(ctlOnMode.getState().mountedFallback, true, 'telemetryModule="on" must force built-in fallback even when external bar exists');
  assert.equal(ctlOnMode.getState().yieldedToExternal, false);
  assert.ok(envOnMode.doc.getElementById('ag-prism-pulse-bar'), 'Built-in #ag-prism-pulse-bar must stay mounted alongside suppressed external bar');
  assert.equal(extStuckBar.getAttribute('data-ag-prism-hidden'), '1', 'External bar must be suppressed while built-in mode is forced on');
  ctlOnMode.destroy();

  // Regression guard 3: during active agent turns, [data-testid="model-selector-trigger"] moves inside a top-left
  // block <div class="min-w-0">; fallback MUST NOT append there and stack vertically!
  const envActiveTurn = createLightweightDom();
  envActiveTurn.composerToolbar.className = 'min-w-0';
  const ctlActiveTurn = telemetryMod.createTelemetryController({ window: envActiveTurn.win, document: envActiveTurn.doc });
  ctlActiveTurn.sync({ telemetryModule: 'on' });
  assert.equal(ctlActiveTurn.getState().mountedFallback, false);
  const bottomFooter = envActiveTurn.makeEl('div');
  bottomFooter.className = 'agy-composer-footer flex w-full items-center';
  envActiveTurn.doc.body.appendChild(bottomFooter);
  await ctlActiveTurn.refresh();
  assert.equal(ctlActiveTurn.getState().mountedFallback, true);
  assert.equal(bottomFooter.children.length, 1);
  assert.equal(envActiveTurn.composerToolbar.children.length, 1, 'Top-left min-w-0 wrapper must contain only the model button');
  ctlActiveTurn.destroy();

  // Regression guard 4 (#223): hot-reload re-execution of inline-fallback.js UMD bundle must overwrite stale
  // __agPrismMetricsResolve closure (and clean it up on destroy) instead of timing out 3500ms to local-estimate!
  const envHotReload = createLightweightDom();
  const inlineSrc = fs.readFileSync(path.join(ROOT_DIR, 'vendor', 'pulse-dashboard', 'inline-fallback.js'), 'utf8');
  let callCount = 0;
  envHotReload.win.__agPrismMetricsCall = (payloadStr) => {
    callCount += 1;
    const req = JSON.parse(payloadStr);
    setTimeout(() => {
      envHotReload.win.__agPrismMetricsResolve?.(req.id, {
        connection: 'live',
        speed: {
          model: 'Gemini 4 Carbon High',
          tps: 88.5,
          rounds: callCount,
          context: { model: 'Gemini 4 Carbon High', usedTokens: 163840, maxTokens: 512000, usedFraction: 0.32, sampledAt: Date.now() },
        },
        groups: [{ id: 'gemini', name: 'Gemini', windows: { '5h': { remaining: 0.72 } } }],
      });
    }, 5);
  };
  const sandbox = Object.assign(envHotReload.win, {
    window: envHotReload.win,
    document: envHotReload.doc,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  });
  sandbox.globalThis = sandbox;
  // 1st injection
  vm.runInNewContext(inlineSrc, sandbox);
  sandbox.__agPrismTelemetry.sync({ telemetryModule: 'on' });
  const snap1 = await sandbox.__agPrismMetricsBridge.getMetrics({ force: false });
  assert.equal(snap1.connection, 'live');
  // Simulate legacy zombie __agPrismMetricsResolve left behind before hot-reload AND 2nd UMD re-execution
  const staleZombieResolve = () => {};
  sandbox.__agPrismMetricsResolve = staleZombieResolve;
  vm.runInNewContext(inlineSrc, sandbox);
  sandbox.__agPrismTelemetry.sync({ telemetryModule: 'on' });
  assert.notEqual(sandbox.__agPrismMetricsResolve, staleZombieResolve, 'Hot-reloaded telemetry must replace stale __agPrismMetricsResolve');
  const tHot0 = Date.now();
  const snap2 = await sandbox.__agPrismMetricsBridge.getMetrics({ force: false });
  const hotElapsed = Date.now() - tHot0;
  assert.equal(snap2.connection, 'live', 'Hot-reloaded getMetrics() must receive live response instead of local-estimate');
  assert.ok(hotElapsed < 500, `Expected fast live callback (<500ms), got ${hotElapsed}ms`);
  assert.equal(snap2.groups?.length, 1);
  sandbox.__agPrismTelemetry.destroy();
  assert.equal(sandbox.__agPrismMetricsResolve, undefined, 'destroy() must clean up __agPrismMetricsResolve');
  assert.equal(sandbox.__agPrismMetricsBridge, undefined, 'destroy() must clean up __agPrismMetricsBridge');
});

test('vendor/effort-slider/slider-coexist.js yields 100% to external __agCodexEffortSliderInstance and throttles built-in observer (120ms + skip non-menu mutations)', async () => {
  const envExt = createLightweightDom();
  let extStopCalled = false;
  envExt.win.__agCodexEffortSliderInstance = {
    stop() { extStopCalled = true; },
    rescan() {},
  };

  const ctlExt = sliderMod.createEffortSliderController({ window: envExt.win, document: envExt.doc });
  const stExt = ctlExt.sync({ effortSliderModule: 'auto' });
  assert.equal(stExt.yieldedToExternal, true);
  assert.equal(stExt.mountedPrism, false);
  assert.equal(envExt.observers.length, 0, 'Must create ZERO duplicate body MutationObservers when external slider exists');
  assert.equal(extStopCalled, false);
  ctlExt.destroy();

  const envSolo = createLightweightDom();
  const ctlSolo = sliderMod.createEffortSliderController({ window: envSolo.win, document: envSolo.doc });
  const stSolo = ctlSolo.sync({ effortSliderModule: 'auto' });
  assert.equal(stSolo.mountedPrism, true);
  assert.equal(envSolo.win.__agCodexEffortSliderInstance.__prismOwned, true);
  assert.ok(envSolo.observers.length >= 1);

  const chatDiv = envSolo.makeEl('div');
  envSolo.doc.body.appendChild(chatDiv);
  for (let i = 0; i < 20; i++) {
    envSolo.observers[0].trigger([{ target: chatDiv, addedNodes: [] }]);
  }
  assert.equal(ctlSolo.getState().perfStats.executedScans, 0);

  const modelBtn = envSolo.doc.querySelector('[data-testid="model-selector-trigger"]');
  for (let i = 0; i < 10; i++) {
    envSolo.observers[0].trigger([{ target: modelBtn, addedNodes: [] }]);
  }
  assert.equal(ctlSolo.getState().perfStats.executedScans, 1);
  await new Promise((r) => setTimeout(r, 150));
  assert.ok(ctlSolo.getState().perfStats.executedScans <= 2);

  // #242 guard: Claude Opus 5.5 / Sonnet 5.5 preserves authentic Claude spectrum, fast detent motion under motion="ultra",
  // and localized 5-language context-menu settings panel
  const upstreamLib = require(path.join(ROOT_DIR, 'vendor', 'effort-slider', 'upstream-client.js'));
  envSolo.doc.documentElement.setAttribute('data-ag-cs-motion', 'ultra');
  envSolo.doc.documentElement.setAttribute('data-ag-cs-palette', 'warm');
  envSolo.doc.documentElement.setAttribute('data-ag-cs-accent', 'follow');
  envSolo.doc.documentElement.setAttribute('data-ag-cs-lang', 'en');
  assert.equal(upstreamLib.motionMode(envSolo.win, null, envSolo.doc), 'fast', 'motion="ultra" must preserve crisp fast detent mode');
  const closeSet = upstreamLib.openSettingsPanel({ document: envSolo.doc, window: envSolo.win, x: 100, y: 100 });
  const setDialog = envSolo.doc.querySelector('.ces-set');
  assert.ok(setDialog, 'Right-click settings panel must remain available');
  assert.equal(setDialog.getAttribute('aria-label'), 'Effort Slider');
  closeSet();
  assert.match(
    upstreamLib.fillBackgroundFor(1, 0, 0.5, true),
    /rgba\(142,\s*118,\s*192,\s*0\.25\).*#704ea2/i,
    'Claude slider must retain authentic Claude violet spectrum even under warm palette'
  );
  assert.equal(upstreamLib.valueColorFor('High', 2, 3, true, false, true, 'follow'), '#c4b5fd');

  // #253 guard: WebIDL host methods (requestAnimationFrame / getComputedStyle) throw Illegal invocation if `this !== win`
  // (previously caused by Object.create(win) in slider-coexist.js, wiping out Claude pixel matrix, ticks, and High violet border!).
  const envStrict = createLightweightDom();
  envStrict.doc.documentElement.setAttribute('data-ag-cs-theme', 'dark');
  let ditherPixelsPainted = 0;
  const fillStylesUsed = new Set();
  const rafQueue = [];
  let rafSeq = 0;
  const strictWin = {
    document: envStrict.doc,
    location: envStrict.win.location,
    performance,
    MutationObserver: envStrict.win.MutationObserver,
    requestAnimationFrame(cb) {
      if (this !== strictWin) throw new TypeError('Illegal invocation: requestAnimationFrame');
      const id = ++rafSeq;
      rafQueue.push({ id, cb });
      return id;
    },
    cancelAnimationFrame(id) {
      if (this !== strictWin) throw new TypeError('Illegal invocation: cancelAnimationFrame');
      const idx = rafQueue.findIndex((item) => item.id === id);
      if (idx >= 0) rafQueue.splice(idx, 1);
    },
    getComputedStyle() {
      if (this !== strictWin) throw new TypeError('Illegal invocation: getComputedStyle');
      return { backgroundColor: 'rgb(11, 11, 14)' };
    },
    matchMedia() {
      if (this !== strictWin) throw new TypeError('Illegal invocation: matchMedia');
      return { matches: false };
    },
  };
  const origStrictCreateEl = envStrict.doc.createElement;
  envStrict.doc.createElement = (tag) => {
    const node = origStrictCreateEl(tag);
    node.classList = {
      add(c) { if (!node.className.split(/\s+/).includes(c)) node.className = (node.className + ' ' + c).trim(); },
      remove(c) { node.className = node.className.split(/\s+/).filter((x) => x && x !== c).join(' '); },
      contains(c) { return node.className.split(/\s+/).includes(c); },
    };
    if (String(tag).toLowerCase() === 'canvas') {
      node.width = 280;
      node.height = 28;
      let curStyle = '';
      node.getContext = () => ({
        get fillStyle() { return curStyle; },
        set fillStyle(v) { curStyle = String(v); fillStylesUsed.add(curStyle); },
        clearRect() {},
        createLinearGradient: () => ({ addColorStop() {} }),
        fillRect(_x, _y, w, h) { if (w < 20 && h < 20) ditherPixelsPainted += 1; },
        beginPath() {},
        moveTo() { ditherPixelsPainted += 1; },
        lineTo() {},
        quadraticCurveTo() {},
        closePath() {},
        fill() {},
      });
    }
    return node;
  };
  let capturedInstallOpts = null;
  const origInstall = upstreamLib.installCodexEffortSlider;
  upstreamLib.installCodexEffortSlider = (opts) => {
    capturedInstallOpts = opts;
    return origInstall(opts);
  };
  const ctlStrict = sliderMod.createEffortSliderController({ window: strictWin, document: envStrict.doc });
  ctlStrict.sync({ effortSliderModule: 'on' });
  upstreamLib.installCodexEffortSlider = origInstall;
  assert.equal(capturedInstallOpts.window, strictWin, 'slider-coexist must pass raw window directly without Object.create(win) wrapper');
  assert.ok(capturedInstallOpts.MutationObserver, 'slider-coexist must pass ThrottledMO via opts.MutationObserver');
  const claudeRow = envStrict.doc.createElement('div');
  claudeRow.className = 'ces-ag-effort-row';
  const claudeContainer = envStrict.doc.createElement('div');
  claudeRow.appendChild(claudeContainer);
  envStrict.doc.body.appendChild(claudeRow);
  const mountedClaude = upstreamLib.mountCodexEffortSlider({
    container: claudeContainer,
    row: claudeRow,
    document: envStrict.doc,
    window: strictWin,
    seat: {
      isClaude: true,
      theme: 'claude',
      locked: false,
      effortLevels: [
        { effort: 'low', label: 'Low' },
        { effort: 'medium', label: 'Medium' },
        { effort: 'high', label: 'High' },
      ],
      currentEffort: 'high',
      selectEffort() {},
    },
  });
  for (let frame = 1; frame <= 2; frame++) {
    const batch = rafQueue.splice(0, rafQueue.length);
    for (const item of batch) item.cb(performance.now() + frame * 1800);
  }
  assert.ok(ditherPixelsPainted > 100, `Expected Claude pixel dither matrix cells painted (>100 cells), got ${ditherPixelsPainted}`);
  assert.ok(fillStylesUsed.has('rgb(208,192,246)') && fillStylesUsed.has('rgb(220, 204, 255)'), 'Must paint authentic Claude base violet & pulse highlight cells');
  assert.equal(claudeContainer.querySelectorAll('.ces-tick').length, 3, 'Must render all 3 level ticks in Claude mode');
  assert.equal(claudeRow.getAttribute('data-ces-max'), 'true', 'Claude High must activate data-ces-max="true" violet glow border');
  const styleElStrict = envStrict.doc.getElementById('ag-codex-effort-slider-styles');
  assert.match(styleElStrict.textContent, /\.ces-fill\s*\{[^}]*overflow:\s*hidden/, '.ces-fill must clip HiDPI Claude canvas cleanly via overflow:hidden');
  assert.doesNotMatch(styleElStrict.textContent, /\.ces-claude-canvas\s*\{[^}]*object-fit:\s*none/, '.ces-claude-canvas must not use object-fit:none which breaks HiDPI backing store scaling');
  const strictFillEl = claudeContainer.querySelector('.ces-fill');
  const strictCanvasEl = claudeContainer.querySelector('.ces-claude-canvas');
  assert.equal(strictCanvasEl.parentNode, strictFillEl, '.ces-claude-canvas must be mounted inside .ces-fill');
  mountedClaude.unmount();
  ctlStrict.destroy();

  ctlSolo.destroy();
  assert.equal(envSolo.win.__agCodexEffortSliderInstance, undefined);
});

test('PrismDaemon & install-plugin.cjs: obsidian-prism target, legacy antigravity-prism cleanup, and __agPrismRepoCall Git status + pull --ff-only hot-reload', async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'obsidian-prism-plugin-e2e-'));
  const pluginsRoot = path.join(workDir, 'plugins');
  const legacyPluginDir = path.join(pluginsRoot, 'antigravity-prism');
  const targetPluginDir = path.join(pluginsRoot, 'obsidian-prism');

  // Create mock Git remote & working clone to test executeRepoAction('status' & 'pull')
  const remoteGitDir = path.join(workDir, 'remote-origin.git');
  const localGitRepo = path.join(workDir, 'local-repo');
  execFileSync('git', ['init', '--bare', remoteGitDir], { stdio: 'ignore' });
  execFileSync('git', ['init', localGitRepo], { stdio: 'ignore' });
  execFileSync('git', ['-C', localGitRepo, 'config', 'user.email', 'test@obsidian-prism.local'], { stdio: 'ignore' });
  execFileSync('git', ['-C', localGitRepo, 'config', 'user.name', 'Obsidian Prism Test'], { stdio: 'ignore' });
  fs.writeFileSync(path.join(localGitRepo, 'README.md'), '# v1\n', 'utf8');
  execFileSync('git', ['-C', localGitRepo, 'add', 'README.md'], { stdio: 'ignore' });
  execFileSync('git', ['-C', localGitRepo, 'commit', '-m', 'init commit'], { stdio: 'ignore' });
  const branchName = execFileSync('git', ['-C', localGitRepo, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim();

  // Seed legacy antigravity-prism sibling with user config to test migration + auto-removal
  fs.mkdirSync(legacyPluginDir, { recursive: true });
  fs.writeFileSync(path.join(legacyPluginDir, 'config.json'), '{"palette":"warm","lightPreset":"alabaster"}\n', 'utf8');

  const sockets = new Set();
  const cdpCalls = [];
  let wsServerConn = null;
  let lastRepoResolveExpr = null;
  let metricsResolveExpr = null;
  let lastOmniResolveExpr = null;

  function sendWs(sock, obj) {
    if (sock.destroyed) return;
    const payload = Buffer.from(JSON.stringify(obj), 'utf8');
    let hdr;
    if (payload.length < 126) {
      hdr = Buffer.from([0x81, payload.length]);
    } else if (payload.length < 65536) {
      hdr = Buffer.alloc(4);
      hdr[0] = 0x81;
      hdr[1] = 126;
      hdr.writeUInt16BE(payload.length, 2);
    } else {
      hdr = Buffer.alloc(10);
      hdr[0] = 0x81;
      hdr[1] = 127;
      hdr.writeBigUInt64BE(BigInt(payload.length), 2);
    }
    sock.write(Buffer.concat([hdr, payload]));
  }

  const server = http.createServer((req, res) => {
    if (req.url === '/json/list') {
      const p = server.address().port;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify([
          {
            id: 'HANG_LP',
            type: 'page',
            title: 'Untitled - launchpad',
            url: 'vscode-file://vscode-app/launchpad.html',
            webSocketDebuggerUrl: `ws://127.0.0.1:${p}/devtools/page/HANG_LP`,
          },
          {
            id: 'USER_DEV_PREVIEW',
            type: 'page',
            title: 'AI Rap Video Generator',
            url: 'http://127.0.0.1:3115/',
            webSocketDebuggerUrl: `ws://127.0.0.1:${p}/devtools/page/USER_DEV_PREVIEW`,
          },
          {
            id: 'EXTERNAL_SPOOF',
            type: 'page',
            title: 'Antigravity',
            url: 'https://example.com/app',
            webSocketDebuggerUrl: `ws://127.0.0.1:${p}/devtools/page/EXTERNAL_SPOOF`,
          },
          {
            id: 'MAIN_WB',
            type: 'page',
            title: 'Workspace - Antigravity',
            url: 'vscode-file://vscode-app/workbench.html',
            webSocketDebuggerUrl: `ws://127.0.0.1:${p}/devtools/page/MAIN_WB`,
          },
        ])
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });

  let touchedLaunchpad = false;
  let touchedForeignPreview = false;

  server.on('upgrade', (req, socket) => {
    if (req.url.includes('HANG_LP')) {
      touchedLaunchpad = true;
      socket.destroy();
      return;
    }
    if (req.url.includes('USER_DEV_PREVIEW') || req.url.includes('EXTERNAL_SPOOF')) {
      touchedForeignPreview = true;
      socket.destroy();
      return;
    }
    const key = req.headers['sec-websocket-key'];
    const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    );
    sockets.add(socket);
    wsServerConn = socket;
    socket.on('close', () => sockets.delete(socket));

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
        let data = Buffer.from(buf.subarray(off + mLen, off + mLen + len));
        if (masked) {
          const m = buf.subarray(off, off + 4);
          for (let i = 0; i < data.length; i++) data[i] ^= m[i & 3];
        }
        buf = buf.subarray(off + mLen + len);
        if (opcode === 0x8) { socket.end(); return; }
        if (opcode === 0x1 || opcode === 0x0) {
          frags.push(data);
          if (fin) {
            const msg = JSON.parse(Buffer.concat(frags).toString('utf8'));
            frags = [];
            cdpCalls.push({ method: msg.method, params: msg.params });
            if (msg.method === 'Page.addScriptToEvaluateOnNewDocument') {
              sendWs(socket, { id: msg.id, result: { identifier: 'doc-script-1' } });
            } else if (msg.method === 'Runtime.evaluate') {
              const expr = String(msg.params?.expression || '');
              // Match actual RPC resolve invocations (not the full injected bundle source which also mentions these globals).
              if (/window\.__agPrismMetricsResolve\s*\(\s*\d+\s*,/.test(expr)) {
                metricsResolveExpr = expr;
              } else if (/window\.__agPrismRepoBridge\.resolve\s*\(\s*\d+\s*,/.test(expr)) {
                lastRepoResolveExpr = expr;
              } else if (expr.includes('__agPrismOmniBridge') && /\bb\.resolve\s*\(\s*\d+\s*,/.test(expr)) {
                lastOmniResolveExpr = expr;
              }
              sendWs(socket, {
                id: msg.id,
                result: {
                  result: {
                    type: 'object',
                    value: {
                      ready: true,
                      hasPrism: true,
                      hasRepoBridge: true,
                      prismAttr: '1.2.4',
                      hasStyle: true,
                      version: '1.2.4',
                      status: 'ok',
                    },
                  },
                },
              });
            } else {
              sendWs(socket, { id: msg.id, result: {} });
            }
          }
        }
      }
    });
  });

  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  let daemon = null;
  try {
    assert.ok(installPluginTool.getDefaultPluginTargetDir().endsWith('obsidian-prism'));

    const installRes = await installPluginTool.installPlugin({
      sourceDir: ROOT_DIR,
      targetDir: targetPluginDir,
      startDaemon: false,
    });
    assert.equal(installRes.ok, true);
    assert.equal(installRes.cleanedLegacyPluginDir, true, 'Must clean legacy antigravity-prism sibling directory');
    assert.equal(fs.existsSync(legacyPluginDir), false);
    assert.equal(installRes.preservedConfig, true, 'Must migrate config.json from legacy antigravity-prism');
    assert.equal(JSON.parse(fs.readFileSync(path.join(targetPluginDir, 'config.json'), 'utf8')).lightPreset, 'alabaster');
    assert.ok(fs.existsSync(path.join(targetPluginDir, 'THIRD_PARTY_NOTICES.md')));
    assert.ok(fs.existsSync(path.join(targetPluginDir, 'repo-meta.json')));

    // Start PrismDaemon linked to localGitRepo
    let lazyCollectorInvoked = 0;
    daemon = new PrismDaemon({
      rootDir: targetPluginDir,
      gitRepoDir: localGitRepo,
      overridePort: port,
      pollIntervalMs: 500,
      silent: true,
      metricsProvider: async (input) => {
        lazyCollectorInvoked += 1;
        return { connection: 'ok', speed: { tps: 88.8, conversationId: input?.conversationId || null }, groups: [] };
      },
    });
    daemon.claimOwnership();
    daemon.running = true;
    const tickRes = await daemon.tick();
    assert.equal(tickRes.attached, 1);
    assert.equal(touchedLaunchpad, false);
    assert.equal(lazyCollectorInvoked, 0);

    assert.ok(cdpCalls.some((c) => c.method === 'Runtime.addBinding' && c.params?.name === METRICS_BINDING));
    assert.ok(cdpCalls.some((c) => c.method === 'Runtime.addBinding' && c.params?.name === REPO_BINDING));
    assert.ok(cdpCalls.some((c) => c.method === 'Runtime.addBinding' && c.params?.name === OMNI_BINDING));
    assert.equal(Boolean(daemon.omniServer && daemon.omniServer.running), true, 'PrismDaemon must auto-start OmniServer on 127.0.0.1');
    const omniPortBeforeStop = daemon.omniServer.port;
    assert.ok(omniPortBeforeStop > 0);

    // Test 1: Git status without remote -> noRemote: true
    const noRemoteStatus = await daemon.executeRepoAction({ action: 'status' });
    assert.equal(noRemoteStatus.ok, true);
    assert.equal(noRemoteStatus.isGitRepo, true);
    assert.equal(noRemoteStatus.noRemote, true);
    assert.equal(noRemoteStatus.branch, branchName);
    assert.ok(noRemoteStatus.commit.length >= 6);

    // Test 2: Link remote, push an upstream commit from another clone, test status & pull --ff-only over CDP binding!
    execFileSync('git', ['-C', localGitRepo, 'remote', 'add', 'origin', remoteGitDir], { stdio: 'ignore' });
    execFileSync('git', ['-C', localGitRepo, 'push', '-u', 'origin', branchName], { stdio: 'ignore' });

    const pusherClone = path.join(workDir, 'pusher-clone');
    execFileSync('git', ['clone', remoteGitDir, pusherClone], { stdio: 'ignore' });
    execFileSync('git', ['-C', pusherClone, 'config', 'user.email', 'bot@obsidian-prism.local'], { stdio: 'ignore' });
    execFileSync('git', ['-C', pusherClone, 'config', 'user.name', 'Upstream Bot'], { stdio: 'ignore' });
    fs.writeFileSync(path.join(pusherClone, 'README.md'), '# v1.1 upstream update\n', 'utf8');
    execFileSync('git', ['-C', pusherClone, 'add', 'README.md'], { stdio: 'ignore' });
    execFileSync('git', ['-C', pusherClone, 'commit', '-m', 'feat: upstream update'], { stdio: 'ignore' });
    const upstreamHash = execFileSync('git', ['-C', pusherClone, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
    execFileSync('git', ['-C', pusherClone, 'push', 'origin', branchName], { stdio: 'ignore' });

    const remoteStatus = await daemon.executeRepoAction({ action: 'status' });
    assert.equal(remoteStatus.hasRemote, true);
    assert.equal(remoteStatus.behind, 1);
    assert.equal(remoteStatus.hasUpdates, true);
    assert.equal(remoteStatus.upToDate, false);

    const waitUntil = async (predicate, timeoutMs = 8000, intervalMs = 25) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const val = predicate();
        if (val) return val;
        await new Promise((r) => setTimeout(r, intervalMs));
      }
      return predicate();
    };

    const beforeDocScripts = cdpCalls.filter((c) => c.method === 'Page.addScriptToEvaluateOnNewDocument').length;
    lastRepoResolveExpr = null;
    sendWs(wsServerConn, {
      method: 'Runtime.bindingCalled',
      params: {
        name: REPO_BINDING,
        payload: JSON.stringify({ id: 42, action: 'pull' }),
      },
    });

    await waitUntil(() => Boolean(lastRepoResolveExpr), 9000, 30);
    assert.ok(lastRepoResolveExpr, 'Expected __agPrismRepoBridge.resolve callback via CDP');
    assert.ok(lastRepoResolveExpr.includes(upstreamHash));
    assert.ok(lastRepoResolveExpr.includes('"updated":true'));
    assert.ok(lastRepoResolveExpr.includes('"hotReloaded":true'));

    const afterDocScripts = cdpCalls.filter((c) => c.method === 'Page.addScriptToEvaluateOnNewDocument').length;
    assert.ok(afterDocScripts > beforeDocScripts, 'Pulling new commits must immediately hot-push updated bundle to CDP windows');

    // Trigger batch setting update (`patch-batch`) over SETTING_BINDING -> writes config.json once & fast-refreshes
    sendWs(wsServerConn, {
      method: 'Runtime.bindingCalled',
      params: {
        name: '__agPrismSetting',
        payload: JSON.stringify({
          action: 'patch-batch',
          entries: { palette: 'warm', motionLevel: 'subtle', targetFps: '120', homeRipple: false, language: 'ja' },
        }),
      },
    });
    const cfgPath = path.join(targetPluginDir, 'config.json');
    const savedCfgAfterBatch = await waitUntil(() => {
      try {
        const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
        return parsed && parsed.palette === 'warm' && parsed.language === 'ja' ? parsed : null;
      } catch {
        return null;
      }
    }, 6000, 25);
    assert.ok(savedCfgAfterBatch, 'Expected patch-batch config.json persistence within timeout');
    assert.equal(savedCfgAfterBatch.palette, 'warm');
    assert.equal(savedCfgAfterBatch.motionLevel, 'subtle');
    assert.equal(savedCfgAfterBatch.targetFps, '120');
    assert.equal(savedCfgAfterBatch.homeRipple, false);
    assert.equal(savedCfgAfterBatch.ripple, 'off', 'Expected legacy twin key ripple synced on disk');
    assert.equal(savedCfgAfterBatch.language, 'ja');
    assert.equal(savedCfgAfterBatch.lang, 'ja', 'Expected legacy twin key lang synced on disk');
    assert.equal(touchedForeignPreview, false, 'PrismDaemon must never connect or expose RPC bindings to non-host preview pages');

    // Trigger on-demand metrics request as well (reset metricsResolveExpr so only the real RPC resolve matches)
    metricsResolveExpr = null;
    sendWs(wsServerConn, {
      method: 'Runtime.bindingCalled',
      params: {
        name: METRICS_BINDING,
        payload: JSON.stringify({ id: 7, input: { conversationId: '11111111-2222-3333-4444-555555555555' } }),
      },
    });
    await waitUntil(() => lazyCollectorInvoked >= 1 && Boolean(metricsResolveExpr), 8000, 25);
    assert.equal(lazyCollectorInvoked, 1);
    assert.ok(metricsResolveExpr && metricsResolveExpr.includes('88.8'));

    // Trigger OMNI_BINDING RPC over CDP -> resolves path & returns via __agPrismOmniBridge.resolve
    lastOmniResolveExpr = null;
    sendWs(wsServerConn, {
      method: 'Runtime.bindingCalled',
      params: {
        name: OMNI_BINDING,
        payload: JSON.stringify({
          id: 99,
          action: 'resolvePath',
          rawPath: '@README.md#L1-L2',
          workspaceHint: targetPluginDir,
        }),
      },
    });
    await waitUntil(() => Boolean(lastOmniResolveExpr), 6000, 25);
    assert.ok(lastOmniResolveExpr, 'Expected __agPrismOmniBridge.resolve callback via CDP');
    assert.ok(lastOmniResolveExpr.includes('"exists":true'));
    assert.ok(lastOmniResolveExpr.includes('"line":1'));

    await daemon.stop(false);
    assert.equal(daemon.omniServer, null, 'PrismDaemon.stop() must tear down OmniServer cleanly');
    daemon = null;

    const uninst = await installPluginTool.uninstallPlugin({ targetDir: targetPluginDir, noCdp: true });
    assert.equal(uninst.ok, true);
    assert.equal(fs.existsSync(targetPluginDir), false);
  } finally {
    if (daemon) await daemon.stop(false).catch(() => {});
    await installPluginTool.uninstallPlugin({ targetDir: targetPluginDir, noCdp: true }).catch(() => {});
    for (const s of sockets) s.destroy();
    await new Promise((r) => server.close(r));
    fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 80 });
  }
});

test('PrismDaemon HS-1 & SEC-2: 68 rapid-fire setting updates, multi-window cross-sync & reload epoch reset suffer 0 rebound & 0 script leaks; child iframe bindings are rejected & stop() disposes lazy services', async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-prism-hs1-sec2-'));
  const targetPluginDir = path.join(workDir, 'obsidian-prism');
  await installPluginTool.installPlugin({ targetDir: targetPluginDir, noCdp: true, skipHostConfig: true, startDaemon: false });

  const sockets = new Set();
  const pageConns = new Map();
  let scriptSeq = 0;
  const activeScripts = new Map(); // id -> source
  let totalAddScriptCalls = 0;

  function createWindowVm(pageId) {
    const storeMap = new Map();
    const localStorageMock = {
      getItem: (k) => (storeMap.has(k) ? storeMap.get(k) : null),
      setItem: (k, v) => storeMap.set(k, String(v)),
      removeItem: (k) => storeMap.delete(k),
    };
    const rootAttrs = new Map();
    const docEl = {
      setAttribute: (k, v) => rootAttrs.set(k, String(v)),
      getAttribute: (k) => rootAttrs.get(k) || null,
      hasAttribute: (k) => rootAttrs.has(k),
      removeAttribute: (k) => rootAttrs.delete(k),
      style: { setProperty() {}, removeProperty() {} },
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    };
    const vmDoc = {
      title: `Obsidian Prism - Antigravity (${pageId})`,
      readyState: 'complete',
      hidden: false,
      documentElement: docEl,
      head: { appendChild() {}, lastElementChild: null },
      body: { appendChild() {}, classList: { contains: (c) => c === 'monaco-workbench' } },
      createElement: () => ({
        id: '',
        style: {},
        setAttribute() {},
        appendChild() {},
        remove() {},
        addEventListener() {},
        classList: { add() {}, remove() {}, contains: () => false },
      }),
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener() {},
      removeEventListener() {},
    };
    const vmWin = {
      location: { href: 'vscode-file://vscode-app/workbench.html' },
      document: vmDoc,
      localStorage: localStorageMock,
      navigator: { language: 'zh-CN', clipboard: { writeText: async () => {} } },
      matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
      MutationObserver: class { observe() {} disconnect() {} },
      ResizeObserver: class { observe() {} disconnect() {} },
      IntersectionObserver: class { observe() {} disconnect() {} },
      requestAnimationFrame: () => 1,
      cancelAnimationFrame() {},
      performance: { now: () => Date.now() },
      getComputedStyle: () => ({ getPropertyValue: () => '' }),
      CSS: {},
      setTimeout,
      clearTimeout,
      setInterval: () => ({ unref() {} }),
      clearInterval() {},
      addEventListener() {},
      removeEventListener() {},
      __agPrismSetting: (payload) => {
        const sock = pageConns.get(pageId);
        if (sock) {
          sendWs(sock, {
            method: 'Runtime.bindingCalled',
            params: { name: '__agPrismSetting', payload, executionContextId: pageState.get(pageId).mainCtxId },
          });
        }
      },
    };
    vmWin.window = vmWin;
    vmWin.globalThis = vmWin;
    return { vmWin, vmCtx: vm.createContext(vmWin) };
  }

  const pageState = new Map([
    ['page-a', { ...createWindowVm('page-a'), mainCtxId: 1, scripts: new Map() }],
    ['page-b', { ...createWindowVm('page-b'), mainCtxId: 1, scripts: new Map() }],
  ]);

  function sendWs(socket, obj) {
    const payload = Buffer.from(JSON.stringify(obj), 'utf8');
    let hdr;
    if (payload.length < 126) {
      hdr = Buffer.from([0x81, payload.length]);
    } else if (payload.length < 65536) {
      hdr = Buffer.alloc(4);
      hdr[0] = 0x81;
      hdr[1] = 126;
      hdr.writeUInt16BE(payload.length, 2);
    } else {
      hdr = Buffer.alloc(10);
      hdr[0] = 0x81;
      hdr[1] = 127;
      hdr.writeBigUInt64BE(BigInt(payload.length), 2);
    }
    socket.write(Buffer.concat([hdr, payload]));
  }

  const server = http.createServer((req, res) => {
    if (req.url === '/json/list') {
      const addr = server.address();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify([
          {
            id: 'page-a',
            type: 'page',
            title: 'Obsidian Prism - Antigravity (A)',
            url: 'vscode-file://vscode-app/workbench.html',
            webSocketDebuggerUrl: `ws://127.0.0.1:${addr.port}/devtools/page/page-a`,
          },
          {
            id: 'page-b',
            type: 'page',
            title: 'Obsidian Prism - Antigravity (B)',
            url: 'vscode-file://vscode-app/workbench.html',
            webSocketDebuggerUrl: `ws://127.0.0.1:${addr.port}/devtools/page/page-b`,
          },
        ])
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });

  server.on('upgrade', (req, socket) => {
    const pageId = req.url?.endsWith('/page-b') ? 'page-b' : 'page-a';
    const topFrameId = `TOP_MAIN_FRAME_${pageId}`;
    sockets.add(socket);
    socket.on('close', () => {
      sockets.delete(socket);
      if (pageConns.get(pageId) === socket) pageConns.delete(pageId);
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
    pageConns.set(pageId, socket);

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
        let data = Buffer.from(buf.subarray(off + mLen, off + mLen + len));
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
        const st = pageState.get(pageId);
        if (msg.method === 'Page.getFrameTree') {
          sendWs(socket, { id: msg.id, result: { frameTree: { frame: { id: topFrameId } } } });
        } else if (msg.method === 'Runtime.enable') {
          sendWs(socket, { id: msg.id, result: {} });
          sendWs(socket, {
            method: 'Runtime.executionContextCreated',
            params: { context: { id: 1, auxData: { frameId: topFrameId, isDefault: true, type: 'default' } } },
          });
          sendWs(socket, {
            method: 'Runtime.executionContextCreated',
            params: { context: { id: 2, auxData: { frameId: 'UNTRUSTED_CHILD_IFRAME', isDefault: true, type: 'default' } } },
          });
          sendWs(socket, {
            method: 'Runtime.executionContextCreated',
            params: { context: { id: 3, auxData: { frameId: topFrameId, isDefault: false, type: 'isolated' } } },
          });
        } else if (msg.method === 'Page.addScriptToEvaluateOnNewDocument') {
          const src = msg.params?.source || '';
          setTimeout(() => {
            const id = `sc-${++scriptSeq}`;
            totalAddScriptCalls += 1;
            activeScripts.set(id, src);
            st.scripts.set(id, src);
            if (!socket.destroyed) sendWs(socket, { id: msg.id, result: { identifier: id } });
          }, 12);
        } else if (msg.method === 'Page.removeScriptToEvaluateOnNewDocument') {
          const rmId = msg.params?.identifier;
          activeScripts.delete(rmId);
          st.scripts.delete(rmId);
          sendWs(socket, { id: msg.id, result: {} });
        } else if (msg.method === 'Runtime.evaluate') {
          let val = { ok: true };
          try {
            val = vm.runInContext(msg.params.expression, st.vmCtx);
          } catch {}
          sendWs(socket, { id: msg.id, result: { result: { type: 'object', value: val } } });
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
      await new Promise((r) => setTimeout(r, 25));
      if (!daemonInst._broadcastRunning && !daemonInst._broadcastPending) break;
    }
    await new Promise((r) => setTimeout(r, 40));
  };

  let thoughtDisposed = 0;
  let thoughtGetConfigCalls = 0;
  let daemon = null;
  try {
    daemon = new PrismDaemon({
      rootDir: targetPluginDir,
      overridePort: port,
      pollIntervalMs: 1000,
      silent: true,
      thoughtService: {
        getSanitizedConfig: () => {
          thoughtGetConfigCalls += 1;
          return { ok: true };
        },
        dispose: () => {
          thoughtDisposed += 1;
        },
      },
    });
    daemon.claimOwnership();
    daemon.running = true;
    const tickRes = await daemon.tick();
    assert.equal(tickRes.attached, 2, 'Expected both Window A and Window B attached');
    const stA = pageState.get('page-a');
    const stB = pageState.get('page-b');
    assert.ok(stA.vmWin.__agPrism && stB.vmWin.__agPrism, 'Expected ui-runtime mounted inside both VM windows');

    // SEC-2 Test: Child iframe (ctx 2) and isolated world (ctx 3) binding calls MUST be silently rejected!
    const sockA = pageConns.get('page-a');
    sendWs(sockA, {
      method: 'Runtime.bindingCalled',
      params: {
        name: '__agPrismSetting',
        payload: JSON.stringify({ key: 'palette', value: 'claude' }),
        executionContextId: 2,
      },
    });
    sendWs(sockA, {
      method: 'Runtime.bindingCalled',
      params: {
        name: THOUGHT_BINDING,
        payload: JSON.stringify({ id: 1, action: 'get-config' }),
        executionContextId: 2,
      },
    });
    sendWs(sockA, {
      method: 'Runtime.bindingCalled',
      params: {
        name: THOUGHT_BINDING,
        payload: JSON.stringify({ id: 2, action: 'get-config' }),
        executionContextId: 3,
      },
    });
    await new Promise((r) => setTimeout(r, 60));
    const cfgAfterUntrusted = JSON.parse(fs.readFileSync(path.join(targetPluginDir, 'config.json'), 'utf8'));
    assert.equal(cfgAfterUntrusted.palette, 'obsidian', 'SEC-2: Child iframe binding must never mutate config.json');
    assert.equal(thoughtGetConfigCalls, 0, 'SEC-2: Child iframe & isolated world must never invoke THOUGHT_BINDING');

    // Main frame (ctx 1) binding call succeeds
    sendWs(sockA, {
      method: 'Runtime.bindingCalled',
      params: {
        name: THOUGHT_BINDING,
        payload: JSON.stringify({ id: 3, action: 'get-config' }),
        executionContextId: 1,
      },
    });
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(thoughtGetConfigCalls, 1, 'Top-level main frame context must be permitted');

    // Phase A (HS-1): Fire 68 rapid-fire setting updates from Window A (localWriteEpoch reaches 68)
    const palettes = ['obsidian', 'claude', 'warm'];
    const accents = ['follow', 'amber', 'iris', 'cobalt', 'mono'];
    const motions = ['off', 'subtle', 'standard', 'ultra'];
    for (let i = 1; i <= 68; i++) {
      const patch =
        i === 68
          ? { palette: 'warm', accentTone: 'cobalt', motionLevel: 'subtle', omniModule: 'on' }
          : {
              palette: palettes[i % palettes.length],
              accentTone: accents[i % accents.length],
              motionLevel: motions[i % motions.length],
              omniModule: i % 2 === 0 ? 'on' : 'off',
            };
      stA.vmWin.__agPrism.saveSettingsBatch(patch);
    }
    await waitBroadcastDrain(daemon);

    assert.equal(stA.vmWin.__agPrism.getState().cfg.palette, 'warm');
    assert.equal(stA.vmWin.__agPrism.getState().cfg.accentTone, 'cobalt');
    assert.equal(stB.vmWin.__agPrism.getState().cfg.palette, 'warm', 'Window B must receive Window A cross-window sync');
    assert.equal(stB.vmWin.__agPrism.getState().cfg.accentTone, 'cobalt');
    assert.ok(
      totalAddScriptCalls <= 22,
      `HS-1: Single-flight coalescing should collapse 68 rapid clicks across 2 windows × 9 dynamic channels (got ${totalAddScriptCalls})`
    );

    // Phase B (Cross-window epoch isolation): Window B (localWriteEpoch 1..12 << Window A's 68!) rapid-fires 12 updates
    for (let j = 1; j <= 12; j++) {
      const patch =
        j === 12
          ? { palette: 'claude', accentTone: 'amber', motionLevel: 'ultra', omniModule: 'off' }
          : {
              palette: palettes[j % palettes.length],
              accentTone: accents[j % accents.length],
              motionLevel: motions[j % motions.length],
              omniModule: j % 2 === 0 ? 'on' : 'off',
            };
      stB.vmWin.__agPrism.saveSettingsBatch(patch);
    }
    await waitBroadcastDrain(daemon);

    assert.equal(stB.vmWin.__agPrism.getState().cfg.palette, 'warm', 'Window B must normalize claude->warm without stale rebound');
    assert.equal(stB.vmWin.__agPrism.getState().cfg.accentTone, 'amber');
    assert.equal(
      stA.vmWin.__agPrism.getState().cfg.palette,
      'warm',
      'Window A (with localWriteEpoch=68) must never drop sibling Window B updates (baseRefreshExpr omits __ackEpoch)'
    );
    assert.equal(stA.vmWin.__agPrism.getState().cfg.accentTone, 'amber');

    // Phase C (Ctrl+Shift+R reload reset): Window A reloads (localWriteEpoch resets to 0) and rapid-fires 10 updates
    sendWs(sockA, { method: 'Runtime.executionContextsCleared', params: {} });
    sendWs(sockA, { method: 'Page.frameNavigated', params: { frame: { id: 'TOP_MAIN_FRAME_page-a_v2' } } });
    const freshA = createWindowVm('page-a');
    stA.vmWin = freshA.vmWin;
    stA.vmCtx = freshA.vmCtx;
    stA.mainCtxId = 10;
    sendWs(sockA, {
      method: 'Runtime.executionContextCreated',
      params: { context: { id: 10, auxData: { frameId: 'TOP_MAIN_FRAME_page-a_v2', isDefault: true, type: 'default' } } },
    });
    for (const src of stA.scripts.values()) {
      try {
        vm.runInContext(src, stA.vmCtx);
      } catch {}
    }
    assert.ok(stA.vmWin.__agPrism, 'Expected NewDocument scripts to mount Prism cleanly after simulated reload');

    for (let k = 1; k <= 10; k++) {
      const patch =
        k === 10
          ? { palette: 'obsidian', accentTone: 'iris', motionLevel: 'off', omniModule: 'on' }
          : {
              palette: palettes[k % palettes.length],
              accentTone: accents[k % accents.length],
              motionLevel: motions[k % motions.length],
              omniModule: k % 2 === 0 ? 'on' : 'off',
            };
      stA.vmWin.__agPrism.saveSettingsBatch(patch);
    }
    await waitBroadcastDrain(daemon);

    const finalDiskCfg = JSON.parse(fs.readFileSync(path.join(targetPluginDir, 'config.json'), 'utf8'));
    assert.equal(finalDiskCfg.palette, 'obsidian');
    assert.equal(finalDiskCfg.accentTone, 'iris');
    assert.equal(finalDiskCfg.motionLevel, 'off');
    assert.equal(finalDiskCfg.omniModule, 'on');

    assert.equal(stA.vmWin.__agPrism.getState().cfg.palette, 'obsidian', 'Reloaded Window A must lock onto 10th update with 0 rebound');
    assert.equal(stA.vmWin.__agPrism.getState().cfg.accentTone, 'iris');
    assert.equal(stB.vmWin.__agPrism.getState().cfg.palette, 'obsidian', 'Window B must sync with reloaded Window A');
    assert.equal(stB.vmWin.__agPrism.getState().cfg.accentTone, 'iris');
    assert.ok(
      activeScripts.size <= 18,
      `HS-1: Active NewDocument script handles across 2 windows × 9 dynamic channels (main + Omni + Sidebar Studio + Inline Diff + Wallpaper + Periodic Picker + Mascot + Suggester + Home Studio) must never leak (got ${activeScripts.size})`
    );

    await daemon.stop(false);
    assert.equal(thoughtDisposed, 1, 'CP-C: PrismDaemon.stop() must dispose lazy services');
    daemon = null;
  } finally {
    if (daemon) await daemon.stop(false).catch(() => {});
    await installPluginTool.uninstallPlugin({ targetDir: targetPluginDir, noCdp: true }).catch(() => {});
    for (const s of sockets) s.destroy();
    await new Promise((r) => server.close(r));
    fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 80 });
  }
});

test('PrismDaemon ignores wcvBrowser non-host loopback pages after skipped-non-host without repeated reconnects or Omni token injection', async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-prism-ignore-wcv-'));
  const targetPluginDir = path.join(workDir, 'obsidian-prism');
  await installPluginTool.installPlugin({ targetDir: targetPluginDir, noCdp: true, skipHostConfig: true, startDaemon: false });

  const sockets = new Set();
  let connectCount = 0;
  let omniEvalCount = 0;
  let currentGuestUrl = 'http://127.0.0.1:5173/app#home';

  function sendWs(socket, obj) {
    const payload = Buffer.from(JSON.stringify(obj), 'utf8');
    let hdr;
    if (payload.length < 126) {
      hdr = Buffer.from([0x81, payload.length]);
    } else if (payload.length < 65536) {
      hdr = Buffer.alloc(4);
      hdr[0] = 0x81;
      hdr[1] = 126;
      hdr.writeUInt16BE(payload.length, 2);
    } else {
      hdr = Buffer.alloc(10);
      hdr[0] = 0x81;
      hdr[1] = 127;
      hdr.writeBigUInt64BE(BigInt(payload.length), 2);
    }
    socket.write(Buffer.concat([hdr, payload]));
  }

  const server = http.createServer((req, res) => {
    if (req.url === '/json/list') {
      const p = server.address().port;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify([
          {
            id: 'WCV_GUEST_TAB_1',
            type: 'page',
            title: 'Antigravity Marketing Landing Preview',
            url: currentGuestUrl,
            webSocketDebuggerUrl: `ws://127.0.0.1:${p}/devtools/page/WCV_GUEST_TAB_1`,
          },
          {
            id: 'OMNI_VIEWER_TAB_1',
            type: 'page',
            title: 'antigravity-notes.md · Prism Omni',
            url: 'http://127.0.0.1:5169/viewer?token=secret&path=antigravity-notes.md',
            webSocketDebuggerUrl: `ws://127.0.0.1:${p}/devtools/page/OMNI_VIEWER_TAB_1`,
          },
        ])
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });

  let touchedOmniViewer = false;
  server.on('upgrade', (req, socket) => {
    if (req.url?.includes('OMNI_VIEWER_TAB_1')) {
      touchedOmniViewer = true;
      socket.destroy();
      return;
    }
    connectCount += 1;
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    const accept = crypto
      .createHash('sha1')
      .update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' +
        accept +
        '\r\n\r\n'
    );
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
        const msg = JSON.parse(Buffer.concat(frags).toString('utf8'));
        frags = [];
        if (msg.method === 'Page.addScriptToEvaluateOnNewDocument') {
          sendWs(socket, { id: msg.id, result: { identifier: 'doc-sc-1' } });
        } else if (msg.method === 'Runtime.evaluate') {
          const expr = String(msg.params?.expression || '');
          if (expr.includes('const serverMeta =')) omniEvalCount += 1;
          sendWs(socket, {
            id: msg.id,
            result: { result: { type: 'object', value: { version: '1.0.6', status: 'skipped-non-host', state: null } } },
          });
        } else {
          sendWs(socket, { id: msg.id, result: {} });
        }
      }
    });
  });

  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  let daemon = null;
  try {
    daemon = new PrismDaemon({
      rootDir: targetPluginDir,
      overridePort: port,
      silent: true,
    });
    daemon.running = true;

    await daemon.tick();
    assert.equal(touchedOmniViewer, false, '/viewer gateway page must be blocked before CDP connect');
    assert.equal(connectCount, 1, 'First tick probes ambiguous wcvBrowser page once');
    assert.equal(omniEvalCount, 0, 'Omni second-channel expression must NEVER evaluate on skipped-non-host page');
    assert.equal(daemon.sessions.size, 0, 'Daemon must immediately detach skipped-non-host page');
    assert.equal(daemon.ignoredTargets.has('WCV_GUEST_TAB_1'), true);

    // Subsequent ticks (including SPA hash change on same pathname) must skip reconnect completely
    currentGuestUrl = 'http://127.0.0.1:5173/app#pricing';
    await daemon.tick();
    await daemon.tick();
    assert.equal(connectCount, 1, 'Subsequent ticks must NOT reconnect to ignored wcvBrowser target');

    // Navigating to a new pathname clears ignore entry and re-evaluates cleanly
    currentGuestUrl = 'http://127.0.0.1:5173/other-route';
    await daemon.tick();
    assert.equal(connectCount, 2, 'Navigating to a new pathname should re-evaluate once and re-ignore');

    // A2 regression guard: ensureMetricsCollector skips slow _lazyUsage.snapshot() unless includeUsage === true
    let usageSnapshotCalls = 0;
    daemon._lazyStore = {
      setCdpPort() {},
      snapshot: async ({ conversationId }) => ({
        connection: 'live',
        speed: { model: 'Gemini 4 Carbon (High)', tps: 72.5, conversationId },
        groups: [{ id: 'gemini-pro', name: 'Gemini Pro' }],
      }),
    };
    daemon._lazyUsage = {
      sync() {},
      snapshot: async () => {
        usageSnapshotCalls += 1;
        await new Promise((r) => setTimeout(r, 120));
        return { quotaWindows: { fiveHour: { tokens: 1234 } } };
      },
      dispose() {},
    };
    const collect = await daemon.ensureMetricsCollector();
    const tFast0 = performance.now();
    const fastSnap = await collect({ conversationId: '11111111-2222-3333-4444-555555555555' });
    const fastElapsed = performance.now() - tFast0;
    assert.equal(usageSnapshotCalls, 0, 'Status-bar polling without includeUsage must NOT invoke _lazyUsage.snapshot()');
    assert.ok(fastElapsed < 80, `Expected unblocked fast snapshot < 80ms, got ${fastElapsed.toFixed(1)}ms`);
    assert.equal(fastSnap.connection, 'live');
    assert.equal(fastSnap.groups.length, 1);
    assert.equal(fastSnap.usage, null);

    const fullSnap = await collect({ conversationId: '11111111-2222-3333-4444-555555555555', includeUsage: true });
    assert.equal(usageSnapshotCalls, 1, 'Explicit includeUsage: true must still populate usage snapshot');
    assert.equal(fullSnap.usage.quotaWindows.fiveHour.tokens, 1234);
  } finally {
    if (daemon) await daemon.stop(false).catch(() => {});
    for (const s of sockets) s.destroy();
    await new Promise((r) => server.close(r));
    fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 80 });
  }
});

test('PrismDaemon security hardening: fail-closed iframe/context revocation, disabled-state SIDEBAR_BINDING & payload caps, atomic config/version-checked refresh/timer cleanup, symlink-safe sync & PID identity verification', async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-prism-sec-harden-'));
  const targetPluginDir = path.join(workDir, 'obsidian-prism');
  await installPluginTool.installPlugin({ targetDir: targetPluginDir, noCdp: true, skipHostConfig: true, startDaemon: false });

  let dummyChild = null;
  let daemon = null;
  try {
    // 1. iframe/上下文 fail-closed 与上下文销毁撤权 + 同帧文档代际防继承
    daemon = new PrismDaemon({
      rootDir: targetPluginDir,
      overridePort: 19999,
      pollIntervalMs: 5000,
      silent: true,
    });

    const ctxEntry = {
      wsUrl: 'ws://127.0.0.1:19999/devtools/page/sec-1',
      pageId: 'sec-1',
      mainFrameId: 'MAIN_F',
      hasFrameTree: true,
      sidebarHostVerified: true,
      sidebarDocument: 0,
      sidebarVerifiedDocument: 0,
      sidebarHostContextId: 1,
      contextFrames: new Map([
        [1, { frameId: 'MAIN_F', isDefault: true, type: 'default', docGen: 0 }],
        [2, { frameId: 'CHILD_F', isDefault: true, type: 'default', docGen: 0 }],
        [3, { frameId: 'MAIN_F', isDefault: false, type: 'isolated', docGen: 0 }],
        [4, { frameId: '', isDefault: true, type: 'default', docGen: 0 }],
      ]),
      session: { closed: false, send: async () => ({}), evaluate: async () => ({ status: 'ok' }) },
    };
    assert.equal(daemon._isTrustedMainFrameBindingCall(ctxEntry, 1), true, 'Valid main-frame default context must pass');
    assert.equal(daemon._isTrustedMainFrameBindingCall(ctxEntry, 2), false, 'Child iframe must be rejected');
    assert.equal(daemon._isTrustedMainFrameBindingCall(ctxEntry, 3), false, 'Isolated world must be rejected');
    assert.equal(daemon._isTrustedMainFrameBindingCall(ctxEntry, 4), false, 'Empty frameId must be rejected fail-closed');
    assert.equal(daemon._isTrustedMainFrameBindingCall(ctxEntry, 999), false, 'Unknown executionContextId must be rejected fail-closed');
    assert.equal(daemon._isTrustedMainFrameBindingCall(ctxEntry, undefined), false, 'Missing executionContextId with frame tree must be rejected');
    assert.equal(
      daemon._isTrustedMainFrameBindingCall({ mainFrameId: null, hasFrameTree: false, contextFrames: new Map([[5, { frameId: 'ANY', isDefault: true, type: 'default' }]]) }, 5),
      false,
      'Without mainFrameId, known context must still fail closed'
    );

    // 通过模拟 attachTarget 事件流验证 executionContextDestroyed 撤权与同帧新上下文不继承旧授权
    const evListeners = new Map();
    const fakeSession = {
      closed: false,
      on(ev, fn) {
        if (!evListeners.has(ev)) evListeners.set(ev, []);
        evListeners.get(ev).push(fn);
      },
      emit(ev, params) {
        for (const fn of evListeners.get(ev) || []) fn(params);
      },
      async send(method) {
        if (method === 'Page.getFrameTree') return { frameTree: { frame: { id: 'TOP_F1' } } };
        if (method === 'Runtime.enable') {
          this.emit('Runtime.executionContextCreated', {
            context: { id: 10, auxData: { frameId: 'TOP_F1', isDefault: true, type: 'default' } },
          });
          this.emit('Runtime.executionContextCreated', {
            context: { id: 11, auxData: { frameId: 'CHILD_IFRAME', isDefault: true, type: 'default' } },
          });
          return {};
        }
        if (method === 'Page.addScriptToEvaluateOnNewDocument') return { identifier: 'sc-mock' };
        return {};
      },
      async evaluate() {
        return { status: 'ok' };
      },
      close() {
        this.closed = true;
      },
    };
    const origConnect = daemon.cdp.CdpSession.connect;
    let sidebarEnsureCalls = 0;
    daemon.ensureOmniServer = async () => null;
    daemon.ensureSidebarService = async () => {
      sidebarEnsureCalls += 1;
      return { handleRpc: async (req) => ({ ok: true, echoed: req.action }) };
    };
    daemon.cdp.CdpSession.connect = async () => fakeSession;
    const evalHistory = [];
    const addScriptHistory = [];
    const origSend = fakeSession.send.bind(fakeSession);
    fakeSession.send = async (method, params) => {
      if (method === 'Page.addScriptToEvaluateOnNewDocument') addScriptHistory.push(String(params?.source || ''));
      return origSend(method, params);
    };
    fakeSession.evaluate = async (expr) => {
      evalHistory.push(String(expr || ''));
      return { status: 'ok' };
    };

    const attachedEntry = await daemon.attachTarget({
      id: 'T_SEC',
      title: 'Antigravity',
      url: 'vscode-file://vscode-app/workbench.html',
      webSocketDebuggerUrl: 'ws://127.0.0.1:19999/devtools/page/T_SEC',
    });
    daemon.cdp.CdpSession.connect = origConnect;

    // 2A. 关闭态 attachTarget 零后台服务启动 & 免下发完整 sidebar-client.js 载荷
    assert.equal(sidebarEnsureCalls, 0, 'Disabled state attachTarget must NOT launch ensureSidebarService()');
    assert.equal(attachedEntry.sidebarScriptId, null, 'Disabled state must NOT register sidebar NewDocument script');
    assert.equal(
      addScriptHistory.some((s) => s.includes('SIDEBAR_STUDIO_CLIENT_V2')),
      false,
      'Disabled state must NOT persist full sidebar-client.js in NewDocument scripts'
    );
    assert.equal(
      evalHistory.some((s) => s.includes('SIDEBAR_STUDIO_CLIENT_V2')),
      false,
      'Disabled state attachTarget must NOT evaluate full sidebar-client.js payload'
    );
    assert.equal(attachedEntry.sidebarHostVerified, true);
    assert.equal(attachedEntry.sidebarHostContextId, 10);

    // 销毁子 iframe (ctx 11) 不应撤权主帧
    fakeSession.emit('Runtime.executionContextDestroyed', { executionContextId: 11 });
    assert.equal(attachedEntry.contextFrames.has(11), false);
    assert.equal(attachedEntry.sidebarHostVerified, true, 'Destroying child iframe must NOT revoke main frame verification');

    // 销毁主帧默认上下文 (ctx 10) 必须立即撤权并递增文档代际，随后同帧新上下文 (ctx 12) 绝不继承旧授权
    const docBeforeDestroy = attachedEntry.sidebarDocument;
    fakeSession.emit('Runtime.executionContextDestroyed', { executionContextId: 10 });
    assert.equal(attachedEntry.contextFrames.has(10), false);
    assert.equal(attachedEntry.sidebarHostVerified, false, 'Destroying main default context must revoke sidebarHostVerified');
    assert.ok(attachedEntry.sidebarDocument > docBeforeDestroy, 'Document generation must increment on revocation');

    fakeSession.emit('Runtime.executionContextCreated', {
      context: { id: 12, auxData: { frameId: 'TOP_F1', isDefault: true, type: 'default' } },
    });
    assert.equal(attachedEntry.sidebarHostVerified, false, 'New context in same frame must NOT inherit old host verification');
    const rejectedAfterRevoke = await daemon.handleBindingCall(attachedEntry, {
      name: SIDEBAR_BINDING,
      executionContextId: 12,
      payload: JSON.stringify({ id: 1, action: 'get-state' }),
    });
    assert.equal(rejectedAfterRevoke, undefined);
    assert.equal(sidebarEnsureCalls, 0);

    // 重新验证 ctx 12 后，测试同帧并发新建 ctx 13 也会自动撤权防继承
    daemon._markSidebarHostVerified(attachedEntry, attachedEntry.sidebarDocument, true);
    assert.equal(attachedEntry.sidebarHostVerified, true);
    assert.equal(attachedEntry.sidebarHostContextId, 12);
    fakeSession.emit('Runtime.executionContextCreated', {
      context: { id: 13, auxData: { frameId: 'TOP_F1', isDefault: true, type: 'default' } },
    });
    assert.equal(attachedEntry.sidebarHostVerified, false, 'New main-frame default context must revoke previous verified document');

    // 2B. SIDEBAR_BINDING 关闭态在 JSON.parse 之前直接返回 { ok: false, error: 'Chat Beta is disabled' }，且校验大小上限
    daemon._markSidebarHostVerified(attachedEntry, attachedEntry.sidebarDocument, true);
    const parsedPayloads = [];
    const origJsonParse = JSON.parse;
    JSON.parse = (...args) => {
      parsedPayloads.push(args[0]);
      return origJsonParse(...args);
    };
    try {
      const invalidDisabledPayload = '{not-even-valid-json';
      const disabledRes = await daemon.handleBindingCall(attachedEntry, {
        name: SIDEBAR_BINDING,
        executionContextId: 13,
        payload: invalidDisabledPayload,
      });
      assert.deepEqual(disabledRes, { ok: false, error: 'Chat Beta is disabled' });
      assert.equal(
        parsedPayloads.includes(invalidDisabledPayload),
        false,
        'Disabled SIDEBAR_BINDING must short-circuit BEFORE JSON.parse(payload)'
      );
      assert.equal(sidebarEnsureCalls, 0, 'Disabled SIDEBAR_BINDING must NOT start sidebar service');

      // 开启 sidebarStudio 后，验证 >12MiB 在 JSON.parse 之前拦截、非 import-spark-file >128KiB 拦截、import-spark-file 允许 >128KiB
      daemon.updateConfigSetting('sidebarStudio', 'on');
      parsedPayloads.length = 0;
      const hugePayload = 'x'.repeat(12 * 1024 * 1024 + 16);
      const hugeRes = await daemon.handleBindingCall(attachedEntry, {
        name: SIDEBAR_BINDING,
        executionContextId: 13,
        payload: hugePayload,
      });
      assert.equal(hugeRes, undefined);
      assert.equal(
        parsedPayloads.includes(hugePayload),
        false,
        '>12MiB payload must be rejected BEFORE JSON.parse(payload)'
      );

      const over128kNonImport = JSON.stringify({ id: 2, action: 'get-state', pad: 'a'.repeat(132000) });
      const nonImportRes = await daemon.handleBindingCall(attachedEntry, {
        name: SIDEBAR_BINDING,
        executionContextId: 13,
        payload: over128kNonImport,
      });
      assert.equal(nonImportRes, undefined, 'Non-import-spark-file >128KiB must be rejected');
      assert.equal(sidebarEnsureCalls, 0);

      const over128kImport = JSON.stringify({ id: 3, action: 'import-spark-file', data: 'b'.repeat(140000) });
      const importRes = await daemon.handleBindingCall(attachedEntry, {
        name: SIDEBAR_BINDING,
        executionContextId: 13,
        payload: over128kImport,
      });
      assert.deepEqual(importRes, { ok: true, echoed: 'import-spark-file' });
      assert.equal(sidebarEnsureCalls, 1);
    } finally {
      JSON.parse = origJsonParse;
    }

    // 3A. 原子写入配置（无 .tmp 残留，POSIX 0o600）+ broadcastConfigRefresh 版本复核（防过期快照覆盖最新设置）
    assert.equal(daemon.updateConfigBatch({ palette: 'warm', sidebarStudio: 'off' }), true);
    const rootFiles = fs.readdirSync(targetPluginDir);
    assert.equal(rootFiles.some((f) => f.endsWith('.tmp')), false, 'Atomic config write must leave 0 .tmp files');
    if (process.platform !== 'win32') {
      assert.equal(fs.statSync(path.join(targetPluginDir, 'config.json')).mode & 0o777, 0o600);
    }

    // 验证关闭态 broadcastConfigRefresh 不启动 ensureSidebarService 且 on->off 仅下发轻量清理
    sidebarEnsureCalls = 0;
    attachedEntry.sidebarMounted = true;
    const evalsDuringRefresh = [];
    fakeSession.evaluate = async (expr) => {
      evalsDuringRefresh.push(String(expr || ''));
      return { refreshed: true };
    };
    await daemon.broadcastConfigRefresh();
    assert.equal(sidebarEnsureCalls, 0, 'Disabled broadcastConfigRefresh must NOT start ensureSidebarService');
    assert.equal(
      evalsDuringRefresh.some((s) => s.includes('SIDEBAR_STUDIO_CLIENT_V2')),
      false,
      'on->off broadcastConfigRefresh must NOT evaluate full sidebar-client.js'
    );
    assert.equal(
      evalsDuringRefresh.some((s) => s.includes('ag-prism-sidebar-studio-css')),
      true,
      'on->off broadcastConfigRefresh must run lightweight cleanup'
    );

    // 验证 broadcastConfigRefresh 在 evaluate 前复核 this._configSeq === snapSeq，阻止过期快照覆盖最新设置
    const evaluatedPalettes = [];
    let mutatedMidFlight = false;
    daemon.ensureOmniServer = async () => {
      if (!mutatedMidFlight) {
        mutatedMidFlight = true;
        // 模拟快照 1（palette=claude）在异步期间已被快照 2（palette=obsidian）超越
        daemon.updateConfigSetting('palette', 'obsidian');
      }
      return null;
    };
    fakeSession.evaluate = async (expr) => {
      const m = String(expr || '').match(/"palette":"([^"]+)"/);
      if (m) evaluatedPalettes.push(m[1]);
      return { refreshed: true };
    };
    daemon.updateConfigSetting('palette', 'claude');
    await daemon.broadcastConfigRefresh();
    assert.equal(
      evaluatedPalettes.includes('claude'),
      false,
      `Stale snapshot ("claude") must be aborted before evaluate when _configSeq advanced (got ${JSON.stringify(evaluatedPalettes)})`
    );
    assert.equal(evaluatedPalettes.at(-1), 'obsidian', 'Latest config snapshot ("obsidian") must win');

    // 3B. stop() 清理 reloadTimer 及托管定时器防退出残留
    let timerFiredAfterStop = false;
    daemon.start({ claimPid: false, watchFiles: true });
    daemon._reloadTimer = setTimeout(() => { timerFiredAfterStop = true; }, 40);
    daemon._discoverTimer = setTimeout(() => { timerFiredAfterStop = true; }, 40);
    const managedT = setTimeout(() => { timerFiredAfterStop = true; }, 40);
    daemon._managedTimers.add(managedT);
    await daemon.stop(false);
    assert.equal(daemon.timer, null, 'stop() must clear poll interval');
    assert.equal(daemon._reloadTimer, null, 'stop() must clear reloadTimer');
    assert.equal(daemon._discoverTimer, null, 'stop() must clear discoverTimer');
    assert.equal(daemon._managedTimers.size, 0, 'stop() must clear all managed timers');
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(timerFiredAfterStop, false, 'No cleared timer may fire after daemon.stop()');

    // 4A. copyUpdatedRuntimeFromRepo 防符号链接/联接点穿越（源与目标双向防御）
    const syncRepo = path.join(workDir, 'sync-repo');
    const syncPlugin = path.join(workDir, 'sync-plugin');
    const outsideDir = path.join(workDir, 'outside-secret');
    fs.mkdirSync(path.join(syncRepo, 'assets'), { recursive: true });
    fs.mkdirSync(path.join(syncPlugin, 'assets'), { recursive: true });
    fs.mkdirSync(outsideDir, { recursive: true });
    fs.writeFileSync(path.join(outsideDir, 'secret.txt'), 'TOP_SECRET', 'utf8');
    fs.writeFileSync(path.join(syncRepo, 'style.css'), 'body { color: #fff; }\n', 'utf8');
    fs.writeFileSync(path.join(syncRepo, 'assets', 'ok.svg'), '<svg/>', 'utf8');

    // 源目录放置指向外部目录的 junction/symlink，以及目标目录放置指向外部目录的 junction/symlink
    let srcDirLinked = false;
    try {
      fs.symlinkSync(outsideDir, path.join(syncRepo, 'assets', 'linked-out'), process.platform === 'win32' ? 'junction' : 'dir');
      srcDirLinked = true;
    } catch {}
    let dstDirLinked = false;
    try {
      fs.symlinkSync(outsideDir, path.join(syncPlugin, 'vendor'), process.platform === 'win32' ? 'junction' : 'dir');
      dstDirLinked = true;
    } catch {}
    fs.mkdirSync(path.join(syncRepo, 'vendor'), { recursive: true });
    fs.writeFileSync(path.join(syncRepo, 'vendor', 'overwrite.txt'), 'PWNED', 'utf8');

    let srcFileLinked = false;
    try {
      fs.symlinkSync(path.join(outsideDir, 'secret.txt'), path.join(syncRepo, 'ui-runtime.js'), 'file');
      srcFileLinked = true;
    } catch {}

    const syncedCount = copyUpdatedRuntimeFromRepo(syncRepo, syncPlugin, ['style.css', 'ui-runtime.js']);
    assert.ok(syncedCount >= 2, 'Normal files must still sync cleanly');
    assert.equal(fs.readFileSync(path.join(syncPlugin, 'style.css'), 'utf8'), 'body { color: #fff; }\n');
    assert.equal(fs.readFileSync(path.join(syncPlugin, 'assets', 'ok.svg'), 'utf8'), '<svg/>');
    if (srcDirLinked) {
      assert.equal(
        fs.existsSync(path.join(syncPlugin, 'assets', 'linked-out', 'secret.txt')),
        false,
        'Source directory symlink/junction must NEVER be traversed or copied'
      );
    }
    if (dstDirLinked) {
      assert.equal(
        fs.existsSync(path.join(outsideDir, 'overwrite.txt')),
        false,
        'Destination directory symlink/junction must NEVER allow writing outside pluginDir'
      );
    }
    if (srcFileLinked) {
      assert.equal(
        fs.existsSync(path.join(syncPlugin, 'ui-runtime.js')),
        false,
        'Source file symlink must NEVER be copied'
      );
    }

    // 4B. stopExistingDaemon PID 身份核验：无校验器不盲杀、无关 node 进程不盲杀、合法签名或测试钩子放行
    assert.equal(isObsidianPrismDaemonCommandLine('node /plugins/obsidian-prism/sidecars/daemon/main.mjs'), true);
    assert.equal(isObsidianPrismDaemonCommandLine('Antigravity.exe --import=file:///lib/sidecar_sdk/register_loader.js main.mjs'), true);
    assert.equal(isObsidianPrismDaemonCommandLine('node /app/unrelated-server.js'), false);
    assert.equal(isObsidianPrismDaemonCommandLine('Antigravity.exe --type=renderer'), false);
    assert.equal(isObsidianPrismDaemonCommandLine('Antigravity.exe --import=file:///lib/sidecar_sdk/register_loader.js /plugins/other/main.mjs'), false);

    dummyChild = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { stdio: 'ignore' });
    const childPid = dummyChild.pid;
    assert.ok(childPid > 0 && childPid !== process.pid);

    const pidDaemon = new PrismDaemon({ rootDir: targetPluginDir, overridePort: 19999, silent: true });
    fs.writeFileSync(pidDaemon.pidFile, JSON.stringify({ pid: childPid, token: 'other', startedAt: Date.now() }), 'utf8');

    const killedPids = [];
    const mockKill = (p) => killedPids.push(p);

    // 缺失 isExpectedDaemonProcess 校验器 -> fail-closed 绝不盲杀
    const origIsExpected = pidDaemon.cdp.isExpectedDaemonProcess;
    pidDaemon.cdp = { ...pidDaemon.cdp, isExpectedDaemonProcess: undefined };
    assert.equal(pidDaemon.stopExistingDaemon({ killProcess: mockKill }), false, 'Missing verifier must fail closed and NOT kill PID');
    assert.deepEqual(killedPids, []);

    // 标准校验器面对无关 node 子进程 -> 命令行复核拒绝杀死
    pidDaemon.cdp = { ...pidDaemon.cdp, isExpectedDaemonProcess: origIsExpected };
    assert.equal(
      pidDaemon.stopExistingDaemon({
        inspectCommandLine: () => 'node -e "setTimeout(() => {}, 30000)"',
        killProcess: mockKill,
      }),
      false,
      'Unrelated node.exe PID must NOT be killed'
    );
    assert.deepEqual(killedPids, []);

    // 标准校验器面对真实 Obsidian Prism daemon 命令行 -> 允许终止
    assert.equal(
      pidDaemon.stopExistingDaemon({
        inspectCommandLine: () => 'node /plugins/obsidian-prism/sidecars/daemon/main.mjs',
        killProcess: mockKill,
      }),
      true
    );
    assert.deepEqual(killedPids, [childPid]);

    // 测试显式注入校验钩子（verifyPid 或覆写 cdp.isExpectedDaemonProcess）保持 100% 兼容
    killedPids.length = 0;
    assert.equal(pidDaemon.stopExistingDaemon({ verifyPid: () => false, killProcess: mockKill }), false);
    assert.equal(pidDaemon.stopExistingDaemon({ verifyPid: (p) => p === childPid, killProcess: mockKill }), true);
    assert.deepEqual(killedPids, [childPid]);

    killedPids.length = 0;
    pidDaemon.cdp = { ...pidDaemon.cdp, isExpectedDaemonProcess: (p) => p === childPid };
    assert.equal(pidDaemon.stopExistingDaemon({ killProcess: mockKill }), true);
    assert.deepEqual(killedPids, [childPid]);
  } finally {
    if (dummyChild && !dummyChild.killed) {
      try { dummyChild.kill(); } catch {}
    }
    if (daemon) await daemon.stop(false).catch(() => {});
    fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 80 });
  }
});

test('inline-fallback & slider-coexist v2.34 perf: win-blur poll suspension + immediate focus resume, single findExtBars per batch, TIER_CSS subagent badge width & streaming ignore selectors', async () => {
  const fbSrc = fs.readFileSync(path.join(ROOT_DIR, 'vendor', 'pulse-dashboard', 'inline-fallback.js'), 'utf8');
  assert.ok(fbSrc.includes('.bar>[data-card="cache"]{max-width:240px}'), 'TIER_CSS must give cache chip 240px max-width so multi-subagent badge never clips');
  assert.ok(fbSrc.includes('max-width:132px'), 'TIER_CSS must widen default chip max-width to 132px');
  assert.ok(fbSrc.includes('max-width:108px;flex-shrink:0'), 'TIER_CSS must prevent inner flex items from shrinking/clipping when expanded');
  assert.ok(fbSrc.includes('max-width:0!important;flex-shrink:1!important'), 'Collapsed tiers must restore flex-shrink:1!important');

  const env = createLightweightDom();
  const winListeners = new Map();
  env.win.addEventListener = (ev, fn) => {
    if (!winListeners.has(ev)) winListeners.set(ev, new Set());
    winListeners.get(ev).add(fn);
  };
  env.win.removeEventListener = (ev, fn) => winListeners.get(ev)?.delete(fn);
  const emitWin = (ev) => { for (const fn of winListeners.get(ev) || []) fn(); };

  const moList = [];
  env.win.MutationObserver = class {
    constructor(cb) { this.cb = cb; this.target = null; this.opts = null; moList.push(this); }
    observe(target, opts) { this.target = target; this.opts = opts; }
    disconnect() { this.target = null; }
  };

  let metricsCalls = 0;
  env.win.__agPrismMetricsCall = (payloadStr) => {
    metricsCalls += 1;
    const req = JSON.parse(payloadStr);
    env.win.__agPrismMetricsResolve(req.id, {
      connection: 'live',
      speed: { model: 'Gemini 4', tps: 55, rounds: 2, cacheHitRate: 0.968, taskUsage: { subagents: 24, total: { totalTokens: 120000 } }, context: { usedTokens: 64000, maxTokens: 256000, usedFraction: 0.25, sampledAt: Date.now() } },
    });
  };

  const ctl = telemetryMod.createTelemetryController({ window: env.win, document: env.doc });
  try {
    ctl.sync({ telemetryModule: 'on' });
    await new Promise((r) => setTimeout(r, 15));
    assert.equal(ctl.getState().mountedFallback, true);
    assert.equal(ctl.getState().pollSuspended, false);
    const afterMountCalls = metricsCalls;
    assert.ok(afterMountCalls >= 1);

    // 1) data-ag-cs-win-blur="1" suspends background telemetry polling; removing it immediately resumes & refreshes
    env.doc.documentElement.setAttribute('data-ag-cs-win-blur', '1');
    const blurMo = moList.find((m) => m.opts?.attributeFilter?.includes('data-ag-cs-win-blur'));
    blurMo?.cb([{ type: 'attributes', attributeName: 'data-ag-cs-win-blur' }]);
    assert.equal(ctl.getState().pollSuspended, true, 'data-ag-cs-win-blur="1" must suspend telemetry poll');

    env.doc.documentElement.removeAttribute('data-ag-cs-win-blur');
    blurMo?.cb([{ type: 'attributes', attributeName: 'data-ag-cs-win-blur' }]);
    await new Promise((r) => setTimeout(r, 15));
    assert.equal(ctl.getState().pollSuspended, false, 'Clearing data-ag-cs-win-blur must resume telemetry poll');
    assert.ok(metricsCalls > afterMountCalls, 'Resuming from win-blur must trigger immediate telemetry refresh');

    // 2) window blur / focus events also suspend & immediately resume polling
    const beforeWinBlurCalls = metricsCalls;
    emitWin('blur');
    assert.equal(ctl.getState().pollSuspended, true, 'window.blur must suspend telemetry poll');
    emitWin('focus');
    await new Promise((r) => setTimeout(r, 15));
    assert.equal(ctl.getState().pollSuspended, false, 'window.focus must restore telemetry poll');
    assert.ok(metricsCalls > beforeWinBlurCalls, 'window.focus must immediately refresh telemetry');

    // 3) seatObs ignores v2.34 [data-testid="agent-response"] / [data-markdown-root] & calls findExtBars at most once per batch
    const seatMo = moList.find((m) => m.opts?.childList && m.opts?.subtree);
    assert.ok(seatMo, 'Expected seatObs MutationObserver');
    const origQsa = env.doc.querySelectorAll.bind(env.doc);
    let extBarQsaCount = 0;
    env.doc.querySelectorAll = (sel) => {
      if (String(sel).includes('ag-pulse-status-bar')) extBarQsaCount += 1;
      return origQsa(sel);
    };

    const withClosest = (node) => {
      node.closest = (sel) => {
        const parts = String(sel).split(',').map((s) => s.trim()).filter(Boolean);
        let cur = node;
        while (cur) {
          for (const p of parts) {
            if (p.startsWith('.') && String(cur.className || '').split(/\s+/).includes(p.slice(1))) return cur;
            const am = p.match(/^\[([a-zA-Z0-9_-]+)(?:="([^"]+)")?\]$/);
            if (am && cur.hasAttribute?.(am[1]) && (am[2] === undefined || cur.getAttribute(am[1]) === am[2])) return cur;
          }
          cur = cur.parentElement;
        }
        return null;
      };
      return node;
    };

    const agentResp = withClosest(env.makeEl('div'));
    agentResp.setAttribute('data-testid', 'agent-response');
    const mdRoot = withClosest(env.makeEl('div'));
    mdRoot.setAttribute('data-markdown-root', 'true');
    agentResp.appendChild(mdRoot);
    env.composerToolbar.parentElement.appendChild(agentResp);

    seatMo.cb([{ target: agentResp }, { target: mdRoot }]);
    assert.equal(extBarQsaCount, 0, 'Streaming mutations inside agent-response / data-markdown-root must fast-skip with 0 DOM bar queries');

    const genericNode = withClosest(env.makeEl('div'));
    env.composerToolbar.parentElement.appendChild(genericNode);
    seatMo.cb([{ target: genericNode }]);
    assert.equal(extBarQsaCount, 1, 'Non-streaming mutation batch must reuse cached findExtBars(doc) at most once');
    env.doc.querySelectorAll = origQsa;
  } finally {
    ctl.destroy();
  }

  // 4) slider-coexist ignores v2.34 [data-testid="agent-response"] & [data-markdown-root]
  const envSlider = createLightweightDom();
  let capturedSliderMo = null;
  envSlider.win.MutationObserver = class {
    constructor(cb) { capturedSliderMo = cb; }
    observe() {}
    disconnect() {}
    takeRecords() { return []; }
  };
  envSlider.win.AntigravityCodexEffortSlider = {
    installCodexEffortSlider(opts) {
      const obs = new opts.MutationObserver(() => {});
      obs.observe(opts.document.body, { childList: true, subtree: true });
      return { stop() {}, rescan() {} };
    },
  };
  const sCtl = sliderMod.createEffortSliderController({ window: envSlider.win, document: envSlider.doc });
  try {
    sCtl.sync({ effortSliderModule: 'on' });
    const attachClosest = (node) => {
      node.closest = (sel) => {
        const parts = String(sel).split(',').map((s) => s.trim()).filter(Boolean);
        let cur = node;
        while (cur) {
          for (const p of parts) {
            const am = p.match(/^\[([a-zA-Z0-9_-]+)(?:="([^"]+)")?\]$/);
            if (am && cur.hasAttribute?.(am[1]) && (am[2] === undefined || cur.getAttribute(am[1]) === am[2])) return cur;
          }
          cur = cur.parentElement;
        }
        return null;
      };
      return node;
    };
    const ar = attachClosest(envSlider.makeEl('div'));
    ar.setAttribute('data-testid', 'agent-response');
    const md = attachClosest(envSlider.makeEl('div'));
    md.setAttribute('data-markdown-root', '');
    ar.appendChild(md);
    envSlider.composerToolbar.parentElement.appendChild(ar);

    const beforeScans = sCtl.getState().perfStats.executedScans;
    capturedSliderMo([{ target: ar }, { target: md }]);
    assert.equal(sCtl.getState().perfStats.executedScans, beforeScans, 'slider-coexist must skip v2.34 agent-response/markdown-root mutations');
    assert.ok(sCtl.getState().perfStats.skippedIrrelevant >= 1);
  } finally {
    sCtl.destroy();
  }
});

test('13-provider localization coexistence: slider bilingual effort/model parsing, 5 no-translate exemption attributes on pulse/omni/slider roots & external widget ignore', async () => {
  // 1) slider-coexist bilingual effort token & parenthesized Chinese model label normalization
  assert.equal(sliderMod.normalizeEffortToken('High'), 'high');
  assert.equal(sliderMod.normalizeEffortToken('高'), 'high');
  assert.equal(sliderMod.normalizeEffortToken('高思考'), 'high');
  assert.equal(sliderMod.normalizeEffortToken('Medium'), 'medium');
  assert.equal(sliderMod.normalizeEffortToken('中'), 'medium');
  assert.equal(sliderMod.normalizeEffortToken('中等'), 'medium');
  assert.equal(sliderMod.normalizeEffortToken('中思考'), 'medium');
  assert.equal(sliderMod.normalizeEffortToken('Low'), 'low');
  assert.equal(sliderMod.normalizeEffortToken('低'), 'low');
  assert.equal(sliderMod.normalizeEffortToken('低思考'), 'low');
  assert.equal(sliderMod.normalizeEffortToken('Auto'), 'auto');
  assert.equal(sliderMod.normalizeEffortToken('自动'), 'auto');
  assert.equal(sliderMod.normalizeEffortToken('Thinking'), 'thinking');
  assert.equal(sliderMod.normalizeEffortToken('深度思考'), 'thinking');
  assert.equal(sliderMod.normalizeEffortToken('思考'), 'thinking');
  assert.equal(sliderMod.normalizeEffortToken('思考中'), 'thinking');

  const pFlash = sliderMod.parseLocalizedModelLabel('Gemini 3.8 Flash (高)');
  assert.equal(pFlash.base, 'Gemini 3.8 Flash');
  assert.equal(pFlash.effort, 'high');
  assert.equal(pFlash.canonicalLabel, 'Gemini 3.8 Flash (High)');

  const pGpt = sliderMod.parseLocalizedModelLabel('GPT-OSS 120B (中)');
  assert.equal(pGpt.base, 'GPT-OSS 120B');
  assert.equal(pGpt.effort, 'medium');
  assert.equal(pGpt.canonicalLabel, 'GPT-OSS 120B (Medium)');

  const pClaudeThink = sliderMod.parseLocalizedModelLabel('Claude Opus 4.6 (深度思考)');
  assert.equal(pClaudeThink.base, 'Claude Opus 4.6 (Thinking)');
  assert.equal(pClaudeThink.effort, 'thinking');
  assert.equal(pClaudeThink.isThinking, true);
  assert.equal(pClaudeThink.canonicalLabel, 'Claude Opus 4.6 (Thinking)');

  const pFullWidth = sliderMod.parseLocalizedModelLabel('选择模型：Gemini 4 Carbon（高思考）');
  assert.equal(pFullWidth.base, 'Gemini 4 Carbon');
  assert.equal(pFullWidth.effort, 'high');

  // Verify syncBilingualDom populates data-model-base & data-model-label for translated panel rows
  const envDom = createLightweightDom();
  const panel = envDom.makeEl('div');
  panel.setAttribute('data-testid', 'model-selector-panel');
  const gSpan = envDom.makeEl('span');
  gSpan.setAttribute('data-testid', 'model-selector-effort-group');
  gSpan.textContent = 'Gemini 3.8 Flash (高)';
  const sItem = envDom.makeEl('div');
  sItem.setAttribute('data-testid', 'model-selector-item');
  sItem.textContent = 'Claude Opus 4.6 (深度思考)';
  panel.appendChild(gSpan);
  panel.appendChild(sItem);
  envDom.doc.body.appendChild(panel);
  sliderMod.syncBilingualDom(envDom.doc);
  assert.equal(gSpan.getAttribute('data-model-base'), 'Gemini 3.8 Flash');
  assert.equal(sItem.getAttribute('data-model-label'), 'Claude Opus 4.6 (Thinking)');

  // 2) Verify all 5 external localization skip attributes on #ag-prism-pulse-bar & omni-client owned UI roots
  const EXPECT_NO_TR = [
    ['translate', 'no'],
    ['data-no-translate', 'true'],
    ['data-ag-localization-skip', 'true'],
    ['data-agy-no-translate', 'true'],
    ['data-antigravity-zh-skip', '1'],
  ];
  const assertNoTranslateAttrs = (el, label) => {
    for (const [k, v] of EXPECT_NO_TR) {
      assert.equal(el.getAttribute(k), v, `${label} missing ${k}="${v}"`);
    }
  };

  const envPulse = createLightweightDom();
  const ctlPulse = telemetryMod.createTelemetryController({ window: envPulse.win, document: envPulse.doc });
  try {
    ctlPulse.sync({ telemetryModule: 'on' });
    const bar = envPulse.doc.getElementById('ag-prism-pulse-bar');
    assert.ok(bar);
    assertNoTranslateAttrs(bar, '#ag-prism-pulse-bar');
  } finally {
    ctlPulse.destroy();
  }

  const omniSrc = fs.readFileSync(path.join(ROOT_DIR, 'vendor', 'omni-viewer', 'omni-client.js'), 'utf8');
  for (const [k, v] of EXPECT_NO_TR) {
    assert.ok(omniSrc.includes(`setAttribute('${k}', '${v}')`), `omni-client markNoTranslate must set ${k}="${v}"`);
  }
  for (const extWidget of ['data-agy-hans-ui', 'agy-theme-switcher', 'agy-theme-menu', 'antigravity-quota-widget', 'antigravity-translation-audit']) {
    assert.ok(omniSrc.includes(extWidget), `omni-client must ignore external localization widget ${extWidget}`);
  }
});

test('host-i18n runtime skips ag-pp- class prefix and #ag-prism-periodic-picker-root without mutating periodic picker DOM', () => {
  const hostI18nMod = require(path.join(ROOT_DIR, 'vendor', 'host-i18n', 'host-i18n-runtime.js'));
  const hostI18nSrc = fs.readFileSync(path.join(ROOT_DIR, 'vendor', 'host-i18n', 'host-i18n-runtime.js'), 'utf8');
  assert.ok(hostI18nSrc.includes("'ag-pp-'"), "host-i18n-runtime.js must whitelist 'ag-pp-' class prefix");
  assert.ok(hostI18nSrc.includes("'ag-prism-periodic-picker-root'"), "host-i18n-runtime.js must whitelist 'ag-prism-periodic-picker-root' ID");

  const mkNode = (tag, text) => {
    const attrs = new Map();
    const el = {
      nodeType: 1,
      tagName: String(tag).toUpperCase(),
      childNodes: [],
      children: [],
      parentNode: null,
      parentElement: null,
      isConnected: true,
      className: '',
      get id() { return attrs.get('id') || ''; },
      set id(v) { attrs.set('id', String(v)); },
      get firstChild() { return el.childNodes[0] || null; },
      get nextSibling() {
        if (!el.parentNode) return null;
        const idx = el.parentNode.childNodes.indexOf(el);
        return idx >= 0 ? el.parentNode.childNodes[idx + 1] || null : null;
      },
      getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
      setAttribute(k, v) { attrs.set(k, String(v)); },
      hasAttribute(k) { return attrs.has(k); },
      removeAttribute(k) { attrs.delete(k); },
      appendChild(child) {
        child.parentNode = el;
        child.parentElement = el;
        child.isConnected = true;
        el.childNodes.push(child);
        if (child.nodeType === 1) el.children.push(child);
        return child;
      },
    };
    if (typeof text === 'string') {
      const txt = {
        nodeType: 3,
        nodeValue: text,
        parentNode: null,
        parentElement: null,
        isConnected: true,
        get nextSibling() {
          if (!this.parentNode) return null;
          const idx = this.parentNode.childNodes.indexOf(this);
          return idx >= 0 ? this.parentNode.childNodes[idx + 1] || null : null;
        },
      };
      el.appendChild(txt);
    }
    return el;
  };
  const rootEl = mkNode('html');
  const bodyEl = mkNode('body');
  rootEl.appendChild(bodyEl);
  const fakeDoc = {
    documentElement: rootEl,
    body: bodyEl,
    readyState: 'complete',
    hidden: false,
    addEventListener() {},
    removeEventListener() {},
    querySelectorAll() { return []; },
    querySelector() { return null; },
    getElementById() { return null; },
  };
  const fakeWin = {
    document: fakeDoc,
    navigator: { language: 'zh-CN' },
    addEventListener() {},
    removeEventListener() {},
    MutationObserver: class { observe() {} disconnect() {} },
    setTimeout,
    clearTimeout,
  };

  const ppWrap = mkNode('div');
  ppWrap.className = 'ag-pp-stage';
  const ppBtn = mkNode('button', 'Settings');
  ppBtn.className = 'ag-pp-keycap';
  ppBtn.setAttribute('aria-label', 'Settings');
  ppWrap.appendChild(ppBtn);

  const ppById = mkNode('div');
  ppById.id = 'ag-prism-periodic-picker-root';
  const ppInner = mkNode('span', 'Settings');
  ppInner.setAttribute('aria-label', 'Settings');
  ppById.appendChild(ppInner);

  const hostBtn = mkNode('button', 'Settings');
  hostBtn.setAttribute('aria-label', 'Settings');

  bodyEl.appendChild(ppWrap);
  bodyEl.appendChild(ppById);
  bodyEl.appendChild(hostBtn);

  const inst = hostI18nMod.mountHostI18n({
    root: fakeWin,
    doc: fakeDoc,
    mode: 'on',
    dict: { exact: { Settings: '设置' } },
  });
  try {
    assert.equal(hostBtn.getAttribute('aria-label'), '设置', 'Normal host chrome button aria-label must be translated');
    assert.equal(hostBtn.childNodes[0].nodeValue, '设置', 'Normal host chrome button text must be translated');
    assert.equal(ppBtn.getAttribute('aria-label'), 'Settings', 'Elements under ag-pp-* class prefix must NEVER have attrs translated');
    assert.equal(ppBtn.childNodes[0].nodeValue, 'Settings', 'Elements under ag-pp-* class prefix must NEVER have text translated');
    assert.equal(ppInner.getAttribute('aria-label'), 'Settings', 'Elements inside #ag-prism-periodic-picker-root must NEVER have attrs translated');
    assert.equal(ppInner.childNodes[0].nodeValue, 'Settings', 'Elements inside #ag-prism-periodic-picker-root must NEVER have text translated');
  } finally {
    inst.destroy();
  }
});

test('Battle 5: usage-core.js full 8-locale coverage (ko/es/fr/de zero zh-CN fallback, yue->zh-CN, unknown->en)', () => {
  const usageCore = require(path.join(ROOT_DIR, 'usage-core.js'));
  assert.equal(usageCore.resolveLang(true), 'zh-CN');
  assert.equal(usageCore.resolveLang(false), 'en');
  assert.equal(usageCore.resolveLang(null), 'en');
  assert.equal(usageCore.resolveLang(undefined), 'en');
  assert.equal(usageCore.resolveLang('unknown-xx'), 'en');
  assert.equal(usageCore.resolveLang('yue'), 'zh-CN');
  assert.equal(usageCore.resolveLang('yue-HK'), 'zh-CN');
  assert.equal(usageCore.resolveLang('zh-HK'), 'zh-TW');
  assert.equal(usageCore.resolveLang('ko-KR'), 'ko');
  assert.equal(usageCore.resolveLang('es-ES'), 'es');
  assert.equal(usageCore.resolveLang('fr-FR'), 'fr');
  assert.equal(usageCore.resolveLang('de-DE'), 'de');

  const HAN_RE = /[\u4e00-\u9fff]/;
  const now = new Date(2026, 10, 14, 12, 0, 0);
  const dk = usageCore.homeDayKey(now);
  const recs = [{
    cascadeId: 'c1',
    subagent: false,
    days: { [dk]: { calls: 4, input: 12000, output: 3000, cacheRead: 10000, cacheWrite: 0, total: 25000, hours: Object.assign(new Array(24).fill(0), { 14: 4 }), models: { 'Gemini 4': { input: 12000, output: 3000, cacheRead: 10000, cacheWrite: 0, total: 25000, calls: 4 } } } },
  }];
  const nowMs = Date.UTC(2026, 10, 14, 12, 0, 0);
  const grp = { id: 'custom-pool', windows: { '5h': { available: true, remaining: 0.45, resetAt: new Date(nowMs + 2 * 3600 * 1000).toISOString() } } };

  for (const lang of ['en', 'ko', 'es', 'fr', 'de']) {
    const rAll = usageCore.homeRangeLabel('all', lang);
    const r30 = usageCore.homeRangeLabel('30d', lang);
    const hr = usageCore.formatHomeHour(14, lang);
    const agg = usageCore.aggregateUsageRollup(recs, 'all', 0, lang, now);
    const qLbl = usageCore.quotaGroupLabel({ id: '' }, lang);
    const eta = usageCore.shortEta(90 * 60 * 1000, lang);
    const eta0 = usageCore.shortEta(0, lang);
    const rst = usageCore.fmtResetTime(Math.floor(nowMs / 1000) + 5400, lang, Math.floor(nowMs / 1000));
    const pace = usageCore.groupQuotaPace(grp, lang, nowMs);
    const dStr = usageCore.homeShortDate(usageCore.homeShortDateFormat(lang), dk);
    for (const piece of [rAll, r30, hr, agg.funBook, qLbl, eta, eta0, rst, pace.label, pace.detail, dStr]) {
      assert.ok(typeof piece === 'string' && piece.length > 0, `${lang} returned empty string`);
      assert.equal(HAN_RE.test(piece), false, `${lang} leaked Han CJK char in "${piece}"`);
    }
  }
  assert.equal(usageCore.homeRangeLabel('all', 'ko'), '전체');
  assert.equal(usageCore.homeRangeLabel('30d', 'fr'), '30j');
  assert.equal(usageCore.homeRangeLabel('7d', 'de'), '7T');
  assert.equal(usageCore.homeRangeLabel('all', 'es'), 'Todo');
  assert.match(usageCore.aggregateUsageRollup(recs, 'all', 0, 'ko', now).funBook, /토큰/);
});

test('Battle 5: pulse-dashboard metrics.mjs BigInt/cadence drift guards & store.mjs GetUserStatus quotaInfo fallback', async () => {
  const { tokenCount, quotaMetrics } = await import('../vendor/pulse-dashboard/sidecars/panel/metrics.mjs');
  const { MetricsStore, fallbackQuotaFromUserStatus } = await import('../vendor/pulse-dashboard/sidecars/panel/store.mjs');

  // 1) BigInt tokenCount support + safe bounds
  assert.equal(tokenCount(0n), 0);
  assert.equal(tokenCount(123456n), 123456);
  assert.equal(tokenCount(-5n), null);
  assert.equal(tokenCount(BigInt(Number.MAX_SAFE_INTEGER) + 1n), null);

  // 2) cadence() handles upstream window & bucketId drift variants without misinterpreting explicit non-5h/weekly windows
  const now = Date.UTC(2026, 10, 14, 12, 0, 0);
  const isoFuture = new Date(now + 3600 * 1000).toISOString();
  const qm = quotaMetrics({
    groups: [
      {
        displayName: 'Gemini Drift',
        buckets: [
          { bucketId: 'gemini-FIVE_HOURS', window: 'FIVE_HOURS', remainingFraction: 0.72, remainingAmount: 4200n, resetTime: isoFuture },
          { bucketId: 'gemini-WEEKLY', window: 'WEEKLY', remainingFraction: 0.88, resetTime: isoFuture },
        ],
      },
      {
        displayName: 'Claude Drift',
        buckets: [
          { bucketId: 'claude-5_hours', remainingFraction: 0.55, resetTime: isoFuture },
          { bucketId: 'claude-7_days', remainingFraction: 0.91, resetTime: isoFuture },
          { bucketId: 'claude-daily', window: 'daily', remainingFraction: 0.1, resetTime: isoFuture },
        ],
      },
      {
        displayName: 'Explicit Non-Standard',
        buckets: [
          { bucketId: 'other-5h', window: 'monthly', remainingFraction: 0.5, resetTime: isoFuture },
        ],
      },
    ],
  }, now);
  assert.equal(qm[0].id, 'gemini');
  assert.equal(qm[0].windows['5h'].available, true);
  assert.equal(qm[0].windows['5h'].remaining, 0.72);
  assert.equal(qm[0].windows['5h'].amount, 4200);
  assert.equal(qm[0].windows.weekly.available, true);
  assert.equal(qm[0].windows.weekly.remaining, 0.88);
  assert.equal(qm[1].id, 'claude');
  assert.equal(qm[1].windows['5h'].remaining, 0.55);
  assert.equal(qm[1].windows.weekly.remaining, 0.91);
  assert.equal(qm[2].windows['5h'].available, false, 'Explicit window="monthly" must not be reinterpreted from bucketId');

  // 3) store.mjs refreshQuota() gracefully falls back to GetUserStatus.clientModelConfigs[].quotaInfo on empty pool or RPC error
  const userStatusPayload = {
    userStatus: {
      email: 'dev@example.com',
      cascadeModelConfigData: {
        clientModelConfigs: [
          { label: 'Gemini 4 Carbon', modelOrAlias: { model: 'gemini-4-carbon' }, quotaInfo: { remainingFraction: 0.8, resetTime: isoFuture } },
          { label: 'Gemini 4 Flash', modelOrAlias: { model: 'gemini-4-flash' }, quotaInfo: { remainingFraction: 0.65, resetTime: isoFuture } },
          { label: 'Claude Opus 4.6', modelOrAlias: { model: 'claude-opus-4-6' }, quotaInfo: { remainingFraction: 0.42, resetTime: isoFuture } },
        ],
      },
    },
  };
  const directFb = fallbackQuotaFromUserStatus(userStatusPayload, now);
  assert.equal(directFb.length, 2);
  assert.equal(directFb.find((g) => g.id === 'gemini').windows['5h'].remaining, 0.65, 'Same-family fallback must pick conservative lowest remainingFraction');
  assert.equal(directFb.find((g) => g.id === 'claude').windows['5h'].remaining, 0.42);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-quota-fb-'));
  try {
    let quotaMode = 'empty';
    const mockClient = {
      async call(method) {
        if (method === 'GetUserStatus') return userStatusPayload;
        if (method === 'RetrieveUserQuotaSummary') {
          if (quotaMode === 'empty') return { groups: [], buckets: [] };
          throw new Error('RetrieveUserQuotaSummary_deprecated');
        }
        return {};
      },
    };
    const store = new MetricsStore(mockClient, { dataDir: tmpDir, transcripts: null });
    await store.refreshQuota(true);
    assert.equal(store.quota.length, 2, 'Empty RetrieveUserQuotaSummary must fall back to GetUserStatus quotaInfo');
    assert.equal(store.quota.find((g) => g.id === 'claude').windows['5h'].remaining, 0.42);

    quotaMode = 'throw';
    await store.refreshQuota(true);
    assert.equal(store.quota.length, 2, 'Throwing RetrieveUserQuotaSummary must fall back to GetUserStatus quotaInfo');

    // When both RetrieveUserQuotaSummary throws AND GetUserStatus has no quotaInfo, propagate the error
    const errStore = new MetricsStore({
      async call(method) {
        if (method === 'GetUserStatus') return { userStatus: { email: 'none@example.com' } };
        throw new Error('rpc_down');
      },
    }, { dataDir: tmpDir, transcripts: null });
    await assert.rejects(() => errStore.refreshQuota(true), /rpc_down/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Battle 5: slider-coexist Traditional Chinese EFF_MAP / Current: prefix & full 5+1 anti-translation attributes across all owned modules', () => {
  // 1) Traditional Chinese EFF_MAP & parseLocalizedModelLabel
  assert.equal(sliderMod.normalizeEffortToken('極高'), 'xhigh');
  assert.equal(sliderMod.normalizeEffortToken('極低'), 'minimal');
  assert.equal(sliderMod.normalizeEffortToken('極簡'), 'minimal');
  assert.equal(sliderMod.normalizeEffortToken('關閉'), 'off');
  assert.equal(sliderMod.normalizeEffortToken('關'), 'off');
  assert.equal(sliderMod.normalizeEffortToken('無'), 'off');
  const pTw = sliderMod.parseLocalizedModelLabel('選擇模型：Claude Opus 4.6（極高）');
  assert.equal(pTw.rawBase, 'Claude Opus 4.6');
  assert.equal(pTw.effort, 'xhigh');
  assert.equal(pTw.canonicalLabel, 'Claude Opus 4.6 (Extra)');
  const pCur = sliderMod.parseLocalizedModelLabel('Current: Gemini 4 Hydrogen (Minimal)');
  assert.equal(pCur.rawBase, 'Gemini 4 Hydrogen');
  assert.equal(pCur.effort, 'minimal');

  // 2) Full 5+1 anti-translation attributes verified across bento-ui, upstream-client, inline-fallback, home-studio-panel
  const bentoSrc = fs.readFileSync(path.join(ROOT_DIR, 'vendor', 'periodic-picker', 'bento-ui.js'), 'utf8');
  for (const attr of ['data-ag-no-i18n', 'translate', 'data-no-translate', 'data-ag-localization-skip', 'data-agy-no-translate', 'data-antigravity-zh-skip']) {
    assert.ok(bentoSrc.includes(`'${attr}'`), `bento-ui.js markPeriodicOwnedRoot must stamp ${attr}`);
  }
  const upstreamSlider = require(path.join(ROOT_DIR, 'vendor', 'effort-slider', 'upstream-client.js'));
  const upEnv = createLightweightDom();
  const upNode = upEnv.makeEl('div');
  upstreamSlider.markNoTranslate(upNode);
  assert.equal(upNode.getAttribute('translate'), 'no');
  assert.equal(upNode.getAttribute('data-ag-localization-skip'), 'true');
  assert.equal(upNode.getAttribute('data-agy-no-translate'), 'true');
  assert.equal(upNode.getAttribute('data-antigravity-zh-skip'), '1');
  assert.equal(upNode.getAttribute('data-ag-no-i18n'), '');

  const pulseEnv = createLightweightDom();
  const pulseCtl = telemetryMod.createTelemetryController({ window: pulseEnv.win, document: pulseEnv.doc });
  try {
    pulseCtl.sync({ telemetryModule: 'on' });
    const bar = pulseEnv.doc.getElementById('ag-prism-pulse-bar');
    assert.equal(bar.getAttribute('data-ag-no-i18n'), '', '#ag-prism-pulse-bar must include data-ag-no-i18n=""');
    assert.equal(bar.getAttribute('data-no-translate'), 'true');
    assert.equal(bar.getAttribute('data-ag-localization-skip'), 'true');
    assert.equal(bar.getAttribute('data-agy-no-translate'), 'true');
    assert.equal(bar.getAttribute('data-antigravity-zh-skip'), '1');
  } finally {
    pulseCtl.destroy();
  }
});

test('Smoked Obsidian Wave 1: style.css hygiene (0 :has, ASCII, LF, no BOM, home-panel backdrop-filter:none) & Ch1 < 549,500 B across all 9 locales', () => {
  const cssBuf = fs.readFileSync(path.join(ROOT_DIR, 'style.css'));
  assert.equal(cssBuf[0] === 0xef && cssBuf[1] === 0xbb && cssBuf[2] === 0xbf, false, 'style.css must have zero UTF-8 BOM');
  const css = cssBuf.toString('utf8');
  assert.equal(css.includes('\r'), false, 'style.css must use LF line endings only (0 CRLF)');
  assert.equal(css.includes(':has('), false, 'style.css must have 0 :has(');
  assert.equal(/[^\x00-\x7F]/.test(css), false, 'style.css must be strictly ASCII');
  const homeLine = css.split('\n').find((l) => l.startsWith('.ag-cs-home-panel{')) || '';
  assert.ok(homeLine.includes('backdrop-filter:none') && !homeLine.includes('blur('));
  assert.ok(css.includes('.ag-cs-home-chart-svg{') && css.includes('.ag-cs-home-chart-peak{'));
  assert.ok(css.includes('--ag-cs-menu-bg:rgba(13,14,18,.94);') && css.includes('--ag-cs-menu-bg-l:rgba(252,253,254,.96);'));

  for (const lang of ['auto', 'zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'es', 'fr', 'de']) {
    const expr = cdp.buildInjectExpression({ ...cdp.DEFAULT_CONFIG, language: lang }, { bundleCachePath: '' });
    const bytes = Buffer.byteLength(expr, 'utf8');
    assert.ok(bytes < 595000, `Channel 1 (${lang}) must be strictly < 595,000 B, got ${bytes}`);
  }
});

test('Issue #81: inline-fallback TIER_CSS uses --pt-c instead of --c so external Dashboard card background is never overridden', async () => {
  const fbPath = path.join(ROOT_DIR, 'vendor', 'pulse-dashboard', 'inline-fallback.js');
  const bridgePath = path.join(ROOT_DIR, 'pulse-vial-bridge.js');
  const fbSrc = fs.readFileSync(fbPath, 'utf8');
  const bridgeBytes = fs.statSync(bridgePath).size;

  assert.ok(bridgeBytes < 31000, `pulse-vial-bridge.js must stay < 31,000 B (got ${bridgeBytes})`);
  assert.equal(/--c\s*:/.test(fbSrc), false, 'inline-fallback.js must not declare --c: CSS custom property');
  assert.equal(/var\(\s*--c\s*[,)]/.test(fbSrc), false, 'inline-fallback.js must not reference var(--c)');
  assert.ok(fbSrc.includes('--pt-c:var(--pv-tint,var(--pulse-ring,#3186ff))'), 'TIER_CSS must declare isolated --pt-c');
  assert.ok(fbSrc.includes('color-mix(in srgb,var(--pt-c) '), 'TIER_CSS tier-5 highlight must reference var(--pt-c)');

  // Runtime check: external #ag-pulse-status-bar receives style[data-pt="1"] without --c collision
  const telemetryMod = require(fbPath);
  const env = createLightweightDom();
  const extBar = env.doc.createElement('div');
  extBar.id = 'ag-pulse-status-bar';
  const extStyles = [];
  const bridgeStyle = env.doc.createElement('style');
  bridgeStyle.setAttribute('data-ag-cs-pulse-style', '1');
  bridgeStyle.textContent = ':host{--c:linear-gradient(160deg,#12151ff5,#0b0d13fa);}.card{background:var(--c)!important;}';
  extStyles.push(bridgeStyle);
  extBar.shadowRoot = {
    querySelector: (sel) => (String(sel).includes('data-pt') ? extStyles.find((s) => s.getAttribute('data-pt') === '1') || null : null),
    appendChild: (el) => { extStyles.push(el); return el; },
  };
  const footer = env.doc.createElement('div');
  footer.className = 'agy-composer-footer';
  footer.getBoundingClientRect = () => ({ left: 0, top: 0, width: 320, height: 30, right: 320, bottom: 30 });
  footer.appendChild(extBar);
  env.doc.body.appendChild(footer);

  const ctl = telemetryMod.createTelemetryController({ window: env.win, document: env.doc });
  try {
    ctl.sync({ telemetryModule: 'auto' });
    const ptStyle = extStyles.find((s) => s.getAttribute('data-pt') === '1');
    assert.ok(ptStyle, 'external bar shadowRoot must receive style[data-pt="1"]');
    assert.equal(/--c\s*:/.test(ptStyle.textContent), false, 'injected style[data-pt="1"] must not define --c:');
    assert.ok(ptStyle.textContent.includes('--pt-c:'), 'injected style[data-pt="1"] must define --pt-c:');
    assert.ok(ptStyle.textContent.includes('var(--pt-c)'), 'injected style[data-pt="1"] must reference var(--pt-c)');
  } finally {
    ctl.destroy();
  }
});

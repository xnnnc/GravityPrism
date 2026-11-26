import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, '..');
const cdp = require(path.join(ROOT, 'cdp.js'));
const i18nCore = require('../i18n-core.js');
const i18nLocales = require('../i18n-locales.js');
const settingsPanel = require('../settings-panel.js');
const pulseInlineFallback = require('../vendor/pulse-dashboard/inline-fallback.js');

function createMiniDom() {
  const FILTER_ACCEPT = 1;
  const FILTER_REJECT = 2;
  const FILTER_SKIP = 3;
  const SHOW_TEXT = 4;
  const SHOW_ELEMENT = 1;

  function makeText(text) {
    return {
      nodeType: 3,
      nodeValue: String(text),
      parentElement: null,
      parentNode: null,
      isConnected: true,
      childNodes: [],
      children: [],
    };
  }

  function matchesSimple(node, simple) {
    let rest = simple.trim();
    if (!rest) return false;
    const tagM = /^[a-zA-Z0-9_-]+/.exec(rest);
    if (tagM) {
      if (node.tagName !== tagM[0].toUpperCase()) return false;
      rest = rest.slice(tagM[0].length);
    }
    while (rest) {
      if (rest[0] === '#') {
        const m = /^#([a-zA-Z0-9_-]+)/.exec(rest);
        if (!m || node.id !== m[1]) return false;
        rest = rest.slice(m[0].length);
      } else if (rest[0] === '.') {
        const m = /^\.([a-zA-Z0-9_-]+)/.exec(rest);
        if (!m || !node.classList.contains(m[1])) return false;
        rest = rest.slice(m[0].length);
      } else if (rest[0] === '[') {
        const m = /^\[([^\]=*^$]+)(?:="([^"]*)")?\]/.exec(rest);
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

  function matchesSelector(node, sel) {
    if (!node || node.nodeType !== 1) return false;
    return sel.split(',').some((part) => {
      const tokens = part.trim().split(/\s+/).filter(Boolean);
      if (!tokens.length || !matchesSimple(node, tokens[tokens.length - 1])) return false;
      let cur = node.parentElement;
      let idx = tokens.length - 2;
      while (cur && idx >= 0) {
        if (matchesSimple(cur, tokens[idx])) idx--;
        cur = cur.parentElement;
      }
      return idx < 0;
    });
  }

  function makeEl(tag, opts = {}) {
    const attrs = new Map(Object.entries(opts.attrs || {}));
    const classes = new Set((opts.className || '').split(/\s+/).filter(Boolean));
    const childNodes = [];
    const el = {
      nodeType: 1,
      tagName: tag.toUpperCase(),
      id: opts.id || attrs.get('id') || '',
      parentElement: null,
      parentNode: null,
      isConnected: true,
      childNodes,
      get children() {
        return childNodes.filter((c) => c.nodeType === 1);
      },
      classList: {
        contains: (c) => classes.has(c),
        add: (c) => classes.add(c),
        remove: (c) => classes.delete(c),
      },
      append(...nodes) {
        for (const n of nodes) {
          const item = typeof n === 'string' ? makeText(n) : n;
          item.parentElement = this;
          item.parentNode = this;
          childNodes.push(item);
        }
        return this;
      },
      appendChild(n) {
        return this.append(n);
      },
      setAttribute(k, v) {
        attrs.set(k, String(v));
        if (k === 'id') this.id = String(v);
      },
      getAttribute(k) {
        return attrs.has(k) ? attrs.get(k) : null;
      },
      hasAttribute(k) {
        return attrs.has(k);
      },
      removeAttribute(k) {
        attrs.delete(k);
      },
      matches(sel) {
        return matchesSelector(this, sel);
      },
      closest(sel) {
        let cur = this;
        while (cur) {
          if (matchesSelector(cur, sel)) return cur;
          cur = cur.parentElement;
        }
        return null;
      },
      contains(other) {
        let cur = other;
        while (cur) {
          if (cur === this) return true;
          cur = cur.parentElement;
        }
        return false;
      },
      querySelector(sel) {
        return this.querySelectorAll(sel)[0] || null;
      },
      querySelectorAll(sel) {
        const out = [];
        const walk = (n) => {
          for (const c of n.childNodes) {
            if (c.nodeType === 1) {
              if (matchesSelector(c, sel)) out.push(c);
              walk(c);
            }
          }
        };
        walk(this);
        return out;
      },
      get textContent() {
        return childNodes.map((c) => (c.nodeType === 3 ? c.nodeValue : c.textContent)).join('');
      },
    };
    if (opts.text) el.append(makeText(opts.text));
    return el;
  }

  let activeObserverCb = null;
  class MockMutationObserver {
    constructor(cb) {
      this.cb = cb;
    }
    observe() {
      activeObserverCb = this.cb;
    }
    disconnect() {
      if (activeObserverCb === this.cb) activeObserverCb = null;
    }
  }

  const html = makeEl('html', { attrs: { lang: 'en' } });
  const body = makeEl('body');
  html.append(body);

  const doc = {
    nodeType: 9,
    documentElement: html,
    body,
    get childNodes() {
      return [html];
    },
    defaultView: { MutationObserver: MockMutationObserver },
    createTreeWalker(root, whatToShow, filter) {
      const list = [];
      const accept = (n) => {
        if (n.nodeType === 1 && !(whatToShow & SHOW_ELEMENT)) return FILTER_SKIP;
        if (n.nodeType === 3 && !(whatToShow & SHOW_TEXT)) return FILTER_SKIP;
        if (filter && typeof filter.acceptNode === 'function') return filter.acceptNode(n);
        return FILTER_ACCEPT;
      };
      const traverse = (node) => {
        for (const ch of node.childNodes) {
          const res = accept(ch);
          if (res === FILTER_REJECT) continue;
          if (res === FILTER_ACCEPT) list.push(ch);
          if (ch.nodeType === 1) traverse(ch);
        }
      };
      traverse(root);
      let idx = -1;
      return {
        currentNode: null,
        nextNode() {
          idx += 1;
          if (idx >= list.length) return false;
          this.currentNode = list[idx];
          return true;
        },
      };
    },
    querySelector: (s) => html.querySelector(s),
    querySelectorAll: (s) => html.querySelectorAll(s),
  };

  return {
    doc,
    html,
    body,
    makeEl,
    makeText,
    NodeFilter: { SHOW_TEXT, SHOW_ELEMENT, FILTER_ACCEPT, FILTER_REJECT },
    MutationObserver: MockMutationObserver,
    emitMutation(records) {
      if (activeObserverCb) activeObserverCb(records);
    },
  };
}

test('normalizeLanguage, LANG_OPTIONS, and UI_TABLE support all 8 required languages + yue migration', () => {
  assert.deepEqual(
    i18nCore.LANG_OPTIONS.map((o) => [o.id, o.label]),
    [
      ['zh-CN', '简体中文'],
      ['zh-TW', '繁體中文'],
      ['en', 'English'],
      ['ja', '日本語'],
      ['ko', '한국어'],
      ['es', 'Español'],
      ['fr', 'Français'],
      ['de', 'Deutsch'],
    ]
  );

  assert.equal(i18nCore.normalizeLanguage('zh-CN'), 'zh-CN');
  assert.equal(i18nCore.normalizeLanguage('zh_TW'), 'zh-TW');
  assert.equal(i18nCore.normalizeLanguage('zh-Hant'), 'zh-TW');
  assert.equal(i18nCore.normalizeLanguage('zh-HK'), 'zh-TW');
  assert.equal(i18nCore.normalizeLanguage('zh-MO'), 'zh-TW');
  assert.equal(i18nCore.normalizeLanguage('yue'), 'zh-CN');
  assert.equal(i18nCore.normalizeLanguage('zh-yue'), 'zh-CN');
  assert.equal(i18nCore.normalizeLanguage('cantonese'), 'zh-CN');
  assert.equal(i18nCore.normalizeLanguage('en-US'), 'en');
  assert.equal(i18nCore.normalizeLanguage('ja-JP'), 'ja');
  assert.equal(i18nCore.normalizeLanguage('ko-KR'), 'ko');
  assert.equal(i18nCore.normalizeLanguage('es-ES'), 'es');
  assert.equal(i18nCore.normalizeLanguage('fr-FR'), 'fr');
  assert.equal(i18nCore.normalizeLanguage('de-DE'), 'de');
  assert.equal(i18nCore.normalizeLanguage(true), 'zh-CN');
  assert.equal(i18nCore.normalizeLanguage(false), 'en');
  for (const cjkLang of ['zh-CN', 'zh-TW', 'ja', 'ko']) {
    assert.equal(i18nCore.isCjkLanguage(cjkLang), true, `isCjkLanguage(${cjkLang}) must be true`);
  }
  for (const latinLang of ['en', 'es', 'fr', 'de']) {
    assert.equal(i18nCore.isCjkLanguage(latinLang), false, `isCjkLanguage(${latinLang}) must be false`);
  }

  for (const lang of ['zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'es', 'fr', 'de']) {
    const ui = i18nLocales.getUiStrings(lang);
    assert.ok(ui.setLanguageTitle);
    assert.ok(ui.setLanguageDesc);
    assert.ok(ui.setSidebarCompactTitle);
    assert.ok(ui.setPlaceholderTitle);
    assert.ok(ui.optHost);
    assert.ok(ui.tabOverview);
    assert.ok(ui.tabModels);
    assert.ok(ui.studioPlaceholder);
  }

  assert.deepEqual(i18nLocales.DICT_ROWS, []);
  const zhBundle = i18nLocales.resolveLocaleBundle('zh-CN');
  assert.ok(zhBundle);
  assert.deepEqual(zhBundle.rules, []);
  assert.deepEqual(zhBundle.timeRules, []);
  assert.deepEqual(zhBundle.sentences, []);
  assert.equal(i18nLocales.resolveLocaleBundle('en'), null);
});

test('createDomTranslator returns null and leaves Antigravity host DOM untouched (coexists with host localization)', () => {
  const { doc, html, body, makeEl, makeText } = createMiniDom();

  const dialog = makeEl('div', { attrs: { role: 'dialog' } });
  const h2 = makeEl('h2', { text: 'Appearance' });
  const workedBtn = makeEl('button', { text: 'Worked for 4m 12s' });
  const homeGreeting = makeEl('h1', { text: 'Welcome back, girl. Where should we pick up?' });
  const modelBtn = makeEl('button', {
    attrs: { 'data-testid': 'model-selector-trigger', 'aria-label': 'Select model, current: Gemini 4 Hydrogen (High)' },
  });
  const prose = makeEl('div', { className: 'prose' });
  prose.append(makeEl('code', { text: 'now' }), makeText(' text'));
  body.append(dialog, h2, workedBtn, homeGreeting, modelBtn, prose);

  const translator = i18nCore.createDomTranslator(i18nLocales.resolveLocaleBundle);
  assert.equal(translator, null);
  assert.equal(h2.textContent, 'Appearance');
  assert.equal(workedBtn.textContent, 'Worked for 4m 12s');
  assert.equal(homeGreeting.textContent, 'Welcome back, girl. Where should we pick up?');
  assert.equal(modelBtn.getAttribute('aria-label'), 'Select model, current: Gemini 4 Hydrogen (High)');
  assert.equal(html.getAttribute('lang'), 'en');
  assert.equal(html.hasAttribute('data-ag-cs-cjk'), false);
});

test('v1.0.1 i18n keys cover all 8 languages for scene presets, 6 new config keys, sub-tabs, backup/reset & quotas', () => {
  const requiredNewKeys = [
    'presetBarLabel',
    'presetUltra',
    'presetFocus',
    'presetEco',
    'subTabAll',
    'subTabAppearance',
    'subTabInteraction',
    'subTabThought',
    'subTabModules',
    'subTabAbout',
    'setAccentToneTitle',
    'setCornerStyleTitle',
    'setCodeFontTitle',
    'setCodeLigaturesTitle',
    'setAmbientIntensityTitle',
    'setThoughtViewTitle',
    'cfgExportBtn',
    'cfgImportBtn',
    'cfgResetBtn',
    'workspaceAll',
    'fiveHourLabel',
    'setOmniTitle',
    'setOmniDesc',
    'setLinkTargetTitle',
    'setLinkTargetDesc',
    'optLinkBuiltin',
    'optLinkExternal',
    'omniOpenBuiltin',
    'omniOpenPreview',
    'omniOpenExternal',
    'omniOpenBrowser',
    'omniRevealFolder',
    'omniInsertMention',
    'omniCopyLink',
    'omniCopyAbsPath',
    'omniCopyRelPath',
    'omniCopyText',
    'omniZoomDiagram',
    'omniViewWorkbench',
    'omniViewRaw',
    'omniReload',
    'omniBack',
    'omniForward',
    'setUpdateChannelTitle',
    'setUpdateChannelDesc',
    'optChannelStable',
    'optChannelBeta',
    'setScrollBottomTitle',
    'setScrollBottomDesc',
    'optScrollBottomSmooth',
    'optScrollBottomInstant',
    'inlineDiffOpenSidebar',
    'inlineDiffCollapse',
    'inlineDiffLoading',
    'inlineDiffBinary',
    'inlineDiffNoPreview',
    'sidebarMoreLabel',
    'sidebarLessLabel',
    'setSidebarNavFoldLabel',
    'setSidebarNavFoldDesc',
    'optSidebarNavFoldOff',
    'optSidebarNavFoldOn',
  ];
  const removedPermKeys = [
    'permPolicyTitle',
    'permAskLabel',
    'permAutoLabel',
    'permTurboLabel',
    'permAskDesc',
    'permAutoDesc',
    'permTurboDesc',
  ];
  for (const lang of ['zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'es', 'fr', 'de']) {
    const ui = i18nLocales.getUiStrings(lang);
    for (const k of requiredNewKeys) {
      assert.ok(typeof ui[k] === 'string' && ui[k].trim().length > 0, `Missing ${k} for language ${lang}`);
    }
    for (const removedKey of removedPermKeys) {
      assert.equal(ui[removedKey], undefined, `Obsolete ${removedKey} must be removed for language ${lang}`);
    }
  }
});

test('settings-panel schema, scene presets, strict apiKey-stripping JSON export, and allowlist-validated JSON import', () => {
  // Verify all 40 global config keys (including effortSliderStyle, darkAura, darkAuraStyle, convRipple, effortMemory, periodicModelPicker, contextMenu, sidebarNavFold, scrollBottomMotion, hostLocalization, omniModule, linkTarget, sidebarStudio, autoUpdate, updateChannel & autoArchiveOnExit) match exact contract
  const { PRISM_SETTINGS_SCHEMA, SCENE_PRESETS, buildSanitizedConfigExport, validateImportedConfigJson, getDefaultSettingsPatch } =
    settingsPanel;
  assert.equal(Object.keys(PRISM_SETTINGS_SCHEMA).length, 40);
  assert.deepEqual(PRISM_SETTINGS_SCHEMA.effortSliderStyle.allowed, ['classic', 'prism', 'ferrofluid', 'orbital', 'oscilloscope', 'plasma', 'supernova', 'swarm']);
  assert.equal(PRISM_SETTINGS_SCHEMA.effortSliderStyle.default, 'classic');
  assert.deepEqual(PRISM_SETTINGS_SCHEMA.homeRipple.allowed, [true, false]);
  assert.equal(PRISM_SETTINGS_SCHEMA.homeRipple.default, true);
  assert.deepEqual(PRISM_SETTINGS_SCHEMA.convRipple.allowed, ['off', 'subtle', 'medium', 'full']);
  assert.equal(PRISM_SETTINGS_SCHEMA.convRipple.default, 'off');
  assert.deepEqual(PRISM_SETTINGS_SCHEMA.darkAura.allowed, ['subtle', 'balanced', 'vivid']);
  assert.equal(PRISM_SETTINGS_SCHEMA.darkAura.default, 'balanced');
  assert.deepEqual(PRISM_SETTINGS_SCHEMA.darkAuraStyle.allowed, ['prism', 'neon']);
  assert.equal(PRISM_SETTINGS_SCHEMA.darkAuraStyle.default, 'prism');
  assert.deepEqual(PRISM_SETTINGS_SCHEMA.autoArchiveOnExit.allowed, [true, false]);
  assert.equal(PRISM_SETTINGS_SCHEMA.autoArchiveOnExit.default, false);
  assert.deepEqual(PRISM_SETTINGS_SCHEMA.effortMemory.allowed, ['on', 'off']);
  assert.equal(PRISM_SETTINGS_SCHEMA.effortMemory.default, 'on');
  assert.deepEqual(PRISM_SETTINGS_SCHEMA.periodicModelPicker.allowed, ['on', 'off']);
  assert.equal(PRISM_SETTINGS_SCHEMA.periodicModelPicker.default, 'on');
  for (const lang of ['zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'es', 'fr', 'de']) {
    const ui = i18nLocales.getUiStrings(lang);
    assert.ok(typeof ui.setPeriodicPickerTitle === 'string' && ui.setPeriodicPickerTitle.trim().length > 0, `Missing setPeriodicPickerTitle for ${lang}`);
    assert.ok(typeof ui.setPeriodicPickerDesc === 'string' && ui.setPeriodicPickerDesc.trim().length > 0, `Missing setPeriodicPickerDesc for ${lang}`);
  }
  assert.deepEqual(PRISM_SETTINGS_SCHEMA.sidebarNavFold.allowed, ['off', 'on']);
  assert.equal(PRISM_SETTINGS_SCHEMA.sidebarNavFold.default, 'off');
  assert.deepEqual(PRISM_SETTINGS_SCHEMA.scrollBottomMotion.allowed, ['smooth', 'instant']);
  assert.equal(PRISM_SETTINGS_SCHEMA.scrollBottomMotion.default, 'smooth');
  assert.deepEqual(PRISM_SETTINGS_SCHEMA.hostLocalization.allowed, ['auto', 'on', 'off']);
  assert.equal(PRISM_SETTINGS_SCHEMA.hostLocalization.default, 'auto');
  assert.deepEqual(PRISM_SETTINGS_SCHEMA.accentTone.allowed, ['follow', 'cobalt', 'iris', 'amber', 'mono']);
  assert.deepEqual(PRISM_SETTINGS_SCHEMA.cornerStyle.allowed, ['sharp', 'balanced', 'soft']);
  assert.deepEqual(PRISM_SETTINGS_SCHEMA.codeFont.allowed, ['default', 'jetbrains', 'cascadia', 'sfmono']);
  assert.deepEqual(PRISM_SETTINGS_SCHEMA.codeLigatures.allowed, [true, false]);
  assert.deepEqual(PRISM_SETTINGS_SCHEMA.ambientIntensity.allowed, ['0', '35', '70', '100']);
  assert.deepEqual(PRISM_SETTINGS_SCHEMA.thoughtView.allowed, ['immersive', 'bilingual']);
  assert.deepEqual(PRISM_SETTINGS_SCHEMA.omniModule.allowed, ['on', 'off']);
  assert.equal(PRISM_SETTINGS_SCHEMA.omniModule.default, 'on');
  assert.deepEqual(PRISM_SETTINGS_SCHEMA.linkTarget.allowed, ['builtin', 'external']);
  assert.equal(PRISM_SETTINGS_SCHEMA.linkTarget.default, 'builtin');
  assert.deepEqual(PRISM_SETTINGS_SCHEMA.sidebarStudio.allowed, ['on', 'off']);
  assert.equal(PRISM_SETTINGS_SCHEMA.sidebarStudio.default, 'off');
  assert.deepEqual(PRISM_SETTINGS_SCHEMA.autoUpdate.allowed, ['on', 'off']);
  assert.equal(PRISM_SETTINGS_SCHEMA.autoUpdate.default, 'off');
  assert.deepEqual(PRISM_SETTINGS_SCHEMA.updateChannel.allowed, ['stable', 'beta']);
  assert.equal(PRISM_SETTINGS_SCHEMA.updateChannel.default, 'stable');
  assert.ok(SCENE_PRESETS.ultra && SCENE_PRESETS.focus && SCENE_PRESETS.eco);

  // Export MUST strip apiKey, secret fields, and embedded sk-... tokens
  const mockSkPrefix = 'sk' + '-';
  const exported = buildSanitizedConfigExport(
    { palette: 'warm', accentTone: 'cobalt', thoughtView: 'bilingual', apiKey: mockSkPrefix + 'SUPERSECRET1234567890' },
    {
      stylePreset: 'custom',
      customPrompt: 'Translate cleanly without leaking ' + mockSkPrefix + 'ABCDEF1234567890TOKEN',
      activeProfileId: 'p-1',
      profiles: [
        {
          id: 'p-1',
          name: 'OpenRouter',
          baseUrl: 'https://openrouter.ai/api/v1',
          model: 'deepseek/deepseek-chat',
          apiKey: mockSkPrefix + 'LIVEKEY999888777666555',
          maskedKey: 'sk-...6555',
        },
      ],
    },
    '1.0.1'
  );
  const exportedJson = JSON.stringify(exported);
  assert.equal(exportedJson.includes('SUPERSECRET'), false);
  assert.equal(exportedJson.includes('LIVEKEY999'), false);
  assert.equal(exportedJson.includes('ABCDEF123456'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(exported.thought.profiles[0], 'apiKey'), false);
  assert.equal(exported.settings.accentTone, 'cobalt');
  assert.equal(exported.settings.thoughtView, 'bilingual');

  // Import MUST block prototype pollution, unknown keys, out-of-range values, and injected apiKeys
  const maliciousRaw = JSON.stringify({
    __proto__: { polluted: true },
    constructor: { prototype: { polluted: true } },
    settings: {
      palette: 'claude', // legacy alias -> normalized to 'warm'
      accentTone: 'iris',
      cornerStyle: 'invalid-corner', // rejected
      codeLigatures: true,
      omniModule: 'off',
      linkTarget: 'external',
      unknownHackKey: 'evil', // rejected
      apiKey: mockSkPrefix + 'EVILKEY1234567890', // rejected
    },
    thought: {
      stylePreset: 'concise',
      profiles: [{ id: 'p1', name: 'Local', baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen', apiKey: mockSkPrefix + 'INJECTED9999999999' }],
    },
  });
  const validated = validateImportedConfigJson(maliciousRaw);
  assert.equal(validated.ok, true);
  assert.equal(({}).polluted, undefined);
  assert.deepEqual(validated.settings, {
    palette: 'warm',
    accentTone: 'iris',
    codeLigatures: true,
    omniModule: 'off',
    linkTarget: 'external',
  });
  assert.equal(validated.thought.keepExistingKey, true);
  assert.equal(validated.thought.profiles[0].apiKey, '');
  assert.equal(validated.thought.profiles[0].keepExistingKey, true);

  // Boolean alias support for omniModule, periodicModelPicker & sidebarNavFold (true -> 'on', false -> 'off') + legacy mascot:'dual' & language:'auto'
  const boolAlias = validateImportedConfigJson(JSON.stringify({ omniModule: false, periodicModelPicker: false, sidebarNavFold: true, linkTarget: 'builtin', mascot: 'dual', language: 'auto' }));
  assert.equal(boolAlias.ok, true);
  assert.equal(boolAlias.settings.omniModule, 'off');
  assert.equal(boolAlias.settings.periodicModelPicker, 'off');
  assert.equal(boolAlias.settings.sidebarNavFold, 'on');
  assert.equal(boolAlias.settings.linkTarget, 'builtin');
  assert.equal(boolAlias.settings.mascot, 'crab');
  assert.ok(['zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'es', 'fr', 'de'].includes(boolAlias.settings.language));

  assert.equal(i18nLocales.getUiStrings('zh-CN').presetUltra, '完整光效');
  assert.equal(i18nLocales.getUiStrings('en').presetUltra, 'Full Visuals');

  assert.equal(validateImportedConfigJson('not-json').ok, false);
  assert.equal(validateImportedConfigJson('{"unknownOnly": 1}').ok, false);
  const defaultPatch = getDefaultSettingsPatch();
  assert.equal(Object.keys(defaultPatch).length, 40);
  assert.equal(defaultPatch.effortSliderStyle, 'classic');
  assert.equal(defaultPatch.homeRipple, true);
  assert.equal(defaultPatch.convRipple, 'off');
  assert.equal(defaultPatch.darkAura, 'balanced');
  assert.equal(defaultPatch.darkAuraStyle, 'prism');
  assert.equal(defaultPatch.autoArchiveOnExit, false);
  assert.equal(defaultPatch.effortMemory, 'on');
  assert.equal(defaultPatch.periodicModelPicker, 'on');
  assert.equal(defaultPatch.sidebarNavFold, 'off');
  assert.equal(defaultPatch.scrollBottomMotion, 'smooth');

  // convRipple & darkAura/darkAuraStyle 8-language i18n coverage (0 CJK in en/es/fr/de, 0 runtime slice leak)
  const CJK_RE_CR = /[\u3000-\u30ff\u3400-\u9fff\uac00-\ud7af\uff00-\uffef]/;
  const runtimeKeySetCr = new Set(i18nLocales.RUNTIME_UI_KEYS);
  const convI18nKeys = [
    'setConvRippleTitle', 'setConvRippleDesc', 'optConvRippleOff', 'optConvRippleSubtle', 'optConvRippleMedium', 'optConvRippleFull',
    'setDarkAuraStyleLabel', 'setDarkAuraStyleDesc', 'optDarkAuraPrism', 'optDarkAuraNeon',
    'setDarkAuraLabel', 'setDarkAuraDesc', 'darkAuraHintLight', 'optDarkAuraSubtle', 'optDarkAuraBalanced', 'optDarkAuraVivid',
  ];
  for (const ck of convI18nKeys) {
    assert.equal(runtimeKeySetCr.has(ck), false, `${ck} must NOT be in RUNTIME_UI_KEYS`);
  }
  for (const lang of ['zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'es', 'fr', 'de']) {
    const ui = i18nLocales.getUiStrings(lang);
    for (const ck of convI18nKeys) {
      assert.ok(typeof ui[ck] === 'string' && ui[ck].trim().length > 0, `Missing ${ck} for ${lang}`);
      if (['en', 'es', 'fr', 'de'].includes(lang)) {
        assert.equal(CJK_RE_CR.test(ui[ck]), false, `CJK leak in ${ck} (${lang})`);
      }
    }
  }
  assert.equal(SCENE_PRESETS.ultra.homeRipple, true);
  assert.equal(SCENE_PRESETS.focus.convRipple, 'off');
  assert.equal(SCENE_PRESETS.eco.convRipple, 'off');
  const expConvFull = buildSanitizedConfigExport({ convRipple: 'full' }, null, '1.0.8');
  assert.equal(expConvFull.settings.convRipple, 'full');
  const expConvLegacy = buildSanitizedConfigExport({ convRipple: true }, null, '1.0.8');
  assert.equal(expConvLegacy.settings.convRipple, 'medium');
  const impConvSubtle = validateImportedConfigJson(JSON.stringify({ settings: { convRipple: 'subtle' } }));
  assert.equal(impConvSubtle.ok, true);
  assert.equal(impConvSubtle.settings.convRipple, 'subtle');
  const impConvLegacy = validateImportedConfigJson(JSON.stringify({ settings: { convRipple: true } }));
  assert.equal(impConvLegacy.ok, true);
  assert.equal(impConvLegacy.settings.convRipple, 'medium');
});

test('UX-1 / OP-5 / UX-4 / UX-9 regressions: async thought config export, tech->technical normalization, preset sidebarCompact reset, lightPreset context hints, and Effort Slider off/i18n', () => {
  const { SCENE_PRESETS, buildSanitizedConfigExport, validateImportedConfigJson } = settingsPanel;

  // 1. SCENE_PRESETS ultra & eco must explicitly reset sidebarCompact: false when leaving focus
  assert.equal(SCENE_PRESETS.focus.sidebarCompact, true);
  assert.equal(SCENE_PRESETS.ultra.sidebarCompact, false);
  assert.equal(SCENE_PRESETS.eco.sidebarCompact, false);

  // 2. buildSanitizedConfigExport & validateImportedConfigJson normalize 'tech' -> 'technical', accept 'technical', and ignore unawaited Promises
  const fromPromise = buildSanitizedConfigExport({ palette: 'obsidian' }, Promise.resolve({ stylePreset: 'technical' }), '1.0.1');
  assert.equal(fromPromise.thought, undefined, 'Must never serialize an unawaited Promise into fake empty thought block');

  const exportedTech = buildSanitizedConfigExport({ palette: 'obsidian' }, { stylePreset: 'technical', customPrompt: 'Keep identifiers' }, '1.0.1');
  assert.equal(exportedTech.thought.stylePreset, 'technical');

  const exportedLegacy = buildSanitizedConfigExport({ palette: 'obsidian' }, { stylePreset: 'tech' }, '1.0.1');
  assert.equal(exportedLegacy.thought.stylePreset, 'technical');

  const importedTech = validateImportedConfigJson(JSON.stringify({ thought: { stylePreset: 'technical' } }));
  assert.equal(importedTech.ok, true);
  assert.equal(importedTech.thought.stylePreset, 'technical');

  const importedLegacy = validateImportedConfigJson(JSON.stringify({ thought: { stylePreset: 'tech' } }));
  assert.equal(importedLegacy.ok, true);
  assert.equal(importedLegacy.thought.stylePreset, 'technical');

  // 3. 8-language lightPreset context hints, optFontSfmono, and swarmSplitSub
  for (const lang of ['zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'es', 'fr', 'de']) {
    const ui = i18nLocales.getUiStrings(lang);
    assert.ok(ui.lightPresetHintDark && ui.lightPresetHintDark.length > 4);
    assert.ok(ui.lightPresetHintWarm && ui.lightPresetHintWarm.length > 4);
    assert.ok(ui.lightPresetHintHost && ui.lightPresetHintHost.length > 4);
    assert.equal(ui.optFontSfmono, 'SF Mono / Consolas');
    assert.equal(typeof ui.swarmSplitSub, 'function');
    const splitStr = ui.swarmSplitSub(62, 38);
    assert.ok(/\b62\s*%/.test(splitStr) && /\b38\s*%/.test(splitStr), `Unexpected swarmSplitSub(${lang}): ${splitStr}`);
  }
});

test('PR #50 & PR #41/#49: DEFAULT_CONFIG & config.example.json default to auto, 8-lang runtime resolves navigator.languages[0] with en fallback, and 6 new home keys registered cleanly', () => {
  assert.equal(cdp.DEFAULT_CONFIG.language, 'en');
  assert.equal(cdp.DEFAULT_CONFIG.lang, 'en');
  const exCfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.example.json'), 'utf8'));
  assert.equal(exCfg.language, 'en');
  assert.equal(exCfg.lang, 'en');

  // PR #41 & PR #49: 6 new runtime UI keys present in i18n-locales (8-lang, 0 CJK in en/es/fr/de) AND in Channel 1 __uiSlice
  const homeKeys = [
    'homeScopeAll',
    'homeScopeActive',
    'homeScopeActiveCount',
    'homeScopeArchivedCount',
    'homeLocalOnlyTag',
    'homeLocalScopeNote',
  ];
  const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/;
  for (const lang of ['zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'es', 'fr', 'de']) {
    const ui = i18nLocales.getUiStrings(lang);
    const slice = i18nLocales.getRuntimeUiSlice(lang);
    for (const k of homeKeys) {
      assert.ok(typeof ui[k] === 'string' && ui[k].trim().length > 0, `Missing ${k} in UI_TABLE for ${lang}`);
      assert.equal(slice.strings[k], ui[k], `Missing ${k} in getRuntimeUiSlice(${lang})`);
      if (lang === 'en' || lang === 'es' || lang === 'fr' || lang === 'de') {
        assert.equal(CJK_RE.test(ui[k]), false, `CJK leak in ${k} (${lang}): ${ui[k]}`);
      }
    }
  }
  const ch1Expr = cdp.buildInjectExpression(cdp.DEFAULT_CONFIG);
  assert.ok(Buffer.byteLength(ch1Expr, 'utf8') < 685000, 'Channel 1 bundle must stay < 685,000 B');
  for (const k of homeKeys) {
    assert.ok(ch1Expr.includes(`"${k}"`), `Channel 1 bootCfg __uiSlice must include ${k}`);
  }

  // Run Channel 1 + Channel 9 settings in VM to verify auto language resolution across 8 languages
  const settingsCh9Expr = cdp.buildSettingsChannelExpression();
  const runRuntimeWithNav = (cfgOverride, navObj) => {
    const createDom = () => {
      const attrs = new WeakMap();
      const matchSimple = (el, s) => {
        if (!el || el.nodeType !== 1) return false;
        let rest = s.trim();
        const tm = /^[a-zA-Z0-9-]+/.exec(rest);
        if (tm) {
          if (el.tagName !== tm[0].toUpperCase()) return false;
          rest = rest.slice(tm[0].length);
        }
        while (rest) {
          if (rest[0] === '.') {
            const m = /^\.([a-zA-Z0-9_-]+)/.exec(rest);
            if (!m || !el.classList.contains(m[1])) return false;
            rest = rest.slice(m[0].length);
          } else if (rest[0] === '#') {
            const m = /^#([a-zA-Z0-9_-]+)/.exec(rest);
            if (!m || el.id !== m[1]) return false;
            rest = rest.slice(m[0].length);
          } else if (rest[0] === '[') {
            const m = /^\[([a-zA-Z0-9_-]+)(?:=["']?([^\]"']*)["']?)?\]/.exec(rest);
            if (!m) return false;
            const cur = el.getAttribute(m[1]);
            if (m[2] === undefined ? !el.hasAttribute(m[1]) : cur !== m[2]) return false;
            rest = rest.slice(m[0].length);
          } else return false;
        }
        return true;
      };
      const matchSel = (el, sel) =>
        String(sel || '').split(',').some((part) => {
          const tokens = part.trim().split(/\s+/).filter(Boolean);
          if (!tokens.length || !matchSimple(el, tokens[tokens.length - 1])) return false;
          let cur = el.parentElement;
          for (let i = tokens.length - 2; i >= 0; i--) {
            while (cur && !matchSimple(cur, tokens[i])) cur = cur.parentElement;
            if (!cur) return false;
            cur = cur.parentElement;
          }
          return true;
        });
      class N {
        constructor(t, tag = '') {
          this.nodeType = t;
          this.tagName = tag.toUpperCase();
          this.childNodes = [];
          this.parentNode = null;
          this.dataset = {};
          this.clientWidth = 900;
          this.clientHeight = 700;
          this.width = 0;
          this.height = 0;
          this.style = { _m: new Map(), setProperty: (k, v) => this.style._m.set(k, String(v)), getPropertyValue: (k) => this.style._m.get(k) || '', removeProperty: (k) => this.style._m.delete(k) };
          const cs = new Set();
          this.classList = {
            add: (...a) => a.forEach((c) => { if (c) cs.add(c); attrs.get(this).set('class', [...cs].join(' ')); }),
            remove: (...a) => a.forEach((c) => { cs.delete(c); attrs.get(this).set('class', [...cs].join(' ')); }),
            contains: (c) => cs.has(c),
            toggle: (c, f) => { const on = f === undefined ? !cs.has(c) : Boolean(f); if (on) cs.add(c); else cs.delete(c); attrs.get(this).set('class', [...cs].join(' ')); return on; },
          };
          this._cs = cs;
          attrs.set(this, new Map());
        }
        get parentElement() { return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null; }
        get children() { return this.childNodes.filter((c) => c.nodeType === 1); }
        get firstChild() { return this.childNodes[0] || null; }
        get firstElementChild() { return this.children[0] || null; }
        get isConnected() { let c = this; while (c) { if (c === doc.documentElement) return true; c = c.parentNode; } return false; }
        get className() { return this.getAttribute('class') || ''; }
        set className(v) { this._cs.clear(); String(v || '').split(/\s+/).filter(Boolean).forEach((c) => this._cs.add(c)); attrs.get(this).set('class', [...this._cs].join(' ')); }
        get id() { return this.getAttribute('id') || ''; }
        set id(v) { this.setAttribute('id', v); }
        get textContent() { return this.nodeType === 3 ? this.nodeValue || '' : this.childNodes.map((c) => c.textContent).join(''); }
        set textContent(v) { if (this.nodeType === 3) { this.nodeValue = String(v ?? ''); return; } this.childNodes = []; if (v) this.appendChild(doc.createTextNode(v)); }
        setAttribute(k, v) { attrs.get(this).set(k, String(v)); if (k === 'class') this.className = v; }
        getAttribute(k) { return attrs.get(this).has(k) ? attrs.get(this).get(k) : null; }
        hasAttribute(k) { return attrs.get(this).has(k); }
        removeAttribute(k) { attrs.get(this).delete(k); }
        appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.childNodes.push(c); return c; }
        insertBefore(c, r) { if (!r) return this.appendChild(c); if (c.parentNode) c.parentNode.removeChild(c); const i = this.childNodes.indexOf(r); c.parentNode = this; if (i < 0) this.childNodes.push(c); else this.childNodes.splice(i, 0, c); return c; }
        removeChild(c) { const i = this.childNodes.indexOf(c); if (i >= 0) { this.childNodes.splice(i, 1); c.parentNode = null; } return c; }
        remove() { if (this.parentNode) this.parentNode.removeChild(this); }
        contains(o) { let c = o; while (c) { if (c === this) return true; c = c.parentNode; } return false; }
        addEventListener() {}
        removeEventListener() {}
        matches(s) { return matchSel(this, s); }
        closest(s) { let c = this; while (c && c.nodeType === 1) { if (matchSel(c, s)) return c; c = c.parentElement; } return null; }
        querySelectorAll(s) { const out = []; const w = (n) => { for (const c of n.childNodes) if (c.nodeType === 1) { if (matchSel(c, s)) out.push(c); w(c); } }; w(this); return out; }
        querySelector(s) { return this.querySelectorAll(s)[0] || null; }
        getBoundingClientRect() { return { left: 0, top: 0, width: 400, height: 80, right: 400, bottom: 80 }; }
        getContext() { return null; }
      }
      const doc = {
        nodeType: 9,
        readyState: 'complete',
        hidden: false,
        createElement: (t) => new N(1, t),
        createElementNS: (_ns, t) => new N(1, t),
        createTextNode: (t) => { const n = new N(3); n.nodeValue = String(t ?? ''); return n; },
        getElementById: (id) => doc.documentElement.querySelector('#' + id),
        querySelector: (s) => doc.documentElement.querySelector(s),
        querySelectorAll: (s) => doc.documentElement.querySelectorAll(s),
        addEventListener() {},
        removeEventListener() {},
      };
      doc.documentElement = doc.createElement('html');
      doc.head = doc.createElement('head');
      doc.body = doc.createElement('body');
      doc.documentElement.appendChild(doc.head);
      doc.documentElement.appendChild(doc.body);
      return doc;
    };

    const doc = createDom();
    const html = doc.documentElement;
    const home = doc.createElement('div');
    home.className = 'agy-home';
    const greeting = doc.createElement('div');
    greeting.setAttribute('data-testid', 'home-greeting');
    const h1 = doc.createElement('h1');
    h1.textContent = 'Welcome back';
    greeting.appendChild(h1);
    home.appendChild(greeting);
    const dlg = doc.createElement('div');
    dlg.setAttribute('role', 'dialog');
    const pane = doc.createElement('div');
    pane.className = 'p-6';
    const h2 = doc.createElement('h2');
    h2.textContent = 'Appearance';
    const anchor = doc.createElement('div');
    anchor.className = 'space-y-2';
    pane.appendChild(h2);
    pane.appendChild(anchor);
    dlg.appendChild(pane);
    doc.body.appendChild(home);
    doc.body.appendChild(dlg);

    const timers = new Set();
    const store = new Map();
    const sandbox = {
      window: null,
      globalThis: null,
      document: doc,
      navigator: navObj,
      location: { pathname: '/' },
      innerWidth: 1200,
      innerHeight: 800,
      devicePixelRatio: 1,
      addEventListener() {},
      removeEventListener() {},
      localStorage: {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
      },
      getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1', getPropertyValue: () => '' }),
      matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
      MutationObserver: class { observe() {} disconnect() {} takeRecords() { return []; } },
      ResizeObserver: class { observe() {} disconnect() {} },
      HTMLElement: Object,
      Element: Object,
      Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 },
      requestAnimationFrame: (fn) => { const id = setTimeout(() => fn(Date.now()), 4); timers.add(id); return id; },
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
    doc.defaultView = sandbox;

    const expr = cdp.buildInjectExpression({ ...cdp.DEFAULT_CONFIG, ...(cfgOverride || {}) });
    const res = vm.runInNewContext(expr, sandbox);
    assert.equal(res.status, 'ok');
    vm.runInNewContext(cdp.buildHomeStudioChannelExpression({ ...cdp.DEFAULT_CONFIG, ...(cfgOverride || {}) }), sandbox);
    vm.runInNewContext(settingsCh9Expr, sandbox);
    const sec = doc.getElementById('ag-cs-settings-sec');
    sec?.__ensureFoldBody?.();
    const langAttr = html.getAttribute('data-ag-cs-lang');
    const hasCjkAttr = html.hasAttribute('data-ag-cs-cjk');
    const langTitle = sec?.querySelector('[data-ag-cs-row="language"] [data-k="t"]')?.textContent || '';
    const overviewTab = home.querySelector('.ag-cs-home-tab[data-tab="overview"]')?.textContent || '';
    const greetingText = h1.textContent;
    sandbox.__agPrism?.destroy?.();
    for (const id of timers) clearTimeout(id);
    return { langAttr, hasCjkAttr, langTitle, overviewTab, greetingText };
  };

  // English Windows (en-US primary, zh-Hans-CN secondary) -> English UI
  const enRes = runRuntimeWithNav({ language: 'auto', lang: 'auto' }, { language: 'en-US', languages: ['en-US', 'zh-Hans-CN'] });
  assert.equal(enRes.langAttr, 'en');
  assert.equal(enRes.hasCjkAttr, false);
  assert.equal(enRes.langTitle, 'UI Language');
  assert.equal(enRes.overviewTab, 'Overview');
  assert.equal(enRes.greetingText, "What's up next?");

  // Unsupported locale (pt-BR) -> falls back to English, NOT zh-CN
  const ptRes = runRuntimeWithNav({ language: 'auto', lang: 'auto' }, { language: 'pt-BR' });
  assert.equal(ptRes.langAttr, 'en');
  assert.equal(ptRes.hasCjkAttr, false);
  assert.equal(ptRes.langTitle, 'UI Language');

  // Supported 8 locales (fr-FR -> fr, zh-HK -> zh-TW, zh-CN -> zh-CN, ja-JP -> ja)
  assert.equal(runRuntimeWithNav({ language: 'auto', lang: 'auto' }, { language: 'fr-FR' }).langAttr, 'fr');
  assert.equal(runRuntimeWithNav({ language: 'auto', lang: 'auto' }, { language: 'zh-CN' }).langAttr, 'zh-CN');
  assert.equal(runRuntimeWithNav({ language: 'auto', lang: 'auto' }, { language: 'ja-JP' }).langAttr, 'ja');
  assert.equal(runRuntimeWithNav({ language: 'auto', lang: 'auto' }, { language: 'zh-HK' }).langAttr, 'zh-TW');

  // Explicit user overrides ignore navigator.language
  assert.equal(runRuntimeWithNav({ language: 'zh-CN', lang: 'zh-CN' }, { language: 'en-US' }).langAttr, 'zh-CN');
  assert.equal(runRuntimeWithNav({ language: 'en', lang: 'en' }, { language: 'zh-CN' }).langAttr, 'en');

  // settingsPanel.validateImportedConfigJson({ language: 'auto' }) prioritizes navigator.languages[0] & falls back to 'en'
  const origNavDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  try {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { language: 'zh-CN', languages: ['en-US', 'zh-CN'] } });
    assert.equal(settingsPanel.validateImportedConfigJson('{"language":"auto"}').settings.language, 'en');
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { language: 'pt-BR' } });
    assert.equal(settingsPanel.validateImportedConfigJson('{"language":"auto"}').settings.language, 'en');
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { language: 'fr-FR' } });
    assert.equal(settingsPanel.validateImportedConfigJson('{"language":"auto"}').settings.language, 'fr');
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { language: 'zh-CN' } });
    assert.equal(settingsPanel.validateImportedConfigJson('{"language":"auto"}').settings.language, 'zh-CN');
    assert.equal(settingsPanel.buildSanitizedConfigExport({ language: 'auto' }).settings.language, 'auto');
    assert.equal(settingsPanel.buildSanitizedConfigExport({ language: 'AUTO' }).settings.language, 'auto');
  } finally {
    if (origNavDesc) Object.defineProperty(globalThis, 'navigator', origNavDesc);
    else delete globalThis.navigator;
  }

  // pulse inline-fallback: prioritizes navigator.languages[0] & resets expLang when switching back to 'auto'
  const fbWin = {
    navigator: { language: 'zh-CN', languages: ['en-US', 'zh-CN'] },
    location: { pathname: '/' },
    document: { documentElement: { getAttribute: () => null }, querySelector: () => null, querySelectorAll: () => [] },
  };
  const fbCtrl = pulseInlineFallback.createTelemetryController({ window: fbWin, document: fbWin.document });
  fbCtrl.sync({ language: 'ja', telemetryModule: 'auto' });
  fbCtrl.sync({ language: 'auto', telemetryModule: 'auto' });
  assert.ok(fbWin.agPulseHost && typeof fbWin.agPulseHost.getPreferences === 'function');
  return fbWin.agPulseHost.getPreferences().then((prefs) => {
    assert.equal(prefs.language, 'en');
    fbCtrl.destroy();
  });
});

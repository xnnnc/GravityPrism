import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const i18nCore = require('../i18n-core.js');
const i18nLocales = require('../i18n-locales.js');
const settingsPanel = require('../settings-panel.js');

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

test('normalizeLanguage, LANG_OPTIONS, and UI_TABLE support all 5 required languages', () => {
  assert.deepEqual(
    i18nCore.LANG_OPTIONS.map((o) => [o.id, o.label]),
    [
      ['zh-CN', '简体中文'],
      ['zh-TW', '繁體中文'],
      ['yue', '粵語'],
      ['en', 'English'],
      ['ja', '日本語'],
    ]
  );

  assert.equal(i18nCore.normalizeLanguage('zh-CN'), 'zh-CN');
  assert.equal(i18nCore.normalizeLanguage('zh_TW'), 'zh-TW');
  assert.equal(i18nCore.normalizeLanguage('zh-Hant'), 'zh-TW');
  assert.equal(i18nCore.normalizeLanguage('zh-HK'), 'yue');
  assert.equal(i18nCore.normalizeLanguage('cantonese'), 'yue');
  assert.equal(i18nCore.normalizeLanguage('en-US'), 'en');
  assert.equal(i18nCore.normalizeLanguage('ja-JP'), 'ja');
  assert.equal(i18nCore.normalizeLanguage(true), 'zh-CN');
  assert.equal(i18nCore.normalizeLanguage(false), 'en');
  assert.equal(i18nCore.isCjkLanguage('en'), false);
  assert.equal(i18nCore.isCjkLanguage('ja'), true);

  for (const lang of ['zh-CN', 'zh-TW', 'yue', 'en', 'ja']) {
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

test('v1.0.1 i18n keys cover all 5 languages for scene presets, 6 new config keys, sub-tabs, backup/reset & quotas', () => {
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
  for (const lang of ['zh-CN', 'zh-TW', 'yue', 'en', 'ja']) {
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
  // Verify all 35 global config keys (including effortSliderStyle, effortMemory, contextMenu, sidebarNavFold, scrollBottomMotion, hostLocalization, omniModule, linkTarget, sidebarStudio, autoUpdate & updateChannel) match exact contract
  const { PRISM_SETTINGS_SCHEMA, SCENE_PRESETS, buildSanitizedConfigExport, validateImportedConfigJson, getDefaultSettingsPatch } =
    settingsPanel;
  assert.equal(Object.keys(PRISM_SETTINGS_SCHEMA).length, 35);
  assert.deepEqual(PRISM_SETTINGS_SCHEMA.effortSliderStyle.allowed, ['classic', 'prism', 'ferrofluid', 'orbital', 'oscilloscope', 'plasma']);
  assert.equal(PRISM_SETTINGS_SCHEMA.effortSliderStyle.default, 'classic');
  assert.deepEqual(PRISM_SETTINGS_SCHEMA.effortMemory.allowed, ['on', 'off']);
  assert.equal(PRISM_SETTINGS_SCHEMA.effortMemory.default, 'on');
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

  // Boolean alias support for omniModule & sidebarNavFold (true -> 'on', false -> 'off') + legacy mascot:'dual' & language:'auto'
  const boolAlias = validateImportedConfigJson(JSON.stringify({ omniModule: false, sidebarNavFold: true, linkTarget: 'builtin', mascot: 'dual', language: 'auto' }));
  assert.equal(boolAlias.ok, true);
  assert.equal(boolAlias.settings.omniModule, 'off');
  assert.equal(boolAlias.settings.sidebarNavFold, 'on');
  assert.equal(boolAlias.settings.linkTarget, 'builtin');
  assert.equal(boolAlias.settings.mascot, 'crab');
  assert.ok(['zh-CN', 'zh-TW', 'yue', 'en', 'ja'].includes(boolAlias.settings.language));

  assert.equal(i18nLocales.getUiStrings('zh-CN').presetUltra, '完整光效');
  assert.equal(i18nLocales.getUiStrings('en').presetUltra, 'Full Visuals');

  assert.equal(validateImportedConfigJson('not-json').ok, false);
  assert.equal(validateImportedConfigJson('{"unknownOnly": 1}').ok, false);
  const defaultPatch = getDefaultSettingsPatch();
  assert.equal(Object.keys(defaultPatch).length, 35);
  assert.equal(defaultPatch.effortSliderStyle, 'classic');
  assert.equal(defaultPatch.effortMemory, 'on');
  assert.equal(defaultPatch.sidebarNavFold, 'off');
  assert.equal(defaultPatch.scrollBottomMotion, 'smooth');
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

  // 3. 5-language lightPreset context hints, optFontSfmono, and swarmSplitSub
  for (const lang of ['zh-CN', 'zh-TW', 'yue', 'en', 'ja']) {
    const ui = i18nLocales.getUiStrings(lang);
    assert.ok(ui.lightPresetHintDark && ui.lightPresetHintDark.length > 4);
    assert.ok(ui.lightPresetHintWarm && ui.lightPresetHintWarm.length > 4);
    assert.ok(ui.lightPresetHintHost && ui.lightPresetHintHost.length > 4);
    assert.equal(ui.optFontSfmono, 'SF Mono / Consolas');
    assert.equal(typeof ui.swarmSplitSub, 'function');
    assert.ok(ui.swarmSplitSub(62, 38).includes('62%') && ui.swarmSplitSub(62, 38).includes('38%'));
  }
});

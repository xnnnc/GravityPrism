import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const i18nCore = require('../i18n-core.js');
const i18nLocales = require('../i18n-locales.js');
const settingsPanel = require('../settings-panel.js');

function createMockDomEnv(initialTheme = 'dark') {
  const storeMap = new Map([['ag-prism:settings-open', '1']]);
  const storage = {
    getItem: (k) => (storeMap.has(k) ? storeMap.get(k) : null),
    setItem: (k, v) => storeMap.set(k, String(v)),
    removeItem: (k) => storeMap.delete(k),
  };

  function matchesSimple(el, rawSel) {
    const sel = rawSel.trim();
    if (!sel) return false;
    if (sel.startsWith('#')) return el.id === sel.slice(1);
    let rest = sel;
    let tagPart = '';
    const tagMatch = rest.match(/^[a-zA-Z0-9-]+/);
    if (tagMatch) {
      tagPart = tagMatch[0].toUpperCase();
      rest = rest.slice(tagMatch[0].length);
    }
    if (tagPart && el.tagName !== tagPart) return false;
    const clsMatches = [...rest.matchAll(/\.([a-zA-Z0-9_-]+)/g)];
    for (const m of clsMatches) {
      if (!el.classList.contains(m[1])) return false;
    }
    const attrMatches = [...rest.matchAll(/\[([^\]=]+)(?:="([^"]*)")?\]/g)];
    for (const m of attrMatches) {
      const k = m[1];
      const v = m[2];
      if (!el._attrs.has(k)) return false;
      if (v !== undefined && el._attrs.get(k) !== v) return false;
    }
    return true;
  }

  function matchesChain(el, selectorList) {
    const groups = selectorList.split(',').map((s) => s.trim()).filter(Boolean);
    return groups.some((chain) => {
      const parts = chain.split(/\s+/);
      let cur = el;
      for (let i = parts.length - 1; i >= 0; i--) {
        if (!cur) return false;
        if (i === parts.length - 1) {
          if (!matchesSimple(cur, parts[i])) return false;
          cur = cur.parentElement;
        } else {
          while (cur && !matchesSimple(cur, parts[i])) cur = cur.parentElement;
          if (!cur) return false;
          cur = cur.parentElement;
        }
      }
      return true;
    });
  }

  function makeElement(tag, ownerDoc) {
    const clsSet = new Set();
    const attrs = new Map();
    const listeners = new Map();
    const el = {
      nodeType: 1,
      tagName: String(tag).toUpperCase(),
      ownerDocument: ownerDoc,
      id: '',
      _className: '',
      _text: '',
      innerHTML: '',
      hidden: false,
      disabled: false,
      value: '',
      files: null,
      style: {},
      children: [],
      parentElement: null,
      parentNode: null,
      _attrs: attrs,
      get isConnected() {
        let p = el;
        while (p) {
          if (p === ownerDoc.documentElement) return true;
          p = p.parentElement;
        }
        return false;
      },
      get className() {
        return el._className;
      },
      set className(v) {
        el._className = String(v || '');
        clsSet.clear();
        for (const c of el._className.split(/\s+/).filter(Boolean)) clsSet.add(c);
      },
      get textContent() {
        if (el.children.length === 0) return el._text;
        return el._text + el.children.map((c) => c.textContent).join('');
      },
      set textContent(v) {
        el._text = String(v ?? '');
        el.children.length = 0;
      },
      classList: {
        add: (...cs) => {
          cs.forEach((c) => c && clsSet.add(c));
          el._className = [...clsSet].join(' ');
        },
        remove: (...cs) => {
          cs.forEach((c) => clsSet.delete(c));
          el._className = [...clsSet].join(' ');
        },
        contains: (c) => clsSet.has(c),
        toggle: (c, force) => {
          const on = force === undefined ? !clsSet.has(c) : Boolean(force);
          if (on) clsSet.add(c);
          else clsSet.delete(c);
          el._className = [...clsSet].join(' ');
          return on;
        },
      },
      setAttribute(k, v) {
        const s = String(v);
        attrs.set(k, s);
        if (k === 'id') el.id = s;
        if (k === 'hidden') el.hidden = true;
      },
      getAttribute(k) {
        return attrs.has(k) ? attrs.get(k) : null;
      },
      hasAttribute(k) {
        return attrs.has(k);
      },
      removeAttribute(k) {
        attrs.delete(k);
        if (k === 'hidden') el.hidden = false;
      },
      toggleAttribute(k, force) {
        const on = force === undefined ? !attrs.has(k) : Boolean(force);
        if (on) attrs.set(k, '');
        else attrs.delete(k);
        return on;
      },
      appendChild(child) {
        if (!child) return child;
        if (child.parentElement) child.remove();
        child.parentElement = el;
        child.parentNode = el;
        el.children.push(child);
        return child;
      },
      removeChild(child) {
        const idx = el.children.indexOf(child);
        if (idx >= 0) {
          el.children.splice(idx, 1);
          child.parentElement = null;
          child.parentNode = null;
        }
        return child;
      },
      remove() {
        if (el.parentElement) el.parentElement.removeChild(el);
      },
      closest(sel) {
        let cur = el;
        while (cur) {
          if (matchesChain(cur, sel)) return cur;
          cur = cur.parentElement;
        }
        return null;
      },
      querySelectorAll(sel) {
        const out = [];
        const walk = (node) => {
          for (const c of node.children) {
            if (matchesChain(c, sel)) out.push(c);
            walk(c);
          }
        };
        walk(el);
        return out;
      },
      querySelector(sel) {
        return el.querySelectorAll(sel)[0] || null;
      },
      addEventListener(type, fn) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(fn);
      },
      dispatchEvent(ev) {
        const evt = ev || { type: 'click' };
        evt.target = evt.target || el;
        evt.stopPropagation = evt.stopPropagation || (() => {});
        evt.preventDefault = evt.preventDefault || (() => {});
        for (const fn of listeners.get(evt.type) || []) {
          fn(evt);
        }
      },
      click() {
        el.dispatchEvent({ type: 'click' });
      },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 60, height: 28 }),
    };
    return el;
  }

  const doc = {
    documentElement: null,
    head: null,
    body: null,
    createElement: (tag) => makeElement(tag, doc),
    getElementById(id) {
      return doc.documentElement.querySelector('#' + id);
    },
    querySelectorAll(sel) {
      return doc.documentElement.querySelectorAll(sel);
    },
    querySelector(sel) {
      return doc.documentElement.querySelector(sel);
    },
  };
  doc.documentElement = makeElement('html', doc);
  doc.documentElement.setAttribute('data-ag-cs-theme', initialTheme);
  doc.head = makeElement('head', doc);
  doc.body = makeElement('body', doc);
  doc.documentElement.appendChild(doc.head);
  doc.documentElement.appendChild(doc.body);

  // Build host Appearance dialog structure expected by mountOrSyncSettingsSection
  const dialog = makeElement('div', doc);
  dialog.setAttribute('role', 'dialog');
  const panel = makeElement('div', doc);
  panel.className = 'p-6';
  const h2 = makeElement('h2', doc);
  h2.textContent = 'Appearance';
  const hostSpace = makeElement('div', doc);
  hostSpace.className = 'space-y-2';
  panel.appendChild(h2);
  panel.appendChild(hostSpace);
  dialog.appendChild(panel);
  doc.body.appendChild(dialog);

  const clipboardWrites = [];
  const win = {
    document: doc,
    localStorage: storage,
    navigator: {
      clipboard: {
        writeText: (txt) => {
          clipboardWrites.push(String(txt));
          return Promise.resolve();
        },
      },
    },
  };

  return { doc, win, storage, clipboardWrites };
}

test('mountOrSyncSettingsSection mounts all 27 settings (including omniModule, linkTarget & sidebarStudio), syncs presets, async export, cross-language import/reset toast, and 5-language UI', async () => {
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  const prevStorage = globalThis.localStorage;
  const prevBlob = globalThis.Blob;

  const { doc, win, storage, clipboardWrites } = createMockDomEnv('dark');
  globalThis.document = doc;
  globalThis.window = win;
  globalThis.localStorage = storage;
  // Force clipboard fallback in exportBtn so test can inspect exported JSON string directly
  delete globalThis.Blob;

  const state = settingsPanel.getDefaultSettingsPatch();
  let viewSwitchedCalls = [];
  let modeSwitchedCalls = [];
  let reloadConfigCalls = 0;
  let savedThoughtPayloads = [];
  const mockSkPrefix = 'sk' + '-';

  globalThis.__agPrismThoughtSettingsUi = {
    createThoughtAiConfigBox({ mkEl, getMode }) {
      const box = mkEl('div', 'mock-thought-ai-box');
      box.setAttribute('data-testid', 'prism-thought-ai-config');
      box.hidden = getMode() !== 'ai';
      return {
        box,
        onViewSwitched: (v) => viewSwitchedCalls.push(v),
        onModeSwitched: (m) => {
          modeSwitchedCalls.push(m);
          box.hidden = m !== 'ai';
        },
        reloadConfig: () => {
          reloadConfigCalls++;
        },
        ensureLoaded: () => {},
      };
    },
  };

  win.__agPrismThought = {
    getConfig: () =>
      new Promise((resolve) =>
        setTimeout(
          () =>
            resolve({
              ok: true,
              stylePreset: 'tech',
              customPrompt: 'Preserve file links without ' + mockSkPrefix + 'SECRETKEY1234567890',
              activeProfileId: 'p-local',
              profiles: [{ id: 'p-local', name: 'Ollama', baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen2.5', apiKey: mockSkPrefix + 'PRIVATE999888777666' }],
            }),
          5
        )
      ),
    saveConfig: (payload) => {
      savedThoughtPayloads.push(payload);
      return Promise.resolve({ ok: true });
    },
  };

  const remountOrSync = () => {
    settingsPanel.mountOrSyncSettingsSection({
      version: '1.0.1',
      getLang: () => state.language,
      uiText: (l) => i18nLocales.getUiStrings(l),
      isZh: () => state.language !== 'en' && state.language !== 'ja',
      i18nCore,
      formatSettingsSummary: (l, u) => `${l}:${state.palette}:${u.optLinkBuiltin}`,
      resolveSettingRowActiveValue: (k) => state[k],
      isSettingButtonMatch: (k, valJson, cur) => JSON.parse(valJson) === cur,
      saveSetting: (k, v) => {
        const prevLang = state.language;
        state[k] = v;
        if (k === 'language' && v !== prevLang) remountOrSync();
      },
      saveSettingsBatch: (patch) => {
        const prevLang = state.language;
        Object.assign(state, patch);
        if (patch.language && patch.language !== prevLang) remountOrSync();
      },
      getThoughtTranslateMode: () => state.thoughtTranslate,
      handledGroupClicks: new WeakSet(),
      runSettingsGroupGlide: () => {},
      runGuardedMut: (fn) => fn(),
    });
  };

  try {
    remountOrSync();
    let sec = doc.getElementById(settingsPanel.SETTINGS_SEC_ID);
    assert.ok(sec, 'Settings section must mount into Appearance dialog');

    // 1. Verify all 33 setting rows mount cleanly, external zh-plugin no-translate markers are stamped, and updateChannel mounts in About
    assert.equal(sec.getAttribute('translate'), 'no');
    assert.equal(sec.getAttribute('data-no-translate'), 'true');
    assert.equal(sec.getAttribute('data-ag-localization-skip'), 'true');
    assert.equal(sec.getAttribute('data-agy-no-translate'), 'true');
    assert.equal(sec.getAttribute('data-antigravity-zh-skip'), '1');
    const allRows = sec.querySelectorAll('[data-ag-cs-row]');
    assert.equal(allRows.length, 35, 'Must render all 35 setting rows');
    const interactionGrp = sec.querySelector('[data-ag-cs-group="interaction"]');
    const interactionRowKeys = interactionGrp.querySelectorAll('[data-ag-cs-row]').map((r) => r.getAttribute('data-ag-cs-row'));
    assert.ok(interactionRowKeys.includes('sidebarNavFold'), 'interaction group must include sidebarNavFold');
    const modulesGrp = sec.querySelector('[data-ag-cs-group="modules"]');
    const moduleRowKeys = modulesGrp.querySelectorAll('[data-ag-cs-row]').map((r) => r.getAttribute('data-ag-cs-row'));
    assert.deepEqual(moduleRowKeys, ['telemetryModule', 'effortSliderModule', 'effortSliderStyle', 'effortMemory', 'omniModule', 'linkTarget']);
    const betaGrp = sec.querySelector('[data-ag-cs-group="beta"]');
    assert.ok(betaGrp, 'Beta features group must mount');
    const betaRowKeys = betaGrp.querySelectorAll('[data-ag-cs-row]').map((r) => r.getAttribute('data-ag-cs-row'));
    assert.deepEqual(betaRowKeys, ['sidebarStudio']);

    // 2. Toggle omniModule='off' -> linkTarget row dims to 0.55; toggle linkTarget='external'; toggle omniModule='on' -> restores full opacity; toggle sidebarStudio
    const findSegBtn = (key, val) =>
      sec.querySelectorAll(`button[data-ag-cs-key="${key}"]`).find((b) => b.getAttribute('data-ag-cs-val') === JSON.stringify(val));
    const omniOffBtn = findSegBtn('omniModule', 'off');
    const linkExtBtn = findSegBtn('linkTarget', 'external');
    const linkRow = sec.querySelector('[data-ag-cs-row="linkTarget"]');
    assert.ok(omniOffBtn && linkExtBtn && linkRow);
    omniOffBtn.click();
    assert.equal(state.omniModule, 'off');
    assert.equal(linkRow.style.opacity, '0.55', 'linkTarget row must visually dim when omniModule is off');

    linkExtBtn.click();
    assert.equal(state.linkTarget, 'external');

    const omniOnBtn = findSegBtn('omniModule', 'on');
    omniOnBtn.click();
    assert.equal(state.omniModule, 'on');
    assert.equal(linkRow.style.opacity, '');

    const sidebarOffBtn = findSegBtn('sidebarStudio', 'off');
    const sidebarOnBtn = findSegBtn('sidebarStudio', 'on');
    assert.ok(sidebarOffBtn && sidebarOnBtn, 'sidebarStudio on/off buttons must mount');
    sidebarOffBtn.click();
    assert.equal(state.sidebarStudio, 'off');
    sidebarOnBtn.click();
    assert.equal(state.sidebarStudio, 'on');

    const sbFoldOnBtn = findSegBtn('sidebarNavFold', 'on');
    const sbFoldOffBtn = findSegBtn('sidebarNavFold', 'off');
    assert.ok(sbFoldOnBtn && sbFoldOffBtn, 'sidebarNavFold off/on buttons must mount');
    sbFoldOnBtn.click();
    assert.equal(state.sidebarNavFold, 'on');
    sbFoldOffBtn.click();
    assert.equal(state.sidebarNavFold, 'off');

    const chBetaBtn = findSegBtn('updateChannel', 'beta');
    const chStableBtn = findSegBtn('updateChannel', 'stable');
    assert.ok(chBetaBtn && chStableBtn, 'updateChannel stable/beta buttons must mount in About group');
    chBetaBtn.click();
    assert.equal(state.updateChannel, 'beta');
    chStableBtn.click();
    assert.equal(state.updateChannel, 'stable');

    // 3. Scene presets: focus enables sidebarCompact=true; switching to ultra resets sidebarCompact=false & highlights ultra pill
    sec.querySelector('button[data-ag-cs-preset="focus"]').click();
    assert.equal(state.sidebarCompact, true);
    assert.equal(sec.querySelector('button[data-ag-cs-preset="focus"]').getAttribute('data-active'), '1');

    sec.querySelector('button[data-ag-cs-preset="ultra"]').click();
    assert.equal(state.sidebarCompact, false);
    assert.equal(sec.querySelector('button[data-ag-cs-preset="ultra"]').getAttribute('data-active'), '1');
    assert.equal(sec.querySelector('button[data-ag-cs-preset="focus"]').getAttribute('data-active'), '0');

    // 4. Async Export JSON awaits __agPrismThought.getConfig() Promise, normalizes 'tech' -> 'technical', strips secrets, and includes 34 keys
    const exportBtn = sec.querySelector('button[data-ag-cs-cfg-action="export"]');
    exportBtn.click();
    await new Promise((r) => setTimeout(r, 25));
    assert.equal(clipboardWrites.length, 1);
    const exportedObj = JSON.parse(clipboardWrites[0]);
    assert.equal(Object.keys(exportedObj.settings).length, 35);
    assert.equal(exportedObj.settings.effortSliderStyle, 'classic');
    assert.equal(exportedObj.settings.effortMemory, 'on');
    assert.equal(exportedObj.settings.sidebarNavFold, 'off');
    assert.equal(exportedObj.settings.scrollBottomMotion, 'smooth');
    assert.equal(exportedObj.settings.updateChannel, 'stable');
    assert.equal(exportedObj.settings.hostLocalization, 'auto');
    assert.equal(exportedObj.settings.omniModule, 'on');
    assert.equal(exportedObj.settings.linkTarget, 'external');
    assert.equal(exportedObj.settings.sidebarStudio, 'on');
    assert.equal(exportedObj.thought.stylePreset, 'technical');
    assert.equal(clipboardWrites[0].includes('SECRETKEY123'), false);
    assert.equal(clipboardWrites[0].includes('PRIVATE999'), false);

    // 5. Cross-language Import JSON (zh-CN -> en) rebuilds panel, preserves green 'ok' status toast, and calls reloadConfig()
    const fileInput = sec.querySelector('input');
    const importPayload = JSON.stringify({
      settings: { language: 'en', omniModule: 'off', linkTarget: 'builtin', thoughtTranslate: 'ai', thoughtView: 'bilingual' },
      thought: { stylePreset: 'concise', customPrompt: 'Be concise' },
    });
    fileInput.files = [{ text: () => Promise.resolve(importPayload) }];
    fileInput.dispatchEvent({ type: 'change' });
    await new Promise((r) => setTimeout(r, 20));

    sec = doc.getElementById(settingsPanel.SETTINGS_SEC_ID);
    assert.equal(sec.getAttribute('data-ag-cs-lang'), 'en', 'Panel must rebuild in English');
    assert.equal(state.omniModule, 'off');
    assert.equal(state.linkTarget, 'builtin');
    assert.ok(reloadConfigCalls >= 1, 'Import must trigger thoughtUiHandle.reloadConfig()');
    assert.equal(savedThoughtPayloads.length, 1);
    const statusAfterImport = sec.querySelector('[data-ag-cs-cfg-status]');
    assert.equal(statusAfterImport.getAttribute('data-tone'), 'ok', 'Green toast must survive cross-language panel rebuild');
    assert.equal(statusAfterImport.textContent, i18nLocales.getUiStrings('en').cfgImportOk);

    // 6. Cross-language Reset Defaults (en -> zh-CN) restores all 26 defaults & preserves green 'ok' toast in zh-CN
    sec.querySelector('button[data-ag-cs-cfg-action="reset"]').click();
    sec = doc.getElementById(settingsPanel.SETTINGS_SEC_ID);
    assert.equal(sec.getAttribute('data-ag-cs-lang'), 'zh-CN');
    assert.equal(state.omniModule, 'on');
    assert.equal(state.linkTarget, 'builtin');
    const statusAfterReset = sec.querySelector('[data-ag-cs-cfg-status]');
    assert.equal(statusAfterReset.getAttribute('data-tone'), 'ok');
    assert.equal(statusAfterReset.textContent, i18nLocales.getUiStrings('zh-CN').cfgResetOk);

    // 7. Dynamic lightPreset context hints across dark, light+warm, light+host, light+obsidian
    const getLpDesc = () => doc.getElementById(settingsPanel.SETTINGS_SEC_ID).querySelector('[data-ag-cs-row="lightPreset"] [data-k="d"]').textContent;
    const zhUi = i18nLocales.getUiStrings('zh-CN');
    assert.equal(getLpDesc(), zhUi.lightPresetHintDark);

    doc.documentElement.setAttribute('data-ag-cs-theme', 'light');
    state.palette = 'warm';
    remountOrSync();
    assert.equal(getLpDesc(), zhUi.lightPresetHintWarm);

    state.palette = 'host';
    remountOrSync();
    assert.equal(getLpDesc(), zhUi.lightPresetHintHost);

    state.palette = 'obsidian';
    remountOrSync();
    assert.equal(getLpDesc(), zhUi.setLightPresetDesc);

    // 8. Verify all 5 languages render Omni & Link Target titles cleanly
    for (const lang of ['zh-CN', 'zh-TW', 'yue', 'en', 'ja']) {
      state.language = lang;
      remountOrSync();
      const curSec = doc.getElementById(settingsPanel.SETTINGS_SEC_ID);
      const omniTitle = curSec.querySelector('[data-ag-cs-row="omniModule"] [data-k="t"]').textContent;
      const linkTitle = curSec.querySelector('[data-ag-cs-row="linkTarget"] [data-k="t"]').textContent;
      assert.equal(omniTitle, i18nLocales.getUiStrings(lang).setOmniTitle);
      assert.equal(linkTitle, i18nLocales.getUiStrings(lang).setLinkTargetTitle);
    }
  } finally {
    delete globalThis.__agPrismThoughtSettingsUi;
    if (prevDoc === undefined) delete globalThis.document;
    else globalThis.document = prevDoc;
    if (prevWin === undefined) delete globalThis.window;
    else globalThis.window = prevWin;
    if (prevStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = prevStorage;
    if (prevBlob !== undefined) globalThis.Blob = prevBlob;
  }
});

test('UX-A2 Effort Slider full Prism integration: data-ag-cs-motion="off", data-ag-cs-accent="mono|amber|iris|cobalt", .ces-set suppression, and English "Fixed" single-level label', () => {
  const sliderCoexist = require('../vendor/effort-slider/slider-coexist.js');
  const upstream = require('../vendor/effort-slider/upstream-client.js');

  const prevDoc = globalThis.document;
  let rootAttrs = { 'data-ag-cs-motion': 'ultra', 'data-ag-cs-accent': 'follow', 'data-ag-cs-lang': 'en' };
  const makeNode = (tag) => {
    const attrs = new Map();
    const cls = new Set();
    const children = [];
    const style = {
      setProperty(k, v) { style[k] = v; },
      removeProperty(k) { delete style[k]; },
      getPropertyValue(k) { return style[k] || ''; },
    };
    return {
      tagName: tag.toUpperCase(),
      className: '',
      innerHTML: '',
      style,
      children,
      classList: {
        add: (...cs) => cs.forEach((c) => cls.add(c)),
        remove: (...cs) => cs.forEach((c) => cls.delete(c)),
        contains: (c) => cls.has(c),
        toggle: (c, f) => (f ? cls.add(c) : cls.delete(c)),
      },
      setAttribute: (k, v) => attrs.set(k, String(v)),
      getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
      hasAttribute: (k) => attrs.has(k),
      removeAttribute: (k) => attrs.delete(k),
      appendChild: (c) => { children.push(c); return c; },
      removeChild: (c) => { const i = children.indexOf(c); if (i >= 0) children.splice(i, 1); },
      remove() {},
      addEventListener() {},
      removeEventListener() {},
      getBoundingClientRect: () => ({ left: 0, width: 120, top: 0, height: 24 }),
    };
  };

  const mockDoc = {
    documentElement: {
      getAttribute: (k) => rootAttrs[k] || null,
      appendChild() {},
    },
    head: makeNode('head'),
    body: makeNode('body'),
    createElement: makeNode,
    getElementById: () => null,
    querySelectorAll: () => [],
  };
  globalThis.document = mockDoc;

  try {
    // 1. motionMode preserves crisp 'fast' detent feel by default under motion="ultra" (#242) and switches to 'quick' when 'off'
    assert.equal(upstream.motionMode({ document: mockDoc }, null, mockDoc), 'fast');
    rootAttrs['data-ag-cs-motion'] = 'off';
    assert.equal(upstream.motionMode({ document: mockDoc }, null, mockDoc), 'quick');

    // 2. valueColorFor & fillColorFor obey html[data-ag-cs-accent]
    rootAttrs['data-ag-cs-accent'] = 'mono';
    assert.equal(upstream.valueColorFor('High', 2, 3, true, false, false), '', 'Mono accent must suppress colored effort label');
    assert.equal(upstream.fillColorFor(1, 0, 0.5, false), '#d4d4d8', 'Mono accent must use silver-zinc fill');

    rootAttrs['data-ag-cs-accent'] = 'amber';
    assert.equal(upstream.valueColorFor('High', 2, 3, true, false, false), '#f59e0b');
    rootAttrs['data-ag-cs-accent'] = 'iris';
    assert.equal(upstream.valueColorFor('High', 2, 3, true, false, false), '#a78bfa');
    rootAttrs['data-ag-cs-accent'] = 'cobalt';
    assert.equal(upstream.valueColorFor('High', 2, 3, true, false, false), '#38bdf8');

    // 3. Single-level model resolves "Fixed" in English instead of hardcoded Chinese "固定"
    const singleProf = upstream.resolveModelEffortProfile(
      { selectedModel: { label: 'Gemini 4 Flash' }, effortIndex: new Map(), modelOptions: [{ label: 'Gemini 4 Flash' }] },
      { label: 'Gemini 4 Flash' },
      new Map()
    );
    assert.equal(singleProf.locked, true);
    assert.equal(singleProf.currentLabel, 'Fixed');

    // 4. Mounted slider with motion="off" forces data-energy="0" (0fps stars/sweep)
    const box = makeNode('div');
    const mounted = upstream.mountCodexEffortSlider({
      container: box,
      document: mockDoc,
      window: { document: mockDoc },
      seat: { getLevels: () => ['low', 'medium', 'high'], getIndex: () => 2, setIndex() {} },
    });
    assert.equal(box.children[0].getAttribute('data-energy'), '0', 'motion="off" must disable starfield/sweep energy');
    mounted.unmount();

    // 5. slider-coexist HIDE_CSS_TEXT covers real .ces-set class
    const styles = new Map();
    const coexistDoc = {
      ...mockDoc,
      head: { appendChild: (s) => styles.set(s.id, s) },
      getElementById: (id) => styles.get(id) || null,
    };
    const ctl = sliderCoexist.createEffortSliderController({ window: { document: coexistDoc }, document: coexistDoc });
    ctl.sync({ effortSliderModule: 'off' });
    assert.ok(styles.get('ag-prism-effort-slider-hide')?.textContent.includes('.ces-set'));
    ctl.destroy();
  } finally {
    if (prevDoc === undefined) delete globalThis.document;
    else globalThis.document = prevDoc;
  }
});

test('settings-panel lazy foldBody deferral on collapsed mount, memoized syncRootState, and zero duplicate style injection when #ag-prism-css exists', async () => {
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  const prevStorage = globalThis.localStorage;

  const { doc, win, storage } = createMockDomEnv('dark');
  storage.removeItem('ag-prism:settings-open'); // initOpen === false (default collapsed)
  const mainCss = doc.createElement('style');
  mainCss.id = 'ag-prism-css';
  doc.head.appendChild(mainCss);

  globalThis.document = doc;
  globalThis.window = win;
  globalThis.localStorage = storage;

  const state = settingsPanel.getDefaultSettingsPatch();
  let matchCalls = 0;
  const mountOrSync = () =>
    settingsPanel.mountOrSyncSettingsSection({
      version: '1.0.6',
      getLang: () => state.language,
      uiText: (l) => i18nLocales.getUiStrings(l),
      isZh: () => true,
      i18nCore,
      formatSettingsSummary: (l) => `${l}:${state.palette}:${state.motionLevel}`,
      resolveSettingRowActiveValue: (k) => state[k],
      isSettingButtonMatch: (_k, valJson, cur) => {
        matchCalls += 1;
        return JSON.parse(valJson) === cur;
      },
      saveSetting: (k, v) => { state[k] = v; },
      saveSettingsBatch: (p) => Object.assign(state, p),
      getThoughtTranslateMode: () => state.thoughtTranslate,
      handledGroupClicks: new WeakSet(),
      runSettingsGroupGlide: () => {},
      runGuardedMut: (fn) => fn(),
    });

  try {
    mountOrSync();
    assert.equal(doc.getElementById('ag-prism-settings-v101-css'), null, 'Must skip extra <style> injection when #ag-prism-css is present');

    const sec = doc.getElementById(settingsPanel.SETTINGS_SEC_ID);
    const foldHead = sec.querySelector('[data-ag-cs-fold-toggle="1"]');
    const foldBody = sec.querySelector('.ag-cs-settings-fold-body');
    const summaryEl = sec.querySelector('[data-ag-cs-fold-summary]');
    assert.ok(sec && foldHead && foldBody && summaryEl);
    assert.equal(sec.getAttribute('data-open'), '0');
    assert.equal(foldBody.children.length, 0, 'Default collapsed mount must defer building internal setting rows');
    assert.equal(matchCalls, 0, 'Default collapsed mount must perform 0 button match evaluations');

    // Updating state while collapsed updates fold summary in O(1) without building or scanning buttons
    state.palette = 'warm';
    mountOrSync();
    assert.equal(summaryEl.textContent, 'zh-CN:warm:ultra');
    assert.equal(foldBody.children.length, 0);
    assert.equal(matchCalls, 0);

    // First click on foldHead lazily constructs all 33 rows and 6 groups
    foldHead.click();
    assert.equal(sec.getAttribute('data-open'), '1');
    assert.equal(sec.getAttribute('data-body-built'), '1');
    assert.equal(sec.querySelectorAll('[data-ag-cs-row]').length, 35);
    assert.equal(sec.querySelectorAll('.ag-cs-settings-group').length, 6);
    const callsAfterExpand = matchCalls;
    assert.ok(callsAfterExpand > 0);

    // Repeated sync with unchanged state signature short-circuits with 0 button scans
    mountOrSync();
    mountOrSync();
    assert.equal(matchCalls, callsAfterExpand, 'Memoized syncRootState must skip DOM button traversal when state is unchanged');

    // State change invalidates signature and updates pressed state cleanly
    state.motionLevel = 'subtle';
    mountOrSync();
    assert.ok(matchCalls > callsAfterExpand);
    const subtleBtn = sec
      .querySelectorAll('button[data-ag-cs-key="motionLevel"]')
      .find((b) => b.getAttribute('data-ag-cs-val') === '"subtle"');
    assert.equal(subtleBtn.getAttribute('aria-pressed'), 'true');
  } finally {
    if (prevDoc === undefined) delete globalThis.document;
    else globalThis.document = prevDoc;
    if (prevWin === undefined) delete globalThis.window;
    else globalThis.window = prevWin;
    if (prevStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = prevStorage;
  }
});

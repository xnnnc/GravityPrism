// Obsidian Prism — Collapsible Settings Control Center, Scene Presets, Config Backup & Credits Module
(function (root) {
  'use strict';
  const G = root || (typeof globalThis !== 'undefined' ? globalThis : window);
  if (!G) return;
  const O = Object, isArr = Array.isArray, hasOwn = (o, k) => O.prototype.hasOwnProperty.call(o, k), isFn = (v) => typeof v === 'function', isObj = (v) => Boolean(v && typeof v === 'object'), getWin = () => (typeof window !== 'undefined' ? window : G);

  const SETTINGS_SEC_ID = 'ag-cs-settings-sec';
  const STORAGE_SETTINGS_OPEN_KEY = 'ag-prism:settings-open';
  const STORAGE_SETTINGS_SUBTAB_KEY = 'ag-prism:settings-subtab';
  const SETTINGS_STYLE_ID = 'ag-prism-settings-v101-css';
  const PRISM_STORAGE_KEYS = [
    'ag-prism:config',
    'ag-prism:lastFileConfig',
    'agClaudeStyle.settings.v3',
    'ag-claude-style:config',
    'ag-prism:trajRollup.v1',
    STORAGE_SETTINGS_OPEN_KEY,
    STORAGE_SETTINGS_SUBTAB_KEY,
    '__op_chroma_v1',
    'agCs.pulseVialMode.v1',
    'ag_prism_thought_zh_cache_v1',
    'ag_prism_thought_view_mode_v1',
    'ag_prism_thought_style_tag_v1',
  ];

  const clearPrismLocalStorage = (store) => {
    const st = store || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!st || !isFn(st.removeItem)) return 0;
    let n = 0;
    for (const k of PRISM_STORAGE_KEYS) {
      try { st.removeItem(k); n += 1; } catch {}
    }
    return n;
  };

  const SETTINGS_FALLBACK_CSS =
    '.ag-cs-settings-fold-body:not(.is-open),.ag-cs-settings-group[hidden]{display:none!important}';

  const mkSp = (allowed, d, aliases) => (aliases ? { allowed, default: d ?? allowed[0], aliases } : { allowed, default: d ?? allowed[0] });
  const S_ON = O.freeze(mkSp(['on', 'off']));
  const S_OFF = O.freeze(mkSp(['on', 'off'], 'off'));
  const S_AUTO = O.freeze(mkSp(['auto', 'on', 'off']));
  const S_T = O.freeze(mkSp([true, false]));
  const S_F = O.freeze(mkSp([true, false], false));

  const PRISM_SETTINGS_SCHEMA = O.freeze({
    palette: mkSp(['obsidian', 'host', 'warm'], null, { claude: 'warm' }),
    lightPreset: mkSp(['crystal', 'alabaster']),
    accentTone: mkSp(['follow', 'cobalt', 'iris', 'amber', 'mono']),
    cornerStyle: mkSp(['sharp', 'balanced', 'soft'], 'balanced'),
    ambientIntensity: mkSp(['0', '35', '70', '100'], '100'),
    motionLevel: mkSp(['off', 'subtle', 'standard', 'ultra'], 'ultra'),
    targetFps: mkSp(['60', '120', '180', 'native'], '180'),
    homeLayout: mkSp(['studio', 'classic', 'off']),
    homeRipple: S_T,
    logoInk: mkSp(['accent', 'foreground']),
    language: mkSp(['zh-CN', 'zh-TW', 'yue', 'en', 'ja']),
    hostLocalization: S_AUTO,
    composerRestyle: S_T,
    placeholderStyle: mkSp(['studio', 'host']),
    smoothCaret: S_T,
    scrollBottomMotion: mkSp(['smooth', 'instant']),
    contextMenu: S_T,
    codeFont: mkSp(['default', 'jetbrains', 'cascadia', 'sfmono']),
    codeLigatures: S_F,
    mascot: mkSp(['crab', 'minis', 'off'], null, { dual: 'crab' }),
    sidebarRestyle: S_T,
    sidebarCompact: S_F,
    sidebarNavFold: mkSp(['off', 'on']),
    thoughtTranslate: mkSp(['off', 'machine', 'ai']),
    thoughtTrigger: mkSp(['preload', 'expand']),
    thoughtView: mkSp(['immersive', 'bilingual']),
    telemetryModule: S_AUTO,
    effortSliderModule: S_AUTO,
    effortSliderStyle: mkSp(['classic', 'prism', 'ferrofluid', 'orbital', 'oscilloscope', 'plasma', 'supernova', 'swarm']),
    effortMemory: S_ON,
    omniModule: S_ON,
    linkTarget: mkSp(['builtin', 'external']),
    sidebarStudio: S_OFF,
    autoUpdate: S_OFF,
    updateChannel: mkSp(['stable', 'beta']),
  });

  const SCENE_PRESETS = O.freeze({
    ultra: O.freeze({ motionLevel: 'ultra', targetFps: '180', homeRipple: true, mascot: 'crab', sidebarCompact: false, smoothCaret: true, ambientIntensity: '100' }),
    focus: O.freeze({ motionLevel: 'subtle', targetFps: '120', homeRipple: false, mascot: 'off', sidebarCompact: true, smoothCaret: true, ambientIntensity: '35' }),
    eco: O.freeze({ motionLevel: 'off', targetFps: '60', homeRipple: false, mascot: 'off', sidebarCompact: false, smoothCaret: false, ambientIntensity: '0' }),
  });

  const normThoughtStyle = (s) => (s === 'tech' || s === 'technical' ? 'technical' : s === 'concise' || s === 'custom' ? s : null);

  const getDefaultSettingsPatch = () => {
    const out = {};
    for (const [k, spec] of O.entries(PRISM_SETTINGS_SCHEMA)) out[k] = spec.default;
    return out;
  };

  const redactSecrets = (s) =>
    String(s || '')
      .replace(/\b(?:sk|rk|pk|ak|AIza)[A-Za-z0-9_\-]{10,}\b/g, '[REDACTED]')
      .replace(/\bBearer\s+[A-Za-z0-9._\-]{10,}\b/gi, 'Bearer [REDACTED]');

  const sanitizeKeyVal = (key, rawVal) => {
    if (!hasOwn(PRISM_SETTINGS_SCHEMA, key)) return { valid: false };
    const spec = PRISM_SETTINGS_SCHEMA[key];
    let val = typeof rawVal === 'string' && spec.aliases && hasOwn(spec.aliases, rawVal) ? spec.aliases[rawVal] : rawVal;
    if (key === 'language' && val === 'auto') {
      const nav = typeof navigator !== 'undefined' && navigator?.language ? navigator.language : '';
      const normFn = G.__agCsI18n?.normalizeLanguage;
      val = typeof normFn === 'function' && nav ? normFn(nav) : /^ja\b/i.test(nav) ? 'ja' : /^en\b/i.test(nav) ? 'en' : /^zh[-_](?:HK|MO)/i.test(nav) ? 'yue' : /^zh[-_](?:TW|Hant)/i.test(nav) ? 'zh-TW' : 'zh-CN';
    }
    if ((key === 'omniModule' || key === 'sidebarStudio' || key === 'autoUpdate' || key === 'sidebarNavFold') && typeof val === 'boolean') val = val ? 'on' : 'off';
    if (typeof spec.default === 'string' && typeof val === 'number' && Number.isFinite(val)) val = String(val);
    return spec.allowed.includes(val) ? { valid: true, value: val } : { valid: false };
  };

  const buildSanitizedConfigExport = (currentSettings = {}, rawThoughtCfg = null, version = '1.1.0') => {
    const settings = {};
    for (const [k, spec] of O.entries(PRISM_SETTINGS_SCHEMA)) {
      const c = sanitizeKeyVal(k, currentSettings[k]);
      settings[k] = c.valid ? c.value : spec.default;
    }
    const out = { schema: 'obsidian-prism-config-v1', version: String(version || '1.1.0'), exportedAt: new Date().toISOString(), settings };
    const tSrc = isObj(rawThoughtCfg) && isObj(rawThoughtCfg.config) ? rawThoughtCfg.config : rawThoughtCfg;
    if (isObj(tSrc) && !isArr(tSrc) && !isFn(tSrc.then) && tSrc.ok !== false) {
      out.thought = {
        stylePreset: normThoughtStyle(tSrc.stylePreset) || 'technical',
        customPrompt: typeof tSrc.customPrompt === 'string' ? redactSecrets(tSrc.customPrompt.slice(0, 4000)) : '',
        activeProfileId: typeof tSrc.activeProfileId === 'string' ? tSrc.activeProfileId.slice(0, 64) : '',
        profiles: isArr(tSrc.profiles)
          ? tSrc.profiles
              .filter((p) => isObj(p) && !isArr(p))
              .slice(0, 16)
              .map((p, i) => ({
                id: String(p.id || `p-${i + 1}`).slice(0, 64),
                name: redactSecrets(String(p.name || '').slice(0, 80)),
                baseUrl: redactSecrets(String(p.baseUrl || '').slice(0, 260)),
                model: redactSecrets(String(p.model || '').slice(0, 120)),
              }))
          : [],
      };
    }
    return out;
  };

  const validateImportedConfigJson = (rawInput) => {
    let parsed = rawInput;
    if (typeof rawInput === 'string') {
      if (rawInput.length > 131072) return { ok: false, error: 'payload-too-large' };
      try {
        parsed = JSON.parse(rawInput);
      } catch {
        return { ok: false, error: 'invalid-json' };
      }
    }
    if (!isObj(parsed) || isArr(parsed)) return { ok: false, error: 'invalid-root' };
    const src = isObj(parsed.settings) && !isArr(parsed.settings) ? parsed.settings : parsed;
    const cleanPatch = {};
    for (const k of O.keys(src)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype' || /apikey|secret|token|password/i.test(k)) continue;
      const c = sanitizeKeyVal(k, src[k]);
      if (c.valid) cleanPatch[k] = c.value;
    }
    let cleanThought = null;
    if (isObj(parsed.thought) && !isArr(parsed.thought)) {
      const t = parsed.thought;
      const stylePreset = normThoughtStyle(t.stylePreset) || undefined;
      const customPrompt = typeof t.customPrompt === 'string' ? redactSecrets(t.customPrompt.slice(0, 4000)) : undefined;
      const profiles = isArr(t.profiles)
        ? t.profiles
            .filter((p) => isObj(p) && !isArr(p))
            .slice(0, 16)
            .map((p, i) => ({
              id: String(p.id || `p-${i + 1}`).slice(0, 64),
              name: redactSecrets(String(p.name || '').slice(0, 80)),
              baseUrl: /^https?:\/\//i.test(String(p.baseUrl || '').trim()) ? redactSecrets(String(p.baseUrl).trim().slice(0, 260)) : '',
              model: redactSecrets(String(p.model || '').slice(0, 120)),
              apiKey: '',
              keepExistingKey: true,
            }))
        : undefined;
      if (stylePreset !== undefined || customPrompt !== undefined || (profiles && profiles.length > 0)) {
        cleanThought = {
          ...(stylePreset !== undefined ? { stylePreset } : {}),
          ...(customPrompt !== undefined ? { customPrompt } : {}),
          ...(typeof t.activeProfileId === 'string' ? { activeProfileId: t.activeProfileId.slice(0, 64) } : {}),
          ...(profiles ? { profiles } : {}),
          keepExistingKey: true,
        };
      }
    }
    return O.keys(cleanPatch).length === 0 && !cleanThought ? { ok: false, error: 'no-valid-keys' } : { ok: true, settings: cleanPatch, thought: cleanThought };
  };

  const UPSTREAM_CREDITS = [
    ['0DNANCY/agy-claude-style', 'MIT · 0DNANCY'],
    ['ATtacK030130/antigrative-dashboard', 'MIT · AG Pulse'],
    ['LLYSH-HANNARI/antigravity-Codex-Claude-effort-slider', 'MIT · 月上寒'],
    ['yiheng8023/antigravity-chinese', 'MIT · yiheng8023'],
    ['Nwflower/dsh-claude-style', 'Inspiration'],
    ['Microqian2th/dsh-codex-effort-slider', 'Upstream'],
    ['mobius/dsh-performance-slider', 'Upstream'],
    ['claudenoshujin/claude-web', 'Mascot Pile & Micro-Ecology Interaction Inspiration'],
  ].map(([repo, meta]) => ({ repo, url: 'https://github.com/' + repo, meta }));

  const LICENSE_SUMMARY_TEXT = [
    'GNU General Public License v3.0 (GPL-3.0-only)',
    'Copyright (C) 2026 RMvdesi (https://github.com/RMvdesi/obsidian-prism)',
    '',
    'Obsidian Prism is free and open-source software licensed under GPL-3.0.',
    'Per GPL-3.0 Sections 4–7 and NOTICE, any modified version, fork, or derivative',
    'distribution MUST:',
    '  1. Remain open-source as a whole under GPL-3.0 with complete source code;',
    '  2. Preserve RMvdesi / Obsidian Prism copyright, NOTICE, and UI credits;',
    '  3. Clearly mark modifications and not misrepresent derived builds as official.',
    '',
    'Preserved Upstream Component Notices (MIT License — GPL-3.0 Compatible):',
    '  - Copyright (c) 2026 0DNANCY (agy-claude-style)',
    '  - Copyright (c) 2026 AG Pulse contributors (antigrative-dashboard)',
    '  - Copyright (c) 2026 月上寒 / LLYSH-HANNARI (antigravity-Codex-Claude-effort-slider)',
    '  - Copyright (c) 2026 Antigravity Chinese Localization Contributors (yiheng8023/antigravity-chinese)',
    '',
    'See LICENSE, NOTICE, CITATION.cff, and THIRD_PARTY_NOTICES.md in the repository.',
  ].join('\n');

  let pendingCfgToast = null;

  const invokePrismRepoAction = (action, ver, extra) => {
    const act = ['pull', 'storage-health', 'prepare-archive', 'uninstall', 'update-status', 'check-update', 'apply-update'].includes(action) ? action : 'status';
    const vObj = isObj(ver);
    const ext = vObj ? { ...ver, ...(isObj(extra) ? extra : null) } : isObj(extra) ? extra : null;
    try {
      const b = getWin()?.__agPrismRepoBridge, arg = ext ? { ...ext, action: act } : { action: act };
      if (isFn(b)) return Promise.resolve(b(arg));
      if (isFn(b?.[act])) return Promise.resolve(b[act](ext || extra));
      if (isFn(b?.call)) return Promise.resolve(b.call(arg));
    } catch (err) {
      return Promise.resolve({ ok: false, action: act, error: String(err?.message || err) });
    }
    return Promise.resolve({ ok: false, offline: true, action: act, noRemote: true, hasRemote: false, branch: 'local', shortHash: vObj ? ver.version : ver });
  };

  const readStore = (k) => {
    try { return typeof localStorage !== 'undefined' && localStorage ? localStorage.getItem(k) || '' : ''; } catch { return ''; }
  };
  const writeStore = (k, v) => {
    try { if (typeof localStorage !== 'undefined' && localStorage) localStorage.setItem(k, v); } catch {}
  };

  const renderObsidianPrismBrandSvg = (size = 20) => {
    try {
      const ext = G.__agPrismBrandLogoSvg || getWin()?.__agPrismBrandLogoSvg;
      const out = isFn(ext) ? ext(size) : ext;
      if (typeof out === 'string' && out.includes('<svg')) return out;
    } catch {}
    return '';
  };

  const mascotLabels = (lang, ui) => {
    if (lang === 'zh-TW' || lang === 'yue') return ['雙寵', '雙寵+三蟹', ui.offLabel || '關閉'];
    if (lang === 'ja') return ['ペア', 'ペア+ミニ蟹', ui.offLabel || 'オフ'];
    if (lang === 'en') return ['Dual', 'Dual+Crabs', ui.offLabel || 'Off'];
    return ['双宠', '双宠+三蟹', ui.offLabel || '关闭'];
  };

  const mountOrSyncSettingsSection = (ctx) => {
    const {
      version,
      getLang,
      uiText,
      isZh,
      i18nCore,
      formatSettingsSummary,
      resolveSettingRowActiveValue,
      isSettingButtonMatch,
      saveSetting,
      saveSettingsBatch,
      getThoughtTranslateMode,
      handledGroupClicks,
      runSettingsGroupGlide,
      runGuardedMut,
    } = ctx;

    const doc = typeof document !== 'undefined' ? document : null;
    if (!doc) return;
    const syncChrome = G.__agPrismHostEnhancer?.syncSettingsDialogChrome;
    if (isFn(syncChrome)) syncChrome(doc, runGuardedMut);
    const lang = getLang();
    const ui = uiText(lang);
    const targetTitles = ['Appearance', '外观', '外觀', '外観'];
    let panel = null;
    for (const h2 of doc.querySelectorAll('[role="dialog"] h2')) {
      if (targetTitles.includes((h2.textContent || '').trim())) {
        panel = h2.closest('div.p-6') || h2.parentElement?.parentElement;
        if (panel) break;
      }
    }
    if (!panel) return;
    if (!isFn(syncChrome)) {
      const dlg = panel.closest?.('[role="dialog"]');
      if (dlg && dlg.getAttribute?.('data-ag-cs-settings-dlg') !== '1') {
        runGuardedMut(() => dlg.setAttribute?.('data-ag-cs-settings-dlg', '1'));
      }
    }

    const effVal = (k, l) => {
      const v = isFn(resolveSettingRowActiveValue) ? resolveSettingRowActiveValue(k, l) : undefined;
      return v !== undefined && v !== null && v !== '' ? v : PRISM_SETTINGS_SCHEMA[k]?.default;
    };
    const matchBtn = (k, valJson, cur) => {
      if (isFn(isSettingButtonMatch)) {
        const r = isSettingButtonMatch(k, valJson, cur);
        if (r === true) return true;
        if (cur !== undefined && cur !== null) return false;
      }
      try { return JSON.parse(valJson) === cur; } catch { return String(valJson) === String(cur); }
    };
    const applyBatch = (patch) => {
      if (!isObj(patch)) return;
      if (isFn(saveSettingsBatch)) saveSettingsBatch(patch);
      else if (isFn(saveSetting)) for (const [k, v] of O.entries(patch)) saveSetting(k, v);
    };
    const K_IC = 'isConnected', K_TC = 'textContent', K_CL = 'classList', K_WP = 'prism-wallpaper-slot';
    const sa = (e, k, v = '') => e.setAttribute(k, String(v));
    const ga = (e, k) => e.getAttribute(k);
    const ra = (e, k) => e.removeAttribute(k);
    const qs = (e, s) => e.querySelector(s);
    const qa = (e, s) => e.querySelectorAll(s);
    const rc = (e) => (isFn(e?.getBoundingClientRect) ? e.getBoundingClientRect() : null);
    const ap = (p, ...cs) => {
      for (const c of cs) if (c) p.appendChild(c);
      return p;
    };
    const on = (e, ev, fn) => e.addEventListener(ev, fn);
    const onClk = (e, fn) => on(e, 'click', (ev) => { ev?.stopPropagation?.(); fn(ev); });

    const SCHEMA_KEYS = O.keys(PRISM_SETTINGS_SCHEMA);
    const isSwitchValOn = (v) => v === true || v === 'on';
    const syncRootState = (rootEl, l, u) => {
      const sumEl = qs(rootEl, '[data-ag-cs-fold-summary]');
      const ns = formatSettingsSummary(l, u);
      if (sumEl && sumEl[K_TC] !== ns) sumEl[K_TC] = ns;
      if (ga(rootEl, 'data-body-built') !== '1') return;
      if (typeof rootEl.__prismMountThoughtUi === 'function') {
        try { rootEl.__prismMountThoughtUi(); } catch {}
      }
      try { rootEl.__prismMountWp?.(l); } catch {}
      try { rootEl.__prismSyncEffortPreview?.(l); } catch {}

      const de = doc.documentElement;
      const themeAttr = de?.getAttribute?.('data-ag-cs-theme') || '';
      const isLightTheme =
        themeAttr === 'light' ||
        (!themeAttr && (Boolean(de?.[K_CL]?.contains?.('light')) || Boolean(doc.body?.[K_CL]?.contains?.('light'))));
      const hiState = de?.getAttribute?.('data-ag-prism-host-i18n') || '';
      const tmMode = getThoughtTranslateMode();
      const thLive = rootEl.__prismThoughtUiHandle;
      const hasThUi = Boolean(thLive && thLive.box?.[K_IC]);
      const sigParts = [l, isLightTheme ? 1 : 0, hiState, tmMode, hasThUi ? 1 : 0, ns];
      for (const k of SCHEMA_KEYS) sigParts.push(effVal(k, l));
      const nextSig = sigParts.join('\x1f');
      if (rootEl.__lastSyncSig === nextSig) return;
      rootEl.__lastSyncSig = nextSig;

      const dirtyBtns = [];
      qa(rootEl, 'button[data-ag-cs-key]').forEach((btn) => {
        const k = ga(btn, 'data-ag-cs-key');
        const cur = effVal(k, l);
        const act = Boolean(matchBtn(k, ga(btn, 'data-ag-cs-val'), cur));
        if (btn.__agOn !== act || ga(btn, 'aria-pressed') !== String(act)) dirtyBtns.push([btn, act, cur]);
      });
      const dirtyPresets = [];
      qa(rootEl, 'button[data-ag-cs-preset]').forEach((pBtn) => {
        const spec = SCENE_PRESETS[ga(pBtn, 'data-ag-cs-preset')];
        if (!spec) return;
        const m = O.entries(spec).every(([k, ex]) => effVal(k, l) === ex);
        if (pBtn.__agAct !== m || ga(pBtn, 'data-active') !== (m ? '1' : '0')) dirtyPresets.push([pBtn, m]);
      });
      for (const [btn, act, cur] of dirtyBtns) {
        btn.__agOn = act;
        sa(btn, 'aria-pressed', act);
        if (act) sa(btn, 'data-pressed');
        else ra(btn, 'data-pressed');
        const grp = btn.parentElement;
        if (grp && ga(grp, 'data-ui-kind') === 'switch') {
          btn.tabIndex = act ? -1 : 0;
          sa(btn, 'tabindex', act ? '-1' : '0');
          const swOn = isSwitchValOn(cur) ? '1' : '0';
          if (ga(grp, 'data-switch-on') !== swOn) sa(grp, 'data-switch-on', swOn);
        }
      }
      for (const [pBtn, m] of dirtyPresets) {
        pBtn.__agAct = m;
        sa(pBtn, 'data-active', m ? '1' : '0');
        sa(pBtn, 'aria-pressed', m);
      }
      const th = hasThUi ? thLive : null;
      if (th?.onLanguageChanged && th.__agLang !== l) {
        th.onLanguageChanged(l);
        th.__agLang = l;
      }
      if (th?.onViewSwitched) th.onViewSwitched(effVal('thoughtView', l));
      if (th?.onModeSwitched) {
        th.onModeSwitched(tmMode);
      } else {
        const tb = qs(rootEl, '[data-testid="prism-thought-ai-config"]');
        if (tb) tb.hidden = tmMode !== 'ai';
      }
      for (const [dk, dim] of [
        ['placeholderStyle', effVal('composerRestyle', l) === false],
        ['sidebarCompact', effVal('sidebarRestyle', l) === false],
        ['sidebarNavFold', effVal('sidebarRestyle', l) === false],
        ['thoughtTrigger', tmMode === 'off'],
        ['thoughtView', tmMode === 'off'],
        ['homeRipple', effVal('homeLayout', l) === 'off'],
        ['effortSliderStyle', effVal('effortSliderModule', l) === 'off'],
        ['linkTarget', effVal('omniModule', l) === 'off'],
      ]) {
        const dr = qs(rootEl, `[data-ag-cs-row="${dk}"]`);
        if (!dr) continue;
        if (dr.style) dr.style.opacity = dim ? '0.55' : '';
        if (dim) sa(dr, 'data-ag-cs-dimmed', '1'); else ra(dr, 'data-ag-cs-dimmed');
      }
      const lpDescEl = qs(rootEl, '[data-ag-cs-row="lightPreset"] [data-k="d"]');
      if (lpDescEl) {
        const curPal = effVal('palette', l);
        let lpText = u.setLightPresetDesc || '';
        if (!isLightTheme && u.lightPresetHintDark) lpText = u.lightPresetHintDark;
        else if (isLightTheme && curPal === 'warm' && u.lightPresetHintWarm) lpText = u.lightPresetHintWarm;
        else if (isLightTheme && curPal === 'host' && u.lightPresetHintHost) lpText = u.lightPresetHintHost;
        if (lpDescEl[K_TC] !== lpText) lpDescEl[K_TC] = lpText;
      }
      const hiDescEl = qs(rootEl, '[data-ag-cs-row="hostLocalization"] [data-k="d"]');
      if (hiDescEl) {
        const hiModeNow = effVal('hostLocalization', l);
        const hiDisabledNow = hiModeNow === 'off' || (hiModeNow === 'auto' && l !== 'zh-CN');
        let extZhActive = false;
        if (hiDisabledNow) {
          try {
            const winRef = doc.defaultView || globalThis;
            if (
              winRef?.__antigravityZhInstalled ||
              winRef?.__AGY_HANS__ ||
              qs(doc, '[data-agy-hans-ui], #agy-theme-switcher, #antigravity-translation-audit')
            ) {
              extZhActive = true;
            } else {
              for (const hn of qa(doc, '[data-testid="new-conversation-button"], [role="dialog"] h1, [role="dialog"] h2, [data-ag-cs-settings-dlg="1"] [data-ag-cs-settings-nav="1"]')) {
                if (hn && !hn.closest?.('#' + SETTINGS_SEC_ID) && /[\u4e00-\u9fff]/.test(String(hn.textContent || ''))) {
                  extZhActive = true;
                  break;
                }
              }
            }
          } catch {}
        }
        const hiWarn =
          hiModeNow === 'auto' && hiState === 'yielded' && u.hostI18nYieldHint
            ? '1'
            : hiDisabledNow && extZhActive && u.hostI18nOffExtHint
              ? 'ext'
              : '';
        const hiText =
          hiWarn === '1'
            ? u.hostI18nYieldHint
            : hiWarn === 'ext'
              ? u.hostI18nOffExtHint
              : (u.setHostI18nDesc || '');
        if (hiDescEl[K_TC] !== hiText) hiDescEl[K_TC] = hiText;
        if (hiWarn) sa(hiDescEl, 'data-ag-cs-hi-warn', hiWarn);
        else ra(hiDescEl, 'data-ag-cs-hi-warn');
      }
    };

    runGuardedMut(() => {
      const hasMainCss = !!doc.getElementById?.('ag-prism-css');
      try {
        if (doc.head && !hasMainCss && !doc.getElementById?.(SETTINGS_STYLE_ID)) {
          const stEl = doc.createElement('style');
          stEl.id = SETTINGS_STYLE_ID;
          stEl[K_TC] = SETTINGS_FALLBACK_CSS;
          ap(doc.head, stEl);
        }
      } catch {}

      const existing = doc.getElementById(SETTINGS_SEC_ID);
      if (existing) {
        if (qs(panel, '#' + SETTINGS_SEC_ID) === existing && ga(existing, 'data-ag-cs-lang') === lang) {
          syncRootState(existing, lang, ui);
          return;
        }
        try { qs(existing, `[data-testid="${K_WP}"]`)?.__agPrismWpUiHandle?.destroy?.(); } catch {}
        try { existing.__prismDestroyEffortPreview?.(); } catch {}
        existing.remove();
      }

      const sections = Array.from(qa(panel, 'div.space-y-2')).filter(
        (s) => !s.id.startsWith('ag-cs-') && !(s.parentElement && s.parentElement.closest('div.space-y-2'))
      );
      const anchor = sections[sections.length - 1];
      if (!anchor || !anchor.parentElement) return;

      const BTN = 'ag-cs-seg-btn data-[pressed]:bg-secondary data-[pressed]:text-foreground';
      const CARD_CLS = 'ag-cs-settings-card divide-y';

      const initOpen = ['1', 'true'].includes(readStore(STORAGE_SETTINGS_OPEN_KEY));
      const savedTab = readStore(STORAGE_SETTINGS_SUBTAB_KEY);
      let activeSubTab = ['appearance', 'interaction', 'thought', 'modules', 'beta', 'about', 'all'].includes(savedTab) ? savedTab : 'appearance';

      const sec = doc.createElement('div');
      sec.id = SETTINGS_SEC_ID;
      sec.className = initOpen ? 'space-y-2 is-open' : 'space-y-2';
      for (const [k, v] of [
        ['data-ag-no-i18n', ''],
        ['translate', 'no'],
        ['data-no-translate', 'true'],
        ['data-ag-localization-skip', 'true'],
        ['data-agy-no-translate', 'true'],
        ['data-antigravity-zh-skip', '1'],
        ['data-ag-cs-lang', lang],
        ['data-open', initOpen ? '1' : '0'],
        ['data-ag-cs-open', initOpen ? '1' : '0'],
      ]) {
        sa(sec, k, v);
      }

      const mkEl = (tag, cls, txt) => {
        const el = doc.createElement(tag);
        if (cls) el.className = cls;
        if (txt !== undefined) el[K_TC] = txt;
        return el;
      };
      const mkB = (cls, txt, attr, v = '1') => {
        const b = mkEl('button', cls, txt);
        b.type = 'button';
        if (attr) sa(b, attr, v);
        return b;
      };
      const setVis = (el, vis) => {
        el.hidden = !vis;
        if (vis) ra(el, 'hidden');
        else sa(el, 'hidden');
      };
      const fmtTpl = (tpl, args) => String(tpl || '').replace(/\{(\d)\}/g, (_, k) => String(args[k] ?? ''));

      const foldSummaryEl = mkEl('span', 'ag-cs-settings-fold-summary', formatSettingsSummary(lang, ui));
      sa(foldSummaryEl, 'data-ag-cs-fold-summary');

      const foldHead = mkB('ag-cs-settings-fold-head', undefined, 'data-ag-cs-fold-toggle');
      sa(foldHead, 'aria-expanded', initOpen);
      sa(foldHead, 'aria-label', initOpen ? ui.foldCollapseHint || 'Collapse' : ui.foldExpandHint || 'Expand');

      const foldLeft = mkEl('span', 'ag-cs-settings-fold-left');
      const brandMark = mkEl('span', 'ag-cs-settings-brand-mark');
      sa(brandMark, 'aria-hidden', 'true');
      brandMark.innerHTML = renderObsidianPrismBrandSvg(20);
      const brandTitle = ui.sectionTitle && /Obsidian Prism/i.test(ui.sectionTitle) ? ui.sectionTitle : 'Obsidian Prism';
      const updBadge = mkEl('span', 'ag-cs-update-badge', '');
      sa(updBadge, 'data-ag-cs-update-badge', '1');
      setVis(updBadge, false);
      ap(foldLeft, brandMark, mkEl('h3', '', brandTitle), mkEl('span', 'ag-cs-settings-ver', `v${version}`), updBadge);

      const chevron = mkEl('span', 'ag-cs-settings-fold-chevron');
      sa(chevron, 'data-ag-cs-chevron');
      sa(chevron, 'aria-hidden', 'true');
      chevron.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg>';
      const foldRight = ap(mkEl('span', 'ag-cs-settings-fold-right'), foldSummaryEl, chevron);
      ap(foldHead, foldLeft, foldRight);

      const foldBody = mkEl('div', initOpen ? 'ag-cs-settings-fold-body is-open' : 'ag-cs-settings-fold-body');
      sa(foldBody, 'data-open', initOpen ? '1' : '0');
      sa(foldBody, 'aria-hidden', !initOpen);
      ap(sec, foldHead, foldBody);

      let foldBodyBuilt = false;
      let cachedUpdStatus = null;
      let applyUpdateViewRef = null;
      let probeRepoRef = null;
      let thoughtListEl = null;
      let thoughtUiHandle = null;
      let wpSlot = null;

      const getThoughtUiHandle = () => {
        const live = sec.__prismThoughtUiHandle || thoughtUiHandle;
        if (live && live.box?.[K_IC]) {
          thoughtUiHandle = live;
          return live;
        }
        return null;
      };

      const mountThoughtUiIfReady = () => {
        const curUi = getWin()?.__agPrismThoughtSettingsUi || G.__agPrismThoughtSettingsUi;
        const hasFactory = isFn(curUi?.createThoughtAiConfigBox);
        if (thoughtUiHandle && !thoughtUiHandle.box?.[K_IC]) {
          thoughtUiHandle = null;
          if (sec.__prismThoughtUiHandle && !sec.__prismThoughtUiHandle.box?.[K_IC]) {
            sec.__prismThoughtUiHandle = null;
          }
          if (!hasFactory) return null;
        }
        if (thoughtUiHandle && thoughtUiHandle.box?.[K_IC]) {
          sec.__prismThoughtUiHandle = thoughtUiHandle;
          return thoughtUiHandle;
        }
        const hostList = thoughtListEl?.[K_IC] ? thoughtListEl : qs(sec, '[data-ag-cs-group="thought"] .ag-cs-settings-card');
        if (!hostList?.[K_IC] || !hasFactory) {
          if (!hasFactory) {
            thoughtUiHandle = null;
            sec.__prismThoughtUiHandle = null;
          }
          return null;
        }
        thoughtListEl = hostList;
        const curLang = getLang();
        const curUiText = uiText(curLang) || ui;
        const curMode = getThoughtTranslateMode();
        const handle = curUi.createThoughtAiConfigBox({
          mkEl,
          btnClass: BTN,
          ui: curUiText,
          lang: curLang,
          getLang,
          isZh,
          getMode: getThoughtTranslateMode,
          runGuardedMut,
        });
        if (!handle || !handle.box) return null;
        runGuardedMut(() => {
          qa(hostList, '[data-testid="prism-thought-ai-config"],[data-testid="prism-thought-general-config"]').forEach((oldBox) => oldBox.remove());
          ap(hostList, handle.box);
        });
        handle.__agLang = curLang;
        thoughtUiHandle = handle;
        sec.__prismThoughtUiHandle = handle;
        try {
          handle.onLanguageChanged?.(curLang);
          handle.onViewSwitched?.(effVal('thoughtView', curLang));
          handle.onModeSwitched?.(curMode);
        } catch {}
        return handle;
      };
      sec.__prismMountThoughtUi = mountThoughtUiIfReady;
      sec.__prismMountWp = (l) => {
        const f = G.__prismMountWallpaperUi;
        if (wpSlot && f) f(wpSlot, { lang: l || getLang(), getLang, runGuardedMut });
      };

      const syncFoldBadgeOnly = (st) => {
        if (!updBadge[K_IC] || !st || st.offline || st.timeout) return;
        runGuardedMut(() => {
          if (st.hasUpdate && !st.applied && !st.hotReloaded && !st.hotReloadExpected) {
            updBadge[K_TC] = `v${st.latestVersion || ''}`;
            setVis(updBadge, true);
          } else {
            setVis(updBadge, false);
          }
        });
      };

      const ensureFoldBodyBuilt = () => {
        if (foldBodyBuilt) return;
        foldBodyBuilt = true;
        sa(sec, 'data-body-built', '1');

        runGuardedMut(() => {
          const langOpts = (
            i18nCore?.LANG_OPTIONS || [
              { id: 'zh-CN', label: '简体中文' },
              { id: 'zh-TW', label: '繁體中文' },
              { id: 'yue', label: '粵語' },
              { id: 'en', label: 'English' },
              { id: 'ja', label: '日本語' },
            ]
          ).map((o) => [o.id, o.label]);

          const [mDual, mMinis, mOff] = mascotLabels(lang, ui);
          const U = (k, d = '') => ui[k] || d;
          const onOff = [[true, U('onLabel', 'On')], [false, U('offLabel', 'Off')]];
          const autoOnOff = [['auto', U('optAutoCoexist', 'Auto')], ['on', U('onLabel', 'On')], ['off', U('offLabel', 'Off')]];
          const onOffStr = autoOnOff.slice(1);
          const warmLbl = ui.optWarm || (ui.optClaude && !/claude/i.test(ui.optClaude) ? ui.optClaude : '') || 'Alabaster';
          const R = (key, tk, dk, opts) => ({ key, title: U(tk, key), desc: U(dk), opts });
          const RS = (key, opts, s = key[0].toUpperCase() + key.slice(1)) => R(key, 'set' + s + 'Title', 'set' + s + 'Desc', opts);

          const rowDefs = {};
          for (const r of [
            RS('palette', [['host', U('optHost')], ['warm', warmLbl], ['obsidian', U('optObsidian')]]),
            RS('lightPreset', [['crystal', U('optLightCrystal')], ['alabaster', U('optLightAlabaster')]]),
            RS('accentTone', [['follow', U('optToneFollow')], ['cobalt', U('optToneCobalt')], ['iris', U('optToneIris')], ['amber', U('optToneAmber')], ['mono', U('optToneMono')]]),
            RS('cornerStyle', [['sharp', U('optCornerSharp')], ['balanced', U('optCornerBalanced')], ['soft', U('optCornerSoft')]]),
            RS('ambientIntensity', [['0', U('optAmb0', '0%')], ['35', U('optAmb35', '35%')], ['70', U('optAmb70', '70%')], ['100', U('optAmb100', '100%')]]),
            RS('motionLevel', [['off', U('optMotionOff')], ['subtle', U('optMotionSubtle')], ['standard', U('optMotionStandard')], ['ultra', U('optMotionUltra')]]),
            RS('targetFps', [['60', U('optFps60', '60')], ['120', U('optFps120', '120')], ['180', U('optFps180', '180')], ['native', U('optFpsNative')]]),
            RS('homeLayout', [['studio', U('optStudio')], ['classic', U('optClassic')], ['off', U('optNativeOff')]]),
            RS('homeRipple', onOff, 'Ripple'),
            RS('logoInk', [['accent', U('optAccent')], ['foreground', U('optForeground')]]),
            RS('language', langOpts),
            RS('hostLocalization', [['auto', U('optHostI18nAuto', 'Auto')], ['on', U('onLabel', 'On')], ['off', U('offLabel', 'Off')]], 'HostI18n'),
            RS('composerRestyle', onOff, 'Composer'),
            RS('placeholderStyle', [['studio', 'Studio'], ['host', U('optPlaceholderHost')]], 'Placeholder'),
            RS('smoothCaret', onOff),
            RS('scrollBottomMotion', [['smooth', U('optScrollBottomSmooth', 'Glide')], ['instant', U('optScrollBottomInstant', 'Instant')]], 'ScrollBottom'),
            R('contextMenu', 'rowContextMenuTitle', 'rowContextMenuDesc', onOff),
            RS('codeFont', [['default', U('optFontDefault')], ['jetbrains', 'JetBrains Mono'], ['cascadia', 'Cascadia Code'], ['sfmono', U('optFontSfmono', 'SF Mono')]]),
            RS('codeLigatures', onOff),
            RS('mascot', [['crab', mDual], ['minis', mMinis], ['off', mOff]]),
            RS('sidebarRestyle', onOff, 'Sidebar'),
            RS('sidebarCompact', onOff),
            R('sidebarNavFold', 'setSidebarNavFoldLabel', 'setSidebarNavFoldDesc', [['off', U('optSidebarNavFoldOff', 'Show All')], ['on', U('optSidebarNavFoldOn', 'Fold Extra')]]),
            RS('thoughtTranslate', [['off', U('optThoughtOff')], ['machine', U('optThoughtMachine')], ['ai', U('optThoughtAi')]], 'ThoughtMode'),
            RS('thoughtTrigger', [['preload', U('optTriggerPreload')], ['expand', U('optTriggerExpand')]]),
            RS('thoughtView', [['immersive', U('optThoughtImmersive')], ['bilingual', U('optThoughtBilingual')]]),
            RS('telemetryModule', autoOnOff, 'Telemetry'),
            RS('effortSliderModule', autoOnOff, 'EffortSlider'),
            RS('effortSliderStyle', [
              ['classic', U('optEffortStyleClassic', 'Classic')],
              ['prism', U('optEffortStylePrism', 'Prism Beam')],
              ['ferrofluid', U('optEffortStyleFerrofluid', 'Ferrofluid')],
              ['orbital', U('optEffortStyleOrbital', 'Gravity Well')],
              ['oscilloscope', U('optEffortStyleOscilloscope', 'Oscilloscope')],
              ['plasma', U('optEffortStylePlasma', 'Plasma Arc')],
              ['supernova', U('optEffortStyleSupernova', 'Supernova')],
              ['swarm', U('optEffortStyleSwarm', 'Firefly Swarm')],
            ], 'EffortStyle'),
            RS('effortMemory', onOffStr, 'EffortMemory'),
            RS('omniModule', onOffStr, 'Omni'),
            RS('linkTarget', [['builtin', U('optLinkBuiltin')], ['external', U('optLinkExternal')]]),
            RS('sidebarStudio', onOffStr),
            RS('autoUpdate', onOffStr),
            RS('updateChannel', [['stable', U('optChannelStable', 'Stable')], ['beta', U('optChannelBeta', 'Beta')]]),
          ]) rowDefs[r.key] = r;

          const groups = [
            { id: 'appearance', title: U('grpAppearance'), keys: ['palette', 'lightPreset', 'accentTone', 'cornerStyle', 'ambientIntensity', 'motionLevel', 'targetFps', 'homeLayout', 'homeRipple', 'logoInk', 'language', 'hostLocalization'] },
            { id: 'interaction', title: U('grpInteraction'), keys: ['composerRestyle', 'placeholderStyle', 'smoothCaret', 'scrollBottomMotion', 'contextMenu', 'codeFont', 'codeLigatures', 'mascot', 'sidebarRestyle', 'sidebarCompact', 'sidebarNavFold'] },
            { id: 'thought', title: U('grpThought'), keys: ['thoughtTranslate', 'thoughtTrigger', 'thoughtView'] },
            { id: 'modules', title: U('groupModules'), keys: ['telemetryModule', 'effortSliderModule', 'effortSliderStyle', 'effortMemory', 'omniModule', 'linkTarget'] },
            { id: 'beta', title: U('grpBeta'), keys: ['sidebarStudio'] },
          ];

          const buildRow = (r) => {
            const row = mkEl('div');
            sa(row, 'data-ag-cs-row', r.key);
            const tSpan = mkEl('span', '', r.title);
            sa(tSpan, 'data-k', 't');
            const dSpan = mkEl('span', 'whitespace-pre-wrap', r.desc);
            sa(dSpan, 'data-k', 'd');
            const textCol = ap(mkEl('div', 'flex-1'), ap(mkEl('div', 'ag-cs-settings-title-line'), tSpan), dSpan);

            const group = mkEl('div', 'ag-cs-seg-group');
            sa(group, 'role', 'group');
            const curVal = effVal(r.key, lang);
            const isSwitch =
              r.key !== 'sidebarNavFold' &&
              r.opts.length === 2 &&
              ((r.opts[0][0] === true && r.opts[1][0] === false) || (r.opts[0][0] === 'on' && r.opts[1][0] === 'off'));
            if (isSwitch) {
              sa(group, 'data-ui-kind', 'switch');
              sa(group, 'data-switch-on', isSwitchValOn(curVal) ? '1' : '0');
              const thumb = mkEl('span', 'ag-cs-switch-thumb');
              sa(thumb, 'aria-hidden', 'true');
              ap(group, thumb);
            }
            for (const [val, lbl] of r.opts) {
              const valJson = JSON.stringify(val);
              const isTone = r.key === 'accentTone';
              const b = mkB(BTN, isTone ? undefined : lbl, 'data-ag-cs-key', r.key);
              if (isTone) {
                const dot = mkEl('span', 'ag-cs-tone-dot');
                sa(dot, 'data-tone', val);
                sa(dot, 'aria-hidden', 'true');
                ap(b, dot, mkEl('span', '', lbl));
              }
              sa(b, 'data-ag-cs-val', valJson);
              const act = Boolean(matchBtn(r.key, valJson, curVal));
              b.__agOn = act;
              sa(b, 'aria-pressed', act);
              if (act) sa(b, 'data-pressed');
              if (isSwitch) {
                b.tabIndex = act ? -1 : 0;
                sa(b, 'tabindex', act ? '-1' : '0');
              }
              on(b, 'click', (ev) => {
                if (ev && typeof ev === 'object' && handledGroupClicks) handledGroupClicks.add(ev);
                const prevBtn = Array.from(group.children).find((s) => s.tagName === 'BUTTON' && (ga(s, 'aria-pressed') === 'true' || s.hasAttribute('data-pressed')));
                if (prevBtn === b && matchBtn(r.key, valJson, effVal(r.key, getLang()))) return;
                // Read-then-Write: 在任何 DOM 写入与 saveSetting 之前仅读取当前行的 prevBtn 与 b，其余 29 行 0 次回流！
                const needGlide = !isSwitch && !!(prevBtn && prevBtn !== b && typeof runSettingsGroupGlide === 'function');
                const prevRect = needGlide ? rc(prevBtn) : null;
                const nextRect = needGlide ? rc(b) : null;
                let nextFocusBtn = null;
                for (const sib of group.children) {
                  if (sib.tagName !== 'BUTTON') continue;
                  const isCur = sib === b;
                  sib.__agOn = isCur;
                  sa(sib, 'aria-pressed', isCur);
                  if (isCur) sa(sib, 'data-pressed');
                  else ra(sib, 'data-pressed');
                  if (isSwitch) {
                    sib.tabIndex = isCur ? -1 : 0;
                    sa(sib, 'tabindex', isCur ? '-1' : '0');
                    if (!isCur) nextFocusBtn = sib;
                  }
                }
                if (isSwitch) {
                  sa(group, 'data-switch-on', isSwitchValOn(val) ? '1' : '0');
                  if (nextFocusBtn && (doc.activeElement === b || ev?.detail === 0)) {
                    try { nextFocusBtn.focus?.(); } catch {}
                  }
                }
                saveSetting(r.key, val);
                if (r.key === 'thoughtTranslate') {
                  mountThoughtUiIfReady();
                  getThoughtUiHandle()?.onModeSwitched?.(val);
                }
                if (r.key === 'thoughtView') getThoughtUiHandle()?.onViewSwitched?.(val);
                if (r.key === 'updateChannel' && applyUpdateViewRef) {
                  void invokePrismRepoAction('update-status', { version, channel: val }).then((st) => st && applyUpdateViewRef(st)).catch(() => {});
                }
                const lNow = getLang();
                syncRootState(sec, lNow, uiText(lNow));
                if (needGlide) runSettingsGroupGlide(group, prevBtn, b, prevRect, nextRect);
              });
              ap(group, b);
            }
            const rowBody = ap(row, ap(mkEl('div', 'py-2'), textCol, ap(mkEl('div', 'shrink-0'), group)));
            if (r.key === 'effortSliderStyle') {
              const pBox = mkEl('div', 'ag-cs-effort-preview');
              sa(pBox, 'data-testid', 'prism-effort-style-preview');
              const pHead = mkEl('div', 'ag-cs-ep-head');
              const pStyleLbl = mkEl('span', 'ag-cs-ep-style');
              const pTierLbl = mkEl('span', 'ag-cs-ep-tier', 'High');
              ap(pHead, pStyleLbl, pTierLbl);

              const pTrk = mkEl('div', 'ag-cs-ep-track');
              const pCv = mkEl('canvas', 'ag-cs-ep-cv');
              pCv.width = 320;
              pCv.height = 34;
              const pClassic = mkEl('div', 'ag-cs-ep-classic');
              const pFill = mkEl('div', 'ag-cs-ep-fill');
              const pKnob = mkEl('div', 'ag-cs-ep-knob');
              ap(pClassic, pFill, pKnob);
              ap(pTrk, pCv, pClassic);

              const pTiers = mkEl('div', 'ag-cs-ep-tiers');
              const epLabels = ['Low', 'Medium', 'High', 'Extra'];
              const epColors = ['#7dd3fc', '#60a5fa', '#a855f7', '#f59e0b'];
              let epTier = 2, epPos = 2 / 3, epTgt = 2 / 3, epVel = 0, epHover = null, epRaf = 0, epLast = 0, epDrag = false, epCtx = null;
              const tierBtns = epLabels.map((lbl, idx) => {
                const tb = mkB('ag-cs-ep-btn', lbl);
                on(tb, 'click', (ev) => {
                  ev?.stopPropagation?.();
                  epTier = idx;
                  epTgt = idx / 3;
                  syncPreview();
                });
                ap(pTiers, tb);
                return tb;
              });

              const styleNames = new Map(r.opts);
              const paintPreviewFrame = (nowMs) => {
                const lCur = getLang();
                const curSt = epHover || effVal('effortSliderStyle', lCur) || 'classic';
                const isClassic = curSt === 'classic';
                pStyleLbl[K_TC] = styleNames.get(curSt) || curSt;
                pTierLbl[K_TC] = epLabels[epTier];
                if (pTierLbl.style) pTierLbl.style.color = epColors[epTier];
                tierBtns.forEach((tb, idx) => sa(tb, 'data-active', idx === epTier ? '1' : '0'));

                if (pClassic.style) pClassic.style.display = isClassic ? 'block' : 'none';
                if (pCv.style) pCv.style.display = isClassic ? 'none' : 'block';
                const pct = Math.max(0, Math.min(1, epPos));
                if (isClassic) {
                  const pctStr = `${(10 + pct * 80).toFixed(1)}%`;
                  if (pFill.style) pFill.style.width = pctStr;
                  if (pKnob.style) pKnob.style.left = pctStr;
                } else {
                  const w = pTrk.clientWidth || 320, h = pTrk.clientHeight || 34;
                  const win = getWin();
                  const dpr = Math.max(1, Math.min(2, Number(win?.devicePixelRatio) || 1));
                  const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
                  if (pCv.width !== bw) pCv.width = bw;
                  if (pCv.height !== bh) pCv.height = bh;
                  const ctx = epCtx || (typeof pCv.getContext === 'function' ? (epCtx = pCv.getContext('2d')) : null);
                  const paintFn = win?.AntigravityCodexEffortSlider?.paintFxSlider || G.AntigravityCodexEffortSlider?.paintFxSlider;
                  if (ctx && typeof ctx.beginPath === 'function' && typeof paintFn === 'function') {
                    ctx.setTransform?.(dpr, 0, 0, dpr, 0, 0);
                    paintFn(ctx, curSt, w, h, pct, epVel, 4, effVal('effortSliderModule', lCur) === 'off', (nowMs || Date.now()) * 0.001, effVal('accentTone', lCur) || 'follow');
                  }
                }
              };

              const shouldAnimate = () => {
                const win = getWin();
                if (!pBox[K_IC] || ga(sec, 'data-open') !== '1' || doc.hidden) return false;
                if (typeof pBox.closest === 'function' && pBox.closest('[hidden]')) return false;
                const lCur = getLang();
                const curSt = epHover || effVal('effortSliderStyle', lCur) || 'classic';
                if (effVal('effortSliderModule', lCur) === 'off') return false;
                if (effVal('motionLevel', lCur) === 'off') return Math.abs(epTgt - epPos) > 0.002;
                return curSt !== 'classic' || Math.abs(epTgt - epPos) > 0.002;
              };

              const stopPreviewRaf = () => {
                const win = getWin();
                if (epRaf && typeof win?.cancelAnimationFrame === 'function') win.cancelAnimationFrame(epRaf);
                epRaf = 0;
                epLast = 0;
              };

              const stepPreview = (now) => {
                epRaf = 0;
                if (!pBox[K_IC]) return;
                const dt = epLast > 0 ? Math.min(0.05, Math.max(0.001, (now - epLast) / 1000)) : 0.016;
                epLast = now;
                if (!epDrag) {
                  const diff = epTgt - epPos;
                  epVel = (epVel + diff * 180 * dt) * Math.exp(-12 * dt);
                  epPos += epVel * dt;
                  if (Math.abs(diff) < 0.002 && Math.abs(epVel) < 0.005) { epPos = epTgt; epVel = 0; }
                }
                paintPreviewFrame(now);
                if (shouldAnimate()) {
                  const win = getWin();
                  if (typeof win?.requestAnimationFrame === 'function') epRaf = win.requestAnimationFrame(stepPreview);
                }
              };

              const syncPreview = () => {
                paintPreviewFrame(typeof performance !== 'undefined' ? performance.now() : Date.now());
                const win = getWin();
                if (shouldAnimate() && !epRaf && typeof win?.requestAnimationFrame === 'function') {
                  epRaf = win.requestAnimationFrame(stepPreview);
                } else if (!shouldAnimate()) {
                  stopPreviewRaf();
                }
              };

              const setFromX = (clientX) => {
                const rct = rc(pTrk);
                const left = rct?.left || 0, w = rct?.width || 320;
                const curSt = epHover || effVal('effortSliderStyle', getLang()) || 'classic';
                const u = curSt === 'orbital'
                  ? Math.max(0, Math.min(1, (clientX - left - 48) / Math.max(20, w - 62)))
                  : Math.max(0, Math.min(1, (clientX - left - 16) / Math.max(20, w - 32)));
                epVel = (u - epPos) * 14;
                epPos = u;
                epTgt = u;
                epTier = Math.round(u * 3);
                syncPreview();
              };

              on(pTrk, 'pointerdown', (ev) => {
                ev?.stopPropagation?.();
                epDrag = true;
                try { pTrk.setPointerCapture?.(ev.pointerId); } catch {}
                setFromX(ev.clientX || 0);
              });
              on(pTrk, 'pointermove', (ev) => { if (epDrag) setFromX(ev.clientX || 0); });
              const endTrkDrag = () => {
                if (!epDrag) return;
                epDrag = false;
                epTier = Math.round(epPos * 3);
                epTgt = epTier / 3;
                syncPreview();
              };
              on(pTrk, 'pointerup', endTrkDrag);
              on(pTrk, 'pointercancel', endTrkDrag);

              for (const segBtn of group.children) {
                if (segBtn.tagName !== 'BUTTON') continue;
                on(segBtn, 'pointerenter', () => {
                  try { epHover = JSON.parse(ga(segBtn, 'data-ag-cs-val')); } catch {}
                  syncPreview();
                });
              }
              on(group, 'pointerleave', () => {
                if (epHover !== null) { epHover = null; syncPreview(); }
              });

              sec.__prismSyncEffortPreview = syncPreview;
              sec.__prismDestroyEffortPreview = stopPreviewRaf;
              ap(pBox, pHead, pTrk, pTiers);
              ap(rowBody, pBox);
            }
            return rowBody;
          };

          const topDeck = mkEl('div', 'ag-cs-settings-topdeck');
          sa(topDeck, 'data-ag-cs-topdeck', '1');
          const presetPills = mkEl('div', 'ag-cs-preset-pills');
          for (const [pid, plbl] of [['ultra', U('presetUltra', 'Full Optical')], ['focus', U('presetFocus', 'Deep Focus')], ['eco', U('presetEco', 'Silent Eco')]]) {
            const pb = mkB('ag-cs-preset-btn', plbl, 'data-ag-cs-preset', pid);
            onClk(pb, () => {
              applyBatch({ ...SCENE_PRESETS[pid] });
              const lNow = getLang();
              runGuardedMut(() => syncRootState(sec, lNow, uiText(lNow)));
            });
            ap(presetPills, pb);
          }
          ap(topDeck, ap(mkEl('div', 'ag-cs-preset-row'), mkEl('span', 'ag-cs-preset-label', U('presetBarLabel', 'Scene Presets')), presetPills));

          const subTabBar = mkEl('div', 'ag-cs-subtabs');
          sa(subTabBar, 'role', 'tablist');
          const subTabBtns = [];
          const groupElsById = new Map();
          const applySubTab = (sid) => {
            activeSubTab = sid;
            writeStore(STORAGE_SETTINGS_SUBTAB_KEY, sid);
            for (const sb of subTabBtns) sa(sb, 'aria-selected', ga(sb, 'data-ag-cs-subtab') === sid);
            for (const [gid, gel] of groupElsById.entries()) setVis(gel, sid === 'all' || sid === gid);
            try { sec.__prismSyncEffortPreview?.(); } catch {}
          };
          for (const [sid, slbl] of [
            ['appearance', U('subTabAppearance', 'Appearance')],
            ['interaction', U('subTabInteraction', 'Workspace')],
            ['thought', U('subTabThought', 'Thought')],
            ['modules', U('subTabModules', 'Modules')],
            ['beta', U('subTabBeta', 'Beta')],
            ['about', U('subTabAbout', 'Config & About')],
            ['all', U('subTabAll', 'All')],
          ]) {
            const sb = mkB('ag-cs-subtab-btn', slbl, 'data-ag-cs-subtab', sid);
            sa(sb, 'role', 'tab');
            sa(sb, 'aria-selected', activeSubTab === sid);
            onClk(sb, () => runGuardedMut(() => applySubTab(sid)));
            subTabBtns.push(sb);
            ap(subTabBar, sb);
          }
          const fileInput = mkEl('input');
          fileInput.type = 'file';
          sa(fileInput, 'accept', '.json,application/json');
          setVis(fileInput, false);
          ap(topDeck, subTabBar, fileInput);
          ap(foldBody, topDeck);

          const groupsWrap = mkEl('div', 'ag-cs-settings-groups');
          for (const grp of groups) {
            const grpEl = mkEl('div', 'ag-cs-settings-group');
            sa(grpEl, 'data-ag-cs-group', grp.id);
            groupElsById.set(grp.id, grpEl);
            const list = mkEl('div', CARD_CLS);
            for (const k of grp.keys) if (rowDefs[k]) ap(list, buildRow(rowDefs[k]));
            if (grp.id === 'thought') {
              thoughtListEl = list;
            }
            ap(grpEl, mkEl('div', 'ag-cs-settings-subhead', grp.title));
            if (grp.id === 'beta') {
              const bNote = mkEl('div', 'ag-cs-beta-notice', U('betaPlaceholderNotice', 'Notice: Beta items are mostly placeholders and not ready for normal use.'));
              sa(bNote, 'data-testid', 'prism-beta-notice');
              ap(grpEl, bNote);
            }
            ap(grpEl, list);
            if (grp.id === 'beta') {
              wpSlot = mkEl('div');
              sa(wpSlot, 'data-testid', K_WP);
              setVis(wpSlot, false);
              ap(grpEl, wpSlot);
            }
            ap(groupsWrap, grpEl);
          }

          const aboutGrp = mkEl('div', 'ag-cs-settings-group');
          sa(aboutGrp, 'data-ag-cs-group', 'about');
          groupElsById.set('about', aboutGrp);

          const aboutBox = mkEl('div', 'ag-cs-about-box');
          sa(aboutBox, 'data-ag-cs-about', '1');
          const mkChip = (txt, attr) => {
            const c = mkEl('span', 'ag-cs-repo-chip', txt);
            sa(c, attr);
            sa(c, 'data-status', 'idle');
            return c;
          };
          const setChip = (c, st, txt) => {
            sa(c, 'data-status', st);
            c[K_TC] = txt;
          };

          const repoChip = mkChip(U('aboutRepoSyncTitle', 'Git'), 'data-ag-cs-repo-status');
          const repoInfo = ap(mkEl('div', 'ag-cs-about-repo-info'), mkEl('span', 'font-medium text-foreground', `Obsidian Prism v${version}`), repoChip);
          const syncBtn = mkB('ag-cs-repo-sync-btn', U('aboutRepoSyncBtn', 'Sync'), 'data-ag-cs-repo-sync');

          let repoProbedOnce = false;
          let repoSyncBusy = false;
          const applyRepoStatusView = (res, isPull) => {
            if (!repoChip[K_IC]) return;
            runGuardedMut(() => {
              const branch = res?.branch || 'local';
              const hash = res?.shortHash || (res?.commit ? String(res.commit).slice(0, 7) : '');
              const ref = hash && hash !== branch ? `${branch} @ ${hash}` : branch;
              const hasRemote = !!(res && !res.noRemote && res.hasRemote !== false && res.remoteUrl);
              if (!hasRemote) setChip(repoChip, 'warn', `${ref} · ${U('aboutRepoNoRemote', 'Local')}`);
              else if (isPull && res?.updated) setChip(repoChip, 'updated', `${ref} · ${U('aboutRepoUpdated', 'Updated')}`);
              else if (res?.ok === false && res?.error) setChip(repoChip, 'error', `${ref} · ${res.error}`);
              else setChip(repoChip, 'ok', `${ref} · ${U('aboutRepoUpToDate', 'OK')}`);
            });
          };
          const probeRepoStatusSilently = () => {
            if (repoProbedOnce || repoSyncBusy) return;
            repoProbedOnce = true;
            void invokePrismRepoAction('status', version).then((st) => st && applyRepoStatusView(st, false));
            probeStorageSilently();
          };
          probeRepoRef = probeRepoStatusSilently;
          onClk(syncBtn, () => {
            if (repoSyncBusy) return;
            repoSyncBusy = true;
            repoProbedOnce = true;
            runGuardedMut(() => {
              syncBtn.disabled = true;
              setChip(repoChip, 'idle', U('aboutRepoChecking', '...'));
            });
            void invokePrismRepoAction('status', version)
              .then((st) => {
                if (!(st && !st.noRemote && st.hasRemote !== false && st.remoteUrl)) {
                  applyRepoStatusView(st || { noRemote: true, branch: 'local' }, false);
                  return null;
                }
                return invokePrismRepoAction('pull', version).then((p) => {
                  applyRepoStatusView({ ...st, ...p }, true);
                  return p;
                });
              })
              .finally(() => {
                repoSyncBusy = false;
                runGuardedMut(() => { if (syncBtn[K_IC]) syncBtn.disabled = false; });
              });
          });
          ap(aboutBox, ap(mkEl('div', 'ag-cs-about-repo-row'), repoInfo, syncBtn));

          const updRow = mkEl('div', 'ag-cs-about-repo-row');
          sa(updRow, 'data-ag-cs-update-row', '1');
          const updChip = mkChip(fmtTpl(U('updUpToDate', 'v{0}'), [version]), 'data-ag-cs-update-status');
          const updLinkSlot = mkEl('span', 'ag-cs-update-link-slot');
          const checkUpdBtn = mkB('ag-cs-repo-sync-btn', U('updCheckBtn', 'Check Update'), 'data-ag-cs-update-check');
          const applyUpdBtn = mkB('ag-cs-repo-sync-btn', U('updApplyBtn', 'Update Now'), 'data-ag-cs-update-apply');
          setVis(applyUpdBtn, false);
          ap(aboutBox, ap(updRow, ap(mkEl('div', 'ag-cs-about-repo-info'), updChip, updLinkSlot), ap(mkEl('div', 'ag-cs-thought-btn-group'), checkUpdBtn, applyUpdBtn)));

          const updNote = mkEl('p', 'ag-cs-thought-hint ag-cs-update-note', U('updHotNote'));
          sa(updNote, 'data-ag-cs-update-note', '1');
          ap(aboutBox, updNote, ap(mkEl('div', CARD_CLS), buildRow(rowDefs.autoUpdate), buildRow(rowDefs.updateChannel)));

          let updBusy = false;
          const isSafeGhUrl = (u) => typeof u === 'string' && /^https:\/\/github\.com\/xnnnc\/GravityPrism(?:\/|$)/i.test(u.trim());
          const applyUpdateView = (st) => {
            if (!updChip[K_IC] || !st || st.offline || st.timeout) return;
            const u = uiText(getLang()) || ui;
            runGuardedMut(() => {
              updLinkSlot[K_TC] = '';
              if (st.applied || st.hotReloaded || st.hotReloadExpected) {
                setVis(updBadge, false);
                setVis(applyUpdBtn, false);
                setChip(updChip, 'updated', u.updHotDone || 'Updated');
                return;
              }
              if (st.hasUpdate) {
                const tv = st.latestVersion || '';
                updBadge[K_TC] = `v${tv}`;
                setVis(updBadge, true);
                sa(updChip, 'data-status', 'warn');
                if (st.manualRequired) {
                  updChip[K_TC] = fmtTpl(u.updManualHint || 'v{0}', [tv]);
                  setVis(applyUpdBtn, false);
                  const href = isSafeGhUrl(st.downloadUrl) ? st.downloadUrl : isSafeGhUrl(st.releaseUrl) ? st.releaseUrl : '';
                  if (href) {
                    const a = mkEl('a', '', `v${tv} ↗`);
                    sa(a, 'href', href);
                    sa(a, 'target', '_blank');
                    sa(a, 'rel', 'noopener noreferrer');
                    sa(a, 'data-ag-cs-update-link', '1');
                    ap(updLinkSlot, a);
                  }
                } else {
                  updChip[K_TC] = fmtTpl(u.updAvailTpl || 'v{0}', [tv]);
                  setVis(applyUpdBtn, true);
                }
                return;
              }
              setVis(updBadge, false);
              setVis(applyUpdBtn, false);
              if (st.ok === false && st.error) setChip(updChip, 'error', st.error);
              else setChip(updChip, 'ok', fmtTpl(u.updUpToDate || 'v{0}', [st.currentVersion || version]));
            });
          };
          applyUpdateViewRef = applyUpdateView;
          onClk(checkUpdBtn, () => {
            if (updBusy) return;
            updBusy = true;
            runGuardedMut(() => {
              checkUpdBtn.disabled = true;
              setChip(updChip, 'idle', U('aboutRepoChecking', '...'));
            });
            void invokePrismRepoAction('check-update', version, { force: true, manual: true })
              .then((st) => st && applyUpdateView(st))
              .catch((e) => applyUpdateView({ ok: false, error: String(e?.message || e) }))
              .finally(() => {
                updBusy = false;
                runGuardedMut(() => { if (checkUpdBtn[K_IC]) checkUpdBtn.disabled = false; });
              });
          });
          onClk(applyUpdBtn, () => {
            if (updBusy) return;
            updBusy = true;
            runGuardedMut(() => {
              applyUpdBtn.disabled = true;
              checkUpdBtn.disabled = true;
              setChip(updChip, 'idle', (uiText(getLang()) || ui).updUpdating || '...');
            });
            void invokePrismRepoAction('apply-update', version, { confirm: true })
              .then((st) => st && applyUpdateView(st))
              .catch((e) => applyUpdateView({ ok: false, error: String(e?.message || e) }))
              .finally(() => {
                updBusy = false;
                runGuardedMut(() => {
                  if (applyUpdBtn[K_IC]) applyUpdBtn.disabled = false;
                  if (checkUpdBtn[K_IC]) checkUpdBtn.disabled = false;
                });
              });
          });

          const storageChip = mkChip(U('storageHealthIdle', 'DB'), 'data-ag-cs-storage-status');
          const archiveBtn = mkB('ag-cs-repo-sync-btn', U('storageArchiveBtn', 'Archive'), 'data-ag-cs-storage-archive');
          let storageBusy = false;
          const applyStorageView = (st, prepared) => {
            if (!storageChip[K_IC] || !st || st.offline || st.timeout) return;
            const u = uiText(getLang()) || ui;
            runGuardedMut(() => {
              if (st.ok === false && st.error) {
                setChip(storageChip, 'error', st.error);
                return;
              }
              const fmtMb = (v) => (Number(v) >= 1024 ? `${(Number(v) / 1024).toFixed(2)} GB` : `${Math.round(Number(v) || 0)} MB`);
              if (prepared && st.archiveScriptPath) {
                setChip(storageChip, 'updated', fmtTpl(u.storageReadyTpl || '{0}/{1}:{2}', [st.archivableSubagentCount || 0, fmtMb(st.archivableSubagentMb), st.archiveScriptPath]));
                try { navigator?.clipboard?.writeText?.(st.archiveScriptPath)?.catch?.(() => {}); } catch {}
              } else {
                setChip(
                  storageChip,
                  st.warn ? 'warn' : 'ok',
                  fmtTpl(u.storageSummaryTpl || '{0}({1}/{2}/{3}){4}', [
                    fmtMb(st.totalMb),
                    st.mainCount || 0,
                    st.subagentCount || 0,
                    fmtMb(st.subagentMb),
                    st.warn ? u.storageWarn || '!' : u.storageOk || 'OK',
                  ])
                );
              };
            });
          };
          const probeStorageSilently = () => {
            if (storageBusy) return;
            void invokePrismRepoAction('storage-health', version)
              .then((st) => st && applyStorageView(st, false))
              .catch((err) => applyStorageView({ ok: false, error: String(err?.message || err) }, false));
          };
          onClk(archiveBtn, () => {
            if (storageBusy) return;
            storageBusy = true;
            runGuardedMut(() => { archiveBtn.disabled = true; });
            void invokePrismRepoAction('prepare-archive', version)
              .then((st) => st && applyStorageView(st, true))
              .catch((err) => applyStorageView({ ok: false, error: String(err?.message || err) }, false))
              .finally(() => {
                storageBusy = false;
                runGuardedMut(() => { if (archiveBtn[K_IC]) archiveBtn.disabled = false; });
              });
          });
          ap(aboutBox, ap(mkEl('div', 'ag-cs-about-repo-row'), ap(mkEl('div', 'ag-cs-about-repo-info'), mkEl('span', 'font-medium text-foreground', U('storageHealthTitle', 'DB')), storageChip), archiveBtn));

          const creditsGrid = mkEl('div', 'ag-cs-about-credits');
          for (const item of UPSTREAM_CREDITS) {
            const a = mkEl('a');
            sa(a, 'href', item.url);
            sa(a, 'target', '_blank');
            sa(a, 'rel', 'noopener noreferrer');
            sa(a, 'data-ag-cs-credit', item.repo);
            ap(creditsGrid, ap(a, mkEl('span', 'truncate', item.repo), mkEl('span', 'opacity-75 text-[10px] shrink-0', `${item.meta} ↗`)));
          }
          ap(
            aboutBox,
            mkEl('div', 'ag-cs-about-credits-title', U('aboutCreditsTitle', 'Credits')),
            creditsGrid,
            ap(mkEl('details', 'ag-cs-about-license'), mkEl('summary', '', U('aboutLicenseTitle', 'GPL-3.0')), mkEl('pre', 'ag-cs-license-pre', LICENSE_SUMMARY_TEXT))
          );

          const mkTB = (txt, attr, danger) => {
            const b = mkB('ag-cs-thought-btn', txt, attr);
            if (danger) sa(b, 'data-danger', '1');
            return b;
          };
          const uChip = mkEl('span', 'ag-cs-repo-chip', '');
          setVis(uChip, false);
          sa(uChip, 'data-ag-cs-uninstall-status');
          const uBtn = mkTB(U('uninstallBtn', 'Uninstall'), 'data-ag-cs-uninstall', 1);
          ap(aboutBox, ap(mkEl('div', 'ag-cs-about-repo-row'), ap(mkEl('div', 'ag-cs-about-repo-info'), uChip), uBtn));

          const uBox = mkEl('div', 'ag-cs-thought-cfg-box');
          setVis(uBox, false);
          sa(uBox, 'data-ag-cs-uninstall-box', '1');
          const uCb = mkEl('input');
          uCb.type = 'checkbox';
          uCb.checked = false;
          sa(uCb, 'data-ag-cs-uninstall-purge', '1');
          const uCancel = mkTB(U('uninstallCancelBtn', 'Cancel'), 'data-ag-cs-uninstall-cancel');
          const uConfirm = mkTB(U('uninstallConfirmBtn', 'Confirm'), 'data-ag-cs-uninstall-confirm', 1);
          ap(
            aboutBox,
            ap(
              uBox,
              ap(mkEl('label', 'ag-cs-about-repo-info'), uCb, mkEl('span', '', U('uninstallPurge', 'Purge'))),
              mkEl('p', 'ag-cs-thought-hint', U('uninstallKeepNote')),
              ap(mkEl('div', 'ag-cs-thought-actions'), ap(mkEl('div', 'ag-cs-thought-btn-group'), uCancel, uConfirm))
            ),
            mkEl('p', 'ag-cs-about-disclaimer', U('aboutDisclaimer', 'Obsidian Prism is an independent open-source project and is not affiliated with or endorsed by Google LLC.'))
          );
          ap(groupsWrap, ap(aboutGrp, mkEl('div', 'ag-cs-settings-subhead', U('aboutGroupTitle', 'About')), aboutBox));
          ap(foldBody, groupsWrap);
          mountThoughtUiIfReady();

          let uBusy = false;
          onClk(uBtn, () => runGuardedMut(() => setVis(uBox, !!(uBox.hidden))));
          onClk(uCancel, () => runGuardedMut(() => setVis(uBox, false)));
          onClk(uConfirm, () => {
            if (uBusy) return;
            uBusy = true;
            const purgeData = !!(uCb.checked);
            if (purgeData) clearPrismLocalStorage();
            runGuardedMut(() => { uConfirm.disabled = true; });
            void invokePrismRepoAction('uninstall', version, { confirm: true, purgeData })
              .then((r) => {
                if (!uChip[K_IC]) return;
                const u = uiText(getLang()) || ui;
                runGuardedMut(() => {
                  setVis(uChip, true);
                  if (r && r.ok !== false && !r.offline) {
                    setChip(uChip, 'ok', u.uninstallDone || 'OK');
                    setVis(uBox, false);
                  } else {
                    setChip(uChip, 'error', r?.error || 'Err');
                  }
                });
              })
              .finally(() => {
                uBusy = false;
                runGuardedMut(() => { if (uConfirm[K_IC]) uConfirm.disabled = false; });
              });
          });

          const cfgFooter = mkEl('div', 'ag-cs-cfg-footer');
          sa(cfgFooter, 'data-ag-cs-cfg-footer', '1');
          const cfgHint = mkEl('span', 'ag-cs-cfg-hint', U('cfgToolbarHint'));
          sa(cfgHint, 'data-ag-cs-cfg-status');
          const setCfgStatus = (msg, tone = '') =>
            runGuardedMut(() => {
              cfgHint[K_TC] = msg;
              if (tone) sa(cfgHint, 'data-tone', tone);
              else ra(cfgHint, 'data-tone');
            });
          if (pendingCfgToast && pendingCfgToast.exp > Date.now()) {
            const toastMsg = (pendingCfgToast.key && ui[pendingCfgToast.key]) || pendingCfgToast.fallback || '';
            const toastTone = pendingCfgToast.tone || 'ok';
            pendingCfgToast = null;
            if (toastMsg) setCfgStatus(toastMsg, toastTone);
          } else {
            pendingCfgToast = null;
          }

          const exportBtn = mkB('ag-cs-cfg-btn', U('cfgExportBtn', 'Export JSON'), 'data-ag-cs-cfg-action', 'export');
          onClk(exportBtn, async () => {
            const lNow = getLang(), uNow = uiText(lNow), cur = {};
            for (const k of SCHEMA_KEYS) cur[k] = effVal(k, lNow);
            const win = getWin();
            const rawThought = await Promise.resolve(
              win?.__agPrismThought?.getConfig ? win.__agPrismThought.getConfig() : win?.__agPrismThoughtBridge?.call?.({ action: 'get-config' })
            ).catch(() => null);
            const jsonStr = JSON.stringify(buildSanitizedConfigExport(cur, rawThought || null, version), null, 2);
            try {
              if (typeof Blob !== 'undefined' && typeof URL !== 'undefined' && isFn(URL.createObjectURL)) {
                const url = URL.createObjectURL(new Blob([jsonStr], { type: 'application/json;charset=utf-8' }));
                const dl = mkEl('a');
                dl.href = url;
                dl.download = `obsidian-prism-settings-v${version}.json`;
                dl.click?.();
                setTimeout(() => URL.revokeObjectURL(url), 1500);
              } else win?.navigator?.clipboard?.writeText?.(jsonStr);
            } catch {
              try { win?.navigator?.clipboard?.writeText?.(jsonStr); } catch {}
            }
            setCfgStatus(uNow.cfgExportOk || 'OK', 'ok');
          });

          const handleImportRaw = (rawText) => {
            const lNow = getLang(), uNow = uiText(lNow), res = validateImportedConfigJson(rawText);
            if (!res.ok) {
              setCfgStatus(uNow.cfgImportErr || 'Invalid JSON', 'err');
              return false;
            }
            pendingCfgToast = { key: 'cfgImportOk', fallback: 'OK', tone: 'ok', exp: Date.now() + 2500 };
            if (O.keys(res.settings).length > 0) {
              applyBatch(res.settings);
              if (res.settings.thoughtTranslate) {
                mountThoughtUiIfReady();
                getThoughtUiHandle()?.onModeSwitched?.(res.settings.thoughtTranslate);
              }
              if (res.settings.thoughtView) getThoughtUiHandle()?.onViewSwitched?.(res.settings.thoughtView);
            }
            if (res.thought) {
              const win = getWin();
              try {
                void Promise.resolve(
                  win?.__agPrismThought?.saveConfig
                    ? win.__agPrismThought.saveConfig(res.thought)
                    : win?.__agPrismThoughtBridge?.call?.({ action: 'save-config', ...res.thought })
                )
                  .then(() => {
                    const liveTh = doc.getElementById(SETTINGS_SEC_ID)?.__prismThoughtUiHandle || getThoughtUiHandle();
                    liveTh?.reloadConfig?.();
                    liveTh?.ensureLoaded?.(true);
                  })
                  .catch(() => {});
              } catch {}
              getThoughtUiHandle()?.reloadConfig?.();
            }
            const rl = getLang(), ru = uiText(rl);
            if (sec[K_IC]) {
              pendingCfgToast = null;
              runGuardedMut(() => syncRootState(sec, rl, ru));
              setCfgStatus(ru.cfgImportOk || 'OK', 'ok');
            }
            return true;
          };
          on(fileInput, 'change', () => {
            const f = fileInput.files?.[0];
            if (!f) return;
            if (isFn(f.text)) void f.text().then(handleImportRaw).catch(() => handleImportRaw(''));
            else if (isFn(FileReader)) {
              const rd = new FileReader();
              rd.onload = () => handleImportRaw(String(rd.result || ''));
              rd.readAsText(f);
            }
            fileInput.value = '';
          });

          const importBtn = mkB('ag-cs-cfg-btn', U('cfgImportBtn', 'Import JSON'), 'data-ag-cs-cfg-action', 'import');
          onClk(importBtn, () => fileInput.click?.());

          const resetBtn = mkB('ag-cs-cfg-btn', U('cfgResetBtn', 'Reset Defaults'), 'data-ag-cs-cfg-action', 'reset');
          onClk(resetBtn, () => {
            const defs = getDefaultSettingsPatch();
            pendingCfgToast = { key: 'cfgResetOk', fallback: 'OK', tone: 'ok', exp: Date.now() + 2500 };
            applyBatch(defs);
            const curTh = getThoughtUiHandle();
            if (curTh) {
              curTh.onModeSwitched?.(defs.thoughtTranslate);
              curTh.onViewSwitched?.(defs.thoughtView);
            }
            const rl = getLang(), ru = uiText(rl);
            if (sec[K_IC]) {
              pendingCfgToast = null;
              runGuardedMut(() => syncRootState(sec, rl, ru));
              setCfgStatus(ru.cfgResetOk || 'OK', 'ok');
            }
          });

          ap(foldBody, ap(cfgFooter, ap(mkEl('div', 'ag-cs-cfg-meta'), mkEl('span', 'ag-cs-cfg-title', U('cfgToolbarTitle', 'Config')), cfgHint), ap(mkEl('div', 'ag-cs-cfg-actions'), exportBtn, importBtn, resetBtn)));

          applySubTab(activeSubTab);
          sec.__lastSyncSig = '';
          const lNow = getLang();
          syncRootState(sec, lNow, uiText(lNow));
          if (cachedUpdStatus) applyUpdateView(cachedUpdStatus);
        });
      };

      sec.__ensureFoldBody = ensureFoldBodyBuilt;

      on(foldHead, 'click', (ev) => {
        ev?.preventDefault?.();
        const nextOpen = ga(sec, 'data-open') !== '1';
        const openStr = nextOpen ? '1' : '0';
        writeStore(STORAGE_SETTINGS_OPEN_KEY, openStr);
        if (nextOpen) ensureFoldBodyBuilt();
        runGuardedMut(() => {
          sa(sec, 'data-open', openStr);
          sa(sec, 'data-ag-cs-open', openStr);
          const clOp = nextOpen ? 'add' : 'remove';
          sec[K_CL]?.[clOp]?.('is-open');
          sa(foldHead, 'aria-expanded', nextOpen);
          sa(foldHead, 'aria-label', nextOpen ? ui.foldCollapseHint || 'Collapse' : ui.foldExpandHint || 'Expand');
          sa(foldBody, 'data-open', openStr);
          sa(foldBody, 'aria-hidden', !nextOpen);
          foldBody[K_CL]?.[clOp]?.('is-open');
        });
        try { sec.__prismSyncEffortPreview?.(); } catch {}
        if (nextOpen && probeRepoRef) probeRepoRef();
      });

      ap(anchor.parentElement, sec);
      if (initOpen || ctx.lazyFold === false || !hasMainCss) {
        ensureFoldBodyBuilt();
        if (probeRepoRef) probeRepoRef();
      } else {
        syncRootState(sec, lang, ui);
      }
      void invokePrismRepoAction('update-status', version)
        .then((st) => {
          if (!st) return;
          cachedUpdStatus = st;
          if (applyUpdateViewRef) applyUpdateViewRef(st);
          else syncFoldBadgeOnly(st);
        })
        .catch(() => {});
    });
  };

  const exportedApi = {
    SETTINGS_SEC_ID,
    PRISM_SETTINGS_SCHEMA,
    PRISM_STORAGE_KEYS,
    SCENE_PRESETS,
    UPSTREAM_CREDITS,
    getDefaultSettingsPatch,
    buildSanitizedConfigExport,
    validateImportedConfigJson,
    clearPrismLocalStorage,
    mountOrSyncSettingsSection,
  };
  if (typeof module === 'object' && module.exports) module.exports = exportedApi;
  G.__agPrismSettingsPanel = exportedApi;
})(typeof globalThis !== 'undefined' ? globalThis : window);

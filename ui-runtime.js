(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.__agCsUiMain = factory;
})(typeof globalThis !== 'undefined' ? globalThis : window, function (initialConfig) {
  const VERSION = '1.2.0';
  const D = document, W = window, GT = globalThis, ST = setTimeout, CT = clearTimeout, O = Object, AF = Array.from, SJ = JSON.stringify, LS = typeof localStorage !== 'undefined' ? localStorage : null;
  const LEGACY_API_VERSION = 3;
  const CODE_HASH = initialConfig?.codeHash || '';

  for (const k of ['__agTokenHud']) { try { W[k]?.destroy?.(); } catch {} delete W[k]; }
  const existingRuntime = W.__agPrism || W.__agClaudeStyle;
  if (existingRuntime && existingRuntime.version === VERSION && (!CODE_HASH || existingRuntime.codeHash === CODE_HASH)) {
    existingRuntime.refreshConfig(initialConfig);
    return;
  }
  if (Array.isArray(GT.__agCsCleanups)) {
    while (GT.__agCsCleanups.length) {
      const fn = GT.__agCsCleanups.pop();
      try { typeof fn === 'function' && fn(); } catch {}
    }
  }
  if (W.__agClaudeStyle === W.__agPrism) delete W.__agClaudeStyle;
  for (const k of ['__agPrism', '__agClaudeStyle', '__agCsI18n']) {
    try { W[k]?.destroy?.(); } catch {}
    delete W[k];
  }

  const usageCore = GT.__agCsUsageCore;
  const rippleCore = GT.__agCsRippleCore;
  const i18nCore = GT.__agCsI18nCore;
  const getLocalesMod = () => GT.__agCsLocales || W.__agCsLocales || null;
  const getDualMascotRig = () => GT.__agDualMascotRig || W.__agDualMascotRig || null;
  const crystalPrismCore = GT.__agCrystalPrismCore;
  const motionEngine = GT.__agMotionEngine;
  const animatedIcons = GT.__agAnimatedIcons;
  const pulseVialBridgeMod = GT.__agCsPulseVialBridge;
  const convAuraMod = GT.__agPrismConvAura;
  const smoothCaretMod = GT.__agPrismSmoothCaret;
  const getSettingsPanelMod = () => GT.__agPrismSettingsPanel || W.__agPrismSettingsPanel || null;

  // Channel 1 活跃语言迷你词典垫片：未加载按需 Settings 通道前由 bootCfg.__uiSlice 供电；全量 i18n-locales.js 就位后自动退让
  const runtimeSliceStore = { active: 'en', byLang: O.create(null) };
  const mergeRuntimeUiSlice = (payload) => {
    if (!payload || typeof payload !== 'object') return;
    if (typeof payload.active === 'string' && payload.active) runtimeSliceStore.active = payload.active;
    if (Array.isArray(payload.keys) && payload.vals && typeof payload.vals === 'object') {
      for (const [lang, arr] of O.entries(payload.vals)) {
        if (!Array.isArray(arr)) continue;
        const dst = { ...(runtimeSliceStore.byLang[lang] || {}) };
        for (let i = 0; i < payload.keys.length; i++) if (typeof arr[i] === 'string' && arr[i]) dst[payload.keys[i]] = arr[i];
        runtimeSliceStore.byLang[lang] = dst;
      }
    }
    if (payload.byLang && typeof payload.byLang === 'object') {
      for (const [k, v] of O.entries(payload.byLang)) {
        if (v && typeof v === 'object') runtimeSliceStore.byLang[k] = { ...(runtimeSliceStore.byLang[k] || {}), ...v };
      }
    }
  };
  const LITE_SWARM_FMT = { 'zh-CN': '主会话 {0}% · 子代理 {1}%', 'zh-TW': '主工作階段 {0}% · 子代理 {1}%', ja: 'メイン {0}% · サブ {1}%', ko: '메인 {0}% · 서브 {1}%', es: 'Principal {0}% · Sub {1}%', fr: 'Principal {0}% · Sous {1}%', de: 'Haupt {0}% · Sub {1}%' };
  const LITE_MORE_FMT = { 'zh-CN': '再显示 {0} 个', 'zh-TW': '再顯示 {0} 個', ja: 'さらに {0} 件表示', ko: '{0}개 더 보기', es: 'Mostrar {0} más', fr: 'Afficher {0} de plus', de: '{0} weitere anzeigen' };
  const ensureLiteLocalesShim = (slicePayload) => {
    mergeRuntimeUiSlice(slicePayload);
    const cur = getLocalesMod();
    // 绝不拿 43-key 迷你垫片覆写页面上已有的全量 8 语表（含热重载残留的旧全量表 UI_TABLE）
    if (cur && (cur.__isFullLocales || cur.UI_TABLE)) return;
    if (cur && cur.__isLiteShim) return;
    const shim = {
      __isLiteShim: true,
      getUiStrings(lang) {
        const l = typeof lang === 'string' && lang ? lang : runtimeSliceStore.active || 'en';
        const out = { ...(runtimeSliceStore.byLang[l] || runtimeSliceStore.byLang.en || runtimeSliceStore.byLang[runtimeSliceStore.active] || {}) };
        if (out.optThoughtImmersive && !out.optViewImmersive) out.optViewImmersive = out.optThoughtImmersive;
        if (out.optThoughtBilingual && !out.optViewBilingual) out.optViewBilingual = out.optThoughtBilingual;
        out.swarmSplitSub = (m, s) => (LITE_SWARM_FMT[l] || 'Main {0}% · Swarm {1}%').replace('{0}', m).replace('{1}', s);
        out.showMoreN = (n) => (LITE_MORE_FMT[l] || 'Show {0} more').replace('{0}', n);
        return out;
      },
    };
    GT.__agCsLocales = shim;
    W.__agCsLocales = shim;
  };
  if (initialConfig && initialConfig.__uiSlice) ensureLiteLocalesShim(initialConfig.__uiSlice);
  const getHomeStudioMod = () => GT.__agPrismHomeStudioPanel || W.__agPrismHomeStudioPanel || GT.__agHomeStudioPanel || W.__agHomeStudioPanel || null;
  const homeRippleMod = GT.__agPrismHomeRippleHost;
  const modelGlyphMod = GT.__agPrismModelGlyphCrystal;
  const streamChoreoMod = GT.__agPrismStreamChoreography;
  const prismRimMod = GT.__agPrismRimCanvas;
  const hostEnhancerMod = GT.__agPrismHostEnhancer;
  let ownedCtxMenu = W.__agPrismContextMenu || GT.__agPrismContextMenu || null;

  // 新品牌 Obsidian Prism 主存储键 + 旧版历史键平滑迁移兼容
  const STORAGE_PRISM_KEY = 'ag-prism:config';
  const STORAGE_LEGACY_COLON_KEY = 'ag-claude-style:config';
  const STORAGE_LEGACY_V3_KEY = 'agClaudeStyle.settings.v3';
  const STORAGE_FILE_CFG_KEY = 'ag-prism:lastFileConfig';
  const STORAGE_USAGE_CACHE_KEY = 'ag-prism:trajRollup.v1';
  const SETTINGS_SEC_ID = 'ag-cs-settings-sec';
  const MODEL_PANEL_SEL = '[data-testid="model-selector-panel"]';
  const BLUR_ATTR = 'data-ag-cs-win-blur';
  const K_IC = 'isConnected', K_PE = 'parentElement', K_TC = 'textContent', K_CL = 'classList';
  const isFn = (v) => typeof v === 'function';
  const de = () => D.documentElement;
  const byId = (id) => D.getElementById?.(id) || null;
  const ga = (e, k) => e?.getAttribute?.(k);
  const sa = (e, k, v = '') => e?.setAttribute?.(k, String(v));
  const ha = (e, k) => !!(e?.hasAttribute?.(k));
  const ra = (e, k) => e?.removeAttribute?.(k);
  const qs = (e, s) => e?.querySelector?.(s) || null;
  const qa = (e, s) => e?.querySelectorAll?.(s) || [];
  const cl = (e, s) => e?.closest?.(s) || null;
  const sp = (e, k, v) => e?.style?.setProperty?.(k, v);
  const rp = (e, k) => e?.style?.removeProperty?.(k);
  const clHas = (e, c) => !!(e?.[K_CL]?.contains?.(c));
  const rc = (e) => (isFn(e?.getBoundingClientRect) ? e.getBoundingClientRect() : null);
  const tidOf = (e) => String(ga(e, 'data-testid') || '');
  const tagU = (e) => String(e?.tagName || '').toUpperCase();
  const isElementLike = (n) => !!(n && (n.nodeType === 1 || (n.nodeType === undefined && typeof n.tagName === 'string')));

  const safeParseJsonObj = (raw) => {
    if (!raw || typeof raw !== 'string') return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  };

  const BOOL_ALIAS_PAIRS = [['homeRipple', 'ripple'], ['composerRestyle', 'composer'], ['sidebarRestyle', 'sidebar']];
  const ONOFF_STR_KEYS = 'telemetryModule|effortSliderModule|effortMemory|periodicModelPicker|omniModule|sidebarStudio|autoUpdate|sidebarNavFold'.split('|');
  const pickOf = (v, s, d) => (s.split('|').includes(v) ? v : d);
  const normConvRipple = (v) => (v === true || v === 'true' || v === 'on' ? 'medium' : pickOf(v, 'subtle|medium|full', 'off'));

  const normalizeConfigShape = (rawCfg) => {
    const out = { ...(rawCfg || {}) };
    out.palette = pickOf(out.palette === 'claude' ? 'warm' : out.palette, 'host|obsidian|warm', 'obsidian');
    out.motionLevel = pickOf(out.motionLevel, 'off|subtle|standard|ultra', 'ultra');
    out.targetFps = pickOf(out.targetFps, '60|120|180|native', '180');
    for (const k of ['telemetryModule', 'effortSliderModule', 'hostLocalization']) out[k] = pickOf(out[k], 'on|off', 'auto');
    out.effortSliderStyle = pickOf(out.effortSliderStyle, 'prism|ferrofluid|orbital|oscilloscope|plasma|supernova|swarm', 'classic');
    out.thoughtTranslate = pickOf(out.thoughtTranslate, 'machine|ai', 'off');
    out.homeLayout = out.homeMode = pickOf(out.homeLayout ?? out.homeMode, 'classic|off', 'studio');
    for (const [bKey, sKey] of BOOL_ALIAS_PAIRS) {
      const v = out[bKey] !== undefined ? out[bKey] : out[sKey];
      const on = v === undefined ? true : v !== false && v !== 'off';
      out[bKey] = on;
      out[sKey] = on ? 'on' : 'off';
    }
    out.placeholderStyle = out.promptStyle = (out.placeholderStyle ?? out.promptStyle) === 'host' ? 'host' : 'studio';
    out.mascot = out.mascot === 'off' || out.mascot === false ? 'off' : /^(minis|quad(-minis)?|r:[ckdw0-4,+m]+)$/.test(out.mascot) ? out.mascot : 'crab';
    out.convRipple = normConvRipple(out.convRipple);
    for (const k of ['sidebarCompact', 'codeLigatures', 'autoArchiveOnExit']) out[k] = out[k] === true || out[k] === 'on';
    for (const k of ['sidebarNavFold', 'sidebarStudio', 'autoUpdate']) out[k] = out[k] === 'on' || out[k] === true ? 'on' : 'off';
    for (const k of ['smoothCaret', 'contextMenu']) out[k] = out[k] === undefined ? true : out[k] !== false && out[k] !== 'off';
    out.accentTone = pickOf(out.accentTone, 'follow|cobalt|iris|amber|mono', 'follow');
    out.cornerStyle = pickOf(out.cornerStyle, 'sharp|balanced|soft', 'balanced');
    out.codeFont = pickOf(out.codeFont, 'default|jetbrains|cascadia|sfmono', 'default');
    out.ambientIntensity = pickOf(String(out.ambientIntensity ?? '100'), '0|35|70|100', '100');
    out.darkAura = pickOf(out.darkAura, 'subtle|balanced|vivid', 'balanced');
    for (const k of ['omniModule', 'effortMemory', 'periodicModelPicker']) out[k] = out[k] === 'off' || out[k] === false ? 'off' : 'on';
    for (const [k, a, b] of [['lightPreset','alabaster','crystal'],['darkAuraStyle','neon','prism'],['thoughtTrigger','expand','preload'],['scrollBottomMotion','instant','smooth'],['thoughtView','bilingual','immersive'],['linkTarget','external','builtin'],['updateChannel','beta','stable']]) out[k] = out[k] === a ? a : b;
    const migrateLegacyLang = (v) => {
      if (typeof v !== 'string') return '';
      const t = v.trim();
      if (!t) return '';
      const low = t.toLowerCase().replace(/_/g, '-');
      if (low === 'yue' || low.startsWith('yue-') || low === 'zh-yue' || low.includes('cantonese')) return 'zh-CN';
      return t;
    };
    const rawLang =
      (out.language && out.language !== 'auto' ? migrateLegacyLang(out.language) : '') ||
      (out.lang && out.lang !== 'auto' ? migrateLegacyLang(out.lang) : '');
    if (rawLang) out.language = out.lang = rawLang;
    return out;
  };

  const expandSettingAliases = (rawPatch) => {
    const patch = { ...(rawPatch || {}) };
    if (patch.palette === 'claude') patch.palette = 'warm';
    if (patch.mascot === 'dual') patch.mascot = 'crab';
    for (const [a, b] of [['language', 'lang'], ['homeLayout', 'homeMode'], ['placeholderStyle', 'promptStyle']]) {
      if (a in patch) patch[b] = patch[a];
      else if (b in patch) patch[a] = patch[b];
    };
    for (const [bKey, sKey] of BOOL_ALIAS_PAIRS) {
      if (bKey in patch || sKey in patch) {
        const raw = bKey in patch ? patch[bKey] : patch[sKey];
        const on = raw !== false && raw !== 'off';
        patch[bKey] = on;
        patch[sKey] = on ? 'on' : 'off';
      }
    }
    if ('convRipple' in patch) patch.convRipple = normConvRipple(patch.convRipple);
    for (const k of ['sidebarCompact', 'codeLigatures', 'autoArchiveOnExit']) {
      if (k in patch && typeof patch[k] === 'string') patch[k] = patch[k] === 'on' || patch[k] === 'true';
    }
    for (const k of ['smoothCaret', 'contextMenu']) {
      if (k in patch && typeof patch[k] === 'string') patch[k] = patch[k] !== 'off' && patch[k] !== 'false';
    }
    for (const k of ONOFF_STR_KEYS) {
      if (k in patch && typeof patch[k] === 'boolean') patch[k] = patch[k] ? 'on' : 'off';
    }
    return patch;
  };

  const stripRuntimeMetaKeys = (obj) => {
    const { binding, pollIntervalMs, codeHash, __fromFile, __ackEpoch, __uiSlice, ...clean } = obj || {};
    return clean;
  };

  const loadSettings = (base, explicitOverride = null) => {
    try {
      const cleanBase = expandSettingAliases(stripRuntimeMetaKeys(base)), baseJson = SJ(cleanBase), g = (k) => LS.getItem(k), s = (k, v) => LS.setItem(k, v);
      const prevBaseRaw = g(STORAGE_FILE_CFG_KEY), prevBaseObj = safeParseJsonObj(prevBaseRaw);
      const savedV3 = safeParseJsonObj(g(STORAGE_LEGACY_V3_KEY)), savedLegacyColon = safeParseJsonObj(g(STORAGE_LEGACY_COLON_KEY)), savedPrism = safeParseJsonObj(g(STORAGE_PRISM_KEY));
      const mergedSaved = { ...(savedV3 || {}), ...(savedLegacyColon || {}), ...(savedPrism || {}) };
      let savedMutated = false;
      if (prevBaseObj) {
        for (const [k, v] of O.entries(cleanBase)) if (SJ(prevBaseObj[k]) !== SJ(v)) { O.assign(mergedSaved, expandSettingAliases({ [k]: v })); savedMutated = true; }
      }
      if (explicitOverride && typeof explicitOverride === 'object') {
        const cleanOverride = stripRuntimeMetaKeys(explicitOverride);
        if (O.keys(cleanOverride).length) { O.assign(mergedSaved, expandSettingAliases(cleanOverride)); savedMutated = true; }
      }
      if (!prevBaseRaw || prevBaseRaw !== baseJson) s(STORAGE_FILE_CFG_KEY, baseJson);
      if (savedMutated || (!savedPrism && (savedLegacyColon || savedV3))) { const ser = SJ(mergedSaved); s(STORAGE_PRISM_KEY, ser); s(STORAGE_LEGACY_V3_KEY, ser); }
      if (savedLegacyColon && isFn(LS.removeItem)) LS.removeItem(STORAGE_LEGACY_COLON_KEY);
      return normalizeConfigShape({ ...cleanBase, ...mergedSaved });
    } catch {
      return normalizeConfigShape({ ...stripRuntimeMetaKeys(base), ...stripRuntimeMetaKeys(explicitOverride) });
    }
  };

  let currentBaseConfig = { ...(initialConfig || {}) };
  delete currentBaseConfig.__fromFile;
  delete currentBaseConfig.__ackEpoch;
  let localWriteEpoch = 0;
  let cfg = loadSettings(currentBaseConfig);
  let destroyed = false;
  let internalDomMutating = false;
  let pendingHiddenFullSync = false;

  // 细粒度增量同步标记与脏节点队列
  const dirtyAddedRoots = new Set();
  const dirtyCollapsibleTargets = new Set();
  const dirtyBgCmds = new Set();
  const dirtyTurboRoots = new Set();
  let mainObserver = null;
  let lastFormalConvEl = null;
  let lastFormalCascadeId = '';
  let lastStoreSnapKey = '';
  const DIRTY_KEYS = 'f|t|r|s|a|c|b|o|l|tk|cf|g|m'.split('|');
  const dirtyFlags = {};
  const setAllDirty = (v) => { for (const k of DIRTY_KEYS) dirtyFlags[k] = v; };
  setAllDirty(true);
  const perfStats = {
    lastSyncMs: 0,
    syncCount: 0,
    iconIncrementalRuns: 0,
    iconFullRuns: 0,
  };

  const markAllDirty = () => setAllDirty(true);

  const resolveWireSettingPair = (key, value) => {
    const base = currentBaseConfig || {};
    for (const [a, b, boolStr] of [
      ['homeLayout', 'homeMode'],
      ['homeRipple', 'ripple', 1],
      ['composerRestyle', 'composer', 1],
      ['placeholderStyle', 'promptStyle'],
      ['sidebarRestyle', 'sidebar', 1],
      ['language', 'lang'],
    ]) {
      if (key === a && b in base && !(a in base)) return [b, boolStr ? (value ? 'on' : 'off') : value];
    }
    if ('sidebarCompact|smoothCaret|contextMenu'.split('|').includes(key) && typeof base[key] === 'string') return [key, value ? 'on' : 'off'];
    if (ONOFF_STR_KEYS.includes(key) && typeof value === 'boolean') return [key, value ? 'on' : 'off'];
    if (key === 'palette' && value === 'claude') return ['palette', 'warm'];
    if (key === 'mascot') return ['mascot', value === 'dual' ? 'crab' : value];
    return [key, value];
  };

  const routeConfigDirtyFlags = (prevCfg, nextCfg, patch) => {
    dirtyFlags.g = true;
    const any = (s) => s.split('|').some((k) => prevCfg[k] !== nextCfg[k] || O.hasOwn(patch, k));
    if (any('palette|lightPreset|accentTone|ambientIntensity|darkAura|darkAuraStyle|cornerStyle|codeFont|codeLigatures')) dirtyFlags.t = true;
    if (any('accentTone|composerRestyle|placeholderStyle|mascot|smoothCaret|telemetryModule|effortSliderStyle|motionLevel|language')) dirtyFlags.c = true;
    if (any('homeLayout|homeRipple|convRipple|motionLevel|language')) dirtyFlags.r = true;
    if (any('sidebarRestyle|sidebarCompact|sidebarNavFold')) dirtyFlags.s = true;
    if (any('thoughtTranslate|thoughtTrigger|thoughtView')) dirtyFlags.l = dirtyFlags.tk = true;
  };

  const persistAndApplyConfigPatch = (rawPatch, emitSingleKey = null) => {
    const prevCfg = { ...cfg }, patch = expandSettingAliases(rawPatch);
    O.assign(currentBaseConfig, stripRuntimeMetaKeys(patch));
    cfg = normalizeConfigShape({ ...cfg, ...patch });
    try {
      const saved = safeParseJsonObj(LS.getItem(STORAGE_PRISM_KEY)) || {};
      O.assign(saved, patch);
      const ser = SJ(saved);
      LS.setItem(STORAGE_PRISM_KEY, ser); LS.setItem(STORAGE_LEGACY_V3_KEY, ser); LS.removeItem?.(STORAGE_LEGACY_COLON_KEY);
      const lf = safeParseJsonObj(LS.getItem(STORAGE_FILE_CFG_KEY));
      if (lf) { O.assign(lf, patch); LS.setItem(STORAGE_FILE_CFG_KEY, SJ(lf)); }
    } catch {}
    const writeEp = ++localWriteEpoch;
    try {
      const send = W[cfg.binding] || W.__agPrismSetting || W.__agClaudeStyleSetting;
      if (isFn(send)) {
        if (emitSingleKey !== null) {
          const [wk, wv] = resolveWireSettingPair(emitSingleKey, rawPatch[emitSingleKey]);
          send(SJ({ key: wk, value: wv, clientEpoch: writeEp }));
        } else {
          const entries = {};
          for (const [k, v] of O.entries(rawPatch || {})) { const [wk, wv] = resolveWireSettingPair(k, v); entries[wk] = wv; }
          if (O.keys(entries).length) send(SJ({ action: 'patch-batch', entries, clientEpoch: writeEp }));
        }
      }
    } catch {}
    routeConfigDirtyFlags(prevCfg, cfg, patch);
    applyRootAttrs();
    scheduleSync();
  };

  const saveSetting = (key, value) => persistAndApplyConfigPatch({ [key]: value }, key);
  const saveSettingsBatch = (patchObj) => { if (patchObj && typeof patchObj === 'object') persistAndApplyConfigPatch(patchObj, null); };

  const pickConcreteLang = (v) => (typeof v === 'string' && v.trim() && v.trim().toLowerCase() !== 'auto' ? v.trim() : '');

  const getLang = () => {
    const raw =
      pickConcreteLang(cfg.language) ||
      pickConcreteLang(cfg.lang) ||
      pickConcreteLang(currentBaseConfig?.language) ||
      pickConcreteLang(currentBaseConfig?.lang) ||
      (typeof navigator !== 'undefined' && (navigator.language || navigator.languages?.[0])) ||
      'en';
    if (isFn(i18nCore?.normalizeLanguage)) return i18nCore.normalizeLanguage(raw, 'en');
    const low = String(raw || '').trim().toLowerCase().replace(/_/g, '-');
    if (/^(?:zh|yue)|cantonese/.test(low)) return /tw|hk|mo|hant/.test(low) ? 'zh-TW' : 'zh-CN';
    return low.match(/^(en|ja|ko|es|fr|de)(?:-|$)/)?.[1] || 'en';
  };

  const uiText = (lang = getLang()) => {
    const mod = getLocalesMod();
    return isFn(mod?.getUiStrings) ? mod.getUiStrings(lang) : {};
  };
  const isZh = () => { const l = getLang(); return l === 'zh-CN' || l === 'zh-TW'; };

  const isDarkTheme = () => {
    for (const l of [D.body?.[K_CL], de()?.[K_CL]]) {
      if (l?.contains('theme-light') || l?.contains('light-theme') || l?.contains('light')) return false;
      if (l?.contains('theme-dark') || l?.contains('dark') || l?.contains('dark-theme')) return true;
    }
    return true;
  };

  const getEffectivePalette = () => pickOf(cfg.palette === 'claude' ? 'warm' : cfg.palette, 'obsidian|warm|host', 'obsidian');
  const getLightPreset = () => (cfg.lightPreset === 'alabaster' ? 'alabaster' : 'crystal');
  const getMotionLevel = () => pickOf(cfg.motionLevel, 'off|subtle|standard|ultra', 'ultra');
  const getTargetFps = () => pickOf(String(cfg.targetFps || ''), '60|120|180|native', '180');
  const getMinFrameGapMs = () => ({ native: 0, 60: 15.2, 120: 7.5 })[getTargetFps()] ?? 4.8;
  const getTelemetryMode = () => pickOf(cfg.telemetryModule, 'on|off', 'auto');
  const getEffortSliderMode = () => pickOf(cfg.effortSliderModule, 'on|off', 'auto');
  const getEffortSliderStyle = () => pickOf(cfg.effortSliderStyle, 'prism|ferrofluid|orbital|oscilloscope|plasma|supernova|swarm', 'classic');
  const onOffMode = (k) => (cfg[k] === 'off' || cfg[k] === false ? 'off' : 'on');
  const getEffortMemoryMode = () => onOffMode('effortMemory');
  const getPeriodicPickerMode = () => onOffMode('periodicModelPicker');
  const getHostLocalizationMode = () => pickOf(cfg.hostLocalization, 'on|off', 'auto');
  const getThoughtTranslateMode = () => pickOf(cfg.thoughtTranslate, 'machine|ai', 'off');
  const getThoughtTriggerTiming = () => (cfg.thoughtTrigger === 'expand' ? 'expand' : 'preload');
  const getAccentTone = () => pickOf(cfg.accentTone, 'cobalt|iris|amber|mono', 'follow');
  const getCornerStyle = () => pickOf(cfg.cornerStyle, 'sharp|soft', 'balanced');
  const getCodeFont = () => pickOf(cfg.codeFont, 'jetbrains|cascadia|sfmono', 'default');
  const isCodeLigaturesEnabled = () => cfg.codeLigatures === true || cfg.codeLigatures === 'on';
  const isContextMenuEnabled = () => cfg.contextMenu !== false && cfg.contextMenu !== 'off';
  const getAmbientIntensitySetting = () => pickOf(String(cfg.ambientIntensity ?? '100'), '0|35|70|100', '100');
  const getAmbientFloat = () => Number(getAmbientIntensitySetting()) / 100;
  const getAmbientCssValue = () => String(getAmbientFloat());
  const getThoughtView = () => (cfg.thoughtView === 'bilingual' ? 'bilingual' : 'immersive');
  const getOmniMode = () => onOffMode('omniModule');
  const getLinkTarget = () => (cfg.linkTarget === 'external' ? 'external' : 'builtin');

  const resolveAuraSpectrumMode = () => {
    const acc = getAccentTone();
    if (acc !== 'follow') return acc;
    const pal = getEffectivePalette();
    if (pal === 'warm') return 'warm';
    if (pal === 'obsidian' && !isDarkTheme() && getLightPreset() === 'alabaster') return 'warm';
    return 'default';
  };

  const isMascotEnabled = () => cfg.mascot !== 'off';

  const motionReduced = () => cfg.motionLevel === 'off';

  const isMotionStandardOrUltra = () => {
    if (motionReduced()) return false;
    const lv = getMotionLevel();
    return lv === 'standard' || lv === 'ultra';
  };

  const isMotionUltra = () => {
    return !motionReduced() && getMotionLevel() === 'ultra';
  };

  const canMountRealCanvas = (node) => {
    try {
      const cv = node?.ownerDocument?.createElement?.('canvas');
      return !!(cv?.dataset && isFn(cv.getContext) && cv.getContext('2d'));
    } catch { return false; }
  };

  // ── Built-in Thought Translator Overlay Isolation Helpers (Zero-Flicker Guard) ──
  const THOUGHT_ISOLATED_SELECTOR = '.ag-prism-thought-overlay, .ag-prism-thought-raw-toggle, [data-prism-ignore]';

  const isThoughtIsolatedNode = (node) => {
    const el = node ? (isElementLike(node) ? node : node[K_PE]) : null;
    return !!(el && (clHas(el, 'ag-prism-thought-overlay') || clHas(el, 'ag-prism-thought-raw-toggle') || clHas(el, 'ag-prism-thought-body') || ha(el, 'data-prism-ignore') || cl(el, THOUGHT_ISOLATED_SELECTOR)));
  };

  const isMutAll = (m, fn) => {
    if (!m) return false;
    if (fn(m.target)) return true;
    const a = m.addedNodes, r = m.removedNodes, al = a ? a.length : 0, rl = r ? r.length : 0;
    if (!al && !rl) return false;
    for (let i = 0; i < al; i++) if (!fn(a[i])) return false;
    for (let i = 0; i < rl; i++) if (!fn(r[i])) return false;
    return true;
  };
  const isThoughtMutationRecord = (m) => isMutAll(m, isThoughtIsolatedNode);

  const isManagedThoughtPanel = (panel) => !!(isElementLike(panel) && (ha(panel, 'data-op-zh-ready') || ha(panel, 'data-op-zh-pending') || qs(panel, '.ag-prism-thought-overlay')));

  const runGuardedMut = (fn) => {
    const prev = internalDomMutating;
    internalDomMutating = true;
    try { return fn(); } finally {
      if (!prev && isFn(mainObserver?.takeRecords)) try { mainObserver.takeRecords(); } catch {}
      internalDomMutating = prev;
    }
  };

  const setAttrIfChanged = (el, name, val) => { if (el && ga(el, name) !== val) sa(el, name, val); };

  // ── Antigravity React Fiber & Store Bridge ─────────────────────────────
  let cachedSvc = null, cachedStore = null, storeUnsub = null, storeDebounce = null;

  const findFiber = (el) => {
    const k = el && O.keys(el).find((s) => s.startsWith('__reactFiber$'));
    return k ? el[k] : null;
  };

  const ensureHooks = (allowPartial = false) => {
    if (cachedSvc && cachedStore) return { svc: cachedSvc, store: cachedStore };
    const anchors = qa(
      D,
      '[data-testid="conversation-view"], [data-testid="agent-input-box"], [data-testid="conversation-row-sidebar"], [data-testid="new-conversation-button"], [data-testid="home-greeting"]'
    );
    for (const el of anchors) {
      for (let f = findFiber(el); f && !(cachedSvc && cachedStore); f = f.return) {
        const p = f.memoizedProps;
        if (!cachedStore && isFn(p?.store?.getState)) cachedStore = p.store;
        for (let d = f.dependencies?.firstContext; d; d = d.next) {
          const v = d.memoizedValue;
          if (!v || typeof v !== 'object') continue;
          if (!cachedSvc && isFn(v.getCascadeTrajectory)) cachedSvc = v;
          if (!cachedStore && isFn(v.store?.getState)) cachedStore = v.store;
        }
      }
      if (cachedSvc && cachedStore) break;
    }
    if (cachedStore && !storeUnsub) {
      storeUnsub = cachedStore.subscribe(() => {
        if (destroyed || storeDebounce) return;
        storeDebounce = ST(() => { storeDebounce = null; if (!destroyed) onStoreChanged(); }, 400);
      });
    }
    return cachedSvc && cachedStore || (allowPartial && (cachedSvc || cachedStore)) ? { svc: cachedSvc, store: cachedStore } : null;
  };

  const getDisplayName = () => {
    const h = ensureHooks(true);
    const raw = String(h?.store?.getState()?.userStatus?.name || '').trim();
    if (!raw) return '';
    return raw.split(/\s+/)[0] || raw;
  };

  const resolveCascadeId = (inputBox) => {
    const cv = inputBox ? cl(inputBox, '[data-testid="conversation-view"]') : qs(D, '[data-testid="conversation-view"]');
    if (inputBox && !cv && cl(inputBox, '.agy-home')) return '';
    if (cv) {
      const attrId = ga(cv, 'data-cascade-id');
      if (attrId && attrId !== 'conversation') return attrId;
    }
    const m = location.pathname.match(/\/c\/([0-9a-f-]{36})/i);
    if (m) return m[1];
    const readCascadeFromFiber = (el, maxDepth) => {
      for (let f = findFiber(el), d = 0; f && d < maxDepth; f = f.return, d++) {
        const p = f.memoizedProps || f.pendingProps;
        if (p && typeof p.cascadeId === 'string' && p.cascadeId) return p.cascadeId;
      }
      return '';
    };
    const fromInputFiber = readCascadeFromFiber(inputBox, 60);
    if (fromInputFiber) return fromInputFiber;
    const fromCvFiber = readCascadeFromFiber(cv, 35);
    if (fromCvFiber) return fromCvFiber;
    if (cv && !cl(inputBox, '[data-testid="subagent-tab-conversation"]')) {
      const h = ensureHooks(true);
      const convoState = h?.store?.getState?.()?.conversation?.convoState;
      if (convoState?.type === 'active' && typeof convoState.cascadeId === 'string' && convoState.cascadeId) {
        return convoState.cascadeId;
      }
      if (convoState?.type === 'subagent' && typeof convoState.childConversationId === 'string' && convoState.childConversationId) {
        return convoState.childConversationId;
      }
    }
    return '';
  };

  // ── Official Dual Mascot Stage ─────────────────────────────────────────
  let msRoot = null, msRig = null, msAnc = null, msOrch = null, msLastTier, msLastHostSleep = false, msActAt = 0;

  const notifyMascot = (eventName, payload) => {
    try { msRig?.notify?.(eventName, payload || {}); } catch {}
  };

  const getLightweightActiveInfo = (card) => {
    if (!card) return null;
    const inputBox = cl(card, '[data-testid="agent-input-box"]');
    const cv = cl(card, '[data-testid="conversation-view"]');
    const cascadeId = cv ? resolveCascadeId(inputBox) : '';
    let isRunning = Boolean(qs(card, '[data-testid="input-cancel-button"]'));
    let isThinking = false;
    let hasError = false;
    if (cascadeId) {
      const st = ensureHooks(true)?.store?.getState?.();
      const sums = st?.trajectorySummaries?.summaries || st?.cascadeTrajectorySummaries || {};
      const entry = sums[cascadeId];
      const sum = entry?.summary || entry || {};
      if (sum.notFullyIdle || sum.hasActivity || sum.status === 2 || sum.hasRunningSubagents) isRunning = true;
      if (sum.status === 3 || sum.hasError) hasError = true;
    }
    if (cv && isRunning) {
      const thinkingEl = qs(cv, '[data-testid="thinking-collapsible-trigger"], [data-testid="worked-for-collapsible"]');
      if (thinkingEl && String(thinkingEl[K_TC] || '').includes('...')) isThinking = true;
    }
    return { cascadeId, isRunning, isThinking, hasError };
  };

  let crabRemoveAttrTimer = 0, queuedCrabAnchor = null;
  const A_CA = 'data-ag-cs-crab-anchor';

  const unmountCrab = () => {
    if (crabRemoveAttrTimer) {
      CT(crabRemoveAttrTimer);
      crabRemoveAttrTimer = 0;
    }
    try { msRig?.dispose?.(); } catch {}
    msRoot?.[K_PE]?.removeChild(msRoot);
    ra(msAnc, A_CA);
    if (ha(de(), 'data-ag-cs-has-crab')) ra(de(), 'data-ag-cs-has-crab');
    msRoot = msRig = msAnc = msOrch = queuedCrabAnchor = null;
    msLastTier = undefined;
    msLastHostSleep = false;
  };

  const syncCrab = (activeCard, activeInfo, modelInfo, yieldMode = 'none') => {
    if (!isMascotEnabled()) return unmountCrab();
    const html = de();
    if (!activeCard) {
      msRoot?.[K_PE]?.removeChild(msRoot);
      try { msRig?.syncPowerState?.(); } catch {}
      if (msAnc) { ra(msAnc, A_CA); msAnc = null; }
      if (ha(html, 'data-ag-cs-has-crab')) {
        if (typeof ST === 'function' && !destroyed) {
          if (!crabRemoveAttrTimer) crabRemoveAttrTimer = ST(() => { crabRemoveAttrTimer = 0; if (!destroyed && !msAnc) runGuardedMut(() => ra(html, 'data-ag-cs-has-crab')); }, 220);
        } else ra(html, 'data-ag-cs-has-crab');
      }
      return;
    }
    if (crabRemoveAttrTimer) { CT(crabRemoveAttrTimer); crabRemoveAttrTimer = 0; }
    if (!msRoot) {
      const stage = D.createElement('div');
      stage.className = 'ag-cs-crab ag-cs-dual-stage';
      sa(stage, 'data-mascot-stage', 'true'); sa(stage, 'aria-hidden', 'true'); sa(stage, 'data-ag-no-i18n'); sa(stage, 'data-ag-owned', '1');
      msRoot = stage;
    }
    const hc = queuedCrabAnchor || activeCard, ak = queuedCrabAnchor ? 'queued' : 'composer';
    let reattached = false;
    if (msRoot[K_PE] !== hc) { ra(msAnc, A_CA); sa(hc, A_CA, ak); hc.appendChild(msRoot); msAnc = hc; reattached = true; }
    else if (ga(hc, A_CA) !== ak) sa(hc, A_CA, ak);
    if (html) setAttrIfChanged(html, 'data-ag-cs-has-crab', '1');

    const nextYield = yieldMode === 'peek' || yieldMode === 'leap' ? yieldMode : 'none';
    if (nextYield === 'peek') setAttrIfChanged(msRoot, 'data-ag-mascot-peek', '1');
    else if (ha(msRoot, 'data-ag-mascot-peek')) ra(msRoot, 'data-ag-mascot-peek');

    const isOrch = !!(modelInfo?.isOrchestrator);
    const curTier = String(modelInfo?.tier || '').toLowerCase();
    const nextState = {
      camp: modelInfo?.mascotCamp || modelInfo?.camp || 'gemini',
      mascot: cfg.mascot,
      streaming: !!(activeInfo?.isRunning),
      streamTier: curTier === 'high' || curTier === 'xhigh' || isOrch ? 3 : 2,
      hasError: !!(activeInfo?.hasError),
      yieldMode: nextYield,
      leapOffsetY: 0,
      popoverRightWidth: 0,
      miniPileEnabled: /minis$|\+m$/.test(cfg.mascot),
      orchestrator: isOrch,
      reducedMotion: motionReduced(),
    };

    const rigMod = getDualMascotRig();
    const mountFn = rigMod && (rigMod.mountDualMascotStage || rigMod.createDualMascotRig);
    const rigHash = rigMod?.__prismCodeHash || '';
    if (msRig && rigMod && (msRig.__r !== rigMod || (rigHash && msRig.__h !== rigHash))) {
      try { (msRig.dispose || msRig.destroy)?.call(msRig); } catch {}
      msRig = null;
      if (msRoot) msRoot.textContent = '';
    }
    if (!msRig && mountFn && canMountRealCanvas(msRoot)) {
      try {
        msRig = mountFn(msRoot, nextState);
        if (msRig) { msRig.__r = rigMod; msRig.__h = rigHash; }
      } catch {
        msRig = null;
      }
    } else {
      try { msRig?.setState?.(nextState); } catch {}
      if (reattached) {
        try { msRig?.syncPowerState?.(); } catch {}
      }
    }

    if (reattached) {
      msOrch = isOrch;
      msLastTier = curTier;
    } else {
      if (msOrch !== null && msOrch !== isOrch) {
        notifyMascot('orchestrator', { on: isOrch });
      }
      msOrch = isOrch;
      if (msLastTier !== undefined && msLastTier !== curTier && (curTier === 'high' || curTier === 'xhigh')) {
        notifyMascot('effort-tier', { tier: curTier });
      }
      msLastTier = curTier;
    }
    const chatSleep = ga(html, 'data-ag-prism-mode') === 'chat';
    if (msLastHostSleep !== chatSleep) {
      msLastHostSleep = chatSleep;
      notifyMascot('host-sleep', { sleep: chatSleep });
    }
  };

  // ── Extracted Domain Controllers Initialization ────────────────────────
  const noopFn = () => null;
  const noopStub = (ov = {}) => new Proxy(ov, { get: (t, k) => (k in t ? t[k] : noopFn) });

  const homeStudioFallback = noopStub({
    wasHero: () => false,
    getScopeKey: () => 'local',
    getUsageRecordsCount: () => 0,
    hasConnectedPanel: () => false,
  });
  let activeHomeStudioMod = null;
  let activeHomeStudioInst = null;
  let lastHomeStudioChannelReqAt = 0;

  const disposeActiveHomeStudio = () => {
    const prev = activeHomeStudioInst;
    activeHomeStudioInst = null;
    activeHomeStudioMod = null;
    if (!prev) return;
    if (isFn(prev.dispose)) { try { prev.dispose(); } catch {} return; }
    for (const k of ['flushUsageCacheNow', 'unmountPanelSeat', 'restoreGreetings']) {
      try { prev[k]?.(); } catch {}
    }
  };

  const requestHomeStudioChannelIfNeeded = () => {
    if (destroyed || cfg.homeLayout !== 'studio') return;
    const now = Date.now();
    if (now - lastHomeStudioChannelReqAt < 1000) return;
    if (!qs(D, '.agy-home')) return;
    const bindingName = currentBaseConfig?.binding || cfg?.binding || '__agPrismSetting';
    const fn = W[bindingName];
    if (!isFn(fn)) return;
    lastHomeStudioChannelReqAt = now;
    try { fn(JSON.stringify({ action: 'request-home-studio-panel' })); } catch {}
  };

  const resolveHomeStudioCtl = () => {
    const mod = getHomeStudioMod();
    if (!mod || !isFn(mod.createHomeStudioPanelController)) {
      if (activeHomeStudioInst) disposeActiveHomeStudio();
      return homeStudioFallback;
    }
    if (activeHomeStudioInst && activeHomeStudioMod === mod) return activeHomeStudioInst;
    if (activeHomeStudioInst) disposeActiveHomeStudio();
    if (destroyed) return homeStudioFallback;
    activeHomeStudioMod = mod;
    activeHomeStudioInst = mod.createHomeStudioPanelController({
      usageCore,
      storageUsageCacheKey: STORAGE_USAGE_CACHE_KEY,
      isDestroyed: () => destroyed,
      getHomeLayout: () => cfg.homeLayout,
      getLang,
      uiText,
      getDisplayName,
      ensureHooks,
      canMountRealCanvas,
      setAttrIfChanged,
      runGuardedMut,
    });
    return activeHomeStudioInst;
  };

  const homeStudioCtl = new Proxy({}, {
    get: (_, k) => (...args) => {
      const ctl = resolveHomeStudioCtl();
      const fn = ctl[k];
      return isFn(fn) ? fn.apply(ctl, args) : null;
    },
  });

  const rippleCtl = homeRippleMod?.createHomeRippleController
    ? homeRippleMod.createHomeRippleController({
        rippleCore,
        isDestroyed: () => destroyed,
        isAllowed: () => cfg.homeRipple !== false && cfg.homeLayout !== 'off',
        isConvAllowed: () => cfg.convRipple !== 'off',
        getConvLevel: () => cfg.convRipple,
        isConvRunning,
        isDarkTheme,
        motionReduced,
        getMinFrameGapMs,
        getAmbientIntensity: getAmbientFloat,
        getAccentTone,
        getEffectivePalette,
        setAttrIfChanged,
        onPointerPressMascot: (clientX) => {
          if (msRig && msRoot) {
            try {
              const mr = rc(msRoot);
              if (mr) notifyMascot('ripple', { x: clientX - mr.left });
            } catch {}
          }
        },
      })
    : noopStub();

  const convAuraCtl = convAuraMod?.createConvAuraController
    ? convAuraMod.createConvAuraController({
        isDestroyed: () => destroyed,
        isHomeRippleEnabled: () => getAmbientFloat() > 0,
        isMotionStandardOrUltra,
        isDarkTheme,
        getMinFrameGapMs,
        getAmbientIntensity: getAmbientFloat,
        getSpectrumMode: resolveAuraSpectrumMode,
        isWindowFocused: () => (isFn(D.hasFocus) ? D.hasFocus() : !D.hidden),
        rippleCore,
        setAttrIfChanged,
        runGuardedMut,
      })
    : noopStub({ advancePhase: () => 'off' });

  const hostEnhancerCtl = hostEnhancerMod?.createHostEnhancerController
    ? hostEnhancerMod.createHostEnhancerController({
        doc: D,
        win: W,
        getLang,
        t: (k) => (k ? uiText()[k] : uiText()),
        isDestroyed: () => destroyed,
        isConvRunning,
        runGuardedMut,
        setAttrIfChanged,
        getConfig: () => normalizeConfigShape(cfg),
      })
    : noopStub();

  function isConvRunning() {
    return !!(convAuraMod && isFn(convAuraMod.isConvRunning) && convAuraMod.isConvRunning());
  };

  let prismRimCtl = null;

  const modelGlyphCtl = modelGlyphMod?.createModelGlyphCrystalController
    ? modelGlyphMod.createModelGlyphCrystalController({
        animatedIcons,
        crystalPrismCore,
        isDestroyed: () => destroyed,
        isComposerRestyleEnabled: () => cfg.composerRestyle !== false,
        isZh,
        isDarkTheme,
        motionReduced,
        getMinFrameGapMs,
        canMountRealCanvas,
        getLastPointerPos: () => (prismRimCtl ? prismRimCtl.getLastPointerPos() : { x: -9999, y: -9999 }),
        setAttrIfChanged,
      })
    : noopStub({
        readButtonLabelWithoutGlyph: () => '',
        buildBrandMarkSvg: () => '',
      });

  prismRimCtl = prismRimMod?.createPrismRimCanvasController
    ? prismRimMod.createPrismRimCanvasController({
        isDestroyed: () => destroyed,
        isDarkTheme,
        motionReduced,
        getMinFrameGapMs,
        canMountRealCanvas,
        setAttrIfChanged,
        runGuardedMut,
        getActiveCrystalTrack: () => modelGlyphCtl.getActiveCrystalTrack(),
        setCrystalPointerClient: (x, y) => modelGlyphCtl.setCrystalPointerClient(x, y),
        onPointerActivity: (now) => {
          if (now - msActAt >= 2500) {
            msActAt = now;
            notifyMascot('activity', {});
          }
        },
        onComposerRimUpdate: (info) => {
          try { msRig?.setRimLight?.(info); } catch {}
        },
      })
    : noopStub({ getLastPointerPos: () => ({ x: -9999, y: -9999 }) });

  const smoothCaretCtl = smoothCaretMod?.createSmoothCaretController
    ? smoothCaretMod.createSmoothCaretController({
        isDestroyed: () => destroyed,
        isEnabled: () => cfg.smoothCaret !== false,
        setAttrIfChanged,
        runGuardedMut,
      })
    : noopStub();

  const iconPendSig = new WeakMap();
  const A_IC = 'data-ag-cs-icon-injected', A_OS = 'data-ag-cs-orig-svg', A_OD = 'data-ag-cs-orig-disp';
  const applySingleHostIcon = (btn, iconName, origSvg, size, eqSig) => {
    if (!btn || btn[K_IC] === false || !origSvg || !origSvg.parentNode || !animatedIcons) return;
    if (ga(btn, A_IC) || qs(btn, '.ag-anim-icon')) return;
    const htmlStr = animatedIcons.renderIcon(iconName, { size });
    if (!htmlStr) return;

    const prevDisp = origSvg.style?.getPropertyValue?.('display') || '';
    if (prevDisp) sa(origSvg, A_OD, prevDisp);
    sa(origSvg, 'hidden'); sa(origSvg, A_OS, '1'); origSvg.hidden = true;
    origSvg.style?.setProperty?.('display', 'none', 'important');

    let animSvg = modelGlyphCtl.cloneCachedSvgElement(`icon:${iconName}:${size}`, htmlStr);
    if (!animSvg) {
      animSvg = D.createElement('svg');
      animSvg.className = `ag-anim-icon ag-icon-${iconName}`;
      for (const [k, v] of [['data-anim-icon', iconName], ['width', size], ['height', size], ['viewBox', '0 0 24 24'], ['aria-hidden', 'true']]) sa(animSvg, k, v);
      if (iconName === 'copy-check') sa(animSvg, 'data-icon-state', 'copy');
      animSvg.innerHTML = htmlStr;
    }
    sa(animSvg, 'data-ag-owned', '1');
    origSvg.parentNode.insertBefore(animSvg, origSvg);
    sa(btn, A_IC, iconName);
    const sig = eqSig || iconPendSig.get(btn);
    iconPendSig.delete(btn);
    if (sig) iconSigMap.set(btn, { s: sig, p: btn[K_PE], v: origSvg });
  };

  const streamChoreoCtl = streamChoreoMod?.createStreamChoreographyController
    ? streamChoreoMod.createStreamChoreographyController({
        motionEngine,
        isDestroyed: () => destroyed,
        isComposerRestyleEnabled: () => cfg.composerRestyle !== false,
        isMotionStandardOrUltra,
        isMotionUltra,
        isConvRunning,
        isThoughtIsolatedNode,
        isThoughtMutationRecord,
        isManagedThoughtPanel,
        setAttrIfChanged,
        runGuardedMut,
        cloneCachedSvgElement: (k, s) => modelGlyphCtl.cloneCachedSvgElement(k, s),
        buildBrandMarkSvg: (b, sz, tr, m) => modelGlyphCtl.buildBrandMarkSvg(b, sz, tr, m),
        applySingleHostIcon,
        rippleCtl,
        convAuraCtl,
        notifyMascot,
      })
    : noopStub({
        heroState: {
          wasInHome: false,
          wasInFormalConv: false,
          lastModelSig: null,
          pendingModelShiftNotify: false,
          lastTriggerOrigin: null,
          lastGroupPress: null,
        },
        scheduleTransient: (fn, ms) => ST(fn, ms),
        measureSidebarSelectionSnapshot: () => ({ empty: true }),
        measureVisibleChangedHeaders: () => [],
        measureNewLensOverlays: () => [],
        isStreamMutating: () => false,
        hasStreamObserver: () => false,
      });

  // ── Root Attrs, Spring Tokens & Language Sync ──────────────────────────
  let lastThemeKey = '';
  let lastAppliedLang = '';
  let lastAppliedMotion = '';
  let lastAppliedTelemetry = '';
  let lastMetricsKey = '';
  let lastAbsorbedSyncKey = '';
  const MOTION_OFF_STYLE_ID = 'ag-prism-motion-off-css';

  function flattenMainStyleSheet() {
    if (typeof CSS !== 'undefined' && CSS.supports?.('selector(&)')) return;
    const el = document.getElementById?.('ag-prism-css');
    const rules = el?.sheet?.cssRules;
    const key = el?.getAttribute?.('data-ag-cs-css-hash') || CODE_HASH || '1';
    if (!rules?.length || el.getAttribute?.('data-ag-cs-flat') === key + ':' + (el.textContent || '').length) return;
    const splitC = (s) => {
      const out = [];
      for (let i = 0, d = 0, q = '', st = 0; i <= s.length; i++) {
        const c = s[i];
        if (c === '\\') { i++; continue; }
        if (q) { if (c === q) q = ''; continue; }
        if (c === '"' || c === "'") q = c;
        else if (c === '(' || c === '[') d++;
        else if (c === ')' || c === ']') d--;
        else if ((!c || (c === ',' && !d)) && i >= st) { const t = s.slice(st, i).trim(); if (t) out.push(t); st = i + 1; }
      }
      return out;
    };
    const expIs = (s) => {
      let q = '', br = 0, nd = 0, idx = -1;
      const stk = [];
      for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (c === '\\') { i++; continue; }
        if (q) { if (c === q) q = ''; continue; }
        if (c === '"' || c === "'") q = c;
        else if (c === '[') br++;
        else if (c === ']') br && br--;
        else if (!br) {
          if (c === '(') { const n = s.slice(i - 4, i) === ':not'; if (n) nd++; stk.push(n); }
          else if (c === ')') { if (stk.pop()) nd--; }
          else if (!nd && c === ':' && s.slice(i, i + 4) === ':is(') { idx = i; break; }
        }
      }
      if (idx < 0) return [s];
      let d = 0, end = -1;
      for (let i = idx + 3; i < s.length; i++) {
        const c = s[i];
        if (c === '\\') { i++; continue; }
        if (q) { if (c === q) q = ''; continue; }
        if (c === '"' || c === "'") q = c;
        else if (c === '(') d++;
        else if (c === ')' && !--d) { end = i; break; }
      }
      if (end < 0) return [s];
      const parts = splitC(s.slice(idx + 4, end));
      if (!parts.length || parts.length > 40 || (parts.length === 1 && /[\s>+~]/.test(parts[0]))) return [s];
      const pre = s.slice(0, idx), post = s.slice(end + 1), res = [];
      for (const p of parts) {
        for (const sub of expIs(pre + p + post)) if (res.push(sub) > 200) return [s];
      }
      return res;
    };
    const expSel = (s) => splitC(s).flatMap(expIs).join(',');
    const walk = (rs, ps) => {
      const out = [];
      for (const r of rs) {
        if (r.type === 1) {
          let sel = r.selectorText;
          if (ps) sel = splitC(ps).flatMap((p) => splitC(sel).map((c) => {
            const fi = c.indexOf('&');
            return fi < 0 ? p + ' ' + c : fi === 0 && c.indexOf('&', 1) < 0 ? p + c.slice(1) : c.replace(/&/g, ':is(' + p + ')');
          })).join(',');
          if (r.style?.cssText) out.push(expSel(sel) + '{' + r.style.cssText + '}');
          if (r.cssRules?.length) out.push(...walk(r.cssRules, sel));
        } else if (r.type === 4 || r.type === 12) {
          const inner = walk(r.cssRules || [], ps);
          if (inner.length) out.push((r.type === 4 ? '@media ' : '@supports ') + r.conditionText + '{' + inner.join('\n') + '}');
        } else if (!r.selectorText && r.style?.cssText && ps) out.push(expSel(ps) + '{' + r.style.cssText + '}');
        else if (r.cssText) out.push(r.cssText);
      }
      return out;
    };
    try {
      const flat = walk(rules, '').join('\n');
      if (flat) runGuardedMut(() => { el.textContent = flat; el.setAttribute?.('data-ag-cs-flat', key + ':' + flat.length); });
    } catch {}
  }

  const syncMotionOffStyle = (isOff) => {
    const el = byId(MOTION_OFF_STYLE_ID);
    if (!isOff) return el?.remove?.();
    if (!el && isFn(D.createElement)) {
      const s = D.createElement('style');
      s.id = MOTION_OFF_STYLE_ID;
      sa(s, 'data-ag-owned', '1');
      s.textContent = 'html[data-ag-cs-style][data-ag-cs-motion="off"]{&,& *,& *::before,& *::after{animation:none!important;transition:none!important}}';
      (D.head || de())?.appendChild?.(s);
    }
  };

  const refreshOpenUiForLanguage = () => {
    const inHero = !!(qs(D, '.agy-home [data-testid="home-greeting"]'));
    if (inHero && cfg.homeLayout === 'studio' && !getHomeStudioMod()) requestHomeStudioChannelIfNeeded();
    homeStudioCtl.syncGreeting(inHero);
    if (inHero && cfg.homeLayout === 'studio') { homeStudioCtl.renderHomePanel(true); const hp = qs(D, '.ag-cs-home-panel'); if (hp) { setAttrIfChanged(hp, A_PB, '1'); setAttrIfChanged(hp, A_PM, '1'); } }
    syncComposers(null);
    ensureSettingsSection();
    try { hostEnhancerCtl.onThemeChange?.(false); hostEnhancerCtl.sync?.(); } catch {}
    syncAbsorbedModules();
    try { modelGlyphCtl.syncModelSelectorPanel?.(latestPrimaryModelInfo); } catch {}
    ensurePulseBridge(true);
  };

  const syncMotionSpringTokens = () => {
    const h = de();
    if (!isFn(h?.style?.setProperty) || !isFn(motionEngine?.springLinear)) return;
    try {
      const r = motionEngine.springLinear({ stiffness: 420, damping: 32, mass: 1 }), easing = typeof r === 'string' ? r : r?.easing;
      if (easing) { sp(h, '--ag-spring-sidebar-ease', easing); sp(h, '--ag-spring-sidebar-dur', `${Math.round((typeof r === 'object' && r?.durationMs) || 300)}ms`); }
    } catch {}
  };

  function syncAbsorbedModules(force = false) {
    const tel = W.__agPrismTelemetry, eff = W.__agPrismEffortSlider, th = W.__agPrismThought, thUi = W.__agPrismThoughtSettingsUi;
    const omni = W.__agPrismOmni, meta = W.__agPrismOmniServerMeta || null, sb = W.__agPrismSidebar, sbMeta = W.__agPrismSidebarMeta || null;
    const ctxMenu = W.__agPrismContextMenu || GT.__agPrismContextMenu, hiInst = W.__agPrismHostI18n;
    if (ctxMenu && !ownedCtxMenu) ownedCtxMenu = ctxMenu;
    const motionLv = getMotionLevel(), ctxEnabled = isContextMenuEnabled() && !destroyed, hiMode = getHostLocalizationMode(), curLang = getLang();
    const key = [
      VERSION, curLang, motionLv, getTelemetryMode(), getEffortSliderMode(), getEffortSliderStyle(), getEffortMemoryMode(), hiMode,
      getThoughtTranslateMode(), getThoughtTriggerTiming(), getThoughtView(), getOmniMode(), getLinkTarget(),
      +(cfg.sidebarStudio === 'on'), +ctxEnabled, meta?.baseUrl || '', sbMeta?.version || '', +!!sbMeta?.serviceReady,
      +!!tel, +!!eff, +!!hiInst, +!!th, +!!thUi, +!!omni, +!!sb, +!!ctxMenu,
    ].join('|');
    if (!force && key === lastAbsorbedSyncKey) return;
    lastAbsorbedSyncKey = key;
    const run = (fn) => { try { fn(); } catch {} };
    run(() => tel?.sync?.(cfg));
    run(() => eff?.sync?.(cfg));
    run(() => {
      if (hiMode === 'auto' && curLang !== 'zh-CN') { hiInst?.destroy?.(); ra(de(), 'data-ag-prism-host-i18n'); }
      else if (isFn(hiInst?.setMode)) hiInst.setMode(hiMode === 'on' ? 'on' : hiMode === 'off' ? 'off' : 'auto');
    });
    run(() => th?.sync?.(cfg));
    run(() => (getOmniMode() === 'off' ? omni?.destroy?.() : omni?.sync?.(cfg, meta)));
    run(() => sb?.sync?.(cfg, sbMeta));
    run(() => ctxMenu?.sync?.({ enabled: ctxEnabled, lang: curLang, motionLevel: motionLv }));
    run(() => byId(SETTINGS_SEC_ID)?.__prismMountThoughtUi?.());
  }

  const invRim = () => { prismRimCtl.invalidateMetrics?.(); prismRimCtl.markDirty(); };
  function applyRootAttrs(forceAbsorbed = false) {
    const html = D.documentElement;
    if (!html) return;
    const palette = getEffectivePalette();
    const lightPreset = getLightPreset();
    const lang = getLang();
    const motionLv = getMotionLevel();
    const targetFps = getTargetFps();
    const telemetryMod = getTelemetryMode();
    const effortSliderMod = getEffortSliderMode();
    const dark = isDarkTheme();

    runGuardedMut(() => {
      const csA = {
        style: '1', theme: dark ? 'dark' : 'light', palette, 'light-preset': lightPreset, motion: motionLv,
        'target-fps': targetFps, telemetry: telemetryMod, 'effort-slider': effortSliderMod, 'effort-style': getEffortSliderStyle(),
        'thought-translate': getThoughtTranslateMode(), accent: getAccentTone(), corners: getCornerStyle(),
        'scroll-bottom': cfg.scrollBottomMotion, 'code-font': getCodeFont(),
        ligatures: isCodeLigaturesEnabled() ? '1' : '0', ambient: getAmbientCssValue(),
        'dark-aura': cfg.darkAura,
        'dark-aura-style': cfg.darkAuraStyle,
        home: cfg.homeLayout,
        composer: cfg.composer, 'logo-ink': cfg.logoInk === 'foreground' ? 'foreground' : 'accent',
        sidebar: cfg.sidebar, 'sidebar-compact': cfg.sidebarCompact ? 'on' : 'off',
        'sb-fold': cfg.sidebarNavFold, lang,
      };
      for (const [k, v] of O.entries(csA)) setAttrIfChanged(html, 'data-ag-cs-' + k, v);
      for (const [k, v] of [['', VERSION], ['-omni', getOmniMode()], ['-link-target', getLinkTarget()], ['-sidebar-studio', cfg.sidebarStudio]]) {
        setAttrIfChanged(html, 'data-ag-prism' + k, v);
      }
      if (cfg.sidebarRestyle === false) {
        if (ha(html, 'data-ag-cs-sidebar-collapsed')) ra(html, 'data-ag-cs-sidebar-collapsed');
        qa(D, '.ag-cs-sidebar-glide-pill').forEach((n) => n.remove());
      }
      if (isFn(i18nCore?.isCjkLanguage) ? i18nCore.isCjkLanguage(lang) : isZh()) setAttrIfChanged(html, 'data-ag-cs-cjk', '1');
      else if (ha(html, 'data-ag-cs-cjk')) ra(html, 'data-ag-cs-cjk');

      syncMotionOffStyle(motionLv === 'off');
      syncAbsorbedModules(forceAbsorbed);
      const tv = 'data-ag-prism-thought-view';
      if (getThoughtTranslateMode() === 'off') { if (ha(html, tv)) ra(html, tv); }
      else setAttrIfChanged(html, tv, getThoughtView());
      syncCaretListeners(cfg.smoothCaret !== false);

      if (telemetryMod !== lastAppliedTelemetry) {
        const prevTel = lastAppliedTelemetry;
        lastAppliedTelemetry = telemetryMod;
        if (prevTel) ensurePulseBridge(telemetryMod !== 'off');
      }

      const refreshOptics = () => { rippleCtl.refreshTheme(); convAuraCtl.sync(); convAuraCtl.refreshTheme(); invRim(); };
      if (motionLv !== lastAppliedMotion) {
        const prevMotion = lastAppliedMotion;
        lastAppliedMotion = motionLv;
        if (prevMotion) try { rippleCtl.sync?.(); } catch {}
        refreshOptics();
        if (prevMotion) {
          dirtyFlags.c = true; syncHostAnimatedIcons(null); streamChoreoCtl.syncDualStreamEngine();
          modelGlyphCtl.syncModelSelectorPanel?.(latestPrimaryModelInfo);
        }
      }
      if (lang !== lastAppliedLang) {
        const prevLang = lastAppliedLang;
        lastAppliedLang = lang;
        if (prevLang) refreshOpenUiForLanguage();
      }
      const themeKey = `${palette}|${lightPreset}|${dark ? 'd' : 'l'}|${getAccentTone()}|${getAmbientIntensitySetting()}|${cfg.darkAura}|${cfg.darkAuraStyle}|${getCornerStyle()}`;
      if (themeKey !== lastThemeKey) {
        lastThemeKey = themeKey;
        refreshOptics();
        try { hostEnhancerCtl.onThemeChange?.(); } catch {}
      }
      const metricsKey = `${lang}|${getCodeFont()}|${isCodeLigaturesEnabled() ? 1 : 0}|${getCornerStyle()}|${cfg.composerRestyle === false ? 0 : 1}`;
      if (metricsKey !== lastMetricsKey) {
        const hadPrev = lastMetricsKey !== '';
        lastMetricsKey = metricsKey;
        if (hadPrev) { invRim(); smoothCaretCtl.bumpMetricsEpoch(); smoothCaretCtl.queue(false, true, true); }
      }
    });
  }

  // ── Composer Prism Box, Placeholder, Glyph & Mascot Clearance ──────────
  const T_TK = 'interaction-takeover-card', T_RP = 'running-items-panel', T_QM = 'queued-messages-card', T_SQ = 'side-question-panel', S_RP = '[data-testid="running-items-panel"]', S_IB = '[data-testid="agent-input-box"]', S_SUB = '[data-testid="subagent-tab-conversation"]';
  const TK_SEL = '[data-testid="interaction-takeover-card"], [data-testid="side-question-panel"]', A_Q = 'data-ag-cs-queued', A_QA = 'data-ag-queued-act', A_TK = 'data-ag-cs-takeover', A_TKO = A_TK + '-open', A_PB = 'data-ag-cs-prism-box', A_PM = 'data-ag-cs-prism-mirror';
  const seenClrWraps = new WeakSet();
  const setClr = (el, a, on, gap = '46px') => {
    if (!el) return;
    if (on) { seenClrWraps.add(el); setAttrIfChanged(el, a, '1'); if (el.style.getPropertyValue('margin-bottom') !== gap) el.style.setProperty('margin-bottom', gap, 'important'); }
    else if (ha(el, a)) { ra(el, a); rp(el, 'margin-bottom'); }
  };
  const isRunOpen = (el) => tidOf(el) === T_RP && String(el.className || '').includes('grid-rows-[1fr]');
  const gp = (el, p) => el?.style?.getPropertyValue?.(p) || el?.style?.[p] || '';
  const csOf = (el, m) => { if (!el) return null; if (m?.has(el)) return m.get(el); let c = null; try { c = W.getComputedStyle?.(el) || null; } catch {} m?.set(el, c); return c; };
  const styV = (el, p, m) => gp(el, p) || csOf(el, m)?.[p] || '';
  const isCt = (el, m) => { const d = styV(el, 'display', m); return d === 'contents' || (!d && clHas(el, 'contents')); };
  const isHidEl = (el, lay, m) => {
    if (!isElementLike(el) || el.hidden || ha(el, 'hidden') || ga(el, 'aria-hidden') === 'true' || /(?:^|\s)(?:hidden|sr-only|grid-rows-\[0fr\]|h-0|max-h-0)(?:\s|$)/.test(el.className || '')) return true;
    const sd = gp(el, 'display'), sv = gp(el, 'visibility');
    if (sd === 'none' || sv === 'hidden') return true;
    const cs = !sd || !sv ? csOf(el, m) : null, dp = sd || cs?.display || '', vs = sv || cs?.visibility || '';
    if (dp === 'none' || vs === 'hidden') return true;
    if (dp === 'contents' || (!dp && clHas(el, 'contents')) || !lay || isRunOpen(el)) return false;
    if (isFn(el.checkVisibility) && !el.checkVisibility()) return true;
    const r = rc(el);
    return !!(r && (r.height <= 1 || r.width <= 1));
  };
  const hasVisQ = (el, lay, d = 0, m = null) => {
    if (!el || d > 4 || /(?:^|\s)ag-(?:cs|v2|prism|omni|pulse)-/.test((el.className || '') + ' ' + (el.id || ''))) return false;
    if (isHidEl(el, lay, m)) {
      const p = lay && !isHidEl(el, false, m) && qs(el, S_RP);
      if (!p || !isRunOpen(p)) return false;
      for (let c = p; c && c !== el; c = c[K_PE]) if (isHidEl(c, false, m)) return false;
      return true;
    }
    const t = tidOf(el);
    if (t === T_RP) return String(el.className || '').includes('grid-rows-[1fr]');
    if (t === T_QM) return true;
    const ks = AF(el.children || []);
    if (!ks.length) return !!(el[K_TC] || '').trim() || /^(?:IMG|SVG|CANVAS|INPUT|TEXTAREA|BUTTON)$/.test(tagU(el));
    return AF(el.childNodes || []).some((n) => n?.nodeType === 3 && String(n.nodeValue || '').trim()) || ks.some((k) => hasVisQ(k, lay, d + 1, m));
  };

  const findVisQueuedCard = (el, lay, m) => {
    if (!el || isHidEl(el, lay, m)) return null;
    const q = tidOf(el) === T_QM ? el : qs(el, `[data-testid="${T_QM}"]`);
    if (!q || isHidEl(q, lay, m)) return null;
    for (let c = q[K_PE]; c && c !== el; c = c[K_PE]) if (isHidEl(c, lay, m)) return null;
    return q;
  };

  const syncModelMenuRootAttrs = (panel) => {
    const h = de();
    if (panel) { h && setAttrIfChanged(h, 'data-ag-cs-model-menu', '1'); const ov = cl(panel, '.agy-overlay'); ov && setAttrIfChanged(ov, 'data-ag-cs-model-overlay', '1'); }
    else { ra(h, 'data-ag-cs-model-menu'); qa(D, '[data-ag-cs-model-overlay]').forEach((el) => ra(el, 'data-ag-cs-model-overlay')); }
  };

  const measureCardClr = (card, ib, act, isPri = true, m = null, pTk = null) => {
    if (!ib) return null;
    const inSub = !!(cl(ib, S_SUB)), ea = !!(act && !inSub && ga(de(), 'data-ag-prism-mode') !== 'chat'), og = !inSub && !!isPri;
    const mo = !!(ea && qs(ib, '[role="listbox"], [role="option"], [data-testid="slash-command-menu"]'));
    let _lay, low = false, visTk = false, queuedAnchor = null;
    const getLay = () => (_lay ??= (card?.offsetHeight || rc(card)?.height || 0) > 0), sh = cl(card, '#antigravity\\.agentSidePanelInputBox') || card[K_PE], ops = [];
    const pq = (el, ok) => { const on = ea && ok && !low; ops.push([el, A_Q, on, '46px']); if (on) low = true; };
    if (sh && sh !== ib) for (const ch of sh.children || []) {
      if (ch === card) break;
      const p = tidOf(ch) === T_RP ? ch : qs(ch, S_RP);
      pq(ch, !!(p && isRunOpen(p) && !isHidEl(ch, false, m) && !isHidEl(p, false, m)));
    }
    let stop = sh && sh !== ib ? sh : card;
    while (stop?.[K_PE] && stop[K_PE] !== ib) stop = stop[K_PE];
    const ibC = AF(ib.children || []);
    for (let i = ibC.indexOf(stop) - 1; i >= 0; i--) {
      const ch = ibC[i], qCard = ea && !low && !queuedAnchor ? findVisQueuedCard(ch, getLay(), m) : null;
      if (qCard) {
        queuedAnchor = qCard;
        ops.push([ch, A_Q, false, '46px']);
        continue;
      }
      pq(ch, hasVisQ(ch, getLay(), 0, m));
    }
    const slot = clHas(ib[K_PE], 'contents') ? ib[K_PE] : ib, wrap = slot[K_PE], scope = og ? (cl(ib, '[data-testid="conversation-view"]') || D) : wrap;
    if (scope) {
      const seen = new Set(), all = qa(scope, TK_SEL);
      for (let i = all.length - 1; i >= 0; i--) {
        const c = all[i];
        if (!inSub && cl(c, S_SUB)) continue;
        let tgt = c, hid = false, lay = getLay();
        for (let cur = c, d = 0; cur && cur !== scope && cur !== D.body && d < 5; cur = cur[K_PE], d++) {
          if (isHidEl(cur, lay, m)) hid = true;
          if (wrap && cur[K_PE] === wrap && cur !== slot && !isCt(cur, m) && !qs(cur, S_IB)) tgt = cur;
        }
        if (tgt === c) {
          const p = c[K_PE];
          if (p && p !== scope && p !== wrap && p !== D.body && p !== ib && !tidOf(p) && p.children?.length === 1 && !isCt(p, m) && !qs(p, S_IB)) {
            const pos = styV(p, 'position', m);
            if (!(pos ? pos === 'absolute' || pos === 'fixed' : /(?:^|\s)(?:absolute|fixed)(?:\s|$)/.test(p.className || ''))) tgt = p;
          }
        }
        if (!hid) visTk = true;
        if (seen.has(tgt)) continue;
        const on = ea && !hid && !low;
        if (og && on) pTk?.add(tgt);
        if (og || !pTk?.has(tgt)) ops.push([tgt, A_TK, on, tgt === c && tidOf(c) === T_TK ? '52px' : '46px']);
        if (on) low = true;
        seen.add(tgt);
      }
      for (const s of qa(scope, '[' + A_TK + ']')) if (!seen.has(s) && (inSub || !cl(s, S_SUB)) && (og || !pTk?.has(s))) ops.push([s, A_TK, false, '46px']);
    }
    return { ib, mo, ops, og, tko: og && ea && visTk, queuedAnchor };
  };

  const syncCrabClearance = (card, ib, act, isPri = true, pl = null) => {
    const p = pl || measureCardClr(card, ib, act, isPri);
    if (!p) return;
    if (p.mo) setAttrIfChanged(p.ib, 'data-ag-cs-menu-open', '1'); else if (ha(p.ib, 'data-ag-cs-menu-open')) ra(p.ib, 'data-ag-cs-menu-open');
    for (const [el, a, on, g] of p.ops) setClr(el, a, on, g);
    if (p.og) { const h = de(); if (p.tko) setAttrIfChanged(h, A_TKO, '1'); else if (ha(h, A_TKO)) ra(h, A_TKO); }
  };

  const S_CV = '[data-testid="conversation-view"]', S_CC = '.surface-composer-card';
  let activePaneCard = null, activeConvView = null, lastNotifiedPaneCard = null, lastNotifiedConvView = null;
  const lastModelByCard = new WeakMap();
  const isLiveMainCard = (c) => !!(c && c[K_IC] !== false && !cl(c, S_SUB) && !c.hidden && c.style?.display !== 'none');
  const isLiveMainConv = (v) => !!(v && v[K_IC] !== false && !cl(v, S_SUB) && !v.hidden && v.style?.display !== 'none' && !cl(v, '.agy-home') && !qs(v, '.agy-home'));
  const findCardForTarget = (t) => {
    if (!t?.closest) return null;
    for (const [sel, q] of [[S_CC, 0], [S_IB, S_CC], [S_CV, `${S_IB} ${S_CC},${S_CC}`], ['[data-tiling-pane]', `${S_IB} ${S_CC}`]]) {
      const h = cl(t, sel);
      if (!h || (sel === S_CV && cl(h, S_SUB))) continue;
      const c = q ? qs(h, q) : h;
      if (isLiveMainCard(c)) return c;
    }
    return null;
  };
  const findConvForTarget = (t, fb = null) => {
    const cv = (t?.closest && cl(t, S_CV)) || (fb?.closest && cl(fb, S_CV)) || (t?.closest && qs(cl(t, '[data-tiling-pane]'), S_CV)) || null;
    return isLiveMainConv(cv) ? cv : null;
  };
  const notifyActivePaneModules = (card, cv, force = false) => {
    const nc = isLiveMainCard(card) ? card : null, nv = isLiveMainConv(cv) ? cv : findConvForTarget(nc, nc);
    if (!force && nc === lastNotifiedPaneCard && nv === lastNotifiedConvView) return;
    lastNotifiedPaneCard = nc; lastNotifiedConvView = nv;
    const anc = nv || nc;
    if (nv) try { convAuraCtl.setActiveView?.(nv); } catch {}
    if (anc) {
      let bar = null;
      try { const tel = W.__agPrismTelemetry; bar = tel?.setActiveBar?.(anc) || tel?.getBarForView?.(anc) || null; } catch {}
      try { (pulseBridgeInst || W.__agCsPulseBridgeInst)?.setActiveHost?.(bar || anc); } catch {}
    }
  };
  const trackActivePaneFromTarget = (t, sched = true) => {
    if (destroyed || !t?.closest || cl(t, '#' + SETTINGS_SEC_ID + ',#ag-prism-periodic-picker-root,[role="dialog"]')) return false;
    const nc = findCardForTarget(t), nv = findConvForTarget(t, nc);
    if (!nc && !nv) return false;
    const chg = (nc && nc !== activePaneCard) || (nv && nv !== activeConvView);
    if (nc) activePaneCard = nc;
    if (nv) activeConvView = nv;
    if (chg) {
      notifyActivePaneModules(activePaneCard, activeConvView);
      if (sched) { dirtyFlags.c = true; scheduleSync(); }
      return true;
    }
    return false;
  };
  const resolveActivePrimaryCard = (cards) => {
    if (!cards?.length) { activePaneCard = null; if (activeConvView && !isLiveMainConv(activeConvView)) activeConvView = null; return null; }
    if (activePaneCard && cards.includes(activePaneCard) && isLiveMainCard(activePaneCard)) return activePaneCard;
    const ac = findCardForTarget(D.activeElement);
    const pick = (ac && cards.includes(ac) ? ac : null) || cards.find((c) => !cl(c, S_SUB)) || cards[0] || null;
    activePaneCard = pick && !cl(pick, S_SUB) ? pick : null;
    const cv = findConvForTarget(activePaneCard, activePaneCard);
    if (cv) activeConvView = cv; else if (activeConvView && !isLiveMainConv(activeConvView)) activeConvView = null;
    return pick;
  };

  let latestPrimaryModelInfo = null, latestPaneModelMap = new Map(), lastSyncedAwaitingDecision = null, lastSyncedHasError = false;
  const detectVisibleDecisionTakeover = (m = null, sc = null) => {
    if (sc && isLiveMainConv(sc)) {
      for (const el of qa(sc, TK_SEL)) if (!cl(el, S_SUB) && !isHidEl(el, false, m)) return true;
      if (qa(D, S_CV).length > 1) return false;
    }
    for (const el of qa(D, TK_SEL)) {
      if (cl(el, S_SUB) || (sc && cl(el, S_CV) && cl(el, S_CV) !== sc)) continue;
      if (!isHidEl(el, false, m)) return true;
    }
    return false;
  };
  const measureCrabClearanceAll = () => {
    const cards = AF(qa(D, `${S_IB} ${S_CC}`)), pri = resolveActivePrimaryCard(cards), priCv = findConvForTarget(pri, pri);
    const mOn = isMascotEnabled(), m = new Map(), pTk = new Set(), byCard = new Map();
    for (const c of pri ? [pri, ...cards.filter((x) => x !== pri)] : cards) {
      const ip = c === pri;
      byCard.set(c, measureCardClr(c, cl(c, S_IB), ip && mOn, ip, m, pTk));
    }
    return { cards, primaryCard: pri, primaryConv: priCv, byCard, awaitingDecision: detectVisibleDecisionTakeover(m, priCv) };
  };
  const syncConvAuraSemantics = (activeInfo, preAwaiting) => {
    if (!isFn(convAuraCtl.setSemanticState)) return;
    const awaitingNow = typeof preAwaiting === 'boolean' ? preAwaiting : detectVisibleDecisionTakeover(), errNow = !!(activeInfo?.hasError), freshErrorEdge = errNow && !lastSyncedHasError;
    lastSyncedHasError = errNow;
    if (awaitingNow !== lastSyncedAwaitingDecision || freshErrorEdge) { lastSyncedAwaitingDecision = awaitingNow; convAuraCtl.setSemanticState({ awaitingDecision: awaitingNow ? true : null, hasError: freshErrorEdge }); }
  };
  const syncQueuedPrismBoxes = () => {
    const qCards = qa(D, '[data-testid="queued-messages-card"], [data-testid="interaction-takeover-card"]');
    if (!qCards?.length) return;
    const allow = cfg.composerRestyle !== false && ga(de(), 'data-ag-prism-mode') !== 'chat', AR = 'data-ag-cs-prism-reflect';
    for (const q of qCards) {
      if (allow && !cl(q, S_SUB)) {
        const isNew = ga(q, A_PB) !== '1' || ga(q, AR) !== 'bottom';
        setAttrIfChanged(q, A_PB, '1'); setAttrIfChanged(q, AR, 'bottom');
        if (isNew) invRim();
      } else if (ha(q, A_PB) || ha(q, AR)) {
        ra(q, A_PB); ra(q, AR); rp(q, '--ag-px'); rp(q, '--ag-py'); invRim();
      }
    }
  };
  const syncPopupOverlayMirrors = () => {
    const ovs = qa(D, '.agy-overlay');
    if (!ovs?.length) return;
    let touched = false;
    for (const ov of ovs) {
      if (ha(ov, 'data-hover-card-popup') || tidOf(ov) === 'model-selector-panel' || (ga(ov, 'role') !== 'menu' && !clHas(ov, 'max-h-48'))) continue;
      if (ga(ov, A_PB) !== '1' || ga(ov, A_PM) !== '1') touched = true;
      setAttrIfChanged(ov, A_PB, '1'); setAttrIfChanged(ov, A_PM, '1');
    }
    if (touched) prismRimCtl.markDirty();
  };

  function syncComposers(measured, skipSparks = false) {
    const cPlan = measured?.cPlan || measureCrabClearanceAll(), { cards, primaryCard, primaryConv } = cPlan, ui = uiText(getLang()), mascotOn = isMascotEnabled(), hs = streamChoreoCtl.heroState;
    if (!measured) syncModelMenuRootAttrs(qs(D, MODEL_PANEL_SEL));
    if (!primaryCard || cl(primaryCard, S_SUB)) { const h = de(); if (ha(h, A_TKO)) ra(h, A_TKO); }
    const inHomeCtx = !!qs(D, '.agy-home'), basePathCtx = (inHomeCtx ? 'H:' : 'C:') + (W.location?.pathname || ''), paneModelMap = new Map();
    let primaryModelInfo = null;
    for (const card of cards) {
      const inputBox = cl(card, S_IB), zLayer = cl(inputBox, '.z-10'), isPrimary = card === primaryCard, inSubCard = !!cl(card, S_SUB);
      if (zLayer) setAttrIfChanged(zLayer, 'data-ag-cs-input-layer', '1');
      const wantPrismBox = !inSubCard && cfg.composerRestyle !== false && !card.hidden && card.style?.display !== 'none';
      if (wantPrismBox) {
        if (ga(card, A_PB) !== '1') prismRimCtl.markDirty();
        setAttrIfChanged(card, A_PB, '1');
      } else if (ha(card, A_PB)) {
        ra(card, A_PB); rp(card, '--ag-px'); rp(card, '--ag-py'); invRim();
      }
      syncCrabClearance(card, inputBox, mascotOn && isPrimary, isPrimary, cPlan.byCard.get(card) || null);
      const p = qs(card, 'div.relative.w-full p.pointer-events-none');
      if (p) {
        if (cfg.composerRestyle !== false && cfg.placeholderStyle === 'studio') setAttrIfChanged(p, 'data-ag-cs-placeholder', ui.studioPlaceholder || 'How can I help you today?');
        else if (ha(p, 'data-ag-cs-placeholder')) ra(p, 'data-ag-cs-placeholder');
      }
      const modelBtn = qs(card, '[data-testid="model-selector-trigger"]'), mInfo = modelGlyphCtl.syncModelGlyphOnButton(modelBtn);
      if (mInfo && !inSubCard) {
        if (isPrimary) primaryModelInfo = mInfo;
        const cardCv = cl(card, S_CV), cardPane = cl(card, '[data-tiling-pane]'), paneBrand = mInfo.brand || 'gemini';
        if (cardCv) { setAttrIfChanged(cardCv, 'data-ag-cs-pane-camp', paneBrand); paneModelMap.set(cardCv, mInfo); }
        if (cardPane) setAttrIfChanged(cardPane, 'data-ag-cs-pane-camp', paneBrand);
        const cleanLbl = modelGlyphCtl.readButtonLabelWithoutGlyph(modelBtn);
        if (cleanLbl) {
          const normLbl = modelGlyphCtl.normalizeModelEffortLabel ? modelGlyphCtl.normalizeModelEffortLabel(cleanLbl) : cleanLbl, modelSig = `${mInfo.brand}:${normLbl.toLowerCase()}`;
          const cardCid = ga(cardCv, 'data-cascade-id') || ga(cl(card, '[data-cascade-id]'), 'data-cascade-id') || '';
          const cardCtx = basePathCtx + (cardCid ? '#' + cardCid : '');
          const dd = ga(modelBtn, 'data-disabled');
          const prev = lastModelByCard.get(card);
          if (!prev || prev.ctx !== cardCtx) {
            lastModelByCard.set(card, { sig: modelSig, ctx: cardCtx });
          } else if (modelSig !== prev.sig) {
            lastModelByCard.set(card, { sig: modelSig, ctx: cardCtx });
            if (!(modelBtn.disabled || ha(modelBtn, 'disabled') || ga(modelBtn, 'aria-disabled') === 'true' || (dd != null && dd !== 'false'))) {
              if (isPrimary) hs.pendingModelShiftNotify = true;
              if (isMotionUltra()) streamChoreoCtl.triggerHeroDFiberPulse(card, modelBtn, mInfo.brand);
            }
          }
          if (isPrimary) {
            hs.lastModelSig = modelSig;
            hs.lastModelCtx = cardCtx;
            hs.lastModelCard = card;
          }
        }
      }
    }
    syncQueuedPrismBoxes();
    latestPrimaryModelInfo = primaryModelInfo;
    latestPaneModelMap = paneModelMap;
    if (primaryCard || primaryConv) notifyActivePaneModules(primaryCard, primaryConv);
    const priPlan = primaryCard ? cPlan.byCard.get(primaryCard) : null;
    const pulseOpen = readOpenPulseCardState();
    const pulseCoversPri = !!(pulseOpen.openNow && (!pulseOpen.openHost || !primaryConv || primaryConv.contains?.(pulseOpen.openHost) || primaryCard?.contains?.(pulseOpen.openHost)));
    const mascotShouldPeek = !!(
      cPlan.awaitingDecision ||
      priPlan?.mo ||
      priPlan?.ops?.some(([, , on]) => on) ||
      pulseCoversPri ||
      ga(de(), 'data-ag-pp-open') === '1'
    );
    const activeInfoForCrab = getLightweightActiveInfo(primaryCard);
    queuedCrabAnchor = priPlan?.queuedAnchor || null;
    syncCrab(primaryCard, activeInfoForCrab, primaryModelInfo, mascotShouldPeek ? 'peek' : 'none');
    syncConvAuraSemantics(activeInfoForCrab, cPlan.awaitingDecision);
    if (hs.pendingModelShiftNotify) {
      hs.pendingModelShiftNotify = false;
      notifyMascot('model-shift');
    }
    modelGlyphCtl.syncModelSelectorPanel(primaryModelInfo);
    if (!skipSparks) streamChoreoCtl.syncThinkingSparks(primaryModelInfo, paneModelMap);
    if (measured && 'caretList' in measured) {
      smoothCaretCtl.applyMutations(measured.caretList, false);
    } else {
      smoothCaretCtl.sync(false, false);
    }
  }

  // ── Incremental 21 Host Animated Icons ─────────────────────────────────
  const findOriginalHostSvg = (btn) => {
    if (!btn || !btn.querySelectorAll) return null;
    for (const svg of qa(btn, 'svg')) {
      if (svg.classList?.contains?.('ag-anim-icon')) continue;
      return svg;
    }
    return null;
  };

  const EXT_ZH_UI_SEL = '[data-agy-hans-ui], #agy-theme-switcher, #agy-theme-menu, #antigravity-quota-widget, #antigravity-translation-audit';

  const detectHostIconTarget = (btn) => {
    if (!btn || clHas(btn, 'ag-prism-thought-raw-toggle') || cl(btn, '.ag-prism-thought-overlay')) return '';
    const tid = tidOf(btn).toLowerCase();
    if (/^(?:model-selector-trigger|app-icon-new-conversation-button|input-cancel-button|stop-button|sidebar-add-project-button|toggle-overview-panel)$/.test(tid)) return '';
    if (cl(btn, '#' + SETTINGS_SEC_ID + ', #ag-prism-periodic-picker-root, [role="dialog"], .ag-cs-home-panel, [data-testid="orchestrator-effort-bar"], .ag-cs-crab, ' + EXT_ZH_UI_SEL)) return '';
    if (qs(btn, '.ag-cs-model-glyph, .ag-spark-orbit-svg, .ag-cs-thinking-spark')) return '';
    if (ha(btn, 'data-ag-cs-filter-btn') || tid === 'sidebar-search-button' || tid === 'conversation-filter-button') return 'search';
    if (tid === 'new-conversation-button') return 'sparkles-pen';
    if (/^(?:(?:sidebar-toggle|toggle-sidebar)(?:-button)?|toggle-aux-sidebar)$/.test(tid)) return 'panel-left';
    if (tid === 'automations-button') return 'zap-bolt';
    if (tid === 'input-send-button') return 'arrow-up-launch';

    const lc = (k) => String(ga(btn, k) || '').toLowerCase().trim(), aria = lc('aria-label'), title = lc('title'), tip = lc('data-tooltip-id');
    const origSvg = findOriginalHostSvg(btn), svgCls = String(ga(origSvg, 'class') || origSvg?.className || '').toLowerCase();
    const rawLbl = aria || title, okTxt = !/\blucide-/.test(svgCls) && rawLbl.length <= 32 && !/[:：\r\n]/.test(rawLbl) && !/[:：\r\n]/.test(tip);
    const shortMeta = `${tid} ${rawLbl} ${tip}`, labelMeta = `${rawLbl} ${tip}`;

    if (/\blucide-copy\b/.test(svgCls) || (okTxt && /\bcopy\b|复制|複製|コピー/.test(shortMeta))) return 'copy-check';
    if (/\blucide-panel-left\b/.test(svgCls) || (okTxt && /(?:toggle|open|close|show|hide)\s+(?:the\s+)?(?:side\s*panel|sidebar)|切换侧边栏|切換側邊欄|折叠侧边栏|展开侧边栏|サイドバー/.test(labelMeta))) return 'panel-left';
    const role = ga(btn, 'role');
    if (tid === 'settings-button' || tid === 'open-settings-button' || /\blucide-settings\b/.test(svgCls) || (okTxt && (/^(?:open\s+)?settings$|^(?:打开)?设置$|^設定$/.test(rawLbl) || (!rawLbl && /^(?:open[-_\s]?)?settings(?:\b|[-_])/.test(tip))) && role !== 'menuitem' && role !== 'tab')) return 'settings-gear';
    if (!cl(btn, '.agy-composer-footer') && cl(btn, '[data-testid="agent-input-box"], .surface-composer-card') && (/^(?:attachment|add-context|composer-plus|input-add)-button$/.test(tid) || /\blucide-plus\b/.test(svgCls) || (okTxt && /\battach|\badd\b|upload|context|附件|添加/.test(shortMeta)))) return 'plus-spin';
    return '';
  };

  const restoreHostButtonIcon = (btn) => {
    if (!btn) return;
    qa(btn, '.ag-anim-icon').forEach((n) => n.remove());
    qa(btn, `[${A_OS}]`).forEach((orig) => {
      ra(orig, 'hidden'); orig.hidden = false;
      const d = ga(orig, A_OD);
      if (d) { sp(orig, 'display', d); ra(orig, A_OD); } else rp(orig, 'display');
      ra(orig, A_OS);
    });
    ra(btn, A_IC);
    iconPendSig.delete(btn);
  };

  const restoreAllHostAnimatedIcons = () => { qa(D, `[${A_IC}]`).forEach(restoreHostButtonIcon); };

  const isHostButtonCandidate = (el) => {
    if (!isElementLike(el)) return false;
    const tag = tagU(el);
    return tag === 'BUTTON' || ga(el, 'role') === 'button' || (tag === 'A' && tidOf(el) === 'new-conversation-button');
  };

  const HOST_BTN_QUERY = 'button, [role="button"], a[data-testid="new-conversation-button"]';

  const hasAncestorInSet = (el, rootSet) => {
    for (let c = el?.[K_PE]; c; c = c[K_PE]) if (rootSet.has(c)) return true;
    return false;
  };

  const iconSigMap = new WeakMap();
  function syncHostAnimatedIcons(roots = null) {
    if (!animatedIcons || !isFn(animatedIcons.renderIcon) || !isMotionStandardOrUltra()) { restoreAllHostAnimatedIcons(); return; }

    let buttons;
    if (Array.isArray(roots)) {
      perfStats.iconIncrementalRuns += 1;
      const rootSet = roots.length > 1 ? new Set(roots) : null, set = new Set();
      for (const r of roots) {
        if (!r || r[K_IC] === false || isThoughtIsolatedNode(r) || (rootSet && hasAncestorInSet(r, rootSet))) continue;
        if (isHostButtonCandidate(r)) set.add(r);
        for (const el of qa(r, HOST_BTN_QUERY)) if (!isThoughtIsolatedNode(el)) set.add(el);
      }
      if (!set.size) return;
      buttons = set;
    } else {
      perfStats.iconFullRuns += 1;
      buttons = qa(D, HOST_BTN_QUERY);
    }

    const pending = [];
    for (const btn of buttons) {
      if (isThoughtIsolatedNode(btn)) continue;
      const ex = ga(btn, A_IC), origSvg = findOriginalHostSvg(btn);
      if (!ex && !origSvg) continue;
      const rawSvgCls = origSvg ? (ga(origSvg, 'class') || (typeof origSvg.className === 'string' ? origSvg.className : origSvg.className?.baseVal) || '') : '-';
      const bSig = `${tidOf(btn)}|${ga(btn, 'aria-label') || ''}|${ga(btn, 'title') || ''}|${ga(btn, 'data-tooltip-id') || ''}|${ga(btn, 'role') || ''}|${ha(btn, 'data-ag-cs-filter-btn') ? 1 : 0}|${rawSvgCls}`;
      const eqSig = '=' + bSig, hit = iconSigMap.get(btn), p = btn[K_PE], origOk = !origSvg || ha(origSvg, A_OS), hasAnim = ex ? Boolean(qs(btn, '.ag-anim-icon')) : false;
      if (hit && hit.s === (ex ? eqSig : bSig) && hit.p === p && hit.v === origSvg && (!ex || (origOk && hasAnim))) continue;
      const iconName = detectHostIconTarget(btn);
      if (ex) {
        if (ex !== iconName || !origOk) restoreHostButtonIcon(btn);
        else if (hasAnim) { iconSigMap.set(btn, { s: eqSig, p, v: origSvg }); continue; }
        else ra(btn, A_IC);
      }
      if (!iconName) { iconSigMap.set(btn, { s: bSig, p, v: origSvg }); continue; }
      if (!origSvg || !origSvg.parentNode) continue;
      const rawSize = parseInt(ga(origSvg, 'width') || '15', 10), size = Number.isFinite(rawSize) && rawSize >= 12 && rawSize <= 20 ? rawSize : 15;
      pending.push({ btn, iconName, origSvg, size, eqSig });
    }

    if (pending.length <= 20 || !isFn(W.requestAnimationFrame)) {
      for (const it of pending) applySingleHostIcon(it.btn, it.iconName, it.origSvg, it.size, it.eqSig);
    } else {
      const s = pending.length - 16;
      for (let i = s; i < pending.length; i++) { const it = pending[i]; applySingleHostIcon(it.btn, it.iconName, it.origSvg, it.size, it.eqSig); }
      const def = pending.slice(0, s);
      for (const it of def) iconPendSig.set(it.btn, it.eqSig);
      streamChoreoCtl.enqueueDeferredIcons(def);
    }
  }

  // ── Settings Panel & Group Glide Integration ───────────────────────────
  const handledGroupClicks = new WeakSet();

  const runSettingsGroupGlide = (group, prevBtn, nextBtn, prevRectOverride = null, nextRectOverride = null) => {
    if (!group || !prevBtn || !nextBtn || prevBtn === nextBtn || !isMotionStandardOrUltra()) return;
    if (!motionEngine || typeof motionEngine.glideIndicator !== 'function') return;
    const prevRect = prevRectOverride || rc(prevBtn);
    const nextRect = nextRectOverride || rc(nextBtn);
    const pill = D.createElement('div');
    pill.className = 'ag-cs-pill-glide';
    sa(pill, 'aria-hidden', 'true');
    sa(pill, 'data-ag-no-i18n');
    sa(pill, 'data-ag-owned', '1');
    if (nextRect && nextRect.width > 0 && nextRect.height > 0) {
      for (const [k, v] of [
        ['position', 'fixed'],
        ['left', `${Math.round(nextRect.left)}px`],
        ['top', `${Math.round(nextRect.top)}px`],
        ['width', `${Math.round(nextRect.width)}px`],
        ['height', `${Math.round(nextRect.height)}px`],
        ['border-radius', '6px'],
        ['background', 'rgba(148, 163, 184, 0.14)'],
        ['box-shadow', 'inset 0 1px 0 rgba(255, 255, 255, 0.12)'],
        ['pointer-events', 'none'],
        ['z-index', '9999'],
      ]) {
        sp(pill, k, v);
      }
    }
    if (D.body) D.body.appendChild(pill);
    try {
      motionEngine.glideIndicator(pill, prevRect || prevBtn, nextRect || nextBtn, { durationMs: 220 });
    } catch {}
    streamChoreoCtl.scheduleTransient(() => pill.remove(), 240);
  };

  const formatSettingsSummary = (lang, ui) => {
    const pal = getEffectivePalette();
    const palLabel =
      pal === 'host'
        ? ui.optHost || 'Host'
        : pal === 'warm'
        ? ui.optWarm || 'Alabaster'
        : ui.optObsidian || 'Obsidian';
    const lp =
      getLightPreset() === 'alabaster'
        ? ui.optLightAlabaster || 'Warm Alabaster'
        : ui.optLightCrystal || 'Daylight Crystal';
    const ml = getMotionLevel();
    const mlLabel =
      ml === 'off'
        ? ui.optMotionOff || 'Off'
        : ml === 'subtle'
        ? ui.optMotionSubtle || 'Subtle'
        : ml === 'standard'
        ? ui.optMotionStandard || 'Standard'
        : ui.optMotionUltra || 'Ultra';
    return `${palLabel} · ${lp} · ${mlLabel}`;
  };

  const resolveSettingRowActiveValue = (key, lang) =>
    key === 'language' ? lang : key === 'mascot' && cfg.mascot === 'dual' ? 'crab' : normalizeConfigShape(cfg)[key];

  const isSettingButtonMatch = (key, btnValJson, curVal) => {
    if (JSON.stringify(curVal) === btnValJson) return true;
    if (key === 'palette' && (curVal === 'warm' || curVal === 'claude')) {
      return btnValJson === '"warm"' || btnValJson === '"claude"';
    }
    return false;
  };

  let lastSettingsChannelReqAt = 0;

  function requestSettingsChannelIfDialogOpen() {
    if (destroyed) return;
    const now = Date.now();
    if (now - lastSettingsChannelReqAt < 1000) return;
    if (!qs(D, '[role="dialog"]') && !byId(SETTINGS_SEC_ID)) return;
    const bindingName = currentBaseConfig?.binding || cfg?.binding || '__agPrismSetting';
    const fn = W[bindingName];
    if (!isFn(fn)) return;
    lastSettingsChannelReqAt = now;
    try {
      fn(JSON.stringify({ action: 'request-settings-panel' }));
    } catch {}
  }

  function ensureSettingsSection() {
    const settingsPanelMod = getSettingsPanelMod();
    const locMod = getLocalesMod();
    const hasFullLocales = Boolean(locMod && (locMod.__isFullLocales || locMod.UI_TABLE));
    if (!settingsPanelMod || typeof settingsPanelMod.mountOrSyncSettingsSection !== 'function' || !hasFullLocales) {
      requestSettingsChannelIfDialogOpen();
      return;
    }
    settingsPanelMod.mountOrSyncSettingsSection({
      version: VERSION,
      getLang,
      uiText,
      isZh,
      i18nCore,
      formatSettingsSummary,
      resolveSettingRowActiveValue,
      isSettingButtonMatch,
      saveSetting,
      saveSettingsBatch,
      getConfig: () => ({ ...cfg }),
      getThoughtTranslateMode,
      handledGroupClicks,
      runSettingsGroupGlide,
      runGuardedMut,
    });
  }

  // ── Pulse Physical Water Vial Bridge & Micro-Interactions ──────────────
  let pulseBridgeInst = null;
  let motionBinding = null;
  let wasContextCardOpen = false;
  const calibratedPulseFooters = new WeakSet();
  const pulseHealTimers = new Set();

  const PULSE_HOST_SEL = '#ag-prism-pulse-bar,#ag-pulse-status-bar,[data-ag-prism-pulse-bar],[data-ag-prism-fallback="1"],[data-ag-pulse-bar="true"]';
  const collectPulseHosts = () => {
    const out = [], seen = new Set(), add = (n) => { if (n && !seen.has(n)) { seen.add(n); out.push(n); } };
    try { for (const b of W.__agPrismTelemetry?.getBars?.() || []) add(b); } catch {}
    for (const n of qa(D, PULSE_HOST_SEL)) add(n);
    add(byId('ag-prism-pulse-bar')); add(byId('ag-pulse-status-bar'));
    return out;
  };
  const healBlockedExternalPulseBar = () => {
    if (destroyed) return;
    const list = [...qa(D, '#ag-pulse-status-bar,[data-ag-pulse-bar="true"]')], p0 = byId('ag-pulse-status-bar');
    if (p0 && !list.includes(p0)) list.unshift(p0);
    for (const bar of list) {
      if (!bar || ga(bar, 'data-ag-prism-fallback') === '1' || ga(bar, 'data-layout') !== 'blocked') continue;
      const ft = bar[K_PE];
      if (!ft || !clHas(ft, 'agy-composer-footer') || calibratedPulseFooters.has(ft) || (rc(ft)?.width || 0) < 420) continue;
      calibratedPulseFooters.add(ft);
      const pr = ga(ft, 'role'); sa(ft, 'role', 'banner'); W.dispatchEvent?.(new Event('resize'));
      const t = ST(() => { pulseHealTimers.delete(t); if (destroyed) return; pr ? sa(ft, 'role', pr) : ra(ft, 'role'); W.dispatchEvent?.(new Event('resize')); }, 220);
      pulseHealTimers.add(t);
    }
  };
  const readOpenPulseCardState = () => {
    const vis = (c, host) => !!(c && (c[K_IC] !== false || host?.[K_IC] === true) && !c.hidden && ga(c, 'aria-hidden') !== 'true' && c.style?.display !== 'none');
    let openNow = vis(byId('context-card'), null), openHost = null;
    for (const h of collectPulseHosts()) if (vis(h?.shadowRoot?.getElementById?.('context-card'), h)) { openNow = true; openHost = h; break; }
    return { openNow, openHost };
  };
  const syncContextCardOpenNotify = () => {
    const { openNow, openHost } = readOpenPulseCardState();
    if (openHost) {
      try { W.__agPrismTelemetry?.setActiveBar?.(openHost); } catch {}
      try { (pulseBridgeInst || W.__agCsPulseBridgeInst)?.setActiveHost?.(openHost); } catch {}
    }
    const changed = openNow !== wasContextCardOpen;
    if (openNow && !wasContextCardOpen) notifyMascot('vial-opened');
    wasContextCardOpen = openNow;
    if (changed && !destroyed) { dirtyFlags.c = true; scheduleSync(); }
  };

  function ensurePulseBridge(forceSync = false) {
    healBlockedExternalPulseBar();
    syncContextCardOpenNotify();
    if (destroyed || !isFn(pulseVialBridgeMod?.mountPulseVialBridge)) return;
    if (getTelemetryMode() === 'off') {
      if (pulseBridgeInst) { try { pulseBridgeInst.destroy?.(); } catch {} pulseBridgeInst = null; }
      return;
    }
    if (!pulseBridgeInst) {
      try { pulseBridgeInst = pulseVialBridgeMod.mountPulseVialBridge({ win: W, doc: D }); } catch { pulseBridgeInst = null; }
    } else if (forceSync && isFn(pulseBridgeInst.sync)) {
      try {
        void pulseBridgeInst.sync();
      } catch {}
    }
  }

  // ── FastDOM Two-Phase Incremental Synchronization Loop ─────────────────
  let syncQueued = false;
  let syncTimer = null;
  let syncIsRaf = false;

  const cancelScheduledSync = () => {
    if (syncTimer === null) return;
    try {
      if (syncIsRaf && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(syncTimer);
      } else {
        CT(syncTimer);
      }
    } catch {}
    syncTimer = null;
    syncQueued = false;
  };

  const OWN_PLUGIN_SELECTOR =
    '.ag-cs-home-panel-seat, .ag-cs-ripple-host, .ag-cs-conv-aura-host, .ag-cs-crab, .ag-cs-prism-rim-cv, .ag-cs-model-glyph, [data-testid="orchestrator-effort-bar"], .ag-cs-thinking-spark, .ag-cs-smooth-caret, .ag-cs-liftoff-veil, .ag-cs-sidebar-glide-pill, .ag-cs-pill-glide, .ag-cs-stream-chunk, .ag-cs-thought-chunk, .ag-anim-icon, .ag-prism-omni-menu, .ag-prism-omni-pane, .ag-cs-ctx-menu, .ag-cs-ctx-toast, [data-ag-prism-omni-owned="1"], [data-ag-prism-sidebar-owned="1"], .ces-ag-section, .ces-set, #ag-codex-effort-slider-styles, #ag-pulse-status-bar, [data-ag-prism-pulse-bar], [data-ag-prism-fallback="1"], #context-card, #' +
    SETTINGS_SEC_ID +
    ', #ag-prism-css, #ag-prism-omni-css, #ag-prism-sidebar-studio-css, #ag-prism-periodic-picker-root, #ag-prism-periodic-picker-css, .ag-pp-hold-ring, .ag-pp-mini-keycap, #ag-claude-style-css, #ag-prism-motion-off-css, #ag-prism-host-alert-css, ' +
    EXT_ZH_UI_SEL;

  const isOwnPluginNode = (t) => {
    const el = t ? (t.closest ? t : t[K_PE]) : null;
    return !!(el?.closest && (el.closest('[data-ag-owned],[data-prism-ignore]') || el.closest(OWN_PLUGIN_SELECTOR)));
  };
  const isOwnPluginMutation = (m) => isMutAll(m, isOwnPluginNode);

  const FAST_PRUNE_LEAF_TAGS = new Set([
    'SPAN', 'P', 'CODE', 'STRONG', 'EM', 'B', 'I', 'LI', 'TD', 'TH', 'TR', 'BR', 'HR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  ]);

  const syncBgCmdWrapParent = (p) => {
    if (!p || p[K_IC] === false || tagU(p) !== 'DIV') return;
    if (AF(p.children || []).some((c) => tidOf(c) === 'background-task-command')) setAttrIfChanged(p, 'data-ag-cs-bg-cmd-wrap', '1');
    else if (ha(p, 'data-ag-cs-bg-cmd-wrap')) ra(p, 'data-ag-cs-bg-cmd-wrap');
  };

  const stampBgCmdWrap = (scopeOrList) => {
    const isArr = Array.isArray(scopeOrList);
    for (const el of isArr ? scopeOrList : [scopeOrList || D]) {
      if (!el || el[K_IC] === false) continue;
      if (tidOf(el) === 'background-task-command') { syncBgCmdWrapParent(el[K_PE]); continue; }
      if (ha(el, 'data-ag-cs-bg-cmd-wrap')) syncBgCmdWrapParent(el);
      if (!isFn(el.querySelectorAll)) continue;
      if (!isArr) for (const w of qa(el, '[data-ag-cs-bg-cmd-wrap="1"]')) syncBgCmdWrapParent(w);
      for (const c of qa(el, '[data-testid="background-task-command"]')) syncBgCmdWrapParent(c[K_PE]);
    }
  };

  const A_BL = 'data-ag-cs-bleed', BLEED_TRIGS = new Set(['thinking-collapsible-trigger', 'tool-group-collapsible', 'worked-for-collapsible']), bleedEls = new Set();
  const syncBleedTables = () => {
    const hosts = qa(D, '.md-table-host');
    if (!hosts.length && !bleedEls.size) return;
    const next = new Set();
    for (const h of hosts) {
      if (!h || h[K_IC] === false) continue;
      const vp = cl(h, '[data-testid="autoscroll-viewport"]');
      for (let c = h[K_PE]; c && c !== D.body; c = c[K_PE]) {
        if (tagU(c) === 'DIV') {
          const p = c[K_PE], ch = p?.children, pv = c.previousElementSibling !== undefined ? c.previousElementSibling : ch ? ch[AF(ch).indexOf(c) - 1] : null;
          if ((vp && clHas(c, 'flex') && clHas(c, 'items-start') && (p === vp || clHas(p, 'flex-col'))) || BLEED_TRIGS.has(tidOf(pv)) || (clHas(c, 'flex') && clHas(c, 'flex-row') && clHas(p, 'flex-col'))) next.add(c);
        }
        if (c === vp) break;
      }
    }
    for (const e of bleedEls) if (!next.has(e)) { ra(e, A_BL); bleedEls.delete(e); }
    for (const e of next) { setAttrIfChanged(e, A_BL, '1'); bleedEls.add(e); }
  };

  const AH_ID = 'ag-prism-host-alert-css', TS_A = 'data-ag-turbo-dedup', TI_A = 'data-ag-turbo-img';
  const syncHostTurbo = (roots) => {
    const ds = (s) => {
      if (!s || s.id || ga(s, TS_A) === '1') return;
      const t = s[K_TC] || '';
      if (!t.includes('remark-github-blockquote-alert/alert.css')) return;
      if (!byId(AH_ID)) {
        const h = D.head || de();
        if (!h || !D.createElement) return;
        const g = D.createElement('style');
        g.id = AH_ID; sa(g, 'data-ag-prism-turbo', '1'); sa(g, 'data-ag-owned', '1'); g[K_TC] = t; h.appendChild(g);
      }
      sa(s, TS_A, '1'); s.disabled = true; try { if (s.sheet) s.sheet.disabled = true; } catch {}
    };
    const oi = (m) => {
      if (!m || ga(m, TI_A) === '1' || ha(m, 'data-prism-ignore') || cl(m, '[data-prism-ignore]')) return;
      m.decoding = 'async'; sa(m, 'decoding', 'async');
      const ld = ga(m, 'loading');
      if (!ld || ld === 'auto') { m.loading = 'lazy'; sa(m, 'loading', 'lazy'); }
      sa(m, TI_A, '1');
    };
    for (const el of Array.isArray(roots) ? roots : [roots || D]) {
      if (!el || el.isConnected === false) continue;
      const tg = tagU(el);
      if (tg === 'STYLE') ds(el);
      else if (tg === 'IMG') oi(el);
      else if (el.querySelectorAll) {
        for (const s of qa(el, `style:not([id]):not([${TS_A}])`)) ds(s);
        for (const m of qa(el, `img:not([${TI_A}])`)) oi(m);
      }
    }
  };
  const restoreHostTurbo = () => {
    D.getElementById?.(AH_ID)?.remove?.();
    for (const s of qa(D, `style[${TS_A}]`)) {
      s.disabled = false;
      try { if (s.sheet) s.sheet.disabled = false; } catch {}
      ra(s, TS_A);
    }
    for (const m of qa(D, `img[${TI_A}]`)) ra(m, TI_A);
  };

  let axE = null;
  let axO = null;
  const AX_A = 'data-ag-cs-aux-dual';
  const RESIZE_ATTR = 'data-ag-cs-resizing';
  const MASCOT_DRAG_ATTR = 'data-ag-cs-mascot-drag';
  const RESIZE_DEBOUNCE_MS = 120;
  let resizeEndTm = 0;
  let splitDragActive = false;
  const isDragSuspendedRoot = () => {
    const h = de();
    return ga(h, RESIZE_ATTR) === '1' || ga(h, MASCOT_DRAG_ATTR) === '1';
  };
  const finishResizing = (triggerSync = true) => {
    if (resizeEndTm) {
      CT(resizeEndTm);
      resizeEndTm = 0;
    }
    splitDragActive = false;
    const h = de();
    const had = ha(h, RESIZE_ATTR);
    if (had) runGuardedMut(() => ra(h, RESIZE_ATTR));
    if (had && triggerSync && !destroyed) {
      prismRimCtl.markDirty();
      dirtyFlags.a = true;
      scheduleSync();
    }
  };
  const scheduleResizingEnd = () => {
    if (resizeEndTm) CT(resizeEndTm);
    resizeEndTm = ST(() => finishResizing(true), RESIZE_DEBOUNCE_MS);
  };
  const bumpResizingPulse = () => {
    if (destroyed) return;
    const h = de();
    if (h && ga(h, RESIZE_ATTR) !== '1') runGuardedMut(() => sa(h, RESIZE_ATTR, '1'));
    if (!splitDragActive) scheduleResizingEnd();
  };
  const isSplitResizeHandle = (el) => {
    if (!el) return false;
    const split = cl(el, '[data-testid="aux-pane-split"], [data-testid="sidebar-split"]');
    if (split) {
      const sep = split.children?.[1] || null;
      if (sep && (el === sep || sep.contains?.(el))) return true;
      const roleHit = cl(
        el,
        '[role="separator"], [data-testid*="resize"], [data-testid*="sash"], [data-resize-handle], [class*="resiz"], [class*="sash"]'
      );
      if (roleHit && split.contains?.(roleHit)) return true;
    }
    return !!(cl(el, '[data-testid="bottom-terminal-panel-resize-handle"], [data-testid="tiling-splitter"]'));
  };
  const AX_H = /(?:^|[;\s])(?:width\s*:\s*0(?:\s|;|px|%|!|$)|display\s*:\s*none|position\s*:\s*absolute)/i;
  const axV = (e) => !!(e && tagU(e) === 'DIV' && !e.hidden && !ha(e, 'hidden') && ga(e, 'aria-hidden') !== 'true' && ga(e, 'data-split-overlaid') !== 'true' && e.style?.display !== 'none' && e.style?.position !== 'absolute' && e.style?.width !== '0' && e.style?.width !== '0px' && !AX_H.test(ga(e, 'style') || ''));
  const axCh = (s) => [s.firstElementChild !== undefined ? s.firstElementChild : s.children?.[0] || null, s.lastElementChild !== undefined ? s.lastElementChild : s.children?.[s.children.length - 1] || null];
  const axU = (s) => {
    if (!s || s[K_IC] === false) return false;
    const prev = ha(s, AX_A), [f, l] = axCh(s), tr = ga(s, 'data-split-transition');
    const next = !!(tr !== 'maximizing' && tr !== 'restoring' && tr !== 'closing' && f && l && f !== l && axV(f) && axV(l));
    if (next) setAttrIfChanged(s, AX_A, '1'); else if (prev) ra(s, AX_A);
    return next !== prev;
  };
  const syncAuxSplit = () => {
    const s = qs(D, '[data-testid="aux-pane-split"]');
    if (s !== axE) {
      try { axO?.disconnect?.(); } catch {}
      axO = null;
      if (axE?.[K_IC] !== false) ra(axE, AX_A);
      axE = s;
      if (s && typeof MutationObserver === 'function') {
        const o = { attributes: true, attributeFilter: ['hidden', 'aria-hidden', 'style', 'class', 'data-split-overlaid'] };
        const rb = () => {
          if (!destroyed && axO && axE) {
            axO.disconnect();
            try {
              axO.observe(axE, { childList: true, attributes: true, attributeFilter: ['data-split-transition'] });
              const [f, l] = axCh(axE);
              if (f) axO.observe(f, o);
              if (l && l !== f) axO.observe(l, o);
            } catch {}
          }
        };
        axO = new MutationObserver((rs) => {
          if (!destroyed && axE) {
            if (rs?.some?.((r) => r.type === 'childList')) rb();
            let dualChanged = false;
            runGuardedMut(() => { dualChanged = axU(axE); });
            if (!dualChanged && rs?.some?.((r) => r.type === 'attributes' && r.attributeName === 'style')) bumpResizingPulse();
          }
        });
        rb();
      }
    }
    if (s) axU(s);
  };

  const HC_A = 'data-hover-card-popup', HC_S = '[data-hover-card-popup]';
  const SB_SEL = 'aside,[data-testid="sidebar-split"]>div:first-child,[data-testid="conversation-row-sidebar"],[data-testid="project-header"],[data-hover-card-popup]';
  const inSbRow = (e) => !!cl(e, '[data-testid="conversation-row-sidebar"],[data-testid="project-header"],[data-testid="conversation-list-sidebar"]');
  const isHcEl = (el) => {
    if (!el || el === D.body || el === de()) return false;
    const f = el.firstElementChild;
    return !!(ha(el, HC_A) || ha(f, HC_A) || ha(f?.firstElementChild, HC_A) || (ha(el, 'data-base-ui-portal') && qs(el, HC_S)));
  };
  const isHoverCardNode = (n) => { const e = isElementLike(n) ? n : n?.[K_PE]; return !!(e && (isHcEl(e) || cl(e, HC_S))); };
  const inSbP = (el) => !!cl(el, SB_SEL);

  const COMP_TIDS = new Set([
    'agent-input-box',
    'input-cancel-button',
    'stop-button',
    'cancel-button',
    'agent-loading',
    'send-button',
    'input-send-button',
    'model-selector-trigger',
    'interaction-takeover-card',
    'side-question-panel',
    'running-items-panel',
    'queued-messages-card',
  ]);
  const COLL_TIDS = new Set([
    'worked-for-collapsible',
    'thinking-collapsible-trigger',
    'tool-group-collapsible',
    'changed-files-card-header',
    'sidecar-iframe',
    'sidecar-iframe-slot',
    'artifact-view',
  ]);

  const classifyDirtySubtree = (el, isAdded, parentCtx = null) => {
    if (!isElementLike(el)) return;
    const tid = tidOf(el);
    const role = String(ga(el, 'role') || '');
    const cls = typeof el.className === 'string' ? el.className : String(el.className?.baseVal || ga(el, 'class') || '');
    const tg = tagU(el);
    const hasChildEl =
      el.firstElementChild !== undefined ? !!(el.firstElementChild) : !!(el.children && el.children.length > 0);
    const q = (s) => hasChildEl && !!qs(el, s);

    if (!tid && !role && !el.id && !cls.includes('agy-') && !cls.includes('surface-') && FAST_PRUNE_LEAF_TAGS.has(tg) && !hasChildEl) {
      return;
    };

    if (isHcEl(el) || (!parentCtx && cl(el, HC_S))) return;

    if (tid === 'aux-pane-split' || q('[data-testid="aux-pane-split"]')) dirtyFlags.a = true;

    if (tid === 'background-task-command') {
      if (isAdded) {
        dirtyFlags.m = true;
        dirtyBgCmds.add(el);
      }
      return;
    }

    const ancConv = parentCtx ? parentCtx.inConv : !!(cl(el, '[data-testid="conversation-view"]'));
    const ancComp = parentCtx ? parentCtx.inComp : !!(cl(el, S_IB));
    const ancSide = parentCtx ? parentCtx.inSide : inSbP(el);
    const ancDlg = parentCtx ? parentCtx.inDlg : !!(cl(el, '[role="dialog"]'));
    const ancMdl = parentCtx ? parentCtx.inMdl : !!(cl(el, MODEL_PANEL_SEL));

    let touchedButtons = false, inPlainDialog = false, inSbR = false;
    const inConvStream = tid !== 'conversation-view' && tid !== 'agent-input-box' && !cls.includes('agy-home') && ancConv && !ancComp;
    const chkDlg = (rootHit) => {
      inPlainDialog = true;
      if (rootHit || (isAdded && (tg === 'H2' || cls.includes('space-y-2') || q('h2, div.space-y-2')))) dirtyFlags.g = true;
      if (isAdded && (rootHit || cls.includes('agy-overlay'))) dirtyFlags.o = true;
    };

    if (!inConvStream) {
      if (
        cls.includes('agy-home') ||
        tid === 'conversation-view' ||
        tid === 'home-greeting' ||
        q(isAdded ? '.agy-home, [data-testid="conversation-view"], [data-testid="home-greeting"]' : '.agy-home, [data-testid="conversation-view"]')
      ) {
        dirtyFlags.r = dirtyFlags.c = dirtyFlags.l = dirtyFlags.tk = dirtyFlags.cf = touchedButtons = true;
      }

      const isRc = tid === 'conversation-row-sidebar' || tid === 'breadcrumb-segment' || tid === 'conversation-row-history' || q('[data-testid="conversation-row-sidebar"],[data-testid="breadcrumb-segment"],[data-testid="conversation-row-history"]');
      const inSR = !isRc && (parentCtx ? parentCtx.inSR : inSbRow(el));
      if (isRc || ancSide || inSR) {
        if (inSR) {
          inSbR = true;
          if (tid === 'status-loading-spinner' || tid.includes('stop') || tid.includes('cancel') || cls.includes('lucide-square') || cls.includes('lucide-circle-stop') || q('[data-testid="status-loading-spinner"],.lucide-square,.lucide-circle-stop')) dirtyFlags.s = true;
        } else {
          dirtyFlags.s = true;
          if (isAdded) touchedButtons = true;
        }
      }

      if (COMP_TIDS.has(tid) || cls.includes('surface-composer-card') || ancComp || q(`${S_IB}, [data-testid="input-cancel-button"], ${TK_SEL}, [data-testid="queued-messages-card"], .surface-composer-card`)) {
        dirtyFlags.c = dirtyFlags.r = true;
        if (isAdded) touchedButtons = true;
      }

      const isModelOrPulse =
        tid === 'model-selector-panel' ||
        el.id === 'ag-pulse-status-bar' ||
        el.id === 'ag-prism-pulse-bar' ||
        ha(el, 'data-ag-prism-pulse-bar') ||
        ga(el, 'data-ag-prism-fallback') === '1' ||
        ga(el, 'data-ag-pulse-bar') === 'true' ||
        el.id === 'context-card' ||
        ancMdl ||
        q(MODEL_PANEL_SEL + ', #context-card');

      const isDialogRoot = role === 'dialog' || q('[role="dialog"]');

      if (isModelOrPulse) {
        dirtyFlags.c = true;
        if (!ancMdl) {
          dirtyFlags.o = true;
          if (isAdded) touchedButtons = true;
        }
      } else if (isDialogRoot || ancDlg) {
        chkDlg(isDialogRoot);
      } else if (tid === 'overview-panel' || cls.includes('agy-overlay') || q('[data-testid="overview-panel"]') || (q('.agy-overlay') && !q(HC_S))) {
        dirtyFlags.o = true;
      }
    } else {
      if (tid === T_TK || tid === 'queued-messages-card' || tid === 'side-question-panel' || tid === T_RP || tid === 'agent-loading' || q(`${TK_SEL}, [data-testid="queued-messages-card"], ${S_RP}`)) {
        dirtyFlags.c = true;
      }
      if (role === 'dialog' || ancDlg) chkDlg(role === 'dialog');
      else if (tid === 'overview-panel' || cls.includes('agy-overlay')) dirtyFlags.o = true;
    }

    if (isAdded && q('[data-testid="background-task-command"]')) {
      dirtyFlags.m = true;
      dirtyBgCmds.add(el);
    }

    if (isAdded) {
      if (tg === 'STYLE' || tg === 'IMG') {
        dirtyTurboRoots.add(el);
      } else if (hasChildEl) {
        if (inConvStream && isFn(el.getElementsByTagName)) {
          if (el.getElementsByTagName('img').length > 0 || el.getElementsByTagName('style').length > 0) {
            dirtyTurboRoots.add(el);
          }
        } else if (q(`style:not([id]):not([${TS_A}]),img:not([${TI_A}])`)) {
          dirtyTurboRoots.add(el);
        }
      }
    }

    if (tid === 'step-plan' || q('[data-testid="step-plan"]')) dirtyFlags.o = true;
    if (cls.includes('md-table-host') || q('.md-table-host')) dirtyFlags.l = true;

    if (tid === 'thinking-collapsible-trigger') {
      dirtyFlags.l = dirtyFlags.tk = true;
      if (isAdded) dirtyCollapsibleTargets.add(el);
    } else if (tid === 'changed-files-card-header') {
      dirtyFlags.l = dirtyFlags.cf = true;
      if (isAdded) dirtyCollapsibleTargets.add(el);
    } else if (tg === 'PRE' || COLL_TIDS.has(tid)) {
      dirtyFlags.l = true;
      if (isAdded) dirtyCollapsibleTargets.add(el);
    } else if (hasChildEl) {
      const collHit = qs(
        el,
        '[data-testid="worked-for-collapsible"], [data-testid="thinking-collapsible-trigger"], [data-testid="changed-files-card-header"], [data-testid="sidecar-iframe"], [data-testid="sidecar-iframe-slot"], [data-testid="artifact-view"], pre'
      );
      if (collHit) {
        dirtyFlags.l = true;
        if (isAdded) dirtyCollapsibleTargets.add(el);
        const hitTid = tidOf(collHit);
        if (hitTid === 'thinking-collapsible-trigger' || qs(el, '[data-testid="thinking-collapsible-trigger"]')) {
          dirtyFlags.tk = true;
        }
        if (hitTid === 'changed-files-card-header' || qs(el, '[data-testid="changed-files-card-header"]')) {
          dirtyFlags.cf = true;
        }
      }
    }

    if (!inPlainDialog && !inSbR) {
      if (isAdded && (touchedButtons || isHostButtonCandidate(el) || q(HOST_BTN_QUERY))) {
        dirtyFlags.b = true;
        dirtyAddedRoots.add(el);
      } else if (touchedButtons) {
        dirtyFlags.b = true;
      }
    }
  };

  const measureSyncPhase = (flags, isFullSync = false) => {
    const inHome = !!(qs(D, '.agy-home')), inHero = inHome && !!(qs(D, '.agy-home [data-testid="home-greeting"]'));
    const formalConv = !inHome ? (isLiveMainConv(activeConvView) ? activeConvView : streamChoreoCtl.findFormalConvView()) : null;
    const curCascadeId = formalConv ? ga(formalConv, 'data-cascade-id') || resolveCascadeId(null) || '' : '';
    const prevDetached = !!(lastFormalConvEl && lastFormalConvEl[K_IC] === false);
    const isConvSwap = !!(
      formalConv &&
      ((lastFormalConvEl && formalConv !== lastFormalConvEl && prevDetached) ||
        (curCascadeId && lastFormalCascadeId && curCascadeId !== lastFormalCascadeId && (!lastFormalConvEl || formalConv === lastFormalConvEl || prevDetached)))
    );
    const isAsyncConvEntry = !isFullSync && !inHome && !!formalConv && (!streamChoreoCtl.heroState.wasInFormalConv || isConvSwap);
    const homeComposerSampled = inHome && (flags.f || flags.r || flags.c) ? (streamChoreoCtl.sampleHomeComposerRect(), true) : false;
    const hs = streamChoreoCtl.heroState;
    const convInputRect = hs.routeInitialized && hs.wasInHome && !inHome && formalConv && isMotionUltra() && !streamChoreoCtl.isEntryMotionSuppressed?.() ? rc(qs(formalConv, S_IB) || qs(D, S_IB)) : null;
    const sidebarSnap = flags.f || flags.s || flags.r ? streamChoreoCtl.measureSidebarSelectionSnapshot() : null;
    const visibleChangedHeaders = !isAsyncConvEntry && (flags.f || flags.cf || flags.r) ? streamChoreoCtl.measureVisibleChangedHeaders() : [];
    const lensOverlays = (flags.f || flags.o) && isMotionStandardOrUltra() ? streamChoreoCtl.measureNewLensOverlays() : [];
    const caretList = !isAsyncConvEntry && (flags.f || flags.c) && cfg.smoothCaret !== false ? smoothCaretCtl.measureSnapshot(false, false) : null;
    const modelPanelNow = isFullSync || flags.c || flags.o ? qs(D, MODEL_PANEL_SEL) : null;
    const modelOverlayChanged = !!(flags.o) && (!!modelPanelNow || hadModelPanelOpen);
    const cPlan = isFullSync || flags.c || modelOverlayChanged ? measureCrabClearanceAll() : null;
    if (flags.f || flags.r || flags.c || flags.t) convAuraCtl.prime?.();
    const checkCaustics = !!(flags.f || flags.cf || flags.r);
    return { inHome, inHero, formalConv, curCascadeId, isConvSwap, isAsyncConvEntry, homeComposerSampled, convInputRect, sidebarSnap, visibleChangedHeaders, lensOverlays, caretList, modelPanelNow, modelOverlayChanged, cPlan, checkCaustics };
  };

  let enhancerSyncTimer = 0;
  let enhancerSyncRaf = 0;
  let lastEnhancerSyncAt = 0;
  const ENH_KEYS = 'frlcbtsgo'.split('');
  const enhancerDirty = {};
  const resetEnhancerDirty = () => { for (const k of ENH_KEYS) enhancerDirty[k] = false; };
  resetEnhancerDirty();
  const mergeEnhancerDirty = (src) => {
    if (!src) { enhancerDirty.f = true; return; }
    for (const k of ENH_KEYS) if (src[k]) enhancerDirty[k] = true;
  };
  const cancelHostEnhancerSync = () => {
    if (enhancerSyncTimer) { CT(enhancerSyncTimer); enhancerSyncTimer = 0; }
    if (enhancerSyncRaf) { try { typeof cancelAnimationFrame === 'function' && cancelAnimationFrame(enhancerSyncRaf); } catch {} enhancerSyncRaf = 0; }
  };
  const flushHostEnhancerSync = () => {
    cancelHostEnhancerSync();
    if (destroyed) return;
    lastEnhancerSyncAt = Date.now();
    const mask = { ...enhancerDirty };
    resetEnhancerDirty();
    try { hostEnhancerCtl.sync?.(mask.f ? undefined : mask); } catch {}
  };
  const queueHostEnhancerAsync = () => {
    if (destroyed || enhancerSyncRaf) return;
    if (!D.hidden && typeof requestAnimationFrame === 'function') {
      enhancerSyncRaf = requestAnimationFrame(() => { enhancerSyncRaf = 0; flushHostEnhancerSync(); });
    } else if (!enhancerSyncTimer) enhancerSyncTimer = ST(flushHostEnhancerSync, 0);
  };
  const scheduleHostEnhancerSync = (immediate, srcFlags) => {
    if (destroyed) return;
    mergeEnhancerDirty(srcFlags);
    const elapsed = Date.now() - lastEnhancerSyncAt;
    if (immediate || !isConvRunning() || elapsed >= 200) {
      if (enhancerSyncTimer) { CT(enhancerSyncTimer); enhancerSyncTimer = 0; }
      return queueHostEnhancerAsync();
    }
    if (!enhancerSyncTimer && !enhancerSyncRaf) {
      enhancerSyncTimer = ST(() => { enhancerSyncTimer = 0; queueHostEnhancerAsync(); }, Math.max(32, 200 - elapsed));
    }
  };

  let hadModelPanelOpen = false;

  const runSync = (forceFull = false) => {
    if (destroyed) return;
    const t0 = performance.now();
    if (forceFull) markAllDirty();

    const flags = { ...dirtyFlags };
    const addedRoots = AF(dirtyAddedRoots);
    const collapsibleScope = dirtyCollapsibleTargets.size > 0 ? new Set(dirtyCollapsibleTargets) : null;
    const bgCmdNodes = dirtyBgCmds.size > 0 ? AF(dirtyBgCmds) : null;
    const turboRoots = dirtyTurboRoots.size > 0 ? AF(dirtyTurboRoots) : null;
    dirtyAddedRoots.clear();
    dirtyCollapsibleTargets.clear();
    dirtyBgCmds.clear();
    dirtyTurboRoots.clear();
    setAllDirty(false);

    const prevWasInHome = streamChoreoCtl.heroState.wasInHome;
    const prevWasInConv = streamChoreoCtl.heroState.wasInFormalConv;
    const effectiveFull = !!(forceFull || flags.f);

    // ── Phase 1: Pure Measure ──
    const measured = measureSyncPhase(flags, effectiveFull);
    const deferHeavyConvWork = !!(measured.isAsyncConvEntry);
    if (measured.inHome) {
      lastFormalConvEl = null;
      lastFormalCascadeId = '';
    } else if (measured.formalConv) {
      lastFormalConvEl = measured.formalConv;
      if (measured.curCascadeId) lastFormalCascadeId = measured.curCascadeId;
    }
    if (measured.isConvSwap || (measured.inHome && prevWasInConv)) {
      streamChoreoCtl.cancelDeferredHydration();
    }

    const actualRouteJump =
      measured.isConvSwap ||
      measured.inHome !== prevWasInHome ||
      !!(measured.formalConv) !== prevWasInConv;
    const routeJumped = effectiveFull || actualRouteJump;

    // ── Phase 2: Pure Mutate ──
    runGuardedMut(() => {
      applyRootAttrs(effectiveFull);
      if (actualRouteJump) {
        for (const a of ['data-ag-cs-stage-glide', 'data-ag-cs-sonar', 'data-ag-cs-caustic']) {
          qa(D, `[${a}]`).forEach((el) => ra(el, a));
        }
      }
      if (effectiveFull || flags.m) {
        stampBgCmdWrap(effectiveFull ? D : bgCmdNodes);
      }
      if (effectiveFull || flags.l || flags.r || flags.c) {
        syncBleedTables();
      }
      if (effectiveFull || turboRoots) {
        syncHostTurbo(effectiveFull ? D : turboRoots);
      }
      if (effectiveFull || flags.r || flags.s || flags.a || !axE || axE[K_IC] === false) {
        syncAuxSplit();
      }

      if (cfg.homeLayout === 'studio' && (measured.inHero || measured.inHome) && !getHomeStudioMod()) {
        requestHomeStudioChannelIfNeeded();
      }
      if (flags.f || flags.r || measured.inHero !== homeStudioCtl.wasHero()) {
        homeStudioCtl.syncGreeting(measured.inHero);
        if (cfg.homeLayout !== 'studio') {
          homeStudioCtl.unmountPanelSeat();
          prismRimCtl.markDirty();
        } else if (measured.inHero) {
          homeStudioCtl.renderHomePanel();
          const hp = qs(D, '.ag-cs-home-panel');
          if (hp && (ga(hp, A_PB) !== '1' || ga(hp, A_PM) !== '1')) { setAttrIfChanged(hp, A_PB, '1'); setAttrIfChanged(hp, A_PM, '1'); prismRimCtl.markDirty(); }
        } else {
          homeStudioCtl.parkPanelSeat();
          prismRimCtl.markDirty();
        }
      }

      if (flags.f || flags.r || flags.c || flags.t) {
        try { convAuraCtl.sync(true); } catch {}
        try { rippleCtl.sync(); } catch {}
      }
      const modelPanelNow = measured.modelPanelNow;
      const modelOverlayChanged = measured.modelOverlayChanged;
      if (effectiveFull || flags.c || flags.o) {
        hadModelPanelOpen = !!(modelPanelNow);
        syncModelMenuRootAttrs(modelPanelNow);
      }
      if (flags.f || flags.c || modelOverlayChanged) {
        syncComposers(measured, deferHeavyConvWork);
      } else if (!deferHeavyConvWork && flags.tk) {
        streamChoreoCtl.syncThinkingSparks(latestPrimaryModelInfo, latestPaneModelMap);
      }
      if (flags.f || flags.r || flags.c) {
        streamChoreoCtl.syncHeroRouteChoreography(measured);
      } else {
        if (flags.s && measured.sidebarSnap) streamChoreoCtl.syncSidebarSelectionGlide(measured.sidebarSnap);
        if (flags.cf) streamChoreoCtl.syncHeroCCaustics(measured.visibleChangedHeaders);
      }
      if (!deferHeavyConvWork && (flags.f || flags.r || flags.c || flags.l)) {
        streamChoreoCtl.syncDualStreamEngine();
      }
      if (flags.f || flags.o) {
        streamChoreoCtl.syncLensOverlayOrigins(measured.lensOverlays);
        syncPopupOverlayMirrors();
      }

      if (routeJumped || flags.r || flags.c || flags.o) {
        prismRimCtl.markDirty();
      }

      if (deferHeavyConvWork) {
        const outerAddedRoots = addedRoots.filter(
          (r) => r && r[K_IC] !== false && (!measured.formalConv || !measured.formalConv.contains?.(r))
        );
        if (outerAddedRoots.length > 0) syncHostAnimatedIcons(outerAddedRoots);
        const expectedConv = measured.formalConv;
        const expectedCid = measured.curCascadeId || '';
        const verifyTargetConv = () => {
          if (destroyed) return null;
          const convNow = streamChoreoCtl.findFormalConvView();
          if (!convNow) return null;
          const nowCid = ga(convNow, 'data-cascade-id') || resolveCascadeId(null) || '';
          if (convNow !== expectedConv || (expectedCid && nowCid && nowCid !== expectedCid)) {
            dirtyFlags.r = true;
            scheduleSync();
            return null;
          }
          return convNow;
        };
        streamChoreoCtl.scheduleDeferredConvEntry(
          () => {
            const convNow = verifyTargetConv();
            if (!convNow) return false;
            runGuardedMut(() => {
              stampBgCmdWrap(convNow);
              syncBleedTables();
              streamChoreoCtl.syncThinkingSparks(latestPrimaryModelInfo, latestPaneModelMap);
              streamChoreoCtl.syncDualStreamEngine();
              streamChoreoCtl.syncHeroCCaustics();
            });
            scheduleHostEnhancerSync(false, { f: true });
            smoothCaretCtl.queue(false, false, false);
            return true;
          },
          140,
          () => {
            const convNow = verifyTargetConv();
            if (!convNow) return;
            runGuardedMut(() => {
              syncHostAnimatedIcons([convNow]);
            });
            streamChoreoCtl.syncWorkedForAutoUnfold();
            if (getThoughtTranslateMode() !== 'off') {
              try {
                W.__agPrismThought?.scan?.();
              } catch {}
            }
          }
        );
      } else {
        if (flags.f) {
          syncHostAnimatedIcons(null);
        } else if (routeJumped) {
          const jumpRoots = [qs(D, '.agy-home'), measured.formalConv, ...addedRoots].filter(Boolean);
          syncHostAnimatedIcons(jumpRoots.length > 0 ? jumpRoots : null);
        } else if (flags.b && addedRoots.length > 0) {
          syncHostAnimatedIcons(addedRoots);
        }

        if (
          (flags.f || flags.l || routeJumped || ((flags.s || flags.g || flags.o) && W.__agPrismThought?.getTranslateTitles?.())) &&
          getThoughtTranslateMode() !== 'off'
        ) {
          try {
            W.__agPrismThought?.scan?.();
          } catch {}
        }
      }
      if (flags.f || flags.g) {
        ensureSettingsSection();
      }
      if (flags.f || flags.r || flags.c || flags.t) {
        ensurePulseBridge(!!(flags.f || flags.t));
      }
    });
    if (effectiveFull || flags.c || flags.r || routeJumped) {
      try { W.__agPrismPeriodicPicker?.onHostTriggerChanged?.(); } catch {}
    }
    if (!deferHeavyConvWork && (flags.f || flags.r || flags.l || flags.c || flags.b || flags.t || flags.s || flags.g || flags.o)) {
      const enhFlags = routeJumped ? { ...flags, f: true } : flags;
      scheduleHostEnhancerSync(!!(flags.f || routeJumped || flags.g || flags.o || (flags.t && !isConvRunning())), enhFlags);
    }
    if (!deferHeavyConvWork) {
      if (flags.f || routeJumped) {
        streamChoreoCtl.syncWorkedForAutoUnfold();
      } else if (flags.l) {
        streamChoreoCtl.syncWorkedForAutoUnfold(collapsibleScope);
      }
    }

    perfStats.lastSyncMs = +(performance.now() - t0).toFixed(3);
    perfStats.syncCount += 1;
  };

  function scheduleSync() {
    if (destroyed) return;
    const highPri = !!(dirtyFlags.f || dirtyFlags.r || dirtyFlags.t || dirtyFlags.s || dirtyFlags.c || dirtyFlags.o || dirtyFlags.g);
    if (syncQueued) {
      if (highPri && !syncIsRaf && !D.hidden && syncTimer) { CT(syncTimer); syncTimer = null; syncQueued = false; }
      else return;
    }
    syncQueued = true;
    const run = () => { syncTimer = null; syncQueued = false; runSync(false); };
    if (!D.hidden && (highPri || !isConvRunning()) && typeof requestAnimationFrame === 'function') { syncIsRaf = true; syncTimer = requestAnimationFrame(run); }
    else { syncIsRaf = false; syncTimer = ST(run, D.hidden ? 50 : 96); }
  }

  function onStoreChanged() {
    if (qs(D, '.agy-home') && cfg.homeLayout === 'studio') homeStudioCtl.scheduleUsageRollupRefresh(1800);
    if (D.hidden) {
      pendingHiddenFullSync = true;
      return;
    }
    const st = cachedStore?.getState?.();
    if (st) {
      const cs = st.conversation?.convoState;
      const cid = cs?.type === 'active' ? cs.cascadeId || '' : cs?.type === 'subagent' ? cs.childConversationId || '' : '';
      const entry = cid
        ? st.trajectorySummaries?.summaries?.[cid] ?? st.cascadeTrajectorySummaries?.[cid] ?? null
        : null;
      const sum = entry?.summary || entry || {};
      const snapKey = [
        location.pathname || '',
        cs?.type || '',
        cid,
        sum.status ?? '',
        sum.notFullyIdle ? 1 : 0,
        sum.hasError ? 1 : 0,
        sum.hasRunningSubagents ? 1 : 0,
        st.userStatus?.name || '',
      ].join('|');
      if (snapKey === lastStoreSnapKey) return;
      lastStoreSnapKey = snapKey;
    }
    dirtyFlags.c = dirtyFlags.r = true;
    scheduleSync();
  }

  // ── Event Handlers ─────────────────────────────────────────────────────
  let blurTm = 0, lbr = 0;
  const clearWinBlur = () => {
    try {
      if (blurTm) { CT(blurTm); blurTm = 0; }
      const h = de();
      if (ha(h, BLUR_ATTR)) {
        runGuardedMut(() => ra(h, BLUR_ATTR));
        try { msRig?.syncPowerState?.(); } catch {}
        try { convAuraCtl.wake?.(false); } catch {}
        try { convAuraCtl.sync(true); } catch {}
        try { W.__agPrismTelemetry?.refresh?.(); } catch {}
      }
    } catch {}
  };
  const wakeWinBlur = () => {
    try {
      const hasA = ha(de(), BLUR_ATTR);
      if (!hasA && !blurTm) return;
      const t = performance.now();
      if (!hasA && blurTm && t - lbr < 400) return;
      lbr = t;
      clearWinBlur();
      if (typeof document.hasFocus === 'function' && !document.hasFocus()) onWinBlur();
    } catch {}
  };
  function onWinBlur() {
    try {
      if (splitDragActive) {
        splitDragActive = false;
        scheduleResizingEnd();
      }
      if (destroyed || blurTm) return;
      lbr = performance.now();
      blurTm = ST(() => {
        try {
          blurTm = 0;
          const h = de();
          if (!destroyed && (!D.hasFocus || !D.hasFocus()) && ga(h, BLUR_ATTR) !== '1') {
            runGuardedMut(() => sa(h, BLUR_ATTR, '1'));
            try { msRig?.syncPowerState?.(); } catch {}
          }
        } catch {}
      }, 1200);
    } catch {}
  }
  const onWinPointerMove = (ev) => {
    try {
      wakeWinBlur();
      if (isDragSuspendedRoot()) return;
      prismRimCtl.onPointerMove(ev);
    } catch {}
  };
  const onWinPointerUp = () => {
    try {
      if (destroyed || !splitDragActive) return;
      splitDragActive = false;
      scheduleResizingEnd();
    } catch {}
  };

  const onWinResize = () => {
    try {
      if (destroyed) return;
      prismRimCtl.markDirty();
      smoothCaretCtl.bumpMetricsEpoch();
      smoothCaretCtl.queue(false, false, true);
    } catch {}
  };

  const onWinStorage = (ev) => {
    try {
      if (destroyed || !ev) return;
      if (ev.key === STORAGE_PRISM_KEY || ev.key === STORAGE_FILE_CFG_KEY) {
        cfg = loadSettings(currentBaseConfig);
        markAllDirty();
        applyRootAttrs();
        scheduleSync();
      }
    } catch {}
  };

  const onDocVisibilityChange = () => {
    try {
      if (destroyed || D.hidden) return;
      if (!isFn(D.hasFocus) || D.hasFocus()) clearWinBlur();
      if (pendingHiddenFullSync) {
        pendingHiddenFullSync = false;
        markAllDirty();
        scheduleSync();
      }
    } catch {}
  };

  const isEditableTarget = (el) => {
    if (!el) return false;
    const tag = tagU(el);
    return (
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      tag === 'SELECT' ||
      ga(el, 'contenteditable') === 'true' ||
      !!(el.isContentEditable || cl(el, '[contenteditable="true"], input, textarea, select, [role="textbox"]'))
    );
  };

  const SLASH_CMD_RE = /^\/(plan|goal|boost|teamwork|swarm|browser|compact|schedule|grill-me|learn)(?:\s|$)/i;
  let lastSlashNotifyAt = 0;
  let lastSlashNotifyCmd = '';
  const dispatchComposerSubmit = (scopeEl) => {
    const box = cl(scopeEl, `${S_IB}, .surface-composer-card, [data-testid="${T_SQ}"], [data-side-panel-focus-scope="true"]`);
    const ed = (box && qs(box, '[contenteditable="true"], textarea, input')) || scopeEl;
    const m = SLASH_CMD_RE.exec(String(ed?.innerText ?? ed?.[K_TC] ?? ed?.value ?? '').trim());
    if (m) {
      const cmd = m[1].toLowerCase(), now = Date.now();
      if (cmd !== lastSlashNotifyCmd || now - lastSlashNotifyAt >= 800) { lastSlashNotifyCmd = cmd; lastSlashNotifyAt = now; notifyMascot('slash-cmd', { cmd }); }
      return;
    }
    notifyMascot('send', {});
  };

  const onWinKeyDown = (ev) => {
    try {
      if (destroyed || !ev) return;
      wakeWinBlur();
      if (ev.key === 'Enter' && !ev.shiftKey && !ev.ctrlKey && !ev.altKey && !ev.metaKey && !ev.isComposing && ev.keyCode !== 229 && cl(ev.target, `${S_IB} [contenteditable="true"]`)) {
        const sm = qs(D, '[data-testid="slash-command-menu"]');
        if (sm && (!sm.getClientRects || sm.getClientRects().length > 0)) return;
        trackActivePaneFromTarget(ev.target, false);
        if (cl(ev.target, '.agy-home')) streamChoreoCtl.triggerHomeLiftoffRippleBurst();
        convAuraCtl.triggerStart(findConvForTarget(ev.target));
        dispatchComposerSubmit(ev.target);
        return;
      }
      if (ev.key === '[' && !ev.ctrlKey && !ev.metaKey && !ev.altKey && !isEditableTarget(ev.target) && !cl(ev.target, '[role="dialog"], .monaco-editor')) {
        const html = de(), k = 'data-ag-cs-sidebar-collapsed';
        if (!html || cfg.sidebarRestyle === false) return;
        bumpResizingPulse();
        ga(html, k) === '1' ? ra(html, k) : sa(html, k, '1');
      }
    } catch {}
  };

  const isPulseHostNode = (n) => !!(n && (n.id === 'ag-prism-pulse-bar' || n.id === 'ag-pulse-status-bar' || ha(n, 'data-ag-prism-pulse-bar') || ga(n, 'data-ag-prism-fallback') === '1' || ga(n, 'data-ag-pulse-bar') === 'true'));

  const onWinClick = (ev) => {
    try {
      if (destroyed || !ev?.target?.closest || isThoughtIsolatedNode(ev.target)) return;
      const t = ev.target;
      const hitPulse = isPulseHostNode(t) ? t : cl(t, PULSE_HOST_SEL) || (isFn(ev.composedPath) ? ev.composedPath().find(isPulseHostNode) : null);
      if (hitPulse) {
        try { W.__agPrismTelemetry?.setActiveBar?.(hitPulse); } catch {}
        try { (pulseBridgeInst || W.__agCsPulseBridgeInst)?.setActiveHost?.(hitPulse); } catch {}
        ST(() => { if (!destroyed) syncContextCardOpenNotify(); }, 28);
      } else if (wasContextCardOpen) {
        ST(() => { if (!destroyed) syncContextCardOpenNotify(); }, 28);
      }
      if (cl(t, '[data-testid="thinking-collapsible-trigger"]') && getThoughtTranslateMode() !== 'off') {
        ST(() => { try { W.__agPrismThought?.scan?.(); } catch {} }, 25);
      }
      const sendBtn = cl(t, '[data-testid="input-send-button"], [data-testid="send-button"]');
      if (sendBtn && !sendBtn.disabled) {
        trackActivePaneFromTarget(sendBtn, false);
        if (cl(sendBtn, '.agy-home')) streamChoreoCtl.triggerHomeLiftoffRippleBurst();
        if (ga(sendBtn, A_IC) === 'arrow-up-launch' && isMotionStandardOrUltra()) { try { motionEngine?.triggerIcon?.(sendBtn, 'launch'); } catch {} }
        convAuraCtl.triggerStart(findConvForTarget(sendBtn));
        dispatchComposerSubmit(sendBtn);
      }
      const copyBtn = cl(t, `[${A_IC}="copy-check"]`) || cl(t, 'pre button, button[aria-label*="Copy" i], button[aria-label*="复制"]');
      if (copyBtn && !copyBtn.disabled && !isThoughtIsolatedNode(copyBtn)) {
        if (ga(copyBtn, A_IC) === 'copy-check' && !motionReduced() && isFn(motionEngine?.triggerIcon)) {
          try { motionEngine.triggerIcon(copyBtn, 'check', { revertAfterMs: 1600 }); } catch {}
        }
        notifyMascot('code-copied');
      }
      const navTurn = cl(t, '[data-testid="conversation-navigator-turn"], [data-testid="conversation-navigator-group"]');
      if (navTurn) streamChoreoCtl.triggerHeroESonar(navTurn);
      const grpBtn = cl(t, '[role="dialog"] [role="group"] button');
      if (grpBtn && !ha(grpBtn, 'data-ag-cs-key') && !handledGroupClicks.has(ev)) {
        handledGroupClicks.add(ev);
        const grp = cl(grpBtn, '[role="group"]'), gp = streamChoreoCtl.heroState.lastGroupPress;
        if (gp && gp.group === grp && gp.prevBtn && gp.prevBtn !== grpBtn) runSettingsGroupGlide(grp, gp.prevBtn, grpBtn, gp.prevRect);
      }
      if (cl(t, '[data-testid="worked-for-collapsible"]') && cfg.composerRestyle !== false) streamChoreoCtl.scheduleWorkedForClickSync();
    } catch {}
  };

  const onWinFocusIn = (ev) => {
    try {
      if (destroyed) return;
      trackActivePaneFromTarget(ev?.target, true);
    } catch {}
  };

  const onDocPointerDown = (ev) => {
    try {
      wakeWinBlur();
      const t = ev?.target;
      if (t?.closest) {
        trackActivePaneFromTarget(t, true);
        const sbRow = cl(t, '[data-testid="conversation-row-sidebar"]');
        if (sbRow) streamChoreoCtl.lockSidebarRowRunningOnPointerDown?.(sbRow);
        if (isSplitResizeHandle(t)) {
          splitDragActive = true;
          const h = de();
          if (h && ga(h, RESIZE_ATTR) !== '1') runGuardedMut(() => sa(h, RESIZE_ATTR, '1'));
          if (resizeEndTm) CT(resizeEndTm);
          resizeEndTm = ST(() => finishResizing(true), 10000);
        }
        if (isMotionStandardOrUltra()) {
          if (!cl(t, '[role="dialog"]')) {
            const triggerEl = cl(t, 'button, [role="button"], [data-testid]'), hasXY = Number.isFinite(ev.clientX) && Number.isFinite(ev.clientY);
            if (triggerEl || hasXY) streamChoreoCtl.heroState.lastTriggerOrigin = { el: triggerEl || null, x: hasXY ? ev.clientX : NaN, y: hasXY ? ev.clientY : NaN, at: performance.now() };
          } else if (!cl(t, '#' + SETTINGS_SEC_ID)) {
            const grp = cl(t, '[role="dialog"] [role="group"]');
            if (grp?.children) {
              const prevBtn = AF(grp.children).find((s) => ga(s, 'aria-pressed') === 'true' || ha(s, 'data-pressed') || ga(s, 'aria-checked') === 'true' || ga(s, 'data-state') === 'on');
              streamChoreoCtl.heroState.lastGroupPress = { group: grp, prevBtn: prevBtn || null, prevRect: rc(prevBtn) };
            }
          }
        }
      }
      notifyMascot('activity', {});
      if (cfg.smoothCaret !== false) smoothCaretCtl.queue(false);
    } catch {}
  };

  const MODIFIER_ONLY_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'NumLock', 'ScrollLock']);

  const onDocCaretEvent = (ev) => {
    try {
      const type = ev?.type || '';
      if (type === 'focusin') trackActivePaneFromTarget(ev?.target, true);
      if ((type === 'keydown' || type === 'keyup') && ev?.key && MODIFIER_ONLY_KEYS.has(ev.key)) return;
      if (type === 'scroll' || type === 'selectionchange' || type === 'keydown' || type === 'keyup') {
        const ae = D.activeElement;
        if (!cl(ae, S_IB)) return;
        if (type === 'scroll') {
          const st = ev?.target;
          if (st && st !== ae && !ae.contains?.(st) && (st === D || st === de() || st === D.body || tidOf(st) === 'autoscroll-viewport' || !st.contains?.(ae))) return;
        }
      }
      const isTyping = type === 'input' || type === 'keyup' || type === 'compositionupdate' || type === 'compositionend';
      const immediate = type === 'focusin' || type === 'mouseup' || type === 'transitionend';
      smoothCaretCtl.queue(isTyping, immediate, type === 'focusin', type === 'scroll');
      if (type === 'input' && cl(ev?.target, S_IB)) {
        try { msRig?.onUserType?.((cl(ev.target, '[contenteditable="true"]') || ev.target)?.[K_TC] || ''); } catch {}
      }
    } catch {}
  };

  const onDocTransitionEnd = (ev) => {
    try {
      if (ev?.target?.id === 'ag-prism-periodic-picker-root' && ev.propertyName === 'height') prismRimCtl.markDirty();
      if (cfg.smoothCaret !== false && cl(ev?.target, S_IB)) smoothCaretCtl.queue(false, true, false);
    } catch {}
  };

  const ATTR_OBSERVED_TIDS = new Set([
    'conversation-view', 'conversation-row-sidebar', 'worked-for-collapsible', 'thinking-collapsible-trigger',
    'changed-files-card-header', T_RP, T_TK, T_SQ, T_QM, 'step-plan', 'toggle-aux-sidebar', 'toggle-maximize-pane',
  ]);

  const observer = new MutationObserver((mutations) => {
    try {
      if (destroyed || internalDomMutating || streamChoreoCtl.isStreamMutating() || !mutations || mutations.length === 0) return;

      // 后台隐藏窗口挂起深扫：避免 Swarm 多窗口后台刷屏触发海量 querySelector，切回前台时由 visibilitychange 合并一次同步！
      if (D.hidden) {
        for (let i = 0; i < mutations.length; i++) {
          const m = mutations[i];
          if (!isThoughtMutationRecord(m) && !isOwnPluginMutation(m)) {
            pendingHiddenFullSync = true;
            break;
          }
        }
        return;
      }

      let anyRelevant = false;
      let ctxCache = null;
      for (let i = 0; i < mutations.length; i++) {
        const m = mutations[i];

        if (m.type === 'attributes') {
          if (m.attributeName === 'data-ag-prism-host-i18n') {
            dirtyFlags.g = anyRelevant = true;
            continue;
          }
          const tgt = m.target;
          if (tgt === D.body || tgt === de()) {
            if (m.attributeName === 'data-ag-pp-open') {
              prismRimCtl.markDirty();
              dirtyFlags.c = anyRelevant = true;
              continue;
            }
            if (/^data-(?:ag-prism-wallpaper|has-(?:drawer-)?browser-hole)$/.test(m.attributeName)) { dirtyFlags.r = anyRelevant = true; continue; }
            if (m.attributeName === 'data-ag-prism-mode') dirtyFlags.c = true;
            dirtyFlags.t = anyRelevant = true;
            continue;
          }
          if (/^data-has-(?:drawer-)?browser-hole$/.test(m.attributeName)) { dirtyFlags.r = anyRelevant = true; continue; }
          if (tidOf(tgt?.[K_PE]) === 'aux-pane-split') {
            let dualChanged = false;
            runGuardedMut(() => { dualChanged = axU(tgt[K_PE]); });
            if (dualChanged) dirtyFlags.a = anyRelevant = true;
            else if (m.attributeName === 'style') bumpResizingPulse();
            continue;
          }
          if (m.attributeName === A_QA) {
            if (!isThoughtIsolatedNode(tgt) && !isHoverCardNode(tgt)) dirtyFlags.c = anyRelevant = true;
            continue;
          }
          const tid = tidOf(tgt);
          const isClrWrap = (m.attributeName === 'class' || m.attributeName === 'hidden') && (ha(tgt, A_TK) || ha(tgt, A_Q) || seenClrWraps.has(tgt));
          if (!ATTR_OBSERVED_TIDS.has(tid) && !isClrWrap) continue;
          if (isThoughtIsolatedNode(tgt) || isOwnPluginNode(tgt) || isHoverCardNode(tgt)) continue;
          if (isClrWrap && !ATTR_OBSERVED_TIDS.has(tid)) {
            dirtyFlags.c = anyRelevant = true;
            continue;
          }
          if (tid === 'conversation-view') {
            if (m.attributeName === 'data-cascade-id') dirtyFlags.r = dirtyFlags.c = anyRelevant = true;
          } else if (tid === 'conversation-row-sidebar') {
            if (m.attributeName === 'data-selected') {
              if (ga(tgt, 'data-selected') === 'true') streamChoreoCtl.stampSidebarRowRunningImmediate?.(tgt);
              dirtyFlags.s = anyRelevant = true;
            }
          } else if (tid === 'worked-for-collapsible' || tid === 'thinking-collapsible-trigger' || tid === 'changed-files-card-header') {
            dirtyFlags.l = anyRelevant = true;
            if (tid === 'thinking-collapsible-trigger') dirtyFlags.tk = true;
            else if (tid === 'changed-files-card-header') dirtyFlags.cf = true;
            dirtyCollapsibleTargets.add(tgt);
          } else if (tid === T_RP || tid === T_TK || tid === T_SQ || tid === T_QM) {
            dirtyFlags.c = anyRelevant = true;
          } else if (tid === 'step-plan') {
            dirtyFlags.o = anyRelevant = true;
          } else if (tid === 'toggle-aux-sidebar' || tid === 'toggle-maximize-pane') {
            dirtyFlags.a = anyRelevant = true;
          }
          continue;
        }

        if (m.type === 'childList') {
          const tgt = m.target;
          if (tagU(tgt) === 'STYLE' && !tgt.id && ga(tgt, TS_A) !== '1') {
            dirtyTurboRoots.add(tgt);
            anyRelevant = true;
            continue;
          }
          let pCtx = null;
          if (isElementLike(tgt)) {
            if (!ctxCache) ctxCache = new Map();
            pCtx = ctxCache.get(tgt);
            if (!pCtx) {
              pCtx =
                isThoughtIsolatedNode(tgt) || isOwnPluginNode(tgt) || isHoverCardNode(tgt)
                  ? { skip: true }
                  : {
                      skip: false,
                      inConv: !!(cl(tgt, '[data-testid="conversation-view"]')),
                      inComp: !!(cl(tgt, S_IB)),
                      inSide: inSbP(tgt),
                      inSR: inSbRow(tgt),
                      inDlg: !!(cl(tgt, '[role="dialog"]')),
                      inMdl: !!(cl(tgt, MODEL_PANEL_SEL)),
                    };
              ctxCache.set(tgt, pCtx);
            }
            if (pCtx.skip) continue;
            if (tidOf(tgt) === 'aux-pane-split') dirtyFlags.a = anyRelevant = true;
          }
          const inComposerBox = !!(pCtx && pCtx.inComp);
          const scanList = (list, isAdd) => {
            if (!list || !list.length) return;
            for (let j = 0; j < list.length; j++) {
              const node = list[j];
              if (!isElementLike(node) || isThoughtIsolatedNode(node) || isOwnPluginNode(node) || isHoverCardNode(node)) continue;
              if (isAdd && tidOf(node) === 'conversation-row-sidebar' && ga(node, 'data-selected') === 'true') {
                streamChoreoCtl.stampSidebarRowRunningImmediate?.(node);
              }
              classifyDirtySubtree(node, isAdd, pCtx);
              if (inComposerBox) dirtyFlags.c = dirtyFlags.r = true;
              anyRelevant = true;
            }
          };
          scanList(m.addedNodes, true);
          if (m.removedNodes && m.removedNodes.length > 0) {
            if (isElementLike(tgt) && ha(tgt, 'data-ag-cs-bg-cmd-wrap')) {
              dirtyFlags.m = anyRelevant = true;
              dirtyBgCmds.add(tgt);
            }
            scanList(m.removedNodes, false);
          }
        }
      }

      if (anyRelevant && (O.values(dirtyFlags).some(Boolean) || dirtyTurboRoots.size > 0)) {
        scheduleSync();
      }
    } catch {}
  });
  mainObserver = observer;

  // Strict test contract: NEVER register 'click' or 'mousedown' on D!
  const CAP_PASSIVE = { capture: true, passive: true };
  const CARET_LISTENERS = 'keyup:1|mouseup:0|input:1|selectionchange:1|focusin:0|focusout:0|scroll:0|compositionupdate:1|compositionend:1'.split('|');
  const DOC_LISTENERS = [
    ['pointerdown', onDocPointerDown, CAP_PASSIVE],
    ['transitionend', onDocTransitionEnd, CAP_PASSIVE],
    ['visibilitychange', onDocVisibilityChange, true],
  ];
  let caretListenersBound = false;
  const syncCaretListeners = (enabled) => {
    const want = !!(enabled && !destroyed && lifecycleStarted);
    if (want === caretListenersBound) return;
    caretListenersBound = want;
    const fn = want ? 'addEventListener' : 'removeEventListener';
    for (const s of CARET_LISTENERS) { const [ev, cap] = s.split(':'); try { D[fn](ev, onDocCaretEvent, cap === '1' ? true : CAP_PASSIVE); } catch {} }
    if (!want && !destroyed) smoothCaretCtl.teardown();
  };

  const WIN_LISTENERS = [
    ['pointermove', onWinPointerMove, CAP_PASSIVE],
    ['pointerup', onWinPointerUp, { passive: true }],
    ['pointercancel', onWinPointerUp, { passive: true }],
    ['focusin', onWinFocusIn, CAP_PASSIVE],
    ['resize', onWinResize, { passive: true }],
    ['keydown', onWinKeyDown, true],
    ['click', onWinClick, true],
    ['storage', onWinStorage, false],
    ['blur', onWinBlur, false],
    ['focus', clearWinBlur, false],
  ];

  let pollTimer = null;
  let coreTornDown = false;
  const teardownCore = () => {
    if (coreTornDown) return;
    coreTornDown = destroyed = true;
    activePaneCard = activeConvView = lastNotifiedPaneCard = lastNotifiedConvView = null;
    latestPaneModelMap.clear();
    const safe = (fn) => { try { fn?.(); } catch {} };
    cancelScheduledSync();
    streamChoreoCtl.clearTransientTimers();
    for (const s of [dirtyAddedRoots, dirtyCollapsibleTargets, dirtyBgCmds, dirtyTurboRoots, bleedEls]) s.clear();
    clearWinBlur();
    finishResizing(false);
    unmountCrab();
    msLastHostSleep = false;
    if (crabRemoveAttrTimer) { CT(crabRemoveAttrTimer); crabRemoveAttrTimer = 0; }
    for (const t of pulseHealTimers) CT(t);
    pulseHealTimers.clear();
    syncMotionOffStyle(false);
    streamChoreoCtl.disconnectStreamObserver();
    if (pollTimer !== null) { clearInterval(pollTimer); pollTimer = null; }
    cancelHostEnhancerSync();
    resetEnhancerDirty();
    if (storeDebounce) { CT(storeDebounce); storeDebounce = null; }
    smoothCaretCtl.teardown();
    prismRimCtl.cancelPendingRaf();
    safe(storeUnsub); storeUnsub = null;
    safe(() => observer.disconnect());
    safe(() => { axO?.disconnect?.(); axE?.removeAttribute?.(AX_A); });
    axO = axE = null;
    syncCaretListeners(false);
    for (const [ev, fn, opt] of DOC_LISTENERS) safe(() => D.removeEventListener(ev, fn, opt));
    if (isFn(W.removeEventListener)) for (const [ev, fn, opt] of WIN_LISTENERS) safe(() => W.removeEventListener(ev, fn, opt));
    safe(() => motionBinding?.unbind?.()); motionBinding = null;
    safe(() => pulseBridgeInst?.destroy?.()); pulseBridgeInst = null;
    safe(() => hostEnhancerCtl.destroy?.());
    modelGlyphCtl.teardownCrystalMount();
    if (Array.isArray(GT.__agCsCleanups)) {
      const idx = GT.__agCsCleanups.indexOf(teardownCore);
      if (idx >= 0) GT.__agCsCleanups.splice(idx, 1);
    }
  };

  GT.__agCsCleanups = Array.isArray(GT.__agCsCleanups) ? GT.__agCsCleanups : [];
  GT.__agCsCleanups.push(teardownCore);

  let activePollMs = 0;
  const restartPollTimer = () => {
    const nextMs = Math.max(5000, Number(cfg.pollIntervalMs || currentBaseConfig.pollIntervalMs) || 5000);
    if (pollTimer !== null && activePollMs === nextMs) return;
    if (pollTimer !== null) { clearInterval(pollTimer); pollTimer = null; }
    activePollMs = nextMs;
    pollTimer = setInterval(() => {
      if (destroyed || D.hidden) return;
      const expectedThemeKey = `${getEffectivePalette()}|${getLightPreset()}|${isDarkTheme() ? 'd' : 'l'}|${getAccentTone()}|${getAmbientIntensitySetting()}|${cfg.darkAura}|${cfg.darkAuraStyle}|${getCornerStyle()}`;
      if (expectedThemeKey !== lastThemeKey || !ha(de(), 'data-ag-prism')) applyRootAttrs();
      if (cfg.homeLayout === 'studio') {
        if (homeStudioCtl.wasHero()) homeStudioCtl.scheduleUsageRollupRefresh(1800);
        else if (!getHomeStudioMod() && qs(D, '.agy-home')) requestHomeStudioChannelIfNeeded();
      }
    }, nextMs);
  };

  let lifecycleStarted = false;
  const startLifecycle = () => {
    const root = de();
    if (destroyed || lifecycleStarted || !root) return;
    lifecycleStarted = true;
    flattenMainStyleSheet();
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'hidden', 'aria-expanded', 'data-state', 'data-ag-queued-act', 'data-selected', 'data-cascade-id', 'data-ag-prism-host-i18n', 'data-ag-prism-mode', 'data-ag-pp-open', 'data-ag-prism-wallpaper', 'data-has-browser-hole', 'data-has-drawer-browser-hole'],
    });
    for (const [evName, handler, opts] of DOC_LISTENERS) D.addEventListener(evName, handler, opts);
    syncCaretListeners(cfg.smoothCaret !== false);
    if (isFn(W.addEventListener)) {
      for (const [evName, handler, opts] of WIN_LISTENERS) W.addEventListener(evName, handler, opts);
      if (isFn(motionEngine?.bindMicroInteractions)) try { motionBinding = motionEngine.bindMicroInteractions(W); } catch {}
    }

    syncMotionSpringTokens();
    restartPollTimer();
    if (isFn(D.hasFocus) && !D.hasFocus()) onWinBlur();

    ensureHooks(true);
    markAllDirty();
    runSync(true);
    if (homeStudioCtl.wasHero() && cfg.homeLayout === 'studio') homeStudioCtl.scheduleUsageRollupRefresh(1800);
  };

  const prismRuntimeApi = {
    brand: 'Obsidian Prism',
    version: VERSION,
    legacyApiVersion: LEGACY_API_VERSION,
    codeHash: CODE_HASH,
    flattenCss: flattenMainStyleSheet,
    saveSettingsBatch,
    refreshConfig(next) {
      if (next && typeof next === 'object') {
        if (next.__uiSlice) ensureLiteLocalesShim(next.__uiSlice);
        const fromFile = !!(next.__fromFile);
        const ackEpoch = Number(next.__ackEpoch) || 0;
        if (fromFile && ackEpoch > 0 && ackEpoch < localWriteEpoch) {
          return false;
        }
        const cleanNext = expandSettingAliases(stripRuntimeMetaKeys(next));
        currentBaseConfig = { ...currentBaseConfig, ...cleanNext };
        if (next.pollIntervalMs !== undefined) currentBaseConfig.pollIntervalMs = next.pollIntervalMs;
        if (next.binding !== undefined) currentBaseConfig.binding = next.binding;
        cfg = loadSettings(currentBaseConfig, fromFile ? null : cleanNext);
      } else {
        cfg = loadSettings(currentBaseConfig);
      }
      if (lifecycleStarted && !destroyed) restartPollTimer();
      markAllDirty();
      lastAbsorbedSyncKey = '';
      applyRootAttrs(true);
      runSync(true);
      return true;
    },
    sync() {
      if (!destroyed) {
        lastAbsorbedSyncKey = '';
        runSync(true);
      }
    },
    syncHomeStudio() {
      if (destroyed) return;
      resolveHomeStudioCtl();
      if (!lifecycleStarted) return;
      markAllDirty();
      runSync(true);
    },
    detachHomeStudio() {
      disposeActiveHomeStudio();
    },
    syncAbsorbed: () => syncAbsorbedModules(true),
    getState() {
      const convAura = convAuraCtl.getInstance();
      const auraConnected = !!(convAura && convAura.host && convAura.host.isConnected);
      const convAuraPhase = auraConnected ? convAuraCtl.advancePhase(performance.now()) : 'off';
      const rippleMount = rippleCtl.getMount();
      return {
        brand: 'Obsidian Prism',
        version: VERSION,
        cfg: normalizeConfigShape(cfg),
        motionLevel: getMotionLevel(), lightPreset: getLightPreset(),
        hasThoughtModule: !!W.__agPrismThought, hasOmniModule: !!W.__agPrismOmni, hasSidebarStudio: !!W.__agPrismSidebar,
        hasContextMenu: !!(W.__agPrismContextMenu || GT.__agPrismContextMenu), hasHostEnhancer: isFn(hostEnhancerCtl?.getDebugState),
        usageRecordsCount: homeStudioCtl.getUsageRecordsCount(), hasPanel: homeStudioCtl.hasConnectedPanel(),
        hasRipple: !!rippleMount?.canvas?.isConnected, rippleMode: rippleMount?.canvas?.isConnected ? (rippleMount.mode || 'home') : 'off', rippleSleeping: !rippleMount || !!rippleMount.sleeping,
        rippleAura: rippleMount ? { ...rippleMount.aura } : null, hasConvAura: auraConnected, convAuraPhase,
        convAuraSleeping: !convAura || !!convAura.sleeping, convAuraDrawCount: convAura ? convAura.drawCount : 0,
        convAuraCanvasSize: convAura ? { width: convAura.width, height: convAura.height } : null,
        convAuraOptics: convAura?.lastOptics ? { ...convAura.lastOptics } : null,
        hasCrab: !!(msRoot && msRoot[K_IC]), hasDualRig: !!msRig, hasSmoothCaret: !!qs(D, '.ag-cs-smooth-caret'),
        hasPulseBridge: !!pulseBridgeInst?.getDebugState?.()?.attached, hasStreamObserver: streamChoreoCtl.hasStreamObserver(),
        modelInfo: latestPrimaryModelInfo ? { ...latestPrimaryModelInfo } : null, perf: { ...perfStats },
      };
    },
    suppressEntryMotion(ms) {
      streamChoreoCtl.suppressEntryMotion?.(ms);
    },
    destroy() {
      teardownCore();
      for (const k of ['__agPrismTelemetry', '__agPrismEffortSlider', '__agPrismThought', '__agPrismOmni', '__agPrismSidebar', '__agPrismPeriodicPicker', '__agPrismHostI18n', '__agPrismWallpaper', '__agPrismSuggester']) try { (W[k] || GT[k])?.destroy?.(); } catch {}
      try { W.__agPrismInlineDiff?.unbindHooks?.(); } catch {}
      try { (ownedCtxMenu || W.__agPrismContextMenu || GT.__agPrismContextMenu)?.destroy?.(); } catch {}
      const sc = streamChoreoCtl;
      for (const [o, k] of [[sc, 'cancelDeferredHydration'], [0, disposeActiveHomeStudio], [sc, 'flushAllStreamArtifacts'], [0, restoreAllHostAnimatedIcons], [smoothCaretCtl, 'teardown'], [prismRimCtl, 'teardown'], [rippleCtl, 'unmount'], [convAuraCtl, 'unmount'], [sc, 'clearWorkedForAutoUnfoldAttrs'], [0, unmountCrab], [0, restoreHostTurbo]]) try { o ? o[k]() : k(); } catch {}
      qa(D, `[${A_PB}]`).forEach((e) => { ra(e, A_PB); rp(e, '--ag-px'); rp(e, '--ag-py'); });
      qa(D, '[data-ag-cs-effort]').forEach((e) => { ra(e, 'data-ag-cs-effort'); e[K_CL].remove('ag-cs-effort-badge'); });
      qa(D, `[${A_Q}],[${A_TK}]`).forEach((e) => { ra(e, A_Q); ra(e, A_TK); rp(e, 'margin-bottom'); });
      qa(D, '[data-ag-row-stagger]').forEach((e) => { ra(e, 'data-ag-row-stagger'); rp(e, '--ag-row-i'); });
      qa(D, '.agy-overlay,.agy-fastpick,[data-testid="context-menu-popup"],[data-testid="context-menu-submenu-popup"],[data-ag-cs-overview-shell]').forEach((e) => { rp(e, '--ag-origin-x'); rp(e, '--ag-origin-y'); });
      for (const s of 'placeholder|orch-active|model-overlay|aux-dual|overview-shell|prism-mirror|prism-reflect|settings-dlg|settings-nav|nav-active|conv-seat|conv-ripple-host|vp-wrap|home-sheet|row-running|menu-open|auto-unfolded|outer-open|caustic|fiber-camp|pane-camp|sonar|stage-glide|liftoff-bubble|thought-streaming|spark-streaming|prism-cv|code-folded|bg-cmd-wrap|input-layer|hdr-open|rich-pre|glide-item|crab-anchor|bleed'.split('|')) {
        const a = 'data-ag-cs-' + s;
        qa(D, `[${a}]`).forEach((e) => ra(e, a));
      }
      for (const a of ['data-has-sep', 'data-pv-warn', 'data-ag-sp-running']) qa(D, `[${a}]`).forEach((e) => ra(e, a));
      qa(D, '#ag-prism-settings-v101-css,#ag-prism-studio-v101-css,#ag-prism-omni-css,#ag-prism-motion-off-css,#ag-prism-periodic-picker-css,#ag-prism-periodic-picker-root,.ag-pp-hold-ring,.ag-pp-mini-keycap,#ag-prism-wallpaper-root,#ag-prism-wallpaper-css,#ag-prism-suggester-css,.ag-omni-dock,.ag-omni-menu,.ag-prism-omni-menu,.ag-prism-omni-pane,.ag-cs-ctx-menu,.ag-cs-ctx-toast,.ag-cs-sb-more-wrap,[data-ag-prism-omni-owned="1"],.ag-cs-home-panel,.ag-cs-home-panel-seat,.ag-cs-liftoff-veil,.ag-cs-sidebar-glide-pill,.ag-cs-pill-glide,.ag-cs-conv-aura-host,.ag-cs-conv-glow,.ag-cs-prism-rim-cv,.ag-cs-code-fold-btn,.ag-cs-nav-outline-popover,.ag-cs-model-glyph,.ag-cs-panel-row-glyph,[data-testid="orchestrator-effort-bar"],.ag-cs-thinking-spark,.ag-cs-orbital-backdrop,.ag-cs-perf-backdrop,.ag-v2-habitat-prop,#' + SETTINGS_SEC_ID).forEach((e) => e.remove());
      const html = de();
      if (html) {
        for (const s of 'style|theme|palette|light-preset|motion|target-fps|telemetry|effort-slider|thought-translate|home|composer|logo-ink|sidebar|sidebar-compact|sidebar-collapsed|sb-fold|has-crab|model-menu|takeover-open|lang|cjk|accent|corners|code-font|ligatures|ambient|win-blur|scroll-bottom|resizing|mascot-drag|conv-ripple'.split('|')) ra(html, 'data-ag-cs-' + s);
        for (const s of '|thought-view|omni|link-target|sidebar-studio|sidebar-host-sync'.split('|')) ra(html, s ? 'data-ag-prism-' + s : 'data-ag-prism');
        rp(html, '--ag-spring-sidebar-ease'); rp(html, '--ag-spring-sidebar-dur');
      }
    },
  };

  W.__agPrism = prismRuntimeApi;
  W.__agClaudeStyle = prismRuntimeApi;

  if (de()) {
    startLifecycle();
  } else if (isFn(D.addEventListener)) {
    const onReady = () => {
      try {
        if (de()) {
          D.removeEventListener('readystatechange', onReady);
          D.removeEventListener('DOMContentLoaded', onReady);
          startLifecycle();
        }
      } catch {}
    };
    D.addEventListener('readystatechange', onReady);
    D.addEventListener('DOMContentLoaded', onReady);
  }
});

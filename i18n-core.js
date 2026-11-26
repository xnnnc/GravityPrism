(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.__agCsI18nCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  const LANG_OPTIONS = Object.freeze([
    { id: 'zh-CN', label: '简体中文', htmlLang: 'zh-CN', intl: 'zh-CN' },
    { id: 'zh-TW', label: '繁體中文', htmlLang: 'zh-TW', intl: 'zh-TW' },
    { id: 'en', label: 'English', htmlLang: 'en', intl: 'en-US' },
    { id: 'ja', label: '日本語', htmlLang: 'ja', intl: 'ja-JP' },
    { id: 'ko', label: '한국어', htmlLang: 'ko', intl: 'ko-KR' },
    { id: 'es', label: 'Español', htmlLang: 'es', intl: 'es-ES' },
    { id: 'fr', label: 'Français', htmlLang: 'fr', intl: 'fr-FR' },
    { id: 'de', label: 'Deutsch', htmlLang: 'de', intl: 'de-DE' },
  ]);

  const SUPPORTED_LANG_IDS = Object.freeze(LANG_OPTIONS.map((opt) => opt.id));
  const CJK_LANG_IDS = new Set(['zh-CN', 'zh-TW', 'ja', 'ko']);
  const LANG_META = Object.fromEntries(LANG_OPTIONS.map((opt) => [opt.id, opt]));

  /**
   * 规范化界面语言标识至插件支持的 8 种本地化语言之一（历史 yue 平滑迁移至 zh-CN）。
   */
  function normalizeLanguage(lang, fallback = 'zh-CN') {
    if (lang === true) return 'zh-CN';
    if (lang === false) return 'en';
    const raw = typeof lang === 'string' ? lang.trim().toLowerCase().replace(/_/g, '-') : '';
    if (!raw) return fallback;
    const clean = raw.split(/[.@]/)[0];
    if (!clean) return fallback;
    if (clean === 'en' || clean.startsWith('en-') || clean === 'english') return 'en';
    if (clean === 'ja' || clean.startsWith('ja-') || clean === 'jp' || clean === 'japanese') return 'ja';
    if (clean === 'ko' || clean.startsWith('ko-') || clean === 'kr' || clean === 'korean') return 'ko';
    if (clean === 'es' || clean.startsWith('es-') || clean === 'spanish' || clean === 'español' || clean === 'espanol') {
      return 'es';
    }
    if (clean === 'fr' || clean.startsWith('fr-') || clean === 'french' || clean === 'français' || clean === 'francais') {
      return 'fr';
    }
    if (clean === 'de' || clean.startsWith('de-') || clean === 'german' || clean === 'deutsch') return 'de';
    if (clean === 'yue' || clean.startsWith('yue-') || clean === 'zh-yue' || clean.includes('cantonese')) {
      return 'zh-CN';
    }
    if (
      clean === 'zh-hk' ||
      clean.startsWith('zh-hk-') ||
      clean === 'zh-mo' ||
      clean.startsWith('zh-mo-') ||
      clean === 'zh-tw' ||
      clean.startsWith('zh-tw-') ||
      clean === 'zh-hant' ||
      clean.startsWith('zh-hant-') ||
      clean === 'tw' ||
      clean === 'hant'
    ) {
      return 'zh-TW';
    }
    if (clean === 'zh' || clean === 'zh-cn' || clean === 'zh-hans' || clean.startsWith('zh-')) {
      return 'zh-CN';
    }
    return fallback;
  }

  function intlLocale(lang) {
    const id = normalizeLanguage(lang);
    return LANG_META[id]?.intl || 'zh-CN';
  }

  function htmlLangAttr(lang) {
    const id = normalizeLanguage(lang);
    return LANG_META[id]?.htmlLang || 'zh-CN';
  }

  function isCjkLanguage(lang) {
    return CJK_LANG_IDS.has(normalizeLanguage(lang));
  }

  const DURATION_TOKEN = /(\d+)\s*(months?|mo|weeks?|w|days?|d|hours?|h|minutes?|mins?|m|seconds?|secs?|s|years?|y)\b/g;

  function formatDuration(text, units) {
    if (!text || !units) return null;
    DURATION_TOKEN.lastIndex = 0;
    const parts = [...String(text).matchAll(DURATION_TOKEN)];
    if (!parts.length) return null;
    const leftover = String(text)
      .replace(DURATION_TOKEN, '')
      .replace(/,|\band\b/gi, '')
      .trim();
    if (leftover) return null;
    if (parts.length === 1 && parts[0][2] === 'm' && units.singleMin) {
      return parts[0][1] + units.singleMin;
    }
    const sep = typeof units.joiner === 'string' ? units.joiner : '';
    return parts
      .map((p) => {
        const key = p[2].toLowerCase();
        const unit = units[key] || units[key.replace(/s$/, '')] || key;
        return p[1] + unit;
      })
      .join(sep);
  }

  /**
   * 为避免与宿主原生语言包或独立本地化层冲突并消除额外 MutationObserver 开销，
   * 已禁用全局宿主 DOM 词典覆盖引擎（始终返回 null）。
   */
  function createDomTranslator() {
    return null;
  }

  return {
    SUPPORTED_LANG_IDS,
    LANG_OPTIONS,
    normalizeLanguage,
    intlLocale,
    htmlLangAttr,
    isCjkLanguage,
    formatDuration,
    createDomTranslator,
  };
});

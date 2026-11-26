/**
 * Obsidian Prism — Issue #18 Layer B: On-Demand Swarm Board Sidecar Localization Runtime
 * Zero-dependency UMD runtime (CommonJS + Browser IIFE) dedicated strictly to
 * `plugin://swarm--swarm_board-<port>/` OOPIF Webviews.
 *
 * Security & Isolation Guarantees:
 *   1. 4-layer gate: strict URL check, DOM sentinel check, external ASAR i18n auto-yield,
 *      and strict #ov-frame / <iframe> exclusion.
 *   2. Zero ES6 Map allocation (immune to external Map.prototype hijacking).
 *   3. Strict <select>/<option> whitelist (#f-agent, #f-mention, #f-channel, #replay-timing)
 *      mutating ONLY option textContent, NEVER option.value or select.value.
 *   4. Strict content-isolation exemptions so dynamic messages, code, member names,
 *      titles, workspace paths, and raw logs are never altered.
 *   5. WeakMap-backed snapshots + observer pause around writes + rAF batching +
 *      visibilitychange/blur 0fps hibernation + 100% lossless English restore on destroy().
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    var api = factory(root);
    if (root) root.__agPrismSwarmI18nFactory = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function (globalRoot) {
  'use strict';

  var hasOwn = Object.prototype.hasOwnProperty;
  var ZH_CHAR_RE = /[\u4e00-\u9fa5]/;
  var SWARM_HOST_RE = /^swarm--swarm_board-\d+$/;
  var ROOT_ATTR = 'data-ag-prism-swarm-i18n';

  var SKIP_SUBTREE_TAGS = {
    SCRIPT: 1,
    STYLE: 1,
    NOSCRIPT: 1,
    CODE: 1,
    PRE: 1,
    CANVAS: 1,
    IFRAME: 1,
    VIDEO: 1,
    AUDIO: 1,
    TEMPLATE: 1,
    TEXTAREA: 1,
    KBD: 1,
  };

  var SKIP_SUBTREE_IDS = {
    'ov-frame': 1,
    raw: 1,
    'raw-meta': 1,
    'swarm-title': 1,
  };

  var SELECT_WHITELIST_IDS = {
    'f-agent': 1,
    'f-mention': 1,
    'f-channel': 1,
    'replay-timing': 1,
  };

  // 元素及其后代文本绝对豁免（动态内容、成员名、消息正文、代码、路径等）
  var EXEMPT_TEXT_CLASSES = {
    'msg-body': 1,
    'sys-text': 1,
    'msg-author': 1,
    'msg-to': 1,
    mention: 1,
    'msg-channel': 1,
    'seq-ref': 1,
    'o2-thg': 1,
    'o2-runt': 1,
    'o2-runnote': 1,
    'o2-runsum': 1,
    'o2-donem': 1,
    'o2-who': 1,
    'o2-mauth': 1,
    'o2-mrole': 1,
    'o2-mts': 1,
    'o2-sttxt': 1,
    'o2-ack': 1,
    'o2-rcap': 1,
    'o2-tvcap': 1,
    'o2-rwhen': 1,
    'o2-tvwhen': 1,
    'o2-wchip': 1,
    'o2-mnow': 1,
    'o2-sttag': 1,
    'hv-cht': 1,
    'hv-rh': 1,
    'hv-rl': 1,
    'hv-nm': 1,
    'ov-who': 1,
  };

  // 属性安全翻译列表（绝不触碰 value / data-* / id / class / href / src）
  var TRANSLATABLE_ATTRS = ['title', 'aria-label', 'placeholder', 'alt'];

  // 即使文本豁免，仍允许翻译特定安全提示属性的元素类/testid
  var SAFE_ATTR_ONLY_CLASSES = {
    'msg-channel': 1,
    mention: 1,
    'o2-sttag': 1,
    'hv-row': 1,
  };

  // 线程标题内允许翻译的内置系统兜底标题
  var BUILTIN_THREAD_TITLES = {
    Other: 1,
    Tasks: 1,
    'Needs you': 1,
    Stuck: 1,
    'Waiting on @coordinator': 1,
  };

  var RE_RMETA_EN = /^(\d+) of (\d+) tasks done$/;
  var RE_RMETA_ZH = /^(\d+) \/ (\d+) 项任务已完成$/;

  function hasClass(el, cls) {
    if (!el || el.nodeType !== 1) return false;
    if (el.classList && typeof el.classList.contains === 'function') {
      return el.classList.contains(cls);
    }
    var cn = typeof el.className === 'string' ? el.className : '';
    if (!cn) return false;
    var parts = cn.split(/\s+/);
    for (var i = 0; i < parts.length; i++) {
      if (parts[i] === cls) return true;
    }
    return false;
  }

  function hasAnyClass(el, map) {
    if (!el || el.nodeType !== 1) return false;
    var cn = typeof el.className === 'string' ? el.className : '';
    if (!cn) return false;
    var parts = cn.split(/\s+/);
    for (var i = 0; i < parts.length; i++) {
      if (parts[i] && map[parts[i]]) return true;
    }
    return false;
  }

  function getAttr(el, name) {
    if (!el || typeof el.getAttribute !== 'function') return null;
    try {
      return el.getAttribute(name);
    } catch (_) {
      return null;
    }
  }

  function getTag(el) {
    return el && el.tagName ? String(el.tagName).toUpperCase() : '';
  }

  function getId(el) {
    if (!el || el.nodeType !== 1) return '';
    if (typeof el.id === 'string' && el.id) return el.id;
    var v = getAttr(el, 'id');
    return v ? String(v) : '';
  }

  function isSwarmHostLocation(locOrHref) {
    if (!locOrHref) return false;
    if (typeof locOrHref === 'string') {
      try {
        var parsed = new URL(locOrHref);
        return (
          parsed.protocol === 'plugin:' &&
          SWARM_HOST_RE.test(parsed.hostname || '') &&
          !parsed.port &&
          !parsed.username &&
          !parsed.password &&
          parsed.pathname === '/'
        );
      } catch (_) {
        return false;
      }
    }
    var proto = String(locOrHref.protocol || '');
    var host = String(locOrHref.hostname || '');
    var port = String(locOrHref.port || '');
    var user = String(locOrHref.username || '');
    var pass = String(locOrHref.password || '');
    var pathname = locOrHref.pathname === undefined || locOrHref.pathname === null ? '/' : String(locOrHref.pathname);
    if (typeof locOrHref.href === 'string' && (!proto || !host)) {
      return isSwarmHostLocation(locOrHref.href);
    }
    return proto === 'plugin:' && SWARM_HOST_RE.test(host) && !port && !user && !pass && pathname === '/';
  }

  function hasSwarmDomSentinel(doc) {
    if (!doc || typeof doc.querySelector !== 'function') return false;
    try {
      return Boolean(
        doc.querySelector('[data-testid="swarm-tabs"], [data-testid="swarm-empty-state"], [data-testid="swarm-loading"]')
      );
    } catch (_) {
      return false;
    }
  }

  var EXTERNAL_SWARM_GLOBAL_KEYS = [
    '__AGY_SWARM_I18N__',
    '__AGY_I18N_INITIALIZED__',
    '__AGY_I18N__',
    '__AGY_I18N_DATA__',
    '__antigravityZhPatchInstalled',
    '__antigravityZhSetLang',
    '__antigravityZhPatchObserver',
    '__agyI18n',
    '__agyTranslateEnhancementText',
    '__antigravity_i18n_runner_active',
    '__ANTIGRAVITY_I18N_DATA__',
    '__ANTIGRAVITY_REVERSE_MAP__',
    '__antigravityZh',
    '__antigravityZhDict',
    '__agySidebarDragFixInstalled',
    '__ag_hanhua_engine__',
    '__AGY_ZHCN__',
    '__AG_ZH__',
    '__ANTIGRAVITY_CN__',
    '__ANTIGRAVITY_I18N__',
    '__AG_I18N__',
    '__AG_CN_PATCH__',
    '__AGY_CN__',
    '__I18N_PATCHED__',
  ];

  var EXTERNAL_SWARM_DOM_ATTRS = [
    'data-agy-i18n',
    'data-agy-hans-ui',
    'data-ag-cn',
    'data-i18n-patched',
    'data-translated',
  ];

  function detectExternalSwarmI18n(win, doc) {
    try {
      if (win) {
        for (var g = 0; g < EXTERNAL_SWARM_GLOBAL_KEYS.length; g++) {
          if (win[EXTERNAL_SWARM_GLOBAL_KEYS[g]]) return 'global-marker';
        }
        try {
          var ls = win.localStorage;
          var hansLang = ls && typeof ls.getItem === 'function' ? ls.getItem('antigravityHansLang') : null;
          if (hansLang !== null && hansLang !== undefined) {
            var normHans = String(hansLang).trim().toLowerCase();
            if (normHans && normHans !== 'en' && normHans !== 'en-us' && normHans !== 'off' && normHans !== 'false' && normHans !== '0') {
              return 'storage-marker';
            }
          }
        } catch (_) {}
      }
    } catch (_) {}
    try {
      if (doc) {
        var rootEl0 = doc.documentElement;
        var bodyEl0 = doc.body;
        if (rootEl0 && rootEl0.classList && typeof rootEl0.classList.contains === 'function') {
          if (rootEl0.classList.contains('agy-theme-active') || rootEl0.classList.contains('agy-theme-active-v2')) {
            return 'dom-marker';
          }
        }
        for (var a = 0; a < EXTERNAL_SWARM_DOM_ATTRS.length; a++) {
          var attrName = EXTERNAL_SWARM_DOM_ATTRS[a];
          if ((rootEl0 && getAttr(rootEl0, attrName) !== null) || (bodyEl0 && getAttr(bodyEl0, attrName) !== null)) {
            return 'dom-marker';
          }
        }
        if (typeof doc.querySelector === 'function') {
          if (
            doc.querySelector(
              '[data-agy-i18n], [data-agy-hans-ui], [data-ag-cn], [data-i18n-patched], [data-translated], #agy-theme-switcher, #antigravity-quota-widget'
            )
          ) {
            return 'dom-marker';
          }
        }
      }
    } catch (_) {}
    try {
      var rootEl = doc && doc.documentElement;
      if (rootEl && getAttr(rootEl, ROOT_ATTR) === 'active') {
        return null;
      }
      if (rootEl) {
        var htmlLang = String(getAttr(rootEl, 'lang') || rootEl.lang || '').trim();
        if (/^zh(?:$|[-_])/i.test(htmlLang)) {
          return 'html-lang-zh';
        }
      }
      if (doc && typeof doc.getElementById === 'function') {
        var anchorIds = ['tabbtn-feed', 'tabbtn-members', 'empty-title', 'live-label'];
        for (var i = 0; i < anchorIds.length; i++) {
          var anchor = doc.getElementById(anchorIds[i]);
          if (anchor && typeof anchor.textContent === 'string' && ZH_CHAR_RE.test(anchor.textContent)) {
            return 'chinese-anchor';
          }
        }
      }
    } catch (_) {}
    return null;
  }

  function compilePatterns(list) {
    var out = [];
    if (!Array.isArray(list)) return out;
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      if (!item || typeof item.regex !== 'string' || typeof item.replacement !== 'string') continue;
      if (item.regex.charAt(0) !== '^' || item.regex.charAt(item.regex.length - 1) !== '$') continue;
      try {
        out.push({ re: new RegExp(item.regex), rep: item.replacement });
      } catch (_) {}
    }
    return out;
  }

  function createSwarmI18nEngine(dictInput) {
    var exact = Object.create(null);
    var srcExact = dictInput && dictInput.exact && typeof dictInput.exact === 'object' ? dictInput.exact : null;
    if (srcExact) {
      var keys = Object.keys(srcExact);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var v = srcExact[k];
        if (typeof v === 'string' && v.length > 0) {
          exact[k] = v;
        }
      }
    }
    var patterns = compilePatterns(dictInput && dictInput.patterns);
    var optionPatterns = compilePatterns(dictInput && dictInput.optionPatterns);
    var protectedUiKeys = Object.create(null);
    var srcProt = dictInput && dictInput.protectedUiKeys && typeof dictInput.protectedUiKeys === 'object' ? dictInput.protectedUiKeys : null;
    if (srcProt) {
      var pKeys = Object.keys(srcProt);
      for (var j = 0; j < pKeys.length; j++) {
        protectedUiKeys[pKeys[j]] = String(srcProt[pKeys[j]]);
      }
    }

    function translateCore(rawText, allowOptionPatterns) {
      if (typeof rawText !== 'string' || !rawText) return null;
      var leadMatch = /^(\s*)/.exec(rawText);
      var trailMatch = /(\s*)$/.exec(rawText);
      var lead = leadMatch ? leadMatch[1] : '';
      var trail = trailMatch ? trailMatch[1] : '';
      var trimmed = rawText.trim();
      if (!trimmed) return null;

      if (hasOwn.call(exact, trimmed)) {
        var hit = exact[trimmed];
        if (hit === trimmed) return null;
        return lead + hit + trail;
      }

      if (allowOptionPatterns) {
        for (var o = 0; o < optionPatterns.length; o++) {
          var op = optionPatterns[o];
          if (op.re.test(trimmed)) {
            var oRes = trimmed.replace(op.re, op.rep);
            if (oRes !== trimmed) return lead + oRes + trail;
          }
        }
      }

      for (var p = 0; p < patterns.length; p++) {
        var pat = patterns[p];
        if (pat.re.test(trimmed)) {
          var pRes = trimmed.replace(pat.re, pat.rep);
          if (pRes !== trimmed) return lead + pRes + trail;
        }
      }

      return null;
    }

    return {
      translate: function (rawText) {
        return translateCore(rawText, false);
      },
      translateOption: function (rawText) {
        return translateCore(rawText, true);
      },
      protectedUiKeys: protectedUiKeys,
    };
  }

  function getCustomViewCopyUi(win) {
    try {
      var hive = win && win.SwarmHive;
      var vc = hive && hive.viewCopy;
      var ui = vc && vc.ui;
      if (!ui || typeof ui !== 'object') return null;
      var customMap = Object.create(null);
      var customVals = Object.create(null);
      var count = 0;
      var keys = Object.keys(ui);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var v = ui[k];
        if (typeof v === 'string' && v.trim()) {
          customMap[k] = v.trim();
          customVals[v.trim()] = 1;
          count += 1;
        }
      }
      return count > 0 ? { byKey: customMap, byVal: customVals } : null;
    } catch (_) {
      return null;
    }
  }

  function inferProtectedUiKey(el) {
    if (!el || el.nodeType !== 1) return null;
    var parent = el.parentElement;
    var tag = getTag(el);
    if (hasClass(el, 'o2-h') && parent) {
      if (hasClass(parent, 'o2-team')) return 'team';
      if (hasClass(parent, 'o2-threads')) return 'threads';
      if (hasClass(parent, 'o2-br')) {
        var brKeys = ['needs', 'waiting', 'stuck', 'running', 'blocked', 'planned', 'done'];
        for (var i = 0; i < brKeys.length; i++) {
          if (hasClass(parent, brKeys[i])) return brKeys[i];
        }
      }
    }
    if (hasClass(el, 'o2-none') && parent && hasClass(parent, 'o2-br')) {
      var noneKeys = ['needs', 'waiting', 'stuck', 'running', 'blocked', 'planned'];
      for (var j = 0; j < noneKeys.length; j++) {
        if (hasClass(parent, noneKeys[j])) return 'none_' + noneKeys[j];
      }
    }
    if (tag === 'B' && parent) {
      if (hasClass(parent, 'o2-lb')) return 'lead';
      if (hasClass(parent, 'o2-runh')) return 'running';
      if (hasClass(parent, 'o2-tvh')) return 'progress';
    }
    if (hasClass(el, 'o2-glbl') && parent) {
      if (hasClass(parent, 'o2-goal')) return 'goal';
      if (hasClass(parent, 'o2-rh')) return 'progress';
    }
    if (tag === 'SPAN' && parent && hasClass(parent, 'o2-thn')) return 'now';
    if (hasClass(el, 'o2-rtag')) return 'now';
    if (hasClass(el, 'o2-rcmp')) return 'compare';
    if (hasClass(el, 'o2-rexp')) return 'expand';
    if (hasClass(el, 'o2-more')) return 'more';
    if (hasClass(el, 'o2-mstat') && hasClass(el, 'warn')) return 'needs';
    return null;
  }

  function isInsideO2Scope(el) {
    var cur = el;
    while (cur && cur.nodeType === 1) {
      var id = getId(cur);
      if (id === 'ov-plain' || id === 'members' || id === 'hive') return true;
      if (hasClass(cur, 'o2')) return true;
      cur = cur.parentElement;
    }
    return false;
  }

  function isProtectedByViewCopy(el, trimmedText, customUi) {
    if (!customUi || !el) return false;
    if (!isInsideO2Scope(el)) return false;
    var slotKey = inferProtectedUiKey(el);
    if (slotKey) {
      return hasOwn.call(customUi.byKey, slotKey);
    }
    if (trimmedText && hasOwn.call(customUi.byVal, trimmedText)) {
      return true;
    }
    return false;
  }

  function isCompletelySkippedSubtree(el) {
    if (!el || el.nodeType !== 1) return true;
    var tag = getTag(el);
    if (SKIP_SUBTREE_TAGS[tag]) return true;
    var id = getId(el);
    if (id && SKIP_SUBTREE_IDS[id]) return true;
    if (getAttr(el, 'data-ag-no-i18n') !== null || getAttr(el, 'data-agy-i18n') !== null) return true;
    return false;
  }

  function isInsideChannelTabs(el) {
    var cur = el;
    while (cur && cur.nodeType === 1) {
      if (getId(cur) === 'channel-tabs') return true;
      cur = cur.parentElement;
    }
    return false;
  }

  function findAncestorChannelTab(el) {
    var cur = el;
    while (cur && cur.nodeType === 1) {
      if (hasClass(cur, 'channel-tab') || getAttr(cur, 'data-testid') === 'swarm-channel-tab') return cur;
      if (getId(cur) === 'channel-tabs') return null;
      cur = cur.parentElement;
    }
    return null;
  }

  function findAncestorSelect(el) {
    var cur = el;
    while (cur && cur.nodeType === 1) {
      if (getTag(cur) === 'SELECT') return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  function canTranslateTextUnderElement(el, trimmedText) {
    if (!el || el.nodeType !== 1) return { allow: false, isOption: false };

    var tag = getTag(el);
    var id = getId(el);

    if (id === 'gif-modal-title') return { allow: false, isOption: false };

    // <select>/<option> 严格白名单
    if (tag === 'OPTION') {
      var sel = findAncestorSelect(el.parentElement);
      var selId = sel ? getId(sel) : '';
      if (selId && SELECT_WHITELIST_IDS[selId]) {
        return { allow: true, isOption: true };
      }
      return { allow: false, isOption: false };
    }
    if (tag === 'SELECT') {
      return { allow: false, isOption: false };
    }

    // #channel-tabs 严格隔离：仅译 All 按钮文本（data-channel=""），自定义频道名绝不触碰
    if (isInsideChannelTabs(el)) {
      var tabBtn = findAncestorChannelTab(el);
      if (tabBtn && getAttr(tabBtn, 'data-channel') === '' && trimmedText === 'All') {
        return { allow: true, isOption: false };
      }
      return { allow: false, isOption: false };
    }

    // .o2-thn 正文豁免，仅允许 .o2-thn > span（Now）
    if (hasClass(el, 'o2-thn')) {
      return { allow: false, isOption: false };
    }
    if (tag === 'SPAN' && el.parentElement && hasClass(el.parentElement, 'o2-thn')) {
      return { allow: true, isOption: false };
    }

    // .o2-askb 正文/标题豁免，仅允许 .o2-askon
    if (hasClass(el, 'o2-askon')) {
      return { allow: true, isOption: false };
    }

    // .o2-tt 直接任务标题豁免，仅允许内部 .o2-tw
    if (hasClass(el, 'o2-tw')) {
      return { allow: true, isOption: false };
    }
    if (hasClass(el, 'o2-tt')) {
      return { allow: false, isOption: false };
    }

    // .o2-mtag：仅允许 swarm-member-seen 与 swarm-member-channels 的 "all channels"
    if (hasClass(el, 'o2-mtag')) {
      var mTid = getAttr(el, 'data-testid') || '';
      if (mTid === 'swarm-member-seen') return { allow: true, isOption: false };
      if (mTid === 'swarm-member-channels' && trimmedText === 'all channels') {
        return { allow: true, isOption: false };
      }
      return { allow: false, isOption: false };
    }

    // .o2-tht > b 仅译内置兜底标题（Other / Tasks / Needs you / Stuck / Waiting on @coordinator）
    if (tag === 'B' && el.parentElement && hasClass(el.parentElement, 'o2-tht')) {
      return { allow: Boolean(BUILTIN_THREAD_TITLES[trimmedText]), isOption: false };
    }

    // 向上检查组合与类名豁免
    var cur = el;
    while (cur && cur.nodeType === 1) {
      var cid = getId(cur);
      if (cid && SKIP_SUBTREE_IDS[cid]) return { allow: false, isOption: false };
      var ctag = getTag(cur);
      if (SKIP_SUBTREE_TAGS[ctag] || ctag === 'SVG') return { allow: false, isOption: false };
      if (getAttr(cur, 'data-ag-no-i18n') !== null || getAttr(cur, 'data-agy-i18n') !== null) {
        return { allow: false, isOption: false };
      }
      if (hasAnyClass(cur, EXEMPT_TEXT_CLASSES)) {
        return { allow: false, isOption: false };
      }
      // .o2-goal p 与 .o2-goal b 豁免（仅 .o2-glbl 可译）
      if ((ctag === 'P' || ctag === 'B') && cur.parentElement && hasClass(cur.parentElement, 'o2-goal')) {
        return { allow: false, isOption: false };
      }
      // .o2-cb b / .o2-cb p 豁免
      if ((ctag === 'B' || ctag === 'P') && cur.parentElement && hasClass(cur.parentElement, 'o2-cb')) {
        return { allow: false, isOption: false };
      }
      // .o2-lb p（协调者动态摘要）豁免
      if (ctag === 'P' && cur.parentElement && hasClass(cur.parentElement, 'o2-lb')) {
        return { allow: false, isOption: false };
      }
      // .o2-askb 内部除了已提前放行的 .o2-askon 外一律豁免
      if (hasClass(cur, 'o2-askb')) {
        return { allow: false, isOption: false };
      }
      // .o2-thn 内部除已提前放行的直接 > span 外一律豁免
      if (hasClass(cur, 'o2-thn')) {
        return { allow: false, isOption: false };
      }
      // .o2-mtag 内部除上面放行的之外一律豁免
      if (hasClass(cur, 'o2-mtag')) {
        return { allow: false, isOption: false };
      }
      cur = cur.parentElement;
    }

    return { allow: true, isOption: false };
  }

  function canTranslateAttrsOnElement(el) {
    if (!el || el.nodeType !== 1) return false;
    var id = getId(el);
    if (id && SKIP_SUBTREE_IDS[id]) return false;
    if (hasClass(el, 'ov-who')) return false;
    if (getAttr(el, 'data-testid') === 'swarm-member-owner') return true; // title="Runs on ..."
    if (hasAnyClass(el, SAFE_ATTR_ONLY_CLASSES)) return true;

    // #channel-tabs 仅允许 All 按钮（data-channel=""）与 #main 按钮（data-channel="main"）的 title
    if (isInsideChannelTabs(el)) {
      if (hasClass(el, 'channel-tab') || getAttr(el, 'data-testid') === 'swarm-channel-tab') {
        var ch = getAttr(el, 'data-channel');
        return ch === '' || ch === 'main';
      }
      return getId(el) === 'channel-tabs';
    }

    // 豁免正文区域内元素不翻译属性（除非属于上面已放行的 SAFE_ATTR_ONLY_CLASSES）
    var cur = el;
    while (cur && cur.nodeType === 1) {
      var cid = getId(cur);
      if (cid && SKIP_SUBTREE_IDS[cid]) return false;
      if (hasClass(cur, 'msg-body') || hasClass(cur, 'sys-text') || hasClass(cur, 'o2-runnote') || hasClass(cur, 'o2-mnow')) {
        return false;
      }
      cur = cur.parentElement;
    }
    return true;
  }

  function mountSwarmI18n(opts) {
    var options = opts && typeof opts === 'object' ? opts : {};
    var win = options.root || (typeof window !== 'undefined' ? window : globalRoot);
    var doc = options.doc || (win && win.document) || (typeof document !== 'undefined' ? document : null);
    var dict = options.dict || {};
    var allowNonSwarmLocation = Boolean(options.allowNonSwarmLocation);

    var makeInactive = function (ok, status, reason) {
      return {
        ok: ok,
        status: status,
        reason: reason || null,
        scan: function () {},
        destroy: function () {},
        getStatus: function () {
          return { status: status, reason: reason || null, translatedNodes: 0, translatedAttrs: 0 };
        },
      };
    };

    if (!win || !doc || !doc.documentElement) {
      return makeInactive(false, 'skipped-no-dom', 'no-document');
    }

    // 门禁 1：严格 URL 校验
    if (!allowNonSwarmLocation && !isSwarmHostLocation(win.location)) {
      return makeInactive(false, 'skipped-non-swarm-url', 'url-mismatch');
    }

    // 门禁 2：DOM 哨兵检查（若文档仍在 loading 允许延后一次检查）
    var readyState = String(doc.readyState || 'complete');
    if (!hasSwarmDomSentinel(doc) && readyState !== 'loading') {
      return makeInactive(false, 'skipped-non-swarm-dom', 'missing-sentinel');
    }

    // 门禁 3：外部 ASAR 汉化礼让
    var extReason = detectExternalSwarmI18n(win, doc);
    if (extReason) {
      return makeInactive(true, 'yielded', extReason);
    }

    var engine = createSwarmI18nEngine(dict);
    var origTextByNode = new WeakMap();
    var origAttrsByEl = new WeakMap();
    var trackedTextNodes = [];
    var trackedAttrEls = [];

    var destroyed = false;
    var status = 'active';
    var yieldReason = null;
    var observer = null;
    var observerConnected = false;
    var isApplying = false;
    var rafId = null;
    var timerId = null;
    var pendingWhileHidden = false;
    var winBlurred = false;
    var domReadyListener = null;

    var translatedNodeCount = 0;
    var translatedAttrCount = 0;

    function isHibernating() {
      return Boolean((doc && doc.hidden === true) || winBlurred);
    }

    function disconnectObserver() {
      if (observer && observerConnected) {
        try {
          observer.disconnect();
        } catch (_) {}
        observerConnected = false;
      }
    }

    function connectObserver() {
      if (destroyed || !observer || observerConnected) return;
      var target = doc.body || doc.documentElement;
      if (!target) return;
      try {
        observer.observe(target, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
          attributeFilter: TRANSLATABLE_ATTRS,
        });
        observerConnected = true;
      } catch (_) {}
    }

    function pruneDisconnected() {
      if (trackedTextNodes.length > 512) {
        var nextNodes = [];
        for (var i = 0; i < trackedTextNodes.length; i++) {
          var n = trackedTextNodes[i];
          if (n && n.isConnected !== false && origTextByNode.has(n)) nextNodes.push(n);
        }
        trackedTextNodes = nextNodes;
      }
      if (trackedAttrEls.length > 512) {
        var nextEls = [];
        for (var j = 0; j < trackedAttrEls.length; j++) {
          var e = trackedAttrEls[j];
          if (e && e.isConnected !== false && origAttrsByEl.has(e)) nextEls.push(e);
        }
        trackedAttrEls = nextEls;
      }
    }

    function processTextNode(node, customUi) {
      if (!node || node.nodeType !== 3) return;
      var parent = node.parentElement || (node.parentNode && node.parentNode.nodeType === 1 ? node.parentNode : null);
      if (!parent) return;

      var val = node.nodeValue;
      if (typeof val !== 'string' || !val) return;
      var trimmed = val.trim();
      if (!trimmed) return;

      var existing = origTextByNode.get(node);
      if (existing && existing.translated === val) {
        return;
      }

      if (isProtectedByViewCopy(parent, trimmed, customUi)) return;

      var check = canTranslateTextUnderElement(parent, trimmed);
      if (!check.allow) return;

      var translated = check.isOption ? engine.translateOption(val) : engine.translate(val);
      if (!translated || translated === val) return;

      if (!existing) {
        origTextByNode.set(node, {
          orig: val,
          translated: translated,
          isRmeta: hasClass(parent, 'o2-rmeta'),
        });
        trackedTextNodes.push(node);
        translatedNodeCount += 1;
      } else {
        existing.orig = val;
        existing.translated = translated;
        existing.isRmeta = hasClass(parent, 'o2-rmeta');
      }
      node.nodeValue = translated;
    }

    function processElementAttrs(el, customUi) {
      if (!el || el.nodeType !== 1) return;
      if (!canTranslateAttrsOnElement(el)) return;

      var attrMap = origAttrsByEl.get(el);
      for (var i = 0; i < TRANSLATABLE_ATTRS.length; i++) {
        var attrName = TRANSLATABLE_ATTRS[i];
        var val = getAttr(el, attrName);
        if (typeof val !== 'string' || !val) continue;
        var trimmed = val.trim();
        if (!trimmed) continue;

        if (attrMap && hasOwn.call(attrMap, attrName) && attrMap[attrName].translated === val) {
          continue;
        }
        if (isProtectedByViewCopy(el, trimmed, customUi)) continue;

        var translated = engine.translate(val);
        if (!translated || translated === val) continue;

        if (!attrMap) {
          attrMap = Object.create(null);
          origAttrsByEl.set(el, attrMap);
          trackedAttrEls.push(el);
        }
        if (!hasOwn.call(attrMap, attrName)) {
          translatedAttrCount += 1;
        }
        attrMap[attrName] = { orig: val, translated: translated };
        try {
          el.setAttribute(attrName, translated);
        } catch (_) {}
      }
    }

    function walkSubtree(node, customUi) {
      if (!node) return;
      if (node.nodeType === 3) {
        processTextNode(node, customUi);
        return;
      }
      if (node.nodeType !== 1) return;
      if (isCompletelySkippedSubtree(node)) return;

      processElementAttrs(node, customUi);

      // 门禁 4 & SVG 内部跳过（保留 SVG 自身 aria-label / title 翻译，不深入其内部节点）
      if (getTag(node) === 'SVG') return;

      var children = node.childNodes;
      if (!children || !children.length) return;
      for (var i = 0; i < children.length; i++) {
        walkSubtree(children[i], customUi);
      }
    }

    function scan(rootNode) {
      if (destroyed || status !== 'active') return;
      // 再次动态检查是否出现外部汉化
      var lateExt = detectExternalSwarmI18n(win, doc);
      if (lateExt) {
        restoreAllDom();
        status = 'yielded';
        yieldReason = lateExt;
        disconnectObserver();
        try {
          doc.documentElement.removeAttribute(ROOT_ATTR);
        } catch (_) {}
        return;
      }
      var target = rootNode || doc.body || doc.documentElement;
      if (!target) return;
      if (isApplying) return;

      isApplying = true;
      disconnectObserver();
      try {
        var customUi = getCustomViewCopyUi(win);
        walkSubtree(target, customUi);
        pruneDisconnected();
      } finally {
        isApplying = false;
        if (!destroyed && status === 'active') {
          connectObserver();
        }
      }
    }

    function cancelPendingFrame() {
      if (rafId !== null) {
        try {
          if (typeof win.cancelAnimationFrame === 'function') win.cancelAnimationFrame(rafId);
        } catch (_) {}
        rafId = null;
      }
      if (timerId !== null) {
        try {
          clearTimeout(timerId);
        } catch (_) {}
        timerId = null;
      }
    }

    function scheduleScan() {
      if (destroyed || status !== 'active') return;
      if (isHibernating()) {
        pendingWhileHidden = true;
        cancelPendingFrame();
        return;
      }
      if (rafId !== null || timerId !== null) return;
      var run = function () {
        rafId = null;
        timerId = null;
        pendingWhileHidden = false;
        if (!destroyed && status === 'active' && !isHibernating()) {
          scan();
        }
      };
      if (typeof win.requestAnimationFrame === 'function') {
        rafId = win.requestAnimationFrame(run);
      } else {
        timerId = setTimeout(run, 16);
      }
    }

    function onVisibilityChange() {
      if (destroyed || status !== 'active') return;
      if (isHibernating()) {
        cancelPendingFrame();
      } else if (pendingWhileHidden) {
        pendingWhileHidden = false;
        scheduleScan();
      }
    }

    function onWindowBlur() {
      winBlurred = true;
      cancelPendingFrame();
    }

    function onWindowFocus() {
      winBlurred = false;
      if (!destroyed && status === 'active' && pendingWhileHidden) {
        pendingWhileHidden = false;
        scheduleScan();
      }
    }

    function restoreAllDom() {
      disconnectObserver();
      isApplying = true;
      try {
        for (var i = 0; i < trackedTextNodes.length; i++) {
          var node = trackedTextNodes[i];
          if (!node) continue;
          var rec = origTextByNode.get(node);
          if (!rec) continue;
          try {
            if (node.nodeValue === rec.translated) {
              node.nodeValue = rec.orig;
            } else if (rec.isRmeta && typeof node.nodeValue === 'string' && RE_RMETA_ZH.test(node.nodeValue) && RE_RMETA_EN.test(rec.orig)) {
              // 兼容 hive.js:742 对 .o2-rmeta 执行过 .replace(/^\d+/, f.done) 原位更新
              node.nodeValue = node.nodeValue.replace(RE_RMETA_ZH, '$1 of $2 tasks done');
            }
          } catch (_) {}
          origTextByNode.delete(node);
        }
        trackedTextNodes = [];

        for (var j = 0; j < trackedAttrEls.length; j++) {
          var el = trackedAttrEls[j];
          if (!el) continue;
          var aMap = origAttrsByEl.get(el);
          if (!aMap) continue;
          var names = Object.keys(aMap);
          for (var k = 0; k < names.length; k++) {
            var name = names[k];
            var aRec = aMap[name];
            try {
              if (getAttr(el, name) === aRec.translated) {
                el.setAttribute(name, aRec.orig);
              }
            } catch (_) {}
          }
          origAttrsByEl.delete(el);
        }
        trackedAttrEls = [];
        translatedNodeCount = 0;
        translatedAttrCount = 0;
      } finally {
        isApplying = false;
      }
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      status = 'destroyed';
      cancelPendingFrame();
      if (domReadyListener && typeof doc.removeEventListener === 'function') {
        try {
          doc.removeEventListener('DOMContentLoaded', domReadyListener);
        } catch (_) {}
        domReadyListener = null;
      }
      if (typeof doc.removeEventListener === 'function') {
        try {
          doc.removeEventListener('visibilitychange', onVisibilityChange);
        } catch (_) {}
      }
      if (typeof win.removeEventListener === 'function') {
        try {
          win.removeEventListener('blur', onWindowBlur);
          win.removeEventListener('focus', onWindowFocus);
        } catch (_) {}
      }
      restoreAllDom();
      try {
        doc.documentElement.removeAttribute(ROOT_ATTR);
      } catch (_) {}
      try {
        if (win.__agPrismSwarmI18n === instance) {
          delete win.__agPrismSwarmI18n;
        }
      } catch (_) {}
    }

    function startActive() {
      if (destroyed) return;
      if (!hasSwarmDomSentinel(doc)) {
        status = 'skipped-non-swarm-dom';
        return;
      }
      var lateExt = detectExternalSwarmI18n(win, doc);
      if (lateExt) {
        status = 'yielded';
        yieldReason = lateExt;
        return;
      }
      try {
        doc.documentElement.setAttribute(ROOT_ATTR, 'active');
      } catch (_) {}

      var MO = win.MutationObserver || (typeof MutationObserver !== 'undefined' ? MutationObserver : null);
      if (typeof MO === 'function') {
        observer = new MO(function () {
          if (destroyed || isApplying || status !== 'active') return;
          scheduleScan();
        });
      }

      if (typeof doc.addEventListener === 'function') {
        try {
          doc.addEventListener('visibilitychange', onVisibilityChange);
        } catch (_) {}
      }
      if (typeof win.addEventListener === 'function') {
        try {
          win.addEventListener('blur', onWindowBlur);
          win.addEventListener('focus', onWindowFocus);
        } catch (_) {}
      }

      scan();
    }

    var instance = {
      ok: true,
      get status() {
        return status;
      },
      scan: scan,
      destroy: destroy,
      getStatus: function () {
        return {
          status: status,
          reason: yieldReason,
          hibernating: isHibernating(),
          translatedNodes: translatedNodeCount,
          translatedAttrs: translatedAttrCount,
        };
      },
    };

    if (hasSwarmDomSentinel(doc)) {
      startActive();
    } else if (readyState === 'loading' && typeof doc.addEventListener === 'function') {
      domReadyListener = function () {
        domReadyListener = null;
        startActive();
      };
      doc.addEventListener('DOMContentLoaded', domReadyListener, { once: true });
    }

    try {
      if (status === 'active') {
        win.__agPrismSwarmI18n = instance;
      }
    } catch (_) {}

    return instance;
  }

  return {
    mountSwarmI18n: mountSwarmI18n,
    createSwarmI18nEngine: createSwarmI18nEngine,
    isSwarmHostLocation: isSwarmHostLocation,
    hasSwarmDomSentinel: hasSwarmDomSentinel,
    detectExternalSwarmI18n: detectExternalSwarmI18n,
    ROOT_ATTR: ROOT_ATTR,
  };
});

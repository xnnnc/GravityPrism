/**
 * Obsidian Prism — Channel 4 On-Demand Host UI Localization Runtime
 * Zero-dependency UMD runtime (CommonJS + Browser IIFE) with:
 *   1. Universal 4-layer external localization auto-yield (known markers, zero-signature Chrome UI zh-CN sampling,
 *      1200ms delayed-plugin recheck, and 3000ms ping-pong conflict circuit breaker)
 *   2. 100% reversible destroy() using WeakMap snapshots (zero DOM property pollution)
 *   3. Strict Prism-owned UI, model-selector, code/editor, and chat-prose isolation
 *   4. 0fps visibility/blur/win-blur hibernation + time-sliced rAF scheduling (<= 80 nodes & < 5ms/frame)
 *
 * Upstream Credit:
 *   Dictionary & DOM localization approach inspired by yiheng8023/antigravity-chinese (v3.3.63)
 *   (MIT License, Copyright (c) 2026 Antigravity Chinese Localization Contributors,
 *    https://github.com/yiheng8023/antigravity-chinese).
 *   Re-architected for Obsidian Prism (GPL-3.0-only) as a Zero-ASAR pure CDP on-demand channel.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    var api = factory(root);
    if (root) root.__agPrismHostI18nFactory = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function (root) {
  'use strict';

  var hasOwn = Object.prototype.hasOwnProperty;
  var ZH_CHAR_RE = /[\u4e00-\u9fa5]/;
  var EN_ALPHA_RE = /[a-zA-Z]/;

  var IGNORED_TAGS = {
    SCRIPT: 1,
    STYLE: 1,
    NOSCRIPT: 1,
    CODE: 1,
    PRE: 1,
    SVG: 1,
    PATH: 1,
    CANVAS: 1,
    INPUT: 1,
    TEXTAREA: 1,
    SELECT: 1,
    OPTION: 1,
    KBD: 1,
    IFRAME: 1,
    VIDEO: 1,
    AUDIO: 1,
    TITLE: 1,
  };

  var IGNORED_CLASSES = [
    'monaco-editor',
    'view-lines',
    'view-line',
    'monaco-mouse-cursor-text',
    'xterm',
    'terminal',
    'token',
    'hljs',
    'code-block',
    'editor-instance',
  ];

  function toLookupMap(arr) {
    var map = Object.create(null);
    for (var i = 0; i < arr.length; i++) map[arr[i]] = 1;
    return map;
  }

  var IGNORED_CLASS_MAP = toLookupMap(IGNORED_CLASSES);

  var MODEL_SELECTOR_TESTIDS = {
    'model-selector-trigger': 1,
    'model-selector-panel': 1,
    'model-selector-item': 1,
    'model-selector-effort-option': 1,
    'model-selector-effort-group': 1,
    'model-selector-list': 1,
    'model-selector-orchestrator': 1,
    'orchestrator-effort-bar': 1,
    'orchestrator-picker-row': 1,
    'orchestrator-picker-effort': 1,
  };

  var PRISM_OWNED_IDS = {
    'ag-cs-settings-sec': 1,
    'ag-prism-settings-sec': 1,
    'ag-prism-pulse-bar': 1,
    'ag-pulse-status-bar': 1,
    'ag-prism-periodic-picker-root': 1,
  };

  var PRISM_OWNED_ATTRS = [
    'data-ag-prism-pulse-bar',
    'data-ag-prism-ui',
    'data-ag-cs-ui',
    'data-ag-no-i18n',
    'data-ag-owned',
    'data-ces-part',
    'data-ag-prism-sidebar-owned',
    'data-ag-prism-omni-owned',
    'data-ag-prism-fallback',
  ];

  var PRISM_CLASS_PREFIXES = ['ag-cs-', 'ag-prism-', 'ag-v2-', 'ag-omni-', 'ag-ss-', 'ag-pp-', 'ces-', 'ag-anim-'];

  var EXTERNAL_OWNED_IDS = {
    'agy-theme-switcher': 1,
    'agy-theme-menu': 1,
    'antigravity-quota-widget': 1,
    'antigravity-translation-audit': 1,
  };

  var EXTERNAL_OWNED_ATTRS = ['data-agy-hans-ui'];

  var CHAT_PROSE_CLASSES = ['prose', 'markdown-body', 'chat-markdown-message', 'rendered-markdown'];
  var CHAT_PROSE_CLASS_MAP = toLookupMap(CHAT_PROSE_CLASSES);
  var CHAT_PROSE_ATTRS = ['data-markdown-root', 'data-message-content', 'data-message-id'];
  var CHAT_PROSE_TESTIDS = {
    'user-message': 1,
    'assistant-message': 1,
    'agent-input-box': 1,
    'user-message-bubble': 1,
    'user-message-content': 1,
    'user-input-step': 1,
    'planner-response-text': 1,
    'agent-response': 1,
    'artifact-view': 1,
    'side-question-panel': 1,
    'side-question-conversation': 1,
    'subagent-tab-conversation': 1,
    'terminal-output': 1,
    'background-task-command': 1,
    'entity-pill': 1,
    'attached-context-pill': 1,
    'user-message-document-chip': 1,
    'artifact-card': 1,
    'bubble-artifact-card': 1,
    'thinking-collapsible-trigger': 1,
  };

  var USER_CONTENT_BOUNDARY = {
    testids: {
      'conversation-list-sidebar': 1,
      'conversation-row-sidebar': 1,
      'project-header': 1,
      'workspace-switcher': 1,
      'home-greeting': 1,
      'conversation-navigator': 1,
      'editor-tabs': 1,
      'file-tabs': 1,
      'file-tab': 1,
      'editor-tab': 1,
    },
    classes: ['tabs-container', 'tab-label', 'monaco-icon-label', 'editor-tabs', 'file-tabs'],
    attrs: ['data-resource-name', 'data-uri', 'data-file-path'],
  };
  var USER_CONTENT_CLASS_MAP = toLookupMap(USER_CONTENT_BOUNDARY.classes);

  var MAX_SAFE_BOUNDARY_DEPTH = 128;

  var TRANSLATABLE_ATTRS = ['title', 'placeholder', 'aria-label', 'data-tooltip', 'alt', 'aria-description'];

  var EXTERNAL_GLOBAL_SIGNATURE_GROUPS = [
    { provider: 'antigravity-cn-community', keys: ['__agySidebarDragFixInstalled'] },
    {
      provider: 'yuexps/Antigravity-Hans',
      keys: ['__antigravityZhPatchInstalled', '__antigravityZhSetLang', '__antigravityZhPatchObserver'],
    },
    {
      provider: 'yiheng8023',
      keys: ['__AGY_I18N_INITIALIZED__', '__AGY_I18N_DATA__', '__AGY_CREATE_ENGINE__', '__AGY_SWARM_I18N__', '__AGY_I18N__'],
    },
    { provider: '3169657175', keys: ['__agyI18n', '__agyTranslateEnhancementText'] },
    {
      provider: 'renkeshui',
      keys: ['__antigravity_i18n_runner_active', '__ANTIGRAVITY_I18N_DATA__', '__ANTIGRAVITY_REVERSE_MAP__'],
    },
    { provider: 'nianshou555qiansui', keys: ['__ag_hanhua_engine__'] },
    { provider: 'Ace2025001', keys: ['__AGY_ZHCN__', '__AGY_ZHCN_LOOKUP__'] },
    { provider: 'Zero-Touch', keys: ['__antigravityZh', '__antigravityZhDict'] },
    { provider: 'yunjuanyunshu', keys: ['__AG_ZH__'] },
    {
      provider: 'generic-external',
      keys: ['__ANTIGRAVITY_CN__', '__ANTIGRAVITY_I18N__', '__AG_I18N__', '__AG_CN_PATCH__', '__AGY_CN__', '__I18N_PATCHED__'],
    },
  ];

  var KNOWN_EXTERNAL_ATTRS = ['data-agy-i18n', 'data-ag-cn', 'data-i18n-patched', 'data-translated'];

  var CHROME_ZH_ANCHORS = {
    设置: 1,
    偏好设置: 1,
    新建对话: 1,
    扩展: 1,
    终端: 1,
    源代码管理: 1,
    工作区: 1,
    视图: 1,
    窗口: 1,
    自动化: 1,
    项目列表: 1,
  };

  function getAttr(el, name) {
    if (!el || typeof el.getAttribute !== 'function') return null;
    return el.getAttribute(name);
  }

  function hasAttr(el, name) {
    if (!el) return false;
    if (typeof el.hasAttribute === 'function') return el.hasAttribute(name);
    return getAttr(el, name) !== null;
  }

  function getClassTokens(el) {
    if (!el) return [];
    var raw = typeof el.className === 'string' ? el.className : '';
    if (!raw) return [];
    var trimmed = raw.trim();
    if (!trimmed) return [];
    return trimmed.indexOf(' ') === -1 && !/\s/.test(trimmed) ? [trimmed] : trimmed.split(/\s+/);
  }

  function hasElementChild(el) {
    if (!el) return false;
    if (el.firstElementChild !== undefined) return Boolean(el.firstElementChild);
    var ch = el.firstChild;
    while (ch) {
      if (ch.nodeType === 1) return true;
      ch = ch.nextSibling;
    }
    return false;
  }

  function getChildElementCount(el) {
    if (!el) return 0;
    if (typeof el.childElementCount === 'number') return el.childElementCount;
    if (el.children) return el.children.length;
    var cnt = 0;
    var ch = el.firstChild;
    while (ch) {
      if (ch.nodeType === 1) cnt++;
      ch = ch.nextSibling;
    }
    return cnt;
  }

  function isPrismOwnedSelf(el, preTokens) {
    if (!el || el.nodeType !== 1) return false;
    var id = el.id || getAttr(el, 'id') || '';
    if (id && hasOwn.call(PRISM_OWNED_IDS, id)) return true;
    for (var i = 0; i < PRISM_OWNED_ATTRS.length; i++) {
      if (hasAttr(el, PRISM_OWNED_ATTRS[i])) return true;
    }
    var tokens = preTokens || getClassTokens(el);
    for (var t = 0; t < tokens.length; t++) {
      var cls = tokens[t];
      for (var p = 0; p < PRISM_CLASS_PREFIXES.length; p++) {
        if (cls.indexOf(PRISM_CLASS_PREFIXES[p]) === 0) return true;
      }
    }
    return false;
  }

  function isPrismOwnedElement(el) {
    var cur = el && el.nodeType === 3 ? el.parentElement || el.parentNode : el;
    var depth = 0;
    while (cur && depth < MAX_SAFE_BOUNDARY_DEPTH) {
      if (cur.nodeType === 1 && isPrismOwnedSelf(cur)) return true;
      cur = cur.parentElement || cur.parentNode;
      depth++;
    }
    return false;
  }

  function isModelSelectorSelf(el, preTid) {
    if (!el || el.nodeType !== 1) return false;
    var tid = preTid !== undefined ? preTid : getAttr(el, 'data-testid');
    if (tid && hasOwn.call(MODEL_SELECTOR_TESTIDS, tid)) return true;
    if (
      hasAttr(el, 'data-effort') ||
      hasAttr(el, 'data-ag-cs-model-submenu') ||
      hasAttr(el, 'data-ag-cs-orch-l2') ||
      hasAttr(el, 'data-ag-cs-orch-l3') ||
      hasAttr(el, 'data-ces-orch-row')
    ) return true;
    return false;
  }

  function isModelSelectorElement(el) {
    var cur = el && el.nodeType === 3 ? el.parentElement || el.parentNode : el;
    var depth = 0;
    while (cur && depth < MAX_SAFE_BOUNDARY_DEPTH) {
      if (cur.nodeType === 1 && isModelSelectorSelf(cur)) return true;
      cur = cur.parentElement || cur.parentNode;
      depth++;
    }
    return false;
  }

  function isChatProseSelf(el, preTokens, preTid) {
    if (!el || el.nodeType !== 1) return false;
    var tid = preTid !== undefined ? preTid : getAttr(el, 'data-testid');
    if (tid && hasOwn.call(CHAT_PROSE_TESTIDS, tid)) return true;
    for (var i = 0; i < CHAT_PROSE_ATTRS.length; i++) {
      if (hasAttr(el, CHAT_PROSE_ATTRS[i])) return true;
    }
    var tokens = preTokens || getClassTokens(el);
    for (var t = 0; t < tokens.length; t++) {
      if (CHAT_PROSE_CLASS_MAP[tokens[t]]) return true;
    }
    return false;
  }

  function isUserContentBoundarySelf(el, preTokens, preTid) {
    if (!el || el.nodeType !== 1) return false;
    var tid = preTid !== undefined ? preTid : getAttr(el, 'data-testid');
    if (tid && hasOwn.call(USER_CONTENT_BOUNDARY.testids, tid)) return true;
    for (var i = 0; i < USER_CONTENT_BOUNDARY.attrs.length; i++) {
      if (hasAttr(el, USER_CONTENT_BOUNDARY.attrs[i])) return true;
    }
    var tokens = preTokens || getClassTokens(el);
    for (var t = 0; t < tokens.length; t++) {
      if (USER_CONTENT_CLASS_MAP[tokens[t]]) return true;
    }
    return false;
  }

  function isUserContentBoundary(el) {
    var cur = el && el.nodeType === 3 ? el.parentElement || el.parentNode : el;
    var depth = 0;
    while (cur && depth < MAX_SAFE_BOUNDARY_DEPTH) {
      if (cur.nodeType === 1 && isUserContentBoundarySelf(cur)) return true;
      cur = cur.parentElement || cur.parentNode;
      depth++;
    }
    return false;
  }

  function isConversationStreamSelf(el) {
    if (!el || el.nodeType !== 1) return false;
    var tid = getAttr(el, 'data-testid');
    if (tid === 'conversation-view' || tid === 'agent-input-box') return true;
    if (hasAttr(el, 'data-cascade-id')) return true;
    return false;
  }

  function isInteractiveChatChromeSelf(el, skipDirectCheck) {
    if (!el || el.nodeType !== 1) return false;
    if (!skipDirectCheck && isDirectIgnoredSelf(el)) return false;
    var tag = el.tagName ? String(el.tagName).toUpperCase() : '';
    if (tag === 'BUTTON') return true;
    var role = getAttr(el, 'role');
    if (role === 'button' || role === 'menu' || role === 'menuitem' || role === 'tooltip' || role === 'toolbar' || role === 'tab' || role === 'tablist') {
      return true;
    }
    var tid = getAttr(el, 'data-testid');
    if (tid === 'permissions-selector-trigger' || tid === 'plan-command-fyi-alert') return true;
    return false;
  }

  function isExternalPluginOwnedSelf(el) {
    if (!el || el.nodeType !== 1) return false;
    var id = el.id || getAttr(el, 'id') || '';
    if (id && hasOwn.call(EXTERNAL_OWNED_IDS, id)) return true;
    for (var i = 0; i < EXTERNAL_OWNED_ATTRS.length; i++) {
      if (hasAttr(el, EXTERNAL_OWNED_ATTRS[i])) return true;
    }
    return false;
  }

  function isExternalOwnedElement(el) {
    var cur = el && el.nodeType === 3 ? el.parentElement || el.parentNode : el;
    var depth = 0;
    while (cur && depth < MAX_SAFE_BOUNDARY_DEPTH) {
      if (cur.nodeType === 1 && isExternalPluginOwnedSelf(cur)) return true;
      cur = cur.parentElement || cur.parentNode;
      depth++;
    }
    return false;
  }

  function isDirectIgnoredSelf(el) {
    if (!el || el.nodeType !== 1) return false;
    var tag = el.tagName ? String(el.tagName).toUpperCase() : '';
    if (IGNORED_TAGS[tag]) return true;
    if (el.isContentEditable === true || getAttr(el, 'contenteditable') === 'true') return true;
    var tokens = getClassTokens(el);
    var tid = getAttr(el, 'data-testid');
    if (isPrismOwnedSelf(el, tokens)) return true;
    if (isExternalPluginOwnedSelf(el)) return true;
    if (isModelSelectorSelf(el, tid)) return true;
    if (isChatProseSelf(el, tokens, tid)) return true;
    if (isUserContentBoundarySelf(el, tokens, tid)) return true;
    for (var i = 0; i < tokens.length; i++) {
      if (IGNORED_CLASS_MAP[tokens[i]]) return true;
    }
    return false;
  }

  /**
   * Measures ancestor boundary state and remaining safe depth budget once at a subtree root,
   * allowing child traversal to propagate state in amortized O(1) without re-climbing parents.
   * States:
   *   -1: hard-ignored (DirectIgnored ancestor or >128 depth Fail-Closed)
   *    0: normal host UI (safe to translate)
   *    1: inside conversation stream without interactive chrome exemption (skip self/text, descend elements)
   *    2: inside interactive chrome control within conversation stream (safe to translate)
   */
  function measureSafeBoundaryDepth(el) {
    if (!el) return { blocked: false, canDescendConv: false, state: 0, remDepth: MAX_SAFE_BOUNDARY_DEPTH };
    var startEl = el.nodeType === 3 ? el.parentElement || el.parentNode : el;
    if (!startEl || startEl.nodeType !== 1) {
      return { blocked: false, canDescendConv: false, state: 0, remDepth: MAX_SAFE_BOUNDARY_DEPTH };
    }

    var cur = startEl;
    var sawInteractiveChrome = false;
    var sawConvStream = false;
    var blockedByConvStream = false;
    var depth = 0;
    while (cur && depth < MAX_SAFE_BOUNDARY_DEPTH) {
      if (cur.nodeType === 1) {
        if (isDirectIgnoredSelf(cur)) {
          return { blocked: true, canDescendConv: false, state: -1, remDepth: -1 };
        }
        if (isInteractiveChatChromeSelf(cur, true)) {
          sawInteractiveChrome = true;
        }
        if (isConversationStreamSelf(cur)) {
          sawConvStream = true;
          if (!sawInteractiveChrome) {
            blockedByConvStream = true;
          }
        }
      }
      cur = cur.parentElement || cur.parentNode;
      depth++;
    }
    if (cur) {
      return { blocked: true, canDescendConv: false, state: -1, remDepth: -1 };
    }
    var remDepth = MAX_SAFE_BOUNDARY_DEPTH - depth;
    if (blockedByConvStream) {
      return { blocked: true, canDescendConv: true, state: 1, remDepth: remDepth };
    }
    return {
      blocked: false,
      canDescendConv: false,
      state: sawConvStream ? 2 : 0,
      remDepth: remDepth,
    };
  }

  function advanceBoundaryForChild(parentCtx, childEl) {
    var nextRem = parentCtx.remDepth - 1;
    if (nextRem < 0 || parentCtx.state === -1) return null;
    if (isDirectIgnoredSelf(childEl)) return null;
    var pState = parentCtx.state;
    var isInter = isInteractiveChatChromeSelf(childEl, true);
    var isConv = isConversationStreamSelf(childEl);
    var nextState = pState;
    if (pState === 0) {
      if (isConv) nextState = isInter ? 2 : 1;
    } else if (pState === 1) {
      nextState = isInter ? 2 : 1;
    } else if (pState === 2) {
      if (isConv && !isInter) nextState = 1;
    }
    return {
      blocked: nextState === 1,
      canDescendConv: nextState === 1,
      state: nextState,
      remDepth: nextRem,
    };
  }

  function isIgnoredBoundary(el) {
    return measureSafeBoundaryDepth(el).blocked;
  }

  function isInsideConversationStream(el) {
    var cur = el && el.nodeType === 3 ? el.parentElement || el.parentNode : el;
    var depth = 0;
    while (cur && depth < 128) {
      if (cur.nodeType === 1 && (isConversationStreamSelf(cur) || isChatProseSelf(cur))) return true;
      cur = cur.parentElement || cur.parentNode;
      depth++;
    }
    return false;
  }

  function isChromeControlElement(el) {
    if (!el || el.nodeType !== 1) return false;
    var tid = getAttr(el, 'data-testid');
    if (tid === 'sidebar-split' || tid === 'aux-pane-split') return false;
    if (isUserContentBoundarySelf(el)) return false;
    var tag = el.tagName ? String(el.tagName).toUpperCase() : '';
    if (tag === 'NAV' || tag === 'ASIDE' || tag === 'HEADER' || tag === 'BUTTON') return true;
    var role = getAttr(el, 'role');
    if (role === 'tablist' || role === 'toolbar' || role === 'menubar' || role === 'menu' || role === 'tab' || role === 'menuitem' || role === 'menuitemcheckbox' || role === 'menuitemradio') {
      return true;
    }
    if (tid === 'permissions-selector-trigger') return true;
    return false;
  }

  function isLeafChromeControl(el) {
    if (!el || el.nodeType !== 1) return false;
    var tid = getAttr(el, 'data-testid');
    if (tid === 'sidebar-split' || tid === 'aux-pane-split') return false;
    if (isUserContentBoundarySelf(el)) return false;
    var tag = el.tagName ? String(el.tagName).toUpperCase() : '';
    if (tag === 'BUTTON') return true;
    var role = getAttr(el, 'role');
    if (role === 'tab' || role === 'menuitem' || role === 'menuitemcheckbox' || role === 'menuitemradio') return true;
    if (tid === 'permissions-selector-trigger' || tid === 'new-conversation-button' || tid === 'settings-button') return true;
    return false;
  }

  function isExplicitDelayedChromeControl(el) {
    if (!el || el.nodeType !== 1) return false;
    var tid = getAttr(el, 'data-testid');
    if (tid === 'sidebar-split' || tid === 'aux-pane-split') return false;
    if (isUserContentBoundarySelf(el)) return false;
    var tag = el.tagName ? String(el.tagName).toUpperCase() : '';
    if (tag === 'BUTTON' || tag === 'NAV' || tag === 'HEADER') return true;
    var role = getAttr(el, 'role');
    if (role === 'button' || role === 'menu' || role === 'menubar' || role === 'menuitem' || role === 'menuitemcheckbox' || role === 'menuitemradio' || role === 'tab' || role === 'tablist' || role === 'toolbar') {
      return true;
    }
    if (tid === 'permissions-selector-trigger' || tid === 'new-conversation-button' || tid === 'settings-button') return true;
    return false;
  }

  function isInsideExplicitDelayedChrome(el) {
    var cur = el && el.nodeType === 3 ? el.parentElement || el.parentNode : el;
    var depth = 0;
    while (cur && depth < 128) {
      if (cur.nodeType === 1) {
        if (isDirectIgnoredSelf(cur) || isConversationStreamSelf(cur)) return false;
        if (isExplicitDelayedChromeControl(cur)) return true;
      }
      cur = cur.parentElement || cur.parentNode;
      depth++;
    }
    return false;
  }

  function safeReadLocalStorage(rootObj, key) {
    try {
      var ls = (rootObj && rootObj.localStorage) || (typeof localStorage !== 'undefined' ? localStorage : null);
      if (ls && typeof ls.getItem === 'function') {
        return ls.getItem(key);
      }
    } catch (e) {}
    return null;
  }

  function hasElementClassToken(el, token) {
    if (!el) return false;
    if (el.classList && typeof el.classList.contains === 'function') {
      try {
        if (el.classList.contains(token)) return true;
      } catch (e) {}
    }
    var tokens = getClassTokens(el);
    for (var i = 0; i < tokens.length; i++) {
      if (tokens[i] === token) return true;
    }
    return false;
  }

  function detectLayer1External(rootObj, doc) {
    if (rootObj) {
      for (var g = 0; g < EXTERNAL_GLOBAL_SIGNATURE_GROUPS.length; g++) {
        var grp = EXTERNAL_GLOBAL_SIGNATURE_GROUPS[g];
        for (var i = 0; i < grp.keys.length; i++) {
          var key = grp.keys[i];
          try {
            if (rootObj[key]) {
              return { hit: true, provider: grp.provider, detail: 'global:' + key };
            }
          } catch (e) {}
        }
      }
    }

    var hansLang = safeReadLocalStorage(rootObj, 'antigravityHansLang');
    if (hansLang !== null) {
      var normHans = String(hansLang).trim().toLowerCase();
      if (normHans && normHans !== 'en' && normHans !== 'en-us' && normHans !== 'off' && normHans !== 'false' && normHans !== '0') {
        return { hit: true, provider: 'yuexps/Antigravity-Hans', detail: 'storage:antigravityHansLang' };
      }
    }

    var lucasDict = safeReadLocalStorage(rootObj, 'antigravity_chinese_patch_dict');
    if (lucasDict !== null && String(lucasDict).trim() !== '') {
      return { hit: true, provider: 'LucasvonLiu', detail: 'storage:antigravity_chinese_patch_dict' };
    }

    if (doc) {
      var docEl = doc.documentElement;
      var body = doc.body;

      if (docEl && (hasElementClassToken(docEl, 'agy-theme-active') || hasElementClassToken(docEl, 'agy-theme-active-v2'))) {
        return { hit: true, provider: '3169657175', detail: 'class:agy-theme-active' };
      }

      if (typeof doc.querySelector === 'function') {
        try {
          if (doc.querySelector('[data-agy-hans-ui]')) {
            return { hit: true, provider: 'yuexps/Antigravity-Hans', detail: 'dom:[data-agy-hans-ui]' };
          }
        } catch (e) {}
        try {
          if (doc.querySelector('#agy-theme-switcher, #antigravity-quota-widget')) {
            return { hit: true, provider: '3169657175', detail: 'dom:#agy-theme-switcher|#antigravity-quota-widget' };
          }
        } catch (e) {}
        try {
          if (doc.querySelector('[data-model-selector-badge="true"]')) {
            return { hit: true, provider: 'Ace2025001', detail: 'dom:[data-model-selector-badge="true"]' };
          }
        } catch (e) {}
        try {
          if (doc.querySelector('script[src*="ag_agent_hanhua.js"]')) {
            return { hit: true, provider: 'cshitian', detail: 'script:ag_agent_hanhua.js' };
          }
        } catch (e) {}
      }

      if (typeof doc.querySelectorAll === 'function') {
        try {
          var scripts = doc.querySelectorAll('script');
          if (scripts && scripts.length > 0) {
            for (var sIdx = 0; sIdx < scripts.length; sIdx++) {
              var sSrc = String(getAttr(scripts[sIdx], 'src') || scripts[sIdx].src || '');
              if (sSrc.indexOf('ag_agent_hanhua.js') !== -1) {
                return { hit: true, provider: 'cshitian', detail: 'script:ag_agent_hanhua.js' };
              }
            }
          }
        } catch (e) {}
      }

      for (var j = 0; j < KNOWN_EXTERNAL_ATTRS.length; j++) {
        var attr = KNOWN_EXTERNAL_ATTRS[j];
        if ((docEl && hasAttr(docEl, attr)) || (body && hasAttr(body, attr))) {
          return { hit: true, provider: 'generic-external', detail: 'attr:' + attr };
        }
      }
      if (docEl && !hasAttr(docEl, 'data-ag-prism-lang-owned')) {
        var htmlLang = String(getAttr(docEl, 'lang') || docEl.lang || '').trim();
        if (/^zh(?:$|[-_])/i.test(htmlLang)) {
          return { hit: true, provider: 'html-lang-zh', detail: 'html-lang:' + htmlLang };
        }
      }
    }
    return { hit: false, provider: null, detail: null };
  }

  function collectTextSkippingIgnored(el, outChunks, textSnapshots) {
    if (!el) return;
    if (el.nodeType === 3) {
      if (textSnapshots && textSnapshots.has(el)) {
        var snap = textSnapshots.get(el);
        if (snap && snap.expected === el.nodeValue) return;
      }
      var val = el.nodeValue || '';
      if (val) outChunks.push(val);
      return;
    }
    if (el.nodeType !== 1) return;
    if (isDirectIgnoredSelf(el) || isConversationStreamSelf(el)) return;
    var child = el.firstChild;
    while (child) {
      collectTextSkippingIgnored(child, outChunks, textSnapshots);
      child = child.nextSibling;
    }
  }

  function detectLayer2ChromeZh(doc, options) {
    if (!doc) return { hit: false, sampled: 0, zhCount: 0, anchorHits: 0 };
    var rootEl = doc.body || doc.documentElement;
    if (!rootEl) return { hit: false, sampled: 0, zhCount: 0, anchorHits: 0 };

    var opts = options || {};
    var textSnapshots = opts.textSnapshots || null;
    var samples = [];
    var seenTexts = Object.create(null);
    var zhCount = 0;
    var anchorHits = 0;
    var visited = 0;
    var MAX_VISIT = 2200;
    var MAX_SAMPLES = 48;

    function recordSample(text) {
      var trimmed = String(text || '').replace(/\s+/g, ' ').trim();
      if (!trimmed || trimmed.length > 60) return;
      if (!ZH_CHAR_RE.test(trimmed) && !EN_ALPHA_RE.test(trimmed)) return;
      if (hasOwn.call(seenTexts, trimmed)) return;
      seenTexts[trimmed] = 1;
      samples.push(trimmed);
      if (ZH_CHAR_RE.test(trimmed)) {
        zhCount++;
        if (hasOwn.call(CHROME_ZH_ANCHORS, trimmed)) {
          anchorHits++;
        }
      }
    }

    function walk(node, insideChrome) {
      if (!node || samples.length >= MAX_SAMPLES || visited >= MAX_VISIT) return;
      visited++;

      if (node.nodeType === 3) {
        if (insideChrome) {
          if (textSnapshots && textSnapshots.has(node)) {
            var snap = textSnapshots.get(node);
            if (snap && snap.expected === node.nodeValue) return;
          }
          recordSample(node.nodeValue);
        }
        return;
      }
      if (node.nodeType !== 1) return;
      if (isDirectIgnoredSelf(node) || isConversationStreamSelf(node)) return;

      if (isLeafChromeControl(node)) {
        var chunks = [];
        collectTextSkippingIgnored(node, chunks, textSnapshots);
        if (chunks.length > 0) {
          recordSample(chunks.join(' '));
        }
        return;
      }

      var nowInChrome = insideChrome || isChromeControlElement(node);
      var child = node.firstChild;
      while (child && samples.length < MAX_SAMPLES && visited < MAX_VISIT) {
        walk(child, nowInChrome);
        child = child.nextSibling;
      }
    }

    walk(rootEl, false);

    var ratio = samples.length > 0 ? zhCount / samples.length : 0;
    var hit = (zhCount >= 3 && ratio >= 0.25) || anchorHits >= 2;
    return {
      hit: hit,
      sampled: samples.length,
      zhCount: zhCount,
      anchorHits: anchorHits,
      ratio: ratio,
    };
  }

  function detectExternalLocalization(rootObj, doc, options) {
    var l1 = detectLayer1External(rootObj, doc);
    if (l1.hit) {
      return {
        detected: true,
        layer: 1,
        reason: 'external-ui-zh',
        provider: l1.provider || 'generic-external',
        detail: l1.detail,
      };
    }
    var l2 = detectLayer2ChromeZh(doc, options);
    if (l2.hit) {
      return {
        detected: true,
        layer: 2,
        reason: 'external-ui-zh',
        provider: 'generic-zh-dom',
        detail: l2,
      };
    }
    return { detected: false, layer: 0, reason: null, provider: null, detail: l2 };
  }

  /**
   * Bounded 2-generation LRU cache backed exclusively by Object.create(null).
   * 100% immune to external monkey-patching of Map.prototype.has/get/set (e.g. renkeshui)
   * and Object.prototype keys (__proto__, constructor, toString).
   */
  function createNullProtoBoundedCache(maxSize) {
    var cap = maxSize > 4 ? maxSize : 2048;
    var genCap = cap >> 1;
    var hot = Object.create(null);
    var cold = Object.create(null);
    var hotSize = 0;
    var coldSize = 0;

    return {
      has: function (key) {
        return key in hot || key in cold;
      },
      get: function (key) {
        if (key in hot) return hot[key];
        if (key in cold) {
          var val = cold[key];
          delete cold[key];
          coldSize--;
          if (hotSize >= genCap) {
            cold = hot;
            coldSize = hotSize;
            hot = Object.create(null);
            hotSize = 0;
          }
          hot[key] = val;
          hotSize++;
          return val;
        }
        return undefined;
      },
      set: function (key, val) {
        if (key in hot) {
          hot[key] = val;
          return;
        }
        if (key in cold) {
          delete cold[key];
          coldSize--;
        }
        if (hotSize >= genCap && hotSize + coldSize >= cap) {
          cold = hot;
          coldSize = hotSize;
          hot = Object.create(null);
          hotSize = 0;
        } else if (hotSize >= cap) {
          cold = hot;
          coldSize = hotSize;
          hot = Object.create(null);
          hotSize = 0;
        }
        hot[key] = val;
        hotSize++;
      },
      delete: function (key) {
        var removed = false;
        if (key in hot) {
          delete hot[key];
          hotSize--;
          removed = true;
        }
        if (key in cold) {
          delete cold[key];
          coldSize--;
          removed = true;
        }
        return removed;
      },
      clear: function () {
        hot = Object.create(null);
        cold = Object.create(null);
        hotSize = 0;
        coldSize = 0;
      },
      get size() {
        return hotSize + coldSize;
      },
    };
  }

  function readRegexQuantifier(src, pos) {
    if (pos >= src.length) return { kind: 'one', end: pos };
    var q = src.charAt(pos);
    if (q === '?' || q === '*') {
      return { kind: 'zero', end: pos + (src.charAt(pos + 1) === '?' ? 2 : 1) };
    }
    if (q === '+') {
      return { kind: 'plus', end: pos + (src.charAt(pos + 1) === '?' ? 2 : 1) };
    }
    if (q === '{') {
      var closeIdx = pos + 1;
      while (closeIdx < src.length && src.charAt(closeIdx) !== '}') closeIdx++;
      if (closeIdx < src.length) {
        var afterBrace = closeIdx + 1;
        if (src.charAt(afterBrace) === '?') afterBrace++;
        return { kind: 'brace', end: afterBrace };
      }
      return { kind: 'brace', end: pos + 1 };
    }
    return { kind: 'one', end: pos };
  }

  function extractPatternIndexMeta(src, flags) {
    if (flags && (flags.indexOf('i') !== -1 || flags.indexOf('m') !== -1)) {
      return { anchor1: '', anchor2: '', bucketType: 'general', startChars: null };
    }
    var depth = 0;
    var inClass = false;
    var hasTopAlt = false;
    for (var k = 0; k < src.length; k++) {
      var ch = src.charAt(k);
      if (ch === '\\') {
        k++;
        continue;
      }
      if (inClass) {
        if (ch === ']') inClass = false;
        continue;
      }
      if (ch === '[') {
        inClass = true;
        continue;
      }
      if (ch === '(') depth++;
      else if (ch === ')') {
        if (depth > 0) depth--;
      } else if (ch === '|' && depth === 0) {
        hasTopAlt = true;
        break;
      }
    }
    if (hasTopAlt) {
      return { anchor1: '', anchor2: '', bucketType: 'general', startChars: null };
    }

    var runs = [];
    var cur = '';
    function flushRun() {
      if (cur.length > 0) {
        if (cur.length >= 2 || !/^\s+$/.test(cur)) {
          runs.push(cur);
        }
        cur = '';
      }
    }

    var i = 0;
    while (i < src.length) {
      var c = src.charAt(i);
      if (c === '\\') {
        if (i + 1 >= src.length) {
          flushRun();
          break;
        }
        var nx = src.charAt(i + 1);
        if (nx === 'u') {
          flushRun();
          if (src.charAt(i + 2) === '{') {
            var uEnd = i + 3;
            while (uEnd < src.length && src.charAt(uEnd) !== '}') uEnd++;
            i = readRegexQuantifier(src, uEnd < src.length ? uEnd + 1 : uEnd).end;
          } else {
            i = readRegexQuantifier(src, Math.min(src.length, i + 6)).end;
          }
          continue;
        }
        if (nx === 'x') {
          flushRun();
          i = readRegexQuantifier(src, Math.min(src.length, i + 4)).end;
          continue;
        }
        if (nx === 'c') {
          flushRun();
          i = readRegexQuantifier(src, Math.min(src.length, i + 3)).end;
          continue;
        }
        if ((nx === 'p' || nx === 'P') && src.charAt(i + 2) === '{') {
          flushRun();
          var pEnd = i + 3;
          while (pEnd < src.length && src.charAt(pEnd) !== '}') pEnd++;
          i = readRegexQuantifier(src, pEnd < src.length ? pEnd + 1 : pEnd).end;
          continue;
        }
        if (nx === 'k' && src.charAt(i + 2) === '<') {
          flushRun();
          var kEnd = i + 3;
          while (kEnd < src.length && src.charAt(kEnd) !== '>') kEnd++;
          i = readRegexQuantifier(src, kEnd < src.length ? kEnd + 1 : kEnd).end;
          continue;
        }
        if (/[a-zA-Z0-9]/.test(nx)) {
          flushRun();
          var escEnd = i + 2;
          if (/[0-9]/.test(nx)) {
            while (escEnd < src.length && /[0-9]/.test(src.charAt(escEnd))) escEnd++;
          }
          i = readRegexQuantifier(src, escEnd).end;
          continue;
        }
        var qEsc = readRegexQuantifier(src, i + 2);
        if (qEsc.kind === 'one') {
          cur += nx;
        } else if (qEsc.kind === 'plus') {
          cur += nx;
          flushRun();
        } else {
          flushRun();
        }
        i = qEsc.end;
        continue;
      }

      if (c === '[') {
        flushRun();
        i++;
        while (i < src.length) {
          if (src.charAt(i) === '\\') {
            i += 2;
            continue;
          }
          if (src.charAt(i) === ']') {
            i++;
            break;
          }
          i++;
        }
        i = readRegexQuantifier(src, i).end;
        continue;
      }

      if (c === '(') {
        flushRun();
        i++;
        var gDepth = 1;
        var gClass = false;
        while (i < src.length && gDepth > 0) {
          var gc = src.charAt(i);
          if (gc === '\\') {
            i += 2;
            continue;
          }
          if (gClass) {
            if (gc === ']') gClass = false;
            i++;
            continue;
          }
          if (gc === '[') {
            gClass = true;
            i++;
            continue;
          }
          if (gc === '(') gDepth++;
          else if (gc === ')') gDepth--;
          i++;
        }
        i = readRegexQuantifier(src, i).end;
        continue;
      }

      if (c === '^' || c === '$' || c === '.' || c === '?' || c === '*' || c === '+' || c === ')' || c === ']') {
        flushRun();
        i++;
        continue;
      }
      if (c === '{') {
        flushRun();
        i = readRegexQuantifier(src, i).end;
        continue;
      }

      var qLit = readRegexQuantifier(src, i + 1);
      if (qLit.kind === 'one') {
        cur += c;
      } else if (qLit.kind === 'plus') {
        cur += c;
        flushRun();
      } else {
        flushRun();
      }
      i = qLit.end;
    }
    flushRun();

    var multiCharRuns = [];
    var singleCharRuns = [];
    for (var rIdx = 0; rIdx < runs.length; rIdx++) {
      var r = runs[rIdx];
      if (r.length >= 2 && !/^\s+$/.test(r)) multiCharRuns.push(r);
      else if (r.length === 1 && !/\s/.test(r)) singleCharRuns.push(r);
    }
    multiCharRuns.sort(function (a, b) {
      return b.length - a.length;
    });

    var anchor1 = '';
    var anchor2 = '';
    if (multiCharRuns.length > 0) {
      anchor1 = multiCharRuns[0];
      for (var mIdx = 1; mIdx < multiCharRuns.length; mIdx++) {
        if (anchor1.indexOf(multiCharRuns[mIdx]) === -1) {
          anchor2 = multiCharRuns[mIdx];
          break;
        }
      }
    } else if (singleCharRuns.length > 0) {
      anchor1 = singleCharRuns[0];
    }

    var bucketType = 'general';
    var startChars = null;
    if (src.charAt(0) === '^') {
      var mLit = /^\^([^\\^$.*+?()[\]{}|])(?![?*{])/.exec(src);
      var mEsc = !mLit ? /^\^\\([^a-zA-Z0-9])(?![?*{])/.exec(src) : null;
      if (mLit) {
        bucketType = 'chars';
        startChars = [mLit[1]];
      } else if (mEsc) {
        bucketType = 'chars';
        startChars = [mEsc[1]];
      } else if (/^\^(?:\\d(?![?*]|\\{0)|\(\\d(?:\+|\{[1-9]\d*(?:,\d*)?\})[^()\\|]*\)(?![?*{]))/.test(src)) {
        bucketType = 'digit';
      } else {
        var mPair = /^\^\[([A-Za-z])([A-Za-z])\](?![?*{])/.exec(src);
        if (mPair) {
          bucketType = 'chars';
          startChars = mPair[1] === mPair[2] ? [mPair[1]] : [mPair[1], mPair[2]];
        } else {
          var mAltGroup = /^\^\((?:\?:)?([^()[\]{}^$.*+?]+)\)(?![?*{])/.exec(src);
          if (mAltGroup && mAltGroup[1].indexOf('\\|') === -1) {
            var alts = mAltGroup[1].split('|');
            var charMap = Object.create(null);
            var charList = [];
            var allValid = alts.length > 0;
            for (var aIdx = 0; aIdx < alts.length; aIdx++) {
              var alt = alts[aIdx];
              if (!alt || !/^[A-Za-z0-9\u4e00-\u9fa5]/.test(alt)) {
                allValid = false;
                break;
              }
              var fc = alt.charAt(0);
              if (!charMap[fc]) {
                charMap[fc] = 1;
                charList.push(fc);
              }
            }
            if (allValid && charList.length > 0) {
              bucketType = 'chars';
              startChars = charList;
            }
          }
        }
      }
    }

    return {
      anchor1: anchor1,
      anchor2: anchor2,
      bucketType: bucketType,
      startChars: startChars,
    };
  }

  function mergeSortedPatternLists(listA, listB, listC) {
    var combined = [];
    if (listA && listA.length) combined = combined.concat(listA);
    if (listB && listB.length) combined = combined.concat(listB);
    if (listC && listC.length) combined = combined.concat(listC);
    if (combined.length <= 1) return combined;
    combined.sort(function (a, b) {
      return a.order - b.order;
    });
    var dedup = [combined[0]];
    for (var i = 1; i < combined.length; i++) {
      if (combined[i].order !== combined[i - 1].order) {
        dedup.push(combined[i]);
      }
    }
    return dedup;
  }

  var cachedDefaultReverseModule = null;

  function resolveDefaultReverseModule(winObj) {
    if (winObj && winObj.__agPrismHostI18nReversePatterns) {
      return winObj.__agPrismHostI18nReversePatterns;
    }
    if (root && root.__agPrismHostI18nReversePatterns) {
      return root.__agPrismHostI18nReversePatterns;
    }
    if (cachedDefaultReverseModule) return cachedDefaultReverseModule;
    if (typeof require === 'function') {
      try {
        cachedDefaultReverseModule = require('./reverse-patterns.js');
        return cachedDefaultReverseModule;
      } catch (e) {}
    }
    return null;
  }

  function rankReverseCaseStyle(s) {
    if (/^[A-Z][a-z]/.test(s) && s !== s.toUpperCase()) return 0;
    if (s !== s.toLowerCase() && s !== s.toUpperCase()) return 1;
    if (s === s.toLowerCase()) return 2;
    return 3;
  }

  function scoreReverseEnCandidate(s) {
    var score = s.length * 10 + rankReverseCaseStyle(s);
    if (/\s+[.,!?;:]$/.test(s)) score += 500;
    return score;
  }

  function mapZhTrailingPuncToEn(punc) {
    var out = '';
    for (var i = 0; i < punc.length; i++) {
      var ch = punc.charAt(i);
      if (ch === '：') out += ':';
      else if (ch === '。') out += '.';
      else if (ch === '？') out += '?';
      else if (ch === '！') out += '!';
      else if (ch === '…') out += '...';
      else out += ch;
    }
    return out;
  }

  function splitOuterWhitespace(str) {
    var len = str.length;
    var start = 0;
    while (start < len && /\s/.test(str.charAt(start))) start++;
    var end = len;
    while (end > start && /\s/.test(str.charAt(end - 1))) end--;
    return {
      leading: str.slice(0, start),
      core: str.slice(start, end),
      trailing: str.slice(end),
    };
  }

  function createHostI18nEngine(dictData, engineOptions) {
    var engOpts = engineOptions || {};
    var direction = engOpts.direction === 'reverse' ? 'reverse' : 'forward';
    var data = dictData || {};
    var exactDict = data.exact || {};

    var revModule = null;
    var revExactOverrides = null;
    var rawPatterns = null;
    var crossNodeRules = [];

    if (direction === 'reverse') {
      var customRev = engOpts.reversePatterns;
      var fallbackRev = resolveDefaultReverseModule(engOpts.root || null);
      if (Array.isArray(customRev)) {
        rawPatterns = customRev.slice();
        revExactOverrides =
          engOpts.reverseExactOverrides || (fallbackRev && fallbackRev.REVERSE_EXACT_OVERRIDES) || null;
        crossNodeRules =
          engOpts.reverseCrossNodeRules || (fallbackRev && fallbackRev.REVERSE_CROSS_NODE_RULES) || [];
      } else {
        revModule = customRev && typeof customRev === 'object' ? customRev : fallbackRev;
        rawPatterns =
          (revModule && (revModule.REVERSE_PATTERNS || revModule.patterns))
            ? (revModule.REVERSE_PATTERNS || revModule.patterns).slice()
            : [];
        revExactOverrides =
          engOpts.reverseExactOverrides ||
          (revModule && (revModule.REVERSE_EXACT_OVERRIDES || revModule.exactOverrides)) ||
          null;
        crossNodeRules =
          engOpts.reverseCrossNodeRules ||
          (revModule && (revModule.REVERSE_CROSS_NODE_RULES || revModule.crossNodeRules)) ||
          [];
      }
    } else {
      rawPatterns = (data.patterns || []).concat(data.rules || []);
    }

    var patterns = [];
    var charBuckets = Object.create(null);
    var digitBucket = [];
    var generalBucket = [];
    var mergedByFirstChar = Object.create(null);

    for (var i = 0; i < rawPatterns.length; i++) {
      var p = rawPatterns[i];
      if (!p || typeof p.regex !== 'string' || typeof p.replacement !== 'string') continue;
      try {
        var compiledRe = new RegExp(p.regex);
        var meta = extractPatternIndexMeta(p.regex, compiledRe.flags || '');
        var entry = {
          regex: compiledRe,
          replacement: p.replacement,
          order: patterns.length,
          anchor1: meta.anchor1,
          anchor2: meta.anchor2,
        };
        patterns.push(entry);
        if (meta.bucketType === 'chars' && meta.startChars) {
          for (var sc = 0; sc < meta.startChars.length; sc++) {
            var chKey = meta.startChars[sc];
            if (!charBuckets[chKey]) charBuckets[chKey] = [];
            charBuckets[chKey].push(entry);
          }
        } else if (meta.bucketType === 'digit') {
          digitBucket.push(entry);
        } else {
          generalBucket.push(entry);
        }
      } catch (e) {}
    }

    function getCandidatesForText(text) {
      if (!text) return generalBucket;
      var ch0 = text.charAt(0);
      var cachedList = mergedByFirstChar[ch0];
      if (cachedList !== undefined) return cachedList;
      var cBucket = charBuckets[ch0] || null;
      var dBucket = ch0 >= '0' && ch0 <= '9' ? digitBucket : null;
      var merged = !cBucket && !dBucket ? generalBucket : mergeSortedPatternLists(cBucket, dBucket, generalBucket);
      mergedByFirstChar[ch0] = merged;
      return merged;
    }

    function matchesPatternAnchors(text, pat) {
      if (pat.anchor1 && text.indexOf(pat.anchor1) === -1) return false;
      if (pat.anchor2 && text.indexOf(pat.anchor2) === -1) return false;
      return true;
    }

    function normalizeWhitespace(str) {
      return str.replace(/\s+/g, ' ').trim();
    }

    var exactLookup = Object.create(null);
    var translatedValues = Object.create(null);
    var reverseScores = direction === 'reverse' ? Object.create(null) : null;

    if (direction === 'reverse') {
      for (var enKey in exactDict) {
        if (!hasOwn.call(exactDict, enKey)) continue;
        var zhVal = exactDict[enKey];
        if (typeof enKey !== 'string' || typeof zhVal !== 'string') continue;
        var normZh = normalizeWhitespace(zhVal);
        var normEn = normalizeWhitespace(enKey);
        if (!normZh || !normEn || !ZH_CHAR_RE.test(normZh)) continue;
        var candScore = scoreReverseEnCandidate(normEn);
        if (!(normZh in exactLookup) || candScore < reverseScores[normZh]) {
          exactLookup[normZh] = normEn;
          reverseScores[normZh] = candScore;
        }
      }
      reverseScores = null;
      if (revExactOverrides && typeof revExactOverrides === 'object') {
        for (var ovZh in revExactOverrides) {
          if (typeof ovZh === 'string' && typeof revExactOverrides[ovZh] === 'string') {
            var cleanZh = normalizeWhitespace(ovZh);
            if (cleanZh) {
              exactLookup[cleanZh] = revExactOverrides[ovZh];
            }
          }
        }
      }
    } else {
      for (var k in exactDict) {
        if (hasOwn.call(exactDict, k)) {
          exactLookup[k] = exactDict[k];
          translatedValues[exactDict[k]] = true;
        }
      }
    }

    // Release strong references to external input dictionary objects (~0.6 MiB/window saved)
    dictData = null;
    engineOptions = null;
    engOpts = null;
    data = null;
    exactDict = null;
    rawPatterns = null;
    revModule = null;
    revExactOverrides = null;

    var MAX_UNIT_CACHE_SIZE = 2048;
    var unitCache = createNullProtoBoundedCache(MAX_UNIT_CACHE_SIZE);

    function cacheAndReturn(key, value) {
      unitCache.set(key, value);
      return value;
    }

    function applyPatterns(text) {
      if (!text || patterns.length === 0) return null;
      var cands = getCandidatesForText(text);
      for (var ci = 0; ci < cands.length; ci++) {
        var pat = cands[ci];
        if (!matchesPatternAnchors(text, pat)) continue;
        pat.regex.lastIndex = 0;
        if (pat.regex.test(text)) {
          pat.regex.lastIndex = 0;
          var result = text.replace(pat.regex, pat.replacement);
          if (!result) return result;
          var cands2 = getCandidatesForText(result);
          var c2Idx = 0;
          while (c2Idx < cands2.length) {
            var pat2 = cands2[c2Idx];
            if (!matchesPatternAnchors(result, pat2)) {
              c2Idx++;
              continue;
            }
            pat2.regex.lastIndex = 0;
            if (pat2.regex.test(result)) {
              pat2.regex.lastIndex = 0;
              var prevCh0 = result.charAt(0);
              var matchedOrder = pat2.order;
              result = result.replace(pat2.regex, pat2.replacement);
              if (!result) break;
              if (result.charAt(0) !== prevCh0) {
                cands2 = getCandidatesForText(result);
                c2Idx = 0;
                while (c2Idx < cands2.length && cands2[c2Idx].order <= matchedOrder) {
                  c2Idx++;
                }
                continue;
              }
            }
            c2Idx++;
          }
          return result;
        }
      }
      return null;
    }

    if (direction === 'reverse') {
      function lookupReverseExactOrVariant(norm) {
        if (norm in exactLookup) return exactLookup[norm];
        var tailCh = norm.charAt(norm.length - 1);
        if (':：….。？?!！'.indexOf(tailCh) !== -1) {
          var puncMatch = norm.match(/^(.+?)([:：…\.。？\?!！]+)$/);
          if (puncMatch) {
            var base = puncMatch[1].trim();
            var punc = puncMatch[2];
            if (base in exactLookup) {
              var baseEn = exactLookup[base];
              var mappedPunc = mapZhTrailingPuncToEn(punc);
              var baseEnd = baseEn.charAt(baseEn.length - 1);
              if (mappedPunc === '.' && (baseEnd === '.' || baseEnd === '!' || baseEnd === '?')) {
                return baseEn;
              }
              return baseEn + mappedPunc;
            }
            if (punc === '…' && base + '...' in exactLookup) {
              return exactLookup[base + '...'];
            }
            if (punc === '...' && base + '…' in exactLookup) {
              return exactLookup[base + '…'];
            }
          }
        }
        if (norm.indexOf('+') !== -1) {
          var hkMatch = norm.match(
            /(\((?:Ctrl|Cmd|Alt|Shift)\+[^\s\)]+\)|\b(?:Ctrl|Cmd|Alt|Shift)\+[\w;:,\\/+\-]+)$/i
          );
          if (hkMatch && hkMatch.index > 0) {
            var cmdBase = norm.slice(0, hkMatch.index).trim();
            var hk = hkMatch[1].trim();
            if (cmdBase && cmdBase in exactLookup) {
              return exactLookup[cmdBase] + ' ' + hk;
            }
          }
        }
        return null;
      }

      function translateReverseUnit(rawUnit) {
        if (!rawUnit || typeof rawUnit !== 'string' || rawUnit.length > 512) return null;
        if (!ZH_CHAR_RE.test(rawUnit)) return null;
        var normalized = normalizeWhitespace(rawUnit);
        if (!normalized || !ZH_CHAR_RE.test(normalized)) return null;

        if (unitCache.has(normalized)) {
          return unitCache.get(normalized);
        }

        var exactHit = lookupReverseExactOrVariant(normalized);
        if (exactHit !== null && exactHit !== normalized) {
          return cacheAndReturn(normalized, exactHit);
        }

        var patHit = applyPatterns(normalized);
        if (patHit !== null && patHit !== normalized) {
          return cacheAndReturn(normalized, patHit);
        }

        if (
          normalized.indexOf('。') !== -1 ||
          normalized.indexOf('！') !== -1 ||
          normalized.indexOf('？') !== -1
        ) {
          var zhParts = normalized.split(/([。！？]\s*)/);
          if (zhParts.length >= 3) {
            var anyRev = false;
            var allRev = true;
            var outSegs = [];
            for (var zIdx = 0; zIdx < zhParts.length; zIdx++) {
              var seg = zhParts[zIdx];
              var trimSeg = seg.trim();
              if (!trimSeg) continue;
              if (/^[。！？\s]+$/.test(seg)) {
                outSegs.push(mapZhTrailingPuncToEn(trimSeg) + ' ');
                continue;
              }
              var segRes = lookupReverseExactOrVariant(trimSeg) || applyPatterns(trimSeg);
              if (segRes && segRes !== trimSeg) {
                anyRev = true;
                outSegs.push(segRes.replace(/[.!?]+$/, ''));
              } else {
                allRev = false;
                break;
              }
            }
            if (anyRev && allRev) {
              return cacheAndReturn(normalized, outSegs.join('').trim());
            }
          }
        }

        return cacheAndReturn(normalized, null);
      }

      function translateReverseText(rawStr) {
        if (!rawStr || typeof rawStr !== 'string' || rawStr.length > 512) return null;
        if (!ZH_CHAR_RE.test(rawStr)) return null;
        var parts = splitOuterWhitespace(rawStr);
        if (!parts.core) return null;
        var coreRes = translateReverseUnit(parts.core);
        if (coreRes === null || coreRes === parts.core) return null;
        return parts.leading + coreRes + parts.trailing;
      }

      return {
        direction: 'reverse',
        translate: translateReverseText,
        translateText: translateReverseText,
        translateUnit: translateReverseUnit,
        exactDict: exactLookup,
        reverseExact: exactLookup,
        patterns: patterns,
        crossNodeRules: crossNodeRules,
        patternIndex: {
          charBuckets: charBuckets,
          digitBucket: digitBucket,
          generalBucket: generalBucket,
          getCandidatesForText: getCandidatesForText,
        },
        translatedValues: translatedValues,
        cache: unitCache,
        unitCache: unitCache,
        maxCacheSize: MAX_UNIT_CACHE_SIZE,
        normalizeWhitespace: normalizeWhitespace,
      };
    }

    function translateSingleUnit(rawStr) {
      if (!rawStr || typeof rawStr !== 'string' || rawStr.length > 512) return null;
      var normalized = normalizeWhitespace(rawStr);
      if (!normalized) return null;

      if (unitCache.has(normalized)) {
        return unitCache.get(normalized);
      }

      if (normalized in exactLookup) {
        return cacheAndReturn(normalized, exactLookup[normalized]);
      }

      if (!EN_ALPHA_RE.test(normalized)) {
        return cacheAndReturn(normalized, null);
      }

      if (translatedValues[normalized]) {
        return cacheAndReturn(normalized, null);
      }

      if (ZH_CHAR_RE.test(normalized) && !/[a-zA-Z]{2,}/.test(normalized)) {
        return cacheAndReturn(normalized, null);
      }

      var patRes = applyPatterns(normalized);
      if (patRes !== null) {
        return cacheAndReturn(normalized, patRes);
      }

      var lastCh = normalized.charAt(normalized.length - 1);
      if (':：….？?!！'.indexOf(lastCh) !== -1) {
        var punctuationMatch = normalized.match(/^([\w\s\-\/]+)([:：…\.？\?!！]+)$/);
        if (punctuationMatch) {
          var base = punctuationMatch[1].trim();
          var punc = punctuationMatch[2];
          if (base in exactLookup) {
            return cacheAndReturn(normalized, exactLookup[base] + (punc === ':' ? '：' : punc));
          }
        }
      }

      if (normalized.indexOf('+') !== -1) {
        var hotkeyMatch = normalized.match(
          /(\((?:Ctrl|Cmd|Alt|Shift)\+[^\s\)]+\)|\b(?:Ctrl|Cmd|Alt|Shift)\+[\w;:,\\/+\-]+)$/i
        );
        if (hotkeyMatch && hotkeyMatch.index > 0) {
          var cmdBase = normalized.slice(0, hotkeyMatch.index).trim();
          var hotkey = hotkeyMatch[1].trim();
          if (cmdBase && /^[\w\s\-\/]+$/.test(cmdBase) && cmdBase in exactLookup) {
            return cacheAndReturn(normalized, exactLookup[cmdBase] + ' ' + hotkey);
          }
        }
      }

      if (
        normalized.indexOf('. ') !== -1 ||
        normalized.indexOf('! ') !== -1 ||
        normalized.indexOf('? ') !== -1 ||
        normalized.indexOf('。') !== -1
      ) {
        var sentences = normalized.split(/([.!?]\s+|[。！？]\s*)/);
        var anyTranslated = false;
        var allTranslated = true;
        var translatedParts = [];
        for (var sIdx = 0; sIdx < sentences.length; sIdx++) {
          var part = sentences[sIdx];
          var trimmedPart = part.trim();
          if (!trimmedPart || /^[.!?。！？\s]+$/.test(part)) {
            translatedParts.push(part.replace(/\.\s*/g, '。 '));
            continue;
          }
          var transPart =
            (trimmedPart in exactLookup ? exactLookup[trimmedPart] : null) ||
            (trimmedPart + '.' in exactLookup ? exactLookup[trimmedPart + '.'] : null);
          if (!transPart) {
            transPart = applyPatterns(trimmedPart);
          }
          if (!transPart) {
            var pLast = trimmedPart.charAt(trimmedPart.length - 1);
            if (':：….？?!！'.indexOf(pLast) !== -1) {
              var pMatch = trimmedPart.match(/^([\w\s\-\/]+)([:：…\.？\?!！]+)$/);
              if (pMatch && pMatch[1].trim() in exactLookup) {
                transPart = exactLookup[pMatch[1].trim()] + (pMatch[2] === ':' ? '：' : pMatch[2]);
              }
            }
          }
          if (transPart) {
            anyTranslated = true;
            translatedParts.push(transPart);
          } else {
            allTranslated = false;
            break;
          }
        }
        if (anyTranslated && allTranslated) {
          return cacheAndReturn(
            normalized,
            translatedParts.join('').replace(/([。！？])[。！？.]*\s*/g, '$1 ').trim()
          );
        }
      }

      return cacheAndReturn(normalized, null);
    }

    function translateForwardText(rawStr) {
      if (!rawStr || typeof rawStr !== 'string' || rawStr.length > 512) return null;
      var parts = splitOuterWhitespace(rawStr);
      if (!parts.core) return null;
      var coreRes = translateSingleUnit(parts.core);
      if (coreRes === null || coreRes === parts.core) return null;
      return parts.leading + coreRes + parts.trailing;
    }

    return {
      direction: 'forward',
      translate: translateSingleUnit,
      translateText: translateForwardText,
      translateUnit: translateSingleUnit,
      exactDict: exactLookup,
      patterns: patterns,
      crossNodeRules: crossNodeRules,
      patternIndex: {
        charBuckets: charBuckets,
        digitBucket: digitBucket,
        generalBucket: generalBucket,
        getCandidatesForText: getCandidatesForText,
      },
      translatedValues: translatedValues,
      cache: unitCache,
      unitCache: unitCache,
      maxCacheSize: MAX_UNIT_CACHE_SIZE,
      normalizeWhitespace: normalizeWhitespace,
    };
  }

  function isDialogOrPortalWrappingDialog(el) {
    if (!el || el.nodeType !== 1) return false;
    var role = getAttr(el, 'role');
    if (role === 'dialog') return true;
    if (hasAttr(el, 'data-floating-ui-portal') && typeof el.querySelector === 'function') {
      if (el.querySelector('[role="dialog"]')) return true;
    }
    return false;
  }

  function isFloatingElement(el, doc) {
    if (!el || el.nodeType !== 1) return false;
    if (doc && (el === doc.body || el === doc.documentElement)) return false;
    if (el.id === 'workbench' || el.id === 'root' || el.id === 'app') return false;
    var cls = typeof el.className === 'string' ? el.className : '';
    if (cls && cls.indexOf('monaco-workbench') !== -1) return false;

    var role = getAttr(el, 'role') || '';
    if (role === 'dialog') return false;
    if (role === 'tooltip' || role === 'menu' || role === 'listbox') return true;
    if (hasAttr(el, 'data-floating-ui-portal')) {
      return !isDialogOrPortalWrappingDialog(el);
    }
    if (hasAttr(el, 'data-radix-popper-content-wrapper')) return true;
    if (cls) {
      if (
        cls.indexOf('popover') !== -1 ||
        cls.indexOf('tooltip') !== -1 ||
        cls.indexOf('context-view') !== -1 ||
        cls.indexOf('monaco-hover') !== -1
      ) {
        return true;
      }
    }
    return false;
  }

  function isWorkbenchOrRoot(el, doc) {
    if (!el || el.nodeType !== 1) return true;
    if (doc && (el === doc.body || el === doc.documentElement)) return true;
    if (el.id === 'workbench' || el.id === 'root' || el.id === 'app') return true;
    var tid = getAttr(el, 'data-testid');
    if (tid === 'sidebar-split' || tid === 'aux-pane-split') return true;
    var cls = typeof el.className === 'string' ? el.className : '';
    if (cls && cls.indexOf('monaco-workbench') !== -1) return true;
    return false;
  }

  function createWeakNodeTracker() {
    var hasWeakRef = typeof WeakRef === 'function';
    if (!hasWeakRef) {
      var fallbackSet = new Set();
      return {
        add: function (node) {
          if (!node) return;
          fallbackSet.add(node);
          if (fallbackSet.size > 256) this.prune();
        },
        delete: function (node) {
          fallbackSet.delete(node);
        },
        prune: function () {
          fallbackSet.forEach(function (n) {
            if (!n || n.isConnected === false) fallbackSet.delete(n);
          });
        },
        forEachAll: function (cb) {
          fallbackSet.forEach(function (n) {
            if (n) cb(n);
          });
        },
        countActive: function () {
          var count = 0;
          fallbackSet.forEach(function (n) {
            if (!n || n.isConnected === false) {
              fallbackSet.delete(n);
              return;
            }
            count++;
          });
          return count;
        },
        clear: function () {
          fallbackSet.clear();
        },
      };
    }
    var refs = new Set();
    var nodeToRef = new WeakMap();
    return {
      add: function (node) {
        if (!node || nodeToRef.has(node)) return;
        var ref = new WeakRef(node);
        nodeToRef.set(node, ref);
        refs.add(ref);
        if (refs.size > 256) this.prune();
      },
      delete: function (node) {
        if (!node) return;
        var ref = nodeToRef.get(node);
        if (ref) {
          refs.delete(ref);
          nodeToRef.delete(node);
        }
      },
      prune: function () {
        refs.forEach(function (ref) {
          var n = ref.deref();
          if (!n || n.isConnected === false) {
            refs.delete(ref);
            if (n) nodeToRef.delete(n);
          }
        });
      },
      forEachAll: function (cb) {
        refs.forEach(function (ref) {
          var n = ref.deref();
          if (!n) {
            refs.delete(ref);
            return;
          }
          cb(n);
        });
      },
      countActive: function () {
        var count = 0;
        refs.forEach(function (ref) {
          var n = ref.deref();
          if (!n || n.isConnected === false) {
            refs.delete(ref);
            if (n) nodeToRef.delete(n);
            return;
          }
          count++;
        });
        return count;
      },
      clear: function () {
        refs.clear();
        nodeToRef = new WeakMap();
      },
    };
  }

  function isInsideDialog(el) {
    var cur = el && el.nodeType === 3 ? el.parentElement || el.parentNode : el;
    var depth = 0;
    while (cur && depth < 48) {
      if (cur.nodeType === 1 && getAttr(cur, 'role') === 'dialog') return true;
      cur = cur.parentElement || cur.parentNode;
      depth++;
    }
    return false;
  }

  function isSmallHoverControlSelf(el) {
    if (!el || el.nodeType !== 1) return false;
    var tag = el.tagName ? String(el.tagName).toUpperCase() : '';
    if (tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY') return true;
    var role = getAttr(el, 'role');
    if (
      role === 'button' ||
      role === 'menuitem' ||
      role === 'menuitemcheckbox' ||
      role === 'menuitemradio' ||
      role === 'option' ||
      role === 'tab' ||
      role === 'switch' ||
      role === 'checkbox' ||
      role === 'combobox' ||
      role === 'tooltip'
    ) {
      return true;
    }
    if (
      getChildElementCount(el) <= 4 &&
      (hasAttr(el, 'title') || hasAttr(el, 'aria-label') || hasAttr(el, 'data-tooltip'))
    ) {
      return true;
    }
    return false;
  }

  function isSmallHoverControl(el) {
    if (!el || el.nodeType !== 1) return false;
    if (isSmallHoverControlSelf(el)) return true;
    var p = el.parentElement;
    if (p && p.nodeType === 1 && getAttr(p, 'role') !== 'dialog' && isSmallHoverControlSelf(p)) {
      return true;
    }
    return false;
  }

  function mountHostI18n(options) {
    var opts = options || {};
    var win = opts.root || (typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null);
    var doc = opts.doc || (win && win.document) || (typeof document !== 'undefined' ? document : null);
    try {
      if (win && win.__agPrismHostI18n && typeof win.__agPrismHostI18n.destroy === 'function') {
        win.__agPrismHostI18n.destroy();
      }
    } catch (e) {}
    var mode = opts.mode === 'on' || opts.mode === 'off' ? opts.mode : 'auto';
    var nowFn =
      typeof opts.nowFn === 'function'
        ? opts.nowFn
        : function () {
            return Date.now();
          };
    var perfNowFn =
      typeof opts.perfNowFn === 'function'
        ? opts.perfNowFn
        : typeof opts.nowFn === 'function'
        ? nowFn
        : typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? function () {
            return performance.now();
          }
        : nowFn;
    var setTimeoutFn =
      typeof opts.setTimeoutFn === 'function'
        ? opts.setTimeoutFn
        : function (fn, ms) {
            return setTimeout(fn, ms);
          };
    var clearTimeoutFn =
      typeof opts.clearTimeoutFn === 'function'
        ? opts.clearTimeoutFn
        : function (id) {
            clearTimeout(id);
          };
    var hasRafSupport =
      typeof opts.rafFn === 'function' || Boolean(win && typeof win.requestAnimationFrame === 'function');
    var rafFn =
      typeof opts.rafFn === 'function'
        ? opts.rafFn
        : win && typeof win.requestAnimationFrame === 'function'
        ? function (cb) {
            return win.requestAnimationFrame(cb);
          }
        : function (cb) {
            return setTimeoutFn(cb, 16);
          };
    var cancelRafFn =
      typeof opts.cancelRafFn === 'function'
        ? opts.cancelRafFn
        : win && typeof win.cancelAnimationFrame === 'function'
        ? function (id) {
            win.cancelAnimationFrame(id);
          }
        : function (id) {
            clearTimeoutFn(id);
          };

    var customMutationObserver = opts.MutationObserver || null;
    var inputDict = opts.dict || { exact: {}, patterns: [] };
    var customReversePatterns = opts.reversePatterns || null;
    var customReverseOverrides = opts.reverseExactOverrides || null;
    var customReverseCrossRules = opts.reverseCrossNodeRules || null;
    var seedExact = Object.create(null);
    if (inputDict.exact && typeof inputDict.exact === 'object') {
      for (var sk in inputDict.exact) {
        if (hasOwn.call(inputDict.exact, sk)) {
          seedExact[sk] = inputDict.exact[sk];
        }
      }
    }
    var internalDictSeed = {
      exact: seedExact,
      patterns: Array.isArray(inputDict.patterns) ? inputDict.patterns.slice() : [],
      rules: Array.isArray(inputDict.rules) ? inputDict.rules.slice() : [],
    };
    // Sever closure retention of options / options.dict immediately
    inputDict = null;
    options = null;
    opts = null;

    var forwardEngine = null;
    var reverseEngine = null;
    var activeEngine = null;
    var translateSingleUnit = null;
    var translatedValues = Object.create(null);
    var activeCrossNodeRules = [];

    function selectEngineForMode(targetMode) {
      if (targetMode === 'off') {
        if (!reverseEngine) {
          reverseEngine = createHostI18nEngine(internalDictSeed, {
            direction: 'reverse',
            reversePatterns: customReversePatterns,
            reverseExactOverrides: customReverseOverrides,
            reverseCrossNodeRules: customReverseCrossRules,
            root: win,
          });
        }
        activeEngine = reverseEngine;
        translateSingleUnit = reverseEngine.translateUnit;
        translatedValues = Object.create(null);
        activeCrossNodeRules = reverseEngine.crossNodeRules || [];
      } else {
        if (!forwardEngine) {
          forwardEngine = createHostI18nEngine(internalDictSeed, {
            direction: 'forward',
            root: win,
          });
        }
        activeEngine = forwardEngine;
        translateSingleUnit = forwardEngine.translateUnit || forwardEngine.translate;
        translatedValues = forwardEngine.translatedValues || Object.create(null);
        activeCrossNodeRules = [];
      }
    }

    var state = {
      active: false,
      mode: mode,
      status: 'off',
      reason: null,
      detectedProvider: null,
      yielded: false,
      destroyed: false,
    };

    var TIER2_SKIP_ATTRS = [
      ['data-ag-localization-skip', 'true'],
      ['data-antigravity-zh-skip', '1'],
    ];

    var textSnapshots = new WeakMap();
    var textUntranslatedCache = new WeakMap();
    var attrSnapshots = new WeakMap();
    var attrUntranslatedCache = new WeakMap();
    var elementConflictState = new WeakMap();
    var exemptElements = new WeakSet();
    var exemptNodes = new WeakSet();
    var processedAlerts = new WeakSet();
    var tier2SkipSnapshots = new WeakMap();
    var offPendingRetryElements = new WeakMap();

    var modifiedTextNodes = createWeakNodeTracker();
    var modifiedAttrElements = createWeakNodeTracker();
    var tier2MarkedElements = createWeakNodeTracker();
    var blockedElementsTracker = createWeakNodeTracker();

    var tier1State = null;
    var offRetryTimers = new Set();
    var inOffRetryPass = false;

    var observer = null;
    var observing = false;
    var dirtyObserver = null;
    var dirtyProbeActive = false;
    var winBlurObserver = null;
    var pendingFullFloatScan = false;
    var pendingNodes = [];
    var pendingNodeSet = new Set();
    var rafId = null;
    var hoverScanTimer = null;
    var hoverCardTimer = null;
    var pendingHoverCardNode = null;
    var focusWakeTimer = null;
    var layer2bTimers = [];
    var domReadyHandler = null;
    var hoverHandler = null;
    var visibilityHandler = null;
    var blurHandler = null;
    var focusHandler = null;

    var bootAt = nowFn();
    var delayedExternalNodes = new Set();
    var globalConflictRecords = [];
    var lastHoverTime = 0;
    var pausedByWindowBlur = false;
    var hibernating = false;
    var missedWhilePaused = false;

    var MAX_NODES_PER_FRAME = 80;
    var FRAME_BUDGET_MS = 5;
    var INITIAL_SYNC_MAX_NODES = 160;
    var INITIAL_SYNC_BUDGET_MS = 5;
    var MAX_PENDING_NODES = 4096;
    var LAYER2B_WINDOW_MS = 1200;
    var CONFLICT_WINDOW_MS = 3000;
    var NODE_CONFLICT_THRESHOLD = 3;
    var GLOBAL_CONFLICT_NODE_THRESHOLD = 5;
    var OFF_RETRY_DELAY_MS = 16;

    function isWinBlurAttrSet() {
      return Boolean(doc && doc.documentElement && getAttr(doc.documentElement, 'data-ag-cs-win-blur') === '1');
    }

    // 元素周期表 3D 键盘打开期间进入休眠，避免高频扫键触发宿主 i18n 扫描与 hover 拦截
    function isPeriodicPickerOpen() {
      return Boolean(doc && doc.documentElement && getAttr(doc.documentElement, 'data-ag-pp-open') === '1');
    }

    function isPaused() {
      var hidden = Boolean(doc && doc.hidden === true);
      return hidden || pausedByWindowBlur || isWinBlurAttrSet() || isPeriodicPickerOpen();
    }

    function setRootStatusAttr(val) {
      try {
        if (doc && doc.documentElement && typeof doc.documentElement.setAttribute === 'function') {
          doc.documentElement.setAttribute('data-ag-prism-host-i18n', val);
        }
      } catch (e) {}
    }

    function removeRootStatusAttr() {
      try {
        if (doc && doc.documentElement && typeof doc.documentElement.removeAttribute === 'function') {
          doc.documentElement.removeAttribute('data-ag-prism-host-i18n');
        }
      } catch (e) {}
    }

    function activateTier1Suppression() {
      tier1State = {
        hansSwitched: false,
        hansPrevLang: null,
        patchObserverPaused: false,
        patchObserverRef: null,
        patchObserverTarget: null,
        patchObserverOpts: null,
        agyCachePaused: false,
        agyCacheRef: null,
        agyOrigHasDesc: null,
        agyOrigGetDesc: null,
        htmlLangModified: false,
        htmlLangOrig: null,
      };
      if (win && typeof win.__antigravityZhSetLang === 'function') {
        var storedHans = safeReadLocalStorage(win, 'antigravityHansLang');
        var normStored = storedHans !== null ? String(storedHans).trim().toLowerCase() : '';
        if (
          storedHans === null ||
          (normStored !== 'en' &&
            normStored !== 'en-us' &&
            normStored !== 'off' &&
            normStored !== 'false' &&
            normStored !== '0')
        ) {
          tier1State.hansPrevLang = storedHans && String(storedHans).trim() ? String(storedHans).trim() : 'zh-CN';
          try {
            win.__antigravityZhSetLang('en');
            tier1State.hansSwitched = true;
          } catch (e) {}
        }
      } else if (
        win &&
        win.__antigravityZhPatchObserver &&
        typeof win.__antigravityZhPatchObserver.disconnect === 'function' &&
        typeof win.__antigravityZhPatchObserver.observe === 'function' &&
        doc &&
        (doc.body || doc.documentElement)
      ) {
        try {
          var extObs = win.__antigravityZhPatchObserver;
          tier1State.patchObserverRef = extObs;
          tier1State.patchObserverTarget = extObs._target || extObs.target || doc.documentElement;
          tier1State.patchObserverOpts = extObs.options || { childList: true, subtree: true, characterData: true };
          extObs.disconnect();
          tier1State.patchObserverPaused = true;
        } catch (e) {}
      }
      // 兼容 Main World 注入版 yiheng8023/antigravity-chinese：仅对单实例 __AGY_CACHE__ 做可逆自有属性静音，绝不碰 Map.prototype
      if (
        win &&
        win.__AGY_CACHE__ &&
        typeof win.__AGY_CACHE__.has === 'function' &&
        typeof win.__AGY_CACHE__.get === 'function' &&
        (win.__AGY_I18N_INITIALIZED__ || win.__AGY_I18N_DATA__)
      ) {
        try {
          var agyCache = win.__AGY_CACHE__;
          tier1State.agyCacheRef = agyCache;
          tier1State.agyOrigHasDesc = Object.getOwnPropertyDescriptor(agyCache, 'has') || null;
          tier1State.agyOrigGetDesc = Object.getOwnPropertyDescriptor(agyCache, 'get') || null;
          Object.defineProperty(agyCache, 'has', {
            value: function () {
              return true;
            },
            configurable: true,
            writable: true,
          });
          Object.defineProperty(agyCache, 'get', {
            value: function () {
              return null;
            },
            configurable: true,
            writable: true,
          });
          tier1State.agyCachePaused = true;
        } catch (e) {}
      }
      if (doc && doc.documentElement && !hasAttr(doc.documentElement, 'data-ag-prism-lang-owned')) {
        var curHtmlLang = getAttr(doc.documentElement, 'lang');
        if (curHtmlLang && /^zh(?:$|[-_])/i.test(String(curHtmlLang).trim())) {
          tier1State.htmlLangOrig = curHtmlLang;
          try {
            doc.documentElement.setAttribute('lang', 'en');
            tier1State.htmlLangModified = true;
          } catch (e) {}
        }
      }
    }

    function restoreTier1Suppression() {
      if (!tier1State) return;
      var saved = tier1State;
      tier1State = null;
      if (saved.htmlLangModified && doc && doc.documentElement && typeof doc.documentElement.setAttribute === 'function') {
        try {
          if (getAttr(doc.documentElement, 'lang') === 'en') {
            doc.documentElement.setAttribute('lang', saved.htmlLangOrig);
          }
        } catch (e) {}
      }
      if (saved.agyCachePaused && saved.agyCacheRef) {
        try {
          if (saved.agyOrigHasDesc) {
            Object.defineProperty(saved.agyCacheRef, 'has', saved.agyOrigHasDesc);
          } else {
            delete saved.agyCacheRef.has;
          }
          if (saved.agyOrigGetDesc) {
            Object.defineProperty(saved.agyCacheRef, 'get', saved.agyOrigGetDesc);
          } else {
            delete saved.agyCacheRef.get;
          }
          if (win && typeof win.__AGY_RUN_FULL_SCAN__ === 'function') {
            win.__AGY_RUN_FULL_SCAN__();
          }
        } catch (e) {}
      }
      if (saved.patchObserverPaused && saved.patchObserverRef && saved.patchObserverTarget) {
        try {
          saved.patchObserverRef.observe(saved.patchObserverTarget, saved.patchObserverOpts);
        } catch (e) {}
      }
      if (saved.hansSwitched && win && typeof win.__antigravityZhSetLang === 'function') {
        try {
          win.__antigravityZhSetLang(saved.hansPrevLang || 'zh-CN');
        } catch (e) {}
      }
    }

    function markTier2SkipElement(el) {
      if (state.mode !== 'off' || !el || el.nodeType !== 1 || typeof el.setAttribute !== 'function') return;
      if (doc && el === doc.documentElement) return;
      var tag = el.tagName ? String(el.tagName).toUpperCase() : '';
      if (IGNORED_TAGS[tag] || tag === 'HEAD' || tag === 'META' || tag === 'LINK') return;
      var snap = tier2SkipSnapshots.get(el);
      if (!snap) {
        snap = Object.create(null);
        for (var i = 0; i < TIER2_SKIP_ATTRS.length; i++) {
          var attrName = TIER2_SKIP_ATTRS[i][0];
          snap[attrName] = hasAttr(el, attrName) ? getAttr(el, attrName) : null;
        }
        tier2SkipSnapshots.set(el, snap);
      }
      for (var j = 0; j < TIER2_SKIP_ATTRS.length; j++) {
        var name = TIER2_SKIP_ATTRS[j][0];
        var targetVal = TIER2_SKIP_ATTRS[j][1];
        if (getAttr(el, name) !== targetVal) {
          try {
            el.setAttribute(name, targetVal);
          } catch (e) {}
        }
      }
      tier2MarkedElements.add(el);
    }

    function rollbackTier2Element(el) {
      var snap = tier2SkipSnapshots.get(el);
      if (!snap) return;
      for (var i = 0; i < TIER2_SKIP_ATTRS.length; i++) {
        var name = TIER2_SKIP_ATTRS[i][0];
        var writtenVal = TIER2_SKIP_ATTRS[i][1];
        var prevVal = snap[name];
        try {
          if (getAttr(el, name) === writtenVal) {
            if (prevVal === null) {
              if (typeof el.removeAttribute === 'function') el.removeAttribute(name);
            } else if (typeof el.setAttribute === 'function') {
              el.setAttribute(name, prevVal);
            }
          }
        } catch (e) {}
      }
      tier2SkipSnapshots.delete(el);
    }

    function countTranslatedUnits() {
      var textCount = modifiedTextNodes.countActive();
      var attrCount = 0;
      modifiedAttrElements.prune();
      modifiedAttrElements.forEachAll(function (el) {
        if (el.isConnected === false) return;
        var mapRec = attrSnapshots.get(el);
        if (mapRec) attrCount += mapRec.count;
      });
      return textCount + attrCount;
    }

    function disconnectObserver() {
      if (observer && observing) {
        try {
          observer.disconnect();
        } catch (e) {}
        observing = false;
      }
    }

    function reconnectObserver() {
      if (state.destroyed || !state.active) return;
      if (observer && !observing && doc && doc.documentElement) {
        try {
          observer.observe(doc.documentElement, {
            childList: true,
            subtree: true,
            characterData: true,
          });
          observing = true;
        } catch (e) {}
      }
    }

    function disconnectDirtyObserver() {
      if (dirtyObserver && dirtyProbeActive) {
        try {
          dirtyObserver.disconnect();
        } catch (e) {}
      }
      dirtyProbeActive = false;
    }

    function armDirtyObserver() {
      if (state.destroyed || !state.active || dirtyProbeActive || !doc || !doc.documentElement) return;
      var MOClass =
        customMutationObserver ||
        (win && win.MutationObserver) ||
        (typeof MutationObserver !== 'undefined' ? MutationObserver : null);
      if (!MOClass) {
        missedWhilePaused = true;
        return;
      }
      try {
        if (!dirtyObserver) {
          dirtyObserver = new MOClass(function () {
            missedWhilePaused = true;
            disconnectDirtyObserver();
          });
        }
        dirtyObserver.observe(doc.documentElement, {
          childList: true,
          subtree: true,
          characterData: true,
        });
        dirtyProbeActive = true;
      } catch (e) {
        dirtyProbeActive = false;
        missedWhilePaused = true;
      }
    }

    function clearOffRetryTimers() {
      var hadAny = offRetryTimers.size > 0;
      if (hadAny) {
        offRetryTimers.forEach(function (tid) {
          try {
            clearTimeoutFn(tid);
          } catch (e) {}
        });
        offRetryTimers.clear();
      }
      offPendingRetryElements = new WeakMap();
      return hadAny;
    }

    function clearAllTimersAndListeners() {
      disconnectDirtyObserver();
      dirtyObserver = null;
      pendingFullFloatScan = false;
      clearOffRetryTimers();
      if (rafId !== null) {
        try {
          cancelRafFn(rafId);
        } catch (e) {}
        rafId = null;
      }
      if (hoverScanTimer !== null) {
        try {
          clearTimeoutFn(hoverScanTimer);
        } catch (e) {}
        hoverScanTimer = null;
      }
      if (hoverCardTimer !== null) {
        try {
          clearTimeoutFn(hoverCardTimer);
        } catch (e) {}
        hoverCardTimer = null;
      }
      pendingHoverCardNode = null;
      if (focusWakeTimer !== null) {
        try {
          clearTimeoutFn(focusWakeTimer);
        } catch (e) {}
        focusWakeTimer = null;
      }
      while (layer2bTimers.length > 0) {
        var tid = layer2bTimers.pop();
        try {
          clearTimeoutFn(tid);
        } catch (e) {}
      }
      if (winBlurObserver) {
        try {
          winBlurObserver.disconnect();
        } catch (e) {}
        winBlurObserver = null;
      }
      if (doc && typeof doc.removeEventListener === 'function') {
        if (domReadyHandler) doc.removeEventListener('DOMContentLoaded', domReadyHandler);
        if (hoverHandler) {
          doc.removeEventListener('pointerenter', hoverHandler, { capture: true });
          doc.removeEventListener('contextmenu', hoverHandler, { capture: true });
        }
        if (visibilityHandler) doc.removeEventListener('visibilitychange', visibilityHandler);
      }
      if (win && typeof win.removeEventListener === 'function') {
        if (blurHandler) win.removeEventListener('blur', blurHandler);
        if (focusHandler) win.removeEventListener('focus', focusHandler);
      }
      domReadyHandler = null;
      hoverHandler = null;
      visibilityHandler = null;
      blurHandler = null;
      focusHandler = null;
    }

    function rollbackAllSnapshots() {
      disconnectObserver();
      var rollbackTextNode = function (node) {
        var snap = textSnapshots.get(node);
        if (snap) {
          try {
            if (node.nodeValue === snap.expected) {
              node.nodeValue = snap.orig;
            }
          } catch (e) {}
          textSnapshots.delete(node);
        }
      };
      var rollbackAttrEl = function (el) {
        var mapRec = attrSnapshots.get(el);
        if (mapRec && mapRec.entries) {
          for (var attr in mapRec.entries) {
            var snap = mapRec.entries[attr];
            try {
              if (snap && el.getAttribute(attr) === snap.expected && typeof el.setAttribute === 'function') {
                el.setAttribute(attr, snap.orig);
              }
            } catch (e) {}
          }
          attrSnapshots.delete(el);
        }
      };
      modifiedTextNodes.forEachAll(rollbackTextNode);
      modifiedTextNodes.clear();

      modifiedAttrElements.forEachAll(rollbackAttrEl);
      modifiedAttrElements.clear();

      tier2MarkedElements.forEachAll(rollbackTier2Element);
      tier2MarkedElements.clear();

      // DOM 兜底扫回：防止节点曾因暂时脱离 DOM 被 prune 剪枝后又被 React 复用回挂导致漏回滚
      var rootEl = doc && (doc.body || doc.documentElement);
      if (rootEl) {
        try {
          if (typeof doc.createTreeWalker === 'function') {
            var tw = doc.createTreeWalker(rootEl, 5);
            var cur = tw.currentNode;
            while (cur) {
              if (cur.nodeType === 3) {
                rollbackTextNode(cur);
              } else if (cur.nodeType === 1) {
                rollbackAttrEl(cur);
                rollbackTier2Element(cur);
              }
              cur = tw.nextNode();
            }
          } else {
            var stack = [rootEl];
            while (stack.length) {
              var nd = stack.pop();
              if (!nd) continue;
              if (nd.nodeType === 3) {
                rollbackTextNode(nd);
              } else if (nd.nodeType === 1) {
                rollbackAttrEl(nd);
                rollbackTier2Element(nd);
                var ch = nd.childNodes;
                if (ch && ch.length) {
                  for (var ci = ch.length - 1; ci >= 0; ci--) stack.push(ch[ci]);
                }
              }
            }
          }
        } catch (e) {}
      }
    }

    function resetTransientRuntimeCaches() {
      textUntranslatedCache = new WeakMap();
      attrUntranslatedCache = new WeakMap();
      elementConflictState = new WeakMap();
      exemptElements = new WeakSet();
      exemptNodes = new WeakSet();
      processedAlerts = new WeakSet();
      blockedElementsTracker.clear();
    }

    function teardownRuntime(nextStatus, nextReason, yieldedFlag, providerName, removeRootAttrFlag) {
      state.active = false;
      state.destroyed = true;
      state.status = nextStatus;
      state.reason = nextReason;
      state.detectedProvider = yieldedFlag ? providerName || null : null;
      state.yielded = Boolean(yieldedFlag);
      hibernating = false;
      pausedByWindowBlur = false;
      inOffRetryPass = false;

      clearAllTimersAndListeners();
      rollbackAllSnapshots();
      restoreTier1Suppression();
      resetTransientRuntimeCaches();
      pendingNodes.length = 0;
      pendingNodeSet.clear();
      delayedExternalNodes.clear();
      globalConflictRecords.length = 0;

      if (removeRootAttrFlag) {
        removeRootStatusAttr();
      } else {
        setRootStatusAttr(nextStatus);
      }
    }

    function yieldAndRollback(reason, providerName) {
      if (state.yielded || state.status === 'yielded') return;
      var resolvedProvider = providerName || null;
      if (!resolvedProvider && reason === 'external-ui-zh') {
        var l1Now = detectLayer1External(win, doc);
        resolvedProvider = l1Now.hit ? l1Now.provider : 'generic-zh-dom';
      } else if (!resolvedProvider && reason === 'conflict-breaker') {
        var l1Conflict = detectLayer1External(win, doc);
        resolvedProvider = l1Conflict.hit ? l1Conflict.provider : 'conflict-breaker';
      }
      teardownRuntime('yielded', reason, true, resolvedProvider, false);
    }

    function scheduleOffConflictRetry(el) {
      if (!el || el.nodeType !== 1 || !state.active || state.destroyed || state.mode !== 'off') return;
      if (exemptElements.has(el) || offPendingRetryElements.has(el)) return;
      var tid = setTimeoutFn(function () {
        offRetryTimers.delete(tid);
        offPendingRetryElements.delete(el);
        if (!state.active || state.destroyed || state.mode !== 'off') return;
        if (el.isConnected === false || exemptElements.has(el)) return;
        if (isPaused()) {
          missedWhilePaused = true;
          return;
        }
        var visited = new WeakSet();
        disconnectObserver();
        inOffRetryPass = true;
        try {
          translateElement(el, visited, null, null);
        } catch (e) {}
        inOffRetryPass = false;
        reconnectObserver();
      }, OFF_RETRY_DELAY_MS);
      offRetryTimers.add(tid);
      offPendingRetryElements.set(el, tid);
    }

    function cancelOffRetryForElement(el) {
      if (!el) return;
      var pendingTid = offPendingRetryElements.get(el);
      if (pendingTid !== undefined) {
        offPendingRetryElements.delete(el);
        offRetryTimers.delete(pendingTid);
        try {
          clearTimeoutFn(pendingTid);
        } catch (e) {}
      }
    }

    function recordGlobalConflict(el, now) {
      var cutoff = now - CONFLICT_WINDOW_MS;
      var nextList = [];
      var found = false;
      for (var i = 0; i < globalConflictRecords.length; i++) {
        var rec = globalConflictRecords[i];
        if (rec.at >= cutoff) {
          if (rec.node === el) {
            rec.at = now;
            found = true;
          }
          nextList.push(rec);
        }
      }
      if (!found) {
        nextList.push({ node: el, at: now });
      }
      globalConflictRecords = nextList;
      return globalConflictRecords.length;
    }

    function recordElementConflict(el, currentText, expectedText, origText, translatedAt) {
      if (!el || el.nodeType !== 1) return false;
      if (exemptElements.has(el)) return 'blocked';
      var st = elementConflictState.get(el);
      if (!st) return false;

      var now = nowFn();
      var isBackToOrig =
        origText !== undefined
          ? currentText === origText
          : hasOwn.call(st.entries, currentText) || currentText === st.lastOrig;
      var isExternalZh = ZH_CHAR_RE.test(currentText || '') && currentText !== expectedText;
      if (isBackToOrig || isExternalZh) {
        var refAt = translatedAt || st.lastTranslatedAt;
        var inWindow =
          now - refAt <= CONFLICT_WINDOW_MS ||
          (st.conflicts.length > 0 && now - st.conflicts[st.conflicts.length - 1] <= CONFLICT_WINDOW_MS);
        if (inWindow) {
          if (st.lastCountedVersion === st.writeVersion) {
            if (exemptElements.has(el)) return 'blocked';
            return state.mode === 'off' ? 'deferred' : false;
          }
          st.lastCountedVersion = st.writeVersion;

          var recent = [];
          for (var i = 0; i < st.conflicts.length; i++) {
            if (now - st.conflicts[i] <= CONFLICT_WINDOW_MS) {
              recent.push(st.conflicts[i]);
            }
          }
          recent.push(now);
          st.conflicts = recent;

          if (state.mode === 'off') {
            if (recent.length >= NODE_CONFLICT_THRESHOLD) {
              cancelOffRetryForElement(el);
              exemptElements.add(el);
              blockedElementsTracker.add(el);
              var offCh = el.firstChild;
              while (offCh) {
                if (offCh.nodeType === 3) {
                  exemptNodes.add(offCh);
                  modifiedTextNodes.delete(offCh);
                  textSnapshots.delete(offCh);
                }
                offCh = offCh.nextSibling;
              }
              if (state.status !== 'off-blocked') {
                state.status = 'off-blocked';
                state.reason = 'external-override-blocked';
                if (!state.detectedProvider) {
                  var l1Blk = detectLayer1External(win, doc);
                  if (l1Blk.hit) state.detectedProvider = l1Blk.provider;
                }
                setRootStatusAttr('off-blocked');
                try {
                  var pApi = win && (win.__agPrism || win.__agClaudeStyle);
                  if (pApi && typeof pApi.sync === 'function') pApi.sync();
                } catch (e) {}
              }
              return 'blocked';
            }
            scheduleOffConflictRetry(el);
            return 'deferred';
          }

          if (recent.length >= 2) {
            var globalCount = recordGlobalConflict(el, now);
            if (globalCount >= GLOBAL_CONFLICT_NODE_THRESHOLD) {
              yieldAndRollback('conflict-breaker');
              return 'blocked';
            }
          }
          if (recent.length >= NODE_CONFLICT_THRESHOLD) {
            exemptElements.add(el);
            var ch = el.firstChild;
            while (ch) {
              if (ch.nodeType === 3) {
                exemptNodes.add(ch);
                modifiedTextNodes.delete(ch);
                textSnapshots.delete(ch);
              }
              ch = ch.nextSibling;
            }
            return 'blocked';
          }
          return false;
        }
      }
      return false;
    }

    /**
     * Checks whether a previously translated/restored node was modified externally.
     * Returns true if the node should NOT be processed synchronously right now
     * (either exempted/circuit-broken, or scheduled for a gentle 16ms retry in 'off' mode).
     */
    function checkNodeConflict(node) {
      if (!node || node.nodeType !== 3) return false;
      var parent = node.parentElement || node.parentNode;
      if (parent && exemptElements.has(parent)) return true;
      if (exemptNodes.has(node)) return true;
      var snap = textSnapshots.get(node);
      if (!snap) return false;
      var currentVal = node.nodeValue;
      if (currentVal === snap.expected) return false;

      if (parent && parent.nodeType === 1) {
        var conflictRes = recordElementConflict(parent, currentVal, snap.expected, snap.orig, snap.translatedAt);
        if (conflictRes === 'blocked' || conflictRes === true) {
          exemptNodes.add(node);
          modifiedTextNodes.delete(node);
          textSnapshots.delete(node);
          return true;
        }
        if (conflictRes === 'deferred') {
          return true;
        }
      }

      // Host updated to genuinely new English copy (e.g. "Save" -> "Saved")
      var isBackToOrig = currentVal === snap.orig;
      var isExternalZh = ZH_CHAR_RE.test(currentVal || '');
      if (!isBackToOrig && !isExternalZh) {
        textSnapshots.delete(node);
        modifiedTextNodes.delete(node);
      }
      return false;
    }

    function checkChildListConflict(el) {
      if (!el || el.nodeType !== 1) return false;
      if (exemptElements.has(el)) return true;
      var st = elementConflictState.get(el);
      if (!st) return false;

      var curText = el.textContent || '';
      if (curText === st.lastExpected) return false;

      var isBackToOrig = hasOwn.call(st.entries, curText) || curText === st.lastOrig;
      var isExternalZh =
        ZH_CHAR_RE.test(curText) &&
        curText !== st.lastExpected &&
        (!st.lastExpected || curText.indexOf(st.lastExpected) === -1) &&
        !hasElementChild(el);
      if (isBackToOrig || isExternalZh) {
        var cRes = recordElementConflict(
          el,
          curText,
          st.lastExpected,
          isBackToOrig ? curText : undefined,
          st.lastTranslatedAt
        );
        if (cRes) {
          return true;
        }
      } else {
        elementConflictState.delete(el);
      }
      return false;
    }

    function applyTextWrite(node, origVal, newVal) {
      var prevSnap = textSnapshots.get(node);
      var baseOrig = prevSnap ? prevSnap.orig : origVal;
      var now = nowFn();
      node.nodeValue = newVal;
      textSnapshots.set(node, {
        orig: baseOrig,
        expected: newVal,
        translatedAt: now,
      });
      textUntranslatedCache.delete(node);
      modifiedTextNodes.add(node);

      var parent = node.parentElement || node.parentNode;
      if (parent && parent.nodeType === 1) {
        if (state.mode === 'off') {
          markTier2SkipElement(parent);
        }
        var st = elementConflictState.get(parent);
        if (!st) {
          st = {
            writeVersion: 0,
            lastCountedVersion: 0,
            lastTranslatedAt: now,
            lastOrig: baseOrig,
            lastExpected: newVal,
            entries: Object.create(null),
            conflicts: [],
          };
          elementConflictState.set(parent, st);
        }
        st.writeVersion++;
        st.lastTranslatedAt = now;
        st.lastOrig = baseOrig;
        st.lastExpected = newVal;
        if (Object.keys(st.entries).length > 16) {
          st.entries = Object.create(null);
        }
        st.entries[baseOrig] = true;
      }
    }

    function sliceEdgeWhitespace(str) {
      var len = str.length;
      var start = 0;
      while (start < len && /\s/.test(str.charAt(start))) start++;
      var end = len;
      while (end > start && /\s/.test(str.charAt(end - 1))) end--;
      return {
        leading: str.slice(0, start),
        trailing: str.slice(end),
      };
    }

    function enqueueNode(node) {
      if (!node || !state.active || state.destroyed) return;
      if (node.isConnected === false) return;
      if (pendingNodeSet.has(node)) return;
      if (pendingNodes.length < MAX_PENDING_NODES) {
        pendingNodes.push(node);
        pendingNodeSet.add(node);
      }
    }

    function createScanBudget(maxNodes, budgetMs) {
      var start = perfNowFn();
      return {
        processed: 0,
        maxNodes: maxNodes,
        deadline: start + budgetMs,
        exhausted: false,
        tick: function () {
          this.processed++;
          if (this.processed >= this.maxNodes) {
            this.exhausted = true;
            return true;
          }
          if ((this.processed & 3) === 0 || this.processed === 1) {
            if (perfNowFn() >= this.deadline) {
              this.exhausted = true;
              return true;
            }
          }
          return false;
        },
        isExhausted: function () {
          if (this.exhausted) return true;
          if (this.processed >= this.maxNodes) {
            this.exhausted = true;
            return true;
          }
          if (this.processed > 0 && perfNowFn() >= this.deadline) {
            this.exhausted = true;
            return true;
          }
          return false;
        },
      };
    }

    function deferRemainingChildren(ownerEl, startChild) {
      var hasLaterText = false;
      var probe = startChild.nextSibling;
      while (probe) {
        if (probe.nodeType === 3 && (probe.nodeValue || '').trim()) {
          hasLaterText = true;
          break;
        }
        probe = probe.nextSibling;
      }
      if (hasLaterText) {
        enqueueNode(ownerEl);
      } else {
        var rem = startChild;
        while (rem) {
          if (rem.nodeType === 1) enqueueNode(rem);
          rem = rem.nextSibling;
        }
      }
    }

    function translateTextNode(node, knownSafeParent) {
      if (!state.active || state.destroyed) return;
      if (!node || node.nodeType !== 3) return;
      if (node.isConnected === false) return;
      if (exemptNodes.has(node)) return;

      var parent = node.parentElement || node.parentNode;
      if (parent && exemptElements.has(parent)) return;
      if (!knownSafeParent && parent && isIgnoredBoundary(parent)) return;

      if (!inOffRetryPass && (checkNodeConflict(node) || !state.active)) return;

      var original = node.nodeValue;
      if (!original) return;

      var snap = textSnapshots.get(node);
      if (snap && snap.expected === original) {
        modifiedTextNodes.add(node);
        return;
      }
      if (!snap && textUntranslatedCache.get(node) === original) return;

      var trimmed = original.trim();
      if (!trimmed) {
        textUntranslatedCache.set(node, original);
        return;
      }

      if (state.mode === 'off') {
        if (trimmed === '。' && node.previousSibling) {
          var prevSibText = (node.previousSibling.textContent || '').trim();
          if (prevSibText && EN_ALPHA_RE.test(prevSibText) && !ZH_CHAR_RE.test(prevSibText)) {
            applyTextWrite(node, original, original.replace('。', '.'));
            return;
          }
        }
        var restored = translateSingleUnit(trimmed);
        if (restored !== null && restored !== trimmed) {
          var revEdges = sliceEdgeWhitespace(original);
          applyTextWrite(node, original, revEdges.leading + restored + revEdges.trailing);
        } else {
          textUntranslatedCache.set(node, original);
        }
        return;
      }

      if (trimmed === '.' && node.previousSibling && ZH_CHAR_RE.test(node.previousSibling.textContent || '')) {
        applyTextWrite(node, original, original.replace('.', '。'));
        return;
      }

      var translated = translateSingleUnit(trimmed);
      if (translated !== null && translated !== trimmed) {
        var edges = sliceEdgeWhitespace(original);
        var leadingSpace = edges.leading;
        var trailingSpace = edges.trailing;
        if (!leadingSpace && node.previousSibling) {
          var prevText = (node.previousSibling.textContent || '').trim();
          if (/[a-zA-Z0-9]$/.test(prevText) && /^[\u4e00-\u9fa5]/.test(translated)) {
            leadingSpace = ' ';
          }
        }
        applyTextWrite(node, original, leadingSpace + translated + trailingSpace);
      } else {
        textUntranslatedCache.set(node, original);
      }
    }

    function translateAttributes(el) {
      if (!el || el.nodeType !== 1 || el.isConnected === false || typeof el.getAttribute !== 'function') return;
      var wroteAnyAttr = false;
      for (var i = 0; i < TRANSLATABLE_ATTRS.length; i++) {
        var attr = TRANSLATABLE_ATTRS[i];
        if (!hasAttr(el, attr)) continue;
        var val = getAttr(el, attr);
        if (!val) continue;

        var mapRec = attrSnapshots.get(el);
        var snap = mapRec && attr in mapRec.entries ? mapRec.entries[attr] : null;
        if (snap && snap.expected === val) {
          modifiedAttrElements.add(el);
          continue;
        }
        if (snap && snap.expected !== val) {
          delete mapRec.entries[attr];
          mapRec.count--;
          if (mapRec.count <= 0) {
            attrSnapshots.delete(el);
            modifiedAttrElements.delete(el);
            mapRec = null;
          }
          snap = null;
        }

        var untransMap = attrUntranslatedCache.get(el);
        if (!snap && untransMap && attr in untransMap && untransMap[attr] === val) continue;

        var trans =
          state.mode === 'off' && activeEngine && typeof activeEngine.translateText === 'function'
            ? activeEngine.translateText(val)
            : translateSingleUnit(val);
        if (trans !== null && trans !== val && typeof el.setAttribute === 'function') {
          var baseOrig = val;
          el.setAttribute(attr, trans);
          if (!mapRec) {
            mapRec = { count: 0, entries: Object.create(null) };
            attrSnapshots.set(el, mapRec);
          }
          if (!(attr in mapRec.entries)) mapRec.count++;
          mapRec.entries[attr] = { orig: baseOrig, expected: trans };
          modifiedAttrElements.add(el);
          wroteAnyAttr = true;
          if (untransMap && attr in untransMap) delete untransMap[attr];
        } else {
          if (!untransMap) {
            untransMap = Object.create(null);
            attrUntranslatedCache.set(el, untransMap);
          }
          untransMap[attr] = val;
        }
      }
      if (wroteAnyAttr && state.mode === 'off') {
        markTier2SkipElement(el);
      }
    }

    function applyReverseCrossNodeRulesOnElement(el) {
      if (!activeCrossNodeRules || activeCrossNodeRules.length === 0) return;
      for (var rIdx = 0; rIdx < activeCrossNodeRules.length; rIdx++) {
        var rule = activeCrossNodeRules[rIdx];
        if (!rule) continue;
        if (rule.kind === 'testid-span-prefix') {
          if (getAttr(el, 'data-testid') === rule.testid && typeof el.querySelector === 'function') {
            var alertSpan = el.querySelector('span');
            if (alertSpan && !processedAlerts.has(alertSpan)) {
              var aCh = alertSpan.firstChild;
              while (aCh) {
                if (aCh.nodeType === 3 && aCh.nodeValue && !exemptNodes.has(aCh)) {
                  var aTrim = aCh.nodeValue.trim();
                  if (rule.matchTrimmed && rule.matchTrimmed.indexOf(aTrim) !== -1) {
                    var repPrefix = aCh.nodeValue.replace(aTrim, rule.replacement);
                    if (aCh.nextSibling && aCh.nextSibling.nodeType === 1 && !/\s$/.test(repPrefix)) {
                      repPrefix += ' ';
                    }
                    applyTextWrite(aCh, aCh.nodeValue, repPrefix);
                  }
                }
                aCh = aCh.nextSibling;
              }
              processedAlerts.add(alertSpan);
            }
          }
        } else if (rule.kind === 'element-sandwich') {
          var first = el.firstChild;
          if (first && first.nextSibling) {
            var hasElemSib = false;
            var probe = first;
            while (probe) {
              if (probe.nodeType === 1) {
                hasElemSib = true;
                break;
              }
              probe = probe.nextSibling;
            }
            if (hasElemSib) {
              var leadNode = null;
              var sawMidElement = false;
              var tailNode = null;
              var cur = first;
              while (cur) {
                if (cur.nodeType === 3 && cur.nodeValue) {
                  var cTrim = cur.nodeValue.trim();
                  if (!leadNode && rule.leadTrimmed && rule.leadTrimmed.indexOf(cTrim) !== -1) {
                    leadNode = cur;
                  } else if (leadNode && sawMidElement && rule.tailTrimmed && rule.tailTrimmed.indexOf(cTrim) !== -1) {
                    tailNode = cur;
                    break;
                  }
                } else if (cur.nodeType === 1 && leadNode) {
                  sawMidElement = true;
                }
                cur = cur.nextSibling;
              }
              if (leadNode && tailNode && !exemptNodes.has(leadNode) && !exemptNodes.has(tailNode)) {
                applyTextWrite(leadNode, leadNode.nodeValue, rule.leadReplacement);
                applyTextWrite(tailNode, tailNode.nodeValue, rule.tailReplacement);
              }
            }
          }
        }
      }
    }

    function translateElement(el, visitedSet, boundaryCtx, budget) {
      if (!state.active || state.destroyed) return;
      if (!el || el.nodeType !== 1) return;
      if (el.isConnected === false) return;
      if (exemptElements.has(el)) return;

      var ctx = boundaryCtx || measureSafeBoundaryDepth(el);
      if (!ctx || ctx.state === -1 || ctx.remDepth < 0) return;

      if (visitedSet) {
        if (visitedSet.has(el)) return;
        visitedSet.add(el);
      }

      if (ctx.state === 1) {
        // Inside conversation stream without interactive chrome exemption:
        // skip self text/attrs, descend only into element children to locate interactive buttons/toolbars.
        var sub = el.firstChild;
        while (sub) {
          if (!state.active || state.destroyed) return;
          if (sub.nodeType === 1) {
            if (budget && budget.isExhausted()) {
              deferRemainingChildren(el, sub);
              return;
            }
            var subCtx = advanceBoundaryForChild(ctx, sub);
            if (subCtx) translateElement(sub, visitedSet, subCtx, budget);
          }
          sub = sub.nextSibling;
        }
        return;
      }

      if (state.mode === 'off') {
        translateAttributes(el);
        applyReverseCrossNodeRulesOnElement(el);
      } else {
        if (getAttr(el, 'data-testid') === 'plan-command-fyi-alert' && typeof el.querySelector === 'function') {
          var alertSpan = el.querySelector('span');
          if (alertSpan && !processedAlerts.has(alertSpan)) {
            var alertChild = alertSpan.firstChild;
            while (alertChild) {
              if (alertChild.nodeType === 3 && alertChild.nodeValue && alertChild.nodeValue.trim() === 'Type') {
                applyTextWrite(alertChild, alertChild.nodeValue, alertChild.nodeValue.replace('Type', '输入'));
              }
              alertChild = alertChild.nextSibling;
            }
            processedAlerts.add(alertSpan);
          }
        }

        translateAttributes(el);

        var first = el.firstChild;
        if (first && first.nextSibling) {
          var hasElementSibling = false;
          var cur = first;
          while (cur) {
            if (cur.nodeType === 1) {
              hasElementSibling = true;
              break;
            }
            cur = cur.nextSibling;
          }
          if (hasElementSibling) {
            var alsoNode = null;
            var whenNode = null;
            var scanCur = first;
            while (scanCur) {
              if (scanCur.nodeType === 3 && scanCur.nodeValue) {
                var tVal = scanCur.nodeValue.trim();
                if (tVal === 'Also includes') {
                  alsoNode = scanCur;
                } else if (alsoNode && tVal === 'when working in this project.') {
                  whenNode = scanCur;
                  break;
                }
              }
              scanCur = scanCur.nextSibling;
            }
            if (alsoNode && whenNode && !exemptNodes.has(alsoNode) && !exemptNodes.has(whenNode)) {
              applyTextWrite(alsoNode, alsoNode.nodeValue, '在此项目中工作时，也包含');
              var between = alsoNode.nextSibling;
              while (between && between !== whenNode) {
                if (between.nodeType === 3 && !(between.nodeValue || '').trim()) {
                  applyTextWrite(between, between.nodeValue, '');
                }
                between = between.nextSibling;
              }
              applyTextWrite(whenNode, whenNode.nodeValue, '。');
            }
          }
        }
      }

      if (budget) budget.tick();

      var child = el.firstChild;
      while (child) {
        if (!state.active || state.destroyed) return;
        if (child.nodeType === 3) {
          translateTextNode(child, true);
        } else if (child.nodeType === 1) {
          if (budget && budget.isExhausted()) {
            deferRemainingChildren(el, child);
            return;
          }
          var childCtx = advanceBoundaryForChild(ctx, child);
          if (childCtx) {
            translateElement(child, visitedSet, childCtx, budget);
          }
        }
        child = child.nextSibling;
      }
    }

    // 在 off（强制还原原生英文）模式下，定点还原侧栏固定 UI 壳子（置顶会话/项目列表/收起/查看全部），同时绝对跳过会话标题行与项目名
    function scanOffSidebarChrome() {
      if (state.mode !== 'off' || !state.active || state.destroyed || !doc || typeof doc.querySelectorAll !== 'function') return;
      var safeWalkSubtree = function (rootEl) {
        if (!rootEl || rootEl.nodeType !== 1 || rootEl.isConnected === false) return;
        if (isPrismOwnedElement(rootEl) || isExternalOwnedElement(rootEl) || exemptElements.has(rootEl)) return;
        var tid = getAttr(rootEl, 'data-testid');
        if (tid === 'conversation-row-sidebar' || tid === 'project-header' || tid === 'workspace-switcher') return;
        translateAttributes(rootEl);
        var ch = rootEl.firstChild;
        while (ch) {
          if (!state.active || state.destroyed) return;
          if (ch.nodeType === 3) {
            translateTextNode(ch, true);
          } else if (ch.nodeType === 1) {
            safeWalkSubtree(ch);
          }
          ch = ch.nextSibling;
        }
      };
      try {
        var headers = doc.querySelectorAll('[data-testid="pinned-section-header"], [data-testid="section-header"]');
        for (var i = 0; i < headers.length; i++) safeWalkSubtree(headers[i]);
      } catch (e) {}
      try {
        var listRoots = doc.querySelectorAll('[data-testid="conversation-list-sidebar"]');
        for (var l = 0; l < listRoots.length; l++) {
          var btns = listRoots[l] && typeof listRoots[l].querySelectorAll === 'function' ? listRoots[l].querySelectorAll('button') : [];
          for (var b = 0; b < btns.length; b++) {
            var btn = btns[b];
            if (!btn || btn.isConnected === false) continue;
            var insideUserRow = false;
            var cur = btn;
            while (cur && cur !== listRoots[l]) {
              var cTid = getAttr(cur, 'data-testid');
              if (cTid === 'conversation-row-sidebar' || cTid === 'project-header' || cTid === 'workspace-switcher') {
                insideUserRow = true;
                break;
              }
              cur = cur.parentElement;
            }
            if (!insideUserRow) safeWalkSubtree(btn);
          }
        }
      } catch (e) {}
    }

    function safeFullScan() {
      if (!state.active || state.destroyed || !doc || !doc.documentElement) return;
      var visitedSet = new WeakSet();
      disconnectObserver();
      try {
        translateElement(doc.documentElement, visitedSet, null, null);
        if (state.mode === 'off') scanOffSidebarChrome();
      } catch (e) {}
      reconnectObserver();
    }

    function safeBudgetedScan() {
      if (!state.active || state.destroyed || !doc || !doc.documentElement) return;
      if (!hasRafSupport) {
        safeFullScan();
        return;
      }
      var visitedSet = new WeakSet();
      var budget = createScanBudget(INITIAL_SYNC_MAX_NODES, INITIAL_SYNC_BUDGET_MS);
      disconnectObserver();
      try {
        translateElement(doc.documentElement, visitedSet, null, budget);
        if (state.mode === 'off') scanOffSidebarChrome();
      } catch (e) {}
      reconnectObserver();
      if (state.active && !state.destroyed && pendingNodes.length > 0) {
        scheduleFlush();
      }
    }

    function flushPendingNodes() {
      rafId = null;
      if (!state.active || state.destroyed) return;
      if (isPaused()) {
        if (!hibernating) enterHibernation(true);
        else missedWhilePaused = true;
        return;
      }
      modifiedTextNodes.prune();
      modifiedAttrElements.prune();
      if (pendingNodes.length === 0) return;

      var takeCount = Math.min(pendingNodes.length, MAX_NODES_PER_FRAME);
      var batch = pendingNodes.splice(0, takeCount);
      for (var b = 0; b < batch.length; b++) {
        pendingNodeSet.delete(batch[b]);
      }

      var budget = createScanBudget(MAX_NODES_PER_FRAME, FRAME_BUDGET_MS);
      var visitedSet = new WeakSet();
      disconnectObserver();
      try {
        for (var i = 0; i < batch.length; i++) {
          if (!state.active || state.destroyed) break;
          var node = batch[i];
          if (!node || node.isConnected === false) continue;
          if (i > 0 && budget.isExhausted()) {
            for (var r = i; r < batch.length; r++) {
              enqueueNode(batch[r]);
            }
            break;
          }
          if (node.nodeType === 1) {
            translateElement(node, visitedSet, null, budget);
          } else if (node.nodeType === 3) {
            translateTextNode(node, false);
            budget.tick();
          }
        }
      } catch (e) {}
      reconnectObserver();

      if (state.active && !state.destroyed && pendingNodes.length > 0) {
        scheduleFlush();
      }
    }

    function scheduleFlush() {
      if (!state.active || state.destroyed) return;
      if (isPaused()) {
        if (!hibernating) enterHibernation(true);
        else missedWhilePaused = true;
        return;
      }
      if (rafId === null) {
        rafId = rafFn(flushPendingNodes);
      }
    }

    function inspectExternalDelayedMutation(node) {
      if (state.mode !== 'auto') return false;
      if (nowFn() - bootAt > LAYER2B_WINDOW_MS) return false;
      if (!node) return false;

      function checkSingleTextNode(tNode) {
        if (!tNode || tNode.nodeType !== 3) return;
        var parent = tNode.parentElement || tNode.parentNode;
        if (
          !parent ||
          isPrismOwnedElement(parent) ||
          isUserContentBoundary(parent) ||
          isInsideConversationStream(parent) ||
          isIgnoredBoundary(parent)
        ) {
          return;
        }
        var val = (tNode.nodeValue || '').trim();
        if (!val || !ZH_CHAR_RE.test(val)) return;
        var snap = textSnapshots.get(tNode);
        if (snap && snap.expected === tNode.nodeValue) return;
        if (hasOwn.call(translatedValues, val) || isInsideExplicitDelayedChrome(parent)) {
          delayedExternalNodes.add(parent);
        }
      }

      if (node.nodeType === 3) {
        checkSingleTextNode(node);
      } else if (node.nodeType === 1) {
        if (
          isPrismOwnedElement(node) ||
          isUserContentBoundary(node) ||
          isInsideConversationStream(node) ||
          isIgnoredBoundary(node)
        ) {
          return false;
        }
        var stack = [node];
        var steps = 0;
        while (stack.length > 0 && steps < 120) {
          steps++;
          var cur = stack.pop();
          if (cur.nodeType === 3) {
            checkSingleTextNode(cur);
          } else if (
            cur.nodeType === 1 &&
            !isDirectIgnoredSelf(cur) &&
            !isConversationStreamSelf(cur)
          ) {
            var ch = cur.firstChild;
            while (ch) {
              stack.push(ch);
              ch = ch.nextSibling;
            }
          }
        }
      }

      if (delayedExternalNodes.size >= 2) {
        yieldAndRollback('external-ui-zh');
        return true;
      }
      return false;
    }

    var FLOATING_CONTAINER_SEL =
      '[role="tooltip"], [role="menu"], [role="listbox"], [data-floating-ui-portal], [data-radix-popper-content-wrapper], .popover, .tooltip, .context-view, .monaco-hover';

    function hasFloatingShellHint(el) {
      if (!el || el.nodeType !== 1) return false;
      if (isDialogOrPortalWrappingDialog(el) || isDirectIgnoredSelf(el)) return false;
      if (isFloatingElement(el, doc)) return true;
      if (hasAttr(el, 'data-radix-portal') || hasAttr(el, 'data-floating-ui-focus-guard')) return true;
      var idStr = typeof el.id === 'string' ? el.id.toLowerCase() : '';
      return Boolean(idStr && (idStr.indexOf('portal') !== -1 || idStr.indexOf('tooltip') !== -1 || idStr.indexOf('popover') !== -1));
    }

    function collectTriggerFloatingHint(target, addCandidate) {
      var hit = false;
      var cur = target;
      for (var depth = 0; depth < 2 && cur && cur.nodeType === 1; depth++) {
        var desc = getAttr(cur, 'aria-describedby') || getAttr(cur, 'aria-controls') || '';
        if (desc) {
          hit = true;
          if (typeof doc.getElementById === 'function') {
            var parts = desc.trim().split(/\s+/);
            for (var i = 0; i < parts.length; i++) {
              if (!parts[i]) continue;
              var refEl = doc.getElementById(parts[i]);
              if (refEl) addCandidate(refEl);
            }
          }
        }
        if (getAttr(cur, 'data-state') === 'open' || getAttr(cur, 'aria-expanded') === 'true') {
          hit = true;
        }
        cur = cur.parentElement;
      }
      return hit;
    }

    function scanFloatingContainers(fullScan, triggerTarget) {
      if (!state.active || state.destroyed || !doc || !doc.body) return;
      if (isPaused()) {
        if (!hibernating) enterHibernation();
        return;
      }

      var candidates = [];
      var candidateSet = new Set();
      function addCandidate(el) {
        if (!el || el.nodeType !== 1 || el.isConnected === false) return;
        if (candidateSet.has(el) || exemptElements.has(el)) return;
        if (isDialogOrPortalWrappingDialog(el) || isDirectIgnoredSelf(el)) return;
        if (hasAttr(el, 'data-hover-card-popup') || (typeof el.querySelector === 'function' && (hasAttr(el, 'data-base-ui-portal') || hasAttr(el, 'data-floating-ui-portal')) && el.querySelector('[data-hover-card-popup]'))) return;
        candidateSet.add(el);
        candidates.push(el);
      }

      var hasFloatHint = Boolean(fullScan);
      var tail = doc.body.lastElementChild;
      for (var step = 0; tail && step < 4; step++, tail = tail.previousElementSibling) {
        if (isFloatingElement(tail, doc)) {
          addCandidate(tail);
          hasFloatHint = true;
        } else if (!hasFloatHint && hasFloatingShellHint(tail)) {
          hasFloatHint = true;
        }
      }
      if (!fullScan && triggerTarget && collectTriggerFloatingHint(triggerTarget, addCandidate)) {
        hasFloatHint = true;
      }
      if ((fullScan || hasFloatHint) && typeof doc.querySelectorAll === 'function') {
        var popups = doc.querySelectorAll(FLOATING_CONTAINER_SEL);
        if (popups && popups.length > 0) {
          for (var pIdx = 0; pIdx < popups.length; pIdx++) {
            addCandidate(popups[pIdx]);
          }
        }
      }

      if (candidates.length === 0) return;

      var visitedSet = new WeakSet();
      disconnectObserver();
      try {
        for (var cIdx = 0; cIdx < candidates.length; cIdx++) {
          if (!state.active || state.destroyed) break;
          translateElement(candidates[cIdx], visitedSet, null, null);
        }
      } catch (e) {}
      reconnectObserver();
    }

    function runHoverTargetScan(target) {
      if (!state.active || state.destroyed || isPaused() || !target || target.nodeType !== 1) return;
      if (target.isConnected === false || exemptElements.has(target)) return;
      if (isDialogOrPortalWrappingDialog(target) || isWorkbenchOrRoot(target, doc)) return;

      var targetCtx = measureSafeBoundaryDepth(target);
      if (targetCtx.blocked) return;

      var scanTarget = getChildElementCount(target) <= 12;
      var parent = target.parentElement;
      var parentCtx = null;
      if (
        parent &&
        !isWorkbenchOrRoot(parent, doc) &&
        !isDialogOrPortalWrappingDialog(parent) &&
        getChildElementCount(parent) <= 8
      ) {
        var pCtx = measureSafeBoundaryDepth(parent);
        if (!pCtx.blocked) parentCtx = pCtx;
      }

      if (!scanTarget && !parentCtx) return;

      var visitedSet = new WeakSet();
      disconnectObserver();
      try {
        if (scanTarget) {
          translateElement(target, visitedSet, targetCtx, null);
        }
        if (parentCtx && state.active && !state.destroyed) {
          translateElement(parent, visitedSet, parentCtx, null);
        }
      } catch (err) {}
      reconnectObserver();
    }

    function enterHibernation(markMissed) {
      if (!state.active || state.destroyed) return;
      var wasCovered = observing || dirtyProbeActive;
      hibernating = true;
      pendingFullFloatScan = false;
      if (rafId !== null) {
        cancelRafFn(rafId);
        rafId = null;
      }
      if (hoverScanTimer !== null) {
        clearTimeoutFn(hoverScanTimer);
        hoverScanTimer = null;
      }
      if (hoverCardTimer !== null) {
        clearTimeoutFn(hoverCardTimer);
        hoverCardTimer = null;
      }
      pendingHoverCardNode = null;
      if (focusWakeTimer !== null) {
        clearTimeoutFn(focusWakeTimer);
        focusWakeTimer = null;
      }
      var hadOffRetry = clearOffRetryTimers();
      if (markMissed || hadOffRetry || pendingNodes.length > 0 || !wasCovered) {
        missedWhilePaused = true;
      }
      pendingNodes.length = 0;
      pendingNodeSet.clear();
      var hiddenNow = Boolean(doc && doc.hidden === true);
      if (hiddenNow) {
        missedWhilePaused = true;
        disconnectDirtyObserver();
      }
      if (state.mode !== 'auto' || nowFn() - bootAt > LAYER2B_WINDOW_MS) {
        if (observer && observing) {
          try {
            if (typeof observer.takeRecords === 'function') {
              var recs = observer.takeRecords();
              if (recs && recs.length > 0) missedWhilePaused = true;
            }
          } catch (e) {}
        }
        disconnectObserver();
        if (!hiddenNow && !missedWhilePaused) {
          armDirtyObserver();
        } else {
          disconnectDirtyObserver();
        }
      }
    }

    function wakeFromHibernation() {
      if (!state.active || state.destroyed) return;
      if (isPaused()) return;
      hibernating = false;
      var hadProbe = dirtyProbeActive;
      if (dirtyObserver && dirtyProbeActive) {
        try {
          if (typeof dirtyObserver.takeRecords === 'function') {
            var recs = dirtyObserver.takeRecords();
            if (recs && recs.length > 0) missedWhilePaused = true;
          }
        } catch (e) {}
        disconnectDirtyObserver();
      }
      if (missedWhilePaused || pendingNodes.length > 0 || (!observing && !hadProbe)) {
        missedWhilePaused = false;
        pendingNodes.length = 0;
        pendingNodeSet.clear();
        safeBudgetedScan();
      }
      reconnectObserver();
    }

    function attachListenersAndObserver() {
      if (!doc || !doc.documentElement || state.destroyed || !state.active) return;

      var MutationObserverClass =
        customMutationObserver ||
        (win && win.MutationObserver) ||
        (typeof MutationObserver !== 'undefined' ? MutationObserver : null);

      var isFocusGuard = function (n) {
        return Boolean(n && n.nodeType === 1 && (hasAttr(n, 'data-floating-ui-focus-guard') || hasAttr(n, 'data-base-ui-focus-guard')));
      };
      var isHoverCardPortalOrSelf = function (n) {
        if (!n || n.nodeType !== 1 || n === doc.body || n === doc.documentElement) return false;
        if (hasAttr(n, 'data-hover-card-popup')) return true;
        if (typeof n.closest === 'function' && n.closest('[data-hover-card-popup]')) return true;
        if ((hasAttr(n, 'data-base-ui-portal') || hasAttr(n, 'data-floating-ui-portal') || getAttr(n, 'role') === 'presentation') && typeof n.querySelector === 'function' && n.querySelector('[data-hover-card-popup]')) return true;
        for (var c = n.firstElementChild, k = 0; c && k < 4; c = c.nextElementSibling, k++) {
          if (hasAttr(c, 'data-hover-card-popup') || hasAttr(c.firstElementChild, 'data-hover-card-popup') || hasAttr(c.lastElementChild, 'data-hover-card-popup')) return true;
        }
        return false;
      };
      var scheduleHoverCardNode = function (n) {
        pendingHoverCardNode = n;
        if (hoverCardTimer !== null) clearTimeoutFn(hoverCardTimer);
        hoverCardTimer = setTimeoutFn(function () {
          hoverCardTimer = null;
          var hc = pendingHoverCardNode;
          pendingHoverCardNode = null;
          if (!state.active || state.destroyed || isPaused() || !hc || hc.isConnected === false) return;
          enqueueNode(hc);
          scheduleFlush();
        }, 120);
      };

      if (MutationObserverClass) {
        observer = new MutationObserverClass(function (mutations) {
          if (!state.active || state.destroyed) return;
          var inLayer2b = state.mode === 'auto' && nowFn() - bootAt <= LAYER2B_WINDOW_MS;
          var pausedNow = isPaused();
          if (pausedNow) {
            if (!hibernating) enterHibernation(true);
            else missedWhilePaused = true;
            if (!inLayer2b) return;
          }

          var batchBoundaryCache = new WeakMap();
          function getCachedBoundary(el) {
            var hit = batchBoundaryCache.get(el);
            if (hit !== undefined) return hit;
            var res = measureSafeBoundaryDepth(el);
            batchBoundaryCache.set(el, res);
            return res;
          }

          for (var i = 0; i < mutations.length; i++) {
            if (!state.active || state.destroyed) return;
            var mutation = mutations[i];
            if (mutation.type === 'childList') {
              var targetEl = mutation.target;
              var added = mutation.addedNodes;
              if (targetEl && targetEl.nodeType === 1) {
                if (targetEl.isConnected === false || exemptElements.has(targetEl)) continue;
                var targetIsHoverCard = isHoverCardPortalOrSelf(targetEl);
                if (targetIsHoverCard) {
                  if (!pausedNow && added && added.length > 0) scheduleHoverCardNode(targetEl);
                  continue;
                }
                var targetBound = getCachedBoundary(targetEl);
                if (targetBound.blocked && !targetBound.canDescendConv) {
                  continue;
                }
                if (!pausedNow && !targetBound.blocked && checkChildListConflict(targetEl)) {
                  continue;
                }
                if (!state.active || state.destroyed) return;
                if (!added || added.length === 0) continue;
                for (var j = 0; j < added.length; j++) {
                  var addedNode = added[j];
                  if (!addedNode || addedNode.isConnected === false) continue;
                  if (addedNode.nodeType === 3) {
                    if (targetBound.blocked || exemptNodes.has(addedNode)) continue;
                  } else if (addedNode.nodeType === 1) {
                    if (exemptElements.has(addedNode) || isDirectIgnoredSelf(addedNode) || isFocusGuard(addedNode)) continue;
                    if (isHoverCardPortalOrSelf(addedNode)) {
                      if (!pausedNow) scheduleHoverCardNode(addedNode);
                      continue;
                    }
                    if (
                      targetBound.canDescendConv &&
                      !isInteractiveChatChromeSelf(addedNode, true) &&
                      !hasElementChild(addedNode)
                    ) {
                      continue;
                    }
                  } else {
                    continue;
                  }
                  if (inLayer2b && inspectExternalDelayedMutation(addedNode)) return;
                  if (!pausedNow) enqueueNode(addedNode);
                }
              } else if (added && added.length > 0) {
                for (var k = 0; k < added.length; k++) {
                  var rootAdded = added[k];
                  if (!rootAdded || rootAdded.isConnected === false) continue;
                  if (inLayer2b && inspectExternalDelayedMutation(rootAdded)) return;
                  if (!pausedNow) enqueueNode(rootAdded);
                }
              }
            } else if (mutation.type === 'characterData' && mutation.target) {
              var target = mutation.target;
              if (target.isConnected === false || exemptNodes.has(target)) continue;
              var parent = target.parentElement || target.parentNode;
              if (!parent || parent.nodeType !== 1 || parent.isConnected === false || exemptElements.has(parent)) {
                continue;
              }
              if (isHoverCardPortalOrSelf(parent)) {
                if (!pausedNow) scheduleHoverCardNode(parent);
                continue;
              }
              var snap = textSnapshots.get(target);
              if (snap && snap.expected === target.nodeValue) continue;
              var parentBound = getCachedBoundary(parent);
              if (parentBound.blocked) continue;
              if (inLayer2b && inspectExternalDelayedMutation(target)) return;
              if (pausedNow) continue;
              if (checkNodeConflict(target)) continue;
              if (!state.active || state.destroyed) return;
              enqueueNode(target);
            }
          }
          if (!pausedNow && pendingNodes.length > 0) {
            scheduleFlush();
          }
        });
      }

      if (!isPaused()) {
        safeBudgetedScan();
      } else {
        // 窗口可见但暂时失焦（如热切换配置/外部改 config.json）时，off 模式先同步执行一次全量还原，随后保持 0fps 休眠
        if (state.mode === 'off' && !(doc && doc.hidden === true)) {
          safeFullScan();
          disconnectObserver();
        }
        hibernating = true;
        missedWhilePaused = true;
      }
      if (!state.active || state.destroyed) return;

      if (observer && (!isPaused() || (state.mode === 'auto' && nowFn() - bootAt <= LAYER2B_WINDOW_MS))) {
        reconnectObserver();
      }

      if (MutationObserverClass && doc.documentElement) {
        try {
          winBlurObserver = new MutationObserverClass(function (muts) {
            if (!state.active || state.destroyed) return;
            var sawPauseAttr = false;
            for (var wi = 0; wi < muts.length; wi++) {
              var attrName = muts[wi].attributeName;
              if (
                muts[wi].type === 'attributes' &&
                (!attrName || attrName === 'data-ag-cs-win-blur' || attrName === 'data-ag-pp-open')
              ) {
                sawPauseAttr = true;
                break;
              }
            }
            if (!sawPauseAttr) return;
            if (isPaused()) {
              enterHibernation();
            } else if (hibernating) {
              wakeFromHibernation();
            }
          });
          winBlurObserver.observe(doc.documentElement, {
            attributes: true,
            attributeFilter: ['data-ag-cs-win-blur', 'data-ag-pp-open'],
          });
        } catch (e) {
          winBlurObserver = null;
        }
      }

      // Layer 2b delayed-plugin check within 1200ms window (auto mode only)
      if (state.mode === 'auto') {
        var checkDelays = [450, 1150];
        for (var d = 0; d < checkDelays.length; d++) {
          (function (delayMs) {
            var tid = setTimeoutFn(function () {
              if (!state.active || state.destroyed || state.mode !== 'auto') return;
              if (nowFn() - bootAt > LAYER2B_WINDOW_MS + 100) return;
              var l1 = detectLayer1External(win, doc);
              if (l1.hit) {
                yieldAndRollback('external-ui-zh', l1.provider);
                return;
              }
              var l2 = detectLayer2ChromeZh(doc, { textSnapshots: textSnapshots });
              if (l2.hit) {
                yieldAndRollback('external-ui-zh', 'generic-zh-dom');
                return;
              }
              if (delayMs >= 1150 && isPaused()) {
                disconnectObserver();
                if (doc && doc.hidden === true) {
                  missedWhilePaused = true;
                } else if (!missedWhilePaused) {
                  armDirtyObserver();
                }
              }
            }, delayMs);
            layer2bTimers.push(tid);
          })(checkDelays[d]);
        }
      }

      // Hover & ContextMenu targeted floating scan (leading + trailing 120ms throttle)
      hoverHandler = function (e) {
        if (!state.active || state.destroyed) return;
        if (isPaused()) {
          if (!hibernating) enterHibernation();
          return;
        }
        if (hibernating) {
          wakeFromHibernation();
        }
        var rawTarget = e && e.target;
        var target = rawTarget && rawTarget.nodeType === 3 ? rawTarget.parentElement || rawTarget.parentNode : rawTarget;
        if (!target || target.nodeType !== 1 || target.isConnected === false) return;

        var isContextMenu = Boolean(e && e.type === 'contextmenu');
        if (isContextMenu) {
          pendingFullFloatScan = true;
        } else if (e && e.type === 'pointerenter') {
          var tg = String(target.tagName || '').toUpperCase();
          if (tg === 'PATH' || tg === 'CIRCLE' || tg === 'RECT' || tg === 'LINE' || tg === 'POLYLINE' || tg === 'POLYGON' || tg === 'ELLIPSE' || tg === 'G' || tg === 'DEFS' || tg === 'USE' || tg === 'STOP') return;
          if (exemptElements.has(target) || isDialogOrPortalWrappingDialog(target)) return;
          if (target.closest?.('[data-testid="conversation-row-sidebar"],[data-testid="project-header"],[data-testid="conversation-list-sidebar"],[data-testid="sidebar-split"]>div:first-child,[data-hover-card-popup]')) return;
          var hoverBound = measureSafeBoundaryDepth(target);
          if (hoverBound.blocked) return;
          if (isInsideDialog(target) && !isSmallHoverControl(target)) return;
        }

        var now = nowFn();
        var elapsed = now - lastHoverTime;
        var ranImmediate = false;
        if (elapsed >= 120) {
          lastHoverTime = now;
          ranImmediate = true;
          runHoverTargetScan(target);
        }
        if (hoverScanTimer !== null) {
          clearTimeoutFn(hoverScanTimer);
        }
        var delay = ranImmediate ? 50 : Math.max(50, 120 - elapsed + 20);
        hoverScanTimer = setTimeoutFn(function () {
          hoverScanTimer = null;
          lastHoverTime = nowFn();
          if (!ranImmediate) {
            runHoverTargetScan(target);
          }
          var doFull = pendingFullFloatScan;
          pendingFullFloatScan = false;
          scanFloatingContainers(doFull, target);
        }, delay);
      };

      if (typeof doc.addEventListener === 'function') {
        doc.addEventListener('pointerenter', hoverHandler, { capture: true, passive: true });
        doc.addEventListener('contextmenu', hoverHandler, { capture: true, passive: true });

        visibilityHandler = function () {
          if (!state.active || state.destroyed) return;
          if (isPaused()) {
            enterHibernation();
          } else {
            wakeFromHibernation();
          }
        };
        doc.addEventListener('visibilitychange', visibilityHandler);
      }

      if (win && typeof win.addEventListener === 'function') {
        blurHandler = function () {
          pausedByWindowBlur = true;
          enterHibernation();
        };
        focusHandler = function () {
          pausedByWindowBlur = false;
          if (!isPaused()) {
            wakeFromHibernation();
          } else if (isWinBlurAttrSet() && focusWakeTimer === null) {
            // Allow companion runtime's focus handler to clear data-ag-cs-win-blur in the same turn
            focusWakeTimer = setTimeoutFn(function () {
              focusWakeTimer = null;
              if (!isPaused()) wakeFromHibernation();
            }, 0);
          }
        };
        win.addEventListener('blur', blurHandler);
        win.addEventListener('focus', focusHandler);
      }
    }

    function boot(targetMode) {
      mode = targetMode === 'on' || targetMode === 'off' ? targetMode : 'auto';
      state.mode = mode;

      selectEngineForMode(mode);

      state.destroyed = false;
      state.yielded = false;
      state.reason = null;
      state.detectedProvider = null;
      bootAt = nowFn();
      pausedByWindowBlur = false;
      hibernating = Boolean((doc && doc.hidden === true) || isWinBlurAttrSet());
      missedWhilePaused = false;
      dirtyProbeActive = false;
      pendingFullFloatScan = false;
      inOffRetryPass = false;
      delayedExternalNodes.clear();
      globalConflictRecords.length = 0;

      if (mode === 'off') {
        var l1Pre = detectLayer1External(win, doc);
        if (l1Pre.hit) {
          state.detectedProvider = l1Pre.provider || null;
        }
        activateTier1Suppression();
        state.active = true;
        state.status = 'off-enforced';
        setRootStatusAttr('off-enforced');

        if (doc) {
          if (doc.readyState === 'loading' && typeof doc.addEventListener === 'function') {
            domReadyHandler = function () {
              if (!state.active || state.destroyed || state.mode !== 'off') return;
              attachListenersAndObserver();
            };
            doc.addEventListener('DOMContentLoaded', domReadyHandler, { once: true });
          } else {
            attachListenersAndObserver();
          }
        }
        return;
      }

      if (mode === 'auto') {
        var extCheck = detectExternalLocalization(win, doc);
        if (extCheck.detected) {
          state.active = false;
          state.status = 'yielded';
          state.reason = extCheck.reason || 'external-ui-zh';
          state.detectedProvider = extCheck.provider || 'generic-external';
          state.yielded = true;
          setRootStatusAttr('yielded');
          return;
        }
      }

      state.active = true;
      state.status = 'active';
      setRootStatusAttr('active');

      if (doc) {
        if (doc.readyState === 'loading' && typeof doc.addEventListener === 'function') {
          domReadyHandler = function () {
            if (!state.active || state.destroyed) return;
            if (state.mode === 'auto') {
              var recheck = detectExternalLocalization(win, doc);
              if (recheck.detected) {
                yieldAndRollback(recheck.reason || 'external-ui-zh', recheck.provider);
                return;
              }
            }
            attachListenersAndObserver();
          };
          doc.addEventListener('DOMContentLoaded', domReadyHandler, { once: true });
        } else {
          attachListenersAndObserver();
        }
      }
    }

    boot(mode);

    var instance = {
      getStatus: function () {
        var modUnits = countTranslatedUnits();
        var isOffMode = state.mode === 'off';
        return {
          active: state.active,
          mode: state.mode,
          status: state.status,
          reason: state.reason,
          detectedProvider: state.detectedProvider,
          translatedCount: isOffMode ? 0 : modUnits,
          restoredCount: isOffMode ? modUnits : 0,
          blockedCount: isOffMode ? blockedElementsTracker.countActive() : 0,
          yielded: state.yielded,
        };
      },
      destroy: function () {
        teardownRuntime('off', 'destroyed', false, null, true);
      },
      setMode: function (nextMode, forceReboot) {
        var norm = nextMode === 'on' || nextMode === 'off' ? nextMode : 'auto';
        if (
          !forceReboot &&
          !state.destroyed &&
          norm === state.mode &&
          ((norm === 'off' && state.active && (state.status === 'off-enforced' || state.status === 'off-blocked')) ||
            (norm !== 'off' && state.active && state.status === 'active'))
        ) {
          return instance.getStatus();
        }
        teardownRuntime('off', 'mode-switch', false, null, false);
        boot(norm);
        return instance.getStatus();
      },
      scan: function () {
        if (state.active && !state.destroyed) {
          if (!isPaused() && hibernating) {
            wakeFromHibernation();
          } else if (!isPaused()) {
            safeFullScan();
          } else if (!(doc && doc.hidden === true)) {
            safeFullScan();
            disconnectObserver();
          }
        }
        return instance.getStatus();
      },
    };

    if (win) {
      win.__agPrismHostI18n = instance;
    }

    return instance;
  }

  return {
    createHostI18nEngine: createHostI18nEngine,
    mountHostI18n: mountHostI18n,
    detectExternalLocalization: detectExternalLocalization,
    detectLayer1External: detectLayer1External,
    detectLayer2ChromeZh: detectLayer2ChromeZh,
    isPrismOwnedElement: isPrismOwnedElement,
    isExternalOwnedElement: isExternalOwnedElement,
    isModelSelectorElement: isModelSelectorElement,
    isUserContentBoundary: isUserContentBoundary,
    isIgnoredBoundary: isIgnoredBoundary,
    measureSafeBoundaryDepth: measureSafeBoundaryDepth,
  };
});

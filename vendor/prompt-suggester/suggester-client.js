// Obsidian Prism — Channel 11 Context-Aware Next-Prompt Ghost Suggester Client Runtime (v1.0.8 · Beta)
// - 严格按会话 data-cascade-id 隔离：绝不跨会话泄漏建议
// - 精确展示生命周期：
//   * 历史/静止对话重开保持静默，绝不自动发起请求或显示陈旧建议
//   * /btw 侧栏问答与子智能体标签页严格排除
//   * 主会话刚完成回复后触发一次预测，严格绑定该 cascadeId 与 turnSig
//   * 关闭态（enabled: false）零 MutationObserver、零 document 捕获监听、零运行时样式注入
// - Lexical 单次指令插入（杜绝异步双插）

(function (root) {
  'use strict';
  const G = root || (typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : null);
  if (!G) return;

  const SUGGESTER_STYLE_ID = 'ag-prism-suggester-css';
  const MODEL_DD_STYLE_ID = 'ag-prism-model-dd-css';
  const SUGGESTER_HTML_ATTR = 'data-ag-prism-suggester';
  const GHOST_ACTIVE_ATTR = 'data-ag-prism-ghost-active';
  const LEGACY_TRIGGER_SEL = '[data-testid="prism-suggest-trigger"], .ag-prism-suggest-btn';
  const OVERLAY_TESTID = 'prism-ghost-overlay';
  const ACCEPT_BTN_TESTID = 'prism-ghost-accept-btn';
  const BINDING_NAME = '__agPrismSuggestCall';
  const DEFAULT_RPC_TIMEOUT_MS = 18000;
  const AUTO_SETTLE_MS = 750;
  const MAX_SESSION_ENTRIES = 24;

  // 严格排除 /btw 侧边问答面板与子智能体对话页签
  const EXCLUDED_PANE_SEL =
    '[data-side-panel-focus-scope="true"], [data-testid="side-question-panel"], [data-testid="subagent-tab-conversation"]';

  const RUNNING_SEL =
    '[data-testid="input-cancel-button"], [data-testid="stop-button"], [data-testid="cancel-button"], [data-testid="agent-loading"], [data-testid="thinking-collapsible-trigger"][data-op-thought-state="streaming"]';

  // 浮层与阻断式交互面板选择器（严格排除周期表、模型菜单、全能菜单、右键菜单、侧栏弹窗、对话框与设置面板）
  const BLOCKING_UI_SEL = [
    '[data-testid="interaction-takeover-card"]',
    '[data-testid="slash-command-menu"]',
    '[id^="typeahead-item-"][role="option"]',
    'html[data-ag-pp-open="1"]',
    '#ag-prism-periodic-picker-root',
    'html[data-ag-cs-model-menu]',
    '[data-testid="model-selector-panel"]',
    '.ag-omni-menu',
    '.ag-cs-ctx-menu',
    '.ag-prism-sidebar-modal',
    '[role="dialog"]',
    '#ag-cs-settings-sec',
  ].join(', ');

  const BLOCKING_CONTAINER_SEL = [
    '#ag-prism-periodic-picker-root',
    '[data-testid="model-selector-panel"]',
    '.ag-omni-menu',
    '.ag-cs-ctx-menu',
    '.ag-prism-sidebar-modal',
    '[role="dialog"]',
    '#ag-cs-settings-sec',
    '[data-testid="slash-command-menu"]',
    '[data-testid="interaction-takeover-card"]',
  ].join(', ');

  const NO_TR_ATTRS = [
    ['translate', 'no'],
    ['data-no-translate', 'true'],
    ['data-ag-localization-skip', 'true'],
    ['data-agy-no-translate', 'true'],
    ['data-antigravity-zh-skip', '1'],
    ['data-ag-no-i18n', ''],
  ];

  // 完整 8 语无障碍标签（去 yue，en/es/fr/de 严格 0 CJK）
  const ARIA_LABELS = {
    'zh-CN': { accept: '使用建议的提示词' },
    'zh-TW': { accept: '使用建議的提示詞' },
    en: { accept: 'Use suggested prompt' },
    ja: { accept: '提案されたプロンプトを使用' },
    ko: { accept: '추천 프롬프트 사용' },
    es: { accept: 'Usar sugerencia de prompt' },
    fr: { accept: 'Utiliser la suggestion de prompt' },
    de: { accept: 'Vorgeschlagenen Prompt verwenden' },
  };

  // 运行时高频幽灵建议样式：严格纯 ASCII、0 :has()、行高对齐主输入框 22px，仅在 enabled === true 时注入
  const SUGGESTER_CSS = [
    '[data-ag-prism-ghost-active="1"]{position:relative !important;min-height:var(--ag-prism-ghost-min-h,40px);}',
    '[data-ag-prism-ghost-active="1"]>p,[data-ag-prism-ghost-active="1"]>[data-ag-cs-placeholder]{opacity:0 !important;visibility:hidden !important;}',
    '.ag-prism-ghost-overlay{position:absolute;left:8px;right:8px;top:6px;z-index:2;pointer-events:none;user-select:none;font-size:14px;line-height:22px;white-space:pre-wrap;word-break:break-word;max-height:92px;overflow:hidden;}',
    '.ag-prism-ghost-text{color:var(--foreground);opacity:0.52;}',
    '.ag-prism-ghost-tab-btn{pointer-events:auto;display:inline-flex;align-items:center;margin-left:8px;padding:0;border:none;background:transparent;cursor:pointer;vertical-align:1px;outline:none;}',
    '.ag-prism-ghost-kbd{display:inline-flex;align-items:center;gap:3px;padding:1px 6px;border-radius:5px;border:1px solid var(--ag-cs-border-1,rgba(128,128,128,0.28));background:var(--ag-cs-pill-bg,rgba(128,128,128,0.06));font-family:inherit;font-size:11.5px;font-weight:500;line-height:1.45;color:var(--muted-foreground,rgba(128,128,128,0.88));transition:color 120ms ease,border-color 120ms ease,background-color 120ms ease;}',
    '.ag-prism-ghost-tab-btn:hover .ag-prism-ghost-kbd{color:var(--foreground);border-color:var(--ag-cs-border-2,rgba(128,128,128,0.45));background:var(--secondary,rgba(128,128,128,0.12));}',
  ].join('\n');

  function markNoTrOwned(el) {
    if (el && typeof el.setAttribute === 'function') {
      for (let i = 0; i < NO_TR_ATTRS.length; i++) {
        el.setAttribute(NO_TR_ATTRS[i][0], NO_TR_ATTRS[i][1]);
      }
      el.setAttribute('data-ag-owned', '1');
    }
    return el;
  }

  // 对齐全仓 8 语规范（yue -> zh-CN，zh-HK/MO -> zh-TW，未知返回空字符串交由调用方兜底 en）
  function normalizeLang(raw) {
    const s = String(raw || '').trim().toLowerCase().replace(/_/g, '-');
    if (!s || s === 'auto') return '';
    if (s === 'yue' || s.startsWith('yue-') || s === 'zh-yue' || s.includes('cantonese')) return 'zh-CN';
    if (/^zh-(tw|hk|mo|hant)/.test(s) || s === 'tw' || s === 'hant') return 'zh-TW';
    if (/^zh(?:\b|-)/.test(s)) return 'zh-CN';
    if (/^(ja|jp)(?:\b|-)/.test(s) || s === 'japanese') return 'ja';
    if (/^(ko|kr)(?:\b|-)/.test(s) || s === 'korean') return 'ko';
    if (/^es(?:\b|-)/.test(s) || s === 'spanish') return 'es';
    if (/^fr(?:\b|-)/.test(s) || s === 'french') return 'fr';
    if (/^de(?:\b|-)/.test(s) || s === 'german') return 'de';
    if (/^en(?:\b|-)/.test(s) || s === 'english') return 'en';
    return '';
  }

  function resolveDocLang(doc) {
    try {
      const de = doc && doc.documentElement;
      if (de && typeof de.getAttribute === 'function') {
        const l1 = normalizeLang(de.getAttribute('data-ag-cs-lang'));
        if (l1) return l1;
        const l2 = normalizeLang(de.getAttribute('data-ag-prism-lang'));
        if (l2) return l2;
      }
      const navObj = G && 'navigator' in G ? G.navigator : typeof navigator !== 'undefined' ? navigator : null;
      const navLang = normalizeLang(navObj?.language || '');
      if (navLang) return navLang;
    } catch {}
    return 'en';
  }

  function createSuggesterBridge(win) {
    let seq = 0;
    const pending = new Map();
    let disposed = false;

    const resolve = (id, res) => {
      const numId = Number(id);
      const entry = pending.get(numId);
      if (!entry) return false;
      pending.delete(numId);
      clearTimeout(entry.timer);
      entry.resolve(res);
      return true;
    };

    const call = (action, payload = {}, timeoutMs = DEFAULT_RPC_TIMEOUT_MS) => {
      if (disposed) return Promise.resolve({ ok: false, reason: 'bridge-disposed' });
      const binding = win && typeof win[BINDING_NAME] === 'function' ? win[BINDING_NAME] : G[BINDING_NAME];
      if (typeof binding !== 'function') {
        return Promise.resolve({ ok: false, reason: 'bridge-offline' });
      }
      const id = ++seq;
      return new Promise((resFn) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          resFn({ ok: false, reason: 'rpc-timeout' });
        }, timeoutMs);
        pending.set(id, { resolve: resFn, timer });
        try {
          binding(JSON.stringify({ id, action, payload: payload || {} }));
        } catch (err) {
          clearTimeout(timer);
          pending.delete(id);
          resFn({ ok: false, reason: 'rpc-throw', error: String(err && err.message ? err.message : err) });
        }
      });
    };

    const dispose = () => {
      disposed = true;
      for (const [, entry] of pending.entries()) {
        clearTimeout(entry.timer);
        try {
          entry.resolve({ ok: false, reason: 'bridge-disposed' });
        } catch {}
      }
      pending.clear();
    };

    return { call, resolve, dispose, isDisposed: () => disposed };
  }

  function isVisibleNode(el) {
    if (!el || el.hidden === true || el.isConnected === false) return false;
    const st = el.style;
    if (st && (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0')) return false;
    if (typeof el.closest === 'function' && el.closest('[hidden], .hidden')) return false;
    if (typeof el.checkVisibility === 'function' && !el.checkVisibility()) return false;
    return true;
  }

  function isExcludedPaneNode(el) {
    return Boolean(el && typeof el.closest === 'function' && el.closest(EXCLUDED_PANE_SEL));
  }

  function isInBlockingContainer(el) {
    return Boolean(el && typeof el.closest === 'function' && el.closest(BLOCKING_CONTAINER_SEL));
  }

  // 解析当前可见的主对话容器及其唯一 cascadeId
  function getActiveMainCascade(doc) {
    if (!doc || typeof doc.querySelectorAll !== 'function') {
      return { view: null, composerRoot: null, cascadeId: '', editor: null };
    }
    const views = doc.querySelectorAll('[data-testid="conversation-view"]');
    let activeView = null;
    for (let i = 0; i < views.length; i++) {
      const v = views[i];
      if (isExcludedPaneNode(v)) continue;
      if (isVisibleNode(v)) {
        activeView = v;
        break;
      }
    }

    const findEditorIn = (rootEl) => {
      if (!rootEl || typeof rootEl.querySelectorAll !== 'function') return null;
      const candidates = rootEl.querySelectorAll(
        '.surface-composer [data-lexical-editor="true"], .surface-composer [contenteditable="true"], [data-testid="agent-input-box"] [contenteditable="true"], .surface-composer textarea'
      );
      for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        if (isExcludedPaneNode(c)) continue;
        if (isVisibleNode(c)) return c;
      }
      return null;
    };

    const editor = findEditorIn(activeView) || findEditorIn(doc.body || doc.documentElement);
    const composerRoot = editor?.closest?.('.surface-composer, [data-testid="agent-input-box"]') || null;

    const cascadeHost =
      (activeView &&
        (activeView.getAttribute?.('data-cascade-id')
          ? activeView
          : activeView.closest?.('[data-cascade-id]'))) ||
      (editor && editor.closest?.('[data-cascade-id]')) ||
      null;
    const cascadeId = String(cascadeHost?.getAttribute?.('data-cascade-id') || (activeView ? 'default-main' : '')).trim();

    return { view: activeView, composerRoot, cascadeId, editor };
  }

  function extractCleanNodeText(node) {
    if (!node) return '';
    const SKIP_SEL =
      '[data-testid="worked-for-collapsible"], [data-testid="tool-group-collapsible"], [data-testid="changed-files-card"], [data-testid="user-message-actions"], [data-testid="step-plan"], .ag-prism-thought-overlay, .ag-prism-thought-raw-toggle, button, script, style, svg, [aria-hidden="true"]';

    const walk = (n) => {
      if (!n) return '';
      if (n.nodeType === 3) return n.nodeValue || '';
      if (n.nodeType !== 1) return '';
      if (typeof n.matches === 'function') {
        try {
          if (n.matches(SKIP_SEL)) return '';
        } catch {}
      }
      const tag = String(n.tagName || '').toUpperCase();
      if (tag === 'BR') return '\n';
      let acc = '';
      for (let c = n.firstChild; c; c = c.nextSibling) {
        acc += walk(c);
      }
      if (/^(?:P|DIV|LI|PRE|H[1-6]|BLOCKQUOTE|SECTION|ARTICLE)$/.test(tag)) {
        return acc + '\n';
      }
      return acc;
    };

    return walk(node)
      .replace(/^(?:Agent said|You said)\s*\n+/i, '')
      .replace(/^Worked for [^\n]+\n+/i, '')
      .replace(/^(?:Agent working|Running[^\n]*)\s*\n*/gim, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function extractTurnsFromView(viewEl) {
    if (!viewEl || typeof viewEl.querySelectorAll !== 'function') return [];
    const rawNodes = Array.from(
      viewEl.querySelectorAll(
        '[data-testid="user-message-content"], [data-testid="user-message-bubble"], [data-testid="planner-response-text"], [data-testid="agent-response"]'
      )
    ).filter((el) => !isExcludedPaneNode(el));
    if (rawNodes.length === 0) return [];

    const filtered = rawNodes.filter((node) => {
      for (let i = 0; i < rawNodes.length; i++) {
        const other = rawNodes[i];
        if (other !== node && typeof node.contains === 'function' && node.contains(other)) {
          return false;
        }
      }
      return true;
    });

    const turns = [];
    for (const el of filtered) {
      const tid = String(el.getAttribute('data-testid') || '');
      const role = tid.startsWith('user-') ? 'user' : 'assistant';
      const text = extractCleanNodeText(el);
      if (!text) continue;
      const prev = turns[turns.length - 1];
      if (prev && prev.role === role) {
        prev.text = `${prev.text}\n\n${text}`.slice(-2400);
      } else {
        turns.push({ role, text });
      }
    }
    return turns.slice(-6);
  }

  function hasScopedIndicator(scopeEl, selector) {
    if (!scopeEl || typeof scopeEl.querySelectorAll !== 'function') return false;
    const nodes = scopeEl.querySelectorAll(selector);
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (isExcludedPaneNode(n)) continue;
      if (isVisibleNode(n)) return true;
    }
    return false;
  }

  // 检测周期表（Ch8）、模型菜单、全能菜单、右键菜单、弹窗、设置面板等阻断式浮层是否处于打开状态
  function hasBlockingUiOpen(doc) {
    if (!doc) return false;
    const de = doc.documentElement;
    if (de && typeof de.getAttribute === 'function') {
      if (de.getAttribute('data-ag-pp-open') === '1') return true;
      const modelMenuAttr = de.getAttribute('data-ag-cs-model-menu');
      if (modelMenuAttr !== null && modelMenuAttr !== '0' && modelMenuAttr !== 'off' && modelMenuAttr !== 'false') {
        return true;
      }
    }
    return hasScopedIndicator(doc, BLOCKING_UI_SEL);
  }

  function getComposerText(edEl) {
    if (!edEl) return '';
    if (typeof edEl.value === 'string') return edEl.value;
    if (typeof edEl.__lexicalTextContent === 'string') return edEl.__lexicalTextContent;
    return String(edEl.textContent || '');
  }

  function isComposerEmpty(edEl) {
    if (!edEl) return false;
    if (getComposerText(edEl).trim().length > 0) return false;
    if (typeof edEl.querySelector === 'function') {
      if (edEl.querySelector('[data-lexical-ghost-text], .lexical-ghost-text')) return false;
    }
    return true;
  }

  function insertTextIntoComposer(doc, edEl, text) {
    if (!edEl || !text) return false;
    try {
      edEl.focus?.();
    } catch {}

    if (typeof edEl.value === 'string') {
      edEl.value = text;
      try {
        edEl.selectionStart = edEl.selectionEnd = text.length;
      } catch {}
      try {
        edEl.dispatchEvent(new Event('input', { bubbles: true }));
      } catch {}
      return true;
    }

    try {
      const lex = edEl.__lexicalEditor;
      if (lex && lex._commands && typeof lex._commands.keys === 'function' && typeof lex.dispatchCommand === 'function') {
        try {
          lex.focus?.();
        } catch {}
        for (const cmdKey of lex._commands.keys()) {
          if (cmdKey && cmdKey.type === 'CONTROLLED_TEXT_INSERTION_COMMAND') {
            lex.dispatchCommand(cmdKey, text);
            return true;
          }
        }
      }
    } catch {}

    try {
      if (doc && typeof doc.execCommand === 'function') {
        if (doc.execCommand('insertText', false, text)) {
          return true;
        }
      }
    } catch {}

    try {
      edEl.textContent = text;
      const win = doc?.defaultView || G;
      const EvCtor = win?.InputEvent || win?.Event;
      if (typeof EvCtor === 'function') {
        edEl.dispatchEvent(new EvCtor('input', { bubbles: true, data: text, inputType: 'insertText' }));
      }
      return true;
    } catch {}
    return false;
  }

  function createPromptSuggesterRuntime(env = {}) {
    const win = env.window || G;
    const doc = env.document || (win && win.document) || null;
    if (!doc) return null;

    const bridge = createSuggesterBridge(win);
    try {
      win.__agPrismSuggesterBridge = bridge;
      win.__agPrismSuggesterResolve = bridge.resolve;
    } catch {}
    try {
      G.__agPrismSuggesterBridge = bridge;
      G.__agPrismSuggesterResolve = bridge.resolve;
    } catch {}

    const nowMs =
      typeof env.now === 'function'
        ? env.now
        : () => (win && win.Date && typeof win.Date.now === 'function' ? win.Date.now() : Date.now());
    const computeTurnSig = (turns) =>
      turns.map((t) => `${t.role}:${t.text.length}:${t.text.slice(-48)}`).join('|');

    let destroyed = false;
    let runtimeActive = false;
    let config = { enabled: false, ttlMinutes: 15 };
    let backendMeta = { aiReady: false, engine: 'unconfigured', profileName: '', model: '' };
    let reqCounter = 0;
    let acceptingNow = false;
    let mutObserver = null;
    let mountRaf = 0;
    let mountRafUsesTimeout = false;

    // 按 cascadeId 隔离的内存态存储
    const sessionStore = new Map();
    const runningByCascade = new Map();
    const sidebarRunningByCascade = new Map();
    const bgCompletedAtByCascade = new Map();
    const inflightByCascade = new Map();
    let currentCascadeId = '';
    let settleTimer = null;
    let settleCascadeId = '';
    let settleCompletedAt = 0;
    let ttlExpiryTimer = null;
    let composerSyncTimer = null;
    let isComposing = false;
    let suppressUntilMs = 0;

    const getTtlMs = () => {
      const m = Number(config.ttlMinutes);
      return Math.max(60000, (Number.isFinite(m) && m > 0 ? m : 15) * 60 * 1000);
    };

    const isSidebarRowRunning = (row) => {
      if (!row) return false;
      if (row.getAttribute?.('data-ag-cs-row-running') === '1') return true;
      if (row.querySelector?.('[data-testid="status-loading-spinner"], .lucide-square, .lucide-circle-stop')) {
        return true;
      }
      const btns = row.querySelectorAll?.('button, [role="button"]') || [];
      for (let i = 0; i < btns.length; i++) {
        const b = btns[i];
        const tid = String(b.getAttribute?.('data-testid') || '');
        const lbl = String(b.getAttribute?.('aria-label') || b.getAttribute?.('title') || '');
        if (/(?:stop|cancel)/i.test(tid) || /(?:stop|cancel|停止|取消)/i.test(lbl)) return true;
      }
      return false;
    };

    const scanSidebarBackgroundCompletions = (activeCid) => {
      if (!doc || typeof doc.querySelectorAll !== 'function') return;
      const rows = doc.querySelectorAll('[data-testid="conversation-row-sidebar"]');
      const now = nowMs();
      const ttlMs = getTtlMs();
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rawCid = String(row.getAttribute?.('data-cascade-id') || '').trim();
        if (!rawCid) continue;
        const rowRunning = isSidebarRowRunning(row);
        const wasRowRunning = Boolean(sidebarRunningByCascade.get(rawCid));
        sidebarRunningByCascade.set(rawCid, rowRunning);
        if (rowRunning) {
          bgCompletedAtByCascade.delete(rawCid);
        } else if (wasRowRunning && rawCid !== activeCid) {
          bgCompletedAtByCascade.set(rawCid, now);
        }
      }
      for (const [k, ts] of bgCompletedAtByCascade.entries()) {
        if (now - ts > ttlMs) bgCompletedAtByCascade.delete(k);
      }
    };

    const findSidebarRowForCascade = (cid) => {
      if (!cid || !doc || typeof doc.querySelectorAll !== 'function') return null;
      const rows = doc.querySelectorAll('[data-testid="conversation-row-sidebar"]');
      for (let i = 0; i < rows.length; i++) {
        if (String(rows[i].getAttribute?.('data-cascade-id') || '').trim() === cid) {
          return rows[i];
        }
      }
      return null;
    };

    const hasComposerStopButton = (composerEl) => {
      if (!composerEl || typeof composerEl.querySelectorAll !== 'function') return false;
      if (composerEl.querySelector?.('.lucide-square, .lucide-circle-stop')) return true;
      const btns = composerEl.querySelectorAll('button, [role="button"]');
      for (let i = 0; i < btns.length; i++) {
        const b = btns[i];
        if (!isVisibleNode(b)) continue;
        const tid = String(b.getAttribute?.('data-testid') || '').trim();
        const lbl = String(b.getAttribute?.('aria-label') || b.getAttribute?.('title') || '').trim();
        if (/取消置顶|取消固定|unpin|\b(?:pin|menu|more|options|delete|archive|rename|close|dismiss|voice|context)\b/i.test(`${tid} ${lbl}`)) {
          continue;
        }
        if (/(?:^|[^a-z])(?:stop|cancel|abort)(?:[^a-z]|$)/i.test(tid) || /(?:^|\b)(?:stop|cancel|abort)(?:\b|$)|停止|取消|中止/i.test(lbl)) {
          return true;
        }
      }
      return false;
    };

    const isSnapRunning = (snap) => {
      if (!snap) return false;
      if (hasScopedIndicator(snap.view, RUNNING_SEL) || hasScopedIndicator(snap.composerRoot, RUNNING_SEL)) {
        return true;
      }
      if (hasComposerStopButton(snap.composerRoot)) {
        return true;
      }
      if (snap.cascadeId) {
        const sbRow = findSidebarRowForCascade(snap.cascadeId);
        if (sbRow && isSidebarRowRunning(sbRow)) return true;
      }
      return false;
    };

    const touchSessionEntry = (cascadeId, patch) => {
      if (!cascadeId) return null;
      const prev = sessionStore.get(cascadeId) || {
        turnSig: '',
        suggestion: '',
        dismissed: false,
        sampledSig: '',
        createdAt: 0,
      };
      const next = { ...prev, ...patch };
      sessionStore.delete(cascadeId);
      sessionStore.set(cascadeId, next);
      while (sessionStore.size > MAX_SESSION_ENTRIES) {
        const oldest = sessionStore.keys().next().value;
        sessionStore.delete(oldest);
      }
      return next;
    };

    const listeners = [];
    const on = (target, type, fn, opts) => {
      if (!target || typeof target.addEventListener !== 'function') return;
      target.addEventListener(type, fn, opts);
      listeners.push(() => {
        try {
          target.removeEventListener(type, fn, opts);
        } catch {}
      });
    };

    const getAria = () => {
      const lang = resolveDocLang(doc);
      return ARIA_LABELS[lang] || ARIA_LABELS.en;
    };

    const removeLegacyButtons = () => {
      try {
        doc.querySelectorAll?.(LEGACY_TRIGGER_SEL)?.forEach?.((b) => b.remove());
      } catch {}
    };

    const ensureStyle = () => {
      if (destroyed || !config.enabled) return;
      let st = doc.getElementById(SUGGESTER_STYLE_ID);
      if (!st) {
        st = doc.createElement('style');
        st.id = SUGGESTER_STYLE_ID;
        markNoTrOwned(st);
        st.textContent = SUGGESTER_CSS;
        (doc.head || doc.documentElement)?.appendChild(st);
      }
    };

    const cancelMountRaf = () => {
      if (!mountRaf) return;
      const id = mountRaf;
      const isTimeout = mountRafUsesTimeout;
      mountRaf = 0;
      mountRafUsesTimeout = false;
      try {
        if (!isTimeout && typeof win?.cancelAnimationFrame === 'function') {
          win.cancelAnimationFrame(id);
        } else {
          clearTimeout(id);
        }
      } catch {
        try {
          clearTimeout(id);
        } catch {}
      }
    };

    const clearTtlTimer = () => {
      if (ttlExpiryTimer) {
        clearTimeout(ttlExpiryTimer);
        ttlExpiryTimer = null;
      }
    };

    const clearComposerSyncTimer = () => {
      if (composerSyncTimer) {
        clearTimeout(composerSyncTimer);
        composerSyncTimer = null;
      }
    };

    const scheduleComposerOverlaySync = (delayMs = 20) => {
      clearComposerSyncTimer();
      composerSyncTimer = setTimeout(() => {
        composerSyncTimer = null;
        if (!destroyed && config.enabled) {
          syncOverlayForActiveCascade();
        }
      }, delayMs);
      if (composerSyncTimer && typeof composerSyncTimer.unref === 'function') composerSyncTimer.unref();
    };

    const clearSettleTimer = () => {
      if (settleTimer) {
        clearTimeout(settleTimer);
        settleTimer = null;
      }
      settleCascadeId = '';
      settleCompletedAt = 0;
    };

    const getCaretHost = (edEl) => {
      if (!edEl) return null;
      return edEl.closest?.('[data-ag-cs-caret-host]') || edEl.parentElement || null;
    };

    const removeOverlayDom = () => {
      if (!doc.querySelectorAll) return;
      doc.querySelectorAll(`[data-testid="${OVERLAY_TESTID}"]`).forEach((n) => n.remove());
      doc.querySelectorAll(`[${GHOST_ACTIVE_ATTR}]`).forEach((el) => {
        el.removeAttribute(GHOST_ACTIVE_ATTR);
        el.style?.removeProperty?.('--ag-prism-ghost-min-h');
      });
    };

    // 仅解析严格属于当前可见 cascadeId 且对应最新轮次的建议
    const getOfferedSuggestionForActiveCascade = () => {
      if (destroyed || !config.enabled || isComposing) return null;
      if (suppressUntilMs > 0 && nowMs() < suppressUntilMs) return null;
      const snap = getActiveMainCascade(doc);
      if (!snap.cascadeId || !snap.editor || !snap.view) return null;
      if (isSnapRunning(snap) || hasBlockingUiOpen(doc)) {
        return null;
      }
      if (!isComposerEmpty(snap.editor)) return null;
      const entry = sessionStore.get(snap.cascadeId);
      if (!entry || entry.dismissed || !entry.suggestion || !entry.turnSig) return null;
      const ttlMs = getTtlMs();
      const now = nowMs();
      if (entry.createdAt > 0 && now - entry.createdAt > ttlMs) {
        touchSessionEntry(snap.cascadeId, { suggestion: '', turnSig: '', createdAt: 0 });
        return null;
      }
      const curTurns = extractTurnsFromView(snap.view);
      if (curTurns.length === 0 || curTurns[curTurns.length - 1].role !== 'assistant') return null;
      const curSig = computeTurnSig(curTurns);
      if (curSig !== entry.turnSig) return null;
      const remainMs = entry.createdAt > 0 ? Math.max(0, ttlMs - (now - entry.createdAt)) : ttlMs;
      return { ...snap, suggestion: entry.suggestion, turnSig: entry.turnSig, remainMs };
    };

    const syncOverlayForActiveCascade = () => {
      clearTtlTimer();
      const offered = getOfferedSuggestionForActiveCascade();
      if (!offered) {
        removeOverlayDom();
        return false;
      }
      const host = getCaretHost(offered.editor);
      if (!host) {
        removeOverlayDom();
        return false;
      }
      ttlExpiryTimer = setTimeout(() => {
        ttlExpiryTimer = null;
        if (!destroyed && config.enabled) syncOverlayForActiveCascade();
      }, Math.min(2147483600, offered.remainMs + 60));
      if (ttlExpiryTimer && typeof ttlExpiryTimer.unref === 'function') ttlExpiryTimer.unref();

      // 清除挂载在非当前宿主上的残留浮层
      doc.querySelectorAll?.(`[data-testid="${OVERLAY_TESTID}"]`)?.forEach?.((n) => {
        if (n.parentElement !== host) n.remove();
      });

      ensureStyle();
      let overlay = host.querySelector?.(`[data-testid="${OVERLAY_TESTID}"]`);
      if (!overlay) {
        overlay = doc.createElement('div');
        overlay.className = 'ag-prism-ghost-overlay';
        overlay.setAttribute('data-testid', OVERLAY_TESTID);
        markNoTrOwned(overlay);
        host.appendChild(overlay);
      }
      overlay.setAttribute('data-cascade-owner', offered.cascadeId);

      while (overlay.firstChild) overlay.removeChild(overlay.firstChild);

      const textSpan = doc.createElement('span');
      textSpan.className = 'ag-prism-ghost-text';
      textSpan.setAttribute('aria-hidden', 'true');
      textSpan.textContent = offered.suggestion;
      overlay.appendChild(textSpan);

      const tabBtn = doc.createElement('button');
      tabBtn.type = 'button';
      tabBtn.tabIndex = -1;
      tabBtn.className = 'ag-prism-ghost-tab-btn';
      tabBtn.setAttribute('data-testid', ACCEPT_BTN_TESTID);
      tabBtn.setAttribute('aria-label', getAria().accept);
      tabBtn.addEventListener('pointerdown', (ev) => ev.preventDefault());
      tabBtn.addEventListener('mousedown', (ev) => ev.preventDefault());
      tabBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        acceptCurrentGhost();
      });

      const kbd = doc.createElement('kbd');
      kbd.className = 'ag-prism-ghost-kbd';
      kbd.textContent = '\u21e5 Tab';
      tabBtn.appendChild(kbd);
      overlay.appendChild(tabBtn);

      host.setAttribute(GHOST_ACTIVE_ATTR, '1');
      try {
        const neededH = Math.min(104, Math.max(40, (overlay.offsetHeight || 22) + 14));
        host.style?.setProperty?.('--ag-prism-ghost-min-h', `${neededH}px`);
      } catch {}
      return true;
    };

    const dismissGhost = (opts = {}) => {
      const snap = getActiveMainCascade(doc);
      const cid = opts.cascadeId || snap.cascadeId || currentCascadeId;
      if (cid) {
        const rid = inflightByCascade.get(cid);
        if (rid && !opts.fromCancel) {
          inflightByCascade.delete(cid);
          void bridge.call('cancel', { requestId: rid }, 2500).catch(() => {});
        }
        const existing = sessionStore.get(cid);
        if (existing) {
          if (opts.markDismissed) {
            touchSessionEntry(cid, { dismissed: true });
          } else if (!opts.keepSuggestion) {
            touchSessionEntry(cid, { suggestion: '', turnSig: '', dismissed: false });
          }
        }
      }
      removeOverlayDom();
    };

    const acceptCurrentGhost = () => {
      if (acceptingNow) return false;
      const offered = getOfferedSuggestionForActiveCascade();
      if (!offered) {
        removeOverlayDom();
        return false;
      }
      acceptingNow = true;
      try {
        // 保留在有效 TTL 内的缓存建议，用户若清空未发送草稿可无损恢复
        suppressUntilMs = nowMs() + 80;
        removeOverlayDom();
        return insertTextIntoComposer(doc, offered.editor, offered.suggestion);
      } finally {
        acceptingNow = false;
      }
    };

    const triggerSuggest = async (opts = {}) => {
      if (destroyed || !config.enabled) return { ok: false, reason: 'disabled' };
      const snap = getActiveMainCascade(doc);
      const targetCascadeId = snap.cascadeId;
      if (!targetCascadeId || !snap.view || !snap.editor) {
        return { ok: false, reason: 'no-active-cascade' };
      }
      if (isSnapRunning(snap) || hasBlockingUiOpen(doc)) {
        return { ok: false, reason: 'agent-running' };
      }
      if (inflightByCascade.has(targetCascadeId)) {
        return { ok: false, reason: 'already-loading' };
      }
      if (!isComposerEmpty(snap.editor)) {
        return { ok: false, reason: 'composer-not-empty' };
      }

      const turns = extractTurnsFromView(snap.view);
      if (turns.length === 0 || turns[turns.length - 1].role !== 'assistant') {
        return { ok: false, reason: 'no-completed-assistant-turn' };
      }

      const sigNow = computeTurnSig(turns);
      const forceRefresh = Boolean(opts.forceRefresh);
      const existing = sessionStore.get(targetCascadeId);

      if (!forceRefresh && existing && existing.turnSig === sigNow && existing.suggestion && !existing.dismissed) {
        syncOverlayForActiveCascade();
        return { ok: true, cached: true, suggestion: existing.suggestion };
      }

      touchSessionEntry(targetCascadeId, { sampledSig: sigNow });
      const requestId = `sg_${++reqCounter}_${Date.now().toString(36)}`;
      inflightByCascade.set(targetCascadeId, requestId);
      if (snap.cascadeId === targetCascadeId) removeOverlayDom();

      const res = await bridge.call(
        'suggest',
        {
          cascadeId: targetCascadeId,
          turns,
          lang: resolveDocLang(doc),
          forceRefresh,
          requestId,
        },
        DEFAULT_RPC_TIMEOUT_MS
      );

      if (destroyed || !config.enabled || inflightByCascade.get(targetCascadeId) !== requestId) {
        return { ok: false, cancelled: true };
      }
      inflightByCascade.delete(targetCascadeId);

      const single =
        typeof res?.suggestion === 'string' && res.suggestion.trim() ? res.suggestion.trim() : '';

      if (!res || !res.ok || !single) {
        touchSessionEntry(targetCascadeId, { suggestion: '', turnSig: '', dismissed: false });
        syncOverlayForActiveCascade();
        return { ok: false, error: res?.error || res?.reason || 'suggest-failed' };
      }

      // 严格落盘在目标 targetCascadeId + sigNow 下，切走后绝不串写到其他会话
      const originTs = Number(opts.completedAt) > 0 ? Number(opts.completedAt) : nowMs();
      touchSessionEntry(targetCascadeId, {
        turnSig: sigNow,
        suggestion: single,
        dismissed: false,
        sampledSig: sigNow,
        createdAt: originTs,
      });
      syncOverlayForActiveCascade();

      return {
        ok: true,
        cascadeId: targetCascadeId,
        suggestion: single,
        engine: res.engine,
        cached: Boolean(res.cached),
      };
    };

    // 校验当前键盘事件焦点是否允许触发 Tab / Escape 建议快捷键（杜绝劫持周期表、浮层与外部控件）
    const isFocusAllowedForShortcut = (target, offered) => {
      if (hasBlockingUiOpen(doc)) return false;
      const activeEl = doc.activeElement && doc.activeElement.nodeType === 1 ? doc.activeElement : null;
      const targetEl = target && target.nodeType === 1 ? target : null;
      const isNeutralTag = (el) => {
        if (!el) return true;
        const tag = String(el.tagName || '').toUpperCase();
        return tag === 'BODY' || tag === 'HTML';
      };

      const focusEl =
        targetEl && !isNeutralTag(targetEl)
          ? targetEl
          : activeEl && !isNeutralTag(activeEl)
          ? activeEl
          : targetEl || activeEl;

      if (!focusEl || isNeutralTag(focusEl)) return true;
      if (isExcludedPaneNode(focusEl) || isInBlockingContainer(focusEl)) return false;

      // 焦点直接位于主编辑器或其子节点
      if (offered?.editor && (focusEl === offered.editor || offered.editor.contains?.(focusEl))) {
        return true;
      }

      // 焦点在 .surface-composer 内部时，仅放行主编辑区或幽灵接受按钮，放过工具栏中的模型/发送等按钮
      if (typeof focusEl.closest === 'function' && focusEl.closest('.surface-composer')) {
        return Boolean(
          focusEl.closest(
            '[data-lexical-editor="true"], [contenteditable="true"], textarea, [data-testid="prism-ghost-accept-btn"]'
          )
        );
      }

      // 其他外部按钮、输入框、链接或可聚焦控件一律不劫持
      return false;
    };

    const isMainComposerTarget = (ev) => {
      const target = ev && ev.target;
      if (!target || isExcludedPaneNode(target)) return false;
      return Boolean(typeof target.closest === 'function' && target.closest('.surface-composer'));
    };

    const onKeyDown = (ev) => {
      if (destroyed || !config.enabled) return;
      const target = ev.target;
      if (isExcludedPaneNode(target) || isInBlockingContainer(target)) return;
      if (hasBlockingUiOpen(doc)) return;

      if (ev.key === 'Tab' && !ev.shiftKey && !ev.ctrlKey && !ev.altKey && !ev.metaKey) {
        const offered = getOfferedSuggestionForActiveCascade();
        if (offered && isFocusAllowedForShortcut(target, offered)) {
          ev.preventDefault();
          ev.stopPropagation();
          if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
          acceptCurrentGhost();
        }
        return;
      }

      if (ev.key === 'Escape') {
        const offered = getOfferedSuggestionForActiveCascade();
        if (offered && isFocusAllowedForShortcut(target, offered)) {
          ev.preventDefault();
          ev.stopPropagation();
          dismissGhost({ cascadeId: offered.cascadeId, markDismissed: true });
        }
      }
    };

    const onComposerBeforeEdit = (ev) => {
      if (acceptingNow || !isMainComposerTarget(ev)) return;
      removeOverlayDom();
      scheduleComposerOverlaySync(24);
    };

    const onComposerInput = (ev) => {
      if (acceptingNow || !isMainComposerTarget(ev)) return;
      if (isComposing) {
        removeOverlayDom();
        return;
      }
      const snap = getActiveMainCascade(doc);
      if (!snap.editor || !isComposerEmpty(snap.editor)) {
        removeOverlayDom();
      }
      scheduleComposerOverlaySync(16);
    };

    const onComposerCompositionStart = (ev) => {
      if (!isMainComposerTarget(ev)) return;
      isComposing = true;
      removeOverlayDom();
    };

    const onComposerCompositionEnd = (ev) => {
      if (!isMainComposerTarget(ev)) return;
      isComposing = false;
      scheduleComposerOverlaySync(20);
    };

    const onComposerKeyUp = (ev) => {
      if (acceptingNow || isComposing || !isMainComposerTarget(ev)) return;
      if (ev.key === 'Backspace' || ev.key === 'Delete' || ((ev.key === 'z' || ev.key === 'x') && (ev.ctrlKey || ev.metaKey))) {
        scheduleComposerOverlaySync(16);
      }
    };

    const scheduleSettleForCascade = (cid, delayMs, completedAtTs = 0, retriesLeft = 4) => {
      clearSettleTimer();
      settleCascadeId = cid;
      settleCompletedAt = completedAtTs > 0 ? completedAtTs : nowMs();
      settleTimer = setTimeout(() => {
        settleTimer = null;
        const targetCid = settleCascadeId;
        const targetCompletedAt = settleCompletedAt;
        settleCascadeId = '';
        settleCompletedAt = 0;
        if (destroyed || !config.enabled || !targetCid) return;
        if (nowMs() - targetCompletedAt > getTtlMs()) {
          bgCompletedAtByCascade.delete(targetCid);
          return;
        }
        const latestSnap = getActiveMainCascade(doc);
        if (latestSnap.cascadeId !== targetCid || !latestSnap.view || !latestSnap.editor) return;
        if (isSnapRunning(latestSnap) || hasBlockingUiOpen(doc)) {
          return;
        }
        if (!isComposerEmpty(latestSnap.editor)) {
          bgCompletedAtByCascade.delete(targetCid);
          return;
        }
        const turns = extractTurnsFromView(latestSnap.view);
        const hasAssistantTail = turns.length > 0 && turns[turns.length - 1].role === 'assistant';
        const sig = hasAssistantTail ? computeTurnSig(turns) : '';
        const prevEntry = sessionStore.get(targetCid);
        if (!hasAssistantTail || !sig || (prevEntry && prevEntry.sampledSig === sig)) {
          if (retriesLeft > 0) {
            scheduleSettleForCascade(targetCid, 360, targetCompletedAt, retriesLeft - 1);
          } else {
            bgCompletedAtByCascade.delete(targetCid);
          }
          return;
        }
        bgCompletedAtByCascade.delete(targetCid);
        void triggerSuggest({ fromAuto: true, completedAt: targetCompletedAt });
      }, delayMs);
    };

    const checkAgentStateTransition = () => {
      if (destroyed || !config.enabled) return;
      const snap = getActiveMainCascade(doc);
      const cid = snap.cascadeId;
      scanSidebarBackgroundCompletions(cid);

      if (!cid || !snap.view) {
        currentCascadeId = '';
        clearSettleTimer();
        clearTtlTimer();
        removeOverlayDom();
        return;
      }

      const runningNow = isSnapRunning(snap);

      // 会话切换检测
      if (cid !== currentCascadeId) {
        currentCascadeId = cid;
        clearSettleTimer();
        runningByCascade.set(cid, runningNow);

        // 检查该会话是否在后台刚完成且仍处于 ttlMinutes 有效窗口内
        const bgDoneAt = bgCompletedAtByCascade.get(cid) || 0;
        if (bgDoneAt > 0) {
          const ageMs = nowMs() - bgDoneAt;
          if (ageMs < 0 || ageMs > getTtlMs()) {
            bgCompletedAtByCascade.delete(cid);
          } else if (!runningNow && config.enabled) {
            syncOverlayForActiveCascade();
            scheduleSettleForCascade(cid, 320, bgDoneAt, 5);
            return;
          } else {
            syncOverlayForActiveCascade();
            return;
          }
        }

        if (!runningNow && !sessionStore.has(cid)) {
          // 刚打开的历史静止对话记录初始 sampledSig，绝不误触发预测
          const existingSig = computeTurnSig(extractTurnsFromView(snap.view));
          if (existingSig) {
            touchSessionEntry(cid, {
              turnSig: '',
              suggestion: '',
              dismissed: false,
              sampledSig: existingSig,
              createdAt: 0,
            });
          }
        }
        syncOverlayForActiveCascade();
        return;
      }

      const wasRunning = Boolean(runningByCascade.get(cid));
      runningByCascade.set(cid, runningNow);

      if (runningNow) {
        bgCompletedAtByCascade.delete(cid);
        if (sessionStore.has(cid)) {
          touchSessionEntry(cid, { suggestion: '', turnSig: '', dismissed: false });
        }
        if (settleCascadeId === cid) clearSettleTimer();
        const rid = inflightByCascade.get(cid);
        if (rid) {
          inflightByCascade.delete(cid);
          void bridge.call('cancel', { requestId: rid }, 2500).catch(() => {});
        }
        removeOverlayDom();
        return;
      }

      // 同一会话从运行态（true）过渡至完成态（false）
      if (wasRunning && !runningNow && config.enabled) {
        bgCompletedAtByCascade.delete(cid);
        scheduleSettleForCascade(cid, AUTO_SETTLE_MS, nowMs(), 4);
        return;
      }

      // 切回后台已完成会话后异步 DOM 水合补偿
      const pendingBgDoneAt = bgCompletedAtByCascade.get(cid) || 0;
      if (pendingBgDoneAt > 0 && config.enabled && !settleTimer && !inflightByCascade.has(cid)) {
        const ageMs = nowMs() - pendingBgDoneAt;
        if (ageMs >= 0 && ageMs <= getTtlMs()) {
          scheduleSettleForCascade(cid, 280, pendingBgDoneAt, 4);
          return;
        }
        bgCompletedAtByCascade.delete(cid);
      }

      // 历史静止对话异步水合时补登 sampledSig
      if (!sessionStore.has(cid) && !settleTimer && !inflightByCascade.has(cid)) {
        const existingSig = computeTurnSig(extractTurnsFromView(snap.view));
        if (existingSig) {
          touchSessionEntry(cid, {
            turnSig: '',
            suggestion: '',
            dismissed: false,
            sampledSig: existingSig,
            createdAt: 0,
          });
        }
      }

      syncOverlayForActiveCascade();
    };

    const scheduleMountCheck = () => {
      if (destroyed || !config.enabled || mountRaf) return;
      if (typeof win?.requestAnimationFrame === 'function') {
        mountRafUsesTimeout = false;
        mountRaf = win.requestAnimationFrame(() => {
          mountRaf = 0;
          checkAgentStateTransition();
        });
      } else {
        mountRafUsesTimeout = true;
        mountRaf = setTimeout(() => {
          mountRaf = 0;
          mountRafUsesTimeout = false;
          checkAgentStateTransition();
        }, 32);
      }
    };

    // 按需开启运行时监控：仅在 enabled === true 时挂载样式、事件监听与 MutationObserver
    const activateRuntime = () => {
      if (destroyed || runtimeActive) return;
      runtimeActive = true;
      ensureStyle();

      // 记录当前已打开会话的初始静态基线，避免刚开启时对历史回复误触发
      const initSnap = getActiveMainCascade(doc);
      currentCascadeId = initSnap.cascadeId;
      if (currentCascadeId) {
        const initRunning = isSnapRunning(initSnap);
        runningByCascade.set(currentCascadeId, initRunning);
        if (!initRunning && initSnap.view) {
          const initSig = computeTurnSig(extractTurnsFromView(initSnap.view));
          if (initSig) {
            touchSessionEntry(currentCascadeId, {
              turnSig: '',
              suggestion: '',
              dismissed: false,
              sampledSig: initSig,
              createdAt: 0,
            });
          }
        }
      }
      scanSidebarBackgroundCompletions(currentCascadeId);

      on(doc, 'keydown', onKeyDown, true);
      on(doc, 'beforeinput', onComposerBeforeEdit, true);
      on(doc, 'input', onComposerInput, true);
      on(doc, 'paste', onComposerBeforeEdit, true);
      on(doc, 'cut', onComposerBeforeEdit, true);
      on(doc, 'compositionstart', onComposerCompositionStart, true);
      on(doc, 'compositionend', onComposerCompositionEnd, true);
      on(doc, 'keyup', onComposerKeyUp, true);

      if (typeof win?.MutationObserver === 'function' && doc.documentElement) {
        const isHcPortal = (n) => {
          if (!n || n.nodeType !== 1 || n === doc.body || n === doc.documentElement) return false;
          const f = n.firstElementChild;
          if (n.hasAttribute?.('data-hover-card-popup') || f?.hasAttribute?.('data-hover-card-popup') || f?.firstElementChild?.hasAttribute?.('data-hover-card-popup')) return true;
          return Boolean(n.hasAttribute?.('data-base-ui-portal') && n.querySelector?.('[data-hover-card-popup]'));
        };
        const isSuggesterNoise = (m) => {
          const t = m?.target;
          const el = t && (t.nodeType === 1 ? t : t.parentElement);
          if (!el) return true;
          if (el.id === 'ag-prism-prompt-suggester-root' || el.hasAttribute?.('data-ag-prism-suggester-owned') || isHcPortal(el)) return true;
          if (m.type === 'childList' && el === doc.body) {
            const nodes = [...(m.addedNodes || []), ...(m.removedNodes || [])];
            if (nodes.length > 0 && nodes.every(isHcPortal)) return true;
          }
          if (typeof el.closest === 'function') {
            if (el.closest('[data-ag-prism-suggester-owned],[data-hover-card-popup],.toast-viewport')) return true;
            if (m.type === 'attributes' && m.attributeName === 'class') {
              const tid = el.getAttribute?.('data-testid') || '';
              if (tid !== 'conversation-view' && tid !== 'agent-input-box' && tid !== 'conversation-row-sidebar' && !el.hasAttribute?.('data-cascade-id') && !el.classList?.contains?.('agy-home')) {
                return true;
              }
            }
            if (m.type === 'childList' && el.closest('aside,[data-testid="sidebar-split"]>div:first-child,[data-testid="conversation-list-sidebar"],[data-testid="project-header"]')) {
              const nodes = [...(m.addedNodes || []), ...(m.removedNodes || [])];
              const touchesRowOrRun = nodes.some((n) => {
                if (!n || n.nodeType !== 1) return false;
                const ntid = n.getAttribute?.('data-testid') || '';
                if (ntid === 'conversation-row-sidebar' || ntid === 'status-loading-spinner' || n.hasAttribute?.('data-ag-cs-row-running')) return true;
                return Boolean(n.querySelector?.('[data-testid="conversation-row-sidebar"],[data-testid="status-loading-spinner"],[data-ag-cs-row-running]'));
              });
              if (!touchesRowOrRun) return true;
            }
            if (m.type === 'childList' && el.closest('[data-testid="autoscroll-viewport"]')) {
              const nodes = [...(m.addedNodes || []), ...(m.removedNodes || [])];
              const touchesState = nodes.some((n) => {
                if (!n || n.nodeType !== 1) return false;
                const ntid = n.getAttribute?.('data-testid') || '';
                if (ntid === 'stop-button' || ntid === 'cancel-button' || ntid === 'input-cancel-button' || ntid === 'agent-loading' || ntid === 'thinking-collapsible-trigger') return true;
                return Boolean(n.querySelector?.('[data-testid="stop-button"],[data-testid="cancel-button"],[data-testid="input-cancel-button"],[data-testid="agent-loading"],[data-testid="thinking-collapsible-trigger"]'));
              });
              if (!touchesState) return true;
            }
          }
          return false;
        };
        mutObserver = new win.MutationObserver((muts) => {
          if (destroyed || !config.enabled) return;
          for (let i = 0; i < muts.length; i++) {
            const m = muts[i];
            if (m.type === 'attributes' && m.target === doc.documentElement) {
              syncOverlayForActiveCascade();
              continue;
            }
            if ((m.type === 'childList' || m.type === 'attributes') && !isSuggesterNoise(m)) {
              scheduleMountCheck();
              break;
            }
          }
        });
        mutObserver.observe(doc.documentElement, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: [
            'data-cascade-id',
            'data-ag-cs-row-running',
            'data-ag-cs-lang',
            'data-ag-prism-lang',
            'data-ag-pp-open',
            'data-ag-cs-model-menu',
            'hidden',
            'class',
            'data-op-thought-state',
          ],
        });
      }
    };

    // 切回关闭态或销毁时彻底断开 Observer、解除 8 个捕获监听、清空全部运行时容器与定时器
    const deactivateRuntime = () => {
      runtimeActive = false;
      clearSettleTimer();
      clearTtlTimer();
      clearComposerSyncTimer();
      cancelMountRaf();
      isComposing = false;
      suppressUntilMs = 0;
      if (mutObserver) {
        try {
          mutObserver.disconnect();
        } catch {}
        mutObserver = null;
      }
      while (listeners.length) {
        const off = listeners.pop();
        try {
          off();
        } catch {}
      }
      for (const [, rid] of inflightByCascade.entries()) {
        void bridge.call('cancel', { requestId: rid }, 2000).catch(() => {});
      }
      inflightByCascade.clear();
      sessionStore.clear();
      runningByCascade.clear();
      sidebarRunningByCascade.clear();
      bgCompletedAtByCascade.clear();
      currentCascadeId = '';
      removeOverlayDom();
      doc.getElementById?.(SUGGESTER_STYLE_ID)?.remove?.();
      doc.documentElement?.removeAttribute?.(SUGGESTER_HTML_ATTR);
    };

    const applyConfig = (nextCfg = {}, nextBackend = null) => {
      if (destroyed) return;
      if (nextCfg && typeof nextCfg === 'object') {
        const nextTtl = Number(nextCfg.ttlMinutes);
        config = {
          enabled: nextCfg.enabled === undefined ? config.enabled : Boolean(nextCfg.enabled),
          ttlMinutes:
            Number.isFinite(nextTtl) && nextTtl > 0
              ? Math.max(1, Math.min(120, Math.round(nextTtl)))
              : config.ttlMinutes,
        };
      }
      if (nextBackend && typeof nextBackend === 'object') {
        backendMeta = { ...backendMeta, ...nextBackend };
      }
      removeLegacyButtons();
      const de = doc.documentElement;
      if (config.enabled) {
        activateRuntime();
        ensureStyle();
        if (de) de.setAttribute(SUGGESTER_HTML_ATTR, 'on');
        syncOverlayForActiveCascade();
      } else {
        deactivateRuntime();
      }
    };

    const refresh = async () => {
      const res = await bridge.call('get-config', {}, 6000);
      if (!destroyed && res && res.ok) {
        applyConfig(res.config, res.backend);
      }
      return res;
    };

    const sync = () => {
      removeLegacyButtons();
      if (config.enabled) {
        checkAgentStateTransition();
      }
      void refresh();
    };

    const destroy = () => {
      if (destroyed) return;
      destroyed = true;
      deactivateRuntime();
      removeLegacyButtons();
      doc.getElementById?.(SUGGESTER_STYLE_ID)?.remove?.();
      doc.getElementById?.(MODEL_DD_STYLE_ID)?.remove?.();
      doc.documentElement?.removeAttribute?.(SUGGESTER_HTML_ATTR);
      bridge.dispose();
    };

    const getDebugState = () => {
      const offered = getOfferedSuggestionForActiveCascade();
      return {
        destroyed,
        active: runtimeActive,
        observerActive: Boolean(mutObserver),
        listenerCount: listeners.length,
        config: { ...config },
        backend: { ...backendMeta },
        currentCascadeId,
        ghostActive: Boolean(offered),
        loading: Boolean(currentCascadeId && inflightByCascade.has(currentCascadeId)),
        suggestion: offered ? offered.suggestion : '',
        trackedSessions: sessionStore.size,
      };
    };

    // 默认关闭态：严禁注入运行时样式、严禁启动 MutationObserver、严禁绑定捕获监听，仅拉取配置
    removeLegacyButtons();
    void refresh();

    return {
      sync,
      refresh,
      applyConfig,
      triggerSuggest,
      checkAgentStateTransition,
      acceptCurrentGhost,
      dismissGhost,
      extractConversationTurns: () => {
        const snap = getActiveMainCascade(doc);
        return snap.view ? extractTurnsFromView(snap.view) : [];
      },
      getDebugState,
      destroy,
    };
  }

  G.__agPrismSuggesterFactory = createPromptSuggesterRuntime;
  if (typeof window !== 'undefined' && window) {
    window.__agPrismSuggesterFactory = createPromptSuggesterRuntime;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);

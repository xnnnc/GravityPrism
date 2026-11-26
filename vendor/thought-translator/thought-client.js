// Obsidian Prism — Unified Thought Translator & Polisher Client Runtime (v1.0.8-beta.3 Upgraded)
// Incorporates proven anti-jank & anti-retranslate safeguards + v1.0.1 workbench capabilities:
// 1. Rendered-signature idempotence (`data-op-zh-sig` + `data-raw-zh`) -> 0 redundant DOM rebuilds on cache hit;
// 2. Global `inflightBySig` flight pool across React panel remounts + pre-commit source-hash verification -> 0 duplicate requests & 0 misplacement;
// 3. Monotonic `minHeight` lock during streaming + `scrollTop` preservation + non-regressive pending state -> 0 height collapse jank;
// 4. Safe `file://` source path & `#L` line-anchor pill restoration delegating clicks to host native anchors (strict `file://` whitelist, 0 XSS);
// 5. Explicit `machine-fallback` badge, viewport-first priority scheduling + cancel-pending, per-block retry/retranslate, bilingual stacked view & dual cache management.

(function (root) {
  'use strict';
  const W = root || (typeof window !== 'undefined' ? window : globalThis);
  if (!W) return;

  const OWNER_ID = 'obsidian-prism-thought';
  const LOCAL_CACHE_KEY = 'ag_prism_thought_zh_cache_v1';
  const VIEW_MODE_STORAGE_KEY = 'ag_prism_thought_view_mode_v1';
  const STYLE_TAG_KEY = 'ag_prism_thought_style_tag_v1';
  const MEM_CACHE_LIMIT = 1500;
  const STORAGE_CACHE_LIMIT = 80;
  const MAX_STORAGE_TOTAL_CHARS = 120000;
  const MAX_STORAGE_ENTRY_CHARS = 32000;
  const STREAM_FLUSH_MS = 48;
  const CHUNK_FADE_TTL_MS = 350;
  const MAX_LIVE_CHUNKS = 10;
  const FINISH_GATE_MS = 450;
  const QUIET_GATE_MS = 900;

  const BLOCK_TAGS = new Set('P,DIV,LI,UL,OL,PRE,BLOCKQUOTE,H1,H2,H3,H4,H5,H6,TR,HR,SECTION,ARTICLE'.split(','));
  const SKIP_TAGS = new Set('SCRIPT,STYLE,BUTTON,SVG,NOSCRIPT'.split(','));

  let currentMode = 'off';
  let triggerTiming = 'preload';
  let currentViewMode = 'immersive';
  let currentLang = '';
  let translateToolSummaries = false;
  let translateTitles = false;
  let hasExplicitToolSummaries = false;
  let hasExplicitTitles = false;
  let activeStyleTag = '';
  let storedCount = 0;
  let cacheDirty = false;
  let cacheWarmed = false;
  let localCacheLoaded = false;
  let viewModeLoaded = false;
  let hasExplicitHostView = false;
  let scrollBound = false;
  let visBound = false;
  let scrollTimer = null;
  let scanTimer = null;
  let streamingWatchTimer = null;
  let cachedConvRoot = null;
  let reqSeq = 0;

  const SEL_TRIGGER = 'button[data-testid="thinking-collapsible-trigger"]';
  const SEL_OVERLAY = '.ag-prism-thought-overlay[data-op-thought="1"]';
  const SEL_TOOL_TRIGGERS = '[data-testid="tool-group-collapsible"], [data-testid="worked-for-collapsible"]';
  const SEL_TOOL_ROWS = '[data-testid="tool-call-row"], [data-ag-tool-row="1"]';
  const SEL_TITLE_CONTAINERS =
    '[data-testid="conversation-row-sidebar"], [data-testid="conversation-row-history"], [data-testid="breadcrumb-segment"]';
  const A_EXP = 'aria-expanded';
  const A_RDY = 'data-op-zh-ready';
  const A_PND = 'data-op-zh-pending';
  const A_FLD = 'data-op-zh-failed';
  const A_FBK = 'data-op-zh-fallback';
  const A_SIG = 'data-op-zh-sig';
  const A_SRW = 'data-op-show-raw';
  const A_MRW = 'data-op-manual-raw';
  const A_BIL = 'data-op-bilingual';
  const A_PNL = 'data-op-thought-panel';
  const C_OV = 'ag-prism-thought-overlay';
  const C_BD = 'ag-prism-thought-body';
  const C_FB = 'ag-prism-thought-fallback-badge';
  const C_RB = 'ag-prism-thought-retranslate-btn';
  const C_TB = 'ag-prism-thought-raw-toggle';
  const C_EB = 'ag-prism-thought-error-bar';
  const C_ET = 'ag-prism-thought-error-text';
  const C_RT = 'ag-prism-thought-retry-btn';
  const C_PH = 'ag-prism-thought-pending-hint';
  const C_CK = 'ag-prism-thought-chunk';
  const C_TRG = 'ag-prism-thought-trigger-badge';
  const C_TRC = 'ag-prism-thought-trunc-badge';

  const MAX_SAFE_THOUGHT_CHARS = 48000;
  const SAFE_TRUNCATE_BUDGET = 46000;
  const INFLIGHT_TTL_MS = 185000;

  // Indices:
  // 0:raw, 1:hideRaw, 2:fallback, 3:fallbackTitle, 4:retranslate, 5:errGeneric, 6:retryBtn,
  // 7:pendingMachine, 8:pendingAi, 9:streaming, 10:settling,
  // 11:errProxy, 12:errRateLimit, 13:errAuth, 14:errTimeout, 15:errOffline,
  // 16:badgeProxy, 17:badgeRateLimit, 18:badgeAuth, 19:badgeTimeout, 20:badgeOffline, 21:badgeGeneric,
  // 22:truncFmt ({0}k/{1}k)
  const ZH_TW_PACK =
    '原文|收起原文|機翻降級|AI 未就緒，已降級機翻|重新轉譯|轉譯未完成|↻ 重試|機翻中…|AI 轉譯中…|思考輸出中…|收束中…|代理或網路不可達|請求限流冷卻中|金鑰或權限異常|轉譯逾時|後台服務未連線|代理失敗 · 重試|限流冷卻 · 重試|驗證失敗 · 重試|逾時 · 重試|服務離線 · 重試|轉譯失敗 · 重試|已安全分段譯前 {0}k 字（共 {1}k）'.split(
      '|'
    );
  const CLIENT_I18N = {
    'zh-CN':
      '原文|收起原文|机翻降级|AI 未就绪，已降级机翻|重新转译|转译未完成|↻ 重试|机翻中…|AI 转译中…|思考输出中…|收束中…|代理或网络不可达|请求限流冷却中|密钥或权限异常|转译超时|后台服务未连接|代理失败 · 重试|限流冷却 · 重试|鉴权失败 · 重试|超时 · 重试|服务离线 · 重试|转译失败 · 重试|已安全分段译前 {0}k 字（共 {1}k）'.split(
        '|'
      ),
    'zh-TW': ZH_TW_PACK,
    en: 'Raw|Hide Raw|Fallback|AI unavailable; machine fallback|Retranslate|Translation incomplete|↻ Retry|Translating…|AI polishing…|Streaming…|Settling…|Proxy or network unreachable|Rate-limited (cooling down)|API key or auth error|Translation timed out|Daemon service offline|Proxy error · Retry|Rate limit · Retry|Auth error · Retry|Timed out · Retry|Offline · Retry|Failed · Retry|Translated first {0}k / {1}k chars'.split(
      '|'
    ),
    ja: '原文|原文を隠す|機械翻訳代替|AI未設定・機械翻訳代替|再翻訳|翻訳未完了|↻ 再試行|翻訳中…|AI翻訳中…|出力中…|整理中…|プロキシまたは接続不可|レート制限クールダウン中|APIキーまたは認証エラー|翻訳タイムアウト|バックグラウンド未接続|プロキシ失敗 · 再試行|制限中 · 再試行|認証エラー · 再試行|タイムアウト · 再試行|オフライン · 再試行|失敗 · 再試行|先頭 {0}k 字を翻訳済（全 {1}k 字）'.split(
      '|'
    ),
    ko: '원문|원문 숨기기|기계 번역 대체|AI 미준비로 기계 번역 사용|재번역|번역 미완료|↻ 재시도|번역 중…|AI 다듬는 중…|출력 중…|정리 중…|프록시 또는 네트워크 연결 불가|요청 제한 대기 중|API 키 또는 인증 오류|번역 시간 초과|백그라운드 서비스 오프라인|프록시 오류 · 재시도|요청 제한 · 재시도|인증 실패 · 재시도|시간 초과 · 재시도|오프라인 · 재시도|번역 실패 · 재시도|앞부분 {0}k / 전체 {1}k자 번역 완료'.split(
      '|'
    ),
    es: 'Original|Ocultar original|Respaldo MT|IA no disponible; traducción automática|Retraducir|Traducción incompleta|↻ Reintentar|Traduciendo…|Puliendo con IA…|Transmitiendo…|Finalizando…|Proxy o red inaccesible|Límite de tasa (en espera)|Error de clave API o autenticación|Tiempo de espera agotado|Servicio en segundo plano desconectado|Error de proxy · Reintentar|Límite · Reintentar|Error auth · Reintentar|Tiempo agotado · Reintentar|Sin conexión · Reintentar|Error · Reintentar|Primeros {0}k / {1}k caracteres traducidos'.split(
      '|'
    ),
    fr: 'Original|Masquer l’original|Secours MT|IA indisponible ; traduction auto|Retraduire|Traduction incomplète|↻ Réessayer|Traduction…|Affinage IA…|Diffusion…|Finalisation…|Proxy ou réseau inaccessible|Limite atteinte (refroidissement)|Erreur de clé API ou d’authentification|Délai dépassé|Service d’arrière-plan hors ligne|Erreur proxy · Réessayer|Limite · Réessayer|Erreur auth · Réessayer|Délai · Réessayer|Hors ligne · Réessayer|Échec · Réessayer|Premiers {0}k / {1}k caractères traduits'.split(
      '|'
    ),
    de: 'Original|Original ausblenden|MT-Fallback|KI nicht verfügbar; maschineller Fallback|Neu übersetzen|Übersetzung unvollständig|↻ Erneut|Übersetze…|KI-Feinschliff…|Streaming…|Abschluss…|Proxy oder Netzwerk nicht erreichbar|Rate-Limit (Abkühlung)|API-Schlüssel- oder Auth-Fehler|Zeitüberschreitung|Hintergrunddienst offline|Proxy-Fehler · Erneut|Rate-Limit · Erneut|Auth-Fehler · Erneut|Zeitlimit · Erneut|Offline · Erneut|Fehlgeschlagen · Erneut|Erste {0}k / {1}k Zeichen übersetzt'.split(
      '|'
    ),
  };

  const memCache = new Map();
  if (W.__agPrismThought && W.__agPrismThought.__memCache instanceof Map) {
    for (const [k, v] of W.__agPrismThought.__memCache.entries()) memCache.set(k, v);
  }
  try { W.__agPrismThought?.destroy?.(); } catch {}

  const failedSigs = new Map();
  const inflightBySig = new Map();
  const trackedWaitPanels = new Map();
  const trackedStreamingTriggers = new Map();
  const streamingObservers = new WeakMap();
  const waitPanelObservers = new WeakMap();
  const toolSummaryRecords = new Set();
  const toolSummaryNodeMap = new WeakMap();
  const toolSummaryCache = new Map();
  const toolBatchInflight = new Map();
  const toolSummaryFailedUntil = new Map();
  const titleRecords = new Set();
  const titleNodeMap = new WeakMap();
  const titleCache = new Map();
  const titleBatchInflight = new Map();
  const titleFailedUntil = new Map();
  const observedTitleRoots = new Set();
  const TITLE_CONTAINER_TIDS = new Set(['conversation-row-sidebar', 'conversation-row-history', 'breadcrumb-segment']);
  let titleObserver = null;
  let titleScanTimer = null;
  let titleInternalMutDepth = 0;
  const panelMeta = new WeakMap();
  const rawCacheMap = new WeakMap();
  const lockedHeights = new WeakMap();
  const panelFileMaps = new WeakMap();
  const panelActiveEntry = new WeakMap();
  const panelStreamStates = new WeakMap();
  const panelSettleTimers = new WeakMap();

  const K_TC = 'textContent';
  const K_NV = 'nodeValue';
  const K_CN = 'childNodes';
  const K_FC = 'firstChild';
  const K_PE = 'parentElement';
  const K_NS = 'nextElementSibling';
  const K_OD = 'ownerDocument';
  const K_IC = 'isConnected';
  const K_ST = 'style';
  const K_CV = 'checkVisibility';
  const low = (s) => String(s || '').toLowerCase();
  const trm = (s) => String(s || '').trim();
  const docRoot = () => (typeof document !== 'undefined' ? document.documentElement : null);
  const tc = (e) => (e ? e[K_TC] : '');
  const stc = (e, v) => { if (e) e[K_TC] = v; };
  const isConn = (e) => Boolean(e && e[K_IC] !== false);
  const docOf = (e) => (e && e[K_OD]) || document;
  const nextSib = (e) => e && e[K_NS];
  const parEl = (e) => e && e[K_PE];
  const ga = (e, k) => (e && e.getAttribute ? e.getAttribute(k) : null);
  const hasAttr = (e, k) => (e ? (typeof e.hasAttribute === 'function' ? e.hasAttribute(k) : ga(e, k) !== null) : false);
  const sa = (e, k, v) => {
    if (e && e.setAttribute) {
      const s = String(v);
      if (ga(e, k) !== s) e.setAttribute(k, s);
    }
  };
  const ra = (e, k) => { if (e && e.removeAttribute && hasAttr(e, k)) e.removeAttribute(k); };
  const raList = (e, ks) => { for (let i = 0; i < ks.length; i++) ra(e, ks[i]); };
  const markNoTr = (e) => {
    for (const s of 'translate=no,data-no-translate=true,data-ag-localization-skip=true,data-agy-no-translate=true,data-antigravity-zh-skip=1'.split(',')) { const p = s.split('='); sa(e, p[0], p[1]); }
    return e;
  };
  const ce = (d, t, cls) => { const e = d.createElement(t); if (cls) e.className = cls; return e; };
  const ctn = (d, s) => d.createTextNode(s);
  const ap = (p, c) => p.appendChild(c);
  const clearEl = (e) => { while (e && e[K_FC]) e.removeChild(e[K_FC]); };
  const getTnStr = (tn) => (tn ? tn[K_NV] ?? tn[K_TC] ?? '' : '');
  const setTn = (tn, v) => {
    if (!tn) return;
    if (K_NV in tn) tn[K_NV] = v;
    if (K_TC in tn && tn[K_TC] !== v) tn[K_TC] = v;
  };
  const appendTn = (tn, d) => {
    if (!tn || !d) return;
    if (typeof tn.appendData === 'function') tn.appendData(d);
    else setTn(tn, getTnStr(tn) + d);
  };
  const qsa = (s) => (typeof document !== 'undefined' ? document.querySelectorAll(s) : []);
  const onClk = (e, fn) => e.addEventListener('click', fn);
  const stopEv = (ev) => {
    if (ev) {
      if (typeof ev.preventDefault === 'function') ev.preventDefault();
      if (typeof ev.stopPropagation === 'function') ev.stopPropagation();
    }
  };
  const unlockHeight = (p) => {
    if (!p) return;
    lockedHeights.delete(p);
    if (p[K_ST] && p[K_ST].minHeight) p[K_ST].removeProperty('min-height');
  };

  function queryTriggers() {
    if (typeof document === 'undefined') return [];
    if (!isConn(cachedConvRoot)) {
      cachedConvRoot = document.querySelector ? document.querySelector('[data-testid="conversation-view"]') : null;
    }
    const scope = cachedConvRoot && cachedConvRoot.querySelectorAll ? cachedConvRoot : document;
    const list = scope.querySelectorAll(SEL_TRIGGER);
    return list && list.length ? list : scope !== document ? qsa(SEL_TRIGGER) : [];
  }

  const hlItems = [];
  let hlTimer = null;
  let hlBks = null;

  function getCssHlBuckets() {
    if (hlBks) return hlBks;
    const c = W.CSS || (typeof CSS !== 'undefined' ? CSS : null);
    const H = W.Highlight || (typeof Highlight === 'function' ? Highlight : null);
    if (!c?.highlights?.set || typeof H !== 'function' || typeof document === 'undefined' || !document.createRange) return null;
    hlBks = [];
    for (let i = 0; i < 5; i++) {
      const nm = `ag-stream-f${i}`;
      let h = c.highlights.get && c.highlights.get(nm);
      if (!h) c.highlights.set(nm, (h = new H()));
      hlBks.push(h);
    }
    return hlBks;
  }

  function dropHlItem(it, bs) {
    if (bs && it.b >= 0) {
      try { bs[it.b].delete(it.r); } catch (_) {}
    }
    it.b = -1;
  }

  function clearPanelHlItems(panel) {
    if (!hlItems.length) return;
    const bs = getCssHlBuckets();
    for (let i = hlItems.length - 1; i >= 0; i--) {
      if (!panel || hlItems[i].p === panel) {
        dropHlItem(hlItems[i], bs);
        hlItems.splice(i, 1);
      }
    }
    if (!hlItems.length && hlTimer) {
      clearTimeout(hlTimer);
      hlTimer = null;
    }
  }

  function stepHlFade() {
    hlTimer = null;
    const bs = !isMotionOff() && currentMode !== 'off' ? getCssHlBuckets() : null;
    if (!hlItems.length || !bs) return clearPanelHlItems(null);
    const now = nowMs();
    for (let i = hlItems.length - 1; i >= 0; i--) {
      const it = hlItems[i];
      const val = getTnStr(it.tn);
      const age = now - it.at;
      if (!isConn(it.p) || val.length < it.e || age >= 300) {
        dropHlItem(it, bs);
        hlItems.splice(i, 1);
      } else {
        const nb = Math.min(4, 1 + Math.max(0, (age / 75) | 0));
        if (it.b !== nb) {
          dropHlItem(it, bs);
          try { bs[nb].add(it.r); it.b = nb; } catch (_) {}
        }
      }
    }
    if (hlItems.length) (hlTimer = setTimeout(stepHlFade, 64))?.unref?.();
  }

  function pushHlSlice(panel, doc, tn, s, e, now, bs) {
    if (!bs || e <= s || !doc?.createRange) return;
    const last = hlItems[hlItems.length - 1];
    if (last && last.p === panel && last.tn === tn && last.e === s && now - last.at <= 42) {
      try {
        if (last.r.startOffset !== last.s) last.r.setStart(tn, last.s);
        last.r.setEnd(tn, (last.e = e));
        return;
      } catch (_) {}
    }
    while (hlItems.length >= 24) dropHlItem(hlItems.shift(), bs);
    try {
      const r = doc.createRange();
      r.setStart(tn, s);
      r.setEnd(tn, e);
      bs[1].add(r);
      hlItems.push({ p: panel, tn, r, s, e, b: 1, at: now });
      if (!hlTimer) (hlTimer = setTimeout(stepHlFade, 64))?.unref?.();
    } catch (_) {}
  }

  let syncHydrateBudget = 99;
  const hydrateQueue = [];
  let hydrateHandle = null;

  function clearHydrateQueue() {
    if (hydrateHandle) {
      clearTimeout(hydrateHandle);
      hydrateHandle = null;
    }
    hydrateQueue.length = 0;
  }

  const nowMs = () => (W.Date?.now ? W.Date.now() : Date.now());
  const isMotionOff = () => {
    try {
      return ga(docRoot(), 'data-ag-cs-motion') === 'off' || W.__agPrism?.getState?.()?.cfg?.motionLevel === 'off';
    } catch (_) {
      return false;
    }
  };
  const getRafFn = () => (W.requestAnimationFrame ? W.requestAnimationFrame.bind(W) : typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null);
  const getCafFn = () => (W.cancelAnimationFrame ? W.cancelAnimationFrame.bind(W) : typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : null);
  const canUseSmoothStream = () => Boolean(getRafFn()) && !isMotionOff();

  function clearPanelStreamState(panel) {
    if (!panel) return;
    const t = panelSettleTimers.get(panel);
    if (t) {
      clearTimeout(t);
      panelSettleTimers.delete(panel);
    }
    panelStreamStates.delete(panel);
    clearPanelHlItems(panel);
  }

  function normalizeLangCode(raw) {
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

  function resolveActiveLang(explicitLang) {
    const fromArg = normalizeLangCode(explicitLang);
    if (fromArg) return fromArg;
    const argIsAuto = typeof explicitLang === 'string' && explicitLang.trim().toLowerCase() === 'auto';
    try {
      const rootEl = docRoot();
      if (rootEl) {
        const csLang = normalizeLangCode(ga(rootEl, 'data-ag-cs-lang')) || normalizeLangCode(ga(rootEl, 'data-ag-prism-lang'));
        if (csLang) return csLang;
      }
      const rawStateLang = W.__agPrism?.getState?.()?.cfg?.language;
      const stateLang = normalizeLangCode(rawStateLang);
      if (stateLang) return stateLang;
      if (argIsAuto || (typeof rawStateLang === 'string' && rawStateLang.trim().toLowerCase() === 'auto')) {
        const navObj = W && 'navigator' in W ? W.navigator : null;
        return normalizeLangCode(navObj?.language || '') || 'en';
      }
    } catch (_) {}
    if (currentLang) return currentLang;
    try {
      const navObj = W && 'navigator' in W ? W.navigator : null;
      const navLang = normalizeLangCode(navObj?.language || '');
      if (navLang) return navLang;
    } catch (_) {}
    return 'zh-CN';
  }

  function getClientPack(explicitLang) {
    return CLIENT_I18N[resolveActiveLang(explicitLang)] || CLIENT_I18N.en;
  }

  function isDocHiddenOrSleep() {
    try {
      if (typeof document !== 'undefined' && (document.hidden || document.visibilityState === 'hidden')) return true;
      const rootEl = docRoot();
      if (rootEl && ga(rootEl, 'data-ag-prism-mode') === 'chat') return true;
    } catch (_) {}
    return false;
  }

  function disconnectWaitPanelObserver(panel) {
    if (!panel) return;
    const obs = waitPanelObservers.get(panel);
    if (obs) {
      try { obs.disconnect(); } catch (_) {}
      waitPanelObservers.delete(panel);
    }
  }

  function untrackStreamingTrigger(btn) {
    if (!btn) return;
    trackedStreamingTriggers.delete(btn);
    const obs = streamingObservers.get(btn);
    if (obs) {
      try { obs.disconnect(); } catch (_) {}
      streamingObservers.delete(btn);
    }
    if (!trackedStreamingTriggers.size && streamingWatchTimer) {
      clearTimeout(streamingWatchTimer);
      streamingWatchTimer = null;
    }
  }

  function clearAllStreamingWatchers() {
    if (streamingWatchTimer) {
      clearTimeout(streamingWatchTimer);
      streamingWatchTimer = null;
    }
    for (const btn of Array.from(trackedStreamingTriggers.keys())) {
      untrackStreamingTrigger(btn);
    }
    trackedStreamingTriggers.clear();
  }

  function checkTrackedStreamingTriggers() {
    streamingWatchTimer = null;
    if (currentMode === 'off' || isDocHiddenOrSleep()) return;
    const now = nowMs();
    let wokeAny = false;
    for (const [btn, rec] of Array.from(trackedStreamingTriggers.entries())) {
      if (!isConn(btn) || now - rec.at > 300000) {
        untrackStreamingTrigger(btn);
        continue;
      }
      if (!isTriggerStreaming(btn)) {
        untrackStreamingTrigger(btn);
        wokeAny = true;
      } else {
        const panel = nextSib(btn);
        if (panel) {
          const stp = quickPanelStamp(panel);
          if (stp !== rec.stp) {
            rec.stp = stp;
            rec.lastMut = now;
          }
        }
      }
    }
    if (wokeAny) scheduleScan(25);
    if (trackedStreamingTriggers.size > 0 && currentMode !== 'off' && !isDocHiddenOrSleep()) {
      streamingWatchTimer = setTimeout(checkTrackedStreamingTriggers, 480);
      streamingWatchTimer?.unref?.();
    }
  }

  function trackStreamingTrigger(btn, panel) {
    if (!btn || currentMode === 'off') return;
    const now = nowMs();
    const stp = panel ? quickPanelStamp(panel) : '';
    const existing = trackedStreamingTriggers.get(btn);
    if (existing) {
      existing.stp = stp;
    } else {
      trackedStreamingTriggers.set(btn, { at: now, lastMut: now, stp });
    }
    const MO = W.MutationObserver || (typeof MutationObserver === 'function' ? MutationObserver : null);
    if (MO && !streamingObservers.has(btn)) {
      try {
        const obs = new MO(() => {
          if (currentMode === 'off') {
            untrackStreamingTrigger(btn);
            return;
          }
          if (!isConn(btn) || !isTriggerStreaming(btn)) {
            untrackStreamingTrigger(btn);
            scheduleScan(25);
          }
        });
        obs.observe(btn, {
          attributes: true,
          attributeFilter: ['class', 'aria-expanded', 'data-op-thought-state', 'data-ag-cs-spark-streaming'],
          characterData: true,
          childList: true,
          subtree: true,
        });
        streamingObservers.set(btn, obs);
      } catch (_) {}
    }
    if (!streamingWatchTimer && !isDocHiddenOrSleep()) {
      streamingWatchTimer = setTimeout(checkTrackedStreamingTriggers, 480);
      streamingWatchTimer?.unref?.();
    }
  }

  function setPanelWaitTimer(panel, btn, fn, delayMs) {
    if (!panel) return;
    clearPanelWaitTimer(panel);
    const MO = W.MutationObserver || (typeof MutationObserver === 'function' ? MutationObserver : null);
    if (MO && !waitPanelObservers.has(panel)) {
      try {
        const obs = new MO((records) => {
          if (currentMode === 'off') {
            disconnectWaitPanelObserver(panel);
            return;
          }
          let sawHostChange = false;
          for (let i = 0; i < records.length; i++) {
            const tgt = records[i]?.target;
            const el = tgt && tgt.nodeType === 1 ? tgt : parEl(tgt);
            if (el && (isOverlayOrIgnoredElement(el) || el.closest?.('[data-prism-ignore], [data-op-thought]'))) continue;
            sawHostChange = true;
            break;
          }
          if (sawHostChange) {
            const m = panelMeta.get(panel);
            if (m) m.c = nowMs();
          }
        });
        obs.observe(panel, { characterData: true, childList: true, subtree: true });
        waitPanelObservers.set(panel, obs);
      } catch (_) {}
    }
    const t = setTimeout(() => {
      trackedWaitPanels.delete(panel);
      disconnectWaitPanelObserver(panel);
      fn();
    }, delayMs);
    trackedWaitPanels.set(panel, { t, b: btn });
  }

  function clearPanelWaitTimer(panel) {
    disconnectWaitPanelObserver(panel);
    const rec = trackedWaitPanels.get(panel);
    if (!rec) return;
    clearTimeout(rec.t);
    trackedWaitPanels.delete(panel);
  }

  function findTriggerForPanel(panel) {
    if (!panel) return null;
    const prev = panel.previousElementSibling;
    if (prev && ga(prev, 'data-testid') === 'thinking-collapsible-trigger') return prev;
    const triggers = queryTriggers();
    for (let i = 0; i < triggers.length; i++) {
      if (nextSib(triggers[i]) === panel) return triggers[i];
    }
    return null;
  }

  function isPanelCurrentlyExpanded(panel) {
    if (!panel) return false;
    if (ga(panel.previousElementSibling, A_EXP) === 'true') return true;
    const triggers = queryTriggers();
    for (let i = 0; i < triggers.length; i++) {
      if (nextSib(triggers[i]) === panel) return ga(triggers[i], A_EXP) === 'true';
    }
    return false;
  }

  function clearAllWaitTimers(onlyCollapsed = false) {
    for (const [panel, rec] of trackedWaitPanels.entries()) {
      const expanded = ga(rec.b, A_EXP) === 'true' || isPanelCurrentlyExpanded(panel);
      if (onlyCollapsed && expanded) continue;
      clearTimeout(rec.t);
      trackedWaitPanels.delete(panel);
      disconnectWaitPanelObserver(panel);
      if (!expanded) clearPendingKeepRaw(panel);
    }
  }

  function cancelCollapsedInflightRequests() {
    clearAllWaitTimers(true);
    for (const [sig, entry] of inflightBySig.entries()) {
      const kept = [];
      for (let i = 0; i < entry.ps.length; i++) {
        const p = entry.ps[i];
        if (isConn(p) && isPanelCurrentlyExpanded(p)) kept.push(p);
        else if (p) clearPendingKeepRaw(p);
      }
      entry.ps = kept;
      if (!kept.length) {
        cancelTranslateRequest(entry);
        inflightBySig.delete(sig);
      }
    }
  }

  function findChildByClass(parent, cls) {
    const chs = parent && parent.children;
    if (!chs) return null;
    for (let i = 0; i < chs.length; i++) {
      if (chs[i] && chs[i].classList && chs[i].classList.contains(cls)) return chs[i];
    }
    return null;
  }

  function normalizeTextKey(str) {
    return String(str || '')
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n+/g, '\n')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  function canonicalizeSkeleton(str) {
    return String(str || '')
      .replace(/\r\n/g, '\n')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/[^a-zA-Z0-9\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]+/g, '')
      .toLowerCase();
  }

  function computeSkelBody(norm) {
    if (!norm) return '';
    const skel = canonicalizeSkeleton(norm) || norm;
    let h = 2166136261;
    for (let i = 0; i < skel.length; i++) {
      h ^= skel.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return `_v3_${(h >>> 0).toString(36)}_${skel.length}`;
  }

  function countScripts(str) {
    return {
      lw: (str.match(/[A-Za-z]{3,}/g) || []).length,
      lc: (str.match(/[A-Za-z]/g) || []).length,
      cjk: (str.match(/[\u4e00-\u9fa5]/g) || []).length,
      kana: (str.match(/[\u3040-\u30ff]/g) || []).length,
      han: (str.match(/[\uac00-\ud7af]/g) || []).length,
    };
  }

  function hasForeignProseParagraph(prose, tl) {
    const paras = prose.split(/\n+/);
    for (let i = 0; i < paras.length; i++) {
      const para = paras[i].trim();
      if (!para) continue;
      const c = countScripts(para);
      if (tl === 'ja') {
        if ((c.lw >= 6 && c.kana < c.lw * 1.5) || (c.cjk >= 12 && c.kana === 0)) return true;
      } else if (tl === 'ko') {
        if ((c.lw >= 6 && c.han < c.lw * 1.5) || (c.cjk >= 12 && c.han === 0) || c.kana >= 6) return true;
      } else if (tl === 'en') {
        if (c.cjk + c.kana + c.han >= 4) return true;
      } else if ((c.lw >= 6 && c.cjk < c.lw * 1.5) || c.kana >= 6 || c.han >= 6) {
        return true;
      }
    }
    return false;
  }

  function isAlreadyTargetLang(norm, targetLang = currentLang) {
    if (!norm || norm.length < 4) return true;
    const sample = norm.length > MAX_SAFE_THOUGHT_CHARS ? norm.slice(0, MAX_SAFE_THOUGHT_CHARS) : norm;
    const tl = normalizeLangCode(targetLang) || resolveActiveLang();
    const prose = sample
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`[^`\n]+`/g, ' ')
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/[A-Za-z]:[\\/][^\s"'<>|]+/g, ' ')
      .replace(/(?:\/[A-Za-z0-9._-]+){2,}/g, ' ');
    if (!prose.trim()) return true;

    const c = countScripts(prose);
    const totalAlpha = c.lc + c.cjk + c.kana + c.han;

    if (tl === 'en') {
      if (c.cjk + c.kana + c.han >= 4) return false;
      if (totalAlpha < 4) return true;
      return c.cjk + c.kana + c.han < 4;
    }

    if (totalAlpha < 10) return true;

    if (tl === 'ja') {
      if (c.lw >= 8 || hasForeignProseParagraph(prose, 'ja')) return false;
      return c.kana >= 8;
    }

    if (tl === 'ko') {
      if (c.lw >= 8 || hasForeignProseParagraph(prose, 'ko')) return false;
      return c.han >= 8;
    }

    if (tl === 'es' || tl === 'fr' || tl === 'de') return false;

    if (c.lw >= 8 || c.kana >= 6 || c.han >= 6 || hasForeignProseParagraph(prose, tl)) {
      return false;
    }

    if (tl === 'zh-TW') return false;

    return c.lw < 6 && c.kana < 4 && c.han < 4 && c.cjk >= 6;
  }

  function sliceThoughtForSafeSend(rawText) {
    const text = String(rawText || '').trim();
    if (text.length <= MAX_SAFE_THOUGHT_CHARS) {
      return { text, truncated: false, totalChars: text.length, sentChars: text.length };
    }
    const hardEnd = Math.min(text.length, SAFE_TRUNCATE_BUDGET);
    const minCut = Math.floor(SAFE_TRUNCATE_BUDGET * 0.7);
    let cut = text.lastIndexOf('\n\n', hardEnd);
    if (cut < minCut) cut = text.lastIndexOf('\n', hardEnd);
    if (cut < minCut) cut = text.lastIndexOf(' ', hardEnd);
    if (cut < minCut) cut = hardEnd;
    const head = text.slice(0, cut).trim() || text.slice(0, hardEnd);
    return { text: head, truncated: true, totalChars: text.length, sentChars: head.length };
  }

  const TOOL_PROTECT_RES = [
    /\x60[^\x60\n]+\x60/g,
    /\bExited\s+with\s+(?:exit\s+)?code\s+-?\d+\b/gi,
    /\bexit\s+code\s+-?\d+\b/gi,
    /\bHTTP\s+\d{3}\b/g,
    /(?:https?|file|socks5h?):\/\/[^\s\x22\x27<>()]+/gi,
    /[A-Za-z]:[\\/][^\s\x22\x27<>|]+/g,
    /(?<![A-Za-z0-9_])(?:\.{1,2}\/|\/)(?:[A-Za-z0-9_.@-]+\/)*[A-Za-z0-9_.@-]+(?:#L\d+(?:-L?\d+)?|:\d+(?:-\d+)?(?::\d+)?)?/g,
    /(?<![A-Za-z0-9_./\\-])(?:[A-Za-z0-9_.@-]+\/)+[A-Za-z0-9_.@-]+(?:#L\d+(?:-L?\d+)?|:\d+(?:-\d+)?(?::\d+)?)?/g,
    /#L\d+(?:-L?\d+)?\b/gi,
    /\bL\d+-L?\d+\b/g,
    /(?<!\w):\d+(?:-\d+)(?::\d+)?\b/g,
    /(?<![A-Za-z0-9_./\\-])[A-Za-z0-9_][A-Za-z0-9_.-]*\.[A-Za-z][A-Za-z0-9]{0,7}(?:#L\d+(?:-L?\d+)?|:\d+(?:-\d+)?)?(?![A-Za-z0-9_])/g,
    /(?<=^|[\s([{\x22\x27])--?[A-Za-z][A-Za-z0-9_-]*(?:=[^\s)\]}\x22\x27]+)?/g,
    /\b[A-Za-z0-9]+(?:_[A-Za-z0-9]+)+\b/g,
    /\b(?:[a-z]+[A-Z][A-Za-z0-9]*|[A-Z][a-z0-9]+[A-Z][A-Za-z0-9]*)\b/g,
    /\b[A-Za-z_][A-Za-z0-9_]*\(\)/g,
    /\b(?:xlsx|xls|docx|pptx|csv|tsv|json|jsonl|yaml|yml|toml|xml|html|htm|css|scss|less|mjs|cjs|jsx|tsx|pyc|cpp|hpp|ps1|bat|cmd|sql|mdx|txt|pdf|png|jpg|jpeg|webp|svg|gif|ico|zip|tar|tgz|rar|env|ini|cfg|conf|diff|patch|exe|dll|dylib|wasm|ipynb|parquet|sqlite)\b/gi,
  ];
  const TOOL_VERB_RE =
    /\b(?:read|reading|write|writing|wrote|edit|editing|edited|inspect|inspecting|inspected|check|checking|checked|list|listing|listed|search|searching|searched|find|finding|found|run|running|ran|open|opening|opened|view|viewing|viewed|create|creating|created|delete|deleting|deleted|update|updating|updated|analyze|analyzing|analyzed|explore|exploring|explored|finished|failed|completed|scanning|scanned|loading|loaded|fix|fixing|fixed|refactor|refactoring|refactored|optimize|optimizing|optimized|debug|debugging|debugged|add|adding|added|remove|removing|removed|build|building|built|deploy|deploying|deployed|test|testing|tested|implement|implementing|implemented|migrate|migrating|migrated|upgrade|upgrading|upgraded|setup|configure|configuring|configured|design|designing|plan|planning|review|reviewing|investigate|investigating|resolve|resolving|improve|improving|clean|cleaning|support|enable|disable|translate|translating|handle|handling|parse|parsing|render|rendering|sync|syncing|patch|patching|harden|hardening)\b/i;

  const TITLE_TIME_RE =
    /^(?:just\s+now|now|today|yesterday|tomorrow|last\s+(?:week|month|year)|this\s+(?:week|month|year)|\d+\s*(?:s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|wk|wks|week|weeks|mo|mos|month|months|y|yr|yrs|year|years)(?:\s+ago)?|\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]m)?|\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}(?:,?\s+\d{4})?)$/i;
  const TITLE_NUM_SYM_RE = /^[\d\s.,:%$€£¥#+\-\x2f\x2a=()[\]{}<>_|\\~\x60!?\x27\x22@^&vV]+$/;
  const TITLE_PATH_OR_URL_RE = /^(?:(?:https?|file):\/\/\S+|[A-Za-z]:[\\/]\S+|(?:~\/|\.\.?\/|\/)\S+|[A-Za-z0-9_.-]+\.[A-Za-z][A-Za-z0-9]{0,7}(?:#L\d+(?:-L?\d+)?|:\d+(?:-\d+)?)?)$/i;
  const TITLE_SLUG_RE = /^[A-Za-z0-9]+(?:[-_/][A-Za-z0-9.]+)+$/;

  function isTitleCandidate(raw, targetLang = currentLang) {
    const norm = trm(raw);
    if (!norm || norm.length < 4 || norm.length > 200) return false;
    if (/__\s*OPID/i.test(norm)) return false;
    if (TITLE_TIME_RE.test(norm) || TITLE_NUM_SYM_RE.test(norm) || TITLE_PATH_OR_URL_RE.test(norm)) return false;
    if (!/\s/.test(norm) && TITLE_SLUG_RE.test(norm)) return false;
    const tl = normalizeLangCode(targetLang) || resolveActiveLang();
    const { masked, tokens } = protectToolSummaryTokens(norm);
    const prose = masked.replace(/__OPID_\d+__/g, ' ').replace(/\s+/g, ' ').trim();
    if (!prose) return false;
    const latinWords = (prose.match(/[A-Za-z]{2,}/g) || []).length;
    const cjk = (prose.match(/[\u4e00-\u9fa5]/g) || []).length;
    const kana = (prose.match(/[\u3040-\u30ff]/g) || []).length;
    const han = (prose.match(/[\uac00-\ud7af]/g) || []).length;
    if (tl === 'en') return cjk + kana + han >= 2;
    if (tl === 'ja') return latinWords >= 2 || (latinWords === 1 && tokens.length > 0 && TOOL_VERB_RE.test(prose)) || (cjk >= 4 && kana === 0);
    if (tl === 'ko') return latinWords >= 2 || (latinWords === 1 && tokens.length > 0 && TOOL_VERB_RE.test(prose)) || cjk >= 4 || kana >= 3;
    if (tl === 'zh-CN' && cjk >= 2 && latinWords < 2 && kana === 0 && han === 0) return false;
    return latinWords >= 2 || (latinWords === 1 && tokens.length > 0 && TOOL_VERB_RE.test(prose)) || kana >= 3 || han >= 3 || ((tl === 'es' || tl === 'fr' || tl === 'de') && cjk >= 2);
  }

  function protectToolSummaryTokens(text) {
    const src = String(text || '');
    if (!src) return { masked: '', tokens: [] };
    const tokens = [];
    let masked = src;
    for (let i = 0; i < TOOL_PROTECT_RES.length; i++) {
      const re = TOOL_PROTECT_RES[i];
      re.lastIndex = 0;
      masked = masked.replace(re, (m) => {
        if (!m || m.includes('__OPID_')) return m;
        const idx = tokens.push(m) - 1;
        return `__OPID_${idx}__`;
      });
    }
    return { masked, tokens };
  }

  function isToolSummaryCandidate(raw, targetLang = currentLang) {
    const norm = trm(raw);
    if (!norm || norm.length < 4 || norm.length > 280) return false;
    if (/__\s*OPID/i.test(norm)) return false;
    const tl = normalizeLangCode(targetLang) || resolveActiveLang();
    const { masked, tokens } = protectToolSummaryTokens(norm);
    const prose = masked.replace(/__OPID_\d+__/g, ' ').replace(/\s+/g, ' ').trim();
    if (!prose) return false;
    const latinWords = (prose.match(/[A-Za-z]{2,}/g) || []).length;
    const cjk = (prose.match(/[\u4e00-\u9fa5]/g) || []).length;
    const kana = (prose.match(/[\u3040-\u30ff]/g) || []).length;
    const han = (prose.match(/[\uac00-\ud7af]/g) || []).length;
    if (tl === 'en') return cjk + kana + han >= 2;
    if (tl === 'ja') return latinWords >= 2 || (latinWords === 1 && tokens.length > 0 && TOOL_VERB_RE.test(prose)) || (cjk >= 4 && kana === 0);
    if (tl === 'ko') return latinWords >= 2 || (latinWords === 1 && tokens.length > 0 && TOOL_VERB_RE.test(prose)) || cjk >= 4 || kana >= 3;
    return latinWords >= 2 || (latinWords === 1 && tokens.length > 0 && TOOL_VERB_RE.test(prose)) || kana >= 3 || han >= 3 || ((tl === 'es' || tl === 'fr' || tl === 'de') && cjk >= 2);
  }

  const getStore = () => W.localStorage || null;

  function setActiveStyleTag(nextTag) {
    if (!nextTag || nextTag === activeStyleTag) return false;
    activeStyleTag = nextTag;
    try { getStore()?.setItem(STYLE_TAG_KEY, nextTag); } catch (_) {}
    return true;
  }

  function loadViewModePreference() {
    if (viewModeLoaded || hasExplicitHostView) {
      viewModeLoaded = true;
      return;
    }
    viewModeLoaded = true;
    try {
      const saved = getStore()?.getItem(VIEW_MODE_STORAGE_KEY);
      if (saved === 'bilingual' || saved === 'immersive') currentViewMode = saved;
    } catch (_) {}
  }

  function persistViewModePreference(mode) {
    try { getStore()?.setItem(VIEW_MODE_STORAGE_KEY, mode); } catch (_) {}
  }

  function loadLocalStorageCache() {
    if (localCacheLoaded) return;
    localCacheLoaded = true;
    const store = getStore();
    if (!store) return;
    try {
      if (!activeStyleTag) {
        const st = store.getItem(STYLE_TAG_KEY);
        if (st) activeStyleTag = st;
      }
      const raw = store.getItem(LOCAL_CACHE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        let cnt = 0;
        for (const [k, v] of Object.entries(parsed)) {
          if (k && typeof v === 'string' && v.trim()) {
            if (!memCache.has(k)) memCache.set(k, v);
            cnt++;
          }
        }
        storedCount = cnt;
      }
    } catch (_) {}
  }

  let persistTimer = null;
  let persistIdle = null;

  function cancelPersistHandles() {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    if (persistIdle) {
      try { W.cancelIdleCallback?.(persistIdle); } catch (_) {}
      persistIdle = null;
    }
  }

  function flushLocalStorageCacheNow() {
    cancelPersistHandles();
    cacheDirty = false;
    try {
      const store = getStore();
      if (!store) return;
      const entries = Array.from(memCache.entries());
      const picked = [];
      let totalChars = 0;
      for (let i = entries.length - 1; i >= 0 && picked.length < STORAGE_CACHE_LIMIT; i--) {
        const [k, v] = entries[i];
        if (!k || typeof v !== 'string' || v.length > MAX_STORAGE_ENTRY_CHARS) continue;
        const cost = k.length + v.length + 8;
        if (totalChars + cost > MAX_STORAGE_TOTAL_CHARS) break;
        totalChars += cost;
        picked.push([k, v]);
      }
      const writePicked = (list) => {
        const obj = {};
        for (let i = list.length - 1; i >= 0; i--) obj[list[i][0]] = list[i][1];
        store.setItem(LOCAL_CACHE_KEY, JSON.stringify(obj));
        storedCount = list.length;
      };
      try {
        writePicked(picked);
      } catch (_) {
        if (picked.length > 4) try { writePicked(picked.slice(0, picked.length >> 1)); } catch (_) {}
      }
    } catch (_) {}
  }

  function persistLocalStorageCache() {
    cacheDirty = true;
    if (persistTimer || persistIdle) return;
    const sched = (ms) => {
      persistTimer = setTimeout(() => {
        persistTimer = null;
        if (inflightBySig.size > 0) return sched(2000);
        if (W.requestIdleCallback) {
          persistIdle = W.requestIdleCallback(() => { persistIdle = null; flushLocalStorageCacheNow(); }, { timeout: 1500 });
        } else flushLocalStorageCacheNow();
      }, ms);
      persistTimer?.unref?.();
    };
    sched(3500);
  }

  function putMemCache(key, val, persist = true) {
    const trimmed = typeof val === 'string' ? val.trim() : '';
    if (!key || !trimmed) return false;
    const existed = memCache.get(key) === trimmed;
    if (memCache.has(key)) memCache.delete(key);
    while (memCache.size >= MEM_CACHE_LIMIT) {
      const oldest = memCache.keys().next().value;
      if (oldest === undefined) break;
      memCache.delete(oldest);
    }
    memCache.set(key, trimmed);
    if (!existed && persist) persistLocalStorageCache();
    return !existed;
  }

  function getLocalCacheStats() {
    loadLocalStorageCache();
    return { ok: true, memEntries: memCache.size, storageEntries: storedCount };
  }

  function clearLocalCache() {
    cancelPersistHandles();
    cacheDirty = false;
    storedCount = 0;
    const cleared = memCache.size;
    memCache.clear();
    toolSummaryCache.clear();
    titleCache.clear();
    failedSigs.clear();
    toolSummaryFailedUntil.clear();
    titleFailedUntil.clear();
    try { getStore()?.removeItem?.(LOCAL_CACHE_KEY); } catch (_) {}
    return { ok: true, cleared, memEntries: 0, storageEntries: 0 };
  }

  function sanitizeClientErrorText(rawErr) {
    return String(rawErr || '')
      .replace(/([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)[^@\s\x2f\x22\x27<>]+@/gi, '$1***REDACTED***@')
      .replace(/(sk-[A-Za-z0-9_\-]{6,}|Bearer\s+[A-Za-z0-9._\-:+/=]{6,}|(?:Proxy-)?Authorization\s*:\s*Basic\s+[A-Za-z0-9+/=]{4,})/gi, '***REDACTED***')
      .slice(0, 180);
  }

  function classifyFailureReason(resOrErr) {
    if (resOrErr && typeof resOrErr === 'object') {
      if (resOrErr.offline) return 'offline';
      if (resOrErr.timeout) return 'timeout';
    }
    const msg = String((resOrErr && (resOrErr.error || resOrErr.message)) || resOrErr || '');
    if (/429|rate.?limit|quota|too many requests/i.test(msg)) return 'ratelimit';
    if (/401|403|api.?key|unauthorized|forbidden|invalid.?key/i.test(msg)) return 'auth';
    if (/timed?\s*out|timeout/i.test(msg)) return 'timeout';
    if (/offline|disconnected/i.test(msg)) return 'offline';
    if (/proxy|socks|connect|econnrefused|enotfound|econnreset|etimedout|tunnel|network|fetch failed|socket/i.test(msg)) return 'proxy';
    return 'generic';
  }

  const ERR_REASON_IDX = { proxy: 11, ratelimit: 12, auth: 13, timeout: 14, offline: 15, generic: 5 };
  const BADGE_REASON_IDX = { proxy: 16, ratelimit: 17, auth: 18, timeout: 19, offline: 20, generic: 21 };

  function getFailureErrorText(reason, pack = getClientPack()) {
    return pack[ERR_REASON_IDX[reason] || 5] || pack[5];
  }

  function getTriggerBadgeText(reason, pack = getClientPack()) {
    return pack[BADGE_REASON_IDX[reason] || 21] || pack[21];
  }

  function isSigInCooldown(sig) {
    const rec = failedSigs.get(sig);
    if (!rec) return false;
    if (nowMs() >= rec.u) {
      failedSigs.delete(sig);
      return false;
    }
    return true;
  }

  function getSigFailureMeta(sig) {
    const rec = failedSigs.get(sig);
    if (!rec) return null;
    if (nowMs() >= rec.u) {
      failedSigs.delete(sig);
      return null;
    }
    return rec;
  }

  function recordSigFailure(sig, errInfo = null) {
    if (!sig) return null;
    const prev = failedSigs.get(sig);
    const c = prev ? prev.c + 1 : 1;
    const reason = (errInfo && errInfo.reason) || classifyFailureReason(errInfo);
    const detail = sanitizeClientErrorText((errInfo && (errInfo.detail || errInfo.error || errInfo.message)) || '');
    const ttl = c === 1 ? 15000 : c === 2 ? 45000 : 120000;
    const rec = { c, u: nowMs() + ttl, r: reason, d: detail };
    failedSigs.delete(sig);
    failedSigs.set(sig, rec);
    if (failedSigs.size > 512) {
      const oldest = failedSigs.keys().next().value;
      if (oldest !== undefined) failedSigs.delete(oldest);
    }
    return rec;
  }

  function clearSigCooldown(sig) {
    if (sig) failedSigs.delete(sig);
    else failedSigs.clear();
  }

  function clearTriggerStatusBadge(btnOrPanel) {
    const btn =
      btnOrPanel && ga(btnOrPanel, 'data-testid') === 'thinking-collapsible-trigger'
        ? btnOrPanel
        : findTriggerForPanel(btnOrPanel);
    if (!btn) return;
    const old = findChildByClass(btn, C_TRG);
    if (old) old.remove();
  }

  function syncTriggerStatusBadge(panel, reason, detail, sig, rawText, mode) {
    if (!panel) return;
    const btn = findTriggerForPanel(panel);
    if (!btn || !isConn(btn)) return;
    const doc = docOf(btn);
    const t = getClientPack();
    const r = reason || 'generic';
    let badge = findChildByClass(btn, C_TRG);
    if (!badge) {
      badge = markNoTr(ce(doc, 'span', C_TRG));
      sa(badge, 'role', 'button');
      sa(badge, 'tabindex', '0');
      sa(badge, 'data-testid', 'thought-trigger-status-badge');
      sa(badge, 'data-op-thought', '1');
      sa(badge, 'data-prism-ignore', '1');
      sa(badge, 'data-ag-no-i18n', '');
      sa(badge, 'data-no-press-spring', '1');
      if (badge[K_ST]) {
        badge[K_ST].display = 'inline-flex';
        badge[K_ST].alignItems = 'center';
        badge[K_ST].padding = '0 6px';
        badge[K_ST].marginLeft = '4px';
        badge[K_ST].borderRadius = '999px';
        badge[K_ST].fontSize = '10.5px';
        badge[K_ST].lineHeight = '16px';
        badge[K_ST].fontWeight = '500';
        badge[K_ST].cursor = 'pointer';
        badge[K_ST].border = '1px solid color-mix(in srgb,var(--warning,#E5A93B) 36%,var(--ag-cs-border-1,rgba(128,128,128,.28)))';
        badge[K_ST].background = 'color-mix(in srgb,var(--warning,#E5A93B) 12%,var(--ag-cs-pill-bg,rgba(128,128,128,.1)))';
        badge[K_ST].color = 'var(--warning,#D97706)';
      }
      const doRetry = (ev) => {
        stopEv(ev);
        retryPanelNow(panel, rawText, mode, sig);
      };
      onClk(badge, doRetry);
      if (typeof badge.addEventListener === 'function') {
        badge.addEventListener('keydown', (ev) => {
          if (ev && (ev.key === 'Enter' || ev.key === ' ')) doRetry(ev);
        });
      }
      ap(btn, badge);
    }
    sa(badge, 'data-fail-reason', r);
    const label = getTriggerBadgeText(r, t);
    stc(badge, label);
    badge.title = detail ? `${getFailureErrorText(r, t)}: ${detail}` : getFailureErrorText(r, t);
  }

  const getBridge = () => W.__agPrismThoughtBridge || null;
  const offRes = () => Promise.resolve({ ok: false, offline: true });

  function callDaemonRpc(p) {
    try {
      const br = getBridge();
      const a = p && p.action;
      const fn = br && (a === 'cache-stats' ? br.cacheStats : a === 'clear-cache' ? br.clearCache : a === 'cancel-translate' ? br.cancelTranslate : br.call);
      if (typeof fn === 'function') return Promise.resolve().then(() => fn.call(br, p));
      const ret = W.__agPrismThoughtCall?.(p);
      if (ret && typeof ret.then === 'function') return ret;
    } catch (_) {}
    return offRes();
  }

  function syncDocViewAttribute() {
    sa(docRoot(), 'data-ag-prism-thought-view', currentViewMode);
  }

  let hasOffscreenLazyPanels = false;
  let hasOffscreenTitles = false;
  const onScrollCapture = () => {
    if (currentMode === 'off' || scrollTimer || (!hasOffscreenLazyPanels && !hasOffscreenTitles)) return;
    scrollTimer = setTimeout(() => {
      scrollTimer = null;
      if (currentMode !== 'off' && (hasOffscreenLazyPanels || hasOffscreenTitles)) scheduleScan(20);
    }, 100);
    scrollTimer?.unref?.();
  };

  const onVisibilityChange = () => {
    if (isDocHiddenOrSleep()) {
      if (streamingWatchTimer) {
        clearTimeout(streamingWatchTimer);
        streamingWatchTimer = null;
      }
      clearTitleScanTimer();
      return;
    }
    if (currentMode !== 'off' && trackedStreamingTriggers.size > 0) {
      checkTrackedStreamingTriggers();
    }
    if (currentMode !== 'off' && translateTitles) {
      syncTitleObserverTargets();
      scheduleTitleScan(80);
    }
  };

  function restoreAllToolSummaries() {
    for (const reqId of toolBatchInflight.values()) {
      if (reqId) void callDaemonRpc({ action: 'cancel-translate', requestId: reqId }).catch(() => {});
    }
    toolBatchInflight.clear();
    for (const rec of Array.from(toolSummaryRecords)) {
      try {
        if (rec.tn && isConn(rec.tn) && getTnStr(rec.tn) === rec.trans) {
          setTn(rec.tn, rec.orig);
        }
        if (rec.el) ra(rec.el, 'data-op-tool-tr');
      } catch (_) {}
      if (rec.tn) toolSummaryNodeMap.delete(rec.tn);
      toolSummaryRecords.delete(rec);
    }
  }

  function setTranslateToolSummariesFlag(enabled, triggerRescan = true) {
    const next = Boolean(enabled);
    const changed = translateToolSummaries !== next;
    translateToolSummaries = next;
    if (!next) {
      restoreAllToolSummaries();
    } else if (changed && triggerRescan && currentMode !== 'off') {
      scheduleScan(30);
    }
    return changed;
  }

  function restoreAllTitles() {
    clearTitleScanTimer();
    for (const reqId of titleBatchInflight.values()) {
      if (reqId) void callDaemonRpc({ action: 'cancel-translate', requestId: reqId }).catch(() => {});
    }
    titleBatchInflight.clear();
    hasOffscreenTitles = false;
    titleInternalMutDepth += 1;
    try {
      for (const rec of Array.from(titleRecords)) {
        try {
          if (rec.tn && isConn(rec.tn) && getTnStr(rec.tn) === rec.trans) {
            setTn(rec.tn, rec.orig);
          }
          if (rec.el) ra(rec.el, 'data-op-title-tr');
        } catch (_) {}
        if (rec.tn) titleNodeMap.delete(rec.tn);
        titleRecords.delete(rec);
      }
    } finally {
      titleInternalMutDepth = Math.max(0, titleInternalMutDepth - 1);
    }
  }

  function setTranslateTitlesFlag(enabled, triggerRescan = true) {
    const next = Boolean(enabled);
    const changed = translateTitles !== next;
    translateTitles = next;
    if (!next) {
      stopTitleObserver();
      restoreAllTitles();
    } else if (currentMode !== 'off') {
      syncTitleObserverTargets();
      if (changed && triggerRescan) scheduleScan(30);
    }
    return changed;
  }

  function syncRemoteCfgMeta(res) {
    const nextTag = res?.styleTag || (res?.stylePreset ? `ai_${res.stylePreset}` : '');
    const tagChanged = setActiveStyleTag(nextTag);
    if (!hasExplicitToolSummaries && res && typeof res.translateToolSummaries === 'boolean') {
      setTranslateToolSummariesFlag(res.translateToolSummaries, false);
    }
    if (!hasExplicitTitles && res && typeof res.translateTitles === 'boolean') {
      setTranslateTitlesFlag(res.translateTitles, false);
    }
    if (!hasExplicitHostView && (res?.viewMode === 'bilingual' || res?.viewMode === 'immersive')) {
      let hasLocalPref = false;
      try { hasLocalPref = Boolean(getStore()?.getItem(VIEW_MODE_STORAGE_KEY)); } catch (_) {}
      if (!hasLocalPref && res.viewMode !== currentViewMode) {
        currentViewMode = res.viewMode;
        syncDocViewAttribute();
        refreshAllPanelViewModes(false);
      }
    }
    return tagChanged;
  }

  function ensureInitialized() {
    loadLocalStorageCache();
    loadViewModePreference();
    const rootEl = docRoot();
    if (rootEl && ga(rootEl, 'data-ag-prism-thought-owner') !== OWNER_ID) {
      sa(rootEl, 'data-ag-prism-thought-owner', OWNER_ID);
    }
    syncDocViewAttribute();
    if (!scrollBound && typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('scroll', onScrollCapture, { capture: true, passive: true });
      scrollBound = true;
    }
    if (!visBound && typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', onVisibilityChange);
      visBound = true;
    }

    if (cacheWarmed) return;
    cacheWarmed = true;
    const br = getBridge();
    if (br && typeof br.call === 'function') {
      br.call({ action: 'get-cache', limit: 40, maxChars: 80000 })
        .then((res) => {
          const tagChanged = syncRemoteCfgMeta(res);
          if (tagChanged) {
            qsa(SEL_TRIGGER).forEach((b) => {
              const p = nextSib(b);
              if (p) panelMeta.delete(p);
            });
          }
          if (res && res.entries && typeof res.entries === 'object') {
            let added = 0;
            for (const [k, v] of Object.entries(res.entries)) {
              if (putMemCache(k, v, false)) added++;
            }
            if (added > 0) persistLocalStorageCache();
          }
          scheduleScan(20);
        })
        .catch(() => {});
    }
  }

  function cancelFlushHandle(entry) {
    if (!entry) return;
    if (entry.pRaf) {
      getCafFn()?.(entry.pRaf);
      entry.pRaf = null;
    }
    if (entry.pTm) {
      clearTimeout(entry.pTm);
      entry.pTm = null;
    }
    if (entry.fTm) {
      clearTimeout(entry.fTm);
      entry.fTm = null;
    }
  }

  function cancelTranslateRequest(entry) {
    if (!entry || entry.x) return;
    entry.x = true;
    cancelFlushHandle(entry);
    if (entry.id) {
      void callDaemonRpc({ action: 'cancel-translate', requestId: entry.id }).catch(() => {});
    }
  }

  function applyPanelViewMode(panel) {
    if (!panel) return;
    const ov = findDirectOverlay(panel);
    const isFailed = ga(panel, A_FLD) === '1';
    const manualRaw = ga(panel, A_MRW);
    const shouldShowRaw = isFailed || (manualRaw === '1' ? true : manualRaw === '0' ? false : currentViewMode === 'bilingual');

    if (shouldShowRaw) sa(panel, A_SRW, '1');
    else ra(panel, A_SRW);

    if (currentViewMode === 'bilingual' && shouldShowRaw && !isFailed) sa(panel, A_BIL, '1');
    else ra(panel, A_BIL);

    if (ov) {
      const toggleBtn = findChildByClass(ov, C_TB);
      if (toggleBtn) {
        sa(toggleBtn, 'aria-pressed', String(shouldShowRaw));
        const t = getClientPack();
        stc(toggleBtn, shouldShowRaw ? t[1] : t[0]);
      }
    }
  }

  const KIND_IDX = { machine: 7, ai: 8, streaming: 9, settling: 10 };

  function refreshAllOverlayLocaleStrings() {
    const t = getClientPack();
    qsa(SEL_OVERLAY).forEach((ov) => {
      const panel = parEl(ov);
      const fb = findChildByClass(ov, C_FB);
      if (fb) {
        stc(fb, t[2]);
        fb.title = t[3];
      }
      const trc = findChildByClass(ov, C_TRC);
      if (trc && !trc.hidden) {
        const sK = ga(trc, 'data-sent-k') || '46';
        const tK = ga(trc, 'data-total-k') || '48';
        stc(trc, (t[22] || '').replace('{0}', sK).replace('{1}', tK));
      }
      const rb = findChildByClass(ov, C_RB);
      if (rb) {
        rb.title = t[4];
        sa(rb, 'aria-label', t[4]);
      }
      const tb = findChildByClass(ov, C_TB);
      if (tb) stc(tb, ga(panel, A_SRW) === '1' ? t[1] : t[0]);
      const body = findChildByClass(ov, C_BD);
      if (body) {
        const errBar = findChildByClass(body, C_EB);
        if (errBar) {
          const r = ga(errBar, 'data-fail-reason') || 'generic';
          stc(findChildByClass(errBar, C_ET), getFailureErrorText(r, t));
          stc(findChildByClass(errBar, C_RT), t[6]);
        }
        const ph = findChildByClass(body, C_PH);
        const ki = ph && KIND_IDX[ga(ph, 'data-pending-kind')];
        if (ki) stc(ph, t[ki]);
      }
    });
    qsa(`.${C_TRG}`).forEach((badge) => {
      const r = ga(badge, 'data-fail-reason') || 'generic';
      stc(badge, getTriggerBadgeText(r, t));
    });
  }

  function refreshAllPanelViewModes(resetManual = false) {
    qsa(SEL_OVERLAY).forEach((ov) => {
      const p = parEl(ov);
      if (p) {
        if (resetManual) ra(p, A_MRW);
        applyPanelViewMode(p);
      }
    });
  }

  const PANEL_CLEAN_ATTRS = [A_RDY, A_PND, A_FLD, A_FBK, A_SIG, A_SRW, A_MRW, A_BIL, A_PNL];

  function cleanOverlayKeepRaw(panel) {
    if (!panel) return;
    claimPanelEntry(panel, null);
    clearPanelStreamState(panel);
    unlockHeight(panel);
    clearPanelWaitTimer(panel);
    clearTriggerStatusBadge(panel);
    findDirectOverlay(panel)?.remove();
    raList(panel, PANEL_CLEAN_ATTRS);
  }

  function cleanSinglePanelAttributes(panel) {
    if (!panel) return;
    cleanOverlayKeepRaw(panel);
    panelMeta.delete(panel);
    rawCacheMap.delete(panel);
  }

  function releasePrismOverlays() {
    if (scrollTimer) {
      clearTimeout(scrollTimer);
      scrollTimer = null;
    }
    if (scrollBound && typeof document !== 'undefined' && document.removeEventListener) {
      document.removeEventListener('scroll', onScrollCapture, { capture: true });
      scrollBound = false;
    }
    if (visBound && typeof document !== 'undefined' && document.removeEventListener) {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      visBound = false;
    }
    clearAllStreamingWatchers();
    stopTitleObserver();
    restoreAllToolSummaries();
    restoreAllTitles();
    clearHydrateQueue();
    clearPanelHlItems(null);
    clearAllWaitTimers(false);
    for (const entry of inflightBySig.values()) cancelTranslateRequest(entry);
    inflightBySig.clear();
    qsa(SEL_OVERLAY).forEach((ov) => {
      const panel = parEl(ov);
      ov.remove();
      if (panel) cleanSinglePanelAttributes(panel);
    });
    qsa(SEL_TRIGGER).forEach((btn) => {
      clearTriggerStatusBadge(btn);
      cleanSinglePanelAttributes(nextSib(btn));
    });
    qsa(`.${C_TRG}, [data-testid="prism-thought-general-config"]`).forEach((n) => n.remove());
    const rootEl = docRoot();
    ra(rootEl, 'data-ag-prism-thought-owner');
    ra(rootEl, 'data-ag-prism-thought-view');
  }

  function isTriggerStreaming(btn) {
    if (!btn) return false;
    if (ga(btn, 'data-op-thought-state') === 'streaming' || ga(btn, 'data-ag-cs-spark-streaming') === '1') return true;
    try {
      if (
        btn.querySelector &&
        btn.querySelector(
          '.animate-shimmer-text, .animate-spin, .animate-pulse, [class*="animate-shimmer"], .ag-cs-thinking-spark[data-state="streaming"]'
        )
      ) return true;
    } catch (_) {}
    const txt = (tc(btn) || '').trim();
    if (!txt || /已思考|Thought\s+for|Thought\s+process/i.test(txt)) return false;
    return /thinking|正在思考|思考中|推演中|諗緊/i.test(txt) && !/\d+\s*(s|sec|秒|m|min|分)/i.test(txt);
  }

  function isOverlayOrIgnoredElement(el) {
    if (!el || el.nodeType !== 1) return false;
    if (hasAttr(el, 'data-op-thought') || hasAttr(el, 'data-prism-ignore')) return true;
    const cls = String(ga(el, 'class') || el.className || '');
    return cls.includes('ag-prism-thought-overlay') || cls.includes('-zh-overlay');
  }

  // Strict security whitelist: ONLY allow `file://` URIs; reject `javascript:`, `data:`, `vbscript:`, `http(s):`, etc.
  function sanitizeFileHref(rawHref) {
    const trimmed = trm(rawHref).replace(/^<|>$/g, '');
    if (!trimmed || /[\u0000-\u001f\u007f"'<>`]/.test(trimmed) || !/^file:\/\//i.test(trimmed)) return '';
    try {
      if (typeof URL === 'function') {
        const parsed = new URL(trimmed);
        return parsed.protocol === 'file:' ? parsed.href : '';
      }
    } catch {
      return '';
    }
    return /^file:\/\/[^\s"'<>`]+$/i.test(trimmed) ? trimmed : '';
  }

  function filePathToSafeHref(rawPath) {
    const p = trm(rawPath);
    if (!p || /[\u0000-\u001f\u007f"'<>`]/.test(p)) return '';
    if (/^file:\/\//i.test(p)) return sanitizeFileHref(p);
    if (/^[A-Za-z]:[\\/]/.test(p)) return sanitizeFileHref('file:///' + p.replace(/\\/g, '/'));
    return p.startsWith('/') ? sanitizeFileHref('file://' + p) : '';
  }

  function normalizeFileHrefForMatch(href) {
    const safe = sanitizeFileHref(href);
    if (!safe) return '';
    let s = safe;
    try { s = decodeURIComponent(safe); } catch (_) {}
    return low(s.replace(/\\/g, '/'));
  }

  function parseFileHrefParts(safeHref) {
    const hi = safeHref.indexOf('#');
    const bh = hi >= 0 ? safeHref.slice(0, hi) : safeHref;
    const h = hi >= 0 ? safeHref.slice(hi) : '';
    let dp = bh.replace(/^file:\/\/(?:localhost)?/i, '');
    try { dp = decodeURIComponent(dp); } catch (_) {}
    dp = dp.replace(/\\/g, '/');
    const segs = dp.split('/').filter(Boolean);
    const bn = segs.length ? segs[segs.length - 1] : '';
    return { bh, h, dp, bn, pb: segs.length >= 2 ? `${segs[segs.length - 2]}/${bn}` : bn };
  }

  function normalizeLineHashSuffix(rawLinePart) {
    if (!rawLinePart) return '';
    if (/^#L\d+/i.test(rawLinePart)) {
      const m = /^#L(\d+)(?:-L?(\d+))?/i.exec(rawLinePart);
      return m ? (m[2] ? `#L${m[1]}-L${m[2]}` : `#L${m[1]}`) : '';
    }
    const colon = /^:(\d+)(?:-(\d+))?/.exec(rawLinePart);
    if (colon) {
      return colon[2] ? `#L${colon[1]}-L${colon[2]}` : `#L${colon[1]}`;
    }
    return '';
  }

  function createEmptyFileMap() {
    return { l: [], n: new Map(), t: new Map(), b: new Map() };
  }

  function registerFileNodeInMap(node, fm) {
    if (!node || !fm) return;
    const tag = node.tagName ? String(node.tagName).toUpperCase() : '';
    const rawHref = (tag === 'A' && (ga(node, 'href') || node.href)) || ga(node, 'data-file-href') || ga(node, 'data-href') || '';
    let safeHref = sanitizeFileHref(rawHref);
    let omniRel = '';
    if (!safeHref) {
      const rawPath = ga(node, 'data-file-path') || ga(node, 'data-filepath') || ga(node, 'data-omni-path') || '';
      if (rawPath) {
        const ls = ga(node, 'data-line') || ga(node, 'data-omni-line-start') || '';
        const le = ga(node, 'data-omni-line-end') || '';
        const hashSfx = ls && /^\d+$/.test(ls) ? (le && /^\d+$/.test(le) && le !== ls ? `#L${ls}-L${le}` : `#L${ls}`) : '';
        const base = filePathToSafeHref(rawPath);
        if (base) safeHref = hashSfx ? `${base}${hashSfx}` : base;
        else if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(rawPath) && !/[\u0000-\u001f\u007f"'<>`]/.test(rawPath)) {
          omniRel = `${rawPath.trim().replace(/\\/g, '/')}${hashSfx}`;
        }
      }
    }
    if (!safeHref && !omniRel) return;

    const label = String(tc(node) || '').trim().replace(/^`+|`+$/g, '').trim();
    let rec;
    let bname = '';
    let pbase = '';
    let hsh = '';
    let extraBase = '';

    if (!safeHref) {
      const hi = omniRel.indexOf('#');
      const baseRel = hi >= 0 ? omniRel.slice(0, hi) : omniRel;
      hsh = hi >= 0 ? omniRel.slice(hi) : '';
      const segs = baseRel.split('/').filter(Boolean);
      bname = segs.length ? segs[segs.length - 1] : '';
      pbase = segs.length >= 2 ? `${segs[segs.length - 2]}/${bname}` : bname;
      extraBase = baseRel;
      rec = { e: node, u: '', r: omniRel, br: baseRel, bh: '', h: hsh, dp: `/${baseRel.toLowerCase()}` };
    } else {
      const nh = normalizeFileHrefForMatch(safeHref);
      const pts = parseFileHrefParts(safeHref);
      bname = pts.bn;
      pbase = pts.pb;
      hsh = pts.h;
      rec = { e: node, u: safeHref, r: '', br: '', bh: pts.bh, h: hsh, dp: pts.dp.toLowerCase() };
      if (!fm.n.has(nh)) fm.n.set(nh, rec);
    }

    fm.l.push(rec);
    const addMap = (mp, k) => {
      const key = String(k || '').trim().replace(/\\/g, '/').toLowerCase();
      if (key && !mp.has(key)) mp.set(key, rec);
    };
    if (label && (/[./\\]/.test(label) || /#L\d+/i.test(label))) {
      addMap(fm.t, label);
      if (!/#L\d+|:\d+/i.test(label)) addMap(fm.b, label);
    }
    if (bname && bname.includes('.')) {
      if (hsh) {
        addMap(fm.t, `${bname}${hsh}`);
        if (pbase !== bname) addMap(fm.t, `${pbase}${hsh}`);
      }
      addMap(fm.b, bname);
      if (pbase !== bname) addMap(fm.b, pbase);
      if (extraBase) addMap(fm.b, extraBase);
    }
  }

  function collectCleanText(node, chunks, fm) {
    if (!node) return;
    const nt = node.nodeType;
    if (nt === 3) {
      if (node[K_NV] !== undefined && node[K_NV] !== null) chunks.push(node[K_NV]);
      else if (tc(node)) chunks.push(tc(node));
      return;
    }
    if (nt !== 1 || isOverlayOrIgnoredElement(node)) return;
    const tag = node.tagName ? String(node.tagName).toUpperCase() : '';
    if (SKIP_TAGS.has(tag)) return;
    if (tag === 'BR') {
      chunks.push('\n');
      return;
    }
    if (fm) registerFileNodeInMap(node, fm);
    const isBlock = BLOCK_TAGS.has(tag);
    if (isBlock) chunks.push('\n');
    const chs = node[K_CN];
    if (chs && chs.length) {
      for (let i = 0; i < chs.length; i++) collectCleanText(chs[i], chunks, fm);
    } else if (typeof tc(node) === 'string' && (!node.children || !node.children.length)) {
      chunks.push(tc(node));
    }
    if (isBlock) chunks.push('\n');
  }

  function extractPanelInfo(panel) {
    const chs = panel && panel[K_CN];
    if (!chs) return { s: '', t: '', k: '', z: true };
    const activeLang = resolveActiveLang();
    const stp = quickPanelStamp(panel);
    const hit = rawCacheMap.get(panel);
    if (hit && hit.s === stp && panelFileMaps.has(panel)) {
      if (hit.l !== activeLang) {
        hit.z = isAlreadyTargetLang(hit.t, activeLang);
        hit.l = activeLang;
      }
      return hit;
    }
    const chunks = [];
    const fm = createEmptyFileMap();
    for (let i = 0; i < chs.length; i++) collectCleanText(chs[i], chunks, fm);
    panelFileMaps.set(panel, fm);
    const rt = normalizeTextKey(chunks.join(''));
    const rec = { s: stp, t: rt, k: computeSkelBody(rt), z: isAlreadyTargetLang(rt, activeLang), l: activeLang };
    rawCacheMap.set(panel, rec);
    return rec;
  }

  const extractRawEnglishText = (panel) => extractPanelInfo(panel).t;

  function ensurePanelFileMap(panel) {
    if (!panel) return null;
    if (!panelFileMaps.has(panel)) extractRawEnglishText(panel);
    return panelFileMaps.get(panel) || null;
  }

  function lookupFileTarget(fm, rawCandidate) {
    const cleaned = String(rawCandidate || '').trim().replace(/^`+|`+$/g, '').trim();
    if (!cleaned) return null;

    if (/^file:\/\//i.test(cleaned)) {
      const safe = sanitizeFileHref(cleaned);
      if (!safe) return null;
      const hit = fm ? fm.n.get(normalizeFileHrefForMatch(safe)) : null;
      return { u: safe, e: hit ? hit.e : null };
    }

    if (!fm || !fm.l.length) return null;

    const normToken = cleaned.replace(/\\/g, '/').replace(/^\.\//, '');
    const exactHit = fm.t.get(normToken.toLowerCase());
    if (exactHit) return { u: exactHit.u, r: exactHit.r, e: exactHit.e };

    const lineSplit = /^(.+?)(#L\d+(?:-L?\d+)?|:\d+(?:-\d+)?(?::\d+)?)$/i.exec(normToken);
    const basePart = (lineSplit ? lineSplit[1] : normToken).toLowerCase();
    const normHash = lineSplit ? normalizeLineHashSuffix(lineSplit[2]) : '';

    if (normHash) {
      const withHashHit = fm.t.get(`${basePart}${normHash.toLowerCase()}`);
      if (withHashHit) return { u: withHashHit.u, r: withHashHit.r, e: withHashHit.e };
    }

    let baseRec = fm.b.get(basePart) || null;
    if (!baseRec && basePart.includes('/')) {
      const suffix = `/${basePart}`;
      for (let i = 0; i < fm.l.length; i++) {
        if (fm.l[i].dp.endsWith(suffix)) {
          baseRec = fm.l[i];
          break;
        }
      }
    }
    if (!baseRec) return null;

    const sameHash = !normHash || baseRec.h.toLowerCase() === normHash.toLowerCase();
    if (baseRec.r && !baseRec.u) {
      return { u: '', r: normHash ? `${baseRec.br}${normHash}` : baseRec.r, e: sameHash ? baseRec.e : null };
    }

    if (normHash) {
      const composedHref = sanitizeFileHref(`${baseRec.bh}${normHash}`);
      if (!composedHref) return null;
      const exactAnchor = fm.n.get(normalizeFileHrefForMatch(composedHref));
      return { u: composedHref, r: '', e: exactAnchor ? exactAnchor.e : !baseRec.h || sameHash ? baseRec.e : null };
    }

    return { u: baseRec.u, r: '', e: baseRec.e };
  }

  function findLiveAnchorInTree(node, targetNormHref, targetBaseHref, out) {
    if (!node || node.nodeType !== 1 || isOverlayOrIgnoredElement(node)) return;
    const tag = node.tagName ? String(node.tagName).toUpperCase() : '';
    if (tag === 'A' || ga(node, 'data-file-href') || ga(node, 'data-file-path')) {
      const safe = sanitizeFileHref(ga(node, 'href') || ga(node, 'data-file-href') || node.href || '');
      if (safe) {
        if (normalizeFileHrefForMatch(safe) === targetNormHref && !out.e) {
          out.e = node;
          return;
        }
        if (parseFileHrefParts(safe).bh.toLowerCase() === targetBaseHref && !out.b) out.b = node;
      }
    }
    const chs = node.children || node[K_CN];
    if (chs && chs.length) {
      for (let i = 0; i < chs.length && !out.e; i++) findLiveAnchorInTree(chs[i], targetNormHref, targetBaseHref, out);
    }
  }

  function resolveLiveNativeAnchor(panel, safeHref, cachedEl) {
    if (isConn(cachedEl) && typeof cachedEl.click === 'function') return cachedEl;
    const cns = panel && panel[K_CN];
    if (!cns) return null;
    const tNorm = normalizeFileHrefForMatch(safeHref);
    const tBase = parseFileHrefParts(safeHref).bh.toLowerCase();
    const out = { e: null, b: null };
    for (let i = 0; i < cns.length && !out.e; i++) findLiveAnchorInTree(cns[i], tNorm, tBase, out);
    return out.e || out.b || null;
  }

  function openInOmniFallback(rawPathOrUri, safeHref, ev) {
    const omni = W.__agPrismOmni;
    if (!omni || typeof omni.openFile !== 'function') return false;
    let filePath = String(rawPathOrUri || safeHref || '').trim();
    if (!filePath) return false;
    let hSrc = filePath;
    if (safeHref) {
      const parts = parseFileHrefParts(safeHref);
      hSrc = parts.h || '';
      filePath = (parts.dp || safeHref).replace(/^\/([A-Za-z]:\/)/, '$1');
    }
    const hm = /#L(\d+)(?:-L?(\d+))?$/i.exec(hSrc);
    const lineStart = hm ? parseInt(hm[1], 10) : null;
    const lineEnd = hm && hm[2] ? parseInt(hm[2], 10) : lineStart;
    if (!safeHref && hm) filePath = filePath.slice(0, hm.index);
    stopEv(ev);
    void omni.openFile(filePath, {
      mode: ev && (ev.ctrlKey || ev.metaKey) ? 'external' : 'workbench',
      rawUri: safeHref || undefined,
      lineStart,
      lineEnd,
    });
    return true;
  }

  function createFilePill(doc, labelText, targetHref, nativeEl, panel, omniRel = '') {
    const safeHref = sanitizeFileHref(targetHref);
    const cleanRel =
      !safeHref && omniRel && !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(omniRel) && !/[\u0000-\u001f\u007f"'<>`]/.test(omniRel)
        ? String(omniRel).trim()
        : '';
    if (!safeHref && !cleanRel) return ctn(doc, labelText);
    const pill = ce(doc, safeHref ? 'a' : 'span', 'ag-prism-thought-file-pill');
    if (safeHref) {
      sa(pill, 'href', safeHref);
      sa(pill, 'title', safeHref);
    } else {
      sa(pill, 'role', 'link');
      sa(pill, 'tabindex', '0');
      sa(pill, 'data-file-path', cleanRel);
      sa(pill, 'title', cleanRel);
    }
    sa(pill, 'data-file-pill', '1');
    stc(pill, labelText);
    onClk(pill, (ev) => {
      if (ev && typeof ev.button === 'number' && ev.button !== 0) return;
      const targetAnchor = safeHref
        ? resolveLiveNativeAnchor(panel, safeHref, nativeEl)
        : isConn(nativeEl) && typeof nativeEl.click === 'function'
        ? nativeEl
        : null;
      if (targetAnchor && targetAnchor !== pill && typeof targetAnchor.click === 'function') {
        stopEv(ev);
        targetAnchor.click();
        return;
      }
      openInOmniFallback(cleanRel || safeHref, safeHref, ev);
    });
    return pill;
  }

  function appendPlainTextWithFileRefs(parent, plainSlice, doc, fm, panel) {
    if (!plainSlice) return;
    const refRe =
      /(file:\/\/[^\s"'<>()`\uff0c\u3002\uff1b\uff01\uff1f\u3001\uff08\uff09\u3010\u3011\]]+|(?:[A-Za-z0-9_.-]+[\\/])*[A-Za-z0-9_.-]+\.[A-Za-z0-9]{1,8}(?:#L\d+(?:-L?\d+)?|:\d+(?:-\d+)?)?)/g;
    let last = 0;
    let m;
    while ((m = refRe.exec(plainSlice)) !== null) {
      let rawTok = m[0];
      let trailing = '';
      if (/^file:\/\//i.test(rawTok)) {
        const stripped = rawTok.replace(/[.,;:!?]+$/, '');
        trailing = rawTok.slice(stripped.length);
        rawTok = stripped;
      }
      const hit = lookupFileTarget(fm, rawTok);
      if (hit && (hit.u || hit.r)) {
        if (m.index > last) ap(parent, ctn(doc, plainSlice.slice(last, m.index)));
        let displayLabel = rawTok;
        if (/^file:\/\//i.test(rawTok) && hit.u) {
          const parts = parseFileHrefParts(hit.u);
          displayLabel = parts.bn ? `${parts.bn}${parts.h}` : rawTok;
        }
        ap(parent, createFilePill(doc, displayLabel, hit.u, hit.e, panel, hit.r));
        if (trailing) ap(parent, ctn(doc, trailing));
        last = m.index + m[0].length;
      }
    }
    if (last < plainSlice.length) ap(parent, ctn(doc, plainSlice.slice(last)));
  }

  function appendInlineFormatted(parent, lineText, doc, fm, panel, depth = 0) {
    const tokenRe = /(\[([^\[\]\n]+)\]\(((?:\([^()\s]*\)|[^()\s])+)\)|`([^`\n]+)`|\*\*([^*\n]+)\*\*)/g;
    let lastIdx = 0;
    let m;
    while ((m = tokenRe.exec(lineText)) !== null) {
      if (m.index > lastIdx) appendPlainTextWithFileRefs(parent, lineText.slice(lastIdx, m.index), doc, fm, panel);
      if (m[2] !== undefined && m[3] !== undefined) {
        const cleanLabel = m[2].trim().replace(/^`+|`+$/g, '').trim() || m[2].trim();
        const rawUrl = m[3].trim();
        const safeHref = sanitizeFileHref(rawUrl);
        if (safeHref) {
          const hit = lookupFileTarget(fm, safeHref) || lookupFileTarget(fm, cleanLabel);
          ap(parent, createFilePill(doc, cleanLabel, safeHref, hit ? hit.e : null, panel));
        } else if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(rawUrl)) {
          const mapped = lookupFileTarget(fm, rawUrl) || lookupFileTarget(fm, cleanLabel);
          if (mapped && (mapped.u || mapped.r)) {
            ap(parent, createFilePill(doc, cleanLabel, mapped.u, mapped.e, panel, mapped.r));
          } else {
            ap(parent, ctn(doc, cleanLabel));
          }
        } else {
          ap(parent, ctn(doc, cleanLabel));
        }
      } else if (m[4] !== undefined) {
        const codeInner = m[4];
        const hit = lookupFileTarget(fm, codeInner);
        if (hit && (hit.u || hit.r)) {
          ap(parent, createFilePill(doc, codeInner.trim(), hit.u, hit.e, panel, hit.r));
        } else {
          const code = ce(doc, 'code', 'ag-prism-thought-code');
          stc(code, codeInner);
          ap(parent, code);
        }
      } else if (m[5] !== undefined) {
        const strong = ce(doc, 'strong');
        if (depth < 2) appendInlineFormatted(strong, m[5], doc, fm, panel, depth + 1);
        else stc(strong, m[5]);
        ap(parent, strong);
      }
      lastIdx = m.index + m[0].length;
    }
    if (lastIdx < lineText.length) appendPlainTextWithFileRefs(parent, lineText.slice(lastIdx), doc, fm, panel);
  }

  function quickStructureSig(panel) {
    const nodes = panel && panel[K_CN];
    if (!nodes) return null;
    let c = 0;
    let f = null;
    let l = null;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.nodeType === 1 && isOverlayOrIgnoredElement(n)) continue;
      c++;
      if (c === 1) f = n;
      l = n;
    }
    return { c, f, l };
  }

  const leafStr = (n) => {
    if (!n) return '';
    if (n.nodeType === 3) return n[K_NV] || '';
    const cns = n[K_CN];
    return cns && cns.length === 1 && cns[0].nodeType === 3 ? cns[0][K_NV] || '' : tc(n) || '';
  };

  function hashSampleStr(h, s) {
    const len = s.length;
    h ^= len;
    h = Math.imul(h, 16777619);
    if (len <= 64) {
      for (let i = 0; i < len; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return h;
    }
    for (let i = 0; i < 24; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const q1 = len >> 2;
    const mid = len >> 1;
    const q3 = (len * 3) >> 2;
    for (const off of [q1, mid, q3]) {
      for (let j = 0; j < 8 && off + j < len; j++) {
        h ^= s.charCodeAt(off + j);
        h = Math.imul(h, 16777619);
      }
    }
    for (let i = len - 24; i < len; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h;
  }

  function quickPanelStamp(panel) {
    const nodes = panel && panel[K_CN];
    if (!nodes || !nodes.length) return '';
    let c = 0;
    let totalLen = 0;
    let h = 2166136261;
    const nLen = nodes.length;
    for (let i = 0; i < nLen; i++) {
      const n = nodes[i];
      if (n.nodeType === 1 && isOverlayOrIgnoredElement(n)) continue;
      c++;
      const s = leafStr(n);
      totalLen += s.length;
      if (c <= 16 || i >= nLen - 4) {
        h = hashSampleStr(h, s);
      } else {
        h ^= s.length;
        h = Math.imul(h, 16777619);
      }
    }
    if (!c) return '';
    return `${c}:${totalLen}:${(h >>> 0).toString(36)}`;
  }

  function splitMarkdownBlocks(markdownText, isStreaming = false, metaOut = null) {
    const src = String(markdownText || '');
    const lines = src.split('\n');
    const lastLineIdx = lines.length - 1;
    const blocks = [];
    let inFence = false;
    let fenceLines = [];
    let cursor = 0;
    let safeEnd = 0;
    let safeCount = 0;
    for (let i = 0; i <= lastLineIdx; i++) {
      const origLine = lines[i];
      const nextCursor = cursor + origLine.length + (i < lastLineIdx ? 1 : 0);
      const rawLine = origLine.endsWith('\r') ? origLine.slice(0, -1) : origLine;
      const trimmed = rawLine.trim();
      const isTailLine = isStreaming && i === lastLineIdx;
      let commitSafe = false;
      if (!inFence && trimmed.startsWith('```')) {
        inFence = true;
        fenceLines = [];
      } else if (inFence && /^`{3,}\s*$/.test(trimmed)) {
        blocks.push({ k: 'pre', x: fenceLines.join('\n') });
        inFence = false;
        fenceLines = [];
        commitSafe = true;
      } else if (inFence) {
        if (!isTailLine || !/^`{1,2}$/.test(trimmed)) fenceLines.push(rawLine);
      } else if (!trimmed) {
        commitSafe = true;
      } else if (!(isTailLine && (/^`{1,2}$/.test(trimmed) || /^[-*•]$/.test(trimmed) || /^\d{1,3}[.)]?$/.test(trimmed) || /^#{1,4}$/.test(trimmed)))) {
        const ulMatch = /^[-*•]\s+(.+)$/.exec(trimmed);
        const olMatch = !ulMatch && /^\d+[.)]\s+(.+)$/.exec(trimmed);
        blocks.push(ulMatch ? { k: 'ul', x: ulMatch[1] } : olMatch ? { k: 'ol', x: olMatch[1] } : { k: 'p', x: trimmed.replace(/^#{1,4}\s+/, '') });
        commitSafe = true;
      }
      if (commitSafe && !isTailLine) {
        safeEnd = nextCursor;
        safeCount = blocks.length;
      }
      cursor = nextCursor;
    }
    if (inFence && fenceLines.length) blocks.push({ k: 'pre', x: fenceLines.join('\n') });
    if (metaOut) {
      metaOut.se = safeEnd;
      metaOut.sc = safeCount;
    }
    return blocks;
  }

  function advanceSafeChunkEnd(str, fromIdx, rawTake) {
    const len = str.length;
    let end = Math.min(len, fromIdx + Math.max(1, rawTake));
    if (end >= len) return len;
    const prevCode = str.charCodeAt(end - 1);
    if (prevCode >= 0xd800 && prevCode <= 0xdbff && end < len) end++;
    const curCh = str.charCodeAt(end - 1);
    const isAsciiWord = (c) => (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 95;
    if (isAsciiWord(curCh)) {
      let look = end;
      while (look < len && look - end < 18 && isAsciiWord(str.charCodeAt(look))) look++;
      if (look >= len || !isAsciiWord(str.charCodeAt(look))) end = look;
    }
    if (end < len && /[,.;:!?，。、；：！？）》」\]`]/.test(str[end])) end++;
    return end;
  }

  function compactLiveChunks(st, now, flushAll) {
    if (!st || !st.cks.length) return;
    while (st.cks.length > 0 && (flushAll || now - st.cks[0].at >= CHUNK_FADE_TTL_MS || st.cks.length >= MAX_LIVE_CHUNKS)) {
      const old = st.cks.shift();
      if (old.tn) appendTn(old.tn, old.tx);
      old.sp.remove();
    }
  }

  function mountStreamBlockContainer(st, blockType, doc, body) {
    if (blockType === 'ul' || blockType === 'ol') {
      if (!st.le || st.lt !== blockType) {
        st.le = ce(doc, blockType, blockType === 'ul' ? 'ag-prism-thought-ul' : 'ag-prism-thought-ol');
        st.lt = blockType;
        ap(body, st.le);
      }
      return ap(st.le, ce(doc, 'li', 'ag-prism-thought-li'));
    }
    st.le = null;
    st.lt = '';
    return ap(body, ce(doc, blockType === 'pre' ? 'pre' : 'p', blockType === 'pre' ? 'ag-prism-thought-pre' : 'ag-prism-thought-p'));
  }

  const INLINE_MD_HINT_RE = /[`*\[]|file:\/\/|[A-Za-z0-9_.-]+\.[A-Za-z0-9]{1,8}/;

  function upgradeBlockInlineInPlace(el, blk, doc, panel) {
    if (!el || !blk || blk.k === 'pre') return;
    if (!INLINE_MD_HINT_RE.test(blk.x)) return;
    clearEl(el);
    appendInlineFormatted(el, blk.x, doc, ensurePanelFileMap(panel), panel, 0);
  }

  function renderIncrementalStreamDom(panel, body, visibleText, now, animateChunks) {
    const doc = docOf(panel);
    const hlBks = animateChunks ? getCssHlBuckets() : null;
    sa(body, 'data-streaming-live', '1');
    ra(body, 'data-raw-zh');

    let st = panelStreamStates.get(panel);
    const splitMeta = { se: 0, sc: 0, cr: false };
    let baseCount = 0;
    let baseEnd = 0;
    let tailBlocks = null;
    const canFastTail = Boolean(
      st &&
        st.bd === body &&
        st.lEnd > 0 &&
        st.lCnt > 0 &&
        st.lCnt < st.bs.length &&
        typeof st.lSrc === 'string' &&
        visibleText.length >= st.lEnd &&
        visibleText.startsWith(st.lSrc)
    );
    if (canFastTail) {
      baseCount = st.lCnt;
      baseEnd = st.lEnd;
      tailBlocks = splitMarkdownBlocks(visibleText.slice(baseEnd), true, splitMeta);
    } else {
      tailBlocks = splitMarkdownBlocks(visibleText, true, splitMeta);
    }
    const totalLen = baseCount + tailBlocks.length;
    if (!totalLen) return;
    const blockAt = (idx) => (idx < baseCount ? st.bs[idx] : tailBlocks[idx - baseCount]);

    let diverged = !st || st.bd !== body || totalLen < st.bs.length;
    if (!diverged) {
      const checkLen = Math.min(st.bs.length - 1, totalLen - 1);
      for (let i = baseCount; i < checkLen; i++) {
        const blk = blockAt(i);
        if (st.bs[i].k !== blk.k || st.bs[i].x !== blk.x) {
          diverged = true;
          break;
        }
      }
    }

    if (diverged) {
      if (canFastTail) {
        baseCount = 0;
        baseEnd = 0;
        tailBlocks = splitMarkdownBlocks(visibleText, true, splitMeta);
        if (!tailBlocks.length) return;
      }
      clearPanelHlItems(panel);
      clearEl(body);
      st = { bd: body, bs: [], el: null, tn: null, raw: '', tp: '', le: null, lt: '', cks: [], lEnd: 0, lCnt: 0, lSrc: '' };
      panelStreamStates.set(panel, st);
    }

    const lastIdx = baseCount + tailBlocks.length - 1;

    if (st.bs.length > 0 && st.bs.length - 1 < lastIdx) {
      const prevIdx = st.bs.length - 1;
      const targetPrev = blockAt(prevIdx);
      if (st.el && st.tn) {
        const needsFmt = targetPrev.k !== 'pre' && INLINE_MD_HINT_RE.test(targetPrev.x);
        if (needsFmt) {
          const prevTn = st.tn;
          st.cks = st.cks.filter((c) => (c.tn === prevTn ? (c.sp.remove(), false) : true));
          clearPanelHlItems(panel);
          upgradeBlockInlineInPlace(st.el, targetPrev, doc, panel);
        } else if (targetPrev.x.startsWith(st.raw) && targetPrev.x.length > st.raw.length) {
          const tail = targetPrev.x.slice(st.raw.length);
          if (animateChunks && targetPrev.k !== 'pre' && !hlBks) {
            compactLiveChunks(st, now, false);
            const sp = ce(doc, 'span', C_CK);
            stc(sp, tail);
            ap(st.el, sp);
            st.cks.push({ sp, tn: st.tn, tx: tail, at: now });
          } else {
            compactLiveChunks(st, now, true);
            const prevLen = getTnStr(st.tn).length;
            appendTn(st.tn, tail);
            if (hlBks && targetPrev.k !== 'pre') pushHlSlice(panel, doc, st.tn, prevLen, prevLen + tail.length, now, hlBks);
          }
        } else if (targetPrev.x !== st.raw) {
          clearPanelHlItems(panel);
          compactLiveChunks(st, now, true);
          setTn(st.tn, targetPrev.x);
        }
        st.bs[prevIdx] = { k: targetPrev.k, x: targetPrev.x, el: st.el };
      }
      st.el = null;
      st.tn = null;
      st.raw = '';
      st.tp = '';
    }

    while (st.bs.length < lastIdx) {
      const blk = blockAt(st.bs.length);
      const el = mountStreamBlockContainer(st, blk.k, doc, body);
      if (blk.k === 'pre') stc(el, blk.x);
      else appendInlineFormatted(el, blk.x, doc, ensurePanelFileMap(panel), panel, 0);
      st.bs.push({ k: blk.k, x: blk.x, el });
    }

    const curBlk = blockAt(lastIdx);
    if (!st.el || st.tp !== curBlk.k) {
      if (st.el && st.bs.length > lastIdx) {
        const staleTn = st.tn;
        st.cks = st.cks.filter((c) => (c.tn === staleTn ? (c.sp.remove(), false) : true));
        clearPanelHlItems(panel);
        st.el.remove();
      }
      const el = mountStreamBlockContainer(st, curBlk.k, doc, body);
      const tn = ap(el, ctn(doc, ''));
      st.el = el;
      st.tn = tn;
      st.raw = '';
      st.tp = curBlk.k;
      st.bs[lastIdx] = { k: curBlk.k, x: '', el };
    }

    if (!animateChunks || curBlk.k === 'pre' || hlBks) compactLiveChunks(st, now, true);
    if (curBlk.x === st.raw) {
      if (!hlBks) compactLiveChunks(st, now, false);
    } else if (curBlk.x.startsWith(st.raw)) {
      const delta = curBlk.x.slice(st.raw.length);
      if (!animateChunks || curBlk.k === 'pre' || hlBks) {
        const prevLen = getTnStr(st.tn).length;
        appendTn(st.tn, delta);
        if (hlBks && curBlk.k !== 'pre') pushHlSlice(panel, doc, st.tn, prevLen, prevLen + delta.length, now, hlBks);
      } else {
        compactLiveChunks(st, now, false);
        const sp = ce(doc, 'span', C_CK);
        stc(sp, delta);
        ap(st.el, sp);
        st.cks.push({ sp, tn: st.tn, tx: delta, at: now });
      }
      st.raw = curBlk.x;
      st.bs[lastIdx].x = curBlk.x;
      st.bs[lastIdx].el = st.el;
    } else {
      clearPanelHlItems(panel);
      const activeTn = st.tn;
      st.cks = st.cks.filter((c) => (c.tn === activeTn ? (c.sp.remove(), false) : true));
      setTn(activeTn, curBlk.x);
      st.raw = curBlk.x;
      st.bs[lastIdx].x = curBlk.x;
      st.bs[lastIdx].el = st.el;
    }

    // Advance O(1) incremental checkpoint past fully closed pre-tail blocks (works identically for LF and CRLF)
    if (splitMeta.se > 0 && splitMeta.sc > 0) {
      const nextSafeCnt = baseCount + splitMeta.sc;
      const nextSafeEnd = baseEnd + splitMeta.se;
      if (nextSafeCnt < st.bs.length && nextSafeEnd > (st.lEnd || 0) && nextSafeEnd < visibleText.length) {
        st.lCnt = nextSafeCnt;
        st.lEnd = nextSafeEnd;
        st.lSrc = visibleText.slice(0, nextSafeEnd);
      }
    }
  }

  function renderSafeMarkdownDom(container, markdownText, fm, panel, prevStreamState = null) {
    if (!hasAttr(container, 'data-streaming-live') && !findChildByClass(container, C_EB) && ga(container, 'data-raw-zh') === markdownText) {
      return;
    }
    ra(container, 'data-streaming-live');
    const doc = docOf(container);
    sa(container, 'data-raw-zh', markdownText);

    const blocks = splitMarkdownBlocks(markdownText, false);
    if (
      prevStreamState &&
      prevStreamState.bd === container &&
      blocks.length > 0 &&
      prevStreamState.bs.length === blocks.length &&
      prevStreamState.el &&
      prevStreamState.tp === blocks[blocks.length - 1].k
    ) {
      let reusable = true;
      for (let i = 0; i < blocks.length - 1; i++) {
        if (prevStreamState.bs[i].k !== blocks[i].k || prevStreamState.bs[i].x !== blocks[i].x) {
          reusable = false;
          break;
        }
      }
      if (reusable) {
        compactLiveChunks(prevStreamState, 0, true);
        const tailBlk = blocks[blocks.length - 1];
        if (tailBlk.k === 'pre') stc(prevStreamState.el, tailBlk.x);
        else if (INLINE_MD_HINT_RE.test(tailBlk.x)) {
          clearEl(prevStreamState.el);
          appendInlineFormatted(prevStreamState.el, tailBlk.x, doc, fm, panel, 0);
        } else if (prevStreamState.tn && getTnStr(prevStreamState.tn) !== tailBlk.x) {
          setTn(prevStreamState.tn, tailBlk.x);
        }
        return;
      }
    }

    clearEl(container);
    const listCtx = { le: null, lt: '' };
    for (let i = 0; i < blocks.length; i++) {
      const blk = blocks[i];
      const el = mountStreamBlockContainer(listCtx, blk.k, doc, container);
      if (blk.k === 'pre') stc(el, blk.x);
      else appendInlineFormatted(el, blk.x, doc, fm, panel, 0);
    }
  }

  const findDirectOverlay = (panel) => findChildByClass(panel, C_OV);

  function retryPanelNow(panel, fallbackRawText = '', fallbackMode = '', oldSig = '') {
    if (!panel) return false;
    const activeMode = currentMode === 'off' ? fallbackMode : currentMode;
    if (!activeMode || activeMode === 'off') return false;
    if (oldSig) failedSigs.delete(oldSig);
    clearTriggerStatusBadge(panel);
    const ov = findDirectOverlay(panel);
    if (ov) ra(ov, 'data-failed');
    ra(panel, A_FLD);
    applyPanelViewMode(panel);
    const inf = extractPanelInfo(panel);
    const curRaw = inf.t || fallbackRawText;
    if (!curRaw) return false;
    const activeLang = resolveActiveLang();
    const kb = inf.t ? inf.k : computeSkelBody(normalizeTextKey(curRaw));
    const nextSig = sigFromBody(kb, activeMode, activeLang);
    failedSigs.delete(nextSig);
    const pm = panelMeta.get(panel);
    if (pm && pm.skippedSig) {
      delete pm.skippedSig;
      panelMeta.set(panel, pm);
    }
    const existing = inflightBySig.get(nextSig);
    if (existing) {
      cancelTranslateRequest(existing);
      inflightBySig.delete(nextSig);
    }
    const exp = isPanelCurrentlyExpanded(panel);
    startOrJoinTranslation(panel, curRaw, activeMode, nextSig, `sig${kb}`, exp, {
      force: true,
      bypassCache: true,
      priority: 30000,
    });
    return true;
  }

  function triggerSingleBlockRetranslate(panel) {
    if (!panel || currentMode === 'off') return;
    const inf = extractPanelInfo(panel);
    if (!inf.t) return;
    const activeLang = resolveActiveLang();
    const sig = sigFromBody(inf.k, currentMode, activeLang);
    failedSigs.delete(sig);
    clearTriggerStatusBadge(panel);
    memCache.delete(`${withLangSuffix('mt', activeLang)}${inf.k}`);
    memCache.delete(`${withLangSuffix(activeStyleTag || 'ai_technical', activeLang)}${inf.k}`);
    const pm = panelMeta.get(panel);
    if (pm && pm.skippedSig) {
      delete pm.skippedSig;
      panelMeta.set(panel, pm);
    }
    persistLocalStorageCache();

    const existing = inflightBySig.get(sig);
    if (existing) {
      cancelTranslateRequest(existing);
      inflightBySig.delete(sig);
    }
    startOrJoinTranslation(panel, inf.t, currentMode, sig, `sig${inf.k}`, true, {
      force: true,
      bypassCache: true,
      priority: 30000,
    });
  }

  function ensureOverlayShell(panel) {
    const doc = docOf(panel);
    let ov = findDirectOverlay(panel);
    if (ov) return ov;

    const t = getClientPack();
    ov = markNoTr(ce(doc, 'div', C_OV));
    sa(ov, 'data-op-thought', '1');
    sa(ov, 'data-prism-ignore', '1');
    sa(ov, 'data-ag-no-i18n', '');

    const body = markNoTr(ce(doc, 'span', C_BD));
    sa(body, 'data-ag-no-i18n', '');
    ap(ov, body);

    const fb = markNoTr(ce(doc, 'span', C_FB));
    sa(fb, 'data-testid', 'thought-fallback-badge');
    fb.hidden = true;
    stc(fb, t[2]);
    fb.title = t[3];
    if (fb[K_ST]) fb[K_ST].display = 'none';
    ap(ov, fb);

    const trc = markNoTr(ce(doc, 'span', C_TRC));
    sa(trc, 'data-testid', 'thought-truncated-badge');
    sa(trc, 'data-op-thought', '1');
    sa(trc, 'data-prism-ignore', '1');
    sa(trc, 'data-ag-no-i18n', '');
    trc.hidden = true;
    if (trc[K_ST]) {
      trc[K_ST].display = 'none';
      trc[K_ST].marginLeft = '6px';
      trc[K_ST].padding = '1px 7px';
      trc[K_ST].borderRadius = '999px';
      trc[K_ST].fontSize = '10.5px';
      trc[K_ST].lineHeight = '16px';
      trc[K_ST].border = '1px solid var(--ag-cs-border-1,rgba(128,128,128,.28))';
      trc[K_ST].background = 'var(--ag-cs-pill-bg,rgba(128,128,128,.1))';
      trc[K_ST].color = 'var(--muted-foreground)';
    }
    ap(ov, trc);

    const rb = markNoTr(ce(doc, 'button', C_RB));
    rb.type = 'button';
    sa(rb, 'data-no-press-spring', '1');
    sa(rb, 'data-testid', 'thought-retranslate-btn');
    rb.hidden = true;
    stc(rb, '↻');
    rb.title = t[4];
    sa(rb, 'aria-label', t[4]);
    if (rb[K_ST]) rb[K_ST].display = 'none';
    onClk(rb, (ev) => {
      stopEv(ev);
      triggerSingleBlockRetranslate(panel);
    });
    ap(ov, rb);

    const tb = markNoTr(ce(doc, 'button', C_TB));
    tb.type = 'button';
    sa(tb, 'data-no-press-spring', '1');
    const showingRaw = ga(panel, A_SRW) === '1';
    sa(tb, 'aria-pressed', String(showingRaw));
    stc(tb, showingRaw ? t[1] : t[0]);
    onClk(tb, (ev) => {
      stopEv(ev);
      sa(panel, A_MRW, ga(panel, A_SRW) === '1' ? '0' : '1');
      applyPanelViewMode(panel);
    });
    ap(ov, tb);

    sa(panel, A_PNL, '1');
    panel.insertBefore(ov, panel[K_FC]);
    return ov;
  }

  function syncOverlayBadges(ov, panel, isFallback, isReady, truncInfo = null) {
    if (!ov) return;
    const t = getClientPack();
    const fb = findChildByClass(ov, C_FB);
    if (fb) {
      fb.hidden = !isFallback;
      if (fb[K_ST]) fb[K_ST].display = isFallback ? '' : 'none';
      stc(fb, t[2]);
      fb.title = t[3];
    }
    const trc = findChildByClass(ov, C_TRC);
    if (trc) {
      const showTrc = Boolean(isReady && truncInfo && truncInfo.truncated);
      trc.hidden = !showTrc;
      if (trc[K_ST]) trc[K_ST].display = showTrc ? 'inline-flex' : 'none';
      if (showTrc) {
        const sK = Math.max(1, Math.round((truncInfo.sentChars || SAFE_TRUNCATE_BUDGET) / 1000));
        const tK = Math.max(sK, Math.round((truncInfo.totalChars || sK * 1000) / 1000));
        sa(trc, 'data-sent-k', String(sK));
        sa(trc, 'data-total-k', String(tK));
        const msg = (t[22] || '').replace('{0}', String(sK)).replace('{1}', String(tK));
        stc(trc, msg);
        trc.title = msg;
      }
    }
    if (panel) {
      if (isFallback) sa(panel, A_FBK, '1');
      else ra(panel, A_FBK);
    }
    const rb = findChildByClass(ov, C_RB);
    if (rb) {
      rb.hidden = !isReady;
      if (rb[K_ST]) rb[K_ST].display = isReady ? '' : 'none';
      rb.disabled = false;
      rb.title = t[4];
      sa(rb, 'aria-label', t[4]);
    }
  }

  function renderPendingState(panel, message, pendingKind = '') {
    if (!panel) return;
    clearTriggerStatusBadge(panel);
    const existingOv = findDirectOverlay(panel);
    if (ga(panel, A_RDY) === '1' && existingOv && ga(existingOv, 'data-pending') !== '1') {
      const rb = findChildByClass(existingOv, C_RB);
      if (rb) rb.disabled = true;
      return;
    }
    clearPanelStreamState(panel);
    const ov = ensureOverlayShell(panel);
    sa(ov, 'data-pending', '1');
    ra(ov, 'data-failed');
    ra(panel, A_FLD);
    syncOverlayBadges(ov, panel, false, false);

    const body = findChildByClass(ov, C_BD);
    if (body) {
      ra(body, 'data-raw-zh');
      let hint = findChildByClass(body, C_PH);
      if (!hint) {
        clearEl(body);
        hint = ap(body, markNoTr(ce(docOf(panel), 'span', C_PH)));
      }
      if (pendingKind) sa(hint, 'data-pending-kind', pendingKind);
      if (tc(hint) !== message) stc(hint, message);
    }
    sa(panel, A_PND, '1');
    ra(panel, A_RDY);
  }

  function clearPendingKeepRaw(panel) {
    if (!panel || ga(panel, A_RDY) === '1') return;
    unlockHeight(panel);
    ra(panel, A_PND);
    const ov = findDirectOverlay(panel);
    if (ov && ga(ov, 'data-pending') === '1') {
      ov.remove();
      if (ga(panel, A_FLD) !== '1') ra(panel, A_PNL);
    }
  }

  function renderFailedState(panel, rawText, mode, sig, errInfo = null) {
    if (!panel) return;
    clearPanelStreamState(panel);
    unlockHeight(panel);
    ra(panel, A_PND);

    const failRec = getSigFailureMeta(sig);
    const reason = (errInfo && errInfo.reason) || (failRec && failRec.r) || 'generic';
    const detail = sanitizeClientErrorText((errInfo && (errInfo.detail || errInfo.error)) || (failRec && failRec.d) || '');
    syncTriggerStatusBadge(panel, reason, detail, sig, rawText, mode);

    const existingOv = findDirectOverlay(panel);
    if (ga(panel, A_RDY) === '1' && existingOv) {
      const rb = findChildByClass(existingOv, C_RB);
      if (rb) rb.disabled = false;
      return;
    }

    const doc = docOf(panel);
    const t = getClientPack();
    const ov = ensureOverlayShell(panel);
    ra(ov, 'data-pending');
    sa(ov, 'data-failed', '1');
    ra(panel, A_RDY);
    sa(panel, A_FLD, '1');
    syncOverlayBadges(ov, panel, false, false);

    const body = findChildByClass(ov, C_BD);
    if (body) {
      ra(body, 'data-raw-zh');
      clearEl(body);
      const errBar = markNoTr(ce(doc, 'span', C_EB));
      sa(errBar, 'data-fail-reason', reason);
      const reasonText = getFailureErrorText(reason, t);
      if (detail) errBar.title = `${reasonText}: ${detail}`;
      const errTxt = ce(doc, 'span', C_ET);
      stc(errTxt, reasonText);
      ap(errBar, errTxt);

      const retryBtn = markNoTr(ce(doc, 'button', C_RT));
      retryBtn.type = 'button';
      sa(retryBtn, 'data-testid', 'thought-retry-btn');
      sa(retryBtn, 'data-no-press-spring', '1');
      stc(retryBtn, t[6]);
      onClk(retryBtn, (ev) => {
        stopEv(ev);
        retryPanelNow(panel, rawText, mode, sig);
      });
      ap(errBar, retryBtn);
      ap(body, errBar);
    }
    applyPanelViewMode(panel);
  }

  function renderTranslatedText(panel, text, isPartial, sig, engine = '', streamOpts = null) {
    if (!panel || typeof text !== 'string' || !text) return;
    clearTriggerStatusBadge(panel);
    const ov = ensureOverlayShell(panel);
    ra(ov, 'data-pending');
    ra(ov, 'data-failed');
    ra(panel, A_FLD);
    const body = findChildByClass(ov, C_BD);
    if (!body) return;

    const isFallback = engine === 'machine-fallback';
    const steadyPartial =
      isPartial &&
      ga(panel, A_RDY) === '1' &&
      !hasAttr(panel, A_PND) &&
      (ga(panel, A_FBK) === '1') === isFallback;

    if (isPartial) {
      if (!lockedHeights.has(panel)) {
        const curH = panel.offsetHeight || 0;
        lockedHeights.set(panel, curH);
        if (curH > 0 && panel[K_ST]) panel[K_ST].minHeight = `${curH}px`;
      }
      renderIncrementalStreamDom(panel, body, text, streamOpts?.now || nowMs(), Boolean(streamOpts?.anim && !isMotionOff()));
      if (steadyPartial) return;
      syncOverlayBadges(ov, panel, isFallback, false);
    } else {
      const commitFinalDom = () => {
        panelSettleTimers.delete(panel);
        const prevSt = panelStreamStates.get(panel) || null;
        panelStreamStates.delete(panel);
        clearPanelHlItems(panel);
        if (!isConn(panel) || currentMode === 'off') return;
        const prevScrollTop = typeof panel.scrollTop === 'number' ? panel.scrollTop : 0;
        renderSafeMarkdownDom(body, text, ensurePanelFileMap(panel), panel, prevSt);
        unlockHeight(panel);
        if (prevScrollTop > 0 && typeof panel.scrollTop === 'number') panel.scrollTop = prevScrollTop;
      };

      const st = panelStreamStates.get(panel);
      const now = nowMs();
      let youngestAt = 0;
      if (!isMotionOff()) {
        if (st && st.cks && st.cks.length) youngestAt = st.cks[st.cks.length - 1].at;
        for (let i = hlItems.length - 1; i >= 0; i--) {
          if (hlItems[i].p === panel) {
            if (hlItems[i].at > youngestAt) youngestAt = hlItems[i].at;
            break;
          }
        }
      }
      const remFadeMs = youngestAt > 0 ? Math.max(0, CHUNK_FADE_TTL_MS - Math.max(0, now - youngestAt)) : 0;

      if (remFadeMs > 16) {
        const prevT = panelSettleTimers.get(panel);
        if (prevT) clearTimeout(prevT);
        const timer = setTimeout(commitFinalDom, remFadeMs + 12);
        if (timer && typeof timer.unref === 'function') timer.unref();
        panelSettleTimers.set(panel, timer);
      } else {
        const prevT = panelSettleTimers.get(panel);
        if (prevT) {
          clearTimeout(prevT);
          panelSettleTimers.delete(panel);
        }
        commitFinalDom();
      }

      syncOverlayBadges(ov, panel, isFallback, true, streamOpts?.truncInfo || null);
      if (sig) {
        const effectiveSig = isFallback ? `${sig}:fallback` : sig;
        sa(panel, A_SIG, effectiveSig);
        const meta = panelMeta.get(panel) || {};
        meta.ds = effectiveSig;
        meta.rs = quickPanelStamp(panel);
        panelMeta.set(panel, meta);
      }
    }

    ra(panel, A_PND);
    sa(panel, A_RDY, '1');
    applyPanelViewMode(panel);
  }

  function withLangSuffix(baseTag, lang = currentLang) {
    const tl = normalizeLangCode(lang) || resolveActiveLang();
    return tl === 'zh-CN' ? baseTag : `${baseTag}_${tl}`;
  }

  const sigFromBody = (kb, mode, lang = currentLang) => {
    const base = mode === 'machine' ? 'mt' : activeStyleTag || 'ai_pending';
    return `${withLangSuffix(base, lang)}:sig${kb}`;
  };

  function findCachedByBody(kb, mode, lang = currentLang) {
    if (!kb) return '';
    const base = mode === 'machine' ? 'mt' : activeStyleTag;
    if (!base) return '';
    return memCache.get(`${withLangSuffix(base, lang)}${kb}`) || '';
  }

  function claimPanelEntry(panel, entry) {
    if (!panel) return;
    const prev = panelActiveEntry.get(panel);
    if (prev && prev !== entry) {
      const idx = prev.ps.indexOf(panel);
      if (idx >= 0) prev.ps.splice(idx, 1);
      if (!prev.ps.length && !prev.dn) cancelTranslateRequest(prev);
    }
    if (entry) {
      panelActiveEntry.set(panel, entry);
      if (!entry.ps.includes(panel)) entry.ps.push(panel);
    } else {
      panelActiveEntry.delete(panel);
    }
  }

  function bindPanelToInflight(entry, panel, expanded) {
    if (panel) claimPanelEntry(panel, entry);
    if (panel && expanded) {
      const shown = entry.sh || entry.lp;
      if (shown) {
        renderTranslatedText(panel, shown, true, null, '', { inc: Boolean(entry.sh), anim: false, now: nowMs() });
      } else {
        const t = getClientPack();
        renderPendingState(panel, entry.m === 'machine' ? t[7] : t[8], entry.m === 'machine' ? 'machine' : 'ai');
      }
    }
  }

  function startOrJoinTranslation(panel, rawText, mode, sig, srcSkelHash, expanded, opts = {}) {
    const force = Boolean(opts.force);
    const bypassCache = Boolean(opts.bypassCache || opts.force);
    const priority = Number(opts.priority) || 0;
    const sendPlan = sliceThoughtForSafeSend(rawText);
    const truncInfo = sendPlan.truncated ? sendPlan : null;
    const skelBody = srcSkelHash && srcSkelHash.startsWith('sig') ? srcSkelHash.slice(3) : computeSkelBody(normalizeTextKey(rawText));

    if (!force) {
      const cached = findCachedByBody(skelBody, mode);
      if (cached) {
        claimPanelEntry(panel, null);
        if (panel && expanded) {
          renderTranslatedText(panel, cached, false, sig, mode === 'machine' ? 'machine' : 'ai', { truncInfo });
        }
        return;
      }
      if (isSigInCooldown(sig)) {
        claimPanelEntry(panel, null);
        const failMeta = getSigFailureMeta(sig);
        if (panel && expanded && ga(panel, A_FLD) !== '1') {
          renderFailedState(panel, rawText, mode, sig, failMeta ? { reason: failMeta.r, detail: failMeta.d } : null);
        } else if (panel && failMeta) {
          syncTriggerStatusBadge(panel, failMeta.r, failMeta.d, sig, rawText, mode);
        }
        return;
      }
      const existing = inflightBySig.get(sig);
      if (existing && !existing.x && nowMs() - existing.at <= INFLIGHT_TTL_MS) {
        bindPanelToInflight(existing, panel, expanded);
        return;
      }
      if (existing) {
        cancelFlushHandle(existing);
        inflightBySig.delete(sig);
      }
    } else {
      failedSigs.delete(sig);
    }

    const br = getBridge();
    if (!br || typeof br.translateStream !== 'function') return;

    const requestId = `op_tr_${nowMs().toString(36)}_${++reqSeq}`;
    const entry = {
      id: requestId,
      sk: srcSkelHash,
      sc: panel ? quickStructureSig(panel) : null,
      m: mode,
      at: nowMs(),
      x: false,
      lp: '',
      tg: '',
      sh: '',
      cy: 0,
      pa: 0,
      pRaf: null,
      dn: false,
      fn: null,
      fa: 0,
      pp: '',
      fTm: null,
      tr: truncInfo,
      ps: [],
    };
    if (panel) claimPanelEntry(panel, entry);
    inflightBySig.set(sig, entry);

    if (panel && expanded) {
      const t = getClientPack();
      renderPendingState(panel, mode === 'machine' ? t[7] : t[8], mode === 'machine' ? 'machine' : 'ai');
    }

    const verifyPanel = (p) => {
      if (!isConn(p) || panelActiveEntry.get(p) !== entry) return false;
      const cs = quickStructureSig(p);
      if (entry.sc && cs && (cs.c !== entry.sc.c || cs.f !== entry.sc.f || cs.l !== entry.sc.l)) {
        const inf = extractPanelInfo(p);
        if (inf.t && `sig${inf.k}` !== entry.sk) return false;
        entry.sc = cs;
      }
      return true;
    };

    const flushPartialToPanels = (partialStr, streamOpts = null) => {
      const trimmed = String(partialStr || '').trimStart();
      if (!trimmed || trimmed === entry.lp || entry.x) return;
      const isFirstChunk = !entry.lp;
      entry.lp = trimmed;
      entry.fa = nowMs();
      entry.pp = '';
      for (const p of entry.ps) {
        if (verifyPanel(p)) {
          if (isFirstChunk) clearPanelStreamState(p);
          renderTranslatedText(p, trimmed, true, null, '', streamOpts);
        }
      }
    };

    const commitFinalPayloadToPanels = (pl) => {
      if (inflightBySig.get(sig) === entry) inflightBySig.delete(sig);
      if (!pl || currentMode === 'off' || entry.x) return;
      for (const p of entry.ps) {
        if (panelActiveEntry.get(p) === entry) panelActiveEntry.delete(p);
        if (!isConn(p)) continue;
        const inf = extractPanelInfo(p);
        if (inf.t && `sig${inf.k}` !== entry.sk) continue;
        if (isPanelCurrentlyExpanded(p) && !isHiddenByAncestor(null, p)) {
          renderTranslatedText(p, pl.z, false, pl.s, pl.e, { truncInfo: pl.tr || entry.tr || null });
        } else {
          clearTriggerStatusBadge(p);
          const m = panelMeta.get(p) || {};
          m.ps = pl.s;
          m.rs = inf.s;
          panelMeta.set(p, m);
        }
      }
      scheduleScan(30);
    };

    const ensurePacerLoop = () => {
      if (entry.pRaf || entry.pTm || entry.x || currentMode === 'off') return;
      const raf = getRafFn();
      if (!raf) return;
      const stepPacer = () => {
        entry.pRaf = null;
        if (currentMode === 'off' || entry.x) return;
        const now = nowMs();
        if (isMotionOff()) {
          if (entry.dn && entry.fn) {
            entry.sh = entry.fn.z;
            commitFinalPayloadToPanels(entry.fn);
          } else if (entry.tg) {
            entry.sh = entry.tg;
            flushPartialToPanels(entry.sh, { inc: true, anim: false, now });
          }
          return;
        }

        const target = entry.tg;
        if (!target) return;
        if (!target.startsWith(entry.sh)) {
          let common = 0;
          const lim = Math.min(target.length, entry.sh.length);
          while (common < lim && target.charCodeAt(common) === entry.sh.charCodeAt(common)) common++;
          entry.sh = target.slice(0, common);
        }

        const backlog = target.length - entry.sh.length;
        if (backlog <= 0) {
          if (entry.dn && entry.fn) commitFinalPayloadToPanels(entry.fn);
          return;
        }

        const rem = 30 - (now - entry.pa);
        if (entry.pa > 0 && !entry.dn && rem > 0) {
          entry.sk = (entry.sk || 0) + 1;
          if (entry.sk >= 2 && typeof setTimeout === 'function' && rem > 6) {
            entry.sk = 0;
            entry.pTm = setTimeout(() => {
              entry.pTm = null;
              if (!entry.x && currentMode !== 'off') ensurePacerLoop();
            }, Math.ceil(rem - 2));
            entry.pTm?.unref?.();
          } else {
            entry.pRaf = raf(stepPacer);
          }
          return;
        }
        entry.sk = 0;

        const dt = entry.pa > 0 ? Math.min(80, Math.max(8, now - entry.pa)) : 16.67;
        const basePerFrame = entry.dn
          ? Math.max(3.2, backlog / 6.2)
          : backlog > 48
          ? Math.max(3.0, backlog / 9.5)
          : Math.max(1.25, backlog / 11.5);

        entry.cy += basePerFrame * (dt / 16.67);
        const minChunk = backlog === 1 || entry.dn || now - entry.pa >= 26 ? 1 : 2;
        if (entry.cy < minChunk) {
          entry.pRaf = raf(stepPacer);
          return;
        }

        const nextIdx = advanceSafeChunkEnd(target, entry.sh.length, Math.min(backlog, Math.floor(entry.cy)));
        entry.cy = Math.max(0, entry.cy - (nextIdx - entry.sh.length));
        entry.pa = now;
        entry.sh = target.slice(0, nextIdx);

        flushPartialToPanels(entry.sh, { inc: true, anim: true, now });

        if (entry.sh.length < entry.tg.length) entry.pRaf = raf(stepPacer);
        else if (entry.dn && entry.fn) commitFinalPayloadToPanels(entry.fn);
      };
      entry.pRaf = raf(stepPacer);
    };

    const scheduleAlignedStreamFlush = () => {
      if (entry.fTm || entry.x) return;
      entry.fTm = setTimeout(() => {
        entry.fTm = null;
        if (currentMode === 'off' || entry.x || !entry.pp) return;
        if (entry.fa > 0 && nowMs() - entry.fa < STREAM_FLUSH_MS) return scheduleAlignedStreamFlush();
        flushPartialToPanels(entry.pp);
      }, STREAM_FLUSH_MS);
    };

    const failEntry = (errOrRes) => {
      cancelFlushHandle(entry);
      if (inflightBySig.get(sig) === entry) inflightBySig.delete(sig);
      if (entry.x || currentMode === 'off') return;
      const reason = classifyFailureReason(errOrRes);
      const detail = sanitizeClientErrorText(
        (errOrRes && (errOrRes.error || errOrRes.message)) || (typeof errOrRes === 'string' ? errOrRes : '')
      );
      recordSigFailure(sig, { reason, detail });
      for (const p of entry.ps) {
        if (panelActiveEntry.get(p) === entry) {
          panelActiveEntry.delete(p);
          if (isConn(p)) {
            if (isPanelCurrentlyExpanded(p)) {
              renderFailedState(p, rawText, mode, sig, { reason, detail });
            } else {
              clearPendingKeepRaw(p);
              syncTriggerStatusBadge(p, reason, detail, sig, rawText, mode);
            }
          }
        }
      }
    };

    const reqLang = currentLang || resolveActiveLang();
    br.translateStream(
      { text: sendPlan.text, mode, priority, requestId, force, bypassCache, targetLang: reqLang },
      (partial) => {
        if (currentMode === 'off' || entry.x || (currentLang || resolveActiveLang()) !== reqLang || typeof partial !== 'string' || !partial.trim()) return;
        const trimmed = partial.trimStart();
        if (!trimmed) return;
        if (canUseSmoothStream()) {
          entry.tg = trimmed;
          ensurePacerLoop();
          return;
        }
        entry.pp = trimmed;
        const now = nowMs();
        if (entry.fa === 0) flushPartialToPanels(trimmed);
        else if (now - entry.fa >= STREAM_FLUSH_MS) {
          cancelFlushHandle(entry);
          flushPartialToPanels(trimmed);
        } else scheduleAlignedStreamFlush();
      }
    )
      .then((res) => {
        if (currentMode === 'off' || entry.x || res?.cancelled) {
          cancelFlushHandle(entry);
          if (inflightBySig.get(sig) === entry) inflightBySig.delete(sig);
          for (const p of entry.ps) {
            if (isConn(p) && ga(p, A_RDY) !== '1') clearPendingKeepRaw(p);
          }
          return;
        }
        if (res && res.ok && res.skipped) {
          cancelFlushHandle(entry);
          if (inflightBySig.get(sig) === entry) inflightBySig.delete(sig);
          for (const p of entry.ps) {
            if (panelActiveEntry.get(p) === entry) panelActiveEntry.delete(p);
            if (isConn(p)) {
              cleanOverlayKeepRaw(p);
              const inf = extractPanelInfo(p);
              const m = panelMeta.get(p) || {};
              m.skippedSig = sig;
              m.rs = inf.s || quickPanelStamp(p);
              panelMeta.set(p, m);
            }
          }
          return;
        }
        if (res && res.ok && typeof res.text === 'string' && res.text.trim()) {
          const finalZh = res.text.trim();
          const isFb = res.engine === 'machine-fallback' || Boolean(res.fallback);
          const eng = isFb ? 'machine-fallback' : res.engine || (mode === 'machine' ? 'machine' : 'ai');
          failedSigs.delete(sig);
          const fallbackBase = isFb || mode === 'machine' ? 'mt' : activeStyleTag || 'ai_technical';
          putMemCache(res.key || `${withLangSuffix(fallbackBase, reqLang)}${skelBody}`, finalZh, true);

          const finalTrunc =
            entry.tr ||
            (res.truncated
              ? { truncated: true, totalChars: res.originalLength || rawText.length, sentChars: res.translatedLength || sendPlan.sentChars }
              : null);

          if ((currentLang || resolveActiveLang()) !== reqLang) {
            cancelFlushHandle(entry);
            if (inflightBySig.get(sig) === entry) inflightBySig.delete(sig);
            for (const p of entry.ps) {
              if (panelActiveEntry.get(p) === entry) panelActiveEntry.delete(p);
            }
            scheduleScan(20);
            return;
          }

          if (
            !res.cached &&
            canUseSmoothStream() &&
            entry.ps.some((p) => isConn(p) && isPanelCurrentlyExpanded(p) && !isHiddenByAncestor(null, p)) &&
            entry.sh.length < finalZh.length &&
            finalZh.startsWith(entry.sh) &&
            (entry.sh.length > 0 || finalZh.length <= 900)
          ) {
            entry.tg = finalZh;
            entry.dn = true;
            entry.fn = { z: finalZh, s: sig, e: eng, tr: finalTrunc };
            ensurePacerLoop();
            return;
          }
          cancelFlushHandle(entry);
          commitFinalPayloadToPanels({ z: finalZh, s: sig, e: eng, tr: finalTrunc });
        } else {
          failEntry(res);
        }
      })
      .catch(failEntry);
  }

  function isHiddenByAncestor(btn, panel) {
    return Boolean((btn && typeof btn[K_CV] === 'function' && !btn[K_CV]()) || (panel && typeof panel[K_CV] === 'function' && !panel[K_CV]()));
  }

  function probeViewportBand(el) {
    if (!el || typeof el.getBoundingClientRect !== 'function') return 2;
    try {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return typeof el[K_CV] === 'function' ? 0 : 2;
      const rootEl = docRoot();
      const vh = W.innerHeight || (rootEl && rootEl.clientHeight) || 0;
      if (vh <= 0 || rect.height <= 0) return 2;
      const vw = W.innerWidth || (rootEl && rootEl.clientWidth) || 1440;
      if (rect.right < 0 || rect.left > vw) return 0;
      if (rect.bottom >= -120 && rect.top <= vh + 120) return 2;
      if (rect.bottom >= -800 && rect.top <= vh + 800) return 1;
      return 0;
    } catch (_) {
      return 2;
    }
  }

  function enqueueHydrate(panel, cached, sig, engine) {
    if (!panel || hydrateQueue.some((x) => x.p === panel)) return;
    hydrateQueue.push({ p: panel, z: cached, s: sig, e: engine });
    if (hydrateHandle) return;
    const step = () => {
      hydrateHandle = null;
      if (currentMode === 'off') return clearHydrateQueue();
      // 两阶段读写分离：先批量读取可见性/视口位置，再统一写入 DOM，消除多帧 Layout Thrashing
      const ready = [];
      while (hydrateQueue.length && ready.length < 3) {
        const it = hydrateQueue.shift();
        if (isConn(it.p) && isPanelCurrentlyExpanded(it.p) && !isHiddenByAncestor(null, it.p) && probeViewportBand(it.p) > 0) {
          ready.push(it);
        }
      }
      for (let i = 0; i < ready.length; i++) {
        const it = ready[i];
        renderTranslatedText(it.p, it.z, false, it.s, it.e);
      }
      if (hydrateQueue.length) (hydrateHandle = setTimeout(step, 16))?.unref?.();
    };
    (hydrateHandle = setTimeout(step, 16))?.unref?.();
  }

  function processSingleTrigger(btn, allowPreloadCollapsed, priority = 0) {
    if (!btn) return;
    const expanded = ga(btn, A_EXP) === 'true';
    if (!expanded && !allowPreloadCollapsed) return;

    const panel = nextSib(btn);
    if (!panel || String(panel.tagName || '').toUpperCase() !== 'DIV') return;

    const streaming = isTriggerStreaming(btn);
    if (streaming) {
      const now = nowMs();
      const prevMeta = panelMeta.get(panel);
      const alreadyStreamingPending = Boolean(prevMeta && prevMeta.s && ga(panel, A_PND) === '1');
      const meta = prevMeta || { h: '', c: now, s: true, m: true, f: 0, ds: '', ps: '', rs: '' };
      meta.s = true;
      meta.m = true;
      meta.f = 0;
      meta.c = now;
      panelMeta.set(panel, meta);
      clearPanelWaitTimer(panel);
      trackStreamingTrigger(btn, panel);
      if (alreadyStreamingPending) return;
      if (expanded && !isHiddenByAncestor(btn, panel)) renderPendingState(panel, getClientPack()[9], 'streaming');
      return;
    }
    untrackStreamingTrigger(btn);

    if (expanded && ga(panel, A_RDY) === '1') {
      const em = panelMeta.get(panel);
      if (em && em.rs === quickPanelStamp(panel) && em.ds && em.ds === ga(panel, A_SIG)) return;
    }

    const hiddenAnc = isHiddenByAncestor(btn, panel);
    if (hiddenAnc && !allowPreloadCollapsed) return;
    const visExpanded = expanded && !hiddenAnc;

    const inf = extractPanelInfo(panel);
    if (!inf.t || inf.z) {
      const prevMeta = panelMeta.get(panel);
      // 防止 React 重绘期间短暂空文本把正在收束的思考块静默清掉并污染缓存签名
      if (!inf.t && prevMeta && prevMeta.h && prevMeta.m && nowMs() - prevMeta.c < 2500) {
        scheduleScan(180);
        return;
      }
      if (ga(panel, A_PND) === '1') clearPendingKeepRaw(panel);
      if (ga(panel, A_RDY) === '1' || findDirectOverlay(panel)) {
        cleanOverlayKeepRaw(panel);
      }
      const m0 = prevMeta || {};
      m0.ps = sigFromBody(inf.k, currentMode);
      m0.rs = inf.s;
      delete m0.skippedSig;
      panelMeta.set(panel, m0);
      return;
    }

    const srcSkelHash = `sig${inf.k}`;
    const sig = sigFromBody(inf.k, currentMode);

    if (visExpanded && ga(panel, A_RDY) === '1' && ga(panel, A_SIG) === sig) {
      const meta = panelMeta.get(panel) || {};
      meta.ds = sig;
      meta.rs = inf.s;
      delete meta.skippedSig;
      panelMeta.set(panel, meta);
      return;
    }

    const curMeta = panelMeta.get(panel);
    if (curMeta && curMeta.skippedSig === sig && curMeta.rs === inf.s) {
      return;
    }

    const now = nowMs();
    let meta = panelMeta.get(panel);
    if (!meta) {
      meta = { h: srcSkelHash, c: now, s: false, m: false, f: now - FINISH_GATE_MS, ds: '', ps: '', rs: '' };
    } else if (meta.h !== srcSkelHash) {
      meta.h = srcSkelHash;
      meta.c = now;
      meta.m = true;
    }

    if (meta.s && !meta.f) {
      meta.s = false;
      meta.f = now;
    } else if (!meta.f) {
      meta.f = now - FINISH_GATE_MS;
    }
    panelMeta.set(panel, meta);

    const cached = findCachedByBody(inf.k, currentMode);
    if (cached) {
      clearPanelWaitTimer(panel);
      const eng = currentMode === 'machine' ? 'machine' : 'ai';
      const sendPlan = sliceThoughtForSafeSend(inf.t);
      const truncInfo = sendPlan.truncated ? sendPlan : null;
      if (visExpanded) {
        if (syncHydrateBudget > 0) {
          syncHydrateBudget--;
          renderTranslatedText(panel, cached, false, sig, eng, { truncInfo });
        } else {
          enqueueHydrate(panel, cached, sig, eng);
        }
      } else {
        clearTriggerStatusBadge(panel);
        meta.ps = sig;
        meta.rs = inf.s;
        panelMeta.set(panel, meta);
      }
      return;
    }

    const activeFlight = inflightBySig.get(sig);
    if (activeFlight && !activeFlight.x && now - activeFlight.at <= INFLIGHT_TTL_MS) {
      bindPanelToInflight(activeFlight, panel, visExpanded);
      return;
    }

    if (isSigInCooldown(sig)) {
      const failMeta = getSigFailureMeta(sig);
      if (visExpanded && ga(panel, A_FLD) !== '1') {
        renderFailedState(panel, inf.t, currentMode, sig, failMeta ? { reason: failMeta.r, detail: failMeta.d } : null);
      } else if (failMeta) {
        syncTriggerStatusBadge(panel, failMeta.r, failMeta.d, sig, inf.t, currentMode);
      }
      return;
    }

    const waitMs = meta.m ? Math.max(0, FINISH_GATE_MS - (now - meta.f), QUIET_GATE_MS - (now - meta.c)) : 0;
    if (waitMs > 0) {
      if (visExpanded) renderPendingState(panel, getClientPack()[10], 'settling');
      const startedExpanded = expanded;
      const runWaitCallback = (graceAttempt) => {
        if (currentMode === 'off') return;
        if (!isConn(btn)) {
          // React 可能在静默等待窗口内重建了触发按钮节点，主动补扫而非静默放弃
          scheduleScan(75);
          return;
        }
        const liveExpanded = ga(btn, A_EXP) === 'true' || isPanelCurrentlyExpanded(panel);
        let liveAllowPreload = false;
        if (!liveExpanded && triggerTiming === 'preload') {
          const allBtns = queryTriggers();
          liveAllowPreload = Boolean(allBtns.length > 0 && allBtns[allBtns.length - 1] === btn);
        }
        if (!liveExpanded && !liveAllowPreload) {
          // 展开态若在 QUIET_GATE 期间短暂抖动为未展开，给 1 次短宽限复核，避免误清 pending 静默丢翻
          if (startedExpanded && graceAttempt === 0 && isConn(panel)) {
            setPanelWaitTimer(panel, btn, () => runWaitCallback(1), 160);
            return;
          }
          return clearPendingKeepRaw(panel);
        }
        processSingleTrigger(btn, liveAllowPreload, priority);
      };
      setPanelWaitTimer(panel, btn, () => runWaitCallback(0), waitMs + 25);
      return;
    }

    startOrJoinTranslation(panel, inf.t, currentMode, sig, srcSkelHash, visExpanded, { priority });
  }

  function pruneUnneededPendingRequests(activePanelSet) {
    for (const [sig, entry] of inflightBySig.entries()) {
      if (entry.lp || entry.x) continue;
      if (!entry.ps.some((p) => isConn(p) && activePanelSet.has(p))) {
        cancelTranslateRequest(entry);
        inflightBySig.delete(sig);
      }
    }
  }

  const TOOL_SKIP_TAGS = new Set('SCRIPT,STYLE,SVG,NOSCRIPT,PRE,CODE,A,INPUT,TEXTAREA,SELECT'.split(','));

  function isExcludedToolAncestor(el, thoughtPanelSet) {
    if (!el || el.nodeType !== 1) return true;
    if (thoughtPanelSet && thoughtPanelSet.has(el)) return true;
    if (isOverlayOrIgnoredElement(el)) return true;
    const tag = el.tagName ? String(el.tagName).toUpperCase() : '';
    if (TOOL_SKIP_TAGS.has(tag)) return true;
    const tid = ga(el, 'data-testid') || '';
    if (tid === 'thinking-collapsible-trigger' || tid === 'prism-thought-ai-config' || tid === 'prism-thought-general-config') return true;
    if (hasAttr(el, 'data-file-href') || hasAttr(el, 'data-file-path') || hasAttr(el, 'data-omni-path')) return true;
    return false;
  }

  function wrapWithRawWhitespace(rawStr, translatedStr) {
    const raw = String(rawStr || '');
    const trimmedStart = raw.trimStart();
    if (!trimmedStart) return raw;
    const lead = raw.slice(0, raw.length - trimmedStart.length);
    const trail = raw.slice(raw.trimEnd().length);
    return `${lead}${translatedStr}${trail}`;
  }

  function collectToolSummaryTextNodes(rootNode, outList, visitedNodes, thoughtPanelSet) {
    if (!rootNode || outList.length >= 24) return;
    const nt = rootNode.nodeType;
    if (nt === 3) {
      if (visitedNodes.has(rootNode)) return;
      visitedNodes.add(rootNode);
      const val = getTnStr(rootNode);
      const prevRec = toolSummaryNodeMap.get(rootNode);
      if (prevRec && prevRec.trans === val && prevRec.lang === resolveActiveLang() && prevRec.mode === currentMode) {
        return;
      }
      if (val.length > 1024) return;
      const trimmed = trm(val);
      if (!trimmed || trimmed.length < 4 || trimmed.length > 280) return;
      if (!isToolSummaryCandidate(trimmed, resolveActiveLang())) return;
      outList.push({ tn: rootNode, el: parEl(rootNode), raw: val, trimmed });
      return;
    }
    if (nt !== 1 || isExcludedToolAncestor(rootNode, thoughtPanelSet)) return;
    const chs = rootNode[K_CN];
    if (!chs || !chs.length) return;
    for (let i = 0; i < chs.length && outList.length < 24; i++) {
      collectToolSummaryTextNodes(chs[i], outList, visitedNodes, thoughtPanelSet);
    }
  }

  function applyToolSummaryText(item, translatedStr, activeLang, mode) {
    if (!item || !item.tn || !isConn(item.tn) || !translatedStr) return;
    const curVal = getTnStr(item.tn);
    if (curVal !== item.raw) return;
    const nextVal = wrapWithRawWhitespace(item.raw, translatedStr);
    if (nextVal === item.raw) return;

    const oldRec = toolSummaryNodeMap.get(item.tn);
    const orig = oldRec && item.raw === oldRec.trans ? oldRec.orig : item.raw;
    if (oldRec) toolSummaryRecords.delete(oldRec);

    setTn(item.tn, nextVal);
    if (item.el) sa(item.el, 'data-op-tool-tr', '1');
    const rec = { tn: item.tn, el: item.el, orig, trans: nextVal, lang: activeLang, mode };
    toolSummaryNodeMap.set(item.tn, rec);
    toolSummaryRecords.add(rec);
  }

  function markToolSummaryFailed(key, until) {
    if (toolSummaryFailedUntil.has(key)) toolSummaryFailedUntil.delete(key);
    toolSummaryFailedUntil.set(key, until);
    while (toolSummaryFailedUntil.size > 512) {
      const oldest = toolSummaryFailedUntil.keys().next().value;
      if (oldest === undefined) break;
      toolSummaryFailedUntil.delete(oldest);
    }
  }

  function pruneDetachedToolSummaryRecords() {
    if (!toolSummaryRecords.size) return;
    for (const rec of Array.from(toolSummaryRecords)) {
      if (!rec || !rec.tn || !isConn(rec.tn)) {
        if (rec && rec.tn) toolSummaryNodeMap.delete(rec.tn);
        toolSummaryRecords.delete(rec);
      }
    }
  }

  function scanToolSummaryContainers() {
    pruneDetachedToolSummaryRecords();
    if (!translateToolSummaries || currentMode === 'off' || typeof document === 'undefined') return;
    const br = getBridge();
    if (!br || typeof br.translateStream !== 'function') return;

    const scope = isConn(cachedConvRoot) && cachedConvRoot.querySelectorAll ? cachedConvRoot : document;
    const thoughtPanelSet = new Set();
    const tBtns = queryTriggers();
    for (let i = 0; i < tBtns.length; i++) {
      const tp = nextSib(tBtns[i]);
      if (tp) thoughtPanelSet.add(tp);
    }

    const containers = [];
    const seenContainer = new Set();
    const pushContainer = (c) => {
      if (!c || seenContainer.has(c) || !isConn(c) || isHiddenByAncestor(null, c)) return;
      if (probeViewportBand(c) === 0) return;
      seenContainer.add(c);
      containers.push(c);
    };

    const groupTrigs = scope.querySelectorAll ? scope.querySelectorAll(SEL_TOOL_TRIGGERS) : [];
    for (let i = 0; i < groupTrigs.length; i++) {
      const trig = groupTrigs[i];
      if (!trig || ga(trig, A_EXP) !== 'true') continue;
      const bodyDiv = nextSib(trig);
      if (bodyDiv && String(bodyDiv.tagName || '').toUpperCase() === 'DIV') {
        pushContainer(bodyDiv);
      }
    }

    const rowEls = scope.querySelectorAll ? scope.querySelectorAll(SEL_TOOL_ROWS) : [];
    if (rowEls && rowEls.length) {
      const orphanRows = [];
      for (let i = 0; i < rowEls.length; i++) {
        const r = rowEls[i];
        let insideKnown = false;
        let cur = parEl(r);
        while (cur) {
          if (seenContainer.has(cur)) {
            insideKnown = true;
            break;
          }
          cur = parEl(cur);
        }
        if (!insideKnown && !isHiddenByAncestor(null, r) && probeViewportBand(r) > 0) {
          orphanRows.push(r);
        }
      }
      if (orphanRows.length) {
        const byParent = new Map();
        for (let i = 0; i < orphanRows.length; i++) {
          const p = parEl(orphanRows[i]) || orphanRows[i];
          if (!byParent.has(p)) byParent.set(p, []);
          byParent.get(p).push(orphanRows[i]);
        }
        for (const [p, rows] of byParent.entries()) {
          if (!seenContainer.has(p)) {
            seenContainer.add(p);
            containers.push({ __rows: rows });
          }
        }
      }
    }

    if (!containers.length) return;
    const activeLang = resolveActiveLang();
    const activeMode = currentMode;
    const modePrefix = `${activeMode}:${activeLang}:`;
    const visitedNodes = new Set();
    const now = nowMs();

    for (let ci = 0; ci < containers.length; ci++) {
      const c = containers[ci];
      const candidates = [];
      if (c && c.__rows) {
        for (let ri = 0; ri < c.__rows.length; ri++) {
          collectToolSummaryTextNodes(c.__rows[ri], candidates, visitedNodes, thoughtPanelSet);
        }
      } else {
        collectToolSummaryTextNodes(c, candidates, visitedNodes, thoughtPanelSet);
      }
      if (!candidates.length) continue;

      const uncached = [];
      const uniqueTrimmed = [];
      const uniqueIdxMap = new Map();

      for (let i = 0; i < candidates.length; i++) {
        const cand = candidates[i];
        const cacheKey = `${modePrefix}${cand.trimmed}`;
        const hit = toolSummaryCache.get(cacheKey);
        if (hit) {
          applyToolSummaryText(cand, hit, activeLang, activeMode);
          continue;
        }
        const failUntil = toolSummaryFailedUntil.get(cacheKey);
        if (failUntil) {
          if (now < failUntil) continue;
          toolSummaryFailedUntil.delete(cacheKey);
        }
        uncached.push(cand);
        if (!uniqueIdxMap.has(cand.trimmed)) {
          uniqueIdxMap.set(cand.trimmed, uniqueTrimmed.length);
          uniqueTrimmed.push(cand.trimmed);
        }
      }

      if (!uniqueTrimmed.length) continue;
      const batchKey = `${modePrefix}${uniqueTrimmed.join('\x1f')}`;
      if (toolBatchInflight.has(batchKey)) continue;

      const requestId = `op_ts_${nowMs().toString(36)}_${++reqSeq}`;
      toolBatchInflight.set(batchKey, requestId);

      br.translateStream(
        {
          text: JSON.stringify({ v: 1, items: uniqueTrimmed }),
          mode: activeMode === 'machine' ? 'tool-batch:machine' : 'tool-batch:ai',
          priority: 8000,
          requestId,
          targetLang: activeLang,
        },
        null
      )
        .then((res) => {
          toolBatchInflight.delete(batchKey);
          if (!translateToolSummaries || currentMode !== activeMode || resolveActiveLang() !== activeLang) return;
          let outItems = null;
          if (res && res.ok) {
            if (Array.isArray(res.items)) {
              outItems = res.items;
            } else if (typeof res.text === 'string' && res.text.trim()) {
              try {
                const parsed = JSON.parse(res.text);
                if (Array.isArray(parsed?.items)) outItems = parsed.items;
              } catch (_) {}
            }
          }
          if (!outItems || outItems.length !== uniqueTrimmed.length) {
            const until = nowMs() + 20000;
            for (let k = 0; k < uniqueTrimmed.length; k++) {
              markToolSummaryFailed(`${modePrefix}${uniqueTrimmed[k]}`, until);
            }
            return;
          }
          for (let k = 0; k < uniqueTrimmed.length; k++) {
            const trText = typeof outItems[k] === 'string' ? outItems[k].trim() : '';
            if (trText && trText !== uniqueTrimmed[k]) {
              if (toolSummaryCache.size >= 600) {
                const oldest = toolSummaryCache.keys().next().value;
                if (oldest !== undefined) toolSummaryCache.delete(oldest);
              }
              toolSummaryCache.set(`${modePrefix}${uniqueTrimmed[k]}`, trText);
            }
          }
          for (let i = 0; i < uncached.length; i++) {
            const cand = uncached[i];
            const idx = uniqueIdxMap.get(cand.trimmed);
            const trText = idx !== undefined && typeof outItems[idx] === 'string' ? outItems[idx].trim() : '';
            if (trText && trText !== cand.trimmed) {
              applyToolSummaryText(cand, trText, activeLang, activeMode);
            }
          }
        })
        .catch(() => {
          toolBatchInflight.delete(batchKey);
          const until = nowMs() + 20000;
          for (let k = 0; k < uniqueTrimmed.length; k++) {
            markToolSummaryFailed(`${modePrefix}${uniqueTrimmed[k]}`, until);
          }
        });
    }
  }

  const TITLE_SKIP_TAGS = new Set('SCRIPT,STYLE,SVG,NOSCRIPT,PRE,CODE,INPUT,TEXTAREA,SELECT,TIME,KBD,SAMP'.split(','));
  const TITLE_HEADING_TAGS = new Set('H1,H2,H3,H4,H5,H6'.split(','));
  const TITLE_CHILD_BADGE_CLS_RE =
    /\b(?:badge|pill|chip|timestamp|time|meta|metadata|count|counter|hotkey|shortcut|avatar|icon|spinner|status|actions?|subtitle|sub-title|subtext|preview|excerpt|snippet|description|desc|caption|footnote|workspace|folder|repo|branch|ag-prism-sb-)\b/i;
  const TITLE_CHILD_BADGE_TID_RE =
    /badge|time|date|action|menu|delete|pin|archive|count|status|icon|subtitle|sub-title|preview|excerpt|summary|desc|meta|workspace|folder|repo|branch|pill|chip|avatar|spinner/i;
  const TITLE_PRIMARY_TID_RE = /(?:^|[-_])title(?:$|[-_])/i;
  const TITLE_STATUS_WORD_RE =
    /^(?:new|active|running|working|thinking|generating|pending|queued|idle|done|completed|finished|failed|error|paused|stopped|draft|pinned|unread|archived|updated|edited|in\s+progress|waiting)$/i;

  function isSidebarStudioActive() {
    try {
      const rootEl = docRoot();
      if (rootEl && ga(rootEl, 'data-ag-prism-sidebar-studio') === 'on') {
        return true;
      }
      return W.__agPrism?.getState?.()?.cfg?.sidebarStudio === 'on';
    } catch (_) {
      return false;
    }
  }

  function isTitleContainerExcluded(container, sidebarOn) {
    let cur = container;
    while (cur && cur.nodeType === 1) {
      if (isOverlayOrIgnoredElement(cur)) return true;
      if (hasAttr(cur, 'data-ag-prism-sidebar-owned')) return true;
      const cls = String(ga(cur, 'class') || cur.className || '');
      if (cls.includes('ag-prism-sb-native-hidden') || cls.includes('ag-prism-chat-row-hidden')) return true;
      if (sidebarOn && (cls.includes('ag-prism-sb-') || cls.includes('ag-sb-'))) return true;
      const tid = ga(cur, 'data-testid') || '';
      if (tid === 'prism-thought-ai-config' || tid === 'prism-thought-general-config') return true;
      cur = parEl(cur);
    }
    return false;
  }

  function isExcludedTitleChild(el, containerRoot, sidebarOn) {
    if (!el || el.nodeType !== 1) return true;
    if (isOverlayOrIgnoredElement(el)) return true;
    if (
      hasAttr(el, 'data-ag-prism-sidebar-owned') ||
      hasAttr(el, 'data-ag-no-i18n') ||
      hasAttr(el, 'data-file-href') ||
      hasAttr(el, 'data-file-path') ||
      hasAttr(el, 'data-omni-path') ||
      hasAttr(el, 'data-badge')
    ) {
      return true;
    }
    const tag = el.tagName ? String(el.tagName).toUpperCase() : '';
    if (TITLE_SKIP_TAGS.has(tag)) return true;
    const cls = String(ga(el, 'class') || el.className || '');
    if (sidebarOn && (cls.includes('ag-prism-sb-') || cls.includes('ag-sb-'))) return true;
    if (el !== containerRoot) {
      if (tag === 'BUTTON') return true;
      if (ga(el, 'aria-hidden') === 'true') return true;
      const role = low(ga(el, 'role'));
      if (role === 'button' || role === 'status' || role === 'badge') return true;
      if (TITLE_CHILD_BADGE_CLS_RE.test(cls)) return true;
      const tid = ga(el, 'data-testid') || '';
      if (tid && TITLE_CHILD_BADGE_TID_RE.test(tid)) return true;
    }
    return false;
  }

  function findExplicitPrimaryTitleEl(rootEl, containerRoot, sidebarOn) {
    if (!rootEl || rootEl.nodeType !== 1) return null;
    const chs = rootEl[K_CN];
    if (!chs || !chs.length) return null;
    for (let i = 0; i < chs.length; i++) {
      const ch = chs[i];
      if (!ch || ch.nodeType !== 1) continue;
      if (isExcludedTitleChild(ch, containerRoot, sidebarOn)) continue;
      const tid = ga(ch, 'data-testid') || '';
      if (tid && TITLE_PRIMARY_TID_RE.test(tid) && !/subtitle|sub-title/i.test(tid)) return ch;
      const tag = ch.tagName ? String(ch.tagName).toUpperCase() : '';
      if (TITLE_HEADING_TAGS.has(tag)) return ch;
      const nested = findExplicitPrimaryTitleEl(ch, containerRoot, sidebarOn);
      if (nested) return nested;
    }
    return null;
  }

  function findBreadcrumbGroupRoot(el) {
    let cur = parEl(el);
    while (cur && cur.nodeType === 1) {
      const tag = cur.tagName ? String(cur.tagName).toUpperCase() : '';
      if (tag === 'NAV' || tag === 'HEADER' || tag === 'OL' || tag === 'UL') return cur;
      const role = low(ga(cur, 'role'));
      if (role === 'navigation' || role === 'banner' || role === 'list') return cur;
      const aria = low(ga(cur, 'aria-label'));
      if (aria.includes('breadcrumb')) return cur;
      const tid = low(ga(cur, 'data-testid'));
      if (tid.includes('breadcrumb') && tid !== 'breadcrumb-segment') return cur;
      const cls = low(ga(cur, 'class') || cur.className || '');
      if (cls.includes('breadcrumb')) return cur;
      cur = parEl(cur);
    }
    return document.body || docRoot() || '__default_bc__';
  }

  function unbindStaleTitleRec(tn, prevRec, curVal) {
    if (prevRec && prevRec.trans !== curVal) {
      titleNodeMap.delete(tn);
      titleRecords.delete(prevRec);
      if (prevRec.el) ra(prevRec.el, 'data-op-title-tr');
    }
  }

  function isIgnorableTitlePrefixText(trimmed) {
    if (!trimmed || trimmed.length < 2) return true;
    return TITLE_TIME_RE.test(trimmed) || TITLE_NUM_SYM_RE.test(trimmed) || TITLE_STATUS_WORD_RE.test(trimmed);
  }

  function collectTitleTextNodes(rootNode, containerRoot, outList, visitedNodes, sidebarOn, activeLang, primaryOnly = false) {
    if (!rootNode || outList.length >= 40) return false;
    const nt = rootNode.nodeType;
    if (nt === 3) {
      if (visitedNodes.has(rootNode)) return false;
      visitedNodes.add(rootNode);
      const val = getTnStr(rootNode);
      const prevRec = titleNodeMap.get(rootNode);
      if (prevRec && prevRec.trans === val && prevRec.lang === activeLang && prevRec.mode === currentMode) {
        return primaryOnly;
      }
      if (val.length > 1024) {
        unbindStaleTitleRec(rootNode, prevRec, val);
        return primaryOnly;
      }
      const trimmed = trm(val);
      if (!trimmed) {
        unbindStaleTitleRec(rootNode, prevRec, val);
        return false;
      }
      if (primaryOnly && isIgnorableTitlePrefixText(trimmed)) {
        unbindStaleTitleRec(rootNode, prevRec, val);
        return false;
      }
      if (!isTitleCandidate(trimmed, activeLang)) {
        unbindStaleTitleRec(rootNode, prevRec, val);
        return primaryOnly;
      }
      outList.push({ tn: rootNode, el: parEl(rootNode), raw: val, trimmed });
      return primaryOnly;
    }
    if (nt !== 1 || isExcludedTitleChild(rootNode, containerRoot, sidebarOn)) return false;
    const chs = rootNode[K_CN];
    if (!chs || !chs.length) return false;
    for (let i = 0; i < chs.length && outList.length < 40; i++) {
      if (collectTitleTextNodes(chs[i], containerRoot, outList, visitedNodes, sidebarOn, activeLang, primaryOnly)) {
        return true;
      }
    }
    return false;
  }

  function applyTitleText(item, translatedStr, activeLang, mode) {
    if (!item || !item.tn || !isConn(item.tn) || !translatedStr) return;
    const curVal = getTnStr(item.tn);
    if (curVal !== item.raw) return;
    const nextVal = wrapWithRawWhitespace(item.raw, translatedStr);
    if (nextVal === item.raw) return;

    const oldRec = titleNodeMap.get(item.tn);
    const orig = oldRec && item.raw === oldRec.trans ? oldRec.orig : item.raw;
    if (oldRec) titleRecords.delete(oldRec);

    titleInternalMutDepth += 1;
    try {
      setTn(item.tn, nextVal);
      if (item.el) sa(item.el, 'data-op-title-tr', '1');
    } finally {
      titleInternalMutDepth = Math.max(0, titleInternalMutDepth - 1);
    }
    const rec = { tn: item.tn, el: item.el, orig, trans: nextVal, lang: activeLang, mode };
    titleNodeMap.set(item.tn, rec);
    titleRecords.add(rec);
  }

  function clearTitleScanTimer() {
    if (titleScanTimer) {
      clearTimeout(titleScanTimer);
      titleScanTimer = null;
    }
  }

  function stopTitleObserver() {
    clearTitleScanTimer();
    if (titleObserver) {
      try { titleObserver.disconnect(); } catch (_) {}
      titleObserver = null;
    }
    observedTitleRoots.clear();
  }

  function scheduleTitleScan(delayMs = 140) {
    if (!translateTitles || currentMode === 'off' || isDocHiddenOrSleep()) return;
    if (titleScanTimer) return;
    titleScanTimer = setTimeout(() => {
      titleScanTimer = null;
      if (!translateTitles || currentMode === 'off' || isDocHiddenOrSleep()) return;
      /* 周期表 3D 面板打开期间让出主线程与布局带宽，避免侧边栏标题全量 getBoundingClientRect/checkVisibility 引发掉帧；关闭后自动补扫 */
      const rEl = docRoot();
      if (rEl && ga(rEl, 'data-ag-pp-open') === '1') {
        scheduleTitleScan(600);
        return;
      }
      scanConversationTitles();
    }, delayMs);
    titleScanTimer?.unref?.();
  }

  function findTitleContainerAncestor(node) {
    let cur = node && node.nodeType === 1 ? node : parEl(node);
    while (cur && cur.nodeType === 1) {
      if (TITLE_CONTAINER_TIDS.has(ga(cur, 'data-testid') || '')) return cur;
      cur = parEl(cur);
    }
    return null;
  }

  function isSafeTitleObserverRoot(el) {
    if (!el || el.nodeType !== 1 || !isConn(el)) return false;
    if (typeof document !== 'undefined' && (el === document.body || el === document.documentElement)) return false;
    const tid = ga(el, 'data-testid') || '';
    if (tid === 'conversation-view' || tid === 'autoscroll-viewport') return false;
    try {
      if (typeof el.querySelector === 'function' && el.querySelector('[data-testid="conversation-view"], [data-testid="autoscroll-viewport"]')) {
        return false;
      }
    } catch (_) {}
    return true;
  }

  function isTitleMutationRelevant(rec) {
    if (!rec) return false;
    if (rec.type === 'characterData') {
      const tn = rec.target;
      if (!tn || tn.nodeType !== 3) return false;
      const curVal = getTnStr(tn);
      const prev = titleNodeMap.get(tn);
      if (prev && prev.trans === curVal) return false;
      const p = parEl(tn);
      if (!p || isOverlayOrIgnoredElement(p)) return false;
      return Boolean(findTitleContainerAncestor(p));
    }
    if (rec.type === 'childList') {
      const tgt = rec.target;
      if (tgt && tgt.nodeType === 1 && !isOverlayOrIgnoredElement(tgt) && findTitleContainerAncestor(tgt)) {
        const added = rec.addedNodes;
        if (!added || !added.length) return true;
        for (let i = 0; i < added.length; i++) {
          const n = added[i];
          if (!n) continue;
          if (n.nodeType === 3) {
            const prev = titleNodeMap.get(n);
            if (!prev || prev.trans !== getTnStr(n)) return true;
          } else if (n.nodeType === 1 && !isOverlayOrIgnoredElement(n)) {
            return true;
          }
        }
        return false;
      }
      const added = rec.addedNodes;
      if (added && added.length) {
        for (let i = 0; i < added.length; i++) {
          const n = added[i];
          if (!n || n.nodeType !== 1 || isOverlayOrIgnoredElement(n)) continue;
          if (TITLE_CONTAINER_TIDS.has(ga(n, 'data-testid') || '')) return true;
          try {
            if (typeof n.querySelector === 'function' && n.querySelector(SEL_TITLE_CONTAINERS)) return true;
          } catch (_) {}
        }
      }
    }
    return false;
  }

  function syncTitleObserverTargets() {
    if (!translateTitles || currentMode === 'off' || typeof document === 'undefined') {
      stopTitleObserver();
      return;
    }
    const MO = W.MutationObserver || (typeof MutationObserver === 'function' ? MutationObserver : null);
    if (typeof MO !== 'function') return;

    const desired = new Set();
    const listNodes = qsa('[data-testid="conversation-list-sidebar"]');
    for (let i = 0; i < listNodes.length; i++) {
      if (isSafeTitleObserverRoot(listNodes[i])) desired.add(listNodes[i]);
    }
    const titleNodes = qsa(SEL_TITLE_CONTAINERS);
    for (let i = 0; i < titleNodes.length; i++) {
      const el = titleNodes[i];
      if (!el || !isConn(el)) continue;
      const tid = ga(el, 'data-testid') || '';
      if (tid === 'breadcrumb-segment') {
        const grp = findBreadcrumbGroupRoot(el);
        if (isSafeTitleObserverRoot(grp)) desired.add(grp);
        else if (isSafeTitleObserverRoot(parEl(el))) desired.add(parEl(el));
        else if (isSafeTitleObserverRoot(el)) desired.add(el);
      } else {
        // 如果已在 conversation-list-sidebar 内就无需重复挂到行级
        let covered = false;
        for (const root of desired) {
          try {
            if (root === el || (typeof root.contains === 'function' && root.contains(el))) { covered = true; break; }
          } catch (_) {}
        }
        if (!covered) {
          const p = parEl(el);
          if (isSafeTitleObserverRoot(p)) desired.add(p);
          else if (isSafeTitleObserverRoot(el)) desired.add(el);
        }
      }
    }

    if (!desired.size) {
      stopTitleObserver();
      return;
    }

    let needRebuild = !titleObserver;
    if (!needRebuild) {
      for (const cur of observedTitleRoots) {
        if (!isConn(cur) || !desired.has(cur)) {
          needRebuild = true;
          break;
        }
      }
    }
    if (needRebuild) {
      if (titleObserver) {
        try { titleObserver.disconnect(); } catch (_) {}
      }
      observedTitleRoots.clear();
      titleObserver = new MO((records) => {
        if (!translateTitles || currentMode === 'off' || titleInternalMutDepth > 0 || isDocHiddenOrSleep()) return;
        if (!Array.isArray(records) || !records.length) return;
        for (let i = 0; i < records.length; i++) {
          if (isTitleMutationRelevant(records[i])) {
            scheduleTitleScan(140);
            return;
          }
        }
      });
    }
    for (const root of desired) {
      if (observedTitleRoots.has(root)) continue;
      try {
        titleObserver.observe(root, { childList: true, subtree: true, characterData: true });
        observedTitleRoots.add(root);
      } catch (_) {}
    }
  }

  function markTitleFailed(key, until) {
    if (titleFailedUntil.has(key)) titleFailedUntil.delete(key);
    titleFailedUntil.set(key, until);
    while (titleFailedUntil.size > 512) {
      const oldest = titleFailedUntil.keys().next().value;
      if (oldest === undefined) break;
      titleFailedUntil.delete(oldest);
    }
  }

  function pruneDetachedTitleRecords() {
    if (!titleRecords.size) return;
    for (const rec of Array.from(titleRecords)) {
      if (!rec || !rec.tn || !isConn(rec.tn)) {
        if (rec && rec.tn) titleNodeMap.delete(rec.tn);
        titleRecords.delete(rec);
      }
    }
  }

  function scanConversationTitles() {
    pruneDetachedTitleRecords();
    if (!translateTitles || currentMode === 'off' || typeof document === 'undefined') {
      stopTitleObserver();
      return;
    }
    syncTitleObserverTargets();
    const br = getBridge();
    if (!br || typeof br.translateStream !== 'function') return;

    const nodes = qsa(SEL_TITLE_CONTAINERS);
    if (!nodes || !nodes.length) {
      hasOffscreenTitles = false;
      return;
    }

    const sidebarOn = isSidebarStudioActive();
    const activeLang = resolveActiveLang();
    const activeMode = currentMode;
    const modePrefix = `${activeMode}:${activeLang}:`;
    const visitedNodes = new Set();
    const candidates = [];
    const bcGroups = new Map();
    let sawOffscreen = false;

    for (let i = 0; i < nodes.length && candidates.length < 40; i++) {
      const c = nodes[i];
      if (!c || !isConn(c) || isHiddenByAncestor(null, c)) continue;
      if (isTitleContainerExcluded(c, sidebarOn)) continue;
      const tid = ga(c, 'data-testid') || '';
      if (tid === 'breadcrumb-segment') {
        const gRoot = findBreadcrumbGroupRoot(c);
        let segs = bcGroups.get(gRoot);
        if (!segs) {
          segs = [];
          bcGroups.set(gRoot, segs);
        }
        segs.push(c);
        continue;
      }
      if (probeViewportBand(c) === 0) {
        sawOffscreen = true;
        continue;
      }
      const explicitTitleEl = findExplicitPrimaryTitleEl(c, c, sidebarOn);
      collectTitleTextNodes(explicitTitleEl || c, c, candidates, visitedNodes, sidebarOn, activeLang, true);
    }

    for (const segs of bcGroups.values()) {
      if (candidates.length >= 40) break;
      if (!segs || segs.length < 2) continue;
      const lastSeg = segs[segs.length - 1];
      if (probeViewportBand(lastSeg) === 0) {
        sawOffscreen = true;
        continue;
      }
      collectTitleTextNodes(lastSeg, lastSeg, candidates, visitedNodes, sidebarOn, activeLang, true);
    }
    hasOffscreenTitles = sawOffscreen;
    if (!candidates.length) return;

    const now = nowMs();
    const uncached = [];
    const uniqueTrimmed = [];
    const uniqueIdxMap = new Map();

    for (let i = 0; i < candidates.length; i++) {
      const cand = candidates[i];
      const cacheKey = `${modePrefix}${cand.trimmed}`;
      const hit = titleCache.get(cacheKey) || toolSummaryCache.get(cacheKey);
      if (hit) {
        applyTitleText(cand, hit, activeLang, activeMode);
        continue;
      }
      const failUntil = titleFailedUntil.get(cacheKey);
      if (failUntil) {
        if (now < failUntil) continue;
        titleFailedUntil.delete(cacheKey);
      }
      uncached.push(cand);
      if (!uniqueIdxMap.has(cand.trimmed)) {
        uniqueIdxMap.set(cand.trimmed, uniqueTrimmed.length);
        uniqueTrimmed.push(cand.trimmed);
      }
    }

    if (!uniqueTrimmed.length) return;

    for (let start = 0; start < uniqueTrimmed.length; start += 24) {
      const batchStrings = uniqueTrimmed.slice(start, start + 24);
      const batchSet = new Set(batchStrings);
      const batchCands = uncached.filter((c) => batchSet.has(c.trimmed));
      const batchIdxMap = new Map();
      for (let k = 0; k < batchStrings.length; k++) batchIdxMap.set(batchStrings[k], k);

      const batchKey = `${modePrefix}${batchStrings.join('\x1f')}`;
      if (titleBatchInflight.has(batchKey)) continue;

      const requestId = `op_tt_${nowMs().toString(36)}_${++reqSeq}`;
      titleBatchInflight.set(batchKey, requestId);

      br.translateStream(
        {
          text: JSON.stringify({ v: 1, items: batchStrings }),
          mode: activeMode === 'machine' ? 'tool-batch:machine' : 'tool-batch:ai',
          priority: 7000,
          requestId,
          targetLang: activeLang,
        },
        null
      )
        .then((res) => {
          titleBatchInflight.delete(batchKey);
          if (!translateTitles || currentMode !== activeMode || resolveActiveLang() !== activeLang) return;
          let outItems = null;
          if (res && res.ok) {
            if (Array.isArray(res.items)) {
              outItems = res.items;
            } else if (typeof res.text === 'string' && res.text.trim()) {
              try {
                const parsed = JSON.parse(res.text);
                if (Array.isArray(parsed?.items)) outItems = parsed.items;
              } catch (_) {}
            }
          }
          if (!outItems || outItems.length !== batchStrings.length) {
            const until = nowMs() + 20000;
            for (let k = 0; k < batchStrings.length; k++) {
              markTitleFailed(`${modePrefix}${batchStrings[k]}`, until);
            }
            return;
          }
          for (let k = 0; k < batchStrings.length; k++) {
            const trText = typeof outItems[k] === 'string' ? outItems[k].trim() : '';
            if (trText && trText !== batchStrings[k]) {
              if (titleCache.size >= 600) {
                const oldest = titleCache.keys().next().value;
                if (oldest !== undefined) titleCache.delete(oldest);
              }
              titleCache.set(`${modePrefix}${batchStrings[k]}`, trText);
            }
          }
          for (let i = 0; i < batchCands.length; i++) {
            const cand = batchCands[i];
            const idx = batchIdxMap.get(cand.trimmed);
            const trText = idx !== undefined && typeof outItems[idx] === 'string' ? outItems[idx].trim() : '';
            if (trText && trText !== cand.trimmed) {
              applyTitleText(cand, trText, activeLang, activeMode);
            }
          }
        })
        .catch(() => {
          titleBatchInflight.delete(batchKey);
          const until = nowMs() + 20000;
          for (let k = 0; k < batchStrings.length; k++) {
            markTitleFailed(`${modePrefix}${batchStrings[k]}`, until);
          }
        });
    }
  }

  function scanNow() {
    scanTimer = null;
    if (currentMode === 'off') return;
    const triggers = queryTriggers();
    if (!triggers.length) {
      if (translateToolSummaries) scanToolSummaryContainers();
      if (translateTitles) scanConversationTitles();
      return;
    }

    const lastIdx = triggers.length - 1;
    const candidates = [];
    const activePanelSet = new Set();
    let sawOffscreenLazy = false;

    for (let i = 0; i <= lastIdx; i++) {
      const btn = triggers[i];
      if (!btn) continue;
      const isLatest = i === lastIdx;
      const allowPreload = triggerTiming === 'preload' && isLatest;
      const expanded = ga(btn, A_EXP) === 'true';
      if (!allowPreload && !expanded) continue;

      const panel = nextSib(btn);
      if (panel) {
        const em = panelMeta.get(panel);
        const streamingNow = isTriggerStreaming(btn);
        if (streamingNow && expanded && isLatest && em && em.s && ga(panel, A_PND) === '1') {
          trackStreamingTrigger(btn, panel);
          activePanelSet.add(panel);
          continue;
        }
        if (em && !streamingNow && em.rs === quickPanelStamp(panel)) {
          if (expanded && ga(panel, A_RDY) === '1' && em.ds && em.ds === ga(panel, A_SIG)) {
            continue;
          }
          if (!expanded) {
            const inf = rawCacheMap.get(panel);
            if (inf && inf.s === em.rs && em.ps && em.ps === sigFromBody(inf.k, currentMode)) {
              continue;
            }
          }
        }
        if (!isLatest && isHiddenByAncestor(btn, panel)) continue;
        if (em && !streamingNow && em.rs === quickPanelStamp(panel) && isHiddenByAncestor(btn, panel)) {
          const inf = rawCacheMap.get(panel);
          if (inf && inf.s === em.rs && em.ps && em.ps === sigFromBody(inf.k, currentMode)) {
            activePanelSet.add(panel);
            continue;
          }
        }
      }

      const band = expanded && !isLatest ? probeViewportBand(panel || btn) : 0;
      if (!isLatest && band === 0) {
        sawOffscreenLazy = true;
        continue;
      }
      if (panel) activePanelSet.add(panel);

      const tier = isLatest && expanded ? 25 : band === 2 ? 20 : isLatest ? 12 : 10;
      candidates.push({ b: btn, a: allowPreload, p: tier * 1000 + i });
    }
    hasOffscreenLazyPanels = sawOffscreenLazy;

    if (inflightBySig.size > 0) pruneUnneededPendingRequests(activePanelSet);
    if (candidates.length) {
      candidates.sort((x, y) => y.p - x.p);
      syncHydrateBudget = 1;
      try {
        for (let i = 0; i < candidates.length; i++) {
          processSingleTrigger(candidates[i].b, candidates[i].a, candidates[i].p);
        }
      } finally {
        syncHydrateBudget = 99;
      }
    }
    if (translateToolSummaries) scanToolSummaryContainers();
    if (translateTitles) scanConversationTitles();
  }

  function scheduleScan(delayMs = 55) {
    if (currentMode === 'off' || scanTimer) return;
    scanTimer = setTimeout(scanNow, delayMs);
  }

  const clrScan = () => {
    if (scanTimer) {
      clearTimeout(scanTimer);
      scanTimer = null;
    }
  };
  const brCall = (action, inp) => {
    const br = getBridge();
    return br ? br.call({ action, ...inp }) : offRes();
  };
  const RESET_SIG_ATTRS = [A_SIG, A_FBK, A_FLD];

  let syncedOnce = false;

  const api = {
    sync(cfg = {}) {
      const nextMode = cfg.thoughtTranslate === 'machine' || cfg.thoughtTranslate === 'ai' ? cfg.thoughtTranslate : 'off';
      const prevTrigger = triggerTiming;
      triggerTiming = cfg.thoughtTrigger === 'expand' ? 'expand' : 'preload';
      const triggerChanged = prevTrigger !== triggerTiming;

      const prevLang = currentLang;
      currentLang = resolveActiveLang(cfg.language);
      const langChanged = prevLang !== currentLang;
      if (langChanged) refreshAllOverlayLocaleStrings();

      let toolSummaryChanged = false;
      if (typeof cfg.translateToolSummaries === 'boolean') {
        hasExplicitToolSummaries = true;
        toolSummaryChanged = setTranslateToolSummariesFlag(cfg.translateToolSummaries, false);
      }

      let titleChanged = false;
      if (typeof cfg.translateTitles === 'boolean') {
        hasExplicitTitles = true;
        titleChanged = setTranslateTitlesFlag(cfg.translateTitles, false);
      }

      const incomingView = cfg.thoughtView || cfg.thoughtViewMode;
      let viewChanged = false;
      if (incomingView === 'bilingual' || incomingView === 'immersive') {
        hasExplicitHostView = true;
        viewModeLoaded = true;
        viewChanged = currentViewMode !== incomingView;
        currentViewMode = incomingView;
        if (viewChanged || !syncedOnce) {
          persistViewModePreference(currentViewMode);
          syncDocViewAttribute();
          refreshAllPanelViewModes(viewChanged);
        }
      }

      if (nextMode === 'off') {
        clrScan();
        currentMode = 'off';
        syncedOnce = false;
        releasePrismOverlays();
        return;
      }

      if (triggerTiming === 'expand' && prevTrigger !== 'expand') cancelCollapsedInflightRequests();
      else if (triggerTiming === 'expand') clearAllWaitTimers(true);

      const changed = currentMode !== nextMode;
      const hadPrevEngine = currentMode !== 'off';
      currentMode = nextMode;
      ensureInitialized();
      if (changed || langChanged) {
        clearHydrateQueue();
        restoreAllToolSummaries();
        restoreAllTitles();
        if (hadPrevEngine) {
          clearAllWaitTimers(false);
          for (const entry of inflightBySig.values()) cancelTranslateRequest(entry);
          inflightBySig.clear();
        }
        const resetPanelSig = (p) => {
          if (!p) return;
          clearTriggerStatusBadge(p);
          raList(p, RESET_SIG_ATTRS);
          const m = panelMeta.get(p);
          if (m && (m.s || m.m)) {
            m.ds = '';
            m.ps = '';
            delete m.skippedSig;
          } else {
            panelMeta.delete(p);
          }
        };
        qsa(SEL_TRIGGER).forEach((b) => resetPanelSig(nextSib(b)));
        qsa(SEL_OVERLAY).forEach((ov) => resetPanelSig(parEl(ov)));
      }
      const needScan = !syncedOnce || changed || langChanged || viewChanged || triggerChanged || toolSummaryChanged || titleChanged;
      syncedOnce = true;
      if (needScan) scheduleScan(25);
    },
    scan() {
      scheduleScan(45);
    },
    scanImmediate() {
      clrScan();
      scanNow();
    },
    getViewMode() {
      loadViewModePreference();
      return currentViewMode;
    },
    setViewMode(nextViewMode, opts = {}) {
      const normalized = nextViewMode === 'bilingual' ? 'bilingual' : 'immersive';
      hasExplicitHostView = true;
      viewModeLoaded = true;
      const changed = currentViewMode !== normalized;
      currentViewMode = normalized;
      persistViewModePreference(normalized);
      syncDocViewAttribute();
      refreshAllPanelViewModes(true);
      if (changed && opts.persistDaemon !== false) {
        void callDaemonRpc({ action: 'save-config', viewMode: normalized }).catch(() => {});
      }
      return currentViewMode;
    },
    getTranslateToolSummaries() {
      return Boolean(translateToolSummaries);
    },
    setTranslateToolSummaries(enabled, opts = {}) {
      const next = Boolean(enabled);
      hasExplicitToolSummaries = true;
      const changed = setTranslateToolSummariesFlag(next, true);
      if (changed && opts.persistDaemon === true) {
        void callDaemonRpc({ action: 'save-config', translateToolSummaries: next }).catch(() => {});
      }
      return translateToolSummaries;
    },
    getTranslateTitles() {
      return Boolean(translateTitles);
    },
    setTranslateTitles(enabled, opts = {}) {
      const next = Boolean(enabled);
      hasExplicitTitles = true;
      const changed = setTranslateTitlesFlag(next, true);
      if (changed && opts.persistDaemon === true) {
        void callDaemonRpc({ action: 'save-config', translateTitles: next }).catch(() => {});
      }
      return translateTitles;
    },
    retryBlock: (panel) => retryPanelNow(panel),
    clearCooldown: (sig) => clearSigCooldown(sig),
    getLocalCacheStats,
    clearLocalCache,
    getCacheStats() {
      const local = getLocalCacheStats();
      const mk = (localOnly, dEntries, dBytes) => ({
        ok: true,
        localOnly,
        localEntries: local.memEntries,
        storageEntries: local.storageEntries,
        daemonEntries: dEntries,
        diskBytes: dBytes,
        totalEntries: Math.max(local.memEntries, dEntries),
      });
      return callDaemonRpc({ action: 'cache-stats' })
        .then((res) => (res && res.ok && typeof res.entries === 'number' ? mk(false, res.entries, res.diskBytes || 0) : mk(true, 0, 0)))
        .catch(() => mk(true, 0, 0));
    },
    clearCache() {
      const localRes = clearLocalCache();
      const mk = (localOnly, dc) => ({ ok: true, localOnly, localCleared: localRes.cleared, daemonCleared: dc });
      return callDaemonRpc({ action: 'clear-cache' })
        .then((res) => (res && res.ok ? mk(false, typeof res.cleared === 'number' ? res.cleared : 0) : mk(true, 0)))
        .catch(() => mk(true, 0));
    },
    getConfig: () => brCall('get-config').then((res) => (syncRemoteCfgMeta(res), res)),
    saveConfig(input) {
      if (input && typeof input.translateToolSummaries === 'boolean') {
        hasExplicitToolSummaries = true;
      }
      if (input && typeof input.translateTitles === 'boolean') {
        hasExplicitTitles = true;
      }
      return brCall('save-config', input).then((res) => {
        const nextTag = res?.styleTag || (res?.stylePreset ? `ai_${res.stylePreset}` : '');
        const tagChanged = setActiveStyleTag(nextTag);
        if (res && typeof res.translateToolSummaries === 'boolean') {
          setTranslateToolSummariesFlag(res.translateToolSummaries, false);
        } else if (input && typeof input.translateToolSummaries === 'boolean') {
          setTranslateToolSummariesFlag(input.translateToolSummaries, false);
        }
        if (res && typeof res.translateTitles === 'boolean') {
          setTranslateTitlesFlag(res.translateTitles, false);
        } else if (input && typeof input.translateTitles === 'boolean') {
          setTranslateTitlesFlag(input.translateTitles, false);
        }
        qsa(SEL_TRIGGER).forEach((b) => {
          const p = nextSib(b);
          if (p && (tagChanged || ga(p, A_FBK) === '1' || ga(p, A_FLD) === '1' || findChildByClass(b, C_TRG))) {
            clearTriggerStatusBadge(b);
            raList(p, RESET_SIG_ATTRS);
            panelMeta.delete(p);
          }
        });
        failedSigs.clear();
        toolSummaryFailedUntil.clear();
        titleFailedUntil.clear();
        scheduleScan(25);
        return res;
      });
    },
    fetchModels: (input) => brCall('fetch-models', input),
    testConnection: (input) => brCall('test-connection', input),
    diagnose: (input) => brCall('diagnose', input),
    __memCache: memCache,
    __toolSummaryRecords: toolSummaryRecords,
    __toolSummaryFailedUntil: toolSummaryFailedUntil,
    __titleRecords: titleRecords,
    __titleFailedUntil: titleFailedUntil,
    __observedTitleRoots: observedTitleRoots,
    destroy() {
      currentMode = 'off';
      syncedOnce = false;
      hasOffscreenLazyPanels = false;
      hasOffscreenTitles = false;
      clrScan();
      stopTitleObserver();
      if (cacheDirty || persistTimer || persistIdle || memCache.size > storedCount) flushLocalStorageCacheNow();
      releasePrismOverlays();
      hlBks = null;
    },
  };

  W.__agPrismThought = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);

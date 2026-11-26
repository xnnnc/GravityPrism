// Obsidian Prism — Route Choreography, Velvet Stream Feathering, Auto-Unfold & Lens Module (stream-choreography.js)
(function (root) {
  'use strict';
  const M = Math;
  const G = root || (typeof globalThis !== 'undefined' ? globalThis : window);
  if (!G) return;

  const STREAM_BATCH_MS = 52;
  const STREAM_FADE_MS = 300;
  const STREAM_FADE_STEP_MS = 60;
  const MAX_FADE_RANGES = 48;
  const SIDEBAR_RUN_HOLD_MS = 450;
  const STOP_TID_RE = /(?:^|[^a-z])(?:stop|cancel|abort)(?:[^a-z]|$)/i;
  const STOP_CAMEL_RE = /(?:^|[^a-zA-Z])(?:stop|cancel|abort)(?=[A-Z])|(?:Stop|Cancel|Abort)(?:[A-Z0-9_-]|$)/;
  const STOP_LABEL_RE = /(?:^|\b)(?:stop|cancel|abort)(?:\b|$)|停止|取消|中止/i;
  const NON_STOP_RE =
    /取消置顶|取消固定|取消收藏|unpin|\b(?:pin|menu|more|options|delete|trash|archive|rename|close|dismiss)\b|置顶|固定|更多|菜单|选项|删除|归档|重命名/i;
  const HIGHLIGHT_NAMES = [0, 1, 2, 3, 4].map((i) => 'ag-stream-f' + i);
  const TABLE_TAGS = new Set('TABLE|THEAD|TBODY|TFOOT|TR|TH|TD'.split('|'));
  const INLINE_TAGS = new Set('SPAN|STRONG|EM|B|I|A|CODE|MARK|DEL|SUB|SUP'.split('|'));
  const K_PE = 'parentElement';
  const K_CL = 'classList';
  const K_IC = 'isConnected';

  const isEl = (n) => Boolean(n && (n.nodeType === 1 || (n.nodeType === undefined && typeof n.tagName === 'string')));
  const tagOf = (n) => String(n?.tagName || '').toUpperCase();
  const peOf = (n) => n?.[K_PE] || null;
  const clHas = (e, c) => Boolean(e?.[K_CL]?.contains?.(c));
  const clRm = (e, c) => e?.[K_CL]?.remove?.(c);
  const isConn = (e) => !!(e && e[K_IC] !== false);
  const ga = (e, k) => e?.getAttribute?.(k);
  const sa = (e, k, v) => e?.setAttribute?.(k, v);
  const ra = (e, k) => e?.removeAttribute?.(k);
  const ha = (e, k) => Boolean(e?.hasAttribute?.(k));
  const qs = (e, s) => e?.querySelector?.(s) || null;
  const qsa = (e, s) => e?.querySelectorAll?.(s) || [];
  const closestOf = (e, s) => e?.closest?.(s) || null;
  const rectOf = (e) => (typeof e?.getBoundingClientRect === 'function' ? e.getBoundingClientRect() : null);
  const setProp = (e, k, v) => e?.style?.setProperty?.(k, v);
  const docOf = () => (typeof document !== 'undefined' ? document : null);
  const nowOf = () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());
  const rAF = (fn) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : 0);
  const cAF = (id) => {
    if (id && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
  };
  const ST = (fn, ms) => setTimeout(fn, ms);
  const CT = (id) => clearTimeout(id), AF = Array.from, isFin = Number.isFinite;

  const createStreamChoreographyController = ({
    motionEngine,
    isDestroyed,
    isMotionStandardOrUltra,
    isMotionUltra,
    isConvRunning,
    isThoughtIsolatedNode,
    isThoughtMutationRecord,
    isManagedThoughtPanel,
    setAttrIfChanged,
    runGuardedMut,
    cloneCachedSvgElement,
    buildBrandMarkSvg,
    applySingleHostIcon,
    rippleCtl,
    convAuraCtl,
    notifyMascot,
  }) => {
    let hydrateRaf = 0;
    let sparkQueue = [];
    let iconQueue = [];
    let unfoldQueue = [];
    let unfoldRaf = 0;
    let wfClickTimer = 0;
    let convEntryTimer = 0;
    let convEntryRaf = 0;
    let convEntrySeq = 0;
    const transientTimers = new Set();

    const heroState = {
      routeInitialized: false,
      wasInHome: false,
      wasInFormalConv: false,
      lastModelSig: null,
      pendingModelShiftNotify: false,
      lastTriggerOrigin: null,
      lastGroupPress: null,
    };
    let lastHomeRect = null;
    let liftoffBubbleUntil = 0;
    let suppressEntryMotionUntil = 0;
    let runInit = false;
    let wasRunning = false;
    let runStartAt = 0;
    let lastVialHighNotifyAt = -600000;
    let fiberTimer = 0;
    let sbInit = false;
    let sbIndex = -1;
    let sbCid = '';
    let sbRect = null;
    let sbRunning = false;
    const runningCidMap = new Map();
    const runningRowMap = new WeakMap();
    let runHoldTimer = 0;

    const seenHeaders = new WeakSet();
    const seenOverlays = new WeakSet();

    let streamObs = null;
    const streamRoots = new Set();
    const paneRunState = new WeakMap();
    let streamMutating = false;
    let lastCodeAt = -1000;
    let scannedNodes = new WeakSet();
    let seenBlocks = new WeakSet();
    const textLenMap = new WeakMap();

    const fadeItems = [];
    let hlBuckets = null;
    let fadeRaf = 0;
    let fadeTimer = 0;
    let nextFadeDueAt = 0;
    const doneSparkCache = new WeakMap();

    const expirableClasses = new Map();
    let sweepTimer = 0;

    const canStreamMotion = () => {
      const d = docOf();
      if (ga(d?.documentElement, 'data-ag-cs-motion') === 'off') return false;
      return typeof isMotionStandardOrUltra === 'function' ? Boolean(isMotionStandardOrUltra()) : Boolean(isMotionUltra());
    };

    const getHlBuckets = () => {
      const cssObj = typeof CSS !== 'undefined' ? CSS : G.CSS;
      const HlCtor = typeof Highlight === 'function' ? Highlight : G.Highlight;
      const d = docOf();
      if (!cssObj?.highlights?.set || typeof HlCtor !== 'function' || typeof d?.createRange !== 'function') return null;
      if (!hlBuckets) {
        hlBuckets = HIGHLIGHT_NAMES.map((n) => {
          const h = cssObj.highlights.get?.(n) || new HlCtor();
          cssObj.highlights.set(n, h);
          return h;
        });
      } else {
        for (let i = 0; i < 5; i++) {
          const n = HIGHLIGHT_NAMES[i];
          const cur = cssObj.highlights.get?.(n);
          if (cur && cur !== hlBuckets[i]) hlBuckets[i] = cur;
          else if (!cur) cssObj.highlights.set(n, hlBuckets[i]);
        }
      }
      return hlBuckets;
    };

    const dropBucketItem = (it) => {
      if (hlBuckets && it.b >= 0 && it.b < 5) {
        try {
          hlBuckets[it.b].delete(it.r);
        } catch {}
      }
      it.b = -1;
    };

    const clearFadeTimer = () => {
      if (fadeTimer) {
        CT(fadeTimer);
        fadeTimer = 0;
      }
    };

    const clearHighlightFade = () => {
      clearFadeTimer();
      cAF(fadeRaf);
      fadeRaf = 0;
      nextFadeDueAt = 0;
      for (let i = 0; i < fadeItems.length; i++) dropBucketItem(fadeItems[i]);
      fadeItems.length = 0;
    };

    const scheduleFadeStep = (now, useTimer) => {
      if (isDestroyed() || fadeItems.length === 0) return;
      if (docOf()?.hidden) {
        clearHighlightFade();
        return;
      }
      if (fadeRaf) return;
      const delay = nextFadeDueAt > 0 ? nextFadeDueAt - now : 0;
      if (useTimer && delay > 18 && typeof setTimeout === 'function') {
        if (fadeTimer) return;
        fadeTimer = ST(() => {
          fadeTimer = 0;
          if (isDestroyed() || !canStreamMotion() || fadeItems.length === 0 || docOf()?.hidden) {
            clearHighlightFade();
            return;
          }
          if (!fadeRaf) {
            fadeRaf = rAF(stepHighlightFade);
            if (!fadeRaf) clearHighlightFade();
          }
        }, M.max(8, M.round(delay - 6)));
        return;
      }
      clearFadeTimer();
      fadeRaf = rAF(stepHighlightFade);
      if (!fadeRaf) clearHighlightFade();
    };

    function stepHighlightFade(ts) {
      clearFadeTimer();
      fadeRaf = 0;
      if (isDestroyed() || !canStreamMotion() || fadeItems.length === 0 || docOf()?.hidden) {
        clearHighlightFade();
        return;
      }
      const now = typeof ts === 'number' && isFin(ts) ? ts : nowOf();
      if (nextFadeDueAt > 0 && now < nextFadeDueAt - 1) {
        scheduleFadeStep(now, true);
        return;
      }
      const buckets = getHlBuckets();
      if (!buckets) {
        clearHighlightFade();
        return;
      }
      let w = 0;
      let earliestDue = Infinity;
      for (let i = 0; i < fadeItems.length; i++) {
        const it = fadeItems[i];
        const tn = it.n;
        const val = tn ? tn.data ?? tn.nodeValue ?? '' : '';
        const age = M.max(0, now - it.t);
        if (!isConn(tn) || val.length < it.e || age >= STREAM_FADE_MS) {
          dropBucketItem(it);
          continue;
        }
        const nb = M.min(4, (age / STREAM_FADE_STEP_MS) | 0);
        if (it.b !== nb) {
          dropBucketItem(it);
          try {
            buckets[nb].add(it.r);
            it.b = nb;
          } catch {
            continue;
          }
        }
        const due = it.t + (it.b + 1) * STREAM_FADE_STEP_MS;
        if (due < earliestDue) earliestDue = due;
        fadeItems[w++] = it;
      }
      fadeItems.length = w;
      if (w > 0) {
        nextFadeDueAt = isFin(earliestDue) ? earliestDue : 0;
        scheduleFadeStep(now, false);
      } else {
        clearHighlightFade();
      }
    }

    const enqueueFadeRange = (tn, sOff, eOff, now) => {
      if (!tn || eOff <= sOff) return false;
      const d = docOf();
      if (!d || d.hidden) return false;
      const buckets = getHlBuckets();
      if (!buckets) return false;
      const raw = tn.data ?? tn.nodeValue ?? '';
      if (eOff > raw.length || !/\S/.test(raw.slice(sOff, eOff))) return false;

      const prev = fadeItems.length > 0 ? fadeItems[fadeItems.length - 1] : null;
      if (prev && prev.n === tn && prev.e === sOff && now - prev.t <= 64) {
        try {
          prev.r.setEnd(tn, eOff);
          prev.e = eOff;
          return true;
        } catch {}
      }
      if (fadeItems.length >= MAX_FADE_RANGES) {
        const old = fadeItems.shift();
        if (old) dropBucketItem(old);
      }
      try {
        const r = d.createRange();
        r.setStart(tn, sOff);
        r.setEnd(tn, eOff);
        buckets[0].add(r);
        fadeItems.push({ n: tn, s: sOff, e: eOff, r, b: 0, t: now });
        const due = now + STREAM_FADE_STEP_MS;
        const earlier = !nextFadeDueAt || due < nextFadeDueAt;
        if (earlier) nextFadeDueAt = due;
        if (earlier && fadeTimer) clearFadeTimer();
        scheduleFadeStep(now, false);
        return true;
      } catch {
        return false;
      }
    };

    const snapTextLens = (node, limit = 24) => {
      if (!node) return;
      let c = 0;
      const walk = (n) => {
        if (!n || c >= limit) return;
        if (n.nodeType === 3) {
          textLenMap.set(n, (n.data ?? n.nodeValue ?? '').length);
          c++;
          return;
        }
        const ks = n.childNodes;
        if (!ks) return;
        for (let i = ks.length - 1; i >= 0 && c < limit; i--) walk(ks[i]);
      };
      walk(node);
    };

    const flushExpiredClasses = () => {
      sweepTimer = 0;
      if (expirableClasses.size === 0) return;
      const now = Date.now();
      let nextDue = Infinity;
      runGuardedMut(() => {
        for (const [el, map] of expirableClasses.entries()) {
          for (const [cls, expAt] of map.entries()) {
            if (now >= expAt - 2) {
              clRm(el, cls);
              map.delete(cls);
            } else if (expAt < nextDue) nextDue = expAt;
          }
          if (map.size === 0) expirableClasses.delete(el);
        }
      });
      if (!isDestroyed() && expirableClasses.size > 0 && isFin(nextDue)) {
        sweepTimer = ST(flushExpiredClasses, M.max(16, M.ceil(nextDue - Date.now())));
      }
    };

    const scheduleTransient = (fn, ms) => {
      const id = ST(() => {
        transientTimers.delete(id);
        if (!isDestroyed()) {
          try {
            fn();
          } catch {}
        }
      }, ms);
      transientTimers.add(id);
      return id;
    };

    const clearTransientTimers = () => {
      convEntrySeq++;
      if (convEntryTimer) {
        CT(convEntryTimer);
        convEntryTimer = 0;
      }
      if (convEntryRaf) {
        cAF(convEntryRaf);
        convEntryRaf = 0;
      }
      if (wfClickTimer) {
        CT(wfClickTimer);
        wfClickTimer = 0;
      }
      if (sweepTimer) {
        CT(sweepTimer);
        sweepTimer = 0;
      }
      if (runHoldTimer) {
        CT(runHoldTimer);
        runHoldTimer = 0;
      }
      runningCidMap.clear();
      expirableClasses.clear();
      for (const id of transientTimers) CT(id);
      transientTimers.clear();
    };

    const cancelDeferredHydration = () => {
      convEntrySeq++;
      if (convEntryTimer) {
        CT(convEntryTimer);
        convEntryTimer = 0;
      }
      if (convEntryRaf) {
        cAF(convEntryRaf);
        convEntryRaf = 0;
      }
      cAF(hydrateRaf);
      hydrateRaf = 0;
      cAF(unfoldRaf);
      unfoldRaf = 0;
      sparkQueue = [];
      iconQueue = [];
      unfoldQueue = [];
    };

    const applySingleSpark = (trig, brand, st) => {
      const d = docOf();
      if (!d || !isConn(trig)) return;
      if (st === 'streaming') setAttrIfChanged(trig, 'data-ag-cs-spark-streaming', '1');
      else if (ha(trig, 'data-ag-cs-spark-streaming')) ra(trig, 'data-ag-cs-spark-streaming');
      let spark = clHas(trig.firstElementChild, 'ag-cs-thinking-spark') ? trig.firstElementChild : qs(trig, '.ag-cs-thinking-spark');
      if (!spark) {
        spark = d.createElement('span');
        spark.className = 'ag-cs-thinking-spark';
        sa(spark, 'aria-hidden', 'true');
        sa(spark, 'data-ag-no-i18n', '');
        sa(spark, 'data-ag-owned', '1');
        trig.insertBefore(spark, trig.firstChild);
      }
      const isMono = ga(d.documentElement, 'data-ag-cs-accent') === 'mono';
      const mv = isMono ? '1' : '0';
      if (ga(spark, 'data-brand') !== brand || ga(spark, 'data-state') !== st || ga(spark, 'data-mono') !== mv) {
        sa(spark, 'data-brand', brand);
        sa(spark, 'data-state', st);
        sa(spark, 'data-mono', mv);
        const svgStr = buildBrandMarkSvg(brand, 13, 'auto', isMono);
        const cloned = cloneCachedSvgElement(`spark:${brand}:${mv}`, svgStr);
        if (cloned && typeof spark.replaceChildren === 'function') spark.replaceChildren(cloned);
        else spark.innerHTML = svgStr;
      }
    };

    const stepHydration = () => {
      hydrateRaf = 0;
      if (isDestroyed()) return;
      runGuardedMut(() => {
        let budget = 18;
        while (budget > 0 && sparkQueue.length > 0) {
          const it = sparkQueue.pop();
          applySingleSpark(it.trig, it.brand, it.st);
          budget--;
        }
        while (budget > 0 && iconQueue.length > 0) {
          const it = iconQueue.pop();
          if (!ga(it.btn, 'data-ag-cs-icon-injected')) applySingleHostIcon(it.btn, it.iconName, it.origSvg, it.size);
          budget--;
        }
      });
      if (sparkQueue.length > 0 || iconQueue.length > 0) hydrateRaf = rAF(stepHydration);
    };

    const enqueueDeferredIcons = (items) => {
      iconQueue = items;
      if (!isDestroyed() && !hydrateRaf) hydrateRaf = rAF(stepHydration);
    };

    const STREAM_THOUGHT_RE = /(?:\.\.\.|…)\s*$|正在思考|思考中/i;
    const isStreamingThoughtTrigger = (trig, isLast) => {
      if (ga(trig, 'data-op-thought-state') === 'streaming') return true;
      if (!isLast) return false;
      return STREAM_THOUGHT_RE.test(String(trig.textContent || '').trim());
    };

    const resolveScopeBrand = (scope, primaryModelInfo, paneModelMap) => {
      const mapped = paneModelMap && typeof paneModelMap.get === 'function' ? paneModelMap.get(scope)?.brand : '';
      if (mapped) return mapped;
      const paneAttr =
        (scope && scope !== docOf() && ga(scope, 'data-ag-cs-pane-camp')) ||
        (scope && typeof scope.closest === 'function' && ga(scope.closest('[data-tiling-pane]'), 'data-ag-cs-pane-camp')) ||
        '';
      if (paneAttr) return paneAttr;
      const glyphBrand =
        scope && scope !== docOf()
          ? ga(qs(scope, '[data-testid="model-selector-trigger"] .ag-cs-model-glyph'), 'data-brand')
          : '';
      if (glyphBrand) return glyphBrand;
      return primaryModelInfo?.brand || 'gemini';
    };

    const syncThinkingSparks = (primaryModelInfo, paneModelMap = null) => {
      const d = docOf();
      if (isDestroyed() || !d) return;
      const views = findFormalConvViews();
      const scopes = views.length > 0 ? views : [d];
      const mv = ga(d.documentElement, 'data-ag-cs-accent') === 'mono' ? '1' : '0';
      const pending = [];
      for (let s = 0; s < scopes.length; s++) {
        const scope = scopes[s];
        const brand = resolveScopeBrand(scope, primaryModelInfo, paneModelMap);
        const cacheSig = `${brand}:${mv}`;
        const triggers = qsa(scope, '[data-testid="thinking-collapsible-trigger"]');
        const len = triggers.length;
        for (let i = 0; i < len; i++) {
          const trig = triggers[i];
          const isLast = i === len - 1;
          const explicitStreaming = ga(trig, 'data-op-thought-state') === 'streaming';
          if (!explicitStreaming && !isLast && doneSparkCache.get(trig) === cacheSig) continue;
          const spark = clHas(trig.firstElementChild, 'ag-cs-thinking-spark') ? trig.firstElementChild : qs(trig, '.ag-cs-thinking-spark');
          if (
            !explicitStreaming &&
            !isLast &&
            spark &&
            ga(spark, 'data-state') === 'done' &&
            ga(spark, 'data-brand') === brand &&
            ga(spark, 'data-mono') === mv &&
            !ha(trig, 'data-ag-cs-spark-streaming')
          ) {
            doneSparkCache.set(trig, cacheSig);
            continue;
          }
          const st = explicitStreaming || isStreamingThoughtTrigger(trig, isLast) ? 'streaming' : 'done';
          if (
            spark &&
            ga(spark, 'data-brand') === brand &&
            ga(spark, 'data-state') === st &&
            ga(spark, 'data-mono') === mv &&
            (st === 'streaming') === ha(trig, 'data-ag-cs-spark-streaming')
          ) {
            if (st === 'done' && !isLast) doneSparkCache.set(trig, cacheSig);
            else doneSparkCache.delete(trig);
            continue;
          }
          if (st !== 'done') doneSparkCache.delete(trig);
          pending.push({ trig, brand, st, isLast, cacheSig });
        }
      }
      const runApply = (it) => {
        applySingleSpark(it.trig, it.brand, it.st);
        if (it.st === 'done' && !it.isLast) doneSparkCache.set(it.trig, it.cacheSig);
      };
      if (pending.length <= 16 || typeof requestAnimationFrame !== 'function') {
        for (let i = 0; i < pending.length; i++) runApply(pending[i]);
      } else {
        const syncStart = pending.length - 12;
        for (let i = syncStart; i < pending.length; i++) runApply(pending[i]);
        sparkQueue = pending.slice(0, syncStart);
        if (!hydrateRaf) hydrateRaf = rAF(stepHydration);
      }
    };

    const clearWorkedForAutoUnfoldAttrs = () => {
      const d = docOf();
      if (!d) return;
      for (const el of qsa(d, '[data-ag-cs-auto-unfolded]')) ra(el, 'data-ag-cs-auto-unfolded');
      for (const el of qsa(d, '[data-ag-cs-outer-open]')) ra(el, 'data-ag-cs-outer-open');
    };

    const pumpUnfoldQueue = () => {
      unfoldRaf = 0;
      if (isDestroyed() || unfoldQueue.length === 0) {
        unfoldQueue = [];
        return;
      }
      let budget = 2;
      while (unfoldQueue.length > 0 && budget > 0) {
        const cb = unfoldQueue.pop();
        if (!cb || !isConn(cb)) continue;
        if (ga(cb, 'aria-expanded') === 'false' && typeof cb.click === 'function') {
          try {
            cb.click();
          } catch {}
          budget--;
        }
      }
      if (unfoldQueue.length > 0 && !isDestroyed()) {
        unfoldRaf = rAF(pumpUnfoldQueue);
      }
    };

    const processOuterWf = (btn, pendingClicks) => {
      if (!isConn(btn)) return;
      const expanded = ga(btn, 'aria-expanded') === 'true';
      let scope = btn.nextElementSibling;
      if (!scope) {
        let sib = btn.nextSibling;
        while (sib && sib.nodeType && sib.nodeType !== 1) sib = sib.nextSibling;
        scope = sib || null;
      }
      if (!scope) scope = peOf(btn);
      const innerBtns = qsa(scope, '[data-testid="tool-group-collapsible"]');
      if (expanded) {
        setAttrIfChanged(btn, 'data-ag-cs-outer-open', '1');
        for (const cb of innerBtns) {
          if (cb !== btn && ga(cb, 'data-ag-cs-auto-unfolded') !== '1') {
            sa(cb, 'data-ag-cs-auto-unfolded', '1');
            if (ga(cb, 'aria-expanded') === 'false' && typeof cb.click === 'function') {
              pendingClicks.push(cb);
            }
          }
        }
      } else if (ga(btn, 'data-ag-cs-outer-open') === '1') {
        ra(btn, 'data-ag-cs-outer-open');
        for (const cb of innerBtns) ra(cb, 'data-ag-cs-auto-unfolded');
        const p = peOf(btn);
        if (p && p !== scope) {
          for (const el of qsa(p, '[data-ag-cs-auto-unfolded]')) ra(el, 'data-ag-cs-auto-unfolded');
        }
      }
    };

    const flushPendingUnfoldClicks = (pendingClicks) => {
      if (!pendingClicks.length) return;
      if (pendingClicks.length <= 2 || typeof requestAnimationFrame !== 'function') {
        for (let i = 0; i < pendingClicks.length; i++) {
          const cb = pendingClicks[i];
          if (isConn(cb) && ga(cb, 'aria-expanded') === 'false') {
            try {
              cb.click();
            } catch {}
          }
        }
        return;
      }
      // 优先同步展开最新的 2 个工具组，其余历史组按帧每帧展开 2 个，避免切换长会话同步连环点击阻塞主线程
      for (let k = 0; k < 2 && pendingClicks.length > 0; k++) {
        const cb = pendingClicks.pop();
        if (isConn(cb) && ga(cb, 'aria-expanded') === 'false') {
          try {
            cb.click();
          } catch {}
        }
      }
      for (let i = 0; i < pendingClicks.length; i++) unfoldQueue.push(pendingClicks[i]);
      if (!unfoldRaf && unfoldQueue.length > 0) unfoldRaf = rAF(pumpUnfoldQueue);
    };

    const syncWorkedForAutoUnfold = (dirtyTargets = null) => {
      const d = docOf();
      if (isDestroyed()) {
        clearWorkedForAutoUnfoldAttrs();
        return;
      }
      if (!d) return;
      const pendingClicks = [];
      if (dirtyTargets && dirtyTargets.size > 0) {
        const outers = new Set();
        for (const node of dirtyTargets) {
          if (!isConn(node)) continue;
          if (ga(node, 'data-testid') === 'worked-for-collapsible') {
            outers.add(node);
            continue;
          }
          const prev = node.previousElementSibling;
          if (prev && ga(prev, 'data-testid') === 'worked-for-collapsible') outers.add(prev);
          for (const b of qsa(node, '[data-testid="worked-for-collapsible"]')) outers.add(b);
          let cur = peOf(node);
          while (cur && cur !== d.body) {
            const sib = cur.previousElementSibling;
            if (sib && ga(sib, 'data-testid') === 'worked-for-collapsible') {
              outers.add(sib);
              break;
            }
            cur = peOf(cur);
          }
        }
        for (const btn of outers) processOuterWf(btn, pendingClicks);
        flushPendingUnfoldClicks(pendingClicks);
        return;
      }
      for (const btn of qsa(d, '[data-testid="worked-for-collapsible"]')) processOuterWf(btn, pendingClicks);
      flushPendingUnfoldClicks(pendingClicks);
    };

    const scheduleWorkedForClickSync = () => {
      if (isDestroyed()) return;
      if (wfClickTimer) CT(wfClickTimer);
      wfClickTimer = ST(() => {
        wfClickTimer = 0;
        if (!isDestroyed()) syncWorkedForAutoUnfold();
      }, 28);
    };

    function findFormalConvViews() {
      const d = docOf(), out = [];
      for (const cv of qsa(d, '[data-testid="conversation-view"]')) {
        if (closestOf(cv, '[data-testid="subagent-tab-conversation"]')) continue;
        if (closestOf(cv, '.agy-home') || qs(cv, '.agy-home')) continue;
        if (cv.hidden === true || cv.style?.display === 'none') continue;
        out.push(cv);
      }
      return out;
    }

    function findFormalConvView() {
      const d = docOf(), views = findFormalConvViews();
      if (views.length <= 1) return views[0] || null;
      const actCv = closestOf(d?.activeElement, '[data-testid="conversation-view"]');
      return actCv && views.includes(actCv) ? actCv : views[0];
    }

    const sampleHomeComposerRect = () => {
      const home = qs(docOf(), '.agy-home');
      if (!home) return null;
      const r = rectOf(qs(home, '[data-testid="agent-input-box"]') || qs(home, '.surface-composer-card'));
      if (r && r.width > 0 && r.height > 0) {
        lastHomeRect = { left: r.left, top: r.top, width: r.width, height: r.height };
      }
      return lastHomeRect;
    };

    const triggerHomeLiftoffRippleBurst = () => {
      const home = qs(docOf(), '.agy-home');
      if (!home) return;
      const r = sampleHomeComposerRect();
      if (isMotionUltra() && rippleCtl) rippleCtl.triggerLiftoffBurst(r);
    };

    const markLiftoffBubble = (conv) => {
      const bubble = qs(conv, '[data-testid="user-message-bubble"]');
      if (!bubble) return false;
      sa(bubble, 'data-ag-cs-liftoff-bubble', '1');
      scheduleTransient(() => {
        if (isConn(bubble)) ra(bubble, 'data-ag-cs-liftoff-bubble');
      }, 500);
      return true;
    };

    const triggerHeroALiftoff = (formalConv, measuredRect = null) => {
      const d = docOf();
      if (!isMotionUltra() || !formalConv || !d) return;
      const now = nowOf();
      for (const n of qsa(d, '.ag-cs-liftoff-veil')) n.remove();
      const veil = d.createElement('div');
      veil.className = 'ag-cs-liftoff-veil';
      sa(veil, 'aria-hidden', 'true');
      sa(veil, 'data-ag-no-i18n', '');
      sa(veil, 'data-ag-owned', '1');
      const r = lastHomeRect;
      setProp(veil, '--ag-lift-x', r && r.width > 0 ? `${Math.round(r.left + r.width / 2)}px` : '50%');
      setProp(veil, '--ag-lift-y', r && r.height > 0 ? `${Math.round(r.top + r.height / 2)}px` : '58%');
      const ring = d.createElement('div');
      ring.className = 'ag-cs-liftoff-ring';
      veil.appendChild(ring);
      d.body?.appendChild(veil);
      scheduleTransient(() => veil.remove(), 540);

      const inputBox = qs(formalConv, '[data-testid="agent-input-box"]') || qs(d, '[data-testid="agent-input-box"]');
      if (inputBox && typeof motionEngine?.spring === 'function') {
        const nr = measuredRect || rectOf(inputBox);
        const rawDelta = r && nr ? M.round(r.top - nr.top) : -160;
        const hostFade = Boolean(
          closestOf(inputBox, '.animate-fade-in, .no-transitions') ||
            closestOf(formalConv, '.no-transitions') ||
            clHas(formalConv, 'no-transitions')
        );
        const dy = hostFade
          ? M.max(-24, M.min(0, rawDelta === 0 ? -10 : M.round(rawDelta * 0.08)))
          : M.max(-420, M.min(-24, rawDelta === 0 ? -140 : rawDelta));
        try {
          motionEngine.spring(
            inputBox,
            [{ transform: `translateY(${dy}px) scale(${hostFade ? 0.996 : 0.985})` }, { transform: 'translateY(0) scale(1)' }],
            { durationMs: hostFade ? 220 : 480, stiffness: hostFade ? 360 : 310, damping: hostFade ? 32 : 28, slot: 'liftoff-dock' }
          );
        } catch {}
      }
      liftoffBubbleUntil = markLiftoffBubble(formalConv) ? 0 : now + 900;
      convAuraCtl?.triggerLiftoffEbb?.(now);
    };

    const triggerHeroBHomeReturn = () => {
      if (!isMotionUltra()) return;
      const home = qs(docOf(), '.agy-home');
      if (!home) return;
      rippleCtl?.triggerTideSwell?.();
      if (typeof motionEngine?.stagger === 'function') {
        const items = [qs(home, '[data-testid="home-greeting"]'), qs(home, '.ag-cs-home-panel'), qs(home, '[data-testid="agent-input-box"]')].filter(
          Boolean
        );
        if (items.length > 0) {
          try {
            motionEngine.stagger(items, [{ transform: 'translateY(8px)' }, { transform: 'translateY(0px)' }], {
              durationMs: 200,
              delayStep: 20,
              stepMs: 20,
              stiffness: 360,
              damping: 32,
              slot: 'home-return',
            });
          } catch {}
        }
      }
    };

    const guardMut = (fn) => (typeof runGuardedMut === 'function' ? runGuardedMut(fn) : fn());
    const setAttrSafe = (el, k, v) =>
      typeof setAttrIfChanged === 'function' ? setAttrIfChanged(el, k, v) : ga(el, k) !== v && sa(el, k, v);

    const getSidebarRowCid = (row) =>
      String(ga(row, 'data-cascade-id') || ga(qs(row, 'a[href]'), 'href') || ga(row, 'data-conversation-id') || '').trim();

    const isSidebarRowRunning = (row) => {
      if (!row) return false;
      if (qs(row, '[data-testid="status-loading-spinner"]')) return true;
      const btns = qsa(row, 'button, [role="button"]');
      for (let i = 0; i < btns.length; i++) {
        const b = btns[i];
        if (!b || b.hidden === true || ga(b, 'aria-hidden') === 'true') continue;
        if (ga(b, 'aria-haspopup') || ga(b, 'role') === 'checkbox') continue;
        const rawTid = String(ga(b, 'data-testid') || '').trim();
        const label = String(ga(b, 'aria-label') || ga(b, 'title') || '').trim();
        if (NON_STOP_RE.test(rawTid + ' ' + label)) continue;
        if (rawTid && (STOP_TID_RE.test(rawTid) || STOP_CAMEL_RE.test(rawTid))) return true;
        if (label && STOP_LABEL_RE.test(label)) return true;
        if (qs(b, '.lucide-square, .lucide-circle-stop')) return true;
      }
      return false;
    };

    const pruneRunningCidMap = (now) => {
      for (const [k, ts] of runningCidMap) {
        if (now - ts > SIDEBAR_RUN_HOLD_MS) runningCidMap.delete(k);
      }
      if (runningCidMap.size > 256) {
        let drop = runningCidMap.size - 256;
        for (const k of runningCidMap.keys()) {
          runningCidMap.delete(k);
          if (--drop <= 0) break;
        }
      }
    };

    const scheduleRunningHoldExpiry = (delayMs) => {
      if (isDestroyed() || runHoldTimer) return;
      const wait = M.max(24, M.min(SIDEBAR_RUN_HOLD_MS + 40, M.ceil(delayMs) + 16));
      runHoldTimer = ST(() => {
        runHoldTimer = 0;
        if (isDestroyed()) return;
        const d = docOf();
        if (!d || ga(d.documentElement, 'data-ag-cs-sidebar') === 'off') return;
        const now = nowOf();
        pruneRunningCidMap(now);
        let minRem = Infinity;
        guardMut(() => {
          const rows = qsa(d, '[data-testid="conversation-row-sidebar"]');
          for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            const cid = getSidebarRowCid(r);
            if (isSidebarRowRunning(r)) {
              runningRowMap.set(r, now);
              if (cid) runningCidMap.set(cid, now);
              setAttrSafe(r, 'data-ag-cs-row-running', '1');
              continue;
            }
            const lastAt = M.max(cid ? runningCidMap.get(cid) || 0 : 0, runningRowMap.get(r) || 0);
            const rem = lastAt > 0 ? SIDEBAR_RUN_HOLD_MS - (now - lastAt) : -1;
            if (rem > 0) {
              if (rem < minRem) minRem = rem;
              setAttrSafe(r, 'data-ag-cs-row-running', '1');
            } else {
              if (cid && runningCidMap.get(cid) === lastAt) runningCidMap.delete(cid);
              runningRowMap.delete(r);
              if (ha(r, 'data-ag-cs-row-running')) ra(r, 'data-ag-cs-row-running');
            }
          }
        });
        if (isFin(minRem)) scheduleRunningHoldExpiry(minRem);
      }, wait);
    };

    const resolveSidebarRowRunning = (row, domRunning, now) => {
      const cid = getSidebarRowCid(row);
      if (domRunning) {
        runningRowMap.set(row, now);
        if (cid) runningCidMap.set(cid, now);
        return true;
      }
      const lastAt = M.max(cid ? runningCidMap.get(cid) || 0 : 0, runningRowMap.get(row) || 0);
      if (lastAt > 0) {
        const elapsed = now - lastAt;
        if (elapsed >= 0 && elapsed <= SIDEBAR_RUN_HOLD_MS) {
          scheduleRunningHoldExpiry(SIDEBAR_RUN_HOLD_MS - elapsed);
          return true;
        }
        if (cid && runningCidMap.get(cid) === lastAt) runningCidMap.delete(cid);
        runningRowMap.delete(row);
      }
      return false;
    };

    const lockSidebarRowRunningOnPointerDown = (row) => {
      const d = docOf();
      if (!row || !d || ga(d.documentElement, 'data-ag-cs-sidebar') === 'off') return false;
      const now = nowOf();
      const cid = getSidebarRowCid(row);
      const heldAt = M.max(cid ? runningCidMap.get(cid) || 0 : 0, runningRowMap.get(row) || 0);
      const isRun =
        ha(row, 'data-ag-cs-row-running') ||
        isSidebarRowRunning(row) ||
        (heldAt > 0 && now - heldAt <= SIDEBAR_RUN_HOLD_MS);
      if (!isRun) return false;
      runningRowMap.set(row, now);
      if (cid) runningCidMap.set(cid, now);
      guardMut(() => setAttrSafe(row, 'data-ag-cs-row-running', '1'));
      scheduleRunningHoldExpiry(SIDEBAR_RUN_HOLD_MS);
      return true;
    };

    const stampSidebarRowRunningImmediate = (row) => {
      const d = docOf();
      if (!row || !d || ga(d.documentElement, 'data-ag-cs-sidebar') === 'off') return false;
      const now = nowOf();
      const run = resolveSidebarRowRunning(row, isSidebarRowRunning(row), now);
      if (run) guardMut(() => setAttrSafe(row, 'data-ag-cs-row-running', '1'));
      return run;
    };

    const measureSidebarSelectionSnapshot = () => {
      const rows = qsa(docOf(), '[data-testid="conversation-row-sidebar"]');
      if (!rows.length) return { e: true };
      const now = nowOf();
      pruneRunningCidMap(now);
      let selIdx = -1;
      let selRow = null;
      let selRun = false;
      const states = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const run = resolveSidebarRowRunning(r, isSidebarRowRunning(r), now);
        if (selIdx < 0 && ga(r, 'data-selected') === 'true') {
          selIdx = i;
          selRow = r;
          selRun = run;
        }
        states.push([r, run]);
      }
      if (!selRow) return { e: false, i: -1, cid: '', r: null, rn: false, s: null, l: null, t: 0, st: states };
      const curCid = getSidebarRowCid(selRow);
      if (sbInit && sbRect && (curCid && sbCid ? curCid === sbCid : selIdx === sbIndex)) return { e: false, i: selIdx, cid: curCid, r: selRow, rn: selRun, s: sbRect, st: states };
      const list = peOf(selRow);
      const rr = rectOf(selRow);
      const lr = rectOf(list);
      const stTop = list ? list.scrollTop || 0 : 0;
      const snap = rr
        ? {
            left: rr.left,
            top: rr.top,
            width: rr.width,
            height: rr.height,
            ry: lr ? rr.top - lr.top + stTop : rr.top,
            rx: lr ? rr.left - lr.left : rr.left,
          }
        : null;
      return { e: false, i: selIdx, cid: curCid, r: selRow, rn: selRun, s: snap, l: lr, t: stTop, st: states };
    };

    const syncSidebarSelectionGlide = (snap) => {
      const d = docOf();
      if (!snap || !d) return;
      if (ga(d.documentElement, 'data-ag-cs-sidebar') === 'off') {
        for (const n of qsa(d, '.ag-cs-sidebar-glide-pill')) n.remove();
        if (snap.st) {
          for (const [row] of snap.st) if (ha(row, 'data-ag-cs-row-running')) ra(row, 'data-ag-cs-row-running');
        }
        if (runHoldTimer) {
          CT(runHoldTimer);
          runHoldTimer = 0;
        }
        runningCidMap.clear();
        sbInit = false;
        sbIndex = -1;
        sbCid = '';
        sbRect = null;
        sbRunning = false;
        return;
      }
      if (snap.st) {
        for (const [row, run] of snap.st) {
          if (run) setAttrSafe(row, 'data-ag-cs-row-running', '1');
          else if (ha(row, 'data-ag-cs-row-running')) ra(row, 'data-ag-cs-row-running');
        }
      }
      if (snap.e) {
        sbInit = false;
        sbIndex = -1;
        sbCid = '';
        sbRect = null;
        sbRunning = false;
        return;
      }
      const { i: selIdx, cid: curCid, r: selRow, rn: selRun, s: curSnap, l: listRect, t: scrollTop } = snap;
      if (!selRow) return;
      const targetRun = Boolean(selRun || ha(selRow, 'data-ag-cs-row-running'));
      if (!sbInit) {
        sbInit = true;
        sbIndex = selIdx;
        sbCid = curCid;
        sbRect = curSnap;
        sbRunning = targetRun;
        return;
      }
      // 虚拟滚动增删上下行会让同一会话的 DOM 下标 selIdx 漂移；仅在真实切换会话 ID 时触发滑条与主区转场，消除滚动闪烁
      const sessionChanged = curCid && sbCid ? curCid !== sbCid : selIdx !== sbIndex;
      if (sbIndex >= 0 && selIdx >= 0 && sessionChanged && sbRect && curSnap && !(suppressEntryMotionUntil > nowOf())) {
        const fromRect = listRect
          ? { left: listRect.left + sbRect.rx, top: listRect.top + sbRect.ry - scrollTop, width: sbRect.width, height: sbRect.height }
          : sbRect;
        if (isMotionStandardOrUltra()) {
          for (const n of qsa(d, '.ag-cs-sidebar-glide-pill')) n.remove();
          const pill = d.createElement('div');
          pill.className = 'ag-cs-sidebar-glide-pill';
          sa(pill, 'aria-hidden', 'true');
          sa(pill, 'data-ag-no-i18n', '');
          sa(pill, 'data-ag-owned', '1');
          if (targetRun) sa(pill, 'data-ag-cs-glide-running', '1');
          else if (sbRunning) sa(pill, 'data-ag-cs-glide-from-running', '1');
          for (const [k, v] of [
            ['position', 'fixed'],
            ['z-index', '38'],
            ['pointer-events', 'none'],
            ['left', `${Math.round(curSnap.left)}px`],
            ['top', `${Math.round(curSnap.top)}px`],
            ['width', `${Math.round(curSnap.width)}px`],
            ['height', `${Math.round(curSnap.height)}px`],
          ]) {
            setProp(pill, k, v);
          }
          d.body?.appendChild(pill);
          try {
            motionEngine?.glideIndicator?.(pill, fromRect, curSnap, { durationMs: 240, stiffness: 390, damping: 32, mass: 0.9 });
          } catch {}
          scheduleTransient(() => pill.remove(), 260);
        }
        if (isMotionUltra()) {
          const dir = selIdx < sbIndex ? 'down' : 'up';
          const vps = [];
          for (const vp of qsa(d, '[data-testid="autoscroll-viewport"]')) {
            if (!closestOf(vp, '[data-testid="subagent-tab-conversation"]')) vps.push(vp);
          }
          const matchedVp = curCid
            ? vps.find((vp) => ga(closestOf(vp, '[data-cascade-id]'), 'data-cascade-id') === curCid)
            : null;
          const targets = matchedVp ? [matchedVp] : vps;
          for (const vp of targets) {
            sa(vp, 'data-ag-cs-stage-glide', dir);
            const kids = vp.children ? AF(vp.children) : [];
            const glideKids = kids.slice(M.max(0, kids.length - 3));
            for (const ch of glideKids) sa(ch, 'data-ag-cs-glide-item', dir);
            scheduleTransient(() => {
              if (isConn(vp) && ga(vp, 'data-ag-cs-stage-glide') === dir) ra(vp, 'data-ag-cs-stage-glide');
              for (const ch of glideKids) {
                if (isConn(ch) && ga(ch, 'data-ag-cs-glide-item') === dir) ra(ch, 'data-ag-cs-glide-item');
              }
            }, 220);
          }
        }
      }
      sbIndex = selIdx;
      sbCid = curCid;
      sbRect = curSnap;
      sbRunning = targetRun;
    };

    const applyCaustic = (el) => {
      if (!el || !isMotionUltra()) return;
      sa(el, 'data-ag-cs-caustic', '1');
      scheduleTransient(() => {
        if (isConn(el)) ra(el, 'data-ag-cs-caustic');
      }, 920);
    };

    const measureVisibleChangedHeaders = () => {
      const out = [];
      const vh = typeof window !== 'undefined' && window.innerHeight > 0 ? window.innerHeight : 1080;
      for (const hdr of qsa(docOf(), '[data-testid="changed-files-card-header"]')) {
        if (seenHeaders.has(hdr)) continue;
        const r = rectOf(hdr);
        if (!r || r.height <= 0 || (r.bottom > 0 && r.top < vh)) out.push(hdr);
      }
      return out;
    };

    const syncHeaderOpenStates = (scope = null) => {
      const root = scope || docOf();
      if (!root) return;
      for (const hdr of qsa(root, '[data-testid="changed-files-card-header"]')) {
        const next = hdr.nextElementSibling;
        if (next && tagOf(next) === 'DIV') setAttrIfChanged(hdr, 'data-ag-cs-hdr-open', '1');
        else if (ha(hdr, 'data-ag-cs-hdr-open')) ra(hdr, 'data-ag-cs-hdr-open');
      }
    };

    const syncHeroCCaustics = (measuredHeaders) => {
      const d = docOf();
      const now = nowOf();
      syncHeaderOpenStates(d);
      let sawNew = false;
      for (const hdr of measuredHeaders || measureVisibleChangedHeaders()) {
        if (seenHeaders.has(hdr)) continue;
        seenHeaders.add(hdr);
        sawNew = true;
        if (isMotionUltra()) applyCaustic(hdr);
      }
      if (sawNew) notifyMascot('files-changed');

      const PANE_RUN_SEL = '[data-testid="input-cancel-button"],[data-testid="stop-button"],[data-testid="cancel-button"],[data-testid="agent-loading"],[data-testid="thinking-collapsible-trigger"][data-op-thought-state="streaming"]';
      const views = findFormalConvViews();
      let paneCausticHit = false;
      if (views.length > 1) {
        for (let i = 0; i < views.length; i++) {
          const cv = views[i];
          const runPane = Boolean(qs(cv, PANE_RUN_SEL));
          const ps = paneRunState.get(cv);
          if (!ps) {
            paneRunState.set(cv, { wasRunning: runPane, startAt: runPane ? now : 0 });
          } else if (runPane && !ps.wasRunning) {
            ps.wasRunning = true;
            ps.startAt = now;
          } else if (!runPane && ps.wasRunning) {
            ps.wasRunning = false;
            const dur = ps.startAt > 0 ? now - ps.startAt : 0;
            ps.startAt = 0;
            if (dur >= 6000 && isMotionUltra()) {
              const card = qs(cv, '[data-testid="agent-input-box"] .surface-composer-card');
              if (card && !closestOf(card, '[data-testid="subagent-tab-conversation"]')) {
                applyCaustic(card);
                paneCausticHit = true;
              }
            }
          }
        }
      }

      const runningNow = isConvRunning();
      if (!runInit) {
        runInit = true;
        wasRunning = runningNow;
        runStartAt = runningNow ? now : 0;
      } else if (runningNow && !wasRunning) {
        wasRunning = true;
        runStartAt = now;
      } else if (!runningNow && wasRunning) {
        wasRunning = false;
        const elapsed = runStartAt > 0 ? now - runStartAt : 0;
        runStartAt = 0;
        const auraPhase = convAuraCtl?.getInstance?.()?.phase || '';
        const errDom = qs(
          d,
          '[data-testid="conversation-view"] [data-testid="agent-error-banner"], [data-testid="conversation-view"] [data-testid="error-message"]'
        );
        if (auraPhase === 'error-halted' || !!(errDom)) {
          convAuraCtl?.triggerErrorHalted?.(now);
          notifyMascot('streamDone', { error: true, durationMs: elapsed });
        } else {
          if (!paneCausticHit && elapsed >= 6000 && isMotionUltra()) {
            for (const c of qsa(d, '[data-testid="agent-input-box"] .surface-composer-card')) {
              if (!closestOf(c, '[data-testid="subagent-tab-conversation"]')) applyCaustic(c);
            }
          }
          if (elapsed >= 15000) {
            convAuraCtl?.triggerLongTaskComplete?.(now);
            notifyMascot('aura-complete', { durationMs: elapsed });
          } else {
            notifyMascot('complete', { durationMs: elapsed });
          }
          const warnBar = qs(d, '[data-ag-prism-pulse-bar][data-pv-warn="1"], #ag-prism-pulse-bar[data-pv-warn="1"]');
          if (warnBar && now - lastVialHighNotifyAt >= 600000) {
            lastVialHighNotifyAt = now;
            notifyMascot('vial-high', { fraction: 0.8 });
          }
        }
      }
    };

    const triggerHeroDFiberPulse = (card, modelBtn, brand) => {
      if (!card || !isMotionUltra()) return;
      const camp = brand === 'antigravity' || brand === 'claude' || brand === 'openai' ? brand : 'gemini';
      if (fiberTimer) {
        CT(fiberTimer);
        transientTimers.delete(fiberTimer);
        fiberTimer = 0;
      }
      sa(card, 'data-ag-cs-fiber-camp', camp);
      fiberTimer = scheduleTransient(() => {
        fiberTimer = 0;
        if (isConn(card)) ra(card, 'data-ag-cs-fiber-camp');
      }, 480);
      const glyph = qs(modelBtn, '.ag-cs-model-glyph');
      if (glyph && typeof motionEngine?.spring === 'function') {
        try {
          motionEngine.spring(
            glyph,
            [
              { transform: 'scale(0.84) rotate(-8deg)' },
              { transform: 'scale(1.12) rotate(3deg)' },
              { transform: 'scale(1) rotate(0deg)' },
            ],
            { stiffness: 420, damping: 22, slot: 'fiber-focus' }
          );
        } catch {}
      }
    };

    const triggerHeroESonar = (navTurn) => {
      if (!navTurn || !isMotionUltra()) return;
      const conv = closestOf(navTurn, '[data-testid="conversation-view"]') || findFormalConvView();
      if (!conv) return;
      let turns = qsa(conv, '[data-testid="user-input-step"]');
      if (!turns.length) turns = qsa(conv, '[data-testid="conversation-turn"]');
      if (!turns.length) turns = qsa(conv, '[data-testid="user-message-bubble"]');
      if (!turns.length) return;

      let idx = -1;
      const rawAttr = ga(navTurn, 'data-turn-index') ?? ga(navTurn, 'data-index');
      if (rawAttr != null && /^\d+$/.test(String(rawAttr).trim())) {
        idx = parseInt(String(rawAttr).trim(), 10);
      } else if (ga(navTurn, 'data-testid') === 'conversation-navigator-group') {
        idx = 0;
      } else {
        const navRoot = closestOf(navTurn, '[data-testid="conversation-navigator"]') || peOf(navTurn);
        if (navRoot) {
          const sibs = AF(qsa(navRoot, '[data-testid="conversation-navigator-turn"]'));
          const relIdx = sibs.indexOf(navTurn);
          if (relIdx >= 0) idx = M.min(turns.length - 1, M.max(0, turns.length - sibs.length) + relIdx);
        }
      }
      const target = idx >= 0 && idx < turns.length ? turns[idx] : null;
      if (!target) return;
      sa(target, 'data-ag-cs-sonar', '1');
      scheduleTransient(() => {
        if (isConn(target)) ra(target, 'data-ag-cs-sonar');
      }, 720);
    };

    const syncHeroRouteChoreography = (measured) => {
      const d = docOf();
      const inHome = measured ? measured.inHome : Boolean(qs(d, '.agy-home'));
      const formalConv = measured ? measured.formalConv : !inHome ? findFormalConvView() : null;
      const inFormalConv = !!(formalConv);

      if (inHome) {
        const sheet = closestOf(qs(d, '.agy-home'), '.agy-sheet');
        if (sheet) setAttrIfChanged(sheet, 'data-ag-cs-home-sheet', '1');
      }
      const formalViews = !inHome ? findFormalConvViews() : [];
      for (let i = 0; i < formalViews.length; i++) {
        const cv = formalViews[i];
        const seat = peOf(cv);
        if (seat && tagOf(seat) === 'DIV') setAttrIfChanged(seat, 'data-ag-cs-conv-seat', '1');
        const vp = qs(cv, '[data-testid="autoscroll-viewport"]');
        const vpP = peOf(vp);
        if (vpP && vpP !== cv) setAttrIfChanged(vpP, 'data-ag-cs-vp-wrap', '1');
      }
      if (inHome && !measured?.homeComposerSampled) sampleHomeComposerRect();

      if (!heroState.routeInitialized) {
        heroState.routeInitialized = true;
        heroState.wasInHome = inHome;
        heroState.wasInFormalConv = inFormalConv;
      } else {
        if (!(suppressEntryMotionUntil > nowOf())) {
          if (heroState.wasInHome && !inHome && inFormalConv) triggerHeroALiftoff(formalConv, measured?.convInputRect || null);
          else if (heroState.wasInFormalConv && !heroState.wasInHome && inHome) triggerHeroBHomeReturn();
        } else {
          liftoffBubbleUntil = 0;
        }
        heroState.wasInHome = inHome;
        heroState.wasInFormalConv = inFormalConv;
      }

      if (liftoffBubbleUntil > 0 && formalConv) {
        if (nowOf() <= liftoffBubbleUntil) {
          if (markLiftoffBubble(formalConv)) liftoffBubbleUntil = 0;
        } else liftoffBubbleUntil = 0;
      }
      if (measured?.sidebarSnap) syncSidebarSelectionGlide(measured.sidebarSnap);
      if (!measured || measured.checkCaustics !== false) syncHeroCCaustics(measured?.visibleChangedHeaders);
    };

    const isBlockCode = (el, stopAt) => {
      if (!isEl(el)) return false;
      const t = tagOf(el);
      if (t === 'PRE' || clHas(el, 'code-block') || clHas(el, 'code-line')) return true;
      if (t === 'CODE') {
        let p = peOf(el);
        while (p && p !== stopAt) {
          if (tagOf(p) === 'PRE' || clHas(p, 'code-block')) return true;
          p = peOf(p);
        }
      }
      return false;
    };

    const insideCodeOrTable = (node, stopAt) => {
      let cur = isEl(node) ? node : peOf(node);
      while (cur && cur !== stopAt) {
        if (TABLE_TAGS.has(tagOf(cur)) || isBlockCode(cur, stopAt)) return cur;
        cur = peOf(cur);
      }
      return null;
    };

    const findRowAnc = (node, stopAt) => {
      let cur = isEl(node) ? node : peOf(node);
      while (cur && cur !== stopAt) {
        if (tagOf(cur) === 'TR') return cur;
        cur = peOf(cur);
      }
      return null;
    };

    const flushAllStreamArtifacts = (immediate = true) => {
      scannedNodes = new WeakSet();
      seenBlocks = new WeakSet();
      const force = immediate || !canStreamMotion() || isDestroyed();
      if (force) {
        clearHighlightFade();
        if (sweepTimer) {
          CT(sweepTimer);
          sweepTimer = 0;
        }
      }
      runGuardedMut(() => {
        const d = docOf();
        if (force) {
          for (const [el, map] of expirableClasses.entries()) {
            for (const cls of map.keys()) clRm(el, cls);
          }
          expirableClasses.clear();
          if (d) {
            for (const cls of ['ag-cs-stream-chunk', 'ag-cs-thought-chunk', 'ag-cs-code-scan']) {
              for (const el of qsa(d, '.' + cls)) clRm(el, cls);
            }
          }
        }
        if (!d) return;
        for (const el of qsa(d, '[data-ag-cs-thought-streaming]')) ra(el, 'data-ag-cs-thought-streaming');
        if (!isMotionUltra()) {
          for (const el of qsa(d, '.ag-cs-liftoff-veil')) el.remove();
          for (const attr of [
            'data-ag-cs-liftoff-bubble',
            'data-ag-cs-caustic',
            'data-ag-cs-fiber-camp',
            'data-ag-cs-stage-glide',
            'data-ag-cs-glide-item',
            'data-ag-cs-sonar',
          ]) {
            for (const el of qsa(d, `[${attr}]`)) ra(el, attr);
          }
        }
        if (!isMotionStandardOrUltra()) {
          for (const el of qsa(d, '.ag-cs-sidebar-glide-pill')) el.remove();
        }
      });
    };

    const PROSE_SEL = '[data-testid="planner-response-text"],[data-testid="agent-response"] [data-markdown-root]';

    const findStreamingThoughtBody = (node) => {
      const body = docOf()?.body;
      let cur = isEl(node) ? node : peOf(node);
      while (cur && cur !== body) {
        if (ga(cur, 'data-ag-cs-thought-streaming') === '1') return cur;
        const tid = ga(cur, 'data-testid');
        if (
          tid === 'planner-response-text' ||
          tid === 'agent-response' ||
          tid === 'background-task-command' ||
          tid === 'tool-group-collapsible' ||
          tid === 'conversation-view' ||
          tid === 'autoscroll-viewport'
        ) {
          return null;
        }
        const prev = cur.previousElementSibling;
        if (prev && ga(prev, 'data-testid') === 'thinking-collapsible-trigger' && ga(prev, 'aria-expanded') === 'true') return cur;
        cur = peOf(cur);
      }
      return null;
    };

    const markStreamClass = (el, cls, dur = 300) => {
      if (!el?.[K_CL] || clHas(el, cls)) return false;
      runGuardedMut(() => el[K_CL].add(cls));
      let map = expirableClasses.get(el);
      if (!map) {
        map = new Map();
        expirableClasses.set(el, map);
      }
      map.set(cls, Date.now() + dur);
      if (!sweepTimer) sweepTimer = ST(flushExpiredClasses, dur);
      return true;
    };

    const fadeLeafTexts = (node, now, max = 4) => {
      if (!node || isThoughtIsolatedNode(node)) return;
      let c = 0;
      const walk = (cur) => {
        if (!cur || c >= max || isThoughtIsolatedNode(cur)) return;
        if (cur.nodeType === 3) {
          const s = cur.data ?? cur.nodeValue ?? '';
          textLenMap.set(cur, s.length);
          if (s.length > 0) {
            enqueueFadeRange(cur, 0, s.length, now);
            c++;
          }
          return;
        }
        if (!isEl(cur) || !cur.childNodes) return;
        for (let i = 0; i < cur.childNodes.length && c < max; i++) walk(cur.childNodes[i]);
      };
      walk(node);
    };

    const onStreamMutations = (mutations) => {
      if (isDestroyed() || streamMutating || !canStreamMotion()) return;
      const now = nowOf();
      let newBlocks = 0;

      for (const m of mutations) {
        if (!m || isThoughtMutationRecord(m)) continue;
        const target = m.target;
        if (!target || isThoughtIsolatedNode(target)) continue;
        const baseEl = isEl(target) ? target : peOf(target);
        if (
          !baseEl ||
          closestOf(
            baseEl,
            '.ag-prism-thought-overlay, .ag-cs-smooth-caret, .ag-cs-crab, .ag-cs-conv-aura-host, [data-testid="agent-input-box"], script, style'
          )
        ) {
          continue;
        }

        if (m.type === 'characterData') {
          if (target.nodeType !== 3) continue;
          const nLen = (target.data ?? target.nodeValue ?? '').length;
          const pLen = textLenMap.get(target);
          textLenMap.set(target, nLen);
          if (pLen !== undefined ? nLen <= pLen : nLen <= 0 || nLen > 28) continue;
          const tb = findStreamingThoughtBody(baseEl);
          if (tb) {
            if (isManagedThoughtPanel(tb)) continue;
          } else if (!closestOf(baseEl, PROSE_SEL)) continue;
          if (pLen !== undefined) enqueueFadeRange(target, pLen, nLen, now);
          else enqueueFadeRange(target, 0, nLen, now);
          continue;
        }

        if (m.type !== 'childList' || !m.addedNodes?.length) continue;

        const inAnimBlock = Boolean(closestOf(baseEl, '.ag-cs-stream-chunk, .ag-cs-thought-chunk'));
        const thoughtBody = findStreamingThoughtBody(target);
        if (thoughtBody) {
          if (isManagedThoughtPanel(thoughtBody)) continue;
          for (const added of m.addedNodes) {
            if (isThoughtIsolatedNode(added)) continue;
            if (added.nodeType === 3) {
              fadeLeafTexts(added, now, 1);
            } else if (isEl(added)) {
              if (inAnimBlock || INLINE_TAGS.has(tagOf(added))) fadeLeafTexts(added, now, 4);
              else if (!seenBlocks.has(added) && newBlocks < 4) {
                seenBlocks.add(added);
                newBlocks++;
                snapTextLens(added, 12);
                markStreamClass(added, 'ag-cs-thought-chunk', 290);
              }
            }
          };
          continue;
        }

        const proseRoot = closestOf(baseEl, PROSE_SEL);
        if (!proseRoot) continue;

        const codeCtx = insideCodeOrTable(target, proseRoot);
        if (codeCtx) {
          if (TABLE_TAGS.has(tagOf(codeCtx))) {
            for (const added of m.addedNodes) {
              if (added.nodeType === 3) {
                fadeLeafTexts(added, now, 1);
                continue;
              }
              if (!isEl(added)) continue;
              const tr = tagOf(added) === 'TR' ? added : findRowAnc(added, proseRoot) || findRowAnc(codeCtx, proseRoot);
              if (tr && !scannedNodes.has(tr) && now - lastCodeAt >= STREAM_BATCH_MS) {
                scannedNodes.add(tr);
                lastCodeAt = now;
                snapTextLens(tr, 12);
                markStreamClass(tr, 'ag-cs-code-scan', 240);
              } else fadeLeafTexts(added, now, 3);
            }
            continue;
          }

          for (const added of m.addedNodes) {
            if (added.nodeType === 3) {
              fadeLeafTexts(added, now, 1);
              continue;
            }
            if (!isEl(added)) continue;
            if (tagOf(added) === 'PRE' || clHas(added, 'code-block')) {
              if (!scannedNodes.has(added)) {
                scannedNodes.add(added);
                lastCodeAt = now;
                snapTextLens(added, 16);
                markStreamClass(added, 'ag-cs-code-scan', 240);
              }
              continue;
            }
            const lineEl = clHas(added, 'code-line') ? added : closestOf(added, '.code-line') || added;
            if (
              lineEl &&
              lineEl !== proseRoot &&
              tagOf(lineEl) !== 'PRE' &&
              !clHas(lineEl, 'code-block') &&
              !scannedNodes.has(lineEl) &&
              now - lastCodeAt >= STREAM_BATCH_MS
            ) {
              scannedNodes.add(lineEl);
              lastCodeAt = now;
              snapTextLens(lineEl, 8);
              markStreamClass(lineEl, 'ag-cs-code-scan', 240);
            } else fadeLeafTexts(added, now, 3);
          }
          continue;
        }

        for (const added of m.addedNodes) {
          if (added.nodeType === 3) {
            fadeLeafTexts(added, now, 1);
            continue;
          }
          if (!isEl(added)) continue;
          const tag = tagOf(added);
          const isCodeOrTbl =
            tag === 'PRE' ||
            tag === 'TABLE' ||
            clHas(added, 'code-block') ||
            clHas(added, 'md-table-host') ||
            clHas(added, 'md-table-frame') ||
            Boolean(qs(added, 'pre, table, .code-block, .md-table-frame'));
          if (isCodeOrTbl) {
            if (!scannedNodes.has(added) && now - lastCodeAt >= STREAM_BATCH_MS) {
              scannedNodes.add(added);
              lastCodeAt = now;
              snapTextLens(added, 16);
              markStreamClass(added, 'ag-cs-code-scan', 240);
            }
          } else if (inAnimBlock || (INLINE_TAGS.has(tag) && baseEl !== proseRoot)) {
            fadeLeafTexts(added, now, 4);
          } else if (!seenBlocks.has(added) && newBlocks < 4) {
            seenBlocks.add(added);
            newBlocks++;
            snapTextLens(added, 12);
            markStreamClass(added, 'ag-cs-stream-chunk', 310);
          } else {
            fadeLeafTexts(added, now, 4);
          }
        }
      }
    };

    const syncDualStreamEngine = () => {
      const active = canStreamMotion() && isConvRunning();
      const views = active ? findFormalConvViews() : [];
      if (!active || views.length === 0) {
        if (streamObs) {
          try {
            streamObs.disconnect();
          } catch {}
          streamRoots.clear();
        }
        flushAllStreamArtifacts(!canStreamMotion());
        return;
      }

      const trigByView = [];
      for (let v = 0; v < views.length; v++) {
        const conv = views[v];
        const triggers = qsa(conv, '[data-testid="thinking-collapsible-trigger"]');
        trigByView.push([conv, triggers]);
        for (let i = 0; i < triggers.length; i++) {
          const trig = triggers[i];
          const bodyDiv = trig.nextElementSibling;
          if (!bodyDiv || tagOf(bodyDiv) !== 'DIV') continue;
          const streaming =
            ga(trig, 'aria-expanded') === 'true' &&
            isStreamingThoughtTrigger(trig, i === triggers.length - 1);
          if (streaming) setAttrIfChanged(bodyDiv, 'data-ag-cs-thought-streaming', '1');
          else if (ha(bodyDiv, 'data-ag-cs-thought-streaming')) ra(bodyDiv, 'data-ag-cs-thought-streaming');
        }
      }

      if (!streamObs && typeof MutationObserver === 'function') streamObs = new MutationObserver(onStreamMutations);
      if (streamObs) {
        let changed = streamRoots.size !== views.length;
        if (!changed) {
          for (let v = 0; v < views.length; v++) {
            if (!streamRoots.has(views[v])) { changed = true; break; }
          }
        }
        if (changed) {
          try {
            streamObs.disconnect();
            streamRoots.clear();
            for (let v = 0; v < trigByView.length; v++) {
              const [conv, triggers] = trigByView[v];
              const resps = qsa(conv, PROSE_SEL);
              if (resps.length > 0) snapTextLens(resps[resps.length - 1], 24);
              if (triggers.length > 0) {
                const lb = triggers[triggers.length - 1]?.nextElementSibling;
                if (lb && !isManagedThoughtPanel(lb)) snapTextLens(lb, 16);
              }
              streamObs.observe(conv, { childList: true, characterData: true, subtree: true });
              streamRoots.add(conv);
            }
          } catch {}
        }
      }
    };

    const isFreshTriggerOrigin = (trig) => {
      if (!trig || !isFin(trig.at)) return false;
      const age = nowOf() - trig.at;
      return age >= 0 && age <= 900;
    };

    const resolveTriggerOriginCoords = (trig) => {
      if (!isFreshTriggerOrigin(trig)) return null;
      if (trig.el && !trig._measured) {
        trig._measured = true;
        if (trig.el.isConnected !== false) {
          const r = rectOf(trig.el);
          if (r && r.width > 0 && r.height > 0) {
            trig.x = r.left + r.width / 2;
            trig.y = r.top + r.height / 2;
          }
        }
        trig.el = null;
      }
      return isFin(trig.x) && isFin(trig.y) ? trig : null;
    };

    const measureNewLensOverlays = () => {
      const d = docOf();
      if (!isMotionStandardOrUltra() || !d) return [];
      const cands = new Set([
        ...qsa(d, '.agy-overlay, .agy-fastpick, [data-testid="context-menu-popup"], [data-testid="context-menu-submenu-popup"]'),
      ]);
      for (const el of qsa(d, '[data-testid="overview-panel"]')) {
        const p = peOf(el);
        if (p && tagOf(p) === 'DIV') cands.add(p);
      }
      const freshNew = [];
      for (const ov of cands) {
        if (!ha(ov, 'data-hover-card-popup') && !seenOverlays.has(ov)) freshNew.push(ov);
      }
      if (freshNew.length === 0) return [];
      // 仅在真有新浮层弹出时才懒测距点击源，消除普通正文点击时的同步回流
      const trig = resolveTriggerOriginCoords(heroState.lastTriggerOrigin);
      const out = [];
      for (const ov of freshNew) {
        out.push({ ov, rect: trig ? rectOf(ov) : null });
      }
      return out;
    };

    const syncLensOverlayOrigins = (measuredOverlays) => {
      const d = docOf();
      if (!d) return;
      for (const el of qsa(d, '[data-testid="overview-panel"]')) {
        const p = peOf(el);
        if (p && tagOf(p) === 'DIV') {
          setAttrIfChanged(p, 'data-ag-cs-overview-shell', '1');
          setAttrIfChanged(p, 'data-ag-cs-prism-box', '1');
          setAttrIfChanged(p, 'data-ag-cs-prism-mirror', '1');
        }
      }
      if (!isMotionStandardOrUltra()) return;
      const list = measuredOverlays || measureNewLensOverlays();
      if (!list.length) return;
      const trig = resolveTriggerOriginCoords(heroState.lastTriggerOrigin);
      for (const { ov, rect: r } of list) {
        if (seenOverlays.has(ov)) continue;
        if (trig && r && (r.width <= 0 || r.height <= 0)) continue;
        seenOverlays.add(ov);
        if (trig && r && r.width > 0 && r.height > 0) {
          setProp(ov, '--ag-origin-x', `${Math.round(Math.max(-40, Math.min(r.width + 40, trig.x - r.left)))}px`);
          setProp(ov, '--ag-origin-y', `${Math.round(Math.max(-40, Math.min(r.height + 40, trig.y - r.top)))}px`);
        }
        let idx = 0;
        for (const item of qsa(ov, '[role="option"], [role="menuitem"], [data-testid]')) {
          const role = ga(item, 'role');
          const tid = ga(item, 'data-testid') || '';
          if (
            role === 'option' ||
            role === 'menuitem' ||
            tid.startsWith('overview-panel-row-') ||
            tid === 'subagent-node' ||
            tid === 'artifact-row'
          ) {
            setProp(item, '--ag-row-i', String(idx++));
            setAttrIfChanged(item, 'data-ag-row-stagger', '1');
            if (idx >= 12) break;
          }
        }
      }
    };

    const scheduleDeferredConvEntry = (fn, delayMs = 65, frame2Fn = null) => {
      const seq = ++convEntrySeq;
      if (convEntryTimer) CT(convEntryTimer);
      if (convEntryRaf) {
        cAF(convEntryRaf);
        convEntryRaf = 0;
      }
      convEntryTimer = ST(() => {
        convEntryTimer = 0;
        if (isDestroyed() || seq !== convEntrySeq) return;
        const cont = fn();
        if (cont !== false && seq === convEntrySeq && typeof frame2Fn === 'function') {
          convEntryRaf = rAF(() => {
            convEntryRaf = 0;
            if (!isDestroyed() && seq === convEntrySeq) frame2Fn();
          });
        }
      }, delayMs);
    };

    const disconnectStreamObserver = () => {
      if (streamObs) {
        try {
          streamObs.disconnect();
        } catch {}
        streamObs = null;
        streamRoots.clear();
      }
      flushAllStreamArtifacts(true);
    };

    return {
      heroState,
      scheduleTransient,
      clearTransientTimers,
      cancelDeferredHydration,
      enqueueDeferredIcons,
      syncThinkingSparks,
      clearWorkedForAutoUnfoldAttrs,
      syncWorkedForAutoUnfold,
      scheduleWorkedForClickSync,
      findFormalConvView,
      findFormalConvViews,
      sampleHomeComposerRect,
      triggerHomeLiftoffRippleBurst,
      triggerHeroDFiberPulse,
      triggerHeroESonar,
      isSidebarRowRunning,
      lockSidebarRowRunningOnPointerDown,
      stampSidebarRowRunningImmediate,
      measureSidebarSelectionSnapshot,
      syncSidebarSelectionGlide,
      measureVisibleChangedHeaders,
      syncHeaderOpenStates,
      syncHeroCCaustics,
      syncHeroRouteChoreography,
      flushAllStreamArtifacts,
      onStreamMutations,
      syncDualStreamEngine,
      disconnectStreamObserver,
      measureNewLensOverlays,
      syncLensOverlayOrigins,
      scheduleDeferredConvEntry,
      suppressEntryMotion(ms) {
        suppressEntryMotionUntil = M.max(suppressEntryMotionUntil, nowOf() + M.max(120, Number(ms) || 900));
        liftoffBubbleUntil = 0;
        const d = docOf();
        if (d) for (const n of qsa(d, '.ag-cs-liftoff-veil,.ag-cs-sidebar-glide-pill')) n.remove();
      },
      isEntryMotionSuppressed: () => suppressEntryMotionUntil > nowOf(),
      isStreamMutating: () => streamMutating,
      hasStreamObserver: () => !!(streamObs && streamRoots.size > 0),
      stepHighlightFade,
      clearHighlightFade,
      getHighlightFadeState: () => ({
        activeCount: fadeItems.length,
        rafActive: !!(fadeRaf || fadeTimer),
        buckets: hlBuckets ? hlBuckets.map((h) => h.size ?? 0) : [],
      }),
    };
  };

  const api = { STREAM_BATCH_MS, STREAM_FADE_MS, SIDEBAR_RUN_HOLD_MS, HIGHLIGHT_NAMES, createStreamChoreographyController };
  if (typeof module === 'object' && module.exports) module.exports = api;
  G.__agPrismStreamChoreography = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);

// Obsidian Prism — Multi-State Semantic Conversation Horizon Aura Controller (.ag-cs-conv-aura-host)
// Split-Rate 300Hz VSync (~30fps cap in running, 1200ms idle settle -> 0fps) + Ambient Intensity + 3-State 0fps Semantic Afterglow.

(function (root) {
  'use strict';
  const M = Math;
  const G = root || (typeof globalThis !== 'undefined' ? globalThis : window);
  if (!G) return;

  const CONV_AURA_HEIGHT_RATIO = 0.32;
  const CONV_AURA_START_MS = 1150;
  const CONV_AURA_COMPLETE_MS = 1400;
  const CONV_AURA_IDLE_SLEEP_MS = 1200;
  const CONV_AURA_DECISION_BREATH_MS = 1600;
  const CONV_AURA_DECISION_CLEAR_MS = 400;
  const CONV_AURA_ERROR_MS = 900;
  const CONV_AURA_LONG_TASK_THRESHOLD_MS = 15000;
  const CONV_AURA_LONG_COMPLETE_MS = 1200;
  const CONV_AURA_FOCUS_FADE_MS = 600;

  function scaleConvReach(fullViewportReach) {
    return M.max(0.08, M.min(0.98, +(fullViewportReach / CONV_AURA_HEIGHT_RATIO).toFixed(4)));
  }

  function clamp01(v, fallback = 1) {
    const n = Number(v);
    return Number.isFinite(n) ? M.max(0, M.min(1, n)) : fallback;
  }

  function isVisibleAuraNode(el, skipSyncVis = false) {
    if (!el || el.hidden === true || el.isConnected === false) return false;
    const st = el.style;
    if (st && (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0')) return false;
    if (typeof el.closest === 'function' && el.closest('[hidden], .hidden')) return false;
    if (!skipSyncVis && typeof el.checkVisibility === 'function' && !el.checkVisibility()) return false;
    return true;
  }

  let cachedRunningVal = false;
  let cachedRunningAt = -1;
  let cachedRunningEl = null;
  let cachedRunningScope = null;
  let cachedDecisionVal = false;
  let cachedDecisionAt = -1;
  let cachedDecisionEl = null;
  let cachedDecisionScope = null;
  let cachedErrorAt = -1;
  let lastFullVisAt = -1;
  const seenErrorNodes = typeof WeakSet === 'function' ? new WeakSet() : null;

  function readNowMs() {
    return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  }

  const RUNNING_SEL =
    '[data-testid="input-cancel-button"], [data-testid="stop-button"], [data-testid="cancel-button"], [data-testid="agent-loading"], [data-testid="thinking-collapsible-trigger"][data-op-thought-state="streaming"]';
  const DECISION_SEL = '[data-testid="interaction-takeover-card"], [data-testid="side-question-panel"]';
  const SUBAGENT_SEL = '[data-testid="subagent-tab-conversation"]';

  function isWithinScope(el, scope) {
    if (!el) return false;
    if (!scope || scope === document) return true;
    if (el === scope) return true;
    if (typeof scope.contains === 'function' && scope.contains(el)) return true;
    const ownerView = el.closest?.('[data-testid="conversation-view"]') || null;
    if (ownerView) return ownerView === scope;
    const allViews =
      typeof document !== 'undefined' && typeof document.querySelectorAll === 'function'
        ? document.querySelectorAll('[data-testid="conversation-view"]')
        : null;
    return !allViews || allViews.length <= 1;
  }

  function isLiveMatchedIndicator(el, sel, skipSyncVis = false, scope = null) {
    return !!(
      el &&
        el.isConnected === true &&
        typeof el.nodeType === 'number' &&
        typeof el.matches === 'function' &&
        el.matches(sel) &&
        !el.closest?.(SUBAGENT_SEL) &&
        isWithinScope(el, scope) &&
        isVisibleAuraNode(el, skipSyncVis)
    );
  }

  function queryScopedIndicator(scope, sel, skipSyncVis) {
    const nodes = scope.querySelectorAll(sel);
    for (const n of nodes) {
      if (n.closest?.(SUBAGENT_SEL)) continue;
      if (isVisibleAuraNode(n, skipSyncVis)) return n;
    }
    if (scope !== document && typeof document.querySelectorAll === 'function') {
      const allViews = document.querySelectorAll('[data-testid="conversation-view"]');
      const singlePane = !allViews || allViews.length <= 1;
      const docNodes = document.querySelectorAll(sel);
      for (const n of docNodes) {
        if (n.closest?.(SUBAGENT_SEL)) continue;
        const ownerView = n.closest?.('[data-testid="conversation-view"]') || null;
        if (ownerView && ownerView !== scope) continue;
        if (!ownerView && !singlePane) continue;
        if (isVisibleAuraNode(n, skipSyncVis)) return n;
      }
    }
    return null;
  }

  function isConvRunning(skipSyncVis = false, scopeEl = null) {
    if (typeof document === 'undefined') return false;
    const scope = scopeEl && typeof scopeEl.querySelectorAll === 'function' ? scopeEl : document;
    const now = readNowMs();
    if (cachedRunningScope === scope && cachedRunningAt >= 0 && M.abs(now - cachedRunningAt) < 200) {
      return cachedRunningVal;
    }
    if (cachedRunningScope === scope && isLiveMatchedIndicator(cachedRunningEl, RUNNING_SEL, skipSyncVis, scope)) {
      cachedRunningVal = true;
      cachedRunningAt = now;
      if (!skipSyncVis) lastFullVisAt = now;
      return true;
    }
    cachedRunningEl = queryScopedIndicator(scope, RUNNING_SEL, skipSyncVis);
    const running = !!(cachedRunningEl);
    cachedRunningScope = scope;
    cachedRunningVal = running;
    cachedRunningAt = now;
    if (!skipSyncVis) lastFullVisAt = now;
    return running;
  }

  function isAwaitingDecision(skipSyncVis = false, scopeEl = null) {
    if (typeof document === 'undefined') return false;
    const scope = scopeEl && typeof scopeEl.querySelectorAll === 'function' ? scopeEl : document;
    const now = readNowMs();
    if (cachedDecisionScope === scope && cachedDecisionAt >= 0 && M.abs(now - cachedDecisionAt) < 200) {
      return cachedDecisionVal;
    }
    if (cachedDecisionScope === scope && isLiveMatchedIndicator(cachedDecisionEl, DECISION_SEL, skipSyncVis, scope)) {
      cachedDecisionVal = true;
      cachedDecisionAt = now;
      return true;
    }
    cachedDecisionEl = queryScopedIndicator(scope, DECISION_SEL, skipSyncVis);
    const awaiting = !!(cachedDecisionEl);
    cachedDecisionScope = scope;
    cachedDecisionVal = awaiting;
    cachedDecisionAt = now;
    return awaiting;
  }

  function consumeFreshDomError(convView) {
    if (!seenErrorNodes || typeof document === 'undefined') return false;
    const now = readNowMs();
    if (cachedErrorAt >= 0 && M.abs(now - cachedErrorAt) < 240) return false;
    cachedErrorAt = now;
    const scope = convView || document;
    if (typeof scope.querySelectorAll !== 'function') return false;
    const errs = scope.querySelectorAll(
      '.ag-cs-thinking-spark[data-state="error"], [data-testid="agent-error"], [role="alert"][data-error="true"]'
    );
    let hitFresh = false;
    for (const n of errs) {
      if (n.closest?.('[data-testid="subagent-tab-conversation"]')) continue;
      if (!seenErrorNodes.has(n) && isVisibleAuraNode(n)) {
        seenErrorNodes.add(n);
        hitFresh = true;
      }
    }
    return hitFresh;
  }

  const OPTICS_BUF = { strength: 0, reach: 0.5, prism: 0, surge: 0, speed: 0, semantic: 'none', frameMs: 110 };
  const DRAW_EXTRA_BUF = { reach: 0.5, prism: 0, surge: 0, speed: 0, semantic: 'none', ambientIntensity: 1, still: false, spectrum: undefined };

  function fillOptics(out, strength, reach, prism, surge, speed, semantic, frameMs) {
    out.strength = strength;
    out.reach = reach;
    out.prism = prism;
    out.surge = surge;
    out.speed = speed;
    out.semantic = semantic;
    out.frameMs = frameMs;
    return out;
  }

  const gDa = (d, a) => (d ? (a === 'vivid' ? [0.62, 0.76, 0.88, 0.68, 0.9, 0.24, 0.28] : a === 'balanced' ? [0.46, 0.6, 0.74, 0.5, 0.8, 0.2, 0.25] : 0) : 0);

  function computeConvAuraOptics(phase, phaseAt, now, dark, wasRunning, out = {}, da = 'subtle') {
    const dt = gDa(dark, da);
    const idleStr = dt ? dt[0] : dark ? 0.21 : 0.52;
    const runBase = dt ? dt[1] : dark ? 0.31 : 0.64;
    const peakStr = dt ? dt[2] : dark ? 0.46 : 0.78;
    const idlePrism = dt ? dt[3] : dark ? 0.14 : 0.26;
    const runPrism = dt ? dt[4] : 0.7;
    const idleReach = dt ? dt[5] : 0.16;
    const runReach = dt ? dt[6] : 0.22;
    const prog = (ms) => { const v = (now - phaseAt) / ms; return v < 0 ? 0 : v > 1 ? 1 : v; };
    const ep = (ms, pw) => 1 - M.pow(1 - prog(ms), pw);
    const fx = (n) => Number(n.toFixed(4));
    const f = (s, r, p, u, v, m, ms) => fillOptics(out, s, scaleConvReach(r), p, u, v, m, ms);
    if (phase === 'start') {
      const p = prog(CONV_AURA_START_MS);
      const s = M.sin(p * M.PI);
      const endStr = wasRunning ? runBase : idleStr;
      const endFullReach = wasRunning ? runReach : idleReach;
      const rawReach = p <= 0.5 ? idleReach + (0.26 - idleReach) * s : endFullReach + (0.26 - endFullReach) * s;
      const endPrism = wasRunning ? runPrism : idlePrism;
      const settleEase = M.pow(p, 2.4);
      const endSpeed = wasRunning ? 1.45 : 0.72;
      return f(
        p <= 0.5 ? idleStr + (peakStr - idleStr) * s : endStr + (peakStr - endStr) * s,
        rawReach,
        p <= 0.5 ? idlePrism + (0.74 - idlePrism) * s : endPrism + (0.74 - endPrism) * s,
        fx(0.50 * (1 - 0.32 * settleEase)),
        fx(1.95 - (1.95 - endSpeed) * settleEase),
        'none',
        22
      );
    }
    if (phase === 'running') {
      return f(
        runBase + (dark ? 0.035 : 0.045) * M.sin(now * 0.0021),
        runReach,
        runPrism,
        0.025 * (1 + M.sin(now * 0.0016)),
        1.45,
        'none',
        32
      );
    }
    if (phase === 'awaiting-decision') {
      const p = prog(CONV_AURA_DECISION_BREATH_MS);
      const wave = p < 1 ? M.sin(p * M.PI * 2) * (1 - 0.35 * p) : 0;
      const baseHold = dark ? 0.22 : 0.42;
      return f(
        M.max(0.08, baseHold + (dark ? 0.045 : 0.065) * wave),
        0.18 + 0.025 * M.max(0, wave),
        0.32,
        p < 1 ? fx(0.12 * wave) : 0,
        p < 1 ? 0.85 : 0,
        'awaiting-decision',
        36
      );
    }
    if (phase === 'decision-clear') {
      const ease = ep(CONV_AURA_DECISION_CLEAR_MS, 2);
      const startHold = dark ? 0.22 : 0.42;
      return f(
        startHold * (1 - ease),
        0.18 - 0.04 * ease,
        0.24 * (1 - ease),
        -0.14 * (1 - ease),
        0.65 * (1 - ease),
        'awaiting-decision',
        28
      );
    }
    if (phase === 'error-halted') {
      const ease = ep(CONV_AURA_ERROR_MS, 2.2);
      const peakErr = dark ? 0.26 : 0.46;
      return f(
        peakErr * (1 - ease),
        0.21 - 0.09 * ease,
        0.36 * (1 - ease),
        fx(-0.44 * (1 - ease)),
        0.9 * (1 - 0.6 * ease),
        'error-halted',
        28
      );
    }
    if (phase === 'long-task-complete') {
      const ease = ep(CONV_AURA_LONG_COMPLETE_MS, 2.05);
      const startStr = dark ? 0.36 : 0.62;
      const holdStr = dark ? 0.16 : 0.30;
      return f(
        startStr + (holdStr - startStr) * ease,
        0.24 + (0.17 - 0.24) * ease,
        0.52 + (0.24 - 0.52) * ease,
        fx(-0.48 * (1 - ease * 0.92)),
        1.25 + (0.55 - 1.25) * ease,
        'long-task-complete',
        28
      );
    }
    if (phase === 'focus-fade') {
      const ease = ep(CONV_AURA_FOCUS_FADE_MS, 2);
      const holdStr = dark ? 0.16 : 0.30;
      return f(
        holdStr + (idleStr - holdStr) * ease,
        0.17 + (0.16 - 0.17) * ease,
        0.24 + (idlePrism - 0.24) * ease,
        0,
        0.55 + (0.72 - 0.55) * ease,
        'none',
        32
      );
    }
    if (phase === 'complete') {
      const ease = ep(CONV_AURA_COMPLETE_MS, 2.1);
      const startStr = dark ? 0.38 : 0.70;
      return f(
        startStr + (idleStr - startStr) * ease,
        0.24 + (0.16 - 0.24) * ease,
        0.76 + (idlePrism - 0.76) * ease,
        -0.36 * (1 - ease * 0.85),
        1.45 + (0.72 - 1.45) * ease,
        'none',
        28
      );
    }
    return f(
      idleStr + (dark ? 0.024 : 0.038) * M.sin(now * 0.0018),
      idleReach,
      idlePrism,
      0,
      0.72,
      'none',
      110
    );
  }

  function invokeConvGlowDraw(glow, now, dark, still, opt, ambientIntensity = 1, spectrum = undefined) {
    if (!glow) return;
    try {
      const extra = DRAW_EXTRA_BUF;
      extra.reach = opt.reach;
      extra.prism = opt.prism;
      extra.surge = opt.surge;
      extra.speed = opt.speed;
      extra.semantic = opt.semantic || 'none';
      extra.ambientIntensity = ambientIntensity;
      extra.still = !!(still);
      extra.spectrum = spectrum !== undefined && spectrum !== null ? spectrum : undefined;
      if (still && typeof glow.drawStaticSnapshot === 'function') {
        extra.still = true;
        glow.drawStaticSnapshot(now, dark, opt.strength, extra);
        return;
      }
      if (typeof glow.draw === 'function') {
        glow.draw(now, dark, opt.strength, extra);
      }
    } catch {}
  }

  function createConvAuraController({
    isDestroyed,
    isHomeRippleEnabled,
    isMotionStandardOrUltra,
    isDarkTheme,
    getMinFrameGapMs,
    getAmbientIntensity,
    getSpectrumMode,
    isWindowFocused,
    rippleCore,
    setAttrIfChanged,
    runGuardedMut,
  }) {
    let convAura = null;
    let preferredView = null;
    let overrideAmbient = null;
    let overrideSpectrum = null;
    let externalAwaiting = null;
    let externalErrorPending = false;
    let wb = false;
    const WB = 'data-ag-cs-win-blur';
    const PP_OPEN = 'data-ag-pp-open';
    const getHtml = () => (typeof document !== 'undefined' ? document.documentElement : null);
    const isAB = () => getHtml()?.getAttribute?.(WB) === '1';
    const isPpOpen = () => getHtml()?.getAttribute?.(PP_OPEN) === '1';
    const isH = () => !!(typeof document !== 'undefined' && document.hidden);
    const isP = () => !!(isH() || isAB() || wb || isPpOpen());

    function normAmbientVal(v) {
      const n = v == null || v === '' ? 1 : Number(v);
      return !Number.isFinite(n) ? 1 : n <= 0 ? 0 : n > 1 ? M.min(1, n / 100) : n;
    }

    function resolveAmbient() {
      if (overrideAmbient !== null) return normAmbientVal(overrideAmbient);
      if (typeof getAmbientIntensity === 'function') return normAmbientVal(getAmbientIntensity());
      try {
        const raw = getHtml()?.getAttribute?.('data-ag-cs-ambient');
        if (raw !== null && raw !== '') return normAmbientVal(raw);
      } catch {}
      return 1;
    }

    function resolveSpectrum() {
      const sp = overrideSpectrum ?? getSpectrumMode?.();
      return (!sp || sp === 'follow' || sp === 'default') && isDarkTheme() && getHtml()?.getAttribute?.('data-ag-cs-dark-aura-style') === 'neon' ? 'neon' : sp;
    }

    function checkWindowFocused() {
      if (typeof isWindowFocused === 'function') return !!(isWindowFocused());
      try { return typeof document !== 'undefined' && typeof document.hasFocus === 'function' ? !!(document.hasFocus()) : true; } catch { return true; }
    }

    function isValidConvView(cv) {
      return !!(
        cv &&
          cv.isConnected !== false &&
          !cv.closest?.('.agy-home') &&
          !cv.closest?.(SUBAGENT_SEL) &&
          !cv.querySelector?.('.agy-home')
      );
    }

    function resolveConvViewTarget(target) {
      if (!target) return null;
      const cv = target.matches?.('[data-testid="conversation-view"]')
        ? target
        : target.closest?.('[data-testid="conversation-view"]');
      return isValidConvView(cv) ? cv : null;
    }

    function findConvAuraView() {
      if (typeof document === 'undefined' || !isHomeRippleEnabled() || document.querySelector('.agy-home')) return null;
      if (isValidConvView(preferredView)) return preferredView;
      preferredView = null;
      const actCv = resolveConvViewTarget(document.activeElement);
      if (actCv) return actCv;
      if (convAura && isValidConvView(convAura.convView)) return convAura.convView;
      const views = document.querySelectorAll('[data-testid="conversation-view"]');
      for (const cv of views) {
        if (isValidConvView(cv)) return cv;
      }
      return null;
    }

    function detachFocusWakeListeners(st) {
      const fn = st?.onUserReturn;
      if (!fn) return;
      st.onUserReturn = null;
      try {
        if (typeof window !== 'undefined') { window.removeEventListener?.('focus', fn); window.removeEventListener?.('pointermove', fn); }
        if (typeof document !== 'undefined') document.removeEventListener?.('pointerenter', fn);
      } catch {}
    }

    function attachFocusWakeListeners(st) {
      if (!st || st.onUserReturn) return;
      const onReturn = () => {
        detachFocusWakeListeners(st);
        if (!convAura || convAura !== st || !st.unfocusedHold) return;
        st.unfocusedHold = false;
        st.sleepReason = '';
        st.phase = 'focus-fade';
        st.phaseAt = readNowMs();
        setAttrIfChanged(st.host, 'data-aura-phase', 'focus-fade');
        st.wake(true);
      };
      st.onUserReturn = onReturn;
      const opt = { once: true, passive: true };
      try {
        if (typeof window !== 'undefined') { window.addEventListener?.('focus', onReturn, opt); window.addEventListener?.('pointermove', onReturn, opt); }
        if (typeof document !== 'undefined') document.addEventListener?.('pointerenter', onReturn, opt);
      } catch {}
    }

    function advancePhase(now = readNowMs(), fromAnimLoop = false) {
      if (!convAura || !convAura.host || !convAura.host.isConnected) return 'off';
      const skipSyncVis = !!(fromAnimLoop && lastFullVisAt >= 0 && M.abs(now - lastFullVisAt) < 2000);
      const scope = convAura.convView || null;
      const runningNow = isConvRunning(skipSyncVis, scope);
      const awaitingNow = externalAwaiting !== null ? !!(externalAwaiting) : isAwaitingDecision(skipSyncVis, scope);
      const freshErr = externalErrorPending || (!runningNow && consumeFreshDomError(scope));
      if (externalErrorPending) externalErrorPending = false;

      if (freshErr) {
        detachFocusWakeListeners(convAura);
        convAura.wasRunning = false;
        convAura.decisionHolding = false;
        convAura.unfocusedHold = false;
        convAura.sleepReason = '';
        convAura.phase = 'error-halted';
        convAura.phaseAt = now;
      } else if (awaitingNow) {
        detachFocusWakeListeners(convAura);
        convAura.wasRunning = runningNow;
        convAura.unfocusedHold = false;
        if (convAura.phase !== 'awaiting-decision') {
          convAura.decisionHolding = false;
          convAura.sleepReason = '';
          convAura.phase = 'awaiting-decision';
          convAura.phaseAt = now;
        }
      } else {
        if (convAura.phase === 'awaiting-decision') {
          convAura.decisionHolding = false;
          convAura.sleepReason = '';
          if (runningNow) {
            convAura.wasRunning = true;
            convAura.runStartedAt = now;
            convAura.phase = 'start';
            convAura.phaseAt = now;
          } else {
            convAura.phase = 'decision-clear';
            convAura.phaseAt = now;
          }
        } else if (runningNow && !convAura.wasRunning) {
          detachFocusWakeListeners(convAura);
          convAura.unfocusedHold = false;
          convAura.decisionHolding = false;
          convAura.sleepReason = '';
          convAura.wasRunning = true;
          convAura.runStartedAt = now;
          if (convAura.phase !== 'start') {
            convAura.phase = 'start';
            convAura.phaseAt = now;
          }
        } else if (!runningNow && convAura.wasRunning) {
          convAura.wasRunning = false;
          convAura.sleepReason = '';
          const runDur = convAura.runStartedAt > 0 ? now - convAura.runStartedAt : 0;
          convAura.runStartedAt = 0;
          convAura.phase = runDur >= CONV_AURA_LONG_TASK_THRESHOLD_MS ? 'long-task-complete' : 'complete';
          convAura.phaseAt = now;
        }
      }

      if (convAura.phase === 'start' && now - convAura.phaseAt >= CONV_AURA_START_MS) {
        convAura.phase = convAura.wasRunning ? 'running' : 'idle';
        convAura.phaseAt = now;
      } else if (convAura.phase === 'complete' && now - convAura.phaseAt >= CONV_AURA_COMPLETE_MS) {
        convAura.phase = 'idle';
        convAura.phaseAt = now;
      } else if (convAura.phase === 'decision-clear' && now - convAura.phaseAt >= CONV_AURA_DECISION_CLEAR_MS) {
        convAura.phase = 'idle';
        convAura.phaseAt = now;
      } else if (convAura.phase === 'error-halted' && now - convAura.phaseAt >= CONV_AURA_ERROR_MS) {
        convAura.pendingErrorClear = true;
        convAura.phase = 'idle';
        convAura.phaseAt = now - CONV_AURA_IDLE_SLEEP_MS;
      } else if (convAura.phase === 'focus-fade' && now - convAura.phaseAt >= CONV_AURA_FOCUS_FADE_MS) {
        convAura.phase = 'idle';
        convAura.phaseAt = now - CONV_AURA_IDLE_SLEEP_MS;
      } else if (
        convAura.phase === 'long-task-complete' &&
        !convAura.unfocusedHold &&
        now - convAura.phaseAt >= CONV_AURA_LONG_COMPLETE_MS &&
        checkWindowFocused()
      ) {
        convAura.phase = 'idle';
        convAura.phaseAt = now - CONV_AURA_IDLE_SLEEP_MS;
      }

      if (convAura.host.getAttribute('data-aura-phase') !== convAura.phase) {
        runGuardedMut(() => {
          convAura.host.setAttribute('data-aura-phase', convAura.phase);
        });
      }
      return convAura.phase;
    }

    function unmount() {
      preferredView = null;
      if (!convAura) return;
      const a = convAura;
      detachFocusWakeListeners(a);
      if (a.timer) clearTimeout(a.timer);
      if (a.resizeTimer) { clearTimeout(a.resizeTimer); a.resizeTimer = 0; }
      if (a.rafId && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(a.rafId);
      a.ro?.disconnect();
      a.uW?.();
      try { a.glow?.dispose?.(); } catch {}
      a.host?.remove();
      convAura = null;
    }

    function park() {
      if (!convAura) return;
      detachFocusWakeListeners(convAura);
      if (convAura.timer) { clearTimeout(convAura.timer); convAura.timer = 0; }
      if (convAura.resizeTimer) { clearTimeout(convAura.resizeTimer); convAura.resizeTimer = 0; }
      if (convAura.rafId && typeof cancelAnimationFrame === 'function') { cancelAnimationFrame(convAura.rafId); convAura.rafId = 0; }
      try { convAura.ro?.disconnect(); } catch {}
      convAura.host?.remove();
      convAura.seatParent = convAura.convView = null;
      convAura.releaseBacking?.();
      convAura.sleeping = convAura.parked = true;
    }

    function prime() {
      cachedRunningAt = -1;
      cachedDecisionAt = -1;
      cachedErrorAt = -1;
      if (isDestroyed() || !isHomeRippleEnabled()) return;
      const cv = findConvAuraView();
      if (!cv) return;
      isConvRunning(false, cv);
      if (externalAwaiting === null) isAwaitingDecision(false, cv);
    }

    function sync(preserveCache = false) {
      if (!preserveCache) {
        cachedRunningAt = -1;
        cachedDecisionAt = -1;
        cachedErrorAt = -1;
      }
      if (isDestroyed() || !isHomeRippleEnabled()) {
        unmount();
        return;
      }
      const convView = findConvAuraView();
      const seatParent = convView ? convView.parentElement || convView : null;
      if (!convView || !seatParent || typeof document === 'undefined') {
        if (convAura) park();
        return;
      }

      const readSize = () => [seatParent.clientWidth || convView.clientWidth || 0, seatParent.clientHeight || convView.clientHeight || 0];
      const readPhase = () => {
        const r = isConvRunning(false, convView);
        const a = externalAwaiting !== null ? !!(externalAwaiting) : isAwaitingDecision(false, convView);
        return [r, a ? 'awaiting-decision' : r ? 'running' : 'idle'];
      };
      if (convAura) {
        if (convAura.seatParent !== seatParent || convAura.convView !== convView || !convAura.host.isConnected || !convAura.canvas.isConnected) {
          const switchedPane = convAura.convView !== convView;
          const nowRe = readNowMs();
          const [runRe, phaseRe] = readPhase();
          const canDeferRelayout = !switchedPane && !convAura.backingReleased && !!(convAura.ro) && convAura.width > 0 && convAura.height > 0 && typeof requestAnimationFrame === 'function' && !document.hidden;
          const [reW, reH] = canDeferRelayout ? [0, 0] : readSize();
          try { convAura.ro?.disconnect(); } catch {}
          convAura.seatParent = seatParent;
          convAura.convView = convView;
          convAura.parked = false;
          seatParent.insertBefore(convAura.host, seatParent.firstChild);
          try { convAura.ro?.observe(seatParent); } catch {}
          if (!canDeferRelayout) {
            if (reW > 0 && reH > 0 && convAura.applySize) convAura.applySize(reW, reH);
            else convAura.relayout?.();
          }
          convAura.wasRunning = runRe;
          convAura.runStartedAt = runRe ? nowRe : 0;
          convAura.decisionHolding = convAura.unfocusedHold = false;
          convAura.sleepReason = '';
          convAura.phase = phaseRe;
          convAura.phaseAt = nowRe;
          setAttrIfChanged(convAura.host, 'data-aura-phase', phaseRe);
          convAura.wake(!canDeferRelayout);
          return;
        }
        const prevPhase = convAura.phase;
        const nextPhase = advancePhase(readNowMs());
        if (!isAB()) wb = false;
        if (isH()) {
          convAura.releaseBacking?.();
          return;
        }
        if (!convAura.sleeping && (!isMotionStandardOrUltra() || isP())) {
          convAura.wake(true);
          return;
        }
        const shouldResumeFromMotionOrVis =
          isMotionStandardOrUltra() &&
          !isP() &&
          convAura.sleeping &&
          convAura.sleepReason !== 'settled' &&
          convAura.sleepReason !== 'ambient-zero';
        if (nextPhase !== prevPhase || shouldResumeFromMotionOrVis || (!isH() && convAura.backingReleased)) {
          if (shouldResumeFromMotionOrVis && nextPhase === 'idle') {
            convAura.phaseAt = readNowMs();
          }
          convAura.sleepReason = '';
          convAura.wake(true);
        }
        return;
      }

      const initNow = readNowMs();
      const [initW, initH] = readSize();
      const [initRunning, initPhase] = readPhase();
      consumeFreshDomError(convView); // prime historical errors before DOM writes

      const host = document.createElement('div');
      host.className = 'ag-cs-conv-aura-host';
      host.setAttribute('data-ag-no-i18n', '');
      host.setAttribute('aria-hidden', 'true');
      host.setAttribute('data-aura-phase', initPhase);
      for (const [k, v] of [['top', 'auto'], ['bottom', '0'], ['left', '0'], ['right', '0'], ['height', '32%']]) host.style.setProperty(k, v, 'important');

      const glowCanvas = document.createElement('canvas');
      glowCanvas.className = 'ag-cs-conv-glow';
      host.appendChild(glowCanvas);
      seatParent.insertBefore(host, seatParent.firstChild);

      const state = {
        seatParent,
        convView,
        host,
        canvas: glowCanvas,
        width: -1,
        height: -1,
        dpr: 0,
        phase: initPhase,
        phaseAt: initNow,
        runStartedAt: initRunning ? initNow : 0,
        liftoffAt: 0,
        sleeping: false,
        sleepReason: '',
        backingReleased: false,
        decisionHolding: false,
        unfocusedHold: false,
        pendingErrorClear: false,
        onUserReturn: null,
        drawCount: 0,
        lastOptics: null,
        wasRunning: initRunning,
        glow: rippleCore?.mountBrandHorizonGlow
          ? rippleCore.mountBrandHorizonGlow(glowCanvas, { width: 0, height: 0 })
          : { mode: 'none', resize() {}, clear() {}, draw() {}, drawStaticSnapshot() {}, dispose() {} },
        timer: 0,
        resizeTimer: 0,
        rafId: 0,
        ro: null,
        uW: null,
        wake: null,
        refreshTheme: null,
      };

      let frameWanted = false;
      let drawnOnce = false;
      let lastGpuDrawAt = 0;
      let forceImmediateDraw = false;
      let bkRel = false;
      let pendingW = 0;
      let pendingH = 0;
      let hasPendingResize = false;
      let lastRoAt = -1;

      const RESIZE_DEBOUNCE_MS = 120;
      const RESIZE_BURST_WINDOW_MS = 180;
      const isResizing = () =>
        typeof document !== 'undefined' && document.documentElement?.getAttribute?.('data-ag-cs-resizing') === '1';

      function clearResizeTimer() {
        if (state.resizeTimer) {
          clearTimeout(state.resizeTimer);
          state.resizeTimer = 0;
        }
      }

      function flushPendingResize() {
        state.resizeTimer = 0;
        if (isDestroyed() || convAura !== state) return;
        if (isH()) {
          hasPendingResize = false;
          pendingW = pendingH = 0;
          return releaseBacking();
        }
        if (isResizing()) {
          state.resizeTimer = setTimeout(flushPendingResize, RESIZE_DEBOUNCE_MS);
          return;
        }
        if (!hasPendingResize) return;
        const tw = pendingW;
        const th = pendingH;
        hasPendingResize = false;
        pendingW = pendingH = 0;
        const prevW = state.width;
        const prevH = state.height;
        if (tw > 0 && th > 0) applySize(tw, th);
        else layout(true);
        if (state.width !== prevW || state.height !== prevH) wake(false);
      }

      function releaseBacking() {
        clearResizeTimer();
        hasPendingResize = false;
        pendingW = pendingH = 0;
        enterAuraSleep('hidden');
        if (bkRel && !glowCanvas.width && !glowCanvas.height) return;
        try { state.glow?.releaseBackingStore?.(); } catch {}
        glowCanvas.width = glowCanvas.height = 0;
        bkRel = state.backingReleased = true;
        drawnOnce = false;
      }

      function resizeGlow(w, h, dpr) {
        if (w <= 0 || h <= 0) return;
        try { state.glow?.resize?.(w, h, dpr); } catch {}
        if (!glowCanvas.width || !glowCanvas.height) {
          glowCanvas.width = M.max(1, M.round(w * dpr));
          glowCanvas.height = M.max(1, M.round(h * dpr));
        }
      }

      function applySize(w, parentH) {
        if (isH()) return releaseBacking();
        const h = parentH > 0 ? M.max(1, M.round(parentH * CONV_AURA_HEIGHT_RATIO)) : 0;
        const rawDpr = (typeof window !== 'undefined' && Number(window.devicePixelRatio)) || 1;
        const dpr = rippleCore?.resolveHorizonDpr ? rippleCore.resolveHorizonDpr(rawDpr, 0.72) : M.min(rawDpr, 1) * 0.72;
        const need = bkRel || (w > 0 && h > 0 && (!glowCanvas.width || !glowCanvas.height));
        if (!need && w === state.width && h === state.height && dpr === state.dpr) return;
        state.width = w;
        state.height = h;
        state.dpr = dpr;
        bkRel = state.backingReleased = drawnOnce = false;
        resizeGlow(w, h, dpr);
      }

      function layout(forceRead = false) {
        if (isH()) return releaseBacking();
        if (!forceRead && !bkRel && state.ro && state.width > 0 && state.height > 0) return;
        const sp = state.seatParent || seatParent, cv = state.convView || convView;
        const w = sp?.clientWidth || cv?.clientWidth || 0, parentH = sp?.clientHeight || cv?.clientHeight || 0;
        if (w > 0 && parentH > 0) applySize(w, parentH);
        else if (bkRel && state.width > 0 && state.height > 0) {
          bkRel = state.backingReleased = drawnOnce = false;
          resizeGlow(state.width, state.height, state.dpr || 0.72);
        } else if (!bkRel) applySize(w, parentH);
      }

      function enterAuraSleep(reason = 'settled') {
        if (state.timer) {
          clearTimeout(state.timer);
          state.timer = 0;
        }
        if (state.rafId && typeof cancelAnimationFrame === 'function') {
          cancelAnimationFrame(state.rafId);
          state.rafId = 0;
        }
        frameWanted = false;
        state.sleeping = true;
        state.sleepReason = reason;
        setAttrIfChanged(host, 'data-aura-sleep', '1');
      }

      function drawNow(now) {
        state.rafId = 0;
        frameWanted = false;
        if (isDestroyed() || convAura !== state) return;
        if (isH()) { releaseBacking(); return; }

        const ambient = resolveAmbient();
        if (ambient <= 0) {
          if (glowCanvas.width > 0 && glowCanvas.height > 0) {
            try { state.glow?.clear?.(); } catch {}
          }
          state.lastOptics = fillOptics(OPTICS_BUF, 0, 0.08, 0, 0, 0, 'none', 0);
          enterAuraSleep('ambient-zero');
          return;
        }

        const allowLivingFlow = isMotionStandardOrUltra() && !isP();
        const liftElapsed = state.liftoffAt > 0 ? now - state.liftoffAt : -1;
        const inLiftoffEbb = allowLivingFlow && liftElapsed >= 0 && liftElapsed < 520;
        if (state.liftoffAt > 0 && !inLiftoffEbb) {
          state.liftoffAt = 0;
        }

        const prevPhaseBeforeAdv = state.phase;
        const phase = advancePhase(now, true);
        const phaseJustChanged = phase !== prevPhaseBeforeAdv;
        const dark = isDarkTheme();
        const spectrum = resolveSpectrum();

        const da = getHtml()?.getAttribute?.('data-ag-cs-dark-aura') || 'balanced';
        let opt = computeConvAuraOptics(phase, state.phaseAt, now, dark, state.wasRunning, OPTICS_BUF, da);
        if (inLiftoffEbb) {
          const p = M.max(0, M.min(1, liftElapsed / 520));
          const ease = 1 - M.pow(1 - p, 2.25);
          const dt = gDa(dark, da) || [0, dark ? 0.31 : 0.64, 0, 0, 0.7, 0, 0.22];
          opt = fillOptics(
            OPTICS_BUF,
            0.92 + (dt[1] - 0.92) * ease,
            scaleConvReach(0.31 + (dt[6] - 0.31) * ease),
            0.78 + (dt[4] - 0.78) * ease,
            0.38 * (1 - ease),
            1.65 + (1.45 - 1.65) * ease,
            'none',
            16
          );
        }

        // Split-Rate 300Hz VSync throttle; on real WebGL2 with explicit targetFps (minGap>0), drive smooth VSync 60fps for active phases and ~30fps (33ms) for pre-sleep settling phases
        const isGpuGlow = !!(state.glow && state.glow.mode === 'webgl2');
        const minGap = isGpuGlow && typeof getMinFrameGapMs === 'function' ? Number(getMinFrameGapMs() || 0) : 0;
        const smoothGpu = isGpuGlow && minGap > 0;
        const isPreSleepPhase = !inLiftoffEbb && (phase === 'idle' || phase === 'awaiting-decision' || phase === 'long-task-complete');
        const smoothActiveGpu = smoothGpu && !isPreSleepPhase;
        const smoothPreSleep = smoothGpu && isPreSleepPhase;
        const isBurstTransient = inLiftoffEbb || phase === 'start';
        const schedFrameMs = smoothPreSleep
          ? M.max(33, minGap)
          : smoothActiveGpu
          ? M.max(16, minGap)
          : (phase === 'idle' ? M.max(160, opt.frameMs || 160) : opt.frameMs || 32);
        const burstGap = M.max(minGap, inLiftoffEbb ? 16 : 20);
        const effectiveMinGap = smoothPreSleep
          ? M.max(31, schedFrameMs - 2)
          : smoothActiveGpu
          ? M.max(15, minGap)
          : isBurstTransient
          ? burstGap
          : M.max(minGap, M.max(0, schedFrameMs - 2));

        const phaseElapsed = now - state.phaseAt;
        const settleDecisionHold = allowLivingFlow && phase === 'awaiting-decision' && phaseElapsed >= CONV_AURA_DECISION_BREATH_MS;
        const settleErrorZero = !!(state.pendingErrorClear) || (phase === 'error-halted' && phaseElapsed >= CONV_AURA_ERROR_MS);
        const settleLongComplete = allowLivingFlow && phase === 'long-task-complete' && phaseElapsed >= CONV_AURA_LONG_COMPLETE_MS;
        const settleIdleSleep = allowLivingFlow && phase === 'idle' && !inLiftoffEbb && phaseElapsed >= CONV_AURA_IDLE_SLEEP_MS;

        const bypassThrottle =
          forceImmediateDraw || phaseJustChanged || !drawnOnce || settleDecisionHold || settleErrorZero || settleLongComplete || settleIdleSleep;
        forceImmediateDraw = false;

        if (!bypassThrottle && allowLivingFlow && effectiveMinGap > 0 && lastGpuDrawAt > 0 && now - lastGpuDrawAt < effectiveMinGap) {
          if (smoothActiveGpu) { wake(false); return; }
          const rem = M.max(4, M.ceil(effectiveMinGap - (now - lastGpuDrawAt)));
          clearTimeout(state.timer);
          state.timer = setTimeout(() => wake(false), rem);
          return;
        }

        lastGpuDrawAt = now;
        layout();
        const hasBuf = state.width > 0 && state.height > 0 && glowCanvas.width > 0 && glowCanvas.height > 0;
        const paint = (o, st) => {
          if (!hasBuf) return;
          if (st) state.glow?.invalidate?.();
          invokeConvGlowDraw(state.glow, now, dark, st, o, ambient, spectrum);
          state.drawCount += 1;
          drawnOnce = true;
        };

        if (settleErrorZero) {
          state.pendingErrorClear = false;
          if (glowCanvas.width > 0 && glowCanvas.height > 0) try { state.glow?.clear?.(); } catch {}
          state.phase = 'idle';
          state.phaseAt = now - CONV_AURA_IDLE_SLEEP_MS;
          setAttrIfChanged(host, 'data-aura-phase', 'idle');
          opt.strength = opt.surge = opt.speed = 0;
          state.lastOptics = opt;
          return enterAuraSleep();
        }

        if (settleDecisionHold) {
          const holdOpt = fillOptics(OPTICS_BUF, dark ? 0.22 : 0.42, scaleConvReach(0.18), 0.30, 0, 0, 'awaiting-decision', 0);
          state.lastOptics = holdOpt;
          state.decisionHolding = true;
          paint(holdOpt, true);
          return enterAuraSleep();
        }

        if (settleLongComplete) {
          if (!checkWindowFocused()) {
            const jadeHoldOpt = fillOptics(OPTICS_BUF, dark ? 0.16 : 0.30, scaleConvReach(0.17), 0.24, 0, 0, 'long-task-complete', 0);
            state.lastOptics = jadeHoldOpt;
            state.unfocusedHold = true;
            paint(jadeHoldOpt, true);
            attachFocusWakeListeners(state);
            return enterAuraSleep('settled');
          }
          state.phase = 'idle';
          state.phaseAt = now - CONV_AURA_IDLE_SLEEP_MS;
          setAttrIfChanged(host, 'data-aura-phase', 'idle');
          const idleSnapOpt = computeConvAuraOptics('idle', state.phaseAt, now, dark, false, OPTICS_BUF, da);
          state.lastOptics = idleSnapOpt;
          paint(idleSnapOpt, true);
          return enterAuraSleep();
        }

        const still = !allowLivingFlow || settleIdleSleep;
        state.lastOptics = opt;
        paint(opt, still);

        if (isDestroyed() || !allowLivingFlow || settleIdleSleep) {
          const reason = !allowLivingFlow ? (isP() ? 'hidden' : 'motion-still') : 'settled';
          enterAuraSleep(reason);
          return;
        }

        state.sleeping = false;
        state.sleepReason = '';
        if (host.hasAttribute('data-aura-sleep')) host.removeAttribute('data-aura-sleep');

        let nextDelay = isBurstTransient ? burstGap : schedFrameMs;
        if (inLiftoffEbb) {
          nextDelay = M.min(nextDelay, M.max(8, 520 - liftElapsed + 4));
        } else if (phase === 'start') {
          nextDelay = M.min(nextDelay, M.max(16, CONV_AURA_START_MS - phaseElapsed + 4));
        } else if (phase === 'complete') {
          nextDelay = M.min(nextDelay, M.max(16, CONV_AURA_COMPLETE_MS - phaseElapsed + 4));
        } else if (phase === 'awaiting-decision') {
          nextDelay = M.min(nextDelay, M.max(16, CONV_AURA_DECISION_BREATH_MS - phaseElapsed + 4));
        } else if (phase === 'error-halted') {
          nextDelay = M.min(nextDelay, M.max(16, CONV_AURA_ERROR_MS - phaseElapsed + 4));
        } else if (phase === 'long-task-complete') {
          nextDelay = M.min(nextDelay, M.max(16, CONV_AURA_LONG_COMPLETE_MS - phaseElapsed + 4));
        } else if (phase === 'idle') {
          nextDelay = M.min(nextDelay, M.max(20, CONV_AURA_IDLE_SLEEP_MS - phaseElapsed + 4));
        }
        clearTimeout(state.timer);
        if (smoothActiveGpu) { wake(false); return; }
        state.timer = setTimeout(() => wake(false), nextDelay);
      }

      function wake(immediate = false) {
        if (state.timer) { clearTimeout(state.timer); state.timer = 0; }
        if (isDestroyed() || convAura !== state) return;
        if (isH()) return releaseBacking();
        if (bkRel) layout(true);
        if (isP()) {
          if (!drawnOnce && glowCanvas.width > 0 && glowCanvas.height > 0) { forceImmediateDraw = true; drawNow(readNowMs()); }
          return enterAuraSleep('hidden');
        }
        if (immediate) {
          if (state.rafId && typeof cancelAnimationFrame === 'function') { cancelAnimationFrame(state.rafId); state.rafId = 0; }
          frameWanted = false;
          forceImmediateDraw = true;
          return drawNow(readNowMs());
        }
        if (frameWanted) return;
        frameWanted = true;
        if (typeof requestAnimationFrame === 'function') state.rafId = requestAnimationFrame(drawNow);
        else drawNow(readNowMs());
      }

      state.wake = wake;
      state.releaseBacking = releaseBacking;
      state.relayout = () => { if (!bkRel) state.width = state.height = -1; drawnOnce = false; layout(true); };
      state.refreshTheme = () => {
        state.glow?.invalidate?.();
        if (isH()) return releaseBacking();
        if (bkRel) layout(true);
        if (state.decisionHolding || state.unfocusedHold || state.sleepReason === 'settled') { forceImmediateDraw = true; drawNow(readNowMs()); }
        else { state.sleepReason = ''; wake(true); }
      };
      const onVis = () => {
        if (isH()) return releaseBacking();
        const r = bkRel;
        if (r) { layout(true); state.glow?.invalidate?.(); }
        if (!isP()) { if (r || state.sleepReason === 'hidden') { state.sleepReason = ''; wake(true); } }
        else {
          if (r && !drawnOnce && glowCanvas.width > 0 && glowCanvas.height > 0) { forceImmediateDraw = true; drawNow(readNowMs()); }
          enterAuraSleep('hidden');
        }
      };
      const onBlur = () => { wb = true; enterAuraSleep('hidden'); };
      const onFocus = () => { wb = false; onVis(); };
      const onPaneAct = (ev) => {
        if (isDestroyed()) return;
        const cv = resolveConvViewTarget(ev?.target);
        if (cv && cv !== preferredView) {
          preferredView = cv;
          if (convAura && convAura.convView !== cv) sync(false);
        }
      };
      const capOpt = { capture: true, passive: true };
      document.addEventListener('visibilitychange', onVis);
      document.addEventListener('focusin', onPaneAct, capOpt);
      document.addEventListener('pointerdown', onPaneAct, capOpt);
      const wRef = typeof window !== 'undefined' ? window : null;
      wRef?.addEventListener?.('blur', onBlur);
      wRef?.addEventListener?.('focus', onFocus);
      let bMo = null;
      if (typeof MutationObserver === 'function' && document.documentElement) {
        try {
          bMo = new MutationObserver(() => { if (!isAB()) wb = false; onVis(); });
          bMo.observe(document.documentElement, { attributes: true, attributeFilter: [WB, PP_OPEN] });
        } catch {}
      }
      state.uW = () => {
        if (typeof document !== 'undefined') {
          document.removeEventListener('visibilitychange', onVis);
          document.removeEventListener('focusin', onPaneAct, capOpt);
          document.removeEventListener('pointerdown', onPaneAct, capOpt);
        }
        wRef?.removeEventListener?.('blur', onBlur);
        wRef?.removeEventListener?.('focus', onFocus);
        bMo?.disconnect();
      };

      if (typeof ResizeObserver === 'function') {
        state.ro = new ResizeObserver((entries) => {
          if (isH()) return releaseBacking();
          const cr = entries && entries[0] && entries[0].contentRect;
          const hasCr = !!(cr && cr.width > 0 && cr.height > 0);
          const nextW = hasCr ? M.round(cr.width) : 0;
          const nextH = hasCr ? M.round(cr.height) : 0;
          const now = readNowMs();
          const hasLiveBuf = !bkRel && state.width > 0 && state.height > 0 && glowCanvas.width > 0 && glowCanvas.height > 0;
          const defer = hasLiveBuf && (isResizing() || hasPendingResize || (lastRoAt >= 0 && now - lastRoAt <= RESIZE_BURST_WINDOW_MS));
          lastRoAt = now;
          if (defer) {
            hasPendingResize = true;
            if (hasCr) {
              pendingW = nextW;
              pendingH = nextH;
            } else {
              pendingW = pendingH = 0;
            }
            clearResizeTimer();
            state.resizeTimer = setTimeout(flushPendingResize, RESIZE_DEBOUNCE_MS);
            return;
          }
          clearResizeTimer();
          hasPendingResize = false;
          pendingW = pendingH = 0;
          const prevW = state.width;
          const prevH = state.height;
          if (hasCr) {
            applySize(nextW, nextH);
          } else {
            layout(true);
          }
          if (state.width !== prevW || state.height !== prevH) wake(false);
        });
        state.ro.observe(seatParent);
      }

      state.applySize = applySize;
      convAura = state;
      if (initW > 0 && initH > 0) applySize(initW, initH);
      else layout(true);
      wake(true);
    }

    function setActiveView(target = null) {
      const next = target ? resolveConvViewTarget(target) : null;
      preferredView = next;
      if (convAura && next && convAura.convView !== next) sync(false);
      return convAura?.convView || preferredView || null;
    }

    function getActiveView() {
      return convAura?.convView || (isValidConvView(preferredView) ? preferredView : null);
    }

    function triggerStart(target = null) {
      if (isDestroyed() || !isHomeRippleEnabled()) return;
      if (target) {
        const cv = resolveConvViewTarget(target);
        if (cv) preferredView = cv;
      }
      if (!convAura || (preferredView && convAura.convView !== preferredView)) sync();
      if (!convAura) return;
      const now = readNowMs();
      detachFocusWakeListeners(convAura);
      convAura.decisionHolding = false;
      convAura.unfocusedHold = false;
      convAura.sleepReason = '';
      if (!convAura.runStartedAt) convAura.runStartedAt = now;
      if (convAura.phase !== 'start' || now - convAura.phaseAt > 240) {
        convAura.phase = 'start';
        convAura.phaseAt = now;
        setAttrIfChanged(convAura.host, 'data-aura-phase', 'start');
      }
      convAura.wake(true);
    }

    function triggerLiftoffEbb(now = readNowMs(), target = null) {
      if (target) {
        const cv = resolveConvViewTarget(target);
        if (cv) preferredView = cv;
      }
      if (!convAura || (preferredView && convAura.convView !== preferredView)) sync();
      if (convAura) {
        convAura.liftoffAt = now;
        convAura.sleepReason = '';
        convAura.wake(true);
      }
    }

    function setAmbientIntensity(val) {
      overrideAmbient = val === null || val === undefined ? null : clamp01(val, 1);
      if (convAura) {
        convAura.sleepReason = '';
        convAura.wake(true);
      }
    }

    function setSpectrumMode(mode) {
      overrideSpectrum = mode === null || mode === undefined ? null : String(mode);
      if (convAura && typeof convAura.refreshTheme === 'function') {
        convAura.refreshTheme();
      }
    }

    function setSemanticState(patch = {}) {
      if (!patch || typeof patch !== 'object') return;
      if ('awaitingDecision' in patch) {
        externalAwaiting = patch.awaitingDecision === null ? null : !!(patch.awaitingDecision);
      }
      if (patch.hasError === true) {
        externalErrorPending = true;
      }
      if (convAura) {
        const prev = convAura.phase;
        const next = advancePhase(readNowMs());
        if (next !== prev || externalErrorPending) {
          convAura.sleepReason = '';
          convAura.wake(true);
        }
      }
    }

    function triggerErrorHalted(now = readNowMs()) {
      externalErrorPending = true;
      if (!convAura) sync();
      if (convAura) {
        advancePhase(now);
        convAura.wake(true);
      }
    }

    function triggerLongTaskComplete(now = readNowMs()) {
      if (!convAura) sync();
      if (convAura) {
        detachFocusWakeListeners(convAura);
        convAura.wasRunning = false;
        convAura.runStartedAt = 0;
        convAura.decisionHolding = false;
        convAura.unfocusedHold = false;
        convAura.sleepReason = '';
        convAura.phase = 'long-task-complete';
        convAura.phaseAt = now;
        setAttrIfChanged(convAura.host, 'data-aura-phase', 'long-task-complete');
        convAura.wake(true);
      }
    }

    function refreshTheme() {
      if (convAura && typeof convAura.refreshTheme === 'function') convAura.refreshTheme();
    }

    function wake(immediate = false) {
      if (convAura && typeof convAura.wake === 'function') convAura.wake(immediate);
    }

    function getInstance() {
      return convAura;
    }

    return {
      prime,
      sync,
      unmount,
      wake,
      setActiveView,
      getActiveView,
      triggerStart,
      triggerLiftoffEbb,
      advancePhase,
      refreshTheme,
      setAmbientIntensity,
      setSpectrumMode,
      setSemanticState,
      triggerErrorHalted,
      triggerLongTaskComplete,
      getInstance,
    };
  }

  G.__agPrismConvAura = {
    CONV_AURA_HEIGHT_RATIO,
    CONV_AURA_IDLE_SLEEP_MS,
    CONV_AURA_DECISION_BREATH_MS,
    CONV_AURA_ERROR_MS,
    CONV_AURA_LONG_TASK_THRESHOLD_MS,
    CONV_AURA_LONG_COMPLETE_MS,
    isConvRunning,
    isAwaitingDecision,
    computeConvAuraOptics,
    createConvAuraController,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);

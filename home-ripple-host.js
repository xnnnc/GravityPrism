// Obsidian Prism — Home & Conversation Interactive ASCII Matrix & Silk Skimmer Ripple Host (home-ripple-host.js)
(function (root) {
  'use strict';
  const M = Math;
  const G = root || (typeof globalThis !== 'undefined' ? globalThis : window);
  if (!G) return;

  const INTRO_MS = 1600;
  const IDLE_MS = 1200;
  const HOLE_A = 'data-has-browser-hole';
  const DHOLE_A = 'data-has-drawer-browser-hole';
  const C_ATTR = 'data-ag-cs-conv-ripple';
  const H_ATTR = 'data-ag-cs-conv-ripple-host';
  const SB_S = 'aside,[data-side-panel-body]';
  const L_ATTR = 'data-conv-level';
  const G_CLS = 'ag-cs-brand-glow';
  const G_TID = 'onboarding-brand-glow';
  const R_CLS = 'ag-cs-ripple-canvas';
  const C_P = {
    subtle: [0.6, 0.4, 0.45, 0.55, 32, 340, 72, 196, 0.62, 0.28, 0.72],
    medium: [0.85, 0.75, 0.75, 0.82, 22, 270, 54, 215, 0.85, 0.34, 0.88],
    full: [1, 1, 1, 1, 16, 220, 42, 230, 1, 0.4, 1],
  };
  const isF = (v) => typeof v === 'function';
  const ga = (e, k) => e?.getAttribute?.(k);
  const ra = (e, k) => { if (e?.hasAttribute?.(k)) e.removeAttribute(k); };
  const hasHole = (e) => ga(e, HOLE_A) === 'true' || ga(e, DHOLE_A) === 'true';
  const docOf = () => (typeof document !== 'undefined' ? document : null);
  const nowOf = () => performance.now();
  const cl = (v, a, b) => M.max(a, M.min(b, v));
  const cAF = (id) => { if (id && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id); return 0; };
  const rAF = (fn) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : 0);
  const parseAmb = (r) => G.__agPrismRipple?.parseAmbientScale ? G.__agPrismRipple.parseAmbientScale(r) : r == null || r === '' ? 1 : cl(Number(r) > 1 ? Number(r) / 100 : Number.isFinite(Number(r)) ? Number(r) : 1, 0, 1);

  function createHomeRippleController({
    rippleCore,
    isDestroyed,
    isAllowed,
    isConvAllowed,
    getConvLevel,
    isConvRunning,
    isDarkTheme,
    motionReduced,
    getMinFrameGapMs,
    getAmbientIntensity,
    getAccentTone,
    setAttrIfChanged,
    onPointerPressMascot,
  }) {
    let rippleMount = null;
    let convHost = null;
    let timer = 0;
    let rRaf = 0;
    let recT = 0;
    let recRaf = 0;
    let mountedAt = 0;
    let tideAt = 0;
    let ro = null;
    let unbindWin = null;
    let syncModeFn = null;
    let streamChkFn = null;
    let refLvFn = null;

    const getHtml = () => docOf()?.documentElement || null;

    function setConvState(on, el) {
      const h = getHtml();
      if (h) on ? setAttrIfChanged(h, C_ATTR, '1') : ra(h, C_ATTR);
      if (convHost && convHost !== el) ra(convHost, H_ATTR);
      convHost = on && el ? el : null;
      if (convHost) setAttrIfChanged(convHost, H_ATTR, '1');
    }

    function isConvBlocked() {
      const d = docOf();
      const h = d?.documentElement;
      return Boolean(
        motionReduced() ||
          ga(h, 'data-ag-cs-motion') === 'off' ||
          ga(h, 'data-ag-prism-wallpaper') === 'on' ||
          hasHole(h) ||
          hasHole(d?.body) ||
          d?.querySelector?.('[data-has-browser-hole="true"],[data-has-drawer-browser-hole="true"]')
      );
    }

    function convLv() {
      if (isF(isConvAllowed) && !isConvAllowed()) return 'off';
      if (isF(getConvLevel)) {
        const v = getConvLevel();
        return v === true || v === 'true' || v === 'on' ? 'medium' : v === 'subtle' || v === 'medium' || v === 'full' ? v : 'off';
      }
      return isF(isConvAllowed) && isConvAllowed() ? 'medium' : 'off';
    }

    function resolveTarget() {
      const d = docOf();
      if (!d) return null;
      const home = d.querySelector('.agy-home');
      if (home) return isAllowed() ? { mode: 'home', root: home, level: 'off' } : null;
      const lv = convLv();
      if (lv === 'off') {
        const rawSeat = isAllowed() && !isConvBlocked() ? d.querySelector('[data-ag-cs-conv-seat="1"]') : null;
        return rawSeat && !hasHole(rawSeat) ? { mode: 'home', root: rawSeat, level: 'off' } : null;
      }
      if (isConvBlocked() || !isF(d.querySelectorAll)) return null;
      const views = Array.from(d.querySelectorAll('[data-testid="conversation-view"]')).filter(
        (v) => !v.hidden && v.style?.display !== 'none' && v.style?.visibility !== 'hidden' && !v.closest?.('[data-testid="subagent-tab-conversation"]')
      );
      if (!views.length) return null;
      const ok = (el) =>
        Boolean(
          el &&
            el !== d.documentElement &&
            el !== d.body &&
            ga(el, 'data-testid') !== 'conversation-view' &&
            !hasHole(el) &&
            !el.closest?.(SB_S) &&
            !el.querySelector?.(SB_S + ',[data-testid="sidebar-split"]>div:first-child') &&
            views.every((v) => !isF(el.contains) || el.contains(v))
        );
      const v0 = views[0];
      for (const s of ['[data-main-content-body]', '.agy-sheet', '[data-split-panes]', '.agy-inset-shell']) {
        const c = v0.closest?.(s);
        if (ok(c)) return { mode: 'conv', root: c, level: lv };
      }
      let p = v0.parentElement;
      if (views.length > 1) {
        while (p && p !== d.body && p !== d.documentElement && !views.every((v) => p.contains?.(v))) p = p.parentElement;
      } else if (p && (ga(p, 'data-ag-cs-conv-seat') === '1' || p.hasAttribute?.('data-tiling-pane')) && ok(p.parentElement)) {
        p = p.parentElement;
      }
      return ok(p) ? { mode: 'conv', root: p, level: lv } : null;
    }

    const ambScale = () => parseAmb(isF(getAmbientIntensity) ? getAmbientIntensity() : ga(getHtml(), 'data-ag-cs-ambient'));

    function specMode(dark) {
      const h = getHtml();
      const t = (isF(getAccentTone) ? getAccentTone() : null) || ga(h, 'data-ag-cs-accent') || 'follow';
      if (t === 'mono' || t === 'cobalt' || t === 'iris' || t === 'amber') return t;
      const pal = ga(h, 'data-ag-cs-palette') || 'obsidian';
      return pal === 'warm' || pal === 'claude' || (!dark && pal === 'obsidian' && ga(h, 'data-ag-cs-light-preset') === 'alabaster') ? 'warm' : 'default';
    }

    function defTokens(dark, spec) {
      const wl = spec === 'mono' ? [51, 65, 85] : spec === 'iris' ? [124, 58, 237] : spec === 'amber' ? [217, 119, 6] : spec === 'warm' ? [194, 89, 52] : [37, 99, 235];
      return { ink: dark ? [146, 148, 156] : [104, 114, 134], wave: dark ? [214, 218, 228] : wl, dark, fontFamily: 'ui-monospace, Consolas, monospace' };
    }

    function sampleTok(cv) {
      const cs = typeof getComputedStyle === 'function' ? getComputedStyle(cv) : null;
      const dark = isDarkTheme();
      const t = defTokens(dark, specMode(dark));
      if (!cs) return t;
      t.ink = rippleCore.parseCssColorToRgb(cs.getPropertyValue('--ag-cs-ripple-ink')) || t.ink;
      t.wave = rippleCore.parseCssColorToRgb(cs.getPropertyValue('--ag-cs-ripple-wave')) || t.wave;
      t.fontFamily = cs.getPropertyValue('--font-mono').trim() || t.fontFamily;
      return t;
    }

    function buildPal(tok, aSt, now, ambRaw, sp, mode, lv) {
      const t = tok || defTokens(isDarkTheme(), sp);
      const amb = cl(Number.isFinite(ambRaw) ? ambRaw : 1, 0, 1);
      const c = mode === 'conv';
      const cp = c ? C_P[lv] || C_P.medium : null;
      const radius = cp ? cp[7] : 230;
      const fd = aSt?.f ?? 1;
      const on = Boolean(aSt?.active && fd > 0.005 && !motionReduced() && amb > 0.001);
      const baseP = sp === 'mono' ? 0.45 : 1;
      return {
        ink: t.ink,
        wave: t.wave,
        dark: t.dark,
        fontFamily: t.fontFamily,
        conv: c,
        alphaScale: cp ? (amb <= 0.001 ? 0 : cp[0]) : 1,
        nebulaLiftScale: cp ? cp[1] : 1,
        auraLiftScale: cp ? cp[2] : 1,
        prismStrength: amb * baseP * (cp ? cp[8] : 1),
        ambientIntensity: amb,
        spectrum: sp,
        nebula: amb <= 0.001 ? false : undefined,
        aura: on ? { x: aSt.x, y: aSt.y, radius, strength: amb * (cp ? cp[3] : 1) * fd, active: true } : { x: 0, y: 0, radius, strength: 0, active: false },
        auraPhase: (now || 0) * (cp ? 0.00045 + 0.00015 * cp[3] : 0.0006),
      };
    }

    function bindRoot(el, m, add) {
      const fn = add ? 'addEventListener' : 'removeEventListener';
      const opt = add ? { passive: true } : undefined;
      el[fn]('pointerdown', m.onPress, opt);
      m.onMove && el[fn]('pointermove', m.onMove, opt);
      m.onLeave && el[fn]('pointerleave', m.onLeave, opt);
    }

    function stopTimers(m) {
      if (timer) { clearTimeout(timer); timer = 0; }
      m.rafId = cAF(m.rafId);
      rRaf = cAF(rRaf);
    }

    function clearRec() {
      if (recT) { clearTimeout(recT); recT = 0; }
      recRaf = cAF(recRaf);
    }

    function detachRoot(m) {
      if (!m?.root) return;
      bindRoot(m.root, m, false);
      m.root = null;
    }

    function parkRipple() {
      setConvState(false, null);
      if (!rippleMount) return;
      stopTimers(rippleMount);
      clearRec();
      ro?.disconnect();
      detachRoot(rippleMount);
      rippleMount.host.remove();
      rippleMount.reclaim?.();
      rippleMount.sleeping = rippleMount.parked = true;
    }

    function unmountRipple() {
      setConvState(false, null);
      if (!rippleMount) return;
      const m = rippleMount;
      stopTimers(m);
      clearRec();
      ro?.disconnect();
      unbindWin?.();
      detachRoot(m);
      m.field?.dispose?.();
      m.glow?.dispose?.();
      m.host.remove();
      rippleMount = ro = unbindWin = syncModeFn = streamChkFn = refLvFn = null;
    }

    function isIgnoredConv(t, press) {
      if (!t?.closest) return false;
      if (t.closest(SB_S + ',.agy-overlay,.aux-drawer-popup')) return true;
      const role = ga(t.closest('[role]'), 'role') || '';
      if (role === 'dialog') return true;
      if (!press) return false;
      return Boolean(
        /^(?:button|textbox|menu|listbox|menuitem|tab|switch)$/.test(role) ||
          t.closest('button,a,input,textarea,select,label,summary,[contenteditable="true"],[data-testid="agent-input-box"],.surface-composer-card,.monaco-editor')
      );
    }

    function mountToRoot(m, mode, tr) {
      m.root = tr;
      m.parked = false;
      mountedAt = nowOf();
      setConvState(mode === 'conv', tr);
      tr.insertBefore(m.host, tr.firstChild);
      bindRoot(tr, m, true);
      ro?.observe(tr);
    }

    function syncRipple() {
      if (!rippleCore) return;
      if (!isAllowed() && convLv() === 'off') return unmountRipple();
      const target = resolveTarget();
      if (!target) {
        setConvState(false, null);
        if (rippleMount && !rippleMount.parked) parkRipple();
        return;
      }
      const mode = target.mode;
      const tr = target.root;
      const lv = target.level || 'off';
      if (rippleMount) {
        const mc = rippleMount.mode !== mode;
        const lc = rippleMount.convLevel !== lv;
        if (rippleMount.parked || rippleMount.root !== tr || !rippleMount.canvas.isConnected || mc) {
          ro?.disconnect();
          if (rippleMount.root !== tr) detachRoot(rippleMount);
          rippleMount.convLevel = lv;
          setAttrIfChanged(rippleMount.host, L_ATTR, lv);
          if (mc) {
            rippleMount.mode = mode;
            setAttrIfChanged(rippleMount.host, 'data-ripple-mode', mode);
            syncModeFn?.(mode);
          }
          mountToRoot(rippleMount, mode, tr);
          rippleMount.reattach?.();
        } else {
          setConvState(mode === 'conv', tr);
          if (lc) {
            rippleMount.convLevel = lv;
            setAttrIfChanged(rippleMount.host, L_ATTR, lv);
            refLvFn?.();
          } else if (mode === 'conv') streamChkFn?.();
        }
        return;
      }

      const d = docOf();
      const mkEl = (tag, cls) => {
        const el = d.createElement(tag);
        el.className = cls;
        el.setAttribute('aria-hidden', 'true');
        return el;
      };
      const host = mkEl('div', 'ag-cs-ripple-host');
      host.setAttribute('data-ripple-mode', mode);
      host.setAttribute(L_ATTR, lv);
      let canvas = mkEl('canvas', R_CLS);
      host.appendChild(canvas);

      const auraState = { x: 0, y: 0, active: false };
      mountedAt = nowOf();
      tideAt = 0;
      let lx = null;
      let ly = null;
      let lsa = 0;
      let lcma = 0;
      let carry = 0;
      let tok = null;
      let cRect = null;
      let cRectAt = 0;
      let prev = mountedAt;
      let lastDraw = 0;
      let lastTs = 0;
      let wanted = false;
      let drawn = false;
      let force1 = true;
      let gZero = false;
      let wb = false;
      let pw = 0;
      let ph = 0;
      let shrunk = false;
      let fLost = false, gLost = false, recTries = 0, aT = null, wSlp = 0, aWk = 0;

      const state = {
        mode,
        convLevel: lv,
        root: tr,
        host,
        glowCanvas: null,
        canvas,
        width: -1,
        height: -1,
        dpr: 0,
        sleeping: false,
        parked: false,
        aura: { reach: 0.47, strength: 1.0 },
        waves: { active: () => false, disturb() {}, advance() {} },
        glow: null,
        field: { mode: 'none', dispose() {}, invalidate() {}, draw() {}, needsDraw: () => false, busy: () => false },
        rafId: 0,
      };
      const WB = 'data-ag-cs-win-blur';
      const PP_OPEN = 'data-ag-pp-open';
      const isAB = () => ga(getHtml(), WB) === '1';
      const isPp = () => ga(getHtml(), PP_OPEN) === '1';
      const isSeatConv = () => ga(state.root, 'data-ag-cs-conv-seat') === '1';
      const isStr = () => state.mode === 'conv' && isF(isConvRunning) && Boolean(isConvRunning());
      const hP = () => Boolean(d.hidden || wb || isAB() || isPp() || ((state.mode === 'conv' || isSeatConv()) && isConvBlocked()));
      const hasSz = (c) => Boolean(c && c.width > 0 && c.height > 0);
      const invAll = () => { state.field?.invalidate?.(); state.glow?.invalidate?.(); };
      const setVis = (el, on) => { if (el?.style) el.style.display = on ? '' : 'none'; };
      const isLost = (cv, inst) => Boolean(inst?.isContextLost?.() || (inst?.mode !== '2d' && cv?.getContext?.('webgl2')?.isContextLost?.()));
      const hasG = isF(rippleCore.mountBrandHorizonGlow);

      function swapCv(oldEl, cls, tid, bf) {
        const n = mkEl('canvas', cls);
        if (tid) n.setAttribute('data-testid', tid);
        oldEl?.replaceWith ? oldEl.replaceWith(n) : oldEl?.parentNode?.replaceChild ? oldEl.parentNode.replaceChild(n, oldEl) : (oldEl?.remove?.(), bf && host.insertBefore ? host.insertBefore(n, canvas) : host.appendChild(n));
        return n;
      }

      function setCvSz(cols, rows) {
        canvas.width = pw;
        canvas.height = ph;
        canvas.style.width = `${cols * rippleCore.RIPPLE.cellWidth}px`;
        canvas.style.height = `${rows * rippleCore.RIPPLE.cellHeight}px`;
      }

      function onLost(isF0) {
        if (isDestroyed() || state.parked) return;
        if (isF0) { fLost = true; setVis(canvas, 0); }
        else { gLost = true; setVis(state.glowCanvas, 0); }
        if (recTries >= 3 || recT || recRaf) return;
        const run = () => { recT = recRaf = 0; recoverLost(); };
        const tid = typeof setTimeout === 'function' ? setTimeout(run, 32) : 0;
        if (tid) recT = tid;
        else if (typeof requestAnimationFrame === 'function') recRaf = rAF(run);
        else run();
      }

      function mountGlow(p2d, sw) {
        if (!state.glowCanvas) return;
        if (sw) { try { state.glow?.dispose?.(true); } catch {} state.glowCanvas = swapCv(state.glowCanvas, G_CLS, G_TID, 1); }
        const mk = (u) => (hasG ? rippleCore.mountBrandHorizonGlow(state.glowCanvas, { prefer2D: !!u, width: 0, height: 0, onContextLost: () => onLost(0) }) : { mode: 'none', resize() {}, draw() {}, dispose() {} });
        let g = mk(p2d);
        if (hasG && g?.mode === 'none' && !p2d) {
          try { g.dispose?.(true); } catch {}
          state.glowCanvas = swapCv(state.glowCanvas, G_CLS, G_TID, 1);
          g = mk(1);
        }
        state.glow = g;
        gLost = false;
        setVis(state.glowCanvas, !hasG || g?.mode !== 'none');
      }

      function mountField(cols, rows, p2d, sw) {
        if (sw) canvas = state.canvas = swapCv(canvas, R_CLS);
        setCvSz(cols, rows);
        const mk = (u) => rippleCore.createGlyphField(canvas, cols, rows, state.waves, { prefer2D: !!u, onContextLost: () => onLost(1) });
        let f = mk(p2d);
        if (cols > 0 && rows > 0 && f?.mode === 'none' && !p2d) {
          try { f.dispose?.(true); } catch {}
          canvas = state.canvas = swapCv(canvas, R_CLS);
          setCvSz(cols, rows);
          f = mk(1);
        }
        fLost = false;
        setVis(canvas, cols <= 0 || rows <= 0 || f?.mode !== 'none');
        return f;
      }

      function recoverLost() {
        if (isDestroyed() || state.parked || (!fLost && !gLost)) return;
        if (d.hidden) return reclaim();
        const nf = fLost;
        const ng = gLost;
        fLost = gLost = false;
        const p2d = ++recTries >= 2;
        if (nf && state.width > 0 && state.height > 0) {
          try { state.field?.dispose?.(true); } catch {}
          state.field = mountField(M.ceil(state.width / rippleCore.RIPPLE.cellWidth), M.ceil(state.height / rippleCore.RIPPLE.cellHeight), p2d, 1);
          tok = sampleTok(canvas);
          cRect = null;
          updateCalm();
        }
        if (ng && state.glowCanvas && state.mode === 'home') {
          mountGlow(p2d, 1);
          if (state.width > 0 && state.height > 0 && state.glow?.mode !== 'none') state.glow?.resize?.(state.width, state.height, 0.6);
        }
        force1 = true;
        drawn = false;
        invAll();
        wake();
      }

      syncModeFn = (nm) => {
        if (nm === 'conv') {
          gLost = false;
          try { state.glow?.dispose?.(); } catch {}
          state.glow = null;
          state.glowCanvas?.remove?.();
          state.glowCanvas = null;
          tideAt = 0;
        } else if (!state.glowCanvas) {
          const gc = mkEl('canvas', G_CLS);
          gc.setAttribute('data-testid', G_TID);
          host.insertBefore ? host.insertBefore(gc, state.canvas) : host.appendChild(gc);
          state.glowCanvas = gc;
          mountGlow(0, 0);
        }
        gZero = false;
      };
      syncModeFn(mode);

      function syncG(w, h) {
        const gc = state.glowCanvas;
        if (!gc || w <= 0 || h <= 0) return;
        if (gLost || isLost(gc, state.glow)) mountGlow(recTries >= 2, 1);
        const cur = state.glowCanvas;
        if (!cur || (hasG && state.glow?.mode === 'none')) return;
        state.glow?.resize?.(w, h, 0.6);
        if (!cur.width || !cur.height) {
          cur.width = M.max(1, M.round(w * 0.6));
          cur.height = M.max(1, M.round(h * 0.6));
        }
      }

      const reclaim = () => {
        enterIdleSleep();
        const gc = state.glowCanvas;
        if (shrunk && !hasSz(canvas) && !hasSz(gc)) return;
        try { state.glow?.releaseBackingStore?.(); } catch {}
        canvas.width = canvas.height = 0;
        if (gc) gc.width = gc.height = 0;
        shrunk = force1 = true;
        drawn = false;
      };

      function updateCalm() {
        const cur = state.root;
        if (!cur || !state.field?.setCalmZones) return;
        const greet = state.mode === 'home' ? cur.querySelector('[data-testid="home-greeting"]') : null;
        if (!greet) return state.field.setCalmZones([]);
        const c = canvas.getBoundingClientRect();
        cRect = c;
        cRectAt = nowOf();
        const g = greet.getBoundingClientRect();
        if (c.width && g.width) state.field.setCalmZones([{ x: g.left - c.left - 28, y: g.top - c.top - 14, w: g.width + 56, h: g.height + 28 }]);
      }

      function layout() {
        const cur = state.root;
        if (!cur) return;
        if (d.hidden) return reclaim();
        const w = M.max(0, Number(cur.clientWidth) || 0);
        const h = M.max(0, Number(cur.clientHeight) || 0);
        const dpr = M.min(window.devicePixelRatio || 1, 2);
        const gc = state.glowCanvas;
        const lostF = fLost || isLost(canvas, state.field);
        if (w === state.width && h === state.height && dpr === state.dpr && !lostF) {
          cRect = null;
          if (shrunk || gLost || isLost(gc, state.glow) || (pw > 0 && ph > 0 && (!hasSz(canvas) || (gc && !hasSz(gc))))) {
            shrunk = drawn = false;
            force1 = true;
            canvas.width = pw;
            canvas.height = ph;
            syncG(w, h);
            invAll();
          }
          return;
        }
        const cw = rippleCore.RIPPLE.cellWidth;
        const ch = rippleCore.RIPPLE.cellHeight;
        const cols = M.ceil(w / cw);
        const rows = M.ceil(h / ch);
        const was2d = state.field?.mode === '2d';
        state.width = w;
        state.height = h;
        state.dpr = dpr;
        pw = M.round(cols * cw * dpr);
        ph = M.round(rows * ch * dpr);
        shrunk = drawn = false;
        force1 = true;
        state.field.dispose(true);
        syncG(w, h);
        state.waves = rippleCore.createWaveField(cols, rows);
        state.field = mountField(cols, rows, was2d && !lostF, lostF);
        tok = sampleTok(canvas);
        cRect = null;
        updateCalm();
      }

      function enterIdleSleep() {
        stopTimers(state);
        wanted = false;
        wSlp = 1;
        state.sleeping = true;
        setAttrIfChanged(host, 'data-ripple-sleep', '1');
      }

      function wake() {
        if (timer) { clearTimeout(timer); timer = 0; }
        if (isDestroyed() || state.parked || wanted) return;
        if (d.hidden) return reclaim();
        if ((state.mode === 'conv' || isSeatConv()) && isConvBlocked()) return parkRipple();
        if (shrunk) layout();
        state.sleeping = false;
        ra(host, 'data-ripple-sleep');
        if (hP() || isStr()) {
          if ((!drawn || force1) && hasSz(canvas)) drawFrame(nowOf());
          return enterIdleSleep();
        }
        wanted = true;
        state.rafId = rAF(drawFrame);
      }

      streamChkFn = () => {
        if (isStr()) {
          auraState.active = false;
          if (!state.sleeping) enterIdleSleep();
        }
      };

      function drawFrame(now) {
        state.rafId = 0;
        wanted = false;
        if (isDestroyed() || state.parked || (rippleMount !== state && rippleMount !== null)) return;
        if (d.hidden) return reclaim();
        if ((state.mode === 'conv' || isSeatConv()) && isConvBlocked()) return parkRipple();
        const streaming = isStr();
        if (streaming) auraState.active = false;
        const still = motionReduced() || streaming;
        const vsDt = lastTs > 0 && now > lastTs ? now - lastTs : now - lastDraw;
        lastTs = now;
        const rawGap = M.max(0, Number(getMinFrameGapMs?.() ?? 0) || 0);
        const minGap =
          (state.mode === 'home' || state.convLevel === 'full') && (state.waves?.active?.() || (auraState.active && lsa > 0 && now - lsa < 650) || (tideAt > 0 && now - tideAt < 480))
            ? rawGap
            : M.max(33, rawGap);
        if (!still && drawn && !force1 && minGap > 0 && lastDraw > 0 && now - lastDraw < minGap && !hP()) {
          const rem = minGap - (now - lastDraw);
          if (typeof setTimeout === 'function' && rem > M.max(8, vsDt + 2)) {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => { timer = 0; wake(); }, M.max(4, M.ceil(rem)));
          } else wake();
          return;
        }
        lastDraw = now;
        const dtMs = still ? 0 : wSlp ? M.min(16, M.max(0, now - prev)) : cl(now - prev, 0, 50);
        aT = aT === null ? now : aT + dtMs;
        wSlp = 0;
        state.waves.advance(still ? 0 : cl(dtMs / 1000, 0, 0.05));
        prev = now;
        const te = state.mode === 'home' && tideAt > 0 ? now - tideAt : -1;
        const inT = !still && te >= 0 && te < 480;
        if (tideAt > 0 && !inT) {
          tideAt = 0;
          state.aura.reach = 0.47;
          state.aura.strength = 1.0;
          force1 = true;
        } else if (inT) {
          const ease = 1 - M.pow(1 - cl(te / 480, 0, 1), 2.2);
          state.aura.reach = +(0.2 + 0.27 * ease).toFixed(4);
          state.aura.strength = +(0.32 + 0.68 * ease).toFixed(4);
        }

        const amb = ambScale();
        if (amb <= 0.001 && auraState.active) auraState.active = false;
        let aSet = 0;
        if (!streaming && amb > 0.001 && auraState.active && lsa > 0) {
          const age = M.max(0, now - lsa);
          if (age >= IDLE_MS) { auraState.active = false; auraState.f = 0; aSet = 1; }
          else {
            const u = age <= 750 ? 1 : (IDLE_MS - age) / 450;
            auraState.f = u * u * (3 - 2 * u) * (aWk && now - aWk < 180 ? cl((now - aWk) / 180, 0.12, 1) : 1);
          }
        }
        const aRec = !streaming && amb > 0.001 && auraState.active && lsa > 0 && now - lsa < IDLE_MS;
        const inI = state.mode === 'home' && !still && amb > 0.001 && now - mountedAt < INTRO_MS;
        const busy = !streaming && Boolean(state.field?.busy?.());
        const need = force1 || !drawn || aSet || (Boolean(state.glowCanvas) && amb <= 0.001 && !gZero) || inT || inI || aRec || (!streaming && Boolean(state.field?.needsDraw(aT, still)));

        if (hasSz(canvas) && need) {
          force1 = false;
          if (!tok) tok = sampleTok(canvas);
          const sp = specMode(tok.dark);
          const pal = buildPal(tok, auraState, aT, amb, sp, state.mode, state.convLevel);
          if (hasSz(state.glowCanvas)) {
            if (amb <= 0.001) {
              if (!gZero) { state.glow?.clear?.(); gZero = true; }
            } else {
              gZero = false;
              state.glow?.draw?.(aT, { dark: pal.dark, still, strength: inT ? state.aura.strength : 1, reach: state.aura.reach, ambientIntensity: amb, spectrum: sp });
            }
          }
          state.field.draw(aT, pal, still);
          drawn = true;
        }

        if (isDestroyed() || hP() || still || !(inT || busy || inI || aRec)) enterIdleSleep();
        else wake();
      }

      state.wake = wake;
      state.reclaim = reclaim;
      refLvFn = () => {
        force1 = true;
        invAll();
        d.hidden ? reclaim() : wake();
      };
      state.reattach = () => {
        if (timer) { clearTimeout(timer); timer = 0; }
        clearRec();
        fLost = gLost = false;
        recTries = 0;
        prev = nowOf();
        wSlp = 1;
        aWk = 0;
        wanted = false;
        force1 = true;
        auraState.active = false;
        lx = ly = null;
        carry = 0;
        const runRe = () => {
          if (isDestroyed() || state.parked) return;
          const pw0 = state.width;
          const ph0 = state.height;
          layout();
          if (state.width !== pw0 || state.height !== ph0 || state.mode === 'conv') updateCalm();
          invAll();
          wake();
        };
        if (!shrunk && state.width > 0 && state.height > 0 && !d.hidden && typeof requestAnimationFrame === 'function') {
          state.rafId = cAF(state.rafId);
          state.rafId = rAF(() => { state.rafId = 0; runRe(); });
        } else runRe();
      };

      const invNonGl = () => { if (state.field?.mode !== 'webgl2') state.field?.invalidate?.(); };
      state.onMove = (ev) => {
        if (motionReduced()) return;
        if (!isAB()) wb = false;
        if (hP() || isStr()) return;
        const c = state.mode === 'conv';
        const cp = c ? C_P[state.convLevel] || C_P.medium : null;
        const nr = nowOf();
        if (c) {
          if ((lcma > 0 && nr - lcma < cp[4]) || isIgnoredConv(ev.target, false)) return;
          lcma = nr;
        }
        if (!cRect || nr - cRectAt > 1500) {
          cRect = canvas.getBoundingClientRect();
          cRectAt = nr;
        }
        const x = ev.clientX - cRect.left;
        const y = ev.clientY - cRect.top;
        if (x < 0 || y < 0 || x > cRect.width || y > cRect.height) {
          lx = ly = null;
          carry = 0;
          if (auraState.active) { auraState.active = false; force1 = true; invNonGl(); wake(); }
          return;
        }
        const now = nowOf();
        if (lx !== null && ly !== null) {
          const dist = M.hypot(x - lx, y - ly);
          const spd = dist / M.max(0.004, (now - lsa) / 1000);
          const ms = cp ? cp[5] : 220;
          const cs = cp ? cp[6] : 42;
          if (spd >= ms) {
            carry += dist;
            if (carry >= cs) {
              carry = M.min(20, carry - cs);
              state.waves.skimmer?.(M.floor(x / rippleCore.RIPPLE.cellWidth), M.floor(y / rippleCore.RIPPLE.cellHeight), cl((spd - ms) / 1800, 0.05, 1) * (cp ? cp[3] : 1));
            }
          } else carry *= 0.85;
        }
        lx = x;
        ly = y;
        lsa = now;
        if (ambScale() > 0.001) {
          if (!auraState.active || state.sleeping) aWk = now;
          auraState.x = x;
          auraState.y = y;
          auraState.active = true;
          if (state.sleeping) prev = now;
          invNonGl();
          wake();
        } else if (state.waves.active()) {
          if (state.sleeping) prev = now;
          state.field.invalidate();
          wake();
        }
      };

      state.onLeave = () => {
        lx = ly = null;
        carry = 0;
        if (auraState.active) { auraState.active = false; force1 = true; invNonGl(); wake(); }
      };

      state.onPress = (ev) => {
        if (isSeatConv()) return;
        if (ev.button !== 0 || motionReduced() || ambScale() <= 0.001 || hP() || isStr()) return;
        const c = state.mode === 'conv';
        if (c && isIgnoredConv(ev.target, true)) return;
        const cp = c ? C_P[state.convLevel] || C_P.medium : null;
        const r = canvas.getBoundingClientRect();
        cRect = r;
        cRectAt = nowOf();
        if (state.sleeping) prev = cRectAt;
        state.waves.disturb(
          M.floor((ev.clientX - r.left) / rippleCore.RIPPLE.cellWidth),
          M.floor((ev.clientY - r.top) / rippleCore.RIPPLE.cellHeight),
          cp && state.convLevel !== 'full' ? { amplitudeScale: cp[3], radiusScale: 0.72 + 0.28 * cp[3], duration: cp[9], loadWeight: cp[10] } : undefined
        );
        state.field.invalidate();
        wake();
        if (!c) onPointerPressMascot?.(ev.clientX);
      };

      const onVis = () => {
        if (d.hidden) return reclaim();
        if (state.mode === 'conv' || convLv() !== 'off' || isSeatConv()) {
          if (isConvBlocked()) { if (!state.parked) parkRipple(); return; }
          if (state.parked) return syncRipple();
        }
        if (state.parked) return;
        const s = shrunk;
        if (s || !hasSz(canvas)) layout();
        const ok = s && hasSz(canvas);
        if (!hP() && !isStr()) { prev = nowOf(); force1 = true; ok ? drawFrame(prev) : wake(); }
        else if (ok && !drawn) drawFrame(nowOf());
        else enterIdleSleep();
      };
      const onBlur = () => { wb = true; enterIdleSleep(); };
      const onFocus = () => { wb = false; onVis(); };
      d.addEventListener('visibilitychange', onVis);
      const wRef = typeof window !== 'undefined' ? window : null;
      wRef?.addEventListener?.('blur', onBlur);
      wRef?.addEventListener?.('focus', onFocus);
      const mos = [];
      if (typeof MutationObserver === 'function') {
        for (const [el, af] of [[getHtml(), [WB, PP_OPEN, 'data-ag-prism-wallpaper', HOLE_A, DHOLE_A, 'data-ag-cs-motion']], [d.body, [HOLE_A, DHOLE_A]]]) {
          if (!el) continue;
          try {
            const mo = new MutationObserver(() => { if (!isAB()) wb = false; onVis(); });
            mo.observe(el, { attributes: true, attributeFilter: af });
            mos.push(mo);
          } catch {}
        }
      }
      unbindWin = () => {
        rRaf = cAF(rRaf);
        d.removeEventListener('visibilitychange', onVis);
        wRef?.removeEventListener?.('blur', onBlur);
        wRef?.removeEventListener?.('focus', onFocus);
        for (const mo of mos) mo.disconnect();
      };

      if (typeof ResizeObserver === 'function') {
        const doLay = () => { rRaf = 0; if (!isDestroyed() && !state.parked) { layout(); wake(); } };
        ro = new ResizeObserver(() => { typeof requestAnimationFrame !== 'function' ? doLay() : !rRaf && (rRaf = rAF(doLay)); });
      }
      mountToRoot(state, mode, tr);
      rippleMount = state;
      layout();
      state.refreshTheme = () => {
        tok = sampleTok(canvas);
        force1 = true;
        invAll();
        d.hidden ? reclaim() : wake();
      };
      wake();
    }

    function refreshTheme() { rippleMount?.refreshTheme?.(); }

    function triggerLiftoffBurst(cr) {
      if (!rippleMount || rippleMount.mode !== 'home' || ga(rippleMount.root, 'data-ag-cs-conv-seat') === '1' || !isF(rippleMount.field?.triggerLiftoffBurst)) return;
      const r = rippleMount.canvas?.getBoundingClientRect?.();
      const ok = cr && r?.width > 0 && r?.height > 0;
      const nx = ok ? cl((cr.left + cr.width * 0.5 - r.left) / r.width, 0.05, 0.95) : 0.5;
      const ny = ok ? cl((cr.top + cr.height * 0.5 - r.top) / r.height, 0.05, 0.95) : 0.62;
      try { rippleMount.field.triggerLiftoffBurst(nx, ny); rippleMount.field.invalidate?.(); rippleMount.wake?.(); } catch {}
    }

    function triggerTideSwell() {
      if (!rippleMount) syncRipple();
      if (!rippleMount || rippleMount.mode !== 'home' || ga(rippleMount.root, 'data-ag-cs-conv-seat') === '1') return;
      tideAt = nowOf();
      rippleMount.aura.reach = 0.2;
      rippleMount.aura.strength = 0.32;
      try { rippleMount.field?.triggerTideSwell?.(); rippleMount.field?.invalidate?.(); rippleMount.wake?.(); } catch {}
    }

    return { sync: syncRipple, park: parkRipple, unmount: unmountRipple, refreshTheme, triggerLiftoffBurst, triggerTideSwell, getMount: () => rippleMount };
  }

  const api = { createHomeRippleController };
  if (typeof module === 'object' && module.exports) module.exports = api;
  G.__agPrismHomeRippleHost = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);

// Obsidian Prism — Zero-StyleRecalc 300Hz GPU Canvas Prism Rim & Orchestrator Rim Module (prism-rim-canvas.js)
(function (root) {
  'use strict';
  const G = root || (typeof globalThis !== 'undefined' ? globalThis : window);
  if (!G) return;

  const RIM_PALETTES = Object.fromEntries(
    (
      'default|0=rgba(255,255,255,0.96)/.24=#4285F4/.5=#9B72CB/.74=#EA4335/.92=#FBBC04/1=rgba(251,188,4,0)|0=#2563EB/.32=#7C3AED/.64=#EA4335/.88=#D97706/1=rgba(217,119,6,0);' +
      'warm|0=rgba(255,246,238,0.95)/.26=#F6BD60/.54=#F0A37E/.82=#D97757/1=rgba(217,119,87,0)|0=#9A3412/.34=#C25934/.68=#D97757/.9=#D97706/1=rgba(217,119,6,0);' +
      'cobalt|0=rgba(240,249,255,0.96)/.26=#7CE2FF/.56=#4285F4/.86=#1B49B2/1=rgba(27,73,178,0)|0=#1D4ED8/.35=#2563EB/.7=#0284C7/.92=#38BDF8/1=rgba(56,189,248,0);' +
      'iris|0=rgba(245,243,255,0.95)/.26=#DDD6FE/.56=#A58AF8/.86=#6D28D9/1=rgba(109,40,217,0)|0=#5B21B6/.36=#7C3AED/.7=#8B5CF6/.92=#A855F7/1=rgba(168,85,247,0);' +
      'amber|0=rgba(255,251,235,0.95)/.26=#FDE68A/.56=#F2B84B/.86=#D97706/1=rgba(217,119,6,0)|0=#92400E/.36=#B45309/.7=#D97706/.92=#F59E0B/1=rgba(245,158,11,0);' +
      'mono|0=rgba(248,250,252,0.92)/.28=#E2E8F0/.6=#94A3B8/.88=#64748B/1=rgba(100,116,139,0)|0=#1E293B/.36=#334155/.7=#64748B/.92=#94A3B8/1=rgba(148,163,184,0)'
    )
      .split(';')
      .map((b) => {
        const [k, d, l] = b.split('|');
        const p = (x) => x.split('/').map((t) => { const [u, v] = t.split('='); return [+u, v]; });
        return [k, { dark: p(d), light: p(l) }];
      })
  );

  const isFn = (v) => typeof v === 'function';
  const ga = (e, k) => e?.getAttribute?.(k);
  const ra = (e, k) => e?.removeAttribute?.(k);
  const dis = (e) => !e || e.isConnected === false;
  const addS = (g, a) => { for (let i = 0; i < a.length; i += 2) g.addColorStop(a[i], a[i + 1]); return g; };
  const palS = (g, tk, dk) => { for (const [o, c] of (RIM_PALETTES[tk] || RIM_PALETTES.default)[dk ? 'dark' : 'light']) g.addColorStop(o, c); return g; };
  const rg = (rgb, a) => `rgba(${rgb},${a.toFixed(4)})`;
  const PB = 'data-ag-cs-prism-box', PM = 'data-ag-cs-prism-mirror', CV_A = 'data-ag-cs-prism-cv', CV_C = 'ag-cs-prism-rim-cv', CV_S = '.' + CV_C;

  const parseAmbientScale = (raw) =>
    G.__agPrismRipple?.parseAmbientScale
      ? G.__agPrismRipple.parseAmbientScale(raw)
      : raw == null || raw === ''
      ? 1
      : Math.max(0, Math.min(1, Number(raw) > 1 ? Number(raw) / 100 : Number.isFinite(Number(raw)) ? Number(raw) : 1));

  function createPrismRimCanvasController({
    isDestroyed, isDarkTheme, motionReduced, getMinFrameGapMs, getAmbientIntensity, getAccentTone,
    canMountRealCanvas, setAttrIfChanged, runGuardedMut, getActiveCrystalTrack, setCrystalPointerClient,
    onPointerActivity, onComposerRimUpdate,
  }) {
    const lastPointerPos = { x: -9999, y: -9999 };
    let prismRaf = 0, idleT = 0, lastPrismDrawAt = 0, pDirty = true, prismBoxCacheAt = 0, lastPrismRectReadAt = 0;
    let pBoxes = [], orchE = null, prismBoxRo = null, stepPlanIo = null, compRimSig = '0';
    const obsSet = new Set(), trkCvs = new Set(), spObs = new Set(), spVis = new Map(), spOn = new Set();

    const getDoc = () => (typeof document !== 'undefined' ? document : null);
    const getHtml = () => getDoc()?.documentElement || null;
    const unobs = (o, s, e) => { if (s.has(e)) { try { o?.unobserve?.(e); } catch {} s.delete(e); } };

    const emitComposerRim = (v) => {
      if (!isFn(onComposerRimUpdate)) return;
      const on = !!(v && v.strength > 0.015);
      const sig = on ? `1|${Math.round(v.localX / 6)}|${Math.round(v.strength * 12)}|${v.toneKey}|${v.dark ? 1 : 0}` : '0';
      if (sig === compRimSig) return;
      compRimSig = sig;
      try { onComposerRimUpdate(on ? { active: true, localX: v.localX, strength: v.strength, toneKey: v.toneKey, dark: v.dark } : { active: false, localX: -9999, strength: 0, toneKey: 'default', dark: true }); } catch {}
    };

    const readAmbientScale = () => parseAmbientScale(getAmbientIntensity ? getAmbientIntensity() : ga(getHtml(), 'data-ag-cs-ambient'));

    const resolveRimToneKey = (dark) => {
      const h = getHtml(), t = getAccentTone?.() || ga(h, 'data-ag-cs-accent') || 'follow';
      if (t === 'mono' || t === 'cobalt' || t === 'iris' || t === 'amber') return t;
      const p = ga(h, 'data-ag-cs-palette') || 'obsidian';
      return p === 'warm' || p === 'claude' || (!dark && p === 'obsidian' && ga(h, 'data-ag-cs-light-preset') === 'alabaster') ? 'warm' : 'default';
    };

    const isRimMotionDisabled = () => {
      if (motionReduced?.()) return true;
      const m = ga(getHtml(), 'data-ag-cs-motion') || '';
      return m === 'off' || m === 'subtle';
    };

    const isH = () => !!(getDoc()?.hidden);
    const isWB = () => isH() || ga(getHtml(), 'data-ag-cs-win-blur') === '1';
    const isRimOn = () => !isRimMotionDisabled() && readAmbientScale() > 0.001;
    const hasLitRim = () => pBoxes.some((e) => !e.wasCleared) || !!(orchE && !orchE.wasCleared);
    const isDragSuspended = () => { const h = getHtml(); return ga(h, 'data-ag-cs-resizing') === '1' || ga(h, 'data-ag-cs-mascot-drag') === '1'; };
    const clrIdle = () => { if (idleT) { isFn(G.clearTimeout) && clearTimeout(idleT); idleT = 0; } };
    const zCv = (c) => { if (c && (c.width || c.height)) c.width = c.height = 0; };
    const zEnt = (e, all) => { if (e && (all || e.wasCleared)) { e._s = ''; e._g = null; e._gk = ''; e.wasCleared = true; zCv(e.cv); } };

    const shrinkRims = (all) => {
      clrIdle();
      if (!all && isDestroyed()) return;
      for (const e of pBoxes) zEnt(e, all);
      zEnt(orchE, all);
      if (all) {
        emitComposerRim(null);
        for (const c of trkCvs) zCv(c);
        getDoc()?.querySelectorAll?.(CV_S)?.forEach?.(zCv);
      }
    };
    const armIdle = () => {
      if (isDestroyed() || typeof setTimeout !== 'function') return;
      const ok = (e) => e?.wasCleared && e.cv && (e.cv.width > 0 || e.cv.height > 0);
      if (!ok(orchE) && !pBoxes.some(ok)) return clrIdle();
      if (!idleT) idleT = setTimeout(() => shrinkRims(0), 1800);
    };

    const clearRimEntry = (e) => {
      if (!e) return;
      e._s = '';
      if (e.ctx && e.cv && e.cv.width > 0 && e.cv.height > 0 && !e.wasCleared) {
        try { e.ctx.clearRect(0, 0, e.cv.width, e.cv.height); } catch {}
        e.wasCleared = true;
      }
    };

    const clearAllRimCanvases = (immediateShrink = false) => {
      pBoxes.forEach(clearRimEntry);
      clearRimEntry(orchE);
      emitComposerRim(null);
      getDoc()?.querySelectorAll?.(CV_S)?.forEach?.((cv) => {
        try { const ctx = cv.getContext?.('2d'); if (ctx && cv.width > 0 && cv.height > 0) ctx.clearRect(0, 0, cv.width, cv.height); } catch {}
      });
      if (immediateShrink) shrinkRims(1);
      else armIdle();
    };

    const removeSingleRimCanvas = (cv) => {
      if (!cv) return;
      trkCvs.delete(cv);
      const host = cv.parentElement;
      try { const ctx = cv.getContext?.('2d'); if (ctx && cv.width > 0 && cv.height > 0) ctx.clearRect(0, 0, cv.width, cv.height); } catch {}
      zCv(cv);
      cv.remove?.();
      if (host?.hasAttribute?.(CV_A)) ra(host, CV_A);
    };

    const pruneDetachedBoxes = (activeTrack) => {
      const keepBox = (b) => !dis(b) && ga(b, PB) === '1';
      if (pBoxes.length) {
        let kept = null;
        for (let i = 0; i < pBoxes.length; i++) {
          const e = pBoxes[i];
          if (e && keepBox(e.box)) { if (kept) kept.push(e); }
          else {
            if (!kept) kept = pBoxes.slice(0, i);
            if (e?.cv) removeSingleRimCanvas(e.cv);
            if (e?.box) unobs(prismBoxRo, obsSet, e.box);
          }
        }
        if (kept) pBoxes = kept;
      }
      if (orchE && (dis(orchE.box) || (activeTrack && orchE.box !== activeTrack))) {
        if (orchE.cv) removeSingleRimCanvas(orchE.cv);
        if (orchE.box) unobs(prismBoxRo, obsSet, orchE.box);
        orchE = null;
      }
      for (const box of Array.from(obsSet)) if (dis(box) || (ga(box, PB) !== '1' && box !== activeTrack)) unobs(prismBoxRo, obsSet, box);
    };

    const pruneOrphanRimCanvases = (fullScan = true) => {
      const activeTrack = getActiveCrystalTrack?.() || null;
      pruneDetachedBoxes(activeTrack);
      const d = getDoc();
      if (!d || !isFn(d.querySelectorAll)) return;
      const keepHost = (h) => !dis(h) && (ga(h, PB) === '1' || (activeTrack && h === activeTrack));
      if (!fullScan) {
        for (const cv of Array.from(trkCvs)) if (dis(cv) || !keepHost(cv.parentElement)) removeSingleRimCanvas(cv);
        return;
      }
      for (const cv of Array.from(trkCvs)) if (dis(cv)) trkCvs.delete(cv);
      d.querySelectorAll(CV_S).forEach((cv) => { if (!keepHost(cv.parentElement)) removeSingleRimCanvas(cv); else trkCvs.add(cv); });
      d.querySelectorAll(`[${CV_A}]`).forEach((h) => { if (!keepHost(h) || !h.querySelector?.(CV_S)) ra(h, CV_A); });
    };

    const ensurePrismRimCanvas = (hostEl) => {
      if (!hostEl || !canMountRealCanvas(hostEl)) return null;
      let cv = null;
      for (let c = hostEl.firstElementChild; c; c = c.nextElementSibling) if (c.classList?.contains(CV_C)) { cv = c; break; }
      if (!cv) {
        cv = document.createElement('canvas');
        cv.className = CV_C;
        cv.width = cv.height = 0;
        cv.setAttribute('aria-hidden', 'true');
        cv.setAttribute('data-ag-no-i18n', '');
        if (cv.style?.setProperty) for (const k of ['margin', 'padding', 'border']) cv.style.setProperty(k, '0', 'important');
        hostEl.appendChild(cv);
      }
      trkCvs.add(cv);
      const ctx = isFn(cv.getContext) ? cv.getContext('2d') : null;
      if (!ctx || !isFn(ctx.createRadialGradient)) { cv.remove(); return null; }
      setAttrIfChanged(hostEl, CV_A, '1');
      return { cv, ctx };
    };

    const strokeRoundedRectPath = (ctx, x, y, w, h, r) => {
      ctx.beginPath();
      if (isFn(ctx.roundRect)) { ctx.roundRect(x, y, w, h, r); return; }
      const cr = Math.max(0, Math.min(r, w * 0.5, h * 0.5));
      ctx.moveTo(x + cr, y);
      ctx.arcTo(x + w, y, x + w, y + h, cr);
      ctx.arcTo(x + w, y + h, x, y + h, cr);
      ctx.arcTo(x, y + h, x, y, cr);
      ctx.arcTo(x, y, x + w, y, cr);
      ctx.closePath();
    };

    const traceGhost = (ctx, s) => {
      ctx.beginPath();
      const pts = [0, 0, 0, 13.8, 3.6, 10.5, 6.1, 15.6, 8, 14.7, 5.5, 9.6, 10.1, 9.6];
      ctx.moveTo(0, 0);
      for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i] * s, pts[i + 1] * s);
      ctx.closePath();
    };

    const drawMirrorCursorReflection = (ctx, gx, gy, w, h, dpr, dark, effAlpha, rectW, rectH, localX, localY) => {
      if ((rectW || 0) * (rectH || 0) > 120000) return;
      const distOut = Math.hypot(localX < 0 ? -localX : localX > rectW ? localX - rectW : 0, localY < 0 ? -localY : localY > rectH ? localY - rectH : 0);
      if (distOut > 42) return;
      const a = effAlpha * Math.max(0, 1 - distOut / 42) * (dark ? 1 : 0.65);
      if (a <= 0.01) return;
      const rx = gx + 3.2 * dpr, ry = gy + 4.2 * dpr;
      ctx.fillStyle = addS(
        ctx.createRadialGradient(rx + 2 * dpr, ry + 3 * dpr, 0, rx + 2 * dpr, ry + 3 * dpr, 26 * dpr),
        dark ? [0, rg('248,252,255', 0.135 * a), 0.45, rg('216,232,252', 0.05 * a), 1, 'rgba(200,220,250,0)'] : [0, rg('37,99,235', 0.065 * a), 1, 'rgba(37,99,235,0)']
      );
      ctx.fillRect(0, 0, w, h);
      const drawLayer = (ox, oy, s, x1, y1, st) => {
        ctx.save(); ctx.translate(rx + ox * dpr, ry + oy * dpr); traceGhost(ctx, s);
        ctx.fillStyle = addS(ctx.createLinearGradient(0, 0, x1 * s, y1 * s), st); ctx.fill(); ctx.restore();
      };
      drawLayer(-0.55, -0.55, 1.18 * dpr, 8, 16, dark ? [0, rg('232,242,255', 0.055 * a), 0.55, rg('204,224,248', 0.024 * a), 1, 'rgba(180,205,238,0)'] : [0, rg('15,23,42', 0.032 * a), 1, 'rgba(15,23,42,0)']);
      drawLayer(0, 0, 1.04 * dpr, 7, 15, dark ? [0, rg('252,254,255', 0.115 * a), 0.45, rg('222,235,252', 0.048 * a), 1, rg('190,210,240', 0.006 * a)] : [0, rg('15,23,42', 0.06 * a), 1, 'rgba(15,23,42,0.004)']);
    };

    const paintPrismRimCanvas = (entry, active, localX, localY, radius, dark, toneKey = 'default', ambientScale = 1) => {
      if (isDragSuspended()) return true;
      if (!entry || !entry.ctx || !entry.cv || !entry.rect) return false;
      if (!active || ambientScale <= 0.001) { clearRimEntry(entry); return true; }
      const isMirror = !!entry.mirrorMode, isReflB = !isMirror && !!entry.reflectBottomMode;
      const dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || G.devicePixelRatio || 1, 1.5);
      const w = Math.max(4, Math.round((entry.rect.width + (entry.insetPad || 0)) * dpr));
      const h = Math.max(4, Math.round((entry.rect.height + (entry.insetPad || 0)) * dpr));
      const cssR = entry.borderRadius > 0 ? entry.borderRadius : 10;
      const effA = Math.max(0, Math.min(1, ambientScale * (!isMirror && toneKey === 'mono' ? 0.58 : 1)));
      const sig = `${w}|${h}|${radius}|${dark ? 1 : 0}|${isMirror ? 'm' : toneKey}|${isReflB ? 'b' : ''}|${effA.toFixed(3)}|${cssR}|${entry.insetPad || 0}`;
      if (!entry.wasCleared && entry.cv.width === w && entry.cv.height === h && entry._s === sig && Math.abs(localX - entry._x) < 1.5 && Math.abs(localY - entry._y) < 1.5) return true;
      if (entry.cv.width !== w || entry.cv.height !== h) { entry.cv.width = w; entry.cv.height = h; }
      entry.wasCleared = false; entry._s = sig; entry._x = localX; entry._y = localY;
      const ctx = entry.ctx;
      ctx.clearRect(0, 0, w, h);
      const padOff = entry.insetPad ? entry.insetPad * 0.5 : 0;
      const gx = (localX + padOff) * dpr, gy = (localY + padOff) * dpr, gr = radius * dpr;
      const inset = (entry.insetPad ? 1 : 0.75) * dpr, rw = Math.max(2, w - inset * 2), rh = Math.max(2, h - inset * 2), rr = Math.min(rw * 0.5, rh * 0.5, cssR * dpr);
      const prevA = ctx.globalAlpha;

      if (isMirror) {
        if (isFn(ctx.save) && isFn(ctx.clip) && isFn(ctx.fillRect)) {
          ctx.save();
          strokeRoundedRectPath(ctx, 0, 0, w, h, Math.min(w * 0.5, h * 0.5, cssR * dpr));
          ctx.clip();
          ctx.fillStyle = addS(
            ctx.createRadialGradient(gx, gy, 0, gx, gy, 210 * dpr),
            dark ? [0, rg('238,245,255', 0.068 * effA), 0.42, rg('206,224,250', 0.026 * effA), 0.8, rg('180,202,238', 0.006 * effA), 1, 'rgba(180,202,238,0)'] : [0, rg('37,99,235', 0.042 * effA), 0.5, rg('37,99,235', 0.014 * effA), 1, 'rgba(37,99,235,0)']
          );
          ctx.fillRect(0, 0, w, h);
          if (isFn(ctx.translate) && isFn(ctx.createLinearGradient)) drawMirrorCursorReflection(ctx, gx, gy, w, h, dpr, dark, effA, entry.rect.width, entry.rect.height, localX, localY);
          ctx.restore();
        }
        ctx.globalAlpha = effA;
        strokeRoundedRectPath(ctx, inset, inset, rw, rh, rr);
        ctx.lineWidth = 1.35 * dpr;
        ctx.strokeStyle = addS(
          ctx.createRadialGradient(gx, gy, 0, gx, gy, gr),
          dark ? [0, 'rgba(255,255,255,0.95)', 0.24, 'rgba(232,240,252,0.56)', 0.54, 'rgba(186,202,228,0.18)', 0.85, 'rgba(148,168,198,0.03)', 1, 'rgba(148,168,198,0)'] : [0, 'rgba(30,64,175,0.52)', 0.42, 'rgba(59,130,246,0.2)', 1, 'rgba(59,130,246,0)']
        );
        ctx.stroke();
        ctx.globalAlpha = prevA !== undefined ? prevA : 1;
        return true;
      }

      if (isReflB) {
        const gyR = h + 16 * dpr, grR = Math.max(radius * 1.15, 220) * dpr, ob = localY - entry.rect.height;
        const aR = effA * 0.46 * (ob > 150 ? Math.max(0, 1 - (ob - 150) / 190) : localY < 0 ? Math.max(0, 1 + localY / 80) : 1);
        if (aR > 0.004) {
          ctx.globalAlpha = aR;
          strokeRoundedRectPath(ctx, inset, inset, rw, rh, rr);
          ctx.lineWidth = 1.15 * dpr;
          ctx.strokeStyle = palS(ctx.createRadialGradient(gx, gyR, 0, gx, gyR, grR), toneKey, dark);
          ctx.stroke();
          if (isFn(ctx.save) && isFn(ctx.clip)) {
            ctx.save(); strokeRoundedRectPath(ctx, inset, inset, rw, rh, rr); ctx.clip();
            const wh = Math.min(rh, 14 * dpr), wc = dark ? '255,255,255' : '59,130,246';
            ctx.globalAlpha = 1;
            ctx.fillStyle = addS(ctx.createRadialGradient(gx, h + 2 * dpr, 0, gx, h + 2 * dpr, Math.max(grR * 0.72, 160 * dpr)), [0, rg(wc, 0.032 * aR), 1, `rgba(${wc},0)`]);
            ctx.fillRect(0, Math.max(0, h - wh), w, wh);
            ctx.restore();
          }
          if (isFn(ctx.createLinearGradient) && isFn(ctx.save)) {
            ctx.save(); ctx.globalCompositeOperation = 'destination-in'; ctx.globalAlpha = 1;
            ctx.fillStyle = addS(ctx.createLinearGradient(0, h, 0, 0), [0, 'rgba(0,0,0,1)', 0.22, 'rgba(0,0,0,0.68)', 0.48, 'rgba(0,0,0,0)', 1, 'rgba(0,0,0,0)']);
            ctx.fillRect(0, 0, w, h); ctx.restore();
          }
        }
        ctx.globalAlpha = prevA !== undefined ? prevA : 1;
        return true;
      }

      if (isFn(ctx.save) && isFn(ctx.translate) && isFn(ctx.restore)) {
        const gKey = `${gr}|${dark ? 1 : 0}|${toneKey}`;
        let grad = entry._gk === gKey ? entry._g : null;
        if (!grad) { grad = palS(ctx.createRadialGradient(0, 0, 0, 0, 0, gr), toneKey, dark); entry._g = grad; entry._gk = gKey; }
        ctx.save(); ctx.globalAlpha = effA; ctx.translate(gx, gy);
        strokeRoundedRectPath(ctx, inset - gx, inset - gy, rw, rh, rr);
        ctx.lineWidth = 1.45 * dpr; ctx.strokeStyle = grad; ctx.stroke(); ctx.restore();
      } else {
        ctx.globalAlpha = effA;
        strokeRoundedRectPath(ctx, inset, inset, rw, rh, rr);
        ctx.lineWidth = 1.45 * dpr; ctx.strokeStyle = palS(ctx.createRadialGradient(gx, gy, 0, gx, gy, gr), toneKey, dark); ctx.stroke();
      }
      ctx.globalAlpha = prevA !== undefined ? prevA : 1;
      return true;
    };

    const ensurePrismBoxRo = () => {
      if (prismBoxRo || typeof ResizeObserver !== 'function') return prismBoxRo;
      prismBoxRo = new ResizeObserver(() => {
        pDirty = true;
        if (!isDestroyed() && !isWB() && !isDragSuspended() && isRimOn() && lastPointerPos.x >= -1000 && !prismRaf && isFn(G.requestAnimationFrame)) {
          if (hasLitRim()) { lastPrismDrawAt = 0; schedRaf(); }
        }
      });
      return prismBoxRo;
    };

    const readBoxBorderRadius = (el, fb) => {
      if (!el || typeof getComputedStyle !== 'function') return fb;
      try { const v = parseFloat(getComputedStyle(el).borderTopLeftRadius || ''); return Number.isFinite(v) && v >= 0 ? v : fb; } catch { return fb; }
    };

    const spOk = (e) => !dis(e) && !e.hidden && ga(e, 'aria-hidden') !== 'true' && ga(e, 'data-state') !== 'closed' && ga(e, 'aria-expanded') !== 'false' && e.style?.display !== 'none' && e.style?.visibility !== 'hidden' && !/(?:^|\s)(?:hidden|sr-only|grid-rows-\[0fr\]|h-0|max-h-0)(?:\s|$)/.test(e.className || '');
    const inVp = (r) => !!(r && r.width >= 4 && r.height >= 4 && r.bottom > 0 && r.right > 0 && r.top < (G.innerHeight || 900) && r.left < (G.innerWidth || 1440));
    const spIo = () => {
      if (stepPlanIo || typeof IntersectionObserver !== 'function') return stepPlanIo;
      try {
        stepPlanIo = new IntersectionObserver((es) => {
          if (isDestroyed()) return;
          let ch = 0;
          for (const en of es) {
            const t = en?.target, br = en?.boundingClientRect;
            if (!t) continue;
            const on = en.isIntersecting && (!br || (br.width >= 4 && br.height >= 4)) ? 1 : 0;
            if (spVis.get(t) !== on) { spVis.set(t, on); ch = 1; }
          }
          if (ch) { pDirty = true; syncSp(0); }
        });
      } catch { stepPlanIo = null; }
      return stepPlanIo;
    };
    const scanSp = (rd) => {
      const ps = Array.from(getDoc()?.querySelectorAll?.('[data-testid="step-plan"]') || []), des = new Set(), rcs = new Map();
      if (isRimOn() && !isWB()) {
        for (let i = ps.length - 1; i >= 0 && des.size < 2; i--) {
          const e = ps[i];
          if (!spOk(e) || (spVis.has(e) && !spVis.get(e))) continue;
          if (rd && e.getBoundingClientRect) {
            const r = e.getBoundingClientRect();
            if (!inVp(r)) continue;
            rcs.set(e, r); des.add(e);
          } else if (spVis.get(e) || (!rd && spOn.has(e))) des.add(e);
        }
      }
      return { ps, des, rcs };
    };
    const applySp = (ps, des) => {
      const io = ps.length ? spIo() : stepPlanIo, pSet = new Set(ps);
      if (io) {
        for (const p of ps) if (!spObs.has(p)) { try { io.observe(p); spObs.add(p); } catch {} }
        for (const o of Array.from(spObs)) if (!pSet.has(o) || dis(o)) { unobs(io, spObs, o); spVis.delete(o); }
      }
      for (const s of Array.from(spOn)) if (!des.has(s)) {
        spOn.delete(s);
        try { ra(s, PB); ra(s, PM); s.style?.removeProperty?.('--ag-px'); s.style?.removeProperty?.('--ag-py'); } catch {}
      }
      for (const s of des) {
        setAttrIfChanged(s, PB, '1');
        setAttrIfChanged(s, PM, '1');
        spOn.add(s);
      }
    };
    const syncSp = (rd) => {
      if (isDestroyed()) return;
      const { ps, des } = scanSp(rd);
      if (!ps.length && !spOn.size && !spObs.size) return;
      runGuardedMut(() => { applySp(ps, des); pruneOrphanRimCanvases(false); });
    };

    const refreshPrismBoxRectCache = (now, allowReadRect) => {
      const sp = scanSp(allowReadRect), ro = ensurePrismBoxRo(), prevMap = new Map(), nextObserved = new Set(), next = [], bSet = new Set(), boxList = [];
      for (const e of pBoxes) prevMap.set(e.box, e);
      for (const b of document.querySelectorAll(`[${PB}="1"]`) || []) if ((!spOn.has(b) || sp.des.has(b)) && !bSet.has(b)) { bSet.add(b); boxList.push(b); }
      for (const s of sp.des) if (!bSet.has(s)) { bSet.add(s); boxList.push(s); }
      const trackEl = getActiveCrystalTrack ? getActiveCrystalTrack() : null;
      let nextOrch = null;
      const preMeasured = boxList.map((box) => {
        const prev = prevMap.get(box);
        return { box, prev, borderRadius: prev && prev.borderRadius >= 0 ? prev.borderRadius : readBoxBorderRadius(box, 10), rect: sp.rcs.get(box) || (allowReadRect && box.getBoundingClientRect ? box.getBoundingClientRect() : null) };
      });
      const orchRect = trackEl && allowReadRect && trackEl.getBoundingClientRect ? trackEl.getBoundingClientRect() : null;
      const mkEntry = (box, rect, prev, insetPad, borderRadius, mirrorMode = false, reflectBottomMode = false) => {
        nextObserved.add(box);
        if (ro && !obsSet.has(box)) { try { ro.observe(box); obsSet.add(box); } catch {} }
        const reusePrev = !!(prev?.cv?.isConnected), rim = reusePrev ? prev : ensurePrismRimCanvas(box);
        return {
          box, rect, cv: rim ? rim.cv : null, ctx: rim ? rim.ctx : null, insetPad, mirrorMode, reflectBottomMode, borderRadius,
          wasCleared: prev ? prev.wasCleared : false, _s: prev?._s || '', _x: prev?._x ?? -9999, _y: prev?._y ?? -9999,
          _g: reusePrev ? (prev._g || null) : null, _gk: reusePrev ? (prev._gk || '') : '', pxStr: prev ? prev.pxStr : '', pyStr: prev ? prev.pyStr : '',
        };
      };
      runGuardedMut(() => {
        if (sp.ps.length || spOn.size || spObs.size) applySp(sp.ps, sp.des);
        for (const { box, prev, borderRadius, rect } of preMeasured) {
          const isHp = !!(box.classList?.contains?.('ag-cs-home-panel'));
          if (isHp && ga(box, PM) !== '1') setAttrIfChanged(box, PM, '1');
          const mirrorMode = ga(box, PM) === '1' || isHp, reflectBottomMode = !mirrorMode && ga(box, 'data-ag-cs-prism-reflect') === 'bottom';
          const pad = mirrorMode || isHp || ga(box, 'data-testid') === 'step-plan' ? 0 : 2;
          next.push(mkEntry(box, rect, prev, pad, borderRadius, mirrorMode, reflectBottomMode));
        }
        if (trackEl) nextOrch = mkEntry(trackEl, orchRect, orchE?.box === trackEl ? orchE : null, 0, 999, false, false);
        if (ro) for (const oldEl of Array.from(obsSet)) if (!nextObserved.has(oldEl)) unobs(ro, obsSet, oldEl);
        pruneOrphanRimCanvases();
      });
      pBoxes = next; orchE = nextOrch; pDirty = false; prismBoxCacheAt = now;
    };

    const flushPrismPointer = (rafNow) => {
      prismRaf = 0;
      if (isDestroyed()) return;
      if (isH()) return shrinkRims(1);
      if (isWB()) return;
      if (isDragSuspended()) { pDirty = true; return; }
      const ambientScale = readAmbientScale();
      if (isRimMotionDisabled() || ambientScale <= 0.001) {
        runGuardedMut(() => { pruneOrphanRimCanvases(); clearAllRimCanvases(true); });
        return;
      }
      const now = typeof rafNow === 'number' && rafNow > 0 ? rafNow : performance.now();
      const minGap = Math.max(0, Number(getMinFrameGapMs?.() ?? 0) || 0);
      if (minGap > 0 && lastPrismDrawAt > 0 && now - lastPrismDrawAt < minGap) { schedRaf(); return; }
      lastPrismDrawAt = now;
      const { x, y } = lastPointerPos, allowReadRect = x >= -1000;
      const activeTrack = getActiveCrystalTrack ? getActiveCrystalTrack() : null;
      if (
        pDirty || !pBoxes.length || (!prismBoxRo && now - prismBoxCacheAt > 2500) || now - prismBoxCacheAt > 8000 ||
        activeTrack !== (orchE ? orchE.box : null) ||
        pBoxes.some((e) => dis(e.box) || (e.cv && e.cv.isConnected === false) || e.borderRadius < 0 || (allowReadRect && !e.rect))
      ) {
        refreshPrismBoxRectCache(now, allowReadRect);
        lastPrismRectReadAt = now;
      } else if (allowReadRect && now - lastPrismRectReadAt >= (prismBoxRo ? 1500 : 250)) {
        lastPrismRectReadAt = now;
        for (const e of pBoxes) if (e.box?.getBoundingClientRect) e.rect = e.box.getBoundingClientRect();
        if (orchE?.box?.getBoundingClientRect) orchE.rect = orchE.box.getBoundingClientRect();
      }
      const dark = isDarkTheme(), toneKey = resolveRimToneKey(dark);
      let compRim = null;
      const drawEntry = (entry, maxR, gradR, vx, vy, minW) => {
        const r = allowReadRect ? entry.rect : null;
        let inRange = false, lx = -9999, ly = -9999;
        if (r && r.width >= 4 && r.height >= 4 && (!minW || r.width >= minW)) {
          const hit = entry.reflectBottomMode
            ? x >= r.left - 240 && x <= r.right + 240 && y >= r.top - 80 && y <= r.bottom + 340
            : x >= r.left - maxR && x <= r.right + maxR && y >= r.top - maxR && y <= r.bottom + maxR;
          if (hit) { inRange = true; lx = x - r.left; ly = y - r.top; }
        }
        if (!entry.mirrorMode && !entry.reflectBottomMode && entry.box?.classList?.contains?.('surface-composer-card')) {
          const st = inRange && Math.abs(ly) < 220 ? Math.min(1, ambientScale * (toneKey === 'mono' ? 0.62 : 1)) * (1 - Math.abs(ly) / 220) : 0;
          if (!compRim || st > compRim.strength) compRim = { localX: lx, strength: st, toneKey, dark };
        }
        if (entry.ctx && paintPrismRimCanvas(entry, inRange, lx, ly, gradR, dark, toneKey, ambientScale)) return;
        const nx = inRange ? `${lx.toFixed(1)}px` : '-9999px', ny = inRange ? `${ly.toFixed(1)}px` : '-9999px';
        if (entry.pxStr !== nx) { entry.pxStr = nx; entry.box.style.setProperty(vx, nx); }
        if (entry.pyStr !== ny) { entry.pyStr = ny; entry.box.style.setProperty(vy, ny); }
      };
      runGuardedMut(() => {
        for (const e of pBoxes) drawEntry(e, 280, 240, '--ag-px', '--ag-py', 0);
        if (orchE) { drawEntry(orchE, 120, 96, '--orch-px', '--orch-py', 10); setCrystalPointerClient?.(x, y); }
      });
      emitComposerRim(compRim);
      armIdle();
    };

    const schedRaf = () => { if (!prismRaf && typeof requestAnimationFrame === 'function') prismRaf = requestAnimationFrame(flushPrismPointer); };
    const cancelPendingRaf = () => { if (prismRaf) { typeof cancelAnimationFrame === 'function' && cancelAnimationFrame(prismRaf); prismRaf = 0; } };

    const SB_SEL = 'aside,[data-testid="sidebar-split"]>div:first-child,[data-testid="conversation-row-sidebar"],[data-testid="project-header"],[data-hover-card-popup]';
    const inSb = (t) => { try { return !!t?.closest?.(SB_SEL); } catch { return false; } };

    const onPointerMove = (ev) => {
      if (isDestroyed() || isWB()) return;
      const x = Number(ev.clientX), y = Number(ev.clientY);
      lastPointerPos.x = x; lastPointerPos.y = y;
      if (isDragSuspended()) { pDirty = true; return; }
      const now = performance.now(), rimOn = isRimOn();
      if (inSb(ev?.target)) {
        if (rimOn && hasLitRim()) { lastPointerPos.x = lastPointerPos.y = -9999; schedRaf(); }
        onPointerActivity?.(now);
        return;
      }
      if (rimOn && !prismRaf) {
        const far = (e, d) => { const r = e.rect; return e.wasCleared && r && (r.width < 4 || r.height < 4 || x < r.left - d || x > r.right + d || y < r.top - d || y > r.bottom + d); };
        const farIdle = !pDirty && pBoxes.length > 0 && now - prismBoxCacheAt <= 6000 && now - lastPrismRectReadAt < 1500 && pBoxes.every((e) => far(e, 360)) && (!orchE || far(orchE, 200));
        if (!farIdle) schedRaf();
      }
      onPointerActivity?.(now);
    };

    const onLeave = () => { if (!isDestroyed() && !isWB()) { lastPointerPos.x = lastPointerPos.y = -9999; schedRaf(); } };
    const onVis = () => {
      if (isDestroyed()) return;
      if (isH()) { cancelPendingRaf(); shrinkRims(1); }
      else if (!isWB() && isRimOn() && lastPointerPos.x >= -1000) { lastPrismDrawAt = 0; schedRaf(); }
    };
    const onWinBlur = () => { if (!isDestroyed()) { cancelPendingRaf(); clearAllRimCanvases(); } };
    const bindEv = (m) => {
      const d = getDoc();
      d?.[m]?.('visibilitychange', onVis);
      d?.documentElement?.[m]?.('pointerleave', onLeave);
      if (typeof window !== 'undefined') window?.[m]?.('blur', onWinBlur);
    };
    bindEv('addEventListener');

    const invalidateMetrics = () => {
      pDirty = true;
      for (const e of pBoxes) e.borderRadius = -1;
      if (isDestroyed()) return;
      runGuardedMut(() => {
        pruneOrphanRimCanvases();
        if (isH()) { cancelPendingRaf(); shrinkRims(1); }
        else if (!isRimOn()) { cancelPendingRaf(); clearAllRimCanvases(true); }
        else if (!isWB() && !isDragSuspended() && lastPointerPos.x >= -1000) { lastPrismDrawAt = 0; schedRaf(); }
      });
    };

    const markDirty = () => {
      pDirty = true;
      if (isDestroyed()) return;
      syncSp(0);
      runGuardedMut(() => {
        pruneOrphanRimCanvases(false);
        if (!isRimOn()) { cancelPendingRaf(); clearAllRimCanvases(true); }
      });
    };

    const teardown = () => {
      cancelPendingRaf(); emitComposerRim(null); bindEv('removeEventListener'); shrinkRims(1); trkCvs.clear();
      if (prismBoxRo) { try { prismBoxRo.disconnect(); } catch {} prismBoxRo = null; }
      obsSet.clear();
      if (stepPlanIo) { try { stepPlanIo.disconnect(); } catch {} stepPlanIo = null; }
      spObs.clear(); spVis.clear();
      for (const s of spOn) { try { ra(s, PB); ra(s, PM); } catch {} }
      spOn.clear();
      const d = getDoc();
      if (d) {
        d.getElementById?.('ag-prism-dyn-vars')?.remove?.();
        d.querySelectorAll?.(CV_S)?.forEach?.((n) => n.remove?.());
        d.querySelectorAll?.(`[${CV_A}]`)?.forEach?.((e) => ra(e, CV_A));
      }
      pBoxes = []; orchE = null;
    };

    return {
      onPointerMove, cancelPendingRaf,
      pauseForOverlay: () => { if (!isDestroyed() && isWB()) { cancelPendingRaf(); clearAllRimCanvases(isH()); } },
      teardown, markDirty, invalidateMetrics, getLastPointerPos: () => lastPointerPos,
    };
  }

  const api = { createPrismRimCanvasController };
  if (typeof module === 'object' && module.exports) module.exports = api;
  G.__agPrismRimCanvas = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);

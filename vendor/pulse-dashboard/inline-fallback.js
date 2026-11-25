(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    try { root.__agPrismTelemetry?.destroy?.(); } catch {}
    if (typeof window !== 'undefined' && window !== root) {
      try { window.__agPrismTelemetry?.destroy?.(); } catch {}
    }
    const api = factory(root);
    root.__agPrismTelemetry = api;
    if (typeof window !== 'undefined') window.__agPrismTelemetry = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function (globalRoot) {
  'use strict';

  const BAR_ID = 'ag-pulse-status-bar';
  const PRISM_BAR_ID = 'ag-prism-pulse-bar';
  const PRISM_BAR_ATTR = 'data-ag-prism-pulse-bar';
  const FALLBACK_ATTR = 'data-ag-prism-fallback';
  const HID_ATTR = 'data-ag-prism-hidden';
  const METRICS_BINDING = '__agPrismMetricsCall';
  const WAIT_MS = 1500;
  const GRACE_MS = 3500;
  const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const TIER_ATTR = 'data-t';
  const TIER_STYLE_ATTR = 'data-pt';
  const TIER_VALS = ['0', '1', '1 2', '1 2 3', '1 2 3 4', '1 2 3 4 5'];
  const expCss = (s) => {
    const t = ['var(--e)', ':host([data-t~="', '[data-card="', 'color-mix(in srgb,var(--c) ', 'overflow:hidden;white-space:nowrap;', 'transform:scale(.9) translateX(4px);pointer-events:none!important', 'border-radius:', 'background:'];
    for (let i = 0; i < t.length; i++) s = s.split('$' + i).join(t[i]);
    return s.replace(/!(?!important)/g, '!important');
  };
  const TIER_CSS = expCss('[hidden]{display:none!}:host{--e:cubic-bezier(.22,1,.36,1);--c:var(--pv-tint,var(--pulse-ring,#3186ff))}.bar{transition:gap .28s $0}.bar>:is(.chip,.dot){$4max-width:132px;opacity:1;transform-origin:right;transition:max-width .28s $0,opacity .17s ease-out,padding .28s $0,margin .28s $0,gap .28s $0,transform .28s $0,background .16s,border-color .22s,box-shadow .22s}.bar>[data-card="cache"]{max-width:240px}.bar>$2context"]{max-width:136px}.bar>.dot{max-width:16px}:where(.bar>.chip>*:not(.context-ring):not(svg)){$4max-width:108px;flex-shrink:0;opacity:1;transform-origin:right;transition:max-width .28s $0,opacity .17s ease-out,margin .28s $0,padding .28s $0,transform .28s $0}.context-ring{will-change:transform;transition:transform .28s $0}$12"]) :is(.cache-total,.sub-badge,$2cache"] .dim,.countdown),$14"]) $2context"] .context-label,$15"]) $2context"]>:not(.context-ring){max-width:0!important;flex-shrink:1!important;opacity:0!;margin:0!;padding:0!;$5}$13"]) .bar>:is($2cache"],$2speed"),$14"]) .bar>:is($2week"],.dot),$15"]) .bar>$2five"]{max-width:0!;min-width:0!;flex-shrink:1!;opacity:0!;padding:0!;margin:0!;gap:0!;border:0!;$5}$14"]) .bar{gap:0}$15"]) $2context"]{width:26px!;min-width:26px!;height:26px!;padding:0!;gap:0!;$6999px!;justify-content:center!;$7$39%,transparent);border:1px solid $328%,rgba(148,163,184,.28))}$15"]) $2context"]:is(:hover,[aria-expanded="true"]){$7$317%,transparent);border-color:$348%,rgba(148,163,184,.4));box-shadow:0 0 10px -2px $345%,transparent)}$15"]) .context-ring{transform:scale(1.27)}:host([data-pv-motion="off"]) :is(.bar,.bar *),:host-context(html[data-ag-cs-resizing="1"]) :is(.bar,.bar *){transition:none!}@media (prefers-reduced-motion:reduce){:is(.bar,.bar *){transition:none!}}');

  const SHADOW_CSS = expCss(':host,*,::before,::after{box-sizing:border-box}:host,.bar,.chip{display:inline-flex;align-items:center}:host{flex:0 0 auto;position:relative;font:11px/16px Inter,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--foreground,#dae2f0);user-select:none;z-index:20}:host([hidden]),.sub-badge[hidden],.card[hidden],.footnote[hidden],.footnote:empty,:host([data-layout="blocked"])>.bar{display:none!}:host([data-layout="blocked"]){position:fixed!;left:-9999px!;top:-9999px!;width:0!;height:0!;margin:0!;padding:0!;overflow:hidden!;visibility:hidden!;pointer-events:none!}.bar{gap:3px}.chip{gap:3.5px;height:24px;padding:0 6px;border:0;$66px;$7transparent;color:inherit;font:inherit;cursor:pointer;font-variant-numeric:tabular-nums;transition:background .15s,color .15s}.chip:hover,.chip[aria-expanded="true"]{$7rgba(128,138,158,.12)}.chip svg{width:12px;height:12px;stroke:currentColor;stroke-width:1.5;fill:none;opacity:.75;flex:none}.chip[data-warn="1"] strong{color:#f59e0b}.chip[data-warn="2"] strong{color:#f87171}.dim{opacity:.64;font-size:10px}.sub-badge{font-size:10px;opacity:.78;color:var(--primary,#38bdf8);font-weight:500}.context-ring{width:11px;height:11px;$650%;$7conic-gradient(var(--pv-tint,#3186ff) var(--used-angle,36deg),rgba(148,163,184,.28) 0);display:inline-block;position:relative;flex:none}.context-ring::after{content:"";position:absolute;inset:2.2px;$650%;$7var(--card,#141720)}.card{position:absolute;right:0;left:auto;bottom:calc(100% + 10px);width:min(304px,calc(100vw - 24px));padding:12px 13px;$610px;border:1px solid rgba(148,163,184,.22);$7var(--card,#12151ef5);color:var(--foreground,#eef1f7);box-shadow:0 16px 40px rgba(0,0,0,.36);z-index:9999}$14"]) .card{right:-84px;width:min(296px,calc(100vw - 32px))}.heading{display:flex;align-items:center;justify-content:space-between;gap:6px;font-size:11px;font-weight:600;margin-bottom:6px}.heading>span:first-child{white-space:nowrap}#context-summary{display:block;font-size:13px;font-weight:600;margin-bottom:2px}#context-tokens{margin:0 0 8px;font-size:11px;opacity:.76}.track{height:5px;$6999px;$7rgba(148,163,184,.18);overflow:hidden;margin:6px 0 10px}.track>i{display:block;height:100%;width:0%;$6999px;$7linear-gradient(90deg,#2563eb,#38bdf8)}dl{display:grid;grid-template-columns:auto 1fr;gap:4px 10px;margin:8px 0;font-size:11px}dt{opacity:.64}dd{margin:0;text-align:right;font-weight:500;$4text-overflow:ellipsis}.footnote{margin:6px 0 0;font-size:10px;opacity:.58}') + TIER_CSS;

  const isFin = (v) => typeof v === 'number' && Number.isFinite(v);
  const FB_ROWS = {
    'zh-CN': '缓存|吞吐速率|首字延迟|最近速率|上下文窗口|当前模型|已用|剩余|代理',
    'zh-TW': '快取|吞吐速率|首字延遲|最近速率|上下文視窗|目前模型|已用|剩餘|代理',
    yue: '快取|吞吐速率|首字延遲|最近速率|上下文視窗|目前模型|已用|剩低|代理',
    en: 'Cache|Throughput|TTFT|Latest Rate|Context Window|Active Model|used|free| sub',
    ja: 'キャッシュ|スループット|初回応答|最新速度|コンテキスト|現在のモデル|使用|残り| sub',
  };
  const FB_I18N = Object.fromEntries(
    Object.entries(FB_ROWS).map(([lk, s]) => {
      const r = s.split('|');
      return [
        lk,
        {
          cache: r[0], speedHeading: r[1], ttft: r[2], latestRate: r[3],
          ctxHeading: r[4], curModel: r[5],
          summary: (p, rem) => `${p}% ${r[6]} · ${rem}% ${r[7]}`,
          agents: (n) => `· ${n}${r[8]}`,
        },
      ];
    })
  );

  function fmtTok(n) {
    if (!isFin(n) || n < 0) return '—';
    if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
    if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
    return String(Math.round(n));
  }

  function mk(doc, tag, attrs, kids) {
    const el = doc.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null) continue;
        if (k === 'text') el.textContent = String(v);
        else if (k === 'cls') el.className = String(v);
        else if (k === 'hidden') el.hidden = Boolean(v);
        else el.setAttribute(k, String(v));
      }
    }
    if (kids) for (const c of kids) if (c) el.appendChild(c);
    return el;
  }

  let reqSeq = 0;

  function createTelemetryController(envOpts) {
    const gW = () => (envOpts && envOpts.window) || (typeof window !== 'undefined' ? window : globalRoot);
    const gD = () => (envOpts && envOpts.document) || gW()?.document || null;

    let mode = 'auto', waitTm = null, rescTm = null, pollTm = null, fbEl = null, srEl = null;
    let hasHost = false, yielded = false, lastSig = '', detAt = 0;
    let docOff = null, popOff = null, lastSnap = null, mApi = null, mRes = null, seatObs = null, healTm = null;
    let locSnap = null, locAt = 0, expLang = '';
    let tierRo = null, tierEl = null, tierRaf = 0, curTier = 0, pendTierW = 0, hasPendTierW = false, lastTv = '', winResOff = null;
    let winBlur = false, pollSusp = false, blurOff = null, blurObs = null;
    const pend = new Map();

    const TIER_CUTS = [640, 515, 450, 395, 345], FT_SEL = '.agy-composer-footer,[data-testid="input-box-bottom-toolbar"]';
    const clrTier = () => {
      try { if (tierRaf) gW()?.cancelAnimationFrame?.(tierRaf); tierRo?.disconnect(); winResOff?.(); tierEl?.removeAttribute?.(TIER_ATTR); } catch {}
      tierRaf = 0; tierRo = winResOff = tierEl = null; curTier = 0; pendTierW = 0; hasPendTierW = false; lastTv = '';
      for (const b of gD()?.querySelectorAll?.(`#${PRISM_BAR_ID},[${PRISM_BAR_ATTR}],#${BAR_ID},[id^="${BAR_ID}"],[data-ag-pulse-bar]`) || []) {
        try { b.removeAttribute?.(TIER_ATTR); b.shadowRoot?.querySelector?.(`style[${TIER_STYLE_ATTR}="1"]`)?.remove?.(); } catch {}
      }
    };
    const applyTierNow = (force = false) => {
      tierRaf = 0;
      const doc = gD(), ft = mode !== 'off' && (tierEl?.isConnected ? tierEl : doc?.querySelector?.(FT_SEL));
      const w = hasPendTierW ? pendTierW : ft?.getBoundingClientRect?.().width;
      pendTierW = 0;
      hasPendTierW = false;
      if (!ft || !isFin(w) || w <= 0) return;
      let t = curTier;
      while (t < 5 && w < TIER_CUTS[t]) t++;
      while (t > 0 && w >= TIER_CUTS[t - 1] + 12) t--;
      const tv = TIER_VALS[(curTier = t)] || '0';
      if (!force && tv === lastTv && ft.getAttribute?.(TIER_ATTR) === tv) return;
      lastTv = tv;
      if (ft.getAttribute?.(TIER_ATTR) !== tv) ft.setAttribute?.(TIER_ATTR, tv);
      for (const b of fbEl ? [fbEl, ...findExtBars(doc)] : findExtBars(doc)) {
        if (!b || b.getAttribute?.(HID_ATTR) === '1') continue;
        if (b.getAttribute?.(TIER_ATTR) !== tv) b.setAttribute?.(TIER_ATTR, tv);
        if (b !== fbEl && b.shadowRoot && !b.shadowRoot.querySelector?.(`style[${TIER_STYLE_ATTR}="1"]`)) {
          try { const st = doc.createElement('style'); st.setAttribute(TIER_STYLE_ATTR, '1'); st.textContent = TIER_CSS; b.shadowRoot.appendChild(st); } catch {}
        }
      }
    };
    const schedTier = (entries) => {
      if (entries && typeof entries.length === 'number') {
        let rw = NaN;
        for (let i = entries.length - 1; i >= 0; i--) {
          const w0 = entries[i]?.contentRect?.width;
          if (isFin(w0) && w0 >= 0) { rw = w0; break; }
        }
        if (isFin(rw)) { pendTierW = rw; hasPendTierW = true; }
      } else {
        hasPendTierW = false;
      }
      if (!tierRaf && mode !== 'off') { const w = gW(); tierRaf = w?.requestAnimationFrame ? w.requestAnimationFrame(() => applyTierNow(false)) : (applyTierNow(false), 0); }
    };
    const ensTierObs = () => {
      const w = gW(), ft = mode !== 'off' && gD()?.querySelector?.(FT_SEL);
      if (!w || !ft) return;
      const changed = tierEl !== ft;
      if (changed) {
        try { tierRo?.disconnect(); } catch {} tierRo = null; tierEl = ft; lastTv = '';
        if (typeof w.ResizeObserver === 'function') { try { tierRo = new w.ResizeObserver(schedTier); tierRo.observe(ft); } catch {} }
      }
      if (!winResOff && typeof w.addEventListener === 'function') { const onR = () => schedTier(null); w.addEventListener('resize', onR, { passive: true }); winResOff = () => w.removeEventListener?.('resize', onR); }
      if (changed || !lastTv || !tierRo) applyTierNow(true);
    };

    const bindHook = () => {
      const w = gW();
      if (!w) return;
      if (!mRes) {
        mRes = (id, pl) => {
          const it = pend.get(id);
          if (!it) return;
          clearTimeout(it.timer);
          pend.delete(id);
          if (pl && pl.connection !== 'local-estimate' && pl.groups?.length > 0) {
            const keepSpeed = !pl.speed && lastSnap?.speed;
            const keepConvs = !pl.conversations?.length && lastSnap?.conversations?.length;
            lastSnap = keepSpeed || keepConvs
              ? { ...pl, ...(keepSpeed ? { speed: lastSnap.speed } : {}), ...(keepConvs ? { conversations: lastSnap.conversations } : {}) }
              : pl;
          }
          it.resolve(pl);
        };
      }
      if (w.__agPrismMetricsResolve !== mRes) w.__agPrismMetricsResolve = mRes;
    };

    const clrWait = () => {
      if (waitTm !== null) { clearTimeout(waitTm); waitTm = null; }
      if (rescTm !== null) { clearTimeout(rescTm); rescTm = null; }
    };
    const clrPoll = () => {
      if (pollTm !== null) { clearInterval(pollTm); pollTm = null; }
    };
    const isBlur = () => { const d = gD(); return Boolean(d?.hidden || d?.documentElement?.getAttribute?.('data-ag-cs-win-blur') === '1' || winBlur); };
    const clrBlur = () => { try { blurOff?.(); blurObs?.disconnect?.(); } catch {} blurOff = blurObs = null; winBlur = pollSusp = false; };
    const startPoll = () => {
      clrPoll();
      if (!fbEl || mode === 'off') return;
      if (isBlur()) { pollSusp = true; return; }
      pollSusp = false;
      pollTm = setInterval(() => { isBlur() ? (pollSusp = true, clrPoll()) : void refresh(); }, 4000);
      pollTm?.unref?.();
    };
    const syncBlur = (res) => {
      if (!fbEl || mode === 'off') { clrPoll(); pollSusp = false; return; }
      if (isBlur()) { pollSusp = true; clrPoll(); return; }
      const was = pollSusp; pollSusp = false;
      if (pollTm === null) startPoll();
      if (was && res) void refresh();
    };
    const ensBlur = () => {
      const w = gW(), d = gD();
      if (!w || !d) return;
      if (!blurOff && typeof w.addEventListener === 'function') {
        const onB = () => { winBlur = true; syncBlur(false); }, onF = () => { winBlur = false; syncBlur(true); }, onV = () => { if (!gD()?.hidden) winBlur = false; syncBlur(!gD()?.hidden); };
        w.addEventListener('blur', onB); w.addEventListener('focus', onF); d.addEventListener?.('visibilitychange', onV);
        blurOff = () => { w.removeEventListener?.('blur', onB); w.removeEventListener?.('focus', onF); d.removeEventListener?.('visibilitychange', onV); };
      }
      if (!blurObs && typeof w.MutationObserver === 'function' && d.documentElement) {
        try { blurObs = new w.MutationObserver(() => { const b = gD()?.documentElement?.getAttribute?.('data-ag-cs-win-blur') === '1'; if (!b) winBlur = false; syncBlur(!b); }); blurObs.observe(d.documentElement, { attributes: true, attributeFilter: ['data-ag-cs-win-blur'] }); } catch {}
      }
    };
    const clrSeat = () => {
      if (healTm !== null) { clearTimeout(healTm); healTm = null; }
      if (seatObs) { try { seatObs.disconnect(); } catch {} seatObs = null; }
      if (popOff) { try { popOff(); } catch {} popOff = null; }
      clrTier();
    };

    const isConv = (doc, w, anc) => {
      if (!doc || anc?.closest?.('.agy-home') || doc.querySelector?.('.agy-home, [data-testid="home-greeting"]')) return false;
      const pn = w?.location?.pathname;
      if (typeof pn === 'string' && pn && !/\/c\/[0-9a-f-]{8,}/i.test(pn)) {
        if (!doc.querySelector?.('[data-testid="conversation-view"]') && !anc?.closest?.('[data-cascade-id]') && !doc.querySelector?.('[data-cascade-id]')) {
          return false;
        }
      }
      return true;
    };

    const HIDE_PROPS = 'position:fixed|left:-9999px|top:-9999px|width:1px|height:1px|opacity:0|pointer-events:none|visibility:hidden|overflow:hidden'.split('|').map((s) => s.split(':'));

    const findExtBars = (doc) => {
      if (!doc) return [];
      const seen = new Set(), out = [], add = (el) => { if (el && !seen.has(el)) { seen.add(el); out.push(el); } };
      if (typeof doc.querySelectorAll === 'function') {
        try {
          const s = doc.querySelectorAll('#' + BAR_ID + ',[id^="' + BAR_ID + '"],[data-ag-pulse-bar="true"]');
          for (let i = 0; i < s.length; i++) add(s[i]);
        } catch {}
      }
      if (typeof doc.getElementById === 'function') add(doc.getElementById(BAR_ID));
      return out;
    };

    const purgeOrphans = (doc, keep = null) => {
      if (!doc || typeof doc.querySelectorAll !== 'function') return;
      const list = doc.querySelectorAll('[' + FALLBACK_ATTR + '="1"], #' + PRISM_BAR_ID + ', [' + PRISM_BAR_ATTR + '="true"]');
      for (let i = 0; i < list.length; i++) {
        if (list[i] !== keep) try { list[i].remove(); } catch {}
      }
    };

    const isConn = (doc, el) => {
      if (!el || el.isConnected === false) return false;
      if (el.isConnected === true) return true;
      if (!el.parentNode && !el.parentElement) return false;
      if (doc && typeof doc.getElementById === 'function' && el.id && typeof doc.querySelectorAll !== 'function') {
        const b = doc.getElementById(el.id);
        if (b && b !== el) return false;
      }
      return true;
    };

    const usableExt = (doc, b) => {
      if (!b || b.getAttribute?.(FALLBACK_ATTR) === '1' || !isConn(doc, b)) return false;
      if (b.getAttribute?.(HID_ATTR) === '1' || b.getAttribute?.('data-layout') === 'blocked' || b.hidden === true) return false;
      if (b.style && b.style.display === 'none') return false;
      if (doc && doc.body && (b.parentElement === doc.body || b.parentNode === doc.body)) return false;
      if (b.closest?.('.agy-home')) return false;
      return true;
    };

    let extGuardHeld = false;

    const hasExt = (barsArg, knownConv = false) => {
      const w = gW(), doc = gD();
      if (!w || !doc || (!knownConv && !isConv(doc, w))) return false;
      const bars = barsArg || findExtBars(doc);
      let sawDead = false;
      for (let i = 0; i < bars.length; i++) {
        const b = bars[i];
        if (!b || b.getAttribute?.(FALLBACK_ATTR) === '1' || !isConn(doc, b) || b.getAttribute?.(HID_ATTR) === '1') continue;
        if (usableExt(doc, b)) { detAt = 0; return true; }
        sawDead = true;
      }
      if (sawDead) return false;
      const sig = [
        w.__agPulseRuntimeOwner ? String(w.__agPulseRuntimeOwner) : '',
        w.__agPulseRuntimeBridge ? 'b' : '',
        w.__agPulseInlineInstalled && !extGuardHeld ? '1' : '',
        w.agPulseHost && !w.agPulseHost.__prismFallback ? 'h' : '',
      ].join('|');
      if (sig !== '|||') {
        const now = Date.now();
        if (sig !== lastSig) { lastSig = sig; detAt = now; return true; }
        if (!detAt) detAt = now;
        return now - detAt < GRACE_MS;
      }
      lastSig = '';
      detAt = 0;
      return false;
    };

    const showExt = () => {
      if (extGuardHeld) {
        extGuardHeld = false;
        const w = gW();
        if (w && !w.__agPulseDispose) w.__agPulseInlineInstalled = false;
      }
      const bars = findExtBars(gD());
      for (let i = 0; i < bars.length; i++) {
        const b = bars[i];
        if (b && b.getAttribute?.(HID_ATTR) === '1') {
          b.removeAttribute(HID_ATTR);
          if (b.style) {
            if (typeof b.style.removeProperty === 'function') {
              b.style.removeProperty('display');
              for (let j = 0; j < HIDE_PROPS.length; j++) b.style.removeProperty(HIDE_PROPS[j][0]);
            } else {
              b.style.opacity = '';
              b.style.position = '';
              b.style.pointerEvents = '';
            }
          }
        }
      }
    };

    const hideExt = (disposeExt = false) => {
      if (disposeExt) {
        const w = gW();
        if (w) {
          try { w.__agPulseDispose?.(); } catch {}
          w.__agPulseInlineInstalled = true;
          extGuardHeld = true;
        }
      }
      const bars = findExtBars(gD());
      for (let i = 0; i < bars.length; i++) {
        const b = bars[i];
        if (b && b.getAttribute?.(FALLBACK_ATTR) !== '1') {
          b.setAttribute(HID_ATTR, '1');
          if (b.style) {
            b.style.removeProperty?.('display');
            if (typeof b.style.setProperty === 'function') {
              for (let j = 0; j < HIDE_PROPS.length; j++) b.style.setProperty(HIDE_PROPS[j][0], HIDE_PROPS[j][1], 'important');
            } else {
              b.style.position = 'fixed';
              b.style.left = '-9999px';
              b.style.opacity = '0';
              b.style.pointerEvents = 'none';
            }
          }
        }
      }
    };

    const ensBridge = () => {
      const w = gW();
      if (!w) return;
      bindHook();
      if (!mApi) {
        mApi = { __prismOwned: true, getMetrics: (inp) => reqSnap(inp), getLatestSnapshot: () => lastSnap };
      }
      w.__agPrismMetricsBridge = mApi;
    };

    const rmHost = () => {
      const w = gW();
      if (hasHost && w?.agPulseHost?.__prismFallback) delete w.agPulseHost;
      hasHost = false;
    };

    const ensHost = () => {
      const w = gW();
      if (!w) return;
      ensBridge();
      if (!w.agPulseHost || typeof w.agPulseHost.getMetrics !== 'function') {
        w.agPulseHost = {
          __prismFallback: true,
          getMetrics: (inp) => reqSnap(inp),
          getLatestSnapshot: () => lastSnap,
          getPreferences: () => Promise.resolve({ language: 'zh-CN' }),
          setPreferences: (v) => Promise.resolve(v || {}),
          report: () => {},
        };
        hasHost = true;
      }
    };

    const unmountFb = (keepBridge = false) => {
      clrWait();
      clrPoll();
      clrBlur();
      if (docOff) { try { docOff(); } catch {} docOff = null; }
      if (!keepBridge) {
        clrSeat();
        for (const it of pend.values()) { clearTimeout(it.timer); it.resolve(null); }
        pend.clear();
        rmHost();
      }
      if (fbEl) {
        try {
          if (srEl) {
            const xc = srEl.getElementById('context-card'), sc = srEl.getElementById('speed-card');
            if (xc) xc.hidden = true;
            if (sc) sc.hidden = true;
          }
          gW()?.__agPulseExternalBridge?.({ event: 'dispose' });
        } catch {}
        try { fbEl.remove(); } catch {}
      }
      purgeOrphans(gD(), null);
      fbEl = null;
      srEl = null;
    };

    const detCid = (node) => {
      try {
        const cid = node?.closest?.('[data-cascade-id]')?.getAttribute?.('data-cascade-id');
        if (cid && GUID_RE.test(cid)) return cid;
        const m = gW()?.location?.pathname?.match?.(/\/c\/([0-9a-f-]{36})/i);
        return m ? m[1] : null;
      } catch { return null; }
    };

    const estSnap = () => {
      const now = Date.now();
      if (locSnap && now - locAt < 5000) return locSnap;
      const doc = gD();
      let model = 'Gemini 4', chars = 0;
      try {
        const tr = doc?.querySelector?.('[data-testid="model-selector-trigger"]');
        const lb = tr?.getAttribute?.('aria-label') || tr?.textContent?.trim();
        if (lb) model = lb;
        const vw = doc?.querySelector?.('[data-testid="conversation-view"]');
        if (vw && typeof vw.querySelectorAll === 'function') {
          const ts = vw.querySelectorAll('[data-testid="planner-response-text"],[data-testid="agent-response"],[data-testid="user-message-bubble"]');
          if (ts?.length > 0) {
            const n = Math.min(4, ts.length);
            let s = 0;
            for (let i = ts.length - n; i < ts.length; i++) s += (ts[i].textContent || '').length;
            chars = Math.round((s / n) * ts.length);
          }
        } else if (typeof vw?.textContent === 'string') chars = vw.textContent.length;
      } catch {}
      const maxTokens = 512000, usedTokens = Math.max(4200, Math.min(maxTokens, Math.round(chars / 3.2) + 8400));
      const usedFraction = Math.min(0.98, usedTokens / maxTokens);
      locAt = now;
      locSnap = {
        connection: 'local-estimate',
        speed: { model, tps: null, latestTps: null, ttftSeconds: null, rounds: 0, cacheHitRate: null, totalTokens: usedTokens, context: { model, usedTokens, maxTokens, usedFraction, sampledAt: now } },
        groups: [],
      };
      return locSnap;
    };

    const reqSnap = (inp) => {
      const w = gW();
      bindHook();
      const si = inp && typeof inp === 'object' ? { ...inp } : {};
      if (si.usageSync) delete si.usageSync;
      if (w && typeof w[METRICS_BINDING] === 'function') {
        return new Promise((resolve) => {
          if (pend.size >= 6) { resolve(lastSnap || estSnap()); return; }
          const id = ++reqSeq;
          const timeoutMs = si.force || si.quotaRefresh ? 10000 : 4500;
          const timer = setTimeout(() => { pend.delete(id); resolve(lastSnap || estSnap()); }, timeoutMs);
          pend.set(id, { resolve, timer });
          try {
            w[METRICS_BINDING](JSON.stringify({ id, input: si }));
          } catch {
            clearTimeout(timer);
            pend.delete(id);
            resolve(lastSnap || estSnap());
          }
        });
      }
      return Promise.resolve(estSnap());
    };

    const gStr = () => FB_I18N[gD()?.documentElement?.getAttribute?.('data-ag-cs-lang') || expLang || 'zh-CN'] || FB_I18N['zh-CN'];
    const syncLbls = () => {
      if (!srEl) return;
      const t = gStr(), ns = srEl.querySelectorAll?.('[data-fb-i18n]') || [];
      for (let i = 0; i < ns.length; i++) {
        const k = ns[i].getAttribute('data-fb-i18n');
        if (k && typeof t[k] === 'string' && ns[i].textContent !== t[k]) ns[i].textContent = t[k];
      }
    };

    const qRem = (w) => {
      if (!w || w.available === false || w.disabled) return null;
      if (w.expired) return 1;
      const v = Number(w.remaining ?? w.remainingFraction);
      return isFin(v) && v >= 0 && v <= 1 ? v : null;
    };
    const pickQuotaGroup = (groups, model) => {
      if (!Array.isArray(groups) || groups.length === 0) return null;
      const chosen = gW()?.__agCsUsageCore?.chooseQuotaGroup?.(groups, model);
      if (chosen) return chosen;
      const ml = String(model || '');
      const key = /argon/i.test(ml)
        ? 'argon'
        : /claude|anthropic|sonnet|opus|haiku|gpt/i.test(ml)
          ? 'claude'
          : 'gemini';
      return (
        groups.find((g) => {
          const s = `${g?.id || ''} ${g?.name || ''}`;
          if (key === 'argon') return /argon|wtu/i.test(s);
          if (key === 'claude') return /claude|anthropic|gpt|openai|\b3p\b/i.test(s);
          return /gemini|google/i.test(s);
        }) ||
        groups.find((g) => /gemini|google/i.test(`${g?.id || ''} ${g?.name || ''}`)) ||
        groups[0] ||
        null
      );
    };

    const applySnap = (snap) => {
      if (snap && typeof snap === 'object') lastSnap = snap;
      if (!srEl || !fbEl) return;
      const sp = snap?.speed || {}, ctx = sp.context || {};
      const maxTok = ctx.maxTokens > 0 ? ctx.maxTokens : 512000;
      const uf = isFin(ctx.usedFraction) ? Math.max(0, Math.min(1, ctx.usedFraction)) : 0.04;
      const uTok = isFin(ctx.usedTokens) ? ctx.usedTokens : Math.round(uf * maxTok);
      const pct = Math.round(uf * 100), rem = Math.max(0, 100 - pct);
      const model = ctx.model || sp.model || 'Antigravity Model';
      const tot = sp.taskUsage?.total?.totalTokens ?? sp.tokens?.totalTokens ?? sp.cache?.totalTokens ?? sp.totalTokens ?? 0;
      const hit = isFin(sp.cache?.hitRate) ? sp.cache.hitRate : sp.cacheHitRate;
      const subs = Number(sp.taskUsage?.subagents || 0);
      const proc = snap?.collection?.state === 'processing';

      if (proc) fbEl.setAttribute('data-collection', 'processing');
      else fbEl.removeAttribute('data-collection');

      const t = gStr();
      syncLbls();
      const sT = (id, v) => { const e = srEl.getElementById(id), s = String(v); if (e && e.textContent !== s) e.textContent = s; };
      sT('rounds', sp.rounds > 0 ? `${sp.rounds}r` : '—');
      sT('tps', isFin(sp.tps) && sp.tps > 0 ? sp.tps.toFixed(1) : '—');
      sT('cache-total', `${fmtTok(tot > 0 ? tot : uTok)} tok`);
      sT('cache-rate', isFin(hit) ? `${(hit * 100).toFixed(1)}%` : '—');

      const sb = srEl.getElementById('subagent-badge');
      if (sb) {
        if (subs > 0) {
          sb.hidden = false;
          const bt = t.agents(subs);
          if (sb.textContent !== bt) sb.textContent = bt;
        } else sb.hidden = true;
      }

      sT('context-percent', `${pct}%`);
      sT('ttft', typeof sp.ttftSeconds === 'number' ? `${sp.ttftSeconds.toFixed(2)}s` : '—');
      sT('latest-rate', typeof sp.latestTps === 'number' ? `${sp.latestTps.toFixed(1)} tok/s` : '—');
      sT('context-summary', t.summary(pct, rem));
      sT('context-tokens', `${fmtTok(uTok)} / ${fmtTok(maxTok)} tok`);
      sT('context-model', model);
      const gs = Array.isArray(snap?.groups) ? snap.groups : [];
      const qg = pickQuotaGroup(gs, model);
      const r5 = qRem(qg?.windows?.['5h'] || qg?.fiveHour);
      const rW = qRem(qg?.windows?.weekly || qg?.weekly);
      const fmtPct = (v) => (v === null ? '—' : `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`);
      sT('five-balance', fmtPct(r5));
      sT('week-balance', fmtPct(rW));
      const updQChip = (cardName, v) => {
        const el = srEl.querySelector?.(`[data-card="${cardName}"]`);
        if (!el) return;
        el.hidden = gs.length === 0 && v === null;
        el.setAttribute('data-warn', v === null ? '0' : v <= 0.15 ? '2' : v <= 0.35 ? '1' : '0');
      };
      updQChip('five', r5);
      updQChip('week', rW);
      const noteEl = srEl.getElementById('context-note');
      if (noteEl) {
        noteEl.hidden = true;
        if (noteEl.textContent) noteEl.textContent = '';
      }

      const fl = srEl.getElementById('context-fill');
      if (fl?.style) fl.style.width = `${pct}%`;
      const rg = srEl.getElementById('context-ring');
      rg?.style?.setProperty?.('--used-angle', `${Math.round(uf * 360)}deg`);
      try { gW()?.__agPulseExternalBridge?.({ event: 'render', data: snap }); } catch {}
    };

    const isHidAnc = (el) => !el || el.hidden === true || Boolean(el.closest?.('.agy-home, aside, [data-testid="conversation-list-sidebar"], [data-testid="conversation-row-sidebar"], [hidden], [inert]'));
    const isTopWrap = (p) => {
      if (!p) return true;
      const c = String(p.className || '').trim();
      return Boolean(c && /\bmin-w-0\b/.test(c) && !/\b(?:flex|inline-flex|agy-composer-footer)\b/.test(c));
    };
    const findAnchor = (doc, knownConv = false) => {
      if (!doc) return null;
      const w = gW();
      if (!knownConv && !isConv(doc, w)) return null;
      const ft = doc.querySelector?.('.agy-composer-footer, [data-testid="input-box-bottom-toolbar"]');
      if (ft && !isHidAnc(ft) && (knownConv || isConv(doc, w, ft))) return ft;
      const mb = doc.querySelector?.('[data-testid="model-selector-trigger"]');
      return mb?.parentElement && !isHidAnc(mb) && !isTopWrap(mb.parentElement) && (knownConv || isConv(doc, w, mb)) ? mb.parentElement : null;
    };

    const seatIn = (anc, el) => {
      if (!anc || !el) return false;
      const kids = anc.children || [];
      if (/\bagy-composer-footer\b/.test(String(anc.className || '')) && kids.length >= 2 && typeof anc.insertBefore === 'function') {
        const last = kids[kids.length - 1];
        if (last && last !== el) { anc.insertBefore(el, last); return true; }
      }
      anc.appendChild(el);
      return true;
    };

    const seatFb = (doc) => {
      if (!fbEl || !doc) return false;
      const anc = findAnchor(doc);
      if (!anc) { unmountFb(true); return false; }
      if (!isConn(doc, fbEl) || fbEl.parentElement !== anc) {
        try { seatIn(anc, fbEl); } catch { return false; }
      }
      return true;
    };

    let lastHealAt = 0;
    const IGN_STREAM_SEL =
      '[data-testid="autoscroll-viewport"],[data-testid="planner-response-text"],[data-testid="agent-response"],[data-markdown-root],[data-testid="background-task-command"],[data-testid="running-items-card"],aside,[data-op-thought="1"],.ag-prism-thought-overlay,.ag-cs-conv-aura-host,.ag-cs-crab,.ag-cs-prism-rim-cv,.ag-anim-icon,.ag-cs-thinking-spark,[data-agy-hans-ui],#agy-theme-switcher,#agy-theme-menu,#antigravity-quota-widget,#antigravity-translation-audit';
    const isIgnoredStreamNode = (t) => {
      const el = t?.nodeType === 1 ? t : t?.parentElement;
      return Boolean(
        el?.closest &&
        !el.closest('.agy-composer-footer,[data-testid="input-box-bottom-toolbar"]') &&
        el.closest(IGN_STREAM_SEL)
      );
    };

    const ensSeatObs = () => {
      const w = gW(), doc = gD();
      if (!w || !doc || mode === 'off') return;
      const runHeal = () => {
        healTm = null;
        lastHealAt = Date.now();
        if (mode === 'off') return;
        const d = gD(), wn = gW();
        if (!d || !wn) return;
        if (!isConv(d, wn)) {
          yielded = false;
          if (fbEl) unmountFb(true);
          hideExt(false);
          return;
        }
        if (mode === 'on') {
          hideExt(true);
          if (fbEl) {
            if (!isConn(d, fbEl) && seatFb(d)) try { wn.__agPulseExternalBridge?.({ event: 'mount' }); } catch {}
            ensTierObs();
          } else if (findAnchor(d, true)) {
            mountFb();
          }
          return;
        }
        showExt();
        if (hasExt(null, true)) {
          yielded = true;
          if (fbEl) unmountFb(true);
          ensTierObs();
          return;
        }
        if (fbEl) {
          if (!isConn(d, fbEl) && seatFb(d)) try { wn.__agPulseExternalBridge?.({ event: 'mount' }); } catch {}
          ensTierObs();
        } else if (waitTm === null && findAnchor(d, true)) {
          mountFb();
        }
      };
      const schedHeal = (fast = false) => {
        if (mode === 'off' || healTm !== null) return;
        const wait = fast || Date.now() - lastHealAt >= 180 ? 45 : 180;
        healTm = setTimeout(runHeal, wait);
        healTm?.unref?.();
      };
      if (!seatObs && typeof w.MutationObserver === 'function' && (doc.body || doc.documentElement)) {
        seatObs = new w.MutationObserver((recs) => {
          if (mode === 'off' || healTm !== null) return;
          if (Array.isArray(recs) && recs.length > 0) {
            let rel = false;
            for (let i = 0; i < recs.length; i++) {
              if (!isIgnoredStreamNode(recs[i]?.target)) { rel = true; break; }
            }
            if (!rel) return;
          }
          const inC = isConv(doc, w);
          let bars = null;
          const gB = () => bars || (bars = findExtBars(doc));
          if (!inC) {
            if (fbEl || gB().some((b) => b && b.getAttribute?.(HID_ATTR) !== '1')) schedHeal(true);
            return;
          }
          if (fbEl) {
            if (!isConn(doc, fbEl)) {
              schedHeal(false);
              return;
            }
          } else if (waitTm === null && !hasExt(gB(), true) && findAnchor(doc, true)) {
            schedHeal(true);
            return;
          }
          if ((tierEl && !tierEl.isConnected) || gB().some((b) => b && b.getAttribute?.(HID_ATTR) !== '1' && b.shadowRoot && !b.shadowRoot.querySelector?.(`style[${TIER_STYLE_ATTR}="1"]`))) {
            schedHeal(false);
            return;
          }
          if (mode === 'on' && gB().some((b) => b && b.getAttribute?.(FALLBACK_ATTR) !== '1' && b.getAttribute?.(HID_ATTR) !== '1')) {
            schedHeal(false);
          }
        });
        try { seatObs.observe(doc.body || doc.documentElement, { childList: true, subtree: true }); } catch {}
      }
      if (!popOff && typeof w.addEventListener === 'function') {
        const onPop = () => schedHeal(true);
        w.addEventListener('popstate', onPop);
        popOff = () => w.removeEventListener?.('popstate', onPop);
      }
    };

    async function refresh() {
      const w = gW(), doc = gD();
      if (!envOpts && w?.__agPrismTelemetry && w.__agPrismTelemetry !== api) { unmountFb(); return null; }
      if (!isConv(doc, w)) {
        yielded = false;
        unmountFb(true);
        if (mode !== 'off') hideExt();
        return null;
      }
      if (mode === 'on') hideExt(true);
      else {
        showExt();
        if (hasExt(null, true)) { yielded = true; unmountFb(true); ensTierObs(); return null; }
      }
      if (mode !== 'off' && fbEl) {
        purgeOrphans(doc, fbEl);
        if (!seatFb(doc)) return null;
      }
      if (!fbEl || !isConn(doc, fbEl)) {
        if (mode !== 'off' && (mode === 'on' || !hasExt(null, true)) && waitTm === null && findAnchor(doc, true)) mountFb();
        if (!fbEl || !isConn(doc, fbEl)) return null;
      }
      ensTierObs();
      const snap = await reqSnap({ conversationId: detCid(fbEl), force: false });
      applySnap(snap);
      return snap;
    }

    function mountFb() {
      const w = gW(), doc = gD();
      if (!w || !doc || (typeof doc.attachShadow === 'undefined' && typeof doc.createElement !== 'function')) return false;
      if (!envOpts && w.__agPrismTelemetry && w.__agPrismTelemetry !== api) { unmountFb(); return false; }
      if (mode === 'off') return false;
      if (!isConv(doc, w)) {
        yielded = false;
        unmountFb(true);
        hideExt();
        ensSeatObs();
        return false;
      }
      if (mode === 'on') hideExt(true);
      else if (hasExt(null, true)) { yielded = true; unmountFb(true); ensSeatObs(); return false; }
      if (fbEl && seatFb(doc)) { purgeOrphans(doc, fbEl); ensSeatObs(); return true; }

      const anc = findAnchor(doc, true);
      if (!anc) { ensSeatObs(); return false; }
      const E = (t, a, k) => mk(doc, t, a, k);
      const host = E('div', {
        id: PRISM_BAR_ID,
        [FALLBACK_ATTR]: '1',
        [PRISM_BAR_ATTR]: 'true',
        'data-ag-owned': '1',
        translate: 'no',
        'data-no-translate': 'true',
        'data-ag-localization-skip': 'true',
        'data-agy-no-translate': 'true',
        'data-antigravity-zh-skip': '1',
      });
      if (typeof host.attachShadow !== 'function') return false;
      const sr = host.attachShadow({ mode: 'open' });
      sr.appendChild(E('style', { text: SHADOW_CSS }));

      const t0 = gStr();
      const sChip = E('button', { type: 'button', cls: 'chip', 'data-card': 'speed' }, [
        E('span', { cls: 'rounds dim', id: 'rounds', text: '—' }),
        E('strong', { id: 'tps', text: '—' }),
        E('span', { cls: 'dim', text: 'tok/s' }),
      ]);
      const cChip = E('button', { type: 'button', cls: 'chip', 'data-card': 'cache' }, [
        E('span', { cls: 'cache-total', id: 'cache-total', text: '—' }),
        E('span', { cls: 'sub-badge', id: 'subagent-badge', hidden: true, text: '' }),
        E('span', { cls: 'dim', text: '·' }),
        E('span', { 'data-i18n': 'cache', 'data-fb-i18n': 'cache', text: t0.cache }),
        E('strong', { id: 'cache-rate', text: '—' }),
      ]);
      const fChip = E('button', { type: 'button', cls: 'chip', 'data-card': 'five', 'aria-expanded': 'false', hidden: true }, [
        E('span', { cls: 'dim', text: '5h' }),
        E('strong', { id: 'five-balance', text: '—' }),
      ]);
      const wChip = E('button', { type: 'button', cls: 'chip', 'data-card': 'week', 'aria-expanded': 'false', hidden: true }, [
        E('span', { cls: 'dim', text: '7d' }),
        E('strong', { id: 'week-balance', text: '—' }),
      ]);
      const xChip = E('button', { type: 'button', cls: 'chip', 'data-card': 'context', 'aria-expanded': 'false' }, [
        E('span', { cls: 'context-ring', id: 'context-ring' }),
        E('span', { cls: 'context-label dim', 'data-i18n': 'contextShort', text: 'Ctx' }),
        E('strong', { id: 'context-percent', text: '0%' }),
      ]);
      const sCard = E('section', { cls: 'card', id: 'speed-card', hidden: true }, [
        E('div', { cls: 'heading' }, [E('span', { 'data-fb-i18n': 'speedHeading', text: t0.speedHeading })]),
        E('dl', null, [
          E('dt', { 'data-fb-i18n': 'ttft', text: t0.ttft }),
          E('dd', { id: 'ttft', text: '—' }),
          E('dt', { 'data-fb-i18n': 'latestRate', text: t0.latestRate }),
          E('dd', { id: 'latest-rate', text: '—' }),
        ]),
      ]);
      const xCard = E('section', { cls: 'card context-card', id: 'context-card', hidden: true }, [
        E('div', { cls: 'heading' }, [E('span', { 'data-fb-i18n': 'ctxHeading', text: t0.ctxHeading })]),
        E('strong', { id: 'context-summary', text: t0.summary(0, 100) }),
        E('p', { id: 'context-tokens', text: '— / 512K tok' }),
        E('div', { cls: 'track', id: 'context-track' }, [E('i', { id: 'context-fill' })]),
        E('dl', null, [
          E('dt', { 'data-fb-i18n': 'curModel', text: t0.curModel }),
          E('dd', { id: 'context-model', text: '—' }),
        ]),
        E('p', { cls: 'footnote', id: 'context-note', hidden: true, text: '' }),
      ]);

      sr.appendChild(E('div', { cls: 'bar' }, [sChip, cChip, fChip, wChip, xChip]));
      sr.appendChild(sCard);
      sr.appendChild(xCard);

      const tog = (card, btn) => {
        const nx = Boolean(card.hidden);
        sCard.hidden = xCard.hidden = true;
        sChip.setAttribute('aria-expanded', 'false');
        xChip.setAttribute('aria-expanded', 'false');
        fChip.setAttribute('aria-expanded', 'false');
        wChip.setAttribute('aria-expanded', 'false');
        card.hidden = !nx;
        if (card === xCard) xChip.setAttribute('aria-expanded', String(nx));
        btn.setAttribute('aria-expanded', String(nx));
        if (nx) void refresh();
        try { w.__agPulseExternalBridge?.({ event: 'card' }); } catch {}
      };
      xChip.addEventListener('click', (e) => { e?.stopPropagation?.(); tog(xCard, xChip); });
      fChip.addEventListener('click', (e) => { e?.stopPropagation?.(); tog(xCard, fChip); });
      wChip.addEventListener('click', (e) => { e?.stopPropagation?.(); tog(xCard, wChip); });
      sChip.addEventListener('click', (e) => { e?.stopPropagation?.(); tog(sCard, sChip); });

      if (typeof doc.addEventListener === 'function') {
        const onDoc = (ev) => {
          if (ev?.target === host || host.contains?.(ev?.target)) return;
          if (!xCard.hidden || !sCard.hidden) {
            xCard.hidden = sCard.hidden = true;
            xChip.setAttribute('aria-expanded', 'false');
            sChip.setAttribute('aria-expanded', 'false');
            fChip.setAttribute('aria-expanded', 'false');
            wChip.setAttribute('aria-expanded', 'false');
            try { w.__agPulseExternalBridge?.({ event: 'card' }); } catch {}
          }
        };
        doc.addEventListener('click', onDoc);
        docOff = () => doc.removeEventListener('click', onDoc);
      }

      purgeOrphans(doc, null);
      seatIn(anc, host);
      fbEl = host;
      srEl = sr;
      yielded = false;

      ensSeatObs();
      ensHost();
      ensTierObs();
      try { w.__agPulseExternalBridge?.({ event: 'mount' }); } catch {}
      ensBlur();
      void refresh();
      startPoll();
      return true;
    }

    const getState = () => {
      const mounted = Boolean(fbEl && isConn(gD(), fbEl));
      const blurred = isBlur();
      if (mounted && blurred && pollTm !== null) { pollSusp = true; clrPoll(); }
      return {
        mode,
        mountedFallback: mounted,
        waitingForExternal: waitTm !== null,
        yieldedToExternal: Boolean(mode === 'auto' && (yielded || hasExt())),
        hasExternal: hasExt(),
        pollSuspended: Boolean(mounted && (pollSusp || blurred)),
      };
    };

    function sync(cfg) {
      if (cfg && typeof cfg.language === 'string' && cfg.language) expLang = cfg.language;
      const raw = cfg && cfg.telemetryModule;
      mode = raw === 'on' || raw === 'off' ? raw : 'auto';
      if (srEl && mode !== 'off') {
        syncLbls();
        if (lastSnap) applySnap(lastSnap);
      }
      if (mode === 'off') {
        yielded = false;
        unmountFb();
        hideExt();
        return getState();
      }
      ensBridge();
      ensSeatObs();
      const doc = gD(), w = gW();
      if (!isConv(doc, w)) {
        yielded = false;
        unmountFb(true);
        hideExt();
        ensHost();
        return getState();
      }
      if (mode === 'on') {
        yielded = false;
        clrWait();
        hideExt(true);
        ensHost();
        mountFb();
        return getState();
      }
      showExt();
      if (hasExt()) {
        yielded = true;
        unmountFb(true);
        ensHost();
        ensTierObs();
        if (detAt > 0 && rescTm === null) {
          rescTm = setTimeout(() => {
            rescTm = null;
            if (mode !== 'off' && !hasExt()) mountFb();
          }, GRACE_MS + 60);
          rescTm?.unref?.();
        }
        return getState();
      }
      if (fbEl && seatFb(doc)) return getState();
      if (findExtBars(doc).some((b) => b && b.getAttribute?.(FALLBACK_ATTR) !== '1' && isConn(doc, b) && !usableExt(doc, b))) {
        clrWait();
        mountFb();
        return getState();
      }
      if (waitTm === null) {
        const ms = isFin(cfg?.__fallbackDelayMs) && cfg.__fallbackDelayMs >= 0 ? cfg.__fallbackDelayMs : WAIT_MS;
        waitTm = setTimeout(() => {
          waitTimerDone();
        }, ms);
        waitTm?.unref?.();
      }
      return getState();
    }

    function waitTimerDone() {
      waitTm = null;
      if (mode !== 'auto') return;
      if (!isConv(gD(), gW())) { unmountFb(true); hideExt(); return; }
      if (hasExt()) { yielded = true; unmountFb(true); ensHost(); ensTierObs(); return; }
      mountFb();
    }

    function destroy() {
      clrWait();
      clrSeat();
      unmountFb();
      showExt();
      const w = gW();
      if (w) {
        if (mApi && w.__agPrismMetricsBridge === mApi) delete w.__agPrismMetricsBridge;
        if (mRes && w.__agPrismMetricsResolve === mRes) delete w.__agPrismMetricsResolve;
      }
      yielded = false;
      lastSig = '';
      detAt = 0;
    }

    const api = {
      BAR_ID,
      PRISM_BAR_ID,
      PRISM_BAR_ATTR,
      FALLBACK_ATTR,
      METRICS_BINDING,
      sync,
      destroy,
      refresh,
      getLatestSnapshot: () => lastSnap,
      getState,
      createTelemetryController,
    };
    return api;
  }

  return createTelemetryController();
});

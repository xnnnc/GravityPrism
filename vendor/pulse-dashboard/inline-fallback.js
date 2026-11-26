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
  const isFn = (v) => typeof v === 'function';

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
    const t = ['var(--e)', ':host([data-t~="', '[data-card="', 'color-mix(in srgb,var(--pt-c) ', 'overflow:hidden;white-space:nowrap;', 'transform:scale(.9) translateX(4px);pointer-events:none!important', 'border-radius:', 'background:'];
    for (let i = 0; i < t.length; i++) s = s.split('$' + i).join(t[i]);
    return s.replace(/!(?!important)/g, '!important');
  };
  const TIER_CSS = expCss('[hidden]{display:none!}:host{--e:cubic-bezier(.22,1,.36,1);--pt-c:var(--pv-tint,var(--pulse-ring,#3186ff))}.bar{transition:gap .28s $0}.bar>:is(.chip,.dot){$4max-width:132px;opacity:1;transform-origin:right;transition:max-width .28s $0,opacity .17s ease-out,padding .28s $0,margin .28s $0,gap .28s $0,transform .28s $0,background .16s,border-color .22s,box-shadow .22s}.bar>[data-card="cache"]{max-width:240px}.bar>$2context"]{max-width:136px}.bar>.dot{max-width:16px}:where(.bar>.chip>*:not(.context-ring):not(svg)){$4max-width:108px;flex-shrink:0;opacity:1;transform-origin:right;transition:max-width .28s $0,opacity .17s ease-out,margin .28s $0,padding .28s $0,transform .28s $0}.context-ring{will-change:transform;transition:transform .28s $0}$12"]) :is(.cache-total,.sub-badge,$2cache"] .dim,.countdown),$14"]) $2context"] .context-label,$15"]) $2context"]>:not(.context-ring){max-width:0!important;flex-shrink:1!important;opacity:0!;margin:0!;padding:0!;$5}$13"]) .bar>:is($2cache"],$2speed"),$14"]) .bar>:is($2week"],.dot),$15"]) .bar>$2five"]{max-width:0!;min-width:0!;flex-shrink:1!;opacity:0!;padding:0!;margin:0!;gap:0!;border:0!;$5}$13"]) .bar>$2cache"]::before,$13"]) .bar>$2five"]::before,$15"]) .bar>$2context"]::before{opacity:0!;content:none!}$13"]) .bar>$2five"],$15"]) .bar>$2context"]{margin-left:0!}$14"]) .bar{gap:0}$15"]) $2context"]{width:26px!;min-width:26px!;height:26px!;padding:0!;gap:0!;$6999px!;justify-content:center!;$7$39%,transparent);border:1px solid $328%,rgba(148,163,184,.28))}$15"]) $2context"]:is(:hover,[aria-expanded="true"]){$7$317%,transparent);border-color:$348%,rgba(148,163,184,.4));box-shadow:0 0 10px -2px $345%,transparent)}$15"]) .context-ring{transform:scale(1.27)}:host([data-pv-motion="off"]) :is(.bar,.bar *),:host-context(html[data-ag-cs-resizing="1"]) :is(.bar,.bar *){transition:none!}@media (prefers-reduced-motion:reduce){:is(.bar,.bar *){transition:none!}}');

  const SHADOW_CSS = expCss(':host,*,::before,::after{box-sizing:border-box}:host,.bar,.chip{display:inline-flex;align-items:center}:host{--ch:#dae2f0db;--mu:#94a0b6b8;--f:#eef1f7;--pv-tint:#3186ff;flex:0 0 auto;position:relative;font:11px/16px Inter,system-ui,-apple-system,"Segoe UI",sans-serif;font-variant-numeric:tabular-nums;color:var(--ch);user-select:none;z-index:20}:host-context(html[data-ag-cs-theme="light"]),:host([data-pv-light="1"]){--ch:#1e293b;--mu:#475569;--f:#0f172a;--pv-tint:#2563eb}:host([hidden]),.sub-badge[hidden],.card[hidden],.footnote[hidden],.footnote:empty,:host([data-layout="blocked"])>.bar{display:none!}:host([data-layout="blocked"]){position:fixed!;left:-9999px!;top:-9999px!;width:0!;height:0!;margin:0!;padding:0!;overflow:hidden!;visibility:hidden!;pointer-events:none!}.bar{gap:2px;flex:none}.bar .chip{flex:none;white-space:nowrap;gap:3.5px;height:24px;padding:0 5px;border:0;$65px;$7transparent;color:var(--ch);font:inherit;line-height:16px;font-size:11px;cursor:pointer;overflow:visible;font-variant-numeric:tabular-nums;transition:background .15s,color .15s}.bar .chip:is(:hover,[aria-expanded="true"]){$7rgba(255,255,255,.05);color:var(--f)}:host-context(html[data-ag-cs-theme="light"]) .bar .chip:is(:hover,[aria-expanded="true"]),:host([data-pv-light="1"]) .bar .chip:is(:hover,[aria-expanded="true"]){$7rgba(15,23,42,.05)}.bar .chip strong{font-weight:600}.chip svg{width:12px;height:12px;stroke:currentColor;stroke-width:1.5;fill:none;opacity:.75;flex:none}.chip[data-warn="1"] strong{color:#f59e0b}.chip[data-warn="2"] strong{color:#f87171}.bar .chip .dim,.bar .chip .c-lbl{color:var(--mu);opacity:.66;font-size:9.5px}.bar .chip [data-i18n="cache"]{opacity:.62}.bar .chip[data-card="speed"]>span:last-child{opacity:.66;font-size:10px}:host(:not(.icons-only)) :is(.chip[data-card="speed"]>:is(svg,.rounds),.chip[data-card="cache"]>:is(svg:first-child,.cache-total,.dim),.chip[data-card="context"]>.context-label){display:none!}:host(:not(.icons-only)) .bar .chip:not([hidden])~.chip:not([hidden]){position:relative;margin-left:6px}:host(:not(.icons-only)) .bar .chip:not([hidden])~.chip:not([hidden])::before{content:"·";position:absolute;left:-4px;top:50%;transform:translate(-50%,-50%);color:var(--mu);opacity:.32;pointer-events:none}.sub-badge{font-size:10px;opacity:.82;color:var(--primary,#38bdf8);font-weight:500;margin-right:2px}.context-ring{width:11px;height:11px;$650%;$7conic-gradient(var(--pv-tint,#3186ff) var(--used-angle,36deg),rgba(148,163,184,.28) 0);display:inline-block;position:relative;flex:none}.context-ring::after{content:"";position:absolute;inset:2.2px;$650%;$7var(--card,#141720)}:host-context(html[data-ag-cs-theme="light"]) .context-ring::after,:host([data-pv-light="1"]) .context-ring::after{$7var(--card,#f8fafc)}.card{position:absolute;right:0;left:auto;bottom:calc(100% + 10px);width:min(304px,calc(100vw - 24px));padding:12px 13px;$610px;border:1px solid rgba(148,163,184,.22);$7var(--card,#12151ef5);color:var(--foreground,#eef1f7);box-shadow:0 16px 40px rgba(0,0,0,.36);z-index:9999}$14"]) .card{right:-84px;width:min(296px,calc(100vw - 32px))}.heading{display:flex;align-items:center;justify-content:space-between;gap:6px;font-size:11px;font-weight:600;margin-bottom:6px}.heading>span:first-child{white-space:nowrap}#context-summary{display:block;font-size:13px;font-weight:600;margin-bottom:2px}#context-tokens{margin:0 0 8px;font-size:11px;opacity:.76}.track{height:5px;$6999px;$7rgba(148,163,184,.18);overflow:hidden;margin:6px 0 10px}.track>i{display:block;height:100%;width:0%;$6999px;$7linear-gradient(90deg,#2563eb,#38bdf8)}dl{display:grid;grid-template-columns:auto 1fr;gap:4px 10px;margin:8px 0;font-size:11px}dt{opacity:.64}dd{margin:0;text-align:right;font-weight:500;$4text-overflow:ellipsis}.footnote{margin:6px 0 0;font-size:10px;opacity:.58}') + TIER_CSS;

  const isFin = (v) => typeof v === 'number' && Number.isFinite(v);
  const FB_ROWS = {
    'zh-CN': '缓存|吞吐速率|首字延迟|最近速率|上下文窗口|当前模型|已用|剩余|代理',
    'zh-TW': '快取|吞吐速率|首字延遲|最近速率|上下文視窗|目前模型|已用|剩餘|代理',
    en: 'Cache|Throughput|TTFT|Latest Rate|Context Window|Active Model|used|free| sub',
    ja: 'キャッシュ|スループット|初回応答|最新速度|コンテキスト|現在のモデル|使用|残り| サブ',
    ko: '캐시|처리 속도|첫 토큰 지연|최근 속도|컨텍스트 창|현재 모델|사용|여유| 서브',
    es: 'Caché|Rendimiento|TTFT|Velocidad rec.|Ventana de ctx|Modelo activo|usado|libre| sub',
    fr: 'Cache|Débit|TTFT|Dernier débit|Fenêtre ctx|Modèle actif|utilisé|libre| sous',
    de: 'Cache|Durchsatz|TTFT|Akt. Rate|Kontextfenster|Aktives Modell|belegt|frei| Sub',
  };
  function normFbLang(raw, win) {
    let v = String(raw || '').trim();
    if (!v || v.toLowerCase() === 'auto') {
      const navObj = win && 'navigator' in win ? win.navigator : (typeof navigator !== 'undefined' ? navigator : null);
      v = String(navObj?.languages?.[0] || navObj?.language || '').trim();
    }
    const s = v.toLowerCase().replace(/_/g, '-');
    if (!s || s === 'auto') return 'en';
    if (s === 'yue' || s.startsWith('yue-') || s === 'zh-yue' || s.includes('cantonese')) return 'zh-CN';
    if (/^zh-(tw|hant|hk|mo)/.test(s) || s === 'tw' || s === 'hant') return 'zh-TW';
    if (/^zh/.test(s)) return 'zh-CN';
    if (/^(ja|jp)/.test(s) || s === 'japanese') return 'ja';
    if (/^(ko|kr)/.test(s) || s === 'korean') return 'ko';
    if (/^es/.test(s) || s === 'spanish') return 'es';
    if (/^fr/.test(s) || s === 'french') return 'fr';
    if (/^de/.test(s) || s === 'german') return 'de';
    return 'en';
  }
  const FB_I18N = Object.fromEntries(
    Object.entries(FB_ROWS).map(([lk, s]) => {
      const r = s.split('|');
      return [
        lk,
        {
          cache: r[0], speedHeading: r[1], ttft: r[2], latestRate: r[3],
          ctxHeading: r[4], curModel: r[5],
          summary: (p, rem) => `${p}% ${r[6]} · ${rem}% ${r[7]}`,
          agents: (n) => `${n}${r[8]}`,
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
        else if (k === 'hidden') el.hidden = !!(v);
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

    let mode = 'auto', waitTm = null, rescTm = null, pollTm = null;
    let hasHost = false, yielded = false, lastSig = '', detAt = 0;
    let docOff = null, popOff = null, winResOff = null, lastSnap = null, mApi = null, mRes = null, seatObs = null, healTm = null;
    let expLang = '', activeHost = null, winBlur = false, pollSusp = false, blurOff = null, blurObs = null, extGuardHeld = false;
    const pend = new Map(), insts = new Map(), instByHost = new WeakMap(), extTiers = new Map(), snapByCid = new Map(), locSnaps = new WeakMap();

    const TIER_CUTS = [640, 515, 450, 395, 345], FT_SEL = '.agy-composer-footer,[data-testid="input-box-bottom-toolbar"]';
    const isConn = (doc, el) => {
      if (!el || el.isConnected === false) return false;
      if (el.isConnected === true) return true;
      if (!el.parentNode && !el.parentElement) return false;
      if (doc && isFn(doc.getElementById) && el.id && typeof doc.querySelectorAll !== 'function') {
        const b = doc.getElementById(el.id);
        if (b && b !== el) return false;
      }
      return true;
    };

    const getPrimaryInst = () => {
      const doc = gD();
      let first = null;
      for (const it of insts.values()) {
        if (!isConn(doc, it.host)) continue;
        if (!first) first = it;
        if (it.host.id === PRISM_BAR_ID) return it;
      }
      return first;
    };

    const isCardOpen = (it) => !!(it && ((it.xCard && !it.xCard.hidden) || (it.sCard && !it.sCard.hidden)));

    const resolveActiveInst = () => {
      const doc = gD();
      for (const it of insts.values()) {
        if (isConn(doc, it.host) && isCardOpen(it)) return it;
      }
      if (activeHost && isConn(doc, activeHost)) {
        const hit = instByHost.get(activeHost);
        if (hit) return hit;
      }
      const actEl = doc?.activeElement;
      if (actEl) {
        const actCv = actEl.closest?.('[data-testid="conversation-view"],[data-testid="agent-input-box"]');
        if (actCv) {
          for (const it of insts.values()) {
            if (isConn(doc, it.host) && (actCv === it.anc || actCv.contains?.(it.anc))) return it;
          }
        }
      }
      return getPrimaryInst();
    };

    const syncPrimaryId = () => {
      const doc = gD();
      let primary = null;
      for (const it of insts.values()) {
        if (!isConn(doc, it.host)) continue;
        if (!primary) primary = it;
        if (it.host.id === PRISM_BAR_ID) { primary = it; break; }
      }
      for (const it of insts.values()) {
        if (it === primary) {
          if (it.host.id !== PRISM_BAR_ID) it.host.setAttribute('id', PRISM_BAR_ID);
        } else if (it.host.id) {
          it.host.removeAttribute?.('id');
          if (it.host.id) it.host.id = '';
        }
      }
    };

    const applyTierRec = (rec, force = false) => {
      rec.raf = 0;
      const doc = gD(), ft = mode !== 'off' && rec.anc && isConn(doc, rec.anc) ? rec.anc : null;
      const w = rec.hasPendW ? rec.pendW : ft?.getBoundingClientRect?.().width;
      rec.pendW = 0;
      rec.hasPendW = false;
      if (!ft || !isFin(w) || w <= 0) return;
      let t = rec.curTier;
      while (t < 5 && w < TIER_CUTS[t]) t++;
      while (t > 0 && w >= TIER_CUTS[t - 1] + 12) t--;
      const tv = TIER_VALS[(rec.curTier = t)] || '0';
      if (!force && tv === rec.lastTv && ft.getAttribute?.(TIER_ATTR) === tv) return;
      rec.lastTv = tv;
      if (ft.getAttribute?.(TIER_ATTR) !== tv) ft.setAttribute?.(TIER_ATTR, tv);
      if (rec.host) {
        if (rec.host.getAttribute?.(HID_ATTR) !== '1' && rec.host.getAttribute?.(TIER_ATTR) !== tv) rec.host.setAttribute?.(TIER_ATTR, tv);
        return;
      }
      const exts = findExtBars(doc);
      const localExts = exts.filter((b) => b && (ft.contains?.(b) || b.parentElement === ft));
      const targets = localExts.length ? localExts : extTiers.size <= 1 ? exts : [];
      for (const b of targets) {
        if (!b || b.getAttribute?.(HID_ATTR) === '1') continue;
        if (b.getAttribute?.(TIER_ATTR) !== tv) b.setAttribute?.(TIER_ATTR, tv);
        if (b.shadowRoot && !b.shadowRoot.querySelector?.(`style[${TIER_STYLE_ATTR}="1"]`)) {
          try { const st = doc.createElement('style'); st.setAttribute(TIER_STYLE_ATTR, '1'); st.textContent = TIER_CSS; b.shadowRoot.appendChild(st); } catch {}
        }
      }
    };

    const schedTierRec = (rec, entries) => {
      if (entries && typeof entries.length === 'number') {
        let rw = NaN;
        for (let i = entries.length - 1; i >= 0; i--) {
          const w0 = entries[i]?.contentRect?.width;
          if (isFin(w0) && w0 >= 0) { rw = w0; break; }
        }
        if (isFin(rw)) { rec.pendW = rw; rec.hasPendW = true; }
      } else {
        rec.hasPendW = false;
      }
      if (!rec.raf && mode !== 'off') {
        const w = gW();
        rec.raf = w?.requestAnimationFrame ? w.requestAnimationFrame(() => applyTierRec(rec, false)) : (applyTierRec(rec, false), 0);
      }
    };

    const ensWinResize = () => {
      const w = gW();
      if (!winResOff && w && isFn(w.addEventListener)) {
        const onR = () => {
          for (const it of insts.values()) schedTierRec(it, null);
          for (const et of extTiers.values()) schedTierRec(et, null);
        };
        w.addEventListener('resize', onR, { passive: true });
        winResOff = () => w.removeEventListener?.('resize', onR);
      }
    };

    const attachTierRec = (rec) => {
      const w = gW();
      if (!w || !rec?.anc || mode === 'off') return;
      if (!rec.ro && isFn(w.ResizeObserver)) {
        try {
          rec.ro = new w.ResizeObserver((entries) => schedTierRec(rec, entries));
          rec.ro.observe(rec.anc);
        } catch {}
      }
      ensWinResize();
      if (!rec.lastTv || !rec.ro) applyTierRec(rec, true);
    };

    const detachTierRec = (rec) => {
      if (!rec) return;
      try { if (rec.raf) gW()?.cancelAnimationFrame?.(rec.raf); rec.ro?.disconnect?.(); rec.anc?.removeAttribute?.(TIER_ATTR); } catch {}
      rec.raf = 0; rec.ro = null; rec.curTier = 0; rec.pendW = 0; rec.hasPendW = false; rec.lastTv = '';
    };

    const clrExtTiers = () => {
      for (const et of extTiers.values()) detachTierRec(et);
      extTiers.clear();
    };

    const clrTier = () => {
      for (const it of insts.values()) detachTierRec(it);
      clrExtTiers();
      try { winResOff?.(); } catch {}
      winResOff = null;
      for (const b of gD()?.querySelectorAll?.(`#${PRISM_BAR_ID},[${PRISM_BAR_ATTR}],#${BAR_ID},[id^="${BAR_ID}"],[data-ag-pulse-bar]`) || []) {
        try { b.removeAttribute?.(TIER_ATTR); b.shadowRoot?.querySelector?.(`style[${TIER_STYLE_ATTR}="1"]`)?.remove?.(); } catch {}
      }
    };

    const ensTierObs = () => {
      const doc = gD();
      if (!doc || mode === 'off') return;
      if (insts.size > 0) {
        clrExtTiers();
        for (const it of insts.values()) attachTierRec(it);
        return;
      }
      const fts = findAnchors(doc, true);
      const ftSet = new Set(fts);
      for (const [anc, et] of extTiers) {
        if (!ftSet.has(anc) || !isConn(doc, anc)) { detachTierRec(et); extTiers.delete(anc); }
      }
      for (const ft of fts) {
        let et = extTiers.get(ft);
        if (!et) {
          et = { anc: ft, host: null, ro: null, raf: 0, curTier: 0, pendW: 0, hasPendW: false, lastTv: '' };
          extTiers.set(ft, et);
        }
        attachTierRec(et);
      }
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
            const prev = (it.cid && snapByCid.get(it.cid)) || lastSnap;
            const keepSpeed = !pl.speed && prev?.speed;
            const keepConvs = !pl.conversations?.length && prev?.conversations?.length;
            const merged = keepSpeed || keepConvs
              ? { ...pl, ...(keepSpeed ? { speed: prev.speed } : {}), ...(keepConvs ? { conversations: prev.conversations } : {}) }
              : pl;
            if (it.cid) {
              snapByCid.set(it.cid, merged);
              if (snapByCid.size > 32) snapByCid.delete(snapByCid.keys().next().value);
            }
            if (!lastSnap || !it.cid || resolveActiveInst()?.cid === it.cid) lastSnap = merged;
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
    const isBlur = () => { const d = gD(); return !!(d?.hidden || d?.documentElement?.getAttribute?.('data-ag-cs-win-blur') === '1' || winBlur); };
    const clrBlur = () => { try { blurOff?.(); blurObs?.disconnect?.(); } catch {} blurOff = blurObs = null; winBlur = pollSusp = false; };
    const startPoll = () => {
      clrPoll();
      if (insts.size === 0 || mode === 'off') return;
      if (isBlur()) { pollSusp = true; return; }
      pollSusp = false;
      pollTm = setInterval(() => { isBlur() ? (pollSusp = true, clrPoll()) : void refresh(); }, 4000);
      pollTm?.unref?.();
    };
    const syncBlur = (res) => {
      if (insts.size === 0 || mode === 'off') { clrPoll(); pollSusp = false; return; }
      if (isBlur()) { pollSusp = true; clrPoll(); return; }
      const was = pollSusp; pollSusp = false;
      if (pollTm === null) startPoll();
      if (was && res) void refresh();
    };
    const ensBlur = () => {
      const w = gW(), d = gD();
      if (!w || !d) return;
      if (!blurOff && isFn(w.addEventListener)) {
        const onB = () => { winBlur = true; syncBlur(false); }, onF = () => { winBlur = false; syncBlur(true); }, onV = () => { if (!gD()?.hidden) winBlur = false; syncBlur(!gD()?.hidden); };
        w.addEventListener('blur', onB); w.addEventListener('focus', onF); d.addEventListener?.('visibilitychange', onV);
        blurOff = () => { w.removeEventListener?.('blur', onB); w.removeEventListener?.('focus', onF); d.removeEventListener?.('visibilitychange', onV); };
      }
      if (!blurObs && isFn(w.MutationObserver) && d.documentElement) {
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
      if (isFn(doc.querySelectorAll)) {
        try {
          const s = doc.querySelectorAll('#' + BAR_ID + ',[id^="' + BAR_ID + '"],[data-ag-pulse-bar="true"]');
          for (let i = 0; i < s.length; i++) add(s[i]);
        } catch {}
      }
      if (isFn(doc.getElementById)) add(doc.getElementById(BAR_ID));
      return out;
    };

    const purgeOrphans = (doc) => {
      if (!doc || typeof doc.querySelectorAll !== 'function') return;
      const live = new Set();
      for (const it of insts.values()) live.add(it.host);
      const list = doc.querySelectorAll('[' + FALLBACK_ATTR + '="1"], #' + PRISM_BAR_ID + ', [' + PRISM_BAR_ATTR + ']');
      for (let i = 0; i < list.length; i++) {
        if (!live.has(list[i])) try { list[i].remove(); } catch {}
      }
    };

    const usableExt = (doc, b) => {
      if (!b || b.getAttribute?.(FALLBACK_ATTR) === '1' || !isConn(doc, b)) return false;
      if (b.getAttribute?.(HID_ATTR) === '1' || b.getAttribute?.('data-layout') === 'blocked' || b.hidden === true) return false;
      if (b.style && b.style.display === 'none') return false;
      if (doc && doc.body && (b.parentElement === doc.body || b.parentNode === doc.body)) return false;
      if (b.closest?.('.agy-home')) return false;
      return true;
    };

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
            if (isFn(b.style.removeProperty)) {
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
            if (isFn(b.style.setProperty)) {
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
          getPreferences: () => Promise.resolve({ language: resolveCurLang() }),
          setPreferences: (v) => Promise.resolve(v || {}),
          report: () => {},
        };
        hasHost = true;
      }
    };

    const disposeInst = (it, notifyBridge = true) => {
      if (!it) return;
      detachTierRec(it);
      try {
        if (it.xCard) it.xCard.hidden = true;
        if (it.sCard) it.sCard.hidden = true;
        if (notifyBridge) gW()?.__agPulseExternalBridge?.({ event: 'dispose', host: it.host });
      } catch {}
      try { it.host.remove(); } catch {}
      if (activeHost === it.host) activeHost = null;
      instByHost.delete(it.host);
      insts.delete(it.anc);
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
      const list = Array.from(insts.values());
      for (let i = 0; i < list.length; i++) disposeInst(list[i], false);
      if (list.length > 0) {
        try { gW()?.__agPulseExternalBridge?.({ event: 'dispose' }); } catch {}
      }
      purgeOrphans(gD());
      activeHost = null;
    };

    const detCid = (node, multiPane = false) => {
      try {
        const cid = node?.closest?.('[data-cascade-id]')?.getAttribute?.('data-cascade-id');
        if (cid && GUID_RE.test(cid)) return cid;
        const cv = node?.closest?.('[data-testid="conversation-view"]');
        const cvCid = cv?.getAttribute?.('data-cascade-id') || cv?.querySelector?.('[data-cascade-id]')?.getAttribute?.('data-cascade-id');
        if (cvCid && GUID_RE.test(cvCid)) return cvCid;
        if (!multiPane) {
          const m = gW()?.location?.pathname?.match?.(/\/c\/([0-9a-f-]{36})/i);
          if (m) return m[1];
        }
        return null;
      } catch { return null; }
    };

    const estSnap = (node = null) => {
      const doc = gD();
      const scope = node?.closest?.('[data-testid="conversation-view"]') || doc;
      const now = Date.now();
      const cached = scope ? locSnaps.get(scope) : null;
      if (cached && now - cached.at < 5000) return cached.snap;
      let model = 'Gemini 4', chars = 0;
      try {
        const tr = scope?.querySelector?.('[data-testid="model-selector-trigger"]') || doc?.querySelector?.('[data-testid="model-selector-trigger"]');
        const lb = tr?.getAttribute?.('aria-label') || tr?.textContent?.trim();
        if (lb) model = lb;
        const vw = scope && scope !== doc ? scope : doc?.querySelector?.('[data-testid="conversation-view"]');
        if (vw && isFn(vw.querySelectorAll)) {
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
      const snap = {
        connection: 'local-estimate',
        speed: { model, tps: null, latestTps: null, ttftSeconds: null, rounds: 0, cacheHitRate: null, totalTokens: usedTokens, context: { model, usedTokens, maxTokens, usedFraction, sampledAt: now } },
        groups: [],
      };
      if (scope) locSnaps.set(scope, { at: now, snap });
      return snap;
    };

    const reqSnap = (inp, scopeNode = null) => {
      const w = gW();
      bindHook();
      const si = inp && typeof inp === 'object' ? { ...inp } : {};
      if (si.usageSync) delete si.usageSync;
      const cid = typeof si.conversationId === 'string' ? si.conversationId : null;
      const fallbackSnap = () => (cid && snapByCid.get(cid)) || (!cid && lastSnap) || estSnap(scopeNode);
      if (w && typeof w[METRICS_BINDING] === 'function') {
        return new Promise((resolve) => {
          const cap = Math.max(8, insts.size * 3);
          if (pend.size >= cap) { resolve(fallbackSnap()); return; }
          const id = ++reqSeq;
          const timeoutMs = si.force || si.quotaRefresh ? 10000 : 4500;
          const timer = setTimeout(() => { pend.delete(id); resolve(fallbackSnap()); }, timeoutMs);
          pend.set(id, { resolve, timer, cid });
          try {
            w[METRICS_BINDING](JSON.stringify({ id, input: si }));
          } catch {
            clearTimeout(timer);
            pend.delete(id);
            resolve(fallbackSnap());
          }
        });
      }
      return Promise.resolve(estSnap(scopeNode));
    };

    const resolveCurLang = () => {
      const attr = gD()?.documentElement?.getAttribute?.('data-ag-cs-lang');
      const cand = (attr && attr !== 'auto' ? attr : '') || (expLang && expLang !== 'auto' ? expLang : '');
      return normFbLang(cand, gW());
    };
    const gStr = () => FB_I18N[resolveCurLang()] || FB_I18N.en;
    const syncLblsFor = (sr) => {
      if (!sr) return;
      const t = gStr(), ns = sr.querySelectorAll?.('[data-fb-i18n]') || [];
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

    const applySnapToInst = (it, snap) => {
      if (!it || !it.sr || !it.host) return;
      if (snap && typeof snap === 'object') {
        it.snap = snap;
        if (it.cid) {
          snapByCid.set(it.cid, snap);
          if (snapByCid.size > 32) snapByCid.delete(snapByCid.keys().next().value);
        }
        const act = resolveActiveInst();
        if (!lastSnap || !act || act === it) lastSnap = snap;
      }
      const sr = it.sr, fbEl = it.host;
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
      syncLblsFor(sr);
      const sT = (id, v) => { const e = sr.getElementById(id), s = String(v); if (e && e.textContent !== s) e.textContent = s; };
      sT('rounds', sp.rounds > 0 ? `${sp.rounds}r` : '—');
      sT('tps', isFin(sp.tps) && sp.tps > 0 ? sp.tps.toFixed(1) : '—');
      sT('cache-total', `${fmtTok(tot > 0 ? tot : uTok)} tok`);
      sT('cache-rate', isFin(hit) ? `${(hit * 100).toFixed(1)}%` : '—');

      const sb = sr.getElementById('subagent-badge');
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
      const updQChip = (chipEl, cardName, v) => {
        const el = chipEl || sr.querySelector?.(`[data-card="${cardName}"]`);
        if (!el) return;
        el.hidden = gs.length === 0 && v === null;
        el.setAttribute('data-warn', v === null ? '0' : v <= 0.15 ? '2' : v <= 0.35 ? '1' : '0');
      };
      updQChip(it.fChip, 'five', r5);
      updQChip(it.wChip, 'week', rW);
      const noteEl = sr.getElementById('context-note');
      if (noteEl) {
        noteEl.hidden = true;
        if (noteEl.textContent) noteEl.textContent = '';
      }

      const fl = sr.getElementById('context-fill');
      if (fl?.style) fl.style.width = `${pct}%`;
      const rg = sr.getElementById('context-ring');
      rg?.style?.setProperty?.('--used-angle', `${Math.round(uf * 360)}deg`);
      try { gW()?.__agPulseExternalBridge?.({ event: 'render', data: snap, host: fbEl, conversationId: it.cid }); } catch {}
    };

    const isHidAnc = (el) =>
      !el ||
      el.hidden === true ||
      el.style?.display === 'none' ||
      !!(el.closest?.('.agy-home, aside, [data-testid="conversation-list-sidebar"], [data-testid="conversation-row-sidebar"], [hidden], [inert]'));
    const isTopWrap = (p) => {
      if (!p) return true;
      const c = String(p.className || '').trim();
      return !!(c && /\bmin-w-0\b/.test(c) && !/\b(?:flex|inline-flex|agy-composer-footer)\b/.test(c));
    };

    const findAnchors = (doc, knownConv = false) => {
      if (!doc) return [];
      const w = gW();
      if (!knownConv && !isConv(doc, w)) return [];
      const out = [], seen = new Set();
      let rawFts = isFn(doc.querySelectorAll) ? Array.from(doc.querySelectorAll(FT_SEL)) : [];
      if (rawFts.length === 0 && isFn(doc.querySelector)) {
        const oneFt = doc.querySelector(FT_SEL);
        if (oneFt) rawFts = [oneFt];
      }
      const boxMap = new Map();
      for (let i = 0; i < rawFts.length; i++) {
        const ft = rawFts[i];
        if (!ft || seen.has(ft) || isHidAnc(ft) || (!knownConv && !isConv(doc, w, ft))) continue;
        const box = ft.closest?.('[data-testid="agent-input-box"]') || null;
        if (box) {
          const prev = boxMap.get(box);
          if (prev) {
            if (/\bagy-composer-footer\b/.test(String(ft.className || '')) && !/\bagy-composer-footer\b/.test(String(prev.className || ''))) {
              const idx = out.indexOf(prev);
              if (idx >= 0) out[idx] = ft;
              seen.delete(prev);
              seen.add(ft);
              boxMap.set(box, ft);
            }
            continue;
          }
          boxMap.set(box, ft);
        }
        seen.add(ft);
        out.push(ft);
      }
      if (out.length > 0) return out;
      let mbs = isFn(doc.querySelectorAll) ? Array.from(doc.querySelectorAll('[data-testid="model-selector-trigger"]')) : [];
      if (mbs.length === 0 && isFn(doc.querySelector)) {
        const oneMb = doc.querySelector('[data-testid="model-selector-trigger"]');
        if (oneMb) mbs = [oneMb];
      }
      for (let i = 0; i < mbs.length; i++) {
        const mb = mbs[i], anc = mb?.parentElement;
        if (anc && !seen.has(anc) && !isHidAnc(mb) && !isTopWrap(anc) && (knownConv || isConv(doc, w, mb))) {
          seen.add(anc);
          out.push(anc);
        }
      }
      return out;
    };

    const hasAnyAnchor = (doc, knownConv = false) => {
      if (!doc) return false;
      const w = gW();
      if (!knownConv && !isConv(doc, w)) return false;
      const ft = doc.querySelector?.(FT_SEL);
      if (ft && !isHidAnc(ft) && (knownConv || isConv(doc, w, ft))) return true;
      const mb = doc.querySelector?.('[data-testid="model-selector-trigger"]');
      const anc = mb?.parentElement;
      return !!(anc && !isHidAnc(mb) && !isTopWrap(anc) && (knownConv || isConv(doc, w, mb)));
    };

    const seatIn = (anc, el) => {
      if (!anc || !el) return false;
      const kids = anc.children || [];
      if (/\bagy-composer-footer\b/.test(String(anc.className || '')) && kids.length >= 2 && isFn(anc.insertBefore)) {
        const last = kids[kids.length - 1];
        if (last && last !== el) { anc.insertBefore(el, last); return true; }
      }
      anc.appendChild(el);
      return true;
    };

    const closeCards = (it, notify = false) => {
      if (!it || (!it.xCard || it.xCard.hidden) && (!it.sCard || it.sCard.hidden)) return false;
      if (it.xCard) it.xCard.hidden = true;
      if (it.sCard) it.sCard.hidden = true;
      it.xChip?.setAttribute('aria-expanded', 'false');
      it.fChip?.setAttribute('aria-expanded', 'false');
      it.wChip?.setAttribute('aria-expanded', 'false');
      if (notify) {
        try { gW()?.__agPulseExternalBridge?.({ event: 'card', host: it.host, open: false }); } catch {}
      }
      return true;
    };

    const ensDocClick = (doc) => {
      if (docOff || !doc || typeof doc.addEventListener !== 'function') return;
      const onDoc = (ev) => {
        for (const it of insts.values()) {
          if (ev?.target === it.host || it.host.contains?.(ev?.target)) continue;
          closeCards(it, true);
        }
      };
      doc.addEventListener('click', onDoc);
      docOff = () => doc.removeEventListener('click', onDoc);
    };

    const refreshInst = async (it) => {
      const doc = gD();
      if (!it || !doc || !isConn(doc, it.host) || mode === 'off') return null;
      const cid = detCid(it.host, insts.size > 1);
      it.cid = cid;
      const snap = await reqSnap({ conversationId: cid, force: false }, it.host);
      if (insts.get(it.anc) === it && isConn(gD(), it.host)) applySnapToInst(it, snap);
      return snap;
    };

    const createBarInst = (doc, anc) => {
      const w = gW();
      const E = (t, a, k) => mk(doc, t, a, k);
      const host = E('div', {
        [FALLBACK_ATTR]: '1',
        [PRISM_BAR_ATTR]: 'true',
        'data-ag-owned': '1',
        'data-ag-no-i18n': '',
        translate: 'no',
        'data-no-translate': 'true',
        'data-ag-localization-skip': 'true',
        'data-agy-no-translate': 'true',
        'data-antigravity-zh-skip': '1',
      });
      if (typeof host.attachShadow !== 'function') return null;
      const sr = host.attachShadow({ mode: 'open' });
      sr.appendChild(E('style', { text: SHADOW_CSS }));

      const t0 = gStr();
      const cChip = E('button', { type: 'button', cls: 'chip', 'data-card': 'cache' }, [
        E('span', { cls: 'c-lbl', text: 'c' }),
        E('span', { cls: 'sub-badge', id: 'subagent-badge', hidden: true, text: '' }),
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
        E('span', { id: 'tps', hidden: true, text: '—' }),
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

      sr.appendChild(E('div', { cls: 'bar' }, [cChip, fChip, wChip, xChip]));
      sr.appendChild(sCard);
      sr.appendChild(xCard);

      const it = {
        anc, host, sr, cChip, fChip, wChip, xChip, sCard, xCard,
        ro: null, raf: 0, curTier: 0, pendW: 0, hasPendW: false, lastTv: '', cid: null, snap: null,
      };

      const markAct = () => { activeHost = host; };
      host.addEventListener?.('pointerdown', markAct);
      host.addEventListener?.('focusin', markAct);

      const tog = (card, btn) => {
        const nx = !!(card.hidden);
        activeHost = host;
        for (const other of insts.values()) {
          if (other !== it) closeCards(other, false);
        }
        sCard.hidden = xCard.hidden = true;
        xChip.setAttribute('aria-expanded', 'false');
        fChip.setAttribute('aria-expanded', 'false');
        wChip.setAttribute('aria-expanded', 'false');
        card.hidden = !nx;
        if (card === xCard) xChip.setAttribute('aria-expanded', String(nx));
        btn.setAttribute('aria-expanded', String(nx));
        if (nx) void refreshInst(it);
        try { w.__agPulseExternalBridge?.({ event: 'card', host, open: nx, data: it.snap || lastSnap }); } catch {}
      };
      xChip.addEventListener('click', (e) => { e?.stopPropagation?.(); tog(xCard, xChip); });
      fChip.addEventListener('click', (e) => { e?.stopPropagation?.(); tog(xCard, fChip); });
      wChip.addEventListener('click', (e) => { e?.stopPropagation?.(); tog(xCard, wChip); });

      seatIn(anc, host);
      insts.set(anc, it);
      instByHost.set(host, it);
      attachTierRec(it);
      return it;
    };

    const reconcileBars = (doc) => {
      const w = gW();
      if (!doc || !w) return { mounted: false, added: [], reseated: [] };
      const anchors = findAnchors(doc, true);
      const ancSet = new Set(anchors);
      for (const [anc, it] of Array.from(insts.entries())) {
        if (!ancSet.has(anc) || !isConn(doc, anc)) disposeInst(it, true);
      }
      const added = [], reseated = [];
      for (let i = 0; i < anchors.length; i++) {
        const anc = anchors[i];
        const existing = insts.get(anc);
        if (existing) {
          if (!isConn(doc, existing.host) || existing.host.parentElement !== anc) {
            try {
              seatIn(anc, existing.host);
              reseated.push(existing);
            } catch {}
          }
          attachTierRec(existing);
        } else {
          const created = createBarInst(doc, anc);
          if (created) added.push(created);
        }
      }
      syncPrimaryId();
      purgeOrphans(doc);
      if (insts.size > 0) {
        clrExtTiers();
        ensDocClick(doc);
        yielded = false;
      } else {
        if (docOff) { try { docOff(); } catch {} docOff = null; }
        clrPoll();
      }
      for (let i = 0; i < added.length; i++) {
        try { w.__agPulseExternalBridge?.({ event: 'mount', host: added[i].host }); } catch {}
      }
      for (let i = 0; i < reseated.length; i++) {
        try { w.__agPulseExternalBridge?.({ event: 'mount', host: reseated[i].host }); } catch {}
      }
      return { mounted: insts.size > 0, added, reseated };
    };

    let lastHealAt = 0;
    const HC_A = 'data-hover-card-popup';
    const SB_SEL = 'aside,[data-testid="sidebar-split"]>div:first-child,[data-testid="conversation-row-sidebar"],[data-testid="project-header"],[data-hover-card-popup]';
    const IGN_STREAM_SEL =
      '[data-testid="autoscroll-viewport"],[data-testid="planner-response-text"],[data-testid="agent-response"],[data-markdown-root],[data-testid="background-task-command"],[data-testid="running-items-card"],' + SB_SEL + ',[data-op-thought="1"],.ag-prism-thought-overlay,.ag-cs-conv-aura-host,.ag-cs-crab,.ag-cs-prism-rim-cv,.ag-anim-icon,.ag-cs-thinking-spark,[data-agy-hans-ui],#agy-theme-switcher,#agy-theme-menu,#antigravity-quota-widget,#antigravity-translation-audit';
    const isHcPortal = (el) => {
      if (!el || el.tagName === 'BODY' || el.tagName === 'HTML') return false;
      const h = (n, k) => !!n?.hasAttribute?.(k), f = el.firstElementChild;
      return h(el, HC_A) || h(f, HC_A) || h(f?.firstElementChild, HC_A) || (h(el, 'data-base-ui-portal') && !!el.querySelector?.('[data-hover-card-popup]'));
    };
    const isIgnoredStreamNode = (t) => {
      const el = t?.nodeType === 1 ? t : t?.parentElement;
      return !!(el && (isHcPortal(el) || (el.closest && !el.closest('.agy-composer-footer,[data-testid="input-box-bottom-toolbar"]') && el.closest(IGN_STREAM_SEL))));
    };

    const anchorsChanged = (doc) => {
      const ancs = findAnchors(doc, true);
      if (ancs.length !== insts.size) return true;
      for (let i = 0; i < ancs.length; i++) {
        const it = insts.get(ancs[i]);
        if (!it || !isConn(doc, it.host) || it.host.parentElement !== ancs[i]) return true;
      }
      return false;
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
          if (insts.size > 0) unmountFb(true);
          hideExt(false);
          return;
        }
        if (mode === 'on') {
          hideExt(true);
        } else {
          showExt();
          if (hasExt(null, true)) { yielded = true; if (insts.size > 0) unmountFb(true); ensTierObs(); return; }
        }
        if (insts.size > 0) {
          const res = reconcileBars(d);
          if (res.added.length > 0) void refresh();
          else if (insts.size > 0) ensTierObs();
        } else if ((mode === 'on' || waitTm === null) && findAnchors(d, true).length > 0) {
          mountFb();
        }
      };
      const schedHeal = (fast = false) => {
        if (mode === 'off' || healTm !== null) return;
        const wait = fast || Date.now() - lastHealAt >= 180 ? 45 : 180;
        healTm = setTimeout(runHeal, wait);
        healTm?.unref?.();
      };
      if (!seatObs && isFn(w.MutationObserver) && (doc.body || doc.documentElement)) {
        seatObs = new w.MutationObserver((recs) => {
          if (mode === 'off' || healTm !== null) return;
          if (Array.isArray(recs) && recs.length > 0) {
            const ignAll = (l) => { if (l) for (let j = 0; j < l.length; j++) if (!isIgnoredStreamNode(l[j])) return false; return true; };
            let rel = false;
            for (let i = 0; i < recs.length; i++) {
              const r = recs[i], a = r?.addedNodes, rm = r?.removedNodes;
              if (isIgnoredStreamNode(r?.target) || (((a?.length || 0) + (rm?.length || 0)) && ignAll(a) && ignAll(rm))) continue;
              rel = true; break;
            }
            if (!rel) return;
          }
          const inC = isConv(doc, w);
          let bars = null;
          const gB = () => bars || (bars = findExtBars(doc)), visB = (b) => b && b.getAttribute?.(HID_ATTR) !== '1';
          if (!inC) {
            if (insts.size > 0 || gB().some(visB)) schedHeal(true);
            return;
          }
          if (insts.size > 0) {
            if (anchorsChanged(doc)) { schedHeal(false); return; }
          } else if (waitTm === null && !hasExt(gB(), true) && hasAnyAnchor(doc, true)) {
            schedHeal(true); return;
          }
          const extMissingTier = gB().some((b) => visB(b) && b.shadowRoot && !b.shadowRoot.querySelector?.(`style[${TIER_STYLE_ATTR}="1"]`));
          let deadExtTier = false;
          for (const anc of extTiers.keys()) { if (!isConn(doc, anc)) { deadExtTier = true; break; } }
          if (deadExtTier || extMissingTier || (mode === 'on' && gB().some((b) => visB(b) && b.getAttribute?.(FALLBACK_ATTR) !== '1'))) {
            schedHeal(false);
          }
        });
        try { seatObs.observe(doc.body || doc.documentElement, { childList: true, subtree: true }); } catch {}
      }
      if (!popOff && isFn(w.addEventListener)) {
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
      if (mode !== 'off') {
        if (insts.size > 0 || ((mode === 'on' || !hasExt(null, true)) && waitTm === null && findAnchors(doc, true).length > 0)) {
          reconcileBars(doc);
        }
      }
      if (insts.size === 0) return null;
      ensTierObs();
      const live = Array.from(insts.values()).filter((it) => isConn(doc, it.host));
      if (live.length === 0) return null;
      const multi = live.length > 1;
      const reqByKey = new Map();
      for (let i = 0; i < live.length; i++) {
        const it = live[i];
        it.cid = detCid(it.host, multi);
        const key = it.cid || `__pane_${i}`;
        if (!reqByKey.has(key)) reqByKey.set(key, reqSnap({ conversationId: it.cid, force: false }, it.host));
      }
      const snaps = new Map();
      await Promise.all(Array.from(reqByKey.entries()).map(async ([k, p]) => { snaps.set(k, await p); }));
      let actSnap = null;
      const act = resolveActiveInst();
      for (let i = 0; i < live.length; i++) {
        const it = live[i];
        const key = it.cid || `__pane_${i}`;
        const snap = snaps.get(key) || null;
        if (insts.get(it.anc) === it && isConn(gD(), it.host)) applySnapToInst(it, snap);
        if (it === act || (!act && i === 0)) actSnap = snap;
      }
      return actSnap ?? lastSnap;
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

      const res = reconcileBars(doc);
      ensSeatObs();
      if (!res.mounted) return false;
      ensHost();
      ensTierObs();
      ensBlur();
      if (res.added.length > 0 || pollTm === null) {
        void refresh();
        startPoll();
      }
      return true;
    }

    const getBars = () => {
      const doc = gD(), out = [];
      for (const it of insts.values()) if (isConn(doc, it.host)) out.push(it.host);
      return out;
    };

    const getBarForView = (node) => {
      const doc = gD();
      if (!node || !doc) return null;
      const direct = instByHost.get(node);
      if (direct && isConn(doc, direct.host)) return direct.host;
      const cvSel = '[data-testid="conversation-view"],[data-testid="agent-input-box"],.agy-composer-footer';
      const cv = node.matches?.(cvSel) ? node : node.closest?.(cvSel);
      if (cv) {
        for (const it of insts.values()) {
          if (isConn(doc, it.host) && (cv === it.anc || cv.contains?.(it.anc) || it.anc.contains?.(cv))) return it.host;
        }
        const ext = cv.querySelector?.('#' + BAR_ID + ',[data-ag-pulse-bar="true"]');
        if (ext && usableExt(doc, ext)) return ext;
      }
      return null;
    };

    const setActiveBar = (target) => {
      const doc = gD();
      if (!target) { activeHost = null; return null; }
      const h = instByHost.has(target) ? target : getBarForView(target);
      if (!h || !isConn(doc, h)) return null;
      activeHost = h;
      const it = instByHost.get(h);
      try { gW()?.__agPulseExternalBridge?.({ event: 'focus', host: h, data: it?.snap || lastSnap }); } catch {}
      return h;
    };

    const getSnapshotForBar = (hostOrCid) => {
      if (!hostOrCid) return resolveActiveInst()?.snap || lastSnap;
      if (typeof hostOrCid === 'string') return snapByCid.get(hostOrCid) || lastSnap;
      const it = instByHost.get(hostOrCid) || instByHost.get(getBarForView(hostOrCid));
      return it?.snap || (it?.cid && snapByCid.get(it.cid)) || lastSnap;
    };

    const getState = () => {
      const doc = gD();
      let mountedCount = 0;
      for (const it of insts.values()) if (isConn(doc, it.host)) mountedCount++;
      const mounted = mountedCount > 0;
      const blurred = isBlur();
      if (mounted && blurred && pollTm !== null) { pollSusp = true; clrPoll(); }
      return {
        mode,
        mountedFallback: mounted,
        mountedCount,
        waitingForExternal: waitTm !== null,
        yieldedToExternal: !!(mode === 'auto' && (yielded || hasExt())),
        hasExternal: hasExt(),
        pollSuspended: !!(mounted && (pollSusp || blurred)),
      };
    };

    function sync(cfg) {
      if (cfg && typeof cfg.language === 'string' && cfg.language) {
        expLang = cfg.language.trim().toLowerCase() === 'auto' ? '' : normFbLang(cfg.language, gW());
      }
      const raw = cfg && cfg.telemetryModule;
      mode = raw === 'on' || raw === 'off' ? raw : 'auto';
      if (insts.size > 0 && mode !== 'off') {
        for (const it of insts.values()) {
          syncLblsFor(it.sr);
          if (it.snap || lastSnap) applySnapToInst(it, it.snap || lastSnap);
        }
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
      if (insts.size > 0) {
        reconcileBars(doc);
        if (insts.size > 0) return getState();
      }
      if (findExtBars(doc).some((b) => b && b.getAttribute?.(FALLBACK_ATTR) !== '1' && isConn(doc, b) && !usableExt(doc, b))) {
        clrWait();
        mountFb();
        return getState();
      }
      if (waitTm === null) {
        const ms = isFin(cfg?.__fallbackDelayMs) && cfg.__fallbackDelayMs >= 0 ? cfg.__fallbackDelayMs : WAIT_MS;
        waitTm = setTimeout(waitTimerDone, ms);
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
      snapByCid.clear();
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
      getLatestSnapshot: () => resolveActiveInst()?.snap || lastSnap,
      getSnapshotForBar,
      getBars,
      getPrimaryBar: () => getPrimaryInst()?.host || null,
      getActiveBar: () => resolveActiveInst()?.host || null,
      setActiveBar,
      getBarForView,
      getState,
      createTelemetryController,
    };
    return api;
  }

  return createTelemetryController();
});

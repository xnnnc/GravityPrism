// Obsidian Prism — Channel 7 Local Static/Dynamic Wallpaper Client Runtime (v1.0.8-beta.3 · Beta)
// Decoupled from Channel 1 static bundle:
// - Pure DOM construction (0 innerHTML), 5+1 anti-translation attributes, dedicated <style id="ag-prism-wallpaper-css">
// - 0 :has() selectors, balanced braces, 0 style impact when wallpaper is disabled
// - Automatic Browser Hole avoidance (CSS + MutationObserver)
// - Strict 0fps sleep for <video> on hidden / win-blur / chat mode / motion=off / browser-hole
// - Graceful CSP fallback for static images <= 8 MB via get-media-blob -> ObjectURL (with leak-free revokeObjectURL)
// - Full hardware decoder release on destroy(): video.pause() -> removeAttribute('src') -> load()

(function (root) {
  'use strict';
  const G = root || (typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : null);
  if (!G) return;

  const WALLPAPER_ROOT_ID = 'ag-prism-wallpaper-root';
  const WALLPAPER_STYLE_ID = 'ag-prism-wallpaper-css';
  const WALLPAPER_HTML_ATTR = 'data-ag-prism-wallpaper';
  const WALLPAPER_HOLE_ATTR = 'data-ag-prism-wallpaper-hole';
  const DEFAULT_RPC_TIMEOUT_MS = 10000;
  const PICK_RPC_TIMEOUT_MS = 125000;

  const NO_TR_ATTRS = [
    ['translate', 'no'],
    ['data-no-translate', 'true'],
    ['data-ag-localization-skip', 'true'],
    ['data-agy-no-translate', 'true'],
    ['data-antigravity-zh-skip', '1'],
    ['data-ag-no-i18n', ''],
  ];

  // Strictly pure ASCII, 0 :has(), balanced braces, 0 style impact when html[data-ag-prism-wallpaper="on"] is absent
  const WALLPAPER_CSS = [
    '#ag-prism-wallpaper-root{position:fixed;inset:0;z-index:-1;background:var(--body-background,var(--background,#0B0B0E));pointer-events:none;overflow:hidden;contain:strict;opacity:0;visibility:hidden;transition:opacity 180ms ease;}',
    'html[data-ag-prism-wallpaper="on"] #ag-prism-wallpaper-root{opacity:1;visibility:visible;}',
    'html[data-ag-prism-wallpaper="on"][data-ag-cs-motion="off"] #ag-prism-wallpaper-root{transition:none !important;}',
    '#ag-prism-wallpaper-root .ag-prism-wp-media{position:absolute;inset:calc(-1 * var(--ag-prism-wp-blur-pad,0px));width:calc(100% + 2 * var(--ag-prism-wp-blur-pad,0px));height:calc(100% + 2 * var(--ag-prism-wp-blur-pad,0px));object-fit:var(--ag-prism-wp-fit,cover);object-position:center;opacity:var(--ag-prism-wp-opacity,0.28);filter:var(--ag-prism-wp-filter,blur(4px));transform:translateZ(0);pointer-events:none;user-select:none;display:block;}',
    '#ag-prism-wallpaper-root .ag-prism-wp-dim{position:absolute;inset:0;pointer-events:none;background:rgba(8,10,14,var(--ag-prism-wp-dim,0.45));}',
    'html[data-ag-cs-theme="light"] #ag-prism-wallpaper-root .ag-prism-wp-dim,html>body:is(.theme-light,.light-theme,.light) #ag-prism-wallpaper-root .ag-prism-wp-dim{background:rgba(246,248,252,var(--ag-prism-wp-dim,0.45));}',
    'html[data-ag-prism-wallpaper="on"]:not([data-ag-prism-wallpaper-hole="1"])>body:not([data-has-browser-hole="true"]):not([data-has-drawer-browser-hole="true"]){background:transparent !important;background-color:transparent !important;}',
    'html[data-ag-prism-wallpaper="on"]:not([data-ag-prism-wallpaper-hole="1"]) :is(.agy-shell,.agy-inset-shell,.agy-sheet,[data-ag-cs-home-sheet="1"],[data-main-content-body]):not([data-has-browser-hole="true"]):not([data-has-drawer-browser-hole="true"]){background:transparent !important;background-color:transparent !important;}',
    'html[data-ag-prism-wallpaper="on"]:not([data-ag-prism-wallpaper-hole="1"]) .agy-sheet:not([data-has-browser-hole="true"]):not([data-has-drawer-browser-hole="true"])>div.flex-1.min-h-0.flex.flex-col,html[data-ag-prism-wallpaper="on"]:not([data-ag-prism-wallpaper-hole="1"]) .agy-sheet:not([data-has-browser-hole="true"]):not([data-has-drawer-browser-hole="true"])>div.flex-1.min-h-0.flex.flex-col>div.flex-1.min-w-0.h-full{background:transparent !important;background-color:transparent !important;}',
    'html[data-ag-prism-wallpaper="on"]:not([data-ag-prism-wallpaper-hole="1"]) :is(aside,[data-testid="sidebar-split"]>div:first-child,.agy-shell .bg-sidebar):not([data-has-browser-hole="true"]):not([data-has-drawer-browser-hole="true"]){background:color-mix(in srgb,var(--sidebar,var(--ag-cs-sidebar,var(--background,#0B0B0E))) 68%,transparent) !important;background-color:color-mix(in srgb,var(--sidebar,var(--ag-cs-sidebar,var(--background,#0B0B0E))) 68%,transparent) !important;}',
    'html[data-ag-prism-wallpaper="on"]:not([data-ag-prism-wallpaper-hole="1"]) [data-ag-cs-conv-seat="1"]:not([data-has-browser-hole="true"]):not([data-has-drawer-browser-hole="true"]){background-color:color-mix(in srgb,var(--background,#0B0B0E) 52%,transparent) !important;}',
    'html[data-ag-prism-wallpaper="on"]:not([data-ag-prism-wallpaper-hole="1"]) [data-testid="conversation-view"]::before{display:none !important;background:none !important;}',
    'html[data-ag-prism-wallpaper="on"]:not([data-ag-prism-wallpaper-hole="1"]) [data-testid="plugin-theme-home-wallpaper"]{display:none !important;visibility:hidden !important;opacity:0 !important;pointer-events:none !important;}',
    'html[data-ag-prism-wallpaper="on"][data-ag-cs-theme="light"]:not([data-ag-prism-wallpaper-hole="1"]) :is(.agy-shell,.agy-inset-shell,.agy-sheet,[data-ag-cs-home-sheet="1"],[data-main-content-body]):not([data-has-browser-hole="true"]):not([data-has-drawer-browser-hole="true"]),html[data-ag-prism-wallpaper="on"]:not([data-ag-prism-wallpaper-hole="1"])>body:is(.theme-light,.light-theme,.light) :is(.agy-shell,.agy-inset-shell,.agy-sheet,[data-ag-cs-home-sheet="1"],[data-main-content-body]):not([data-has-browser-hole="true"]):not([data-has-drawer-browser-hole="true"]){background:transparent !important;background-color:transparent !important;}',
    'html[data-ag-prism-wallpaper="on"][data-ag-cs-theme="light"]:not([data-ag-prism-wallpaper-hole="1"]) .agy-sheet:not([data-has-browser-hole="true"]):not([data-has-drawer-browser-hole="true"])>div.flex-1.min-h-0.flex.flex-col,html[data-ag-prism-wallpaper="on"][data-ag-cs-theme="light"]:not([data-ag-prism-wallpaper-hole="1"]) .agy-sheet:not([data-has-browser-hole="true"]):not([data-has-drawer-browser-hole="true"])>div.flex-1.min-h-0.flex.flex-col>div.flex-1.min-w-0.h-full,html[data-ag-prism-wallpaper="on"]:not([data-ag-prism-wallpaper-hole="1"])>body:is(.theme-light,.light-theme,.light) .agy-sheet:not([data-has-browser-hole="true"]):not([data-has-drawer-browser-hole="true"])>div.flex-1.min-h-0.flex.flex-col,html[data-ag-prism-wallpaper="on"]:not([data-ag-prism-wallpaper-hole="1"])>body:is(.theme-light,.light-theme,.light) .agy-sheet:not([data-has-browser-hole="true"]):not([data-has-drawer-browser-hole="true"])>div.flex-1.min-h-0.flex.flex-col>div.flex-1.min-w-0.h-full{background:transparent !important;background-color:transparent !important;}',
    'html[data-ag-prism-wallpaper="on"][data-ag-cs-theme="light"]:not([data-ag-prism-wallpaper-hole="1"]) :is(aside,[data-testid="sidebar-split"]>div:first-child,.agy-shell .bg-sidebar):not([data-has-browser-hole="true"]):not([data-has-drawer-browser-hole="true"]),html[data-ag-prism-wallpaper="on"]:not([data-ag-prism-wallpaper-hole="1"])>body:is(.theme-light,.light-theme,.light) :is(aside,[data-testid="sidebar-split"]>div:first-child,.agy-shell .bg-sidebar):not([data-has-browser-hole="true"]):not([data-has-drawer-browser-hole="true"]){background:color-mix(in srgb,var(--sidebar,var(--ag-cs-sidebar,var(--background,#F4F7FB))) 74%,transparent) !important;background-color:color-mix(in srgb,var(--sidebar,var(--ag-cs-sidebar,var(--background,#F4F7FB))) 74%,transparent) !important;}',
    'html[data-ag-prism-wallpaper="on"][data-ag-cs-theme="light"]:not([data-ag-prism-wallpaper-hole="1"]) [data-ag-cs-conv-seat="1"]:not([data-has-browser-hole="true"]):not([data-has-drawer-browser-hole="true"]),html[data-ag-prism-wallpaper="on"]:not([data-ag-prism-wallpaper-hole="1"])>body:is(.theme-light,.light-theme,.light) [data-ag-cs-conv-seat="1"]:not([data-has-browser-hole="true"]):not([data-has-drawer-browser-hole="true"]){background-color:color-mix(in srgb,var(--background,#F4F7FB) 66%,transparent) !important;}',
    'body[data-has-browser-hole="true"] #ag-prism-wallpaper-root,body[data-has-drawer-browser-hole="true"] #ag-prism-wallpaper-root,html[data-ag-prism-wallpaper-hole="1"] #ag-prism-wallpaper-root{display:none !important;visibility:hidden !important;opacity:0 !important;}',
    '[data-testid="prism-wallpaper-slot"]{margin-top:10px;}',
    '.ag-prism-wp-card{display:flex;flex-direction:column;gap:10px;padding:12px 14px;border-radius:var(--ag-cs-r-md,10px);border:1px solid var(--ag-cs-border-1,rgba(128,128,128,0.22));background:var(--ag-cs-tonal-2,rgba(20,22,28,0.72));}',
    'html[data-ag-cs-theme="light"] .ag-prism-wp-card,html>body:is(.theme-light,.light-theme,.light) .ag-prism-wp-card{background:var(--ag-cs-tonal-2,rgba(255,255,255,0.88));border-color:var(--ag-cs-border-1,rgba(15,23,42,0.10));}',
    '.ag-prism-wp-row{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;}',
    '.ag-prism-wp-meta{display:flex;flex-direction:column;gap:2px;flex:1 1 200px;min-width:0;}',
    '.ag-prism-wp-title{font-size:13px;font-weight:600;color:var(--foreground);line-height:1.35;}',
    '.ag-prism-wp-desc{font-size:11.5px;color:var(--muted-foreground);line-height:1.45;}',
    '.ag-prism-wp-path-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;width:100%;}',
    '.ag-prism-wp-path-input{flex:1 1 200px;min-width:0;height:30px;padding:0 9px;border-radius:var(--ag-cs-r-sm,6px);border:1px solid var(--ag-cs-border-1,rgba(128,128,128,0.28));background:var(--ag-cs-tonal-1,rgba(10,11,15,0.45));color:var(--foreground);font-size:12px;outline:none;}',
    'html[data-ag-cs-theme="light"] .ag-prism-wp-path-input,html>body:is(.theme-light,.light-theme,.light) .ag-prism-wp-path-input{background:rgba(241,245,249,0.75);}',
    '.ag-prism-wp-path-input:focus{border-color:var(--primary,#669DF6);}',
    '.ag-prism-wp-sliders{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;width:100%;}',
    '.ag-prism-wp-slider-item{display:flex;flex-direction:column;gap:4px;}',
    '.ag-prism-wp-slider-head{display:flex;align-items:center;justify-content:space-between;font-size:11.5px;color:var(--muted-foreground);}',
    '.ag-prism-wp-slider-val{font-variant-numeric:tabular-nums;color:var(--foreground);font-weight:500;}',
    '.ag-prism-wp-range{width:100%;accent-color:var(--primary,#669DF6);cursor:pointer;height:18px;}',
    '.ag-prism-wp-status{font-size:11.5px;line-height:1.45;padding:6px 9px;border-radius:var(--ag-cs-r-sm,6px);border:1px solid var(--ag-cs-border-1,rgba(128,128,128,0.20));background:var(--ag-cs-pill-bg,rgba(128,128,128,0.06));color:var(--muted-foreground);}',
    '.ag-prism-wp-status[data-tone="ok"]{color:var(--foreground);border-color:rgba(74,222,128,0.32);}',
    '.ag-prism-wp-status[data-tone="warn"]{color:#D97706;border-color:rgba(217,119,6,0.35);}',
    '.ag-prism-wp-status[data-tone="error"]{color:#EF4444;border-color:rgba(239,68,68,0.38);}',
  ].join('\n');

  const CSS_VARS = [
    '--ag-prism-wp-opacity',
    '--ag-prism-wp-blur',
    '--ag-prism-wp-filter',
    '--ag-prism-wp-blur-pad',
    '--ag-prism-wp-dim',
    '--ag-prism-wp-fit',
  ];

  function markNoTrOwned(el) {
    if (el && typeof el.setAttribute === 'function') {
      for (let i = 0; i < NO_TR_ATTRS.length; i++) {
        el.setAttribute(NO_TR_ATTRS[i][0], NO_TR_ATTRS[i][1]);
      }
      el.setAttribute('data-ag-owned', '1');
    }
    return el;
  }

  function clampNum(val, min, max, fallback) {
    const n = Number(val);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function decodeBase64ToBytes(b64, win) {
    const s = String(b64 || '').trim();
    if (!s) return new Uint8Array(0);
    if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
      const buf = Buffer.from(s, 'base64');
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    }
    const atobFn = (win && typeof win.atob === 'function' && win.atob) || (typeof atob === 'function' ? atob : null);
    if (!atobFn) return new Uint8Array(0);
    const bin = atobFn(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      out[i] = bin.charCodeAt(i) & 0xff;
    }
    return out;
  }

  function releaseVideoElement(videoEl) {
    if (!videoEl) return;
    try {
      if (typeof videoEl.pause === 'function') videoEl.pause();
    } catch {}
    try {
      if (typeof videoEl.removeAttribute === 'function') videoEl.removeAttribute('src');
    } catch {}
    try {
      videoEl.src = '';
    } catch {}
    try {
      if (typeof videoEl.load === 'function') videoEl.load();
    } catch {}
  }

  function createWallpaperBridge(win) {
    const pending = new Map();
    let seq = 1;
    let disposed = false;

    function resolve(id, resp) {
      const numId = Number(id);
      const entry = pending.get(numId);
      if (!entry) return false;
      pending.delete(numId);
      if (entry.timer) {
        try {
          clearTimeout(entry.timer);
        } catch {}
      }
      entry.resolve(resp && typeof resp === 'object' ? resp : { ok: false, error: 'invalid-response' });
      return true;
    }

    function isOnline() {
      return !disposed && typeof win.__agPrismWallpaperCall === 'function';
    }

    function call(action, payload = {}) {
      if (disposed) {
        return Promise.resolve({ ok: false, offline: true, code: 'bridge-disposed', error: 'Wallpaper bridge disposed' });
      }
      const rawFn = typeof win.__agPrismWallpaperCall === 'function' ? win.__agPrismWallpaperCall : null;
      if (!rawFn) {
        return Promise.resolve({ ok: false, offline: true, code: 'bridge-offline', error: 'Wallpaper daemon bridge offline' });
      }
      const id = seq++;
      const timeoutMs = action === 'pick-media' ? PICK_RPC_TIMEOUT_MS : DEFAULT_RPC_TIMEOUT_MS;
      return new Promise((res) => {
        const timer = setTimeout(() => {
          if (pending.has(id)) {
            pending.delete(id);
            res({ ok: false, timeout: true, code: 'rpc-timeout', error: 'Wallpaper request timed out' });
          }
        }, timeoutMs);
        pending.set(id, { resolve: res, timer });
        try {
          const ret = rawFn(JSON.stringify({ id, action, payload: payload || {} }));
          // 兼容单测或非 CDP 环境中直接返回 Promise 的 mock 实现
          if (ret && typeof ret.then === 'function') {
            ret.then(
              (val) => resolve(id, val),
              (err) => resolve(id, { ok: false, code: 'rpc-error', error: String(err?.message || err) })
            );
          }
        } catch (err) {
          resolve(id, { ok: false, code: 'rpc-error', error: String(err?.message || err) });
        }
      });
    }

    function dispose() {
      disposed = true;
      for (const [id, entry] of pending.entries()) {
        pending.delete(id);
        if (entry.timer) {
          try {
            clearTimeout(entry.timer);
          } catch {}
        }
        try {
          entry.resolve({ ok: false, offline: true, code: 'bridge-disposed' });
        } catch {}
      }
    }

    const bridge = {
      call,
      resolve,
      isOnline,
      dispose,
      getConfig: () => call('get-config', {}),
      saveConfig: (patch) => call('save-config', patch || {}),
      pickMedia: (opts) => call('pick-media', opts || {}),
      clearMedia: () => call('clear-media', {}),
      getMediaBlob: (opts) => call('get-media-blob', opts || {}),
      status: () => call('status', {}),
    };

    try {
      win.__agPrismWallpaperBridge = bridge;
      win.__agPrismWallpaperResolve = resolve;
    } catch {}
    return bridge;
  }

  function createWallpaperClient(opts = {}) {
    const win = opts.window || (typeof window !== 'undefined' ? window : G);
    const doc = opts.document || (win && win.document) || (typeof document !== 'undefined' ? document : null);
    if (!win || !doc) return null;

    const bridge = opts.bridge || createWallpaperBridge(win);
    const subscribers = new Set();

    let state = {
      version: 1,
      enabled: false,
      mediaPath: '',
      mediaType: '',
      mediaUrl: '',
      opacity: 0.28,
      blurPx: 4,
      dimOverlay: 0.45,
      fit: 'cover',
      pauseOnBlur: true,
      rev: 0,
      serverRunning: false,
      mediaError: '',
    };

    let destroyed = false;
    let winBlurred = false;
    try {
      if (typeof doc.hasFocus === 'function' && doc.hasFocus() === false) {
        winBlurred = true;
      }
    } catch {}
    let rootEl = null;
    let dimEl = null;
    let mediaEl = null;
    let mediaTag = '';
    let activeSrc = '';
    let activeObjectUrl = '';
    let renderMode = 'idle'; // 'idle' | 'http' | 'blob-fallback' | 'error'
    let lastError = '';
    let blobFallbackTriedRev = -1;
    let blobFallbackInFlight = false;
    let htmlObserver = null;
    let bodyObserver = null;
    let listenersBound = false;
    let videoPausedByRule = false;

    function notifySubscribers() {
      const snap = getState();
      for (const fn of subscribers) {
        try {
          fn(snap);
        } catch {}
      }
    }

    function revokeActiveObjectUrl() {
      if (!activeObjectUrl) return;
      const toRevoke = activeObjectUrl;
      activeObjectUrl = '';
      try {
        const urlApi = win.URL || (typeof URL !== 'undefined' ? URL : null);
        if (urlApi && typeof urlApi.revokeObjectURL === 'function') {
          urlApi.revokeObjectURL(toRevoke);
        }
      } catch {}
    }

    function ensureStyleTag() {
      if (destroyed || !doc.head) return null;
      let st = doc.getElementById ? doc.getElementById(WALLPAPER_STYLE_ID) : null;
      if (!st) {
        st = doc.createElement('style');
        st.id = WALLPAPER_STYLE_ID;
        markNoTrOwned(st);
        st.textContent = WALLPAPER_CSS;
        doc.head.appendChild(st);
      } else if (st.textContent !== WALLPAPER_CSS) {
        st.textContent = WALLPAPER_CSS;
      }
      return st;
    }

    function isBrowserHoleActive() {
      const body = doc.body;
      if (!body || typeof body.getAttribute !== 'function') return false;
      return (
        body.getAttribute('data-has-browser-hole') === 'true' ||
        body.getAttribute('data-has-drawer-browser-hole') === 'true'
      );
    }

    function syncHoleAvoidance() {
      if (destroyed) return false;
      const hole = isBrowserHoleActive();
      const html = doc.documentElement;
      if (html) {
        if (hole) html.setAttribute(WALLPAPER_HOLE_ATTR, '1');
        else html.removeAttribute(WALLPAPER_HOLE_ATTR);
      }
      if (rootEl) {
        rootEl.hidden = hole;
        if (hole) {
          rootEl.setAttribute('data-hole-hidden', '1');
          if (rootEl.style) rootEl.style.display = 'none';
        } else {
          rootEl.removeAttribute('data-hole-hidden');
          if (rootEl.style) rootEl.style.display = '';
        }
      }
      return hole;
    }

    function shouldPauseVideo() {
      if (destroyed || !state.enabled || state.mediaType !== 'video') return true;
      if (isBrowserHoleActive()) return true;
      if (doc.hidden === true) return true;
      const html = doc.documentElement;
      if (html && typeof html.getAttribute === 'function') {
        if (html.getAttribute('data-ag-prism-mode') === 'chat') return true;
        if (html.getAttribute('data-ag-cs-motion') === 'off') return true;
        if (html.getAttribute('data-ag-pp-open') === '1') return true;
        if (state.pauseOnBlur !== false && html.getAttribute('data-ag-cs-win-blur') === '1') return true;
      }
      if (state.pauseOnBlur !== false && winBlurred) return true;
      return false;
    }

    function syncVideoPlayback() {
      if (destroyed) return;
      if (!mediaEl || mediaTag !== 'VIDEO') {
        videoPausedByRule = false;
        return;
      }
      if (shouldPauseVideo()) {
        videoPausedByRule = true;
        try {
          if (typeof mediaEl.pause === 'function') mediaEl.pause();
        } catch {}
        return;
      }
      videoPausedByRule = false;
      try {
        if (typeof mediaEl.play === 'function') {
          const p = mediaEl.play();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        }
      } catch {}
    }

    function applyCssVars() {
      const html = doc.documentElement;
      if (!html || !html.style || typeof html.style.setProperty !== 'function') return;
      const opacity = clampNum(state.opacity, 0.05, 0.85, 0.28);
      const blurPx = clampNum(state.blurPx, 0, 24, 4);
      const dimOverlay = clampNum(state.dimOverlay, 0, 0.85, 0.45);
      const fit = state.fit === 'contain' ? 'contain' : 'cover';
      const blurPad = blurPx > 0 ? Math.min(48, Math.ceil(blurPx * 2)) : 0;
      html.style.setProperty('--ag-prism-wp-opacity', String(opacity));
      html.style.setProperty('--ag-prism-wp-blur', `${blurPx}px`);
      html.style.setProperty('--ag-prism-wp-filter', blurPx > 0 ? `blur(${blurPx}px)` : 'none');
      html.style.setProperty('--ag-prism-wp-blur-pad', `${blurPad}px`);
      html.style.setProperty('--ag-prism-wp-dim', String(dimOverlay));
      html.style.setProperty('--ag-prism-wp-fit', fit);
    }

    function clearCssVars() {
      const html = doc.documentElement;
      if (!html || !html.style || typeof html.style.removeProperty !== 'function') return;
      for (let i = 0; i < CSS_VARS.length; i++) {
        html.style.removeProperty(CSS_VARS[i]);
      }
    }

    function unmountMediaNode() {
      if (mediaEl) {
        if (mediaTag === 'VIDEO') {
          releaseVideoElement(mediaEl);
        }
        try {
          mediaEl.remove?.();
        } catch {}
      }
      mediaEl = null;
      mediaTag = '';
      activeSrc = '';
      revokeActiveObjectUrl();
    }

    function unmountRootLayer() {
      unmountMediaNode();
      if (rootEl) {
        try {
          rootEl.remove?.();
        } catch {}
      }
      rootEl = null;
      dimEl = null;
      const html = doc.documentElement;
      if (html) {
        html.removeAttribute(WALLPAPER_HTML_ATTR);
        html.removeAttribute(WALLPAPER_HOLE_ATTR);
      }
      clearCssVars();
    }

    function ensureRootLayer() {
      if (destroyed || !doc.body) return null;
      if (rootEl && rootEl.parentElement === doc.body) return rootEl;
      const existing = doc.getElementById ? doc.getElementById(WALLPAPER_ROOT_ID) : null;
      if (existing) {
        existing.remove?.();
      }
      const el = doc.createElement('div');
      el.id = WALLPAPER_ROOT_ID;
      markNoTrOwned(el);
      el.setAttribute('aria-hidden', 'true');
      el.setAttribute('data-ag-prism-layer', 'wallpaper');
      const dim = doc.createElement('div');
      dim.className = 'ag-prism-wp-dim';
      markNoTrOwned(dim);
      el.appendChild(dim);
      if (doc.body.firstChild && typeof doc.body.insertBefore === 'function') {
        doc.body.insertBefore(el, doc.body.firstChild);
      } else {
        doc.body.appendChild(el);
      }
      rootEl = el;
      dimEl = dim;
      return rootEl;
    }

    async function tryImageBlobFallback(targetImg, targetRev) {
      if (destroyed || blobFallbackInFlight || blobFallbackTriedRev === targetRev) return;
      if (!state.enabled || state.mediaType !== 'image') return;
      blobFallbackTriedRev = targetRev;
      blobFallbackInFlight = true;
      try {
        const res = await bridge.getMediaBlob({ rev: targetRev });
        if (destroyed || !state.enabled || state.rev !== targetRev || targetImg !== mediaEl) {
          return;
        }
        if (!res || !res.ok || !res.base64 || !res.mimeType) {
          renderMode = 'error';
          lastError = (res && (res.code || res.error)) || 'csp-blocked';
          notifySubscribers();
          return;
        }
        const bytes = decodeBase64ToBytes(res.base64, win);
        const BlobCtor = win.Blob || (typeof Blob !== 'undefined' ? Blob : null);
        const urlApi = win.URL || (typeof URL !== 'undefined' ? URL : null);
        if (!BlobCtor || !urlApi || typeof urlApi.createObjectURL !== 'function' || bytes.length === 0) {
          renderMode = 'error';
          lastError = 'blob-api-unavailable';
          notifySubscribers();
          return;
        }
        const blob = new BlobCtor([bytes], { type: res.mimeType });
        const nextUrl = urlApi.createObjectURL(blob);
        // 撤销旧 ObjectURL 防内存泄漏
        revokeActiveObjectUrl();
        activeObjectUrl = nextUrl;
        activeSrc = nextUrl;
        renderMode = 'blob-fallback';
        lastError = '';
        targetImg.setAttribute('data-render-mode', 'blob-fallback');
        targetImg.src = nextUrl;
        notifySubscribers();
      } catch {
        if (!destroyed) {
          renderMode = 'error';
          lastError = 'csp-fallback-failed';
          notifySubscribers();
        }
      } finally {
        blobFallbackInFlight = false;
      }
    }

    function renderMedia() {
      if (destroyed) return;
      ensureStyleTag();

      const hasActiveMedia = Boolean(state.enabled && (state.mediaUrl || activeObjectUrl) && (state.mediaType === 'image' || state.mediaType === 'video'));
      if (!hasActiveMedia) {
        unmountRootLayer();
        renderMode = 'idle';
        if (!state.enabled) lastError = '';
        else if (state.mediaError) lastError = state.mediaError;
        notifySubscribers();
        return;
      }

      const layer = ensureRootLayer();
      if (!layer) return;

      const html = doc.documentElement;
      if (html) html.setAttribute(WALLPAPER_HTML_ATTR, 'on');
      applyCssVars();

      const wantTag = state.mediaType === 'video' ? 'VIDEO' : 'IMG';
      const targetUrl = state.mediaUrl || '';
      const needRebuild =
        !mediaEl ||
        mediaTag !== wantTag ||
        (renderMode !== 'blob-fallback' && activeSrc !== targetUrl) ||
        (renderMode === 'blob-fallback' && state.rev !== blobFallbackTriedRev && targetUrl && targetUrl !== activeSrc);

      if (needRebuild) {
        unmountMediaNode();
        blobFallbackInFlight = false;
        if (state.rev !== blobFallbackTriedRev) {
          blobFallbackTriedRev = -1;
        }
        const el = doc.createElement(wantTag.toLowerCase());
        el.className = 'ag-prism-wp-media';
        markNoTrOwned(el);
        el.setAttribute('aria-hidden', 'true');
        el.setAttribute('draggable', 'false');

        if (wantTag === 'VIDEO') {
          el.muted = true;
          el.loop = true;
          el.playsInline = true;
          el.setAttribute('muted', '');
          el.setAttribute('loop', '');
          el.setAttribute('playsinline', '');
          el.setAttribute('preload', 'metadata');
          el.setAttribute('tabindex', '-1');
          el.addEventListener('error', () => {
            if (destroyed || el !== mediaEl) return;
            renderMode = 'error';
            lastError = 'video-stream-blocked';
            notifySubscribers();
          });
          el.src = targetUrl;
        } else {
          el.setAttribute('alt', '');
          el.setAttribute('decoding', 'async');
          const curRev = state.rev;
          el.addEventListener('error', () => {
            if (destroyed || el !== mediaEl) return;
            if (activeObjectUrl && el.src === activeObjectUrl) {
              renderMode = 'error';
              lastError = 'image-decode-failed';
              notifySubscribers();
              return;
            }
            void tryImageBlobFallback(el, curRev);
          });
          el.src = targetUrl;
        }

        if (dimEl && typeof layer.insertBefore === 'function') {
          layer.insertBefore(el, dimEl);
        } else {
          layer.appendChild(el);
        }
        mediaEl = el;
        mediaTag = wantTag;
        activeSrc = targetUrl;
        renderMode = 'http';
        lastError = '';
      }

      syncHoleAvoidance();
      syncVideoPlayback();
      notifySubscribers();
    }

    const onVisibilityChange = () => {
      if (destroyed) return;
      syncVideoPlayback();
    };
    const onWindowBlur = () => {
      if (destroyed) return;
      winBlurred = true;
      syncVideoPlayback();
    };
    const onWindowFocus = () => {
      if (destroyed) return;
      winBlurred = false;
      syncVideoPlayback();
    };
    const onDocPointerDown = () => {
      if (destroyed) return;
      if (winBlurred) {
        winBlurred = false;
        syncVideoPlayback();
      }
    };

    function bindObserversAndListeners() {
      if (destroyed || listenersBound) return;
      listenersBound = true;
      try {
        doc.addEventListener?.('visibilitychange', onVisibilityChange);
        doc.addEventListener?.('pointerdown', onDocPointerDown, { passive: true });
      } catch {}
      try {
        win.addEventListener?.('blur', onWindowBlur);
        win.addEventListener?.('focus', onWindowFocus);
      } catch {}

      const MO = win.MutationObserver || (typeof MutationObserver === 'function' ? MutationObserver : null);
      if (typeof MO === 'function') {
        if (doc.documentElement) {
          htmlObserver = new MO((records) => {
            if (destroyed) return;
            for (let i = 0; i < records.length; i++) {
              const attr = records[i] && records[i].attributeName;
              if (attr === 'data-ag-cs-win-blur') {
                const v = doc.documentElement.getAttribute('data-ag-cs-win-blur');
                winBlurred = v === '1';
              }
            }
            syncVideoPlayback();
          });
          try {
            htmlObserver.observe(doc.documentElement, {
              attributes: true,
              attributeFilter: ['data-ag-cs-win-blur', 'data-ag-prism-mode', 'data-ag-cs-motion', 'data-ag-cs-theme', 'data-ag-pp-open'],
            });
          } catch {}
        }
        if (doc.body) {
          bodyObserver = new MO(() => {
            if (destroyed) return;
            syncHoleAvoidance();
            syncVideoPlayback();
          });
          try {
            bodyObserver.observe(doc.body, {
              attributes: true,
              attributeFilter: ['data-has-browser-hole', 'data-has-drawer-browser-hole'],
            });
          } catch {}
        }
      }
    }

    function applyConfig(nextCfg) {
      if (destroyed || !nextCfg || typeof nextCfg !== 'object') return getState();
      if (bridge.isOnline() && lastError === 'bridge-offline') {
        lastError = '';
      }
      const prevRev = state.rev;
      const prevUrl = state.mediaUrl;
      state = {
        ...state,
        ...nextCfg,
        version: 1,
        enabled: Boolean(nextCfg.enabled),
        mediaPath: typeof nextCfg.mediaPath === 'string' ? nextCfg.mediaPath : state.mediaPath,
        mediaType:
          nextCfg.mediaType === 'image' || nextCfg.mediaType === 'video' || nextCfg.mediaType === ''
            ? nextCfg.mediaType
            : state.mediaType,
        mediaUrl: typeof nextCfg.mediaUrl === 'string' ? nextCfg.mediaUrl : state.mediaUrl,
        opacity: clampNum(nextCfg.opacity, 0.05, 0.85, state.opacity),
        blurPx: clampNum(nextCfg.blurPx, 0, 24, state.blurPx),
        dimOverlay: clampNum(nextCfg.dimOverlay, 0, 0.85, state.dimOverlay),
        fit: nextCfg.fit === 'contain' ? 'contain' : 'cover',
        pauseOnBlur: nextCfg.pauseOnBlur === undefined ? state.pauseOnBlur : Boolean(nextCfg.pauseOnBlur),
        rev: Number.isFinite(Number(nextCfg.rev)) ? Number(nextCfg.rev) : state.rev,
        serverRunning: Boolean(nextCfg.serverRunning),
        mediaError: typeof nextCfg.mediaError === 'string' ? nextCfg.mediaError : '',
      };
      if (state.rev !== prevRev || state.mediaUrl !== prevUrl) {
        blobFallbackTriedRev = -1;
        if (renderMode === 'blob-fallback') {
          revokeActiveObjectUrl();
          renderMode = 'idle';
        }
      }
      renderMedia();
      return getState();
    }

    function previewVisualVars(patch = {}) {
      if (destroyed || !patch || typeof patch !== 'object') return;
      if (patch.opacity !== undefined) state.opacity = clampNum(patch.opacity, 0.05, 0.85, state.opacity);
      if (patch.blurPx !== undefined) state.blurPx = clampNum(patch.blurPx, 0, 24, state.blurPx);
      if (patch.dimOverlay !== undefined) state.dimOverlay = clampNum(patch.dimOverlay, 0, 0.85, state.dimOverlay);
      if (patch.fit === 'cover' || patch.fit === 'contain') state.fit = patch.fit;
      if (state.enabled) applyCssVars();
    }

    async function refresh() {
      if (destroyed) return { ok: false, destroyed: true };
      const res = await bridge.getConfig();
      if (destroyed) return { ok: false, destroyed: true };
      if (res && res.ok) {
        if (lastError === 'bridge-offline') lastError = '';
        if (res.config) {
          applyConfig(res.config);
        } else {
          notifySubscribers();
        }
      } else if (res && res.offline) {
        lastError = 'bridge-offline';
        notifySubscribers();
      }
      return res;
    }

    function sync(bootCfg) {
      if (destroyed) return;
      ensureStyleTag();
      bindObserversAndListeners();
      if (bootCfg && typeof bootCfg === 'object' && Object.prototype.hasOwnProperty.call(bootCfg, 'mediaPath')) {
        applyConfig(bootCfg);
      } else {
        syncHoleAvoidance();
        syncVideoPlayback();
      }
      if (bridge.isOnline()) {
        void refresh();
      }
    }

    function getState() {
      return {
        ...state,
        renderMode,
        lastError,
        holeHidden: isBrowserHoleActive(),
        videoPaused: videoPausedByRule,
        hasObjectUrl: Boolean(activeObjectUrl),
        bridgeOnline: bridge.isOnline(),
      };
    }

    function getDebugState() {
      return {
        destroyed,
        renderMode,
        lastError,
        mediaTag,
        hasRoot: Boolean(rootEl && rootEl.parentElement),
        hasStyle: Boolean(doc.getElementById && doc.getElementById(WALLPAPER_STYLE_ID)),
        holeHidden: isBrowserHoleActive(),
        videoPaused: videoPausedByRule,
        hasObjectUrl: Boolean(activeObjectUrl),
        activeObjectUrl,
        listenersBound,
      };
    }

    function subscribe(fn) {
      if (typeof fn !== 'function') return () => {};
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      subscribers.clear();
      try {
        htmlObserver?.disconnect?.();
      } catch {}
      htmlObserver = null;
      try {
        bodyObserver?.disconnect?.();
      } catch {}
      bodyObserver = null;
      if (listenersBound) {
        listenersBound = false;
        try {
          doc.removeEventListener?.('visibilitychange', onVisibilityChange);
          doc.removeEventListener?.('pointerdown', onDocPointerDown);
        } catch {}
        try {
          win.removeEventListener?.('blur', onWindowBlur);
          win.removeEventListener?.('focus', onWindowFocus);
        } catch {}
      }
      unmountRootLayer();
      // 兜底再次查询 DOM 中的视频节点并释放硬件解码管线
      try {
        const orphanRoot = doc.getElementById ? doc.getElementById(WALLPAPER_ROOT_ID) : null;
        if (orphanRoot) {
          const orphanVids = orphanRoot.querySelectorAll ? orphanRoot.querySelectorAll('video') : [];
          for (let i = 0; i < orphanVids.length; i++) {
            releaseVideoElement(orphanVids[i]);
          }
          orphanRoot.remove?.();
        }
      } catch {}
      try {
        const st = doc.getElementById ? doc.getElementById(WALLPAPER_STYLE_ID) : null;
        if (st) st.remove?.();
      } catch {}
      bridge.dispose();
    }

    ensureStyleTag();
    bindObserversAndListeners();

    return {
      sync,
      refresh,
      applyConfig,
      previewVisualVars,
      syncHoleAvoidance,
      syncVideoPlayback,
      shouldPauseVideo,
      getState,
      getDebugState,
      subscribe,
      bridge,
      destroy,
    };
  }

  const exported = {
    WALLPAPER_ROOT_ID,
    WALLPAPER_STYLE_ID,
    WALLPAPER_HTML_ATTR,
    WALLPAPER_CSS,
    createWallpaperBridge,
    createWallpaperClient,
    releaseVideoElement,
  };

  G.__agPrismWallpaperFactory = createWallpaperClient;
  if (typeof window !== 'undefined') {
    window.__agPrismWallpaperFactory = createWallpaperClient;
  }
  if (typeof module === 'object' && module.exports) {
    module.exports = exported;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : null);

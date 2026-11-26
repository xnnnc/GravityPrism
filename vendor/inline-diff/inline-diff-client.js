// Obsidian Prism — Channel 6 Inline Tool-Chain Diff Client (vendor/inline-diff/inline-diff-client.js)
// Decoupled from Channel 1 static bundle: mounts its own <style id="ag-prism-inline-diff-css">,
// handles diff chip decoration, right-click menu cooperation, hover prefetch, RPC (__agPrismInlineDiffCall / Resolve),
// and GPU unfold/fold inline diff preview with full 5+1 anti-translation & lossless destroy().

(function (root) {
  'use strict';
  const G = root || (typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : null);
  if (!G) return;

  const INLINE_DIFF_STYLE_ID = 'ag-prism-inline-diff-css';
  const INLINE_DIFF_MAX_PENDING = 32;
  const INLINE_DIFF_TIMEOUT_MS = 5500;
  const INLINE_DIFF_CACHE_MAX = 32;
  const INLINE_DIFF_CACHE_TTL_MS = 15000;
  const INLINE_DIFF_NEG_TTL_MS = 8000;
  const MAX_CLIENT_DIFF_BYTES = 131072;
  const MAX_CLIENT_LINE_CHARS = 240;
  const DETERMINISTIC_ERR_RE = /^(?:not_found|blocked|outside_git_repo|invalid_uri|not_a_file|binary)/i;

  // Strictly pure ASCII, 0 :has(), balanced braces, zero pseudo-elements inside :is()
  const INLINE_DIFF_CSS = [
    '@keyframes ag-cs-diff-unfold{from{opacity:0;transform:translate3d(0,-5px,0) scaleY(.97);}to{opacity:1;transform:translate3d(0,0,0) scaleY(1);}}',
    '@keyframes ag-cs-diff-fold{from{opacity:1;transform:translate3d(0,0,0) scaleY(1);}to{opacity:0;transform:translate3d(0,-4px,0) scaleY(.97);}}',
    '@keyframes ag-cs-diff-pulse{0%,100%{opacity:.45;}50%{opacity:.95;}}',
    '@keyframes ag-cs-diff-in{from{opacity:0;transform:translate3d(0,-3px,0);}to{opacity:1;transform:translate3d(0,0,0);}}',
    'html[data-ag-cs-style]{',
    '& .ag-cs-inline-diff-body{&::-webkit-scrollbar{width:4px;height:4px;display:block;}&::-webkit-scrollbar-track{background:transparent;}&::-webkit-scrollbar-thumb{background:transparent;border-radius:999px;}&:hover::-webkit-scrollbar-thumb{background:var(--_s8,rgba(255,255,255,.18));&:hover{background:var(--_s9,rgba(255,255,255,.32));}}}',
    '& [data-testid="autoscroll-viewport"] .bleed-contain .ag-cs-inline-diff-body{margin-right:14px !important;padding-right:8px !important;overscroll-behavior-y:auto !important;}',
    '& [data-testid="autoscroll-viewport"] .bleed-contain .overflow-y-auto .ag-cs-inline-diff-body{margin-right:12px !important;overscroll-behavior-y:auto !important;}',
    '& [data-ag-diff-chip-row="1"]{overflow-y:visible !important;}',
    '& [data-ag-diff-chip="1"]{display:inline-flex !important;align-items:center !important;gap:7px !important;min-height:22px !important;padding:1px 5px !important;margin:0 -2px !important;border-radius:4px !important;background:transparent !important;border:1px solid transparent !important;box-shadow:none !important;cursor:pointer !important;overflow:visible !important;transition:background-color 130ms ease,box-shadow 130ms ease !important;&:hover{background-color:rgba(255,255,255,.048) !important;& [data-ag-diff-chip-file="1"]{text-decoration-color:rgba(255,255,255,.36) !important;}}&[data-ag-inline-diff-open="1"]{background-color:rgba(255,255,255,.065) !important;box-shadow:inset 0 -1px 0 rgba(255,255,255,.22) !important;& [data-ag-diff-chip-file="1"]{text-decoration-color:transparent !important;}}& [data-ag-diff-chip-file="1"],& [data-ag-diff-chip-file="1"] :is([data-testid="entity-pill"],.inline-pill){background:transparent !important;border-color:transparent !important;box-shadow:none !important;padding:0 !important;margin:0 !important;color:var(--foreground) !important;font-weight:500;}& [data-ag-diff-chip-file="1"]{text-decoration:underline;text-decoration-color:rgba(255,255,255,.16);text-underline-offset:3px;text-decoration-thickness:1px;transition:text-decoration-color 130ms ease;}& [data-testid="diff-line-count"]{background:transparent !important;border:0 !important;box-shadow:none !important;padding:0 !important;margin:0 !important;gap:5px !important;font-size:11.5px !important;font-weight:500;&::before{display:none !important;}}}',
    '& [data-testid="diff-line-count"]{display:inline-flex;align-items:center;gap:4px;border-radius:var(--ag-cs-r-sm) !important;border:1px solid transparent;padding:1px 5px !important;font-family:var(--ag-cs-mono-stack);font-size:11px;font-variant-numeric:tabular-nums;transition:background-color 130ms ease,border-color 130ms ease,color 130ms ease !important;& [data-ag-diff-stat="add"]{color:#5CE68B !important;text-shadow:0 0 9px rgba(74,222,128,.42);}& [data-ag-diff-stat="del"]{color:#FF857D !important;text-shadow:0 0 9px rgba(248,113,113,.40);}& [data-ag-diff-stat="zero"]{color:rgba(255,255,255,.28) !important;text-shadow:none !important;}}',
    '& .ag-cs-inline-diff-box{display:block;box-sizing:border-box;width:100%;max-width:100%;align-self:stretch;margin:0;padding:0;transform-origin:50% 0%;contain:layout style;&[data-ag-diff-anim="1"]{will-change:transform,opacity;animation:ag-cs-diff-unfold 150ms var(--ag-ease-out,cubic-bezier(.16,1,.3,1)) both;}&[data-ag-diff-state="closing"]{will-change:transform,opacity;pointer-events:none;animation:ag-cs-diff-fold 120ms cubic-bezier(.32,0,.67,0) forwards;}}',
    '& .ag-cs-inline-diff-card{position:relative;margin:6px 0 12px 0;padding:0;border-radius:10px;border:1px solid rgba(255,255,255,.082);background-color:rgba(10,11,14,.90);background-image:radial-gradient(85% 48px at 50% 0%,rgba(255,255,255,.036),transparent);box-shadow:inset 0 1px 0 rgba(255,255,255,.095),0 14px 34px -12px rgba(0,0,0,.62);overflow:hidden;}',
    '& .ag-cs-inline-diff-body{max-height:320px;overflow:auto;padding:6px 0;font-family:var(--ag-cs-mono-stack);font-size:12px;line-height:1.64;tab-size:2;}',
    '& [data-ag-has-inline-diff="1"]{-webkit-mask-image:none !important;mask-image:none !important;max-height:none !important;overflow-y:visible !important;}',
    '& .ag-cs-inline-diff-note{padding:4px 14px 6px;margin-bottom:4px;border-bottom:1px solid rgba(255,255,255,.06);font-family:var(--font-sans);font-size:11px;line-height:1.45;color:var(--muted-foreground);opacity:.78;}',
    '& .ag-cs-inline-diff-wrap-tag{display:inline-flex;align-items:center;height:15px;padding:0 5px;margin:auto 12px auto 4px;border-radius:3px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);color:var(--muted-foreground);font-family:var(--font-sans);font-size:10px;line-height:1;flex-shrink:0;}',
    '& .ag-cs-inline-diff-more-bar{appearance:none;display:flex;align-items:center;justify-content:center;width:100%;padding:6px 12px 2px;margin-top:4px;border:0;border-top:1px solid rgba(255,255,255,.055);background:transparent;color:var(--muted-foreground);font-family:var(--font-sans);font-size:11px;cursor:pointer;transition:color 120ms ease;&:hover{color:var(--foreground);}}',
    '& .ag-cs-inline-diff-line{display:flex;align-items:stretch;min-width:100%;width:max-content;box-sizing:border-box;white-space:pre;color:color-mix(in srgb,var(--secondary-foreground) 86%,transparent);&:is(.is-add,.is-del) .ag-cs-inline-diff-sign{font-weight:600;opacity:1;&.is-cont{opacity:.42;font-weight:400;text-shadow:none !important;}}&.is-add{background:linear-gradient(90deg,rgba(46,184,92,.16) 0%,rgba(46,184,92,.09) 42%,rgba(46,184,92,.045) 100%) !important;color:var(--foreground);& .ag-cs-inline-diff-ln{background-color:rgba(18,44,28,.96);color:rgba(134,239,172,.86);box-shadow:inset 2px 0 0 #4ADE80,inset 7px 0 12px -4px rgba(74,222,128,.32);}& .ag-cs-inline-diff-sign{color:#6EE7B7 !important;text-shadow:0 0 9px rgba(74,222,128,.62),0 0 2px rgba(167,243,208,.45);}}&.is-del{background:linear-gradient(90deg,rgba(239,68,68,.15) 0%,rgba(239,68,68,.085) 42%,rgba(239,68,68,.04) 100%) !important;color:color-mix(in srgb,var(--foreground) 92%,transparent);& .ag-cs-inline-diff-ln{background-color:rgba(48,20,24,.96);color:rgba(252,165,165,.86);box-shadow:inset 2px 0 0 #F87171,inset 7px 0 12px -4px rgba(248,113,113,.30);}& .ag-cs-inline-diff-sign{color:#FCA5A5 !important;text-shadow:0 0 9px rgba(248,113,113,.60),0 0 2px rgba(254,202,202,.42);}}&.is-hunk{align-items:center;height:22px;margin:3px 0;background-color:rgba(255,255,255,.02);border-top:1px solid rgba(255,255,255,.045);border-bottom:1px solid rgba(255,255,255,.045);& .ag-cs-inline-diff-ln{height:100%;display:inline-flex;align-items:center;justify-content:center;background-color:rgba(14,15,19,.96);color:rgba(255,255,255,.38);padding:0 8px;}}}',
    '& .ag-cs-inline-diff-gap-rule{flex:1 1 auto;height:1px;margin:0 16px;background:linear-gradient(90deg,rgba(255,255,255,.08),rgba(255,255,255,.02));pointer-events:none;}',
    '& .ag-cs-inline-diff-ln{position:sticky;left:0;z-index:1;flex:none;width:46px;box-sizing:border-box;padding:0 10px 0 8px;text-align:right;background-color:rgba(12,13,17,.96);border-right:1px solid rgba(255,255,255,.06);color:rgba(255,255,255,.34);user-select:none;font-variant-numeric:tabular-nums;font-size:11px;}',
    '& .ag-cs-inline-diff-sign{flex:none;width:22px;text-align:center;user-select:none;opacity:.75;}',
    '& .ag-cs-inline-diff-code{flex:1 1 auto;min-width:0;padding:0 16px 0 2px;}',
    '& .ag-cs-inline-diff-loading{display:flex;align-items:center;gap:10px;height:30px;padding:0 16px;font-family:var(--font-sans);font-size:11.5px;color:var(--muted-foreground);&::before{content:"";width:38px;height:2.5px;border-radius:999px;background:color-mix(in srgb,var(--primary) 46%,var(--ag-cs-border-2));animation:ag-cs-diff-pulse 1.2s ease-in-out infinite;}}',
    '& .ag-cs-inline-diff-empty{padding:10px 16px;font-family:var(--font-sans);font-size:12px;line-height:1.5;color:var(--muted-foreground);}',
    '& .ag-cs-diff-ctx-menu{position:fixed;z-index:9999;min-width:184px;padding:4px;border-radius:10px;background-color:rgba(14,16,22,.96);background-image:linear-gradient(rgba(164,196,255,.05) 0%,transparent 44%);backdrop-filter:blur(16px) saturate(140%);border:1px solid rgba(214,226,255,.12);box-shadow:inset 0 1px 0 rgba(232,240,255,.12),0 18px 40px -10px rgba(0,0,0,.64);display:flex;flex-direction:column;gap:2px;animation:ag-cs-diff-in 110ms var(--ag-ease-out,ease-out);}',
    '& .ag-cs-diff-ctx-item{appearance:none;width:100%;height:28px;padding:0 9px;border:0;border-radius:7px;background:transparent;color:var(--secondary-foreground);font-family:var(--font-sans);font-size:12px;font-weight:450;display:flex;align-items:center;gap:8px;cursor:pointer;text-align:left;white-space:nowrap;transition:background-color 110ms ease,color 110ms ease;& svg{width:13px;height:13px;flex-shrink:0;opacity:.78;}&:hover{background-color:rgba(164,196,255,.09);color:var(--foreground);& svg{opacity:1;}}}',
    '}',
    'html[data-ag-cs-style][data-ag-cs-theme="light"],html[data-ag-cs-style]>body:is(.theme-light,.light-theme,.light){',
    '& [data-ag-diff-chip="1"]{background:transparent !important;border-color:transparent !important;box-shadow:none !important;& [data-ag-diff-chip-file="1"]{text-decoration-color:rgba(15,23,42,.20);}&:hover{background-color:rgba(15,23,42,.048) !important;& [data-ag-diff-chip-file="1"]{text-decoration-color:rgba(15,23,42,.42) !important;}}&[data-ag-inline-diff-open="1"]{background-color:rgba(15,23,42,.068) !important;box-shadow:inset 0 -1px 0 rgba(15,23,42,.24) !important;}}',
    '& [data-testid="diff-line-count"]{& [data-ag-diff-stat="add"]{color:#15803D !important;text-shadow:none;}& [data-ag-diff-stat="del"]{color:#B91C1C !important;text-shadow:none;}& [data-ag-diff-stat="zero"]{color:rgba(15,23,42,.34) !important;text-shadow:none;}}',
    '& .ag-cs-inline-diff-card{background:#FAFBFD;border-color:rgba(15,23,42,.09);box-shadow:0 8px 22px -10px rgba(15,23,42,.10);}',
    '& .ag-cs-inline-diff-more-bar{border-top-color:rgba(15,23,42,.07);}',
    '& .ag-cs-inline-diff-wrap-tag{background:rgba(15,23,42,.045);border-color:rgba(15,23,42,.10);}',
    '& .ag-cs-inline-diff-ln{background-color:#F3F5F9;border-right-color:rgba(15,23,42,.08);color:rgba(71,85,105,.62);}',
    '& .ag-cs-diff-ctx-menu{background:rgba(252,253,255,.96);border-color:rgba(15,23,42,.12);box-shadow:0 12px 30px -8px rgba(15,23,42,.16),0 0 0 1px rgba(15,23,42,.06);& .ag-cs-diff-ctx-item:hover{background-color:rgba(37,99,235,.07);}}',
    '& .ag-cs-inline-diff-line{&:is(.is-add,.is-del) .ag-cs-inline-diff-sign{font-weight:600;opacity:1;text-shadow:none;&.is-cont{opacity:.38;font-weight:400;}}&.is-add{background:rgba(22,163,74,.09) !important;& .ag-cs-inline-diff-ln{background-color:#E7F6EC;color:#15803D;box-shadow:inset 2px 0 0 #16A34A;}& .ag-cs-inline-diff-sign{color:#15803D !important;}}&.is-del{background:rgba(220,38,38,.085) !important;& .ag-cs-inline-diff-ln{background-color:#FDECEC;color:#B91C1C;box-shadow:inset 2px 0 0 #DC2626;}& .ag-cs-inline-diff-sign{color:#B91C1C !important;}}}',
    '& .ag-cs-inline-diff-line.is-hunk{background-color:rgba(15,23,42,.025);border-color:rgba(15,23,42,.06);& .ag-cs-inline-diff-ln{background-color:#EEF1F6;color:rgba(71,85,105,.55);}}',
    '& .ag-cs-inline-diff-gap-rule{background:linear-gradient(90deg,rgba(15,23,42,.12),rgba(15,23,42,.03));}',
    '}',
    '@media (prefers-reduced-motion:reduce){.ag-cs-inline-diff-loading::before,.ag-cs-diff-ctx-menu{animation:none !important;}.ag-cs-diff-ctx-menu{backdrop-filter:none !important;}html[data-ag-cs-style]:not([data-ag-cs-motion="ultra"]):not([data-ag-cs-motion="standard"]) .ag-cs-inline-diff-box{animation:none !important;filter:none !important;}}',
    'html[data-ag-cs-style][data-ag-cs-win-blur="1"] .ag-cs-inline-diff-loading::before{animation-play-state:paused !important;}',
    'html[data-ag-cs-style][data-ag-cs-motion="off"] .ag-cs-inline-diff-box,html[data-ag-cs-style][data-ag-cs-motion="off"] .ag-cs-inline-diff-loading::before,html[data-ag-cs-style][data-ag-cs-motion="off"] .ag-cs-diff-ctx-menu{animation:none !important;transition:none !important;}',
    'html[data-ag-cs-style]:is([data-ag-cs-win-blur="1"],[data-ag-cs-motion="off"]) .ag-cs-diff-ctx-menu{backdrop-filter:none !important;}',
  ].join('\n');

  const NO_TR_ATTRS = [
    ['translate', 'no'],
    ['data-no-translate', 'true'],
    ['data-ag-localization-skip', 'true'],
    ['data-agy-no-translate', 'true'],
    ['data-antigravity-zh-skip', '1'],
    ['data-ag-no-i18n', ''],
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

  function isElementLike(n) {
    return Boolean(n && (n.nodeType === 1 || (n.nodeType === undefined && typeof n.tagName === 'string')));
  }

  const ga = (e, k) => e?.getAttribute?.(k);
  const sa = (e, k, v) => e?.setAttribute?.(k, String(v));
  const ha = (e, k) => Boolean(e?.hasAttribute?.(k));
  const ra = (e, k) => e?.removeAttribute?.(k);
  const qs = (e, s) => e?.querySelector?.(s) || null;
  const qa = (e, s) => e?.querySelectorAll?.(s) || [];
  const cl = (e, s) => e?.closest?.(s) || null;
  const tagU = (e) => String(e?.tagName || '').toUpperCase();

  function truncateDiffLine(str) {
    const s = String(str ?? '');
    return s.length > MAX_CLIENT_LINE_CHARS ? s.slice(0, MAX_CLIENT_LINE_CHARS - 1) + '…' : s;
  }

  function basenameFromUri(uri) {
    const s = String(uri || '').replace(/\\/g, '/').replace(/^file:\/\/\/?/i, '');
    const parts = s.split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '';
  }

  function parseUnifiedDiffLines(rawText, maxLines = 160) {
    const raw = String(rawText || '');
    if (raw.length > MAX_CLIENT_DIFF_BYTES) return [];
    const lines = raw.replace(/\r\n/g, '\n').split('\n');
    const out = [];
    let oldLn = 1;
    let newLn = 1;
    for (let i = 0; i < lines.length && out.length < maxLines; i++) {
      const line = lines[i];
      if (/^(?:diff --git|index |--- |\+\+\+ )/.test(line)) continue;
      const hm = line.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@(.*)$/);
      if (hm) {
        oldLn = Number(hm[1]) || 1;
        newLn = Number(hm[2]) || 1;
        out.push({ kind: 'hunk', ln: '', sign: '@@', text: truncateDiffLine(line) });
        continue;
      }
      if (line.startsWith('+')) {
        out.push({ kind: 'add', ln: String(newLn++), sign: '+', text: truncateDiffLine(line.slice(1)) });
      } else if (line.startsWith('-')) {
        out.push({ kind: 'del', ln: String(oldLn++), sign: '-', text: truncateDiffLine(line.slice(1)) });
      } else if (line.length || out.length) {
        out.push({ kind: 'ctx', ln: String(newLn++), sign: ' ', text: truncateDiffLine(line.startsWith(' ') ? line.slice(1) : line) });
        oldLn++;
      }
    }
    return out;
  }

  function buildPairDiffLines(oldText, newText, startLine = 1, maxLines = 160) {
    const sOld = String(oldText || '');
    const sNew = String(newText || '');
    if (sOld.length + sNew.length > MAX_CLIENT_DIFF_BYTES) return [];
    const a = sOld.replace(/\r\n/g, '\n').split('\n');
    const b = sNew.replace(/\r\n/g, '\n').split('\n');
    const out = [];
    let p = 0;
    while (p < a.length && p < b.length && a[p] === b[p]) p++;
    let saIdx = a.length - 1;
    let sbIdx = b.length - 1;
    while (saIdx >= p && sbIdx >= p && a[saIdx] === b[sbIdx]) {
      saIdx--;
      sbIdx--;
    }
    const ctxStart = Math.max(0, p - 2);
    for (let i = ctxStart; i < p && out.length < maxLines; i++) {
      out.push({ kind: 'ctx', ln: String(startLine + i), sign: ' ', text: truncateDiffLine(a[i]) });
    }
    for (let i = p; i <= saIdx && out.length < maxLines; i++) {
      out.push({ kind: 'del', ln: String(startLine + i), sign: '-', text: truncateDiffLine(a[i]) });
    }
    for (let i = p; i <= sbIdx && out.length < maxLines; i++) {
      out.push({ kind: 'add', ln: String(startLine + i), sign: '+', text: truncateDiffLine(b[i]) });
    }
    const tailEnd = Math.min(b.length, sbIdx + 3);
    for (let i = sbIdx + 1; i < tailEnd && out.length < maxLines; i++) {
      out.push({ kind: 'ctx', ln: String(startLine + i), sign: ' ', text: truncateDiffLine(b[i]) });
    }
    return out;
  }

  function createInlineDiffClient(options = {}) {
    const doc = options.doc || options.document || (typeof document !== 'undefined' ? document : null);
    const win = options.win || options.window || (typeof window !== 'undefined' ? window : G);
    let currentConfig = options.config && typeof options.config === 'object' ? { ...options.config } : {};
    const extGetConfig = typeof options.getConfig === 'function' ? options.getConfig : null;
    const getConfig = () => {
      const ext = extGetConfig ? extGetConfig() : null;
      return ext && typeof ext === 'object' ? { ...currentConfig, ...ext } : currentConfig;
    };

    const baseGetLang = typeof options.getLang === 'function' ? options.getLang : null;
    const baseTFn = typeof options.t === 'function' ? options.t : null;
    const baseMut = typeof options.runGuardedMut === 'function' ? options.runGuardedMut : null;
    const baseSetA = typeof options.setAttrIfChanged === 'function' ? options.setAttrIfChanged : null;

    let hookGetLang = baseGetLang;
    let hookTFn = baseTFn;
    let hookMut = baseMut;
    let hookSetA = baseSetA;

    const normDiffLang = (raw) => {
      let v = String(raw || '').trim();
      if (!v || v.toLowerCase() === 'auto') {
        const navObj = win && 'navigator' in win ? win.navigator : (typeof navigator !== 'undefined' ? navigator : null);
        v = String(navObj?.language || '').trim();
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
    };

    const getLang = () => {
      if (typeof hookGetLang === 'function') {
        try {
          const v = String(hookGetLang() || '').trim();
          if (v && v !== 'auto') return normDiffLang(v);
        } catch {}
      }
      const cfgLang = String(currentConfig.language || currentConfig.lang || '').trim();
      if (cfgLang && cfgLang !== 'auto') return normDiffLang(cfgLang);
      const attrLang = String(doc?.documentElement?.getAttribute?.('data-ag-cs-lang') || '').trim();
      return normDiffLang(attrLang);
    };
    const mut = (fn) => (typeof hookMut === 'function' ? hookMut(fn) : fn());
    const setA = (el, name, val) => {
      if (typeof hookSetA === 'function') return hookSetA(el, name, val);
      if (el && ga(el, name) !== val) sa(el, name, val);
    };

    const extIsDestroyed = typeof options.isDestroyed === 'function' ? options.isDestroyed : () => false;

    let localDestroyed = false;
    const isDead = () => localDestroyed || extIsDestroyed();

    const inlineDiffPending = new Map();
    const inlineDiffCache = new Map();
    const inlineDiffInflight = new Map();
    const inlineDiffAnimTimers = new Set();
    let inlineDiffHoverTimer = 0;
    let chipSyncDebounceTimer = 0;
    let inlineDiffReqSeq = 1;
    let allowNativeDiffClick = false;
    let diffCtxMenuEl = null;
    let styleEl = null;
    let selfApi = null;

    const stats = {
      inlineDiffToggleCount: 0,
    };

    const mk = (t, c, x, ...ks) => {
      const e = doc.createElement(t);
      if (c) e.className = c;
      if (x != null) e.textContent = x;
      for (const k of ks) if (k) e.appendChild(k);
      return e;
    };

    const DIFF_FALLBACK = {
      inlineDiffOpenSidebar: {
        'zh-CN': '在侧栏打开完整对比',
        'zh-TW': '在側欄開啟完整對比',
        en: 'Open full diff in Sidebar',
        ja: 'サイドバーで完全な差分を開く',
        ko: '사이드바에서 전체 차이 열기',
        es: 'Abrir diff completo en la barra lateral',
        fr: 'Ouvrir le diff complet dans la barre latérale',
        de: 'Vollständigen Diff in Seitenleiste öffnen',
      },
      inlineDiffCollapse: {
        'zh-CN': '收起',
        'zh-TW': '收合',
        en: 'Collapse',
        ja: '閉じる',
        ko: '접기',
        es: 'Contraer',
        fr: 'Réduire',
        de: 'Einklappen',
      },
      inlineDiffLoading: {
        'zh-CN': '正在读取差异...',
        'zh-TW': '正在讀取差異...',
        en: 'Loading diff...',
        ja: '差分を読み込み中...',
        ko: '차이점 불러오는 중...',
        es: 'Cargando diff...',
        fr: 'Chargement du diff...',
        de: 'Diff wird geladen...',
      },
      inlineDiffBinary: {
        'zh-CN': '二进制文件暂不支持行内预览，请右键在侧栏打开。',
        'zh-TW': '二進位檔案暫不支援行內預覽，請右鍵在側欄開啟。',
        en: 'Binary file cannot be previewed inline. Right-click to open in Sidebar.',
        ja: 'バイナリファイルはインライン表示できません。右クリックでサイドバーから開けます。',
        ko: '바이너리 파일은 인라인으로 미리 볼 수 없습니다. 우클릭하여 사이드바에서 여세요.',
        es: 'Los archivos binarios no tienen vista previa en línea. Haz clic derecho para abrir en la barra lateral.',
        fr: 'Les fichiers binaires ne peuvent pas être prévisualisés en ligne. Clic droit pour ouvrir dans la barre latérale.',
        de: 'Binärdateien können nicht inline angezeigt werden. Rechtsklick zum Öffnen in der Seitenleiste.',
      },
      inlineDiffNoPreview: {
        'zh-CN': '当前步骤暂无行内差异，请右键在侧栏打开。',
        'zh-TW': '目前步驟暫無行內差異，請右鍵在側欄開啟。',
        en: 'Inline diff is unavailable for this step. Right-click to open in Sidebar.',
        ja: 'このステップには差分テキストがありません。右クリックでサイドバーから開けます。',
        ko: '이 단계에는 인라인 차이가 없습니다. 우클릭하여 사이드바에서 여세요.',
        es: 'El diff en línea no está disponible para este paso. Haz clic derecho para abrir en la barra lateral.',
        fr: 'Le diff en ligne est indisponible pour cette étape. Clic droit pour ouvrir dans la barre latérale.',
        de: 'Inline-Diff ist für diesen Schritt nicht verfügbar. Rechtsklick zum Öffnen in der Seitenleiste.',
      },
      inlineDiffSnapshotNotice: {
        'zh-CN': '未受 Git 追踪 · 预览当前文件内容（右键可在侧栏打开完整对比）',
        'zh-TW': '未受 Git 追蹤 · 預覽目前檔案內容（右鍵可在側欄開啟完整對比）',
        en: 'Not tracked by Git · previewing current file (right-click to open full diff in Sidebar)',
        ja: 'Git 未追跡 · 現在のファイルを表示中（右クリックでサイドバーで完全な差分を開く）',
        ko: 'Git 추적 안 됨 · 현재 파일 미리보기(우클릭하여 사이드바에서 전체 차이 열기)',
        es: 'No rastreado por Git · vista previa del archivo actual (clic derecho para abrir diff completo)',
        fr: 'Non suivi par Git · aperçu du fichier actuel (clic droit pour ouvrir le diff complet)',
        de: 'Nicht von Git verfolgt · Vorschau der aktuellen Datei (Rechtsklick für vollständigen Diff)',
      },
      inlineDiffLongLinesTag: {
        'zh-CN': '单行长改',
        'zh-TW': '單行長改',
        en: 'long line',
        ja: '長行',
        ko: '긴 줄',
        es: 'línea larga',
        fr: 'ligne longue',
        de: 'lange Zeile',
      },
      inlineDiffMenuExpand: {
        'zh-CN': '展开行内对比',
        'zh-TW': '展開行內對比',
        en: 'Expand inline diff',
        ja: 'インライン差分を展開',
        ko: '인라인 차이 펼치기',
        es: 'Expandir diff en línea',
        fr: 'Déplier le diff en ligne',
        de: 'Inline-Diff ausklappen',
      },
      inlineDiffMenuCollapse: {
        'zh-CN': '收起行内对比',
        'zh-TW': '收合行內對比',
        en: 'Collapse inline diff',
        ja: 'インライン差分を閉じる',
        ko: '인라인 차이 접기',
        es: 'Contraer diff en línea',
        fr: 'Replier le diff en ligne',
        de: 'Inline-Diff einklappen',
      },
      inlineDiffMenuCopyPath: {
        'zh-CN': '复制文件路径',
        'zh-TW': '複製檔案路徑',
        en: 'Copy file path',
        ja: 'ファイルパスをコピー',
        ko: '파일 경로 복사',
        es: 'Copiar ruta del archivo',
        fr: 'Copier le chemin du fichier',
        de: 'Dateipfad kopieren',
      },
      inlineDiffLargeExpandBtn: {
        'zh-CN': '⋯ 大文件仅节选关键片段 · 点击在右侧栏查看完整对比',
        'zh-TW': '⋯ 大檔案僅節選關鍵片段 · 點擊在右側欄檢視完整對比',
        en: '⋯ Showing key hunks · Click to open full diff in Sidebar',
        ja: '⋯ 大きなファイルのため一部のみ表示 · クリックしてサイドバーで全体を見る',
        ko: '⋯ 대용량 파일 주요 변경만 표시 · 클릭하여 사이드바에서 전체 보기',
        es: '⋯ Mostrando fragmentos clave · Haz clic para abrir el diff completo',
        fr: '⋯ Extraits clés affichés · Cliquer pour ouvrir le diff complet',
        de: '⋯ Wichtige Bereiche angezeigt · Klicken für vollständigen Diff',
      },
    };

    function getUiText(key, fallback) {
      if (typeof hookTFn === 'function') {
        try {
          const v = hookTFn(key);
          if (typeof v === 'string' && v && v !== key) return v;
        } catch {}
      }
      const lang = getLang();
      try {
        const ui = (win?.__agCsLocales || G.__agCsLocales)?.getUiStrings?.(lang);
        if (ui && typeof ui[key] === 'string' && ui[key]) return ui[key];
      } catch {}
      const row = DIFF_FALLBACK[key];
      return (row && (row[lang] || row.en)) || fallback || key;
    }

    function mkSvgIcon(kind, size = 14) {
      const SVG_NS = 'http://www.w3.org/2000/svg';
      if (!doc || typeof doc.createElementNS !== 'function') {
        const sp = doc.createElement('span');
        sp.setAttribute('aria-hidden', 'true');
        return sp;
      }
      const svg = doc.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('width', String(size));
      svg.setAttribute('height', String(size));
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '1.6');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      svg.setAttribute('aria-hidden', 'true');
      const addNode = (tag, attrs) => {
        const n = doc.createElementNS(SVG_NS, tag);
        for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
        svg.appendChild(n);
      };
      if (kind === 'external') {
        addNode('path', { d: 'M15 3h6v6' });
        addNode('path', { d: 'M10 14L21 3' });
        addNode('path', { d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' });
      } else if (kind === 'close') {
        addNode('path', { d: 'M18 6L6 18' });
        addNode('path', { d: 'M6 6l12 12' });
      } else if (kind === 'chevDown') {
        addNode('polyline', { points: '6 9 12 15 18 9' });
      } else if (kind === 'moreDots') {
        addNode('circle', { cx: '6', cy: '12', r: '1.2', fill: 'currentColor', stroke: 'none' });
        addNode('circle', { cx: '12', cy: '12', r: '1.2', fill: 'currentColor', stroke: 'none' });
        addNode('circle', { cx: '18', cy: '12', r: '1.2', fill: 'currentColor', stroke: 'none' });
      }
      return svg;
    }

    function ensureStyleMounted() {
      if (isDead() || !doc || typeof doc.createElement !== 'function') return null;
      if (styleEl && styleEl.isConnected !== false) {
        if (typeof doc.getElementById !== 'function' || doc.getElementById(INLINE_DIFF_STYLE_ID) === styleEl) {
          return styleEl;
        }
      }
      const existing = typeof doc.getElementById === 'function' ? doc.getElementById(INLINE_DIFF_STYLE_ID) : null;
      if (existing) {
        if (existing.textContent !== INLINE_DIFF_CSS) {
          mut(() => {
            existing.textContent = INLINE_DIFF_CSS;
          });
        }
        markNoTrOwned(existing);
        styleEl = existing;
        return existing;
      }
      const target = doc.head || doc.documentElement || doc.body;
      if (!target || typeof target.appendChild !== 'function') return null;
      let created = null;
      mut(() => {
        created = doc.createElement('style');
        created.id = INLINE_DIFF_STYLE_ID;
        markNoTrOwned(created);
        created.textContent = INLINE_DIFF_CSS;
        target.appendChild(created);
      });
      styleEl = created;
      return created;
    }

    function onInlineDiffResolve(reqId, resp) {
      const entry = inlineDiffPending.get(reqId);
      if (!entry) return;
      inlineDiffPending.delete(reqId);
      if (entry.timer) clearTimeout(entry.timer);
      try {
        entry.resolve(resp || null);
      } catch {}
    }

    if (win) {
      try {
        win.__agPrismInlineDiffResolve = onInlineDiffResolve;
      } catch {}
    }

    function normalizeLinesArray(arr) {
      return arr.slice(0, 160).map((it) => ({
        kind: it && (it.kind === 'add' || it.kind === 'del' || it.kind === 'hunk') ? it.kind : 'ctx',
        ln: String(it?.ln ?? ''),
        sign: String(it?.sign ?? (it?.kind === 'add' ? '+' : it?.kind === 'del' ? '-' : ' ')),
        text: truncateDiffLine(it?.text ?? ''),
      }));
    }

    function extractInlineDiffPayload(badgeEl, rowEl) {
      let uri = '',
        fileName = '',
        additions = 0,
        deletions = 0,
        lines = [],
        stepCtx = null;
      const uAttr = ga(badgeEl, 'data-ag-diff-uri') || ga(rowEl, 'data-ag-diff-uri');
      if (typeof uAttr === 'string' && uAttr.trim()) {
        uri = uAttr.trim();
        fileName = basenameFromUri(uri);
      }
      const rawJson = ga(badgeEl, 'data-ag-diff-json') || ga(rowEl, 'data-ag-diff-json');
      if (rawJson && rawJson.length <= MAX_CLIENT_DIFF_BYTES) {
        try {
          const p = JSON.parse(rawJson);
          if (p && typeof p === 'object') {
            if (!uri) {
              const c = p.uri || p.filePath || p.path;
              if (typeof c === 'string' && c.trim()) uri = c.trim();
            }
            if (typeof p.file === 'string') fileName = basenameFromUri(p.file);
            if (!fileName && uri) fileName = basenameFromUri(uri);
            if (typeof p.additions === 'number') additions = p.additions;
            if (typeof p.deletions === 'number') deletions = p.deletions;
            if (p.diffContext && !stepCtx) stepCtx = p.diffContext;
            if (Array.isArray(p.lines)) {
              lines = normalizeLinesArray(p.lines);
            } else if (typeof p.unified === 'string') {
              lines = parseUnifiedDiffLines(p.unified);
            } else if (typeof p.oldText === 'string' || typeof p.newText === 'string') {
              lines = buildPairDiffLines(p.oldText || '', p.newText || '', Number(p.startLine) || 1);
            }
          }
        } catch {}
      }
      if ((!lines.length || !uri || !stepCtx) && badgeEl) {
        try {
          const fk = Object.keys(badgeEl).find((k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
          for (let d = 0, f = fk ? badgeEl[fk] : null; d < 24 && f; d++, f = f.return) {
            const p = f.memoizedProps || {},
              fd = p.fileDiff;
            if (fd && typeof fd === 'object') {
              if (!uri && typeof fd.uri === 'string' && fd.uri.trim()) uri = fd.uri.trim();
              if (!fileName && fd.uri) fileName = basenameFromUri(fd.uri);
              if (fd.diffStats && typeof fd.diffStats === 'object') {
                if (!additions && typeof fd.diffStats.additions === 'number') additions = fd.diffStats.additions;
                if (!deletions && typeof fd.diffStats.deletions === 'number') deletions = fd.diffStats.deletions;
              }
            }
            if (!uri && typeof p.uri === 'string' && p.uri.trim()) uri = p.uri.trim();
            if (p.diffContext && !stepCtx) stepCtx = p.diffContext;
            const st = p.step && (p.step.args || p.step.result) ? p.step : p.step?.step?.value;
            if (st && typeof st === 'object') {
              const args = st.args || {},
                res = st.result || {},
                uc = args.TargetFile || args.Path || args.path || args.filePath || args.uri;
              if (typeof uc === 'string' && uc.trim()) {
                if (!uri) uri = uc.trim();
                if (!fileName) fileName = basenameFromUri(uc);
              }
              const uni = res.diff || res.unifiedDiff || res.patch || st.diff;
              if (!lines.length && typeof uni === 'string' && uni.trim()) lines = parseUnifiedDiffLines(uni);
              const oldT = args.Target ?? args.TargetContent ?? args.oldText ?? args.old_string;
              const newT = args.Replacement ?? args.ReplacementContent ?? args.newText ?? args.new_string;
              if (!lines.length && (typeof oldT === 'string' || typeof newT === 'string')) {
                lines = buildPairDiffLines(oldT || '', newT || '', Number(args.StartLine) || 1);
              }
              if (!lines.length && Array.isArray(args.ReplacementChunks) && args.ReplacementChunks.length) {
                const ch = args.ReplacementChunks[0];
                if (ch && (typeof ch.TargetContent === 'string' || typeof ch.ReplacementContent === 'string')) {
                  lines = buildPairDiffLines(ch.TargetContent || '', ch.ReplacementContent || '', Number(ch.StartLine) || 1);
                }
              }
            }
          }
          if (!lines.length && typeof win?.__agPrismResolveInlineDiff === 'function') {
            const ext = win.__agPrismResolveInlineDiff({ uri, fileName, additions, deletions, diffContext: stepCtx, badgeEl, rowEl });
            if (Array.isArray(ext?.lines)) lines = normalizeLinesArray(ext.lines);
            else if (typeof ext?.unified === 'string') lines = parseUnifiedDiffLines(ext.unified);
          }
        } catch {}
      }
      if (!additions && !deletions) {
        const txt = String(badgeEl?.textContent || ''),
          am = txt.match(/\+(\d+)/),
          dm = txt.match(/-(\d+)/);
        if (am) additions = Number(am[1]) || 0;
        if (dm) deletions = Number(dm[1]) || 0;
      }
      if (!fileName && uri) fileName = basenameFromUri(uri);
      if (!fileName && rowEl) {
        const fm = String(rowEl.textContent || '')
          .trim()
          .match(/([A-Za-z0-9._-]+\.[A-Za-z0-9]{1,8})/);
        if (fm) fileName = fm[1];
      }
      return { uri, fileName: fileName || 'Diff Preview', additions, deletions, lines, diffContext: stepCtx };
    }

    function findInlineDiffHostRow(badgeEl) {
      if (!badgeEl) return null;
      const exp = cl(badgeEl, '[data-testid="tool-call-row"], [data-ag-tool-row="1"]');
      if (exp) return exp;
      let cur = badgeEl,
        spanHost = null;
      const cands = [];
      for (let i = 0; i < 16 && cur?.parentElement; i++, cur = cur.parentElement) {
        const p = cur.parentElement;
        if (p === doc?.documentElement || cur === doc?.body || cur === doc?.documentElement) break;
        const tid = ga(cur, 'data-testid') || '';
        if (tid === 'conversation-view' || tid === 'autoscroll-viewport') break;
        if (qa(cur, '[data-testid="diff-line-count"]').length > 1) break;
        if (cur.classList?.contains?.('flex-col') && (cur.children?.length || 0) > 1) break;
        const pt = tagU(p);
        if (pt === 'SPAN' || pt === 'BUTTON' || pt === 'A') continue;
        let disp = '',
          dir = '';
        try {
          const cs = win?.getComputedStyle?.(p);
          if (cs) {
            disp = String(cs.display || cs.getPropertyValue?.('display') || '').toLowerCase();
            dir = String(cs.flexDirection || cs.getPropertyValue?.('flex-direction') || '').toLowerCase();
          }
        } catch {}
        if (!(disp ? (disp === 'flex' && dir === 'column') || disp === 'block' || disp === 'grid' : Boolean(p.classList?.contains?.('flex-col')))) {
          continue;
        }
        if (tagU(cur) === 'SPAN') {
          if (!spanHost) spanHost = cur;
          continue;
        }
        cands.push(cur);
      }
      if (cands.length) {
        let best = cands[cands.length - 1],
          bestW = -1;
        for (let i = 0; i < cands.length; i++) {
          const c = cands[i],
            w = Math.round(Number(c.getBoundingClientRect?.()?.width) || 0);
          if (w > bestW || (w === bestW && (Boolean(c.classList?.contains?.('w-full')) || i > 0))) {
            bestW = w;
            best = c;
          }
        }
        return bestW === 0 ? cands.find((c) => c.classList?.contains?.('w-full')) || best : best;
      }
      return spanHost || cl(badgeEl, 'button, [role="button"]') || badgeEl.parentElement || null;
    }

    function makeInlineDiffCacheKey(uri, hints) {
      const a = Number(hints?.additions) || 0;
      const d = Number(hints?.deletions) || 0;
      return `${uri}|${a}:${d}`;
    }

    function getCachedInlineDiff(cacheKey) {
      const hit = inlineDiffCache.get(cacheKey);
      if (!hit) return null;
      const ttl = hit.ttl || INLINE_DIFF_CACHE_TTL_MS;
      if (Date.now() - hit.at > ttl) {
        inlineDiffCache.delete(cacheKey);
        return null;
      }
      return hit.resp;
    }

    function putCachedInlineDiff(cacheKey, resp) {
      if (!resp || typeof resp !== 'object') return;
      const errCode = String(resp.error || resp.reason || '');
      const isDeterministicNeg =
        (!resp.ok && DETERMINISTIC_ERR_RE.test(errCode)) || (resp.ok && resp.mode === 'binary');
      if (!resp.ok && !isDeterministicNeg) return;
      const ttl = isDeterministicNeg ? INLINE_DIFF_NEG_TTL_MS : INLINE_DIFF_CACHE_TTL_MS;
      while (inlineDiffCache.size >= INLINE_DIFF_CACHE_MAX) {
        const oldest = inlineDiffCache.keys().next().value;
        if (oldest === undefined) break;
        inlineDiffCache.delete(oldest);
      }
      inlineDiffCache.set(cacheKey, { at: Date.now(), ttl, resp });
    }

    function requestInlineDiffFromDaemon(uri, hints) {
      if (isDead() || !uri || typeof win?.__agPrismInlineDiffCall !== 'function') return null;
      const key = makeInlineDiffCacheKey(uri, hints),
        cached = getCachedInlineDiff(key);
      if (cached) return { reqId: inlineDiffReqSeq++, cached, promise: Promise.resolve(cached) };
      const existing = inlineDiffInflight.get(key);
      if (existing) return { reqId: inlineDiffReqSeq++, promise: existing };
      try {
        win.__agPrismInlineDiffResolve = onInlineDiffResolve;
      } catch {}
      while (inlineDiffPending.size >= INLINE_DIFF_MAX_PENDING) {
        const ok = inlineDiffPending.keys().next().value,
          o = inlineDiffPending.get(ok);
        inlineDiffPending.delete(ok);
        if (o?.timer) clearTimeout(o.timer);
        try {
          o?.resolve?.({ ok: false, error: 'evicted' });
        } catch {}
      }
      const reqId = inlineDiffReqSeq++;
      const ch =
        hints && (hints.additions > 0 || hints.deletions > 0)
          ? {
              additions: Math.max(0, Math.trunc(Number(hints.additions) || 0)),
              deletions: Math.max(0, Math.trunc(Number(hints.deletions) || 0)),
            }
          : undefined;
      const promise = new Promise((resolve) => {
        const timer = setTimeout(() => {
          if (!inlineDiffPending.delete(reqId)) return;
          inlineDiffInflight.delete(key);
          resolve({ ok: false, error: 'timeout' });
        }, INLINE_DIFF_TIMEOUT_MS);
        inlineDiffPending.set(reqId, {
          resolve: (resp) => {
            inlineDiffInflight.delete(key);
            if (resp) putCachedInlineDiff(key, resp);
            resolve(resp);
          },
          timer,
        });
        try {
          win.__agPrismInlineDiffCall(
            JSON.stringify(ch ? { id: reqId, action: 'readInlineDiff', uri, hints: ch } : { id: reqId, action: 'readInlineDiff', uri })
          );
        } catch {
          const r = inlineDiffPending.get(reqId);
          if (r) {
            inlineDiffPending.delete(reqId);
            if (r.timer) clearTimeout(r.timer);
          }
          inlineDiffInflight.delete(key);
          resolve({ ok: false, error: 'rpc-error' });
        }
      });
      if (inlineDiffInflight.size < 16) inlineDiffInflight.set(key, promise);
      return { reqId, promise };
    }

    function findRendererLs() {
      try {
        const ref = win?.__agPrismLsRef;
        const cached = ref && typeof ref.deref === 'function' ? ref.deref() : ref;
        if (cached && typeof cached.getCodeActionDiff === 'function') return cached;
      } catch {}
      try {
        const root = doc?.getElementById?.('root') || doc?.body;
        if (!root) return null;
        const fk = Object.keys(root).find((k) => k.startsWith('__reactContainer$') || k.startsWith('__reactFiber$'));
        if (!fk || !root[fk]) return null;
        const q = [root[fk]];
        const seen = new Set();
        let visited = 0;
        while (q.length && visited < 4000) {
          const f = q.shift();
          if (!f || seen.has(f)) continue;
          seen.add(f);
          visited++;
          const v = f.memoizedProps?.value;
          if (v && typeof v === 'object' && typeof v.getCodeActionDiff === 'function') {
            try {
              const box = typeof WeakRef === 'function' ? new WeakRef(v) : v;
              Object.defineProperty(win, '__agPrismLsRef', { value: box, configurable: true, writable: true, enumerable: false });
            } catch {}
            return v;
          }
          if (f.child) q.push(f.child);
          if (f.sibling) q.push(f.sibling);
        }
      } catch {}
      return null;
    }

    function extractCodeActionDiffHunks(diffObj, maxLines = 160, ctxRadius = 2) {
      const raw = diffObj?.unifiedDiff?.lines;
      if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: 'no_changes', lines: [] };
      let oldLn = (Number(diffObj?.startLine) || 0) + 1;
      let newLn = oldLn;
      const all = [];
      const chgIdx = [];
      let additions = 0;
      let deletions = 0;
      for (let i = 0; i < raw.length; i++) {
        const it = raw[i];
        const t = typeof it?.type === 'bigint' ? Number(it.type) : Number(it?.type);
        const text = truncateDiffLine(it?.text ?? '');
        if (t === 1) {
          chgIdx.push(all.length);
          all.push({ kind: 'add', ln: String(newLn++), sign: '+', text });
          additions++;
        } else if (t === 2) {
          chgIdx.push(all.length);
          all.push({ kind: 'del', ln: String(oldLn++), sign: '-', text });
          deletions++;
        } else {
          all.push({ kind: 'ctx', ln: String(newLn++), sign: ' ', text });
          oldLn++;
        }
      }
      if (!chgIdx.length) return { ok: false, error: 'no_changes', lines: [] };
      const ranges = [];
      for (let k = 0; k < chgIdx.length; k++) {
        const s0 = Math.max(0, chgIdx[k] - ctxRadius);
        const e0 = Math.min(all.length - 1, chgIdx[k] + ctxRadius);
        if (ranges.length && s0 <= ranges[ranges.length - 1][1] + 1) {
          ranges[ranges.length - 1][1] = Math.max(ranges[ranges.length - 1][1], e0);
        } else {
          ranges.push([s0, e0]);
        }
      }
      const lines = [];
      let totalRows = 0;
      for (let r = 0; r < ranges.length; r++) {
        if (r > 0) {
          totalRows++;
          if (lines.length < maxLines) lines.push({ kind: 'hunk', ln: '', sign: '@@', text: '' });
        }
        for (let j = ranges[r][0]; j <= ranges[r][1]; j++) {
          totalRows++;
          if (lines.length < maxLines) lines.push(all[j]);
        }
      }
      return { ok: true, mode: 'step-diff', lines, additions, deletions, truncated: totalRows > lines.length };
    }

    function requestInlineDiffForStep(payload, hints) {
      if (isDead() || !payload) return null;
      const dc = payload.diffContext;
      const cid = typeof dc?.cascadeId === 'string' ? dc.cascadeId.trim() : '';
      const idx = Number(dc?.stepIndex);
      const hasStep = Boolean(cid && Number.isInteger(idx) && idx >= 0);
      const ls = hasStep ? findRendererLs() : null;
      if (!hasStep || !ls) {
        return requestInlineDiffFromDaemon(payload.uri, hints);
      }
      const key = `step:${cid}:${idx}:${payload.uri || ''}`;
      const cached = getCachedInlineDiff(key);
      if (cached) return { reqId: inlineDiffReqSeq++, cached, promise: Promise.resolve(cached) };
      const existing = inlineDiffInflight.get(key);
      if (existing) return { reqId: inlineDiffReqSeq++, promise: existing };
      const reqId = inlineDiffReqSeq++;
      const promise = Promise.resolve()
        .then(() => ls.getCodeActionDiff({ cascadeId: cid, stepIndex: idx }))
        .then((res) => extractCodeActionDiffHunks(res?.diff))
        .catch(() => null)
        .then((resp) => {
          if (resp && resp.ok && Array.isArray(resp.lines) && resp.lines.length > 0) {
            inlineDiffInflight.delete(key);
            putCachedInlineDiff(key, resp);
            return resp;
          }
          if (payload.uri && typeof win?.__agPrismInlineDiffCall === 'function') {
            const dReq = requestInlineDiffFromDaemon(payload.uri, hints);
            if (dReq) {
              return dReq.promise.then((dResp) => {
                inlineDiffInflight.delete(key);
                return dResp;
              });
            }
          }
          inlineDiffInflight.delete(key);
          return resp || { ok: false, error: 'no_changes', lines: [] };
        });
      if (inlineDiffInflight.size < 16) inlineDiffInflight.set(key, promise);
      return { reqId, promise };
    }

    function renderInlineDiffBody(bodyEl, lines, stateKind, metaMode, stepStats, totalStats, onOpenSidebar) {
      if (!doc || !bodyEl) return;
      while (bodyEl.firstChild) bodyEl.removeChild(bodyEl.firstChild);
      const P = 'ag-cs-inline-diff-';

      if (Array.isArray(lines) && lines.length > 0) {
        if (metaMode === 'snapshot') {
          bodyEl.appendChild(mk('div', P + 'note', getUiText('inlineDiffSnapshotNotice')));
        }
        const rows = [];
        let seen = false,
          gap = false;
        for (let i = 0; i < Math.min(lines.length, 160); i++) {
          const r = lines[i];
          if (!r || typeof r !== 'object') continue;
          const kind = r.kind === 'add' || r.kind === 'del' || r.kind === 'hunk' ? r.kind : 'ctx';
          if (kind === 'hunk') {
            if (seen) gap = true;
            continue;
          }
          if (gap) {
            gap = false;
            rows.push({ kind: 'hunk', ln: '⋯', sign: '', text: '' });
          }
          seen = true;
          rows.push({
            kind,
            ln: String(r.ln ?? ''),
            sign: String(r.sign ?? (kind === 'add' ? '+' : kind === 'del' ? '-' : ' ')),
            text: truncateDiffLine(r.text ?? ''),
          });
        }
        const longLineLbl = getUiText('inlineDiffLongLinesTag', 'long line');
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          if (r.kind === 'hunk') {
            bodyEl.appendChild(mk('div', P + 'line is-hunk', null, mk('span', P + 'ln', '⋯'), mk('span', P + 'gap-rule')));
            continue;
          }
          const chg = r.kind === 'add' || r.kind === 'del';
          const pSame = chg && i > 0 && rows[i - 1].kind === r.kind;
          const nSame = chg && i + 1 < rows.length && rows[i + 1].kind === r.kind;
          const gc = chg && (pSame || nSame) ? (!pSame ? ' is-grp-start' : !nSame ? ' is-grp-end' : ' is-grp-mid') : '';
          bodyEl.appendChild(
            mk(
              'div',
              `${P}line is-${r.kind}${gc}`,
              null,
              mk('span', P + 'ln', r.ln),
              mk('span', pSame ? P + 'sign is-cont' : P + 'sign', pSame ? '┆' : r.sign),
              mk('span', P + 'code', r.text),
              r.text.endsWith('…') ? mk('span', P + 'wrap-tag', longLineLbl) : null
            )
          );
        }
        if (totalStats?.truncated && typeof onOpenSidebar === 'function') {
          const mb = mk('button', P + 'more-bar', getUiText('inlineDiffLargeExpandBtn'));
          mb.type = 'button';
          mb.addEventListener('click', (ev) => {
            ev.preventDefault?.();
            ev.stopPropagation?.();
            onOpenSidebar();
          });
          bodyEl.appendChild(mb);
        }
        return;
      }
      if (stateKind === 'loading') {
        bodyEl.appendChild(mk('div', P + 'loading', getUiText('inlineDiffLoading', 'Loading diff...')));
        return;
      }
      bodyEl.appendChild(
        mk(
          'div',
          P + 'empty',
          stateKind === 'binary' ? getUiText('inlineDiffBinary') : getUiText('inlineDiffNoPreview')
        )
      );
    }

    function isLikelyActionVerbOnly(el) {
      if (!el) return false;
      if (el.querySelector?.('[data-testid="entity-pill"], .inline-pill, svg, img')) return false;
      const txt = String(el.textContent || '').trim();
      if (!txt || txt.includes('.') || txt.includes('/') || txt.includes('\\')) return false;
      return /^(?:created|edited|updated|deleted|modified|wrote|renamed|added|removed)$/i.test(txt);
    }

    function findDiffChipContainer(badgeEl) {
      if (!badgeEl) return null;
      for (let d = 0, cur = badgeEl.parentElement; d < 4 && cur; d++, cur = cur.parentElement) {
        const tag = tagU(cur);
        if (
          tag === 'BODY' ||
          tag === 'MAIN' ||
          (cur.classList?.contains?.('group') && cur.classList?.contains?.('w-full')) ||
          ga(cur, 'data-testid') === 'tool-call-row'
        ) {
          break;
        }
        if (Array.from(cur.childNodes || []).some((n) => n?.nodeType === 3 && String(n.nodeValue || '').trim().length > 0)) continue;
        const kids = Array.from(cur.children || []).filter(isElementLike);
        if (kids.length === 2) {
          const other = kids.find((k) => k !== badgeEl && !k.contains?.(badgeEl));
          if (other && !isLikelyActionVerbOnly(other)) return cur;
        }
      }
      return null;
    }

    function syncInlineDiffChips() {
      if (isDead() || !doc?.querySelectorAll) return;
      const badges = qa(doc, '[data-testid="diff-line-count"]');
      if (!badges.length) return;
      mut(() => {
        for (const b of badges) {
          if (!b || cl(b, '[data-testid="changed-files-card"]')) continue;
          const bTxt = String(b.textContent || '');
          const prevChip = b._agSyncedChip;
          if (
            b._agSyncedTxt === bTxt &&
            !ga(b, 'data-tooltip-id') &&
            (!prevChip || (prevChip.isConnected !== false && ga(prevChip, 'data-ag-diff-chip') === '1'))
          ) {
            continue;
          }
          const tip = ga(b, 'data-tooltip-id');
          if (tip) {
            b._agOrigTooltipId = tip;
            ra(b, 'data-tooltip-id');
          }
          for (const sp of b.children || []) {
            if (!isElementLike(sp)) continue;
            const st = String(sp.textContent || '').trim();
            if (/^\+[1-9]\d*/.test(st)) setA(sp, 'data-ag-diff-stat', 'add');
            else if (/^-[1-9]\d*/.test(st)) setA(sp, 'data-ag-diff-stat', 'del');
            else if (/^[+-]?0$/.test(st)) setA(sp, 'data-ag-diff-stat', 'zero');
          }
          const chip = findDiffChipContainer(b);
          b._agSyncedTxt = bTxt;
          b._agSyncedChip = chip || null;
          if (!chip) continue;
          setA(chip, 'data-ag-diff-chip', '1');
          for (let k = 0, anc = chip.parentElement; k < 3 && anc; k++, anc = anc.parentElement) {
            if (anc.classList?.contains?.('w-full')) break;
            const cls = String(anc.className || '');
            if (cls.includes('overflow-hidden') || cls.includes('truncate')) setA(anc, 'data-ag-diff-chip-row', '1');
          }
          for (const ch of chip.children || []) {
            if (!isElementLike(ch) || ch === b || ch.contains?.(b)) continue;
            setA(ch, 'data-ag-diff-chip-file', '1');
            const ct = ga(ch, 'data-tooltip-id');
            if (ct) {
              ch._agOrigTooltipId = ct;
              ra(ch, 'data-tooltip-id');
            }
          }
        }
      });
    }

    function closeDiffContextMenu() {
      if (!diffCtxMenuEl) return false;
      const el = diffCtxMenuEl;
      diffCtxMenuEl = null;
      mut(() => {
        try {
          el.remove();
        } catch {}
      });
      return true;
    }

    function dispatchCtxOpenBus() {
      if (!win || typeof win.dispatchEvent !== 'function') return;
      try {
        const Ctor = win.CustomEvent || (typeof CustomEvent === 'function' ? CustomEvent : null);
        const ev = Ctor ? new Ctor('ag-prism:ctx-open', { detail: { source: 'inline-diff' } }) : { type: 'ag-prism:ctx-open', detail: { source: 'inline-diff' } };
        win.dispatchEvent(ev);
      } catch {}
    }

    function openDiffContextMenu(ev, badgeEl) {
      if (isDead() || !doc?.body || !badgeEl) return false;
      closeDiffContextMenu();
      dispatchCtxOpenBus();
      const rowEl = findInlineDiffHostRow(badgeEl),
        isOpen = ga(badgeEl, 'data-ag-inline-diff-open') === '1',
        payload = extractInlineDiffPayload(badgeEl, rowEl);
      const menu = markNoTrOwned(mk('div', 'ag-cs-diff-ctx-menu'));
      sa(menu, 'role', 'menu');
      const addItem = (ic, lbl, fn) => {
        const b = mk('button', 'ag-cs-diff-ctx-item', null, mkSvgIcon(ic, 13), mk('span', '', lbl));
        b.type = 'button';
        sa(b, 'role', 'menuitem');
        b.addEventListener('click', (e) => {
          e.preventDefault?.();
          e.stopPropagation?.();
          closeDiffContextMenu();
          fn();
        });
        menu.appendChild(b);
      };
      addItem(
        isOpen ? 'close' : 'chevDown',
        isOpen ? getUiText('inlineDiffMenuCollapse') : getUiText('inlineDiffMenuExpand'),
        () => toggleInlineDiffPreview(badgeEl)
      );
      addItem('external', getUiText('inlineDiffOpenSidebar'), () => {
        try { win?.__agPrismPreserveScroll?.(badgeEl); } catch {}
        allowNativeDiffClick = true;
        try {
          badgeEl.click?.();
        } finally {
          allowNativeDiffClick = false;
        }
      });
      if (payload.uri) {
        addItem('moreDots', getUiText('inlineDiffMenuCopyPath'), () => {
          try {
            win?.navigator?.clipboard?.writeText?.(String(payload.uri).replace(/^file:\/\/\/?/i, ''));
          } catch {}
        });
      }
      const vw = Number(win?.innerWidth) || 1280,
        vh = Number(win?.innerHeight) || 800;
      if (menu.style) {
        menu.style.left = `${Math.max(8, Math.min(vw - 208, Math.round(Number(ev?.clientX) || 0)))}px`;
        menu.style.top = `${Math.max(8, Math.min(vh - 124, Math.round(Number(ev?.clientY) || 0)))}px`;
      }
      mut(() => doc.body.appendChild(menu));
      diffCtxMenuEl = menu;
      return true;
    }

    function shouldAnimateInlineDiff() {
      if (!win?.requestAnimationFrame || !doc?.getElementById) return false;
      if (!doc.getElementById(INLINE_DIFF_STYLE_ID) && !doc.getElementById('ag-prism-css') && !doc.getElementById('prism-style')) {
        return false;
      }
      if ((getConfig() || {}).motionLevel === 'off' || ga(doc.documentElement, 'data-ag-cs-motion') === 'off') return false;
      return !win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    }

    function clearBoxAnimTimers(b) {
      if (!b) return;
      for (const k of ['_agCloseTimer', '_agSettleTimer']) {
        if (b[k]) {
          clearTimeout(b[k]);
          inlineDiffAnimTimers.delete(b[k]);
          b[k] = 0;
        }
      }
    }

    function normalizeBadgeEl(chipOrBadge) {
      if (!chipOrBadge) return null;
      if (ga(chipOrBadge, 'data-testid') === 'diff-line-count') return chipOrBadge;
      const inner = qs(chipOrBadge, '[data-testid="diff-line-count"]');
      return inner || chipOrBadge;
    }

    function syncDiffHostMask(el) {
      let cur = el?.parentElement || null;
      while (cur) {
        const tid = ga(cur, 'data-testid');
        if (tid === 'autoscroll-viewport' || tid === 'conversation-view') break;
        if (cur.classList?.contains('overflow-y-auto') || cur.classList?.contains('bleed-contain')) {
          const hasOpen = Array.from(qa(cur, '.ag-cs-inline-diff-box[data-ag-cs-inline-diff="1"]')).some(
            (b) => (ga(b, 'data-ag-diff-state') || 'open') !== 'closing'
          );
          if (hasOpen) sa(cur, 'data-ag-has-inline-diff', '1');
          else ra(cur, 'data-ag-has-inline-diff');
        }
        cur = cur.parentElement;
      }
    }

    function toggleInlineDiffPreview(chipOrBadge, opts = null) {
      if (isDead() || !doc || !chipOrBadge) return false;
      const badgeEl = normalizeBadgeEl(chipOrBadge);
      if (!badgeEl) return false;
      const rowEl = findInlineDiffHostRow(badgeEl);
      if (!rowEl?.parentNode) return false;
      const chipEl = cl(badgeEl, '[data-ag-diff-chip="1"]') || findDiffChipContainer(badgeEl);
      const AO = 'data-ag-inline-diff-open',
        AH = 'data-ag-inline-diff-host',
        AA = 'data-ag-diff-anim',
        AS = 'data-ag-diff-state',
        BC = 'ag-cs-inline-diff-box';
      const nextSib = rowEl.nextElementSibling;
      const allowAnim = !(opts && opts.noAnim === true) && shouldAnimateInlineDiff();
      const schedSettle = (b, checkOpen) => {
        const tid = setTimeout(() => {
          inlineDiffAnimTimers.delete(tid);
          b._agSettleTimer = 0;
          if (!isDead() && b.isConnected !== false && (!checkOpen || ga(b, AS) === 'open')) mut(() => ra(b, AA));
        }, 165);
        b._agSettleTimer = tid;
        inlineDiffAnimTimers.add(tid);
      };
      if (nextSib?.classList?.contains(BC) && nextSib._agDiffBadge === badgeEl) {
        if ((ga(nextSib, AS) || 'open') === 'closing') {
          if (opts && opts.closeOnly) return true;
          clearBoxAnimTimers(nextSib);
          mut(() => {
            if (allowAnim) sa(nextSib, AA, '1');
            sa(nextSib, AS, 'open');
            sa(badgeEl, AO, '1');
            if (chipEl) sa(chipEl, AO, '1');
            sa(rowEl, AH, '1');
            syncDiffHostMask(rowEl);
          });
          if (allowAnim) schedSettle(nextSib, false);
          stats.inlineDiffToggleCount++;
          return true;
        }
        if (opts && opts.openOnly) return true;
        clearBoxAnimTimers(nextSib);
        nextSib._agDiffReqId = 0;
        if (allowAnim) {
          mut(() => {
            ra(badgeEl, AO);
            if (chipEl) ra(chipEl, AO);
            sa(nextSib, AA, '1');
            sa(nextSib, AS, 'closing');
            syncDiffHostMask(rowEl);
          });
          const tid = setTimeout(() => {
            inlineDiffAnimTimers.delete(tid);
            nextSib._agCloseTimer = 0;
            if (!isDead()) {
              mut(() => {
                if (nextSib.parentNode) nextSib.remove();
                if (!rowEl.nextElementSibling?.classList?.contains(BC)) ra(rowEl, AH);
                syncDiffHostMask(rowEl);
              });
            }
          }, 130);
          nextSib._agCloseTimer = tid;
          inlineDiffAnimTimers.add(tid);
        } else {
          mut(() => {
            nextSib.remove();
            ra(badgeEl, AO);
            if (chipEl) ra(chipEl, AO);
            ra(rowEl, AH);
            syncDiffHostMask(rowEl);
          });
        }
        stats.inlineDiffToggleCount++;
        return true;
      }

      if (opts && opts.closeOnly) return false;

      const payload = extractInlineDiffPayload(badgeEl, rowEl);
      const hasStepCtx = Boolean(payload.diffContext?.cascadeId && Number.isInteger(Number(payload.diffContext?.stepIndex)));
      // Graceful fallback when neither local diff lines, step context, nor Daemon RPC is available: yield to native host Sidebar click
      if (!payload.lines.length && !hasStepCtx && !(payload.uri && typeof win?.__agPrismInlineDiffCall === 'function')) {
        return false;
      }

      const isRenderableResp = (r) =>
        Boolean(r && r.ok && ((Array.isArray(r.lines) && r.lines.length > 0) || r.mode === 'binary'));
      const stepStats = { additions: payload.additions || 0, deletions: payload.deletions || 0 };
      let pendingRpc = null;
      if (!payload.lines.length) {
        pendingRpc = requestInlineDiffForStep(payload, stepStats);
        if (!pendingRpc) return false;
        if (pendingRpc.cached && !isRenderableResp(pendingRpc.cached)) {
          return false;
        }
      }

      const body = mk('div', 'ag-cs-inline-diff-body'),
        box = markNoTrOwned(mk('div', BC, null, mk('div', 'ag-cs-inline-diff-card', null, body)));
      sa(box, 'data-ag-cs-inline-diff', '1');
      box._agDiffBadge = badgeEl;
      box._agDiffReqId = 0;
      const openSb = () => {
        try { win?.__agPrismPreserveScroll?.(badgeEl); } catch {}
        allowNativeDiffClick = true;
        try {
          badgeEl.click?.();
        } finally {
          allowNativeDiffClick = false;
        }
      };
      const applyResp = (resp) => {
        if (resp?.ok && Array.isArray(resp.lines) && resp.lines.length > 0) {
          renderInlineDiffBody(body, resp.lines, 'lines', resp.mode, stepStats, resp, openSb);
          return true;
        }
        if (resp?.ok && resp.mode === 'binary') {
          renderInlineDiffBody(body, [], 'binary');
          return true;
        }
        clearBoxAnimTimers(box);
        box._agDiffReqId = 0;
        if (box.parentNode) box.remove();
        ra(badgeEl, AO);
        if (chipEl) ra(chipEl, AO);
        if (!rowEl.nextElementSibling?.classList?.contains(BC)) ra(rowEl, AH);
        syncDiffHostMask(rowEl);
        return false;
      };
      const scrollDiffIntoView = () => {
        try {
          box.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
        } catch {}
      };
      if (payload.lines.length) {
        renderInlineDiffBody(body, payload.lines, 'lines', null, stepStats, null, openSb);
      } else if (pendingRpc?.cached) {
        applyResp(pendingRpc.cached);
        pendingRpc = null;
      } else {
        renderInlineDiffBody(body, [], 'loading');
        if (pendingRpc) box._agDiffReqId = pendingRpc.reqId;
      }

      sa(box, AS, 'open');
      if (allowAnim) sa(box, AA, '1');
      mut(() => {
        if (nextSib?.classList?.contains(BC)) {
          clearBoxAnimTimers(nextSib);
          nextSib._agDiffReqId = 0;
          nextSib.remove();
        }
        rowEl.parentNode.insertBefore(box, rowEl.nextElementSibling || null);
        sa(badgeEl, AO, '1');
        if (chipEl) sa(chipEl, AO, '1');
        sa(rowEl, AH, '1');
        syncDiffHostMask(rowEl);
      });
      if (!pendingRpc && box.isConnected !== false) scrollDiffIntoView();
      if (allowAnim) schedSettle(box, true);
      if (pendingRpc) {
        const expId = pendingRpc.reqId;
        pendingRpc.promise.then((resp) => {
          if (!isDead() && box.isConnected !== false && box._agDiffReqId === expId) {
            let rendered = false;
            mut(() => {
              rendered = applyResp(resp);
            });
            if (rendered) scrollDiffIntoView();
            else openSb();
          }
        });
      }
      stats.inlineDiffToggleCount++;
      return true;
    }

    function resolveDiffBadgeFromTarget(t) {
      if (!t?.closest) return null;
      const d = cl(t, '[data-testid="diff-line-count"]');
      if (d && !cl(d, '[data-testid="changed-files-card"]')) return d;
      const b = qs(cl(t, '[data-ag-diff-chip="1"]'), '[data-testid="diff-line-count"]');
      if (b && !cl(b, '[data-testid="changed-files-card"]')) return b;
      return cl(t, '.ag-cs-inline-diff-box')?._agDiffBadge || null;
    }

    function clearHoverPrefetchTimer() {
      if (inlineDiffHoverTimer) {
        clearTimeout(inlineDiffHoverTimer);
        inlineDiffHoverTimer = 0;
      }
    }

    function scheduleChipSyncDebounce() {
      if (chipSyncDebounceTimer) clearTimeout(chipSyncDebounceTimer);
      chipSyncDebounceTimer = setTimeout(() => {
        chipSyncDebounceTimer = 0;
        if (!isDead()) syncInlineDiffChips();
      }, 24);
    }

    function onDocClickCapture(ev) {
      try {
        const t = ev?.target;
        if (isDead() || !t?.closest) return;
        if (diffCtxMenuEl && !cl(t, '.ag-cs-diff-ctx-menu')) closeDiffContextMenu();
        if (!allowNativeDiffClick && !cl(t, '.ag-cs-inline-diff-box')) {
          const db = resolveDiffBadgeFromTarget(t);
          if (db) {
            if (toggleInlineDiffPreview(db)) {
              ev.preventDefault?.();
              ev.stopPropagation?.();
            }
            return;
          }
        }
        if (cl(t, 'button, [role="button"]')) {
          scheduleChipSyncDebounce();
        }
      } catch {}
    }

    function onWinPointerDownCapture(ev) {
      try {
        if (isDead() || !diffCtxMenuEl) return;
        const t = ev?.target;
        if (!t?.closest || !cl(t, '.ag-cs-diff-ctx-menu')) {
          closeDiffContextMenu();
        }
      } catch {}
    }

    function onWinContextMenu(ev) {
      try {
        if (isDead() || !ev?.target?.closest) return;
        const t = ev.target;
        const db = resolveDiffBadgeFromTarget(t);
        if (!db) {
          closeDiffContextMenu();
          return;
        }
        if (ev.shiftKey) {
          closeDiffContextMenu();
          return;
        }
        if (cl(t, '.ag-cs-inline-diff-box')) {
          const selText = String(win?.getSelection?.() || '').trim();
          if (selText.length > 0) {
            closeDiffContextMenu();
            return;
          }
        }
        if (openDiffContextMenu(ev, db)) {
          ev.preventDefault?.();
          ev.stopPropagation?.();
        }
      } catch {}
    }

    function onWinKeyDownCapture(ev) {
      try {
        if (isDead() || !ev) return;
        if (ev.key === 'Escape' && diffCtxMenuEl) {
          if (closeDiffContextMenu()) {
            ev.preventDefault?.();
            ev.stopPropagation?.();
          }
        }
      } catch {}
    }

    function onWinPointerOver(ev) {
      try {
        const t = ev?.target;
        if (isDead() || !t?.closest) return;
        if (cl(t, '.ag-cs-inline-diff-box')) {
          clearHoverPrefetchTimer();
          return;
        }
        const db = resolveDiffBadgeFromTarget(t);
        if (!db || ga(db, 'data-ag-inline-diff-open') === '1') {
          clearHoverPrefetchTimer();
          return;
        }
        clearHoverPrefetchTimer();
        inlineDiffHoverTimer = setTimeout(() => {
          inlineDiffHoverTimer = 0;
          if (isDead() || db.isConnected === false) return;
          const p = extractInlineDiffPayload(db, null);
          if (!p.lines.length && (p.diffContext?.cascadeId || (p.uri && typeof win?.__agPrismInlineDiffCall === 'function'))) {
            requestInlineDiffForStep(p, { additions: p.additions || 0, deletions: p.deletions || 0 });
          }
        }, 110);
      } catch {}
    }

    function onWinPointerOut(ev) {
      try {
        if (!inlineDiffHoverTimer) return;
        const rel = ev?.relatedTarget;
        if (!rel || !rel.closest || !resolveDiffBadgeFromTarget(rel)) {
          clearHoverPrefetchTimer();
        }
      } catch {}
    }

    function onWinScrollCapture(ev) {
      try {
        if (!diffCtxMenuEl) return;
        const t = ev?.target;
        if (t && diffCtxMenuEl.contains?.(t)) return;
        closeDiffContextMenu();
      } catch {}
    }

    function onWinBlurOrResize() {
      try {
        if (diffCtxMenuEl) closeDiffContextMenu();
      } catch {}
    }

    function onCtxOpenBus(ev) {
      try {
        if (ev?.detail?.source !== 'inline-diff') {
          closeDiffContextMenu();
        }
      } catch {}
    }

    if (win && typeof win.addEventListener === 'function') {
      win.addEventListener('click', onDocClickCapture, true);
      win.addEventListener('pointerdown', onWinPointerDownCapture, true);
      win.addEventListener('contextmenu', onWinContextMenu, true);
      win.addEventListener('keydown', onWinKeyDownCapture, true);
      win.addEventListener('pointerover', onWinPointerOver, { passive: true });
      win.addEventListener('pointerout', onWinPointerOut, { passive: true });
      win.addEventListener('scroll', onWinScrollCapture, true);
      win.addEventListener('blur', onWinBlurOrResize);
      win.addEventListener('resize', onWinBlurOrResize);
      win.addEventListener('ag-prism:ctx-open', onCtxOpenBus);
    }

    ensureStyleMounted();

    function bindHooks(hooks) {
      if (!hooks || typeof hooks !== 'object') return;
      if (typeof hooks.t === 'function') hookTFn = hooks.t;
      if (typeof hooks.getLang === 'function') hookGetLang = hooks.getLang;
      if (typeof hooks.runGuardedMut === 'function') hookMut = hooks.runGuardedMut;
      if (typeof hooks.setAttrIfChanged === 'function') hookSetA = hooks.setAttrIfChanged;
    }

    function unbindHooks() {
      hookTFn = baseTFn;
      hookGetLang = baseGetLang;
      hookMut = baseMut;
      hookSetA = baseSetA;
    }

    function sync(cfg, hooks) {
      if (isDead()) return;
      if (cfg && typeof cfg === 'object') {
        currentConfig = { ...currentConfig, ...cfg };
      }
      if (hooks && typeof hooks === 'object') {
        bindHooks(hooks);
      }
      ensureStyleMounted();
      syncInlineDiffChips();
    }

    function closeMenuIfOpen() {
      return closeDiffContextMenu();
    }

    function getDebugState() {
      return {
        inlineDiffToggleCount: stats.inlineDiffToggleCount,
        cacheSize: inlineDiffCache.size,
        pendingSize: inlineDiffPending.size,
        menuOpen: Boolean(diffCtxMenuEl),
        styleMounted: Boolean(doc?.getElementById?.(INLINE_DIFF_STYLE_ID)),
        destroyed: Boolean(localDestroyed),
      };
    }

    function destroy() {
      if (localDestroyed) return;
      localDestroyed = true;
      for (const tid of inlineDiffAnimTimers) clearTimeout(tid);
      inlineDiffAnimTimers.clear();
      clearHoverPrefetchTimer();
      if (chipSyncDebounceTimer) {
        clearTimeout(chipSyncDebounceTimer);
        chipSyncDebounceTimer = 0;
      }
      closeDiffContextMenu();
      for (const entry of inlineDiffPending.values()) {
        if (entry?.timer) clearTimeout(entry.timer);
        try {
          entry?.resolve?.(null);
        } catch {}
      }
      inlineDiffPending.clear();
      inlineDiffInflight.clear();
      inlineDiffCache.clear();
      if (win && win.__agPrismInlineDiffResolve === onInlineDiffResolve) {
        try {
          delete win.__agPrismInlineDiffResolve;
        } catch {}
      }
      if (win && typeof win.removeEventListener === 'function') {
        try {
          win.removeEventListener('click', onDocClickCapture, true);
          win.removeEventListener('pointerdown', onWinPointerDownCapture, true);
          win.removeEventListener('contextmenu', onWinContextMenu, true);
          win.removeEventListener('keydown', onWinKeyDownCapture, true);
          win.removeEventListener('pointerover', onWinPointerOver);
          win.removeEventListener('pointerout', onWinPointerOut);
          win.removeEventListener('scroll', onWinScrollCapture, true);
          win.removeEventListener('blur', onWinBlurOrResize);
          win.removeEventListener('resize', onWinBlurOrResize);
          win.removeEventListener('ag-prism:ctx-open', onCtxOpenBus);
        } catch {}
      }
      if (doc && typeof doc.querySelectorAll === 'function') {
        mut(() => {
          for (const sel of ['.ag-cs-inline-diff-box', '.ag-cs-diff-ctx-menu']) {
            qa(doc, sel).forEach((n) => n.remove());
          }
          qa(doc, '[data-testid="diff-line-count"], [data-ag-diff-chip-file="1"]').forEach((el) => {
            if (el._agOrigTooltipId) {
              sa(el, 'data-tooltip-id', el._agOrigTooltipId);
              delete el._agOrigTooltipId;
            }
            delete el._agSyncedTxt;
            delete el._agSyncedChip;
          });
          for (const k of 'diff-chip|diff-chip-file|diff-chip-row|diff-stat|inline-diff-open|inline-diff-host|has-inline-diff|diff-anim|diff-state|cs-inline-diff'.split(
            '|'
          )) {
            const a = 'data-ag-' + k;
            qa(doc, `[${a}]`).forEach((el) => ra(el, a));
          }
        });
      }
      mut(() => {
        try {
          const st = (typeof doc?.getElementById === 'function' ? doc.getElementById(INLINE_DIFF_STYLE_ID) : null) || styleEl;
          st?.remove?.();
        } catch {}
      });
      styleEl = null;
      unbindHooks();
      if (win && win.__agPrismInlineDiff === selfApi) {
        try {
          delete win.__agPrismInlineDiff;
        } catch {}
      }
      if (G && G.__agPrismInlineDiff === selfApi) {
        try {
          delete G.__agPrismInlineDiff;
        } catch {}
      }
    }

    selfApi = {
      sync,
      unbindHooks,
      toggleInlineDiffPreview,
      closeMenuIfOpen,
      getDebugState,
      destroy,
    };
    return selfApi;
  }

  const W = typeof window !== 'undefined' ? window : G;
  const D = typeof document !== 'undefined' ? document : W?.document || null;

  if (W) {
    try {
      W.__agPrismInlineDiffFactory = createInlineDiffClient;
    } catch {}
  }
  if (G && G !== W) {
    try {
      G.__agPrismInlineDiffFactory = createInlineDiffClient;
    } catch {}
  }

  // Idempotent singleton self-mount in browser / CDP runtime (supports hot reload)
  if (W && D && typeof D.createElement === 'function') {
    try {
      W.__agPrismInlineDiff?.destroy?.();
    } catch {}
    try {
      const inst = createInlineDiffClient({ win: W, doc: D });
      W.__agPrismInlineDiff = inst;
      if (G && G !== W) G.__agPrismInlineDiff = inst;
      inst.sync();
    } catch {}
  }

  if (typeof module === 'object' && module.exports) {
    module.exports = {
      STYLE_ID: INLINE_DIFF_STYLE_ID,
      INLINE_DIFF_CSS,
      parseUnifiedDiffLines,
      buildPairDiffLines,
      createInlineDiffClient,
    };
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);

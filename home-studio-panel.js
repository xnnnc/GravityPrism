// Obsidian Prism — Studio Home Telemetry Dashboard & Rollup Cache Module (home-studio-panel.js)
(function (root) {
  'use strict';
  const G = root || (typeof globalThis !== 'undefined' ? globalThis : window);
  if (!G) return;

  const STUDIO_STYLE_ID = 'ag-prism-studio-v101-css';
  const isFn = (v) => typeof v === 'function';
  const isFin = (v) => typeof v === 'number' && Number.isFinite(v);
  const toNum = (v) => { const n = typeof v === 'number' || typeof v === 'bigint' || typeof v === 'string' ? Number(v) : 0; return Number.isFinite(n) ? n : 0; };
  function markNoTr(e) {
    if (e?.setAttribute) for (const s of 'translate=no,data-no-translate=true,data-ag-localization-skip=true,data-agy-no-translate=true,data-antigravity-zh-skip=1,data-ag-no-i18n='.split(',')) { const p = s.split('='); e.setAttribute(p[0], p[1]); }
    return e;
  }

  const STUDIO_HEAD_CSS = '.ag-cs-home-panel-head{flex-wrap:wrap;row-gap:8px}';
  const STUDIO_MODEL_COLOR_CSS = 'html :is(.ag-cs-home-chart-seg,.ag-cs-home-model-swatch)[data-ag-mc]{background-color:var(--_mc-d);}html[data-ag-cs-theme="light"] :is(.ag-cs-home-chart-seg,.ag-cs-home-model-swatch)[data-ag-mc],html>body:is(.theme-light,.light-theme,.light) :is(.ag-cs-home-chart-seg,.ag-cs-home-model-swatch)[data-ag-mc]{background-color:var(--_mc-l);}';
  const STUDIO_EXTRA_CSS = STUDIO_HEAD_CSS + '.ag-cs-home-tab,.ag-cs-home-range{white-space:nowrap}.ag-cs-home-ws-select{color-scheme:inherit}.ag-cs-home-ws-select option{background:var(--card,#141418);color:var(--foreground,#F2F2F5);}.agy-home{--_a:var(--ag-cs-accent);--_b:1px solid var(--_kb)}.ag-cs-hs-tg,.ag-cs-home-local-note{font-size:11px}.ag-cs-hs-tg{display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 8px;border:var(--_b);border-radius:6px;background:var(--_tb);color:var(--foreground);font-family:inherit;font-weight:500;white-space:nowrap;cursor:pointer;&:hover{background:var(--ag-cs-hover-wash)}&[aria-pressed="true"]{color:var(--_a);border-color:color-mix(in srgb,currentColor 32%,#0000);background:color-mix(in srgb,currentColor 11%,#0000)}& svg{width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}}:is(.ag-cs-home-ws-select,.ag-cs-hs-tg,.ag-cs-quota-refresh):focus-visible{outline:2px solid var(--_a);outline-offset:1px}.ag-cs-home-local-note{line-height:1.4;color:var(--muted-foreground);opacity:.86;padding-top:8px;border-top:var(--_b)}' + STUDIO_MODEL_COLOR_CSS;

  // 高区分度双主题模型阵营子色板（每项为 [深色hex, 浅色hex]），避免同阵营模型落入近似蓝/重复索引
  const MODEL_CAMP_PALETTES = {
    gemini: [
      ['#4F8BFF', '#2563EB'], // 钴蓝
      ['#22D3EE', '#0891B2'], // 电光青
      ['#818CF8', '#4F46E5'], // 靛紫蓝
      ['#2DD4BF', '#0D9488'], // 碧水青绿
      ['#93C5FD', '#1E40AF'], // 冰蓝 / 深海蓝
    ],
    claude: [
      ['#F59E0B', '#D97706'], // 琥珀金
      ['#FB7185', '#E11D48'], // 珊瑚玫红
      ['#F97316', '#C2410C'], // 暖橘橙
      ['#FBBF24', '#B45309'], // 蜂蜜金黄
      ['#F43F5E', '#BE123C'], // 绯红
    ],
    gpt: [
      ['#34D399', '#059669'], // 翠绿薄荷
      ['#A3E635', '#65A30D'], // 鲜柠绿
      ['#4ADE80', '#16A34A'], // 草叶绿
      ['#5EEAD4', '#0F766E'], // 海沫玉绿
    ],
    deepseek: [
      ['#A78BFA', '#7C3AED'], // 电光紫
      ['#E879F9', '#C026D3'], // 兰花洋红
      ['#C084FC', '#9333EA'], // 紫水晶
      ['#F472B6', '#DB2777'], // 亮粉紫
    ],
  };
  const MODEL_OVERFLOW_PALETTE = [
    ['#38BDF8', '#0284C7'],
    ['#EC4899', '#BE185D'],
    ['#84CC16', '#4D7C0F'],
    ['#FB923C', '#EA580C'],
    ['#C4B5FD', '#6D28D9'],
    ['#FACC15', '#CA8A04'],
    ['#14B8A6', '#115E59'],
    ['#94A3B8', '#475569'],
  ];
  const MODEL_ALL_FALLBACKS = [
    ...MODEL_OVERFLOW_PALETTE,
    ...MODEL_CAMP_PALETTES.gemini,
    ...MODEL_CAMP_PALETTES.claude,
    ...MODEL_CAMP_PALETTES.gpt,
    ...MODEL_CAMP_PALETTES.deepseek,
  ];
  const detectModelCamp = (id) => {
    const s = String(id || '').toLowerCase();
    if (/gemini|palm|bard/.test(s)) return 'gemini';
    if (/claude|anthropic|opus|sonnet|haiku/.test(s)) return 'claude';
    if (/gpt|openai|codex|chatgpt|\bo[134](?:-|\b)/.test(s)) return 'gpt';
    if (/deepseek/.test(s)) return 'deepseek';
    return 'other';
  };
  const hslToHex = (hDeg, sPct, lPct) => {
    const h = (((hDeg % 360) + 360) % 360) / 360;
    const s = sPct / 100;
    const l = lPct / 100;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const ch = (t) => {
      const k = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
      const v = k < 1 / 6 ? p + (q - p) * 6 * k : k < 0.5 ? q : k < 2 / 3 ? p + (q - p) * (2 / 3 - k) * 6 : p;
      return Math.round(v * 255).toString(16).padStart(2, '0').toUpperCase();
    };
    return '#' + ch(h + 1 / 3) + ch(h) + ch(h - 1 / 3);
  };
  const fnv1aHash = (str) => {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    return h >>> 0;
  };
  function resolveHomeModelColours(ids, fallbackIndices) {
    const uniqueIds = Array.from(new Set((Array.isArray(ids) ? ids : []).filter(Boolean))).sort();
    const usedDark = new Set();
    const usedLight = new Set();
    const out = {};
    let seqIdx = 0;
    for (const id of uniqueIds) {
      const camp = detectModelCamp(id);
      const campPool = MODEL_CAMP_PALETTES[camp] || [];
      const candidates = [...campPool, ...MODEL_ALL_FALLBACKS];
      let picked = null;
      for (const pair of candidates) {
        if (!usedDark.has(pair[0]) && !usedLight.has(pair[1])) { picked = pair; break; }
      }
      if (!picked) {
        const baseHue = fnv1aHash(id) % 360;
        for (let step = 0; step < 360; step++) {
          const hue = (baseHue + step * 137.508) % 360;
          const dHex = hslToHex(hue, 76, step % 2 === 0 ? 64 : 54);
          const lHex = hslToHex(hue, 72, step % 2 === 0 ? 42 : 34);
          if (!usedDark.has(dHex) && !usedLight.has(lHex)) { picked = [dHex, lHex]; break; }
        }
      }
      usedDark.add(picked[0]);
      usedLight.add(picked[1]);
      const baseIdx = fallbackIndices && Number.isInteger(fallbackIndices[id]) ? fallbackIndices[id] : seqIdx % 10;
      out[id] = { idx: baseIdx, dark: picked[0], light: picked[1], camp };
      seqIdx += 1;
    }
    return out;
  }
  const isLightHomeTheme = (d) => {
    if (d?.documentElement?.getAttribute?.('data-ag-cs-theme') === 'light') return true;
    const cls = String(d?.body?.className || '');
    return /(?:^|\s)(?:theme-light|light-theme|light)(?:\s|$)/.test(cls);
  };
  const applyModelSwatchColor = (el, spec, lightNow) => {
    if (!el || !spec) return el;
    el.setAttribute('data-color', String(spec.idx ?? 0));
    el.setAttribute('data-ag-mc', lightNow ? spec.light : spec.dark);
    if (el.style) {
      if (isFn(el.style.setProperty)) {
        el.style.setProperty('--_mc-d', spec.dark);
        el.style.setProperty('--_mc-l', spec.light);
      } else {
        el.style.background = lightNow ? spec.light : spec.dark;
      }
    }
    return el;
  };

  const REMOTE_TITLE_RE = /\[(SSH|WSL|Dev Container|Codespaces|Tunnel|Remote):\s*([^\]]+)\]/i;
  const decUri = (v) => { const s = String(v || '').trim(); if (!s) return ''; try { return decodeURIComponent(s); } catch { return s; } };
  const packScope = (pfx, v) => {
    const c = decUri(v).toLowerCase().replace(/[^a-z0-9._:@-]+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
    return !c || /^(?:__proto__|constructor|prototype)$/.test(c) ? '' : `${pfx}:${c}`;
  };
  const mkRem = (k, v) => (/^ssh(?:-remote)?$/i.test(k) ? packScope('ssh', v) : packScope('remote', `${k.toLowerCase()}-${v}`));
  const extractScopeFromUri = (u) => {
    const s = decUri(u);
    const m = s && (s.match(/[?&#]remoteAuthority=([^&#\s]+)/i)?.[1] || s).match(/(?:^|vscode-remote:\/\/)([a-z0-9_-]+)\+([^/&#?\s]+)/i);
    return m ? mkRem(m[1], m[2]) : '';
  };
  const normalizeScopeKey = (raw) => {
    const s = String(raw || '').trim();
    if (!s) return '';
    if (/^local$/i.test(s)) return 'local';
    const pm = s.match(/^(ssh|remote):(.+)$/i);
    if (pm) return packScope(pm[1].toLowerCase(), pm[2]);
    const tm = s.match(REMOTE_TITLE_RE);
    return tm ? mkRem(tm[1], tm[2]) : extractScopeFromUri(s);
  };
  const formatScopeBadge = (sc) => (!sc || sc === 'local' ? '' : sc.startsWith('ssh:') ? 'SSH · ' + sc.slice(4) : sc.startsWith('remote:') ? 'Remote' + (sc.slice(7) ? ' · ' + sc.slice(7) : '') : '');
  const eqId = (a, b) => !!(a && b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase());
  const fixRec = (id, r) => {
    if (!r) return r;
    const s = id || r.cascadeId, sp = eqId(r.parentId, s), sr = eqId(r.rootId, s), sc = eqId(r.rootConversationId, s);
    if (!sp && !sr && !sc) return r;
    const o = { ...r };
    if (sp) o.parentId = '';
    if (sr) delete o.rootId;
    if (sc) delete o.rootConversationId;
    if (!o.parentId) o.subagent = false;
    return o;
  };
  const STUDIO_FB = Object.fromEntries(
    `zh-CN|子代理|Token|蜂群|入|出|额度偏低|余量偏紧|充裕|接下来做什么|，|？|含归档|仅当前|当前|归档|仅本地|仅统计本机已保存会话（不含云端）
zh-TW|子代理|Token|蜂群|入|出|額度偏低|餘量偏緊|充裕|接下來做什麼|，|？|含歸檔|僅當前|當前|歸檔|僅本機|僅統計本機已儲存工作階段（不含雲端）
en|subagents|tokens||in|out|Low Quota|Running Low|Healthy|What's up next|||All|Current|Active|Archived|Local only|Counts saved local sessions only (excludes cloud)
ja|サブエージェント|トークン||入力|出力|残枠少|残り少なめ|余裕あり|次は何をしますか|、|？|履歴含む|現在のみ|現在|アーカイブ|ローカルのみ|ローカル保存済みセッションのみ集計（クラウド除く）
ko|서브에이전트|토큰||입력|출력|할당량 부족|잔여량 적음|여유|다음은 무엇을 할까요|||보관 포함|현재만|현재|보관|로컬만|로컬 저장 세션만 집계 (클라우드 제외)
es|subagentes|tokens||entr.|sal.|Cuota baja|Casi agotada|Óptima|¿Qué hacemos ahora|||Todo|Actuales|Activas|Archiv.|Solo local|Solo sesiones locales guardadas (sin nube)
fr|sous-agents|tokens||entr.|sort.|Quota bas|Presque épuisé|Optimal|Que faisons-nous ensuite|| ?|Tout|Actuelles|Actives|Archiv.|Local|Sessions locales enregistrées uniquement (hors cloud)
de|Subagenten|Token||Ein|Aus|Wenig Kontingent|Wird knapp|Reichlich|Was steht als Nächstes an|||Alle|Aktuell|Aktiv|Archiv.|Nur lokal|Nur lokal gespeicherte Sitzungen (ohne Cloud)`.split('\n').map((s) => { const a = s.split('|'); return [a[0], [a[1], a[2], a[3] || 'Swarm', a[4], a[5], a[6], a[7], a[8], a[9], a[10] || ', ', a[11] || '?', ...a.slice(12)]]; })
  );
  const normStudioLang = (l) => {
    const c = G.__agCsI18nCore?.normalizeLanguage;
    if (isFn(c)) return c(l, 'en');
    const s = String(l || '').trim();
    if (STUDIO_FB[s]) return s;
    const lo = s.toLowerCase();
    if (/^(?:zh|yue)/.test(lo)) return /[-_](?:tw|hant|hk|mo)/.test(lo) ? 'zh-TW' : 'zh-CN';
    return lo.match(/^(ja|ko|es|fr|de)/)?.[1] || 'en';
  };
  const studioFb = (l) => STUDIO_FB[normStudioLang(l)] || STUDIO_FB.en;
  const hasTok = (r, c) => !!(r?.days && (toNum(r.calls) > 0 || Object.values(r.days).some((d) => d && (toNum(d.total || d.tokens) > 0 || (c && toNum(d.calls) > 0)))));
  const hasRealUsage = (r) => hasTok(r, 1);
  // 仅依据已落盘的调用次数或真实 token 消耗判断，避免把 _do 延迟占位（days[d].calls===1, total===0）误判为有效消耗
  const hasPersistedTokens = (r) => hasTok(r);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const getDoc = () => (typeof document !== 'undefined' ? document : null);
  const getWin = () => (typeof window !== 'undefined' ? window : G);

  function createHomeStudioPanelController({
    usageCore,
    storageUsageCacheKey = 'ag-prism:trajRollup.v1',
    scopeKey: scOpt = '',
    waitTickMs = 120,
    isDestroyed: isHostDestroyed,
    getHomeLayout,
    getLang,
    uiText,
    getDisplayName,
    ensureHooks,
    canMountRealCanvas,
    setAttrIfChanged,
    runGuardedMut,
  }) {
    let disposed = false;
    const isDestroyed = () => disposed || Boolean(isHostDestroyed?.());
    const usageRecords = new Map();
    const replacedGreetings = new Map();
    let usageLoading = false;
    let quotaLoading = false;
    let usageHasData = false;
    let cacheHealed = false;
    let modelsExpanded = false;
    let wasHero = false;
    let localSaveBlocked = false;
    let lastUsageFetchAt = 0;
    let lastQuotaFetchAt = 0;
    let lastQuotaFailAt = 0;
    let lastQuotaTabTriggerAt = 0;
    let lastManualRefreshAt = 0;
    let lastOfflineWaitAt = 0;
    let quotaEpoch = 0;
    let quotaBindingSeq = 0;
    let usageDataEpoch = 0;
    let deferredUsageTimer = 0;
    let saveUsageTimer = 0;
    let saveUsageIdle = 0;
    let heatTipRaf = 0;
    let liveQuotaSnap = null;
    let quotaPending = null;
    let cachedAggData = null;
    let panelSeat = null;
    let panelEl = null;
    let heatTipEl = null;
    let shownHeatCell = null;
    let pendingHeatCell = null;
    let pendingHeatGrid = null;
    let bookPick = 0.07;
    let activeTab = 'overview';
    let activeRange = 'all';
    let activeWorkspace = 'all';
    let includeArchived = true;
    const scopePrefKey = 'ag-prism:homeSessionScope.v1';
    let detectedCurrentWorkspace = '';
    let lastPanelRenderKey = '';
    let cachedAggKey = '';
    let curScope = 'local';
    const modelColours = usageCore?.createHomeModelColours ? usageCore.createHomeModelColours() : () => ({});
    const mk = (tag, cls, txt, attrs) => {
      if (txt && typeof txt === 'object') { attrs = txt; txt = null; }
      const e = getDoc().createElement(tag);
      if (cls) e.className = cls;
      if (txt != null) e.textContent = txt;
      if (attrs) for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
      return e;
    };
    const sp = (c, t, a) => mk('span', c, t, a);
    const dv = (c, t, a) => mk('div', c, t, a);
    const HC = 'ag-cs-home-';
    const QC = 'ag-cs-quota-';
    const bt = (c, t, fn, a) => { const e = mk('button', c, t, a); e.type = 'button'; e.addEventListener('click', fn); return e; };
    const ap = (p, ...cs) => { for (const c of cs) if (c) p.appendChild(c); return p; };
    const mkSv = (d, t, a) => { const n = d.createElementNS('http://www.w3.org/2000/svg', t); for (let i = 0; i < a.length; i += 2) n.setAttribute(a[i], a[i + 1]); return n; };
    const setArch = (r, on) => { const o = { ...r }; if (on) o.archived = true; else delete o.archived; return o; };
    const scopeStorageKey = (sc) => (sc && sc !== 'local' ? `${storageUsageCacheKey}:${sc}` : storageUsageCacheKey);
    const clearSaveTimers = () => {
      if (saveUsageTimer) { clearTimeout(saveUsageTimer); saveUsageTimer = 0; }
      if (saveUsageIdle) { try { if (isFn(G.cancelIdleCallback)) G.cancelIdleCallback(saveUsageIdle); } catch {} saveUsageIdle = 0; }
    };
    const wsUrisOf = (s) => {
      const o = [];
      const tm = s?.trajectoryMetadata;
      for (const w of [...(s?.workspaces || tm?.workspaces || []), s?.workspaceUri, s?.workspacePath, tm?.workspaceUri]) {
        const u = String(typeof w === 'string' ? w : w?.workspaceFolderAbsoluteUri || w?.gitRootAbsoluteUri || w?.uri || w?.path || '').trim();
        if (u && !o.includes(u) && o.length < 4) o.push(u);
      }
      return o;
    };
    const detectScope = (entries, st, bScope) => {
      const w = getWin();
      const d = getDoc() || w?.document || null;
      const bn = normalizeScopeKey(bScope);
      for (const c of [scOpt, w?.__agPrismScopeKey, bn, w?.location?.href, d?.title, st?.remoteAuthority, st?.workspace?.uri, st?.workspaceUri]) {
        const sc = normalizeScopeKey(c);
        if (sc && sc !== 'local') return sc;
      }
      if (bn === 'local') return 'local';
      let rem = '';
      let rc = 0;
      let lc = 0;
      for (const [, sum] of entries || []) {
        let rh = '';
        let lh = false;
        for (const u of wsUrisOf(sum)) {
          const sc = extractScopeFromUri(u);
          if (sc) { rh = sc; break; }
          if (/^(?:file:\/\/|[a-z]:[\\/])/i.test(u)) lh = true;
        }
        if (rh) { if (!rem) rem = rh; rc++; } else if (lh) lc++;
      }
      return rem && rc > 0 && rc >= lc ? rem : 'local';
    };
    try { const st = ensureHooks?.()?.store?.getState?.(); curScope = detectScope(st?.trajectorySummaries?.summaries ? Object.entries(st.trajectorySummaries.summaries) : null, st, ''); } catch { curScope = detectScope(null, null, ''); }
    const syncScopeAttr = (sc) => {
      try {
        const de = getDoc()?.documentElement;
        if (!de) return;
        if (sc && sc !== 'local') setAttrIfChanged?.(de, 'data-ag-prism-scope', sc);
        else de.removeAttribute?.('data-ag-prism-scope');
      } catch {}
    };
    syncScopeAttr(curScope);

    const getLs = () => (typeof localStorage !== 'undefined' && localStorage) || null;
    try { if (getLs()?.getItem(scopePrefKey) === 'active') includeArchived = false; } catch {}
    const loadScopeCache = (sc) => {
      usageRecords.clear(); usageHasData = false; cacheHealed = false;
      try {
        const ls = getLs();
        const raw = ls && JSON.parse(ls.getItem(scopeStorageKey(sc)) || '{}');
        if (raw && typeof raw === 'object') {
          for (const [id, rec] of Object.entries(raw)) if (rec?.days) {
            const cr = fixRec(id, rec);
            if (cr !== rec) cacheHealed = true;
            usageRecords.set(id, cr);
          }
          if (usageRecords.size > 0) { usageHasData = true; usageDataEpoch += 1; }
        }
      } catch {}
    };
    loadScopeCache(curScope);

    const switchScope = (next) => {
      const norm = normalizeScopeKey(next) || 'local';
      if (norm === curScope) return false;
      clearSaveTimers();
      curScope = norm; localSaveBlocked = false; syncScopeAttr(curScope);
      activeWorkspace = 'all'; detectedCurrentWorkspace = cachedAggKey = lastPanelRenderKey = ''; lastUsageFetchAt = 0; cachedAggData = null; usageDataEpoch += 1;
      loadScopeCache(curScope);
      return true;
    };

    const flushUsageCacheNow = () => {
      clearSaveTimers();
      if ((curScope === 'local' && localSaveBlocked) || (!usageRecords.size && !lastUsageFetchAt)) return;
      try {
        const ls = getLs();
        if (!ls) return;
        let entries = [...usageRecords];
        if (entries.length > 1200) {
          entries.sort((a, b) => toNum(b[1]?.lastModifiedSec) - toNum(a[1]?.lastModifiedSec));
          entries = entries.slice(0, 1200);
        }
        ls.setItem(scopeStorageKey(curScope), JSON.stringify(Object.fromEntries(entries), (_, v) => (typeof v === 'bigint' ? Number(v) : v)));
      } catch {}
    };
    const saveUsageCache = () => {
      if (curScope === 'local' && localSaveBlocked) return;
      if (isDestroyed() || !isFn(setTimeout)) { flushUsageCacheNow(); return; }
      clearSaveTimers();
      saveUsageTimer = setTimeout(() => {
        saveUsageTimer = 0;
        if (isDestroyed()) return;
        if (isFn(G.requestIdleCallback)) saveUsageIdle = G.requestIdleCallback(() => { saveUsageIdle = 0; if (!isDestroyed()) flushUsageCacheNow(); }, { timeout: 2500 });
        else flushUsageCacheNow();
      }, 1200);
    };

    const toSec = (n, o, iso) => { const s = toNum(n || o?.seconds); if (s) return s; const t = typeof o === 'string' ? o : iso; return typeof t === 'string' ? Math.floor((Date.parse(t) || 0) / 1000) : 0; };
    const pickStr = (a, b, c) => String(a || b || c || '').trim();
    const extractMeta = (sum, id) => {
      const tm = sum?.trajectoryMetadata;
      const s = pickStr(id, sum?.id, sum?.cascadeId);
      const workspace = usageCore?.extractWorkspaceId ? usageCore.extractWorkspaceId(sum) : String(sum?.workspace || '');
      const dp = pickStr(tm?.parentConversationId, sum?.parentConversationId, sum?.parentId);
      const rp = pickStr(tm?.rootConversationId, sum?.rootConversationId, sum?.rootId);
      const parentId = dp && !eqId(dp, s) ? dp : rp && s && !eqId(rp, s) ? rp : '';
      const subagent = !!(parentId || usageCore?.isSubagentSummary?.(sum, s) || (sum?.subagent && !(eqId(dp, s) || (!dp && eqId(rp, s)))));
      return { workspace, u: wsUrisOf(sum), parentId, subagent, lastModifiedSec: toSec(sum?.lastModifiedSec, sum?.lastModifiedTime, sum?.modifiedAt), createdSec: toSec(sum?.createdSec, sum?.createdTime, sum?.createdAt), stepCount: toNum(sum?.stepCount ?? sum?.steps ?? 0) };
    };

    const advanceCachedCursor = (prev, id, sum, defer) => {
      const m = extractMeta(sum, id);
      const p = fixRec(id, prev);
      const base = { stepCount: m.stepCount, lastModifiedSec: m.lastModifiedSec, workspace: m.workspace || p?.workspace || '', parentId: m.parentId || p?.parentId || '', ...(defer ? { _do: 1 } : null) };
      if (p?.days) return setArch({ ...p, ...base, subagent: !!(p.subagent || m.subagent) }, false);
      const sec = m.lastModifiedSec || m.createdSec || 0;
      const days = {};
      if (sec > 0 && usageCore?.homeDayKey) {
        const d = new Date(sec * 1000);
        const hours = new Array(24).fill(0);
        hours[d.getHours()] = 1;
        days[usageCore.homeDayKey(d)] = { calls: 1, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, hours, models: {} };
      }
      return { cascadeId: String(id || ''), gmCount: 0, subagent: m.subagent, calls: 0, days, ...base };
    };

    const detectCurrentWorkspaceName = (entries) => {
      try {
        const t = getDoc()?.title;
        if (t) {
          const cand = String(t).replace(REMOTE_TITLE_RE, ' ').split(/\s+[-—|]\s+/).map((s) => s.trim()).find((p) => p && !/antigravity/i.test(p) && p.length <= 64);
          if (cand && /^[a-zA-Z0-9._\-\u4e00-\u9fa5]+$/.test(cand)) return cand;
        }
      } catch {}
      let latestSec = 0;
      let latestWs = '';
      for (const [eid, sum] of entries || []) {
        const m = extractMeta(sum, eid);
        if (!m.subagent && m.workspace && m.lastModifiedSec >= latestSec) { latestSec = m.lastModifiedSec; latestWs = m.workspace; }
      }
      return latestWs;
    };

    const inCooldown = (at, ms, now) => at > 0 && now >= at && now - at < ms;
    const hasUsableQuotas = (snap) => Array.isArray(snap?.groups) && snap.groups.length > 0 && snap.groups.some((g) => g && (!usageCore?.quotaWindows || usageCore.quotaWindows(g).length > 0));
    const withTimeout = (fn, ms, onTimeout) => new Promise((resolve) => {
      let settled = false;
      const done = (val) => { if (settled) return; settled = true; clearTimeout(timer); resolve(val); };
      const timer = setTimeout(() => { try { onTimeout?.(); } catch {} done(null); }, ms);
      Promise.resolve().then(fn).then((v) => done(v || null), () => done(null));
    });
    const callPrismMetricsBinding = (win, input) => {
      const k = '__agPrismMetricsResolve', reqId = 800000000 + (++quotaBindingSeq), prev = win[k];
      let cb, done;
      const restore = () => { if (!done) { done = 1; if (win[k] === cb) { if (prev !== undefined) win[k] = prev; else delete win[k]; } } };
      return withTimeout(() => new Promise((res) => {
        win[k] = cb = (id, p) => (id === reqId ? (restore(), res(p && typeof p === 'object' ? p : null)) : isFn(prev) && prev(id, p));
        try { win.__agPrismMetricsCall(JSON.stringify({ id: reqId, input })); } catch { restore(); res(null); }
      }), 10500, restore);
    };

    const refreshLiveTelemetrySnapshot = async (force = false, opts = null) => {
      if (isDestroyed()) return liveQuotaSnap;
      if (quotaLoading && quotaPending) return quotaPending;
      const now = Date.now();
      if (!force && ((hasUsableQuotas(liveQuotaSnap) && inCooldown(lastQuotaFetchAt, 45000, now)) || (!opts?.ignoreFailCooldown && inCooldown(lastQuotaFailAt, 15000, now)))) return liveQuotaSnap;
      const win = getWin();
      if (!win) return null;
      const telemetryOff = (getDoc() || win.document)?.documentElement?.getAttribute?.('data-ag-cs-telemetry') === 'off';
      quotaLoading = true;
      if (activeTab === 'quotas') renderHomePanel();
      return (quotaPending = (async () => {
        try {
          const req = { conversationId: null, force: !!force, quotaRefresh: !!(opts?.quotaRefresh ?? force), selectLatest: false };
          const host = win.agPulseHost, hm = host?.getMetrics, isPH = !!host?.__prismFallback, bridge = win.__agPrismMetricsBridge, tel = win.__agPrismTelemetry;
          let snap = null;
          const pick = (v) => { if (hasUsableQuotas(v)) snap = v; };
          const tryPick = async (fn, ms) => pick(await withTimeout(fn, ms));
          if (isFn(hm) && !isPH) await tryPick(() => hm.call(host, req), 3000);
          if (!hasUsableQuotas(snap) && !telemetryOff) {
            if (isPH && isFn(hm)) await tryPick(() => hm.call(host, req), 10500);
            else if (isFn(bridge?.getMetrics)) await tryPick(() => bridge.getMetrics(req), 10500);
            else if (isFn(win.__agPrismMetricsCall)) pick(await callPrismMetricsBinding(win, req));
            else if (!hm && isFn(tel?.refresh)) await tryPick(() => tel.refresh(), 4500);
            if (!hasUsableQuotas(snap)) pick(tel?.getLatestSnapshot?.());
          }
          if (hasUsableQuotas(snap)) { liveQuotaSnap = snap; lastQuotaFetchAt = Date.now(); lastQuotaFailAt = 0; quotaEpoch += 1; }
          else lastQuotaFailAt = Date.now();
          return liveQuotaSnap;
        } catch {
          lastQuotaFailAt = Date.now();
          return liveQuotaSnap;
        } finally {
          quotaLoading = false; quotaPending = null;
          if (!isDestroyed() && activeTab === 'quotas') renderHomePanel();
        }
      })());
    };

    const scheduleUsageRollupRefresh = (delayMs = 1800) => {
      if (isDestroyed() || usageLoading || getHomeLayout() !== 'studio') return;
      if (!usageHasData && !canMountRealCanvas(getDoc()?.body)) { void refreshUsageRollup(false); return; }
      if (deferredUsageTimer) return;
      const onHome = () => !isDestroyed() && getDoc()?.querySelector('.agy-home') && getHomeLayout() === 'studio';
      deferredUsageTimer = setTimeout(() => {
        deferredUsageTimer = 0;
        if (!onHome()) return;
        const run = () => { if (onHome()) void refreshUsageRollup(false); };
        if (usageHasData && isFn(G.requestIdleCallback)) G.requestIdleCallback(run, { timeout: 2200 });
        else run();
      }, usageHasData ? Math.max(400, delayMs) : 80);
    };

    const refreshUsageRollup = async (force = false) => {
      if (isDestroyed() || usageLoading || !usageCore) return;
      const liveSnapProm = refreshLiveTelemetrySnapshot(force);
      const h = ensureHooks();
      if (!h) { if (!usageHasData) { usageHasData = true; renderHomePanel(); } return; }
      const now = Date.now();
      const st = h.store?.getState?.() || {};
      const reduxSums = st.trajectorySummaries?.summaries || {};
      const preScope = detectScope(Object.entries(reduxSums), st, '');
      if (preScope !== curScope) switchScope(preScope);
      if (!force && usageHasData && now - lastUsageFetchAt < 60000) return;

      const win = getWin();
      const usageBridge = win?.__agPrismUsageBridge || null;
      if (!usageHasData && canMountRealCanvas(getDoc()?.body) && usageBridge && !usageBridge.isOnline?.() && !inCooldown(lastOfflineWaitAt, 15000, now)) {
        const wTick = Math.max(5, toNum(waitTickMs) || 120);
        usageLoading = true; renderHomePanel();
        for (let w = 0; w < 10 && !isDestroyed() && !usageBridge.isOnline?.(); w++) await sleep(wTick);
        usageLoading = false;
        if (isDestroyed()) return;
        if (usageBridge.isOnline?.()) { if (!hasUsableQuotas(liveQuotaSnap)) void refreshLiveTelemetrySnapshot(true, { ignoreFailCooldown: true }); }
        else lastOfflineWaitAt = Date.now();
      }

      const sumsMap = new Map();
      for (const [id, s] of Object.entries(reduxSums)) if (s) sumsMap.set(id, s);
      let seededCache = false;
      let bridgeScopeKey = '';
      let bridgeRecs = null;
      const bridgeOnline = !!usageBridge?.isOnline?.();
      if (bridgeOnline && isFn(usageBridge.listSummaries)) {
        try {
          const sumRes = await usageBridge.listSummaries(8000);
          if (typeof sumRes?.scopeKey === 'string' && sumRes.scopeKey) bridgeScopeKey = normalizeScopeKey(sumRes.scopeKey);
          bridgeRecs = Array.isArray(sumRes?.records) ? sumRes.records : null;
          const bs = sumRes?.summaries;
          const bList = Array.isArray(bs) ? bs : bs && typeof bs === 'object' ? Object.entries(bs).map(([k, v]) => ({ id: k, ...v })) : [];
          for (const item of bList) {
            const sid = String(item?.id || item?.cascadeId || '').trim();
            if (!sid) continue;
            if (!sumsMap.has(sid)) sumsMap.set(sid, item);
            else {
              const cur = { ...sumsMap.get(sid) }, im = extractMeta(item, sid), cm = extractMeta(cur, sid);
              if (item.workspace && !cur.workspace && !cur.workspaces) cur.workspace = item.workspace;
              if (im.u.length && !cur.workspaces) cur.workspaces = im.u;
              if (im.parentId && !cm.parentId) cur.parentId = im.parentId;
              if (item.dbMtimeSec > 0) cur.dbMtimeSec ||= item.dbMtimeSec;
              if (item.dbSize > 0) cur.dbSize ||= item.dbSize;
              if (item.diskUnchanged) cur.diskUnchanged = true;
              if (!cm.stepCount && im.stepCount > 0) cur.stepCount = im.stepCount;
              sumsMap.set(sid, cur);
            }
          }
        } catch {}
      } else if (!liveQuotaSnap) { try { await liveSnapProm; } catch {} }

      const resolvedScope = detectScope([...sumsMap], st, bridgeScopeKey);
      if (resolvedScope !== curScope) switchScope(resolvedScope);
      for (const hit of Array.isArray(bridgeRecs) ? bridgeRecs : []) {
        if (!hit?.id || !hit.record?.days) continue;
        const cur = usageRecords.get(hit.id);
        let cr = fixRec(hit.id, hit.record);
        if (!!hit.archived !== !!cr.archived) cr = setArch(cr, !!hit.archived);
        if (!cur || fixRec(hit.id, cur) !== cur || !!cur.archived !== !!cr.archived || ((cur._do || !hasRealUsage(cur)) && hasRealUsage(cr))) { usageRecords.set(hit.id, cr); seededCache = true; }
      }

      if (curScope === 'local' && Array.isArray(liveQuotaSnap?.conversations)) {
        for (const c of liveQuotaSnap.conversations) if (c?.id && !sumsMap.has(c.id)) sumsMap.set(c.id, { stepCount: toNum(c.steps), subagent: !!c.subagent, parentId: c.parentConversationId || '', rootId: c.rootConversationId || '', workspace: c.workspace || '', modifiedAt: c.modifiedAt || '' });
      }
      const entries = [...sumsMap];
      const canPrune = bridgeOnline;
      const rawTitle = String((getDoc() || win?.document)?.title || '').trim();
      localSaveBlocked = curScope === 'local' && !!(usageBridge && !bridgeOnline) && (!rawTitle || /^antigravity$/i.test(rawTitle)) && !normalizeScopeKey(scOpt) && !normalizeScopeKey(win?.__agPrismScopeKey) && !bridgeScopeKey && !entries.some(([, s]) => wsUrisOf(s).some((u) => /^(?:file:\/\/|[a-z]:[\\/])/i.test(u)));
      detectedCurrentWorkspace = detectCurrentWorkspaceName(entries) || detectedCurrentWorkspace;
      if (entries.length === 0) { usageHasData = true; if (seededCache || cacheHealed) { cacheHealed = false; usageDataEpoch += 1; saveUsageCache(); } if (canPrune) lastUsageFetchAt = now; renderHomePanel(); return; }

      const staleIds = [];
      const presentIds = new Set();
      let patchedMeta = seededCache || cacheHealed;
      cacheHealed = false;
      for (const [id, sum] of entries) {
        presentIds.add(id);
        if (sum?.dormant) continue;
        const m = extractMeta(sum, id);
        const cached = usageRecords.get(id);
        const dS = toNum(sum?.dbSize), dM = toNum(sum?.dbMtimeSec);
        const sameDb = dM > 0 && toNum(cached?.dbMtimeSec || cached?.lastModifiedSec) === dM && (!dS || !toNum(cached?.dbSize) || toNum(cached.dbSize) === dS);
        const sameRpc0 = !dM && m.stepCount === 0 && m.lastModifiedSec > 0 && toNum(cached?.lastModifiedSec) === m.lastModifiedSec && (hasRealUsage(cached) || toNum(cached?.stepCount) > 0);
        const diskMatch = !!(cached && !cached._do && (sum?.diskUnchanged ? (sameDb || !dM) : (sameDb && (m.stepCount === 0 || hasRealUsage(cached))) || sameRpc0));
        if (!diskMatch && (!cached || (bridgeOnline && cached._do) || toNum(cached.stepCount) !== m.stepCount || toNum(cached.lastModifiedSec) !== m.lastModifiedSec)) staleIds.push([id, sum]);
        else if (cached) {
          const nc = fixRec(id, cached);
          if (nc !== cached || nc.archived || (m.workspace && !nc.workspace) || (m.parentId && !nc.parentId)) {
            usageRecords.set(id, setArch({ ...nc, workspace: nc.workspace || m.workspace || '', parentId: nc.parentId || m.parentId || '' }, false));
            patchedMeta = true;
          }
        }
      }
      if (patchedMeta) usageDataEpoch += 1;
      staleIds.sort((a, b) => extractMeta(b[1], b[0]).lastModifiedSec - extractMeta(a[1], a[0]).lastModifiedSec);

      let deletedAny = false;
      if (canPrune) {
        for (const oldId of [...usageRecords.keys()]) {
          if (!presentIds.has(oldId)) {
            const oldRec = usageRecords.get(oldId);
            if (oldRec?.subagent && oldRec?.parentId && presentIds.has(oldRec.parentId)) {
              if (oldRec.archived) { usageRecords.set(oldId, setArch(oldRec, false)); patchedMeta = true; }
              continue;
            }
            if (hasPersistedTokens(oldRec)) {
              if (!oldRec.archived) { usageRecords.set(oldId, setArch(oldRec, true)); patchedMeta = true; }
              continue;
            }
            usageRecords.delete(oldId); deletedAny = true;
          }
        }
      }
      if (deletedAny || patchedMeta) usageDataEpoch += 1;
      if (staleIds.length === 0) { usageHasData = true; if (canPrune) lastUsageFetchAt = now; if (patchedMeta || deletedAny) saveUsageCache(); renderHomePanel(); return; }

      usageLoading = true;
      if (seededCache) saveUsageCache();
      if (!usageHasData || seededCache) renderHomePanel();
      const dbMeta = (a, b) => {
        const m = toNum(a?.dbMtimeSec || b?.dbMtimeSec), s = toNum(a?.dbSize || b?.dbSize);
        return { ...(m > 0 ? { dbMtimeSec: m } : {}), ...(s > 0 ? { dbSize: s } : {}) };
      };
      const deferRec = (id, prev, sum) => usageRecords.set(id, advanceCachedCursor(prev, id, sum, true));
      const applyRecord = (id, sum, prev, rec, m) => {
        if (hasRealUsage(prev) && !hasRealUsage(rec)) deferRec(id, prev, sum);
        else {
          const cr = fixRec(id, rec);
          const n = setArch({ ...cr, ...dbMeta(sum, cr), subagent: !!(cr.subagent || m.subagent), workspace: cr.workspace || m.workspace || '', parentId: cr.parentId || m.parentId || '' }, false);
          delete n._do; usageRecords.set(id, n);
        }
      };
      try {
        if (usageBridge && isFn(usageBridge.fetchBatch) && bridgeOnline) {
          for (let i = 0; i < staleIds.length && !isDestroyed(); i += 6) {
            const slice = staleIds.slice(i, i + 6);
            const reqItems = slice.map(([id, sum]) => {
              const c = usageRecords.get(id), { u, ...mr } = extractMeta(sum, id), gm = toNum(c?.gmCount);
              return { id, ...mr, ...dbMeta(sum), ...(u.length ? { workspaces: u } : {}), gmOffset: c && !c._do && Number.isInteger(gm) && gm > 0 ? gm : 0 };
            });
            const res = await usageBridge.fetchBatch(reqItems, 18000);
            const byId = res?.ok && Array.isArray(res.records) ? new Map(res.records.map((r) => [r.id, r])) : null;
            for (const [id, sum] of slice) {
              const prev = usageRecords.get(id), hit = byId?.get(id), m = extractMeta(sum, id);
              if (hit?.mode === 'full' && hit.record) applyRecord(id, sum, prev, hit.record, m);
              else if (hit?.mode === 'delta' && hit.delta && usageCore.mergeUsageRecordDelta) {
                const nr = usageCore.mergeUsageRecordDelta(fixRec(id, prev), hit.delta, { cascadeId: id, ...m, gmCount: toNum(hit.gmCount) });
                if (nr && typeof nr === 'object') { delete nr._do; delete nr.archived; }
                usageRecords.set(id, fixRec(id, nr));
              } else deferRec(id, prev, sum);
            }
            if (i + 6 < staleIds.length && !isDestroyed()) await sleep(40);
          }
        } else {
          const CONC = usageHasData ? 1 : 2;
          const canDirect = isFn(h.svc?.getCascadeTrajectory);
          for (let i = 0; i < staleIds.length && !isDestroyed(); i += CONC) {
            await Promise.all(staleIds.slice(i, i + CONC).map(async ([id, sum]) => {
              const prev = usageRecords.get(id), m = extractMeta(sum, id);
              if (!canDirect || m.stepCount > 240) { deferRec(id, prev, sum); return; }
              try {
                let tId = null;
                const toP = new Promise((_, rej) => { tId = setTimeout(() => rej(new Error('timeout')), 2800); });
                const res = await Promise.race([h.svc.getCascadeTrajectory({ cascadeId: id }), toP]).finally(() => { if (tId !== null) clearTimeout(tId); });
                applyRecord(id, sum, prev, usageCore.analyzeTrajectoryForUsage(res, sum, id), m);
              } catch { deferRec(id, prev, sum); }
            }));
            if (i + CONC < staleIds.length && !isDestroyed()) await sleep(usageHasData ? 120 : 24);
          }
        }
        if (!isDestroyed()) { usageHasData = true; usageDataEpoch += 1; if (canPrune) lastUsageFetchAt = Date.now(); saveUsageCache(); }
      } catch {
        if (!isDestroyed()) usageHasData = true;
      } finally {
        usageLoading = false;
        if (!isDestroyed()) renderHomePanel();
      }
    };

    const syncGreeting = (inHero) => {
      if (inHero && !wasHero) {
        if (!usageHasData) bookPick = Math.random();
        if (getHomeLayout() === 'studio') scheduleUsageRollupRefresh(1800);
      } else if (!inHero && deferredUsageTimer) { clearTimeout(deferredUsageTimer); deferredUsageTimer = 0; }
      wasHero = !!inHero;

      const h1 = getDoc()?.querySelector('[data-testid="home-greeting"] h1');
      if (!h1) return;
      if (getHomeLayout() !== 'studio') {
        h1.removeAttribute('data-ag-no-i18n');
        const orig = replacedGreetings.get(h1);
        if (orig !== undefined) { if (h1.textContent !== orig.host) h1.textContent = orig.host; replacedGreetings.delete(h1); }
        return;
      }
      const lang = normStudioLang(getLang());
      const name = getDisplayName();
      const fb = studioFb(lang);
      const target = fb[8] + (name ? fb[9] + name : '') + fb[10];
      setAttrIfChanged(h1, 'data-ag-no-i18n', '');
      if (h1.textContent !== target) {
        const prev = replacedGreetings.get(h1);
        const hostText = prev && h1.textContent === prev.written ? prev.host : h1.textContent || '';
        h1.textContent = target;
        replacedGreetings.set(h1, { host: hostText, written: target });
      }
    };

    const restoreGreetings = () => {
      for (const [el, rec] of replacedGreetings) {
        el.removeAttribute('data-ag-no-i18n');
        if (el.isConnected && el.textContent === rec.written) el.textContent = rec.host;
      }
      replacedGreetings.clear();
    };

    const hideHeatTip = () => {
      shownHeatCell = pendingHeatCell = null;
      if (heatTipRaf && isFn(G.cancelAnimationFrame)) { G.cancelAnimationFrame(heatTipRaf); heatTipRaf = 0; }
      if (heatTipEl) heatTipEl.removeAttribute('data-shown');
    };

    const flushHeatTip = () => {
      heatTipRaf = 0;
      const cell = pendingHeatCell;
      const grid = pendingHeatGrid;
      if (!cell || !grid || !heatTipEl || cell.isConnected === false) return;
      const tipText = cell.getAttribute('data-tip');
      if (!tipText) return;
      shownHeatCell = cell;
      const gW = grid.clientWidth || 480, gH = grid.clientHeight || 96;
      const cL = cell.offsetLeft || 0, cT = cell.offsetTop || 0, cW = cell.offsetWidth || 10, cH = cell.offsetHeight || 10;
      const estW = Math.max(88, Math.min(240, tipText.length * 6.8 + 18));
      const left = Math.min(Math.max(cL + (cW - estW) * 0.5, 0), Math.max(0, gW - estW));
      const bH = gH - cT - cH;
      const top = bH > cT && bH >= 30 ? cT + cH + 6 : cT - 30;
      runGuardedMut(() => {
        if (heatTipEl.textContent !== tipText) heatTipEl.textContent = tipText;
        heatTipEl.style.transform = `translate3d(${Math.round(left)}px,${Math.round(top)}px,0)`;
        setAttrIfChanged(heatTipEl, 'data-shown', 'true');
      });
    };

    const showHeatTip = (cell, grid) => {
      if (!cell || !heatTipEl || cell === shownHeatCell) return;
      pendingHeatCell = cell; pendingHeatGrid = grid;
      if (isFn(G.requestAnimationFrame)) { if (!heatTipRaf) heatTipRaf = G.requestAnimationFrame(flushHeatTip); }
      else flushHeatTip();
    };

    const parkPanelSeat = () => {
      hideHeatTip();
      if (panelSeat?.parentElement) panelSeat.parentElement.removeChild(panelSeat);
    };

    const unmountPanelSeat = () => {
      if (deferredUsageTimer) { clearTimeout(deferredUsageTimer); deferredUsageTimer = 0; }
      parkPanelSeat();
      panelSeat = panelEl = heatTipEl = null;
      lastPanelRenderKey = '';
    };

    const ensurePanelSeat = () => {
      if (getHomeLayout() !== 'studio') { unmountPanelSeat(); return null; }
      const d = getDoc();
      const st = d?.head && d.getElementById(STUDIO_STYLE_ID);
      if (d?.head && (!st || st.textContent !== STUDIO_EXTRA_CSS)) {
        runGuardedMut(() => {
          if (st) st.textContent = STUDIO_EXTRA_CSS;
          else { const s = mk('style', '', STUDIO_EXTRA_CSS, { 'data-ag-owned': '1' }); s.id = STUDIO_STYLE_ID; ap(d.head, s); }
        });
      }
      const home = d?.querySelector('.agy-home');
      if (!home) { parkPanelSeat(); return null; }
      const greeting = home.querySelector('[data-testid="home-greeting"]');
      if (!greeting?.parentElement) return null;
      if (!panelSeat || !panelEl) {
        panelSeat = markNoTr(dv(HC + 'panel-seat', { 'data-ag-no-i18n': '', 'data-ag-owned': '1' }));
        panelEl = mk('section', HC + 'panel');
        ap(panelSeat, panelEl);
      }
      if (!panelSeat.isConnected || panelSeat.parentElement !== greeting.parentElement || panelSeat.previousSibling !== greeting) {
        greeting.parentElement.insertBefore(panelSeat, greeting.nextSibling);
      }
      return panelEl;
    };

    const dAct = (k, v, on) => (on ? { [k]: v, 'data-active': '' } : { [k]: v });

    const renderQuotasView = (panel, lang, ui) => {
      const fmtTok = usageCore.formatCompactTokens, qWin = usageCore.quotaWindows, wrap = dv(QC + 'wrap');
      const refreshBtn = bt(QC + 'refresh', quotaLoading ? ui.thinkingEllipsis || 'Loading…' : ui.refreshBtnTitle || 'Refresh', () => {
        const now = Date.now();
        if (quotaLoading || inCooldown(lastManualRefreshAt, 5000, now)) return;
        lastManualRefreshAt = lastQuotaTabTriggerAt = now;
        void refreshLiveTelemetrySnapshot(true);
      });
      refreshBtn.disabled = quotaLoading;
      ap(wrap, ap(dv(QC + 'toolbar'), sp('', ui.quotaPoolsTitle || 'Model Quota Pools Remaining'), refreshBtn));

      const groups = Array.isArray(liveQuotaSnap?.groups) ? liveQuotaSnap.groups.filter((g) => g && (!qWin || qWin(g).length > 0)) : [];
      if (!groups.length) { ap(panel, ap(wrap, dv(HC + 'models-empty', quotaLoading ? ui.quotaLoading || 'Loading…' : ui.quotaEmptyHint || 'Waiting for live quota snapshot…'))); return; }

      const grid = dv(QC + 'grid'), qUsage = liveQuotaSnap?.usage?.quotaWindows, qFb = studioFb(lang);
      const badge = (r) => (!(r >= 0 && r <= 1) ? ['idle', '—'] : r <= 0.15 ? ['low', ui.quotaLow || qFb[5]] : r <= 0.35 ? ['tight', ui.quotaTight || qFb[6]] : ['ok', ui.quotaHealthy || qFb[7]]);
      for (const grp of groups) {
        const card = dv(QC + 'card', { 'data-quota-kind': usageCore.quotaGroupKind?.(grp) || 'other' }), wins = [];
        let minRem = 2;
        for (const [wk, bucket] of qWin ? qWin(grp) : []) {
          const fc = usageCore.quotaForecast?.(bucket, wk);
          if (!fc) continue;
          const rem = isFin(fc.remaining) ? Math.max(0, Math.min(1, fc.remaining)) : 0;
          if (rem < minRem) minRem = rem;
          wins.push([wk, fc, rem]);
        }
        const [bs, bl] = badge(minRem <= 1 ? minRem : -1);
        ap(card, ap(dv(QC + 'card-head'), sp(QC + 'name', usageCore.quotaGroupLabel?.(grp, lang) || grp.name || grp.id), sp(QC + 'pace', bl, { 'data-pace': bs })));
        for (const [wk, fc, rem] of wins) {
          const eta = fc.resetInMs > 0 && usageCore.shortEta ? ` · ${usageCore.shortEta(fc.resetInMs, lang)}` : '';
          const solid = mk('i', 'ag-cs-qbar-solid');
          solid.style.width = `${(rem * 100).toFixed(1)}%`;
          ap(card, ap(dv(QC + 'win', rem <= 0.15 ? { 'data-warn': '2' } : rem <= 0.35 ? { 'data-warn': '1' } : null), ap(dv(QC + 'win-row'), sp(QC + 'win-lbl', wk === 'weekly' ? ui.weeklyLabel || 'Weekly' : ui.fiveHourLabel || '5h'), sp(QC + 'win-val', `${Math.round(rem * 100)}%${eta}`)), ap(dv(QC + 'bar'), solid)));
        }
        const tok = qUsage?.[grp.id]?.totalTokens;
        if (tok > 0) ap(card, dv(QC + 'foot', `${fmtTok(tok)} tok`));
        ap(grid, card);
      }
      ap(panel, ap(wrap, grid));
    };

    const renderHomePanel = (force = false) => {
      if (isDestroyed() || !usageCore) return;
      const panel = ensurePanelSeat();
      if (!panel) return;
      const fmtTok = usageCore.formatCompactTokens;
      const fmtCnt = usageCore.formatHomeCount;
      const lang = normStudioLang(getLang());
      const ui = uiText(lang);
      const fb = studioFb(lang);
      const skeleton = !usageHasData;
      const aggKey = `${usageDataEpoch}|${usageRecords.size}|${activeRange}|${activeWorkspace}|${+includeArchived}|${lang}|${bookPick}`;
      let data = cachedAggData;
      if (!data || cachedAggKey !== aggKey) {
        data = usageCore.aggregateUsageRollup([...usageRecords.values()], activeRange, bookPick, lang, undefined, { workspace: activeWorkspace, includeArchived });
        cachedAggKey = aggKey; cachedAggData = data;
      }
      const wsList = Array.isArray(data.workspaces) ? data.workspaces : [];
      if (activeWorkspace !== 'all' && wsList.length > 0 && !wsList.some((w) => w.id === activeWorkspace)) {
        activeWorkspace = 'all';
        return renderHomePanel(true);
      }
      const isQuotasTab = activeTab === 'quotas';
      const arch = toNum(data.archivedSessions);
      const hasArch = !!(data.hasArchived || arch > 0);
      const renderKey = [curScope, lang, activeTab, activeRange, activeWorkspace, +includeArchived, +hasArch, +modelsExpanded, +skeleton, isQuotasTab ? +quotaLoading : 0, isQuotasTab ? quotaEpoch : 0, usageRecords.size, data.sessions, arch, data.calls, data.tokens, data.subagentTokens || 0, data.cacheHitRate != null ? data.cacheHitRate.toFixed(3) : '-', data.activeDays, data.model || ''].join('|');
      if (!force && renderKey === lastPanelRenderKey && panel.childElementCount > 0) return;
      lastPanelRenderKey = renderKey;

      const d = getDoc();
      const ae = d?.activeElement;
      let focusSel = '';
      if (ae && panel.contains?.(ae)) {
        for (const a of ['data-ag-scope-toggle', 'data-tab', 'data-range', 'data-ag-cs-ws-filter']) {
          const v = ae.getAttribute?.(a);
          if (v != null) { focusSel = a === 'data-ag-scope-toggle' ? `[${a}]` : `[${a}="${v}"]`; break; }
        }
      }

      runGuardedMut(() => {
        panel.innerHTML = '';

        const headLeft = dv(HC + 'head-left');
        const tabs = dv(HC + 'tabs');
        for (const [id, label] of [['overview', ui.tabOverview || 'Overview'], ['models', ui.tabModels || 'Models'], ['quotas', ui.tabQuotas || 'Quotas']]) {
          ap(tabs, bt(HC + 'tab', label, () => {
            activeTab = id;
            if (id === 'quotas' && !hasUsableQuotas(liveQuotaSnap)) {
              const now = Date.now();
              if (!inCooldown(lastQuotaTabTriggerAt, 20000, now)) { lastQuotaTabTriggerAt = now; void refreshLiveTelemetrySnapshot(false, { quotaRefresh: true, ignoreFailCooldown: true }); }
            }
            renderHomePanel();
          }, dAct('data-tab', id, activeTab === id)));
        }
        ap(headLeft, tabs);
        const scopeLabel = formatScopeBadge(curScope);
        if (scopeLabel) {
          const badge = markNoTr(sp('ag-cs-home-scope-badge', scopeLabel, { 'data-ag-no-i18n': '', 'data-scope': curScope, 'data-scope-kind': curScope.startsWith('ssh:') ? 'ssh' : 'remote' }));
          badge.title = scopeLabel;
          ap(headLeft, badge);
        }

        const [allLbl, actLbl, kA, kH, localTag, localNote] = 'homeScopeAll,homeScopeActive,homeScopeActiveCount,homeScopeArchivedCount,homeLocalOnlyTag,homeLocalScopeNote'.split(',').map((k, i) => ui[k] || fb[11 + i]);
        const headRight = dv(HC + 'head-right');
        if (!isQuotasTab) {
          if (wsList.length > 0) {
            const sel = mk('select', HC + 'ws-select', { 'data-ag-cs-ws-filter': '1', 'aria-label': ui.workspaceFilterAria || 'Workspace filter' });
            const addOpt = (v, t) => { const o = mk('option', '', t); o.value = v; ap(sel, o); };
            addOpt('all', ui.workspaceAll || 'All Projects');
            for (const ws of wsList) addOpt(ws.id, `${detectedCurrentWorkspace && ws.id === detectedCurrentWorkspace ? '● ' : ''}${ws.id} (${fmtTok(ws.tokens)})`);
            sel.value = activeWorkspace;
            sel.addEventListener('change', () => { activeWorkspace = sel.value || 'all'; renderHomePanel(); });
            ap(headRight, sel);
          }
          if (!skeleton && (hasArch || !includeArchived)) {
            const tTip = `${allLbl} / ${actLbl}`;
            const sv = isFn(d?.createElementNS) ? ap(mkSv(d, 'svg', ['viewBox', '0 0 24 24', 'aria-hidden', 'true', 'focusable', 'false']), mkSv(d, 'path', ['d', 'M7 10h14l-4-4m0 8H3l4 4'])) : null;
            const tg = ap(bt('ag-cs-hs-tg', '', () => { includeArchived = !includeArchived; try { getLs()?.setItem(scopePrefKey, includeArchived ? 'all' : 'active'); } catch {} cachedAggKey = ''; renderHomePanel(true); }, { 'data-ag-scope-toggle': includeArchived ? 'all' : 'active', 'aria-pressed': String(!includeArchived), 'aria-label': tTip }), sv, sp('', includeArchived ? allLbl : actLbl));
            tg.title = tTip;
            ap(headRight, tg);
          }
          const ranges = dv(HC + 'ranges');
          for (const r of usageCore.HOME_RANGES) {
            ap(ranges, bt(HC + 'range', usageCore.homeRangeLabel?.(r, lang) || r.labelEn, () => { activeRange = r.id; renderHomePanel(); }, dAct('data-range', r.id, activeRange === r.id)));
          }
          ap(headRight, ranges);
        }
        ap(panel, ap(dv(HC + 'panel-head'), headLeft, headRight));

        if (isQuotasTab) { renderQuotasView(panel, lang, ui); return; }

        const makeLocalNote = () => dv(HC + 'local-note', localNote, { 'data-local-scope-note': '1' });
        const ac = fmtCnt(toNum(data.activeSessions));
        const ar = fmtCnt(arch);
        const sS = arch > 0 ? `${kA} ${ac} · ${kH} ${ar}` : !includeArchived ? actLbl : '';

        const stC = HC + 'stat';
        if (activeTab === 'overview') {
          const stats = dv(stC + 's');
          const cacheVal = isFin(data.cacheHitRate) ? usageCore.fmtPct(data.cacheHitRate * 100, 1) : '—';
          const cacheTitle = typeof data.cacheHitRate === 'number' ? `${ui.cacheRead || 'Cache'}: ${fmtTok(data.cacheReadTokens || 0)} / ${fmtTok(data.totalInput || 0)}${data.peakHour ? ` · ${data.peakHour}` : ''}` : data.peakHour || '—';
          const subTok = toNum(data.subagentTokens), subSes = toNum(data.subagentSessions);
          const subPct = data.tokens > 0 && subTok > 0 ? Math.round((subTok / data.tokens) * 100) : 0;
          const [subUnit, tokUnit, swarmBadge] = ['subagentsUnit', 'tokenUnit', 'swarmBadge'].map((k, i) => ui[k] || fb[i]);
          const swarmSub = subTok > 0 ? (isFn(ui.swarmSplitSub) ? ui.swarmSplitSub(100 - subPct, subPct) : `Main ${100 - subPct}% · ${swarmBadge} ${subPct}%`) : '';
          const sT = `${data.sessions}${subSes > 0 ? ` + ${subSes} ${subUnit}` : ''}${arch > 0 ? ` (${kA} ${ac} · ${kH} ${ar})` : ''}`;

          for (const [k, lb, vt, tt, stx] of [
            ['sessions', ui.kpiSessions || 'Sessions', fmtCnt(data.sessions), sT, sS],
            ['calls', ui.kpiCalls || 'Messages', fmtCnt(data.calls), String(data.calls)],
            ['tokens', ui.kpiTokens || 'Total tokens', fmtTok(data.tokens), `${fmtCnt(data.tokens)} ${tokUnit}${swarmSub ? ` (${swarmSub})` : ''} · ${localNote}`, swarmSub || localTag],
            ['days', ui.kpiDays || 'Active days', fmtCnt(data.activeDays), String(data.activeDays)],
            ['cache', ui.kpiCacheHit || 'Cache Hit Rate', cacheVal, cacheTitle !== '—' ? `${cacheTitle} · ${localNote}` : localNote, localTag],
            ['model', ui.kpiFavModel || 'Favorite model', data.model || '—', data.model || '—'],
          ]) {
            const cell = dv(stC, skeleton ? { 'data-stat': k, 'data-skeleton': '' } : { 'data-stat': k });
            const val = sp(stC + '-value', skeleton ? '' : vt);
            if (!skeleton) val.title = tt;
            const sEl = !skeleton && stx ? sp(stC + '-sub', stx) : null;
            if (sEl) sEl.title = tt;
            ap(stats, ap(cell, sp(stC + '-label', lb), val, sEl));
          }
          ap(panel, stats);

          const heat = dv(HC + 'heat', { ...(skeleton ? { 'data-skeleton': '' } : {}), 'data-local-only': '1', 'aria-label': localNote });
          const fmt = usageCore.homeShortDateFormat(lang);
          const heatFrag = isFn(d?.createDocumentFragment) ? d.createDocumentFragment() : heat;
          for (const c of data.grid.cells) {
            const lv = String(c.level);
            const tip = skeleton ? '' : `${usageCore.homeShortDate(fmt, c.date)} — ${fmtTok(c.tokens)} ${tokUnit}`;
            ap(heatFrag, sp(HC + 'heat-cell', skeleton ? { 'data-level': lv } : { 'data-level': lv, 'data-tip': tip, 'aria-label': tip }));
          }
          if (heatFrag !== heat) ap(heat, heatFrag);
          heatTipEl = markNoTr(sp(HC + 'heat-hint', { 'aria-hidden': 'true' }));
          ap(heat, heatTipEl);
          heat.addEventListener('mouseover', (ev) => { const t = ev.target?.closest?.('.' + HC + 'heat-cell'); if (t) showHeatTip(t, heat); });
          heat.addEventListener('mouseleave', hideHeatTip);
          ap(panel, heat, data.funBook ? sp(HC + 'fun', data.funBook) : null, makeLocalNote());
        } else {
          const models = data.models || [];
          const emptyMsg = ui.noModelUsage || 'No model usage data yet';
          if (models.length === 0) { ap(panel, dv(HC + 'models-empty', !includeArchived && arch > 0 ? `${emptyMsg} (${kH} ${ar})` : emptyMsg), makeLocalNote()); return; }
          const ids = models.map((m) => m.id);
          const columns = data.modelDays || [];
          const fmt = usageCore.homeShortDateFormat(lang);
          for (const col of columns) for (const id of Object.keys(col.models || {})) ids.push(id);
          const baseColours = modelColours(ids);
          const colourSpecs = resolveHomeModelColours(ids, baseColours);
          const lightNow = isLightHomeTheme(d);

          if (columns.length > 0) {
            let peak = 0;
            let peakIdx = -1;
            const dayTotals = [];
            for (let ci = 0; ci < columns.length; ci++) {
              let sum = 0;
              for (const t of Object.values(columns[ci].models)) sum += t;
              dayTotals.push(sum);
              if (sum > peak) { peak = sum; peakIdx = ci; }
            }
            const top = usageCore.axisMax(peak);
            const cC = HC + 'chart-';
            const plot = dv(cC + 'plot');
            const bars = dv(cC + 'bars');
            for (const at of [1, 0.75, 0.5, 0.25, 0]) {
              const tick = sp(cC + 'tick', top > 0 ? fmtTok(top * at) : '');
              tick.style.bottom = `${at * 100}%`;
              ap(plot, tick);
            }
            for (let ci = 0; ci < columns.length; ci++) {
              const col = columns[ci], dayTotal = dayTotals[ci];
              const colEl = sp(cC + 'col');
              colEl.title = `${usageCore.homeShortDate(fmt, col.date)} · ${fmtTok(dayTotal)}`;
              colEl.style.height = `${top > 0 ? (dayTotal / top) * 100 : 0}%`;
              for (const [mId, tok] of Object.entries(col.models).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
                const seg = applyModelSwatchColor(sp(cC + 'seg'), colourSpecs[mId] || { idx: baseColours[mId] ?? 0, dark: '#4F8BFF', light: '#2563EB' }, lightNow);
                seg.style.height = `${dayTotal > 0 ? (tok / dayTotal) * 100 : 0}%`;
                ap(colEl, seg);
              }
              ap(bars, colEl);
            }
            ap(plot, bars);
            if (top > 0 && isFn(d?.createElementNS)) {
              const sv = (t, a) => mkSv(d, t, a);
              const nP = dayTotals.length, f = (v) => v.toFixed(1), cl = (v, a, b) => Math.max(a, Math.min(b, v)), vE = 'vector-effect', nS = 'non-scaling-stroke';
              const svg = sv('svg', ['class', cC + 'svg', 'viewBox', '0 0 1000 160', 'preserveAspectRatio', 'none', 'aria-hidden', 'true']);
              const lg = sv('linearGradient', ['id', 'ag-cs-ag', 'x1', 0, 'y1', 0, 'x2', 0, 'y2', 1]);
              for (const s of ['0,.22', '62,.05', '100,0']) { const [o, p] = s.split(','); ap(lg, sv('stop', ['offset', o + '%', 'stop-color', 'currentColor', 'stop-opacity', p])); }
              ap(svg, ap(sv('defs', []), lg));
              for (const y of [0, 40, 80, 120]) ap(svg, sv('line', ['class', cC + 'grid', 'x1', 0, 'y1', y, 'x2', 1000, 'y2', y, vE, nS]));
              const pts = dayTotals.map((v, i) => [nP < 2 ? 500 : ((i + 0.5) / nP) * 1000, Math.max(2, 160 - (v / top) * 160)]);
              let dl = nP < 2 ? `M0 ${f(pts[0][1])} L1000 ${f(pts[0][1])}` : `M${f(pts[0][0])} ${f(pts[0][1])}`;
              for (let i = 0; i < nP - 1; i++) {
                const a = pts[i ? i - 1 : 0], b = pts[i], c = pts[i + 1], e = pts[i + 2 < nP ? i + 2 : nP - 1], lo = Math.min(b[1], c[1]), hi = Math.max(b[1], c[1]);
                dl += ` C${f(b[0] + (c[0] - a[0]) / 6)} ${f(cl(b[1] + (c[1] - a[1]) / 6, lo, hi))} ${f(c[0] - (e[0] - b[0]) / 6)} ${f(cl(c[1] - (e[1] - b[1]) / 6, lo, hi))} ${f(c[0])} ${f(c[1])}`;
              }
              ap(svg, sv('path', ['class', cC + 'area', 'd', `${dl} L${nP < 2 ? 1000 : f(pts[nP - 1][0])} 160 L${nP < 2 ? 0 : f(pts[0][0])} 160 Z`, 'fill', 'url(#ag-cs-ag)']), sv('path', ['class', cC + 'line', 'd', dl, 'fill', 'none', vE, nS]));
              ap(plot, svg);
              if (peak > 0 && peakIdx >= 0) {
                const dot = sp(cC + 'peak', { 'aria-hidden': 'true' });
                dot.style.left = `${nP < 2 ? 50 : ((peakIdx + 0.5) / nP) * 100}%`;
                dot.style.bottom = `${Math.min(99, (peak / top) * 100).toFixed(2)}%`;
                ap(plot, dot);
              }
            }
            const axis = dv(cC + 'axis');
            ap(panel, ap(dv(HC + 'chart'), plot, axis));
            G.requestAnimationFrame?.(() => {
              if (isDestroyed() || !axis.isConnected) return;
              const labels = columns.map((c) => usageCore.homeShortDate(fmt, c.date));
              const ticks = usageCore.homeChartTicks(labels.map((l) => Math.max(32, l.length * 6.5)), plot.clientWidth || 420);
              runGuardedMut(() => {
                axis.innerHTML = '';
                for (const tk of ticks) { const lb = sp(cC + 'label', labels[tk.index]); lb.style.left = `${tk.left}px`; ap(axis, lb); }
              });
            });
          }

          const totalAll = models.reduce((s, m) => s + m.tokens, 0);
          const rowCap = usageCore.HOME_MODEL_ROWS;
          const shown = modelsExpanded ? models : models.slice(0, rowCap);
          const mC = HC + 'model';
          const listEl = dv(mC + 's');
          const swarmBadge = ui.swarmBadge || fb[2];
          const inUnit = ui.tokensInShort || fb[3];
          const outUnit = ui.tokensOutShort || fb[4];
          for (const m of shown) {
            const row = dv(mC);
            const subShare = m.tokens > 0 && m.subagentTokens > 0 ? ` · ${swarmBadge} ${Math.round((m.subagentTokens / m.tokens) * 100)}%` : '';
            row.title = `${m.id} · ${m.sessions} ${ui.sessionsUnit || 'sessions'}${subShare}`;
            const inp = (m.input || 0) + (m.cacheRead || 0) + (m.cacheWrite || 0);
            const cacheTag = isFin(m.cacheHitRate) ? ` · ${Math.round(m.cacheHitRate * 100)}% ${ui.cacheShort || 'Cache'}` : '';
            ap(listEl, ap(row, applyModelSwatchColor(sp(mC + '-swatch'), colourSpecs[m.id] || { idx: baseColours[m.id] ?? 0, dark: '#4F8BFF', light: '#2563EB' }, lightNow), sp(mC + '-name', m.id), sp(mC + '-split', `${fmtTok(inp)} ${inUnit} · ${fmtTok(m.output || 0)} ${outUnit}${cacheTag}`), sp(mC + '-share', totalAll > 0 ? (Math.round((m.tokens / totalAll) * 1000) / 10).toFixed(1) + '%' : '—')));
          }
          if (models.length > rowCap) {
            const hc = models.length - shown.length;
            ap(listEl, bt(mC + 's-more', modelsExpanded ? ui.showLess || 'Show less' : isFn(ui.showMoreN) ? ui.showMoreN(hc) : `Show ${hc} more`, () => { modelsExpanded = !modelsExpanded; renderHomePanel(); }));
          }
          ap(panel, listEl, makeLocalNote());
        }
      });
      if (focusSel) try { panel.querySelector?.(focusSel)?.focus?.(); } catch {}
    };

    const dispose = () => {
      if (disposed) return;
      flushUsageCacheNow();
      disposed = true;
      unmountPanelSeat();
      restoreGreetings();
      usageRecords.clear();
      cachedAggData = null;
      liveQuotaSnap = null;
      quotaPending = null;
    };

    return {
      scheduleUsageRollupRefresh,
      refreshUsageRollup,
      refreshLiveTelemetrySnapshot,
      syncGreeting,
      restoreGreetings,
      parkPanelSeat,
      unmountPanelSeat,
      renderHomePanel,
      flushUsageCacheNow,
      dispose,
      wasHero: () => wasHero,
      getScopeKey: () => curScope,
      getUsageRecordsCount: () => usageRecords.size,
      hasConnectedPanel: () => Boolean(panelEl && panelEl.isConnected),
    };
  }

  const api = { createHomeStudioPanelController, hasPersistedTokens, resolveHomeModelColours };
  if (typeof module === 'object' && module.exports) module.exports = api;
  G.__agPrismHomeStudioPanel = api;
  G.__agHomeStudioPanel = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);

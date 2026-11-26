// Obsidian Prism — Host Workbench Deep-Surface Enhancer (host-workbench-enhancer.js)
// 1. Cross-origin zero-intrusion Sidecar UI (`plugin://*` Swarm / Pulse) 4-theme postMessage bridge (0fps idle).
// 2. Code block glass sticky header companion + manual [Fold (N lines)] / [Expand] toggle (>= 48 lines, scrollTop anchored, zero auto-fold).
// 3. Long-conversation rail (`[data-testid="conversation-navigator"]`) hover outline popover + Alt+Up/Down instant turn jump.
// 4. Native Antigravity chrome polish (Settings dialog rail, Subagent ambient, Sidebar overflow fold, Fast scroll-to-bottom,
//    Permissions menu state, Queued row feedback, OverviewSection GPU fold) + Channel 6 Inline Diff light delegation.

(function (root) {
  'use strict';
  const G = root || (typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : null);
  if (!G) return;

  const MIN_CODE_FOLD_LINES = 48;
  const SONAR_DURATION_MS = 720;
  const OUTLINE_HIDE_DELAY_MS = 220;

  function markNoTr(e) {
    if (e && e.setAttribute) {
      for (const s of 'translate=no,data-no-translate=true,data-ag-localization-skip=true,data-agy-no-translate=true,data-antigravity-zh-skip=1'.split(',')) {
        const p = s.split('=');
        e.setAttribute(p[0], p[1]);
      }
    }
    return e;
  }

  const SIDECAR_THEME_VARS =
    '--background,--content,--shell,--body-background,--sidebar,--sidebar-muted,--sidebar-secondary,--card,--card-border,--border,--secondary,--secondary-foreground,--muted,--muted-foreground,--foreground,--placeholder,--primary,--primary-foreground,--accent,--link,--error,--warning,--success,--scrim,--ag-cs-tonal-0,--ag-cs-tonal-1,--ag-cs-tonal-2,--ag-cs-tonal-3,--ag-cs-tonal-4,--font-sans'.split(',');
  const S_VP = '[data-testid="autoscroll-viewport"]';
  const S_CV = '[data-testid="conversation-view"]';
  const S_SUB = '[data-testid="subagent-tab-conversation"]';
  const S_NT = '[data-testid="conversation-navigator-turn"]';
  const S_NG = '[data-testid="conversation-navigator-group"]';
  const S_TRIG = '.ag-cs-nav-outline-trigger';
  const A_OVC = 'data-ag-ov-sec-closing';

  const UI_RAW = {
    'zh-CN': '折叠|展开|行|提问导航| 轮|收起步骤|已收起 | 项|已是最简|过滤本会话提问...|无匹配提问|章节|',
    'zh-TW': '摺疊|展開|行|提問導覽| 輪|收起步驟|已收起 | 項|已是最簡|過濾本會話提問...|無匹配提問|章節|',
    en: 'Fold|Expand|L|Outline| turns|Fold Steps|Folded ||All clean|Filter prompts...|No matching prompts|Chapter|Prompts',
    ja: '折りたたむ|展開|行|プロンプト目次||手順を畳む||件畳みました|完了|質問を絞り込む...|一致なし|章|',
    ko: '접기|펼치기|줄|질문 목차| 턴|단계 접기||개 접힘|완료|질문 검색...|일치 항목 없음|챕터|',
    es: 'Contraer|Expandir|L|Esquema| turnos|Contraer pasos|Contraído ||Todo limpio|Filtrar preguntas...|Sin coincidencias|Capítulo|Preguntas',
    fr: 'Replier|Déplier|L|Plan| tours|Replier étapes|Replié ||Tout est clair|Filtrer les requêtes...|Aucun résultat|Chapitre|Requêtes',
    de: 'Einklappen|Ausklappen|Z|Gliederung| Runden|Schritte einklappen|Eingeklappt ||Bereinigt|Prompts filtern...|Keine Treffer|Kapitel|Prompts',
  };
  const UI_STRINGS = {};
  for (const k in UI_RAW) {
    const a = UI_RAW[k].split('|');
    UI_STRINGS[k] = {
      foldCode: (n) => `${a[0]} (${n}${a[2]})`,
      expandCode: (n) => `${a[1]} (${n}${a[2]})`,
      outlineBtn: a[3],
      outlineTitle: (n) => `${a[12] || a[3]} · ${n}${a[4]}`,
      foldSteps: a[5],
      foldedFeedback: (n) => (n > 0 ? `${a[6]}${n}${a[7]}` : a[8]),
      searchPlaceholder: a[9],
      emptyMatch: a[10],
      chapterBadge: a[11],
    };
  }
  UI_STRINGS.zh = UI_STRINGS['zh-CN'];

  function isElementLike(n) {
    return Boolean(n && (n.nodeType === 1 || (n.nodeType === undefined && typeof n.tagName === 'string')));
  }

  function normEnhLang(langRaw) {
    const l = String(langRaw || '').trim().toLowerCase().replace(/_/g, '-');
    if (!l || l === 'auto') return 'en';
    if (l === 'yue' || l.startsWith('yue-') || l === 'zh-yue' || l.includes('cantonese')) return 'zh-CN';
    if (/^zh-(tw|hant|hk|mo)/.test(l) || l === 'tw' || l === 'hant') return 'zh-TW';
    if (/^zh/.test(l)) return 'zh-CN';
    if (/^(ja|jp)/.test(l) || l === 'japanese') return 'ja';
    if (/^(ko|kr)/.test(l) || l === 'korean') return 'ko';
    if (/^es/.test(l) || l === 'spanish') return 'es';
    if (/^fr/.test(l) || l === 'french') return 'fr';
    if (/^de/.test(l) || l === 'german') return 'de';
    return 'en';
  }

  function resolveLocalePack(langRaw) {
    return UI_STRINGS[normEnhLang(langRaw)] || UI_STRINGS.en;
  }

  function isEditableElement(el) {
    if (!el) return false;
    const tag = String(el.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (el.getAttribute?.('contenteditable') === 'true' || el.isContentEditable === true) return true;
    if (el.closest?.('[contenteditable="true"], input, textarea, select, [role="textbox"]')) return true;
    return false;
  }

  const ga = (e, k) => e?.getAttribute?.(k);
  const sa = (e, k, v) => e?.setAttribute?.(k, String(v));
  const ha = (e, k) => Boolean(e?.hasAttribute?.(k));
  const ra = (e, k) => e?.removeAttribute?.(k);
  const qs = (e, s) => e?.querySelector?.(s) || null;
  const qa = (e, s) => e?.querySelectorAll?.(s) || [];
  const cl = (e, s) => e?.closest?.(s) || null;
  const tagU = (e) => String(e?.tagName || '').toUpperCase();

  const A_DLG = 'data-ag-cs-settings-dlg',
    A_NAV = 'data-ag-cs-settings-nav',
    A_ACT = 'data-ag-cs-nav-active';
  const S_NAV_KW =
    /\b(?:general|appearance|shortcuts?|keybindings?|account|models?|agent|browser|mcp|notifications?|about|theme|editor|privacy|extensions?|plugins?|rules|workflows?|customiz|keyboard|billing|usage|terminal|voice|audio|skills?)\b|通用|常规|常規|一般|外观|外觀|外観|快捷键|快捷鍵|ショートカット|账户|帳戶|模型|智能体|浏览器|瀏覽器|通知|关于|關於|主题|主題|编辑器|編輯器|隐私|隱私|扩展|擴展|插件|规则|規則|工作流|键盘|鍵盤|用量|终端|終端|语音|語音|技能/i;
  const S_ACT_BG = /^(?:(?:dark|light):)?(?:bg-secondary|bg-sidebar-secondary|bg-sidebar-accent|bg-accent|bg-muted)(?:\/\d+)?$/;
  const S_ACT_BG2 = /^(?:(?:dark|light):)?(?:bg-secondary|bg-sidebar-secondary|bg-sidebar-accent)(?:\/\d+)?$/;
  const normLbl = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const isDescOf = (a, n) => {
    for (let p = n; p; p = p.parentElement) if (p === a) return true;
    return false;
  };

  function syncSettingsDialogChrome(d, runMut, setA) {
    if (!d?.querySelectorAll) return;
    const dlgs = qa(d, '[role="dialog"]');
    if (!dlgs.length) return;
    const run = typeof runMut === 'function' ? runMut : (f) => f();
    const put =
      typeof setA === 'function'
        ? setA
        : (e, k, v) => {
            if (e && ga(e, k) !== v) sa(e, k, v);
          };
    const clr = (r, a, keep) =>
      qa(r, `[${a}]`).forEach((e) => {
        if (e !== keep && ha(e, a)) ra(e, a);
      });
    const navBtnsOf = (c) => {
      const out = [];
      for (const b of qa(c, 'button, [role="tab"], [role="menuitem"]')) {
        if (
          !b ||
          b.hidden ||
          ga(b, 'aria-hidden') === 'true' ||
          ga(b, 'role') === 'switch' ||
          b.classList?.contains?.('agy-select-trigger') ||
          cl(b, '[data-slot="toggle-group"], .agy-card, #ag-cs-settings-sec')
        ) {
          continue;
        }
        if (/\b(?:close|dismiss)\b|关闭|關閉|閉じる/i.test(`${ga(b, 'aria-label') || ''} ${ga(b, 'data-testid') || ''}`)) continue;
        const t = normLbl(b.textContent);
        if (t.length >= 1 && t.length <= 48) out.push(b);
      }
      return out;
    };

    run(() => {
      for (const dlg of dlgs) {
        if (!dlg || tagU(dlg) !== 'DIV' || dlg.classList?.contains?.('agy-overlay') || ha(dlg, 'data-hover-card-popup')) continue;
        const cards = Array.from(qa(dlg, '.agy-card')).filter((c) => c.classList?.contains?.('divide-y'));
        const pSec = qs(dlg, '#ag-cs-settings-sec');
        let panel = null;
        for (const p of qa(dlg, 'div.p-6')) {
          if (p.hidden) continue;
          if (qs(p, '#ag-cs-settings-sec') || qs(p, '.agy-card') || qs(p, 'h2') || qs(p, 'div.space-y-2')) {
            panel = p;
            if (qs(p, '#ag-cs-settings-sec') || qs(p, '.agy-card')) break;
          }
        }
        if (!panel && cards.length) panel = cl(cards[0], 'div.p-6') || cards[0].parentElement;
        if (!panel && pSec) panel = cl(pSec, 'div.p-6') || pSec.parentElement;
        if (!panel) {
          const hs = qa(dlg, 'h2');
          for (let j = hs.length - 1; j >= 0; j--) {
            if (!hs[j].hidden && !cl(hs[j], 'nav, aside, #ag-cs-settings-sec')) {
              panel = hs[j].parentElement;
              break;
            }
          }
        }

        let navCol = null,
          navBtns = [],
          rBranch = panel;
        const tryNav = (c) => {
          if (!c || c === dlg || c === panel || (panel && isDescOf(c, panel)) || tagU(c) === 'BUTTON') return false;
          if (c.classList?.contains?.('p-6') && qs(c, 'div.space-y-2')) return false;
          const bs = navBtnsOf(c);
          if (bs.length < 2) return false;
          if (!/^(?:NAV|ASIDE)$/.test(tagU(c)) && bs.length < 3 && !bs.some((b) => S_NAV_KW.test(b.textContent || ''))) return false;
          navCol = c;
          navBtns = bs;
          return true;
        };
        for (let cur = panel; cur && cur !== dlg && !navCol; cur = cur.parentElement) {
          const ks = cur.parentElement?.children || [];
          for (let k = 0; k < ks.length && ks[k] !== cur; k++) {
            if (tryNav(ks[k])) {
              rBranch = cur;
              break;
            }
          }
        }
        if (!navCol) for (const c of qa(dlg, 'nav, aside')) if (tryNav(c)) break;

        const hs = Array.from(qa(rBranch || panel || dlg, 'h2')).filter(
          (h) => !h.hidden && !cl(h, '#ag-cs-settings-sec') && (!navCol || !isDescOf(navCol, h))
        );
        const hTxt = normLbl(hs[0]?.textContent);
        const isSet = Boolean(
          (panel && navCol) ||
            pSec ||
            cards.length ||
            (panel && hs.some((h) => S_NAV_KW.test(h.textContent || '')) && qs(panel, 'div.space-y-2'))
        );
        if (!isSet) {
          if (ha(dlg, A_DLG)) ra(dlg, A_DLG);
          clr(dlg, A_NAV, null);
          clr(dlg, A_ACT, null);
          continue;
        }
        put(dlg, A_DLG, '1');
        if (navCol) put(navCol, A_NAV, '1');
        clr(dlg, A_NAV, navCol);

        let act = null;
        if (navBtns.length) {
          const ah = navBtns.filter((b) => {
            const ac = ga(b, 'aria-current'),
              ds = ga(b, 'data-state'),
              da = ga(b, 'data-active');
            return (
              (ac && ac !== 'false') ||
              ga(b, 'aria-selected') === 'true' ||
              ga(b, 'aria-pressed') === 'true' ||
              ds === 'active' ||
              ds === 'selected' ||
              (da != null && da !== 'false' && da !== '0') ||
              ga(b, 'data-selected') === 'true'
            );
          });
          if (ah.length) act = (ah.length > 1 && hTxt && ah.find((b) => normLbl(b.textContent) === hTxt)) || ah[0];
          if (!act && hTxt) act = navBtns.find((b) => normLbl(b.textContent) === hTxt) || null;
          if (!act) {
            const ch = navBtns.filter((b) => String(b.className || '').split(/\s+/).some((t) => S_ACT_BG.test(t)));
            if (ch.length) {
              act =
                ch.length === 1
                  ? ch[0]
                  : ch.find((b) => String(b.className || '').split(/\s+/).some((t) => S_ACT_BG2.test(t))) || ch[0];
            }
          }
          if (!act && hTxt.length >= 2) {
            act =
              navBtns.find((b) => {
                const bt = normLbl(b.textContent);
                return bt.length >= 2 && (hTxt.includes(bt) || bt.includes(hTxt));
              }) || null;
          }
        }
        if (act) put(act, A_ACT, '1');
        clr(dlg, A_ACT, act);
      }
    });
  }

  function createHostEnhancerController(options = {}) {
    const doc = options.doc || (typeof document !== 'undefined' ? document : null);
    const win = options.win || (typeof window !== 'undefined' ? window : null);
    const getLang =
      typeof options.getLang === 'function'
        ? options.getLang
        : () => {
            const raw = doc?.documentElement?.getAttribute?.('data-ag-cs-lang');
            return normEnhLang((raw && raw !== 'auto' ? raw : '') || win?.navigator?.language || 'en');
          };
    const getConfig = typeof options.getConfig === 'function' ? options.getConfig : () => ({});
    const extIsDestroyed = typeof options.isDestroyed === 'function' ? options.isDestroyed : () => false;
    const extIsConvRunning = typeof options.isConvRunning === 'function' ? options.isConvRunning : null;
    const mut = typeof options.runGuardedMut === 'function' ? options.runGuardedMut : (fn) => fn();
    const setA =
      typeof options.setAttrIfChanged === 'function'
        ? options.setAttrIfChanged
        : (el, name, val) => {
            if (el && ga(el, name) !== val) sa(el, name, val);
          };
    const tFn = typeof options.t === 'function' ? options.t : null;

    const mk = (t, c, x, ...ks) => {
      const e = doc.createElement(t);
      if (c) e.className = c;
      if (x != null) e.textContent = x;
      for (const k of ks) if (k) e.appendChild(k);
      return e;
    };

    let localDestroyed = false;
    const isDead = () => localDestroyed || extIsDestroyed();

    // ── Internal State & Cleanups ──────────────────────────────────────────
    let cachedAttrKey = '';
    let cachedThemeSample = null;
    let lastSyncedLang = '';
    let iframePushedSig = new WeakMap();
    let iframeSizeCache = new WeakMap();
    const boundIframes = new WeakSet();
    const iframeUnsubscribers = [];
    let iframeRo = null;

    const pruneUnsubs = (list, all, boundSet) => {
      for (let i = list.length - 1; i >= 0; i--) {
        const rec = list[i];
        if (all || (rec && rec.el && rec.el.isConnected === false)) {
          list.splice(i, 1);
          if (rec?.el && boundSet) boundSet.delete(rec.el);
          try {
            (typeof rec === 'function' ? rec : rec?.unsub)?.();
          } catch {}
        }
      }
    };

    const codeLineCache = new WeakMap();
    const preSyncCache = new WeakMap();
    let cachedConvView = null;
    let lastOutlineStreamSyncAt = 0;
    const openScrollTimers = [];
    let openScrollClean = null;
    const stickyState = new WeakMap();
    const stickyUnsubs = [];
    const auxScrollMemory = new Map();
    const auxScrollRestoreCleanups = new Set();
    const auxScrollActiveRestore = new WeakMap();

    const boundNavRails = new WeakSet();
    const navRailUnsubscribers = [];
    let activeNavRail = null;
    let outlinePopover = null;
    let outlineSearchInput = null;
    let outlineListEl = null;
    let outlineTitleEl = null;
    let outlineFoldBtn = null;
    let outlineFilterText = '';
    let outlineOpen = false;
    let lastOutlineStructSig = '';
    let lastOutlineActiveIdx = -1;
    let activeOutlineBtn = null;
    const outlineItemBtnByIdx = new Map();
    let lastCascadeId = '';
    let hideOutlineTimer = 0;
    let foldFeedbackTimer = 0;
    const sonarTimers = new Set();

    // Dedicated timer/rAF sets for non-Diff animations (strictly decoupled from Channel 6 Inline Diff)
    const nonDiffAnimTimers = new Set();
    const ovSecAnimRafs = new Set();
    let scrollGlideRaf = 0;
    let scrollGlideCleanup = null;
    let sidebarMoreExpanded = false;
    let sidebarMoreBtn = null;

    const stats = {
      postMessageCount: 0,
      themeSampleCount: 0,
      foldedCodeBlocks: 0,
      jumpCount: 0,
      foldedStepsLastRun: 0,
      scrollGlideCount: 0,
    };

    function getStrings() {
      return resolveLocalePack(getLang());
    }

    const SIDEBAR_MORE_FB = {
      sidebarMoreLabel: { 'zh-CN': '更多', 'zh-TW': '更多', en: 'More', ja: 'その他', ko: '더보기', es: 'Más', fr: 'Plus', de: 'Mehr' },
      sidebarLessLabel: { 'zh-CN': '收起', 'zh-TW': '收起', en: 'Less', ja: '折りたたむ', ko: '접기', es: 'Menos', fr: 'Moins', de: 'Weniger' },
    };
    function getUiText(key, fallback) {
      if (tFn) {
        const v = tFn(key);
        if (typeof v === 'string' && v && v !== key) return v;
      }
      const nl = normEnhLang(getLang());
      return SIDEBAR_MORE_FB[key]?.[nl] || SIDEBAR_MORE_FB[key]?.en || fallback || key;
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
      if (kind === 'chevDown') {
        addNode('polyline', { points: '6 9 12 15 18 9' });
      } else if (kind === 'moreDots') {
        addNode('circle', { cx: '6', cy: '12', r: '1.2', fill: 'currentColor', stroke: 'none' });
        addNode('circle', { cx: '12', cy: '12', r: '1.2', fill: 'currentColor', stroke: 'none' });
        addNode('circle', { cx: '18', cy: '12', r: '1.2', fill: 'currentColor', stroke: 'none' });
      }
      return svg;
    }

    function checkConvRunning(scope = null) {
      if (scope && typeof scope.querySelector === 'function') {
        const hit = scope.querySelector(
          '[data-testid="agent-input-box"] [data-testid="input-cancel-button"], [data-testid="agent-input-box"] [data-testid="stop-button"]'
        );
        if (hit) return true;
        if (findAllConvViews().length > 1) return false;
      }
      if (extIsConvRunning) return Boolean(extIsConvRunning());
      if (!doc || typeof doc.querySelector !== 'function') return false;
      return Boolean(
        doc.querySelector(
          '[data-testid="agent-input-box"] [data-testid="input-cancel-button"], [data-testid="agent-input-box"] [data-testid="stop-button"]'
        )
      );
    }

    function isFormalConv(cv) {
      return Boolean(
        cv &&
          cv.isConnected !== false &&
          cv.hidden !== true &&
          cv.style?.display !== 'none' &&
          !cv.closest?.('[data-testid="subagent-tab-conversation"]') &&
          !cv.closest?.('.agy-home') &&
          !cv.querySelector?.('.agy-home')
      );
    }

    function findAllConvViews() {
      if (!doc || typeof doc.querySelectorAll !== 'function') return [];
      const views = doc.querySelectorAll(S_CV), out = [];
      for (let i = 0; i < views.length; i++) {
        if (isFormalConv(views[i])) out.push(views[i]);
      }
      return out;
    }

    function findPrimaryConvView(hintEl = null) {
      const hCv = hintEl?.matches?.(S_CV) ? hintEl : cl(hintEl, S_CV);
      if (isFormalConv(hCv)) {
        cachedConvView = hCv;
        return hCv;
      }
      const actCv = cl(doc?.activeElement, S_CV);
      if (isFormalConv(actCv)) {
        cachedConvView = actCv;
        return actCv;
      }
      if (isFormalConv(cachedConvView)) return cachedConvView;
      const formal = findAllConvViews();
      if (formal.length > 0) {
        cachedConvView = formal[0];
        return formal[0];
      }
      const views = qa(doc, S_CV);
      cachedConvView = views.length > 0 ? views[0] : null;
      return cachedConvView;
    }

    function findScrollViewport(startEl) {
      if (startEl?.closest) {
        const vp = startEl.closest(S_VP);
        if (vp) return vp;
        const ownCv = startEl.closest(S_CV);
        if (ownCv?.querySelector) {
          const ownVp = ownCv.querySelector(S_VP);
          if (ownVp) return ownVp;
        }
      }
      const cv = findPrimaryConvView(startEl);
      if (cv?.querySelector) {
        const vp = cv.querySelector(S_VP);
        if (vp) return vp;
      }
      return doc?.querySelector?.(S_VP) || null;
    }

    // ── 1. Sidecar (`plugin://*`) 4-Theme PostMessage Bridge ───────────────
    function readRootAttrKey() {
      const html = doc?.documentElement;
      if (!html) return '';
      const cfg = getConfig() || {};
      return [
        ...'style|theme|palette|light-preset|accent|corners|code-font'.split('|').map((s) => ga(html, 'data-ag-cs-' + s) || ''),
        String(ga(html, 'style') || '').slice(0, 180),
        String(doc?.body?.className || ''),
        cfg.palette || '',
        cfg.lightPreset || '',
        cfg.accentTone || '',
      ].join('|');
    }

    function sampleRootTheme(force = false) {
      const html = doc?.documentElement;
      if (!html || !win || typeof win.getComputedStyle !== 'function') return null;
      const nextAttrKey = readRootAttrKey();
      if (!force && cachedThemeSample && cachedAttrKey === nextAttrKey) {
        return cachedThemeSample;
      }

      stats.themeSampleCount += 1;
      const cs = win.getComputedStyle(html);
      const vars = {};
      const sigParts = [];
      for (let i = 0; i < SIDECAR_THEME_VARS.length; i++) {
        const key = SIDECAR_THEME_VARS[i];
        const val = String(cs.getPropertyValue(key) || '').trim();
        if (val) {
          vars[key] = val;
          sigParts.push(`${key}:${val}`);
        }
      }
      if (!vars['--accent'] && vars['--primary']) {
        vars['--accent'] = vars['--primary'];
        sigParts.push(`--accent:${vars['--accent']}`);
      }

      const explicitTheme = ga(html, 'data-ag-cs-theme');
      const bodyCls = String(doc?.body?.className || '');
      const scheme = String(cs.getPropertyValue('color-scheme') || '').toLowerCase();
      const isLight =
        explicitTheme === 'light' ||
        /\b(?:theme-light|light-theme|light)\b/.test(bodyCls) ||
        (explicitTheme !== 'dark' && scheme.includes('light') && !scheme.includes('dark'));
      const themeType = isLight ? 'light' : 'dark';
      const pal = ga(html, 'data-ag-cs-palette') || 'obsidian';
      const lp = ga(html, 'data-ag-cs-light-preset') || 'crystal';
      const effectiveLp = pal === 'warm' || pal === 'claude' ? 'alabaster' : lp;
      const themeLabel = isLight ? (pal === 'host' ? 'prism-host-light' : `prism-${effectiveLp}`) : `prism-${pal}`;
      const sig = `${themeType}|${themeLabel}|${sigParts.join(';')}`;

      cachedAttrKey = nextAttrKey;
      cachedThemeSample = { themeType, themeLabel, vars, sig };
      return cachedThemeSample;
    }

    function resolveIframeTargetOrigin(iframe) {
      const raw = String(iframe?.getAttribute?.('src') ?? iframe?.src ?? '').trim();
      if (!raw) return null;
      const low = raw.toLowerCase();
      if (low.startsWith('plugin://') || low.startsWith('vscode-webview://')) return '*';
      if (/^https?:\/\//i.test(raw)) {
        const m = /^(https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?)(?:[/?#]|$)/i.exec(raw);
        if (!m) return null;
        if (typeof URL === 'function') {
          try {
            const u = new URL(raw);
            const h = u.hostname.toLowerCase();
            return h === '127.0.0.1' || h === 'localhost' ? u.origin : null;
          } catch {
            return null;
          }
        }
        return m[1].toLowerCase();
      }
      if (raw.startsWith('//') || raw.startsWith('\\') || /^[a-z][a-z0-9+.-]*:/i.test(raw)) return null;
      const lo = win?.location?.origin;
      return lo && /^https?:\/\//i.test(lo) ? lo : '*';
    }

    function pushThemeToIframe(iframe, sample, force = false) {
      if (!iframe || !sample) return false;
      if (!force && iframePushedSig.get(iframe) === sample.sig) return false;
      const targetOrigin = resolveIframeTargetOrigin(iframe);
      if (!targetOrigin) return false;
      const cw = iframe.contentWindow;
      if (!cw || typeof cw.postMessage !== 'function') return false;
      try {
        cw.postMessage(
          {
            type: 'theme-change',
            payload: {
              theme: sample.themeLabel,
              themeType: sample.themeType,
              cssVariables: { ...sample.vars },
            },
          },
          targetOrigin
        );
        iframePushedSig.set(iframe, sample.sig);
        stats.postMessageCount += 1;
        return true;
      } catch {
        return false;
      }
    }

    function querySidecarIframes() {
      if (!doc || typeof doc.querySelectorAll !== 'function') return [];
      const set = new Set();
      doc.querySelectorAll('iframe[data-testid="sidecar-iframe"]').forEach((f) => set.add(f));
      doc.querySelectorAll('[data-testid="sidecar-iframe-slot"] iframe').forEach((f) => set.add(f));
      return Array.from(set);
    }

    function isIframeHidden(f, rectHint = null) {
      if (!f || f.hidden === true || ga(f, 'aria-hidden') === 'true') return true;
      const cached =
        rectHint && (rectHint.width !== undefined || rectHint.height !== undefined)
          ? rectHint
          : iframeSizeCache.get(f);
      const r = cached || f.getBoundingClientRect?.();
      return Boolean(r && r.width <= 0 && r.height <= 0);
    }

    function pushIfVis(f, force, rectHint = null) {
      if (isDead() || isIframeHidden(f, rectHint)) return;
      const s = sampleRootTheme(false);
      if (s) pushThemeToIframe(f, s, force);
    }

    function syncSidecarThemeBridge(forceSample = false) {
      if (isDead() || !doc) return;
      const iframes = querySidecarIframes();
      if (!iframes.length) {
        if (forceSample) sampleRootTheme(true);
        return;
      }
      pruneUnsubs(iframeUnsubscribers, false, boundIframes);
      if (!iframeRo && win?.ResizeObserver) {
        iframeRo = new win.ResizeObserver((es) => {
          if (isDead()) return;
          for (const e of es || []) {
            const f = e?.target;
            if (!f) continue;
            const cr = e?.contentRect;
            if (cr && (cr.width !== undefined || cr.height !== undefined)) {
              iframeSizeCache.set(f, { width: cr.width, height: cr.height });
              if (cr.width > 0 || cr.height > 0) pushIfVis(f, false, cr);
            } else {
              iframeSizeCache.delete(f);
              pushIfVis(f, false);
            }
          }
        });
      }
      const vis = [];
      for (const frame of iframes) {
        if (!boundIframes.has(frame) && frame.addEventListener) {
          boundIframes.add(frame);
          const onLoad = () => {
            iframePushedSig.delete(frame);
            pushIfVis(frame, true);
          };
          frame.addEventListener('load', onLoad);
          try {
            iframeRo?.observe?.(frame);
          } catch {}
          iframeUnsubscribers.push({
            el: frame,
            unsub: () => {
              iframeSizeCache.delete(frame);
              try {
                frame.removeEventListener('load', onLoad);
              } catch {}
              try {
                iframeRo?.unobserve?.(frame);
              } catch {}
            },
          });
        }
        if (!isIframeHidden(frame)) vis.push(frame);
      }
      if (!vis.length) {
        if (forceSample) sampleRootTheme(true);
        return;
      }
      const need =
        forceSample ||
        !cachedThemeSample ||
        cachedAttrKey !== readRootAttrKey() ||
        vis.some((f) => iframePushedSig.get(f) !== cachedThemeSample.sig);
      const sample = need ? sampleRootTheme(forceSample) : cachedThemeSample;
      if (sample) for (const f of vis) pushThemeToIframe(f, sample, false);
    }

    function refreshOutlineLocaleTexts() {
      const ui = getStrings();
      mut(() => {
        if (outlineSearchInput) outlineSearchInput.placeholder = ui.searchPlaceholder;
        if (outlineFoldBtn && !foldFeedbackTimer) outlineFoldBtn.textContent = ui.foldSteps;
        qa(doc, S_TRIG).forEach((b) => setA(b, 'aria-label', ui.outlineBtn || 'Outline'));
      });
      if (outlineOpen) {
        renderOutlinePopover();
      } else if (outlinePopover && outlineListEl) {
        renderOutlineListOnly();
      }
    }

    function onThemeChange(force = true) {
      if (isDead()) return;
      lastSyncedLang = String(getLang() || '');
      if (force) iframePushedSig = new WeakMap();
      syncSidecarThemeBridge(Boolean(force));
      refreshCodeFoldLabels();
      refreshOutlineLocaleTexts();
      syncSidebarOverflowTools();
      try {
        win?.__agPrismInlineDiff?.sync?.(getConfig(), {
          t: tFn,
          getLang,
          runGuardedMut: mut,
          setAttrIfChanged: setA,
        });
      } catch {}
    }

    // ── 2. Code Block Sticky Header & Manual Fold (>= 48 Lines) ────────────
    function resolveCodeCardParts(pre) {
      if (!isElementLike(pre)) return null;
      const card = pre.firstElementChild;
      if (!isElementLike(card) || tagU(card) !== 'DIV') return null;
      const kids = card.children;
      if (!kids || kids.length < 2) return null;
      const header = kids[0];
      const body = kids[1];
      if (!isElementLike(header) || !isElementLike(body)) return null;
      const hdrCls = String(header.className || '');
      const hasHeaderShape =
        hdrCls.includes('border-b') ||
        hdrCls.includes('justify-between') ||
        Boolean(header.querySelector?.('button'));
      if (!hasHeaderShape) return null;
      return { card, header, body };
    }

    function countCodeLines(bodyEl) {
      if (!bodyEl) return 0;
      if (typeof bodyEl.querySelectorAll === 'function') {
        const lineNodes = bodyEl.querySelectorAll('.code-line');
        if (lineNodes && lineNodes.length > 0) return lineNodes.length;
      }
      const rawText = String(bodyEl.textContent || '');
      const len = rawText.length;
      const cached = codeLineCache.get(bodyEl);
      if (cached && cached.textLen === len) return cached.lineCount;
      let count = 0;
      const end = len > 0 && rawText.charCodeAt(len - 1) === 10 ? len - 1 : len;
      if (end > 0) {
        count = 1;
        let pos = 0;
        while ((pos = rawText.indexOf('\n', pos)) !== -1 && pos < end) {
          count += 1;
          pos += 1;
        }
      }
      codeLineCache.set(bodyEl, { textLen: len, lineCount: count });
      return count;
    }

    function formatFoldBtnLabel(folded, lineCount) {
      const ui = getStrings();
      return folded ? ui.expandCode(lineCount) : ui.foldCode(lineCount);
    }

    function toggleCodeCardFold(card, btn) {
      if (!card || !btn) return;
      const lineCount = parseInt(ga(btn, 'data-lines') || '0', 10) || MIN_CODE_FOLD_LINES;
      const isCurrentlyFolded = ga(card, 'data-ag-cs-code-folded') === '1';

      if (!isCurrentlyFolded) {
        const vp = findScrollViewport(card);
        const cardRect = typeof card.getBoundingClientRect === 'function' ? card.getBoundingClientRect() : null;
        const vpRect = vp && typeof vp.getBoundingClientRect === 'function' ? vp.getBoundingClientRect() : null;

        mut(() => {
          sa(card, 'data-ag-cs-code-folded', '1');
          sa(btn, 'aria-expanded', 'false');
          btn.textContent = formatFoldBtnLabel(true, lineCount);
        });
        stats.foldedCodeBlocks += 1;

        if (vp && cardRect && vpRect && cardRect.top < vpRect.top) {
          const delta = Math.round(cardRect.top - vpRect.top - 12);
          vp.scrollTop = Math.max(0, (vp.scrollTop || 0) + delta);
        }
      } else {
        mut(() => {
          ra(card, 'data-ag-cs-code-folded');
          sa(btn, 'aria-expanded', 'true');
          btn.textContent = formatFoldBtnLabel(false, lineCount);
        });
      }
    }

    function getPreBodyStamp(body) {
      if (!body) return '';
      const ch = body.children;
      const cLen = ch ? ch.length : 0;
      if (cLen > 1) {
        const first = ch[0];
        const firstSub = first?.children;
        const firstSig = firstSub && firstSub.length > 0 ? `n${firstSub.length}` : String(first?.textContent || '').length;
        const last = ch[cLen - 1];
        return `c:${cLen}:${firstSig}:${String(last?.textContent || '').length}`;
      }
      const target = cLen === 1 ? ch[0] : body;
      const sub = target.children;
      if (sub && sub.length > 1) {
        return `s:${sub.length}:${String(sub[sub.length - 1]?.textContent || '').length}`;
      }
      return `t:${String(target.textContent || '').length}`;
    }

    function hasFollowingSiblingInResp(pre, resp) {
      if (!pre || !resp) return false;
      let cur = pre;
      while (cur && cur !== resp) {
        if (cur.nextElementSibling) return true;
        cur = cur.parentElement;
      }
      return false;
    }

    function syncCodeBlocks() {
      if (isDead() || !doc?.querySelectorAll) return;
      const views = findAllConvViews();
      const convScopes = views.length > 0 ? views : [findPrimaryConvView()].filter(Boolean);
      const streamingPres = new Set();
      const lastRespByConv = new Map();
      let defaultLastResp = null;
      for (let v = 0; v < convScopes.length; v++) {
        const cv = convScopes[v];
        const responses = qa(cv, '[data-testid="planner-response-text"], [data-testid="agent-response"]');
        const lr = responses.length > 0 ? responses[responses.length - 1] : null;
        if (lr) {
          lastRespByConv.set(cv, lr);
          if (!defaultLastResp) defaultLastResp = lr;
          if (checkConvRunning(cv)) {
            const rPres = qa(lr, 'pre');
            const tailPre = rPres.length > 0 ? rPres[rPres.length - 1] : null;
            if (tailPre && !hasFollowingSiblingInResp(tailPre, lr)) streamingPres.add(tailPre);
          }
        }
      }

      const pres = qa(doc, '[data-testid="planner-response-text"] pre, [data-testid="agent-response"] pre, [data-testid="artifact-view"] pre');
      if (!pres.length) return;
      const curLang = lastSyncedLang || String(getLang() || '');
      const AF = 'data-ag-cs-code-folded',
        AS = 'data-ag-cs-code-sticky',
        AR = 'data-ag-cs-rich-pre';

      mut(() => {
        for (let i = 0; i < pres.length; i++) {
          const pre = pres[i];
          if (streamingPres.has(pre)) {
            if (ga(pre, AR) !== '1' && tagU(pre.firstElementChild) === 'DIV') {
              setA(pre, AR, '1');
            }
            continue;
          }
          const prevRec = preSyncCache.get(pre);
          const recValid =
            prevRec &&
            prevRec.lang === curLang &&
            ga(prevRec.header, AS) === '1' &&
            (prevRec.lineCount < MIN_CODE_FOLD_LINES || (prevRec.btn && prevRec.btn.isConnected !== false && prevRec.btn.parentElement));
          if (recValid && prevRec.sealed) continue;

          let hasDirectDiv = false;
          for (const c of pre.children || []) {
            if (tagU(c) === 'DIV') {
              hasDirectDiv = true;
              break;
            }
          }
          if (hasDirectDiv) setA(pre, AR, '1');
          else if (ha(pre, AR)) ra(pre, AR);

          const ownCv = cl(pre, S_CV);
          const lastResp = (ownCv && lastRespByConv.get(ownCv)) || defaultLastResp;
          const canSeal = Boolean(
            lastResp &&
              !cl(pre, '[data-testid="artifact-view"]') &&
              (!lastResp.contains?.(pre) || hasFollowingSiblingInResp(pre, lastResp))
          );
          if (recValid && prevRec.stamp === getPreBodyStamp(prevRec.body)) {
            if (canSeal) prevRec.sealed = true;
            continue;
          }

          const parts = resolveCodeCardParts(pre);
          if (!parts) continue;
          const { card, header, body } = parts;
          setA(header, AS, '1');

          const lineCount = countCodeLines(body);
          let btn = prevRec?.btn?.parentElement ? prevRec.btn : qs(header, '.ag-cs-code-fold-btn');
          if (lineCount < MIN_CODE_FOLD_LINES) {
            btn?.remove();
            if (ha(card, AF)) ra(card, AF);
            preSyncCache.set(pre, {
              header,
              body,
              btn: null,
              lineCount,
              lang: curLang,
              stamp: getPreBodyStamp(body),
              sealed: canSeal,
            });
            continue;
          }

          const folded = ga(card, AF) === '1';
          const lbl = formatFoldBtnLabel(folded, lineCount);
          if (btn) {
            setA(btn, 'data-lines', String(lineCount));
            setA(btn, 'aria-expanded', folded ? 'false' : 'true');
            if (btn.textContent !== lbl) btn.textContent = lbl;
          } else {
            btn = markNoTr(mk('button', 'ag-cs-code-fold-btn', lbl));
            btn.type = 'button';
            sa(btn, 'data-ag-no-i18n', '');
            sa(btn, 'data-ag-owned', '1');
            sa(btn, 'data-no-press-spring', '1');
            sa(btn, 'data-lines', lineCount);
            sa(btn, 'aria-expanded', folded ? 'false' : 'true');
            btn.addEventListener('click', (ev) => {
              ev?.preventDefault?.();
              ev?.stopPropagation?.();
              toggleCodeCardFold(card, btn);
            });
            const lc = header.lastElementChild;
            if (lc && lc !== header.firstElementChild && tagU(lc) === 'DIV') lc.insertBefore(btn, lc.firstChild);
            else header.appendChild(btn);
          }
          preSyncCache.set(pre, {
            header,
            body,
            btn,
            lineCount,
            lang: curLang,
            stamp: getPreBodyStamp(body),
            sealed: canSeal,
          });
        }
      });
    }

    function refreshCodeFoldLabels() {
      const btns = qa(doc, '.ag-cs-code-fold-btn');
      if (!btns.length) return;
      mut(() => {
        for (const b of btns) {
          const n = parseInt(ga(b, 'data-lines') || '0', 10) || MIN_CODE_FOLD_LINES;
          b.textContent = formatFoldBtnLabel(ga(b, 'aria-expanded') === 'false', n);
        }
      });
    }

    // ── 3. Long-Conversation Navigator Outline, Step Folding & Alt+Up/Down ─
    function pulseSonarOnElement(target) {
      if (!target) return;
      mut(() => sa(target, 'data-ag-cs-sonar', '1'));
      const tid = setTimeout(() => {
        sonarTimers.delete(tid);
        if (!isDead() && target.isConnected !== false) mut(() => ra(target, 'data-ag-cs-sonar'));
      }, SONAR_DURATION_MS);
      sonarTimers.add(tid);
    }

    function scrollElementToTopInViewport(target) {
      if (!target) return;
      unpinStickyVp();
      const vp = findScrollViewport(target),
        tr = target.getBoundingClientRect?.(),
        vr = vp?.getBoundingClientRect?.();
      if (vp && tr && vr && vr.height > 0) {
        const top = Math.max(0, Math.round((vp.scrollTop || 0) + (tr.top - vr.top) - 16));
        if (typeof vp.scrollTo === 'function') vp.scrollTo({ top, behavior: 'smooth' });
        else vp.scrollTop = top;
        return;
      }
      target.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    }

    function getMountedUserTurns(convView) {
      const root = convView || findPrimaryConvView();
      if (!root?.querySelectorAll) return [];
      const steps = Array.from(qa(root, '[data-testid="user-input-step"]'));
      return steps.length ? steps : Array.from(qa(root, '[data-testid="user-message-bubble"]'));
    }

    function jumpUserTurn(delta, targetEl = null) {
      if (isDead() || !delta) return false;
      cancelOpenScroll();
      unpinStickyVp();
      const conv = findPrimaryConvView(targetEl),
        turns = getMountedUserTurns(conv);
      if (!turns.length) return false;
      const vr = findScrollViewport(conv)?.getBoundingClientRect?.(),
        ay = vr && vr.height > 0 ? vr.top + 36 : 80;
      let idx = -1;
      if (delta < 0) {
        for (let i = turns.length - 1; i >= 0; i--) {
          const r = turns[i].getBoundingClientRect?.();
          if (r && r.top < ay - 8) {
            idx = i;
            break;
          }
        }
        if (idx < 0) idx = 0;
      } else {
        for (let i = 0; i < turns.length; i++) {
          const r = turns[i].getBoundingClientRect?.();
          if (r && r.top > ay + 8) {
            idx = i;
            break;
          }
        }
        if (idx < 0) idx = turns.length - 1;
      }
      const target = turns[idx];
      if (!target) return false;
      scrollElementToTopInViewport(target);
      pulseSonarOnElement(target);
      stats.jumpCount++;
      return true;
    }

    let foldRafId = 0;
    function cancelFoldRaf() {
      if (foldRafId && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(foldRafId);
      foldRafId = 0;
    }

    function foldHistoricalSteps(convOverride = null) {
      if (isDead() || !doc) return 0;
      cancelFoldRaf();
      const conv = convOverride || cl(activeNavRail, S_CV) || findPrimaryConvView();
      if (!conv?.querySelectorAll) return 0;
      const uSteps = getMountedUserTurns(conv),
        lastU = uSteps[uSteps.length - 1] || null;
      const aResps = Array.from(qa(conv, '[data-testid="agent-response"]')),
        lastA = aResps[aResps.length - 1] || null;
      const multi = aResps.length >= 2 || uSteps.length >= 2;
      const cols = Array.from(
        qa(conv, '[data-testid="worked-for-collapsible"][aria-expanded="true"], [data-testid="thinking-collapsible-trigger"][aria-expanded="true"]')
      );
      const tgts = [];
      for (let i = 0; i < cols.length; i++) {
        const b = cols[i];
        if (multi && (lastA?.contains?.(b) || (lastU?.compareDocumentPosition?.(b) & 4))) continue;
        if (!multi && i === cols.length - 1) continue;
        if (ga(b, 'aria-expanded') === 'true' && typeof b.click === 'function') tgts.push(b);
      }
      const clickPair = (s) => {
        for (let k = s; k < Math.min(tgts.length, s + 2); k++) {
          const b = tgts[k];
          if (b && b.isConnected !== false && ga(b, 'aria-expanded') === 'true') {
            try {
              b.click();
            } catch {}
          }
        }
      };
      const total = tgts.length;
      stats.foldedStepsLastRun = total;
      if (total <= 4 || typeof requestAnimationFrame !== 'function') {
        for (let i = 0; i < total; i += 2) clickPair(i);
        return total;
      }
      clickPair(0);
      let cur = 2;
      const step = () => {
        foldRafId = 0;
        if (isDead()) return;
        clickPair(cur);
        cur += 2;
        if (cur < tgts.length) foldRafId = requestAnimationFrame(step);
      };
      foldRafId = requestAnimationFrame(step);
      return total;
    }

    function extractPromptSnippet(stepEl) {
      if (!stepEl) return '';
      const contentEl =
        qs(stepEl, '[data-testid="user-message-content"]') ||
        qs(stepEl, '[data-testid="user-message-bubble"]') ||
        stepEl;
      const raw = String(contentEl.textContent || '')
        .replace(/\s+/g, ' ')
        .trim();
      return raw.length > 68 ? `${raw.slice(0, 66)}…` : raw || '(Prompt)';
    }

    function parseTurnDotMeta(dot) {
      const aria = String(ga(dot, 'aria-label') || '');
      const m = aria.match(/(\d+)\s*(?:of|\/)\s*(\d+)/i);
      if (m) return { turn: parseInt(m[1], 10) || 0, total: parseInt(m[2], 10) || 0 };
      const tail = aria.match(/(?:of|\/)\s*(\d+)/i);
      const lead = aria.match(/(\d+)/);
      return {
        turn: lead ? parseInt(lead[1], 10) || 0 : 0,
        total: tail ? parseInt(tail[1], 10) || 0 : 0,
      };
    }

    function isTurnDotActive(dot) {
      if (!dot) return false;
      return (
        ga(dot, 'aria-current') === 'true' ||
        ga(dot, 'data-active') === 'true' ||
        ga(dot, 'data-selected') === 'true' ||
        ga(dot, 'data-state') === 'active' ||
        Boolean(qs(dot, '[data-active="true"], .bg-primary, .bg-foreground'))
      );
    }

    function isHostGroupCardVisible() {
      for (const c of qa(doc, '[data-testid="conversation-navigator-group-card"]')) {
        if (!c || c.hidden || c.isConnected === false) continue;
        const d = c.style?.getPropertyValue ? c.style.getPropertyValue('display') : c.style?.display;
        if (d !== 'none') return true;
      }
      return false;
    }

    function collectOutlineModel(navRail) {
      const conv = cl(navRail, S_CV) || findPrimaryConvView();
      const chapters = navRail
        ? Array.from(qa(navRail, S_NG)).map((btn) => ({
            btn,
            label: String(ga(btn, 'aria-label') || ga(btn, 'data-group-key') || '').trim(),
          }))
        : [];
      const dots = navRail ? Array.from(qa(navRail, S_NT)) : [],
        pd = dots.map(parseTurnDotMeta);
      let total = 0,
        actTurn = 0;
      for (let i = 0; i < dots.length; i++) {
        if (pd[i].total > total) total = pd[i].total;
        if (!actTurn && pd[i].turn > 0 && isTurnDotActive(dots[i])) actTurn = pd[i].turn;
      }
      const steps = getMountedUserTurns(conv);
      if (!total) total = steps.length;
      const vr = findScrollViewport(conv)?.getBoundingClientRect?.(),
        midY = vr && vr.height > 0 ? vr.top + vr.height * 0.35 : 240;
      let actIdx = steps.length - 1;
      for (let i = 0; i < steps.length; i++) {
        const r = steps[i].getBoundingClientRect?.();
        if (r && r.top <= midY) actIdx = i;
      }
      const exact = steps.length > 0 && pd.length === steps.length && pd.every((d) => d.turn > 0);
      let start = Math.max(1, total - steps.length + 1);
      if (!exact && actTurn > 0 && actIdx >= 0 && steps.length > 0) start = Math.max(1, Math.min(start, actTurn - actIdx));
      const items = steps.map((el, i) => ({
        el,
        turnNum: exact ? pd[i].turn : start + i,
        text: extractPromptSnippet(el),
        active: i === actIdx,
      }));
      return { totalTurns: Math.max(total, items.length), chapters, items };
    }

    function cancelHideOutlineTimer() {
      if (hideOutlineTimer) {
        clearTimeout(hideOutlineTimer);
        hideOutlineTimer = 0;
      }
    }

    function scheduleHideOutline() {
      cancelHideOutlineTimer();
      hideOutlineTimer = setTimeout(() => {
        hideOutlineTimer = 0;
        closeNavOutline();
      }, OUTLINE_HIDE_DELAY_MS);
    }

    function ensureOutlinePopover(hostParent) {
      if (outlinePopover && outlinePopover.parentElement === hostParent) return outlinePopover;
      if (outlinePopover) outlinePopover.remove();
      if (!doc || !hostParent) return null;

      const ui = getStrings();
      const title = mk('span', 'ag-cs-nav-outline-title');
      const foldBtn = mk('button', 'ag-cs-nav-fold-steps-btn', ui.foldSteps);
      foldBtn.type = 'button';
      sa(foldBtn, 'data-no-press-spring', '1');
      foldBtn.addEventListener('click', (ev) => {
        ev?.preventDefault?.();
        ev?.stopPropagation?.();
        foldBtn.textContent = getStrings().foldedFeedback(foldHistoricalSteps());
        if (foldFeedbackTimer) clearTimeout(foldFeedbackTimer);
        foldFeedbackTimer = setTimeout(() => {
          foldFeedbackTimer = 0;
          if (!isDead() && outlineFoldBtn) outlineFoldBtn.textContent = getStrings().foldSteps;
        }, 1200);
      });
      const search = mk('input', 'ag-cs-nav-outline-search');
      search.type = 'search';
      search.placeholder = ui.searchPlaceholder;
      search.addEventListener('input', () => {
        outlineFilterText = String(search.value || '').trim().toLowerCase();
        renderOutlineListOnly();
      });
      search.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') {
          ev.stopPropagation();
          closeNavOutline();
        } else if (ev.key === 'Enter') {
          qs(outlineListEl, 'button.ag-cs-nav-outline-item, button.ag-cs-nav-outline-chapter')?.click?.();
        }
      });
      const list = mk('div', 'ag-cs-nav-outline-list');
      const pop = markNoTr(
        mk(
          'div',
          'ag-cs-nav-outline-popover',
          null,
          mk('div', 'ag-cs-nav-outline-head', null, title, foldBtn),
          mk('div', 'ag-cs-nav-outline-search-wrap', null, search),
          list
        )
      );
      sa(pop, 'role', 'region');
      sa(pop, 'data-ag-no-i18n', '');
      sa(pop, 'data-ag-owned', '1');
      pop.hidden = true;
      pop.addEventListener('pointerenter', cancelHideOutlineTimer);
      pop.addEventListener('pointerleave', () => {
        if (doc.activeElement !== search) scheduleHideOutline();
      });
      hostParent.appendChild(pop);
      outlinePopover = pop;
      outlineTitleEl = title;
      outlineFoldBtn = foldBtn;
      outlineSearchInput = search;
      outlineListEl = list;
      lastOutlineStructSig = '';
      lastOutlineActiveIdx = -1;
      activeOutlineBtn = null;
      outlineItemBtnByIdx.clear();
      return pop;
    }

    function readCurrentCascadeId(convOverride = null) {
      const cv = convOverride || cl(activeNavRail, S_CV) || findPrimaryConvView();
      const id =
        ga(cv, 'data-cascade-id') ||
        ga(cl(cv, '[data-cascade-id]'), 'data-cascade-id') ||
        ga(qs(cv, '[data-cascade-id]'), 'data-cascade-id') ||
        ga(qs(doc, '[data-cascade-id]'), 'data-cascade-id') ||
        '';
      return String(id).trim();
    }

    function syncCascadeChange(closeIfOpen = true) {
      const nextCid = readCurrentCascadeId();
      if (nextCid === lastCascadeId) return false;
      const hadPrev = Boolean(lastCascadeId);
      lastCascadeId = nextCid;
      if (!hadPrev && !nextCid) return false;
      lastOutlineStructSig = '';
      lastOutlineActiveIdx = -1;
      activeOutlineBtn = null;
      outlineItemBtnByIdx.clear();
      outlineFilterText = '';
      if (outlineSearchInput?.value) outlineSearchInput.value = '';
      if (closeIfOpen && outlineOpen) closeNavOutline();
      if (nextCid) scheduleOpenScrollToBottom();
      return true;
    }

    function renderOutlineListOnly(forceRebuild = false) {
      if (!outlineListEl || !doc) return;
      const cascadeChanged = syncCascadeChange(false);
      const ui = getStrings();
      const model = collectOutlineModel(activeNavRail);
      const q = outlineFilterText;
      const structParts = [lastCascadeId, lastSyncedLang, model.totalTurns, q, model.chapters.length, model.items.length];
      for (let i = 0; i < model.chapters.length; i++) structParts.push(model.chapters[i].label);
      let activeIdx = -1;
      for (let i = 0; i < model.items.length; i++) {
        const it = model.items[i];
        if (it.active) activeIdx = i;
        structParts.push(`${it.turnNum}:${it.text}`);
      }
      const nextStructSig = structParts.join('\x1f');
      if (!forceRebuild && !cascadeChanged && nextStructSig === lastOutlineStructSig && outlineListEl.firstChild) {
        for (let i = 0; i < model.items.length; i++) {
          const btn = outlineItemBtnByIdx.get(i);
          if (btn) btn.__agTurnEl = model.items[i].el;
        }
        if (activeIdx !== lastOutlineActiveIdx) {
          const nextBtn = activeIdx >= 0 ? outlineItemBtnByIdx.get(activeIdx) || null : null;
          mut(() => {
            if (activeOutlineBtn && activeOutlineBtn !== nextBtn) ra(activeOutlineBtn, 'data-active');
            if (nextBtn) setA(nextBtn, 'data-active', '1');
          });
          activeOutlineBtn = nextBtn;
          lastOutlineActiveIdx = activeIdx;
        }
        return;
      }
      lastOutlineStructSig = nextStructSig;
      lastOutlineActiveIdx = activeIdx;
      activeOutlineBtn = null;
      outlineItemBtnByIdx.clear();
      mut(() => {
        if (outlineTitleEl) outlineTitleEl.textContent = ui.outlineTitle(model.totalTurns);
        while (outlineListEl.firstChild) outlineListEl.removeChild(outlineListEl.firstChild);
        let renderedCount = 0;
        for (let i = 0; i < model.chapters.length; i++) {
          const ch = model.chapters[i];
          if (q && !ch.label.toLowerCase().includes(q)) continue;
          const row = mk(
            'button',
            'ag-cs-nav-outline-chapter',
            null,
            mk('span', 'ag-cs-nav-outline-badge', ui.chapterBadge),
            mk('span', 'ag-cs-nav-outline-text', ch.label)
          );
          row.type = 'button';
          sa(row, 'data-no-press-spring', '1');
          row.addEventListener('click', (ev) => {
            ev?.preventDefault?.();
            ev?.stopPropagation?.();
            try {
              ch.btn.click?.();
            } catch {}
          });
          outlineListEl.appendChild(row);
          renderedCount++;
        }
        for (let i = 0; i < model.items.length; i++) {
          const it = model.items[i];
          const numStr = `#${it.turnNum}`;
          if (q && !it.text.toLowerCase().includes(q) && !numStr.includes(q)) continue;
          const row = mk(
            'button',
            'ag-cs-nav-outline-item',
            null,
            mk('span', 'ag-cs-nav-outline-num', numStr),
            mk('span', 'ag-cs-nav-outline-text', it.text)
          );
          row.type = 'button';
          sa(row, 'data-no-press-spring', '1');
          sa(row, 'data-turn-num', it.turnNum);
          row.__agTurnEl = it.el;
          if (it.active) {
            sa(row, 'data-active', '1');
            activeOutlineBtn = row;
          }
          outlineItemBtnByIdx.set(i, row);
          row.addEventListener('click', (ev) => {
            ev?.preventDefault?.();
            ev?.stopPropagation?.();
            const targetEl = row.__agTurnEl || it.el;
            scrollElementToTopInViewport(targetEl);
            pulseSonarOnElement(targetEl);
            stats.jumpCount++;
          });
          outlineListEl.appendChild(row);
          renderedCount++;
        }
        if (!renderedCount) outlineListEl.appendChild(mk('div', 'ag-cs-nav-outline-empty', ui.emptyMatch));
      });
    }

    function renderOutlinePopover() {
      const navRail = activeNavRail || qs(doc, '[data-testid="conversation-navigator"]');
      if (!navRail) return null;
      activeNavRail = navRail;
      const hp = cl(navRail, '[data-testid="conversation-view"]') || navRail.parentElement || doc?.body;
      if (!hp) return null;
      let pop = null;
      mut(() => {
        pop = ensureOutlinePopover(hp);
        if (!pop) return;
        const ui = getStrings();
        if (outlineSearchInput) outlineSearchInput.placeholder = ui.searchPlaceholder;
        if (outlineFoldBtn && !foldFeedbackTimer) outlineFoldBtn.textContent = ui.foldSteps;
      });
      if (!pop) return null;
      renderOutlineListOnly();
      return pop;
    }

    function openNavOutline(railOverride = null) {
      if (isDead() || !doc || isHostGroupCardVisible()) return false;
      cancelHideOutlineTimer();
      const navRail = railOverride || qs(doc, '[data-testid="conversation-navigator"]');
      if (!navRail) return false;
      activeNavRail = navRail;
      const pop = renderOutlinePopover();
      if (!pop) return false;
      outlineOpen = true;
      mut(() => {
        pop.hidden = false;
        sa(pop, 'data-open', '1');
      });
      return true;
    }

    function closeNavOutline() {
      cancelHideOutlineTimer();
      outlineOpen = false;
      if (!outlinePopover) return;
      mut(() => {
        ra(outlinePopover, 'data-open');
        outlinePopover.hidden = true;
      });
    }

    function syncNavRails() {
      if (isDead() || !doc?.querySelectorAll) return;
      pruneUnsubs(navRailUnsubscribers, false, boundNavRails);
      const rails = qa(doc, '[data-testid="conversation-navigator"]');
      const PASSIVE_OPT = { passive: true };
      for (let i = 0; i < rails.length; i++) {
        const rail = rails[i];
        if (boundNavRails.has(rail) || typeof rail.addEventListener !== 'function') continue;
        boundNavRails.add(rail);
        let trigBtn = qs(rail, S_TRIG) || null;
        if (!trigBtn && doc.createElement && rail.appendChild) {
          trigBtn = markNoTr(mk('button', 'ag-cs-nav-outline-trigger', '☰'));
          trigBtn.type = 'button';
          sa(trigBtn, 'data-ag-owned', '1');
          sa(trigBtn, 'aria-label', getStrings().outlineBtn || 'Outline');
          sa(trigBtn, 'data-no-press-spring', '1');
          trigBtn.addEventListener('pointerenter', () => openNavOutline(rail), PASSIVE_OPT);
          trigBtn.addEventListener('click', (ev) => {
            ev?.stopPropagation?.();
            outlineOpen ? closeNavOutline() : openNavOutline(rail);
          });
          mut(() => rail.appendChild(trigBtn));
        }
        let lastHoverTarget = null;
        let lastHoverAt = 0;
        const onPointerHover = (ev) => {
          const tgt = ev?.target || null;
          const onTrig = Boolean(cl(tgt, S_TRIG));
          const onGrp = !onTrig && Boolean(cl(tgt, S_NG));
          if (
            !onTrig &&
            (onGrp ||
              qs(rail, `${S_NT}[data-base-ui-tooltip-trigger],${S_NT}[data-trigger-disabled],${S_NT}[data-turn-index]`))
          ) {
            lastHoverTarget = tgt;
            if (outlineOpen && doc.activeElement !== outlineSearchInput) {
              if (onGrp || cl(tgt, S_NT)) closeNavOutline();
              else scheduleHideOutline();
            }
            return;
          }
          if (outlineOpen && activeNavRail === rail && outlinePopover && outlinePopover.isConnected !== false) {
            cancelHideOutlineTimer();
            lastHoverTarget = tgt;
            return;
          }
          const now = Date.now();
          if (tgt && tgt === lastHoverTarget && now - lastHoverAt < 24) return;
          lastHoverTarget = tgt;
          lastHoverAt = now;
          if (isHostGroupCardVisible()) return;
          openNavOutline(rail);
        };
        const onLeave = () => {
          lastHoverTarget = null;
          scheduleHideOutline();
        };
        rail.addEventListener('pointerenter', onPointerHover, PASSIVE_OPT);
        rail.addEventListener('pointerover', onPointerHover, PASSIVE_OPT);
        rail.addEventListener('pointerleave', onLeave, PASSIVE_OPT);
        navRailUnsubscribers.push({
          el: rail,
          unsub: () => {
            try {
              rail.removeEventListener('pointerenter', onPointerHover, PASSIVE_OPT);
              rail.removeEventListener('pointerover', onPointerHover, PASSIVE_OPT);
              rail.removeEventListener('pointerleave', onLeave, PASSIVE_OPT);
              trigBtn?.remove?.();
            } catch {}
          },
        });
      }
      if (outlineOpen && outlinePopover && outlinePopover.isConnected !== false) {
        if (isHostGroupCardVisible() && doc.activeElement !== outlineSearchInput) {
          closeNavOutline();
        } else {
          const now = Date.now();
          if (!checkConvRunning() || now - lastOutlineStreamSyncAt >= 200) {
            lastOutlineStreamSyncAt = now;
            renderOutlineListOnly();
          }
        }
      }
    }

    // ── 4. Permissions Menu, Subagent Ambient, Sidebar Fold, Scroll Glide, Overlay Mirrors & OverviewSection GPU Fold ──
    function isPermOptionSelected(optEl) {
      if (!optEl) return false;
      if (ga(optEl, 'aria-checked') === 'true' || ga(optEl, 'aria-selected') === 'true' || ga(optEl, 'data-selected') === 'true') {
        return true;
      }
      try {
        const fk = Object.keys(optEl).find((k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
        for (let d = 0, f = fk ? optEl[fk] : null; d < 8 && f; d++, f = f.return) {
          if (f.memoizedProps && typeof f.memoizedProps.selected === 'boolean') return f.memoizedProps.selected;
        }
      } catch {}
      return false;
    }

    function syncPermissionsMenuState() {
      if (isDead() || !doc?.querySelectorAll) return;
      const menus = qa(doc, '[data-testid="permissions-menu"]');
      if (!menus.length) return;
      mut(() => {
        for (const menu of menus) {
          const opts = qa(menu, '[data-testid^="permissions-preset-option-"]'),
            hint = qs(menu, '[data-testid="permissions-sandbox-hint"]');
          for (const o of opts) {
            if (isPermOptionSelected(o)) setA(o, 'data-ag-perm-selected', '1');
            else if (ha(o, 'data-ag-perm-selected')) ra(o, 'data-ag-perm-selected');
          }
          const prev = hint?.previousElementSibling;
          if (prev && (ga(prev, 'role') === 'separator' || !ha(prev, 'data-testid'))) setA(prev, 'data-ag-perm-sandbox-sep', '1');
        }
      });
    }

    function hasActiveFiberSubagents(secEl) {
      if (!secEl) return false;
      try {
        const btn = qs(secEl, 'button') || secEl;
        const fk = Object.keys(btn).find((k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
        for (let d = 0, f = fk ? btn[fk] : null; d < 9 && f; d++, f = f.return) {
          for (let s = 0, st = f.memoizedState; s < 8 && st; s++, st = st.next) {
            const v = st.memoizedState;
            if (v && typeof v === 'object' && Array.isArray(v.activeRootIds) && v.activeRootIds.length > 0) return true;
          }
        }
      } catch {}
      return false;
    }

    function syncSubagentRunningAmbient() {
      if (isDead() || !doc?.querySelectorAll) return;
      const SP = '[data-testid="status-loading-spinner"], [data-testid="status-task-running"]';
      const rows = qa(doc, '[data-testid="subagent-node"], [data-testid="running-row"], [data-testid="background-task-row"]');
      const sps = qa(doc, '[data-testid="step-plan"]');
      const ovPanels = qa(doc, '[data-testid="overview-panel"]');
      const ovShells = qa(doc, '[data-ag-cs-overview-shell="1"]');
      const runPanels = qa(doc, '[data-testid="running-items-panel"].grid-rows-\\[1fr\\]');
      let anyInRun = false;
      for (const rp of runPanels) {
        if (qs(rp, SP)) { anyInRun = true; break; }
      }
      mut(() => {
        for (const r of rows) {
          if (qs(r, SP)) setA(r, 'data-ag-sub-running', '1');
          else if (ha(r, 'data-ag-sub-running')) ra(r, 'data-ag-sub-running');
        }
        for (const sp of sps) {
          if (qs(sp, '[data-testid="step-plan-item"][data-status="in_progress"] [data-testid="status-loading-spinner"]')) setA(sp, 'data-ag-sp-running', '1');
          else if (ha(sp, 'data-ag-sp-running')) ra(sp, 'data-ag-sp-running');
        }
        if (!ovPanels.length) {
          for (const sh of ovShells) if (ha(sh, 'data-ag-overview-running')) ra(sh, 'data-ag-overview-running');
          return;
        }
        for (const ovPanel of ovPanels) {
          const ovCv = cl(ovPanel, S_CV);
          const localRun = ovCv
            ? Boolean(qs(qs(ovCv, '[data-testid="running-items-panel"].grid-rows-\\[1fr\\]'), SP))
            : anyInRun;
          let ovRun = localRun || Boolean(qs(ovPanel, SP));
          for (const sec of qa(ovPanel, '.p-1')) {
            const hb = qs(sec, 'button');
            if (!hb) continue;
            const sp = Boolean(qs(sec, SP));
            if (sp || hasActiveFiberSubagents(sec)) {
              setA(hb, 'data-ag-sub-sec-running', '1');
              ovRun = true;
            } else if (ha(hb, 'data-ag-sub-sec-running')) {
              ra(hb, 'data-ag-sub-sec-running');
            }
          }
          const ovShell = cl(ovPanel, '[data-ag-cs-overview-shell="1"]') || ovPanel.parentElement || null;
          if (ovShell) {
            if (ovRun) setA(ovShell, 'data-ag-overview-running', '1');
            else if (ha(ovShell, 'data-ag-overview-running')) ra(ovShell, 'data-ag-overview-running');
          }
        }
      });
    }

    function cancelScrollGlide() {
      if (scrollGlideRaf && win?.cancelAnimationFrame) {
        try {
          win.cancelAnimationFrame(scrollGlideRaf);
        } catch {}
      }
      scrollGlideRaf = 0;
      if (typeof scrollGlideCleanup === 'function') {
        try {
          scrollGlideCleanup();
        } catch {}
        scrollGlideCleanup = null;
      }
    }

    function cancelOpenScroll() {
      while (openScrollTimers.length) clearTimeout(openScrollTimers.pop());
      if (typeof openScrollClean === 'function') {
        try { openScrollClean(); } catch {}
        openScrollClean = null;
      }
    }

    function scheduleOpenScrollToBottom() {
      cancelOpenScroll();
      if (isDead() || !doc || !win) return;
      const evTarget = qs(doc, S_VP) || doc;
      const stop = () => cancelOpenScroll();
      for (const ev of ['wheel', 'pointerdown', 'touchstart']) evTarget.addEventListener?.(ev, stop, { passive: true, once: true });
      win.addEventListener?.('keydown', stop, { passive: true, once: true });
      openScrollClean = () => {
        for (const ev of ['wheel', 'pointerdown', 'touchstart']) evTarget.removeEventListener?.(ev, stop);
        win.removeEventListener?.('keydown', stop);
      };
      for (const ms of [40, 160, 380, 750]) {
        openScrollTimers.push(setTimeout(() => {
          if (isDead()) return cancelOpenScroll();
          const vps = qa(doc, S_VP);
          const list = vps.length ? vps : [qs(doc, S_VP)].filter(Boolean);
          for (const vp of list) {
            if (!vp) continue;
            const subKey = resolveAuxScrollKey(vp);
            if (subKey) {
              const saved = auxScrollMemory.get(subKey);
              if (saved && saved.atBottom === false) continue;
            }
            if ((vp.scrollHeight || 0) > (vp.clientHeight || 0)) {
              const st = stickyState.get(vp);
              if (st) st.pinned = true;
              vp.scrollTop = Math.max(0, vp.scrollHeight - vp.clientHeight);
            }
          }
        }, ms));
      }
    }

    function resolveAuxScrollKey(vp) {
      if (!vp) return '';
      const subRoot = cl(vp, S_SUB);
      if (!subRoot) return '';
      const attrCid =
        ga(subRoot, 'data-cascade-id') ||
        ga(cl(vp, '[data-cascade-id]'), 'data-cascade-id') ||
        ga(qs(subRoot, '[data-cascade-id]'), 'data-cascade-id') ||
        '';
      if (attrCid && String(attrCid).trim()) return `sub:${String(attrCid).trim()}`;
      try {
        const fk = Object.keys(subRoot).find((k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
        for (let d = 0, f = fk ? subRoot[fk] : null; d < 14 && f; d++, f = f.return) {
          const p = f.memoizedProps;
          if (!p || typeof p !== 'object') continue;
          const id =
            (typeof p.cascadeId === 'string' && p.cascadeId) ||
            (typeof p.subagentCascadeId === 'string' && p.subagentCascadeId) ||
            (typeof p.conversationId === 'string' && p.conversationId) ||
            (typeof p.tabId === 'string' && p.tabId) ||
            (typeof p.tab?.id === 'string' && p.tab.id) ||
            '';
          if (id && id.trim()) return `sub:${id.trim()}`;
        }
      } catch {}
      const parentPrefix = lastCascadeId || String(win?.location?.pathname || '');
      const hdrCandidates = qa(subRoot, '[data-testid*="header"], h1, h2, h3, header, span');
      for (let i = 0; i < hdrCandidates.length; i++) {
        const h = hdrCandidates[i];
        if (!h || h === vp || vp.contains?.(h)) continue;
        const txt = String(h.textContent || '').replace(/\s+/g, ' ').trim();
        if (txt.length >= 2 && txt.length <= 80) {
          return `sub:${parentPrefix}:${txt}`;
        }
      }
      return `sub:${parentPrefix}:default`;
    }

    function saveAuxScroll(vp, force = false) {
      if (!vp) return;
      const key = resolveAuxScrollKey(vp);
      if (!key) return;
      const sh = vp.scrollHeight || 0;
      const ch = vp.clientHeight || 0;
      const top = vp.scrollTop || 0;
      const maxS = Math.max(0, sh - ch);
      if (!(ch > 0 && sh > ch)) return;
      const st = stickyState.get(vp);
      if (!force && top === 0 && auxScrollMemory.has(key) && st?.restoring) return;
      const entry = { scrollTop: top, scrollHeight: sh, atBottom: maxS - top <= 28, savedAt: Date.now() };
      if (auxScrollMemory.has(key)) auxScrollMemory.delete(key);
      else if (auxScrollMemory.size >= 32) {
        const oldest = auxScrollMemory.keys().next().value;
        if (oldest !== undefined) auxScrollMemory.delete(oldest);
      }
      auxScrollMemory.set(key, entry);
    }

    function cancelViewportRestore(vp) {
      const prev = vp ? auxScrollActiveRestore.get(vp) : null;
      if (typeof prev === 'function') {
        auxScrollActiveRestore.delete(vp);
        try { prev(); } catch {}
      }
    }

    function scheduleViewportScrollRestore(vp, targetTop, atBottom = false, targetSh = 0) {
      if (isDead() || !vp) return;
      cancelViewportRestore(vp);
      const st = stickyState.get(vp);
      if (st) st.restoring = true;
      let stopped = false;
      const timers = [];
      let rafId = 0;
      let settledTicks = 0;

      const cleanup = () => {
        if (stopped) return;
        stopped = true;
        while (timers.length) clearTimeout(timers.pop());
        if (rafId && win?.cancelAnimationFrame) {
          try { win.cancelAnimationFrame(rafId); } catch {}
          rafId = 0;
        }
        for (const ev of ['wheel', 'pointerdown', 'touchstart']) vp.removeEventListener?.(ev, onUserCancel);
        win?.removeEventListener?.('keydown', onUserCancel);
        auxScrollRestoreCleanups.delete(cleanup);
        if (auxScrollActiveRestore.get(vp) === cleanup) auxScrollActiveRestore.delete(vp);
        const curSt = stickyState.get(vp);
        if (curSt) curSt.restoring = false;
      };
      const onUserCancel = () => cleanup();

      auxScrollActiveRestore.set(vp, cleanup);
      auxScrollRestoreCleanups.add(cleanup);
      for (const ev of ['wheel', 'pointerdown', 'touchstart']) vp.addEventListener?.(ev, onUserCancel, { passive: true, once: true });
      win?.addEventListener?.('keydown', onUserCancel, { passive: true, once: true });

      const applyTick = (isSettledTick) => {
        if (stopped || isDead() || vp.isConnected === false) {
          cleanup();
          return;
        }
        const sh = vp.scrollHeight || 0;
        const ch = vp.clientHeight || 0;
        const maxS = Math.max(0, sh - ch);
        if (ch <= 0 || maxS <= 0) return;
        const nextTop = atBottom ? maxS : Math.min(targetTop, maxS);
        const curSt = stickyState.get(vp);
        if (curSt) {
          curSt.prog = true;
          curSt.pinned = Boolean(atBottom);
        }
        vp.scrollTop = nextTop;
        if (curSt) {
          curSt.lastTop = vp.scrollTop || nextTop;
          curSt.lastSh = sh;
          Promise.resolve().then(() => {
            if (curSt) curSt.prog = false;
          });
        }
        if (isSettledTick) settledTicks++;
        if (
          settledTicks >= 1 &&
          !atBottom &&
          targetSh > 0 &&
          sh >= targetSh - 32 &&
          Math.abs((vp.scrollTop || 0) - targetTop) <= 2
        ) {
          cleanup();
        }
      };

      applyTick(false);
      if (!stopped && typeof win?.requestAnimationFrame === 'function') {
        rafId = win.requestAnimationFrame(() => {
          rafId = 0;
          applyTick(true);
        });
      }
      const delays = [30, 110, 240, 460];
      for (let i = 0; i < delays.length; i++) {
        const isLast = i === delays.length - 1;
        timers.push(setTimeout(() => {
          applyTick(true);
          if (isLast) cleanup();
        }, delays[i]));
      }
    }

    function snapshotAndGuardScroll(targetEl) {
      if (isDead() || !doc) return false;
      const vp = cl(targetEl, S_VP) || (targetEl && qs(cl(targetEl, S_SUB) || cl(targetEl, S_CV), S_VP)) || findScrollViewport(targetEl);
      if (!vp) return false;
      if (cl(vp, S_SUB)) saveAuxScroll(vp, true);
      const origTop = vp.scrollTop || 0;
      const origSh = vp.scrollHeight || 0;
      const origCh = vp.clientHeight || 0;
      if (origTop <= 20) return true;
      const origAtBottom = Math.max(0, origSh - origCh) - origTop <= 28;
      let stopped = false;
      const timers = [];
      const stopGuard = () => {
        if (stopped) return;
        stopped = true;
        while (timers.length) clearTimeout(timers.pop());
        for (const ev of ['wheel', 'pointerdown', 'touchstart']) vp.removeEventListener?.(ev, stopGuard);
        win?.removeEventListener?.('keydown', stopGuard);
        auxScrollRestoreCleanups.delete(stopGuard);
      };
      auxScrollRestoreCleanups.add(stopGuard);
      for (const ev of ['wheel', 'pointerdown', 'touchstart']) vp.addEventListener?.(ev, stopGuard, { passive: true, once: true });
      win?.addEventListener?.('keydown', stopGuard, { passive: true, once: true });

      const checkGuard = (isLast) => {
        if (stopped || isDead()) {
          stopGuard();
          return;
        }
        if (vp.isConnected !== false && (vp.clientHeight || 0) > 0 && (vp.scrollTop || 0) === 0 && (vp.scrollHeight || 0) > (vp.clientHeight || 0)) {
          const maxS = Math.max(0, (vp.scrollHeight || 0) - (vp.clientHeight || 0));
          const st = stickyState.get(vp);
          if (st) st.prog = true;
          vp.scrollTop = origAtBottom ? maxS : Math.min(origTop, maxS);
          if (st) {
            st.lastTop = vp.scrollTop;
            st.pinned = origAtBottom;
            Promise.resolve().then(() => { st.prog = false; });
          }
        }
        if (isLast) stopGuard();
      };
      const guardDelays = [0, 40, 140, 320, 450];
      for (let i = 0; i < guardDelays.length; i++) {
        const isLast = i === guardDelays.length - 1;
        timers.push(setTimeout(() => checkGuard(isLast), guardDelays[i]));
      }
      return true;
    }

    if (win) {
      try { win.__agPrismPreserveScroll = snapshotAndGuardScroll; } catch {}
    }

    function bindStickyEl(el) {
      if (!el || stickyState.has(el)) return stickyState.get(el) || null;
      const subKey = resolveAuxScrollKey(el);
      const saved = subKey ? auxScrollMemory.get(subKey) : null;
      const st = {
        pinned: saved ? Boolean(saved.atBottom) : true,
        lastTop: el.scrollTop || 0,
        lastSh: el.scrollHeight || 0,
        lastCh: el.clientHeight || 0,
        prog: false,
        restoring: false,
        subKey,
      };
      stickyState.set(el, st);
      const onWheel = (ev) => {
        if (!ev) return;
        if (ev.deltaY < 0) st.pinned = false;
        else if (ev.deltaY > 0 && (el.scrollHeight || 0) - (el.clientHeight || 0) - (el.scrollTop || 0) <= 32) st.pinned = true;
      };
      const onScroll = () => {
        const cur = el.scrollTop || 0;
        if (!st.prog && !st.restoring) {
          const gap = Math.max(0, (el.scrollHeight || 0) - (el.clientHeight || 0) - cur);
          if (gap <= 28) st.pinned = true;
          else if (cur < st.lastTop - 6) st.pinned = false;
          if (st.subKey) saveAuxScroll(el, false);
        }
        st.lastTop = cur;
      };
      const onPtr = (ev) => {
        try {
          const r = el.getBoundingClientRect?.();
          if (r && ev.clientX > r.right - 22) st.lastTop = el.scrollTop || 0;
        } catch {}
      };
      el.addEventListener?.('wheel', onWheel, { passive: true });
      el.addEventListener?.('scroll', onScroll, { passive: true });
      el.addEventListener?.('pointerdown', onPtr, { passive: true });
      stickyUnsubs.push({
        el,
        unsub: () => {
          cancelViewportRestore(el);
          el.removeEventListener?.('wheel', onWheel);
          el.removeEventListener?.('scroll', onScroll);
          el.removeEventListener?.('pointerdown', onPtr);
          stickyState.delete(el);
        },
      });
      if (saved && (saved.scrollTop > 0 || saved.atBottom) && (el.scrollTop || 0) === 0) {
        scheduleViewportScrollRestore(el, saved.scrollTop, saved.atBottom, saved.scrollHeight);
      } else if (subKey && (el.clientHeight || 0) > 0 && (el.scrollHeight || 0) > (el.clientHeight || 0) && (el.scrollTop || 0) > 0) {
        saveAuxScroll(el, false);
      }
      return st;
    }

    function pinStickyBottom(el, force = false) {
      const st = bindStickyEl(el);
      if (!st || st.restoring) return;
      const sh = el.scrollHeight || 0,
        ch = el.clientHeight || 0,
        maxS = Math.max(0, sh - ch);
      if (force) st.pinned = true;
      if (st.pinned && maxS > 0 && (force || sh > st.lastSh)) {
        if (maxS - (el.scrollTop || 0) > 1) {
          st.prog = true;
          el.scrollTop = maxS;
          st.lastTop = el.scrollTop || maxS;
          Promise.resolve().then(() => { st.prog = false; });
        }
      }
      st.lastSh = sh;
    }

    function unpinStickyVp() {
      if (!doc) return;
      const vps = qa(doc, S_VP);
      const list = vps.length ? vps : [qs(doc, S_VP)].filter(Boolean);
      for (const vp of list) {
        const st = vp && stickyState.get(vp);
        if (st) st.pinned = false;
      }
    }

    function syncStickyStreamScroll() {
      if (isDead() || !doc) return;
      pruneUnsubs(stickyUnsubs, false);
      const vps = qa(doc, S_VP);
      const vpList = vps.length ? vps : [qs(doc, S_VP)].filter(Boolean);
      for (const vp of vpList) {
        const st = bindStickyEl(vp);
        if (!st) continue;
        const ch = vp.clientHeight || 0;
        const subKey = st.subKey || resolveAuxScrollKey(vp);
        if (subKey && !st.subKey) st.subKey = subKey;
        if (subKey && st.lastCh === 0 && ch > 0 && (vp.scrollTop || 0) === 0) {
          const saved = auxScrollMemory.get(subKey);
          if (saved && (saved.scrollTop > 0 || saved.atBottom)) {
            scheduleViewportScrollRestore(vp, saved.scrollTop, saved.atBottom, saved.scrollHeight);
          }
        }
        st.lastCh = ch;
        if (st.restoring) continue;
        if (subKey && ch > 0 && (vp.scrollHeight || 0) > ch && (vp.scrollTop || 0) > 0) {
          saveAuxScroll(vp, false);
        }
        pinStickyBottom(vp, false);
      }
      const btns = qa(doc, '[data-testid="worked-for-collapsible"][aria-expanded="true"]');
      let lastInner = null;
      for (let i = btns.length - 1; i >= 0; i--) {
        const nxt = btns[i].nextElementSibling;
        if (!nxt) continue;
        const cls = String(nxt.className || '');
        let isOv = cls.includes('overflow-y-auto');
        if (!isOv && win?.getComputedStyle) {
          try {
            const oy = win.getComputedStyle(nxt).overflowY;
            isOv = oy === 'auto' || oy === 'scroll';
          } catch {}
        }
        if (isOv) { lastInner = nxt; break; }
      }
      if (lastInner) pinStickyBottom(lastInner, false);
    }

    function cleanupStickyScroll() {
      pruneUnsubs(stickyUnsubs, true);
    }

    function runFastScrollToBottom(btnEl) {
      if (isDead() || !doc || !win) return false;
      const cfg = getConfig() || {};
      if (cfg.scrollBottomMotion === 'instant' || cfg.motionLevel === 'off' || win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
        return false;
      }
      const vp = qs(cl(btnEl, S_CV) || doc, S_VP) || qs(doc, S_VP);
      if (!vp) return false;
      const stPin = stickyState.get(vp);
      if (stPin) stPin.pinned = true;
      const maxS = Math.max(0, (vp.scrollHeight || 0) - (vp.clientHeight || 0)),
        start = vp.scrollTop || 0,
        dist = maxS - start;
      if (dist <= 24 || !win.requestAnimationFrame) {
        vp.scrollTop = maxS;
        return true;
      }
      cancelScrollGlide();
      const dur = Math.max(340, Math.min(540, Math.round(250 + Math.sqrt(dist) * 6.5)));
      const nowFn = typeof win.performance?.now === 'function' ? () => win.performance.now() : () => Date.now();
      const t0 = nowFn();
      sa(btnEl, 'data-ag-scrolling', '1');
      const stop = () => cancelScrollGlide();
      for (const ev of ['wheel', 'pointerdown', 'touchstart']) vp.addEventListener?.(ev, stop, { passive: true, once: true });
      win.addEventListener?.('keydown', stop, { passive: true, once: true });
      scrollGlideCleanup = () => {
        ra(btnEl, 'data-ag-scrolling');
        for (const ev of ['wheel', 'pointerdown', 'touchstart']) vp.removeEventListener?.(ev, stop);
        win.removeEventListener?.('keydown', stop);
      };
      stats.scrollGlideCount++;
      const step = () => {
        if (isDead()) return cancelScrollGlide();
        const t = Math.min(1, (nowFn() - t0) / dur),
          tgt = Math.max(0, (vp.scrollHeight || 0) - (vp.clientHeight || 0));
        vp.scrollTop = t < 1 ? start + (tgt - start) * (1 - Math.pow(1 - t, 3.6)) : tgt;
        if (t < 1) scrollGlideRaf = win.requestAnimationFrame(step);
        else cancelScrollGlide();
      };
      scrollGlideRaf = win.requestAnimationFrame(step);
      return true;
    }

    function syncSidebarOverflowTools() {
      if (isDead() || !doc) return;
      const nav = qs(doc, '[data-testid="sidebar-navigation-items"]');
      if (!nav) return;
      const items = Array.from(nav.children || []).filter((ch) => isElementLike(ch) && !ch.classList?.contains('ag-cs-sb-more-wrap'));
      const cfg = getConfig() || {};
      const on = cfg.sidebarRestyle !== false && cfg.sidebarNavFold === 'on',
        ov = on ? items.slice(1) : [];
      const AH = 'data-ag-sb-more-hidden',
        AI = 'data-ag-sb-more-item';
      if (!on || !ov.length) {
        const old = qs(nav, '.ag-cs-sb-more-wrap');
        if (old || items.some((x) => ha(x, AH) || ha(x, AI))) {
          mut(() => {
            for (const x of items) {
              if (ha(x, AH)) ra(x, AH);
              if (ha(x, AI)) ra(x, AI);
            }
            old?.remove();
          });
        }
        sidebarMoreBtn = null;
        if (!on) sidebarMoreExpanded = false;
        return;
      }
      mut(() => {
        for (let i = 0; i < items.length; i++) {
          const x = items[i];
          if (i === 0) {
            if (ha(x, AH)) ra(x, AH);
            if (ha(x, AI)) ra(x, AI);
          } else if (sidebarMoreExpanded) {
            if (ha(x, AH)) ra(x, AH);
            setA(x, AI, '1');
          } else {
            setA(x, AH, '1');
            if (ha(x, AI)) ra(x, AI);
          }
        }
        let wrap = qs(nav, '.ag-cs-sb-more-wrap');
        if (!wrap) {
          const btn = mk(
            'button',
            'ag-cs-sb-more-btn',
            null,
            mk('span', 'ag-cs-sb-more-lead', null, mkSvgIcon('moreDots', 14), mk('span', 'ag-cs-sb-more-lbl')),
            mk('span', 'ag-cs-sb-more-chev', null, mkSvgIcon('chevDown', 13))
          );
          btn.type = 'button';
          sa(btn, 'data-testid', 'ag-sidebar-more-toggle');
          btn.addEventListener('click', (e) => {
            e.preventDefault?.();
            e.stopPropagation?.();
            sidebarMoreExpanded = !sidebarMoreExpanded;
            syncSidebarOverflowTools();
          });
          wrap = markNoTr(mk('div', 'ag-cs-sb-more-wrap', null, btn));
          sa(wrap, 'data-ag-no-i18n', '');
          sa(wrap, 'data-ag-owned', '1');
          nav.appendChild(wrap);
          sidebarMoreBtn = btn;
        } else {
          sidebarMoreBtn = qs(wrap, '.ag-cs-sb-more-btn');
        }
        if (sidebarMoreBtn) {
          setA(sidebarMoreBtn, 'aria-expanded', sidebarMoreExpanded ? 'true' : 'false');
          const lbl = qs(sidebarMoreBtn, '.ag-cs-sb-more-lbl');
          if (lbl) {
            const txt = sidebarMoreExpanded ? getUiText('sidebarLessLabel', 'Less') : `${getUiText('sidebarMoreLabel', 'More')} (${ov.length})`;
            if (lbl.textContent !== txt) lbl.textContent = txt;
          }
        }
      });
    }

    function shouldAnimateNonDiff() {
      if (!win?.requestAnimationFrame || !doc?.getElementById) return false;
      if (!doc.getElementById('ag-prism-css') && !doc.getElementById('prism-style')) return false;
      if ((getConfig() || {}).motionLevel === 'off' || ga(doc.documentElement, 'data-ag-cs-motion') === 'off') return false;
      return !win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    }

    function findQueuedMessageRow(btn, card) {
      let cur = btn?.parentElement;
      for (let d = 0; d < 6 && cur && cur !== card; d++, cur = cur.parentElement) {
        if (qs(cur, '[data-testid="queued-messages-expand-button"]')) return null;
        const tid = ga(cur, 'data-testid') || '';
        if (tagU(cur) === 'LI' || (tid.includes('queued-message') && tid !== 'queued-messages-card')) return cur;
        if (Array.from(cur.children || []).some((k) => isElementLike(k) && k !== btn && !k.contains?.(btn) && tagU(k) !== 'BUTTON')) {
          return cur;
        }
      }
      const fb = btn?.parentElement;
      return fb && fb !== card && !qs(fb, '[data-testid="queued-messages-expand-button"]') ? fb : null;
    }

    function triggerQueuedRowActionFeedback(btn, card) {
      if (isDead() || !btn || !card || ga(btn, 'data-testid') === 'queued-messages-expand-button') return false;
      const meta = `${ga(btn, 'data-testid') || ''} ${ga(btn, 'aria-label') || ''} ${ga(btn, 'title') || ''}`;
      if (!/send|delete|remove|trash|发送|發送|删除|刪除|送信|削除|전송|삭제/i.test(meta) && /\bedit\b|编辑|編輯|編集|수정/i.test(meta)) {
        return false;
      }
      if (
        (getConfig() || {}).motionLevel === 'off' ||
        ga(doc?.documentElement, 'data-ag-cs-motion') === 'off' ||
        win?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
      ) {
        return false;
      }
      const row = findQueuedMessageRow(btn, card);
      if (!row) return false;
      if (row._agQueuedActTimer) {
        clearTimeout(row._agQueuedActTimer);
        nonDiffAnimTimers.delete(row._agQueuedActTimer);
      }
      mut(() => setA(row, 'data-ag-queued-act', '1'));
      const tid = setTimeout(() => {
        nonDiffAnimTimers.delete(tid);
        row._agQueuedActTimer = 0;
        if (!isDead() && row.isConnected !== false && ha(row, 'data-ag-queued-act')) mut(() => ra(row, 'data-ag-queued-act'));
      }, 220);
      row._agQueuedActTimer = tid;
      nonDiffAnimTimers.add(tid);
      return true;
    }

    function clearOvSecTimers(secEl) {
      if (!secEl) return;
      for (const k of ['_agOvCloseTimer', '_agOvOpenTimer']) {
        if (secEl[k]) {
          clearTimeout(secEl[k]);
          nonDiffAnimTimers.delete(secEl[k]);
          secEl[k] = 0;
        }
      }
      if (secEl._agOvOpenRaf) {
        try {
          win?.cancelAnimationFrame?.(secEl._agOvOpenRaf);
        } catch {}
        ovSecAnimRafs.delete(secEl._agOvOpenRaf);
        secEl._agOvOpenRaf = 0;
      }
    }

    function setOvSecSiblingsAnim(secEl, btn, mode) {
      let applied = false;
      mut(() => {
        for (const ch of secEl?.children || []) {
          if (!ch || ch === btn) continue;
          if (mode) {
            sa(ch, 'data-ag-ov-sec-anim', mode);
            applied = true;
          } else if (ha(ch, 'data-ag-ov-sec-anim')) {
            ra(ch, 'data-ag-ov-sec-anim');
          }
        }
      });
      return applied;
    }

    function scheduleOvSecOpenCleanup(secEl, btn) {
      if (secEl._agOvOpenTimer) {
        clearTimeout(secEl._agOvOpenTimer);
        nonDiffAnimTimers.delete(secEl._agOvOpenTimer);
      }
      const tid = setTimeout(() => {
        nonDiffAnimTimers.delete(tid);
        secEl._agOvOpenTimer = 0;
        if (isDead() || secEl.isConnected === false || ga(secEl, A_OVC) === '1') return;
        mut(() => {
          for (const ch of secEl.children || []) {
            if (ch && ch !== btn && ga(ch, 'data-ag-ov-sec-anim') === 'open') ra(ch, 'data-ag-ov-sec-anim');
          }
        });
      }, 165);
      secEl._agOvOpenTimer = tid;
      nonDiffAnimTimers.add(tid);
    }

    function handleOverviewSectionClick(ev) {
      const btn = cl(ev.target, 'button');
      if (!btn || ga(btn, 'data-testid') === 'overview-panel-customize-trigger' || ga(btn, 'aria-haspopup') === 'menu') return false;
      const secEl = btn.parentElement;
      if (!secEl?.classList?.contains?.('p-1') || secEl.firstElementChild !== btn || !cl(secEl, '[data-testid="overview-panel"]')) return false;

      if (secEl._agOvBypassClick) {
        secEl._agOvBypassClick = false;
        return true;
      }
      if (!shouldAnimateNonDiff()) {
        if (ga(secEl, A_OVC) === '1') {
          clearOvSecTimers(secEl);
          mut(() => ra(secEl, A_OVC));
          setOvSecSiblingsAnim(secEl, btn, null);
        }
        return false;
      }

      if ((secEl.children?.length || 0) > 1) {
        ev.preventDefault?.();
        ev.stopImmediatePropagation?.();
        clearOvSecTimers(secEl);
        if (ga(secEl, A_OVC) === '1') {
          mut(() => ra(secEl, A_OVC));
          if (setOvSecSiblingsAnim(secEl, btn, 'open')) scheduleOvSecOpenCleanup(secEl, btn);
          return true;
        }
        mut(() => sa(secEl, A_OVC, '1'));
        setOvSecSiblingsAnim(secEl, btn, 'closing');
        const closeTid = setTimeout(() => {
          nonDiffAnimTimers.delete(closeTid);
          secEl._agOvCloseTimer = 0;
          if (isDead() || secEl.isConnected === false) return;
          mut(() => {
            if (ha(secEl, A_OVC)) ra(secEl, A_OVC);
          });
          setOvSecSiblingsAnim(secEl, btn, null);
          secEl._agOvBypassClick = true;
          try {
            if (btn.isConnected !== false) btn.click?.();
          } finally {
            secEl._agOvBypassClick = false;
          }
        }, 130);
        secEl._agOvCloseTimer = closeTid;
        nonDiffAnimTimers.add(closeTid);
        return true;
      }

      clearOvSecTimers(secEl);
      const tryOpen = (allowRaf) => {
        if (isDead() || secEl.isConnected === false || ga(secEl, A_OVC) === '1') return;
        if ((secEl.children?.length || 0) > 1) {
          if (setOvSecSiblingsAnim(secEl, btn, 'open')) scheduleOvSecOpenCleanup(secEl, btn);
          return;
        }
        if (allowRaf && typeof win?.requestAnimationFrame === 'function') {
          const rid = win.requestAnimationFrame(() => {
            ovSecAnimRafs.delete(rid);
            if (secEl._agOvOpenRaf === rid) secEl._agOvOpenRaf = 0;
            tryOpen(false);
          });
          secEl._agOvOpenRaf = rid;
          ovSecAnimRafs.add(rid);
        }
      };
      Promise.resolve().then(() => tryOpen(true));
      return true;
    }

    function schedNonDiffTimer(fn, ms) {
      const tid = setTimeout(() => {
        nonDiffAnimTimers.delete(tid);
        if (!isDead()) fn();
      }, ms);
      nonDiffAnimTimers.add(tid);
      return tid;
    }

    function onDocClickCapture(ev) {
      try {
        const t = ev?.target;
        if (isDead() || !t?.closest) return;
        const subRoot = cl(t, S_SUB);
        if (subRoot) {
          const subVp = cl(t, S_VP) || qs(subRoot, S_VP);
          if (subVp) saveAuxScroll(subVp, true);
        }
        const clickedCv = cl(t, S_CV);
        if (isFormalConv(clickedCv)) cachedConvView = clickedCv;
        const pt = cl(t, '[data-testid="permissions-selector-trigger"]');
        if (pt) {
          const dd = ga(pt, 'data-disabled');
          if (pt.disabled || ha(pt, 'disabled') || ga(pt, 'aria-disabled') === 'true' || (dd != null && dd !== 'false')) return;
          win?.requestAnimationFrame?.(() => {
            if (!isDead()) syncPermissionsMenuState();
          });
          schedNonDiffTimer(syncPermissionsMenuState, 20);
          schedNonDiffTimer(syncPermissionsMenuState, 90);
          return;
        }
        const sb = cl(t, '.agy-scroll-bottom');
        if (sb) {
          if (runFastScrollToBottom(sb)) {
            ev.preventDefault?.();
            ev.stopPropagation?.();
          }
          return;
        }
        if (handleOverviewSectionClick(ev)) return;
        const qb = cl(t, 'button'),
          qc = cl(qb, '[data-testid="queued-messages-card"]');
        if (qb && qc) return triggerQueuedRowActionFeedback(qb, qc);
        const dh = cl(t, '[data-ag-cs-settings-dlg="1"] button, [role="dialog"] button, [role="dialog"] [role="tab"]');
        if (dh && !cl(dh, '#ag-cs-settings-sec')) {
          win?.requestAnimationFrame?.(() => {
            if (!isDead()) syncSettingsDialogChrome(doc, mut, setA);
          });
          schedNonDiffTimer(() => syncSettingsDialogChrome(doc, mut, setA), 36);
        }
      } catch {}
    }

    function onWinKeyDown(ev) {
      try {
        if (isDead() || !ev) return;
        if (ev.key === 'Escape') {
          if (win?.__agPrismInlineDiff?.closeMenuIfOpen?.()) return;
          if (outlineOpen) return closeNavOutline();
        }
        if (
          ev.altKey &&
          !ev.ctrlKey &&
          !ev.metaKey &&
          !ev.shiftKey &&
          (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') &&
          !isEditableElement(ev.target)
        ) {
          if (jumpUserTurn(ev.key === 'ArrowUp' ? -1 : 1, ev.target)) ev.preventDefault?.();
        }
      } catch {}
    }

    if (win && typeof win.addEventListener === 'function') {
      win.addEventListener('click', onDocClickCapture, true);
      win.addEventListener('keydown', onWinKeyDown);
    }

    // ── Public Lifecycle API ───────────────────────────────────────────────
    function sync(flags = null) {
      if (isDead()) return;
      const hasFlags = Boolean(flags && typeof flags === 'object');
      const isFull =
        !hasFlags ||
        Boolean(flags.f) ||
        (!flags.g && !flags.o && !flags.s && !flags.c && !flags.t && !flags.l && !flags.b && !flags.r);
      const curLang = String(getLang() || '');
      const langChanged = Boolean(lastSyncedLang && curLang !== lastSyncedLang);
      lastSyncedLang = curLang;
      if (isFull || flags.c || flags.l || flags.r || flags.s) syncCascadeChange(true);
      if (isFull || flags.t || flags.r || flags.l) syncSidecarThemeBridge(false);
      if (isFull || flags.c || flags.l || flags.b || flags.r || flags.t || langChanged) {
        syncCodeBlocks();
        syncNavRails();
        syncStickyStreamScroll();
      }
      if (isFull || flags.o || flags.c || flags.l || flags.b || flags.r || flags.t || langChanged) {
        syncSubagentRunningAmbient();
      }
      if (isFull || flags.s || flags.r || flags.t || langChanged) {
        syncSidebarOverflowTools();
      }
      if (isFull || flags.o || flags.c || flags.b || flags.r) {
        syncPermissionsMenuState();
      }
      if (isFull || flags.g || flags.o || flags.r) {
        syncSettingsDialogChrome(doc, mut, setA);
      }
      if (isFull || flags.c || flags.l || flags.b || flags.r || flags.t || langChanged) {
        try {
          win?.__agPrismInlineDiff?.sync?.(getConfig(), {
            t: tFn,
            getLang,
            runGuardedMut: mut,
            setAttrIfChanged: setA,
          });
        } catch {}
      }
      if (langChanged) {
        refreshCodeFoldLabels();
        refreshOutlineLocaleTexts();
      }
    }

    function destroy() {
      if (localDestroyed) return;
      localDestroyed = true;
      cancelFoldRaf();
      cancelHideOutlineTimer();
      cancelScrollGlide();
      cancelOpenScroll();
      for (const fn of Array.from(auxScrollRestoreCleanups)) {
        try { fn(); } catch {}
      }
      auxScrollRestoreCleanups.clear();
      auxScrollMemory.clear();
      if (win && win.__agPrismPreserveScroll === snapshotAndGuardScroll) {
        try { delete win.__agPrismPreserveScroll; } catch { try { win.__agPrismPreserveScroll = undefined; } catch {} }
      }
      cleanupStickyScroll();
      if (foldFeedbackTimer) {
        clearTimeout(foldFeedbackTimer);
        foldFeedbackTimer = 0;
      }
      for (const tid of sonarTimers) clearTimeout(tid);
      sonarTimers.clear();
      for (const tid of nonDiffAnimTimers) clearTimeout(tid);
      nonDiffAnimTimers.clear();
      if (typeof win?.cancelAnimationFrame === 'function') {
        for (const rid of ovSecAnimRafs) {
          try {
            win.cancelAnimationFrame(rid);
          } catch {}
        }
      }
      ovSecAnimRafs.clear();

      try {
        win?.__agPrismInlineDiff?.unbindHooks?.();
      } catch {}

      if (win && typeof win.removeEventListener === 'function') {
        try {
          win.removeEventListener('click', onDocClickCapture, true);
          win.removeEventListener('keydown', onWinKeyDown);
        } catch {}
      }
      pruneUnsubs(iframeUnsubscribers, true, boundIframes);
      iframeSizeCache = new WeakMap();
      try {
        iframeRo?.disconnect?.();
      } catch {}
      iframeRo = null;
      pruneUnsubs(navRailUnsubscribers, true, boundNavRails);
      lastOutlineStructSig = '';
      lastOutlineActiveIdx = -1;
      activeOutlineBtn = null;
      outlineItemBtnByIdx.clear();

      if (doc && typeof doc.querySelectorAll === 'function') {
        mut(() => {
          for (const sel of ['.ag-cs-code-fold-btn', '.ag-cs-nav-outline-popover', '.ag-cs-nav-outline-trigger', '.ag-cs-sb-more-wrap']) {
            qa(doc, sel).forEach((n) => n.remove());
          }
          for (const k of 'cs-code-folded|cs-code-sticky|perm-selected|perm-sandbox-sep|sub-running|sub-sec-running|overview-running|sp-running|sb-more-hidden|sb-more-item|scrolling|ov-sec-anim|cs-settings-dlg|cs-settings-nav|cs-nav-active'.split(
            '|'
          )) {
            const a = 'data-ag-' + k;
            qa(doc, `[${a}]`).forEach((el) => ra(el, a));
          }
          qa(doc, '[data-ag-queued-act]').forEach((el) => {
            ra(el, 'data-ag-queued-act');
            delete el._agQueuedActTimer;
          });
          qa(doc, '[data-ag-ov-sec-closing]').forEach((el) => {
            ra(el, 'data-ag-ov-sec-closing');
            delete el._agOvBypassClick;
            delete el._agOvCloseTimer;
            delete el._agOvOpenTimer;
            delete el._agOvOpenRaf;
          });
        });
      }
      outlinePopover = null;
      outlineSearchInput = null;
      outlineListEl = null;
      outlineTitleEl = null;
      outlineFoldBtn = null;
      sidebarMoreBtn = null;
      sidebarMoreExpanded = false;
      activeNavRail = null;
      cachedConvView = null;
      outlineOpen = false;
      lastCascadeId = '';
      cachedThemeSample = null;
      cachedAttrKey = '';
    }

    return {
      sync,
      onThemeChange,
      jumpUserTurn,
      foldHistoricalSteps,
      openNavOutline,
      closeNavOutline,
      toggleInlineDiffPreview: (...a) => win?.__agPrismInlineDiff?.toggleInlineDiffPreview?.(...a) ?? false,
      runFastScrollToBottom,
      syncSidebarOverflowTools,
      getDebugState: () => ({
        ...stats,
        inlineDiffToggleCount: win?.__agPrismInlineDiff?.getDebugState?.()?.inlineDiffToggleCount ?? 0,
        outlineOpen,
        lastCascadeId,
        sidebarMoreExpanded,
        cachedThemeSig: cachedThemeSample?.sig || null,
      }),
      destroy,
    };
  }

  const api = {
    MIN_CODE_FOLD_LINES,
    SIDECAR_THEME_VARS,
    syncSettingsDialogChrome,
    createHostEnhancerController,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  G.__agPrismHostEnhancer = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);

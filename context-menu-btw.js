// Obsidian Prism — /btw Side Chat & Curated Context Menu (context-menu-btw.js)
(function (root) {
  'use strict';
  const G = root || (typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : null);
  if (!G) return;

  const NS = 'http://www.w3.org/2000/svg';
  const NO_TR_S = 'translate=no,data-no-translate=true,data-ag-localization-skip=true,data-agy-no-translate=true,data-antigravity-zh-skip=1';
  const CMDS = new Set(['/compact', '/learn', '/grill-me', '/plan']);
  const CONV = '[data-testid="conversation-view"]';
  const BOX = '[data-testid="agent-input-box"]';
  const CE = '[contenteditable="true"]';
  const SA = '[data-side-panel-focus-scope="true"]';
  const SB = '[data-testid="side-question-panel"]';
  const SIDE = SA + ',' + SB;
  const SIDE_IN = SA + ' ' + CE + ',' + SB + ' ' + CE;
  const EDIT = BOX + ',' + CE + ',input,textarea,select,[role="textbox"],.monaco-editor,.cm-editor';
  const EXCL = EDIT + ',a[href],button,[role="button"],aside,[data-testid="conversation-row-sidebar"],[data-testid="diff-line-count"],[data-ag-diff-chip="1"],' + SIDE + ',[role="dialog"],[role="menu"],.ag-cs-ctx-menu,.ag-cs-diff-ctx-menu,.ag-omni-menu,#ag-prism-settings-sec,#ag-cs-settings-sec,.ces-set,.agy-overlay,[data-ag-zh-widget],.ag-zh-widget,#ag-zh-panel,[data-testid="host-i18n-widget"],img,video,audio,canvas,iframe,.agy-selection-pill';
  const SLASH = '[id^="typeahead-item-"][role="option"],[role="listbox"] [role="option"],[data-testid="slash-command-menu"] [role="option"]';
  const SEND = '[data-testid="input-send-button"],[data-testid="send-button"],' + BOX + ' button[type="submit"]';

  // [copy, btw, plan, compact, learn, grill-me]
  const ICONS = [
    'M5 5h8v9H5zM3 11V3h8',
    'M2 3h12v8H6l-3 3v-3H2zM10 3v8',
    'M3 4h1M6 4h7M3 8h1M6 8h7M3 12h1M6 12h5',
    'M3 8h10M8 2v4L6 4m2 2 2-2M8 14v-4l-2 2m2-2 2 2',
    'M8 2l1.5 4.5L14 8l-4.5 1.5L8 14l-1.5-4.5L2 8l4.5-1.5z',
    'M2 3h8v6H5l-2 2V9H2zM10 6h4v6h-1v2l-2-2H7v-1',
  ];

  // 8 语种：[copy, copied, btwPlain, btwSel, planSel, compact, learn, grill, draftBusy, noConv, noComposer, hintSuffix]
  const I18N = {
    'zh-CN': '复制|已复制|打开侧边会话|侧边追问选区|基于选区规划|压缩上下文|沉淀经验规则|对齐访谈|主框有草稿，请先发送或清空|请先打开会话|未找到主框|右键：原生菜单',
    'zh-TW': '複製|已複製|開啟側邊會話|側邊追問選區|依選區規劃|壓縮上下文|沉澱經驗規則|對齊訪談|主框有草稿，請先送出或清空|請先開啟會話|找不到主框|右鍵：原生選單',
    en: 'Copy|Copied|Open side chat|Ask /btw on selection|Plan selection|Compact context|Capture learnings|Grill-me alignment|Draft in composer; send or clear first|Open a conversation first|Composer not found|Right-click: native',
    ja: 'コピー|コピー済|サイド会話を開く|選択をサイド質問|選択から計画|コンテキスト圧縮|学び・ルール保存|対話アライメント|下書きあり。先に送信か消去を|先に会話を開いてください|入力欄が見つかりません|右クリック：標準',
    ko: '복사|복사됨|사이드 채팅 열기|선택 영역 /btw 질문|선택 영역 계획|컨텍스트 압축|학습 규칙 저장|인터뷰 정렬|입력창에 초안이 있습니다. 먼저 전송하거나 비우세요|먼저 대화를 여세요|입력창을 찾을 수 없습니다|우클릭: 기본 메뉴',
    es: 'Copiar|Copiado|Abrir chat lateral|Preguntar /btw sobre selección|Planificar selección|Compactar contexto|Guardar aprendizajes|Alineación grill-me|Hay un borrador; envía o limpia primero|Abre una conversación primero|No se encontró el editor|Clic derecho: menú nativo',
    fr: 'Copier|Copié|Ouvrir le chat latéral|Demander /btw sur la sélection|Planifier la sélection|Compacter le contexte|Enregistrer les acquis|Alignement grill-me|Brouillon en cours ; envoyez ou effacez d’abord|Ouvrez d’abord une conversation|Zone de saisie introuvable|Clic droit : menu natif',
    de: 'Kopieren|Kopiert|Seitenchat öffnen|/btw zur Auswahl fragen|Auswahl planen|Kontext komprimieren|Erkenntnisse speichern|Grill-me-Abgleich|Entwurf vorhanden; zuerst senden oder leeren|Bitte zuerst ein Gespräch öffnen|Eingabefeld nicht gefunden|Rechtsklick: Nativ',
  };
  for (const k in I18N) I18N[k] = I18N[k].split('|');

  const safe = (f) => { try { return f(); } catch {} };
  const stop = (e) => { e?.preventDefault?.(); e?.stopPropagation?.(); };
  const isFld = (e) => /^(INPUT|TEXTAREA)$/i.test(e?.tagName || '');
  const rLang = (r) => {
    const s = String(r || '').trim().toLowerCase().replace(/_/g, '-');
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
  const sa = (el, o) => { if (el?.setAttribute) for (const k in o) el.setAttribute(k, o[k]); return el; };
  const noTr = (el) => {
    if (el?.setAttribute) {
      for (const s of NO_TR_S.split(',')) { const p = s.split('='); el.setAttribute(p[0], p[1]); }
      el.setAttribute('data-ag-no-i18n', '1');
    }
    return el;
  };
  const clip = (r, m = 8000, q) => {
    let t = String(r ?? '').replace(/\r\n?/g, '\n').trim();
    if (q) t = t.replace(/\n{3,}/g, '\n\n');
    return t.length > m ? t.slice(0, q ? m - 3 : m) + (q ? '...' : '') : t;
  };
  const toEl = (n) => (n?.nodeType === 1 || typeof n?.tagName === 'string' ? n : n?.parentElement || null);

  function createContextMenuController(env = {}) {
    const doc = env.doc || G.document || null;
    const win = env.win || G.window || null;
    const nav = env.nav || win?.navigator || G.navigator || null;
    const W = win || G;
    const de = doc?.documentElement;
    const qs = (s, r = doc) => r?.querySelector?.(s) || null;
    const qa = (s, r = doc) => r?.querySelectorAll?.(s) || [];
    const getSel = () => win?.getSelection?.() || doc?.getSelection?.();
    const stepMs = env.stepDelayMs >= 0 ? +env.stepDelayMs : 40;
    const toastMs = env.toastDurationMs >= 100 ? +env.toastDurationMs : 2600;
    const setT = env.setTimeout || ((f, m) => W.setTimeout(f, m));
    const clrT = env.clearTimeout || ((i) => W.clearTimeout(i));
    const reqRaf = env.requestAnimationFrame || (win?.requestAnimationFrame && ((f) => win.requestAnimationFrame(f)));
    const cxlRaf = env.cancelAnimationFrame || (win?.cancelAnimationFrame && ((i) => win.cancelAnimationFrame(i)));

    let enabled = env.enabled !== false;
    let destroyed = false;
    let bound = false;
    let openBound = false;
    let slashBusy = false;
    const autoLang = (fb = 'en') => {
      const attr = de?.getAttribute?.('data-ag-cs-lang');
      return rLang((attr && attr !== 'auto' ? attr : '') || de?.lang || nav?.language || fb);
    };
    let lang = env.lang && env.lang !== 'auto' ? rLang(env.lang) : autoLang('en');
    let motionLevel = String(env.motionLevel || de?.getAttribute?.('data-ag-cs-motion') || 'ultra');
    let menuEl = null;
    let toastEl = null;
    let toastTid = null;
    let curSel = '';
    let items = [];
    let activeIdx = -1;
    let lastPos = null;
    let rawPos = null;
    const clean = new Set();

    const P = () => I18N[lang] || I18N.en;
    const fail = (reason, ex) => ({ ok: false, reason, ...ex });
    const inSide = (el) => !!el?.closest?.(SIDE);
    const defer = (fn, ms) => {
      let c;
      const isRaf = ms < 0 && reqRaf;
      const run = () => { clean.delete(c); if (!destroyed) fn(); };
      const id = isRaf ? reqRaf(run) : setT(run, ms < 0 ? Math.min(16, stepMs) : ms);
      clean.add(c = () => (isRaf ? cxlRaf?.(id) : clrT(id)));
      return c;
    };
    const waitStep = () => new Promise((r) => {
      let c;
      const id = setT(() => { clean.delete(c); r(); }, stepMs);
      clean.add(c = () => { clrT(id); r(); });
    });

    const clearToast = () => {
      if (toastTid) { safe(toastTid); clean.delete(toastTid); toastTid = null; }
      safe(() => toastEl?.remove());
      toastEl = null;
    };

    const showToast = (msg, tone = 'info') => {
      if (destroyed || !doc?.body || !msg) return;
      clearToast();
      const el = sa(noTr(doc.createElement('div')), { class: 'ag-cs-ctx-toast', role: 'status', 'aria-live': 'polite', 'data-tone': tone });
      el.textContent = String(msg);
      doc.body.appendChild(el);
      toastEl = el;
      toastTid = defer(() => { toastTid = null; if (toastEl === el) { safe(() => el.remove()); toastEl = null; } }, toastMs);
    };

    // 两阶段 Fiber 探测：Phase 1 沿 .return 向上直达根节点 O(depth)，Phase 2 从根向下 BFS 兜底
    const findStore = () => safe(() => {
      if (!doc) return null;
      const pick = (f) => [f?.memoizedProps?.value?.store, f?.pendingProps?.value?.store, f?.memoizedProps?.store].find((s) => s?.dispatch && s?.getState);
      const seen = new WeakSet();
      const q = [];
      const add = (x) => { if (x && typeof x === 'object' && !seen.has(x)) { seen.add(x); q.push(x); } };
      for (const r of [qs(CONV), doc.getElementById?.('root'), doc.body?.firstElementChild, doc.body]) {
        if (!r) continue;
        for (const k of Object.keys(r)) {
          if (!k.startsWith('__reactFiber$') && !k.startsWith('__reactContainer$')) continue;
          const v = r[k];
          for (const s0 of [v?.current, v?.stateNode?.current, v]) {
            if (!s0 || typeof s0 !== 'object') continue;
            for (let c = s0, d = 0; c && d < 512 && !seen.has(c); c = c.return, d++) {
              seen.add(c);
              const st = pick(c);
              if (st) return st;
              if (c === s0) { add(c.child); add(c.sibling); }
            }
          }
        }
      }
      for (let i = 0; i < q.length && i < 6000; i++) {
        const f = q[i];
        const st = pick(f);
        if (st) return st;
        add(f.child);
        add(f.sibling);
      }
      return null;
    }) || null;

    const getCascadeId = () => {
      const m = String((env.loc || win?.location || G.location)?.pathname || '').match(/\/c\/([^/?#]+)/);
      if (m?.[1]) return safe(() => decodeURIComponent(m[1])) || m[1];
      const row = qs('[data-testid="conversation-row-sidebar"][data-selected="true"]');
      return String(row?.getAttribute?.('data-cascade-id') || row?.dataset?.cascadeId || '').trim();
    };

    const edTxt = (ed) => String(isFld(ed) ? (ed.value ?? '') : (ed.textContent ?? '')).replace(/\u200B/g, '').trim();

    const findEmptyComposer = (ex) => {
      const ed = [
        qs(BOX + ' ' + CE + ',' + BOX + ' textarea'),
        qs(CE, doc?.getElementById?.('antigravity.agentSidePanelInputBox')),
        safe(() => qs('#antigravity\\.agentSidePanelInputBox ' + CE)),
      ].find((el) => el && !inSide(el));
      if (!ed) { showToast(P()[10], 'warn'); return { err: fail('no-composer', ex) }; }
      if (edTxt(ed)) { showToast(P()[8], 'warn'); return { err: fail('draft-not-empty', ex) }; }
      return { ed };
    };

    const fireEvt = (ed, ctor, type, init) => {
      if (!ed?.dispatchEvent) return;
      const C = win?.[ctor] || G[ctor];
      let ev = C && safe(() => new C(type, init));
      if (!ev) {
        const E = win?.Event || G.Event;
        ev = (E && safe(() => new E(type, init))) || { type };
        for (const k in init) if (!(k in ev)) safe(() => (ev[k] = init[k]));
      }
      safe(() => ed.dispatchEvent(ev));
    };

    const insertText = (ed, text) => {
      if (!ed || !text) return;
      safe(() => ed.focus?.());
      let emit = 0;
      if (isFld(ed)) {
        const v = String(ed.value || '') + text, p = W['HTML' + (/^I/i.test(ed.tagName) ? 'Input' : 'TextArea') + 'Element']?.prototype;
        if (!safe(() => (Object.getOwnPropertyDescriptor(p, 'value').set.call(ed, v), 1))) ed.value = v;
        emit = 1;
      } else {
        safe(() => {
          const s = getSel();
          if (s?.removeAllRanges && doc?.createRange) {
            const r = doc.createRange(); r.selectNodeContents(ed); r.collapse(false); s.removeAllRanges(); s.addRange(r);
          }
        });
        if (safe(() => doc?.execCommand?.('insertText', false, text)) !== true) {
          ed.textContent = String(ed.textContent || '') + text;
          emit = 1;
        }
      }
      if (emit) fireEvt(ed, 'InputEvent', 'input', { bubbles: true, inputType: 'insertText', data: text });
    };

    const triggerBtw = (selectedText = '') => {
      if (destroyed) return fail('destroyed');
      const text = clip(selectedText);
      const store = findStore();
      const tryBtn = () => {
        const b = text && qs('[data-testid="selection-btw-button"]');
        return b?.click && safe(() => (b.click(), 1)) ? { ok: true, mode: 'native-button', quoted: true } : null;
      };
      if (store) {
        const cascadeId = getCascadeId();
        if (!cascadeId) return tryBtn() || (showToast(P()[9], 'warn'), fail('no-cascade-id', { mode: 'no-conversation' }));
        const ps = { kind: 'cascadeId', cascadeId };
        const pl = { panelScope: ps, content: { type: 'sideQuestionView', sideQuestionView: {} }, tabId: 'side_question__draft' };
        const hasGet = typeof store.getState === 'function';
        const s0 = hasGet ? safe(() => store.getState()) : null;
        let dispatched = 0;
        for (const [type, payload] of [
          ['sidePanelV2/setContent', pl],
          ['sidePanel/setContent', pl],
          ['sidePanel/setSidePanelOpen', { panelScope: ps, isOpen: true }],
          ...(text ? [['sideQuestion/enqueueDraftSideQuestionQuote', { parentCascadeId: cascadeId, text }]] : []),
        ]) if (safe(() => (store.dispatch({ type, payload }), 1))) dispatched++;
        if (dispatched > 0 && (!hasGet || safe(() => store.getState()) !== s0 || qs(SIDE))) {
          const foc = () => { const el = qs(SIDE_IN); return !!(el?.focus && (safe(() => el.focus()), 1)); };
          defer(() => { if (!foc()) defer(foc, -1); }, -1);
          return { ok: true, mode: 'redux', cascadeId, quoted: !!text };
        }
      }
      const nb = tryBtn();
      if (nb) return nb;
      const { ed, err } = findEmptyComposer({ mode: 'fallback-composer' });
      if (err) return err;
      insertText(ed, text ? '/btw ' + clip(text, 1200, 1) : '/btw ');
      return { ok: true, mode: 'fallback-composer', quoted: !!text };
    };

    const triggerSlashCommand = async (cmd, selectedText = '') => {
      if (destroyed) return fail('destroyed');
      const raw = String(cmd || '').trim().toLowerCase();
      const norm = raw.startsWith('/') ? raw : '/' + raw;
      if (norm === '/btw') return triggerBtw(selectedText);
      const cx = { command: norm };
      if (!CMDS.has(norm)) return fail('unsupported-command', cx);
      if (slashBusy) return fail('busy', cx);
      slashBusy = true;
      try {
        const { ed, err } = findEmptyComposer(cx);
        if (err) return err;
        const startCid = getCascadeId();
        const guard = () => (destroyed ? fail('destroyed', cx) : ed.isConnected === false || (startCid && getCascadeId() !== startCid) ? fail('session-changed', cx) : null);

        const quote = norm === '/compact' ? '' : clip(selectedText, 1200, 1);
        insertText(ed, norm);

        // 最多 10 轮短探测原生斜杠菜单（兼容 v2.34 typeahead-item-* 无前导 / 的 label 与旧版 listbox，命中即停）
        const bare = norm.slice(1);
        const re = new RegExp('(?:^|\\s)/?' + bare.replace('-', '\\-') + '(?:\\s|$)', 'i');
        let opt = null, pickEl = null;
        for (let t = 0; t < 10 && !opt; t++) {
          await waitStep();
          const ab = guard();
          if (ab) return ab;
          for (const o of qa(SLASH)) {
            if (o.getAttribute?.('aria-disabled') === 'true' || qs('[data-testid="menu-category-row"],[aria-disabled="true"]', o)) continue;
            const le = qs('[data-testid="menu-option-label"]', o);
            if (le) {
              const lv = String(le.textContent || '').trim().toLowerCase();
              if (lv === bare || lv === norm) { opt = o; pickEl = le; break; }
              continue;
            }
            const lbl = String(o.textContent || o.getAttribute?.('data-value') || '').trim();
            if (re.test(lbl)) { opt = o; break; }
            if (!opt && lbl.toLowerCase().includes(norm)) opt = o;
          }
        }
        pickEl = pickEl || opt;
        const pickedFromMenu = !!pickEl?.click;
        if (pickedFromMenu) safe(() => pickEl.click());
        else {
          const cur = edTxt(ed).toLowerCase();
          if (cur.startsWith(norm) && cur.slice(norm.length).trimStart().startsWith(norm)) return fail('duplicate-command', cx);
        }

        if (quote) {
          if (pickedFromMenu) {
            await waitStep();
            const ab = guard();
            if (ab) return ab;
          }
          insertText(ed, '\n' + quote);
        }

        await waitStep();
        const ab = guard();
        if (ab) return ab;

        let sendBtn = null;
        for (const sc of [ed.closest?.(BOX), doc]) {
          for (const b of qa(SEND, sc)) {
            if (!inSide(b) && !b.disabled && b.getAttribute?.('aria-disabled') !== 'true' && !b.hasAttribute?.('disabled')) { sendBtn = b; break; }
          }
          if (sendBtn) break;
        }
        let submitMethod = 'enter-key';
        if (sendBtn?.click) { safe(() => sendBtn.click()); submitMethod = 'click-send-button'; }
        else fireEvt(ed, 'KeyboardEvent', 'keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true });
        return { ok: true, command: norm, pickedFromMenu, hasQuote: !!quote, submitMethod };
      } finally {
        slashBusy = false;
      }
    };

    const copySelection = async (text) => {
      if (!text) return false;
      const fin = (ok) => (ok && showToast(P()[1], 'ok'), ok);
      if (env.copyText) return fin((await env.copyText(text)) !== false);
      if (nav?.clipboard?.writeText) { try { await nav.clipboard.writeText(text); return fin(true); } catch {} }
      if (doc?.body && doc.execCommand) {
        const ta = sa(doc.createElement('textarea'), { readonly: 'true' });
        ta.value = text;
        ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
        doc.body.appendChild(ta);
        try { ta.select?.(); return fin(!!doc.execCommand('copy')); } catch { return false; } finally { safe(() => ta.remove()); }
      }
      return false;
    };

    const setActive = (idx) => {
      if (!items.length) { activeIdx = -1; return; }
      activeIdx = ((idx % items.length) + items.length) % items.length;
      items.forEach((it, i) => {
        if (i === activeIdx) { it.el.setAttribute('data-active', '1'); safe(() => it.el.focus?.()); }
        else it.el.removeAttribute('data-active');
      });
    };

    const runAction = (id) => {
      const sel = curSel;
      close();
      const r = safe(() => (id === 'copy' ? copySelection(sel) : id === 'btw' ? triggerBtw(sel) : triggerSlashCommand('/' + id, id === 'compact' ? '' : sel)));
      if (typeof r?.catch === 'function') r.catch(() => {});
      return r;
    };

    const onOtherCtxOpen = (ev) => {
      safe(() => {
        if (ev?.detail?.source !== 'btw') close();
      });
    };
    const emitCtxOpen = () => {
      safe(() => W.__agPrismInlineDiff?.closeMenuIfOpen?.());
      safe(() => {
        if (!win?.dispatchEvent) return;
        const CE = typeof W.CustomEvent === 'function' ? W.CustomEvent : typeof CustomEvent === 'function' ? CustomEvent : null;
        win.dispatchEvent(CE ? new CE('ag-prism:ctx-open', { detail: { source: 'btw' } }) : { type: 'ag-prism:ctx-open', detail: { source: 'btw' } });
      });
    };

    const toggleOpen = (on) => {
      if (openBound === on) return;
      openBound = on;
      const m = on ? 'addEventListener' : 'removeEventListener';
      doc?.[m]?.('mousedown', onOutside, true);
      doc?.[m]?.('keydown', onKey, true);
      doc?.[m]?.('scroll', onScroll, true);
      win?.[m]?.('blur', close);
      win?.[m]?.('resize', close);
      win?.[m]?.('ag-prism:ctx-open', onOtherCtxOpen);
    };

    const close = () => {
      toggleOpen(false);
      safe(() => menuEl?.remove());
      menuEl = null;
      items = [];
      activeIdx = -1;
      curSel = '';
      lastPos = null;
      rawPos = null;
    };

    const openAt = (x, y, opts = {}) => {
      if (destroyed || !doc?.body) return null;
      close();
      emitCtxOpen();
      if (opts.lang) lang = opts.lang === 'auto' ? autoLang('en') : rLang(opts.lang);
      const s = getSel();
      const autoSel = !s || s.isCollapsed === true || toEl(s.anchorNode)?.closest?.(EDIT) ? '' : clip(s.toString?.());
      const sel = opts.selectedText !== undefined ? clip(opts.selectedText) : autoSel;
      const hasSel = !!sel;
      const p = P();
      curSel = sel;
      rawPos = [x, y];
      const mk = (t, txt) => { const n = doc.createElement(t); if (txt != null) n.textContent = txt; return n; };
      const mkS = (t) => (doc.createElementNS ? doc.createElementNS(NS, t) : doc.createElement(t));
      const el = sa(noTr(mk('div')), { class: 'ag-cs-ctx-menu', role: 'menu', tabindex: '-1', 'data-ag-cs-ctx-mode': hasSel ? 'selection' : 'plain', 'data-ag-cs-ctx-lang': lang });
      el.addEventListener('mousedown', (e) => e.preventDefault?.());

      if (hasSel) {
        const f = sel.replace(/\s+/g, ' ');
        el.appendChild(sa(mk('p', '“' + (f.length > 46 ? f.slice(0, 45) + '…' : f) + '”'), { 'data-ctx-quote': '1' }));
      }

      const spec = [
        ...(hasSel ? [['copy', 0, 0], 0] : []),
        ['btw', hasSel ? 3 : 2, 1],
        ...(hasSel ? [['plan', 4, 2]] : []),
        0, ['compact', 5, 3], ['learn', 6, 4], ['grill-me', 7, 5],
      ];
      items = [];
      for (const row of spec) {
        if (!row) { el.appendChild(sa(mk('hr'), { role: 'separator' })); continue; }
        const [id, li, ii] = row;
        const btn = sa(mk('button'), { role: 'menuitem', 'data-ctx-action': id, type: 'button' });
        const idx = items.length;
        btn.className = id === 'btw' ? 'ag-cs-ctx-item is-primary' : 'ag-cs-ctx-item';
        const svg = sa(mkS('svg'), { width: '14', height: '14', viewBox: '0 0 16 16', 'aria-hidden': 'true' });
        svg.appendChild(sa(mkS('path'), { d: ICONS[ii] }));
        btn.appendChild(svg);
        btn.appendChild(mk('span', p[li]));
        if (id !== 'copy') btn.appendChild(mk('kbd', '/' + id));
        btn.onmouseenter = () => setActive(idx);
        btn.addEventListener('click', (e) => { stop(e); runAction(id); });
        items.push({ id, el: btn });
        el.appendChild(btn);
      }
      el.appendChild(mk('footer', 'Shift+' + p[11]));
      doc.body.appendChild(el);
      menuEl = el;

      const vw = +(win?.innerWidth || de?.clientWidth || 1280);
      const vh = +(win?.innerHeight || de?.clientHeight || 800);
      const rc = el.getBoundingClientRect?.();
      const w = Math.round((rc?.width > 0 ? rc.width : el.offsetWidth) || 248);
      const h = Math.round((rc?.height > 0 ? rc.height : el.offsetHeight) || (hasSel ? 304 : 212));
      const fit = (v, sz, lim) => { const n = +v || 0; const f = n + sz + 8 > lim; return [Math.round(Math.max(8, Math.min(f ? n - sz : n, Math.max(8, lim - sz - 8)))), f]; };
      const [left, flipX] = fit(x, w, vw);
      const [top, flipY] = fit(y, h, vh);
      Object.assign(el.style, { left: left + 'px', top: top + 'px', transformOrigin: (flipX ? '100%' : '0%') + ' ' + (flipY ? '100%' : '0%') });
      lastPos = { left, top, width: w, height: h, flipX, flipY };
      toggleOpen(true);
      return el;
    };

    const onCtx = (ev) => {
      try {
        if (destroyed || !enabled || !ev || ev.shiftKey === true || ev.defaultPrevented) return;
        const el = toEl(ev.target);
        if (!el || el.isContentEditable === true || !el.closest?.(CONV) || el.closest?.(EXCL)) return;
        if (el.closest?.('.ag-cs-inline-diff-box')) {
          const s = getSel();
          const selTxt = !s || s.isCollapsed === true ? '' : clip(s.toString?.());
          if (!selTxt) return;
        }
        stop(ev);
        openAt(ev.clientX, ev.clientY);
      } catch {}
    };
    const onOutside = (ev) => { safe(() => { const t = ev?.target; if (menuEl && !(t && (menuEl.contains?.(t) || toEl(t)?.closest?.('.ag-cs-ctx-menu') === menuEl))) close(); }); };
    const onScroll = (ev) => { safe(() => { if (menuEl && ev?.target !== menuEl) close(); }); };
    const onKey = (ev) => {
      safe(() => {
        if (!isOpen() || !ev) return;
        const k = ev.key;
        const navMap = { Home: 0, End: items.length - 1, ArrowDown: activeIdx < 0 ? 0 : activeIdx + 1, ArrowUp: activeIdx < 0 ? items.length - 1 : activeIdx - 1 };
        if (k === 'Escape') { stop(ev); close(); }
        else if (k in navMap) { ev.preventDefault?.(); setActive(navMap[k]); }
        else if ((k === 'Enter' || k === ' ') && items[activeIdx]) { stop(ev); runAction(items[activeIdx].id); }
      });
    };

    const toggleCtx = (on) => {
      if (bound === on || (on && (destroyed || !doc))) return;
      bound = on;
      doc?.[on ? 'addEventListener' : 'removeEventListener']?.('contextmenu', onCtx, true);
    };

    const isOpen = () => !!(menuEl && menuEl.isConnected !== false);
    const getState = () => ({ enabled, destroyed, open: isOpen(), lang, motionLevel, selectedText: curSel, position: lastPos ? { ...lastPos } : null, actions: items.map((it) => it.id), activeIndex: activeIdx, listenerBound: bound });

    const sync = (opts = {}) => {
      if (destroyed) return getState();
      const prev = lang;
      if (opts) {
        if ('enabled' in opts) enabled = opts.enabled !== false && opts.enabled !== 'off';
        if (opts.lang) lang = opts.lang === 'auto' ? autoLang('en') : rLang(opts.lang);
        if (opts.motionLevel) motionLevel = String(opts.motionLevel);
      }
      if (enabled) { toggleCtx(true); if (menuEl && rawPos && lang !== prev) openAt(rawPos[0], rawPos[1], { selectedText: curSel }); }
      else { close(); toggleCtx(false); }
      return getState();
    };

    const destroy = () => {
      if (destroyed) return;
      destroyed = true; enabled = false; slashBusy = false;
      close(); clearToast(); toggleCtx(false);
      clean.forEach((f) => safe(f)); clean.clear();
      qa('.ag-cs-ctx-menu,.ag-cs-ctx-toast').forEach((n) => safe(() => n.remove()));
    };

    if (doc && enabled) toggleCtx(true);
    return { sync, destroy, isOpen, getState, openAt, close, triggerBtw, triggerSlashCommand };
  }

  safe(() => G.__agPrismContextMenu?.destroy?.());
  const api = Object.assign(createContextMenuController(), { createContextMenuController });
  G.__agPrismContextMenu = api;
  if (G.window && G.window !== G) G.window.__agPrismContextMenu = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : null);

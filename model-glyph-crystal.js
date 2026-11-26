// Obsidian Prism — Official Brand Model Glyph & Orchestrator Cut Crystal Bar Module (model-glyph-crystal.js)
// Extracted from ui-runtime.js: manages model label parsing, brand SVG glyphs on triggers/panel rows,
// SVG <template> clone prototype cache, and Orchestrator cut-crystal prism bar loop.

(function (root) {
  'use strict';
  const G = root || (typeof globalThis !== 'undefined' ? globalThis : window);
  if (!G) return;

  const BRAND_PATHS = {
    gemini:
      'M24 12.024c-6.437.388-11.59 5.539-11.977 11.976h-.047C11.588 17.563 6.436 12.412 0 12.024v-.047C6.437 11.588 11.588 6.437 11.976 0h.047c.388 6.437 5.54 11.588 11.977 11.977z',
    claude:
      'm4.714 15.956l4.718-2.648l.079-.23l-.08-.128h-.23l-.79-.048l-2.695-.073l-2.337-.097l-2.265-.122l-.57-.121l-.535-.704l.055-.353l.48-.321l.685.06l1.518.104l2.277.157l1.651.098l2.447.255h.389l.054-.158l-.133-.097l-.103-.098l-2.356-1.596l-2.55-1.688l-1.336-.972l-.722-.491L2 6.223l-.158-1.008l.656-.722l.88.06l.224.061l.893.686l1.906 1.476l2.49 1.833l.364.304l.146-.104l.018-.072l-.164-.274l-1.354-2.446l-1.445-2.49l-.644-1.032l-.17-.619a3 3 0 0 1-.103-.729L6.287.133L6.7 0l.995.134l.42.364l.619 1.415L9.735 4.14l1.555 3.03l.455.898l.243.832l.09.255h.159V9.01l.127-1.706l.237-2.095l.23-2.695l.08-.76l.376-.91l.747-.492l.583.28l.48.685l-.067.444l-.286 1.851l-.558 2.903l-.365 1.942h.213l.243-.242l.983-1.306l1.652-2.064l.728-.82l.85-.904l.547-.431h1.032l.759 1.129l-.34 1.166l-1.063 1.347l-.88 1.142l-1.263 1.7l-.79 1.36l.074.11l.188-.02l2.853-.606l1.542-.28l1.84-.315l.832.388l.09.395l-.327.807l-1.967.486l-2.307.462l-3.436.813l-.043.03l.049.061l1.548.146l.662.036h1.62l3.018.225l.79.522l.473.638l-.08.485l-1.213.62l-1.64-.389l-3.825-.91l-1.31-.329h-.183v.11l1.093 1.068l2.003 1.81l2.508 2.33l.127.578l-.321.455l-.34-.049l-2.204-1.657l-.85-.747l-1.925-1.62h-.127v.17l.443.649l2.343 3.521l.122 1.08l-.17.353l-.607.213l-.668-.122l-1.372-1.924l-1.415-2.168l-1.141-1.943l-.14.08l-.674 7.254l-.316.37l-.728.28l-.607-.461l-.322-.747l.322-1.476l.388-1.924l.316-1.53l.285-1.9l.17-.632l-.012-.042l-.14.018l-1.432 1.967l-2.18 2.945l-1.724 1.845l-.413.164l-.716-.37l.066-.662l.401-.589l2.386-3.036l1.439-1.882l.929-1.086l-.006-.158h-.055L4.138 18.56l-1.13.146l-.485-.456l.06-.746l.231-.243l1.907-1.312Z',
    openai:
      'M20.562 10.188c.25-.688.313-1.376.25-2.063c-.062-.687-.312-1.375-.625-2c-.562-.937-1.375-1.687-2.312-2.125c-1-.437-2.063-.562-3.125-.312c-.5-.5-1.063-.938-1.688-1.25S11.687 2 11 2a5.17 5.17 0 0 0-3 .938c-.875.624-1.5 1.5-1.813 2.5c-.75.187-1.375.5-2 .875c-.562.437-1 1-1.375 1.562c-.562.938-.75 2-.625 3.063a5.44 5.44 0 0 0 1.25 2.874a4.7 4.7 0 0 0-.25 2.063c.063.688.313 1.375.625 2c.563.938 1.375 1.688 2.313 2.125c1 .438 2.062.563 3.125.313c.5.5 1.062.937 1.687 1.25S12.312 22 13 22a5.17 5.17 0 0 0 3-.937c.875-.625 1.5-1.5 1.812-2.5a4.54 4.54 0 0 0 1.938-.875c.562-.438 1.062-.938 1.375-1.563c.562-.937.75-2 .625-3.062c-.125-1.063-.5-2.063-1.188-2.876m-7.5 10.5c-1 0-1.75-.313-2.437-.875c0 0 .062-.063.125-.063l4-2.312a.5.5 0 0 0 .25-.25a.57.57 0 0 0 .062-.313V11.25l1.688 1v4.625a3.685 3.685 0 0 1-3.688 3.813M5 17.25c-.438-.75-.625-1.625-.438-2.5c0 0 .063.063.125.063l4 2.312a.56.56 0 0 0 .313.063c.125 0 .25 0 .312-.063l4.875-2.812v1.937l-4.062 2.375A3.7 3.7 0 0 1 7.312 19c-1-.25-1.812-.875-2.312-1.75M3.937 8.563a3.8 3.8 0 0 1 1.938-1.626v4.751c0 .124 0 .25.062.312a.5.5 0 0 0 .25.25l4.875 2.813l-1.687 1l-4-2.313a3.7 3.7 0 0 1-1.75-2.25c-.25-.937-.188-2.062.312-2.937M17.75 11.75l-4.875-2.812l1.687-1l4 2.312c.625.375 1.125.875 1.438 1.5s.5 1.313.437 2.063a3.7 3.7 0 0 1-.75 1.937c-.437.563-1 1-1.687 1.25v-4.75c0-.125 0-.25-.063-.312c0 0-.062-.126-.187-.188m1.687-2.5s-.062-.062-.125-.062l-4-2.313c-.125-.062-.187-.062-.312-.062s-.25 0-.313.062L9.812 9.688V7.75l4.063-2.375c.625-.375 1.312-.5 2.062-.5c.688 0 1.375.25 2 .688c.563.437 1.063 1 1.313 1.625s.312 1.375.187 2.062m-10.5 3.5l-1.687-1V7.063c0-.688.187-1.438.562-2C8.187 4.438 8.75 4 9.375 3.688a3.37 3.37 0 0 1 2.062-.313c.688.063 1.375.375 1.938.813c0 0-.063.062-.125.062l-4 2.313a.5.5 0 0 0-.25.25c-.063.125-.063.187-.063.312zm.875-2L12 9.5l2.187 1.25v2.5L12 14.5l-2.188-1.25z',
  };

  const PANEL_MODEL_ROW_RE = /orchestrator|编排|调度|gemini|claude|sonnet|opus|haiku|gpt|openai|\bo[134]\b|deepseek/i;
  const ZH_EFFORT_PAREN_RE = /\s*[（(]\s*(超高|极高|超深|高思考|中思考|低思考|极低|最低|深度思考|思考中?|中等|高|中|低|自动)\s*[)）]/g;

  const stripTranslatedEffortSuffix = (rawText) => {
    return String(rawText || '').replace(ZH_EFFORT_PAREN_RE, '').trim();
  };

  const normalizeModelEffortLabel = (rawText) =>
    String(rawText || '').replace(ZH_EFFORT_PAREN_RE, (_, t) =>
      /超高|极高|超深/.test(t) ? ' (xhigh)' : t[0] === '中' ? ' (medium)' : t.includes('低') ? ' (low)' : t === '自动' ? ' (auto)' : ' (high)'
    );

  const readButtonLabelWithoutGlyph = (el) => {
    if (!el) return '';
    const parts = [], isG = (n) => n?.classList?.contains?.('ag-cs-model-glyph') || n?.classList?.contains?.('ag-pp-mini-keycap');
    const collect = (node) => {
      if (!node || isG(node)) return;
      if (node.nodeType === 3) { parts.push(node.nodeValue || ''); return; }
      if (node.childNodes?.length > 0) { for (const cn of node.childNodes) collect(cn); return; }
      if (node.children?.length > 0) {
        let nonG = 0;
        for (const ch of node.children) if (!isG(ch)) { nonG++; collect(ch); }
        if (!nonG && typeof node._text === 'string' && node._text) parts.push(node._text);
        return;
      }
      parts.push(node.textContent || '');
    };
    collect(el);
    return parts.join(' ').trim() || (el.getAttribute?.('data-model-label') || '').trim() || (el.getAttribute?.('aria-label') || '').replace(/,\s*(?:model )?cannot be changed.*$/i, '').trim();
  };

  const RE_CL = /\b(claude|anthropic|sonnet|opus|haiku)\b/;
  const RE_GPT = /\b(gpt|openai|o[134]|codex)\b/;
  const RE_DS = /\bdeepseek\b/;

  const parseModelLabelInfo = (rawText) => {
    const norm = normalizeModelEffortLabel(rawText).toLowerCase();
    const base = stripTranslatedEffortSuffix(rawText).toLowerCase();
    const isOrchestrator = /\borchestrator\b|编排|调度器/.test(base);
    let brand = 'gemini';
    if (RE_CL.test(base)) brand = 'claude';
    else if (RE_GPT.test(base) || RE_DS.test(base)) brand = 'openai';
    else if (isOrchestrator || (/\bantigravity\b/.test(base) && !/\b(gemini|neon|argon|carbon|hydrogen|flash)\b/.test(base))) brand = 'antigravity';

    const tier = /\b(gpt-oss|fixed)\b|固定/.test(norm) ? 'fixed'
      : /\b(xhigh|extra)\b|超高|极高|超深/.test(norm) ? 'xhigh'
      : /\b(high|max|thinking)\b|深度思考|高思考|思考|高/.test(norm) ? 'high'
      : /\b(low|lite|minimal)\b|低思考|极低|最低|低/.test(norm) ? 'low'
      : /\b(medium|med)\b|中思考|中等|中/.test(norm) ? 'medium'
      : isOrchestrator ? 'auto' : 'medium';
    return { brand, tier, isOrchestrator, camp: brand === 'claude' ? 'claude' : 'gemini' };
  };

  const resolveMascotCamp = (rawText) => {
    const b = stripTranslatedEffortSuffix(rawText).toLowerCase();
    return RE_CL.test(b) ? 'claude' : RE_DS.test(b) || b.includes('深度求索') ? 'deepseek' : RE_GPT.test(b) ? 'gpt' : 'gemini';
  };

  const createModelGlyphCrystalController = ({
    animatedIcons,
    crystalPrismCore,
    isDestroyed,
    isComposerRestyleEnabled,
    isZh,
    isDarkTheme,
    motionReduced,
    getMinFrameGapMs,
    canMountRealCanvas,
    getLastPointerPos,
    setAttrIfChanged,
    getCfg,
  }) => {
    let mPanel = null,
      mOv = null,
      mBar = null,
      mTrk = null,
      mCv = null,
      mInst = null,
      mRaf = 0,
      mMountRaf = 0,
      mLastMs = 0,
      mWasOrch = false,
      mHideLock = false,
      mMenuOpen = false,
      mWakeTrk = null,
      mWakeFn = null,
      mMountedAt = 0,
      mKnob = null,
      mKnobRect = null,
      mKnobRectAt = 0,
      mKnobFillSig = '',
      mTrkWidth = 0,
      mStepFillRatio = null;
    const mBlurTimers = [];

    const svgProto = new Map();
    const K_IC = 'isConnected', K_PE = 'parentElement', K_CL = 'classList';
    const isF = Number.isFinite, pF = parseFloat, nowMs = () => performance.now(),
      clamp01 = (v) => Math.max(0, Math.min(1, v));
    const ga = (e, k) => e?.getAttribute?.(k);
    const sa = (e, k, v = '') => e?.setAttribute?.(k, String(v));
    const ra = (e, k) => e?.removeAttribute?.(k);
    const ha = (e, k) => Boolean(e?.hasAttribute?.(k));
    const qs = (e, s) => e?.querySelector?.(s) || null;
    const qa = (e, s) => e?.querySelectorAll?.(s) || [];
    const cl = (e, s) => e?.closest?.(s) || null;
    const sp = (e, k, v) => e?.style?.setProperty?.(k, v);
    const clHas = (e, c) => Boolean(e?.[K_CL]?.contains?.(c));
    const rc = (e) => e?.getBoundingClientRect?.() || null;
    const docOf = () => (typeof document !== 'undefined' ? document : null);
    const isHid = () => docOf()?.hidden;
    const rAF = (fn) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : 0);
    const cAF = (id) => { if (id && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id); };
    const mk = (tag, cls, txt) => {
      const e = docOf().createElement(tag);
      if (cls) e.className = cls;
      if (txt !== undefined) e.textContent = txt;
      return e;
    };
    const markNoTr = (el) => {
      if (!el) return el;
      const fn = G.AntigravityCodexEffortSlider?.markNoTranslate;
      if (fn) return fn(el);
      for (const k of ['data-ag-i18n-skip', 'data-ag-no-tr', 'data-no-translate']) sa(el, k, '1');
      sa(el, 'data-translate', 'no'); sa(el, 'translate', 'no'); el[K_CL]?.add?.('notranslate');
      return el;
    };

    const getRootHtml = () => docOf()?.documentElement || null;

    const clearBlurTimers = () => {
      while (mBlurTimers.length) {
        try { clearTimeout(mBlurTimers.pop()); } catch {}
      }
    };

    const blurModelTriggerIfNotHovered = () => {
      try {
        if (isDestroyed() || mMenuOpen) return;
        const d = docOf();
        const tr = d && qs(d, '[data-testid="model-selector-trigger"],button[aria-label^="Select model"]');
        if (tr && d.activeElement === tr && !(tr.matches && tr.matches(':hover'))) tr.blur?.();
      } catch {}
    };

    const syncModelMenuAttrs = (panel) => {
      const h = getRootHtml(), ov = cl(panel, '.agy-overlay');
      if (panel) {
        clearBlurTimers();
        mMenuOpen = true;
        h && setAttrIfChanged(h, 'data-ag-cs-model-menu', '1');
        mOv && mOv !== ov && ra(mOv, 'data-ag-cs-model-overlay');
        ov && setAttrIfChanged(ov, 'data-ag-cs-model-overlay', '1');
        mOv = ov;
      } else {
        const wasOpen = mMenuOpen;
        mMenuOpen = false;
        ra(h, 'data-ag-cs-model-menu'); ra(mOv, 'data-ag-cs-model-overlay'); mOv = null;
        qa(docOf(), '[data-ag-cs-model-overlay]').forEach((e) => ra(e, 'data-ag-cs-model-overlay'));
        if (wasOpen) {
          blurModelTriggerIfNotHovered();
          if (typeof setTimeout === 'function') {
            mBlurTimers.push(setTimeout(blurModelTriggerIfNotHovered, 0), setTimeout(blurModelTriggerIfNotHovered, 60));
          }
        }
      }
    };

    const readRootAccentTone = () => ga(getRootHtml(), 'data-ag-cs-accent') || 'follow';

    const resolveCrystalAccentMode = (dark) => {
      const html = getRootHtml(), tone = ga(html, 'data-ag-cs-accent') || 'follow';
      if (tone === 'mono' || tone === 'cobalt' || tone === 'iris' || tone === 'amber') return tone;
      const pal = ga(html, 'data-ag-cs-palette') || 'obsidian';
      if (pal === 'warm' || pal === 'claude' || (!dark && pal === 'obsidian' && ga(html, 'data-ag-cs-light-preset') === 'alabaster')) return 'warm';
      return 'default';
    };

    const isEffortSliderOff = () =>
      ga(getRootHtml(), 'data-ag-cs-effort-slider') === 'off' || getCfg?.()?.effortSliderModule === 'off';

    const isCustomEffortStyle = () => {
      const st = ga(getRootHtml(), 'data-ag-cs-effort-style') || getCfg?.()?.effortSliderStyle || 'classic';
      return Boolean(st && st !== 'classic');
    };

    const readRootAmbientFloat = () => {
      const raw = ga(getRootHtml(), 'data-ag-cs-ambient');
      if (G.__agPrismRipple?.parseAmbientScale) return G.__agPrismRipple.parseAmbientScale(raw);
      if (raw == null || raw === '') return 1;
      const n = Number(raw);
      return !Number.isFinite(n) ? 1 : n <= 0 ? 0 : n > 1 ? Math.min(1, n / 100) : n;
    };

    const cloneCachedSvgElement = (cacheKey, htmlStr) => {
      if (!htmlStr) return null;
      if (typeof HTMLTemplateElement !== 'undefined' && typeof docOf()?.createElement === 'function') {
        let proto = svgProto.get(cacheKey);
        if (!proto) {
          const tpl = mk('template'); tpl.innerHTML = htmlStr;
          proto = tpl.content ? tpl.content.firstElementChild || tpl.content.firstChild : null;
          if (proto?.cloneNode) { if (svgProto.size > 64) svgProto.clear(); svgProto.set(cacheKey, proto); }
        }
        if (proto?.cloneNode) return proto.cloneNode(true);
      }
      const tmp = mk('span'); tmp.innerHTML = htmlStr;
      return tmp.firstElementChild || tmp.firstChild || null;
    };

    const parseModelTriggerInfo = (btn) => {
      const raw = readButtonLabelWithoutGlyph(btn);
      const info = parseModelLabelInfo(raw);
      info.mascotCamp = resolveMascotCamp(raw);
      if (info.isOrchestrator && ga(btn, 'data-ces-orch-b') === 'claude') info.brand = info.camp = info.mascotCamp = 'claude';
      return info;
    };

    const svgW = (cls, sz, vb, inner) =>
      `<svg${cls ? ` class="${cls}"` : ''} width="${sz}" height="${sz}" viewBox="${vb}" fill="none" aria-hidden="true">${inner}</svg>`;

    const renderSparkSvg = (size = 16, tier = 'auto', monochrome = false, className = '') => {
      const extSvg = animatedIcons?.renderGoogleSparkOrbitSvg?.({ size, tier, monochrome, className });
      if (extSvg) return extSvg;
      return svgW(
        className,
        size,
        '0 0 24 24',
        `<path d="M12 1.2c.25 0 .47.17.53.41c.21.79.48 1.56.8 2.31c1.23 2.86 3.39 5.02 6.25 6.25c.75.32 1.52.59 2.31.8c.24.06.41.28.41.53s-.17.47-.41.53a16 16 0 0 0-2.31.8c-2.86 1.23-5.02 3.39-6.25 6.25c-.32.75-.59 1.52-.8 2.31a.55.55 0 0 1-.53.41a.55.55 0 0 1-.53-.41a16 16 0 0 0-.8-2.31c-1.23-2.86-3.39-5.02-6.25-6.25a16 16 0 0 0-2.31-.8A.55.55 0 0 1 1.2 12c0-.25.17-.47.41-.53c.79-.21 1.56-.48 2.31-.8c2.86-1.23 5.02-3.39 6.25-6.25c.32-.75.59-1.52.8-2.31c.06-.24.28-.41.53-.41Z" fill="${monochrome ? 'currentColor' : '#669DF6'}"/>`
      );
    };

    const buildBrandMarkSvg = (brand, size = 14, tier = 'auto', monochrome = false) => {
      const useMono = !!(monochrome || readRootAccentTone() === 'mono');
      if (brand === 'antigravity') return renderSparkSvg(size, tier, useMono, '');
      return svgW('', size, '0 0 24 24', `<path d="${BRAND_PATHS[brand] || BRAND_PATHS.gemini}" fill="currentColor" fill-rule="evenodd"/>`);
    };

    const buildModelGlyphInnerSvg = (brand, tier, isMono = false) => {
      if (brand === 'antigravity') return renderSparkSvg(16, tier || 'auto', isMono, 'ag-cs-model-glyph-svg');
      const d = BRAND_PATHS[brand] || BRAND_PATHS.gemini;
      const fixedLock =
        tier === 'fixed'
          ? '<g class="ag-cs-glyph-lock"><rect x="15.2" y="16.2" width="8.6" height="6.8" rx="1.6"/><path d="M17.3 16.2v-1.7a2.2 2.2 0 1 1 4.4 0v1.7" fill="none" stroke-width="1.5"/></g>'
          : '';
      return svgW(
        'ag-cs-model-glyph-svg',
        16,
        '-4 -4 32 32',
        '<g class="ag-cs-glyph-orbit-group"><ellipse class="ag-cs-glyph-orbit" cx="12" cy="12" rx="14.5" ry="6.2" transform="rotate(-24 12 12)"/><circle class="ag-cs-glyph-sat is-a" cx="25.2" cy="6.1" r="1.65"/><circle class="ag-cs-glyph-sat is-b" cx="-1.2" cy="17.9" r="1.25"/></g>' +
          `<path class="ag-cs-glyph-body" d="${d}" fill-rule="evenodd"/><circle class="ag-cs-glyph-core" cx="12" cy="12" r="${brand === 'gemini' ? '2.7' : '2.1'}"/>` +
          fixedLock
      );
    };

    const syncModelGlyphOnButton = (modelBtn) => {
      if (!modelBtn) return null;
      qa(modelBtn, '.ag-cs-effort-badge, [data-ag-cs-effort]').forEach((el) => {
        ra(el, 'data-ag-cs-effort');
        el[K_CL].remove('ag-cs-effort-badge');
      });

      const info = parseModelTriggerInfo(modelBtn);
      if (!isComposerRestyleEnabled()) {
        qa(modelBtn, '.ag-cs-model-glyph').forEach((n) => n.remove());
        return info;
      }

      let glyph = qs(modelBtn, '.ag-cs-model-glyph'), created = false;
      if (!glyph) {
        glyph = mk('span', 'ag-cs-model-glyph');
        sa(glyph, 'data-icon', '1'); sa(glyph, 'aria-hidden', 'true'); sa(glyph, 'data-ag-no-i18n'); sa(glyph, 'data-ag-owned', '1');
        created = true;
      }
      if (modelBtn.firstChild !== glyph) modelBtn.insertBefore(glyph, modelBtn.firstChild);
      const isMono = readRootAccentTone() === 'mono', monoStr = isMono ? '1' : '0', prevMono = ga(glyph, 'data-mono');
      if (created || ga(glyph, 'data-brand') !== info.brand || ga(glyph, 'data-tier') !== info.tier || prevMono !== monoStr) {
        sa(glyph, 'data-brand', info.brand); sa(glyph, 'data-tier', info.tier); sa(glyph, 'data-mono', monoStr);
        glyph.innerHTML = buildModelGlyphInnerSvg(info.brand, info.tier, isMono);
        if (!created && prevMono === monoStr && !motionReduced()) {
          glyph[K_CL].remove('is-pulsing');
          rAF(() => { if (glyph[K_IC]) glyph[K_CL].add('is-pulsing'); });
        }
      }
      return info;
    };

    const buildPanelRowGlyphSvg = (brand, tier, isSelected, isMono = false) => {
      if (brand === 'antigravity') {
        return renderSparkSvg(15, isSelected ? tier || 'auto' : 'low', !isSelected || isMono, 'ag-cs-model-glyph-svg');
      }
      const fillAttr = isSelected && !isMono
        ? 'style="fill:var(--glyph-color-hi);fill-opacity:1"'
        : `fill="currentColor" fill-opacity="${isSelected ? '0.95' : '0.72'}"`;
      return svgW('ag-cs-model-glyph-svg', 15, '0 0 24 24', `<path d="${BRAND_PATHS[brand] || BRAND_PATHS.gemini}" ${fillAttr} fill-rule="evenodd"/>`);
    };

    const clearPanelRowGlyphs = (rootNode = docOf()) => {
      qa(rootNode, '.ag-cs-panel-row-glyph').forEach((n) => n.remove());
    };

    const isPanelRowSelected = (row) => {
      if (!row) return false;
      if (ga(row, 'data-selected') === 'true' || ga(row, 'aria-checked') === 'true' || ga(row, 'data-state') === 'checked') return true;
      if (ha(row, 'data-ces-model-selected')) return ga(row, 'data-ces-model-selected') === 'true';
      return clHas(row, 'text-foreground') && !clHas(row, 'text-secondary-foreground');
    };

    const syncPanelRowGlyphs = (panel) => {
      if (!panel) return;
      for (const row of qa(panel, '[role="menuitem"], [role="option"], button')) {
        if (cl(row, '.ces-ag-section, [data-testid="orchestrator-effort-bar"]') || cl(row[K_PE], '[role="menuitem"], [role="option"], button')) continue;
        const label = readButtonLabelWithoutGlyph(row);
        if (!PANEL_MODEL_ROW_RE.test(label)) { clearPanelRowGlyphs(row); continue; }
        const info = parseModelLabelInfo(label), isSelected = isPanelRowSelected(row);
        let firstChildEl = null;
        if (row.children) for (const ch of row.children) if (!clHas(ch, 'ag-cs-model-glyph')) { firstChildEl = ch; break; }
        const targetParent = firstChildEl && (qs(firstChildEl, '[data-testid="model-selector-effort-group"]') || /\bflex\b|\bitems-center\b/.test(String(firstChildEl.className || ''))) ? firstChildEl : row;
        let glyph = qs(row, '.ag-cs-panel-row-glyph'), created = false;
        if (!glyph) {
          glyph = mk('span', 'ag-cs-model-glyph ag-cs-panel-row-glyph');
          sa(glyph, 'data-ag-no-i18n'); sa(glyph, 'aria-hidden', 'true'); sa(glyph, 'data-ag-owned', '1');
          created = true;
        }
        if (glyph[K_PE] !== targetParent || targetParent.firstChild !== glyph) targetParent.insertBefore(glyph, targetParent.firstChild);
        const selStr = isSelected ? 'true' : 'false', isMono = readRootAccentTone() === 'mono', monoStr = isMono ? '1' : '0';
        if (created || ga(glyph, 'data-brand') !== info.brand || ga(glyph, 'data-tier') !== info.tier || ga(glyph, 'data-selected') !== selStr || ga(glyph, 'data-mono') !== monoStr) {
          sa(glyph, 'data-brand', info.brand); sa(glyph, 'data-tier', info.tier); sa(glyph, 'data-selected', selStr); sa(glyph, 'data-mono', monoStr);
          glyph.innerHTML = buildPanelRowGlyphSvg(info.brand, info.tier, isSelected, isMono);
          sp(glyph, 'opacity', isSelected ? '1' : '0.78');
          sp(glyph, 'filter', isSelected && info.brand !== 'openai' && !isMono ? 'drop-shadow(0 0 3px var(--glyph-glow))' : 'none');
        }
      }
    };

    const detachSliderWake = () => {
      if (mWakeTrk && mWakeFn) try { mWakeTrk.removeEventListener('pointerdown', mWakeFn); } catch {}
      mWakeTrk = mWakeFn = null;
    };

    const EFF_ROW_SEL = '.ces-ag-effort-row:not([data-testid="orchestrator-effort-bar"])';
    const ORCH_CV_SEL = 'canvas[data-orch-crystal-canvas="true"]';

    const clearSliderPrismOverlay = (panel) => {
      detachSliderWake();
      if (!panel) return;
      qa(panel, '.ces-ag-effort-row[data-ag-orch-p]').forEach((row) => {
        ra(row, 'data-ag-orch-p');
        const trk = qs(row, '.ces-track');
        if (trk) {
          trk[K_CL].remove('ag-cs-orch-track');
          qa(trk, ORCH_CV_SEL).forEach((c) => c.remove());
          const knob = qs(trk, '.ces-knob');
          if (knob) { knob.style.removeProperty('--knob-px'); knob.style.removeProperty('--knob-py'); }
        }
      });
    };

    const getCachedKnob = (trk) => {
      if (!trk || trk[K_IC] === false) return null;
      if (mKnob && mKnob[K_IC] !== false && (mKnob[K_PE] === trk || trk.contains?.(mKnob))) return mKnob;
      return (mKnob = qs(trk, '.ces-knob'));
    };

    const readTrackFillRatio = (trk) => {
      if (!trk) return 1;
      let w = trk === mTrk && mTrkWidth > 4 ? mTrkWidth : 0;
      if (!(w > 4)) { w = trk.clientWidth || rc(trk)?.width || 220; if (trk === mTrk && w > 4) mTrkWidth = w; }
      const raw = trk.style?.getPropertyValue?.('--ces-fill')?.trim() || '';
      if (raw && w > 4) {
        const mCalc = raw.match(/calc\(\s*([0-9.]+)px\s*\+\s*\(100%\s*-\s*([0-9.]+)px\)\s*\*\s*([0-9.eE+-]+)\s*\)/);
        if (mCalc) {
          const r = pF(mCalc[1]), span = pF(mCalc[2]), p = pF(mCalc[3]);
          if (isF(r) && isF(span) && isF(p)) return clamp01((r + (w - span) * p) / w);
        }
        const px = pF(raw);
        if (isF(px)) return clamp01(px / w);
      }
      const knob = trk === mTrk ? getCachedKnob(trk) : qs(trk, '.ces-knob');
      if (knob && typeof knob.offsetLeft === 'number' && knob.offsetLeft > 0 && w > 4) return clamp01(knob.offsetLeft / w);
      if (w > 4) {
        const maxV = pF(ga(trk, 'aria-valuemax')), nowV = pF(ga(trk, 'aria-valuenow'));
        if (isF(maxV) && maxV > 0 && isF(nowV)) return clamp01((14 + (w - 28) * (nowV / maxV)) / w);
      }
      return 1;
    };

    let knobPrismHot = false;
    const syncKnobPrismPointer = (clientX, clientY) => {
      const trk = mHideLock ? mTrk : null, knob = getCachedKnob(trk);
      if (!knob) { knobPrismHot = false; mKnobRect = null; return; }
      const clr = () => { if (knobPrismHot) { sp(knob, '--knob-px', '-9999px'); sp(knob, '--knob-py', '-9999px'); knobPrismHot = false; } };
      if (motionReduced() || readRootAmbientFloat() <= 0.001 || !(clientX > -1000 && clientY > -1000)) { clr(); return; }
      const fillSig = trk?.style?.getPropertyValue?.('--ces-fill') || '', now = nowMs();
      let rect = mKnobRect;
      if (!rect || fillSig !== mKnobFillSig || now - mKnobRectAt > 120) {
        rect = rc(knob);
        mKnobRect = rect && rect.width >= 4 ? rect : null;
        mKnobRectAt = now; mKnobFillSig = fillSig;
      }
      if (!rect || rect.width < 4) return;
      const lx = clientX - rect.left, ly = clientY - rect.top;
      if (Math.hypot(lx - rect.width * 0.5, ly - rect.height * 0.5) <= 56) {
        sp(knob, '--knob-px', `${lx.toFixed(1)}px`); sp(knob, '--knob-py', `${ly.toFixed(1)}px`); knobPrismHot = true;
      } else clr();
    };

    const cancelMountRaf = () => { if (mMountRaf) { cAF(mMountRaf); mMountRaf = 0; } };
    const cancelStepRaf = () => { if (mRaf) { cAF(mRaf); mRaf = 0; } };

    const resetKnobCache = () => {
      mKnob = mKnobRect = null; mTrkWidth = mKnobRectAt = 0; mKnobFillSig = ''; mStepFillRatio = null;
    };

    const stopCrystalOnPanel = (panel) => {
      clearBlurTimers(); detachSliderWake(); cancelMountRaf(); cancelStepRaf();
      try { mInst?.dispose?.(); } catch {}
      if (panel) {
        clearSliderPrismOverlay(panel); ra(panel, 'data-ag-cs-orch-active');
        qa(panel, EFF_ROW_SEL).forEach((row) => { ra(row, 'data-row-hidden'); ra(row, 'aria-hidden'); });
      }
      if (mBar?.[K_PE]) mBar.remove();
      mPanel = mBar = mTrk = mCv = mInst = null; mRaf = mMountRaf = mLastMs = mMountedAt = 0;
      resetKnobCache(); mWasOrch = mHideLock = false;
    };

    const teardownCrystalMount = () => {
      const p = mPanel?.[K_IC] ? mPanel : null;
      if (p) clearPanelRowGlyphs(p);
      stopCrystalOnPanel(p); clearPanelRowGlyphs(); syncModelMenuAttrs(null); mOv = null;
    };

    const ORCH_LBL_RE = /\borchestrator\b|编排|调度器/i;
    const isOrchRowLbl = (el) => ORCH_LBL_RE.test(stripTranslatedEffortSuffix(readButtonLabelWithoutGlyph(el)));
    const detectPanelIsOrchestrator = (panel, fallbackModelInfo) => {
      if (panel) {
        const cesSel = qs(panel, '[data-ces-model-selected="true"]');
        if (cesSel) return ga(cesSel, 'data-testid') === 'model-selector-orchestrator' || Boolean(qs(cesSel, '[data-testid="model-selector-orchestrator"]')) || isOrchRowLbl(cesSel);
      }
      if (fallbackModelInfo && typeof fallbackModelInfo.isOrchestrator === 'boolean') return fallbackModelInfo.isOrchestrator;
      if (panel) {
        let sel = qs(panel, '[data-selected="true"], [aria-checked="true"], [data-state="checked"], [data-ces-model-selected="true"]');
        if (!sel) for (const r of qa(panel, '[role="menuitem"], [role="option"], button')) if (isPanelRowSelected(r)) { sel = r; break; }
        if (sel) return isOrchRowLbl(sel);
      }
      return false;
    };

    const stepCrystalLoop = (now) => {
      mRaf = 0;
      if (isDestroyed() || !mInst || !mPanel?.[K_IC] || !mWasOrch) return;
      const minGap = getMinFrameGapMs();
      if (minGap > 0 && mLastMs > 0 && now - mLastMs < minGap) {
        if (!motionReduced() && !isHid()) mRaf = rAF(stepCrystalLoop);
        return;
      }
      const dt = mLastMs > 0 ? Math.min(0.05, Math.max(0.002, (now - mLastMs) / 1000)) : 0.016;
      mLastMs = now;
      // 先读布局（fillRatio 与缓存宽度/滑块引用），再写 CSS 变量，消除同帧写后读回流
      mStepFillRatio = mHideLock ? readTrackFillRatio(mTrk) : -1;
      const ptrNow = getLastPointerPos?.() || null;
      if (ptrNow) syncKnobPrismPointer(ptrNow.x, ptrNow.y);
      try { mInst.step(dt); } catch {} finally { mStepFillRatio = null; }
      if (!mInst.isIdle?.() && !isHid()) mRaf = rAF(stepCrystalLoop);
    };

    const syncModelSelectorPanel = (primaryModelInfo) => {
      const panel = qs(docOf(), '[data-testid="model-selector-panel"]');
      syncModelMenuAttrs(panel);
      if (!isComposerRestyleEnabled() || !panel) {
        clearPanelRowGlyphs();
        if (mPanel || mBar) { teardownCrystalMount(); if (panel) syncModelMenuAttrs(panel); }
        return;
      }
      if (mPanel && mPanel !== panel) { teardownCrystalMount(); syncModelMenuAttrs(panel); }

      syncPanelRowGlyphs(panel);
      if (isEffortSliderOff()) { qa(panel, '[data-testid="orchestrator-effort-bar"]').forEach((b) => b.remove?.()); stopCrystalOnPanel(panel); return; }
      const isOrch = detectPanelIsOrchestrator(panel, primaryModelInfo);
      const isOrchTunable = isOrch && ga(panel, 'data-ces-orch-tunable') === 'true';
      const cesSec = qs(panel, '.ces-ag-section');
      if (cesSec) {
        if (ga(cesSec, 'data-effort-slot') !== 'true') sa(cesSec, 'data-effort-slot', 'true');
        if (qs(cesSec, '[role="separator"]')) setAttrIfChanged(cesSec, 'data-has-sep', '1');
        else if (ha(cesSec, 'data-has-sep')) ra(cesSec, 'data-has-sep');
      }
      const slot = cesSec || panel;

      let bar = qs(panel, '[data-testid="orchestrator-effort-bar"]');
      if (!bar) {
        bar = markNoTr(mk('div', 'ces-ag-effort-row ag-cs-orch-row'));
        sa(bar, 'data-testid', 'orchestrator-effort-bar'); sa(bar, 'data-ag-no-i18n'); sa(bar, 'data-ag-owned', '1');
        const head = markNoTr(mk('div', 'ces-ag-effort-head ag-cs-orch-head'));
        head.appendChild(markNoTr(mk('span', 'ces-ag-effort-title', isZh() ? '推理等级' : 'Reasoning Effort')));
        head.appendChild(markNoTr(mk('span', 'ces-ag-effort-value ag-cs-orch-value', 'Auto')));
        const inline = markNoTr(mk('div', 'ces-inline')), track = mk('div', 'ag-cs-orch-track'), cv = mk('canvas', 'ag-cs-orch-canvas');
        sa(track, 'role', 'status'); sa(track, 'aria-label', 'Orchestrator Auto');
        sa(cv, 'data-orch-crystal-canvas', 'true'); sa(cv, 'aria-hidden', 'true');
        track.appendChild(cv); inline.appendChild(track); bar.appendChild(head); bar.appendChild(inline); slot.appendChild(bar);
      } else if (bar[K_PE] !== slot) slot.appendChild(bar);

      const sRow = qs(panel, EFF_ROW_SEL), sTrk = sRow && qs(sRow, '.ces-track');
      const customStyle = isCustomEffortStyle();
      const canTuneOrch = !!(isOrch && isOrchTunable && sRow && sTrk);
      const useSP = !!(canTuneOrch && !customStyle), useAuto = !!(isOrch && !canTuneOrch), runCrystal = useSP || useAuto;
      let tTrk = qs(bar, '.ag-cs-orch-track'), tCv = qs(bar, ORCH_CV_SEL);
      if (useSP) {
        setAttrIfChanged(sRow, 'data-ag-orch-p', '1'); sTrk[K_CL].add('ag-cs-orch-track');
        let c = qs(sTrk, ORCH_CV_SEL);
        if (!c) {
          c = mk('canvas', 'ag-cs-orch-canvas'); sa(c, 'data-orch-crystal-canvas', 'true'); sa(c, 'aria-hidden', 'true'); sa(c, 'data-ag-owned', '1');
          sTrk.insertBefore(c, sTrk.firstChild);
        }
        tTrk = sTrk; tCv = c;
        if (mWakeTrk !== sTrk) {
          detachSliderWake();
          const onWake = (ev) => {
            mKnobRect = null;
            if (ev && typeof ev.clientX === 'number') syncKnobPrismPointer(ev.clientX, ev.clientY);
            if (!mRaf && mInst && !isHid()) { mLastMs = nowMs(); mRaf = rAF(stepCrystalLoop); }
          };
          try { sTrk.addEventListener('pointerdown', onWake, { passive: true }); } catch {}
          mWakeTrk = sTrk; mWakeFn = onWake;
        }
      } else clearSliderPrismOverlay(panel);

      if (mInst && mCv && mCv !== tCv) { cancelMountRaf(); cancelStepRaf(); try { mInst.dispose?.(); } catch {} mInst = null; }
      if (mTrk !== tTrk) resetKnobCache();
      mPanel = panel; mBar = bar; mTrk = tTrk; mCv = tCv; mHideLock = useSP;

      if (useAuto) setAttrIfChanged(panel, 'data-ag-cs-orch-active', '1'); else ra(panel, 'data-ag-cs-orch-active');
      const uS = String(useAuto), bS = String(!useAuto);
      qa(panel, EFF_ROW_SEL).forEach((row) => { setAttrIfChanged(row, 'data-row-hidden', uS); setAttrIfChanged(row, 'aria-hidden', uS); });

      const switchedIn = runCrystal && !mWasOrch;
      mWasOrch = runCrystal;
      setAttrIfChanged(bar, 'data-row-hidden', bS); setAttrIfChanged(bar, 'aria-hidden', bS);

      if (runCrystal) {
        const kickCrystal = () => {
          if (isDestroyed() || isEffortSliderOff() || !mWasOrch || mPanel !== panel || !panel[K_IC] || !mCv) return;
          const reducedNow = motionReduced(), ambientNow = readRootAmbientFloat();
          if (!mInst && crystalPrismCore?.mountCrystalPrismBar && canMountRealCanvas(mCv)) {
            try {
              mInst = crystalPrismCore.mountCrystalPrismBar(mCv, {
                reduceMotion: reducedNow,
                getState: () => {
                  const dark = isDarkTheme();
                  return {
                    isDark: dark, prismStrength: 1, ambientIntensity: readRootAmbientFloat(),
                    accentTone: resolveCrystalAccentMode(dark), reduceMotion: motionReduced(),
                    hideLock: !!mHideLock, fillRatio: mStepFillRatio !== null ? mStepFillRatio : mHideLock ? readTrackFillRatio(mTrk) : -1,
                  };
                },
              });
            } catch { mInst = null; }
          }
          if (!mInst) return;
          mInst.setReduceMotion?.(reducedNow);
          mStepFillRatio = mHideLock ? readTrackFillRatio(mTrk) : -1;
          const ptr = getLastPointerPos?.() || null;
          if (ptr && ptr.x > -1000) { mInst.setPointerClient(ptr.x, ptr.y); syncKnobPrismPointer(ptr.x, ptr.y); }
          else syncKnobPrismPointer(-9999, -9999);
          if (switchedIn || !mMountedAt) { mMountedAt = nowMs(); if (!reducedNow && ambientNow > 0.001) mInst.wake?.(); }
          try { mInst.step(0.016); } catch {} finally { mStepFillRatio = null; }
          if (mInst.isIdle?.() || isHid()) cancelStepRaf();
          else if (!mRaf) { mLastMs = nowMs(); mRaf = rAF(stepCrystalLoop); }
        };
        if (mInst) kickCrystal();
        else if (!mMountRaf) {
          mMountRaf = rAF(() => { mMountRaf = 0; kickCrystal(); });
          if (!mMountRaf) kickCrystal();
        }
      } else {
        cancelMountRaf(); cancelStepRaf();
        if (mInst) { try { mInst.dispose?.(); } catch {} mInst = null; }
      }
    };

    return {
      readButtonLabelWithoutGlyph,
      stripTranslatedEffortSuffix,
      normalizeModelEffortLabel,
      parseModelLabelInfo,
      resolveMascotCamp,
      parseModelTriggerInfo,
      renderSparkSvg,
      buildBrandMarkSvg,
      cloneCachedSvgElement,
      syncModelGlyphOnButton,
      syncPanelRowGlyphs,
      clearPanelRowGlyphs,
      teardownCrystalMount,
      syncModelSelectorPanel,
      getActiveCrystalTrack: () =>
        mTrk && mWasOrch && mTrk[K_IC] !== false ? mTrk : null,
      setCrystalPointerClient: (x, y) => {
        syncKnobPrismPointer(x, y);
        if (mInst?.setPointerClient) {
          mInst.setPointerClient(x, y);
          if (!mRaf && mWasOrch && mPanel?.[K_IC] !== false && !motionReduced() && !docOf()?.hidden && !mInst.isIdle?.()) {
            mLastMs = performance.now();
            mRaf = rAF(stepCrystalLoop);
          }
        }
      },
    };
  };

  const api = {
    BRAND_PATHS,
    readButtonLabelWithoutGlyph,
    stripTranslatedEffortSuffix,
    normalizeModelEffortLabel,
    parseModelLabelInfo,
    resolveMascotCamp,
    createModelGlyphCrystalController,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  G.__agPrismModelGlyphCrystal = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);

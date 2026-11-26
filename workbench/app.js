(function () {
  'use strict';

  const DEFAULT_TOKENS = {
    palette: 'obsidian',
    theme: 'dark',
    lightPreset: 'crystal',
    radiusBase: 6,
    specularAlpha: 0.095,
    borderAlpha: 0.115,
    glassBlur: 16,
    proseLineHeight: 1.7,
    editorialSerif: true,
    grainAlpha: 0.022,
    prismStrength: 1,
  };

  const MODELS = [
    {
      id: 'orchestrator',
      group: 'Antigravity 编排中枢 · 双阶段托管',
      name: 'Orchestrator',
      camp: 'gemini',
      isOrchestrator: true,
      sampledId: 'Carbon (Plan) ⇄ Exec',
      fallbackId: 'gemini-4-flash-001',
      desc: '规划核深思 ⇄ 执行核快跑 · 自动托管',
      efforts: [],
    },
    {
      id: 'claude-4.6-sonnet',
      group: 'Claude 4.6 系列 · 原生三档',
      name: 'Claude 4.6 Sonnet',
      camp: 'claude',
      sampledId: 'claude-sonnet-4-6-20260929',
      fallbackId: 'claude-haiku-4-5-20260601',
      desc: '日常编码与架构对齐主力 · Low / Med / High',
      efforts: ['low', 'medium', 'high'],
    },
    {
      id: 'claude-4.6-opus',
      group: 'Claude 4.6 系列 · 原生三档',
      name: 'Claude 4.6 Opus',
      camp: 'claude',
      sampledId: 'claude-opus-4-6-20260929',
      fallbackId: 'claude-sonnet-4-5-20260715',
      desc: '深水区重构 · High 满格激活扫掠点阵',
      efforts: ['low', 'medium', 'high'],
    },
    {
      id: 'gemini-4-carbon',
      group: 'Gemini 4 系列 · 原生三档',
      name: 'Gemini 4 Carbon',
      camp: 'gemini',
      sampledId: 'gemini-4-carbon-001',
      fallbackId: 'gemini-4-flash-001',
      desc: '常规旗舰 · 支持 Low / Medium / High',
      efforts: ['low', 'medium', 'high'],
    },
    {
      id: 'gemini-4-hydrogen',
      group: 'Gemini 4 系列 · Hydrogen 极深度',
      name: 'Gemini 4 Hydrogen',
      camp: 'gemini',
      sampledId: 'gemini-4-hydrogen-001',
      fallbackId: 'gemini-4-carbon-001',
      desc: '极深度推理 · 支持 Low..Extra (xhigh)',
      efforts: ['low', 'medium', 'high', 'xhigh'],
    },
    {
      id: 'gpt-oss-120b',
      group: 'Fixed Depth · 单档锁定对照',
      name: 'GPT-OSS 120B (Medium)',
      camp: 'gemini',
      sampledId: 'gpt-oss-120b-medium',
      fallbackId: 'gemini-4-flash-lite',
      desc: '固定深度 · 触发 .is-locked 置灰锁定态',
      efforts: ['medium'],
    },
  ];

  const ALL_EFFORTS = [
    { id: 'low', label: 'Low', short: 'LOW', title: '轻量快速推演', bars: 1 },
    { id: 'medium', label: 'Medium', short: 'MED', title: '均衡常规推理', bars: 2 },
    { id: 'high', label: 'High', short: 'HIGH', title: '深度架构推演', bars: 3, top: true },
    { id: 'xhigh', label: 'Extra', short: 'EXTRA', title: '高功耗强化推理', bars: 4, spectrum: true },
  ];

  const SESSIONS = [
    { id: 'studio-home', group: '置顶', title: 'Studio 首页与全屏波纹光晕', time: '实时', scene: 'studio' },
    { id: 'm3-surface-lab', group: '今天', title: 'M3 四大死角实景舱 (True CSS)', time: '实景', scene: 'm3lab' },
    { id: 'v2-refactor', group: '今天', title: 'Obsidian Prism 视觉重构', time: '刚刚', scene: 'chat' },
    { id: 'effort-merge', group: '今天', title: '原版 1:1 推理等级滑块', time: '运行中', scene: 'effort', running: true },
    { id: 'dash-fastpath', group: '过去 7 天', title: '实体光学水试管与模型验真', time: '昨天', scene: 'dashboard' },
    { id: 'theme-tokens', group: '过去 7 天', title: '外观设置与小蟹堆开关', time: '3d', scene: 'settings' },
  ];

  const TIME_RANGE_STATS = {
    '7d': {
      books: '3.1 本书',
      sub: '累计 782K Tokens · 312 条消息 · 主力模型 Gemini 4 Carbon',
      scale: 0.78,
    },
    '30d': {
      books: '14.2 本书',
      sub: '累计 3.56M Tokens · 1,284 条消息 · 主力模型 Gemini 4 Carbon',
      scale: 1,
    },
    all: {
      books: '84.6 本书',
      sub: '累计 21.6M Tokens · 10,254 条消息 · 主力模型 Gemini 4 Carbon',
      scale: 1.18,
    },
  };

  const STREAM_FULL_PARAGRAPHS = [
    {
      type: 'h3',
      text: '1. 唯一输入框棱镜与零色偏黑灰钛',
    },
    {
      type: 'p',
      html: '将 <code>Obsidian Neutral</code> 的冷峻黑灰钛底盘全面降噪，仅在底部唯一主焦点 <code>[data-testid="agent-input-box"]</code> 保留四色光学棱镜追光边，其余浮窗与卡片回到干净的 <code>1px</code> 顶边内高光。',
    },
    {
      type: 'h3',
      text: '2. 512K 无凹坑悬浮水试管与深海连续电离光谱',
    },
    {
      type: 'p',
      html: '右侧浮窗顶部接入 <code>Sampled Model</code> 真实响应验真栏，左侧无框悬浮 WebGL2 硼硅水试管升级为 <code>512K</code> 容量基准（<code>128k / 256k / 384k</code> 激光微刻线）与深海连续电离冷光谱。',
    },
  ];

  const state = {
    tokens: { ...DEFAULT_TOKENS },
    viewMode: 'single', // 'single' | 'split' | 'matrix'
    scene: 'studio', // 'studio' | 'chat' | 'effort' | 'dashboard' | 'settings'
    inspectorOpen: true,
    timeRange: '30d', // '7d' | '30d' | 'all'
    activeModelId: 'gemini-4-carbon',
    effortByModel: {
      'claude-4.6-sonnet': 'medium',
      'claude-4.6-opus': 'high',
      'gemini-4-carbon': 'high',
      'gemini-4-hydrogen': 'xhigh',
      'gpt-oss-120b': 'medium',
    },
    openPopover: null, // null | 'effort' | 'dashboard'
    overlayDemo: null, // null | 'takeover' | 'slash'
    mascotYieldMode: 'none', // 'none' | 'leap' | 'peek'
    mascotMiniPile: false,
    userBubbleExpanded: false,
    thinkingOpen: false,
    streamPhase: 'done', // 'done' | 'streaming'
    streamWordProgress: 999,
    convAuraPhase: 'idle', // 'idle' | 'start' | 'running' | 'complete'
    convAuraPhaseAt: 0,
    liftoffEbbAt: 0,
    motionLevel: 'ultra', // 'off' | 'subtle' | 'standard' | 'ultra'
    hasToolError: false,
    cacheCleanStep: 'idle', // 'idle' | 'confirm' | 'done'
    cacheTimerId: 0,
    contextVialEnabled: true,
    vialStreaming: false,
    vialCritical: false,
    telemetryModule: 'auto',
    effortSliderModule: 'auto',
    hoveredSlice: -1, // -1 | 0 | 1 | 2
    sampleSimMode: 'ok', // 'ok' | 'fallback' | 'unreliable'
    rippleEnabled: true,
    sidebarCollapsed: false,
    sidebarSearchOpen: false,
    sidebarSearchQuery: '',
    sidebarCollapsedGroups: {},
    workspaceName: 'obsidian-prism',
    m3ActiveSlashIdx: 1,
    m3DiffStatus: 'pending', // 'pending' | 'accepted' | 'rejected'
    m3SwitchOn: true,
    m3ToastType: 'info', // 'info' | 'success' | 'warning' | 'error'
  };

  let rippleControllers = [];
  let convAuraControllers = [];
  let vialControllers = [];
  let crystalControllers = [];
  let sliderControllers = [];
  let mascotControllers = [];
  let masterRafId = 0;
  let masterSleeping = false;
  let masterFrameTicks = 0;
  let lastFrameMs = 0;
  let streamTimerId = 0;
  let windowBlurredLong = false;
  let blurTimeoutId = 0;
  let lastPointerPos = { x: -9999, y: -9999 };
  let prismDirty = false;
  let prismRafId = 0;

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // 微标签中英混排：西文保持等宽大写字距，中文段落切回无衬线且零字距，避免中文被拉散下沉
  function fmtMicroLabel(text) {
    return escapeHtml(text).replace(/([\u3000-\u303f\u3400-\u9fff\uff00-\uffef]+)/g, '<span class="ag-cjk">$1</span>');
  }

  // 是否需要减弱动态（含 motionLevel === 'off'）
  function prefersReducedMotion() {
    if (state.motionLevel === 'off') return true;
    return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  // 视图级切换：支持时用 View Transitions 做 200ms 交叉淡化，否则直接执行
  function withViewTransition(fn) {
    if (
      typeof document.startViewTransition === 'function' &&
      !prefersReducedMotion() &&
      state.motionLevel !== 'subtle' &&
      !document.hidden
    ) {
      try {
        document.startViewTransition(() => fn());
        return;
      } catch {}
    }
    fn();
  }

  function getGreetingLabel() {
    const h = new Date().getHours();
    if (h < 6) return '夜深了，准备构建什么？';
    if (h < 12) return '早安，准备构建什么？';
    if (h < 18) return '下午好，准备构建什么？';
    return '晚上好，准备构建什么？';
  }

  function getActiveModel() {
    return MODELS.find((m) => m.id === state.activeModelId) || MODELS[3] || MODELS[0];
  }

  function getActiveEffortMeta() {
    const model = getActiveModel();
    if (model.isOrchestrator) {
      return { id: 'auto', label: 'Auto', short: 'AUTO', title: '双阶段智能托管', bars: 4, orchestrator: true };
    }
    const curId = state.effortByModel[model.id] || model.efforts[0];
    return ALL_EFFORTS.find((e) => e.id === curId) || ALL_EFFORTS[1];
  }

  /* ── Official Brand Vector Marks, Google Spark Orbit & Animated Icons Bridge ── */
  const BRAND_PATHS = {
    gemini:
      'M24 12.024c-6.437.388-11.59 5.539-11.977 11.976h-.047C11.588 17.563 6.436 12.412 0 12.024v-.047C6.437 11.588 11.588 6.437 11.976 0h.047c.388 6.437 5.54 11.588 11.977 11.977z',
    claude:
      'm4.714 15.956l4.718-2.648l.079-.23l-.08-.128h-.23l-.79-.048l-2.695-.073l-2.337-.097l-2.265-.122l-.57-.121l-.535-.704l.055-.353l.48-.321l.685.06l1.518.104l2.277.157l1.651.098l2.447.255h.389l.054-.158l-.133-.097l-.103-.098l-2.356-1.596l-2.55-1.688l-1.336-.972l-.722-.491L2 6.223l-.158-1.008l.656-.722l.88.06l.224.061l.893.686l1.906 1.476l2.49 1.833l.364.304l.146-.104l.018-.072l-.164-.274l-1.354-2.446l-1.445-2.49l-.644-1.032l-.17-.619a3 3 0 0 1-.103-.729L6.287.133L6.7 0l.995.134l.42.364l.619 1.415L9.735 4.14l1.555 3.03l.455.898l.243.832l.09.255h.159V9.01l.127-1.706l.237-2.095l.23-2.695l.08-.76l.376-.91l.747-.492l.583.28l.48.685l-.067.444l-.286 1.851l-.558 2.903l-.365 1.942h.213l.243-.242l.983-1.306l1.652-2.064l.728-.82l.85-.904l.547-.431h1.032l.759 1.129l-.34 1.166l-1.063 1.347l-.88 1.142l-1.263 1.7l-.79 1.36l.074.11l.188-.02l2.853-.606l1.542-.28l1.84-.315l.832.388l.09.395l-.327.807l-1.967.486l-2.307.462l-3.436.813l-.043.03l.049.061l1.548.146l.662.036h1.62l3.018.225l.79.522l.473.638l-.08.485l-1.213.62l-1.64-.389l-3.825-.91l-1.31-.329h-.183v.11l1.093 1.068l2.003 1.81l2.508 2.33l.127.578l-.321.455l-.34-.049l-2.204-1.657l-.85-.747l-1.925-1.62h-.127v.17l.443.649l2.343 3.521l.122 1.08l-.17.353l-.607.213l-.668-.122l-1.372-1.924l-1.415-2.168l-1.141-1.943l-.14.08l-.674 7.254l-.316.37l-.728.28l-.607-.461l-.322-.747l.322-1.476l.388-1.924l.316-1.53l.285-1.9l.17-.632l-.012-.042l-.14.018l-1.432 1.967l-2.18 2.945l-1.724 1.845l-.413.164l-.716-.37l.066-.662l.401-.589l2.386-3.036l1.439-1.882l.929-1.086l-.006-.158h-.055L4.138 18.56l-1.13.146l-.485-.456l.06-.746l.231-.243l1.907-1.312Z',
    openai:
      'M20.562 10.188c.25-.688.313-1.376.25-2.063c-.062-.687-.312-1.375-.625-2c-.562-.937-1.375-1.687-2.312-2.125c-1-.437-2.063-.562-3.125-.312c-.5-.5-1.063-.938-1.688-1.25S11.687 2 11 2a5.17 5.17 0 0 0-3 .938c-.875.624-1.5 1.5-1.813 2.5c-.75.187-1.375.5-2 .875c-.562.437-1 1-1.375 1.562c-.562.938-.75 2-.625 3.063a5.44 5.44 0 0 0 1.25 2.874a4.7 4.7 0 0 0-.25 2.063c.063.688.313 1.375.625 2c.563.938 1.375 1.688 2.313 2.125c1 .438 2.062.563 3.125.313c.5.5 1.062.937 1.687 1.25S12.312 22 13 22a5.17 5.17 0 0 0 3-.937c.875-.625 1.5-1.5 1.812-2.5a4.54 4.54 0 0 0 1.938-.875c.562-.438 1.062-.938 1.375-1.563c.562-.937.75-2 .625-3.062c-.125-1.063-.5-2.063-1.188-2.876m-7.5 10.5c-1 0-1.75-.313-2.437-.875c0 0 .062-.063.125-.063l4-2.312a.5.5 0 0 0 .25-.25a.57.57 0 0 0 .062-.313V11.25l1.688 1v4.625a3.685 3.685 0 0 1-3.688 3.813M5 17.25c-.438-.75-.625-1.625-.438-2.5c0 0 .063.063.125.063l4 2.312a.56.56 0 0 0 .313.063c.125 0 .25 0 .312-.063l4.875-2.812v1.937l-4.062 2.375A3.7 3.7 0 0 1 7.312 19c-1-.25-1.812-.875-2.312-1.75M3.937 8.563a3.8 3.8 0 0 1 1.938-1.626v4.751c0 .124 0 .25.062.312a.5.5 0 0 0 .25.25l4.875 2.813l-1.687 1l-4-2.313a3.7 3.7 0 0 1-1.75-2.25c-.25-.937-.188-2.062.312-2.937M17.75 11.75l-4.875-2.812l1.687-1l4 2.312c.625.375 1.125.875 1.438 1.5s.5 1.313.437 2.063a3.7 3.7 0 0 1-.75 1.937c-.437.563-1 1-1.687 1.25v-4.75c0-.125 0-.25-.063-.312c0 0-.062-.126-.187-.188m1.687-2.5s-.062-.062-.125-.062l-4-2.313c-.125-.062-.187-.062-.312-.062s-.25 0-.313.062L9.812 9.688V7.75l4.063-2.375c.625-.375 1.312-.5 2.062-.5c.688 0 1.375.25 2 .688c.563.437 1.063 1 1.313 1.625s.312 1.375.187 2.062m-10.5 3.5l-1.687-1V7.063c0-.688.187-1.438.562-2C8.187 4.438 8.75 4 9.375 3.688a3.37 3.37 0 0 1 2.062-.313c.688.063 1.375.375 1.938.813c0 0-.063.062-.125.062l-4 2.313a.5.5 0 0 0-.25.25c-.063.125-.063.187-.063.312zm.875-2L12 9.5l2.187 1.25v2.5L12 14.5l-2.188-1.25z',
  };

  function renderSparkOrbitMark(opts = {}) {
    const size = opts.size || 15;
    const tier = opts.tier || 'auto';
    const monochrome = Boolean(opts.monochrome);
    const className = opts.className || '';
    const icons = globalThis.__agAnimatedIcons;
    if (icons && typeof icons.renderGoogleSparkOrbitSvg === 'function') {
      const rendered = icons.renderGoogleSparkOrbitSvg({ size, tier, monochrome, className });
      if (rendered) {
        if (className && !rendered.includes(className)) {
          if (/class="([^"]*)"/.test(rendered)) {
            return rendered.replace(/class="([^"]*)"/, `class="$1 ${className}"`);
          }
          return rendered.replace('<svg', `<svg class="${className}"`);
        }
        return rendered;
      }
    }
    // 正统官方单星静态兜底（零碎豆、零断裂外弧）
    const cls = className ? ` class="${className}"` : '';
    const sparkFill = monochrome ? 'currentColor' : '#669DF6';
    return `<svg${cls} width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 1.2c.25 0 .47.17.53.41c.21.79.48 1.56.8 2.31c1.23 2.86 3.39 5.02 6.25 6.25c.75.32 1.52.59 2.31.8c.24.06.41.28.41.53s-.17.47-.41.53a16 16 0 0 0-2.31.8c-2.86 1.23-5.02 3.39-6.25 6.25c-.32.75-.59 1.52-.8 2.31a.55.55 0 0 1-.53.41a.55.55 0 0 1-.53-.41a16 16 0 0 0-.8-2.31c-1.23-2.86-3.39-5.02-6.25-6.25a16 16 0 0 0-2.31-.8A.55.55 0 0 1 1.2 12c0-.25.17-.47.41-.53c.79-.21 1.56-.48 2.31-.8c2.86-1.23 5.02-3.39 6.25-6.25c.32-.75.59-1.52.8-2.31c.06-.24.28-.41.53-.41Z" fill="${sparkFill}"/></svg>`;
  }

  function renderAnimIcon(name, opts = {}) {
    const size = opts.size || 14;
    const className = opts.className || '';
    const active = Boolean(opts.active);
    const icons = globalThis.__agAnimatedIcons;
    if (icons && typeof icons.renderIcon === 'function') {
      const svg = icons.renderIcon(name, { size, className, active });
      if (svg) {
        if (svg.includes('data-anim-icon=')) return svg;
        return svg.replace('<svg', `<svg data-anim-icon="${name}"`);
      }
    }
    const cls = className ? ` class="${className}"` : '';
    return `<svg${cls} data-anim-icon="${name}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/></svg>`;
  }

  function syncMotionSpringTokens() {
    const me = globalThis.__agMotionEngine;
    if (!me || typeof me.springLinear !== 'function') return;
    try {
      const sp = me.springLinear({ stiffness: 420, damping: 32, mass: 1 });
      const easing = typeof sp === 'string' ? sp : sp && (sp.easing || sp.linear || sp.cssEasing || sp.css);
      const durMs = sp && typeof sp === 'object' ? (sp.durationMs || sp.duration || 300) : 300;
      if (easing) {
        document.documentElement.style.setProperty('--ag-spring-sidebar-ease', easing);
        document.documentElement.style.setProperty('--ag-spring-sidebar-dur', `${Math.round(durMs)}ms`);
        document.querySelectorAll('.ag-v2-stage').forEach((st) => {
          st.style.setProperty('--ag-spring-sidebar-ease', easing);
          st.style.setProperty('--ag-spring-sidebar-dur', `${Math.round(durMs)}ms`);
        });
      }
    } catch {}
  }

  function runGlide(indicatorEl, prevRect, nextRect, opts) {
    if (!indicatorEl || !prevRect || !nextRect || prefersReducedMotion()) return;
    const me = globalThis.__agMotionEngine;
    if (me && typeof me.glideIndicator === 'function') {
      try {
        me.glideIndicator(indicatorEl, prevRect, nextRect, opts);
      } catch {}
    }
  }

  function triggerAnimIcon(elOrBtn, stateName, opts) {
    if (!elOrBtn || prefersReducedMotion()) return;
    const me = globalThis.__agMotionEngine;
    if (me && typeof me.triggerIcon === 'function') {
      try {
        me.triggerIcon(elOrBtn, stateName, opts);
      } catch {}
    }
  }

  function hydrateShellIcons() {
    const icons = globalThis.__agAnimatedIcons;
    if (icons && typeof icons.renderGoogleSparkOrbitDataUri === 'function') {
      const fav = document.querySelector('link[rel="icon"]');
      if (fav) {
        fav.setAttribute('href', icons.renderGoogleSparkOrbitDataUri({ size: 32, tier: 'auto', monochrome: false }));
      }
    }
    const brandMark = document.getElementById('wb-brand-mark');
    if (brandMark) {
      // 顶栏调试壳采用极简纯单色银白官方双曲星，只在底部激活模型态点亮柔光四色
      brandMark.innerHTML = renderSparkOrbitMark({ size: 14, tier: 'auto', monochrome: true });
    }
    document.querySelectorAll('[data-wb-icon]').forEach((slot) => {
      const rawIcon = slot.getAttribute('data-wb-icon');
      let safeIcon = '';
      if (rawIcon === 'layers-stack') safeIcon = 'layers-stack';
      else if (rawIcon === 'sun-moon') safeIcon = 'sun-moon';
      else if (rawIcon === 'sliders-tune') safeIcon = 'sliders-tune';
      if (!safeIcon) return;
      const size = safeIcon === 'sliders-tune' ? 14 : 13;
      slot.innerHTML = renderAnimIcon(safeIcon, { size });
    });
  }

  function getModelBrand(model) {
    if (!model) return 'gemini';
    if (model.isOrchestrator || model.id === 'orchestrator') return 'antigravity';
    if (model.camp === 'claude' || model.id.startsWith('claude')) return 'claude';
    if (model.id.startsWith('gpt')) return 'openai';
    return 'gemini';
  }

  function getModelEffortTier(model, effortMeta) {
    if (!model) return 'medium';
    if (model.isOrchestrator) return 'auto';
    if (model.efforts.length <= 1) return 'fixed';
    return (effortMeta && effortMeta.id) || 'medium';
  }

  function buildBrandMarkSvg(brand, size = 14, extraClass = '', opts = {}) {
    if (brand === 'antigravity') {
      return renderSparkOrbitMark({
        size,
        tier: opts.tier || 'auto',
        monochrome: Boolean(opts.monochrome),
        className: extraClass,
      });
    }
    const d = BRAND_PATHS[brand] || BRAND_PATHS.gemini;
    const cls = extraClass ? ` class="${extraClass}"` : '';
    return `<svg${cls} width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="${d}" fill="currentColor" fill-rule="evenodd"/></svg>`;
  }

  function buildTriggerGlyphInnerSvg(brand, tier) {
    if (brand === 'antigravity') {
      return renderSparkOrbitMark({
        size: 17,
        tier: tier || 'auto',
        monochrome: false,
        className: 'ag-v2-model-glyph-svg',
      });
    }
    const d = BRAND_PATHS[brand] || BRAND_PATHS.gemini;
    const coreR = brand === 'gemini' ? '2.7' : '2.1';
    const fixedLock =
      tier === 'fixed'
        ? '<g class="ag-v2-glyph-lock"><rect x="15.2" y="16.2" width="8.6" height="6.8" rx="1.6"/><path d="M17.3 16.2v-1.7a2.2 2.2 0 1 1 4.4 0v1.7" fill="none" stroke-width="1.5"/></g>'
        : '';
    return `
      <svg class="ag-v2-model-glyph-svg" width="17" height="17" viewBox="-4 -4 32 32" fill="none" aria-hidden="true">
        <g class="ag-v2-glyph-orbit-group">
          <ellipse class="ag-v2-glyph-orbit" cx="12" cy="12" rx="14.5" ry="6.2" transform="rotate(-24 12 12)" />
          <circle class="ag-v2-glyph-sat is-a" cx="25.2" cy="6.1" r="1.65" />
          <circle class="ag-v2-glyph-sat is-b" cx="-1.2" cy="17.9" r="1.25" />
        </g>
        <path class="ag-v2-glyph-body" d="${d}" fill-rule="evenodd" />
        <circle class="ag-v2-glyph-core" cx="12" cy="12" r="${coreR}" />
        ${fixedLock}
      </svg>`;
  }

  function buildModelEffortGlyphHtml(model, effortMeta) {
    const brand = getModelBrand(model);
    const tier = getModelEffortTier(model, effortMeta);
    return `<span class="ag-v2-model-glyph" data-composer-model-glyph="true" data-brand="${brand}" data-tier="${tier}">${buildTriggerGlyphInnerSvg(brand, tier)}</span>`;
  }

  function buildOrbitalGeometrySvg() {
    return `
      <div class="ag-v2-orbital-backdrop" data-orbital-geometry="true" aria-hidden="true">
        <svg class="ag-v2-orbital-svg" viewBox="0 0 760 280" fill="none" preserveAspectRatio="none">
          <ellipse class="ag-v2-orbit-arc is-primary" cx="468" cy="136" rx="348" ry="118" transform="rotate(-10 468 136)" />
          <ellipse class="ag-v2-orbit-arc is-dashed" cx="468" cy="136" rx="252" ry="82" transform="rotate(-10 468 136)" />
          <g class="ag-v2-orbit-reticle" transform="translate(466 36)">
            <path d="M-4 0H4M0 -4V4" />
          </g>
          <g class="ag-v2-orbit-reticle" transform="translate(216 184)">
            <path d="M-3.5 0H3.5M0 -3.5V3.5" />
          </g>
          <g class="ag-v2-orbit-reticle" transform="translate(698 92)">
            <path d="M-3.5 0H3.5M0 -3.5V3.5" />
          </g>
          <circle class="ag-v2-orbit-node is-cobalt" cx="634" cy="54" r="2.2" />
          <circle class="ag-v2-orbit-node is-iris" cx="308" cy="64" r="1.8" />
          <circle class="ag-v2-orbit-node is-amber" cx="566" cy="212" r="1.8" />
        </svg>
      </div>`;
  }

  function getContextTelemetry() {
    if (state.vialCritical) {
      return {
        pct: 89.5,
        usedText: '458.2k / 512k',
        pctText: '89.5%',
        sysK: '44.0k',
        convK: '276.8k',
        toolsK: '137.4k',
        ratios: [0.086, 0.541, 0.268],
        maxTokens: 512000,
        rate: '84.2 tok/s',
      };
    }
    return {
      pct: 46.5,
      usedText: '238.1k / 512k',
      pctText: '46.5%',
      sysK: '38.9k',
      convK: '136.2k',
      toolsK: '63.0k',
      ratios: [0.076, 0.266, 0.123],
      maxTokens: 512000,
      rate: state.vialStreaming ? '74.8 tok/s' : 'IDLE',
    };
  }

  function getModelSamplingTelemetry() {
    const model = getActiveModel();
    if (state.sampleSimMode === 'fallback') {
      return {
        status: 'fallback',
        badgeText: 'FALLBACK',
        selectedName: model.name,
        sampledModel: model.fallbackId,
        ttftText: '1.84s',
        tpsText: '42.1 tok/s',
        note: '检测到与所选模型不一致，已触发降级路由',
      };
    }
    if (state.sampleSimMode === 'unreliable') {
      return {
        status: 'unreliable',
        badgeText: '计时异常',
        selectedName: model.name,
        sampledModel: model.sampledId,
        ttftText: '0.00s',
        tpsText: '--',
        note: '首包时间样本异常，已屏蔽失真 TPS 读数',
      };
    }
    return {
      status: 'ok',
      badgeText: 'VERIFIED',
      selectedName: model.name,
      sampledModel: model.sampledId,
      ttftText: model.camp === 'claude' ? '0.46s' : '0.32s',
      tpsText: state.vialCritical ? '84.2 tok/s' : '74.8 tok/s',
      note: '实测响应 generatorMetadata.chatModel 一致',
    };
  }

  function buildHeatmapCells() {
    const scale = TIME_RANGE_STATS[state.timeRange].scale;
    const cells = [];
    for (let w = 0; w < 26; w++) {
      for (let d = 0; d < 7; d++) {
        const idx = w * 7 + d;
        const hash = ((idx * 1103515245 + 12345) >>> 16) & 0xff;
        let level = 0;
        const boosted = Math.min(255, Math.round(hash * scale));
        if (state.timeRange === '7d' && w < 24) {
          level = 0;
        } else if (w > 19 && d < 6) {
          level = (boosted % 5) + (boosted > 205 ? 1 : 0);
        } else if (boosted > 220) {
          level = 5;
        } else if (boosted > 180) {
          level = 4;
        } else if (boosted > 138) {
          level = 3;
        } else if (boosted > 98) {
          level = 2;
        } else if (boosted > 62) {
          level = 1;
        }
        level = Math.min(5, Math.max(0, level));
        // 0 延迟玻璃提示：data-tip 交给委托式浮动胶囊；--i 供切换时段的按列错峰淡入
        const dayLabel = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'][d];
        const msgCount = level === 0 ? 0 : Math.round(level * 9 + (boosted % 11));
        cells.push(`<span class="ag-v2-heat-cell" data-level="${level}" style="--i:${w}" data-tip="第 ${w + 1} 周 · ${dayLabel}|${msgCount} 条消息 · L${level}"></span>`);
      }
    }
    return cells.join('');
  }

  function buildInlineCacheHtml() {
    if (state.cacheCleanStep === 'confirm') {
      return `
        <span class="ag-v2-inline-cleaner">
          <span>释放 118 MB?</span>
          <button type="button" class="ag-v2-inline-btn" data-tone="warn" data-action="cache-confirm">确认</button>
          <button type="button" class="ag-v2-inline-btn" data-action="cache-cancel">取消</button>
        </span>`;
    }
    if (state.cacheCleanStep === 'done') {
      return `
        <span class="ag-v2-inline-cleaner">
          <span>轨迹缓存 24 MB (已释放 118 MB)</span>
          <button type="button" class="ag-v2-inline-btn" data-tone="ok" data-action="cache-reset">还原演示</button>
        </span>`;
    }
    return `
      <span class="ag-v2-inline-cleaner">
        <span>轨迹缓存 142 MB</span>
        <button type="button" class="ag-v2-inline-btn" data-action="cache-start">${renderAnimIcon('trash-sweep', { size: 12 })}<span>清理</span></button>
      </span>`;
  }

  function buildModelPanelHtml(isFloating = true) {
    const model = getActiveModel();
    const isOrch = Boolean(model.isOrchestrator);
    const curEffortId = isOrch ? 'high' : (state.effortByModel[model.id] || model.efforts[0]);
    const curMeta = getActiveEffortMeta();

    const groups = [];
    const seen = new Set();
    for (const m of MODELS) {
      if (!seen.has(m.group)) {
        seen.add(m.group);
        groups.push(m.group);
      }
    }

    const listHtml = groups
      .map((grp) => {
        const items = MODELS.filter((m) => m.group === grp)
          .map((m) => {
            const selected = m.id === model.id;
            const mOrch = Boolean(m.isOrchestrator);
            const mLocked = !mOrch && m.efforts.length <= 1;
            const mEffortKey = state.effortByModel[m.id] || m.efforts[0];
            const mEffortMeta = ALL_EFFORTS.find((e) => e.id === mEffortKey) || ALL_EFFORTS[1];
            const tagText = mOrch ? 'Auto' : mLocked ? 'Fixed' : mEffortMeta.label;
            const mBrand = getModelBrand(m);
            return `
              <button type="button" class="ag-v2-model-option" data-action="pick-model" data-model-id="${m.id}" data-brand="${mBrand}" data-selected="${selected}">
                <span class="ag-v2-model-option-main">
                  <span class="ag-v2-option-logo" data-brand="${mBrand}">${buildBrandMarkSvg(mBrand, 15, '', { tier: selected ? 'auto' : 'low', monochrome: !selected })}</span>
                  <span class="ag-v2-model-option-copy">
                    <div class="ag-v2-model-name">${escapeHtml(m.name)}</div>
                    <div class="ag-v2-model-sub">${fmtMicroLabel(m.desc)}</div>
                  </span>
                </span>
                <span class="ag-v2-effort-tag" data-model-effort-tag="${m.id}" data-orch="${mOrch}">${tagText}</span>
              </button>`;
          })
          .join('');
        return `<div class="ag-v2-model-group-label">${fmtMicroLabel(grp)}</div>${items}`;
      })
      .join('');

    return `
      <div class="ag-v2-popover ${isFloating ? 'ag-v2-popover-docked is-left' : ''}" data-testid="model-selector-panel">
        <div class="ag-v2-popover-inner">
          <div class="ag-v2-model-list">${listHtml}</div>
          <div class="ces-ag-section" data-effort-slot="true">
            <div class="ces-ag-effort-row" data-ces-effort-row="true" data-row-hidden="${isOrch}" aria-hidden="${isOrch}">
              <div class="ces-ag-effort-head">
                <span class="ces-ag-effort-title">推理等级</span>
                <span class="ces-ag-effort-value">${escapeHtml(curMeta.label)}</span>
              </div>
              <div class="ces-inline" data-workbench-ces-mount="true" data-effort="${escapeHtml(curEffortId)}"></div>
            </div>
            <div class="ces-ag-effort-row ag-v2-orch-row" data-testid="orchestrator-effort-bar" data-row-hidden="${!isOrch}" aria-hidden="${!isOrch}">
              <div class="ces-ag-effort-head">
                <span class="ces-ag-effort-title">推理等级</span>
                <span class="ces-ag-effort-value ag-v2-orch-value">Auto</span>
              </div>
              <div class="ces-inline">
                <div class="ag-v2-orch-track" role="status" title="Orchestrator 固定切割光学水晶托管（Plan ⇄ Exec 自动调度，鼠标靠近触发小范围棱镜色散）" aria-label="Orchestrator 固定切割水晶棱镜推理条（Auto）">
                  <canvas class="ag-v2-orch-canvas" data-orch-crystal-canvas="true" aria-hidden="true"></canvas>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>`;
  }

  function buildDashboardPanelHtml(isFloating = true) {
    const ctx = getContextTelemetry();
    const samp = getModelSamplingTelemetry();
    const model = getActiveModel();
    const vialOn = Boolean(state.contextVialEnabled);
    const claudePct = state.vialCritical ? 12 : 82;
    const proPct = state.vialCritical ? 46 : 94;
    const flashPct = 100;
    const isCrit = state.vialCritical;
    const sysColor = isCrit ? '#C75714' : '#1B49B2';
    const convColor = isCrit ? '#F59E0B' : '#3186FF';
    const toolColor = isCrit ? '#FFDB47' : '#5CC6FC';

    const leftColumnHtml = vialOn
      ? `
            <div class="ag-v2-radar-left">
              <div class="ag-v2-vial-well">
                <div class="ag-v2-vial-readout">
                  <span class="ag-v2-vial-readout-label">512K</span>
                  <strong class="ag-v2-vial-readout-val" data-warn="${state.vialCritical}">${escapeHtml(ctx.pctText)}</strong>
                </div>
                <canvas class="ag-v2-vial-canvas" data-vial-canvas="true" width="192" height="440" title="512K 容量 (128k / 256k / 384k 激光微刻线) · 轻点拨动水波，拖拽采样栏可重力晃动流体舱"></canvas>
                <div class="ag-v2-vial-rate">${escapeHtml(ctx.rate)}</div>
              </div>
            </div>`
      : '';

    const minimalBarHtml = !vialOn
      ? `
                <div class="ag-v2-ctx-bar-wrap" data-testid="context-minimal-bar" data-warn="${state.vialCritical}" data-camp="${model.camp}">
                  <div class="ag-v2-ctx-bar-track" data-has-hover="${state.hoveredSlice >= 0}">
                    <span class="ag-v2-ctx-bar-seg" data-layer-slice="0" data-hovered="${state.hoveredSlice === 0}" style="width:${(ctx.ratios[0] * 100).toFixed(2)}%; --seg-color:${sysColor};" title="系统规则 System · ${escapeHtml(ctx.sysK)}"></span>
                    <span class="ag-v2-ctx-bar-seg" data-layer-slice="1" data-hovered="${state.hoveredSlice === 1}" style="width:${(ctx.ratios[1] * 100).toFixed(2)}%; --seg-color:${convColor};" title="对话轮次 Conversation · ${escapeHtml(ctx.convK)}"></span>
                    <span class="ag-v2-ctx-bar-seg" data-layer-slice="2" data-hovered="${state.hoveredSlice === 2}" style="width:${(ctx.ratios[2] * 100).toFixed(2)}%; --seg-color:${toolColor};" title="工具与子代理 Tools · ${escapeHtml(ctx.toolsK)}"></span>
                    <i class="ag-v2-ctx-bar-threshold" aria-hidden="true" title="85% 临界压缩阈值 (435.2k / 512k)"></i>
                  </div>
                  <div class="ag-v2-ctx-bar-meta">
                    <span>容量 ${escapeHtml(ctx.usedText)}</span>
                    <span>刻度 128k·256k·384k</span>
                  </div>
                </div>`
      : '';

    return `
      <div class="ag-v2-popover ag-v2-dash-popover ${isFloating ? 'ag-v2-popover-docked is-right' : ''}" data-testid="quota-radar-popover" data-vial-mode="${vialOn ? 'vial' : 'bar'}">
        <div class="ag-v2-popover-inner">
          <div class="ag-v2-radar-layout">${leftColumnHtml}

            <div class="ag-v2-radar-right">
              <div class="ag-v2-sample-bar" data-testid="model-sampling-bar" data-status="${samp.status}">
                <div class="ag-v2-sample-top">
                  <span class="ag-v2-sample-title">真实模型采样验真</span>
                  <span class="ag-v2-sample-badge">${escapeHtml(samp.badgeText)}</span>
                </div>
                <div class="ag-v2-sample-id" title="${escapeHtml(samp.note)}">${escapeHtml(samp.selectedName)} → ${escapeHtml(samp.sampledModel)}</div>
                <div class="ag-v2-sample-meta">
                  <span>TTFT ${escapeHtml(samp.ttftText)}</span>
                  <span>TPS ${escapeHtml(samp.tpsText)}</span>
                </div>
              </div>

              <div>
                <div class="ag-v2-radar-sec-head">
                  <span class="ag-v2-radar-label">${vialOn ? '深海电离光谱' : '上下文用量'}</span>
                  <span class="ag-v2-radar-head-right">
                    <span class="ag-v2-ctx-readout" data-warn="${state.vialCritical}">${escapeHtml(ctx.usedText)} · ${escapeHtml(ctx.pctText)}</span>
                    <button type="button" class="ag-v2-vial-mode-pill" data-testid="radar-vial-mode-toggle" data-action="toggle-context-vial" data-on="${vialOn}" title="${vialOn ? '关闭实体试管，切换为极简长条' : '开启电离星尘流体舱'}">${vialOn ? '试管' : '长条'}</button>
                  </span>
                </div>${minimalBarHtml}
                <div class="ag-v2-layer-list">
                  <div class="ag-v2-layer-row" data-layer-slice="0" data-hovered="${state.hoveredSlice === 0}">
                    <span class="ag-v2-layer-key"><i class="ag-v2-swatch" style="background:${sysColor};"></i>系统规则 System</span>
                    <span class="ag-v2-layer-val">${escapeHtml(ctx.sysK)}</span>
                  </div>
                  <div class="ag-v2-layer-row" data-layer-slice="1" data-hovered="${state.hoveredSlice === 1}">
                    <span class="ag-v2-layer-key"><i class="ag-v2-swatch" style="background:${convColor};"></i>对话轮次 Conversation</span>
                    <span class="ag-v2-layer-val">${escapeHtml(ctx.convK)}</span>
                  </div>
                  <div class="ag-v2-layer-row" data-layer-slice="2" data-hovered="${state.hoveredSlice === 2}">
                    <span class="ag-v2-layer-key"><i class="ag-v2-swatch" style="background:${toolColor};"></i>工具与子代理 Tools</span>
                    <span class="ag-v2-layer-val">${escapeHtml(ctx.toolsK)}</span>
                  </div>
                </div>
              </div>

              <div>
                <div class="ag-v2-radar-sec-head">
                  <span class="ag-v2-radar-label">5h 模型配额池</span>
                  <span class="ag-v2-pool-stats">2ms Fast-RPC</span>
                </div>
                <div class="ag-v2-pool-stack" style="gap:8px;">
                  <div class="ag-v2-pool-item" data-brand="claude" style="gap:3px;">
                    <div class="ag-v2-pool-top">
                      <span class="ag-v2-pool-name"><span class="ag-v2-pool-logo" data-brand="claude">${buildBrandMarkSvg('claude', 12)}</span>Claude Pool</span>
                      <span class="ag-v2-pool-stats"><strong class="ag-v2-pool-pct">${claudePct}%</strong> · 1h 48m</span>
                    </div>
                    <div class="ag-v2-track-4px"><div class="ag-v2-track-fill" data-warn="${claudePct < 15}" style="width:${claudePct}%; --pool-color:var(--ag-pool-claude);"></div></div>
                  </div>
                  <div class="ag-v2-pool-item" data-brand="gemini" style="gap:3px;">
                    <div class="ag-v2-pool-top">
                      <span class="ag-v2-pool-name"><span class="ag-v2-pool-logo" data-brand="gemini">${buildBrandMarkSvg('gemini', 12)}</span>Gemini Pro</span>
                      <span class="ag-v2-pool-stats"><strong class="ag-v2-pool-pct">${proPct}%</strong> · 3h 12m</span>
                    </div>
                    <div class="ag-v2-track-4px"><div class="ag-v2-track-fill" style="width:${proPct}%; --pool-color:var(--ag-pool-pro);"></div></div>
                  </div>
                  <div class="ag-v2-pool-item" data-brand="gemini" style="gap:3px;">
                    <div class="ag-v2-pool-top">
                      <span class="ag-v2-pool-name"><span class="ag-v2-pool-logo" data-brand="gemini">${buildBrandMarkSvg('gemini', 12)}</span>Gemini Flash</span>
                      <span class="ag-v2-pool-stats"><strong class="ag-v2-pool-pct">${flashPct}%</strong> · READY</span>
                    </div>
                    <div class="ag-v2-track-4px"><div class="ag-v2-track-fill" style="width:${flashPct}%; --pool-color:var(--ag-pool-flash);"></div></div>
                  </div>
                </div>
              </div>

              <div class="ag-v2-radar-foot">
                <span class="ag-v2-pool-stats">本地轨迹缓存</span>
                ${buildInlineCacheHtml()}
              </div>
            </div>
          </div>
        </div>
      </div>`;
  }

  function buildMotionShowcaseBarHtml() {
    const tiers = [
      ['off', 'Off'],
      ['subtle', 'Subtle'],
      ['standard', 'Standard'],
      ['ultra', 'Ultra'],
    ];
    return `
          <div class="ag-v2-motion-showcase" data-testid="motion-showcase-bar" aria-label="v3.7 四档动效与英雄光学转场演练">
            <div class="ag-v2-motion-showcase-left">
              <span class="ag-v2-sec-title">动效档位</span>
              <div class="ag-v2-seg-ctrl" role="group" aria-label="动效档位切换" data-testid="studio-motion-tier-tabs">
                ${tiers
                  .map(
                    ([id, label]) =>
                      `<button type="button" class="ag-v2-seg-btn" data-wb-motion="${id}" data-active="${state.motionLevel === id}">${state.motionLevel === id ? '<span class="ag-v2-seg-glide-bg" data-motion-glide="true" aria-hidden="true"></span>' : ''}<span>${label}</span></button>`
                  )
                  .join('')}
              </div>
            </div>
            <div class="ag-v2-motion-showcase-actions">
              <button type="button" class="ag-v2-inline-btn" data-hero-demo="liftoff">${renderAnimIcon('arrow-up-launch', { size: 12 })}<span>Hero A 升空转场</span></button>
              <button type="button" class="ag-v2-inline-btn" data-hero-demo="caustic">${renderAnimIcon('sparkles-pen', { size: 12 })}<span>Hero C 焦散扫光</span></button>
              <button type="button" class="ag-v2-inline-btn" data-hero-demo="fiber">${renderAnimIcon('radar-pulse', { size: 12 })}<span>Hero D 模型光纤合焦</span></button>
              <button type="button" class="ag-v2-inline-btn" data-hero-demo="dual-stream">${renderAnimIcon('zap-bolt', { size: 12 })}<span>双轨流式吐字</span></button>
            </div>
          </div>`;
  }

  function buildStudioHomeHtml() {
    const stat = TIME_RANGE_STATS[state.timeRange];
    const claudePct = state.vialCritical ? 12 : 82;
    const proPct = state.vialCritical ? 46 : 94;
    const flashPct = 100;

    return `
      <div class="ag-v2-studio-home ag-v2-scroll">
        <div class="ag-v2-studio-stack">
          <div class="ag-v2-greeting-row">
            <h1 data-testid="home-greeting">${escapeHtml(getGreetingLabel())}</h1>
            <span class="ag-v2-ready-badge">
              <span class="ag-v2-google-dots" aria-hidden="true"><i class="is-b"></i><i class="is-r"></i><i class="is-y"></i><i class="is-g"></i></span>
              <span>WORKSPACE READY</span>
            </span>
          </div>

          <section class="ag-v2-bento-chassis" data-testid="studio-bento-chassis" aria-label="创作沉淀与 5 小时配额总览">
            ${buildOrbitalGeometrySvg()}
            <div class="ag-v2-chassis-inner">
              <div class="ag-v2-chassis-grid">
                <div class="ag-v2-bento-left">
                  <div class="ag-v2-bento-heat-zone">
                    <div class="ag-v2-bento-head">
                      <span class="ag-v2-sec-title">活跃轨迹</span>
                      <div class="ag-v2-seg-ctrl" data-testid="studio-time-range-tabs">
                        <button type="button" class="ag-v2-seg-btn" data-action="pick-range" data-range="7d" data-active="${state.timeRange === '7d'}">${state.timeRange === '7d' ? '<span class="ag-v2-seg-glide-bg" data-range-glide="true" aria-hidden="true"></span>' : ''}<span>7天</span></button>
                        <button type="button" class="ag-v2-seg-btn" data-action="pick-range" data-range="30d" data-active="${state.timeRange === '30d'}">${state.timeRange === '30d' ? '<span class="ag-v2-seg-glide-bg" data-range-glide="true" aria-hidden="true"></span>' : ''}<span>30天</span></button>
                        <button type="button" class="ag-v2-seg-btn" data-action="pick-range" data-range="all" data-active="${state.timeRange === 'all'}">${state.timeRange === 'all' ? '<span class="ag-v2-seg-glide-bg" data-range-glide="true" aria-hidden="true"></span>' : ''}<span>全部</span></button>
                      </div>
                    </div>
                    <div class="ag-v2-heat-wrap">
                      <div class="ag-v2-heat-grid" data-heat-grid="true">${buildHeatmapCells()}</div>
                      <div class="ag-v2-heat-tip" aria-hidden="true"><strong></strong><span></span></div>
                    </div>
                  </div>

                  <div class="ag-v2-bento-scale-zone">
                    <div class="ag-v2-hero-metric">
                      相当于写下 <span class="ag-v2-hero-num" data-hero-num="true">${escapeHtml(stat.books)}</span><span class="ag-v2-scale-note">(螺丝在拧紧)</span>
                    </div>
                    <div class="ag-v2-scale-sub" data-scale-sub="true">${escapeHtml(stat.sub)}</div>
                  </div>
                </div>

                <div class="ag-v2-bento-right">
                  <div class="ag-v2-bento-head">
                    <span class="ag-v2-sec-title">5h 配额池余量</span>
                    <span class="ag-v2-pool-stats">${state.vialCritical ? '临界态演示' : '实时健康'}</span>
                  </div>

                  <div class="ag-v2-pool-stack">
                    <div class="ag-v2-pool-item" data-brand="claude">
                      <div class="ag-v2-pool-top">
                        <span class="ag-v2-pool-name"><span class="ag-v2-pool-logo" data-brand="claude">${buildBrandMarkSvg('claude', 12)}</span>Claude Pool</span>
                        <span class="ag-v2-pool-stats"><strong class="ag-v2-pool-pct">${claudePct}%</strong> <span>1h 48m</span></span>
                      </div>
                      <div class="ag-v2-track-4px"><div class="ag-v2-track-fill" data-warn="${claudePct < 15}" style="width:${claudePct}%; --pool-color:var(--ag-pool-claude);"></div></div>
                    </div>

                    <div class="ag-v2-pool-item" data-brand="gemini">
                      <div class="ag-v2-pool-top">
                        <span class="ag-v2-pool-name"><span class="ag-v2-pool-logo" data-brand="gemini">${buildBrandMarkSvg('gemini', 12)}</span>Gemini Pro</span>
                        <span class="ag-v2-pool-stats"><strong class="ag-v2-pool-pct">${proPct}%</strong> <span>3h 12m</span></span>
                      </div>
                      <div class="ag-v2-track-4px"><div class="ag-v2-track-fill" style="width:${proPct}%; --pool-color:var(--ag-pool-pro);"></div></div>
                    </div>

                    <div class="ag-v2-pool-item" data-brand="gemini">
                      <div class="ag-v2-pool-top">
                        <span class="ag-v2-pool-name"><span class="ag-v2-pool-logo" data-brand="gemini">${buildBrandMarkSvg('gemini', 12)}</span>Gemini Flash</span>
                        <span class="ag-v2-pool-stats"><strong class="ag-v2-pool-pct">${flashPct}%</strong> <span>READY</span></span>
                      </div>
                      <div class="ag-v2-track-4px"><div class="ag-v2-track-fill" style="width:${flashPct}%; --pool-color:var(--ag-pool-flash);"></div></div>
                    </div>
                  </div>

                  <div class="ag-v2-pool-foot-hint">
                    <span class="ag-v2-foot-hint-text">点击底栏右徽章打开实体光学水试管</span>
                    <button type="button" class="ag-v2-text-link" data-action="toggle-dash-pop">${renderAnimIcon('radar-pulse', { size: 12.5 })}<span>检视</span></button>
                  </div>
                </div>
              </div>

              <div class="ag-v2-chassis-foot">
                <span class="ag-v2-chassis-telemetry">连续活跃 14 天 · 高峰时段 18:00–21:00 · 晃动鼠标划出流体尾波，点击激发四色涟漪</span>
                ${buildInlineCacheHtml()}
              </div>
            </div>
          </section>
          ${buildMotionShowcaseBarHtml()}
        </div>
      </div>`;
  }

  // 流式正文分块：流式阶段逐块渗出，结束后在同一批块后追加表格 / 引用 / 代码卡（便于局部补丁追加而非整树重建）
  function buildProseChunkHtml(item, withCaret) {
    const caret = withCaret ? '<span class="ag-v2-stream-caret"></span>' : '';
    return item.type === 'h3' ? `<h2>${escapeHtml(item.text)}${caret}</h2>` : `<p>${item.html}${caret}</p>`;
  }

  function buildProseTailHtml() {
    return `
        <table class="ag-v2-md-table">
          <thead><tr><th>采样指标</th><th>选定模型</th><th>实际响应</th><th class="is-num">TTFT</th></tr></thead>
          <tbody>
            <tr><td>编排托管</td><td>Orchestrator</td><td>Carbon (Plan) ⇄ Exec</td><td class="is-num">0.32s</td></tr>
            <tr><td>常规旗舰</td><td>Gemini 4 Carbon</td><td>gemini-4-carbon-001</td><td class="is-num">0.41s</td></tr>
          </tbody>
        </table>
        <blockquote class="ag-v2-md-quote">高级感来自 95% 的绝对克制，去衬托 5% 的光学焦点与角色灵气。</blockquote>
        <div class="ag-v2-code-card" data-testid="code-block-container">
          <div class="ag-v2-code-inner">
            <div class="ag-v2-code-head">
              <div class="ag-v2-code-meta">
                <span class="ag-v2-code-lang">CSS</span>
                <span class="ag-v2-code-file">v2-tokens.css · Input-Only Prism</span>
              </div>
              <button type="button" class="ag-v2-copy-btn" data-action="copy-code" aria-label="复制代码">
                <span class="ag-v2-copy-icons" aria-hidden="true">${renderAnimIcon('copy-check', { size: 13 })}</span>
                <span class="ag-v2-copy-label" data-copy-label="true">复制</span>
              </button>
            </div>
            <pre class="ag-v2-code-pre"><code><span class="ag-v2-tok-cm">/* 全站仅 agent-input-box 持有 Gemini 四色棱镜边 */</span>
<span class="ag-v2-tok-prop">--elevation-1</span><span class="ag-v2-tok-punct">:</span>
  <span class="ag-v2-tok-kw">inset</span> <span class="ag-v2-tok-num">0 1px 0</span> <span class="ag-v2-tok-fn">rgba</span><span class="ag-v2-tok-punct">(</span><span class="ag-v2-tok-num">255, 255, 255</span><span class="ag-v2-tok-punct">,</span> <span class="ag-v2-tok-fn">var</span><span class="ag-v2-tok-punct">(</span><span class="ag-v2-tok-str">--ag-v2-specular</span><span class="ag-v2-tok-punct">)),</span>
  <span class="ag-v2-tok-num">0 1px 2px</span> <span class="ag-v2-tok-fn">rgba</span><span class="ag-v2-tok-punct">(</span><span class="ag-v2-tok-num">0, 0, 0, 0.48</span><span class="ag-v2-tok-punct">),</span>
  <span class="ag-v2-tok-num">0 12px 32px -6px</span> <span class="ag-v2-tok-fn">rgba</span><span class="ag-v2-tok-punct">(</span><span class="ag-v2-tok-num">0, 0, 0, 0.62</span><span class="ag-v2-tok-punct">);</span></code></pre>
          </div>
        </div>`;
  }

  function buildStreamProseHtml() {
    const totalUnits = STREAM_FULL_PARAGRAPHS.length;
    if (state.streamPhase === 'done') {
      return STREAM_FULL_PARAGRAPHS.map((item) => buildProseChunkHtml(item, false)).join('') + buildProseTailHtml();
    }
    const visible = Math.min(totalUnits, state.streamWordProgress);
    const chunks = [];
    for (let i = 0; i < visible; i++) {
      chunks.push(buildProseChunkHtml(STREAM_FULL_PARAGRAPHS[i], i === visible - 1));
    }
    return chunks.join('');
  }

  function getThinkingTriggerText() {
    const isStreaming = state.streamPhase === 'streaming';
    return state.hasToolError
      ? '推演中断 · 发现 1 项阻断报错（已强制展开）'
      : isStreaming
        ? '正在推演与调用工具...'
        : '已思考 14s · 调用 6 步操作';
  }

  function buildThinkingTriggerInnerHtml() {
    const isStreaming = state.streamPhase === 'streaming';
    const model = getActiveModel();
    const brand = getModelBrand(model);
    const status = getThinkingStatus();
    const spark = `<span class="ag-v2-thinking-spark" data-thinking-spark="true" data-brand="${brand}" data-state="${status}">${buildBrandMarkSvg(brand, 13, '', { tier: status === 'error' ? 'low' : 'auto', monochrome: status === 'error' })}</span>`;
    const chevron =
      isStreaming || state.hasToolError
        ? ''
        : renderAnimIcon('chevron-right', { size: 12, className: 'ag-v2-thinking-chevron' });
    return `${spark}
                <span class="ag-v2-thinking-label">${escapeHtml(getThinkingTriggerText())}</span>
                <span class="ag-v2-thinking-meta">${state.thinkingOpen ? '点击收起' : '点击展开明细'}</span>${chevron}`;
  }

  function buildStepRowsHtml() {
    const isStreaming = state.streamPhase === 'streaming';
    const steps = [
      { verb: 'READ', path: 'workbench/styles/v2-tokens.css#L1-L130', dur: '11ms', state: 'ok' },
      { verb: 'EDIT', path: 'dual-mascot-rig.js (Clawd & 小紫猫)', dur: '24ms', state: 'ok' },
      { verb: 'TEST', path: 'node --test test/*.test.mjs', dur: state.hasToolError ? 'ERR 1' : '184ms', state: state.hasToolError ? 'error' : 'ok' },
      { verb: 'RPC', path: 'GetCascadeTrajectoryGeneratorMetadata', dur: isStreaming ? '...' : '2ms', state: isStreaming ? 'running' : 'ok' },
    ];
    return steps
      .map(
        (s, idx) => `
      <div class="ag-v2-step-row" data-state="${s.state}" data-step-idx="${idx}" data-testid="tool-call-step-row">
        <div class="ag-v2-step-left">
          <span class="ag-v2-step-dot"></span>
          <span class="ag-v2-step-verb">${s.verb}</span>
          <span class="ag-v2-step-path">${escapeHtml(s.path)}</span>
        </div>
        <span class="ag-v2-step-dur">${escapeHtml(s.dur)}</span>
      </div>`
      )
      .join('');
  }

  function buildSimbarInnerHtml() {
    const isStreaming = state.streamPhase === 'streaming';
    const auraLabelMap = {
      idle: 'IDLE · 8fps 微呼吸',
      start: 'START · 棱镜轻涌',
      running: 'RUNNING · 微棱镜流淌',
      complete: 'COMPLETE · 冰雾收束',
    };
    const auraLabel = auraLabelMap[state.convAuraPhase] || auraLabelMap.idle;
    return `
            <span class="ag-v2-sim-status">
              <span class="ag-v2-live-dot" data-tone="${isStreaming ? 'live' : state.hasToolError ? 'error' : 'ok'}"></span>
              <span>${isStreaming ? '流式吐字中：底部微光轻涌，主宠执笔速记…' : state.hasToolError ? '报错看护已激活：思考链禁止自动折叠' : '生成已完成：无框手稿思考链已顺滑收拢'}</span>
              <span class="ag-v2-aura-phase-pill" data-conv-aura-badge="${state.convAuraPhase}">${auraLabel}</span>
            </span>
            <div class="ag-v2-sim-actions">
              <button type="button" class="ag-v2-inline-btn" data-action="replay-stream">${renderAnimIcon('zap-bolt', { size: 12 })}<span>${isStreaming ? '正在推演...' : '重播流式回答 → 观察四态光晕 & 双宠'}</span></button>
              <button type="button" class="ag-v2-inline-btn" data-tone="${state.hasToolError ? 'warn' : ''}" data-action="toggle-tool-error">${renderAnimIcon('alert-triangle', { size: 12 })}<span>${state.hasToolError ? '恢复正常态' : '模拟工具报错'}</span></button>
            </div>`;
  }

  function getThinkingStatus() {
    return state.hasToolError ? 'error' : state.streamPhase === 'streaming' ? 'streaming' : 'done';
  }

  function buildChatStreamHtml() {
    return `
      <div class="ag-v2-scroll" data-testid="conversation-view">
        <div class="ag-v2-stream-inner">
          <div class="ag-v2-stream-simbar">${buildSimbarInnerHtml()}
          </div>

          <div class="ag-v2-turn-user">
            <div data-testid="user-message-bubble">
              <div class="ag-v2-user-text-wrap" data-collapsed="${!state.userBubbleExpanded}">
                请帮我把 Antigravity Desktop 试验台升级为 v3.3：思考档位对齐原生真实范围（无 Off），为 Orchestrator 打造双阶段自动托管推理条；Water Vial 升级为高硼硅水晶通透玻璃与清澈比尔-朗伯水体搭配真实模型采样验真；底部由官方风 Clawd 和 Gemini 小紫猫继续搭档演出。
              </div>
              <button type="button" class="ag-v2-user-expand-btn" data-action="toggle-user-bubble">${state.userBubbleExpanded ? '收起长提问' : '展开全部长提问'}</button>
            </div>
          </div>

          <div class="ag-v2-turn-assistant">
            <div class="ag-v2-thinking-block" data-open="${state.thinkingOpen}" data-status="${getThinkingStatus()}">
              <button type="button" data-testid="thinking-collapsible-trigger" data-action="toggle-thinking" aria-expanded="${state.thinkingOpen}">
                ${buildThinkingTriggerInnerHtml()}
              </button>

              <div class="ag-v2-thinking-collapse" data-testid="worked-for-collapsible" ${state.thinkingOpen ? '' : 'inert'}>
                <div class="ag-v2-thinking-inner">
                  <div class="ag-v2-worked-guide" ${state.streamPhase === 'streaming' && state.thinkingOpen && state.motionLevel === 'ultra' ? 'data-ag-cs-thought-streaming="1"' : ''}>
                    <div class="ag-v2-thinking-note">
                      1. 核对 <code>dual-mascot-rig.js</code> 双宠官方纯平块点阵（PX=3, TICK=100ms, 零黑边描边）。<br />
                      2. 验证 <code>antigravity-effort-slider</code> 原版 <code>.ces-track</code> 与 <code>.ces-claude-canvas</code> 无损挂载。
                    </div>
                    <div class="ag-v2-step-list">${buildStepRowsHtml()}</div>
                  </div>
                </div>
              </div>
            </div>

            <article data-testid="planner-response-text">
              ${buildStreamProseHtml()}
            </article>
          </div>
        </div>
      </div>`;
  }

  function unwrapWbStreamSpan(span) {
    if (!span || !span.parentNode) return;
    const parent = span.parentNode;
    while (span.firstChild) {
      parent.insertBefore(span.firstChild, span);
    }
    parent.removeChild(span);
    if (typeof parent.normalize === 'function') {
      try {
        parent.normalize();
      } catch {}
    }
  }

  function decorateDualTrackStreamNode(el) {
    if (!el || state.motionLevel !== 'ultra' || prefersReducedMotion()) return;
    const tag = String(el.tagName || '').toUpperCase();
    const isCodeOrTable =
      tag === 'TABLE' ||
      tag === 'PRE' ||
      tag === 'CODE' ||
      el.getAttribute?.('data-testid') === 'code-block-container' ||
      Boolean(el.querySelector?.('pre, table'));
    if (isCodeOrTable) {
      el.classList.add('ag-cs-code-scan');
      setTimeout(() => el.classList.remove('ag-cs-code-scan'), 240);
      return;
    }
    // 普通自然语言段落/标题：包裹直接纯文本子节点并在 250ms 内自动解包还原纯原生 Text 节点
    for (const ch of Array.from(el.childNodes || [])) {
      if (ch.nodeType === 3 && ch.nodeValue && ch.nodeValue.trim()) {
        const sp = document.createElement('span');
        sp.className = 'ag-cs-stream-chunk';
        el.insertBefore(sp, ch);
        sp.appendChild(ch);
        setTimeout(() => unwrapWbStreamSpan(sp), 250);
      }
    }
  }

  /* ── 对话流局部补丁：流式吐字 / 答完收折 / 报错展开 都只改动现有节点，保住 CSS 过渡与滚动位置 ── */
  function patchChatStreamDom(opts = {}) {
    const views = document.querySelectorAll('[data-testid="conversation-view"]');
    if (!views.length) return false;
    const status = getThinkingStatus();
    const isThoughtStreaming = state.streamPhase === 'streaming' && state.thinkingOpen && state.motionLevel === 'ultra' && !prefersReducedMotion();
    views.forEach((view) => {
      const simbar = view.querySelector('.ag-v2-stream-simbar');
      if (simbar) simbar.innerHTML = buildSimbarInnerHtml();

      const block = view.querySelector('.ag-v2-thinking-block');
      if (block) {
        block.setAttribute('data-status', status);
        block.setAttribute('data-open', String(state.thinkingOpen));
        const trigger = block.querySelector('[data-testid="thinking-collapsible-trigger"]');
        if (trigger) {
          trigger.innerHTML = buildThinkingTriggerInnerHtml();
          trigger.setAttribute('aria-expanded', String(state.thinkingOpen));
        }
        const collapse = block.querySelector('.ag-v2-thinking-collapse');
        if (collapse) collapse.toggleAttribute('inert', !state.thinkingOpen);
        const guide = block.querySelector('.ag-v2-worked-guide');
        if (guide) {
          if (isThoughtStreaming) guide.setAttribute('data-ag-cs-thought-streaming', '1');
          else guide.removeAttribute('data-ag-cs-thought-streaming');
        }
        // 步骤行：只在状态变化时改属性，完成瞬间由 CSS 触发回弹
        const nextRows = document.createElement('div');
        nextRows.innerHTML = buildStepRowsHtml();
        const curRows = block.querySelectorAll('.ag-v2-step-row');
        nextRows.querySelectorAll('.ag-v2-step-row').forEach((nr, idx) => {
          const cr = curRows[idx];
          if (!cr) return;
          const prevState = cr.getAttribute('data-state');
          const ns = nr.getAttribute('data-state');
          if (prevState !== ns) {
            cr.setAttribute('data-state', ns);
            if (ns === 'ok' && prevState === 'running') {
              cr.classList.remove('is-settled');
              void cr.offsetWidth;
              cr.classList.add('is-settled');
              if (state.motionLevel === 'ultra') {
                cr.classList.add('ag-cs-thought-chunk');
                setTimeout(() => cr.classList.remove('ag-cs-thought-chunk'), 200);
              }
            }
          }
          const dur = cr.querySelector('.ag-v2-step-dur');
          const ndur = nr.querySelector('.ag-v2-step-dur');
          if (dur && ndur && dur.textContent !== ndur.textContent) dur.textContent = ndur.textContent;
        });
      }

      const article = view.querySelector('[data-testid="planner-response-text"]');
      if (article) {
        if (state.streamPhase === 'done') {
          article.querySelectorAll('.ag-cs-stream-chunk').forEach((sp) => unwrapWbStreamSpan(sp));
        }
        if (opts.resetProse) {
          article.innerHTML = buildStreamProseHtml();
          Array.from(article.children).forEach((ch) => decorateDualTrackStreamNode(ch));
          return;
        }
        // 只追加新出现的块，旧块保持不动；新块挂双轨智能分流显影动画
        article.querySelectorAll('.ag-v2-stream-caret').forEach((c) => c.remove());
        const total = STREAM_FULL_PARAGRAPHS.length;
        const isDone = state.streamPhase === 'done';
        const target = isDone ? total : Math.min(total, state.streamWordProgress);
        const existing = article.querySelectorAll(':scope > h2, :scope > p').length;
        let html = '';
        for (let i = existing; i < target; i++) {
          html += buildProseChunkHtml(STREAM_FULL_PARAGRAPHS[i], !isDone && i === target - 1);
        }
        if (!isDone && existing >= target && target > 0) {
          const last = article.querySelectorAll(':scope > h2, :scope > p')[target - 1];
          if (last) last.insertAdjacentHTML('beforeend', '<span class="ag-v2-stream-caret"></span>');
        }
        if (isDone && !article.querySelector('[data-testid="code-block-container"]')) html += buildProseTailHtml();
        if (html) {
          const tmp = document.createElement('div');
          tmp.innerHTML = html;
          Array.from(tmp.children).forEach((child, k) => {
            child.classList.add('ag-v2-enter');
            child.style.setProperty('--enter-delay', `${k * 60}ms`);
            article.appendChild(child);
            decorateDualTrackStreamNode(child);
          });
        }
      }
    });
    syncRunningUiDom();
    syncMascotsState();
    return true;
  }

  function buildSettingsSceneHtml() {
    const lp = state.tokens.lightPreset || 'crystal';
    const tm = state.telemetryModule || 'auto';
    const em = state.effortSliderModule || 'auto';
    return `
      <div class="ag-v2-settings-wrap ag-v2-scroll">
        <div class="ag-v2-greeting-row ag-v2-settings-head">
          <h2 class="ag-v2-settings-title" style="display:inline-flex; align-items:center; gap:8px;">
            ${renderSparkOrbitMark({ size: 18 })}
            <span>Obsidian Prism · 黑曜棱镜</span>
          </h2>
          <span class="ag-v2-ready-badge">OBSIDIAN PRISM v1.0 → APPEARANCE</span>
        </div>

        <div class="ag-v2-settings-card" data-testid="appearance-settings-drawer">
          <div class="ag-v2-set-row">
            <div>
              <div class="ag-v2-set-title">主题配色方案</div>
              <div class="ag-v2-set-desc">旗舰默认 Obsidian 深空（零色偏黑灰钛），可选 Alabaster 暖岩与 Titanium</div>
            </div>
            <div class="ag-v2-seg-ctrl">
              <button type="button" class="ag-v2-seg-btn" data-wb-palette="obsidian" data-active="${state.tokens.palette === 'obsidian'}">Obsidian 深空</button>
              <button type="button" class="ag-v2-seg-btn" data-wb-palette="warm" data-active="${state.tokens.palette === 'warm'}">Alabaster 暖岩</button>
              <button type="button" class="ag-v2-seg-btn" data-wb-palette="titanium" data-active="${state.tokens.palette === 'titanium'}">Titanium</button>
            </div>
          </div>

          <div class="ag-v2-set-row" data-testid="settings-light-preset-row" style="border-top:1px solid var(--border-etched); padding-top:10px;">
            <div>
              <div class="ag-v2-set-title">浅色白昼质感</div>
              <div class="ag-v2-set-desc">调校浅色模式下的冷瓷表面层次、彩墨折射光晕与玻璃对比度。</div>
            </div>
            <div class="ag-v2-seg-ctrl" role="group" aria-label="浅色白昼质感">
              <button type="button" class="ag-v2-seg-btn" data-wb-light-preset="crystal" data-active="${lp === 'crystal'}">白昼冷晶</button>
              <button type="button" class="ag-v2-seg-btn" data-wb-light-preset="alabaster" data-active="${lp === 'alabaster'}">暖白画册</button>
            </div>
          </div>

          <div class="ag-v2-set-row" data-testid="settings-motion-tier-row" style="border-top:1px solid var(--border-etched); padding-top:10px;">
            <div>
              <div class="ag-v2-set-title">动效档位</div>
              <div class="ag-v2-set-desc">控制系统弹簧交互、流式吐字与光学场景转场的丰富程度。</div>
            </div>
            <div class="ag-v2-seg-ctrl" role="group" aria-label="动效档位">
              <button type="button" class="ag-v2-seg-btn" data-wb-motion="off" data-active="${state.motionLevel === 'off'}">关闭</button>
              <button type="button" class="ag-v2-seg-btn" data-wb-motion="subtle" data-active="${state.motionLevel === 'subtle'}">克制</button>
              <button type="button" class="ag-v2-seg-btn" data-wb-motion="standard" data-active="${state.motionLevel === 'standard'}">标准</button>
              <button type="button" class="ag-v2-seg-btn" data-wb-motion="ultra" data-active="${state.motionLevel === 'ultra'}">旗舰光学</button>
            </div>
          </div>

          <div class="ag-v2-set-row" data-testid="settings-telemetry-coexist-row" style="border-top:1px solid var(--border-etched); padding-top:10px;">
            <div>
              <div class="ag-v2-set-title">底部遥测与 512K 光学试管（智能共存让位）</div>
              <div class="ag-v2-set-desc">内置吸收 Dashboard 吞吐与配额采样；检测到外部同名插件时自动让位免冲突。</div>
            </div>
            <div class="ag-v2-seg-ctrl" role="group" aria-label="底部遥测与 512K 光学试管">
              <button type="button" class="ag-v2-seg-btn" data-action="set-telemetry-mod" data-mod-val="auto" data-active="${tm === 'auto'}">智能共存</button>
              <button type="button" class="ag-v2-seg-btn" data-action="set-telemetry-mod" data-mod-val="on" data-active="${tm === 'on'}">开启</button>
              <button type="button" class="ag-v2-seg-btn" data-action="set-telemetry-mod" data-mod-val="off" data-active="${tm === 'off'}">关闭</button>
            </div>
          </div>

          <div class="ag-v2-set-row" data-testid="settings-slider-coexist-row" style="border-top:1px solid var(--border-etched); padding-top:10px;">
            <div>
              <div class="ag-v2-set-title">模型推理等级滑块（智能共存让位）</div>
              <div class="ag-v2-set-desc">内置吸收模型菜单星空推理滑块；检测到外部滑块实例时自动让位免重复监听。</div>
            </div>
            <div class="ag-v2-seg-ctrl" role="group" aria-label="模型推理等级滑块">
              <button type="button" class="ag-v2-seg-btn" data-action="set-slider-mod" data-mod-val="auto" data-active="${em === 'auto'}">智能共存</button>
              <button type="button" class="ag-v2-seg-btn" data-action="set-slider-mod" data-mod-val="on" data-active="${em === 'on'}">开启</button>
              <button type="button" class="ag-v2-seg-btn" data-action="set-slider-mod" data-mod-val="off" data-active="${em === 'off'}">关闭</button>
            </div>
          </div>

          <div class="ag-v2-set-row" style="border-top:1px solid var(--border-etched); padding-top:10px;">
            <div>
              <div class="ag-v2-set-title">全屏 ASCII 字符水波纹底幕</div>
              <div class="ag-v2-set-desc">点击激发同心涟漪 + 静止态 0fps 自动休眠省电</div>
            </div>
            <button type="button" class="ag-v2-switch" data-action="toggle-ripple" data-on="${state.rippleEnabled}"></button>
          </div>

          <div class="ag-v2-set-row" style="border-top:1px solid var(--border-etched); padding-top:10px;">
            <div>
              <div class="ag-v2-set-title">输入框独占 Gemini 棱镜追光边</div>
              <div class="ag-v2-set-desc">全站仅主输入框启用四色棱镜光谱，其余卡片坚守高透冷瓷/暗钛框线</div>
            </div>
            <button type="button" class="ag-v2-switch" data-action="toggle-prism" data-on="${state.tokens.prismStrength > 0}"></button>
          </div>

          <div class="ag-v2-set-row" style="border-top:1px solid var(--border-etched); padding-top:10px;">
            <div>
              <div class="ag-v2-set-title">首页衬线大屏点缀</div>
              <div class="ag-v2-set-desc">仅作用于 Studio 问候语与人文标尺，绝不流入对话阅读流</div>
            </div>
            <button type="button" class="ag-v2-switch" data-action="toggle-serif" data-on="${state.tokens.editorialSerif}"></button>
          </div>

          <div class="ag-v2-set-row" style="border-top:1px solid var(--border-etched); padding-top:10px;">
            <div>
              <div class="ag-v2-set-title">迷你装扮小蟹堆（牛仔帽 / 墨镜 / 巫师帽）</div>
              <div class="ag-v2-set-desc">在输入框左侧召唤 3 只 2px 像素迷你小蟹一起溜达陪护</div>
            </div>
            <button type="button" class="ag-v2-switch" data-action="toggle-mini-pile" data-on="${state.mascotMiniPile}"></button>
          </div>

          <div class="ag-v2-set-row" style="border-top:1px solid var(--border-etched); padding-top:10px;">
            <div>
              <div class="ag-v2-set-title">实体光学水试管上下文</div>
              <div class="ag-v2-set-desc">在配额雷达浮窗渲染高硼硅水试管；关闭后折叠左栏并以极简分段长条展示上下文</div>
            </div>
            <button type="button" class="ag-v2-switch" data-testid="context-vial-switch" data-action="toggle-context-vial" data-on="${state.contextVialEnabled}"></button>
          </div>
        </div>

        <div class="ag-v2-settings-card" data-testid="workbench-about-preview" style="margin-top:12px;">
          <div class="ag-v2-set-row">
            <div>
              <div class="ag-v2-set-title">关于、Git 更新与开源致谢 · Obsidian Prism v1.0.8-beta.3</div>
              <div class="ag-v2-set-desc">GPL-3.0 · 致谢 0DNANCY/agy-claude-style、ATtacK030130/antigrative-dashboard、LLYSH-HANNARI/antigravity-Codex-Claude-effort-slider、Nwflower/dsh-claude-style、Microqian2th/dsh-codex-effort-slider、mobius/dsh-performance-slider、claudenoshujin/claude-web (Mascot Pile &amp; Micro-Ecology Interaction Inspiration)</div>
            </div>
            <span class="ag-v2-ready-badge">GPL-3.0 · 7 CREDITS</span>
          </div>
        </div>
      </div>`;
  }

  function buildOverlayCardHtml() {
    if (state.overlayDemo === 'takeover') {
      const modeDesc =
        state.mascotYieldMode === 'leap'
          ? '双宠已整体跃升至接管卡顶缘陪护（可拖曳/叠叠乐）'
          : '双宠正从框后趴沿露眼偷看';
      return `
        <div class="ag-v2-overlay-card" data-testid="interaction-takeover-card">
          <div class="ag-v2-overlay-head">
            <span class="ag-v2-overlay-title">
              <span class="ag-v2-perm-dot"></span>
              <span>权限确认 · 允许写入补丁吗？（双宠礼让演练）</span>
            </span>
            <span class="ag-v2-pool-stats">${escapeHtml(modeDesc)}</span>
          </div>
          <div class="ag-v2-overlay-desc">
            试验台仅演示卡片礼让（绝不触碰真实桌面端 app.asar）。点击「切换礼让姿势」体验跃上卡片 vs 框后扒沿。
          </div>
          <div class="ag-v2-overlay-actions">
            <button type="button" class="ag-v2-inline-btn" data-action="reroll-takeover">切换礼让姿势</button>
            <button type="button" class="ag-v2-inline-btn" data-tone="warn" data-action="close-overlay">关闭卡片</button>
          </div>
        </div>`;
    }

    if (state.overlayDemo === 'slash') {
      const items = [
        { cmd: '/grill-me', desc: '通过互动访谈把设计与边界条件彻底聊透' },
        { cmd: '/compact', desc: '在安全里程碑压缩上下文并锚定记忆' },
        { cmd: '/teamwork', desc: '唤起多 Worker 并行协同集群' },
      ];
      const rows = items
        .map(
          (it, idx) => `
          <div class="ag-v2-slash-row" data-active="${idx === 0}" data-action="close-overlay">
            <span class="ag-v2-slash-cmd">${it.cmd}</span>
            <span class="ag-v2-slash-desc">${it.desc}</span>
          </div>`
        )
        .join('');
      return `
        <div class="ag-v2-overlay-card" data-testid="slash-command-menu">
          <div class="ag-v2-overlay-head">
            <span class="ag-v2-overlay-title">斜杠命令菜单 · 双宠强制框后扒沿窥视态</span>
            <button type="button" class="ag-v2-inline-btn" data-action="close-overlay">关闭</button>
          </div>
          <div>${rows}</div>
        </div>`;
    }

    return '';
  }

  function buildComposerActionBtnHtml(allowFloat = true) {
    if (allowFloat && state.streamPhase === 'streaming') {
      return `<button type="button" class="ag-v2-send-btn is-running" data-testid="input-cancel-button" data-action="stop-stream" aria-label="停止执行" title="停止生成"><div class="ag-v2-stop-square" aria-hidden="true"></div></button>`;
    }
    return `<button type="button" class="ag-v2-send-btn" data-testid="send-button" aria-label="发送" title="发送">${renderAnimIcon('arrow-up-launch', { size: 15 })}</button>`;
  }

  function buildComposerHtml(allowFloat = true) {
    const model = getActiveModel();
    const effort = getActiveEffortMeta();
    const isOrch = Boolean(model.isOrchestrator);
    const locked = !isOrch && model.efforts.length <= 1;
    const isSpectrum = !isOrch && !locked && effort.id === 'xhigh';
    const brand = getModelBrand(model);
    const tier = getModelEffortTier(model, effort);
    const ctx = getContextTelemetry();

    const activePop =
      !allowFloat
        ? ''
        : state.openPopover === 'effort'
          ? buildModelPanelHtml(true)
          : state.openPopover === 'dashboard'
            ? buildDashboardPanelHtml(true)
            : '';

    const overlayHtml = allowFloat ? buildOverlayCardHtml() : '';

    const circumference = 34.5575;
    const dashOffset = (circumference * (1 - ctx.pct / 100)).toFixed(2);

    return `
      <div class="ag-v2-composer-dock">
        <div class="ag-v2-composer-wrap">
          <div class="ag-v2-mascot-stage" data-mascot-stage="true" data-floating="${allowFloat}"></div>

          ${overlayHtml}
          ${activePop}

          <div class="ag-prism-rim" data-prism-tier="1" data-testid="agent-input-box">
            <div class="ag-v2-composer-input" contenteditable="true" data-placeholder="输入文字看小紫猫/Clawd点头跟读，拖起它们可抛出砸成薄饼或叠到对方头顶！"></div>
            <div data-testid="input-box-bottom-toolbar">
              <div class="ag-v2-toolbar-left">
                <button type="button" class="ag-v2-chip-btn ag-v2-chip-icon" title="添加附件或截图" aria-label="添加附件或截图">
                  ${renderAnimIcon('plus-spin', { size: 14 })}
                </button>
                <button type="button" class="ag-v2-chip-btn ag-v2-model-trigger-pill" data-testid="model-selector-trigger" data-brand="${brand}" data-tier="${tier}" data-action="toggle-effort-pop" aria-expanded="${allowFloat && state.openPopover === 'effort'}">
                  ${buildModelEffortGlyphHtml(model, effort)}
                  <span class="ag-v2-model-trigger-name" data-composer-model-name="true">${escapeHtml(model.name)}</span>
                  <span class="ag-v2-effort-tag" data-tier="${tier}" data-high="${isSpectrum}" data-orch="${isOrch}" data-composer-effort-tag="true">${isOrch ? 'AUTO' : locked ? 'FIXED' : effort.short}</span>
                </button>
                <button type="button" class="ag-v2-chip-btn" data-testid="permissions-selector-trigger" data-action="toggle-takeover">
                  <span class="ag-v2-perm-dot"></span>
                  <span class="ag-v2-chip-label">自动</span>
                </button>
              </div>

              <div class="ag-v2-toolbar-right">
                <div class="ag-v2-telemetry-stream" data-testid="composer-telemetry-stream">
                  <span class="ag-v2-tele-item" data-tele="speed">${escapeHtml(ctx.rate === 'IDLE' ? '74.8 tok/s' : ctx.rate)}</span>
                  <span class="ag-v2-tele-sep" aria-hidden="true">·</span>
                  <span class="ag-v2-tele-item" data-tele="cache"><span class="ag-v2-tele-dim">缓存命中</span> 86.9%</span>
                  <span class="ag-v2-tele-sep" aria-hidden="true">·</span>
                  <button type="button" class="ag-v2-ctx-trigger" data-testid="dashboard-vial-trigger" data-vial-mode="${state.contextVialEnabled ? 'vial' : 'bar'}" data-warn="${state.vialCritical}" data-action="toggle-dash-pop" aria-expanded="${allowFloat && state.openPopover === 'dashboard'}">
                    <svg class="ag-v2-ring-svg" viewBox="0 0 16 16" aria-hidden="true" style="${state.contextVialEnabled ? '' : 'display:none;'}">
                      <circle class="ag-v2-ring-track" cx="8" cy="8" r="5.5" />
                      <circle class="ag-v2-ring-arc" cx="8" cy="8" r="5.5" stroke-dasharray="${circumference.toFixed(2)}" stroke-dashoffset="${dashOffset}" />
                    </svg>
                    <span class="ag-v2-trigger-minibar" data-trigger-minibar="true" aria-hidden="true" style="${state.contextVialEnabled ? 'display:none;' : ''}"><i style="width:${Math.round(ctx.pct)}%;"></i></span>
                    <span>${Math.round(ctx.pct)}%</span>
                    <span class="ag-v2-ctx-tooltip">实时速度 ${escapeHtml(ctx.rate)} · 点击打开${state.contextVialEnabled ? '实体水试管' : '极简上下文面板'}</span>
                  </button>
                </div>
                ${buildComposerActionBtnHtml(allowFloat)}
              </div>
            </div>
          </div>
        </div>
      </div>`;
  }

  function getActiveSessionId() {
    return state.scene === 'studio'
      ? 'studio-home'
      : state.scene === 'm3lab'
        ? 'm3-surface-lab'
        : state.scene === 'effort'
          ? 'effort-merge'
          : state.scene === 'dashboard'
            ? 'dash-fastpath'
            : state.scene === 'settings'
              ? 'theme-tokens'
              : 'v2-refactor';
  }

  function buildM3LabSceneHtml() {
    const slashItems = [
      { cmd: '/plan', desc: '双阶段规划蓝图 + 依赖拆解', kbd: 'P' },
      { cmd: '/boost', desc: '深度架构攻坚 + 多视角验证', kbd: 'B' },
      { cmd: '/teamwork', desc: '原生多 Agent Swarm 协同施工', kbd: 'T' },
      { cmd: '/grill-me', desc: '交互式需求对齐与边界确认', kbd: 'G' },
      { cmd: '/compact', desc: '干净断点上下文压缩归档', kbd: 'C' },
    ];
    const diffBadge =
      state.m3DiffStatus === 'accepted'
        ? '已采纳 · Accepted'
        : state.m3DiffStatus === 'rejected'
          ? '已回退 · Rejected'
          : '+14 / -3 · Pending';
    const toastMeta = {
      info: { title: 'Info · 主题已同步至 Sidecar 浮窗', detail: '已推送 5 阶 Tonal Surface 与 Google Sans 令牌' },
      success: { title: 'Success · 全部 312 项自动化门禁通过', detail: 'style.css 纯 ASCII 校验与 0fps 休眠全部达标' },
      warning: { title: 'Warning · 512K 水试管水位达到 84%', detail: '建议在干净断点处执行 /compact 释放上下文' },
      error: { title: 'Error · 符号链接越界写入已被拦截', detail: '路径逃逸检测已触发 Fail-Closed 保护' },
    };
    const activeToast = toastMeta[state.m3ToastType] || toastMeta.info;

    return `
      <div class="wb-m3lab-scroll" data-testid="m3-surface-lab">
        <div class="wb-m3lab-wrap">
          <div class="wb-m3lab-banner">
            <div>
              <div class="wb-m3lab-banner-title">Google M3 Expressive · 1:1 真实 style.css 四大死角实景舱</div>
              <div class="wb-m3lab-banner-sub">直连 /shared/style.css 真实宿主选择器 · 支持右上角四大主题、明暗 Split、四主题 Quad 与圆角实时联动</div>
            </div>
            <div class="wb-m3lab-swatches" aria-label="5 阶 Tonal Surface 色阶">
              <span class="wb-m3lab-swatch"><i style="background:var(--ag-cs-tonal-0)"></i>T0</span>
              <span class="wb-m3lab-swatch"><i style="background:var(--ag-cs-tonal-1)"></i>T1</span>
              <span class="wb-m3lab-swatch"><i style="background:var(--ag-cs-tonal-2)"></i>T2</span>
              <span class="wb-m3lab-swatch"><i style="background:var(--ag-cs-tonal-3)"></i>T3</span>
              <span class="wb-m3lab-swatch"><i style="background:var(--ag-cs-tonal-4)"></i>T4</span>
            </div>
          </div>

          <div class="wb-m3lab-grid">
            <!-- 表面 1: Fastpick / Slash Command Menu -->
            <section class="wb-m3lab-panel">
              <div class="wb-m3lab-panel-head">
                <span class="wb-m3lab-panel-title">1. Fastpick &amp; Slash 指令弹层</span>
                <span class="wb-m3lab-panel-tag">.agy-fastpick / [data-testid="slash-command-menu"]</span>
              </div>
              <div class="agy-fastpick" data-testid="slash-command-menu">
                <div class="wb-m3lab-fastpick-body">
                  <input type="text" value="/boo" placeholder="搜索 Slash 指令或工作区文件..." aria-label="Fastpick 搜索框" />
                  <div role="listbox" aria-label="Slash 指令候选">
                    ${slashItems
                      .map((it, idx) => {
                        const sel = idx === state.m3ActiveSlashIdx;
                        return `
                          <button type="button" class="wb-m3lab-fp-item" role="option" aria-selected="${sel}" data-active="${sel}" data-action="m3-pick-slash" data-idx="${idx}">
                            <span><strong>${escapeHtml(it.cmd)}</strong> <span style="opacity:.72;margin-left:6px;">${escapeHtml(it.desc)}</span></span>
                            <span class="wb-m3lab-fp-meta"><kbd>Ctrl</kbd><kbd>${escapeHtml(it.kbd)}</kbd></span>
                          </button>`;
                      })
                      .join('')}
                  </div>
                </div>
              </div>
            </section>

            <!-- 表面 2: Diff 审阅卡片 & 行/字级变更 -->
            <section class="wb-m3lab-panel">
              <div class="wb-m3lab-panel-head">
                <span class="wb-m3lab-panel-title">2. 代码 Diff 审阅卡片 &amp; 25px 双胶囊</span>
                <span class="wb-m3lab-panel-tag">[data-testid="changed-files-card"] / .monaco-diff-editor</span>
              </div>
              <div data-testid="changed-files-card" style="padding:10px 12px;">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
                  <span style="font-size:12.5px;font-weight:600;">host-workbench-enhancer.js</span>
                  <span style="font-size:11px;opacity:.78;font-variant-numeric:tabular-nums;">${escapeHtml(diffBadge)}</span>
                </div>
                <div class="monaco-diff-editor" style="border-radius:var(--ag-cs-r-md);overflow:hidden;border:1px solid var(--ag-cs-border-1);">
                  <div class="wb-m3lab-diff-lines">
                    <div class="wb-m3lab-diff-line"><span class="wb-m3lab-diff-ln">36</span><span>  '--warning', '--success', '--scrim',</span></div>
                    <div class="wb-m3lab-diff-line line-delete"><span class="wb-m3lab-diff-ln">37</span><span>- <span class="char-delete">const legacyBg = '#121216';</span></span></div>
                    <div class="wb-m3lab-diff-line line-insert"><span class="wb-m3lab-diff-ln">37</span><span>+ <span class="char-insert">'--ag-cs-tonal-0', '--ag-cs-tonal-1', '--ag-cs-tonal-2',</span></span></div>
                    <div class="wb-m3lab-diff-line line-insert"><span class="wb-m3lab-diff-ln">38</span><span>+ <span class="char-insert">'--ag-cs-tonal-3', '--ag-cs-tonal-4', '--font-sans',</span></span></div>
                  </div>
                  <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-top:1px solid var(--ag-cs-border-1);background:var(--ag-cs-tonal-2);">
                    <span style="font-size:11px;color:var(--muted-foreground);">Hunk 1/2 · 仅影响跨源 Sidecar 令牌</span>
                    <div class="ag-m3-diff-actions">
                      <button type="button" data-diff-action="accept" data-action="m3-diff-decision" data-decision="accepted">Accept</button>
                      <button type="button" data-diff-action="reject" data-action="m3-diff-decision" data-decision="rejected">Reject</button>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <!-- 表面 3: 插件 / MCP 卡片 + Sheet 表单 + 四色光学 Toast -->
            <section class="wb-m3lab-panel">
              <div class="wb-m3lab-panel-head">
                <span class="wb-m3lab-panel-title">3. 插件 Bento 卡片 · Sheet 表单 · 四色光学 Toast</span>
                <span class="wb-m3lab-panel-tag">.agy-bento-card / .agy-sheet / .agy-toast</span>
              </div>
              <div class="wb-m3lab-bento-row">
                <div class="agy-plugin-card wb-m3lab-card-pad" data-testid="plugin-card">
                  <div style="display:flex;align-items:center;justify-content:space-between;">
                    <strong style="font-size:12.5px;">Obsidian Prism</strong>
                    <span style="font-size:10.5px;padding:1px 7px;border-radius:999px;background:var(--primary-soft);color:var(--primary);">Active</span>
                  </div>
                  <span style="font-size:11.5px;color:var(--muted-foreground);">黑曜棱镜光学与 0fps 休眠引擎</span>
                </div>
                <div class="agy-bento-card wb-m3lab-card-pad" data-testid="mcp-server-card">
                  <div style="display:flex;align-items:center;justify-content:space-between;">
                    <strong style="font-size:12.5px;">MCP · gemini-decisions</strong>
                    <span style="font-size:10.5px;padding:1px 7px;border-radius:999px;background:var(--success-soft);color:var(--success);">18ms</span>
                  </div>
                  <span style="font-size:11.5px;color:var(--muted-foreground);">零成本结构化初筛与门禁核验</span>
                </div>
              </div>

              <div class="agy-sheet" style="padding:10px 12px;border-radius:var(--ag-cs-r-lg);border:1px solid var(--ag-cs-border-1);background:var(--ag-cs-tonal-1);">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                  <span style="font-size:12px;font-weight:500;">Sheet 抽屉表单控件与 2px 焦点光晕</span>
                  <button type="button" role="switch" aria-checked="${state.m3SwitchOn}" data-action="m3-toggle-switch" style="width:36px;height:20px;padding:2px;border:1px solid var(--ag-cs-border-2);background:${state.m3SwitchOn ? 'var(--primary)' : 'var(--ag-cs-tonal-3)'};cursor:pointer;display:inline-flex;align-items:center;justify-content:${state.m3SwitchOn ? 'flex-end' : 'flex-start'};">
                    <span style="width:14px;height:14px;border-radius:999px;background:#fff;display:block;"></span>
                  </button>
                </div>
                <div class="wb-m3lab-sheet-row">
                  <input type="text" value="Obsidian Neutral" aria-label="Sheet 文本输入框" style="padding:6px 10px;font-size:12px;" />
                  <select aria-label="Sheet 下拉选择" style="padding:6px 10px;font-size:12px;">
                    <option>Balanced (10px 外框 + 胶囊内件)</option>
                    <option>Soft (14px 外框 + 胶囊内件)</option>
                    <option>Crisp (6px 精密锐角)</option>
                  </select>
                </div>
              </div>

              <div class="wb-m3lab-toast-stack">
                <div style="display:flex;gap:6px;flex-wrap:wrap;">
                  ${['info', 'success', 'warning', 'error']
                    .map(
                      (tp) =>
                        `<button type="button" class="wb-mini-action" data-active="${state.m3ToastType === tp}" data-action="m3-toast-type" data-toast-type="${tp}">${tp.toUpperCase()}</button>`
                    )
                    .join('')}
                </div>
                <div class="agy-toast wb-m3lab-toast-item" data-testid="toast-notification" data-type="${state.m3ToastType}">
                  <div>
                    <div style="font-weight:600;color:var(--foreground);">${escapeHtml(activeToast.title)}</div>
                    <div style="font-size:11.5px;color:var(--muted-foreground);margin-top:2px;">${escapeHtml(activeToast.detail)}</div>
                  </div>
                  <kbd>Esc</kbd>
                </div>
              </div>
            </section>

            <!-- 表面 4: Prose 阅读细节 + Artifact 卡片 + 终端沉降底槽 -->
            <section class="wb-m3lab-panel">
              <div class="wb-m3lab-panel-head">
                <span class="wb-m3lab-panel-title">4. Prose 表格/引用/五色警示 · Artifact · 终端底槽</span>
                <span class="wb-m3lab-panel-tag">.agy-md-table / .markdown-alert / bottom-terminal-panel</span>
              </div>
              <div data-testid="agent-response" style="display:flex;flex-direction:column;gap:10px;">
                <table class="agy-md-table" style="width:100%;border-collapse:collapse;font-size:12px;">
                  <thead>
                    <tr><th style="text-align:left;padding:6px 10px;">光学通道</th><th style="text-align:left;padding:6px 10px;">空闲态</th><th style="text-align:right;padding:6px 10px;">状态</th></tr>
                  </thead>
                  <tbody>
                    <tr><td style="padding:6px 10px;">Channel 1 · 静态主包</td><td style="padding:6px 10px;">0fps Idle</td><td style="text-align:right;padding:6px 10px;font-variant-numeric:tabular-nums;">662 KiB</td></tr>
                    <tr><td style="padding:6px 10px;">Channel 2 · Omni Workbench</td><td style="padding:6px 10px;">暗底预涂零闪白</td><td style="text-align:right;padding:6px 10px;">Tonal Sync</td></tr>
                  </tbody>
                </table>

                <blockquote style="margin:0;padding:7px 12px;font-size:12px;">
                  外框随 corners 保持锐利克制，内部高频交互件全面采用 M3 胶囊，且 100% 保护 v1.0.3 编排无框棱镜水晶条。
                </blockquote>

                <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;font-size:11.5px;">
                  <div class="markdown-alert markdown-alert-tip" style="padding:7px 10px;"><strong>TIP</strong> · 暗色靠 5 阶 Tonal 分层，弱化杂乱内描边</div>
                  <div class="markdown-alert markdown-alert-important" style="padding:7px 10px;"><strong>IMPORTANT</strong> · 右键投喂甜甜圈，Alt+左键热咖啡</div>
                </div>

                <div data-testid="artifact-card" style="overflow:hidden;">
                  <div data-testid="artifact-header" style="padding:7px 11px;display:flex;align-items:center;justify-content:space-between;font-size:12px;font-weight:600;">
                    <span>ARCH-001-GRILL-DECISIONS.md</span>
                    <span style="font-size:10.5px;opacity:.72;">Artifact · Locked</span>
                  </div>
                  <div style="padding:8px 11px;font-size:11.5px;color:var(--muted-foreground);">隔离开发 Worktree 全部 3 批次决策与验收基线已归档。</div>
                </div>

                <div data-testid="bottom-terminal-panel" style="border-radius:var(--ag-cs-r-md);overflow:hidden;">
                  <div class="wb-m3lab-term-body">
                    <div>$ npm test  <span style="color:var(--success);"># 0 failures · Tonal-0 Console Well</span></div>
                    <div style="opacity:.72;">› style.css non-ASCII check: 0 bad chars (packCssJsExpr OK)</div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>`;
  }

  function getFilteredSessions() {
    const q = (state.sidebarSearchQuery || '').trim().toLowerCase();
    if (!q) return SESSIONS;
    return SESSIONS.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.group.toLowerCase().includes(q) ||
        s.scene.toLowerCase().includes(q)
    );
  }

  function buildSidebarSearchTailHtml() {
    return `<button type="button" class="ag-v2-search-clear" data-action="clear-sidebar-search" aria-label="关闭搜索" title="关闭过滤">${renderAnimIcon('x-close', { size: 12 })}</button>`;
  }

  function buildRunningSpinnerHtml() {
    return `<span class="ag-v2-row-spinner-wrap" aria-hidden="true"><span data-testid="status-loading-spinner"><span data-agent-state-dot="true"></span><span data-agent-state-dot="true"></span><span data-agent-state-dot="true"></span><span data-agent-state-dot="true"></span></span></span>`;
  }

  function buildSidebarSessionsHtml() {
    const activeSid = getActiveSessionId();
    const q = (state.sidebarSearchQuery || '').trim();
    const filtered = getFilteredSessions();

    if (q && filtered.length === 0) {
      return `
        <div class="ag-v2-sidebar-empty" data-testid="sidebar-search-empty">
          <span>无匹配「${escapeHtml(q)}」的会话</span>
          <button type="button" class="ag-v2-sidebar-empty-reset" data-action="clear-sidebar-search">清除过滤</button>
        </div>`;
    }

    const groups = ['置顶', '今天', '过去 7 天'];
    return groups
      .map((grp) => {
        const groupItems = filtered.filter((s) => s.group === grp);
        if (!groupItems.length) return '';
        const isGroupCollapsed = q ? false : Boolean(state.sidebarCollapsedGroups[grp]);
        const rows = groupItems
          .map((s) => {
            const isActive = s.id === activeSid;
            const isRunning = Boolean(s.running || (isActive && state.streamPhase === 'streaming'));
            return `
              <button type="button" data-testid="conversation-row-sidebar" data-action="pick-session" data-scene="${s.scene}" data-session-id="${s.id}" data-active="${isActive}" data-running="${isRunning}">
                ${isActive ? '<span class="ag-v2-glide-bg" data-sidebar-row-glide="true" aria-hidden="true"></span>' : ''}
                <span class="ag-v2-row-title">${escapeHtml(s.title)}</span>
                ${isRunning ? buildRunningSpinnerHtml() : ''}
                <span class="ag-v2-row-more" data-action="session-more" title="更多会话操作" role="presentation">${renderAnimIcon('more-horizontal', { size: 14 })}</span>
              </button>`;
          })
          .join('');

        return `
          <div class="ag-v2-sidebar-group" data-sidebar-group="${escapeHtml(grp)}" data-group-collapsed="${isGroupCollapsed}">
            <button type="button" class="ag-v2-sidebar-group-head" data-action="toggle-sidebar-group" data-group="${escapeHtml(grp)}" aria-expanded="${!isGroupCollapsed}">
              <span>${escapeHtml(grp)}</span>
            </button>
            <div class="ag-v2-sidebar-group-collapse">
              <div class="ag-v2-sidebar-group-rows">${rows}</div>
            </div>
          </div>`;
      })
      .join('');
  }

  function buildSidebarRailHtml() {
    const railItems = [
      { scene: 'studio', icon: 'layers-stack', tip: 'Studio 首页' },
      { scene: 'chat', icon: 'zap-bolt', tip: '深度对话' },
      { scene: 'effort', icon: 'sliders-tune', tip: '推理滑块' },
      { scene: 'dashboard', icon: 'radar-pulse', tip: '实体水试管' },
    ];
    const navBtns = railItems
      .map((it) => {
        const isAct = state.scene === it.scene;
        return `
          <button type="button" class="ag-v2-rail-btn" data-action="pick-session" data-scene="${it.scene}" data-active="${isAct}" data-tip="${it.tip}" aria-label="${it.tip}">
            ${isAct ? '<span class="ag-v2-glide-bg" data-rail-glide="true" aria-hidden="true"></span>' : ''}
            ${renderAnimIcon(it.icon, { size: 15, active: isAct })}
          </button>`;
      })
      .join('');

    const setAct = state.scene === 'settings';
    return `
      <div class="ag-v2-sidebar-rail-body" aria-label="极简微轨导航">
        <button type="button" class="ag-v2-rail-btn is-primary-action" data-action="pick-session" data-scene="studio" data-tip="新建对话|⌘N" aria-label="新建对话">
          ${renderAnimIcon('sparkles-pen', { size: 15 })}
        </button>
        <div class="ag-v2-rail-nav">${navBtns}</div>
        <button type="button" class="ag-v2-rail-btn is-footer-rail" data-action="pick-session" data-scene="settings" data-active="${setAct}" data-tip="外观与偏好设置" aria-label="外观与偏好设置">
          ${setAct ? '<span class="ag-v2-glide-bg" data-rail-glide="true" aria-hidden="true"></span>' : ''}
          ${renderAnimIcon('settings-gear', { size: 15, active: setAct })}
        </button>
      </div>`;
  }

  function buildSidebarHtml(collapsedOverride) {
    const collapsed = typeof collapsedOverride === 'boolean' ? collapsedOverride : Boolean(state.sidebarCollapsed);
    const searchOpen = Boolean(state.sidebarSearchOpen || state.sidebarSearchQuery);
    return `
      <aside data-testid="sidebar-split" data-collapsed="${collapsed}" data-search-open="${searchOpen}">
        <div class="ag-v2-sidebar-top">
          <button type="button" class="ag-v2-workspace-label" data-testid="workspace-switcher" data-action="cycle-workspace" title="切换工作区">
            <span class="ag-v2-workspace-name" data-workspace-name="true">${escapeHtml(state.workspaceName)}</span>
            <span class="ag-v2-workspace-caret">${renderAnimIcon('chevron-down', { size: 11 })}</span>
          </button>
          <div class="ag-v2-sidebar-top-tools">
            <button type="button" class="ag-v2-top-icon-btn" data-testid="sidebar-search-toggle" data-action="toggle-sidebar-search" data-active="${searchOpen}" data-tip="搜索会话|⌘K" aria-label="搜索会话">
              ${renderAnimIcon('search', { size: 14, active: searchOpen })}
            </button>
            <button type="button" class="ag-v2-collapse-btn" data-testid="sidebar-collapse-btn" data-action="toggle-sidebar" data-tip="${collapsed ? '展开侧栏|[' : '收起侧栏|['}" aria-expanded="${!collapsed}" aria-label="${collapsed ? '展开侧边栏' : '收起侧边栏'}">
              ${renderAnimIcon('panel-left', { size: 14.5, active: !collapsed })}
            </button>
          </div>
        </div>

        <div class="ag-v2-sidebar-expanded-body">
          <div class="ag-v2-sidebar-actions">
            <button type="button" class="ag-v2-new-chat-btn" data-testid="new-conversation-button" data-action="pick-session" data-scene="studio">
              <span class="ag-v2-new-chat-lead">
                ${renderAnimIcon('sparkles-pen', { size: 14 })}
                <span>新建对话</span>
              </span>
              <span class="ag-v2-kbd-hint">⌘N</span>
            </button>

            <div class="ag-v2-sidebar-search-collapse" data-sidebar-search-wrap="true" data-open="${searchOpen}">
              <div class="ag-v2-sidebar-search-inner">
                <div class="ag-v2-sidebar-search">
                  <span class="ag-v2-search-ico" aria-hidden="true">${renderAnimIcon('search', { size: 13 })}</span>
                  <input type="text" class="ag-v2-search-input" data-testid="sidebar-search-input" placeholder="搜索对话…" value="${escapeHtml(state.sidebarSearchQuery)}" autocomplete="off" spellcheck="false" aria-label="过滤会话列表" />
                  <span data-sidebar-search-tail="true">${buildSidebarSearchTailHtml()}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="ag-v2-scroll ag-v2-sidebar-sessions" data-sidebar-sessions="true">
            ${buildSidebarSessionsHtml()}
          </div>

          <div class="ag-v2-sidebar-footer-wrap">
            <button type="button" class="ag-v2-sidebar-footer" data-action="pick-session" data-scene="settings" data-active="${state.scene === 'settings'}">
              ${renderAnimIcon('settings-gear', { size: 14 })}
              <span class="ag-v2-footer-label">外观与偏好设置</span>
            </button>
          </div>
        </div>

        ${buildSidebarRailHtml()}
      </aside>`;
  }

  function buildSingleStageHtml(themeOverride, stageOpts = null) {
    const theme = (stageOpts && stageOpts.theme) || themeOverride || state.tokens.theme;
    const palette = (stageOpts && stageOpts.palette) || state.tokens.palette;
    const lightPreset = (stageOpts && stageOpts.lightPreset) || state.tokens.lightPreset || 'crystal';
    const isLockedStage = Boolean(stageOpts && stageOpts.lockedPreset);
    const isHome = state.scene === 'studio';
    const isM3Lab = state.scene === 'm3lab';
    const bodyHtml =
      state.scene === 'studio'
        ? buildStudioHomeHtml()
        : state.scene === 'settings'
          ? buildSettingsSceneHtml()
          : isM3Lab
            ? buildM3LabSceneHtml()
            : buildChatStreamHtml();

    const titleText =
      state.scene === 'studio'
        ? 'Studio 总览 · 0fps 物理休眠与四色棱镜涟漪'
        : isM3Lab
          ? 'Google M3 Expressive · 1:1 真实 style.css 四大死角实景舱'
          : state.scene === 'effort'
            ? '1:1 原版 Codex / Claude 推理滑块'
            : state.scene === 'dashboard'
              ? '512K 光学水试管 & 真实模型采样验真'
              : state.scene === 'settings'
                ? 'Obsidian Prism · 黑曜棱镜（可折叠外观与共存模块设置）'
                : '深度对话流 · Obsidian Prism';

    const customTag = stageOpts && stageOpts.crumbTag;
    const paletteTag =
      customTag ||
      (theme === 'light'
        ? lightPreset === 'alabaster' || palette === 'warm'
          ? 'WARM ALABASTER · LIGHT'
          : 'DAYLIGHT CRYSTAL · LIGHT'
        : `${palette.toUpperCase()} · DARK`);

    return `
      <div class="ag-v2-stage" data-palette="${palette}" data-theme="${theme}" data-light-preset="${lightPreset}" ${isLockedStage ? 'data-stage-locked="1"' : ''} data-serif="${state.tokens.editorialSerif ? 'on' : 'off'}">
        ${buildSidebarHtml(stageOpts && typeof stageOpts.sidebarCollapsed === 'boolean' ? stageOpts.sidebarCollapsed : undefined)}
        <div class="ag-v2-main">
          <div class="ag-v2-ripple-backdrop" data-dormant="${!isHome}">
            <canvas class="ag-cs-brand-glow ag-v2-brand-glow" data-testid="onboarding-brand-glow" aria-hidden="true"></canvas>
            <canvas class="ag-cs-ripple-canvas" aria-hidden="true"></canvas>
          </div>
          <div class="ag-v2-conv-aura" data-testid="conv-aura-host" data-dormant="${isHome || state.scene === 'settings' || isM3Lab}" data-aura-phase="${state.convAuraPhase}" aria-hidden="true">
            <canvas class="ag-v2-conv-glow"></canvas>
          </div>

          <div class="ag-v2-titlebar">
            <div class="ag-v2-titlebar-left">
              <span class="ag-v2-crumb-tag">${escapeHtml(paletteTag)}</span>
              <span class="ag-v2-session-title">${escapeHtml(titleText)}</span>
            </div>
            <div class="ag-v2-titlebar-actions">
              <button type="button" class="ag-v2-icon-btn" data-action="toggle-dash-pop">${renderAnimIcon('radar-pulse', { size: 12.5 })}<span>5h: ${state.vialCritical ? '12%' : '82%'}</span></button>
            </div>
          </div>

          ${bodyHtml}
          ${isM3Lab ? '' : buildComposerHtml(stageOpts && typeof stageOpts.allowFloat === 'boolean' ? stageOpts.allowFloat : true)}
        </div>
        <div class="ag-v2-floating-tip" data-stage-floating-tip="true" aria-hidden="true"><span></span><kbd></kbd></div>
      </div>`;
  }

  function buildMatrixHtml() {
    const theme = state.tokens.theme;
    const lightPreset = state.tokens.lightPreset || 'crystal';
    const paletteTag =
      theme === 'light'
        ? lightPreset === 'alabaster' || state.tokens.palette === 'warm'
          ? 'Warm Alabaster · Light'
          : 'Daylight Crystal · Light'
        : state.tokens.palette === 'obsidian'
          ? 'Obsidian Neutral · Dark'
          : state.tokens.palette === 'titanium'
            ? 'Titanium Prism · Dark'
            : 'Warm Editorial · Dark';

    return `
      <div class="ag-v2-stage wb-matrix-scroll" data-palette="${state.tokens.palette}" data-theme="${theme}" data-light-preset="${lightPreset}" data-serif="${state.tokens.editorialSerif ? 'on' : 'off'}" style="display:block;">
        <div class="wb-matrix-canvas">
          <div class="wb-matrix-header">
            <div>
              <h1 class="wb-matrix-title">Obsidian Prism v1.0 · 全组件光学与性能矩阵</h1>
              <p class="wb-matrix-sub">黑曜棱镜 · Daylight Crystal 白昼冷晶与 Warm Alabaster 暖白画册 · 512K 光学水试管 · 会话底光灵动呼吸与首页 0fps 真休眠。</p>
            </div>
            <span class="ag-v2-crumb-tag">${escapeHtml(paletteTag)}</span>
          </div>

          <div class="wb-matrix-grid">
            <section class="wb-matrix-cell wb-span-7" style="position:relative; overflow:hidden; min-height:380px;">
              <div class="wb-cell-head" style="position:relative; z-index:2;">
                <span class="wb-cell-title">1. Studio 首页 · 流体尾波与高显色四色棱镜涟漪</span>
                <span class="wb-cell-tag">[data-testid="studio-bento-chassis"]</span>
              </div>
              <div class="ag-v2-ripple-backdrop" style="inset:40px 0 0 0;" data-dormant="false">
                <canvas class="ag-cs-brand-glow ag-v2-brand-glow" data-testid="onboarding-brand-glow" aria-hidden="true"></canvas>
                <canvas class="ag-cs-ripple-canvas" aria-hidden="true"></canvas>
              </div>
              <div style="position:relative; z-index:2; padding:6px 0;">
                ${buildStudioHomeHtml()}
              </div>
            </section>

            <section class="wb-matrix-cell wb-span-5">
              <div class="wb-cell-head">
                <span class="wb-cell-title">2. 原版 Codex/Claude 滑块 &amp; 实体光学水试管</span>
                <span class="wb-cell-tag">Z4 Instrument Popovers</span>
              </div>
              <div style="display:flex; flex-direction:column; gap:14px; align-items:center;">
                ${buildModelPanelHtml(false)}
                ${buildDashboardPanelHtml(false)}
              </div>
            </section>

            <section class="wb-matrix-cell wb-span-7" style="position:relative; overflow:hidden;">
              <div class="wb-cell-head" style="position:relative; z-index:2;">
                <span class="wb-cell-title">3. 对话阅读流 · 32% 底边光晕 (0fps Sleep) / 无框手稿思考链</span>
                <span class="wb-cell-tag">[data-testid="conversation-view"]</span>
              </div>
              <div class="ag-v2-conv-aura" data-testid="conv-aura-host" data-dormant="false" data-aura-phase="${state.convAuraPhase}" style="inset:auto 0 0 0; height:32%;" aria-hidden="true">
                <canvas class="ag-v2-conv-glow"></canvas>
              </div>
              <div style="position:relative; z-index:2;">
                ${buildChatStreamHtml()}
              </div>
            </section>

            <section class="wb-matrix-cell wb-span-5">
              <div class="wb-cell-head">
                <span class="wb-cell-title">4. 输入框唯一棱镜边 · 官方风双宠舞台 · 外观开关</span>
                <span class="wb-cell-tag">Input-Only Prism &amp; Mascots</span>
              </div>
              <div style="padding-top:68px;">
                ${buildComposerHtml(false)}
              </div>
              <div style="display:flex; gap:10px; align-items:stretch; flex-wrap:wrap;">
                <div style="flex:1 1 200px; border:1px solid var(--border-etched); border-radius:var(--ag-v2-r-sm); overflow:hidden;">
                  ${buildSidebarHtml()}
                </div>
                <div style="flex:1.2 1 240px;">
                  ${buildSettingsSceneHtml()}
                </div>
              </div>
            </section>
          </div>
        </div>
        <div class="ag-v2-floating-tip" data-stage-floating-tip="true" aria-hidden="true"><span></span><kbd></kbd></div>
      </div>`;
  }

  function syncLiveStyleCss() {
    const t = state.tokens;
    const html = document.documentElement;
    const link = document.getElementById('wb-live-style-css');
    const active = state.scene === 'm3lab';
    if (link) link.disabled = !active;
    if (active) {
      const lp = t.lightPreset || 'crystal';
      const corners = t.radiusBase >= 10 ? 'soft' : t.radiusBase <= 3 ? 'crisp' : 'balanced';
      html.setAttribute('data-ag-cs-style', '1');
      html.setAttribute('data-ag-cs-theme', t.theme === 'light' ? 'light' : 'dark');
      html.setAttribute('data-ag-cs-palette', t.palette === 'warm' ? 'warm' : 'obsidian');
      html.setAttribute('data-ag-cs-light-preset', lp);
      html.setAttribute('data-ag-cs-corners', corners);
    } else {
      html.removeAttribute('data-ag-cs-style');
      html.removeAttribute('data-ag-cs-theme');
      html.removeAttribute('data-ag-cs-palette');
      html.removeAttribute('data-ag-cs-corners');
    }
  }

  function applyTokenStylesToStages() {
    const t = state.tokens;
    const lp = t.lightPreset || 'crystal';
    document.documentElement.setAttribute('data-ag-cs-motion', state.motionLevel);
    document.documentElement.setAttribute('data-ag-cs-light-preset', lp);
    syncLiveStyleCss();
    const stages = document.querySelectorAll('.ag-v2-stage');
    stages.forEach((stage) => {
      if (stage.getAttribute('data-stage-locked') !== '1') {
        stage.setAttribute('data-palette', t.palette);
        stage.setAttribute('data-light-preset', lp);
      }
      stage.setAttribute('data-motion', state.motionLevel);
      stage.setAttribute('data-serif', t.editorialSerif ? 'on' : 'off');
      stage.style.setProperty('--ag-v2-radius', `${t.radiusBase}px`);
      stage.style.setProperty('--ag-v2-specular', String(t.specularAlpha));
      stage.style.setProperty('--ag-v2-border-alpha', String(t.borderAlpha));
      stage.style.setProperty('--ag-v2-glass-blur', `${t.glassBlur}px`);
      stage.style.setProperty('--ag-v2-prose-lh', String(t.proseLineHeight));
      stage.style.setProperty('--ag-v2-grain-alpha', String(t.grainAlpha));
      stage.style.setProperty('--ag-prism-strength', String(t.prismStrength ?? 1));
    });
  }

  function getActiveQuickPresetId() {
    const { palette, theme, lightPreset = 'crystal' } = state.tokens;
    if (theme === 'light') {
      return lightPreset === 'alabaster' || palette === 'warm' ? 'warm-alabaster' : 'daylight-crystal';
    }
    if (palette === 'warm') return 'warm-dark';
    if (palette === 'obsidian') return 'obsidian-dark';
    return '';
  }

  function syncTopbarControls() {
    const wbRoot = document.getElementById('wb-root');
    if (wbRoot) {
      wbRoot.setAttribute('data-view', state.viewMode);
      wbRoot.setAttribute('data-inspector', state.inspectorOpen ? 'open' : 'closed');
      wbRoot.setAttribute('data-motion', state.motionLevel);
      wbRoot.setAttribute('data-shell-theme', state.tokens.theme === 'light' && state.viewMode !== 'quad' ? 'light' : 'dark');
    }
    document.documentElement.setAttribute('data-ag-cs-motion', state.motionLevel);
    document.documentElement.setAttribute('data-ag-cs-light-preset', state.tokens.lightPreset || 'crystal');

    document.querySelectorAll('[data-wb-view]').forEach((btn) => {
      btn.setAttribute('data-active', String(btn.getAttribute('data-wb-view') === state.viewMode));
    });
    document.querySelectorAll('[data-wb-scene]').forEach((btn) => {
      btn.setAttribute('data-active', String(btn.getAttribute('data-wb-scene') === state.scene));
    });
    const activePreset = getActiveQuickPresetId();
    document.querySelectorAll('[data-wb-preset]').forEach((btn) => {
      btn.setAttribute('data-active', String(btn.getAttribute('data-wb-preset') === activePreset));
    });
    document.querySelectorAll('[data-wb-palette]:not([data-wb-preset])').forEach((btn) => {
      btn.setAttribute('data-active', String(btn.getAttribute('data-wb-palette') === state.tokens.palette));
    });
    document.querySelectorAll('[data-wb-light-preset]').forEach((btn) => {
      btn.setAttribute('data-active', String(btn.getAttribute('data-wb-light-preset') === (state.tokens.lightPreset || 'crystal')));
    });
    document.querySelectorAll('[data-wb-motion]').forEach((btn) => {
      btn.setAttribute('data-active', String(btn.getAttribute('data-wb-motion') === state.motionLevel));
    });
    document.querySelectorAll('[data-wb-theme]').forEach((btn) => {
      btn.disabled = state.viewMode === 'split' || state.viewMode === 'quad';
      btn.setAttribute('data-active', String(btn.getAttribute('data-wb-theme') === state.tokens.theme));
    });
    const inspBtn = document.getElementById('wb-toggle-inspector');
    if (inspBtn) inspBtn.setAttribute('data-active', String(state.inspectorOpen));
  }

  function syncInspectorControls() {
    const t = state.tokens;
    const motionLabelMap = { off: 'Off · 关闭', subtle: 'Subtle · 克制', standard: 'Standard · 标准', ultra: 'Ultra · 旗舰光学' };
    const mtVal = document.getElementById('val-motion-tier');
    if (mtVal) mtVal.textContent = motionLabelMap[state.motionLevel] || 'Ultra';
    const lpVal = document.getElementById('val-light-preset');
    if (lpVal) lpVal.textContent = (t.lightPreset || 'crystal') === 'alabaster' ? 'Warm Alabaster' : 'Daylight Crystal';
    const setPair = (id, valId, value, text) => {
      const el = document.getElementById(id);
      const valEl = document.getElementById(valId);
      if (el) el.value = String(value);
      if (valEl) valEl.textContent = text;
    };
    setPair('ctrl-radius', 'val-radius', t.radiusBase, `${t.radiusBase}px`);
    setPair('ctrl-prism', 'val-prism', t.prismStrength ?? 1, Number(t.prismStrength ?? 1).toFixed(2));
    setPair('ctrl-specular', 'val-specular', t.specularAlpha, Number(t.specularAlpha).toFixed(3));
    setPair('ctrl-border', 'val-border', t.borderAlpha, Number(t.borderAlpha).toFixed(3));
    setPair('ctrl-blur', 'val-blur', t.glassBlur, `${t.glassBlur}px`);
    setPair('ctrl-lh', 'val-lh', t.proseLineHeight, Number(t.proseLineHeight).toFixed(2));
    setPair('ctrl-grain', 'val-grain', t.grainAlpha, Number(t.grainAlpha).toFixed(3));

    const serifBtn = document.getElementById('ctrl-serif');
    if (serifBtn) serifBtn.setAttribute('data-on', String(t.editorialSerif));

    const streamBtn = document.getElementById('btn-vial-stream');
    if (streamBtn) {
      streamBtn.textContent = `流式滴落: ${state.vialStreaming ? '开' : '关'}`;
      streamBtn.setAttribute('data-active', String(state.vialStreaming));
    }
    const vialModeBtn = document.getElementById('btn-vial-mode');
    if (vialModeBtn) {
      vialModeBtn.textContent = `上下文: ${state.contextVialEnabled ? '实体试管' : '极简长条'}`;
      vialModeBtn.setAttribute('data-active', String(!state.contextVialEnabled));
    }
    const critBtn = document.getElementById('btn-vial-crit');
    if (critBtn) critBtn.setAttribute('data-active', String(state.vialCritical));

    const campBtn = document.getElementById('btn-vial-camp');
    if (campBtn) {
      const m = getActiveModel();
      campBtn.textContent = `水色: ${m.camp === 'claude' ? '星尘微紫' : '深海冰青'}`;
    }

    const fbBtn = document.getElementById('btn-vial-fallback');
    if (fbBtn) {
      fbBtn.textContent = state.sampleSimMode === 'ok' ? '模拟采样降级' : state.sampleSimMode === 'fallback' ? '模拟计时异常' : '恢复采样正常';
      fbBtn.setAttribute('data-active', String(state.sampleSimMode !== 'ok'));
    }

    const pileBtn = document.getElementById('btn-mascot-pile');
    if (pileBtn) {
      pileBtn.textContent = `迷你三蟹堆: ${state.mascotMiniPile ? '开' : '关'}`;
      pileBtn.setAttribute('data-active', String(state.mascotMiniPile));
    }

    const takeoverBtn = document.getElementById('btn-demo-takeover');
    if (takeoverBtn) takeoverBtn.setAttribute('data-active', String(state.overlayDemo === 'takeover'));
    const slashBtn = document.getElementById('btn-demo-slash');
    if (slashBtn) slashBtn.setAttribute('data-active', String(state.overlayDemo === 'slash'));
    const orchBtn = document.getElementById('btn-orch-demo');
    if (orchBtn) orchBtn.setAttribute('data-active', String(state.activeModelId === 'orchestrator'));
  }

  function updatePrismCoordinates() {
    prismRafId = 0;
    prismDirty = false;
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const { x, y } = lastPointerPos;

    if (!reduceMotion) {
      const rims = document.querySelectorAll('.ag-prism-rim');
      rims.forEach((el) => {
        if (x < -1000) {
          el.style.setProperty('--px', '-9999px');
          el.style.setProperty('--py', '-9999px');
          return;
        }
        const rect = el.getBoundingClientRect();
        const maxRange = 280;
        if (
          x < rect.left - maxRange ||
          x > rect.right + maxRange ||
          y < rect.top - maxRange ||
          y > rect.bottom + maxRange
        ) {
          el.style.setProperty('--px', '-9999px');
          el.style.setProperty('--py', '-9999px');
          return;
        }
        el.style.setProperty('--px', `${Math.round(x - rect.left)}px`);
        el.style.setProperty('--py', `${Math.round(y - rect.top)}px`);
      });
    }

    // 小半径检测同步到 Orchestrator 切割水晶外沿光边与 WebGL2 着色器
    document.querySelectorAll('.ag-v2-orch-track').forEach((trackEl) => {
      if (reduceMotion || x < -1000) {
        trackEl.style.setProperty('--orch-px', '-9999px');
        trackEl.style.setProperty('--orch-py', '-9999px');
        return;
      }
      const rect = trackEl.getBoundingClientRect();
      const maxRange = 120;
      if (
        rect.width < 10 ||
        x < rect.left - maxRange ||
        x > rect.right + maxRange ||
        y < rect.top - maxRange ||
        y > rect.bottom + maxRange
      ) {
        trackEl.style.setProperty('--orch-px', '-9999px');
        trackEl.style.setProperty('--orch-py', '-9999px');
        return;
      }
      trackEl.style.setProperty('--orch-px', `${Math.round(x - rect.left)}px`);
      trackEl.style.setProperty('--orch-py', `${Math.round(y - rect.top)}px`);
    });

    for (const c of crystalControllers) {
      c.setPointerClient(x, y);
    }
  }

  function schedulePrismUpdate(clientX, clientY) {
    lastPointerPos.x = clientX;
    lastPointerPos.y = clientY;
    if (!prismDirty) {
      prismDirty = true;
      prismRafId = requestAnimationFrame(updatePrismCoordinates);
    }
  }

  function syncComposerTriggerDom() {
    const model = getActiveModel();
    const effort = getActiveEffortMeta();
    const isOrch = Boolean(model.isOrchestrator);
    const locked = !isOrch && model.efforts.length <= 1;
    const isSpectrum = !isOrch && !locked && effort.id === 'xhigh';
    const brand = getModelBrand(model);
    const tier = getModelEffortTier(model, effort);

    document.querySelectorAll('[data-testid="model-selector-trigger"]').forEach((btn) => {
      btn.setAttribute('data-brand', brand);
      btn.setAttribute('data-tier', tier);
    });
    document.querySelectorAll('[data-composer-model-name="true"]').forEach((el) => {
      el.textContent = model.name;
    });
    document.querySelectorAll('[data-composer-model-glyph="true"]').forEach((glyphEl) => {
      const prevBrand = glyphEl.getAttribute('data-brand');
      const prevTier = glyphEl.getAttribute('data-tier');
      glyphEl.setAttribute('data-brand', brand);
      glyphEl.setAttribute('data-tier', tier);
      if (prevBrand !== brand || prevTier !== tier) {
        glyphEl.innerHTML = buildTriggerGlyphInnerSvg(brand, tier);
        if (!prefersReducedMotion()) {
          glyphEl.classList.remove('is-pulsing');
          void glyphEl.offsetWidth;
          glyphEl.classList.add('is-pulsing');
        }
      }
    });
    document.querySelectorAll('[data-composer-effort-tag="true"]').forEach((el) => {
      el.textContent = isOrch ? 'AUTO' : locked ? 'FIXED' : effort.short;
      el.setAttribute('data-tier', tier);
      el.setAttribute('data-high', String(isSpectrum));
      el.setAttribute('data-orch', String(isOrch));
    });
    document.querySelectorAll('[data-thinking-spark="true"]').forEach((sp) => {
      if (sp.getAttribute('data-brand') !== brand) {
        sp.setAttribute('data-brand', brand);
        const st = getThinkingStatus();
        sp.innerHTML = buildBrandMarkSvg(brand, 13, '', { tier: st === 'error' ? 'low' : 'auto', monochrome: st === 'error' });
      }
    });
    // 同一 64px 槽位内交叉淡化：两行叠放于单格网格，高度恒定 0px 跳变
    let switchedToOrch = false;
    document.querySelectorAll('[data-ces-effort-row="true"]').forEach((el) => {
      el.setAttribute('data-row-hidden', String(isOrch));
      el.setAttribute('aria-hidden', String(isOrch));
    });
    document.querySelectorAll('[data-testid="orchestrator-effort-bar"]').forEach((el) => {
      if (isOrch && el.getAttribute('data-row-hidden') === 'true') switchedToOrch = true;
      el.setAttribute('data-row-hidden', String(!isOrch));
      el.setAttribute('aria-hidden', String(!isOrch));
    });
    if (isOrch) {
      for (const c of crystalControllers) {
        c.setPointerClient(lastPointerPos.x, lastPointerPos.y);
        c.step(0.016);
        // 光学唤醒：切入 Orchestrator 时播放一次冷白扫光（引擎支持时）
        if (switchedToOrch && typeof c.wake === 'function') c.wake();
      }
    }

    document.querySelectorAll('.ag-v2-model-option').forEach((opt) => {
      const sel = opt.getAttribute('data-model-id') === model.id;
      const wasSel = opt.getAttribute('data-selected') === 'true';
      opt.setAttribute('data-selected', String(sel));
      if (sel !== wasSel && opt.getAttribute('data-brand') === 'antigravity') {
        const logoSlot = opt.querySelector('.ag-v2-option-logo');
        if (logoSlot) {
          logoSlot.innerHTML = buildBrandMarkSvg('antigravity', 15, '', { tier: sel ? 'auto' : 'low', monochrome: !sel });
        }
      }
    });
    document.querySelectorAll(`[data-model-effort-tag="${model.id}"]`).forEach((mEffortTag) => {
      mEffortTag.textContent = isOrch ? 'Auto' : locked ? 'Fixed' : effort.label;
      mEffortTag.setAttribute('data-orch', String(isOrch));
    });
    syncMascotsState();
    syncInspectorControls();
  }

  // 双宠生态联动：把界面事件广播给所有舞台（引擎不支持 notify 时静默跳过）
  function notifyMascots(event, payload) {
    mascotControllers.forEach((mc) => {
      if (mc.rig && typeof mc.rig.notify === 'function') {
        try { mc.rig.notify(event, payload || {}); } catch {}
      }
    });
  }

  let lastOrchState = null;
  let lastActivityAt = 0;

  // 用户活动节流（≤ 每 2s 一次）：唤醒打盹中的双宠
  function markUserActivity() {
    const now = performance.now();
    if (now - lastActivityAt < 2000) return;
    lastActivityAt = now;
    notifyMascots('activity');
  }

  function syncMascotsState() {
    const model = getActiveModel();
    const isOrchNow = Boolean(model.isOrchestrator);
    mascotControllers.forEach((ctrl) => {
      const wrap = ctrl.host.closest('.ag-v2-composer-wrap');
      const card = wrap ? wrap.querySelector('.ag-v2-overlay-card:not(.is-closing)') : null;
      const rightPop = wrap ? wrap.querySelector('.ag-v2-popover-docked.is-right:not(.is-closing)') : null;
      const leapY = card && state.mascotYieldMode === 'leap' ? (card.offsetHeight || 76) + 16 : 0;
      const popW = rightPop ? rightPop.offsetWidth || (state.contextVialEnabled ? 408 : 316) : 0;
      ctrl.rig.setState({
        camp: model.camp,
        streaming: state.streamPhase === 'streaming',
        streamTier: state.effortByModel[model.id] === 'xhigh' || model.isOrchestrator ? 3 : 2,
        hasError: state.hasToolError,
        yieldMode: state.overlayDemo ? state.mascotYieldMode : 'none',
        leapOffsetY: leapY,
        popoverRightWidth: ctrl.floating ? popW : 0,
        miniPileEnabled: state.mascotMiniPile,
        orchestrator: isOrchNow,
      });
    });
    // Orchestrator 切入 / 切出：双宠抬头看向模型按钮，Clawd 头顶冰晶道具随之出现 / 收起
    if (lastOrchState !== null && lastOrchState !== isOrchNow) notifyMascots('orchestrator', { on: isOrchNow });
    lastOrchState = isOrchNow;
  }

  function getRipplePalette(stageEl, auraState) {
    const rippleCore = globalThis.__agCsRippleCore;
    const cs = getComputedStyle(stageEl);
    const isDark = stageEl.getAttribute('data-theme') !== 'light';
    const ink =
      (rippleCore && rippleCore.parseCssColorToRgb(cs.getPropertyValue('--ag-v2-ripple-ink'))) ||
      (isDark ? [146, 148, 156] : [120, 122, 132]);
    const wave =
      (rippleCore && rippleCore.parseCssColorToRgb(cs.getPropertyValue('--ag-v2-ripple-wave'))) ||
      (isDark ? [214, 218, 228] : [74, 80, 96]);
    const fontFamily = cs.getPropertyValue('--ag-v2-font-mono').trim() || 'monospace';
    const strength = state.tokens.prismStrength ?? 1;
    const aura =
      auraState && auraState.active && strength > 0
        ? { x: auraState.x, y: auraState.y, radius: 230, strength, active: true }
        : { x: 0, y: 0, radius: 230, strength: 0, active: false };
    return { dark: isDark, ink, wave, fontFamily, aura };
  }

  function mountRipples() {
    const rippleCore = globalThis.__agCsRippleCore;
    if (!rippleCore || !state.rippleEnabled) return;
    const { RIPPLE, createWaveField, createGlyphField } = rippleCore;

    document.querySelectorAll('.ag-cs-ripple-canvas').forEach((canvas) => {
      const stageEl = canvas.closest('.ag-v2-stage');
      const backdropEl = canvas.closest('.ag-v2-ripple-backdrop');
      const glowCanvas = backdropEl ? backdropEl.querySelector('.ag-v2-brand-glow') : null;
      const listenTarget = canvas.closest('.ag-v2-main') || canvas.parentElement;
      if (!stageEl || !listenTarget) return;

      let waves = null;
      let field = null;
      const glow =
        glowCanvas && typeof rippleCore.mountBrandHorizonGlow === 'function'
          ? rippleCore.mountBrandHorizonGlow(glowCanvas)
          : null;
      let columns = 0;
      let rows = 0;
      let lastDrawAt = 0;
      let lastStepAt = performance.now();
      let lastSkimX = null;
      let lastSkimY = null;
      let lastSkimAt = 0;
      let skimCarryDist = 0;
      const auraState = { x: 0, y: 0, active: false };

      const setup = () => {
        const rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        columns = Math.max(16, Math.floor(rect.width / RIPPLE.cellWidth));
        rows = Math.max(8, Math.floor(rect.height / RIPPLE.cellHeight));
        canvas.width = Math.max(1, Math.round(columns * RIPPLE.cellWidth));
        canvas.height = Math.max(1, Math.round(rows * RIPPLE.cellHeight));
        if (glow) glow.resize(rect.width, rect.height, Math.min(window.devicePixelRatio || 1, 1.5));
        if (field) field.dispose(true);
        waves = createWaveField(columns, rows);
        field = createGlyphField(canvas, columns, rows, waves);
        waves.disturb(Math.floor(columns * 0.24), Math.floor(rows * 0.34));
        waves.disturb(Math.floor(columns * 0.78), Math.floor(rows * 0.66));
        updateCalmZones();
      };

      // 内容静区：问候主标题背后的字符海柔和退隐（alpha ×0.45，边缘羽化），保证衬线大标题可读
      const updateCalmZones = () => {
        if (!field || typeof field.setCalmZones !== 'function') return;
        const scope = canvas.closest('.wb-matrix-cell') || stageEl;
        const greet = scope.querySelector('[data-testid="home-greeting"]');
        if (!greet) {
          field.setCalmZones([]);
          return;
        }
        const c = canvas.getBoundingClientRect();
        const g = greet.getBoundingClientRect();
        if (!c.width || !g.width) return;
        field.setCalmZones([
          { x: g.left - c.left - 28, y: g.top - c.top - 14, w: g.width + 56, h: g.height + 28 },
        ]);
      };

      setup();
      requestAnimationFrame(updateCalmZones);
      const ro = new ResizeObserver(setup);
      ro.observe(canvas);

      const onMove = (evt) => {
        if (!field || (backdropEl && backdropEl.getAttribute('data-dormant') === 'true')) return;
        const rect = canvas.getBoundingClientRect();
        const x = evt.clientX - rect.left;
        const y = evt.clientY - rect.top;
        if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
          lastSkimX = null;
          lastSkimY = null;
          skimCarryDist = 0;
          if (auraState.active) {
            auraState.active = false;
            field.invalidate();
            wakeMasterLoop();
          }
          return;
        }
        const now = performance.now();
        if (lastSkimX !== null && lastSkimY !== null && waves && !prefersReducedMotion()) {
          const stepDist = Math.hypot(x - lastSkimX, y - lastSkimY);
          const dtSec = Math.max(0.004, (now - lastSkimAt) / 1000);
          const pxPerSec = stepDist / dtSec;
          if (pxPerSec >= 220) {
            skimCarryDist += stepDist;
            if (skimCarryDist >= 42) {
              skimCarryDist = Math.min(20, skimCarryDist - 42);
              const speedNorm = Math.max(0.05, Math.min(1, (pxPerSec - 220) / 1800));
              const col = Math.floor(x / RIPPLE.cellWidth);
              const row = Math.floor(y / RIPPLE.cellHeight);
              if (typeof waves.skimmer === 'function') {
                waves.skimmer(col, row, speedNorm);
              }
            }
          } else {
            skimCarryDist *= 0.85;
          }
        }
        lastSkimX = x;
        lastSkimY = y;
        lastSkimAt = now;
        auraState.x = x;
        auraState.y = y;
        auraState.active = true;
        field.invalidate();
        wakeMasterLoop();
      };

      const onLeave = () => {
        lastSkimX = null;
        lastSkimY = null;
        skimCarryDist = 0;
        if (auraState.active && field) {
          auraState.active = false;
          field.invalidate();
          wakeMasterLoop();
        }
      };

      const onDown = (evt) => {
        if (!waves || columns <= 0 || rows <= 0) return;
        if (backdropEl && backdropEl.getAttribute('data-dormant') === 'true') return;
        const rect = canvas.getBoundingClientRect();
        const x = evt.clientX - rect.left;
        const y = evt.clientY - rect.top;
        if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;
        waves.disturb(Math.floor(x / RIPPLE.cellWidth), Math.floor(y / RIPPLE.cellHeight));
        if (field) field.invalidate();
        wakeMasterLoop();
        mascotControllers.forEach((mc) => {
          if (!mc.rig || typeof mc.rig.notify !== 'function' || mc.host.closest('.ag-v2-stage') !== stageEl) return;
          const hr = mc.host.getBoundingClientRect();
          try { mc.rig.notify('ripple', { x: evt.clientX - hr.left }); } catch {}
        });
      };

      listenTarget.addEventListener('pointermove', onMove, { passive: true });
      listenTarget.addEventListener('pointerleave', onLeave, { passive: true });
      listenTarget.addEventListener('pointerdown', onDown, { passive: true });

      let drawnStatic = false;
      const mountedAt = performance.now();

      const ctrl = {
        isSleeping(now = performance.now()) {
          if (!waves || !field) return true;
          if (backdropEl && backdropEl.getAttribute('data-dormant') === 'true') return true;
          if (prefersReducedMotion()) return drawnStatic;
          if (!drawnStatic) return false;
          if (now - mountedAt < 1600) return false;
          if (auraState.active) return false;
          return typeof field.busy === 'function' ? !field.busy() : !waves.active();
        },
        step(now) {
          if (!waves || !field) return;
          if (backdropEl && backdropEl.getAttribute('data-dormant') === 'true') return;
          if (ctrl.isSleeping(now)) return;
          if (columns * rows > 4200 && now - lastDrawAt < 28) return;
          const realDt = Math.min(0.05, Math.max(0.001, (now - lastStepAt) / 1000));
          lastStepAt = now;
          lastDrawAt = now;
          const isDark = stageEl.getAttribute('data-theme') !== 'light';
          const strength = state.tokens.prismStrength ?? 1;
          if (glow) {
            glow.draw(now, { dark: isDark, still: prefersReducedMotion(), prismStrength: strength });
          }
          if (waves.active()) waves.advance(realDt);
          if (!drawnStatic || field.needsDraw(now, false)) {
            field.draw(now, getRipplePalette(stageEl, auraState), false);
            drawnStatic = true;
          }
        },
        invalidate() {
          drawnStatic = false;
          if (field) field.invalidate();
          if (glow) glow.invalidate();
          wakeMasterLoop();
        },
        triggerLiftoffBurst(nx = 0.5, ny = 0.62) {
          if (field && typeof field.triggerLiftoffBurst === 'function') {
            field.triggerLiftoffBurst(nx, ny);
          } else if (waves && columns > 0 && rows > 0) {
            waves.disturb(Math.round(columns * nx), Math.round(rows * ny));
          }
          drawnStatic = false;
          if (field) field.invalidate();
          wakeMasterLoop();
        },
        triggerTideSwell() {
          if (field && typeof field.triggerTideSwell === 'function') {
            field.triggerTideSwell();
            drawnStatic = false;
            field.invalidate();
            wakeMasterLoop();
          }
        },
        getWaveState() {
          return {
            active: waves ? waves.active() : false,
            sleeping: ctrl.isSleeping(),
            auraActive: auraState.active,
            columns,
            rows,
          };
        },
        dispose() {
          ro.disconnect();
          listenTarget.removeEventListener('pointermove', onMove);
          listenTarget.removeEventListener('pointerleave', onLeave);
          listenTarget.removeEventListener('pointerdown', onDown);
          if (field) field.dispose();
          if (glow) glow.dispose();
        },
      };
      rippleControllers.push(ctrl);
    });
  }

  const WB_CONV_AURA_HEIGHT_RATIO = 0.32;
  const WB_CONV_AURA_START_MS = 1150;
  const WB_CONV_AURA_COMPLETE_MS = 1400;

  function scaleWbConvReach(fullReach) {
    return Math.max(0.08, Math.min(0.98, +(fullReach / WB_CONV_AURA_HEIGHT_RATIO).toFixed(4)));
  }

  function syncConvAuraDomPhase() {
    document.querySelectorAll('.ag-v2-conv-aura').forEach((el) => {
      el.setAttribute('data-aura-phase', state.convAuraPhase);
    });
    const auraLabelMap = {
      idle: 'IDLE · 0fps 休眠',
      start: 'START · 棱镜轻涌',
      running: 'RUNNING · 微棱镜流淌',
      complete: 'COMPLETE · 冰雾收束',
    };
    const label = auraLabelMap[state.convAuraPhase] || auraLabelMap.idle;
    document.querySelectorAll('[data-conv-aura-badge]').forEach((b) => {
      b.setAttribute('data-conv-aura-badge', state.convAuraPhase);
      b.textContent = label;
    });
  }

  function computeWbConvAuraOptics(phase, phaseAt, now, dark, isRunning, prismScale) {
    if (state.liftoffEbbAt > 0 && now - state.liftoffEbbAt < 520) {
      const p = Math.max(0, Math.min(1, (now - state.liftoffEbbAt) / 520));
      const ease = 1 - Math.pow(1 - p, 2.25);
      const endStr = dark ? 0.29 : 0.62;
      return {
        strength: 0.92 + (endStr - 0.92) * ease,
        reach: scaleWbConvReach(0.31 + (0.21 - 0.31) * ease),
        prism: (0.62 + (0.19 - 0.62) * ease) * Math.max(0, Math.min(1, prismScale)),
        surge: 0.34 * (1 - ease),
        speed: 1.32 + (1.0 - 1.32) * ease,
        frameMs: 16,
      };
    }
    const idleStr = dark ? 0.21 : 0.52;
    const runBase = dark ? 0.31 : 0.64;
    const idlePrism = dark ? 0.14 : 0.26;
    let out;
    if (phase === 'start') {
      const p = Math.max(0, Math.min(1, (now - phaseAt) / WB_CONV_AURA_START_MS));
      const s = Math.sin(p * Math.PI);
      const peakStr = dark ? 0.46 : 0.78;
      const endStr = isRunning ? runBase : idleStr;
      const endReach = isRunning ? 0.22 : 0.16;
      const rawReach = p <= 0.5 ? 0.16 + (0.26 - 0.16) * s : endReach + (0.26 - endReach) * s;
      const endPrism = isRunning ? 0.70 : idlePrism;
      const settleEase = Math.pow(p, 2.4);
      const endSpeed = isRunning ? 1.45 : 0.72;
      out = {
        strength: p <= 0.5 ? idleStr + (peakStr - idleStr) * s : endStr + (peakStr - endStr) * s,
        reach: scaleWbConvReach(rawReach),
        prism: p <= 0.5 ? idlePrism + (0.74 - idlePrism) * s : endPrism + (0.74 - endPrism) * s,
        surge: Number((0.50 * (1 - 0.32 * settleEase)).toFixed(4)),
        speed: Number((1.95 - (1.95 - endSpeed) * settleEase).toFixed(4)),
        frameMs: 22,
      };
    } else if (phase === 'running') {
      out = {
        strength: runBase + (dark ? 0.035 : 0.045) * Math.sin(now * 0.0021),
        reach: scaleWbConvReach(0.22),
        prism: 0.70,
        surge: 0.06 * Math.sin(now * 0.0024),
        speed: 1.45,
        frameMs: 32,
      };
    } else if (phase === 'complete') {
      const p = Math.max(0, Math.min(1, (now - phaseAt) / WB_CONV_AURA_COMPLETE_MS));
      const ease = 1 - Math.pow(1 - p, 2.1);
      const startStr = dark ? 0.38 : 0.70;
      const rawReach = 0.24 + (0.16 - 0.24) * ease;
      out = {
        strength: startStr + (idleStr - startStr) * ease,
        reach: scaleWbConvReach(rawReach),
        prism: 0.76 + (idlePrism - 0.76) * ease,
        surge: -0.36 * (1 - ease * 0.85),
        speed: 1.45 + (0.72 - 1.45) * ease,
        frameMs: 28,
      };
    } else {
      out = {
        strength: idleStr + (dark ? 0.024 : 0.038) * Math.sin(now * 0.0018),
        reach: scaleWbConvReach(0.16),
        prism: idlePrism,
        surge: 0,
        speed: 0.72,
        frameMs: 50,
      };
    }
    out.prism *= Math.max(0, Math.min(1, prismScale));
    return out;
  }

  function invokeWbHorizonGlow(glow, now, dark, still, opt) {
    if (!glow) return;
    try {
      if (still && typeof glow.drawStaticSnapshot === 'function') {
        glow.drawStaticSnapshot(now, dark, opt.strength, {
          reach: opt.reach,
          prism: opt.prism,
          surge: opt.surge,
          speed: opt.speed,
          still: true,
        });
        return;
      }
      if (typeof glow.draw === 'function') {
        glow.draw(now, dark, opt.strength, {
          reach: opt.reach,
          prism: opt.prism,
          surge: opt.surge,
          speed: opt.speed,
          still,
        });
      }
    } catch {}
  }

  function isWbConvLivingFlow() {
    if (prefersReducedMotion() || document.hidden) return false;
    return state.motionLevel === 'standard' || state.motionLevel === 'ultra';
  }

  function mountConvAuras() {
    const rippleCore = globalThis.__agCsRippleCore;
    if (!rippleCore || !state.rippleEnabled || typeof rippleCore.mountBrandHorizonGlow !== 'function') return;

    document.querySelectorAll('.ag-v2-conv-glow').forEach((canvas) => {
      const stageEl = canvas.closest('.ag-v2-stage');
      const hostEl = canvas.closest('.ag-v2-conv-aura');
      if (!stageEl || !hostEl) return;

      const glow = rippleCore.mountBrandHorizonGlow(canvas);
      let lastDrawAt = -Infinity;
      let staticSleepDrawn = false;

      const setup = () => {
        const rect = hostEl.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        glow.resize(rect.width, rect.height, Math.min(window.devicePixelRatio || 1, 1) * 0.72);
        lastDrawAt = -Infinity;
        staticSleepDrawn = false;
      };

      setup();
      const ro = new ResizeObserver(() => {
        setup();
        wakeMasterLoop();
      });
      ro.observe(hostEl);

      const ctrl = {
        isSleeping() {
          if (hostEl.getAttribute('data-dormant') === 'true') return true;
          if (isWbConvLivingFlow()) return false;
          return staticSleepDrawn;
        },
        step(now, force = false) {
          if (hostEl.getAttribute('data-dormant') === 'true') return;
          if (state.convAuraPhase === 'start' && now - state.convAuraPhaseAt >= WB_CONV_AURA_START_MS) {
            state.convAuraPhase = state.streamPhase === 'streaming' ? 'running' : 'idle';
            state.convAuraPhaseAt = now;
            staticSleepDrawn = false;
            syncConvAuraDomPhase();
            force = true;
          } else if (state.convAuraPhase === 'complete' && now - state.convAuraPhaseAt >= WB_CONV_AURA_COMPLETE_MS) {
            state.convAuraPhase = 'idle';
            state.convAuraPhaseAt = now;
            staticSleepDrawn = false;
            syncConvAuraDomPhase();
            force = true;
          }

          const allowLiving = isWbConvLivingFlow();
          if (!allowLiving && staticSleepDrawn && !force) return;

          const isDark = stageEl.getAttribute('data-theme') !== 'light';
          const prismScale = state.tokens.prismStrength ?? 1;
          const opt = computeWbConvAuraOptics(
            state.convAuraPhase,
            state.convAuraPhaseAt,
            now,
            isDark,
            state.streamPhase === 'streaming',
            prismScale
          );
          if (!force && allowLiving && now - lastDrawAt < opt.frameMs) return;
          lastDrawAt = now;
          if ((force || !allowLiving) && typeof glow.invalidate === 'function') glow.invalidate();
          invokeWbHorizonGlow(glow, now, isDark, !allowLiving, opt);
          if (!allowLiving) {
            staticSleepDrawn = true;
            hostEl.setAttribute('data-aura-sleep', '1');
          } else {
            staticSleepDrawn = false;
            hostEl.removeAttribute('data-aura-sleep');
          }
        },
        invalidate() {
          lastDrawAt = -Infinity;
          staticSleepDrawn = false;
          if (typeof glow.invalidate === 'function') glow.invalidate();
          wakeMasterLoop();
        },
        dispose() {
          ro.disconnect();
          if (typeof glow.dispose === 'function') glow.dispose();
        },
      };
      convAuraControllers.push(ctrl);
    });

    const nowInit = performance.now();
    for (const c of convAuraControllers) c.step(nowInit, true);
  }

  function mountEffortSliders() {
    const sliderMod = globalThis.AntigravityCodexEffortSlider;
    if (!sliderMod || typeof sliderMod.mountCodexEffortSlider !== 'function') return;

    document.querySelectorAll('[data-workbench-ces-mount="true"]').forEach((mountEl) => {
      if (mountEl.dataset.mounted === '1') return;
      mountEl.dataset.mounted = '1';
      const listeners = new Set();
      const seat = {
        get effortLevels() {
          const m = getActiveModel();
          if (m.isOrchestrator || !m.efforts.length) {
            return [{ effort: 'high', label: 'High' }];
          }
          return m.efforts.map((id) => {
            const meta = ALL_EFFORTS.find((e) => e.id === id) || { id, label: id };
            return { effort: id, label: meta.label };
          });
        },
        get currentEffort() {
          const m = getActiveModel();
          if (m.isOrchestrator || !m.efforts.length) return 'high';
          return state.effortByModel[m.id] || m.efforts[0];
        },
        get locked() {
          const m = getActiveModel();
          return Boolean(m.isOrchestrator) || m.efforts.length <= 1;
        },
        get baseName() {
          return getActiveModel().name;
        },
        get isClaude() {
          return getActiveModel().camp === 'claude';
        },
        get theme() {
          return getActiveModel().camp === 'claude' ? 'claude' : 'codex';
        },
        selectEffort(item) {
          const m = getActiveModel();
          const key = (item && (item.effort || (item.raw && item.raw.effort))) || '';
          if (m.isOrchestrator || !key || !m.efforts.includes(key)) return;
          state.effortByModel[m.id] = key;
          syncComposerTriggerDom();
          listeners.forEach((fn) => {
            try { fn(); } catch {}
          });
        },
        subscribe(fn) {
          listeners.add(fn);
          return () => listeners.delete(fn);
        },
      };

      const rowEl = mountEl.closest('[data-ces-effort-row="true"]');
      const valEl = rowEl ? rowEl.querySelector('.ces-ag-effort-value') : null;
      const inst = sliderMod.mountCodexEffortSlider({
        container: mountEl,
        seat,
        row: rowEl,
        valueElement: valEl,
        document,
        window,
      });

      sliderControllers.push({
        el: mountEl,
        notify() {
          listeners.forEach((fn) => {
            try { fn(); } catch {}
          });
          if (inst && typeof inst.refresh === 'function') inst.refresh();
        },
        dispose() {
          if (inst && typeof inst.unmount === 'function') inst.unmount();
        },
      });
    });
  }

  /* ── Physical Optical Borosilicate Water Vial (WebGL2 Backdrop Refraction + Slosh) ── */
  function mountVials() {
    const vialCore = globalThis.__agVialCore;
    if (!vialCore || typeof vialCore.mountPhysicalWaterVial !== 'function') return;

    const reduceMotion =
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const canvases = document.querySelectorAll('canvas[data-vial-canvas="true"]');

    canvases.forEach((canvas) => {
      const stageEl = canvas.closest('.ag-v2-stage');
      if (!stageEl || canvas.dataset.mounted === '1') return;
      canvas.dataset.mounted = '1';

      const getState = () => {
        const isDark = stageEl.getAttribute('data-theme') !== 'light';
        const model = getActiveModel();
        const tele = getContextTelemetry();
        const fill = Math.min(0.95, tele.ratios[0] + tele.ratios[1] + tele.ratios[2]);
        return {
          isDark,
          camp: model.camp,
          critical: state.vialCritical,
          fill,
          ratios: tele.ratios,
          maxTokens: 512000,
          hoveredSlice: state.hoveredSlice,
          streaming: state.vialStreaming,
        };
      };

      const initTele = getContextTelemetry();
      const inst = vialCore.mountPhysicalWaterVial(canvas, {
        fill: Math.min(0.95, initTele.ratios[0] + initTele.ratios[1] + initTele.ratios[2]),
        maxTokens: 512000,
        streaming: state.vialStreaming,
        reduceMotion,
        getState,
      });
      if (!inst) return;

      // Gravity slosh when shaking/dragging the floating radar popover window
      const popoverEl = canvas.closest('.ag-v2-dash-popover');
      let cleanups = [];
      if (popoverEl) {
        let draggingWin = false;
        let downX = 0;
        let downY = 0;
        let lastX = 0;
        let lastVx = 0;

        const onWinDown = (evt) => {
          if (evt.button !== 0) return;
          if (evt.target.closest('button, a, canvas[data-vial-canvas], [data-layer-slice]')) return;
          draggingWin = true;
          downX = evt.clientX;
          downY = evt.clientY;
          lastX = evt.clientX;
          lastVx = 0;
          popoverEl.style.transition = 'none';
          popoverEl.setPointerCapture?.(evt.pointerId);
        };
        const onWinMove = (evt) => {
          if (!draggingWin) return;
          const dxStep = evt.clientX - lastX;
          lastX = evt.clientX;
          const ox = Math.max(-44, Math.min(44, (evt.clientX - downX) * 0.55));
          const oy = Math.max(-20, Math.min(20, (evt.clientY - downY) * 0.4));
          popoverEl.style.transform = `translate3d(${ox.toFixed(1)}px, ${oy.toFixed(1)}px, 0) rotate(${(ox * 0.09).toFixed(2)}deg)`;
          if (Math.abs(dxStep) > 0.25) {
            const imp = Math.max(-3.2, Math.min(3.2, -dxStep * 0.13));
            lastVx = imp;
            inst.impulse(imp);
          }
        };
        const onWinUp = (evt) => {
          if (!draggingWin) return;
          draggingWin = false;
          popoverEl.releasePointerCapture?.(evt.pointerId);
          popoverEl.style.transition = 'transform 340ms cubic-bezier(0.22, 1.4, 0.36, 1)';
          popoverEl.style.transform = '';
          if (Math.abs(lastVx) > 0.15) inst.impulse(-lastVx * 0.55);
        };

        popoverEl.addEventListener('pointerdown', onWinDown);
        popoverEl.addEventListener('pointermove', onWinMove);
        popoverEl.addEventListener('pointerup', onWinUp);
        popoverEl.addEventListener('pointercancel', onWinUp);
        cleanups.push(() => {
          popoverEl.removeEventListener('pointerdown', onWinDown);
          popoverEl.removeEventListener('pointermove', onWinMove);
          popoverEl.removeEventListener('pointerup', onWinUp);
          popoverEl.removeEventListener('pointercancel', onWinUp);
          popoverEl.style.transform = '';
          popoverEl.style.transition = '';
        });
      }

      vialControllers.push({
        el: canvas,
        isSleeping() {
          if (state.vialStreaming) return false;
          if (typeof inst.isSettled === 'function') return Boolean(inst.isSettled());
          return false;
        },
        step(dtSec) {
          if (!state.vialStreaming && typeof inst.isSettled === 'function' && inst.isSettled()) return;
          inst.step(dtSec);
        },
        impulse(strength) {
          inst.impulse(strength);
          wakeMasterLoop();
        },
        spawnDroplet() {
          if (typeof inst.spawnDroplet === 'function') inst.spawnDroplet();
          wakeMasterLoop();
        },
        getDebugState() {
          return typeof inst.getDebugState === 'function' ? inst.getDebugState() : null;
        },
        dispose() {
          cleanups.forEach((fn) => fn());
          inst.dispose();
        },
      });
    });
  }

  /* ── Orchestrator Cut Optical Crystal Prism Bar (WebGL2 Facets + Near-Field Dispersion) ── */
  function mountCrystalBars() {
    const crystalCore = globalThis.__agCrystalPrismCore;
    if (!crystalCore || typeof crystalCore.mountCrystalPrismBar !== 'function') return;

    const reduceMotion =
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const canvases = document.querySelectorAll('canvas[data-orch-crystal-canvas="true"]');

    canvases.forEach((canvas) => {
      const stageEl = canvas.closest('.ag-v2-stage');
      if (!stageEl || canvas.dataset.mounted === '1') return;
      canvas.dataset.mounted = '1';

      const getState = () => {
        const isDark = stageEl.getAttribute('data-theme') !== 'light';
        const rawStrength = Number.parseFloat(getComputedStyle(stageEl).getPropertyValue('--ag-prism-strength'));
        const prismStrength = Number.isFinite(rawStrength) ? rawStrength : (state.tokens.prismStrength ?? 1);
        return {
          isDark,
          prismStrength,
        };
      };

      const inst = crystalCore.mountCrystalPrismBar(canvas, {
        reduceMotion,
        getState,
      });
      if (!inst) return;

      if (lastPointerPos.x > -1000) {
        inst.setPointerClient(lastPointerPos.x, lastPointerPos.y);
      }
      inst.step(0.016);
      inst.__hostEl = canvas;
      crystalControllers.push(inst);
    });
  }

  function mountMascots() {
    const rigMod = globalThis.__agDualMascotRig;
    if (!rigMod || typeof rigMod.mountDualMascotStage !== 'function') return;

    document.querySelectorAll('[data-mascot-stage="true"]').forEach((host) => {
      const floating = host.getAttribute('data-floating') === 'true';
      const model = getActiveModel();
      const wrap = host.closest('.ag-v2-composer-wrap');
      const card = wrap ? wrap.querySelector('.ag-v2-overlay-card') : null;
      const rightPop = wrap ? wrap.querySelector('.ag-v2-popover-docked.is-right') : null;
      const leapY = card && state.mascotYieldMode === 'leap' ? (card.offsetHeight || 76) + 16 : 0;
      const popW = rightPop ? rightPop.offsetWidth || (state.contextVialEnabled ? 408 : 316) : 0;

      const rig = rigMod.mountDualMascotStage(host, {
        camp: model.camp,
        streaming: state.streamPhase === 'streaming',
        streamTier: state.effortByModel[model.id] === 'xhigh' || model.isOrchestrator ? 3 : 2,
        hasError: state.hasToolError,
        yieldMode: state.overlayDemo ? state.mascotYieldMode : 'none',
        leapOffsetY: leapY,
        popoverRightWidth: floating ? popW : 0,
        miniPileEnabled: state.mascotMiniPile,
        orchestrator: Boolean(model.isOrchestrator),
      });
      if (rig) {
        mascotControllers.push({ host, floating, rig });
      }
    });
  }

  function computePerfSleepSnapshot(now = performance.now()) {
    const auraSleep =
      convAuraControllers.length === 0 || convAuraControllers.every((c) => (typeof c.isSleeping === 'function' ? c.isSleeping(now) : true));
    const rippleSleep =
      rippleControllers.length === 0 || rippleControllers.every((r) => (typeof r.isSleeping === 'function' ? r.isSleeping(now) : true));
    const vialSleep =
      vialControllers.length === 0 || vialControllers.every((v) => (typeof v.isSleeping === 'function' ? v.isSleeping() : true));
    const crystalSleep =
      crystalControllers.length === 0 || state.activeModelId !== 'orchestrator' || state.openPopover !== 'effort';
    const allSleep = auraSleep && rippleSleep && vialSleep && crystalSleep;
    return {
      allSleep,
      auraSleeping: auraSleep,
      rippleSleeping: rippleSleep,
      vialSleeping: vialSleep,
      auraText: auraSleep ? 'Aura: 0fps Idle Sleep' : `Aura: Active (${state.convAuraPhase})`,
      rippleText: rippleSleep ? 'Ripple: 0fps Idle Sleep' : 'Ripple: Active',
      vialText: vialSleep ? 'Vial: 0fps Idle Sleep' : 'Vial: Active',
    };
  }

  function updatePerfSleepIndicators(now = performance.now()) {
    const snap = computePerfSleepSnapshot(now);
    const auraEl = document.getElementById('val-aura-sleep');
    if (auraEl) {
      auraEl.textContent = snap.auraText;
      auraEl.setAttribute('data-state', snap.auraSleeping ? 'sleep' : 'active');
    }
    const rippleEl = document.getElementById('val-ripple-sleep');
    if (rippleEl) {
      rippleEl.textContent = snap.rippleText;
      rippleEl.setAttribute('data-state', snap.rippleSleeping ? 'sleep' : 'active');
    }
    const vialEl = document.getElementById('val-vial-sleep');
    if (vialEl) {
      vialEl.textContent = snap.vialText;
      vialEl.setAttribute('data-state', snap.vialSleeping ? 'sleep' : 'active');
    }
    const masterEl = document.getElementById('val-master-fps');
    if (masterEl) {
      masterEl.textContent = snap.allSleep ? '0fps Idle' : '60fps Active';
      masterEl.setAttribute('data-sleep', String(snap.allSleep));
    }
    return snap;
  }

  function wakeMasterLoop() {
    if (masterRafId) return;
    startMasterLoop();
  }

  function startMasterLoop() {
    if (masterRafId) cancelAnimationFrame(masterRafId);
    masterSleeping = false;
    lastFrameMs = performance.now();

    const tick = (now) => {
      masterRafId = 0;
      masterFrameTicks += 1;
      const dtSec = Math.min(0.05, Math.max(0.001, (now - lastFrameMs) / 1000));
      lastFrameMs = now;

      if (!document.hidden && !windowBlurredLong) {
        for (const r of rippleControllers) r.step(now);
        for (const a of convAuraControllers) a.step(now);
        for (const v of vialControllers) v.step(dtSec);
        if (state.activeModelId === 'orchestrator' && state.openPopover === 'effort') {
          for (const c of crystalControllers) c.step(dtSec);
        }
      }

      const snap = updatePerfSleepIndicators(now);
      if (snap.allSleep || document.hidden || windowBlurredLong) {
        masterSleeping = true;
        return;
      }
      masterRafId = requestAnimationFrame(tick);
    };
    masterRafId = requestAnimationFrame(tick);
  }

  function disposeRuntimeInstances() {
    if (masterRafId) {
      cancelAnimationFrame(masterRafId);
      masterRafId = 0;
    }
    if (prismRafId) {
      cancelAnimationFrame(prismRafId);
      prismRafId = 0;
    }
    for (const ctrl of rippleControllers) {
      try { ctrl.dispose(); } catch {}
    }
    rippleControllers = [];
    for (const aura of convAuraControllers) {
      try { aura.dispose(); } catch {}
    }
    convAuraControllers = [];
    for (const vial of vialControllers) {
      try { vial.dispose(); } catch {}
    }
    vialControllers = [];
    for (const crystal of crystalControllers) {
      try { crystal.dispose(); } catch {}
    }
    crystalControllers = [];
    for (const sl of sliderControllers) {
      try { sl.dispose(); } catch {}
    }
    sliderControllers = [];
    for (const mc of mascotControllers) {
      try { mc.rig.dispose(); } catch {}
    }
    mascotControllers = [];
  }

  function buildQuadHtml() {
    return `
      <div class="wb-quad-grid" data-testid="wb-quad-theme-matrix">
        <div class="wb-quad-pane" data-quad="obsidian-dark">
          ${buildSingleStageHtml('dark', {
            palette: 'obsidian',
            theme: 'dark',
            lightPreset: 'crystal',
            lockedPreset: true,
            sidebarCollapsed: true,
            allowFloat: false,
            crumbTag: '1 · DARK OBSIDIAN 深空',
          })}
        </div>
        <div class="wb-quad-pane" data-quad="warm-dark">
          ${buildSingleStageHtml('dark', {
            palette: 'warm',
            theme: 'dark',
            lightPreset: 'alabaster',
            lockedPreset: true,
            sidebarCollapsed: true,
            allowFloat: false,
            crumbTag: '2 · DARK WARM 暖炭',
          })}
        </div>
        <div class="wb-quad-pane" data-quad="daylight-crystal">
          ${buildSingleStageHtml('light', {
            palette: 'obsidian',
            theme: 'light',
            lightPreset: 'crystal',
            lockedPreset: true,
            sidebarCollapsed: true,
            allowFloat: false,
            crumbTag: '3 · LIGHT DAYLIGHT CRYSTAL 白昼冷晶',
          })}
        </div>
        <div class="wb-quad-pane" data-quad="warm-alabaster">
          ${buildSingleStageHtml('light', {
            palette: 'warm',
            theme: 'light',
            lightPreset: 'alabaster',
            lockedPreset: true,
            sidebarCollapsed: true,
            allowFloat: false,
            crumbTag: '4 · LIGHT WARM ALABASTER 暖白画册',
          })}
        </div>
      </div>`;
  }

  function renderWorkbench() {
    disposeRuntimeInstances();
    const host = document.getElementById('wb-stage-host');
    if (!host) return;

    if (state.viewMode === 'split') {
      host.innerHTML = `
        <div class="wb-split-grid">
          <div class="wb-split-pane">
            <span class="wb-split-badge">DARK · ${state.tokens.palette.toUpperCase()}</span>
            ${buildSingleStageHtml('dark')}
          </div>
          <div class="wb-split-pane">
            <span class="wb-split-badge">LIGHT · ${(state.tokens.lightPreset || 'crystal').toUpperCase()}</span>
            ${buildSingleStageHtml('light')}
          </div>
        </div>`;
    } else if (state.viewMode === 'quad') {
      host.innerHTML = buildQuadHtml();
    } else if (state.viewMode === 'matrix') {
      host.innerHTML = buildMatrixHtml();
    } else {
      host.innerHTML = buildSingleStageHtml();
    }

    applyTokenStylesToStages();
    syncTopbarControls();
    syncInspectorControls();
    mountRipples();
    mountConvAuras();
    mountVials();
    mountCrystalBars();
    mountEffortSliders();
    mountMascots();
    requestAnimationFrame(syncMascotsState);
    if (lastPointerPos.x > -1000) updatePrismCoordinates();
    updatePerfSleepIndicators();
    startMasterLoop();
  }

  /* ── 局部补丁层：浮窗 / 叠层卡 / 时段 / 缓存等热路径不再整树重建，保住焦点、WebGL 与过渡动画 ── */
  function pruneDetachedControllers() {
    vialControllers = vialControllers.filter((v) => {
      if (v.el && !v.el.isConnected) {
        try { v.dispose(); } catch {}
        return false;
      }
      return true;
    });
    crystalControllers = crystalControllers.filter((c) => {
      if (c.__hostEl && !c.__hostEl.isConnected) {
        try { c.dispose(); } catch {}
        return false;
      }
      return true;
    });
    sliderControllers = sliderControllers.filter((sl) => {
      if (sl.el && !sl.el.isConnected) {
        try { sl.dispose(); } catch {}
        return false;
      }
      return true;
    });
  }

  // 退场动画播完再卸载；减弱动态时立即移除
  function animateOut(el, onDone) {
    if (!el) {
      if (onDone) onDone();
      return;
    }
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      el.remove();
      if (onDone) onDone();
    };
    if (prefersReducedMotion()) {
      finish();
      return;
    }
    el.classList.add('is-closing');
    el.style.pointerEvents = 'none';
    el.addEventListener('animationend', finish, { once: true });
    setTimeout(finish, 260);
  }

  function getFloatingComposerWraps() {
    return Array.from(document.querySelectorAll('.ag-v2-mascot-stage[data-floating="true"]'))
      .map((host) => host.closest('.ag-v2-composer-wrap'))
      .filter(Boolean);
  }

  function syncPopoverTriggers() {
    document.querySelectorAll('.ag-v2-composer-wrap').forEach((wrap) => {
      const floating = Boolean(wrap.querySelector('.ag-v2-mascot-stage[data-floating="true"]'));
      const m = wrap.querySelector('[data-testid="model-selector-trigger"]');
      const d = wrap.querySelector('[data-testid="dashboard-vial-trigger"]');
      if (m) m.setAttribute('aria-expanded', String(floating && state.openPopover === 'effort'));
      if (d) d.setAttribute('aria-expanded', String(floating && state.openPopover === 'dashboard'));
    });
  }

  // 浮窗锚点展收：旧浮窗播 is-closing 退场，新浮窗以 agPopIn 从触发按钮方向长出
  function swapPopovers() {
    const wraps = getFloatingComposerWraps();
    if (!wraps.length) {
      renderWorkbench();
      return;
    }
    const html =
      state.openPopover === 'effort'
        ? buildModelPanelHtml(true)
        : state.openPopover === 'dashboard'
          ? buildDashboardPanelHtml(true)
          : '';
    wraps.forEach((wrap) => {
      wrap.querySelectorAll(':scope > .ag-v2-popover-docked:not(.is-closing)').forEach((old) => {
        animateOut(old, () => {
          pruneDetachedControllers();
          syncMascotsState();
        });
      });
      if (html) {
        const box = wrap.querySelector('[data-testid="agent-input-box"]');
        if (box) box.insertAdjacentHTML('beforebegin', html);
      }
    });
    mountVials();
    mountCrystalBars();
    mountEffortSliders();
    syncPopoverTriggers();
    notifyMascots('popover', { side: state.openPopover === 'effort' ? 'left' : state.openPopover === 'dashboard' ? 'right' : null });
    if (lastPointerPos.x > -1000) updatePrismCoordinates();
    requestAnimationFrame(syncMascotsState);
  }

  function applyHoveredSliceDom() {
    document.querySelectorAll('[data-layer-slice]').forEach((r) => {
      const idx = parseInt(r.getAttribute('data-layer-slice'), 10);
      r.setAttribute('data-hovered', String(idx === state.hoveredSlice));
    });
    document.querySelectorAll('.ag-v2-ctx-bar-track').forEach((track) => {
      track.setAttribute('data-has-hover', String(state.hoveredSlice >= 0));
    });
  }

  function syncContextVialUiControls() {
    const ctx = getContextTelemetry();
    document.querySelectorAll('[data-testid="dashboard-vial-trigger"]').forEach((trg) => {
      trg.setAttribute('data-vial-mode', state.contextVialEnabled ? 'vial' : 'bar');
      const svg = trg.querySelector('.ag-v2-ring-svg');
      const mini = trg.querySelector('[data-trigger-minibar="true"]');
      const tip = trg.querySelector('.ag-v2-ctx-tooltip');
      if (svg) svg.style.display = state.contextVialEnabled ? '' : 'none';
      if (mini) {
        mini.style.display = state.contextVialEnabled ? 'none' : '';
        const fill = mini.querySelector('i');
        if (fill) fill.style.width = `${Math.round(ctx.pct)}%`;
      }
      if (tip) {
        tip.textContent = `实时速度 ${ctx.rate} · 点击打开${state.contextVialEnabled ? '实体水试管' : '极简上下文面板'}`;
      }
    });

    document.querySelectorAll('[data-action="toggle-context-vial"]').forEach((btn) => {
      btn.setAttribute('data-on', String(state.contextVialEnabled));
    });
    syncInspectorControls();
  }

  // 原地切换实体水试管 ⇄ 极简分段长条，避免闪烁并安全管理 WebGL 上下文
  function setContextVialEnabled(nextOn) {
    state.contextVialEnabled = Boolean(nextOn);
    for (const v of vialControllers) {
      try { v.dispose(); } catch {}
    }
    vialControllers = [];

    document.querySelectorAll('.ag-v2-dash-popover:not(.is-closing)').forEach((pop) => {
      const isFloating = pop.classList.contains('ag-v2-popover-docked');
      const tmp = document.createElement('div');
      tmp.innerHTML = buildDashboardPanelHtml(isFloating).trim();
      const nextPop = tmp.firstElementChild;
      if (nextPop) {
        nextPop.classList.add('is-mode-swap');
        pop.replaceWith(nextPop);
      }
    });

    syncContextVialUiControls();
    if (state.contextVialEnabled) {
      mountVials();
    }
    requestAnimationFrame(syncMascotsState);
  }

  // 接管卡 / 斜杠菜单：同类卡片原地换内容，不同类则交叉退场 + 入场
  function swapOverlay() {
    const wraps = getFloatingComposerWraps();
    if (!wraps.length) {
      renderWorkbench();
      return;
    }
    const html = buildOverlayCardHtml();
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const next = tmp.firstElementChild;
    wraps.forEach((wrap) => {
      const old = wrap.querySelector(':scope > .ag-v2-overlay-card:not(.is-closing)');
      if (old && next && old.getAttribute('data-testid') === next.getAttribute('data-testid')) {
        old.innerHTML = next.innerHTML;
        return;
      }
      if (old) animateOut(old, () => requestAnimationFrame(syncMascotsState));
      if (next) {
        const stage = wrap.querySelector('.ag-v2-mascot-stage');
        if (stage) stage.insertAdjacentHTML('afterend', html);
      }
    });
    requestAnimationFrame(syncMascotsState);
  }

  // 切换 7 天 / 30 天 / 全部：弹簧滑移胶囊 + 热力图按列错峰重排 + 人文标尺数字翻牌
  function patchTimeRange() {
    const grids = document.querySelectorAll('[data-heat-grid="true"]');
    if (!grids.length) {
      renderWorkbench();
      return;
    }
    const stat = TIME_RANGE_STATS[state.timeRange];
    grids.forEach((g) => {
      g.innerHTML = buildHeatmapCells();
      g.classList.remove('is-restaging');
      void g.offsetWidth;
      g.classList.add('is-restaging');
    });
    document.querySelectorAll('[data-hero-num="true"]').forEach((el) => {
      el.textContent = stat.books;
      el.classList.remove('is-rolling');
      void el.offsetWidth;
      el.classList.add('is-rolling');
    });
    document.querySelectorAll('[data-scale-sub="true"]').forEach((el) => {
      el.textContent = stat.sub;
    });
    document.querySelectorAll('[data-testid="studio-time-range-tabs"]').forEach((tabBar) => {
      const prevBtn = tabBar.querySelector('[data-range][data-active="true"]');
      const prevRect = prevBtn ? prevBtn.getBoundingClientRect() : null;
      tabBar.querySelectorAll('.ag-v2-seg-glide-bg').forEach((g) => g.remove());
      let nextBtn = null;
      tabBar.querySelectorAll('[data-range]').forEach((btn) => {
        const isAct = btn.getAttribute('data-range') === state.timeRange;
        btn.setAttribute('data-active', String(isAct));
        if (isAct) nextBtn = btn;
      });
      if (nextBtn) {
        nextBtn.insertAdjacentHTML('afterbegin', '<span class="ag-v2-seg-glide-bg" data-range-glide="true" aria-hidden="true"></span>');
        const glideEl = nextBtn.querySelector('.ag-v2-seg-glide-bg');
        if (glideEl && prevRect && prevBtn !== nextBtn) {
          runGlide(glideEl, prevRect, nextBtn.getBoundingClientRect());
        }
      }
    });
  }

  // 侧边栏局部折叠伸缩（236px 展开态 ⇄ 56px 窄微轨态，不销毁 WebGL 舞台）
  function setSidebarCollapsed(nextCollapsed) {
    const target = Boolean(nextCollapsed);
    if (state.sidebarCollapsed === target) return;
    state.sidebarCollapsed = target;

    document.querySelectorAll('[data-stage-floating-tip="true"]').forEach((t) => t.setAttribute('data-show', 'false'));

    document.querySelectorAll('[data-testid="sidebar-split"]').forEach((sb) => {
      sb.setAttribute('data-collapsed', String(target));
      const btn = sb.querySelector('[data-testid="sidebar-collapse-btn"]');
      if (btn) {
        btn.setAttribute('data-tip', target ? '展开抽屉|[' : '收起抽屉|[');
        btn.setAttribute('aria-expanded', String(!target));
        btn.setAttribute('aria-label', target ? '展开侧边栏' : '收起侧边栏');
        triggerAnimIcon(btn, target ? 'collapse' : 'expand');
      }
      if (target && globalThis.__agMotionEngine && typeof globalThis.__agMotionEngine.stagger === 'function' && !prefersReducedMotion()) {
        const railBtns = sb.querySelectorAll('.ag-v2-sidebar-rail-body .ag-v2-rail-btn');
        if (railBtns.length) {
          try {
            globalThis.__agMotionEngine.stagger(
              Array.from(railBtns),
              [
                { opacity: 0, transform: 'scale(0.86) translateY(4px)' },
                { opacity: 1, transform: 'scale(1) translateY(0)' },
              ],
              { delayStep: 22, stiffness: 400, damping: 28 }
            );
          } catch {}
        }
      }
    });

    setTimeout(() => {
      rippleControllers.forEach((ctrl) => ctrl.invalidate());
      requestAnimationFrame(syncMascotsState);
    }, 330);
  }

  // 侧边栏按需搜索栏展开/收起（平时隐藏零噪音）
  function setSidebarSearchOpen(nextOpen, focusInput = false) {
    const target = Boolean(nextOpen);
    state.sidebarSearchOpen = target;
    document.querySelectorAll('[data-testid="sidebar-split"]').forEach((sb) => {
      sb.setAttribute('data-search-open', String(target));
      const wrap = sb.querySelector('[data-sidebar-search-wrap="true"]');
      if (wrap) wrap.setAttribute('data-open', String(target));
      const toggleBtn = sb.querySelector('[data-testid="sidebar-search-toggle"]');
      if (toggleBtn) toggleBtn.setAttribute('data-active', String(target));
    });
    if (target && focusInput) {
      requestAnimationFrame(() => {
        const inp = document.querySelector('[data-testid="sidebar-search-input"]');
        if (inp) {
          inp.focus();
          inp.select?.();
        }
      });
    }
  }

  // 侧边栏会话列表原地实时过滤（保住搜索框焦点与光标）
  function patchSidebarSessions(syncInputValue = false) {
    document.querySelectorAll('[data-testid="sidebar-split"]').forEach((sb) => {
      if (syncInputValue) {
        const inp = sb.querySelector('[data-testid="sidebar-search-input"]');
        if (inp && inp.value !== state.sidebarSearchQuery) {
          inp.value = state.sidebarSearchQuery;
        }
      }
      const tail = sb.querySelector('[data-sidebar-search-tail="true"]');
      if (tail) tail.innerHTML = buildSidebarSearchTailHtml();
      const list = sb.querySelector('[data-sidebar-sessions="true"]');
      if (list) {
        list.innerHTML = buildSidebarSessionsHtml();
      }
    });
  }

  // 委托式悬浮毛玻璃 Tooltip（服务于侧栏折叠钮与 56px 微轨按钮，挂在舞台根部零裁切）
  function bindStageTooltips() {
    const hideAll = () => {
      document.querySelectorAll('[data-stage-floating-tip="true"]').forEach((t) => t.setAttribute('data-show', 'false'));
    };
    document.addEventListener('pointerover', (evt) => {
      const host = evt.target && evt.target.closest ? evt.target.closest('[data-tip]:not(.ag-v2-heat-cell)') : null;
      if (!host) return;
      const stage = host.closest('.ag-v2-stage');
      const tip = stage ? stage.querySelector('[data-stage-floating-tip="true"]') : null;
      if (!stage || !tip) return;
      const raw = String(host.getAttribute('data-tip') || '');
      if (!raw) return;
      const [label, kbd] = raw.split('|');
      const spanEl = tip.querySelector('span');
      const kbdEl = tip.querySelector('kbd');
      if (spanEl) spanEl.textContent = label || '';
      if (kbdEl) {
        kbdEl.textContent = kbd || '';
        kbdEl.style.display = kbd ? '' : 'none';
      }
      const sRect = stage.getBoundingClientRect();
      const r = host.getBoundingClientRect();
      const left = r.right - sRect.left + 10;
      const top = r.top - sRect.top + r.height / 2;
      tip.style.setProperty('--ftip-x', `${left.toFixed(1)}px`);
      tip.style.setProperty('--ftip-y', `${top.toFixed(1)}px`);
      tip.setAttribute('data-show', 'true');
    });
    document.addEventListener('pointerout', (evt) => {
      const host = evt.target && evt.target.closest ? evt.target.closest('[data-tip]:not(.ag-v2-heat-cell)') : null;
      if (!host) return;
      if (evt.relatedTarget && host.contains(evt.relatedTarget)) return;
      hideAll();
    });
    document.addEventListener('pointerdown', hideAll, { passive: true });
  }

  function patchCacheCleaner() {
    const cleaners = document.querySelectorAll('.ag-v2-inline-cleaner');
    if (!cleaners.length) {
      renderWorkbench();
      return;
    }
    const html = buildInlineCacheHtml().trim();
    cleaners.forEach((el) => {
      el.outerHTML = html;
    });
  }

  function patchUserBubble() {
    document.querySelectorAll('.ag-v2-user-text-wrap').forEach((w) => {
      w.setAttribute('data-collapsed', String(!state.userBubbleExpanded));
    });
    document.querySelectorAll('[data-action="toggle-user-bubble"]').forEach((b) => {
      b.textContent = state.userBubbleExpanded ? '收起长提问' : '展开全部长提问';
    });
  }

  // 热力图 0 延迟玻璃提示胶囊（委托式，全局只绑一次）
  function bindHeatTooltip() {
    document.addEventListener('pointerover', (evt) => {
      const cell = evt.target && evt.target.closest ? evt.target.closest('.ag-v2-heat-cell') : null;
      if (!cell) return;
      const wrap = cell.closest('.ag-v2-heat-wrap');
      const tip = wrap ? wrap.querySelector('.ag-v2-heat-tip') : null;
      if (!tip) return;
      const [title, sub] = String(cell.getAttribute('data-tip') || '').split('|');
      tip.querySelector('strong').textContent = title || '';
      tip.querySelector('span').textContent = sub || '';
      const wrapRect = wrap.getBoundingClientRect();
      const r = cell.getBoundingClientRect();
      const half = (tip.offsetWidth || 120) / 2;
      const cx = Math.max(half, Math.min(wrapRect.width - half, r.left - wrapRect.left + r.width / 2));
      tip.style.setProperty('--tip-x', `${cx.toFixed(1)}px`);
      tip.style.setProperty('--tip-y', `${(r.top - wrapRect.top).toFixed(1)}px`);
      tip.setAttribute('data-show', 'true');
    });
    document.addEventListener('pointerout', (evt) => {
      const cell = evt.target && evt.target.closest ? evt.target.closest('.ag-v2-heat-cell') : null;
      if (!cell) return;
      const to = evt.relatedTarget && evt.relatedTarget.closest ? evt.relatedTarget.closest('.ag-v2-heat-cell') : null;
      if (to) return;
      const wrap = cell.closest('.ag-v2-heat-wrap');
      const tip = wrap ? wrap.querySelector('.ag-v2-heat-tip') : null;
      if (tip) tip.setAttribute('data-show', 'false');
    });
  }

  function syncRunningUiDom() {
    getFloatingComposerWraps().forEach((wrap) => {
      const rightBar = wrap.querySelector('.ag-v2-toolbar-right');
      if (!rightBar) return;
      const curBtn = rightBar.querySelector('[data-testid="send-button"], [data-testid="input-cancel-button"]');
      if (!curBtn) return;
      const wantRunning = state.streamPhase === 'streaming';
      const isRunningNow = curBtn.getAttribute('data-testid') === 'input-cancel-button';
      if (wantRunning !== isRunningNow) {
        curBtn.outerHTML = buildComposerActionBtnHtml(true);
      }
    });
    patchSidebarSessions(false);
  }

  function stopStreamSimulation() {
    clearInterval(streamTimerId);
    streamTimerId = 0;
    if (state.streamPhase !== 'streaming') return;
    state.streamPhase = 'done';
    state.convAuraPhase = 'complete';
    state.convAuraPhaseAt = performance.now();
    syncConvAuraDomPhase();
    convAuraControllers.forEach((c) => c.invalidate());
    if (!state.hasToolError) {
      state.thinkingOpen = false;
    }
    if (!patchChatStreamDom()) {
      syncRunningUiDom();
      syncMascotsState();
    }
  }

  function startStreamSimulation() {
    clearInterval(streamTimerId);
    // 已在对话视图（含滑块 / 水试管场景）时只做局部补丁；否则切到对话场景整页过渡
    const needFullRender =
      state.viewMode === 'matrix' || !document.querySelector('[data-testid="conversation-view"]');
    if (needFullRender) state.scene = 'chat';
    if (state.viewMode === 'matrix') state.viewMode = 'single';
    state.streamPhase = 'streaming';
    state.convAuraPhase = 'start';
    state.convAuraPhaseAt = performance.now();
    state.thinkingOpen = true;
    state.streamWordProgress = 1;
    if (needFullRender) {
      withViewTransition(renderWorkbench);
    } else {
      syncConvAuraDomPhase();
      convAuraControllers.forEach((c) => c.invalidate());
      patchChatStreamDom({ resetProse: true });
    }

    streamTimerId = setInterval(() => {
      // 后台标签页暂停吐字节拍，回到前台继续
      if (document.hidden) return;
      if (state.streamWordProgress < STREAM_FULL_PARAGRAPHS.length) {
        state.streamWordProgress += 1;
        if (!patchChatStreamDom()) renderWorkbench();
      } else {
        clearInterval(streamTimerId);
        streamTimerId = 0;
        state.streamPhase = 'done';
        state.convAuraPhase = 'complete';
        state.convAuraPhaseAt = performance.now();
        syncConvAuraDomPhase();
        convAuraControllers.forEach((c) => c.invalidate());
        // 整轮回答结束后才收折思考链；报错态保持展开
        if (!state.hasToolError) {
          state.thinkingOpen = false;
        }
        if (!patchChatStreamDom()) renderWorkbench();
        // 整轮答完：双宠庆祝（报错态则担忧）
        notifyMascots('streamDone', { error: state.hasToolError });
      }
    }, 720);
  }

  function setMotionLevel(nextLv, sourceBtn = null) {
    if (nextLv !== 'off' && nextLv !== 'subtle' && nextLv !== 'standard' && nextLv !== 'ultra') return;
    const prevGlide = document.querySelector('[data-motion-glide="true"]');
    const prevRect = prevGlide ? prevGlide.getBoundingClientRect() : null;
    const grp = sourceBtn ? sourceBtn.closest('[role="group"]') : null;
    const prevGrpBtn = grp ? grp.querySelector('[data-active="true"]') : null;
    const prevGrpRect = prevGrpBtn ? prevGrpBtn.getBoundingClientRect() : null;

    state.motionLevel = nextLv;
    applyTokenStylesToStages();
    syncTopbarControls();
    syncInspectorControls();
    for (const ctrl of rippleControllers) ctrl.invalidate();
    for (const ctrl of convAuraControllers) ctrl.invalidate();

    document.querySelectorAll('[data-testid="studio-motion-tier-tabs"]').forEach((tabs) => {
      tabs.querySelectorAll('[data-wb-motion]').forEach((b) => {
        const active = b.getAttribute('data-wb-motion') === nextLv;
        b.setAttribute('data-active', String(active));
        const existing = b.querySelector('[data-motion-glide]');
        if (active && !existing) {
          const span = document.createElement('span');
          span.className = 'ag-v2-seg-glide-bg';
          span.setAttribute('data-motion-glide', 'true');
          span.setAttribute('aria-hidden', 'true');
          b.insertBefore(span, b.firstChild);
        } else if (!active && existing) {
          existing.remove();
        }
      });
    });

    if ((nextLv === 'standard' || nextLv === 'ultra') && !prefersReducedMotion()) {
      const nextGlide = document.querySelector('[data-motion-glide="true"]');
      const nextBtn = nextGlide ? nextGlide.closest('[data-wb-motion]') : null;
      if (prevRect && nextGlide && nextBtn) {
        runGlide(nextGlide, prevRect, nextBtn.getBoundingClientRect());
      } else if (grp && sourceBtn && prevGrpBtn && prevGrpBtn !== sourceBtn && prevGrpRect) {
        runGlide(sourceBtn, prevGrpRect, sourceBtn.getBoundingClientRect());
      }
    }
  }

  function triggerHeroDemo(kind) {
    const me = globalThis.__agMotionEngine;
    if (kind === 'liftoff') {
      if (state.motionLevel !== 'ultra') setMotionLevel('ultra');
      const homeBox = document.querySelector('.ag-v2-studio-home [data-testid="agent-input-box"], [data-testid="agent-input-box"]');
      const oldRect = homeBox ? homeBox.getBoundingClientRect() : null;
      rippleControllers.forEach((c) => c.triggerLiftoffBurst(0.5, 0.62));

      document.querySelectorAll('.ag-cs-liftoff-veil').forEach((n) => n.remove());
      const veil = document.createElement('div');
      veil.className = 'ag-cs-liftoff-veil';
      veil.setAttribute('aria-hidden', 'true');
      veil.style.setProperty('--ag-lift-x', oldRect && oldRect.width > 0 ? `${Math.round(oldRect.left + oldRect.width / 2)}px` : '50%');
      veil.style.setProperty('--ag-lift-y', oldRect && oldRect.height > 0 ? `${Math.round(oldRect.top + oldRect.height / 2)}px` : '58%');
      const ring = document.createElement('div');
      ring.className = 'ag-cs-liftoff-ring';
      veil.appendChild(ring);
      document.body.appendChild(veil);
      setTimeout(() => veil.remove(), 540);

      state.scene = 'chat';
      if (state.viewMode === 'matrix') state.viewMode = 'single';
      state.openPopover = null;
      state.liftoffEbbAt = performance.now();
      state.convAuraPhase = 'start';
      state.convAuraPhaseAt = state.liftoffEbbAt;
      renderWorkbench();

      const newBox = document.querySelector('[data-testid="agent-input-box"]');
      if (newBox && me && typeof me.spring === 'function') {
        const nr = newBox.getBoundingClientRect();
        const rawDy = oldRect && nr ? Math.round(oldRect.top - nr.top) : -160;
        const dy = Math.max(-420, Math.min(-24, rawDy === 0 ? -150 : rawDy));
        me.spring(newBox, [{ transform: `translateY(${dy}px) scale(0.985)` }, { transform: 'translateY(0) scale(1)' }], {
          durationMs: 480,
          stiffness: 310,
          damping: 28,
          slot: 'wb-liftoff-dock',
        });
      }
      const bubble = document.querySelector('[data-testid="user-message-bubble"]');
      if (bubble) {
        bubble.setAttribute('data-ag-cs-liftoff-bubble', '1');
        setTimeout(() => bubble.removeAttribute('data-ag-cs-liftoff-bubble'), 500);
      }
      return;
    }

    if (kind === 'caustic') {
      if (state.motionLevel !== 'ultra') setMotionLevel('ultra');
      const targets = document.querySelectorAll('[data-testid="agent-input-box"], [data-testid="code-block-container"]');
      targets.forEach((el) => {
        el.removeAttribute('data-ag-cs-caustic');
        void el.offsetWidth;
        el.setAttribute('data-ag-cs-caustic', '1');
        setTimeout(() => el.removeAttribute('data-ag-cs-caustic'), 920);
      });
      notifyMascots('streamDone', { error: false });
      return;
    }

    if (kind === 'fiber') {
      if (state.motionLevel !== 'ultra') setMotionLevel('ultra');
      const cycle = ['orchestrator', 'gemini-4-carbon', 'claude-4.6-opus', 'gpt-oss-120b'];
      const nextIdx = (cycle.indexOf(state.activeModelId) + 1) % cycle.length;
      state.activeModelId = cycle[nextIdx];
      syncComposerTriggerDom();
      syncInspectorControls();
      const brand = getModelBrand(getActiveModel());
      document.querySelectorAll('[data-testid="agent-input-box"]').forEach((box) => {
        box.removeAttribute('data-ag-cs-fiber-camp');
        void box.offsetWidth;
        box.setAttribute('data-ag-cs-fiber-camp', brand);
        setTimeout(() => box.removeAttribute('data-ag-cs-fiber-camp'), 480);
      });
      if (me && typeof me.spring === 'function') {
        document.querySelectorAll('[data-composer-model-glyph="true"]').forEach((gl) => {
          me.spring(
            gl,
            [{ transform: 'scale(0.84) rotate(-8deg)' }, { transform: 'scale(1.14) rotate(3deg)' }, { transform: 'scale(1) rotate(0deg)' }],
            { stiffness: 420, damping: 22, slot: 'wb-fiber-focus' }
          );
        });
      }
      return;
    }

    if (kind === 'dual-stream') {
      if (state.motionLevel !== 'ultra') setMotionLevel('ultra');
      startStreamSimulation();
    }
  }

  function triggerOverlayDemo(kind) {
    if (kind === 'slash') {
      state.openPopover = null;
      state.overlayDemo = state.overlayDemo === 'slash' ? null : 'slash';
      state.mascotYieldMode = state.overlayDemo === 'slash' ? 'peek' : 'none';
      swapPopovers();
      swapOverlay();
      return;
    }

    if (kind === 'takeover') {
      state.openPopover = null;
      if (state.overlayDemo === 'takeover') {
        state.overlayDemo = null;
        state.mascotYieldMode = 'none';
      } else {
        state.overlayDemo = 'takeover';
        state.mascotYieldMode = 'leap';
      }
      swapPopovers();
      swapOverlay();
    }
  }

  function bindGlobalEvents() {
    window.addEventListener('pointermove', (evt) => {
      schedulePrismUpdate(evt.clientX, evt.clientY);
      markUserActivity();
    });
    window.addEventListener('keydown', (evt) => {
      markUserActivity();

      // Ctrl+K / Cmd+K：自动展开侧栏与隐藏式搜索槽并聚焦
      if ((evt.ctrlKey || evt.metaKey) && !evt.altKey && evt.key && evt.key.toLowerCase() === 'k') {
        evt.preventDefault();
        if (state.sidebarCollapsed) setSidebarCollapsed(false);
        setSidebarSearchOpen(true, true);
        return;
      }

      // 焦点不在输入框时，按 `[` 键物理弹簧折叠/展开侧边栏
      if (evt.key === '[' && !evt.ctrlKey && !evt.metaKey && !evt.altKey) {
        const t = evt.target;
        const isEditable =
          t &&
          (t.tagName === 'INPUT' ||
            t.tagName === 'TEXTAREA' ||
            t.tagName === 'SELECT' ||
            t.isContentEditable ||
            (t.closest && t.closest('[contenteditable="true"]')));
        if (!isEditable) {
          evt.preventDefault();
          setSidebarCollapsed(!state.sidebarCollapsed);
        }
      }
    });
    window.addEventListener('pointerleave', () => {
      schedulePrismUpdate(-9999, -9999);
    });
    document.addEventListener('mouseout', (evt) => {
      if (!evt.relatedTarget) {
        schedulePrismUpdate(-9999, -9999);
      }
    });
    window.addEventListener('blur', () => {
      clearTimeout(blurTimeoutId);
      blurTimeoutId = setTimeout(() => {
        windowBlurredLong = true;
      }, 30000);
    });
    window.addEventListener('focus', () => {
      clearTimeout(blurTimeoutId);
      windowBlurredLong = false;
    });

    // Hover laser spotlight sync between right layer rows / minimal bar and left sapphire tube
    document.addEventListener('pointerover', (evt) => {
      const row = evt.target && evt.target.closest ? evt.target.closest('[data-layer-slice]') : null;
      if (row) {
        const idx = parseInt(row.getAttribute('data-layer-slice'), 10);
        if (state.hoveredSlice !== idx) {
          state.hoveredSlice = Number.isFinite(idx) ? idx : -1;
          applyHoveredSliceDom();
        }
      }
    });
    document.addEventListener('pointerout', (evt) => {
      const row = evt.target && evt.target.closest ? evt.target.closest('[data-layer-slice]') : null;
      if (row && (!evt.relatedTarget || !row.contains(evt.relatedTarget))) {
        const list = row.closest('.ag-v2-layer-list, .ag-v2-ctx-bar-track');
        if (list && (!evt.relatedTarget || !list.contains(evt.relatedTarget))) {
          state.hoveredSlice = -1;
          applyHoveredSliceDom();
        }
      }
    });

    // Listen for typing in sidebar search filter OR composer input
    document.addEventListener('input', (evt) => {
      const target = evt.target;
      if (target && target.getAttribute && target.getAttribute('data-testid') === 'sidebar-search-input') {
        state.sidebarSearchQuery = target.value || '';
        patchSidebarSessions(false);
        return;
      }
      if (!target || !target.classList || !target.classList.contains('ag-v2-composer-input')) return;
      mascotControllers.forEach((mc) => mc.rig.onUserType(target.textContent || ''));
      const text = (target.textContent || '').trim();
      if (text.startsWith('/') && state.overlayDemo !== 'slash') {
        state.openPopover = null;
        state.overlayDemo = 'slash';
        state.mascotYieldMode = 'peek';
        // 局部插入斜杠菜单，不重建输入框，光标与焦点保持不动
        swapPopovers();
        swapOverlay();
      }
    });

    document.addEventListener('keyup', (evt) => {
      const target = evt.target;
      if (target && target.getAttribute && target.getAttribute('data-testid') === 'sidebar-search-input') {
        if (evt.key === 'Escape') {
          if (state.sidebarSearchQuery) {
            state.sidebarSearchQuery = '';
            patchSidebarSessions(true);
          }
          setSidebarSearchOpen(false, false);
          target.blur();
        }
        return;
      }
      if (!target || !target.classList || !target.classList.contains('ag-v2-composer-input')) return;
      if (evt.key === 'Escape' && state.overlayDemo === 'slash') {
        state.overlayDemo = null;
        state.mascotYieldMode = 'none';
        swapOverlay();
      }
    });

    document.addEventListener('click', (evt) => {
      const viewBtn = evt.target.closest('[data-wb-view]');
      if (viewBtn) {
        state.viewMode = viewBtn.getAttribute('data-wb-view');
        if (state.viewMode === 'matrix' || state.viewMode === 'quad') {
          state.openPopover = null;
          state.overlayDemo = null;
        }
        withViewTransition(renderWorkbench);
        return;
      }

      const sceneBtn = evt.target.closest('[data-wb-scene]');
      if (sceneBtn) {
        const nextScene = sceneBtn.getAttribute('data-wb-scene');
        state.scene = nextScene;
        if (state.viewMode === 'matrix') state.viewMode = 'single';
        state.overlayDemo = null;
        state.mascotYieldMode = 'none';
        if (nextScene === 'effort' && state.viewMode !== 'quad') state.openPopover = 'effort';
        else if (nextScene === 'dashboard' && state.viewMode !== 'quad') state.openPopover = 'dashboard';
        else state.openPopover = null;
        withViewTransition(renderWorkbench);
        return;
      }

      const presetBtn = evt.target.closest('[data-wb-preset]');
      if (presetBtn) {
        const pid = presetBtn.getAttribute('data-wb-preset');
        if (pid === 'obsidian-dark') {
          state.tokens.palette = 'obsidian';
          state.tokens.theme = 'dark';
        } else if (pid === 'warm-dark') {
          state.tokens.palette = 'warm';
          state.tokens.theme = 'dark';
        } else if (pid === 'daylight-crystal') {
          state.tokens.palette = 'obsidian';
          state.tokens.theme = 'light';
          state.tokens.lightPreset = 'crystal';
        } else if (pid === 'warm-alabaster') {
          state.tokens.palette = 'warm';
          state.tokens.theme = 'light';
          state.tokens.lightPreset = 'alabaster';
        }
        if (state.viewMode === 'quad') state.viewMode = 'single';
        withViewTransition(renderWorkbench);
        return;
      }

      const lightPresetBtn = evt.target.closest('[data-wb-light-preset]');
      if (lightPresetBtn) {
        const lp = lightPresetBtn.getAttribute('data-wb-light-preset') === 'alabaster' ? 'alabaster' : 'crystal';
        state.tokens.lightPreset = lp;
        state.tokens.palette = lp === 'alabaster' ? 'warm' : 'obsidian';
        if (state.viewMode === 'single' && state.tokens.theme !== 'light') {
          state.tokens.theme = 'light';
        }
        withViewTransition(renderWorkbench);
        return;
      }

      const paletteBtn = evt.target.closest('[data-wb-palette]');
      if (paletteBtn) {
        const rawPalette = paletteBtn.getAttribute('data-wb-palette');
        state.tokens.palette = rawPalette === 'warm' ? 'warm' : rawPalette === 'titanium' ? 'titanium' : 'obsidian';
        if (state.tokens.palette === 'warm') state.tokens.lightPreset = 'alabaster';
        else if (state.tokens.palette === 'obsidian') state.tokens.lightPreset = 'crystal';
        applyTokenStylesToStages();
        syncTopbarControls();
        syncInspectorControls();
        for (const ctrl of rippleControllers) ctrl.invalidate();
        for (const ctrl of convAuraControllers) ctrl.invalidate();
        return;
      }

      const motionBtn = evt.target.closest('[data-wb-motion]');
      if (motionBtn) {
        setMotionLevel(motionBtn.getAttribute('data-wb-motion'), motionBtn);
        return;
      }

      const heroDemoBtn = evt.target.closest('[data-hero-demo]');
      if (heroDemoBtn) {
        triggerHeroDemo(heroDemoBtn.getAttribute('data-hero-demo'));
        return;
      }

      const themeBtn = evt.target.closest('[data-wb-theme]');
      if (themeBtn && !themeBtn.disabled) {
        state.tokens.theme = themeBtn.getAttribute('data-wb-theme') === 'light' ? 'light' : 'dark';
        withViewTransition(renderWorkbench);
        return;
      }

      if (evt.target.closest('#wb-toggle-inspector')) {
        state.inspectorOpen = !state.inspectorOpen;
        syncTopbarControls();
        return;
      }

      const mascotBtn = evt.target.closest('[data-mascot-cmd]');
      if (mascotBtn) {
        const cmd = mascotBtn.getAttribute('data-mascot-cmd');
        if (cmd === 'pile') {
          state.mascotMiniPile = !state.mascotMiniPile;
          syncMascotsState();
          syncInspectorControls();
        } else if (cmd === 'idle') {
          clearInterval(streamTimerId);
          streamTimerId = 0;
          state.streamPhase = 'done';
          state.overlayDemo = null;
          state.mascotYieldMode = 'none';
          mascotControllers.forEach((mc) => mc.rig.triggerDemo('unstack'));
          syncRunningUiDom();
          syncMascotsState();
        } else if (cmd === 'write') {
          startStreamSimulation();
        } else {
          // 迷你蟹互动需要先召唤三蟹堆
          if ((cmd === 'crabRide' || cmd === 'crabChase') && !state.mascotMiniPile) {
            state.mascotMiniPile = true;
            syncMascotsState();
            syncInspectorControls();
          }
          mascotControllers.forEach((mc) => mc.rig.triggerDemo(cmd));
        }
        return;
      }

      const overlayBtn = evt.target.closest('[data-overlay-demo]');
      if (overlayBtn) {
        triggerOverlayDemo(overlayBtn.getAttribute('data-overlay-demo'));
        return;
      }

      const vialBtn = evt.target.closest('[data-vial-cmd]');
      if (vialBtn) {
        const cmd = vialBtn.getAttribute('data-vial-cmd');
        if (cmd === 'open') {
          state.openPopover = 'dashboard';
          if (state.viewMode === 'matrix') {
            state.viewMode = 'single';
            withViewTransition(renderWorkbench);
          } else {
            swapPopovers();
          }
        } else if (cmd === 'mode') {
          const nextMode = !state.contextVialEnabled;
          if (state.viewMode !== 'matrix' && state.openPopover !== 'dashboard') {
            state.contextVialEnabled = nextMode;
            state.openPopover = 'dashboard';
            swapPopovers();
            syncContextVialUiControls();
          } else {
            setContextVialEnabled(nextMode);
          }
        } else if (cmd === 'slosh') {
          if (!state.contextVialEnabled) setContextVialEnabled(true);
          if (state.openPopover !== 'dashboard' && state.viewMode !== 'matrix') {
            state.openPopover = 'dashboard';
            renderWorkbench();
          }
          for (const v of vialControllers) v.impulse(2.1);
        } else if (cmd === 'drop') {
          if (!state.contextVialEnabled) setContextVialEnabled(true);
          if (state.openPopover !== 'dashboard' && state.viewMode !== 'matrix') {
            state.openPopover = 'dashboard';
            renderWorkbench();
          }
          for (const v of vialControllers) v.spawnDroplet();
        } else if (cmd === 'stream') {
          state.vialStreaming = !state.vialStreaming;
          renderWorkbench();
        } else if (cmd === 'critical') {
          state.vialCritical = !state.vialCritical;
          renderWorkbench();
          for (const v of vialControllers) v.impulse(1.4);
          requestAnimationFrame(() => notifyMascots('critical', { on: state.vialCritical }));
        } else if (cmd === 'camp') {
          const cur = getActiveModel();
          state.activeModelId = cur.camp === 'claude' ? 'gemini-4-carbon' : 'claude-4.6-opus';
          if (state.viewMode !== 'matrix') state.openPopover = 'dashboard';
          renderWorkbench();
        } else if (cmd === 'fallback') {
          state.sampleSimMode =
            state.sampleSimMode === 'ok' ? 'fallback' : state.sampleSimMode === 'fallback' ? 'unreliable' : 'ok';
          if (state.viewMode !== 'matrix') state.openPopover = 'dashboard';
          renderWorkbench();
        }
        return;
      }

      // 发送键：发射回弹微动效 + 点火棱镜轻涌 + 领衔宠物举钳敬礼，搭档点头
      const sendBtn = evt.target.closest('[data-testid="send-button"]');
      if (sendBtn) {
        triggerAnimIcon(sendBtn, 'launch');
        state.convAuraPhase = 'start';
        state.convAuraPhaseAt = performance.now();
        syncConvAuraDomPhase();
        convAuraControllers.forEach((c) => c.invalidate());
        notifyMascots('send');
        return;
      }

      const actionEl = evt.target.closest('[data-action]');
      if (!actionEl) return;
      const action = actionEl.getAttribute('data-action');

      if (action === 'stop-stream') {
        stopStreamSimulation();
        return;
      }

      if (action === 'toggle-sidebar') {
        setSidebarCollapsed(!state.sidebarCollapsed);
      } else if (action === 'toggle-sidebar-search') {
        const nextOpen = !state.sidebarSearchOpen;
        if (!nextOpen && state.sidebarSearchQuery) {
          state.sidebarSearchQuery = '';
          patchSidebarSessions(true);
        }
        setSidebarSearchOpen(nextOpen, nextOpen);
      } else if (action === 'clear-sidebar-search') {
        state.sidebarSearchQuery = '';
        patchSidebarSessions(true);
        setSidebarSearchOpen(false, false);
      } else if (action === 'toggle-sidebar-group') {
        const grp = actionEl.getAttribute('data-group');
        if (grp) {
          const nextCollapsed = !state.sidebarCollapsedGroups[grp];
          state.sidebarCollapsedGroups[grp] = nextCollapsed;
          document.querySelectorAll(`[data-sidebar-group="${grp}"]`).forEach((gEl) => {
            gEl.setAttribute('data-group-collapsed', String(nextCollapsed));
            const head = gEl.querySelector('.ag-v2-sidebar-group-head');
            if (head) head.setAttribute('aria-expanded', String(!nextCollapsed));
          });
        }
      } else if (action === 'cycle-workspace') {
        const workspaces = ['antigravity', 'agy-claude-style', 'obsidian-v3.5'];
        const nextIdx = (workspaces.indexOf(state.workspaceName) + 1) % workspaces.length;
        state.workspaceName = workspaces[nextIdx];
        document.querySelectorAll('[data-workspace-name="true"]').forEach((el) => {
          el.textContent = state.workspaceName;
        });
        triggerAnimIcon(actionEl, 'open');
      } else if (action === 'session-more') {
        evt.stopPropagation();
      } else if (action === 'pick-session') {
        const sc = actionEl.getAttribute('data-scene') || 'studio';
        const prevRow = document.querySelector('[data-testid="conversation-row-sidebar"][data-active="true"]');
        const prevRail = document.querySelector('.ag-v2-rail-btn[data-active="true"]');
        const prevRowRect = prevRow ? prevRow.getBoundingClientRect() : null;
        const prevRailRect = prevRail ? prevRail.getBoundingClientRect() : null;
        state.scene = sc;
        state.overlayDemo = null;
        state.mascotYieldMode = 'none';
        state.openPopover = sc === 'effort' ? 'effort' : sc === 'dashboard' ? 'dashboard' : null;
        renderWorkbench();
        if (prevRowRect) {
          const nextGlide = document.querySelector('[data-sidebar-row-glide="true"]');
          const nextRow = nextGlide ? nextGlide.closest('[data-testid="conversation-row-sidebar"]') : null;
          if (nextGlide && nextRow) runGlide(nextGlide, prevRowRect, nextRow.getBoundingClientRect());
        }
        if (prevRailRect) {
          const nextRailGlide = document.querySelector('[data-rail-glide="true"]');
          const nextRailBtn = nextRailGlide ? nextRailGlide.closest('.ag-v2-rail-btn') : null;
          if (nextRailGlide && nextRailBtn) runGlide(nextRailGlide, prevRailRect, nextRailBtn.getBoundingClientRect());
        }
      } else if (action === 'm3-pick-slash') {
        const idx = Number(actionEl.getAttribute('data-idx'));
        if (Number.isFinite(idx)) {
          state.m3ActiveSlashIdx = idx;
          renderWorkbench();
        }
      } else if (action === 'm3-diff-decision') {
        const dec = actionEl.getAttribute('data-decision');
        if (dec === 'accepted' || dec === 'rejected') {
          state.m3DiffStatus = dec;
          renderWorkbench();
        }
      } else if (action === 'm3-toggle-switch') {
        state.m3SwitchOn = !state.m3SwitchOn;
        renderWorkbench();
      } else if (action === 'm3-toast-type') {
        const tp = actionEl.getAttribute('data-toast-type');
        if (tp === 'info' || tp === 'success' || tp === 'warning' || tp === 'error') {
          state.m3ToastType = tp;
          renderWorkbench();
        }
      } else if (action === 'pick-range') {
        state.timeRange = actionEl.getAttribute('data-range') || '30d';
        patchTimeRange();
      } else if (action === 'cache-start') {
        triggerAnimIcon(actionEl, 'sweep');
        clearTimeout(state.cacheTimerId);
        state.cacheCleanStep = 'confirm';
        state.cacheTimerId = setTimeout(() => {
          if (state.cacheCleanStep === 'confirm') {
            state.cacheCleanStep = 'idle';
            patchCacheCleaner();
          }
        }, 4000);
        patchCacheCleaner();
      } else if (action === 'cache-confirm') {
        clearTimeout(state.cacheTimerId);
        state.cacheCleanStep = 'done';
        patchCacheCleaner();
      } else if (action === 'cache-cancel' || action === 'cache-reset') {
        clearTimeout(state.cacheTimerId);
        state.cacheCleanStep = 'idle';
        patchCacheCleaner();
      } else if (action === 'toggle-thinking') {
        state.thinkingOpen = !state.thinkingOpen;
        if (!patchChatStreamDom()) renderWorkbench();
      } else if (action === 'toggle-user-bubble') {
        state.userBubbleExpanded = !state.userBubbleExpanded;
        patchUserBubble();
      } else if (action === 'replay-stream') {
        startStreamSimulation();
      } else if (action === 'toggle-tool-error') {
        state.hasToolError = !state.hasToolError;
        if (state.hasToolError) state.thinkingOpen = true;
        if (!patchChatStreamDom()) renderWorkbench();
      } else if (action === 'toggle-effort-pop') {
        const hadOverlay = Boolean(state.overlayDemo);
        state.overlayDemo = null;
        state.mascotYieldMode = 'none';
        state.openPopover = state.openPopover === 'effort' ? null : 'effort';
        swapPopovers();
        if (hadOverlay) swapOverlay();
      } else if (action === 'toggle-orchestrator') {
        const hadOverlay = Boolean(state.overlayDemo);
        state.overlayDemo = null;
        state.mascotYieldMode = 'none';
        state.activeModelId = state.activeModelId === 'orchestrator' ? 'gemini-4-carbon' : 'orchestrator';
        if (state.openPopover === 'effort' && getFloatingComposerWraps().length) {
          // 浮窗已打开：原地交叉淡化滑轨 ⇄ 水晶条，并触发光学唤醒
          syncComposerTriggerDom();
          sliderControllers.forEach((sl) => sl.notify());
        } else {
          state.openPopover = 'effort';
          swapPopovers();
          syncComposerTriggerDom();
          if (state.activeModelId === 'orchestrator') {
            crystalControllers.forEach((c) => typeof c.wake === 'function' && c.wake());
          }
        }
        if (hadOverlay) swapOverlay();
      } else if (action === 'toggle-dash-pop') {
        const hadOverlay = Boolean(state.overlayDemo);
        state.overlayDemo = null;
        state.mascotYieldMode = 'none';
        state.openPopover = state.openPopover === 'dashboard' ? null : 'dashboard';
        swapPopovers();
        if (hadOverlay) swapOverlay();
      } else if (action === 'toggle-takeover') {
        triggerOverlayDemo('takeover');
      } else if (action === 'reroll-takeover') {
        state.mascotYieldMode = state.mascotYieldMode === 'leap' ? 'peek' : 'leap';
        swapOverlay();
      } else if (action === 'close-overlay') {
        state.overlayDemo = null;
        state.mascotYieldMode = 'none';
        swapOverlay();
      } else if (action === 'pick-model') {
        state.activeModelId = actionEl.getAttribute('data-model-id');
        // In-place update without destroying the open menu or resetting slider spring
        syncComposerTriggerDom();
        sliderControllers.forEach((sl) => sl.notify());
      } else if (action === 'set-telemetry-mod') {
        state.telemetryModule = actionEl.getAttribute('data-mod-val') || 'auto';
        renderWorkbench();
      } else if (action === 'set-slider-mod') {
        state.effortSliderModule = actionEl.getAttribute('data-mod-val') || 'auto';
        renderWorkbench();
      } else if (action === 'toggle-serif') {
        state.tokens.editorialSerif = !state.tokens.editorialSerif;
        applyTokenStylesToStages();
        syncInspectorControls();
        actionEl.setAttribute('data-on', String(state.tokens.editorialSerif));
      } else if (action === 'toggle-ripple') {
        state.rippleEnabled = !state.rippleEnabled;
        renderWorkbench();
      } else if (action === 'toggle-prism') {
        state.tokens.prismStrength = state.tokens.prismStrength > 0 ? 0 : 1;
        applyTokenStylesToStages();
        syncInspectorControls();
        actionEl.setAttribute('data-on', String(state.tokens.prismStrength > 0));
      } else if (action === 'toggle-mini-pile') {
        state.mascotMiniPile = !state.mascotMiniPile;
        syncMascotsState();
        syncInspectorControls();
        actionEl.setAttribute('data-on', String(state.mascotMiniPile));
      } else if (action === 'toggle-context-vial') {
        setContextVialEnabled(!state.contextVialEnabled);
      } else if (action === 'copy-code') {
        const codeCard = actionEl.closest('.ag-v2-code-card');
        const codeText = codeCard ? codeCard.querySelector('pre')?.textContent || '' : '';
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(codeText).catch(() => {});
        }
        // line-md 动态描边打勾形变反馈：复制图标 → 对勾生长，1.6s 后自动复原
        triggerAnimIcon(actionEl, 'check', { revertAfterMs: 1600 });
        const label = actionEl.querySelector('[data-copy-label]');
        actionEl.setAttribute('data-copied', 'true');
        if (label) label.textContent = '已复制';
        clearTimeout(actionEl.__copyTimer);
        actionEl.__copyTimer = setTimeout(() => {
          actionEl.removeAttribute('data-copied');
          if (label) label.textContent = '复制';
        }, 1600);
      }
    });

    // Live Inspector sliders
    const bindRange = (id, key, parser) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => {
        state.tokens[key] = parser(el.value);
        applyTokenStylesToStages();
        syncInspectorControls();
        if (key === 'prismStrength') {
          rippleControllers.forEach((ctrl) => ctrl.invalidate());
          convAuraControllers.forEach((ctrl) => ctrl.invalidate());
        }
      });
    };
    bindRange('ctrl-radius', 'radiusBase', (v) => parseInt(v, 10));
    bindRange('ctrl-prism', 'prismStrength', (v) => parseFloat(v));
    bindRange('ctrl-specular', 'specularAlpha', (v) => parseFloat(v));
    bindRange('ctrl-border', 'borderAlpha', (v) => parseFloat(v));
    bindRange('ctrl-blur', 'glassBlur', (v) => parseInt(v, 10));
    bindRange('ctrl-lh', 'proseLineHeight', (v) => parseFloat(v));
    bindRange('ctrl-grain', 'grainAlpha', (v) => parseFloat(v));

    const serifBtn = document.getElementById('ctrl-serif');
    if (serifBtn) {
      serifBtn.addEventListener('click', () => {
        state.tokens.editorialSerif = !state.tokens.editorialSerif;
        applyTokenStylesToStages();
        syncInspectorControls();
      });
    }

    const showToast = (msg) => {
      const el = document.getElementById('wb-toast');
      if (!el) return;
      el.textContent = msg;
      setTimeout(() => {
        if (el.textContent === msg) el.textContent = '';
      }, 2400);
    };

    const saveBtn = document.getElementById('wb-save-tokens');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        try {
          const res = await fetch('/api/tokens', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(state.tokens),
          });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          showToast('已保存预设到 design-tokens.json ✓');
        } catch (err) {
          showToast('保存失败: ' + (err && err.message ? err.message : 'unknown'));
        }
      });
    }

    const copyBtn = document.getElementById('wb-copy-css');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        const t = state.tokens;
        const cssSnippet = [
          `/* AGY Obsidian Prism Preset (${t.palette} / ${t.theme}) */`,
          `--ag-v2-radius: ${t.radiusBase}px;`,
          `--ag-prism-strength: ${t.prismStrength ?? 1};`,
          `--ag-v2-specular: ${t.specularAlpha};`,
          `--ag-v2-border-alpha: ${t.borderAlpha};`,
          `--ag-v2-glass-blur: ${t.glassBlur}px;`,
          `--ag-v2-prose-lh: ${t.proseLineHeight};`,
          `--ag-v2-grain-alpha: ${t.grainAlpha};`,
          `/* editorialSerif: ${t.editorialSerif} */`,
        ].join('\n');
        try {
          await navigator.clipboard.writeText(cssSnippet);
          showToast('已复制 CSS 变量块 ✓');
        } catch {
          showToast('已生成 CSS 变量（剪贴板受限）');
        }
      });
    }

    const resetBtn = document.getElementById('wb-reset-tokens');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        state.tokens = { ...DEFAULT_TOKENS };
        renderWorkbench();
        showToast('已恢复出厂默认参数');
      });
    }
  }

  function applyUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view');
    const scene = params.get('scene');
    const palette = params.get('palette');
    const theme = params.get('theme');
    const lightPreset = params.get('lightPreset') || params.get('preset');
    if (view === 'single' || view === 'split' || view === 'quad' || view === 'matrix') state.viewMode = view;
    if (scene === 'studio' || scene === 'chat' || scene === 'effort' || scene === 'dashboard' || scene === 'settings' || scene === 'm3lab') {
      state.scene = scene;
      if (scene === 'effort' && state.viewMode !== 'quad') state.openPopover = 'effort';
      if (scene === 'dashboard' && state.viewMode !== 'quad') state.openPopover = 'dashboard';
    }
    if (palette === 'obsidian' || palette === 'titanium' || palette === 'warm') state.tokens.palette = palette;
    if (theme === 'dark' || theme === 'light') state.tokens.theme = theme;
    if (lightPreset === 'crystal' || lightPreset === 'alabaster') state.tokens.lightPreset = lightPreset;
    if (params.get('stream') === '1' || params.get('streaming') === '1') {
      state.streamPhase = 'streaming';
      state.convAuraPhase = 'running';
      state.thinkingOpen = true;
      state.streamWordProgress = 2;
    }
    const auraParam = params.get('aura');
    if (auraParam === 'idle' || auraParam === 'start' || auraParam === 'running' || auraParam === 'complete') {
      state.convAuraPhase = auraParam;
      state.convAuraPhaseAt = performance.now();
    }
    const motionParam = params.get('motion');
    if (motionParam === 'off' || motionParam === 'subtle' || motionParam === 'standard' || motionParam === 'ultra') {
      state.motionLevel = motionParam;
    }
  }

  function exposeTestHooks() {
    globalThis.__wbTestApi = {
      getMotionLevel() {
        return state.motionLevel;
      },
      setMotionLevel(lv) {
        setMotionLevel(lv);
      },
      getLightPreset() {
        return state.tokens.lightPreset || 'crystal';
      },
      setLightPreset(lp) {
        state.tokens.lightPreset = lp === 'alabaster' ? 'alabaster' : 'crystal';
        state.tokens.theme = 'light';
        state.tokens.palette = state.tokens.lightPreset === 'alabaster' ? 'warm' : 'obsidian';
        renderWorkbench();
      },
      setViewMode(vm) {
        if (vm === 'single' || vm === 'split' || vm === 'quad' || vm === 'matrix') {
          state.viewMode = vm;
          renderWorkbench();
        }
      },
      getPerfSleepState() {
        const snap = updatePerfSleepIndicators(performance.now());
        return {
          masterSleeping,
          masterFrameTicks,
          ...snap,
        };
      },
      triggerHeroDemo(kind) {
        triggerHeroDemo(kind);
        wakeMasterLoop();
      },
      getRippleState() {
        return rippleControllers.map((c) => c.getWaveState());
      },
      getConvAuraState() {
        return {
          phase: state.convAuraPhase,
          controllers: convAuraControllers.length,
          sleeping: convAuraControllers.every((c) => (typeof c.isSleeping === 'function' ? c.isSleeping() : true)),
        };
      },
      setConvAuraPhase(phase) {
        if (phase === 'idle' || phase === 'start' || phase === 'running' || phase === 'complete') {
          state.convAuraPhase = phase;
          state.convAuraPhaseAt = performance.now();
          syncConvAuraDomPhase();
          const now = performance.now();
          convAuraControllers.forEach((c) => c.step(now, true));
          wakeMasterLoop();
        }
      },
      getMascotSnapshot() {
        return mascotControllers.map((m) => m.rig.getLayoutSnapshot());
      },
      triggerMascotDemo(cmd) {
        mascotControllers.forEach((m) => m.rig.triggerDemo(cmd));
      },
      simulateInputChar(text) {
        mascotControllers.forEach((m) => m.rig.onUserType(text));
      },
      pokeMascot(id = 'cat') {
        mascotControllers.forEach((m) => {
          if (typeof m.rig.poke === 'function') m.rig.poke(id);
        });
      },
      getVialState() {
        return vialControllers.map((v) => v.getDebugState());
      },
      getCrystalState() {
        return crystalControllers.map((c) => c.getDebugState());
      },
      spawnVialDroplet() {
        vialControllers.forEach((v) => v.spawnDroplet());
      },
      sloshVial(strength = 2.0) {
        vialControllers.forEach((v) => v.impulse(strength));
      },
      setMiniPile(on) {
        state.mascotMiniPile = Boolean(on);
        syncMascotsState();
        syncInspectorControls();
      },
      setContextVial(on) {
        setContextVialEnabled(Boolean(on));
      },
      getContextVialEnabled() {
        return Boolean(state.contextVialEnabled);
      },
      setHoveredSlice(idx) {
        state.hoveredSlice = idx;
        applyHoveredSliceDom();
      },
      toggleSidebar(collapsed) {
        setSidebarCollapsed(typeof collapsed === 'boolean' ? collapsed : !state.sidebarCollapsed);
      },
      setSidebarSearchOpen(open) {
        setSidebarSearchOpen(Boolean(open), Boolean(open));
      },
      getSidebarState() {
        return {
          collapsed: Boolean(state.sidebarCollapsed),
          searchOpen: Boolean(state.sidebarSearchOpen),
          searchQuery: state.sidebarSearchQuery,
          workspace: state.workspaceName,
        };
      },
      startStream() {
        startStreamSimulation();
      },
      stopStream() {
        stopStreamSimulation();
      },
      inspectMascot(opts) {
        return mascotControllers.map((m) => (typeof m.rig.inspectPose === 'function' ? m.rig.inspectPose(opts) : null));
      },
      stepMascotTick(delta = 1) {
        return mascotControllers.map((m) => (typeof m.rig.stepTick === 'function' ? m.rig.stepTick(delta) : 0));
      },
    };
  }

  function bindMascotInspectorControls() {
    const poseSel = document.getElementById('wb-inspect-pose');
    const toggleBtn = document.getElementById('btn-inspect-toggle');
    const prevBtn = document.getElementById('btn-inspect-prev');
    const nextBtn = document.getElementById('btn-inspect-next');
    const mirrorBtn = document.getElementById('btn-inspect-mirror');
    const rulerBtn = document.getElementById('btn-inspect-ruler');
    const blurBtn = document.getElementById('btn-sim-win-blur');
    const habBtn = document.getElementById('btn-habitat-cycle');
    const sqwInput = document.getElementById('ctrl-inspect-sqw');
    const sqhInput = document.getElementById('ctrl-inspect-sqh');
    const tickVal = document.getElementById('val-inspect-tick');
    const sqwVal = document.getElementById('val-inspect-sqw');
    const sqhVal = document.getElementById('val-inspect-sqh');
    if (!poseSel || !toggleBtn) return;

    const inspect = { active: false, pose: 'idle', tick: 0, mirror: false, ruler: false, sqW: 0, sqH: 0, blur: false };
    const fillPoses = () => {
      const rig = mascotControllers[0]?.rig;
      const list = rig && typeof rig.listPoses === 'function' ? rig.listPoses() : ['idle'];
      if (poseSel.options.length === list.length) return;
      poseSel.innerHTML = '';
      for (const p of list) {
        const opt = document.createElement('option');
        opt.value = p;
        opt.textContent = p;
        poseSel.appendChild(opt);
      }
      poseSel.value = inspect.pose;
    };
    const apply = () => {
      fillPoses();
      if (tickVal) tickVal.textContent = `Tick ${inspect.tick}`;
      if (sqwVal) sqwVal.textContent = String(inspect.sqW);
      if (sqhVal) sqhVal.textContent = String(inspect.sqH);
      toggleBtn.textContent = `锁定检视: ${inspect.active ? '开' : '关'}`;
      if (mirrorBtn) mirrorBtn.textContent = `Mirror: ${inspect.mirror ? '开' : '关'}`;
      if (rulerBtn) rulerBtn.textContent = `y=9 标尺: ${inspect.ruler ? '开' : '关'}`;
      if (blurBtn) blurBtn.textContent = `失焦 0fps: ${inspect.blur ? '开' : '关'}`;
      mascotControllers.forEach((m) => {
        if (typeof m.rig.inspectPose === 'function') {
          m.rig.inspectPose(inspect.active ? { ...inspect } : { active: false });
        }
      });
    };

    poseSel.addEventListener('change', () => {
      inspect.pose = poseSel.value;
      inspect.active = true;
      apply();
    });
    toggleBtn.addEventListener('click', () => {
      inspect.active = !inspect.active;
      apply();
    });
    prevBtn?.addEventListener('click', () => {
      inspect.active = true;
      inspect.tick = Math.max(0, inspect.tick - 1);
      apply();
    });
    nextBtn?.addEventListener('click', () => {
      inspect.active = true;
      inspect.tick += 1;
      apply();
    });
    mirrorBtn?.addEventListener('click', () => {
      inspect.active = true;
      inspect.mirror = !inspect.mirror;
      apply();
    });
    rulerBtn?.addEventListener('click', () => {
      inspect.active = true;
      inspect.ruler = !inspect.ruler;
      apply();
    });
    blurBtn?.addEventListener('click', () => {
      inspect.blur = !inspect.blur;
      if (inspect.blur) document.documentElement.setAttribute('data-ag-cs-win-blur', '1');
      else document.documentElement.removeAttribute('data-ag-cs-win-blur');
      mascotControllers.forEach((m) => m.rig.notify('host-sleep', { sleep: inspect.blur }));
      apply();
    });
    const habModes = [
      ['auto', '自动'],
      ['cactus', '日间仙人掌'],
      ['lamp', '深夜小路灯'],
      ['hourglass', '守望沙漏'],
    ];
    let habIdx = 0;
    habBtn?.addEventListener('click', () => {
      habIdx = (habIdx + 1) % habModes.length;
      const [mode, label] = habModes[habIdx];
      habBtn.textContent = `栖息地: ${label}`;
      mascotControllers.forEach((m) => m.rig.setHabitatPreview?.(mode));
    });
    sqwInput?.addEventListener('input', () => {
      inspect.active = true;
      inspect.sqW = Number(sqwInput.value) || 0;
      apply();
    });
    sqhInput?.addEventListener('input', () => {
      inspect.active = true;
      inspect.sqH = Number(sqhInput.value) || 0;
      apply();
    });
    fillPoses();
  }

  async function init() {
    try {
      const res = await fetch('/api/tokens', { cache: 'no-store' });
      if (res.ok) {
        const loaded = await res.json();
        state.tokens = { ...DEFAULT_TOKENS, ...loaded };
      }
    } catch {}

    hydrateShellIcons();
    syncMotionSpringTokens();
    if (globalThis.__agMotionEngine && typeof globalThis.__agMotionEngine.bindMicroInteractions === 'function') {
      globalThis.__agMotionEngine.bindMicroInteractions(document);
    }

    applyUrlParams();
    exposeTestHooks();
    bindGlobalEvents();
    bindHeatTooltip();
    bindStageTooltips();
    renderWorkbench();
    bindMascotInspectorControls();

    try {
      const es = new EventSource('/api/events');
      es.addEventListener('reload', () => {
        window.location.reload();
      });
    } catch {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();

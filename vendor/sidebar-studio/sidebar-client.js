// Obsidian Prism v1.0.2 — Sidebar Studio v2.1 Channel 3 客户端（Code 原生无损保留 + Chat 双极工作台）
// - 核心架构：Code 模式 100% 保留原生 Antigravity 侧边栏（多工作区分组、运行态四点动画、Swarm/Coordinator 与子代理标识零改动）
// - 持久顶栏：仅在原生侧栏顶部嵌入持久化 [ Code | Chat ] 失重弹簧切换胶囊；切至 Chat 模式平滑切入 Knowledge+Spark 侧栏与 M3 Expressive 首页
// - 安全红线：100% DOM API 构建、零全局偏好写入、零 Emoji、零跨模式迁移、TanStack Router 对象签名路由
// - 性能红线：严守 7 条性能规范，侧栏仅使用 contain: style，隐藏态 0fps 休眠，destroy() 100% 原子复原

(function (root) {
  'use strict';

  const W = root || (typeof window !== 'undefined' ? window : globalThis);
  if (!W || typeof document === 'undefined') return;

  const SIDEBAR_STUDIO_CLIENT_V2 = '2.4.0';
  const STYLE_ID = 'ag-prism-sidebar-studio-css';
  const ROOT_ATTR = 'data-ag-prism-sidebar-owned';
  const NO_TR_ATTRS = [['translate', 'no'], ['data-no-translate', 'true'], ['data-ag-localization-skip', 'true'], ['data-agy-no-translate', 'true'], ['data-antigravity-zh-skip', '1']];
  function markOwnedRoot(n) {
    if (n && n.setAttribute) { n.setAttribute(ROOT_ATTR, '1'); for (const [k, v] of NO_TR_ATTRS) n.setAttribute(k, v); }
    return n;
  }
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // 官方原版彩色 Brand SVG（DOMParser 挂载并重写唯一 ID 前缀，纯安全 DOM 注入）
  const OFFICIAL_GEMINI_COLOR_SVG =
    '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="#3186FF"/><path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="url(#gem-brand-0)"/><path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="url(#gem-brand-1)"/><path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="url(#gem-brand-2)"/><defs><linearGradient gradientUnits="userSpaceOnUse" id="gem-brand-0" x1="7" x2="11" y1="15.5" y2="12"><stop stop-color="#08B962"/><stop offset="1" stop-color="#08B962" stop-opacity="0"/></linearGradient><linearGradient gradientUnits="userSpaceOnUse" id="gem-brand-1" x1="8" x2="11.5" y1="5.5" y2="11"><stop stop-color="#F94543"/><stop offset="1" stop-color="#F94543" stop-opacity="0"/></linearGradient><linearGradient gradientUnits="userSpaceOnUse" id="gem-brand-2" x1="3.5" x2="17.5" y1="13.5" y2="12"><stop stop-color="#FABC12"/><stop offset=".46" stop-color="#FABC12" stop-opacity="0"/></linearGradient></defs></svg>';

  const OFFICIAL_ANTIGRAVITY_COLOR_SVG =
    '<svg width="100%" height="100%" viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M85.9734 89.3438C91.2234 93.2812 99.0984 90.6562 91.8796 83.4375C70.2234 62.4375 74.8171 4.6875 47.9109 4.6875C21.0046 4.6875 25.5984 62.4375 3.94213 83.4375C-3.93287 91.3125 4.59838 93.2812 9.84838 89.3438C30.1921 75.5625 28.8796 51.2812 47.9109 51.2812C66.9421 51.2812 65.6296 75.5625 85.9734 89.3438Z" fill="#3186FF"/><path d="M85.9734 89.3438C91.2234 93.2812 99.0984 90.6562 91.8796 83.4375C70.2234 62.4375 74.8171 4.6875 47.9109 4.6875C21.0046 4.6875 25.5984 62.4375 3.94213 83.4375C-3.93287 91.3125 4.59838 93.2812 9.84838 89.3438C30.1921 75.5625 28.8796 51.2812 47.9109 51.2812C66.9421 51.2812 65.6296 75.5625 85.9734 89.3438Z" fill="url(#agy-brand-g0)"/><path d="M85.9734 89.3438C91.2234 93.2812 99.0984 90.6562 91.8796 83.4375C70.2234 62.4375 74.8171 4.6875 47.9109 4.6875C21.0046 4.6875 25.5984 62.4375 3.94213 83.4375C-3.93287 91.3125 4.59838 93.2812 9.84838 89.3438C30.1921 75.5625 28.8796 51.2812 47.9109 51.2812C66.9421 51.2812 65.6296 75.5625 85.9734 89.3438Z" fill="url(#agy-brand-g1)"/><path d="M85.9734 89.3438C91.2234 93.2812 99.0984 90.6562 91.8796 83.4375C70.2234 62.4375 74.8171 4.6875 47.9109 4.6875C21.0046 4.6875 25.5984 62.4375 3.94213 83.4375C-3.93287 91.3125 4.59838 93.2812 9.84838 89.3438C30.1921 75.5625 28.8796 51.2812 47.9109 51.2812C66.9421 51.2812 65.6296 75.5625 85.9734 89.3438Z" fill="url(#agy-brand-g2)"/><defs><radialGradient id="agy-brand-g0" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(20 34) rotate(58) scale(48 44)"><stop stop-color="#00B95C"/><stop offset="0.62" stop-color="#00B95C" stop-opacity="0.45"/><stop offset="1" stop-color="#00B95C" stop-opacity="0"/></radialGradient><radialGradient id="agy-brand-g1" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(46 14) rotate(82) scale(42 46)"><stop stop-color="#FFE032"/><stop offset="0.58" stop-color="#FBBC04" stop-opacity="0.55"/><stop offset="1" stop-color="#FBBC04" stop-opacity="0"/></radialGradient><radialGradient id="agy-brand-g2" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(76 22) rotate(125) scale(46 42)"><stop stop-color="#FC413D"/><stop offset="0.6" stop-color="#FC413D" stop-opacity="0.45"/><stop offset="1" stop-color="#FC413D" stop-opacity="0"/></radialGradient></defs></svg>';

  const MONO_ICONS = {
    code: ['M8 6L2 12L8 18', 'M16 6L22 12L16 18', 'M13.5 4.5L10.5 19.5'],
    chat: ['M21 11.5A8.38 8.38 0 0 1 12.5 20A8.5 8.5 0 0 1 8 18.7L3 20L4.3 15.2A8.38 8.38 0 0 1 3 11.5A8.5 8.5 0 0 1 11.5 3H12.5A8.5 8.5 0 0 1 21 11.5Z'],
    search: ['M11 19A8 8 0 1 0 11 3A8 8 0 0 0 11 19Z', 'M21 21L16.65 16.65'],
    plus: ['M12 5V19', 'M5 12H19'],
    folder: ['M3 7A2 2 0 0 1 5 5H9.5L11.5 7.5H19A2 2 0 0 1 21 9.5V17A2 2 0 0 1 19 19H5A2 2 0 0 1 3 17Z'],
    chevron: ['M9 6L15 12L9 18'],
    chevronDown: ['M6 9L12 15L18 9'],
    shield: ['M12 3L19 6V12C19 16.5 16 19.8 12 21C8 19.8 5 16.5 5 12V6Z'],
    info: ['M12 21A9 9 0 1 0 12 3A9 9 0 0 0 12 21Z', 'M12 16V12', 'M12 8H12.01'],
    check: ['M5 13L9.5 17.5L19 7.5'],
    arrowUp: ['M12 19V5', 'M6 11L12 5L18 11'],
    book: ['M4 19.5A2.5 2.5 0 0 1 6.5 17H20', 'M6.5 2H20V22H6.5A2.5 2.5 0 0 1 4 19.5V4.5A2.5 2.5 0 0 1 6.5 2Z'],
    box: ['M21 8L12 3L3 8V16L12 21L21 16Z', 'M3 8L12 13L21 8', 'M12 13V21'],
    more: ['M5 12H5.01', 'M12 12H12.01', 'M19 12H19.01'],
    pin: ['M12 17V22', 'M5 17H19V15L17 13V7L19 5V4H5V5L7 7V13L5 15Z'],
    edit: ['M12 20H21', 'M16.5 3.5A2.12 2.12 0 0 1 19.5 6.5L7 19L3 20L4 16Z'],
    archive: ['M3 6H21V9H3Z', 'M5 9V19A2 2 0 0 0 7 21H17A2 2 0 0 0 19 19V9', 'M10 13H14'],
    restore: ['M3 12A9 9 0 1 0 6 5.3L3 8', 'M3 3V8H8'],
    trash: ['M3 6H21', 'M8 6V4H16V6', 'M6 6L7 20A2 2 0 0 0 9 21H15A2 2 0 0 0 17 20L18 6'],
    stop: ['M6 6H18V18H6Z'],
    download: ['M12 3V15', 'M7 10L12 15L17 10', 'M5 21H19'],
    copy: ['M9 9H20V20H9Z', 'M5 15H4A2 2 0 0 1 2 13V4A2 2 0 0 1 4 2H13A2 2 0 0 1 15 4V5'],
    external: ['M14 3H21V10', 'M10 14L21 3', 'M21 14V19A2 2 0 0 1 19 21H5A2 2 0 0 1 3 19V5A2 2 0 0 1 5 3H10'],
    x: ['M18 6L6 18', 'M6 6L18 18'],
    folderMove: ['M3 7A2 2 0 0 1 5 5H9.5L11.5 7.5H19A2 2 0 0 1 21 9.5V17A2 2 0 0 1 19 19H5A2 2 0 0 1 3 17Z', 'M12 11L15 14L12 17', 'M9 14H15'],
    sliders: ['M4 7H20', 'M4 17H20', 'M9 4V10', 'M15 14V20'],
    sparkle: ['M12 3L14.2 9.8L21 12L14.2 14.2L12 21L9.8 14.2L3 12L9.8 9.8Z'],
    checklist: ['M9 6H20', 'M9 12H20', 'M9 18H20', 'M4 6L5.5 7.5L7.5 4.5', 'M4 12L5.5 13.5L7.5 10.5', 'M4 18L5.5 19.5L7.5 16.5'],
    file: ['M14 2H6A2 2 0 0 0 4 4V20A2 2 0 0 0 6 22H18A2 2 0 0 0 20 20V8Z', 'M14 2V8H20'],
    paperclip: ['M21.44 11.05L12.25 20.24A6 6 0 0 1 3.76 11.75L12.95 2.56A4 4 0 0 1 18.61 8.22L9.41 17.41A2 2 0 0 1 6.59 14.59L15.07 6.1'],
    upload: ['M21 15V19A2 2 0 0 1 19 21H5A2 2 0 0 1 3 19V15', 'M17 8L12 3L7 8', 'M12 3V15'],
  };

  const DEFAULT_CHAT_POLICY = {
    pure: {
      webSearch: true,
      imageAndFiles: true,
      keepUserRules: true,
      zeroTools: false,
      allowedPlugins: [],
      allowedMcps: [],
    },
    spark: {
      fileAccess: true,
      schedule: true,
      webSearch: true,
      imageAndFiles: true,
      keepUserRules: true,
      sandbox: true,
      allowedPlugins: [],
      allowedMcps: [],
    },
    showTelemetryAboveComposer: true,
    showStarterChips: true,
  };

  const CHAT_STARTER_CHIPS = {
    pure: [
      { label: '润色文字', prompt: '请帮我把下面这段文字润色得更自然清晰：\n' },
      { label: '联网查资料', prompt: '请帮我联网检索一下最新资料并总结要点：' },
      { label: '讲懂概念', prompt: '请用通俗易懂的日常比喻，帮我讲清楚：' },
      { label: '生成配图', prompt: '请帮我生成一张配图，画面内容与风格要求是：' },
    ],
    spark: [
      { label: '整理工作文件夹', prompt: '请先查看当前工作文件夹里的文件，帮我整理一份清晰目录清单和归类建议。' },
      { label: '汇总文档要点', prompt: '请读取当前文件夹中的主要文档，帮我提炼核心结论与待办清单。' },
      { label: '安排日程提醒', prompt: '请帮我安排一个日程或定时提醒：' },
      { label: '起草结构化文档', prompt: '请在当前工作文件夹里帮我起草一份文档，主题是：' },
    ],
  };

  const CHAT_PULSE_MINIMAL_STYLE_ID = 'ag-prism-chat-pulse-minimal-css';
  const CHAT_PULSE_MINIMAL_SHADOW_CSS = [
    ':host([data-ag-chat-minimal="1"]){z-index:80!important;opacity:1!important}',
    ':host([data-ag-chat-minimal="1"]) .bar{gap:2px!important;opacity:.78;transition:opacity 160ms ease}',
    ':host([data-ag-chat-minimal="1"]) .bar:hover,:host([data-ag-chat-minimal="1"]) .bar:focus-within{opacity:1}',
    ':host([data-ag-chat-minimal="1"]) .sub-badge,:host([data-ag-chat-minimal="1"]) .rounds,:host([data-ag-chat-minimal="1"]) .cache-total{display:none!important}',
    ':host([data-ag-chat-minimal="1"]) :is(.card,#context-card,#context-card[data-ag-pulse-vial-mode])[hidden]{display:none!important;opacity:0!important;visibility:hidden!important;pointer-events:none!important;transition:none!important;animation:none!important}',
    ':host([data-ag-chat-minimal="1"]) :is(.card,#context-card,#context-card[data-ag-pulse-vial-mode]):not([hidden]){width:248px!important;min-width:240px!important;max-width:264px!important;padding:12px 14px!important;left:50%!important;right:auto!important;transform:translateX(-50%)!important;border-radius:16px!important;background:var(--ag-chat-pulse-bg,#1d1e22)!important;background-color:var(--ag-chat-pulse-bg,#1d1e22)!important;background-image:none!important;color:var(--ag-chat-pulse-fg,#e3e3e3)!important;border:1px solid var(--ag-chat-pulse-bd,rgba(255,255,255,.12))!important;box-shadow:0 16px 40px rgba(0,0,0,.58),0 2px 10px rgba(0,0,0,.32)!important;opacity:1!important;filter:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;animation:none!important;z-index:9999!important}',
    ':host([data-ag-chat-minimal="1"]) #context-card[data-ag-pulse-vial-mode]:not([hidden]),:host([data-ag-chat-minimal="1"]) .context-card:not([hidden]){display:flex!important;flex-direction:column!important;grid-template-columns:1fr!important;gap:7px!important}',
    ':host([data-ag-chat-minimal="1"]) .pv-rail,:host([data-ag-chat-minimal="1"]) .pv-acts,:host([data-ag-chat-minimal="1"]) .pv-qtabs,:host([data-ag-chat-minimal="1"]) [data-ag-pulse-qtask],:host([data-ag-chat-minimal="1"]) #context-note{display:none!important}',
    ':host([data-ag-chat-minimal="1"]) .heading{font-size:11.5px!important;font-weight:600!important;margin-bottom:0!important;opacity:.88}',
    ':host([data-ag-chat-minimal="1"]) #context-summary{font-size:13px!important;font-weight:600!important}',
    ':host([data-ag-chat-minimal="1"]) #context-tokens{font-size:11px!important;opacity:.68;margin:0!important}',
    ':host([data-ag-chat-minimal="1"]) .pv-qt{margin-top:4px!important;padding-top:8px!important;border-top:1px solid var(--ag-chat-pulse-bd,rgba(255,255,255,.08))!important}',
  ].join('');

  // 可用的 5 款 Gemini 对话模型（简洁日常说明）
  const DEFAULT_GEMINI_MODELS = [
    {
      id: 'Gemini 4 Neon',
      desc: '日常主力 · 适合大多数深度思考与复杂问答',
      descEn: 'For most deep reasoning and complex questions',
      efforts: ['Low', 'Medium', 'High', 'XHigh'],
      defaultEffort: 'High',
    },
    {
      id: 'Gemini 4 Carbon',
      desc: '高难度推理 · 适合复杂分析与长文写作',
      descEn: 'For complex analysis and long-form tasks',
      efforts: ['Low', 'Medium', 'High'],
      defaultEffort: 'High',
    },
    {
      id: 'Gemini 4 Argon',
      desc: '均衡稳健 · 适合综合分析与多步整理',
      descEn: 'Balanced model for multi-step analysis',
      efforts: ['Low', 'Medium', 'High'],
      defaultEffort: 'High',
    },
    {
      id: 'Gemini 4 Hydrogen',
      desc: '快速响应 · 兼顾响应速度与回答质量',
      descEn: 'Fast and efficient for everyday tasks',
      efforts: ['Low', 'Medium', 'High', 'XHigh'],
      defaultEffort: 'High',
    },
    {
      id: 'Gemini 3.8 Flash',
      desc: '轻快高效 · 适合日常问答与资料速读',
      descEn: 'Lightweight and fast for daily Q&A and reading',
      efforts: ['Low', 'Medium', 'High'],
      defaultEffort: 'Medium',
    },
  ];

  const MODEL_DESC_BY_ID = new Map(DEFAULT_GEMINI_MODELS.map((m) => [m.id.toLowerCase(), m]));

  const CHAT_EFFORT_TIERS = [
    { id: 'Low', label: '低', fullLabel: '低 Low' },
    { id: 'Medium', label: '中', fullLabel: '中 Medium' },
    { id: 'High', label: '高', fullLabel: '高 High' },
    { id: 'XHigh', label: '极高', fullLabel: '极高 XHigh' },
  ];

  const EFFORT_RANK = { Low: 0, Medium: 1, High: 2, XHigh: 3 };

  // 5 语开源中性双层居中问候词库（绝不硬编码私密用户名，动态承接宿主登录名）
  const HERO_GREETINGS = {
    'zh-CN': {
      eyeUser: ['你好，{user}', '嗨，{user}', '欢迎回来，{user}', '{user}，很高兴见到你'],
      eyeAnon: ['你好', '欢迎回来', '随时开始'],
      heads: ['今天需要我为你做些什么？', '想从哪里开始探索？', '随时聊聊你的新想法。', '有什么我可以帮你的？'],
    },
    'zh-TW': {
      eyeUser: ['你好，{user}', '嗨，{user}', '歡迎回來，{user}'],
      eyeAnon: ['你好', '歡迎回來', '隨時開始'],
      heads: ['今天需要我為你做些什麼？', '想從哪裡開始探索？', '隨時聊聊你的新想法。'],
    },
    yue: {
      eyeUser: ['哈囉，{user}', '你好呀，{user}', '歡迎返嚟，{user}'],
      eyeAnon: ['哈囉', '歡迎返嚟', '隨時開始'],
      heads: ['今日想我幫你做啲乜？', '想由邊度開始傾起？', '有咩新想法隨時講。'],
    },
    en: {
      eyeUser: ['Hi, {user}', 'Hello, {user}', 'Welcome back, {user}'],
      eyeAnon: ['Hello', 'Welcome back', 'Ready when you are'],
      heads: ['Where should we start?', 'What can I help you with today?', 'What would you like to explore?'],
    },
    ja: {
      eyeUser: ['こんにちは、{user}さん', 'おかえりなさい、{user}さん'],
      eyeAnon: ['こんにちは', 'おかえりなさい', 'いつでも始められます'],
      heads: ['今日は何をお手伝いしましょうか？', 'どこから始めましょうか？', 'どんなアイデアでも気軽にどうぞ。'],
    },
  };

  // 严守 7 条性能规范的 Google M3 Expressive 样式表（侧栏仅 contain: style，无重型选择器，完整弹簧动效）
  const CLIENT_CSS = [
    '@property --ag-sb-halo-angle{syntax:"<angle>";inherits:false;initial-value:120deg}',
    ':root{--ag-sb-font-display:"Google Sans Flex","Google Sans","SF Pro Display","Segoe UI Variable Display","PingFang SC","Microsoft YaHei UI","Noto Sans SC",-apple-system,BlinkMacSystemFont,sans-serif;--ag-sb-spring-spatial:cubic-bezier(0.34,1.24,0.64,1);--ag-sb-spring-effect:cubic-bezier(0.2,0,0,1);--ag-sb-bg:#0e0f12;--ag-sb-canvas:#131314;--ag-sb-container:#1e1f20;--ag-sb-tray:#18191b;--ag-sb-high:#282a2c;--ag-sb-popover:rgba(30,31,32,.96);--ag-sb-hairline:rgba(255,255,255,.05);--ag-sb-specular:rgba(255,255,255,.085);--ag-sb-hover:rgba(255,255,255,.058);--ag-sb-pill-track:rgba(255,255,255,.052);--ag-sb-pill-thumb:rgba(255,255,255,.13);--ag-sb-active-pill:rgba(168,199,250,.12);--ag-sb-active-anchor:#8ab4f8;--ag-sb-active-text:#e8f0fe;--ag-sb-fg:#e3e3e3;--ag-sb-muted:#c4c7c5;--ag-sb-dim:#8e918f;--ag-sb-send-idle-bg:rgba(255,255,255,.08);--ag-sb-send-idle-fg:rgba(227,227,227,.36);--ag-sb-send-ready-bg:#e3e3e3;--ag-sb-send-ready-fg:#131314;--ag-sb-shadow:0 14px 40px rgba(0,0,0,.34),0 2px 10px rgba(0,0,0,.20);--ag-sb-focus-shadow:0 12px 36px rgba(0,0,0,.32)}',
    'html[data-ag-cs-palette="warm"]{--ag-sb-bg:#110f0e;--ag-sb-canvas:#161412;--ag-sb-container:#211e1b;--ag-sb-tray:#1b1917;--ag-sb-high:#2c2824;--ag-sb-popover:rgba(33,30,27,.96);--ag-sb-hairline:rgba(255,245,235,.06);--ag-sb-active-pill:rgba(232,199,165,.12);--ag-sb-active-anchor:#e6b88a;--ag-sb-active-text:#f5efe8;--ag-sb-fg:#efece7;--ag-sb-muted:#bdb6ae;--ag-sb-dim:#8d867e;--ag-sb-send-ready-bg:#efece7;--ag-sb-send-ready-fg:#161412}',
    'html.light,html[data-theme="light"],html[data-ag-cs-theme="light"],body:is(.theme-light,.light-theme,.light){--ag-sb-bg:#f4f7fc;--ag-sb-canvas:#ffffff;--ag-sb-container:#f0f4f9;--ag-sb-tray:#e7edf6;--ag-sb-high:#e2e9f3;--ag-sb-popover:rgba(255,255,255,.97);--ag-sb-hairline:rgba(15,23,42,.068);--ag-sb-specular:rgba(255,255,255,.92);--ag-sb-hover:rgba(15,23,42,.05);--ag-sb-pill-track:rgba(15,23,42,.055);--ag-sb-pill-thumb:#ffffff;--ag-sb-active-pill:rgba(11,87,208,.09);--ag-sb-active-anchor:#0b57d0;--ag-sb-active-text:#0842a0;--ag-sb-fg:#1f1f1f;--ag-sb-muted:#444746;--ag-sb-dim:#747775;--ag-sb-send-idle-bg:rgba(15,23,42,.075);--ag-sb-send-idle-fg:rgba(15,23,42,.34);--ag-sb-send-ready-bg:#1f1f1f;--ag-sb-send-ready-fg:#ffffff;--ag-sb-shadow:0 8px 28px rgba(15,23,42,.065),0 1px 4px rgba(15,23,42,.04);--ag-sb-focus-shadow:0 10px 28px rgba(15,23,42,.10)}',
    'html:is(.light,[data-theme="light"],[data-ag-cs-theme="light"]):is([data-ag-cs-palette="warm"],[data-ag-cs-palette="obsidian"][data-ag-cs-light-preset="alabaster"]),html:is([data-ag-cs-palette="warm"],[data-ag-cs-palette="obsidian"][data-ag-cs-light-preset="alabaster"])>body:is(.theme-light,.light-theme,.light){--ag-sb-bg:#f3efe8;--ag-sb-canvas:#faf8f5;--ag-sb-container:#f1ede6;--ag-sb-tray:#eae4da;--ag-sb-high:#e5ddd2;--ag-sb-popover:rgba(250,248,245,.97);--ag-sb-hairline:rgba(68,48,30,.075);--ag-sb-active-pill:rgba(180,104,58,.095);--ag-sb-active-anchor:#b4683a;--ag-sb-active-text:#5c2e14;--ag-sb-fg:#1f1d1a;--ag-sb-muted:#524c44;--ag-sb-dim:#80786e;--ag-sb-send-ready-bg:#1f1d1a;--ag-sb-send-ready-fg:#faf8f5}',
    '.ag-prism-mode-dock{contain:style;display:flex;align-items:center;gap:6px;padding:6px 10px 6px;flex-shrink:0;font-family:var(--ag-sb-font-display);user-select:none;box-sizing:border-box}',
    '.ag-prism-sb-native-hidden{display:none!important}',
    '.ag-prism-chat-row-hidden{display:none!important}',
    '.ag-prism-sb-seg{position:relative;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));flex:1 1 auto;min-width:0;padding:3px;border-radius:999px;background:var(--ag-sb-pill-track)}',
    '.ag-prism-sb-slider{position:absolute;top:3px;bottom:3px;left:3px;width:calc(50% - 3px);border-radius:999px;background:var(--ag-sb-pill-thumb);box-shadow:inset 0 1px 0 var(--ag-sb-specular),0 2px 10px rgba(0,0,0,.18);transform:translate3d(0,0,0);transition:transform 300ms var(--ag-sb-spring-spatial);pointer-events:none;z-index:0;will-change:transform}',
    '.ag-prism-sb-seg[data-mode="chat"] .ag-prism-sb-slider{transform:translate3d(100%,0,0)}',
    '.ag-prism-sb-mode-btn{position:relative;z-index:1;appearance:none;border:none;background:transparent;color:var(--ag-sb-dim);height:25px;padding:0 6px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;gap:4px;font-size:11.5px;font-weight:500;font-family:inherit;cursor:pointer;white-space:nowrap;transition:color 180ms var(--ag-sb-spring-effect),transform 160ms var(--ag-sb-spring-spatial)}',
    '.ag-prism-sb-mode-btn:hover,.ag-prism-sb-mode-btn[data-active="1"]{color:var(--ag-sb-fg)}',
    '.ag-prism-sb-mode-btn:active{transform:scale(.94)}',
    '.ag-prism-sb-beta-pill{font-size:9px;line-height:1;font-weight:600;letter-spacing:.03em;padding:2px 4.5px;border-radius:999px;background:var(--ag-sb-active-pill);color:var(--ag-sb-active-anchor);text-transform:uppercase;flex-shrink:0}',
    '.ag-prism-sb-dot{position:absolute;top:4px;right:6px;width:7px;height:7px;border-radius:999px;cursor:pointer;transition:transform 200ms var(--ag-sb-spring-spatial)}',
    '.ag-prism-sb-dot:hover{transform:scale(1.28)}',
    '.ag-prism-sb-dot[data-status="running"]{background:#4c8df6;box-shadow:0 0 8px rgba(76,141,246,.76);animation:ag-sb-dot-pulse 2s ease-in-out infinite}',
    '.ag-prism-sb-dot[data-status="blocked"]{background:#f2b84b;box-shadow:0 0 8px rgba(242,184,75,.88);animation:ag-sb-dot-pulse 1.5s ease-in-out infinite}',
    '@keyframes ag-sb-dot-pulse{0%,100%{opacity:.78;transform:scale(1)}50%{opacity:1;transform:scale(1.18)}}',
    '.ag-prism-chat-pane{contain:style;flex:1 1 0;min-height:0;display:flex;flex-direction:column;color:var(--ag-sb-fg);font-family:var(--ag-sb-font-display);user-select:none;box-sizing:border-box;opacity:1;transform:translate3d(0,0,0);transition:opacity 240ms var(--ag-sb-spring-effect),transform 280ms var(--ag-sb-spring-spatial)}',
    '.ag-prism-chat-pane[data-active="0"]{display:none;content-visibility:hidden}',
    '.ag-prism-chat-pane[data-entering="1"]{animation:ag-sb-pane-in 300ms var(--ag-sb-spring-spatial) both}',
    '@keyframes ag-sb-pane-in{from{opacity:0;transform:translate3d(10px,0,0)}to{opacity:1;transform:translate3d(0,0,0)}}',
    '.ag-prism-sb-chat-head{display:flex;align-items:center;gap:4px;padding:2px 8px 4px;flex-shrink:0}',
    '.ag-prism-sb-icon-btn{appearance:none;border:none;background:transparent;color:var(--ag-sb-muted);width:26px;height:26px;padding:0;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:background-color 160ms var(--ag-sb-spring-effect),color 160ms var(--ag-sb-spring-effect),transform 160ms var(--ag-sb-spring-spatial)}',
    '.ag-prism-sb-icon-btn:hover{background:var(--ag-sb-hover);color:var(--ag-sb-fg)}',
    '.ag-prism-sb-icon-btn:active{transform:scale(.9)}',
    '.ag-prism-sb-search-wrap{display:grid;grid-template-rows:0fr;opacity:0;transition:grid-template-rows 240ms var(--ag-sb-spring-spatial),opacity 180ms var(--ag-sb-spring-effect);flex-shrink:0}',
    '.ag-prism-sb-search-wrap[data-open="1"]{grid-template-rows:1fr;opacity:1}',
    '.ag-prism-sb-search-over{overflow:hidden}',
    '.ag-prism-sb-search{margin:2px 10px 6px;padding:0 10px;height:29px;border-radius:999px;background:var(--ag-sb-pill-track);display:flex;align-items:center;gap:6px}',
    '.ag-prism-sb-search-input{flex:1 1 auto;min-width:0;border:none;outline:none;background:transparent;color:var(--ag-sb-fg);font-size:12px;font-family:inherit}',
    '.ag-prism-sb-new-btn{appearance:none;border:none;background:transparent;color:var(--ag-sb-muted);flex:1 1 auto;min-width:0;padding:0 10px;height:32px;border-radius:12px;display:flex;align-items:center;gap:8px;font-size:13px;font-weight:450;font-family:inherit;cursor:pointer;transition:background-color 160ms var(--ag-sb-spring-effect),color 160ms var(--ag-sb-spring-effect),transform 160ms var(--ag-sb-spring-spatial)}',
    '.ag-prism-sb-new-btn:hover{background:var(--ag-sb-hover);color:var(--ag-sb-fg)}',
    '.ag-prism-sb-new-btn:active{transform:scale(.97)}',
    '.ag-prism-sb-list{flex:1 1 0;min-height:0;overflow-y:auto;padding:2px 8px 10px;display:flex;flex-direction:column;gap:2px}',
    '.ag-prism-sb-sec{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:10px 8px 4px;font-size:11px;font-weight:500;letter-spacing:.035em;color:var(--ag-sb-dim)}',
    '.ag-prism-sb-sec-lead{display:inline-flex;align-items:center;gap:6px;min-width:0}',
    '.ag-prism-sb-sec-right{display:inline-flex;align-items:center;gap:4px;flex-shrink:0}',
    '.ag-prism-sb-cnt{font-size:10.5px;font-variant-numeric:tabular-nums;color:var(--ag-sb-dim);opacity:.78;margin-left:auto;padding-left:6px}',
    '.ag-prism-sb-group-head{appearance:none;border:none;background:transparent;color:var(--ag-sb-muted);width:100%;min-height:28px;padding:4px 8px;border-radius:10px;display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:500;font-family:inherit;cursor:pointer;text-align:left;transition:background-color 150ms ease,color 150ms ease,transform 150ms var(--ag-sb-spring-spatial)}',
    '.ag-prism-sb-group-head:hover{background:var(--ag-sb-hover);color:var(--ag-sb-fg)}',
    '.ag-prism-sb-group-head:active{transform:scale(.98)}',
    '.ag-prism-sb-chev{display:inline-flex;flex-shrink:0;transition:transform 240ms var(--ag-sb-spring-spatial);transform:rotate(90deg)}',
    '.ag-prism-sb-group-head[data-collapsed="1"] .ag-prism-sb-chev{transform:rotate(0deg)}',
    '.ag-prism-sb-folder-grid{display:grid;grid-template-rows:1fr;opacity:1;transition:grid-template-rows 240ms var(--ag-sb-spring-spatial),opacity 180ms var(--ag-sb-spring-effect)}',
    '.ag-prism-sb-folder-grid[data-collapsed="1"]{grid-template-rows:0fr;opacity:0}',
    '.ag-prism-sb-folder-over{overflow:hidden;padding-left:10px;display:flex;flex-direction:column;gap:1px}',
    '.ag-prism-sb-row{position:relative;appearance:none;border:none;background:transparent;color:var(--ag-sb-fg);width:100%;min-height:31px;padding:5px 10px;border-radius:12px;display:flex;align-items:center;gap:8px;font-size:13px;font-family:inherit;cursor:pointer;text-align:left;transition:background-color 160ms var(--ag-sb-spring-effect),color 160ms var(--ag-sb-spring-effect),transform 150ms var(--ag-sb-spring-spatial)}',
    '.ag-prism-sb-row:hover{background:var(--ag-sb-hover)}',
    '.ag-prism-sb-row:active{transform:scale(.98)}',
    '.ag-prism-sb-row[data-active="1"]{background:var(--ag-sb-active-pill);color:var(--ag-sb-active-text);font-weight:500}',
    '.ag-prism-sb-row[data-active="1"]::before{content:"";position:absolute;left:2px;top:6px;bottom:6px;width:2.5px;border-radius:999px;background:var(--ag-sb-active-anchor);animation:ag-sb-anchor-in 220ms var(--ag-sb-spring-spatial) both}',
    '@keyframes ag-sb-anchor-in{from{transform:scaleY(.2);opacity:0}to{transform:scaleY(1);opacity:1}}',
    '.ag-prism-sb-row-title{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.ag-prism-sb-row-tag{font-size:10px;padding:1px 6px;border-radius:999px;background:var(--ag-sb-pill-track);color:var(--ag-sb-dim);flex-shrink:0}',
    '.ag-prism-sb-pin-mark{display:inline-flex;align-items:center;color:var(--ag-sb-active-anchor);opacity:.86;flex-shrink:0}',
    '.ag-prism-sb-row-wrap,.ag-prism-sb-group-wrap{position:relative;display:flex;align-items:center;width:100%}',
    '.ag-prism-sb-row-wrap .ag-prism-sb-row{padding-right:30px}',
    '.ag-prism-sb-group-wrap .ag-prism-sb-group-head{padding-right:48px}',
    '.ag-prism-sb-row-actions{position:absolute;right:4px;top:50%;transform:translateY(-50%);display:inline-flex;align-items:center;gap:2px;opacity:0;pointer-events:none;transition:opacity 140ms ease;z-index:2}',
    '.ag-prism-sb-row-wrap:hover .ag-prism-sb-row-actions,.ag-prism-sb-row-wrap:focus-within .ag-prism-sb-row-actions,.ag-prism-sb-group-wrap:hover .ag-prism-sb-row-actions,.ag-prism-sb-group-wrap:focus-within .ag-prism-sb-row-actions{opacity:1;pointer-events:auto}',
    '.ag-prism-sb-act-btn{appearance:none;border:none;background:transparent;color:var(--ag-sb-dim);width:22px;height:22px;padding:0;border-radius:7px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:background-color 140ms ease,color 140ms ease}',
    '.ag-prism-sb-act-btn:hover{background:var(--ag-sb-pill-thumb);color:var(--ag-sb-fg)}',
    '.ag-prism-sb-archive-dock{margin-top:10px;padding-top:6px;border-top:1px solid var(--ag-sb-hairline)}',
    '.ag-prism-sb-row[data-archived="1"]{color:var(--ag-sb-dim)}',
    '.ag-prism-sb-spin{width:13px;height:13px;border-radius:999px;border:2px solid rgba(76,141,246,.22);border-top-color:#4c8df6;border-right-color:#14b8a6;flex-shrink:0;animation:ag-sb-spin 1s linear infinite}',
    '@keyframes ag-sb-spin{to{transform:rotate(360deg)}}',
    '.ag-prism-sb-amber{width:6px;height:6px;border-radius:999px;background:#f2b84b;box-shadow:0 0 6px rgba(242,184,75,.8);flex-shrink:0}',
    '.ag-prism-sb-empty{padding:6px 10px;font-size:11.5px;color:var(--ag-sb-dim)}',
    '.ag-prism-sb-inline-box{display:flex;align-items:center;gap:6px;margin:4px 6px;padding:5px 9px;border-radius:10px;background:var(--ag-sb-container);border:1px solid var(--ag-sb-hairline);animation:ag-sb-pop-in 200ms var(--ag-sb-spring-spatial) both}',
    '.ag-prism-sb-inline-input{flex:1 1 auto;min-width:0;border:none;outline:none;background:transparent;color:var(--ag-sb-fg);font-size:12px;font-family:inherit}',
    '.ag-prism-chat-home{position:absolute;inset:0;z-index:32;display:flex;flex-direction:column;align-items:center;padding:24px;background:var(--ag-sb-canvas);color:var(--ag-sb-fg);overflow-y:auto;box-sizing:border-box;opacity:1;visibility:visible;transform:translate3d(0,0,0) scale(1);transition:opacity 260ms var(--ag-sb-spring-effect),transform 300ms var(--ag-sb-spring-spatial),visibility 260ms linear}',
    '.ag-prism-chat-home-inner{position:relative;z-index:2;margin:auto 0;width:100%;display:flex;flex-direction:column;align-items:center;padding:12px 0 clamp(32px,7vh,80px)}',
    '.ag-prism-chat-home[data-visible="0"]{opacity:0;visibility:hidden;pointer-events:none;transform:translate3d(0,10px,0) scale(.99);content-visibility:hidden}',
    '.ag-prism-chat-home[data-visible="1"] .ag-prism-hero-head{animation:ag-sb-hero-rise 320ms var(--ag-sb-spring-spatial) both}',
    '.ag-prism-chat-home[data-visible="1"] .ag-prism-vessel-wrap{animation:ag-sb-hero-rise 360ms 45ms var(--ag-sb-spring-spatial) both}',
    '@keyframes ag-sb-hero-rise{from{opacity:0;transform:translate3d(0,12px,0) scale(.99)}to{opacity:1;transform:translate3d(0,0,0) scale(1)}}',
    '[data-ag-prism-canvas-fade="to-chat"],[data-ag-prism-canvas-fade="to-code"]{animation:ag-sb-canvas-fade 240ms var(--ag-sb-spring-effect) both}',
    '@keyframes ag-sb-canvas-fade{from{opacity:.32;transform:translate3d(0,4px,0)}to{opacity:1;transform:translate3d(0,0,0)}}',
    '.ag-prism-code-returning{animation:ag-sb-code-pane-in 220ms var(--ag-sb-spring-effect) both}',
    '@keyframes ag-sb-code-pane-in{from{opacity:.24;transform:translate3d(-6px,0,0)}to{opacity:1;transform:translate3d(0,0,0)}}',
    '.ag-prism-chat-aura{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:0;transition:transform 480ms var(--ag-sb-spring-effect),filter 420ms var(--ag-sb-spring-effect)}',
    '.ag-prism-chat-aura[data-focused="1"]{transform:scale(.955);filter:brightness(1.14) saturate(1.08)}',
    '.ag-prism-aura-orb{position:absolute;border-radius:50%;filter:blur(24px);will-change:transform,opacity;transition:background 460ms var(--ag-sb-spring-effect)}',
    '.ag-prism-chat-aura[data-kind="knowledge"] .ag-prism-orb-a{width:680px;height:410px;left:calc(50% - 370px);top:calc(50% - 245px);background:radial-gradient(circle at 42% 48%,rgba(37,99,235,.36) 0%,rgba(49,134,255,.20) 44%,rgba(14,165,233,.08) 68%,transparent 78%);animation:ag-sb-breathe-a 8s ease-in-out infinite}',
    '.ag-prism-chat-aura[data-kind="knowledge"] .ag-prism-orb-b{width:600px;height:360px;left:calc(50% - 200px);top:calc(50% - 170px);background:radial-gradient(circle at 55% 50%,rgba(0,180,216,.27) 0%,rgba(8,145,178,.16) 46%,rgba(16,185,129,.07) 68%,transparent 78%);animation:ag-sb-breathe-b 11.5s ease-in-out infinite alternate}',
    '.ag-prism-chat-aura[data-kind="spark"] .ag-prism-orb-a{width:700px;height:420px;left:calc(50% - 360px);top:calc(50% - 245px);background:radial-gradient(circle at 46% 48%,rgba(50,121,249,.40) 0%,rgba(37,99,235,.22) 45%,rgba(29,78,216,.09) 68%,transparent 78%);animation:ag-sb-breathe-a 8s ease-in-out infinite}',
    '.ag-prism-chat-aura[data-kind="spark"] .ag-prism-orb-b{width:580px;height:350px;left:calc(50% - 185px);top:calc(50% - 160px);background:radial-gradient(circle at 52% 48%,rgba(96,165,250,.24) 0%,rgba(56,189,248,.15) 48%,transparent 76%);animation:ag-sb-breathe-b 11.5s ease-in-out infinite alternate}',
    ':is(html.light,html[data-theme="light"],html[data-ag-cs-theme="light"],body:is(.theme-light,.light-theme,.light)) .ag-prism-chat-aura[data-kind="knowledge"] .ag-prism-orb-a{background:radial-gradient(circle at 44% 48%,rgba(59,130,246,.18) 0%,rgba(96,165,250,.11) 48%,transparent 76%)}',
    ':is(html.light,html[data-theme="light"],html[data-ag-cs-theme="light"],body:is(.theme-light,.light-theme,.light)) .ag-prism-chat-aura[data-kind="knowledge"] .ag-prism-orb-b{background:radial-gradient(circle at 54% 50%,rgba(20,184,166,.15) 0%,rgba(56,189,248,.09) 52%,transparent 76%)}',
    ':is(html.light,html[data-theme="light"],html[data-ag-cs-theme="light"],body:is(.theme-light,.light-theme,.light)) .ag-prism-chat-aura[data-kind="spark"] .ag-prism-orb-a{background:radial-gradient(circle at 46% 48%,rgba(50,121,249,.19) 0%,rgba(96,165,250,.11) 50%,transparent 76%)}',
    ':is(html.light,html[data-theme="light"],html[data-ag-cs-theme="light"],body:is(.theme-light,.light-theme,.light)) .ag-prism-chat-aura[data-kind="spark"] .ag-prism-orb-b{background:radial-gradient(circle at 52% 48%,rgba(56,189,248,.15) 0%,rgba(147,197,253,.10) 52%,transparent 76%)}',
    '.ag-prism-chat-aura[data-paused="1"] .ag-prism-aura-orb,.ag-prism-chat-home[data-visible="0"] .ag-prism-aura-orb{animation-play-state:paused!important}',
    '@keyframes ag-sb-breathe-a{0%,100%{opacity:.74;transform:translate3d(-12px,-8px,0) scale(.93)}50%{opacity:1;transform:translate3d(12px,6px,0) scale(1.08)}}',
    '@keyframes ag-sb-breathe-b{0%{opacity:.78;transform:translate3d(20px,-10px,0) scale(.95)}100%{opacity:.98;transform:translate3d(-18px,12px,0) scale(1.06)}}',
    '.ag-prism-hero-head{position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;gap:8px;margin-bottom:28px;text-align:center}',
    '.ag-prism-hero-eyebrow-row{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:26px}',
    '.ag-prism-hero-mark{width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}',
    '.ag-prism-hero-mark[data-pop="1"]{animation:ag-sb-brand-pop 320ms var(--ag-sb-spring-spatial) both}',
    '@keyframes ag-sb-brand-pop{from{opacity:.2;transform:scale(.68) rotate(-20deg)}to{opacity:1;transform:scale(1) rotate(0deg)}}',
    '.ag-prism-hero-eyebrow{font-family:var(--ag-sb-font-display);font-size:15.5px;font-weight:450;letter-spacing:-.01em;color:var(--ag-sb-muted)}',
    '.ag-prism-hero-h1{margin:0;font-family:var(--ag-sb-font-display);font-optical-sizing:auto;font-size:clamp(28px,2.9vw,34px);font-weight:400;letter-spacing:-.025em;line-height:1.24;color:var(--ag-sb-fg)}',
    '.ag-prism-vessel-wrap{position:relative;z-index:2;width:min(688px,100%);display:flex;flex-direction:column}',
    '.ag-prism-vessel{position:relative;border-radius:26px;background:color-mix(in srgb,var(--ag-sb-container) 88%,transparent);backdrop-filter:blur(12px) saturate(125%);-webkit-backdrop-filter:blur(12px) saturate(125%);box-shadow:inset 0 1px 0 var(--ag-sb-specular),var(--ag-sb-shadow);transition:box-shadow 280ms var(--ag-sb-spring-effect),background-color 240ms var(--ag-sb-spring-effect),transform 240ms var(--ag-sb-spring-spatial)}',
    '.ag-prism-vessel-wrap[data-focused="1"] .ag-prism-vessel{transform:translate3d(0,-1px,0)}',
    '.ag-prism-vessel::after{content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;pointer-events:none;z-index:4;opacity:0;background:conic-gradient(from var(--ag-sb-halo-angle),transparent 0deg,transparent 215deg,rgba(66,133,244,.58) 272deg,rgba(0,180,216,.48) 318deg,rgba(16,185,129,.26) 342deg,transparent 360deg);-webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);mask-composite:exclude;transition:opacity 360ms var(--ag-sb-spring-effect);animation:ag-sb-halo 7.5s linear infinite;animation-play-state:paused}',
    '.ag-prism-vessel-wrap[data-kind="spark"] .ag-prism-vessel::after{background:conic-gradient(from var(--ag-sb-halo-angle),transparent 0deg,transparent 205deg,rgba(50,121,249,.66) 262deg,rgba(96,165,250,.48) 300deg,rgba(16,185,129,.28) 326deg,rgba(251,191,36,.22) 342deg,rgba(248,113,113,.16) 352deg,transparent 360deg)}',
    '.ag-prism-vessel-wrap[data-focused="1"] .ag-prism-vessel::after{opacity:1;animation-play-state:running}',
    '@keyframes ag-sb-halo{from{--ag-sb-halo-angle:0deg}to{--ag-sb-halo-angle:360deg}}',
    '.ag-prism-chat-input{min-height:58px;max-height:176px;overflow-y:auto;padding:16px 20px 8px;outline:none;color:var(--ag-sb-fg);font-size:15px;line-height:1.56}',
    '.ag-prism-chat-input:focus,.ag-prism-chat-input:focus-visible{outline:none;box-shadow:none}',
    '.ag-prism-chat-input:empty::before{content:attr(data-placeholder);color:var(--ag-sb-dim);pointer-events:none}',
    '.ag-prism-chat-bar{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 12px 11px}',
    '.ag-prism-chat-bar-g{display:inline-flex;align-items:center;gap:6px;min-width:0}',
    '.ag-prism-subseg{position:relative;display:inline-grid;grid-template-columns:repeat(2,minmax(74px,1fr));padding:3px;border-radius:999px;background:var(--ag-sb-pill-track)}',
    '.ag-prism-subslider{position:absolute;top:3px;bottom:3px;left:3px;width:calc(50% - 3px);border-radius:999px;background:var(--ag-sb-pill-thumb);box-shadow:inset 0 1px 0 var(--ag-sb-specular),0 1px 6px rgba(0,0,0,.18);transform:translate3d(0,0,0);transition:transform 280ms var(--ag-sb-spring-spatial);pointer-events:none;will-change:transform}',
    '.ag-prism-subseg[data-submode="spark"] .ag-prism-subslider{transform:translate3d(100%,0,0)}',
    '.ag-prism-subbtn{position:relative;z-index:1;appearance:none;border:none;background:transparent;color:var(--ag-sb-dim);height:26px;padding:0 10px;border-radius:999px;font-size:12px;font-weight:500;font-family:inherit;cursor:pointer;white-space:nowrap;transition:color 160ms var(--ag-sb-spring-effect),transform 150ms var(--ag-sb-spring-spatial)}',
    '.ag-prism-subbtn[data-active="1"],.ag-prism-subbtn:hover{color:var(--ag-sb-fg)}',
    '.ag-prism-subbtn:active{transform:scale(.94)}',
    '.ag-prism-ghost-btn{appearance:none;border:none;background:transparent;color:var(--ag-sb-muted);height:30px;padding:0 10px;border-radius:999px;display:inline-flex;align-items:center;gap:6px;font-size:12px;font-family:inherit;cursor:pointer;white-space:nowrap;transition:background-color 160ms ease,color 160ms ease,transform 160ms var(--ag-sb-spring-spatial)}',
    '.ag-prism-ghost-btn:hover{background:var(--ag-sb-hover);color:var(--ag-sb-fg)}',
    '.ag-prism-ghost-btn:active{transform:scale(.95)}',
    '.ag-prism-send-btn{appearance:none;border:none;width:34px;height:34px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;background:var(--ag-sb-send-ready-bg);color:var(--ag-sb-send-ready-fg);transition:background-color 200ms ease,color 200ms ease,transform 220ms var(--ag-sb-spring-spatial),border-radius 200ms var(--ag-sb-spring-spatial)}',
    '.ag-prism-send-btn[data-ready="0"]{background:var(--ag-sb-send-idle-bg);color:var(--ag-sb-send-idle-fg);transform:scale(.95);cursor:default}',
    '.ag-prism-send-btn[data-ready="1"]:hover{transform:scale(1.07)}',
    '.ag-prism-send-btn[data-ready="1"]:active{transform:scale(.91);border-radius:12px}',
    '.ag-prism-tray-grid{display:grid;grid-template-rows:0fr;opacity:0;pointer-events:none;transition:grid-template-rows 300ms var(--ag-sb-spring-spatial),opacity 220ms var(--ag-sb-spring-effect)}',
    '.ag-prism-vessel-wrap[data-spark-tray="1"] .ag-prism-tray-grid{grid-template-rows:1fr;opacity:1;pointer-events:auto}',
    '.ag-prism-tray-over{overflow:hidden;border-radius:0 0 26px 26px}',
    '.ag-prism-tray-bar{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 14px 11px;border-radius:0 0 26px 26px;background:color-mix(in srgb,var(--ag-sb-tray) 92%,transparent);border-top:1px solid var(--ag-sb-hairline);font-size:12px;color:var(--ag-sb-muted);transform:translate3d(0,-10px,0);opacity:0;transition:transform 300ms var(--ag-sb-spring-spatial),opacity 220ms var(--ag-sb-spring-effect)}',
    '.ag-prism-vessel-wrap[data-spark-tray="1"] .ag-prism-tray-bar{transform:translate3d(0,0,0);opacity:1}',
    '.ag-prism-sidebar-popover{position:fixed;z-index:2147483000;min-width:224px;max-width:336px;padding:7px;border-radius:18px;background:var(--ag-sb-popover);border:1px solid var(--ag-sb-hairline);box-shadow:0 14px 40px rgba(0,0,0,.38);backdrop-filter:blur(20px) saturate(140%);color:var(--ag-sb-fg);font-family:var(--ag-sb-font-display);display:flex;flex-direction:column;gap:2px;animation:ag-sb-pop-in 220ms var(--ag-sb-spring-spatial) both}',
    '.ag-prism-model-popover{width:316px}',
    '@keyframes ag-sb-pop-in{from{opacity:0;transform:translate3d(0,6px,0) scale(.95)}to{opacity:1;transform:translate3d(0,0,0) scale(1)}}',
    '.ag-prism-menu-btn{appearance:none;border:none;background:transparent;color:var(--ag-sb-fg);min-height:32px;padding:6px 10px;border-radius:11px;display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12.5px;font-family:inherit;cursor:pointer;width:100%;text-align:left;transition:background-color 140ms ease,transform 140ms var(--ag-sb-spring-spatial)}',
    '.ag-prism-menu-btn-lead{display:inline-flex;align-items:center;gap:8px;min-width:0}',
    '.ag-prism-menu-btn[data-danger="1"]{color:#f28b82}',
    '.ag-prism-menu-btn[data-danger="1"]:hover{background:rgba(242,139,130,.12)}',
    ':is(html.light,html[data-theme="light"],html[data-ag-cs-theme="light"],body:is(.theme-light,.light-theme,.light)) .ag-prism-menu-btn[data-danger="1"]{color:#b3261e}',
    ':is(html.light,html[data-theme="light"],html[data-ag-cs-theme="light"],body:is(.theme-light,.light-theme,.light)) .ag-prism-menu-btn[data-danger="1"]:hover{background:rgba(179,38,30,.09)}',
    '.ag-prism-menu-btn:hover{background:var(--ag-sb-hover)}',
    '.ag-prism-menu-btn:active{transform:scale(.98)}',
    '.ag-prism-model-opt{appearance:none;border:none;background:transparent;color:var(--ag-sb-fg);padding:7px 10px;border-radius:12px;display:flex;align-items:flex-start;justify-content:space-between;gap:10px;font-family:inherit;cursor:pointer;width:100%;text-align:left;transition:background-color 150ms ease,transform 150ms var(--ag-sb-spring-spatial)}',
    '.ag-prism-model-opt:hover{background:var(--ag-sb-hover)}',
    '.ag-prism-model-opt:active{transform:scale(.98)}',
    '.ag-prism-model-opt[data-selected="1"]{background:var(--ag-sb-active-pill)}',
    '.ag-prism-model-lead{display:flex;align-items:flex-start;gap:9px;min-width:0;flex:1 1 auto}',
    '.ag-prism-model-icon{width:16px;height:16px;margin-top:2px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center}',
    '.ag-prism-model-text{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1 1 auto}',
    '.ag-prism-model-name{font-size:12.5px;font-weight:500;line-height:1.3;color:var(--ag-sb-fg)}',
    '.ag-prism-model-opt[data-selected="1"] .ag-prism-model-name{color:var(--ag-sb-active-text)}',
    '.ag-prism-model-desc{font-size:11px;line-height:1.38;color:var(--ag-sb-dim)}',
    '.ag-prism-model-check{color:var(--ag-sb-active-anchor);flex-shrink:0;margin-top:2px;display:inline-flex}',
    '.ag-prism-effort-pills{display:grid;gap:4px;padding:2px 4px 4px}',
    '.ag-prism-effort-pill{appearance:none;border:none;background:var(--ag-sb-pill-track);color:var(--ag-sb-muted);height:28px;border-radius:10px;font-size:11.5px;font-weight:500;font-family:inherit;cursor:pointer;transition:background-color 150ms ease,color 150ms ease,transform 150ms var(--ag-sb-spring-spatial)}',
    '.ag-prism-effort-pill:hover{background:var(--ag-sb-hover);color:var(--ag-sb-fg)}',
    '.ag-prism-effort-pill:active{transform:scale(.95)}',
    '.ag-prism-effort-pill[data-active="1"]{background:var(--ag-sb-active-pill);color:var(--ag-sb-active-text)}',
    '.ag-prism-menu-sep{height:1px;margin:4px 8px;background:var(--ag-sb-hairline)}',
    '.ag-prism-menu-note{padding:5px 10px 3px;font-size:11px;font-weight:500;letter-spacing:.02em;line-height:1.45;color:var(--ag-sb-dim)}',
    '.ag-prism-sb-toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:2147483100;padding:8px 16px;border-radius:999px;background:var(--ag-sb-popover);border:1px solid var(--ag-sb-hairline);box-shadow:0 10px 30px rgba(0,0,0,.32);color:var(--ag-sb-fg);font-size:12px;font-family:var(--ag-sb-font-display);animation:ag-sb-toast-in 240ms var(--ag-sb-spring-spatial) both}',
    '@keyframes ag-sb-toast-in{from{opacity:0;transform:translate(-50%,10px) scale(.94)}to{opacity:1;transform:translate(-50%,0) scale(1)}}',
    '.ag-prism-modal-backdrop{position:fixed;inset:0;z-index:2147483050;background:rgba(0,0,0,.52);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:20px;animation:ag-sb-fade-in 180ms ease both}',
    '@keyframes ag-sb-fade-in{from{opacity:0}to{opacity:1}}',
    '.ag-prism-modal{width:min(416px,100%);border-radius:24px;padding:22px 22px 18px;background:var(--ag-sb-popover);border:1px solid var(--ag-sb-hairline);box-shadow:0 24px 64px rgba(0,0,0,.46);color:var(--ag-sb-fg);font-family:var(--ag-sb-font-display);display:flex;flex-direction:column;gap:12px;animation:ag-sb-pop-in 240ms var(--ag-sb-spring-spatial) both}',
    '.ag-prism-modal-title{margin:0;font-size:16px;font-weight:550;letter-spacing:-.01em;color:var(--ag-sb-fg)}',
    '.ag-prism-modal-body{margin:0;font-size:13px;line-height:1.58;color:var(--ag-sb-muted)}',
    '.ag-prism-modal-note{font-size:11.5px;line-height:1.48;color:var(--ag-sb-dim);padding:8px 11px;border-radius:12px;background:var(--ag-sb-pill-track)}',
    '.ag-prism-modal-input{width:100%;box-sizing:border-box;height:38px;padding:0 13px;border-radius:12px;border:1px solid var(--ag-sb-hairline);background:var(--ag-sb-container);color:var(--ag-sb-fg);font-size:13.5px;font-family:inherit;outline:none}',
    '.ag-prism-modal-input:focus{border-color:var(--ag-sb-active-anchor)}',
    '.ag-prism-modal-actions{display:flex;flex-direction:column;gap:7px;margin-top:4px}',
    '.ag-prism-modal-actions-row{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:4px}',
    '.ag-prism-modal-btn{appearance:none;border:none;min-height:36px;padding:8px 14px;border-radius:12px;background:var(--ag-sb-pill-track);color:var(--ag-sb-fg);font-size:13px;font-weight:500;font-family:inherit;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px;transition:background-color 150ms ease,transform 140ms var(--ag-sb-spring-spatial)}',
    '.ag-prism-modal-btn:hover{background:var(--ag-sb-hover)}',
    '.ag-prism-modal-btn:active{transform:scale(.98)}',
    '.ag-prism-modal-btn[data-variant="primary"]{background:var(--ag-sb-active-pill);color:var(--ag-sb-active-text)}',
    '.ag-prism-modal-btn[data-variant="primary"]:hover{filter:brightness(1.12)}',
    '.ag-prism-modal-btn[data-variant="danger"]{background:rgba(242,139,130,.14);color:#f28b82}',
    '.ag-prism-modal-btn[data-variant="danger"]:hover{background:rgba(242,139,130,.22)}',
    ':is(html.light,html[data-theme="light"],html[data-ag-cs-theme="light"],body:is(.theme-light,.light-theme,.light)) .ag-prism-modal-btn[data-variant="danger"]{background:rgba(179,38,30,.10);color:#b3261e}',
    '.ag-prism-modal-btn[data-variant="ghost"]{background:transparent;color:var(--ag-sb-dim)}',
    '.ag-prism-modal-btn[data-variant="ghost"]:hover{background:var(--ag-sb-hover);color:var(--ag-sb-fg)}',
    '/* Google Gemini 官方网页端风格的 Chat 运行会话页布局（严格限定 html[data-ag-prism-mode="chat"]，切回 Code 零污染） */',
    'html[data-ag-cs-style][data-ag-prism-mode="chat"] [data-ag-cs-conv-seat="1"]:not([data-has-browser-hole="true"]){background-color:var(--ag-sb-canvas)!important}',
    'html[data-ag-cs-style][data-ag-prism-mode="chat"] [data-testid="conversation-view"]::before{display:none!important}',
    'html[data-ag-cs-style][data-ag-prism-mode="chat"] .ag-cs-conv-aura-host,html[data-ag-cs-style][data-ag-prism-mode="chat"] .ag-cs-dual-stage,html[data-ag-cs-style][data-ag-prism-mode="chat"] .ag-cs-crab,html[data-ag-cs-style][data-ag-prism-mode="chat"] .ag-cs-prism-rim-cv{display:none!important}',
    'html[data-ag-cs-style][data-ag-prism-mode="chat"] #antigravity\\.agentSidePanelInputBox .agy-composer-footer [data-testid="permissions-selector-trigger"],html[data-ag-cs-style][data-ag-cs-composer="on"][data-ag-prism-mode="chat"] #antigravity\\.agentSidePanelInputBox .agy-composer-footer [data-testid="permissions-selector-trigger"]{display:none!important}',
    'html[data-ag-cs-style][data-ag-prism-mode="chat"][data-ag-cs-has-crab="1"] [data-testid="conversation-view"] [data-testid="autoscroll-viewport"]>div.mx-auto.w-full{padding-bottom:28px!important}',
    'html[data-ag-cs-style][data-ag-prism-mode="chat"] [data-testid="conversation-view"] [data-testid="autoscroll-viewport"]>div.mx-auto.w-full{max-width:min(760px,100%)!important;padding-left:20px!important;padding-right:20px!important}',
    'html[data-ag-cs-style][data-ag-prism-mode="chat"] [data-testid="user-message-bubble"]{border-radius:22px 22px 6px 22px!important;border:none!important;background:var(--ag-sb-container)!important;box-shadow:none!important;padding:11px 18px!important}',
    'html[data-ag-cs-style][data-ag-prism-mode="chat"] [data-testid="agent-input-box"]{position:relative!important;z-index:60!important;background:transparent!important;padding-top:26px!important;padding-bottom:10px!important;overflow:visible!important}',
    'html[data-ag-cs-style][data-ag-prism-mode="chat"] #antigravity\\.agentSidePanelInputBox{position:relative!important;z-index:60!important;width:100%!important;max-width:min(760px,calc(100% - 28px))!important;min-width:0!important;margin:0 auto 10px!important;background:transparent!important;border:none!important;box-shadow:none!important;overflow:visible!important}',
    'html[data-ag-cs-style][data-ag-prism-mode="chat"] #antigravity\\.agentSidePanelInputBox .surface-composer-card{position:static!important;width:100%!important;box-sizing:border-box!important;border-radius:28px!important;padding:12px 14px 10px 18px!important;background:var(--ag-sb-container)!important;background-image:none!important;border:1px solid var(--ag-sb-hairline)!important;box-shadow:var(--ag-sb-shadow),inset 0 1px 0 var(--ag-sb-specular)!important;overflow:visible!important;transition:border-color 200ms ease,box-shadow 240ms ease,background-color 200ms ease!important}',
    'html[data-ag-cs-style][data-ag-prism-mode="chat"] #antigravity\\.agentSidePanelInputBox .surface-composer-card::before{display:none!important;content:none!important}',
    'html[data-ag-cs-style][data-ag-prism-mode="chat"] #antigravity\\.agentSidePanelInputBox .surface-composer-card:focus-within{border-color:color-mix(in srgb,var(--ag-sb-active-anchor) 42%,transparent)!important;box-shadow:var(--ag-sb-focus-shadow),0 0 0 1px color-mix(in srgb,var(--ag-sb-active-anchor) 20%,transparent),inset 0 1px 0 var(--ag-sb-specular)!important}',
    'html[data-ag-cs-style][data-ag-prism-mode="chat"] #antigravity\\.agentSidePanelInputBox .surface-composer-card [data-lexical-editor="true"]{min-height:44px!important;font-size:15px!important;line-height:1.56!important;padding-top:2px!important}',
    'html[data-ag-cs-style][data-ag-prism-mode="chat"] #antigravity\\.agentSidePanelInputBox .surface-composer-card p[data-ag-cs-placeholder]::before{content:"问点什么…"!important;color:var(--ag-sb-dim)!important;font-size:15px!important;font-family:var(--ag-sb-font-display)!important}',
    'html[data-ag-cs-style][data-ag-prism-mode="chat"][data-ag-prism-chat-kind="spark"] #antigravity\\.agentSidePanelInputBox .surface-composer-card p[data-ag-cs-placeholder]::before{content:"交给我一件要处理的事务…"!important}',
    'html[data-ag-cs-style][data-ag-prism-mode="chat"] #antigravity\\.agentSidePanelInputBox .surface-composer-card p.pointer-events-none.absolute:not([data-ag-cs-placeholder]){color:transparent!important}',
    'html[data-ag-cs-style][data-ag-prism-mode="chat"] #antigravity\\.agentSidePanelInputBox .surface-composer-card p.pointer-events-none.absolute:not([data-ag-cs-placeholder])::before{content:"问点什么…";color:var(--ag-sb-dim);font-size:15px;font-family:var(--ag-sb-font-display)}',
    'html[data-ag-cs-style][data-ag-prism-mode="chat"][data-ag-prism-chat-kind="spark"] #antigravity\\.agentSidePanelInputBox .surface-composer-card p.pointer-events-none.absolute:not([data-ag-cs-placeholder])::before{content:"交给我一件要处理的事务…"}',
    'html[data-ag-cs-style][data-ag-prism-mode="chat"] .z-10[data-ag-cs-input-layer="1"]{z-index:60!important}',
    'html[data-ag-cs-style][data-ag-prism-mode="chat"] [data-testid="toggle-overview-panel"],html[data-ag-cs-style][data-ag-prism-mode="chat"] [data-testid="titlebar-more-actions"]{display:none!important}',
    'html[data-ag-cs-style][data-ag-prism-mode="chat"][data-ag-prism-chat-kind="pure"] [data-testid="conversation-view"] button.tabular-nums{font-size:12.5px!important;min-height:26px!important;padding:2px 8px!important;color:var(--ag-sb-dim)!important;opacity:.84!important;border-radius:999px!important;transition:opacity 160ms ease,color 160ms ease,background-color 160ms ease!important}',
    'html[data-ag-cs-style][data-ag-prism-mode="chat"][data-ag-prism-chat-kind="pure"] [data-testid="conversation-view"] button.tabular-nums:hover{opacity:1!important;color:var(--ag-sb-fg)!important;background:var(--ag-sb-hover)!important}',
    'html[data-ag-cs-style][data-ag-prism-mode="chat"][data-ag-prism-chat-kind="pure"] .ag-prism-thought-overlay{border-color:var(--ag-sb-hairline)!important;background:color-mix(in srgb,var(--ag-sb-container) 56%,transparent)!important;border-radius:14px!important}',
    'html[data-ag-cs-style][data-ag-prism-mode="chat"] #antigravity\\.agentSidePanelInputBox .agy-composer-footer{position:static!important;padding:6px 2px 2px!important;gap:8px!important;min-height:34px!important}',
    'html[data-ag-cs-style][data-ag-prism-mode="chat"] #antigravity\\.agentSidePanelInputBox .agy-composer-footer>:is(#ag-prism-pulse-bar,[data-ag-prism-pulse-bar],#ag-pulse-status-bar):not([hidden]):not([data-ag-prism-hidden="1"]),html[data-ag-cs-style][data-ag-cs-composer="on"][data-ag-prism-mode="chat"]:not([data-ag-cs-telemetry="off"]) #antigravity\\.agentSidePanelInputBox .agy-composer-footer>:is(#ag-prism-pulse-bar,[data-ag-prism-pulse-bar],#ag-pulse-status-bar):not([hidden]):not([data-ag-prism-hidden="1"]){position:absolute!important;bottom:calc(100% + 7px)!important;left:50%!important;transform:translateX(-50%)!important;margin:0!important;display:inline-flex!important;align-items:center!important;height:22px!important;padding:0 10px!important;border-radius:999px!important;background:var(--ag-sb-container)!important;border:1px solid var(--ag-sb-hairline)!important;backdrop-filter:none!important;opacity:1!important;font-size:11px!important;white-space:nowrap!important;z-index:45!important}',
    'html[data-ag-cs-style][data-ag-prism-mode="chat"][data-ag-prism-chat-telemetry="off"] #antigravity\\.agentSidePanelInputBox .agy-composer-footer>:is(#ag-prism-pulse-bar,[data-ag-prism-pulse-bar],#ag-pulse-status-bar):not([hidden]):not([data-ag-prism-hidden="1"]),html[data-ag-cs-style][data-ag-cs-composer="on"][data-ag-prism-mode="chat"][data-ag-prism-chat-telemetry="off"] #antigravity\\.agentSidePanelInputBox .agy-composer-footer>:is(#ag-prism-pulse-bar,[data-ag-prism-pulse-bar],#ag-pulse-status-bar):not([hidden]):not([data-ag-prism-hidden="1"]){display:none!important}',
    '.ag-prism-chat-topbar-acts{display:inline-flex;align-items:center;gap:4px;margin-left:auto;padding-right:4px;font-family:var(--ag-sb-font-display)}',
    '.ag-prism-chat-topbar-btn{appearance:none;border:none;background:transparent;color:var(--ag-sb-dim);width:28px;height:28px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:background-color 140ms ease,color 140ms ease,transform 140ms var(--ag-sb-spring-spatial)}',
    '.ag-prism-chat-topbar-btn:hover{background:var(--ag-sb-hover);color:var(--ag-sb-fg)}',
    '.ag-prism-chat-topbar-btn[data-active="1"]{color:var(--ag-sb-active-anchor)}',
    '.ag-prism-chat-topbar-btn:active{transform:scale(.92)}',
    '.ag-prism-vessel-wrap[data-drag-over="1"] .ag-prism-vessel{outline:1.5px dashed var(--ag-sb-active-anchor);outline-offset:2px;background:color-mix(in srgb,var(--ag-sb-active-pill) 52%,var(--ag-sb-container))}',
    '.ag-prism-att-strip{display:flex;flex-wrap:wrap;gap:6px;padding:12px 16px 0}',
    '.ag-prism-att-strip:empty{display:none}',
    '.ag-prism-att-chip{display:inline-flex;align-items:center;gap:6px;max-width:210px;padding:4px 8px 4px 5px;border-radius:12px;background:var(--ag-sb-pill-track);border:1px solid var(--ag-sb-hairline);color:var(--ag-sb-fg);font-size:11.5px}',
    '.ag-prism-att-thumb{width:24px;height:24px;border-radius:7px;object-fit:cover;flex-shrink:0}',
    '.ag-prism-att-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1 1 auto}',
    '.ag-prism-att-rm{appearance:none;border:none;background:transparent;color:var(--ag-sb-dim);width:18px;height:18px;padding:0;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0}',
    '.ag-prism-att-rm:hover{background:var(--ag-sb-hover);color:var(--ag-sb-fg)}',
    '.ag-prism-starter-chips{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:7px;margin-top:16px;max-width:min(688px,100%);animation:ag-sb-hero-rise 280ms var(--ag-sb-spring-spatial) both}',
    '.ag-prism-starter-chips[data-hidden="1"]{display:none}',
    '.ag-prism-starter-chip{appearance:none;border:1px solid var(--ag-sb-hairline);background:color-mix(in srgb,var(--ag-sb-container) 68%,transparent);color:var(--ag-sb-muted);height:30px;padding:0 13px;border-radius:999px;font-size:12px;font-weight:450;font-family:var(--ag-sb-font-display);cursor:pointer;transition:background-color 150ms ease,color 150ms ease,border-color 150ms ease,transform 150ms var(--ag-sb-spring-spatial)}',
    '.ag-prism-starter-chip:hover{background:var(--ag-sb-high);color:var(--ag-sb-fg);border-color:color-mix(in srgb,var(--ag-sb-active-anchor) 32%,transparent);transform:translateY(-1px)}',
    '.ag-prism-starter-chip:active{transform:scale(.96)}',
    '.ag-prism-starter-dismiss{appearance:none;border:none;background:transparent;color:var(--ag-sb-dim);width:24px;height:24px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;opacity:.55;transition:opacity 140ms ease,background-color 140ms ease}',
    '.ag-prism-starter-dismiss:hover{opacity:1;background:var(--ag-sb-hover);color:var(--ag-sb-fg)}',
    '.ag-prism-sb-time-lbl{padding:8px 10px 2px;font-size:10.5px;font-weight:500;letter-spacing:.03em;color:var(--ag-sb-dim);opacity:.78}',
    '.ag-prism-sb-dropzone{transition:background-color 140ms ease,box-shadow 140ms ease,border-color 140ms ease}',
    '.ag-prism-sb-dropzone[data-drop-active="1"]{background:var(--ag-sb-active-pill)!important;box-shadow:inset 0 0 0 1.5px var(--ag-sb-active-anchor)!important;border-radius:10px}',
    '.ag-prism-sb-pin-drop{margin:2px 4px 4px;padding:5px 10px;border-radius:10px;border:1px dashed var(--ag-sb-hairline);font-size:11px;color:var(--ag-sb-dim);display:flex;align-items:center;gap:6px;transition:all 150ms ease}',
    '.ag-prism-sb-row[data-dragging="1"]{opacity:.42}',
    '.ag-prism-sb-check{width:15px;height:15px;border-radius:5px;border:1.5px solid var(--ag-sb-dim);display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;transition:background-color 140ms ease,border-color 140ms ease}',
    '.ag-prism-sb-check[data-checked="1"]{background:var(--ag-sb-active-anchor);border-color:var(--ag-sb-active-anchor);color:#0f172a}',
    ':is(html.light,html[data-theme="light"],html[data-ag-cs-theme="light"],body:is(.theme-light,.light-theme,.light)) .ag-prism-sb-check[data-checked="1"]{color:#ffffff}',
    '.ag-prism-sb-batch-bar{flex-shrink:0;padding:8px 9px;border-top:1px solid var(--ag-sb-hairline);background:var(--ag-sb-container);display:flex;flex-direction:column;gap:6px;animation:ag-sb-pop-in 180ms var(--ag-sb-spring-spatial) both}',
    '.ag-prism-sb-batch-top{display:flex;align-items:center;justify-content:space-between;font-size:11.5px;color:var(--ag-sb-muted)}',
    '.ag-prism-sb-batch-btns{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px}',
    '.ag-prism-sb-batch-btn{appearance:none;border:none;background:var(--ag-sb-pill-track);color:var(--ag-sb-fg);height:28px;border-radius:9px;font-size:11.5px;font-weight:500;font-family:inherit;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:4px;transition:background-color 140ms ease}',
    '.ag-prism-sb-batch-btn:hover{background:var(--ag-sb-hover)}',
    '.ag-prism-sb-batch-btn:disabled{opacity:.38;pointer-events:none}',
    '.ag-prism-sb-batch-btn[data-danger="1"]{color:#f28b82;background:rgba(242,139,130,.12)}',
    '.ag-prism-sb-batch-btn[data-danger="1"]:hover{background:rgba(242,139,130,.22)}',
    '.ag-prism-spark-files-pop{width:300px;max-height:360px}',
    '.ag-prism-spark-files-list{overflow-y:auto;max-height:220px;display:flex;flex-direction:column;gap:2px}',
    '.ag-prism-spark-file-size{font-size:10.5px;color:var(--ag-sb-dim);font-variant-numeric:tabular-nums;flex-shrink:0}',
    'html[data-ag-cs-style][data-ag-prism-mode="chat"] #antigravity\\.agentSidePanelInputBox [data-testid="model-selector-trigger"]{height:32px!important;padding:0 12px!important;border-radius:999px!important;border:none!important;background:transparent!important;box-shadow:none!important;color:var(--ag-sb-muted)!important;font-size:12.5px!important}',
    'html[data-ag-cs-style][data-ag-prism-mode="chat"] #antigravity\\.agentSidePanelInputBox [data-testid="model-selector-trigger"]:hover{background:var(--ag-sb-hover)!important;color:var(--ag-sb-fg)!important}',
    'html[data-ag-cs-style][data-ag-prism-mode="chat"] #antigravity\\.agentSidePanelInputBox [data-testid="send-button"]{width:34px!important;height:34px!important;border-radius:999px!important;background:var(--ag-sb-send-ready-bg)!important;color:var(--ag-sb-send-ready-fg)!important}',
    'html[data-ag-cs-style][data-ag-prism-mode="chat"] #antigravity\\.agentSidePanelInputBox [data-testid="send-button"]:disabled{background:var(--ag-sb-send-idle-bg)!important;color:var(--ag-sb-send-idle-fg)!important}',
    '.ag-prism-chat-policy-chip{position:absolute;bottom:calc(100% + 7px);right:4px;z-index:29;appearance:none;border:1px solid var(--ag-sb-hairline);background:color-mix(in srgb,var(--ag-sb-container) 82%,transparent);backdrop-filter:blur(10px);color:var(--ag-sb-muted);height:22px;padding:0 9px;border-radius:999px;display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:500;font-family:var(--ag-sb-font-display);cursor:pointer;opacity:.68;transition:opacity 160ms ease,background-color 160ms ease,color 160ms ease,border-color 160ms ease,transform 140ms var(--ag-sb-spring-spatial)}',
    '.ag-prism-chat-policy-chip:hover{opacity:1;background:var(--ag-sb-high);color:var(--ag-sb-fg);border-color:color-mix(in srgb,var(--ag-sb-active-anchor) 35%,transparent)}',
    '.ag-prism-chat-policy-chip:active{transform:scale(.95)}',
    '.ag-prism-chat-policy-dot{width:6px;height:6px;border-radius:999px;background:var(--ag-sb-active-anchor);flex-shrink:0}',
    '.ag-prism-chat-policy-chip[data-kind="spark"] .ag-prism-chat-policy-dot{background:#38bdf8}',
    '.ag-prism-sb-footer-dock{flex-shrink:0;padding:6px 8px 8px;border-top:1px solid var(--ag-sb-hairline);display:flex;flex-direction:column;gap:4px}',
    '.ag-prism-sb-policy-btn{appearance:none;border:none;background:transparent;color:var(--ag-sb-muted);width:100%;min-height:31px;padding:5px 10px;border-radius:11px;display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:450;font-family:inherit;cursor:pointer;text-align:left;transition:background-color 150ms ease,color 150ms ease,transform 150ms var(--ag-sb-spring-spatial)}',
    '.ag-prism-sb-policy-btn:hover{background:var(--ag-sb-hover);color:var(--ag-sb-fg)}',
    '.ag-prism-sb-policy-btn:active{transform:scale(.98)}',
    '.ag-prism-modal-wide{width:min(540px,100%);max-height:84vh;padding:20px 22px 18px}',
    '.ag-prism-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}',
    '.ag-prism-modal-sub{margin:3px 0 0;font-size:12px;line-height:1.45;color:var(--ag-sb-dim)}',
    '.ag-prism-policy-tabs{position:relative;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));padding:3px;border-radius:999px;background:var(--ag-sb-pill-track)}',
    '.ag-prism-policy-tab{appearance:none;border:none;background:transparent;color:var(--ag-sb-dim);height:30px;border-radius:999px;font-size:12.5px;font-weight:500;font-family:inherit;cursor:pointer;transition:background-color 160ms ease,color 160ms ease}',
    '.ag-prism-policy-tab[data-active="1"]{background:var(--ag-sb-pill-thumb);color:var(--ag-sb-fg);box-shadow:inset 0 1px 0 var(--ag-sb-specular),0 1px 6px rgba(0,0,0,.18)}',
    '.ag-prism-policy-scroll{overflow-y:auto;max-height:52vh;padding-right:4px;display:flex;flex-direction:column;gap:12px}',
    '.ag-prism-policy-sec{display:flex;flex-direction:column;gap:6px;padding:11px 12px;border-radius:16px;background:var(--ag-sb-container);border:1px solid var(--ag-sb-hairline)}',
    '.ag-prism-policy-sec-title{display:flex;align-items:center;justify-content:space-between;font-size:12px;font-weight:600;color:var(--ag-sb-fg);margin-bottom:2px}',
    '.ag-prism-policy-sec-cnt{font-size:11px;font-weight:450;color:var(--ag-sb-dim)}',
    '.ag-prism-switch-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 4px;border-radius:10px;cursor:pointer;transition:background-color 140ms ease}',
    '.ag-prism-switch-row:hover{background:var(--ag-sb-hover)}',
    '.ag-prism-switch-row[data-disabled="1"]{opacity:.46;pointer-events:none}',
    '.ag-prism-switch-meta{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1 1 auto}',
    '.ag-prism-switch-label{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12.5px;font-weight:500;color:var(--ag-sb-fg)}',
    '.ag-prism-switch-desc{font-size:11px;line-height:1.4;color:var(--ag-sb-dim);overflow:hidden;text-overflow:ellipsis}',
    '.ag-prism-policy-tag{font-size:10px;line-height:1.3;padding:1px 6px;border-radius:999px;background:var(--ag-sb-pill-track);color:var(--ag-sb-dim);font-weight:450}',
    '.ag-prism-policy-tag[data-tone="warn"]{background:rgba(242,184,75,.14);color:#f2b84b}',
    '.ag-prism-switch{position:relative;width:36px;height:20px;border-radius:999px;background:var(--ag-sb-pill-track);border:1px solid var(--ag-sb-hairline);flex-shrink:0;transition:background-color 180ms ease,border-color 180ms ease}',
    '.ag-prism-switch::after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:999px;background:var(--ag-sb-muted);transition:transform 200ms var(--ag-sb-spring-spatial),background-color 180ms ease}',
    '.ag-prism-switch[data-checked="1"]{background:var(--ag-sb-active-anchor);border-color:transparent}',
    '.ag-prism-switch[data-checked="1"]::after{transform:translate3d(16px,0,0);background:#0f172a}',
    ':is(html.light,html[data-theme="light"],html[data-ag-cs-theme="light"],body:is(.theme-light,.light-theme,.light)) .ag-prism-switch[data-checked="1"]::after{background:#ffffff}',
    '.ag-prism-policy-empty{font-size:11.5px;color:var(--ag-sb-dim);padding:4px}',
    'html[data-ag-cs-motion="off"] .ag-prism-aura-orb,html[data-ag-cs-motion="off"] .ag-prism-vessel::after,html[data-ag-cs-motion="off"] .ag-prism-sb-spin,html[data-ag-cs-motion="off"] .ag-prism-sb-dot,html[data-ag-cs-motion="off"] .ag-prism-chat-pane,html[data-ag-cs-motion="off"] .ag-prism-hero-head,html[data-ag-cs-motion="off"] .ag-prism-vessel-wrap,html[data-ag-cs-motion="off"] [data-ag-prism-canvas-fade],html[data-ag-cs-motion="off"] .ag-prism-code-returning,html[data-ag-cs-motion="off"] .ag-prism-modal-backdrop,html[data-ag-cs-motion="off"] .ag-prism-modal{animation:none!important;transition:none!important}',
  ].join('');

  let brandUidSeq = 1;

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function clearNode(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  }

  function makeMonoSvg(name, size) {
    const paths = MONO_ICONS[name] || MONO_ICONS.info;
    const svg = document.createElementNS(SVG_NS, 'svg');
    const px = size || 14;
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', String(px));
    svg.setAttribute('height', String(px));
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.45');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < paths.length; i++) {
      const p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('d', paths[i]);
      svg.appendChild(p);
    }
    return svg;
  }

  function makeBrandSvg(rawSvg, size) {
    const prefix = `agsvg-${brandUidSeq++}-`;
    const rewritten = rawSvg
      .replace(/\bid="([^"]+)"/g, (_, id) => `id="${prefix}${id}"`)
      .replace(/url\(#([^)]+)\)/g, (_, id) => `url(#${prefix}${id})`);
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(rewritten, 'image/svg+xml');
      const parsed = doc && doc.documentElement;
      if (parsed && parsed.nodeName.toLowerCase() === 'svg') {
        const imported = document.importNode(parsed, true);
        imported.setAttribute('width', String(size || 22));
        imported.setAttribute('height', String(size || 22));
        imported.setAttribute('aria-hidden', 'true');
        return imported;
      }
    } catch {}
    return makeMonoSvg('chat', size || 22);
  }

  function runGuarded(fn) {
    const guard = W.__agPrism && typeof W.__agPrism.runGuardedMut === 'function' ? W.__agPrism.runGuardedMut : null;
    if (guard) return guard(fn);
    return fn();
  }

  function normalizeLang(raw) {
    const s = String(raw || 'zh-CN').trim().toLowerCase();
    if (s === 'zh-tw' || s === 'zh-hk' || s === 'zh-hant') return 'zh-TW';
    if (s === 'yue' || s === 'zh-yue') return 'yue';
    if (s.startsWith('ja')) return 'ja';
    if (s.startsWith('en')) return 'en';
    return 'zh-CN';
  }

  function formatHero(lang, userName, seed) {
    const pool = HERO_GREETINGS[normalizeLang(lang)] || HERO_GREETINGS['zh-CN'];
    const cleanUser = typeof userName === 'string' ? userName.trim().slice(0, 40) : '';
    const n = Math.abs(Math.trunc(Number(seed) || 0));
    const eyes = cleanUser ? pool.eyeUser : pool.eyeAnon;
    const eyeTpl = eyes[n % eyes.length] || eyes[0];
    const eyebrow = cleanUser ? eyeTpl.replace(/\{user\}/g, cleanUser) : eyeTpl;
    const headline = pool.heads[Math.floor(n / eyes.length) % pool.heads.length] || pool.heads[0];
    return { eyebrow, headline };
  }

  function normalizeEffortTier(raw) {
    const s = String(raw || '').trim().toLowerCase();
    if (s === 'low') return 'Low';
    if (s === 'medium' || s === 'med') return 'Medium';
    if (s === 'high') return 'High';
    if (s === 'xhigh' || s === 'extra' || s === 'extra high') return 'XHigh';
    return null;
  }

  function createSidebarStudioV2() {
    let destroyed = false;
    let currentCfg = {};
    let currentMeta = null;
    let reqSeq = 1;
    let rpcQueue = Promise.resolve();
    let snapshot = null;
    let catalogItems = [];
    let codeWorkspacePaths = [];
    let liveGeminiModels = DEFAULT_GEMINI_MODELS.slice();
    let searchOpen = false;
    let searchQuery = '';
    let searchComposing = false;
    let inlineFolderOpen = false;
    let inlineBoxOpen = false;
    let archivedOpen = false;
    let multiSelectMode = false;
    const selectedBatchIds = new Set();
    let draggingCid = null;
    let pendingAttachments = [];
    const MAX_BOUNDED_MAP_ENTRIES = 256;
    function setBoundedMapEntry(map, key, value) {
      if (!map || key === undefined || key === null) return;
      if (map.has(key)) map.delete(key);
      map.set(key, value);
      while (map.size > MAX_BOUNDED_MAP_ENTRIES) {
        const oldestKey = map.keys().next().value;
        if (oldestKey === undefined) break;
        map.delete(oldestKey);
      }
    }
    const sessionModelOverrides = new Map();
    let composerText = '';
    let sendingFirst = false;
    let lastSyncCatalogSig = '';
    let lastRenderedMode = 'code';
    let lastNavigatedRoute = '';
    let selectedModel = 'Gemini 4 Neon';
    let selectedEffort = 'High';
    let greetingSeed = Math.floor(Math.random() * 100);
    let activePopover = null;
    let activeModal = null;
    let toastTimer = null;
    let canvasFadeTimer = null;
    let composerChipTimer = null;
    let syncTimer = null;
    let probeTimer = null;
    let probeAttempts = 0;

    // 动态读取的宿主插件与 MCP 目录（零硬编码私密名称，全部运行时按需拉取）
    let cachedStartCascadeStage = null;
    const hostCapabilities = {
      plugins: [],
      mcps: [],
      loaded: false,
      loading: null,
      lastLoadedAt: 0,
    };

    // 宿主只读上下文（严禁保存或调用任何全局设置 setter！）
    const host = {
      store: null,
      psp: null,
      services: null,
      lsWrapper: null,
      origWrapperSend: null,
      origRawSend: null,
      patchedWrapper: null,
      patchedRawLs: null,
      router: null,
      windowConfig: null,
      unsubStore: null,
      unsubRouter: null,
      navEl: null,
      nativeListEl: null,
      parkedNativeNodes: [],
      modeDockEl: null,
      modeDockRefs: null,
      chatPaneEl: null,
      chatPaneRefs: null,
      chatHomeEl: null,
      chatHomeHostEl: null,
      chatHomeHostPrevPos: null,
      composerChipEl: null,
      topbarActsEl: null,
      pendingFirstAttachments: [],
      engaged: false,
      circuitTripped: false,
      reservedMap: new Map(),
      deliveredMap: new Map(),
    };

    function ensureStyleSheet() {
      const parent = document.head || document.documentElement;
      if (!parent) return;
      let style = document.getElementById(STYLE_ID);
      if (!style) {
        style = document.createElement('style');
        style.id = STYLE_ID;
        style.setAttribute(ROOT_ATTR, '1');
        parent.appendChild(style);
      }
      if (style.textContent !== CLIENT_CSS) {
        style.textContent = CLIENT_CSS;
      }
    }

    function showToast(msg) {
      if (destroyed) return;
      runGuarded(() => {
        const old = document.querySelector('.ag-prism-sb-toast');
        if (old) old.remove();
        const t = markOwnedRoot(el('div', 'ag-prism-sb-toast', msg));
        document.body && document.body.appendChild(t);
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
          runGuarded(() => { t.remove(); });
          toastTimer = null;
        }, 2400);
      });
    }

    function closePopover() {
      if (activePopover) {
        const prev = activePopover;
        activePopover = null;
        runGuarded(() => { prev.remove(); });
      }
    }

    function closeModal() {
      if (activeModal) {
        const prev = activeModal;
        activeModal = null;
        runGuarded(() => { prev.remove(); });
      }
    }

    function openModal(buildFn) {
      closePopover();
      closeModal();
      runGuarded(() => {
        const backdrop = markOwnedRoot(el('div', 'ag-prism-modal-backdrop'));
        backdrop.setAttribute('role', 'dialog');
        backdrop.setAttribute('aria-modal', 'true');
        const box = el('div', 'ag-prism-modal');
        box.addEventListener('click', (e) => e.stopPropagation());
        backdrop.addEventListener('click', () => closeModal());
        buildFn(box, closeModal);
        backdrop.appendChild(box);
        document.body && document.body.appendChild(backdrop);
        activeModal = backdrop;
      });
    }

    function triggerCanvasModeFade(direction) {
      const mainHost = resolveMainCanvasHost();
      if (!mainHost || currentCfg.motionLevel === 'off') return;
      runGuarded(() => {
        mainHost.removeAttribute('data-ag-prism-canvas-fade');
        mainHost.setAttribute('data-ag-prism-canvas-fade', direction);
        if (canvasFadeTimer) clearTimeout(canvasFadeTimer);
        canvasFadeTimer = setTimeout(() => {
          runGuarded(() => { mainHost.removeAttribute('data-ag-prism-canvas-fade'); });
          canvasFadeTimer = null;
        }, 280);
      });
    }

    function mountPopover(pop, anchorEl, preferAbove) {
      closePopover();
      runGuarded(() => {
        markOwnedRoot(pop);
        document.body.appendChild(pop);
        activePopover = pop;
        const vw = W.innerWidth || 1280;
        const vh = W.innerHeight || 800;
        const r = pop.getBoundingClientRect();
        const pw = r.width || 240;
        const ph = r.height || 180;
        let left = 16;
        let top = 60;
        if (anchorEl && typeof anchorEl.getBoundingClientRect === 'function') {
          const a = anchorEl.getBoundingClientRect();
          left = Math.max(8, Math.min(vw - pw - 8, a.left));
          if (preferAbove && a.top - ph - 8 >= 8) top = a.top - ph - 8;
          else if (a.bottom + ph + 8 <= vh) top = a.bottom + 6;
          else top = Math.max(8, a.top - ph - 8);
        }
        pop.style.left = `${Math.round(left)}px`;
        pop.style.top = `${Math.round(top)}px`;
      });
    }

    function getUserDisplayName() {
      try {
        const greetEl = document.querySelector('[data-testid="home-greeting"]:not(.ag-prism-hero-h1)');
        const txt = greetEl && typeof greetEl.textContent === 'string' ? greetEl.textContent.trim() : '';
        const mZh = txt.match(/[，,]\s*([^\s？?!！。]{1,32})[？?!！。]?$/);
        if (mZh && mZh[1]) return mZh[1];
      } catch {}
      return '';
    }

    function getCurrentLang() {
      const cfgLang = currentCfg && (currentCfg.language || currentCfg.lang);
      if (cfgLang && cfgLang !== 'auto') return normalizeLang(cfgLang);
      const htmlLang = document.documentElement && document.documentElement.getAttribute('data-ag-cs-lang');
      if (htmlLang) return normalizeLang(htmlLang);
      return normalizeLang((typeof navigator !== 'undefined' && navigator.language) || 'zh-CN');
    }

    // 动态读取宿主实时可见纯 Gemini 模型清单与真实模型枚举号（自动剔除 Orchestrator / Claude / GPT-OSS）
    function refreshLiveGeminiModels() {
      if (!host.store || typeof host.store.getState !== 'function') return;
      try {
        const st = host.store.getState();
        const arrays = [];
        const direct = st?.userStatus?.cascadeModelConfigData?.clientModelConfigs;
        if (Array.isArray(direct) && direct.length) {
          arrays.push(direct);
        } else if (st && typeof st === 'object') {
          for (const v1 of Object.values(st)) {
            if (!v1 || typeof v1 !== 'object') continue;
            for (const v2 of Object.values(v1)) {
              if (Array.isArray(v2) && v2.length && v2[0] && (v2[0].label || v2[0].displayName)) {
                arrays.push(v2);
              } else if (v2 && typeof v2 === 'object' && Array.isArray(v2.clientModelConfigs) && v2.clientModelConfigs.length) {
                arrays.push(v2.clientModelConfigs);
              }
            }
          }
        }
        const grouped = new Map();
        const order = [];
        for (let a = 0; a < arrays.length; a++) {
          const arr = arrays[a];
          for (let i = 0; i < arr.length; i++) {
            const m = arr[i];
            const rawLabel = typeof m?.label === 'string' ? m.label.trim() : '';
            if (!rawLabel) continue;
            if (!/^gemini\b/i.test(rawLabel)) continue;
            if (/orchestrator|claude|gpt/i.test(rawLabel)) continue;
            const parsed = rawLabel.match(/^(.*?)\s*\((Low|Medium|High|XHigh|Extra(?:\s+High)?)\)\s*$/i);
            const baseId = parsed ? parsed[1].trim() : rawLabel;
            const effort = parsed ? normalizeEffortTier(parsed[2]) : null;
            const rawChoice = m?.modelOrAlias?.choice;
            const modelEnum =
              rawChoice && rawChoice.case === 'model' && Number.isInteger(Number(rawChoice.value))
                ? Number(rawChoice.value)
                : Number.isInteger(Number(m?.model)) && Number(m.model) > 0
                ? Number(m.model)
                : null;
            const key = baseId.toLowerCase();
            if (!grouped.has(key)) {
              const preset = MODEL_DESC_BY_ID.get(key) || null;
              const rawDesc = typeof m.tagDescription === 'string' && m.tagDescription.trim() ? m.tagDescription.trim() : '';
              grouped.set(key, {
                id: preset ? preset.id : baseId,
                desc: preset ? preset.desc : rawDesc || 'Google Gemini 对话与推理模型',
                descEn: rawDesc || (preset ? preset.descEn : 'Google Gemini conversational model'),
                efforts: new Set(),
                modelEnums: {},
                defaultEffort: preset ? preset.defaultEffort : 'High',
              });
              order.push(key);
            }
            const entry = grouped.get(key);
            if (effort) {
              entry.efforts.add(effort);
              if (modelEnum !== null) entry.modelEnums[effort] = modelEnum;
            } else if (modelEnum !== null && entry.modelEnums.default === undefined) {
              entry.modelEnums.default = modelEnum;
            }
          }
        }
        if (order.length > 0) {
          const nextList = order.map((k) => {
            const g = grouped.get(k);
            const preset = MODEL_DESC_BY_ID.get(k);
            const arr = g.efforts.size
              ? [...g.efforts].sort((x, y) => (EFFORT_RANK[x] ?? 9) - (EFFORT_RANK[y] ?? 9))
              : preset
                ? preset.efforts.slice()
                : ['Low', 'Medium', 'High'];
            return {
              id: g.id,
              desc: g.desc,
              descEn: g.descEn,
              efforts: arr,
              modelEnums: g.modelEnums,
              defaultEffort: arr.includes(g.defaultEffort) ? g.defaultEffort : arr[arr.length - 1] || 'High',
            };
          });
          liveGeminiModels = nextList;
          if (!liveGeminiModels.some((x) => x.id === selectedModel)) {
            selectedModel = liveGeminiModels[0].id;
            selectedEffort = liveGeminiModels[0].defaultEffort;
          }
        }
      } catch {}
    }

    function resolveModelEnum(modelId, effort) {
      const findEnum = () => {
        const targetId = String(modelId || selectedModel || '').trim().toLowerCase();
        const targetEffort = normalizeEffortTier(effort) || selectedEffort || 'High';
        const hit =
          liveGeminiModels.find((m) => m && String(m.id || '').toLowerCase() === targetId) ||
          liveGeminiModels[0] ||
          null;
        if (!hit || !hit.modelEnums || typeof hit.modelEnums !== 'object') return null;
        if (typeof hit.modelEnums[targetEffort] === 'number') return hit.modelEnums[targetEffort];
        if (typeof hit.modelEnums[hit.defaultEffort] === 'number') return hit.modelEnums[hit.defaultEffort];
        if (typeof hit.modelEnums.default === 'number') return hit.modelEnums.default;
        const vals = Object.values(hit.modelEnums).filter((v) => typeof v === 'number');
        return vals.length ? vals[0] : null;
      };
      let num = findEnum();
      if (num === null) {
        refreshLiveGeminiModels();
        num = findEnum();
      }
      return num;
    }

    // 仅探测只读上下文与项目级 projectSettingsProvider（严禁保存或调用全局设置写接口）
    function discoverHostContexts() {
      if (destroyed || currentCfg.sidebarStudio !== 'on') return false;
      const rootEl = document.getElementById('root') || (document.body && document.body.firstElementChild) || null;
      if (!rootEl) return false;
      let startFiber = null;
      const keys = Object.keys(rootEl);
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (k.startsWith('__reactContainer$') || k.startsWith('__reactFiber$')) {
          startFiber = rootEl[k];
          break;
        }
      }
      if (!startFiber) return false;

      const queue = [startFiber];
      let head = 0;
      let visited = 0;
      const MAX_VISIT = 7000;

      while (head < queue.length && visited < MAX_VISIT) {
        const cur = queue[head++];
        if (!cur || typeof cur !== 'object') continue;
        visited++;

        if (cur.tag === 10 && cur.memoizedProps && cur.memoizedProps.value) {
          const v = cur.memoizedProps.value;
          if (!host.store && v && v.store && typeof v.store.getState === 'function' && typeof v.store.subscribe === 'function') {
            host.store = v.store;
          }
          if (!host.psp && v && typeof v.getState === 'function' && typeof v.onDidChange === 'function') {
            try {
              const st = v.getState();
              if (st && st.projectSettingsProvider && typeof st.projectSettingsProvider === 'object') {
                host.psp = st.projectSettingsProvider;
              }
            } catch {}
          }
          if (!host.services && v && v.core && v.core.projectManagementService) {
            host.services = v;
          }
          if (
            !host.lsWrapper &&
            v &&
            typeof v === 'object' &&
            typeof v.sendUserCascadeMessage === 'function' &&
            typeof v.startCascade === 'function' &&
            typeof v.deleteCascadeTrajectory === 'function' &&
            v !== host.services?.core?.projectManagementService?.lsClient
          ) {
            host.lsWrapper = v;
          }
          if (!host.router && v && typeof v.navigate === 'function' && v.state && v.state.location) {
            host.router = v;
          }
          if (!host.windowConfig && v && typeof v === 'object' && ('sandboxAvailable' in v || 'appDataDirPathSegments' in v)) {
            host.windowConfig = v;
          }
        }
        if (host.store && host.psp && host.services && host.lsWrapper && host.router && host.windowConfig) break;
        if (cur.child) queue.push(cur.child);
        if (cur.sibling) queue.push(cur.sibling);
      }

      installChatSendGuard();
      if (!hostCapabilities.loaded && !hostCapabilities.loading && getHostLsClient()) {
        void refreshHostCapabilities(false);
      }

      if (host.store) {
        refreshLiveGeminiModels();
        readLiveCatalogSnapshot();
        if (!host.unsubStore) {
          try {
            host.unsubStore = host.store.subscribe(() => scheduleCatalogSync());
          } catch {
            host.unsubStore = null;
          }
        }
      }

      if (host.router && !host.unsubRouter && typeof host.router.subscribe === 'function') {
        try {
          host.unsubRouter = host.router.subscribe('onResolved', () => {
            if (destroyed || !snapshot) return;
            const pathname = host.router?.state?.location?.pathname || '';
            if (pathname && pathname !== lastNavigatedRoute) {
              lastNavigatedRoute = pathname;
              if (snapshot.activeMode === 'code' && (pathname === '/' || pathname.startsWith('/c/'))) {
                if (snapshot.currentView !== pathname) {
                  void callDaemonRpc('navigate', { mode: 'code', view: pathname, navRev: snapshot.navRev });
                }
              }
            }
            // 路由切换落地后始终同步 Chat 首页容器与运行会话页微标
            renderChatHome();
            syncChatComposerChrome(true);
          });
        } catch {
          host.unsubRouter = null;
        }
      }

      return Boolean(host.store);
    }

    function computeStatus(summary) {
      if (!summary || typeof summary !== 'object') return 'idle';
      if (Array.isArray(summary.waitingSteps) && summary.waitingSteps.length > 0) return 'blocked';
      if (summary.notFullyIdle || summary.status === 2 || summary.status === 4) return 'running';
      if (summary.latestExecutorTerminationReason === 1) return 'error';
      return 'idle';
    }

    function isTopLevelVisible(summary, cascadeId) {
      if (!summary || typeof summary !== 'object') return false;
      const meta = summary.trajectoryMetadata || {};
      if (meta.parentConversationId || meta.isBattleModeFork) return false;
      if (meta.sourceMetadata && meta.sourceMetadata.hideFromConversationList) return false;
      const tt = summary.trajectoryType;
      if (tt === 'SIDE_QUESTION' || tt === 'COMMIT_MESSAGE_GENERATION' || tt === 2 || tt === 3) return false;
      if (summary.annotations && summary.annotations.archived === true) {
        // 仅对明确归属于 Chat 的会话保留归档项，以便 Chat 侧栏“已归档”抽屉展示与恢复；Code 列表仍严格隐藏归档项
        return Boolean(cascadeId && snapshot && snapshot.assignments && Object.prototype.hasOwnProperty.call(snapshot.assignments, cascadeId));
      }
      return true;
    }

    function stripProtoMeta(val, depth) {
      const d = depth || 0;
      if (d > 10 || val === null || val === undefined) return val;
      if (typeof val !== 'object') return val;
      if (Array.isArray(val)) return val.map((x) => stripProtoMeta(x, d + 1));
      if (val instanceof Uint8Array || val instanceof Date) return val;
      const out = {};
      const keys = Object.keys(val);
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (k === '$typeName' || k === '$unknown') continue;
        const v = val[k];
        if (v !== undefined && typeof v !== 'function') {
          out[k] = stripProtoMeta(v, d + 1);
        }
      }
      return out;
    }

    function getEffectiveChatPolicy() {
      const raw = snapshot && snapshot.prefs && snapshot.prefs.chatPolicy ? snapshot.prefs.chatPolicy : null;
      const rawPure = raw && raw.pure && typeof raw.pure === 'object' ? raw.pure : {};
      const rawSpark = raw && raw.spark && typeof raw.spark === 'object' ? raw.spark : {};
      return {
        pure: {
          webSearch: typeof rawPure.webSearch === 'boolean' ? rawPure.webSearch : DEFAULT_CHAT_POLICY.pure.webSearch,
          imageAndFiles: typeof rawPure.imageAndFiles === 'boolean' ? rawPure.imageAndFiles : DEFAULT_CHAT_POLICY.pure.imageAndFiles,
          keepUserRules: typeof rawPure.keepUserRules === 'boolean' ? rawPure.keepUserRules : DEFAULT_CHAT_POLICY.pure.keepUserRules,
          zeroTools: typeof rawPure.zeroTools === 'boolean' ? rawPure.zeroTools : DEFAULT_CHAT_POLICY.pure.zeroTools,
          allowedPlugins: Array.isArray(rawPure.allowedPlugins) ? rawPure.allowedPlugins.slice() : [],
          allowedMcps: Array.isArray(rawPure.allowedMcps) ? rawPure.allowedMcps.slice() : [],
        },
        spark: {
          fileAccess: typeof rawSpark.fileAccess === 'boolean' ? rawSpark.fileAccess : DEFAULT_CHAT_POLICY.spark.fileAccess,
          schedule: typeof rawSpark.schedule === 'boolean' ? rawSpark.schedule : DEFAULT_CHAT_POLICY.spark.schedule,
          webSearch: typeof rawSpark.webSearch === 'boolean' ? rawSpark.webSearch : DEFAULT_CHAT_POLICY.spark.webSearch,
          imageAndFiles: typeof rawSpark.imageAndFiles === 'boolean' ? rawSpark.imageAndFiles : DEFAULT_CHAT_POLICY.spark.imageAndFiles,
          keepUserRules: typeof rawSpark.keepUserRules === 'boolean' ? rawSpark.keepUserRules : DEFAULT_CHAT_POLICY.spark.keepUserRules,
          sandbox: typeof rawSpark.sandbox === 'boolean' ? rawSpark.sandbox : DEFAULT_CHAT_POLICY.spark.sandbox,
          allowedPlugins: Array.isArray(rawSpark.allowedPlugins) ? rawSpark.allowedPlugins.slice() : [],
          allowedMcps: Array.isArray(rawSpark.allowedMcps) ? rawSpark.allowedMcps.slice() : [],
        },
        showTelemetryAboveComposer:
          typeof raw?.showTelemetryAboveComposer === 'boolean'
            ? raw.showTelemetryAboveComposer
            : DEFAULT_CHAT_POLICY.showTelemetryAboveComposer,
        showStarterChips:
          typeof raw?.showStarterChips === 'boolean'
            ? raw.showStarterChips
            : DEFAULT_CHAT_POLICY.showStarterChips,
      };
    }

    async function refreshHostCapabilities(force) {
      if (destroyed) return hostCapabilities;
      if (hostCapabilities.loading) return hostCapabilities.loading;
      const fresh = hostCapabilities.loaded && Date.now() - hostCapabilities.lastLoadedAt < 15000;
      if (!force && fresh) return hostCapabilities;
      const ls = getHostLsClient();
      if (!ls) return hostCapabilities;

      hostCapabilities.loading = (async () => {
        try {
          if (typeof ls.getAllPlugins === 'function') {
            const pr = await ls.getAllPlugins({});
            const rawList = Array.isArray(pr?.plugins)
              ? pr.plugins
              : Array.isArray(pr?.installedPlugins)
                ? pr.installedPlugins
                : [];
            const seen = new Set();
            const parsed = [];
            for (let i = 0; i < rawList.length; i++) {
              const p = rawList[i];
              const name = typeof p?.name === 'string' ? p.name.trim() : '';
              if (!name) continue;
              const lk = name.toLowerCase();
              if (seen.has(lk)) continue;
              seen.add(lk);
              const fsPath = typeof p.path === 'string' && p.path ? fileUriToFsPath(p.path) : '';
              parsed.push({
                name,
                displayName: typeof p.displayName === 'string' && p.displayName.trim() ? p.displayName.trim() : name,
                description: typeof p.description === 'string' ? p.description.trim() : '',
                path: fsPath,
                isBuiltin: Boolean(p.isBuiltin || p.builtin),
                disabled: Boolean(p.disabled || p.forceDisabled),
                hasHooks: Boolean(p.hooksJson && String(p.hooksJson).trim()),
                hasMcp: Array.isArray(p.mcpServers) && p.mcpServers.length > 0,
                hasRules: Array.isArray(p.rules) && p.rules.length > 0,
                hasSkills: Array.isArray(p.skills) && p.skills.length > 0,
                hasAgents: Array.isArray(p.agents) && p.agents.length > 0,
              });
            }
            parsed.sort((a, b) => {
              if (a.disabled !== b.disabled) return a.disabled ? 1 : -1;
              if (a.isBuiltin !== b.isBuiltin) return a.isBuiltin ? 1 : -1;
              return a.displayName.localeCompare(b.displayName, 'zh-CN');
            });
            hostCapabilities.plugins = parsed;
          }
        } catch {}

        try {
          if (typeof ls.getMcpServerStates === 'function') {
            const mr = await ls.getMcpServerStates({});
            const rawStates = Array.isArray(mr?.states)
              ? mr.states
              : Array.isArray(mr?.serverStates)
                ? mr.serverStates
                : [];
            const seen = new Set();
            const parsed = [];
            for (let i = 0; i < rawStates.length; i++) {
              const s = rawStates[i];
              const spec = s && s.spec && typeof s.spec === 'object' ? stripProtoMeta(s.spec) : null;
              const serverName =
                (spec && typeof spec.serverName === 'string' && spec.serverName.trim()) ||
                (typeof s?.serverName === 'string' && s.serverName.trim()) ||
                '';
              if (!serverName) continue;
              const lk = serverName.toLowerCase();
              if (seen.has(lk)) continue;
              seen.add(lk);
              const toolNames = Array.isArray(s?.tools)
                ? s.tools
                    .map((t) => (t && typeof t.name === 'string' ? t.name.trim() : ''))
                    .filter(Boolean)
                : [];
              parsed.push({
                serverName,
                pluginName: spec && typeof spec.pluginName === 'string' ? spec.pluginName.trim() : '',
                status: typeof s?.status === 'number' ? s.status : 0,
                toolCount: toolNames.length,
                toolNames,
                spec,
              });
            }
            parsed.sort((a, b) => a.serverName.localeCompare(b.serverName));
            hostCapabilities.mcps = parsed;
          }
        } catch {}

        hostCapabilities.loaded = true;
        hostCapabilities.lastLoadedAt = Date.now();
        hostCapabilities.loading = null;
        return hostCapabilities;
      })();
      return hostCapabilities.loading;
    }

    // 构造 Chat 专属单会话原生隔离配置（0 全局修改，严格仅作用于 Pure / Spark 会话）
    function buildChatIsolationBundle(kind, modelEnum, basePlanner, opts) {
      const isPure = kind !== 'spark';
      const policy = getEffectiveChatPolicy();
      const modePolicy = isPure ? policy.pure : policy.spark;
      const zeroTools = Boolean(isPure && modePolicy.zeroTools);
      const allowWeb = !zeroTools && Boolean(modePolicy.webSearch);
      const allowImage = !zeroTools && Boolean(modePolicy.imageAndFiles);
      const allowFiles = !isPure && Boolean(modePolicy.fileAccess);
      const allowSchedule = !isPure && Boolean(modePolicy.schedule);
      const allowSandbox = !isPure && Boolean(modePolicy.sandbox);

      const allowedPluginSet = new Set(
        zeroTools ? [] : (modePolicy.allowedPlugins || []).map((x) => String(x).toLowerCase())
      );
      const allowedMcpSet = new Set(
        zeroTools ? [] : (modePolicy.allowedMcps || []).map((x) => String(x).toLowerCase())
      );

      const allowedPluginPaths = [];
      const allowedBuiltinPlugins = [];
      for (let i = 0; i < hostCapabilities.plugins.length; i++) {
        const p = hostCapabilities.plugins[i];
        if (!allowedPluginSet.has(p.name.toLowerCase())) continue;
        if (p.isBuiltin) {
          allowedBuiltinPlugins.push(p.name);
        } else if (p.path) {
          allowedPluginPaths.push({ path: { case: 'absolute', value: p.path } });
        }
      }

      const allowedMcpSpecs = [];
      const allowedMcpToolNames = [];
      for (let i = 0; i < hostCapabilities.mcps.length; i++) {
        const m = hostCapabilities.mcps[i];
        if (!allowedMcpSet.has(m.serverName.toLowerCase())) continue;
        if (m.spec) {
          allowedMcpSpecs.push(stripProtoMeta(m.spec));
          for (let j = 0; j < m.toolNames.length; j++) {
            allowedMcpToolNames.push(`mcp_${m.serverName}_${m.toolNames[j]}`);
            allowedMcpToolNames.push(m.toolNames[j]);
          }
        }
      }
      const allowMcp = !zeroTools && allowedMcpSpecs.length > 0;

      const customizationDiscoveryConfig = {
        hooks: { inheritUser: false, hooksPaths: [] },
        mcp: { inheritUser: false, servers: allowedMcpSpecs },
        plugins: {
          inheritUser: false,
          pluginsPaths: allowedPluginPaths,
          builtinPluginNames: allowedBuiltinPlugins,
        },
        agents: { inheritUser: false, builtinAgentNames: [], agents: [], agentsPaths: [] },
        skills: { inheritUser: false, skillsPaths: [], builtinSkillNames: [] },
        workflows: { inheritUser: false, workflowsPaths: [], builtinWorkflowNames: [] },
        rules: {
          inheritUser: Boolean(modePolicy.keepUserRules),
          rulesPaths: [],
          pluginPaths: allowedPluginPaths,
        },
      };

      const customizationConfig = {
        enableJsonHooks: false,
        enableTeamworkSubagent: false,
        mcpServers: allowedMcpSpecs,
        preInvocationHookNames: [],
        postInvocationHookNames: [],
        preToolHookNames: [],
        postToolHookNames: [],
        stopHookNames: [],
        customizationDiscoveryConfig,
      };

      const toolNames = [];
      if (!zeroTools) {
        if (allowWeb) {
          toolNames.push('search_web', 'read_url_content');
        }
        if (allowImage) {
          toolNames.push('generate_image');
        }
        if (allowFiles) {
          toolNames.push('read_file', 'view_file', 'write_file', 'write_to_file', 'edit_file', 'list_dir');
        }
        if (allowSchedule) {
          toolNames.push('schedule');
        }
        if (allowMcp) {
          toolNames.push('call_mcp_tool', 'list_resources', 'read_resource', ...allowedMcpToolNames);
        }
      }

      const capSummary = [];
      if (zeroTools) {
        capSummary.push('当前为纯文本零工具对话模式，不调用任何外部工具、插件或本地命令。');
      } else {
        if (allowWeb) capSummary.push('可按需进行联网搜索与网页内容读取');
        if (allowImage) capSummary.push('支持图片生成以及理解用户主动提供的图片与附件');
        if (allowFiles) capSummary.push('可在当前绑定的受控工作文件夹内读取、编辑与整理文档');
        if (allowSchedule) capSummary.push('可协助创建日程提醒或定时任务（schedule）');
        if (allowMcp) capSummary.push(`已按用户白名单挂载 ${allowedMcpSpecs.length} 个 MCP 服务`);
        if (allowedPluginPaths.length + allowedBuiltinPlugins.length > 0) {
          capSummary.push(`已按用户白名单放行 ${allowedPluginPaths.length + allowedBuiltinPlugins.length} 个扩展插件`);
        }
        if (capSummary.length === 0) capSummary.push('当前未开启外部工具，仅通过纯对话直接作答');
      }

      const systemPromptSections = isPure
        ? [
            {
              title: 'identity',
              content:
                '你是一个通用日常对话助手，专注于自然交流、知识解答、写作润色、信息梳理与创意讨论。你当前运行在独立纯净的对话模式中，并非本地代码编辑环境；除非当前会话显式启用了对应工具，否则请不要声称可以读写本地代码仓库或执行系统终端命令。',
            },
            {
              title: 'capabilities',
              content: `当前会话可用能力：${capSummary.join('；')}。请直接、清晰、真诚地回答问题，不虚构未开启的工具。`,
            },
          ]
        : [
            {
              title: 'identity',
              content:
                '你是 Spark 文件与事务助手，在用户指定的单个工作文件夹内协助整理文档、归纳资料与规划日程提醒。请严格在工作文件夹范围内协助处理，不访问目录之外的敏感配置，也不自动执行系统命令。',
            },
            {
              title: 'capabilities',
              content: `当前会话可用能力：${capSummary.join('；')}。${allowSandbox ? '安全确认模式已开启，高风险操作前须先征得用户同意。' : ''}`,
            },
          ];

      const customAgentConfig = {
        systemPromptSections,
        toolNames: Array.from(new Set(toolNames)),
        preInvocationHooks: [],
        postInvocationHooks: [],
        stopHooks: [],
        excludeDefaultComponents: true,
      };

      const baseTools = basePlanner && basePlanner.toolConfig && typeof basePlanner.toolConfig === 'object' ? basePlanner.toolConfig : {};
      const sharedRestrictedTools = {
        forceDisableToolCalling: zeroTools,
        mcp: { forceDisable: !allowMcp },
        invokeSubagent: { enabled: false },
        schedule: { enabled: allowSchedule, enableDaemon: allowSchedule },
        skillSearch: { enabled: false },
        listPluginAccounts: { enabled: allowMcp },
        antigravityBrowser: { enabled: false, enableBrowserSubagentWebview: false },
        runCommand: {
          ...(baseTools.runCommand && typeof baseTools.runCommand === 'object' ? baseTools.runCommand : {}),
          ...(isPure ? { forceDisable: true } : {}),
          enableTerminalSandbox: allowSandbox,
          disableSandboxBypass: true,
          autoCommandConfig: { autoExecutionPolicy: 1 },
        },
        searchWeb: { forceDisable: !allowWeb },
        readUrlContent: { forceDisable: !allowWeb },
        generateImage: { forceDisable: !allowImage },
        commandStatus: { forceDisable: true },
        code: { forceDisable: true },
        codeSearch: { forceDisable: true },
        grep: { forceDisable: true },
        find: { forceDisable: true },
        notebookEdit: { enabled: false },
        trajectorySearch: { forceDisable: true, conversationsEnabled: false, userActivitiesEnabled: false },
        disableSimpleResearchTools: true,
      };

      const fileToolsConfig = allowFiles
        ? {
            writeToFile: { forceDisable: false },
            viewFile: { forceDisable: false },
            listDir: { forceDisable: false },
            workspaceApi: { readOnly: false },
          }
        : {
            writeToFile: { forceDisable: true },
            viewFile: { forceDisable: true },
            listDir: { forceDisable: true },
            workspaceApi: { readOnly: true },
          };

      const plannerConfig = {
        ...(basePlanner && typeof basePlanner === 'object' ? basePlanner : {}),
        plannerTypeConfig: { case: 'customAgent', value: customAgentConfig },
        supportsLatexRendering: true,
        customizationDiscoveryConfig,
        customizationConfig,
        toolConfig: {
          ...baseTools,
          ...sharedRestrictedTools,
          ...fileToolsConfig,
        },
      };
      if (typeof modelEnum === 'number') {
        plannerConfig.planModel = modelEnum;
      }

      const dirPath = opts && typeof opts.dirPath === 'string' && opts.dirPath.trim() ? opts.dirPath.trim() : '';
      const customAgentSpec = {
        config: { case: 'customAgent', value: customAgentConfig },
        cascadeConfig: {
          plannerConfig,
          conversationHistoryConfig: {},
        },
        customizationConfig,
        mcpServers: allowedMcpSpecs,
        workspace: {
          case: 'workspacePaths',
          value: { absolutePaths: !isPure && dirPath ? [dirPath] : [] },
        },
      };

      return {
        customAgentConfig,
        customAgentSpec,
        allowedMcpSpecs,
        cascadeConfig: {
          plannerConfig,
          conversationHistoryConfig: {},
        },
        customizationConfig,
        customizationDiscoveryConfig,
      };
    }

    function isChatAssignedSession(cascadeId) {
      return Boolean(
        typeof cascadeId === 'string' &&
          cascadeId &&
          snapshot &&
          snapshot.assignments &&
          Object.prototype.hasOwnProperty.call(snapshot.assignments, cascadeId) &&
          snapshot.assignments[cascadeId] &&
          snapshot.assignments[cascadeId].mode === 'chat'
      );
    }

    function applyChatIsolationToSendArg(req) {
      if (!req || typeof req !== 'object') return req;
      const cid = typeof req.cascadeId === 'string' ? req.cascadeId : '';
      const assign =
        cid &&
        snapshot &&
        snapshot.assignments &&
        Object.prototype.hasOwnProperty.call(snapshot.assignments, cid)
          ? snapshot.assignments[cid]
          : null;
      if (!assign || assign.mode !== 'chat') return req;
      const kind = assign.placement && assign.placement.kind === 'spark' ? 'spark' : 'knowledge';
      const cleanReq = stripProtoMeta(req);
      const baseCfg = cleanReq.cascadeConfig && typeof cleanReq.cascadeConfig === 'object' ? cleanReq.cascadeConfig : {};
      const basePlanner = baseCfg.plannerConfig && typeof baseCfg.plannerConfig === 'object' ? baseCfg.plannerConfig : {};
      const override = sessionModelOverrides.get(cid);
      const effectiveModel = override && typeof override.modelEnum === 'number' ? override.modelEnum : basePlanner.planModel;
      const bundle = buildChatIsolationBundle(kind, effectiveModel, basePlanner, null);
      cleanReq.cascadeConfig = {
        ...baseCfg,
        ...bundle.cascadeConfig,
        conversationHistoryConfig:
          baseCfg.conversationHistoryConfig && typeof baseCfg.conversationHistoryConfig === 'object'
            ? baseCfg.conversationHistoryConfig
            : {},
      };
      return cleanReq;
    }

    function invokeGuardedSend(orig, thisArg, args) {
      if (args.length > 0 && args[0] && typeof args[0] === 'object') {
        const req = args[0];
        if (isChatAssignedSession(req.cascadeId)) {
          let patched;
          try {
            patched = applyChatIsolationToSendArg(req);
          } catch (err) {
            const msg = String(err && err.message ? err.message : err);
            W.__agPrismSidebarLastSendError = `chatIsolationGuard:${msg}`;
            throw new Error(`Chat isolation failed (fail-closed): ${msg}`);
          }
          if (
            !patched ||
            typeof patched !== 'object' ||
            patched === req ||
            !patched.cascadeConfig ||
            typeof patched.cascadeConfig !== 'object' ||
            !patched.cascadeConfig.plannerConfig ||
            !patched.cascadeConfig.plannerConfig.toolConfig
          ) {
            W.__agPrismSidebarLastSendError = 'chatIsolationGuard:invalid-isolated-payload';
            throw new Error('Chat isolation failed (fail-closed): invalid isolated payload');
          }
          return orig.call(thisArg, patched, ...args.slice(1));
        }
      }
      return orig.apply(thisArg, args);
    }

    function installChatSendGuard() {
      if (destroyed || currentCfg.sidebarStudio !== 'on') return;
      if (host.lsWrapper && host.patchedWrapper !== host.lsWrapper && typeof host.lsWrapper.sendUserCascadeMessage === 'function') {
        const target = host.lsWrapper;
        const orig = target.sendUserCascadeMessage;
        host.patchedWrapper = target;
        host.origWrapperSend = orig;
        target.sendUserCascadeMessage = function (...args) {
          return invokeGuardedSend(orig, this, args);
        };
      }
      const rawLs = getHostLsClient();
      if (rawLs && rawLs !== host.lsWrapper && host.patchedRawLs !== rawLs && typeof rawLs.sendUserCascadeMessage === 'function') {
        const origRaw = rawLs.sendUserCascadeMessage;
        host.patchedRawLs = rawLs;
        host.origRawSend = origRaw;
        rawLs.sendUserCascadeMessage = function (...args) {
          return invokeGuardedSend(origRaw, this, args);
        };
      }
    }

    function uninstallChatSendGuard() {
      if (host.patchedWrapper && host.origWrapperSend) {
        try {
          host.patchedWrapper.sendUserCascadeMessage = host.origWrapperSend;
        } catch {}
      }
      host.patchedWrapper = null;
      host.origWrapperSend = null;
      if (host.patchedRawLs && host.origRawSend) {
        try {
          host.patchedRawLs.sendUserCascadeMessage = host.origRawSend;
        } catch {}
      }
      host.patchedRawLs = null;
      host.origRawSend = null;
    }

    const AUTO_EXEC_DECODE = { 0: 'unspecified', 1: 'off', 2: 'auto', 3: 'eager', 4: 'sandbox' };
    const AUTO_EXEC_ENCODE = { unspecified: 0, off: 1, ask: 1, auto: 2, eager: 3, turbo: 3, sandbox: 4 };
    const FILE_ACCESS_DECODE = { 0: 'unspecified', 1: 'allow-all', 2: 'ask-outside', 3: 'deny-outside' };
    const FILE_ACCESS_ENCODE = {
      unspecified: 0,
      allow: 1,
      'allow-all': 1,
      'allow-workspace': 1,
      ask: 2,
      'ask-outside': 2,
      deny: 3,
      'deny-outside': 3,
    };
    const INTERNET_DECODE = { 0: 'unspecified', 1: 'allow', 2: 'ask', 3: 'deny' };
    const INTERNET_ENCODE = { unspecified: 0, allow: 1, ask: 2, deny: 3 };

    function fileUriToFsPath(rawUri) {
      if (typeof rawUri !== 'string') return '';
      const trimmed = rawUri.trim();
      if (!trimmed) return '';
      if (!/^file:\/\//i.test(trimmed)) return trimmed;
      try {
        let p = decodeURIComponent(trimmed.replace(/^file:\/\//i, ''));
        if (/^\/[a-zA-Z]:/.test(p)) p = p.slice(1);
        return p;
      } catch {
        return trimmed.replace(/^file:\/\//i, '');
      }
    }

    function fsPathToFileUri(rawPath) {
      if (typeof rawPath !== 'string') return '';
      const trimmed = rawPath.trim();
      if (!trimmed) return '';
      if (/^file:\/\//i.test(trimmed)) return trimmed;
      const slashPath = trimmed.replace(/\\/g, '/').replace(/\/+$/, '');
      const winMatch = slashPath.match(/^([a-zA-Z]):(.*)$/);
      if (winMatch) {
        const drive = winMatch[1].toLowerCase();
        const rest = winMatch[2]
          .split('/')
          .map((seg, idx) => (idx === 0 && !seg ? '' : encodeURIComponent(seg)))
          .join('/');
        return `file:///${drive}%3A${rest || '/'}`;
      }
      const prefixed = slashPath.startsWith('/') ? slashPath : `/${slashPath}`;
      const encoded = prefixed
        .split('/')
        .map((seg, idx) => (idx === 0 && !seg ? '' : encodeURIComponent(seg)))
        .join('/');
      return `file://${encoded}`;
    }

    function normalizePathKey(rawPath) {
      if (typeof rawPath !== 'string') return '';
      let s = fileUriToFsPath(rawPath).trim();
      if (!s) return '';
      if (s.startsWith('\\\\?\\')) s = s.slice(4);
      const wsl = s.match(/^\/mnt\/([a-zA-Z])(?:\/(.*))?$/);
      if (wsl) {
        const rest = String(wsl[2] || '').replace(/\/+$/g, '');
        return rest ? `${wsl[1].toLowerCase()}:/${rest.toLowerCase()}` : `${wsl[1].toLowerCase()}:/`;
      }
      s = s.replace(/\\/g, '/').replace(/\/+$/g, '');
      if (/^[a-zA-Z]:$/.test(s)) return `${s.toLowerCase()}/`;
      if (/^[a-zA-Z]:\//.test(s)) return s.toLowerCase();
      return s || '/';
    }

    function readHostProjects() {
      const result = [];
      try {
        const provider = host.services?.core?.projectManagementService?.projectsStateProvider;
        const list = provider && typeof provider.getState === 'function' ? provider.getState() : [];
        if (!Array.isArray(list)) return result;
        for (let i = 0; i < list.length; i++) {
          const entry = list[i];
          if (!entry || typeof entry !== 'object') continue;
          const proj = entry.project && typeof entry.project === 'object' ? entry.project : entry;
          const id = typeof proj.id === 'string' && proj.id.trim() ? proj.id.trim() : '';
          const name = typeof proj.name === 'string' ? proj.name : typeof proj.label === 'string' ? proj.label : '';
          const paths = [];
          const directDir = proj.path || proj.rootPath || proj.uri?.fsPath || entry.path || entry.rootPath || '';
          if (typeof directDir === 'string' && directDir.trim()) paths.push(fileUriToFsPath(directDir));
          const resources = proj?.projectResources?.resources;
          if (Array.isArray(resources)) {
            for (let r = 0; r < resources.length; r++) {
              const resVal = resources[r]?.type?.value;
              const uri = resVal?.folderUri || resVal?.uri || resVal?.path || '';
              if (typeof uri === 'string' && uri.trim()) {
                const fsP = fileUriToFsPath(uri);
                if (fsP && !paths.includes(fsP)) paths.push(fsP);
              }
            }
          }
          if (id || paths.length) {
            result.push({ id, name, path: paths[0] || '', paths });
          }
        }
      } catch {}
      return result;
    }

    function isRealNativePsp() {
      return Boolean(
        host.psp &&
          typeof host.psp.getProjectAutoExecutionPolicy === 'function' &&
          typeof host.psp.getProjectFileAccessPolicy === 'function'
      );
    }

    function resolveHostProjectId(scopeRef, dirPath) {
      const trimmedScope = typeof scopeRef === 'string' ? scopeRef.trim() : '';
      const projects = readHostProjects();
      if (trimmedScope && projects.some((p) => p.id === trimmedScope)) {
        return trimmedScope;
      }
      const targetKey = normalizePathKey(dirPath || '');
      if (targetKey) {
        for (let i = 0; i < projects.length; i++) {
          const p = projects[i];
          if (!p.id) continue;
          const allPaths = Array.isArray(p.paths) && p.paths.length ? p.paths : p.path ? [p.path] : [];
          for (let j = 0; j < allPaths.length; j++) {
            if (normalizePathKey(allPaths[j]) === targetKey) return p.id;
          }
        }
      }
      if (isRealNativePsp()) return null;
      return trimmedScope || null;
    }

    function getHostLsClient() {
      const pms = host.services?.core?.projectManagementService;
      if (pms && pms.lsClient && typeof pms.lsClient === 'object') return pms.lsClient;
      const core = host.services?.core;
      if (core && core.lsClient && typeof core.lsClient === 'object') return core.lsClient;
      return null;
    }

    function makeUuid() {
      try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
          return crypto.randomUUID();
        }
      } catch {}
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
    }

    function parseHostTsMs(raw) {
      if (raw === null || raw === undefined || raw === '') return 0;
      if (typeof raw === 'number') {
        if (!Number.isFinite(raw) || raw <= 0) return 0;
        return raw < 1e11 ? Math.floor(raw * 1000) : Math.floor(raw);
      }
      if (typeof raw === 'string') {
        const s = raw.trim();
        if (!s) return 0;
        if (/^\d+(?:\.\d+)?$/.test(s)) {
          const n = Number(s);
          if (!Number.isFinite(n) || n <= 0) return 0;
          return n < 1e11 ? Math.floor(n * 1000) : Math.floor(n);
        }
        const parsed = Date.parse(s);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
      }
      if (typeof raw === 'object') {
        const sec = Number(raw.seconds ?? raw.sec);
        if (Number.isFinite(sec) && sec > 0) {
          const nanos = Number(raw.nanos || 0);
          return Math.floor(sec * 1000 + (Number.isFinite(nanos) ? nanos / 1e6 : 0));
        }
      }
      return 0;
    }

    function readLiveCatalogSnapshot() {
      const wsPaths = [];
      const projectById = new Map();
      const hostProjects = readHostProjects();
      for (let i = 0; i < hostProjects.length; i++) {
        const p = hostProjects[i];
        const allPaths = Array.isArray(p.paths) && p.paths.length ? p.paths : p.path ? [p.path] : [];
        for (let j = 0; j < allPaths.length; j++) {
          if (allPaths[j] && !wsPaths.includes(allPaths[j])) wsPaths.push(allPaths[j]);
        }
        if (p.id) projectById.set(p.id, { name: p.name || '', path: p.path || '' });
      }
      codeWorkspacePaths = wsPaths;

      if (!host.store || typeof host.store.getState !== 'function') {
        return { health: 'loading', items: [], codeWorkspacePaths: wsPaths, hostProjects };
      }
      try {
        const st = host.store.getState();
        const rawMap =
          st?.trajectorySummaries?.summaries ||
          st?.conversation?.summaries ||
          st?.conversations?.byId ||
          {};
        const items = [];
        const entries = Object.entries(rawMap || {});
        for (let i = 0; i < entries.length; i++) {
          const [cid, s] = entries[i];
          if (!cid || !isTopLevelVisible(s, cid)) continue;
          const wsId = s.workspaceId || s.projectId || '';
          const proj = wsId ? projectById.get(String(wsId)) : null;
          const wsPath = s.workspacePath || (proj && proj.path) || '';
          const wsName = s.workspaceName || (proj && proj.name) || (wsPath ? wsPath.split(/[\\/]/).filter(Boolean).pop() : 'Standalone');
          const updatedAt = parseHostTsMs(s.lastModifiedTime) || parseHostTsMs(s.updatedAt) || parseHostTsMs(s.createdTime) || 0;
          items.push({
            cascadeId: String(cid),
            title: String(s.annotations?.title || s.summary || s.title || cid).slice(0, 140),
            status: computeStatus(s),
            statusStartedAt: parseHostTsMs(s.statusUpdatedAt) || updatedAt,
            updatedAt,
            workspace: String(wsName || 'Standalone'),
            workspacePath: String(wsPath || ''),
            hidden: false,
            pinned: Boolean(s.annotations && s.annotations.pinned),
            archived: Boolean(s.annotations && s.annotations.archived),
            unread: Boolean(s.hasUnread),
          });
        }
        items.sort((a, b) => b.updatedAt - a.updatedAt);
        catalogItems = items;
        return { health: 'ready', items, codeWorkspacePaths: wsPaths, hostProjects };
      } catch {
        return { health: 'loading', items: catalogItems, codeWorkspacePaths: wsPaths, hostProjects };
      }
    }

    function getHostConversationService() {
      const core = host.services && host.services.core;
      return (core && (core.conversationService || core.cascadeService)) || null;
    }

    function getLiveCapabilities() {
      const hasPsp = Boolean(
        host.psp &&
          typeof host.psp.setProjectAutoExecutionPolicy === 'function' &&
          typeof host.psp.setProjectFileAccessPolicy === 'function' &&
          (typeof host.psp.getProjectAutoExecutionPolicy === 'function' ||
            typeof host.psp.getProjectPermissionGrants === 'function')
      );
      const ls = getHostLsClient();
      const hasPerCascade = Boolean(
        ls && typeof ls.startCascade === 'function' && typeof ls.sendUserCascadeMessage === 'function'
      );
      const convSvc = getHostConversationService();
      const hasRebind = Boolean(
        convSvc &&
          (typeof convSvc.rebindWorkspace === 'function' ||
            typeof convSvc.rebindSession === 'function' ||
            typeof convSvc.setConversationWorkspace === 'function')
      );
      return {
        projectPermissions: hasPsp,
        perCascadeIsolation: hasPerCascade,
        sessionRebind: hasRebind,
        sandboxAvailable: Boolean(host.windowConfig && host.windowConfig.sandboxAvailable),
        wslAvailable: Boolean(host.windowConfig && host.windowConfig.wslAvailable),
        artifactsAvailable: true,
      };
    }

    // 注册受控宿主原语供 Daemon live-host-adapter 安全调用（严格仅操作项目级 projectSettingsProvider 或单会话 lsClient）
    function registerHostOps() {
      if (destroyed || currentCfg.sidebarStudio !== 'on') return;
      const invokePspSetter = async (methodName, args) => {
        if (!host.psp || typeof host.psp[methodName] !== 'function') {
          return { ok: false, error: `psp.${methodName} unavailable` };
        }
        const nativeMode = isRealNativePsp();
        const targetId = resolveHostProjectId(args?.scopeRef, args?.dirPath);
        if (!targetId) {
          return { ok: false, error: 'host-project-id-not-found' };
        }
        let wireValue = args?.value;
        if (nativeMode) {
          if (methodName === 'setProjectAutoExecutionPolicy') {
            wireValue = AUTO_EXEC_ENCODE[String(args?.value ?? '')];
            if (wireValue === undefined) return { ok: false, error: `invalid-auto-exec-policy:${args?.value}` };
          } else if (methodName === 'setProjectFileAccessPolicy') {
            wireValue = FILE_ACCESS_ENCODE[String(args?.value ?? '')];
            if (wireValue === undefined) return { ok: false, error: `invalid-file-access-policy:${args?.value}` };
          } else if (methodName === 'setProjectInternetPolicy') {
            wireValue = INTERNET_ENCODE[String(args?.value ?? '')];
            if (wireValue === undefined) return { ok: false, error: `invalid-internet-policy:${args?.value}` };
          } else if (methodName === 'setProjectSandboxMode') {
            const rawVal = args?.value;
            wireValue =
              rawVal === true ||
              rawVal === 'enabled' ||
              rawVal === 'on' ||
              rawVal === 'enabled-if-supported' ||
              rawVal === 'wsl2';
          }
        }
        try {
          await host.psp[methodName](targetId, wireValue);
          return { ok: true };
        } catch (err) {
          return { ok: false, error: String(err && err.message ? err.message : err) };
        }
      };

      W.__agPrismSidebarHostOps = {
        version: SIDEBAR_STUDIO_CLIENT_V2,
        getCapabilities: () => getLiveCapabilities(),
        getCodeWorkspacePaths: () => codeWorkspacePaths.slice(),
        psp: {
          getProjectPermissionGrants: async (args) => {
            if (!host.psp) return { ok: false, error: 'psp-unavailable' };
            if (isRealNativePsp()) {
              const targetId = resolveHostProjectId(args?.scopeRef, args?.dirPath);
              if (!targetId) return { ok: false, error: 'host-project-id-not-found' };
              try {
                const rawAuto = await host.psp.getProjectAutoExecutionPolicy(targetId);
                const rawFile = await host.psp.getProjectFileAccessPolicy(targetId);
                const rawNet =
                  typeof host.psp.getProjectInternetPolicy === 'function'
                    ? await host.psp.getProjectInternetPolicy(targetId)
                    : 0;
                const rawSb =
                  typeof host.psp.getProjectSandboxMode === 'function'
                    ? await host.psp.getProjectSandboxMode(targetId)
                    : false;
                return {
                  ok: true,
                  grants: {
                    autoExecutionPolicy: AUTO_EXEC_DECODE[Number(rawAuto ?? 0)] || 'unspecified',
                    fileAccessPolicy: FILE_ACCESS_DECODE[Number(rawFile ?? 0)] || 'unspecified',
                    internetPolicy: INTERNET_DECODE[Number(rawNet ?? 0)] || 'unspecified',
                    sandboxMode: rawSb === true || rawSb === 'enabled' || rawSb === 'on' ? 'enabled' : 'off',
                  },
                };
              } catch (err) {
                return { ok: false, error: String(err && err.message ? err.message : err) };
              }
            }
            if (typeof host.psp.getProjectPermissionGrants !== 'function') {
              return { ok: false, error: 'psp.getProjectPermissionGrants unavailable' };
            }
            try {
              const raw = await host.psp.getProjectPermissionGrants(args.scopeRef);
              if (!raw || typeof raw !== 'object') return { ok: false, error: 'empty-grants' };
              return { ok: true, grants: { ...raw } };
            } catch (err) {
              return { ok: false, error: String(err && err.message ? err.message : err) };
            }
          },
          setProjectAutoExecutionPolicy: (args) => invokePspSetter('setProjectAutoExecutionPolicy', args),
          setProjectFileAccessPolicy: (args) => invokePspSetter('setProjectFileAccessPolicy', args),
          setProjectInternetPolicy: (args) => invokePspSetter('setProjectInternetPolicy', args),
          setProjectSandboxMode: (args) => invokePspSetter('setProjectSandboxMode', args),
        },
        verifyWslEnvironment: async () => ({
          ok: true,
          available: Boolean(host.windowConfig && host.windowConfig.wslAvailable),
        }),
        validateSessionRebind: async ({ cascadeId }) => {
          const item = catalogItems.find((x) => x.cascadeId === cascadeId);
          if (!item) return { ok: false, code: 'NOT_FOUND', message: 'Session not found' };
          if (item.status === 'running' || item.status === 'blocked') {
            return { ok: false, code: 'BUSY', message: `Session is ${item.status}` };
          }
          if (!getLiveCapabilities().sessionRebind) {
            return { ok: false, code: 'CAPABILITY_UNAVAILABLE', message: 'Host session rebind API unavailable' };
          }
          return { ok: true };
        },
        rebindSession: async ({ cascadeId, scopeRef, placement }) => {
          const item = catalogItems.find((x) => x.cascadeId === cascadeId);
          if (!item || item.status === 'running' || item.status === 'blocked') {
            return { ok: false };
          }
          const convSvc = getHostConversationService();
          const rebindFn =
            convSvc &&
            (convSvc.rebindWorkspace || convSvc.rebindSession || convSvc.setConversationWorkspace);
          if (typeof rebindFn !== 'function') {
            return { ok: false };
          }
          try {
            const out = await rebindFn.call(convSvc, { cascadeId, scopeRef, placement });
            if (out && out.ok === true && out.cascadeId === cascadeId && out.scopeRef === scopeRef) {
              return { ok: true, cascadeId, scopeRef };
            }
            return { ok: false };
          } catch {
            return { ok: false };
          }
        },
        reserveSession: async ({ idempotencyKey, scopeRef, kind, title, dirPath, modelId, effort }) => {
          if (host.reservedMap.has(idempotencyKey)) {
            return { ok: true, ...host.reservedMap.get(idempotencyKey), replayed: true };
          }
          const convSvc = getHostConversationService();
          const reserveFn =
            convSvc &&
            (convSvc.reserveConversation || convSvc.createConversation || convSvc.reserveSession);
          if (typeof reserveFn === 'function') {
            try {
              const out = await reserveFn.call(convSvc, { idempotencyKey, scopeRef, kind, title, dirPath, modelId, effort });
              const cid = typeof out?.cascadeId === 'string' ? out.cascadeId.trim() : '';
              if (!cid) return { ok: false, error: 'empty-reserved-cascade-id' };
              const knownIds = new Set(catalogItems.map((x) => x.cascadeId));
              if (knownIds.has(cid)) return { ok: false, error: 'reserved-id-already-visible' };
              const rec = { cascadeId: cid, hidden: out.hidden !== false };
              setBoundedMapEntry(host.reservedMap, idempotencyKey, rec);
              return { ok: true, ...rec, replayed: Boolean(out.replayed) };
            } catch (err) {
              return { ok: false, error: String(err && err.message ? err.message : err) };
            }
          }
          const ls = getHostLsClient();
          if (!ls || typeof ls.startCascade !== 'function') {
            return { ok: false, error: 'host-session-reservation-unavailable' };
          }
          try {
            const draftCid = makeUuid();
            const workspaceUris = kind === 'spark' && dirPath ? [fsPathToFileUri(dirPath)] : [];
            const requestedModel = resolveModelEnum(modelId || selectedModel, effort || selectedEffort);
            if (!hostCapabilities.loaded) {
              await refreshHostCapabilities(false);
            }
            const iso = buildChatIsolationBundle(kind, requestedModel, null, { dirPath });
            const basePayload = {
              source: 1,
              cascadeId: draftCid,
              workspaceUris,
              ...(typeof requestedModel === 'number' ? { requestedModel } : {}),
            };
            let out;
            W.__agPrismSidebarLastStartFallback = null;
            const stageBuilders = [
              ['full-custom-agent', () => ({ ...basePayload, customAgentSpec: iso.customAgentSpec })],
              [
                'custom-agent-no-workspace',
                () => {
                  const { workspace: _omitWs, ...noWsSpec } = iso.customAgentSpec;
                  return { ...basePayload, customAgentSpec: noWsSpec };
                },
              ],
              [
                'legacy-config-only',
                () => ({
                  ...basePayload,
                  customAgentSpec: {
                    cascadeConfig: iso.cascadeConfig,
                    customizationConfig: iso.customizationConfig,
                  },
                }),
              ],
            ];
            const orderedStages = cachedStartCascadeStage
              ? [
                  ...stageBuilders.filter(([name]) => name === cachedStartCascadeStage),
                  ...stageBuilders.filter(([name]) => name !== cachedStartCascadeStage),
                ]
              : stageBuilders;
            let lastSpecErr = null;
            const fallbackNotes = [];
            for (let si = 0; si < orderedStages.length; si++) {
              const [stageName, makeArg] = orderedStages[si];
              try {
                out = await ls.startCascade(makeArg());
                cachedStartCascadeStage = stageName;
                W.__agPrismSidebarLastStartStage = stageName;
                lastSpecErr = null;
                break;
              } catch (specErr) {
                if (cachedStartCascadeStage === stageName) cachedStartCascadeStage = null;
                lastSpecErr = specErr;
                fallbackNotes.push(`stage${si + 1}:${String(specErr && specErr.message ? specErr.message : specErr)}`);
              }
            }
            if (fallbackNotes.length > 0) {
              W.__agPrismSidebarLastStartFallback = fallbackNotes.join(' | ');
            }
            if (lastSpecErr) {
              W.__agPrismSidebarLastStartStage = 'rejected-fail-closed';
              throw new Error(
                `chat-isolation-spec-rejected: ${String(lastSpecErr && lastSpecErr.message ? lastSpecErr.message : lastSpecErr)}`
              );
            }
            const finalCid =
              typeof out?.cascadeId === 'string' && out.cascadeId.trim() ? out.cascadeId.trim() : draftCid;
            const knownIds = new Set(catalogItems.map((x) => x.cascadeId));
            if (knownIds.has(finalCid)) return { ok: false, error: 'reserved-id-already-visible' };
            const rec = { cascadeId: finalCid, hidden: true };
            setBoundedMapEntry(host.reservedMap, idempotencyKey, rec);
            return { ok: true, ...rec, replayed: false };
          } catch (err) {
            const msg = String(err && err.message ? err.message : err);
            W.__agPrismSidebarLastSendError = `startCascade:${msg}`;
            return { ok: false, error: msg };
          }
        },
        deliverFirstMessage: async ({ idempotencyKey, cascadeId, message, scopeRef, kind, dirPath, modelId, effort }) => {
          if (host.deliveredMap.has(idempotencyKey)) {
            return { status: 'delivered', cascadeId, replayed: true };
          }
          const convSvc = getHostConversationService();
          const sendFn = convSvc && (convSvc.deliverFirstMessage || convSvc.sendMessage);
          if (typeof sendFn === 'function') {
            try {
              const out = await sendFn.call(convSvc, {
                idempotencyKey,
                cascadeId,
                message,
                scopeRef,
                kind,
                dirPath,
                modelId,
                effort,
              });
              if (out && out.status === 'delivered' && out.cascadeId === cascadeId) {
                setBoundedMapEntry(host.deliveredMap, idempotencyKey, { cascadeId });
                return { status: 'delivered', cascadeId, replayed: Boolean(out.replayed) };
              }
              if (out && out.status === 'not-received') {
                return { status: 'not-received', cascadeId };
              }
              return { status: 'ambiguous', cascadeId };
            } catch {
              return { status: 'ambiguous', cascadeId };
            }
          }
          const ls = getHostLsClient();
          if (ls && typeof ls.sendUserCascadeMessage === 'function') {
            try {
              const modelEnum = resolveModelEnum(modelId || selectedModel, effort || selectedEffort);
              if (typeof modelEnum === 'number' && host.store && typeof host.store.dispatch === 'function') {
                try {
                  host.store.dispatch({
                    type: 'modelSelection/modelPicked',
                    payload: { conversationId: cascadeId, model: modelEnum },
                  });
                } catch {}
              }
              const iso = buildChatIsolationBundle(kind, modelEnum, null, { dirPath });
              const stagedAtts = Array.isArray(host.pendingFirstAttachments) ? host.pendingFirstAttachments.slice() : [];
              const textParts = [String(message)];
              const mediaList = [];
              for (let ai = 0; ai < stagedAtts.length; ai++) {
                const att = stagedAtts[ai];
                if (att && att.bytes instanceof Uint8Array && att.mimeType) {
                  mediaList.push({
                    mimeType: att.mimeType,
                    displayName: att.name || 'attachment',
                    payload: { case: 'inlineData', value: att.bytes },
                  });
                } else if (att && typeof att.textContent === 'string') {
                  textParts.push(`\n\n[附件：${att.name || 'file'}]\n\`\`\`\n${att.textContent.slice(0, 24000)}\n\`\`\``);
                }
              }
              const sendBase = {
                cascadeId,
                items: [{ chunk: { case: 'text', value: textParts.join('') } }],
                ...(mediaList.length > 0 ? { media: mediaList } : {}),
                clientMessageId: String(idempotencyKey || ''),
                cascadeConfig: iso.cascadeConfig,
              };
              try {
                await ls.sendUserCascadeMessage(sendBase);
              } catch (sendWithCustomErr) {
                const scode = sendWithCustomErr && (sendWithCustomErr.code ?? sendWithCustomErr.rawCode);
                if (scode === 3 || scode === 'invalid_argument') {
                  const fallbackPlanner = { ...iso.cascadeConfig.plannerConfig };
                  delete fallbackPlanner.plannerTypeConfig;
                  W.__agPrismSidebarLastSendFallback = String(sendWithCustomErr?.message || sendWithCustomErr);
                  await ls.sendUserCascadeMessage({
                    ...sendBase,
                    cascadeConfig: {
                      ...iso.cascadeConfig,
                      plannerConfig: fallbackPlanner,
                    },
                  });
                } else {
                  throw sendWithCustomErr;
                }
              }
              host.pendingFirstAttachments = [];
              setBoundedMapEntry(host.deliveredMap, idempotencyKey, { cascadeId });
              return { status: 'delivered', cascadeId, replayed: false };
            } catch (err) {
              const msg = String(err && err.message ? err.message : err);
              const code = err && (err.code ?? err.rawCode);
              W.__agPrismSidebarLastSendError = `sendUserCascadeMessage:${code ?? ''}:${msg}`;
              // 仅明确前置参数/不存在错误返回 not-received，网络或未知异常保守返回 ambiguous 严禁盲目重发
              if (code === 3 || code === 5 || code === 'invalid_argument' || code === 'not_found') {
                return { status: 'not-received', cascadeId };
              }
              return { status: 'ambiguous', cascadeId };
            }
          }
          const curPath =
            (host.router && host.router.state && host.router.state.location && host.router.state.location.pathname) ||
            (typeof W.location === 'object' && W.location ? W.location.pathname : '');
          const expectedPath = `/c/${encodeURIComponent(cascadeId)}`;
          if (curPath !== expectedPath && curPath !== `/c/${cascadeId}`) {
            return { status: 'not-received', cascadeId };
          }
          const nativeInput = document.querySelector('[data-testid="agent-input-box"] [contenteditable="true"], [data-testid="agent-input-box"] textarea');
          if (!nativeInput) {
            return { status: 'not-received', cascadeId };
          }
          try {
            nativeInput.focus();
            if (nativeInput.tagName === 'TEXTAREA') {
              nativeInput.value = message;
              nativeInput.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
              nativeInput.textContent = message;
              nativeInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
            const sendBtn = document.querySelector('[data-testid="send-button"], [data-testid="agent-input-box"] button[type="submit"]');
            if (sendBtn && !sendBtn.disabled) {
              sendBtn.click();
              setBoundedMapEntry(host.deliveredMap, idempotencyKey, { cascadeId });
              return { status: 'delivered', cascadeId, replayed: false };
            }
            return { status: 'ambiguous', cascadeId };
          } catch {
            return { status: 'ambiguous', cascadeId };
          }
        },
        checkDeliveryStatus: async ({ idempotencyKey, cascadeId }) => {
          if (host.deliveredMap.has(idempotencyKey)) {
            return { ok: true, delivered: true, confirmedNotReceived: false, cascadeId };
          }
          return { ok: true, delivered: false, confirmedNotReceived: false, cascadeId };
        },
        updateConversationAnnotations: async ({ cascadeId, annotations }) => {
          const ls = getHostLsClient();
          const wrap = host.lsWrapper;
          try {
            if (wrap && typeof wrap.updateConversationAnnotations === 'function') {
              await wrap.updateConversationAnnotations([cascadeId], annotations || {}, true);
              return { ok: true, cascadeId };
            }
            if (ls && typeof ls.updateConversationAnnotations === 'function') {
              await ls.updateConversationAnnotations({
                cascadeIds: [cascadeId],
                annotations: annotations || {},
                mergeAnnotations: true,
              });
              return { ok: true, cascadeId };
            }
            return { ok: false, error: 'host-annotations-api-unavailable' };
          } catch (err) {
            return { ok: false, error: String(err && err.message ? err.message : err) };
          }
        },
        deleteConversation: async ({ cascadeId }) => {
          const ls = getHostLsClient();
          const wrap = host.lsWrapper;
          try {
            if (wrap && typeof wrap.deleteCascadeTrajectory === 'function') {
              await wrap.deleteCascadeTrajectory(cascadeId);
              return { ok: true, cascadeId };
            }
            if (ls && typeof ls.deleteCascadeTrajectory === 'function') {
              await ls.deleteCascadeTrajectory({ cascadeId });
              return { ok: true, cascadeId };
            }
            return { ok: false, error: 'host-delete-api-unavailable' };
          } catch (err) {
            return { ok: false, error: String(err && err.message ? err.message : err) };
          }
        },
        cancelConversation: async ({ cascadeId }) => {
          const ls = getHostLsClient();
          const wrap = host.lsWrapper;
          try {
            if (wrap && typeof wrap.cancelCascadeInvocation === 'function') {
              await wrap.cancelCascadeInvocation({ cascadeId });
              return { ok: true, cascadeId };
            }
            if (ls && typeof ls.cancelCascadeInvocation === 'function') {
              await ls.cancelCascadeInvocation({ cascadeId });
              return { ok: true, cascadeId };
            }
            return { ok: false, error: 'host-cancel-api-unavailable' };
          } catch (err) {
            return { ok: false, error: String(err && err.message ? err.message : err) };
          }
        },
      };
    }

    function callDaemonRpc(action, payload, extra) {
      if (currentCfg.sidebarStudio !== 'on') {
        return Promise.resolve({ ok: false, disabled: true });
      }
      const bridge = W.__agPrismSidebarBridge;
      if (!bridge || typeof bridge.call !== 'function' || !bridge.isOnline()) {
        return Promise.resolve({ ok: false, offline: true });
      }
      const next = rpcQueue.then(async () => {
        if (destroyed) return { ok: false, disposed: true };
        const req = {
          version: 2,
          action,
          requestId: `sb-live-${Date.now()}-${reqSeq++}`,
          storeId: snapshot ? snapshot.storeId : undefined,
          baseRev: snapshot ? snapshot.rev : undefined,
          payload: payload && typeof payload === 'object' ? { ...payload } : {},
          ...(extra || {}),
        };
        if (snapshot) {
          if (Object.prototype.hasOwnProperty.call(req.payload, 'navRev')) req.payload.navRev = snapshot.navRev;
          if (Object.prototype.hasOwnProperty.call(req.payload, 'draftRev')) req.payload.draftRev = snapshot.draftRev;
        }
        const res = await bridge.call(req, action === 'pick-project-directory' ? 120000 : 15000);
        if (res && res.snapshot) {
          snapshot = res.snapshot;
        }
        if (res && !res.ok && res.error && res.error.message && action !== 'sync-catalog' && action !== 'get-state') {
          showToast(res.error.message);
        }
        if (action !== 'sync-catalog' && snapshot && doesDaemonNeedSync(getLiveCapabilities())) {
          scheduleCatalogSync();
        }
        renderAll();
        return res;
      });
      rpcQueue = next.catch(() => {});
      return next;
    }

    function doesDaemonNeedSync(caps) {
      if (!snapshot) return true;
      if (snapshot.catalogHealth !== 'ready') return true;
      const dCaps = snapshot.capabilities || {};
      if (caps.projectPermissions && !dCaps.projectPermissions) return true;
      if (caps.perCascadeIsolation && !dCaps.perCascadeIsolation) return true;
      return false;
    }

    function syncCatalogNow() {
      refreshLiveGeminiModels();
      const cat = readLiveCatalogSnapshot();
      const caps = getLiveCapabilities();
      const sig = JSON.stringify([
        cat.health,
        cat.items.map((x) => `${x.cascadeId}:${x.status}:${x.updatedAt}:${x.title}`),
        cat.codeWorkspacePaths,
        (cat.hostProjects || []).map((p) => `${p.id}:${p.path}`),
        caps,
      ]);
      if (sig === lastSyncCatalogSig && !doesDaemonNeedSync(caps)) {
        return Promise.resolve({ ok: true, skipped: true });
      }
      return callDaemonRpc('sync-catalog', {
        catalog: { health: cat.health, items: cat.items },
        codeWorkspacePaths: cat.codeWorkspacePaths,
        hostProjects: cat.hostProjects || [],
        capabilities: caps,
      }).then((res) => {
        if (res && res.ok) {
          lastSyncCatalogSig = sig;
        }
        return res;
      });
    }

    function scheduleCatalogSync() {
      if (destroyed || (typeof document !== 'undefined' && document.hidden)) return;
      if (syncTimer) return;
      const delay = !lastSyncCatalogSig || host.circuitTripped ? 60 : 280;
      syncTimer = setTimeout(() => {
        syncTimer = null;
        if (destroyed || (typeof document !== 'undefined' && document.hidden)) return;
        void syncCatalogNow();
      }, delay);
    }

    // TanStack Router 对象参数路由（严格修复字符串 navigate 无效问题）+ 原生行激活兜底
    function navigateHostRoute(viewPath) {
      if (!viewPath || typeof viewPath !== 'string') return;
      lastNavigatedRoute = viewPath;
      const cidMatch = viewPath.match(/^\/c\/([^/?#]+)/);
      const cascadeId = cidMatch ? decodeURIComponent(cidMatch[1]) : '';

      if (cascadeId) {
        // 1) 若原生侧栏虚拟列表中恰好渲染了该会话行，优先触发原生链接以同步全部 Redux 选中态
        try {
          const rows = document.querySelectorAll('[data-testid="conversation-row-sidebar"]');
          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (row.getAttribute('data-cascade-id') === cascadeId) {
              const link = row.querySelector('a[href]');
              if (link && typeof link.click === 'function') {
                link.click();
                return;
              }
            }
          }
        } catch {}
        // 2) 使用 TanStack Router 官方对象签名跳转，并保底尝试同步 Redux 选中态
        if (host.router && typeof host.router.navigate === 'function') {
          try {
            void host.router.navigate({ to: '/c/$cascadeId', params: { cascadeId } });
          } catch {
            try { void host.router.navigate({ to: `/c/${encodeURIComponent(cascadeId)}` }); } catch {}
          }
        }
      } else if (viewPath === '/') {
        if (host.router && typeof host.router.navigate === 'function') {
          try {
            void host.router.navigate({ to: '/' });
          } catch {}
        }
      }
      try {
        W.__agPrism?.sync?.();
      } catch {}
    }

    let cachedSidebarSlots = null;
    function invalidateSidebarSlotsCache() {
      cachedSidebarSlots = null;
    }

    // 精准探测原生侧栏容器与内容区（100% 保留原生顶栏、底栏与 Code 列表！）
    function resolveNativeSidebarSlots() {
      const nativeList = document.querySelector('[data-testid="conversation-list-sidebar"]');
      if (!nativeList || !nativeList.parentElement) {
        cachedSidebarSlots = null;
        return null;
      }
      const nav =
        document.querySelector('div[role="navigation"][aria-label="Sidebar"]') ||
        (typeof nativeList.closest === 'function' ? nativeList.closest('[role="navigation"]') : null) ||
        nativeList.parentElement;
      if (!nav) {
        cachedSidebarSlots = null;
        return null;
      }

      if (
        cachedSidebarSlots &&
        cachedSidebarSlots.nav === nav &&
        cachedSidebarSlots.nativeList === nativeList &&
        nav.isConnected !== false &&
        nativeList.isConnected !== false &&
        cachedSidebarSlots.childCount === (nav.childElementCount ?? nav.children.length) &&
        cachedSidebarSlots.firstChild === nav.firstElementChild &&
        cachedSidebarSlots.lastChild === nav.lastElementChild &&
        cachedSidebarSlots.codeBodySlots.every((n) => n && n.isConnected !== false)
      ) {
        return {
          nav: cachedSidebarSlots.nav,
          nativeList: cachedSidebarSlots.nativeList,
          headerSlot: cachedSidebarSlots.headerSlot,
          codeBodySlots: cachedSidebarSlots.codeBodySlots,
        };
      }

      const navRect = nav.getBoundingClientRect();
      if (!navRect || navRect.height < 120) {
        cachedSidebarSlots = null;
        return null;
      }

      const rawChildren = Array.from(nav.children).filter(
        (c) => c && c.getAttribute && c.getAttribute(ROOT_ATTR) !== '1'
      );

      let headerSlot = null;
      let codeBodySlots = [];

      // 真实宿主布局：6 块（顶栏 40px、导航按钮区、上分割线、列表滚动区、下分割线、底栏 Customizations）
      if (rawChildren.length >= 4 && rawChildren[0] && !rawChildren[0].contains(nativeList)) {
        headerSlot = rawChildren[0];
        let endIdx = rawChildren.length;
        // 保留原生底栏（Customizations 按钮及紧邻其上的 1px 分割线）
        const last = rawChildren[endIdx - 1];
        if (last && !last.contains(nativeList)) {
          const lr = last.getBoundingClientRect();
          if (lr && lr.height > 0 && lr.height <= 80) {
            endIdx -= 1;
            const prev = rawChildren[endIdx - 1];
            if (prev && !prev.contains(nativeList)) {
              const pr = prev.getBoundingClientRect();
              if (pr && pr.height <= 4) endIdx -= 1;
            }
          }
        }
        codeBodySlots = rawChildren.slice(1, endIdx);
      } else {
        // 兜底结构（例如轻 DOM 测试环境）
        codeBodySlots = [nativeList];
      }

      if (codeBodySlots.length === 0) codeBodySlots = [nativeList];
      cachedSidebarSlots = {
        nav,
        nativeList,
        headerSlot,
        codeBodySlots,
        childCount: nav.childElementCount ?? nav.children.length,
        firstChild: nav.firstElementChild,
        lastChild: nav.lastElementChild,
      };
      return { nav, nativeList, headerSlot, codeBodySlots };
    }

    function canEngageStudioSidebar() {
      if (destroyed || currentCfg.sidebarStudio !== 'on') return false;
      const bridge = W.__agPrismSidebarBridge;
      if (!bridge || !bridge.isOnline() || !snapshot) return false;
      const slots = resolveNativeSidebarSlots();
      if (!slots) return false;

      // 防空屏硬熔断：仅在无法读到目录且原生有行时，若切到 Chat 模式保护不盲隐藏
      if (snapshot.activeMode === 'code') {
        const nativeRows = slots.nativeList.querySelectorAll('[data-testid="conversation-row-sidebar"], button[data-cascade-id], a[href^="/c/"]');
        if (nativeRows.length > 0 && catalogItems.length === 0) {
          host.circuitTripped = true;
          return false;
        }
      }
      host.circuitTripped = false;
      host.navEl = slots.nav;
      host.nativeListEl = slots.nativeList;
      return slots;
    }

    function restoreNativeSidebarVisibility() {
      for (let i = 0; i < host.parkedNativeNodes.length; i++) {
        const n = host.parkedNativeNodes[i];
        if (n && n.classList) n.classList.remove('ag-prism-sb-native-hidden');
      }
      host.parkedNativeNodes = [];
      try {
        document.querySelectorAll('.ag-prism-chat-row-hidden').forEach((row) => {
          row.classList.remove('ag-prism-chat-row-hidden');
        });
      } catch {}
    }

    function disengageStudioSidebar() {
      invalidateSidebarSlotsCache();
      lastChatListRenderSig = '';
      runGuarded(() => {
        restoreNativeSidebarVisibility();
        if (host.modeDockEl) {
          host.modeDockEl.remove();
          host.modeDockEl = null;
          host.modeDockRefs = null;
        }
        if (host.chatPaneEl) {
          host.chatPaneEl.remove();
          host.chatPaneEl = null;
          host.chatPaneRefs = null;
        }
        if (host.chatHomeEl) {
          host.chatHomeEl.setAttribute('data-visible', '0');
        }
        if (host.composerChipEl) {
          host.composerChipEl.remove();
          host.composerChipEl = null;
        }
        if (host.topbarActsEl) {
          host.topbarActsEl.remove();
          host.topbarActsEl = null;
        }
        syncChatPulseMinimalStyle(false);
        if (document.documentElement) {
          document.documentElement.removeAttribute('data-ag-prism-mode');
          document.documentElement.removeAttribute('data-ag-prism-chat-kind');
          document.documentElement.removeAttribute('data-ag-prism-chat-telemetry');
        }
        host.engaged = false;
      });
    }

    function resolveRunningSessionModelId(cid) {
      const ov = cid ? sessionModelOverrides.get(cid) : null;
      if (ov && ov.modelId) return ov.modelId;
      const trig = document.querySelector('#antigravity\\.agentSidePanelInputBox [data-testid="model-selector-trigger"]');
      const txt = (trig && (trig.getAttribute('aria-label') || trig.textContent) || '').toLowerCase();
      const models = liveGeminiModels && liveGeminiModels.length ? liveGeminiModels : DEFAULT_GEMINI_MODELS;
      for (let i = 0; i < models.length; i++) {
        if (txt.includes(models[i].id.toLowerCase())) return models[i].id;
      }
      return selectedModel;
    }

    function openModelMenu(anchorEl, opts) {
      refreshLiveGeminiModels();
      const isRunning = Boolean(opts && opts.runningSession);
      const runningCid = isRunning && typeof opts.cascadeId === 'string' ? opts.cascadeId : '';
      const models = liveGeminiModels && liveGeminiModels.length ? liveGeminiModels : DEFAULT_GEMINI_MODELS;
      const currentModelId = isRunning ? resolveRunningSessionModelId(runningCid) : selectedModel;
      const isEn = getCurrentLang() === 'en';
      const pop = el('div', 'ag-prism-sidebar-popover ag-prism-model-popover');
      pop.setAttribute('data-testid', isRunning ? 'prism-chat-running-model-menu' : 'prism-chat-home-model-menu');
      pop.appendChild(
        el(
          'div',
          'ag-prism-menu-note',
          isRunning
            ? isEn ? 'Gemini Models' : 'Gemini 模型'
            : isEn ? 'Gemini Models' : 'Gemini 模型'
        )
      );

      for (let i = 0; i < models.length; i++) {
        const m = models[i];
        const isSel = currentModelId === m.id;
        const opt = el('button', 'ag-prism-model-opt');
        opt.type = 'button';
        opt.setAttribute('data-selected', isSel ? '1' : '0');
        opt.setAttribute('data-model-id', m.id);

        const lead = el('span', 'ag-prism-model-lead');
        const ic = el('span', 'ag-prism-model-icon');
        ic.appendChild(makeBrandSvg(OFFICIAL_GEMINI_COLOR_SVG, 15));
        lead.appendChild(ic);

        const txt = el('span', 'ag-prism-model-text');
        txt.appendChild(el('span', 'ag-prism-model-name', m.id));
        txt.appendChild(el('span', 'ag-prism-model-desc', isEn ? m.descEn || m.desc : m.desc));
        lead.appendChild(txt);
        opt.appendChild(lead);

        if (isSel) {
          const ck = el('span', 'ag-prism-model-check');
          ck.appendChild(makeMonoSvg('check', 13));
          opt.appendChild(ck);
        }

        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          if (isRunning) {
            const eff = m.defaultEffort || (m.id.includes('3.8') ? 'Medium' : 'High');
            const modelEnum = resolveModelEnum(m.id, eff);
            selectedModel = m.id;
            selectedEffort = eff;
            if (runningCid && typeof modelEnum === 'number') {
              setBoundedMapEntry(sessionModelOverrides, runningCid, { modelId: m.id, effort: eff, modelEnum });
              if (host.store && typeof host.store.dispatch === 'function') {
                try {
                  host.store.dispatch({
                    type: 'modelSelection/modelPicked',
                    payload: { conversationId: runningCid, model: modelEnum },
                  });
                } catch {}
              }
            }
            closePopover();
            showToast(`已切换为 ${m.id}`);
          } else {
            selectedModel = m.id;
            const allowed = Array.isArray(m.efforts) && m.efforts.length ? m.efforts : ['Low', 'Medium', 'High'];
            if (!allowed.includes(selectedEffort)) {
              selectedEffort = m.defaultEffort || allowed[allowed.length - 1] || 'High';
            }
            closePopover();
            renderChatHome();
          }
        });
        pop.appendChild(opt);
      }

      if (!isRunning) {
        pop.appendChild(el('div', 'ag-prism-menu-sep'));
        pop.appendChild(el('div', 'ag-prism-menu-note', isEn ? 'Thinking Effort' : '思考强度'));

        const curObj = models.find((x) => x.id === selectedModel) || models[0];
        const allowedEfforts = Array.isArray(curObj.efforts) && curObj.efforts.length ? curObj.efforts : ['Low', 'Medium', 'High'];
        const row = el('div', 'ag-prism-effort-pills');
        row.style.gridTemplateColumns = `repeat(${allowedEfforts.length}, minmax(0, 1fr))`;

        for (let i = 0; i < CHAT_EFFORT_TIERS.length; i++) {
          const tier = CHAT_EFFORT_TIERS[i];
          if (!allowedEfforts.includes(tier.id)) continue;
          const b = el('button', 'ag-prism-effort-pill', isEn ? tier.id : tier.fullLabel);
          b.type = 'button';
          b.setAttribute('data-active', selectedEffort === tier.id ? '1' : '0');
          b.addEventListener('click', (e) => {
            e.stopPropagation();
            selectedEffort = tier.id;
            closePopover();
            renderChatHome();
          });
          row.appendChild(b);
        }
        pop.appendChild(row);
      }
      mountPopover(pop, anchorEl, true);
    }

    function openSparkProjectMenu(anchorEl) {
      const pop = el('div', 'ag-prism-sidebar-popover');
      const projects = (snapshot && snapshot.sparkProjects) || [];
      for (let i = 0; i < projects.length; i++) {
        const p = projects[i];
        const btn = el('button', 'ag-prism-menu-btn');
        btn.type = 'button';
        btn.appendChild(el('span', '', p.name));
        if (snapshot.chatDraft?.sparkProjectId === p.id) btn.appendChild(el('span', 'ag-prism-sb-row-tag', '当前'));
        else if (p.sharedWithCode) btn.appendChild(el('span', 'ag-prism-sb-row-tag', '共享'));
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          closePopover();
          void callDaemonRpc('set-chat-draft', {
            draft: { kind: 'spark', folderId: null, sparkProjectId: p.id },
            navRev: snapshot.navRev,
            draftRev: snapshot.draftRev,
          });
        });
        pop.appendChild(btn);
      }
      if (projects.length) pop.appendChild(el('div', 'ag-prism-menu-sep'));
      const pickBtn = el('button', 'ag-prism-menu-btn', '选择本地目录…');
      pickBtn.type = 'button';
      pickBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        closePopover();
        const picked = await callDaemonRpc('pick-project-directory', {});
        if (picked && picked.ok && picked.result && picked.result.selectionToken) {
          await callDaemonRpc('select-spark-project', {
            selectionToken: picked.result.selectionToken,
            navRev: snapshot.navRev,
            draftRev: snapshot.draftRev,
          });
        }
      });
      pop.appendChild(pickBtn);
      const boxBtn = el('button', 'ag-prism-menu-btn', '新建工作文件夹');
      boxBtn.type = 'button';
      boxBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closePopover();
        inlineBoxOpen = true;
        renderChatSidebarList();
      });
      pop.appendChild(boxBtn);
      mountPopover(pop, anchorEl, true);
    }

    function resolveActiveChatKind() {
      if (!snapshot || snapshot.activeMode !== 'chat') return 'pure';
      const view = snapshot.currentView || '/';
      const m = view.match(/^\/c\/([^/?#]+)/);
      if (m) {
        const cid = decodeURIComponent(m[1]);
        const assign = snapshot.assignments && snapshot.assignments[cid];
        if (assign && assign.placement && assign.placement.kind === 'spark') return 'spark';
        return 'pure';
      }
      return snapshot.chatDraft && snapshot.chatDraft.kind === 'spark' ? 'spark' : 'pure';
    }

    function formatPolicySummary(kindKey) {
      const policy = getEffectiveChatPolicy();
      const isSpark = kindKey === 'spark';
      const mp = isSpark ? policy.spark : policy.pure;
      const parts = [];
      if (!isSpark && mp.zeroTools) {
        parts.push('纯文本零工具');
      } else {
        if (isSpark && mp.fileAccess) parts.push('受控文件');
        if (isSpark && mp.schedule) parts.push('日程定时');
        if (mp.webSearch) parts.push('联网搜索');
        if (mp.imageAndFiles) parts.push('生图/附件');
        const pCnt = (mp.allowedPlugins || []).length;
        const mCnt = (mp.allowedMcps || []).length;
        if (pCnt > 0) parts.push(`${pCnt} 项插件`);
        if (mCnt > 0) parts.push(`${mCnt} 项工具服务`);
        if (parts.length === 0) parts.push('无外部工具');
      }
      if (mp.keepUserRules) parts.push('通用规则');
      return `${isSpark ? 'Spark 文件整理' : 'Pure 日常对话'} · ${parts.join(' / ')}（点击管理能力与扩展）`;
    }

    function countPolicyWhitelistTotal() {
      const policy = getEffectiveChatPolicy();
      const set = new Set([
        ...(policy.pure.allowedPlugins || []).map((x) => `p:${x}`),
        ...(policy.pure.allowedMcps || []).map((x) => `m:${x}`),
        ...(policy.spark.allowedPlugins || []).map((x) => `p:${x}`),
        ...(policy.spark.allowedMcps || []).map((x) => `m:${x}`),
      ]);
      return set.size;
    }

    function syncChatPulseMinimalStyle(active) {
      const pulse = document.getElementById('ag-prism-pulse-bar') || document.getElementById('ag-pulse-status-bar');
      if (!pulse) return;
      if (!active) {
        pulse.removeAttribute('data-ag-chat-minimal');
        try {
          pulse.style.removeProperty('--ag-chat-pulse-bg');
          pulse.style.removeProperty('--ag-chat-pulse-fg');
          pulse.style.removeProperty('--ag-chat-pulse-bd');
        } catch {}
        if (pulse.shadowRoot) {
          const st = pulse.shadowRoot.getElementById(CHAT_PULSE_MINIMAL_STYLE_ID);
          if (st) st.remove();
        }
        return;
      }
      pulse.setAttribute('data-ag-chat-minimal', '1');
      const isLight = Boolean(
        (document.documentElement &&
          (document.documentElement.classList.contains('light') ||
            document.documentElement.getAttribute('data-theme') === 'light' ||
            document.documentElement.getAttribute('data-ag-cs-theme') === 'light')) ||
          (document.body &&
            (document.body.classList.contains('theme-light') ||
              document.body.classList.contains('light-theme') ||
              document.body.classList.contains('light')))
      );
      try {
        pulse.style.setProperty('--ag-chat-pulse-bg', isLight ? '#ffffff' : '#1d1e22');
        pulse.style.setProperty('--ag-chat-pulse-fg', isLight ? '#1f1f1f' : '#e3e3e3');
        pulse.style.setProperty('--ag-chat-pulse-bd', isLight ? 'rgba(15,23,42,.12)' : 'rgba(255,255,255,.11)');
      } catch {}
      if (pulse.shadowRoot) {
        let st = pulse.shadowRoot.getElementById(CHAT_PULSE_MINIMAL_STYLE_ID);
        if (!st) {
          st = document.createElement('style');
          st.id = CHAT_PULSE_MINIMAL_STYLE_ID;
          st.textContent = CHAT_PULSE_MINIMAL_SHADOW_CSS;
          pulse.shadowRoot.appendChild(st);
        } else if (st.textContent !== CHAT_PULSE_MINIMAL_SHADOW_CSS) {
          st.textContent = CHAT_PULSE_MINIMAL_SHADOW_CSS;
        }
        // 确保 Chat 极简卡内始终展示 Gemini 额度，不停留在 Claude 标签
        try {
          const qtabs = pulse.shadowRoot.querySelector('[data-ag-pulse-qtabs]');
          if (qtabs) {
            const gemBtn = Array.from(qtabs.querySelectorAll('button')).find((b) =>
              /gemini/i.test(b.textContent || '')
            );
            if (gemBtn && gemBtn.getAttribute('aria-pressed') !== 'true' && !gemBtn.classList.contains('active')) {
              gemBtn.click();
            }
          }
        } catch {}
      }
    }

    function findSidebarChatItemById(cid) {
      if (!cid || !snapshot || !snapshot.chatSidebar) return null;
      const sb = snapshot.chatSidebar;
      const pools = [
        ...(sb.knowledge?.rootItems || []),
        ...((sb.knowledge?.folders || []).flatMap((f) => f.items || [])),
        ...((sb.spark?.projects || []).flatMap((p) => p.items || [])),
        ...(sb.archived?.items || []),
      ];
      return pools.find((x) => x && x.cascadeId === cid) || null;
    }

    function syncChatTopbarActs(onRunningChat, activeCid) {
      if (!onRunningChat || !activeCid) {
        if (host.topbarActsEl) {
          host.topbarActsEl.remove();
          host.topbarActsEl = null;
        }
        return;
      }
      const anchor =
        document.querySelector('[data-testid="toggle-overview-panel"]')?.parentElement ||
        document.querySelector('[data-testid="titlebar-more-actions"]')?.parentElement ||
        null;
      if (!anchor) return;
      let bar = host.topbarActsEl;
      if (!bar || !bar.isConnected || bar.parentElement !== anchor) {
        if (bar) bar.remove();
        bar = markOwnedRoot(el('div', 'ag-prism-chat-topbar-acts'));
        bar.setAttribute('data-testid', 'prism-chat-topbar-acts');

        const pinBtn = el('button', 'ag-prism-chat-topbar-btn');
        pinBtn.type = 'button';
        pinBtn.appendChild(makeMonoSvg('pin', 14));
        const renameBtn = el('button', 'ag-prism-chat-topbar-btn');
        renameBtn.type = 'button';
        renameBtn.title = '重命名对话';
        renameBtn.appendChild(makeMonoSvg('edit', 13.5));
        const expBtn = el('button', 'ag-prism-chat-topbar-btn');
        expBtn.type = 'button';
        expBtn.title = '导出为 Markdown';
        expBtn.appendChild(makeMonoSvg('download', 13.5));
        const newBtn = el('button', 'ag-prism-chat-topbar-btn');
        newBtn.type = 'button';
        newBtn.title = '新建对话';
        newBtn.appendChild(makeMonoSvg('plus', 14.5));

        bar._refs = { pinBtn, renameBtn, expBtn, newBtn };
        pinBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const curItem = findSidebarChatItemById(bar._cid);
          if (!curItem) return;
          void callDaemonRpc('pin-chat-session', { cascadeId: curItem.cascadeId, pinned: !curItem.pinned });
        });
        renameBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const curItem = findSidebarChatItemById(bar._cid);
          if (!curItem) return;
          openRenameModal('重命名对话', curItem.title || '', '输入新对话标题…', (newTitle) => {
            void callDaemonRpc('rename-chat-session', { cascadeId: curItem.cascadeId, title: newTitle });
          });
        });
        expBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const curItem = findSidebarChatItemById(bar._cid) || { cascadeId: bar._cid, title: bar._cid };
          void exportChatMarkdown(curItem);
        });
        newBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          greetingSeed = Math.floor(Math.random() * 100);
          void callDaemonRpc('navigate', { mode: 'chat', view: '/', navRev: snapshot.navRev });
          navigateHostRoute('/');
        });

        bar.appendChild(pinBtn);
        bar.appendChild(renameBtn);
        bar.appendChild(expBtn);
        bar.appendChild(newBtn);
        anchor.appendChild(bar);
        host.topbarActsEl = bar;
      }
      bar._cid = activeCid;
      const item = findSidebarChatItemById(activeCid);
      bar._refs.pinBtn.setAttribute('data-active', item && item.pinned ? '1' : '0');
      bar._refs.pinBtn.title = item && item.pinned ? '取消置顶' : '置顶对话';
    }

    function syncChatComposerChrome(scheduleRetry) {
      if (destroyed) return;
      runGuarded(() => {
        const policy = getEffectiveChatPolicy();
        const isChat = Boolean(host.engaged && snapshot && snapshot.activeMode === 'chat');
        const chatKind = resolveActiveChatKind();
        if (document.documentElement) {
          if (isChat) {
            document.documentElement.setAttribute('data-ag-prism-chat-kind', chatKind);
            document.documentElement.setAttribute(
              'data-ag-prism-chat-telemetry',
              policy.showTelemetryAboveComposer ? 'on' : 'off'
            );
          } else {
            document.documentElement.removeAttribute('data-ag-prism-chat-kind');
            document.documentElement.removeAttribute('data-ag-prism-chat-telemetry');
          }
        }

        if (host.chatPaneRefs && host.chatPaneRefs.policyCnt) {
          const totalWl = countPolicyWhitelistTotal();
          host.chatPaneRefs.policyCnt.textContent = totalWl > 0 ? `${totalWl}` : '';
        }

        const curView = (snapshot && snapshot.currentView) || '/';
        const mCid = curView.match(/^\/c\/([^/?#]+)/);
        const activeCid = mCid ? decodeURIComponent(mCid[1]) : '';
        const onRunningChat = isChat && Boolean(activeCid);
        syncChatPulseMinimalStyle(onRunningChat);
        syncChatTopbarActs(onRunningChat, activeCid);

        if (!onRunningChat) {
          if (host.composerChipEl) {
            host.composerChipEl.remove();
            host.composerChipEl = null;
          }
          return;
        }

        const box = document.getElementById('antigravity.agentSidePanelInputBox');
        const pulseReady = Boolean(document.getElementById('ag-prism-pulse-bar') || document.getElementById('ag-pulse-status-bar'));
        const topbarReady = Boolean(host.topbarActsEl && host.topbarActsEl.isConnected);
        if ((!box || !pulseReady || !topbarReady) && scheduleRetry && !composerChipTimer) {
          composerChipTimer = setTimeout(() => {
            composerChipTimer = null;
            syncChatComposerChrome(false);
          }, 320);
        }
        if (!box) {
          return;
        }

        let chip = host.composerChipEl;
        if (!chip || !chip.isConnected || chip.parentElement !== box) {
          if (chip) chip.remove();
          chip = markOwnedRoot(el('button', 'ag-prism-chat-policy-chip'));
          chip.type = 'button';
          chip.setAttribute('data-testid', 'prism-chat-policy-chip');
          const dot = el('span', 'ag-prism-chat-policy-dot');
          const lbl = el('span', '', '');
          chip.appendChild(dot);
          chip.appendChild(lbl);
          chip._lbl = lbl;
          chip.addEventListener('click', (e) => {
            e.stopPropagation();
            openChatPolicyModal(resolveActiveChatKind());
          });
          box.appendChild(chip);
          host.composerChipEl = chip;
        }

        chip.setAttribute('data-kind', chatKind);
        const mp = chatKind === 'spark' ? policy.spark : policy.pure;
        const wlCount = (mp.allowedPlugins || []).length + (mp.allowedMcps || []).length;
        const labelText =
          chatKind === 'spark'
            ? wlCount > 0 ? `Spark · +${wlCount}` : 'Spark'
            : mp.zeroTools
              ? 'Pure · 纯文本'
              : wlCount > 0 ? `Pure · +${wlCount}` : 'Pure';
        if (chip._lbl.textContent !== labelText) chip._lbl.textContent = labelText;
        chip.title = formatPolicySummary(chatKind);
      });
    }

    function openChatPolicyModal(initialTab) {
      const initPolicy = getEffectiveChatPolicy();
      const draft = {
        pure: {
          ...initPolicy.pure,
          allowedPlugins: initPolicy.pure.allowedPlugins.slice(),
          allowedMcps: initPolicy.pure.allowedMcps.slice(),
        },
        spark: {
          ...initPolicy.spark,
          allowedPlugins: initPolicy.spark.allowedPlugins.slice(),
          allowedMcps: initPolicy.spark.allowedMcps.slice(),
        },
        showTelemetryAboveComposer: initPolicy.showTelemetryAboveComposer,
        showStarterChips: initPolicy.showStarterChips,
      };
      let activeTab = initialTab === 'spark' ? 'spark' : 'pure';
      let catalogLoading = !hostCapabilities.loaded;

      const makeSwitchRow = (label, desc, checked, onToggle, tags, disabled) => {
        const row = el('div', 'ag-prism-switch-row');
        if (disabled) row.setAttribute('data-disabled', '1');
        const meta = el('div', 'ag-prism-switch-meta');
        const lblRow = el('div', 'ag-prism-switch-label');
        lblRow.appendChild(el('span', '', label));
        if (Array.isArray(tags)) {
          for (let i = 0; i < tags.length; i++) {
            const tg = tags[i];
            const pill = el('span', 'ag-prism-policy-tag', tg.text);
            if (tg.tone) pill.setAttribute('data-tone', tg.tone);
            lblRow.appendChild(pill);
          }
        }
        meta.appendChild(lblRow);
        if (desc) meta.appendChild(el('div', 'ag-prism-switch-desc', desc));
        const sw = el('span', 'ag-prism-switch');
        sw.setAttribute('data-checked', checked ? '1' : '0');
        row.appendChild(meta);
        row.appendChild(sw);
        row.addEventListener('click', () => {
          if (disabled) return;
          onToggle(!checked);
        });
        return row;
      };

      const toggleInList = (list, value, enable) => {
        const lk = value.toLowerCase();
        const next = list.filter((x) => x.toLowerCase() !== lk);
        if (enable) next.push(value);
        return next;
      };

      openModal((box, close) => {
        box.classList.add('ag-prism-modal-wide');
        const head = el('div', 'ag-prism-modal-head');
        const headText = el('div', '');
        const titleWrap = el('div', 'ag-prism-switch-label');
        titleWrap.appendChild(el('h3', 'ag-prism-modal-title', 'Chat 能力与扩展'));
        titleWrap.appendChild(el('span', 'ag-prism-sb-beta-pill', 'Beta'));
        headText.appendChild(titleWrap);
        headText.appendChild(
          el('p', 'ag-prism-modal-sub', 'Pure 与 Spark 独立配置；仅影响 Chat 对话，不会修改你的 Code 编程环境。')
        );
        const closeBtn = el('button', 'ag-prism-sb-icon-btn');
        closeBtn.type = 'button';
        closeBtn.title = '关闭';
        closeBtn.appendChild(makeMonoSvg('x', 14));
        closeBtn.addEventListener('click', () => close());
        head.appendChild(headText);
        head.appendChild(closeBtn);
        box.appendChild(head);

        const tabs = el('div', 'ag-prism-policy-tabs');
        const pureTabBtn = el('button', 'ag-prism-policy-tab', 'Pure（日常对话）');
        pureTabBtn.type = 'button';
        const sparkTabBtn = el('button', 'ag-prism-policy-tab', 'Spark（文件整理）');
        sparkTabBtn.type = 'button';
        tabs.appendChild(pureTabBtn);
        tabs.appendChild(sparkTabBtn);
        box.appendChild(tabs);

        const scrollBody = el('div', 'ag-prism-policy-scroll');
        box.appendChild(scrollBody);

        const renderBody = () => {
          pureTabBtn.setAttribute('data-active', activeTab === 'pure' ? '1' : '0');
          sparkTabBtn.setAttribute('data-active', activeTab === 'spark' ? '1' : '0');
          clearNode(scrollBody);

          const isSpark = activeTab === 'spark';
          const cur = isSpark ? draft.spark : draft.pure;
          const zeroLocked = !isSpark && cur.zeroTools;

          const secCore = el('div', 'ag-prism-policy-sec');
          secCore.appendChild(
            el('div', 'ag-prism-policy-sec-title', isSpark ? 'Spark 文件与事务能力' : 'Pure 日常对话能力')
          );

          if (!isSpark) {
            secCore.appendChild(
              makeSwitchRow(
                '联网搜索与读取网页',
                '允许按需联网检索最新资料并读取网页内容',
                cur.webSearch,
                (v) => { cur.webSearch = v; renderBody(); },
                null,
                zeroLocked
              )
            );
            secCore.appendChild(
              makeSwitchRow(
                '图片生成与附件分析',
                '支持生成配图及理解你上传的图片和文件',
                cur.imageAndFiles,
                (v) => { cur.imageAndFiles = v; renderBody(); },
                null,
                zeroLocked
              )
            );
            secCore.appendChild(
              makeSwitchRow(
                '保留我的语言与沟通偏好',
                '沿用你的通用中文表达与交流习惯，同时保持纯净对话环境',
                cur.keepUserRules,
                (v) => { cur.keepUserRules = v; renderBody(); }
              )
            );
            secCore.appendChild(
              makeSwitchRow(
                '纯文字对话模式',
                '关闭所有外部工具与扩展，仅进行纯粹的文字聊天问答',
                cur.zeroTools,
                (v) => { cur.zeroTools = v; renderBody(); }
              )
            );
          } else {
            secCore.appendChild(
              makeSwitchRow(
                '读写当前工作文件夹',
                '允许在当前选定的 Spark 文件夹内整理、编辑与归档文档',
                cur.fileAccess,
                (v) => { cur.fileAccess = v; renderBody(); }
              )
            );
            secCore.appendChild(
              makeSwitchRow(
                '日程与定时提醒',
                '支持协助安排提醒、周期日程与待办定时任务',
                cur.schedule,
                (v) => { cur.schedule = v; renderBody(); }
              )
            );
            secCore.appendChild(
              makeSwitchRow(
                '联网搜索与读取网页',
                '协助查资料、核对最新网页信息与整理摘要',
                cur.webSearch,
                (v) => { cur.webSearch = v; renderBody(); }
              )
            );
            secCore.appendChild(
              makeSwitchRow(
                '图片生成与附件分析',
                '支持生成配图及解析上传的文档、表格与截图',
                cur.imageAndFiles,
                (v) => { cur.imageAndFiles = v; renderBody(); }
              )
            );
            secCore.appendChild(
              makeSwitchRow(
                '保留我的语言与沟通偏好',
                '沿用你的交流风格偏好，同时屏蔽无关开发扩展',
                cur.keepUserRules,
                (v) => { cur.keepUserRules = v; renderBody(); }
              )
            );
            secCore.appendChild(
              makeSwitchRow(
                '安全确认保护',
                '限制在选定文件夹内工作，高风险操作前须由你确认（推荐开启）',
                cur.sandbox,
                (v) => { cur.sandbox = v; renderBody(); }
              )
            );
          }
          scrollBody.appendChild(secCore);

          const secPlugins = el('div', 'ag-prism-policy-sec');
          const pHead = el('div', 'ag-prism-policy-sec-title');
          pHead.appendChild(el('span', '', '允许的扩展插件（默认全部关闭）'));
          pHead.appendChild(
            el('span', 'ag-prism-policy-sec-cnt', `已开启 ${cur.allowedPlugins.length} / ${hostCapabilities.plugins.length}`)
          );
          secPlugins.appendChild(pHead);
          if (catalogLoading) {
            secPlugins.appendChild(el('div', 'ag-prism-policy-empty', '正在读取已安装插件…'));
          } else if (hostCapabilities.plugins.length === 0) {
            secPlugins.appendChild(el('div', 'ag-prism-policy-empty', '未检测到可用插件'));
          } else {
            const pSet = new Set(cur.allowedPlugins.map((x) => x.toLowerCase()));
            for (let i = 0; i < hostCapabilities.plugins.length; i++) {
              const p = hostCapabilities.plugins[i];
              const tags = [];
              if (p.isBuiltin) tags.push({ text: '内置' });
              if (p.disabled) tags.push({ text: '已停用' });
              if (p.hasRules) tags.push({ text: '规则' });
              if (p.hasSkills) tags.push({ text: '技能' });
              if (p.hasMcp) tags.push({ text: '含工具' });
              if (p.hasHooks) tags.push({ text: '自动触发已拦截', tone: 'warn' });
              secPlugins.appendChild(
                makeSwitchRow(
                  p.displayName,
                  p.description ? p.description.slice(0, 72) : p.name,
                  pSet.has(p.name.toLowerCase()),
                  (v) => {
                    cur.allowedPlugins = toggleInList(cur.allowedPlugins, p.name, v);
                    renderBody();
                  },
                  tags,
                  zeroLocked || p.disabled
                )
              );
            }
          }
          scrollBody.appendChild(secPlugins);

          const secMcp = el('div', 'ag-prism-policy-sec');
          const mHead = el('div', 'ag-prism-policy-sec-title');
          mHead.appendChild(el('span', '', '允许的外部工具服务（MCP，默认关闭）'));
          mHead.appendChild(
            el('span', 'ag-prism-policy-sec-cnt', `已开启 ${cur.allowedMcps.length} / ${hostCapabilities.mcps.length}`)
          );
          secMcp.appendChild(mHead);
          if (catalogLoading) {
            secMcp.appendChild(el('div', 'ag-prism-policy-empty', '正在读取外部工具服务…'));
          } else if (hostCapabilities.mcps.length === 0) {
            secMcp.appendChild(el('div', 'ag-prism-policy-empty', '未检测到外部工具服务'));
          } else {
            const mSet = new Set(cur.allowedMcps.map((x) => x.toLowerCase()));
            for (let i = 0; i < hostCapabilities.mcps.length; i++) {
              const m = hostCapabilities.mcps[i];
              const tags = [{ text: `${m.toolCount} 个工具` }];
              if (m.pluginName) tags.push({ text: m.pluginName });
              secMcp.appendChild(
                makeSwitchRow(
                  m.serverName,
                  m.status === 2 ? '已就绪 · 勾选后仅在本模式对话中可用' : '按需启用',
                  mSet.has(m.serverName.toLowerCase()),
                  (v) => {
                    cur.allowedMcps = toggleInList(cur.allowedMcps, m.serverName, v);
                    renderBody();
                  },
                  tags,
                  zeroLocked
                )
              );
            }
          }
          scrollBody.appendChild(secMcp);

          const secUi = el('div', 'ag-prism-policy-sec');
          secUi.appendChild(el('div', 'ag-prism-policy-sec-title', '界面显示'));
          secUi.appendChild(
            makeSwitchRow(
              '输入框上方显示状态小条',
              '简洁显示生成速度与上下文占用，关闭后界面更干净',
              draft.showTelemetryAboveComposer,
              (v) => { draft.showTelemetryAboveComposer = v; renderBody(); }
            )
          );
          secUi.appendChild(
            makeSwitchRow(
              '首页显示快捷建议',
              '在新建对话输入框下方提供常用起手建议，关闭后保持纯留白',
              draft.showStarterChips,
              (v) => { draft.showStarterChips = v; renderBody(); }
            )
          );
          scrollBody.appendChild(secUi);
        };

        pureTabBtn.addEventListener('click', () => { activeTab = 'pure'; renderBody(); });
        sparkTabBtn.addEventListener('click', () => { activeTab = 'spark'; renderBody(); });

        const foot = el('div', 'ag-prism-modal-actions-row');
        const resetBtn = el('button', 'ag-prism-modal-btn', '恢复默认');
        resetBtn.type = 'button';
        resetBtn.setAttribute('data-variant', 'ghost');
        resetBtn.addEventListener('click', () => {
          draft.pure = { ...DEFAULT_CHAT_POLICY.pure, allowedPlugins: [], allowedMcps: [] };
          draft.spark = { ...DEFAULT_CHAT_POLICY.spark, allowedPlugins: [], allowedMcps: [] };
          draft.showTelemetryAboveComposer = true;
          draft.showStarterChips = true;
          renderBody();
        });
        const cancelBtn = el('button', 'ag-prism-modal-btn', '取消');
        cancelBtn.type = 'button';
        cancelBtn.setAttribute('data-variant', 'ghost');
        cancelBtn.addEventListener('click', () => close());
        const saveBtn = el('button', 'ag-prism-modal-btn', '保存并生效');
        saveBtn.type = 'button';
        saveBtn.setAttribute('data-variant', 'primary');
        saveBtn.addEventListener('click', async () => {
          saveBtn.disabled = true;
          const r = await callDaemonRpc('set-prefs', { patch: { chatPolicy: draft } });
          close();
          if (r && r.ok) {
            syncChatComposerChrome(false);
            showToast('已保存设置，将在新建与后续对话中生效');
          }
        });
        foot.appendChild(resetBtn);
        foot.appendChild(cancelBtn);
        foot.appendChild(saveBtn);
        box.appendChild(foot);

        renderBody();
        void refreshHostCapabilities(true).then(() => {
          catalogLoading = false;
          if (activeModal && activeModal.isConnected) renderBody();
        });
      });
    }

    function openSparkFencePopover(anchorEl) {
      const pop = el('div', 'ag-prism-sidebar-popover');
      const proj = (snapshot?.sparkProjects || []).find((p) => p.id === snapshot?.chatDraft?.sparkProjectId) || null;
      pop.appendChild(
        el(
          'div',
          'ag-prism-menu-note',
          proj && proj.sharedWithCode
            ? '共享目录 · 已保护：该文件夹与当前编程项目共用，已自动采用兼容保护，不会影响正在进行的编程任务。'
            : 'Spark 安全保护：仅在选定的工作文件夹内协助整理文档与日程，高风险操作前需经你确认。'
        )
      );
      pop.appendChild(el('div', 'ag-prism-menu-sep'));
      pop.appendChild(
        makeMenuItem('sliders', '管理 Spark 能力与扩展…', () => {
          openChatPolicyModal('spark');
        })
      );
      mountPopover(pop, anchorEl, true);
    }

    function formatFileSize(bytes) {
      const n = Number(bytes) || 0;
      if (n < 1024) return `${n} B`;
      if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
      return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    }

    function arrayBufferToBase64(buf) {
      const bytes = new Uint8Array(buf);
      let bin = '';
      const step = 0x8000;
      for (let i = 0; i < bytes.length; i += step) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
      }
      return btoa(bin);
    }

    function clearPendingAttachments() {
      for (let i = 0; i < pendingAttachments.length; i++) {
        const a = pendingAttachments[i];
        if (a && a.previewUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
          try { URL.revokeObjectURL(a.previewUrl); } catch {}
        }
      }
      pendingAttachments = [];
    }

    function renderPendingAttachments() {
      if (!host.chatHomeEl || !host.chatHomeEl._refs || !host.chatHomeEl._refs.attStrip) return;
      const strip = host.chatHomeEl._refs.attStrip;
      clearNode(strip);
      for (let i = 0; i < pendingAttachments.length; i++) {
        const att = pendingAttachments[i];
        const chip = el('div', 'ag-prism-att-chip');
        if (att.isImage && att.previewUrl) {
          const img = document.createElement('img');
          img.className = 'ag-prism-att-thumb';
          img.src = att.previewUrl;
          img.alt = att.name;
          chip.appendChild(img);
        } else {
          chip.appendChild(makeMonoSvg('file', 13));
        }
        chip.appendChild(el('span', 'ag-prism-att-name', att.name));
        const rm = el('button', 'ag-prism-att-rm');
        rm.type = 'button';
        rm.title = '移除附件';
        rm.appendChild(makeMonoSvg('x', 11));
        rm.addEventListener('click', (e) => {
          e.stopPropagation();
          if (att.previewUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
            try { URL.revokeObjectURL(att.previewUrl); } catch {}
          }
          pendingAttachments = pendingAttachments.filter((x) => x.id !== att.id);
          renderPendingAttachments();
          renderChatHome();
        });
        chip.appendChild(rm);
        strip.appendChild(chip);
      }
      const ready = Boolean(composerText.trim() || pendingAttachments.length > 0);
      host.chatHomeEl._refs.sendBtn.setAttribute('data-ready', ready ? '1' : '0');
      host.chatHomeEl._refs.sendBtn.disabled = !ready;
    }

    async function addPendingAttachments(fileList) {
      const files = Array.from(fileList || []).filter(Boolean);
      if (files.length === 0) return;
      const textExtRe = /\.(txt|md|markdown|csv|json|xml|yaml|yml|html|htm|css|js|mjs|ts|tsx|py|java|go|rs|sql|log|ini|toml)$/i;
      let added = 0;
      for (let i = 0; i < files.length; i++) {
        if (pendingAttachments.length >= 6) {
          showToast('单条消息最多附加 6 个文件或截图');
          break;
        }
        const f = files[i];
        if (f.size > 10 * 1024 * 1024) {
          showToast(`「${f.name}」超过 10 MB，已跳过`);
          continue;
        }
        const mime = f.type || '';
        const isImage = mime.startsWith('image/');
        const isBinaryMedia = isImage || mime === 'application/pdf' || mime.startsWith('audio/') || mime.startsWith('video/');
        try {
          if (isBinaryMedia) {
            const ab = await f.arrayBuffer();
            const previewUrl =
              isImage && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
                ? URL.createObjectURL(f)
                : '';
            pendingAttachments.push({
              id: makeUuid(),
              name: f.name || (isImage ? `screenshot-${Date.now()}.png` : 'attachment'),
              mimeType: mime || 'application/octet-stream',
              size: f.size,
              isImage,
              bytes: new Uint8Array(ab),
              previewUrl,
            });
            added++;
          } else if (mime.startsWith('text/') || textExtRe.test(f.name || '')) {
            const txt = await f.text();
            pendingAttachments.push({
              id: makeUuid(),
              name: f.name || 'document.txt',
              mimeType: mime || 'text/plain',
              size: f.size,
              isImage: false,
              textContent: txt,
            });
            added++;
          } else {
            const ab = await f.arrayBuffer();
            pendingAttachments.push({
              id: makeUuid(),
              name: f.name || 'file',
              mimeType: mime || 'application/octet-stream',
              size: f.size,
              isImage: false,
              bytes: new Uint8Array(ab),
            });
            added++;
          }
        } catch {}
      }
      if (added > 0) {
        renderPendingAttachments();
        renderChatHome();
      }
    }

    async function importFilesToSpark(fileList, sparkProjectId) {
      const files = Array.from(fileList || []).filter(Boolean);
      if (!sparkProjectId || files.length === 0) return [];
      const imported = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        if (f.size > 8 * 1024 * 1024) {
          showToast(`「${f.name}」超过 8 MB 大小限制，已跳过`);
          continue;
        }
        try {
          const ab = await f.arrayBuffer();
          const b64 = arrayBufferToBase64(ab);
          const r = await callDaemonRpc('import-spark-file', {
            sparkProjectId,
            fileName: f.name || `file-${Date.now()}`,
            base64Data: b64,
          });
          if (r && r.ok && r.result && r.result.fileName) {
            imported.push(r.result.fileName);
          } else if (r && r.error && r.error.message) {
            showToast(r.error.message);
          }
        } catch {}
      }
      if (imported.length > 0) {
        const proj = (snapshot?.sparkProjects || []).find((p) => p.id === sparkProjectId);
        showToast(`已导入 ${imported.length} 个文件到「${proj ? proj.name : 'Spark'}」：${imported[0]}`);
      }
      return imported;
    }

    function openChatFilePicker(importToSparkId) {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.multiple = true;
      inp.accept = importToSparkId
        ? '.pdf,.txt,.md,.csv,.json,.docx,.xlsx,.pptx,.png,.jpg,.jpeg,.webp,.html,.xml,.yaml,.yml'
        : 'image/*,.pdf,.txt,.md,.csv,.json,.xml,.yaml,.yml,.html,.css,.js,.ts,.py';
      inp.style.display = 'none';
      inp.addEventListener('change', async () => {
        const fl = inp.files;
        inp.remove();
        if (!fl || fl.length === 0) return;
        if (importToSparkId) {
          const names = await importFilesToSpark(fl, importToSparkId);
          if (names.length && host.chatHomeEl && host.chatHomeEl._refs) {
            const refStr = names.map((n) => `@${n}`).join(' ');
            composerText = composerText ? `${composerText} ${refStr}` : `请帮我处理文件夹中的 ${refStr}：`;
            host.chatHomeEl._refs.input.textContent = composerText;
            renderChatHome();
          }
        } else {
          await addPendingAttachments(fl);
        }
      });
      document.body.appendChild(inp);
      inp.click();
    }

    function openSparkFilesPopover(anchorEl, sparkProjectId) {
      if (!sparkProjectId) {
        showToast('请先选择一个 Spark 工作文件夹');
        return;
      }
      const pop = el('div', 'ag-prism-sidebar-popover ag-prism-spark-files-pop');
      const proj = (snapshot?.sparkProjects || []).find((p) => p.id === sparkProjectId);
      pop.appendChild(el('div', 'ag-prism-menu-note', `工作文件夹 · ${proj ? proj.name : 'Spark'}`));
      const listWrap = el('div', 'ag-prism-spark-files-list');
      listWrap.appendChild(el('div', 'ag-prism-policy-empty', '正在读取目录文件…'));
      pop.appendChild(listWrap);
      pop.appendChild(el('div', 'ag-prism-menu-sep'));
      pop.appendChild(
        makeMenuItem('upload', '导入本地文件到此文件夹…', () => {
          openChatFilePicker(sparkProjectId);
        })
      );
      pop.appendChild(
        makeMenuItem('external', '在系统文件夹中打开', () => {
          void callDaemonRpc('reveal-spark-project', { sparkProjectId });
        })
      );
      mountPopover(pop, anchorEl, true);

      void callDaemonRpc('list-spark-files', { sparkProjectId }).then((res) => {
        if (!pop.isConnected) return;
        clearNode(listWrap);
        if (!res || !res.ok || !res.result) {
          listWrap.appendChild(el('div', 'ag-prism-policy-empty', '暂无法读取目录内容'));
          return;
        }
        const files = Array.isArray(res.result.files) ? res.result.files : [];
        if (files.length === 0) {
          listWrap.appendChild(el('div', 'ag-prism-policy-empty', '文件夹目前为空，可直接拖文件进输入框导入'));
          return;
        }
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          const row = el('button', 'ag-prism-menu-btn');
          row.type = 'button';
          const lead = el('span', 'ag-prism-menu-btn-lead');
          lead.appendChild(makeMonoSvg(f.isDir ? 'folder' : 'file', 13));
          lead.appendChild(el('span', 'ag-prism-sb-row-title', f.name));
          row.appendChild(lead);
          if (!f.isDir) row.appendChild(el('span', 'ag-prism-spark-file-size', formatFileSize(f.size)));
          row.addEventListener('click', (e) => {
            e.stopPropagation();
            closePopover();
            if (host.chatHomeEl && host.chatHomeEl._refs && host.chatHomeEl.getAttribute('data-visible') === '1') {
              composerText = composerText ? `${composerText} @${f.name} ` : `请查看并处理 @${f.name}：`;
              host.chatHomeEl._refs.input.textContent = composerText;
              renderChatHome();
              try { host.chatHomeEl._refs.input.focus(); } catch {}
            } else {
              if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                void navigator.clipboard.writeText(`@${f.name}`).catch(() => {});
              }
              showToast(`已复制文件名引用 @${f.name}`);
            }
          });
          listWrap.appendChild(row);
        }
      });
    }

    function openChatPlusPopover(anchorEl) {
      const pop = el('div', 'ag-prism-sidebar-popover');
      pop.appendChild(
        makeMenuItem('paperclip', '上传图片 / 文件（随首条消息发送）', () => {
          openChatFilePicker(null);
        })
      );
      if (snapshot?.chatDraft?.kind === 'spark' && snapshot?.chatDraft?.sparkProjectId) {
        pop.appendChild(
          makeMenuItem('upload', '导入本地文件到当前 Spark 文件夹…', () => {
            openChatFilePicker(snapshot.chatDraft.sparkProjectId);
          })
        );
      }
      pop.appendChild(el('div', 'ag-prism-menu-sep'));
      pop.appendChild(
        makeMenuItem('sliders', 'Chat 能力与扩展…', () => {
          openChatPolicyModal(resolveActiveChatKind());
        })
      );
      mountPopover(pop, anchorEl, true);
    }

    async function handleSendFirstMessage() {
      if (!snapshot || sendingFirst) return;
      const text = composerText.trim();
      if (!text && pendingAttachments.length === 0) return;
      const sendText = text || '请结合我附上的图片或文件内容帮我分析。';
      sendingFirst = true;
      host.pendingFirstAttachments = pendingAttachments.slice();
      if (host.chatHomeEl && host.chatHomeEl._refs) {
        host.chatHomeEl._refs.sendBtn.disabled = true;
      }
      try {
        if (doesDaemonNeedSync(getLiveCapabilities())) {
          await syncCatalogNow();
        }
        const res = await callDaemonRpc('send-chat-first', {
          message: sendText,
          draftRev: snapshot.draftRev,
          navRev: snapshot.navRev,
          modelId: selectedModel,
          effort: selectedEffort,
        });
        if (res && res.ok && res.result && res.result.status === 'succeeded') {
          composerText = '';
          clearPendingAttachments();
          if (host.chatHomeEl && host.chatHomeEl._refs) {
            runGuarded(() => {
              host.chatHomeEl._refs.input.textContent = '';
              renderPendingAttachments();
              host.chatHomeEl._refs.sendBtn.setAttribute('data-ready', '0');
            });
          }
          if (res.result.view) {
            navigateHostRoute(res.result.view);
            scheduleCatalogSync();
          }
        }
      } finally {
        host.pendingFirstAttachments = [];
        sendingFirst = false;
        renderChatHome();
      }
    }

    // 持久化顶栏 [ </> Code | ○ Chat ] 切换胶囊（绝不重建，保证失重弹簧横滑 100% 流畅触发）
    function ensureModeDock(slots) {
      const { nav, headerSlot } = slots;
      const insertBeforeNode = headerSlot ? headerSlot.nextSibling : nav.firstChild;
      if (!host.modeDockEl || host.modeDockEl.parentElement !== nav) {
        if (host.modeDockEl) host.modeDockEl.remove();
        const dock = markOwnedRoot(el('div', 'ag-prism-mode-dock'));
        dock.setAttribute('data-testid', 'prism-bipolar-mode-dock');

        const seg = el('div', 'ag-prism-sb-seg');
        seg.setAttribute('role', 'tablist');
        seg.setAttribute('data-mode', 'code');
        seg.appendChild(el('span', 'ag-prism-sb-slider'));

        const mkBtn = (mode, iconName, label) => {
          const b = el('button', 'ag-prism-sb-mode-btn');
          b.type = 'button';
          b.setAttribute('data-mode-btn', mode);
          b.appendChild(makeMonoSvg(iconName, 12.5));
          b.appendChild(el('span', '', label));
          const dot = el('span', 'ag-prism-sb-dot');
          dot.style.display = 'none';
          dot.addEventListener('click', (e) => {
            e.stopPropagation();
            const badge = snapshot && snapshot.backgroundBadge;
            const first = badge && badge.targetMode === mode && badge.items && badge.items[0];
            if (first && first.cascadeId) {
              try { W.__agPrism?.suppressEntryMotion?.(1100); } catch {}
              triggerCanvasModeFade(mode === 'chat' ? 'to-chat' : 'to-code');
              void callDaemonRpc('open-background-task', {
                targetMode: mode,
                cascadeId: first.cascadeId,
                navRev: snapshot.navRev,
              }).then((r) => {
                if (r && r.ok && r.result && r.result.view) navigateHostRoute(r.result.view);
              });
            }
          });
          b.appendChild(dot);
          b.addEventListener('click', () => {
            if (snapshot && snapshot.activeMode !== mode) {
              try { W.__agPrism?.suppressEntryMotion?.(1100); } catch {}
              triggerCanvasModeFade(mode === 'chat' ? 'to-chat' : 'to-code');
              void callDaemonRpc('switch-mode', { to: mode, navRev: snapshot.navRev }).then((r) => {
                if (r && r.ok && r.result && r.result.view) navigateHostRoute(r.result.view);
              });
            }
          });
          return { btn: b, dot };
        };

        const codePair = mkBtn('code', 'code', 'Code');
        const chatPair = mkBtn('chat', 'chat', 'Chat');
        chatPair.btn.appendChild(el('span', 'ag-prism-sb-beta-pill', 'Beta'));
        seg.appendChild(codePair.btn);
        seg.appendChild(chatPair.btn);
        dock.appendChild(seg);

        nav.insertBefore(dock, insertBeforeNode);
        host.modeDockEl = dock;
        host.modeDockRefs = { seg, codeBtn: codePair.btn, codeDot: codePair.dot, chatBtn: chatPair.btn, chatDot: chatPair.dot };
      }

      const r = host.modeDockRefs;
      const mode = snapshot.activeMode === 'chat' ? 'chat' : 'code';
      r.seg.setAttribute('data-mode', mode);
      r.codeBtn.setAttribute('data-active', mode === 'code' ? '1' : '0');
      r.chatBtn.setAttribute('data-active', mode === 'chat' ? '1' : '0');

      const badge = snapshot.backgroundBadge;
      const updateDot = (dotEl, targetMode, label) => {
        if (badge && badge.targetMode === targetMode) {
          dotEl.style.display = '';
          dotEl.setAttribute('data-status', badge.status);
          dotEl.title = `${label} 后台任务 (${badge.count})`;
        } else {
          dotEl.style.display = 'none';
        }
      };
      updateDot(r.codeDot, 'code', 'Code');
      updateDot(r.chatDot, 'chat', 'Chat');
    }

    // 持久化 Chat 侧栏容器（头部与搜索框永不销毁，仅局部更新 list 区）
    function ensureChatPane(slots) {
      const { nav } = slots;
      const anchorAfterDock = host.modeDockEl ? host.modeDockEl.nextSibling : nav.firstChild;
      if (!host.chatPaneEl || host.chatPaneEl.parentElement !== nav) {
        if (host.chatPaneEl) host.chatPaneEl.remove();
        const pane = markOwnedRoot(el('div', 'ag-prism-chat-pane'));
        pane.setAttribute('data-testid', 'prism-bipolar-chat-pane');
        pane.setAttribute('data-active', '0');

        const head = el('div', 'ag-prism-sb-chat-head');
        const newBtn = el('button', 'ag-prism-sb-new-btn');
        newBtn.type = 'button';
        newBtn.appendChild(makeMonoSvg('plus', 14));
        newBtn.appendChild(el('span', '', '新建对话'));
        newBtn.addEventListener('click', () => {
          greetingSeed = Math.floor(Math.random() * 100);
          void callDaemonRpc('navigate', { mode: 'chat', view: '/', navRev: snapshot.navRev });
          navigateHostRoute('/');
        });
        head.appendChild(newBtn);

        const searchBtn = el('button', 'ag-prism-sb-icon-btn');
        searchBtn.type = 'button';
        searchBtn.title = '搜索对话';
        searchBtn.appendChild(makeMonoSvg('search', 14));
        searchBtn.addEventListener('click', () => {
          searchOpen = !searchOpen;
          searchWrap.setAttribute('data-open', searchOpen ? '1' : '0');
          if (!searchOpen) {
            searchQuery = '';
            searchInput.value = '';
            renderChatSidebarList();
          } else {
            setTimeout(() => {
              if (typeof searchInput.focus === 'function') searchInput.focus();
            }, 40);
          }
        });
        head.appendChild(searchBtn);

        const batchBtn = el('button', 'ag-prism-sb-icon-btn');
        batchBtn.type = 'button';
        batchBtn.title = '多选批量管理';
        batchBtn.setAttribute('data-testid', 'prism-sb-batch-toggle');
        batchBtn.appendChild(makeMonoSvg('checklist', 14));
        batchBtn.addEventListener('click', () => {
          multiSelectMode = !multiSelectMode;
          if (!multiSelectMode) selectedBatchIds.clear();
          batchBtn.style.color = multiSelectMode ? 'var(--ag-sb-active-anchor)' : '';
          renderChatSidebarList();
        });
        head.appendChild(batchBtn);
        pane.appendChild(head);

        const searchWrap = el('div', 'ag-prism-sb-search-wrap');
        searchWrap.setAttribute('data-open', '0');
        const searchOver = el('div', 'ag-prism-sb-search-over');
        const searchBox = el('div', 'ag-prism-sb-search');
        searchBox.appendChild(makeMonoSvg('search', 12.5));
        const searchInput = el('input', 'ag-prism-sb-search-input');
        searchInput.type = 'text';
        searchInput.placeholder = '搜索 Chat 对话…';
        searchInput.addEventListener('compositionstart', () => { searchComposing = true; });
        searchInput.addEventListener('compositionend', () => {
          searchComposing = false;
          searchQuery = searchInput.value;
          renderChatSidebarList();
        });
        searchInput.addEventListener('input', () => {
          searchQuery = searchInput.value;
          if (!searchComposing) renderChatSidebarList();
        });
        searchBox.appendChild(searchInput);
        searchOver.appendChild(searchBox);
        searchWrap.appendChild(searchOver);
        pane.appendChild(searchWrap);

        const list = el('div', 'ag-prism-sb-list');
        pane.appendChild(list);

        const batchBar = el('div', 'ag-prism-sb-batch-bar');
        batchBar.setAttribute('data-testid', 'prism-sb-batch-bar');
        batchBar.style.display = 'none';
        const batchTop = el('div', 'ag-prism-sb-batch-top');
        const batchCountLbl = el('span', '', '已选 0 项');
        const batchExitBtn = el('button', 'ag-prism-sb-act-btn');
        batchExitBtn.type = 'button';
        batchExitBtn.title = '退出多选';
        batchExitBtn.appendChild(makeMonoSvg('x', 13));
        batchExitBtn.addEventListener('click', () => {
          multiSelectMode = false;
          selectedBatchIds.clear();
          batchBtn.style.color = '';
          renderChatSidebarList();
        });
        batchTop.appendChild(batchCountLbl);
        batchTop.appendChild(batchExitBtn);
        batchBar.appendChild(batchTop);

        const batchBtns = el('div', 'ag-prism-sb-batch-btns');
        const bMove = el('button', 'ag-prism-sb-batch-btn', '移入');
        bMove.type = 'button';
        const bArch = el('button', 'ag-prism-sb-batch-btn', '归档');
        bArch.type = 'button';
        const bDel = el('button', 'ag-prism-sb-batch-btn', '删除');
        bDel.type = 'button';
        bDel.setAttribute('data-danger', '1');

        bMove.addEventListener('click', (e) => {
          e.stopPropagation();
          const ids = Array.from(selectedBatchIds);
          if (ids.length === 0) return;
          const pop = el('div', 'ag-prism-sidebar-popover');
          pop.appendChild(el('div', 'ag-prism-menu-note', `批量移动 ${ids.length} 条对话至`));
          pop.appendChild(
            makeMenuItem('folderMove', 'Pure 根目录', () => {
              void runBatchChatOp('move', ids, { folderId: null });
            })
          );
          const folders = (snapshot && snapshot.knowledgeFolders) || [];
          for (let i = 0; i < folders.length; i++) {
            const f = folders[i];
            pop.appendChild(
              makeMenuItem('folder', f.name, () => {
                void runBatchChatOp('move', ids, { folderId: f.id });
              })
            );
          }
          mountPopover(pop, bMove, true);
        });
        bArch.addEventListener('click', () => {
          const ids = Array.from(selectedBatchIds);
          if (ids.length === 0) return;
          void runBatchChatOp('archive', ids, { archived: true });
        });
        bDel.addEventListener('click', () => {
          const ids = Array.from(selectedBatchIds);
          if (ids.length === 0) return;
          openModal((box, close) => {
            box.appendChild(el('h3', 'ag-prism-modal-title', `批量永久删除 ${ids.length} 条对话`));
            box.appendChild(
              el('p', 'ag-prism-modal-body', '将彻底删除所选对话及其消息记录（运行中的对话会自动跳过保护），删除后不可恢复。')
            );
            const row = el('div', 'ag-prism-modal-actions-row');
            const cBtn = el('button', 'ag-prism-modal-btn', '取消');
            cBtn.type = 'button';
            cBtn.setAttribute('data-variant', 'ghost');
            cBtn.addEventListener('click', () => close());
            const dBtn = el('button', 'ag-prism-modal-btn', `永久删除 (${ids.length})`);
            dBtn.type = 'button';
            dBtn.setAttribute('data-variant', 'danger');
            dBtn.addEventListener('click', () => {
              close();
              void runBatchChatOp('delete', ids, {});
            });
            row.appendChild(cBtn);
            row.appendChild(dBtn);
            box.appendChild(row);
          });
        });

        batchBtns.appendChild(bMove);
        batchBtns.appendChild(bArch);
        batchBtns.appendChild(bDel);
        batchBar.appendChild(batchBtns);
        pane.appendChild(batchBar);

        const footerDock = el('div', 'ag-prism-sb-footer-dock');
        const policyBtn = el('button', 'ag-prism-sb-policy-btn');
        policyBtn.type = 'button';
        policyBtn.setAttribute('data-testid', 'prism-sb-policy-btn');
        policyBtn.appendChild(makeMonoSvg('sliders', 13.5));
        policyBtn.appendChild(el('span', 'ag-prism-sb-row-title', '能力与扩展'));
        const policyCnt = el('span', 'ag-prism-sb-cnt', '');
        policyBtn.appendChild(policyCnt);
        policyBtn.addEventListener('click', () => {
          openChatPolicyModal(resolveActiveChatKind());
        });
        footerDock.appendChild(policyBtn);
        pane.appendChild(footerDock);

        nav.insertBefore(pane, anchorAfterDock);
        host.chatPaneEl = pane;
        host.chatPaneRefs = { list, searchWrap, searchInput, policyCnt, batchBtn, batchBar, batchCountLbl, bMove, bArch, bDel };
      }
    }

    function makeMenuItem(iconName, label, onClick, danger) {
      const btn = el('button', 'ag-prism-menu-btn');
      btn.type = 'button';
      if (danger) btn.setAttribute('data-danger', '1');
      const lead = el('span', 'ag-prism-menu-btn-lead');
      if (iconName) lead.appendChild(makeMonoSvg(iconName, 13));
      lead.appendChild(el('span', '', label));
      btn.appendChild(lead);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        closePopover();
        onClick();
      });
      return btn;
    }

    function openRenameModal(titleText, initialValue, placeholder, onSubmit) {
      openModal((box, close) => {
        box.appendChild(el('h3', 'ag-prism-modal-title', titleText));
        const inp = el('input', 'ag-prism-modal-input');
        inp.type = 'text';
        inp.value = initialValue || '';
        inp.placeholder = placeholder || '输入新名称…';
        box.appendChild(inp);
        const submit = () => {
          const v = inp.value.trim();
          if (!v) return;
          close();
          onSubmit(v);
        };
        inp.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); submit(); }
          else if (e.key === 'Escape') { e.preventDefault(); close(); }
        });
        const row = el('div', 'ag-prism-modal-actions-row');
        const cancelBtn = el('button', 'ag-prism-modal-btn', '取消');
        cancelBtn.type = 'button';
        cancelBtn.setAttribute('data-variant', 'ghost');
        cancelBtn.addEventListener('click', () => close());
        const okBtn = el('button', 'ag-prism-modal-btn', '保存');
        okBtn.type = 'button';
        okBtn.setAttribute('data-variant', 'primary');
        okBtn.addEventListener('click', submit);
        row.appendChild(cancelBtn);
        row.appendChild(okBtn);
        box.appendChild(row);
        setTimeout(() => {
          try { inp.focus(); inp.select(); } catch {}
        }, 20);
      });
    }

    function buildModalBtn(label, { variant = '', icon = '', onClick } = {}) {
      const btn = icon ? el('button', 'ag-prism-modal-btn') : el('button', 'ag-prism-modal-btn', label);
      btn.type = 'button';
      if (variant) btn.setAttribute('data-variant', variant);
      if (icon) {
        btn.appendChild(makeMonoSvg(icon, 13.5));
        btn.appendChild(el('span', '', label));
      }
      if (typeof onClick === 'function') btn.addEventListener('click', onClick);
      return btn;
    }

    function openDeleteSessionModal(item) {
      openModal((box, close) => {
        box.appendChild(el('h3', 'ag-prism-modal-title', '永久删除对话？'));
        box.appendChild(
          el(
            'p',
            'ag-prism-modal-body',
            `确认彻底删除「${item.title || item.cascadeId}」吗？删除后无法恢复；若只是暂时收起，建议改为“归档”。`
          )
        );
        const actions = el('div', 'ag-prism-modal-actions');
        if (!item.archived) {
          actions.appendChild(
            buildModalBtn('改为归档（可随时恢复）', {
              variant: 'primary',
              icon: 'archive',
              onClick: async () => {
                close();
                const r = await callDaemonRpc('archive-chat-session', { cascadeId: item.cascadeId, archived: true });
                if (r && r.ok) {
                  if (r.result?.navigatedFallback) navigateHostRoute('/');
                  showToast('已归档该对话');
                }
              },
            })
          );
        }
        actions.appendChild(
          buildModalBtn('永久删除对话', {
            variant: 'danger',
            icon: 'trash',
            onClick: async () => {
              close();
              const r = await callDaemonRpc('delete-chat-session', { cascadeId: item.cascadeId });
              if (r && r.ok) {
                if (r.result?.navigatedFallback) navigateHostRoute('/');
                showToast('已永久删除对话');
                scheduleCatalogSync();
              }
            },
          })
        );
        actions.appendChild(buildModalBtn('取消', { variant: 'ghost', onClick: () => close() }));
        box.appendChild(actions);
      });
    }

    function openDeleteFolderModal(folder) {
      const count = Array.isArray(folder.items) ? folder.items.length : 0;
      const runDelete = async (childAction) => {
        const r = await callDaemonRpc('delete-knowledge-folder', { folderId: folder.id, childAction });
        if (r && r.ok) {
          if (r.result?.navigatedFallback) navigateHostRoute('/');
          showToast(
            childAction === 'delete'
              ? `已删除文件夹及 ${count} 条对话`
              : childAction === 'archive'
              ? `已归档 ${count} 条对话并删除文件夹`
              : '已删除文件夹'
          );
          scheduleCatalogSync();
        }
      };
      openModal((box, close) => {
        box.appendChild(el('h3', 'ag-prism-modal-title', `删除文件夹「${folder.name}」`));
        if (count === 0) {
          box.appendChild(el('p', 'ag-prism-modal-body', '该文件夹目前为空，确认删除吗？'));
          const row = el('div', 'ag-prism-modal-actions-row');
          row.appendChild(buildModalBtn('取消', { variant: 'ghost', onClick: () => close() }));
          row.appendChild(
            buildModalBtn('删除文件夹', {
              variant: 'danger',
              onClick: () => {
                close();
                void runDelete('move-to-root');
              },
            })
          );
          box.appendChild(row);
          return;
        }
        box.appendChild(
          el('p', 'ag-prism-modal-body', `该文件夹内包含 ${count} 条对话，请选择如何处理这些对话：`)
        );
        const actions = el('div', 'ag-prism-modal-actions');
        actions.appendChild(
          buildModalBtn(`仅删文件夹（${count} 条对话移回 Pure）`, {
            variant: 'primary',
            icon: 'folderMove',
            onClick: () => {
              close();
              void runDelete('move-to-root');
            },
          })
        );
        actions.appendChild(
          buildModalBtn(`归档全部 ${count} 条对话并删除文件夹`, {
            icon: 'archive',
            onClick: () => {
              close();
              void runDelete('archive');
            },
          })
        );
        actions.appendChild(
          buildModalBtn(`永久删除全部 ${count} 条对话与文件夹`, {
            variant: 'danger',
            icon: 'trash',
            onClick: () => {
              close();
              void runDelete('delete');
            },
          })
        );
        actions.appendChild(buildModalBtn('取消', { variant: 'ghost', onClick: () => close() }));
        box.appendChild(actions);
      });
    }

    function openDeleteSparkModal(project) {
      const count = Array.isArray(project.items) ? project.items.length : 0;
      const runUnlink = async (childAction) => {
        const r = await callDaemonRpc('unlink-spark-project', { sparkProjectId: project.id, childAction });
        if (r && r.ok) {
          if (r.result?.navigatedFallback) navigateHostRoute('/');
          showToast(
            childAction === 'delete'
              ? `已移除工作区并永久删除 ${count} 条对话`
              : childAction === 'archive'
              ? `已归档 ${count} 条对话并移除工作区`
              : '已移除 Spark 工作区'
          );
          scheduleCatalogSync();
        }
      };
      openModal((box, close) => {
        box.appendChild(el('h3', 'ag-prism-modal-title', `删除 Spark 工作区「${project.name}」`));
        if (count === 0) {
          box.appendChild(el('p', 'ag-prism-modal-body', '该工作区目前没有关联对话，确认从 Spark 移除吗？'));
          box.appendChild(el('div', 'ag-prism-modal-note', '安全提示：仅解除工作区绑定，绝不会删除你本地磁盘上的原始文件。'));
          const row = el('div', 'ag-prism-modal-actions-row');
          row.appendChild(buildModalBtn('取消', { variant: 'ghost', onClick: () => close() }));
          row.appendChild(
            buildModalBtn('确认移除', {
              variant: 'danger',
              onClick: () => {
                close();
                void runUnlink('unbind');
              },
            })
          );
          box.appendChild(row);
          return;
        }
        box.appendChild(
          el('p', 'ag-prism-modal-body', `该工作区内包含 ${count} 条对话，请选择如何处理这些对话：`)
        );
        box.appendChild(el('div', 'ag-prism-modal-note', '安全提示：所有选项均仅处理对话记录与绑定关系，绝不会删除本地磁盘文件夹中的文件。'));
        const actions = el('div', 'ag-prism-modal-actions');
        actions.appendChild(
          buildModalBtn(`解绑工作区（${count} 条对话移回 Pure）`, {
            variant: 'primary',
            icon: 'folderMove',
            onClick: () => {
              close();
              void runUnlink('unbind');
            },
          })
        );
        actions.appendChild(
          buildModalBtn(`归档全部 ${count} 条对话并移除工作区`, {
            icon: 'archive',
            onClick: () => {
              close();
              void runUnlink('archive');
            },
          })
        );
        actions.appendChild(
          buildModalBtn(`永久删除全部 ${count} 条对话并移除工作区`, {
            variant: 'danger',
            icon: 'trash',
            onClick: () => {
              close();
              void runUnlink('delete');
            },
          })
        );
        actions.appendChild(buildModalBtn('取消', { variant: 'ghost', onClick: () => close() }));
        box.appendChild(actions);
      });
    }

    async function exportChatMarkdown(item) {
      const ls = getHostLsClient();
      const wrap = host.lsWrapper;
      try {
        let res = null;
        if (wrap && typeof wrap.convertTrajectoryToMarkdown === 'function') {
          res = await wrap.convertTrajectoryToMarkdown({ cascadeId: item.cascadeId });
        } else if (ls && typeof ls.convertTrajectoryToMarkdown === 'function') {
          res = await ls.convertTrajectoryToMarkdown({ cascadeId: item.cascadeId });
        }
        const md = typeof res === 'string' ? res : typeof res?.markdown === 'string' ? res.markdown : '';
        if (!md) {
          showToast('当前对话暂无可导出的 Markdown 内容');
          return;
        }
        if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          await navigator.clipboard.writeText(md).catch(() => {});
        }
        if (typeof Blob !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
          const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          const safeName = String(item.title || item.cascadeId).replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
          a.download = `${safeName}.md`;
          a.click();
          setTimeout(() => { try { URL.revokeObjectURL(url); } catch {} }, 1500);
        }
        showToast('已导出 Markdown 并复制到剪贴板');
      } catch {
        showToast('导出 Markdown 失败');
      }
    }

    function openChatSessionMenu(item, anchorEl) {
      const pop = el('div', 'ag-prism-sidebar-popover');
      if (item.status === 'running') {
        pop.appendChild(
          makeMenuItem('stop', '停止运行', () => {
            void callDaemonRpc('cancel-chat-session', { cascadeId: item.cascadeId }).then((r) => {
              if (r && r.ok) showToast('已请求停止对话');
            });
          })
        );
        pop.appendChild(el('div', 'ag-prism-menu-sep'));
      }
      if (!item.archived) {
        pop.appendChild(
          makeMenuItem('pin', item.pinned ? '取消置顶' : '置顶对话', () => {
            void callDaemonRpc('pin-chat-session', { cascadeId: item.cascadeId, pinned: !item.pinned });
          })
        );
      }
      pop.appendChild(
        makeMenuItem('edit', '重命名对话', () => {
          openRenameModal('重命名对话', item.title || '', '输入新对话标题…', (newTitle) => {
            void callDaemonRpc('rename-chat-session', { cascadeId: item.cascadeId, title: newTitle });
          });
        })
      );
      if (!item.archived && item.placement?.kind === 'knowledge') {
        const folders = (snapshot && snapshot.knowledgeFolders) || [];
        if (folders.length > 0 || item.placement?.folderId) {
          pop.appendChild(el('div', 'ag-prism-menu-sep'));
          if (item.placement?.folderId) {
            pop.appendChild(
              makeMenuItem('folderMove', '移回 Pure 根目录', () => {
                void callDaemonRpc('move-chat-session', {
                  cascadeId: item.cascadeId,
                  placement: { kind: 'knowledge', folderId: null },
                });
              })
            );
          }
          for (let i = 0; i < folders.length; i++) {
            const f = folders[i];
            if (item.placement?.folderId === f.id) continue;
            pop.appendChild(
              makeMenuItem('folder', `移入：${f.name}`, () => {
                void callDaemonRpc('move-chat-session', {
                  cascadeId: item.cascadeId,
                  placement: { kind: 'knowledge', folderId: f.id },
                });
              })
            );
          }
        }
      }
      pop.appendChild(el('div', 'ag-prism-menu-sep'));
      pop.appendChild(
        makeMenuItem('download', '导出为 Markdown', () => {
          void exportChatMarkdown(item);
        })
      );
      pop.appendChild(
        makeMenuItem(item.archived ? 'restore' : 'archive', item.archived ? '从归档恢复' : '归档对话', () => {
          void callDaemonRpc('archive-chat-session', {
            cascadeId: item.cascadeId,
            archived: !item.archived,
          }).then((r) => {
            if (r && r.ok) {
              if (r.result?.navigatedFallback) navigateHostRoute('/');
              showToast(item.archived ? '已恢复该对话' : '已归档该对话');
            }
          });
        })
      );
      pop.appendChild(
        makeMenuItem('trash', '永久删除', () => {
          openDeleteSessionModal(item);
        }, true)
      );
      mountPopover(pop, anchorEl, false);
    }

    function openKnowledgeFolderMenu(folder, anchorEl) {
      const pop = el('div', 'ag-prism-sidebar-popover');
      pop.appendChild(
        makeMenuItem('plus', '在此文件夹新建对话', () => {
          greetingSeed = Math.floor(Math.random() * 100);
          void callDaemonRpc('navigate', { mode: 'chat', view: '/', navRev: snapshot.navRev }).then(() => {
            void callDaemonRpc('set-chat-draft', {
              draft: { kind: 'knowledge', folderId: folder.id, sparkProjectId: null },
              navRev: snapshot.navRev,
              draftRev: snapshot.draftRev,
            });
          });
          navigateHostRoute('/');
        })
      );
      pop.appendChild(
        makeMenuItem('edit', '重命名文件夹', () => {
          openRenameModal('重命名文件夹', folder.name, '输入新文件夹名…', (newName) => {
            void callDaemonRpc('rename-knowledge-folder', { folderId: folder.id, name: newName });
          });
        })
      );
      pop.appendChild(el('div', 'ag-prism-menu-sep'));
      pop.appendChild(
        makeMenuItem('trash', '删除文件夹…', () => {
          openDeleteFolderModal(folder);
        }, true)
      );
      mountPopover(pop, anchorEl, false);
    }

    function openSparkWorkspaceMenu(project, anchorEl) {
      const pop = el('div', 'ag-prism-sidebar-popover');
      pop.appendChild(
        makeMenuItem('plus', '在此工作区新建对话', () => {
          greetingSeed = Math.floor(Math.random() * 100);
          void callDaemonRpc('navigate', { mode: 'chat', view: '/', navRev: snapshot.navRev }).then(() => {
            void callDaemonRpc('set-chat-draft', {
              draft: { kind: 'spark', folderId: null, sparkProjectId: project.id },
              navRev: snapshot.navRev,
              draftRev: snapshot.draftRev,
            });
          });
          navigateHostRoute('/');
        })
      );
      pop.appendChild(
        makeMenuItem('edit', '重命名工作区', () => {
          openRenameModal('重命名工作区显示名', project.name, '输入工作区显示名…', (newName) => {
            void callDaemonRpc('rename-spark-project', { sparkProjectId: project.id, name: newName });
          });
        })
      );
      pop.appendChild(
        makeMenuItem('file', '预览 / 导入目录文件…', () => {
          openSparkFilesPopover(anchorEl, project.id);
        })
      );
      pop.appendChild(
        makeMenuItem('external', '在文件夹中打开', () => {
          void callDaemonRpc('reveal-spark-project', { sparkProjectId: project.id });
        })
      );
      pop.appendChild(el('div', 'ag-prism-menu-sep'));
      pop.appendChild(
        makeMenuItem('trash', '删除 / 解绑工作区…', () => {
          openDeleteSparkModal(project);
        }, true)
      );
      mountPopover(pop, anchorEl, false);
    }

    async function runBatchChatOp(op, ids, extra) {
      const r = await callDaemonRpc('batch-chat-sessions', {
        op,
        cascadeIds: ids,
        ...(extra || {}),
      });
      if (r && r.ok && r.result) {
        const okN = Array.isArray(r.result.succeededIds) ? r.result.succeededIds.length : 0;
        const skN = Array.isArray(r.result.skippedIds) ? r.result.skippedIds.length : 0;
        if (r.result.navigatedFallback) navigateHostRoute('/');
        selectedBatchIds.clear();
        multiSelectMode = false;
        if (host.chatPaneRefs && host.chatPaneRefs.batchBtn) host.chatPaneRefs.batchBtn.style.color = '';
        const verb = op === 'delete' ? '删除' : op === 'archive' ? '归档' : '移动';
        showToast(skN > 0 ? `已批量${verb} ${okN} 条对话（跳过 ${skN} 条运行中或受限项）` : `已批量${verb} ${okN} 条对话`);
        scheduleCatalogSync();
        renderChatSidebarList();
      }
    }

    function bucketChatTimeGroup(item, nowMs) {
      if (item.pinned) return 'pinned';
      const ts = Number(item.updatedAt) || 0;
      if (ts <= 0) return 'earlier';
      const now = new Date(nowMs);
      const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const startYesterday = startToday - 86400000;
      const start7d = startToday - 6 * 86400000;
      if (ts >= startToday) return 'today';
      if (ts >= startYesterday) return 'yesterday';
      if (ts >= start7d) return 'week';
      return 'earlier';
    }

    function bindChatDropZone(targetEl, onDropCid) {
      targetEl.classList.add('ag-prism-sb-dropzone');
      targetEl.addEventListener('dragover', (e) => {
        if (!draggingCid) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        targetEl.setAttribute('data-drop-active', '1');
      });
      targetEl.addEventListener('dragleave', (e) => {
        if (!e.relatedTarget || !targetEl.contains(e.relatedTarget)) {
          targetEl.removeAttribute('data-drop-active');
        }
      });
      targetEl.addEventListener('drop', (e) => {
        targetEl.removeAttribute('data-drop-active');
        if (!draggingCid) return;
        e.preventDefault();
        e.stopPropagation();
        const cid = draggingCid;
        draggingCid = null;
        onDropCid(cid);
      });
    }

    function updateBatchBarUi() {
      if (!host.chatPaneRefs || !host.chatPaneRefs.batchBar) return;
      const refs = host.chatPaneRefs;
      refs.batchBar.style.display = multiSelectMode ? 'flex' : 'none';
      const n = selectedBatchIds.size;
      refs.batchCountLbl.textContent = `已选 ${n} 项`;
      refs.bMove.disabled = n === 0;
      refs.bArch.disabled = n === 0;
      refs.bDel.disabled = n === 0;
    }

    function renderChatSessionRow(item, isActive) {
      const rowWrap = el('div', 'ag-prism-sb-row-wrap');
      const btn = el('button', 'ag-prism-sb-row');
      btn.type = 'button';
      btn.setAttribute('data-cascade-id', item.cascadeId);
      btn.setAttribute('data-active', isActive ? '1' : '0');
      if (item.archived) btn.setAttribute('data-archived', '1');

      const canBatch = multiSelectMode && !item.archived;
      if (canBatch) {
        const checked = selectedBatchIds.has(item.cascadeId);
        const ck = el('span', 'ag-prism-sb-check');
        ck.setAttribute('data-checked', checked ? '1' : '0');
        if (checked) ck.appendChild(makeMonoSvg('check', 10.5));
        btn.appendChild(ck);
      } else if (item.pinned) {
        const pm = el('span', 'ag-prism-sb-pin-mark');
        pm.appendChild(makeMonoSvg('pin', 11));
        btn.appendChild(pm);
      }

      btn.appendChild(el('span', 'ag-prism-sb-row-title', item.title || item.cascadeId));
      if (item.status === 'running') btn.appendChild(el('span', 'ag-prism-sb-spin'));
      else if (item.status === 'blocked') btn.appendChild(el('span', 'ag-prism-sb-amber'));

      if (!multiSelectMode && !item.archived && item.placement?.kind === 'knowledge') {
        btn.draggable = true;
        btn.addEventListener('dragstart', (e) => {
          draggingCid = item.cascadeId;
          btn.setAttribute('data-dragging', '1');
          if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            try { e.dataTransfer.setData('text/x-ag-prism-chat-cid', item.cascadeId); } catch {}
          }
          if (host.chatPaneRefs && host.chatPaneRefs.pinDropEl) {
            host.chatPaneRefs.pinDropEl.style.display = 'flex';
          }
        });
        btn.addEventListener('dragend', () => {
          draggingCid = null;
          btn.removeAttribute('data-dragging');
          if (host.chatPaneRefs && host.chatPaneRefs.pinDropEl) {
            host.chatPaneRefs.pinDropEl.style.display = 'none';
          }
        });
      }

      btn.addEventListener('click', () => {
        if (canBatch) {
          if (selectedBatchIds.has(item.cascadeId)) selectedBatchIds.delete(item.cascadeId);
          else selectedBatchIds.add(item.cascadeId);
          renderChatSidebarList();
          return;
        }
        const view = `/c/${encodeURIComponent(item.cascadeId)}`;
        void callDaemonRpc('navigate', { mode: 'chat', view, navRev: snapshot.navRev });
        navigateHostRoute(view);
      });
      btn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        openChatSessionMenu(item, btn);
      });

      const acts = el('div', 'ag-prism-sb-row-actions');
      if (!multiSelectMode) {
        const moreBtn = el('button', 'ag-prism-sb-act-btn');
        moreBtn.type = 'button';
        moreBtn.title = '更多操作';
        moreBtn.appendChild(makeMonoSvg('more', 13));
        moreBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openChatSessionMenu(item, moreBtn);
        });
        acts.appendChild(moreBtn);
      }

      rowWrap.appendChild(btn);
      rowWrap.appendChild(acts);
      return rowWrap;
    }

    let lastChatListRenderSig = '';

    function buildChatListRenderSig(activeCid, q, proj, dayKey) {
      const fmtItem = (it) =>
        `${it.cascadeId}|${it.title || ''}|${it.status || ''}|${it.statusStartedAt || 0}|${it.pinned ? 1 : 0}|${it.archived ? 1 : 0}|${it.unread ? 1 : 0}|${it.updatedAt || 0}|${it.workspace || ''}|${it.workspacePath || ''}`;
      const selIds = multiSelectMode ? [...selectedBatchIds].sort().join(',') : '';
      const kRootSig = (proj.knowledge.rootItems || []).map(fmtItem).join(';');
      const kFoldersSig = (proj.knowledge.folders || [])
        .map((f) => `${f.id}|${f.name || ''}|${f.collapsed ? 1 : 0}:${(f.items || []).map(fmtItem).join(',')}`)
        .join(';');
      const sProjSig = (proj.spark.projects || [])
        .map((p) => `${p.id}|${p.name || ''}|${p.collapsed ? 1 : 0}|${p.sharedWithCode ? 1 : 0}:${(p.items || []).map(fmtItem).join(',')}`)
        .join(';');
      const archCount = Number(proj.archived?.totalCount ?? 0);
      const archSig = ((proj.archived && proj.archived.items) || []).map(fmtItem).join(';');
      return `${dayKey}#${activeCid}#${q}#${multiSelectMode ? 1 : 0}#${selIds}#${inlineFolderOpen ? 1 : 0}#${inlineBoxOpen ? 1 : 0}#${archivedOpen ? 1 : 0}#${draggingCid || ''}#${kRootSig}#${kFoldersSig}#${sProjSig}#${archCount}:${archSig}`;
    }

    function renderChatSidebarList() {
      if (!host.chatPaneRefs || !snapshot || snapshot.activeMode !== 'chat') return;
      const activeEl = document.activeElement;
      if (activeEl && activeEl.classList && activeEl.classList.contains('ag-prism-sb-inline-input')) {
        return;
      }

      runGuarded(() => {
        const list = host.chatPaneRefs.list;
        const q = searchQuery.trim().toLowerCase();
        const activeView = snapshot.currentView || '/';
        const activeMatch = activeView.match(/^\/c\/([^/?#]+)/);
        const activeCid = activeMatch ? decodeURIComponent(activeMatch[1]) : '';
        const proj = snapshot.chatSidebar || { knowledge: { rootItems: [], folders: [] }, spark: { projects: [] }, archived: { items: [], totalCount: 0 } };
        const nowDate = new Date();
        const dayKey = `${nowDate.getFullYear()}-${nowDate.getMonth()}-${nowDate.getDate()}`;
        const renderSig = buildChatListRenderSig(activeCid, q, proj, dayKey);
        if (renderSig === lastChatListRenderSig && list.childElementCount > 0) {
          updateBatchBarUi();
          return;
        }
        lastChatListRenderSig = renderSig;

        const prevScrollTop = typeof list.scrollTop === 'number' ? list.scrollTop : 0;
        clearNode(list);
        updateBatchBarUi();

        const kTotal =
          (proj.knowledge.rootItems ? proj.knowledge.rootItems.length : 0) +
          (proj.knowledge.folders || []).reduce((acc, f) => acc + (f.items ? f.items.length : 0), 0);

        const kSec = el('div', 'ag-prism-sb-sec');
        const kLead = el('span', 'ag-prism-sb-sec-lead');
        kLead.appendChild(makeMonoSvg('sparkle', 12));
        kLead.appendChild(el('span', '', 'Pure'));
        kSec.appendChild(kLead);
        const kRight = el('span', 'ag-prism-sb-sec-right');
        kRight.appendChild(el('span', 'ag-prism-sb-cnt', String(kTotal)));
        const addF = el('button', 'ag-prism-sb-icon-btn');
        addF.type = 'button';
        addF.title = '新建子文件夹';
        addF.appendChild(makeMonoSvg('plus', 12));
        addF.addEventListener('click', () => {
          inlineFolderOpen = !inlineFolderOpen;
          renderChatSidebarList();
        });
        kRight.appendChild(addF);
        kSec.appendChild(kRight);
        bindChatDropZone(kSec, (cid) => {
          void callDaemonRpc('move-chat-session', { cascadeId: cid, placement: { kind: 'knowledge', folderId: null } });
          showToast('已移回 Pure 根目录');
        });
        list.appendChild(kSec);

        // 拖拽时浮现的快捷置顶落点区
        const pinDropEl = el('div', 'ag-prism-sb-pin-drop');
        pinDropEl.style.display = draggingCid ? 'flex' : 'none';
        pinDropEl.appendChild(makeMonoSvg('pin', 11));
        pinDropEl.appendChild(el('span', '', '拖到此处快速置顶'));
        bindChatDropZone(pinDropEl, (cid) => {
          void callDaemonRpc('pin-chat-session', { cascadeId: cid, pinned: true });
          showToast('已置顶该对话');
        });
        host.chatPaneRefs.pinDropEl = pinDropEl;
        list.appendChild(pinDropEl);

        if (inlineFolderOpen) {
          const box = el('div', 'ag-prism-sb-inline-box');
          const inp = el('input', 'ag-prism-sb-inline-input');
          inp.type = 'text';
          inp.placeholder = '输入文件夹名回车创建…';
          inp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && inp.value.trim()) {
              inlineFolderOpen = false;
              void callDaemonRpc('create-knowledge-folder', { name: inp.value.trim() });
            } else if (e.key === 'Escape') {
              inlineFolderOpen = false;
              renderChatSidebarList();
            }
          });
          box.appendChild(inp);
          list.appendChild(box);
          setTimeout(() => { if (typeof inp.focus === 'function') inp.focus(); }, 10);
        }

        const kRoot = (proj.knowledge.rootItems || []).filter((it) => !q || (it.title || '').toLowerCase().includes(q));
        if (kRoot.length > 0) {
          const nowMs = Date.now();
          const groupMeta = [
            { key: 'pinned', label: '置顶' },
            { key: 'today', label: '今天' },
            { key: 'yesterday', label: '昨天' },
            { key: 'week', label: '7 天内' },
            { key: 'earlier', label: '更早' },
          ];
          const buckets = { pinned: [], today: [], yesterday: [], week: [], earlier: [] };
          for (let i = 0; i < kRoot.length; i++) {
            const gKey = bucketChatTimeGroup(kRoot[i], nowMs);
            buckets[gKey].push(kRoot[i]);
          }
          for (let gi = 0; gi < groupMeta.length; gi++) {
            const gm = groupMeta[gi];
            const items = buckets[gm.key];
            if (!items || items.length === 0) continue;
            const lbl = el('div', 'ag-prism-sb-time-lbl', gm.label);
            lbl.setAttribute('data-time-group', gm.key);
            if (gm.key === 'pinned') {
              bindChatDropZone(lbl, (cid) => {
                void callDaemonRpc('pin-chat-session', { cascadeId: cid, pinned: true });
                showToast('已置顶该对话');
              });
            }
            list.appendChild(lbl);
            for (let j = 0; j < items.length; j++) {
              list.appendChild(renderChatSessionRow(items[j], items[j].cascadeId === activeCid));
            }
          }
        }

        const kFolders = proj.knowledge.folders || [];
        for (let i = 0; i < kFolders.length; i++) {
          const f = kFolders[i];
          const fItems = (f.items || []).filter((it) => !q || (it.title || '').toLowerCase().includes(q));
          const gw = el('div', 'ag-prism-sb-group-wrap');
          bindChatDropZone(gw, (cid) => {
            void callDaemonRpc('move-chat-session', { cascadeId: cid, placement: { kind: 'knowledge', folderId: f.id } });
            showToast(`已移入文件夹「${f.name}」`);
          });
          const gh = el('button', 'ag-prism-sb-group-head');
          gh.type = 'button';
          gh.setAttribute('data-collapsed', f.collapsed ? '1' : '0');
          const ch = el('span', 'ag-prism-sb-chev');
          ch.appendChild(makeMonoSvg('chevron', 11));
          gh.appendChild(ch);
          gh.appendChild(makeMonoSvg('folder', 12.5));
          gh.appendChild(el('span', 'ag-prism-sb-row-title', f.name));
          gh.appendChild(el('span', 'ag-prism-sb-cnt', String(fItems.length)));

          const fGrid = el('div', 'ag-prism-sb-folder-grid');
          fGrid.setAttribute('data-collapsed', f.collapsed ? '1' : '0');
          const fOver = el('div', 'ag-prism-sb-folder-over');
          for (let j = 0; j < fItems.length; j++) {
            fOver.appendChild(renderChatSessionRow(fItems[j], fItems[j].cascadeId === activeCid));
          }
          fGrid.appendChild(fOver);

          gh.addEventListener('click', () => {
            const nextCollapsed = !f.collapsed;
            lastChatListRenderSig = '';
            gh.setAttribute('data-collapsed', nextCollapsed ? '1' : '0');
            fGrid.setAttribute('data-collapsed', nextCollapsed ? '1' : '0');
            void callDaemonRpc('set-knowledge-folder-collapsed', { folderId: f.id, collapsed: nextCollapsed });
          });
          gh.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            openKnowledgeFolderMenu(f, gh);
          });

          const fActs = el('div', 'ag-prism-sb-row-actions');
          const fNew = el('button', 'ag-prism-sb-act-btn');
          fNew.type = 'button';
          fNew.title = '在此文件夹新建对话';
          fNew.appendChild(makeMonoSvg('plus', 12));
          fNew.addEventListener('click', (e) => {
            e.stopPropagation();
            greetingSeed = Math.floor(Math.random() * 100);
            void callDaemonRpc('navigate', { mode: 'chat', view: '/', navRev: snapshot.navRev }).then(() => {
              void callDaemonRpc('set-chat-draft', {
                draft: { kind: 'knowledge', folderId: f.id, sparkProjectId: null },
                navRev: snapshot.navRev,
                draftRev: snapshot.draftRev,
              });
            });
            navigateHostRoute('/');
          });
          const fMore = el('button', 'ag-prism-sb-act-btn');
          fMore.type = 'button';
          fMore.title = '文件夹操作';
          fMore.appendChild(makeMonoSvg('more', 13));
          fMore.addEventListener('click', (e) => {
            e.stopPropagation();
            openKnowledgeFolderMenu(f, fMore);
          });
          fActs.appendChild(fNew);
          fActs.appendChild(fMore);

          gw.appendChild(gh);
          gw.appendChild(fActs);
          list.appendChild(gw);
          list.appendChild(fGrid);
        }
        if (kRoot.length === 0 && kFolders.length === 0) {
          list.appendChild(el('div', 'ag-prism-sb-empty', '暂无对话'));
        }

        const sProjects = proj.spark.projects || [];
        const sSec = el('div', 'ag-prism-sb-sec');
        const sLead = el('span', 'ag-prism-sb-sec-lead');
        sLead.appendChild(makeMonoSvg('box', 12));
        sLead.appendChild(el('span', '', 'Spark'));
        sSec.appendChild(sLead);
        const sRight = el('span', 'ag-prism-sb-sec-right');
        sRight.appendChild(el('span', 'ag-prism-sb-cnt', String(sProjects.length)));
        const addBox = el('button', 'ag-prism-sb-icon-btn');
        addBox.type = 'button';
        addBox.title = '新建工作文件夹';
        addBox.appendChild(makeMonoSvg('plus', 12));
        addBox.addEventListener('click', () => {
          inlineBoxOpen = !inlineBoxOpen;
          renderChatSidebarList();
        });
        sRight.appendChild(addBox);
        sSec.appendChild(sRight);
        list.appendChild(sSec);

        if (inlineBoxOpen) {
          const box = el('div', 'ag-prism-sb-inline-box');
          const inp = el('input', 'ag-prism-sb-inline-input');
          inp.type = 'text';
          inp.placeholder = '输入工作文件夹名回车创建…';
          inp.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter' && inp.value.trim()) {
              const nm = inp.value.trim();
              inlineBoxOpen = false;
              const created = await callDaemonRpc('create-spark-box', { name: nm });
              if (created && created.ok && created.result && created.result.selectionToken) {
                await callDaemonRpc('select-spark-project', {
                  selectionToken: created.result.selectionToken,
                  navRev: snapshot.navRev,
                  draftRev: snapshot.draftRev,
                });
              }
            } else if (e.key === 'Escape') {
              inlineBoxOpen = false;
              renderChatSidebarList();
            }
          });
          box.appendChild(inp);
          list.appendChild(box);
          setTimeout(() => { if (typeof inp.focus === 'function') inp.focus(); }, 10);
        }

        if (sProjects.length === 0) {
          list.appendChild(el('div', 'ag-prism-sb-empty', '切至 Spark 选择本地目录或新建工作文件夹'));
        } else {
          for (let i = 0; i < sProjects.length; i++) {
            const p = sProjects[i];
            const pItems = (p.items || []).filter((it) => !q || (it.title || '').toLowerCase().includes(q));
            const gw = el('div', 'ag-prism-sb-group-wrap');
            const gh = el('button', 'ag-prism-sb-group-head');
            gh.type = 'button';
            gh.setAttribute('data-collapsed', p.collapsed ? '1' : '0');
            const ch = el('span', 'ag-prism-sb-chev');
            ch.appendChild(makeMonoSvg('chevron', 11));
            gh.appendChild(ch);
            gh.appendChild(makeMonoSvg('folder', 12.5));
            gh.appendChild(el('span', 'ag-prism-sb-row-title', p.name));
            if (p.sharedWithCode) gh.appendChild(el('span', 'ag-prism-sb-row-tag', '共享'));
            gh.appendChild(el('span', 'ag-prism-sb-cnt', String(pItems.length)));

            const pGrid = el('div', 'ag-prism-sb-folder-grid');
            pGrid.setAttribute('data-collapsed', p.collapsed ? '1' : '0');
            const pOver = el('div', 'ag-prism-sb-folder-over');
            for (let j = 0; j < pItems.length; j++) {
              pOver.appendChild(renderChatSessionRow(pItems[j], pItems[j].cascadeId === activeCid));
            }
            pGrid.appendChild(pOver);

            gh.addEventListener('click', () => {
              const nextCollapsed = !p.collapsed;
              lastChatListRenderSig = '';
              gh.setAttribute('data-collapsed', nextCollapsed ? '1' : '0');
              pGrid.setAttribute('data-collapsed', nextCollapsed ? '1' : '0');
              void callDaemonRpc('set-spark-project-collapsed', { sparkProjectId: p.id, collapsed: nextCollapsed });
            });
            gh.addEventListener('contextmenu', (e) => {
              e.preventDefault();
              openSparkWorkspaceMenu(p, gh);
            });

            const pActs = el('div', 'ag-prism-sb-row-actions');
            const pNew = el('button', 'ag-prism-sb-act-btn');
            pNew.type = 'button';
            pNew.title = '在此工作区新建对话';
            pNew.appendChild(makeMonoSvg('plus', 12));
            pNew.addEventListener('click', (e) => {
              e.stopPropagation();
              greetingSeed = Math.floor(Math.random() * 100);
              void callDaemonRpc('navigate', { mode: 'chat', view: '/', navRev: snapshot.navRev }).then(() => {
                void callDaemonRpc('set-chat-draft', {
                  draft: { kind: 'spark', folderId: null, sparkProjectId: p.id },
                  navRev: snapshot.navRev,
                  draftRev: snapshot.draftRev,
                });
              });
              navigateHostRoute('/');
            });
            const pMore = el('button', 'ag-prism-sb-act-btn');
            pMore.type = 'button';
            pMore.title = '工作区操作';
            pMore.appendChild(makeMonoSvg('more', 13));
            pMore.addEventListener('click', (e) => {
              e.stopPropagation();
              openSparkWorkspaceMenu(p, pMore);
            });
            pActs.appendChild(pNew);
            pActs.appendChild(pMore);

            gw.appendChild(gh);
            gw.appendChild(pActs);
            list.appendChild(gw);
            list.appendChild(pGrid);
          }
        }

        const archivedItems = ((proj.archived && proj.archived.items) || []).filter(
          (it) => !q || (it.title || '').toLowerCase().includes(q)
        );
        if (archivedItems.length > 0 || archivedOpen) {
          const dock = el('div', 'ag-prism-sb-archive-dock');
          const ah = el('button', 'ag-prism-sb-group-head');
          ah.type = 'button';
          ah.setAttribute('data-collapsed', archivedOpen ? '0' : '1');
          const ach = el('span', 'ag-prism-sb-chev');
          ach.appendChild(makeMonoSvg('chevron', 11));
          ah.appendChild(ach);
          ah.appendChild(makeMonoSvg('archive', 12));
          ah.appendChild(el('span', 'ag-prism-sb-row-title', '已归档'));
          ah.appendChild(el('span', 'ag-prism-sb-cnt', String(archivedItems.length)));

          const aGrid = el('div', 'ag-prism-sb-folder-grid');
          aGrid.setAttribute('data-collapsed', archivedOpen ? '0' : '1');
          const aOver = el('div', 'ag-prism-sb-folder-over');
          for (let i = 0; i < archivedItems.length; i++) {
            aOver.appendChild(renderChatSessionRow(archivedItems[i], archivedItems[i].cascadeId === activeCid));
          }
          aGrid.appendChild(aOver);

          ah.addEventListener('click', () => {
            archivedOpen = !archivedOpen;
            lastChatListRenderSig = '';
            ah.setAttribute('data-collapsed', archivedOpen ? '0' : '1');
            aGrid.setAttribute('data-collapsed', archivedOpen ? '0' : '1');
          });
          dock.appendChild(ah);
          dock.appendChild(aGrid);
          list.appendChild(dock);
        }

        if (prevScrollTop > 0) list.scrollTop = prevScrollTop;
      });
    }

    function resolveMainCanvasHost() {
      // 优先挂到 [data-testid="sidebar-split"] 的右侧常驻主内容面板：它在 '/' <-> '/c/xxx' 路由切换时永远不会被 React 卸载！
      const split = document.querySelector('[data-testid="sidebar-split"]');
      if (split && split.children && split.children.length >= 2) {
        const rightPane = split.children[split.children.length - 1];
        if (rightPane && rightPane !== host.navEl) return rightPane;
      }
      return (
        document.querySelector('main') ||
        document.querySelector('[data-testid="conversation-view"]')?.parentElement ||
        document.querySelector('.agy-home')?.parentElement ||
        null
      );
    }

    function renderChatHome() {
      runGuarded(() => {
        const shouldShow = Boolean(host.engaged && snapshot && snapshot.activeMode === 'chat' && snapshot.currentView === '/');
        const mainHost = resolveMainCanvasHost();

        if (!mainHost) {
          if (host.chatHomeEl) host.chatHomeEl.setAttribute('data-visible', '0');
          return;
        }

        const detached = Boolean(host.chatHomeEl && host.chatHomeEl.isConnected === false);
        if (!host.chatHomeEl || detached || host.chatHomeHostEl !== mainHost) {
          if (host.chatHomeEl) host.chatHomeEl.remove();
          const container = markOwnedRoot(el('div', 'ag-prism-chat-home'));
          container.setAttribute('data-testid', 'prism-live-chat-home');
          container.setAttribute('data-visible', '0');

          const aura = el('div', 'ag-prism-chat-aura');
          aura.appendChild(el('div', 'ag-prism-aura-orb ag-prism-orb-a'));
          aura.appendChild(el('div', 'ag-prism-aura-orb ag-prism-orb-b'));
          container.appendChild(aura);

          const inner = el('div', 'ag-prism-chat-home-inner');
          const head = el('div', 'ag-prism-hero-head');
          const eyeRow = el('div', 'ag-prism-hero-eyebrow-row');
          const mark = el('span', 'ag-prism-hero-mark');
          const eyeTxt = el('span', 'ag-prism-hero-eyebrow');
          eyeRow.appendChild(mark);
          eyeRow.appendChild(eyeTxt);
          head.appendChild(eyeRow);
          const h1 = el('h1', 'ag-prism-hero-h1');
          head.appendChild(h1);
          inner.appendChild(head);

          const wrap = el('div', 'ag-prism-vessel-wrap');
          const vessel = el('div', 'ag-prism-vessel');
          vessel.addEventListener('focusin', () => {
            wrap.setAttribute('data-focused', '1');
            aura.setAttribute('data-focused', '1');
          });
          vessel.addEventListener('focusout', (e) => {
            if (!e.relatedTarget || !vessel.contains(e.relatedTarget)) {
              wrap.setAttribute('data-focused', '0');
              aura.setAttribute('data-focused', '0');
            }
          });
          vessel.addEventListener('dragover', (e) => {
            if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
              wrap.setAttribute('data-drag-over', '1');
            }
          });
          vessel.addEventListener('dragleave', (e) => {
            if (!e.relatedTarget || !vessel.contains(e.relatedTarget)) {
              wrap.removeAttribute('data-drag-over');
            }
          });
          vessel.addEventListener('drop', async (e) => {
            wrap.removeAttribute('data-drag-over');
            const fl = e.dataTransfer && e.dataTransfer.files;
            if (!fl || fl.length === 0) return;
            e.preventDefault();
            e.stopPropagation();
            const isSpk = snapshot?.chatDraft?.kind === 'spark';
            const spkId = snapshot?.chatDraft?.sparkProjectId || null;
            if (isSpk && spkId) {
              const all = Array.from(fl);
              const imgs = all.filter((f) => (f.type || '').startsWith('image/'));
              const docs = all.filter((f) => !(f.type || '').startsWith('image/'));
              if (imgs.length > 0) await addPendingAttachments(imgs);
              if (docs.length > 0) {
                const names = await importFilesToSpark(docs, spkId);
                if (names.length > 0) {
                  const refsTxt = names.map((n) => `@${n}`).join(' ');
                  composerText = composerText ? `${composerText} ${refsTxt}` : `请帮我处理刚放入文件夹的 ${refsTxt}：`;
                  input.textContent = composerText;
                  renderChatHome();
                }
              }
            } else {
              await addPendingAttachments(fl);
            }
          });

          const attStrip = el('div', 'ag-prism-att-strip');
          attStrip.setAttribute('data-testid', 'prism-chat-att-strip');
          vessel.appendChild(attStrip);

          const input = el('div', 'ag-prism-chat-input');
          input.setAttribute('contenteditable', 'true');
          input.addEventListener('paste', (e) => {
            const dt = e.clipboardData;
            if (!dt) return;
            const pastedFiles = [];
            if (dt.files && dt.files.length > 0) {
              for (let i = 0; i < dt.files.length; i++) pastedFiles.push(dt.files[i]);
            } else if (dt.items && dt.items.length > 0) {
              for (let i = 0; i < dt.items.length; i++) {
                if (dt.items[i].kind === 'file') {
                  const f = dt.items[i].getAsFile();
                  if (f) pastedFiles.push(f);
                }
              }
            }
            if (pastedFiles.length > 0) {
              e.preventDefault();
              void addPendingAttachments(pastedFiles);
            }
          });
          input.addEventListener('input', () => {
            composerText = input.textContent || '';
            const ready = Boolean(composerText.trim() || pendingAttachments.length > 0);
            sendBtn.setAttribute('data-ready', ready ? '1' : '0');
            sendBtn.disabled = !ready;
            const stRow = host.chatHomeEl && host.chatHomeEl._refs && host.chatHomeEl._refs.starterRow;
            if (stRow) {
              const showChips = getEffectiveChatPolicy().showStarterChips && !composerText.trim() && pendingAttachments.length === 0;
              stRow.setAttribute('data-hidden', showChips ? '0' : '1');
            }
          });
          input.addEventListener('keydown', (e) => {
            if (e.isComposing || e.keyCode === 229) return;
            if (e.key === 'Enter' && (!e.shiftKey && !e.altKey || e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void handleSendFirstMessage();
            }
          });
          vessel.appendChild(input);

          const bar = el('div', 'ag-prism-chat-bar');
          const left = el('div', 'ag-prism-chat-bar-g');
          const plusBtn = el('button', 'ag-prism-sb-icon-btn');
          plusBtn.type = 'button';
          plusBtn.title = '附加文件与选项';
          plusBtn.appendChild(makeMonoSvg('plus', 15));
          plusBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openChatPlusPopover(plusBtn);
          });
          left.appendChild(plusBtn);

          const subSeg = el('div', 'ag-prism-subseg');
          subSeg.appendChild(el('span', 'ag-prism-subslider'));
          const kBtn = el('button', 'ag-prism-subbtn', 'Pure');
          kBtn.type = 'button';
          kBtn.addEventListener('click', () => {
            if (snapshot && snapshot.chatDraft.kind !== 'knowledge') {
              void callDaemonRpc('set-chat-draft', {
                draft: { kind: 'knowledge', folderId: null, sparkProjectId: null },
                navRev: snapshot.navRev,
                draftRev: snapshot.draftRev,
              });
            }
          });
          const sBtn = el('button', 'ag-prism-subbtn', 'Spark');
          sBtn.type = 'button';
          sBtn.addEventListener('click', () => {
            if (snapshot && snapshot.chatDraft.kind !== 'spark') {
              const firstId = snapshot.sparkProjects && snapshot.sparkProjects[0] ? snapshot.sparkProjects[0].id : null;
              void callDaemonRpc('set-chat-draft', {
                draft: { kind: 'spark', folderId: null, sparkProjectId: snapshot.chatDraft.sparkProjectId || firstId },
                navRev: snapshot.navRev,
                draftRev: snapshot.draftRev,
              });
            }
          });
          subSeg.appendChild(kBtn);
          subSeg.appendChild(sBtn);
          left.appendChild(subSeg);
          bar.appendChild(left);

          const right = el('div', 'ag-prism-chat-bar-g');
          const modelBtn = el('button', 'ag-prism-ghost-btn');
          modelBtn.type = 'button';
          modelBtn.appendChild(makeBrandSvg(OFFICIAL_GEMINI_COLOR_SVG, 13));
          const modelLbl = el('span', '', '');
          modelBtn.appendChild(modelLbl);
          modelBtn.appendChild(makeMonoSvg('chevronDown', 11));
          modelBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openModelMenu(modelBtn);
          });
          right.appendChild(modelBtn);

          const sendBtn = el('button', 'ag-prism-send-btn');
          sendBtn.type = 'button';
          sendBtn.appendChild(makeMonoSvg('arrowUp', 15));
          sendBtn.addEventListener('click', () => void handleSendFirstMessage());
          right.appendChild(sendBtn);
          bar.appendChild(right);
          vessel.appendChild(bar);

          // Spark 一体延展底座（0px 垂直跳动）
          const trayGrid = el('div', 'ag-prism-tray-grid');
          const trayOver = el('div', 'ag-prism-tray-over');
          const trayBar = el('div', 'ag-prism-tray-bar');
          const trayLeft = el('div', 'ag-prism-chat-bar-g');

          const projBtn = el('button', 'ag-prism-ghost-btn');
          projBtn.type = 'button';
          projBtn.appendChild(makeMonoSvg('folder', 13));
          const projLbl = el('span', '', '工作文件夹');
          projBtn.appendChild(projLbl);
          projBtn.appendChild(makeMonoSvg('chevronDown', 11));
          projBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openSparkProjectMenu(projBtn);
          });
          trayLeft.appendChild(projBtn);

          const filesBtn = el('button', 'ag-prism-ghost-btn');
          filesBtn.type = 'button';
          filesBtn.title = '预览或导入工作文件夹内的文件';
          filesBtn.appendChild(makeMonoSvg('file', 13));
          filesBtn.appendChild(el('span', '', '目录文件'));
          filesBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openSparkFilesPopover(filesBtn, snapshot?.chatDraft?.sparkProjectId);
          });
          trayLeft.appendChild(filesBtn);

          const fenceBtn = el('button', 'ag-prism-ghost-btn');
          fenceBtn.type = 'button';
          fenceBtn.appendChild(makeMonoSvg('shield', 13));
          const fenceLbl = el('span', '', '安全保护');
          fenceBtn.appendChild(fenceLbl);
          fenceBtn.appendChild(makeMonoSvg('chevronDown', 11));
          fenceBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openSparkFencePopover(fenceBtn);
          });
          trayLeft.appendChild(fenceBtn);
          trayBar.appendChild(trayLeft);

          const infoBtn = el('button', 'ag-prism-sb-icon-btn');
          infoBtn.type = 'button';
          infoBtn.appendChild(makeMonoSvg('info', 13.5));
          infoBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openSparkFencePopover(infoBtn);
          });
          trayBar.appendChild(infoBtn);

          trayOver.appendChild(trayBar);
          trayGrid.appendChild(trayOver);
          vessel.appendChild(trayGrid);
          wrap.appendChild(vessel);
          inner.appendChild(wrap);

          const starterRow = el('div', 'ag-prism-starter-chips');
          starterRow.setAttribute('data-testid', 'prism-chat-starter-chips');
          inner.appendChild(starterRow);
          container.appendChild(inner);

          container._refs = {
            aura, mark, eyeTxt, h1, wrap, attStrip, input, subSeg, kBtn, sBtn,
            modelLbl, sendBtn, projLbl, fenceLbl, filesBtn, starterRow,
          };
          if (host.chatHomeHostEl && host.chatHomeHostPrevPos !== null) {
            host.chatHomeHostEl.style.position = host.chatHomeHostPrevPos;
            host.chatHomeHostPrevPos = null;
          }
          if (typeof getComputedStyle === 'function' && getComputedStyle(mainHost).position === 'static') {
            host.chatHomeHostPrevPos = mainHost.style.position || '';
            mainHost.style.position = 'relative';
          }
          mainHost.appendChild(container);
          host.chatHomeEl = container;
          host.chatHomeHostEl = mainHost;
        }

        const refs = host.chatHomeEl._refs;
        if (!shouldShow) {
          host.chatHomeEl.setAttribute('data-visible', '0');
          refs.aura.setAttribute('data-paused', '1');
          return;
        }

        // 原地增量热更（保证 Knowledge <-> Spark 切换 0px 跳动且所有 CSS 过渡自然执行）
        const isSpark = snapshot.chatDraft && snapshot.chatDraft.kind === 'spark';
        const paused = document.hidden || currentCfg.motionLevel === 'off';
        host.chatHomeEl.setAttribute('data-visible', '1');
        refs.aura.setAttribute('data-kind', isSpark ? 'spark' : 'knowledge');
        refs.aura.setAttribute('data-paused', paused ? '1' : '0');
        refs.wrap.setAttribute('data-kind', isSpark ? 'spark' : 'knowledge');
        refs.wrap.setAttribute('data-spark-tray', isSpark ? '1' : '0');

        const wantBrand = isSpark ? 'antigravity' : 'gemini';
        if (refs.mark.getAttribute('data-brand') !== wantBrand) {
          clearNode(refs.mark);
          refs.mark.appendChild(makeBrandSvg(isSpark ? OFFICIAL_ANTIGRAVITY_COLOR_SVG : OFFICIAL_GEMINI_COLOR_SVG, 22));
          refs.mark.setAttribute('data-brand', wantBrand);
          refs.mark.setAttribute('data-pop', '0');
          if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => refs.mark.setAttribute('data-pop', '1'));
          } else {
            refs.mark.setAttribute('data-pop', '1');
          }
        }

        const hero = formatHero(getCurrentLang(), getUserDisplayName(), greetingSeed);
        if (refs.eyeTxt.textContent !== hero.eyebrow) refs.eyeTxt.textContent = hero.eyebrow;
        if (refs.h1.textContent !== hero.headline) refs.h1.textContent = hero.headline;

        refs.input.setAttribute('data-placeholder', isSpark ? '交给我一件要处理的事务…' : '问点什么，或整理一份想法…');
        if (document.activeElement !== refs.input && refs.input.textContent !== composerText) {
          refs.input.textContent = composerText;
        }
        refs.subSeg.setAttribute('data-submode', isSpark ? 'spark' : 'knowledge');
        refs.kBtn.setAttribute('data-active', isSpark ? '0' : '1');
        refs.sBtn.setAttribute('data-active', isSpark ? '1' : '0');

        const effShort = (CHAT_EFFORT_TIERS.find((t) => t.id === selectedEffort) || CHAT_EFFORT_TIERS[2]).label;
        refs.modelLbl.textContent = `${selectedModel} · ${effShort}`;
        const ready = Boolean(composerText.trim() || pendingAttachments.length > 0);
        refs.sendBtn.setAttribute('data-ready', ready ? '1' : '0');
        refs.sendBtn.disabled = !ready;

        const proj = (snapshot.sparkProjects || []).find((p) => p.id === snapshot.chatDraft?.sparkProjectId) || null;
        refs.projLbl.textContent = proj ? proj.name : '工作文件夹';
        refs.fenceLbl.textContent = proj && proj.sharedWithCode ? '共享目录 · 已保护' : '安全保护';

        // 淡雅起手灵感胶囊（按 Pure / Spark 切换，可一键关闭持久化）
        const policy = getEffectiveChatPolicy();
        const showChips = Boolean(policy.showStarterChips && !composerText.trim() && pendingAttachments.length === 0);
        refs.starterRow.setAttribute('data-hidden', showChips ? '0' : '1');
        const chipsKind = isSpark ? 'spark' : 'pure';
        if (refs.starterRow.getAttribute('data-chips-kind') !== chipsKind) {
          refs.starterRow.setAttribute('data-chips-kind', chipsKind);
          clearNode(refs.starterRow);
          const preset = CHAT_STARTER_CHIPS[chipsKind] || CHAT_STARTER_CHIPS.pure;
          for (let i = 0; i < preset.length; i++) {
            const item = preset[i];
            const cb = el('button', 'ag-prism-starter-chip', item.label);
            cb.type = 'button';
            cb.addEventListener('click', () => {
              composerText = item.prompt;
              refs.input.textContent = item.prompt;
              renderChatHome();
              try {
                refs.input.focus();
                const sel = W.getSelection && W.getSelection();
                const range = document.createRange && document.createRange();
                if (sel && range) {
                  range.selectNodeContents(refs.input);
                  range.collapse(false);
                  sel.removeAllRanges();
                  sel.addRange(range);
                }
              } catch {}
            });
            refs.starterRow.appendChild(cb);
          }
          const dismissBtn = el('button', 'ag-prism-starter-dismiss');
          dismissBtn.type = 'button';
          dismissBtn.title = '隐藏快捷建议（可在「能力与扩展」中重新开启）';
          dismissBtn.appendChild(makeMonoSvg('x', 11.5));
          dismissBtn.addEventListener('click', () => {
            void callDaemonRpc('set-prefs', { patch: { chatPolicy: { showStarterChips: false } } });
          });
          refs.starterRow.appendChild(dismissBtn);
        }
      });
    }

    function applyCodeModeChatRowFilter() {
      if (!host.nativeListEl || !snapshot) return;
      const chatIds = new Set(Object.keys(snapshot.assignments || {}));
      try {
        const rows = host.nativeListEl.querySelectorAll('[data-testid="conversation-row-sidebar"]');
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const cid = row.getAttribute('data-cascade-id') || '';
          const shouldHide = Boolean(cid && chatIds.has(cid));
          if (shouldHide) row.classList.add('ag-prism-chat-row-hidden');
          else row.classList.remove('ag-prism-chat-row-hidden');
        }
      } catch {}
    }

    function renderSidebar() {
      const slots = canEngageStudioSidebar();
      if (!slots) {
        disengageStudioSidebar();
        return;
      }

      runGuarded(() => {
        ensureStyleSheet();
        ensureModeDock(slots);
        ensureChatPane(slots);
        host.engaged = true;

        const mode = snapshot.activeMode === 'chat' ? 'chat' : 'code';
        const modeJustChanged = mode !== lastRenderedMode;
        lastRenderedMode = mode;

        if (document.documentElement) {
          document.documentElement.setAttribute('data-ag-prism-mode', mode);
        }

        if (mode === 'code') {
          if (modeJustChanged) {
            try { W.__agPrism?.suppressEntryMotion?.(950); } catch {}
          }
          // Code 模式：100% 原封不动释放原生侧边栏（保留全部工作区分组、运行态动画、Swarm 与子代理标识）
          const returningNodes = host.parkedNativeNodes.slice();
          restoreNativeSidebarVisibility();
          if (modeJustChanged && currentCfg.motionLevel !== 'off') {
            for (let i = 0; i < returningNodes.length; i++) {
              const n = returningNodes[i];
              if (n && n.classList) n.classList.add('ag-prism-code-returning');
            }
            setTimeout(() => {
              runGuarded(() => {
                for (let i = 0; i < returningNodes.length; i++) {
                  const n = returningNodes[i];
                  if (n && n.classList) n.classList.remove('ag-prism-code-returning');
                }
              });
            }, 240);
          }
          applyCodeModeChatRowFilter();
          if (host.chatPaneEl) {
            host.chatPaneEl.setAttribute('data-active', '0');
            host.chatPaneEl.setAttribute('data-entering', '0');
          }
        } else {
          // Chat 模式：仅柔和收起原生列表区（保留原生顶栏与底栏），平滑展开 Chat 面板
          const nextParked = [];
          for (let i = 0; i < slots.codeBodySlots.length; i++) {
            const node = slots.codeBodySlots[i];
            if (node && node.classList) {
              node.classList.add('ag-prism-sb-native-hidden');
              nextParked.push(node);
            }
          }
          host.parkedNativeNodes = nextParked;
          if (host.chatPaneEl) {
            host.chatPaneEl.setAttribute('data-active', '1');
            host.chatPaneEl.setAttribute('data-entering', modeJustChanged ? '1' : '0');
          }
          renderChatSidebarList();
        }
        if (modeJustChanged) {
          try { W.__agPrism?.sync?.(); } catch {}
        }
      });
    }

    function renderAll() {
      if (destroyed) return;
      renderSidebar();
      renderChatHome();
      syncChatComposerChrome(true);
    }

    function scheduleDiscovery() {
      if (destroyed || currentCfg.sidebarStudio !== 'on') return;
      const ok = discoverHostContexts();
      registerHostOps();
      if (ok) {
        scheduleCatalogSync();
        if (host.psp && host.services && host.router) return;
      }
      if (probeAttempts >= 10) return;
      probeAttempts++;
      if (probeTimer) clearTimeout(probeTimer);
      probeTimer = setTimeout(() => {
        probeTimer = null;
        scheduleDiscovery();
      }, 300 + probeAttempts * 250);
    }

    const onDocClick = () => closePopover();
    const matchChatRunningModelTrigger = (e) => {
      if (destroyed || !snapshot || snapshot.activeMode !== 'chat') return null;
      const curView = snapshot.currentView || '/';
      const mCid = curView.match(/^\/c\/([^/?#]+)/);
      if (!mCid) return null;
      const target = e && e.target;
      const trig = target && typeof target.closest === 'function'
        ? target.closest('#antigravity\\.agentSidePanelInputBox [data-testid="model-selector-trigger"]')
        : null;
      if (!trig) return null;
      return { trig, cid: decodeURIComponent(mCid[1]) };
    };
    const onDocModelPointerCapture = (e) => {
      const hit = matchChatRunningModelTrigger(e);
      if (!hit) return;
      // Radix DropdownMenu 在 pointerdown/mousedown 阶段就会打开原生菜单，必须在捕获阶段直接拦截
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    };
    const onDocModelTriggerCapture = (e) => {
      const hit = matchChatRunningModelTrigger(e);
      if (!hit) return;
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      if (activePopover && activePopover.getAttribute('data-testid') === 'prism-chat-running-model-menu') {
        closePopover();
        return;
      }
      openModelMenu(hit.trig, { runningSession: true, cascadeId: hit.cid });
    };
    const onDocModelKeyCapture = (e) => {
      if (!e || (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'ArrowDown')) return;
      const hit = matchChatRunningModelTrigger(e);
      if (!hit) return;
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      openModelMenu(hit.trig, { runningSession: true, cascadeId: hit.cid });
    };
    const onDocKeydown = (e) => {
      if (e && e.key === 'Escape') {
        if (activeModal) closeModal();
        else if (activePopover) closePopover();
        else if (multiSelectMode) {
          multiSelectMode = false;
          selectedBatchIds.clear();
          if (host.chatPaneRefs && host.chatPaneRefs.batchBtn) host.chatPaneRefs.batchBtn.style.color = '';
          renderChatSidebarList();
        }
      }
    };
    const onVisChange = () => {
      if (host.chatHomeEl && host.chatHomeEl._refs) {
        const isHidden = document.hidden || currentCfg.motionLevel === 'off' || host.chatHomeEl.getAttribute('data-visible') !== '1';
        runGuarded(() => {
          host.chatHomeEl._refs.aura.setAttribute('data-paused', isHidden ? '1' : '0');
        });
      }
      if (!document.hidden && !destroyed && currentCfg.sidebarStudio === 'on') {
        scheduleCatalogSync();
      }
    };
    let globalListenersBound = false;
    function bindGlobalListeners() {
      if (destroyed || globalListenersBound) return;
      globalListenersBound = true;
      document.addEventListener('pointerdown', onDocModelPointerCapture, true);
      document.addEventListener('mousedown', onDocModelPointerCapture, true);
      document.addEventListener('pointerup', onDocModelPointerCapture, true);
      document.addEventListener('click', onDocModelTriggerCapture, true);
      document.addEventListener('keydown', onDocModelKeyCapture, true);
      document.addEventListener('click', onDocClick);
      document.addEventListener('keydown', onDocKeydown);
      document.addEventListener('visibilitychange', onVisChange);
      if (typeof W.addEventListener === 'function') {
        W.addEventListener('resize', invalidateSidebarSlotsCache, { passive: true });
      }
    }

    function unbindGlobalListeners() {
      if (!globalListenersBound) return;
      globalListenersBound = false;
      document.removeEventListener('pointerdown', onDocModelPointerCapture, true);
      document.removeEventListener('mousedown', onDocModelPointerCapture, true);
      document.removeEventListener('pointerup', onDocModelPointerCapture, true);
      document.removeEventListener('click', onDocModelTriggerCapture, true);
      document.removeEventListener('keydown', onDocModelKeyCapture, true);
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onDocKeydown);
      document.removeEventListener('visibilitychange', onVisChange);
      if (typeof W.removeEventListener === 'function') {
        W.removeEventListener('resize', invalidateSidebarSlotsCache);
      }
    }

    function activateRuntime() {
      if (destroyed || currentCfg.sidebarStudio !== 'on') return;
      bindGlobalListeners();
      registerHostOps();
      scheduleDiscovery();
    }

    function deactivateRuntime() {
      closePopover();
      closeModal();
      uninstallChatSendGuard();
      if (syncTimer) {
        clearTimeout(syncTimer);
        syncTimer = null;
      }
      if (probeTimer) {
        clearTimeout(probeTimer);
        probeTimer = null;
      }
      probeAttempts = 0;
      if (toastTimer) {
        clearTimeout(toastTimer);
        toastTimer = null;
      }
      if (canvasFadeTimer) {
        clearTimeout(canvasFadeTimer);
        canvasFadeTimer = null;
      }
      if (composerChipTimer) {
        clearTimeout(composerChipTimer);
        composerChipTimer = null;
      }
      clearPendingAttachments();
      host.pendingFirstAttachments = [];
      sessionModelOverrides.clear();
      cachedStartCascadeStage = null;
      host.reservedMap.clear();
      host.deliveredMap.clear();
      unbindGlobalListeners();
      invalidateSidebarSlotsCache();
      lastChatListRenderSig = '';
      lastSyncCatalogSig = '';
      catalogItems = [];
      if (typeof host.unsubStore === 'function') {
        try { host.unsubStore(); } catch {}
        host.unsubStore = null;
      }
      if (typeof host.unsubRouter === 'function') {
        try { host.unsubRouter(); } catch {}
        host.unsubRouter = null;
      }
      host.store = null;
      host.psp = null;
      host.services = null;
      host.lsWrapper = null;
      host.router = null;
      host.windowConfig = null;
      disengageStudioSidebar();
      try { delete W.__agPrismSidebarHostOps; } catch {}
    }

    function sync(cfg, meta) {
      if (destroyed) return;
      if (cfg && typeof cfg === 'object') currentCfg = { ...cfg };
      if (meta && typeof meta === 'object') currentMeta = { ...meta };
      if (currentCfg.sidebarStudio !== 'on') {
        if (snapshot && snapshot.activeMode === 'chat') {
          navigateHostRoute('/');
        }
        deactivateRuntime();
        return;
      }
      activateRuntime();
      if (!snapshot) {
        void callDaemonRpc('get-state', {});
      } else {
        renderAll();
      }
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      deactivateRuntime();
      runGuarded(() => {
        if (host.chatHomeEl) {
          host.chatHomeEl.remove();
          host.chatHomeEl = null;
        }
        if (host.chatHomeHostEl && host.chatHomeHostPrevPos !== null) {
          host.chatHomeHostEl.style.position = host.chatHomeHostPrevPos;
          host.chatHomeHostPrevPos = null;
        }
        host.chatHomeHostEl = null;
        const stEl = document.getElementById(STYLE_ID);
        if (stEl) stEl.remove();
      });
      try {
        if (W.__agPrismSidebar && W.__agPrismSidebar.destroy === destroy) {
          W.__agPrismSidebar.destroyed = true;
          delete W.__agPrismSidebar;
        }
      } catch {}
    }

    try {
      const bootPrism = W.__agPrism || W.__agClaudeStyle;
      const bootCfg = bootPrism && typeof bootPrism.getState === 'function' ? bootPrism.getState()?.cfg : null;
      if (bootCfg && typeof bootCfg === 'object') {
        currentCfg = { ...bootCfg };
      }
    } catch {}
    if (currentCfg.sidebarStudio === 'on') {
      activateRuntime();
      void callDaemonRpc('get-state', {});
    }

    return {
      version: SIDEBAR_STUDIO_CLIENT_V2,
      clientMarker: 'SIDEBAR_STUDIO_CLIENT_V2',
      schemaVersion: 2,
      sync,
      destroy,
      getState: () => ({
        engaged: host.engaged,
        circuitTripped: host.circuitTripped,
        activeMode: snapshot ? snapshot.activeMode : 'code',
        hasPsp: Boolean(host.psp),
        hasLsClient: Boolean(getHostLsClient()),
        hasSendGuard: Boolean(host.patchedWrapper || host.patchedRawLs),
        listenersBound: globalListenersBound,
        perCascadeIsolation: Boolean(getLiveCapabilities().perCascadeIsolation),
        catalogCount: catalogItems.length,
        mapSizes: {
          modelOverrides: sessionModelOverrides.size,
          reserved: host.reservedMap.size,
          delivered: host.deliveredMap.size,
        },
        models: liveGeminiModels.map((m) => m.id),
        chatPolicy: getEffectiveChatPolicy(),
        hostCapabilitiesCount: {
          plugins: hostCapabilities.plugins.length,
          mcps: hostCapabilities.mcps.length,
          loaded: hostCapabilities.loaded,
        },
      }),
    };
  }

  try {
    W.__agPrismSidebar?.destroy?.();
  } catch {}

  const instance = createSidebarStudioV2();
  W.__agPrismSidebar = instance;
  if (typeof globalThis !== 'undefined' && globalThis !== W) {
    globalThis.__agPrismSidebar = instance;
  }
})(typeof window !== 'undefined' ? window : globalThis);

// Obsidian Prism — Bipolar Studio (/studio) 预览引擎与 Google 级微动效编排
// - 100% 零 innerHTML / outerHTML / document.write（严格遵循 CodeQL 零告警规范）
// - 全站零 Emoji（单色线性 SVG + 100% 官方原版彩色 Gemini / Antigravity SVG）
// - 统一全局主题色板（4 主题），Code 工程台 vs Chat 蓝绿极光 / Antigravity 失重棱镜呼吸光

import {
  parseView,
  PERMISSION_PROFILES,
  formatGreeting,
  formatHeroGreeting,
  normalizeGreetingLang,
} from '/shared/sidebar-state-machine.mjs';

const SVG_NS = 'http://www.w3.org/2000/svg';

// 官方原版彩色 Brand SVG（挂载时经 DOMParser 解析并自动隔离唯一 ID 前缀）
const OFFICIAL_GEMINI_COLOR_SVG =
  '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="#3186FF"/><path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="url(#gem-brand-0)"/><path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="url(#gem-brand-1)"/><path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="url(#gem-brand-2)"/><defs><linearGradient gradientUnits="userSpaceOnUse" id="gem-brand-0" x1="7" x2="11" y1="15.5" y2="12"><stop stop-color="#08B962"/><stop offset="1" stop-color="#08B962" stop-opacity="0"/></linearGradient><linearGradient gradientUnits="userSpaceOnUse" id="gem-brand-1" x1="8" x2="11.5" y1="5.5" y2="11"><stop stop-color="#F94543"/><stop offset="1" stop-color="#F94543" stop-opacity="0"/></linearGradient><linearGradient gradientUnits="userSpaceOnUse" id="gem-brand-2" x1="3.5" x2="17.5" y1="13.5" y2="12"><stop stop-color="#FABC12"/><stop offset=".46" stop-color="#FABC12" stop-opacity="0"/></linearGradient></defs></svg>';

const OFFICIAL_ANTIGRAVITY_COLOR_SVG =
  '<svg width="100%" height="100%" viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg"><g clip-path="url(#agy-brand-clip0_6153_71)"><path d="M85.9734 89.3438C91.2234 93.2812 99.0984 90.6562 91.8796 83.4375C70.2234 62.4375 74.8171 4.6875 47.9109 4.6875C21.0046 4.6875 25.5984 62.4375 3.94213 83.4375C-3.93287 91.3125 4.59838 93.2812 9.84838 89.3438C30.1921 75.5625 28.8796 51.2812 47.9109 51.2812C66.9421 51.2812 65.6296 75.5625 85.9734 89.3438Z" fill="#3186FF"/><mask id="agy-brand-mask0_6153_71" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="0" y="4" width="95" height="88"><path d="M85.9734 89.3438C91.2234 93.2812 99.0984 90.6562 91.8796 83.4375C70.2234 62.4375 74.8171 4.6875 47.9109 4.6875C21.0046 4.6875 25.5984 62.4375 3.94213 83.4375C-3.93287 91.3125 4.59838 93.2812 9.84838 89.3438C30.1921 75.5625 28.8796 51.2812 47.9109 51.2812C66.9421 51.2812 65.6296 75.5625 85.9734 89.3438Z" fill="black"/></mask><g mask="url(#agy-brand-mask0_6153_71)"><g filter="url(#agy-brand-filter0_f_6153_71)"><ellipse cx="25.6357" cy="30.161" rx="25.6357" ry="30.161" transform="matrix(-0.112784 0.99362 -0.99362 -0.112781 59.5896 -33.5392)" fill="#FFE432"/></g><g filter="url(#agy-brand-filter1_f_6153_71)"><ellipse cx="93.6143" cy="23.4505" rx="33.1883" ry="33.9179" transform="rotate(76.9243 93.6143 23.4505)" fill="#FC413D"/></g><g filter="url(#agy-brand-filter2_f_6153_71)"><ellipse cx="-4.78051" cy="30.8098" rx="34.686" ry="44.9344" transform="rotate(74.1257 -4.78051 30.8098)" fill="#00B95C"/></g><g filter="url(#agy-brand-filter3_f_6153_71)"><ellipse cx="-4.78051" cy="30.8098" rx="34.686" ry="44.9344" transform="rotate(74.1257 -4.78051 30.8098)" fill="#00B95C"/></g><g filter="url(#agy-brand-filter4_f_6153_71)"><ellipse cx="-2.31406" cy="32.1899" rx="33.9975" ry="37.4282" transform="rotate(45.6065 -2.31406 32.1899)" fill="#00B95C"/></g><g filter="url(#agy-brand-filter5_f_6153_71)"><ellipse cx="70.2862" cy="101.861" rx="32.6449" ry="31.4359" transform="rotate(76.9243 70.2862 101.861)" fill="#3186FF"/></g><g filter="url(#agy-brand-filter6_f_6153_71)"><ellipse cx="37.7619" cy="39.8298" rx="37.7619" ry="39.8298" transform="matrix(-0.409539 0.912293 -0.912294 -0.409537 98.9683 -33.1266)" fill="#FBBC04"/></g><g filter="url(#agy-brand-filter7_f_6153_71)"><path d="M-12.0493 152.344C-32.7264 144.227 2.61016 77.4428 11.3972 55.0598C20.1841 32.6769 44.0695 21.1122 64.7466 29.2295C85.4236 37.3467 109.932 82.0552 101.145 104.438C92.3577 126.8 8.6 160.461 -12.0493 152.344Z" fill="#3186FF"/></g><g filter="url(#agy-brand-filter8_f_6153_71)"><path d="M113.238 69.2209C107.702 75.6818 93.256 72.3872 80.9716 61.8621C68.6872 51.337 63.2163 37.567 68.752 31.1061C74.2876 24.6451 88.7336 27.9398 101.018 38.4649C113.302 48.99 118.773 62.7599 113.238 69.2209Z" fill="#749BFF"/></g><g filter="url(#agy-brand-filter9_f_6153_71)"><ellipse cx="89.2491" cy="10.7078" rx="49.7713" ry="30.9393" transform="rotate(34.0763 89.2491 10.7078)" fill="#FC413D"/></g><g filter="url(#agy-brand-filter10_f_6153_71)"><ellipse cx="11.4944" cy="17.2241" rx="26.6705" ry="15.5102" transform="rotate(112.516 11.4944 17.2241)" fill="#FFEE48"/></g></g></g><defs><filter id="agy-brand-filter0_f_6153_71" x="-12.1334" y="-45.9232" width="77.7263" height="68.9091" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur stdDeviation="4.37664" result="effect1_foregroundBlur_6153_71"/></filter><filter id="agy-brand-filter1_f_6153_71" x="17.4083" y="-52.1006" width="152.412" height="151.102" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur stdDeviation="21.1588" result="effect1_foregroundBlur_6153_71"/></filter><filter id="agy-brand-filter2_f_6153_71" x="-85.0138" y="-40.729" width="160.467" height="143.078" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur stdDeviation="17.987" result="effect1_foregroundBlur_6153_71"/></filter><filter id="agy-brand-filter3_f_6153_71" x="-85.0138" y="-40.729" width="160.467" height="143.078" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur stdDeviation="17.987" result="effect1_foregroundBlur_6153_71"/></filter><filter id="agy-brand-filter4_f_6153_71" x="-74.0787" y="-39.502" width="143.529" height="143.384" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur stdDeviation="17.987" result="effect1_foregroundBlur_6153_71"/></filter><filter id="agy-brand-filter5_f_6153_71" x="4.5942" y="35.0845" width="131.384" height="133.554" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur stdDeviation="17.0929" result="effect1_foregroundBlur_6153_71"/></filter><filter id="agy-brand-filter6_f_6153_71" x="-23.3161" y="-84.096" width="140.966" height="138.215" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur stdDeviation="15.4911" result="effect1_foregroundBlur_6153_71"/></filter><filter id="agy-brand-filter7_f_6153_71" x="-46.1105" y="-1.03333" width="176.759" height="182.283" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur stdDeviation="13.8342" result="effect1_foregroundBlur_6153_71"/></filter><filter id="agy-brand-filter8_f_6153_71" x="41.8338" y="3.04072" width="98.3219" height="94.2455" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur stdDeviation="12.379" result="effect1_foregroundBlur_6153_71"/></filter><filter id="agy-brand-filter9_f_6153_71" x="23.6047" y="-48.077" width="131.289" height="117.57" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur stdDeviation="10.4556" result="effect1_foregroundBlur_6153_71"/></filter><filter id="agy-brand-filter10_f_6153_71" x="-31.9837" y="-34.0061" width="86.9561" height="102.461" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur stdDeviation="12.9406" result="effect1_foregroundBlur_6153_71"/></filter><clipPath id="agy-brand-clip0_6153_71"><rect width="96" height="96" fill="white"/></clipPath></defs></svg>';

// Gemini 对话模型清单（严禁出现 Orchestrator 或非 Gemini 模型；对齐宿主实时可见清单）
const GEMINI_CHAT_MODELS = [
  {
    id: 'Gemini 4 Neon',
    desc: '全能深度推理 · 覆盖绝大多数深度思考与复杂问题',
    efforts: ['Low', 'Medium', 'High', 'XHigh'],
    defaultEffort: 'High',
  },
  {
    id: 'Gemini 4 Carbon',
    desc: '旗舰深度攻坚 · 胜任最高难度与超长链路复杂任务',
    efforts: ['Low', 'Medium', 'High'],
    defaultEffort: 'High',
  },
  {
    id: 'Gemini 4 Argon',
    desc: '经典高阶主力 · 稳健可靠的高阶专业工作流模型',
    efforts: ['Low', 'Medium', 'High'],
    defaultEffort: 'High',
  },
  {
    id: 'Gemini 4 Hydrogen',
    desc: '极速高效执行 · 兼顾疾速响应与高性价比执行任务',
    efforts: ['Low', 'Medium', 'High', 'XHigh'],
    defaultEffort: 'High',
  },
  {
    id: 'Gemini 3.8 Flash',
    desc: '轻快省流主力 · 响应迅捷，适合日常问答、资料速读与轻量协作',
    efforts: ['Low', 'Medium', 'High'],
    defaultEffort: 'Medium',
  },
];

const CHAT_EFFORT_TIERS = [
  { id: 'Low', label: '低', fullLabel: '低 Low' },
  { id: 'Medium', label: '中', fullLabel: '中 Medium' },
  { id: 'High', label: '高', fullLabel: '高 High' },
  { id: 'XHigh', label: '极高', fullLabel: '极高 XHigh' },
];

let brandSvgUidSeq = 1;

// 1.35px 单色线性 SVG 图标库（零 Emoji）
const MONO_ICONS = {
  code: ['M8 6L2 12L8 18', 'M16 6L22 12L16 18', 'M13.5 4.5L10.5 19.5'],
  chat: ['M21 11.5A8.38 8.38 0 0 1 12.5 20A8.5 8.5 0 0 1 8 18.7L3 20L4.3 15.2A8.38 8.38 0 0 1 3 11.5A8.5 8.5 0 0 1 11.5 3H12.5A8.5 8.5 0 0 1 21 11.5Z'],
  search: ['M11 19A8 8 0 1 0 11 3A8 8 0 0 0 11 19Z', 'M21 21L16.65 16.65'],
  sidebar: ['M4 5H20V19H4Z', 'M9 5V19'],
  plus: ['M12 5V19', 'M5 12H19'],
  folder: ['M3 7A2 2 0 0 1 5 5H9.5L11.5 7.5H19A2 2 0 0 1 21 9.5V17A2 2 0 0 1 19 19H5A2 2 0 0 1 3 17Z'],
  chevron: ['M9 6L15 12L9 18'],
  chevronDown: ['M6 9L12 15L18 9'],
  shield: ['M12 3L19 6V12C19 16.5 16 19.8 12 21C8 19.8 5 16.5 5 12V6Z'],
  info: ['M12 21A9 9 0 1 0 12 3A9 9 0 0 0 12 21Z', 'M12 16V12', 'M12 8H12.01'],
  globe: ['M12 21A9 9 0 1 0 12 3A9 9 0 0 0 12 21Z', 'M3 12H21', 'M12 3A14 14 0 0 1 15.5 12A14 14 0 0 1 12 21A14 14 0 0 1 8.5 12A14 14 0 0 1 12 3Z'],
  paperclip: ['M21.4 11.1L12.2 20.3A5.5 5.5 0 0 1 4.4 12.5L13.6 3.3A3.5 3.5 0 0 1 18.6 8.3L9.4 17.5A1.5 1.5 0 0 1 7.3 15.4L15.8 6.9'],
  panelRight: ['M4 5H20V19H4Z', 'M15 5V19'],
  edit: ['M12 20H21', 'M16.5 3.5A2.1 2.1 0 0 1 19.5 6.5L7 19L3 20L4 16Z'],
  trash: ['M3 6H21', 'M8 6V4H16V6', 'M6 6L7 20H17L18 6'],
  unlink: ['M10 13A5 5 0 0 0 17.5 13.5L20 11A5 5 0 0 0 12.9 3.9L11.5 5.3', 'M14 11A5 5 0 0 0 6.5 10.5L4 13A5 5 0 0 0 11.1 20.1L12.5 18.7'],
  arrowUp: ['M12 19V5', 'M6 11L12 5L18 11'],
  arrowRight: ['M5 12H19', 'M13 6L19 12L13 18'],
  settings: ['M12 15A3 3 0 1 0 12 9A3 3 0 0 0 12 15Z', 'M19.4 15A1.65 1.65 0 0 0 19.7 16.8L19.8 16.9A2 2 0 1 1 17 19.7L16.9 19.6A1.65 1.65 0 0 0 15.1 19.3A1.65 1.65 0 0 0 14.1 20.8V21A2 2 0 1 1 10.1 21V20.9A1.65 1.65 0 0 0 9 19.4A1.65 1.65 0 0 0 7.2 19.7L7.1 19.8A2 2 0 1 1 4.3 17L4.4 16.9A1.65 1.65 0 0 0 4.7 15.1A1.65 1.65 0 0 0 3.2 14.1H3A2 2 0 1 1 3 10.1H3.1A1.65 1.65 0 0 0 4.6 9A1.65 1.65 0 0 0 4.3 7.2L4.2 7.1A2 2 0 1 1 7 4.3L7.1 4.4A1.65 1.65 0 0 0 8.9 4.7H9A1.65 1.65 0 0 0 10 3.2V3A2 2 0 1 1 14 3V3.1A1.65 1.65 0 0 0 15 4.6A1.65 1.65 0 0 0 16.8 4.3L16.9 4.2A2 2 0 1 1 19.7 7L19.6 7.1A1.65 1.65 0 0 0 19.3 8.9V9A1.65 1.65 0 0 0 20.8 10H21A2 2 0 1 1 21 14H20.9A1.65 1.65 0 0 0 19.4 15Z'],
  book: ['M4 19.5A2.5 2.5 0 0 1 6.5 17H20', 'M6.5 2H20V22H6.5A2.5 2.5 0 0 1 4 19.5V4.5A2.5 2.5 0 0 1 6.5 2Z'],
  box: ['M21 8L12 3L3 8V16L12 21L21 16Z', 'M3 8L12 13L21 8', 'M12 13V21'],
  check: ['M20 6L9 17L4 12'],
  close: ['M18 6L6 18', 'M6 6L18 18'],
  terminal: ['M4 17L10 11L4 5', 'M12 19H20'],
};

const stageEl = document.getElementById('studio-root');
const workspaceGrid = document.getElementById('st-workspace-grid');
const sidebarMount = document.getElementById('st-sidebar-mount');
const mainTopbar = document.getElementById('st-main-topbar');
const mainPrimary = document.getElementById('st-main-primary');
const artifactsPane = document.getElementById('st-artifacts-pane');
const rippleBackdrop = document.getElementById('st-ripple-backdrop');
const chatAuraLayer = document.getElementById('st-chat-aura');
const auditBody = document.getElementById('st-audit-body');
const revMetaEl = document.getElementById('st-rev-meta');
const auditPillEl = document.getElementById('st-global-audit-pill');
const auditTextEl = document.getElementById('st-global-audit-text');
const sandboxChipEl = document.getElementById('st-sandbox-chip');
const overlayRoot = document.getElementById('st-overlay-root');

const state = {
  token: '',
  snapshot: null,
  audit: null,
  catalog: { health: 'loading', items: [] },
  locale: 'zh-CN',
  userName: 'Alex',
  greetingSeed: Math.floor(Math.random() * 100),
  motionLevel: 'ultra',
  searchOpen: false,
  searchQuery: '',
  inlineFolderOpen: false,
  inlineRenameFolderId: null,
  inlineSparkBoxOpen: false,
  artifactsOpen: true,
  webResearchPreferred: true,
  vialOpen: false,
  requireWslSim: false,
  composerText: '',
  selectedModel: 'Gemini 4 Carbon',
  selectedEffort: 'High',
  reqSeq: 1,
  rpcLog: [],
  sessionMessages: new Map(),
  prevMode: null,
  prevChatDraftKind: null,
  prevViewKey: '',
  chatSimRunning: false,
  chatSimTimer: null,
  pendingFlipFromTop: null,
  flashSessionId: null,
  toastTimer: null,
};

let rippleCtrl = null;
let mascotRig = null;
let vialCtrl = null;
let masterRaf = 0;
let lastFrameAt = performance.now();

// 自定义 Pointer 拖拽状态（会话行拖入子文件夹 / 根目录 / Spark 项目）
const dragState = {
  active: false,
  started: false,
  cascadeId: '',
  title: '',
  startX: 0,
  startY: 0,
  ghostEl: null,
  hoverTargetEl: null,
  autoExpandTimer: null,
};

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function clearNode(node) {
  while (node && node.firstChild) node.removeChild(node.firstChild);
}

function clearOverlays() {
  clearNode(overlayRoot);
}

function makeMonoSvg(name, size = 14) {
  const paths = MONO_ICONS[name] || MONO_ICONS.info;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 24 24');
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

function mountOfficialBrandSvg(rawSvg, size, brandKey) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(rawSvg, 'image/svg+xml');
  const rootSvg = doc && doc.documentElement;
  if (!rootSvg || rootSvg.nodeName.toLowerCase() !== 'svg') {
    return makeMonoSvg('info', size);
  }
  const uidPrefix = `agsvg-${brandSvgUidSeq++}-`;
  const idMap = new Map();
  const allNodes = [rootSvg, ...rootSvg.querySelectorAll('*')];
  for (let i = 0; i < allNodes.length; i++) {
    const node = allNodes[i];
    const origId = node.getAttribute('id');
    if (origId) {
      const nextId = uidPrefix + origId;
      idMap.set(origId, nextId);
      node.setAttribute('id', nextId);
    }
  }
  if (idMap.size > 0) {
    const refAttrs = ['fill', 'stroke', 'clip-path', 'mask', 'filter'];
    for (let i = 0; i < allNodes.length; i++) {
      const node = allNodes[i];
      for (let j = 0; j < refAttrs.length; j++) {
        const attr = refAttrs[j];
        const val = node.getAttribute(attr);
        if (val && val.includes('url(#')) {
          const replaced = val.replace(/url\(#([^)]+)\)/g, (m, refId) =>
            idMap.has(refId) ? `url(#${idMap.get(refId)})` : m
          );
          if (replaced !== val) node.setAttribute(attr, replaced);
        }
      }
    }
  }
  const imported = document.importNode(rootSvg, true);
  imported.setAttribute('width', String(size));
  imported.setAttribute('height', String(size));
  imported.setAttribute('aria-hidden', 'true');
  imported.setAttribute('data-brand-mark', brandKey);
  imported.style.flexShrink = '0';
  return imported;
}

function makeGeminiBrandSvg(size = 34) {
  return mountOfficialBrandSvg(OFFICIAL_GEMINI_COLOR_SVG, size, 'gemini');
}

function makeAntigravityBrandSvg(size = 34) {
  return mountOfficialBrandSvg(OFFICIAL_ANTIGRAVITY_COLOR_SVG, size, 'antigravity');
}

function createRunningSpinnerNode() {
  const wrap = el('span', 'ag-v2-row-spinner-wrap');
  wrap.setAttribute('aria-hidden', 'true');
  const spinner = el('span');
  spinner.setAttribute('data-testid', 'status-loading-spinner');
  for (let i = 0; i < 4; i++) {
    const dot = el('span');
    dot.setAttribute('data-agent-state-dot', 'true');
    spinner.appendChild(dot);
  }
  wrap.appendChild(spinner);
  return wrap;
}

function showToast(msg) {
  if (!msg) return;
  const old = overlayRoot.querySelector('.st-toast');
  if (old) old.remove();
  const toast = el('div', 'st-toast', msg);
  toast.setAttribute('data-testid', 'studio-toast');
  overlayRoot.appendChild(toast);
  if (state.toastTimer) clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => {
    toast.remove();
    state.toastTimer = null;
  }, 2200);
}

function pushRpcLog(label, ok, detail) {
  const stamp = new Date().toTimeString().slice(0, 8);
  state.rpcLog.unshift(`[${stamp}] ${ok ? 'OK' : 'ERR'} ${label}${detail ? ' — ' + detail : ''}`);
  if (state.rpcLog.length > 18) state.rpcLog.length = 18;
}

/* ── Code 专属物理渲染循环（0fps 休眠：ripple + vial） ──────────────────── */
function wakeMasterLoop() {
  if (masterRaf || document.hidden || state.motionLevel === 'off') return;
  lastFrameAt = performance.now();
  const tick = (now) => {
    if (document.hidden || state.motionLevel === 'off') {
      masterRaf = 0;
      return;
    }
    const dtSec = Math.min(0.05, Math.max(0.004, (now - lastFrameAt) / 1000));
    lastFrameAt = now;
    let keepRunning = false;

    if (rippleCtrl && !rippleCtrl.isSleeping(now)) {
      rippleCtrl.step(now);
      keepRunning = true;
    }
    if (vialCtrl && !vialCtrl.isSleeping()) {
      vialCtrl.step(dtSec);
      keepRunning = true;
    }

    if (keepRunning) {
      masterRaf = requestAnimationFrame(tick);
    } else {
      masterRaf = 0;
    }
  };
  masterRaf = requestAnimationFrame(tick);
}

function getRipplePalette(aura) {
  const isDark = stageEl.getAttribute('data-theme') !== 'light';
  const cs = getComputedStyle(stageEl);
  const ink = (cs.getPropertyValue('--ag-v2-ripple-ink') || '').trim() || (isDark ? 'rgb(146,148,156)' : 'rgb(85,102,130)');
  const wave = (cs.getPropertyValue('--ag-v2-ripple-wave') || '').trim() || (isDark ? 'rgb(214,218,228)' : 'rgb(37,99,235)');
  const fontFamily = (cs.getPropertyValue('--ag-v2-font-mono') || '').trim() || 'monospace';
  return { dark: isDark, ink, wave, fontFamily, aura };
}

function mountRippleBackdrop() {
  const rippleCore = globalThis.__agCsRippleCore;
  if (!rippleCore || !rippleBackdrop) return;
  const canvas = rippleBackdrop.querySelector('.ag-cs-ripple-canvas');
  const glowCanvas = rippleBackdrop.querySelector('.ag-v2-brand-glow');
  const listenTarget = document.getElementById('st-main-shell');
  if (!canvas || !listenTarget) return;

  const { RIPPLE, createWaveField, createGlyphField } = rippleCore;
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
  let drawnStatic = false;
  const mountedAt = performance.now();
  const auraState = { x: 0, y: 0, active: false };

  const updateCalmZones = () => {
    if (!field || typeof field.setCalmZones !== 'function') return;
    const greet = mainPrimary.querySelector('[data-testid="home-greeting"]');
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
    drawnStatic = false;
    updateCalmZones();
    wakeMasterLoop();
  };

  setup();
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(setup);
    ro.observe(canvas);
  }

  // Chat 氛围光轻视差 + Code 水波纹 skimmer
  listenTarget.addEventListener(
    'pointermove',
    (evt) => {
      if (state.motionLevel !== 'off' && chatAuraLayer && chatAuraLayer.getAttribute('data-phase') !== 'off') {
        const mr = listenTarget.getBoundingClientRect();
        if (mr.width > 0 && mr.height > 0) {
          const nx = ((evt.clientX - mr.left) / mr.width - 0.5) * 14;
          const ny = ((evt.clientY - mr.top) / mr.height - 0.5) * 10;
          chatAuraLayer.style.transform = `translate3d(${nx.toFixed(1)}px, ${ny.toFixed(1)}px, 0)`;
        }
      }
      if (!field || rippleBackdrop.getAttribute('data-dormant') === 'true') return;
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
      if (lastSkimX !== null && lastSkimY !== null && waves) {
        const stepDist = Math.hypot(x - lastSkimX, y - lastSkimY);
        const dtSec = Math.max(0.004, (now - lastSkimAt) / 1000);
        const pxPerSec = stepDist / dtSec;
        if (pxPerSec >= 220) {
          skimCarryDist += stepDist;
          if (skimCarryDist >= 42) {
            skimCarryDist = Math.min(20, skimCarryDist - 42);
            const speedNorm = Math.max(0.05, Math.min(1, (pxPerSec - 220) / 1800));
            if (typeof waves.skimmer === 'function') {
              waves.skimmer(Math.floor(x / RIPPLE.cellWidth), Math.floor(y / RIPPLE.cellHeight), speedNorm);
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
    },
    { passive: true }
  );

  listenTarget.addEventListener(
    'pointerdown',
    (evt) => {
      if (!waves || columns <= 0 || rows <= 0) return;
      if (rippleBackdrop.getAttribute('data-dormant') === 'true') return;
      const rect = canvas.getBoundingClientRect();
      const x = evt.clientX - rect.left;
      const y = evt.clientY - rect.top;
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;
      waves.disturb(Math.floor(x / RIPPLE.cellWidth), Math.floor(y / RIPPLE.cellHeight));
      if (field) field.invalidate();
      wakeMasterLoop();
      if (mascotRig && typeof mascotRig.notify === 'function') mascotRig.notify('ripple');
    },
    { passive: true }
  );

  rippleCtrl = {
    isSleeping(now = performance.now()) {
      if (!waves || !field) return true;
      if (rippleBackdrop.getAttribute('data-dormant') === 'true') return true;
      if (!drawnStatic) return false;
      if (now - mountedAt < 1600) return false;
      if (auraState.active) return false;
      return typeof field.busy === 'function' ? !field.busy() : !waves.active();
    },
    step(now) {
      if (!waves || !field) return;
      if (rippleBackdrop.getAttribute('data-dormant') === 'true') return;
      if (columns * rows > 4200 && now - lastDrawAt < 28) return;
      const realDt = Math.min(0.05, Math.max(0.001, (now - lastStepAt) / 1000));
      lastStepAt = now;
      lastDrawAt = now;
      const isDark = stageEl.getAttribute('data-theme') !== 'light';
      if (glow) glow.draw(now, { dark: isDark, still: false, prismStrength: 1 });
      if (waves.active()) waves.advance(realDt);
      if (!drawnStatic || field.needsDraw(now, false)) {
        field.draw(now, getRipplePalette(auraState), false);
        drawnStatic = true;
      }
    },
    invalidate() {
      drawnStatic = false;
      updateCalmZones();
      if (field) field.invalidate();
      if (glow) glow.invalidate();
      wakeMasterLoop();
    },
  };
}

function disposeMascot() {
  if (mascotRig && typeof mascotRig.dispose === 'function') {
    try { mascotRig.dispose(); } catch {}
  }
  mascotRig = null;
}

function mountDualMascotInto(hostEl) {
  disposeMascot();
  const rigMod = globalThis.__agDualMascotRig;
  if (!rigMod || typeof rigMod.mountDualMascotStage !== 'function' || !hostEl) return;
  try {
    mascotRig = rigMod.mountDualMascotStage(hostEl, {
      camp: 'google',
      streaming: false,
      streamTier: 2,
      hasError: false,
      yieldMode: 'none',
      leapOffsetY: 0,
      popoverRightWidth: state.vialOpen ? 344 : 0,
      miniPileEnabled: true,
      orchestrator: false,
    });
  } catch {
    mascotRig = null;
  }
}

function disposeVial() {
  if (vialCtrl && typeof vialCtrl.dispose === 'function') {
    try { vialCtrl.dispose(); } catch {}
  }
  vialCtrl = null;
}

function mountVialInto(canvas) {
  disposeVial();
  const vialCore = globalThis.__agVialCore;
  if (!vialCore || typeof vialCore.mountPhysicalWaterVial !== 'function' || !canvas) return;
  const ratios = [0.24, 0.16, 0.12];
  const inst = vialCore.mountPhysicalWaterVial(canvas, {
    fill: 0.52,
    maxTokens: 512000,
    streaming: false,
    reduceMotion: state.motionLevel === 'off',
    getState: () => ({
      isDark: stageEl.getAttribute('data-theme') !== 'light',
      camp: 'google',
      critical: false,
      fill: 0.52,
      ratios,
      maxTokens: 512000,
      hoveredSlice: null,
      streaming: false,
    }),
  });
  if (!inst) return;
  vialCtrl = {
    isSleeping: () => (typeof inst.isSettled === 'function' ? Boolean(inst.isSettled()) : true),
    step: (dt) => inst.step(dt),
    impulse: (v) => {
      if (typeof inst.impulse === 'function') inst.impulse(v);
      wakeMasterLoop();
    },
    dispose: () => inst.dispose(),
  };
  vialCtrl.impulse(1.1);
}

/* ── 增强版彩色环境氛围光状态同步（Code 关闭 / Chat 1.35x~1.5x 持续流动） ── */
function syncAmbientAuraLayer() {
  const snap = state.snapshot;
  if (!snap || !chatAuraLayer) return;
  const paused = document.hidden || state.motionLevel === 'off';
  chatAuraLayer.setAttribute('data-paused', paused ? '1' : '0');

  if (snap.activeMode === 'code') {
    chatAuraLayer.setAttribute('data-phase', 'off');
    chatAuraLayer.style.transform = '';
    if (rippleBackdrop) {
      rippleBackdrop.setAttribute('data-dormant', snap.currentView === '/' ? 'false' : 'true');
      if (snap.currentView === '/' && rippleCtrl) requestAnimationFrame(() => rippleCtrl.invalidate());
    }
    return;
  }

  // Chat 模式：彻底关闭字符海波浪，开启对应空间色调的动态呼吸环境氛围光
  if (rippleBackdrop) rippleBackdrop.setAttribute('data-dormant', 'true');
  if (snap.currentView === '/') {
    const kind = snap.chatDraft.kind === 'spark' ? 'spark' : 'knowledge';
    chatAuraLayer.setAttribute('data-space-kind', kind);
    chatAuraLayer.setAttribute('data-phase', kind === 'spark' ? 'home-spark' : 'home-knowledge');
  } else {
    const parsed = parseView(snap.currentView);
    const activeCid = parsed.ok ? parsed.cascadeId : null;
    const activeItem = activeCid ? findCatalogItem(activeCid) : null;
    const activeAssign = activeCid && snap.assignments ? snap.assignments[activeCid] : null;
    const kind = activeAssign && activeAssign.placement && activeAssign.placement.kind === 'spark' ? 'spark' : 'knowledge';
    chatAuraLayer.setAttribute('data-space-kind', kind);
    const isRunning = state.chatSimRunning || (activeItem && (activeItem.status === 'running' || activeItem.status === 'blocked'));
    chatAuraLayer.setAttribute('data-phase', isRunning ? 'conv-running' : 'conv-idle');
  }
}

/* ── 通信层：严格对接 /api/studio/* 隔离沙盒服务 ──────────────────────── */
function ingestEnvelope(data) {
  if (!data || typeof data !== 'object') return;
  if (data.snapshot) state.snapshot = data.snapshot;
  else if (data.result && data.result.schemaVersion === 2) state.snapshot = data.result;
  if (data.audit) state.audit = data.audit;
  if (data.catalog) state.catalog = data.catalog;
}

async function fetchInitialState() {
  const res = await fetch('/api/studio/state', { cache: 'no-store' });
  const tok = res.headers.get('X-Studio-Token');
  if (tok) state.token = tok;
  const data = await res.json();
  ingestEnvelope(data);
  pushRpcLog('GET /api/studio/state', Boolean(data.ok), `store=${state.snapshot?.storeId || '-'}`);
  renderAll();
}

// 前端串行 RPC 队列：确保快速连点切胶囊/建文件夹时按顺序等待上一次回包同步最新 rev/navRev/draftRev，杜绝 409 STALE_STATE
let rpcChain = Promise.resolve();

function enqueueStudioOp(taskFn) {
  const next = rpcChain.then(taskFn, taskFn);
  rpcChain = next.catch(() => {});
  return next;
}

async function callStudioPost(urlPath, bodyObj, logName) {
  const res = await fetch(urlPath, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Studio-Token': state.token,
    },
    body: JSON.stringify(bodyObj),
  });
  const data = await res.json();
  ingestEnvelope(data);
  const errCode = data && data.error && data.error.code ? data.error.code : '';
  pushRpcLog(logName, Boolean(data.ok), data.ok ? `rev=${data.rev}` : `${res.status} ${errCode}`);
  renderAll();
  return { status: res.status, data };
}

function callRpc(action, payload = {}) {
  return enqueueStudioOp(async () => {
    const snap = state.snapshot;
    const reqId = `studio-req-${Date.now()}-${state.reqSeq++}`;
    // 串行出队时用最新 snapshot 刷新 navRev/draftRev（仅在调用方提供了对应字段时同步）
    const nextPayload = payload && typeof payload === 'object' ? { ...payload } : {};
    if (snap) {
      if (Object.prototype.hasOwnProperty.call(nextPayload, 'navRev')) {
        nextPayload.navRev = snap.navRev;
      }
      if (Object.prototype.hasOwnProperty.call(nextPayload, 'draftRev')) {
        nextPayload.draftRev = snap.draftRev;
      }
    }
    const envelope = {
      version: 2,
      action,
      requestId: reqId,
      storeId: snap ? snap.storeId : undefined,
      baseRev: snap ? snap.rev : undefined,
      payload: nextPayload,
    };
    const { data } = await callStudioPost('/api/studio/rpc', envelope, `rpc:${action}`);
    if (!data.ok && data.error) {
      showToast(`${data.error.code}: ${data.error.message || action}`);
    }
    return data;
  });
}

function applyFixture(fixture, label) {
  return enqueueStudioOp(async () => {
    const { data } = await callStudioPost('/api/studio/fixture', fixture, `fixture:${label}`);
    if (!data.ok && data.error) showToast(`Fixture 失败: ${data.error.code}`);
    return data;
  });
}

function resetSandbox() {
  return enqueueStudioOp(async () => {
    const { data } = await callStudioPost('/api/studio/reset', {}, 'reset-sandbox');
    state.sessionMessages.clear();
    state.composerText = '';
    state.requireWslSim = false;
    state.vialOpen = false;
    state.inlineFolderOpen = false;
    state.inlineRenameFolderId = null;
    state.inlineSparkBoxOpen = false;
    state.greetingSeed = Math.floor(Math.random() * 100);
    if (data.ok) showToast(`已重置沙盒 · ${state.snapshot?.storeId || ''}`);
    return data;
  });
}

function getCatalogItems() {
  return Array.isArray(state.catalog && state.catalog.items) ? state.catalog.items : [];
}

function findCatalogItem(cascadeId) {
  const items = getCatalogItems();
  for (let i = 0; i < items.length; i++) {
    if (items[i].cascadeId === cascadeId) return items[i];
  }
  return null;
}

function applyThemePreset(preset) {
  const map = {
    'obsidian-dark': { palette: 'obsidian', theme: 'dark', lightPreset: 'crystal' },
    'warm-dark': { palette: 'warm', theme: 'dark', lightPreset: 'crystal' },
    'daylight-crystal': { palette: 'obsidian', theme: 'light', lightPreset: 'crystal' },
    'warm-alabaster': { palette: 'warm', theme: 'light', lightPreset: 'alabaster' },
  };
  const target = map[preset] || map['obsidian-dark'];
  stageEl.setAttribute('data-palette', target.palette);
  stageEl.setAttribute('data-theme', target.theme);
  stageEl.setAttribute('data-light-preset', target.lightPreset);
  const btns = document.querySelectorAll('[data-st-preset]');
  for (let i = 0; i < btns.length; i++) {
    btns[i].setAttribute('data-active', btns[i].getAttribute('data-st-preset') === preset ? '1' : '0');
  }
  if (rippleCtrl) rippleCtrl.invalidate();
  if (vialCtrl) vialCtrl.impulse(0.6);
}

/* ── 锚点浮层定位（按点击坐标/锚点设定 transform-origin + 视口夹紧） ──── */
function mountAnchoredPopover(pop, anchorEl, preferAbove = false) {
  overlayRoot.appendChild(pop);
  const vw = window.innerWidth || 1280;
  const vh = window.innerHeight || 800;
  const pRect = pop.getBoundingClientRect();
  const pw = pRect.width || 230;
  const ph = pRect.height || 180;
  let left = 16;
  let top = 60;
  let originY = 'top';
  if (anchorEl && typeof anchorEl.getBoundingClientRect === 'function') {
    const a = anchorEl.getBoundingClientRect();
    left = Math.max(8, Math.min(vw - pw - 8, a.left));
    if (preferAbove && a.top - ph - 8 >= 8) {
      top = a.top - ph - 8;
      originY = 'bottom';
    } else if (a.bottom + ph + 8 <= vh) {
      top = a.bottom + 6;
      originY = 'top';
    } else {
      top = Math.max(8, a.top - ph - 8);
      originY = 'bottom';
    }
  }
  pop.style.transformOrigin = `${originY} left`;
  pop.style.left = `${Math.round(left)}px`;
  pop.style.top = `${Math.round(top)}px`;
}

function openBadgeHoverPreview(anchorEl, badge) {
  const old = overlayRoot.querySelector('.st-badge-preview');
  if (old) old.remove();
  if (!badge) return;
  const pop = el('div', 'st-badge-preview');
  pop.setAttribute('data-testid', 'background-badge-preview');
  const title = el('div', '', `${badge.targetMode === 'code' ? 'Code' : 'Chat'} 后台任务 (${badge.count})`);
  title.style.fontWeight = '600';
  pop.appendChild(title);

  const list = Array.isArray(badge.items) ? badge.items.slice(0, 4) : [];
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    const row = el('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '7px';
    row.appendChild(t.status === 'blocked' ? el('span', 'st-row-amber-dot') : createRunningSpinnerNode());
    const nameEl = el('span', 'ag-v2-row-title', t.title || t.cascadeId);
    nameEl.style.flex = '1';
    row.appendChild(nameEl);
    row.appendChild(el('span', 'st-row-mono-tag', t.status === 'blocked' ? '待审批' : '运行中'));
    pop.appendChild(row);
  }
  const hint = el('div', '', '点击微点直接切模式并跳转至该会话');
  hint.style.fontSize = '11px';
  hint.style.color = 'var(--muted-foreground)';
  pop.appendChild(hint);

  mountAnchoredPopover(pop, anchorEl, false);
}

function hideBadgeHoverPreview() {
  const old = overlayRoot.querySelector('.st-badge-preview');
  if (old) old.remove();
}

/* ── 右键菜单（全单色线性 SVG，零 Emoji） ─────────────────────────────── */
function addMenuItem(menu, iconName, label, rightTag, onClick) {
  const btn = el('button', 'st-menu-item');
  btn.type = 'button';
  const lead = el('span', 'st-menu-lead');
  if (iconName) lead.appendChild(makeMonoSvg(iconName, 13));
  lead.appendChild(el('span', '', label));
  btn.appendChild(lead);
  if (rightTag) btn.appendChild(el('span', 'st-row-mono-tag', rightTag));
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    clearOverlays();
    onClick();
  });
  menu.appendChild(btn);
}

function openCodeContextMenu(ev, item) {
  ev.preventDefault();
  ev.stopPropagation();
  clearOverlays();
  const snap = state.snapshot;
  if (!snap) return;

  const menu = el('div', 'st-popover');
  menu.setAttribute('data-testid', 'code-session-context-menu');

  addMenuItem(menu, 'arrowRight', '模拟 Running 运行中', 'RUN', () => void mutateSingleSessionStatus(item.cascadeId, 'running'));
  addMenuItem(menu, 'shield', '模拟 Blocked 待审批', 'WAIT', () => void mutateSingleSessionStatus(item.cascadeId, 'blocked'));
  addMenuItem(menu, 'check', '恢复 Idle 空闲态', 'IDLE', () => void mutateSingleSessionStatus(item.cascadeId, 'idle'));

  overlayRoot.appendChild(menu);
  menu.style.left = `${Math.max(8, Math.min(window.innerWidth - 230, ev.clientX))}px`;
  menu.style.top = `${Math.max(8, Math.min(window.innerHeight - 230, ev.clientY))}px`;
}

function openChatSessionContextMenu(ev, item) {
  ev.preventDefault();
  ev.stopPropagation();
  clearOverlays();
  const snap = state.snapshot;
  if (!snap) return;

  const menu = el('div', 'st-popover');
  menu.setAttribute('data-testid', 'chat-session-context-menu');

  addMenuItem(menu, 'book', '移回 Knowledge 根目录', null, async () => {
    const res = await callRpc('move-chat-session', {
      cascadeId: item.cascadeId,
      placement: { kind: 'knowledge', folderId: null },
    });
    if (res.ok) {
      state.flashSessionId = item.cascadeId;
      renderSidebar();
      showToast('已移回 Knowledge 根目录');
    }
  });

  const folders = snap.knowledgeFolders || [];
  for (let i = 0; i < folders.length; i++) {
    const f = folders[i];
    addMenuItem(menu, 'folder', `移入文件夹：${f.name}`, null, async () => {
      const res = await callRpc('move-chat-session', {
        cascadeId: item.cascadeId,
        placement: { kind: 'knowledge', folderId: f.id },
      });
      if (res.ok) {
        state.flashSessionId = item.cascadeId;
        renderSidebar();
        showToast(`已归入文件夹「${f.name}」`);
      }
    });
  }

  const projects = snap.sparkProjects || [];
  if (projects.length > 0) {
    menu.appendChild(el('div', 'st-menu-sep'));
    for (let i = 0; i < projects.length; i++) {
      const p = projects[i];
      addMenuItem(menu, 'box', `移入 Spark：${p.name}`, null, async () => {
        const res = await callRpc('move-chat-session', {
          cascadeId: item.cascadeId,
          placement: { kind: 'spark', sparkProjectId: p.id },
        });
        if (res.ok) {
          state.flashSessionId = item.cascadeId;
          renderSidebar();
          showToast(`已移入 Spark 项目「${p.name}」`);
        }
      });
    }
  }

  overlayRoot.appendChild(menu);
  menu.style.left = `${Math.max(8, Math.min(window.innerWidth - 230, ev.clientX))}px`;
  menu.style.top = `${Math.max(8, Math.min(window.innerHeight - 250, ev.clientY))}px`;
}

function openFolderContextMenu(ev, folder) {
  ev.preventDefault();
  ev.stopPropagation();
  clearOverlays();
  const menu = el('div', 'st-popover');
  addMenuItem(menu, 'edit', '重命名文件夹', null, () => {
    state.inlineRenameFolderId = folder.id;
    renderSidebar();
  });
  addMenuItem(menu, 'trash', '删除文件夹（会话退回根目录）', null, async () => {
    const res = await callRpc('delete-knowledge-folder', { folderId: folder.id });
    if (res.ok) showToast(`已删除「${folder.name}」，会话已无损退回 Knowledge 根目录`);
  });
  overlayRoot.appendChild(menu);
  menu.style.left = `${Math.max(8, Math.min(window.innerWidth - 230, ev.clientX))}px`;
  menu.style.top = `${Math.max(8, Math.min(window.innerHeight - 120, ev.clientY))}px`;
}

function openSparkProjectContextMenu(ev, proj) {
  ev.preventDefault();
  ev.stopPropagation();
  clearOverlays();
  const menu = el('div', 'st-popover');
  addMenuItem(menu, 'unlink', '解绑工作区（保留磁盘与历史会话）', null, async () => {
    const res = await callRpc('unlink-spark-project', { sparkProjectId: proj.id });
    if (res.ok) showToast(`已解绑「${proj.name}」，历史会话已退回 Knowledge 根目录`);
  });
  overlayRoot.appendChild(menu);
  menu.style.left = `${Math.max(8, Math.min(window.innerWidth - 240, ev.clientX))}px`;
  menu.style.top = `${Math.max(8, Math.min(window.innerHeight - 100, ev.clientY))}px`;
}

/* ── Pointer 自定义拖拽引擎（磁吸高亮 + 450ms 自动展开折叠目录 + 320ms 落位高光） ── */
function clearDropHoverState() {
  if (dragState.autoExpandTimer) {
    clearTimeout(dragState.autoExpandTimer);
    dragState.autoExpandTimer = null;
  }
  if (dragState.hoverTargetEl) {
    dragState.hoverTargetEl.removeAttribute('data-drop-hover');
    dragState.hoverTargetEl = null;
  }
}

function endSessionDrag(commitDrop) {
  const dropEl = dragState.hoverTargetEl;
  const cid = dragState.cascadeId;
  clearDropHoverState();
  if (dragState.ghostEl) {
    dragState.ghostEl.remove();
    dragState.ghostEl = null;
  }
  const draggingRows = sidebarMount.querySelectorAll('[data-dragging="1"]');
  for (let i = 0; i < draggingRows.length; i++) draggingRows[i].removeAttribute('data-dragging');

  const wasStarted = dragState.started;
  dragState.active = false;
  dragState.started = false;
  dragState.cascadeId = '';
  dragState.title = '';

  if (!commitDrop || !wasStarted || !dropEl || !cid) return;

  const dropKind = dropEl.getAttribute('data-drop-kind');
  const dropId = dropEl.getAttribute('data-drop-id') || '';
  if (dropKind === 'knowledge-root') {
    void callRpc('move-chat-session', { cascadeId: cid, placement: { kind: 'knowledge', folderId: null } }).then((r) => {
      if (r.ok) {
        state.flashSessionId = cid;
        renderSidebar();
        showToast('已拖入 Knowledge 根目录');
      }
    });
  } else if (dropKind === 'knowledge-folder' && dropId) {
    void callRpc('move-chat-session', { cascadeId: cid, placement: { kind: 'knowledge', folderId: dropId } }).then((r) => {
      if (r.ok) {
        state.flashSessionId = cid;
        renderSidebar();
        showToast('已归入目标子文件夹');
      }
    });
  } else if (dropKind === 'spark-project' && dropId) {
    void callRpc('move-chat-session', { cascadeId: cid, placement: { kind: 'spark', sparkProjectId: dropId } }).then((r) => {
      if (r.ok) {
        state.flashSessionId = cid;
        renderSidebar();
        showToast('已拖入 Spark 项目工作区');
      }
    });
  }
}

function attachChatRowDrag(rowEl, item) {
  rowEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    dragState.active = true;
    dragState.started = false;
    dragState.cascadeId = item.cascadeId;
    dragState.title = item.title || item.cascadeId;
    dragState.startX = e.clientX;
    dragState.startY = e.clientY;
  });
}

document.addEventListener('pointermove', (e) => {
  if (!dragState.active) return;
  const dist = Math.hypot(e.clientX - dragState.startX, e.clientY - dragState.startY);
  if (!dragState.started) {
    if (dist < 6) return;
    dragState.started = true;
    const srcRow = sidebarMount.querySelector(`[data-studio-row="chat-${dragState.cascadeId}"]`);
    if (srcRow) srcRow.setAttribute('data-dragging', '1');
    const ghost = el('div', 'st-drag-ghost');
    ghost.appendChild(makeMonoSvg('chat', 12));
    ghost.appendChild(el('span', '', dragState.title));
    overlayRoot.appendChild(ghost);
    dragState.ghostEl = ghost;
  }
  if (dragState.ghostEl) {
    dragState.ghostEl.style.left = `${Math.round(e.clientX + 12)}px`;
    dragState.ghostEl.style.top = `${Math.round(e.clientY + 12)}px`;
  }

  const under = document.elementFromPoint(e.clientX, e.clientY);
  const target = under && typeof under.closest === 'function' ? under.closest('[data-drop-kind]') : null;
  if (target !== dragState.hoverTargetEl) {
    clearDropHoverState();
    if (target) {
      dragState.hoverTargetEl = target;
      target.setAttribute('data-drop-hover', '1');
      // 悬停在折叠文件夹上 450ms 自动展开
      if (target.getAttribute('data-drop-kind') === 'knowledge-folder') {
        const fid = target.getAttribute('data-drop-id');
        const grp = target.closest('.ag-v2-sidebar-group');
        if (fid && grp && grp.getAttribute('data-group-collapsed') === 'true') {
          dragState.autoExpandTimer = setTimeout(() => {
            dragState.autoExpandTimer = null;
            void callRpc('set-knowledge-folder-collapsed', { folderId: fid, collapsed: false });
          }, 450);
        }
      }
    }
  }
});

document.addEventListener('pointerup', () => {
  if (dragState.active) endSessionDrag(true);
});

document.addEventListener('pointercancel', () => {
  if (dragState.active) endSessionDrag(false);
});

/* ── 后台模拟 & WSL2 显式二次确认 Modal ───────────────────────────────── */
async function mutateSingleSessionStatus(cascadeId, nextStatus) {
  const now = Date.now();
  const nextItems = getCatalogItems().map((it) =>
    it.cascadeId === cascadeId
      ? { ...it, status: nextStatus, statusStartedAt: nextStatus === 'idle' ? 0 : now, updatedAt: now }
      : it
  );
  await applyFixture({ catalog: { health: 'ready', items: nextItems } }, `status:${cascadeId}=${nextStatus}`);
}

async function simulateOppositeModeTask(nextStatus) {
  const snap = state.snapshot;
  if (!snap) return;
  const items = getCatalogItems();
  const assignedSet = new Set(snap.chatAssignedIds || []);
  const targetMode = snap.activeMode === 'code' ? 'chat' : 'code';

  const target = items.find((it) => (assignedSet.has(it.cascadeId) ? 'chat' : 'code') === targetMode);
  if (!target && nextStatus !== 'idle') {
    await applyFixture({ preset: 'dual-active-background' }, 'preset:dual-active-background');
    if (nextStatus === 'running') {
      await mutateSingleSessionStatus('code-blocked-approval', 'idle');
    }
    showToast(`已注入后台 ${nextStatus.toUpperCase()} 模拟任务`);
    return;
  }

  if (nextStatus === 'idle') {
    const cleared = items.map((it) => ({ ...it, status: 'idle', statusStartedAt: 0 }));
    await applyFixture({ catalog: { health: 'ready', items: cleared } }, 'clear-bg');
    showToast('已清空全部后台运行/阻塞状态');
    return;
  }

  if (target) {
    await mutateSingleSessionStatus(target.cascadeId, nextStatus);
    showToast(`已将非激活模式会话设为 ${nextStatus.toUpperCase()}`);
  }
}

function openWslConfirmModal(operationId, targetLabel) {
  clearOverlays();
  const backdrop = el('div', 'st-modal-backdrop');
  backdrop.setAttribute('data-testid', 'studio-wsl-confirm-modal');

  const box = el('div', 'st-modal-box');
  const titleRow = el('div', 'st-modal-title');
  titleRow.style.display = 'flex';
  titleRow.style.alignItems = 'center';
  titleRow.style.gap = '7px';
  titleRow.appendChild(makeMonoSvg('terminal', 16));
  titleRow.appendChild(el('span', '', '确认切换至 WSL2 硬沙箱环境'));
  box.appendChild(titleRow);

  box.appendChild(
    el(
      'div',
      'st-modal-desc',
      `操作 ${operationId}（${targetLabel}）需要 WSL2 沙箱隔离校验。确认后将从可信宿主通道签发一次性 challenge 并仅写入该项目级策略，全局 Code 权限保持 0 写入。`
    )
  );

  const foot = el('div', 'st-modal-foot');
  const cancelBtn = el('button', 'st-mono-chip', '取消');
  cancelBtn.type = 'button';
  cancelBtn.setAttribute('data-testid', 'studio-wsl-cancel');
  cancelBtn.addEventListener('click', () => {
    clearOverlays();
    showToast('已取消 WSL2 确认，操作保持暂停');
  });

  const confirmBtn = el('button', 'st-mono-chip', '确认并下发 Challenge');
  confirmBtn.type = 'button';
  confirmBtn.style.background = 'var(--foreground)';
  confirmBtn.style.color = 'var(--background)';
  confirmBtn.setAttribute('data-testid', 'studio-wsl-confirm');
  confirmBtn.addEventListener('click', async () => {
    clearOverlays();
    const { data: chData } = await callStudioPost('/api/studio/wsl-challenge', { operationId }, 'trusted-wsl-challenge');
    if (!chData.ok || !chData.challenge || !chData.challenge.challenge) {
      showToast('无法获取一次性 WSL Challenge');
      return;
    }
    const res = await callRpc('confirm-wsl', {
      operationId,
      challenge: chData.challenge.challenge,
    });
    if (res.ok) {
      triggerChatSimStreamPulse();
      showToast('WSL2 硬沙箱确认成功，首条消息已送达');
    }
  });

  foot.appendChild(cancelBtn);
  foot.appendChild(confirmBtn);
  box.appendChild(foot);
  backdrop.appendChild(box);
  overlayRoot.appendChild(backdrop);
}

/* ── 侧边栏渲染（零 Emoji · 顶部无色差胶囊 · 行内建文件夹 · 拖拽磁吸 · 52px 4 槽微轨） ── */
function renderSidebar(modeDirection = null) {
  clearNode(sidebarMount);
  const snap = state.snapshot;
  if (!snap) return;

  const isCollapsed = stageEl.getAttribute('data-sidebar-collapsed') === '1';
  const aside = el('aside');
  aside.setAttribute('data-testid', 'sidebar-split');
  aside.setAttribute('data-collapsed', String(isCollapsed));
  aside.setAttribute('data-search-open', String(state.searchOpen));

  // 折叠态：52px 极简 4 槽单色微轨（§四.4）
  if (isCollapsed) {
    const rail = el('div', 'st-rail-4slot');
    rail.setAttribute('data-testid', 'studio-mini-rail');

    // 槽 1：单色 Code <-> Chat 切换（带跨模式 Blocked/Running 微光点）
    const slot1 = el('button', 'ag-v2-rail-btn');
    slot1.type = 'button';
    slot1.setAttribute('data-testid', 'rail-mode-toggle');
    slot1.title = snap.activeMode === 'code' ? '切换至 Chat' : '切换至 Code';
    slot1.appendChild(makeMonoSvg(snap.activeMode === 'code' ? 'code' : 'chat', 15));
    if (snap.backgroundBadge && snap.backgroundBadge.count > 0) {
      const dot = el('span', 'st-bg-dot');
      dot.setAttribute('data-status', snap.backgroundBadge.status);
      slot1.appendChild(dot);
    }
    slot1.addEventListener('click', () => {
      const next = snap.activeMode === 'code' ? 'chat' : 'code';
      void callRpc('switch-mode', { to: next, navRev: snap.navRev });
    });
    rail.appendChild(slot1);

    // 槽 2：单色 [+] 新建当前模式对话
    const slot2 = el('button', 'ag-v2-rail-btn');
    slot2.type = 'button';
    slot2.title = '新建对话';
    slot2.appendChild(makeMonoSvg('plus', 15));
    slot2.addEventListener('click', () => {
      void callRpc('navigate', { mode: snap.activeMode, view: '/', navRev: snap.navRev });
    });
    rail.appendChild(slot2);

    // 槽 3：运行中 / 待审批任务克制圆点列表
    const slot3 = el('div', 'st-rail-tasks');
    const assignedSet = new Set(snap.chatAssignedIds || []);
    const activeTasks = getCatalogItems().filter((it) => !it.hidden && (it.status === 'blocked' || it.status === 'running'));
    for (let i = 0; i < Math.min(activeTasks.length, 8); i++) {
      const t = activeTasks[i];
      const tMode = assignedSet.has(t.cascadeId) ? 'chat' : 'code';
      const dotBtn = el('button', 'st-rail-task-dot');
      dotBtn.type = 'button';
      const core = el('span', 'st-rail-dot-core');
      core.setAttribute('data-status', t.status);
      dotBtn.appendChild(core);
      dotBtn.addEventListener('mouseenter', () => {
        openBadgeHoverPreview(dotBtn, {
          targetMode: tMode,
          status: t.status,
          count: 1,
          items: [t],
        });
      });
      dotBtn.addEventListener('mouseleave', hideBadgeHoverPreview);
      dotBtn.addEventListener('click', () => {
        hideBadgeHoverPreview();
        if (tMode !== snap.activeMode) {
          void callRpc('open-background-task', { targetMode: tMode, cascadeId: t.cascadeId, navRev: snap.navRev });
        } else {
          void callRpc('navigate', { mode: tMode, view: `/c/${encodeURIComponent(t.cascadeId)}`, navRev: snap.navRev });
        }
      });
      slot3.appendChild(dotBtn);
    }
    rail.appendChild(slot3);

    // 槽 4（底部）：单色展开 / 设置齿轮入口
    const slot4 = el('button', 'ag-v2-rail-btn');
    slot4.type = 'button';
    slot4.setAttribute('data-testid', 'studio-collapse-btn');
    slot4.title = '展开侧边栏 ( [ )';
    slot4.appendChild(makeMonoSvg('sidebar', 15));
    slot4.addEventListener('click', () => {
      stageEl.setAttribute('data-sidebar-collapsed', '0');
      renderSidebar();
    });
    rail.appendChild(slot4);

    aside.appendChild(rail);
    sidebarMount.appendChild(aside);
    return;
  }

  // 展开态最顶行：[ </> Code | ○ Chat ] 共享弹簧滑块胶囊 + 搜索 + 折叠
  const topBar = el('div', 'ag-v2-sidebar-top');
  const seg = el('div', 'st-bipolar-seg');
  seg.setAttribute('role', 'tablist');
  seg.setAttribute('data-active-mode', snap.activeMode);
  seg.appendChild(el('span', 'st-bipolar-slider'));

  const modes = [
    { id: 'code', icon: 'code', label: 'Code' },
    { id: 'chat', icon: 'chat', label: 'Chat' },
  ];
  for (let i = 0; i < modes.length; i++) {
    const m = modes[i];
    const btn = el('button', 'st-bipolar-btn');
    btn.type = 'button';
    btn.setAttribute('role', 'tab');
    btn.setAttribute('data-mode', m.id);
    btn.setAttribute('data-active', snap.activeMode === m.id ? '1' : '0');
    btn.setAttribute('data-testid', `bipolar-tab-${m.id}`);
    btn.appendChild(makeMonoSvg(m.icon, 13));
    btn.appendChild(el('span', '', m.label));

    const bg = snap.backgroundBadge;
    if (bg && bg.targetMode === m.id && bg.count > 0) {
      const dot = el('span', 'st-bg-dot');
      dot.setAttribute('data-status', bg.status);
      dot.setAttribute('data-testid', `bg-badge-${m.id}`);
      dot.setAttribute('aria-label', `${bg.count} background tasks`);
      dot.addEventListener('mouseenter', () => openBadgeHoverPreview(dot, bg));
      dot.addEventListener('mouseleave', hideBadgeHoverPreview);
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        hideBadgeHoverPreview();
        if (bg.primary && bg.primary.cascadeId) {
          void callRpc('open-background-task', {
            targetMode: bg.targetMode,
            cascadeId: bg.primary.cascadeId,
            navRev: snap.navRev,
          });
        }
      });
      btn.appendChild(dot);
    }

    btn.addEventListener('click', () => {
      if (snap.activeMode !== m.id) {
        if (m.id === 'chat') state.greetingSeed = Math.floor(Math.random() * 100);
        void callRpc('switch-mode', { to: m.id, navRev: snap.navRev });
      }
    });
    seg.appendChild(btn);
  }
  topBar.appendChild(seg);

  const tools = el('div', 'ag-v2-sidebar-top-tools');
  const searchBtn = el('button', 'ag-v2-top-icon-btn');
  searchBtn.type = 'button';
  searchBtn.setAttribute('data-testid', 'sidebar-search-toggle');
  searchBtn.setAttribute('data-active', String(state.searchOpen));
  searchBtn.title = '搜索会话 (Ctrl+K)';
  searchBtn.appendChild(makeMonoSvg('search', 13.5));
  searchBtn.addEventListener('click', () => {
    state.searchOpen = !state.searchOpen;
    if (!state.searchOpen) state.searchQuery = '';
    renderSidebar();
    if (state.searchOpen) {
      const inp = sidebarMount.querySelector('[data-testid="sidebar-search-input"]');
      if (inp) inp.focus();
    }
  });
  tools.appendChild(searchBtn);

  const collapseBtn = el('button', 'ag-v2-collapse-btn');
  collapseBtn.type = 'button';
  collapseBtn.setAttribute('data-testid', 'studio-collapse-btn');
  collapseBtn.title = '折叠侧边栏 ( [ )';
  collapseBtn.appendChild(makeMonoSvg('sidebar', 14));
  collapseBtn.addEventListener('click', () => {
    stageEl.setAttribute('data-sidebar-collapsed', '1');
    renderSidebar();
  });
  tools.appendChild(collapseBtn);
  topBar.appendChild(tools);
  aside.appendChild(topBar);

  // 展开主体容器
  const expBody = el('div', 'ag-v2-sidebar-expanded-body');
  const actionsWrap = el('div', 'ag-v2-sidebar-actions');
  const newBtn = el('button', 'ag-v2-new-chat-btn');
  newBtn.type = 'button';
  newBtn.setAttribute('data-testid', 'studio-new-session-btn');
  const lead = el('span', 'ag-v2-new-chat-lead');
  lead.appendChild(makeMonoSvg('plus', 13.5));
  lead.appendChild(el('span', '', '新建对话'));
  newBtn.appendChild(lead);
  newBtn.appendChild(el('span', 'ag-v2-kbd-hint', '⌘N'));
  newBtn.addEventListener('click', () => {
    if (snap.activeMode === 'chat') state.greetingSeed = Math.floor(Math.random() * 100);
    void callRpc('navigate', { mode: snap.activeMode, view: '/', navRev: snap.navRev });
  });
  actionsWrap.appendChild(newBtn);

  if (state.searchOpen) {
    const sBox = el('div', 'st-inline-create-box');
    sBox.appendChild(makeMonoSvg('search', 12));
    const sInp = el('input', 'st-inline-create-input');
    sInp.type = 'text';
    sInp.setAttribute('data-testid', 'sidebar-search-input');
    sInp.placeholder = '过滤当前模式会话…';
    sInp.value = state.searchQuery;
    sInp.addEventListener('input', () => {
      state.searchQuery = sInp.value;
      renderSidebar();
      const again = sidebarMount.querySelector('[data-testid="sidebar-search-input"]');
      if (again) {
        again.focus();
        again.setSelectionRange(again.value.length, again.value.length);
      }
    });
    sBox.appendChild(sInp);
    actionsWrap.appendChild(sBox);
  }
  expBody.appendChild(actionsWrap);

  const sessionsEl = el(
    'div',
    `ag-v2-scroll ag-v2-sidebar-sessions ${
      modeDirection === 'to-chat'
        ? 'st-sidebar-transition-to-chat'
        : modeDirection === 'to-code'
          ? 'st-sidebar-transition-to-code'
          : ''
    }`
  );
  const parsedCurrent = parseView(snap.currentView);
  const activeCid = parsedCurrent.ok ? parsedCurrent.cascadeId : null;
  const queryLow = state.searchQuery.trim().toLowerCase();

  const matchesQuery = (it) =>
    !queryLow ||
    String(it.title || '').toLowerCase().includes(queryLow) ||
    String(it.cascadeId || '').toLowerCase().includes(queryLow);

  const buildNativeSessionRow = (it, testIdPrefix, onClick, onCtxMenu, enableDrag = false) => {
    const isActive = it.cascadeId === activeCid;
    const isRunning = it.status === 'running';
    const isBlocked = it.status === 'blocked';
    const row = el('button', state.flashSessionId === it.cascadeId ? 'st-drop-flash' : '');
    row.type = 'button';
    row.setAttribute('data-testid', 'conversation-row-sidebar');
    row.setAttribute('data-studio-row', `${testIdPrefix}-${it.cascadeId}`);
    row.setAttribute('data-active', String(isActive));
    row.setAttribute('data-running', String(isRunning));
    if (isActive) {
      const glide = el('span', 'ag-v2-glide-bg');
      glide.setAttribute('aria-hidden', 'true');
      row.appendChild(glide);
    }
    row.appendChild(el('span', 'ag-v2-row-title', it.title || it.cascadeId));
    if (isBlocked) {
      row.appendChild(el('span', 'st-row-amber-dot'));
    } else if (isRunning) {
      row.appendChild(createRunningSpinnerNode());
    } else if (it.continuation === 'needs-rebind') {
      row.appendChild(el('span', 'st-row-mono-tag', '只读'));
    }
    row.addEventListener('click', () => {
      if (dragState.started) return;
      onClick();
    });
    if (onCtxMenu) row.addEventListener('contextmenu', onCtxMenu);
    if (enableDrag) attachChatRowDrag(row, it);
    return row;
  };

  if (snap.activeMode === 'code') {
    const assignedSet = new Set(snap.chatAssignedIds || []);
    const codeItems = getCatalogItems().filter((it) => !it.hidden && !assignedSet.has(it.cascadeId) && matchesQuery(it));
    const byWs = new Map();
    for (let i = 0; i < codeItems.length; i++) {
      const it = codeItems[i];
      const ws = it.workspace || 'Standalone';
      if (!byWs.has(ws)) byWs.set(ws, []);
      byWs.get(ws).push(it);
    }

    const secHead = el('div', 'st-sec-head-row');
    const secLead = el('span', 'st-sec-head-lead');
    secLead.appendChild(makeMonoSvg('code', 12));
    secLead.appendChild(el('span', '', 'Workspaces'));
    secHead.appendChild(secLead);
    secHead.appendChild(el('span', 'st-sec-count', String(codeItems.length)));
    sessionsEl.appendChild(secHead);

    if (codeItems.length === 0) {
      sessionsEl.appendChild(el('div', 'st-sb-empty', '当前无匹配的 Code 会话'));
    } else {
      byWs.forEach((wsItems, wsName) => {
        const grp = el('div', 'ag-v2-sidebar-group');
        grp.setAttribute('data-group-collapsed', 'false');
        const hWrap = el('div', 'st-group-head-wrap');
        const headBtn = el('button', 'ag-v2-sidebar-group-head');
        headBtn.type = 'button';
        const chev = el('span', 'st-chev-ico');
        chev.appendChild(makeMonoSvg('chevron', 11));
        headBtn.appendChild(chev);
        headBtn.appendChild(makeMonoSvg('folder', 12));
        headBtn.appendChild(el('span', 'st-group-name', wsName));
        headBtn.appendChild(el('span', 'st-group-count', String(wsItems.length)));
        headBtn.addEventListener('click', () => {
          const cur = grp.getAttribute('data-group-collapsed') === 'true';
          grp.setAttribute('data-group-collapsed', String(!cur));
        });
        hWrap.appendChild(headBtn);
        grp.appendChild(hWrap);

        const colWrap = el('div', 'ag-v2-sidebar-group-collapse');
        const rowsWrap = el('div', 'ag-v2-sidebar-group-rows');
        for (let i = 0; i < wsItems.length; i++) {
          const it = wsItems[i];
          rowsWrap.appendChild(
            buildNativeSessionRow(
              it,
              'code',
              () => {
                void callRpc('navigate', {
                  mode: 'code',
                  view: `/c/${encodeURIComponent(it.cascadeId)}`,
                  navRev: snap.navRev,
                });
              },
              (e) => openCodeContextMenu(e, it),
              false
            )
          );
        }
        colWrap.appendChild(rowsWrap);
        grp.appendChild(colWrap);
        sessionsEl.appendChild(grp);
      });
    }
  } else {
    // ── Chat 侧栏：纯净无 Code，全单色线性 SVG，行内新建文件夹 + 拖拽磁吸 ──
    const cs = snap.chatSidebar || {
      knowledge: { rootItems: [], folders: [], totalCount: 0 },
      spark: { projects: [], totalCount: 0 },
    };

    // 1) Knowledge 区（上方默认工作区，也是拖拽落回根目录的热区）
    const kHead = el('div', 'st-sec-head-row st-root-drop-zone');
    kHead.setAttribute('data-testid', 'chat-sidebar-knowledge');
    kHead.setAttribute('data-drop-kind', 'knowledge-root');
    const kLead = el('span', 'st-sec-head-lead');
    kLead.appendChild(makeMonoSvg('book', 12));
    kLead.appendChild(el('span', '', 'Knowledge'));
    kHead.appendChild(kLead);

    const kRight = el('span', 'st-sec-head-right');
    kRight.appendChild(el('span', 'st-sec-count', String(cs.knowledge.totalCount)));
    const addFolderBtn = el('button', 'st-sec-hover-add');
    addFolderBtn.type = 'button';
    addFolderBtn.setAttribute('data-testid', 'create-knowledge-folder-btn');
    addFolderBtn.setAttribute('data-open', state.inlineFolderOpen ? '1' : '0');
    addFolderBtn.title = '新建子文件夹';
    addFolderBtn.appendChild(makeMonoSvg('plus', 12));
    addFolderBtn.addEventListener('click', () => {
      state.inlineFolderOpen = !state.inlineFolderOpen;
      renderSidebar();
      if (state.inlineFolderOpen) {
        const inp = sidebarMount.querySelector('[data-testid="inline-folder-name-input"]');
        if (inp) inp.focus();
      }
    });
    kRight.appendChild(addFolderBtn);
    kHead.appendChild(kRight);
    sessionsEl.appendChild(kHead);

    // 原地行内平滑展开新建子文件夹输入框（0fr -> 1fr，绝不弹 prompt）
    const inlineGrid = el('div', 'st-inline-create-grid');
    inlineGrid.setAttribute('data-open', state.inlineFolderOpen ? '1' : '0');
    const inlineInner = el('div', 'st-inline-create-inner');
    const inlineBox = el('div', 'st-inline-create-box');
    inlineBox.appendChild(makeMonoSvg('folder', 12));
    const inlineInp = el('input', 'st-inline-create-input');
    inlineInp.type = 'text';
    inlineInp.setAttribute('data-testid', 'inline-folder-name-input');
    inlineInp.placeholder = '输入文件夹名后按 Enter…';
    inlineInp.addEventListener('keydown', async (e) => {
      if (e.key === 'Escape') {
        state.inlineFolderOpen = false;
        renderSidebar();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const name = inlineInp.value.trim();
        if (!name) return;
        state.inlineFolderOpen = false;
        const res = await callRpc('create-knowledge-folder', { name });
        if (res.ok) showToast(`已创建文件夹「${name}」`);
      }
    });
    inlineBox.appendChild(inlineInp);
    inlineInner.appendChild(inlineBox);
    inlineGrid.appendChild(inlineInner);
    sessionsEl.appendChild(inlineGrid);

    const openChatItem = (it) => () => {
      void callRpc('navigate', {
        mode: 'chat',
        view: it.view || `/c/${encodeURIComponent(it.cascadeId)}`,
        navRev: snap.navRev,
      });
    };

    const visibleRoots = cs.knowledge.rootItems.filter(matchesQuery);
    if (visibleRoots.length > 0) {
      const rootRows = el('div', 'ag-v2-sidebar-group-rows');
      for (let i = 0; i < visibleRoots.length; i++) {
        const it = visibleRoots[i];
        rootRows.appendChild(
          buildNativeSessionRow(it, 'chat', openChatItem(it), (e) => openChatSessionContextMenu(e, it), true)
        );
      }
      sessionsEl.appendChild(rootRows);
    }

    for (let i = 0; i < cs.knowledge.folders.length; i++) {
      const f = cs.knowledge.folders[i];
      const fItems = f.items.filter(matchesQuery);
      const grp = el('div', 'ag-v2-sidebar-group');
      grp.setAttribute('data-group-collapsed', String(Boolean(f.collapsed)));
      grp.setAttribute('data-testid', `knowledge-folder-${f.id}`);

      const hWrap = el('div', 'st-group-head-wrap');
      hWrap.setAttribute('data-drop-kind', 'knowledge-folder');
      hWrap.setAttribute('data-drop-id', f.id);
      hWrap.addEventListener('contextmenu', (e) => openFolderContextMenu(e, f));

      if (state.inlineRenameFolderId === f.id) {
        const rBox = el('div', 'st-inline-create-box');
        rBox.style.flex = '1';
        rBox.appendChild(makeMonoSvg('folder', 12));
        const rInp = el('input', 'st-inline-create-input');
        rInp.type = 'text';
        rInp.value = f.name;
        rInp.addEventListener('keydown', async (e) => {
          if (e.key === 'Escape') {
            state.inlineRenameFolderId = null;
            renderSidebar();
          } else if (e.key === 'Enter') {
            e.preventDefault();
            const nextName = rInp.value.trim();
            state.inlineRenameFolderId = null;
            if (nextName && nextName !== f.name) {
              await callRpc('rename-knowledge-folder', { folderId: f.id, name: nextName });
            } else {
              renderSidebar();
            }
          }
        });
        rBox.appendChild(rInp);
        hWrap.appendChild(rBox);
        requestAnimationFrame(() => {
          rInp.focus();
          rInp.select();
        });
      } else {
        const hBtn = el('button', 'ag-v2-sidebar-group-head');
        hBtn.type = 'button';
        const chev = el('span', 'st-chev-ico');
        chev.appendChild(makeMonoSvg('chevron', 11));
        hBtn.appendChild(chev);
        hBtn.appendChild(makeMonoSvg('folder', 12));
        hBtn.appendChild(el('span', 'st-group-name', f.name));
        hBtn.appendChild(el('span', 'st-group-count', String(f.items.length)));
        hBtn.addEventListener('click', () => {
          void callRpc('set-knowledge-folder-collapsed', { folderId: f.id, collapsed: !f.collapsed });
        });
        hWrap.appendChild(hBtn);

        const inlineActs = el('span', 'st-group-inline-acts');
        const renBtn = el('button', 'st-mini-gbtn');
        renBtn.type = 'button';
        renBtn.title = '重命名';
        renBtn.appendChild(makeMonoSvg('edit', 11));
        renBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          state.inlineRenameFolderId = f.id;
          renderSidebar();
        });
        const delBtn = el('button', 'st-mini-gbtn');
        delBtn.type = 'button';
        delBtn.title = '删除（会话退回根目录）';
        delBtn.appendChild(makeMonoSvg('trash', 11));
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          void callRpc('delete-knowledge-folder', { folderId: f.id }).then((r) => {
            if (r.ok) showToast(`已删除「${f.name}」，会话已退回根目录`);
          });
        });
        inlineActs.appendChild(renBtn);
        inlineActs.appendChild(delBtn);
        hWrap.appendChild(inlineActs);
      }
      grp.appendChild(hWrap);

      const colWrap = el('div', 'ag-v2-sidebar-group-collapse');
      const rowsWrap = el('div', 'ag-v2-sidebar-group-rows');
      for (let j = 0; j < fItems.length; j++) {
        const it = fItems[j];
        rowsWrap.appendChild(
          buildNativeSessionRow(it, 'chat', openChatItem(it), (e) => openChatSessionContextMenu(e, it), true)
        );
      }
      if (fItems.length === 0) rowsWrap.appendChild(el('div', 'st-sb-empty', '可拖拽对话至此文件夹'));
      colWrap.appendChild(rowsWrap);
      grp.appendChild(colWrap);
      sessionsEl.appendChild(grp);
    }

    if (cs.knowledge.totalCount === 0 && cs.knowledge.folders.length === 0) {
      sessionsEl.appendChild(el('div', 'st-sb-empty', '暂无对话'));
    }

    // 2) Spark 项目工作区（排在 Knowledge 下方，全单色线框）
    const sHead = el('div', 'st-sec-head-row');
    sHead.setAttribute('data-testid', 'chat-sidebar-spark');
    const sLead = el('span', 'st-sec-head-lead');
    sLead.appendChild(makeMonoSvg('box', 12));
    sLead.appendChild(el('span', '', 'Spark'));
    sHead.appendChild(sLead);

    const sRight = el('span', 'st-sec-head-right');
    sRight.appendChild(el('span', 'st-sec-count', String(cs.spark.totalCount)));
    const newBoxBtn = el('button', 'st-sec-hover-add');
    newBoxBtn.type = 'button';
    newBoxBtn.setAttribute('data-testid', 'create-spark-box-btn');
    newBoxBtn.setAttribute('data-open', state.inlineSparkBoxOpen ? '1' : '0');
    newBoxBtn.title = '新建工作文件夹';
    newBoxBtn.appendChild(makeMonoSvg('plus', 12));
    newBoxBtn.addEventListener('click', () => {
      state.inlineSparkBoxOpen = !state.inlineSparkBoxOpen;
      renderSidebar();
      if (state.inlineSparkBoxOpen) {
        const inp = sidebarMount.querySelector('[data-testid="inline-spark-box-input"]');
        if (inp) inp.focus();
      }
    });
    sRight.appendChild(newBoxBtn);
    sHead.appendChild(sRight);
    sessionsEl.appendChild(sHead);

    const sparkGrid = el('div', 'st-inline-create-grid');
    sparkGrid.setAttribute('data-open', state.inlineSparkBoxOpen ? '1' : '0');
    const sparkInner = el('div', 'st-inline-create-inner');
    const sparkBox = el('div', 'st-inline-create-box');
    sparkBox.appendChild(makeMonoSvg('box', 12));
    const sparkInp = el('input', 'st-inline-create-input');
    sparkInp.type = 'text';
    sparkInp.setAttribute('data-testid', 'inline-spark-box-input');
    sparkInp.placeholder = '输入工作文件夹名称按 Enter…';
    sparkInp.addEventListener('keydown', async (e) => {
      if (e.key === 'Escape') {
        state.inlineSparkBoxOpen = false;
        renderSidebar();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const name = sparkInp.value.trim();
        if (!name) return;
        state.inlineSparkBoxOpen = false;
        await createAndBindSparkBoxByName(name);
      }
    });
    sparkBox.appendChild(sparkInp);
    sparkInner.appendChild(sparkBox);
    sparkGrid.appendChild(sparkInner);
    sessionsEl.appendChild(sparkGrid);

    for (let i = 0; i < cs.spark.projects.length; i++) {
      const p = cs.spark.projects[i];
      const pItems = p.items.filter(matchesQuery);
      const projMeta = (snap.sparkProjects || []).find((x) => x.id === p.id) || {};
      const grp = el('div', 'ag-v2-sidebar-group');
      grp.setAttribute('data-group-collapsed', String(Boolean(p.collapsed)));
      grp.setAttribute('data-testid', `spark-project-${p.id}`);

      const hWrap = el('div', 'st-group-head-wrap');
      hWrap.setAttribute('data-drop-kind', 'spark-project');
      hWrap.setAttribute('data-drop-id', p.id);
      hWrap.addEventListener('contextmenu', (e) => openSparkProjectContextMenu(e, p));

      const hBtn = el('button', 'ag-v2-sidebar-group-head');
      hBtn.type = 'button';
      const chev = el('span', 'st-chev-ico');
      chev.appendChild(makeMonoSvg('chevron', 11));
      hBtn.appendChild(chev);
      hBtn.appendChild(makeMonoSvg('folder', 12));
      hBtn.appendChild(el('span', 'st-group-name', p.name));
      if (projMeta.sharedWithCode) {
        hBtn.appendChild(el('span', 'st-row-mono-tag', '共享'));
      }
      hBtn.appendChild(el('span', 'st-group-count', String(p.items.length)));
      hBtn.addEventListener('click', () => {
        void callRpc('set-spark-project-collapsed', { sparkProjectId: p.id, collapsed: !p.collapsed });
      });
      hWrap.appendChild(hBtn);

      const inlineActs = el('span', 'st-group-inline-acts');
      const unlinkBtn = el('button', 'st-mini-gbtn');
      unlinkBtn.type = 'button';
      unlinkBtn.title = '解绑项目（保留磁盘与历史会话）';
      unlinkBtn.appendChild(makeMonoSvg('unlink', 11));
      unlinkBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        void callRpc('unlink-spark-project', { sparkProjectId: p.id }).then((r) => {
          if (r.ok) showToast(`已解绑「${p.name}」，会话已退回根目录`);
        });
      });
      inlineActs.appendChild(unlinkBtn);
      hWrap.appendChild(inlineActs);
      grp.appendChild(hWrap);

      const colWrap = el('div', 'ag-v2-sidebar-group-collapse');
      const rowsWrap = el('div', 'ag-v2-sidebar-group-rows');
      for (let j = 0; j < pItems.length; j++) {
        const it = pItems[j];
        rowsWrap.appendChild(
          buildNativeSessionRow(it, 'chat', openChatItem(it), (e) => openChatSessionContextMenu(e, it), true)
        );
      }
      if (pItems.length === 0) rowsWrap.appendChild(el('div', 'st-sb-empty', '在右侧选此项目开始对话'));
      colWrap.appendChild(rowsWrap);
      grp.appendChild(colWrap);
      sessionsEl.appendChild(grp);
    }

    if (cs.spark.projects.length === 0) {
      sessionsEl.appendChild(el('div', 'st-sb-empty', '切至 Spark 选择本地目录或新建工作文件夹'));
    }
  }

  expBody.appendChild(sessionsEl);

  const footWrap = el('div', 'ag-v2-sidebar-footer-wrap');
  const footBtn = el('button', 'ag-v2-sidebar-footer');
  footBtn.type = 'button';
  footBtn.appendChild(makeMonoSvg('settings', 13.5));
  footBtn.appendChild(el('span', 'ag-v2-footer-label', 'Customizations'));
  footBtn.addEventListener('click', () => {
    const next = workspaceGrid.getAttribute('data-audit-open') === '1' ? '0' : '1';
    workspaceGrid.setAttribute('data-audit-open', next);
    document.getElementById('btn-toggle-audit').setAttribute('data-active', next);
  });
  footWrap.appendChild(footBtn);
  expBody.appendChild(footWrap);
  aside.appendChild(expBody);

  sidebarMount.appendChild(aside);
  if (state.flashSessionId) {
    setTimeout(() => { state.flashSessionId = null; }, 340);
  }
}

/* ── Spark 项目挂载（工作文件夹 / 独立目录 / 共享目录安全兼容） ────────── */
async function createAndBindSparkBoxByName(name) {
  const created = await callRpc('create-spark-box', { name });
  if (!created.ok || !created.result || !created.result.selectionToken) return;
  const freshSnap = state.snapshot;
  if (freshSnap.activeMode !== 'chat' || freshSnap.currentView !== '/') {
    await callRpc('switch-mode', { to: 'chat', navRev: freshSnap.navRev });
    await callRpc('navigate', { mode: 'chat', view: '/', navRev: state.snapshot.navRev });
  }
  const sel = await callRpc('select-spark-project', {
    selectionToken: created.result.selectionToken,
    navRev: state.snapshot.navRev,
    draftRev: state.snapshot.draftRev,
  });
  if (sel.ok) showToast(`已创建并选中工作文件夹：${created.result.displayName}`);
}

async function pickAndBindSparkDirectory(sharedWithCode = false) {
  const picked = await callRpc(
    'pick-project-directory',
    sharedWithCode ? { preset: 'shared-code-repo' } : { mockDirName: 'Spark-Workspace' }
  );
  if (!picked.ok || !picked.result || picked.result.cancelled || !picked.result.selectionToken) return;
  const freshSnap = state.snapshot;
  if (freshSnap && (freshSnap.activeMode !== 'chat' || freshSnap.currentView !== '/')) {
    await callRpc('switch-mode', { to: 'chat', navRev: freshSnap.navRev });
    await callRpc('navigate', { mode: 'chat', view: '/', navRev: state.snapshot.navRev });
  }
  const sel = await callRpc('select-spark-project', {
    selectionToken: picked.result.selectionToken,
    navRev: state.snapshot.navRev,
    draftRev: state.snapshot.draftRev,
  });
  if (sel.ok) {
    showToast(
      sharedWithCode || picked.result.sharedWithCode
        ? `已挂载共享目录「${picked.result.displayName}」（安全兼容，全局 Code 权限 0 写入）`
        : `已挂载独立目录「${picked.result.displayName}」`
    );
  }
}

/* ── Chat 发送首条消息 + 正中心 -> 底部停靠 FLIP GPU 飞行转场（380ms） ── */
function triggerChatSimStreamPulse() {
  state.chatSimRunning = true;
  syncAmbientAuraLayer();
  if (state.chatSimTimer) clearTimeout(state.chatSimTimer);
  state.chatSimTimer = setTimeout(() => {
    state.chatSimRunning = false;
    state.chatSimTimer = null;
    syncAmbientAuraLayer();
  }, 2400);
}

async function handleSendFirstChatMessage() {
  const snap = state.snapshot;
  if (!snap) return;
  const text = state.composerText.trim();
  if (!text) return;

  if (snap.activeMode === 'code') {
    if (mascotRig && typeof mascotRig.notify === 'function') mascotRig.notify('celebrate');
    state.composerText = '';
    showToast('Code 模式：指令已触发（全局权限 0 写入）');
    renderMainCanvas();
    return;
  }

  // 已在 Chat 对话阅读页时直接追加一轮对话并触发 3.5s 活跃氛围光
  if (snap.currentView !== '/') {
    const parsed = parseView(snap.currentView);
    if (parsed.ok && parsed.cascadeId) {
      const list = state.sessionMessages.get(parsed.cascadeId) || [];
      list.push({ role: 'user', text });
      list.push({
        role: 'assistant',
        thought: `使用 ${state.selectedModel}（思考强度：${getEffortShortLabel(state.selectedEffort)}）分析当前上下文，整理关键结论并同步更新右侧文档。`,
        text: '已为你补充整理本轮要点：建议按目标拆解、关键里程碑与风险备选三部分推进，右侧 Artifacts 视图已同步更新结构化草案。',
      });
      state.sessionMessages.set(parsed.cascadeId, list);
      state.composerText = '';
      triggerChatSimStreamPulse();
      renderMainCanvas();
    }
    return;
  }

  if (snap.chatDraft.kind === 'spark' && !snap.chatDraft.sparkProjectId) {
    showToast('请先在底托选择一个项目或文件夹再发送');
    return;
  }

  // 捕获 FLIP 起点坐标 + 触发问候语上移淡出（180ms）
  const centerShell = mainPrimary.querySelector('.st-chat-composer-shell');
  const firstTop = centerShell ? centerShell.getBoundingClientRect().top : null;
  const greetHeader = mainPrimary.querySelector('.st-chat-greet-header');
  if (greetHeader && state.motionLevel !== 'off') {
    greetHeader.setAttribute('data-exiting', '1');
  }

  await applyFixture({ faults: { requireWslConfirmation: state.requireWslSim } }, 'wsl-fault-sync');
  const fresh = state.snapshot;
  if (firstTop !== null && state.motionLevel !== 'off') {
    state.pendingFlipFromTop = firstTop;
  }

  const res = await callRpc('send-chat-first', {
    navRev: fresh.navRev,
    draftRev: fresh.draftRev,
    message: text,
  });

  if (res.ok && res.result) {
    if (res.result.status === 'awaiting-confirmation' && res.result.operationId) {
      state.pendingFlipFromTop = null;
      if (greetHeader) greetHeader.removeAttribute('data-exiting');
      const targetName =
        fresh.chatDraft.kind === 'spark'
          ? (fresh.sparkProjects.find((p) => p.id === fresh.chatDraft.sparkProjectId)?.name || 'Spark Project')
          : 'Knowledge Space';
      openWslConfirmModal(res.result.operationId, targetName);
      return;
    }
    if (res.result.cascadeId) {
      state.sessionMessages.set(res.result.cascadeId, [
        { role: 'user', text },
        {
          role: 'assistant',
          thought:
            fresh.chatDraft.kind === 'spark'
              ? `使用 ${state.selectedModel}（思考强度：${getEffortShortLabel(state.selectedEffort)}）检查当前项目目录结构，并在项目级安全围栏内规划步骤。`
              : `使用 ${state.selectedModel}（思考强度：${getEffortShortLabel(state.selectedEffort)}）梳理核心思路，并生成右侧结构化摘要。`,
          text:
            fresh.chatDraft.kind === 'spark'
              ? '已连接到所选工作目录并准备好协作处理该任务。权限策略仅限定在当前目录作用域内，不会影响后台 Code 工程会话。'
              : '已为你梳理清晰的思路与执行清单。你可以随时展开右侧 Artifacts 面板查看文档摘要，或在下方继续追问细节。',
        },
      ]);
      state.composerText = '';
      triggerChatSimStreamPulse();
      renderMainCanvas();
    }
  } else {
    state.pendingFlipFromTop = null;
    if (greetHeader) greetHeader.removeAttribute('data-exiting');
  }
}

/* ── Chat 纯净输入框（图四留白 -> 图五 260ms 弹簧底托） ─────────────────── */
function openChatPlusMenu(anchorEl, snap) {
  clearOverlays();
  const menu = el('div', 'st-popover');
  menu.setAttribute('data-testid', 'chat-plus-menu');

  addMenuItem(menu, 'paperclip', '上传文件 / 截图（原生透传）', null, () => {
    showToast('已透传宿主原生附件选择器（预览模拟）');
  });

  if (snap.chatDraft.kind === 'knowledge' && snap.currentView === '/') {
    menu.appendChild(el('div', 'st-menu-sep'));
    addMenuItem(
      menu,
      'book',
      '归入 Knowledge 根目录',
      snap.chatDraft.folderId === null ? '已选' : null,
      () => {
        void callRpc('set-chat-draft', {
          draft: { kind: 'knowledge', folderId: null, sparkProjectId: null },
          navRev: snap.navRev,
          draftRev: snap.draftRev,
        });
      }
    );
    for (let i = 0; i < (snap.knowledgeFolders || []).length; i++) {
      const f = snap.knowledgeFolders[i];
      addMenuItem(
        menu,
        'folder',
        `指定子文件夹：${f.name}`,
        snap.chatDraft.folderId === f.id ? '已选' : null,
        () => {
          void callRpc('set-chat-draft', {
            draft: { kind: 'knowledge', folderId: f.id, sparkProjectId: null },
            navRev: snap.navRev,
            draftRev: snap.draftRev,
          });
        }
      );
    }
    menu.appendChild(el('div', 'st-menu-sep'));
    addMenuItem(menu, 'globe', '优先联网调研', state.webResearchPreferred ? '开' : '关', () => {
      state.webResearchPreferred = !state.webResearchPreferred;
      showToast(state.webResearchPreferred ? '已开启优先联网调研' : '已关闭优先联网调研');
    });
    addMenuItem(menu, 'panelRight', '右侧 Artifacts 预览', state.artifactsOpen ? '开' : '关', () => {
      state.artifactsOpen = !state.artifactsOpen;
      renderMainCanvas();
    });
  }

  mountAnchoredPopover(menu, anchorEl, true);
}

function getEffortShortLabel(effortId) {
  const found = CHAT_EFFORT_TIERS.find((t) => t.id === effortId);
  return found ? found.label : '高';
}

function openChatModelMenu(anchorEl) {
  clearOverlays();
  const menu = el('div', 'st-popover st-model-popover');
  menu.setAttribute('data-testid', 'chat-model-menu');

  menu.appendChild(el('div', 'st-model-sec-label', 'Gemini 模型'));
  for (let i = 0; i < GEMINI_CHAT_MODELS.length; i++) {
    const m = GEMINI_CHAT_MODELS[i];
    const opt = el('button', 'st-model-opt');
    opt.type = 'button';
    opt.setAttribute('data-testid', `chat-model-opt-${m.id.toLowerCase().replace(/\s+/g, '-')}`);
    opt.setAttribute('data-selected', state.selectedModel === m.id ? '1' : '0');

    const lead = el('span', 'st-menu-lead');
    lead.appendChild(makeGeminiBrandSvg(14));
    const main = el('span', 'st-model-opt-main');
    main.appendChild(el('span', 'st-model-opt-name', m.id));
    main.appendChild(el('span', 'st-model-opt-desc', m.desc));
    lead.appendChild(main);
    opt.appendChild(lead);

    if (state.selectedModel === m.id) {
      const ck = el('span', 'st-model-opt-check');
      ck.appendChild(makeMonoSvg('check', 13));
      opt.appendChild(ck);
    }

    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      state.selectedModel = m.id;
      const supported = Array.isArray(m.efforts) && m.efforts.length ? m.efforts : ['Low', 'Medium', 'High'];
      if (!supported.includes(state.selectedEffort)) {
        state.selectedEffort = m.defaultEffort || supported[supported.length - 1] || 'High';
      }
      clearOverlays();
      renderMainCanvas();
    });
    menu.appendChild(opt);
  }

  menu.appendChild(el('div', 'st-menu-sep'));
  menu.appendChild(el('div', 'st-model-sec-label', '思考强度'));

  const curModelObj = GEMINI_CHAT_MODELS.find((x) => x.id === state.selectedModel) || GEMINI_CHAT_MODELS[0];
  const allowedEfforts = Array.isArray(curModelObj.efforts) ? curModelObj.efforts : ['Low', 'Medium', 'High'];
  const pills = el('div', 'st-effort-pills');
  pills.setAttribute('role', 'radiogroup');
  pills.setAttribute('aria-label', '思考强度');
  pills.style.gridTemplateColumns = `repeat(${allowedEfforts.length}, minmax(0, 1fr))`;
  for (let i = 0; i < CHAT_EFFORT_TIERS.length; i++) {
    const tier = CHAT_EFFORT_TIERS[i];
    if (!allowedEfforts.includes(tier.id)) continue;
    const pill = el('button', 'st-effort-pill', tier.fullLabel);
    pill.type = 'button';
    pill.setAttribute('data-testid', `chat-effort-${tier.id.toLowerCase()}`);
    pill.setAttribute('data-active', state.selectedEffort === tier.id ? '1' : '0');
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      state.selectedEffort = tier.id;
      clearOverlays();
      renderMainCanvas();
    });
    pills.appendChild(pill);
  }
  menu.appendChild(pills);

  mountAnchoredPopover(menu, anchorEl, true);
}

function openSparkProjectPickerMenu(anchorEl, snap) {
  clearOverlays();
  const menu = el('div', 'st-popover');
  menu.setAttribute('data-testid', 'spark-project-picker-menu');

  const projects = snap.sparkProjects || [];
  for (let i = 0; i < projects.length; i++) {
    const p = projects[i];
    addMenuItem(
      menu,
      'folder',
      p.name,
      p.id === snap.chatDraft.sparkProjectId ? '当前' : p.sharedWithCode ? '共享' : null,
      () => {
        void callRpc('set-chat-draft', {
          draft: { kind: 'spark', folderId: null, sparkProjectId: p.id },
          navRev: snap.navRev,
          draftRev: snap.draftRev,
        });
      }
    );
  }
  if (projects.length > 0) menu.appendChild(el('div', 'st-menu-sep'));

  addMenuItem(menu, 'folder', '选择独立本地目录', '隔离', () => void pickAndBindSparkDirectory(false));
  addMenuItem(menu, 'code', '共享目录：选择已有代码库', '安全兼容', () => void pickAndBindSparkDirectory(true));
  addMenuItem(menu, 'box', '新建工作文件夹', null, () => {
    state.inlineSparkBoxOpen = true;
    renderSidebar();
    const inp = sidebarMount.querySelector('[data-testid="inline-spark-box-input"]');
    if (inp) inp.focus();
  });

  mountAnchoredPopover(menu, anchorEl, true);
}

function openSparkFenceMenu(anchorEl, snap) {
  clearOverlays();
  const menu = el('div', 'st-popover');
  menu.setAttribute('data-testid', 'spark-fence-menu');

  const selectedProj = (snap.sparkProjects || []).find((p) => p.id === snap.chatDraft.sparkProjectId) || null;
  const note = el(
    'div',
    'st-menu-note',
    selectedProj && selectedProj.sharedWithCode
      ? '共享目录 · 安全兼容：检测到与活跃 Code 工程共享物理目录，自动保持现有 Code 权限零覆写，会话按入口独立归档。'
      : `项目级权限围栏：AutoExec=${PERMISSION_PROFILES.spark.autoExecutionPolicy} · FileAccess=${PERMISSION_PROFILES.spark.fileAccessPolicy} · Sandbox=${PERMISSION_PROFILES.spark.sandboxMode} · 全局 Code 权限写入恒为 0。`
  );
  menu.appendChild(note);
  menu.appendChild(el('div', 'st-menu-sep'));
  addMenuItem(
    menu,
    'terminal',
    'WSL2 硬沙箱二次确认演练',
    state.requireWslSim ? '已开启' : '关闭',
    () => {
      state.requireWslSim = !state.requireWslSim;
      showToast(state.requireWslSim ? '发送首条消息时将弹出 WSL2 显式二次确认 Modal' : '已关闭 WSL2 二次确认演练');
    }
  );
  mountAnchoredPopover(menu, anchorEl, true);
}

function setComposerFocusBloom(focused) {
  if (chatAuraLayer) {
    chatAuraLayer.setAttribute('data-composer-focused', focused ? '1' : '0');
  }
}

function getSparkFenceLabel(snap) {
  const selectedProj = (snap.sparkProjects || []).find((p) => p.id === snap.chatDraft.sparkProjectId) || null;
  if (selectedProj && selectedProj.sharedWithCode) return '共享目录 · 安全兼容';
  return state.requireWslSim ? '权限围栏 · WSL2' : '权限围栏';
}

function renderKnowFolderSlot(slotEl, snap) {
  clearNode(slotEl);
  if (snap.chatDraft.kind === 'knowledge' && snap.chatDraft.folderId) {
    const f = (snap.knowledgeFolders || []).find((x) => x.id === snap.chatDraft.folderId);
    if (f) {
      const pill = el('span', 'st-know-folder-pill');
      pill.appendChild(makeMonoSvg('folder', 11));
      pill.appendChild(el('span', '', f.name));
      slotEl.appendChild(pill);
    }
  }
}

function buildPureChatComposer(snap, isDockedBottom) {
  const isHome = snap.currentView === '/' && !isDockedBottom;
  const isSparkTray = isHome && snap.chatDraft.kind === 'spark';
  const spaceKind = isHome
    ? (snap.chatDraft.kind === 'spark' ? 'spark' : 'knowledge')
    : (chatAuraLayer?.getAttribute('data-space-kind') === 'spark' ? 'spark' : 'knowledge');
  const shell = el('div', 'st-chat-composer-shell');
  shell.setAttribute('data-testid', 'chat-pure-composer');
  shell.setAttribute('data-spark-tray', isSparkTray ? '1' : '0');
  shell.setAttribute('data-space-kind', spaceKind);
  shell.setAttribute('data-focused', '0');

  // M3 一体延展式输入舱容器：统一 26px 大圆角外轮廓 + 聚焦空气级 1px 丝绸微流光
  const vessel = el('div', 'st-chat-unified-vessel');
  vessel.addEventListener('focusin', () => {
    shell.setAttribute('data-focused', '1');
    setComposerFocusBloom(true);
  });
  vessel.addEventListener('focusout', (e) => {
    if (!e.relatedTarget || !vessel.contains(e.relatedTarget)) {
      shell.setAttribute('data-focused', '0');
      setComposerFocusBloom(false);
    }
  });

  const card = el('div', 'st-chat-card');

  const inputEl = el('div', 'st-chat-input');
  inputEl.setAttribute('contenteditable', 'true');
  inputEl.setAttribute('data-testid', 'chat-composer-input');
  inputEl.setAttribute(
    'data-placeholder',
    isDockedBottom
      ? '继续提问…（Ctrl+Enter 发送）'
      : isSparkTray
        ? '描述你想在选定目录中协作完成的任务…'
        : '问点什么，或整理一份想法…'
  );
  if (state.composerText) inputEl.textContent = state.composerText;
  inputEl.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      void handleSendFirstChatMessage();
    }
  });
  card.appendChild(inputEl);

  const toolbar = el('div', 'st-chat-toolbar');
  const tbLeft = el('div', 'st-chat-tb-left');

  // 左下 [+] 极简无框圆钮
  const plusBtn = el('button', 'st-mono-icon-btn');
  plusBtn.type = 'button';
  plusBtn.setAttribute('data-testid', 'chat-plus-btn');
  plusBtn.title = '附加与选项';
  plusBtn.appendChild(makeMonoSvg('plus', 15));
  plusBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openChatPlusMenu(plusBtn, state.snapshot || snap);
  });
  tbLeft.appendChild(plusBtn);

  // 新建页左下紧跟无边框失重弹簧微胶囊 [ Knowledge | Spark ]
  if (isHome) {
    const subSeg = el('div', 'st-submode-seg');
    subSeg.setAttribute('role', 'tablist');
    subSeg.setAttribute('data-submode', isSparkTray ? 'spark' : 'knowledge');
    subSeg.appendChild(el('span', 'st-submode-slider'));

    const knowBtn = el('button', 'st-submode-btn', 'Knowledge');
    knowBtn.type = 'button';
    knowBtn.setAttribute('data-testid', 'draft-kind-knowledge');
    knowBtn.setAttribute('data-active', isSparkTray ? '0' : '1');
    knowBtn.addEventListener('click', () => {
      const cur = state.snapshot || snap;
      if (cur.chatDraft.kind !== 'knowledge') {
        void callRpc('set-chat-draft', {
          draft: { kind: 'knowledge', folderId: null, sparkProjectId: null },
          navRev: cur.navRev,
          draftRev: cur.draftRev,
        });
      }
    });
    const sparkBtn = el('button', 'st-submode-btn', 'Spark');
    sparkBtn.type = 'button';
    sparkBtn.setAttribute('data-testid', 'draft-kind-spark');
    sparkBtn.setAttribute('data-active', isSparkTray ? '1' : '0');
    sparkBtn.addEventListener('click', () => {
      const cur = state.snapshot || snap;
      if (cur.chatDraft.kind !== 'spark') {
        const firstId = cur.sparkProjects[0] ? cur.sparkProjects[0].id : null;
        void callRpc('set-chat-draft', {
          draft: { kind: 'spark', folderId: null, sparkProjectId: cur.chatDraft.sparkProjectId || firstId },
          navRev: cur.navRev,
          draftRev: cur.draftRev,
        });
      }
    });
    subSeg.appendChild(knowBtn);
    subSeg.appendChild(sparkBtn);
    tbLeft.appendChild(subSeg);
  }
  toolbar.appendChild(tbLeft);

  // 右下：极简无框纯字 Gemini 模型选择器 + “打字即点亮”发送钮
  const tbRight = el('div', 'st-chat-tb-right');
  const modelBtn = el('button', 'st-mono-chip st-model-trigger-ghost');
  modelBtn.type = 'button';
  modelBtn.setAttribute('data-testid', 'chat-model-picker-btn');
  modelBtn.appendChild(makeGeminiBrandSvg(13));
  const modelLabel = el('span', '', `${state.selectedModel} · ${getEffortShortLabel(state.selectedEffort)}`);
  modelLabel.setAttribute('data-st-role', 'model-label');
  modelBtn.appendChild(modelLabel);
  modelBtn.appendChild(makeMonoSvg('chevronDown', 11));
  modelBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openChatModelMenu(modelBtn);
  });
  tbRight.appendChild(modelBtn);

  const hasText = Boolean(state.composerText.trim());
  const sendBtn = el('button', 'st-sharp-send-btn');
  sendBtn.type = 'button';
  sendBtn.setAttribute('data-testid', 'chat-send-first-btn');
  sendBtn.setAttribute('data-ready', hasText ? '1' : '0');
  sendBtn.title = '发送 (Ctrl+Enter)';
  sendBtn.disabled = !hasText;
  sendBtn.appendChild(makeMonoSvg('arrowUp', 15));
  sendBtn.addEventListener('click', () => void handleSendFirstChatMessage());
  tbRight.appendChild(sendBtn);

  inputEl.addEventListener('input', () => {
    state.composerText = inputEl.textContent || '';
    const ready = Boolean(state.composerText.trim());
    sendBtn.disabled = !ready;
    sendBtn.setAttribute('data-ready', ready ? '1' : '0');
  });

  toolbar.appendChild(tbRight);
  card.appendChild(toolbar);
  vessel.appendChild(card);

  // M3 无缝一体延展 Spark 底座（空间弹簧 280ms 向下延展，与主框同体收束 26px 大圆角、零双层硬框拼接、0px 跳动）
  if (isHome) {
    const trayGrid = el('div', 'st-spark-tray-grid');
    trayGrid.setAttribute('data-testid', 'spark-dock-tray');
    const trayOver = el('div', 'st-spark-tray-overflow');
    const trayBar = el('div', 'st-spark-tray-bar');

    const trayLeft = el('div', 'st-spark-tray-left');
    const selectedProj = (snap.sparkProjects || []).find((p) => p.id === snap.chatDraft.sparkProjectId) || null;

    const projBtn = el('button', 'st-tray-trigger');
    projBtn.type = 'button';
    projBtn.setAttribute('data-testid', 'spark-tray-project-btn');
    projBtn.appendChild(makeMonoSvg('folder', 13));
    const projLabel = el('span', '', selectedProj ? selectedProj.name : '工作文件夹');
    projLabel.setAttribute('data-st-role', 'spark-proj-label');
    projBtn.appendChild(projLabel);
    projBtn.appendChild(makeMonoSvg('chevronDown', 11));
    projBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openSparkProjectPickerMenu(projBtn, state.snapshot || snap);
    });
    trayLeft.appendChild(projBtn);

    const fenceBtn = el('button', 'st-tray-trigger');
    fenceBtn.type = 'button';
    fenceBtn.setAttribute('data-testid', 'spark-tray-fence-btn');
    fenceBtn.appendChild(makeMonoSvg('shield', 13));
    const fenceLabel = el('span', '', getSparkFenceLabel(snap));
    fenceLabel.setAttribute('data-st-role', 'spark-fence-label');
    fenceBtn.appendChild(fenceLabel);
    fenceBtn.appendChild(makeMonoSvg('chevronDown', 11));
    fenceBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openSparkFenceMenu(fenceBtn, state.snapshot || snap);
    });
    trayLeft.appendChild(fenceBtn);
    trayBar.appendChild(trayLeft);

    const infoBtn = el('button', 'st-mini-gbtn st-tray-info-btn');
    infoBtn.type = 'button';
    infoBtn.setAttribute('data-testid', 'spark-tray-info-btn');
    infoBtn.title = '查看项目级零干扰隔离详情';
    infoBtn.appendChild(makeMonoSvg('info', 13.5));
    infoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openSparkFenceMenu(infoBtn, state.snapshot || snap);
    });
    trayBar.appendChild(infoBtn);

    trayOver.appendChild(trayBar);
    trayGrid.appendChild(trayOver);
    vessel.appendChild(trayGrid);
  }

  shell.appendChild(vessel);

  if (isHome) {
    const slotWrap = el('div');
    slotWrap.setAttribute('data-st-role', 'know-folder-slot');
    slotWrap.style.display = 'flex';
    slotWrap.style.justifyContent = 'center';
    renderKnowFolderSlot(slotWrap, snap);
    shell.appendChild(slotWrap);
  }

  return shell;
}

/* ── Code 专属原版发光棱镜输入框 + 双宠 + 512K 实体水试管 ─────────────── */
function buildCodePrismComposerDock() {
  const host = el('div', 'st-composer-host-wrap');
  const dock = el('div', 'ag-v2-composer-dock');
  const wrap = el('div', 'ag-v2-composer-wrap');

  const mascotStage = el('div', 'ag-v2-mascot-stage');
  mascotStage.setAttribute('data-mascot-stage', 'true');
  mascotStage.setAttribute('data-floating', 'true');
  wrap.appendChild(mascotStage);

  let vialCanvas = null;
  if (state.vialOpen) {
    const vPop = el('div', 'st-vial-pop ag-v2-dash-popover');
    vialCanvas = el('canvas', 'st-vial-canvas');
    vialCanvas.setAttribute('data-vial-canvas', 'true');
    vPop.appendChild(vialCanvas);

    const vMeta = el('div');
    vMeta.style.display = 'flex';
    vMeta.style.flexDirection = 'column';
    vMeta.style.gap = '6px';
    vMeta.style.fontSize = '12px';
    const vTitle = el('div', '', '512K 高硼硅物理水试管');
    vTitle.style.fontWeight = '600';
    vMeta.appendChild(vTitle);
    const vSub = el('div', '', '上下文 52% (266K / 512K) · 缓存命中 86.9%');
    vSub.style.color = 'var(--muted-foreground)';
    vMeta.appendChild(vSub);
    const sloshBtn = el('button', 'ag-v2-chip-btn', '晃动弯月水波');
    sloshBtn.type = 'button';
    sloshBtn.addEventListener('click', () => {
      if (vialCtrl) vialCtrl.impulse((Math.random() > 0.5 ? 1 : -1) * 2.2);
    });
    vMeta.appendChild(sloshBtn);
    vPop.appendChild(vMeta);
    wrap.appendChild(vPop);
  }

  const rim = el('div', 'ag-prism-rim');
  rim.setAttribute('data-prism-tier', '1');
  rim.setAttribute('data-testid', 'agent-input-box');

  const inputEl = el('div', 'ag-v2-composer-input');
  inputEl.setAttribute('contenteditable', 'true');
  inputEl.setAttribute('data-placeholder', '输入工作区指令（全局权限隔离保护中）…');
  if (state.composerText) inputEl.textContent = state.composerText;
  inputEl.addEventListener('input', () => {
    state.composerText = inputEl.textContent || '';
    if (mascotRig && typeof mascotRig.notify === 'function') mascotRig.notify('typing');
  });
  inputEl.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      void handleSendFirstChatMessage();
    }
  });
  rim.appendChild(inputEl);

  const toolbar = el('div');
  toolbar.setAttribute('data-testid', 'input-box-bottom-toolbar');

  const tbLeft = el('div', 'ag-v2-toolbar-left');
  const plusBtn = el('button', 'ag-v2-chip-btn ag-v2-chip-icon');
  plusBtn.type = 'button';
  plusBtn.appendChild(makeMonoSvg('plus', 13.5));
  tbLeft.appendChild(plusBtn);

  const modelPill = el('button', 'ag-v2-chip-btn ag-v2-model-trigger-pill');
  modelPill.type = 'button';
  modelPill.appendChild(makeGeminiBrandSvg(13));
  modelPill.appendChild(el('span', 'ag-v2-model-trigger-name', 'Gemini 4 Carbon'));
  const effTag = el('span', 'ag-v2-effort-tag', 'HIGH');
  effTag.setAttribute('data-tier', '2');
  modelPill.appendChild(effTag);
  tbLeft.appendChild(modelPill);

  const permPill = el('button', 'ag-v2-chip-btn');
  permPill.type = 'button';
  permPill.appendChild(el('span', 'ag-v2-perm-dot'));
  permPill.appendChild(el('span', 'ag-v2-chip-label', 'Auto'));
  tbLeft.appendChild(permPill);
  toolbar.appendChild(tbLeft);

  const tbRight = el('div', 'ag-v2-toolbar-right');
  const tele = el('div', 'ag-v2-telemetry-stream');
  tele.appendChild(el('span', 'ag-v2-tele-item', '74.8 tok/s'));
  tele.appendChild(el('span', 'ag-v2-tele-sep', '·'));
  const cacheItem = el('span', 'ag-v2-tele-item');
  cacheItem.appendChild(el('span', 'ag-v2-tele-dim', '缓存命中 '));
  cacheItem.appendChild(document.createTextNode('86.9%'));
  tele.appendChild(cacheItem);
  tele.appendChild(el('span', 'ag-v2-tele-sep', '·'));

  const vialBtn = el('button', 'ag-v2-ctx-trigger');
  vialBtn.type = 'button';
  vialBtn.setAttribute('data-testid', 'dashboard-vial-trigger');
  vialBtn.setAttribute('data-vial-mode', 'vial');
  const ringSvg = document.createElementNS(SVG_NS, 'svg');
  ringSvg.setAttribute('class', 'ag-v2-ring-svg');
  ringSvg.setAttribute('viewBox', '0 0 16 16');
  const tr = document.createElementNS(SVG_NS, 'circle');
  tr.setAttribute('class', 'ag-v2-ring-track');
  tr.setAttribute('cx', '8');
  tr.setAttribute('cy', '8');
  tr.setAttribute('r', '5.5');
  const ar = document.createElementNS(SVG_NS, 'circle');
  ar.setAttribute('class', 'ag-v2-ring-arc');
  ar.setAttribute('cx', '8');
  ar.setAttribute('cy', '8');
  ar.setAttribute('r', '5.5');
  ar.setAttribute('stroke-dasharray', '34.56');
  ar.setAttribute('stroke-dashoffset', '16.59');
  ringSvg.appendChild(tr);
  ringSvg.appendChild(ar);
  vialBtn.appendChild(ringSvg);
  vialBtn.appendChild(el('span', '', '52%'));
  vialBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    state.vialOpen = !state.vialOpen;
    renderMainCanvas();
  });
  tele.appendChild(vialBtn);
  tbRight.appendChild(tele);

  const sendBtn = el('button', 'st-sharp-send-btn');
  sendBtn.type = 'button';
  sendBtn.appendChild(makeMonoSvg('arrowUp', 15));
  sendBtn.addEventListener('click', () => void handleSendFirstChatMessage());
  tbRight.appendChild(sendBtn);

  toolbar.appendChild(tbRight);
  rim.appendChild(toolbar);
  wrap.appendChild(rim);
  dock.appendChild(wrap);
  host.appendChild(dock);

  requestAnimationFrame(() => {
    mountDualMascotInto(mascotStage);
    if (vialCanvas) mountVialInto(vialCanvas);
  });
  return host;
}

/* ── Code 首页统计热力图大盘（图一原味保留给 Code 专属） ────────────────── */
function buildCodeBentoDashboard() {
  const sec = el('section', 'ag-v2-bento-chassis');
  sec.setAttribute('data-testid', 'code-bento-dashboard');
  const inner = el('div', 'ag-v2-chassis-inner');
  const grid = el('div', 'ag-v2-chassis-grid');

  const left = el('div', 'ag-v2-bento-left');
  const heatHead = el('div', 'ag-v2-bento-head');
  heatHead.appendChild(el('span', 'ag-v2-sec-title', '活跃轨迹 · Code 工程沉淀'));
  heatHead.appendChild(el('span', 'ag-v2-pool-stats', '近 30 天'));
  left.appendChild(heatHead);

  const heatGrid = el('div', 'ag-v2-heat-grid');
  const levels = [0, 1, 2, 1, 3, 4, 2, 1, 0, 2, 3, 4, 3, 2, 1, 2, 4, 3, 2, 1, 0, 1, 3, 4, 4, 2, 1, 3];
  for (let i = 0; i < levels.length; i++) {
    const cell = el('span', 'ag-v2-heat-cell');
    cell.setAttribute('data-level', String(levels[i]));
    heatGrid.appendChild(cell);
  }
  left.appendChild(heatGrid);
  grid.appendChild(left);

  const right = el('div', 'ag-v2-bento-right');
  const rHead = el('div', 'ag-v2-bento-head');
  rHead.appendChild(el('span', 'ag-v2-sec-title', '5h 配额池余量'));
  rHead.appendChild(el('span', 'ag-v2-pool-stats', '实时健康'));
  right.appendChild(rHead);

  const pools = [
    { name: 'Gemini Carbon', pct: 94, color: 'var(--ag-pool-pro, #3186ff)' },
    { name: 'Gemini Neon', pct: 86, color: 'var(--ag-pool-flash, #14b8a6)' },
  ];
  const stack = el('div', 'ag-v2-pool-stack');
  for (let i = 0; i < pools.length; i++) {
    const p = pools[i];
    const item = el('div', 'ag-v2-pool-item');
    const top = el('div', 'ag-v2-pool-top');
    top.appendChild(el('span', 'ag-v2-pool-name', p.name));
    top.appendChild(el('span', 'ag-v2-pool-stats', `${p.pct}%`));
    const track = el('div', 'ag-v2-track-4px');
    const fill = el('div', 'ag-v2-track-fill');
    fill.style.width = `${p.pct}%`;
    fill.style.setProperty('--pool-color', p.color);
    track.appendChild(fill);
    item.appendChild(top);
    item.appendChild(track);
    stack.appendChild(item);
  }
  right.appendChild(stack);
  grid.appendChild(right);
  inner.appendChild(grid);
  sec.appendChild(inner);
  return sec;
}

/* ── 主画布顶栏（新建页绝对留白，仅进入具体会话时展示简洁标题与 Artifacts 开关） ── */
function renderMainTopbar() {
  clearNode(mainTopbar);
  const snap = state.snapshot;
  if (!snap) return;

  if (snap.currentView === '/') {
    mainTopbar.setAttribute('data-empty', '1');
    return;
  }
  mainTopbar.setAttribute('data-empty', '0');

  const parsed = parseView(snap.currentView);
  const activeCid = parsed.ok ? parsed.cascadeId : null;
  const activeItem = activeCid ? findCatalogItem(activeCid) : null;
  const cleanTitle = activeItem ? activeItem.title || activeCid : activeCid || '';

  const left = el('div', 'ag-v2-titlebar-left');
  left.appendChild(el('span', 'ag-v2-session-title', cleanTitle));
  mainTopbar.appendChild(left);

  const right = el('div', 'st-titlebar-right');
  if (snap.activeMode === 'chat') {
    const artBtn = el('button', 'st-mono-chip');
    artBtn.type = 'button';
    artBtn.setAttribute('data-testid', 'toggle-artifacts-btn');
    artBtn.appendChild(makeMonoSvg('panelRight', 12));
    artBtn.appendChild(el('span', '', state.artifactsOpen ? '收起 Artifacts' : 'Artifacts'));
    artBtn.addEventListener('click', () => {
      state.artifactsOpen = !state.artifactsOpen;
      renderMainCanvas();
    });
    right.appendChild(artBtn);
  }
  mainTopbar.appendChild(right);
}

function renderArtifactsPane(activeItem, assignment) {
  const snap = state.snapshot;
  const shouldShow = Boolean(snap && snap.activeMode === 'chat' && snap.currentView !== '/' && state.artifactsOpen);
  artifactsPane.setAttribute('data-open', shouldShow ? '1' : '0');
  artifactsPane.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
  if (!shouldShow) return;

  clearNode(artifactsPane);

  // Google Canvas 独立圆角悬浮画板（四周留出空气呼吸边距）
  const canvasSurface = el('div', 'st-canvas-surface');
  const head = el('div', 'st-art-head');
  const hLead = el('span', 'st-sec-head-lead');
  hLead.appendChild(makeMonoSvg('panelRight', 13.5));
  hLead.appendChild(el('span', '', 'Canvas · Artifacts'));
  head.appendChild(hLead);
  const closeBtn = el('button', 'st-mini-gbtn st-canvas-close-btn');
  closeBtn.type = 'button';
  closeBtn.title = '收起画板';
  closeBtn.appendChild(makeMonoSvg('close', 13));
  closeBtn.addEventListener('click', () => {
    state.artifactsOpen = false;
    renderMainCanvas();
  });
  head.appendChild(closeBtn);
  canvasSurface.appendChild(head);

  const body = el('div', 'st-art-body');
  const card = el('div', 'st-msg-card st-canvas-doc-card');
  const t = el('div', 'st-canvas-doc-title', activeItem ? activeItem.title || activeItem.cascadeId : '未命名文档');
  card.appendChild(t);
  card.appendChild(
    el(
      'div',
      'st-canvas-doc-meta',
      assignment && assignment.placement.kind === 'spark'
        ? 'Spark 工作区产物 · 项目级权限围栏（0 触碰全局 Code）'
        : 'Knowledge 空间产物 · 联网研究与结构化预览画板'
    )
  );
  body.appendChild(card);

  body.appendChild(
    el(
      'pre',
      'st-code-block',
      JSON.stringify(
        {
          view: snap.currentView,
          placement: assignment ? assignment.placement : null,
          continuation: assignment ? assignment.continuation : 'ready',
          artifactsAvailable: snap.capabilities?.artifactsAvailable !== false,
        },
        null,
        2
      )
    )
  );
  canvasSurface.appendChild(body);
  artifactsPane.appendChild(canvasSurface);
}

/* 原地热更 Chat 新建页 DOM，确保 Knowledge <-> Spark 切换时 0px 跳动且真实触发 280ms 空间弹簧一体底座展开 */
function patchChatComposeHome(homeEl, snap, draftKindChanged) {
  const isSparkTray = snap.chatDraft.kind === 'spark';
  const markWrap = homeEl.querySelector('.st-brand-mark-wrap');
  if (markWrap) {
    const curBrand = markWrap.getAttribute('data-current-brand');
    const targetBrand = isSparkTray ? 'antigravity' : 'gemini';
    if (curBrand !== targetBrand) {
      clearNode(markWrap);
      markWrap.appendChild(isSparkTray ? makeAntigravityBrandSvg(22) : makeGeminiBrandSvg(22));
      markWrap.setAttribute('data-current-brand', targetBrand);
      if (draftKindChanged) {
        markWrap.classList.remove('st-brand-swap-anim');
        void markWrap.offsetWidth;
        markWrap.classList.add('st-brand-swap-anim');
      }
    }
  }

  const hero = formatHeroGreeting(normalizeGreetingLang(state.locale), state.userName, state.greetingSeed);
  const eyebrowEl = homeEl.querySelector('[data-testid="home-greeting-eyebrow"]');
  if (eyebrowEl && eyebrowEl.textContent !== hero.eyebrow) {
    eyebrowEl.textContent = hero.eyebrow;
  }
  const h1 = homeEl.querySelector('[data-testid="home-greeting"]');
  if (h1 && h1.textContent !== hero.headline) {
    h1.textContent = hero.headline;
  }

  const shell = homeEl.querySelector('[data-testid="chat-pure-composer"]');
  if (shell) {
    shell.setAttribute('data-spark-tray', isSparkTray ? '1' : '0');
    shell.setAttribute('data-space-kind', isSparkTray ? 'spark' : 'knowledge');

    const inputEl = shell.querySelector('[data-testid="chat-composer-input"]');
    if (inputEl) {
      inputEl.setAttribute(
        'data-placeholder',
        isSparkTray ? '描述你想在选定目录中协作完成的任务…' : '问点什么，或整理一份想法…'
      );
      if (document.activeElement !== inputEl && inputEl.textContent !== state.composerText) {
        inputEl.textContent = state.composerText;
      }
    }

    const subSeg = shell.querySelector('.st-submode-seg');
    if (subSeg) subSeg.setAttribute('data-submode', isSparkTray ? 'spark' : 'knowledge');
    const knowBtn = shell.querySelector('[data-testid="draft-kind-knowledge"]');
    const sparkBtn = shell.querySelector('[data-testid="draft-kind-spark"]');
    if (knowBtn) knowBtn.setAttribute('data-active', isSparkTray ? '0' : '1');
    if (sparkBtn) sparkBtn.setAttribute('data-active', isSparkTray ? '1' : '0');

    const modelLabel = shell.querySelector('[data-st-role="model-label"]');
    if (modelLabel) {
      modelLabel.textContent = `${state.selectedModel} · ${getEffortShortLabel(state.selectedEffort)}`;
    }

    const ready = Boolean(state.composerText.trim());
    const sendBtn = shell.querySelector('[data-testid="chat-send-first-btn"]');
    if (sendBtn) {
      sendBtn.disabled = !ready;
      sendBtn.setAttribute('data-ready', ready ? '1' : '0');
    }

    const selectedProj = (snap.sparkProjects || []).find((p) => p.id === snap.chatDraft.sparkProjectId) || null;
    const projLabel = shell.querySelector('[data-st-role="spark-proj-label"]');
    if (projLabel) projLabel.textContent = selectedProj ? selectedProj.name : '工作文件夹';

    const fenceLabel = shell.querySelector('[data-st-role="spark-fence-label"]');
    if (fenceLabel) fenceLabel.textContent = getSparkFenceLabel(snap);

    const slotWrap = shell.querySelector('[data-st-role="know-folder-slot"]');
    if (slotWrap) renderKnowFolderSlot(slotWrap, snap);
  }
}

function renderMainCanvas() {
  const snap = state.snapshot;
  if (!snap) return;

  renderMainTopbar();
  syncAmbientAuraLayer();

  const parsed = parseView(snap.currentView);
  const activeCid = parsed.ok ? parsed.cascadeId : null;
  const activeItem = activeCid ? findCatalogItem(activeCid) : null;
  const activeAssignment = activeCid && snap.assignments ? snap.assignments[activeCid] : null;
  const isHomeRoute = snap.currentView === '/';
  const viewKey = `${snap.activeMode}:${snap.currentView}`;
  const isNewEntrance = viewKey !== state.prevViewKey;
  const draftKindChanged = state.prevChatDraftKind !== null && state.prevChatDraftKind !== snap.chatDraft.kind;
  state.prevViewKey = viewKey;
  state.prevChatDraftKind = snap.chatDraft.kind;

  renderArtifactsPane(activeItem, activeAssignment);

  // 若已在 Chat 新建页，原地复用 DOM 避免销毁重建，从而真实触发 260ms 向下抽拉滑出并保持 0px 垂直跳动
  if (snap.activeMode === 'chat' && isHomeRoute && !isNewEntrance) {
    const existingHome = mainPrimary.querySelector('[data-testid="chat-compose-home"]');
    if (existingHome) {
      patchChatComposeHome(existingHome, snap, draftKindChanged);
      return;
    }
  }

  setComposerFocusBloom(false);
  disposeMascot();
  disposeVial();
  clearNode(mainPrimary);

  const scrollArea = el('div', 'st-primary-scroll ag-v2-scroll');

  // ── 1) Chat 新建页（Gemini 经典居中双层问候 + 黄金锚点 0px 跳动 + M3 一体延展底座） ──
  if (snap.activeMode === 'chat' && isHomeRoute) {
    const center = el('div', 'st-chat-center-stage');
    center.setAttribute('data-testid', 'chat-compose-home');

    const isSparkDraft = snap.chatDraft.kind === 'spark';
    const hero = formatHeroGreeting(normalizeGreetingLang(state.locale), state.userName, state.greetingSeed);

    const header = el('div', 'st-chat-greet-header');
    const eyebrowRow = el('div', `st-chat-greet-eyebrow-row ${isNewEntrance ? 'st-stagger-mark' : ''}`);
    const markWrap = el(
      'span',
      `st-brand-mark-wrap ${draftKindChanged ? 'st-brand-swap-anim' : ''}`
    );
    markWrap.setAttribute('data-current-brand', isSparkDraft ? 'antigravity' : 'gemini');
    markWrap.appendChild(isSparkDraft ? makeAntigravityBrandSvg(22) : makeGeminiBrandSvg(22));
    eyebrowRow.appendChild(markWrap);

    const eyebrowText = el('span', 'st-chat-greet-eyebrow', hero.eyebrow);
    eyebrowText.setAttribute('data-testid', 'home-greeting-eyebrow');
    eyebrowRow.appendChild(eyebrowText);
    header.appendChild(eyebrowRow);

    const h1 = el('h1', `st-chat-greet-h1 ${isNewEntrance ? 'st-stagger-greet' : ''}`, hero.headline);
    h1.setAttribute('data-testid', 'home-greeting');
    header.appendChild(h1);
    center.appendChild(header);

    const composer = buildPureChatComposer(snap, false);
    if (isNewEntrance) composer.classList.add('st-stagger-composer');
    center.appendChild(composer);

    scrollArea.appendChild(center);
    mainPrimary.appendChild(scrollArea);
    return;
  }

  // ── 2) Chat 对话阅读态（Google Neural Expressive 杂志排版 + 显示思路折叠 + Canvas 分屏 + FLIP 停靠） ──
  if (snap.activeMode === 'chat' && activeCid) {
    const col = el('div', 'st-reading-col st-msg-enter');
    col.setAttribute('data-testid', 'chat-reading-view');

    const isSparkConv = Boolean(activeAssignment && activeAssignment.placement && activeAssignment.placement.kind === 'spark');
    const isRunningConv = Boolean(activeItem && activeItem.status === 'running');

    if (activeAssignment && activeAssignment.continuation === 'needs-rebind') {
      const banner = el('div', 'st-msg-card st-rebind-banner');
      banner.setAttribute('data-testid', 'needs-rebind-banner');
      banner.appendChild(el('span', '', '该会话原属已解绑的 Spark 项目，当前处于只读保护态。'));
      const resumeBtn = el('button', 'st-mono-chip', '重新绑定至 Knowledge 继续聊');
      resumeBtn.type = 'button';
      resumeBtn.setAttribute('data-testid', 'resume-chat-session-btn');
      resumeBtn.addEventListener('click', async () => {
        const res = await callRpc('resume-chat-session', { cascadeId: activeCid });
        if (res.ok) showToast('已重绑项目作用域，可恢复续聊');
      });
      banner.appendChild(resumeBtn);
      col.appendChild(banner);
    }

    const msgs = state.sessionMessages.get(activeCid) || [
      { role: 'user', text: `请围绕「${activeItem ? activeItem.title || 'Q3 Product Roadmap Notes' : 'Q3 Product Roadmap Notes'}」整理一份清晰的要点与行动计划。` },
      {
        role: 'assistant',
        thought: '先提炼核心目标与约束边界，按影响面与实现成本拆分阶段里程碑，同时生成结构化大纲以便右侧 Canvas 预览。',
        text: '已按目标背景、关键里程碑与下一步待办整理完成。\n\n你可以点击右上角「Artifacts」展开独立 Canvas 画板查看完整结构化大纲，或者直接告诉我需要深入展开的章节。',
      },
    ];
    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i];
      if (m.role === 'user') {
        col.appendChild(el('div', 'st-msg-user', m.text));
      } else {
        const row = el('div', 'st-msg-assistant-row');
        const avatar = el('div', `st-msg-assistant-avatar ${isRunningConv && i === msgs.length - 1 ? 'is-thinking' : ''}`);
        avatar.appendChild(isSparkConv ? makeAntigravityBrandSvg(22) : makeGeminiBrandSvg(22));
        row.appendChild(avatar);

        const aWrap = el('div', 'st-msg-assistant');
        if (m.thought) {
          const disc = el('div', 'st-thought-disclosure');
          disc.setAttribute('data-open', '1');
          const toggleBtn = el('button', 'st-thought-toggle');
          toggleBtn.type = 'button';
          toggleBtn.appendChild(el('span', '', '显示思路'));
          const chev = el('span', 'st-thought-chev');
          chev.appendChild(makeMonoSvg('chevronDown', 13));
          toggleBtn.appendChild(chev);
          toggleBtn.addEventListener('click', () => {
            const open = disc.getAttribute('data-open') === '1';
            disc.setAttribute('data-open', open ? '0' : '1');
          });
          disc.appendChild(toggleBtn);

          const bodyGrid = el('div', 'st-thought-grid');
          const bodyInner = el('div', 'st-thought-inner');
          bodyInner.appendChild(el('div', 'st-thought-box', m.thought));
          bodyGrid.appendChild(bodyInner);
          disc.appendChild(bodyGrid);
          aWrap.appendChild(disc);
        }

        const prose = el('div', 'st-msg-prose');
        const paras = String(m.text || '').split(/\n\n+/);
        for (let pIdx = 0; pIdx < paras.length; pIdx++) {
          prose.appendChild(el('p', 'st-msg-p', paras[pIdx]));
        }
        aWrap.appendChild(prose);
        row.appendChild(aWrap);
        col.appendChild(row);
      }
    }
    scrollArea.appendChild(col);
    mainPrimary.appendChild(scrollArea);

    const dockWrap = el('div', 'st-chat-dock-bottom');
    const dockedComposer = buildPureChatComposer(snap, true);
    dockWrap.appendChild(dockedComposer);
    mainPrimary.appendChild(dockWrap);

    // 执行正中心 -> 底部停靠 FLIP 共享元素 GPU 飞行转场（380ms）
    if (state.pendingFlipFromTop !== null && state.motionLevel !== 'off') {
      const fromTop = state.pendingFlipFromTop;
      state.pendingFlipFromTop = null;
      const lastTop = dockedComposer.getBoundingClientRect().top;
      const dy = fromTop - lastTop;
      if (Math.abs(dy) > 4) {
        dockedComposer.style.transition = 'none';
        dockedComposer.style.transform = `translate3d(0, ${Math.round(dy)}px, 0)`;
        requestAnimationFrame(() => {
          dockedComposer.style.transition = 'transform 380ms cubic-bezier(0.22, 1, 0.36, 1)';
          dockedComposer.style.transform = 'translate3d(0, 0, 0)';
        });
      }
    }
    return;
  }

  // ── 3) Code 工程首页（图一原味保留：字符海 + Antigravity 图标 + 热力图大盘 + 双宠 + 完整遥测） ──
  if (isHomeRoute) {
    const stack = el('div', 'st-code-home-stack');
    stack.setAttribute('data-testid', 'code-workspace-view');

    const greetRow = el('div', 'ag-v2-greeting-row');
    const gLead = el('div');
    gLead.style.display = 'inline-flex';
    gLead.style.alignItems = 'center';
    gLead.style.gap = '10px';
    gLead.appendChild(makeAntigravityBrandSvg(28));
    const h1 = el('h1', '', state.userName ? `接下来做什么，${state.userName}？` : '接下来做什么？');
    h1.setAttribute('data-testid', 'home-greeting');
    gLead.appendChild(h1);
    greetRow.appendChild(gLead);

    const readyBadge = el('span', 'ag-v2-ready-badge');
    const dots = el('span', 'ag-v2-google-dots');
    ['is-b', 'is-r', 'is-y', 'is-g'].forEach((cls) => dots.appendChild(el('i', cls)));
    readyBadge.appendChild(dots);
    readyBadge.appendChild(el('span', '', 'CODE WORKSPACE READY'));
    greetRow.appendChild(readyBadge);
    stack.appendChild(greetRow);

    stack.appendChild(buildCodeBentoDashboard());
    stack.appendChild(buildCodePrismComposerDock());
    scrollArea.appendChild(stack);
    mainPrimary.appendChild(scrollArea);
    if (rippleCtrl) requestAnimationFrame(() => rippleCtrl.invalidate());
    return;
  }

  // ── 4) Code 会话视图 ──
  const col = el('div', 'st-reading-col');
  col.style.width = 'min(860px, 100%)';
  col.setAttribute('data-testid', 'code-workspace-view');
  const card = el('div', 'st-msg-card');
  const cHead = el('div', '', `Code 会话：${activeItem ? activeItem.title || activeCid : activeCid}`);
  cHead.style.fontWeight = '600';
  cHead.style.marginBottom = '6px';
  card.appendChild(cHead);
  const sub = el(
    'div',
    '',
    `工作区：${activeItem?.workspace || 'Standalone'} · 状态：${String(activeItem?.status || 'idle').toUpperCase()} · 全局权限：只读隔离（0 写入）`
  );
  sub.style.fontSize = '13px';
  sub.style.color = 'var(--secondary-foreground)';
  card.appendChild(sub);
  col.appendChild(card);

  col.appendChild(
    el(
      'pre',
      'st-code-block',
      [
        '// Code 模式全局权限基线（双极架构硬隔离保护）',
        'const globalCodeSettings = {',
        '  autoExecutionPolicy: "turbo",',
        '  fileAccessPolicy: "allow-all",',
        '  internetPolicy: "allow",',
        '  sandboxMode: "off",',
        '};',
        `// 当前视图: code:${snap.currentView} | 对侧 Chat 记忆: chat:${snap.modeLastView.chat}`,
      ].join('\n')
    )
  );
  scrollArea.appendChild(col);
  mainPrimary.appendChild(scrollArea);
  mainPrimary.appendChild(buildCodePrismComposerDock());
}

/* ── 右侧开发者状态机与项目级权限隔离审计抽屉 ─────────────────────────── */
function renderAuditDrawer() {
  const snap = state.snapshot;
  const audit = state.audit;
  if (!snap) return;

  sandboxChipEl.textContent = snap.storeId;
  revMetaEl.textContent = `rev=${snap.rev} · nav=${snap.navRev}`;

  const globalWrites = audit && typeof audit.globalPermissionWrites === 'number' ? audit.globalPermissionWrites : 0;
  auditPillEl.setAttribute('data-status', globalWrites === 0 ? 'clean' : 'violated');
  auditTextEl.textContent = `Global Writes: ${globalWrites}`;

  clearNode(auditBody);

  const c1 = el('div', 'st-audit-card');
  c1.appendChild(el('div', 'st-audit-ctitle', 'Bipolar State & Routing'));
  const kvRows = [
    ['activeMode', snap.activeMode],
    ['modeLastView.code', snap.modeLastView.code],
    ['modeLastView.chat', snap.modeLastView.chat],
    ['chatDraft', `${snap.chatDraft.kind} (${snap.chatDraft.folderId || snap.chatDraft.sparkProjectId || 'root'})`],
    ['backgroundBadge', snap.backgroundBadge ? `${snap.backgroundBadge.targetMode}:${snap.backgroundBadge.status}(${snap.backgroundBadge.count})` : 'null'],
    ['auraPhase', chatAuraLayer ? chatAuraLayer.getAttribute('data-phase') : 'off'],
  ];
  for (let i = 0; i < kvRows.length; i++) {
    const row = el('div', 'st-audit-kv');
    row.appendChild(el('span', '', kvRows[i][0]));
    row.appendChild(el('span', '', String(kvRows[i][1])));
    c1.appendChild(row);
  }
  auditBody.appendChild(c1);

  const c2 = el('div', 'st-audit-card');
  c2.appendChild(el('div', 'st-audit-ctitle', 'Project-Scoped Permission Audit'));
  const gRow = el('div', 'st-audit-kv');
  gRow.appendChild(el('span', '', 'globalPermissionWrites'));
  gRow.appendChild(el('span', '', String(globalWrites)));
  c2.appendChild(gRow);
  const pRow = el('div', 'st-audit-kv');
  pRow.appendChild(el('span', '', 'projectPermissionWrites'));
  pRow.appendChild(el('span', '', String(audit ? audit.projectPermissionWrites || 0 : 0)));
  c2.appendChild(pRow);
  const ndRow = el('div', 'st-audit-kv');
  ndRow.appendChild(el('span', '', 'nonDestructiveGuardCount'));
  ndRow.appendChild(el('span', '', String(audit ? audit.nonDestructiveGuardCount || 0 : 0)));
  c2.appendChild(ndRow);

  const permLogLines = (audit && Array.isArray(audit.permissionAuditLog) ? audit.permissionAuditLog : [])
    .slice(-8)
    .reverse()
    .map((e) => `${e.scope} | ${e.setter}(${e.scopeRef}, ${JSON.stringify(e.value)}) => ${e.ok ? 'OK' : 'ERR'}`);
  c2.appendChild(
    el('pre', 'st-audit-log', permLogLines.length ? permLogLines.join('\n') : '(尚无项目级权限写入记录；全局写入恒为 0)')
  );
  auditBody.appendChild(c2);

  const c3 = el('div', 'st-audit-card');
  c3.appendChild(el('div', 'st-audit-ctitle', 'RPC & Fixture Trace'));
  c3.appendChild(el('pre', 'st-audit-log', state.rpcLog.length ? state.rpcLog.join('\n') : '(等待操作)'));
  auditBody.appendChild(c3);
}

function renderAll() {
  if (!state.snapshot) return;
  let dir = null;
  if (state.prevMode && state.prevMode !== state.snapshot.activeMode) {
    dir = state.snapshot.activeMode === 'chat' ? 'to-chat' : 'to-code';
  }
  state.prevMode = state.snapshot.activeMode;
  stageEl.setAttribute('data-active-mode', state.snapshot.activeMode);
  renderSidebar(dir);
  renderMainCanvas();
  renderAuditDrawer();
}

function bindGlobalEvents() {
  const presetBtns = document.querySelectorAll('[data-st-preset]');
  for (let i = 0; i < presetBtns.length; i++) {
    presetBtns[i].addEventListener('click', () => {
      applyThemePreset(presetBtns[i].getAttribute('data-st-preset'));
    });
  }

  const localeSel = document.getElementById('sel-studio-locale');
  localeSel.addEventListener('change', () => {
    state.locale = localeSel.value;
    state.greetingSeed = Math.floor(Math.random() * 100);
    renderMainCanvas();
  });

  const userToggleBtn = document.getElementById('btn-toggle-username');
  if (userToggleBtn) {
    userToggleBtn.addEventListener('click', () => {
      state.userName = state.userName ? '' : 'Alex';
      userToggleBtn.textContent = state.userName || '无名';
      userToggleBtn.setAttribute('data-active', state.userName ? '1' : '0');
      renderMainCanvas();
    });
  }

  const motionSel = document.getElementById('sel-studio-motion');
  motionSel.addEventListener('change', () => {
    state.motionLevel = motionSel.value;
    stageEl.setAttribute('data-motion', state.motionLevel);
    syncAmbientAuraLayer();
    if (state.motionLevel !== 'off') wakeMasterLoop();
  });

  document.getElementById('btn-sim-running').addEventListener('click', () => void simulateOppositeModeTask('running'));
  document.getElementById('btn-sim-blocked').addEventListener('click', () => void simulateOppositeModeTask('blocked'));
  document.getElementById('btn-sim-idle').addEventListener('click', () => void simulateOppositeModeTask('idle'));
  document.getElementById('btn-studio-reset').addEventListener('click', () => void resetSandbox());

  const auditBtn = document.getElementById('btn-toggle-audit');
  auditBtn.addEventListener('click', () => {
    const next = workspaceGrid.getAttribute('data-audit-open') === '1' ? '0' : '1';
    workspaceGrid.setAttribute('data-audit-open', next);
    auditBtn.setAttribute('data-active', next);
  });

  document.addEventListener('visibilitychange', () => {
    syncAmbientAuraLayer();
    if (!document.hidden && state.motionLevel !== 'off') wakeMasterLoop();
  });

  document.addEventListener('mousedown', (ev) => {
    const pop = overlayRoot.querySelector('.st-popover');
    if (pop && ev.target && !pop.contains(ev.target)) pop.remove();
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      clearOverlays();
      if (state.vialOpen) {
        state.vialOpen = false;
        renderMainCanvas();
      }
      return;
    }
    const target = ev.target;
    const isEditing =
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable);
    if (!isEditing && !ev.ctrlKey && !ev.metaKey && !ev.altKey && ev.key === '[') {
      ev.preventDefault();
      const cur = stageEl.getAttribute('data-sidebar-collapsed') === '1';
      stageEl.setAttribute('data-sidebar-collapsed', cur ? '0' : '1');
      renderSidebar();
      return;
    }
    if (!isEditing && (ev.ctrlKey || ev.metaKey) && !ev.shiftKey && String(ev.key).toLowerCase() === 'k') {
      ev.preventDefault();
      state.searchOpen = !state.searchOpen;
      if (!state.searchOpen) state.searchQuery = '';
      renderSidebar();
      if (state.searchOpen) {
        const inp = sidebarMount.querySelector('[data-testid="sidebar-search-input"]');
        if (inp) inp.focus();
      }
    }
  });
}

mountRippleBackdrop();
bindGlobalEvents();
void fetchInitialState();

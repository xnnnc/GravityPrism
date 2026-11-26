/**
 * Obsidian Prism — Periodic Model Catalog, Classification, Pagination & Benchmark Registry
 *
 * Standalone zero-DOM-dependency catalog engine providing:
 *   - 90-slot main periodic table + 28 f-block IUPAC elements (`ELEMENTS_90`, `SLOT_BY_Z`, `ELEMENT_BY_NAME`)
 *   - Google element model parser & aggregator (`parseElementModelLabel`, `matchGoogleElementModels`)
 *   - Non-element aux model classifier & paginator (`classifyNonElementOption`, `matchHostAuxModels`,
 *     `AUX_PAGE_SIZE`, `getAuxPageCount`, `getAuxPageSlice`, `findAuxPageForId`)
 *   - Honest 2026Q4 public benchmark lookup (`BENCHMARK_2026Q4_DB`, `resolveBenchmarkMetrics`)
 *     that NEVER borrows Carbon or GPT-OSS scores for unknown/unbenchmarked models
 *   - Strict EN/ZH bilingual display helpers with zero hardcoded Chinese when `zh=false`
 *
 * Contract:
 *   globalThis.__agPeriodicModelCatalog = { ... }
 *   module.exports = api
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module && typeof module.exports === 'object') {
    module.exports = api;
  }
  if (root && typeof root === 'object') {
    root.__agPeriodicModelCatalog = api;
  }
  if (typeof globalThis === 'object' && globalThis) {
    globalThis.__agPeriodicModelCatalog = api;
  }
  if (typeof window === 'object' && window) {
    window.__agPeriodicModelCatalog = api;
  }
})(
  typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this,
  function () {
    'use strict';

    var AUX_PAGE_SIZE = 6;
    var DEFAULT_MAX_CONTEXT_TOKENS = 524288; /* Antigravity 512K standard context capacity */

    var EFFORT_ORDER = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
    var EFFORT_NORM_MAP = {
      off: 0.12,
      minimal: 0.2,
      low: 0.25,
      medium: 0.5,
      high: 0.78,
      xhigh: 1.0,
      max: 1.0,
    };
    var EFFORT_LABELS = {
      off: 'Off',
      minimal: 'Minimal',
      low: 'Low',
      medium: 'Medium',
      high: 'High',
      xhigh: 'Extra',
      max: 'Max',
    };
    var EFFORT_LABELS_ZH = {
      off: '关闭',
      minimal: '极低',
      low: '低思考',
      medium: '中思考',
      high: '高思考',
      xhigh: '超高',
      max: '极高',
    };

    var MODEL_TRIGGER_TEXT_RE =
      /(?:gemini|hydrogen|carbon|neon|argon|flash|claude|sonnet|opus|haiku|gpt|openai|o1|o3|o4|codex|orchestrator|编排|调度器)/i;

    var EXCLUDED_FAMILY_RE =
      /\b(?:orchestrator|claude|anthropic|sonnet|opus|haiku|gpt|openai|codex|deepseek|llama|mistral|qwen)\b|\bo[134](?:-[a-z0-9]+)?\b|编排|调度器/i;

    var ZH_EFFORT_PAREN_RE =
      /\s*[（(]\s*(超高|极高|超深|高思考|中思考|低思考|极低|最低|深度思考|思考中?|中等|高|中|低|自动|关闭)\s*[)）]\s*$/;

    var EN_EFFORT_PAREN_RE =
      /\s*\(\s*(off|minimal|low|medium|med|high|xhigh|extra|max|auto)(?:\s+thinking)?\s*\)\s*$/i;

    /* Compact 90-slot main periodic table (18 cols x 7 rows):
       [z, symbol, name, zh, mass, row, col, group, numLabel?] */
    var RAW_SLOTS_90 = [
      [1, 'H', 'Hydrogen', '氢', '1.008', 1, 1, 'nonmetal'],
      [2, 'He', 'Helium', '氦', '4.0026', 1, 18, 'noble'],

      [3, 'Li', 'Lithium', '锂', '6.94', 2, 1, 'alkali'],
      [4, 'Be', 'Beryllium', '铍', '9.0122', 2, 2, 'alkaline'],
      [5, 'B', 'Boron', '硼', '10.81', 2, 13, 'metalloid'],
      [6, 'C', 'Carbon', '碳', '12.011', 2, 14, 'nonmetal'],
      [7, 'N', 'Nitrogen', '氮', '14.007', 2, 15, 'nonmetal'],
      [8, 'O', 'Oxygen', '氧', '15.999', 2, 16, 'nonmetal'],
      [9, 'F', 'Fluorine', '氟', '18.998', 2, 17, 'halogen'],
      [10, 'Ne', 'Neon', '氖', '20.180', 2, 18, 'noble'],

      [11, 'Na', 'Sodium', '钠', '22.990', 3, 1, 'alkali'],
      [12, 'Mg', 'Magnesium', '镁', '24.305', 3, 2, 'alkaline'],
      [13, 'Al', 'Aluminium', '铝', '26.982', 3, 13, 'post-transition'],
      [14, 'Si', 'Silicon', '硅', '28.085', 3, 14, 'metalloid'],
      [15, 'P', 'Phosphorus', '磷', '30.974', 3, 15, 'nonmetal'],
      [16, 'S', 'Sulfur', '硫', '32.06', 3, 16, 'nonmetal'],
      [17, 'Cl', 'Chlorine', '氯', '35.45', 3, 17, 'halogen'],
      [18, 'Ar', 'Argon', '氩', '39.948', 3, 18, 'noble'],

      [19, 'K', 'Potassium', '钾', '39.098', 4, 1, 'alkali'],
      [20, 'Ca', 'Calcium', '钙', '40.078', 4, 2, 'alkaline'],
      [21, 'Sc', 'Scandium', '钪', '44.956', 4, 3, 'transition'],
      [22, 'Ti', 'Titanium', '钛', '47.867', 4, 4, 'transition'],
      [23, 'V', 'Vanadium', '钒', '50.942', 4, 5, 'transition'],
      [24, 'Cr', 'Chromium', '铬', '51.996', 4, 6, 'transition'],
      [25, 'Mn', 'Manganese', '锰', '54.938', 4, 7, 'transition'],
      [26, 'Fe', 'Iron', '铁', '55.845', 4, 8, 'transition'],
      [27, 'Co', 'Cobalt', '钴', '58.933', 4, 9, 'transition'],
      [28, 'Ni', 'Nickel', '镍', '58.693', 4, 10, 'transition'],
      [29, 'Cu', 'Copper', '铜', '63.546', 4, 11, 'transition'],
      [30, 'Zn', 'Zinc', '锌', '65.38', 4, 12, 'transition'],
      [31, 'Ga', 'Gallium', '镓', '69.723', 4, 13, 'post-transition'],
      [32, 'Ge', 'Germanium', '锗', '72.630', 4, 14, 'metalloid'],
      [33, 'As', 'Arsenic', '砷', '74.922', 4, 15, 'metalloid'],
      [34, 'Se', 'Selenium', '硒', '78.971', 4, 16, 'nonmetal'],
      [35, 'Br', 'Bromine', '溴', '79.904', 4, 17, 'halogen'],
      [36, 'Kr', 'Krypton', '氪', '83.798', 4, 18, 'noble'],

      [37, 'Rb', 'Rubidium', '铷', '85.468', 5, 1, 'alkali'],
      [38, 'Sr', 'Strontium', '锶', '87.62', 5, 2, 'alkaline'],
      [39, 'Y', 'Yttrium', '钇', '88.906', 5, 3, 'transition'],
      [40, 'Zr', 'Zirconium', '锆', '91.224', 5, 4, 'transition'],
      [41, 'Nb', 'Niobium', '铌', '92.906', 5, 5, 'transition'],
      [42, 'Mo', 'Molybdenum', '钼', '95.95', 5, 6, 'transition'],
      [43, 'Tc', 'Technetium', '锝', '98', 5, 7, 'transition'],
      [44, 'Ru', 'Ruthenium', '钌', '101.07', 5, 8, 'transition'],
      [45, 'Rh', 'Rhodium', '铑', '102.91', 5, 9, 'transition'],
      [46, 'Pd', 'Palladium', '钯', '106.42', 5, 10, 'transition'],
      [47, 'Ag', 'Silver', '银', '107.87', 5, 11, 'transition'],
      [48, 'Cd', 'Cadmium', '镉', '112.41', 5, 12, 'transition'],
      [49, 'In', 'Indium', '铟', '114.82', 5, 13, 'post-transition'],
      [50, 'Sn', 'Tin', '锡', '118.71', 5, 14, 'post-transition'],
      [51, 'Sb', 'Antimony', '锑', '121.76', 5, 15, 'metalloid'],
      [52, 'Te', 'Tellurium', '碲', '127.60', 5, 16, 'metalloid'],
      [53, 'I', 'Iodine', '碘', '126.90', 5, 17, 'halogen'],
      [54, 'Xe', 'Xenon', '氙', '131.29', 5, 18, 'noble'],

      [55, 'Cs', 'Caesium', '铯', '132.91', 6, 1, 'alkali'],
      [56, 'Ba', 'Barium', '钡', '137.33', 6, 2, 'alkaline'],
      [57, 'La', 'Lanthanum', '镧', '138.91', 6, 3, 'lanthanoid', '57-71'],
      [72, 'Hf', 'Hafnium', '铪', '178.49', 6, 4, 'transition'],
      [73, 'Ta', 'Tantalum', '钽', '180.95', 6, 5, 'transition'],
      [74, 'W', 'Tungsten', '钨', '183.84', 6, 6, 'transition'],
      [75, 'Re', 'Rhenium', '铼', '186.21', 6, 7, 'transition'],
      [76, 'Os', 'Osmium', '锇', '190.23', 6, 8, 'transition'],
      [77, 'Ir', 'Iridium', '铱', '192.22', 6, 9, 'transition'],
      [78, 'Pt', 'Platinum', '铂', '195.08', 6, 10, 'transition'],
      [79, 'Au', 'Gold', '金', '196.97', 6, 11, 'transition'],
      [80, 'Hg', 'Mercury', '汞', '200.59', 6, 12, 'transition'],
      [81, 'Tl', 'Thallium', '铊', '204.38', 6, 13, 'post-transition'],
      [82, 'Pb', 'Lead', '铅', '207.2', 6, 14, 'post-transition'],
      [83, 'Bi', 'Bismuth', '铋', '208.98', 6, 15, 'post-transition'],
      [84, 'Po', 'Polonium', '钋', '209', 6, 16, 'metalloid'],
      [85, 'At', 'Astatine', '砹', '210', 6, 17, 'halogen'],
      [86, 'Rn', 'Radon', '氡', '222', 6, 18, 'noble'],

      [87, 'Fr', 'Francium', '钫', '223', 7, 1, 'alkali'],
      [88, 'Ra', 'Radium', '镭', '226', 7, 2, 'alkaline'],
      [89, 'Ac', 'Actinium', '锕', '227', 7, 3, 'actinoid', '89-103'],
      [104, 'Rf', 'Rutherfordium', '𬬻', '267', 7, 4, 'transition'],
      [105, 'Db', 'Dubnium', '𬭊', '268', 7, 5, 'transition'],
      [106, 'Sg', 'Seaborgium', '𬭳', '269', 7, 6, 'transition'],
      [107, 'Bh', 'Bohrium', '𬭛', '270', 7, 7, 'transition'],
      [108, 'Hs', 'Hassium', '𬭶', '277', 7, 8, 'transition'],
      [109, 'Mt', 'Meitnerium', '鿏', '278', 7, 9, 'transition'],
      [110, 'Ds', 'Darmstadtium', '𫟼', '281', 7, 10, 'transition'],
      [111, 'Rg', 'Roentgenium', '𬬭', '282', 7, 11, 'transition'],
      [112, 'Cn', 'Copernicium', '鎶', '285', 7, 12, 'transition'],
      [113, 'Nh', 'Nihonium', '鉨', '286', 7, 13, 'post-transition'],
      [114, 'Fl', 'Flerovium', '𫓧', '289', 7, 14, 'post-transition'],
      [115, 'Mc', 'Moscovium', '镆', '290', 7, 15, 'post-transition'],
      [116, 'Lv', 'Livermorium', '𫟷', '293', 7, 16, 'post-transition'],
      [117, 'Ts', 'Tennessine', '鿬', '294', 7, 17, 'halogen'],
      [118, 'Og', 'Oganesson', '鿫', '294', 7, 18, 'noble'],
    ];

    /* Remaining f-block elements (58..71 -> slot 57, 90..103 -> slot 89) so all 118 IUPAC elements match */
    var RAW_FBLOCK_28 = [
      [58, 'Ce', 'Cerium', '铈', '140.12', 57, 'lanthanoid'],
      [59, 'Pr', 'Praseodymium', '镨', '140.91', 57, 'lanthanoid'],
      [60, 'Nd', 'Neodymium', '钕', '144.24', 57, 'lanthanoid'],
      [61, 'Pm', 'Promethium', '钷', '145', 57, 'lanthanoid'],
      [62, 'Sm', 'Samarium', '钐', '150.36', 57, 'lanthanoid'],
      [63, 'Eu', 'Europium', '铕', '151.96', 57, 'lanthanoid'],
      [64, 'Gd', 'Gadolinium', '钆', '157.25', 57, 'lanthanoid'],
      [65, 'Tb', 'Terbium', '铽', '158.93', 57, 'lanthanoid'],
      [66, 'Dy', 'Dysprosium', '镝', '162.50', 57, 'lanthanoid'],
      [67, 'Ho', 'Holmium', '钬', '164.93', 57, 'lanthanoid'],
      [68, 'Er', 'Erbium', '铒', '167.26', 57, 'lanthanoid'],
      [69, 'Tm', 'Thulium', '铥', '168.93', 57, 'lanthanoid'],
      [70, 'Yb', 'Ytterbium', '镱', '173.05', 57, 'lanthanoid'],
      [71, 'Lu', 'Lutetium', '镥', '174.97', 57, 'lanthanoid'],

      [90, 'Th', 'Thorium', '钍', '232.04', 89, 'actinoid'],
      [91, 'Pa', 'Protactinium', '镤', '231.04', 89, 'actinoid'],
      [92, 'U', 'Uranium', '铀', '238.03', 89, 'actinoid'],
      [93, 'Np', 'Neptunium', '镎', '237', 89, 'actinoid'],
      [94, 'Pu', 'Plutonium', '钚', '244', 89, 'actinoid'],
      [95, 'Am', 'Americium', '镅', '243', 89, 'actinoid'],
      [96, 'Cm', 'Curium', '锔', '247', 89, 'actinoid'],
      [97, 'Bk', 'Berkelium', '锫', '247', 89, 'actinoid'],
      [98, 'Cf', 'Californium', '锎', '251', 89, 'actinoid'],
      [99, 'Es', 'Einsteinium', '锿', '252', 89, 'actinoid'],
      [100, 'Fm', 'Fermium', '镄', '257', 89, 'actinoid'],
      [101, 'Md', 'Mendelevium', '钔', '258', 89, 'actinoid'],
      [102, 'No', 'Nobelium', '锘', '259', 89, 'actinoid'],
      [103, 'Lr', 'Lawrencium', '铹', '266', 89, 'actinoid'],
    ];

    var ELEMENT_BY_NAME = new Map();
    var SLOT_BY_Z = new Map();

    var ELEMENTS_90 = Object.freeze(
      RAW_SLOTS_90.map(function (r) {
        var item = Object.freeze({
          z: r[0],
          slotZ: r[0],
          symbol: r[1],
          name: r[2],
          zh: r[3],
          mass: r[4],
          row: r[5],
          col: r[6],
          group: r[7],
          numLabel: r[8] || String(r[0]),
        });
        SLOT_BY_Z.set(item.z, item);
        ELEMENT_BY_NAME.set(item.name.toLowerCase(), item);
        return item;
      })
    );

    for (var fi = 0; fi < RAW_FBLOCK_28.length; fi += 1) {
      var fr = RAW_FBLOCK_28[fi];
      var parentSlot = SLOT_BY_Z.get(fr[5]);
      var fItem = Object.freeze({
        z: fr[0],
        slotZ: fr[5],
        symbol: fr[1],
        name: fr[2],
        zh: fr[3],
        mass: fr[4],
        row: parentSlot ? parentSlot.row : 6,
        col: parentSlot ? parentSlot.col : 3,
        group: fr[6],
        numLabel: String(fr[0]),
      });
      ELEMENT_BY_NAME.set(fItem.name.toLowerCase(), fItem);
    }

    /* US/UK IUPAC spelling aliases */
    ELEMENT_BY_NAME.set('aluminum', SLOT_BY_Z.get(13));
    ELEMENT_BY_NAME.set('cesium', SLOT_BY_Z.get(55));
    ELEMENT_BY_NAME.set('sulphur', SLOT_BY_Z.get(16));

    var GROUP_META = {
      nonmetal: { en: 'Reactive Nonmetal', zh: '活泼非金属' },
      noble: { en: 'Noble Gas', zh: '稀有气体' },
      alkali: { en: 'Alkali Metal', zh: '碱金属' },
      alkaline: { en: 'Alkaline Earth Metal', zh: '碱土金属' },
      metalloid: { en: 'Metalloid', zh: '类金属' },
      halogen: { en: 'Halogen', zh: '卤素' },
      'post-transition': { en: 'Post-Transition Metal', zh: '后过渡金属' },
      transition: { en: 'Transition Metal', zh: '过渡金属' },
      lanthanoid: { en: 'Lanthanoid Series', zh: '镧系稀土' },
      actinoid: { en: 'Actinoid Series', zh: '锕系元素' },
    };

    var ELEMENT_LORE = {
      1: {
        en: 'Group 1 · Reactive Nonmetal · Agile High-Throughput Reasoning',
        zh: '第 1 族 · 活泼非金属 · 轻量疾速高吞吐推理核',
      },
      6: {
        en: 'Group 14 · Tetravalent Carbon Core · Flagship Deep Synthesis',
        zh: '第 14 族 · 四价碳基核心 · 旗舰深度推理与工程主力',
      },
      10: {
        en: 'Group 18 · Noble Gas · Luminous Low-Latency Multimodal',
        zh: '第 18 族 · 稀有气体 · 灵动多模态与敏捷响应核',
      },
      18: {
        en: 'Group 18 · Noble Gas · Balanced Precision & Visual Craft',
        zh: '第 18 族 · 稀有气体 · 视觉审美与均衡分析核',
      },
    };

    /* V14.1 Theme-Native Frosted Hairline Micro-Badge Palette Resolver */
    var MINI_BADGE_SOUL_HEX = {
      1: { dark: '#56C8FA', light: '#0284C7' },
      6: { dark: '#669DF6', light: '#2563EB' },
      10: { dark: '#F4845F', light: '#D95D24' },
      18: { dark: '#9B7DF7', light: '#6D28D9' },
      orchestrator: { dark: '#E2B354', light: '#A16207' },
      flash: { dark: '#38BDF8', light: '#0284C7' },
      claude: { dark: '#DF8458', light: '#B45309' },
      gpt: { dark: '#4FD1C5', light: '#0F766E' },
      fallback: { dark: '#8EA4C8', light: '#475569' },
    };

    var MINI_BADGE_THEME_SUBSTRATES = {
      'obsidian-dark': {
        surfaceRgb: [255, 255, 255],
        surfaceBaseAlpha: 0.038,
        tintSurfaceAlpha: 0.092,
        borderRgb: [218, 228, 255],
        borderAlpha: 0.19,
        fgRgb: [204, 212, 226],
        fgTintMix: 0.36,
        borderTintMix: 0.28,
      },
      'warm-dark': {
        surfaceRgb: [245, 236, 222],
        surfaceBaseAlpha: 0.046,
        tintSurfaceAlpha: 0.096,
        borderRgb: [232, 206, 174],
        borderAlpha: 0.22,
        fgRgb: [218, 208, 194],
        fgTintMix: 0.38,
        borderTintMix: 0.30,
      },
      'crystal-light': {
        surfaceRgb: [15, 23, 42],
        surfaceBaseAlpha: 0.056,
        tintSurfaceAlpha: 0.096,
        borderRgb: [15, 23, 42],
        borderAlpha: 0.22,
        fgRgb: [26, 36, 52],
        fgTintMix: 0.24,
        borderTintMix: 0.26,
      },
      'alabaster-light': {
        surfaceRgb: [42, 32, 20],
        surfaceBaseAlpha: 0.062,
        tintSurfaceAlpha: 0.096,
        borderRgb: [42, 32, 20],
        borderAlpha: 0.23,
        fgRgb: [36, 30, 24],
        fgTintMix: 0.22,
        borderTintMix: 0.24,
      },
    };

    /* V14 Google DeepMind Official Spectrum HUD Gem Tokens */
    var CORE_FOUR_ELEMENTS = [
      { slotZ: 1, symbol: 'H' },
      { slotZ: 6, symbol: 'C' },
      { slotZ: 10, symbol: 'Ne' },
      { slotZ: 18, symbol: 'Ar' },
    ];

    var HUD_GEM_STYLES = {
      1: {
        dot: 'linear-gradient(135deg, #38BDF8 0%, #7DD3FC 55%, #BAE6FD 100%)',
        glow: 'rgba(56, 189, 248, 0.36)',
        ring: 'rgba(56, 189, 248, 0.24)',
        haloDark: 'rgba(56, 189, 248, 0.032)',
        haloLight: 'rgba(2, 132, 199, 0.024)',
      },
      6: {
        dot: 'linear-gradient(135deg, #2563EB 0%, #3B82F6 50%, #67E8F9 100%)',
        glow: 'rgba(59, 130, 246, 0.38)',
        ring: 'rgba(96, 165, 250, 0.26)',
        haloDark: 'rgba(59, 130, 246, 0.034)',
        haloLight: 'rgba(29, 78, 216, 0.024)',
      },
      10: {
        dot: 'linear-gradient(135deg, #FF5A3D 0%, #FF6B4A 52%, #FFB347 100%)',
        glow: 'rgba(255, 107, 74, 0.38)',
        ring: 'rgba(255, 138, 92, 0.25)',
        haloDark: 'rgba(255, 107, 74, 0.032)',
        haloLight: 'rgba(234, 88, 12, 0.024)',
      },
      18: {
        dot: 'linear-gradient(135deg, #3B66F5 0%, #7C5CFF 55%, #A78BFA 100%)',
        glow: 'rgba(124, 92, 255, 0.38)',
        ring: 'rgba(139, 92, 246, 0.26)',
        haloDark: 'rgba(124, 92, 255, 0.034)',
        haloLight: 'rgba(109, 40, 217, 0.024)',
      },
      fallback: {
        dot: 'linear-gradient(180deg, #60A5FA 0%, #3B82F6 100%)',
        glow: 'rgba(59, 130, 246, 0.34)',
        ring: 'rgba(96, 165, 250, 0.22)',
        haloDark: 'rgba(59, 130, 246, 0.048)',
        haloLight: 'rgba(37, 99, 235, 0.036)',
      },
      monoDark: {
        dot: 'linear-gradient(180deg, #F1F5F9 0%, #CBD5E1 100%)',
        glow: 'rgba(226, 232, 240, 0.36)',
        ring: 'rgba(226, 232, 240, 0.22)',
        haloDark: 'rgba(208, 216, 230, 0.058)',
        haloLight: 'rgba(100, 116, 139, 0.045)',
      },
      monoLight: {
        dot: 'linear-gradient(180deg, #334155 0%, #0F172A 100%)',
        glow: 'rgba(51, 65, 85, 0.26)',
        ring: 'rgba(51, 65, 85, 0.18)',
        haloDark: 'rgba(208, 216, 230, 0.058)',
        haloLight: 'rgba(71, 85, 105, 0.045)',
      },
    };

    function parseHexRgb255(hex, fallbackRgb) {
      var s = String(hex || '').trim();
      if (s.charAt(0) === '#') s = s.slice(1);
      if (s.length === 3) {
        s = s.charAt(0) + s.charAt(0) + s.charAt(1) + s.charAt(1) + s.charAt(2) + s.charAt(2);
      }
      if (s.length !== 6) return fallbackRgb || [136, 150, 172];
      var num = parseInt(s, 16);
      if (isNaN(num)) return fallbackRgb || [136, 150, 172];
      return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
    }

    function lerpRgb255(a, b, t) {
      var k = t < 0 ? 0 : t > 1 ? 1 : t;
      return [
        Math.round(a[0] + (b[0] - a[0]) * k),
        Math.round(a[1] + (b[1] - a[1]) * k),
        Math.round(a[2] + (b[2] - a[2]) * k),
      ];
    }

    function rgba255Css(rgb, alpha) {
      var a = Math.round((alpha < 0 ? 0 : alpha > 1 ? 1 : alpha) * 1000) / 1000;
      return 'rgba(' + rgb[0] + ', ' + rgb[1] + ', ' + rgb[2] + ', ' + a + ')';
    }

    function rgb255ToHex(rgb) {
      var to2 = function (v) {
        var h = Math.max(0, Math.min(255, Math.round(v))).toString(16);
        return h.length === 1 ? '0' + h : h;
      };
      return ('#' + to2(rgb[0]) + to2(rgb[1]) + to2(rgb[2])).toUpperCase();
    }

    function resolveThemeNativeMiniBadgeColors(tintKey, profile) {
      var prof = profile || { id: 'obsidian-dark', isLight: false, isMono: false, accent: 'follow', primaryHex: '#669DF6' };
      var kitId = MINI_BADGE_THEME_SUBSTRATES[prof.id] ? prof.id : prof.isLight ? 'crystal-light' : 'obsidian-dark';
      var sub = MINI_BADGE_THEME_SUBSTRATES[kitId];

      if (prof.isMono || prof.accent === 'mono') {
        var monoFg = prof.isLight
          ? kitId === 'alabaster-light'
            ? '#3B352E'
            : '#334155'
          : kitId === 'warm-dark'
          ? '#CFC8BE'
          : '#C8CDD6';
        return {
          bg: rgba255Css(sub.surfaceRgb, sub.surfaceBaseAlpha + 0.012),
          fg: monoFg,
          border: rgba255Css(sub.borderRgb, sub.borderAlpha),
        };
      }

      var soulEntry = MINI_BADGE_SOUL_HEX[tintKey] || MINI_BADGE_SOUL_HEX.fallback;
      var soulHex = prof.isLight ? soulEntry.light : soulEntry.dark;
      var soulRgb = parseHexRgb255(soulHex, sub.fgRgb);

      var harmonyRgb = soulRgb;
      var acc = String(prof.accent || 'follow');
      if (acc === 'cobalt' || acc === 'iris' || acc === 'amber') {
        var hostAccRgb = parseHexRgb255(prof.primaryHex, soulRgb);
        harmonyRgb = lerpRgb255(hostAccRgb, soulRgb, 0.25);
      } else if (kitId === 'warm-dark' && tintKey === 'orchestrator') {
        harmonyRgb = [228, 182, 98];
      }

      var bgRgb = lerpRgb255(sub.surfaceRgb, harmonyRgb, 0.62);
      var borderRgb = lerpRgb255(sub.borderRgb, harmonyRgb, sub.borderTintMix);
      var fgRgb = lerpRgb255(sub.fgRgb, harmonyRgb, sub.fgTintMix);

      return {
        bg: rgba255Css(bgRgb, sub.tintSurfaceAlpha),
        fg: rgb255ToHex(fgRgb),
        border: rgba255Css(borderRgb, sub.borderAlpha + 0.04),
      };
    }

    /* V12 2026Q4 Authoritative Public Raw Benchmark Registry */
    var BENCHMARK_SOURCE_CITATION =
      'Artificial Analysis v5.0 · Terminal-Bench · SWE-bench (2026Q4)';
    var BENCHMARK_SOURCE_CITATION_SHORT = 'AA v5 · TermBench · SWE-bench (2026Q4)';

    var RADAR_AXES = [
      { key: 'aa', zh: 'AA v5', en: 'AA v5', vertexZh: '推理', vertexEn: 'AA' },
      { key: 'term', zh: 'TermBench', en: 'TermBench', vertexZh: '终端', vertexEn: 'Term' },
      { key: 'sci', zh: 'HLE-D', en: 'HLE-D', vertexZh: '科学', vertexEn: 'Sci' },
      { key: 'swe', zh: 'SWE-Pro', en: 'SWE-Pro', vertexZh: '工程', vertexEn: 'SWE' },
      { key: 'tps', zh: '吞吐极速', en: 'Velocity', vertexZh: '极速', vertexEn: 'Speed' },
    ];

    var BENCHMARK_CEILINGS = {
      aa: 100,
      term: 100,
      'HLE-D': 100,
      'GPQA-D': 100,
      'MMLU-Pro': 100,
      'SWE-Pro': 100,
      AutoBench: 100,
      DeepSWE: 100,
      'SWE-Ver': 100,
      'SWE-Verified': 100,
      tps: 400,
    };

    var BENCHMARK_2026Q4_DB = {
      10: {
        sciName: 'HLE-D',
        sweName: 'AutoBench',
        tps: 110,
        tiers: {
          low: { aa: 47, term: 32.8, sci: 54.2, swe: 64.0 },
          medium: { aa: 55, term: 51.4, sci: 62.8, swe: 72.5 },
          high: { aa: 60, term: 61.9, sci: 68.4, swe: 77.8 },
          xhigh: { aa: 61, term: 63.6, sci: 71.3, swe: 79.3 },
        },
        defaultTier: 'high',
      },
      6: {
        sciName: 'HLE-D',
        sweName: 'SWE-Pro',
        tps: 68,
        tiers: {
          low: { aa: 50, term: 46.5, sci: 55.0, swe: 74.0 },
          medium: { aa: 56, term: 58.4, sci: 63.5, swe: 80.6 },
          high: { aa: 60, term: 65.2, sci: 69.1, swe: 84.5 },
        },
        defaultTier: 'high',
      },
      18: {
        sciName: 'HLE-D',
        sweName: 'AutoBench',
        tps: 82,
        tiers: {
          low: { aa: 42, term: 44.0, sci: 45.0, swe: 62.0 },
          medium: { aa: 47, term: 57.1, sci: 52.4, swe: 69.5 },
          high: { aa: 50, term: 55.1, sci: 56.7, swe: 72.4 },
        },
        defaultTier: 'high',
      },
      1: {
        sciName: 'HLE-D',
        sweName: 'AutoBench',
        tps: 168,
        tiers: {
          low: { aa: 38, term: 18.5, sci: 32.2, swe: 60.5 },
          medium: { aa: 46, term: 41.2, sci: 46.5, swe: 68.4 },
          high: { aa: 51, term: 54.0, sci: 54.6, swe: 74.2 },
          xhigh: { aa: 54, term: 53.5, sci: 58.8, swe: 76.1 },
        },
        defaultTier: 'high',
      },
      'claude-opus': {
        sciName: 'GPQA-D',
        sweName: 'SWE-Pro',
        tps: 54,
        tiers: {
          low: { aa: 51, term: 54.2, sci: 86.4, swe: 79.5 },
          medium: { aa: 57, term: 61.5, sci: 91.2, swe: 85.8 },
          high: { aa: 60, term: 66.4, sci: 93.9, swe: 89.9 },
        },
        defaultTier: 'high',
      },
      'claude-sonnet': {
        sciName: 'GPQA-D',
        sweName: 'SWE-Pro',
        tps: 88,
        tiers: {
          low: { aa: 46, term: 53.0, sci: 85.0, swe: 71.2 },
          medium: { aa: 52, term: 61.8, sci: 90.8, swe: 77.4 },
          high: { aa: 56, term: 70.6, sci: 94.1, swe: 81.3 },
        },
        defaultTier: 'high',
      },
      flash: {
        sciName: 'GPQA-D',
        sweName: 'DeepSWE',
        tps: 215,
        tiers: {
          low: { aa: 25, term: 14.2, sci: 84.0, swe: 64.2 },
          medium: { aa: 28, term: 17.5, sci: 91.5, swe: 70.1 },
          high: { aa: 31, term: 19.7, sci: 95.3, swe: 73.7 },
        },
        defaultTier: 'high',
      },
      'gpt-oss': {
        sciName: 'MMLU-Pro',
        sweName: 'SWE-Verified',
        tps: 135,
        tiers: {
          low: { aa: 44, term: 31.4, sci: 79.2, swe: 33.6 },
          medium: { aa: 44, term: 31.4, sci: 79.2, swe: 33.6 },
          high: { aa: 44, term: 31.4, sci: 79.2, swe: 33.6 },
        },
        defaultTier: 'high',
      },
    };

    var ELEMENT_SPEC_PROFILES = {
      1: {
        badge: '01 · H · AGILE',
        accentHex: '#38BDF8',
        secondaryHex: '#7DD3FC',
        accentHexLight: '#0284C7',
        secondaryHexLight: '#0EA5E9',
        glowRgba: 'rgba(56, 189, 248, 0.28)',
        roleTag: 'HIGH-THROUGHPUT',
        switchSpecZh: 'Sky-Ice Crystal',
        switchSpecEn: 'Sky-Ice Crystal',
        taglineZh: '第 1 族活泼非金属 · 轻量疾速高吞吐并发推理核',
        taglineEn: 'Group 1 Reactive Nonmetal · Agile High-Throughput Reasoning Core',
        scenesZh: ['高频检索', '512K 并发', '极速响应'],
        scenesEn: ['Fast Search', '512K Shard', 'Low Latency'],
      },
      6: {
        badge: '06 · C · PRO',
        accentHex: '#3B82F6',
        secondaryHex: '#67E8F9',
        accentHexLight: '#1D4ED8',
        secondaryHexLight: '#0284C7',
        glowRgba: 'rgba(59, 130, 246, 0.30)',
        roleTag: 'COBALT · PRO',
        switchSpecZh: 'Cobalt Diamond Prism',
        switchSpecEn: 'Cobalt Diamond Prism',
        taglineZh: '第 14 族四价碳基核心 · 旗舰深度合成与复杂工程主力',
        taglineEn: 'Group 14 Tetravalent Carbon · Flagship Deep Synthesis & Architecture',
        scenesZh: ['深度推理', '512K 架构', '代码主力'],
        scenesEn: ['Reasoning', '512K Arch', 'Code Pro'],
      },
      10: {
        badge: '10 · Ne · FLOW',
        accentHex: '#FF6B4A',
        secondaryHex: '#FFB347',
        accentHexLight: '#EA580C',
        secondaryHexLight: '#D97706',
        glowRgba: 'rgba(255, 107, 74, 0.30)',
        roleTag: 'CORAL · FLOW',
        switchSpecZh: 'Coral-Gold Glass',
        switchSpecEn: 'Coral-Gold Glass',
        taglineZh: '第 18 族稀有气体 · 低延迟流式多模态与创意前端核',
        taglineEn: 'Group 18 Noble Gas · Luminous Low-Latency Multimodal & UI Craft',
        scenesZh: ['流式编码', '多模态', '创意前沿'],
        scenesEn: ['Live Coding', 'Multimodal', 'UI Craft'],
      },
      18: {
        badge: '18 · Ar · PRO',
        accentHex: '#7C5CFF',
        secondaryHex: '#4F7CFF',
        accentHexLight: '#6D28D9',
        secondaryHexLight: '#4338CA',
        glowRgba: 'rgba(124, 92, 255, 0.30)',
        roleTag: 'INDIGO · QA',
        switchSpecZh: 'Indigo-Violet Prism',
        switchSpecEn: 'Indigo-Violet Prism',
        taglineZh: '第 18 族稀有气体 · 高审美多模态视觉质检与精密分析核',
        taglineEn: 'Group 18 Noble Gas · High-Aesthetic Visual QA & Balanced Precision',
        scenesZh: ['视觉验证', '512K 审校', '精密分析'],
        scenesEn: ['Visual QA', '512K Audit', 'Precision'],
      },
      fallback: {
        badge: 'ELEMENT · SERIES',
        accentHex: '#60A5FA',
        secondaryHex: '#38BDF8',
        accentHexLight: '#2563EB',
        secondaryHexLight: '#0284C7',
        glowRgba: 'rgba(96, 165, 250, 0.24)',
        roleTag: 'ELEMENT CORE',
        switchSpecZh: 'Crystal Prism',
        switchSpecEn: 'Crystal Prism',
        taglineZh: 'Google 化学元素直连序列 · 原生全模态长窗口推理核',
        taglineEn: 'Google Chemical Element Series · Native Long-Context Core',
        scenesZh: ['通用推理', '代码生成', '512K 长窗'],
        scenesEn: ['Reasoning', 'Code Gen', '512K Ctx'],
      },
    };

    var AUX_MODEL_PRESETS = [
      {
        id: 'orchestrator',
        oledAuxId: 'orchestrator',
        miniKey: 'orchestrator',
        shortLabel: 'Orch',
        subLabel: 'LATCH',
        badgeCode: 'ORCH',
        defaultTitle: 'Orchestrator',
        roleTag: 'DUAL-CORE',
        accentHex: '#8B5CF6',
        accentHexLight: '#6D28D9',
        secondaryHex: '#F5B942',
        secondaryHexLight: '#B45309',
        glowRgba: 'rgba(139, 92, 246, 0.32)',
        taglineZh: '星云紫蓝×暖金自锁编排开关 · 主核规划 + 1H 高速卸载',
        taglineEn: 'Dual-Core Latching Mode Switch · Planner Core + 1H Offload',
        scenesZh: ['双核规划', '512K 路由', '1H 卸载'],
        scenesEn: ['Dual-Core', '512K Route', '1H Offload'],
      },
      {
        id: 'flash',
        oledAuxId: 'flash',
        miniKey: 'flash',
        shortLabel: 'Flash',
        subLabel: '3.8',
        badgeCode: 'FLASH',
        defaultTitle: 'Gemini 3.8 Flash',
        roleTag: 'HYPER-SPEED',
        accentHex: '#00D4FF',
        accentHexLight: '#0284C7',
        secondaryHex: '#67E8F9',
        secondaryHexLight: '#0891B2',
        glowRgba: 'rgba(0, 212, 255, 0.30)',
        taglineZh: '电光青蓝亚秒级响应核 · 大规模代码检索与高频分诊主力',
        taglineEn: 'Sub-Second Hyper-Velocity Core · Rapid Codebase Exploration & Triage',
        scenesZh: ['极速检索', '日志初筛', '高频并发'],
        scenesEn: ['Fast Search', 'Log Triage', 'Parallel'],
      },
      {
        id: 'claude-opus',
        oledAuxId: 'claude',
        miniKey: 'claude',
        shortLabel: 'Opus',
        subLabel: '5.5',
        badgeCode: 'OPUS',
        defaultTitle: 'Claude Opus 5.5',
        roleTag: 'ARTISAN · DEEP',
        accentHex: '#E07A48',
        accentHexLight: '#C25929',
        secondaryHex: '#F4A261',
        secondaryHexLight: '#B45309',
        glowRgba: 'rgba(224, 122, 72, 0.30)',
        taglineZh: 'Anthropic 陶土暖珀晶体旗舰 · 深度审计、架构思辨与细腻写作核',
        taglineEn: 'Flagship Artisan Reasoning · Deep Code Audit & Nuanced Synthesis',
        scenesZh: ['深度审阅', '架构思辨', '精工写作'],
        scenesEn: ['Code Audit', 'Deep Debug', 'Craft'],
      },
      {
        id: 'claude-sonnet',
        oledAuxId: 'claude',
        miniKey: 'claude',
        shortLabel: 'Sonnet',
        subLabel: '5.5',
        badgeCode: 'SONNET',
        defaultTitle: 'Claude Sonnet 5.5',
        roleTag: 'AGILE · CODE',
        accentHex: '#D97742',
        accentHexLight: '#B45309',
        secondaryHex: '#F4B26A',
        secondaryHexLight: '#D97706',
        glowRgba: 'rgba(217, 119, 66, 0.28)',
        taglineZh: 'Anthropic 陶土暖珀敏捷编码核 · 高频组件构建与工具链协同主力',
        taglineEn: 'Balanced Agile Coding Core · Rapid UI Engineering & Tool Use',
        scenesZh: ['前端精工', '敏捷迭代', '工具协同'],
        scenesEn: ['UI Craft', 'Fast Build', 'Tool Use'],
      },
      {
        id: 'gpt-oss',
        oledAuxId: 'gpt',
        miniKey: 'gpt',
        shortLabel: 'GPT',
        subLabel: '120B',
        badgeCode: 'GPT',
        defaultTitle: 'GPT-OSS 120B',
        roleTag: 'MATRIX · LOGIC',
        accentHex: '#4FD1C5',
        accentHexLight: '#0F766E',
        secondaryHex: '#99F6E4',
        secondaryHexLight: '#0D9488',
        glowRgba: 'rgba(79, 209, 197, 0.28)',
        taglineZh: '极简银青冰薄荷逻辑矩阵推理核 · 后端逻辑交叉核验与开放权重推理',
        taglineEn: 'Silver-Mint Logic Matrix · Backend Cross-Verification & Math',
        scenesZh: ['算法推演', '后端盲审', '逻辑校验'],
        scenesEn: ['Algorithms', 'Audit', 'Logic Check'],
      },
      {
        id: 'blind',
        oledAuxId: 'standby',
        miniKey: 'fallback',
        shortLabel: '—',
        subLabel: 'LOCK',
        badgeCode: 'AUX',
        defaultTitle: 'Aux Macro Slot — Reserved',
        roleTag: 'RESERVED',
        accentHex: '#64748B',
        accentHexLight: '#475569',
        secondaryHex: '#475569',
        secondaryHexLight: '#334155',
        glowRgba: 'rgba(100, 116, 139, 0.22)',
        taglineZh: '定制 CNC 铝合金 2x3 副盘预留扩展键位 · 暗刻阳极盲键',
        taglineEn: 'Bespoke CNC 2x3 Aux Macro Pad Reserved Anodized Blind Keycap',
        scenesZh: ['扩展席位', '暗刻盲键', 'AUX-06'],
        scenesEn: ['Reserved', 'Blind Cap', 'AUX-06'],
      },
    ];

    function normalizeZhEffortWord(word) {
      if (word === '超高' || word === '极高' || word === '超深') return 'xhigh';
      if (word === '中' || word === '中等' || word === '中思考') return 'medium';
      if (word === '低' || word === '低思考' || word === '极低' || word === '最低') return 'low';
      if (word === '关闭') return 'off';
      if (word === '自动') return 'auto';
      return 'high';
    }

    function normalizeEnEffortWord(word) {
      var w = String(word || '').toLowerCase();
      if (w === 'extra') return 'xhigh';
      if (w === 'med') return 'medium';
      return w;
    }

    function stripEffortSuffixFromLabel(rawLabel) {
      var clean = String(rawLabel || '').replace(/^.*?\bcurrent:\s*/i, '').trim();
      var effort = '';
      var hasExplicit = false;
      var zhM = ZH_EFFORT_PAREN_RE.exec(clean);
      if (zhM) {
        effort = normalizeZhEffortWord(zhM[1]);
        clean = clean.slice(0, zhM.index).trim();
        hasExplicit = true;
      } else {
        var enM = EN_EFFORT_PAREN_RE.exec(clean);
        if (enM) {
          effort = normalizeEnEffortWord(enM[1]);
          clean = clean.slice(0, enM.index).trim();
          hasExplicit = true;
        } else {
          var bareEn = /\s+(extra\s+high|xhigh|extra|max|high|medium|med|low|minimal|off)\s*$/i.exec(clean);
          if (bareEn) {
            var rEff = bareEn[1].toLowerCase().replace(/\s+/g, '');
            effort = rEff === 'extrahigh' ? 'xhigh' : normalizeEnEffortWord(rEff);
            clean = clean.slice(0, bareEn.index).trim();
            hasExplicit = true;
          } else {
            var bareZh =
              /\s+(超高思考|极高思考|高思考|中等思考|中思考|低思考|极低思考|最低思考|超深|超高|极高|中等|极低|最低|自动|关闭|高|中|低)\s*$/.exec(
                clean
              );
            if (bareZh) {
              effort = normalizeZhEffortWord(bareZh[1].replace(/思考$/, ''));
              clean = clean.slice(0, bareZh.index).trim();
              hasExplicit = true;
            }
          }
        }
      }
      return {
        baseName: clean || String(rawLabel || '').trim(),
        effort: effort && EFFORT_LABELS[effort] ? effort : '',
        hasExplicitEffort: hasExplicit,
      };
    }

    /**
     * Parse a raw model label or host modelOption into a Google chemical element descriptor.
     * Strictly rejects Orchestrator, Flash, Claude, GPT/OpenAI/Codex, and custom models.
     */
    function parseElementModelLabel(input) {
      if (!input) return null;
      var rawLabel = '';
      var modelId = '';
      if (typeof input === 'string') {
        rawLabel = input.trim();
      } else if (typeof input === 'object') {
        if (input.isCustom) return null;
        rawLabel = typeof input.label === 'string' ? input.label.trim() : '';
        modelId = typeof input.modelId === 'string' ? input.modelId.trim() : '';
      }
      if (!rawLabel) return null;
      if (EXCLUDED_FAMILY_RE.test(rawLabel) || (modelId && EXCLUDED_FAMILY_RE.test(modelId))) {
        return null;
      }

      var baseName = rawLabel.replace(/^.*?\bcurrent:\s*/i, '').trim();
      var effort = '';
      var hasExplicitEffort = false;

      var zhMatch = ZH_EFFORT_PAREN_RE.exec(baseName);
      if (zhMatch) {
        effort = normalizeZhEffortWord(zhMatch[1]);
        baseName = baseName.slice(0, zhMatch.index).trim();
        hasExplicitEffort = true;
      } else {
        var enMatch = EN_EFFORT_PAREN_RE.exec(baseName);
        if (enMatch) {
          effort = normalizeEnEffortWord(enMatch[1]);
          baseName = baseName.slice(0, enMatch.index).trim();
          hasExplicitEffort = true;
        } else {
          var bareEnMatch = /\s+(extra\s+high|xhigh|extra|max|high|medium|med|low|minimal|off)\s*$/i.exec(baseName);
          if (bareEnMatch) {
            var rawEff = bareEnMatch[1].toLowerCase().replace(/\s+/g, '');
            effort = rawEff === 'extrahigh' ? 'xhigh' : normalizeEnEffortWord(rawEff);
            baseName = baseName.slice(0, bareEnMatch.index).trim();
            hasExplicitEffort = true;
          } else {
            var bareZhMatch =
              /\s+(超高思考|极高思考|高思考|中等思考|中思考|低思考|极低思考|最低思考|超深|超高|极高|中等|极低|最低|自动|关闭|高|中|低)\s*$/.exec(
                baseName
              );
            if (bareZhMatch) {
              effort = normalizeZhEffortWord(bareZhMatch[1].replace(/思考$/, ''));
              baseName = baseName.slice(0, bareZhMatch.index).trim();
              hasExplicitEffort = true;
            }
          }
        }
      }

      if (!baseName || EXCLUDED_FAMILY_RE.test(baseName)) return null;
      if (effort === 'auto') return null;

      var tokens = baseName
        .replace(/[^a-zA-Z0-9.]+/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      if (!tokens.length) return null;

      var hasGooglePrefix = /\b(?:gemini|google)\b/i.test(baseName) || /\bgemini\b/i.test(modelId);
      if (!hasGooglePrefix) return null;

      var matchedElement = null;
      for (var i = tokens.length - 1; i >= 0; i -= 1) {
        var tok = tokens[i].toLowerCase();
        if (tok === 'gemini' || tok === 'google') continue;
        if (/^\d+(?:\.\d+)*$/.test(tok)) continue;
        var elHit = ELEMENT_BY_NAME.get(tok);
        if (elHit) {
          matchedElement = elHit;
          break;
        }
        return null;
      }

      if (!matchedElement) return null;
      var normEffort = effort && EFFORT_LABELS[effort] ? effort : 'medium';
      var slot = SLOT_BY_Z.get(matchedElement.slotZ) || matchedElement;

      return {
        z: matchedElement.z,
        slotZ: slot.z,
        symbol: slot.symbol,
        elementSymbol: matchedElement.symbol,
        name: slot.name,
        elementName: matchedElement.name,
        zh: slot.zh,
        mass: slot.mass,
        group: slot.group,
        baseName: baseName,
        effort: normEffort,
        effortLabel: hasExplicitEffort ? EFFORT_LABELS[normEffort] || normEffort : 'Default',
        hasExplicitEffort: hasExplicitEffort,
      };
    }

    /**
     * Match & aggregate Google chemical element models from host `modelOptions` (and optional `effortIndex`).
     * Returns a sorted Array of matched element entries, augmented with `.byZ` and `.bySymbol` Maps.
     */
    function matchGoogleElementModels(modelOptions, effortIndex) {
      var grouped = new Map();

      function ingestOption(opt, forcedEffort) {
        if (!opt) return;
        var optionObj = typeof opt === 'string' ? { label: opt, value: opt } : opt;
        if (typeof optionObj.label !== 'string') return;
        var parsed = parseElementModelLabel(optionObj);
        if (!parsed) return;

        var eff = forcedEffort ? normalizeEnEffortWord(forcedEffort) : parsed.effort;
        if (!EFFORT_LABELS[eff]) eff = parsed.effort || 'medium';

        var entry = grouped.get(parsed.slotZ);
        if (!entry) {
          var slot = SLOT_BY_Z.get(parsed.slotZ);
          entry = {
            z: parsed.z,
            slotZ: parsed.slotZ,
            symbol: slot ? slot.symbol : parsed.symbol,
            name: parsed.elementName || parsed.name,
            zh: slot ? slot.zh : parsed.zh,
            mass: slot ? slot.mass : parsed.mass,
            group: slot ? slot.group : parsed.group,
            baseName: parsed.baseName,
            _byEffort: new Map(),
          };
          grouped.set(parsed.slotZ, entry);
        }
        if (!entry._byEffort.has(eff)) {
          entry._byEffort.set(eff, {
            effort: eff,
            label: parsed.hasExplicitEffort || forcedEffort ? EFFORT_LABELS[eff] || eff : 'Default',
            option: optionObj,
            modelOption: optionObj,
          });
        }
      }

      if (Array.isArray(modelOptions)) {
        for (var i = 0; i < modelOptions.length; i += 1) {
          ingestOption(modelOptions[i], '');
        }
      }

      if (effortIndex instanceof Map) {
        effortIndex.forEach(function (innerMap) {
          if (!(innerMap instanceof Map)) return;
          innerMap.forEach(function (opt, effKey) {
            ingestOption(opt, String(effKey || ''));
          });
        });
      }

      var result = [];
      var byZ = new Map();
      var bySymbol = new Map();

      var sortedKeys = Array.from(grouped.keys()).sort(function (a, b) {
        return a - b;
      });

      for (var k = 0; k < sortedKeys.length; k += 1) {
        var slotZ = sortedKeys[k];
        var raw = grouped.get(slotZ);
        var levels = [];
        for (var ei = 0; ei < EFFORT_ORDER.length; ei += 1) {
          var ek = EFFORT_ORDER[ei];
          if (raw._byEffort.has(ek)) {
            levels.push(raw._byEffort.get(ek));
          }
        }
        var finalized = {
          z: raw.z,
          slotZ: raw.slotZ,
          symbol: raw.symbol,
          name: raw.name,
          elementName: raw.name,
          zh: raw.zh,
          mass: raw.mass,
          group: raw.group,
          baseName: raw.baseName,
          levels: levels,
          defaultOption: levels.length ? levels[levels.length - 1].option : null,
        };
        result.push(finalized);
        byZ.set(slotZ, finalized);
        bySymbol.set(finalized.symbol, finalized);
      }

      Object.defineProperty(result, 'byZ', { value: byZ, enumerable: false });
      Object.defineProperty(result, 'bySymbol', { value: bySymbol, enumerable: false });
      return result;
    }

    /**
     * Resolve 2026Q4 public benchmark metrics for a known model key.
     * Unknown / unbenchmarked models strictly return `{ isKnownBenchmark: false, scores: null }`
     * and NEVER fall back to Carbon (6) or GPT-OSS scores.
     */
    function resolveBenchmarkMetrics(benchKey, effortCode, zh, isAvailable) {
      var useZh = Boolean(zh);
      var normEff = String(effortCode || '').toLowerCase();

      if (isAvailable === false) {
        return {
          isKnownBenchmark: false,
          scores: null,
          ratios: null,
          rawValues: null,
          rows: [],
          compactText: useZh ? '未开放席位' : 'Locked Slot',
          effort: normEff,
          isAvailable: false,
        };
      }

      var hasRecord =
        benchKey !== undefined &&
        benchKey !== null &&
        Object.prototype.hasOwnProperty.call(BENCHMARK_2026Q4_DB, benchKey);
      var rec = hasRecord ? BENCHMARK_2026Q4_DB[benchKey] : null;
      if (!rec) {
        return {
          isKnownBenchmark: false,
          scores: null,
          ratios: null,
          rawValues: null,
          rows: [],
          compactText: useZh ? '暂无权威跑分数据' : 'No Benchmark Data',
          effort: normEff,
          isAvailable: true,
        };
      }

      if (normEff === 'max' || normEff === 'extra') normEff = 'xhigh';
      if (normEff === 'minimal' || normEff === 'off') normEff = 'low';
      var tier =
        rec.tiers[normEff] ||
        (normEff === 'xhigh' && rec.tiers.high) ||
        rec.tiers[rec.defaultTier] ||
        rec.tiers.high ||
        rec.tiers.medium;

      var sciCeil = BENCHMARK_CEILINGS[rec.sciName] || 100;
      var sweCeil = BENCHMARK_CEILINGS[rec.sweName] || 100;
      var r0 = Math.max(0.06, Math.min(1.0, tier.aa / BENCHMARK_CEILINGS.aa));
      var r1 = Math.max(0.06, Math.min(1.0, tier.term / BENCHMARK_CEILINGS.term));
      var r2 = Math.max(0.06, Math.min(1.0, tier.sci / sciCeil));
      var r3 = Math.max(0.06, Math.min(1.0, tier.swe / sweCeil));
      var r4 = Math.max(0.06, Math.min(1.0, rec.tps / BENCHMARK_CEILINGS.tps));

      var sweDisplayLbl = rec.sweName === 'SWE-Verified' ? 'SWE-Ver' : rec.sweName;
      var aaStr = String(tier.aa);
      var termStr = tier.term.toFixed(1) + '%';
      var sciStr = tier.sci.toFixed(1) + '%';
      var sweStr = tier.swe.toFixed(1) + '%';
      var tpsStr = rec.tps + ' tok/s';
      var scoresArr = [r0, r1, r2, r3, r4];

      return {
        isKnownBenchmark: true,
        scores: scoresArr,
        ratios: scoresArr.slice(),
        rawValues: [tier.aa, tier.term, tier.sci, tier.swe, rec.tps],
        rows: [
          { label: 'AA v5', valText: aaStr, fillPct: Math.round(r0 * 100), raw: tier.aa, unit: 'int' },
          { label: 'TermBench', valText: termStr, fillPct: Math.round(r1 * 100), raw: tier.term, unit: 'pct' },
          { label: rec.sciName, valText: sciStr, fillPct: Math.round(r2 * 100), raw: tier.sci, unit: 'pct' },
          { label: sweDisplayLbl, valText: sweStr, fillPct: Math.round(r3 * 100), raw: tier.swe, unit: 'pct' },
          { label: useZh ? '吞吐速率' : 'Velocity', valText: tpsStr, fillPct: Math.round(r4 * 100), raw: rec.tps, unit: 'tps' },
        ],
        compactText: 'AA ' + aaStr + ' · Term ' + termStr + ' · ' + tpsStr,
        effort: normEff || rec.defaultTier,
        isAvailable: true,
      };
    }

    function readNativeOptionDescription(optionObj) {
      if (!optionObj || typeof optionObj !== 'object') return '';
      var cand =
        typeof optionObj.description === 'string'
          ? optionObj.description
          : typeof optionObj.subtitle === 'string'
          ? optionObj.subtitle
          : typeof optionObj.detail === 'string'
          ? optionObj.detail
          : '';
      return cand.trim();
    }

    function buildNeutralAuxPreset(id, baseName, shortLabel, subLabel, badgeCode, nativeDesc, styleHint) {
      var title = baseName || shortLabel || 'Native Model';
      var desc = nativeDesc ? String(nativeDesc).trim() : '';
      var isClaudeFamily = styleHint === 'claude';
      return {
        id: id,
        oledAuxId: isClaudeFamily ? 'claude' : 'standby',
        miniKey: isClaudeFamily ? 'claude' : 'fallback',
        shortLabel: shortLabel || 'Aux',
        subLabel: subLabel || 'EXT',
        badgeCode: badgeCode || 'AUX',
        defaultTitle: title,
        roleTag: isClaudeFamily ? 'CLAUDE · NATIVE' : 'NATIVE · MODEL',
        accentHex: isClaudeFamily ? '#D97742' : '#8EA4C8',
        accentHexLight: isClaudeFamily ? '#B45309' : '#475569',
        secondaryHex: isClaudeFamily ? '#F4B26A' : '#A5B4FC',
        secondaryHexLight: isClaudeFamily ? '#D97706' : '#64748B',
        glowRgba: isClaudeFamily ? 'rgba(217, 119, 66, 0.24)' : 'rgba(142, 164, 200, 0.24)',
        taglineZh: desc || title + ' · 原生模型配置（暂无 2026Q4 基准跑分）',
        taglineEn: desc || title + ' · Native model configuration (no benchmark data)',
        scenesZh: ['原生模型', '推理档位', '扩展席位'],
        scenesEn: ['Native', 'Thinking', 'Ext Slot'],
      };
    }

    function extractShortToken(baseName) {
      var cleanShort = String(baseName || '')
        .replace(/[^A-Za-z0-9]+/g, ' ')
        .trim()
        .split(/\s+/)[0] || 'Aux';
      if (cleanShort.length > 6) cleanShort = cleanShort.slice(0, 6);
      return cleanShort;
    }

    function extractSubVersionToken(baseName) {
      var mSize = /\b(\d+[bBmM])\b/.exec(baseName);
      if (mSize) return mSize[1].toUpperCase();
      var mVer = /\b([vVrR]?\d+(?:\.\d+)?)\b/.exec(baseName);
      if (mVer) return mVer[1].toUpperCase();
      return 'EXT';
    }

    /**
     * Classify a non-element host model option without ever borrowing GPT-OSS preset/scores
     * for unknown or unbenchmarked models.
     */
    function classifyNonElementOption(optionObj, forcedEffortKey) {
      var opt = typeof optionObj === 'string' ? { label: optionObj, value: optionObj } : optionObj || {};
      var rawLabel = typeof opt.label === 'string' ? opt.label.trim() : '';
      var modelId = typeof opt.modelId === 'string' ? opt.modelId.trim() : '';
      var nativeDesc = readNativeOptionDescription(opt);
      var hay = (rawLabel + ' ' + modelId).toLowerCase();

      if (/orchestrator|编排|调度器/.test(hay)) {
        var isVariant = /\(/.test(rawLabel);
        return {
          groupKey: 'orchestrator',
          priority: 0,
          preset: AUX_MODEL_PRESETS[0],
          baseName: 'Orchestrator',
          nativeDescription: nativeDesc,
          variantEffort: '',
          variantLabel: '',
          preferAsDefault: !isVariant,
          isKnownBenchmark: false,
        };
      }

      var stripped = stripEffortSuffixFromLabel(rawLabel);
      var effResolved = forcedEffortKey ? normalizeEnEffortWord(forcedEffortKey) : stripped.effort;
      var hasExp = Boolean(forcedEffortKey || stripped.hasExplicitEffort);
      if (!EFFORT_LABELS[effResolved]) effResolved = '';

      if (/\bflash\b/.test(hay)) {
        var verFlash = /\b(\d+\.\d+)\b/.exec(stripped.baseName);
        var fEff = effResolved || 'high';
        return {
          groupKey: 'flash',
          priority: 1,
          preset: AUX_MODEL_PRESETS[1],
          baseName: stripped.baseName,
          nativeDescription: nativeDesc,
          subLabelOverride: verFlash ? verFlash[1] : 'FAST',
          variantEffort: fEff,
          variantLabel: hasExp ? EFFORT_LABELS[fEff] || fEff : 'Adaptive',
          preferAsDefault: !hasExp || fEff === 'high',
          isKnownBenchmark: true,
        };
      }

      if (/\bopus\b/.test(hay)) {
        var verOpus = /\b(\d+(?:\.\d+)?)\b/.exec(stripped.baseName);
        var oEff = effResolved || 'high';
        return {
          groupKey: 'claude-opus',
          priority: 2,
          preset: AUX_MODEL_PRESETS[2],
          baseName: stripped.baseName,
          nativeDescription: nativeDesc,
          subLabelOverride: verOpus ? verOpus[1] : 'DEEP',
          variantEffort: oEff,
          variantLabel: hasExp ? EFFORT_LABELS[oEff] || oEff : 'High',
          preferAsDefault: !hasExp || oEff === 'high',
          isKnownBenchmark: true,
        };
      }

      if (/\bsonnet\b/.test(hay)) {
        var verSonnet = /\b(\d+(?:\.\d+)?)\b/.exec(stripped.baseName);
        var sEff = effResolved || 'high';
        return {
          groupKey: 'claude-sonnet',
          priority: 3,
          preset: AUX_MODEL_PRESETS[3],
          baseName: stripped.baseName,
          nativeDescription: nativeDesc,
          shortLabelOverride: 'Sonnet',
          badgeCodeOverride: 'SONNET',
          subLabelOverride: verSonnet ? verSonnet[1] : 'CODE',
          variantEffort: sEff,
          variantLabel: hasExp ? EFFORT_LABELS[sEff] || sEff : 'Adaptive',
          preferAsDefault: !hasExp || sEff === 'high',
          isKnownBenchmark: true,
        };
      }

      if (/\b(?:haiku|claude|anthropic)\b/.test(hay)) {
        var isHaiku = /\bhaiku\b/.test(hay);
        var clShort = isHaiku ? 'Haiku' : 'Claude';
        var clBadge = isHaiku ? 'HAIKU' : 'CLAUDE';
        var clSub = extractSubVersionToken(stripped.baseName);
        var clEff = effResolved || 'high';
        var clGroup = isHaiku ? 'claude-haiku' : 'custom:' + stripped.baseName.toLowerCase();
        return {
          groupKey: clGroup,
          priority: isHaiku ? 3.5 : 3.7,
          preset: buildNeutralAuxPreset(clGroup, stripped.baseName, clShort, clSub, clBadge, nativeDesc, 'claude'),
          baseName: stripped.baseName,
          nativeDescription: nativeDesc,
          shortLabelOverride: clShort,
          badgeCodeOverride: clBadge,
          subLabelOverride: clSub,
          variantEffort: clEff,
          variantLabel: hasExp ? EFFORT_LABELS[clEff] || clEff : 'Default',
          preferAsDefault: !hasExp || clEff === 'high',
          isKnownBenchmark: false,
        };
      }

      if (/\bgpt[-_\s]?oss\b/.test(hay)) {
        var subGpt = /\b(\d+[bB])\b/.exec(stripped.baseName);
        var gEff = effResolved || 'medium';
        return {
          groupKey: 'gpt-oss',
          priority: 4,
          preset: AUX_MODEL_PRESETS[4],
          baseName: stripped.baseName,
          nativeDescription: nativeDesc,
          shortLabelOverride: 'GPT',
          badgeCodeOverride: 'GPT',
          subLabelOverride: subGpt ? subGpt[1].toUpperCase() : 'OSS',
          variantEffort: gEff,
          variantLabel: hasExp ? EFFORT_LABELS[gEff] || gEff : 'Adaptive',
          preferAsDefault: !hasExp || gEff === 'high' || gEff === 'medium',
          isKnownBenchmark: true,
        };
      }

      var cleanShort = extractShortToken(stripped.baseName);
      var cleanSub = extractSubVersionToken(stripped.baseName);
      var cleanBadge = cleanShort.toUpperCase();
      var customKey = 'custom:' + stripped.baseName.toLowerCase();
      var cEff = effResolved || 'high';
      return {
        groupKey: customKey,
        priority: 5,
        preset: buildNeutralAuxPreset(customKey, stripped.baseName, cleanShort, cleanSub, cleanBadge, nativeDesc, ''),
        baseName: stripped.baseName,
        nativeDescription: nativeDesc,
        shortLabelOverride: cleanShort,
        badgeCodeOverride: cleanBadge,
        subLabelOverride: cleanSub,
        variantEffort: cEff,
        variantLabel: hasExp ? EFFORT_LABELS[cEff] || cEff : 'Default',
        preferAsDefault: true,
        isKnownBenchmark: false,
      };
    }

    function buildBlindAuxSlot(slotIndex) {
      var bp = AUX_MODEL_PRESETS[5];
      return {
        slotIndex: slotIndex,
        auxIndex: slotIndex,
        id: 'blind-' + slotIndex,
        groupKey: 'blind-' + slotIndex,
        oledAuxId: 'standby',
        miniKey: 'fallback',
        shortLabel: bp.shortLabel,
        subLabel: bp.subLabel,
        badgeCode: bp.badgeCode,
        title: bp.defaultTitle,
        roleTag: bp.roleTag,
        accentHex: bp.accentHex,
        accentHexLight: bp.accentHexLight,
        secondaryHex: bp.secondaryHex,
        secondaryHexLight: bp.secondaryHexLight,
        glowRgba: bp.glowRgba,
        taglineZh: bp.taglineZh,
        taglineEn: bp.taglineEn,
        tagline: bp.taglineEn,
        scenesZh: bp.scenesZh,
        scenesEn: bp.scenesEn,
        scenes: bp.scenesEn.slice(),
        nativeDescription: '',
        isKnownBenchmark: false,
        scores: null,
        available: false,
        levels: [],
        defaultOption: null,
        allOptions: [],
      };
    }

    function unwrapAuxList(list) {
      if (Array.isArray(list)) return list;
      if (list && Array.isArray(list.allAuxModels)) return list.allAuxModels;
      return [];
    }

    function getAuxPageCount(list) {
      var arr = unwrapAuxList(list);
      if (!arr.length) return 0;
      return Math.ceil(arr.length / AUX_PAGE_SIZE);
    }

    function getAuxPageSlice(list, page) {
      var arr = unwrapAuxList(list);
      if (!arr.length) return [];
      var pageCount = Math.ceil(arr.length / AUX_PAGE_SIZE);
      var p = Number(page);
      if (!Number.isFinite(p) || p < 0) p = 0;
      p = Math.floor(p);
      if (p >= pageCount) p = pageCount - 1;
      var start = p * AUX_PAGE_SIZE;
      return arr.slice(start, start + AUX_PAGE_SIZE);
    }

    function findAuxPageForId(list, id) {
      var arr = unwrapAuxList(list);
      if (!arr.length || id === undefined || id === null || id === '') return -1;
      var target = String(id).trim().toLowerCase();
      for (var i = 0; i < arr.length; i += 1) {
        var item = arr[i];
        if (!item) continue;
        if (
          (item.id !== undefined && String(item.id).toLowerCase() === target) ||
          (item.groupKey !== undefined && String(item.groupKey).toLowerCase() === target) ||
          (item.title !== undefined && String(item.title).toLowerCase() === target) ||
          (item.defaultOption &&
            ((item.defaultOption.modelId && String(item.defaultOption.modelId).toLowerCase() === target) ||
              (item.defaultOption.value && String(item.defaultOption.value).toLowerCase() === target) ||
              (item.defaultOption.label && String(item.defaultOption.label).toLowerCase() === target)))
        ) {
          return Math.floor(i / AUX_PAGE_SIZE);
        }
      }
      return -1;
    }

    /**
     * Pad any page slice (< 6 items) to a full 6-slot 2x3 macro pad page with blind keycaps.
     */
    function padAuxPageSlots(pageSlice) {
      var out = Array.isArray(pageSlice) ? pageSlice.slice(0, AUX_PAGE_SIZE) : [];
      for (var i = out.length; i < AUX_PAGE_SIZE; i += 1) {
        out.push(buildBlindAuxSlot(i));
      }
      return out;
    }

    /**
     * Extract all non-element host models into a sorted array (zero 6-slot truncation).
     * Slot #0 is prioritized for Orchestrator latching toggle when present.
     * Augments the returned array with non-enumerable `.allAuxModels` (all real matched models)
     * and supports pagination via `AUX_PAGE_SIZE`, `getAuxPageCount`, `getAuxPageSlice`, `findAuxPageForId`.
     */
    function matchHostAuxModels(modelOptions, effortIndex, orchestratorPlanners, options) {
      var opts = options && typeof options === 'object' ? options : {};
      var useZh = Boolean(opts.zh);
      var hasHostMenu = Array.isArray(modelOptions) && modelOptions.length > 0;

      if (!hasHostMenu) {
        var demoOut = [];
        var demoReal = [];
        for (var di = 0; di < AUX_PAGE_SIZE; di += 1) {
          var dp = AUX_MODEL_PRESETS[di];
          var isDemoAvail = di < 5;
          var demoOpt = isDemoAvail
            ? { label: dp.defaultTitle, value: dp.id, modelId: dp.id }
            : null;
          var demoBench = resolveBenchmarkMetrics(dp.id, 'high', useZh, isDemoAvail);
          var demoSlot = {
            slotIndex: di,
            auxIndex: di,
            id: dp.id,
            groupKey: dp.id,
            oledAuxId: dp.oledAuxId,
            miniKey: dp.miniKey,
            shortLabel: dp.shortLabel,
            subLabel: dp.subLabel,
            badgeCode: dp.badgeCode,
            title: dp.defaultTitle,
            roleTag: dp.roleTag,
            accentHex: dp.accentHex,
            accentHexLight: dp.accentHexLight || dp.accentHex,
            secondaryHex: dp.secondaryHex,
            secondaryHexLight: dp.secondaryHexLight || dp.secondaryHex,
            glowRgba: dp.glowRgba,
            taglineZh: dp.taglineZh,
            taglineEn: dp.taglineEn,
            tagline: useZh ? dp.taglineZh : dp.taglineEn,
            scenesZh: dp.scenesZh,
            scenesEn: dp.scenesEn,
            scenes: (useZh ? dp.scenesZh : dp.scenesEn).slice(),
            nativeDescription: '',
            isKnownBenchmark: Boolean(demoBench.isKnownBenchmark),
            scores: demoBench.isKnownBenchmark && demoBench.scores ? demoBench.scores.slice() : null,
            available: isDemoAvail,
            levels:
              isDemoAvail && dp.id !== 'orchestrator'
                ? [{ effort: 'high', label: 'Adaptive', option: demoOpt, modelOption: demoOpt }]
                : [],
            defaultOption: demoOpt,
            allOptions: demoOpt ? [demoOpt] : [],
          };
          demoOut.push(demoSlot);
          if (isDemoAvail) demoReal.push(demoSlot);
        }
        Object.defineProperty(demoOut, 'allAuxModels', { value: demoReal, enumerable: false });
        return demoOut;
      }

      var groups = new Map();
      var orderCounter = 0;

      function ingestAuxOpt(rawOpt, forcedEffKey) {
        if (!rawOpt) return;
        var optObj =
          typeof rawOpt === 'string'
            ? { label: rawOpt, value: rawOpt }
            : rawOpt.nodeType === 1
            ? { label: String(rawOpt.textContent || '').trim(), _domNode: rawOpt }
            : rawOpt;
        if (!optObj || typeof optObj.label !== 'string' || !optObj.label.trim()) return;
        if (parseElementModelLabel(optObj)) return;

        var cls = classifyNonElementOption(optObj, forcedEffKey);
        var g = groups.get(cls.groupKey);
        if (!g) {
          g = {
            groupKey: cls.groupKey,
            priority: cls.priority,
            order: orderCounter++,
            preset: cls.preset,
            baseName: cls.baseName,
            nativeDescription: cls.nativeDescription || '',
            shortLabel: cls.shortLabelOverride || cls.preset.shortLabel,
            subLabel: cls.subLabelOverride || cls.preset.subLabel,
            badgeCode: cls.badgeCodeOverride || cls.preset.badgeCode,
            byEffort: new Map(),
            defaultOption: optObj,
            hasPreferredDefault: Boolean(cls.preferAsDefault),
            allOptions: [],
          };
          groups.set(cls.groupKey, g);
        } else if (!g.nativeDescription && cls.nativeDescription) {
          g.nativeDescription = cls.nativeDescription;
        }

        if (g.allOptions.indexOf(optObj) === -1) {
          g.allOptions.push(optObj);
        }
        if (!g.hasPreferredDefault && cls.preferAsDefault) {
          g.defaultOption = optObj;
          g.hasPreferredDefault = true;
        }
        if (cls.groupKey !== 'orchestrator') {
          var effCode = cls.variantEffort || 'high';
          if (!g.byEffort.has(effCode)) {
            g.byEffort.set(effCode, {
              effort: effCode,
              label: cls.variantLabel || 'Adaptive',
              option: optObj,
              modelOption: optObj,
            });
          }
        }
      }

      for (var i = 0; i < modelOptions.length; i += 1) {
        ingestAuxOpt(modelOptions[i], '');
      }
      if (effortIndex instanceof Map) {
        effortIndex.forEach(function (innerMap) {
          if (!(innerMap instanceof Map)) return;
          innerMap.forEach(function (opt, effKey) {
            ingestAuxOpt(opt, String(effKey || ''));
          });
        });
      }
      if (Array.isArray(orchestratorPlanners)) {
        for (var pi = 0; pi < orchestratorPlanners.length; pi += 1) {
          var pOpt = orchestratorPlanners[pi];
          if (pOpt && !parseElementModelLabel(pOpt) && groups.size > 0) {
            var pCls = classifyNonElementOption(pOpt, '');
            if (groups.has(pCls.groupKey)) {
              ingestAuxOpt(pOpt, '');
            }
          }
        }
      }

      var sortedGroups = Array.from(groups.values()).sort(function (a, b) {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.order - b.order;
      });

      var totalSlots = Math.max(AUX_PAGE_SIZE, sortedGroups.length);
      var slots = [];
      var realAuxModels = [];

      for (var k = 0; k < totalSlots; k += 1) {
        if (k < sortedGroups.length) {
          var sg = sortedGroups[k];
          var pr = sg.preset;
          var orderedLevels = [];
          for (var ei = 0; ei < EFFORT_ORDER.length; ei += 1) {
            var ek = EFFORT_ORDER[ei];
            if (sg.byEffort.has(ek)) {
              orderedLevels.push(sg.byEffort.get(ek));
            }
          }
          sg.byEffort.forEach(function (lvObj, lvKey) {
            if (EFFORT_ORDER.indexOf(lvKey) === -1) {
              orderedLevels.push(lvObj);
            }
          });
          if (orderedLevels.length >= 2) {
            for (var li = 0; li < orderedLevels.length; li += 1) {
              if (EFFORT_LABELS[orderedLevels[li].effort]) {
                orderedLevels[li].label = EFFORT_LABELS[orderedLevels[li].effort];
              }
            }
          }

          var slotId = sg.groupKey;
          var initBench = resolveBenchmarkMetrics(slotId, 'high', useZh, true);
          var taglineZh = sg.nativeDescription || pr.taglineZh;
          var taglineEn = sg.nativeDescription || pr.taglineEn;
          var slotItem = {
            slotIndex: k,
            auxIndex: k,
            id: slotId,
            groupKey: sg.groupKey,
            oledAuxId: pr.oledAuxId,
            miniKey: pr.miniKey,
            shortLabel: sg.shortLabel,
            subLabel: sg.subLabel,
            badgeCode: sg.badgeCode,
            title: sg.baseName,
            roleTag: pr.roleTag,
            accentHex: pr.accentHex,
            accentHexLight: pr.accentHexLight || pr.accentHex,
            secondaryHex: pr.secondaryHex,
            secondaryHexLight: pr.secondaryHexLight || pr.secondaryHex,
            glowRgba: pr.glowRgba,
            taglineZh: taglineZh,
            taglineEn: taglineEn,
            tagline: useZh ? taglineZh : taglineEn,
            scenesZh: pr.scenesZh,
            scenesEn: pr.scenesEn,
            scenes: (useZh ? pr.scenesZh : pr.scenesEn).slice(),
            nativeDescription: sg.nativeDescription || '',
            isKnownBenchmark: Boolean(initBench.isKnownBenchmark),
            scores: initBench.isKnownBenchmark && initBench.scores ? initBench.scores.slice() : null,
            available: true,
            levels: orderedLevels,
            defaultOption: sg.defaultOption,
            allOptions: sg.allOptions,
          };
          slots.push(slotItem);
          realAuxModels.push(slotItem);
        } else {
          slots.push(buildBlindAuxSlot(k));
        }
      }

      Object.defineProperty(slots, 'allAuxModels', { value: realAuxModels, enumerable: false });
      return slots;
    }

    function getGroupLabel(group, zh) {
      var meta = GROUP_META[group] || GROUP_META.transition;
      return zh ? meta.zh : meta.en;
    }

    function getElementSpecProfile(z) {
      return ELEMENT_SPEC_PROFILES[z] || ELEMENT_SPEC_PROFILES.fallback;
    }

    function getElementLore(z, zh) {
      var slot = SLOT_BY_Z.get(Number(z));
      var lore = ELEMENT_LORE[Number(z)];
      if (lore) return zh ? lore.zh : lore.en;
      if (!slot) {
        return zh ? 'Google 化学元素直连序列' : 'Google Chemical Element Series';
      }
      var groupText = getGroupLabel(slot.group, zh);
      return zh
        ? '第 ' + slot.col + ' 族 · ' + groupText + ' · Google 元素直连模型'
        : 'Group ' + slot.col + ' · ' + groupText + ' · Google Element Series';
    }

    function getRadarAxes(zh) {
      return RADAR_AXES.map(function (ax) {
        return {
          key: ax.key,
          label: zh ? ax.zh : ax.en,
          vertexLabel: zh ? ax.vertexZh : ax.vertexEn,
        };
      });
    }

    function resolveElementDisplay(slotOrZ, zh) {
      var useZh = Boolean(zh);
      var slot =
        typeof slotOrZ === 'object' && slotOrZ
          ? slotOrZ
          : SLOT_BY_Z.get(Number(slotOrZ)) || ELEMENTS_90[5];
      var prof = getElementSpecProfile(slot.z);
      return {
        z: slot.z,
        symbol: slot.symbol,
        name: slot.name,
        displayName: useZh ? slot.name + ' (' + slot.zh + ')' : slot.name,
        groupLabel: getGroupLabel(slot.group, useZh),
        lore: getElementLore(slot.z, useZh),
        roleTag: prof.roleTag,
        switchSpec: useZh ? prof.switchSpecZh : prof.switchSpecEn,
        tagline: useZh ? prof.taglineZh : prof.taglineEn,
        scenes: (useZh ? prof.scenesZh : prof.scenesEn).slice(),
      };
    }

    function resolveAuxSlotDisplay(slot, zh) {
      var useZh = Boolean(zh);
      if (!slot || typeof slot !== 'object') {
        return {
          title: '',
          shortLabel: '',
          roleTag: '',
          tagline: '',
          scenes: [],
          nativeDescription: '',
        };
      }
      var nativeDesc = typeof slot.nativeDescription === 'string' ? slot.nativeDescription.trim() : '';
      return {
        id: slot.id || '',
        title: slot.title || '',
        shortLabel: slot.shortLabel || '',
        roleTag: slot.roleTag || '',
        tagline: nativeDesc || (useZh ? slot.taglineZh || slot.taglineEn || '' : slot.taglineEn || ''),
        scenes: (useZh ? slot.scenesZh || slot.scenesEn || [] : slot.scenesEn || []).slice(),
        nativeDescription: nativeDesc,
      };
    }

    function getLocalizedEffortLabel(effortCode, zh) {
      var code = String(effortCode || '').toLowerCase();
      if (zh && EFFORT_LABELS_ZH[code]) return EFFORT_LABELS_ZH[code];
      return EFFORT_LABELS[code] || effortCode || '';
    }

    return {
      AUX_PAGE_SIZE: AUX_PAGE_SIZE,
      DEFAULT_MAX_CONTEXT_TOKENS: DEFAULT_MAX_CONTEXT_TOKENS,
      EFFORT_ORDER: EFFORT_ORDER,
      EFFORT_NORM_MAP: EFFORT_NORM_MAP,
      EFFORT_LABELS: EFFORT_LABELS,
      EFFORT_LABELS_ZH: EFFORT_LABELS_ZH,
      MODEL_TRIGGER_TEXT_RE: MODEL_TRIGGER_TEXT_RE,
      EXCLUDED_FAMILY_RE: EXCLUDED_FAMILY_RE,
      ZH_EFFORT_PAREN_RE: ZH_EFFORT_PAREN_RE,
      EN_EFFORT_PAREN_RE: EN_EFFORT_PAREN_RE,
      ELEMENTS_90: ELEMENTS_90,
      SLOT_BY_Z: SLOT_BY_Z,
      ELEMENT_BY_NAME: ELEMENT_BY_NAME,
      GROUP_META: GROUP_META,
      ELEMENT_LORE: ELEMENT_LORE,
      ELEMENT_SPEC_PROFILES: ELEMENT_SPEC_PROFILES,
      MINI_BADGE_SOUL_HEX: MINI_BADGE_SOUL_HEX,
      MINI_BADGE_THEME_SUBSTRATES: MINI_BADGE_THEME_SUBSTRATES,
      CORE_FOUR_ELEMENTS: CORE_FOUR_ELEMENTS,
      HUD_GEM_STYLES: HUD_GEM_STYLES,
      BENCHMARK_SOURCE_CITATION: BENCHMARK_SOURCE_CITATION,
      BENCHMARK_SOURCE_CITATION_SHORT: BENCHMARK_SOURCE_CITATION_SHORT,
      RADAR_AXES: RADAR_AXES,
      BENCHMARK_CEILINGS: BENCHMARK_CEILINGS,
      BENCHMARK_2026Q4_DB: BENCHMARK_2026Q4_DB,
      AUX_MODEL_PRESETS: AUX_MODEL_PRESETS,
      parseHexRgb255: parseHexRgb255,
      lerpRgb255: lerpRgb255,
      rgba255Css: rgba255Css,
      rgb255ToHex: rgb255ToHex,
      resolveThemeNativeMiniBadgeColors: resolveThemeNativeMiniBadgeColors,
      normalizeZhEffortWord: normalizeZhEffortWord,
      normalizeEnEffortWord: normalizeEnEffortWord,
      stripEffortSuffixFromLabel: stripEffortSuffixFromLabel,
      parseElementModelLabel: parseElementModelLabel,
      matchGoogleElementModels: matchGoogleElementModels,
      resolveBenchmarkMetrics: resolveBenchmarkMetrics,
      classifyNonElementOption: classifyNonElementOption,
      matchHostAuxModels: matchHostAuxModels,
      getAuxPageCount: getAuxPageCount,
      getAuxPageSlice: getAuxPageSlice,
      findAuxPageForId: findAuxPageForId,
      padAuxPageSlots: padAuxPageSlots,
      getGroupLabel: getGroupLabel,
      getElementSpecProfile: getElementSpecProfile,
      getElementLore: getElementLore,
      getRadarAxes: getRadarAxes,
      resolveElementDisplay: resolveElementDisplay,
      resolveAuxSlotDisplay: resolveAuxSlotDisplay,
      getLocalizedEffortLabel: getLocalizedEffortLabel,
    };
  }
);

(function (root, factory) {
  const api = factory();
  if (root) root.__agAnimatedIcons = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  'use strict';

  /** Google Brand Studio 官方高饱和四色色板（亮暗双适配、零渐变 ID 冲突） */
  const GOOGLE_COLORS = Object.freeze({
    blue: '#4285F4',
    red: '#EA4335',
    yellow: '#FBBC04',
    green: '#34A853',
    coreLight: '#FFFFFF',
  });

  const esc = (v) =>
    String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  function extraAttrs(attrs) {
    if (!attrs || typeof attrs !== 'object') return '';
    let out = '';
    for (const [k, v] of Object.entries(attrs)) {
      if (v != null && v !== false) out += v === true ? ` ${k}` : ` ${k}="${esc(v)}"`;
    }
    return out;
  }

  /** 正统 Google Gemini 高斯柔光四色单体星（零固定 ID 冲突） */
  const OFFICIAL_GEMINI_SPARK_D =
    'M12 1.2c.25 0 .47.17.53.41c.21.79.48 1.56.8 2.31c1.23 2.86 3.39 5.02 6.25 6.25c.75.32 1.52.59 2.31.8c.24.06.41.28.41.53s-.17.47-.41.53a16 16 0 0 0-2.31.8c-2.86 1.23-5.02 3.39-6.25 6.25c-.32.75-.59 1.52-.8 2.31a.55.55 0 0 1-.53.41a.55.55 0 0 1-.53-.41a16 16 0 0 0-.8-2.31c-1.23-2.86-3.39-5.02-6.25-6.25a16 16 0 0 0-2.31-.8A.55.55 0 0 1 1.2 12c0-.25.17-.47.41-.53c.79-.21 1.56-.48 2.31-.8c2.86-1.23 5.02-3.39 6.25-6.25c.32-.75.59-1.52.8-2.31c.06-.24.28-.41.53-.41Z';

  function renderGoogleSparkOrbitSvg(opts = {}) {
    const size = +opts.size > 0 ? +opts.size : 16;
    const tier = String(opts.tier || 'auto').toLowerCase();
    const mono = Boolean(opts.monochrome || tier === 'fixed');
    const cls = opts.className ? ` ${esc(opts.className)}` : '';
    const xmlns = opts.xmlns ? ' xmlns="http://www.w3.org/2000/svg"' : '';
    const anim = opts.animIcon === false ? '' : ' data-anim-icon="google-spark-orbit"';

    const lock = tier === 'fixed'
      ? '<g class="ai-part-lock" opacity="0.82"><rect x="15.8" y="16.4" width="6.4" height="5.2" rx="1.3" fill="currentColor"/><path d="M17.4 16.4V15a1.6 1.6 0 0 1 3.2 0v1.4" stroke="currentColor" stroke-width="1.35" fill="none"/></g>'
      : '';

    if (mono) {
      const fillOp = tier === 'low' ? '0.45' : '0.88';
      return (
        `<svg class="ag-spark-orbit-svg${cls}"${xmlns}${anim} data-brand="antigravity" data-tier="${esc(tier)}" data-monochrome="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" aria-hidden="true"${extraAttrs(opts.attrs)}>` +
        `<g class="ai-part-spark-core"><path d="${OFFICIAL_GEMINI_SPARK_D}" fill="currentColor" fill-opacity="${fillOp}"/></g>${lock}</svg>`
      );
    }

    // 预柔化多层叠色光斑（零 SMIL 属性突变、零运行时 filter:blur，纯 CSS 合成层微动效）
    const smil = Boolean(anim);
    const o = (x, y, rx, ry, fl) =>
      `<ellipse cx="${x}" cy="${y}" rx="${+(rx * 1.28).toFixed(1)}" ry="${+(ry * 1.28).toFixed(1)}" fill="${fl}" fill-opacity=".2"/>` +
      `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fl}" fill-opacity=".34"/>` +
      `<ellipse cx="${x}" cy="${y}" rx="${+(rx * 0.62).toFixed(1)}" ry="${+(ry * 0.62).toFixed(1)}" fill="${fl}" fill-opacity=".5"/>`;
    const glint = smil
      ? `<rect class="ai-sp-glint" x="-4" y="-2" width="2.8" height="28" rx="1.4" fill="#FFF" opacity="0"/>`
      : '';
    const meshBody =
      `<g style="clip-path:path('${OFFICIAL_GEMINI_SPARK_D}') view-box">` +
      `<path d="${OFFICIAL_GEMINI_SPARK_D}" fill="${GOOGLE_COLORS.blue}"/>` +
      `<g class="${smil ? 'ai-sp-oa' : ''}" style="transform-origin:12px 12px">` +
      o(9.4, 4.4, 7, 6, GOOGLE_COLORS.red) +
      o(10.4, 20.2, 6.6, 5.6, GOOGLE_COLORS.green) +
      `</g><g class="${smil ? 'ai-sp-ob' : ''}" style="transform-origin:12px 12px">` +
      o(4.6, 13.2, 6.2, 5.6, GOOGLE_COLORS.yellow) +
      o(18, 10.8, 6.8, 6.4, '#3B82F6') +
      `</g>${glint}</g>`;

    const xGlow = tier === 'xhigh'
      ? `<path class="ai-part-orbit-outer" d="${OFFICIAL_GEMINI_SPARK_D}" stroke="#4285F4" stroke-width="0.95" opacity="0.62" transform="scale(1.06)" style="transform-origin:12px 12px"/>`
      : '';

    return (
      `<svg class="ag-spark-orbit-svg${cls}"${xmlns}${anim} data-brand="antigravity" data-tier="${esc(tier)}" data-monochrome="false" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" aria-hidden="true"${extraAttrs(opts.attrs)}>` +
      `${xGlow}<g class="ai-part-spark-core">${meshBody}</g>${lock}</svg>`
    );
  }

  function renderGoogleSparkOrbitDataUri(opts = {}) {
    return `data:image/svg+xml,${encodeURIComponent(
      renderGoogleSparkOrbitSvg({ size: opts.size || 32, tier: opts.tier || 'auto', monochrome: Boolean(opts.monochrome), xmlns: true, animIcon: false })
    )}`;
  }

  const GEAR_PATH =
    'M12 8.8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4Zm7.4 6.2a1.6 1.6 0 0 0 .32 1.76l.06.06a1.9 1.9 0 1 1-2.68 2.68l-.06-.06a1.6 1.6 0 0 0-1.76-.32 1.6 1.6 0 0 0-.98 1.46V21a1.9 1.9 0 1 1-3.8 0v-.08a1.6 1.6 0 0 0-.98-1.46 1.6 1.6 0 0 0-1.76.32l-.06.06a1.9 1.9 0 1 1-2.68-2.68l.06-.06a1.6 1.6 0 0 0 .32-1.76 1.6 1.6 0 0 0-1.46-.98H3a1.9 1.9 0 1 1 0-3.8h.08a1.6 1.6 0 0 0 1.46-.98 1.6 1.6 0 0 0-.32-1.76l-.06-.06a1.9 1.9 0 1 1 2.68-2.68l.06.06a1.6 1.6 0 0 0 1.76.32h.08a1.6 1.6 0 0 0 .98-1.46V3a1.9 1.9 0 1 1 3.8 0v.08a1.6 1.6 0 0 0 .98 1.46h.08a1.6 1.6 0 0 0 1.76-.32l.06-.06a1.9 1.9 0 1 1 2.68 2.68l-.06.06a1.6 1.6 0 0 0-.32 1.76v.08a1.6 1.6 0 0 0 1.46.98H21a1.9 1.9 0 1 1 0 3.8h-.08a1.6 1.6 0 0 0-1.46.98Z';

  const pt = (c, d, ex = '') => `<path class="ai-part-${c}" d="${d}"${ex}/>`;
  const gp = (c, inner) => `<g class="ai-part-${c}">${inner}</g>`;

  /** 21 枚 lucide-animated & line-md 微动态 SVG 图标模板 */
  const TEMPLATES = Object.freeze({
    'panel-left': () => '<rect class="ai-part-frame" x="3" y="4" width="18" height="16" rx="3"/>' + pt('rail', 'M9.2 4v16'),
    'sparkles-pen': () =>
      pt('board', 'M11 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5V13') +
      gp('pen', '<path d="M16.4 3.9a1.9 1.9 0 0 1 2.7 2.7L11.5 14.2l-3.4.8.8-3.4 7.5-7.7Z"/>') +
      pt('spark', 'M19 2.2v2.6M17.7 3.5h2.6', ' stroke-width="1.6"'),
    search: () => gp('lens', '<circle cx="10.8" cy="10.8" r="6.6"/><path d="m15.7 15.7 4.5 4.5"/>'),
    pin: () => gp('pin', '<path d="M9 4h6l-1 5.2 2.8 2.5v1.5H7.2v-1.5L10 9.2 9 4Z"/><path d="M12 13.2V20"/>'),
    'clock-history': () => gp('dial', '<path d="M3.4 11a8.8 8.8 0 1 1 2 6.2"/><path d="M3.2 6.8V11h4.2"/>') + pt('hand', 'M12 7.4V12l3.1 1.9'),
    'folder-workspace': () =>
      pt('back', 'M3.5 18.5V6.5A2 2 0 0 1 5.5 4.5h4.1l2 2.2h6.9a2 2 0 0 1 2 2v9.8a1.5 1.5 0 0 1-1.5 1.5h-14a1.5 1.5 0 0 1-1.5-1.5Z') +
      pt('flap', 'M3.7 10.6h16.6'),
    'settings-gear': () => gp('gear', `<path d="${GEAR_PATH}"/>`),
    'trash-sweep': () =>
      gp('lid', '<path d="M4 6.5h16"/><path d="M9 6.5V4.8c0-.7.6-1.3 1.3-1.3h3.4c.7 0 1.3.6 1.3 1.3v1.7"/>') +
      gp('bin', '<path d="M6.2 6.5 7 19.2c.06 1 .88 1.8 1.9 1.8h6.2c1.02 0 1.84-.8 1.9-1.8L17.8 6.5"/><path d="M10 10.5v6M14 10.5v6"/>'),
    'copy-check': (o) => {
      const ck = Boolean(o && o.active);
      return (
        `<g class="ai-part-copy" style="opacity:${ck ? 0 : 1}">` +
        pt('copy-back', 'M8 8V5.8C8 4.8 8.8 4 9.8 4h8.4C19.2 4 20 4.8 20 5.8v8.4c0 1-.8 1.8-1.8 1.8H16') +
        '<rect class="ai-part-copy-front" x="4" y="8" width="12" height="12" rx="2"/></g>' +
        pt('check', 'M5 12.8l4.4 4.4L19.4 7.2', ` data-path-length="22" style="opacity:${ck ? 1 : 0}"`)
      );
    },
    'plus-spin': () => gp('plus', '<path d="M12 5v14M5 12h14"/>'),
    'arrow-up-launch': () => gp('arrow', '<path d="M12 19V5"/><path d="m6.2 10.8 5.8-5.8 5.8 5.8"/>'),
    'chevron-right': () => pt('chevron', 'm9 6 6 6-6 6'),
    'chevron-down': () => pt('chevron', 'm6 9 6 6 6-6'),
    'more-horizontal': () =>
      [5.5, 12, 18.5].map((cx, i) => `<circle class="ai-part-d${i + 1}" cx="${cx}" cy="12" r="1.35" fill="currentColor"/>`).join(''),
    'radar-pulse': () =>
      '<circle class="ai-part-core" cx="12" cy="12" r="2.3"/>' +
      gp('wave', '<path d="M7.6 7.6a6.2 6.2 0 0 0 0 8.8M16.4 7.6a6.2 6.2 0 0 1 0 8.8"/><path d="M4.6 4.6a10.4 10.4 0 0 0 0 14.8M19.4 4.6a10.4 10.4 0 0 1 0 14.8"/>'),
    'sliders-tune': () =>
      gp('tracks', '<path d="M4 6.5h16M4 12h16M4 17.5h16" stroke-opacity="0.72"/>') +
      [[9, 6.5], [15, 12], [10, 17.5]].map(([x, y], i) => `<circle class="ai-part-k${i + 1}" cx="${x}" cy="${y}" r="2.1" fill="var(--card,var(--bg-elevated,#141518))"/>`).join(''),
    'sun-moon': () =>
      gp('celestial', '<path d="M12 7.6a4.4 4.4 0 1 0 4.4 4.4 3.4 3.4 0 0 1-4.4-4.4Z"/>') +
      gp('rays', '<path d="M12 2.8v1.8M12 19.4v1.8M4.2 12H2.4M21.6 12h-1.8M6.1 6.1 4.8 4.8M19.2 19.2l-1.3-1.3M17.9 6.1l1.3-1.3M4.8 19.2l1.3-1.3"/>'),
    'layers-stack': () => pt('top', 'M12 3.5 3.2 8 12 12.5 20.8 8 12 3.5Z') + pt('mid', 'm3.2 12 8.8 4.5 8.8-4.5') + pt('bot', 'm3.2 16 8.8 4.5 8.8-4.5'),
    'zap-bolt': () => pt('bolt', 'M13.2 2.8 4.8 13.4h6.3L10.3 21.2l8.9-10.6h-6.3l.3-7.8Z'),
    'alert-triangle': () => gp('triangle', '<path d="M10.3 4.2 2.9 17.2a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z"/>' + pt('mark', 'M12 9.5v4.2M12 17h.01')),
    'x-close': () => gp('cross', '<path d="M17.5 6.5 6.5 17.5M6.5 6.5l11 11"/>'),
  });

  const ICON_ALIASES = Object.freeze({
    trash: 'trash-sweep', copy: 'copy-check', settings: 'settings-gear', clock: 'clock-history',
    history: 'clock-history', folder: 'folder-workspace', plus: 'plus-spin', 'arrow-up': 'arrow-up-launch',
    send: 'arrow-up-launch', sliders: 'sliders-tune', layers: 'layers-stack', zap: 'zap-bolt',
    alert: 'alert-triangle', close: 'x-close', x: 'x-close', sidebar: 'panel-left',
    'new-chat': 'sparkles-pen', automations: 'zap-bolt',
  });

  const tf = (...a) => a.map((transform) => ({ transform }));
  const tx = (d) => tf('translateX(0px)', `translateX(${d}px)`, 'translateX(0px)');
  const ty = (d) => tf('translateY(0px)', `translateY(${d}px)`, 'translateY(0px)');
  const st = (part, origin, keyframes, ex) => ({ part, origin, keyframes, ...ex });
  const C = '12px 12px';

  const ICON_SPECS = Object.freeze({
    'google-spark-orbit': {
      hover: [
        st('.ai-part-spark-core', C, tf('scale(1) rotate(0deg)', 'scale(1.1) rotate(8deg)', 'scale(1) rotate(0deg)'), { stiffness: 360, damping: 22 }),
      ],
    },
    'panel-left': {
      hover: [st('.ai-part-rail', '9.2px 12px', tx(1.9))],
      states: {
        collapse: [st('.ai-part-rail', '9.2px 12px', tx(-2.2))],
        expand: [st('.ai-part-rail', '9.2px 12px', tf('translateX(-2px)', 'translateX(2.2px)', 'translateX(0px)'))],
      },
    },
    'sparkles-pen': {
      hover: [
        st('.ai-part-pen', '11.5px 14px', tf('rotate(0deg)', 'rotate(-9deg) translate(0.6px,-0.6px)', 'rotate(4deg)', 'rotate(0deg)'), { damping: 20 }),
        st('.ai-part-spark', '19px 3.5px', tf('scale(1) rotate(0deg)', 'scale(1.32) rotate(22deg)', 'scale(1) rotate(0deg)'), { delay: 40, damping: 18 }),
      ],
    },
    search: { hover: [st('.ai-part-lens', '10.8px 10.8px', tf('scale(1) rotate(0deg)', 'scale(1.08) rotate(-11deg)', 'scale(1) rotate(0deg)'))] },
    pin: { hover: [st('.ai-part-pin', C, ty(2.2), { stiffness: 460, damping: 20 })] },
    'clock-history': { hover: [st('.ai-part-hand', C, tf('rotate(0deg)', 'rotate(360deg)'), { stiffness: 280, damping: 24 })] },
    'folder-workspace': { hover: [st('.ai-part-flap', '12px 19px', tf('translateY(0px) scaleY(1)', 'translateY(1.2px) scaleY(0.88)', 'translateY(0px) scaleY(1)'))] },
    'settings-gear': { hover: [st('.ai-part-gear', C, tf('rotate(0deg)', 'rotate(65deg)', 'rotate(0deg)'), { stiffness: 320 })] },
    'trash-sweep': {
      hover: [st('.ai-part-lid', '5px 6.5px', tf('translateY(0px) rotate(0deg)', 'translateY(-1.6px) rotate(-16deg)', 'translateY(0px) rotate(0deg)'), { damping: 18 })],
      states: {
        sweep: [
          st('.ai-part-lid', '5px 6.5px', tf('translateY(0px) rotate(0deg)', 'translateY(-2.4px) rotate(-20deg)', 'translateY(-1px) rotate(-8deg)', 'translateY(0px) rotate(0deg)'), { damping: 16 }),
          st('.ai-part-bin', '12px 14px', tf('rotate(0deg)', 'rotate(3.5deg)', 'rotate(-2.5deg)', 'rotate(0deg)'), { delay: 35 }),
        ],
      },
    },
    'copy-check': {
      hover: [
        st('.ai-part-copy-front', '10px 14px', tf('translate(0px,0px)', 'translate(-1.1px,1.1px)', 'translate(0px,0px)')),
        st('.ai-part-copy-back', '14px 10px', tf('translate(0px,0px)', 'translate(1.1px,-1.1px)', 'translate(0px,0px)')),
      ],
      states: {
        check: [st('.ai-part-check', C, tf('scale(0.84)', 'scale(1.06)', 'scale(1)'), { drawStroke: true, stiffness: 340 })],
        copy: [st('.ai-part-copy', C, [{ transform: 'scale(0.9)', opacity: 0.5 }, { transform: 'scale(1)', opacity: 1 }])],
      },
    },
    'plus-spin': { hover: [st('.ai-part-plus', C, tf('rotate(0deg)', 'rotate(90deg)'), { stiffness: 380 })] },
    'arrow-up-launch': {
      hover: [st('.ai-part-arrow', C, ty(-2.2))],
      states: { launch: [st('.ai-part-arrow', C, tf('translateY(0px) scale(1)', 'translateY(2.4px) scale(0.92)', 'translateY(-4.6px) scale(1.06)', 'translateY(0px) scale(1)'), { stiffness: 460, damping: 19 })] },
    },
    'chevron-right': {
      hover: [st('.ai-part-chevron', C, tx(1.9))],
      states: {
        open: [st('.ai-part-chevron', C, tf('rotate(0deg)', 'rotate(90deg)'), { fill: 'forwards' })],
        close: [st('.ai-part-chevron', C, tf('rotate(90deg)', 'rotate(0deg)'), { fill: 'forwards' })],
      },
    },
    'chevron-down': {
      hover: [st('.ai-part-chevron', C, ty(1.8))],
      states: {
        open: [st('.ai-part-chevron', C, tf('rotate(0deg)', 'rotate(180deg)'), { fill: 'forwards' })],
        close: [st('.ai-part-chevron', C, tf('rotate(180deg)', 'rotate(0deg)'), { fill: 'forwards' })],
      },
    },
    'more-horizontal': {
      hover: [
        st('.ai-part-d1', '5.5px 12px', ty(-2.4), { delay: 0, damping: 20 }),
        st('.ai-part-d2', C, ty(-2.4), { delay: 55, damping: 20 }),
        st('.ai-part-d3', '18.5px 12px', ty(-2.4), { delay: 110, damping: 20 }),
      ],
    },
    'radar-pulse': { hover: [st('.ai-part-wave', C, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.13)', opacity: 0.72 }, { transform: 'scale(1)', opacity: 1 }], { stiffness: 340, damping: 19 })] },
    'sliders-tune': {
      hover: [
        st('.ai-part-k1', '9px 6.5px', tx(3.2)),
        st('.ai-part-k2', '15px 12px', tx(-3.6), { delay: 25 }),
        st('.ai-part-k3', '10px 17.5px', tx(2.8), { delay: 50 }),
      ],
    },
    'sun-moon': {
      hover: [
        st('.ai-part-celestial', C, tf('rotate(0deg) scale(1)', 'rotate(-24deg) scale(1.08)', 'rotate(0deg) scale(1)'), { stiffness: 360, damping: 20 }),
        st('.ai-part-rays', C, tf('rotate(0deg) scale(1)', 'rotate(35deg) scale(1.08)', 'rotate(0deg) scale(1)'), { stiffness: 340 }),
      ],
    },
    'layers-stack': { hover: [st('.ai-part-top', '12px 8px', ty(-1.9)), st('.ai-part-bot', '12px 18px', ty(1.9))] },
    'zap-bolt': { hover: [st('.ai-part-bolt', C, tf('scale(1) rotate(0deg)', 'scale(1.15) rotate(-7deg)', 'scale(0.97) rotate(3deg)', 'scale(1) rotate(0deg)'), { stiffness: 480, damping: 18 })] },
    'alert-triangle': { hover: [st('.ai-part-triangle', '12px 13px', tf('rotate(0deg)', 'rotate(-9deg)', 'rotate(8deg)', 'rotate(-4deg)', 'rotate(0deg)'), { stiffness: 460, damping: 16 })] },
    'x-close': { hover: [st('.ai-part-cross', C, tf('rotate(0deg) scale(1)', 'rotate(90deg) scale(1.06)', 'rotate(90deg) scale(1)'))] },
  });

  const ICON_NAMES = Object.freeze(Object.keys(TEMPLATES));
  const resolveIconName = (name) => {
    const raw = String(name || '').trim();
    return TEMPLATES[raw] ? raw : ICON_ALIASES[raw] || '';
  };

  function renderIcon(name, opts = {}) {
    const id = resolveIconName(name);
    if (!id) return '';
    const size = +opts.size > 0 ? +opts.size : 15;
    const sw = +opts.strokeWidth > 0 ? +opts.strokeWidth : 1.8;
    const active = Boolean(opts.active);
    const cls = opts.className ? ` ${esc(opts.className)}` : '';
    const stAttr = id === 'copy-check' ? ` data-icon-state="${active ? 'check' : 'copy'}"` : active ? ' data-icon-state="active"' : '';
    return (
      `<svg class="ag-anim-icon ag-icon-${id}${active ? ' is-active' : ''}${cls}" data-anim-icon="${id}"${stAttr} ` +
      `width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
      `stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extraAttrs(opts.attrs)}>` +
      TEMPLATES[id](opts) +
      `</svg>`
    );
  }

  return Object.freeze({
    GOOGLE_COLORS,
    ICON_NAMES,
    ICON_ALIASES,
    ICON_SPECS,
    resolveIconName,
    renderGoogleSparkOrbitSvg,
    renderGoogleSparkOrbitDataUri,
    renderIcon,
  });
});

// Obsidian Prism — Collapsible Settings Control Center, Scene Presets, Config Backup & Credits Module
(function (root) {
  'use strict';
  const G = root || (typeof globalThis !== 'undefined' ? globalThis : window);
  if (!G) return;
  const O = Object, isArr = Array.isArray, hasOwn = (o, k) => O.prototype.hasOwnProperty.call(o, k), isFn = (v) => typeof v === 'function', isObj = (v) => Boolean(v && typeof v === 'object'), getWin = () => (typeof window !== 'undefined' ? window : G);

  const SETTINGS_SEC_ID = 'ag-cs-settings-sec';
  const STORAGE_SETTINGS_OPEN_KEY = 'ag-prism:settings-open';
  const STORAGE_SETTINGS_SUBTAB_KEY = 'ag-prism:settings-subtab';
  const SETTINGS_STYLE_ID = 'ag-prism-settings-v101-css';
  const PRISM_STORAGE_KEYS = [
    'ag-prism:config',
    'ag-prism:lastFileConfig',
    'agClaudeStyle.settings.v3',
    'ag-claude-style:config',
    'ag-prism:trajRollup.v1',
    STORAGE_SETTINGS_OPEN_KEY,
    STORAGE_SETTINGS_SUBTAB_KEY,
    '__op_chroma_v1',
    'agCs.pulseVialMode.v1',
    'ag_prism_thought_zh_cache_v1',
    'ag_prism_thought_view_mode_v1',
    'ag_prism_thought_style_tag_v1',
  ];

  const clearPrismLocalStorage = (store) => {
    const st = store || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!st || !isFn(st.removeItem)) return 0;
    let n = 0;
    for (const k of PRISM_STORAGE_KEYS) {
      try { st.removeItem(k); n += 1; } catch {}
    }
    return n;
  };

  const SETTINGS_FALLBACK_CSS =
    '.ag-cs-settings-fold-body:not(.is-open),.ag-cs-settings-group[hidden]{display:none!important}';

  // 承接从 Ch1 (style.css) 减负迁出的设置面板专属样式（第 1+2 批共 52 条）、PR #67 按钮主次/致谢卡片/存储明细及壁纸滑块样式（仅展开设置体时按需注入，0 Ch1 占用）
  const SETTINGS_CH9_CSS = (() => {
    const S = 'html[data-ag-cs-style] #ag-cs-settings-sec';
    const L1 = 'html[data-ag-cs-style][data-ag-cs-theme="light"] #ag-cs-settings-sec';
    const L2 = 'html[data-ag-cs-style]>body:is(.theme-light,.light-theme,.light) #ag-cs-settings-sec';
    const RB = `${S} :is(.ag-cs-repo-sync-btn,button[data-ag-cs-repo-sync])`;
    return [
      `${S} .divide-y{overflow:hidden;}`,
      `${S} .py-2{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 16px;padding:12px 15px;}`,
      `${S} .ag-cs-settings-title-line{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}`,
      `${S} .flex-1{display:flex;flex-direction:column;gap:2px;flex:1 1 160px;min-width:160px;}`,
      `${S} [data-k="t"]{font-size:13.5px;font-weight:500;color:var(--foreground);}`,
      `${S} [data-k="d"]{font-size:12px;color:var(--muted-foreground);line-height:1.4;}`,
      `${S} .shrink-0{max-width:100%;}`,
      `${S} [role="group"]:not([data-ui-kind="switch"]){position:relative;display:inline-flex;flex-wrap:wrap;align-items:center;gap:2px;height:auto;min-height:31px;max-width:100%;}`,
      `${S} [role="group"]:not([data-ui-kind="switch"])>button{z-index:1;display:inline-flex;align-items:center;height:26px;min-height:26px;white-space:nowrap;border:0;background:transparent;font-size:12.5px;cursor:pointer;}`,
      `${S} .ag-cs-settings-topdeck{display:flex;flex-direction:column;gap:10px;margin-bottom:2px;padding:4px 2px 6px;border:0;background:transparent;}`,
      `${S} :is(.ag-cs-preset-row,.ag-cs-cfg-footer){display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;}`,
      `${S} .ag-cs-preset-label{font-size:11px;font-weight:600;color:var(--muted-foreground);}`,
      `${S} :is(.ag-cs-preset-pills,.ag-cs-cfg-actions){display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;}`,
      `${S} :is(.ag-cs-preset-btn,.ag-cs-cfg-btn){height:27px;padding:0 12px;border-radius:999px;border:1px solid var(--_kb);background:color-mix(in srgb,var(--foreground) 3.8%,transparent);box-shadow:inset 0 1px 0 rgba(255,255,255,.06);color:var(--secondary-foreground);font-size:11.5px;font-weight:500;cursor:pointer;transition:var(--_t3),box-shadow 140ms ease;}`,
      `${S} :is(.ag-cs-preset-btn,.ag-cs-cfg-btn):hover{background:color-mix(in srgb,var(--foreground) 7.5%,transparent);border-color:var(--ag-cs-border-2);color:var(--foreground);}`,
      `${S} .ag-cs-cfg-btn{height:26px;padding:0 10px;border-radius:7px;}`,
      `${S} .ag-cs-preset-btn[data-active="1"]{background:color-mix(in srgb,var(--primary) 18%,rgba(255,255,255,.05));border-color:color-mix(in srgb,var(--primary) 48%,transparent);box-shadow:inset 0 1px 0 rgba(255,255,255,.16);color:var(--foreground);font-weight:600;}`,
      `${S} .ag-cs-subtabs{display:inline-flex;align-items:center;flex-wrap:wrap;width:fit-content;max-width:100%;padding:2.5px;gap:2px;border-radius:8px;border:1px solid var(--_kb);background:var(--_k1);box-shadow:var(--_kw);}`,
      `${S} .ag-cs-subtab-btn{height:25px;padding:0 10px;border-radius:6px;border:0;background:transparent;color:var(--muted-foreground);font-size:11.5px;font-weight:500;cursor:pointer;transition:background-color 140ms ease,color 140ms ease,box-shadow 140ms ease;}`,
      `${S} .ag-cs-subtab-btn:hover{color:var(--foreground);background:var(--ag-cs-hover-wash);}`,
      `${S} .ag-cs-subtab-btn[aria-selected="true"]{background:var(--_k2);box-shadow:var(--_ks2);color:var(--foreground);font-weight:600;}`,
      `${S} .ag-cs-settings-groups{display:flex;flex-direction:column;gap:12px;}`,
      `${S} .ag-cs-settings-group{display:flex;flex-direction:column;gap:6px;}`,
      `${S} .ag-cs-cfg-footer{margin-top:2px;padding:11px 14px;border-radius:12px;border:1px solid var(--_kb);background:var(--_k0);box-shadow:inset 0 1px 0 rgba(255,255,255,.045);}`,
      `${S} .ag-cs-cfg-meta{display:flex;flex-direction:column;gap:2px;min-width:180px;flex:1;}`,
      `${S} .ag-cs-cfg-title{font-size:12px;font-weight:600;color:var(--foreground);}`,
      `${S} .ag-cs-cfg-hint{font-size:11px;color:var(--muted-foreground);}`,
      `${S} .ag-cs-cfg-hint[data-tone="ok"]{color:#10b981;}`,
      `${S} .ag-cs-cfg-hint[data-tone="err"]{color:#ef4444;}`,
      `${S} .ag-cs-settings-subhead{font-size:12px;font-weight:600;color:var(--muted-foreground);letter-spacing:.02em;padding:0 2px;}`,
      `${S} .ag-cs-beta-notice{font-size:12px;line-height:1.45;padding:7px 10px;border-radius:8px;color:color-mix(in srgb,#F59E0B 72%,var(--foreground));background:color-mix(in srgb,#F59E0B 10%,transparent);border:1px solid color-mix(in srgb,#F59E0B 26%,transparent);}`,
      `${S} .ag-cs-tone-dot{display:inline-block;width:7px;height:7px;border-radius:999px;margin-right:6px;vertical-align:middle;box-shadow:0 0 5px currentColor;flex-shrink:0;}`,
      `${S} .ag-cs-tone-dot[data-tone="follow"]{background:linear-gradient(135deg,#669DF6,#9B72CB);}`,
      `${S} .ag-cs-tone-dot[data-tone="cobalt"]{background:#4F8BFF;color:#4F8BFF;}`,
      `${S} .ag-cs-tone-dot[data-tone="iris"]{background:#A78BFA;color:#A78BFA;}`,
      `${S} .ag-cs-tone-dot[data-tone="amber"]{background:#F59E0B;color:#F59E0B;}`,
      `${S} .ag-cs-tone-dot[data-tone="mono"]{background:#94A3B8;color:#94A3B8;box-shadow:none;}`,
      `${S} :is(.ag-cs-about-repo-row,.ag-cs-thought-bar){display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 12px;}`,
      `${S} .ag-cs-about-repo-info{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;min-width:0;font-size:12px;color:var(--secondary-foreground);}`,
      `${S} .ag-cs-update-link-slot{display:inline-flex;align-items:center;}`,
      `${RB}[data-tone="secondary"]{border-color:var(--ag-cs-border-2);background:var(--ag-cs-pill-bg);color:var(--secondary-foreground);}`,
      `${RB}[data-tone="secondary"]:hover:not(:disabled){background:var(--ag-cs-hover-wash);border-color:color-mix(in srgb,var(--primary) 38%,var(--ag-cs-border-2));color:var(--foreground);}`,
      `${RB}[data-tone="amber"]{border-color:color-mix(in srgb,var(--warning,#F59E0B) 44%,var(--ag-cs-border-2));background:color-mix(in srgb,var(--warning,#F59E0B) 16%,var(--ag-cs-pill-bg));color:#FDE68A;font-weight:600;}`,
      `${RB}[data-tone="amber"]:hover:not(:disabled){background:color-mix(in srgb,var(--warning,#F59E0B) 24%,var(--ag-cs-pill-bg));border-color:color-mix(in srgb,var(--warning,#F59E0B) 62%,var(--ag-cs-border-2));}`,
      `${RB}[data-active="1"]{border-color:color-mix(in srgb,var(--primary) 48%,var(--ag-cs-border-2));background:color-mix(in srgb,var(--primary) 18%,var(--ag-cs-pill-bg));color:var(--foreground);font-weight:600;}`,
      `${L1} :is(.ag-cs-repo-sync-btn,button[data-ag-cs-repo-sync])[data-tone="amber"],${L2} :is(.ag-cs-repo-sync-btn,button[data-ag-cs-repo-sync])[data-tone="amber"]{color:#92400E;}`,
      `${S} .ag-cs-about-credits-title{font-size:11.5px;font-weight:600;color:var(--muted-foreground);letter-spacing:.015em;}`,
      `${S} .ag-cs-about-credits{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:7px;margin:0;padding:0;list-style:none;}`,
      `${S} .ag-cs-about-box a[href]{display:inline-flex;align-items:center;justify-content:space-between;gap:6px;box-sizing:border-box;min-width:0;padding:5px 9px;border-radius:var(--ag-cs-r-md);border:1px solid var(--ag-cs-border-1);background:var(--ag-cs-pill-bg);color:var(--link) !important;font-size:11.5px;line-height:16px;font-weight:500;text-decoration:none !important;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transition:var(--_t2);}`,
      `${S} .ag-cs-about-box a[href]:hover{background:var(--ag-cs-hover-wash);border-color:color-mix(in srgb,var(--primary) 38%,var(--ag-cs-border-2));color:var(--foreground) !important;}`,
      `${S} .ag-cs-about-credits a[href]{display:flex;flex-direction:column;align-items:stretch;justify-content:center;gap:2px;padding:7px 10px;white-space:normal;}`,
      `${S} .ag-cs-credit-top{display:flex;align-items:center;justify-content:space-between;gap:6px;min-width:0;}`,
      `${S} .ag-cs-credit-repo{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1;}`,
      `${S} .ag-cs-credit-ext{flex-shrink:0;font-size:10.5px;opacity:.68;color:var(--muted-foreground);}`,
      `${S} .ag-cs-credit-meta{font-size:10.5px;line-height:14px;font-weight:400;color:var(--muted-foreground);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}`,
      `${S} .ag-cs-about-box details{border-top:1px solid var(--ag-cs-border-1);padding-top:8px;}`,
      `${S} .ag-cs-about-box summary{cursor:pointer;font-size:12px;font-weight:500;color:var(--secondary-foreground);user-select:none;padding:2px 0;transition:color 120ms ease;}`,
      `${S} .ag-cs-about-box summary:hover{color:var(--foreground);}`,
      `${S} :is(.ag-cs-license-pre,.ag-cs-about-box pre){margin:6px 0 0;padding:10px 12px;max-height:168px;overflow:auto;border-radius:var(--ag-cs-r-md);border:1px solid var(--ag-cs-border-1);background:color-mix(in srgb,var(--background) 72%,var(--card));color:var(--muted-foreground);font-family:var(--ag-cs-mono-stack);font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-word;}`,
      `${S} .ag-cs-about-box pre[data-ag-cs-storage-detail="1"]{max-height:280px;color:var(--secondary-foreground);font-size:11.5px;line-height:1.58;}`,
      `${S} .ag-cs-thought-cfg-box{display:flex;flex-direction:column;gap:10px;padding:12px 14px;border-radius:var(--ag-cs-r-lg);background:color-mix(in srgb,var(--background) 36%,var(--_tb));}`,
      `${S} .ag-cs-thought-label{font-size:12px;font-weight:600;color:var(--secondary-foreground);}`,
      `${S} .ag-cs-thought-profiles{display:flex;flex-wrap:wrap;align-items:center;gap:5px;}`,
      `${S} .ag-cs-thought-prof-chip{appearance:none;height:26px;padding:0 10px;border-radius:var(--ag-cs-r-sm);border:1px solid var(--ag-cs-border-1);background:var(--ag-cs-pill-bg);color:var(--secondary-foreground);font-size:12px;cursor:pointer;transition:var(--_t2);}`,
      `${S} .ag-cs-thought-prof-chip:hover{border-color:var(--ag-cs-border-2);color:var(--foreground);}`,
      `${S} .ag-cs-thought-prof-chip[data-active="1"]{background:color-mix(in srgb,var(--primary) 16%,var(--ag-cs-pill-bg));border-color:color-mix(in srgb,var(--primary) 46%,var(--ag-cs-border-2));color:var(--foreground);font-weight:500;}`,
      `${S} .ag-cs-thought-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 10px;}`,
      `@media (max-width:640px){${S} .ag-cs-thought-grid{grid-template-columns:1fr;}}`,
      `${S} .ag-cs-thought-field{display:flex;flex-direction:column;gap:4px;min-width:0;}`,
      `${S} .ag-cs-thought-field[data-span="2"]{grid-column:1/-1;}`,
      `${S} .ag-cs-thought-field label{font-size:11.5px;font-weight:500;color:var(--muted-foreground);display:flex;align-items:center;justify-content:space-between;gap:6px;}`,
      `${S} .ag-cs-thought-input-row{display:flex;align-items:center;gap:6px;min-width:0;}`,
      `${S} :is(.ag-cs-thought-input,.ag-cs-thought-select,.ag-cs-thought-textarea){box-sizing:border-box;width:100%;min-width:0;border-radius:var(--ag-cs-r-md);border:1px solid var(--ag-cs-border-1);background:color-mix(in srgb,var(--background) 68%,var(--card));color:var(--foreground);font-family:inherit;font-size:12.5px;outline:none !important;transition:border-color 120ms ease,box-shadow 120ms ease;}`,
      `${S} :is(.ag-cs-thought-input,.ag-cs-thought-select,.ag-cs-thought-textarea):focus{border-color:color-mix(in srgb,var(--primary) 58%,var(--ag-cs-border-2));box-shadow:0 0 0 2px color-mix(in srgb,var(--primary) 16%,transparent);}`,
      `${S} :is(.ag-cs-thought-input,.ag-cs-thought-select){height:30px;padding:0 9px;}`,
      `${S} .ag-cs-thought-input[data-mono="1"]{font-family:var(--ag-cs-mono-stack);font-size:12px;}`,
      `${S} .ag-cs-thought-textarea{min-height:68px;max-height:180px;padding:7px 9px;line-height:1.45;resize:vertical;}`,
      `${S} .ag-cs-thought-btn{appearance:none;height:28px;padding:0 11px;border-radius:var(--ag-cs-r-md);border:1px solid var(--ag-cs-border-2);background:var(--ag-cs-pill-bg);color:var(--secondary-foreground);font-size:12px;font-weight:500;display:inline-flex;align-items:center;justify-content:center;gap:5px;white-space:nowrap;cursor:pointer;flex-shrink:0;transition:var(--_t2),var(--_ts);}`,
      `${S} .ag-cs-thought-btn:hover:not(:disabled){background:var(--ag-cs-hover-wash);color:var(--foreground);border-color:color-mix(in srgb,var(--primary) 38%,var(--ag-cs-border-2));}`,
      `${S} .ag-cs-thought-btn[data-primary="1"]{background:color-mix(in srgb,var(--primary) 14%,var(--ag-cs-pill-bg));border-color:color-mix(in srgb,var(--primary) 40%,var(--ag-cs-border-2));color:var(--foreground);}`,
      `${S} .ag-cs-thought-btn[data-danger="1"]:hover:not(:disabled){color:var(--error,#E5534B);border-color:color-mix(in srgb,var(--error,#E5534B) 45%,var(--ag-cs-border-2));}`,
      `${S} .ag-cs-thought-btn:active:not(:disabled){transform:scale(.97);}`,
      `${S} .ag-cs-thought-btn:disabled{opacity:.55;cursor:progress;}`,
      `${S} .ag-cs-thought-actions{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 10px;padding-top:2px;}`,
      `${S} .ag-cs-thought-btn-group{display:flex;flex-wrap:wrap;align-items:center;gap:6px;}`,
      `${S} .ag-cs-thought-status{font-size:11.5px;line-height:16px;padding:3px 9px;border-radius:999px;border:1px solid var(--ag-cs-border-1);background:var(--ag-cs-pill-bg);color:var(--muted-foreground);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}`,
      `${S} .ag-cs-thought-status[data-state="ok"]{color:var(--success,#50A37B);border-color:color-mix(in srgb,var(--success,#50A37B) 38%,var(--ag-cs-border-1));}`,
      `${S} .ag-cs-thought-status[data-state="err"]{color:var(--error,#E5534B);border-color:color-mix(in srgb,var(--error,#E5534B) 38%,var(--ag-cs-border-1));}`,
      `${S} .ag-cs-thought-hint{margin:0;font-size:11px;line-height:1.4;color:var(--muted-foreground);opacity:.88;}`,
      `${S} .ag-prism-wp-sliders{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px 18px;padding-top:2px;width:100%;}`,
      `${S} .ag-prism-wp-slider-item{display:flex;flex-direction:column;gap:5px;min-width:0;}`,
      `${S} .ag-prism-wp-slider-head{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11.5px;color:var(--muted-foreground);}`,
      `${S} .ag-prism-wp-slider-val{font-family:var(--ag-cs-mono-stack,ui-monospace,monospace);font-size:11px;font-variant-numeric:tabular-nums;color:var(--foreground);font-weight:500;padding:1px 6px;border-radius:5px;background:var(--ag-cs-pill-bg,rgba(128,128,128,0.10));border:1px solid var(--ag-cs-border-1,rgba(128,128,128,0.18));}`,
      `${S} .ag-prism-wp-range{width:100%;margin:0;accent-color:var(--primary,#669DF6);cursor:pointer;height:18px;}`,
      `${S} .ag-cs-effort-preview{margin:0 15px 12px;padding:8px 10px 9px;border-radius:10px;border:1px solid var(--_kb);background:radial-gradient(120% 140% at 50% 0%,#1d202b 0%,#15171e 72%);display:flex;flex-direction:column;gap:7px;box-shadow:inset 0 1px 0 rgba(255,255,255,.04);}`,
      `${S} .ag-cs-ep-head{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11px;line-height:14px;}`,
      `${S} .ag-cs-ep-style{font-weight:600;color:var(--foreground);display:inline-flex;align-items:center;gap:6px;}`,
      `${S} .ag-cs-ep-tier{font-family:var(--ag-cs-mono-stack);font-weight:600;color:#93c5fd;}`,
      `${S} .ag-cs-ep-track{position:relative;width:100%;height:34px;border-radius:10px;overflow:hidden;cursor:pointer;touch-action:none;user-select:none;background:#12141b;border:1px solid rgba(255,255,255,.08);box-shadow:inset 0 1px 2px rgba(0,0,0,.4);}`,
      `${S} .ag-cs-ep-cv{position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;}`,
      `${S} .ag-cs-ep-classic{position:absolute;inset:3px 0;margin:auto;height:22px;border-radius:999px;background:rgba(128,128,145,.18);display:none;pointer-events:none;}`,
      `${S} .ag-cs-ep-fill{position:absolute;left:0;top:0;bottom:0;border-radius:999px;background:linear-gradient(90deg,#4d93f8,#9333ea);}`,
      `${S} .ag-cs-ep-knob{position:absolute;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.45);}`,
      `${S} .ag-cs-ep-tiers{display:flex;align-items:center;justify-content:space-between;gap:4px;}`,
      `${S} .ag-cs-ep-btn{flex:1;height:21px;border-radius:6px;border:1px solid transparent;background:transparent;color:var(--muted-foreground);font-size:10.5px;font-weight:500;cursor:pointer;transition:background-color 120ms ease,color 120ms ease,border-color 120ms ease;}`,
      `${S} .ag-cs-ep-btn:hover{color:var(--foreground);background:rgba(255,255,255,.05);}`,
      `${S} .ag-cs-ep-btn[data-active="1"]{color:var(--foreground);background:rgba(255,255,255,.09);border-color:rgba(255,255,255,.14);}`,
    ].join('\n');
  })();

  const mkSp = (allowed, d, aliases) => (aliases ? { allowed, default: d ?? allowed[0], aliases } : { allowed, default: d ?? allowed[0] });
  const S_ON = O.freeze(mkSp(['on', 'off']));
  const S_OFF = O.freeze(mkSp(['on', 'off'], 'off'));
  const S_AUTO = O.freeze(mkSp(['auto', 'on', 'off']));
  const S_T = O.freeze(mkSp([true, false]));
  const S_F = O.freeze(mkSp([true, false], false));

  const PRISM_SETTINGS_SCHEMA = O.freeze({
    palette: mkSp(['obsidian', 'host', 'warm'], null, { claude: 'warm' }),
    lightPreset: mkSp(['crystal', 'alabaster']),
    darkAuraStyle: mkSp(['prism', 'neon'], 'prism'),
    accentTone: mkSp(['follow', 'cobalt', 'iris', 'amber', 'mono']),
    cornerStyle: mkSp(['sharp', 'balanced', 'soft'], 'balanced'),
    ambientIntensity: mkSp(['0', '35', '70', '100'], '100'),
    darkAura: mkSp(['subtle', 'balanced', 'vivid'], 'balanced'),
    motionLevel: mkSp(['off', 'subtle', 'standard', 'ultra'], 'ultra'),
    targetFps: mkSp(['60', '120', '180', 'native'], '180'),
    homeLayout: mkSp(['studio', 'classic', 'off']),
    homeRipple: S_T,
    convRipple: mkSp(['off', 'subtle', 'medium', 'full'], 'off', { on: 'medium', true: 'medium', false: 'off' }),
    logoInk: mkSp(['accent', 'foreground']),
    language: mkSp(['zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'es', 'fr', 'de'], 'zh-CN', { yue: 'zh-CN', 'zh-HK': 'zh-TW', 'zh-MO': 'zh-TW' }),
    hostLocalization: S_AUTO,
    composerRestyle: S_T,
    placeholderStyle: mkSp(['studio', 'host']),
    smoothCaret: S_T,
    scrollBottomMotion: mkSp(['smooth', 'instant']),
    contextMenu: S_T,
    codeFont: mkSp(['default', 'jetbrains', 'cascadia', 'sfmono']),
    codeLigatures: S_F,
    mascot: mkSp(['crab', 'quad', 'quad-minis', 'off'], null, { dual: 'crab' }),
    sidebarRestyle: S_T,
    sidebarCompact: S_F,
    sidebarNavFold: mkSp(['off', 'on']),
    thoughtTranslate: mkSp(['off', 'machine', 'ai']),
    thoughtTrigger: mkSp(['preload', 'expand']),
    thoughtView: mkSp(['immersive', 'bilingual']),
    telemetryModule: S_AUTO,
    effortSliderModule: S_AUTO,
    effortSliderStyle: mkSp(['classic', 'prism', 'ferrofluid', 'orbital', 'oscilloscope', 'plasma', 'supernova', 'swarm']),
    effortMemory: S_ON,
    periodicModelPicker: S_OFF,
    omniModule: S_ON,
    linkTarget: mkSp(['builtin', 'external']),
    sidebarStudio: S_OFF,
    autoUpdate: S_OFF,
    updateChannel: mkSp(['stable', 'beta']),
    autoArchiveOnExit: S_F,
  });

  const SCENE_PRESETS = O.freeze({
    ultra: O.freeze({ motionLevel: 'ultra', targetFps: '180', homeRipple: true, mascot: 'crab', sidebarCompact: false, smoothCaret: true, ambientIntensity: '100' }),
    focus: O.freeze({ motionLevel: 'subtle', targetFps: '120', homeRipple: false, convRipple: 'off', mascot: 'off', sidebarCompact: true, smoothCaret: true, ambientIntensity: '35' }),
    eco: O.freeze({ motionLevel: 'off', targetFps: '60', homeRipple: false, convRipple: 'off', mascot: 'off', sidebarCompact: false, smoothCaret: false, ambientIntensity: '0' }),
  });

  const normThoughtStyle = (s) => (s === 'tech' || s === 'technical' ? 'technical' : s === 'concise' || s === 'custom' ? s : null);

  const getDefaultSettingsPatch = () => {
    const out = {};
    for (const [k, spec] of O.entries(PRISM_SETTINGS_SCHEMA)) out[k] = spec.default;
    return out;
  };

  const redactSecrets = (s) =>
    String(s || '')
      .replace(/\b(?:sk|rk|pk|ak|AIza)[A-Za-z0-9_\-]{10,}\b/g, '[REDACTED]')
      .replace(/\bBearer\s+[A-Za-z0-9._\-]{10,}\b/gi, 'Bearer [REDACTED]');

  const MASCOT_SPECIES = O.freeze(['c', 'k', 'd', 'w']);
  const MASCOT_PRESETS = O.freeze({
    off: O.freeze({ c: 0, k: 0, d: 0, w: 0, minis: false }),
    crab: O.freeze({ c: 1, k: 1, d: 0, w: 0, minis: false }),
    dual: O.freeze({ c: 1, k: 1, d: 0, w: 0, minis: false }),
    minis: O.freeze({ c: 1, k: 1, d: 0, w: 0, minis: true }),
    quad: O.freeze({ c: 1, k: 1, d: 1, w: 1, minis: false }),
    'quad-minis': O.freeze({ c: 1, k: 1, d: 1, w: 1, minis: true }),
  });

  const parseMascotSpec = (raw) => {
    if (raw === false) return { c: 0, k: 0, d: 0, w: 0, minis: false };
    if (typeof raw !== 'string') return null;
    if (hasOwn(MASCOT_PRESETS, raw)) return { ...MASCOT_PRESETS[raw] };
    if (!raw.startsWith('r:') || raw.length <= 2) return null;
    const m = /^r:(?:([ckdw][0-4](?:,[ckdw][0-4])*)?(\+m)?)$/.exec(raw);
    if (!m) return null;
    const out = { c: 0, k: 0, d: 0, w: 0, minis: Boolean(m[2]) };
    const seen = new Set();
    let rawTotal = 0;
    let total = 0;
    if (m[1]) {
      for (const tok of m[1].split(',')) {
        const sp = tok[0];
        const cnt = Number(tok.slice(1));
        if (seen.has(sp) || !Number.isInteger(cnt) || cnt < 0 || cnt > 4) return null;
        seen.add(sp);
        rawTotal += cnt;
        const clamped = cnt > 0 ? 1 : 0;
        out[sp] = clamped;
        total += clamped;
      }
    }
    return rawTotal > 6 || total > 4 ? null : out;
  };

  const encodeMascotSpec = (spec) => {
    const src = isObj(spec) ? spec : {};
    const counts = { c: 0, k: 0, d: 0, w: 0 };
    let rem = 4;
    for (const sp of MASCOT_SPECIES) {
      const n = Math.max(0, Math.min(1, Math.min(rem, Number(src[sp]) > 0 ? 1 : 0)));
      counts[sp] = n;
      rem -= n;
    }
    const minis = Boolean(src.minis);
    const total = counts.c + counts.k + counts.d + counts.w;
    if (total === 0 && !minis) return 'off';
    if (counts.c === 1 && counts.k === 1 && counts.d === 0 && counts.w === 0) return minis ? 'minis' : 'crab';
    if (counts.c === 1 && counts.k === 1 && counts.d === 1 && counts.w === 1) return minis ? 'quad-minis' : 'quad';
    const parts = [];
    for (const sp of MASCOT_SPECIES) if (counts[sp] > 0) parts.push(sp + counts[sp]);
    return 'r:' + parts.join(',') + (minis ? '+m' : '');
  };

  // ── 紧凑同源 16×10 像素精灵兜底引擎（当 mascot='off' 未注入 Ch10 时依然 100% 真实高清像素渲染）──
  const FALLBACK_MASCOT_ART = (() => {
    const decPal = (s, base) => {
      const o = base ? { ...base } : {};
      for (const p of s.split(';')) o[p[0]] = p[1] === 'r' ? p.slice(1) : '#' + p.slice(1);
      return o;
    };
    const SH = decPal('k9c958c;B5b8fb9;rcc4f45;ye8b64a;hrgba(20, 20, 19, 0.22);F9e3324;fc9642a;Ye0a23c;Vfff1dc;A3d8bff;Ed6e8ff;a93c5fd');
    const PALS = {
      clawd: decPal('#d97757;sbf684c;o141413;Od97757;qe8a88e;Qf1cbbb', SH),
      cat: decPal('#947fd6;s735eb5;o141413;ka89fc4;B6a8fd6;O947fd6;qb6a7e6;Qd9cff6', SH),
      dragon: decPal('#d7dfef;s95a1c2;o1e1936;Oc6cce6;qbfbde6;Qe2e1f7;Uedf1fc;Ta3a5d6;X818ab2', SH),
      whale: decPal('#4e6fff;s3450cf;o141413;O4e6fff;q86a2ff;Qc7d6ff;Ue5f0ff;Ta8cbff;X38bdf8', SH),
      cowboy: decPal('#d97757;sbf684c;o141413;H8b5e3c;Ra6744e;hrgba(20, 20, 19, 0.18)'),
      shades: decPal('#e0896b;sc16f53;o141413;G141413;g6d778a;wffffff;hrgba(20, 20, 19, 0.18)'),
      wizard: decPal('#8a74cf;s6a56aa;o141413;M5c4b9e;ye8b64a;bcfe3ee;hrgba(20, 20, 19, 0.18)'),
    };
    const decF = (spec) => {
      const ci = spec.indexOf(':');
      const [ox, oy] = spec.slice(0, ci).split(',').map(Number);
      const rows = [];
      const body = spec.slice(ci + 1);
      if (body) {
        for (const seg of body.split('/')) {
          const st = seg.indexOf('*');
          const rRaw = st >= 0 ? seg.slice(0, st) : seg;
          const n = st >= 0 ? +seg.slice(st + 1) : 1;
          const row = rRaw.replace(/(\d+)(.)/g, (_, cnt, ch) => ch.repeat(+cnt));
          for (let i = 0; i < n; i++) rows.push(row);
        }
      }
      return { ox, oy, rows };
    };
    const decGrp = (raw) => {
      const g = {};
      for (const item of raw.split(';')) {
        const eq = item.indexOf('=');
        g[item.slice(0, eq)] = decF(item.slice(eq + 1));
      }
      return g;
    };
    const C = {
      body: decGrp('stand=2,0:12#*8;squash=1,2:.12s./14#*6;turnL=2,0:11#s*8;turnR=2,0:s11#*8'),
      eyes: decGrp('open=4,2:o6.o*2;half=4,3:o6.o;shut=3,3:oo6.oo;happy=3,2:.o6.o./o.o4.o.o;squint=4,2:o6.o/.o4.o./o6.o'),
      legs: decGrp('stand=2,8:.#.#4.#.#.*2;crouch=2,9:.#.#4.#.#.;tuck=2,8:..#.#..#.#..*2'),
      clawL: decGrp('stub=0,5:##*2;up=0,-2:##*2/#.;open=0,4:##/.#/##'),
      clawR: decGrp('stub=14,5:##*2;up=14,-2:##*2/.#;waveOut=14,-1:.##*2/#..'),
    };
    const K = {
      ears: decGrp('stand=2,-1:#10.#/##8.##;nod=2,0:#10.#/##8.##;loaf=2,2:#10.#/##8.##;airplane=0,0:##12.##/3#10.3#'),
      body: decGrp('stand=2,1:12#*7;loaf=1,4:.12s./14#*5;squash=1,2:.12s./14#*6;turnL=2,1:11#s*7'),
      eyes: decGrp('open=4,3:o6.o*2;half=4,4:o6.o;shut=3,4:oo6.oo;happy=3,3:.o6.o./o.o4.o.o;loafShut=3,6:oo6.oo;loafHalf=4,6:o6.o'),
      paws: decGrp('none=0,0:;cheer=0,2:#14.#*2;up=0,-1:##12.##*2;upR=14,0:##*2'),
      tail: decGrp('up=14,3:.s/.#*2/##;sway=14,3:.#*2/s#/#.;loaf=14,6:.#*2/s#;puff=14,2:.#/##*2/s#/#.'),
    };
    const D = {
      ears: decGrp('stand=1,-1:.T12.T./..XT8.TX..;nod=1,0:.T12.T./..XT8.TX..;airplane=1,-1:T14.T/.XT10.TX.'),
      body: decGrp('stand=2,1:12#*4/3#6U3#/3#6q3#/3#6U3#;squash=1,2:.12s./14#*2/4#6U4#/4#6q4#/4#6U4#;turnL=2,1:11#s*4/##6U3#s/##6q3#s/##6U3#s;turnR=2,1:s11#*4/s3#6U##/s3#6q##/s3#6U##'),
      legs: decGrp('stand=2,8:.##6.##.*2;crouch=2,9:.##6.##.;tuck=2,8:..##4.##..*2'),
      paws: decGrp('none=0,2:X14.X/Xq12.qX/.X12.X.;cheer=0,0:X14.X/Xq12.qX/.XX10.XX.;up=-1,1:XX14.XX/Xqq12.qqX/.XX12.XX.;tuck=1,4:X12.X*2;upR=0,0:14.XX/13.qX/13.X.'),
      tail: decGrp('up=14,4:3.T/..XT/.##./##s.;sway=14,5:3.T/.##T/##s.;curl=14,6:.##T/##s.;puff=14,3:3.T/..#T/.##./##s.'),
    };
    const W = {
      body: decGrp('stand=2,1:.10#./12#*4/##8U##/#10U#/.#8U#./..8T..;squash=1,3:..10s../.12#./14#*2/##10U##/.#10U#./..10T..;loaf=2,4:.10s./12#*2/##8U##/#10U#/.10T.;turnL=2,1:.9#s./11#s*4/#8U##s/10U#s/.8U#s./..8T..'),
      paws: decGrp('none=0,6:.s/ss;flap=0,5:ss/.s;cheer=0,4:ss12.ss/.s12.s.;up=0,2:ss12.ss/.s12.s.;tuck=1,7:s;upR=14,4:ss/.s'),
      tail: decGrp('up=13,1:..#..#/..4#/3.##./..3#./.3#../##s3.;sway=13,2:3.#..#/..4#./..3#../.3#3./##s4.;loaf=13,5:..#.#./.3#../##s3.;puff=13,0:..#..#/..4#/..3#./.3#../3#3./##s3.'),
    };
    const FX = decGrp(
      'dragonFlame0=14,4:.f./YVf/.f.;dragonFlame1=14,3:..fF./.YVfF/VYYfF/.fF..;dragonFlame2=14,3:3.fF./.fYVfF/VYYfF./..fF..;' +
      'whaleSpout0=5,-3:.B..B./..AA../..BA../..AA..;whaleSpout1=4,-5:.B4.B./B.A..A.B/..AB.BA./3.AA3./3.BA3./3.AA3.;whaleSpout2=3,-5:..B4.B../.A6.A./B3.BB3.B/4.AA4./.B..BA..B./4.AA4.;' +
      'z1=10,-6:4k/..k./.k../4k;z2=12,-9:3k/.k./3k;spark=5,-8:..y..*2/5y/..y..*2;heart=5,-7:.r.r./5r/.3r./..r..;' +
      'fireSpark0=5,-8:..Y../f3.V/..f..;fireSpark1=5,-9:.V..f/..Y../f4.;fireSpark2=5,-8:f..Y./4.V/.f3.'
    );
    const MINIS = decGrp(
      'cowboy=0,-2:5.6H5./3.10H3./..12R../..12#../..##o6#o##../16#/..12#../3.#.#4.#.#3.;' +
      'cowboyT=0,-2:4.6H6./..10H4./.12R3./..12#../..##o6#o##../16#/..12#../..#..#4.#..#..;' +
      'shades=0,0:..12#../..4Gg##g4G../..12G../16#/..12#../3.#.#4.#.#3.;' +
      'shadesT=0,0:..12#../..GwGGw##GwGGw../..12G../16#/..12#../3.#.#4.#.#3.;' +
      'wizard=0,-3:7.MM7./6.MyMM6./5.6M5./..12M../..12#../..##o6#o##../16#/..12#../3.#.#4.#.#3.;' +
      'wizardT=0,-3:5.y10./4.yMyMM7./5.6M5./..12M../..12#../..##o6#o##../16#/..12#y./3.#.#4.#.#.y.'
    );
    const drawLayers = (ctx, oxGrid, oyGrid, pxSize, pal, layers) => {
      for (const l of layers) {
        if (!l || !l.rows) continue;
        for (let r = 0; r < l.rows.length; r++) {
          const row = l.rows[r];
          for (let c = 0; c < row.length; c++) {
            const ch = row[c];
            if (ch === '.' || ch === ' ') continue;
            const col = pal[ch];
            if (!col) continue;
            ctx.fillStyle = col;
            ctx.fillRect((oxGrid + l.ox + c) * pxSize, (oyGrid + l.oy + r) * pxSize, pxSize, pxSize);
          }
        }
      }
    };
    return {
      source: 'ch9-fallback',
      PALETTES: PALS,
      drawMainActor(ctx, kind, poseKey, tickIdx, oxGrid, oyGrid, pxSize, opts = {}) {
        if (!ctx) return 0;
        const pal = PALS[kind] || PALS.clawd;
        const m = tickIdx % 2;
        const t3 = tickIdx % 3;
        const layers = [];
        const sym = opts.sym && FX[opts.sym] ? FX[opts.sym] : null;
        if (kind === 'clawd') {
          if (poseKey === 'sleep') layers.push(C.legs.tuck, C.body.squash, C.eyes.shut, C.clawL.stub, C.clawR.stub);
          else if (poseKey === 'tilt') layers.push(C.legs.stand, C.body.turnL, C.eyes.half, C.clawL.stub, C.clawR.stub);
          else if (poseKey === 'happy') layers.push(m ? C.legs.crouch : C.legs.stand, m ? C.body.squash : C.body.stand, C.eyes.happy, C.clawL.up, C.clawR.up);
          else if (poseKey === 'wave') layers.push(C.legs.stand, C.body.stand, C.eyes.happy, C.clawL.stub, m ? C.clawR.waveOut : C.clawR.up);
          else layers.push(opts.breath ? C.legs.crouch : C.legs.stand, C.body.stand, opts.blink ? C.eyes.half : C.eyes.open, C.clawL.stub, C.clawR.stub);
        } else if (kind === 'cat') {
          if (poseKey === 'sleep') layers.push(K.tail.loaf, K.body.loaf, K.ears.loaf, K.eyes.loafShut);
          else if (poseKey === 'tilt') layers.push(K.tail.up, C.legs.stand, K.body.turnL, K.ears.nod, K.eyes.half);
          else if (poseKey === 'happy') layers.push(m ? K.tail.puff : K.tail.up, C.legs.stand, K.body.stand, m ? K.ears.nod : K.ears.stand, K.eyes.happy, K.paws.cheer);
          else if (poseKey === 'wave') layers.push(K.tail.up, C.legs.stand, K.body.stand, K.ears.nod, K.eyes.happy, m ? K.paws.upR : K.paws.none);
          else layers.push(m ? K.tail.sway : K.tail.up, C.legs.stand, K.body.stand, K.ears.stand, opts.blink ? K.eyes.half : K.eyes.open);
        } else if (kind === 'dragon') {
          if (poseKey === 'sleep') layers.push(D.tail.curl, D.legs.tuck, D.body.squash, D.ears.nod, K.eyes.shut, D.paws.tuck);
          else if (poseKey === 'tilt') layers.push(D.tail.up, D.legs.stand, D.body.turnL, D.ears.nod, K.eyes.half, D.paws.none);
          else if (poseKey === 'dragonFlame') layers.push(D.tail.puff, D.legs.stand, D.body.turnR, D.ears.airplane, K.eyes.happy, m ? D.paws.up : D.paws.cheer, FX['dragonFlame' + t3], FX['fireSpark' + t3]);
          else if (poseKey === 'happy') layers.push(m ? D.tail.puff : D.tail.up, D.legs.stand, D.body.stand, m ? D.ears.nod : D.ears.stand, K.eyes.happy, m ? D.paws.up : D.paws.cheer);
          else if (poseKey === 'wave') layers.push(D.tail.up, D.legs.stand, D.body.stand, D.ears.nod, K.eyes.happy, m ? D.paws.upR : D.paws.none);
          else layers.push(m ? D.tail.sway : D.tail.up, D.legs.stand, D.body.stand, D.ears.stand, opts.blink ? K.eyes.half : K.eyes.open, D.paws.none);
        } else {
          if (poseKey === 'sleep') layers.push(W.tail.loaf, W.body.loaf, { ...K.eyes.loafShut, oy: 5 }, W.paws.tuck);
          else if (poseKey === 'tilt') layers.push(W.tail.up, W.body.turnL, K.eyes.half, W.paws.flap);
          else if (poseKey === 'whaleSpout') layers.push(W.tail.puff, m ? W.body.squash : W.body.stand, K.eyes.happy, m ? W.paws.cheer : W.paws.up, FX['whaleSpout' + t3]);
          else if (poseKey === 'happy') layers.push(m ? W.tail.puff : W.tail.up, W.body.stand, K.eyes.happy, W.paws.cheer, FX['whaleSpout' + (m ? 1 : 0)]);
          else if (poseKey === 'wave') layers.push(W.tail.up, W.body.stand, K.eyes.happy, m ? W.paws.upR : W.paws.flap);
          else layers.push(m ? W.tail.sway : W.tail.up, W.body.stand, opts.blink ? K.eyes.half : K.eyes.open, m ? W.paws.flap : W.paws.none);
        }
        if (sym) layers.push(sym);
        drawLayers(ctx, oxGrid, oyGrid, pxSize, pal, layers);
        return layers.length;
      },
      drawMiniCrab(ctx, id, frameKey, oxGrid, oyGrid, pxSize) {
        if (!ctx) return 0;
        const pal = PALS[id] || PALS.cowboy;
        const spr = frameKey === 'trick' ? MINIS[id + 'T'] || MINIS[id] : MINIS[id];
        if (!spr) return 0;
        drawLayers(ctx, oxGrid, oyGrid, pxSize, pal, [spr]);
        return 1;
      },
    };
  })();

  const resolveMascotArt = () => {
    const winRef = getWin();
    return G.__agPrismMascotArt || winRef?.__agPrismMascotArt || G.__agDualMascotRig?.mascotArt || winRef?.__agDualMascotRig?.mascotArt || FALLBACK_MASCOT_ART;
  };

  const SPOTLIGHT_ICON_SVG =
    '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
    '<path d="M5.5 2.5h5l-.8 2.6H6.3L5.5 2.5Z" fill="currentColor"/>' +
    '<path d="M6.2 5.4h3.6L13.5 14h-11L6.2 5.4Z" fill="currentColor" opacity="0.28"/>' +
    '<path d="M7.2 5.4h1.6L10.4 14H5.6L7.2 5.4Z" fill="currentColor" opacity="0.55"/>' +
    '<ellipse cx="8" cy="14" rx="5.2" ry="1.1" fill="currentColor" opacity="0.45"/>' +
    '</svg>';

  // ── 《八方旅人》黑曜石星辰酒馆 HD-2D WebGL2 3D 视差选角子面板（仅打开且可见时渲染，关闭/隐藏/脱离 DOM 立即停帧并 0×0 + WEBGL_lose_context 回收显存）──
  const STAGE_SLOTS = O.freeze([
    { key: 'c', toggleId: 'c', kind: 'clawd', cx: 72, i18nKey: 'mascotSpeciesCrab', fb: 'Claude Crab', hex: '#d97757', rayA: '249,115,22', rayB: '251,146,60', cheerPose: 'happy', cheerSym: 'spark' },
    { key: 'k', toggleId: 'k', kind: 'cat', cx: 196, i18nKey: 'mascotSpeciesCat', fb: 'Gemini Cat', hex: '#947fd6', rayA: '139,92,246', rayB: '56,189,248', cheerPose: 'happy', cheerSym: 'heart' },
    { key: 'd', toggleId: 'd', kind: 'dragon', cx: 320, i18nKey: 'mascotSpeciesDragon', fb: 'GPT Dragon', hex: '#d7dfef', rayA: '226,232,240', rayB: '45,212,191', cheerPose: 'dragonFlame', cheerSym: 'spark' },
    { key: 'w', toggleId: 'w', kind: 'whale', cx: 444, i18nKey: 'mascotSpeciesWhale', fb: 'DeepSeek Whale', hex: '#4e6fff', rayA: '59,130,246', rayB: '56,189,248', cheerPose: 'whaleSpout', cheerSym: 'spark' },
    { key: 'm', toggleId: 'minis', kind: 'minis', cx: 566, i18nKey: 'mascotStageMinisSlot', fb: 'Mini Crab Corner', hex: '#fb923c', rayA: '251,146,60', rayB: '245,158,11', cheerPose: 'trick', cheerSym: 'spark' },
  ]);

  const createMascotCastingStage = ({
    doc,
    sec,
    foldBody,
    getMainBlocks,
    getLang,
    uiText,
    getCurMascot,
    setMascotValue,
    isLightThemeNow,
    syncRoot,
    handledGroupClicks,
    BTN,
  }) => {
    const STAGE_W = 640;
    const STAGE_H = 360;
    const FRAME_GAP_MS = 33; // WebGL2 丝滑 30fps / 2.5D 轻量降级
    const win = doc.defaultView || getWin();
    const sa = (e, k, v = '') => e.setAttribute(k, String(v));
    const ra = (e, k) => e.removeAttribute(k);
    const ap = (p, ...cs) => { for (const c of cs) if (c) p.appendChild(c); return p; };
    const mk = (tag, cls, txt) => {
      const el = doc.createElement(tag);
      if (cls) el.className = cls;
      if (txt !== undefined) el.textContent = txt;
      return el;
    };
    const nowMs = () => (typeof performance !== 'undefined' && isFn(performance.now) ? performance.now() : Date.now());
    const reqAF = (fn) => (win && isFn(win.requestAnimationFrame) ? win.requestAnimationFrame(fn) : typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(() => fn(nowMs()), 33));
    const canAF = (id) => {
      if (!id) return;
      if (win && isFn(win.cancelAnimationFrame)) win.cancelAnimationFrame(id);
      else if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
      else clearTimeout(id);
    };
    const isReducedMotion = () => {
      try { return Boolean(win?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches); } catch { return false; }
    };

    const view = mk('div', 'ag-cs-mascot-stage-view');
    sa(view, 'data-ag-mascot-stage-view', '1');
    sa(view, 'hidden', '');
    view.hidden = true;
    if (view.style) {
      O.assign(view.style, {
        display: 'none',
        flexDirection: 'column',
        gap: '10px',
        padding: '4px 0 6px',
      });
    }

    // 1. 顶栏：「← 返回设置」+ 舞台标题 + 实时计数/迷你蟹状态
    const hdr = mk('div');
    sa(hdr, 'data-ag-stage-header', '1');
    if (hdr.style) O.assign(hdr.style, { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' });
    const hdrLeft = mk('div');
    if (hdrLeft.style) O.assign(hdrLeft.style, { display: 'flex', alignItems: 'center', gap: '8px' });
    const backBtn = mk('button', BTN);
    backBtn.type = 'button';
    sa(backBtn, 'data-ag-mascot-stage-back', '1');
    if (backBtn.style) {
      O.assign(backBtn.style, {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        padding: '4px 10px',
        borderRadius: '8px',
        fontSize: '12px',
        fontWeight: '600',
        border: '1px solid var(--ag-cs-border, rgba(148,163,184,0.28))',
        cursor: 'pointer',
      });
    }
    const titleEl = mk('span', '');
    sa(titleEl, 'data-ag-stage-title', '1');
    if (titleEl.style) O.assign(titleEl.style, { fontSize: '13.5px', fontWeight: '700', letterSpacing: '0.01em' });
    ap(hdrLeft, backBtn, titleEl);

    const hdrRight = mk('div');
    if (hdrRight.style) O.assign(hdrRight.style, { display: 'flex', alignItems: 'center', gap: '6px' });
    const countPill = mk('span', '');
    sa(countPill, 'data-ag-mascot-count', '1');
    if (countPill.style) {
      O.assign(countPill.style, {
        padding: '2px 8px',
        borderRadius: '999px',
        fontSize: '11.5px',
        fontWeight: '600',
        fontVariantNumeric: 'tabular-nums',
        border: '1px solid var(--ag-cs-border, rgba(148,163,184,0.26))',
        background: 'var(--ag-cs-surface-2, rgba(148,163,184,0.1))',
      });
    }
    const minisPill = mk('span', '');
    sa(minisPill, 'data-ag-stage-minis-pill', '1');
    if (minisPill.style) {
      O.assign(minisPill.style, {
        padding: '2px 8px',
        borderRadius: '999px',
        fontSize: '11px',
        fontWeight: '600',
        border: '1px solid var(--ag-cs-border, rgba(148,163,184,0.24))',
      });
    }
    ap(hdrRight, countPill, minisPill);
    ap(hdr, hdrLeft, hdrRight);

    const hintEl = mk('div', '');
    sa(hintEl, 'data-ag-stage-hint', '1');
    if (hintEl.style) O.assign(hintEl.style, { fontSize: '11.5px', opacity: '0.72', lineHeight: '1.4' });

    // 2. 16:9 电影画幅 HD-2D 微缩酒馆舞台容器
    const stageFrame = mk('div');
    sa(stageFrame, 'data-ag-stage-frame', '1');
    if (stageFrame.style) {
      O.assign(stageFrame.style, {
        position: 'relative',
        width: '100%',
        aspectRatio: '16 / 9',
        borderRadius: '12px',
        overflow: 'hidden',
        border: '1px solid var(--ag-cs-border, rgba(148,163,184,0.32))',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 12px 28px rgba(0,0,0,0.32)',
        lineHeight: '0',
      });
    }

    const createStageCanvas = () => {
      const cv = mk('canvas');
      sa(cv, 'data-ag-mascot-stage-canvas', '1');
      sa(cv, 'aria-label', 'Mascot Casting Stage');
      cv.width = 0;
      cv.height = 0;
      if (cv.style) {
        O.assign(cv.style, {
          width: '100%',
          height: '100%',
          aspectRatio: '16 / 9',
          display: 'block',
          imageRendering: 'pixelated',
          cursor: 'pointer',
        });
      }
      return cv;
    };

    let canvas = createStageCanvas();
    ap(stageFrame, canvas);

    // 3. 与 5 站位严格垂直对齐的 5 张精致像素阵营名牌开关按钮
    const dockGrid = mk('div');
    sa(dockGrid, 'data-ag-stage-dock', '1');
    if (dockGrid.style) {
      O.assign(dockGrid.style, {
        display: 'grid',
        gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
        gap: '6px',
      });
    }

    // 4. 底部 4 枚快捷预设胶囊（双宠经典 / 四宠同台 / 全员上场 / 全员休息）
    const presetRow = mk('div');
    sa(presetRow, 'data-ag-stage-presets', '1');
    if (presetRow.style) {
      O.assign(presetRow.style, {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '6px',
        paddingTop: '2px',
      });
    }

    ap(view, hdr, hintEl, stageFrame, dockGrid, presetRow);

    // ── 舞台实时物理、3D 视差与光影状态（5 个固定单只纯开关站位）──
    let isOpen = false;
    let disposed = false;
    let rafId = 0;
    let lastDrawAt = 0;
    let lastStepAt = 0;
    let frameCount = 0;
    let tickIdx = 0;
    let hoveredSlot = -1;
    let lastArtSource = '';
    let webglStage = null;
    let webglBlocked = false;
    let renderBackend = 'canvas2d';
    let ptrNormX = 0;
    let ptrNormY = 0;
    let ptrInside = false;

    const slotStates = STAGE_SLOTS.map((s, i) => ({
      key: s.key,
      light: 0,
      cheerUntil: 0,
      cheerStart: 0,
      farewellUntil: 0,
      rippleStart: 0,
      motes: Array.from({ length: 7 }, (_, j) => ({
        x: (j * 17 + i * 11) % 72 - 36,
        y: (j * 23 + i * 19) % 210,
        spd: 0.24 + ((j + i) % 4) * 0.11,
        ph: j * 1.1 + i * 0.7,
      })),
      burst: [],
    }));
    const dockRefs = {};
    const presetBtns = [];

    const readRoster = () => parseMascotSpec(getCurMascot()) || { c: 1, k: 1, d: 0, w: 0, minis: false };
    const slotCountOf = (r, key) => (key === 'm' ? (r.minis ? 1 : 0) : r[key] > 0 ? 1 : 0);

    const triggerSlotAnim = (idx, kind, now = nowMs()) => {
      const st = slotStates[idx];
      if (!st) return;
      if (kind === 'cheer') {
        st.cheerStart = now;
        st.cheerUntil = now + 1150;
        st.farewellUntil = 0;
        st.rippleStart = now;
        st.burst = Array.from({ length: 9 }, (_, j) => ({
          dx: (j - 4) * 5.8 + ((j % 2) ? 2 : -2),
          vy: 0.85 + (j % 3) * 0.35,
          t: 0,
        }));
      } else if (kind === 'farewell') {
        st.farewellUntil = now + 520;
        st.cheerUntil = 0;
      }
    };

    const applyRosterChange = (nextRoster, ev) => {
      if (ev && typeof ev === 'object' && handledGroupClicks) handledGroupClicks.add(ev);
      const prevR = readRoster();
      const encoded = encodeMascotSpec(nextRoster);
      const cleanNext = parseMascotSpec(encoded) || { c: 0, k: 0, d: 0, w: 0, minis: false };
      const now = nowMs();
      STAGE_SLOTS.forEach((sl, idx) => {
        const before = slotCountOf(prevR, sl.key);
        const after = slotCountOf(cleanNext, sl.key);
        if (after > before) triggerSlotAnim(idx, 'cheer', now);
        else if (after === 0 && before > 0) triggerSlotAnim(idx, 'farewell', now);
      });
      setMascotValue(encoded);
      syncStageControls();
      syncRoot();
      if (isOpen) drawStageFrame(now, true);
    };

    const toggleStageSlot = (idx, ev) => {
      const sl = STAGE_SLOTS[idx];
      if (!sl) return;
      const cur = readRoster();
      const next = { ...cur };
      if (sl.key === 'm') {
        next.minis = !next.minis;
      } else {
        next[sl.key] = next[sl.key] > 0 ? 0 : 1;
      }
      applyRosterChange(next, ev);
    };

    // 构建 5 张精致像素阵营名牌开关按钮（零步进器、零 ×2 徽章，一键点亮/熄灯）
    STAGE_SLOTS.forEach((sl, idx) => {
      const btn = mk('button', BTN);
      btn.type = 'button';
      sa(btn, 'data-ag-stage-slot', sl.key);
      sa(btn, 'data-ag-mascot-toggle', sl.toggleId);
      if (sl.key === 'm') sa(btn, 'data-ag-mascot-minis', '1');
      if (btn.style) {
        O.assign(btn.style, {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '5px',
          padding: '7px 6px',
          borderRadius: '10px',
          border: '1px solid var(--ag-cs-border, rgba(148,163,184,0.22))',
          background: 'var(--ag-cs-surface-2, rgba(148,163,184,0.06))',
          cursor: 'pointer',
          transition: 'border-color 140ms ease, background 140ms ease, box-shadow 140ms ease',
          minWidth: '0',
        });
      }
      btn.addEventListener('pointerenter', () => {
        hoveredSlot = idx;
        if (isOpen && isReducedMotion()) drawStageFrame(nowMs(), true);
      });
      btn.addEventListener('pointerleave', () => {
        if (hoveredSlot === idx) hoveredSlot = -1;
        if (isOpen && isReducedMotion()) drawStageFrame(nowMs(), true);
      });
      btn.addEventListener('click', (ev) => {
        ev?.stopPropagation?.();
        toggleStageSlot(idx, ev);
      });

      const topRow = mk('div');
      if (topRow.style) O.assign(topRow.style, { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', width: '100%', minWidth: '0' });
      const dot = mk('span');
      sa(dot, 'aria-hidden', 'true');
      if (dot.style) {
        O.assign(dot.style, {
          width: '7px',
          height: '7px',
          borderRadius: '2px',
          background: sl.hex,
          flexShrink: '0',
          boxShadow: sl.key === 'd' ? 'inset 0 0 0 1px rgba(30,25,54,0.32)' : 'none',
        });
      }
      const nameEl = mk('span', '');
      sa(nameEl, 'data-ag-mascot-label', sl.key);
      if (nameEl.style) O.assign(nameEl.style, { fontSize: '11px', fontWeight: '700', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' });
      ap(topRow, dot, nameEl);

      const statePill = mk('span', '');
      sa(statePill, 'data-ag-stage-state', sl.key);
      if (statePill.style) {
        O.assign(statePill.style, {
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1px 8px',
          borderRadius: '999px',
          fontSize: '10px',
          fontWeight: '600',
          lineHeight: '1.45',
          border: '1px solid var(--ag-cs-border, rgba(148,163,184,0.24))',
          whiteSpace: 'nowrap',
        });
      }

      ap(btn, topRow, statePill);
      dockRefs[sl.key] = { btn, dot, nameEl, statePill };
      ap(dockGrid, btn);
    });

    // 构建底部 4 枚快捷预设胶囊（双宠经典 / 四宠同台 / 全员上场 / 全员休息）
    const STAGE_PRESETS = [
      ['crab', 'mascotStagePresetDual', 'Classic Dual'],
      ['quad', 'mascotStagePresetQuad', 'All Four'],
      ['quad-minis', 'optMascotQuadMinis', 'Quad + Crabs'],
      ['off', 'mascotStagePresetOff', 'All Resting'],
    ];
    for (const [val, i18nKey, fb] of STAGE_PRESETS) {
      const pb = mk('button', BTN);
      pb.type = 'button';
      sa(pb, 'data-ag-stage-preset', val);
      if (pb.style) {
        O.assign(pb.style, {
          padding: '4px 10px',
          fontSize: '11px',
          fontWeight: '600',
          borderRadius: '999px',
          border: '1px solid var(--ag-cs-border, rgba(148,163,184,0.28))',
          cursor: 'pointer',
          flex: '1 1 auto',
          textAlign: 'center',
        });
      }
      pb.addEventListener('click', (ev) => {
        ev?.stopPropagation?.();
        const nextR = parseMascotSpec(val) || { c: 0, k: 0, d: 0, w: 0, minis: false };
        applyRosterChange(nextR, ev);
      });
      presetBtns.push({ btn: pb, val, i18nKey, fb });
      ap(presetRow, pb);
    }

    // 同步舞台所有 DOM 文本、阵营名牌开关态与预设高亮
    const syncStageControls = () => {
      const l = getLang();
      const u = uiText(l) || {};
      const r = readRoster();
      const encoded = encodeMascotSpec(r);
      const total = r.c + r.k + r.d + r.w;
      sa(view, 'data-mascot-val', encoded);
      backBtn.textContent = `← ${u.mascotStageBackBtn || 'Back to Settings'}`;
      titleEl.textContent = u.mascotStageTitle || 'Mascot Casting Stage';
      hintEl.textContent = u.mascotStageHint || 'Click mascots in the tavern or badges below to toggle spotlights; move pointer for 3D parallax';
      countPill.textContent = String(u.mascotRosterCount || 'Main {n}/4').replace('{n}', String(total));
      sa(countPill, 'data-total', total);
      if (countPill.style) countPill.style.borderColor = total >= 4 ? 'var(--ag-cs-accent, #60a5fa)' : 'var(--ag-cs-border, rgba(148,163,184,0.26))';
      minisPill.textContent = `${u.mascotRosterMinis || '+3 Mini Crabs'}: ${r.minis ? (u.mascotStageActiveOn || 'On Stage') : (u.mascotStageActiveOff || 'Resting')}`;
      sa(minisPill, 'data-active', r.minis ? '1' : '0');
      if (minisPill.style) {
        minisPill.style.borderColor = r.minis ? 'rgba(251,146,60,0.65)' : 'var(--ag-cs-border, rgba(148,163,184,0.24))';
        minisPill.style.background = r.minis ? 'rgba(251,146,60,0.16)' : 'transparent';
      }

      for (const sl of STAGE_SLOTS) {
        const ref = dockRefs[sl.key];
        if (!ref) continue;
        const on = slotCountOf(r, sl.key) > 0;
        ref.nameEl.textContent = u[sl.i18nKey] || sl.fb;
        ref.statePill.textContent = on ? (u.mascotStageActiveOn || 'On Stage') : (u.mascotStageActiveOff || 'Resting');
        sa(ref.btn, 'aria-pressed', on);
        sa(ref.btn, 'data-active', on ? '1' : '0');
        if (on) sa(ref.btn, 'data-pressed');
        else ra(ref.btn, 'data-pressed');
        if (ref.btn.style) {
          ref.btn.style.borderColor = on ? `rgba(${sl.rayA}, 0.68)` : 'var(--ag-cs-border, rgba(148,163,184,0.2))';
          ref.btn.style.background = on ? `rgba(${sl.rayA}, 0.14)` : 'var(--ag-cs-surface-2, rgba(148,163,184,0.04))';
          ref.btn.style.boxShadow = on ? `inset 0 1px 0 rgba(${sl.rayB}, 0.28), 0 0 12px rgba(${sl.rayA}, 0.14)` : 'none';
        }
        if (ref.statePill.style) {
          ref.statePill.style.borderColor = on ? `rgba(${sl.rayB}, 0.65)` : 'var(--ag-cs-border, rgba(148,163,184,0.2))';
          ref.statePill.style.background = on ? `rgba(${sl.rayA}, 0.24)` : 'transparent';
          ref.statePill.style.opacity = on ? '1' : '0.68';
        }
      }

      for (const p of presetBtns) {
        p.btn.textContent = u[p.i18nKey] || p.fb;
        const act = encoded === p.val;
        sa(p.btn, 'aria-pressed', act);
        if (act) sa(p.btn, 'data-pressed');
        else ra(p.btn, 'data-pressed');
        if (p.btn.style) {
          p.btn.style.borderColor = act ? 'var(--ag-cs-accent, #60a5fa)' : 'var(--ag-cs-border, rgba(148,163,184,0.26))';
          p.btn.style.background = act ? 'color-mix(in srgb, var(--ag-cs-accent, #60a5fa) 18%, transparent)' : 'transparent';
        }
      }
    };

    // Canvas 鼠标归一化坐标映射（WebGL2 3D 精确射线拾取 + 2.5D 区域拾取双兼容）
    const pointerToNdc = (ev) => {
      if (!ev || !isFn(canvas.getBoundingClientRect)) return null;
      const rect = canvas.getBoundingClientRect();
      if (!rect || !rect.width || !rect.height) return null;
      const u = (ev.clientX - rect.left) / rect.width;
      const v = (ev.clientY - rect.top) / rect.height;
      if (u < 0 || u > 1 || v < 0 || v > 1) return null;
      return { u, v, nx: u * 2 - 1, ny: 1 - v * 2 };
    };
    const hitSlotFromEvent = (ev) => {
      const pt = pointerToNdc(ev);
      if (!pt) return -1;
      if (webglStage && isFn(webglStage.pickSlot)) {
        const hit3d = webglStage.pickSlot(pt.nx, pt.ny);
        if (hit3d >= 0) return hit3d;
      }
      if (pt.v < 0.08) return -1;
      return Math.max(0, Math.min(4, Math.floor(pt.u * 5)));
    };
    const onCanvasPointerMove = (ev) => {
      if (!isOpen) return;
      const pt = pointerToNdc(ev);
      if (pt) {
        ptrNormX = pt.nx;
        ptrNormY = pt.ny;
        ptrInside = true;
        webglStage?.setPointer?.(pt.nx, pt.ny, true);
      }
      const hit = hitSlotFromEvent(ev);
      if (hit !== hoveredSlot) {
        hoveredSlot = hit;
        if (isReducedMotion()) drawStageFrame(nowMs(), true);
      }
    };
    const onCanvasPointerLeave = () => {
      hoveredSlot = -1;
      ptrInside = false;
      ptrNormX = 0;
      ptrNormY = 0;
      webglStage?.setPointer?.(0, 0, false);
      if (isOpen && isReducedMotion()) drawStageFrame(nowMs(), true);
    };
    const onCanvasClick = (ev) => {
      ev?.stopPropagation?.();
      if (!isOpen) return;
      const hit = hitSlotFromEvent(ev);
      if (hit >= 0) toggleStageSlot(hit, ev);
    };
    const bindCanvasEvents = (cv) => {
      cv.addEventListener('pointermove', onCanvasPointerMove);
      cv.addEventListener('pointerleave', onCanvasPointerLeave);
      cv.addEventListener('click', onCanvasClick);
    };
    const unbindCanvasEvents = (cv) => {
      cv.removeEventListener?.('pointermove', onCanvasPointerMove);
      cv.removeEventListener?.('pointerleave', onCanvasPointerLeave);
      cv.removeEventListener?.('click', onCanvasClick);
    };
    bindCanvasEvents(canvas);

    const swapToFreshCanvas = () => {
      unbindCanvasEvents(canvas);
      const nextCv = createStageCanvas();
      if (canvas.parentNode) {
        if (isFn(canvas.parentNode.insertBefore)) canvas.parentNode.insertBefore(nextCv, canvas);
        else ap(stageFrame, nextCv);
        canvas.remove?.();
      } else {
        ap(stageFrame, nextCv);
      }
      canvas = nextCv;
      api.canvas = nextCv;
      bindCanvasEvents(canvas);
    };

    const handleWebglFallback = () => {
      webglBlocked = true;
      if (webglStage) {
        try { webglStage.dispose(); } catch {}
        webglStage = null;
      }
      renderBackend = 'canvas2d';
      swapToFreshCanvas();
      if (isOpen && !doc.hidden) drawStageFrame(nowMs(), true);
    };

    const ensureWebglStage = () => {
      if (webglStage || webglBlocked || disposed) return webglStage;
      const glEngine = G.__agOctopathStageWebGL || win?.__agOctopathStageWebGL;
      if (!glEngine || !isFn(glEngine.createStage)) return null;
      try {
        const inst = glEngine.createStage({
          canvas,
          doc,
          onContextLost: handleWebglFallback,
          onAtlasReady: () => { if (isOpen && !doc.hidden) drawStageFrame(nowMs(), true); },
        });
        if (inst) {
          webglStage = inst;
          renderBackend = 'webgl2';
          webglStage.setPointer(ptrNormX, ptrNormY, ptrInside);
          return webglStage;
        }
      } catch {}
      renderBackend = 'canvas2d';
      return null;
    };

    // ── HD-2D 像素剧场单帧渲染管线（优先 WebGL2 3D 视差引擎，自动无损降级 2.5D Canvas）──
    const ensureCanvasBacking = () => {
      const dpr = Math.min((win?.devicePixelRatio) || 1, 1.5);
      const tw = Math.round(STAGE_W * dpr);
      const th = Math.round(STAGE_H * dpr);
      if (canvas.width !== tw || canvas.height !== th) {
        canvas.width = tw;
        canvas.height = th;
      }
      return dpr;
    };

    const drawStageFrame = (now, force = false) => {
      if (!isOpen || disposed || doc.hidden || view.isConnected === false) {
        reclaimStageVram();
        return;
      }
      if (!force && now - lastDrawAt < FRAME_GAP_MS) return;
      const dt = lastStepAt ? Math.min(80, Math.max(8, now - lastStepAt)) : 33;
      lastStepAt = now;
      lastDrawAt = now;
      frameCount += 1;
      tickIdx = Math.floor(now / 150);

      const light = Boolean(isLightThemeNow());
      const reduced = isReducedMotion();
      const r = readRoster();
      const art = resolveMascotArt();
      lastArtSource = art?.source || 'unknown';

      // 1. 统一推进 5 槽位聚光灯插值、欢呼/告别/涟漪与姿态状态
      const smoothK = Math.min(1, dt / 110);
      const slotInfos = [];
      for (let i = 0; i < STAGE_SLOTS.length; i++) {
        const sl = STAGE_SLOTS[i];
        const st = slotStates[i];
        const cnt = slotCountOf(r, sl.key);
        const isHov = hoveredSlot === i;
        const targetLight = cnt > 0 ? 1 : isHov ? 0.45 : 0;
        st.light += (targetLight - st.light) * (reduced ? 1 : smoothK);
        if (Math.abs(targetLight - st.light) < 0.01) st.light = targetLight;

        const cheering = st.cheerUntil > now;
        const farewell = !cheering && st.farewellUntil > now;
        const cheerProg = cheering ? Math.max(0, Math.min(1, (now - st.cheerStart) / 1150)) : 0;
        const rippleProg = st.rippleStart && now - st.rippleStart < 780 ? (now - st.rippleStart) / 780 : 0;
        let pose = 'idle';
        let jumpPx = 0;
        let jumpWorld = 0;
        let sym = null;
        if (cheering) {
          pose = sl.cheerPose;
          sym = sl.cheerSym;
          const arc = Math.abs(Math.sin(cheerProg * Math.PI * 2));
          jumpPx = -Math.round(arc * 16);
          jumpWorld = arc * 0.36;
        } else if (farewell) {
          pose = 'wave';
        } else if (cnt === 0) {
          pose = isHov ? 'tilt' : 'sleep';
          if (pose === 'sleep') sym = (tickIdx + i) % 6 < 3 ? 'z1' : 'z2';
        } else {
          pose = isHov ? 'tilt' : 'idle';
        }
        const breath = pose === 'idle' && (tickIdx + i * 3) % 14 === 0;
        const blink = pose === 'idle' && (tickIdx + i * 5) % 22 === 0;
        slotInfos.push({
          sl, st, cnt, isHov, light: st.light,
          cheering, farewell, cheerProg, rippleProg,
          kind: sl.kind, pose, sym, jumpPx, jumpWorld, breath, blink,
          animTick: tickIdx + i,
          clipTick: cheering ? Math.floor((now - st.cheerStart) / 120) : tickIdx + i,
        });
      }

      // 2. 优先走 WebGL2 HD-2D 3D 视差像素舞台引擎
      const glInst = ensureWebglStage();
      if (glInst && !glInst.isContextLost()) {
        const ok = glInst.render(now, { dt, light, reducedMotion: reduced, art, tickIdx, slotInfos });
        if (ok) {
          renderBackend = 'webgl2';
          return;
        }
        handleWebglFallback();
        return;
      }

      // 3. 优雅降级：16:9 多层视差 2.5D 星夜酒馆 Canvas 引擎（兼容无 WebGL2 / Mock 测试环境）
      renderBackend = 'canvas2d';
      const dpr = ensureCanvasBacking();
      const ctx = canvas.getContext?.('2d');
      if (!ctx) return;

      const hasGrad = isFn(ctx.createLinearGradient);
      const hasRad = isFn(ctx.createRadialGradient);
      const hasPoly = isFn(ctx.moveTo) && isFn(ctx.lineTo) && isFn(ctx.fill);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, STAGE_W, STAGE_H);

      const parX = reduced || !ptrInside ? 0 : Math.round(ptrNormX * 8);

      // 3a) HD-2D 黑曜石星夜酒馆后墙（拱窗星月 + 书架 + 壁炉微光）
      if (hasGrad) {
        const bg = ctx.createLinearGradient(0, 0, 0, 248);
        if (light) {
          bg.addColorStop(0, '#efe7d6');
          bg.addColorStop(0.55, '#f6efe2');
          bg.addColorStop(1, '#e6d8be');
        } else {
          bg.addColorStop(0, '#080b14');
          bg.addColorStop(0.55, '#121829');
          bg.addColorStop(1, '#1d2438');
        }
        ctx.fillStyle = bg;
      } else {
        ctx.fillStyle = light ? '#f2eadc' : '#121726';
      }
      ctx.fillRect(0, 0, STAGE_W, 248);

      // 石砖纹理 + 哥特拱窗星月
      ctx.fillStyle = light ? 'rgba(138,108,72,0.06)' : 'rgba(255,255,255,0.025)';
      for (let y = 32; y < 238; y += 20) ctx.fillRect(0, y, STAGE_W, 1);
      for (const wx of [146, 494]) {
        const x0 = wx + Math.round(parX * 0.35);
        ctx.fillStyle = light ? '#cbb899' : '#252d44';
        ctx.fillRect(x0 - 38, 34, 76, 134);
        ctx.fillStyle = light ? '#b8d1eb' : '#102454';
        ctx.fillRect(x0 - 32, 42, 64, 120);
        ctx.fillStyle = light ? '#fff8dc' : '#dceeff';
        ctx.fillRect(x0 - 12, 60, 10, 10);
        ctx.fillRect(x0 + 12, 82, 3, 3);
        ctx.fillRect(x0 - 16, 108, 3, 3);
      }

      // 居中暖光壁炉
      const hx = 320 + Math.round(parX * 0.5);
      ctx.fillStyle = light ? '#a58d70' : '#2e3246';
      ctx.fillRect(hx - 40, 152, 80, 96);
      ctx.fillStyle = '#181116';
      ctx.fillRect(hx - 26, 174, 52, 72);
      ctx.fillStyle = '#e85d22';
      ctx.fillRect(hx - 18, 212, 36, 30);
      ctx.fillStyle = '#ffbc42';
      ctx.fillRect(hx - 10, 200 + (tickIdx % 2) * 3, 20, 34);

      // 散景暖光点
      const bokeh = [[52, 72, 16], [164, 54, 12], [274, 82, 18], [392, 60, 14], [510, 74, 16], [596, 56, 12]];
      for (let i = 0; i < bokeh.length; i++) {
        const [bx, by, br] = bokeh[i];
        const drift = Math.sin(now / 2600 + i * 1.4) * 4;
        if (hasRad) {
          const g = ctx.createRadialGradient(bx + parX * 0.5, by + drift, 1, bx + parX * 0.5, by + drift, br);
          g.addColorStop(0, light ? 'rgba(245,180,92,0.18)' : 'rgba(251,191,36,0.14)');
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g;
          ctx.fillRect(bx + parX * 0.5 - br, by + drift - br, br * 2, br * 2);
        }
      }

      // 顶部木石横梁
      ctx.fillStyle = light ? '#8c6d4f' : '#0f1320';
      ctx.fillRect(0, 0, STAGE_W, 14);
      ctx.fillStyle = light ? '#b08e68' : '#232c44';
      ctx.fillRect(0, 14, STAGE_W, 3);

      // 3b) 透视拼花木石舞台地板 + 阶梯台沿厚度
      if (hasGrad) {
        const fl = ctx.createLinearGradient(0, 244, 0, 330);
        if (light) {
          fl.addColorStop(0, '#d8c5a5');
          fl.addColorStop(1, '#c4ad89');
        } else {
          fl.addColorStop(0, '#2a2029');
          fl.addColorStop(1, '#18141f');
        }
        ctx.fillStyle = fl;
      } else {
        ctx.fillStyle = light ? '#d2be9c' : '#1b1822';
      }
      ctx.fillRect(0, 244, STAGE_W, 86);

      ctx.fillStyle = light ? 'rgba(92,66,38,0.18)' : 'rgba(255,255,255,0.06)';
      ctx.fillRect(0, 244, STAGE_W, 2);
      for (const py of [266, 288, 310]) ctx.fillRect(0, py, STAGE_W, 1);
      if (hasPoly && isFn(ctx.stroke)) {
        ctx.save();
        ctx.strokeStyle = light ? 'rgba(92,66,38,0.14)' : 'rgba(255,255,255,0.045)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 10; i++) {
          const topX = 32 + i * 57.6;
          const botX = (topX - STAGE_W / 2) * 1.26 + STAGE_W / 2;
          ctx.beginPath();
          ctx.moveTo(Math.round(topX), 245);
          ctx.lineTo(Math.round(botX), 328);
          ctx.stroke();
        }
        ctx.restore();
      }

      // 立体舞台前缘与台阶深影
      ctx.fillStyle = light ? '#b59971' : '#322b3e';
      ctx.fillRect(0, 328, STAGE_W, 4);
      ctx.fillStyle = light ? '#8d704c' : '#120f18';
      ctx.fillRect(0, 332, STAGE_W, 16);
      ctx.fillStyle = light ? 'rgba(72,52,32,0.22)' : 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 348, STAGE_W, 12);

      // 第 5 站位（右侧抬高苔藓迷你蟹专属双层石台）
      const mPlatX = 502;
      const mPlatW = 126;
      const mPlatY = 232;
      ctx.fillStyle = light ? 'rgba(78,56,34,0.18)' : 'rgba(0,0,0,0.46)';
      ctx.fillRect(mPlatX - 6, mPlatY + 12, mPlatW + 10, 68);
      ctx.fillStyle = light ? '#e2d0b2' : '#312b3d';
      ctx.fillRect(mPlatX, mPlatY, mPlatW, 66);
      ctx.fillStyle = light ? '#79a878' : '#3a7d5c';
      ctx.fillRect(mPlatX, mPlatY, mPlatW, 4);
      ctx.fillStyle = light ? '#9d7f57' : '#181421';
      ctx.fillRect(mPlatX, mPlatY + 66, mPlatW, 10);
      ctx.fillStyle = light ? '#cfb791' : '#2a2436';
      ctx.fillRect(mPlatX - 12, mPlatY + 26, 12, 44);
      ctx.fillStyle = light ? '#9d7f57' : '#181421';
      ctx.fillRect(mPlatX - 12, mPlatY + 70, 12, 6);

      // 3c) 逐站位绘制地板光环/涟漪、单只主角像素精灵与体积聚光灯（零分身！）
      for (let i = 0; i < slotInfos.length; i++) {
        const info = slotInfos[i];
        const { sl, st, cnt, isHov, cheering, farewell, pose, sym, jumpPx, breath, blink, clipTick } = info;
        const floorY = sl.key === 'm' ? 276 : 292;

        // 顶梁聚光灯罩
        ctx.fillStyle = light ? '#5e4934' : '#283148';
        ctx.fillRect(sl.cx - 10, 14, 20, 6);
        ctx.fillStyle = st.light > 0.05 ? `rgba(${sl.rayB}, ${0.35 + st.light * 0.65})` : (light ? '#9c8a74' : '#1b2030');
        ctx.fillRect(sl.cx - 7, 20, 14, 4);

        // 地板柔边投影 + 阵营光环
        if (hasRad) {
          const sh = ctx.createRadialGradient(sl.cx, floorY + 2, 5, sl.cx, floorY + 2, 44);
          sh.addColorStop(0, light ? 'rgba(72,52,32,0.22)' : 'rgba(0,0,0,0.52)');
          sh.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = sh;
          ctx.fillRect(sl.cx - 46, floorY - 14, 92, 34);
        }
        if (st.light > 0.03 && hasRad) {
          const glowR = 36 + st.light * 20;
          const gl = ctx.createRadialGradient(sl.cx, floorY + 1, 2, sl.cx, floorY + 1, glowR);
          const aBase = light ? 0.28 : 0.44;
          gl.addColorStop(0, `rgba(${sl.rayB}, ${(aBase * st.light).toFixed(3)})`);
          gl.addColorStop(0.55, `rgba(${sl.rayA}, ${(aBase * 0.48 * st.light).toFixed(3)})`);
          gl.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.save();
          ctx.translate(sl.cx, floorY + 1);
          ctx.scale(1, 0.38);
          ctx.fillStyle = gl;
          ctx.fillRect(-glowR, -glowR, glowR * 2, glowR * 2);
          ctx.restore();
        }

        // 激活瞬间地板扩散双光环涟漪
        if (info.rippleProg > 0 && info.rippleProg < 1 && isFn(ctx.ellipse) && isFn(ctx.stroke)) {
          const rp = info.rippleProg;
          ctx.save();
          ctx.strokeStyle = `rgba(${sl.rayB}, ${((1 - rp) * 0.78).toFixed(3)})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(sl.cx, floorY + 1, 18 + rp * 42, 6 + rp * 15, 0, 0, Math.PI * 2);
          ctx.stroke();
          if (rp > 0.16) {
            const rp2 = (rp - 0.16) / 0.84;
            ctx.strokeStyle = `rgba(${sl.rayA}, ${((1 - rp2) * 0.45).toFixed(3)})`;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.ellipse(sl.cx, floorY + 1, 12 + rp2 * 32, 5 + rp2 * 11, 0, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.restore();
        }

        const shadeAlpha = cnt === 0 && !isHov && !farewell ? (light ? 0.56 : 0.46) : 1;
        ctx.save();
        if (shadeAlpha < 1) ctx.globalAlpha = shadeAlpha;

        if (sl.key !== 'm') {
          // 单只高清主角 (PX = 4)，无多只分身
          const mainPx = 4;
          const oxGrid = Math.round(sl.cx / mainPx) - 8;
          const oyGrid = Math.round((floorY + jumpPx) / mainPx) - 10;
          art.drawMainActor(ctx, sl.kind, pose, tickIdx + i, oxGrid, oyGrid, mainPx, {
            clipTick,
            sym,
            breath,
            blink,
            noShadow: true,
          });
        } else {
          // 站位 5：3 只迷你小蟹立于苔藓石台（pxSize = 2.5 -> 整格 2）
          const mPx = 2;
          const crabDefs = [
            { id: 'cowboy', dx: -26, dy: 0, phase: 0 },
            { id: 'shades', dx: 26, dy: 0, phase: 1 },
            { id: 'wizard', dx: 0, dy: cnt > 0 ? -16 : 2, phase: 2 },
          ];
          for (const cd of crabDefs) {
            const cJump = cheering
              ? -Math.round(Math.abs(Math.sin((info.cheerProg + cd.phase * 0.18) * Math.PI * 2)) * 12)
              : cnt > 0 && !reduced
                ? -Math.round(Math.max(0, Math.sin(now / 420 + cd.phase * 1.6)) * 3)
                : 0;
            const gx = Math.round((sl.cx + cd.dx) / mPx) - 8;
            const gy = Math.round((floorY + cd.dy + cJump) / mPx) - 8;
            art.drawMiniCrab(ctx, cd.id, cheering || isHov ? 'trick' : 'idle', gx, gy, mPx);
          }
          if (cnt === 0 && !isHov && !farewell) {
            ctx.fillStyle = light ? '#6d6258' : '#a8a194';
            const zy = floorY - 38 - ((tickIdx % 4) < 2 ? 0 : 2);
            ctx.fillRect(sl.cx + 14, zy, 6, 2);
            ctx.fillRect(sl.cx + 16, zy + 2, 2, 2);
            ctx.fillRect(sl.cx + 14, zy + 4, 6, 2);
          }
        }
        ctx.restore();

        // 体积感丁达尔聚光灯 + 上升星尘
        if (st.light > 0.03 && hasPoly) {
          ctx.save();
          if (!light) ctx.globalCompositeOperation = 'lighter';
          const coneTopW = 12;
          const coneBotW = 58;
          if (hasGrad) {
            const rayG = ctx.createLinearGradient(sl.cx, 22, sl.cx, floorY + 10);
            const topA = (light ? 0.24 : 0.36) * st.light;
            const midA = (light ? 0.11 : 0.17) * st.light;
            rayG.addColorStop(0, `rgba(${sl.rayB}, ${topA.toFixed(3)})`);
            rayG.addColorStop(0.55, `rgba(${sl.rayA}, ${midA.toFixed(3)})`);
            rayG.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = rayG;
          } else {
            ctx.fillStyle = `rgba(${sl.rayA}, ${(0.15 * st.light).toFixed(3)})`;
          }
          ctx.beginPath();
          ctx.moveTo(sl.cx - coneTopW, 22);
          ctx.lineTo(sl.cx + coneTopW, 22);
          ctx.lineTo(sl.cx + coneBotW, floorY + 10);
          ctx.lineTo(sl.cx - coneBotW, floorY + 10);
          ctx.closePath();
          ctx.fill();

          if (hasGrad) {
            const coreG = ctx.createLinearGradient(sl.cx, 22, sl.cx, floorY);
            coreG.addColorStop(0, `rgba(${sl.rayB}, ${((light ? 0.18 : 0.28) * st.light).toFixed(3)})`);
            coreG.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = coreG;
            ctx.beginPath();
            ctx.moveTo(sl.cx - 5, 22);
            ctx.lineTo(sl.cx + 5, 22);
            ctx.lineTo(sl.cx + 28, floorY + 2);
            ctx.lineTo(sl.cx - 28, floorY + 2);
            ctx.closePath();
            ctx.fill();
          }

          for (const mt of st.motes) {
            if (!reduced) mt.y -= mt.spd * (dt / 16);
            if (mt.y < 0) mt.y = 210;
            const prog = mt.y / 210;
            const mx = Math.round(sl.cx + mt.x * (0.28 + prog * 0.72) + Math.sin(now / 900 + mt.ph) * 4);
            const my = Math.round(32 + mt.y);
            const tw = 0.45 + 0.55 * Math.sin(now / 450 + mt.ph);
            ctx.fillStyle = `rgba(${sl.rayB}, ${(tw * st.light * (light ? 0.65 : 0.84)).toFixed(3)})`;
            ctx.fillRect(mx, my, 2, 2);
          }

          for (let bi = st.burst.length - 1; bi >= 0; bi--) {
            const b = st.burst[bi];
            b.t += dt / 750;
            if (b.t >= 1) { st.burst.splice(bi, 1); continue; }
            const bx = Math.round(sl.cx + b.dx * (0.7 + b.t * 1.2));
            const by = Math.round(floorY - 24 - b.t * 62 * b.vy);
            ctx.fillStyle = `rgba(${sl.rayB}, ${((1 - b.t) * 0.92).toFixed(3)})`;
            ctx.fillRect(bx, by, 2, 2);
          }
          ctx.restore();
        }
      }

      // 3d) 电影级暗角 (Vignette)
      if (hasRad) {
        const vig = ctx.createRadialGradient(STAGE_W / 2, STAGE_H * 0.52, STAGE_W * 0.28, STAGE_W / 2, STAGE_H * 0.52, STAGE_W * 0.64);
        vig.addColorStop(0, 'rgba(0,0,0,0)');
        vig.addColorStop(1, light ? 'rgba(92,68,42,0.16)' : 'rgba(5,7,14,0.58)');
        ctx.fillStyle = vig;
        ctx.fillRect(0, 0, STAGE_W, STAGE_H);
      }
    };

    const stopLoop = () => {
      if (rafId) {
        canAF(rafId);
        rafId = 0;
      }
    };

    const reclaimStageVram = () => {
      stopLoop();
      if (webglStage) {
        try { webglStage.dispose(); } catch {}
        webglStage = null;
      }
      canvas.width = 0;
      canvas.height = 0;
    };

    const stepLoop = (ts) => {
      rafId = 0;
      if (!isOpen || disposed || view.isConnected === false) {
        if (isOpen) closeStage();
        else reclaimStageVram();
        return;
      }
      if (doc.hidden) {
        reclaimStageVram();
        return;
      }
      drawStageFrame(ts || nowMs(), false);
      if (isOpen && !disposed && !doc.hidden && !isReducedMotion()) {
        rafId = reqAF(stepLoop);
      }
    };

    const onDocKeyDown = (ev) => {
      if (!isOpen) return;
      if (view.isConnected === false) { closeStage(); return; }
      if (ev?.key === 'Escape') {
        ev.preventDefault?.();
        ev.stopPropagation?.();
        closeStage();
      }
    };
    const onDocVisChange = () => {
      if (!isOpen) return;
      if (view.isConnected === false) { closeStage(); return; }
      if (doc.hidden) {
        reclaimStageVram();
      } else {
        drawStageFrame(nowMs(), true);
        if (!rafId && !isReducedMotion()) rafId = reqAF(stepLoop);
      }
    };

    let detachMo = null;
    const stopDetachObserver = () => {
      if (!detachMo) return;
      try { detachMo.disconnect(); } catch {}
      detachMo = null;
    };
    const startDetachObserver = () => {
      stopDetachObserver();
      const MO = win?.MutationObserver || (typeof MutationObserver === 'function' ? MutationObserver : null);
      const watchRoot = doc.body || sec.closest?.('[role="dialog"]')?.parentNode || sec.parentNode;
      if (!MO || !watchRoot) return;
      try {
        detachMo = new MO(() => {
          if (isOpen && view.isConnected === false) closeStage();
        });
        detachMo.observe(watchRoot, { childList: true, subtree: true });
      } catch {
        detachMo = null;
      }
    };

    const openStage = () => {
      if (disposed || isOpen) return;
      isOpen = true;
      for (const blk of getMainBlocks()) {
        if (!blk) continue;
        blk.hidden = true;
        sa(blk, 'hidden', '');
        if (blk.style) blk.style.display = 'none';
      }
      view.hidden = false;
      ra(view, 'hidden');
      if (view.style) view.style.display = 'flex';
      const r = readRoster();
      STAGE_SLOTS.forEach((sl, idx) => {
        slotStates[idx].light = slotCountOf(r, sl.key) > 0 ? 1 : 0;
        slotStates[idx].cheerUntil = 0;
        slotStates[idx].farewellUntil = 0;
      });
      syncStageControls();
      doc.addEventListener?.('keydown', onDocKeyDown, true);
      doc.addEventListener?.('visibilitychange', onDocVisChange);
      startDetachObserver();
      if (!doc.hidden) {
        drawStageFrame(nowMs(), true);
        if (!isReducedMotion()) rafId = reqAF(stepLoop);
      }
    };

    const closeStage = () => {
      if (!isOpen) return;
      isOpen = false;
      hoveredSlot = -1;
      ptrInside = false;
      stopDetachObserver();
      reclaimStageVram();
      doc.removeEventListener?.('keydown', onDocKeyDown, true);
      doc.removeEventListener?.('visibilitychange', onDocVisChange);
      view.hidden = true;
      sa(view, 'hidden', '');
      if (view.style) view.style.display = 'none';
      for (const blk of getMainBlocks()) {
        if (!blk) continue;
        blk.hidden = false;
        ra(blk, 'hidden');
        if (blk.style) blk.style.display = '';
      }
      if (sec.isConnected !== false) syncRoot();
    };

    const disposeStage = () => {
      if (disposed) return;
      closeStage();
      stopDetachObserver();
      disposed = true;
      unbindCanvasEvents(canvas);
      reclaimStageVram();
    };

    backBtn.addEventListener('click', (ev) => {
      ev?.stopPropagation?.();
      closeStage();
    });

    ap(foldBody, view);
    const api = {
      el: view,
      canvas,
      open: openStage,
      close: closeStage,
      dispose: disposeStage,
      sync: syncStageControls,
      isOpen: () => isOpen,
      getActiveRafId: () => rafId,
      getFrameCount: () => frameCount,
      getBackend: () => renderBackend,
      getWebGLStats: () => (webglStage ? webglStage.getStats() : null),
      getArtSource: () => lastArtSource || resolveMascotArt()?.source || 'ch9-fallback',
      getSlotStates: () => slotStates.map((s) => ({ key: s.key, light: s.light, cheering: s.cheerUntil > nowMs(), farewell: s.farewellUntil > nowMs() })),
      setPointer: (nx, ny, inside = true) => {
        ptrNormX = nx; ptrNormY = ny; ptrInside = Boolean(inside);
        webglStage?.setPointer?.(nx, ny, Boolean(inside));
      },
      hoverSlot: (idx) => { hoveredSlot = idx; if (isOpen) drawStageFrame(nowMs(), true); },
      clickSlot: (idx) => { if (isOpen) toggleStageSlot(idx); },
      renderNow: () => { if (isOpen) drawStageFrame(nowMs(), true); },
    };
    sec.__agMascotStageApi = api;
    return api;
  };

  const sanitizeKeyVal = (key, rawVal) => {
    if (!hasOwn(PRISM_SETTINGS_SCHEMA, key)) return { valid: false };
    const spec = PRISM_SETTINGS_SCHEMA[key];
    if (key === 'mascot') {
      if (typeof rawVal !== 'string') return { valid: false };
      const parsed = parseMascotSpec(rawVal);
      return parsed ? { valid: true, value: encodeMascotSpec(parsed) } : { valid: false };
    }
    let val = typeof rawVal === 'string' && spec.aliases && hasOwn(spec.aliases, rawVal) ? spec.aliases[rawVal] : rawVal;
    if (key === 'language' && val === 'auto') {
      const nav =
        typeof navigator !== 'undefined' && (navigator?.languages?.[0] || navigator?.language)
          ? navigator.languages?.[0] || navigator.language
          : '';
      const normFn = G.__agCsI18nCore?.normalizeLanguage || G.__agCsI18n?.normalizeLanguage;
      if (typeof normFn === 'function' && nav) {
        val = normFn(nav, 'en');
      } else {
        const low = String(nav || '').toLowerCase().replace(/_/g, '-');
        val = /^ja\b/.test(low)
          ? 'ja'
          : /^ko\b/.test(low)
            ? 'ko'
            : /^es\b/.test(low)
              ? 'es'
              : /^fr\b/.test(low)
                ? 'fr'
                : /^de\b/.test(low)
                  ? 'de'
                  : /^zh-(?:tw|hk|mo|hant)\b/.test(low)
                    ? 'zh-TW'
                    : /^zh\b/.test(low)
                      ? 'zh-CN'
                      : 'en';
      }
    }
    if ((key === 'periodicModelPicker' || key === 'omniModule' || key === 'sidebarStudio' || key === 'autoUpdate' || key === 'sidebarNavFold') && typeof val === 'boolean') val = val ? 'on' : 'off';
    if (key === 'convRipple' && typeof val === 'boolean') val = val ? 'medium' : 'off';
    if (typeof spec.default === 'string' && typeof val === 'number' && Number.isFinite(val)) val = String(val);
    return spec.allowed.includes(val) ? { valid: true, value: val } : { valid: false };
  };

  const buildSanitizedConfigExport = (currentSettings = {}, rawThoughtCfg = null, version = '1.2.4') => {
    const settings = {};
    for (const [k, spec] of O.entries(PRISM_SETTINGS_SCHEMA)) {
      if (k === 'language' && String(currentSettings[k] ?? '').trim().toLowerCase() === 'auto') {
        settings[k] = 'auto';
        continue;
      }
      const c = sanitizeKeyVal(k, currentSettings[k]);
      settings[k] = c.valid ? c.value : spec.default;
    }
    const out = { schema: 'obsidian-prism-config-v1', version: String(version || '1.2.4'), exportedAt: new Date().toISOString(), settings };
    const tSrc = isObj(rawThoughtCfg) && isObj(rawThoughtCfg.config) ? rawThoughtCfg.config : rawThoughtCfg;
    if (isObj(tSrc) && !isArr(tSrc) && !isFn(tSrc.then) && tSrc.ok !== false) {
      out.thought = {
        stylePreset: normThoughtStyle(tSrc.stylePreset) || 'technical',
        customPrompt: typeof tSrc.customPrompt === 'string' ? redactSecrets(tSrc.customPrompt.slice(0, 4000)) : '',
        activeProfileId: typeof tSrc.activeProfileId === 'string' ? tSrc.activeProfileId.slice(0, 64) : '',
        profiles: isArr(tSrc.profiles)
          ? tSrc.profiles
              .filter((p) => isObj(p) && !isArr(p))
              .slice(0, 16)
              .map((p, i) => ({
                id: String(p.id || `p-${i + 1}`).slice(0, 64),
                name: redactSecrets(String(p.name || '').slice(0, 80)),
                baseUrl: redactSecrets(String(p.baseUrl || '').slice(0, 260)),
                model: redactSecrets(String(p.model || '').slice(0, 120)),
              }))
          : [],
      };
    }
    return out;
  };

  const validateImportedConfigJson = (rawInput) => {
    let parsed = rawInput;
    if (typeof rawInput === 'string') {
      if (rawInput.length > 131072) return { ok: false, error: 'payload-too-large' };
      try {
        parsed = JSON.parse(rawInput);
      } catch {
        return { ok: false, error: 'invalid-json' };
      }
    }
    if (!isObj(parsed) || isArr(parsed)) return { ok: false, error: 'invalid-root' };
    const src = isObj(parsed.settings) && !isArr(parsed.settings) ? parsed.settings : parsed;
    const cleanPatch = {};
    for (const k of O.keys(src)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype' || /apikey|secret|token|password/i.test(k)) continue;
      const c = sanitizeKeyVal(k, src[k]);
      if (c.valid) cleanPatch[k] = c.value;
    }
    let cleanThought = null;
    if (isObj(parsed.thought) && !isArr(parsed.thought)) {
      const t = parsed.thought;
      const stylePreset = normThoughtStyle(t.stylePreset) || undefined;
      const customPrompt = typeof t.customPrompt === 'string' ? redactSecrets(t.customPrompt.slice(0, 4000)) : undefined;
      const profiles = isArr(t.profiles)
        ? t.profiles
            .filter((p) => isObj(p) && !isArr(p))
            .slice(0, 16)
            .map((p, i) => ({
              id: String(p.id || `p-${i + 1}`).slice(0, 64),
              name: redactSecrets(String(p.name || '').slice(0, 80)),
              baseUrl: /^https?:\/\//i.test(String(p.baseUrl || '').trim()) ? redactSecrets(String(p.baseUrl).trim().slice(0, 260)) : '',
              model: redactSecrets(String(p.model || '').slice(0, 120)),
              apiKey: '',
              keepExistingKey: true,
            }))
        : undefined;
      if (stylePreset !== undefined || customPrompt !== undefined || (profiles && profiles.length > 0)) {
        cleanThought = {
          ...(stylePreset !== undefined ? { stylePreset } : {}),
          ...(customPrompt !== undefined ? { customPrompt } : {}),
          ...(typeof t.activeProfileId === 'string' ? { activeProfileId: t.activeProfileId.slice(0, 64) } : {}),
          ...(profiles ? { profiles } : {}),
          keepExistingKey: true,
        };
      }
    }
    return O.keys(cleanPatch).length === 0 && !cleanThought ? { ok: false, error: 'no-valid-keys' } : { ok: true, settings: cleanPatch, thought: cleanThought };
  };

  const UPSTREAM_CREDITS = [
    ['0DNANCY/agy-claude-style', 'MIT · 0DNANCY'],
    ['ATtacK030130/antigrative-dashboard', 'MIT · AG Pulse'],
    ['LLYSH-HANNARI/antigravity-Codex-Claude-effort-slider', 'MIT · 月上寒'],
    ['yiheng8023/antigravity-chinese', 'MIT · yiheng8023'],
    ['Nwflower/dsh-claude-style', 'Inspiration'],
    ['Microqian2th/dsh-codex-effort-slider', 'Upstream'],
    ['mobius/dsh-performance-slider', 'Upstream'],
    ['claudenoshujin/claude-web', 'Mascot Pile & Micro-Ecology Interaction Inspiration'],
    ['wp3171216237/dsh-TUI', 'MIT · chimney (Deepy Whale Inspiration)'],
  ].map(([repo, meta]) => ({ repo, url: 'https://github.com/' + repo, meta }));

  const LICENSE_SUMMARY_TEXT = [
    'GNU General Public License v3.0 (GPL-3.0-only)',
    'Copyright (C) 2026 RMvdesi (https://github.com/RMvdesi/obsidian-prism)',
    '',
    'Obsidian Prism is free and open-source software licensed under GPL-3.0.',
    'Per GPL-3.0 Sections 4–7 and NOTICE, any modified version, fork, or derivative',
    'distribution MUST:',
    '  1. Remain open-source as a whole under GPL-3.0 with complete source code;',
    '  2. Preserve RMvdesi / Obsidian Prism copyright, NOTICE, and UI credits;',
    '  3. Clearly mark modifications and not misrepresent derived builds as official.',
    '',
    'Preserved Upstream Component Notices (MIT License — GPL-3.0 Compatible):',
    '  - Copyright (c) 2026 0DNANCY (agy-claude-style)',
    '  - Copyright (c) 2026 AG Pulse contributors (antigrative-dashboard)',
    '  - Copyright (c) 2026 月上寒 / LLYSH-HANNARI (antigravity-Codex-Claude-effort-slider)',
    '  - Copyright (c) 2026 Antigravity Chinese Localization Contributors (yiheng8023/antigravity-chinese)',
    '  - Copyright (c) 2026 chimney / @wp3171216237 (dsh-TUI / Deepy mascot reference)',
    '',
    'See LICENSE, NOTICE, CITATION.cff, and THIRD_PARTY_NOTICES.md in the repository.',
  ].join('\n');

  // Channel 9 内置 8 语种存储明细与归档工作台文案（0 B 进 Ch1，完整 8 语、无废弃 yue、未知语种回退 en）
  const STORAGE_WB_UI = O.freeze({
    'zh-CN': O.freeze({
      summary: '存储明细与无损归档工作台',
      oldMainBtn: '含 >14 天旧主对话',
      oldMainConfirmDesc:
        '确认后将生成独立的离线归档脚本（archive-old-main，不覆盖默认子代理脚本），除已结束子代理外还将移动超过 14 天且在最近 20 条之外的旧主对话（只移动不删除，随时可按批次无损还原）。请先退出 Antigravity 再运行脚本。',
      oldMainConfirmBtn: '确认生成旧主对话脚本',
      oldMainReadyTpl: '旧主对话归档脚本就绪（可归档 {0} 项 / {1}），退出 Antigravity 后运行：{2}',
      refreshBtn: '刷新',
      loading: '正在扫描存储明细…',
      batchSelectLabel: '选择还原批次：',
      restoreSelectedDescTpl: '将温和关闭 Antigravity，把所选批次（{0}）全部文件无损移回对话库并自动重启。',
      restoreScriptBtn: '生成离线还原脚本',
      restoreScriptReadyTpl: '还原脚本就绪（{0}），退出 Antigravity 后运行：{1}',
    }),
    'zh-TW': O.freeze({
      summary: '儲存明細與無損封存工作台',
      oldMainBtn: '含 >14 天舊主對話',
      oldMainConfirmDesc:
        '確認後將產生獨立的離線封存腳本（archive-old-main，不覆蓋預設子代理腳本），除已結束子代理外還會移動超過 14 天且在最近 20 筆之外的舊主對話（只移動不刪除，隨時可按批次無損還原）。請先退出 Antigravity 再執行腳本。',
      oldMainConfirmBtn: '確認產生舊主對話腳本',
      oldMainReadyTpl: '舊主對話封存腳本就緒（可封存 {0} 項 / {1}），退出 Antigravity 後執行：{2}',
      refreshBtn: '重新整理',
      loading: '正在掃描儲存明細…',
      batchSelectLabel: '選擇還原批次：',
      restoreSelectedDescTpl: '將溫和關閉 Antigravity，把所選批次（{0}）全部檔案無損移回對話庫並自動重啟。',
      restoreScriptBtn: '產生離線還原腳本',
      restoreScriptReadyTpl: '還原腳本就緒（{0}），退出 Antigravity 後執行：{1}',
    }),
    en: O.freeze({
      summary: 'Storage Details & Lossless Archive Workbench',
      oldMainBtn: 'Include >14d Main',
      oldMainConfirmDesc:
        'This writes a separate offline script (archive-old-main, leaving the default subagent script intact) that moves finished subagents plus main chats older than 14 days outside the latest 20 (move-only, zero deletion, restorable per batch). Quit Antigravity before running it.',
      oldMainConfirmBtn: 'Confirm Old-Main Script',
      oldMainReadyTpl: 'Old-main archive script ready ({0} items / {1}). Quit Antigravity & run: {2}',
      refreshBtn: 'Refresh',
      loading: 'Scanning storage details…',
      batchSelectLabel: 'Archive batch:',
      restoreSelectedDescTpl: 'Will close Antigravity gracefully, restore the selected batch ({0}) losslessly, and relaunch.',
      restoreScriptBtn: 'Offline Restore Script',
      restoreScriptReadyTpl: 'Restore script ready ({0}). Quit Antigravity & run: {1}',
    }),
    ja: O.freeze({
      summary: 'ストレージ詳細・無損失アーカイブ管理',
      oldMainBtn: '>14日前の主会話も含む',
      oldMainConfirmDesc:
        '専用のオフラインスクリプト（archive-old-main、既定のサブエージェント用スクリプトは上書きしません）を生成します。完了済みサブエージェントに加え、最新20件を除く14日超の主会話を削除せず移動します（バッチ別復元可）。Antigravity 終了後に実行してください。',
      oldMainConfirmBtn: '旧主会話スクリプトを生成',
      oldMainReadyTpl: '旧主会話アーカイブスクリプト準備完了（{0} 件 / {1}）。Antigravity 終了後に実行：{2}',
      refreshBtn: '更新',
      loading: 'ストレージ詳細をスキャン中…',
      batchSelectLabel: '復元バッチ：',
      restoreSelectedDescTpl: 'Antigravity を安全終了し、選択したバッチ（{0}）を無損失で復元して再起動します。',
      restoreScriptBtn: 'オフライン復元スクリプト',
      restoreScriptReadyTpl: '復元スクリプト準備完了（{0}）。Antigravity 終了後に実行：{1}',
    }),
    ko: O.freeze({
      summary: '저장소 상세 및 무손실 아카이브 작업대',
      oldMainBtn: '14일 초과 기본 대화 포함',
      oldMainConfirmDesc:
        '별도의 오프라인 스크립트(archive-old-main, 기본 서브에이전트 스크립트를 덮어쓰지 않음)를 생성합니다. 종료된 서브에이전트와 함께 최근 20개를 제외한 14일 초과 기본 대화를 삭제 없이 이동합니다(배치별 무손실 복원 가능). Antigravity 종료 후 실행하세요.',
      oldMainConfirmBtn: '이전 기본 대화 스크립트 생성',
      oldMainReadyTpl: '이전 기본 대화 스크립트 준비됨 ({0}건 / {1}). Antigravity 종료 후 실행: {2}',
      refreshBtn: '새로고침',
      loading: '저장소 상세 정보 스캔 중…',
      batchSelectLabel: '복원할 배치:',
      restoreSelectedDescTpl: 'Antigravity를 정상 종료하고 선택한 배치({0})를 무손실 복원한 뒤 자동 재시작합니다.',
      restoreScriptBtn: '오프라인 복원 스크립트',
      restoreScriptReadyTpl: '복원 스크립트 준비됨 ({0}). Antigravity 종료 후 실행: {1}',
    }),
    es: O.freeze({
      summary: 'Detalles de almacenamiento y archivo sin pérdida',
      oldMainBtn: 'Incluir chats >14 d',
      oldMainConfirmDesc:
        'Genera un script sin conexión independiente (archive-old-main, sin sobrescribir el script predeterminado de subagentes) para mover subagentes finalizados y chats principales de más de 14 días fuera de los 20 más recientes (solo mover, sin borrar y restaurable por lote). Cierra Antigravity antes de ejecutarlo.',
      oldMainConfirmBtn: 'Confirmar script (>14 d)',
      oldMainReadyTpl: 'Script para chats >14 d listo ({0} elem. / {1}). Cierra Antigravity y ejecuta: {2}',
      refreshBtn: 'Actualizar',
      loading: 'Escaneando detalles de almacenamiento…',
      batchSelectLabel: 'Lote a restaurar:',
      restoreSelectedDescTpl: 'Cerrará Antigravity de forma segura, restaurará el lote seleccionado ({0}) sin pérdidas y reiniciará.',
      restoreScriptBtn: 'Script de restauración',
      restoreScriptReadyTpl: 'Script de restauración listo ({0}). Cierra Antigravity y ejecuta: {1}',
    }),
    fr: O.freeze({
      summary: 'Détails de stockage et archivage sans perte',
      oldMainBtn: 'Inclure chats >14 j',
      oldMainConfirmDesc:
        'Génère un script hors ligne distinct (archive-old-main, sans écraser le script sous-agents par défaut) qui déplace les sous-agents terminés ainsi que les discussions principales de plus de 14 jours hors des 20 plus récentes (déplacement seul, sans suppression, restaurable par lot). Fermez Antigravity avant exécution.',
      oldMainConfirmBtn: 'Confirmer le script (>14 j)',
      oldMainReadyTpl: 'Script chats >14 j prêt ({0} élém. / {1}). Fermez Antigravity puis exécutez : {2}',
      refreshBtn: 'Actualiser',
      loading: 'Analyse des détails de stockage…',
      batchSelectLabel: 'Lot à restaurer :',
      restoreSelectedDescTpl: 'Fermera Antigravity proprement, restaurera le lot sélectionné ({0}) sans perte puis redémarrera.',
      restoreScriptBtn: 'Script de restauration',
      restoreScriptReadyTpl: 'Script de restauration prêt ({0}). Fermez Antigravity puis exécutez : {1}',
    }),
    de: O.freeze({
      summary: 'Speicherdetails & verlustfreie Archiv-Werkbank',
      oldMainBtn: 'Hauptchats >14 T. einschließen',
      oldMainConfirmDesc:
        'Erstellt ein separates Offline-Skript (archive-old-main, überschreibt nicht das Standard-Subagenten-Skript), das beendete Subagenten sowie Hauptchats älter als 14 Tage außerhalb der letzten 20 verschiebt (kein Löschen, stapelweise wiederherstellbar). Vor dem Ausführen Antigravity schließen.',
      oldMainConfirmBtn: 'Skript (>14 T.) erstellen',
      oldMainReadyTpl: 'Archivskript >14 T. bereit ({0} Einträge / {1}). Antigravity schließen & ausführen: {2}',
      refreshBtn: 'Aktualisieren',
      loading: 'Speicherdetails werden gescannt…',
      batchSelectLabel: 'Archivstapel:',
      restoreSelectedDescTpl: 'Beendet Antigravity sauber, stellt den ausgewählten Stapel ({0}) verlustfrei wieder her und startet neu.',
      restoreScriptBtn: 'Offline-Wiederherstellungsskript',
      restoreScriptReadyTpl: 'Wiederherstellungsskript bereit ({0}). Antigravity schließen & ausführen: {1}',
    }),
  });

  const getStorageWbUi = (lang) => {
    const s = String(lang || '').trim().toLowerCase().replace(/_/g, '-');
    if (s === 'zh-tw' || s === 'zh-hk' || s === 'zh-mo' || s.startsWith('zh-hant')) return STORAGE_WB_UI['zh-TW'];
    if (s === 'zh' || s === 'zh-cn' || s === 'zh-sg' || s.startsWith('zh-hans') || s === 'yue' || s.startsWith('yue-')) return STORAGE_WB_UI['zh-CN'];
    if (s === 'ja' || s.startsWith('ja-')) return STORAGE_WB_UI.ja;
    if (s === 'ko' || s.startsWith('ko-')) return STORAGE_WB_UI.ko;
    if (s === 'es' || s.startsWith('es-')) return STORAGE_WB_UI.es;
    if (s === 'fr' || s.startsWith('fr-')) return STORAGE_WB_UI.fr;
    if (s === 'de' || s.startsWith('de-')) return STORAGE_WB_UI.de;
    return STORAGE_WB_UI.en;
  };

  let pendingCfgToast = null;

  const invokePrismRepoAction = (action, ver, extra) => {
    const act = [
      'pull',
      'storage-health',
      'storage-detail',
      'prepare-archive',
      'prepare-restore',
      'archive-and-restart',
      'restore-archive',
      'storage-snooze',
      'storage-auto-exit',
      'gomemlimit-status',
      'gomemlimit-set',
      'gomemlimit-clear',
      'uninstall',
      'update-status',
      'check-update',
      'apply-update',
    ].includes(action)
      ? action
      : 'status';
    const vObj = isObj(ver);
    const ext = vObj ? { ...ver, ...(isObj(extra) ? extra : null) } : isObj(extra) ? extra : null;
    try {
      const b = getWin()?.__agPrismRepoBridge, arg = ext ? { ...ext, action: act } : { action: act };
      if (isFn(b)) return Promise.resolve(b(arg));
      if (isFn(b?.[act])) return Promise.resolve(b[act](ext || extra));
      if (isFn(b?.call)) return Promise.resolve(b.call(arg));
    } catch (err) {
      return Promise.resolve({ ok: false, action: act, error: String(err?.message || err) });
    }
    return Promise.resolve({ ok: false, offline: true, action: act, noRemote: true, hasRemote: false, branch: 'local', shortHash: vObj ? ver.version : ver });
  };

  const readStore = (k) => {
    try { return typeof localStorage !== 'undefined' && localStorage ? localStorage.getItem(k) || '' : ''; } catch { return ''; }
  };
  const writeStore = (k, v) => {
    try { if (typeof localStorage !== 'undefined' && localStorage) localStorage.setItem(k, v); } catch {}
  };

  const renderObsidianPrismBrandSvg = (size = 20) => {
    try {
      const ext = G.__agPrismBrandLogoSvg || getWin()?.__agPrismBrandLogoSvg;
      const out = isFn(ext) ? ext(size) : ext;
      if (typeof out === 'string' && out.includes('<svg')) return out;
    } catch {}
    return '';
  };

  const mountOrSyncSettingsSection = (ctx) => {
    const {
      version,
      getLang,
      uiText,
      isZh,
      i18nCore,
      formatSettingsSummary,
      resolveSettingRowActiveValue,
      isSettingButtonMatch,
      saveSetting,
      saveSettingsBatch,
      getThoughtTranslateMode,
      handledGroupClicks,
      runSettingsGroupGlide,
      runGuardedMut,
    } = ctx;

    const doc = typeof document !== 'undefined' ? document : null;
    if (!doc) return;
    const syncChrome = G.__agPrismHostEnhancer?.syncSettingsDialogChrome;
    if (isFn(syncChrome)) syncChrome(doc, runGuardedMut);
    const lang = getLang();
    const ui = uiText(lang);
    const targetTitles = ['Appearance', '外观', '外觀', '外観', '외관', '모양', 'Apariencia', 'Apparence', 'Darstellung', 'Erscheinungsbild'];
    let panel = null;
    for (const h2 of doc.querySelectorAll('[role="dialog"] h2')) {
      if (targetTitles.includes((h2.textContent || '').trim())) {
        panel = h2.closest('div.p-6') || h2.parentElement?.parentElement;
        if (panel) break;
      }
    }
    if (!panel) return;
    if (!isFn(syncChrome)) {
      const dlg = panel.closest?.('[role="dialog"]');
      if (dlg && dlg.getAttribute?.('data-ag-cs-settings-dlg') !== '1') {
        runGuardedMut(() => dlg.setAttribute?.('data-ag-cs-settings-dlg', '1'));
      }
    }

    const effVal = (k, l) => {
      const v = isFn(resolveSettingRowActiveValue) ? resolveSettingRowActiveValue(k, l) : undefined;
      if (k === 'mascot' && v !== undefined && v !== null && v !== '') {
        const p = parseMascotSpec(v);
        return p ? encodeMascotSpec(p) : PRISM_SETTINGS_SCHEMA.mascot.default;
      }
      if (k === 'convRipple') {
        if (v === true || v === 'true' || v === 'on') return 'medium';
        if (v === false || v === 'false') return 'off';
      }
      return v !== undefined && v !== null && v !== '' ? v : PRISM_SETTINGS_SCHEMA[k]?.default;
    };
    const matchBtn = (k, valJson, cur) => {
      if (isFn(isSettingButtonMatch)) {
        const r = isSettingButtonMatch(k, valJson, cur);
        if (r === true) return true;
        if (cur !== undefined && cur !== null) return false;
      }
      try { return JSON.parse(valJson) === cur; } catch { return String(valJson) === String(cur); }
    };
    const applyBatch = (patch) => {
      if (!isObj(patch)) return;
      if (isFn(saveSettingsBatch)) saveSettingsBatch(patch);
      else if (isFn(saveSetting)) for (const [k, v] of O.entries(patch)) saveSetting(k, v);
    };
    const K_IC = 'isConnected', K_TC = 'textContent', K_CL = 'classList', K_WP = 'prism-wallpaper-slot', K_SG = 'prism-suggester-slot';
    const sa = (e, k, v = '') => e.setAttribute(k, String(v));
    const ga = (e, k) => e.getAttribute(k);
    const ra = (e, k) => e.removeAttribute(k);
    const qs = (e, s) => e.querySelector(s);
    const qa = (e, s) => e.querySelectorAll(s);
    const rc = (e) => (isFn(e?.getBoundingClientRect) ? e.getBoundingClientRect() : null);
    const ap = (p, ...cs) => {
      for (const c of cs) if (c) p.appendChild(c);
      return p;
    };
    const on = (e, ev, fn) => e.addEventListener(ev, fn);
    const onClk = (e, fn) => on(e, 'click', (ev) => { ev?.stopPropagation?.(); fn(ev); });

    const SCHEMA_KEYS = O.keys(PRISM_SETTINGS_SCHEMA);
    const isSwitchValOn = (v) => v === true || v === 'on';
    const syncRootState = (rootEl, l, u) => {
      const sumEl = qs(rootEl, '[data-ag-cs-fold-summary]');
      const ns = formatSettingsSummary(l, u);
      if (sumEl && sumEl[K_TC] !== ns) sumEl[K_TC] = ns;
      if (ga(rootEl, 'data-body-built') !== '1') return;
      if (typeof rootEl.__prismMountThoughtUi === 'function') {
        try { rootEl.__prismMountThoughtUi(); } catch {}
      }

      const de = doc.documentElement;
      const themeAttr = de?.getAttribute?.('data-ag-cs-theme') || '';
      const isLightTheme =
        themeAttr === 'light' ||
        (!themeAttr && (Boolean(de?.[K_CL]?.contains?.('light')) || Boolean(doc.body?.[K_CL]?.contains?.('light'))));
      const hiState = de?.getAttribute?.('data-ag-prism-host-i18n') || '';
      const tmMode = getThoughtTranslateMode();
      const thLive = rootEl.__prismThoughtUiHandle;
      const hasThUi = Boolean(thLive && thLive.box?.[K_IC]);
      const wpSlotEl = qs(rootEl, `[data-testid="${K_WP}"]`);
      const sgSlotEl = qs(rootEl, `[data-testid="${K_SG}"]`);
      const hasWpUi = Boolean(wpSlotEl?.__agPrismWpUiHandle?.root && wpSlotEl.__agPrismWpUiHandle.root.parentNode === wpSlotEl);
      const hasSgUi = Boolean(sgSlotEl?.__agPrismSgUiHandle?.root && sgSlotEl.__agPrismSgUiHandle.root.parentNode === sgSlotEl);
      const hasWpFn = isFn(G.__prismMountWallpaperUi);
      const hasSgFn = isFn(G.__prismMountSuggesterUi);
      const sigParts = [l, isLightTheme ? 1 : 0, hiState, tmMode, hasThUi ? 1 : 0, hasWpFn ? 1 : 0, hasWpUi ? 1 : 0, hasSgFn ? 1 : 0, hasSgUi ? 1 : 0, ns];
      for (const k of SCHEMA_KEYS) sigParts.push(effVal(k, l));
      const nextSig = sigParts.join('\x1f');
      if (rootEl.__lastSyncSig === nextSig) return;
      rootEl.__lastSyncSig = nextSig;

      const betaLangChanged = rootEl.__lastBetaLang !== l;
      rootEl.__lastBetaLang = l;
      if (!hasWpUi || betaLangChanged) { try { rootEl.__prismMountWp?.(l); } catch {} }
      if (!hasSgUi || betaLangChanged) { try { rootEl.__prismMountSg?.(l); } catch {} }
      try { rootEl.__prismSyncEffortPreview?.(l); } catch {}

      const dirtyBtns = [];
      qa(rootEl, 'button[data-ag-cs-key]').forEach((btn) => {
        const k = ga(btn, 'data-ag-cs-key');
        const cur = effVal(k, l);
        const act = Boolean(matchBtn(k, ga(btn, 'data-ag-cs-val'), cur));
        if (btn.__agOn !== act || ga(btn, 'aria-pressed') !== String(act)) dirtyBtns.push([btn, act, cur]);
      });
      const dirtyPresets = [];
      qa(rootEl, 'button[data-ag-cs-preset]').forEach((pBtn) => {
        const spec = SCENE_PRESETS[ga(pBtn, 'data-ag-cs-preset')];
        if (!spec) return;
        const m = O.entries(spec).every(([k, ex]) => effVal(k, l) === ex);
        if (pBtn.__agAct !== m || ga(pBtn, 'data-active') !== (m ? '1' : '0')) dirtyPresets.push([pBtn, m]);
      });
      for (const [btn, act, cur] of dirtyBtns) {
        btn.__agOn = act;
        sa(btn, 'aria-pressed', act);
        if (act) sa(btn, 'data-pressed');
        else ra(btn, 'data-pressed');
        const grp = btn.parentElement;
        if (grp && ga(grp, 'data-ui-kind') === 'switch') {
          btn.tabIndex = act ? -1 : 0;
          sa(btn, 'tabindex', act ? '-1' : '0');
          const swOn = isSwitchValOn(cur) ? '1' : '0';
          if (ga(grp, 'data-switch-on') !== swOn) sa(grp, 'data-switch-on', swOn);
        }
      }
      const autoExitOn = effVal('autoArchiveOnExit', l) === true;
      qa(rootEl, 'button[data-ag-cs-auto-archive-exit]').forEach((btn) => {
        const isOnBtn = ga(btn, 'data-ag-cs-auto-archive-exit') === 'on';
        const act = isOnBtn === autoExitOn;
        sa(btn, 'aria-pressed', act);
        if (act) sa(btn, 'data-active', '1');
        else ra(btn, 'data-active');
      });
      for (const [pBtn, m] of dirtyPresets) {
        pBtn.__agAct = m;
        sa(pBtn, 'data-active', m ? '1' : '0');
        sa(pBtn, 'aria-pressed', m);
      }
      const th = hasThUi ? thLive : null;
      if (th?.onLanguageChanged && th.__agLang !== l) {
        th.onLanguageChanged(l);
        th.__agLang = l;
      }
      if (th?.onViewSwitched) th.onViewSwitched(effVal('thoughtView', l));
      if (th?.onModeSwitched) {
        th.onModeSwitched(tmMode);
      } else {
        const tb = qs(rootEl, '[data-testid="prism-thought-ai-config"]');
        if (tb) tb.hidden = tmMode !== 'ai';
      }
      const isMotionOff = effVal('motionLevel', l) === 'off';
      for (const [dk, dim] of [
        ['placeholderStyle', effVal('composerRestyle', l) === false],
        ['sidebarCompact', effVal('sidebarRestyle', l) === false],
        ['sidebarNavFold', effVal('sidebarRestyle', l) === false],
        ['thoughtTrigger', tmMode === 'off'],
        ['thoughtView', tmMode === 'off'],
        ['homeRipple', isMotionOff || effVal('homeLayout', l) === 'off'],
        ['convRipple', isMotionOff],
        ['effortSliderStyle', effVal('effortSliderModule', l) === 'off'],
        ['linkTarget', effVal('omniModule', l) === 'off'],
        ['darkAura', effVal('ambientIntensity', l) === '0'],
        ['darkAuraStyle', effVal('ambientIntensity', l) === '0'],
      ]) {
        const dr = qs(rootEl, `[data-ag-cs-row="${dk}"]`);
        if (!dr) continue;
        if (dr.style) dr.style.opacity = dim ? '0.55' : '';
        if (dim) sa(dr, 'data-ag-cs-dimmed', '1'); else ra(dr, 'data-ag-cs-dimmed');
      }
      const lpDescEl = qs(rootEl, '[data-ag-cs-row="lightPreset"] [data-k="d"]');
      if (lpDescEl) {
        const curPal = effVal('palette', l);
        let lpText = u.setLightPresetDesc || '';
        if (!isLightTheme && u.lightPresetHintDark) lpText = u.lightPresetHintDark;
        else if (isLightTheme && curPal === 'warm' && u.lightPresetHintWarm) lpText = u.lightPresetHintWarm;
        else if (isLightTheme && curPal === 'host' && u.lightPresetHintHost) lpText = u.lightPresetHintHost;
        if (lpDescEl[K_TC] !== lpText) lpDescEl[K_TC] = lpText;
      }
      const daDescEl = qs(rootEl, '[data-ag-cs-row="darkAura"] [data-k="d"]');
      if (daDescEl) {
        const daText = isLightTheme && u.darkAuraHintLight ? u.darkAuraHintLight : u.setDarkAuraDesc || '';
        if (daDescEl[K_TC] !== daText) daDescEl[K_TC] = daText;
      }
      const dasDescEl = qs(rootEl, '[data-ag-cs-row="darkAuraStyle"] [data-k="d"]');
      if (dasDescEl) {
        const dasText = isLightTheme && u.darkAuraHintLight ? u.darkAuraHintLight : u.setDarkAuraStyleDesc || '';
        if (dasDescEl[K_TC] !== dasText) dasDescEl[K_TC] = dasText;
      }
      const mRosterEl = qs(rootEl, '[data-ag-mascot-roster="1"]');
      if (mRosterEl) {
        const mCur = effVal('mascot', l);
        const r = parseMascotSpec(mCur) || { c: 1, k: 1, d: 0, w: 0, minis: false };
        const total = r.c + r.k + r.d + r.w;
        sa(mRosterEl, 'data-mascot-val', encodeMascotSpec(r));
        const rCntEl = qs(mRosterEl, '[data-ag-mascot-summary-count]');
        if (rCntEl) {
          const ct = String(u.mascotRosterCount || 'Main {n}/4').replace('{n}', String(total));
          if (rCntEl[K_TC] !== ct) rCntEl[K_TC] = ct;
          sa(rCntEl, 'data-total', total);
        }
        const openLblEl = qs(mRosterEl, '[data-ag-mascot-stage-open-label]');
        if (openLblEl) {
          const ol = u.mascotStageOpenBtn || 'Open Casting Stage';
          if (openLblEl[K_TC] !== ol) openLblEl[K_TC] = ol;
        }
        const chipsEl = qs(mRosterEl, '[data-ag-mascot-summary-chips]');
        if (chipsEl) {
          const spInfo = [
            ['c', '#d97757', u.mascotSpeciesCrab || 'Claude Crab', r.c],
            ['k', '#947fd6', u.mascotSpeciesCat || 'Gemini Cat', r.k],
            ['d', '#d7dfef', u.mascotSpeciesDragon || 'GPT Dragon', r.d],
            ['w', '#4e6fff', u.mascotSpeciesWhale || 'DeepSeek Whale', r.w],
          ].filter((x) => x[3] > 0);
          const chipSig = `${spInfo.map((x) => x[0] + x[3]).join(',')}|${r.minis ? 1 : 0}|${l}`;
          if (chipsEl.__agChipSig !== chipSig) {
            chipsEl.__agChipSig = chipSig;
            while (chipsEl.firstChild) chipsEl.removeChild(chipsEl.firstChild);
            if (!spInfo.length && !r.minis) {
              const restTag = doc.createElement('span');
              restTag[K_TC] = u.mascotStagePresetOff || 'All Resting';
              if (restTag.style) O.assign(restTag.style, { fontSize: '11px', opacity: '0.68' });
              ap(chipsEl, restTag);
            } else {
              for (const [sp, col, nm, cnt] of spInfo) {
                const chip = doc.createElement('span');
                sa(chip, 'data-ag-summary-sp', sp);
                if (chip.style) {
                  O.assign(chip.style, {
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '1px 6px',
                    borderRadius: '999px',
                    fontSize: '10.5px',
                    border: '1px solid var(--ag-cs-border, rgba(148,163,184,0.24))',
                    background: 'var(--ag-cs-surface, rgba(148,163,184,0.06))',
                  });
                }
                const dot = doc.createElement('span');
                sa(dot, 'aria-hidden', 'true');
                if (dot.style) {
                  O.assign(dot.style, {
                    width: '6px',
                    height: '6px',
                    borderRadius: '2px',
                    background: col,
                    flexShrink: '0',
                  });
                }
                const txt = doc.createElement('span');
                txt[K_TC] = nm;
                ap(chip, dot, txt);
                ap(chipsEl, chip);
              }
              if (r.minis) {
                const mChip = doc.createElement('span');
                sa(mChip, 'data-ag-summary-sp', 'm');
                mChip[K_TC] = u.mascotRosterMinis || '+3 Mini Crabs';
                if (mChip.style) {
                  O.assign(mChip.style, {
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '1px 6px',
                    borderRadius: '999px',
                    fontSize: '10.5px',
                    border: '1px solid rgba(251,146,60,0.45)',
                    background: 'rgba(251,146,60,0.12)',
                  });
                }
                ap(chipsEl, mChip);
              }
            }
          }
        }
      }
      if (rootEl.__agMascotStageApi) {
        try {
          rootEl.__agMascotStageApi.sync();
          if (rootEl.__agMascotStageApi.isOpen()) rootEl.__agMascotStageApi.renderNow();
        } catch {}
      }
      const hiRow = qs(rootEl, '[data-ag-cs-row="hostLocalization"]');
      const hiDescEl = hiRow ? qs(hiRow, '[data-k="d"]') : null;
      if (hiDescEl) {
        const hiModeNow = effVal('hostLocalization', l);
        const hiDisabledNow = hiModeNow === 'off' || (hiModeNow === 'auto' && l !== 'zh-CN');
        let extZhActive = false;
        if (hiDisabledNow) {
          try {
            const winRef = doc.defaultView || globalThis;
            if (
              winRef?.__antigravityZhInstalled ||
              winRef?.__AGY_HANS__ ||
              qs(doc, '[data-agy-hans-ui], #agy-theme-switcher, #antigravity-translation-audit')
            ) {
              extZhActive = true;
            } else {
              for (const hn of qa(doc, '[data-testid="new-conversation-button"], [role="dialog"] h1, [role="dialog"] h2, [data-ag-cs-settings-dlg="1"] [data-ag-cs-settings-nav="1"]')) {
                if (hn && !hn.closest?.('#' + SETTINGS_SEC_ID) && /[\u4e00-\u9fff]/.test(String(hn.textContent || ''))) {
                  extZhActive = true;
                  break;
                }
              }
            }
          } catch {}
        }
        const isOffEnforced = hiState === 'off-enforced';
        const isOffBlocked = hiState === 'off-blocked';
        const hiWarn =
          hiModeNow === 'auto' && hiState === 'yielded' && u.hostI18nYieldHint
            ? '1'
            : !isOffBlocked && hiDisabledNow && extZhActive && u.hostI18nOffExtHint
              ? 'ext'
              : '';
        const hiText =
          hiWarn === '1'
            ? u.hostI18nYieldHint
            : hiWarn === 'ext'
              ? u.hostI18nOffExtHint
              : (u.setHostI18nDesc || '');
        if (hiDescEl[K_TC] !== hiText) hiDescEl[K_TC] = hiText;
        if (hiWarn) sa(hiDescEl, 'data-ag-cs-hi-warn', hiWarn);
        else ra(hiDescEl, 'data-ag-cs-hi-warn');

        const titleLine = qs(hiRow, '.ag-cs-settings-title-line');
        let hiBadge = titleLine ? qs(titleLine, '[data-ag-cs-hi-badge="1"]') : null;
        if (isOffEnforced && titleLine) {
          if (!hiBadge) {
            hiBadge = doc.createElement('span');
            hiBadge.className = 'ag-cs-repo-chip';
            sa(hiBadge, 'data-ag-cs-hi-badge', '1');
            sa(hiBadge, 'data-status', 'ok');
            ap(titleLine, hiBadge);
          }
          const badgeTxt = u.hostLocStatusEnforced || 'Enforcing native English UI';
          if (hiBadge[K_TC] !== badgeTxt) hiBadge[K_TC] = badgeTxt;
          hiBadge.hidden = false;
          ra(hiBadge, 'hidden');
        } else if (hiBadge) {
          hiBadge.hidden = true;
          sa(hiBadge, 'hidden');
        }

        const textCol = hiDescEl.parentElement;
        let hiBlockedBar = textCol ? qs(textCol, '[data-ag-cs-hi-blocked="1"]') : null;
        if (isOffBlocked && textCol) {
          if (!hiBlockedBar) {
            hiBlockedBar = doc.createElement('div');
            hiBlockedBar.className = 'ag-cs-beta-notice';
            if (hiBlockedBar.style) hiBlockedBar.style.marginTop = '4px';
            sa(hiBlockedBar, 'data-ag-cs-hi-blocked', '1');
            ap(textCol, hiBlockedBar);
          }
          const blkTxt = u.hostLocStatusBlocked || 'External localization override blocked by loop guard.';
          if (hiBlockedBar[K_TC] !== blkTxt) hiBlockedBar[K_TC] = blkTxt;
          hiBlockedBar.hidden = false;
          ra(hiBlockedBar, 'hidden');
        } else if (hiBlockedBar) {
          hiBlockedBar.hidden = true;
          sa(hiBlockedBar, 'hidden');
        }
      }
    };

    runGuardedMut(() => {
      const hasMainCss = !!doc.getElementById?.('ag-prism-css');
      const ensureSettingsStyle = (forceInject) => {
        if (!doc.head) return;
        try {
          const cssText = hasMainCss ? SETTINGS_CH9_CSS : `${SETTINGS_FALLBACK_CSS}\n${SETTINGS_CH9_CSS}`;
          let stEl = doc.getElementById?.(SETTINGS_STYLE_ID);
          if (!stEl) {
            if (!forceInject && hasMainCss) return;
            stEl = doc.createElement('style');
            stEl.id = SETTINGS_STYLE_ID;
            stEl[K_TC] = cssText;
            ap(doc.head, stEl);
          } else if (stEl[K_TC] !== cssText) {
            stEl[K_TC] = cssText;
          }
        } catch {}
      };
      ensureSettingsStyle(false);

      const existing = doc.getElementById(SETTINGS_SEC_ID);
      if (existing) {
        if (qs(panel, '#' + SETTINGS_SEC_ID) === existing && ga(existing, 'data-ag-cs-lang') === lang) {
          syncRootState(existing, lang, ui);
          return;
        }
        try { qs(existing, `[data-testid="${K_WP}"]`)?.__agPrismWpUiHandle?.destroy?.(); } catch {}
        try { qs(existing, `[data-testid="${K_SG}"]`)?.__agPrismSgUiHandle?.destroy?.(); } catch {}
        try { existing.__agMascotStageApi?.dispose?.(); } catch {}
        try { existing.__prismDestroyEffortPreview?.(); } catch {}
        existing.remove();
      }

      const sections = Array.from(qa(panel, 'div.space-y-2')).filter(
        (s) => !s.id.startsWith('ag-cs-') && !(s.parentElement && s.parentElement.closest('div.space-y-2'))
      );
      const anchor = sections[sections.length - 1];
      if (!anchor || !anchor.parentElement) return;

      const BTN = 'ag-cs-seg-btn data-[pressed]:bg-secondary data-[pressed]:text-foreground';
      const CARD_CLS = 'ag-cs-settings-card divide-y';

      const initOpen = ['1', 'true'].includes(readStore(STORAGE_SETTINGS_OPEN_KEY));
      const savedTab = readStore(STORAGE_SETTINGS_SUBTAB_KEY);
      let activeSubTab = ['appearance', 'interaction', 'thought', 'modules', 'beta', 'about', 'all'].includes(savedTab) ? savedTab : 'appearance';

      const sec = doc.createElement('div');
      sec.id = SETTINGS_SEC_ID;
      sec.className = initOpen ? 'space-y-2 is-open' : 'space-y-2';
      for (const [k, v] of [
        ['data-ag-no-i18n', ''],
        ['translate', 'no'],
        ['data-no-translate', 'true'],
        ['data-ag-localization-skip', 'true'],
        ['data-agy-no-translate', 'true'],
        ['data-antigravity-zh-skip', '1'],
        ['data-ag-cs-lang', lang],
        ['data-open', initOpen ? '1' : '0'],
        ['data-ag-cs-open', initOpen ? '1' : '0'],
      ]) {
        sa(sec, k, v);
      }

      const mkEl = (tag, cls, txt) => {
        const el = doc.createElement(tag);
        if (cls) el.className = cls;
        if (txt !== undefined) el[K_TC] = txt;
        return el;
      };
      const mkB = (cls, txt, attr, v = '1') => {
        const b = mkEl('button', cls, txt);
        b.type = 'button';
        if (attr) sa(b, attr, v);
        return b;
      };
      const setVis = (el, vis) => {
        el.hidden = !vis;
        if (vis) ra(el, 'hidden');
        else sa(el, 'hidden');
      };
      const fmtTpl = (tpl, args) => String(tpl || '').replace(/\{(\d)\}/g, (_, k) => String(args[k] ?? ''));

      const foldSummaryEl = mkEl('span', 'ag-cs-settings-fold-summary', formatSettingsSummary(lang, ui));
      sa(foldSummaryEl, 'data-ag-cs-fold-summary');

      const foldHead = mkB('ag-cs-settings-fold-head', undefined, 'data-ag-cs-fold-toggle');
      sa(foldHead, 'aria-expanded', initOpen);
      sa(foldHead, 'aria-label', initOpen ? ui.foldCollapseHint || 'Collapse' : ui.foldExpandHint || 'Expand');

      const foldLeft = mkEl('span', 'ag-cs-settings-fold-left');
      const brandMark = mkEl('span', 'ag-cs-settings-brand-mark');
      sa(brandMark, 'aria-hidden', 'true');
      brandMark.innerHTML = renderObsidianPrismBrandSvg(20);
      const brandTitle = ui.sectionTitle && /Obsidian Prism/i.test(ui.sectionTitle) ? ui.sectionTitle : 'Obsidian Prism';
      const updBadge = mkEl('span', 'ag-cs-update-badge', '');
      sa(updBadge, 'data-ag-cs-update-badge', '1');
      setVis(updBadge, false);
      ap(foldLeft, brandMark, mkEl('h3', '', brandTitle), mkEl('span', 'ag-cs-settings-ver', `v${version}`), updBadge);

      const chevron = mkEl('span', 'ag-cs-settings-fold-chevron');
      sa(chevron, 'data-ag-cs-chevron');
      sa(chevron, 'aria-hidden', 'true');
      chevron.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg>';
      const foldRight = ap(mkEl('span', 'ag-cs-settings-fold-right'), foldSummaryEl, chevron);
      ap(foldHead, foldLeft, foldRight);

      const foldBody = mkEl('div', initOpen ? 'ag-cs-settings-fold-body is-open' : 'ag-cs-settings-fold-body');
      sa(foldBody, 'data-open', initOpen ? '1' : '0');
      sa(foldBody, 'aria-hidden', !initOpen);
      ap(sec, foldHead, foldBody);

      let foldBodyBuilt = false;
      let cachedUpdStatus = null;
      let applyUpdateViewRef = null;
      let probeRepoRef = null;
      let thoughtListEl = null;
      let thoughtUiHandle = null;
      let wpSlot = null;
      let sgSlot = null;

      const getThoughtUiHandle = () => {
        const live = sec.__prismThoughtUiHandle || thoughtUiHandle;
        if (live && live.box?.[K_IC]) {
          thoughtUiHandle = live;
          return live;
        }
        return null;
      };

      const mountThoughtUiIfReady = () => {
        const curUi = getWin()?.__agPrismThoughtSettingsUi || G.__agPrismThoughtSettingsUi;
        const hasFactory = isFn(curUi?.createThoughtAiConfigBox);
        if (thoughtUiHandle && !thoughtUiHandle.box?.[K_IC]) {
          thoughtUiHandle = null;
          if (sec.__prismThoughtUiHandle && !sec.__prismThoughtUiHandle.box?.[K_IC]) {
            sec.__prismThoughtUiHandle = null;
          }
          if (!hasFactory) return null;
        }
        if (thoughtUiHandle && thoughtUiHandle.box?.[K_IC]) {
          sec.__prismThoughtUiHandle = thoughtUiHandle;
          return thoughtUiHandle;
        }
        const hostList = thoughtListEl?.[K_IC] ? thoughtListEl : qs(sec, '[data-ag-cs-group="thought"] .ag-cs-settings-card');
        if (!hostList?.[K_IC] || !hasFactory) {
          if (!hasFactory) {
            thoughtUiHandle = null;
            sec.__prismThoughtUiHandle = null;
          }
          return null;
        }
        thoughtListEl = hostList;
        const curLang = getLang();
        const curUiText = uiText(curLang) || ui;
        const curMode = getThoughtTranslateMode();
        const handle = curUi.createThoughtAiConfigBox({
          mkEl,
          btnClass: BTN,
          ui: curUiText,
          lang: curLang,
          getLang,
          isZh,
          getMode: getThoughtTranslateMode,
          runGuardedMut,
        });
        if (!handle || !handle.box) return null;
        runGuardedMut(() => {
          qa(hostList, '[data-testid="prism-thought-ai-config"],[data-testid="prism-thought-general-config"]').forEach((oldBox) => oldBox.remove());
          ap(hostList, handle.box);
        });
        handle.__agLang = curLang;
        thoughtUiHandle = handle;
        sec.__prismThoughtUiHandle = handle;
        try {
          handle.onLanguageChanged?.(curLang);
          handle.onViewSwitched?.(effVal('thoughtView', curLang));
          handle.onModeSwitched?.(curMode);
        } catch {}
        return handle;
      };
      sec.__prismMountThoughtUi = mountThoughtUiIfReady;
      sec.__prismMountWp = (l) => {
        const f = G.__prismMountWallpaperUi;
        if (!wpSlot || !f) return;
        f(wpSlot, { lang: l || getLang(), getLang, runGuardedMut });
      };
      sec.__prismMountSg = (l) => {
        const f = G.__prismMountSuggesterUi;
        if (!sgSlot || !f) return;
        setVis(sgSlot, true);
        f(sgSlot, { lang: l || getLang(), getLang, runGuardedMut, btnClass: BTN });
      };

      const syncFoldBadgeOnly = (st) => {
        if (!updBadge[K_IC] || !st || st.offline || st.timeout) return;
        runGuardedMut(() => {
          if (st.hasUpdate && !st.applied && !st.hotReloaded && !st.hotReloadExpected) {
            updBadge[K_TC] = `v${st.latestVersion || ''}`;
            setVis(updBadge, true);
          } else {
            setVis(updBadge, false);
          }
        });
      };

      const ensureFoldBodyBuilt = () => {
        if (foldBodyBuilt) return;
        foldBodyBuilt = true;
        ensureSettingsStyle(true);
        sa(sec, 'data-body-built', '1');

        runGuardedMut(() => {
          const langOpts = (
            i18nCore?.LANG_OPTIONS || [
              { id: 'zh-CN', label: '简体中文' },
              { id: 'zh-TW', label: '繁體中文' },
              { id: 'en', label: 'English' },
              { id: 'ja', label: '日本語' },
              { id: 'ko', label: '한국어' },
              { id: 'es', label: 'Español' },
              { id: 'fr', label: 'Français' },
              { id: 'de', label: 'Deutsch' },
            ]
          ).map((o) => [o.id, o.label]);

          const U = (k, d = '') => ui[k] || d;
          const onOff = [[true, U('onLabel', 'On')], [false, U('offLabel', 'Off')]];
          const autoOnOff = [['auto', U('optAutoCoexist', 'Auto')], ['on', U('onLabel', 'On')], ['off', U('offLabel', 'Off')]];
          const onOffStr = autoOnOff.slice(1);
          const warmLbl = ui.optWarm || (ui.optClaude && !/claude/i.test(ui.optClaude) ? ui.optClaude : '') || 'Alabaster';
          const R = (key, tk, dk, opts) => ({ key, title: U(tk, key), desc: U(dk), opts });
          const RS = (key, opts, s = key[0].toUpperCase() + key.slice(1)) => R(key, 'set' + s + 'Title', 'set' + s + 'Desc', opts);

          const rowDefs = {};
          for (const r of [
            RS('palette', [['host', U('optHost')], ['warm', warmLbl], ['obsidian', U('optObsidian')]]),
            RS('lightPreset', [['crystal', U('optLightCrystal')], ['alabaster', U('optLightAlabaster')]]),
            RS('accentTone', [['follow', U('optToneFollow')], ['cobalt', U('optToneCobalt')], ['iris', U('optToneIris')], ['amber', U('optToneAmber')], ['mono', U('optToneMono')]]),
            RS('cornerStyle', [['sharp', U('optCornerSharp')], ['balanced', U('optCornerBalanced')], ['soft', U('optCornerSoft')]]),
            RS('ambientIntensity', [['0', U('optAmb0', '0%')], ['35', U('optAmb35', '35%')], ['70', U('optAmb70', '70%')], ['100', U('optAmb100', '100%')]]),
            RS('motionLevel', [['off', U('optMotionOff')], ['subtle', U('optMotionSubtle')], ['standard', U('optMotionStandard')], ['ultra', U('optMotionUltra')]]),
            RS('targetFps', [['60', U('optFps60', '60')], ['120', U('optFps120', '120')], ['180', U('optFps180', '180')], ['native', U('optFpsNative')]]),
            RS('homeLayout', [['studio', U('optStudio')], ['classic', U('optClassic')], ['off', U('optNativeOff')]]),
            RS('homeRipple', onOff, 'Ripple'),
            RS('convRipple', [
              ['off', U('optConvRippleOff', U('offLabel', 'Off'))],
              ['subtle', U('optConvRippleSubtle', 'Subtle')],
              ['medium', U('optConvRippleMedium', 'Medium')],
              ['full', U('optConvRippleFull', 'Full')],
            ]),
            RS('logoInk', [['accent', U('optAccent')], ['foreground', U('optForeground')]]),
            RS('language', langOpts),
            RS('hostLocalization', [['auto', U('optHostI18nAuto', 'Auto')], ['on', U('optHostI18nOn', U('onLabel', 'On'))], ['off', U('optHostI18nOff', U('offLabel', 'Off'))]], 'HostI18n'),
            RS('composerRestyle', onOff, 'Composer'),
            RS('placeholderStyle', [['studio', 'Studio'], ['host', U('optPlaceholderHost')]], 'Placeholder'),
            RS('smoothCaret', onOff),
            RS('scrollBottomMotion', [['smooth', U('optScrollBottomSmooth', 'Glide')], ['instant', U('optScrollBottomInstant', 'Instant')]], 'ScrollBottom'),
            R('contextMenu', 'rowContextMenuTitle', 'rowContextMenuDesc', onOff),
            RS('codeFont', [['default', U('optFontDefault')], ['jetbrains', 'JetBrains Mono'], ['cascadia', 'Cascadia Code'], ['sfmono', U('optFontSfmono', 'SF Mono')]]),
            RS('codeLigatures', onOff),
            RS('mascot', [
              ['crab', U('optMascotCrab', 'Dual')],
              ['quad', U('optMascotQuad', 'Quad')],
              ['quad-minis', U('optMascotQuadMinis', 'Quad + Crabs')],
              ['off', U('optMascotOff', U('offLabel', 'Off'))],
            ]),
            RS('sidebarRestyle', onOff, 'Sidebar'),
            RS('sidebarCompact', onOff),
            R('sidebarNavFold', 'setSidebarNavFoldLabel', 'setSidebarNavFoldDesc', [['off', U('optSidebarNavFoldOff', 'Show All')], ['on', U('optSidebarNavFoldOn', 'Fold Extra')]]),
            RS('thoughtTranslate', [['off', U('optThoughtOff')], ['machine', U('optThoughtMachine')], ['ai', U('optThoughtAi')]], 'ThoughtMode'),
            RS('thoughtTrigger', [['preload', U('optTriggerPreload')], ['expand', U('optTriggerExpand')]]),
            RS('thoughtView', [['immersive', U('optThoughtImmersive')], ['bilingual', U('optThoughtBilingual')]]),
            RS('telemetryModule', autoOnOff, 'Telemetry'),
            RS('effortSliderModule', autoOnOff, 'EffortSlider'),
            RS('effortSliderStyle', [
              ['classic', U('optEffortStyleClassic', 'Classic')],
              ['prism', U('optEffortStylePrism', 'Prism Beam')],
              ['ferrofluid', U('optEffortStyleFerrofluid', 'Ferrofluid')],
              ['orbital', U('optEffortStyleOrbital', 'Gravity Well')],
              ['oscilloscope', U('optEffortStyleOscilloscope', 'Oscilloscope')],
              ['plasma', U('optEffortStylePlasma', 'Plasma Arc')],
              ['supernova', U('optEffortStyleSupernova', 'Supernova')],
              ['swarm', U('optEffortStyleSwarm', 'Firefly Swarm')],
            ], 'EffortStyle'),
            RS('effortMemory', onOffStr, 'EffortMemory'),
            RS('periodicModelPicker', onOffStr, 'PeriodicPicker'),
            RS('omniModule', onOffStr, 'Omni'),
            RS('linkTarget', [['builtin', U('optLinkBuiltin')], ['external', U('optLinkExternal')]]),
            RS('sidebarStudio', onOffStr),
            RS('autoUpdate', onOffStr),
            RS('updateChannel', [['stable', U('optChannelStable', 'Stable')], ['beta', U('optChannelBeta', 'Beta')]]),
            R('darkAuraStyle', 'setDarkAuraStyleLabel', 'setDarkAuraStyleDesc', [
              ['prism', U('optDarkAuraPrism', 'Polar Silk')],
              ['neon', U('optDarkAuraNeon', 'Abyssal Glow')],
            ]),
            R('darkAura', 'setDarkAuraLabel', 'setDarkAuraDesc', [
              ['subtle', U('optDarkAuraSubtle', 'Subtle')],
              ['balanced', U('optDarkAuraBalanced', 'Balanced')],
              ['vivid', U('optDarkAuraVivid', 'Vivid')],
            ]),
          ]) rowDefs[r.key] = r;

          const groups = [
            { id: 'appearance', title: U('grpAppearance'), keys: ['palette', 'lightPreset', 'darkAuraStyle', 'accentTone', 'cornerStyle', 'ambientIntensity', 'darkAura', 'motionLevel', 'targetFps', 'homeLayout', 'homeRipple', 'convRipple', 'logoInk', 'language', 'hostLocalization'] },
            { id: 'interaction', title: U('grpInteraction'), keys: ['composerRestyle', 'placeholderStyle', 'smoothCaret', 'scrollBottomMotion', 'contextMenu', 'codeFont', 'codeLigatures', 'mascot', 'sidebarRestyle', 'sidebarCompact', 'sidebarNavFold'] },
            { id: 'thought', title: U('grpThought'), keys: ['thoughtTranslate', 'thoughtTrigger', 'thoughtView'] },
            { id: 'modules', title: U('groupModules'), keys: ['telemetryModule', 'effortSliderModule', 'effortSliderStyle', 'effortMemory', 'omniModule', 'linkTarget'] },
            { id: 'beta', title: U('grpBeta'), keys: ['sidebarStudio'] },
          ];

          const buildRow = (r) => {
            const row = mkEl('div');
            sa(row, 'data-ag-cs-row', r.key);
            const tSpan = mkEl('span', '', r.title);
            sa(tSpan, 'data-k', 't');
            const dSpan = mkEl('span', 'whitespace-pre-wrap', r.desc);
            sa(dSpan, 'data-k', 'd');
            const textCol = ap(mkEl('div', 'flex-1'), ap(mkEl('div', 'ag-cs-settings-title-line'), tSpan), dSpan);

            const group = mkEl('div', 'ag-cs-seg-group');
            sa(group, 'role', 'group');
            const curVal = effVal(r.key, lang);
            const isSwitch =
              r.key !== 'sidebarNavFold' &&
              r.opts.length === 2 &&
              ((r.opts[0][0] === true && r.opts[1][0] === false) || (r.opts[0][0] === 'on' && r.opts[1][0] === 'off'));
            if (isSwitch) {
              sa(group, 'data-ui-kind', 'switch');
              sa(group, 'data-switch-on', isSwitchValOn(curVal) ? '1' : '0');
              const thumb = mkEl('span', 'ag-cs-switch-thumb');
              sa(thumb, 'aria-hidden', 'true');
              ap(group, thumb);
            }
            for (const [val, lbl] of r.opts) {
              const valJson = JSON.stringify(val);
              const isTone = r.key === 'accentTone';
              const b = mkB(BTN, isTone ? undefined : lbl, 'data-ag-cs-key', r.key);
              if (isTone) {
                const dot = mkEl('span', 'ag-cs-tone-dot');
                sa(dot, 'data-tone', val);
                sa(dot, 'aria-hidden', 'true');
                ap(b, dot, mkEl('span', '', lbl));
              }
              sa(b, 'data-ag-cs-val', valJson);
              const act = Boolean(matchBtn(r.key, valJson, curVal));
              b.__agOn = act;
              sa(b, 'aria-pressed', act);
              if (act) sa(b, 'data-pressed');
              if (isSwitch) {
                b.tabIndex = act ? -1 : 0;
                sa(b, 'tabindex', act ? '-1' : '0');
              }
              on(b, 'click', (ev) => {
                if (ev && typeof ev === 'object' && handledGroupClicks) handledGroupClicks.add(ev);
                const prevBtn = Array.from(group.children).find((s) => s.tagName === 'BUTTON' && (ga(s, 'aria-pressed') === 'true' || s.hasAttribute('data-pressed')));
                if (prevBtn === b && matchBtn(r.key, valJson, effVal(r.key, getLang()))) return;
                // Read-then-Write: 在任何 DOM 写入与 saveSetting 之前仅读取当前行的 prevBtn 与 b，其余 29 行 0 次回流！
                const needGlide = !isSwitch && !!(prevBtn && prevBtn !== b && typeof runSettingsGroupGlide === 'function');
                const prevRect = needGlide ? rc(prevBtn) : null;
                const nextRect = needGlide ? rc(b) : null;
                let nextFocusBtn = null;
                for (const sib of group.children) {
                  if (sib.tagName !== 'BUTTON') continue;
                  const isCur = sib === b;
                  sib.__agOn = isCur;
                  sa(sib, 'aria-pressed', isCur);
                  if (isCur) sa(sib, 'data-pressed');
                  else ra(sib, 'data-pressed');
                  if (isSwitch) {
                    sib.tabIndex = isCur ? -1 : 0;
                    sa(sib, 'tabindex', isCur ? '-1' : '0');
                    if (!isCur) nextFocusBtn = sib;
                  }
                }
                if (isSwitch) {
                  sa(group, 'data-switch-on', isSwitchValOn(val) ? '1' : '0');
                  if (nextFocusBtn && (doc.activeElement === b || ev?.detail === 0)) {
                    try { nextFocusBtn.focus?.(); } catch {}
                  }
                }
                saveSetting(r.key, val);
                if (r.key === 'thoughtTranslate') {
                  mountThoughtUiIfReady();
                  getThoughtUiHandle()?.onModeSwitched?.(val);
                }
                if (r.key === 'thoughtView') getThoughtUiHandle()?.onViewSwitched?.(val);
                if (r.key === 'updateChannel' && applyUpdateViewRef) {
                  void invokePrismRepoAction('update-status', { version, channel: val }).then((st) => st && applyUpdateViewRef(st)).catch(() => {});
                }
                const lNow = getLang();
                syncRootState(sec, lNow, uiText(lNow));
                if (needGlide) runSettingsGroupGlide(group, prevBtn, b, prevRect, nextRect);
              });
              ap(group, b);
            }
            ap(row, ap(mkEl('div', 'py-2'), textCol, ap(mkEl('div', 'shrink-0'), group)));
            if (r.key === 'mascot') {
              const rosterBox = mkEl('div', 'ag-cs-mascot-roster');
              sa(rosterBox, 'data-ag-mascot-roster', '1');
              if (rosterBox.style) {
                O.assign(rosterBox.style, {
                  margin: '2px 0 10px',
                  padding: '8px 10px',
                  borderRadius: '10px',
                  border: '1px solid var(--ag-cs-border, rgba(148,163,184,0.22))',
                  background: 'var(--ag-cs-surface-2, rgba(148,163,184,0.06))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                  flexWrap: 'wrap',
                });
              }
              const leftMeta = mkEl('div');
              if (leftMeta.style) O.assign(leftMeta.style, { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', flex: '1 1 200px', minWidth: '0' });
              const countBadge = mkEl('span', '', String(U('mascotRosterCount', 'Main {n}/4')).replace('{n}', '2'));
              sa(countBadge, 'data-ag-mascot-summary-count', '1');
              if (countBadge.style) O.assign(countBadge.style, { fontSize: '11px', fontWeight: '600', fontVariantNumeric: 'tabular-nums', opacity: '0.82' });
              const chipsWrap = mkEl('div');
              sa(chipsWrap, 'data-ag-mascot-summary-chips', '1');
              if (chipsWrap.style) O.assign(chipsWrap.style, { display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' });
              ap(leftMeta, countBadge, chipsWrap);

              const openStageBtn = mkB(BTN, undefined, 'data-ag-mascot-stage-open', '1');
              if (openStageBtn.style) {
                O.assign(openStageBtn.style, {
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 11px',
                  borderRadius: '8px',
                  fontSize: '11.5px',
                  fontWeight: '600',
                  border: '1px solid var(--ag-cs-accent, rgba(96,165,250,0.55))',
                  background: 'color-mix(in srgb, var(--ag-cs-accent, #60a5fa) 14%, transparent)',
                  cursor: 'pointer',
                  flexShrink: '0',
                });
              }
              const iconWrap = mkEl('span');
              sa(iconWrap, 'aria-hidden', 'true');
              if (iconWrap.style) O.assign(iconWrap.style, { display: 'inline-flex', alignItems: 'center', lineHeight: '0' });
              iconWrap.innerHTML = SPOTLIGHT_ICON_SVG;
              const openLbl = mkEl('span', '', U('mascotStageOpenBtn', 'Open Casting Stage'));
              sa(openLbl, 'data-ag-mascot-stage-open-label', '1');
              ap(openStageBtn, iconWrap, openLbl);
              onClk(openStageBtn, (ev) => {
                if (ev && typeof ev === 'object' && handledGroupClicks) handledGroupClicks.add(ev);
                sec.__agMascotStageApi?.open?.();
              });
              ap(rosterBox, leftMeta, openStageBtn);
              ap(row, rosterBox);
            }
            if (r.key === 'effortSliderStyle') {
              const pBox = mkEl('div', 'ag-cs-effort-preview');
              sa(pBox, 'data-testid', 'prism-effort-style-preview');
              const pHead = mkEl('div', 'ag-cs-ep-head');
              const pStyleLbl = mkEl('span', 'ag-cs-ep-style');
              const pTierLbl = mkEl('span', 'ag-cs-ep-tier', 'High');
              ap(pHead, pStyleLbl, pTierLbl);

              const pTrk = mkEl('div', 'ag-cs-ep-track');
              const pCv = mkEl('canvas', 'ag-cs-ep-cv');
              pCv.width = 320;
              pCv.height = 34;
              const pClassic = mkEl('div', 'ag-cs-ep-classic');
              const pFill = mkEl('div', 'ag-cs-ep-fill');
              const pKnob = mkEl('div', 'ag-cs-ep-knob');
              ap(pClassic, pFill, pKnob);
              ap(pTrk, pCv, pClassic);

              const pTiers = mkEl('div', 'ag-cs-ep-tiers');
              const epLabels = ['Low', 'Medium', 'High', 'Extra'];
              const epColors = ['#7dd3fc', '#60a5fa', '#a855f7', '#f59e0b'];
              let epTier = 2, epPos = 2 / 3, epTgt = 2 / 3, epVel = 0, epHover = null, epRaf = 0, epLast = 0, epDrag = false, epCtx = null;
              const tierBtns = epLabels.map((lbl, idx) => {
                const tb = mkB('ag-cs-ep-btn', lbl);
                on(tb, 'click', (ev) => {
                  ev?.stopPropagation?.();
                  epTier = idx;
                  epTgt = idx / 3;
                  syncPreview();
                });
                ap(pTiers, tb);
                return tb;
              });

              const styleNames = new Map(r.opts);
              const paintPreviewFrame = (nowMs) => {
                const lCur = getLang();
                const curSt = epHover || effVal('effortSliderStyle', lCur) || 'classic';
                const isClassic = curSt === 'classic';
                pStyleLbl[K_TC] = styleNames.get(curSt) || curSt;
                pTierLbl[K_TC] = epLabels[epTier];
                if (pTierLbl.style) pTierLbl.style.color = epColors[epTier];
                tierBtns.forEach((tb, idx) => sa(tb, 'data-active', idx === epTier ? '1' : '0'));

                if (pClassic.style) pClassic.style.display = isClassic ? 'block' : 'none';
                if (pCv.style) pCv.style.display = isClassic ? 'none' : 'block';
                const pct = Math.max(0, Math.min(1, epPos));
                if (isClassic) {
                  const pctStr = `${(10 + pct * 80).toFixed(1)}%`;
                  if (pFill.style) pFill.style.width = pctStr;
                  if (pKnob.style) pKnob.style.left = pctStr;
                } else {
                  const w = pTrk.clientWidth || 320, h = pTrk.clientHeight || 34;
                  const win = getWin();
                  const dpr = Math.max(1, Math.min(2, Number(win?.devicePixelRatio) || 1));
                  const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
                  if (pCv.width !== bw) pCv.width = bw;
                  if (pCv.height !== bh) pCv.height = bh;
                  const ctx = epCtx || (typeof pCv.getContext === 'function' ? (epCtx = pCv.getContext('2d')) : null);
                  const paintFn = win?.AntigravityCodexEffortSlider?.paintFxSlider || G.AntigravityCodexEffortSlider?.paintFxSlider;
                  if (ctx && typeof ctx.beginPath === 'function' && typeof paintFn === 'function') {
                    ctx.setTransform?.(dpr, 0, 0, dpr, 0, 0);
                    paintFn(ctx, curSt, w, h, pct, epVel, 4, effVal('effortSliderModule', lCur) === 'off', (nowMs || Date.now()) * 0.001, effVal('accentTone', lCur) || 'follow');
                  }
                }
              };

              const shouldAnimate = () => {
                const win = getWin();
                if (!pBox[K_IC] || ga(sec, 'data-open') !== '1' || doc.hidden) return false;
                if (typeof pBox.closest === 'function' && pBox.closest('[hidden]')) return false;
                const lCur = getLang();
                const curSt = epHover || effVal('effortSliderStyle', lCur) || 'classic';
                if (effVal('effortSliderModule', lCur) === 'off') return false;
                if (effVal('motionLevel', lCur) === 'off') return Math.abs(epTgt - epPos) > 0.002;
                return curSt !== 'classic' || Math.abs(epTgt - epPos) > 0.002;
              };

              const stopPreviewRaf = () => {
                const win = getWin();
                if (epRaf && typeof win?.cancelAnimationFrame === 'function') win.cancelAnimationFrame(epRaf);
                epRaf = 0;
                epLast = 0;
              };

              const stepPreview = (now) => {
                epRaf = 0;
                if (!pBox[K_IC]) return;
                const dt = epLast > 0 ? Math.min(0.05, Math.max(0.001, (now - epLast) / 1000)) : 0.016;
                epLast = now;
                if (!epDrag) {
                  const diff = epTgt - epPos;
                  epVel = (epVel + diff * 180 * dt) * Math.exp(-12 * dt);
                  epPos += epVel * dt;
                  if (Math.abs(diff) < 0.002 && Math.abs(epVel) < 0.005) { epPos = epTgt; epVel = 0; }
                }
                paintPreviewFrame(now);
                if (shouldAnimate()) {
                  const win = getWin();
                  if (typeof win?.requestAnimationFrame === 'function') epRaf = win.requestAnimationFrame(stepPreview);
                }
              };

              const syncPreview = () => {
                const perf = getWin()?.performance || G.performance;
                paintPreviewFrame(typeof perf?.now === 'function' ? perf.now() : Date.now());
                const win = getWin();
                if (shouldAnimate() && !epRaf && typeof win?.requestAnimationFrame === 'function') {
                  epRaf = win.requestAnimationFrame(stepPreview);
                } else if (!shouldAnimate()) {
                  stopPreviewRaf();
                }
              };

              const setFromX = (clientX) => {
                const rct = rc(pTrk);
                const left = rct?.left || 0, w = rct?.width || 320;
                const curSt = epHover || effVal('effortSliderStyle', getLang()) || 'classic';
                const u = curSt === 'orbital'
                  ? Math.max(0, Math.min(1, (clientX - left - 48) / Math.max(20, w - 62)))
                  : Math.max(0, Math.min(1, (clientX - left - 16) / Math.max(20, w - 32)));
                epVel = (u - epPos) * 14;
                epPos = u;
                epTgt = u;
                epTier = Math.round(u * 3);
                syncPreview();
              };

              on(pTrk, 'pointerdown', (ev) => {
                ev?.stopPropagation?.();
                epDrag = true;
                try { pTrk.setPointerCapture?.(ev.pointerId); } catch {}
                setFromX(ev.clientX || 0);
              });
              on(pTrk, 'pointermove', (ev) => { if (epDrag) setFromX(ev.clientX || 0); });
              const endTrkDrag = () => {
                if (!epDrag) return;
                epDrag = false;
                epTier = Math.round(epPos * 3);
                epTgt = epTier / 3;
                syncPreview();
              };
              on(pTrk, 'pointerup', endTrkDrag);
              on(pTrk, 'pointercancel', endTrkDrag);

              for (const segBtn of group.children) {
                if (segBtn.tagName !== 'BUTTON') continue;
                on(segBtn, 'pointerenter', () => {
                  try { epHover = JSON.parse(ga(segBtn, 'data-ag-cs-val')); } catch {}
                  syncPreview();
                });
              }
              on(group, 'pointerleave', () => {
                if (epHover !== null) { epHover = null; syncPreview(); }
              });

              sec.__prismSyncEffortPreview = syncPreview;
              sec.__prismDestroyEffortPreview = stopPreviewRaf;
              ap(pBox, pHead, pTrk, pTiers);
              ap(row, pBox);
            }
            return row;
          };

          const topDeck = mkEl('div', 'ag-cs-settings-topdeck');
          sa(topDeck, 'data-ag-cs-topdeck', '1');
          const presetPills = mkEl('div', 'ag-cs-preset-pills');
          for (const [pid, plbl] of [['ultra', U('presetUltra', 'Full Optical')], ['focus', U('presetFocus', 'Deep Focus')], ['eco', U('presetEco', 'Silent Eco')]]) {
            const pb = mkB('ag-cs-preset-btn', plbl, 'data-ag-cs-preset', pid);
            onClk(pb, () => {
              applyBatch({ ...SCENE_PRESETS[pid] });
              const lNow = getLang();
              runGuardedMut(() => syncRootState(sec, lNow, uiText(lNow)));
            });
            ap(presetPills, pb);
          }
          ap(topDeck, ap(mkEl('div', 'ag-cs-preset-row'), mkEl('span', 'ag-cs-preset-label', U('presetBarLabel', 'Scene Presets')), presetPills));

          const subTabBar = mkEl('div', 'ag-cs-subtabs');
          sa(subTabBar, 'role', 'tablist');
          const subTabBtns = [];
          const groupElsById = new Map();
          const applySubTab = (sid) => {
            activeSubTab = sid;
            writeStore(STORAGE_SETTINGS_SUBTAB_KEY, sid);
            for (const sb of subTabBtns) sa(sb, 'aria-selected', ga(sb, 'data-ag-cs-subtab') === sid);
            for (const [gid, gel] of groupElsById.entries()) setVis(gel, sid === 'all' || sid === gid);
            if (sid === 'beta' || sid === 'all') try { sec.__prismMountSg?.(); } catch {}
            try { sec.__prismSyncEffortPreview?.(); } catch {}
          };
          for (const [sid, slbl] of [
            ['appearance', U('subTabAppearance', 'Appearance')],
            ['interaction', U('subTabInteraction', 'Workspace')],
            ['thought', U('subTabThought', 'Thought')],
            ['modules', U('subTabModules', 'Modules')],
            ['beta', U('subTabBeta', 'Beta')],
            ['about', U('subTabAbout', 'Config & About')],
            ['all', U('subTabAll', 'All')],
          ]) {
            const sb = mkB('ag-cs-subtab-btn', slbl, 'data-ag-cs-subtab', sid);
            sa(sb, 'role', 'tab');
            sa(sb, 'aria-selected', activeSubTab === sid);
            onClk(sb, () => runGuardedMut(() => applySubTab(sid)));
            subTabBtns.push(sb);
            ap(subTabBar, sb);
          }
          const fileInput = mkEl('input');
          fileInput.type = 'file';
          sa(fileInput, 'accept', '.json,application/json');
          setVis(fileInput, false);
          ap(topDeck, subTabBar, fileInput);
          ap(foldBody, topDeck);

          const groupsWrap = mkEl('div', 'ag-cs-settings-groups');
          for (const grp of groups) {
            const grpEl = mkEl('div', 'ag-cs-settings-group');
            sa(grpEl, 'data-ag-cs-group', grp.id);
            groupElsById.set(grp.id, grpEl);
            const list = mkEl('div', CARD_CLS);
            for (const k of grp.keys) if (rowDefs[k]) ap(list, buildRow(rowDefs[k]));
            if (grp.id === 'thought') {
              thoughtListEl = list;
            }
            ap(grpEl, mkEl('div', 'ag-cs-settings-subhead', grp.title));
            if (grp.id === 'beta') {
              const bNote = mkEl('div', 'ag-cs-beta-notice', U('betaPlaceholderNotice', 'Note: This section contains experimental features that are off by default and may evolve across versions.'));
              sa(bNote, 'data-testid', 'prism-beta-notice');
              ap(grpEl, bNote);
            }
            ap(grpEl, list);
            if (grp.id === 'beta') {
              sgSlot = mkEl('div');
              sa(sgSlot, 'data-testid', K_SG);
              setVis(sgSlot, false);
              ap(grpEl, sgSlot);
              wpSlot = mkEl('div');
              sa(wpSlot, 'data-testid', K_WP);
              setVis(wpSlot, false);
              ap(grpEl, wpSlot);
            }
            ap(groupsWrap, grpEl);
          }

          const aboutGrp = mkEl('div', 'ag-cs-settings-group');
          sa(aboutGrp, 'data-ag-cs-group', 'about');
          groupElsById.set('about', aboutGrp);

          const aboutBox = mkEl('div', 'ag-cs-about-box');
          sa(aboutBox, 'data-ag-cs-about', '1');
          const mkChip = (txt, attr) => {
            const c = mkEl('span', 'ag-cs-repo-chip', txt);
            sa(c, attr);
            sa(c, 'data-status', 'idle');
            return c;
          };
          const setChip = (c, st, txt) => {
            sa(c, 'data-status', st);
            c[K_TC] = txt;
          };

          const repoChip = mkChip(U('aboutRepoSyncTitle', 'Git'), 'data-ag-cs-repo-status');
          const repoInfo = ap(mkEl('div', 'ag-cs-about-repo-info'), mkEl('span', 'font-medium text-foreground', `Obsidian Prism v${version}`), repoChip);
          const syncBtn = mkB('ag-cs-repo-sync-btn', U('aboutRepoSyncBtn', 'Sync'), 'data-ag-cs-repo-sync');
          sa(syncBtn, 'data-tone', 'secondary');

          let repoProbedOnce = false;
          let repoSyncBusy = false;
          const applyRepoStatusView = (res, isPull) => {
            if (!repoChip[K_IC]) return;
            runGuardedMut(() => {
              const branch = res?.branch || 'local';
              const hash = res?.shortHash || (res?.commit ? String(res.commit).slice(0, 7) : '');
              const ref = hash && hash !== branch ? `${branch} @ ${hash}` : branch;
              const hasRemote = !!(res && !res.noRemote && res.hasRemote !== false && res.remoteUrl);
              if (!hasRemote) setChip(repoChip, 'warn', `${ref} · ${U('aboutRepoNoRemote', 'Local')}`);
              else if (isPull && res?.updated) setChip(repoChip, 'updated', `${ref} · ${U('aboutRepoUpdated', 'Updated')}`);
              else if (res?.ok === false && res?.error) setChip(repoChip, 'error', `${ref} · ${res.error}`);
              else setChip(repoChip, 'ok', `${ref} · ${U('aboutRepoUpToDate', 'OK')}`);
            });
          };
          const probeRepoStatusSilently = () => {
            if (repoProbedOnce || repoSyncBusy) return;
            repoProbedOnce = true;
            void invokePrismRepoAction('status', version).then((st) => st && applyRepoStatusView(st, false));
            probeStorageSilently();
          };
          probeRepoRef = probeRepoStatusSilently;
          onClk(syncBtn, () => {
            if (repoSyncBusy) return;
            repoSyncBusy = true;
            repoProbedOnce = true;
            runGuardedMut(() => {
              syncBtn.disabled = true;
              setChip(repoChip, 'idle', U('aboutRepoChecking', '...'));
            });
            void invokePrismRepoAction('status', version)
              .then((st) => {
                if (!(st && !st.noRemote && st.hasRemote !== false && st.remoteUrl)) {
                  applyRepoStatusView(st || { noRemote: true, branch: 'local' }, false);
                  return null;
                }
                return invokePrismRepoAction('pull', version).then((p) => {
                  applyRepoStatusView({ ...st, ...p }, true);
                  return p;
                });
              })
              .finally(() => {
                repoSyncBusy = false;
                runGuardedMut(() => { if (syncBtn[K_IC]) syncBtn.disabled = false; });
              });
          });
          ap(aboutBox, ap(mkEl('div', 'ag-cs-about-repo-row'), repoInfo, syncBtn));

          const updRow = mkEl('div', 'ag-cs-about-repo-row');
          sa(updRow, 'data-ag-cs-update-row', '1');
          const updChip = mkChip(fmtTpl(U('updUpToDate', 'v{0}'), [version]), 'data-ag-cs-update-status');
          const updLinkSlot = mkEl('span', 'ag-cs-update-link-slot');
          const checkUpdBtn = mkB('ag-cs-repo-sync-btn', U('updCheckBtn', 'Check Update'), 'data-ag-cs-update-check');
          const applyUpdBtn = mkB('ag-cs-repo-sync-btn', U('updApplyBtn', 'Update Now'), 'data-ag-cs-update-apply');
          setVis(applyUpdBtn, false);
          ap(aboutBox, ap(updRow, ap(mkEl('div', 'ag-cs-about-repo-info'), updChip, updLinkSlot), ap(mkEl('div', 'ag-cs-thought-btn-group'), checkUpdBtn, applyUpdBtn)));

          const updNote = mkEl('p', 'ag-cs-thought-hint ag-cs-update-note', U('updHotNote'));
          sa(updNote, 'data-ag-cs-update-note', '1');
          ap(aboutBox, updNote, ap(mkEl('div', CARD_CLS), buildRow(rowDefs.autoUpdate), buildRow(rowDefs.updateChannel)));

          let updBusy = false;
          const isSafeGhUrl = (u) => typeof u === 'string' && /^https:\/\/github\.com\/hypsunk\/GravityPrism(?:\/|$)/i.test(u.trim());
          const applyUpdateView = (st) => {
            if (!updChip[K_IC] || !st || st.offline || st.timeout) return;
            const u = uiText(getLang()) || ui;
            runGuardedMut(() => {
              updLinkSlot[K_TC] = '';
              if (st.applied || st.hotReloaded || st.hotReloadExpected) {
                setVis(updBadge, false);
                setVis(applyUpdBtn, false);
                setChip(updChip, 'updated', u.updHotDone || 'Updated');
                return;
              }
              if (st.hasUpdate) {
                const tv = st.latestVersion || '';
                updBadge[K_TC] = `v${tv}`;
                setVis(updBadge, true);
                sa(updChip, 'data-status', 'warn');
                if (st.manualRequired) {
                  updChip[K_TC] = fmtTpl(u.updManualHint || 'v{0}', [tv]);
                  setVis(applyUpdBtn, false);
                  const href = isSafeGhUrl(st.downloadUrl) ? st.downloadUrl : isSafeGhUrl(st.releaseUrl) ? st.releaseUrl : '';
                  if (href) {
                    const a = mkEl('a', '', `v${tv} ↗`);
                    sa(a, 'href', href);
                    sa(a, 'target', '_blank');
                    sa(a, 'rel', 'noopener noreferrer');
                    sa(a, 'data-ag-cs-update-link', '1');
                    ap(updLinkSlot, a);
                  }
                } else {
                  updChip[K_TC] = fmtTpl(u.updAvailTpl || 'v{0}', [tv]);
                  setVis(applyUpdBtn, true);
                }
                return;
              }
              setVis(updBadge, false);
              setVis(applyUpdBtn, false);
              if (st.ok === false && st.error) setChip(updChip, 'error', st.error);
              else setChip(updChip, 'ok', fmtTpl(u.updUpToDate || 'v{0}', [st.currentVersion || version]));
            });
          };
          applyUpdateViewRef = applyUpdateView;
          onClk(checkUpdBtn, () => {
            if (updBusy) return;
            updBusy = true;
            runGuardedMut(() => {
              checkUpdBtn.disabled = true;
              setChip(updChip, 'idle', U('aboutRepoChecking', '...'));
            });
            void invokePrismRepoAction('check-update', version, { force: true, manual: true })
              .then((st) => st && applyUpdateView(st))
              .catch((e) => applyUpdateView({ ok: false, error: String(e?.message || e) }))
              .finally(() => {
                updBusy = false;
                runGuardedMut(() => { if (checkUpdBtn[K_IC]) checkUpdBtn.disabled = false; });
              });
          });
          onClk(applyUpdBtn, () => {
            if (updBusy) return;
            updBusy = true;
            runGuardedMut(() => {
              applyUpdBtn.disabled = true;
              checkUpdBtn.disabled = true;
              setChip(updChip, 'idle', (uiText(getLang()) || ui).updUpdating || '...');
            });
            void invokePrismRepoAction('apply-update', version, { confirm: true })
              .then((st) => st && applyUpdateView(st))
              .catch((e) => applyUpdateView({ ok: false, error: String(e?.message || e) }))
              .finally(() => {
                updBusy = false;
                runGuardedMut(() => {
                  if (applyUpdBtn[K_IC]) applyUpdBtn.disabled = false;
                  if (checkUpdBtn[K_IC]) checkUpdBtn.disabled = false;
                });
              });
          });

          const wbInitUi = getStorageWbUi(lang);
          const storageChip = mkChip(U('storageHealthIdle', 'DB'), 'data-ag-cs-storage-status');
          const archiveBtn = mkB('ag-cs-repo-sync-btn', U('storageArchiveBtn', 'Archive'), 'data-ag-cs-storage-archive');
          sa(archiveBtn, 'data-tone', 'secondary');
          const archRestartBtn = mkB('ag-cs-repo-sync-btn', U('storageArchiveRestartBtn', 'Archive & Restart'), 'data-ag-cs-archive-restart');
          sa(archRestartBtn, 'data-tone', 'amber');
          const restoreBtn = mkB('ag-cs-repo-sync-btn', U('storageRestoreBtn', 'Restore Archive'), 'data-ag-cs-storage-restore');
          sa(restoreBtn, 'data-tone', 'secondary');
          const autoExitOffBtn = mkB('ag-cs-repo-sync-btn', U('storageAutoExitOff', 'Off'), 'data-ag-cs-auto-archive-exit', 'off');
          sa(autoExitOffBtn, 'data-tone', 'secondary');
          const autoExitOnBtn = mkB('ag-cs-repo-sync-btn', U('storageAutoExitOn', 'On'), 'data-ag-cs-auto-archive-exit', 'on');
          sa(autoExitOnBtn, 'data-tone', 'secondary');
          const archActionChip = mkEl('span', 'ag-cs-repo-chip', '');
          setVis(archActionChip, false);
          sa(archActionChip, 'data-ag-cs-archive-action-status');
          const archConfirmBox = mkEl('div', 'ag-cs-thought-cfg-box');
          setVis(archConfirmBox, false);
          sa(archConfirmBox, 'data-ag-cs-archive-restart-box', '1');
          const archConfirmCancel = mkB('ag-cs-thought-btn', U('uninstallCancelBtn', 'Cancel'), 'data-ag-cs-archive-restart-cancel');
          const archConfirmOk = mkB('ag-cs-thought-btn', U('storageArchiveRestartConfirmBtn', 'Confirm & Restart'), 'data-ag-cs-archive-restart-confirm');
          ap(
            archConfirmBox,
            mkEl('p', 'ag-cs-thought-hint', U('storageArchiveRestartConfirmDesc')),
            ap(mkEl('div', 'ag-cs-thought-actions'), ap(mkEl('div', 'ag-cs-thought-btn-group'), archConfirmCancel, archConfirmOk))
          );

          const restoreConfirmBox = mkEl('div', 'ag-cs-thought-cfg-box');
          setVis(restoreConfirmBox, false);
          sa(restoreConfirmBox, 'data-ag-cs-storage-restore-box', '1');
          const restoreBatchSelect = mkEl('select', 'ag-cs-home-ws-select');
          sa(restoreBatchSelect, 'data-ag-cs-storage-batch-select', '1');
          const restoreBatchRow = ap(
            mkEl('div', 'ag-cs-about-repo-row'),
            mkEl('span', 'ag-cs-thought-hint', wbInitUi.batchSelectLabel),
            restoreBatchSelect
          );
          setVis(restoreBatchRow, false);
          const restoreDescEl = mkEl('p', 'ag-cs-thought-hint', U('storageRestoreEmpty'));
          const restoreCancel = mkB('ag-cs-thought-btn', U('uninstallCancelBtn', 'Cancel'), 'data-ag-cs-storage-restore-cancel');
          const restoreScriptBtn = mkB('ag-cs-thought-btn', wbInitUi.restoreScriptBtn, 'data-ag-cs-storage-res');
          restoreScriptBtn.disabled = true;
          const restoreConfirmOk = mkB('ag-cs-thought-btn', U('storageRestoreConfirmBtn', 'Confirm Restore'), 'data-ag-cs-storage-restore-confirm');
          restoreConfirmOk.disabled = true;
          ap(
            restoreConfirmBox,
            restoreBatchRow,
            restoreDescEl,
            ap(mkEl('div', 'ag-cs-thought-actions'), ap(mkEl('div', 'ag-cs-thought-btn-group'), restoreCancel, restoreScriptBtn, restoreConfirmOk))
          );

          // 懒加载存储明细与归档工作台抽屉（展开前 0 storage-detail 请求；>14d 预设必须经二次确认且与其它确认框互斥）
          const stWb = mkEl('details', 'ag-cs-thought-cfg-box');
          sa(stWb, 'data-ag-cs-storage-wb', '1');
          const stSum = mkEl('summary', '', wbInitUi.summary);
          const stPre = mkEl('pre', 'ag-cs-license-pre', '');
          sa(stPre, 'data-ag-cs-storage-detail', '1');
          const stOldBtn = mkB('ag-cs-repo-sync-btn', wbInitUi.oldMainBtn, 'data-ag-cs-storage-old');
          sa(stOldBtn, 'data-tone', 'secondary');
          const stRefBtn = mkB('ag-cs-repo-sync-btn', wbInitUi.refreshBtn, 'data-ag-cs-storage-ref');
          sa(stRefBtn, 'data-tone', 'secondary');
          const oldMainConfirmBox = mkEl('div', 'ag-cs-thought-cfg-box');
          setVis(oldMainConfirmBox, false);
          sa(oldMainConfirmBox, 'data-ag-cs-storage-old-box', '1');
          const oldMainConfirmCancel = mkB('ag-cs-thought-btn', U('uninstallCancelBtn', 'Cancel'), 'data-ag-cs-storage-old-cancel');
          const oldMainConfirmOk = mkB('ag-cs-thought-btn', wbInitUi.oldMainConfirmBtn, 'data-ag-cs-storage-old-confirm');
          ap(
            oldMainConfirmBox,
            mkEl('p', 'ag-cs-thought-hint', wbInitUi.oldMainConfirmDesc),
            ap(mkEl('div', 'ag-cs-thought-actions'), ap(mkEl('div', 'ag-cs-thought-btn-group'), oldMainConfirmCancel, oldMainConfirmOk))
          );
          ap(
            stWb,
            stSum,
            stPre,
            ap(mkEl('div', 'ag-cs-about-repo-row'), ap(mkEl('div', 'ag-cs-thought-btn-group'), stOldBtn, stRefBtn)),
            oldMainConfirmBox
          );

          const goMemChip = mkChip(U('goMemLimitUnset', 'Not set'), 'data-ag-cs-gomemlimit-status');
          const goMemSel = mkEl('select', 'ag-cs-home-ws-select');
          sa(goMemSel, 'data-ag-cs-gomemlimit-select', '1');
          for (const pv of ['2GiB', '2500MiB', '3GiB', '4GiB']) {
            const opt = mkEl('option', '', pv === '2GiB' ? '2GiB ★' : pv);
            opt.value = pv;
            ap(goMemSel, opt);
          }
          goMemSel.value = '2GiB';
          const goMemApplyBtn = mkB('ag-cs-repo-sync-btn', U('goMemLimitApplyBtn', 'Apply'), 'data-ag-cs-gomemlimit-apply');
          const goMemClearBtn = mkB('ag-cs-repo-sync-btn', U('goMemLimitClearBtn', 'Clear'), 'data-ag-cs-gomemlimit-clear');
          sa(goMemClearBtn, 'data-tone', 'secondary');

          let storageBusy = false;
          let goMemBusy = false;
          let detailLoaded = false;
          let selectedBatchName = '';
          let cachedBatches = [];
          const fmtMbShort = (v) => (Number(v) >= 1024 ? `${(Number(v) / 1024).toFixed(2)} GB` : `${Math.round(Number(v) || 0)} MB`);
          const toggleConfirmBox = (targetBox) => {
            const boxes = [archConfirmBox, restoreConfirmBox, oldMainConfirmBox];
            const shouldOpen = Boolean(targetBox && targetBox.hidden);
            runGuardedMut(() => {
              for (const box of boxes) setVis(box, box === targetBox ? shouldOpen : false);
            });
            return shouldOpen;
          };
          const syncRestoreDesc = () => {
            const uNow = uiText(getLang()) || ui;
            const wl = getStorageWbUi(getLang());
            if (selectedBatchName) {
              restoreDescEl[K_TC] = fmtTpl(wl.restoreSelectedDescTpl || uNow.storageRestoreConfirmDesc || '{0}', [selectedBatchName]);
              restoreConfirmOk.disabled = false;
              restoreScriptBtn.disabled = false;
            } else {
              restoreDescEl[K_TC] = uNow.storageRestoreEmpty || 'No archive batches yet';
              restoreConfirmOk.disabled = true;
              restoreScriptBtn.disabled = true;
            }
          };
          const syncRestoreBatches = (batches, latestBatch) => {
            const list = [];
            if (isArr(batches)) {
              for (const b of batches) {
                if (b && typeof b.batchName === 'string' && b.batchName) list.push(b);
              }
            }
            if (list.length === 0 && latestBatch && typeof latestBatch.batchName === 'string' && latestBatch.batchName) {
              list.push(latestBatch);
            }
            cachedBatches = list;
            const prevSelected = selectedBatchName;
            restoreBatchSelect[K_TC] = '';
            for (const b of list) {
              const label =
                b.movedCount !== undefined || b.movedMb !== undefined
                  ? `${b.batchName} (${b.movedCount || 0}/${fmtMbShort(b.movedMb)})`
                  : b.batchName;
              const opt = mkEl('option', '', label);
              opt.value = b.batchName;
              ap(restoreBatchSelect, opt);
            }
            if (list.length > 0) {
              const kept = list.some((b) => b.batchName === prevSelected) ? prevSelected : list[0].batchName;
              selectedBatchName = kept;
              restoreBatchSelect.value = kept;
              setVis(restoreBatchRow, true);
            } else {
              selectedBatchName = '';
              restoreBatchSelect.value = '';
              setVis(restoreBatchRow, false);
            }
            syncRestoreDesc();
          };
          const syncAutoExitButtons = (enabled) => {
            const on = Boolean(enabled);
            runGuardedMut(() => {
              if (!on) sa(autoExitOffBtn, 'data-active', '1');
              else ra(autoExitOffBtn, 'data-active');
              if (on) sa(autoExitOnBtn, 'data-active', '1');
              else ra(autoExitOnBtn, 'data-active');
            });
          };
          syncAutoExitButtons(resolveSettingRowActiveValue('autoArchiveOnExit') === true);

          const applyStorageView = (st, prepared) => {
            if (!storageChip[K_IC] || !st || st.offline || st.timeout) return;
            const u = uiText(getLang()) || ui;
            const wl = getStorageWbUi(getLang());
            runGuardedMut(() => {
              if (typeof st.detailText === 'string') {
                stPre[K_TC] = st.detailText;
                detailLoaded = true;
              }
              if (isArr(st.batches) || st.latestBatch) {
                syncRestoreBatches(st.batches, st.latestBatch);
              }
              if (st.ok === false && st.error) {
                setChip(storageChip, 'error', st.error);
                return;
              }
              if (typeof st.autoArchiveOnExit === 'boolean') syncAutoExitButtons(st.autoArchiveOnExit);
              const clipPath = st.clipPath || st.archiveScriptPath || st.restoreScriptPath;
              if (prepared && (st.chipText || clipPath)) {
                let chipMsg = st.chipText;
                if (!chipMsg && st.mode === 'subagents+old-main' && st.archiveScriptPath) {
                  const totalCnt = (st.archivableSubagentCount || 0) + (st.archivableOldMainCount || 0);
                  const totalMb = (Number(st.archivableSubagentMb) || 0) + (Number(st.archivableOldMainMb) || 0);
                  chipMsg = fmtTpl(wl.oldMainReadyTpl || '{0}/{1}:{2}', [totalCnt, fmtMbShort(totalMb), st.archiveScriptPath]);
                } else if (!chipMsg && st.action === 'prepare-restore' && st.restoreScriptPath) {
                  chipMsg = fmtTpl(wl.restoreScriptReadyTpl || '{0}:{1}', [st.batchName || selectedBatchName || 'latest', st.restoreScriptPath]);
                } else if (!chipMsg && st.archiveScriptPath) {
                  chipMsg = fmtTpl(u.storageReadyTpl || '{0}/{1}:{2}', [st.archivableSubagentCount || 0, fmtMbShort(st.archivableSubagentMb), st.archiveScriptPath]);
                }
                setChip(storageChip, 'updated', chipMsg || clipPath);
                try { if (clipPath) navigator?.clipboard?.writeText?.(clipPath)?.catch?.(() => {}); } catch {}
              } else if (st.action !== 'storage-detail') {
                const memSuffix = Number(st.lsMemoryMb) > 0 ? ` · ${fmtTpl(u.storageLsMemTpl || 'LS {0}', [fmtMbShort(st.lsMemoryMb)])}` : '';
                setChip(
                  storageChip,
                  st.warn ? 'warn' : 'ok',
                  fmtTpl(u.storageSummaryTpl || '{0}({1}/{2}/{3}){4}', [
                    fmtMbShort(st.totalMb),
                    st.mainCount || 0,
                    st.subagentCount || 0,
                    fmtMbShort(st.subagentMb),
                    st.warn ? u.storageWarn || '!' : u.storageOk || 'OK',
                  ]) + memSuffix
                );
              }
            });
          };
          const applyGoMemView = (st) => {
            if (!goMemChip[K_IC] || !st || st.offline || st.timeout) return;
            const u = uiText(getLang()) || ui;
            runGuardedMut(() => {
              if (st.ok === false && st.error) {
                setChip(goMemChip, 'error', st.error);
                return;
              }
              if (st.appliedValue) {
                setChip(goMemChip, 'updated', fmtTpl(u.goMemLimitAppliedTpl || 'GOMEMLIMIT={0}', [st.appliedValue]));
                goMemSel.value = st.appliedValue;
              } else if (st.cleared) {
                setChip(goMemChip, 'ok', u.goMemLimitCleared || 'Cleared');
              } else if (st.configured && st.currentValue) {
                const note = st.restartRequired ? ` ${u.goMemLimitRestartNote || ''}` : '';
                setChip(goMemChip, 'ok', fmtTpl(u.goMemLimitActiveTpl || '{0}', [st.currentValue]) + note);
                if (['2GiB', '2500MiB', '3GiB', '4GiB'].includes(st.currentValue)) goMemSel.value = st.currentValue;
              } else {
                setChip(goMemChip, 'idle', u.goMemLimitUnset || 'Not set');
              }
            });
          };
          const probeStorageSilently = () => {
            if (storageBusy) return;
            void invokePrismRepoAction('storage-health', version, { lang: getLang() })
              .then((st) => st && applyStorageView(st, false))
              .catch((err) => applyStorageView({ ok: false, error: String(err?.message || err) }, false));
            void invokePrismRepoAction('gomemlimit-status', version)
              .then((st) => st && applyGoMemView(st))
              .catch(() => {});
          };
          const loadStorageDetail = (force) => {
            if (storageBusy) return;
            storageBusy = true;
            const wl = getStorageWbUi(getLang());
            runGuardedMut(() => {
              stRefBtn.disabled = true;
              if (!detailLoaded) stPre[K_TC] = wl.loading;
            });
            void invokePrismRepoAction('storage-detail', version, { lang: getLang(), ...(force ? { force: true } : null) })
              .then((st) => st && applyStorageView(st, false))
              .catch((err) => applyStorageView({ ok: false, error: String(err?.message || err) }, false))
              .finally(() => {
                storageBusy = false;
                runGuardedMut(() => { if (stRefBtn[K_IC]) stRefBtn.disabled = false; });
              });
          };
          on(stWb, 'toggle', () => {
            if (stWb.open && !detailLoaded) loadStorageDetail(false);
          });
          onClk(stRefBtn, () => loadStorageDetail(true));
          onClk(stOldBtn, () => { toggleConfirmBox(oldMainConfirmBox); });
          onClk(oldMainConfirmCancel, () => runGuardedMut(() => setVis(oldMainConfirmBox, false)));
          onClk(oldMainConfirmOk, () => {
            if (storageBusy) return;
            storageBusy = true;
            runGuardedMut(() => { oldMainConfirmOk.disabled = true; });
            void invokePrismRepoAction('prepare-archive', version, {
              mode: 'subagents+old-main',
              oldMain: true,
              confirm: true,
              lang: getLang(),
            })
              .then((st) => {
                if (!st) return;
                applyStorageView(st, true);
                if (st.ok !== false) runGuardedMut(() => setVis(oldMainConfirmBox, false));
              })
              .catch((err) => applyStorageView({ ok: false, error: String(err?.message || err) }, false))
              .finally(() => {
                storageBusy = false;
                runGuardedMut(() => { if (oldMainConfirmOk[K_IC]) oldMainConfirmOk.disabled = false; });
              });
          });
          on(restoreBatchSelect, 'change', () => {
            selectedBatchName = restoreBatchSelect.value || '';
            runGuardedMut(() => syncRestoreDesc());
          });
          onClk(archiveBtn, () => {
            if (storageBusy) return;
            storageBusy = true;
            runGuardedMut(() => { archiveBtn.disabled = true; });
            void invokePrismRepoAction('prepare-archive', version, { lang: getLang() })
              .then((st) => st && applyStorageView(st, true))
              .catch((err) => applyStorageView({ ok: false, error: String(err?.message || err) }, false))
              .finally(() => {
                storageBusy = false;
                runGuardedMut(() => { if (archiveBtn[K_IC]) archiveBtn.disabled = false; });
              });
          });
          const toggleAutoExit = (enabled) => {
            syncAutoExitButtons(enabled);
            const win = getWin();
            const repoBridge = win?.__agPrismRepoBridge;
            const hasRepoBridge = isFn(repoBridge) || isFn(repoBridge?.['storage-auto-exit']) || isFn(repoBridge?.call);
            const hasSettingBinding = isFn(win?.__agPrismSetting) || isFn(win?.__agClaudeStyleSetting);
            if (!hasRepoBridge) {
              try { saveSetting('autoArchiveOnExit', enabled); } catch {}
              return;
            }
            // 无 CDP setting 绑定（纯内存状态/单测环境）时同步本地状态；真运行态仅走 storage-auto-exit 单路写盘与广播
            if (!hasSettingBinding) {
              try { saveSetting('autoArchiveOnExit', enabled); } catch {}
            }
            void invokePrismRepoAction('storage-auto-exit', version, { autoArchiveOnExit: enabled }).then((r) => {
              if (r?.offline && hasSettingBinding) {
                try { saveSetting('autoArchiveOnExit', enabled); } catch {}
                return;
              }
              if (r && r.ok !== false && !r.offline && archActionChip[K_IC]) {
                const u = uiText(getLang()) || ui;
                runGuardedMut(() => {
                  setVis(archActionChip, true);
                  setChip(archActionChip, 'ok', enabled ? u.storageAutoExitEnabledMsg || 'On' : u.storageAutoExitOff || 'Off');
                });
              }
            });
          };
          onClk(autoExitOffBtn, () => toggleAutoExit(false));
          onClk(autoExitOnBtn, () => toggleAutoExit(true));
          onClk(archRestartBtn, () => { toggleConfirmBox(archConfirmBox); });
          onClk(archConfirmCancel, () => runGuardedMut(() => setVis(archConfirmBox, false)));
          onClk(archConfirmOk, () => {
            if (storageBusy) return;
            storageBusy = true;
            const u = uiText(getLang()) || ui;
            runGuardedMut(() => {
              archConfirmOk.disabled = true;
              setVis(archActionChip, true);
              setChip(archActionChip, 'idle', u.storageArchiveRestartRunning || '...');
            });
            void invokePrismRepoAction('archive-and-restart', version, { confirm: true })
              .then((r) => {
                if (!archActionChip[K_IC]) return;
                const uNow = uiText(getLang()) || ui;
                runGuardedMut(() => {
                  setVis(archActionChip, true);
                  if (r && r.ok) {
                    setChip(archActionChip, 'updated', uNow.storageArchiveRestartScheduled || 'OK');
                    setVis(archConfirmBox, false);
                  } else {
                    setChip(archActionChip, 'error', r?.code === 'HOST_BUSY' ? (uNow.storageGuardBusyMsg || r.error) : (r?.error || 'Err'));
                  }
                });
              })
              .finally(() => {
                storageBusy = false;
                runGuardedMut(() => { if (archConfirmOk[K_IC]) archConfirmOk.disabled = false; });
              });
          });
          onClk(restoreBtn, () => {
            const opened = toggleConfirmBox(restoreConfirmBox);
            if (opened) {
              void invokePrismRepoAction('restore-archive', version, { listOnly: true }).then((r) => {
                if (!r || !r.ok || !Array.isArray(r.batches) || !restoreDescEl[K_IC]) return;
                runGuardedMut(() => syncRestoreBatches(r.batches, r.batches[0] || null));
              });
            }
          });
          onClk(restoreCancel, () => runGuardedMut(() => setVis(restoreConfirmBox, false)));
          onClk(restoreScriptBtn, () => {
            if (storageBusy || !selectedBatchName) return;
            storageBusy = true;
            runGuardedMut(() => { restoreScriptBtn.disabled = true; });
            void invokePrismRepoAction('prepare-restore', version, { batchName: selectedBatchName, lang: getLang() })
              .then((st) => st && applyStorageView(st, true))
              .catch((err) => applyStorageView({ ok: false, error: String(err?.message || err) }, false))
              .finally(() => {
                storageBusy = false;
                runGuardedMut(() => { if (restoreScriptBtn[K_IC]) restoreScriptBtn.disabled = !selectedBatchName; });
              });
          });
          onClk(restoreConfirmOk, () => {
            if (storageBusy || !selectedBatchName) return;
            storageBusy = true;
            runGuardedMut(() => { restoreConfirmOk.disabled = true; });
            void invokePrismRepoAction('restore-archive', version, { confirm: true, batchName: selectedBatchName })
              .then((r) => {
                if (!archActionChip[K_IC]) return;
                const uNow = uiText(getLang()) || ui;
                runGuardedMut(() => {
                  setVis(archActionChip, true);
                  if (r && r.ok) {
                    setChip(archActionChip, 'updated', uNow.storageRestoreScheduled || 'OK');
                    setVis(restoreConfirmBox, false);
                  } else {
                    setChip(archActionChip, 'error', r?.code === 'HOST_BUSY' ? (uNow.storageGuardBusyMsg || r.error) : (r?.error || 'Err'));
                  }
                });
              })
              .finally(() => {
                storageBusy = false;
                runGuardedMut(() => { if (restoreConfirmOk[K_IC]) restoreConfirmOk.disabled = !selectedBatchName; });
              });
          });
          onClk(goMemApplyBtn, () => {
            if (goMemBusy) return;
            goMemBusy = true;
            runGuardedMut(() => { goMemApplyBtn.disabled = true; goMemClearBtn.disabled = true; });
            void invokePrismRepoAction('gomemlimit-set', version, { value: goMemSel.value })
              .then((st) => st && applyGoMemView(st))
              .finally(() => {
                goMemBusy = false;
                runGuardedMut(() => {
                  if (goMemApplyBtn[K_IC]) goMemApplyBtn.disabled = false;
                  if (goMemClearBtn[K_IC]) goMemClearBtn.disabled = false;
                });
              });
          });
          onClk(goMemClearBtn, () => {
            if (goMemBusy) return;
            goMemBusy = true;
            runGuardedMut(() => { goMemApplyBtn.disabled = true; goMemClearBtn.disabled = true; });
            void invokePrismRepoAction('gomemlimit-clear', version)
              .then((st) => st && applyGoMemView(st))
              .finally(() => {
                goMemBusy = false;
                runGuardedMut(() => {
                  if (goMemApplyBtn[K_IC]) goMemApplyBtn.disabled = false;
                  if (goMemClearBtn[K_IC]) goMemClearBtn.disabled = false;
                });
              });
          });

          const goMemBox = mkEl('div', 'ag-cs-thought-cfg-box');
          sa(goMemBox, 'data-ag-cs-gomemlimit-box', '1');
          ap(
            goMemBox,
            ap(mkEl('div', 'ag-cs-about-repo-row'), ap(mkEl('div', 'ag-cs-about-repo-info'), mkEl('span', 'font-medium text-foreground', U('goMemLimitTitle', 'GOMEMLIMIT')), goMemChip), ap(mkEl('div', 'ag-cs-thought-btn-group'), goMemSel, goMemApplyBtn, goMemClearBtn)),
            mkEl('p', 'ag-cs-thought-hint', U('goMemLimitDesc'))
          );

          ap(
            aboutBox,
            ap(mkEl('div', 'ag-cs-about-repo-row'), ap(mkEl('div', 'ag-cs-about-repo-info'), mkEl('span', 'font-medium text-foreground', U('storageHealthTitle', 'DB')), storageChip)),
            ap(mkEl('div', 'ag-cs-about-repo-row'), ap(mkEl('div', 'ag-cs-thought-btn-group'), archRestartBtn, restoreBtn, archiveBtn), ap(mkEl('div', 'ag-cs-about-repo-info'), archActionChip)),
            archConfirmBox,
            restoreConfirmBox,
            ap(mkEl('div', 'ag-cs-about-repo-row'), ap(mkEl('div', 'ag-cs-about-repo-info'), mkEl('span', 'font-medium text-foreground', U('storageAutoExitTitle', 'Auto-Archive')), mkEl('span', 'ag-cs-thought-hint', U('storageAutoExitDesc'))), ap(mkEl('div', 'ag-cs-thought-btn-group'), autoExitOffBtn, autoExitOnBtn)),
            stWb,
            goMemBox
          );

          const creditsGrid = mkEl('div', 'ag-cs-about-credits');
          for (const item of UPSTREAM_CREDITS) {
            const a = mkEl('a');
            sa(a, 'href', item.url);
            sa(a, 'target', '_blank');
            sa(a, 'rel', 'noopener noreferrer');
            sa(a, 'data-ag-cs-credit', item.repo);
            sa(a, 'title', `${item.repo} — ${item.meta}`);
            ap(
              creditsGrid,
              ap(
                a,
                ap(mkEl('span', 'ag-cs-credit-top'), mkEl('span', 'ag-cs-credit-repo', item.repo), mkEl('span', 'ag-cs-credit-ext', '↗')),
                mkEl('span', 'ag-cs-credit-meta', item.meta)
              )
            );
          }
          ap(
            aboutBox,
            mkEl('div', 'ag-cs-about-credits-title', U('aboutCreditsTitle', 'Credits')),
            creditsGrid,
            ap(mkEl('details', 'ag-cs-about-license'), mkEl('summary', '', U('aboutLicenseTitle', 'GPL-3.0')), mkEl('pre', 'ag-cs-license-pre', LICENSE_SUMMARY_TEXT))
          );

          const mkTB = (txt, attr, danger) => {
            const b = mkB('ag-cs-thought-btn', txt, attr);
            if (danger) sa(b, 'data-danger', '1');
            return b;
          };
          const uChip = mkEl('span', 'ag-cs-repo-chip', '');
          setVis(uChip, false);
          sa(uChip, 'data-ag-cs-uninstall-status');
          const uBtn = mkTB(U('uninstallBtn', 'Uninstall'), 'data-ag-cs-uninstall', 1);
          ap(aboutBox, ap(mkEl('div', 'ag-cs-about-repo-row'), ap(mkEl('div', 'ag-cs-about-repo-info'), uChip), uBtn));

          const uBox = mkEl('div', 'ag-cs-thought-cfg-box');
          setVis(uBox, false);
          sa(uBox, 'data-ag-cs-uninstall-box', '1');
          const uCb = mkEl('input');
          uCb.type = 'checkbox';
          uCb.checked = false;
          sa(uCb, 'data-ag-cs-uninstall-purge', '1');
          const uCancel = mkTB(U('uninstallCancelBtn', 'Cancel'), 'data-ag-cs-uninstall-cancel');
          const uConfirm = mkTB(U('uninstallConfirmBtn', 'Confirm'), 'data-ag-cs-uninstall-confirm', 1);
          ap(
            aboutBox,
            ap(
              uBox,
              ap(mkEl('label', 'ag-cs-about-repo-info'), uCb, mkEl('span', '', U('uninstallPurge', 'Purge'))),
              mkEl('p', 'ag-cs-thought-hint', U('uninstallKeepNote')),
              ap(mkEl('div', 'ag-cs-thought-actions'), ap(mkEl('div', 'ag-cs-thought-btn-group'), uCancel, uConfirm))
            ),
            mkEl('p', 'ag-cs-about-disclaimer', U('aboutDisclaimer', 'Obsidian Prism is an independent open-source project and is not affiliated with or endorsed by Google LLC.'))
          );
          ap(groupsWrap, ap(aboutGrp, mkEl('div', 'ag-cs-settings-subhead', U('aboutGroupTitle', 'About')), aboutBox));
          ap(foldBody, groupsWrap);
          mountThoughtUiIfReady();
          try { sec.__prismMountSg?.(lang); } catch {}

          let uBusy = false;
          onClk(uBtn, () => runGuardedMut(() => setVis(uBox, !!(uBox.hidden))));
          onClk(uCancel, () => runGuardedMut(() => setVis(uBox, false)));
          onClk(uConfirm, () => {
            if (uBusy) return;
            uBusy = true;
            const purgeData = !!(uCb.checked);
            if (purgeData) clearPrismLocalStorage();
            runGuardedMut(() => { uConfirm.disabled = true; });
            void invokePrismRepoAction('uninstall', version, { confirm: true, purgeData })
              .then((r) => {
                if (!uChip[K_IC]) return;
                const u = uiText(getLang()) || ui;
                runGuardedMut(() => {
                  setVis(uChip, true);
                  if (r && r.ok !== false && !r.offline) {
                    setChip(uChip, 'ok', u.uninstallDone || 'OK');
                    setVis(uBox, false);
                  } else {
                    setChip(uChip, 'error', r?.error || 'Err');
                  }
                });
              })
              .finally(() => {
                uBusy = false;
                runGuardedMut(() => { if (uConfirm[K_IC]) uConfirm.disabled = false; });
              });
          });

          const cfgFooter = mkEl('div', 'ag-cs-cfg-footer');
          sa(cfgFooter, 'data-ag-cs-cfg-footer', '1');
          const cfgHint = mkEl('span', 'ag-cs-cfg-hint', U('cfgToolbarHint'));
          sa(cfgHint, 'data-ag-cs-cfg-status');
          const setCfgStatus = (msg, tone = '') =>
            runGuardedMut(() => {
              cfgHint[K_TC] = msg;
              if (tone) sa(cfgHint, 'data-tone', tone);
              else ra(cfgHint, 'data-tone');
            });
          if (pendingCfgToast && pendingCfgToast.exp > Date.now()) {
            const toastMsg = (pendingCfgToast.key && ui[pendingCfgToast.key]) || pendingCfgToast.fallback || '';
            const toastTone = pendingCfgToast.tone || 'ok';
            pendingCfgToast = null;
            if (toastMsg) setCfgStatus(toastMsg, toastTone);
          } else {
            pendingCfgToast = null;
          }

          const isPersistedAutoLang = () => {
            const liveCfg = isFn(ctx.getConfig) ? ctx.getConfig() : null;
            if (isObj(liveCfg)) {
              const raw = String(liveCfg.language ?? liveCfg.lang ?? '').trim().toLowerCase();
              if (raw) return raw === 'auto';
            }
            for (const sk of ['ag-prism:config', 'ag-prism:lastFileConfig']) {
              try {
                const rawStr = readStore(sk);
                if (!rawStr) continue;
                const obj = JSON.parse(rawStr);
                const raw = String(obj?.language ?? obj?.lang ?? '').trim().toLowerCase();
                if (raw) return raw === 'auto';
              } catch {}
            }
            return false;
          };
          const exportBtn = mkB('ag-cs-cfg-btn', U('cfgExportBtn', 'Export JSON'), 'data-ag-cs-cfg-action', 'export');
          onClk(exportBtn, async () => {
            const lNow = getLang(), uNow = uiText(lNow), cur = {};
            for (const k of SCHEMA_KEYS) cur[k] = effVal(k, lNow);
            if (isPersistedAutoLang()) cur.language = 'auto';
            const win = getWin();
            const rawThought = await Promise.resolve(
              win?.__agPrismThought?.getConfig ? win.__agPrismThought.getConfig() : win?.__agPrismThoughtBridge?.call?.({ action: 'get-config' })
            ).catch(() => null);
            const jsonStr = JSON.stringify(buildSanitizedConfigExport(cur, rawThought || null, version), null, 2);
            try {
              if (typeof Blob !== 'undefined' && typeof URL !== 'undefined' && isFn(URL.createObjectURL)) {
                const url = URL.createObjectURL(new Blob([jsonStr], { type: 'application/json;charset=utf-8' }));
                const dl = mkEl('a');
                dl.href = url;
                dl.download = `obsidian-prism-settings-v${version}.json`;
                dl.click?.();
                setTimeout(() => URL.revokeObjectURL(url), 1500);
              } else win?.navigator?.clipboard?.writeText?.(jsonStr);
            } catch {
              try { win?.navigator?.clipboard?.writeText?.(jsonStr); } catch {}
            }
            setCfgStatus(uNow.cfgExportOk || 'OK', 'ok');
          });

          const handleImportRaw = (rawText) => {
            const lNow = getLang(), uNow = uiText(lNow), res = validateImportedConfigJson(rawText);
            if (!res.ok) {
              setCfgStatus(uNow.cfgImportErr || 'Invalid JSON', 'err');
              return false;
            }
            pendingCfgToast = { key: 'cfgImportOk', fallback: 'OK', tone: 'ok', exp: Date.now() + 2500 };
            if (O.keys(res.settings).length > 0) {
              applyBatch(res.settings);
              if (res.settings.thoughtTranslate) {
                mountThoughtUiIfReady();
                getThoughtUiHandle()?.onModeSwitched?.(res.settings.thoughtTranslate);
              }
              if (res.settings.thoughtView) getThoughtUiHandle()?.onViewSwitched?.(res.settings.thoughtView);
            }
            if (res.thought) {
              const win = getWin();
              try {
                void Promise.resolve(
                  win?.__agPrismThought?.saveConfig
                    ? win.__agPrismThought.saveConfig(res.thought)
                    : win?.__agPrismThoughtBridge?.call?.({ action: 'save-config', ...res.thought })
                )
                  .then(() => {
                    const liveTh = doc.getElementById(SETTINGS_SEC_ID)?.__prismThoughtUiHandle || getThoughtUiHandle();
                    liveTh?.reloadConfig?.();
                    liveTh?.ensureLoaded?.(true);
                  })
                  .catch(() => {});
              } catch {}
              getThoughtUiHandle()?.reloadConfig?.();
            }
            const rl = getLang(), ru = uiText(rl);
            if (sec[K_IC]) {
              pendingCfgToast = null;
              runGuardedMut(() => syncRootState(sec, rl, ru));
              setCfgStatus(ru.cfgImportOk || 'OK', 'ok');
            }
            return true;
          };
          on(fileInput, 'change', () => {
            const f = fileInput.files?.[0];
            if (!f) return;
            if (isFn(f.text)) void f.text().then(handleImportRaw).catch(() => handleImportRaw(''));
            else if (isFn(FileReader)) {
              const rd = new FileReader();
              rd.onload = () => handleImportRaw(String(rd.result || ''));
              rd.readAsText(f);
            }
            fileInput.value = '';
          });

          const importBtn = mkB('ag-cs-cfg-btn', U('cfgImportBtn', 'Import JSON'), 'data-ag-cs-cfg-action', 'import');
          onClk(importBtn, () => fileInput.click?.());

          const resetBtn = mkB('ag-cs-cfg-btn', U('cfgResetBtn', 'Reset Defaults'), 'data-ag-cs-cfg-action', 'reset');
          onClk(resetBtn, () => {
            const defs = getDefaultSettingsPatch();
            defs.language = 'auto';
            pendingCfgToast = { key: 'cfgResetOk', fallback: 'OK', tone: 'ok', exp: Date.now() + 2500 };
            applyBatch(defs);
            const curTh = getThoughtUiHandle();
            if (curTh) {
              curTh.onModeSwitched?.(defs.thoughtTranslate);
              curTh.onViewSwitched?.(defs.thoughtView);
            }
            const rl = getLang(), ru = uiText(rl);
            if (sec[K_IC]) {
              pendingCfgToast = null;
              runGuardedMut(() => syncRootState(sec, rl, ru));
              setCfgStatus(ru.cfgResetOk || 'OK', 'ok');
            }
          });

          ap(foldBody, ap(cfgFooter, ap(mkEl('div', 'ag-cs-cfg-meta'), mkEl('span', 'ag-cs-cfg-title', U('cfgToolbarTitle', 'Config')), cfgHint), ap(mkEl('div', 'ag-cs-cfg-actions'), exportBtn, importBtn, resetBtn)));

          createMascotCastingStage({
            doc,
            sec,
            foldBody,
            getMainBlocks: () => [topDeck, groupsWrap, cfgFooter],
            getLang,
            uiText,
            getCurMascot: () => effVal('mascot', getLang()),
            setMascotValue: (val) => saveSetting('mascot', val),
            isLightThemeNow: () => {
              const de = doc.documentElement;
              const tAttr = de?.getAttribute?.('data-ag-cs-theme') || '';
              return tAttr === 'light' || (!tAttr && (Boolean(de?.[K_CL]?.contains?.('light')) || Boolean(doc.body?.[K_CL]?.contains?.('light'))));
            },
            syncRoot: () => {
              const curL = getLang();
              syncRootState(sec, curL, uiText(curL));
            },
            handledGroupClicks,
            BTN,
          });

          applySubTab(activeSubTab);
          sec.__lastSyncSig = '';
          const lNow = getLang();
          syncRootState(sec, lNow, uiText(lNow));
          if (cachedUpdStatus) applyUpdateView(cachedUpdStatus);
        });
      };

      sec.__ensureFoldBody = ensureFoldBodyBuilt;

      on(foldHead, 'click', (ev) => {
        ev?.preventDefault?.();
        const nextOpen = ga(sec, 'data-open') !== '1';
        const openStr = nextOpen ? '1' : '0';
        writeStore(STORAGE_SETTINGS_OPEN_KEY, openStr);
        if (nextOpen) ensureFoldBodyBuilt();
        else sec.__agMascotStageApi?.close?.();
        runGuardedMut(() => {
          sa(sec, 'data-open', openStr);
          sa(sec, 'data-ag-cs-open', openStr);
          const clOp = nextOpen ? 'add' : 'remove';
          sec[K_CL]?.[clOp]?.('is-open');
          sa(foldHead, 'aria-expanded', nextOpen);
          sa(foldHead, 'aria-label', nextOpen ? ui.foldCollapseHint || 'Collapse' : ui.foldExpandHint || 'Expand');
          sa(foldBody, 'data-open', openStr);
          sa(foldBody, 'aria-hidden', !nextOpen);
          foldBody[K_CL]?.[clOp]?.('is-open');
        });
        try { sec.__prismSyncEffortPreview?.(); } catch {}
        if (nextOpen && probeRepoRef) probeRepoRef();
      });

      ap(anchor.parentElement, sec);
      if (initOpen || ctx.lazyFold === false || !hasMainCss) {
        ensureFoldBodyBuilt();
        if (probeRepoRef) probeRepoRef();
      } else {
        syncRootState(sec, lang, ui);
      }
      void invokePrismRepoAction('update-status', version)
        .then((st) => {
          if (!st) return;
          cachedUpdStatus = st;
          if (applyUpdateViewRef) applyUpdateViewRef(st);
          else syncFoldBadgeOnly(st);
        })
        .catch(() => {});
    });
  };

  const exportedApi = {
    SETTINGS_SEC_ID,
    PRISM_SETTINGS_SCHEMA,
    PRISM_STORAGE_KEYS,
    SCENE_PRESETS,
    UPSTREAM_CREDITS,
    parseMascotSpec,
    encodeMascotSpec,
    FALLBACK_MASCOT_ART,
    getDefaultSettingsPatch,
    buildSanitizedConfigExport,
    validateImportedConfigJson,
    clearPrismLocalStorage,
    mountOrSyncSettingsSection,
  };
  if (typeof module === 'object' && module.exports) module.exports = exportedApi;
  G.__agPrismSettingsPanel = exportedApi;
})(typeof globalThis !== 'undefined' ? globalThis : window);

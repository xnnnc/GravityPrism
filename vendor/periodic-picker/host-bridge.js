/**
 * Obsidian Prism — Periodic Picker Host Bridge
 * React Fiber / DOM Menu Bridge, Native Tooltip Suppressor, Honest 512K Telemetry & Shared Effort Memory.
 *
 * Contract:
 *   globalThis.__agPeriodicHostBridge (Browser) / module.exports (Node)
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module && typeof module.exports === 'object') {
    module.exports = api;
  }
  if (root && typeof root === 'object') {
    root.__agPeriodicHostBridge = api;
  }
  if (typeof globalThis === 'object' && globalThis) {
    globalThis.__agPeriodicHostBridge = api;
  }
  if (typeof window === 'object' && window) {
    window.__agPeriodicHostBridge = api;
  }
})(
  typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this,
  function () {
    'use strict';

    var ROOT_ID = 'ag-prism-periodic-picker-root';
    var DEFAULT_MAX_CONTEXT_TOKENS = 524288;
    var EFFORT_MEMORY_KEY = 'ag.prism.effortMemory.v1';
    var EFFORT_MEMORY_CAP = 64;
    var EFFORT_ORDER = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
    var EFFORT_VALID_MAP = Object.create(null);
    for (var ei = 0; ei < EFFORT_ORDER.length; ei += 1) {
      EFFORT_VALID_MAP[EFFORT_ORDER[ei]] = true;
    }

    var EFFORT_LABELS = {
      off: 'Off',
      minimal: 'Minimal',
      low: 'Low',
      medium: 'Medium',
      high: 'High',
      xhigh: 'Extra',
      max: 'Max',
    };

    var MODEL_TRIGGER_TEXT_RE =
      /(?:gemini|hydrogen|carbon|neon|argon|flash|claude|sonnet|opus|haiku|gpt|openai|o1|o3|o4|codex|orchestrator|编排|调度器)/i;

    var EXCLUDED_FAMILY_RE =
      /\b(?:orchestrator|claude|anthropic|sonnet|opus|haiku|gpt|openai|codex|deepseek|llama|mistral|qwen)\b|\bo[134](?:-[a-z0-9]+)?\b|编排|调度器/i;

    var ZH_EFFORT_PAREN_RE =
      /\s*[（(]\s*(超高|极高|超深|高思考|中思考|低思考|极低|最低|深度思考|思考中?|中等|高|中|低|自动|关闭)\s*[)）]\s*$/;

    var EN_EFFORT_PAREN_RE =
      /\s*\(\s*(off|minimal|low|medium|med|high|xhigh|extra(?:\s+high)?|max|auto)(?:\s+thinking)?\s*\)\s*$/i;

    var suppressedTooltipRecords = typeof WeakMap === 'function' ? new WeakMap() : null;
    var suppressedTooltipList = [];

    function resolveModelCatalogModule(rt) {
      var host = rt || (typeof globalThis !== 'undefined' ? globalThis : null);
      if (host && host.__agPeriodicModelCatalog && typeof host.__agPeriodicModelCatalog === 'object') {
        return host.__agPeriodicModelCatalog;
      }
      if (typeof globalThis === 'object' && globalThis && globalThis.__agPeriodicModelCatalog) {
        return globalThis.__agPeriodicModelCatalog;
      }
      if (typeof require === 'function') {
        try {
          var mod = require('./model-catalog.js');
          if (mod && typeof mod === 'object') return mod;
        } catch (e) {}
      }
      return null;
    }

    function normalizeEffortToken(raw) {
      var w = String(raw || '').trim().toLowerCase();
      if (w === 'extra' || w === 'extrahigh' || w === 'extra high') return 'xhigh';
      if (w === 'med') return 'medium';
      if (w === '超高' || w === '极高' || w === '超深') return 'xhigh';
      if (w === '中' || w === '中等' || w === '中思考') return 'medium';
      if (w === '低' || w === '低思考' || w === '极低' || w === '最低') return 'low';
      if (w === '关闭') return 'off';
      if (w === '高' || w === '高思考' || w === '深度思考' || w === '思考中' || w === '思考') return 'high';
      return EFFORT_VALID_MAP[w] ? w : '';
    }

    function stripEffortBaseName(rawLabel, rt) {
      var clean = String(rawLabel || '').replace(/^.*?\bcurrent:\s*/i, '').trim();
      var cat = resolveModelCatalogModule(rt);
      if (cat && typeof cat.stripEffortSuffixFromLabel === 'function') {
        var res = cat.stripEffortSuffixFromLabel(clean);
        if (res && typeof res.baseName === 'string' && res.baseName.trim()) {
          clean = res.baseName.trim();
        }
      }
      var zm = ZH_EFFORT_PAREN_RE.exec(clean);
      if (zm) {
        clean = clean.slice(0, zm.index).trim();
      } else {
        var em = EN_EFFORT_PAREN_RE.exec(clean);
        if (em) {
          clean = clean.slice(0, em.index).trim();
        } else {
          var bare = /\s+(extra\s+high|xhigh|extra|max|high|medium|med|low|minimal|off)\s*$/i.exec(clean);
          if (bare) clean = clean.slice(0, bare.index).trim();
        }
      }
      return clean || String(rawLabel || '').trim();
    }

    /* ── Shared Effort Memory (ag.prism.effortMemory.v1) ────────────────────── */

    function resolveStorage(rt) {
      try {
        if (rt && rt.localStorage && typeof rt.localStorage.getItem === 'function') {
          return rt.localStorage;
        }
      } catch (e) {}
      try {
        if (typeof globalThis === 'object' && globalThis && globalThis.localStorage) {
          return globalThis.localStorage;
        }
      } catch (e2) {}
      try {
        if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
      } catch (e3) {}
      return null;
    }

    function isEffortMemoryEnabled(doc, opts) {
      if (opts && (opts.effortMemory === 'off' || opts.effortMemory === false || opts.rememberEffort === false)) {
        return false;
      }
      try {
        var de = doc && doc.documentElement;
        if (de && typeof de.getAttribute === 'function') {
          if (de.getAttribute('data-ag-cs-effort-memory') === 'off') return false;
        }
      } catch (e) {}
      return true;
    }

    function sanitizeEffortBucket(src) {
      var out = Object.create(null);
      if (!src || typeof src !== 'object') return out;
      var keys = Object.keys(src);
      var count = 0;
      for (var i = 0; i < keys.length && count < EFFORT_MEMORY_CAP; i += 1) {
        var k = String(keys[i] || '').trim();
        var v = normalizeEffortToken(src[keys[i]]);
        if (k && v) {
          out[k] = v;
          count += 1;
        }
      }
      return out;
    }

    function trimEffortBucket(obj) {
      var out = Object.create(null);
      var keys = Object.keys(obj || {});
      var start = Math.max(0, keys.length - EFFORT_MEMORY_CAP);
      for (var i = start; i < keys.length; i += 1) {
        var k = String(keys[i] || '').trim();
        var v = normalizeEffortToken(obj[keys[i]]);
        if (k && v) out[k] = v;
      }
      return out;
    }

    function readSharedEffortMemory(rt, doc, opts) {
      var enabled = isEffortMemoryEnabled(doc, opts);
      var empty = { v: 1, enabled: enabled, models: Object.create(null), orch: Object.create(null) };
      if (!enabled) return empty;
      var storage = resolveStorage(rt);
      if (!storage) return empty;
      try {
        var raw = storage.getItem(EFFORT_MEMORY_KEY);
        if (!raw) return empty;
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          empty.models = sanitizeEffortBucket(parsed.models);
          empty.orch = sanitizeEffortBucket(parsed.orch);
        }
      } catch (e) {}
      return empty;
    }

    function writeSharedEffortMemory(rt, doc, keyOrPatch, effort, isOrch, opts) {
      var effOpts =
        keyOrPatch && typeof keyOrPatch === 'object' && typeof effort === 'object' && effort !== null
          ? effort
          : opts;
      if (!isEffortMemoryEnabled(doc, effOpts)) return false;
      var storage = resolveStorage(rt);
      if (!storage || typeof storage.setItem !== 'function') return false;

      var cur = readSharedEffortMemory(rt, doc, effOpts);
      if (keyOrPatch && typeof keyOrPatch === 'object') {
        if (keyOrPatch.models && typeof keyOrPatch.models === 'object') {
          var mKeys = Object.keys(keyOrPatch.models);
          for (var mi = 0; mi < mKeys.length; mi += 1) {
            var mk = String(mKeys[mi] || '').trim();
            var mv = normalizeEffortToken(keyOrPatch.models[mKeys[mi]]);
            if (mk && mv) {
              delete cur.models[mk];
              cur.models[mk] = mv;
            }
          }
        }
        if (keyOrPatch.orch && typeof keyOrPatch.orch === 'object') {
          var oKeys = Object.keys(keyOrPatch.orch);
          for (var oi = 0; oi < oKeys.length; oi += 1) {
            var ok = String(oKeys[oi] || '').trim();
            var ov = normalizeEffortToken(keyOrPatch.orch[oKeys[oi]]);
            if (ok && ov) {
              delete cur.orch[ok];
              cur.orch[ok] = ov;
            }
          }
        }
      } else {
        var baseKey = stripEffortBaseName(keyOrPatch, rt);
        var normEff = normalizeEffortToken(effort);
        if (!baseKey || !normEff) return false;
        var bucket = isOrch ? cur.orch : cur.models;
        if (bucket[baseKey] === normEff) return true;
        delete bucket[baseKey];
        bucket[baseKey] = normEff;
      }

      try {
        storage.setItem(
          EFFORT_MEMORY_KEY,
          JSON.stringify({
            v: 1,
            models: trimEffortBucket(cur.models),
            orch: trimEffortBucket(cur.orch),
          })
        );
        return true;
      } catch (e) {
        return false;
      }
    }

    function getRememberedEffort(rt, doc, modelKey, isOrch, opts) {
      var mem = readSharedEffortMemory(rt, doc, opts);
      if (!mem.enabled) return '';
      var baseKey = stripEffortBaseName(modelKey, rt);
      if (!baseKey) return '';
      var bucket = isOrch ? mem.orch : mem.models;
      var rawHit = bucket[baseKey] || bucket[String(modelKey || '').trim()] || '';
      return rawHit ? normalizeEffortToken(rawHit) : '';
    }

    /* ── Native Tooltip Suppression (Hold & Open States) ────────────────────── */

    function isOwnTooltipNode(node) {
      if (!node || typeof node !== 'object') return false;
      if (node.classList && typeof node.classList.contains === 'function' && node.classList.contains('ag-pp-bench-tooltip')) {
        return true;
      }
      if (typeof node.closest === 'function') {
        return Boolean(node.closest('#' + ROOT_ID));
      }
      return false;
    }

    function setHoldTooltipSuppression(doc, holding) {
      if (!doc || !doc.documentElement) return;
      var de = doc.documentElement;
      try {
        if (holding) {
          if (typeof de.setAttribute === 'function' && de.getAttribute('data-ag-pp-holding') !== '1') {
            de.setAttribute('data-ag-pp-holding', '1');
          }
        } else if (typeof de.removeAttribute === 'function') {
          if (!de.hasAttribute || de.hasAttribute('data-ag-pp-holding')) {
            de.removeAttribute('data-ag-pp-holding');
          }
        }
      } catch (e) {}
    }

    function setOpenTooltipSuppression(doc, open) {
      if (!doc || !doc.documentElement) return;
      var de = doc.documentElement;
      try {
        if (open) {
          if (typeof de.setAttribute === 'function' && de.getAttribute('data-ag-pp-open') !== '1') {
            de.setAttribute('data-ag-pp-open', '1');
          }
        } else if (typeof de.removeAttribute === 'function') {
          if (!de.hasAttribute || de.hasAttribute('data-ag-pp-open')) {
            de.removeAttribute('data-ag-pp-open');
          }
        }
      } catch (e) {}
    }

    function dispatchNonBubblingPointerLeave(btn, doc) {
      if (!btn || typeof btn.dispatchEvent !== 'function') return;
      try {
        var win = (doc && doc.defaultView) || (typeof window !== 'undefined' ? window : null);
        var PE = (win && win.PointerEvent) || (typeof PointerEvent === 'function' ? PointerEvent : null);
        var EV = (win && win.Event) || (typeof Event === 'function' ? Event : null);
        var evObj = null;
        if (typeof PE === 'function') {
          evObj = new PE('pointerleave', { bubbles: false, cancelable: false });
        } else if (typeof EV === 'function') {
          evObj = new EV('pointerleave', { bubbles: false, cancelable: false });
        } else {
          evObj = { type: 'pointerleave', bubbles: false, cancelable: false };
        }
        btn.dispatchEvent(evObj);
      } catch (e) {
        try {
          btn.dispatchEvent({ type: 'pointerleave', bubbles: false, cancelable: false });
        } catch (e2) {}
      }
    }

    function hideTooltipElement(tt) {
      if (!tt || isOwnTooltipNode(tt)) return;
      try {
        if (suppressedTooltipRecords && !suppressedTooltipRecords.has(tt)) {
          suppressedTooltipRecords.set(tt, {
            opacity: tt.style ? tt.style.opacity : '',
            visibility: tt.style ? tt.style.visibility : '',
            pointerEvents: tt.style ? tt.style.pointerEvents : '',
          });
          suppressedTooltipList.push(tt);
        }
        if (typeof tt.setAttribute === 'function') {
          tt.setAttribute('data-ag-pp-suppressed-tt', '1');
        }
        if (tt.style) {
          if (typeof tt.style.setProperty === 'function') {
            tt.style.setProperty('opacity', '0', 'important');
            tt.style.setProperty('visibility', 'hidden', 'important');
            tt.style.setProperty('pointer-events', 'none', 'important');
          } else {
            tt.style.opacity = '0';
            tt.style.visibility = 'hidden';
            tt.style.pointerEvents = 'none';
          }
        }
      } catch (e) {}
    }

    function restoreHiddenTooltips() {
      while (suppressedTooltipList.length > 0) {
        var tt = suppressedTooltipList.pop();
        if (!tt) continue;
        var prev = suppressedTooltipRecords ? suppressedTooltipRecords.get(tt) : null;
        if (suppressedTooltipRecords) suppressedTooltipRecords.delete(tt);
        try {
          if (typeof tt.removeAttribute === 'function') {
            tt.removeAttribute('data-ag-pp-suppressed-tt');
          }
          if (tt.style && prev) {
            if (typeof tt.style.removeProperty === 'function') {
              if (prev.opacity) tt.style.opacity = prev.opacity;
              else tt.style.removeProperty('opacity');
              if (prev.visibility) tt.style.visibility = prev.visibility;
              else tt.style.removeProperty('visibility');
              if (prev.pointerEvents) tt.style.pointerEvents = prev.pointerEvents;
              else tt.style.removeProperty('pointer-events');
            } else {
              tt.style.opacity = prev.opacity || '';
              tt.style.visibility = prev.visibility || '';
              tt.style.pointerEvents = prev.pointerEvents || '';
            }
          }
        } catch (e) {}
      }
    }

    function suppressNativeTooltip(doc, triggerBtn, active) {
      var on = Boolean(active);
      setHoldTooltipSuppression(doc, on);
      if (!on) {
        restoreHiddenTooltips();
        return;
      }
      if (triggerBtn) {
        dispatchNonBubblingPointerLeave(triggerBtn, doc);
        try {
          var activeEl = doc && doc.activeElement;
          var hasFocus =
            activeEl === triggerBtn ||
            (activeEl && typeof triggerBtn.contains === 'function' && triggerBtn.contains(activeEl));
          if (hasFocus && typeof triggerBtn.blur === 'function') {
            triggerBtn.blur();
          }
        } catch (e) {}
      }
      if (doc && typeof doc.querySelectorAll === 'function') {
        try {
          var tooltips = doc.querySelectorAll('[role="tooltip"]');
          for (var i = 0; i < tooltips.length; i += 1) {
            hideTooltipElement(tooltips[i]);
          }
        } catch (e) {}
      }
    }

    /* ── Honest 512K Real-Time Context Telemetry (Zero Synthetic Data) ──────── */

    function formatCompactTokensK(tokens) {
      var n = Math.max(0, Number(tokens) || 0);
      if (n >= 524288 && Math.abs(n - 524288) < 1024) return '512K';
      if (n >= 1000) {
        var kVal = n / 1024;
        return (kVal >= 100 ? kVal.toFixed(0) : kVal.toFixed(1).replace(/\.0$/, '')) + 'K';
      }
      return String(Math.round(n));
    }

    function parseTokenStringNumber(str) {
      if (!str || typeof str !== 'string') return NaN;
      var trimmed = str.trim();
      if (!trimmed) return NaN;
      /* When text is formatted like "105K / 512K" or "— / 512K", parse only the numerator before "/" */
      var slashIdx = trimmed.indexOf('/');
      var target = slashIdx !== -1 ? trimmed.slice(0, slashIdx).trim() : trimmed;
      if (!target || /^[—\-]+$/.test(target)) return NaN;
      var m = /(\d+(?:\.\d+)?)\s*([kKmM])?\b/.exec(target.replace(/,/g, ''));
      if (!m) return NaN;
      var num = parseFloat(m[1]);
      if (!Number.isFinite(num)) return NaN;
      var unit = (m[2] || '').toLowerCase();
      if (unit === 'k') return Math.round(num * 1024);
      if (unit === 'm') return Math.round(num * 1024 * 1024);
      return Math.round(num);
    }

    function resolvePulseHostForTelemetry(doc, rt, opts) {
      var anchor = opts && opts.anchorBtn ? opts.anchorBtn : null;
      var tel = rt && rt.__agPrismTelemetry;
      try {
        if (anchor && tel && typeof tel.getBarForView === 'function') {
          var byView = tel.getBarForView(anchor);
          if (byView && byView.shadowRoot) return byView;
        }
      } catch (e0) {}
      try {
        if (anchor && typeof anchor.closest === 'function') {
          var pane = anchor.closest('[data-testid="conversation-view"], [data-testid="agent-input-box"]');
          if (pane && typeof pane.querySelector === 'function') {
            var localBar = pane.querySelector(
              '[data-ag-prism-pulse-bar], #ag-prism-pulse-bar, [data-ag-pulse-bar="true"], #ag-pulse-status-bar'
            );
            if (localBar && localBar.shadowRoot) return localBar;
          }
        }
      } catch (e1) {}
      try {
        if (tel && typeof tel.getActiveBar === 'function') {
          var actBar = tel.getActiveBar();
          if (actBar && actBar.shadowRoot) return actBar;
        }
      } catch (e2) {}
      try {
        if (!doc) return null;
        return (
          (typeof doc.getElementById === 'function' &&
            (doc.getElementById('ag-prism-pulse-bar') || doc.getElementById('ag-pulse-status-bar'))) ||
          (typeof doc.querySelector === 'function' &&
            doc.querySelector('[data-ag-prism-pulse-bar], #ag-prism-pulse-bar, #ag-pulse-status-bar')) ||
          null
        );
      } catch (e3) {
        return null;
      }
    }

    function extractTelemetrySnapshotObj(rt, doc, opts) {
      if (!rt || typeof rt !== 'object') return null;
      var anchor = opts && opts.anchorBtn ? opts.anchorBtn : null;
      if (rt.__agPrismTelemetry && typeof rt.__agPrismTelemetry.getSnapshotForBar === 'function') {
        try {
          var scopedBar = anchor && typeof rt.__agPrismTelemetry.getBarForView === 'function'
            ? rt.__agPrismTelemetry.getBarForView(anchor)
            : typeof rt.__agPrismTelemetry.getActiveBar === 'function'
            ? rt.__agPrismTelemetry.getActiveBar()
            : null;
          var scopedSnap = rt.__agPrismTelemetry.getSnapshotForBar(scopedBar || anchor);
          if (scopedSnap && typeof scopedSnap === 'object') {
            var sp = scopedSnap.speed || null;
            var cx = sp && sp.context ? sp.context : null;
            if (cx || sp) {
              return {
                usedTokens: cx && cx.usedTokens !== undefined ? cx.usedTokens : sp ? sp.totalTokens : undefined,
                maxTokens: cx && cx.maxTokens > 0 ? cx.maxTokens : undefined,
                usedFraction: cx && typeof cx.usedFraction === 'number' ? cx.usedFraction : undefined,
                kvCacheRate: sp && sp.cache && typeof sp.cache.hitRate === 'number' ? sp.cache.hitRate : sp ? sp.cacheHitRate : undefined,
                tps: sp && typeof sp.tps === 'number' ? sp.tps : undefined,
              };
            }
          }
        } catch (eSc) {}
      }
      var candidates = [rt.__agPrismTelemetry, rt.__agPrismUsage, rt.__agPrismMetrics];
      for (var i = 0; i < candidates.length; i += 1) {
        var c = candidates[i];
        if (!c || typeof c !== 'object') continue;
        if (typeof c.getState === 'function') {
          try {
            var st = c.getState();
            if (st && typeof st === 'object') return st;
          } catch (e) {}
        }
        if (c.snapshot && typeof c.snapshot === 'object') return c.snapshot;
        return c;
      }
      if (rt.__agCsPulseBridgeInst && typeof rt.__agCsPulseBridgeInst.getDebugState === 'function') {
        try {
          var dbg = rt.__agCsPulseBridgeInst.getDebugState();
          if (dbg && typeof dbg === 'object') return dbg;
        } catch (e2) {}
      }
      return null;
    }

    function queryTelemetryDomNode(doc, selectorList, rt, opts) {
      if (!doc) return null;
      try {
        var pulseHost = resolvePulseHostForTelemetry(doc, rt, opts);
        var sr = pulseHost && pulseHost.shadowRoot;
        if (sr) {
          for (var j = 0; j < selectorList.length; j += 1) {
            var srSel = selectorList[j];
            if (typeof sr.querySelector === 'function') {
              var srHit = sr.querySelector(srSel);
              if (srHit) return srHit;
            }
          }
        }
      } catch (e2) {}
      var scope = doc;
      try {
        var anchor = opts && opts.anchorBtn ? opts.anchorBtn : null;
        var pane = anchor && typeof anchor.closest === 'function' ? anchor.closest('[data-testid="conversation-view"]') : null;
        if (pane) scope = pane;
      } catch (eP) {}
      for (var i = 0; i < selectorList.length; i += 1) {
        var sel = selectorList[i];
        if (typeof scope.querySelector === 'function') {
          try {
            var hit = scope.querySelector(sel);
            if (hit) return hit;
          } catch (e) {}
        }
        if (scope !== doc && typeof doc.querySelector === 'function') {
          try {
            var docHit = doc.querySelector(sel);
            if (docHit) return docHit;
          } catch (eD) {}
        }
      }
      return null;
    }

    function buildOfflineTelemetryResult(reason) {
      return {
        available: false,
        reason: reason || 'offline',
        usedTokens: null,
        maxTokens: null,
        pct: null,
        kvCacheRate: null,
        pulsePoints: null,
        usedLabel: '—',
        maxLabel: '—',
        freeLabel: '—',
        ratio: null,
        percentText: '—',
        cacheText: '—',
        tpsText: '—',
        healthLevel: 'offline',
        pulse: null,
      };
    }

    /**
     * Read real-time 512K context telemetry strictly from window.__agPrismTelemetry or live DOM nodes.
     * Never synthesizes fake token counts, KV cache rates, or wave arrays when telemetry is disabled or offline.
     */
    function readHostContextTelemetry(doc, rt, opts) {
      var skipDomScan = Boolean(opts && opts.skipDomScan);
      try {
        var de = doc && doc.documentElement;
        if (de && typeof de.getAttribute === 'function' && de.getAttribute('data-ag-cs-telemetry') === 'off') {
          return buildOfflineTelemetryResult('disabled');
        }
      } catch (e) {}

      var maxTokens = NaN;
      var usedTokens = NaN;
      var pctDirect = NaN;
      var cacheRate = NaN;
      var tps = NaN;
      var pulsePoints = null;

      try {
        var src = extractTelemetrySnapshotObj(rt, doc, opts);
        if (src) {
          if (src.telemetryModule === 'off' || src.disabled === true || src.enabled === false) {
            return buildOfflineTelemetryResult('disabled');
          }
          var rawMax = src.maxTokens || src.contextLimit || src.windowSize;
          if (typeof rawMax === 'number' && Number.isFinite(rawMax) && rawMax > 0) {
            maxTokens = Math.round(rawMax);
          }
          var rawUsed =
            src.usedTokens !== undefined
              ? src.usedTokens
              : src.contextTokens !== undefined
              ? src.contextTokens
              : src.totalTokens !== undefined
              ? src.totalTokens
              : src.tokens;
          if (typeof rawUsed === 'number' && Number.isFinite(rawUsed) && rawUsed >= 0) {
            usedTokens = rawUsed;
          } else if (typeof rawUsed === 'string') {
            usedTokens = parseTokenStringNumber(rawUsed);
          }
          if (!Number.isFinite(usedTokens) && typeof src.usedFraction === 'number' && Number.isFinite(src.usedFraction) && src.usedFraction >= 0) {
            var capForFrac = Number.isFinite(maxTokens) ? maxTokens : DEFAULT_MAX_CONTEXT_TOKENS;
            usedTokens = Math.round(Math.max(0, Math.min(1, src.usedFraction)) * capForFrac);
            maxTokens = capForFrac;
          }
          var rawCache = src.kvCacheRate !== undefined ? src.kvCacheRate : src.cacheHitRate;
          if (typeof rawCache === 'number' && Number.isFinite(rawCache) && rawCache >= 0) {
            cacheRate = rawCache <= 1 ? rawCache * 100 : rawCache;
          }
          if (typeof src.tps === 'number' && Number.isFinite(src.tps) && src.tps >= 0) {
            tps = src.tps;
          }
          var rawHist = Array.isArray(src.pulsePoints)
            ? src.pulsePoints
            : Array.isArray(src.history)
            ? src.history
            : null;
          if (rawHist && rawHist.length >= 2) {
            var validPts = [];
            for (var hi = 0; hi < Math.min(12, rawHist.length); hi += 1) {
              var hv = Number(rawHist[hi]);
              if (Number.isFinite(hv)) {
                validPts.push(Math.max(0, Math.min(1, hv)));
              }
            }
            if (validPts.length >= 2) pulsePoints = validPts;
          }
        }
      } catch (e2) {}

      if (!Number.isFinite(usedTokens) && doc && !skipDomScan) {
        try {
          var tokNode = queryTelemetryDomNode(
            doc,
            ['[data-testid="context-tokens"]', '#context-tokens', '#ag-pulse-status-bar [data-testid*="token"]'],
            rt,
            opts
          );
          if (tokNode && typeof tokNode.textContent === 'string') {
            var parsedTok = parseTokenStringNumber(tokNode.textContent);
            if (Number.isFinite(parsedTok) && parsedTok >= 0) {
              usedTokens = parsedTok;
              if (!Number.isFinite(maxTokens)) {
                var slashPos = tokNode.textContent.indexOf('/');
                if (slashPos !== -1) {
                  var parsedDenom = parseTokenStringNumber(tokNode.textContent.slice(slashPos + 1));
                  if (Number.isFinite(parsedDenom) && parsedDenom > 0) {
                    maxTokens = parsedDenom;
                  }
                }
              }
            }
          }
          if (!Number.isFinite(usedTokens)) {
            var pctNode = queryTelemetryDomNode(doc, ['[data-testid="context-percent"]', '#context-percent'], rt, opts);
            if (pctNode && typeof pctNode.textContent === 'string') {
              var pm = /(\d+(?:\.\d+)?)\s*%/.exec(pctNode.textContent);
              if (pm) {
                pctDirect = Math.max(0, Math.min(100, parseFloat(pm[1])));
                if (!Number.isFinite(maxTokens)) maxTokens = DEFAULT_MAX_CONTEXT_TOKENS;
                usedTokens = Math.round((pctDirect / 100) * maxTokens);
              }
            }
          }
          if (!Number.isFinite(tps)) {
            var tpsNode = queryTelemetryDomNode(doc, ['[data-testid="tps"]', '#tps'], rt, opts);
            if (tpsNode && typeof tpsNode.textContent === 'string') {
              var tm = /(\d+(?:\.\d+)?)/.exec(tpsNode.textContent);
              if (tm) tps = parseFloat(tm[1]);
            }
          }
        } catch (e3) {}
      }

      if (!Number.isFinite(usedTokens) || usedTokens < 0) {
        var offRes = buildOfflineTelemetryResult('offline');
        if (skipDomScan) offRes.domScanDeferred = true;
        return offRes;
      }

      if (!Number.isFinite(maxTokens) || maxTokens <= 0) {
        maxTokens = DEFAULT_MAX_CONTEXT_TOKENS;
      }

      usedTokens = Math.max(0, Math.min(maxTokens, Math.round(usedTokens)));
      var ratio = maxTokens > 0 ? Math.max(0, Math.min(1, usedTokens / maxTokens)) : 0;
      var pct = Number.isFinite(pctDirect) ? Math.round(pctDirect * 10) / 10 : Math.round(ratio * 1000) / 10;
      var normCache = Number.isFinite(cacheRate) ? Math.round(Math.max(0, Math.min(100, cacheRate)) * 10) / 10 : null;
      var normTps = Number.isFinite(tps) ? Math.round(tps) : null;

      return {
        available: true,
        reason: 'live',
        usedTokens: usedTokens,
        maxTokens: maxTokens,
        pct: pct,
        kvCacheRate: normCache,
        pulsePoints: pulsePoints,
        usedLabel: formatCompactTokensK(usedTokens),
        maxLabel: formatCompactTokensK(maxTokens),
        freeLabel: formatCompactTokensK(Math.max(0, maxTokens - usedTokens)),
        ratio: ratio,
        percentText: pct.toFixed(1) + '%',
        cacheText: normCache !== null ? Math.round(normCache) + '%' : '—',
        tpsText: normTps !== null ? normTps + ' tok/s' : '—',
        healthLevel: ratio > 0.78 ? 'warn' : 'ok',
        pulse: pulsePoints,
      };
    }

    /* ── React Fiber & Host DOM Menu Context Readers ───────────────────────── */

    function getReactFiber(el) {
      if (!el || typeof el !== 'object') return null;
      var raw = null;
      var keys = Object.keys(el);
      for (var i = 0; i < keys.length; i += 1) {
        var k = keys[i];
        if (k.indexOf('__reactFiber$') === 0 || k.indexOf('__reactInternalInstance$') === 0) {
          raw = el[k];
          break;
        }
      }
      if (!raw) return null;
      if (raw.alternate) {
        var rootFiber = raw;
        var guard = 0;
        while (rootFiber.return && guard < 80) {
          rootFiber = rootFiber.return;
          guard += 1;
        }
        if (
          rootFiber &&
          rootFiber.stateNode &&
          rootFiber.stateNode.current &&
          rootFiber.stateNode.current !== rootFiber
        ) {
          return raw.alternate;
        }
      }
      return raw;
    }

    function readHostModelContextFromFiber(el) {
      var startFiber = getReactFiber(el);
      if (!startFiber) return null;
      var selectorCtx = null;
      var innerPopoverProps = null;
      var outerPopoverProps = null;
      var conversationId = undefined;
      var hasConversationSelector = false;
      var globalModelCtx = null;
      var cur = startFiber;

      for (var step = 0; cur && step < 500; step += 1, cur = cur.return) {
        var props = cur.memoizedProps;
        if (!props || typeof props !== 'object') continue;
        if (!selectorCtx && props.value && typeof props.value === 'object') {
          var val = props.value;
          if (val.effortIndex instanceof Map && Array.isArray(val.modelOptions)) {
            selectorCtx = val;
          }
        }
        if (
          typeof props.setIsOpen === 'function' &&
          typeof props.setSelectedModel === 'function' &&
          Array.isArray(props.modelOptions)
        ) {
          if (!innerPopoverProps) innerPopoverProps = props;
          outerPopoverProps = props;
        }
        if (!hasConversationSelector && 'conversationId' in props && 'placement' in props) {
          hasConversationSelector = true;
          conversationId = props.conversationId;
        }
        if (
          !globalModelCtx &&
          props.value &&
          typeof props.value === 'object' &&
          typeof props.value.setModelConfigByLabelForConversation === 'function'
        ) {
          globalModelCtx = props.value;
        }
        if (selectorCtx && outerPopoverProps && hasConversationSelector && globalModelCtx) {
          break;
        }
      }

      if (!selectorCtx && !innerPopoverProps && !outerPopoverProps && !globalModelCtx) return null;

      var modelOptions =
        (outerPopoverProps && outerPopoverProps.modelOptions) ||
        (innerPopoverProps && innerPopoverProps.modelOptions) ||
        (selectorCtx && selectorCtx.modelOptions) ||
        (globalModelCtx && globalModelCtx.visibleModelConfigs) ||
        [];

      var selectedModel =
        (outerPopoverProps && outerPopoverProps.selectedModel) ||
        (innerPopoverProps && innerPopoverProps.selectedModel) ||
        (selectorCtx && selectorCtx.selectedModel) ||
        (globalModelCtx &&
          (hasConversationSelector && typeof globalModelCtx.getModelConfigForConversation === 'function'
            ? globalModelCtx.getModelConfigForConversation(conversationId)
            : globalModelCtx.currentModelConfig)) ||
        null;

      var pickFn = function (obj, key) {
        return obj && typeof obj[key] === 'function' ? obj[key] : null;
      };

      var orchPlanners =
        selectorCtx && Array.isArray(selectorCtx.orchestratorPlanners) ? selectorCtx.orchestratorPlanners : null;
      var orchPlannerIndex =
        selectorCtx && selectorCtx.orchestratorPlannerIndex instanceof Map
          ? selectorCtx.orchestratorPlannerIndex
          : null;
      var orchDef = (selectorCtx && selectorCtx.orchestratorDefaultPlanner) || null;
      var orchPick =
        selectorCtx && selectorCtx.orchestratorPick && typeof selectorCtx.orchestratorPick === 'object'
          ? selectorCtx.orchestratorPick
          : null;

      return {
        effortIndex: selectorCtx && selectorCtx.effortIndex instanceof Map ? selectorCtx.effortIndex : null,
        modelOptions: modelOptions,
        selectedModel: selectedModel,
        orchestratorPlanners: orchPlanners,
        orchestratorPlannerIndex: orchPlannerIndex,
        orchestratorDefaultPlanner: orchDef,
        orchestratorPick: orchPick,
        conversationId: conversationId,
        setModelConfigByLabelForConversation: pickFn(globalModelCtx, 'setModelConfigByLabelForConversation'),
        setCurrentModelConfigByLabel: pickFn(globalModelCtx, 'setCurrentModelConfigByLabel'),
        unwrappedSetSelectedModel:
          pickFn(outerPopoverProps, 'setSelectedModel') ||
          pickFn(innerPopoverProps, 'setSelectedModel') ||
          pickFn(selectorCtx, 'setSelectedModel'),
        setIsOpen:
          pickFn(outerPopoverProps, 'setIsOpen') ||
          pickFn(innerPopoverProps, 'setIsOpen') ||
          pickFn(selectorCtx, 'setIsOpen'),
      };
    }

    function isInsideExcludedZoneForMenuScan(node) {
      if (!node || typeof node.closest !== 'function') return false;
      return Boolean(node.closest('#' + ROOT_ID + ', .ag-cs-settings-sec, #ag-cs-settings-modal'));
    }

    function isOwnedDecorationNode(node) {
      if (!node || typeof node !== 'object') return false;
      var cl = node.classList;
      if (cl && typeof cl.contains === 'function') {
        if (cl.contains('ag-cs-model-glyph') || cl.contains('ag-pp-mini-keycap')) return true;
      }
      if (typeof node.getAttribute === 'function') {
        if (node.getAttribute('data-ag-owned') === '1') return true;
      }
      return false;
    }

    function readCleanButtonLabel(btn, includeAria) {
      if (!btn) return '';
      var parts = [];
      function walk(node) {
        if (!node || isOwnedDecorationNode(node)) return;
        if (node.nodeType === 3) {
          parts.push(node.nodeValue || '');
          return;
        }
        if (node.childNodes && node.childNodes.length > 0) {
          for (var i = 0; i < node.childNodes.length; i += 1) {
            walk(node.childNodes[i]);
          }
          return;
        }
        if (node.children && node.children.length > 0) {
          var nonOwned = 0;
          for (var j = 0; j < node.children.length; j += 1) {
            var ch = node.children[j];
            if (isOwnedDecorationNode(ch)) continue;
            nonOwned += 1;
            walk(ch);
          }
          if (!nonOwned && typeof node._text === 'string' && node._text) {
            parts.push(node._text);
          }
          return;
        }
        if (typeof node._text === 'string') {
          parts.push(node._text);
        } else if (typeof node.textContent === 'string') {
          parts.push(node.textContent);
        }
      }
      walk(btn);
      if (includeAria && typeof btn.getAttribute === 'function') {
        var aria = btn.getAttribute('aria-label') || '';
        if (aria) parts.push(aria);
      }
      return parts.join(' ').replace(/\s+/g, ' ').trim();
    }

    function readHostModelContextFromDomMenu(el, docRef) {
      if (!docRef || typeof docRef.querySelectorAll !== 'function') return null;
      try {
        var nodes = docRef.querySelectorAll(
          '[data-testid="model-selector-panel"] [role="menuitem"], [data-testid="model-selector-panel"] [role="option"], [data-testid="model-selector-panel"] button, [role="menu"] [role="menuitem"], [role="listbox"] [role="option"]'
        );
        if (!nodes || nodes.length === 0) return null;
        var optsList = [];
        for (var i = 0; i < nodes.length; i += 1) {
          var itemNode = nodes[i];
          if (!itemNode || isInsideExcludedZoneForMenuScan(itemNode)) continue;
          var txt = typeof itemNode.textContent === 'string' ? itemNode.textContent.replace(/\s+/g, ' ').trim() : '';
          if (!txt) continue;
          var mid =
            (typeof itemNode.getAttribute === 'function' &&
              (itemNode.getAttribute('data-model-id') || itemNode.getAttribute('data-value'))) ||
            '';
          optsList.push({
            label: txt,
            modelId: mid,
            _domNode: itemNode,
          });
        }
        if (optsList.length === 0) return null;
        var currentText = el ? readCleanButtonLabel(el, false) : '';
        var selectedOpt = null;
        for (var j = 0; j < optsList.length; j += 1) {
          if (currentText && optsList[j].label === currentText) {
            selectedOpt = optsList[j];
            break;
          }
        }
        if (!selectedOpt && optsList.length > 0 && currentText) {
          selectedOpt = { label: currentText, modelId: '' };
        }
        return {
          modelOptions: optsList,
          selectedModel: selectedOpt,
          _isDomMenuCtx: true,
        };
      } catch (e) {
        return null;
      }
    }

    function readHostModelContext(el, rt, docRef) {
      var mock = rt && rt.__agPeriodicMockHost;
      if (mock && typeof mock === 'object') {
        if (typeof mock.getContext === 'function') {
          var dyn = mock.getContext(el);
          if (dyn) return dyn;
        }
        if (Array.isArray(mock.modelOptions)) {
          return mock;
        }
      }
      var fiberCtx = readHostModelContextFromFiber(el);
      if (fiberCtx) return fiberCtx;
      var effectiveDoc = docRef || (rt && rt.document) || null;
      return readHostModelContextFromDomMenu(el, effectiveDoc);
    }

    /* ── Trigger Button Discovery ──────────────────────────────────────────── */

    function elementMatches(el, selector) {
      if (!el) return false;
      if (typeof el.matches === 'function') return el.matches(selector);
      return false;
    }

    function isInsideExcludedZone(el) {
      if (!el || typeof el.closest !== 'function') return false;
      return Boolean(
        el.closest(
          '#' +
            ROOT_ID +
            ', [role="menu"], [role="listbox"], [data-radix-popper-content-wrapper], .ag-cs-settings-sec, #ag-cs-settings-modal'
        )
      );
    }

    function isLikelyComposerToolbar(btn) {
      if (!btn || typeof btn.closest !== 'function') return false;
      return Boolean(
        btn.closest(
          '[role="toolbar"], form, [data-testid*="composer"], [data-testid*="input"], .ag-cs-home-panel, footer'
        )
      );
    }

    function matchModelTriggerButton(target, rt, doc) {
      if (!target || typeof target.closest !== 'function') return null;
      var btn = target.closest('button, [role="button"]');
      if (!btn) return null;
      if (isInsideExcludedZone(btn)) return null;

      if (elementMatches(btn, '[data-testid="model-selector-trigger"], [data-ag-pp-trigger="1"]')) {
        return btn;
      }
      if (typeof btn.querySelector === 'function' && btn.querySelector('.ag-cs-model-glyph')) {
        return btn;
      }
      var hasPopup = typeof btn.hasAttribute === 'function' && btn.hasAttribute('aria-haspopup');
      if (hasPopup || isLikelyComposerToolbar(btn)) {
        var labelText = readCleanButtonLabel(btn, true);
        if (MODEL_TRIGGER_TEXT_RE.test(labelText) && readHostModelContext(btn, rt, doc)) {
          return btn;
        }
      }
      return null;
    }

    function isTriggerCandidateVisible(el) {
      if (!el || el.isConnected === false || el.hidden === true) return false;
      if (el.style && (el.style.display === 'none' || el.style.visibility === 'hidden')) return false;
      if (typeof el.closest === 'function' && el.closest('[hidden], .hidden')) return false;
      if (typeof el.checkVisibility === 'function') {
        try {
          if (!el.checkVisibility()) return false;
        } catch (e) {}
      }
      return true;
    }

    function isSubagentTriggerNode(el) {
      return Boolean(el && typeof el.closest === 'function' && el.closest('[data-testid="subagent-tab-conversation"]'));
    }

    function isTriggerExpanded(el) {
      if (!el || typeof el.getAttribute !== 'function') return false;
      return (
        el.getAttribute('aria-expanded') === 'true' ||
        el.getAttribute('data-state') === 'open' ||
        (typeof el.hasAttribute === 'function' &&
          el.hasAttribute('data-popup-open') &&
          el.getAttribute('data-popup-open') !== 'false')
      );
    }

    function findTriggerWithinScope(scope) {
      if (!scope) return null;
      var sel = '[data-testid="model-selector-trigger"], [data-ag-pp-trigger="1"]';
      if (
        elementMatches(scope, sel) &&
        !isInsideExcludedZone(scope) &&
        !isSubagentTriggerNode(scope) &&
        scope.isConnected !== false
      ) {
        return scope;
      }
      if (typeof scope.querySelectorAll === 'function') {
        var list = scope.querySelectorAll(sel);
        var fallback = null;
        for (var i = 0; i < list.length; i += 1) {
          var cand = list[i];
          if (!cand || isInsideExcludedZone(cand) || isSubagentTriggerNode(cand)) continue;
          if (isTriggerCandidateVisible(cand)) return cand;
          if (!fallback) fallback = cand;
        }
        if (fallback) return fallback;
        var glyphs = scope.querySelectorAll('.ag-cs-model-glyph');
        for (var j = 0; j < glyphs.length; j += 1) {
          var g = glyphs[j];
          var gBtn = g && typeof g.closest === 'function' ? g.closest('button, [role="button"]') : null;
          if (gBtn && !isInsideExcludedZone(gBtn) && !isSubagentTriggerNode(gBtn)) {
            if (isTriggerCandidateVisible(gBtn)) return gBtn;
            if (!fallback) fallback = gBtn;
          }
        }
        return fallback;
      }
      if (typeof scope.querySelector === 'function') {
        var single = scope.querySelector(sel);
        if (single && !isInsideExcludedZone(single) && !isSubagentTriggerNode(single)) return single;
      }
      return null;
    }

    function isHintConnected(doc, node) {
      if (!node || typeof node !== 'object' || node.isConnected === false) return false;
      if (node.parentNode) {
        var cur = node;
        var guard = 0;
        while (cur && guard < 64) {
          if (cur.isConnected === false) return false;
          if (doc && (cur === doc || cur === doc.body || cur === doc.documentElement)) return true;
          cur = cur.parentNode;
          guard += 1;
        }
        return false;
      }
      return true;
    }

    function findFallbackModelTrigger(doc, hintEl) {
      if (!doc || typeof doc.querySelector !== 'function') return null;
      var paneSel = '[data-testid="agent-input-box"], [data-testid="conversation-view"], .surface-composer-card, [data-tiling-pane]';
      if (isHintConnected(doc, hintEl)) {
        var fromHintDirect = findTriggerWithinScope(hintEl);
        if (fromHintDirect) return fromHintDirect;
        if (typeof hintEl.closest === 'function') {
          var hintPane = hintEl.closest(paneSel);
          if (hintPane) {
            var fromHintPane = findTriggerWithinScope(hintPane);
            if (fromHintPane) return fromHintPane;
          }
        }
      }
      var allTriggers = [];
      if (typeof doc.querySelectorAll === 'function') {
        try {
          var nodes = doc.querySelectorAll('[data-testid="model-selector-trigger"], [data-ag-pp-trigger="1"]');
          for (var i = 0; i < nodes.length; i += 1) {
            var n = nodes[i];
            if (!n || isInsideExcludedZone(n) || isSubagentTriggerNode(n)) continue;
            allTriggers.push(n);
            if (isTriggerExpanded(n) && isTriggerCandidateVisible(n)) return n;
          }
        } catch (eAll) {}
      }
      try {
        var act = doc.activeElement;
        if (act && act !== doc.body && act !== doc.documentElement && !isInsideExcludedZone(act)) {
          var actDirect = findTriggerWithinScope(act);
          if (actDirect) return actDirect;
          if (typeof act.closest === 'function') {
            var actPane = act.closest(paneSel);
            if (actPane) {
              var fromActPane = findTriggerWithinScope(actPane);
              if (fromActPane) return fromActPane;
            }
          }
        }
      } catch (eAct) {}
      var firstHidden = null;
      for (var k = 0; k < allTriggers.length; k += 1) {
        if (isTriggerCandidateVisible(allTriggers[k])) return allTriggers[k];
        if (!firstHidden) firstHidden = allTriggers[k];
      }
      if (firstHidden) return firstHidden;
      var explicit = doc.querySelector('[data-testid="model-selector-trigger"], [data-ag-pp-trigger="1"]');
      if (explicit && !isInsideExcludedZone(explicit)) return explicit;
      var glyph = doc.querySelector('.ag-cs-model-glyph');
      if (glyph && typeof glyph.closest === 'function') {
        var gBtn = glyph.closest('button, [role="button"]');
        if (gBtn && !isInsideExcludedZone(gBtn)) return gBtn;
      }
      return null;
    }

    function isModelTriggerLocked(triggerBtn, doc) {
      var btn = triggerBtn || findFallbackModelTrigger(doc);
      if (btn) {
        try {
          if (btn.disabled === true) return true;
          if (typeof btn.hasAttribute === 'function' && btn.hasAttribute('disabled')) return true;
          if (typeof btn.getAttribute === 'function') {
            if (btn.getAttribute('aria-disabled') === 'true') return true;
            var dd = btn.getAttribute('data-disabled');
            if (dd !== null && dd !== undefined && dd !== 'false') return true;
            var al = btn.getAttribute('aria-label') || '';
            if (/cannot be changed while.*running|运行中.*无法切换/i.test(al)) return true;
          }
          var cls = typeof btn.className === 'string' ? btn.className : '';
          if (cls && cls.indexOf('cursor-not-allowed') !== -1) return true;
        } catch (eBtn) {}
      }
      var scope = null;
      var hasExplicitPane = false;
      if (btn && typeof btn.closest === 'function') {
        scope = btn.closest('[data-testid="agent-input-box"]') || btn.closest('[data-testid="conversation-view"]');
        if (scope) hasExplicitPane = true;
      }
      if (!scope && !hasExplicitPane && doc && doc.activeElement && typeof doc.activeElement.closest === 'function') {
        var actBox =
          doc.activeElement.closest('[data-testid="agent-input-box"]') ||
          doc.activeElement.closest('[data-testid="conversation-view"]');
        if (actBox && !isSubagentTriggerNode(actBox)) scope = actBox;
      }
      if (!scope && !hasExplicitPane && doc && typeof doc.querySelectorAll === 'function') {
        try {
          var boxes = doc.querySelectorAll('[data-testid="agent-input-box"]');
          for (var i = 0; i < boxes.length; i += 1) {
            var b = boxes[i];
            if (b && !isSubagentTriggerNode(b)) {
              scope = b;
              break;
            }
          }
        } catch (eBox) {}
      }
      if (scope && typeof scope.querySelector === 'function') {
        try {
          var cancelBtn = scope.querySelector('[data-testid="input-cancel-button"]');
          if (cancelBtn) {
            var hidden = cancelBtn.hidden === true || (cancelBtn.style && cancelBtn.style.display === 'none');
            if (!hidden) return true;
          }
        } catch (eCan) {}
      }
      return false;
    }

    function collectVisibleModelTriggerButtons(doc) {
      var found = [];
      if (!doc || typeof doc.querySelectorAll !== 'function') return found;
      var pushUnique = function (btn) {
        if (!btn || isInsideExcludedZone(btn)) return;
        if (found.indexOf(btn) === -1) found.push(btn);
      };
      try {
        var triggers = doc.querySelectorAll('[data-testid="model-selector-trigger"], [data-ag-pp-trigger="1"]');
        for (var i = 0; i < triggers.length; i += 1) {
          pushUnique(triggers[i]);
        }
        var glyphs = doc.querySelectorAll('.ag-cs-model-glyph');
        for (var j = 0; j < glyphs.length; j += 1) {
          var g = glyphs[j];
          if (g && typeof g.closest === 'function') {
            pushUnique(g.closest('button, [role="button"]'));
          }
        }
      } catch (e) {}
      return found;
    }

    /* ── Host Menu Dismiss & Commit ────────────────────────────────────────── */

    function dismissNativeHostMenu(ctx, doc) {
      if (ctx && typeof ctx.setIsOpen === 'function') {
        try {
          ctx.setIsOpen(false);
        } catch (e) {}
      }
      if (!doc || typeof doc.querySelectorAll !== 'function') return;
      try {
        var menus = doc.querySelectorAll(
          '[data-testid="model-selector-panel"], [data-radix-popper-content-wrapper] [role="menu"], [data-radix-popper-content-wrapper] [role="listbox"]'
        );
        for (var i = 0; i < menus.length; i += 1) {
          var menuEl = menus[i];
          if (menuEl && typeof menuEl.dispatchEvent === 'function' && typeof KeyboardEvent === 'function') {
            menuEl.dispatchEvent(
              new KeyboardEvent('keydown', {
                key: 'Escape',
                code: 'Escape',
                keyCode: 27,
                bubbles: true,
                cancelable: true,
              })
            );
          }
        }
      } catch (e) {}
    }

    function triggerDomMenuItemIfPresent(targetOption, doc) {
      if (!targetOption) return false;
      var domTarget = targetOption._domNode || targetOption.element || targetOption.el || null;
      if (!domTarget && doc && typeof doc.querySelectorAll === 'function' && targetOption.label) {
        try {
          var items = doc.querySelectorAll(
            '[data-testid="model-selector-panel"] [role="menuitem"], [data-testid="model-selector-panel"] [role="option"], [data-testid="model-selector-panel"] button, [role="menu"] [role="menuitem"], [role="listbox"] [role="option"]'
          );
          for (var i = 0; i < items.length; i += 1) {
            var candidate = items[i];
            if (!candidate || (candidate.classList && candidate.classList.contains('demo-native-item'))) continue;
            var t = typeof candidate.textContent === 'string' ? candidate.textContent.replace(/\s+/g, ' ').trim() : '';
            if (t === targetOption.label) {
              domTarget = candidate;
              break;
            }
          }
        } catch (e) {}
      }
      if (!domTarget) return false;
      try {
        if (typeof domTarget.click === 'function') {
          domTarget.click();
          return true;
        }
        if (typeof domTarget.dispatchEvent === 'function') {
          domTarget.dispatchEvent({
            type: 'click',
            button: 0,
            bubbles: true,
            cancelable: true,
            preventDefault: function () {},
            stopPropagation: function () {},
            stopImmediatePropagation: function () {},
          });
          return true;
        }
      } catch (e) {}
      return false;
    }

    function commitModelOption(ctx, targetOption, doc, onAfterCommit, anchorBtn) {
      if (!targetOption || !targetOption.label) return false;
      var applied = false;
      try {
        if (typeof targetOption.onClick === 'function') {
          targetOption.onClick(targetOption);
          applied = true;
        } else if (typeof targetOption.click === 'function' && !targetOption.nodeType) {
          targetOption.click();
          applied = true;
        }
        if (ctx && typeof ctx.onSelectModel === 'function') {
          ctx.onSelectModel(targetOption);
          ctx.selectedModel = targetOption;
          applied = true;
        }
        if (ctx && typeof ctx.setModelConfigByLabelForConversation === 'function') {
          ctx.setModelConfigByLabelForConversation(targetOption.label, ctx.conversationId, true);
          ctx.selectedModel = targetOption;
          triggerDomMenuItemIfPresent(targetOption, doc);
          if (typeof onAfterCommit === 'function') onAfterCommit(targetOption);
          return true;
        }
        if (ctx && typeof ctx.unwrappedSetSelectedModel === 'function') {
          var paneScope =
            anchorBtn && typeof anchorBtn.closest === 'function'
              ? anchorBtn.closest('[data-testid="agent-input-box"], [data-testid="conversation-view"]')
              : null;
          var editor =
            (paneScope && typeof paneScope.querySelector === 'function'
              ? paneScope.querySelector('[contenteditable="true"]')
              : null) ||
            (doc && typeof doc.querySelector === 'function' ? doc.querySelector('[contenteditable="true"]') : null);
          var prevActive = doc ? doc.activeElement : null;
          var blockEditorSteal = function (ev) {
            if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
            if (editor && typeof editor.blur === 'function') {
              try {
                editor.blur();
              } catch (e) {}
            }
          };
          if (editor && typeof editor.addEventListener === 'function') {
            editor.addEventListener('focus', blockEditorSteal, true);
          }
          try {
            ctx.unwrappedSetSelectedModel(targetOption);
            ctx.selectedModel = targetOption;
            if (editor && doc && doc.activeElement === editor && typeof editor.blur === 'function') {
              try {
                editor.blur();
              } catch (e) {}
              if (prevActive && prevActive !== editor && typeof prevActive.focus === 'function') {
                try {
                  prevActive.focus();
                } catch (e) {}
              }
            }
          } finally {
            if (editor && typeof editor.removeEventListener === 'function') {
              editor.removeEventListener('focus', blockEditorSteal, true);
            }
          }
          triggerDomMenuItemIfPresent(targetOption, doc);
          if (typeof onAfterCommit === 'function') onAfterCommit(targetOption);
          return true;
        }
        if (ctx && typeof ctx.setCurrentModelConfigByLabel === 'function') {
          ctx.setCurrentModelConfigByLabel(targetOption.label);
          ctx.selectedModel = targetOption;
          triggerDomMenuItemIfPresent(targetOption, doc);
          if (typeof onAfterCommit === 'function') onAfterCommit(targetOption);
          return true;
        }
        if (triggerDomMenuItemIfPresent(targetOption, doc)) {
          if (ctx) ctx.selectedModel = targetOption;
          applied = true;
        } else if (ctx && ctx._isDomMenuCtx) {
          ctx.selectedModel = targetOption;
          applied = true;
        }
      } catch (e) {}
      if (applied && typeof onAfterCommit === 'function') onAfterCommit(targetOption);
      return applied;
    }

    function commitOrchestratorPlannerPick(ctx, plannerOpt) {
      if (!ctx || !plannerOpt) return false;
      var pick = ctx.orchestratorPick;
      if (!pick || typeof pick !== 'object') return false;
      var applied = false;
      try {
        var valToSelect =
          plannerOpt.value !== undefined && plannerOpt.value !== null && plannerOpt.value !== ''
            ? plannerOpt.value
            : plannerOpt.modelId || plannerOpt.label;
        if (typeof pick.select === 'function') {
          pick.select(valToSelect, plannerOpt);
          applied = true;
        }
        pick.model = plannerOpt;
      } catch (e) {}
      return applied;
    }

    /* ── Orchestrator & Active State Synchronization ───────────────────────── */

    function formatOrchElementCompactBadge(slotZ, optSlot) {
      var zNum = Number(slotZ) || 6;
      var sym = optSlot && optSlot.symbol ? String(optSlot.symbol) : zNum === 1 ? 'H' : zNum === 10 ? 'Ne' : zNum === 18 ? 'Ar' : 'C';
      if (sym.length === 1) return '0·' + zNum + sym;
      return '0·' + sym;
    }

    function resolveAuxTwoLetterBadgeCode(groupIdOrText, fallbackTitle) {
      var probe = (String(groupIdOrText || '') + ' ' + String(fallbackTitle || '')).toLowerCase();
      if (/\bopus\b|claude-opus/.test(probe)) return 'OP';
      if (/\bsonnet\b|claude-sonnet/.test(probe)) return 'SN';
      if (/\bhaiku\b|claude-haiku/.test(probe)) return 'HK';
      if (/\b(?:claude|anthropic)\b/.test(probe)) return 'CL';
      if (/\bflash\b/.test(probe)) return 'FL';
      if (/\bcodex\b/.test(probe)) return 'CX';
      if (/\b(?:gpt|openai|gpt-oss)\b|\bo[134](?:-[a-z0-9]+)?\b/.test(probe)) return 'GP';
      var cleaned = String(fallbackTitle || groupIdOrText || 'AX').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      return cleaned.slice(0, 2) || 'AX';
    }

    function formatOrchAuxCompactBadge(auxIdOrText, fallbackTitle) {
      var probe = (String(auxIdOrText || '') + ' ' + String(fallbackTitle || '')).toLowerCase();
      if (/\bopus\b|claude-opus/.test(probe)) return '0·Op';
      if (/\bsonnet\b|claude-sonnet/.test(probe)) return '0·Sn';
      if (/\bhaiku\b|claude-haiku/.test(probe)) return '0·Hk';
      if (/\b(?:claude|anthropic)\b/.test(probe)) return '0·Cl';
      if (/\bflash\b/.test(probe)) return '0·Fl';
      if (/\bcodex\b/.test(probe)) return '0·Cx';
      if (/\b(?:gpt|openai|gpt-oss)\b|\bo[134](?:-[a-z0-9]+)?\b/.test(probe)) return '0·Gp';
      return '0·Ax';
    }

    function findHostOrchestratorOption(fullAuxSlots, activeHostCtx, plannerNameHint) {
      var orchSlot = fullAuxSlots && fullAuxSlots[0] && fullAuxSlots[0].id === 'orchestrator' ? fullAuxSlots[0] : null;
      if (orchSlot && Array.isArray(orchSlot.allOptions) && orchSlot.allOptions.length > 0) {
        if (plannerNameHint) {
          var hintLower = String(plannerNameHint).toLowerCase();
          for (var i = 0; i < orchSlot.allOptions.length; i += 1) {
            var cand = orchSlot.allOptions[i];
            if (cand && typeof cand.label === 'string' && cand.label.toLowerCase().indexOf(hintLower) !== -1) {
              return cand;
            }
          }
        }
        if (orchSlot.defaultOption) return orchSlot.defaultOption;
        return orchSlot.allOptions[0];
      }
      if (activeHostCtx && Array.isArray(activeHostCtx.modelOptions)) {
        for (var j = 0; j < activeHostCtx.modelOptions.length; j += 1) {
          var mo = activeHostCtx.modelOptions[j];
          if (mo && typeof mo.label === 'string' && /orchestrator|编排|调度器/i.test(mo.label)) {
            return mo;
          }
        }
      }
      return { label: 'Orchestrator', value: 'orchestrator', modelId: 'orchestrator' };
    }

    function resolvePlannerOptionForPick(orchRegistry, kind, zOrAuxId, effortCode, fallbackOpt) {
      if (orchRegistry) {
        var map =
          kind === 'element'
            ? orchRegistry.plannerByZ && orchRegistry.plannerByZ.get(zOrAuxId)
            : orchRegistry.plannerByAuxId && orchRegistry.plannerByAuxId.get(zOrAuxId);
        if (map instanceof Map && map.size > 0) {
          if (effortCode && map.has(effortCode)) return map.get(effortCode);
          if (map.has('high')) return map.get('high');
          var firstVal = map.values().next();
          if (firstVal && !firstVal.done) return firstVal.value;
        }
      }
      return fallbackOpt || null;
    }

    function findMatchingEffortLevel(levels, rawEffort) {
      var want = normalizeEffortToken(rawEffort);
      if (!want || !Array.isArray(levels)) return null;
      for (var i = 0; i < levels.length; i += 1) {
        var lv = levels[i];
        if (!lv) continue;
        if (lv.effort === want || normalizeEffortToken(lv.effort) === want) return lv;
      }
      return null;
    }

    function resolveLevelForElement(entry, preferredEffort, rememberedLocal, rememberedShared) {
      if (!entry || !entry.levels || !entry.levels.length) return null;
      var candidates = [preferredEffort, rememberedLocal, rememberedShared, 'high', 'medium'];
      for (var c = 0; c < candidates.length; c += 1) {
        var hit = findMatchingEffortLevel(entry.levels, candidates[c]);
        if (hit) return hit;
      }
      return entry.levels[entry.levels.length - 1];
    }

    function resolveLevelForAuxSlot(auxSlot, preferredEffort, rememberedLocal, rememberedShared) {
      if (!auxSlot || !auxSlot.levels || !auxSlot.levels.length) return null;
      var candidates = [preferredEffort, rememberedLocal, rememberedShared, 'high', 'medium'];
      for (var c = 0; c < candidates.length; c += 1) {
        var hit = findMatchingEffortLevel(auxSlot.levels, candidates[c]);
        if (hit) return hit;
      }
      for (var j = 0; j < auxSlot.levels.length; j += 1) {
        if (auxSlot.defaultOption && auxSlot.levels[j].option === auxSlot.defaultOption) {
          return auxSlot.levels[j];
        }
      }
      return auxSlot.levels[0];
    }

    function syncHostWithActiveState(params) {
      var p = params || {};
      var doc = p.doc || null;
      var rt = p.root || (typeof globalThis !== 'undefined' ? globalThis : null);
      var activeHostCtx = p.activeHostCtx || null;
      var orchLatched = Boolean(p.orchLatched);
      var selectedZ = p.selectedZ !== undefined ? p.selectedZ : null;
      var selectedAuxIndex = p.selectedAuxIndex !== undefined ? p.selectedAuxIndex : null;
      var availableByZ = p.availableByZ;
      var auxSlots = p.auxSlots || [];
      var fullAuxSlots = p.fullAuxSlots || auxSlots;
      var activeEffortByZ = p.activeEffortByZ;
      var activeEffortByAux = p.activeEffortByAux;
      var orchRegistry = p.orchRegistry || null;
      var slotByZ = p.slotByZ || null;
      var onAfterCommit = p.syncMiniKeycapBadges || p.onAfterCommit || null;
      var prevCommittedZ = p.activeCommittedElementZ !== undefined ? p.activeCommittedElementZ : null;
      var inferOrchBadge = p.inferOrchCompactBadgeFromHost;
      var anchorBtn = p.anchorBtn || null;

      var result = {
        committed: false,
        hasModified: false,
        activeCommittedElementZ: prevCommittedZ,
        activeCommittedAuxBadge: p.activeCommittedAuxBadge || null,
      };

      if (orchLatched) {
        if (selectedZ !== null && availableByZ && availableByZ.has(selectedZ)) {
          var elEntry = availableByZ.get(selectedZ);
          var elSlot = slotByZ && typeof slotByZ.get === 'function' ? slotByZ.get(selectedZ) : null;
          var memElEff = getRememberedEffort(rt, doc, elEntry.baseName || elEntry.name, true, p);
          var prefElEff = (activeEffortByZ && activeEffortByZ.get(selectedZ)) || '';
          var elChosen = resolveLevelForElement(elEntry, '', prefElEff, memElEff);
          if (elChosen && activeEffortByZ) activeEffortByZ.set(selectedZ, elChosen.effort);
          if (elChosen) writeSharedEffortMemory(rt, doc, elEntry.baseName || elEntry.name, elChosen.effort, true, p);
          var elPlannerOpt = resolvePlannerOptionForPick(
            orchRegistry,
            'element',
            selectedZ,
            elChosen ? elChosen.effort : 'high',
            elChosen ? elChosen.option : null
          );
          var orchOptEl = findHostOrchestratorOption(
            fullAuxSlots,
            activeHostCtx,
            elEntry.name || (elSlot && elSlot.name) || ''
          );
          result.activeCommittedElementZ = null;
          result.activeCommittedAuxBadge = {
            id: 'orchestrator',
            label: orchOptEl.label,
            shortLabel: formatOrchElementCompactBadge(selectedZ, elSlot),
            miniKey: 'orchestrator',
          };
          var didCommitOrchEl = commitModelOption(activeHostCtx, orchOptEl, doc, onAfterCommit, anchorBtn);
          var didPickEl = commitOrchestratorPlannerPick(activeHostCtx, elPlannerOpt);
          if (didCommitOrchEl || didPickEl) {
            result.committed = true;
            result.hasModified = true;
          }
          if (typeof onAfterCommit === 'function') onAfterCommit();
          return result;
        }
        if (selectedAuxIndex !== null && selectedAuxIndex > 0 && auxSlots[selectedAuxIndex]) {
          var aSlot = auxSlots[selectedAuxIndex];
          var memAuxEff = getRememberedEffort(rt, doc, aSlot.title || aSlot.shortLabel, true, p);
          var prefAuxEff = (activeEffortByAux && activeEffortByAux.get(selectedAuxIndex)) || '';
          var aChosen = resolveLevelForAuxSlot(aSlot, '', prefAuxEff, memAuxEff);
          if (aChosen && activeEffortByAux) activeEffortByAux.set(selectedAuxIndex, aChosen.effort);
          if (aChosen) writeSharedEffortMemory(rt, doc, aSlot.title || aSlot.shortLabel, aChosen.effort, true, p);
          var aFallbackOpt = (aChosen && aChosen.option) || aSlot.defaultOption;
          var aPlannerOpt = resolvePlannerOptionForPick(
            orchRegistry,
            'aux',
            aSlot.id,
            aChosen ? aChosen.effort : 'high',
            aFallbackOpt
          );
          var orchOptAux = findHostOrchestratorOption(fullAuxSlots, activeHostCtx, aSlot.shortLabel || aSlot.title || '');
          result.activeCommittedElementZ = null;
          result.activeCommittedAuxBadge = {
            id: 'orchestrator',
            label: orchOptAux.label,
            shortLabel: formatOrchAuxCompactBadge(aSlot.id, aSlot.shortLabel || aSlot.title),
            miniKey: 'orchestrator',
          };
          var didCommitOrchAux = commitModelOption(activeHostCtx, orchOptAux, doc, onAfterCommit, anchorBtn);
          var didPickAux = commitOrchestratorPlannerPick(activeHostCtx, aPlannerOpt);
          if (didCommitOrchAux || didPickAux) {
            result.committed = true;
            result.hasModified = true;
          }
          if (typeof onAfterCommit === 'function') onAfterCommit();
          return result;
        }
        return result;
      }

      if (selectedZ !== null && availableByZ && availableByZ.has(selectedZ)) {
        var stEntry = availableByZ.get(selectedZ);
        var memStEff = getRememberedEffort(rt, doc, stEntry.baseName || stEntry.name, false, p);
        var prefStEff = (activeEffortByZ && activeEffortByZ.get(selectedZ)) || '';
        var stChosen = resolveLevelForElement(stEntry, '', prefStEff, memStEff);
        result.activeCommittedAuxBadge = null;
        result.activeCommittedElementZ = selectedZ;
        if (stChosen) {
          if (activeEffortByZ) activeEffortByZ.set(selectedZ, stChosen.effort);
          writeSharedEffortMemory(rt, doc, stEntry.baseName || stEntry.name, stChosen.effort, false, p);
          if (commitModelOption(activeHostCtx, stChosen.option, doc, onAfterCommit, anchorBtn)) {
            result.committed = true;
            result.hasModified = true;
          } else if (typeof onAfterCommit === 'function') {
            onAfterCommit();
          }
        }
        return result;
      }

      if (selectedAuxIndex !== null && selectedAuxIndex >= 0 && auxSlots[selectedAuxIndex]) {
        var stAux = auxSlots[selectedAuxIndex];
        var memStAuxEff = getRememberedEffort(rt, doc, stAux.title || stAux.shortLabel, false, p);
        var prefStAuxEff = (activeEffortByAux && activeEffortByAux.get(selectedAuxIndex)) || '';
        var stAuxChosen = resolveLevelForAuxSlot(stAux, '', prefStAuxEff, memStAuxEff);
        var stOpt = (stAuxChosen && stAuxChosen.option) || stAux.defaultOption;
        if (stAuxChosen) {
          if (activeEffortByAux) activeEffortByAux.set(selectedAuxIndex, stAuxChosen.effort);
          if (stAux.id !== 'orchestrator') {
            writeSharedEffortMemory(rt, doc, stAux.title || stAux.shortLabel, stAuxChosen.effort, false, p);
          }
        }
        var prevElemZForOrch = prevCommittedZ;
        result.activeCommittedElementZ = null;
        if (stOpt) {
          var stShortBadge =
            stAux.id === 'orchestrator'
              ? prevElemZForOrch !== null
                ? formatOrchElementCompactBadge(
                    prevElemZForOrch,
                    slotByZ && typeof slotByZ.get === 'function' ? slotByZ.get(prevElemZForOrch) : null
                  )
                : typeof inferOrchBadge === 'function'
                ? inferOrchBadge(activeHostCtx, stOpt.label)
                : '0·6C'
              : resolveAuxTwoLetterBadgeCode(stAux.id, stAux.title || stOpt.label);
          result.activeCommittedAuxBadge = {
            id: stAux.id,
            label: stOpt.label,
            shortLabel: stShortBadge,
            miniKey: stAux.miniKey,
          };
          if (commitModelOption(activeHostCtx, stOpt, doc, onAfterCommit, anchorBtn)) {
            result.committed = true;
            result.hasModified = true;
          } else if (typeof onAfterCommit === 'function') {
            onAfterCommit();
          }
        }
      }
      return result;
    }

    return {
      ROOT_ID: ROOT_ID,
      DEFAULT_MAX_CONTEXT_TOKENS: DEFAULT_MAX_CONTEXT_TOKENS,
      EFFORT_MEMORY_KEY: EFFORT_MEMORY_KEY,
      EFFORT_ORDER: EFFORT_ORDER,
      EFFORT_LABELS: EFFORT_LABELS,
      MODEL_TRIGGER_TEXT_RE: MODEL_TRIGGER_TEXT_RE,
      EXCLUDED_FAMILY_RE: EXCLUDED_FAMILY_RE,
      getReactFiber: getReactFiber,
      readHostModelContextFromFiber: readHostModelContextFromFiber,
      readHostModelContextFromDomMenu: readHostModelContextFromDomMenu,
      readHostModelContext: readHostModelContext,
      commitModelOption: commitModelOption,
      commitOrchestratorPlannerPick: commitOrchestratorPlannerPick,
      triggerDomMenuItemIfPresent: triggerDomMenuItemIfPresent,
      syncHostWithActiveState: syncHostWithActiveState,
      findFallbackModelTrigger: findFallbackModelTrigger,
      isModelTriggerLocked: isModelTriggerLocked,
      collectVisibleModelTriggerButtons: collectVisibleModelTriggerButtons,
      matchModelTriggerButton: matchModelTriggerButton,
      readCleanButtonLabel: readCleanButtonLabel,
      dismissNativeHostMenu: dismissNativeHostMenu,
      readHostContextTelemetry: readHostContextTelemetry,
      formatCompactTokensK: formatCompactTokensK,
      parseTokenStringNumber: parseTokenStringNumber,
      suppressNativeTooltip: suppressNativeTooltip,
      setHoldTooltipSuppression: setHoldTooltipSuppression,
      setOpenTooltipSuppression: setOpenTooltipSuppression,
      isEffortMemoryEnabled: isEffortMemoryEnabled,
      normalizeEffortToken: normalizeEffortToken,
      readSharedEffortMemory: readSharedEffortMemory,
      writeSharedEffortMemory: writeSharedEffortMemory,
      getRememberedEffort: getRememberedEffort,
      isInsideExcludedZone: isInsideExcludedZone,
      isInsideExcludedZoneForMenuScan: isInsideExcludedZoneForMenuScan,
      isLikelyComposerToolbar: isLikelyComposerToolbar,
      isOwnedDecorationNode: isOwnedDecorationNode,
      formatOrchElementCompactBadge: formatOrchElementCompactBadge,
      formatOrchAuxCompactBadge: formatOrchAuxCompactBadge,
      resolveAuxTwoLetterBadgeCode: resolveAuxTwoLetterBadgeCode,
      findHostOrchestratorOption: findHostOrchestratorOption,
      resolvePlannerOptionForPick: resolvePlannerOptionForPick,
      resolveLevelForElement: resolveLevelForElement,
      resolveLevelForAuxSlot: resolveLevelForAuxSlot,
    };
  }
);

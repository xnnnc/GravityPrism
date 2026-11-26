/**
 * Obsidian Prism — Periodic Picker WebAudio Mechanical Switch Sound Engine
 *
 * Standalone zero-dependency audio synthesizer for keycap press, lift/levitation,
 * rotary detent ratchet, orchestrator dual-stage latch, standby fidget thock,
 * ceramic bottom-out slam, welcome chime, and mute preference persistence.
 *
 * Contract:
 *   globalThis.__agPeriodicAudioFx = {
 *     MUTE_STORAGE_KEY,
 *     readMutedPref,
 *     writeMutedPref,
 *     isReducedMotion,
 *     createLowpassBus,
 *     createAudioFxEngine,
 *     ...
 *   }
 *   module.exports = api
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module && typeof module.exports === 'object') {
    module.exports = api;
  }
  if (root && typeof root === 'object') {
    root.__agPeriodicAudioFx = api;
  }
  if (typeof globalThis === 'object' && globalThis) {
    globalThis.__agPeriodicAudioFx = api;
  }
  if (typeof window === 'object' && window) {
    window.__agPeriodicAudioFx = api;
  }
})(
  typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this,
  function () {
    'use strict';

    var MUTE_STORAGE_KEY = 'ag_prism_pp_muted';

    function readMutedPref(root) {
      try {
        var ls = root && root.localStorage;
        if (ls && typeof ls.getItem === 'function') {
          return ls.getItem(MUTE_STORAGE_KEY) === '1';
        }
      } catch (e) {}
      return false;
    }

    function writeMutedPref(root, muted) {
      try {
        var ls = root && root.localStorage;
        if (ls && typeof ls.setItem === 'function') {
          ls.setItem(MUTE_STORAGE_KEY, muted ? '1' : '0');
        }
      } catch (e) {}
    }

    var _audioRmMqlCache = typeof WeakMap === 'function' ? new WeakMap() : null;
    function isReducedMotion(doc, root) {
      try {
        if (doc && doc.documentElement && doc.documentElement.getAttribute('data-ag-cs-motion') === 'off') {
          return true;
        }
        if (root && typeof root.matchMedia === 'function') {
          var mm = root.matchMedia;
          if (_audioRmMqlCache) {
            var cached = _audioRmMqlCache.get(root);
            if (cached && cached.fn === mm && cached.mq) {
              return Boolean(cached.mq.matches);
            }
            var mq = mm.call(root, '(prefers-reduced-motion: reduce)');
            _audioRmMqlCache.set(root, { fn: mm, mq: mq });
            return Boolean(mq && mq.matches);
          }
          return Boolean(mm.call(root, '(prefers-reduced-motion: reduce)').matches);
        }
      } catch (e) {}
      return false;
    }

    function createShortNoiseBuffer(ctx) {
      if (!ctx || typeof ctx.createBuffer !== 'function') return null;
      try {
        var sr = ctx.sampleRate || 44100;
        var len = Math.max(384, Math.floor(sr * 0.044));
        var buf = ctx.createBuffer(1, len, sr);
        var data = buf.getChannelData(0);
        var seed = 20261122;
        var prev = 0;
        for (var i = 0; i < len; i += 1) {
          seed = (seed * 1664525 + 1013904223) >>> 0;
          var white = (seed / 4294967296) * 2 - 1;
          /* One-pole warm brown/pink smoothing to strip harsh plastic fizz at source */
          prev = prev * 0.62 + white * 0.38;
          var env = Math.pow(1 - i / len, 2.05);
          data[i] = prev * env * 1.45;
        }
        return buf;
      } catch (e) {
        return null;
      }
    }

    function createLowpassBus(ctx, dest, cutoffHz, qVal, now) {
      if (ctx && typeof ctx.createBiquadFilter === 'function') {
        var lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(cutoffHz, now);
        lp.Q.setValueAtTime(qVal || 0.72, now);
        lp.connect(dest);
        return lp;
      }
      return dest;
    }

    function connectFilteredNoise(ctx, bus, nBuf, startTime, durationSec, gainVal, bpFreq, bpQ) {
      if (!nBuf || typeof ctx.createBufferSource !== 'function') return;
      var src = ctx.createBufferSource();
      src.buffer = nBuf;
      var nGain = ctx.createGain();
      nGain.gain.setValueAtTime(gainVal, startTime);
      nGain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSec);
      if (typeof ctx.createBiquadFilter === 'function') {
        var bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(bpFreq, startTime);
        bp.Q.setValueAtTime(bpQ, startTime);
        src.connect(bp);
        bp.connect(nGain);
      } else {
        src.connect(nGain);
      }
      nGain.connect(bus);
      src.start(startTime);
      src.stop(startTime + durationSec + 0.005);
    }

    /**
     * Magnetic Fluid Levitation ("lift" / "select"):
     * Warm low-frequency cavity rise (155Hz -> 210Hz) + damped air-cushion sigh.
     */
    function triggerCeramicLiftSound(ctx, now, getNoiseBuf) {
      var bus = createLowpassBus(ctx, ctx.destination, 1320, 0.68, now);

      var magOsc = ctx.createOscillator();
      var magGain = ctx.createGain();
      magOsc.type = 'sine';
      magOsc.frequency.setValueAtTime(155, now);
      magOsc.frequency.exponentialRampToValueAtTime(210, now + 0.078);
      magGain.gain.setValueAtTime(0.0001, now);
      magGain.gain.linearRampToValueAtTime(0.105, now + 0.006);
      magGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.092);
      magOsc.connect(magGain);
      magGain.connect(bus);
      magOsc.start(now);
      magOsc.stop(now + 0.098);

      var jadeOsc = ctx.createOscillator();
      var jadeGain = ctx.createGain();
      jadeOsc.type = 'triangle';
      jadeOsc.frequency.setValueAtTime(232, now + 0.002);
      jadeOsc.frequency.exponentialRampToValueAtTime(308, now + 0.056);
      jadeGain.gain.setValueAtTime(0.0001, now + 0.002);
      jadeGain.gain.linearRampToValueAtTime(0.044, now + 0.009);
      jadeGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.064);
      jadeOsc.connect(jadeGain);
      jadeGain.connect(bus);
      jadeOsc.start(now + 0.002);
      jadeOsc.stop(now + 0.07);

      var nBuf = typeof getNoiseBuf === 'function' ? getNoiseBuf(ctx) : createShortNoiseBuffer(ctx);
      if (nBuf && typeof ctx.createBufferSource === 'function') {
        var src = ctx.createBufferSource();
        src.buffer = nBuf;
        var airGain = ctx.createGain();
        airGain.gain.setValueAtTime(0.0001, now);
        airGain.gain.linearRampToValueAtTime(0.032, now + 0.005);
        airGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
        if (typeof ctx.createBiquadFilter === 'function') {
          var bp = ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.setValueAtTime(460, now);
          bp.Q.setValueAtTime(1.45, now);
          src.connect(bp);
          bp.connect(airGain);
        } else {
          src.connect(airGain);
        }
        airGain.connect(bus);
        src.start(now);
        src.stop(now + 0.044);
      }
    }

    /**
     * Thinking-Tier Switch ("step"):
     * Restrained warm river-pebble / temple-woodblock micro-tap.
     */
    function triggerJadePebbleStepSound(ctx, now, stepIndex, getNoiseBuf) {
      var idx = Math.max(0, Math.min(5, Number(stepIndex) || 0));
      var mul = 0.94 + idx * 0.052;
      var bus = createLowpassBus(ctx, ctx.destination, 1740, 0.74, now);

      var coreOsc = ctx.createOscillator();
      var coreGain = ctx.createGain();
      coreOsc.type = 'sine';
      coreOsc.frequency.setValueAtTime(308 * mul, now);
      coreOsc.frequency.exponentialRampToValueAtTime(224 * mul, now + 0.048);
      coreGain.gain.setValueAtTime(0.0001, now);
      coreGain.gain.linearRampToValueAtTime(0.082, now + 0.0028);
      coreGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.056);
      coreOsc.connect(coreGain);
      coreGain.connect(bus);
      coreOsc.start(now);
      coreOsc.stop(now + 0.062);

      var bodyOsc = ctx.createOscillator();
      var bodyGain = ctx.createGain();
      bodyOsc.type = 'triangle';
      bodyOsc.frequency.setValueAtTime(518 * mul, now);
      bodyOsc.frequency.exponentialRampToValueAtTime(382 * mul, now + 0.026);
      bodyGain.gain.setValueAtTime(0.0001, now);
      bodyGain.gain.linearRampToValueAtTime(0.042, now + 0.002);
      bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
      bodyOsc.connect(bodyGain);
      bodyGain.connect(bus);
      bodyOsc.start(now);
      bodyOsc.stop(now + 0.035);

      var nBuf = typeof getNoiseBuf === 'function' ? getNoiseBuf(ctx) : createShortNoiseBuffer(ctx);
      connectFilteredNoise(ctx, bus, nBuf, now, 0.017, 0.034, 760 * mul, 2.15);
    }

    /**
     * Deep Ceramic Bottom-Out Mahjong Thock ("slam" / "commit").
     */
    function triggerCeramicBottomOutSlam(ctx, now, gainScale, getNoiseBuf) {
      var g = gainScale || 1;
      var masterBus = createLowpassBus(ctx, ctx.destination, 2050, 0.76, now);

      /* Layer 1: Solid CNC Aluminum Plate & Gasket Sub-Thump (145Hz -> 118Hz -> 68Hz) */
      var plateOsc = ctx.createOscillator();
      var plateGain = ctx.createGain();
      plateOsc.type = 'sine';
      plateOsc.frequency.setValueAtTime(145, now);
      plateOsc.frequency.exponentialRampToValueAtTime(118, now + 0.022);
      plateOsc.frequency.exponentialRampToValueAtTime(68, now + 0.094);
      plateGain.gain.setValueAtTime(0.0001, now);
      plateGain.gain.linearRampToValueAtTime(0.155 * g, now + 0.003);
      plateGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.102);
      plateOsc.connect(plateGain);
      plateGain.connect(masterBus);
      plateOsc.start(now);
      plateOsc.stop(now + 0.108);

      /* Layer 2: Thick Ceramic-Jade Wall Creamy Mahjong Body (548Hz -> 386Hz) */
      var ceramicOsc = ctx.createOscillator();
      var ceramicGain = ctx.createGain();
      ceramicOsc.type = 'triangle';
      ceramicOsc.frequency.setValueAtTime(548, now);
      ceramicOsc.frequency.exponentialRampToValueAtTime(386, now + 0.042);
      ceramicGain.gain.setValueAtTime(0.0001, now);
      ceramicGain.gain.linearRampToValueAtTime(0.092 * g, now + 0.0025);
      ceramicGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.048);
      ceramicOsc.connect(ceramicGain);
      ceramicGain.connect(masterBus);
      ceramicOsc.start(now);
      ceramicOsc.stop(now + 0.054);

      /* Layer 3: Damped POM Box-Stem Bottom-Out Cushion Transient */
      var nBuf = typeof getNoiseBuf === 'function' ? getNoiseBuf(ctx) : createShortNoiseBuffer(ctx);
      connectFilteredNoise(ctx, masterBus, nBuf, now, 0.025, 0.096 * g, 670, 1.65);

      /* Layer 4: +13ms Micro Cross-Socket Seat Lock Settle (134Hz -> 118Hz) */
      var seatOsc = ctx.createOscillator();
      var seatGain = ctx.createGain();
      seatOsc.type = 'sine';
      seatOsc.frequency.setValueAtTime(134, now + 0.013);
      seatOsc.frequency.exponentialRampToValueAtTime(118, now + 0.058);
      seatGain.gain.setValueAtTime(0.0001, now + 0.013);
      seatGain.gain.linearRampToValueAtTime(0.042 * g, now + 0.017);
      seatGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.064);
      seatOsc.connect(seatGain);
      seatGain.connect(masterBus);
      seatOsc.start(now + 0.013);
      seatOsc.stop(now + 0.07);
    }

    /**
     * Precision CNC Diamond-Knurled Rotary Encoder Detent Ratchet ("ratchet").
     */
    function triggerRotaryRatchetSound(ctx, now, stepIndex, getNoiseBuf) {
      var idx = Math.max(0, Math.min(5, Number(stepIndex) || 0));
      var mul = 0.92 + idx * 0.065;
      var bus = createLowpassBus(ctx, ctx.destination, 2650, 0.85, now);

      var detentOsc = ctx.createOscillator();
      var detentGain = ctx.createGain();
      detentOsc.type = 'triangle';
      detentOsc.frequency.setValueAtTime(1180 * mul, now);
      detentOsc.frequency.exponentialRampToValueAtTime(640 * mul, now + 0.015);
      detentGain.gain.setValueAtTime(0.0001, now);
      detentGain.gain.linearRampToValueAtTime(0.056, now + 0.0014);
      detentGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.019);
      detentOsc.connect(detentGain);
      detentGain.connect(bus);
      detentOsc.start(now);
      detentOsc.stop(now + 0.022);

      var bodyOsc = ctx.createOscillator();
      var bodyGain = ctx.createGain();
      bodyOsc.type = 'sine';
      bodyOsc.frequency.setValueAtTime(340 * mul, now + 0.006);
      bodyOsc.frequency.exponentialRampToValueAtTime(215 * mul, now + 0.028);
      bodyGain.gain.setValueAtTime(0.0001, now + 0.006);
      bodyGain.gain.linearRampToValueAtTime(0.036, now + 0.0085);
      bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.032);
      bodyOsc.connect(bodyGain);
      bodyGain.connect(bus);
      bodyOsc.start(now + 0.006);
      bodyOsc.stop(now + 0.036);

      var nBuf = typeof getNoiseBuf === 'function' ? getNoiseBuf(ctx) : createShortNoiseBuffer(ctx);
      connectFilteredNoise(ctx, bus, nBuf, now, 0.011, 0.038, 1840 * mul, 3.2);
    }

    /**
     * Heavy Dual-Stage Mechanical Latch Switch ("orch-latch" / "orch-unlatch").
     */
    function triggerOrchLatchSound(ctx, now, latching, getNoiseBuf) {
      var bus = createLowpassBus(ctx, ctx.destination, 2120, 0.78, now);
      var s1Osc = ctx.createOscillator();
      var s1Gain = ctx.createGain();
      s1Osc.type = 'sine';
      s1Osc.frequency.setValueAtTime(latching ? 158 : 188, now);
      s1Osc.frequency.exponentialRampToValueAtTime(latching ? 74 : 112, now + 0.052);
      s1Gain.gain.setValueAtTime(0.0001, now);
      s1Gain.gain.linearRampToValueAtTime(0.098, now + 0.0025);
      s1Gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.062);
      s1Osc.connect(s1Gain);
      s1Gain.connect(bus);
      s1Osc.start(now);
      s1Osc.stop(now + 0.068);

      var t2 = now + 0.018;
      var s2Osc = ctx.createOscillator();
      var s2Gain = ctx.createGain();
      s2Osc.type = 'triangle';
      s2Osc.frequency.setValueAtTime(latching ? 780 : 620, t2);
      s2Osc.frequency.exponentialRampToValueAtTime(latching ? 510 : 790, t2 + 0.036);
      s2Gain.gain.setValueAtTime(0.0001, t2);
      s2Gain.gain.linearRampToValueAtTime(0.058, t2 + 0.002);
      s2Gain.gain.exponentialRampToValueAtTime(0.0001, t2 + 0.044);
      s2Osc.connect(s2Gain);
      s2Gain.connect(bus);
      s2Osc.start(t2);
      s2Osc.stop(t2 + 0.05);

      var nBuf = typeof getNoiseBuf === 'function' ? getNoiseBuf(ctx) : createShortNoiseBuffer(ctx);
      connectFilteredNoise(ctx, bus, nBuf, t2, 0.016, 0.052, latching ? 1120 : 1380, 2.4);
    }

    /**
     * Subtle matte PBT standby keycap fidget thock ("fidget").
     */
    function triggerBlindFidgetSound(ctx, now) {
      var bus = createLowpassBus(ctx, ctx.destination, 1180, 0.72, now);
      var thockOsc = ctx.createOscillator();
      var thockGain = ctx.createGain();
      thockOsc.type = 'sine';
      thockOsc.frequency.setValueAtTime(164, now);
      thockOsc.frequency.exponentialRampToValueAtTime(92, now + 0.038);
      thockGain.gain.setValueAtTime(0.0001, now);
      thockGain.gain.linearRampToValueAtTime(0.052, now + 0.0024);
      thockGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
      thockOsc.connect(thockGain);
      thockGain.connect(bus);
      thockOsc.start(now);
      thockOsc.stop(now + 0.05);

      var capOsc = ctx.createOscillator();
      var capGain = ctx.createGain();
      capOsc.type = 'triangle';
      capOsc.frequency.setValueAtTime(385, now);
      capOsc.frequency.exponentialRampToValueAtTime(260, now + 0.022);
      capGain.gain.setValueAtTime(0.0001, now);
      capGain.gain.linearRampToValueAtTime(0.024, now + 0.0018);
      capGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.026);
      capOsc.connect(capGain);
      capGain.connect(bus);
      capOsc.start(now);
      capOsc.stop(now + 0.03);
    }

    /**
     * Warm Restrained Jade Resonance Welcome Tone ("chime" / "open").
     */
    function triggerWelcomeChime(ctx, now) {
      var welcomeBus = createLowpassBus(ctx, ctx.destination, 1480, 0.65, now);
      var freqs = [293.66, 440.0];
      var gains = [0.038, 0.02];
      for (var i = 0; i < freqs.length; i += 1) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freqs[i], now + i * 0.024);
        gain.gain.setValueAtTime(0.0001, now + i * 0.024);
        gain.gain.linearRampToValueAtTime(gains[i], now + i * 0.024 + 0.014);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24 + i * 0.035);
        osc.connect(gain);
        gain.connect(welcomeBus);
        osc.start(now + i * 0.024);
        osc.stop(now + 0.28 + i * 0.035);
      }
    }

    /**
     * Lubed linear rail pre-travel soft cushion touch ("down").
     */
    function triggerSoftDownSound(ctx, now) {
      var downBus = createLowpassBus(ctx, ctx.destination, 1180, 0.68, now);
      var dOsc = ctx.createOscillator();
      var dGain = ctx.createGain();
      dOsc.type = 'sine';
      dOsc.frequency.setValueAtTime(138, now);
      dOsc.frequency.exponentialRampToValueAtTime(82, now + 0.034);
      dGain.gain.setValueAtTime(0.0001, now);
      dGain.gain.linearRampToValueAtTime(0.032, now + 0.003);
      dGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.038);
      dOsc.connect(dGain);
      dGain.connect(downBus);
      dOsc.start(now);
      dOsc.stop(now + 0.042);
    }

    /**
     * Silky magnetic home-detent snap chime ("reset").
     */
    function triggerResetSnapSound(ctx, now) {
      var resetBus = createLowpassBus(ctx, ctx.destination, 1560, 0.72, now);
      var glideOsc = ctx.createOscillator();
      var glideGain = ctx.createGain();
      glideOsc.type = 'sine';
      glideOsc.frequency.setValueAtTime(348, now);
      glideOsc.frequency.exponentialRampToValueAtTime(262, now + 0.068);
      glideGain.gain.setValueAtTime(0.0001, now);
      glideGain.gain.linearRampToValueAtTime(0.052, now + 0.006);
      glideGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.082);
      glideOsc.connect(glideGain);
      glideGain.connect(resetBus);
      glideOsc.start(now);
      glideOsc.stop(now + 0.088);

      var snapOsc = ctx.createOscillator();
      var snapGain = ctx.createGain();
      snapOsc.type = 'triangle';
      snapOsc.frequency.setValueAtTime(392, now + 0.018);
      snapOsc.frequency.exponentialRampToValueAtTime(523.25, now + 0.062);
      snapGain.gain.setValueAtTime(0.0001, now + 0.018);
      snapGain.gain.linearRampToValueAtTime(0.032, now + 0.024);
      snapGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.088);
      snapOsc.connect(snapGain);
      snapGain.connect(resetBus);
      snapOsc.start(now + 0.018);
      snapOsc.stop(now + 0.094);
    }

    /**
     * Bespoke CNC Titanium Artisan Keycap Harmonic Click ("prism-wave").
     */
    function triggerPrismWaveSound(ctx, now, getNoiseBuf) {
      var waveBus = createLowpassBus(ctx, ctx.destination, 1980, 0.78, now);
      var bodyClickOsc = ctx.createOscillator();
      var bodyClickGain = ctx.createGain();
      bodyClickOsc.type = 'sine';
      bodyClickOsc.frequency.setValueAtTime(172, now);
      bodyClickOsc.frequency.exponentialRampToValueAtTime(92, now + 0.056);
      bodyClickGain.gain.setValueAtTime(0.0001, now);
      bodyClickGain.gain.linearRampToValueAtTime(0.082, now + 0.0025);
      bodyClickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.068);
      bodyClickOsc.connect(bodyClickGain);
      bodyClickGain.connect(waveBus);
      bodyClickOsc.start(now);
      bodyClickOsc.stop(now + 0.074);

      var chimeFreqs = [659.25, 987.77];
      var chimeGains = [0.044, 0.026];
      for (var ci = 0; ci < chimeFreqs.length; ci += 1) {
        var hOsc = ctx.createOscillator();
        var hGain = ctx.createGain();
        hOsc.type = ci === 0 ? 'triangle' : 'sine';
        hOsc.frequency.setValueAtTime(chimeFreqs[ci], now + ci * 0.008);
        hOsc.frequency.exponentialRampToValueAtTime(chimeFreqs[ci] * 0.88, now + 0.092 + ci * 0.018);
        hGain.gain.setValueAtTime(0.0001, now + ci * 0.008);
        hGain.gain.linearRampToValueAtTime(chimeGains[ci], now + ci * 0.008 + 0.004);
        hGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.105 + ci * 0.022);
        hOsc.connect(hGain);
        hGain.connect(waveBus);
        hOsc.start(now + ci * 0.008);
        hOsc.stop(now + 0.118 + ci * 0.022);
      }

      var wnBuf = typeof getNoiseBuf === 'function' ? getNoiseBuf(ctx) : createShortNoiseBuffer(ctx);
      connectFilteredNoise(ctx, waveBus, wnBuf, now, 0.018, 0.04, 1220, 2.4);
    }

    /**
     * Muted silicone dampener thud on locked non-planner keycap ("lock").
     */
    function triggerLockThudSound(ctx, now) {
      var lockBus = createLowpassBus(ctx, ctx.destination, 640, 0.7, now);
      var lOsc = ctx.createOscillator();
      var lGain = ctx.createGain();
      lOsc.type = 'sine';
      lOsc.frequency.setValueAtTime(112, now);
      lOsc.frequency.exponentialRampToValueAtTime(62, now + 0.048);
      lGain.gain.setValueAtTime(0.0001, now);
      lGain.gain.linearRampToValueAtTime(0.056, now + 0.003);
      lGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.054);
      lOsc.connect(lGain);
      lGain.connect(lockBus);
      lOsc.start(now);
      lOsc.stop(now + 0.06);
    }

    /**
     * Create an isolated WebAudio mechanical switch FX engine instance.
     */
    function createAudioFxEngine(options) {
      var opts = options && typeof options === 'object' ? options : {};
      var root = opts.root || (typeof window !== 'undefined' ? window : globalThis);
      var doc = opts.doc || (root && root.document) || (typeof document !== 'undefined' ? document : null);
      var respectReducedMotion = opts.respectReducedMotion !== false;
      var muted = typeof opts.muted === 'boolean' ? opts.muted : readMutedPref(root);
      var audioCtx = null;
      var noiseBuf = null;
      var disposed = false;

      function getShortNoiseBuffer(ctx) {
        if (noiseBuf) return noiseBuf;
        noiseBuf = createShortNoiseBuffer(ctx);
        return noiseBuf;
      }

      function getAudioContext() {
        if (muted || disposed) return null;
        if (respectReducedMotion && isReducedMotion(doc, root)) return null;
        if (audioCtx) {
          if (audioCtx.state === 'suspended' && typeof audioCtx.resume === 'function') {
            try {
              audioCtx.resume();
            } catch (e) {}
          }
          return audioCtx;
        }
        var Ctor = (root && (root.AudioContext || root.webkitAudioContext)) || null;
        if (typeof Ctor !== 'function') return null;
        try {
          audioCtx = new Ctor();
          return audioCtx;
        } catch (e) {
          return null;
        }
      }

      function playSound(kind, stepIndex) {
        var ctx = getAudioContext();
        if (!ctx) return false;
        try {
          var now = ctx.currentTime || 0;
          if (kind === 'chime' || kind === 'open') {
            triggerWelcomeChime(ctx, now);
          } else if (kind === 'down') {
            triggerSoftDownSound(ctx, now);
          } else if (kind === 'lift' || kind === 'select' || kind === 'keycap') {
            triggerCeramicLiftSound(ctx, now, getShortNoiseBuffer);
          } else if (kind === 'step') {
            triggerJadePebbleStepSound(ctx, now, stepIndex, getShortNoiseBuffer);
          } else if (kind === 'ratchet') {
            triggerRotaryRatchetSound(ctx, now, stepIndex, getShortNoiseBuffer);
          } else if (kind === 'orch-latch') {
            triggerOrchLatchSound(ctx, now, true, getShortNoiseBuffer);
          } else if (kind === 'orch-unlatch') {
            triggerOrchLatchSound(ctx, now, false, getShortNoiseBuffer);
          } else if (kind === 'fidget') {
            triggerBlindFidgetSound(ctx, now);
          } else if (kind === 'slam' || kind === 'commit' || kind === 'confirm') {
            triggerCeramicBottomOutSlam(ctx, now, 0.85, getShortNoiseBuffer);
          } else if (kind === 'reset') {
            triggerResetSnapSound(ctx, now);
          } else if (kind === 'prism-wave') {
            triggerPrismWaveSound(ctx, now, getShortNoiseBuffer);
          } else if (kind === 'lock') {
            triggerLockThudSound(ctx, now);
          } else {
            return false;
          }
          return true;
        } catch (e) {
          return false;
        }
      }

      function suspend() {
        noiseBuf = null;
        if (audioCtx && audioCtx.state === 'running' && typeof audioCtx.suspend === 'function') {
          try {
            audioCtx.suspend();
            return true;
          } catch (e) {}
        }
        return false;
      }

      function closeAudioContext() {
        noiseBuf = null;
        if (!audioCtx) return false;
        var ctx = audioCtx;
        audioCtx = null;
        try {
          if (typeof ctx.close === 'function') {
            ctx.close();
            return true;
          }
          if (typeof ctx.suspend === 'function') {
            ctx.suspend();
            return true;
          }
        } catch (e) {}
        return false;
      }

      function dispose(disposeOpts) {
        var dOpts = disposeOpts && typeof disposeOpts === 'object' ? disposeOpts : {};
        if (dOpts.suspendOnly) {
          return suspend();
        }
        disposed = true;
        return closeAudioContext();
      }

      function rearm() {
        disposed = false;
      }

      function isMuted() {
        return muted;
      }

      function setMuted(nextMuted, persist) {
        muted = Boolean(nextMuted);
        if (persist !== false) {
          writeMutedPref(root, muted);
        }
        if (muted) {
          suspend();
        }
        return muted;
      }

      function toggleMuted(persist) {
        return setMuted(!muted, persist);
      }

      function getAudioState() {
        return audioCtx ? String(audioCtx.state || 'created') : 'none';
      }

      return {
        playSound: playSound,
        getAudioContext: getAudioContext,
        getShortNoiseBuffer: getShortNoiseBuffer,
        suspend: suspend,
        evictIdleAudio: suspend,
        closeAudioContext: closeAudioContext,
        dispose: dispose,
        rearm: rearm,
        isMuted: isMuted,
        setMuted: setMuted,
        toggleMuted: toggleMuted,
        getAudioState: getAudioState,
        readMutedPref: function () {
          return readMutedPref(root);
        },
        writeMutedPref: function (val) {
          writeMutedPref(root, val);
        },
      };
    }

    return {
      MUTE_STORAGE_KEY: MUTE_STORAGE_KEY,
      readMutedPref: readMutedPref,
      writeMutedPref: writeMutedPref,
      isReducedMotion: isReducedMotion,
      createShortNoiseBuffer: createShortNoiseBuffer,
      createLowpassBus: createLowpassBus,
      triggerCeramicLiftSound: triggerCeramicLiftSound,
      triggerJadePebbleStepSound: triggerJadePebbleStepSound,
      triggerCeramicBottomOutSlam: triggerCeramicBottomOutSlam,
      triggerRotaryRatchetSound: triggerRotaryRatchetSound,
      triggerOrchLatchSound: triggerOrchLatchSound,
      triggerBlindFidgetSound: triggerBlindFidgetSound,
      triggerWelcomeChime: triggerWelcomeChime,
      triggerSoftDownSound: triggerSoftDownSound,
      triggerResetSnapSound: triggerResetSnapSound,
      triggerPrismWaveSound: triggerPrismWaveSound,
      triggerLockThudSound: triggerLockThudSound,
      createAudioFxEngine: createAudioFxEngine,
    };
  }
);

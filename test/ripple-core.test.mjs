import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const rippleCore = require('../ripple-core.js');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('hash and fractalNoise are deterministic and bounded in [0, 1)', () => {
  for (let i = -20; i < 40; i++) {
    const h1 = rippleCore.hash(i, i * 3 + 7);
    const h2 = rippleCore.hash(i, i * 3 + 7);
    assert.equal(h1, h2);
    assert.ok(h1 >= 0 && h1 < 1);
    const n = rippleCore.fractalNoise(i * 0.13, i * 0.27);
    assert.ok(n >= 0 && n <= 1);
  }
});

test('glyphIndex stays within GLYPHS atlas bounds', () => {
  for (let t = 0; t < 10; t++) {
    for (let c = 0; c < 15; c++) {
      const idx = rippleCore.glyphIndex(c, t, t);
      assert.ok(Number.isInteger(idx));
      assert.ok(idx >= 0 && idx < rippleCore.GLYPHS.length);
    }
  }
});

test('createWaveField propagates disturbance and damps back to rest', () => {
  const wf = rippleCore.createWaveField(20, 15, () => 0.5);
  assert.equal(wf.active(), false);
  wf.disturb(10, 7);
  assert.equal(wf.active(), true);
  wf.advance(0.05);
  let maxH = 0;
  for (let i = 0; i < wf.height.length; i++) {
    maxH = Math.max(maxH, Math.abs(wf.height[i]));
  }
  assert.ok(maxH > 0, 'wave height should become non-zero after disturbance');
  for (let step = 0; step < 500; step++) wf.advance(0.05);
  assert.equal(wf.active(), false);
});

test('createWaveField handles zero-sized grids and out-of-bounds clicks safely', () => {
  const zero = rippleCore.createWaveField(0, 0);
  zero.disturb(5, 5);
  assert.equal(zero.active(), false);

  const small = rippleCore.createWaveField(4, 4, () => 0.2);
  small.disturb(-10, 99);
  assert.equal(small.active(), true);
});

test('parseCssColorToRgb parses hex and rgb(a) formats', () => {
  assert.deepEqual(rippleCore.parseCssColorToRgb('#4d6bfe'), [77, 107, 254]);
  assert.deepEqual(rippleCore.parseCssColorToRgb('#fff'), [255, 255, 255]);
  assert.deepEqual(rippleCore.parseCssColorToRgb('rgb(19, 22, 29)'), [19, 22, 29]);
  assert.deepEqual(rippleCore.parseCssColorToRgb('rgba(127, 166, 255, 0.8)'), [127, 166, 255]);
  assert.equal(rippleCore.parseCssColorToRgb('transparent'), null);
});

test('cloudClear keeps subtle atmospheric range without over-brightening idle dark matrix', () => {
  assert.ok(rippleCore.RIPPLE.idleAlphaDark > 0 && rippleCore.RIPPLE.idleAlphaDark <= 0.16);
  let min = 1;
  let max = 0;
  for (let i = 0; i < 60; i++) {
    const v = rippleCore.cloudClear(i * 47, i * 31);
    assert.ok(v >= 0.22 && v <= 1);
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  assert.ok(min < 0.35, `expected low cloud valley (< 0.35), got ${min}`);
  assert.ok(max >= min);
});

test('RIPPLE high-chroma Google AI four-color spectrum (dark & daylight jewel stops) meet prism optics contract', () => {
  const { RIPPLE, SPECTRUM, SPECTRUM_LIGHT, spectrumRgb } = rippleCore;
  assert.ok(RIPPLE.prismCap >= 0.7, `expected RIPPLE.prismCap >= 0.7, got ${RIPPLE.prismCap}`);
  assert.equal(RIPPLE.prismCap, 0.74);
  assert.equal(RIPPLE.auraTint, 0.48);
  assert.equal(RIPPLE.auraLift, 0.78);
  assert.equal(RIPPLE.prismTint, 0.68);
  assert.equal(RIPPLE.prismThreshold, 0.2);

  assert.deepEqual(SPECTRUM, [
    [66, 133, 244],   // Cobalt
    [155, 114, 203],  // Iris
    [234, 67, 53],    // Coral
    [251, 188, 4],    // Amber
  ]);

  assert.deepEqual(SPECTRUM_LIGHT, [
    [37, 99, 235],    // Royal Cobalt #2563EB
    [124, 58, 237],   // Iris #7C3AED
    [234, 67, 53],    // Coral #EA4335
    [217, 119, 6],    // Amber #D97706
  ]);

  const out = [0, 0, 0];
  assert.deepEqual(spectrumRgb(0, out), [66, 133, 244]);
  assert.deepEqual(spectrumRgb(0.25, out), [155, 114, 203]);
  assert.deepEqual(spectrumRgb(0.5, out), [234, 67, 53]);
  assert.deepEqual(spectrumRgb(0.75, out), [251, 188, 4]);
  assert.deepEqual(spectrumRgb(1.0, out), [66, 133, 244]);

  assert.deepEqual(spectrumRgb(0, out, false), [37, 99, 235]);
  assert.deepEqual(spectrumRgb(0.25, out, false), [124, 58, 237]);
  assert.deepEqual(spectrumRgb(0.5, out, false), [234, 67, 53]);
  assert.deepEqual(spectrumRgb(0.75, out, false), [217, 119, 6]);
  assert.deepEqual(spectrumRgb(1.0, out, false), [37, 99, 235]);
});

test('waves.skimmer excites fluid wake proportional to speedNorm without blowing out load or heightCap', () => {
  const wfSlow = rippleCore.createWaveField(60, 30, () => 0.5);
  const wfFast = rippleCore.createWaveField(60, 30, () => 0.5);

  wfSlow.skimmer(30, 15, 0.05);
  wfFast.skimmer(30, 15, 0.95);
  assert.equal(wfSlow.active(), true);
  assert.equal(wfFast.active(), true);

  wfSlow.advance(0.05);
  wfFast.advance(0.05);

  let slowPeak = 0;
  let fastPeak = 0;
  for (let i = 0; i < wfSlow.height.length; i++) {
    slowPeak = Math.max(slowPeak, Math.abs(wfSlow.height[i]));
    fastPeak = Math.max(fastPeak, Math.abs(wfFast.height[i]));
  }
  assert.ok(slowPeak > 0, 'slow skimmer should excite subtle fluid wake');
  assert.ok(fastPeak > slowPeak, `fast skimmer (${fastPeak}) should exceed slow skimmer (${slowPeak})`);

  for (let step = 0; step < 80; step++) {
    wfFast.skimmer(10 + (step % 40), 15, 1.0);
    if (step % 3 === 0) wfFast.advance(0.016);
  }
  let maxAfterSweep = 0;
  for (let i = 0; i < wfFast.height.length; i++) {
    maxAfterSweep = Math.max(maxAfterSweep, Math.abs(wfFast.height[i]));
  }
  assert.ok(maxAfterSweep <= rippleCore.RIPPLE.heightCap + 1e-4, `height ${maxAfterSweep} must stay within heightCap`);

  const zero = rippleCore.createWaveField(0, 0);
  zero.skimmer(5, 5, 0.8);
  assert.equal(zero.active(), false);

  wfFast.skimmer(Number.NaN, 10, 0.5);
  wfFast.disturb(20, 10, { amplitudeScale: 0.9, radiusScale: 0.85, duration: 0.24 });
  assert.equal(wfFast.active(), true);

  for (let step = 0; step < 500; step++) wfFast.advance(0.05);
  assert.equal(wfFast.active(), false);
});

test('createGlyphField 2D renderer renders swirling four-color aura, prism waves, and respects calmZones', () => {
  function makeMockCanvas(width, height) {
    let lastImage = null;
    const ctx2d = {
      setTransform() {},
      clearRect() {},
      fillText() {},
      getImageData(_x, _y, w, h) {
        const buf = new Uint8ClampedArray(w * h * 4);
        for (let i = 3; i < buf.length; i += 4) buf[i] = 255;
        return { width: w, height: h, data: buf };
      },
      createImageData(w, h) {
        return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
      },
      putImageData(img) {
        lastImage = img;
      },
    };
    return {
      width,
      height,
      get lastImage() { return lastImage; },
      ownerDocument: {
        createElement() {
          return makeMockCanvas(1, 1);
        },
      },
      getContext(type) {
        return type === '2d' ? ctx2d : null;
      },
    };
  }

  const cols = 40;
  const rows = 20;
  const { cellWidth, cellHeight } = rippleCore.RIPPLE;
  const canvas = makeMockCanvas(cols * cellWidth, rows * cellHeight);
  const waves = rippleCore.createWaveField(cols, rows, () => 0.5);
  const field = rippleCore.createGlyphField(canvas, cols, rows, waves);
  assert.equal(field.mode, '2d');

  const cx = (cols * cellWidth) / 2;
  const cy = (rows * cellHeight) / 2;
  field.draw(1000, {
    dark: true,
    ink: [146, 148, 156],
    wave: [214, 218, 228],
    aura: { x: cx, y: cy, radius: 120, strength: 1, active: true },
  }, false);

  function samplePixel(px, py) {
    const img = canvas.lastImage;
    const x = Math.max(0, Math.min(img.width - 1, Math.floor(px)));
    const y = Math.max(0, Math.min(img.height - 1, Math.floor(py)));
    const idx = (y * img.width + x) * 4;
    return [img.data[idx], img.data[idx + 1], img.data[idx + 2], img.data[idx + 3]];
  }

  const rightPx = samplePixel(cx + 35, cy);
  const topPx = samplePixel(cx, cy - 35);
  const leftPx = samplePixel(cx - 35, cy);
  const bottomPx = samplePixel(cx, cy + 35);
  const colorDiffTopBottom = Math.abs(topPx[0] - bottomPx[0]) + Math.abs(topPx[1] - bottomPx[1]) + Math.abs(topPx[2] - bottomPx[2]);
  const colorDiffLeftRight = Math.abs(leftPx[0] - rightPx[0]) + Math.abs(leftPx[1] - rightPx[1]) + Math.abs(leftPx[2] - rightPx[2]);
  assert.ok(colorDiffTopBottom > 40, `expected vertical angular spectrum variation in aura, got diff=${colorDiffTopBottom}`);
  assert.ok(colorDiffLeftRight > 40, `expected horizontal angular spectrum variation in aura, got diff=${colorDiffLeftRight}`);

  waves.skimmer(20, 10, 0.8);
  waves.advance(0.05);
  field.setCalmZones([]);
  field.draw(1200, { dark: true, ink: [146, 148, 156], wave: [214, 218, 228], aura: null }, false);
  const unmaskedAlpha = samplePixel(cx, cy)[3];

  field.setCalmZones([{ x: cx - 60, y: cy - 40, w: 120, h: 80 }]);
  field.draw(1200, { dark: true, ink: [146, 148, 156], wave: [214, 218, 228], aura: null }, false);
  const calmedAlpha = samplePixel(cx, cy)[3];
  assert.ok(calmedAlpha < unmaskedAlpha * 0.65, `expected calmZone alpha (${calmedAlpha}) < 0.65 * unmasked (${unmaskedAlpha})`);

  // Light 白底模式：清晰深石板蓝底网 + 高饱和宝石四色受激折射
  const lightWaves = rippleCore.createWaveField(cols, rows, () => 0.5);
  const lightCanvas = makeMockCanvas(cols * cellWidth, rows * cellHeight);
  const lightField = rippleCore.createGlyphField(lightCanvas, cols, rows, lightWaves);
  function sampleLight(px, py) {
    const img = lightCanvas.lastImage;
    const x = Math.max(0, Math.min(img.width - 1, Math.floor(px)));
    const y = Math.max(0, Math.min(img.height - 1, Math.floor(py)));
    const idx = (y * img.width + x) * 4;
    return [img.data[idx], img.data[idx + 1], img.data[idx + 2], img.data[idx + 3]];
  }
  lightField.draw(1000, { dark: false, ink: [85, 102, 130], wave: [37, 99, 235], aura: null }, false);
  const idleLightAlpha = sampleLight(cx, cy)[3];
  assert.ok(idleLightAlpha <= 35, `expected quiet idle light alpha <= 35, got ${idleLightAlpha}`);

  lightWaves.disturb(20, 10);
  lightWaves.advance(0.05);
  lightWaves.advance(0.05);
  lightField.draw(1100, {
    dark: false,
    ink: [85, 102, 130],
    wave: [37, 99, 235],
    aura: { x: cx, y: cy, radius: 140, strength: 1, active: true },
  }, false);
  const excitedLightPx = sampleLight(cx + 21, cy);
  const chromaSpan = Math.max(excitedLightPx[0], excitedLightPx[1], excitedLightPx[2]) - Math.min(excitedLightPx[0], excitedLightPx[1], excitedLightPx[2]);
  assert.ok(excitedLightPx[3] >= 130, `expected boosted excited light alpha >= 130, got ${excitedLightPx[3]}`);
  assert.ok(chromaSpan >= 80, `expected vivid jewel chroma span >= 80 on light theme, got ${chromaSpan} (${excitedLightPx.slice(0, 3)})`);

  lightField.setCalmZones([{ x: cx - 60, y: cy - 40, w: 120, h: 80 }]);
  lightField.draw(1100, {
    dark: false,
    ink: [85, 102, 130],
    wave: [37, 99, 235],
    aura: { x: cx, y: cy, radius: 140, strength: 1, active: true },
  }, false);
  const calmedLightAlpha = sampleLight(cx + 21, cy)[3];
  assert.ok(calmedLightAlpha < excitedLightPx[3] * 0.7, `expected light calmZone alpha (${calmedLightAlpha}) < 0.7 * excited (${excitedLightPx[3]})`);

  lightField.dispose();
  field.dispose();
});

test('autonomous out-of-phase Google 4-color nebula breathes over time with aura: null, zero waves, ~25fps cadence, and calmZones', () => {
  function makeMockCanvas(width, height) {
    let lastImage = null;
    const ctx2d = {
      setTransform() {},
      clearRect() {},
      fillText() {},
      getImageData(_x, _y, w, h) {
        const buf = new Uint8ClampedArray(w * h * 4);
        for (let i = 3; i < buf.length; i += 4) buf[i] = 255;
        return { width: w, height: h, data: buf };
      },
      createImageData(w, h) {
        return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
      },
      putImageData(img) {
        lastImage = img;
      },
    };
    return {
      width,
      height,
      get lastImage() { return lastImage; },
      ownerDocument: {
        createElement() {
          return makeMockCanvas(1, 1);
        },
      },
      getContext(type) {
        return type === '2d' ? ctx2d : null;
      },
    };
  }

  const cols = 60;
  const rows = 30;
  const { cellWidth, cellHeight } = rippleCore.RIPPLE;
  const W = cols * cellWidth;
  const H = rows * cellHeight;
  const canvas = makeMockCanvas(W, H);
  const waves = rippleCore.createWaveField(cols, rows, () => 0.5);
  assert.equal(waves.active(), false);

  const field = rippleCore.createGlyphField(canvas, cols, rows, waves);
  const basePalette = { dark: true, ink: [146, 148, 156], wave: [214, 218, 228], aura: null };

  function sampleAt(px, py) {
    const img = canvas.lastImage;
    const x = Math.max(0, Math.min(img.width - 1, Math.floor(px)));
    const y = Math.max(0, Math.min(img.height - 1, Math.floor(py)));
    const idx = (y * img.width + x) * 4;
    return [img.data[idx], img.data[idx + 1], img.data[idx + 2], img.data[idx + 3]];
  }

  assert.equal(field.needsDraw(1000, false), true);
  field.draw(1000, basePalette, false);
  assert.equal(field.needsDraw(1015, false), false, 'should throttle sub-40ms idle redraws');
  assert.equal(field.needsDraw(1042, false), true, 'should trigger smooth ~25fps redraw at >=40ms');

  const probeX = Math.round(W * 0.21);
  const probeY = Math.round(H * 0.32);
  let minAlpha = 255;
  let maxAlpha = 0;
  let maxChroma = 0;
  let peakTs = 0;

  for (let ts = 0; ts <= 12000; ts += 600) {
    field.draw(ts, basePalette, false);
    assert.equal(waves.active(), false);
    const [r, g, b, a] = sampleAt(probeX, probeY);
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    if (a < minAlpha) minAlpha = a;
    if (a > maxAlpha) {
      maxAlpha = a;
      peakTs = ts;
    }
    if (chroma > maxChroma) maxChroma = chroma;
  }

  assert.ok(maxChroma >= 45, `expected vivid Google 4-color nebula tinting with aura:null (chroma >= 45), got ${maxChroma}`);
  assert.ok(maxAlpha >= minAlpha + 14, `expected visible breathing brightness variation across time, got min=${minAlpha}, max=${maxAlpha}`);

  field.setCalmZones([]);
  field.draw(peakTs, basePalette, false);
  const unmaskedNebulaAlpha = sampleAt(probeX, probeY)[3];

  field.setCalmZones([{ x: probeX - 50, y: probeY - 40, w: 100, h: 80 }]);
  field.draw(peakTs, basePalette, false);
  const calmedNebulaAlpha = sampleAt(probeX, probeY)[3];
  assert.ok(
    calmedNebulaAlpha < unmaskedNebulaAlpha * 0.65,
    `expected calmZone to suppress nebula alpha (${calmedNebulaAlpha} < 0.65 * ${unmaskedNebulaAlpha})`
  );

  field.setCalmZones([]);
  field.draw(1000, basePalette, true);
  assert.equal(field.needsDraw(2500, true), false, 'reduced-motion still mode should not schedule idle redraws');
  const stillPxA = sampleAt(probeX, probeY);
  field.invalidate();
  field.draw(7500, basePalette, true);
  const stillPxB = sampleAt(probeX, probeY);
  assert.deepEqual(stillPxA, stillPxB, 'reduced-motion still mode should hold constant nebula output across timestamps');

  field.dispose();
});

test('mountBrandHorizonGlow draws Antigravity bottom-weighted cobalt horizon glow in 2D fallback mode and cleans up safely', () => {
  const prevForce = globalThis.__agRippleForce2D;
  globalThis.__agRippleForce2D = true;
  try {
    let lastImage = null;
    const ctx2d = {
      createImageData(w, h) {
        return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
      },
      putImageData(img) {
        lastImage = img;
      },
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext(type) {
        return type === '2d' ? ctx2d : null;
      },
    };
    assert.equal(rippleCore.HORIZON_SPECTRUM.length, 4);
    const glow = rippleCore.mountBrandHorizonGlow(canvas);
    assert.equal(glow.mode, '2d');
    glow.resize(240, 160, 1);
    glow.draw(0, { dark: true, still: true, prismStrength: 1 });
    glow.draw(1200, { dark: true, still: false, prismStrength: 1 });
    assert.ok(lastImage, '2D fallback horizon glow should emit ImageData frame');

    const sampleRowAlpha = (rowY) => {
      let sum = 0;
      let blueDominance = 0;
      for (let x = 20; x < 220; x += 10) {
        const idx = (rowY * lastImage.width + x) * 4;
        sum += lastImage.data[idx + 3];
        blueDominance += lastImage.data[idx + 2] - lastImage.data[idx];
      }
      return { sum, blueDominance };
    };
    const topBand = sampleRowAlpha(16);
    const bottomBand = sampleRowAlpha(152);
    assert.equal(topBand.sum, 0, 'Upper region above horizon reach should stay completely transparent');
    assert.ok(bottomBand.sum > 200, `Expected visible horizon glow near bottom edge, got alpha sum ${bottomBand.sum}`);
    assert.ok(bottomBand.blueDominance > 100, 'Expected Antigravity cobalt/sky blue dominance near horizon');
    glow.dispose();
  } finally {
    if (prevForce === undefined) delete globalThis.__agRippleForce2D;
    else globalThis.__agRippleForce2D = prevForce;
  }
});

test('mountBrandHorizonGlow 2D supports conversation 4-state optics (idle / start surge / running prism / complete chime) while preserving home defaults', () => {
  function makeHorizon2DCanvas() {
    let lastImage = null;
    let drawCalls = 0;
    const ctx2d = {
      createImageData(w, h) {
        return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
      },
      putImageData(img) {
        lastImage = img;
        drawCalls++;
      },
    };
    return {
      width: 0,
      height: 0,
      get lastImage() { return lastImage; },
      get drawCalls() { return drawCalls; },
      getContext(type) {
        return type === '2d' ? ctx2d : null;
      },
    };
  }

  assert.deepEqual(rippleCore.DEFAULT_HORIZON_AURA, { reach: 0.47, prism: 0, surge: 0, speed: 1 });
  assert.equal(rippleCore.HORIZON_PRISM_STOPS.length, 5);
  const c0 = rippleCore.horizonPrismRgb(0, [0, 0, 0]);
  const c1 = rippleCore.horizonPrismRgb(1, [0, 0, 0]);
  assert.deepEqual(c0, c1, 'horizonPrismRgb loop must close seamlessly at t=0 and t=1');

  const noopGlow = rippleCore.mountBrandHorizonGlow(null);
  assert.equal(noopGlow.mode, 'none');
  assert.deepEqual(noopGlow.setAuraParams({ reach: 0.2 }), rippleCore.DEFAULT_HORIZON_AURA);
  assert.equal(noopGlow.drawStaticSnapshot({ dark: false, strength: 0.3 }), false);
  assert.equal(noopGlow.isSleeping(), true);

  const W = 240;
  const H = 200;
  const homeCanvas = makeHorizon2DCanvas();
  const homeGlow = rippleCore.mountBrandHorizonGlow(homeCanvas, { force2D: true });
  homeGlow.resize(W, H, 1);
  homeGlow.draw(2000, { dark: true, still: false, prismStrength: 1 });
  homeGlow.draw(4000, { dark: true, still: false, prismStrength: 1 });

  const convCanvas = makeHorizon2DCanvas();
  const convGlow = rippleCore.mountBrandHorizonGlow(convCanvas, { force2D: true });
  convGlow.resize(W, H, 1);

  const totalAlpha = (img, yStart = 0, yEnd = img.height) => {
    let sum = 0;
    for (let y = yStart; y < yEnd; y++) {
      for (let x = 0; x < img.width; x++) {
        sum += img.data[(y * img.width + x) * 4 + 3];
      }
    }
    return sum;
  };

  convGlow.draw(2000, true, 0.20, { reach: 0.16, prism: 0.06, surge: 0, speed: 0.55 });
  convGlow.draw(4000, true, 0.20, { reach: 0.16, prism: 0.06, surge: 0, speed: 0.55 });
  const homeTotal = totalAlpha(homeCanvas.lastImage);
  const idleTotal = totalAlpha(convCanvas.lastImage);
  assert.ok(idleTotal > 0, 'Idle conversation aura should remain subtly visible near bottom edge');
  assert.ok(idleTotal < homeTotal * 0.32, `Idle conversation aura (${idleTotal}) must be >68% weaker than home glow (${homeTotal})`);
  assert.equal(totalAlpha(convCanvas.lastImage, 0, Math.floor(H * 0.55)), 0, 'Upper 55% reading area must stay 100% transparent in idle');

  convGlow.draw(4100, true, 0.36, { reach: 0.25, prism: 0.36, surge: 0, speed: 1.15 });
  const frontRowY = Math.round(H * (1 - 0.25 * 0.92));
  const baselineFrontAlpha = totalAlpha(convCanvas.lastImage, frontRowY - 2, frontRowY + 3);

  convGlow.draw(4133, true, 0.36, { reach: 0.25, prism: 0.36, surge: 0.58, speed: 1.15 });
  const surgedFrontAlpha = totalAlpha(convCanvas.lastImage, frontRowY - 2, frontRowY + 3);
  assert.ok(surgedFrontAlpha > baselineFrontAlpha + 120, `Start surge should lift upper arc wavefront (${surgedFrontAlpha} > ${baselineFrontAlpha} + 120)`);
  assert.equal(totalAlpha(convCanvas.lastImage, 0, Math.floor(H * 0.5)), 0, 'Upper 50% reading area must remain 100% transparent even at peak start surge');

  convGlow.draw(4200, true, 0.32, { reach: 0.22, prism: 0, surge: 0, speed: 1.12 });
  const pureBlueImg = Uint8ClampedArray.from(convCanvas.lastImage.data);
  convGlow.draw(4200, true, 0.32, { reach: 0.22, prism: 0.40, surge: 0, speed: 1.12 });
  const prismImg = convCanvas.lastImage.data;
  let prismColorDelta = 0;
  for (let i = 0; i < prismImg.length; i += 4) {
    if (prismImg[i + 3] > 0) {
      prismColorDelta += Math.abs(prismImg[i] - pureBlueImg[i]) + Math.abs(prismImg[i + 1] - pureBlueImg[i + 1]);
    }
  }
  assert.ok(prismColorDelta > 2500, `Expected smooth Google 4-color prism dispersion across horizon wings, got delta=${prismColorDelta}`);

  const regionEnergy = (img, x0, x1, y0, y1) => {
    let e = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const idx = (y * img.width + x) * 4;
        e += img.data[idx] * img.data[idx + 3];
      }
    }
    return e;
  };
  convGlow.draw(4300, true, 0.30, { reach: 0.23, prism: 0.12, surge: -0.22, speed: 0.9 });
  const earlyCenter = regionEnergy(convCanvas.lastImage, Math.floor(W * 0.4), Math.floor(W * 0.6), Math.floor(H * 0.8), H);
  const earlyFlank = regionEnergy(convCanvas.lastImage, Math.floor(W * 0.1), Math.floor(W * 0.28), Math.floor(H * 0.8), H);

  convGlow.draw(4340, true, 0.30, { reach: 0.23, prism: 0.12, surge: -0.72, speed: 0.9 });
  const lateCenter = regionEnergy(convCanvas.lastImage, Math.floor(W * 0.4), Math.floor(W * 0.6), Math.floor(H * 0.8), H);
  const lateFlank = regionEnergy(convCanvas.lastImage, Math.floor(W * 0.1), Math.floor(W * 0.28), Math.floor(H * 0.8), H);
  assert.ok(
    lateFlank / Math.max(1, lateCenter) > earlyFlank / Math.max(1, earlyCenter),
    'Complete chime ripple should expand outward from center toward lateral flanks as surge progresses from -0.22 to -0.72'
  );

  const setSnap = convGlow.setAuraParams({ reach: 0.18, prism: 0.15, speed: 0.55 });
  assert.equal(setSnap.reach, 0.18);
  assert.equal(setSnap.prism, 0.15);
  assert.equal(setSnap.speed, 0.55);
  convGlow.draw(5000, true, 0.24);
  const beforeSpeedShift = Uint8ClampedArray.from(convCanvas.lastImage.data);
  convGlow.draw(5020, true, 0.24, { reach: 0.18, prism: 0.15, speed: 1.15 });
  const afterSpeedShift = convCanvas.lastImage.data;
  let maxSingleStepJump = 0;
  for (let i = 0; i < afterSpeedShift.length; i += 4) {
    maxSingleStepJump = Math.max(maxSingleStepJump, Math.abs(afterSpeedShift[i + 3] - beforeSpeedShift[i + 3]));
  }
  assert.ok(maxSingleStepJump <= 8, `Phase accumulator should keep speed transition smooth without jump, got max alpha step=${maxSingleStepJump}`);

  const resetSnap = convGlow.setAuraParams(null);
  assert.deepEqual(resetSnap, rippleCore.DEFAULT_HORIZON_AURA);

  homeGlow.dispose();
  convGlow.dispose();
});

test('mountBrandHorizonGlow WebGL2 shader compiles #version 300 es prism/surge/speed uniforms and Daylight Dichroic Ink Wash', () => {
  const prevForce = globalThis.__agRippleForce2D;
  delete globalThis.__agRippleForce2D;
  try {
    const shaderSources = [];
    const uniformValues = new Map();
    let drawArraysCount = 0;
    let deletedPrograms = 0;
    const listeners = new Map();

    const mockGl = {
      VERTEX_SHADER: 0x8b31,
      FRAGMENT_SHADER: 0x8b30,
      COMPILE_STATUS: 0x8b81,
      LINK_STATUS: 0x8b82,
      COLOR_BUFFER_BIT: 0x4000,
      TRIANGLES: 0x0004,
      createShader(type) { return { type, source: '' }; },
      shaderSource(sh, src) { sh.source = src; shaderSources.push(src); },
      compileShader() {},
      getShaderParameter() { return true; },
      getShaderInfoLog() { return ''; },
      deleteShader() {},
      createProgram() { return { id: 'glow-prog' }; },
      attachShader() {},
      linkProgram() {},
      getProgramParameter() { return true; },
      getProgramInfoLog() { return ''; },
      useProgram() {},
      deleteProgram() { deletedPrograms++; },
      getUniformLocation(_prog, name) { return { name }; },
      viewport() {},
      uniform2f(loc, x, y) { if (loc) uniformValues.set(loc.name, [x, y]); },
      uniform1f(loc, v) { if (loc) uniformValues.set(loc.name, v); },
      clearColor() {},
      clear() {},
      drawArrays(_mode, _first, count) {
        if (count === 3) drawArraysCount++;
      },
    };

    const canvas = {
      width: 0,
      height: 0,
      addEventListener(evt, fn) { listeners.set(evt, fn); },
      removeEventListener(evt) { listeners.delete(evt); },
      getContext(type) { return type === 'webgl2' ? mockGl : null; },
    };

    const glow = rippleCore.mountBrandHorizonGlow(canvas);
    assert.equal(glow.mode, 'webgl2');

    const fragSrc = shaderSources.find((s) => s.includes('uniform float uPrism'));
    assert.ok(fragSrc, 'Fragment shader source should declare uPrism uniform');
    assert.equal(fragSrc, rippleCore.HORIZON_FRAGMENT_SHADER);
    assert.ok(fragSrc.startsWith('#version 300 es'), 'Fragment shader must use WebGL2 #version 300 es');
    for (const token of [
      'uniform float uReach;',
      'uniform float uPrism;',
      'uniform float uSurge;',
      'uniform float uSpeed;',
      'vec3 prismLoop(',
      'vec3 daylightInkLoop(',
      'DAY_COBALT',
      'DAY_IRIS',
      'DAY_CORAL',
      'DAY_AMBER',
      'ICE_MIST',
    ]) {
      assert.ok(fragSrc.includes(token), `Expected HORIZON_FRAGMENT_SHADER to include "${token}"`);
    }
    // 严格防退化：WebGL2 GLSL ES 3.00 源码必须 100% 纯 ASCII（防 ANGLE 编译器因非 ASCII 注释报错），且浅色分支绝不可使用 mix(vec3(1.0), ...) 冲白
    for (const src of shaderSources) {
      assert.equal(/^[\x09\x0a\x0d\x20-\x7e]*$/.test(src), true, 'WebGL2 GLSL ES 3.00 shader source must contain strictly ASCII characters');
      let braces = 0;
      let parens = 0;
      for (const ch of src) {
        if (ch === '{') braces++;
        else if (ch === '}') braces--;
        else if (ch === '(') parens++;
        else if (ch === ')') parens--;
      }
      assert.equal(braces, 0, 'GLSL braces must be balanced');
      assert.equal(parens, 0, 'GLSL parentheses must be balanced');
    }
    assert.equal(fragSrc.includes('mix(vec3(1.0)'), false, 'Daylight shader must NOT dilute ink into white fog via mix(vec3(1.0), ...)');

    glow.resize(320, 180, 1);

    glow.draw(0, { dark: true, still: false, prismStrength: 1 });
    assert.equal(drawArraysCount, 1);
    assert.ok(Math.abs(uniformValues.get('uReach') - 0.47) < 1e-6);
    assert.equal(uniformValues.get('uPrism'), 0);
    assert.equal(uniformValues.get('uSurge'), 0);
    assert.equal(uniformValues.get('uSpeed'), 1);

    glow.draw(1000, true, 0.20, { reach: 0.16, prism: 0.06, surge: 0, speed: 0.55 });
    assert.equal(drawArraysCount, 2);
    assert.ok(Math.abs(uniformValues.get('uReach') - 0.16) < 1e-6);
    assert.ok(Math.abs(uniformValues.get('uPrism') - 0.06) < 1e-6);
    assert.equal(uniformValues.get('uSurge'), 0);
    assert.ok(Math.abs(uniformValues.get('uSpeed') - 0.55) < 1e-6);

    glow.draw(1016, true, 0.40, { reach: 0.25, prism: 0.36, surge: 0.54, speed: 1.15 });
    assert.equal(drawArraysCount, 3, 'Transient start surge frame at +16ms must not be dropped by throttle');
    assert.ok(Math.abs(uniformValues.get('uSurge') - 0.54) < 1e-6);
    assert.ok(Math.abs(uniformValues.get('uPrism') - 0.36) < 1e-6);

    glow.draw(1060, true, 0.28, { reach: 0.21, prism: 0.19, surge: 0, speed: 1.12 });
    assert.equal(drawArraysCount, 4);
    assert.ok(Math.abs(uniformValues.get('uReach') - 0.21) < 1e-6);
    assert.ok(Math.abs(uniformValues.get('uPrism') - 0.19) < 1e-6);
    assert.equal(uniformValues.get('uSurge'), 0);

    glow.draw(1090, false, 0.30, { reach: 0.22, prism: 0.24, surge: -0.65, speed: 0.85 });
    assert.equal(drawArraysCount, 5);
    assert.equal(uniformValues.get('uDark'), 0);
    assert.ok(Math.abs(uniformValues.get('uSurge') - (-0.65)) < 1e-6);

    assert.ok(listeners.has('webglcontextrestored'));
    listeners.get('webglcontextrestored')();
    glow.draw(1090, false, 0.30, { reach: 0.22, prism: 0.24, surge: -0.65, speed: 0.85 });
    assert.equal(drawArraysCount, 6);

    glow.dispose();
    // onContextRestored() frees the previous program before rebuilding (1), then dispose() deletes the rebuilt program (2)
    assert.equal(deletedPrograms, 2);
    assert.equal(listeners.size, 0);
  } finally {
    if (prevForce !== undefined) globalThis.__agRippleForce2D = prevForce;
  }
});

test('Daylight Dichroic Ink Wash renders vivid non-white jewel chroma on #F4F7FB / #F6F4EE even at low conversation strength (0.22~0.35)', () => {
  let lastImage = null;
  const canvas = {
    width: 0,
    height: 0,
    getContext(type) {
      if (type !== '2d') return null;
      return {
        createImageData(w, h) {
          return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
        },
        putImageData(img) {
          lastImage = img;
        },
      };
    },
  };

  const W = 280;
  const H = 180;
  const glow = rippleCore.mountBrandHorizonGlow(canvas, { force2D: true });
  glow.resize(W, H, 1);

  // 在苛刻的会话页低强度 strength = 0.24（浅色模式）下直接绘制静帧快照
  const rendered = glow.drawStaticSnapshot(1000, false, 0.24, { reach: 0.26, prism: 0.22, surge: 0, speed: 0.55 });
  assert.equal(rendered, true);
  assert.equal(glow.isSleeping(), true);
  assert.ok(lastImage, 'Expected 2D ImageData output for daylight static snapshot');

  // 上方阅读区必须 100% 透明
  let topAlpha = 0;
  for (let y = 0; y < Math.floor(H * 0.45); y++) {
    for (let x = 0; x < W; x++) {
      topAlpha += lastImage.data[(y * W + x) * 4 + 3];
    }
  }
  assert.equal(topAlpha, 0, 'Upper reading area must remain 100% transparent in daylight mode');

  // 采样底部地平线光带，合成到 Daylight Crystal (#F4F7FB = [244, 247, 251]) 白底上检验视觉对比度与彩墨饱和度
  const bg = [244, 247, 251];
  const rowY = H - 6;
  let maxAlpha = 0;
  let maxRawChroma = 0;
  let maxCompositeDeltaFromBg = 0;
  const sampledHues = [];

  for (let x = 24; x <= W - 24; x += 16) {
    const idx = (rowY * W + x) * 4;
    const r = lastImage.data[idx];
    const g = lastImage.data[idx + 1];
    const b = lastImage.data[idx + 2];
    const a = lastImage.data[idx + 3];
    if (a > maxAlpha) maxAlpha = a;
    if (a > 20) {
      const rawChroma = Math.max(r, g, b) - Math.min(r, g, b);
      if (rawChroma > maxRawChroma) maxRawChroma = rawChroma;
      // 严禁退化为近纯白灰雾（例如 R>235 && G>235 && B>235）
      assert.equal(r > 235 && g > 235 && b > 235, false, `Pixel at x=${x} degenerated to near-white fog: rgba(${r},${g},${b},${a})`);
      const af = a / 255;
      const compR = bg[0] * (1 - af) + r * af;
      const compG = bg[1] * (1 - af) + g * af;
      const compB = bg[2] * (1 - af) + b * af;
      const delta = Math.abs(bg[0] - compR) + Math.abs(bg[1] - compG) + Math.abs(bg[2] - compB);
      if (delta > maxCompositeDeltaFromBg) maxCompositeDeltaFromBg = delta;
      sampledHues.push([r, g, b]);
    }
  }

  assert.ok(maxAlpha >= 70, `Expected visible alpha >= 70 at conversation strength 0.24 in daylight mode, got ${maxAlpha}`);
  assert.ok(maxRawChroma >= 95, `Expected high-saturation jewel ink chroma >= 95 (not washed-out gray/white), got ${maxRawChroma}`);
  assert.ok(maxCompositeDeltaFromBg >= 65, `Expected clear visible contrast >= 65 against #F4F7FB canvas, got ${maxCompositeDeltaFromBg}`);

  // 验证横跨地平线存在多色棱镜折射梯度（左翼与右翼 RGB 明显不同）
  assert.ok(sampledHues.length >= 6);
  let maxSpanDiff = 0;
  for (let i = 0; i < sampledHues.length; i++) {
    for (let j = i + 1; j < sampledHues.length; j++) {
      const d = Math.abs(sampledHues[i][0] - sampledHues[j][0])
        + Math.abs(sampledHues[i][1] - sampledHues[j][1])
        + Math.abs(sampledHues[i][2] - sampledHues[j][2]);
      if (d > maxSpanDiff) maxSpanDiff = d;
    }
  }
  assert.ok(maxSpanDiff >= 90, `Expected multi-hue prismatic ink dispersion across horizon span, got max diff ${maxSpanDiff}`);

  // 验证动态唤醒后 isSleeping 自动解除，再次单对象调用 drawStaticSnapshot 立即重回休眠
  glow.draw(1200, false, 0.35, { reach: 0.26, prism: 0.3, surge: 0.4, speed: 1.1 });
  assert.equal(glow.isSleeping(), false);
  assert.equal(glow.drawStaticSnapshot({ dark: false, strength: 0.52, reach: 0.32, prism: 0.2 }), true);
  assert.equal(glow.isSleeping(), true);

  glow.dispose();
});

test('createGlyphField.triggerLiftoffBurst & busy() converge strictly to false after wave & trail decay (zero infinite rAF)', () => {
  function makeMockCanvas(width, height) {
    let lastImage = null;
    const ctx2d = {
      setTransform() {},
      clearRect() {},
      fillText() {},
      getImageData(_x, _y, w, h) {
        const buf = new Uint8ClampedArray(w * h * 4);
        for (let i = 3; i < buf.length; i += 4) buf[i] = 255;
        return { width: w, height: h, data: buf };
      },
      createImageData(w, h) {
        return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
      },
      putImageData(img) {
        lastImage = img;
      },
    };
    return {
      width,
      height,
      get lastImage() { return lastImage; },
      ownerDocument: {
        hidden: false,
        createElement() { return makeMockCanvas(1, 1); },
      },
      getContext(type) { return type === '2d' ? ctx2d : null; },
    };
  }

  const zeroField = rippleCore.createGlyphField(makeMockCanvas(0, 0), 0, 0, rippleCore.createWaveField(0, 0));
  assert.equal(zeroField.triggerLiftoffBurst(), false);
  assert.equal(zeroField.triggerTideSwell(), false);
  assert.equal(zeroField.busy(), false);
  assert.equal(zeroField.isSettled(), true);

  const cols = 50;
  const rows = 28;
  const { cellWidth, cellHeight } = rippleCore.RIPPLE;
  const canvas = makeMockCanvas(cols * cellWidth, rows * cellHeight);
  const waves = rippleCore.createWaveField(cols, rows, () => 0.5);
  const field = rippleCore.createGlyphField(canvas, cols, rows, waves);
  assert.equal(field.busy(), false);
  assert.equal(field.isSettled(), true);

  assert.equal(field.triggerLiftoffBurst(0.3, 0.7), true);
  assert.equal(waves.active(), true);
  assert.equal(field.busy(), true);
  assert.equal(field.isSettled(), false);

  waves.advance(0.05);
  waves.advance(0.05);

  const targetCol = Math.round(0.3 * (cols - 1));
  const targetRow = Math.round(0.7 * (rows - 1));
  let localEnergy = 0;
  let farCornerEnergy = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const h = Math.abs(waves.height[r * cols + c]);
      if (Math.abs(c - targetCol) <= 8 && Math.abs(r - targetRow) <= 6) localEnergy += h;
      if (c > cols - 6 && r < 4) farCornerEnergy += h;
    }
  }
  assert.ok(localEnergy > 2.5, `Expected strong dual-layer liftoff thrust energy near (0.3, 0.7), got ${localEnergy}`);
  assert.ok(farCornerEnergy < localEnergy * 0.01, `Wavefront should concentrate at normalized liftoff anchor (${farCornerEnergy} << ${localEnergy})`);

  field.draw(1000, { dark: true, ink: [146, 148, 156], wave: [214, 218, 228], aura: null, nebula: false, prismStrength: 0.2 }, false);
  const img = canvas.lastImage;
  let maxBurstChroma = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] > 40) {
      const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
      const ch = Math.max(r, g, b) - Math.min(r, g, b);
      if (ch > maxBurstChroma) maxBurstChroma = ch;
    }
  }
  assert.ok(maxBurstChroma >= 45, `Expected prism dispersion boost chroma >= 45 on liftoff burst, got ${maxBurstChroma}`);

  // 验证大跨度时间戳跳跃后单帧即可彻底衰减尾迹归零，无需数十次冗余 draw
  assert.equal(field.triggerLiftoffBurst(Number.NaN, 99), true);
  for (let step = 0; step < 520; step++) waves.advance(0.05);
  assert.equal(waves.active(), false);
  field.draw(12000, { dark: true, ink: [146, 148, 156], wave: [214, 218, 228], aura: null }, false);
  assert.equal(field.busy(), false, 'busy() must immediately settle to false once wave & glow decay elapse');
  assert.equal(field.isSettled(), true);

  // 验证无渲染上下文（headless null context）下 busy() 同样能准确归零，绝不残留 prismBurst
  const headlessWaves = rippleCore.createWaveField(20, 12, () => 0.5);
  const headlessField = rippleCore.createGlyphField({ width: 140, height: 180, ownerDocument: { hidden: false }, getContext: () => null }, 20, 12, headlessWaves);
  assert.equal(headlessField.triggerLiftoffBurst(), true);
  assert.equal(headlessField.busy(), true);
  for (let step = 0; step < 500; step++) headlessWaves.advance(0.05);
  headlessField.draw(10000, { dark: false }, false);
  assert.equal(headlessField.busy(), false, 'headless field must also decay prismBurst to 0 and report busy() === false');

  headlessField.dispose();
  field.dispose();
});

test('createGlyphField.triggerTideSwell excites 3 staggered horizon wave sources along bottom edge', () => {
  const cols = 60;
  const rows = 30;
  const { cellWidth, cellHeight } = rippleCore.RIPPLE;
  const mockCanvas = {
    width: cols * cellWidth,
    height: rows * cellHeight,
    ownerDocument: {
      hidden: false,
      createElement() { return mockCanvas; },
    },
    getContext() { return null; },
  };
  const waves = rippleCore.createWaveField(cols, rows, () => 0.5);
  const field = rippleCore.createGlyphField(mockCanvas, cols, rows, waves);

  assert.equal(field.triggerTideSwell(), true);
  assert.equal(waves.active(), true);

  const bandEnergy = (c0, c1, r0, r1) => {
    let sum = 0;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) sum += Math.abs(waves.height[r * cols + c]);
    }
    return sum;
  };

  waves.advance(0.03);
  const earlyCenter = bandEnergy(27, 33, rows - 7, rows - 1);
  const earlyLeft = bandEnergy(10, 16, rows - 7, rows - 1);
  const earlyRight = bandEnergy(44, 50, rows - 7, rows - 1);
  const earlyTop = bandEnergy(0, cols - 1, 0, 6);
  assert.ok(earlyCenter > 1.0, `Expected center horizon swell to rise first, got ${earlyCenter}`);
  assert.ok(earlyLeft < earlyCenter * 0.08, `Left flank (${earlyLeft}) should remain quiet before its 0.07s stagger`);
  assert.ok(earlyRight < earlyCenter * 0.08, `Right flank (${earlyRight}) should remain quiet before its 0.14s stagger`);
  assert.ok(earlyTop < 1e-6, `Upper reading zone should stay undisturbed, got ${earlyTop}`);

  waves.advance(0.05);
  waves.advance(0.03);
  const midLeft = bandEnergy(10, 16, rows - 7, rows - 1);
  const midRight = bandEnergy(44, 50, rows - 7, rows - 1);
  assert.ok(midLeft > earlyLeft * 4 + 0.5, `Expected staggered left horizon swell to rise after 0.07s, got ${midLeft}`);
  assert.ok(midLeft > midRight * 2.2, `Left swell (${midLeft}) should lead right swell (${midRight}) before 0.14s`);

  waves.advance(0.05);
  waves.advance(0.03);
  const lateRight = bandEnergy(44, 50, rows - 7, rows - 1);
  assert.ok(lateRight > midRight * 2 + 0.5, `Expected staggered right horizon swell to rise after 0.14s, got ${lateRight}`);

  for (let step = 0; step < 500; step++) waves.advance(0.05);
  assert.equal(waves.active(), false);
  field.dispose();
});

test('document.hidden suppresses idle/active frame draws in both createGlyphField and mountBrandHorizonGlow', () => {
  let glyphDraws = 0;
  let glowDraws = 0;
  const docState = {
    hidden: false,
    createElement() { return makeGlyphCanvas(1, 1); },
  };

  function makeGlyphCanvas(w, h) {
    const ctx2d = {
      setTransform() {},
      clearRect() {},
      fillText() {},
      getImageData(_x, _y, iw, ih) {
        const buf = new Uint8ClampedArray(iw * ih * 4);
        for (let i = 3; i < buf.length; i += 4) buf[i] = 255;
        return { width: iw, height: ih, data: buf };
      },
      createImageData(iw, ih) {
        return { width: iw, height: ih, data: new Uint8ClampedArray(iw * ih * 4) };
      },
      putImageData() {
        glyphDraws++;
      },
    };
    return {
      width: w,
      height: h,
      ownerDocument: docState,
      getContext(type) { return type === '2d' ? ctx2d : null; },
    };
  }

  const glowCanvas = {
    width: 0,
    height: 0,
    ownerDocument: docState,
    getContext(type) {
      if (type !== '2d') return null;
      return {
        createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
        putImageData() { glowDraws++; },
      };
    },
  };

  const cols = 20, rows = 12;
  const gCanvas = makeGlyphCanvas(cols * rippleCore.RIPPLE.cellWidth, rows * rippleCore.RIPPLE.cellHeight);
  const waves = rippleCore.createWaveField(cols, rows, () => 0.5);
  const field = rippleCore.createGlyphField(gCanvas, cols, rows, waves);
  const glow = rippleCore.mountBrandHorizonGlow(glowCanvas, { force2D: true });
  glow.resize(160, 120, 1);

  const pal = { dark: true, ink: [146, 148, 156], wave: [214, 218, 228], aura: null };

  docState.hidden = true;
  field.triggerLiftoffBurst();
  waves.advance(0.04);
  assert.equal(field.needsDraw(1000, false), false, 'needsDraw must return false while document.hidden is true');
  const prevGlyphDraws = glyphDraws;
  field.draw(1000, pal, false);
  glow.draw(1000, true, 0.35, { reach: 0.25, prism: 0.3, surge: 0.5, speed: 1.1 });
  assert.equal(glyphDraws, prevGlyphDraws, 'createGlyphField.draw must skip rendering while document.hidden');
  assert.equal(glowDraws, 0, 'mountBrandHorizonGlow.draw must skip rendering while document.hidden');

  docState.hidden = false;
  assert.equal(field.needsDraw(1050, false), true);
  field.draw(1050, pal, false);
  glow.draw(1050, true, 0.35, { reach: 0.25, prism: 0.3, surge: 0.5, speed: 1.1 });
  assert.equal(glyphDraws, prevGlyphDraws + 1);
  assert.equal(glowDraws, 1);

  field.dispose();
  glow.dispose();
});

test('style.css enforces GPU compositor offloading, dual daylight presets (Crystal & Alabaster), and core specificity guards', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
  let cssBraces = 0;
  for (const ch of css) {
    if (ch === '{') cssBraces++;
    else if (ch === '}') cssBraces--;
    assert.ok(cssBraces >= 0, 'style.css must never close an unopened brace');
  }
  assert.equal(cssBraces, 0, 'style.css curly braces must be 100% balanced');

  // 1) 常驻底部输入舱与首页大面板彻底拔除 backdrop-filter，仅小面积临时浮层保留 blur(16px)
  const composerBlock = css.match(/& \.surface-composer-card\{[\s\S]*?\n\}/)?.[0] || '';
  assert.ok(composerBlock.includes('backdrop-filter:none !important'), '.surface-composer-card must force backdrop-filter:none !important');
  assert.equal(composerBlock.includes('blur('), false, '.surface-composer-card must not apply any blur()');

  const homePanelLine = css.split('\n').find((l) => l.startsWith('.ag-cs-home-panel{')) || '';
  assert.ok(homePanelLine.includes('backdrop-filter:none'), '.ag-cs-home-panel must disable backdrop-filter');
  assert.equal(homePanelLine.includes('blur('), false, '.ag-cs-home-panel must not apply blur()');

  assert.ok(css.includes('backdrop-filter:blur(16px)'), 'Transient popovers (.agy-overlay / overview-panel) should retain moderate blur(16px)');
  assert.equal(css.includes('blur(20px)'), false);
  assert.equal(css.includes('blur(24px)'), false);

  // 2) 流式吐字移除逐词 filter:blur(4px)，100% 纯 GPU 合成层属性 + 收敛侧栏无限滤镜位移
  const streamKeyframe = css.split('\n').find((l) => l.startsWith('@keyframes ag-cs-stream-chunk')) || '';
  assert.ok(streamKeyframe.includes('translate3d(0,2.5px,0)'), 'ag-cs-stream-chunk must use pure GPU translate3d(0, 2.5px, 0)');
  assert.equal(streamKeyframe.includes('filter'), false, 'ag-cs-stream-chunk must never animate filter/blur');
  assert.equal(css.includes('ag-cs-row-aurora'), false, 'Expensive background-position row-aurora loop must be removed');
  assert.equal(css.includes('ag-cs-pill-breath'), false, 'Expensive filter:brightness pill-breath loop must be removed');

  // 3) 关键特异性与防黑边防线（滚动视口禁用全屏离屏 mask-image 解锁 GPU 合成快速滚动）+ warm/claude 暖调同享 + .ag-prism-thought-raw-toggle 零闪烁保护
  assert.ok(css.includes('[data-testid="autoscroll-viewport"]{-webkit-mask-image:none !important;mask-image:none !important;}'));
  assert.ok(css.includes('&[data-ag-cs-style][data-ag-cs-style] [data-testid="thinking-collapsible-trigger"]+div{'));
  assert.ok(css.includes('&[data-ag-cs-style][data-ag-cs-style] [data-testid="thinking-collapsible-trigger"][aria-expanded="true"]+div{'));
  assert.ok(css.includes('[data-ag-cs-palette="warm"]'));
  assert.ok(css.includes('.ag-prism-thought-raw-toggle{') && css.includes('animation:none !important'));

  // 4) 双浅色白昼光学重塑（Daylight Crystal & Warm Alabaster）+ Hero C/D/E 非白扫白高饱和宝石四色
  for (const token of [
    '--sidebar:#E8EEF6 !important',
    '--background:#F4F7FB !important',
    '--ag-cs-bubble:#EAF1FB',
    'data-ag-cs-light-preset="alabaster"',
    '--sidebar:#EBE6DC !important',
    '--background:#F6F4EE !important',
    '--ag-cs-bubble:#EFECE2',
    '--ag-cs-run-core:#FFFFFF',
    '--ag-cs-run-star:#2563EB',
    '--ag-cs-thought-rule:rgba(37,99,235,.45)',
    '@keyframes ag-cs-sonar-pulse-light',
    'rgba(37,99,235,.065)',
  ]) {
    assert.ok(css.includes(token), `Expected style.css to include daylight optical token: ${token}`);
  }
  assert.equal(css.includes('rgba(255,255,255,.98)'), false, 'Light Hero C caustic must not sweep white-on-white rgba(255,255,255,.98)');

  // 5) Wave 2: 可折叠设置手风琴外壳 (.ag-cs-settings-fold-head / .ag-cs-settings-fold-body) 与「关于、Git 更新与致谢」卡片 (.ag-cs-about-box)
  for (const w2Token of [
    '.ag-cs-settings-fold-head',
    '.ag-cs-settings-fold-body',
    '.ag-cs-settings-fold-chevron',
    '.ag-cs-about-box',
    '.ag-cs-repo-chip',
    '.ag-cs-repo-sync-btn',
    '.ag-cs-about-disclaimer',
  ]) {
    assert.ok(css.includes(w2Token), `Expected Wave 2 settings/about CSS selector: ${w2Token}`);
  }
});

test('Wave 2: mountBrandHorizonGlow exhibits visible aurora drift and breathing amplitude across speed=0.65~1.8', () => {
  let lastImage = null;
  const canvas = {
    width: 0,
    height: 0,
    getContext(type) {
      if (type !== '2d') return null;
      return {
        createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
        putImageData(img) { lastImage = img; },
      };
    },
  };

  const W = 240;
  const H = 120;
  const glow = rippleCore.mountBrandHorizonGlow(canvas, { force2D: true });
  glow.resize(W, H, 1);

  // 1) Idle 慢呼吸流淌（speed = 0.72, frameMs = 50ms）：连续两帧像素差必须 > 0，且跨 2.4s 呈现明显明暗呼吸
  glow.draw(1000, true, 0.24, { reach: 0.5, prism: 0.12, surge: 0, speed: 0.72 });
  const idleFrame0 = Uint8ClampedArray.from(lastImage.data);
  glow.draw(1050, true, 0.24, { reach: 0.5, prism: 0.12, surge: 0, speed: 0.72 });
  const idleFrame1 = lastImage.data;
  let idleStepDelta = 0;
  for (let i = 0; i < idleFrame1.length; i++) {
    idleStepDelta += Math.abs(idleFrame1[i] - idleFrame0[i]);
  }
  assert.ok(idleStepDelta > 0, `Expected living aurora pixel drift between consecutive 50ms idle frames, got delta=${idleStepDelta}`);

  // 2) Running 极光流淌（speed = 1.45, prism = 0.70）：跨呼吸半周期采样总 alpha 振幅与横向色散游走显著可感
  let minRunAlpha = Infinity;
  let maxRunAlpha = 0;
  for (let ms = 2000; ms <= 6000; ms += 250) {
    glow.draw(ms, true, 0.34, { reach: 0.65, prism: 0.70, surge: 0, speed: 1.45 });
    let sumA = 0;
    for (let i = 3; i < lastImage.data.length; i += 4) sumA += lastImage.data[i];
    if (sumA < minRunAlpha) minRunAlpha = sumA;
    if (sumA > maxRunAlpha) maxRunAlpha = sumA;
  }
  assert.ok(
    maxRunAlpha > minRunAlpha * 1.32,
    `Expected clearly perceptible breathing amplitude (>1.32x) during running state, got min=${minRunAlpha}, max=${maxRunAlpha}`
  );

  glow.dispose();
});

test('Wave 1 Optics: HORIZON_FRAGMENT_SHADER & mountBrandHorizonGlow support Warm/Alabaster/Mono/Accent spectra, IGN TPDF dither, fwidth AA, HiDPI DPR, and ambientIntensity=0', () => {
  const frag = rippleCore.HORIZON_FRAGMENT_SHADER;
  for (const tok of [
    'uniform float uSpectrum;',
    'uniform float uSemantic;',
    'float ign(',
    'fwidth(dist)',
    'WARM_DARK_B',
    'DAY_TERRACOTTA',
    'MONO_DARK_HI',
  ]) {
    assert.ok(frag.includes(tok), `Expected HORIZON_FRAGMENT_SHADER to include ${tok}`);
  }

  assert.equal(rippleCore.resolveHorizonDpr(1, 0.72), 0.72);
  assert.ok(rippleCore.resolveHorizonDpr(2, 0.72) >= 1.2, 'HiDPI 2x screen should scale horizon DPR >= 1.2 for crisp halftone');

  let lastImage = null;
  let clearCalls = 0;
  const htmlEl = {
    attrs: new Map(),
    getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; },
  };
  const canvas = {
    width: 0,
    height: 0,
    ownerDocument: { hidden: false, documentElement: htmlEl },
    getContext(type) {
      if (type !== '2d') return null;
      return {
        clearRect() { clearCalls++; },
        createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
        putImageData(img) { lastImage = img; },
      };
    },
  };

  const W = 200;
  const H = 120;
  const glow = rippleCore.mountBrandHorizonGlow(canvas, { force2D: true });
  glow.resize(W, H, 1);

  const avgBottomRgb = () => {
    let r = 0, g = 0, b = 0, n = 0, maxChroma = 0;
    const y = H - 6;
    for (let x = 24; x <= W - 24; x += 8) {
      const i = (y * W + x) * 4;
      if (lastImage.data[i + 3] > 20) {
        const pr = lastImage.data[i], pg = lastImage.data[i + 1], pb = lastImage.data[i + 2];
        r += pr; g += pg; b += pb; n++;
        const ch = Math.max(pr, pg, pb) - Math.min(pr, pg, pb);
        if (ch > maxChroma) maxChroma = ch;
      }
    }
    return n > 0 ? { r: r / n, g: g / n, b: b / n, maxChroma } : { r: 0, g: 0, b: 0, maxChroma: 0 };
  };

  // 1) Auto-detect Warm Dark via html[data-ag-cs-palette="warm"] -> terracotta warm tone (R > B + 45)
  htmlEl.attrs.set('data-ag-cs-palette', 'warm');
  glow.drawStaticSnapshot(1000, true, 0.36, { reach: 0.45, prism: 0.4 });
  const warmDark = avgBottomRgb();
  assert.ok(warmDark.r > warmDark.b + 45, `Warm Dark horizon must render warm terracotta (R=${warmDark.r.toFixed(1)} > B=${warmDark.b.toFixed(1)} + 45)`);

  // 2) Auto-detect Warm Alabaster Light via html[data-ag-cs-light-preset="alabaster"] -> mineral terracotta ink
  htmlEl.attrs.set('data-ag-cs-palette', 'obsidian');
  htmlEl.attrs.set('data-ag-cs-light-preset', 'alabaster');
  glow.drawStaticSnapshot(1200, false, 0.36, { reach: 0.45, prism: 0.4 });
  const warmLight = avgBottomRgb();
  assert.ok(warmLight.r > warmLight.b + 55, `Warm Alabaster horizon must render warm terracotta ink (R=${warmLight.r.toFixed(1)} > B=${warmLight.b.toFixed(1)} + 55)`);

  // 3) Graphite Mono ('mono') -> restrained titanium silver-grey with zero rainbow saturation
  glow.drawStaticSnapshot(1400, true, 0.4, { reach: 0.45, prism: 0.8, spectrum: 'mono' });
  const monoDark = avgBottomRgb();
  assert.ok(monoDark.maxChroma <= 34, `Graphite Mono must suppress rainbow chroma (maxChroma=${monoDark.maxChroma} <= 34)`);

  // 4) Explicit Iris & Amber accents
  glow.drawStaticSnapshot(1500, true, 0.4, { reach: 0.45, prism: 0.5, spectrum: 'iris' });
  const irisDark = avgBottomRgb();
  assert.ok(irisDark.b > irisDark.g + 40, `Iris accent should favor violet-blue channel`);

  glow.drawStaticSnapshot(1600, true, 0.4, { reach: 0.45, prism: 0.5, spectrum: 'amber' });
  const amberDark = avgBottomRgb();
  assert.ok(amberDark.r > amberDark.b + 60, `Amber accent should favor warm gold channel`);

  // 5) ambientIntensity = 0 clears canvas and sleeps immediately at 0fps
  const prevClears = clearCalls;
  assert.equal(glow.draw(1700, true, 0.5, { ambientIntensity: 0 }), false);
  assert.equal(clearCalls, prevClears + 1);
  assert.equal(glow.isSleeping(), true);

  glow.dispose();
});

test('Wave 1 ConvAura: Split-Rate 300Hz VSync (~30fps running cap, 1200ms idle sleep) & 3-State 0fps Semantic Afterglow Engine', () => {
  require('../conv-aura.js');
  const convAuraMod = globalThis.__agPrismConvAura;
  assert.ok(convAuraMod);
  assert.equal(convAuraMod.CONV_AURA_IDLE_SLEEP_MS, 1200);
  assert.equal(convAuraMod.CONV_AURA_DECISION_BREATH_MS, 1600);
  assert.equal(convAuraMod.CONV_AURA_ERROR_MS, 900);
  assert.equal(convAuraMod.CONV_AURA_LONG_TASK_THRESHOLD_MS, 15000);
  assert.equal(convAuraMod.CONV_AURA_LONG_COMPLETE_MS, 1200);

  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  const prevPerf = globalThis.performance;
  const prevRaf = globalThis.requestAnimationFrame;
  const prevCaf = globalThis.cancelAnimationFrame;
  const prevSetTimeout = globalThis.setTimeout;
  const prevClearTimeout = globalThis.clearTimeout;

  let nowMs = 1000;
  let windowFocused = true;
  let nextId = 1;
  const rafQueue = new Map();
  const timerQueue = new Map();
  const winListeners = new Map();

  globalThis.performance = { now: () => nowMs };
  globalThis.requestAnimationFrame = (cb) => {
    const id = nextId++;
    rafQueue.set(id, cb);
    return id;
  };
  globalThis.cancelAnimationFrame = (id) => {
    rafQueue.delete(id);
  };
  globalThis.setTimeout = (cb, ms = 0) => {
    const id = nextId++;
    timerQueue.set(id, { cb, due: nowMs + Math.max(0, Number(ms) || 0) });
    return id;
  };
  globalThis.clearTimeout = (id) => {
    timerQueue.delete(id);
  };

  function advanceSimulated300Hz(totalMs) {
    const endMs = nowMs + totalMs;
    const stepMs = 1000 / 300; // 3.333ms 300Hz display VSync!
    while (nowMs < endMs) {
      nowMs = Math.min(endMs, nowMs + stepMs);
      for (const [tid, item] of [...timerQueue.entries()]) {
        if (item.due <= nowMs) {
          timerQueue.delete(tid);
          item.cb();
        }
      }
      const rafs = [...rafQueue.entries()];
      rafQueue.clear();
      for (const [, fn] of rafs) {
        fn(nowMs);
      }
    }
  }

  let gpuDraws = 0;
  let staticSnapshots = 0;
  let clearCount = 0;
  let lastSemanticSeen = 'none';

  const mockRippleCore = {
    resolveHorizonDpr: rippleCore.resolveHorizonDpr,
    mountBrandHorizonGlow() {
      return {
        mode: 'webgl2',
        resize() {},
        invalidate() {},
        clear() { clearCount++; },
        draw(_now, _dark, _str, extra) {
          gpuDraws++;
          lastSemanticSeen = extra?.semantic || 'none';
          return true;
        },
        drawStaticSnapshot(_now, _dark, _str, extra) {
          gpuDraws++;
          staticSnapshots++;
          lastSemanticSeen = extra?.semantic || 'none';
          return true;
        },
        dispose() {},
      };
    },
  };

  function makeDomEl(tag, testId = '') {
    const attrs = new Map();
    if (testId) attrs.set('data-testid', testId);
    const children = [];
    const el = {
      tagName: tag.toUpperCase(),
      className: '',
      hidden: false,
      isConnected: true,
      parentElement: null,
      clientWidth: 800,
      clientHeight: 600,
      style: {
        setProperty(k, v) { this[k] = v; },
      },
      get firstChild() { return children[0] || null; },
      setAttribute(k, v) { attrs.set(k, String(v)); },
      getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
      hasAttribute(k) { return attrs.has(k); },
      removeAttribute(k) { attrs.delete(k); },
      insertBefore(ch) {
        ch.parentElement = el;
        ch.isConnected = true;
        children.unshift(ch);
        return ch;
      },
      appendChild(ch) {
        ch.parentElement = el;
        ch.isConnected = true;
        children.push(ch);
        return ch;
      },
      remove() {
        el.isConnected = false;
        if (el.parentElement) {
          const arr = el.parentElement._children;
          if (arr) {
            const i = arr.indexOf(el);
            if (i >= 0) arr.splice(i, 1);
          }
        }
      },
      closest() { return null; },
      querySelectorAll() { return []; },
      _children: children,
    };
    return el;
  }

  const stageSeat = makeDomEl('div');
  const convView = makeDomEl('div', 'conversation-view');
  stageSeat.appendChild(convView);

  let runningDomActive = false;
  let decisionDomActive = false;
  const cancelNode = makeDomEl('button', 'input-cancel-button');
  const decisionCard = makeDomEl('div', 'interaction-takeover-card');

  globalThis.window = {
    devicePixelRatio: 2,
    addEventListener(evt, fn) { winListeners.set(evt, fn); },
    removeEventListener(evt) { winListeners.delete(evt); },
  };
  globalThis.document = {
    hidden: false,
    documentElement: makeDomEl('html'),
    hasFocus: () => windowFocused,
    createElement: (tag) => makeDomEl(tag),
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    querySelectorAll(sel) {
      if (sel.includes('conversation-view')) return [convView];
      if (sel.includes('input-cancel-button')) return runningDomActive ? [cancelNode] : [];
      if (sel.includes('interaction-takeover-card')) return decisionDomActive ? [decisionCard] : [];
      return [];
    },
  };

  try {
    const ctl = convAuraMod.createConvAuraController({
      isDestroyed: () => false,
      isHomeRippleEnabled: () => true,
      isMotionStandardOrUltra: () => true,
      isDarkTheme: () => true,
      getMinFrameGapMs: () => 0, // Native 300Hz uncapped!
      isWindowFocused: () => windowFocused,
      rippleCore: mockRippleCore,
      setAttrIfChanged(el, k, v) { if (el.getAttribute(k) !== v) el.setAttribute(k, v); },
      runGuardedMut(fn) { return fn(); },
    });

    // 1) Mounts in idle -> settles to true 0fps after 1200ms (and ignores redundant sync() calls while settled!)
    ctl.sync();
    const inst = ctl.getInstance();
    assert.ok(inst);
    assert.equal(inst.phase, 'idle');
    assert.equal(inst.sleeping, false);

    advanceSimulated300Hz(1300);
    assert.equal(inst.sleeping, true, 'Idle aura must enter 0fps sleep after 1200ms');
    assert.equal(inst.host.getAttribute('data-aura-sleep'), '1');
    assert.equal(rafQueue.size, 0);
    assert.equal(timerQueue.size, 0);

    const drawsAtIdleSleep = gpuDraws;
    for (let i = 0; i < 8; i++) {
      nowMs += 50;
      ctl.sync();
    }
    assert.equal(gpuDraws, drawsAtIdleSleep, 'Redundant sync() must NOT wake settled 0fps idle aura');

    // 2) Split-Rate 300Hz running throttle: during 1000ms steady running on a 300Hz monitor, draws <= 36 frames (~30fps instead of 300fps!)
    runningDomActive = true;
    ctl.sync();
    assert.equal(inst.phase, 'start');
    advanceSimulated300Hz(1200); // finish 1150ms start surge -> enters steady 'running'
    assert.equal(inst.phase, 'running');

    const drawsBefore1sRun = gpuDraws;
    advanceSimulated300Hz(1000); // 300 VSync ticks on 300Hz screen!
    const runDrawsIn1s = gpuDraws - drawsBefore1sRun;
    assert.ok(
      runDrawsIn1s >= 24 && runDrawsIn1s <= 36,
      `Split-Rate VSync must cap steady running aura around ~30fps (24..36 draws/s on 300Hz), got ${runDrawsIn1s}`
    );

    // 3) Long-task-complete (>= 15s running) while window is unfocused -> 1.2s jade chime then freezes at 0fps snapshot until user pointer returns!
    advanceSimulated300Hz(14500); // total running duration > 15,000ms
    windowFocused = false;
    runningDomActive = false;
    ctl.sync();
    assert.equal(inst.phase, 'long-task-complete');
    assert.equal(lastSemanticSeen, 'long-task-complete');

    const snapsBeforeLong = staticSnapshots;
    advanceSimulated300Hz(1300); // finish 1200ms jade chime
    assert.equal(inst.sleeping, true, 'Unfocused long-task-complete must freeze at 0fps static afterglow');
    assert.equal(inst.unfocusedHold, true);
    assert.equal(staticSnapshots, snapsBeforeLong + 1);
    const drawsDuringUnfocusedHold = gpuDraws;
    advanceSimulated300Hz(3000);
    assert.equal(gpuDraws, drawsDuringUnfocusedHold, '0 extra frames while holding unfocused completion afterglow');

    // User moves pointer back into window -> fades out over 600ms and sleeps at 0fps
    windowFocused = true;
    const returnFn = winListeners.get('pointermove') || winListeners.get('focus');
    assert.ok(returnFn, 'Expected one-shot focus/pointermove wake listener');
    returnFn();
    advanceSimulated300Hz(700);
    assert.equal(inst.phase, 'idle');
    assert.equal(inst.sleeping, true);

    // 4) awaiting-decision (ask_question takeover card) -> 1.6s warm amber breath then freezes at 0fps static snapshot!
    decisionDomActive = true;
    nowMs += 250;
    ctl.sync();
    assert.equal(inst.phase, 'awaiting-decision');
    assert.equal(lastSemanticSeen, 'awaiting-decision');
    assert.equal(inst.sleeping, false);

    const snapsBeforeDec = staticSnapshots;
    advanceSimulated300Hz(1700);
    assert.equal(inst.sleeping, true, 'awaiting-decision must freeze at 0fps static amber snapshot after 1.6s');
    assert.equal(inst.decisionHolding, true);
    assert.equal(staticSnapshots, snapsBeforeDec + 1);

    const drawsWhileWaitingUser = gpuDraws;
    advanceSimulated300Hz(4000);
    ctl.sync();
    assert.equal(gpuDraws, drawsWhileWaitingUser, 'Must draw 0 extra frames while user deliberates on ask_question');

    // User answers ask_question -> clears cleanly back to 0fps
    decisionDomActive = false;
    nowMs += 250;
    ctl.sync();
    advanceSimulated300Hz(1700);
    assert.equal(inst.phase, 'idle');
    assert.equal(inst.sleeping, true);

    // 5) error-halted -> 900ms muted coral inward convergence then clears to 0fps!
    const clearsBeforeErr = clearCount;
    ctl.triggerErrorHalted(nowMs);
    assert.equal(inst.phase, 'error-halted');
    assert.equal(lastSemanticSeen, 'error-halted');
    advanceSimulated300Hz(960);
    assert.equal(inst.phase, 'idle');
    assert.equal(inst.sleeping, true);
    assert.ok(clearCount > clearsBeforeErr, 'error-halted must clear canvas to zero before 0fps sleep');

    // 6) setAmbientIntensity(0) immediately clears and sleeps at 0fps
    ctl.setAmbientIntensity(0);
    assert.equal(inst.sleeping, true);
    assert.equal(inst.sleepReason, 'ambient-zero');

    ctl.unmount();
  } finally {
    globalThis.document = prevDoc;
    globalThis.window = prevWin;
    globalThis.performance = prevPerf;
    globalThis.requestAnimationFrame = prevRaf;
    globalThis.cancelAnimationFrame = prevCaf;
    globalThis.setTimeout = prevSetTimeout;
    globalThis.clearTimeout = prevClearTimeout;
  }
});

test('Wave 3: createGlyphField & home-ripple-host honor accentTone (mono/iris/amber/cobalt/warm) and ambientIntensity=0 0fps sleep', () => {
  const homeRippleMod = require('../home-ripple-host.js');

  function make2DCanvas(width, height) {
    let lastImage = null;
    const ctx2d = {
      setTransform() {},
      clearRect() {},
      fillText() {},
      getImageData(_x, _y, w, h) {
        const buf = new Uint8ClampedArray(w * h * 4);
        for (let i = 3; i < buf.length; i += 4) buf[i] = 255;
        return { width: w, height: h, data: buf };
      },
      createImageData(w, h) {
        return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
      },
      putImageData(img) {
        lastImage = img;
      },
    };
    const attrs = new Map();
    return {
      width,
      height,
      className: '',
      isConnected: true,
      style: {},
      setAttribute: (k, v) => attrs.set(k, String(v)),
      getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
      hasAttribute: (k) => attrs.has(k),
      removeAttribute: (k) => attrs.delete(k),
      remove() { this.isConnected = false; },
      get lastImage() { return lastImage; },
      getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
      ownerDocument: {
        hidden: false,
        createElement: () => make2DCanvas(1, 1),
      },
      getContext: (type) => (type === '2d' ? ctx2d : null),
    };
  }

  const cols = 40;
  const rows = 20;
  const { cellWidth, cellHeight } = rippleCore.RIPPLE;
  const waves = rippleCore.createWaveField(cols, rows, () => 0.5);
  const cv = make2DCanvas(cols * cellWidth, rows * cellHeight);
  const field = rippleCore.createGlyphField(cv, cols, rows, waves);

  // 1) mono spectrum renders neutral silver-slate aura without high-chroma rainbow split
  const cx = (cols * cellWidth) / 2;
  const cy = (rows * cellHeight) / 2;
  field.draw(1000, {
    dark: true,
    ink: [146, 148, 156],
    wave: [214, 218, 228],
    spectrum: 'mono',
    ambientIntensity: 1,
    aura: { x: cx, y: cy, radius: 120, strength: 1, active: true },
  }, false);

  const imgMono = cv.lastImage;
  let maxMonoChroma = 0;
  for (let i = 0; i < imgMono.data.length; i += 4) {
    if (imgMono.data[i + 3] < 40) continue;
    const r = imgMono.data[i];
    const g = imgMono.data[i + 1];
    const b = imgMono.data[i + 2];
    const span = Math.max(r, g, b) - Math.min(r, g, b);
    if (span > maxMonoChroma) maxMonoChroma = span;
  }
  assert.ok(maxMonoChroma <= 42, `mono glyph field must stay neutral silver-slate (chroma <= 42), got ${maxMonoChroma}`);

  // 2) ambientIntensity: 0 disables nebula wakeup within the same glyph tick
  field.draw(2000, {
    dark: true,
    ink: [146, 148, 156],
    wave: [214, 218, 228],
    spectrum: 'default',
    ambientIntensity: 0,
    aura: { x: cx, y: cy, radius: 120, strength: 1, active: true },
  }, false);
  assert.equal(field.needsDraw(2060, false), false, 'ambientIntensity=0 must suppress 40ms nebula redraws when idle');
  field.dispose();

  // 3) home-ripple-host skips hidden glow.draw() and enters 0fps sleep when ambientIntensity=0
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  const prevPerf = globalThis.performance;
  const prevRaf = globalThis.requestAnimationFrame;
  const prevCaf = globalThis.cancelAnimationFrame;

  let nowMs = 1000;
  let rafSeq = 1;
  const rafMap = new Map();
  let glowDraws = 0;
  let glowClears = 0;
  let lastGlowOpts = null;
  const htmlAttrs = new Map([['data-ag-cs-ambient', '0'], ['data-ag-cs-accent', 'mono']]);

  const homeNode = {
    clientWidth: 320,
    clientHeight: 180,
    children: [],
    get firstChild() { return this.children[0] || null; },
    insertBefore(n) { this.children.unshift(n); n.isConnected = true; return n; },
    querySelector: () => null,
    addEventListener() {},
    removeEventListener() {},
  };

  globalThis.performance = { now: () => nowMs };
  globalThis.window = { devicePixelRatio: 1 };
  globalThis.requestAnimationFrame = (fn) => { const id = rafSeq++; rafMap.set(id, fn); return id; };
  globalThis.cancelAnimationFrame = (id) => { rafMap.delete(id); };
  globalThis.document = {
    hidden: false,
    documentElement: {
      getAttribute: (k) => (htmlAttrs.has(k) ? htmlAttrs.get(k) : null),
    },
    querySelector: (sel) => (sel === '.agy-home' ? homeNode : null),
    addEventListener() {},
    removeEventListener() {},
    createElement(tag) {
      if (tag === 'canvas') return make2DCanvas(320, 180);
      const attrs = new Map();
      const kids = [];
      return {
        tagName: tag.toUpperCase(),
        className: '',
        isConnected: true,
        setAttribute: (k, v) => attrs.set(k, String(v)),
        getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
        hasAttribute: (k) => attrs.has(k),
        removeAttribute: (k) => attrs.delete(k),
        appendChild: (c) => { kids.push(c); c.isConnected = true; return c; },
        remove: () => {},
      };
    },
  };

  const wrappedRippleCore = {
    ...rippleCore,
    mountBrandHorizonGlow: () => ({
      mode: 'webgl2',
      resize() {},
      invalidate() {},
      clear() { glowClears++; },
      draw(_now, opts) { glowDraws++; lastGlowOpts = opts; },
      dispose() {},
    }),
  };

  try {
    const ctl = homeRippleMod.createHomeRippleController({
      rippleCore: wrappedRippleCore,
      isDestroyed: () => false,
      isAllowed: () => true,
      isDarkTheme: () => true,
      motionReduced: () => false,
      getMinFrameGapMs: () => 0,
      setAttrIfChanged: (el, k, v) => el.setAttribute(k, v),
    });
    ctl.sync();
    // Drain rAF -> at ambient=0, intro loop must NOT keep waking, glow.draw must be 0, glow.clear must be 1!
    for (let step = 0; step < 5 && rafMap.size > 0; step++) {
      nowMs += 16;
      const [[id, fn]] = rafMap.entries();
      rafMap.delete(id);
      fn(nowMs);
    }
    assert.equal(glowDraws, 0, 'ambient=0 must skip hidden BrandHorizonGlow draw()');
    assert.equal(glowClears, 1, 'ambient=0 must clear BrandHorizonGlow once');
    assert.equal(rafMap.size, 0, 'ambient=0 home ripple must settle to 0fps immediately without intro spin');
    assert.equal(ctl.getMount().sleeping, true);

    // Switch ambient -> 0.7 and accent -> iris -> refreshTheme wakes and passes spectrum/ambient to glow
    htmlAttrs.set('data-ag-cs-ambient', '0.7');
    htmlAttrs.set('data-ag-cs-accent', 'iris');
    ctl.refreshTheme();
    assert.ok(rafMap.size > 0);
    nowMs += 16;
    {
      const [[id, fn]] = rafMap.entries();
      rafMap.delete(id);
      fn(nowMs);
    }
    assert.equal(glowDraws, 1);
    assert.equal(lastGlowOpts.ambientIntensity, 0.7);
    assert.equal(lastGlowOpts.spectrum, 'iris');

    ctl.unmount();
  } finally {
    globalThis.document = prevDoc;
    globalThis.window = prevWin;
    globalThis.performance = prevPerf;
    globalThis.requestAnimationFrame = prevRaf;
    globalThis.cancelAnimationFrame = prevCaf;
  }
});

test('Conv-aura wave smoothness & 450ms semantic blend: non-negative running surge, continuous flowSec across sleep/wake, clamped dtSec, and fractional uSemantic crossfade', () => {
  require(path.join(__dirname, '..', 'conv-aura.js'));
  const convAuraMod = globalThis.__agPrismConvAura;

  // 1) Running surge must stay >= 0 across full cycle (no sign-flipping between vertical surgeArc and horizontal chimeWave)
  for (let ms = 0; ms <= 5000; ms += 100) {
    const opt = convAuraMod.computeConvAuraOptics('running', 0, ms, false, true);
    assert.ok(opt.surge >= 0, `running surge must remain >= 0 at ms=${ms}, got ${opt.surge}`);
  }
  // focus-fade delegates color decay to ripple-core's ~450ms semMix instead of hard-snapping at p=0.7
  for (const frac of [0.1, 0.5, 0.9]) {
    const ff = convAuraMod.computeConvAuraOptics('focus-fade', 1000, 1000 + frac * 600, false, false);
    assert.equal(ff.semantic, 'none');
  }

  // 2) WebGL2 mountBrandHorizonGlow phase continuity + dtSec clamp + fractional uSemantic crossfade
  const prevForce = globalThis.__agRippleForce2D;
  delete globalThis.__agRippleForce2D;
  try {
    const uniformValues = new Map();
    let loseContextCalls = 0;
    const gl = {
      VERTEX_SHADER: 35633,
      FRAGMENT_SHADER: 35632,
      COMPILE_STATUS: 35713,
      LINK_STATUS: 35714,
      TRIANGLES: 4,
      COLOR_BUFFER_BIT: 16384,
      createShader: () => ({}),
      shaderSource() {},
      compileShader() {},
      getShaderParameter: () => true,
      createProgram: () => ({}),
      attachShader() {},
      linkProgram() {},
      getProgramParameter: () => true,
      deleteShader() {},
      deleteProgram() {},
      createVertexArray: () => ({}),
      deleteVertexArray() {},
      bindVertexArray() {},
      getUniformLocation: (_p, name) => ({ name }),
      useProgram() {},
      viewport() {},
      clearColor() {},
      clear() {},
      uniform2f() {},
      uniform1f(loc, v) { if (loc?.name) uniformValues.set(loc.name, v); },
      drawArrays() {},
      getExtension: (n) => (n === 'WEBGL_lose_context' ? { loseContext() { loseContextCalls += 1; } } : null),
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: (t) => (t === 'webgl2' ? gl : null),
      addEventListener() {},
      removeEventListener() {},
    };
    const glow = rippleCore.mountBrandHorizonGlow(canvas);
    assert.equal(glow.mode, 'webgl2');
    glow.resize(320, 120, 1);

    // Advance running phase so uTime > 12.5
    glow.draw(1000, true, 0.4, { reach: 0.22, prism: 0.7, surge: 0.03, speed: 1.45, semantic: 'none' });
    glow.draw(1200, true, 0.4, { reach: 0.22, prism: 0.7, surge: 0.03, speed: 1.45, semantic: 'none' });
    glow.draw(1400, true, 0.4, { reach: 0.22, prism: 0.7, surge: 0.03, speed: 1.45, semantic: 'none' });
    const tBeforeSleep = uniformValues.get('uTime');
    assert.ok(tBeforeSleep > 12.5, `Expected uTime > 12.5 before sleep, got ${tBeforeSleep}`);

    // Enter still sleep -> flowSec MUST NOT reset backward to 0 (uTime stays continuous!)
    glow.draw(1600, true, 0.25, { reach: 0.16, prism: 0.2, surge: 0, speed: 0.72, still: true, semantic: 'none' });
    const tDuringSleep = uniformValues.get('uTime');
    assert.ok(Math.abs(tDuringSleep - tBeforeSleep) < 1e-6, `still sleep must preserve flowSec, got ${tDuringSleep} vs ${tBeforeSleep}`);

    // Wake after 10 seconds -> dtSec must be clamped <= 0.35s (no multi-second wave teleport)
    glow.draw(11600, true, 0.4, { reach: 0.22, prism: 0.7, surge: 0.03, speed: 1.0, semantic: 'long-task-complete' });
    const tAfterWake = uniformValues.get('uTime');
    assert.ok(tAfterWake > tDuringSleep && tAfterWake - tDuringSleep <= 0.36, `Wake dtSec must clamp <= 0.35s, got delta=${tAfterWake - tDuringSleep}`);

    // First active frame entering long-task-complete must blend smoothly (3 < uSemantic < 3.98), not 1-frame snap to 3.0
    const semEnter = uniformValues.get('uSemantic');
    assert.ok(semEnter > 3.01 && semEnter < 3.98, `Expected smooth fractional uSemantic crossfade on enter, got ${semEnter}`);

    // Advance several frames -> converges toward 3.0 (full jade), then switch back to 'none' -> blends smoothly back down
    let t = 11600;
    for (let i = 0; i < 60; i++) {
      t += 32;
      glow.draw(t, true, 0.4, { reach: 0.22, prism: 0.7, surge: 0, speed: 1.0, semantic: 'long-task-complete' });
    }
    assert.ok(Math.abs(uniformValues.get('uSemantic') - 3) < 0.05, `Expected uSemantic convergence near 3, got ${uniformValues.get('uSemantic')}`);

    glow.draw(t + 32, true, 0.3, { reach: 0.18, prism: 0.4, surge: 0, speed: 0.8, semantic: 'none' });
    const semExit = uniformValues.get('uSemantic');
    assert.ok(semExit > 3.01 && semExit < 3.98, `Expected smooth fractional uSemantic crossfade on exit, got ${semExit}`);

    glow.dispose();
    assert.equal(loseContextCalls, 1, 'createHorizonGlowWebGL.dispose() must invoke WEBGL_lose_context.loseContext()');

    // 3) Verify createWebGLRenderer.dispose() also invokes WEBGL_lose_context.loseContext()
    let glyphLoseCalls = 0;
    const glGlyph = {
      ...gl,
      TEXTURE_2D: 3553,
      TEXTURE0: 33984,
      TEXTURE1: 33985,
      RGBA: 6408,
      RGBA8: 32856,
      UNSIGNED_BYTE: 5121,
      LINEAR: 9729,
      NEAREST: 9728,
      CLAMP_TO_EDGE: 33071,
      TEXTURE_MIN_FILTER: 10241,
      TEXTURE_MAG_FILTER: 10240,
      TEXTURE_WRAP_S: 10242,
      TEXTURE_WRAP_T: 10243,
      BLEND: 3042,
      SRC_ALPHA: 770,
      ONE_MINUS_SRC_ALPHA: 771,
      createTexture: () => ({}),
      deleteTexture() {},
      activeTexture() {},
      bindTexture() {},
      texParameteri() {},
      texStorage2D() {},
      texImage2D() {},
      texSubImage2D() {},
      enable() {},
      blendFunc() {},
      uniform1i() {},
      uniform3f() {},
      uniform4f() {},
      getExtension: (n) => (n === 'WEBGL_lose_context' ? { loseContext() { glyphLoseCalls += 1; } } : null),
    };
    const glyphCanvas = {
      width: 0,
      height: 0,
      ownerDocument: {
        createElement: () => ({
          width: 0,
          height: 0,
          getContext: () => ({
            setTransform() {},
            clearRect() {},
            fillText() {},
            font: '',
            fillStyle: '',
            textAlign: '',
            textBaseline: '',
          }),
        }),
      },
      getContext: (t) => (t === 'webgl2' ? glGlyph : null),
      addEventListener() {},
      removeEventListener() {},
    };
    const gField = rippleCore.createGlyphField(glyphCanvas, 16, 8);
    assert.equal(gField.mode, 'webgl2');
    gField.dispose();
    assert.equal(glyphLoseCalls, 1, 'createWebGLRenderer.dispose() must invoke WEBGL_lose_context.loseContext()');
  } finally {
    if (prevForce !== undefined) globalThis.__agRippleForce2D = prevForce;
  }
});

test('resize regression: dispose(true) preserves WebGL2 context across resizes, lost context never throws shader compile error, and home-ripple-host survives resize & external context loss', () => {
  const prevForce = globalThis.__agRippleForce2D;
  globalThis.__agRippleForce2D = false;
  try {
    let contextLost = false;
    let loseCalls = 0;
    let deleteProgramCalls = 0;
    let deleteTextureCalls = 0;
    const makeGl = () => ({
      VERTEX_SHADER: 35633,
      FRAGMENT_SHADER: 35632,
      COMPILE_STATUS: 35713,
      LINK_STATUS: 35714,
      COLOR_BUFFER_BIT: 16384,
      TRIANGLES: 4,
      TEXTURE_2D: 3553,
      TEXTURE0: 33984,
      TEXTURE1: 33985,
      RGBA: 6408,
      RGBA8: 32856,
      UNSIGNED_BYTE: 5121,
      LINEAR: 9729,
      NEAREST: 9728,
      CLAMP_TO_EDGE: 33071,
      TEXTURE_MIN_FILTER: 10241,
      TEXTURE_MAG_FILTER: 10240,
      TEXTURE_WRAP_S: 10242,
      TEXTURE_WRAP_T: 10243,
      isContextLost: () => contextLost,
      createShader: () => (contextLost ? null : {}),
      shaderSource() {},
      compileShader() {},
      getShaderParameter: () => !contextLost,
      getShaderInfoLog: () => '',
      deleteShader() {},
      createProgram: () => (contextLost ? null : {}),
      attachShader() {},
      linkProgram() {},
      getProgramParameter: () => !contextLost,
      getProgramInfoLog: () => '',
      useProgram() {},
      deleteProgram() { deleteProgramCalls += 1; },
      getUniformLocation: () => ({}),
      createTexture: () => ({}),
      deleteTexture() { deleteTextureCalls += 1; },
      activeTexture() {},
      bindTexture() {},
      texParameteri() {},
      texStorage2D() {},
      texImage2D() {},
      texSubImage2D() {},
      viewport() {},
      uniform1i() {},
      uniform1f() {},
      uniform2f() {},
      uniform3f() {},
      uniform4f() {},
      clearColor() {},
      clear() {},
      drawArrays() {},
      getExtension: (n) => (n === 'WEBGL_lose_context' ? { loseContext() { loseCalls += 1; contextLost = true; } } : null),
    });

    const gl = makeGl();
    const atlasCtx = {
      setTransform() {},
      clearRect() {},
      fillText() {},
      font: '',
      fillStyle: '',
      textAlign: '',
      textBaseline: '',
    };
    const canvas = {
      width: 200,
      height: 100,
      ownerDocument: {
        createElement: () => ({ width: 0, height: 0, getContext: () => atlasCtx }),
      },
      getContext: (t) => (t === 'webgl2' ? gl : null),
      addEventListener() {},
      removeEventListener() {},
    };

    // 1) Repeated resize with dispose(true) deletes GL objects but keeps context alive
    const f1 = rippleCore.createGlyphField(canvas, 16, 8);
    assert.equal(f1.mode, 'webgl2');
    f1.dispose(true);
    assert.equal(loseCalls, 0, 'dispose(true) must NOT invoke WEBGL_lose_context.loseContext()');
    assert.equal(contextLost, false);
    assert.equal(deleteProgramCalls, 1);
    assert.equal(deleteTextureCalls, 2);

    const f2 = rippleCore.createGlyphField(canvas, 24, 12);
    assert.equal(f2.mode, 'webgl2', 'recreating glyph field on resized canvas must stay in webgl2 mode');

    // 2) Final unmount dispose() (default keepContext=false) still loses context once
    f2.dispose();
    assert.equal(loseCalls, 1);
    assert.equal(contextLost, true);

    // 3) Attempting to create on a permanently lost WebGL2 canvas must never throw shader compile error
    const fLost = rippleCore.createGlyphField(canvas, 24, 12);
    assert.equal(fLost.mode, 'none', 'lost WebGL2 canvas without 2D context must degrade to mode: none without throwing');

    const glowLost = rippleCore.mountBrandHorizonGlow(canvas);
    assert.equal(glowLost.mode, 'none', 'mountBrandHorizonGlow on lost WebGL2 canvas must degrade safely');

    // 4) Shader compile failure inside createWebGL2Renderer must not throw uncaught error
    contextLost = false;
    const brokenGl = { ...makeGl(), getShaderParameter: () => false, getShaderInfoLog: () => 'simulated failure' };
    const brokenCanvas = { ...canvas, getContext: (t) => (t === 'webgl2' ? brokenGl : null) };
    const fBroken = rippleCore.createGlyphField(brokenCanvas, 16, 8);
    assert.equal(fBroken.mode, 'none', 'shader compile failure must fall back cleanly instead of throwing');

    // 5) home-ripple-host layout() calls dispose(true) across resizes and swaps canvas if context is externally lost
    const homeRippleHost = require(path.resolve(__dirname, '..', 'home-ripple-host.js'));
    const prevDoc = globalThis.document;
    const prevWin = globalThis.window;
    const prevRaf = globalThis.requestAnimationFrame;
    const prevCaf = globalThis.cancelAnimationFrame;
    const prevRO = globalThis.ResizeObserver;
    const prevPerf = globalThis.performance;
    try {
      let roCallback = null;
      let nextCanvasId = 0;
      const makeNode = (tag) => {
        const attrs = new Map();
        const children = [];
        let nodeLost = false;
        let nodeGl = null;
        const node = {
          tagName: tag.toUpperCase(),
          className: '',
          style: {},
          width: 0,
          height: 0,
          clientWidth: 960,
          clientHeight: 600,
          children,
          parentNode: null,
          _canvasId: tag === 'canvas' ? ++nextCanvasId : 0,
          _setLost(v) { nodeLost = v; },
          get isConnected() { return Boolean(this.parentNode); },
          get firstChild() { return children[0] || null; },
          setAttribute(k, v) { attrs.set(k, String(v)); },
          getAttribute(k) { return attrs.get(k) ?? null; },
          hasAttribute(k) { return attrs.has(k); },
          removeAttribute(k) { attrs.delete(k); },
          appendChild(ch) { ch.parentNode = this; children.push(ch); return ch; },
          insertBefore(ch, ref) {
            ch.parentNode = this;
            const i = ref ? children.indexOf(ref) : -1;
            if (i >= 0) children.splice(i, 0, ch);
            else children.push(ch);
            return ch;
          },
          replaceChild(next, old) {
            const i = children.indexOf(old);
            if (i >= 0) {
              old.parentNode = null;
              next.parentNode = this;
              children[i] = next;
            }
            return old;
          },
          replaceWith(next) {
            if (this.parentNode) this.parentNode.replaceChild(next, this);
          },
          remove() {
            if (this.parentNode) {
              const i = this.parentNode.children.indexOf(this);
              if (i >= 0) this.parentNode.children.splice(i, 1);
              this.parentNode = null;
            }
          },
          querySelector: () => null,
          getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 600 }),
          addEventListener() {},
          removeEventListener() {},
          ownerDocument: null,
          getContext(type) {
            if (type === '2d') return atlasCtx;
            if (type === 'webgl2') {
              if (!nodeGl) {
                const base = makeGl();
                nodeGl = {
                  ...base,
                  isContextLost: () => nodeLost,
                  createShader: () => (nodeLost ? null : {}),
                  getShaderParameter: () => !nodeLost,
                  createProgram: () => (nodeLost ? null : {}),
                  getProgramParameter: () => !nodeLost,
                  getExtension: (n) => (n === 'WEBGL_lose_context' ? { loseContext() { nodeLost = true; } } : null),
                };
              }
              return nodeGl;
            }
            return null;
          },
        };
        return node;
      };
      const fakeDoc = {
        hidden: false,
        documentElement: makeNode('html'),
        createElement(tag) {
          const el = makeNode(tag);
          el.ownerDocument = fakeDoc;
          return el;
        },
        querySelector(sel) { return sel === '.agy-home' ? homeEl : null; },
        addEventListener() {},
        removeEventListener() {},
      };
      const homeEl = fakeDoc.createElement('div');
      homeEl.parentNode = fakeDoc.documentElement;
      const rafQueue = [];
      let rafSeq = 0;
      const flushRaf = (ts = 16) => {
        const batch = rafQueue.splice(0, rafQueue.length);
        for (const item of batch) {
          if (!item.cancelled) item.fn(ts);
        }
      };
      globalThis.document = fakeDoc;
      globalThis.window = { devicePixelRatio: 1, addEventListener() {}, removeEventListener() {} };
      globalThis.requestAnimationFrame = (fn) => {
        const id = ++rafSeq;
        rafQueue.push({ id, fn, cancelled: false });
        return id;
      };
      globalThis.cancelAnimationFrame = (id) => {
        const item = rafQueue.find((x) => x.id === id);
        if (item) item.cancelled = true;
      };
      globalThis.ResizeObserver = class { constructor(cb) { roCallback = cb; } observe() {} disconnect() {} };
      globalThis.performance = { now: () => 100 };

      let ctl = null;
      try {
        ctl = homeRippleHost.createHomeRippleController({
          rippleCore,
          isDestroyed: () => false,
          isAllowed: () => true,
          isDarkTheme: () => true,
          motionReduced: () => false,
          getMinFrameGapMs: () => 0,
          getAmbientIntensity: () => 1,
          getAccentTone: () => 'follow',
          setAttrIfChanged(el, k, v) { el.setAttribute(k, v); },
        });
        ctl.sync();
        flushRaf(100);
        const mount = ctl.getMount();
        assert.equal(mount.field.mode, 'webgl2');
        const initialCanvas = mount.canvas;

        // Trigger resize -> must keep same live WebGL2 canvas and stay in webgl2 mode
        homeEl.clientWidth = 1280;
        homeEl.clientHeight = 720;
        roCallback();
        flushRaf(120);
        assert.equal(mount.field.mode, 'webgl2', 'home-ripple-host resize must preserve WebGL2 rendering');
        assert.equal(mount.canvas, initialCanvas, 'healthy canvas should be reused on resize');
        assert.equal(mount.canvas.getContext('webgl2').isContextLost(), false);

        // Simulate external GPU context loss then resize -> must swap in fresh canvas and recover WebGL2
        mount.canvas._setLost(true);
        homeEl.clientWidth = 1440;
        homeEl.clientHeight = 800;
        roCallback();
        flushRaf(140);
        assert.notEqual(mount.canvas, initialCanvas, 'externally lost canvas must be replaced with a fresh <canvas>');
        assert.equal(mount.field.mode, 'webgl2', 'swapped fresh canvas must recover WebGL2 mode');
      } finally {
        ctl?.unmount?.();
      }
    } finally {
      if (prevDoc === undefined) delete globalThis.document; else globalThis.document = prevDoc;
      if (prevWin === undefined) delete globalThis.window; else globalThis.window = prevWin;
      if (prevRaf === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = prevRaf;
      if (prevCaf === undefined) delete globalThis.cancelAnimationFrame; else globalThis.cancelAnimationFrame = prevCaf;
      if (prevRO === undefined) delete globalThis.ResizeObserver; else globalThis.ResizeObserver = prevRO;
      if (prevPerf === undefined) delete globalThis.performance; else globalThis.performance = prevPerf;
    }
  } finally {
    if (prevForce !== undefined) globalThis.__agRippleForce2D = prevForce;
  }
});

test('Issue #64 WebGL2 white-screen hardening: Chromium canvas-lock true-2D fallback, glowCanvas dispose(true) & self-heal, async webglcontextlost recovery & hide-on-total-failure', () => {
  const homeRippleHost = require(path.resolve(__dirname, '..', 'home-ripple-host.js'));
  const prevForce = globalThis.__agRippleForce2D;
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  const prevRaf = globalThis.requestAnimationFrame;
  const prevCaf = globalThis.cancelAnimationFrame;
  const prevST = globalThis.setTimeout;
  const prevCT = globalThis.clearTimeout;
  const prevRO = globalThis.ResizeObserver;
  const prevPerf = globalThis.performance;

  globalThis.__agRippleForce2D = false;

  const make2DCtx = () => ({
    setTransform() {},
    clearRect() {},
    fillText() {},
    getImageData(_x, _y, w, h) {
      const buf = new Uint8ClampedArray(w * h * 4);
      for (let i = 3; i < buf.length; i += 4) buf[i] = 255;
      return { width: w, height: h, data: buf };
    },
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData() {},
  });

  // 1) Direct ripple-core checks: mountBrandHorizonGlow.dispose(true) preserves context, isContextLost(), onContextRestored try/catch
  {
    let lost = false;
    let loseCalls = 0;
    let buildFail = false;
    let lostNotified = 0;
    const ls = new Map();
    const gl = {
      VERTEX_SHADER: 35633, FRAGMENT_SHADER: 35632, COMPILE_STATUS: 35713, LINK_STATUS: 35714,
      COLOR_BUFFER_BIT: 16384, TRIANGLES: 4,
      isContextLost: () => lost,
      createShader: () => (buildFail ? null : {}),
      shaderSource() {}, compileShader() {},
      getShaderParameter: () => !buildFail,
      getShaderInfoLog: () => (buildFail ? 'restored-fail' : ''),
      deleteShader() {},
      createProgram: () => ({}), attachShader() {}, linkProgram() {},
      getProgramParameter: () => !buildFail, getProgramInfoLog: () => '',
      useProgram() {}, deleteProgram() {}, getUniformLocation: () => ({}),
      viewport() {}, uniform1f() {}, uniform2f() {}, clearColor() {}, clear() {}, drawArrays() {},
      getExtension: (n) => (n === 'WEBGL_lose_context' ? { loseContext() { loseCalls += 1; lost = true; } } : null),
    };
    const cv = {
      width: 320, height: 180,
      ownerDocument: { hidden: false },
      getContext: (t) => (t === 'webgl2' ? gl : null),
      addEventListener: (t, fn) => ls.set(t, fn),
      removeEventListener: (t) => ls.delete(t),
    };
    const g = rippleCore.mountBrandHorizonGlow(cv, { onContextLost: () => { lostNotified += 1; } });
    assert.equal(g.mode, 'webgl2');
    assert.equal(g.isContextLost(), false);
    lost = true;
    assert.equal(g.isContextLost(), true);
    ls.get('webglcontextlost')({ preventDefault() {} });
    assert.equal(lostNotified, 1, 'onContextLost callback must fire');
    buildFail = true;
    assert.doesNotThrow(() => ls.get('webglcontextrestored')(), 'onContextRestored must catch build() errors cleanly');
    lost = false;
    g.dispose(true);
    assert.equal(loseCalls, 0, 'mountBrandHorizonGlow.dispose(true) must NOT call loseContext()');
    assert.equal(ls.size, 0);
  }

  // 2) Full home-ripple-host harness with REAL Chromium canvas-context locking:
  // Once getContext('webgl2') is called on a canvas, subsequent getContext('2d') on that SAME canvas returns null!
  try {
    let roCallback = null;
    let nextId = 0;
    const stateCtrl = { webglFails: false, ctx2dFails: false, loseCalls: 0 };
    const timers = [];
    let timerSeq = 0;
    const rafs = [];
    let rafSeq = 0;

    const flushTimers = () => {
      const batch = timers.splice(0, timers.length);
      for (const it of batch) if (!it.cancelled) it.fn();
    };
    const flushRaf = (ts = 200) => {
      const batch = rafs.splice(0, rafs.length);
      for (const it of batch) if (!it.cancelled) it.fn(ts);
    };

    const makeLockedNode = (tag) => {
      const attrs = new Map();
      const children = [];
      const evs = new Map();
      let lockedType = null;
      let nodeLost = false;
      let nodeGl = null;
      let node2d = null;
      const node = {
        tagName: tag.toUpperCase(),
        className: '',
        style: {},
        width: 0,
        height: 0,
        clientWidth: 960,
        clientHeight: 600,
        children,
        parentNode: null,
        ownerDocument: null,
        _id: tag === 'canvas' ? ++nextId : 0,
        _setLost(v) { nodeLost = v; },
        _emit(type, ev = {}) {
          for (const fn of [...(evs.get(type) || [])]) fn({ preventDefault() {}, ...ev });
        },
        get isConnected() { return Boolean(this.parentNode); },
        get firstChild() { return children[0] || null; },
        setAttribute(k, v) { attrs.set(k, String(v)); },
        getAttribute(k) { return attrs.get(k) ?? null; },
        hasAttribute(k) { return attrs.has(k); },
        removeAttribute(k) { attrs.delete(k); },
        appendChild(ch) { ch.parentNode = this; children.push(ch); return ch; },
        insertBefore(ch, ref) {
          ch.parentNode = this;
          const i = ref ? children.indexOf(ref) : -1;
          if (i >= 0) children.splice(i, 0, ch); else children.push(ch);
          return ch;
        },
        replaceChild(next, old) {
          const i = children.indexOf(old);
          if (i >= 0) { old.parentNode = null; next.parentNode = this; children[i] = next; }
          return old;
        },
        replaceWith(next) { if (this.parentNode) this.parentNode.replaceChild(next, this); },
        remove() {
          if (this.parentNode) {
            const i = this.parentNode.children.indexOf(this);
            if (i >= 0) this.parentNode.children.splice(i, 1);
            this.parentNode = null;
          }
        },
        querySelector: () => null,
        getBoundingClientRect: () => ({ left: 0, top: 0, width: this.clientWidth, height: this.clientHeight }),
        addEventListener(t, fn) { if (!evs.has(t)) evs.set(t, new Set()); evs.get(t).add(fn); },
        removeEventListener(t, fn) { evs.get(t)?.delete(fn); },
        getContext(type) {
          if (this.tagName !== 'CANVAS') return null;
          // Real Chromium spec: a canvas already bound to one context type returns null for any other type!
          if (lockedType && lockedType !== type) return null;
          if (type === '2d') {
            if (stateCtrl.ctx2dFails) return null;
            lockedType = '2d';
            if (!node2d) node2d = make2DCtx();
            return node2d;
          }
          if (type === 'webgl2') {
            lockedType = 'webgl2'; // Even if shader compilation fails, WebGL2 context locks the canvas!
            if (!nodeGl) {
              nodeGl = {
                VERTEX_SHADER: 35633, FRAGMENT_SHADER: 35632, COMPILE_STATUS: 35713, LINK_STATUS: 35714,
                COLOR_BUFFER_BIT: 16384, TRIANGLES: 4, TEXTURE_2D: 3553, TEXTURE0: 33984, TEXTURE1: 33985,
                RGBA: 6408, RGBA8: 32856, UNSIGNED_BYTE: 5121, LINEAR: 9729, NEAREST: 9728, CLAMP_TO_EDGE: 33071,
                TEXTURE_MIN_FILTER: 10241, TEXTURE_MAG_FILTER: 10240, TEXTURE_WRAP_S: 10242, TEXTURE_WRAP_T: 10243,
                isContextLost: () => nodeLost,
                createShader: () => (nodeLost || stateCtrl.webglFails ? null : {}),
                shaderSource() {}, compileShader() {},
                getShaderParameter: () => !(nodeLost || stateCtrl.webglFails),
                getShaderInfoLog: () => (stateCtrl.webglFails ? 'compile-fail' : ''),
                deleteShader() {},
                createProgram: () => (nodeLost || stateCtrl.webglFails ? null : {}),
                attachShader() {}, linkProgram() {},
                getProgramParameter: () => !(nodeLost || stateCtrl.webglFails),
                getProgramInfoLog: () => '',
                useProgram() {}, deleteProgram() {}, getUniformLocation: () => ({}),
                createTexture: () => ({}), deleteTexture() {}, activeTexture() {}, bindTexture() {},
                texParameteri() {}, texStorage2D() {}, texImage2D() {}, texSubImage2D() {},
                viewport() {}, uniform1i() {}, uniform1f() {}, uniform2f() {}, uniform3f() {}, uniform4f() {},
                clearColor() {}, clear() {}, drawArrays() {},
                getExtension: (n) => (n === 'WEBGL_lose_context' ? { loseContext() { stateCtrl.loseCalls += 1; nodeLost = true; } } : null),
              };
            }
            return nodeGl;
          }
          return null;
        },
      };
      return node;
    };

    const fakeDoc = {
      hidden: false,
      documentElement: makeLockedNode('html'),
      createElement(tag) {
        const el = makeLockedNode(tag);
        el.ownerDocument = fakeDoc;
        return el;
      },
      querySelector(sel) { return sel === '.agy-home' ? homeEl : null; },
      addEventListener() {},
      removeEventListener() {},
    };
    const homeEl = fakeDoc.createElement('div');
    homeEl.parentNode = fakeDoc.documentElement;

    globalThis.document = fakeDoc;
    globalThis.window = { devicePixelRatio: 1, addEventListener() {}, removeEventListener() {} };
    globalThis.requestAnimationFrame = (fn) => { const id = ++rafSeq; rafs.push({ id, fn, cancelled: false }); return id; };
    globalThis.cancelAnimationFrame = (id) => { const it = rafs.find((x) => x.id === id); if (it) it.cancelled = true; };
    globalThis.setTimeout = (fn) => { const id = ++timerSeq; timers.push({ id, fn, cancelled: false }); return id; };
    globalThis.clearTimeout = (id) => { const it = timers.find((x) => x.id === id); if (it) it.cancelled = true; };
    globalThis.ResizeObserver = class { constructor(cb) { roCallback = cb; } observe() {} disconnect() {} };
    globalThis.performance = { now: () => 200 };

    // Case A: WebGL2 shader compile fails -> Chromium locks first canvas -> host swaps fresh canvas & succeeds with true 2D!
    stateCtrl.webglFails = true;
    stateCtrl.ctx2dFails = false;
    let ctl = homeRippleHost.createHomeRippleController({
      rippleCore, isDestroyed: () => false, isAllowed: () => true, isDarkTheme: () => true,
      motionReduced: () => false, getMinFrameGapMs: () => 0, getAmbientIntensity: () => 1, getAccentTone: () => 'follow',
      setAttrIfChanged: (el, k, v) => el.setAttribute(k, v),
    });
    ctl.sync();
    flushRaf(200);
    assert.equal(ctl.getMount().field.mode, '2d', 'locked failed WebGL2 canvas must swap to fresh canvas and recover in true 2D mode');
    assert.equal(ctl.getMount().glow.mode, '2d', 'locked failed WebGL2 glowCanvas must swap to fresh canvas and recover in true 2D mode');
    assert.notEqual(ctl.getMount().canvas.style.display, 'none');
    assert.notEqual(ctl.getMount().glowCanvas.style.display, 'none');
    ctl.unmount();

    // Case B: Both WebGL2 and 2D fail -> canvases MUST be hidden (display: none) to prevent white-screen / broken placeholder!
    stateCtrl.webglFails = true;
    stateCtrl.ctx2dFails = true;
    ctl = homeRippleHost.createHomeRippleController({
      rippleCore, isDestroyed: () => false, isAllowed: () => true, isDarkTheme: () => true,
      motionReduced: () => false, getMinFrameGapMs: () => 0, getAmbientIntensity: () => 1, getAccentTone: () => 'follow',
      setAttrIfChanged: (el, k, v) => el.setAttribute(k, v),
    });
    ctl.sync();
    flushRaf(220);
    assert.equal(ctl.getMount().field.mode, 'none');
    assert.equal(ctl.getMount().glow.mode, 'none');
    assert.equal(ctl.getMount().canvas.style.display, 'none', 'dead ripple canvas must be hidden (0 white box)');
    assert.equal(ctl.getMount().glowCanvas.style.display, 'none', 'dead glow canvas must be hidden (0 white box)');
    ctl.unmount();

    // Case C: Healthy WebGL2 -> resize preserves glowCanvas (0 loseContext) -> async webglcontextlost hides immediately & self-heals!
    stateCtrl.webglFails = false;
    stateCtrl.ctx2dFails = false;
    stateCtrl.loseCalls = 0;
    ctl = homeRippleHost.createHomeRippleController({
      rippleCore, isDestroyed: () => false, isAllowed: () => true, isDarkTheme: () => true,
      motionReduced: () => false, getMinFrameGapMs: () => 0, getAmbientIntensity: () => 1, getAccentTone: () => 'follow',
      setAttrIfChanged: (el, k, v) => el.setAttribute(k, v),
    });
    ctl.sync();
    flushRaf(240);
    const m = ctl.getMount();
    assert.equal(m.field.mode, 'webgl2');
    assert.equal(m.glow.mode, 'webgl2');
    const origFieldCv = m.canvas;
    const origGlowCv = m.glowCanvas;

    // Resize: neither field nor glowCanvas calls loseContext()
    homeEl.clientWidth = 1120;
    homeEl.clientHeight = 700;
    roCallback();
    flushRaf(260);
    assert.equal(stateCtrl.loseCalls, 0, 'resize must NOT call loseContext() on field or glowCanvas');
    assert.equal(m.glowCanvas, origGlowCv);

    // Async webglcontextlost on BOTH canvas and glowCanvas (simulating Ctrl+J xterm GPU preemption)
    origFieldCv._setLost(true);
    origGlowCv._setLost(true);
    origFieldCv._emit('webglcontextlost');
    origGlowCv._emit('webglcontextlost');
    assert.equal(origFieldCv.style.display, 'none', 'lost ripple canvas must hide immediately before recovery');
    assert.equal(origGlowCv.style.display, 'none', 'lost glow canvas must hide immediately before recovery');

    // Run debounced recovery timer -> swaps fresh canvases & restores WebGL2 + visibility
    flushTimers();
    flushRaf(300);
    assert.notEqual(m.canvas, origFieldCv, 'async lost ripple canvas must be swapped');
    assert.notEqual(m.glowCanvas, origGlowCv, 'async lost glow canvas must be swapped');
    assert.equal(m.field.mode, 'webgl2');
    assert.equal(m.glow.mode, 'webgl2');
    assert.notEqual(m.canvas.style.display, 'none');
    assert.notEqual(m.glowCanvas.style.display, 'none');

    // Second async webglcontextlost -> automatically falls back to true 2D on fresh canvases to break GPU fight loop!
    const secondCv = m.canvas;
    const secondGlow = m.glowCanvas;
    secondCv._setLost(true);
    secondGlow._setLost(true);
    secondCv._emit('webglcontextlost');
    secondGlow._emit('webglcontextlost');
    flushTimers();
    flushRaf(340);
    assert.equal(m.field.mode, '2d', 'repeated async context loss must automatically stabilize on true 2D fallback');
    assert.equal(m.glow.mode, '2d', 'repeated async glow context loss must stabilize on true 2D fallback');
    assert.notEqual(m.canvas.style.display, 'none');
    assert.notEqual(m.glowCanvas.style.display, 'none');

    ctl.unmount();
    assert.equal(timers.filter((t) => !t.cancelled).length, 0, 'unmount must cancel pending recovery timers');
  } finally {
    if (prevForce === undefined) delete globalThis.__agRippleForce2D; else globalThis.__agRippleForce2D = prevForce;
    if (prevDoc === undefined) delete globalThis.document; else globalThis.document = prevDoc;
    if (prevWin === undefined) delete globalThis.window; else globalThis.window = prevWin;
    if (prevRaf === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = prevRaf;
    if (prevCaf === undefined) delete globalThis.cancelAnimationFrame; else globalThis.cancelAnimationFrame = prevCaf;
    if (prevST === undefined) delete globalThis.setTimeout; else globalThis.setTimeout = prevST;
    if (prevCT === undefined) delete globalThis.clearTimeout; else globalThis.clearTimeout = prevCT;
    if (prevRO === undefined) delete globalThis.ResizeObserver; else globalThis.ResizeObserver = prevRO;
    if (prevPerf === undefined) delete globalThis.performance; else globalThis.performance = prevPerf;
  }
});

test('conv-aura darkAura tiers (subtle / balanced / vivid) scale dark chat optics monotonically while leaving light mode untouched', () => {
  require('../conv-aura.js');
  const { computeConvAuraOptics } = globalThis.__agPrismConvAura;
  const dSubtleIdle = computeConvAuraOptics('idle', 0, 1000, true, false, {}, 'subtle');
  const dBalIdle = computeConvAuraOptics('idle', 0, 1000, true, false, {}, 'balanced');
  const dVividIdle = computeConvAuraOptics('idle', 0, 1000, true, false, {}, 'vivid');
  assert.ok(dSubtleIdle.strength < dBalIdle.strength && dBalIdle.strength < dVividIdle.strength, 'dark idle strength must scale subtle < balanced < vivid');
  assert.ok(dSubtleIdle.prism < dBalIdle.prism && dBalIdle.prism < dVividIdle.prism, 'dark idle prism must scale subtle < balanced < vivid');

  const dSubtleRun = computeConvAuraOptics('running', 0, 1000, true, true, {}, 'subtle');
  const dBalRun = computeConvAuraOptics('running', 0, 1000, true, true, {}, 'balanced');
  const dVividRun = computeConvAuraOptics('running', 0, 1000, true, true, {}, 'vivid');
  assert.ok(dSubtleRun.strength < dBalRun.strength && dBalRun.strength < dVividRun.strength, 'dark running strength must scale subtle < balanced < vivid');

  const lSubtle = computeConvAuraOptics('idle', 0, 1000, false, false, {}, 'subtle');
  const lVivid = computeConvAuraOptics('idle', 0, 1000, false, false, {}, 'vivid');
  assert.equal(lSubtle.strength, lVivid.strength, 'light mode must be unaffected by darkAura');
  assert.equal(lSubtle.prism, lVivid.prism, 'light mode prism must be unaffected by darkAura');
});

test('HORIZON_FRAGMENT_SHADER eliminates direct AMBER->SKY_BLUE mixing, decouples blueLoop/prismLoop cross-mix, and supports neonLoop', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'ripple-core.js'), 'utf8');
  assert.equal(src.includes('mix(PRISM_AMBER, SKY_BLUE'), false, 'prismLoop must fold through coral/iris instead of mixing amber directly into sky blue');
  assert.ok(src.includes('vec3 neonLoop('), 'shader must define neonLoop for Abyssal Glow style');
  assert.ok(src.includes('base = mix(base, pCol, clamp(effPrism * 1.45'), 'shader must decouple hue purity from caustic luminance');
  assert.equal(rippleCore.resolveHorizonSpectrumCode(6), 6);
  assert.equal(rippleCore.resolveHorizonSpectrumCode('neon'), 6);
});

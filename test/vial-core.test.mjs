import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const vialCore = require('../vial-core.js');

test('vial-core exposes 24-node physical shallow-water engine, symmetrical ionized capsule geometry, and slosh damping', () => {
  assert.equal(vialCore.WAVE_NODES, 24);
  assert.ok(vialCore.RC_OUT >= 12.0 && vialCore.RC_OUT <= 16.0, `Expected sleek ionized capsule RC_OUT in 12..16, got ${vialCore.RC_OUT}`);
  assert.ok(vialCore.RC_IN >= 10.0 && vialCore.RC_IN <= 14.0, `Expected sleek ionized capsule RC_IN in 10..14, got ${vialCore.RC_IN}`);

  const sim = vialCore.createWaterVialPhysics({ fill: 0.48, streaming: false });
  assert.equal(sim.waveH.length, 24);
  assert.equal(sim.getSnapshot().waveEnergy, 0);

  sim.injectSlosh(2.2);
  for (let i = 0; i < 6; i++) sim.step(0.016);
  const peak = sim.getSnapshot();
  assert.ok(peak.waveEnergy > 2, `Expected wave energy > 2 after slosh, got ${peak.waveEnergy}`);
  assert.ok(Math.abs(peak.tiltAngle) > 0.04, `Expected noticeable tilt angle, got ${peak.tiltAngle}`);
  assert.ok(Math.abs(peak.tiltAngle) <= 0.48, 'Tilt angle must remain bounded');

  for (let i = 0; i < 180; i++) sim.step(0.025);
  const settled = sim.getSnapshot();
  assert.ok(settled.waveEnergy < peak.waveEnergy * 0.25, 'Damping should decay slosh energy cleanly');
});

test('vial-core finger poke near meniscus excites ripples and inner-wall wetting trails', () => {
  const sim = vialCore.createWaterVialPhysics({ fill: 0.5, streaming: false });
  sim.injectFingerPoke(-0.8, 0.5, -10, 4);
  sim.step(0.016);
  const snap = sim.getSnapshot();
  assert.ok(snap.waveEnergy > 0.5, 'Finger poke near surface should excite shallow water waves');
  assert.ok(snap.wetLeft > 0.1, `Expected left inner glass wetting trail, got ${snap.wetLeft}`);

  for (let i = 0; i < 100; i++) sim.step(0.03);
  assert.ok(sim.getSnapshot().wetLeft < snap.wetLeft, 'Wall wetting trail should slide/fade over time');
});

test('vial-core pendant droplet falls through air neck and splashes into rounded capsule water surface', () => {
  const sim = vialCore.createWaterVialPhysics({ fill: 0.42, streaming: true });
  sim.spawnDropletNow();
  assert.equal(sim.getSnapshot().fallingCount, 1);

  let impacted = false;
  for (let i = 0; i < 60; i++) {
    sim.step(0.016);
    const snap = sim.getSnapshot();
    if (snap.fallingCount === 0 && snap.waveEnergy > 0.2) {
      impacted = true;
      assert.ok(snap.bubbleCount >= 1, 'Droplet splash must inject submerged cavitation micro-bubbles');
      break;
    }
  }
  assert.ok(impacted, 'Falling droplet should hit meniscus within 1s and excite ripples');

  const lowSim = vialCore.createWaterVialPhysics({ fill: 0.08, streaming: true });
  lowSim.injectSlosh(2.4);
  for (let i = 0; i < 30; i++) {
    lowSim.step(0.016);
    for (const b of lowSim.bubbles) {
      assert.ok(Number.isFinite(b.x) && Math.abs(b.x) < 19.2, `Bubble x=${b.x} must remain confined inside rounded capsule bore`);
    }
  }
});

function createMock2DCanvas() {
  const listeners = new Map();
  const drawnLabels = [];
  const fillStyles = [];
  const strokeStyles = [];
  const gradStops = [];
  let drawImageCalls = 0;
  const ctx2d = {
    font: '',
    textBaseline: '',
    _fillStyle: '',
    _strokeStyle: '',
    get fillStyle() {
      return this._fillStyle;
    },
    set fillStyle(v) {
      this._fillStyle = v;
      if (typeof v === 'string') fillStyles.push(v);
    },
    get strokeStyle() {
      return this._strokeStyle;
    },
    set strokeStyle(v) {
      this._strokeStyle = v;
      if (typeof v === 'string') strokeStyles.push(v);
    },
    lineWidth: 1,
    save() {},
    restore() {},
    setTransform() {},
    clearRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    arcTo() {},
    closePath() {},
    fill() {},
    stroke() {},
    translate() {},
    rotate() {},
    ellipse() {},
    fillRect() {},
    fillText(text) {
      drawnLabels.push(String(text));
    },
    drawImage() {
      drawImageCalls++;
    },
    createLinearGradient() {
      return {
        addColorStop(offset, color) {
          gradStops.push([offset, color]);
        },
      };
    },
  };
  return {
    width: 96,
    height: 220,
    drawnLabels,
    fillStyles,
    strokeStyles,
    gradStops,
    getDrawImageCalls: () => drawImageCalls,
    listeners,
    getContext(kind) {
      return kind === '2d' ? ctx2d : null;
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 96, height: 220 };
    },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn);
    },
    dispatch(type, evt = {}) {
      for (const fn of [...(listeners.get(type) || [])]) fn(evt);
    },
  };
}

test('isSettled() enters true 0fps sleep after >=1.1s convergence and immediately wakes to false on setLevel / agitate / tilt / theme switch', () => {
  const prevDoc = globalThis.document;
  delete globalThis.document;

  try {
    const canvas = createMock2DCanvas();
    let themeDark = true;
    const vial = vialCore.mountPhysicalWaterVial(canvas, {
      fill: 0.46,
      streaming: false,
      getState: () => ({
        isDark: themeDark,
        camp: 'gemini',
        critical: false,
        fill: 0.46,
        maxTokens: 512000,
        hoveredSlice: -1,
        streaming: false,
      }),
    });

    // 入场未满 1.1s 时严禁提前报 settled
    assert.equal(vial.isSettled(), false, 'Must not report settled before 1.1s entry age');
    for (let i = 0; i < 15; i++) vial.step(0.05); // 0.75s
    assert.equal(vial.isSettled(), false, 'Must remain unsettled at 0.75s');

    // 推进超过 1.1s（累计 1.25s），液位与波能静止收敛 -> true
    for (let i = 0; i < 10; i++) vial.step(0.05); // +0.5s = 1.25s
    assert.equal(vial.isSettled(), true, 'Must report settled after >=1.1s when calm');

    // 1. setLevel 立即恢复 false，插值误差收敛 < 0.001 后恢复 true
    vial.setLevel(0.78);
    assert.equal(vial.isSettled(), false, 'setLevel must immediately wake isSettled() -> false');
    for (let i = 0; i < 40; i++) vial.step(0.04);
    assert.equal(vial.isSettled(), true, 'Must re-settle once level interpolation error < 0.001');

    // 2. agitate 立即恢复 false，阻尼耗散后恢复 true
    vial.agitate(2.0);
    assert.equal(vial.isSettled(), false, 'agitate must immediately wake isSettled() -> false');
    for (let i = 0; i < 120; i++) vial.step(0.04);
    assert.equal(vial.isSettled(), true, 'Must re-settle after slosh waves decay');

    // 3. tilt 立即恢复 false，水平仪回正后恢复 true
    vial.tilt(0.32);
    assert.equal(vial.isSettled(), false, 'tilt must immediately wake isSettled() -> false');
    for (let i = 0; i < 100; i++) vial.step(0.04);
    assert.equal(vial.isSettled(), true, 'Must re-settle after tilt pendulum stabilizes');

    // 4. 主题切换立即恢复 false，重绘新主题帧后恢复 true
    themeDark = false;
    assert.equal(vial.isSettled(), false, 'Theme switch must immediately flip isSettled() -> false');
    vial.step(0.016);
    assert.equal(vial.isSettled(), true, 'After rendering new theme frame while calm, vial re-enters sleep');

    vial.dispose();
  } finally {
    if (prevDoc !== undefined) globalThis.document = prevDoc;
  }
});

test('hoveredSlice change wakes 0fps sleep for 1 optical focus-ring frame and immediately re-settles', () => {
  const prevDoc = globalThis.document;
  delete globalThis.document;

  try {
    const canvas = createMock2DCanvas();
    let activeSlice = -1;
    const vial = vialCore.mountPhysicalWaterVial(canvas, {
      fill: 0.55,
      streaming: false,
      getState: () => ({
        isDark: true,
        camp: 'gemini',
        critical: false,
        fill: 0.55,
        maxTokens: 512000,
        ratios: [0.10, 0.30, 0.15],
        hoveredSlice: activeSlice,
        streaming: false,
      }),
    });

    for (let i = 0; i < 30; i++) vial.step(0.05);
    assert.equal(vial.isSettled(), true, 'Vial must settle cleanly at 0fps');

    for (const s of [0, 1, 2, -1]) {
      activeSlice = s;
      assert.equal(vial.isSettled(), false, `Changing hoveredSlice to ${s} must wake isSettled()`);
      vial.step(0.016);
      assert.equal(vial.isSettled(), true, `After 1 redraw frame for slice ${s}, vial must immediately re-settle to 0fps`);
    }

    vial.dispose();
  } finally {
    if (prevDoc !== undefined) globalThis.document = prevDoc;
  }
});

test('mountPhysicalWaterVial renders high-contrast daylight borosilicate glass & cobalt-sky column in 2D fallback mode', () => {
  const prevDoc = globalThis.document;
  delete globalThis.document;

  try {
    const canvas = createMock2DCanvas();
    let curState = {
      isDark: true,
      camp: 'gemini',
      critical: false,
      fill: 0.52,
      ratios: [0.10, 0.28, 0.14],
      hoveredSlice: -1,
      streaming: true,
    };

    const inst = vialCore.mountPhysicalWaterVial(canvas, {
      fill: 0.52,
      streaming: true,
      getState: () => curState,
    });

    assert.equal(inst.getDebugState().rendererMode, '2d');
    assert.deepEqual(canvas.drawnLabels.slice(0, 3), ['128k', '256k', '384k']);

    canvas.drawnLabels.length = 0;
    curState = { ...curState, maxTokens: 256000 };
    inst.step(0.016);
    assert.deepEqual(canvas.drawnLabels.slice(0, 3), ['64k', '128k', '192k']);

    canvas.drawnLabels.length = 0;
    curState = { ...curState, maxTokens: 1000000 };
    inst.step(0.016);
    assert.deepEqual(canvas.drawnLabels.slice(0, 3), ['250k', '500k', '750k']);

    // 浅色白昼模式对比度校验：管壁折射 rgba(30, 64, 175, 0.28)、皇家钴蓝-晴空蓝水柱、rgba(30, 41, 59, 0.62) 刻度字
    canvas.fillStyles.length = 0;
    canvas.gradStops.length = 0;
    curState = { ...curState, isDark: false, fill: 0.42, streaming: false };
    inst.step(0.016);

    assert.ok(
      canvas.gradStops.some(([, c]) => c === 'rgba(30, 64, 175, 0.28)'),
      'Daylight 2D glass must render rgba(30, 64, 175, 0.28) refraction rim'
    );
    assert.ok(
      canvas.gradStops.some(([, c]) => c.includes('29, 78, 216')),
      'Daylight 2D water column must ground in Royal Cobalt (#1D4ED8)'
    );
    assert.ok(
      canvas.gradStops.some(([, c]) => c.includes('2, 132, 199')),
      'Daylight 2D water column must rise to Clear Sky Blue (#0284C7)'
    );
    assert.ok(
      canvas.fillStyles.includes('rgba(30, 41, 59, 0.62)'),
      'Daylight scale tick labels must use crisp slate rgba(30, 41, 59, 0.62)'
    );

    inst.spawnDroplet();
    canvas.dispatch('pointerdown', { clientX: 46, clientY: 112 });
    canvas.dispatch('pointermove', { clientX: 28, clientY: 110 });
    canvas.dispatch('pointermove', { clientX: 40, clientY: 108 });
    canvas.dispatch('pointerleave');

    curState = { ...curState, camp: 'claude', isDark: false, critical: true, fill: 0.90, hoveredSlice: 1 };
    inst.step(0.016);
    assert.ok(inst.getDebugState().waveEnergy > 0.5);

    inst.dispose();
    for (const set of canvas.listeners.values()) {
      assert.equal(set.size, 0, 'dispose() must detach all pointer listeners cleanly');
    }
  } finally {
    if (prevDoc !== undefined) globalThis.document = prevDoc;
  }
});

test('mountPhysicalWaterVial mounts WebGL2 borosilicate daylight + deep-sea ionized shader pipeline and falls back gracefully', () => {
  const prevDoc = globalThis.document;
  const shaderSources = [];
  let lostContextCalled = 0;
  let programDeleted = 0;
  let bufferDeleted = 0;
  let drawArraysCount = 0;
  let shouldFailCompile = false;

  globalThis.document = {
    createElement(tag) {
      assert.equal(String(tag).toLowerCase(), 'canvas');
      return {
        width: 96,
        height: 220,
        getContext(kind) {
          if (kind !== 'webgl2') return null;
          return {
            VERTEX_SHADER: 0x8b31,
            FRAGMENT_SHADER: 0x8b30,
            COMPILE_STATUS: 0x8b81,
            LINK_STATUS: 0x8b82,
            ARRAY_BUFFER: 0x8892,
            STATIC_DRAW: 0x88e4,
            FLOAT: 0x1406,
            COLOR_BUFFER_BIT: 0x4000,
            TRIANGLE_STRIP: 0x0005,
            createShader: (type) => ({ type }),
            shaderSource: (_sh, src) => shaderSources.push(src),
            compileShader() {},
            getShaderParameter: () => !shouldFailCompile,
            getShaderInfoLog: () => 'mock compile failure',
            deleteShader() {},
            createProgram: () => ({ id: 'prog' }),
            attachShader() {},
            linkProgram() {},
            getProgramParameter: () => true,
            getProgramInfoLog: () => '',
            deleteProgram: () => { programDeleted++; },
            createBuffer: () => ({ id: 'buf' }),
            bindBuffer() {},
            bufferData() {},
            deleteBuffer: () => { bufferDeleted++; },
            getAttribLocation: () => 0,
            enableVertexAttribArray() {},
            vertexAttribPointer() {},
            getUniformLocation: (_p, name) => ({ name }),
            viewport() {},
            clearColor() {},
            clear() {},
            useProgram() {},
            uniform1f() {},
            uniform2f() {},
            uniform3f() {},
            uniform3fv() {},
            uniform1fv() {},
            uniform2fv() {},
            uniform4fv() {},
            drawArrays: () => { drawArraysCount++; },
            getExtension: (ext) => (ext === 'WEBGL_lose_context' ? { loseContext() { lostContextCalled++; } } : null),
          };
        },
      };
    },
  };

  try {
    const canvas = createMock2DCanvas();
    const inst = vialCore.mountPhysicalWaterVial(canvas, {
      fill: 0.48,
      streaming: true,
      getState: () => ({
        isDark: false,
        camp: 'claude',
        critical: false,
        fill: 0.48,
        ratios: [0.09, 0.27, 0.12],
        hoveredSlice: 0,
        streaming: true,
      }),
    });

    assert.equal(inst.getDebugState().rendererMode, 'webgl2');
    assert.equal(shaderSources.length, 2);
    assert.match(shaderSources[1], /#version 300 es/);
    assert.match(shaderSources[1], /RC_OUT = 14\.5/);
    assert.match(shaderSources[1], /DAY_AIR = vec3\(0\.880, 0\.920, 0\.980\)/);
    assert.match(shaderSources[1], /DAY_RIM_REF = vec3\(0\.118, 0\.251, 0\.686\)/);
    assert.match(shaderSources[1], /DAY_ROYAL = vec3\(0\.114, 0\.306, 0\.847\)/);
    assert.match(shaderSources[1], /DAY_SKY = vec3\(0\.008, 0\.518, 0\.780\)/);
    assert.match(shaderSources[1], /DAY_VIOLET = vec3\(0\.486, 0\.227, 0\.929\)/);
    assert.match(shaderSources[1], /DAY_AMBER_RED = vec3\(0\.918, 0\.345, 0\.047\)/);
    assert.ok(drawArraysCount >= 1);
    assert.ok(canvas.getDrawImageCalls() >= 1);

    inst.impulse(1.8);
    inst.spawnDroplet();
    inst.step(0.016);
    assert.ok(drawArraysCount >= 2);

    inst.dispose();
    assert.equal(programDeleted, 1);
    assert.equal(bufferDeleted, 1);
    assert.equal(lostContextCalled, 1);

    shouldFailCompile = true;
    const fbCanvas = createMock2DCanvas();
    const origWarn = console.warn;
    console.warn = () => {};
    let fbInst;
    try {
      fbInst = vialCore.mountPhysicalWaterVial(fbCanvas, { fill: 0.4 });
    } finally {
      console.warn = origWarn;
    }
    assert.equal(fbInst.getDebugState().rendererMode, '2d');
    fbInst.dispose();
  } finally {
    if (prevDoc === undefined) delete globalThis.document;
    else globalThis.document = prevDoc;
  }
});

test('OP-3.5 vial-core accentTone response: mono silver-titanium, iris, amber, and warm-follow wake from 0fps sleep cleanly', () => {
  const prevDoc = globalThis.document;
  delete globalThis.document;

  try {
    const canvas = createMock2DCanvas();
    let curState = {
      isDark: false,
      accentTone: 'follow',
      palette: 'obsidian',
      camp: 'gemini',
      critical: false,
      fill: 0.48,
      ratios: [0.10, 0.26, 0.12],
      hoveredSlice: -1,
      streaming: false,
    };

    const inst = vialCore.mountPhysicalWaterVial(canvas, {
      fill: 0.48,
      streaming: false,
      reduceMotion: true,
      getState: () => curState,
    });
    assert.equal(inst.isSettled(), true, 'Must settle immediately when reduceMotion is true');

    // Switching accentTone to mono must invalidate settled signature, wake for 1 frame, and render silver-titanium without cobalt blue
    curState = { ...curState, accentTone: 'mono' };
    assert.equal(inst.isSettled(), false, 'Changing accentTone must mark visual signature dirty to wake 0fps loop');
    canvas.gradStops.length = 0;
    inst.step(0.016);
    assert.equal(inst.isSettled(), true, 'Must re-settle immediately after rendering updated mono frame');
    assert.ok(
      canvas.gradStops.some(([, c]) => c.includes('82, 82, 91')),
      'Mono daylight column must render neutral zinc/titanium stops'
    );
    assert.equal(
      canvas.gradStops.some(([, c]) => c.includes('29, 78, 216') || c.includes('2, 132, 199')),
      false,
      'Mono daylight column must NOT contain cobalt/sky blue stops'
    );

    // Switching to warm + follow automatically adopts amber spectrum
    curState = { ...curState, accentTone: 'follow', palette: 'warm' };
    assert.equal(inst.isSettled(), false);
    canvas.gradStops.length = 0;
    inst.step(0.016);
    assert.ok(
      canvas.gradStops.some(([, c]) => c.includes('217, 119, 6')),
      'Warm palette + follow accent must render warm amber liquid spectrum'
    );

    // Switching to iris renders violet/iris spectrum
    curState = { ...curState, accentTone: 'iris', palette: 'obsidian' };
    canvas.gradStops.length = 0;
    inst.step(0.016);
    assert.ok(
      canvas.gradStops.some(([, c]) => c.includes('124, 58, 237')),
      'Iris accent must render violet/iris liquid spectrum'
    );

    inst.dispose();
  } finally {
    if (prevDoc !== undefined) globalThis.document = prevDoc;
  }
});

test('Issue #2/#4/#5 high-Hz & win-blur guards: pulse-vial-bridge (<31,000B) 33ms steady throttle + 0fps blur sleep, and prism-rim-canvas DPR 1.5 + <1.5px micro-move skip', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const bridgePath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'pulse-vial-bridge.js');
  const bridgeBytes = fs.statSync(bridgePath).size;
  assert.ok(bridgeBytes < 31000, `pulse-vial-bridge.js must stay < 31,000 B, got ${bridgeBytes} B`);

  const bridgeMod = require('../pulse-vial-bridge.js');
  const prismRimMod = require('../prism-rim-canvas.js');

  // Part A: pulse-vial-bridge 180Hz steady streaming throttle (>=33ms) & win-blur 0fps pause/wake
  const winListeners = new Map();
  const docListeners = new Map();
  let moList = [];
  let rafId = 0;
  let rafCb = null;
  const htmlAttrs = new Map();
  const makeNode = (tag, attrsInit = {}) => {
    const attrs = new Map(Object.entries(attrsInit).map(([k, v]) => [k, String(v)]));
    const listeners = new Map();
    const kids = [];
    const el = {
      nodeType: 1,
      tagName: tag.toUpperCase(),
      id: attrs.get('id') || '',
      className: attrs.get('class') || '',
      hidden: false,
      isConnected: true,
      parentNode: null,
      parentElement: null,
      textContent: '',
      style: {
        getPropertyValue: () => '',
        setProperty() {},
        removeProperty() {},
      },
      children: kids,
      get firstChild() { return kids[0] || null; },
      get firstElementChild() { return kids[0] || null; },
      get nextSibling() { return null; },
      setAttribute(k, v) { attrs.set(k, String(v)); },
      getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
      removeAttribute(k) { attrs.delete(k); },
      appendChild(c) { c.parentNode = el; c.parentElement = el; kids.push(c); return c; },
      insertBefore(c, ref) {
        c.parentNode = el; c.parentElement = el;
        const idx = kids.indexOf(ref);
        if (idx >= 0) kids.splice(idx, 0, c);
        else kids.push(c);
        return c;
      },
      remove() {
        el.isConnected = false;
        const p = el.parentNode;
        if (p?.children) { const i = p.children.indexOf(el); if (i >= 0) p.children.splice(i, 1); }
      },
      closest: () => null,
      getBoundingClientRect: () => ({ left: 100, top: 40, right: 496, bottom: 320, width: 396, height: 280 }),
      addEventListener(t, fn) { if (!listeners.has(t)) listeners.set(t, new Set()); listeners.get(t).add(fn); },
      removeEventListener(t, fn) { listeners.get(t)?.delete(fn); },
      dispatchEvent(ev) { for (const fn of [...(listeners.get(ev.type) || [])]) fn({ preventDefault() {}, stopPropagation() {}, ...ev }); },
      querySelector(sel) {
        if (sel === '.heading') return kids.find((k) => k.className.includes('heading')) || null;
        if (sel.includes('data-vial-canvas')) return kids.find((k) => k.getAttribute?.('data-vial-canvas') === 'true') || null;
        return null;
      },
      querySelectorAll: () => [],
      getContext: (k) => (k === '2d' ? createMock2DCanvas().getContext('2d') : null),
    };
    return el;
  };

  const card = makeNode('div', { id: 'context-card' });
  const heading = makeNode('div', { class: 'heading context-hero' });
  card.appendChild(heading);
  const byId = new Map([['context-card', card]]);
  for (const id of ['context-percent', 'tps', 'context-tokens', 'context-model', 'context-summary']) {
    const n = makeNode('span', { id });
    byId.set(id, n);
    card.appendChild(n);
  }
  const sr = {
    children: [card],
    getElementById: (id) => byId.get(id) || null,
    appendChild(c) { sr.children.push(c); return c; },
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  const pulseHost = makeNode('div', { id: 'ag-pulse-status-bar', 'data-ag-pulse-bar': 'true', 'data-scope': 'main' });
  pulseHost.shadowRoot = sr;

  let stepCalls = 0;
  let mockEnergy = 0.08;
  let mockFalling = 0;
  const customVialCore = {
    mountPhysicalWaterVial() {
      return {
        step() { stepCalls += 1; },
        isSettled: () => false,
        wake() {},
        impulse() {},
        dispose() {},
        getDebugState: () => ({ rendererMode: '2d', waveEnergy: mockEnergy, fallingCount: mockFalling }),
      };
    },
  };

  const mockDoc = {
    hidden: false,
    body: { className: '' },
    documentElement: {
      getAttribute: (k) => (htmlAttrs.has(k) ? htmlAttrs.get(k) : null),
      setAttribute(k, v) { htmlAttrs.set(k, String(v)); for (const m of moList) m.cb([]); },
      removeAttribute(k) { htmlAttrs.delete(k); for (const m of moList) m.cb([]); },
    },
    createElement: (t) => makeNode(t),
    getElementById: (id) => (id === 'ag-pulse-status-bar' ? pulseHost : null),
    querySelector: (s) => (s.includes('conversation-view') ? {} : null),
    querySelectorAll: (s) => (s.includes('ag-pulse-status-bar') ? [pulseHost] : []),
    addEventListener(t, fn) { if (!docListeners.has(t)) docListeners.set(t, new Set()); docListeners.get(t).add(fn); },
    removeEventListener(t, fn) { docListeners.get(t)?.delete(fn); },
  };
  const mockWin = {
    innerWidth: 1280,
    location: { pathname: '/c/11111111-2222-4333-8444-555555555555' },
    document: mockDoc,
    requestAnimationFrame(cb) { rafCb = cb; return ++rafId; },
    cancelAnimationFrame() { rafCb = null; },
    MutationObserver: class {
      constructor(cb) { this.cb = cb; moList.push(this); }
      observe() {}
      disconnect() {}
    },
    addEventListener(t, fn) { if (!winListeners.has(t)) winListeners.set(t, new Set()); winListeners.get(t).add(fn); },
    removeEventListener(t, fn) { winListeners.get(t)?.delete(fn); },
    dispatch(t) { for (const fn of [...(winListeners.get(t) || [])]) fn({ type: t }); },
    agPulseHost: {
      getMetrics: async () => ({
        speed: {
          tps: 55,
          latestTps: 60,
          context: { usedTokens: 120000, maxTokens: 512000, usedFraction: 0.23, model: 'Gemini 4', sampledAt: new Date().toISOString() },
        },
      }),
    },
  };

  const bridge = bridgeMod.mountPulseVialBridge({
    win: mockWin,
    doc: mockDoc,
    vialCore: customVialCore,
    autoPoll: false,
    allowMultiple: true,
  });

  try {
    await bridge.sync();
    assert.equal(bridge.getDebugState().streaming, true);
    assert.equal(bridge.getDebugState().rafActive, true);

    // Steady streaming on 180Hz display (targetFps="180", no pointer poke, fallingCount=0, waveEnergy=0.08 < 0.35): throttled >= 33ms (~30fps)
    rafCb(1000);
    const s0 = stepCalls;
    rafCb(1006);
    rafCb(1018);
    rafCb(1028);
    assert.equal(stepCalls, s0, 'Steady streaming without droplet splash or pointer poke must throttle 180Hz ticks (<33ms)');
    rafCb(1034);
    assert.equal(stepCalls, s0 + 1, 'Tick at >=33ms executes steady streaming step cleanly');

    // Active droplet splash (fallingCount > 0) immediately releases 180Hz high-rate fluid steps
    mockFalling = 1;
    rafCb(1042);
    assert.equal(stepCalls, s0 + 2, 'Active falling droplet must release high-rate rAF (<33ms)');
    mockFalling = 0;

    // Window blur & data-ag-cs-win-blur="1" suspend rAF to 0fps, and focus wakes immediately
    mockDoc.documentElement.setAttribute('data-ag-cs-win-blur', '1');
    assert.equal(bridge.getDebugState().rafActive, false, 'data-ag-cs-win-blur="1" must suspend vial rAF to 0fps');
    assert.equal(bridge.getDebugState().pollSuspended, true);
    mockDoc.documentElement.removeAttribute('data-ag-cs-win-blur');
    assert.equal(bridge.getDebugState().rafActive, true, 'Removing data-ag-cs-win-blur must resume vial rAF');

    mockWin.dispatch('blur');
    assert.equal(bridge.getDebugState().rafActive, false, 'window.blur must suspend vial rAF to 0fps');
    mockWin.dispatch('focus');
    assert.equal(bridge.getDebugState().rafActive, true, 'window.focus must resume vial rAF');
  } finally {
    bridge.destroy();
  }

  // Part B: prism-rim-canvas DPR cap <= 1.5, <1.5px micro-move skip, >=16ms frame clamp, and win-blur early exit
  const prevWin = globalThis.window;
  const prevDoc = globalThis.document;
  const prevPerf = globalThis.performance;
  const prevRaf = globalThis.requestAnimationFrame;
  let nowT = 2000;
  let rimRaf = null;
  let rimGradCalls = 0;
  const rimHtmlAttrs = new Map();
  const fakeCv = {
    width: 0,
    height: 0,
    isConnected: true,
    classList: { contains: (c) => c === 'ag-cs-prism-rim-cv' },
    getContext: () => ({
      globalAlpha: 1,
      clearRect() {},
      beginPath() {},
      roundRect() {},
      stroke() {},
      createRadialGradient() {
        rimGradCalls += 1;
        return { addColorStop() {} };
      },
    }),
    setAttribute() {},
    remove() {},
  };
  const fakeBox = {
    isConnected: true,
    firstElementChild: fakeCv,
    getAttribute: (k) => (k === 'data-ag-cs-prism-box' ? '1' : null),
    getBoundingClientRect: () => ({ left: 100, top: 100, right: 300, bottom: 180, width: 200, height: 80 }),
    appendChild() {},
    style: { setProperty() {} },
  };
  fakeCv.parentElement = fakeBox;

  globalThis.window = { devicePixelRatio: 3 };
  globalThis.performance = { now: () => nowT };
  globalThis.requestAnimationFrame = (cb) => { rimRaf = cb; return 1; };
  globalThis.document = {
    hidden: false,
    documentElement: { getAttribute: (k) => (rimHtmlAttrs.has(k) ? rimHtmlAttrs.get(k) : null) },
    querySelectorAll: (s) => (s.includes('data-ag-cs-prism-box') ? [fakeBox] : []),
  };
  try {
    const rimCtl = prismRimMod.createPrismRimCanvasController({
      isDestroyed: () => false,
      isDarkTheme: () => true,
      motionReduced: () => false,
      getMinFrameGapMs: () => 4.8, // 180Hz input
      getAmbientIntensity: () => 1,
      getAccentTone: () => 'follow',
      canMountRealCanvas: () => true,
      setAttrIfChanged() {},
      runGuardedMut: (fn) => fn(),
    });
    rimCtl.onPointerMove({ clientX: 150, clientY: 130 });
    rimRaf(2000);
    assert.equal(fakeCv.width, Math.round((200 + 2) * 1.5), 'Prism rim DPR must cap at 1.5 even on 3x Retina displays');
    assert.equal(rimGradCalls, 1);

    // 180Hz targetFps (4.8ms gap) skips sub-gap +3ms tick and renders on +6ms tick
    rimCtl.onPointerMove({ clientX: 180, clientY: 140 });
    nowT = 2003;
    rimRaf(2003);
    assert.equal(rimGradCalls, 1, 'flushPrismPointer must honor 4.8ms gap and skip +3ms tick');

    nowT = 2006;
    rimRaf(2006);
    assert.equal(rimGradCalls, 2, 'flushPrismPointer must render 180Hz +6ms tick once gap >= 4.8ms');

    // At +20ms, micro-movement < 1.5px from (180,140) -> (181.1, 140.8) skips redundant canvas redraw
    rimCtl.onPointerMove({ clientX: 181.1, clientY: 140.8 });
    nowT = 2020;
    rimRaf(2020);
    assert.equal(rimGradCalls, 2, '<1.5px pointer micro-jitter with unchanged signature must skip redraw');

    // Real pointer move >= 1.5px redraws cleanly
    rimCtl.onPointerMove({ clientX: 170, clientY: 145 });
    nowT = 2040;
    rimRaf(2040);
    assert.equal(rimGradCalls, 3);

    // data-ag-cs-win-blur="1" skips scheduling rAF on pointermove
    rimRaf = null;
    rimHtmlAttrs.set('data-ag-cs-win-blur', '1');
    rimCtl.onPointerMove({ clientX: 190, clientY: 150 });
    assert.equal(rimRaf, null, 'onPointerMove must early-exit without scheduling rAF when data-ag-cs-win-blur="1"');
    rimCtl.teardown();
  } finally {
    globalThis.window = prevWin;
    globalThis.document = prevDoc;
    globalThis.performance = prevPerf;
    globalThis.requestAnimationFrame = prevRaf;
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const rig = require('../dual-mascot-rig.js');

test('dual-mascot-rig aligns strictly with official Claude Clawd PX=3 TICK=100 DOZE_TICK=400 open geometry', () => {
  assert.equal(rig.PX, 3);
  assert.equal(rig.TICK, 100);
  assert.equal(rig.DOZE_TICK, 400);
  const grid = rig.resolveClawdStandGrid();
  assert.deepEqual(grid, rig.OFFICIAL_OPEN_REF);
});

test('Gemini purple cat shares official blocky grammar without outlines or highlight noise', () => {
  const allowedChars = new Set(['#', 's', 'o', '.', ' ']);
  for (const partName of ['ears', 'body', 'eyes', 'legs', 'paws', 'tail']) {
    const group = rig.CAT_PARTS[partName];
    assert.ok(group && typeof group === 'object', `Expected CAT_PARTS.${partName}`);
    for (const [poseKey, layer] of Object.entries(group)) {
      if (!layer || !Array.isArray(layer.rows)) continue;
      for (const row of layer.rows) {
        for (const ch of row) {
          assert.ok(
            allowedChars.has(ch),
            `Unexpected char '${ch}' in CAT_PARTS.${partName}.${poseKey}`
          );
        }
      }
    }
  }
  assert.strictEqual(rig.CAT_PARTS.legs, rig.CLAWD_PARTS.legs);
});

test('buildClipLayers supports full theater, eggs, poke/sulk, and punctuation reactions', () => {
  const theaterPoses = [
    'idle',
    'happy',
    'groom',
    'pet',
    'write',
    'peek',
    'flat',
    'polish',
    'eat',
    'eatFish',
    'chaseDot',
    'catStretch',
    'letter',
    'plant',
    'butterfly',
    'stretch',
    'spinHop',
    'chatGreet',
    'tilt',
    'wow',
    'sulk',
    'onFire',
    'cheerSticks',
    'rickroll',
    'siren',
  ];
  for (const kind of ['clawd', 'cat']) {
    for (const pose of theaterPoses) {
      const layers = rig.buildClipLayers(kind, pose, 6, { clipTick: 6, dir: 'right', blink: false });
      assert.ok(Array.isArray(layers) && layers.length >= 3, `Expected rich layers for ${kind}:${pose}`);
    }
  }

  const fireLayers = rig.buildClipLayers('clawd', 'onFire', 12, { clipTick: 12 });
  assert.ok(fireLayers.includes(rig.PROPS.mug), 'onFire should include coffee mug');
  assert.ok(fireLayers.some((l) => l && l.grounded === true && l.rows.length > 5), 'onFire should include back fire layer');

  const cheerLayers = rig.buildClipLayers('cat', 'cheerSticks', 5, { clipTick: 5 });
  assert.ok(
    cheerLayers.some((l) => l === rig.PROPS.stickLT || l === rig.PROPS.stickUp || l === rig.PROPS.stickRT),
    'cheerSticks should include glowing stick prop'
  );

  const sirenLayers = rig.buildClipLayers('clawd', 'siren', 1, { clipTick: 1 });
  assert.ok(sirenLayers.includes(rig.PROPS.sirenF), 'siren phase 1 should mount front red siren');

  assert.deepEqual(Object.keys(rig.MINI_SPRITES).sort(), ['cowboy', 'shades', 'wizard']);
  for (const id of ['cowboy', 'shades', 'wizard']) {
    assert.ok(rig.MINI_ANIM_FRAMES[id]?.walkB?.rows?.length >= 6, `Missing walkB for ${id}`);
    assert.ok(rig.MINI_ANIM_FRAMES[id]?.trick?.rows?.length >= 6, `Missing trick for ${id}`);
  }
});

test('ecosystem poses, orchestrator ice crystal, doze Zzz, and mouth layers follow blocky grammar', () => {
  const allowedChars = new Set(['#', 's', 'o', '.', ' ']);
  for (const group of [rig.CLAWD_PARTS.mouth, rig.CAT_PARTS.mouth]) {
    assert.ok(group && typeof group === 'object', 'Expected mouth parts');
    for (const layer of Object.values(group)) {
      for (const row of layer.rows) {
        for (const ch of row) {
          assert.ok(allowedChars.has(ch), `Unexpected mouth char '${ch}'`);
        }
      }
    }
  }
  assert.ok(rig.PROPS.iceCrystal?.rows?.length >= 5, 'Expected iceCrystal prop');
  assert.ok(rig.SYMS.dozeZ1?.rows?.length >= 3, 'Expected dozeZ1 symbol');

  for (const pose of ['yawn', 'wave', 'salute', 'worry', 'carry']) {
    for (const kind of ['clawd', 'cat']) {
      const layers = rig.buildClipLayers(kind, pose, 4, { clipTick: 4, crystal: kind === 'clawd' });
      assert.ok(Array.isArray(layers) && layers.length >= 3, `Expected layers for ${kind}:${pose}`);
    }
  }
  const idleCrystal = rig.buildClipLayers('clawd', 'idle', 2, { crystal: true });
  assert.ok(idleCrystal.includes(rig.PROPS.iceCrystal), 'Clawd idle with crystal=true should mount iceCrystal');
});

test('classifyPairEncounter and stepMiniCrabCorridor model bump and pass-by mechanics deterministically', () => {
  assert.equal(typeof rig.classifyPairEncounter, 'function');
  assert.equal(typeof rig.stepMiniCrabCorridor, 'function');

  const headOn = rig.classifyPairEncounter({
    xA: 100,
    yA: 0,
    walkingA: true,
    dirA: 1,
    xB: 130,
    yB: 0,
    walkingB: true,
    dirB: -1,
    contactDist: 42,
  });
  assert.deepEqual(headOn, { kind: 'bump', sign: 1 });

  const soloPass = rig.classifyPairEncounter({
    xA: 100,
    yA: 0,
    walkingA: true,
    dirA: 1,
    xB: 126,
    yB: 0,
    walkingB: false,
    dirB: -1,
    contactDist: 42,
  });
  assert.deepEqual(soloPass, { kind: 'passBy', mover: 'A', stationary: 'B', dir: 1 });

  const overtake = rig.classifyPairEncounter({
    xA: 110,
    yA: 0,
    walkingA: true,
    dirA: 1,
    xB: 124,
    yB: 0,
    walkingB: true,
    dirB: 1,
    contactDist: 42,
  });
  assert.deepEqual(overtake, { kind: 'passBy', mover: 'A', stationary: 'B', dir: 1 });

  assert.equal(
    rig.classifyPairEncounter({ xA: 100, yA: 0, walkingA: true, dirA: 1, xB: 200, yB: 0, walkingB: true, dirB: -1 }),
    null
  );

  const boundaryCrabs = [{ id: 'cowboy', x: 3, px: 3, dir: -1, speed: 5 }];
  rig.stepMiniCrabCorridor(boundaryCrabs, { minX: 2, maxX: 120, nowTick: 1 });
  assert.equal(boundaryCrabs[0].px, 2);
  assert.equal(boundaryCrabs[0].dir, 1);

  const pairCrabs = [
    { id: 'cowboy', px: 50, dir: 1, speed: 2, blinkAt: -99 },
    { id: 'shades', px: 70, dir: -1, speed: 2, blinkAt: -99 },
  ];
  const ev1 = rig.stepMiniCrabCorridor(pairCrabs, { minX: 2, maxX: 220, contactDist: 26, nowTick: 10 });
  assert.equal(ev1.length, 1);
  assert.equal(ev1[0].type, 'crabBump');

  pairCrabs[0].px = 50;
  pairCrabs[0].dir = 1;
  pairCrabs[0].cooldownTick = -1;
  pairCrabs[0].bumpUntilTick = -1;
  pairCrabs[1].px = 70;
  pairCrabs[1].dir = -1;
  pairCrabs[1].cooldownTick = -1;
  pairCrabs[1].bumpUntilTick = -1;
  const ev2 = rig.stepMiniCrabCorridor(pairCrabs, { minX: 2, maxX: 220, contactDist: 26, nowTick: 25 });
  assert.equal(ev2.length, 1);
  assert.equal(ev2[0].type, 'crabPass');
});

test('static frame cache & adaptive heartbeat: skips redundant clearRect + style.transform writes, widens doze timer to 400ms, and pauses 100% when document.hidden', async () => {
  let clearRectCount = 0;
  let transformAssignCount = 0;
  const docListeners = new Map();

  function makeElem(tag, docRef) {
    const attrs = new Map();
    const listeners = new Map();
    const children = [];
    let _transform = '';
    const style = {
      display: '',
      zIndex: '',
      get transform() {
        return _transform;
      },
      set transform(v) {
        _transform = String(v);
        transformAssignCount += 1;
      },
    };
    const el = {
      tagName: String(tag).toUpperCase(),
      ownerDocument: docRef,
      clientWidth: 720,
      width: 96,
      height: 84,
      className: '',
      dataset: {},
      style,
      children,
      get firstChild() {
        return children[0] || null;
      },
      setAttribute(k, v) {
        attrs.set(k, String(v));
      },
      getAttribute(k) {
        return attrs.get(k) ?? null;
      },
      appendChild(ch) {
        children.push(ch);
        return ch;
      },
      removeChild(ch) {
        const i = children.indexOf(ch);
        if (i >= 0) children.splice(i, 1);
        return ch;
      },
      getBoundingClientRect() {
        return { left: 0, top: 0, right: 96, bottom: 84, width: 720, height: 84 };
      },
      addEventListener(type, fn) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(fn);
      },
      removeEventListener(type, fn) {
        listeners.get(type)?.delete(fn);
      },
      dispatch(type, evt = {}) {
        for (const fn of [...(listeners.get(type) || [])]) fn({ type, button: 0, preventDefault() {}, stopPropagation() {}, ...evt });
      },
      getContext(kind) {
        if (kind !== '2d') return null;
        return {
          imageSmoothingEnabled: false,
          fillStyle: '',
          save() {},
          restore() {},
          setTransform() {},
          clearRect() {
            clearRectCount += 1;
          },
          beginPath() {},
          rect() {},
          clip() {},
          translate() {},
          scale() {},
          rotate() {},
          fillRect() {},
          drawImage() {},
        };
      },
    };
    return el;
  }

  const mockDoc = {
    hidden: false,
    defaultView: {
      devicePixelRatio: 1,
      matchMedia: () => ({ matches: false }),
    },
    createElement(tag) {
      return makeElem(tag, mockDoc);
    },
    addEventListener(type, fn) {
      if (!docListeners.has(type)) docListeners.set(type, new Set());
      docListeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      docListeners.get(type)?.delete(fn);
    },
    dispatchDoc(type) {
      for (const fn of [...(docListeners.get(type) || [])]) fn({ type });
    },
  };

  const host = makeElem('div', mockDoc);
  const stage = rig.mountDualMascotStage(host, {
    camp: 'gemini',
    streaming: false,
    reducedMotion: false, // 挂载后前 2.4s 内无随机眨眼/微抖，直接测试活跃 100ms 心跳下的静态帧缓存命中
  });

  try {
    const snap0 = stage.getLayoutSnapshot();
    assert.equal(snap0.perf.timerIntervalMs, 100, 'Active heartbeat must run at 100ms');
    assert.equal(clearRectCount, 3, 'Initial mount draws both mascots + 1 static habitat prop once');
    assert.equal(transformAssignCount, 2, 'Initial mount writes initial style.transform once per mascot');

    // 等待 260ms（跨过 2 拍心跳）：因姿态、帧签名与坐标完全未变，必须 0 次 clearRect、0 次 style.transform 写入！
    await new Promise((r) => setTimeout(r, 260));
    const snapIdle = stage.getLayoutSnapshot();
    assert.equal(clearRectCount, 3, 'Unchanged idle frames must completely skip Canvas clearRect/redraw');
    assert.equal(transformAssignCount, 2, 'Stationary mascots must completely skip DOM style.transform writes');
    assert.ok(snapIdle.perf.canvasSkips >= 2, 'Must record skipped canvas redraws');
    assert.ok(snapIdle.perf.domTransformSkips >= 2, 'Must record skipped DOM transform writes');

    // 进入 dozing 打盹态 -> 定时器自动拉宽至 400ms！
    stage.triggerDemo('doze');
    const snapDoze = stage.getLayoutSnapshot();
    assert.equal(snapDoze.dozing, true);
    assert.equal(snapDoze.perf.timerIntervalMs, 400, 'Dozing state must widen heartbeat timer to 400ms');

    // 鼠标靠近舞台 -> 0ms 立即唤醒恢复 100ms 灵敏心跳！
    host.dispatch('pointerenter');
    const snapWoke = stage.getLayoutSnapshot();
    assert.equal(snapWoke.dozing, false);
    assert.equal(snapWoke.perf.timerIntervalMs, 100, 'Pointer approach must restore 100ms heartbeat in 0ms');

    // 再次进入打盹，验证打字同样瞬间唤醒 100ms
    stage.triggerDemo('doze');
    assert.equal(stage.getLayoutSnapshot().perf.timerIntervalMs, 400);
    stage.onUserType('hello!');
    assert.equal(stage.getLayoutSnapshot().perf.timerIntervalMs, 100, 'User typing must restore 100ms heartbeat in 0ms');

    // document.hidden = true -> 100% 暂停定时器（timerIntervalMs === 0）
    mockDoc.hidden = true;
    mockDoc.dispatchDoc('visibilitychange');
    const snapHidden = stage.getLayoutSnapshot();
    assert.equal(snapHidden.perf.timerPaused, true, 'document.hidden must pause heartbeat 100%');
    assert.equal(snapHidden.perf.timerIntervalMs, 0);

    const tickAtHide = snapHidden.actors[0].tick;
    await new Promise((r) => setTimeout(r, 240));
    assert.equal(stage.getLayoutSnapshot().actors[0].tick, tickAtHide, 'Zero ticks may fire while document.hidden');

    // 标签页恢复可见 -> 自动重启心跳
    mockDoc.hidden = false;
    mockDoc.dispatchDoc('visibilitychange');
    assert.equal(stage.getLayoutSnapshot().perf.timerPaused, false);
    assert.equal(stage.getLayoutSnapshot().perf.timerIntervalMs, 100);
  } finally {
    stage.dispose();
  }
});

function createInteractiveStageHarness(opts = {}) {
  const store = new Map(Object.entries(opts.initialStore || {}));
  const fillColors = new Map();

  function makeElem(tag, docRef) {
    const attrs = new Map();
    const listeners = new Map();
    const children = [];
    const style = {
      display: '',
      zIndex: '',
      transform: '',
      pointerEvents: '',
      cursor: '',
      touchAction: '',
    };
    const el = {
      tagName: String(tag).toUpperCase(),
      ownerDocument: docRef,
      clientWidth: opts.width || 720,
      width: 96,
      height: 84,
      className: '',
      dataset: {},
      style,
      children,
      get firstChild() {
        return children[0] || null;
      },
      setAttribute(k, v) {
        attrs.set(k, String(v));
      },
      getAttribute(k) {
        return attrs.get(k) ?? null;
      },
      appendChild(ch) {
        children.push(ch);
        return ch;
      },
      removeChild(ch) {
        const i = children.indexOf(ch);
        if (i >= 0) children.splice(i, 1);
        return ch;
      },
      getBoundingClientRect() {
        return { left: 0, top: 0, right: 96, bottom: 84, width: opts.width || 720, height: 84 };
      },
      addEventListener(type, fn) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(fn);
      },
      removeEventListener(type, fn) {
        listeners.get(type)?.delete(fn);
      },
      dispatch(type, evt = {}) {
        for (const fn of [...(listeners.get(type) || [])]) {
          fn({ type, button: 0, pointerId: 1, preventDefault() {}, stopPropagation() {}, ...evt });
        }
      },
      getContext(kind) {
        if (kind !== '2d') return null;
        return {
          imageSmoothingEnabled: false,
          _fill: '',
          get fillStyle() {
            return this._fill;
          },
          set fillStyle(v) {
            this._fill = String(v);
          },
          save() {},
          restore() {},
          setTransform() {},
          clearRect() {},
          beginPath() {},
          rect() {},
          clip() {},
          translate() {},
          scale() {},
          rotate() {},
          fillRect() {
            const key = el.dataset.miniCrab || el.className || 'canvas';
            if (!fillColors.has(key)) fillColors.set(key, new Set());
            fillColors.get(key).add(this._fill);
          },
          drawImage() {},
        };
      },
    };
    return el;
  }

  const localStorage = {
    getItem(k) {
      return store.has(k) ? store.get(k) : null;
    },
    setItem(k, v) {
      store.set(String(k), String(v));
    },
    removeItem(k) {
      store.delete(String(k));
    },
  };

  const mockDoc = {
    hidden: false,
    defaultView: {
      devicePixelRatio: 1,
      localStorage,
      matchMedia: () => ({ matches: false }),
    },
    createElement(tag) {
      return makeElem(tag, mockDoc);
    },
    addEventListener() {},
    removeEventListener() {},
  };

  const host = makeElem('div', mockDoc);
  const stage = rig.mountDualMascotStage(host, {
    camp: 'gemini',
    miniPileEnabled: opts.miniPileEnabled ?? true,
    reducedMotion: opts.reducedMotion ?? false,
  });

  const findActorEl = (id) => host.children.find((c) => c.getAttribute?.('data-mascot-id') === id);
  const findMiniEl = (id) => {
    const group = host.children.find((c) => c.className === 'ag-v2-mini-pile');
    return group?.children.find((c) => c.dataset?.miniCrab === id) || null;
  };

  return { host, stage, store, fillColors, findActorEl, findMiniEl };
}

test('resolveGroundSeparation enforces >= 6px rigid-body clear gap across all 5 pets without overlap', () => {
  const crowded = [
    { id: 'cat', cx: 300, halfW: 22 },
    { id: 'clawd', cx: 300, halfW: 22 },
    { id: 'cowboy', cx: 300, halfW: 13 },
    { id: 'shades', cx: 301, halfW: 13 },
    { id: 'wizard', cx: 299, halfW: 13 },
  ];
  rig.resolveGroundSeparation(crowded, 14, 706, 6);
  const sorted = [...crowded].sort((a, b) => a.cx - b.cx);
  for (let i = 0; i < sorted.length; i++) {
    assert.ok(sorted[i].cx - sorted[i].halfW >= 13.99, 'Must stay inside left stage bound');
    assert.ok(sorted[i].cx + sorted[i].halfW <= 706.01, 'Must stay inside right stage bound');
    if (i < sorted.length - 1) {
      const gap = sorted[i + 1].cx - sorted[i].cx - (sorted[i].halfW + sorted[i + 1].halfW);
      assert.ok(gap >= 5.95, `Expected >= 6px clear gap between ${sorted[i].id} and ${sorted[i + 1].id}, got ${gap}`);
    }
  }

  // 验证真实 5 宠舞台拖拽同位松手后自动刚体推挤防重叠
  const { stage, findActorEl } = createInteractiveStageHarness({ miniPileEnabled: true, reducedMotion: true });
  try {
    const snap0 = stage.getLayoutSnapshot();
    const clawdCx = snap0.actors.find((a) => a.id === 'clawd').worldCx;
    const catCx = snap0.actors.find((a) => a.id === 'cat').worldCx;
    const catEl = findActorEl('cat');
    // 将 cat 直接拖到与 clawd 完全重合的地面位置松手
    catEl.dispatch('pointerdown', { clientX: catCx, clientY: 80 });
    catEl.dispatch('pointermove', { clientX: clawdCx, clientY: 80 });
    catEl.dispatch('pointerup', { clientX: clawdCx, clientY: 80 });

    const snap1 = stage.getLayoutSnapshot();
    const grounded = [
      ...snap1.actors.map((a) => ({ id: a.id, cx: a.worldCx, hw: 22 })),
      ...snap1.minis.map((m) => ({ id: m.id, cx: m.worldCx, hw: 13 })),
    ].sort((a, b) => a.cx - b.cx);
    for (let i = 0; i < grounded.length - 1; i++) {
      const clearGap = grounded[i + 1].cx - grounded[i].cx - (grounded[i].hw + grounded[i + 1].hw);
      assert.ok(clearGap >= 5.5, `Grounded pets ${grounded[i].id} & ${grounded[i + 1].id} must not overlap (gap=${clearGap})`);
    }
  } finally {
    stage.dispose();
  }
});

test('obstacle encounters support parabolic leapfrog (~26px peak), autoPerch hitchhike, and greetTurn reversal', async () => {
  assert.equal(rig.chooseObstacleAction({ canLeap: true, canPerch: true, roll: 0.2 }), 'leapfrog');
  assert.equal(rig.chooseObstacleAction({ canLeap: true, canPerch: true, roll: 0.55 }), 'autoPerch');
  assert.equal(rig.chooseObstacleAction({ canLeap: true, canPerch: true, roll: 0.9 }), 'greetTurn');
  assert.equal(rig.chooseObstacleAction({ canLeap: false, canPerch: false, roll: 0.1 }), 'greetTurn');

  const { stage } = createInteractiveStageHarness({ miniPileEnabled: true, reducedMotion: false });
  try {
    // (a) 抛物线撑跳越过（leapfrog）：跃起峰值约 ~26px，落地到伙伴另一侧
    stage.triggerDemo('leapfrog');
    let minArcY = 0;
    for (let i = 0; i < 8; i++) {
      await new Promise((r) => setTimeout(r, 95));
      const cat = stage.getLayoutSnapshot().actors.find((a) => a.id === 'cat');
      if (cat.y < minArcY) minArcY = cat.y;
    }
    assert.ok(minArcY <= -20 && minArcY >= -30, `Leapfrog parabolic arc peak should be ~26px, observed ${-minArcY}px`);
    const afterLeap = stage.getLayoutSnapshot();
    const catAfter = afterLeap.actors.find((a) => a.id === 'cat');
    const clawdAfter = afterLeap.actors.find((a) => a.id === 'clawd');
    assert.ok(catAfter.worldCx > clawdAfter.worldCx + 44, 'Cat must land cleanly on the far side of Clawd after leapfrog');

    // (b) 顺势跳上头顶搭便车（autoPerch）：底座散步驮着上层同步位移
    stage.triggerDemo('autoPerch');
    await new Promise((r) => setTimeout(r, 680));
    const perched = stage.getLayoutSnapshot();
    const catP = perched.actors.find((a) => a.id === 'cat');
    const clawdP = perched.actors.find((a) => a.id === 'clawd');
    assert.equal(catP.stackedOn, 'clawd', 'AutoPerch must land cat onto Clawd head');
    const startBaseCx = clawdP.worldCx;
    await new Promise((r) => setTimeout(r, 320));
    const movedSnap = stage.getLayoutSnapshot();
    const catMoved = movedSnap.actors.find((a) => a.id === 'cat');
    const clawdMoved = movedSnap.actors.find((a) => a.id === 'clawd');
    assert.notEqual(clawdMoved.worldCx, startBaseCx, 'Walking base must carry the stack forward');
    assert.equal(catMoved.worldCx, clawdMoved.worldCx, 'Perched rider must move in lockstep with walking base');

    // (c) 驻足礼貌互动后转身（greetTurn）
    stage.triggerDemo('unstack');
    const act = stage.triggerObstacle('cowboy', 'clawd', 'greetTurn');
    assert.equal(act, 'greetTurn');
    assert.equal(stage.getLayoutSnapshot().lastInteraction.type, 'greetTurn');
  } finally {
    stage.dispose();
  }
});

test('multi-tier totem stack (up to 5 tiers), pointer drag stacking, pull-out gravity settle, and vigorous side-hop dismount', async () => {
  const { stage, findMiniEl } = createInteractiveStageHarness({ miniPileEnabled: true, reducedMotion: false });
  try {
    // 1. 构建 4 层混搭图腾塔：clawd -> cowboy -> cat -> shades，再用鼠标指针拖拽 wizard 叠上第 5 层！
    assert.equal(stage.stackOnto('cowboy', 'clawd'), true);
    assert.equal(stage.stackOnto('cat', 'cowboy'), true);
    assert.equal(stage.stackOnto('shades', 'cat'), true);

    const snap4 = stage.getLayoutSnapshot();
    const shadesSnap = snap4.minis.find((m) => m.id === 'shades');
    const wizSnap0 = snap4.minis.find((m) => m.id === 'wizard');
    const wizEl = findMiniEl('wizard');

    // 模拟真实鼠标拖拽第 5 只迷你蟹 wizard 到塔顶 shades 头顶（perchY = shades.y - 16）悬停稳放松手
    const targetDropY = shadesSnap.y - 16;
    wizEl.dispatch('pointerdown', { clientX: wizSnap0.worldCx, clientY: 100 });
    wizEl.dispatch('pointermove', { clientX: shadesSnap.worldCx, clientY: 100 + targetDropY });
    await new Promise((r) => setTimeout(r, 45));
    wizEl.dispatch('pointerup', { clientX: shadesSnap.worldCx, clientY: 100 + targetDropY });

    const snap5 = stage.getLayoutSnapshot();
    assert.deepEqual(snap5.towers, [['clawd', 'cowboy', 'cat', 'shades', 'wizard']], '5-pet mode must support full 5-tier mixed totem stack');

    // 2. 抽走中间层 'cowboy'：上方 ['cat', 'shades', 'wizard'] 受重力顺滑下落补位，扣合在 'clawd' 头顶重组为 4 层塔！
    stage.pullFromStack('cowboy', 'settle');
    await new Promise((r) => setTimeout(r, 340));
    const snapSettledMid = stage.getLayoutSnapshot();
    assert.deepEqual(
      snapSettledMid.towers,
      [['clawd', 'cat', 'shades', 'wizard']],
      'Upper sub-tower must smoothly gravity-settle onto lower holder after middle pet is pulled out'
    );

    // 3. 抽走最底层底座 'clawd'：上方子塔 ['cat', 'shades', 'wizard'] 顺滑落回地面 y=0！
    stage.pullFromStack('clawd', 'settle');
    await new Promise((r) => setTimeout(r, 360));
    const snapSettledBottom = stage.getLayoutSnapshot();
    assert.deepEqual(
      snapSettledBottom.towers,
      [['cat', 'shades', 'wizard']],
      'Upper sub-tower must remain intact and settle smoothly onto ground when base is pulled out'
    );
    const catBase = snapSettledBottom.actors.find((a) => a.id === 'cat');
    assert.equal(catBase.y, 0, 'New root cat must settle cleanly on ground y=0');

    // 4. 剧烈动作（如 onFire）触发上方骑乘者轻巧侧跳落地解绑
    stage.triggerDemo('fire');
    await new Promise((r) => setTimeout(r, 450));
    const snapAfterFire = stage.getLayoutSnapshot();
    assert.deepEqual(snapAfterFire.towers, [], 'Vigorous action on base must dismount riders safely to ground');
  } finally {
    stage.dispose();
  }
});

test('three-stage chromaResonance state machine, diagonal spectrum flow, crystal ear glints, persistence, and 4-tap toggle', () => {
  // 验证对角线色相梯度与暗部体块阴影插值
  const cA = rig.evalChromaColorAt(2, 2, 0.1, false);
  const cB = rig.evalChromaColorAt(9, 6, 0.1, false);
  const cShadow = rig.evalChromaColorAt(2, 2, 0.1, true);
  assert.match(cA, /^#[0-9a-f]{6}$/);
  assert.notEqual(cA, cB, 'Chroma coat must vary diagonally across (gx + gy)');
  assert.notEqual(cA, cShadow, 'Shadow pixels must use darkened matching hue for blocky volume');

  const h1 = createInteractiveStageHarness({ miniPileEnabled: true, reducedMotion: false });
  try {
    // 搭起 3 层塔（clawd -> cowboy -> cat），但在前置编码门禁达成前连点 4 次绝不误触发
    h1.stage.stackOnto('cowboy', 'clawd');
    h1.stage.stackOnto('cat', 'cowboy');
    for (let i = 0; i < 4; i++) h1.stage.poke('cat');
    assert.equal(h1.stage.getLayoutSnapshot().chromaResonance.active, false, 'Must not awaken before both session gates');

    // 达成 Gate 1（算力调谐）+ Gate 2（编码锻造）
    h1.stage.notify('model-shift');
    h1.stage.notify('code-copied');
    const gated = h1.stage.getLayoutSnapshot().chromaResonance;
    assert.equal(gated.tuned, true);
    assert.equal(gated.forged, true);
    assert.equal(gated.active, false);

    // Gate 3：在 >=3 层叠塔态 1.8s 内连点小紫猫 4 次 -> 迸发 12 粒棱镜像素星屑并觉醒！
    for (let i = 0; i < 4; i++) h1.stage.poke('cat');
    const awakened = h1.stage.getLayoutSnapshot();
    assert.equal(awakened.chromaResonance.active, true, '4 taps in 3-tier tower after gates must awaken chromaResonance');
    assert.ok(awakened.chromaResonance.sparkCount >= 12, 'Awakening must burst >= 12 four-color prismatic sparks');
    assert.equal(h1.store.get('__op_chroma_v1'), '1', 'Must persist unlocked state to __op_chroma_v1');

    const catCanvasColors = h1.fillColors.get('ag-v2-mascot-canvas') || new Set();
    assert.ok(
      [...catCanvasColors].some((c) => c.toUpperCase() === '#FFFFFF'),
      'Chroma cat must paint pure #FFFFFF crystal ear glints'
    );

    // 验证跨会话重挂载自动恢复炫彩形态，且叠塔连点 4 次可自由切回原色紫猫
    const h2 = createInteractiveStageHarness({
      miniPileEnabled: false,
      reducedMotion: false,
      initialStore: { __op_chroma_v1: '1' },
    });
    try {
      assert.equal(h2.stage.getLayoutSnapshot().chromaResonance.active, true, 'Saved __op_chroma_v1=1 must restore on mount');
      // 双宠模式下叠成 2 层塔，连点 4 次切回原色紫猫
      h2.stage.stackOnto('cat', 'clawd');
      for (let i = 0; i < 4; i++) h2.stage.poke('cat');
      assert.equal(h2.stage.getLayoutSnapshot().chromaResonance.active, false, '4 taps in tower must toggle off back to classic purple coat');
      assert.equal(h2.store.has('__op_chroma_v1'), false, 'Toggling off must clear __op_chroma_v1');
    } finally {
      h2.stage.dispose();
    }
  } finally {
    h1.stage.dispose();
  }
});

test('high-rate pointer dragging of mini-crabs and main actors disables CSS transition lag and writes subpixel GPU transforms directly', () => {
  const { host, stage, findMiniEl, findActorEl } = createInteractiveStageHarness({ miniPileEnabled: true, reducedMotion: false });
  try {
    let rectReadsDuringMove = 0;
    const origRect = host.getBoundingClientRect;
    host.getBoundingClientRect = () => {
      rectReadsDuringMove += 1;
      return origRect();
    };

    const miniEl = findMiniEl('cowboy');
    const snap0 = stage.getLayoutSnapshot().minis.find((m) => m.id === 'cowboy');
    miniEl.dispatch('pointerdown', { clientX: snap0.worldCx, clientY: 100 });
    rectReadsDuringMove = 0;

    // 模拟 1000Hz 电竞鼠标连续亚像素微移
    miniEl.dispatch('pointermove', { clientX: snap0.worldCx + 8.37, clientY: 91.64 });
    miniEl.dispatch('pointermove', { clientX: snap0.worldCx + 14.73, clientY: 84.28 });
    assert.equal(rectReadsDuringMove, 0, 'pointermove must perform 0 synchronous getBoundingClientRect reflows');
    assert.equal(miniEl.getAttribute('data-direct'), '1', 'Dragging mini-crab must lock data-direct="1" to bypass 180ms steps(2,end) CSS transition');
    assert.equal(miniEl.style.transition, 'none', 'Inline transition must be none during drag');
    assert.match(miniEl.style.transform, /\d+\.\d+px/, 'Subpixel coordinates must stream directly without coarse integer rounding lag');

    miniEl.dispatch('pointerup', { clientX: snap0.worldCx + 14.73, clientY: 84.28 });

    // Mascot elements must never expose hover title tooltips
    const clawdEl = findActorEl('clawd');
    const catEl = findActorEl('cat');
    assert.equal(clawdEl.getAttribute('title'), null, 'Clawd must never show hover title tooltip');
    assert.equal(catEl.getAttribute('title'), null, 'Cat must never show hover title tooltip');
    assert.equal(miniEl.getAttribute('title'), null, 'Mini crabs must never show hover title tooltip');

    // 主宠同步验证零重排与直通锁
    const catCx0 = stage.getLayoutSnapshot().actors.find((a) => a.id === 'cat').worldCx;
    catEl.dispatch('pointerdown', { clientX: catCx0, clientY: 100 });
    rectReadsDuringMove = 0;
    catEl.dispatch('pointermove', { clientX: catCx0 - 12.42, clientY: 88.15 });
    assert.equal(rectReadsDuringMove, 0, 'Actor pointermove must also perform 0 getBoundingClientRect reflows');
    assert.equal(catEl.getAttribute('data-direct'), '1');
    assert.equal(catEl.style.transition, 'none');
    catEl.dispatch('pointerup', { clientX: catCx0 - 12.42, clientY: 88.15 });
  } finally {
    stage.dispose();
  }
});

test('reducedMotion pauses idle heartbeat to 0fps (timerIntervalMs=0) and revives 100ms heartbeat on setState unfreeze', () => {
  const h = createInteractiveStageHarness({ miniPileEnabled: true, reducedMotion: false });
  try {
    assert.equal(h.stage.getLayoutSnapshot().perf.timerIntervalMs, 100);
    assert.equal(h.stage.getLayoutSnapshot().perf.timerPaused, false);

    // 切换全局禁动效 reducedMotion: true（非流式忙碌态）-> 立即停表至 0fps
    h.stage.setState({ reducedMotion: true });
    const pausedSnap = h.stage.getLayoutSnapshot();
    assert.equal(pausedSnap.reducedMotion, true);
    assert.equal(pausedSnap.perf.timerIntervalMs, 0, 'Idle reducedMotion must stop 100ms heartbeat to 0fps');
    assert.equal(pausedSnap.perf.timerPaused, true);

    // 在 reducedMotion (motionLevel='off') 下即使进入流式忙碌态，仍保持 0fps 停摆并同步一次单帧姿态
    h.stage.setState({ streaming: true });
    assert.equal(h.stage.getLayoutSnapshot().perf.timerIntervalMs, 0);
    assert.equal(h.stage.getLayoutSnapshot().perf.timerPaused, true);
    h.stage.setState({ streaming: false });
    assert.equal(h.stage.getLayoutSnapshot().perf.timerIntervalMs, 0);

    // 从 reducedMotion: true 解冻切回 false -> 立即复活 100ms 心跳，绝不僵死！
    h.stage.setState({ reducedMotion: false });
    const revivedSnap = h.stage.getLayoutSnapshot();
    assert.equal(revivedSnap.reducedMotion, false);
    assert.equal(revivedSnap.perf.timerIntervalMs, 100, 'Unfreezing reducedMotion must revive 100ms heartbeat immediately');
    assert.equal(revivedSnap.perf.timerPaused, false);
  } finally {
    h.stage.dispose();
  }
});

test('OP-1 & OP-3 regressions: streamDone error worry pose, window blur drag release, dynamic DPR resize & clean DOM dispose', () => {
  const winListeners = new Map();
  const mockWin = {
    devicePixelRatio: 1,
    matchMedia: () => ({ matches: false }),
    addEventListener(type, fn) {
      if (!winListeners.has(type)) winListeners.set(type, new Set());
      winListeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      winListeners.get(type)?.delete(fn);
    },
    dispatch(type) {
      for (const fn of [...(winListeners.get(type) || [])]) fn({ type });
    },
  };
  const makeNode = (tag) => {
    const listeners = new Map();
    const attrs = new Map();
    const children = [];
    return {
      tagName: tag.toUpperCase(),
      ownerDocument: null,
      clientWidth: 720,
      width: 96,
      height: 84,
      className: '',
      dataset: {},
      style: {},
      children,
      get firstChild() { return children[0] || null; },
      setAttribute(k, v) { attrs.set(k, String(v)); },
      getAttribute(k) { return attrs.get(k) ?? null; },
      removeAttribute(k) { attrs.delete(k); },
      appendChild(c) { children.push(c); return c; },
      removeChild(c) { const i = children.indexOf(c); if (i >= 0) children.splice(i, 1); return c; },
      getBoundingClientRect: () => ({ left: 0, top: 0, right: 720, bottom: 84, width: 720, height: 84 }),
      addEventListener(t, f) { if (!listeners.has(t)) listeners.set(t, new Set()); listeners.get(t).add(f); },
      removeEventListener(t, f) { listeners.get(t)?.delete(f); },
      dispatch(t, ev = {}) { for (const fn of [...(listeners.get(t) || [])]) fn({ type: t, button: 0, preventDefault() {}, stopPropagation() {}, ...ev }); },
      getContext: (k) => k === '2d' ? { save() {}, restore() {}, setTransform() {}, clearRect() {}, beginPath() {}, rect() {}, clip() {}, translate() {}, scale() {}, rotate() {}, fillRect() {}, drawImage() {} } : null,
    };
  };
  const doc = {
    hidden: false,
    defaultView: mockWin,
    createElement(tag) {
      const n = makeNode(tag);
      n.ownerDocument = doc;
      return n;
    },
    addEventListener() {},
    removeEventListener() {},
  };
  const hostEl = doc.createElement('div');
  const stage = rig.mountDualMascotStage(hostEl, { miniPileEnabled: true, reducedMotion: true });

  // 1. Error termination sets 'worry' + 'sweat' instead of celebrating
  stage.notify('streamDone', { error: true });
  const errSnap = stage.getLayoutSnapshot();
  assert.ok(errSnap.actors.every((a) => a.pose === 'worry' && a.sym === 'sweat'));

  // 2. Dynamic multi-monitor DPR change resizes actor & mini-crab canvases on next render
  const catActorEl = hostEl.children.find((n) => n.getAttribute('data-mascot-id') === 'cat');
  assert.equal(catActorEl.children[0].width, 96);
  mockWin.devicePixelRatio = 2;
  stage.notify('activity');
  stage.setState({ camp: 'claude' });
  assert.equal(catActorEl.children[0].width, 192, 'Actor canvas must rescale to 2x DPR when moved across displays');

  // 3. Window blur during active drag releases dragging state and settles back to ground
  catActorEl.dispatch('pointerdown', { clientX: 600, clientY: 80 });
  catActorEl.dispatch('pointermove', { clientX: 120, clientY: 40 });
  assert.equal(catActorEl.getAttribute('data-dragging'), '1');
  mockWin.dispatch('blur');
  assert.equal(catActorEl.getAttribute('data-dragging'), null, 'Window blur must release mid-air drag lock');
  assert.equal(stage.getLayoutSnapshot().actors.find((a) => a.id === 'cat').footY, 0);

  // 4. dispose() removes all mounted DOM subtrees from hostEl (includes .ag-v2-habitat-prop)
  assert.equal(hostEl.children.length, 5);
  stage.dispose();
  assert.equal(hostEl.children.length, 0, 'dispose() must detach all stage children from hostEl');
});

test('Issue #1 & perf guard: dual mascots (cat + clawd) track side-panel push/drag-snap/close-rebound via rAF, skip unaffected pets, and pulse bar uses 0-reflow ResizeObserver tiers', async () => {
  const winListeners = new Map();
  let roCb = null, roDisconnected = false, rafQueue = [], passiveCount = 0;
  const prevRO = globalThis.ResizeObserver;
  class FakeRO {
    constructor(cb) { roCb = cb; }
    observe() {}
    disconnect() { roDisconnected = true; }
  }
  globalThis.ResizeObserver = FakeRO;
  const mockWin = {
    devicePixelRatio: 1,
    ResizeObserver: FakeRO,
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame(fn) { rafQueue.push(fn); return rafQueue.length; },
    cancelAnimationFrame() {},
    addEventListener(type, fn, opts) {
      if (opts && typeof opts === 'object' && opts.passive) passiveCount++;
      if (!winListeners.has(type)) winListeners.set(type, new Set());
      winListeners.get(type).add(fn);
    },
    removeEventListener(type, fn) { winListeners.get(type)?.delete(fn); },
    dispatch(type) { for (const fn of [...(winListeners.get(type) || [])]) fn({ type }); },
  };
  const flushRaf = () => { const q = rafQueue.splice(0); for (const fn of q) fn(performance.now()); };
  const makeNode = (tag) => {
    const listeners = new Map(), attrs = new Map(), children = [];
    const node = {
      nodeType: 1,
      tagName: tag.toUpperCase(),
      ownerDocument: null,
      width: 96,
      height: 84,
      className: '',
      dataset: {},
      style: {},
      children,
      get firstChild() { return children[0] || null; },
      setAttribute(k, v) { attrs.set(k, String(v)); },
      getAttribute(k) { return attrs.get(k) ?? null; },
      removeAttribute(k) { attrs.delete(k); },
      appendChild(c) { children.push(c); return c; },
      removeChild(c) { const i = children.indexOf(c); if (i >= 0) children.splice(i, 1); return c; },
      getBoundingClientRect: () => ({ left: 0, top: 0, right: 720, bottom: 84, width: 720, height: 84 }),
      addEventListener(t, f) { if (!listeners.has(t)) listeners.set(t, new Set()); listeners.get(t).add(f); },
      removeEventListener(t, f) { listeners.get(t)?.delete(f); },
      getContext: (k) => k === '2d' ? { save() {}, restore() {}, setTransform() {}, clearRect() {}, beginPath() {}, rect() {}, clip() {}, translate() {}, scale() {}, rotate() {}, fillRect() {}, drawImage() {} } : null,
    };
    return node;
  };
  const doc = { hidden: false, defaultView: mockWin, createElement(tag) { const n = makeNode(tag); n.ownerDocument = doc; return n; }, addEventListener() {}, removeEventListener() {} };
  const hostEl = doc.createElement('div');
  Object.setPrototypeOf(hostEl, { get clientWidth() { return 720; } });

  try {
    const stage = rig.mountDualMascotStage(hostEl, { miniPileEnabled: false, reducedMotion: true });
    assert.ok(roCb, 'Must attach ResizeObserver to stage host');
    assert.ok(passiveCount >= 3, 'Window pointer listeners must be passive');

    const snap0 = stage.getLayoutSnapshot();
    const cat0 = snap0.actors.find((a) => a.id === 'cat').x;
    const clawd0 = snap0.actors.find((a) => a.id === 'clawd').x;
    const draws0 = snap0.perf.canvasDraws;

    // 1) Side panel widens (stage shrinks 720 -> 360): BOTH cat & clawd get pushed left cleanly in a single rAF batch
    roCb([{ contentRect: { width: 520 } }]);
    roCb([{ contentRect: { width: 360 } }]);
    assert.equal(rafQueue.length, 1, 'Multiple ResizeObserver ticks in same frame must coalesce into 1 rAF');
    flushRaf();
    const snapNarrow = stage.getLayoutSnapshot();
    const catN = snapNarrow.actors.find((a) => a.id === 'cat').x;
    const clawdN = snapNarrow.actors.find((a) => a.id === 'clawd').x;
    assert.ok(catN < cat0 - 150 && clawdN < clawd0 - 150, `Both cat (${cat0}->${catN}) and clawd (${clawd0}->${clawdN}) must be pushed left`);
    assert.equal(snapNarrow.perf.canvasDraws, draws0, 'Side-panel push only updates GPU translate3d and must not trigger redundant canvasDraws');

    // 2) Dragging side panel back right (pointerdown active): BOTH follow right edge smoothly
    mockWin.dispatch('pointerdown');
    roCb([{ contentRect: { width: 500 } }]);
    flushRaf();
    const snapMid = stage.getLayoutSnapshot();
    assert.ok(snapMid.actors.find((a) => a.id === 'cat').x > catN + 80, 'cat must snap-follow right edge during drag');
    assert.ok(snapMid.actors.find((a) => a.id === 'clawd').x > clawdN + 80, 'clawd must snap-follow right edge during drag');
    assert.equal(snapMid.perf.canvasDraws, draws0, 'Side-panel drag-snap must not trigger redundant canvasDraws');

    // 3) Closing side panel (pointerup + wide jump to 720): BOTH rebound back to original right-side positions
    mockWin.dispatch('pointerup');
    roCb([{ contentRect: { width: 620 } }]);
    flushRaf();
    roCb([{ contentRect: { width: 720 } }]);
    flushRaf();
    await new Promise((r) => setTimeout(r, 340));
    const snapBack = stage.getLayoutSnapshot();
    assert.ok(Math.abs(snapBack.actors.find((a) => a.id === 'cat').x - cat0) <= 6, 'cat must rebound back to original right position');
    assert.ok(Math.abs(snapBack.actors.find((a) => a.id === 'clawd').x - clawd0) <= 6, 'clawd must rebound back to original right position');

    // 4) Clean dispose removes ResizeObserver & all passive window listeners
    stage.dispose();
    assert.equal(roDisconnected, true, 'dispose() must disconnect ResizeObserver');
    assert.equal((winListeners.get('pointerdown')?.size || 0), 0, 'dispose() must remove pointerdown listener');
  } finally {
    globalThis.ResizeObserver = prevRO;
  }

  // 5) Verify inline-fallback 5-tier 0-reflow ResizeObserver behavior
  const fbMod = require('../vendor/pulse-dashboard/inline-fallback.js');
  let ftRoCb = null, rectCalls = 0, ftRoDisc = false;
  class PulseRO {
    constructor(cb) { ftRoCb = cb; }
    observe() {}
    disconnect() { ftRoDisc = true; }
  }
  const ftAttrs = new Map(), barAttrs = new Map();
  const footer = {
    isConnected: true, className: 'agy-composer-footer', hidden: false, children: [],
    getAttribute: (k) => ftAttrs.get(k) ?? null,
    setAttribute: (k, v) => ftAttrs.set(k, String(v)),
    removeAttribute: (k) => ftAttrs.delete(k),
    getBoundingClientRect: () => { rectCalls++; return { width: 700, height: 30 }; },
    appendChild(c) { this.children.push(c); c.parentElement = this; },
    closest: () => null,
  };
  let injectedTierCss = '';
  const extBar = {
    id: 'ag-pulse-status-bar', isConnected: true, hidden: false,
    shadowRoot: { querySelector: () => null, appendChild(el) { if (el?.textContent) injectedTierCss = el.textContent; } },
    getAttribute: (k) => barAttrs.get(k) ?? null,
    setAttribute: (k, v) => barAttrs.set(k, String(v)),
    removeAttribute: (k) => barAttrs.delete(k),
    getBoundingClientRect: () => ({ width: 180, height: 24 }),
  };
  const pDoc = {
    hidden: false,
    documentElement: { getAttribute: () => 'zh-CN' },
    body: {},
    createElement: (tag) => ({ tagName: tag, setAttribute() {}, textContent: '' }),
    querySelector: (sel) => (sel.includes('agy-composer-footer') ? footer : sel.includes('conversation-view') ? {} : null),
    querySelectorAll: (sel) => (sel.includes('ag-pulse-status-bar') ? [extBar] : []),
    contains: () => true,
  };
  const pWin = {
    document: pDoc,
    location: { pathname: '/c/11111111-2222-3333-4444-555555555555' },
    ResizeObserver: PulseRO,
    addEventListener() {},
    removeEventListener() {},
  };
  const ctl = fbMod.createTelemetryController({ window: pWin, document: pDoc });
  ctl.sync({ telemetryModule: 'auto', language: 'zh-CN' });
  assert.equal(ftAttrs.get('data-t'), '0');
  const callsAfterInit = rectCalls;
  ftRoCb([{ contentRect: { width: 610 } }]);
  assert.equal(ftAttrs.get('data-t'), '1');
  ftRoCb([{ contentRect: { width: 340 } }]);
  assert.equal(ftAttrs.get('data-t'), '1 2 3 4 5');
  assert.equal(barAttrs.get('data-t'), '1 2 3 4 5');
  assert.equal(rectCalls, callsAfterInit, 'ResizeObserver path must use contentRect.width with 0 getBoundingClientRect reflows');
  assert.equal(/(?<![a-z-])width:0!important/.test(injectedTierCss), false, 'TIER_CSS must not use non-interpolable width:0!important');
  assert.equal(injectedTierCss.includes('flex:0 0 0!important'), false, 'TIER_CSS must not use non-interpolable flex:0 0 0!important');
  assert.ok(injectedTierCss.includes('transform:scale(1.27)'), 'Tier 5 context-ring must scale via GPU transform');
  ctl.destroy();
  assert.equal(ftRoDisc, true, 'destroy() must disconnect pulse ResizeObserver');
});

test('Red-team regressions: wide rebound (reducedMotion=false), narrower restore order, mini tower syncTower, TIER_CSS specificity, and late/rebuild ResizeObserver rebind', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { performance } = require('node:perf_hooks');

  // Helper to mount a stage with controllable ResizeObserver + rAF
  const createStageHarness = (initW, opts = {}) => {
    let roCb = null;
    let curW = initW;
    const rafQueue = [];
    const winListeners = new Map();
    const prevRO = globalThis.ResizeObserver;
    class TestRO {
      constructor(cb) { roCb = cb; }
      observe() {}
      disconnect() {}
    }
    globalThis.ResizeObserver = TestRO;
    const mockWin = {
      devicePixelRatio: 1,
      ResizeObserver: TestRO,
      matchMedia: () => ({ matches: false }),
      requestAnimationFrame(fn) { rafQueue.push(fn); return rafQueue.length; },
      cancelAnimationFrame() {},
      addEventListener(type, fn) {
        if (!winListeners.has(type)) winListeners.set(type, new Set());
        winListeners.get(type).add(fn);
      },
      removeEventListener(type, fn) { winListeners.get(type)?.delete(fn); },
    };
    const makeNode = (tag) => {
      const listeners = new Map(), attrs = new Map(), children = [];
      return {
        nodeType: 1,
        tagName: tag.toUpperCase(),
        ownerDocument: null,
        width: 96,
        height: 84,
        className: '',
        dataset: {},
        style: {},
        children,
        get firstChild() { return children[0] || null; },
        setAttribute(k, v) { attrs.set(k, String(v)); },
        getAttribute(k) { return attrs.get(k) ?? null; },
        removeAttribute(k) { attrs.delete(k); },
        appendChild(c) { children.push(c); return c; },
        removeChild(c) { const i = children.indexOf(c); if (i >= 0) children.splice(i, 1); return c; },
        getBoundingClientRect: () => ({ left: 0, top: 0, right: curW, bottom: 84, width: curW, height: 84 }),
        addEventListener(t, f) { if (!listeners.has(t)) listeners.set(t, new Set()); listeners.get(t).add(f); },
        removeEventListener(t, f) { listeners.get(t)?.delete(f); },
        getContext: (k) => (k === '2d' ? { save() {}, restore() {}, setTransform() {}, clearRect() {}, beginPath() {}, rect() {}, clip() {}, translate() {}, scale() {}, rotate() {}, fillRect() {}, drawImage() {} } : null),
      };
    };
    const doc = {
      hidden: false,
      defaultView: mockWin,
      createElement(tag) { const n = makeNode(tag); n.ownerDocument = doc; return n; },
      addEventListener() {},
      removeEventListener() {},
    };
    const hostEl = doc.createElement('div');
    Object.setPrototypeOf(hostEl, { get clientWidth() { return curW; } });
    const stage = rig.mountDualMascotStage(hostEl, { miniPileEnabled: Boolean(opts.miniPileEnabled), reducedMotion: Boolean(opts.reducedMotion) });
    const resizeTo = (nextW) => {
      curW = nextW;
      roCb([{ contentRect: { width: nextW } }]);
      const q = rafQueue.splice(0);
      for (const fn of q) fn(performance.now());
    };
    const flushBallistic = async (steps = 90) => {
      let now = performance.now();
      for (let i = 0; i < steps && rafQueue.length > 0; i++) {
        now += 16.7;
        const q = rafQueue.splice(0);
        for (const fn of q) fn(now);
      }
    };
    const waitRebound = async (pred, maxMs = 1200) => {
      const deadline = Date.now() + maxMs;
      await new Promise((r) => setTimeout(r, 200));
      while (Date.now() < deadline) {
        await flushBallistic(100);
        if (!pred || pred(stage.getLayoutSnapshot())) return;
        await new Promise((r) => setTimeout(r, 25));
      }
      await flushBallistic(100);
    };
    const cleanup = () => {
      stage.dispose();
      globalThis.ResizeObserver = prevRO;
    };
    return { stage, resizeTo, flushBallistic, waitRebound, cleanup };
  };

  // ① reducedMotion: false wide screen (1100 -> 360 -> 1100) rebounds accurately without stalling at 351px
  {
    const h = createStageHarness(1100, { miniPileEnabled: false, reducedMotion: false });
    try {
      const snap0 = h.stage.getLayoutSnapshot();
      const cat0 = snap0.actors.find((a) => a.id === 'cat').x;
      const clawd0 = snap0.actors.find((a) => a.id === 'clawd').x;
      assert.ok(cat0 > 950 && clawd0 > 880, `Wide stage should place mascots near right edge (cat=${cat0}, clawd=${clawd0})`);

      h.resizeTo(360);
      const snapN = h.stage.getLayoutSnapshot();
      assert.ok(snapN.actors.find((a) => a.id === 'clawd').x <= 270, 'Clawd must push left at 360px');

      // Multi-step expand with debounce reset
      h.resizeTo(700);
      await new Promise((r) => setTimeout(r, 60));
      h.resizeTo(1100);
      await h.waitRebound((s) => {
        const cb = s.actors.find((a) => a.id === 'cat').x;
        const db = s.actors.find((a) => a.id === 'clawd').x;
        return Math.abs(cb - cat0) <= 2 && Math.abs(db - clawd0) <= 2;
      });

      const snapBack = h.stage.getLayoutSnapshot();
      const catBack = snapBack.actors.find((a) => a.id === 'cat').x;
      const clawdBack = snapBack.actors.find((a) => a.id === 'clawd').x;
      assert.ok(Math.abs(catBack - cat0) <= 2, `cat must rebound accurately on 1100px wide screen (${cat0} vs ${catBack})`);
      assert.ok(Math.abs(clawdBack - clawd0) <= 2, `clawd must rebound accurately on 1100px wide screen (${clawd0} vs ${clawdBack})`);
      assert.notEqual(snapBack.lastInteraction.type, 'ballisticBump', 'Rebound flights must not mid-air bump each other');
    } finally {
      h.cleanup();
    }
  }

  // ② Restore to narrower window (720 -> 360 -> 580): no overlap and no order inversion
  {
    const h = createStageHarness(720, { miniPileEnabled: false, reducedMotion: false });
    try {
      const snap0 = h.stage.getLayoutSnapshot();
      const cat0 = snap0.actors.find((a) => a.id === 'cat').x;
      const clawd0 = snap0.actors.find((a) => a.id === 'clawd').x;
      assert.ok(cat0 > clawd0, 'Baseline gemini camp puts cat right of clawd');

      h.resizeTo(360);
      const snapN = h.stage.getLayoutSnapshot();
      const clawdN = snapN.actors.find((a) => a.id === 'clawd').x;
      h.resizeTo(580);
      await h.waitRebound((s) => {
        const c1 = s.actors.find((a) => a.id === 'cat').x;
        const d1 = s.actors.find((a) => a.id === 'clawd').x;
        return d1 > clawdN + 60 && c1 - d1 >= 56;
      });

      const snap580 = h.stage.getLayoutSnapshot();
      const cat1 = snap580.actors.find((a) => a.id === 'cat').x;
      const clawd1 = snap580.actors.find((a) => a.id === 'clawd').x;
      assert.ok(cat1 - clawd1 >= 56, `Restoring to narrower 580px must preserve >= 56px gap without order flip (cat=${cat1}, clawd=${clawd1})`);
    } finally {
      h.cleanup();
    }
  }

  // ③ Mini-crab tower push/pull syncTower keeps exact worldCx without 16px left offset
  {
    const h = createStageHarness(720, { miniPileEnabled: true, reducedMotion: true });
    try {
      assert.equal(h.stage.stackOnto('cowboy', 'clawd'), true);
      h.resizeTo(360);
      const snapN = h.stage.getLayoutSnapshot();
      const clawdN = snapN.actors.find((a) => a.id === 'clawd');
      const cowboyN = snapN.minis.find((m) => m.id === 'cowboy');
      assert.ok(Math.abs(cowboyN.worldCx - clawdN.worldCx) <= 1, `Stacked mini crab worldCx (${cowboyN.worldCx}) must match clawd worldCx (${clawdN.worldCx}) during push`);

      h.resizeTo(720);
      await h.waitRebound((s) => s.actors.find((a) => a.id === 'clawd').x > clawdN.x + 100);
      const snapR = h.stage.getLayoutSnapshot();
      const clawdR = snapR.actors.find((a) => a.id === 'clawd');
      const cowboyR = snapR.minis.find((m) => m.id === 'cowboy');
      assert.ok(Math.abs(cowboyR.worldCx - clawdR.worldCx) <= 1, `Stacked mini crab worldCx (${cowboyR.worldCx}) must match clawd worldCx (${clawdR.worldCx}) after rebound`);
    } finally {
      h.cleanup();
    }
  }

  // ④ Verify TIER_CSS against real inline-widget.cjs CSS: never overrides .collection-label{display:none} or .card positioning
  {
    const widgetSrc = fs.readFileSync(require.resolve('../vendor/pulse-dashboard/compat/inline-widget.cjs'), 'utf8');
    assert.ok(widgetSrc.includes('.collection-label{display:none}'), 'Real inline-widget.cjs must hide .collection-label by default');
    assert.ok(widgetSrc.includes('.rounds,.group,.dot.live{display:none}'), 'Real inline-widget.cjs must hide .rounds/.group by default');
    assert.ok(widgetSrc.includes(':host(.icons-only) .chip>:not(svg):not(.context-ring){display:none}'), 'Real inline-widget.cjs must hide chip text in icons-only mode');

    const fbMod = require('../vendor/pulse-dashboard/inline-fallback.js');
    let injectedTierCss = '';
    const barAttrs = new Map();
    const ftAttrs = new Map();
    const extBar = {
      id: 'ag-pulse-status-bar',
      isConnected: true,
      hidden: false,
      shadowRoot: {
        querySelector: () => null,
        appendChild(el) { if (el?.textContent) injectedTierCss = el.textContent; },
      },
      getAttribute: (k) => barAttrs.get(k) ?? null,
      setAttribute: (k, v) => barAttrs.set(k, String(v)),
      removeAttribute: (k) => barAttrs.delete(k),
      getBoundingClientRect: () => ({ width: 180, height: 24 }),
    };
    const ft = {
      isConnected: true,
      getAttribute: (k) => ftAttrs.get(k) ?? null,
      setAttribute: (k, v) => ftAttrs.set(k, String(v)),
      removeAttribute: (k) => ftAttrs.delete(k),
      getBoundingClientRect: () => ({ width: 420, height: 30 }),
    };
    const pDoc = {
      hidden: false,
      documentElement: { getAttribute: () => 'zh-CN' },
      body: {},
      createElement: (tag) => ({ tagName: tag, setAttribute() {}, textContent: '' }),
      querySelector: (sel) => (sel.includes('agy-composer-footer') ? ft : sel.includes('conversation-view') ? {} : null),
      querySelectorAll: (sel) => (sel.includes('ag-pulse-status-bar') ? [extBar] : []),
      contains: () => true,
    };
    const pWin = {
      document: pDoc,
      location: { pathname: '/c/11111111-2222-3333-4444-555555555555' },
      ResizeObserver: class { observe() {} disconnect() {} },
      addEventListener() {},
      removeEventListener() {},
    };
    const ctl = fbMod.createTelemetryController({ window: pWin, document: pDoc });
    ctl.sync({ telemetryModule: 'auto', language: 'zh-CN' });
    assert.ok(injectedTierCss.includes(':where(.bar>.chip>*:not(.context-ring):not(svg))'), 'TIER_CSS must downgrade chip children with :where() (0,0,0 specificity)');
    assert.ok(injectedTierCss.includes('[hidden]{display:none!important}'), 'TIER_CSS must reinforce [hidden]{display:none!important}');
    assert.equal(injectedTierCss.includes('display:inline-flex'), false, 'TIER_CSS must not inject display:inline-flex onto external widget children');
    assert.equal(injectedTierCss.includes(':host([data-t~="4"]) .card'), false, 'TIER_CSS must not override external fixed .card positioning');
    ctl.destroy();
  }

  // ⑤ External bar late mount + SPA session switch rebuilding footer triggers ResizeObserver rebind & style[data-pt="1"] re-injection
  {
    const fbMod = require('../vendor/pulse-dashboard/inline-fallback.js');
    const observedEls = [];
    let disconnectedCount = 0;
    let moCb = null;
    class TrackRO {
      constructor(cb) { this.cb = cb; }
      observe(el) { observedEls.push(el); }
      disconnect() { disconnectedCount++; }
    }
    class FakeMO {
      constructor(cb) { moCb = cb; }
      observe() {}
      disconnect() {}
    }
    const mkFt = (w) => {
      const attrs = new Map();
      return {
        isConnected: true,
        className: 'agy-composer-footer',
        children: [],
        getAttribute: (k) => attrs.get(k) ?? null,
        setAttribute: (k, v) => attrs.set(k, String(v)),
        removeAttribute: (k) => attrs.delete(k),
        getBoundingClientRect: () => ({ width: w, height: 30 }),
        appendChild(c) { this.children.push(c); c.parentElement = this; },
        closest: () => null,
      };
    };
    const mkExtBar = (id) => {
      const attrs = new Map();
      let styleNode = null;
      return {
        id,
        isConnected: true,
        hidden: false,
        shadowRoot: {
          querySelector: (sel) => (sel.includes('data-pt') ? styleNode : null),
          appendChild(el) { styleNode = el; },
        },
        getAttribute: (k) => attrs.get(k) ?? null,
        setAttribute: (k, v) => attrs.set(k, String(v)),
        removeAttribute: (k) => attrs.delete(k),
        getBoundingClientRect: () => ({ width: 180, height: 24 }),
        hasStyle() { return Boolean(styleNode); },
      };
    };

    let activeFt = mkFt(500);
    let activeBar = null; // External bar not mounted yet at sync()!
    const pDoc = {
      hidden: false,
      documentElement: { getAttribute: () => 'zh-CN' },
      body: {},
      createElement: (tag) => ({ tagName: tag, setAttribute() {}, textContent: '' }),
      querySelector: (sel) => (sel.includes('agy-composer-footer') ? activeFt : sel.includes('conversation-view') ? {} : null),
      querySelectorAll: (sel) => (sel.includes('ag-pulse-status-bar') && activeBar ? [activeBar] : []),
      contains: () => true,
    };
    const pWin = {
      document: pDoc,
      location: { pathname: '/c/11111111-2222-3333-4444-555555555555' },
      ResizeObserver: TrackRO,
      MutationObserver: FakeMO,
      addEventListener() {},
      removeEventListener() {},
    };
    const ctl = fbMod.createTelemetryController({ window: pWin, document: pDoc });
    ctl.sync({ telemetryModule: 'auto', language: 'zh-CN', __fallbackDelayMs: 40 });
    // External bar mounts right before waitTimerDone fires
    activeBar = mkExtBar('ag-pulse-status-bar-1');
    await new Promise((r) => setTimeout(r, 70));
    assert.equal(observedEls[0], activeFt, 'waitTimerDone() yielding to late external bar must bind ResizeObserver to footer');
    assert.equal(activeBar.hasStyle(), true, 'Late external bar must receive TIER_CSS style[data-pt="1"]');

    // Simulate SPA conversation switch: old footer detached, new footer + fresh external bar mounted
    activeFt.isConnected = false;
    const newFt = mkFt(340);
    const newBar = mkExtBar('ag-pulse-status-bar-2');
    activeFt = newFt;
    activeBar = newBar;
    moCb([{ target: pDoc.body }]);
    await new Promise((r) => setTimeout(r, 80));

    assert.ok(disconnectedCount >= 1, 'Session switch rebuilding footer must disconnect stale ResizeObserver');
    assert.equal(observedEls[observedEls.length - 1], newFt, 'Session switch must rebind ResizeObserver to rebuilt footer');
    assert.equal(newBar.hasStyle(), true, 'Rebuilt external bar must receive style[data-pt="1"]');
    assert.equal(newFt.getAttribute('data-t'), '1 2 3 4 5', 'Rebuilt narrow footer must immediately compute tier 5');
    ctl.destroy();
  }
});

test('Issue #2/#4/#5 regressions: RLE fillRect batching pixel-equivalence, tier-3 write animation, Cat sleep 100% static cache hit, and win-blur 0fps pause/wake', async () => {
  // 1) RLE batching significantly cuts fillRect & fillStyle calls while producing 100% identical per-pixel output
  const makeRaster = (w, h) => {
    const grid = Array.from({ length: h }, () => Array(w).fill(''));
    let fillRectCalls = 0;
    let fillStyleWrites = 0;
    let curFill = '';
    const ctx = {
      get fillStyle() { return curFill; },
      set fillStyle(v) { curFill = String(v); fillStyleWrites += 1; },
      fillRect(x, y, rw, rh) {
        fillRectCalls += 1;
        for (let py = y; py < y + rh; py++) {
          if (py < 0 || py >= h) continue;
          for (let px = x; px < x + rw; px++) {
            if (px >= 0 && px < w) grid[py][px] = curFill;
          }
        }
      },
    };
    return { grid, ctx, stats: () => ({ fillRectCalls, fillStyleWrites }) };
  };

  const drawNaive = (ctx, oxGrid, oyGrid, pxSize, palette, layers, colorResolver = null) => {
    for (const part of layers) {
      if (!part || !part.rows || !part.rows.length) continue;
      for (let ry = 0; ry < part.rows.length; ry++) {
        const row = part.rows[ry];
        for (let rx = 0; rx < row.length; rx++) {
          const ch = row[rx];
          if (ch === '.' || ch === ' ') continue;
          const gx = part.ox + rx;
          const gy = part.oy + ry;
          const color = colorResolver ? colorResolver(ch, gx, gy, palette) : palette[ch];
          if (!color) continue;
          ctx.fillStyle = color;
          ctx.fillRect((oxGrid + gx) * pxSize, (oyGrid + gy) * pxSize, pxSize, pxSize);
        }
      }
    }
  };

  let totalNaiveRects = 0;
  let totalRleRects = 0;
  let totalNaiveFills = 0;
  let totalRleFills = 0;
  for (const kind of ['clawd', 'cat']) {
    for (const pose of ['idle', 'write', 'sleep', 'walk', 'onFire', 'cheerSticks']) {
      const layers = rig.buildClipLayers(kind, pose, 3, { clipTick: 3 });
      const resolver =
        kind === 'cat' && pose === 'idle'
          ? (ch, gx, gy, pal) =>
              ch === '#'
                ? rig.evalChromaColorAt(gx, gy, 0.25, false)
                : ch === 's'
                  ? rig.evalChromaColorAt(gx, gy, 0.25, true)
                  : pal[ch]
          : null;
      const rNaive = makeRaster(96, 84);
      const rRle = makeRaster(96, 84);
      drawNaive(rNaive.ctx, 8, 17, 3, rig.PALETTES[kind], layers, resolver);
      rig.drawLayerSet(rRle.ctx, 8, 17, 3, rig.PALETTES[kind], layers, resolver);
      assert.deepEqual(rRle.grid, rNaive.grid, `RLE pixel grid must match cell-by-cell draw 100% for ${kind}:${pose}`);
      if (!resolver) {
        totalNaiveRects += rNaive.stats().fillRectCalls;
        totalRleRects += rRle.stats().fillRectCalls;
        totalNaiveFills += rNaive.stats().fillStyleWrites;
        totalRleFills += rRle.stats().fillStyleWrites;
      }
    }
  }
  for (const id of ['cowboy', 'shades', 'wizard']) {
    const layers = [rig.MINI_SPRITES[id]];
    const rNaive = makeRaster(40, 32);
    const rRle = makeRaster(40, 32);
    drawNaive(rNaive.ctx, 2, 5, 2, rig.PALETTES[id], layers);
    rig.drawLayerSet(rRle.ctx, 2, 5, 2, rig.PALETTES[id], layers);
    assert.deepEqual(rRle.grid, rNaive.grid, `RLE mini-crab pixel grid must match 100% for ${id}`);
    totalNaiveRects += rNaive.stats().fillRectCalls;
    totalRleRects += rRle.stats().fillRectCalls;
  }
  assert.ok(totalRleRects < totalNaiveRects * 0.35, `Expected >65% fillRect reduction (${totalRleRects} vs ${totalNaiveRects})`);
  assert.ok(totalRleFills < totalNaiveFills * 0.15, `Expected >85% fillStyle reduction (${totalRleFills} vs ${totalNaiveFills})`);

  // 2) Cat 'sleep' pose keeps static tail across all ticks so static frame cache hits 100%
  const sleepRef = rig.buildClipLayers('cat', 'sleep', 0);
  for (let t = 1; t <= 16; t++) {
    assert.deepEqual(
      rig.buildClipLayers('cat', 'sleep', t),
      sleepRef,
      `Cat sleep layers must not flip tail at tick=${t}`
    );
  }

  // 3) Live stage: Cached 2D context, write pose streamTier===3 frame alternation, Cat sleep 0 redraws, and win-blur 0fps pause/wake
  let getCtxCalls = 0;
  let catClears = 0;
  const winListeners = new Map();
  let moCb = null;
  let moDisconnected = false;
  const htmlAttrs = new Map();
  const mockHtml = {
    getAttribute: (k) => (htmlAttrs.has(k) ? htmlAttrs.get(k) : null),
    setAttribute(k, v) { htmlAttrs.set(k, String(v)); if (moCb) moCb([{ attributeName: k }]); },
    removeAttribute(k) { htmlAttrs.delete(k); if (moCb) moCb([{ attributeName: k }]); },
  };
  const mockWin = {
    devicePixelRatio: 1,
    matchMedia: () => ({ matches: false }),
    MutationObserver: class {
      constructor(cb) { moCb = cb; }
      observe() {}
      disconnect() { moDisconnected = true; }
    },
    addEventListener(t, fn) {
      if (!winListeners.has(t)) winListeners.set(t, new Set());
      winListeners.get(t).add(fn);
    },
    removeEventListener(t, fn) { winListeners.get(t)?.delete(fn); },
    dispatch(t) { for (const fn of [...(winListeners.get(t) || [])]) fn({ type: t }); },
  };
  const makeEl = (tag) => {
    const attrs = new Map();
    const listeners = new Map();
    const children = [];
    const el = {
      tagName: tag.toUpperCase(),
      ownerDocument: null,
      parentNode: null,
      clientWidth: 720,
      width: 96,
      height: 84,
      className: '',
      dataset: {},
      style: {},
      children,
      get firstChild() { return children[0] || null; },
      setAttribute(k, v) { attrs.set(k, String(v)); },
      getAttribute(k) { return attrs.get(k) ?? null; },
      removeAttribute(k) { attrs.delete(k); },
      appendChild(c) { c.parentNode = el; children.push(c); return c; },
      removeChild(c) { const i = children.indexOf(c); if (i >= 0) children.splice(i, 1); return c; },
      getBoundingClientRect: () => ({ left: 0, top: 0, right: 720, bottom: 84, width: 720, height: 84 }),
      addEventListener(t, fn) { if (!listeners.has(t)) listeners.set(t, new Set()); listeners.get(t).add(fn); },
      removeEventListener(t, fn) { listeners.get(t)?.delete(fn); },
      getContext(kind) {
        if (kind !== '2d') return null;
        getCtxCalls += 1;
        return {
          imageSmoothingEnabled: false,
          fillStyle: '',
          save() {}, restore() {}, setTransform() {},
          clearRect() {
            if (el.parentNode?.getAttribute?.('data-mascot-id') === 'cat') catClears += 1;
          },
          beginPath() {}, rect() {}, clip() {}, translate() {}, scale() {}, rotate() {}, fillRect() {}, drawImage() {},
        };
      },
    };
    return el;
  };
  const mockDoc = {
    hidden: false,
    documentElement: mockHtml,
    defaultView: mockWin,
    createElement(t) { const n = makeEl(t); n.ownerDocument = mockDoc; return n; },
    addEventListener() {},
    removeEventListener() {},
  };
  const host = mockDoc.createElement('div');
  const stage = rig.mountDualMascotStage(host, {
    camp: 'gemini',
    streaming: true,
    streamTier: 3,
    miniPileEnabled: true,
    reducedMotion: false,
  });

  try {
    const initialCtxCalls = getCtxCalls;
    assert.equal(initialCtxCalls, 6, 'Should acquire 2D context exactly once for 2 main actors + 3 mini crabs + 1 static habitat prop');

    // Verify streamTier === 3 write pose alternates frames across ticks instead of freezing on even localTick
    const seenWriteFrames = new Set([
      stage.getLayoutSnapshot().actors.find((a) => a.id === 'cat').renderCache.frameIdx,
    ]);
    await new Promise((r) => setTimeout(r, 240));
    seenWriteFrames.add(stage.getLayoutSnapshot().actors.find((a) => a.id === 'cat').renderCache.frameIdx);
    await new Promise((r) => setTimeout(r, 110));
    seenWriteFrames.add(stage.getLayoutSnapshot().actors.find((a) => a.id === 'cat').renderCache.frameIdx);
    assert.ok(seenWriteFrames.size >= 2, 'write pose at streamTier===3 must alternate frames smoothly instead of freezing');
    assert.equal(getCtxCalls, initialCtxCalls, 'Cached _ctx must avoid redundant canvas.getContext("2d") calls across ticks');

    // Enter doze sleep (stop streaming) -> Cat sleep pose hits static frame cache 100% across consecutive doze ticks
    stage.setState({ streaming: false });
    stage.triggerDemo('doze');
    assert.equal(stage.getLayoutSnapshot().perf.timerIntervalMs, 400);
    const catClearsAtSleepStart = catClears;
    const skipsAtSleepStart = stage.getLayoutSnapshot().perf.canvasSkips;
    await new Promise((r) => setTimeout(r, 860)); // ~2 doze ticks within same Zzz phase
    assert.equal(catClears, catClearsAtSleepStart, 'Cat sleep must hit static frame cache with 0 Canvas clearRect redraws');
    assert.ok(stage.getLayoutSnapshot().perf.canvasSkips >= skipsAtSleepStart + 2, 'Cat & Clawd sleep must increment canvasSkips');

    // macOS data-ag-cs-win-blur="1" -> pauses heartbeat to 0fps even from doze state, and removal restores 100ms TICK!
    mockHtml.setAttribute('data-ag-cs-win-blur', '1');
    const blurSnap = stage.getLayoutSnapshot();
    assert.equal(blurSnap.perf.timerIntervalMs, 0, 'data-ag-cs-win-blur="1" must stop mascot timer to 0fps');
    assert.equal(blurSnap.perf.timerPaused, true);
    const tickAtBlur = blurSnap.actors[0].tick;
    await new Promise((r) => setTimeout(r, 230));
    assert.equal(stage.getLayoutSnapshot().actors[0].tick, tickAtBlur, 'Zero ticks may fire while data-ag-cs-win-blur="1"');

    mockHtml.removeAttribute('data-ag-cs-win-blur');
    const wokeSnap = stage.getLayoutSnapshot();
    assert.equal(wokeSnap.perf.timerIntervalMs, 100, 'Removing data-ag-cs-win-blur must immediately restore 100ms TICK');
    assert.equal(wokeSnap.perf.timerPaused, false);

    // Direct window.blur / window.focus events also pause to 0fps and wake back to 100ms TICK
    mockWin.dispatch('blur');
    assert.equal(stage.getLayoutSnapshot().perf.timerIntervalMs, 0);
    assert.equal(stage.getLayoutSnapshot().perf.timerPaused, true);
    mockWin.dispatch('focus');
    assert.equal(stage.getLayoutSnapshot().perf.timerIntervalMs, 100);
    assert.equal(stage.getLayoutSnapshot().perf.timerPaused, false);
  } finally {
    stage.dispose();
  }
  assert.equal(moDisconnected, true, 'dispose() must disconnect win-blur MutationObserver');
  assert.equal(winListeners.get('blur')?.size || 0, 0, 'dispose() must unbind window blur listeners');
  assert.equal(winListeners.get('focus')?.size || 0, 0, 'dispose() must unbind window focus listeners');
});

test('WO-MAIN-001A pixel audit: all grounded poses have maxY=9 with zero row gaps, missing sprites filled, dead frames removed, peek/letter unoccluded', () => {
  assert.equal(rig.CLAWD_PARTS.clawL.low, undefined, 'Dead frame clawL.low must be removed');
  assert.equal(rig.CLAWD_PARTS.clawR.reach2, undefined, 'Dead frame clawR.reach2 must be removed');
  for (const k of ['laser0', 'laser1', 'laser2']) {
    assert.ok(rig.PROPS[k]?.rows?.length >= 2 && rig.PROPS[k].grounded === true, `Expected grounded PROPS.${k}`);
  }
  for (const k of ['fireSpark0', 'fireSpark1', 'fireSpark2']) {
    assert.ok(rig.SYMS[k]?.rows?.length >= 3, `Expected SYMS.${k}`);
  }
  assert.equal(rig.CLAWD_PARTS.clawL.peekGrip.ox, 1);
  assert.equal(rig.CLAWD_PARTS.clawR.peekGrip.ox, 13);
  assert.equal(rig.CAT_PARTS.paws.peekGrip.ox, 1);
  assert.ok(rig.PROPS.letter.ox >= 14, 'PROPS.letter must not occlude face/eyes');

  // Cowboy trick aligned to same ground baseline maxY=5 as cowboy/shades/wizard
  for (const id of ['cowboy', 'shades', 'wizard']) {
    const base = rig.MINI_SPRITES[id];
    const trick = rig.MINI_ANIM_FRAMES[id].trick;
    assert.equal(base.oy + base.rows.length - 1, 5, `${id} base must align maxY=5`);
    assert.equal(trick.oy + trick.rows.length - 1, 5, `${id} trick must align maxY=5`);
  }

  const propSet = new Set([...Object.values(rig.PROPS), ...Object.values(rig.SYMS)]);
  const groundedPoses = [
    'idle', 'squash', 'sleep', 'walk', 'write', 'pet', 'happy', 'jiggle', 'angry', 'tilt', 'wow', 'sulk',
    'polish', 'eat', 'eatFish', 'letter', 'plant', 'butterfly', 'stretch', 'spinHop', 'onFire',
    'cheerSticks', 'rickroll', 'siren', 'chatGreet', 'lookNod', 'readAlong', 'balance', 'yawn',
    'wave', 'gaze', 'worry', 'salute', 'carry', 'yawnStretch',
  ];
  for (const kind of ['clawd', 'cat']) {
    const poses = kind === 'cat' ? [...groundedPoses, 'loaf', 'groom', 'chaseDot', 'catStretch'] : groundedPoses;
    for (const pose of poses) {
      for (const tick of [0, 1, 2, 3, 5, 7, 10, 15, 22, 26, 32]) {
        const layers = rig.buildClipLayers(kind, pose, tick, { clipTick: tick, dir: 'right' });
        const ys = new Set();
        let minY = 99;
        let maxY = -99;
        for (const l of layers) {
          if (!l || l.grounded || propSet.has(l)) continue;
          for (let ry = 0; ry < l.rows.length; ry++) {
            if (/[^. ]/.test(l.rows[ry])) {
              const y = l.oy + ry;
              ys.add(y);
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
        assert.equal(maxY, 9, `${kind}:${pose}@${tick} must touch ground y=9, got ${maxY}`);
        for (let y = minY; y <= maxY; y++) {
          assert.ok(ys.has(y), `${kind}:${pose}@${tick} has horizontal row gap at y=${y}`);
        }
      }
    }
  }
});

test('WO-MAIN-001A state-machine reset, poke-2 cancel, host-sleep/blur/chat 0fps halt, and workbench demo/inspect APIs', () => {
  const rootAttrs = new Map();
  const makeEl = (tag) => {
    const attrs = new Map();
    const listeners = new Map();
    const children = [];
    const ctx = {
      setTransform() {}, clearRect() {}, save() {}, restore() {}, translate() {},
      scale() {}, rotate() {}, beginPath() {}, rect() {}, clip() {}, fillRect() {}, drawImage() {},
    };
    return {
      tagName: String(tag).toUpperCase(),
      clientWidth: 720, width: 96, height: 84, className: '', dataset: {},
      style: { display: '', zIndex: '', transform: '', transition: '', cursor: '' },
      children,
      setAttribute(k, v) { attrs.set(k, String(v)); },
      getAttribute(k) { return attrs.get(k) ?? null; },
      hasAttribute(k) { return attrs.has(k); },
      removeAttribute(k) { attrs.delete(k); },
      appendChild(ch) { children.push(ch); ch.parentNode = this; return ch; },
      removeChild(ch) { const i = children.indexOf(ch); if (i >= 0) children.splice(i, 1); },
      addEventListener(t, fn) { if (!listeners.has(t)) listeners.set(t, new Set()); listeners.get(t).add(fn); },
      removeEventListener(t, fn) { listeners.get(t)?.delete(fn); },
      getContext() { return ctx; },
      getBoundingClientRect() { return { left: 0, right: 96, top: 0, bottom: 84, width: 96, height: 84 }; },
    };
  };
  const doc = {
    hidden: false,
    documentElement: {
      setAttribute(k, v) { rootAttrs.set(k, String(v)); },
      getAttribute(k) { return rootAttrs.get(k) ?? null; },
      hasAttribute(k) { return rootAttrs.has(k); },
      removeAttribute(k) { rootAttrs.delete(k); },
    },
    defaultView: { devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, requestAnimationFrame: () => 1, cancelAnimationFrame() {} },
    createElement(tag) { const n = makeEl(tag); n.ownerDocument = doc; return n; },
    addEventListener() {},
    removeEventListener() {},
  };
  const hostEl = doc.createElement('div');
  const stage = rig.mountDualMascotStage(hostEl, { miniPileEnabled: true, reducedMotion: false });

  try {
    assert.equal(stage.getLayoutSnapshot().perf.timerIntervalMs, 100);

    // 1. host-sleep pauses heartbeat to 0fps immediately
    stage.notify('host-sleep', { sleep: true });
    assert.equal(stage.getLayoutSnapshot().perf.timerIntervalMs, 0);
    assert.equal(stage.getLayoutSnapshot().perf.timerPaused, true);
    stage.notify('host-sleep', { sleep: false });
    assert.equal(stage.getLayoutSnapshot().perf.timerIntervalMs, 100);

    // 2. data-ag-cs-win-blur attribute forces 0fps on sync
    doc.documentElement.setAttribute('data-ag-cs-win-blur', '1');
    stage.notify('activity');
    assert.equal(stage.getLayoutSnapshot().perf.timerIntervalMs, 0);
    doc.documentElement.removeAttribute('data-ag-cs-win-blur');
    stage.notify('activity');
    assert.equal(stage.getLayoutSnapshot().perf.timerIntervalMs, 100);

    // 3. data-ag-prism-mode="chat" forces 0fps on sync
    doc.documentElement.setAttribute('data-ag-prism-mode', 'chat');
    stage.notify('activity');
    assert.equal(stage.getLayoutSnapshot().perf.timerIntervalMs, 0);
    doc.documentElement.removeAttribute('data-ag-prism-mode');
    stage.notify('activity');
    assert.equal(stage.getLayoutSnapshot().perf.timerIntervalMs, 100);

    // 4. Cross-interrupt cleanup & poke-2 jiggle cancels pending bounce
    stage.poke('cat');
    stage.poke('cat');
    assert.equal(stage.getLayoutSnapshot().actors.find((a) => a.id === 'cat').pose, 'jiggle');
    stage.poke('cat');
    assert.equal(stage.getLayoutSnapshot().actors.find((a) => a.id === 'cat').rot, -9);
    stage.triggerDemo('unstack');
    assert.equal(stage.getLayoutSnapshot().actors.find((a) => a.id === 'cat').rot, 0);

    // 5. All workbench demo branches + inspectPose / stepTick / listPoses
    for (const cmd of ['campSwitch', 'streamDone', 'crabRide', 'bump', 'passBy', 'theater']) {
      assert.doesNotThrow(() => stage.triggerDemo(cmd), `triggerDemo(${cmd}) must not throw`);
    }
    assert.ok(stage.listPoses().includes('chaseDot') && stage.listPoses().includes('yawnStretch'));
    const st = stage.inspectPose({ pose: 'sulk', tick: 5, mirror: true, sqW: 1, sqH: -1, ruler: true });
    assert.equal(st.pose, 'sulk');
    assert.equal(stage.stepTick(1), 6);
    stage.inspectPose({ active: false });
  } finally {
    stage.dispose();
  }
});

test('WO-MAIN-001B: 9 Slash theaters, 4 contextual links, habitat 3-mode 0fps prop, feed donut/coffee sulk-reset, and all new poses maxY=9', () => {
  // 1. All 13 new poses grounded at maxY=9 with zero row gaps
  const propSet = new Set([...Object.values(rig.PROPS), ...Object.values(rig.SYMS)]);
  const newPoses = [
    'slashPlan', 'slashGoal', 'slashBoost', 'slashTeam', 'slashBrowser', 'slashCompact',
    'slashSchedule', 'slashGrill', 'slashLearnBook', 'slashLearnBulb',
    'nightSip', 'feedDonut', 'feedCoffee',
  ];
  for (const kind of ['clawd', 'cat']) {
    for (const pose of newPoses) {
      for (const tick of [0, 1, 5, 10, 16, 20]) {
        const layers = rig.buildClipLayers(kind, pose, tick, { clipTick: tick, dir: 'right' });
        const ys = new Set();
        let minY = 99, maxY = -99;
        for (const l of layers) {
          if (!l || l.grounded || propSet.has(l)) continue;
          for (let ry = 0; ry < l.rows.length; ry++) {
            if (/[^. ]/.test(l.rows[ry])) {
              const y = l.oy + ry;
              ys.add(y);
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
        assert.equal(maxY, 9, `New pose ${kind}:${pose}@${tick} must touch y=9, got ${maxY}`);
        for (let y = minY; y <= maxY; y++) assert.ok(ys.has(y), `New pose ${kind}:${pose}@${tick} gap at y=${y}`);
      }
    }
  }

  // 2. Interactive test: all 9 slash cmds, feed donut/coffee clearing sulk, habitat 3 states, contextual notifications
  let habDraws = 0;
  const makeEl = (tag) => {
    const attrs = new Map();
    const listeners = new Map();
    const children = [];
    let isHab = false;
    const ctx = {
      setTransform() {}, clearRect() { if (isHab) habDraws += 1; }, save() {}, restore() {},
      translate() {}, scale() {}, rotate() {}, beginPath() {}, rect() {}, clip() {}, fillRect() {}, drawImage() {},
    };
    const node = {
      tagName: String(tag).toUpperCase(),
      clientWidth: 720, width: 96, height: 84, dataset: {},
      style: { display: '', zIndex: '', transform: '', transition: '', cursor: '' },
      children,
      set className(v) { this._cls = v; isHab = v === 'ag-v2-habitat-prop'; },
      get className() { return this._cls || ''; },
      setAttribute(k, v) { attrs.set(k, String(v)); },
      getAttribute(k) { return attrs.get(k) ?? null; },
      hasAttribute(k) { return attrs.has(k); },
      removeAttribute(k) { attrs.delete(k); },
      appendChild(ch) { children.push(ch); ch.parentNode = this; return ch; },
      removeChild(ch) { const i = children.indexOf(ch); if (i >= 0) children.splice(i, 1); },
      addEventListener(t, fn) { if (!listeners.has(t)) listeners.set(t, new Set()); listeners.get(t).add(fn); },
      removeEventListener(t, fn) { listeners.get(t)?.delete(fn); },
      dispatch(t, ev = {}) {
        const e = { button: 0, altKey: false, preventDefault() {}, stopPropagation() {}, ...ev };
        for (const fn of listeners.get(t) || []) fn(e);
      },
      getContext() { return ctx; },
      getBoundingClientRect() { return { left: 0, right: 96, top: 0, bottom: 84, width: 96, height: 84 }; },
    };
    return node;
  };
  const doc = {
    hidden: false,
    documentElement: { getAttribute: () => null, hasAttribute: () => false },
    defaultView: { devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, requestAnimationFrame: () => 1, cancelAnimationFrame() {} },
    createElement(tag) { const n = makeEl(tag); n.ownerDocument = doc; return n; },
    addEventListener() {},
    removeEventListener() {},
  };
  const hostEl = doc.createElement('div');
  const stage = rig.mountDualMascotStage(hostEl, { miniPileEnabled: true, reducedMotion: true });

  try {
    const habEl = hostEl.children.find((n) => n.className === 'ag-v2-habitat-prop');
    assert.ok(habEl, 'Expected .ag-v2-habitat-prop canvas mounted in stage');
    assert.equal(habDraws, 1, 'Habitat prop must draw exactly 1 static frame at mount (0fps idle)');

    // Test all 9 slash commands + /swarm alias
    for (const cmd of ['plan', 'goal', 'boost', 'teamwork', 'swarm', 'browser', 'compact', 'schedule', 'grill-me', 'learn']) {
      stage.notify('slash-cmd', { cmd });
      const snap = stage.getLayoutSnapshot();
      assert.ok(snap.lastInteraction.type.startsWith('slash:'), `Expected slash interaction for /${cmd}`);
    }
    // /schedule activates 30-min hourglass watch mode on habitat prop
    assert.equal(stage.getLayoutSnapshot().habitat.mode, 'hourglass');
    assert.equal(stage.getLayoutSnapshot().habitat.scheduleActive, true);
    assert.equal(stage.setHabitatPreview('lamp'), 'lamp');
    assert.equal(stage.setHabitatPreview('cactus'), 'cactus');
    assert.equal(stage.setHabitatPreview('auto'), 'hourglass');

    // Contextual notifications: effort-tier, vial-high, aura-complete
    stage.notify('effort-tier', { tier: 'high' });
    assert.equal(stage.getLayoutSnapshot().lastInteraction.type, 'effort-tier:high');
    stage.notify('vial-high', { fraction: 0.82 });
    assert.equal(stage.getLayoutSnapshot().lastInteraction.type, 'vial-high');
    stage.notify('aura-complete', { durationMs: 20000 });
    assert.equal(stage.getLayoutSnapshot().lastInteraction.type, 'aura-complete');

    // Feed donut (contextmenu) & coffee (Alt+pointerdown) immediately clear pokeCount & sulk
    const catEl = hostEl.children.find((n) => n.getAttribute('data-mascot-id') === 'cat');
    for (let i = 0; i < 5; i++) stage.poke('cat');
    assert.equal(stage.getLayoutSnapshot().actors.find((a) => a.id === 'cat').pose, 'sulk');
    catEl.dispatch('contextmenu', { button: 2 });
    const afterDonut = stage.getLayoutSnapshot().actors.find((a) => a.id === 'cat');
    assert.equal(afterDonut.pose, 'feedDonut');
    assert.equal(afterDonut.pokeCount, 0);

    stage.poke('cat');
    assert.equal(stage.getLayoutSnapshot().actors.find((a) => a.id === 'cat').pokeCount, 1);
    catEl.dispatch('pointerdown', { button: 0, altKey: true });
    const afterCoffee = stage.getLayoutSnapshot().actors.find((a) => a.id === 'cat');
    assert.equal(afterCoffee.pose, 'feedCoffee');
    assert.equal(afterCoffee.pokeCount, 0);
  } finally {
    stage.dispose();
  }
});

function createRigMockDom(clientWidth = 760) {
  const htmlAttrs = new Map();
  const moInstances = [];
  const docListeners = new Map();
  const metrics = { fillRectCalls: 0, rafCalls: 0, cancelRafCalls: 0, activeRafIds: new Set(), nextRafId: 1 };
  const makeEl = (tag) => {
    const attrs = new Map();
    const listeners = new Map();
    const children = [];
    const ctx = {
      setTransform() {}, clearRect() {}, save() {}, restore() {},
      translate() {}, scale() {}, rotate() {}, beginPath() {}, rect() {}, clip() {}, drawImage() {},
      moveTo() {}, lineTo() {}, closePath() {}, fill() {}, stroke() {}, ellipse() {},
      createLinearGradient() { return { addColorStop() {} }; },
      createRadialGradient() { return { addColorStop() {} }; },
      fillRect() { metrics.fillRectCalls += 1; },
    };
    const node = {
      tagName: String(tag).toUpperCase(),
      id: '',
      clientWidth,
      width: 96,
      height: 84,
      dataset: {},
      className: '',
      textContent: '',
      disabled: false,
      style: { display: '', zIndex: '', transform: '', transition: '', cursor: '', opacity: '' },
      children,
      parentNode: null,
      get parentElement() { return this.parentNode; },
      get isConnected() {
        let cur = this;
        while (cur) {
          if (cur === body || cur === head || cur === documentElement) return true;
          cur = cur.parentNode;
        }
        return false;
      },
      get firstChild() { return children[0] || null; },
      setAttribute(k, v) { attrs.set(k, String(v)); },
      getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
      hasAttribute(k) { return attrs.has(k); },
      removeAttribute(k) { attrs.delete(k); },
      appendChild(ch) {
        if (ch.parentNode && ch.parentNode !== this) ch.parentNode.removeChild?.(ch);
        children.push(ch);
        ch.parentNode = this;
        return ch;
      },
      insertBefore(ch, ref) {
        if (ch.parentNode && ch.parentNode !== this) ch.parentNode.removeChild?.(ch);
        const idx = children.indexOf(ref);
        if (idx >= 0) children.splice(idx, 0, ch);
        else children.push(ch);
        ch.parentNode = this;
        return ch;
      },
      removeChild(ch) {
        const i = children.indexOf(ch);
        if (i >= 0) {
          children.splice(i, 1);
          ch.parentNode = null;
          for (const mo of [...moInstances]) {
            if (mo.active && mo.opts?.childList) {
              let cur = this;
              while (cur) {
                if (cur === mo.target) {
                  mo.cb([{ type: 'childList', target: this, removedNodes: [ch] }]);
                  break;
                }
                if (!mo.opts?.subtree) break;
                cur = cur.parentNode;
              }
            }
          }
        }
      },
      remove() { this.parentNode?.removeChild?.(this); },
      addEventListener(t, fn) { if (!listeners.has(t)) listeners.set(t, new Set()); listeners.get(t).add(fn); },
      removeEventListener(t, fn) { listeners.get(t)?.delete(fn); },
      dispatchEvent(ev) {
        const set = listeners.get(ev.type);
        if (set) for (const fn of [...set]) fn(ev);
      },
      click() { this.dispatchEvent({ type: 'click', stopPropagation() {}, preventDefault() {} }); },
      getContext() { return ctx; },
      getBoundingClientRect() { return { left: 0, right: 96, top: 0, bottom: 84, width: 96, height: 84 }; },
      matchesSingle(sel) {
        const s = sel.trim();
        if (!s) return false;
        if (s.startsWith('#')) return this.id === s.slice(1);
        const m = /^(?:([a-z0-9_-]+))?(?:\.([a-z0-9_-]+))?(?:\[([^\]=]+)(?:="([^"]*)")?\])?$/i.exec(s);
        if (!m) return false;
        if (m[1] && this.tagName !== m[1].toUpperCase()) return false;
        if (m[2] && !String(this.className || '').split(/\s+/).includes(m[2])) return false;
        if (m[3]) {
          if (!this.hasAttribute(m[3])) return false;
          if (m[4] !== undefined && this.getAttribute(m[3]) !== m[4]) return false;
        }
        return true;
      },
      querySelectorAll(sel) {
        const out = [];
        const groups = sel.split(',').map((g) => g.trim().split(/\s+/).filter(Boolean));
        const matchParts = (el, parts) => {
          if (!parts.length || !el.matchesSingle(parts[parts.length - 1])) return false;
          if (parts.length === 1) return true;
          let idx = parts.length - 2;
          let p = el.parentNode;
          while (p && idx >= 0) {
            if (p.matchesSingle?.(parts[idx])) idx -= 1;
            p = p.parentNode;
          }
          return idx < 0;
        };
        const walk = (cur) => {
          for (const ch of cur.children || []) {
            if (groups.some((parts) => matchParts(ch, parts))) out.push(ch);
            walk(ch);
          }
        };
        walk(this);
        return out;
      },
      querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
      closest(sel) {
        let cur = this;
        while (cur) {
          if (cur.matchesSingle?.(sel)) return cur;
          cur = cur.parentNode;
        }
        return null;
      },
      classList: {
        _set: new Set(),
        add(c) { this._set.add(c); },
        remove(c) { this._set.delete(c); },
        contains(c) { return this._set.has(c); },
      },
    };
    return node;
  };
  class MockMutationObserver {
    constructor(cb) { this.cb = cb; this.active = false; this.target = null; this.opts = null; moInstances.push(this); }
    observe(target, opts = {}) { this.active = true; this.target = target; this.opts = opts; }
    disconnect() { this.active = false; }
  }
  const documentElement = {
    setAttribute(k, v) {
      htmlAttrs.set(k, String(v));
      for (const mo of [...moInstances]) if (mo.active && (!mo.target || mo.target === documentElement)) mo.cb([{ attributeName: k }]);
    },
    getAttribute(k) { return htmlAttrs.has(k) ? htmlAttrs.get(k) : null; },
    hasAttribute(k) { return htmlAttrs.has(k); },
    removeAttribute(k) {
      htmlAttrs.delete(k);
      for (const mo of [...moInstances]) if (mo.active && (!mo.target || mo.target === documentElement)) mo.cb([{ attributeName: k }]);
    },
    classList: { contains: () => false },
  };
  const head = makeEl('head');
  const body = makeEl('body');
  const doc = {
    hidden: false,
    documentElement,
    head,
    body,
    defaultView: {
      devicePixelRatio: 1,
      MutationObserver: MockMutationObserver,
      addEventListener() {},
      removeEventListener() {},
      requestAnimationFrame: () => {
        metrics.rafCalls += 1;
        const id = metrics.nextRafId++;
        metrics.activeRafIds.add(id);
        return id;
      },
      cancelAnimationFrame: (id) => {
        metrics.cancelRafCalls += 1;
        metrics.activeRafIds.delete(id);
      },
    },
    createElement(tag) { const n = makeEl(tag); n.ownerDocument = doc; return n; },
    addEventListener(t, fn) { if (!docListeners.has(t)) docListeners.set(t, new Set()); docListeners.get(t).add(fn); },
    removeEventListener(t, fn) { docListeners.get(t)?.delete(fn); },
    dispatchEvent(ev) {
      const set = docListeners.get(ev.type);
      if (set) for (const fn of [...set]) fn(ev);
    },
    getElementById(id) {
      const find = (cur) => {
        for (const ch of cur.children || []) {
          if (ch.id === id) return ch;
          const hit = find(ch);
          if (hit) return hit;
        }
        return null;
      };
      return find(head) || find(body);
    },
    querySelectorAll(sel) { return body.querySelectorAll(sel); },
    querySelector(sel) { return body.querySelector(sel); },
  };
  return { doc, html: documentElement, moInstances, metrics, docListeners };
}

test('PR #45 Quad mascot mode: GPT White Dragon & DeepSeek Whale sprites, 4-camp handoff, 7-tier stacking, hot quad toggle, and resolveMascotCamp', () => {
  assert.equal(rig.CLAWD_PARTS.clawL.low, undefined, 'CLAWD_PARTS.clawL.low invariant must remain undefined');
  assert.ok(rig.DRAGON_PARTS?.body?.stand, 'DRAGON_PARTS should be exported with body.stand');
  assert.ok(rig.WHALE_PARTS?.body?.stand, 'WHALE_PARTS should be exported with body.stand');
  assert.ok(rig.PALETTES.dragon && rig.PALETTES.whale, 'PALETTES must include dragon and whale');

  // 1. Every pose across all 4 species resolves valid palette keys and grounded maxY <= 9
  const checkPoses = ['idle', 'walk', 'happy', 'sleep', 'loaf', 'squash', 'flat', 'peek', 'angry', 'dragonFlame', 'whaleSpout', 'slashBoost'];
  for (const kind of ['clawd', 'cat', 'dragon', 'whale']) {
    const pal = rig.PALETTES[kind];
    for (const pose of checkPoses) {
      for (let t = 0; t < 4; t++) {
        const layers = rig.buildClipLayers(kind, pose, t, { clipTick: t, noShadow: pose === 'peek' });
        assert.ok(layers.length > 0, `${kind}:${pose}@${t} must emit layers`);
        let maxY = -99;
        for (const l of layers) {
          for (let r = 0; r < (l.rows || []).length; r++) {
            const row = l.rows[r];
            for (let i = 0; i < row.length; i++) {
              const ch = row[i];
              if (ch === '.' || ch === ' ') continue;
              assert.ok(pal[ch], `Missing palette key '${ch}' for ${kind}:${pose}@${t}`);
              if (!l.grounded && l.oy + r > maxY) maxY = l.oy + r;
            }
          }
        }
        if (pose !== 'peek' && pose !== 'walk') {
          assert.ok(maxY <= 9, `${kind}:${pose}@${t} exceeded ground baseline maxY=${maxY}`);
        }
      }
    }
  }

  // 2. Quad mount, 4-camp leadership, 7-tier stacking, and lossless hot toggle quad <-> dual
  const { doc } = createRigMockDom(760);
  const hostEl = doc.createElement('div');
  const stage = rig.mountDualMascotStage(hostEl, { quadEnabled: true, miniPileEnabled: true, camp: 'gpt', reducedMotion: true });
  try {
    let snap = stage.getLayoutSnapshot();
    assert.equal(snap.quadEnabled, true);
    assert.equal(snap.mascot, 'quad-minis');
    assert.equal(snap.camp, 'gpt');
    assert.deepEqual(snap.actors.map((a) => a.id), ['cat', 'clawd', 'dragon', 'whale']);
    assert.equal(hostEl.children.filter((n) => n.className === 'ag-v2-mascot-actor').length, 4);

    // Camp switch to deepseek moves whale into leader slot
    stage.setState({ camp: 'deepseek' });
    snap = stage.getLayoutSnapshot();
    assert.equal(snap.camp, 'deepseek');

    // 7-tier totem stacking across 4 mains + 3 mini crabs
    assert.equal(stage.stackOnto('cat', 'clawd'), true);
    assert.equal(stage.stackOnto('dragon', 'cat'), true);
    assert.equal(stage.stackOnto('whale', 'dragon'), true);
    assert.equal(stage.stackOnto('cowboy', 'whale'), true);
    assert.equal(stage.stackOnto('shades', 'cowboy'), true);
    assert.equal(stage.stackOnto('wizard', 'shades'), true);
    snap = stage.getLayoutSnapshot();
    assert.equal(snap.towers[0].length, 7, 'Quad + minis must support up to 7-tier totem tower');

    // Hot toggle quadEnabled -> false cleanly unmounts dragon & whale DOM
    stage.setState({ quadEnabled: false, camp: 'claude' });
    snap = stage.getLayoutSnapshot();
    assert.equal(snap.quadEnabled, false);
    assert.equal(snap.mascot, 'minis');
    assert.deepEqual(snap.actors.map((a) => a.id), ['cat', 'clawd']);
    assert.equal(hostEl.children.filter((n) => n.className === 'ag-v2-mascot-actor').length, 2);

    // Hot toggle back to true remounts dragon & whale cleanly
    stage.setState({ quadEnabled: true });
    assert.equal(hostEl.children.filter((n) => n.className === 'ag-v2-mascot-actor').length, 4);
  } finally {
    stage.dispose();
  }
  assert.equal(hostEl.children.filter((n) => n.className === 'ag-v2-mascot-actor').length, 0);

  // 3. Model camp resolver + strict parseModelLabelInfo shape preservation
  const mgc = require('../model-glyph-crystal.js');
  assert.equal(mgc.resolveMascotCamp('Claude Sonnet 4.6'), 'claude');
  assert.equal(mgc.resolveMascotCamp('Gemini 2.5 Pro'), 'gemini');
  assert.equal(mgc.resolveMascotCamp('GPT-5.2 (低)'), 'gpt');
  assert.equal(mgc.resolveMascotCamp('o3-mini'), 'gpt');
  assert.equal(mgc.resolveMascotCamp('DeepSeek R1'), 'deepseek');
  assert.equal(mgc.resolveMascotCamp('深度求索 V3'), 'deepseek');
  assert.deepEqual(mgc.parseModelLabelInfo('GPT-5.2 (低)'), {
    brand: 'openai',
    tier: 'low',
    isOrchestrator: false,
    camp: 'gemini',
  });
  const ctrl = mgc.createModelGlyphCrystalController({});
  const mockBtn = { nodeType: 1, textContent: 'DeepSeek R1 (高思考)', getAttribute: () => null };
  const trigInfo = ctrl.parseModelTriggerInfo(mockBtn);
  assert.equal(trigInfo.brand, 'openai');
  assert.equal(trigInfo.camp, 'gemini');
  assert.equal(trigInfo.mascotCamp, 'deepseek');
});

test('Custom mascot roster DSL: single-toggle 0/1 clamp, canonical folding, 3-way validation parity, 4-actor hot swap & VRAM cleanup, 520px layout, camp fallback & pure-minis r:+m', () => {
  const cdp = require('../cdp.js');
  const sp = require('../settings-panel.js');

  assert.equal(rig.MASCOT_MAX_PER_SPECIES, 1, 'MASCOT_MAX_PER_SPECIES must be strictly 1');
  assert.equal(rig.MASCOT_MAX_TOTAL, 4, 'MASCOT_MAX_TOTAL must be strictly 4');

  // 1. Canonical folding, legacy multi-count 0/1 clamping & bidirectional consistency across rig, settings-panel, and cdp
  const foldCases = [
    ['off', 'off'],
    ['crab', 'crab'],
    ['dual', 'crab'],
    ['minis', 'minis'],
    ['quad', 'quad'],
    ['quad-minis', 'quad-minis'],
    ['r:c0', 'off'],
    ['r:c0,k0,d0,w0', 'off'],
    ['r:c1,k1', 'crab'],
    ['r:k1,c1', 'crab'],
    ['r:c1,k1+m', 'minis'],
    ['r:w1,d1,k1,c1', 'quad'],
    ['r:w1,d1,k1,c1+m', 'quad-minis'],
    ['r:w1,d1', 'r:d1,w1'],
    ['r:c2,k1', 'crab'],
    ['r:c2,k1+m', 'minis'],
    ['r:d2,w3', 'r:d1,w1'],
    ['r:+m', 'r:+m'],
    ['r:c4,k2', 'crab'],
    ['r:c4,k2+m', 'minis'],
    ['r:c2,k2,d1,w1+m', 'quad-minis'],
  ];
  for (const [input, expected] of foldCases) {
    assert.equal(rig.isValidMascotValue(input), true, `rig must accept ${input}`);
    assert.equal(rig.normalizeMascotValue(input), expected, `rig fold mismatch for ${input}`);
    assert.equal(cdp.validateConfigEntry('mascot', input), true, `cdp must accept ${input}`);
    assert.equal(cdp.reconcileConfigAliases({ mascot: input }).mascot, expected, `cdp reconcile fold mismatch for ${input}`);
    const imp = sp.validateImportedConfigJson(JSON.stringify({ mascot: input }));
    assert.equal(imp.ok, true, `settings-panel must accept ${input}`);
    assert.equal(imp.settings.mascot, expected, `settings-panel fold mismatch for ${input}`);
  }

  // Invalid DSL inputs strictly rejected by all 3 validators
  const invalidCases = ['r:', 'r:x1', 'r:c5', 'r:c4,k3', 'r:c2,k2,d2,w1', 'r:c1,c2', 'r:c-1', 'r:c1+x', 'r:c1+m+m', 'invalid', ''];
  for (const bad of invalidCases) {
    assert.equal(rig.isValidMascotValue(bad), false, `rig must reject ${bad}`);
    assert.equal(cdp.validateConfigEntry('mascot', bad), false, `cdp must reject ${bad}`);
    assert.equal(sp.validateImportedConfigJson(JSON.stringify({ mascot: bad })).ok, false, `settings-panel must reject ${bad}`);
  }

  // 2. Legacy multi-count input clamps cleanly to 4 unique main actors + 7-tier totem stack inside 520px
  const { doc } = createRigMockDom(520);
  const hostEl = doc.createElement('div');
  const stage = rig.mountDualMascotStage(hostEl, { mascot: 'r:c2,k2,d1,w1+m', camp: 'claude', streaming: true, reducedMotion: true });
  try {
    let snap = stage.getLayoutSnapshot();
    assert.equal(snap.mascot, 'quad-minis');
    assert.deepEqual(snap.actors.map((a) => a.id), ['cat', 'clawd', 'dragon', 'whale']);

    // All 4 actors fit cleanly inside 520px stage without overflow or overlap
    const xs = snap.actors.map((a) => a.x).sort((a, b) => a - b);
    assert.ok(xs[0] >= 8, `Leftmost actor overflowed: x=${xs[0]}`);
    assert.ok(xs[xs.length - 1] <= 432, `Rightmost actor overflowed 520px stage: x=${xs[xs.length - 1]}`);
    for (let i = 1; i < xs.length; i++) {
      assert.ok(xs[i] - xs[i - 1] >= 34, `Actors overlapped at 520px: gap=${xs[i] - xs[i - 1]}`);
    }

    // Camp teamwork: Claude crab writes while others loaf/sleep
    const byId = Object.fromEntries(snap.actors.map((a) => [a.id, a]));
    assert.equal(byId.clawd.pose, 'write');
    assert.equal(byId.cat.pose, 'loaf');
    assert.equal(byId.dragon.pose, 'sleep');
    assert.equal(byId.whale.pose, 'loaf');

    // Dynamic 7-tier totem stack (4 unique mains + 3 mini crabs)
    const chain = ['cat', 'clawd', 'dragon', 'whale', 'cowboy', 'shades', 'wizard'];
    for (let i = 1; i < chain.length; i++) {
      assert.equal(stage.stackOnto(chain[i], chain[i - 1]), true, `stackOnto(${chain[i]}, ${chain[i - 1]}) should succeed`);
    }
    assert.equal(stage.getLayoutSnapshot().towers[0].length, 7, '4 mains + 3 minis must support 7-tier totem tower');

    // 3. Hot swap down to dragon+whale only: removed DOM nodes & canvases reclaimed to 0x0
    const removedEls = hostEl.children.filter((n) => ['cat', 'clawd'].includes(n.getAttribute?.('data-mascot-id')));
    assert.equal(removedEls.length, 2);
    const removedCanvases = removedEls.map((el) => el.children[0]);

    stage.setState({ mascot: 'r:d1,w1', camp: 'gemini', streaming: true });
    snap = stage.getLayoutSnapshot();
    assert.equal(snap.mascot, 'r:d1,w1');
    assert.deepEqual(snap.actors.map((a) => a.id), ['dragon', 'whale']);
    assert.equal(hostEl.children.filter((n) => n.className === 'ag-v2-mascot-actor').length, 2);
    for (const cv of removedCanvases) {
      assert.equal(cv.width, 0, 'Removed actor canvas width must be reclaimed to 0');
      assert.equal(cv.height, 0, 'Removed actor canvas height must be reclaimed to 0');
      assert.equal(cv._ctx, null, 'Removed actor canvas _ctx must be cleared');
    }

    // Absent-camp fallback: camp='gemini' with only dragon+whale triggers handoff onto dragon ('happy'),
    // and direct streaming mount with absent camp cleanly assigns 'write' to activeMainActors()[0] (dragon)
    const dOnly = Object.fromEntries(snap.actors.map((a) => [a.id, a]));
    assert.equal(dOnly.dragon.pose, 'happy', 'Camp handoff with absent camp must target fallback leader dragon');
    const hostFallback = doc.createElement('div');
    const stageFallback = rig.mountDualMascotStage(hostFallback, { mascot: 'r:d1,w1', camp: 'gemini', streaming: true, reducedMotion: true });
    try {
      const fbById = Object.fromEntries(stageFallback.getLayoutSnapshot().actors.map((a) => [a.id, a]));
      assert.equal(fbById.dragon.pose, 'write', 'Absent camp during streaming must gracefully fall back to activeMainActors()[0]');
      assert.equal(fbById.whale.pose, 'loaf');
    } finally {
      stageFallback.dispose();
    }

    // 4. Pure mini-crabs mode r:+m (0 main actors): zero errors across all interactions & notifications
    stage.setState({ mascot: 'r:+m', camp: 'claude', streaming: false });
    snap = stage.getLayoutSnapshot();
    assert.equal(snap.mascot, 'r:+m');
    assert.equal(snap.actors.length, 0);
    assert.equal(snap.miniPileEnabled, true);
    assert.equal(hostEl.children.filter((n) => n.className === 'ag-v2-mascot-actor').length, 0);

    assert.doesNotThrow(() => {
      stage.notify('send');
      stage.notify('vial-high');
      stage.notify('aura-complete');
      stage.notify('code-copied');
      stage.notify('files-changed');
      stage.notify('model-shift');
      stage.notify('effort-tier', { tier: 'high' });
      stage.notify('slash-cmd', { cmd: 'plan' });
      stage.notify('slash-cmd', { cmd: 'teamwork' });
      stage.notify('streamDone', { error: false });
      stage.notify('streamDone', { error: true });
      stage.onUserType('hello?');
      stage.onUserType('world!');
      stage.onUserType('typing');
      stage.triggerDemo('bump');
      stage.triggerDemo('stack');
      stage.triggerDemo('unstack');
      stage.triggerDemo('toss');
      stage.triggerDemo('poke');
      stage.triggerDemo('campSwitch');
      stage.triggerDemo('theater');
      stage.poke('cat');
      stage.feed('cat', 'donut');
    }, 'Pure mini-crabs mode r:+m must execute all actions with zero errors');

    // Mini crabs can still stack up to 3 tiers in r:+m mode
    assert.equal(stage.stackOnto('shades', 'cowboy'), true);
    assert.equal(stage.stackOnto('wizard', 'shades'), true);
    assert.equal(stage.getLayoutSnapshot().towers[0].length, 3);
  } finally {
    stage.dispose();
  }
});

test('Periodic picker PP_OPEN 0fps sleep covers 4-species quad-minis roster and restores cleanly', () => {
  const { doc, html } = createRigMockDom(760);
  const hostEl = doc.createElement('div');
  doc.body.appendChild(hostEl);
  const stage = rig.mountDualMascotStage(hostEl, { mascot: 'quad-minis', camp: 'gpt', reducedMotion: false });
  try {
    assert.equal(stage.getLayoutSnapshot().actors.length, 4);
    assert.equal(stage.getLayoutSnapshot().perf.timerIntervalMs, 100, 'Active quad-minis roster must tick at 100ms');

    // Open periodic picker -> immediate 0fps heartbeat pause
    html.setAttribute('data-ag-pp-open', '1');
    assert.equal(stage.getLayoutSnapshot().perf.timerIntervalMs, 0, 'PP_OPEN=1 must pause roster heartbeat to 0fps');
    assert.equal(stage.getLayoutSnapshot().perf.timerPaused, true);

    // Close periodic picker -> cleanly wakes back to 100ms
    html.removeAttribute('data-ag-pp-open');
    assert.equal(stage.getLayoutSnapshot().perf.timerIntervalMs, 100, 'Removing PP_OPEN must wake roster back to 100ms');
  } finally {
    stage.dispose();
  }
});

test('Octopath HD-2D 16:9 Mascot Casting Stage sub-panel: Ch9 fallback when mascot=off, 5-slot pure toggles, 4 presets, 0x0 VRAM reclaim, 36 schema keys, 8-lang zero-CJK & MIT credits', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const sp = require('../settings-panel.js');
  const i18nLocales = require('../i18n-locales.js');

  // 1. Strict 40 schema keys (39 upstream + effortSliderStyle) & 4 mascot presets
  assert.equal(Object.keys(sp.PRISM_SETTINGS_SCHEMA).length, 40, 'PRISM_SETTINGS_SCHEMA must remain strictly 40 keys');
  assert.deepEqual([...sp.PRISM_SETTINGS_SCHEMA.mascot.allowed], ['crab', 'quad', 'quad-minis', 'off']);

  // 2. 8-language coverage (including all stage keys), /4 cap copy, zero CJK in en/es/fr/de, and 0 new keys leaked into RUNTIME_UI_KEYS
  const newKeys = [
    'optMascotCrab', 'optMascotMinis', 'optMascotQuad', 'optMascotQuadMinis', 'optMascotOff',
    'mascotRosterTitle', 'mascotRosterCount', 'mascotRosterMinis',
    'mascotSpeciesCrab', 'mascotSpeciesCat', 'mascotSpeciesDragon', 'mascotSpeciesWhale',
    'mascotStageOpenBtn', 'mascotStageTitle', 'mascotStageBackBtn', 'mascotStageHint',
    'mascotStagePresetDual', 'mascotStagePresetQuad', 'mascotStagePresetOff',
    'mascotStageMinisSlot', 'mascotStageActiveOn', 'mascotStageActiveOff',
  ];
  const runtimeKeySet = new Set(i18nLocales.RUNTIME_UI_KEYS);
  for (const k of newKeys) {
    assert.equal(runtimeKeySet.has(k), false, `New mascot settings key '${k}' must NOT be in RUNTIME_UI_KEYS`);
  }
  const CJK_RE = /[\u3000-\u30ff\u3400-\u9fff\uac00-\ud7af\uff00-\uffef]/;
  for (const lang of ['zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'es', 'fr', 'de']) {
    const ui = i18nLocales.getUiStrings(lang);
    assert.ok(ui.mascotRosterCount.includes('/4'), `mascotRosterCount for ${lang} must reflect /4 cap`);
    for (const k of newKeys) {
      assert.ok(typeof ui[k] === 'string' && ui[k].trim().length > 0, `Missing i18n key ${k} for ${lang}`);
      if (['en', 'es', 'fr', 'de'].includes(lang)) {
        assert.equal(CJK_RE.test(ui[k]), false, `CJK leak in ${lang}.${k}: ${ui[k]}`);
      }
    }
  }

  // 3. Credits & third-party MIT attribution for wp3171216237/dsh-TUI
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const noticeTxt = fs.readFileSync(path.join(rootDir, 'NOTICE'), 'utf8');
  const thirdPartyTxt = fs.readFileSync(path.join(rootDir, 'THIRD_PARTY_NOTICES.md'), 'utf8');
  assert.ok(noticeTxt.includes('wp3171216237/dsh-TUI'), 'NOTICE must credit wp3171216237/dsh-TUI');
  assert.ok(thirdPartyTxt.includes('wp3171216237/dsh-TUI') && thirdPartyTxt.includes('chimney'), 'THIRD_PARTY_NOTICES.md must include wp3171216237/dsh-TUI MIT notice');
  assert.ok(sp.UPSTREAM_CREDITS.some((c) => c.repo === 'wp3171216237/dsh-TUI'), 'settings-panel UPSTREAM_CREDITS must include wp3171216237/dsh-TUI');

  // 4. Interactive HD-2D Stage Sub-panel E2E test starting from mascot='off' (without Ch10 loaded, and with Mock 2D Canvas falling back safely)
  const { doc, metrics } = createRigMockDom(760);
  const dlg = doc.createElement('div');
  dlg.setAttribute('role', 'dialog');
  const panel = doc.createElement('div');
  panel.className = 'p-6';
  const anchor = doc.createElement('div');
  anchor.className = 'space-y-2';
  const h2 = doc.createElement('h2');
  h2.textContent = 'Appearance';
  anchor.appendChild(h2);
  panel.appendChild(anchor);
  dlg.appendChild(panel);
  doc.body.appendChild(dlg);

  const state = { ...sp.getDefaultSettingsPatch(), mascot: 'off' };
  const langNow = 'zh-CN';
  const prevDoc = globalThis.document;
  const prevArt = globalThis.__agPrismMascotArt;
  const prevRig = globalThis.__agDualMascotRig;
  const prevGl = globalThis.__agOctopathStageWebGL;
  delete globalThis.__agPrismMascotArt;
  delete globalThis.__agDualMascotRig;
  // Mount WebGL2 engine module into globalThis to verify strict Mock 2D Canvas rejection -> graceful 2.5D fallback
  globalThis.__agOctopathStageWebGL = require('../vendor/clawd-mascot/octopath-stage-webgl.js');
  globalThis.document = doc;
  try {
    sp.mountOrSyncSettingsSection({
      version: '1.0.8',
      lazyFold: false,
      getLang: () => langNow,
      uiText: (l) => i18nLocales.getUiStrings(l),
      formatSettingsSummary: () => 'summary',
      resolveSettingRowActiveValue: (k) => state[k],
      saveSetting: (k, v) => { state[k] = v; },
      saveSettingsBatch: (patch) => { Object.assign(state, patch); },
      getThoughtTranslateMode: () => state.thoughtTranslate,
      runGuardedMut: (fn) => fn(),
    });

    const sec = doc.getElementById(sp.SETTINGS_SEC_ID);
    assert.ok(sec && sec.__agMascotStageApi, 'Settings section must expose __agMascotStageApi');
    const stageApi = sec.__agMascotStageApi;

    const mascotRow = panel.querySelector('[data-ag-cs-row="mascot"]');
    assert.ok(mascotRow, 'Mascot settings row must render');
    const presetBtns = mascotRow.querySelectorAll('button[data-ag-cs-key="mascot"]');
    assert.equal(presetBtns.length, 4, 'Mascot row must present 4 quick preset buttons');
    const openStageBtn = mascotRow.querySelector('button[data-ag-mascot-stage-open="1"]');
    assert.ok(openStageBtn, 'Mascot row must render Open Casting Stage button');
    assert.ok(openStageBtn.children[0]?.innerHTML?.includes('<svg'), 'Stage entry button must render built-in SVG spotlight icon (no emoji)');

    // Before opening stage: 0 CPU / 0 VRAM invariant
    assert.equal(stageApi.isOpen(), false);
    assert.equal(stageApi.canvas.width, 0, 'Closed stage canvas width must be 0 (0 VRAM)');
    assert.equal(stageApi.canvas.height, 0, 'Closed stage canvas height must be 0 (0 VRAM)');
    assert.equal(metrics.rafCalls, 0, 'Closed stage must schedule 0 rAF ticks');

    // Open stage while mascot='off' and Ch10 absent -> rejects fake 2D Mock as WebGL2 and renders 16:9 2.5D fallback
    openStageBtn.click();
    assert.equal(stageApi.isOpen(), true);
    assert.equal(stageApi.getBackend(), 'canvas2d', 'Mock 2D Canvas must never fool WebGL2 probe');
    assert.equal(stageApi.canvas.style.aspectRatio, '16 / 9', 'Stage canvas must use 16:9 cinematic aspect ratio');
    assert.equal(stageApi.getArtSource(), 'ch9-fallback', 'Must use built-in Ch9 fallback pixel renderer when Ch10 is absent');
    assert.ok(stageApi.canvas.width > 0 && stageApi.canvas.height > 0, 'Open stage canvas must allocate backing store');
    assert.ok(metrics.fillRectCalls > 120, `Stage must render real pixel sprites on first frame (got ${metrics.fillRectCalls} fillRects)`);
    assert.ok(metrics.activeRafIds.size >= 1, 'Open stage must run active rAF loop');

    const stageView = sec.querySelector('[data-ag-mascot-stage-view="1"]');
    assert.equal(stageView.hidden, false);

    // Stepper controls & ×2 badges must be completely removed
    assert.equal(stageView.querySelector('[data-ag-mascot-inc]'), null, 'Stepper + must be removed');
    assert.equal(stageView.querySelector('[data-ag-mascot-dec]'), null, 'Stepper - must be removed');
    assert.equal(stageView.querySelector('[data-ag-mascot-val]'), null, 'Stepper value must be removed');
    assert.equal(stageView.querySelector('[data-ag-stage-badge]'), null, 'Multi-count badge must be removed');

    const toggleBtn = (key) => stageView.querySelector(`button[data-ag-mascot-toggle="${key}"]`);
    const minisBtn = stageView.querySelector('button[data-ag-mascot-minis="1"]');
    const countEl = stageView.querySelector('[data-ag-mascot-count]');
    const stagePresets = stageView.querySelectorAll('button[data-ag-stage-preset]');
    const stagePreset = (val) => stageView.querySelector(`button[data-ag-stage-preset="${val}"]`);
    assert.equal(stagePresets.length, 4, 'Stage bottom bar must expose 4 presets');
    assert.strictEqual(toggleBtn('minis'), minisBtn, '5th toggle button must preserve data-ag-mascot-minis="1" hook');

    // Hover resting dragon slot -> spotlight pre-warms (> 0)
    stageApi.hoverSlot(2);
    assert.ok(stageApi.getSlotStates()[2].light > 0, 'Hovering resting slot must warm up spotlight');
    stageApi.hoverSlot(-1);

    // Click slot 0 (Claude Crab) -> 0 -> 1 quick toggle triggers spotlight & cheering state
    stageApi.clickSlot(0);
    assert.equal(state.mascot, 'r:c1');
    assert.equal(toggleBtn('c').getAttribute('aria-pressed'), 'true');
    assert.equal(stageApi.getSlotStates()[0].cheering, true, 'Activating slot must trigger cheering pose');
    // Click slot 0 again -> 1 -> 0 farewell & spotlight off
    stageApi.clickSlot(0);
    assert.equal(state.mascot, 'off');
    assert.equal(toggleBtn('c').getAttribute('aria-pressed'), 'false');
    assert.equal(stageApi.getSlotStates()[0].farewell, true, 'Deactivating slot must trigger farewell animation');

    // Toggle all 4 unique species on via nameplate switches -> total === 4 ('quad')
    toggleBtn('d').click();
    assert.equal(state.mascot, 'r:d1');
    assert.equal(stageApi.getSlotStates()[2].cheering, true, 'Activating GPT Dragon must trigger dragonFlame cheer');
    toggleBtn('c').click();
    toggleBtn('k').click();
    toggleBtn('w').click();
    assert.equal(state.mascot, 'quad');
    assert.equal(countEl.getAttribute('data-total'), '4');

    // Toggle 5th slot (Mini Crab Corner) -> lights up mini-crab spotlight & updates state to 'quad-minis'
    minisBtn.click();
    assert.equal(state.mascot, 'quad-minis');
    assert.equal(minisBtn.getAttribute('aria-pressed'), 'true');
    assert.equal(stageApi.getSlotStates()[4].cheering, true, 'Activating 5th mini-crab corner must trigger mini-crab cheer');

    // Clicking stage bottom preset 'crab' syncs roster back to classic dual
    stagePreset('crab').click();
    assert.equal(state.mascot, 'crab');
    assert.equal(countEl.getAttribute('data-total'), '2');
    assert.equal(stagePreset('crab').getAttribute('aria-pressed'), 'true');

    // Clicking stage bottom preset 'quad-minis' restores all 4 + minis
    stagePreset('quad-minis').click();
    assert.equal(state.mascot, 'quad-minis');
    assert.equal(countEl.getAttribute('data-total'), '4');

    // When Ch10 mascotArt is mounted, stage automatically upgrades to full Ch10 live art renderer
    globalThis.__agPrismMascotArt = rig.mascotArt;
    stageApi.renderNow();
    assert.equal(stageApi.getArtSource(), 'ch10-rig', 'Stage must prefer live Ch10 __agPrismMascotArt when loaded');

    // document.hidden = true immediately cancels rAF and reclaims canvas to 0x0 VRAM
    const cancelsBeforeHide = metrics.cancelRafCalls;
    doc.hidden = true;
    doc.dispatchEvent({ type: 'visibilitychange' });
    assert.ok(metrics.cancelRafCalls > cancelsBeforeHide, 'document.hidden must cancel active rAF');
    assert.equal(metrics.activeRafIds.size, 0, '0 active rAF loops while document.hidden');
    assert.equal(stageApi.canvas.width, 0, 'document.hidden must reclaim stage canvas width to 0');
    assert.equal(stageApi.canvas.height, 0, 'document.hidden must reclaim stage canvas height to 0');

    // Restore visible -> canvas & rAF resume cleanly
    doc.hidden = false;
    doc.dispatchEvent({ type: 'visibilitychange' });
    assert.ok(stageApi.canvas.width > 0 && stageApi.canvas.height > 0);
    assert.ok(metrics.activeRafIds.size >= 1);

    // Press Escape -> exits stage, cancels rAF, reclaims 0x0 VRAM, restores main settings with synced summary
    const cancelsBeforeEsc = metrics.cancelRafCalls;
    doc.dispatchEvent({ type: 'keydown', key: 'Escape', preventDefault() {}, stopPropagation() {} });
    assert.equal(stageApi.isOpen(), false);
    assert.equal(stageView.hidden, true);
    assert.ok(metrics.cancelRafCalls > cancelsBeforeEsc, 'Esc exit must cancel active rAF');
    assert.equal(metrics.activeRafIds.size, 0);
    assert.equal(stageApi.canvas.width, 0, 'Closing stage must reclaim canvas width to 0');
    assert.equal(stageApi.canvas.height, 0, 'Closing stage must reclaim canvas height to 0');
    assert.equal(mascotRow.querySelector('[data-ag-mascot-summary-count]').getAttribute('data-total'), '4');

    // Re-open & exit via Back button also cleanly reclaims VRAM
    openStageBtn.click();
    assert.equal(stageApi.isOpen(), true);
    stageView.querySelector('button[data-ag-mascot-stage-back="1"]').click();
    assert.equal(stageApi.isOpen(), false);
    assert.equal(stageApi.canvas.width, 0);
    assert.equal(metrics.activeRafIds.size, 0);

    // Scene preset 'eco' in main settings resets mascot to 'off' and syncs summary bar to 0/4
    const ecoBtn = panel.querySelector('button[data-ag-cs-preset="eco"]');
    assert.ok(ecoBtn, 'Eco scene preset button must exist');
    ecoBtn.click();
    assert.equal(state.mascot, 'off');
    assert.equal(mascotRow.querySelector('[data-ag-mascot-summary-count]').getAttribute('data-total'), '0');
    assert.equal(presetBtns.find((b) => b.getAttribute('data-ag-cs-val') === '"off"').getAttribute('aria-pressed'), 'true');
  } finally {
    if (prevArt === undefined) delete globalThis.__agPrismMascotArt;
    else globalThis.__agPrismMascotArt = prevArt;
    if (prevRig === undefined) delete globalThis.__agDualMascotRig;
    else globalThis.__agDualMascotRig = prevRig;
    if (prevGl === undefined) delete globalThis.__agOctopathStageWebGL;
    else globalThis.__agOctopathStageWebGL = prevGl;
    if (prevDoc === undefined) delete globalThis.document;
    else globalThis.document = prevDoc;
  }
});

test('Octopath WebGL2 HD-2D engine: 4-FBO MRT pipeline, GL_NEAREST pixel filtering, 3D parallax & ray picking, hot-swap atlas & full WEBGL_lose_context VRAM reclaim', () => {
  const octo = require('../vendor/clawd-mascot/octopath-stage-webgl.js');
  const cdp = require('../cdp.js');

  // 1. Strict WebGL2 capability probe rejects Mock 2D contexts
  assert.equal(octo.isRealWebGL2Context({ fillRect() {}, clearRect() {} }), false);
  assert.equal(octo.isSupported({ getContext: () => ({ fillRect() {} }) }), false);

  // 2. Instrument a faithful WebGL2 mock context to verify shaders, 4 FBOs, MRT, NEAREST filtering, draw calls, and full disposal
  const counts = {
    shaders: 0, programs: 0, vaos: 0, buffers: 0, textures: 0, fbos: 0, rbos: 0,
    delShaders: 0, delPrograms: 0, delVaos: 0, delBuffers: 0, delTextures: 0, delFbos: 0, delRbos: 0,
    drawCalls: 0, drawBuffersMrt: 0, nearestFilters: 0, loseContextCalls: 0, texSubImageCalls: 0,
  };
  let idSeq = 1;
  const mockGl = {
    VERTEX_SHADER: 0x8b31, FRAGMENT_SHADER: 0x8b30, COMPILE_STATUS: 0x8b81, LINK_STATUS: 0x8b82,
    ARRAY_BUFFER: 0x8892, STATIC_DRAW: 0x88e4, FLOAT: 0x1406, TRIANGLES: 0x0004,
    TEXTURE_2D: 0x0de1, TEXTURE0: 0x84c0, TEXTURE1: 0x84c1, TEXTURE2: 0x84c2,
    RGBA: 0x1908, UNSIGNED_BYTE: 0x1401, UNPACK_ALIGNMENT: 0x0cf5, UNPACK_FLIP_Y_WEBGL: 0x9240,
    TEXTURE_MIN_FILTER: 0x2801, TEXTURE_MAG_FILTER: 0x2800, TEXTURE_WRAP_S: 0x2802, TEXTURE_WRAP_T: 0x2803,
    NEAREST: 0x2600, LINEAR: 0x2601, CLAMP_TO_EDGE: 0x812f, REPEAT: 0x2901,
    FRAMEBUFFER: 0x8d40, RENDERBUFFER: 0x8d41, DEPTH_COMPONENT16: 0x81a5,
    COLOR_ATTACHMENT0: 0x8ce0, COLOR_ATTACHMENT1: 0x8ce1, DEPTH_ATTACHMENT: 0x8d00,
    FRAMEBUFFER_COMPLETE: 0x8cd5, COLOR: 0x1800, DEPTH_BUFFER_BIT: 0x0100,
    DEPTH_TEST: 0x0b71, BLEND: 0x0be2, SRC_ALPHA: 0x0302, ONE_MINUS_SRC_ALPHA: 0x0303, ONE: 1,
    createShader() { counts.shaders += 1; return { id: idSeq++ }; },
    shaderSource() {},
    compileShader() {},
    getShaderParameter() { return true; },
    deleteShader() { counts.delShaders += 1; },
    createProgram() { counts.programs += 1; return { id: idSeq++ }; },
    attachShader() {},
    linkProgram() {},
    getProgramParameter() { return true; },
    deleteProgram() { counts.delPrograms += 1; },
    getUniformLocation(_p, name) { return { name }; },
    createVertexArray() { counts.vaos += 1; return { id: idSeq++ }; },
    bindVertexArray() {},
    deleteVertexArray() { counts.delVaos += 1; },
    createBuffer() { counts.buffers += 1; return { id: idSeq++ }; },
    bindBuffer() {},
    bufferData() {},
    deleteBuffer() { counts.delBuffers += 1; },
    enableVertexAttribArray() {},
    vertexAttribPointer() {},
    createTexture() { counts.textures += 1; return { id: idSeq++ }; },
    activeTexture() {},
    bindTexture() {},
    pixelStorei() {},
    texParameteri(_t, _p, val) { if (val === 0x2600) counts.nearestFilters += 1; },
    texImage2D() {},
    texSubImage2D() { counts.texSubImageCalls += 1; },
    deleteTexture() { counts.delTextures += 1; },
    createFramebuffer() { counts.fbos += 1; return { id: idSeq++ }; },
    bindFramebuffer() {},
    framebufferTexture2D() {},
    checkFramebufferStatus() { return 0x8cd5; },
    deleteFramebuffer() { counts.delFbos += 1; },
    createRenderbuffer() { counts.rbos += 1; return { id: idSeq++ }; },
    bindRenderbuffer() {},
    renderbufferStorage() {},
    framebufferRenderbuffer() {},
    deleteRenderbuffer() { counts.delRbos += 1; },
    drawBuffers(arr) { if (Array.isArray(arr) && arr.length === 2) counts.drawBuffersMrt += 1; },
    viewport() {},
    enable() {},
    disable() {},
    depthMask() {},
    blendFunc() {},
    clearBufferfv() {},
    clear() {},
    useProgram() {},
    uniform1i() {},
    uniform2f() {},
    uniform4f() {},
    uniform4fv() {},
    uniformMatrix4fv() {},
    drawArrays() { counts.drawCalls += 1; },
    getExtension(name) {
      if (name === 'WEBGL_lose_context') {
        return { loseContext() { counts.loseContextCalls += 1; } };
      }
      return null;
    },
  };

  assert.equal(octo.isRealWebGL2Context(mockGl), true);

  const sprite2d = {
    imageSmoothingEnabled: false,
    fillStyle: '',
    clearRect() {},
    fillRect() {},
  };
  const mockDoc = {
    defaultView: { devicePixelRatio: 1.5 },
    createElement(tag) {
      return { tagName: tag.toUpperCase(), width: 0, height: 0, getContext: (k) => (k === '2d' ? sprite2d : null) };
    },
  };
  const mockCanvas = {
    width: 0,
    height: 0,
    ownerDocument: mockDoc,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 360 }),
    getContext: (kind) => (kind === 'webgl2' ? mockGl : null),
    addEventListener() {},
    removeEventListener() {},
  };

  const inst = octo.createStage({ canvas: mockCanvas, doc: mockDoc });
  assert.ok(inst, 'WebGL2 createStage must initialize cleanly on valid WebGL2 context');
  assert.equal(counts.programs, 4, 'Must compile 4 programs (Scene MRT, FX, Blur, Composite)');
  assert.ok(counts.nearestFilters >= 10, 'Pixel textures must strictly apply gl.NEAREST');

  // Render a frame with all 5 slots & pointer parallax active
  inst.setPointer(0.8, -0.5, true);
  const slotInfos = octo.SLOT_WORLD_POS.map((sp, i) => ({
    kind: sp.kind,
    pose: i === 2 ? 'dragonFlame' : i === 3 ? 'whaleSpout' : 'idle',
    sym: null,
    cnt: 1,
    light: 1,
    cheering: i === 2,
    cheerProg: i === 2 ? 0.35 : 0,
    rippleProg: i === 2 ? 0.35 : 0,
    farewell: false,
    isHov: false,
    jumpWorld: 0.1,
    breath: false,
    blink: false,
    animTick: 3,
    clipTick: 3,
  }));
  const ok = inst.render(1000, { dt: 33, light: false, reducedMotion: false, art: rig.mascotArt, tickIdx: 6, slotInfos });
  assert.equal(ok, true);
  assert.equal(counts.fbos, 5, 'Must allocate 5 FBOs (Scene MRT + Bloom A/B + Blur A/B)');
  assert.ok(counts.drawBuffersMrt >= 2, 'Scene pass must target 2-attachment MRT (scene + emissive)');
  assert.ok(counts.drawCalls >= 40, `Expected full 3D tavern props + mascots + beams + post-FX draw calls (got ${counts.drawCalls})`);
  assert.ok(counts.texSubImageCalls >= 1, 'Dirty mascot sprites must upload via texSubImage2D');

  const st = inst.getStats();
  assert.equal(st.backend, 'webgl2');
  assert.equal(st.width, 960);
  assert.equal(st.height, 540);
  assert.equal(st.propCount, 21);
  assert.ok(st.cameraYawDeg > 0, 'Right pointer must pan camera yaw smoothly');

  // 3D ray/NDC picking hits center slot (index 2: dragon) cleanly
  assert.equal(inst.pickSlot(0.0, -0.1), 2, '3D projected picking near center must hit slot 2 (GPT Dragon)');
  assert.equal(inst.pickSlot(0.99, 0.99), -1, 'Upper-right corner sky must return -1');

  // Hot-swap external tavern-atlas-data.js if present (seamless Image decode -> gl.NEAREST upgrade)
  const fs = require('node:fs');
  const path = require('node:path');
  const atlasFile = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'vendor', 'clawd-mascot', 'tavern-atlas-data.js');
  if (fs.existsSync(atlasFile)) {
    const prevAtlas = globalThis.__agOctopathTavernAtlas;
    const prevImg = globalThis.Image;
    try {
      const atlas = require(atlasFile);
      globalThis.__agOctopathTavernAtlas = atlas;
      globalThis.Image = class MockImage {
        set src(val) {
          this._src = val;
          this.naturalWidth = val === atlas.wallDataUrl ? atlas.wallW : val === atlas.floorDataUrl ? atlas.floorW : atlas.propsW;
          this.naturalHeight = val === atlas.wallDataUrl ? atlas.wallH : val === atlas.floorDataUrl ? atlas.floorH : atlas.propsH;
          if (typeof this.onload === 'function') this.onload();
        }
      };
      const okAtlas = inst.render(1050, { dt: 33, light: false, reducedMotion: false, art: rig.mascotArt, tickIdx: 7, slotInfos });
      assert.equal(okAtlas, true);
      assert.deepEqual(inst.getStats().atlasLoaded, { wall: true, floor: true, props: true }, 'External tavern-atlas-data.js must hot-swap all 3 textures');
    } finally {
      if (prevAtlas === undefined) delete globalThis.__agOctopathTavernAtlas;
      else globalThis.__agOctopathTavernAtlas = prevAtlas;
      if (prevImg === undefined) delete globalThis.Image;
      else globalThis.Image = prevImg;
    }
  }

  // Full VRAM reclaim on dispose()
  inst.dispose();
  assert.equal(mockCanvas.width, 0);
  assert.equal(mockCanvas.height, 0);
  assert.equal(counts.loseContextCalls, 1, 'dispose() must invoke WEBGL_lose_context.loseContext()');
  assert.equal(counts.delPrograms, counts.programs, 'All WebGL programs must be deleted on dispose');
  assert.equal(counts.delFbos, counts.fbos, 'All FBOs must be deleted on dispose');
  assert.equal(counts.delTextures, counts.textures, 'All textures must be deleted on dispose');

  // Channel 9 expression embeds WebGL2 stage module and SETTINGS_REMOVE_EXPRESSION cleans globals
  const ch9Expr = cdp.buildSettingsChannelExpression();
  assert.ok(ch9Expr.includes('__agOctopathStageWebGL'), 'Channel 9 must bundle octopath-stage-webgl.js');
  assert.ok(cdp.SETTINGS_REMOVE_EXPRESSION.includes('__agOctopathStageWebGL'), 'SETTINGS_REMOVE_EXPRESSION must clean WebGL global');
});

test('Mascot Casting Stage under prefers-reduced-motion: detaching dialog immediately reclaims 0x0 VRAM and unbinds document listeners + MutationObserver', () => {
  const sp = require('../settings-panel.js');
  const i18nLocales = require('../i18n-locales.js');
  const { doc, moInstances, docListeners } = createRigMockDom(760);
  doc.defaultView.matchMedia = () => ({ matches: true });

  const dlg = doc.createElement('div');
  dlg.setAttribute('role', 'dialog');
  const panel = doc.createElement('div');
  panel.className = 'p-6';
  const anchor = doc.createElement('div');
  anchor.className = 'space-y-2';
  const h2 = doc.createElement('h2');
  h2.textContent = 'Appearance';
  anchor.appendChild(h2);
  panel.appendChild(anchor);
  dlg.appendChild(panel);
  doc.body.appendChild(dlg);

  const state = { ...sp.getDefaultSettingsPatch(), mascot: 'quad' };
  const prevDoc = globalThis.document;
  globalThis.document = doc;
  try {
    sp.mountOrSyncSettingsSection({
      version: '1.0.8',
      lazyFold: false,
      getLang: () => 'en',
      uiText: (l) => i18nLocales.getUiStrings(l),
      formatSettingsSummary: () => 'summary',
      resolveSettingRowActiveValue: (k) => state[k],
      saveSetting: (k, v) => { state[k] = v; },
      saveSettingsBatch: (patch) => { Object.assign(state, patch); },
      getThoughtTranslateMode: () => state.thoughtTranslate,
      runGuardedMut: (fn) => fn(),
    });

    const sec = doc.getElementById(sp.SETTINGS_SEC_ID);
    const stageApi = sec.__agMascotStageApi;
    const openStageBtn = panel.querySelector('button[data-ag-mascot-stage-open="1"]');
    openStageBtn.click();

    assert.equal(stageApi.isOpen(), true);
    assert.equal(stageApi.getActiveRafId(), 0, 'reducedMotion stage must not schedule continuous rAF loop');
    assert.ok(stageApi.canvas.width > 0 && stageApi.canvas.height > 0, 'reducedMotion stage must still draw initial frame');
    assert.equal(docListeners.get('keydown')?.size || 0, 1);
    assert.equal(docListeners.get('visibilitychange')?.size || 0, 1);
    assert.ok(moInstances.some((m) => m.active && m.opts?.childList), 'Detach MutationObserver must be active while stage is open');

    // Simulate React directly unmounting the settings dialog without pressing Esc or visibilitychange
    dlg.remove();

    assert.equal(stageApi.isOpen(), false, 'Detaching settings dialog must immediately close stage even under reducedMotion');
    assert.equal(stageApi.canvas.width, 0, 'Detaching dialog must immediately reclaim canvas width to 0');
    assert.equal(stageApi.canvas.height, 0, 'Detaching dialog must immediately reclaim canvas height to 0');
    assert.equal(docListeners.get('keydown')?.size || 0, 0, 'keydown listener must be unbound immediately on detach');
    assert.equal(docListeners.get('visibilitychange')?.size || 0, 0, 'visibilitychange listener must be unbound immediately on detach');
    assert.equal(moInstances.some((m) => m.active && m.opts?.childList), false, 'Detach MutationObserver must self-disconnect after cleanup');
  } finally {
    if (prevDoc === undefined) delete globalThis.document;
    else globalThis.document = prevDoc;
  }
});

test('PR #51 queued-messages-card roof-perch: zero bottom gap, interactive roof anchor, upper takeover clearance, zero W->R reflow, and smooth fallback on [data-ag-queued-act="1"] exit', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const vm = await import('node:vm');
  const { fileURLToPath } = await import('node:url');
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const cdp = require('../cdp.js');

  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  assert.ok(
    css.includes('& [data-ag-cs-crab-anchor="queued"]{position:relative !important;overflow:visible !important;}'),
    'style.css must enforce relative+visible positioning on [data-ag-cs-crab-anchor="queued"]'
  );

  const events = [];
  let tracking = false;
  const observers = [];
  const rafQueue = [];
  const timers = new Set();

  const makeEl = (tag, opts = {}) => {
    const attrs = new Map(Object.entries(opts.attrs || {}));
    if (opts.id) attrs.set('id', opts.id);
    if (opts.className) attrs.set('class', opts.className);
    const styles = new Map();
    const children = [];
    const node = {
      nodeType: 1,
      tagName: tag.toUpperCase(),
      parentElement: null,
      children,
      childNodes: children,
      _text: opts.text || '',
      _rect: opts.rect || { left: 0, top: 0, width: 320, height: 40, right: 320, bottom: 40 },
      _offsetHeight: opts.offsetHeight ?? 40,
      get id() { return attrs.get('id') || ''; },
      set id(v) { attrs.set('id', String(v)); },
      get className() { return attrs.get('class') || ''; },
      set className(v) { attrs.set('class', String(v)); },
      get hidden() { return attrs.has('hidden'); },
      set hidden(v) { if (v) attrs.set('hidden', ''); else attrs.delete('hidden'); },
      get childElementCount() { return children.length; },
      get firstChild() { return children[0] || null; },
      get firstElementChild() { return children[0] || null; },
      get offsetHeight() { if (tracking) events.push({ op: 'R', kind: 'offsetHeight' }); return this._offsetHeight; },
      get textContent() { return this._text + children.map((c) => c.textContent).join(''); },
      set textContent(v) { this._text = String(v); children.length = 0; },
      get isConnected() {
        let cur = this;
        while (cur) { if (cur === html) return true; cur = cur.parentElement; }
        return false;
      },
      classList: {
        contains: (c) => (attrs.get('class') || '').split(/\s+/).filter(Boolean).includes(c),
        add: (...cs) => { const s = new Set((attrs.get('class') || '').split(/\s+/).filter(Boolean)); cs.forEach((c) => s.add(c)); attrs.set('class', [...s].join(' ')); },
        remove: (...cs) => { const s = new Set((attrs.get('class') || '').split(/\s+/).filter(Boolean)); cs.forEach((c) => s.delete(c)); attrs.set('class', [...s].join(' ')); },
      },
      style: {
        get display() { return styles.get('display') || ''; },
        set display(v) { if (v) styles.set('display', String(v)); else styles.delete('display'); },
        get visibility() { return styles.get('visibility') || ''; },
        set visibility(v) { if (v) styles.set('visibility', String(v)); else styles.delete('visibility'); },
        setProperty(k, v) { if (tracking && k === 'margin-bottom') events.push({ op: 'W', detail: k }); styles.set(String(k), String(v)); },
        getPropertyValue: (k) => styles.get(String(k)) || '',
        removeProperty(k) { if (tracking && k === 'margin-bottom') events.push({ op: 'W', detail: k }); styles.delete(String(k)); },
      },
      getBoundingClientRect() { if (tracking) events.push({ op: 'R', kind: 'rect' }); return this._rect; },
      checkVisibility() { if (tracking) events.push({ op: 'R', kind: 'checkVis' }); return !this.hidden && styles.get('display') !== 'none' && styles.get('visibility') !== 'hidden'; },
      getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
      setAttribute(k, v) {
        if (tracking && ['data-ag-cs-queued', 'data-ag-cs-takeover', 'data-ag-cs-crab-anchor'].includes(k)) events.push({ op: 'W', detail: k });
        attrs.set(k, String(v));
      },
      hasAttribute: (k) => attrs.has(k),
      removeAttribute(k) {
        if (tracking && ['data-ag-cs-queued', 'data-ag-cs-takeover', 'data-ag-cs-crab-anchor'].includes(k)) events.push({ op: 'W', detail: k });
        attrs.delete(k);
      },
      appendChild(c) { if (c.parentElement) c.remove(); c.parentElement = this; children.push(c); return c; },
      insertBefore(c, ref) { if (c.parentElement) c.remove(); c.parentElement = this; const i = children.indexOf(ref); if (i >= 0) children.splice(i, 0, c); else children.push(c); return c; },
      removeChild(c) { const i = children.indexOf(c); if (i >= 0) { children.splice(i, 1); c.parentElement = null; } return c; },
      remove() { if (!this.parentElement) return; const i = this.parentElement.children.indexOf(this); if (i >= 0) this.parentElement.children.splice(i, 1); this.parentElement = null; },
      matches(sel) {
        return String(sel).split(',').map((s) => s.trim()).filter(Boolean).some((s) => {
          const leaf = s.split(/\s+/).pop();
          if (leaf.startsWith('#')) return this.id === leaf.slice(1).replace(/\\/g, '');
          if (leaf.startsWith('.')) return this.classList.contains(leaf.slice(1));
          const am = leaf.match(/^([a-zA-Z0-9_-]*)\[([^=\]]+)(?:="([^"]*)")?\]$/);
          if (am) {
            if (am[1] && this.tagName !== am[1].toUpperCase()) return false;
            return am[3] !== undefined ? this.getAttribute(am[2]) === am[3] : this.hasAttribute(am[2]);
          }
          return this.tagName === leaf.toUpperCase();
        });
      },
      closest(sel) { let c = this; while (c) { if (c.matches(sel)) return c; c = c.parentElement; } return null; },
      querySelectorAll(sel) {
        const out = [];
        const walk = (n) => {
          for (const ch of n.children) {
            if (ch.matches(sel)) out.push(ch);
            walk(ch);
          }
        };
        walk(this);
        return out;
      },
      querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
      addEventListener() {},
      removeEventListener() {},
    };
    return node;
  };

  const html = makeEl('html');
  const head = makeEl('head');
  const body = makeEl('body');
  html.appendChild(head);
  html.appendChild(body);

  const convView = makeEl('div', { attrs: { 'data-testid': 'conversation-view' } });
  const rtcWrap = makeEl('div', { className: 'flex flex-col' });
  const takeoverWrap = makeEl('div', { className: 'relative' });
  const takeoverCard = makeEl('div', { attrs: { 'data-testid': 'interaction-takeover-card' }, text: 'Approve command' });
  takeoverWrap.appendChild(takeoverCard);
  const inputBox = makeEl('div', { attrs: { 'data-testid': 'agent-input-box' } });
  const queuedWrap = makeEl('div', { className: 'relative z-[1] flex flex-col gap-2 w-full mb-2' });
  const queuedCard = makeEl('div', { attrs: { 'data-testid': 'queued-messages-card' } });
  const queuedRow = makeEl('div', { text: '1 queued message' });
  queuedCard.appendChild(queuedRow);
  queuedWrap.appendChild(queuedCard);

  const composerShell = makeEl('div', { id: 'antigravity.agentSidePanelInputBox', className: 'surface-composer' });
  const card = makeEl('div', { className: 'surface-composer-card', rect: { left: 0, top: 200, width: 640, height: 96, right: 640, bottom: 296 }, offsetHeight: 96 });
  card.appendChild(makeEl('div', { className: 'agy-composer-footer' }));
  composerShell.appendChild(card);

  inputBox.appendChild(queuedWrap);
  inputBox.appendChild(composerShell);
  rtcWrap.appendChild(inputBox);
  convView.appendChild(rtcWrap);
  body.appendChild(convView);

  const doc = {
    documentElement: html,
    head,
    body,
    hidden: false,
    hasFocus: () => true,
    createElement: (t) => makeEl(t),
    getElementById: (id) => html.querySelector(`#${id}`),
    querySelector: (s) => html.querySelector(s),
    querySelectorAll: (s) => html.querySelectorAll(s),
    addEventListener() {},
    removeEventListener() {},
  };

  const sandbox = {
    console,
    document: doc,
    location: { pathname: '/conv' },
    navigator: { language: 'en-US' },
    performance: { now: () => Date.now() },
    CSS: { highlights: new Map() },
    MutationObserver: class {
      constructor(cb) { this.cb = cb; observers.push(this); }
      observe(t, opts) { this.target = t; this.opts = opts; }
      disconnect() {}
      takeRecords() { return []; }
    },
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
    requestAnimationFrame: (fn) => { rafQueue.push(fn); return rafQueue.length; },
    cancelAnimationFrame() {},
    getComputedStyle: (el) => ({
      display: el.style.display || 'block',
      visibility: el.style.visibility || 'visible',
      position: 'static',
      borderTopLeftRadius: '10px',
      getPropertyValue: (k) => el?.style?.getPropertyValue?.(k) || '',
    }),
    matchMedia: () => ({ matches: false }),
    setTimeout: (fn, ms) => { const id = setTimeout(fn, ms); timers.add(id); return id; },
    clearTimeout: (id) => { timers.delete(id); clearTimeout(id); },
    setInterval: () => 0,
    clearInterval() {},
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    addEventListener() {},
    removeEventListener() {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const flushRaf = () => { while (rafQueue.length) rafQueue.shift()(Date.now()); };

  try {
    const res = vm.runInNewContext(cdp.buildInjectExpression(cdp.DEFAULT_CONFIG, { bundleCachePath: '' }), sandbox);
    assert.equal(res.status, 'ok');

    // 1) Visible queued-messages-card becomes mascot roof anchor with zero bottom gap & full interactivity
    assert.equal(queuedWrap.hasAttribute('data-ag-cs-queued'), false, 'queued wrapper must have 0 bottom-gap attribute');
    assert.equal(queuedWrap.style.getPropertyValue('margin-bottom'), '', 'queued wrapper must have 0 inline margin-bottom');
    assert.equal(queuedCard.getAttribute('data-ag-cs-crab-anchor'), 'queued');
    assert.equal(card.hasAttribute('data-ag-cs-crab-anchor'), false);
    const crab = queuedCard.querySelector('.ag-cs-crab');
    assert.ok(crab, 'mascot stage must perch on queued-messages-card roof');
    assert.equal(crab.getAttribute('data-ag-mascot-peek'), null, 'mascot must remain interactive (non-peek) when queued card is alone');

    const mainMo = observers.find((o) => Array.isArray(o.opts?.attributeFilter) && o.opts.attributeFilter.includes('data-ag-queued-act'));
    assert.ok(mainMo, 'Main MutationObserver must observe data-ag-queued-act');

    // 2) Upper interaction-takeover-card preserves clearance above queued roof & executes zero W->R reflows
    events.length = 0;
    tracking = true;
    rtcWrap.children.unshift(takeoverWrap);
    takeoverWrap.parentElement = rtcWrap;
    mainMo.cb([{ type: 'childList', target: rtcWrap, addedNodes: [takeoverWrap], removedNodes: [] }]);
    flushRaf();
    tracking = false;
    const firstWriteIdx = events.findIndex((e) => e.op === 'W');
    const readAfterWrite = firstWriteIdx >= 0 && events.slice(firstWriteIdx + 1).some((e) => e.op === 'R');
    assert.equal(readAfterWrite, false, 'sync must perform zero layout reads after clearance/anchor writes (0 W->R)');
    assert.equal(takeoverWrap.getAttribute('data-ag-cs-takeover'), '1', 'takeover above queued card must keep clearance');
    assert.equal(queuedCard.getAttribute('data-ag-cs-crab-anchor'), 'queued');
    takeoverWrap.remove();
    mainMo.cb([{ type: 'childList', target: rtcWrap, addedNodes: [], removedNodes: [takeoverWrap] }]);
    flushRaf();

    // 3) Hardening: during [data-ag-queued-act="1"] 150ms exit animation, keep mascot anchored on queuedCard without jumping or toggling margin-bottom
    queuedRow.setAttribute('data-ag-queued-act', '1');
    mainMo.cb([{ type: 'attributes', target: queuedRow, attributeName: 'data-ag-queued-act' }]);
    flushRaf();
    assert.equal(queuedCard.getAttribute('data-ag-cs-crab-anchor'), 'queued', 'exiting queued card must hold mascot anchor until node hides/unmounts to avoid jump flicker');
    assert.equal(queuedCard.querySelector('.ag-cs-crab'), crab);
    assert.equal(queuedWrap.hasAttribute('data-ag-cs-queued'), false, 'exiting queued card must NOT jump +46px via data-ag-cs-queued');

    // 4) Clearing exit flag stays on queued roof; hiding/removing queued card returns cleanly to composer
    queuedRow.removeAttribute('data-ag-queued-act');
    mainMo.cb([{ type: 'attributes', target: queuedRow, attributeName: 'data-ag-queued-act' }]);
    flushRaf();
    assert.equal(queuedCard.getAttribute('data-ag-cs-crab-anchor'), 'queued');
    assert.equal(queuedCard.querySelector('.ag-cs-crab'), crab);

    queuedCard.hidden = true;
    mainMo.cb([{ type: 'attributes', target: queuedCard, attributeName: 'hidden' }]);
    flushRaf();
    assert.equal(card.getAttribute('data-ag-cs-crab-anchor'), 'composer', 'hidden queued card must return mascot to primary composer card');
    assert.equal(card.querySelector('.ag-cs-crab'), crab);
  } finally {
    try { sandbox.__agPrism?.destroy?.(); } catch {}
    for (const id of timers) clearTimeout(id);
  }
});

test('subtle motion [role="button"] rules exclude .ag-v2-mascot-actor and [data-no-press-spring="1"] so transform positioning is preserved on hover/active', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { fileURLToPath } = require('node:url');
  const cssPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'style.css');
  const css = fs.readFileSync(cssPath, 'utf8');
  const subtleStart = css.indexOf('&[data-ag-cs-motion="subtle"]{');
  assert.ok(subtleStart >= 0, 'style.css must define &[data-ag-cs-motion="subtle"]');
  const subtleEnd = css.indexOf('\n}', subtleStart);
  assert.ok(subtleEnd > subtleStart, 'subtle motion block must close cleanly');
  const subtleBlock = css.slice(subtleStart, subtleEnd);

  const lines = subtleBlock.split('\n').filter((line) => line.includes('[role="button"]'));
  assert.equal(lines.length, 2, 'expected transition override and :hover/:active transform:none rules for [role="button"] in subtle block');
  for (const line of lines) {
    assert.ok(
      line.includes('[role="button"]:not(.ag-v2-mascot-actor):not([data-no-press-spring="1"])'),
      `subtle rule must exclude mascot actors so inline translate3d is never clobbered: ${line}`
    );
  }
});

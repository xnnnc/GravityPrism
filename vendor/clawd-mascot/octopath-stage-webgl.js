// Obsidian Prism — Octopath Traveler HD-2D WebGL2 3D Parallax Pixel Tavern Stage Engine
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.__agOctopathStageWebGL = api;
    if (typeof window !== 'undefined' && window && window !== root) {
      window.__agOctopathStageWebGL = api;
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function (root) {
  'use strict';

  const STAGE_W = 640;
  const STAGE_H = 360;
  const MAX_DPR = 1.5;
  const DEG2RAD = Math.PI / 180;

  // 5 槽位真实 3D 错落坐标（4 主宠向左舒展与石台留足呼吸间距，杜绝蓝鲸裁切，同时与 5 列名牌视觉对齐）
  const SLOT_WORLD_POS = Object.freeze([
    Object.freeze({ key: 'c', kind: 'clawd', x: -2.52, y: 0.0, z: 0.24, hitR: 0.62, col: [0.98, 0.48, 0.16], colHi: [1.0, 0.70, 0.34] }),
    Object.freeze({ key: 'k', kind: 'cat', x: -1.42, y: 0.0, z: -0.18, hitR: 0.62, col: [0.58, 0.38, 0.96], colHi: [0.52, 0.76, 1.0] }),
    Object.freeze({ key: 'd', kind: 'dragon', x: -0.26, y: 0.0, z: 0.26, hitR: 0.62, col: [0.76, 0.88, 0.98], colHi: [0.30, 0.92, 0.84] }),
    Object.freeze({ key: 'w', kind: 'whale', x: 0.92, y: 0.0, z: -0.12, hitR: 0.62, col: [0.24, 0.54, 1.0], colHi: [0.34, 0.82, 1.0] }),
    Object.freeze({ key: 'm', kind: 'minis', x: 2.60, y: 0.40, z: -0.06, hitR: 0.74, col: [0.98, 0.56, 0.22], colHi: [1.0, 0.76, 0.30] }),
  ]);

  const MINI_OFFSETS = Object.freeze([
    Object.freeze({ id: 'cowboy', dx: -0.30, dz: 0.12, phase: 0 }),
    Object.freeze({ id: 'shades', dx: 0.28, dz: 0.14, phase: 1 }),
    Object.freeze({ id: 'wizard', dx: 0.0, dz: -0.18, phase: 2 }),
  ]);

  const ATLAS_KEYS = [
    'chandelier', 'lantern', 'hearth', 'booksTable',
    'astrolabe', 'barrelStack', 'stoolMug', 'potionRack',
    'candelabra', 'luggageScrolls', 'mossRock', 'miniLanternPost',
    'fgPillarLeft', 'fgPillarRight', 'garland', 'rug',
  ];

  // ── 严格 WebGL2 能力嗅探（严防 Mock 2D Canvas 误判）──────────────────────────
  function isRealWebGL2Context(gl) {
    return Boolean(
      gl &&
      typeof gl.createShader === 'function' &&
      typeof gl.createProgram === 'function' &&
      typeof gl.createFramebuffer === 'function' &&
      typeof gl.drawBuffers === 'function' &&
      typeof gl.createVertexArray === 'function' &&
      typeof gl.createTexture === 'function' &&
      typeof gl.texImage2D === 'function'
    );
  }

  function isSupported(canvas) {
    if (!canvas || typeof canvas.getContext !== 'function') return false;
    try {
      const gl = canvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false,
      });
      return isRealWebGL2Context(gl);
    } catch {
      return false;
    }
  }

  // ── 轻量 4×4 矩阵数学工具（列主序，零外部依赖）─────────────────────────────
  function mat4Perspective(fovRad, aspect, near, far) {
    const f = 1.0 / Math.tan(fovRad * 0.5);
    const nf = 1.0 / (near - far);
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0,
    ]);
  }

  function mat4LookAt(eye, target, up) {
    let zx = eye[0] - target[0];
    let zy = eye[1] - target[1];
    let zz = eye[2] - target[2];
    let len = Math.hypot(zx, zy, zz) || 1;
    zx /= len; zy /= len; zz /= len;

    let xx = up[1] * zz - up[2] * zy;
    let xy = up[2] * zx - up[0] * zz;
    let xz = up[0] * zy - up[1] * zx;
    len = Math.hypot(xx, xy, xz) || 1;
    xx /= len; xy /= len; xz /= len;

    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;

    return new Float32Array([
      xx, yx, zx, 0,
      xy, yy, zy, 0,
      xz, yz, zz, 0,
      -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
      -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
      -(zx * eye[0] + zy * eye[1] + zz * eye[2]),
      1,
    ]);
  }

  function mat4Mul(a, b) {
    const out = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
      const b0 = b[c * 4];
      const b1 = b[c * 4 + 1];
      const b2 = b[c * 4 + 2];
      const b3 = b[c * 4 + 3];
      out[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
      out[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
      out[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
      out[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
    }
    return out;
  }

  function projectToNdc(vp, x, y, z) {
    const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
    const cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
    const cz = vp[2] * x + vp[6] * y + vp[10] * z + vp[14];
    const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
    if (cw <= 0.0001) return null;
    return { nx: cx / cw, ny: cy / cw, nz: cz / cw, w: cw };
  }

  // ── GLSL ES 3.00 着色器源码（纯模板字面量，兼容 cdp.js minifyEmbeddedGlslTemplates）──
  const VS_SCENE = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNorm;
layout(location = 2) in vec2 aUv;
uniform mat4 uViewProj;
uniform mat4 uModel;
uniform vec4 uUvRect;
out vec3 vWorldPos;
out vec3 vNormal;
out vec2 vUv;
out vec2 vLocalUv;
void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vWorldPos = wp.xyz;
  vNormal = normalize(mat3(uModel) * aNorm);
  vUv = uUvRect.xy + aUv * uUvRect.zw;
  vLocalUv = aUv;
  gl_Position = uViewProj * wp;
}`;

  const FS_SCENE = `#version 300 es
precision highp float;
in vec3 vWorldPos;
in vec3 vNormal;
in vec2 vUv;
in vec2 vLocalUv;
uniform sampler2D uTex;
uniform vec2 uTexelSize;
uniform vec4 uUvBounds;
uniform vec4 uTint;
uniform vec4 uEmissive;
uniform vec4 uFlags;
uniform vec4 uLightTheme;
uniform vec4 uHearth;
uniform vec4 uSlotPos[5];
uniform vec4 uSlotCol[5];
layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 fragEmissive;
void main() {
  vec2 suv = clamp(vUv, uUvBounds.xy, uUvBounds.zw);
  vec4 tex = texture(uTex, suv);
  if (tex.a < 0.08) discard;
  float isMascot = step(1.5, uFlags.x);
  float isSprite = step(0.5, uFlags.x);
  float isFloor = uFlags.y;
  float shadeDim = uFlags.z;
  float rimAmt = uFlags.w;
  float lightMode = uLightTheme.x;
  float timeSec = uLightTheme.y;
  vec3 albedo = tex.rgb * uTint.rgb;
  vec3 N = normalize(vNormal);
  vec3 slotRimCol = vec3(1.0, 0.76, 0.42);
  float slotRimBoost = 0.0;
  vec3 slotLightSum = vec3(0.0);
  for (int i = 0; i < 5; i++) {
    float li = uSlotPos[i].w;
    if (li <= 0.01) continue;
    vec3 sPos = vec3(uSlotPos[i].x, uSlotPos[i].y + 1.15, uSlotPos[i].z);
    vec3 dVec = sPos - vWorldPos;
    float rHoriz = length(vec2(vWorldPos.x - uSlotPos[i].x, vWorldPos.z - uSlotPos[i].z));
    float att = li / (1.0 + dot(dVec, dVec) * mix(0.86, 0.65, lightMode));
    float poolCore = smoothstep(0.84, 0.14, rHoriz) * li;
    float poolSoft = smoothstep(1.16, 0.16, rHoriz) * li;
    vec3 spotTint = mix(uSlotCol[i].rgb, vec3(1.0, 0.94, 0.86), 0.36);
    slotLightSum += uSlotCol[i].rgb * (att * 0.48 + poolSoft * isFloor * mix(0.58, 0.50, lightMode)) + spotTint * (poolCore * isFloor * mix(1.18, 0.48, lightMode));
    if (rHoriz < 0.88) {
      slotRimCol = mix(slotRimCol, uSlotCol[i].rgb, 0.75);
      slotRimBoost = max(slotRimBoost, li);
    }
  }
  vec3 color = vec3(0.0);
  vec3 emOut = vec3(0.0);
  if (isMascot > 0.5) {
    float aLum = dot(albedo, vec3(0.299, 0.587, 0.114));
    vec3 vivid = clamp(mix(vec3(aLum), albedo, 1.18), 0.0, 1.0);
    float activeAmt = smoothstep(0.41, 1.0, shadeDim);
    float bright = clamp(mix(0.95, 1.00, lightMode) + slotRimBoost * mix(0.06, 0.05, lightMode), 0.92, 1.04);
    vec3 litMascot = vivid * bright;
    vec3 muted = mix(vec3(aLum), albedo, mix(0.45, 0.78, lightMode));
    vec3 sleepBase = pow(max(muted, vec3(0.001)), vec3(mix(1.16, 1.0, lightMode)));
    vec3 nightTint = mix(vec3(0.24, 0.25, 0.29), vec3(0.68, 0.65, 0.61), lightMode);
    color = mix(sleepBase * nightTint, litMascot, activeAmt);
    if (rimAmt > 0.01) {
      float aL = texture(uTex, clamp(vUv + vec2(-uTexelSize.x, 0.0), uUvBounds.xy, uUvBounds.zw)).a;
      float aR = texture(uTex, clamp(vUv + vec2(uTexelSize.x, 0.0), uUvBounds.xy, uUvBounds.zw)).a;
      float aU = texture(uTex, clamp(vUv + vec2(0.0, -uTexelSize.y), uUvBounds.xy, uUvBounds.zw)).a;
      float aD = texture(uTex, clamp(vUv + vec2(0.0, uTexelSize.y), uUvBounds.xy, uUvBounds.zw)).a;
      float edge = step(min(min(aL, aR), min(aU, aD)), 0.15);
      float topBias = step(aU, 0.15) * 0.55 + 0.45;
      vec3 sleepRim = mix(vec3(0.54, 0.64, 0.82), vec3(0.92, 0.82, 0.68), lightMode);
      vec3 baseRim = mix(sleepRim, vec3(1.0, 0.74, 0.36), activeAmt);
      vec3 rimColor = mix(baseRim, slotRimCol, clamp(slotRimBoost, 0.0, 1.0));
      float rimPow = edge * topBias * rimAmt * (mix(0.11, 0.14, activeAmt) + slotRimBoost * 0.36);
      color += rimColor * rimPow * mix(0.38, 0.24, lightMode);
      emOut += rimColor * rimPow * mix(0.12, 0.24, activeAmt);
    }
    if (uEmissive.a > 0.001) {
      float fxSat = max(max(tex.r, tex.g), tex.b) - min(min(tex.r, tex.g), tex.b);
      float fxMask = smoothstep(0.68, 0.95, aLum) * smoothstep(0.12, 0.45, fxSat);
      vec3 glow = mix(tex.rgb, uEmissive.rgb, 0.35) * fxMask * min(0.34, uEmissive.a);
      color += glow * 0.22;
      emOut += glow;
    }
  } else {
    vec3 ambientDark = mix(vec3(0.032, 0.044, 0.088), vec3(0.058, 0.054, 0.082), isFloor);
    vec3 ambientLight = mix(vec3(0.50, 0.45, 0.39), vec3(0.62, 0.56, 0.49), isFloor);
    vec3 amb = mix(ambientDark, ambientLight, lightMode);
    vec3 moonDir = normalize(vec3(-0.32, 0.68, 0.66));
    float moonNdL = max(dot(N, moonDir), 0.0) * 0.55 + 0.45;
    vec3 moonCol = mix(vec3(0.105, 0.19, 0.38), vec3(0.28, 0.32, 0.40), lightMode);
    vec3 lit = amb + moonCol * moonNdL * 0.26;
    vec3 hVec = vec3(uHearth.x, uHearth.y, uHearth.z) - vWorldPos;
    float hDist2 = dot(hVec, hVec) + mix(0.26, 0.38, lightMode);
    float hAtt = uHearth.w / (1.0 + hDist2 * mix(0.64, 0.40, lightMode));
    float hNdL = mix(max(dot(N, normalize(hVec)), 0.0) * 0.70 + 0.30, 0.82, isSprite);
    lit += mix(vec3(1.40, 0.60, 0.18), vec3(1.22, 0.56, 0.18), lightMode) * hAtt * hNdL;
    vec3 lanPosA = vec3(-2.35, 2.75, -1.55);
    vec3 lanPosB = vec3(2.35, 2.75, -1.55);
    vec3 lanPosC = vec3(0.0, 3.05, -1.15);
    vec3 candPos = vec3(1.48, 1.32, -2.35);
    float dA = length(lanPosA - vWorldPos);
    float dB = length(lanPosB - vWorldPos);
    float dC = length(lanPosC - vWorldPos);
    float dK = length(candPos - vWorldPos);
    float lanK = mix(0.52, 0.32, lightMode);
    float lanKC = mix(0.44, 0.26, lightMode);
    float warmPool = mix(0.76, 0.64, lightMode) / (1.0 + dA * dA * lanK)
      + mix(0.76, 0.64, lightMode) / (1.0 + dB * dB * lanK)
      + mix(1.04, 0.82, lightMode) / (1.0 + dC * dC * lanKC)
      + (1.0 - lightMode) * 0.64 / (1.0 + dK * dK * 0.92);
    lit += mix(vec3(1.16, 0.72, 0.30), vec3(1.05, 0.70, 0.32), lightMode) * warmPool * mix(0.48, 0.36, lightMode);
    lit += slotLightSum;
    lit = lit / (1.0 + lit * mix(0.18, 0.24, lightMode));
    color = albedo * lit;
    if (rimAmt > 0.01) {
      float aL = texture(uTex, clamp(vUv + vec2(-uTexelSize.x, 0.0), uUvBounds.xy, uUvBounds.zw)).a;
      float aR = texture(uTex, clamp(vUv + vec2(uTexelSize.x, 0.0), uUvBounds.xy, uUvBounds.zw)).a;
      float aU = texture(uTex, clamp(vUv + vec2(0.0, -uTexelSize.y), uUvBounds.xy, uUvBounds.zw)).a;
      float aD = texture(uTex, clamp(vUv + vec2(0.0, uTexelSize.y), uUvBounds.xy, uUvBounds.zw)).a;
      float edge = step(min(min(aL, aR), min(aU, aD)), 0.15);
      float topBias = step(aU, 0.15) * 0.55 + 0.45;
      vec3 rimColor = mix(vec3(1.0, 0.72, 0.34), slotRimCol, clamp(slotRimBoost, 0.0, 1.0));
      float rimPow = edge * topBias * rimAmt * (0.26 + slotRimBoost * 0.46);
      color += rimColor * rimPow * mix(0.55, 0.30, lightMode);
      emOut += rimColor * rimPow * 0.36;
    }
    if (shadeDim < 0.99) {
      vec3 nightTint = mix(vec3(0.20, 0.26, 0.44), vec3(0.66, 0.62, 0.56), lightMode);
      color = mix(color * nightTint, color, shadeDim);
    }
    if (uEmissive.a > 0.001) {
      float lum = dot(tex.rgb, vec3(0.299, 0.587, 0.114));
      float mask = smoothstep(mix(0.52, 0.46, lightMode), 0.88, lum);
      float pulse = 0.90 + 0.10 * sin(timeSec * 4.5 + vWorldPos.x * 2.1);
      vec3 glow = mix(tex.rgb, uEmissive.rgb, 0.38) * mask * uEmissive.a * pulse;
      color += glow * mix(0.54, 0.48, lightMode);
      emOut += glow;
    }
  }
  fragColor = vec4(color, tex.a * uTint.a);
  fragEmissive = vec4(emOut, tex.a * uTint.a);
}`;

  const VS_FX = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec2 aUv;
uniform mat4 uViewProj;
uniform mat4 uModel;
out vec2 vUv;
out vec3 vWorldPos;
void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vWorldPos = wp.xyz;
  vUv = aUv;
  gl_Position = uViewProj * wp;
}`;

  const FS_FX = `#version 300 es
precision highp float;
in vec2 vUv;
in vec3 vWorldPos;
uniform vec4 uColor;
uniform vec4 uParams;
layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 fragEmissive;
void main() {
  float mode = uParams.x;
  float timeSec = uParams.y;
  float p1 = uParams.z;
  float p2 = uParams.w;
  float alpha = 0.0;
  vec3 col = uColor.rgb;
  if (mode < 0.5) {
    float edgeX = 1.0 - abs(vUv.x * 2.0 - 1.0);
    if (p1 > 0.5) {
      float mask = smoothstep(0.05, 0.23, edgeX);
      float core = pow(max(edgeX, 0.0), 2.15);
      float edgeLine = smoothstep(0.06, 0.19, edgeX) * (1.0 - smoothstep(0.19, 0.38, edgeX)) * 0.38;
      float fadeY = smoothstep(0.0, 0.10, vUv.y) * pow(max(1.0 - vUv.y * 0.92, 0.0), 0.92);
      float shafts = 0.80 + 0.20 * sin(vUv.x * 22.0 + timeSec * 1.7 + vWorldPos.x * 1.5);
      alpha = (mask * 0.32 + core * 0.64 + edgeLine) * fadeY * shafts * uColor.a;
      col = mix(uColor.rgb, vec3(1.0, 0.96, 0.88), core * 0.12);
    } else {
      float core = pow(max(edgeX, 0.0), 1.85);
      float soft = pow(max(edgeX, 0.0), 0.90);
      float fadeY = smoothstep(0.0, 0.14, vUv.y) * pow(max(1.0 - vUv.y, 0.0), 1.25);
      float shimmer = 0.86 + 0.14 * sin(vUv.x * 16.0 + timeSec * 1.8 + vWorldPos.x);
      alpha = (soft * 0.42 + core * 0.58) * fadeY * shimmer * uColor.a;
      col = mix(uColor.rgb, vec3(1.0, 0.94, 0.82), core * 0.14);
    }
  } else if (mode < 1.5) {
    vec2 d = vUv * 2.0 - 1.0;
    float r = length(d);
    if (r > 1.0) discard;
    float soft = pow(max(1.0 - r, 0.0), p1);
    alpha = soft * uColor.a;
  } else if (mode < 2.5) {
    vec2 d = vUv * 2.0 - 1.0;
    float r = length(d);
    if (r > 1.0) discard;
    float ring1 = exp(-pow((r - p1) / 0.056, 2.0));
    float ring2 = exp(-pow((r - max(0.05, p1 - 0.20)) / 0.040, 2.0)) * 0.72;
    float angle = atan(d.y, d.x);
    float runes = 0.76 + 0.24 * sin(angle * 12.0 + timeSec * 2.8);
    alpha = (ring1 + ring2) * runes * uColor.a;
    col = mix(uColor.rgb, vec3(1.0, 0.97, 0.90), ring1 * 0.34);
  } else {
    vec2 d = abs(vUv * 2.0 - 1.0);
    float sq = max(d.x, d.y);
    if (sq > 1.0) discard;
    float star = 1.0 - smoothstep(0.35, 1.0, sq);
    alpha = star * uColor.a;
  }
  if (alpha < 0.004) discard;
  fragColor = vec4(col * alpha, alpha);
  fragEmissive = vec4(col * alpha * p2, alpha);
}`;

  const VS_QUAD = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID == 1) ? 3.0 : -1.0, (gl_VertexID == 2) ? 3.0 : -1.0);
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

  const FS_BLUR = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uDir;
out vec4 fragColor;
void main() {
  vec4 acc = texture(uSrc, vUv) * 0.227027;
  vec2 o1 = uDir * 1.384615;
  vec2 o2 = uDir * 3.230769;
  acc += (texture(uSrc, clamp(vUv + o1, 0.001, 0.999)) + texture(uSrc, clamp(vUv - o1, 0.001, 0.999))) * 0.316216;
  acc += (texture(uSrc, clamp(vUv + o2, 0.001, 0.999)) + texture(uSrc, clamp(vUv - o2, 0.001, 0.999))) * 0.070270;
  fragColor = acc;
}`;

  const FS_COMPOSITE = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uBlur;
uniform sampler2D uBloom;
uniform vec4 uGrade;
out vec4 fragColor;
vec3 acesFilm(vec3 x) {
  float l = max(dot(x, vec3(0.2126, 0.7152, 0.0722)), 0.0001);
  float tl = (l * (2.51 * l + 0.03)) / (l * (2.43 * l + 0.59) + 0.14);
  vec3 lumaMapped = x * (tl / l);
  vec3 chMapped = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
  return clamp(mix(lumaMapped, chMapped, 0.20), 0.0, 1.0);
}
void main() {
  float lightMode = uGrade.x;
  float bloomStr = uGrade.y;
  float dofStr = uGrade.z;
  float vigStr = uGrade.w;
  float distBand = abs(vUv.y - 0.50);
  float coc = smoothstep(0.18, 0.47, distBand) * dofStr;
  vec3 sharp = texture(uScene, vUv).rgb;
  vec3 soft = texture(uBlur, vUv).rgb;
  vec3 bloom = texture(uBloom, vUv).rgb;
  vec3 col = mix(sharp, soft, coc);
  col += bloom * bloomStr;
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  vec3 shadowTone = mix(vec3(0.82, 0.90, 1.14), vec3(1.02, 0.99, 0.95), lightMode);
  vec3 highTone = mix(vec3(1.10, 1.01, 0.87), vec3(1.03, 1.01, 0.96), lightMode);
  col *= mix(shadowTone, highTone, smoothstep(0.14, 0.74, lum));
  col = acesFilm(col * mix(1.05, 0.98, lightMode));
  float outL = max(dot(col, vec3(0.2126, 0.7152, 0.0722)), 0.0001);
  float sCurve = outL * outL * (3.0 - 2.0 * outL);
  float targetL = mix(outL, sCurve, (1.0 - lightMode) * 0.34);
  col = clamp(col * (targetL / outL), 0.0, 1.0);
  vec2 vp = (vUv - vec2(0.5, 0.52)) * vec2(1.15, 1.0);
  float vig = 1.0 - smoothstep(mix(0.24, 0.30, lightMode), mix(0.78, 0.84, lightMode), length(vp)) * vigStr;
  col *= vig;
  fragColor = vec4(col, 1.0);
}`;

  // ── 精细程序化像素纹理工坊（零外部依赖，高精 16-bit 像素画，热插拔图集加载前的零黑屏兜底）──
  function makePixelBuf(w, h) {
    const data = new Uint8Array(w * h * 4);
    const set = (x, y, r, g, b, a = 255) => {
      const ix = x | 0;
      const iy = y | 0;
      if (ix < 0 || ix >= w || iy < 0 || iy >= h) return;
      const o = (iy * w + ix) * 4;
      data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = a;
    };
    const rect = (x, y, rw, rh, r, g, b, a = 255) => {
      for (let yy = y; yy < y + rh; yy++) for (let xx = x; xx < x + rw; xx++) set(xx, yy, r, g, b, a);
    };
    const hline = (x, y, len, r, g, b, a = 255) => rect(x, y, len, 1, r, g, b, a);
    const vline = (x, y, len, r, g, b, a = 255) => rect(x, y, 1, len, r, g, b, a);
    return { w, h, data, set, rect, hline, vline };
  }

  function buildProceduralWall() {
    const W = 256, H = 144;
    const p = makePixelBuf(W, H);
    // 1. 黑曜石暗砖壁面
    for (let y = 0; y < H; y++) {
      const row = (y / 8) | 0;
      const off = (row & 1) ? 8 : 0;
      for (let x = 0; x < W; x++) {
        const bx = (x + off) % 16;
        const by = y % 8;
        const hash = (((x * 37 + row * 17) ^ (row * 91)) & 15) - 7;
        const mortar = bx === 0 || by === 0;
        const baseR = mortar ? 14 : 24 + (hash >> 2);
        const baseG = mortar ? 17 : 28 + (hash >> 2);
        const baseB = mortar ? 26 : 42 + (hash >> 1);
        p.set(x, y, baseR, baseG, baseB, 255);
      }
    }
    // 2. 下部深胡桃木墙裙 + 护墙线
    p.rect(0, 114, W, 30, 38, 25, 20);
    p.hline(0, 113, W, 72, 50, 36);
    p.hline(0, 114, W, 56, 38, 28);
    for (let x = 0; x < W; x += 16) {
      p.vline(x, 115, 29, 26, 17, 14);
      p.rect(x + 3, 118, 10, 20, 46, 31, 24);
      p.hline(x + 3, 118, 10, 64, 44, 34);
    }
    // 3. 顶部深木屋檐横梁与锯齿托架
    p.rect(0, 0, W, 11, 28, 20, 18);
    p.hline(0, 11, W, 62, 46, 35);
    p.hline(0, 12, W, 16, 12, 14);
    for (let x = 8; x < W; x += 32) p.rect(x, 11, 6, 7, 42, 30, 24);

    // 4. 左右对称高耸哥特尖拱彩绘星夜窗（深蓝星空、星辰、弯月、窗格）
    const drawArchWindow = (cx, moonSide) => {
      const winW = 34, topY = 20, botY = 92;
      const lx = cx - (winW >> 1);
      // 石砌外框
      p.rect(lx - 3, topY + 12, winW + 6, botY - topY - 10, 44, 50, 68);
      for (let dy = 0; dy < 14; dy++) {
        const span = Math.min((winW >> 1) + 3, 4 + dy * 2);
        p.rect(cx - span, topY - 2 + dy, span * 2, 1, 44, 50, 68);
      }
      // 深蓝星夜玻璃内腔
      for (let y = topY; y < botY; y++) {
        const dy = y - topY;
        const half = dy < 13 ? Math.min(winW >> 1, 2 + ((dy * 15) >> 3)) : (winW >> 1);
        const grad = (y - topY) / (botY - topY);
        const r = Math.round(14 + grad * 20);
        const g = Math.round(28 + grad * 42);
        const b = Math.round(74 + grad * 72);
        for (let x = cx - half; x < cx + half; x++) p.set(x, y, r, g, b, 255);
      }
      // 弯月与星光（高亮度自动进 Emissive Bloom）
      const mx = cx + moonSide * 6;
      const my = topY + 18;
      p.rect(mx - 3, my - 3, 6, 6, 214, 234, 255);
      p.rect(mx - 2, my - 4, 4, 8, 224, 242, 255);
      p.rect(mx - 1 + moonSide * 2, my - 3, 4, 6, 22, 44, 102);
      const stars = [[-9, 14], [8, 28], [-6, 40], [10, 48], [-11, 56], [4, 62], [-3, 25]];
      for (const [sx, sy] of stars) p.set(cx + sx, topY + sy, 230, 244, 255);
      // 哥特铁艺十字窗格与石窗台
      p.vline(cx, topY + 2, botY - topY - 2, 20, 24, 36);
      p.hline(lx, topY + 30, winW, 20, 24, 36);
      p.hline(lx, topY + 54, winW, 20, 24, 36);
      p.rect(lx - 4, botY, winW + 8, 4, 68, 76, 98);
      p.hline(lx - 4, botY, winW + 8, 106, 128, 166);
    };
    drawArchWindow(62, -1);
    drawArchWindow(194, 1);

    // 5. 两侧高耸橡木书架与彩色典籍/卷轴
    const bookCols = [[164, 52, 46], [198, 134, 52], [58, 126, 94], [66, 92, 164], [136, 72, 152], [182, 154, 92]];
    const drawShelf = (sx, sw) => {
      p.rect(sx, 22, sw, 92, 34, 22, 16);
      p.rect(sx + 1, 23, sw - 2, 90, 24, 15, 12);
      for (let sy = 36; sy < 112; sy += 16) {
        p.rect(sx, sy, sw, 3, 62, 41, 28);
        p.hline(sx, sy, sw, 88, 60, 40);
        let bx = sx + 2;
        let idx = sy;
        while (bx < sx + sw - 5) {
          const bw = 2 + (idx % 3);
          const bh = 8 + (idx % 5);
          const c = bookCols[idx % bookCols.length];
          p.rect(bx, sy - bh, bw, bh, c[0], c[1], c[2]);
          p.set(bx, sy - bh + 2, 236, 202, 120);
          bx += bw + 1;
          idx += 5;
        }
      }
    };
    drawShelf(6, 30);
    drawShelf(220, 30);

    // 6. 中央黑曜石棱镜纹章挂毯 + 酒馆陈列架 + 两盏暖光壁灯
    p.rect(108, 22, 40, 56, 32, 24, 48);
    p.rect(110, 24, 36, 52, 48, 32, 68);
    p.hline(106, 21, 44, 198, 156, 74);
    // 挂毯菱形棱镜徽章
    for (let dy = -12; dy <= 12; dy++) {
      const sp = 12 - Math.abs(dy);
      p.hline(128 - sp, 48 + dy, sp * 2 + 1, 226, 178, 86);
      if (sp > 2) p.hline(128 - (sp - 2), 48 + dy, (sp - 2) * 2 + 1, 96, 148, 230);
    }
    // 两盏暖光铁艺壁灯
    const drawSconce = (sx, sy) => {
      p.rect(sx - 2, sy, 5, 8, 36, 34, 40);
      p.rect(sx - 3, sy - 5, 7, 6, 255, 186, 82);
      p.rect(sx - 1, sy - 4, 3, 4, 255, 244, 198);
    };
    drawSconce(96, 54);
    drawSconce(160, 54);
    // 两侧小酒架发光瓶
    for (const bx of [44, 208]) {
      p.rect(bx - 6, 98, 14, 3, 66, 44, 28);
      p.rect(bx - 4, 92, 3, 6, 92, 218, 168);
      p.rect(bx, 91, 3, 7, 244, 162, 64);
      p.rect(bx + 4, 93, 3, 5, 168, 114, 242);
    }
    return p;
  }

  function buildProceduralFloor() {
    const W = 128, H = 128;
    const p = makePixelBuf(W, H);
    // 精致深胡桃木拼花地板 + 黑曜石石砖角嵌
    for (let y = 0; y < H; y++) {
      const plankRow = (y / 16) | 0;
      const offset = (plankRow & 1) ? 32 : 0;
      for (let x = 0; x < W; x++) {
        const px = (x + offset) % 64;
        const py = y % 16;
        const seam = py === 0 || px === 0;
        const grain = (((x * 13 + y * 5 + plankRow * 29) & 7) - 3) * 2;
        const tone = (plankRow * 3 + ((x + offset) >> 6)) % 3;
        const baseR = seam ? 24 : 68 + tone * 6 + grain;
        const baseG = seam ? 18 : 48 + tone * 4 + (grain >> 1);
        const baseB = seam ? 22 : 38 + tone * 3 + (grain >> 1);
        p.set(x, y, baseR, baseG, baseB, 255);
        // 铜钉细节
        if ((px === 3 || px === 60) && (py === 4 || py === 12)) p.set(x, y, 128, 96, 62);
      }
    }
    // 拼花雕纹边框点缀
    for (let y = 0; y < H; y += 64) {
      p.hline(0, y, W, 34, 26, 32);
      p.hline(0, y + 1, W, 94, 68, 48);
    }
    return p;
  }

  function buildProceduralStone() {
    const W = 64, H = 64;
    const p = makePixelBuf(W, H);
    // 深邃暖黑曜石雕花石砖 + 暗金/暖木边沿 + 局部深翡翠青苔点缀
    for (let y = 0; y < H; y++) {
      const row = (y / 8) | 0;
      const off = (row & 1) ? 8 : 0;
      for (let x = 0; x < W; x++) {
        const bx = (x + off) % 16;
        const by = y % 8;
        const seam = bx === 0 || by === 0;
        const hi = !seam && (by === 1 || bx === 1);
        const n = (((x * 19 + y * 31 + row * 11) & 15) - 7);
        const r = seam ? 18 : hi ? 74 + (n >> 2) : 48 + (n >> 1);
        const g = seam ? 15 : hi ? 60 + (n >> 2) : 40 + (n >> 1);
        const b = seam ? 20 : hi ? 54 + (n >> 2) : 43 + (n >> 1);
        p.set(x, y, r, g, b, 255);
        // 顶部暗金暖木护沿线
        if (y === 0 || y === 1) {
          const gold = ((x >> 2) & 1) === 0;
          p.set(x, y, gold ? 132 : 96, gold ? 98 : 70, gold ? 56 : 44, 255);
        } else if (y === 2) {
          p.set(x, y, 28, 22, 24, 255);
        }
        // 局部自然深青苔像素点缀（边缘与砖缝）
        if (y >= 3 && y < 9 && ((x * 7 + y * 13) & 15) < 5) {
          p.set(x, y, 42, 92 + (n & 15), 62, 255);
        }
      }
    }
    return p;
  }

  function buildProceduralPropsAtlas() {
    // 256×256 划分为 4×4 共 16 个 64×64 格子，与 ATLAS_KEYS 1:1 映射
    const S = 256;
    const C = 64;
    const p = makePixelBuf(S, S);
    const rects = {};
    const cell = (idx, key, anchorY, emissive, drawFn) => {
      const gx = (idx % 4) * C;
      const gy = ((idx / 4) | 0) * C;
      const box = {
        set: (x, y, r, g, b, a = 255) => p.set(gx + x, gy + y, r, g, b, a),
        rect: (x, y, w, h, r, g, b, a = 255) => p.rect(gx + x, gy + y, w, h, r, g, b, a),
        hline: (x, y, l, r, g, b, a = 255) => p.hline(gx + x, gy + y, l, r, g, b, a),
        vline: (x, y, l, r, g, b, a = 255) => p.vline(gx + x, gy + y, l, r, g, b, a),
      };
      drawFn(box);
      rects[key] = { x: gx, y: gy, w: C, h: C, anchorY, emissive };
    };

    // 0: chandelier 锻铁多烛暖光吊灯
    cell(0, 'chandelier', 0, true, (b) => {
      b.rect(30, 0, 4, 22, 46, 48, 60);
      b.rect(12, 22, 40, 5, 52, 54, 68);
      b.rect(8, 25, 48, 3, 74, 70, 82);
      for (const cx of [14, 24, 32, 40, 50]) {
        b.rect(cx - 2, 16, 4, 7, 232, 214, 178);
        b.rect(cx - 2, 10, 4, 6, 255, 168, 48);
        b.rect(cx - 1, 11, 2, 4, 255, 246, 198);
      }
      b.rect(24, 28, 16, 5, 186, 144, 68);
      b.rect(29, 33, 6, 5, 248, 196, 86);
    });
    // 1: lantern 铁链悬吊琥珀提灯
    cell(1, 'lantern', 0, true, (b) => {
      b.rect(31, 0, 2, 18, 48, 52, 66);
      b.rect(24, 18, 16, 4, 54, 58, 72);
      b.rect(22, 22, 20, 22, 44, 48, 60);
      b.rect(25, 24, 14, 17, 252, 166, 52);
      b.rect(28, 27, 8, 11, 255, 238, 168);
      b.rect(24, 44, 16, 4, 54, 58, 72);
      b.rect(29, 48, 6, 4, 180, 134, 60);
    });
    // 2: hearth 石砌温暖壁炉/火盆
    cell(2, 'hearth', 1, true, (b) => {
      b.rect(6, 14, 52, 50, 62, 64, 78);
      b.rect(4, 10, 56, 6, 86, 88, 104);
      b.hline(4, 10, 56, 126, 128, 148);
      b.rect(14, 24, 36, 38, 18, 14, 18);
      // 熊熊柴火与内壁暖光
      b.rect(18, 52, 28, 6, 92, 52, 28);
      b.rect(20, 42, 24, 12, 226, 86, 26);
      b.rect(23, 35, 18, 15, 255, 148, 38);
      b.rect(27, 30, 10, 14, 255, 226, 104);
      b.rect(29, 36, 6, 10, 255, 250, 214);
      // 炉顶小油灯与铜壶
      b.rect(12, 4, 8, 6, 188, 122, 56);
      b.rect(44, 4, 6, 6, 255, 198, 92);
    });
    // 3: booksTable 堆满摊开古书与烛台的橡木桌
    cell(3, 'booksTable', 1, true, (b) => {
      b.rect(6, 36, 52, 6, 108, 72, 44);
      b.hline(6, 36, 52, 146, 102, 64);
      b.rect(10, 42, 6, 22, 74, 48, 30);
      b.rect(48, 42, 6, 22, 74, 48, 30);
      b.rect(16, 48, 32, 4, 62, 40, 26);
      // 摊开古书 + 书栈 + 小蜡烛
      b.rect(12, 28, 18, 8, 232, 218, 186);
      b.vline(21, 28, 8, 142, 118, 88);
      b.rect(34, 24, 12, 4, 168, 56, 48);
      b.rect(35, 28, 11, 4, 64, 102, 174);
      b.rect(33, 32, 13, 4, 68, 132, 92);
      b.rect(50, 24, 4, 12, 242, 228, 196);
      b.rect(50, 18, 4, 6, 255, 186, 68);
      b.rect(51, 19, 2, 4, 255, 246, 206);
    });
    // 4: astrolabe 古典黄铜星盘
    cell(4, 'astrolabe', 1, true, (b) => {
      b.rect(20, 56, 24, 8, 82, 54, 34);
      b.rect(29, 44, 6, 12, 186, 142, 62);
      for (let a = 0; a < 36; a++) {
        const rad = (a / 36) * Math.PI * 2;
        const rx = Math.round(32 + Math.cos(rad) * 16);
        const ry = Math.round(28 + Math.sin(rad) * 16);
        b.rect(rx - 1, ry - 1, 3, 3, 218, 174, 78);
        const ix = Math.round(32 + Math.cos(rad) * 10);
        const iy = Math.round(28 + Math.sin(rad) * 10);
        b.rect(ix, iy, 2, 2, 246, 214, 122);
      }
      b.rect(29, 25, 6, 6, 124, 214, 255);
      b.rect(30, 26, 4, 4, 224, 248, 255);
    });
    // 5: barrelStack 铁箍橡木酒桶 + 麦酒杯
    cell(5, 'barrelStack', 1, false, (b) => {
      b.rect(12, 28, 28, 36, 106, 68, 38);
      b.rect(14, 26, 24, 4, 128, 84, 48);
      b.rect(11, 35, 30, 4, 54, 58, 70);
      b.rect(11, 52, 30, 4, 54, 58, 70);
      for (let x = 16; x < 38; x += 5) b.vline(x, 28, 36, 76, 48, 28);
      b.rect(38, 36, 20, 28, 92, 58, 34);
      b.rect(37, 42, 22, 3, 54, 58, 70);
      b.rect(37, 56, 22, 3, 54, 58, 70);
      // 桶顶起泡麦酒杯
      b.rect(20, 14, 10, 12, 212, 148, 52);
      b.rect(30, 17, 3, 6, 186, 126, 42);
      b.rect(19, 10, 12, 5, 246, 238, 216);
    });
    // 6: stoolMug 高脚木凳 + 热茶杯
    cell(6, 'stoolMug', 1, false, (b) => {
      b.rect(16, 36, 32, 6, 118, 78, 48);
      b.hline(16, 36, 32, 152, 108, 68);
      b.rect(20, 42, 4, 22, 78, 52, 32);
      b.rect(40, 42, 4, 22, 78, 52, 32);
      b.rect(24, 52, 16, 3, 66, 44, 28);
      b.rect(26, 24, 10, 12, 198, 122, 72);
      b.rect(36, 27, 3, 6, 172, 102, 58);
      b.rect(28, 16, 2, 6, 220, 224, 238, 180);
      b.rect(33, 14, 2, 6, 220, 224, 238, 160);
    });
    // 7: potionRack 多层发光药水瓶架
    cell(7, 'potionRack', 1, true, (b) => {
      b.rect(8, 8, 48, 56, 66, 44, 28);
      b.rect(11, 11, 42, 50, 28, 19, 16);
      for (const sy of [26, 42, 58]) {
        b.rect(10, sy, 44, 3, 92, 62, 38);
      }
      const cols = [[86, 236, 184], [255, 178, 62], [176, 114, 255], [82, 194, 255], [248, 96, 118]];
      for (let r = 0; r < 3; r++) {
        const baseY = 26 + r * 16;
        for (let i = 0; i < 4; i++) {
          const c = cols[(r * 2 + i) % cols.length];
          const px = 14 + i * 10;
          b.rect(px + 1, baseY - 10, 4, 3, 190, 210, 226);
          b.rect(px, baseY - 7, 6, 7, c[0], c[1], c[2]);
          b.set(px + 1, baseY - 6, 255, 255, 255);
        }
      }
    });
    // 8: candelabra 高挑多头锻铁暖光烛台
    cell(8, 'candelabra', 1, true, (b) => {
      b.rect(22, 58, 20, 6, 56, 58, 72);
      b.rect(30, 20, 4, 38, 68, 70, 86);
      b.rect(14, 22, 36, 4, 68, 70, 86);
      for (const cx of [16, 32, 48]) {
        const top = cx === 32 ? 12 : 16;
        b.rect(cx - 2, top, 4, 22 - top, 240, 224, 192);
        b.rect(cx - 2, top - 7, 4, 7, 255, 166, 48);
        b.rect(cx - 1, top - 6, 2, 5, 255, 246, 206);
      }
    });
    // 9: luggageScrolls 旅人旧皮箱 + 卷轴筒 + 古老地球仪
    cell(9, 'luggageScrolls', 1, false, (b) => {
      b.rect(8, 38, 34, 26, 126, 74, 42);
      b.rect(8, 38, 34, 4, 152, 94, 54);
      b.rect(14, 38, 4, 26, 196, 152, 68);
      b.rect(32, 38, 4, 26, 196, 152, 68);
      b.rect(20, 34, 10, 4, 88, 52, 30);
      // 地球仪
      b.rect(42, 48, 12, 16, 86, 58, 36);
      b.rect(40, 24, 16, 16, 68, 126, 186);
      b.rect(43, 27, 6, 6, 98, 162, 106);
      b.rect(49, 32, 5, 5, 98, 162, 106);
      // 羊皮卷轴
      b.rect(12, 28, 22, 8, 228, 206, 158);
      b.rect(10, 28, 3, 8, 162, 62, 52);
      b.rect(33, 28, 3, 8, 162, 62, 52);
    });
    // 10: mossRock 青苔石块 + 发光蓝绿小蘑菇簇 + 贝壳宝箱
    cell(10, 'mossRock', 1, true, (b) => {
      b.rect(10, 38, 44, 26, 72, 78, 94);
      b.rect(16, 30, 32, 12, 84, 92, 110);
      b.rect(14, 32, 34, 8, 62, 146, 96);
      // 发光青蓝小蘑菇簇
      for (const [mx, my, mw] of [[18, 24, 10], [32, 20, 12], [44, 28, 8]]) {
        b.rect(mx + (mw >> 1) - 1, my + 4, 3, 8, 222, 232, 224);
        b.rect(mx, my, mw, 5, 76, 236, 214);
        b.rect(mx + 2, my + 1, mw - 4, 2, 198, 255, 248);
      }
    });
    // 11: miniLanternPost 系泊小木桩暖光提灯
    cell(11, 'miniLanternPost', 1, true, (b) => {
      b.rect(24, 18, 8, 46, 98, 64, 38);
      b.rect(24, 18, 22, 5, 86, 56, 34);
      b.rect(40, 23, 2, 7, 56, 58, 70);
      b.rect(35, 30, 12, 14, 50, 54, 68);
      b.rect(37, 32, 8, 10, 255, 182, 68);
      b.rect(39, 34, 4, 6, 255, 246, 202);
    });
    // 12: fgPillarLeft 前景左侧暗木雕刻立柱 + 常春藤
    cell(12, 'fgPillarLeft', 1, false, (b) => {
      b.rect(0, 0, 28, 64, 30, 20, 18);
      b.rect(4, 0, 20, 64, 44, 30, 24);
      b.vline(24, 0, 64, 72, 52, 38);
      b.rect(0, 52, 34, 12, 38, 26, 22);
      // 常春藤叶蔓
      for (let i = 0; i < 9; i++) {
        const ix = 16 + ((i * 7) % 18);
        const iy = 4 + i * 6;
        b.rect(ix, iy, 6, 4, 48, 118, 72);
        b.rect(ix + 1, iy + 1, 3, 2, 82, 168, 104);
      }
    });
    // 13: fgPillarRight 前景右侧暗木立柱 + 暖光玻璃灯笼 + 常春藤
    cell(13, 'fgPillarRight', 1, true, (b) => {
      b.rect(36, 0, 28, 64, 30, 20, 18);
      b.rect(40, 0, 20, 64, 44, 30, 24);
      b.vline(39, 0, 64, 72, 52, 38);
      b.rect(30, 52, 34, 12, 38, 26, 22);
      // 铁艺支架 + 暖灯笼
      b.rect(20, 18, 20, 3, 46, 48, 60);
      b.rect(18, 21, 14, 18, 42, 46, 58);
      b.rect(20, 23, 10, 14, 255, 174, 58);
      b.rect(22, 26, 6, 8, 255, 244, 192);
      for (let i = 0; i < 7; i++) {
        const ix = 32 + ((i * 5) % 16);
        const iy = 4 + i * 7;
        b.rect(ix, iy, 6, 4, 48, 118, 72);
      }
    });
    // 14: garland 穹顶干花彩旗串灯
    cell(14, 'garland', 0, true, (b) => {
      for (let x = 0; x < 64; x++) {
        const sag = Math.round(Math.sin((x / 63) * Math.PI) * 14) + 6;
        b.rect(x, sag, 1, 2, 74, 56, 42);
        if (x % 8 === 4) {
          const warm = ((x >> 3) & 1) === 0;
          if (warm) {
            b.rect(x - 2, sag + 2, 5, 5, 255, 198, 86);
            b.rect(x - 1, sag + 3, 3, 3, 255, 248, 210);
          } else {
            b.rect(x - 2, sag + 2, 5, 6, 152, 62, 76);
            b.rect(x - 1, sag + 8, 3, 3, 212, 168, 78);
          }
        }
      }
    });
    // 15: rug 织纹暗金酒馆长地毯
    cell(15, 'rug', 0.5, false, (b) => {
      b.rect(2, 10, 60, 44, 118, 34, 44);
      b.rect(4, 12, 56, 40, 142, 42, 52);
      // 金边织纹
      b.hline(6, 14, 52, 212, 168, 78);
      b.hline(6, 49, 52, 212, 168, 78);
      b.vline(6, 14, 36, 212, 168, 78);
      b.vline(57, 14, 36, 212, 168, 78);
      for (let x = 14; x <= 48; x += 10) {
        b.rect(x, 26, 6, 12, 204, 156, 72);
        b.rect(x + 2, 29, 2, 6, 74, 42, 86);
      }
    });

    return { buf: p, rects };
  }

  // ── 几何缓冲生成工具 ────────────────────────────────────────────────────────
  function makeQuadVerts(w, h, anchorY = 1) {
    const hw = w * 0.5;
    const y0 = anchorY === 0 ? -h : anchorY === 0.5 ? -h * 0.5 : 0;
    const y1 = y0 + h;
    // pos(3), norm(3), uv(2)
    return new Float32Array([
      -hw, y0, 0, 0, 0, 1, 0, 1,
       hw, y0, 0, 0, 0, 1, 1, 1,
       hw, y1, 0, 0, 0, 1, 1, 0,
      -hw, y0, 0, 0, 0, 1, 0, 1,
       hw, y1, 0, 0, 0, 1, 1, 0,
      -hw, y1, 0, 0, 0, 1, 0, 0,
    ]);
  }

  function makeFloorVerts(w, d, repeatX, repeatZ) {
    const hw = w * 0.5;
    const hd = d * 0.5;
    return new Float32Array([
      -hw, 0,  hd, 0, 1, 0, 0, repeatZ,
       hw, 0,  hd, 0, 1, 0, repeatX, repeatZ,
       hw, 0, -hd, 0, 1, 0, repeatX, 0,
      -hw, 0,  hd, 0, 1, 0, 0, repeatZ,
       hw, 0, -hd, 0, 1, 0, repeatX, 0,
      -hw, 0, -hd, 0, 1, 0, 0, 0,
    ]);
  }

  function makeBoxVerts(w, h, d, repeatXZ = 1, repeatY = 1) {
    const hw = w * 0.5, hd = d * 0.5;
    const tris = [];
    const pushQuad = (p0, p1, p2, p3, n, uMax, vMax) => {
      tris.push(
        p0[0], p0[1], p0[2], n[0], n[1], n[2], 0, vMax,
        p1[0], p1[1], p1[2], n[0], n[1], n[2], uMax, vMax,
        p2[0], p2[1], p2[2], n[0], n[1], n[2], uMax, 0,
        p0[0], p0[1], p0[2], n[0], n[1], n[2], 0, vMax,
        p2[0], p2[1], p2[2], n[0], n[1], n[2], uMax, 0,
        p3[0], p3[1], p3[2], n[0], n[1], n[2], 0, 0
      );
    };
    // 顶面
    pushQuad([-hw, h, hd], [hw, h, hd], [hw, h, -hd], [-hw, h, -hd], [0, 1, 0], repeatXZ, repeatXZ);
    // 前面
    pushQuad([-hw, 0, hd], [hw, 0, hd], [hw, h, hd], [-hw, h, hd], [0, 0, 1], repeatXZ, repeatY);
    // 左面
    pushQuad([-hw, 0, -hd], [-hw, 0, hd], [-hw, h, hd], [-hw, h, -hd], [-1, 0, 0], repeatXZ, repeatY);
    // 右面
    pushQuad([hw, 0, hd], [hw, 0, -hd], [hw, h, -hd], [hw, h, hd], [1, 0, 0], repeatXZ, repeatY);
    return new Float32Array(tris);
  }

  function makeBeamConeVerts() {
    // 3 片互成 60° 交叉的真 3D 锥形体积光片，无论相机视差怎样偏转都饱满立体
    const topR = 0.20;
    const botR = 0.76;
    const topY = 2.95;
    const botY = 0.02;
    const verts = [];
    for (let k = 0; k < 3; k++) {
      const ang = (k * Math.PI) / 3;
      const cx = Math.cos(ang);
      const sz = Math.sin(ang);
      verts.push(
        -botR * cx, botY, -botR * sz, 0, 1,
         botR * cx, botY,  botR * sz, 1, 1,
         topR * cx, topY,  topR * sz, 1, 0,
        -botR * cx, botY, -botR * sz, 0, 1,
         topR * cx, topY,  topR * sz, 1, 0,
        -topR * cx, topY, -topR * sz, 0, 0
      );
    }
    return new Float32Array(verts);
  }

  function makeFxQuadVerts(horizontal) {
    if (horizontal) {
      return new Float32Array([
        -0.5, 0,  0.5, 0, 1,
         0.5, 0,  0.5, 1, 1,
         0.5, 0, -0.5, 1, 0,
        -0.5, 0,  0.5, 0, 1,
         0.5, 0, -0.5, 1, 0,
        -0.5, 0, -0.5, 0, 0,
      ]);
    }
    return new Float32Array([
      -0.5, -0.5, 0, 0, 1,
       0.5, -0.5, 0, 1, 1,
       0.5,  0.5, 0, 1, 0,
      -0.5, -0.5, 0, 0, 1,
       0.5,  0.5, 0, 1, 0,
      -0.5,  0.5, 0, 0, 0,
    ]);
  }

  function modelMat(tx, ty, tz, sx = 1, sy = 1, sz = 1, rotY = 0, rotZ = 0) {
    const cy = Math.cos(rotY), syr = Math.sin(rotY);
    const cz = Math.cos(rotZ), szr = Math.sin(rotZ);
    return new Float32Array([
      (cy * cz) * sx, (szr) * sx, (-syr * cz) * sx, 0,
      (-cy * szr) * sy, (cz) * sy, (syr * szr) * sy, 0,
      syr * sz, 0, cy * sz, 0,
      tx, ty, tz, 1,
    ]);
  }

  // ── 极繁 3D 摆件世界布置表（19 个错落 Z 轴立牌/装饰，生活感与空间纵深拉满）──
  const TAVERN_PROPS_LAYOUT = [
    // 中后景摆件矩阵（注：当外部真实后墙壁炉已加载时自动隐藏 hearth 避免壁炉套壁炉重叠）
    { key: 'hearth', x: -0.04, y: 0.0, z: -2.72, h: 1.48, anchorY: 1, emissive: 1.30, emCol: [1.0, 0.52, 0.16], rim: 0.6, skipWithExternalWall: true },
    { key: 'potionRack', x: -3.28, y: 0.0, z: -2.62, h: 1.52, anchorY: 1, emissive: 0.92, emCol: [0.46, 0.96, 0.84], rim: 0.55 },
    { key: 'astrolabe', x: -2.14, y: 0.0, z: -2.18, h: 1.18, anchorY: 1, emissive: 0.65, emCol: [0.58, 0.88, 1.0], rim: 0.7, sway: 0.03 },
    { key: 'booksTable', x: -1.42, y: 0.0, z: -1.68, h: 1.02, anchorY: 1, emissive: 0.72, emCol: [1.0, 0.78, 0.36], rim: 0.65 },
    { key: 'barrelStack', x: -3.62, y: 0.0, z: -1.32, h: 1.16, anchorY: 1, emissive: 0.0, emCol: [1, 1, 1], rim: 0.6 },
    { key: 'stoolMug', x: -2.76, y: 0.0, z: -1.24, h: 0.78, anchorY: 1, emissive: 0.0, emCol: [1, 1, 1], rim: 0.55 },
    { key: 'candelabra', x: 1.48, y: 0.0, z: -2.42, h: 1.52, anchorY: 1, emissive: 1.18, emCol: [1.0, 0.74, 0.30], rim: 0.65 },
    { key: 'luggageScrolls', x: 2.38, y: 0.0, z: -2.06, h: 1.06, anchorY: 1, emissive: 0.0, emCol: [1, 1, 1], rim: 0.55 },
    { key: 'barrelStack', x: 3.48, y: 0.0, z: -2.15, h: 1.08, anchorY: 1, emissive: 0.0, emCol: [1, 1, 1], rim: 0.5 },
    { key: 'stoolMug', x: 1.56, y: 0.0, z: -1.52, h: 0.74, anchorY: 1, emissive: 0.0, emCol: [1, 1, 1], rim: 0.55 },
    // 右侧抬高迷你小蟹苔藓石台专属摆件
    { key: 'mossRock', x: 3.24, y: 0.40, z: -0.56, h: 0.74, anchorY: 1, emissive: 1.05, emCol: [0.36, 0.96, 0.84], rim: 0.75 },
    { key: 'miniLanternPost', x: 2.20, y: 0.40, z: -0.56, h: 0.94, anchorY: 1, emissive: 1.22, emCol: [1.0, 0.72, 0.30], rim: 0.75 },
    // 穹顶多深度悬吊暖灯 + 干花串灯
    { key: 'garland', x: -1.65, y: 3.12, z: -2.25, h: 0.74, wScale: 2.4, anchorY: 0, emissive: 0.75, emCol: [1.0, 0.76, 0.36], rim: 0.25 },
    { key: 'garland', x: 1.65, y: 3.12, z: -2.25, h: 0.74, wScale: 2.4, anchorY: 0, emissive: 0.75, emCol: [1.0, 0.76, 0.36], rim: 0.25 },
    { key: 'chandelier', x: 0.0, y: 3.34, z: -1.18, h: 1.15, anchorY: 0, emissive: 1.25, emCol: [1.0, 0.72, 0.28], rim: 0.4, sway: 0.025 },
    { key: 'lantern', x: -2.35, y: 3.24, z: -1.52, h: 0.92, anchorY: 0, emissive: 1.18, emCol: [1.0, 0.70, 0.28], rim: 0.4, sway: 0.04 },
    { key: 'lantern', x: 2.35, y: 3.24, z: -1.52, h: 0.92, anchorY: 0, emissive: 1.18, emCol: [1.0, 0.70, 0.28], rim: 0.4, sway: -0.04 },
    { key: 'lantern', x: -3.28, y: 3.18, z: 0.32, h: 0.88, anchorY: 0, emissive: 1.12, emCol: [1.0, 0.68, 0.26], rim: 0.35, sway: 0.03 },
    { key: 'lantern', x: 3.28, y: 3.18, z: 0.32, h: 0.88, anchorY: 0, emissive: 1.12, emCol: [1.0, 0.68, 0.26], rim: 0.35, sway: -0.03 },
    // 前景景深左右暗木常春藤立柱（拉入 16:9 视锥最边缘 ~6% 画框，鼠标移过呈现强近景 3D 视差 + Tilt-Shift 景深）
    { key: 'fgPillarLeft', x: -2.42, y: -0.32, z: 1.82, h: 3.25, anchorY: 1, emissive: 0.0, emCol: [1, 1, 1], rim: 0.35 },
    { key: 'fgPillarRight', x: 2.48, y: -0.32, z: 1.82, h: 3.25, anchorY: 1, emissive: 1.05, emCol: [1.0, 0.72, 0.30], rim: 0.4 },
  ];

  // ── WebGL2 主引擎工厂 ──────────────────────────────────────────────────────
  function createStage(opts) {
    const canvas = opts && opts.canvas;
    const doc = (opts && opts.doc) || (canvas && canvas.ownerDocument) || (typeof document !== 'undefined' ? document : null);
    const win = (doc && doc.defaultView) || (typeof window !== 'undefined' ? window : null);
    if (!canvas || typeof canvas.getContext !== 'function') return null;

    let gl = null;
    try {
      gl = canvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false,
      });
    } catch {
      gl = null;
    }
    if (!isRealWebGL2Context(gl)) return null;

    const allShaders = [];
    const allPrograms = [];
    const allVaos = [];
    const allBuffers = [];
    const allTextures = [];
    const allFbos = [];
    const allRbos = [];

    const compileShader = (type, src) => {
      const sh = gl.createShader(type);
      if (!sh) return null;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        gl.deleteShader(sh);
        return null;
      }
      allShaders.push(sh);
      return sh;
    };

    const linkProgram = (vsSrc, fsSrc) => {
      const vs = compileShader(gl.VERTEX_SHADER, vsSrc);
      const fs = compileShader(gl.FRAGMENT_SHADER, fsSrc);
      if (!vs || !fs) return null;
      const prog = gl.createProgram();
      if (!prog) return null;
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        gl.deleteProgram(prog);
        return null;
      }
      allPrograms.push(prog);
      return prog;
    };

    const progScene = linkProgram(VS_SCENE, FS_SCENE);
    const progFx = linkProgram(VS_FX, FS_FX);
    const progBlur = linkProgram(VS_QUAD, FS_BLUR);
    const progComp = linkProgram(VS_QUAD, FS_COMPOSITE);
    if (!progScene || !progFx || !progBlur || !progComp) {
      cleanupAll();
      return null;
    }

    const uLoc = (prog, names) => {
      const m = {};
      for (const n of names) m[n] = gl.getUniformLocation(prog, n);
      return m;
    };
    const uScene = uLoc(progScene, [
      'uViewProj', 'uModel', 'uUvRect', 'uTex', 'uTexelSize', 'uUvBounds',
      'uTint', 'uEmissive', 'uFlags', 'uLightTheme', 'uHearth', 'uSlotPos[0]', 'uSlotCol[0]',
    ]);
    const uFx = uLoc(progFx, ['uViewProj', 'uModel', 'uColor', 'uParams']);
    const uBlur = uLoc(progBlur, ['uSrc', 'uDir']);
    const uComp = uLoc(progComp, ['uScene', 'uBlur', 'uBloom', 'uGrade']);

    const createMesh = (verts, strideFloats, layout) => {
      const vao = gl.createVertexArray();
      const vbo = gl.createBuffer();
      if (!vao || !vbo) return null;
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
      const stride = strideFloats * 4;
      for (const [loc, size, off] of layout) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, off * 4);
      }
      gl.bindVertexArray(null);
      allVaos.push(vao);
      allBuffers.push(vbo);
      return { vao, count: verts.length / strideFloats };
    };

    const sceneLayout = [[0, 3, 0], [1, 3, 3], [2, 2, 6]];
    const fxLayout = [[0, 3, 0], [1, 2, 3]];

    const meshWall = createMesh(makeQuadVerts(11.4, 4.5, 1), 8, sceneLayout);
    const meshFloor = createMesh(makeFloorVerts(11.4, 6.0, 5.0, 3.0), 8, sceneLayout);
    const meshFloorEdge = createMesh(makeQuadVerts(11.4, 0.42, 0), 8, sceneLayout);
    const meshRug = createMesh(makeFloorVerts(4.45, 1.52, 1.0, 1.0), 8, sceneLayout);
    const meshUnitQuadBot = createMesh(makeQuadVerts(1.0, 1.0, 1), 8, sceneLayout);
    const meshUnitQuadTop = createMesh(makeQuadVerts(1.0, 1.0, 0), 8, sceneLayout);
    const meshMiniPlat = createMesh(makeBoxVerts(1.74, 0.40, 1.48, 2.0, 0.7), 8, sceneLayout);
    const meshStepUpper = createMesh(makeBoxVerts(0.18, 0.26, 0.94, 0.5, 0.5), 8, sceneLayout);
    const meshStepLower = createMesh(makeBoxVerts(0.16, 0.13, 0.82, 0.45, 0.35), 8, sceneLayout);
    const meshBeamCone = createMesh(makeBeamConeVerts(), 5, fxLayout);
    const meshFxFloor = createMesh(makeFxQuadVerts(true), 5, fxLayout);
    const meshFxCard = createMesh(makeFxQuadVerts(false), 5, fxLayout);
    const emptyVao = gl.createVertexArray();
    if (emptyVao) allVaos.push(emptyVao);

    // ── 纹理创建与热插拔（100% gl.NEAREST 零模糊锐利像素）───────────────────
    const createPixelTex = (w, h, data, wrapRepeat = false) => {
      const tex = gl.createTexture();
      if (!tex) return null;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      const wrap = wrapRepeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
      allTextures.push(tex);
      return { tex, w, h };
    };

    const procWall = buildProceduralWall();
    const procFloor = buildProceduralFloor();
    const procStone = buildProceduralStone();
    const procProps = buildProceduralPropsAtlas();

    const wallTexInfo = createPixelTex(procWall.w, procWall.h, procWall.data, false);
    const floorTexInfo = createPixelTex(procFloor.w, procFloor.h, procFloor.data, true);
    const stoneTexInfo = createPixelTex(procStone.w, procStone.h, procStone.data, true);
    const propsTexInfo = createPixelTex(procProps.buf.w, procProps.buf.h, procProps.buf.data, false);
    let activeRects = procProps.rects;
    let atlasLoadedFlags = { wall: false, floor: false, props: false };
    let atlasBoundRef = null;
    const pendingImages = [];

    // 无缝热插拔外部美术图集（globalThis.__agOctopathTavernAtlas）
    const tryBindExternalAtlas = () => {
      const ext = (root && root.__agOctopathTavernAtlas) || (win && win.__agOctopathTavernAtlas) || null;
      if (!ext || ext === atlasBoundRef || typeof Image !== 'function') return;
      atlasBoundRef = ext;
      const loadInto = (url, targetInfo, wrapRepeat, onReady) => {
        if (!url || typeof url !== 'string' || !targetInfo) return;
        const img = new Image();
        img.decoding = 'async';
        pendingImages.push(img);
        img.onload = () => {
          if (disposed || contextLost) return;
          const iw = img.naturalWidth || img.width || targetInfo.w;
          const ih = img.naturalHeight || img.height || targetInfo.h;
          if (!iw || !ih) return;
          try {
            gl.bindTexture(gl.TEXTURE_2D, targetInfo.tex);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            const wrap = wrapRepeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
            targetInfo.w = iw;
            targetInfo.h = ih;
            if (onReady) onReady(iw, ih);
            if (opts && typeof opts.onAtlasReady === 'function') opts.onAtlasReady();
          } catch {}
        };
        img.src = url;
      };
      loadInto(ext.wallDataUrl, wallTexInfo, false, () => { atlasLoadedFlags.wall = true; });
      loadInto(ext.floorDataUrl, floorTexInfo, true, () => { atlasLoadedFlags.floor = true; });
      loadInto(ext.propsDataUrl, propsTexInfo, false, (iw, ih) => {
        if (ext.rects && typeof ext.rects === 'object') {
          const merged = {};
          for (const k of ATLAS_KEYS) {
            const r = ext.rects[k];
            if (r && r.w > 0 && r.h > 0) {
              merged[k] = {
                x: r.x,
                y: r.y,
                w: r.w,
                h: r.h,
                anchorY: typeof r.anchorY === 'number' ? r.anchorY : 1,
                emissive: Boolean(r.emissive),
                glowX: typeof r.glowX === 'number' ? r.glowX : null,
                glowY: typeof r.glowY === 'number' ? r.glowY : null,
              };
            }
          }
          if (Object.keys(merged).length > 0) {
            activeRects = merged;
            atlasLoadedFlags.props = true;
            propsTexInfo.w = ext.propsW || iw;
            propsTexInfo.h = ext.propsH || ih;
          }
        }
      });
    };

    // ── 桌宠动态精灵离屏微画布（256×96, 1 逻辑像素 = 1 纹素, 零抗锯齿, 脏更新）──
    const SPR_W = 256, SPR_H = 96;
    const SPR_MAIN_W = 48, SPR_MAIN_H = 44; // 4 主宠槽：x = idx * 48, y = 0
    const SPR_MINI_W = 24, SPR_MINI_H = 24; // 3 迷你蟹：x = idx * 24, y = 48
    const spriteCanvas = doc && typeof doc.createElement === 'function' ? doc.createElement('canvas') : null;
    if (spriteCanvas) {
      spriteCanvas.width = SPR_W;
      spriteCanvas.height = SPR_H;
    }
    const spriteCtx = spriteCanvas && typeof spriteCanvas.getContext === 'function' ? spriteCanvas.getContext('2d') : null;
    const spriteTexInfo = createPixelTex(SPR_W, SPR_H, new Uint8Array(SPR_W * SPR_H * 4), false);
    const spriteSlotSigs = ['', '', '', '', '', '', ''];

    const syncMascotSprites = (art, slotInfos, tickIdx) => {
      if (!spriteCtx || !spriteCanvas || !art) return;
      let dirty = false;
      spriteCtx.imageSmoothingEnabled = false;
      for (let i = 0; i < 4; i++) {
        const info = slotInfos[i];
        const sig = `${art.source || ''}|${info.kind}|${info.pose}|${info.sym || ''}|${info.breath ? 1 : 0}|${info.blink ? 1 : 0}|${info.animTick}`;
        if (spriteSlotSigs[i] === sig) continue;
        spriteSlotSigs[i] = sig;
        const ox = i * SPR_MAIN_W;
        spriteCtx.clearRect(ox, 0, SPR_MAIN_W, SPR_MAIN_H);
        art.drawMainActor(spriteCtx, info.kind, info.pose, info.animTick, ox + 16, 28, 1, {
          clipTick: info.clipTick,
          sym: info.sym,
          breath: info.breath,
          blink: info.blink,
          noShadow: true,
        });
        dirty = true;
      }
      const miniInfo = slotInfos[4];
      for (let m = 0; m < 3; m++) {
        const id = MINI_OFFSETS[m].id;
        const fk = miniInfo.cheering || miniInfo.isHov ? 'trick' : 'idle';
        const showZ = miniInfo.cnt === 0 && !miniInfo.isHov && !miniInfo.farewell && m === 2;
        const zPhase = showZ ? ((tickIdx >> 1) & 1) : -1;
        const sig = `${art.source || ''}|${id}|${fk}|${zPhase}`;
        if (spriteSlotSigs[4 + m] === sig) continue;
        spriteSlotSigs[4 + m] = sig;
        const ox = m * SPR_MINI_W;
        spriteCtx.clearRect(ox, 48, SPR_MINI_W, SPR_MINI_H);
        art.drawMiniCrab(spriteCtx, id, fk, ox + 4, 48 + 12, 1);
        if (showZ) {
          spriteCtx.fillStyle = '#c8c0b4';
          const zy = 48 + 3 - zPhase;
          spriteCtx.fillRect(ox + 15, zy, 4, 1);
          spriteCtx.fillRect(ox + 17, zy + 1, 1, 1);
          spriteCtx.fillRect(ox + 16, zy + 2, 1, 1);
          spriteCtx.fillRect(ox + 15, zy + 3, 4, 1);
        }
        dirty = true;
      }
      if (dirty) {
        gl.bindTexture(gl.TEXTURE_2D, spriteTexInfo.tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, spriteCanvas);
      }
    };

    // ── 4-FBO 后处理管线管理（Scene MRT + 1/4 Bloom A/B + 1/2 Blur A/B）──────
    let fbW = 0, fbH = 0;
    let sceneFbo = null, sceneTex = null, emissiveTex = null, depthRbo = null;
    let bloomFboA = null, bloomTexA = null, bloomFboB = null, bloomTexB = null;
    let blurFboA = null, blurTexA = null, blurFboB = null, blurTexB = null;
    let bloomW = 1, bloomH = 1, blurW = 1, blurH = 1;

    const makeRenderTex = (w, h, linear) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, linear ? gl.LINEAR : gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, linear ? gl.LINEAR : gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      return t;
    };

    const destroyFbos = () => {
      for (const f of [sceneFbo, bloomFboA, bloomFboB, blurFboA, blurFboB]) if (f) gl.deleteFramebuffer(f);
      for (const t of [sceneTex, emissiveTex, bloomTexA, bloomTexB, blurTexA, blurTexB]) if (t) gl.deleteTexture(t);
      if (depthRbo) gl.deleteRenderbuffer(depthRbo);
      sceneFbo = bloomFboA = bloomFboB = blurFboA = blurFboB = null;
      sceneTex = emissiveTex = bloomTexA = bloomTexB = blurTexA = blurTexB = null;
      depthRbo = null;
    };

    const ensureFbos = (w, h) => {
      if (w === fbW && h === fbH && sceneFbo) return true;
      destroyFbos();
      fbW = w; fbH = h;
      bloomW = Math.max(16, w >> 2);
      bloomH = Math.max(16, h >> 2);
      blurW = Math.max(32, w >> 1);
      blurH = Math.max(32, h >> 1);

      sceneFbo = gl.createFramebuffer();
      sceneTex = makeRenderTex(w, h, false);
      emissiveTex = makeRenderTex(w, h, true);
      depthRbo = gl.createRenderbuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sceneTex, 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, emissiveTex, 0);
      gl.bindRenderbuffer(gl.RENDERBUFFER, depthRbo);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthRbo);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        destroyFbos();
        return false;
      }

      const mkSingle = (tw, th) => {
        const f = gl.createFramebuffer();
        const t = makeRenderTex(tw, th, true);
        gl.bindFramebuffer(gl.FRAMEBUFFER, f);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
        gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
        return { f, t };
      };
      const ba = mkSingle(bloomW, bloomH); bloomFboA = ba.f; bloomTexA = ba.t;
      const bb = mkSingle(bloomW, bloomH); bloomFboB = bb.f; bloomTexB = bb.t;
      const da = mkSingle(blurW, blurH); blurFboA = da.f; blurTexA = da.t;
      const db = mkSingle(blurW, blurH); blurFboB = db.f; blurTexB = db.t;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return true;
    };

    // ── 相机视差平滑状态 + 3D 漂浮星尘与壁炉火星粒子池 ─────────────────────────
    let ptrNx = 0, ptrNy = 0, ptrInside = false;
    let curYaw = 0, curPitch = -20 * DEG2RAD;
    let lastVp = mat4Mul(
      mat4Perspective(34 * DEG2RAD, STAGE_W / STAGE_H, 0.5, 28.0),
      mat4LookAt([0, 3.09, 5.99], [0, 0.78, -0.35], [0, 1, 0])
    );
    let disposed = false;
    let contextLost = false;
    let drawFrames = 0;

    // 26 颗常驻空间像素光尘 + 前景散景微粒
    const dustMotes = Array.from({ length: 26 }, (_, i) => ({
      x: ((i * 73) % 100 - 50) * 0.082,
      y: 0.25 + ((i * 37) % 100) * 0.028,
      z: i < 10 ? 1.45 + (i % 5) * 0.14 : -2.2 + ((i * 29) % 100) * 0.032,
      spd: 0.16 + (i % 5) * 0.06,
      ph: i * 1.37,
      warm: i % 3 !== 0,
      size: i < 10 ? 0.10 : 0.055,
    }));

    const onCtxLost = (ev) => {
      ev?.preventDefault?.();
      contextLost = true;
      if (opts && typeof opts.onContextLost === 'function') opts.onContextLost();
    };
    const onCtxRestored = () => {
      contextLost = false;
    };
    canvas.addEventListener?.('webglcontextlost', onCtxLost, false);
    canvas.addEventListener?.('webglcontextrestored', onCtxRestored, false);

    const resize = () => {
      if (disposed || contextLost) return false;
      const dpr = Math.min((win && win.devicePixelRatio) || 1, MAX_DPR);
      const rect = typeof canvas.getBoundingClientRect === 'function' ? canvas.getBoundingClientRect() : null;
      const cssW = rect && rect.width > 120 ? Math.min(rect.width, 760) : STAGE_W;
      const tw = Math.min(960, Math.max(320, Math.round(cssW * dpr)));
      const th = Math.round((tw * STAGE_H) / STAGE_W);
      if (canvas.width !== tw || canvas.height !== th) {
        canvas.width = tw;
        canvas.height = th;
      }
      return ensureFbos(tw, th);
    };

    const drawSceneMesh = (mesh, texInfo, model, optsDraw) => {
      gl.bindVertexArray(mesh.vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texInfo.tex);
      gl.uniform1i(uScene.uTex, 0);
      gl.uniformMatrix4fv(uScene.uModel, false, model);
      const r = optsDraw.uvRect || [0, 0, 1, 1];
      gl.uniform4f(uScene.uUvRect, r[0], r[1], r[2], r[3]);
      const tw = texInfo.w || 1;
      const th = texInfo.h || 1;
      gl.uniform2f(uScene.uTexelSize, 1 / tw, 1 / th);
      const b = optsDraw.uvBounds || [r[0] + 0.5 / tw, r[1] + 0.5 / th, r[0] + r[2] - 0.5 / tw, r[1] + r[3] - 0.5 / th];
      gl.uniform4f(uScene.uUvBounds, b[0], b[1], b[2], b[3]);
      const tn = optsDraw.tint || [1, 1, 1, 1];
      gl.uniform4f(uScene.uTint, tn[0], tn[1], tn[2], tn[3]);
      const em = optsDraw.emissive || [1, 1, 1, 0];
      gl.uniform4f(uScene.uEmissive, em[0], em[1], em[2], em[3]);
      const fl = optsDraw.flags || [0, 0, 1, 0];
      gl.uniform4f(uScene.uFlags, fl[0], fl[1], fl[2], fl[3]);
      gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
    };

    const drawFxMesh = (mesh, model, col, params) => {
      gl.bindVertexArray(mesh.vao);
      gl.uniformMatrix4fv(uFx.uModel, false, model);
      gl.uniform4f(uFx.uColor, col[0], col[1], col[2], col[3]);
      gl.uniform4f(uFx.uParams, params[0], params[1], params[2], params[3]);
      gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
    };

    const runBlurPass = (srcTex, fboA, texA, fboB, texB, w, h, spread) => {
      gl.useProgram(progBlur);
      gl.bindVertexArray(emptyVao);
      gl.viewport(0, 0, w, h);
      // Horizontal
      gl.bindFramebuffer(gl.FRAMEBUFFER, fboA);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, srcTex);
      gl.uniform1i(uBlur.uSrc, 0);
      gl.uniform2f(uBlur.uDir, spread / w, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // Vertical
      gl.bindFramebuffer(gl.FRAMEBUFFER, fboB);
      gl.bindTexture(gl.TEXTURE_2D, texA);
      gl.uniform2f(uBlur.uDir, 0, spread / h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const render = (now, state) => {
      if (disposed || contextLost) return false;
      tryBindExternalAtlas();
      if (!resize()) return false;

      const dtSec = Math.min(0.08, Math.max(0.008, (state.dt || 45) / 1000));
      const timeSec = (now || 0) * 0.001;
      const lightMode = state.light ? 1.0 : 0.0;
      const reduced = Boolean(state.reducedMotion);

      // 1. 丝滑阻尼 3D 视差相机（基础 pitch -20°, yaw ±6.5°, pitch ±2.8°）
      const tgtYaw = !reduced && ptrInside ? Math.max(-1, Math.min(1, ptrNx)) * 6.5 * DEG2RAD : 0;
      const tgtPitch = (-20 - (!reduced && ptrInside ? Math.max(-1, Math.min(1, ptrNy)) * 2.8 : 0)) * DEG2RAD;
      const damp = reduced ? 1.0 : 1.0 - Math.exp(-dtSec * 7.5);
      curYaw += (tgtYaw - curYaw) * damp;
      curPitch += (tgtPitch - curPitch) * damp;

      const target = [0.0, 0.78, -0.35];
      const R = 6.75;
      const cosP = Math.cos(-curPitch);
      const sinP = Math.sin(-curPitch);
      const eye = [
        target[0] + R * cosP * Math.sin(curYaw),
        target[1] + R * sinP,
        target[2] + R * cosP * Math.cos(curYaw),
      ];
      const proj = mat4Perspective(34 * DEG2RAD, fbW / fbH, 0.5, 28.0);
      const view = mat4LookAt(eye, target, [0, 1, 0]);
      const vp = mat4Mul(proj, view);
      lastVp = vp;

      // 2. 同步桌宠像素精灵图集
      const slotInfos = state.slotInfos || [];
      syncMascotSprites(state.art, slotInfos, state.tickIdx || 0);

      // 3. Pass 1: 渲染 3D 场景至 MRT (sceneTex + emissiveTex + DEPTH16)
      gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFbo);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      gl.viewport(0, 0, fbW, fbH);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.clearBufferfv(gl.COLOR, 0, lightMode > 0.5 ? [0.88, 0.82, 0.72, 1.0] : [0.015, 0.022, 0.048, 1.0]);
      gl.clearBufferfv(gl.COLOR, 1, [0.0, 0.0, 0.0, 1.0]);
      gl.clear(gl.DEPTH_BUFFER_BIT);

      gl.useProgram(progScene);
      gl.uniformMatrix4fv(uScene.uViewProj, false, vp);
      gl.uniform4f(uScene.uLightTheme, lightMode, timeSec, 0, 0);
      const hearthFlicker = 2.40 + 0.34 * Math.sin(timeSec * 7.3) + 0.18 * Math.sin(timeSec * 13.1);
      gl.uniform4f(uScene.uHearth, -0.02, 0.76, -3.12, hearthFlicker * (lightMode > 0.5 ? 0.55 : 1.0));

      const slotPosArr = new Float32Array(20);
      const slotColArr = new Float32Array(20);
      for (let i = 0; i < 5; i++) {
        const sp = SLOT_WORLD_POS[i];
        const li = slotInfos[i] ? slotInfos[i].light : 0;
        slotPosArr[i * 4] = sp.x;
        slotPosArr[i * 4 + 1] = sp.y;
        slotPosArr[i * 4 + 2] = sp.z;
        slotPosArr[i * 4 + 3] = li;
        slotColArr[i * 4] = sp.col[0];
        slotColArr[i * 4 + 1] = sp.col[1];
        slotColArr[i * 4 + 2] = sp.col[2];
        slotColArr[i * 4 + 3] = 1.0;
      }
      gl.uniform4fv(uScene['uSlotPos[0]'], slotPosArr);
      gl.uniform4fv(uScene['uSlotCol[0]'], slotColArr);

      // 3a) 远景黑曜石酒馆星夜后墙 (z = -3.50)
      drawSceneMesh(meshWall, wallTexInfo, modelMat(0, 0, -3.50, 1, 1, 1), {
        emissive: [0.96, 0.84, 0.70, lightMode > 0.5 ? 0.28 : 0.72],
        flags: [0, 0, 1, 0],
      });

      // 3b) 木石拼花主地板 + 立体前缘厚度 + 织金长地毯（居于 4 主宠脚下，右沿止于 +1.46 不撞石阶）
      drawSceneMesh(meshFloor, floorTexInfo, modelMat(0, 0, -0.50, 1, 1, 1), {
        uvBounds: [0, 0, 5.0, 3.0],
        flags: [0, 1, 1, 0],
      });
      drawSceneMesh(meshFloorEdge, stoneTexInfo, modelMat(0, 0, 2.50, 1, 1, 1), {
        uvBounds: [0, 0, 1, 1],
        tint: [0.76, 0.68, 0.62, 1],
        flags: [0, 0, 1, 0],
      });
      const rugRect = activeRects.rug;
      if (rugRect) {
        const u0 = rugRect.x / propsTexInfo.w;
        const v0 = rugRect.y / propsTexInfo.h;
        const uw = rugRect.w / propsTexInfo.w;
        const vh = rugRect.h / propsTexInfo.h;
        drawSceneMesh(meshRug, propsTexInfo, modelMat(-0.78, 0.012, -0.10, 1, 1, 1), {
          uvRect: [u0, v0, uw, vh],
          flags: [0, 1, 1, 0],
        });
      }

      // 3c) 右侧抬高迷你小蟹专属暖黑曜石双层石台与立体阶梯（左沿 +1.99，最左台阶 +1.65，与蓝鲸留足清晰间距）
      drawSceneMesh(meshMiniPlat, stoneTexInfo, modelMat(2.86, 0.0, -0.14, 1, 1, 1), {
        uvBounds: [0, 0, 2, 2],
        tint: [0.96, 0.88, 0.80, 1],
        flags: [0, 0.65, 1, 0],
      });
      drawSceneMesh(meshStepUpper, stoneTexInfo, modelMat(1.90, 0.0, -0.04, 1, 1, 1), {
        uvBounds: [0, 0, 1, 1],
        tint: [0.92, 0.84, 0.76, 1],
        flags: [0, 0.5, 1, 0],
      });
      drawSceneMesh(meshStepLower, stoneTexInfo, modelMat(1.73, 0.0, 0.0, 1, 1, 1), {
        uvBounds: [0, 0, 1, 1],
        tint: [0.88, 0.80, 0.72, 1],
        flags: [0, 0.5, 1, 0],
      });

      // 3d) 极繁生活感像素摆件立牌（全 gl.NEAREST + Rim Light + 动态暖发光；外部壁炉墙已载入时自动跳过 hearth 避免重叠）
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      const pw = propsTexInfo.w || 256;
      const ph = propsTexInfo.h || 256;
      for (let i = 0; i < TAVERN_PROPS_LAYOUT.length; i++) {
        const item = TAVERN_PROPS_LAYOUT[i];
        if (item.skipWithExternalWall && atlasLoadedFlags.wall) continue;
        const rect = activeRects[item.key];
        if (!rect) continue;
        const rawAspect = rect.w / Math.max(1, rect.h);
        const aspect = item.wScale && rawAspect < 1.35 ? rawAspect * item.wScale : Math.min(rawAspect, 3.2);
        const w = item.h * aspect;
        const swayZ = item.sway && !reduced ? Math.sin(timeSec * 1.4 + i) * item.sway : 0;
        const m = modelMat(item.x, item.y, item.z, w, item.h, 1, 0, swayZ);
        const mesh = item.anchorY === 0 ? meshUnitQuadTop : meshUnitQuadBot;
        const u0 = rect.x / pw;
        const v0 = rect.y / ph;
        const uw = rect.w / pw;
        const vh = rect.h / ph;
        const emBoost = (item.emissive || 0) * (rect.emissive !== false ? 1 : 0.4) * (lightMode > 0.5 ? 0.55 : 0.92);
        drawSceneMesh(mesh, propsTexInfo, m, {
          uvRect: [u0, v0, uw, vh],
          emissive: [item.emCol[0], item.emCol[1], item.emCol[2], emBoost],
          flags: [1, 0, 1, item.rim || 0.45],
        });
      }

      // 3e) 贴地 Contact AO 软阴影 + 阵营地板光环（半透明不写深度）
      gl.depthMask(false);
      gl.useProgram(progFx);
      gl.uniformMatrix4fv(uFx.uViewProj, false, vp);

      // 普通混合绘 Contact AO 地面阴影
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      for (let i = 0; i < 5; i++) {
        const sp = SLOT_WORLD_POS[i];
        const shScale = i === 4 ? 1.32 : 1.02;
        drawFxMesh(meshFxFloor, modelMat(sp.x, sp.y + 0.016, sp.z, shScale, 1, shScale * 0.68), [0.02, 0.02, 0.05, lightMode > 0.5 ? 0.24 : 0.58], [1.0, timeSec, 1.8, 0.0]);
      }

      // Additive 混合绘地板阵营池光、常驻锐利双环魔法光池与点亮瞬间魔法涟漪
      gl.blendFunc(gl.ONE, gl.ONE);
      for (let i = 0; i < 5; i++) {
        const sp = SLOT_WORLD_POS[i];
        const info = slotInfos[i];
        if (!info) continue;
        if (info.light > 0.02) {
          const rad = (i === 4 ? 1.48 : 1.28) + info.light * 0.20;
          const a = info.light * (lightMode > 0.5 ? 0.22 : 0.38);
          drawFxMesh(meshFxFloor, modelMat(sp.x, sp.y + 0.020, sp.z, rad, 1, rad * 0.78), [sp.col[0], sp.col[1], sp.col[2], a], [1.0, timeSec, 1.9, 0.45]);
          const ringPulse = 0.95 + 0.05 * Math.sin(timeSec * 3.0 + i * 1.3);
          const ringRad = (i === 4 ? 1.44 : 1.22) * ringPulse;
          const rippleYield = info.rippleProg > 0 && info.rippleProg < 1 ? 0.55 + info.rippleProg * 0.45 : 1.0;
          const ringA = info.light * rippleYield * (lightMode > 0.5 ? 0.20 : 0.48);
          drawFxMesh(meshFxFloor, modelMat(sp.x, sp.y + 0.022, sp.z, ringRad, 1, ringRad * 0.78), [sp.colHi[0], sp.colHi[1], sp.colHi[2], ringA], [2.0, timeSec, 0.78, 0.72]);
        }
        if (info.rippleProg > 0 && info.rippleProg < 1) {
          const rp = info.rippleProg;
          const scale = (i === 4 ? 1.58 : 1.44) * (0.45 + rp * 0.95);
          const alpha = (1.0 - rp) * 0.74;
          drawFxMesh(meshFxFloor, modelMat(sp.x, sp.y + 0.025, sp.z, scale, 1, scale * 0.82), [sp.colHi[0], sp.colHi[1], sp.colHi[2], alpha], [2.0, timeSec, 0.35 + rp * 0.55, 0.78]);
        }
      }

      // 3f) 5 大桌宠 3D 像素立牌（flags[0]=2 原色护色管线，点亮纯正饱满绝不泛白，休息沉入冷靛蓝暗影）
      gl.depthMask(true);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(progScene);
      gl.uniformMatrix4fv(uScene.uViewProj, false, vp);

      for (let i = 0; i < 4; i++) {
        const sp = SLOT_WORLD_POS[i];
        const info = slotInfos[i] || { light: 0, cnt: 0, jumpWorld: 0, isHov: false, farewell: false };
        const dim = info.cnt === 0 && !info.isHov && !info.farewell ? 0.38 : info.cnt > 0 ? 1.0 : 0.82;
        const m = modelMat(sp.x, sp.y + (info.jumpWorld || 0) - 0.21, sp.z, 1.68, 1.54, 1, curYaw * 0.35, 0);
        const u0 = (i * SPR_MAIN_W) / SPR_W;
        const uw = SPR_MAIN_W / SPR_W;
        const vh = SPR_MAIN_H / SPR_H;
        const fireEm = info.pose === 'dragonFlame' || info.pose === 'whaleSpout' ? 0.32 : 0.0;
        drawSceneMesh(meshUnitQuadBot, spriteTexInfo, m, {
          uvRect: [u0, 0, uw, vh],
          emissive: [sp.colHi[0], sp.colHi[1], sp.colHi[2], fireEm],
          flags: [2, 0, dim, 0.62 + info.light * 0.32],
        });
      }

      // 第 5 站位：抬高暖黑曜石苔藓石台上的 3 只迷你小蟹立体站位！
      const spM = SLOT_WORLD_POS[4];
      const infoM = slotInfos[4] || { light: 0, cnt: 0, cheering: false, cheerProg: 0, isHov: false, farewell: false };
      const dimM = infoM.cnt === 0 && !infoM.isHov && !infoM.farewell ? 0.40 : infoM.cnt > 0 ? 1.0 : 0.82;
      for (let mIdx = 0; mIdx < 3; mIdx++) {
        const mo = MINI_OFFSETS[mIdx];
        const activeLift = mIdx === 2 && infoM.cnt > 0 ? 0.18 : 0;
        const jumpY = infoM.cheering
          ? Math.abs(Math.sin((infoM.cheerProg + mo.phase * 0.18) * Math.PI * 2)) * 0.34
          : infoM.cnt > 0 && !reduced
            ? Math.max(0, Math.sin(timeSec * 2.6 + mo.phase * 1.7)) * 0.05
            : 0;
        const mMat = modelMat(spM.x + mo.dx, spM.y + activeLift + jumpY - 0.105, spM.z + mo.dz, 0.64, 0.64, 1, curYaw * 0.35, 0);
        const u0 = (mIdx * SPR_MINI_W) / SPR_W;
        const v0 = 48 / SPR_H;
        drawSceneMesh(meshUnitQuadBot, spriteTexInfo, mMat, {
          uvRect: [u0, v0, SPR_MINI_W / SPR_W, SPR_MINI_H / SPR_H],
          emissive: [spM.colHi[0], spM.colHi[1], spM.colHi[2], infoM.cheering ? 0.24 : 0.0],
          flags: [2, 0, dimM, 0.62 + infoM.light * 0.32],
        });
      }

      // 3g) 体积丁达尔光柱（冷月斜射窗光 + 5 束可开关真 3D 阵营体积光柱）+ 3D 金粉星尘与壁炉火星
      gl.depthMask(false);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(progFx);
      gl.uniformMatrix4fv(uFx.uViewProj, false, vp);

      // 左右哥特拱窗斜射冷月丁达尔光束（塑造冷暖强对比）
      const moonA = lightMode > 0.5 ? 0.08 : 0.20;
      drawFxMesh(meshFxCard, modelMat(-2.30, 1.58, -2.98, 1.85, 2.95, 1, 0, -0.26), [0.28, 0.54, 1.0, moonA], [0.0, timeSec, 0, 0.74]);
      drawFxMesh(meshFxCard, modelMat(2.30, 1.58, -2.98, 1.85, 2.95, 1, 0, 0.26), [0.28, 0.54, 1.0, moonA], [0.0, timeSec, 0, 0.74]);

      // 居中壁炉动态炽烈暖光晕与升腾火星粒子（精准落于后墙大壁炉膛口，零重叠穿帮）
      const hearthZ = atlasLoadedFlags.wall ? -3.26 : -2.62;
      const hearthY = atlasLoadedFlags.wall ? 0.64 : 0.46;
      const hGlowA = (lightMode > 0.5 ? 0.20 : 0.58) * (0.85 + 0.15 * Math.sin(timeSec * 9.2));
      drawFxMesh(meshFxCard, modelMat(-0.02, hearthY, hearthZ, 1.46, 1.10, 1), [1.0, 0.48, 0.12, hGlowA], [1.0, timeSec, 1.72, 1.46]);
      for (let e = 0; e < 9; e++) {
        const ep = ((timeSec * (0.38 + (e % 4) * 0.08) + e * 0.19) % 1.0);
        const ex = -0.02 + Math.sin(timeSec * 3.1 + e * 2.1) * (0.18 + ep * 0.16) + ((e % 3) - 1) * 0.14;
        const ey = 0.26 + ep * 0.96;
        drawFxMesh(meshFxCard, modelMat(ex, ey, hearthZ + 0.06, 0.055, 0.055, 1), [1.0, 0.74 - ep * 0.36, 0.20, (1.0 - ep) * 0.98], [3.0, timeSec, 0, 1.55]);
      }

      // 精准联动美术图集各摆件发光核 (glowX, glowY) 的 3D 柔暖/荧光 Bloom 呼吸光晕
      for (let i = 0; i < TAVERN_PROPS_LAYOUT.length; i++) {
        const item = TAVERN_PROPS_LAYOUT[i];
        if (item.skipWithExternalWall && atlasLoadedFlags.wall) continue;
        const rect = activeRects[item.key];
        if (!rect || !rect.emissive || typeof rect.glowX !== 'number' || typeof rect.glowY !== 'number') continue;
        const rawAspect = rect.w / Math.max(1, rect.h);
        const aspect = item.wScale && rawAspect < 1.35 ? rawAspect * item.wScale : Math.min(rawAspect, 3.2);
        const w = item.h * aspect;
        const yTop = item.anchorY === 0 ? item.y : item.y + item.h;
        const gx = item.x + (rect.glowX - 0.5) * w;
        const gy = yTop - rect.glowY * item.h;
        const pulse = 0.84 + 0.16 * Math.sin(timeSec * 4.2 + i * 1.7);
        const haloSz = Math.min(1.02, Math.max(0.42, item.h * 0.54));
        const haloA = (lightMode > 0.5 ? 0.13 : 0.34) * pulse;
        drawFxMesh(meshFxCard, modelMat(gx, gy, item.z + 0.05, haloSz, haloSz, 1), [item.emCol[0], item.emCol[1], item.emCol[2], haloA], [1.0, timeSec, 2.0, 1.28]);
      }

      // 5 束可开关真 3D 交叉锥形体积光柱（略偏后置 z - 0.10 令高饱和光柱从主角头顶与身后划破暗夜，绝不糊白精灵面部！）
      for (let i = 0; i < 5; i++) {
        const sp = SLOT_WORLD_POS[i];
        const info = slotInfos[i];
        if (!info || info.light <= 0.02) continue;
        const beamA = info.light * (lightMode > 0.5 ? 0.15 : 0.36);
        drawFxMesh(meshBeamCone, modelMat(sp.x, sp.y, sp.z - 0.10, 1, 1, 1), [sp.col[0], sp.col[1], sp.col[2], beamA], [0.0, timeSec, 1.0, 0.62]);
        // 顶梁发光灯芯（高 Emissive 进 Bloom）
        drawFxMesh(meshFxCard, modelMat(sp.x, sp.y + 2.95, sp.z - 0.08, 0.40, 0.23, 1), [sp.colHi[0], sp.colHi[1], sp.colHi[2], info.light * 0.94], [1.0, timeSec, 1.35, 1.44]);
        // 槽位上升 3D 像素金粉星尘
        for (let k = 0; k < 6; k++) {
          const prog = ((timeSec * (0.18 + (k % 3) * 0.07) + k * 0.17 + i * 0.11) % 1.0);
          const ang = k * 1.15 + timeSec * 0.7;
          const rad = 0.16 + (1.0 - prog) * 0.36;
          const mx = sp.x + Math.cos(ang) * rad;
          const my = sp.y + 0.24 + prog * 2.40;
          const mz = sp.z - 0.08 + Math.sin(ang) * rad * 0.6;
          const tw = (0.45 + 0.55 * Math.sin(timeSec * 4.2 + k * 1.9)) * Math.sin(prog * Math.PI) * info.light;
          drawFxMesh(meshFxCard, modelMat(mx, my, mz, 0.065, 0.065, 1), [sp.colHi[0], sp.colHi[1], sp.colHi[2], tw * 0.92], [3.0, timeSec, 0, 1.32]);
        }
        // 点亮瞬间 3D 爆发星尘
        if (info.cheerProg > 0 && info.cheerProg < 0.72) {
          const bp = info.cheerProg / 0.72;
          for (let b = 0; b < 8; b++) {
            const ba = (b / 8) * Math.PI * 2 + i;
            const bx = sp.x + Math.cos(ba) * (0.16 + bp * 0.68);
            const by = sp.y + 0.38 + bp * (0.85 + (b % 3) * 0.35);
            const bz = sp.z - 0.04 + Math.sin(ba) * (0.14 + bp * 0.44);
            drawFxMesh(meshFxCard, modelMat(bx, by, bz, 0.078, 0.078, 1), [sp.colHi[0], sp.colHi[1], sp.colHi[2], (1.0 - bp) * 0.94], [3.0, timeSec, 0, 1.42]);
          }
        }
      }

      // 空间漫游暖金浮尘 & 前景散景光斑（进入前景 Tilt-Shift 景深虚化）
      for (let i = 0; i < dustMotes.length; i++) {
        const d = dustMotes[i];
        const yOff = reduced ? 0 : ((timeSec * d.spd + d.ph) % 2.8);
        const py = 0.25 + ((d.y + yOff) % 2.8);
        const px = d.x + Math.sin(timeSec * 0.7 + d.ph) * 0.14;
        const tw = 0.45 + 0.55 * Math.sin(timeSec * 2.1 + d.ph);
        const col = d.warm ? [1.0, 0.78, 0.38] : [0.56, 0.78, 1.0];
        const a = tw * (lightMode > 0.5 ? 0.30 : 0.48);
        const mode = i < 10 ? 1.0 : 3.0;
        drawFxMesh(meshFxCard, modelMat(px, py, d.z, d.size, d.size, 1), [col[0], col[1], col[2], a], [mode, timeSec, 1.6, 1.15]);
      }

      gl.disable(gl.BLEND);
      gl.disable(gl.DEPTH_TEST);

      // 4. Pass 2: 1/4 分辨率 2 轮可分离 9-tap Bloom 泛光
      runBlurPass(emissiveTex, bloomFboA, bloomTexA, bloomFboB, bloomTexB, bloomW, bloomH, 1.15);
      runBlurPass(bloomTexB, bloomFboA, bloomTexA, bloomFboB, bloomTexB, bloomW, bloomH, 2.05);

      // 5. Pass 3: 1/2 分辨率移轴景深模糊缓冲
      runBlurPass(sceneTex, blurFboA, blurTexA, blurFboB, blurTexB, blurW, blurH, 1.45);

      // 6. Pass 4: 最终电影级合成（Tilt-Shift 移轴景深 + Bloom + ACES Filmic + S-Curve + 暗角）
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, fbW, fbH);
      gl.useProgram(progComp);
      gl.bindVertexArray(emptyVao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sceneTex);
      gl.uniform1i(uComp.uScene, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, blurTexB);
      gl.uniform1i(uComp.uBlur, 1);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, bloomTexB);
      gl.uniform1i(uComp.uBloom, 2);
      const bloomStr = lightMode > 0.5 ? 0.34 : 0.65;
      const dofStr = lightMode > 0.5 ? 0.50 : 0.66;
      const vigStr = lightMode > 0.5 ? 0.24 : 0.74;
      gl.uniform4f(uComp.uGrade, lightMode, bloomStr, dofStr, vigStr);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      drawFrames += 1;
      return true;
    };

    const setPointer = (nx, ny, inside) => {
      ptrNx = Number.isFinite(nx) ? nx : 0;
      ptrNy = Number.isFinite(ny) ? ny : 0;
      ptrInside = Boolean(inside);
    };

    // 3D 精确射线投影拾取（将 5 槽位 3D 中心与高度投影至 NDC，再按距离精确判定）
    const pickSlot = (nx, ny) => {
      if (!Number.isFinite(nx) || !Number.isFinite(ny)) return -1;
      let best = -1;
      let bestScore = Infinity;
      for (let i = 0; i < SLOT_WORLD_POS.length; i++) {
        const sp = SLOT_WORLD_POS[i];
        const center = projectToNdc(lastVp, sp.x, sp.y + 0.58, sp.z);
        const edge = projectToNdc(lastVp, sp.x + sp.hitR, sp.y + 0.58, sp.z);
        if (!center || !edge) continue;
        const radX = Math.max(0.14, Math.abs(edge.nx - center.nx));
        const radY = radX * 1.95;
        const dx = (nx - center.nx) / radX;
        const dy = (ny - center.ny) / radY;
        const d2 = dx * dx + dy * dy;
        if (d2 <= 1.25) {
          const score = d2 + center.nz * 0.05;
          if (score < bestScore) {
            bestScore = score;
            best = i;
          }
        }
      }
      return best;
    };

    function cleanupAll() {
      try { destroyFbos(); } catch {}
      try { for (const t of allTextures) gl.deleteTexture(t); } catch {}
      try { for (const b of allBuffers) gl.deleteBuffer(b); } catch {}
      try { for (const v of allVaos) gl.deleteVertexArray(v); } catch {}
      try { for (const p of allPrograms) gl.deleteProgram(p); } catch {}
      try { for (const s of allShaders) gl.deleteShader(s); } catch {}
      try { for (const f of allFbos) gl.deleteFramebuffer(f); } catch {}
      try { for (const r of allRbos) gl.deleteRenderbuffer(r); } catch {}
      allTextures.length = 0;
      allBuffers.length = 0;
      allVaos.length = 0;
      allPrograms.length = 0;
      allShaders.length = 0;
      allFbos.length = 0;
      allRbos.length = 0;
    }

    const dispose = () => {
      if (disposed) return;
      disposed = true;
      canvas.removeEventListener?.('webglcontextlost', onCtxLost, false);
      canvas.removeEventListener?.('webglcontextrestored', onCtxRestored, false);
      for (const img of pendingImages) {
        try { img.onload = null; img.onerror = null; } catch {}
      }
      pendingImages.length = 0;
      cleanupAll();
      if (spriteCanvas) {
        spriteCanvas.width = 0;
        spriteCanvas.height = 0;
      }
      try {
        const extLose = gl.getExtension && gl.getExtension('WEBGL_lose_context');
        if (extLose && typeof extLose.loseContext === 'function') extLose.loseContext();
      } catch {}
      canvas.width = 0;
      canvas.height = 0;
    };

    return {
      render,
      resize,
      setPointer,
      pickSlot,
      isContextLost: () => contextLost,
      getStats: () => ({
        backend: 'webgl2',
        width: fbW,
        height: fbH,
        drawFrames,
        atlasLoaded: { ...atlasLoadedFlags },
        propCount: TAVERN_PROPS_LAYOUT.length,
        cameraYawDeg: Math.round((curYaw / DEG2RAD) * 100) / 100,
        cameraPitchDeg: Math.round((curPitch / DEG2RAD) * 100) / 100,
      }),
      dispose,
    };
  }

  return {
    STAGE_W,
    STAGE_H,
    SLOT_WORLD_POS,
    TAVERN_PROPS_LAYOUT,
    isRealWebGL2Context,
    isSupported,
    createStage,
  };
});

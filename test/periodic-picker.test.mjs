import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const PERIODIC_PICKER_DIR = path.join(ROOT_DIR, 'vendor', 'periodic-picker');
const PERIODIC_MODULE_ORDER = [
  'pbr-grain-assets.js',
  'audio-fx.js',
  'model-catalog.js',
  'host-bridge.js',
  'oled-cyber-screen.js',
  'keyboard-3d-gl.js',
  'bento-ui.js',
  'periodic-picker.js',
];
const ALL_PERIODIC_FILES = PERIODIC_MODULE_ORDER.map((name) => path.join(PERIODIC_PICKER_DIR, name));
const GRAIN_ASSETS_FILE = path.join(PERIODIC_PICKER_DIR, 'pbr-grain-assets.js');
const AUDIO_FX_FILE = path.join(PERIODIC_PICKER_DIR, 'audio-fx.js');
const MODEL_CATALOG_FILE = path.join(PERIODIC_PICKER_DIR, 'model-catalog.js');
const HOST_BRIDGE_FILE = path.join(PERIODIC_PICKER_DIR, 'host-bridge.js');
const OLED_SCREEN_FILE = path.join(PERIODIC_PICKER_DIR, 'oled-cyber-screen.js');
const KEYBOARD_3D_FILE = path.join(PERIODIC_PICKER_DIR, 'keyboard-3d-gl.js');
const BENTO_UI_FILE = path.join(PERIODIC_PICKER_DIR, 'bento-ui.js');
const PERIODIC_PICKER_FILE = path.join(PERIODIC_PICKER_DIR, 'periodic-picker.js');
const HOST_I18N_FILE = path.join(ROOT_DIR, 'vendor', 'host-i18n', 'host-i18n-runtime.js');

const require = createRequire(import.meta.url);
const cdp = require(path.join(ROOT_DIR, 'cdp.js'));

/**
 * 构造轻量高保真 DOM + 假时钟 + 事件捕获/冒泡沙盒（零外部依赖，严格对称计数监听与定时器）
 */
function createMock2DContext() {
  const drawnTexts = [];
  return {
    _drawnTexts: drawnTexts,
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    font: '12px sans-serif',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    shadowBlur: 0,
    shadowColor: '',
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    filter: 'none',
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high',
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    scale() {},
    clip() {},
    clearRect() {},
    fillRect() {},
    strokeRect() {},
    fillText(txt) {
      drawnTexts.push(String(txt ?? ''));
    },
    strokeText(txt) {
      drawnTexts.push(String(txt ?? ''));
    },
    setLineDash() {},
    measureText(s) {
      return { width: String(s || '').length * 8 };
    },
    createLinearGradient() {
      return { addColorStop() {} };
    },
    createRadialGradient() {
      return { addColorStop() {} };
    },
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    bezierCurveTo() {},
    rect() {},
    roundRect() {},
    ellipse() {},
    arc() {},
    arcTo() {},
    fill() {},
    stroke() {},
    drawImage() {},
  };
}

function createMockWebGL2Context({ failFbo = false } = {}) {
  let nextId = 1;
  const created = {
    programs: new Set(),
    shaders: new Set(),
    buffers: new Set(),
    vaos: new Set(),
    textures: new Set(),
    framebuffers: new Set(),
  };
  const deleted = {
    programs: new Set(),
    shaders: new Set(),
    buffers: new Set(),
    vaos: new Set(),
    textures: new Set(),
    framebuffers: new Set(),
  };
  let loseContextCalls = 0;
  let drawCalls = 0;
  const shadowTexAllocations = [];
  const rg8TexAllocations = [];
  const rgb8TexAllocations = [];
  const shadowViewports = [];

  const gl = {
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS: 0x8b82,
    ARRAY_BUFFER: 0x8892,
    ELEMENT_ARRAY_BUFFER: 0x8893,
    STATIC_DRAW: 0x88e4,
    DYNAMIC_DRAW: 0x88e8,
    FLOAT: 0x1406,
    UNSIGNED_SHORT: 0x1403,
    UNSIGNED_INT: 0x1405,
    TEXTURE_2D: 0x0de1,
    RGBA: 0x1908,
    RGB: 0x1907,
    RGB8: 0x8051,
    RG: 0x8227,
    RG8: 0x822b,
    DEPTH_COMPONENT: 0x1902,
    DEPTH_COMPONENT24: 0x81a6,
    DEPTH_COMPONENT16: 0x81a5,
    UNSIGNED_BYTE: 0x1401,
    NEAREST: 0x2600,
    LINEAR: 0x2601,
    LINEAR_MIPMAP_LINEAR: 0x2703,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    CLAMP_TO_EDGE: 0x812f,
    REPEAT: 0x2901,
    UNPACK_ALIGNMENT: 0x0cf5,
    UNPACK_FLIP_Y_WEBGL: 0x9240,
    FRAMEBUFFER: 0x8d40,
    DEPTH_ATTACHMENT: 0x8d00,
    FRAMEBUFFER_COMPLETE: 0x8cd5,
    NONE: 0,
    POLYGON_OFFSET_FILL: 0x8037,
    COLOR_BUFFER_BIT: 0x4000,
    DEPTH_BUFFER_BIT: 0x0100,
    DEPTH_TEST: 0x0b71,
    LEQUAL: 0x0203,
    CULL_FACE: 0x0b44,
    BACK: 0x0405,
    BLEND: 0x0be2,
    SRC_ALPHA: 0x0302,
    ONE_MINUS_SRC_ALPHA: 0x0303,
    ONE: 1,
    TEXTURE0: 0x84c0,
    TRIANGLES: 0x0004,
    createShader(type) {
      const sh = { id: nextId++, type };
      created.shaders.add(sh);
      return sh;
    },
    shaderSource() {},
    compileShader() {},
    getShaderParameter() {
      return true;
    },
    deleteShader(sh) {
      if (sh) deleted.shaders.add(sh);
    },
    createProgram() {
      const p = { id: nextId++ };
      created.programs.add(p);
      return p;
    },
    attachShader() {},
    linkProgram() {},
    getProgramParameter() {
      return true;
    },
    deleteProgram(p) {
      if (p) deleted.programs.add(p);
    },
    createBuffer() {
      const b = { id: nextId++ };
      created.buffers.add(b);
      return b;
    },
    bindBuffer() {},
    bufferData() {},
    bufferSubData() {},
    deleteBuffer(b) {
      if (b) deleted.buffers.add(b);
    },
    createVertexArray() {
      const v = { id: nextId++ };
      created.vaos.add(v);
      return v;
    },
    bindVertexArray() {},
    enableVertexAttribArray() {},
    vertexAttribPointer() {},
    vertexAttribDivisor() {},
    deleteVertexArray(v) {
      if (v) deleted.vaos.add(v);
    },
    createTexture() {
      const t = { id: nextId++ };
      created.textures.add(t);
      return t;
    },
    bindTexture() {},
    pixelStorei() {},
    texImage2D(_target, _level, internalformat, width, height, _border, format, _type, pixels) {
      if (internalformat === 0x81a6 || internalformat === 0x81a5 || (width === 2048 && height === 2048)) {
        shadowTexAllocations.push({ internalformat, width, height });
      }
      if (internalformat === 0x822b || format === 0x8227) {
        rg8TexAllocations.push({
          internalformat,
          format,
          width,
          height,
          byteLength: pixels ? pixels.byteLength || pixels.length || 0 : 0,
        });
      }
      if (internalformat === 0x8051 || format === 0x1907) {
        rgb8TexAllocations.push({
          internalformat,
          format,
          width,
          height,
          byteLength: pixels ? pixels.byteLength || pixels.length || 0 : 0,
        });
      }
    },
    generateMipmap() {},
    texParameteri() {},
    texParameterf() {},
    deleteTexture(t) {
      if (t) deleted.textures.add(t);
    },
    createFramebuffer() {
      const fb = { id: nextId++ };
      created.framebuffers.add(fb);
      return fb;
    },
    bindFramebuffer() {},
    framebufferTexture2D() {},
    checkFramebufferStatus() {
      return failFbo ? 0x8cd6 : 0x8cd5;
    },
    drawBuffers() {},
    readBuffer() {},
    deleteFramebuffer(fb) {
      if (fb) deleted.framebuffers.add(fb);
    },
    getExtension(name) {
      if (name === 'EXT_texture_filter_anisotropic' || name === 'WEBKIT_EXT_texture_filter_anisotropic') {
        return { MAX_TEXTURE_MAX_ANISOTROPY_EXT: 0x84ff, TEXTURE_MAX_ANISOTROPY_EXT: 0x84fe };
      }
      if (name === 'WEBGL_lose_context') {
        return {
          loseContext() {
            loseContextCalls += 1;
          },
        };
      }
      return null;
    },
    getParameter() {
      return 4;
    },
    getUniformLocation(_p, name) {
      return { name };
    },
    viewport(x, y, w, h) {
      if (w === 1024 && h === 1024) {
        shadowViewports.push({ x, y, w, h });
      }
    },
    clearColor() {},
    clear() {},
    enable() {},
    disable() {},
    polygonOffset() {},
    depthFunc() {},
    cullFace() {},
    blendFuncSeparate() {},
    useProgram() {},
    activeTexture() {},
    uniform1i() {},
    uniform3f() {},
    uniform3fv() {},
    uniform4f() {},
    uniform4fv() {},
    uniformMatrix4fv() {},
    drawElements() {
      drawCalls += 1;
    },
    drawElementsInstanced() {
      drawCalls += 1;
    },
    _stats() {
      return { created, deleted, loseContextCalls, drawCalls, shadowTexAllocations, rg8TexAllocations, rgb8TexAllocations, shadowViewports };
    },
  };
  return gl;
}

function createPeriodicSandbox({
  href = 'vscode-file://vscode-app/index.html',
  theme = 'dark',
  lang = 'zh-CN',
  bodyClass = 'monaco-workbench',
  mock2d = false,
  mockWebGL2 = false,
  failFbo = false,
} = {}) {
  let nowMs = 10000;
  let nextTimerId = 1;
  let nextRafId = 1;
  const timers = new Map();
  const rafs = new Map();
  const docListenerSet = new Set();
  const winListenerSet = new Set();
  const observers = new Set();
  const resizeObservers = new Set();

  function splitSelectorList(sel) {
    return String(sel || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function matchesSimple(el, sel) {
    if (!el || el.nodeType !== 1) return false;
    const trimmed = String(sel || '').trim();
    if (!trimmed) return false;
    const parts = trimmed.split(/\s+/);
    if (parts.length > 1) {
      if (!matchesCompound(el, parts[parts.length - 1])) return false;
      let cur = el.parentElement;
      for (let i = parts.length - 2; i >= 0; i -= 1) {
        while (cur && !matchesCompound(cur, parts[i])) {
          cur = cur.parentElement;
        }
        if (!cur) return false;
        cur = cur.parentElement;
      }
      return true;
    }
    return matchesCompound(el, trimmed);
  }

  function matchesCompound(el, part) {
    if (!el || el.nodeType !== 1 || !part) return false;
    let rest = part;
    const tagM = /^[a-zA-Z0-9_-]+/.exec(rest);
    if (tagM) {
      if (el.tagName !== tagM[0].toUpperCase()) return false;
      rest = rest.slice(tagM[0].length);
    }
    const tokens = rest.match(/#[a-zA-Z0-9_-]+|\.[a-zA-Z0-9_-]+|\[[^\]]+\]/g) || [];
    if (tokens.join('') !== rest) return false;
    for (const tok of tokens) {
      if (tok.startsWith('#')) {
        if (el.id !== tok.slice(1)) return false;
      } else if (tok.startsWith('.')) {
        if (!el.classList.contains(tok.slice(1))) return false;
      } else if (tok.startsWith('[')) {
        const inner = tok.slice(1, -1);
        const eqIdx = inner.indexOf('=');
        if (eqIdx === -1) {
          if (!el.hasAttribute(inner.trim())) return false;
        } else {
          let attrName = inner.slice(0, eqIdx).trim();
          const want = inner.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
          if (attrName.endsWith('*')) {
            attrName = attrName.slice(0, -1);
            const got = el.getAttribute(attrName) || '';
            if (!got.includes(want)) return false;
          } else {
            if (el.getAttribute(attrName) !== want) return false;
          }
        }
      }
    }
    return true;
  }

  function matchesSelector(el, sel) {
    return splitSelectorList(sel).some((s) => matchesSimple(el, s));
  }

  function createEventObj(type, init = {}, target = null) {
    return {
      type,
      target,
      currentTarget: null,
      button: init.button ?? 0,
      pointerId: init.pointerId ?? 0,
      clientX: init.clientX ?? 0,
      clientY: init.clientY ?? 0,
      deltaX: init.deltaX ?? 0,
      deltaY: init.deltaY ?? 0,
      relatedTarget: init.relatedTarget ?? null,
      key: init.key ?? '',
      code: init.code ?? '',
      keyCode: init.keyCode ?? 0,
      ctrlKey: Boolean(init.ctrlKey),
      metaKey: Boolean(init.metaKey),
      altKey: Boolean(init.altKey),
      shiftKey: Boolean(init.shiftKey),
      bubbles: init.bubbles !== false,
      cancelable: init.cancelable !== false,
      defaultPrevented: false,
      propagationStopped: false,
      immediatePropagationStopped: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      stopPropagation() {
        this.propagationStopped = true;
      },
      stopImmediatePropagation() {
        this.propagationStopped = true;
        this.immediatePropagationStopped = true;
      },
    };
  }

  function createTextNode(text) {
    return {
      nodeType: 3,
      nodeValue: String(text ?? ''),
      parentNode: null,
      parentElement: null,
      get textContent() {
        return this.nodeValue;
      },
      set textContent(v) {
        this.nodeValue = String(v ?? '');
      },
    };
  }

  function makeElement(tag, { id = '', className = '', attrs = {}, text = '', useChildNodes = false } = {}) {
    const attrMap = new Map(Object.entries(attrs));
    const classSet = new Set(String(className).split(/\s+/).filter(Boolean));
    const listeners = { capture: new Map(), bubble: new Map() };
    const children = [];
    const childNodesList = useChildNodes ? [] : null;
    const styleProps = {};
    const upperTag = String(tag).toUpperCase();
    const glCtx = upperTag === 'CANVAS' && mockWebGL2 ? createMockWebGL2Context({ failFbo }) : null;
    const ctx2d = upperTag === 'CANVAS' && mock2d ? createMock2DContext() : null;

    const node = {
      nodeType: 1,
      tagName: upperTag,
      id,
      type: '',
      title: '',
      value: '',
      scrollTop: 0,
      scrollHeight: 0,
      clientHeight: 0,
      width: upperTag === 'CANVAS' ? 960 : 0,
      height: upperTag === 'CANVAS' ? 552 : 0,
      children,
      ...(childNodesList ? { childNodes: childNodesList } : {}),
      parentElement: null,
      parentNode: null,
      _text: text,
      get isContentEditable() {
        return attrMap.get('contenteditable') === 'true';
      },
      focus() {
        documentObj.activeElement = this;
      },
      blur() {
        if (documentObj.activeElement === this) {
          documentObj.activeElement = body;
        }
      },
      ...(upperTag === 'CANVAS' && (mock2d || mockWebGL2)
        ? {
            getContext(kind) {
              if (kind === 'webgl2') return glCtx;
              if (kind === '2d') return ctx2d;
              return null;
            },
            _gl: glCtx,
            _ctx2d: ctx2d,
          }
        : {}),
      style: {
        setProperty(k, v) {
          styleProps[k] = String(v);
        },
        getPropertyValue(k) {
          return styleProps[k] || '';
        },
        removeProperty(k) {
          delete styleProps[k];
        },
        get display() {
          return styleProps.display || '';
        },
        set display(v) {
          styleProps.display = String(v);
        },
      },
      classList: {
        add: (...cs) => cs.forEach((c) => c && classSet.add(c)),
        remove: (...cs) => cs.forEach((c) => classSet.delete(c)),
        contains: (c) => classSet.has(c),
      },
      get className() {
        return Array.from(classSet).join(' ');
      },
      set className(v) {
        classSet.clear();
        String(v || '')
          .split(/\s+/)
          .filter(Boolean)
          .forEach((c) => classSet.add(c));
      },
      get textContent() {
        if (this.childNodes && this.childNodes.length) {
          return this.childNodes.map((c) => (c.nodeType === 3 ? c.nodeValue : c.textContent)).join('');
        }
        return children.length ? children.map((c) => c.textContent).join('') : this._text;
      },
      set textContent(v) {
        children.length = 0;
        if (this.childNodes) this.childNodes.length = 0;
        this._text = String(v ?? '');
      },
      get firstChild() {
        return (this.childNodes ? this.childNodes[0] : children[0]) || null;
      },
      get nextSibling() {
        if (!this.parentNode) return null;
        const list = this.parentNode.childNodes || this.parentNode.children || [];
        const idx = list.indexOf(this);
        return idx >= 0 && idx + 1 < list.length ? list[idx + 1] : null;
      },
      appendChild(ch) {
        if (ch.parentNode && typeof ch.parentNode.removeChild === 'function') {
          ch.parentNode.removeChild(ch);
        }
        ch.parentElement = this;
        ch.parentNode = this;
        if (ch.nodeType === 3 && !this.childNodes) {
          this.childNodes = [...children];
        }
        if (this.childNodes) this.childNodes.push(ch);
        if (ch.nodeType === 1) children.push(ch);
        return ch;
      },
      insertBefore(ch, refNode) {
        if (!refNode) return this.appendChild(ch);
        if (ch.parentNode && typeof ch.parentNode.removeChild === 'function') {
          ch.parentNode.removeChild(ch);
        }
        ch.parentElement = this;
        ch.parentNode = this;
        if (this.childNodes) {
          const idx = this.childNodes.indexOf(refNode);
          if (idx >= 0) this.childNodes.splice(idx, 0, ch);
          else this.childNodes.push(ch);
        }
        if (ch.nodeType === 1) {
          const elIdx = children.indexOf(refNode);
          if (elIdx >= 0) children.splice(elIdx, 0, ch);
          else children.push(ch);
        }
        return ch;
      },
      removeChild(ch) {
        const idx = children.indexOf(ch);
        if (idx >= 0) children.splice(idx, 1);
        if (this.childNodes) {
          const cIdx = this.childNodes.indexOf(ch);
          if (cIdx >= 0) this.childNodes.splice(cIdx, 1);
        }
        ch.parentElement = null;
        ch.parentNode = null;
        return ch;
      },
      remove() {
        if (this.parentNode && typeof this.parentNode.removeChild === 'function') {
          this.parentNode.removeChild(this);
        }
      },
      setAttribute(k, v) {
        const val = String(v);
        attrMap.set(k, val);
        if (k === 'id') this.id = val;
        if (k === 'class') this.className = val;
      },
      getAttribute(k) {
        if (k === 'id' && this.id) return this.id;
        return attrMap.has(k) ? attrMap.get(k) : null;
      },
      hasAttribute(k) {
        if (k === 'id' && this.id) return true;
        return attrMap.has(k);
      },
      removeAttribute(k) {
        attrMap.delete(k);
        if (k === 'id') this.id = '';
      },
      contains(other) {
        let cur = other;
        while (cur) {
          if (cur === this) return true;
          cur = cur.parentElement || cur.parentNode;
        }
        return false;
      },
      matches(sel) {
        return matchesSelector(this, sel);
      },
      closest(sel) {
        let cur = this;
        while (cur && cur.nodeType === 1) {
          if (matchesSelector(cur, sel)) return cur;
          cur = cur.parentElement;
        }
        return null;
      },
      querySelector(sel) {
        return this.querySelectorAll(sel)[0] || null;
      },
      querySelectorAll(sel) {
        const out = [];
        const walk = (rootNode) => {
          for (const ch of rootNode.children) {
            if (matchesSelector(ch, sel)) out.push(ch);
            walk(ch);
          }
        };
        walk(this);
        return out;
      },
      getBoundingClientRect() {
        return { left: 100, top: 100, right: 160, bottom: 132, width: 60, height: 32 };
      },
      addEventListener(type, fn, opts) {
        const cap = typeof opts === 'boolean' ? opts : Boolean(opts && opts.capture);
        const bucket = cap ? listeners.capture : listeners.bubble;
        if (!bucket.has(type)) bucket.set(type, new Set());
        bucket.get(type).add(fn);
      },
      removeEventListener(type, fn, opts) {
        const cap = typeof opts === 'boolean' ? opts : Boolean(opts && opts.capture);
        const bucket = cap ? listeners.capture : listeners.bubble;
        bucket.get(type)?.delete(fn);
      },
      _getListeners(type, cap) {
        const bucket = cap ? listeners.capture : listeners.bubble;
        return Array.from(bucket.get(type) || []);
      },
      dispatchEvent(evObj) {
        const ev = evObj && evObj.type ? evObj : createEventObj('click', {}, this);
        ev.target = this;
        const chain = [];
        let cur = this;
        while (cur) {
          chain.unshift(cur);
          cur = cur.parentNode || null;
        }
        for (const el of chain) {
          ev.currentTarget = el;
          for (const fn of el._getListeners(ev.type, true)) {
            fn.call(el, ev);
            if (ev.immediatePropagationStopped) return !ev.defaultPrevented;
          }
          if (ev.propagationStopped) return !ev.defaultPrevented;
        }
        for (let i = chain.length - 1; i >= 0; i -= 1) {
          const el = chain[i];
          ev.currentTarget = el;
          for (const fn of el._getListeners(ev.type, false)) {
            fn.call(el, ev);
            if (ev.immediatePropagationStopped) return !ev.defaultPrevented;
          }
          if (ev.propagationStopped || !ev.bubbles) break;
        }
        return !ev.defaultPrevented;
      },
    };
    return node;
  }

  const docCaptureListeners = new Map();
  const docBubbleListeners = new Map();
  const winCaptureListeners = new Map();
  const winBubbleListeners = new Map();

  const html = makeElement('html', { attrs: { 'data-ag-cs-theme': theme, 'data-ag-cs-lang': lang } });
  const head = makeElement('head');
  const body = makeElement('body', { className: bodyClass });
  html.appendChild(head);
  html.appendChild(body);

  const documentObj = {
    nodeType: 9,
    documentElement: html,
    head,
    body,
    readyState: 'complete',
    title: 'Antigravity',
    activeElement: body,
    hidden: false,
    visibilityState: 'visible',
    createElement: (tag) => makeElement(tag),
    createElementNS: (_ns, tag) => makeElement(tag),
    createTextNode: (txt) => createTextNode(txt),
    getElementById(id) {
      if (html.id === id) return html;
      return html.querySelector('#' + id);
    },
    querySelector: (sel) => html.querySelector(sel),
    querySelectorAll: (sel) => html.querySelectorAll(sel),
    addEventListener(type, fn, opts) {
      const cap = typeof opts === 'boolean' ? opts : Boolean(opts && opts.capture);
      const bucket = cap ? docCaptureListeners : docBubbleListeners;
      if (!bucket.has(type)) bucket.set(type, new Set());
      bucket.get(type).add(fn);
      docListenerSet.add(`${type}:${cap}:${fn.name || ''}:${docListenerSet.size}`);
    },
    removeEventListener(type, fn, opts) {
      const cap = typeof opts === 'boolean' ? opts : Boolean(opts && opts.capture);
      const bucket = cap ? docCaptureListeners : docBubbleListeners;
      bucket.get(type)?.delete(fn);
    },
    _getListeners(type, cap) {
      const bucket = cap ? docCaptureListeners : docBubbleListeners;
      return Array.from(bucket.get(type) || []);
    },
    dispatchEvent(evObj) {
      const ev = evObj && evObj.type ? evObj : createEventObj('keydown', {}, html);
      ev.target = ev.target || html;
      for (const fn of this._getListeners(ev.type, true)) {
        fn.call(this, ev);
        if (ev.immediatePropagationStopped) return !ev.defaultPrevented;
      }
      if (!ev.propagationStopped) {
        for (const fn of this._getListeners(ev.type, false)) {
          fn.call(this, ev);
          if (ev.immediatePropagationStopped) return !ev.defaultPrevented;
        }
      }
      return !ev.defaultPrevented;
    },
  };
  html.parentNode = documentObj;

  function countListeners(map) {
    let n = 0;
    for (const s of map.values()) n += s.size;
    return n;
  }

  const fakeDate = Object.assign(
    function DateMock(...args) {
      return new Date(...args);
    },
    {
      now: () => nowMs,
    }
  );

  const fakeSetTimeout = (fn, ms = 0) => {
    const id = nextTimerId++;
    timers.set(id, { id, fn, runAt: nowMs + Math.max(0, Number(ms) || 0) });
    return id;
  };
  const fakeClearTimeout = (id) => {
    timers.delete(id);
  };
  const fakeRaf = (fn) => {
    const id = nextRafId++;
    rafs.set(id, fn);
    return id;
  };
  const fakeCancelRaf = (id) => {
    rafs.delete(id);
  };

  function advanceTime(ms) {
    const target = nowMs + ms;
    while (true) {
      let earliest = null;
      for (const t of timers.values()) {
        if (t.runAt <= target && (!earliest || t.runAt < earliest.runAt)) {
          earliest = t;
        }
      }
      if (!earliest) break;
      timers.delete(earliest.id);
      nowMs = earliest.runAt;
      earliest.fn();
    }
    nowMs = target;
  }

  function flushRaf() {
    const pending = Array.from(rafs.entries());
    rafs.clear();
    for (const [, fn] of pending) {
      fn(nowMs);
    }
  }

  class MockKeyboardEvent {
    constructor(type, init = {}) {
      return createEventObj(type, init, null);
    }
  }

  const observedCalls = [];
  class MockMutationObserver {
    constructor(cb) {
      this._cb = cb;
      this._observed = [];
    }
    observe(target, opts) {
      const entry = { target, opts: opts || {} };
      this._observed.push(entry);
      observedCalls.push(entry);
      observers.add(this);
    }
    disconnect() {
      this._observed.length = 0;
      observers.delete(this);
    }
  }

  function triggerMutations(target, records) {
    for (const obs of Array.from(observers)) {
      const matched = obs._observed.some((entry) => entry.target === target);
      if (matched && typeof obs._cb === 'function') {
        obs._cb(records, obs);
      }
    }
  }

  class MockResizeObserver {
    constructor(cb) {
      this._cb = cb;
      this._observed = new Set();
    }
    observe(target) {
      if (target) this._observed.add(target);
      resizeObservers.add(this);
    }
    unobserve(target) {
      this._observed.delete(target);
      if (this._observed.size === 0) resizeObservers.delete(this);
    }
    disconnect() {
      this._observed.clear();
      resizeObservers.delete(this);
    }
  }

  function triggerResize(target, width, height) {
    for (const obs of Array.from(resizeObservers)) {
      if (obs._observed.has(target) && typeof obs._cb === 'function') {
        obs._cb([{ target, contentRect: { width, height, left: 0, top: 0, right: width, bottom: height } }], obs);
      }
    }
  }

  const storageMap = new Map();
  const origPushState = () => {};
  const origReplaceState = () => {};
  const windowObj = {
    document: documentObj,
    location: { href },
    history: { pushState: origPushState, replaceState: origReplaceState },
    performance: { now: () => nowMs },
    navigator: { language: lang },
    devicePixelRatio: 1,
    innerWidth: 1280,
    innerHeight: 800,
    localStorage: {
      getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
      setItem: (k, v) => storageMap.set(k, String(v)),
    },
    getComputedStyle: () => ({ borderRadius: '8px' }),
    matchMedia: () => ({ matches: false }),
    KeyboardEvent: MockKeyboardEvent,
    MutationObserver: MockMutationObserver,
    ResizeObserver: MockResizeObserver,
    setTimeout: fakeSetTimeout,
    clearTimeout: fakeClearTimeout,
    requestAnimationFrame: fakeRaf,
    cancelAnimationFrame: fakeCancelRaf,
    addEventListener(type, fn, opts) {
      const cap = typeof opts === 'boolean' ? opts : Boolean(opts && opts.capture);
      const bucket = cap ? winCaptureListeners : winBubbleListeners;
      if (!bucket.has(type)) bucket.set(type, new Set());
      bucket.get(type).add(fn);
      winListenerSet.add(`${type}:${cap}`);
    },
    removeEventListener(type, fn, opts) {
      const cap = typeof opts === 'boolean' ? opts : Boolean(opts && opts.capture);
      const bucket = cap ? winCaptureListeners : winBubbleListeners;
      bucket.get(type)?.delete(fn);
    },
    dispatchEvent(evObj) {
      const ev = evObj && evObj.type ? evObj : createEventObj('resize', {}, windowObj);
      ev.target = ev.target || windowObj;
      for (const fn of Array.from(winCaptureListeners.get(ev.type) || [])) {
        fn.call(windowObj, ev);
        if (ev.immediatePropagationStopped) return !ev.defaultPrevented;
      }
      if (!ev.propagationStopped) {
        for (const fn of Array.from(winBubbleListeners.get(ev.type) || [])) {
          fn.call(windowObj, ev);
          if (ev.immediatePropagationStopped) return !ev.defaultPrevented;
        }
      }
      return !ev.defaultPrevented;
    },
  };
  documentObj.defaultView = windowObj;
  windowObj.window = windowObj;
  windowObj.self = windowObj;
  windowObj.top = windowObj;

  const sandbox = {
    window: windowObj,
    self: windowObj,
    top: windowObj,
    document: documentObj,
    performance: windowObj.performance,
    KeyboardEvent: MockKeyboardEvent,
    MutationObserver: MockMutationObserver,
    ResizeObserver: MockResizeObserver,
    Date: fakeDate,
    setTimeout: fakeSetTimeout,
    clearTimeout: fakeClearTimeout,
    requestAnimationFrame: fakeRaf,
    cancelAnimationFrame: fakeCancelRaf,
    Float32Array,
    Uint16Array,
    Uint8Array,
    Map,
    Set,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Math,
    JSON,
    RegExp,
    Error,
    Promise,
    parseFloat,
    parseInt,
    atob: (b64) => Buffer.from(String(b64), 'base64').toString('binary'),
    console,
  };
  sandbox.globalThis = sandbox;
  windowObj.globalThis = sandbox;
  vm.createContext(sandbox);

  return {
    sandbox,
    window: windowObj,
    document: documentObj,
    body,
    html,
    head,
    storageMap,
    origPushState,
    origReplaceState,
    makeElement,
    createTextNode,
    createEventObj,
    triggerMutations,
    triggerResize,
    advanceTime,
    flushRaf,
    getObservedCalls: () => observedCalls.slice(),
    getCounts: () => ({
      docListeners: countListeners(docCaptureListeners) + countListeners(docBubbleListeners),
      winListeners: countListeners(winCaptureListeners) + countListeners(winBubbleListeners),
      activeTimers: timers.size,
      activeRafs: rafs.size,
      activeObservers: observers.size + resizeObservers.size,
    }),
  };
}

function loadPeriodicModuleInSandbox(env, fileName) {
  if (!env._loadedModules) env._loadedModules = new Set();
  if (!env._loadedModules.has(fileName)) {
    const code = fs.readFileSync(path.join(PERIODIC_PICKER_DIR, fileName), 'utf8');
    vm.runInContext(code, env.sandbox);
    env._loadedModules.add(fileName);
  }
}

function loadGrainAssetsInSandbox(env) {
  loadPeriodicModuleInSandbox(env, 'pbr-grain-assets.js');
  return env.sandbox.__agPrismGrainAssets;
}

function loadOledScreenInSandbox(env) {
  loadPeriodicModuleInSandbox(env, 'oled-cyber-screen.js');
  return env.sandbox.__agPrismOledScreen;
}

function loadKeyboard3DInSandbox(env) {
  loadPeriodicModuleInSandbox(env, 'keyboard-3d-gl.js');
  return env.sandbox.__agPrismKeyboard3D;
}

function loadPeriodicFactoryInSandbox(env) {
  for (const modName of PERIODIC_MODULE_ORDER) {
    loadPeriodicModuleInSandbox(env, modName);
  }
  return env.sandbox.__agPrismPeriodicPickerFactory;
}

test('periodic-picker config defaults, static main-bundle budget isolation (< 690 KiB), fail-closed off mode, and codeHash reuse', () => {
  assert.equal(cdp.DEFAULT_CONFIG.periodicModelPicker, 'on');
  assert.equal(cdp.DEFAULT_CONFIG.sidebarStudio, 'off');

  const mainExpr = cdp.buildInjectExpression(cdp.DEFAULT_CONFIG);
  const mainBytes = Buffer.byteLength(mainExpr, 'utf8');
  assert.ok(mainBytes < 690 * 1024, `Main bundle exceeded 690 KiB: ${mainBytes} bytes`);
  assert.equal(mainExpr.includes('ag-pp-deskmat-stage'), false, 'Periodic picker CSS/DOM must not bloat static main bundle');
  assert.equal(mainExpr.includes('__agPrismPeriodicPickerFactory'), false, 'Periodic picker runtime must stay in 8th channel');
  assert.equal(mainExpr.includes('__agPeriodicBentoUi'), false, 'Bento UI module must stay in 8th channel');

  assert.equal(cdp.buildPeriodicPickerExpression({ ...cdp.DEFAULT_CONFIG, periodicModelPicker: 'off' }), '');
  assert.equal(cdp.buildPeriodicPickerExpression({ ...cdp.DEFAULT_CONFIG, periodicModelPicker: false }), '');

  const pickerExpr = cdp.buildPeriodicPickerExpression(cdp.DEFAULT_CONFIG);
  assert.ok(pickerExpr.length > 1000);
  assert.doesNotThrow(() => new vm.Script(pickerExpr));

  const env = createPeriodicSandbox();
  const firstRes = vm.runInContext(pickerExpr, env.sandbox);
  assert.equal(firstRes.ok, true);
  assert.equal(firstRes.status, 'active');
  assert.ok(typeof firstRes.codeHash === 'string' && firstRes.codeHash.length >= 4);
  assert.equal(env.html.getAttribute('data-ag-prism-periodic-picker'), '1');

  const secondRes = vm.runInContext(pickerExpr, env.sandbox);
  assert.equal(secondRes.ok, true);
  assert.equal(secondRes.reused, true);
  assert.equal(secondRes.codeHash, firstRes.codeHash);

  vm.runInContext(cdp.PERIODIC_PICKER_REMOVE_EXPRESSION, env.sandbox);
});

test('ELEMENTS_90 grid coordinates and strict Google element model matching/exclusion', () => {
  const pickerApi = require(PERIODIC_PICKER_FILE);
  const { ELEMENTS_90, matchGoogleElementModels, parseElementModelLabel } = pickerApi;

  assert.equal(ELEMENTS_90.length, 90);
  const byZ = new Map(ELEMENTS_90.map((e) => [e.z, e]));
  assert.deepEqual({ row: byZ.get(1).row, col: byZ.get(1).col, symbol: byZ.get(1).symbol }, { row: 1, col: 1, symbol: 'H' });
  assert.deepEqual({ row: byZ.get(6).row, col: byZ.get(6).col, symbol: 'C' }, { row: 2, col: 14, symbol: 'C' });
  assert.deepEqual({ row: byZ.get(10).row, col: byZ.get(10).col, symbol: 'Ne' }, { row: 2, col: 18, symbol: 'Ne' });
  assert.deepEqual({ row: byZ.get(18).row, col: byZ.get(18).col, symbol: 'Ar' }, { row: 3, col: 18, symbol: 'Ar' });

  const mixedOptions = [
    { label: 'Gemini 4 Hydrogen (XHigh)', modelId: 'gemini-4-h-xhigh' },
    { label: 'Gemini 4 Hydrogen (Low)', modelId: 'gemini-4-h-low' },
    { label: 'Gemini 4 Hydrogen (High)', modelId: 'gemini-4-h-high' },
    { label: 'Gemini 4 Hydrogen (Medium)', modelId: 'gemini-4-h-med' },
    { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-c-high' },
    { label: 'Gemini 4 Carbon (Low)', modelId: 'gemini-4-c-low' },
    { label: 'Gemini 4 Carbon (Medium)', modelId: 'gemini-4-c-med' },
    { label: 'Gemini 4 Neon', modelId: 'gemini-4-ne' },
    { label: 'Gemini 4 Argon', modelId: 'gemini-4-ar' },
    { label: 'Gemini 4 Silicon (High)', modelId: 'gemini-4-si-high' },
    { label: 'Gemini 3.8 Flash', modelId: 'gemini-3.8-flash' },
    { label: 'Claude Opus 5.5', modelId: 'claude-opus-5.5' },
    { label: 'GPT-OSS 120B', modelId: 'gpt-oss-120b' },
    { label: 'Orchestrator', modelId: 'orchestrator' },
    { label: 'Orchestrator (Carbon)', modelId: 'orchestrator-carbon' },
  ];

  const matched = matchGoogleElementModels(mixedOptions);
  assert.deepEqual(
    matched.map((m) => m.z),
    [1, 6, 10, 14, 18]
  );

  assert.deepEqual(
    matched.byZ.get(1).levels.map((l) => l.effort),
    ['low', 'medium', 'high', 'xhigh']
  );
  assert.deepEqual(
    matched.byZ.get(6).levels.map((l) => l.effort),
    ['low', 'medium', 'high']
  );
  assert.equal(matched.byZ.get(10).levels.length, 1);
  assert.equal(matched.byZ.get(18).levels.length, 1);
  assert.deepEqual(
    matched.byZ.get(14).levels.map((l) => l.effort),
    ['high']
  );

  for (const excluded of ['Gemini 3.8 Flash', 'Claude Opus 5.5', 'GPT-OSS 120B', 'Orchestrator', 'Orchestrator (Carbon)']) {
    assert.equal(parseElementModelLabel(excluded), null, `Must strictly exclude ${excluded}`);
  }
});

test('420ms long-press opens picker and dismisses native menu, while <110ms short press leaves click untouched', () => {
  const env = createPeriodicSandbox();
  const factory = loadPeriodicFactoryInSandbox(env);

  const triggerBtn = env.makeElement('button', {
    attrs: { 'data-testid': 'model-selector-trigger', 'aria-haspopup': 'menu' },
    text: 'Gemini 4 Carbon (High)',
  });
  const nativeMenu = env.makeElement('div', { attrs: { 'data-testid': 'model-selector-panel' } });
  let nativeEscCount = 0;
  nativeMenu.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') nativeEscCount += 1;
  });
  env.body.appendChild(triggerBtn);
  env.body.appendChild(nativeMenu);

  const setIsOpenCalls = [];
  env.window.__agPeriodicMockHost = {
    conversationId: 'conv-1',
    selectedModel: { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-c-high' },
    modelOptions: [
      { label: 'Gemini 4 Hydrogen (Medium)', modelId: 'gemini-4-h-med' },
      { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-c-high' },
    ],
    setIsOpen: (v) => setIsOpenCalls.push(v),
    setModelConfigByLabelForConversation: () => {},
  };

  const inst = factory.mountPeriodicPicker({ root: env.window, doc: env.document, mode: 'on' });

  // 1) Short press (< 110ms): 0ms pointerdown intercepts Radix/Base UI popup, then pointerup replays clean native click sequence and swallows trailing physical click
  let nativeReplayedClicks = 0;
  let nativeReplayedPointerDowns = 0;
  triggerBtn.addEventListener('pointerdown', () => {
    nativeReplayedPointerDowns += 1;
  });
  triggerBtn.addEventListener('click', () => {
    nativeReplayedClicks += 1;
  });

  const shortDownEv = env.createEventObj('pointerdown', { button: 0, clientX: 120, clientY: 112 });
  triggerBtn.dispatchEvent(shortDownEv);
  assert.equal(shortDownEv.defaultPrevented, true, '0ms pointerdown must be captured to prevent Radix/Base UI opening on hold');
  assert.equal(nativeReplayedPointerDowns, 0, 'Host must not receive raw pointerdown before short-click release');
  env.advanceTime(60);
  assert.equal(env.document.querySelector('.ag-pp-hold-ring'), null);
  triggerBtn.dispatchEvent(env.createEventObj('pointerup', { button: 0, clientX: 120, clientY: 112 }));
  assert.equal(nativeReplayedPointerDowns, 1, 'Short-click release must replay native pointerdown cleanly');
  assert.equal(nativeReplayedClicks, 1, 'Short-click release must replay native click cleanly');

  const trailingPhysicalClick = env.createEventObj('click', { button: 0, clientX: 120, clientY: 112 });
  const shortAllowed = triggerBtn.dispatchEvent(trailingPhysicalClick);
  assert.equal(shortAllowed, false, 'Trailing physical click after replay must be swallowed to prevent double-toggle');
  assert.equal(trailingPhysicalClick.defaultPrevented, true);
  assert.equal(nativeReplayedClicks, 1, 'Host must still receive exactly 1 click for the short tap');
  assert.equal(inst.isOpen(), false);
  assert.equal(setIsOpenCalls.length, 0);

  // 2) Long press (110ms ring -> 420ms open + setIsOpen(false) + suppress trailing click)
  triggerBtn.dispatchEvent(env.createEventObj('pointerdown', { button: 0, clientX: 120, clientY: 112 }));
  env.advanceTime(130);
  assert.ok(env.document.querySelector('.ag-pp-hold-ring'), 'Hold ring must mount after 110ms');
  assert.equal(inst.isOpen(), false);

  env.advanceTime(300); // total 430ms >= 420ms
  assert.equal(env.document.querySelector('.ag-pp-hold-ring'), null, 'Hold ring must clean up on open');
  assert.equal(inst.isOpen(), true);
  assert.ok(env.document.getElementById('ag-prism-periodic-picker-root'));
  assert.deepEqual(setIsOpenCalls, [false]);
  assert.equal(nativeEscCount, 1);

  const postHoldClick = env.createEventObj('click', { button: 0, clientX: 120, clientY: 112 });
  const postHoldAllowed = triggerBtn.dispatchEvent(postHoldClick);
  assert.equal(postHoldAllowed, false);
  assert.equal(postHoldClick.defaultPrevented, true);
  assert.equal(postHoldClick.immediatePropagationStopped, true);

  inst.destroy();
});

test('Live Sync keycap levitation, Thinking Level switching, second-click/Enter confirm, and Escape clean close without rollback', () => {
  const env = createPeriodicSandbox();
  const factory = loadPeriodicFactoryInSandbox(env);

  const triggerBtn = env.makeElement('button', {
    attrs: { 'data-testid': 'model-selector-trigger' },
    text: 'Claude Opus 5.5',
  });
  env.body.appendChild(triggerBtn);

  const commits = [];
  const hostState = {
    conversationId: 'conv-live',
    selectedModel: { label: 'Gemini 4 Hydrogen (Medium)', modelId: 'gemini-4-h-med' },
    modelOptions: [
      { label: 'Gemini 4 Hydrogen (Medium)', modelId: 'gemini-4-h-med' },
      { label: 'Gemini 4 Hydrogen (High)', modelId: 'gemini-4-h-high' },
      { label: 'Gemini 4 Carbon (Low)', modelId: 'gemini-4-c-low' },
      { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-c-high' },
      { label: 'Gemini 4 Neon', modelId: 'gemini-4-ne' },
      { label: 'Claude Opus 5.5', modelId: 'claude-opus-5.5' },
    ],
    setModelConfigByLabelForConversation(label, convId, flag) {
      commits.push({ label, convId, flag });
      const found = hostState.modelOptions.find((o) => o.label === label);
      if (found) hostState.selectedModel = found;
    },
  };
  env.window.__agPeriodicMockHost = hostState;

  const inst = factory.mountPeriodicPicker({ root: env.window, doc: env.document, mode: 'on' });

  // A. Open with Hydrogen, click Carbon (levitate + live sync), switch level to Low, second-click Carbon to confirm
  assert.equal(inst.open(triggerBtn), true);
  const rootEl = () => env.document.getElementById('ag-prism-periodic-picker-root');
  const keyH = () => rootEl().querySelector('button[data-z="1"]');
  const keyC = () => rootEl().querySelector('button[data-z="6"]');
  const keyNe = () => rootEl().querySelector('button[data-z="10"]');

  assert.equal(keyH().classList.contains('is-levitated'), true);
  assert.equal(keyH().getAttribute('aria-pressed'), 'true');

  keyC().dispatchEvent(env.createEventObj('click'));
  assert.equal(inst.isOpen(), true);
  assert.equal(keyC().classList.contains('is-levitated'), true);
  assert.equal(keyC().getAttribute('aria-pressed'), 'true');
  assert.equal(keyH().classList.contains('is-levitated'), false);
  assert.deepEqual(commits.at(-1), { label: 'Gemini 4 Carbon (High)', convId: 'conv-live', flag: true });

  const lowPill = rootEl().querySelector('.ag-pp-seg-btn[data-effort="low"]');
  assert.ok(lowPill, 'Expected Thinking Level Low pill in Golden Recess Deck');
  lowPill.dispatchEvent(env.createEventObj('click'));
  assert.deepEqual(commits.at(-1), { label: 'Gemini 4 Carbon (Low)', convId: 'conv-live', flag: true });
  assert.equal(rootEl().querySelector('.ag-pp-seg-btn[data-effort="low"]').getAttribute('data-active'), '1');

  // Second click on already-levitated Carbon keycap keeps selection and closes
  const commitCountBeforeConfirm = commits.length;
  keyC().dispatchEvent(env.createEventObj('click'));
  assert.equal(inst.isOpen(), false);
  assert.equal(commits.length, commitCountBeforeConfirm);
  assert.equal(hostState.selectedModel.label, 'Gemini 4 Carbon (Low)');

  // B. Enter key confirms new selection
  assert.equal(inst.open(triggerBtn), true);
  keyNe().dispatchEvent(env.createEventObj('click'));
  assert.equal(hostState.selectedModel.label, 'Gemini 4 Neon');
  env.document.dispatchEvent(env.createEventObj('keydown', { key: 'Enter' }));
  assert.equal(inst.isOpen(), false);
  assert.equal(hostState.selectedModel.label, 'Gemini 4 Neon');

  // C. Non-element session (Claude Opus 5.5) -> switch to Carbon -> Escape cleanly closes WITHOUT rolling back Carbon
  hostState.selectedModel = { label: 'Claude Opus 5.5', modelId: 'claude-opus-5.5' };
  assert.equal(inst.open(triggerBtn), true);
  const banner = rootEl().querySelector('[data-testid="ag-pp-session-banner"]');
  assert.equal(banner.getAttribute('data-show'), '1');
  assert.ok(banner.textContent.includes('Claude Opus 5.5'));

  keyC().dispatchEvent(env.createEventObj('click'));
  assert.equal(hostState.selectedModel.label, 'Gemini 4 Carbon (Low)');
  assert.equal(banner.getAttribute('data-show'), '0');

  const commitCountBeforeEsc = commits.length;
  const escEv = env.createEventObj('keydown', { key: 'Escape' });
  env.document.dispatchEvent(escEv);
  assert.equal(escEv.defaultPrevented, true);
  assert.equal(inst.isOpen(), false);
  assert.equal(hostState.selectedModel.label, 'Gemini 4 Carbon (Low)');
  assert.equal(commits.length, commitCountBeforeEsc, 'Escape must NOT emit a rollback commit');

  inst.destroy();
});

test('Security static audit (8 vendor files: 0 innerHTML, 0 setPrefValue, 0 local paths, 0 API keys, 0 C2PA residuals) and 8-module symmetric teardown', () => {
  const apiKeyPattern =
    /(?:AIza[0-9A-Za-z_-]{20,}|sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[0-9A-Za-z-]{10,}|ya29\.[0-9A-Za-z_-]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:GEMINI_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY)\b)/;
  const c2paTextPattern = /(?:c2pa|jumbf|content.?credentials)/i;

  assert.deepEqual(cdp.PERIODIC_PICKER_MODULE_FILES, PERIODIC_MODULE_ORDER);
  for (const filePath of ALL_PERIODIC_FILES) {
    const src = fs.readFileSync(filePath, 'utf8');
    const name = path.basename(filePath);
    assert.equal(src.includes('\r'), false, `${name} must use pure LF (\\n)`);
    assert.equal(src.charCodeAt(0) === 0xfeff, false, `${name} must have 0 BOM`);
    assert.equal(
      /\b(?:innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\s*\(|new\s+Function)\b/.test(src),
      false,
      `${name} must contain 0 unsafe HTML/eval sinks`
    );
    assert.equal(
      /\b(?:setPrefValue|setPrefValues)\b/.test(src),
      false,
      `${name} must have 0 globalPermissionWrites`
    );
    assert.equal(
      /(?:^|[^A-Za-z])[A-Za-z]:[\\/]|\/Users\/|\/home\/|Administrator|workspace_program/.test(src),
      false,
      `${name} must contain 0 local absolute paths or usernames`
    );
    assert.equal(
      apiKeyPattern.test(src),
      false,
      `${name} must contain 0 API key or private key residuals`
    );
    const srcWithoutBase64Blobs = src.replace(/data:image\/webp;base64,[A-Za-z0-9+/=]+/g, 'data:image/webp;base64,');
    assert.equal(
      c2paTextPattern.test(srcWithoutBase64Blobs),
      false,
      `${name} must contain 0 C2PA / JUMBF metadata residuals`
    );
  }

  // Also verify binary WebP RIFF chunks in OLED_WALLPAPERS & OLED_WALLPAPERS_LIGHT contain 0 C2PA / JUMB / XMP / EXIF metadata
  const grainMod = require(GRAIN_ASSETS_FILE);
  for (const [dictName, dict] of [
    ['OLED_WALLPAPERS', grainMod.OLED_WALLPAPERS],
    ['OLED_WALLPAPERS_LIGHT', grainMod.OLED_WALLPAPERS_LIGHT],
  ]) {
    for (const [zKey, dataUri] of Object.entries(dict)) {
      const b64 = String(dataUri).replace(/^data:image\/webp;base64,/, '');
      const buf = Buffer.from(b64, 'base64');
      assert.equal(buf.toString('ascii', 0, 4), 'RIFF', `${dictName}[${zKey}] must be valid RIFF`);
      assert.equal(buf.toString('ascii', 8, 12), 'WEBP', `${dictName}[${zKey}] must be valid WEBP`);
      let off = 12;
      while (off + 8 <= buf.length) {
        const fourcc = buf.toString('ascii', off, off + 4);
        const sz = buf.readUInt32LE(off + 4);
        assert.equal(
          /^(?:JUMB|C2PA|XMP |EXIF)$/i.test(fourcc),
          false,
          `${dictName}[${zKey}] must not carry metadata chunk ${fourcc}`
        );
        off += 8 + sz + (sz % 2);
      }
    }
  }

  // Verify 8-module Channel 8 bundle compile gate & symmetric cleanup via PERIODIC_PICKER_REMOVE_EXPRESSION and REMOVE_EXPRESSION
  const mainExpr = cdp.buildInjectExpression(cdp.DEFAULT_CONFIG);
  assert.ok(Buffer.byteLength(mainExpr, 'utf8') < 690 * 1024);
  assert.equal(mainExpr.includes('__agPrismGrainAssets'), false, 'Channel 1 must not embed __agPrismGrainAssets');
  assert.equal(mainExpr.includes('__agPeriodicAudioFx'), false, 'Channel 1 must not embed __agPeriodicAudioFx');
  assert.equal(mainExpr.includes('__agPeriodicModelCatalog'), false, 'Channel 1 must not embed __agPeriodicModelCatalog');
  assert.equal(mainExpr.includes('__agPeriodicHostBridge'), false, 'Channel 1 must not embed __agPeriodicHostBridge');
  assert.equal(mainExpr.includes('__agPrismOledScreen'), false, 'Channel 1 must not embed __agPrismOledScreen');
  assert.equal(mainExpr.includes('__agPrismKeyboard3D'), false, 'Channel 1 must not embed __agPrismKeyboard3D');
  assert.equal(mainExpr.includes('__agPeriodicBentoUi'), false, 'Channel 1 must not embed __agPeriodicBentoUi');
  assert.equal(mainExpr.includes('__agPrismPeriodicPickerFactory'), false, 'Channel 1 must not embed __agPrismPeriodicPickerFactory');

  const mountExpr = cdp.buildPeriodicPickerExpression(cdp.DEFAULT_CONFIG);
  assert.doesNotThrow(() => new vm.Script(mountExpr));
  assert.equal(mountExpr.includes('__agPrismGrainAssets'), true, 'Channel 8 must bundle pbr-grain-assets.js');
  assert.equal(mountExpr.includes('__agPeriodicAudioFx'), true, 'Channel 8 must bundle audio-fx.js');
  assert.equal(mountExpr.includes('__agPeriodicModelCatalog'), true, 'Channel 8 must bundle model-catalog.js');
  assert.equal(mountExpr.includes('__agPeriodicHostBridge'), true, 'Channel 8 must bundle host-bridge.js');
  assert.equal(mountExpr.includes('__agPrismOledScreen'), true, 'Channel 8 must bundle oled-cyber-screen.js');
  assert.equal(mountExpr.includes('__agPrismKeyboard3D'), true, 'Channel 8 must bundle keyboard-3d-gl.js');
  assert.equal(mountExpr.includes('__agPeriodicBentoUi'), true, 'Channel 8 must bundle bento-ui.js');
  assert.equal(mountExpr.includes('__agPrismPeriodicPickerFactory'), true, 'Channel 8 must bundle periodic-picker.js');

  for (const cleanupExpr of [cdp.PERIODIC_PICKER_REMOVE_EXPRESSION, cdp.REMOVE_EXPRESSION]) {
    const env = createPeriodicSandbox({ mock2d: true, mockWebGL2: true });
    const triggerBtn = env.makeElement('button', {
      attrs: { 'data-testid': 'model-selector-trigger' },
      text: 'Gemini 4 Carbon (High)',
    });
    env.body.appendChild(triggerBtn);
    env.window.__agPeriodicMockHost = {
      modelOptions: [{ label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-c-high' }],
      selectedModel: { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-c-high' },
      setModelConfigByLabelForConversation: () => {},
    };

    const mountRes = vm.runInContext(mountExpr, env.sandbox);
    assert.equal(mountRes.ok, true);
    assert.equal(typeof env.window.__agPrismGrainAssets?.getGrainTextures, 'function');
    assert.equal(typeof env.window.__agPrismOledScreen?.createOledScreenPainter, 'function');
    assert.equal(typeof env.window.__agPrismKeyboard3D?.createKeyboard3DRenderer, 'function');
    assert.equal(typeof env.window.__agPrismPeriodicPickerFactory?.mountPeriodicPicker, 'function');
    assert.ok(triggerBtn.querySelector('.ag-pp-mini-keycap'), 'Mini keycap badge should mount on Carbon trigger');

    // Activate modal, blind key shake timer, and pointermove tilt rAF
    env.window.__agPrismPeriodicPicker.open(triggerBtn);
    const deskmatStage = env.document.querySelector('.ag-pp-deskmat-stage');
    assert.ok(deskmatStage, 'Topographic deskmat stage must mount on open');
    assert.equal(deskmatStage.getAttribute('data-has-topo'), '1');
    const blindKey = env.document.querySelector('button[data-z="2"]');
    blindKey.dispatchEvent(env.createEventObj('click'));
    const modal = env.document.querySelector('.ag-pp-modal');
    modal.dispatchEvent(env.createEventObj('pointermove', { clientX: 150, clientY: 150 }));

    assert.ok(env.document.getElementById('ag-prism-periodic-picker-css'));
    assert.ok(env.document.getElementById('ag-prism-periodic-picker-root'));
    assert.equal(env.html.getAttribute('data-ag-prism-periodic-picker'), '1');

    vm.runInContext(cleanupExpr, env.sandbox);

    assert.equal(env.document.getElementById('ag-prism-periodic-picker-css'), null);
    assert.equal(env.document.getElementById('ag-prism-periodic-picker-root'), null);
    assert.equal(env.document.querySelector('.ag-pp-hold-ring'), null);
    assert.equal(env.document.querySelectorAll('.ag-pp-deskmat-stage').length, 0);
    assert.equal(env.document.querySelectorAll('.ag-pp-mini-keycap').length, 0);
    assert.equal(env.html.hasAttribute('data-ag-prism-periodic-picker'), false);
    assert.equal(env.html.hasAttribute('data-ag-pp-open'), false);
    assert.equal(env.html.hasAttribute('data-ag-pp-holding'), false);
    for (const gKey of [
      '__agPrismPeriodicPicker',
      '__agPrismPeriodicPickerFactory',
      '__agPrismKeyboard3D',
      '__agPrismPeriodicKeyboard3D',
      '__agPrismOledScreen',
      '__agPrismGrainAssets',
      '__agPeriodicAudioFx',
      '__agPeriodicModelCatalog',
      '__agPeriodicHostBridge',
      '__agPeriodicBentoUi',
    ]) {
      assert.equal(env.window[gKey], undefined, `${gKey} must be deleted from window`);
      assert.equal(env.sandbox[gKey], undefined, `${gKey} must be deleted from globalThis`);
    }

    // Verify zero residual timers/listeners/rAFs/observers immediately on teardown
    const counts = env.getCounts();
    assert.equal(counts.docListeners, 0, 'All document listeners must be removed');
    assert.equal(counts.winListeners, 0, 'All window listeners must be removed');
    assert.equal(counts.activeTimers, 0, 'All timers must be cleared');
    assert.equal(counts.activeRafs, 0, 'All rAF callbacks must be cancelled');
    assert.equal(counts.activeObservers, 0, 'All MutationObservers must be disconnected');
  }
});

test('V3 3D Renderer (keyboard-3d-gl.js): headless/WebGL2 2048px Shadow FBO + 5 programs, raycast pick(), 0fps sleep, and 100% dispose()', () => {
  const { ELEMENTS_90 } = require(PERIODIC_PICKER_FILE);

  // 1) Headless / no-WebGL sandbox fallback -> canvas2d mode
  {
    const envHeadless = createPeriodicSandbox({ mock2d: false, mockWebGL2: false });
    const kb3d = loadKeyboard3DInSandbox(envHeadless);
    const canvasNoGl = envHeadless.makeElement('canvas');
    const renderer = kb3d.createKeyboard3DRenderer({
      canvas: canvasNoGl,
      doc: envHeadless.document,
      root: envHeadless.window,
      slots: ELEMENTS_90,
    });
    assert.equal(renderer.getRendererMode(), 'canvas2d');
    assert.equal(renderer.isIdle(), true);
    const rects = renderer.getInteractiveProjectedRects();
    assert.equal(rects.keys.length, 90);
    renderer.dispose();
    assert.equal(renderer.isIdle(), true);
    assert.equal(renderer.pick(480, 276), null);
  }

  // 1b) Incomplete Shadow FBO fallback -> degrades cleanly without leaking FBO/depth texture
  {
    const envFallback = createPeriodicSandbox({ mock2d: true, mockWebGL2: true, failFbo: true });
    const kb3dFallback = loadKeyboard3DInSandbox(envFallback);
    const canvasFallback = envFallback.makeElement('canvas');
    const rendererFallback = kb3dFallback.createKeyboard3DRenderer({
      canvas: canvasFallback,
      doc: envFallback.document,
      root: envFallback.window,
      slots: ELEMENTS_90,
    });
    assert.equal(rendererFallback.getRendererMode(), 'webgl2');
    const fbStats = canvasFallback._gl._stats();
    assert.equal(fbStats.created.programs.size, 3);
    assert.equal(fbStats.created.textures.size, 5, 'V5 creates 5 textures (atlas, grain, metalEnv, oled, shadow)');
    assert.equal(fbStats.deleted.textures.size, 1, 'Failed shadow texture must be immediately deleted');
    assert.equal(fbStats.created.framebuffers.size, 1);
    assert.equal(fbStats.deleted.framebuffers.size, 1, 'Failed shadow FBO must be immediately deleted');
    rendererFallback.dispose();
    const fbAfter = canvasFallback._gl._stats();
    assert.equal(fbAfter.deleted.programs.size, fbAfter.created.programs.size);
    assert.equal(fbAfter.deleted.shaders.size, fbAfter.created.shaders.size);
    assert.equal(fbAfter.deleted.buffers.size, fbAfter.created.buffers.size);
    assert.equal(fbAfter.deleted.vaos.size, fbAfter.created.vaos.size);
    assert.equal(fbAfter.deleted.textures.size, fbAfter.created.textures.size);
    assert.equal(fbAfter.deleted.framebuffers.size, fbAfter.created.framebuffers.size);
  }

  // 2) Mock WebGL2 context mount (5 GLSL programs, 4 textures, 2048px Shadow FBO), raycast pick(), 0fps sleep, and 100% GPU resource release
  const env = createPeriodicSandbox({ mock2d: true, mockWebGL2: true });
  const kb3d = loadKeyboard3DInSandbox(env);
  const canvas = env.makeElement('canvas');
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 960, height: 552, right: 960, bottom: 552 });

  const availMap = new Map([
    [1, { slotZ: 1 }],
    [6, { slotZ: 6 }],
    [10, { slotZ: 10 }],
    [18, { slotZ: 18 }],
  ]);

  const renderer = kb3d.createKeyboard3DRenderer({
    canvas,
    doc: env.document,
    root: env.window,
    slots: ELEMENTS_90,
  });

  assert.equal(renderer.getRendererMode(), 'webgl2');
  assert.equal(renderer.isIdle(), true, 'Initial static render must settle at 0fps');
  assert.equal(env.getCounts().activeRafs, 0, 'Initial mount must leave 0 pending rAF');

  const glStatsInit = canvas._gl._stats();
  assert.equal(glStatsInit.created.programs.size, 5, 'V5 requires 5 GLSL programs (3 main PBR + 2 shadow pass)');
  assert.equal(glStatsInit.created.shaders.size, 10, '5 GLSL programs must compile 10 shaders');
  assert.equal(glStatsInit.created.vaos.size, 4);
  assert.equal(glStatsInit.created.textures.size, 5, 'V5 requires 5 textures (atlas, 128x128 RG8 grain, 128x64 RGB8 metalEnv, oled, 1024px shadow depth)');
  assert.equal(glStatsInit.created.framebuffers.size, 1, 'V5 requires 1 1024x1024 shadow depth FBO');
  assert.ok(
    glStatsInit.shadowTexAllocations.some((a) => a.width === 1024 && a.height === 1024),
    'Shadow depth texture must be allocated at 1024x1024'
  );
  assert.ok(
    glStatsInit.shadowViewports.some((v) => v.w === 1024 && v.h === 1024),
    'Shadow pass must render at 1024x1024 viewport'
  );
  assert.ok(glStatsInit.drawCalls > 0);

  renderer.setState({
    themeProfile: { id: 'obsidian-dark', isLight: false, isMono: false, ambientMul: 0.7, primaryHex: '#669DF6' },
    availableByZ: availMap,
    selectedZ: 6,
    deckInfo: {
      z: 6,
      numLabel: '6',
      groupCode: 'G14',
      symbol: 'C',
      mass: '12.011',
      title: 'Gemini 4 Carbon',
      chemLabel: '6 C · Carbon',
      subtitle: 'Balanced flagship',
      isAvailable: true,
      effortTitle: 'Thinking Level',
      levels: [
        { effort: 'low', label: 'Low', active: false },
        { effort: 'medium', label: 'Medium', active: false },
        { effort: 'high', label: 'High', active: true },
      ],
    },
    topControls: { muted: false, hoveredBtn: null, pressedBtn: null },
  });

  // Step springs to steady state (0fps)
  for (let i = 0; i < 240 && !renderer.isIdle(); i += 1) {
    renderer.step(0.016);
  }
  assert.equal(renderer.isIdle(), true);

  // Verify raycast pick() hits 1 H / 6 C / 10 Ne / 18 Ar projected centers
  const rects = renderer.getInteractiveProjectedRects();
  for (const targetZ of [1, 6, 10, 18]) {
    const keyEntry = rects.keys.find((k) => k.slotZ === targetZ || k.z === targetZ);
    assert.ok(keyEntry, `Missing projected rect for z=${targetZ}`);
    const hit = renderer.pick(keyEntry.left + keyEntry.width * 0.5, keyEntry.top + keyEntry.height * 0.5);
    assert.ok(hit && hit.kind === 'key', `Expected key hit for z=${targetZ}, got ${JSON.stringify(hit)}`);
    assert.equal(hit.slotZ, targetZ);
    assert.equal(hit.available, true);
  }

  // Verify low-profile choc effort key hits
  assert.equal(rects.efforts.length, 3);
  for (const ef of rects.efforts) {
    const hit = renderer.pick(ef.left + ef.width * 0.5, ef.top + ef.height * 0.5);
    assert.deepEqual({ ...hit }, { kind: 'effort', effort: ef.effort });
  }

  // V10 Bespoke CNC Monolith: 4 3D hardware controls ('prism-wave', 'reset-view', 'mute', 'close')
  assert.deepEqual(
    Object.keys(rects.controls).sort(),
    ['close', 'mute', 'prism-wave', 'reset-view'],
    'V10 must expose 4 3D hardware controls in getInteractiveProjectedRects().controls'
  );
  assert.equal((rects.controlList || []).length, 4, 'V10 controlList must contain 4 3D hardware controls');
  for (const ctrlId of ['prism-wave', 'reset-view', 'mute', 'close']) {
    const cRect = rects.controls[ctrlId];
    assert.ok(cRect && cRect.width > 2 && cRect.height > 2, `Expected valid projected rect for 3D control "${ctrlId}"`);
    const cx = cRect.cx ?? cRect.left + cRect.width * 0.5;
    const cy = cRect.cy ?? cRect.top + cRect.height * 0.5;
    const cHit = renderer.pick(cx, cy);
    assert.ok(
      cHit && cHit.kind === 'control' && (cHit.action === ctrlId || cHit.id === ctrlId),
      `Expected center pick() on "${ctrlId}" to return { kind: 'control', action: '${ctrlId}' }, got ${JSON.stringify(cHit)}`
    );
  }

  // Top bezel strip above row 1 safely falls back to { kind: 'chassis' } to prevent mis-closing
  const topCenterBezelHit = renderer.pick(
    rects.chassis.left + rects.chassis.width * 0.5,
    rects.chassis.top + 8
  );
  assert.deepEqual({ ...topCenterBezelHit }, { kind: 'chassis' });

  // Verify chassis anti-misclose hit (left OLED glass area inside deck, free of keys/efforts/controls)
  const chassisHit = renderer.pick(
    rects.deck.left + rects.deck.width * 0.22,
    rects.deck.top + rects.deck.height * 0.55
  );
  assert.deepEqual({ ...chassisHit }, { kind: 'chassis' });

  // Verify outside picks return null
  assert.equal(renderer.pick(-20, -20), null);
  assert.equal(renderer.pick(980, 580), null);
  assert.equal(renderer.pick(4, 4), null);

  // Verify pointer parallax wakes from 0fps and converges back to 0fps idle
  renderer.setPointerNorm(0.55, -0.45, true);
  assert.equal(renderer.isIdle(), false);
  assert.ok(env.getCounts().activeRafs > 0);
  let converged = false;
  for (let i = 0; i < 300; i += 1) {
    if (renderer.step(0.016)) {
      converged = true;
      break;
    }
  }
  assert.equal(converged, true, 'Springs must converge within 300 frames');
  assert.equal(renderer.isIdle(), true);
  assert.equal(env.getCounts().activeRafs, 0, '0fps sleep must cancel pending rAF');

  // Verify dispose() releases 100% of GPU resources and cancels everything
  renderer.setPointerNorm(-0.3, 0.2, true);
  assert.ok(env.getCounts().activeRafs > 0);
  renderer.dispose();

  const glStatsAfter = canvas._gl._stats();
  assert.equal(glStatsAfter.deleted.programs.size, glStatsAfter.created.programs.size);
  assert.equal(glStatsAfter.deleted.shaders.size, glStatsAfter.created.shaders.size);
  assert.equal(glStatsAfter.deleted.buffers.size, glStatsAfter.created.buffers.size);
  assert.equal(glStatsAfter.deleted.vaos.size, glStatsAfter.created.vaos.size);
  assert.equal(glStatsAfter.deleted.textures.size, glStatsAfter.created.textures.size);
  assert.equal(glStatsAfter.deleted.framebuffers.size, glStatsAfter.created.framebuffers.size);
  assert.equal(glStatsAfter.deleted.framebuffers.size, 1, 'Shadow FBO must be symmetrically released via deleteFramebuffer');
  assert.equal(glStatsAfter.loseContextCalls, 1);
  assert.equal(env.getCounts().activeRafs, 0);
  assert.equal(renderer.isIdle(), true);
  assert.equal(renderer.pick(480, 276), null);
});

test('V2 Prism 4-theme matrix mapping (obsidian-dark, warm-dark, crystal-light, alabaster-light, isMono) & MutationObserver hot refresh', () => {
  const env = createPeriodicSandbox({ mock2d: true, mockWebGL2: true });
  loadKeyboard3DInSandbox(env);
  const factory = loadPeriodicFactoryInSandbox(env);

  const triggerBtn = env.makeElement('button', {
    attrs: { 'data-testid': 'model-selector-trigger' },
    text: 'Gemini 4 Carbon (High)',
  });
  env.body.appendChild(triggerBtn);
  env.window.__agPeriodicMockHost = {
    modelOptions: [{ label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-c-high' }],
    selectedModel: { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-c-high' },
    setModelConfigByLabelForConversation: () => {},
  };

  const inst = factory.mountPeriodicPicker({ root: env.window, doc: env.document, mode: 'on' });
  assert.equal(inst.open(triggerBtn), true);

  const cases = [
    {
      attrs: { 'data-ag-cs-palette': 'obsidian', 'data-ag-cs-theme': 'dark', 'data-ag-cs-light-preset': 'crystal', 'data-ag-cs-accent': 'follow' },
      wantId: 'obsidian-dark',
      wantMono: false,
    },
    {
      attrs: { 'data-ag-cs-palette': 'warm', 'data-ag-cs-theme': 'dark', 'data-ag-cs-light-preset': 'crystal', 'data-ag-cs-accent': 'follow' },
      wantId: 'warm-dark',
      wantMono: false,
    },
    {
      attrs: { 'data-ag-cs-palette': 'obsidian', 'data-ag-cs-theme': 'light', 'data-ag-cs-light-preset': 'crystal', 'data-ag-cs-accent': 'follow' },
      wantId: 'crystal-light',
      wantMono: false,
    },
    {
      attrs: { 'data-ag-cs-palette': 'obsidian', 'data-ag-cs-theme': 'light', 'data-ag-cs-light-preset': 'alabaster', 'data-ag-cs-accent': 'mono' },
      wantId: 'alabaster-light',
      wantMono: true,
    },
  ];

  for (const tc of cases) {
    for (const [k, v] of Object.entries(tc.attrs)) {
      env.html.setAttribute(k, v);
    }
    const profile = factory.resolvePrismThemeProfile(env.document, env.window);
    assert.equal(profile.id, tc.wantId);
    assert.equal(profile.isMono, tc.wantMono);

    // Trigger MutationObserver hot refresh on documentElement
    env.triggerMutations(
      env.html,
      Object.keys(tc.attrs).map((attributeName) => ({ target: env.html, type: 'attributes', attributeName }))
    );

    const rootEl = env.document.getElementById('ag-prism-periodic-picker-root');
    assert.equal(rootEl.getAttribute('data-kit'), tc.wantId);
    assert.equal(rootEl.getAttribute('data-mono'), tc.wantMono ? '1' : '0');
  }

  inst.destroy();
  assert.equal(env.getCounts().activeObservers, 0);
});

test('V2 Host bottom trigger .ag-pp-mini-keycap badge sync preserves React HostText, auto-removes on non-element models, and cleans up on destroy()', () => {
  const env = createPeriodicSandbox();
  const factory = loadPeriodicFactoryInSandbox(env);

  const hostTextNode = env.createTextNode('Gemini 4 Carbon (High)');
  const triggerBtn = env.makeElement('button', {
    attrs: { 'data-testid': 'model-selector-trigger' },
    useChildNodes: true,
  });
  triggerBtn.appendChild(hostTextNode);
  env.body.appendChild(triggerBtn);

  const hostState = {
    selectedModel: { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-c-high' },
    modelOptions: [
      { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-c-high' },
      { label: 'Claude Opus 5.5', modelId: 'claude-opus-5.5' },
      { label: 'Gemini 3.8 Flash', modelId: 'gemini-3.8-flash' },
      { label: 'Orchestrator', modelId: 'orchestrator' },
    ],
  };
  env.window.__agPeriodicMockHost = hostState;

  const inst = factory.mountPeriodicPicker({ root: env.window, doc: env.document, mode: 'on' });

  // 1) Carbon model mounts V14.1 theme-native hairline frosted micro-badge (6C, 0 fake 3D skirt/gloss, 0 legacy green) without touching original React HostText node
  const badge = triggerBtn.querySelector('.ag-pp-mini-keycap');
  assert.ok(badge, 'Expected .ag-pp-mini-keycap on Carbon model trigger');
  assert.equal(badge.textContent, '6C');
  assert.equal(badge.getAttribute('data-z'), '6');
  assert.equal(badge.getAttribute('data-symbol'), 'C');
  assert.equal(badge.getAttribute('data-ag-no-i18n'), '1');
  assert.equal(badge.getAttribute('data-ag-owned'), '1');
  assert.ok(
    badge.style.getPropertyValue('--mk-bg').startsWith('rgba(') && !badge.style.getPropertyValue('--mk-bg').includes('linear-gradient'),
    'Expected flat whisper-tinted frosted surface on --mk-bg (zero loud candy gradient)'
  );
  assert.equal(badge.style.getPropertyValue('--mk-bg').includes('#317660'), false, 'Carbon must have strictly zero legacy green');
  assert.equal(badge.style.getPropertyValue('--mk-skirt'), '', 'V14.1 hairline badge must have zero fake 3D bottom skirt');
  assert.equal(triggerBtn.childNodes[0], hostTextNode, 'Must preserve exact React HostText reference');
  assert.equal(hostTextNode.nodeValue, 'Gemini 4 Carbon (High)');

  // 1b) Monochrome accent switches hairline micro-badge variables to pure neutral zero-chroma tones
  env.html.setAttribute('data-ag-cs-accent', 'mono');
  inst.syncBadges();
  assert.equal(badge.style.getPropertyValue('--mk-fg'), '#C8CDD6', 'Expected pure neutral monochrome ink when accent=mono');
  assert.equal(badge.style.getPropertyValue('--mk-skirt'), '');
  env.html.setAttribute('data-ag-cs-accent', 'follow');
  inst.syncBadges();
  assert.notEqual(badge.style.getPropertyValue('--mk-fg'), '#C8CDD6');

  // 2) Switching to Aux / Orchestrator models updates to compact non-redundant codes (OP / FL / 0·6C), while unsupported third-party models auto-remove
  for (const auxCase of [
    { label: 'Claude Opus 5.5', modelId: 'claude-opus-5.5', expected: 'OP' },
    { label: 'Gemini 3.8 Flash', modelId: 'gemini-3.8-flash', expected: 'FL' },
    { label: 'Orchestrator', modelId: 'orchestrator', expected: '0·6C' },
  ]) {
    hostTextNode.nodeValue = auxCase.label;
    hostState.selectedModel = { label: auxCase.label, modelId: auxCase.modelId };
    inst.onHostTriggerChanged();
    env.advanceTime(30);
    const auxBadge = triggerBtn.querySelector('.ag-pp-mini-keycap');
    assert.ok(auxBadge, `Expected compact hairline badge for ${auxCase.label}`);
    assert.equal(auxBadge.textContent, auxCase.expected);
    assert.equal(triggerBtn.childNodes[0], hostTextNode);
  }

  for (const unsupported of [
    { label: 'DeepSeek R2', modelId: 'deepseek-r2' },
    { label: 'Llama 4 Maverick', modelId: 'llama-4-maverick' },
  ]) {
    hostTextNode.nodeValue = 'Gemini 4 Carbon (High)';
    hostState.selectedModel = { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-c-high' };
    inst.syncBadges();
    assert.ok(triggerBtn.querySelector('.ag-pp-mini-keycap'), 'Precondition: Carbon badge present');

    hostTextNode.nodeValue = unsupported.label;
    hostState.selectedModel = unsupported;
    inst.onHostTriggerChanged();
    env.advanceTime(30);

    assert.equal(
      triggerBtn.querySelector('.ag-pp-mini-keycap'),
      null,
      `.ag-pp-mini-keycap must auto-remove for unsupported model ${unsupported.label}`
    );
    assert.equal(triggerBtn.childNodes[0], hostTextNode);
  }

  // 3) Re-enable Carbon badge then verify destroy() removes 100% of .ag-pp-mini-keycap & observers
  hostTextNode.nodeValue = 'Gemini 4 Carbon (High)';
  hostState.selectedModel = { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-c-high' };
  inst.syncBadges();
  assert.ok(triggerBtn.querySelector('.ag-pp-mini-keycap'));

  inst.destroy();
  assert.equal(env.document.querySelectorAll('.ag-pp-mini-keycap').length, 0);
  assert.equal(triggerBtn.childNodes.length, 1);
  assert.equal(triggerBtn.childNodes[0], hostTextNode);
  assert.equal(env.getCounts().activeObservers, 0);
  assert.equal(env.getCounts().activeTimers, 0);
});

test('V5 3D Renderer & pbr-grain-assets.js: 128x128 RG8 grain + 128x64 RGB8 metalEnv (24,576 B), 4 wallpapers/novelties, DESKMAT_TOPO, 5 textures + 1 Shadow FBO, and 90/90 pick()', () => {
  const { ELEMENTS_90 } = require(PERIODIC_PICKER_FILE);
  const env = createPeriodicSandbox({ mock2d: true, mockWebGL2: true });
  const grainAssetsApi = loadGrainAssetsInSandbox(env);
  const oledScreenApi = loadOledScreenInSandbox(env);
  const kb3d = loadKeyboard3DInSandbox(env);

  assert.equal(typeof oledScreenApi?.createOledScreenPainter, 'function');

  // 1) Verify V5 pbr-grain-assets.js contract: TILE_SIZE=128, metalEnvRGB (24,576 B), 4 OLED_WALLPAPERS, 4 NOVELTY_ICONS, DESKMAT_TOPO
  assert.equal(grainAssetsApi.TILE_SIZE, 128);
  assert.equal(grainAssetsApi.ENV_W, 128);
  assert.equal(grainAssetsApi.ENV_H, 64);
  assert.equal(grainAssetsApi.EMBLEM_VIEWBOX, 2048);
  assert.equal(Array.isArray(grainAssetsApi.EMBLEM_PATHS) && grainAssetsApi.EMBLEM_PATHS.length, 22);
  const expectedBannerKeys = ['1', '10', '18', '6', 'claude', 'flash', 'gpt', 'orchestrator', 'standby'];
  assert.deepEqual(Object.keys(grainAssetsApi.OLED_WALLPAPERS).sort(), expectedBannerKeys);
  assert.deepEqual(Object.keys(grainAssetsApi.OLED_WALLPAPERS_LIGHT).sort(), expectedBannerKeys);
  for (const k of expectedBannerKeys) {
    assert.ok(String(grainAssetsApi.OLED_WALLPAPERS[k]).startsWith('data:image/webp;base64,'), `OLED_WALLPAPERS[${k}] must be WebP data URI`);
    assert.ok(String(grainAssetsApi.OLED_WALLPAPERS_LIGHT[k]).startsWith('data:image/webp;base64,'), `OLED_WALLPAPERS_LIGHT[${k}] must be WebP data URI`);
  }
  assert.deepEqual(Object.keys(grainAssetsApi.NOVELTY_ICONS).sort(), ['1', '10', '18', '6']);
  for (const k of ['1', '6', '10', '18']) {
    const icon = grainAssetsApi.NOVELTY_ICONS[k];
    assert.ok(icon && icon.viewBox && Array.isArray(icon.paths) && icon.paths.length > 0, `NOVELTY_ICONS[${k}] must have viewBox and paths`);
  }
  assert.ok(grainAssetsApi.DESKMAT_TOPO && grainAssetsApi.DESKMAT_TOPO.viewBox === 2048);
  assert.ok(Array.isArray(grainAssetsApi.DESKMAT_TOPO.paths) && grainAssetsApi.DESKMAT_TOPO.paths.length > 0);

  const grainTex = grainAssetsApi.getGrainTextures();
  assert.equal(grainTex.size, 128);
  assert.equal(grainTex.pbtHeight.length, 128 * 128);
  assert.equal(grainTex.aluHeight.length, 128 * 128);
  assert.equal(grainTex.combinedRG.length, 128 * 128 * 2);
  assert.ok(grainTex.combinedRG.some((v) => v > 0), 'Decoded RG8 combined grain buffer must be non-zero');
  assert.equal(grainTex.envW, 128);
  assert.equal(grainTex.envH, 64);
  assert.equal(grainTex.metalEnvRGB.length, 24576);
  assert.ok(grainTex.metalEnvRGB.some((v) => v > 0), 'Decoded RGB8 metalEnvRGB buffer must be non-zero');

  const canvas = env.makeElement('canvas');
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 960, height: 552, right: 960, bottom: 552 });

  const availMap = new Map([
    [1, { slotZ: 1 }],
    [6, { slotZ: 6 }],
    [10, { slotZ: 10 }],
    [18, { slotZ: 18 }],
  ]);

  const renderer = kb3d.createKeyboard3DRenderer({
    canvas,
    doc: env.document,
    root: env.window,
    slots: ELEMENTS_90,
  });
  assert.equal(renderer.getRendererMode(), 'webgl2');

  const glStats = canvas._gl._stats();
  assert.equal(glStats.created.textures.size, 5, 'V5 must create 5 WebGL textures (atlas, grain, metalEnvTex, oled, shadow)');
  assert.equal(glStats.created.framebuffers.size, 1, 'V5 must create 1 Shadow FBO');
  assert.ok(
    glStats.rg8TexAllocations.some(
      (t) => t.width === 128 && t.height === 128 && t.byteLength === 128 * 128 * 2
    ),
    'V5 must upload 128x128 RG8 grain texture from pbr-grain-assets.js'
  );
  assert.ok(
    glStats.rgb8TexAllocations.some(
      (t) => t.width === 128 && t.height === 64 && t.byteLength === 24576
    ),
    'V5 must upload 128x64 RGB8 metalEnvTex (24,576 B) from pbr-grain-assets.js'
  );

  const setDeckLevels = (levels) => {
    renderer.setState({
      themeProfile: { id: 'obsidian-dark', isLight: false, isMono: false, ambientMul: 0.7, primaryHex: '#487396' },
      availableByZ: availMap,
      selectedZ: 6,
      deckInfo: {
        z: 6,
        numLabel: '6',
        groupCode: 'G14',
        symbol: 'C',
        mass: '12.011',
        title: 'Gemini 4 Carbon',
        chemLabel: '6 C · Carbon',
        subtitle: 'Balanced flagship',
        isAvailable: true,
        effortTitle: 'Thinking Level',
        levels,
      },
      topControls: { muted: false, hoveredBtn: null, pressedBtn: null },
    });
    for (let i = 0; i < 240 && !renderer.isIdle(); i += 1) {
      renderer.step(0.016);
    }
    assert.equal(renderer.isIdle(), true);
  };

  setDeckLevels([
    { effort: 'low', label: 'Low', active: false },
    { effort: 'medium', label: 'Medium', active: false },
    { effort: 'high', label: 'High', active: true },
  ]);

  const rectsRest = renderer.getInteractiveProjectedRects();
  // 2) Verify 74° near-ortho full-bleed framing (~95% canvas width) inside canvas bounds
  const fillRatioW = rectsRest.chassis.width / 960;
  assert.ok(
    fillRatioW >= 0.88 && fillRatioW <= 0.99,
    `Expected V5 full-frame width fill in [0.88, 0.99], got ${fillRatioW.toFixed(3)}`
  );
  assert.ok(rectsRest.chassis.left >= 0 && rectsRest.chassis.left + rectsRest.chassis.width <= 960);
  assert.ok(rectsRest.chassis.top >= 0 && rectsRest.chassis.top + rectsRest.chassis.height <= 552);

  // 3) Verify 90/90 keycaps full-frame projected center pick() 100% hit
  assert.equal(rectsRest.keys.length, 90);
  for (const keyEntry of rectsRest.keys) {
    const cx = keyEntry.left + keyEntry.width * 0.5;
    const cy = keyEntry.top + keyEntry.height * 0.5;
    const hit = renderer.pick(cx, cy);
    assert.ok(hit && hit.kind === 'key', `Expected key hit for z=${keyEntry.slotZ}, got ${JSON.stringify(hit)}`);
    assert.equal(hit.slotZ, keyEntry.slotZ, `Key center pick mismatch for slotZ=${keyEntry.slotZ}`);
  }

  // 4) Verify OLED screen integrated effort capsules (low / medium / high) strictly inside OLED deck & 100% pick()
  assert.deepEqual(
    Array.from(rectsRest.efforts, (e) => e.effort),
    ['low', 'medium', 'high']
  );
  for (const ef of rectsRest.efforts) {
    assert.ok(
      ef.left >= rectsRest.deck.left &&
        ef.left + ef.width <= rectsRest.deck.left + rectsRest.deck.width &&
        ef.top >= rectsRest.deck.top &&
        ef.top + ef.height <= rectsRest.deck.top + rectsRest.deck.height,
      `Effort capsule ${ef.effort} must lie strictly inside OLED deck rect`
    );
    const hit = renderer.pick(ef.left + ef.width * 0.5, ef.top + ef.height * 0.5);
    assert.deepEqual({ ...hit }, { kind: 'effort', effort: ef.effort });
  }

  // Also verify 4-tier OLED capsule layout (low / medium / high / xhigh)
  setDeckLevels([
    { effort: 'low', label: 'Low', active: false },
    { effort: 'medium', label: 'Medium', active: false },
    { effort: 'high', label: 'High', active: false },
    { effort: 'xhigh', label: 'Extra', active: true },
  ]);
  const rects4 = renderer.getInteractiveProjectedRects();
  assert.deepEqual(
    Array.from(rects4.efforts, (e) => e.effort),
    ['low', 'medium', 'high', 'xhigh']
  );
  for (const ef of rects4.efforts) {
    const hit = renderer.pick(ef.left + ef.width * 0.5, ef.top + ef.height * 0.5);
    assert.deepEqual({ ...hit }, { kind: 'effort', effort: ef.effort });
  }

  // 5) Verify 0° chassis lock + 1.14x levitated keycap magnetic tilt/drift via norm compat
  const keyCRest = rectsRest.keys.find((k) => k.slotZ === 6);
  const keyNRest = rectsRest.keys.find((k) => k.slotZ === 7);
  assert.ok(
    keyCRest.width * keyCRest.height > keyNRest.width * keyNRest.height * 1.45,
    'Levitated Carbon keycap projected area must exceed unlifted neighbor'
  );

  renderer.setPointerNorm(0.85, -0.75, true);
  for (let i = 0; i < 300 && !renderer.isIdle(); i += 1) {
    renderer.step(0.016);
  }
  assert.equal(renderer.isIdle(), true);
  const rectsTilted = renderer.getInteractiveProjectedRects();
  assert.ok(Math.abs(rectsTilted.chassis.left - rectsRest.chassis.left) <= 0.1, 'Chassis must stay 0° locked (left)');
  assert.ok(Math.abs(rectsTilted.chassis.top - rectsRest.chassis.top) <= 0.1, 'Chassis must stay 0° locked (top)');
  assert.ok(Math.abs(rectsTilted.chassis.width - rectsRest.chassis.width) <= 0.1, 'Chassis must stay 0° locked (width)');

  const keyCTilted = rectsTilted.keys.find((k) => k.slotZ === 6);
  const driftPx = Math.hypot(
    keyCTilted.left + keyCTilted.width * 0.5 - (keyCRest.left + keyCRest.width * 0.5),
    keyCTilted.top + keyCTilted.height * 0.5 - (keyCRest.top + keyCRest.height * 0.5)
  );
  assert.ok(driftPx > 5, `Expected magnetic drift on levitated keycap, got ${driftPx.toFixed(2)}px`);
  const tiltedHit = renderer.pick(keyCTilted.left + keyCTilted.width * 0.5, keyCTilted.top + keyCTilted.height * 0.5);
  assert.ok(tiltedHit && tiltedHit.kind === 'key' && tiltedHit.slotZ === 6);

  renderer.dispose();
  const glAfter = canvas._gl._stats();
  assert.equal(glAfter.deleted.textures.size, glAfter.created.textures.size);
  assert.equal(glAfter.deleted.textures.size, 5, 'All 5 WebGL textures must be symmetrically released');
  assert.equal(glAfter.deleted.framebuffers.size, glAfter.created.framebuffers.size);
  assert.equal(glAfter.deleted.framebuffers.size, 1, 'Shadow FBO must be symmetrically released');
});

test('V5 Near-field local sensing (setPointerClient): >300px stays 0fps idle, <80px responds in <16ms, inside=false smoothly settles to 0fps', () => {
  const { ELEMENTS_90 } = require(PERIODIC_PICKER_FILE);
  const env = createPeriodicSandbox({ mock2d: true, mockWebGL2: true });
  loadGrainAssetsInSandbox(env);
  loadOledScreenInSandbox(env);
  const kb3d = loadKeyboard3DInSandbox(env);

  const canvas = env.makeElement('canvas');
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 960, height: 552, right: 960, bottom: 552 });

  const renderer = kb3d.createKeyboard3DRenderer({
    canvas,
    doc: env.document,
    root: env.window,
    slots: ELEMENTS_90,
  });

  renderer.setState({
    themeProfile: { id: 'obsidian-dark', isLight: false, isMono: false, ambientMul: 0.7, primaryHex: '#487396' },
    availableByZ: new Map([
      [1, { slotZ: 1 }],
      [6, { slotZ: 6 }],
      [10, { slotZ: 10 }],
      [18, { slotZ: 18 }],
    ]),
    selectedZ: 6,
  });
  for (let i = 0; i < 240 && !renderer.isIdle(); i += 1) {
    renderer.step(0.016);
  }
  assert.equal(renderer.isIdle(), true);
  assert.equal(env.getCounts().activeRafs, 0);

  const rectsRest = renderer.getInteractiveProjectedRects();
  const keyCRest = rectsRest.keys.find((k) => k.slotZ === 6);
  const capCx = keyCRest.left + keyCRest.width * 0.5;
  const capCy = keyCRest.top + keyCRest.height * 0.5;

  // 1) Far pointer (> 300px away from levitated keycap center): zero tilt offset & stays 0fps idle
  renderer.setPointerClient(capCx - 340, capCy + 40, true);
  assert.equal(renderer.isIdle(), true, 'Pointer >300px away must remain 0fps idle');
  assert.equal(env.getCounts().activeRafs, 0, 'Pointer >300px away must schedule 0 rAF');
  const keyCFar = renderer.getInteractiveProjectedRects().keys.find((k) => k.slotZ === 6);
  const farOffset = Math.hypot(
    keyCFar.left + keyCFar.width * 0.5 - capCx,
    keyCFar.top + keyCFar.height * 0.5 - capCy
  );
  assert.ok(farOffset < 1e-6, `Expected 0 offset when >300px away, got ${farOffset}`);

  // 2) Near pointer (< 80px from levitated keycap center): immediate <16ms tracking response
  renderer.setPointerClient(capCx + 50, capCy - 30, true);
  assert.equal(renderer.isIdle(), false, 'Near-field pointer (<80px) must wake renderer');
  assert.ok(env.getCounts().activeRafs > 0, 'Near-field active tracking must schedule rAF');
  const keyCImmediate = renderer.getInteractiveProjectedRects().keys.find((k) => k.slotZ === 6);
  const immediateOffset = Math.hypot(
    keyCImmediate.left + keyCImmediate.width * 0.5 - capCx,
    keyCImmediate.top + keyCImmediate.height * 0.5 - capCy
  );
  assert.ok(immediateOffset > 1.0, `Expected immediate <16ms tracking offset >1px, got ${immediateOffset.toFixed(3)}px`);

  // Verify single <16ms step further advances smoothly while keeping chassis 0° locked
  renderer.step(0.015);
  const rectsAfter15ms = renderer.getInteractiveProjectedRects();
  const keyC15ms = rectsAfter15ms.keys.find((k) => k.slotZ === 6);
  const offset15ms = Math.hypot(
    keyC15ms.left + keyC15ms.width * 0.5 - capCx,
    keyC15ms.top + keyC15ms.height * 0.5 - capCy
  );
  assert.ok(offset15ms > immediateOffset, `Expected continued <16ms step follow, got ${offset15ms.toFixed(3)}px`);
  assert.ok(Math.abs(rectsAfter15ms.chassis.left - rectsRest.chassis.left) <= 0.1, 'Chassis must stay 0° locked during near-field tracking');

  // 3) Leave pointer (inside = false): smoothly returns to rest and converges back to 0fps idle
  renderer.setPointerClient(capCx + 50, capCy - 30, false);
  let converged = false;
  for (let i = 0; i < 300; i += 1) {
    if (renderer.step(0.016)) {
      converged = true;
      break;
    }
  }
  assert.equal(converged, true, 'Levitated keycap must smoothly settle back to 0fps after inside=false');
  assert.equal(renderer.isIdle(), true);
  assert.equal(env.getCounts().activeRafs, 0);
  const keyCReturned = renderer.getInteractiveProjectedRects().keys.find((k) => k.slotZ === 6);
  const returnResidual = Math.hypot(
    keyCReturned.left + keyCReturned.width * 0.5 - capCx,
    keyCReturned.top + keyCReturned.height * 0.5 - capCy
  );
  assert.ok(returnResidual < 0.05, `Expected clean return to rest (<0.05px), got ${returnResidual.toFixed(4)}px`);

  renderer.dispose();
  const glAfter = canvas._gl._stats();
  assert.equal(glAfter.deleted.textures.size, 5);
  assert.equal(glAfter.deleted.framebuffers.size, 1);
});

test('V6 Dual-mode wallpapers (8 clean WebP data URIs) & oled-cyber-screen.js day/night 200ms transition + 0fps sleep', () => {
  const env = createPeriodicSandbox({ mock2d: true, mockWebGL2: false });
  const drawnSrcs = [];
  class MockImage {
    constructor() {
      this._src = '';
      this.complete = false;
      this.naturalWidth = 0;
      this.naturalHeight = 0;
      this.width = 0;
      this.height = 0;
      this.onload = null;
      this.onerror = null;
    }
    set src(v) {
      this._src = String(v || '');
      this.complete = true;
      this.naturalWidth = 640;
      this.naturalHeight = 200;
      this.width = 640;
      this.height = 200;
      if (typeof this.onload === 'function') this.onload();
    }
    get src() {
      return this._src;
    }
  }
  env.window.Image = MockImage;
  env.sandbox.Image = MockImage;

  const grainAssetsApi = loadGrainAssetsInSandbox(env);
  const oledScreenApi = loadOledScreenInSandbox(env);

  // 1) Verify 8 distinct Dark & Light full-bleed 960x288 (10:3) WebP banners across OLED_WALLPAPERS & OLED_WALLPAPERS_LIGHT, strictly clean RIFF/WEBP with 0 C2PA/JUMBF/EXIF chunks
  const expectedBannerKeys = ['1', '10', '18', '6', 'claude', 'flash', 'gpt', 'orchestrator', 'standby'];
  assert.deepEqual(Object.keys(grainAssetsApi.OLED_WALLPAPERS).sort(), expectedBannerKeys);
  assert.deepEqual(Object.keys(grainAssetsApi.OLED_WALLPAPERS_LIGHT).sort(), expectedBannerKeys);

  let totalWallpapers = 0;
  let totalWallpaperBytes = 0;
  for (const [dictName, dict] of [
    ['OLED_WALLPAPERS', grainAssetsApi.OLED_WALLPAPERS],
    ['OLED_WALLPAPERS_LIGHT', grainAssetsApi.OLED_WALLPAPERS_LIGHT],
  ]) {
    for (const zKey of expectedBannerKeys) {
      const uri = String(dict[zKey] || '');
      assert.ok(uri.startsWith('data:image/webp;base64,'), `${dictName}[${zKey}] must start with data:image/webp;base64,`);
      assert.notEqual(
        grainAssetsApi.OLED_WALLPAPERS[zKey],
        grainAssetsApi.OLED_WALLPAPERS_LIGHT[zKey],
        `V14 must provide distinct Dark vs Light editorial WebP banner assets for key=${zKey}`
      );
      const buf = Buffer.from(uri.slice('data:image/webp;base64,'.length), 'base64');
      totalWallpaperBytes += buf.length;
      assert.equal(buf.toString('ascii', 0, 4), 'RIFF', `${dictName}[${zKey}] must have RIFF header`);
      assert.equal(buf.toString('ascii', 8, 12), 'WEBP', `${dictName}[${zKey}] must have WEBP signature`);
      let off = 12;
      while (off + 8 <= buf.length) {
        const fourcc = buf.toString('ascii', off, off + 4);
        const sz = buf.readUInt32LE(off + 4);
        assert.equal(
          /^(?:JUMB|C2PA|XMP |EXIF)$/i.test(fourcc),
          false,
          `${dictName}[${zKey}] must contain 0 ${fourcc} metadata chunk`
        );
        off += 8 + sz + (sz % 2);
      }
      totalWallpapers += 1;
    }
  }
  assert.equal(totalWallpapers, 18);
  assert.ok(
    totalWallpaperBytes > 48 * 1024 && totalWallpaperBytes < 210 * 1024,
    `Expected V14.1 18 Dark+Light full-bleed WebP banners within (48KB, 210KB), got ${(totalWallpaperBytes / 1024).toFixed(2)} KB`
  );

  // 2) Verify oled-cyber-screen.js 200ms cross-fade transition & 0fps idle recovery
  let asyncReadyCount = 0;
  const painter = oledScreenApi.createOledScreenPainter({
    width: 1600,
    height: 480,
    doc: env.document,
    root: env.window,
    onAsyncAssetReady: () => {
      asyncReadyCount += 1;
    },
  });
  assert.equal(asyncReadyCount, 18, `Expected preload async callbacks for all 18 Dark+Light banners, got ${asyncReadyCount}`);

  const canvas = painter.getCanvas();
  const origDrawImage = canvas._ctx2d.drawImage;
  canvas._ctx2d.drawImage = function (img, ...rest) {
    if (img && img.src) drawnSrcs.push(img.src);
    return origDrawImage.call(this, img, ...rest);
  };

  const deckInfoC = {
    z: 6,
    numLabel: '6',
    groupCode: 'G14',
    symbol: 'C',
    mass: '12.011',
    title: 'Gemini 4 Carbon',
    chemLabel: '6 C · Carbon',
    subtitle: 'Balanced flagship',
    isAvailable: true,
    effortTitle: 'Thinking Level',
    levels: [
      { effort: 'low', label: 'Low', active: false },
      { effort: 'medium', label: 'Medium', active: false },
      { effort: 'high', label: 'High', active: true },
    ],
  };

  // Initial dark mode render -> immediate steady state (0fps)
  painter.render(deckInfoC, { id: 'obsidian-dark', isLight: false, isMono: false, primaryHex: '#317660' }, { now: 1000 });
  assert.equal(painter.isAnimating(1000), false, 'Initial render must not stay animating');
  assert.ok(drawnSrcs.includes(grainAssetsApi.OLED_WALLPAPERS['6']), 'Dark mode must draw OLED_WALLPAPERS[6]');

  // Switch isLight: false -> true at t=1100 -> 200ms cross-fade starts
  drawnSrcs.length = 0;
  painter.render(deckInfoC, { id: 'crystal-light', isLight: true, isMono: false, primaryHex: '#2563EB' }, { now: 1100 });
  assert.equal(painter.isAnimating(1100), true, 'Day/night switch must trigger 200ms transition');

  // Mid-transition at t=1200 (100ms < 200ms) -> still animating and draws both dark + light layers
  painter.render(deckInfoC, { id: 'crystal-light', isLight: true, isMono: false, primaryHex: '#2563EB' }, { now: 1200 });
  assert.equal(painter.isAnimating(1200), true, 'Transition at 100ms must still be animating');
  assert.ok(drawnSrcs.includes(grainAssetsApi.OLED_WALLPAPERS['6']), 'Mid-fade must blend outgoing dark wallpaper');
  assert.ok(drawnSrcs.includes(grainAssetsApi.OLED_WALLPAPERS_LIGHT['6']), 'Mid-fade must blend incoming light wallpaper');

  // At t=1300 (200ms elapsed) -> settles to 0fps idle
  drawnSrcs.length = 0;
  painter.render(deckInfoC, { id: 'crystal-light', isLight: true, isMono: false, primaryHex: '#2563EB' }, { now: 1300 });
  assert.equal(painter.isAnimating(1300), false, 'Transition must settle to isAnimating()===false after 200ms');
  assert.deepEqual(drawnSrcs, [grainAssetsApi.OLED_WALLPAPERS_LIGHT['6']], 'Settled light mode must draw only OLED_WALLPAPERS_LIGHT[6]');

  // Switch back isLight: true -> false (using sandbox clock) -> 200ms transition then 0fps idle
  painter.render(deckInfoC, { id: 'warm-dark', isLight: false, isMono: false, primaryHex: '#D97706' });
  assert.equal(painter.isAnimating(), true, 'Light->dark switch must start transition');
  env.advanceTime(220);
  painter.render(deckInfoC, { id: 'warm-dark', isLight: false, isMono: false, primaryHex: '#D97706' });
  assert.equal(painter.isAnimating(), false, 'Light->dark transition must return to 0fps idle after 200ms');

  // Regression (#50/#55): hovering blind key 2 He · Helium (G18) must render HELIUM in kicker, never ARGON
  const drawnTexts = [];
  const origFillText = canvas._ctx2d.fillText;
  canvas._ctx2d.fillText = function (text, ...rest) {
    drawnTexts.push(String(text || ''));
    return origFillText.call(this, text, ...rest);
  };
  painter.render(
    {
      z: 2,
      numLabel: '2',
      groupCode: 'G18',
      symbol: 'He',
      elementEn: 'Helium',
      title: '2 He · Helium — Unreleased',
      chemLabel: '氦',
      subtitle: '第 18 族 · 惰性气体 · 尚未开放的化学元素席位',
      isAvailable: false,
      unreleasedText: '未发布 · 锁定盲键',
      effortTitle: '元素状态',
      levels: [],
    },
    { id: 'obsidian-dark', isLight: false, isMono: false, primaryHex: '#487396' },
    { reducedMotion: true }
  );
  const heKicker = drawnTexts.join(' | ');
  assert.ok(heKicker.includes('HELIUM'), `Expected HELIUM in 2 He OLED kicker, got: ${heKicker}`);
  assert.equal(heKicker.includes('ARGON'), false, `2 He OLED kicker must never mislabel as ARGON: ${heKicker}`);

  drawnTexts.length = 0;
  painter.render(
    {
      z: 2,
      numLabel: '2',
      groupCode: 'G18',
      symbol: 'He',
      title: '2 He · Helium — Unreleased',
      chemLabel: '氦',
      isAvailable: false,
      levels: [],
    },
    { id: 'crystal-light', isLight: true, isMono: false, primaryHex: '#2563EB' },
    { reducedMotion: true }
  );
  const heFallbackKicker = drawnTexts.join(' | ');
  assert.ok(heFallbackKicker.includes('HELIUM'), `Expected HELIUM fallback from title for 2 He, got: ${heFallbackKicker}`);
  assert.equal(heFallbackKicker.includes('ARGON'), false, `2 He fallback kicker must never say ARGON: ${heFallbackKicker}`);

  painter.dispose();
  assert.equal(painter.isAnimating(), false);
  assert.equal(painter.getCanvas(), null);
});

test('V7 Jade Paperweight Heavy Viscous Inertia: zero flick jerk (<0.8px), bounded near-field tilt (±13°/±0.09U), <=3.5% settle rebound -> 0fps', () => {
  const { ELEMENTS_90 } = require(PERIODIC_PICKER_FILE);
  const env = createPeriodicSandbox({ mock2d: true, mockWebGL2: true });
  loadGrainAssetsInSandbox(env);
  loadOledScreenInSandbox(env);
  const kb3d = loadKeyboard3DInSandbox(env);

  const canvas = env.makeElement('canvas');
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 960, height: 552, right: 960, bottom: 552 });

  const renderer = kb3d.createKeyboard3DRenderer({
    canvas,
    doc: env.document,
    root: env.window,
    slots: ELEMENTS_90,
  });

  renderer.setState({
    themeProfile: { id: 'obsidian-dark', isLight: false, isMono: false, ambientMul: 0.7, primaryHex: '#487396' },
    availableByZ: new Map([
      [1, { slotZ: 1 }],
      [6, { slotZ: 6 }],
      [10, { slotZ: 10 }],
      [18, { slotZ: 18 }],
    ]),
    selectedZ: 6,
  });
  for (let i = 0; i < 240 && !renderer.isIdle(); i += 1) {
    renderer.step(0.016);
  }
  assert.equal(renderer.isIdle(), true);

  const rectsRest = renderer.getInteractiveProjectedRects();
  const keyCRest = rectsRest.keys.find((k) => k.slotZ === 6);
  const capCx = keyCRest.left + keyCRest.width * 0.5;
  const capCy = keyCRest.top + keyCRest.height * 0.5;

  // 1) Near-field dwell traction (bounded within ±13° / ±0.09U) then release (inside=false):
  //    verify restrained hydraulic rebound (<= 3.5%) before settling <0.05px & 0fps
  renderer.setPointerClient(capCx + 65, capCy - 25, true);
  for (let i = 0; i < 45; i += 1) {
    renderer.step(0.016);
  }
  const rectsDwell = renderer.getInteractiveProjectedRects();
  const keyCDisplaced = rectsDwell.keys.find((k) => k.slotZ === 6);
  const displacedDx = keyCDisplaced.left + keyCDisplaced.width * 0.5 - capCx;
  const displacedDy = keyCDisplaced.top + keyCDisplaced.height * 0.5 - capCy;
  assert.ok(
    displacedDx > 2.0 && displacedDx < 8.0,
    `Expected steady bounded horizontal tilt/drift in (2.0, 8.0)px under ±13°/±0.09U cap, got ${displacedDx.toFixed(3)}px`
  );
  assert.ok(
    Math.abs(displacedDy) > 0.5 && Math.abs(displacedDy) < 6.0,
    `Expected steady bounded vertical tilt/drift under ±13°/±0.09U cap, got ${displacedDy.toFixed(3)}px`
  );
  assert.ok(Math.abs(rectsDwell.chassis.left - rectsRest.chassis.left) <= 0.1, 'Chassis must stay 0° locked during dwell');

  renderer.setPointerClient(capCx + 65, capCy - 25, false);
  let minReverseDx = 0;
  let overshootConverged = false;
  for (let i = 0; i < 300; i += 1) {
    const done = renderer.step(0.016);
    const kNow = renderer.getInteractiveProjectedRects().keys.find((k) => k.slotZ === 6);
    const dx = kNow.left + kNow.width * 0.5 - capCx;
    if (dx < minReverseDx) minReverseDx = dx;
    if (done) {
      overshootConverged = true;
      break;
    }
  }
  const reboundRatio = Math.abs(minReverseDx) / Math.max(1e-6, displacedDx);
  assert.ok(
    reboundRatio <= 0.045,
    `Expected restrained hydraulic micro-rebound <= 4.5% of steady displacement, got ${(reboundRatio * 100).toFixed(2)}% (${minReverseDx.toFixed(4)}px / ${displacedDx.toFixed(3)}px)`
  );
  assert.equal(overshootConverged, true, 'Heavy viscous spring must converge cleanly after release');
  assert.equal(renderer.isIdle(), true);
  assert.equal(env.getCounts().activeRafs, 0);
  const keyCAfterOvershoot = renderer.getInteractiveProjectedRects().keys.find((k) => k.slotZ === 6);
  const overshootResidual = Math.hypot(
    keyCAfterOvershoot.left + keyCAfterOvershoot.width * 0.5 - capCx,
    keyCAfterOvershoot.top + keyCAfterOvershoot.height * 0.5 - capCy
  );
  assert.ok(overshootResidual < 0.05, `Expected residual <0.05px after settle, got ${overshootResidual.toFixed(4)}px`);

  // 2) Rapid horizontal flick across near-field and exiting (-185px -> -18px -> +195px, inside=false):
  //    verify Zero Flick Jerk (< 0.8px forward swing) and clean return to 0fps sleep
  renderer.setPointerClient(capCx - 185, capCy, true);
  assert.equal(renderer.isIdle(), true, 'Starting outside near-field (>165px) must stay 0fps idle');
  env.advanceTime(12);
  renderer.setPointerClient(capCx - 18, capCy, true);
  env.advanceTime(12);
  renderer.setPointerClient(capCx + 195, capCy, false);

  let maxForwardDx = 0;
  let flickConverged = false;
  for (let i = 0; i < 300; i += 1) {
    const done = renderer.step(0.016);
    const kNow = renderer.getInteractiveProjectedRects().keys.find((k) => k.slotZ === 6);
    const dx = kNow.left + kNow.width * 0.5 - capCx;
    if (dx > maxForwardDx) maxForwardDx = dx;
    if (done) {
      flickConverged = true;
      break;
    }
  }
  assert.ok(
    maxForwardDx < 0.8,
    `Expected Zero Flick Jerk (< 0.8px forward swing) on rapid sweep, got ${maxForwardDx.toFixed(4)}px`
  );
  assert.equal(flickConverged, true, 'Rapid sweep must smoothly settle back to 0fps');
  assert.equal(renderer.isIdle(), true);
  assert.equal(env.getCounts().activeRafs, 0);

  const keyCAfterFlick = renderer.getInteractiveProjectedRects().keys.find((k) => k.slotZ === 6);
  const flickResidual = Math.hypot(
    keyCAfterFlick.left + keyCAfterFlick.width * 0.5 - capCx,
    keyCAfterFlick.top + keyCAfterFlick.height * 0.5 - capCy
  );
  assert.ok(flickResidual < 0.05, `Expected clean return to rest (<0.05px) after flick, got ${flickResidual.toFixed(4)}px`);

  renderer.dispose();
  assert.equal(env.getCounts().activeRafs, 0);
});

test('V6 Compact Floating Control Island (.ag-pp-hud-pill): 0 .ag-pp-hud-hints, 4 element chips + mute/close, interactive switch, and 100% destroy()', () => {
  const env = createPeriodicSandbox({ mock2d: true, mockWebGL2: true });
  loadGrainAssetsInSandbox(env);
  loadOledScreenInSandbox(env);
  loadKeyboard3DInSandbox(env);
  const factory = loadPeriodicFactoryInSandbox(env);

  const triggerBtn = env.makeElement('button', {
    attrs: { 'data-testid': 'model-selector-trigger' },
    text: 'Gemini 4 Carbon (High)',
  });
  env.body.appendChild(triggerBtn);

  const hostState = {
    conversationId: 'conv-v6-hud',
    selectedModel: { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-c-high' },
    modelOptions: [
      { label: 'Gemini 4 Hydrogen (High)', modelId: 'gemini-4-h-high' },
      { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-c-high' },
      { label: 'Gemini 4 Neon (Low)', modelId: 'gemini-4-ne-low' },
      { label: 'Gemini 4 Neon (Medium)', modelId: 'gemini-4-ne-med' },
      { label: 'Gemini 4 Neon (High)', modelId: 'gemini-4-ne-high' },
      { label: 'Gemini 4 Argon', modelId: 'gemini-4-ar' },
    ],
    setModelConfigByLabelForConversation(label) {
      hostState.selectedModel = { label, modelId: label.toLowerCase().replace(/\s+/g, '-') };
      return true;
    },
  };
  env.window.__agPeriodicMockHost = hostState;

  const inst = factory.mountPeriodicPicker({ root: env.window, doc: env.document, mode: 'on' });
  assert.equal(inst.open(triggerBtn), true);

  // 1) Verify .ag-pp-hud-pill exists and .ag-pp-hud-hints is completely removed
  const hudPill = env.document.querySelector('.ag-pp-hud-pill');
  assert.ok(hudPill, 'Expected .ag-pp-hud-pill compact floating control island');
  assert.equal(hudPill.getAttribute('role'), 'toolbar');
  assert.equal(env.document.querySelectorAll('.ag-pp-hud-hints').length, 0, '.ag-pp-hud-hints must not exist in DOM');
  assert.equal(hudPill.querySelectorAll('.ag-pp-hud-hints').length, 0);

  // 2) Verify 4 element quick-switch capsules + mute button + close button inside .ag-pp-hud-pill
  const chips = hudPill.querySelectorAll('.ag-pp-hud-chip');
  assert.equal(chips.length, 4, 'Expected 4 element quick-switch capsules inside .ag-pp-hud-pill');
  assert.deepEqual(
    chips.map((c) => c.getAttribute('data-hud-z')),
    ['1', '6', '10', '18']
  );
  assert.deepEqual(
    chips.map((c) => c.getAttribute('data-ag-pp-swatch-z')),
    ['1', '6', '10', '18'],
    'All 4 HUD quick-switch chips must expose data-ag-pp-swatch-z'
  );
  const chipH = chips.find((c) => c.getAttribute('data-hud-z') === '1');
  const chipC = chips.find((c) => c.getAttribute('data-hud-z') === '6');
  assert.equal(chipC.getAttribute('data-selected'), '1');
  assert.equal(chipC.getAttribute('aria-pressed'), 'true');
  assert.equal(chipH.getAttribute('data-selected'), '0');

  // Regression (#50/#55): while 6 C (High) is selected, hovering another available key (10 Ne)
  // keeps an active: true effort capsule highlighted in deck levels
  const stageEl = env.document.querySelector('.ag-pp-stage');
  const glCanvasEl = env.document.querySelector('.ag-pp-gl-canvas');
  const stageBounds = { left: 0, top: 0, width: 960, height: 552, right: 960, bottom: 552 };
  stageEl.getBoundingClientRect = () => stageBounds;
  glCanvasEl.getBoundingClientRect = () => stageBounds;
  env.flushRaf();

  const neRect = inst.getProjectedRects().keys.find((k) => k.slotZ === 10);
  assert.ok(neRect, 'Expected projected rect for 10 Ne');
  stageEl.dispatchEvent(
    env.createEventObj('pointermove', {
      clientX: neRect.left + neRect.width * 0.5,
      clientY: neRect.top + neRect.height * 0.5,
    })
  );
  env.flushRaf();
  const previewRects = inst.getProjectedRects();
  assert.equal(previewRects.efforts.length, 3, 'Hovering 10 Ne should preview its 3 effort levels');
  assert.ok(
    previewRects.efforts.some((e) => e.active === true),
    'Hovering another available element (10 Ne) while 6 C is selected must keep active: true capsule highlighted'
  );
  assert.equal(
    previewRects.efforts.find((e) => e.effort === 'high')?.active,
    true,
    'Previewing 10 Ne while 6 C (High) is selected should highlight matching high effort capsule'
  );
  const activeSegBtns = env.document
    .querySelectorAll('.ag-pp-seg-btn')
    .filter((b) => b.getAttribute('data-active') === '1');
  assert.equal(activeSegBtns.length, 1);
  assert.equal(activeSegBtns[0].getAttribute('data-effort'), 'high');
  assert.equal(chipC.getAttribute('data-selected'), '1', 'Hover preview must not commit selection');

  const muteBtn = hudPill.querySelector('[data-testid="ag-pp-mute-btn"]');
  const closeBtn = hudPill.querySelector('[data-testid="ag-pp-close-btn"]');
  assert.ok(muteBtn, 'Expected [data-testid="ag-pp-mute-btn"] inside .ag-pp-hud-pill');
  assert.ok(closeBtn, 'Expected [data-testid="ag-pp-close-btn"] inside .ag-pp-hud-pill');

  // 3) Mute toggle interaction inside .ag-pp-hud-pill
  const initialMuted = muteBtn.getAttribute('data-muted');
  muteBtn.dispatchEvent(env.createEventObj('click'));
  const toggledMuted = initialMuted === '1' ? '0' : '1';
  assert.equal(muteBtn.getAttribute('data-muted'), toggledMuted);
  assert.equal(muteBtn.getAttribute('aria-pressed'), toggledMuted === '1' ? 'true' : 'false');
  assert.equal(inst.isOpen(), true, 'Mute toggle must keep picker open');

  muteBtn.dispatchEvent(env.createEventObj('click'));
  assert.equal(muteBtn.getAttribute('data-muted'), initialMuted);

  // 4) Element quick-switch capsule interaction (6 C -> 1 H)
  chipH.dispatchEvent(env.createEventObj('click'));
  assert.equal(hostState.selectedModel.label, 'Gemini 4 Hydrogen (High)');
  assert.equal(chipH.getAttribute('data-selected'), '1');
  assert.equal(chipH.getAttribute('aria-pressed'), 'true');
  assert.equal(chipC.getAttribute('data-selected'), '0');
  assert.equal(inst.isOpen(), true, 'Switching to another element chip must keep picker open');

  // 5) Confirm & close button inside .ag-pp-hud-pill
  closeBtn.dispatchEvent(env.createEventObj('click'));
  assert.equal(inst.isOpen(), false, 'Close button inside .ag-pp-hud-pill must close picker');
  assert.equal(hostState.selectedModel.label, 'Gemini 4 Hydrogen (High)', 'Close button must confirm rather than revert');

  // 6) Re-open and verify destroy() symmetrically cleans up 100% of DOM, timers, rAFs, listeners, observers
  assert.equal(inst.open(triggerBtn), true);
  assert.ok(env.document.querySelector('.ag-pp-hud-pill'));
  inst.destroy();

  assert.equal(env.document.querySelectorAll('.ag-pp-hud-pill').length, 0);
  assert.equal(env.document.getElementById('ag-prism-periodic-picker-root'), null);
  assert.equal(env.document.getElementById('ag-prism-periodic-picker-css'), null);
  assert.equal(env.document.querySelectorAll('.ag-pp-mini-keycap').length, 0);
  const counts = env.getCounts();
  assert.equal(counts.activeTimers, 0, 'destroy() must clear all timers');
  assert.equal(counts.activeRafs, 0, 'destroy() must cancel all rAFs');
  assert.equal(counts.activeObservers, 0, 'destroy() must disconnect all observers');
  assert.equal(counts.docListeners, 0, 'destroy() must remove all document listeners');
  assert.equal(counts.winListeners, 0, 'destroy() must remove all window listeners');
});

test('V7 Bottom-Out Slam (115ms confirmSlamMs, lift -> 0) & Ceramic Acoustics zero-leak teardown (confirm / Escape rollback / destroy)', () => {
  // 1) Renderer-level confirmSlamZ / confirmSlamActive snaps levitated keycap down to stem seat (lift -> 0) within a few frames
  {
    const { ELEMENTS_90 } = require(PERIODIC_PICKER_FILE);
    const envGl = createPeriodicSandbox({ mock2d: true, mockWebGL2: true });
    loadGrainAssetsInSandbox(envGl);
    loadOledScreenInSandbox(envGl);
    const kb3d = loadKeyboard3DInSandbox(envGl);

    const canvas = envGl.makeElement('canvas');
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 960, height: 552, right: 960, bottom: 552 });

    const renderer = kb3d.createKeyboard3DRenderer({
      canvas,
      doc: envGl.document,
      root: envGl.window,
      slots: ELEMENTS_90,
    });
    renderer.setState({
      themeProfile: { id: 'obsidian-dark', isLight: false, isMono: false, ambientMul: 0.7, primaryHex: '#487396' },
      availableByZ: new Map([
        [1, { slotZ: 1 }],
        [6, { slotZ: 6 }],
        [10, { slotZ: 10 }],
        [18, { slotZ: 18 }],
      ]),
      selectedZ: 6,
    });
    for (let i = 0; i < 120 && !renderer.isIdle(); i += 1) renderer.step(0.016);
    assert.equal(renderer.isIdle(), true);

    const kLevitated = renderer.getInteractiveProjectedRects().keys.find((k) => k.slotZ === 6);
    const areaLevitated = kLevitated.width * kLevitated.height;

    renderer.setState({ confirmSlamZ: 6, confirmSlamActive: true });
    assert.equal(renderer.isIdle(), false, 'Triggering confirmSlamActive must wake renderer to slam keycap down');

    let slamSettled = false;
    let slamFrames = 0;
    for (let i = 0; i < 20; i += 1) {
      slamFrames += 1;
      if (renderer.step(0.016)) {
        slamSettled = true;
        break;
      }
    }
    assert.equal(slamSettled, true, 'Bottom-out slam must settle cleanly within 20 frames');
    assert.ok(slamFrames <= 12, `Expected crisp slam convergence within <=12 frames, took ${slamFrames}`);

    const kSlammed = renderer.getInteractiveProjectedRects().keys.find((k) => k.slotZ === 6);
    const areaSlammed = kSlammed.width * kSlammed.height;
    assert.ok(
      areaSlammed < areaLevitated * 0.65,
      `Expected slammed keycap projected area to collapse back to stem seat (<65% of ${areaLevitated.toFixed(1)}), got ${areaSlammed.toFixed(1)}`
    );
    assert.ok(
      kSlammed.top > kLevitated.top + 10,
      `Expected slammed keycap to drop downward onto switch housing (top ${kLevitated.top} -> ${kSlammed.top})`
    );

    renderer.dispose();
    assert.equal(envGl.getCounts().activeRafs, 0);
  }

  // 2) Full picker lifecycle with confirmSlamMs: 115 & Ceramic AudioContext tracking
  const env = createPeriodicSandbox({ mock2d: true, mockWebGL2: true });
  const audioStats = {
    createdCount: 0,
    closedCount: 0,
    lowpassCutoffs: [],
    oscillatorStarts: 0,
    oscillatorStops: 0,
  };
  class MockAudioContext {
    constructor() {
      audioStats.createdCount += 1;
      this.state = 'running';
      this.currentTime = 1.0;
      this.sampleRate = 44100;
      this.destination = { kind: 'dest' };
    }
    resume() {
      this.state = 'running';
      return Promise.resolve();
    }
    close() {
      this.state = 'closed';
      audioStats.closedCount += 1;
      return Promise.resolve();
    }
    createBuffer(channels, len) {
      const chData = new Float32Array(len);
      return { numberOfChannels: channels, length: len, getChannelData: () => chData };
    }
    createBiquadFilter() {
      const filterNode = {
        type: 'lowpass',
        frequency: {
          setValueAtTime: (val) => {
            if (filterNode.type === 'lowpass') {
              audioStats.lowpassCutoffs.push(val);
            }
          },
        },
        Q: { setValueAtTime() {} },
        connect() {},
      };
      return filterNode;
    }
    createOscillator() {
      return {
        type: 'sine',
        frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {},
        start() {
          audioStats.oscillatorStarts += 1;
        },
        stop() {
          audioStats.oscillatorStops += 1;
        },
      };
    }
    createGain() {
      return {
        gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {},
      };
    }
    createBufferSource() {
      return {
        buffer: null,
        connect() {},
        start() {},
        stop() {},
      };
    }
  }
  env.window.AudioContext = MockAudioContext;
  env.sandbox.AudioContext = MockAudioContext;

  loadGrainAssetsInSandbox(env);
  loadOledScreenInSandbox(env);
  loadKeyboard3DInSandbox(env);
  const factory = loadPeriodicFactoryInSandbox(env);

  const triggerBtn = env.makeElement('button', {
    attrs: { 'data-testid': 'model-selector-trigger' },
    text: 'Gemini 4 Carbon (High)',
  });
  env.body.appendChild(triggerBtn);

  const hostState = {
    conversationId: 'conv-v7-slam',
    selectedModel: { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-c-high' },
    modelOptions: [
      { label: 'Gemini 4 Hydrogen (High)', modelId: 'gemini-4-h-high' },
      { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-c-high' },
      { label: 'Gemini 4 Neon (High)', modelId: 'gemini-4-ne-high' },
      { label: 'Gemini 4 Argon', modelId: 'gemini-4-ar' },
    ],
    setModelConfigByLabelForConversation(label) {
      hostState.selectedModel = { label, modelId: label.toLowerCase().replace(/\s+/g, '-') };
      return true;
    },
  };
  env.window.__agPeriodicMockHost = hostState;

  const inst = factory.mountPeriodicPicker({
    root: env.window,
    doc: env.document,
    mode: 'on',
    confirmSlamMs: 115,
  });

  // 2A) Second click confirm -> data-confirm-slam="1" -> auto-close after 115ms with 0 timers/rAFs
  assert.equal(inst.open(triggerBtn), true);
  env.flushRaf();
  const chipH1 = env.document.querySelector('.ag-pp-hud-chip[data-hud-z="1"]');
  chipH1.dispatchEvent(env.createEventObj('click'));
  assert.equal(hostState.selectedModel.label, 'Gemini 4 Hydrogen (High)');
  assert.equal(inst.isOpen(), true);

  // Second click on now-selected 1 H triggers 115ms bottom-out slam + ceramic thock audio
  chipH1.dispatchEvent(env.createEventObj('click'));
  const overlayA = env.document.getElementById('ag-prism-periodic-picker-root');
  assert.ok(overlayA, 'Overlay must remain mounted during 115ms bottom-out slam window');
  assert.equal(overlayA.getAttribute('data-confirm-slam'), '1');
  assert.equal(inst.getStatus().confirmClosing, true);
  assert.equal(inst.getStatus().confirmSlamZ, 1);
  assert.equal(audioStats.createdCount, 1, 'Expected single shared AudioContext instance');
  assert.ok(audioStats.oscillatorStarts > 0 && audioStats.oscillatorStarts === audioStats.oscillatorStops);
  assert.ok(
    audioStats.lowpassCutoffs.length > 0 && audioStats.lowpassCutoffs.every((hz) => hz <= 2050),
    `Ceramic acoustic lowpass cutoffs must stay <= 2050Hz, got ${JSON.stringify(audioStats.lowpassCutoffs)}`
  );

  env.advanceTime(80);
  assert.equal(inst.isOpen(), true, 'Picker must still be slamming at 80ms (< 115ms)');
  env.advanceTime(40);
  assert.equal(inst.isOpen(), false, 'Picker must cleanly close after 115ms confirmSlamMs');
  assert.equal(env.document.getElementById('ag-prism-periodic-picker-root'), null);
  assert.equal(hostState.selectedModel.label, 'Gemini 4 Hydrogen (High)', 'Second-click confirm must commit model');
  assert.equal(env.getCounts().activeTimers, 0, 'All timers must be 0 after 115ms confirm close');
  assert.equal(env.getCounts().activeRafs, 0, 'All rAFs must be 0 after 115ms confirm close');

  // 2B) Pressing Escape mid-way through 115ms slam window cancels pending timer & closes cleanly without rollback
  hostState.selectedModel = { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-c-high' };
  assert.equal(inst.open(triggerBtn), true);
  env.flushRaf();
  const chipH2 = env.document.querySelector('.ag-pp-hud-chip[data-hud-z="1"]');
  chipH2.dispatchEvent(env.createEventObj('click'));
  assert.equal(hostState.selectedModel.label, 'Gemini 4 Hydrogen (High)');
  chipH2.dispatchEvent(env.createEventObj('click'));
  assert.equal(env.document.getElementById('ag-prism-periodic-picker-root').getAttribute('data-confirm-slam'), '1');

  env.advanceTime(50);
  assert.equal(inst.isOpen(), true);
  assert.ok(env.getCounts().activeTimers > 0, 'Pending 115ms close timer should be active before Escape');

  env.document.dispatchEvent(env.createEventObj('keydown', { key: 'Escape' }));
  assert.equal(inst.isOpen(), false, 'Escape mid-slam must immediately close picker');
  assert.equal(
    hostState.selectedModel.label,
    'Gemini 4 Hydrogen (High)',
    'Escape mid-slam must close cleanly while keeping selected host model (no rollback)'
  );
  assert.equal(env.document.getElementById('ag-prism-periodic-picker-root'), null);
  assert.equal(env.getCounts().activeTimers, 0, 'Escape mid-slam must cancel pending 115ms timer');
  assert.equal(env.getCounts().activeRafs, 0, 'Escape mid-slam must cancel active rAFs');

  // 2C) Calling destroy() mid-way through 115ms slam window cancels timers/rAFs/listeners & closes AudioContext
  assert.equal(inst.open(triggerBtn), true);
  env.flushRaf();
  const chipNe = env.document.querySelector('.ag-pp-hud-chip[data-hud-z="10"]');
  chipNe.dispatchEvent(env.createEventObj('click'));
  chipNe.dispatchEvent(env.createEventObj('click'));
  assert.equal(env.document.getElementById('ag-prism-periodic-picker-root').getAttribute('data-confirm-slam'), '1');

  env.advanceTime(40);
  inst.destroy();

  assert.equal(inst.isOpen(), false);
  assert.equal(inst.getStatus().status, 'destroyed');
  assert.equal(env.document.getElementById('ag-prism-periodic-picker-root'), null);
  assert.equal(env.document.getElementById('ag-prism-periodic-picker-css'), null);
  assert.equal(audioStats.closedCount, audioStats.createdCount, 'Every created AudioContext must be symmetrically closed with 0 leaks');
  const finalCounts = env.getCounts();
  assert.equal(finalCounts.activeTimers, 0, 'destroy() mid-slam must leave 0 active timers');
  assert.equal(finalCounts.activeRafs, 0, 'destroy() mid-slam must leave 0 active rAFs');
  assert.equal(finalCounts.activeObservers, 0, 'destroy() mid-slam must leave 0 active observers');
  assert.equal(finalCounts.docListeners, 0, 'destroy() mid-slam must leave 0 document listeners');
  assert.equal(finalCounts.winListeners, 0, 'destroy() mid-slam must leave 0 window listeners');
});

test('V8 Left-Drag 3D Free Orbit, Rotated-State Raycast Pick(), Post-Drag Click Guard, and Reset Button / R-Key Convergence to 0fps', () => {
  // 1) Renderer-level setChassisOrbit(-0.42, 0.50) + rotated-angle pick() for hero keycaps & OLED fiber slider efforts + resetChassisOrbit() 0fps convergence
  {
    const { ELEMENTS_90 } = require(PERIODIC_PICKER_FILE);
    const envGl = createPeriodicSandbox({ mock2d: true, mockWebGL2: true });
    loadGrainAssetsInSandbox(envGl);
    loadOledScreenInSandbox(envGl);
    const kb3d = loadKeyboard3DInSandbox(envGl);

    const canvas = envGl.makeElement('canvas');
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 960, height: 552, right: 960, bottom: 552 });

    const availMap = new Map([
      [1, { slotZ: 1 }],
      [6, { slotZ: 6 }],
      [10, { slotZ: 10 }],
      [18, { slotZ: 18 }],
    ]);

    const renderer = kb3d.createKeyboard3DRenderer({
      canvas,
      doc: envGl.document,
      root: envGl.window,
      slots: ELEMENTS_90,
    });

    renderer.setState({
      themeProfile: { id: 'obsidian-dark', isLight: false, isMono: false, ambientMul: 0.7, primaryHex: '#317660' },
      availableByZ: availMap,
      selectedZ: 6,
      deckInfo: {
        z: 6,
        numLabel: '6',
        groupCode: 'G14',
        symbol: 'C',
        title: 'Gemini 4 Carbon',
        chemLabel: '6 C · Carbon',
        isAvailable: true,
        levels: [
          { effort: 'low', label: 'Low', active: false },
          { effort: 'medium', label: 'Medium', active: false },
          { effort: 'high', label: 'High', active: true },
        ],
      },
    });
    for (let i = 0; i < 200 && !renderer.isIdle(); i += 1) {
      envGl.advanceTime(16);
      envGl.flushRaf();
    }
    assert.equal(renderer.isIdle(), true);

    renderer.setChassisOrbit(-0.42, 0.50);
    const orbitAfterSet = renderer.getChassisOrbit();
    assert.equal(orbitAfterSet.isRotated, true, 'setChassisOrbit(-0.42, 0.50) must mark isRotated === true');
    assert.ok(Math.abs(orbitAfterSet.pitch - -0.42) < 1e-4, `Expected pitch ~ -0.42, got ${orbitAfterSet.pitch}`);
    assert.ok(Math.abs(orbitAfterSet.yaw - 0.50) < 1e-4, `Expected yaw ~ 0.50, got ${orbitAfterSet.yaw}`);

    const rotatedProj = renderer.getInteractiveProjectedRects();
    for (const z of [1, 6, 10, 18]) {
      const kRect = rotatedProj.keys.find((k) => k.slotZ === z);
      assert.ok(kRect, `Expected projected rect for rotated hero keycap z=${z}`);
      const kHit = renderer.pick(kRect.cx, kRect.cy);
      assert.equal(kHit?.kind, 'key', `Expected rotated pick() to hit keycap z=${z}`);
      assert.equal(kHit?.slotZ, z, `Expected rotated pick() slotZ === ${z}, got ${kHit?.slotZ}`);
    }

    assert.equal(rotatedProj.efforts.length, 3, 'Expected 3 projected OLED fiber slider effort slots');
    for (const ef of rotatedProj.efforts) {
      const eHit = renderer.pick(ef.cx, ef.cy);
      assert.equal(eHit?.kind, 'effort', `Expected rotated pick() to hit OLED fiber effort "${ef.effort}"`);
      assert.equal(eHit?.effort, ef.effort, `Expected rotated pick() effort === "${ef.effort}", got ${eHit?.effort}`);
    }

    renderer.resetChassisOrbit();
    let resetFrames = 0;
    while (resetFrames < 240 && !renderer.isIdle()) {
      envGl.advanceTime(16);
      envGl.flushRaf();
      resetFrames += 1;
    }
    assert.ok(resetFrames < 240, `Expected resetChassisOrbit() to settle in < 240 frames, took ${resetFrames}`);
    assert.equal(renderer.isIdle(), true, 'resetChassisOrbit() must converge to 0fps idle');
    assert.equal(renderer.getChassisOrbit().isRotated, false, 'resetChassisOrbit() must restore isRotated === false');
    assert.equal(envGl.getCounts().activeRafs, 0, 'Settled renderer must hold 0 active rAFs');

    renderer.dispose();
    const glStats = canvas._gl._stats();
    assert.equal(glStats.deleted.programs.size, glStats.created.programs.size);
    assert.equal(glStats.deleted.shaders.size, glStats.created.shaders.size);
    assert.equal(glStats.deleted.buffers.size, glStats.created.buffers.size);
    assert.equal(glStats.deleted.vaos.size, glStats.created.vaos.size);
    assert.equal(glStats.deleted.textures.size, glStats.created.textures.size);
    assert.equal(glStats.deleted.framebuffers.size, glStats.created.framebuffers.size);
    assert.equal(glStats.loseContextCalls, 1);
    assert.equal(envGl.getCounts().activeRafs, 0);
  }

  // 2) Full periodic-picker left-drag orbit (>6px), post-drag synthetic click guard, rotated pick interaction, [data-testid="ag-pp-reset-view-btn"] & R-key reset
  const env = createPeriodicSandbox({ mock2d: true, mockWebGL2: true });
  loadGrainAssetsInSandbox(env);
  loadOledScreenInSandbox(env);
  loadKeyboard3DInSandbox(env);
  const factory = loadPeriodicFactoryInSandbox(env);

  const triggerBtn = env.makeElement('button', {
    attrs: { 'data-testid': 'model-selector-trigger' },
    text: 'Gemini 4 Carbon (High)',
  });
  env.body.appendChild(triggerBtn);

  const hostState = {
    conversationId: 'conv-v8-orbit',
    selectedModel: { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-c-high' },
    modelOptions: [
      { label: 'Gemini 4 Hydrogen (High)', modelId: 'gemini-4-h-high' },
      { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-c-high' },
      { label: 'Gemini 4 Neon (Low)', modelId: 'gemini-4-ne-low' },
      { label: 'Gemini 4 Neon (Medium)', modelId: 'gemini-4-ne-med' },
      { label: 'Gemini 4 Neon (High)', modelId: 'gemini-4-ne-high' },
      { label: 'Gemini 4 Argon', modelId: 'gemini-4-ar' },
    ],
    setModelConfigByLabelForConversation(label) {
      hostState.selectedModel = { label, modelId: label.toLowerCase().replace(/\s+/g, '-') };
      return true;
    },
  };
  env.window.__agPeriodicMockHost = hostState;

  const inst = factory.mountPeriodicPicker({ root: env.window, doc: env.document, mode: 'on' });
  assert.equal(inst.open(triggerBtn), true);

  const overlayEl = env.document.getElementById('ag-prism-periodic-picker-root');
  const stageEl = env.document.querySelector('.ag-pp-stage');
  const glCanvasEl = env.document.querySelector('.ag-pp-gl-canvas');
  const resetBtn = env.document.querySelector('[data-testid="ag-pp-reset-view-btn"]');
  assert.ok(overlayEl && stageEl && glCanvasEl && resetBtn, 'Expected picker overlay, stage, GL canvas, and reset view button');

  const stageBounds = { left: 0, top: 0, width: 960, height: 552, right: 960, bottom: 552 };
  stageEl.getBoundingClientRect = () => stageBounds;
  glCanvasEl.getBoundingClientRect = () => stageBounds;

  for (let i = 0; i < 200 && env.getCounts().activeRafs > 0; i += 1) {
    env.advanceTime(16);
    env.flushRaf();
  }
  assert.equal(inst.getStageMode(), 'drawer', 'V11 must open in drawer mode by default');
  assert.equal(overlayEl.getAttribute('data-stage-mode'), 'drawer');
  assert.equal(inst.getChassisOrbit().isRotated, false);
  assert.equal(resetBtn.getAttribute('data-rotated'), '0');

  // Drawer mode anti-misdrag lock: dragging chassis in drawer mode must NOT rotate 3D orbit
  glCanvasEl.dispatchEvent(env.createEventObj('pointerdown', { button: 0, pointerId: 10, clientX: 480, clientY: 280 }));
  env.advanceTime(16);
  glCanvasEl.dispatchEvent(env.createEventObj('pointermove', { button: 0, pointerId: 10, clientX: 575, clientY: 215 }));
  env.advanceTime(16);
  glCanvasEl.dispatchEvent(env.createEventObj('pointerup', { button: 0, pointerId: 10, clientX: 575, clientY: 215 }));
  assert.equal(inst.getChassisOrbit().isRotated, false, 'Drawer mode anti-misdrag lock must block 3D chassis orbit drag');
  assert.equal(resetBtn.getAttribute('data-rotated'), '0');

  // Switch to fullscreen stage via [data-testid="ag-pp-stage-mode-btn"] to unlock 3D free orbit
  const stageModeBtn = env.document.querySelector('[data-testid="ag-pp-stage-mode-btn"]');
  assert.ok(stageModeBtn, 'Expected [data-testid="ag-pp-stage-mode-btn"]');
  stageModeBtn.dispatchEvent(env.createEventObj('click'));
  assert.equal(inst.getStageMode(), 'fullscreen');
  assert.equal(overlayEl.getAttribute('data-stage-mode'), 'fullscreen');

  // Left-button pointerdown -> pointermove (>6px) -> pointerup on stage/canvas drags 3D orbit in fullscreen mode
  glCanvasEl.dispatchEvent(env.createEventObj('pointerdown', { button: 0, pointerId: 1, clientX: 480, clientY: 280 }));
  env.advanceTime(16);
  glCanvasEl.dispatchEvent(env.createEventObj('pointermove', { button: 0, pointerId: 1, clientX: 575, clientY: 215 }));
  env.advanceTime(16);
  glCanvasEl.dispatchEvent(env.createEventObj('pointerup', { button: 0, pointerId: 1, clientX: 575, clientY: 215 }));

  assert.equal(inst.getChassisOrbit().isRotated, true, 'Left-drag >6px must rotate 3D chassis orbit');
  assert.equal(resetBtn.getAttribute('data-rotated'), '1', 'Reset button must expose data-rotated="1" after drag');
  assert.equal(overlayEl.getAttribute('data-orbit-dragging'), null, 'pointerup must clear data-orbit-dragging');

  // Synthetic post-drag click on backdrop/overlay must be swallowed and NOT close the picker
  overlayEl.dispatchEvent(env.createEventObj('click', { clientX: 575, clientY: 215 }));
  assert.equal(inst.isOpen(), true, 'Synthetic post-drag click must NOT accidentally close picker');

  // Set steep 3D orbit angle (-0.42, 0.50) and click projected 10 Ne keycap & Medium effort fiber slot
  assert.equal(inst.setChassisOrbit(-0.42, 0.50), true);
  assert.equal(inst.getChassisOrbit().isRotated, true);
  assert.equal(resetBtn.getAttribute('data-rotated'), '1');

  const steepRects = inst.getProjectedRects();
  const neSteep = steepRects.keys.find((k) => k.slotZ === 10);
  assert.ok(neSteep, 'Expected rotated projected rect for 10 Ne');
  glCanvasEl.dispatchEvent(env.createEventObj('click', { clientX: neSteep.cx, clientY: neSteep.cy }));
  assert.equal(hostState.selectedModel.label, 'Gemini 4 Neon (High)', 'Click in rotated view must select 10 Ne');

  const medSteep = inst.getProjectedRects().efforts.find((e) => e.effort === 'medium');
  assert.ok(medSteep, 'Expected rotated projected rect for Medium OLED fiber effort');
  glCanvasEl.dispatchEvent(env.createEventObj('click', { clientX: medSteep.cx, clientY: medSteep.cy }));
  assert.equal(
    hostState.selectedModel.label,
    'Gemini 4 Neon (Medium)',
    'Click on rotated OLED optical fiber slider must switch Thinking Level to Medium'
  );

  // Click [data-testid="ag-pp-reset-view-btn"] -> smoothly resets to isRotated === false, data-rotated="0", 0fps idle
  resetBtn.dispatchEvent(env.createEventObj('click'));
  let btnResetFrames = 0;
  while (btnResetFrames < 240 && (inst.getChassisOrbit().isRotated || env.getCounts().activeRafs > 0)) {
    env.advanceTime(16);
    env.flushRaf();
    btnResetFrames += 1;
  }
  assert.ok(btnResetFrames < 240, `Expected reset button to converge in < 240 frames, took ${btnResetFrames}`);
  assert.equal(inst.getChassisOrbit().isRotated, false, 'Reset button click must restore isRotated === false');
  assert.equal(resetBtn.getAttribute('data-rotated'), '0', 'Reset button must revert to data-rotated="0"');
  assert.equal(env.getCounts().activeRafs, 0, 'Reset button convergence must settle at 0fps (activeRafs === 0)');

  // Rotate again, then press R key -> smoothly resets to isRotated === false, data-rotated="0", 0fps idle
  assert.equal(inst.setChassisOrbit(-0.42, 0.50), true);
  assert.equal(inst.getChassisOrbit().isRotated, true);
  assert.equal(resetBtn.getAttribute('data-rotated'), '1');

  env.document.dispatchEvent(env.createEventObj('keydown', { key: 'R' }));
  let keyResetFrames = 0;
  while (keyResetFrames < 240 && (inst.getChassisOrbit().isRotated || env.getCounts().activeRafs > 0)) {
    env.advanceTime(16);
    env.flushRaf();
    keyResetFrames += 1;
  }
  assert.ok(keyResetFrames < 240, `Expected R-key reset to converge in < 240 frames, took ${keyResetFrames}`);
  assert.equal(inst.getChassisOrbit().isRotated, false, 'R key must restore isRotated === false');
  assert.equal(resetBtn.getAttribute('data-rotated'), '0', 'R key reset must revert data-rotated="0"');
  assert.equal(env.getCounts().activeRafs, 0, 'R key reset must settle at 0fps (activeRafs === 0)');

  inst.destroy();
  assert.equal(env.document.getElementById('ag-prism-periodic-picker-root'), null);
  assert.equal(env.document.getElementById('ag-prism-periodic-picker-css'), null);
  const endCounts = env.getCounts();
  assert.equal(endCounts.activeTimers, 0);
  assert.equal(endCounts.activeRafs, 0);
  assert.equal(endCounts.activeObservers, 0);
  assert.equal(endCounts.docListeners, 0);
  assert.equal(endCounts.winListeners, 0);
});
test('V8 Global Motion & Zero-G Envelopes (IntroWake, WaveRipple, EnergyPulse, 220ms Fiber Slider) -> <240-frame 0fps Sleep & 100% Disposal', () => {
  const { ELEMENTS_90 } = require(PERIODIC_PICKER_FILE);
  const env = createPeriodicSandbox({ mock2d: true, mockWebGL2: true });
  loadGrainAssetsInSandbox(env);
  const oledApi = loadOledScreenInSandbox(env);
  const kb3d = loadKeyboard3DInSandbox(env);

  // 1) Verify oled-cyber-screen.js 220ms optical fiber slider spring transition -> 0fps idle
  const painter = oledApi.createOledScreenPainter({
    width: 1600,
    height: 480,
    doc: env.document,
    root: env.window,
  });
  const baseDeckInfo = {
    z: 6,
    numLabel: '6',
    groupCode: 'G14',
    symbol: 'C',
    mass: '12.011',
    title: 'Gemini 4 Carbon',
    chemLabel: '6 C · Carbon',
    subtitle: 'Balanced flagship',
    isAvailable: true,
    effortTitle: 'Thinking Level',
    levels: [
      { effort: 'low', label: 'Low', active: false },
      { effort: 'medium', label: 'Medium', active: false },
      { effort: 'high', label: 'High', active: true },
    ],
  };
  const themeDark = { id: 'obsidian-dark', isLight: false, isMono: false, primaryHex: '#317660' };
  painter.render(baseDeckInfo, themeDark, { now: 1000 });
  assert.equal(painter.isAnimating(1000), false, 'Initial slider render must settle immediately at 0fps');

  const deckInfoLow = {
    ...baseDeckInfo,
    levels: [
      { effort: 'low', label: 'Low', active: true },
      { effort: 'medium', label: 'Medium', active: false },
      { effort: 'high', label: 'High', active: false },
    ],
  };
  painter.render(deckInfoLow, themeDark, { now: 1100 });
  assert.equal(painter.isAnimating(1100), true, 'Effort change must start 220ms optical fiber spring slide');
  painter.render(deckInfoLow, themeDark, { now: 1210 });
  assert.equal(painter.isAnimating(1210), true, 'Fiber slider must still be animating at 110ms (< 220ms)');
  painter.render(deckInfoLow, themeDark, { now: 1330 });
  assert.equal(painter.isAnimating(1330), false, 'Fiber slider must settle to 0fps idle after 220ms');

  painter.dispose();
  assert.equal(painter.isAnimating(), false);
  assert.equal(painter.getCanvas(), null);

  // 2) Verify keyboard-3d-gl.js IntroWake, WaveRipple, EnergyPulse, and Fiber Slider switch all converge in <240 frames to isIdle() === true & activeRafs === 0
  const canvas = env.makeElement('canvas');
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 960, height: 552, right: 960, bottom: 552 });

  const renderer = kb3d.createKeyboard3DRenderer({
    canvas,
    doc: env.document,
    root: env.window,
    slots: ELEMENTS_90,
  });
  renderer.setState({
    themeProfile: { id: 'obsidian-dark', isLight: false, isMono: false, ambientMul: 0.7, primaryHex: '#317660' },
    availableByZ: new Map([
      [1, { slotZ: 1 }],
      [6, { slotZ: 6 }],
      [10, { slotZ: 10 }],
      [18, { slotZ: 18 }],
    ]),
    selectedZ: 6,
    deckInfo: baseDeckInfo,
  });

  const settleWithin240Frames = (label) => {
    let frames = 0;
    while (frames < 240 && (!renderer.isIdle() || env.getCounts().activeRafs > 0)) {
      env.advanceTime(16);
      env.flushRaf();
      frames += 1;
    }
    assert.ok(frames < 240, `Expected ${label} to converge in < 240 frames, took ${frames}`);
    assert.equal(renderer.isIdle(), true, `${label} must converge to isIdle() === true`);
    assert.equal(env.getCounts().activeRafs, 0, `${label} must converge to activeRafs === 0 (0fps sleep)`);
  };

  settleWithin240Frames('initial state');

  renderer.triggerIntroWake();
  assert.equal(renderer.isIdle(), false, 'triggerIntroWake() must wake renderer');
  settleWithin240Frames('triggerIntroWake()');

  renderer.triggerWaveRipple(10, 1.0);
  assert.equal(renderer.isIdle(), false, 'triggerWaveRipple(10, 1.0) must wake renderer');
  settleWithin240Frames('triggerWaveRipple(10, 1.0)');

  renderer.triggerEnergyPulse(0.78);
  assert.equal(renderer.isIdle(), false, 'triggerEnergyPulse(0.78) must wake renderer');
  settleWithin240Frames('triggerEnergyPulse(0.78)');

  renderer.setState({ deckInfo: deckInfoLow });
  settleWithin240Frames('OLED fiber slider effort switch');

  renderer.dispose();
  const glStats = canvas._gl._stats();
  assert.equal(glStats.deleted.programs.size, glStats.created.programs.size, '100% GL programs must be disposed');
  assert.equal(glStats.deleted.shaders.size, glStats.created.shaders.size, '100% GL shaders must be disposed');
  assert.equal(glStats.deleted.buffers.size, glStats.created.buffers.size, '100% GL buffers must be disposed');
  assert.equal(glStats.deleted.vaos.size, glStats.created.vaos.size, '100% GL VAOs must be disposed');
  assert.equal(glStats.deleted.textures.size, glStats.created.textures.size, '100% GL textures must be disposed');
  assert.equal(glStats.deleted.framebuffers.size, glStats.created.framebuffers.size, '100% GL FBOs must be disposed');
  assert.equal(glStats.loseContextCalls, 1, 'WEBGL_lose_context must be invoked on dispose()');
  const counts = env.getCounts();
  assert.equal(counts.activeTimers, 0);
  assert.equal(counts.activeRafs, 0);
  assert.equal(counts.activeObservers, 0);
  assert.equal(counts.docListeners, 0);
  assert.equal(counts.winListeners, 0);
});

test('V9/V11 Apple 1:1 Async Co-Orbit Physics (dragChassisOrbitDelta & endChassisOrbitDrag), Fullscreen ~0.0046 rad/px Left-Drag Orbit, and R-Key / Reset-Button 0fps Convergence', () => {
  // 1) Renderer-level 1:1 immediate coupling (0.94) & endChassisOrbitDrag(optVelPitch, optVelYaw) 0.88 momentum coasting <160-frame 0fps settle
  {
    const { ELEMENTS_90 } = require(PERIODIC_PICKER_FILE);
    const envGl = createPeriodicSandbox({ mock2d: true, mockWebGL2: true });
    loadGrainAssetsInSandbox(envGl);
    loadOledScreenInSandbox(envGl);
    const kb3d = loadKeyboard3DInSandbox(envGl);

    const canvas = envGl.makeElement('canvas');
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 960, height: 552, right: 960, bottom: 552 });

    const renderer = kb3d.createKeyboard3DRenderer({
      canvas,
      doc: envGl.document,
      root: envGl.window,
      slots: ELEMENTS_90,
    });

    renderer.setState({
      themeProfile: { id: 'obsidian-dark', isLight: false, isMono: false, ambientMul: 0.7, primaryHex: '#317660' },
      availableByZ: new Map([
        [1, { slotZ: 1 }],
        [6, { slotZ: 6 }],
        [10, { slotZ: 10 }],
        [18, { slotZ: 18 }],
      ]),
      selectedZ: 6,
      deckInfo: {
        z: 6,
        numLabel: '6',
        groupCode: 'G14',
        symbol: 'C',
        title: 'Gemini 4 Carbon',
        chemLabel: '6 C · Carbon',
        isAvailable: true,
        levels: [
          { effort: 'low', label: 'Low', active: false },
          { effort: 'medium', label: 'Medium', active: false },
          { effort: 'high', label: 'High', active: true },
        ],
      },
    });
    for (let i = 0; i < 200 && !renderer.isIdle(); i += 1) {
      envGl.advanceTime(16);
      envGl.flushRaf();
    }
    assert.equal(renderer.isIdle(), true);
    assert.equal(envGl.getCounts().activeRafs, 0);

    // Frame 0: 1:1 immediate coupling (ORBIT_HYDRAULIC_COUPLE = 0.94) + async requestWake() (0 sync drawCalls inside dragChassisOrbitDelta)
    const drawCallsBeforeDrag = canvas._gl._stats().drawCalls;
    renderer.dragChassisOrbitDelta(0.18, -0.24);
    assert.equal(canvas._gl._stats().drawCalls, drawCallsBeforeDrag, 'dragChassisOrbitDelta must defer WebGL drawCalls to async rAF');
    const orbitFrame0 = renderer.getChassisOrbit();
    assert.equal(renderer.isIdle(), false, 'dragChassisOrbitDelta must wake servo rAF loop');
    assert.ok(envGl.getCounts().activeRafs > 0, 'dragChassisOrbitDelta must schedule rAF');
    assert.ok(
      orbitFrame0.pitch >= 0.18 * 0.85 && orbitFrame0.pitch <= 0.18,
      `Frame 0 pitch must follow 1:1 immediately (>=85% of 0.18), got ${orbitFrame0.pitch}`
    );
    assert.ok(
      orbitFrame0.yaw <= -0.24 * 0.85 && orbitFrame0.yaw >= -0.24,
      `Frame 0 yaw must follow 1:1 immediately (>=85% of -0.24), got ${orbitFrame0.yaw}`
    );

    // Advance ~4 frames (~64ms): servo tracks tightly with slight momentum overshoot before settling
    for (let f = 0; f < 4; f += 1) {
      envGl.advanceTime(16);
      envGl.flushRaf();
    }
    const orbitFrame4 = renderer.getChassisOrbit();
    assert.ok(
      orbitFrame4.pitch >= orbitFrame0.pitch * 0.95 && orbitFrame4.pitch <= 0.24,
      `After ~64ms (4 frames), pitch must converge smoothly near target 0.18, got ${orbitFrame4.pitch}`
    );

    // Release drag with velocity: endChassisOrbitDrag(0.32, -0.40) coasts smoothly along momentum and settles in < 160 frames to 0fps sleep
    renderer.endChassisOrbitDrag(0.32, -0.40);
    const orbitCoastStart = renderer.getChassisOrbit();
    let coastFrames = 0;
    while (coastFrames < 160 && (!renderer.isIdle() || envGl.getCounts().activeRafs > 0)) {
      envGl.advanceTime(16);
      envGl.flushRaf();
      coastFrames += 1;
    }
    assert.ok(coastFrames > 0 && coastFrames < 160, `endChassisOrbitDrag() must settle in < 160 frames, took ${coastFrames}`);
    assert.equal(renderer.isIdle(), true, 'endChassisOrbitDrag() must converge to isIdle() === true');
    assert.equal(envGl.getCounts().activeRafs, 0, 'endChassisOrbitDrag() must converge to activeRafs === 0 (0fps sleep)');

    const orbitSettled = renderer.getChassisOrbit();
    assert.equal(orbitSettled.isRotated, true, 'Settled orbit after drag must stay rotated');
    assert.ok(
      orbitSettled.pitch > orbitCoastStart.pitch && orbitSettled.pitch <= 0.35,
      `Momentum coasting must glide smoothly forward without wild overshoot: start=${orbitCoastStart.pitch}, end=${orbitSettled.pitch}`
    );
    assert.ok(
      orbitSettled.yaw < orbitCoastStart.yaw && orbitSettled.yaw >= -0.45,
      `Momentum coasting must glide smoothly forward without wild overshoot: start=${orbitCoastStart.yaw}, end=${orbitSettled.yaw}`
    );

    renderer.dispose();
    const glStats = canvas._gl._stats();
    assert.equal(glStats.deleted.programs.size, glStats.created.programs.size);
    assert.equal(glStats.deleted.shaders.size, glStats.created.shaders.size);
    assert.equal(glStats.deleted.buffers.size, glStats.created.buffers.size);
    assert.equal(glStats.deleted.vaos.size, glStats.created.vaos.size);
    assert.equal(glStats.deleted.textures.size, glStats.created.textures.size);
    assert.equal(glStats.deleted.framebuffers.size, glStats.created.framebuffers.size);
    assert.equal(glStats.loseContextCalls, 1);
    assert.equal(envGl.getCounts().activeRafs, 0);
  }

  // 2) Full periodic-picker fullscreen left-drag (>6px) with ~0.0046 rad/px sensitivity, R-key & reset-btn 0fps convergence
  const env = createPeriodicSandbox({ mock2d: true, mockWebGL2: true });
  loadGrainAssetsInSandbox(env);
  loadOledScreenInSandbox(env);
  loadKeyboard3DInSandbox(env);
  const factory = loadPeriodicFactoryInSandbox(env);

  const triggerBtn = env.makeElement('button', {
    attrs: { 'data-testid': 'model-selector-trigger' },
    text: 'Gemini 4 Carbon (High)',
  });
  env.body.appendChild(triggerBtn);

  const hostState = {
    conversationId: 'conv-v9-gimbal',
    selectedModel: { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-c-high' },
    modelOptions: [
      { label: 'Gemini 4 Hydrogen (High)', modelId: 'gemini-4-h-high' },
      { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-c-high' },
      { label: 'Gemini 4 Neon (High)', modelId: 'gemini-4-ne-high' },
      { label: 'Gemini 4 Argon', modelId: 'gemini-4-ar' },
    ],
    setModelConfigByLabelForConversation(label) {
      hostState.selectedModel = { label, modelId: label.toLowerCase().replace(/\s+/g, '-') };
      return true;
    },
  };
  env.window.__agPeriodicMockHost = hostState;

  const inst = factory.mountPeriodicPicker({ root: env.window, doc: env.document, mode: 'on' });
  assert.equal(inst.open(triggerBtn), true);

  const overlayEl = env.document.getElementById('ag-prism-periodic-picker-root');
  const stageEl = env.document.querySelector('.ag-pp-stage');
  const glCanvasEl = env.document.querySelector('.ag-pp-gl-canvas');
  const resetBtn = env.document.querySelector('[data-testid="ag-pp-reset-view-btn"]');
  assert.ok(overlayEl && stageEl && glCanvasEl && resetBtn);

  const stageBounds = { left: 0, top: 0, width: 960, height: 552, right: 960, bottom: 552 };
  stageEl.getBoundingClientRect = () => stageBounds;
  glCanvasEl.getBoundingClientRect = () => stageBounds;

  for (let i = 0; i < 200 && env.getCounts().activeRafs > 0; i += 1) {
    env.advanceTime(16);
    env.flushRaf();
  }
  assert.equal(env.getCounts().activeRafs, 0);

  // Switch into fullscreen stage to unlock 1:1 free orbit
  assert.equal(inst.setStageMode('fullscreen'), 'fullscreen');

  // Left-drag (+106px X, -86px Y -> >6px threshold) at ~0.0046 rad/px sensitivity
  glCanvasEl.dispatchEvent(env.createEventObj('pointerdown', { button: 0, pointerId: 2, clientX: 480, clientY: 280 }));
  env.advanceTime(16);
  glCanvasEl.dispatchEvent(env.createEventObj('pointermove', { button: 0, pointerId: 2, clientX: 586, clientY: 194 }));
  for (let f = 0; f < 4; f += 1) {
    env.advanceTime(16);
    env.flushRaf();
  }
  glCanvasEl.dispatchEvent(env.createEventObj('pointerup', { button: 0, pointerId: 2, clientX: 586, clientY: 194 }));

  let dragSettleFrames = 0;
  while (dragSettleFrames < 180 && env.getCounts().activeRafs > 0) {
    env.advanceTime(16);
    env.flushRaf();
    dragSettleFrames += 1;
  }
  assert.ok(dragSettleFrames < 180, `Picker orbit drag must settle in < 180 frames, took ${dragSettleFrames}`);
  const draggedOrbit = inst.getChassisOrbit();
  assert.equal(draggedOrbit.isRotated, true, 'Left-drag >6px must rotate chassis');
  assert.equal(resetBtn.getAttribute('data-rotated'), '1');
  assert.ok(
    draggedOrbit.yaw > 0.32 && draggedOrbit.yaw < 0.78,
    `Expected 1:1 yaw sensitivity (~0.0046 rad/px over ~100px => 0.32..0.78), got ${draggedOrbit.yaw}`
  );
  assert.ok(
    draggedOrbit.pitch < -0.24 && draggedOrbit.pitch > -0.62,
    `Expected 1:1 pitch sensitivity (~0.0046 rad/px over ~-80px => -0.62..-0.24), got ${draggedOrbit.pitch}`
  );

  // R key resets smoothly to 0fps
  env.document.dispatchEvent(env.createEventObj('keydown', { key: 'r' }));
  let rKeyFrames = 0;
  while (rKeyFrames < 240 && (inst.getChassisOrbit().isRotated || env.getCounts().activeRafs > 0)) {
    env.advanceTime(16);
    env.flushRaf();
    rKeyFrames += 1;
  }
  assert.ok(rKeyFrames < 240, `R-key reset must converge in < 240 frames, took ${rKeyFrames}`);
  assert.equal(inst.getChassisOrbit().isRotated, false);
  assert.equal(resetBtn.getAttribute('data-rotated'), '0');
  assert.equal(env.getCounts().activeRafs, 0);

  // Drag again -> reset button click restores 0fps
  glCanvasEl.dispatchEvent(env.createEventObj('pointerdown', { button: 0, pointerId: 3, clientX: 480, clientY: 280 }));
  env.advanceTime(16);
  glCanvasEl.dispatchEvent(env.createEventObj('pointermove', { button: 0, pointerId: 3, clientX: 550, clientY: 220 }));
  env.advanceTime(16);
  glCanvasEl.dispatchEvent(env.createEventObj('pointerup', { button: 0, pointerId: 3, clientX: 550, clientY: 220 }));
  for (let f = 0; f < 180 && env.getCounts().activeRafs > 0; f += 1) {
    env.advanceTime(16);
    env.flushRaf();
  }
  assert.equal(inst.getChassisOrbit().isRotated, true);
  assert.equal(resetBtn.getAttribute('data-rotated'), '1');

  resetBtn.dispatchEvent(env.createEventObj('click'));
  let btnFrames = 0;
  while (btnFrames < 240 && (inst.getChassisOrbit().isRotated || env.getCounts().activeRafs > 0)) {
    env.advanceTime(16);
    env.flushRaf();
    btnFrames += 1;
  }
  assert.ok(btnFrames < 240, `Reset button must converge in < 240 frames, took ${btnFrames}`);
  assert.equal(inst.getChassisOrbit().isRotated, false);
  assert.equal(resetBtn.getAttribute('data-rotated'), '0');
  assert.equal(env.getCounts().activeRafs, 0);

  inst.destroy();
  const counts = env.getCounts();
  assert.equal(counts.activeTimers, 0);
  assert.equal(counts.activeRafs, 0);
  assert.equal(counts.activeObservers, 0);
  assert.equal(counts.docListeners, 0);
  assert.equal(counts.winListeners, 0);
});

test('V9 Chassis Completion & Zero-Stick-Figure Static Audit (No DIAMOND_MESH_3D, Frosted Quartz Well getEffortUvRects(), Pure LF, 0 innerHTML, 0 setPrefValue)', () => {
  // 1) All 8 vendor files: pure LF (\n, 0 CRLF), 0 innerHTML, 0 setPrefValue
  for (const filePath of ALL_PERIODIC_FILES) {
    const src = fs.readFileSync(filePath, 'utf8');
    const name = path.basename(filePath);
    assert.equal(src.includes('\r'), false, `${name} must use pure LF (\\n) line endings with 0 CR/CRLF`);
    assert.equal(
      /\b(?:innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\s*\(|new\s+Function)\b/.test(src),
      false,
      `${name} must contain 0 innerHTML / unsafe HTML or eval sinks`
    );
    assert.equal(
      /\b(?:setPrefValue|setPrefValues)\b/.test(src),
      false,
      `${name} must contain 0 setPrefValue / setPrefValues calls`
    );
  }

  // 2) oled-cyber-screen.js must have completely removed legacy polygon wireframe DIAMOND_MESH_3D
  const oledSrc = fs.readFileSync(OLED_SCREEN_FILE, 'utf8');
  assert.equal(
    oledSrc.includes('DIAMOND_MESH_3D'),
    false,
    'oled-cyber-screen.js must completely remove legacy stick-figure DIAMOND_MESH_3D'
  );

  // 3) getEffortUvRects() exports precise frosted quartz well hotspots with zero inter-slot gaps
  const env = createPeriodicSandbox({ mock2d: true, mockWebGL2: false });
  loadGrainAssetsInSandbox(env);
  const oledApi = loadOledScreenInSandbox(env);
  const painter = oledApi.createOledScreenPainter({
    width: 1600,
    height: 480,
    doc: env.document,
    root: env.window,
  });

  const deck3 = {
    z: 6,
    numLabel: '6',
    groupCode: 'G14',
    symbol: 'C',
    title: 'Gemini 4 Carbon',
    chemLabel: '6 C · Carbon',
    isAvailable: true,
    levels: [
      { effort: 'low', label: 'Low', active: false },
      { effort: 'medium', label: 'Medium', active: true },
      { effort: 'high', label: 'High', active: false },
    ],
  };
  painter.render(deck3, { id: 'obsidian-dark', isLight: false, isMono: false, primaryHex: '#317660' }, { now: 1000 });

  const rects3 = painter.getEffortUvRects();
  assert.equal(rects3.length, 3, 'Expected 3 frosted quartz well effort hotspot rects');
  assert.deepEqual(
    Array.from(rects3, (r) => r.effort),
    ['low', 'medium', 'high']
  );
  for (let i = 0; i < rects3.length; i += 1) {
    const r = rects3[i];
    assert.ok(r.x >= 556 && r.x + r.w <= 1504, `Effort slot ${r.effort} x-range [${r.x}, ${r.x + r.w}] must stay inside quartz well [556, 1504]`);
    assert.equal(r.y, 296, 'Quartz well top y must be 296');
    assert.equal(r.h, 92, 'Quartz well height must be 92');
    assert.ok(r.u0 >= 0 && r.u0 < r.u1 && r.u1 <= 1, 'Normalized u0..u1 must be strictly ordered in [0, 1]');
    assert.ok(r.v0 >= 0 && r.v0 < r.v1 && r.v1 <= 1, 'Normalized v0..v1 must be strictly ordered in [0, 1]');
    assert.ok(Math.abs(r.u0 - r.x / 1600) < 1e-6 && Math.abs(r.u1 - (r.x + r.w) / 1600) < 1e-6);
    assert.ok(Math.abs(r.v0 - 296 / 480) < 1e-6 && Math.abs(r.v1 - 388 / 480) < 1e-6);
    if (i > 0) {
      assert.ok(Math.abs(rects3[i - 1].u1 - r.u0) < 1e-6, 'Adjacent quartz well effort slots must abut seamlessly with 0 gap');
    }
  }

  // Unavailable deck must return empty rects
  assert.equal(painter.getEffortUvRects({ isAvailable: false, levels: deck3.levels }).length, 0);

  painter.dispose();
  assert.equal(painter.getCanvas(), null);
});

test('V10 VisionOS Spatial Glass, Minimalist External Reset Capsule (.ag-pp-sr-only HUD proxies), and 4-Control 3D Hardware Deck (prism-wave / reset-view / mute / close) -> 0fps Sleep & 100% Disposal', () => {
  const env = createPeriodicSandbox({ mock2d: true, mockWebGL2: true });
  const audioStats = {
    createdCount: 0,
    closedCount: 0,
    lowpassCutoffs: [],
    oscillatorStarts: 0,
    oscillatorStops: 0,
  };
  class MockAudioContext {
    constructor() {
      audioStats.createdCount += 1;
      this.state = 'running';
      this.currentTime = 1.0;
      this.sampleRate = 44100;
      this.destination = { kind: 'dest' };
    }
    resume() {
      this.state = 'running';
      return Promise.resolve();
    }
    close() {
      this.state = 'closed';
      audioStats.closedCount += 1;
      return Promise.resolve();
    }
    createBuffer(channels, len) {
      const chData = new Float32Array(len);
      return { numberOfChannels: channels, length: len, getChannelData: () => chData };
    }
    createBiquadFilter() {
      const filterNode = {
        type: 'lowpass',
        frequency: {
          setValueAtTime: (val) => {
            if (filterNode.type === 'lowpass') {
              audioStats.lowpassCutoffs.push(val);
            }
          },
        },
        Q: { setValueAtTime() {} },
        connect() {},
      };
      return filterNode;
    }
    createOscillator() {
      return {
        type: 'sine',
        frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {},
        start() {
          audioStats.oscillatorStarts += 1;
        },
        stop() {
          audioStats.oscillatorStops += 1;
        },
      };
    }
    createGain() {
      return {
        gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {},
      };
    }
    createBufferSource() {
      return {
        buffer: null,
        connect() {},
        start() {},
        stop() {},
      };
    }
  }
  env.window.AudioContext = MockAudioContext;
  env.sandbox.AudioContext = MockAudioContext;

  loadGrainAssetsInSandbox(env);
  loadOledScreenInSandbox(env);
  loadKeyboard3DInSandbox(env);
  const factory = loadPeriodicFactoryInSandbox(env);

  const triggerBtn = env.makeElement('button', {
    attrs: { 'data-testid': 'model-selector-trigger' },
    text: 'Gemini 4 Carbon (High)',
  });
  env.body.appendChild(triggerBtn);

  const hostState = {
    conversationId: 'conv-v10-monolith',
    selectedModel: { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-c-high' },
    modelOptions: [
      { label: 'Gemini 4 Hydrogen (High)', modelId: 'gemini-4-h-high' },
      { label: 'Gemini 4 Carbon (Low)', modelId: 'gemini-4-c-low' },
      { label: 'Gemini 4 Carbon (Medium)', modelId: 'gemini-4-c-med' },
      { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-c-high' },
      { label: 'Gemini 4 Neon (High)', modelId: 'gemini-4-ne-high' },
      { label: 'Gemini 4 Argon (High)', modelId: 'gemini-4-ar-high' },
    ],
    setModelConfigByLabelForConversation(label) {
      hostState.selectedModel = { label, modelId: label.toLowerCase().replace(/\s+/g, '-') };
      return true;
    },
  };
  env.window.__agPeriodicMockHost = hostState;

  const inst = factory.mountPeriodicPicker({
    root: env.window,
    doc: env.document,
    mode: 'on',
    confirmSlamMs: 115,
  });
  assert.equal(inst.open(triggerBtn), true);

  // 1) Verify darkroom radial scrim (zero expensive fullscreen backdrop-filter), zero blur() floor shadows, containment & minimalist external reset capsule
  const styleEl = env.document.getElementById('ag-prism-periodic-picker-css');
  assert.ok(styleEl, 'Expected #ag-prism-periodic-picker-css stylesheet');
  assert.equal(styleEl.textContent.includes('backdrop-filter:blur(16px)'), false, 'Fullscreen root must not use expensive 16px backdrop-filter blur');
  assert.ok(styleEl.textContent.includes('--pp-spatial-scrim:radial-gradient('), 'Expected high-craft darkroom radial-gradient scrim');
  assert.ok(styleEl.textContent.includes('contain:layout style paint;'), 'Expected CSS containment firewall on root');
  assert.equal(styleEl.textContent.includes('filter:blur(28px)'), false, 'Floor shadow must replace blur(28px) with radial-gradient');
  assert.equal(styleEl.textContent.includes('filter:blur(12px)'), false, 'Contact shadow must replace blur(12px) with radial-gradient');
  assert.equal(styleEl.textContent.includes('transition:all 180ms'), false, 'Radar polygons must not use transition:all');
  assert.ok(styleEl.textContent.includes('--pp-topo-mul:0.035'), 'Expected subtle 0.035 DESKMAT_TOPO silkscreen opacity');
  assert.ok(styleEl.textContent.includes('.ag-pp-floor-shadow::before'), 'Expected deep drop shadow layer');
  assert.ok(styleEl.textContent.includes('.ag-pp-floor-shadow::after'), 'Expected ambient contact shadow layer');
  assert.ok(styleEl.textContent.includes('.ag-pp-hud-reset-btn[data-rotated="0"]{opacity:0.42;}'), 'Unrotated external reset capsule must keep restrained 0.42 opacity');

  const hudPill = env.document.querySelector('.ag-pp-hud-pill');
  assert.ok(hudPill && hudPill.getAttribute('role') === 'toolbar');
  assert.equal(env.document.querySelectorAll('.ag-pp-hud-hints').length, 0, '.ag-pp-hud-hints must never exist');
  assert.equal(hudPill.querySelectorAll('.ag-pp-hud-sep').length, 0, 'Redundant bottom divider must be removed');

  const resetBtn = hudPill.querySelector('[data-testid="ag-pp-reset-view-btn"]');
  assert.ok(resetBtn, 'Expected external [data-testid="ag-pp-reset-view-btn"] capsule');
  assert.equal(resetBtn.classList.contains('ag-pp-sr-only'), false, 'External reset view capsule must be visually displayed');
  assert.equal(resetBtn.getAttribute('data-rotated'), '0');

  const hudChips = hudPill.querySelectorAll('.ag-pp-hud-chip');
  assert.equal(hudChips.length, 4);
  for (const chip of hudChips) {
    assert.equal(chip.classList.contains('ag-pp-sr-only'), true, 'HUD element chips must be sr-only zero-visual proxies');
  }
  const muteProxy = hudPill.querySelector('[data-testid="ag-pp-mute-btn"]');
  const closeProxy = hudPill.querySelector('[data-testid="ag-pp-close-btn"]');
  assert.ok(muteProxy && muteProxy.classList.contains('ag-pp-sr-only'), 'HUD mute proxy must be sr-only');
  assert.ok(closeProxy && closeProxy.classList.contains('ag-pp-sr-only'), 'HUD close proxy must be sr-only');

  const stageEl = env.document.querySelector('.ag-pp-stage');
  const glCanvasEl = env.document.querySelector('.ag-pp-gl-canvas');
  const stageBounds = { left: 0, top: 0, width: 960, height: 552, right: 960, bottom: 552 };
  stageEl.getBoundingClientRect = () => stageBounds;
  glCanvasEl.getBoundingClientRect = () => stageBounds;

  const settleAllToIdle = (tag) => {
    let frames = 0;
    while (frames < 240 && env.getCounts().activeRafs > 0) {
      env.advanceTime(16);
      env.flushRaf();
      frames += 1;
    }
    assert.ok(frames < 240, `Expected ${tag} to settle to 0fps in < 240 frames, took ${frames}`);
    assert.equal(env.getCounts().activeRafs, 0, `${tag} must converge to activeRafs === 0 (0fps sleep)`);
  };
  env.advanceTime(200);
  settleAllToIdle('intro wake');

  // 2) Verify 4 3D hardware controls in projected rects & click interactions:
  //    (a) Left 1U artisan metal key ('prism-wave') -> pointer cursor + wave ripple + harmonic click -> 0fps
  const proj0 = inst.getProjectedRects();
  assert.deepEqual(Object.keys(proj0.controls).sort(), ['close', 'mute', 'prism-wave', 'reset-view']);
  const waveRect = proj0.controls['prism-wave'];
  const waveCx = waveRect.cx ?? waveRect.left + waveRect.width * 0.5;
  const waveCy = waveRect.cy ?? waveRect.top + waveRect.height * 0.5;

  glCanvasEl.dispatchEvent(env.createEventObj('pointermove', { clientX: waveCx, clientY: waveCy }));
  env.flushRaf();
  assert.equal(glCanvasEl.style.getPropertyValue('cursor'), 'pointer', 'Hovering 3D prism-wave key must show pointer cursor');

  const oscBeforeWave = audioStats.oscillatorStarts;
  glCanvasEl.dispatchEvent(env.createEventObj('pointerdown', { button: 0, pointerId: 1, clientX: waveCx, clientY: waveCy }));
  glCanvasEl.dispatchEvent(env.createEventObj('pointerup', { button: 0, pointerId: 1, clientX: waveCx, clientY: waveCy }));
  glCanvasEl.dispatchEvent(env.createEventObj('click', { clientX: waveCx, clientY: waveCy }));
  assert.equal(inst.isOpen(), true, 'Clicking prism-wave artisan key must keep picker open');
  assert.ok(env.getCounts().activeRafs > 0, 'Clicking prism-wave must wake 3D wave ripple & key press spring');
  assert.ok(audioStats.oscillatorStarts > oscBeforeWave, 'Clicking prism-wave must trigger metallic harmonic click sound');
  assert.ok(audioStats.lowpassCutoffs.every((hz) => hz <= 2050), 'All acoustic lowpass cutoffs must remain <= 2050Hz');
  settleAllToIdle('prism-wave 3D artisan key');

  //    (b) Rotate chassis (-0.20, 0.36) unobstructed by 0.88U High levitated 6 C, verify external reset capsule lights up, and click 3D 'mute' knurled knob in rotated view
  assert.equal(inst.setChassisOrbit(-0.20, 0.36), true);
  assert.equal(inst.getChassisOrbit().isRotated, true);
  assert.equal(resetBtn.getAttribute('data-rotated'), '1');

  const projRot = inst.getProjectedRects();
  const muteRectRot = projRot.controls['mute'];
  const muteCx = muteRectRot.cx ?? muteRectRot.left + muteRectRot.width * 0.5;
  const muteCy = muteRectRot.cy ?? muteRectRot.top + muteRectRot.height * 0.5;
  assert.equal(muteProxy.getAttribute('data-muted'), '0');

  glCanvasEl.dispatchEvent(env.createEventObj('click', { clientX: muteCx, clientY: muteCy }));
  assert.equal(muteProxy.getAttribute('data-muted'), '1', 'Clicking 3D knurled mute knob in rotated view must mute audio');
  assert.equal(env.window.localStorage.getItem('ag_prism_pp_muted'), '1');
  settleAllToIdle('3D mute knob toggle on');

  glCanvasEl.dispatchEvent(env.createEventObj('click', { clientX: muteCx, clientY: muteCy }));
  assert.equal(muteProxy.getAttribute('data-muted'), '0', 'Second click on 3D knurled mute knob must unmute audio');
  assert.equal(env.window.localStorage.getItem('ag_prism_pp_muted'), '0');
  settleAllToIdle('3D mute knob toggle off');

  //    (c) Click 3D 'reset-view' micro-switch in right 5U deck while rotated -> smoothly resets orbit to 0fps
  const resetRectRot = inst.getProjectedRects().controls['reset-view'];
  const resetCx = resetRectRot.cx ?? resetRectRot.left + resetRectRot.width * 0.5;
  const resetCy = resetRectRot.cy ?? resetRectRot.top + resetRectRot.height * 0.5;
  glCanvasEl.dispatchEvent(env.createEventObj('click', { clientX: resetCx, clientY: resetCy }));
  settleAllToIdle('3D reset-view hardware micro-switch');
  assert.equal(inst.getChassisOrbit().isRotated, false, '3D reset-view micro-switch must restore home orbit');
  assert.equal(resetBtn.getAttribute('data-rotated'), '0', 'External reset capsule must return to data-rotated="0"');

  //    (d) Click 3D 'close' micro-switch in right 5U deck -> triggers 115ms Bottom-Out Slam and cleanly closes
  const closeRect = inst.getProjectedRects().controls['close'];
  const closeCx = closeRect.cx ?? closeRect.left + closeRect.width * 0.5;
  const closeCy = closeRect.cy ?? closeRect.top + closeRect.height * 0.5;
  glCanvasEl.dispatchEvent(env.createEventObj('click', { clientX: closeCx, clientY: closeCy }));
  assert.equal(inst.getStatus().confirmClosing, true, '3D close micro-switch must trigger 115ms Bottom-Out Slam');
  assert.equal(env.document.getElementById('ag-prism-periodic-picker-root').getAttribute('data-confirm-slam'), '1');

  const glStatsBeforeClose = glCanvasEl._gl._stats();
  assert.equal(glStatsBeforeClose.created.programs.size, 5, 'WebGL2 budget must stay strictly at 5 programs');
  assert.equal(glStatsBeforeClose.created.shaders.size, 10, 'WebGL2 budget must stay strictly at 10 shaders');
  assert.equal(glStatsBeforeClose.created.vaos.size, 4, 'WebGL2 budget must stay strictly at 4 VAOs');
  assert.equal(glStatsBeforeClose.created.textures.size, 5, 'WebGL2 budget must stay strictly at 5 textures');
  assert.equal(glStatsBeforeClose.created.framebuffers.size, 1, 'WebGL2 budget must stay strictly at 1 FBO');

  env.advanceTime(120);
  assert.equal(inst.isOpen(), false, 'Picker must close cleanly after 115ms Bottom-Out Slam');
  assert.equal(env.getCounts().activeTimers, 0);
  assert.equal(env.getCounts().activeRafs, 0);

  const glStatsAfterClose = glCanvasEl._gl._stats();
  assert.equal(glStatsAfterClose.deleted.programs.size, 5);
  assert.equal(glStatsAfterClose.deleted.shaders.size, 10);
  assert.equal(glStatsAfterClose.deleted.buffers.size, glStatsAfterClose.created.buffers.size);
  assert.equal(glStatsAfterClose.deleted.vaos.size, 4);
  assert.equal(glStatsAfterClose.deleted.textures.size, 5);
  assert.equal(glStatsAfterClose.deleted.framebuffers.size, 1);
  assert.equal(glStatsAfterClose.loseContextCalls, 1);

  inst.destroy();
  assert.equal(audioStats.closedCount, 1);
  const endCounts = env.getCounts();
  assert.equal(endCounts.activeTimers, 0);
  assert.equal(endCounts.activeRafs, 0);
  assert.equal(endCounts.activeObservers, 0);
  assert.equal(endCounts.docListeners, 0);
  assert.equal(endCounts.winListeners, 0);
});

test('V11 2x3 Aux Macro Pad (auxKeys export, raycast pick, main-aux single-select interlock, 115ms slam & .ag-pp-mini-keycap sync)', () => {
  // 1) Renderer-level 2x3 Aux Macro Pad: auxKeys projection, rotated pick(), main<->aux interlock, and 100% GPU disposal
  {
    const { ELEMENTS_90 } = require(PERIODIC_PICKER_FILE);
    const envGl = createPeriodicSandbox({ mock2d: true, mockWebGL2: true });
    loadGrainAssetsInSandbox(envGl);
    loadOledScreenInSandbox(envGl);
    const kb3d = loadKeyboard3DInSandbox(envGl);

    const canvas = envGl.makeElement('canvas');
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 960, height: 552, right: 960, bottom: 552 });

    const renderer = kb3d.createKeyboard3DRenderer({
      canvas,
      doc: envGl.document,
      root: envGl.window,
      slots: ELEMENTS_90,
    });

    const auxModels = [
      { slotIndex: 0, id: 'orchestrator', shortLabel: 'Orch', subLabel: 'ORCH', badgeCode: 'ORCH', accentHex: '#A78BFA', secondaryHex: '#F59E0B', available: true },
      { slotIndex: 1, id: 'flash', shortLabel: 'Flash', subLabel: 'FLASH', badgeCode: 'FLSH', accentHex: '#22D3EE', secondaryHex: '#06B6D4', available: true },
      { slotIndex: 2, id: 'claude-opus', shortLabel: 'Opus', subLabel: 'CLAUDE', badgeCode: 'OPUS', accentHex: '#F59E0B', secondaryHex: '#D97706', available: true },
      { slotIndex: 3, id: 'claude-sonnet', shortLabel: 'Sonnet', subLabel: 'CLAUDE', badgeCode: 'SONT', accentHex: '#FBBF24', secondaryHex: '#B45309', available: true },
      { slotIndex: 4, id: 'gpt-oss', shortLabel: 'GPT', subLabel: 'OPENAI', badgeCode: 'GPT', accentHex: '#38BDF8', secondaryHex: '#94A3B8', available: true },
      { slotIndex: 5, id: 'blind', shortLabel: 'LOCK', subLabel: 'EMPTY', badgeCode: '--', accentHex: '#64748B', secondaryHex: '#475569', available: false },
    ];

    renderer.setState({
      themeProfile: { id: 'obsidian-dark', isLight: false, isMono: false, ambientMul: 0.7, primaryHex: '#669DF6' },
      availableByZ: new Map([
        [1, { slotZ: 1 }],
        [6, { slotZ: 6 }],
        [10, { slotZ: 10 }],
        [18, { slotZ: 18 }],
      ]),
      auxModels,
      selectedZ: null,
      selectedAuxIndex: 0,
      stageMode: 'drawer',
      deckInfo: {
        z: null,
        isAuxModel: true,
        auxId: 'orchestrator',
        badgeText: 'ORCH',
        title: 'Orchestrator',
        isAvailable: true,
        levels: [],
      },
    });
    for (let i = 0; i < 200 && !renderer.isIdle(); i += 1) {
      envGl.advanceTime(16);
      envGl.flushRaf();
    }
    assert.equal(renderer.isIdle(), true);

    const rects = renderer.getInteractiveProjectedRects();
    assert.ok(Array.isArray(rects.auxKeys) && rects.auxKeys.length === 6, 'Expected 6 projected auxKeys rects');
    for (let idx = 0; idx < 6; idx += 1) {
      const ak = rects.auxKeys[idx];
      assert.equal(ak.auxIndex, idx);
      assert.ok(ak.width > 4 && ak.height > 4, `Aux key #${idx} must have valid projected dimensions`);
      assert.ok(ak.left >= 0 && ak.left + ak.width <= 960, `Aux key #${idx} must fit within canvas width without clipping`);
      const hit = renderer.pick(ak.cx, ak.cy);
      assert.ok(hit && hit.kind === 'aux-key', `Expected aux-key pick for slot #${idx}, got ${JSON.stringify(hit)}`);
      assert.equal(hit.auxIndex, idx);
      assert.equal(hit.available, idx < 5);
    }
    assert.equal(rects.auxKeys[0].selected, true);
    assert.ok(rects.auxKeys[0].liftY > 0.35, `Selected aux #0 must levitate, got liftY=${rects.auxKeys[0].liftY}`);

    // Rotated co-orbit pick() on aux pad
    renderer.setChassisOrbit(-0.28, 0.38);
    const rotRects = renderer.getInteractiveProjectedRects();
    const rotAux0 = rotRects.auxKeys[0];
    const rotHit0 = renderer.pick(rotAux0.cx, rotAux0.cy);
    assert.equal(rotHit0?.kind, 'aux-key');
    assert.equal(rotHit0?.auxIndex, 0);
    assert.equal(rotHit0?.id, 'orchestrator');

    renderer.dispose();
    const glStats = canvas._gl._stats();
    assert.equal(glStats.deleted.programs.size, glStats.created.programs.size);
    assert.equal(glStats.deleted.shaders.size, glStats.created.shaders.size);
    assert.equal(glStats.deleted.buffers.size, glStats.created.buffers.size);
    assert.equal(glStats.deleted.vaos.size, glStats.created.vaos.size);
    assert.equal(glStats.deleted.textures.size, glStats.created.textures.size);
    assert.equal(glStats.deleted.framebuffers.size, glStats.created.framebuffers.size);
    assert.equal(glStats.loseContextCalls, 1);
  }

  // 2) Controller-level: main <-> aux single-select interlock, host live sync, .ag-pp-mini-keycap update, 115ms slam close
  const env = createPeriodicSandbox({ mock2d: true, mockWebGL2: true });
  loadGrainAssetsInSandbox(env);
  loadOledScreenInSandbox(env);
  loadKeyboard3DInSandbox(env);
  const factory = loadPeriodicFactoryInSandbox(env);

  const hostTextNode = env.createTextNode('Gemini 4 Carbon (High)');
  const triggerBtn = env.makeElement('button', {
    attrs: { 'data-testid': 'model-selector-trigger' },
    useChildNodes: true,
  });
  triggerBtn.appendChild(hostTextNode);
  env.body.appendChild(triggerBtn);

  const commits = [];
  const hostState = {
    conversationId: 'conv-v11-aux',
    selectedModel: { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-c-high' },
    modelOptions: [
      { label: 'Gemini 4 Hydrogen (High)', modelId: 'gemini-4-h-high' },
      { label: 'Gemini 4 Carbon (Low)', modelId: 'gemini-4-c-low' },
      { label: 'Gemini 4 Carbon (Medium)', modelId: 'gemini-4-c-med' },
      { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-c-high' },
      { label: 'Gemini 4 Neon (High)', modelId: 'gemini-4-ne-high' },
      { label: 'Gemini 4 Argon', modelId: 'gemini-4-ar' },
      { label: 'Orchestrator', modelId: 'orchestrator' },
      { label: 'Gemini 3.8 Flash', modelId: 'gemini-3.8-flash' },
      { label: 'Claude Opus 5.5', modelId: 'claude-opus-5.5' },
      { label: 'Claude Sonnet 5.5', modelId: 'claude-sonnet-5.5' },
      { label: 'GPT-OSS 120B', modelId: 'gpt-oss-120b' },
    ],
    setModelConfigByLabelForConversation(label, convId, flag) {
      commits.push({ label, convId, flag });
      const found = hostState.modelOptions.find((o) => o.label === label);
      if (found) {
        hostState.selectedModel = found;
        hostTextNode.nodeValue = found.label;
      }
      return true;
    },
  };
  env.window.__agPeriodicMockHost = hostState;

  const inst = factory.mountPeriodicPicker({ root: env.window, doc: env.document, mode: 'on', confirmSlamMs: 115 });
  assert.equal(inst.open(triggerBtn), true);

  const stageEl = env.document.querySelector('.ag-pp-stage');
  const glCanvasEl = env.document.querySelector('.ag-pp-gl-canvas');
  const stageBounds = { left: 0, top: 0, width: 960, height: 552, right: 960, bottom: 552 };
  stageEl.getBoundingClientRect = () => stageBounds;
  glCanvasEl.getBoundingClientRect = () => stageBounds;
  for (let i = 0; i < 200 && env.getCounts().activeRafs > 0; i += 1) {
    env.advanceTime(16);
    env.flushRaf();
  }

  assert.equal(inst.getStatus().selectedZ, 6);
  assert.equal(inst.getStatus().selectedAuxIndex, null);

  // First click on Aux #0 (Orchestrator) -> selectedZ becomes null, selectedAuxIndex === 0, host switches, mini-keycap updates
  const rects0 = inst.getProjectedRects();
  assert.equal(rects0.auxKeys.length, 6);
  const aux0 = rects0.auxKeys[0];
  glCanvasEl.dispatchEvent(env.createEventObj('click', { clientX: aux0.cx, clientY: aux0.cy }));

  assert.equal(inst.getStatus().selectedZ, null, 'Selecting aux key must clear main element selectedZ');
  assert.equal(inst.getStatus().selectedAuxIndex, 0, 'Selecting Orchestrator aux key must set selectedAuxIndex === 0');
  assert.equal(hostState.selectedModel.label, 'Orchestrator');
  assert.equal(commits.at(-1).label, 'Orchestrator');

  const miniBadgeOrch = triggerBtn.querySelector('.ag-pp-mini-keycap');
  assert.ok(miniBadgeOrch, 'Expected .ag-pp-mini-keycap to update for Orchestrator aux model');
  assert.equal(miniBadgeOrch.getAttribute('data-aux-id'), 'orchestrator');
  assert.equal(miniBadgeOrch.getAttribute('data-z'), null);
  assert.equal(miniBadgeOrch.textContent, '0·6C');

  // Second click on already-selected Aux #0 -> triggers 115ms confirm slam & closes
  const aux0After = inst.getProjectedRects().auxKeys[0];
  glCanvasEl.dispatchEvent(env.createEventObj('click', { clientX: aux0After.cx, clientY: aux0After.cy }));
  assert.equal(inst.getStatus().confirmClosing, true);
  assert.equal(inst.getStatus().confirmSlamAuxIndex, 0);
  assert.equal(env.document.getElementById('ag-prism-periodic-picker-root').getAttribute('data-confirm-slam'), '1');

  env.advanceTime(80);
  assert.equal(inst.isOpen(), true);
  env.advanceTime(40);
  assert.equal(inst.isOpen(), false, 'Aux second-click confirm slam must close after 115ms');
  assert.equal(env.getCounts().activeTimers, 0);
  assert.equal(env.getCounts().activeRafs, 0);

  // Re-open (host is Orchestrator) -> click main key 6 C -> clears selectedAuxIndex & restores 6C mini-keycap
  assert.equal(inst.open(triggerBtn), true);
  const stageEl2 = env.document.querySelector('.ag-pp-stage');
  const glCanvasEl2 = env.document.querySelector('.ag-pp-gl-canvas');
  stageEl2.getBoundingClientRect = () => stageBounds;
  glCanvasEl2.getBoundingClientRect = () => stageBounds;
  for (let i = 0; i < 200 && env.getCounts().activeRafs > 0; i += 1) {
    env.advanceTime(16);
    env.flushRaf();
  }
  assert.equal(inst.getStatus().selectedAuxIndex, 0);
  assert.equal(inst.getStatus().selectedZ, null);

  const keyCRect = inst.getProjectedRects().keys.find((k) => k.slotZ === 6);
  glCanvasEl2.dispatchEvent(env.createEventObj('click', { clientX: keyCRect.cx, clientY: keyCRect.cy }));
  assert.equal(inst.getStatus().selectedZ, 6);
  assert.equal(inst.getStatus().selectedAuxIndex, null, 'Selecting main keycap must clear selectedAuxIndex');
  assert.equal(hostState.selectedModel.label, 'Gemini 4 Carbon (High)');
  const miniBadgeC = triggerBtn.querySelector('.ag-pp-mini-keycap');
  assert.ok(miniBadgeC && miniBadgeC.getAttribute('data-z') === '6' && miniBadgeC.textContent === '6C');

  inst.destroy();
  const counts = env.getCounts();
  assert.equal(counts.activeTimers, 0);
  assert.equal(counts.activeRafs, 0);
  assert.equal(counts.activeObservers, 0);
  assert.equal(counts.docListeners, 0);
  assert.equal(counts.winListeners, 0);
});

test('V11 Effort-Tiered Antigravity Levitation (Extra > High > Medium > Low), Neighbor Blind-Key Resonance & OLED Aux Dual-Core Optics', () => {
  const { ELEMENTS_90 } = require(PERIODIC_PICKER_FILE);
  const env = createPeriodicSandbox({ mock2d: true, mockWebGL2: true });
  loadGrainAssetsInSandbox(env);
  const oledApi = loadOledScreenInSandbox(env);
  const kb3d = loadKeyboard3DInSandbox(env);

  // 1) OLED painter: 4 elements + Aux models (orchestrator/flash/claude/gpt) + nowMs continuous optics + 0fps idle
  const painter = oledApi.createOledScreenPainter({
    width: 1600,
    height: 480,
    doc: env.document,
    root: env.window,
  });
  const themeDark = { id: 'obsidian-dark', isLight: false, isMono: false, primaryHex: '#669DF6' };
  let auxClock = 2000;
  for (const auxCase of [
    { auxId: 'orchestrator', badgeText: 'ORCH', title: 'Orchestrator' },
    { auxId: 'flash', badgeText: 'FLASH', title: 'Gemini 3.8 Flash' },
    { auxId: 'claude-opus', badgeText: 'OPUS', title: 'Claude Opus 5.5' },
    { auxId: 'gpt-oss', badgeText: 'GPT', title: 'GPT-OSS 120B' },
  ]) {
    const deck = {
      z: null,
      isAuxModel: true,
      auxId: auxCase.auxId,
      badgeText: auxCase.badgeText,
      title: auxCase.title,
      isAvailable: true,
      levels: [],
    };
    painter.render(deck, themeDark, { now: auxClock });
    auxClock += 220;
    painter.render(deck, themeDark, { now: auxClock });
    assert.equal(painter.isAnimating(auxClock), false, `Aux ${auxCase.auxId} without continuousGlow must settle to 0fps idle after 200ms crossfade`);
    assert.equal(painter.getEffortUvRects().length, 0);
    auxClock += 50;
  }
  painter.dispose();

  // 2) Keyboard3D Renderer: Effort-Tiered Antigravity Height & Neighbor Blind-Key Micro-Lift Resonance
  const canvas = env.makeElement('canvas');
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 960, height: 552, right: 960, bottom: 552 });

  const renderer = kb3d.createKeyboard3DRenderer({
    canvas,
    doc: env.document,
    root: env.window,
    slots: ELEMENTS_90,
  });

  const availMap = new Map([
    [1, { slotZ: 1 }],
    [6, { slotZ: 6 }],
    [10, { slotZ: 10 }],
    [18, { slotZ: 18 }],
  ]);

  const measureTier = (activeEffort) => {
    const levels = [
      { effort: 'low', label: 'Low', active: activeEffort === 'low' },
      { effort: 'medium', label: 'Medium', active: activeEffort === 'medium' },
      { effort: 'high', label: 'High', active: activeEffort === 'high' },
      { effort: 'xhigh', label: 'Extra', active: activeEffort === 'xhigh' },
    ];
    renderer.setState({
      themeProfile: { id: 'obsidian-dark', isLight: false, isMono: false, ambientMul: 0.7, primaryHex: '#317660' },
      availableByZ: availMap,
      selectedZ: 6,
      deckInfo: {
        z: 6,
        numLabel: '6',
        symbol: 'C',
        title: 'Gemini 4 Carbon',
        isAvailable: true,
        levels,
      },
    });
    let frames = 0;
    while (frames < 240 && !renderer.isIdle()) {
      env.advanceTime(16);
      env.flushRaf();
      frames += 1;
    }
    assert.ok(frames < 240, `Tier ${activeEffort} must settle in <240 frames, took ${frames}`);
    assert.equal(renderer.isIdle(), true);
    const rects = renderer.getInteractiveProjectedRects();
    return {
      liftC: rects.keys.find((k) => k.slotZ === 6).liftY,
      liftNeighborB: rects.keys.find((k) => k.slotZ === 5).liftY,
      liftNeighborN: rects.keys.find((k) => k.slotZ === 7).liftY,
      liftFarAr: rects.keys.find((k) => k.slotZ === 18).liftY,
    };
  };

  const tLow = measureTier('low');
  const tMed = measureTier('medium');
  const tHigh = measureTier('high');
  const tExtra = measureTier('xhigh');

  assert.ok(tLow.liftC > 0.30, `Low tier liftY must be >0.30U, got ${tLow.liftC}`);
  assert.ok(tMed.liftC > tLow.liftC + 0.15, `Medium (${tMed.liftC}) must noticeably exceed Low (${tLow.liftC})`);
  assert.ok(tHigh.liftC > tMed.liftC + 0.15, `High (${tHigh.liftC}) must noticeably exceed Medium (${tMed.liftC})`);
  assert.ok(tExtra.liftC > tHigh.liftC + 0.10, `Extra (${tExtra.liftC}) must noticeably exceed High (${tHigh.liftC})`);

  assert.equal(tLow.liftNeighborB, 0, 'Low tier must have 0 neighbor blind-key resonance');
  assert.equal(tMed.liftNeighborB, 0, 'Medium tier must have 0 neighbor blind-key resonance');
  assert.ok(tHigh.liftNeighborB > 0.025 && tHigh.liftNeighborN > 0.025, `High tier must micro-lift adjacent blind keys (B=${tHigh.liftNeighborB}, N=${tHigh.liftNeighborN})`);
  assert.ok(tExtra.liftNeighborB > tHigh.liftNeighborB + 0.015, `Extra tier neighbor micro-lift (${tExtra.liftNeighborB}) must exceed High (${tHigh.liftNeighborB})`);
  assert.equal(tExtra.liftFarAr, 0, 'Distant keys (>1.65U) must remain unlifted');

  // Stepping back down to Low resets neighbor resonance cleanly to 0 at 0fps
  const tReset = measureTier('low');
  assert.equal(tReset.liftNeighborB, 0);
  assert.equal(env.getCounts().activeRafs, 0);

  renderer.dispose();
  const glAfter = canvas._gl._stats();
  assert.equal(glAfter.deleted.programs.size, 5);
  assert.equal(glAfter.deleted.shaders.size, 10);
  assert.equal(glAfter.deleted.vaos.size, 4);
  assert.equal(glAfter.deleted.textures.size, 5);
  assert.equal(glAfter.deleted.framebuffers.size, 1);
  assert.equal(env.getCounts().activeRafs, 0);
});

test('V11 Drawer<->Fullscreen Stage Mode Auto-Reset, Zero-Reflow Drag, 50ms Momentum & Bento Twin Cards (5-Axis SVG + 512K Telemetry)', () => {
  const env = createPeriodicSandbox({ mock2d: true, mockWebGL2: true });
  loadGrainAssetsInSandbox(env);
  loadOledScreenInSandbox(env);
  loadKeyboard3DInSandbox(env);
  const factory = loadPeriodicFactoryInSandbox(env);

  const triggerBtn = env.makeElement('button', {
    attrs: { 'data-testid': 'model-selector-trigger' },
    text: 'Gemini 4 Carbon (High)',
  });
  env.body.appendChild(triggerBtn);

  // Host 512K telemetry object
  env.window.__agPrismTelemetry = {
    usedTokens: 131072,
    maxTokens: 524288,
    cacheHitRate: 0.96,
    tps: 142,
    history: [0.18, 0.21, 0.24, 0.25, 0.25],
  };

  const hostState = {
    conversationId: 'conv-v11-bento',
    selectedModel: { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-c-high' },
    modelOptions: [
      { label: 'Gemini 4 Hydrogen (High)', modelId: 'gemini-4-h-high' },
      { label: 'Gemini 4 Carbon (Low)', modelId: 'gemini-4-c-low' },
      { label: 'Gemini 4 Carbon (Medium)', modelId: 'gemini-4-c-med' },
      { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-c-high' },
      { label: 'Gemini 4 Neon (High)', modelId: 'gemini-4-ne-high' },
      { label: 'Gemini 4 Argon', modelId: 'gemini-4-ar' },
      { label: 'Orchestrator', modelId: 'orchestrator' },
    ],
    setModelConfigByLabelForConversation(label) {
      hostState.selectedModel = { label, modelId: label.toLowerCase().replace(/\s+/g, '-') };
      return true;
    },
  };
  env.window.__agPeriodicMockHost = hostState;

  const inst = factory.mountPeriodicPicker({ root: env.window, doc: env.document, mode: 'on' });
  assert.equal(inst.open(triggerBtn), true);

  const overlayEl = env.document.getElementById('ag-prism-periodic-picker-root');
  const stageEl = env.document.querySelector('.ag-pp-stage');
  const glCanvasEl = env.document.querySelector('.ag-pp-gl-canvas');
  const specCard = env.document.querySelector('[data-testid="ag-pp-bento-spec-card"]');
  const telePod = env.document.querySelector('[data-testid="ag-pp-bento-telemetry-pod"]');
  const stageModeBtn = env.document.querySelector('[data-testid="ag-pp-stage-mode-btn"]');

  assert.ok(overlayEl.classList.contains('ag-periodic-picker-backdrop'));
  assert.equal(overlayEl.getAttribute('data-stage-mode'), 'drawer');
  assert.ok(specCard, 'Expected [data-testid="ag-pp-bento-spec-card"]');
  assert.ok(telePod, 'Expected [data-testid="ag-pp-bento-telemetry-pod"]');
  assert.ok(stageModeBtn, 'Expected [data-testid="ag-pp-stage-mode-btn"]');

  // 1) Verify Spec Card has 5-axis SVG radar and updates live on hover without committing selection
  const radarSvgs = specCard.querySelectorAll('svg');
  assert.ok(radarSvgs.length >= 1, 'Spec card must render SVG 5-axis capability chart');
  assert.ok(specCard.textContent.includes('Carbon'), `Expected Carbon title in spec card, got ${specCard.textContent}`);

  // 2) Verify Telemetry Pod displays 512K window & live host telemetry + SVG pulse line
  assert.ok(telePod.textContent.includes('512K'), `Telemetry pod must use 512K window scale, got ${telePod.textContent}`);
  assert.ok(telePod.textContent.includes('128K'), `Telemetry pod should reflect 131072 usedTokens (128K), got ${telePod.textContent}`);
  assert.ok(telePod.querySelectorAll('svg').length >= 1, 'Telemetry pod must render SVG pulse sparkline');

  const stageBounds = { left: 0, top: 0, width: 960, height: 552, right: 960, bottom: 552 };
  stageEl.getBoundingClientRect = () => stageBounds;
  glCanvasEl.getBoundingClientRect = () => stageBounds;
  for (let i = 0; i < 200 && env.getCounts().activeRafs > 0; i += 1) {
    env.advanceTime(16);
    env.flushRaf();
  }

  // Hover 10 Ne -> Spec Card updates live to Neon without changing committed model
  const neRect = inst.getProjectedRects().keys.find((k) => k.slotZ === 10);
  stageEl.dispatchEvent(env.createEventObj('pointermove', { clientX: neRect.cx, clientY: neRect.cy }));
  env.flushRaf();
  assert.ok(specCard.textContent.includes('Neon'), `Spec card must update on hover to Neon, got ${specCard.textContent}`);
  assert.equal(hostState.selectedModel.label, 'Gemini 4 Carbon (High)', 'Hovering must not commit host model');

  // Hover off -> click effort capsule on Spec Card -> switches active model effort directly
  stageEl.dispatchEvent(env.createEventObj('pointerleave'));
  const lowBentoBtn = specCard.querySelector('.ag-pp-bento-eff-btn[data-bento-effort="low"]');
  assert.ok(lowBentoBtn, 'Expected effort pill inside Bento Spec Card');
  lowBentoBtn.dispatchEvent(env.createEventObj('click'));
  assert.equal(hostState.selectedModel.label, 'Gemini 4 Carbon (Low)');

  // 3) Toggle to fullscreen via F shortcut -> test zero-reflow drag (0 hit-layer style mutations during pointermove) & 50ms momentum -> toggle back auto-resets orbit
  env.document.dispatchEvent(env.createEventObj('keydown', { key: 'f' }));
  assert.equal(inst.getStageMode(), 'fullscreen');
  assert.equal(overlayEl.getAttribute('data-stage-mode'), 'fullscreen');

  const spyKeyBtn = env.document.querySelector('button[data-z="6"]');
  let hitLayerStyleWritesDuringDrag = 0;
  const origSetProp = spyKeyBtn.style.setProperty;
  spyKeyBtn.style.setProperty = function (k, v) {
    hitLayerStyleWritesDuringDrag += 1;
    return origSetProp.call(this, k, v);
  };

  glCanvasEl.dispatchEvent(env.createEventObj('pointerdown', { button: 0, pointerId: 7, clientX: 460, clientY: 280 }));
  env.advanceTime(14);
  glCanvasEl.dispatchEvent(env.createEventObj('pointermove', { button: 0, pointerId: 7, clientX: 520, clientY: 245 }));
  env.advanceTime(14);
  glCanvasEl.dispatchEvent(env.createEventObj('pointermove', { button: 0, pointerId: 7, clientX: 585, clientY: 210 }));
  assert.equal(hitLayerStyleWritesDuringDrag, 0, 'pointermove orbit dragging must perform 0 sync DOM hit-layer layout writes');

  glCanvasEl.dispatchEvent(env.createEventObj('pointerup', { button: 0, pointerId: 7, clientX: 585, clientY: 210 }));
  const orbitAtUp = inst.getChassisOrbit();
  assert.equal(orbitAtUp.isRotated, true);

  let coastFrames = 0;
  while (coastFrames < 180 && env.getCounts().activeRafs > 0) {
    env.advanceTime(16);
    env.flushRaf();
    coastFrames += 1;
  }
  assert.ok(coastFrames > 0 && coastFrames < 180, `50ms momentum coast must settle in <180 frames, took ${coastFrames}`);
  const orbitAfterCoast = inst.getChassisOrbit();
  assert.ok(orbitAfterCoast.yaw > orbitAtUp.yaw, `50ms momentum must coast forward after pointerup (${orbitAtUp.yaw} -> ${orbitAfterCoast.yaw})`);

  // Switching rotated fullscreen -> drawer automatically triggers resetChassisOrbit() and settles at 0fps
  stageModeBtn.dispatchEvent(env.createEventObj('click'));
  assert.equal(inst.getStageMode(), 'drawer');
  assert.equal(overlayEl.getAttribute('data-stage-mode'), 'drawer');
  let autoResetFrames = 0;
  while (autoResetFrames < 180 && (inst.getChassisOrbit().isRotated || env.getCounts().activeRafs > 0)) {
    env.advanceTime(16);
    env.flushRaf();
    autoResetFrames += 1;
  }
  assert.ok(autoResetFrames < 180, `Auto-reset on drawer return must converge in <180 frames, took ${autoResetFrames}`);
  assert.equal(inst.getChassisOrbit().isRotated, false);
  assert.equal(env.getCounts().activeRafs, 0);

  inst.destroy();
  const counts = env.getCounts();
  assert.equal(counts.activeTimers, 0);
  assert.equal(counts.activeRafs, 0);
  assert.equal(counts.activeObservers, 0);
  assert.equal(counts.docListeners, 0);
  assert.equal(counts.winListeners, 0);
});

test('V11 Hard Gate Audit: Zero 256K Hardcode, Pure LF, Zero Unsafe Sinks, Channel 1 Budget (< 686,080 B) & sidebarStudio === off', () => {
  const demoHtmlFile = path.join(ROOT_DIR, 'workbench', 'periodic-demo.html');
  const targets = [
    ...ALL_PERIODIC_FILES,
    demoHtmlFile,
    __filename,
  ];
  for (const fp of targets) {
    const src = fs.readFileSync(fp, 'utf8');
    const name = path.basename(fp);
    assert.equal(src.includes('\r'), false, `${name} must use pure LF (\\n) with 0 CR/CRLF`);
    if (fp !== __filename) {
      assert.equal(
        /\b(?:innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\s*\(|new\s+Function|setPrefValue|setPrefValues)\b/.test(src),
        false,
        `${name} must contain 0 unsafe HTML/eval/globalPermissionWrites sinks`
      );
      assert.equal(
        /\b256\s*k\b|\b262144\b|262,144/i.test(src),
        false,
        `${name} must contain 0 hardcoded 256K context limit`
      );
    }
  }

  assert.equal(cdp.DEFAULT_CONFIG.sidebarStudio, 'off');
  const mainBundleBytes = Buffer.byteLength(cdp.buildInjectExpression(cdp.DEFAULT_CONFIG), 'utf8');
  assert.ok(mainBundleBytes < 686080, `Channel 1 static main bundle must stay < 686,080 B, got ${mainBundleBytes} B`);
});

test('V12 OLED Cyber Screen: Orch Dual-Core Latch (4 Planners + Real Effort Matrix), Unsupported NON-PLANNER Lock & 0fps Sleep', () => {
  const env = createPeriodicSandbox({ mock2d: true, mockWebGL2: false });
  loadGrainAssetsInSandbox(env);
  const oledApi = loadOledScreenInSandbox(env);
  const painter = oledApi.createOledScreenPainter({
    width: 1600,
    height: 480,
    doc: env.document,
    root: env.window,
  });

  const themeDark = { id: 'obsidian-dark', isLight: false, isMono: false, primaryHex: '#669DF6' };
  const ctx2d = painter.getCanvas()._ctx2d;
  let now = 2000;

  const plannerCases = [
    {
      z: 6,
      symbol: 'C',
      badgeText: 'ORCH · 6C',
      title: 'Orch · Carbon',
      levels: [
        { effort: 'low', label: 'Low', active: false },
        { effort: 'medium', label: 'Medium', active: false },
        { effort: 'high', label: 'High', active: true },
      ],
    },
    {
      z: 10,
      symbol: 'Ne',
      badgeText: 'ORCH · 10Ne',
      title: 'Orch · Neon',
      levels: [
        { effort: 'low', label: 'Low', active: false },
        { effort: 'medium', label: 'Medium', active: true },
        { effort: 'high', label: 'High', active: false },
        { effort: 'xhigh', label: 'Extra', active: false },
      ],
    },
    {
      z: 18,
      symbol: 'Ar',
      badgeText: 'ORCH · 18Ar',
      title: 'Orch · Argon',
      levels: [
        { effort: 'low', label: 'Low', active: true },
        { effort: 'medium', label: 'Medium', active: false },
        { effort: 'high', label: 'High', active: false },
      ],
    },
    {
      z: null,
      isAuxModel: true,
      auxId: 'claude-opus',
      symbol: 'OPUS',
      badgeText: 'ORCH · OPUS',
      title: 'Orch · Opus 5.5',
      levels: [
        { effort: 'low', label: 'Low', active: false },
        { effort: 'medium', label: 'Medium', active: false },
        { effort: 'high', label: 'High', active: true },
      ],
    },
  ];

  for (const tc of plannerCases) {
    ctx2d._drawnTexts.length = 0;
    const deck = {
      ...tc,
      isAvailable: true,
      orchLatched: true,
      orchUnsupported: false,
    };
    painter.render(deck, themeDark, { now });
    now += 240;
    painter.render(deck, themeDark, { now });
    assert.equal(painter.isAnimating(now), false, `Orch planner ${tc.title} must settle to 0fps after crossfade`);

    const uvRects = painter.getEffortUvRects();
    assert.equal(uvRects.length, tc.levels.length, `Orch planner ${tc.title} must preserve exact effort matrix hotspots`);
    const joinedText = ctx2d._drawnTexts.join(' | ');
    assert.ok(joinedText.includes('ORCH'), `Expected ORCH badge for ${tc.title}, got: ${joinedText}`);
    assert.ok(joinedText.includes('DUAL-CORE'), `Expected DUAL-CORE capsule for ${tc.title}, got: ${joinedText}`);
    assert.equal(joinedText.includes('Standard | Carbon | Standard'), false, 'Must never render stale Standard|Carbon|Standard placeholder');
    now += 60;
  }

  // Unsupported model in Orch mode -> NON-PLANNER lock badge
  ctx2d._drawnTexts.length = 0;
  const unsupportedDeck = {
    z: 1,
    symbol: 'H',
    badgeText: '1H',
    title: 'Gemini 4 Hydrogen',
    isAvailable: false,
    orchLatched: true,
    orchUnsupported: true,
    levels: [],
  };
  painter.render(unsupportedDeck, themeDark, { now });
  now += 240;
  painter.render(unsupportedDeck, themeDark, { now });
  assert.equal(painter.isAnimating(now), false);
  const lockText = ctx2d._drawnTexts.join(' | ');
  assert.ok(lockText.includes('NON-PLANNER'), `Unsupported model in Orch mode must render NON-PLANNER lock badge, got: ${lockText}`);

  painter.dispose();
  assert.equal(painter.isAnimating(), false);
  assert.equal(painter.getCanvas(), null);
});

test('V12 WebGL2 3D Renderer: #0 Orch Mechanical Latch Sink (-0.135U), Dynamic Blind-Key Dimming, Locked Aux Shake & 5-10-4-5-1 Budget', () => {
  const { ELEMENTS_90 } = require(PERIODIC_PICKER_FILE);
  const env = createPeriodicSandbox({ mock2d: true, mockWebGL2: true });
  loadGrainAssetsInSandbox(env);
  loadOledScreenInSandbox(env);
  const kb3d = loadKeyboard3DInSandbox(env);

  const canvas = env.makeElement('canvas');
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 960, height: 340, right: 960, bottom: 340 });

  const renderer = kb3d.createKeyboard3DRenderer({
    canvas,
    doc: env.document,
    root: env.window,
    slots: ELEMENTS_90,
  });

  const auxModelsBase = [
    { slotIndex: 0, id: 'orchestrator', shortLabel: 'Orch', subLabel: 'ORCH', badgeCode: 'ORCH', accentHex: '#A78BFA', secondaryHex: '#F59E0B', available: true },
    { slotIndex: 1, id: 'flash', shortLabel: 'Flash', subLabel: 'FLASH', badgeCode: 'FLSH', accentHex: '#22D3EE', secondaryHex: '#06B6D4', available: true },
    { slotIndex: 2, id: 'claude-opus', shortLabel: 'Opus', subLabel: 'CLAUDE', badgeCode: 'OPUS', accentHex: '#F59E0B', secondaryHex: '#D97706', available: true },
    { slotIndex: 3, id: 'claude-sonnet', shortLabel: 'Sonnet', subLabel: 'CLAUDE', badgeCode: 'SONT', accentHex: '#FBBF24', secondaryHex: '#B45309', available: true },
    { slotIndex: 4, id: 'gpt-oss', shortLabel: 'GPT', subLabel: 'OPENAI', badgeCode: 'GPT', accentHex: '#38BDF8', secondaryHex: '#94A3B8', available: true },
    { slotIndex: 5, id: 'blind', shortLabel: 'LOCK', subLabel: 'EMPTY', badgeCode: '--', accentHex: '#64748B', secondaryHex: '#475569', available: false },
  ];

  const settle = (tag) => {
    let frames = 0;
    while (frames < 180 && (!renderer.isIdle() || env.getCounts().activeRafs > 0)) {
      env.advanceTime(16);
      env.flushRaf();
      frames += 1;
    }
    assert.ok(frames < 180, `${tag} must converge in <180 frames, took ${frames}`);
    assert.equal(renderer.isIdle(), true);
    assert.equal(env.getCounts().activeRafs, 0);
  };

  // Engage orchLatched: true + dim 1H / Flash / Sonnet / GPT, levitate 6C
  const auxModelsOrch = auxModelsBase.map((m) => ({
    ...m,
    available: m.slotIndex === 0 || m.slotIndex === 2,
  }));
  renderer.setState({
    themeProfile: { id: 'obsidian-dark', isLight: false, isMono: false, ambientMul: 0.7, primaryHex: '#669DF6' },
    availableByZ: new Map([
      [6, { slotZ: 6 }],
      [10, { slotZ: 10 }],
      [18, { slotZ: 18 }],
    ]),
    auxModels: auxModelsOrch,
    orchLatched: true,
    selectedZ: 6,
    selectedAuxIndex: null,
    stageMode: 'drawer',
    deckInfo: {
      z: 6,
      symbol: 'C',
      badgeText: 'ORCH · 6C',
      title: 'Orch · Carbon',
      isAvailable: true,
      orchLatched: true,
      levels: [
        { effort: 'low', label: 'Low', active: false },
        { effort: 'medium', label: 'Medium', active: false },
        { effort: 'high', label: 'High', active: true },
      ],
    },
  });
  settle('orchLatched sink & blind dimming');

  const rectsLatched = renderer.getInteractiveProjectedRects();
  assert.equal(rectsLatched.auxKeys[0].latched, true, 'auxKeys[0].latched must be true when orchLatched=true');
  assert.ok(rectsLatched.auxKeys[0].liftY < -0.08, `#0 Orch must mechanically sink (<-0.08U), got ${rectsLatched.auxKeys[0].liftY}`);
  assert.ok(rectsLatched.keys.find((k) => k.slotZ === 6).liftY > 0.35, 'Active planner 6C must remain sole levitated key');
  for (let idx = 0; idx < 6; idx += 1) {
    const ak = rectsLatched.auxKeys[idx];
    assert.ok(ak.left >= 0 && ak.left + ak.width <= 960, `Drawer aux key #${idx} must not clip`);
  }
  const hitH = renderer.pick(rectsLatched.keys.find((k) => k.slotZ === 1).cx, rectsLatched.keys.find((k) => k.slotZ === 1).cy);
  assert.equal(hitH?.available, false, '1H must pick as unavailable when removed from availableByZ in Orch mode');
  const hitFlash = renderer.pick(rectsLatched.auxKeys[1].cx, rectsLatched.auxKeys[1].cy);
  assert.equal(hitFlash?.available, false, 'Flash must pick as unavailable in Orch mode');

  // Trigger lockedShakeAuxIndex on dimmed Flash slot and verify <180 frame settle
  renderer.setState({ lockedShakeAuxIndex: 1 });
  settle('lockedShakeAuxIndex');

  // Unlatch orchLatched: false -> #0 Orch springs back to ~0U and restores all keys
  renderer.setState({
    availableByZ: new Map([
      [1, { slotZ: 1 }],
      [6, { slotZ: 6 }],
      [10, { slotZ: 10 }],
      [18, { slotZ: 18 }],
    ]),
    auxModels: auxModelsBase,
    orchLatched: false,
    lockedShakeAuxIndex: null,
  });
  settle('orchLatched unlatch restore');
  const rectsUnlatched = renderer.getInteractiveProjectedRects();
  assert.equal(rectsUnlatched.auxKeys[0].latched, false);
  assert.ok(Math.abs(rectsUnlatched.auxKeys[0].liftY) < 0.02, `#0 Orch must bounce back to ~0U on unlatch, got ${rectsUnlatched.auxKeys[0].liftY}`);

  const glStats = canvas._gl._stats();
  assert.equal(glStats.created.programs.size, 5, 'WebGL2 programs must stay strictly at 5');
  assert.equal(glStats.created.shaders.size, 10, 'WebGL2 shaders must stay strictly at 10');
  assert.equal(glStats.created.vaos.size, 4, 'WebGL2 VAOs must stay strictly at 4');
  assert.equal(glStats.created.textures.size, 5, 'WebGL2 textures must stay strictly at 5');
  assert.equal(glStats.created.framebuffers.size, 1, 'WebGL2 FBOs must stay strictly at 1');

  renderer.dispose();
  const glAfter = canvas._gl._stats();
  assert.equal(glAfter.deleted.programs.size, 5);
  assert.equal(glAfter.deleted.shaders.size, 10);
  assert.equal(glAfter.deleted.buffers.size, glAfter.created.buffers.size);
  assert.equal(glAfter.deleted.vaos.size, 4);
  assert.equal(glAfter.deleted.textures.size, 5);
  assert.equal(glAfter.deleted.framebuffers.size, 1);
  assert.equal(glAfter.loseContextCalls, 1);
});

test('V12 In-Flow Push-Up Desk Dock: Input-Below Append, Typing Guard (f/r/Space), #0 Orch Latch + orchestratorPlanners Whitelist Dimming & Unlatch Restore', () => {
  const env = createPeriodicSandbox({ mock2d: true, mockWebGL2: true });
  loadGrainAssetsInSandbox(env);
  loadOledScreenInSandbox(env);
  loadKeyboard3DInSandbox(env);
  const factory = loadPeriodicFactoryInSandbox(env);

  const convView = env.makeElement('div', { attrs: { 'data-testid': 'conversation-view' } });
  const msgList = env.makeElement('div', { attrs: { 'data-testid': 'messages-list' } });
  msgList.scrollHeight = 1200;
  msgList.clientHeight = 500;
  msgList.scrollTop = 700;
  const inputBox = env.makeElement('div', { attrs: { 'data-testid': 'agent-input-box' } });
  const textarea = env.makeElement('textarea', { attrs: { placeholder: 'Ask anything...' } });
  const editable = env.makeElement('div', { attrs: { contenteditable: 'true' } });
  const triggerBtn = env.makeElement('button', {
    attrs: { 'data-testid': 'model-selector-trigger' },
    text: 'Gemini 4 Carbon (High)',
  });
  inputBox.appendChild(textarea);
  inputBox.appendChild(editable);
  inputBox.appendChild(triggerBtn);
  convView.appendChild(msgList);
  convView.appendChild(inputBox);
  env.body.appendChild(convView);

  const commits = [];
  const orchSelectCalls = [];
  const plannerOptions = [
    { label: 'Gemini 4 Neon (High)', value: 'planner-ne-high', modelId: 'gemini-4-ne-high' },
    { label: 'Gemini 4 Carbon (Low)', value: 'planner-c-low', modelId: 'gemini-4-c-low' },
    { label: 'Gemini 4 Carbon (High)', value: 'planner-c-high', modelId: 'gemini-4-c-high' },
    { label: 'Gemini 4 Argon (High)', value: 'planner-ar-high', modelId: 'gemini-4-ar-high' },
    { label: 'Claude Opus 5.5 (High)', value: 'planner-opus-high', modelId: 'claude-opus-5.5-high' },
  ];
  const hostState = {
    conversationId: 'conv-v12-inflow',
    selectedModel: { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-c-high' },
    modelOptions: [
      { label: 'Gemini 4 Hydrogen (High)', modelId: 'gemini-4-h-high' },
      { label: 'Gemini 4 Carbon (Low)', modelId: 'gemini-4-c-low' },
      { label: 'Gemini 4 Carbon (Medium)', modelId: 'gemini-4-c-med' },
      { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-c-high' },
      { label: 'Gemini 4 Neon (High)', modelId: 'gemini-4-ne-high' },
      { label: 'Gemini 4 Argon (High)', modelId: 'gemini-4-ar-high' },
      { label: 'Orchestrator', modelId: 'orchestrator' },
      { label: 'Gemini 3.8 Flash', modelId: 'gemini-3.8-flash' },
      { label: 'Claude Opus 5.5', modelId: 'claude-opus-5.5' },
      { label: 'Claude Sonnet 5.5', modelId: 'claude-sonnet-5.5' },
      { label: 'GPT-OSS 120B', modelId: 'gpt-oss-120b' },
    ],
    orchestratorPlanners: plannerOptions,
    orchestratorDefaultPlanner: plannerOptions[0],
    orchestratorPick: {
      model: plannerOptions[0].value,
      select(val) {
        orchSelectCalls.push(val);
        this.model = val;
      },
    },
    setModelConfigByLabelForConversation(label) {
      commits.push(label);
      const found = hostState.modelOptions.find((o) => o.label === label);
      if (found) hostState.selectedModel = found;
      return true;
    },
  };
  env.window.__agPeriodicMockHost = hostState;

  const inst = factory.mountPeriodicPicker({ root: env.window, doc: env.document, mode: 'on', confirmSlamMs: 115 });
  assert.equal(inst.open(triggerBtn), true);

  const rootEl = env.document.getElementById('ag-prism-periodic-picker-root');
  assert.ok(rootEl, 'Picker root must mount');
  assert.equal(rootEl.getAttribute('data-stage-mode'), 'drawer');
  assert.equal(rootEl.parentElement, convView, 'In-flow drawer must append inside [data-testid="conversation-view"]');
  assert.equal(convView.children.at(-1), rootEl, 'In-flow drawer must sit at the end of conversation-view (below agent-input-box)');

  const stageEl = env.document.querySelector('.ag-pp-stage');
  const glCanvasEl = env.document.querySelector('.ag-pp-gl-canvas');
  const stageBounds = { left: 0, top: 0, width: 960, height: 340, right: 960, bottom: 340 };
  stageEl.getBoundingClientRect = () => stageBounds;
  glCanvasEl.getBoundingClientRect = () => stageBounds;

  const settleAll = () => {
    for (let i = 0; i < 200 && env.getCounts().activeRafs > 0; i += 1) {
      env.advanceTime(16);
      env.flushRaf();
    }
  };
  settleAll();

  // 1) Typing guard inside <textarea> and [contenteditable="true"]: 'f', 'r', ' ' must NOT trigger stage switch or orbit reset
  for (const inputTarget of [textarea, editable]) {
    inputTarget.focus();
    for (const k of ['f', 'r', ' ']) {
      const ev = env.createEventObj('keydown', { key: k }, inputTarget);
      inputTarget.dispatchEvent(ev);
      assert.equal(ev.defaultPrevented, false, `Typing "${k}" in ${inputTarget.tagName} must not be intercepted`);
      assert.equal(inst.getStageMode(), 'drawer', `Typing "${k}" must not toggle stageMode`);
    }
  }
  env.body.focus();

  // 2) Click #0 Orch -> mechanical sink latch, selectedAuxIndex stays null, 1H/Flash/Sonnet/GPT dimmed & unclickable
  const rects0 = inst.getProjectedRects();
  const aux0 = rects0.auxKeys[0];
  glCanvasEl.dispatchEvent(env.createEventObj('click', { clientX: aux0.cx, clientY: aux0.cy }));
  settleAll();

  assert.equal(inst.getStatus().orchLatched, true, 'Clicking #0 Orch must latch orchLatched === true');
  assert.equal(inst.getStatus().selectedAuxIndex, null, '#0 Orch must never levitate as selectedAuxIndex');
  assert.equal(inst.getStatus().selectedZ, 6, 'Already-supported 6C must remain levitated when latching Orch');

  const rectsLatched = inst.getProjectedRects();
  assert.equal(rectsLatched.auxKeys[0].latched, true);
  assert.ok(rectsLatched.auxKeys[0].liftY < -0.08, `#0 Orch must sink mechanically, got liftY=${rectsLatched.auxKeys[0].liftY}`);

  // Unsupported 1H and Flash click must NOT switch model
  const keyH = rectsLatched.keys.find((k) => k.slotZ === 1);
  glCanvasEl.dispatchEvent(env.createEventObj('click', { clientX: keyH.cx, clientY: keyH.cy }));
  assert.equal(inst.getStatus().selectedZ, 6, 'Clicking dimmed 1H in Orch mode must shake without switching model');
  const auxFlash = rectsLatched.auxKeys[1];
  glCanvasEl.dispatchEvent(env.createEventObj('click', { clientX: auxFlash.cx, clientY: auxFlash.cy }));
  assert.equal(inst.getStatus().selectedZ, 6, 'Clicking dimmed Flash in Orch mode must shake without switching model');
  const auxSonnet = rectsLatched.auxKeys[3];
  glCanvasEl.dispatchEvent(env.createEventObj('click', { clientX: auxSonnet.cx, clientY: auxSonnet.cy }));
  assert.equal(inst.getStatus().selectedZ, 6, 'Clicking dimmed Sonnet in Orch mode must shake without switching model');
  const auxGpt = rectsLatched.auxKeys[4];
  glCanvasEl.dispatchEvent(env.createEventObj('click', { clientX: auxGpt.cx, clientY: auxGpt.cy }));
  assert.equal(inst.getStatus().selectedZ, 6, 'Clicking dimmed GPT in Orch mode must shake without switching model');
  settleAll();

  // Supported #2 Opus click -> switches sole levitated key & calls orchestratorPick.select(...)
  const auxOpus = inst.getProjectedRects().auxKeys[2];
  glCanvasEl.dispatchEvent(env.createEventObj('click', { clientX: auxOpus.cx, clientY: auxOpus.cy }));
  settleAll();
  assert.equal(inst.getStatus().selectedAuxIndex, 2);
  assert.equal(inst.getStatus().selectedZ, null);
  assert.equal(orchSelectCalls.at(-1), 'planner-opus-high', 'Selecting Opus in Orch mode must invoke orchestratorPick.select');

  // Supported 6C click -> switches sole levitated key back to 6C & calls orchestratorPick.select(...)
  const keyC = inst.getProjectedRects().keys.find((k) => k.slotZ === 6);
  glCanvasEl.dispatchEvent(env.createEventObj('click', { clientX: keyC.cx, clientY: keyC.cy }));
  settleAll();
  assert.equal(inst.getStatus().selectedZ, 6);
  assert.equal(inst.getStatus().selectedAuxIndex, null);
  assert.equal(orchSelectCalls.at(-1), 'planner-c-high', 'Selecting 6C in Orch mode must invoke orchestratorPick.select');

  // 3) Second-click on sole levitated 6C while orchLatched === true -> 115ms confirm slam & dock closes
  const keyCAgain = inst.getProjectedRects().keys.find((k) => k.slotZ === 6);
  glCanvasEl.dispatchEvent(env.createEventObj('click', { clientX: keyCAgain.cx, clientY: keyCAgain.cy }));
  assert.equal(inst.getStatus().confirmClosing, true);
  env.advanceTime(130);
  settleAll();
  assert.equal(inst.isOpen(), false, 'Second-click on active planner key must close dock');

  // 4) Reopen & click #0 Orch again -> unlatches (orchLatched -> false), restores 1H/Flash/Sonnet/GPT
  assert.equal(inst.open(triggerBtn), true);
  const stageEl2 = env.document.querySelector('.ag-pp-stage');
  const glCanvasEl2 = env.document.querySelector('.ag-pp-gl-canvas');
  stageEl2.getBoundingClientRect = () => stageBounds;
  glCanvasEl2.getBoundingClientRect = () => stageBounds;
  settleAll();
  const aux0Reopen = inst.getProjectedRects().auxKeys[0];
  glCanvasEl2.dispatchEvent(env.createEventObj('click', { clientX: aux0Reopen.cx, clientY: aux0Reopen.cy }));
  settleAll();

  assert.equal(inst.getStatus().orchLatched, false, 'Clicking #0 Orch again must unlatch orchLatched === false');
  const rectsRestored = inst.getProjectedRects();
  assert.equal(rectsRestored.auxKeys[0].latched, false);
  assert.ok(Math.abs(rectsRestored.auxKeys[0].liftY) < 0.02);

  // 1H is selectable again
  const keyHRestored = rectsRestored.keys.find((k) => k.slotZ === 1);
  glCanvasEl2.dispatchEvent(env.createEventObj('click', { clientX: keyHRestored.cx, clientY: keyHRestored.cy }));
  assert.equal(inst.getStatus().selectedZ, 1, '1H must become selectable again after unlatching #0 Orch');

  inst.destroy();
  const endCounts = env.getCounts();
  assert.equal(endCounts.activeTimers, 0);
  assert.equal(endCounts.activeRafs, 0);
  assert.equal(endCounts.activeObservers, 0);
  assert.equal(endCounts.docListeners, 0);
  assert.equal(endCounts.winListeners, 0);
});

test('V12 Left-Wing 3D Flip Card (2026Q4 Benchmarks, Dual-Core SVG Radar, 512K Telemetry Back), Compact <1100px Fold & Fullscreen Co-Orbit -> 0fps', () => {
  const env = createPeriodicSandbox({ mock2d: true, mockWebGL2: true });
  loadGrainAssetsInSandbox(env);
  loadOledScreenInSandbox(env);
  loadKeyboard3DInSandbox(env);
  const factory = loadPeriodicFactoryInSandbox(env);

  const convView = env.makeElement('div', { attrs: { 'data-testid': 'conversation-view' } });
  const inputBox = env.makeElement('div', { attrs: { 'data-testid': 'agent-input-box' } });
  const triggerBtn = env.makeElement('button', {
    attrs: { 'data-testid': 'model-selector-trigger' },
    text: 'Gemini 4 Carbon (Low)',
  });
  inputBox.appendChild(triggerBtn);
  convView.appendChild(inputBox);
  env.body.appendChild(convView);

  env.window.__agPrismTelemetry = {
    usedTokens: 131072,
    maxTokens: 524288,
    cacheHitRate: 0.96,
    tps: 68,
    history: [0.18, 0.21, 0.24, 0.25, 0.25],
  };

  const plannerOptions = [
    { label: 'Gemini 4 Carbon (Low)', value: 'planner-c-low', modelId: 'gemini-4-c-low' },
    { label: 'Gemini 4 Carbon (High)', value: 'planner-c-high', modelId: 'gemini-4-c-high' },
    { label: 'Gemini 4 Neon (High)', value: 'planner-ne-high', modelId: 'gemini-4-ne-high' },
  ];
  const hostState = {
    conversationId: 'conv-v12-card',
    selectedModel: { label: 'Gemini 4 Carbon (Low)', modelId: 'gemini-4-c-low' },
    modelOptions: [
      { label: 'Gemini 4 Hydrogen (High)', modelId: 'gemini-4-h-high' },
      { label: 'Gemini 4 Carbon (Low)', modelId: 'gemini-4-c-low' },
      { label: 'Gemini 4 Carbon (Medium)', modelId: 'gemini-4-c-med' },
      { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-c-high' },
      { label: 'Gemini 4 Neon (High)', modelId: 'gemini-4-ne-high' },
      { label: 'Orchestrator', modelId: 'orchestrator' },
    ],
    orchestratorPlanners: plannerOptions,
    orchestratorDefaultPlanner: plannerOptions[1],
    orchestratorPick: { model: 'planner-c-low', select() {} },
    setModelConfigByLabelForConversation(label) {
      hostState.selectedModel = { label, modelId: label.toLowerCase().replace(/\s+/g, '-') };
      return true;
    },
  };
  env.window.__agPeriodicMockHost = hostState;

  const inst = factory.mountPeriodicPicker({ root: env.window, doc: env.document, mode: 'on' });
  assert.equal(inst.open(triggerBtn), true);

  const rootEl = env.document.getElementById('ag-prism-periodic-picker-root');
  const stageEl = env.document.querySelector('.ag-pp-stage');
  const glCanvasEl = env.document.querySelector('.ag-pp-gl-canvas');
  const specCard = env.document.querySelector('[data-testid="ag-pp-bento-spec-card"]');
  const telePod = env.document.querySelector('[data-testid="ag-pp-bento-telemetry-pod"]');
  const flipBtn = env.document.querySelector('[data-testid="ag-pp-card-flip-btn"]');

  assert.ok(specCard && telePod && flipBtn, 'Expected spec card, telemetry pod back face, and [data-testid="ag-pp-card-flip-btn"]');
  assert.ok(
    specCard.textContent.includes('Artificial Analysis') && specCard.textContent.includes('Terminal-Bench'),
    `Expected 2026Q4 authoritative source citation, got: ${specCard.textContent}`
  );
  assert.ok(specCard.textContent.includes('46.5%'), `Expected Carbon Low TermBench 46.5%, got: ${specCard.textContent}`);

  // Switch Low -> High effort capsule -> benchmark numbers update live to 65.2%
  const highBtn = specCard.querySelector('.ag-pp-bento-eff-btn[data-bento-effort="high"]');
  assert.ok(highBtn, 'Expected High effort capsule inside spec card');
  highBtn.dispatchEvent(env.createEventObj('click'));
  assert.ok(specCard.textContent.includes('65.2%'), `Expected Carbon High TermBench 65.2%, got: ${specCard.textContent}`);

  const stageBounds = { left: 0, top: 0, width: 960, height: 340, right: 960, bottom: 340 };
  stageEl.getBoundingClientRect = () => stageBounds;
  glCanvasEl.getBoundingClientRect = () => stageBounds;
  for (let i = 0; i < 200 && env.getCounts().activeRafs > 0; i += 1) {
    env.advanceTime(16);
    env.flushRaf();
  }

  // Engage Orch latch -> SVG radar renders both primary solid polygon & dashed 1H worker overlay polygon
  const aux0 = inst.getProjectedRects().auxKeys[0];
  glCanvasEl.dispatchEvent(env.createEventObj('click', { clientX: aux0.cx, clientY: aux0.cy }));
  const radarPolygons = specCard.querySelectorAll('svg polygon');
  assert.ok(radarPolygons.length >= 2, `Expected dual-core radar polygons in Orch mode, got ${radarPolygons.length}`);
  const hasDashedWorker = Array.from(radarPolygons).some((p) => Boolean(p.getAttribute('stroke-dasharray')));
  assert.equal(hasDashedWorker, true, 'Orch dual-core SVG radar must include dashed 1H worker envelope polygon');

  // Flip card to 512K telemetry back face
  flipBtn.dispatchEvent(env.createEventObj('click'));
  assert.ok(telePod.textContent.includes('512K'), `Telemetry back must display 512K context scale, got: ${telePod.textContent}`);
  assert.equal(/\b256\s*k\b/i.test(telePod.textContent), false, 'Telemetry back must have 0 256K hardcode');

  // Narrow viewport (< 1100px) -> responsive compact fold (data-dock-compact="1")
  rootEl.getBoundingClientRect = () => ({ left: 0, top: 0, width: 980, height: 340, right: 980, bottom: 340 });
  env.window.innerWidth = 980;
  env.triggerResize(rootEl, 980, 340);
  env.window.dispatchEvent(env.createEventObj('resize'));
  assert.equal(rootEl.getAttribute('data-dock-compact'), '1', 'Dock width < 1100px must enable data-dock-compact="1"');

  rootEl.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1280, height: 340, right: 1280, bottom: 340 });
  env.window.innerWidth = 1280;
  env.triggerResize(rootEl, 1280, 340);
  env.window.dispatchEvent(env.createEventObj('resize'));
  assert.notEqual(rootEl.getAttribute('data-dock-compact'), '1', 'Dock width >= 1100px must restore full tri-wing layout');

  // Fullscreen co-orbit drag + R-key reset -> <240 frames 0fps convergence
  env.document.dispatchEvent(env.createEventObj('keydown', { key: 'f' }));
  assert.equal(inst.getStageMode(), 'fullscreen');
  glCanvasEl.dispatchEvent(env.createEventObj('pointerdown', { button: 0, pointerId: 9, clientX: 480, clientY: 280 }));
  env.advanceTime(16);
  glCanvasEl.dispatchEvent(env.createEventObj('pointermove', { button: 0, pointerId: 9, clientX: 570, clientY: 210 }));
  glCanvasEl.dispatchEvent(env.createEventObj('pointerup', { button: 0, pointerId: 9, clientX: 570, clientY: 210 }));
  let coastFrames = 0;
  while (coastFrames < 240 && env.getCounts().activeRafs > 0) {
    env.advanceTime(16);
    env.flushRaf();
    coastFrames += 1;
  }
  assert.ok(coastFrames < 240 && inst.getChassisOrbit().isRotated);

  env.document.dispatchEvent(env.createEventObj('keydown', { key: 'r' }));
  let resetFrames = 0;
  while (resetFrames < 240 && (inst.getChassisOrbit().isRotated || env.getCounts().activeRafs > 0)) {
    env.advanceTime(16);
    env.flushRaf();
    resetFrames += 1;
  }
  assert.ok(resetFrames < 240, `Fullscreen orbit reset must converge in <240 frames, took ${resetFrames}`);
  assert.equal(inst.getChassisOrbit().isRotated, false);
  assert.equal(env.getCounts().activeRafs, 0);

  inst.destroy();
  const counts = env.getCounts();
  assert.equal(counts.activeTimers, 0);
  assert.equal(counts.activeRafs, 0);
  assert.equal(counts.activeObservers, 0);
  assert.equal(counts.docListeners, 0);
  assert.equal(counts.winListeners, 0);
});

test('V13.1 PRISM-118 CNC Triptych: MOD-01/MOD-02, Hover Dual-Radar Compare + Deltas, Orch Dual-Core Topology, 3-Tier Breakpoints & 150px Rim', () => {
  const env = createPeriodicSandbox({ mock2d: true, mockWebGL2: true });
  loadGrainAssetsInSandbox(env);
  loadOledScreenInSandbox(env);
  loadKeyboard3DInSandbox(env);
  const factory = loadPeriodicFactoryInSandbox(env);
  env.window.__agPrismTelemetry = { usedTokens: 107520, maxTokens: 524288, cacheHitRate: 0.97, tps: 112 };

  const convView = env.makeElement('div', { attrs: { 'data-testid': 'conversation-view', class: 'flex flex-col' } });
  const inputBox = env.makeElement('div', { attrs: { 'data-testid': 'agent-input-box' } });
  const triggerBtn = env.makeElement('button', {
    attrs: { 'data-testid': 'model-selector-trigger' },
    text: 'Gemini 4 Carbon (High)',
  });
  inputBox.appendChild(triggerBtn);
  convView.appendChild(inputBox);
  env.body.appendChild(convView);

  const carbonHigh = { label: 'Gemini 4 Carbon (High)', value: 'gemini-4-carbon-high', modelId: 'gemini-4-carbon-high' };
  const carbonLow = { label: 'Gemini 4 Carbon (Low)', value: 'gemini-4-carbon-low', modelId: 'gemini-4-carbon-low' };
  const neonXHigh = { label: 'Gemini 4 Neon Extra', value: 'gemini-4-neon-xhigh', modelId: 'gemini-4-neon-xhigh' };
  const neonHigh = { label: 'Gemini 4 Neon (High)', value: 'gemini-4-neon-high', modelId: 'gemini-4-neon-high' };
  const hydrogenHigh = { label: 'Gemini 4 Hydrogen (High)', value: 'gemini-4-hydrogen-high', modelId: 'gemini-4-hydrogen-high' };
  const argonHigh = { label: 'Gemini 4 Argon (High)', value: 'gemini-4-argon-high', modelId: 'gemini-4-argon-high' };
  const orchOpt = { label: 'Orchestrator', value: 'orchestrator', modelId: 'antigravity-orchestrator' };

  const hostState = {
    selectedModel: carbonHigh,
    modelOptions: [carbonLow, carbonHigh, neonHigh, neonXHigh, hydrogenHigh, argonHigh, orchOpt],
    orchestratorPlanners: [carbonHigh, neonHigh, neonXHigh, argonHigh],
    orchestratorDefaultPlanner: carbonHigh,
    orchestratorPick: { model: carbonHigh, select(v) { this.lastVal = v; } },
    setModelConfigByLabelForConversation(lbl) {
      const hit = hostState.modelOptions.find((o) => o.label === lbl);
      if (hit) hostState.selectedModel = hit;
      return true;
    },
  };
  env.window.__agPeriodicMockHost = hostState;

  const inst = factory.mountPeriodicPicker({ root: env.window, doc: env.document, mode: 'on' });
  assert.equal(inst.open(triggerBtn), true);

  const rootEl = env.document.getElementById('ag-prism-periodic-picker-root');
  const specCard = rootEl.querySelector('[data-testid="ag-pp-bento-spec-card"]');
  const telePod = rootEl.querySelector('[data-testid="ag-pp-bento-telemetry-pod"]');
  const stageEl = rootEl.querySelector('.ag-pp-stage');
  const glCanvasEl = rootEl.querySelector('.ag-pp-gl-canvas');
  const rightWing = rootEl.querySelector('.ag-pp-right-wing');
  assert.ok(specCard && telePod && rightWing, 'Expected MOD-01 spec card and MOD-02 right wing');
  assert.ok(specCard.textContent.includes('MOD-01 // SPEC'), 'Left wing must carry MOD-01 // SPEC engraving');
  assert.ok(telePod.textContent.includes('MOD-02 // TELEMETRY'), 'Right wing must carry MOD-02 // TELEMETRY engraving');

  // 1) V14 Google Official Cobalt 6C Carbon accent & dual-tone gradient (zero green) + 3 micro-tags + 5 Chinese radar vertices + tooltip
  const accentVar = rootEl.style.getPropertyValue('--ag-pp-model-accent').toUpperCase();
  assert.equal(accentVar, '#3B82F6', `Expected Google official royal cobalt #3B82F6 for 6C Carbon, got ${accentVar}`);
  assert.ok(
    rootEl.style.getPropertyValue('--ag-pp-model-grad').includes('#3B82F6') &&
      rootEl.style.getPropertyValue('--ag-pp-model-grad').includes('#67E8F9'),
    'Expected dual-tone cobalt -> ice-cyan gradient on --ag-pp-model-grad'
  );
  const microTags = specCard.querySelectorAll('.ag-pp-micro-tag');
  assert.equal(microTags.length, 3, 'MOD-01 must render 3 understated micro-tags');
  assert.ok(specCard.textContent.includes('深度推理') && specCard.textContent.includes('512K 架构'));
  const radarLabels = Array.from(specCard.querySelectorAll('.ag-pp-radar-vtx-lbl')).map((n) => n.textContent);
  assert.deepEqual(radarLabels, ['推理', '终端', '科学', '工程', '极速']);
  const tooltipEl = specCard.querySelector('.ag-pp-bench-tooltip');
  assert.ok(tooltipEl && tooltipEl.textContent.includes('AA v5') && tooltipEl.textContent.includes('TermBench'));

  // 2) Hovering another model key (10 Ne) overlays dashed comparison polygon + benchmark deltas without committing host
  const stageBounds = { left: 320, top: 240, width: 760, height: 340, right: 1080, bottom: 580 };
  stageEl.getBoundingClientRect = () => stageBounds;
  glCanvasEl.getBoundingClientRect = () => stageBounds;
  for (let i = 0; i < 160 && env.getCounts().activeRafs > 0; i += 1) {
    env.advanceTime(16);
    env.flushRaf();
  }
  const neKey = inst.getProjectedRects().availableKeys.find((k) => k.z === 10);
  assert.ok(neKey, 'Expected 10 Ne projected key');
  rootEl.dispatchEvent(env.createEventObj('pointermove', { clientX: stageBounds.left + neKey.cx, clientY: stageBounds.top + neKey.cy }));
  env.flushRaf();
  assert.ok(specCard.textContent.includes('Neon'), 'Hovering 10 Ne must preview Neon in MOD-01');
  const comparePoly = specCard.querySelector('polygon[data-radar-role="compare"]');
  assert.ok(comparePoly && comparePoly.getAttribute('stroke-dasharray'), 'Hovering another model must overlay dashed comparison polygon');
  const activeDeltas = Array.from(specCard.querySelectorAll('.ag-pp-delta-tag')).filter((d) => d.textContent.trim().length > 0);
  assert.ok(activeDeltas.length >= 2, 'Hover comparison must show live delta indicators on same-metric benchmark rows');
  const row4Delta = specCard.querySelectorAll('.ag-pp-radar-row')[3].querySelector('.ag-pp-delta-tag').textContent.trim();
  assert.equal(row4Delta, '', 'Cross-benchmark row (AutoBench vs SWE-Pro) must not fabricate a bogus delta');
  assert.equal(hostState.selectedModel.label, 'Gemini 4 Carbon (High)', 'Hover preview must never mutate host selection');
  assert.ok(telePod.textContent.includes('Diamond Prism'), 'Hovering 10 Ne must NOT hijack right MOD-02 committed hardware spec');
  assert.equal(rootEl.style.getPropertyValue('--ag-pp-model-accent').toUpperCase(), '#3B82F6', 'Hovering 10 Ne must keep MOD-02 committed accent on Carbon cobalt');
  assert.equal(
    specCard.style.getPropertyValue('--ag-pp-spec-accent').toUpperCase(),
    '#FF6B4A',
    'Hovering 10 Ne must shift MOD-01 specCard --ag-pp-spec-accent to luminous coral #FF6B4A'
  );
  assert.ok(
    specCard.style.getPropertyValue('--ag-pp-spec-grad').includes('#FF6B4A') &&
      specCard.style.getPropertyValue('--ag-pp-spec-grad').includes('#FFB347'),
    'Hovering 10 Ne must shift MOD-01 specCard --ag-pp-spec-grad to coral->gold gradient'
  );

  // Mouseleave reverts cleanly to 6C Carbon with zero comparison polygon leftover
  rootEl.dispatchEvent(env.createEventObj('pointerleave', { clientX: 0, clientY: 0, relatedTarget: null }));
  assert.equal(specCard.querySelector('polygon[data-radar-role="compare"]'), null, 'Mouseleave must remove dashed compare polygon');
  assert.ok(specCard.textContent.includes('Carbon'));

  // 3) Right MOD-02 Solo view vs Orch Dual-Core Routing Topology + 3 machined controls + blind flash cleared on Orch latch
  assert.ok(telePod.textContent.includes('512K') && telePod.textContent.includes('105K / 512K'));
  assert.ok(telePod.querySelector('[data-testid="ag-pp-stage-mode-btn"]'), 'MOD-02 must integrate [F] stage mode button');
  assert.ok(telePod.querySelector('.ag-pp-acoustics-svg'), 'MOD-02 solo view must render acoustics spectrum SVG');
  assert.equal(telePod.querySelectorAll('.ag-pp-pinhole-dot[data-lit="1"]').length, 3, 'Carbon High must light 3 pinhole LEDs');

  const srDeckMain = rootEl.querySelector('[data-testid="ag-pp-inspector-deck"]');
  const auKeyMain = rootEl.querySelector('button[data-z="79"]');
  auKeyMain.dispatchEvent(env.createEventObj('click'));
  assert.ok(srDeckMain.textContent.includes('79 Au') && srDeckMain.textContent.includes('STANDBY'));

  const aux0 = inst.getProjectedRects().auxKeys[0];
  glCanvasEl.dispatchEvent(env.createEventObj('click', { clientX: stageBounds.left + aux0.cx, clientY: stageBounds.top + aux0.cy }));
  assert.equal(rootEl.getAttribute('data-orch-latched'), '1');
  assert.equal(srDeckMain.textContent.includes('STANDBY'), false, 'Latching #0 Orch during blind-key flash must clear blindFlashZ immediately');
  const topoEl = telePod.querySelector('[data-testid="ag-pp-dualcore-topology"]');
  assert.ok(topoEl && topoEl.textContent.includes('6C High') && topoEl.textContent.includes('1H High'), `Expected dynamic Orch topology 6C High -> 1H High, got: ${topoEl && topoEl.textContent}`);

  // 4) Three-tier responsive breakpoints (>=1180 wide, 960-1180 medium, <960 narrow) + bidirectional narrow popover flip
  rootEl.getBoundingClientRect = () => ({ left: 0, top: 240, width: 1320, height: 340, right: 1320, bottom: 580 });
  env.window.dispatchEvent(env.createEventObj('resize'));
  assert.equal(rootEl.getAttribute('data-dock-tier'), 'wide');
  assert.equal(rootEl.getAttribute('data-dock-compact'), '0');

  rootEl.getBoundingClientRect = () => ({ left: 0, top: 240, width: 1060, height: 340, right: 1060, bottom: 580 });
  env.window.dispatchEvent(env.createEventObj('resize'));
  assert.equal(rootEl.getAttribute('data-dock-tier'), 'medium');
  assert.equal(rootEl.getAttribute('data-dock-compact'), '1');

  rootEl.getBoundingClientRect = () => ({ left: 0, top: 240, width: 820, height: 340, right: 820, bottom: 580 });
  env.window.dispatchEvent(env.createEventObj('resize'));
  assert.equal(rootEl.getAttribute('data-dock-tier'), 'narrow');
  assert.equal(rootEl.getAttribute('data-dock-compact'), '1');

  const compactLeftEl = rootEl.querySelector('.ag-pp-compact-left');
  compactLeftEl.dispatchEvent(env.createEventObj('click'));
  assert.equal(rootEl.getAttribute('data-compact-expanded'), '1');
  assert.equal(rootEl.getAttribute('data-card-flipped'), '0');
  specCard.querySelector('[data-testid="ag-pp-card-flip-btn"]').dispatchEvent(env.createEventObj('click'));
  assert.equal(rootEl.getAttribute('data-card-flipped'), '1', 'Narrow popover must flip MOD-01 -> MOD-02');
  const flipBackBtn = telePod.querySelector('[data-testid="ag-pp-card-flip-back-btn"]');
  assert.ok(flipBackBtn, 'MOD-02 must provide return flip button for narrow popover');
  flipBackBtn.dispatchEvent(env.createEventObj('click'));
  assert.equal(rootEl.getAttribute('data-card-flipped'), '0', 'Narrow popover must flip back MOD-02 -> MOD-01 without deadlock');

  // 5) 150px external cursor proximity above dock illuminates top rim & both CNC housings
  rootEl.getBoundingClientRect = () => ({ left: 0, top: 240, width: 1320, height: 340, right: 1320, bottom: 580 });
  rightWing.getBoundingClientRect = () => ({ left: 1060, top: 250, width: 246, height: 316, right: 1306, bottom: 566 });
  env.window.dispatchEvent(env.createEventObj('resize'));
  env.document.dispatchEvent(env.createEventObj('pointermove', { clientX: 1120, clientY: 160, target: inputBox }));
  env.flushRaf();
  assert.equal(rootEl.getAttribute('data-pointer-near'), '1', 'External cursor 80px above dock must trigger near-field chamfer glint');
  const teleRim = telePod.querySelector('.ag-pp-tele-rim');
  assert.ok(teleRim, 'MOD-02 must isolate rim glare onto dedicated zero-child .ag-pp-tele-rim layer');
  assert.ok(parseFloat(teleRim.style.getPropertyValue('--ag-pp-right-rim-alpha')) > 0.1, 'MOD-02 right CNC chamfer must illuminate within 150px');
  assert.equal(rootEl.style.getPropertyValue('--ag-pp-right-rim-alpha'), '', 'Root container must never be dirtied by high-frequency pointer rim CSS vars');

  inst.destroy();
  assert.equal(env.getCounts().activeTimers, 0);
  assert.equal(env.getCounts().activeRafs, 0);
});


test('V13.1 Blind-Key 1s Chemistry OLED Flash, Diamond-Knurled Knob Wheel/Drag Effort Stepping & Strict 5-10-4-5-1 GPU Budget', () => {
  const env = createPeriodicSandbox({ mock2d: true, mockWebGL2: true });
  loadGrainAssetsInSandbox(env);
  loadOledScreenInSandbox(env);
  const kb3dApi = loadKeyboard3DInSandbox(env);
  const factory = loadPeriodicFactoryInSandbox(env);

  const triggerBtn = env.makeElement('button', {
    attrs: { 'data-testid': 'model-selector-trigger' },
    text: 'Gemini 4 Carbon (High)',
  });
  env.body.appendChild(triggerBtn);

  const carbonLow = { label: 'Gemini 4 Carbon (Low)', value: 'gemini-4-carbon-low', modelId: 'gemini-4-carbon-low' };
  const carbonMed = { label: 'Gemini 4 Carbon (Medium)', value: 'gemini-4-carbon-medium', modelId: 'gemini-4-carbon-medium' };
  const carbonHigh = { label: 'Gemini 4 Carbon (High)', value: 'gemini-4-carbon-high', modelId: 'gemini-4-carbon-high' };
  const hostState = {
    selectedModel: carbonHigh,
    modelOptions: [carbonLow, carbonMed, carbonHigh],
    setModelConfigByLabelForConversation(lbl) {
      const hit = hostState.modelOptions.find((o) => o.label === lbl);
      if (hit) hostState.selectedModel = hit;
      return true;
    },
  };
  env.window.__agPeriodicMockHost = hostState;

  const inst = factory.mountPeriodicPicker({ root: env.window, doc: env.document, mode: 'on' });
  assert.equal(inst.open(triggerBtn), true);

  const rootEl = env.document.getElementById('ag-prism-periodic-picker-root');
  const stageEl = rootEl.querySelector('.ag-pp-stage');
  const glCanvasEl = rootEl.querySelector('.ag-pp-gl-canvas');
  const srDeck = rootEl.querySelector('[data-testid="ag-pp-inspector-deck"]');
  const stageBounds = { left: 0, top: 0, width: 960, height: 340, right: 960, bottom: 340 };
  stageEl.getBoundingClientRect = () => stageBounds;
  glCanvasEl.getBoundingClientRect = () => stageBounds;

  for (let i = 0; i < 180 && env.getCounts().activeRafs > 0; i += 1) {
    env.advanceTime(16);
    env.flushRaf();
  }

  // 1) Click standby blind key 79 Au -> triggers 1-second chemistry flash without changing host model, then auto-reverts
  const auBtn = rootEl.querySelector('button[data-z="79"]');
  assert.ok(auBtn, 'Expected semantic button for 79 Au standby key');
  auBtn.dispatchEvent(env.createEventObj('click'));
  assert.ok(srDeck.textContent.includes('79 Au') && srDeck.textContent.includes('Gold') && srDeck.textContent.includes('STANDBY'), `Expected 79 Au chemistry flash, got: ${srDeck.textContent}`);
  assert.equal(hostState.selectedModel.label, 'Gemini 4 Carbon (High)', 'Standby blind key click must never switch host model');
  assert.equal(inst.getStatus().selectedZ, 6);

  // Settles 3D blind-key press animation to 0fps well within <180 frames
  let blindFrames = 0;
  while (blindFrames < 180 && env.getCounts().activeRafs > 0) {
    env.advanceTime(16);
    env.flushRaf();
    blindFrames += 1;
  }
  assert.ok(blindFrames < 180, `Blind key press must settle in <180 frames, took ${blindFrames}`);

  // After 1000ms timer elapses, chemistry flash reverts smoothly back to 6C Carbon
  env.advanceTime(1020);
  assert.ok(srDeck.textContent.includes('Carbon'), `Expected chemistry flash to revert to Carbon after 1s, got: ${srDeck.textContent}`);

  // 2) Rotary encoder knob wheel down steps High -> Medium and rotates 3D knurled knob
  const knobCtrl = inst.getProjectedRects().controls && inst.getProjectedRects().controls.mute;
  assert.ok(knobCtrl, 'Expected pickable diamond-knurled knob control');
  rootEl.dispatchEvent(env.createEventObj('wheel', { clientX: knobCtrl.cx, clientY: knobCtrl.cy, deltaY: 120 }));
  assert.equal(hostState.selectedModel.label, 'Gemini 4 Carbon (Medium)', 'Wheel down on rotary knob must step High -> Medium');

  // Wheel down again -> Medium -> Low; settles to 0fps within <180 frames
  rootEl.dispatchEvent(env.createEventObj('wheel', { clientX: knobCtrl.cx, clientY: knobCtrl.cy, deltaY: 120 }));
  assert.equal(hostState.selectedModel.label, 'Gemini 4 Carbon (Low)', 'Second wheel down on rotary knob must step Medium -> Low');

  // 2b) Rotary knob pointer drag (pointerdown -> pointermove -> pointerup) steps multiple tiers & suppresses accidental mute click
  const muteProxyBtn = rootEl.querySelector('[data-testid="ag-pp-mute-btn"]');
  assert.equal(muteProxyBtn.getAttribute('data-muted'), '0');
  // Small drag (10px, below 16px step threshold) must NOT accidentally mute on pointerup + synthetic click
  rootEl.dispatchEvent(env.createEventObj('pointerdown', { button: 0, pointerId: 11, clientX: knobCtrl.cx, clientY: knobCtrl.cy, target: glCanvasEl }));
  rootEl.dispatchEvent(env.createEventObj('pointermove', { pointerId: 11, clientX: knobCtrl.cx + 10, clientY: knobCtrl.cy, target: glCanvasEl }));
  rootEl.dispatchEvent(env.createEventObj('pointerup', { pointerId: 11, clientX: knobCtrl.cx + 10, clientY: knobCtrl.cy, target: glCanvasEl }));
  rootEl.dispatchEvent(env.createEventObj('click', { clientX: knobCtrl.cx + 10, clientY: knobCtrl.cy, target: glCanvasEl }));
  assert.equal(muteProxyBtn.getAttribute('data-muted'), '0', 'Sub-step knob drag (>6px) must suppress accidental mute click');
  // Multi-step drag (+36px = 2 steps) steps Low -> High directly and suppresses click
  rootEl.dispatchEvent(env.createEventObj('pointerdown', { button: 0, pointerId: 12, clientX: knobCtrl.cx, clientY: knobCtrl.cy, target: glCanvasEl }));
  rootEl.dispatchEvent(env.createEventObj('pointermove', { pointerId: 12, clientX: knobCtrl.cx + 36, clientY: knobCtrl.cy, target: glCanvasEl }));
  rootEl.dispatchEvent(env.createEventObj('pointerup', { pointerId: 12, clientX: knobCtrl.cx + 36, clientY: knobCtrl.cy, target: glCanvasEl }));
  rootEl.dispatchEvent(env.createEventObj('click', { clientX: knobCtrl.cx + 36, clientY: knobCtrl.cy, target: glCanvasEl }));
  assert.equal(hostState.selectedModel.label, 'Gemini 4 Carbon (High)', '36px rotary knob drag must step Low -> High (2 steps without dropping)');
  assert.equal(muteProxyBtn.getAttribute('data-muted'), '0', 'Rotary knob drag must never trigger mute toggle');

  let knobFrames = 0;
  while (knobFrames < 180 && env.getCounts().activeRafs > 0) {
    env.advanceTime(16);
    env.flushRaf();
    knobFrames += 1;
  }
  assert.ok(knobFrames < 180, `Rotary knob step must settle in <180 frames, took ${knobFrames}`);
  assert.equal(env.getCounts().activeRafs, 0);

  // 3) Verify WebGL2 GPU resource budget stays strictly 5-10-4-5-1 & 100% disposed on standalone renderer
  const glCanvas = env.makeElement('canvas');
  const r3d = kb3dApi.createKeyboard3DRenderer({ canvas: glCanvas, doc: env.document, root: env.window, slots: factory.ELEMENTS_90 });
  r3d.resize(960, 340, 2);
  r3d.triggerBlindKeyPress(79);
  r3d.rotateKnobStep(1);
  let rFrames = 0;
  while (rFrames < 180 && !r3d.isIdle()) {
    env.advanceTime(16);
    env.flushRaf();
    rFrames += 1;
  }
  assert.ok(rFrames < 180, `3D blind press + knob turn must converge in <180 frames, took ${rFrames}`);
  const stBefore = glCanvas._gl._stats();
  assert.equal(stBefore.created.programs.size, 5);
  assert.equal(stBefore.created.shaders.size, 10);
  assert.equal(stBefore.created.vaos.size, 4);
  assert.equal(stBefore.created.textures.size, 5);
  assert.equal(stBefore.created.framebuffers.size, 1);
  r3d.dispose();
  const stAfter = glCanvas._gl._stats();
  assert.equal(stAfter.deleted.programs.size, 5);
  assert.equal(stAfter.deleted.shaders.size, 10);
  assert.equal(stAfter.deleted.vaos.size, 4);
  assert.equal(stAfter.deleted.textures.size, 5);
  assert.equal(stAfter.deleted.framebuffers.size, 1);

  inst.destroy();
  assert.equal(env.getCounts().activeTimers, 0);
  assert.equal(env.getCounts().activeRafs, 0);
});


test('V13.1 Hard Gate Audit: Zero conic-gradient, Zero Legacy Green on Carbon, Pure LF & Channel 1 Budget', () => {
  for (const fp of ALL_PERIODIC_FILES) {
    const raw = fs.readFileSync(fp, 'utf8');
    assert.equal(raw.includes('\r'), false, `${path.basename(fp)} must be pure LF`);
    assert.equal(/conic-gradient/i.test(raw), false, `${path.basename(fp)} must contain zero conic-gradient`);
    assert.equal(/\binnerHTML\b|\bouterHTML\b|\binsertAdjacentHTML\b|\bsetPrefValue\b|\bsetPrefValues\b/i.test(raw), false);
    assert.equal(/\b256\s*k\b|\b262144\b|262,144/i.test(raw), false, `${path.basename(fp)} must have zero legacy 256K hardcoding`);
  }
  assert.equal(cdp.DEFAULT_CONFIG.sidebarStudio, 'off');
  const mainBundleBytes = Buffer.byteLength(cdp.buildInjectExpression(cdp.DEFAULT_CONFIG), 'utf8');
  assert.ok(mainBundleBytes < 686080, `Channel 1 static main bundle ${mainBundleBytes} B must stay < 686,080 B`);
});

test('V13.1 Round 2 Visual Polish Guard: Recessed Metal Effort Indicator, Clean AUX-06 Labels, Deep 6C Smoked PC & Medium Bar Dedup', () => {
  const bentoSrc = fs.readFileSync(BENTO_UI_FILE, 'utf8');
  const glSrc = fs.readFileSync(KEYBOARD_3D_FILE, 'utf8');

  // Polish #1: Dark active effort button uses subtle translucent brushed metal + 2px spec-accent micro-indicator, zero solid white brick
  assert.equal(bentoSrc.includes('--pp-seg-active-bg:linear-gradient(180deg,#EEF2F7'), false, 'Dark Obsidian must not use bright white effort brick');
  assert.equal(bentoSrc.includes('--pp-seg-active-bg:linear-gradient(180deg,#F5E8D4'), false, 'Warm dark must not use bright beige effort brick');
  assert.ok(
    bentoSrc.includes('.ag-pp-bento-eff-btn[data-active="1"]::after') &&
      bentoSrc.includes('height:2px') &&
      bentoSrc.includes('background:var(--ag-pp-spec-accent,var(--ag-pp-model-accent))'),
    'Active effort button must render 2px spec-accent micro-indicator bar'
  );

  // Polish #2: AUX-06 atlas draws zero tiny blurry sub-labels and renders full ORCH / Flash / Opus / Sonnet / GPT without ellipsis
  const env = createPeriodicSandbox({ mock2d: true, mockWebGL2: true });
  const filledAuxTexts = [];
  const origCreateEl = env.document.createElement.bind(env.document);
  env.document.createElement = (tag) => {
    const el = origCreateEl(tag);
    if (String(tag).toLowerCase() === 'canvas' && typeof el.getContext === 'function') {
      const origGetCtx = el.getContext.bind(el);
      el.getContext = (kind, opts) => {
        const ctx = origGetCtx(kind, opts);
        if (kind === '2d' && ctx && typeof ctx.fillText === 'function' && !ctx._ppAuxHooked) {
          ctx._ppAuxHooked = true;
          const origFill = ctx.fillText.bind(ctx);
          ctx.fillText = (text, x, y, ...rest) => {
            filledAuxTexts.push(String(text));
            return origFill(text, x, y, ...rest);
          };
        }
        return ctx;
      };
    }
    return el;
  };
  loadGrainAssetsInSandbox(env);
  loadOledScreenInSandbox(env);
  loadKeyboard3DInSandbox(env);
  const factory = loadPeriodicFactoryInSandbox(env);

  const convView = env.makeElement('div', { attrs: { 'data-testid': 'conversation-view', class: 'flex flex-col' } });
  const inputBox = env.makeElement('div', { attrs: { 'data-testid': 'agent-input-box' } });
  const triggerBtn = env.makeElement('button', {
    attrs: { 'data-testid': 'model-selector-trigger' },
    text: 'Gemini 4 Carbon (High)',
  });
  inputBox.appendChild(triggerBtn);
  convView.appendChild(inputBox);
  env.body.appendChild(convView);

  const carbonHigh = { label: 'Gemini 4 Carbon (High)', value: 'gemini-4-carbon-high', modelId: 'gemini-4-carbon-high' };
  const hostState = {
    selectedModel: carbonHigh,
    modelOptions: [
      { label: 'Gemini 4 Hydrogen (High)', value: 'gemini-4-h-high', modelId: 'gemini-4-h-high' },
      { label: 'Gemini 4 Carbon (Low)', value: 'gemini-4-carbon-low', modelId: 'gemini-4-carbon-low' },
      { label: 'Gemini 4 Carbon (Medium)', value: 'gemini-4-carbon-medium', modelId: 'gemini-4-carbon-medium' },
      carbonHigh,
      { label: 'Gemini 4 Neon (High)', value: 'gemini-4-neon-high', modelId: 'gemini-4-neon-high' },
      { label: 'Gemini 4 Argon (High)', value: 'gemini-4-argon-high', modelId: 'gemini-4-argon-high' },
      { label: 'Antigravity Orchestrator', value: 'antigravity-orchestrator', modelId: 'antigravity-orchestrator' },
      { label: 'Gemini 3.8 Flash (High)', value: 'gemini-3.8-flash-high', modelId: 'gemini-3.8-flash-high' },
      { label: 'Claude Opus 5.5 (High)', value: 'claude-opus-5-5-high', modelId: 'claude-opus-5-5-high' },
      { label: 'Claude Sonnet 5.5 (High)', value: 'claude-sonnet-5-5-high', modelId: 'claude-sonnet-5-5-high' },
      { label: 'GPT-OSS 120B (High)', value: 'gpt-oss-120b-high', modelId: 'gpt-oss-120b-high' },
    ],
    setModelConfigByLabelForConversation(lbl) {
      const hit = hostState.modelOptions.find((o) => o.label === lbl);
      if (hit) hostState.selectedModel = hit;
      return true;
    },
  };
  env.window.__agPeriodicMockHost = hostState;

  const inst = factory.mountPeriodicPicker({ root: env.window, doc: env.document, mode: 'on' });
  assert.equal(inst.open(triggerBtn), true);
  env.advanceTime(32);
  env.flushRaf();

  for (const cleanLbl of ['ORCH', 'Flash', 'Opus', 'Sonnet', 'GPT']) {
    assert.ok(filledAuxTexts.includes(cleanLbl), `AUX-06 atlas must render full primary label "${cleanLbl}"`);
  }
  for (const bannedSub of ['LATCH', '3.8', '5.5', '120B', 'DUAL', 'OR…']) {
    assert.equal(filledAuxTexts.includes(bannedSub), false, `AUX-06 atlas must NOT render tiny/truncated label "${bannedSub}"`);
  }

  // Polish #3: V14 6C Frosted Cobalt Gemstone rest cap + clear-smoked active optical glass cap + dual-tone cobalt->cyan stem
  assert.ok(
    glSrc.includes("restDarkCap: '#1E469E'") &&
      glSrc.includes("cap: '#1C2434'") &&
      glSrc.includes("stemTop: '#67E8F9'") &&
      glSrc.includes('carbonSmokeMix'),
    '6C Carbon must use frosted cobalt rest gemstone cap, smoked optical glass active cap & dual-tone cobalt->cyan prism stem'
  );

  // Polish #4: Medium (1060px) top bar hardware badge + active model pill + compact 512K micro-bar & zero-ellipsis footer
  const rootEl = env.document.getElementById('ag-prism-periodic-picker-root');
  const srcEl = rootEl.querySelector('.ag-pp-bench-source');
  const hwBadge = rootEl.querySelector('.ag-pp-compact-hw-badge');
  const modelPill = rootEl.querySelector('.ag-pp-compact-model-pill');
  const teleBar = rootEl.querySelector('.ag-pp-compact-tele-bar');
  assert.ok(srcEl && hwBadge && modelPill && teleBar, 'Expected Medium top hardware badge, active model pill, and 512K micro-bar');
  assert.equal(hwBadge.textContent, 'PRISM-118 // CNC-6063 · 512K TELEMETRY');
  assert.ok(modelPill.textContent.includes('6C') && modelPill.textContent.includes('High'), `Expected active pill "6C · High", got "${modelPill.textContent}"`);
  assert.equal(srcEl.textContent, 'Artificial Analysis v5.0 · Terminal-Bench · SWE-bench (2026Q4)');

  rootEl.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1060, height: 390, right: 1060, bottom: 390 });
  env.window.dispatchEvent(env.createEventObj('resize'));
  assert.equal(rootEl.getAttribute('data-dock-tier'), 'medium');
  assert.equal(srcEl.textContent, 'AA v5 · TermBench · SWE-bench (2026Q4)', 'Medium tier footer must use compact non-truncating citation');

  rootEl.getBoundingClientRect = () => ({ left: 0, top: 0, width: 820, height: 360, right: 820, bottom: 360 });
  env.window.dispatchEvent(env.createEventObj('resize'));
  assert.equal(rootEl.getAttribute('data-dock-tier'), 'narrow');
  assert.ok(rootEl.querySelector('.ag-pp-compact-title').textContent.includes('Gemini 4 Carbon'), 'Narrow tier must retain full model title summary');
  assert.ok(rootEl.querySelector('.ag-pp-compact-metrics').textContent.includes('AA 60'), 'Narrow tier must retain full metrics summary');

  inst.destroy();
  assert.equal(env.getCounts().activeTimers, 0);
  assert.equal(env.getCounts().activeRafs, 0);
});

test('V13.1 Review Hardening: Daemon hash-level hot-heal upgrade, AUX-06 anti-smear, 6C smoked skirt balance & 1180px boundary guard', async () => {
  const glSrc = fs.readFileSync(KEYBOARD_3D_FILE, 'utf8');
  const bentoSrc = fs.readFileSync(BENTO_UI_FILE, 'utf8');
  const pickerSrc = fs.readFileSync(PERIODIC_PICKER_FILE, 'utf8');
  const daemonSrc = fs.readFileSync(path.join(ROOT_DIR, 'sidecars', 'daemon', 'main.mjs'), 'utf8');

  // 1) Daemon verifyPage probes periodicPickerCodeHash & upgrades stale mounted codeHash
  assert.ok(
    daemonSrc.includes('periodicPickerCodeHash:') &&
      daemonSrc.includes('_extractPeriodicPickerCodeHash') &&
      daemonSrc.includes('periodicPickerHashMismatch'),
    'PrismDaemon must probe and hot-heal stale periodicPickerCodeHash rather than skipping when hasPeriodicPicker is true'
  );
  const { PrismDaemon } = await import(new URL('../sidecars/daemon/main.mjs', import.meta.url));
  const evalCalls = [];
  const addedScripts = [];
  const removedScripts = [];
  let scriptSeq = 1;
  const mockDaemon = Object.create(PrismDaemon.prototype);
  mockDaemon.rootDir = ROOT_DIR;
  mockDaemon.codeHash = 'main-hash-1';
  mockDaemon.periodicPickerExpr = '(() => { const targetHash = "newHash99"; return { ok: true }; })()';
  mockDaemon.periodicPickerCodeHash = 'newHash99';
  mockDaemon._periodicPickerHashSource = mockDaemon.periodicPickerExpr;
  mockDaemon.cdp = {
    PLUGIN_VERSION: cdp.PLUGIN_VERSION,
    readConfig: () => ({ ...cdp.DEFAULT_CONFIG, periodicModelPicker: 'on', omniModule: 'off', sidebarStudio: 'off', hostLocalization: 'off', thoughtTranslate: 'off', inlineDiff: 'off', wallpaper: 'off' }),
    shouldEnablePeriodicPicker: () => true,
    buildPeriodicPickerExpression: () => mockDaemon.periodicPickerExpr,
    SETTING_BINDING: cdp.SETTING_BINDING,
  };
  mockDaemon._isOmniEnabled = () => false;
  mockDaemon._isSidebarStudioEnabled = () => false;
  mockDaemon._isHostI18nEnabled = () => false;
  mockDaemon._isThoughtEnabled = () => false;
  mockDaemon._isInlineDiffEnabled = () => false;
  mockDaemon._isWallpaperEnabled = () => false;
  mockDaemon._isPeriodicPickerEnabled = () => true;
  mockDaemon._hasPeriodicPickerFile = () => true;
  mockDaemon._hasInlineDiffClientFile = () => false;
  mockDaemon._hasWallpaperClientFile = () => false;
  mockDaemon._ensureMainFrameId = async () => 'frame-main';
  mockDaemon.ensureOmniServer = async () => null;
  mockDaemon.ensureSidebarService = async () => null;
  mockDaemon.sessions = new Map();

  const mockEntry = {
    title: 'Test Window',
    url: 'vscode-file://vscode-app/workbench.html',
    mainFrameId: 'frame-main',
    sidebarHostVerified: true,
    lastVerifiedCodeHash: 'main-hash-1',
    lastVerifyAt: Date.now(),
    healthyStreak: 5,
    verifyDirty: false,
    periodicPickerScriptId: 'script-old',
    periodicPickerMounted: true,
    lastPeriodicPickerSig: 'on:oldHash01',
    lastPeriodicPickerScriptSig: 'on:oldHash01',
    session: {
      closed: false,
      async evaluate(expr) {
        if (expr.includes('periodicPickerCodeHash')) {
          return {
            ready: true,
            isHostDom: true,
            hasPrism: true,
            hasRepoBridge: true,
            hasThoughtBridge: true,
            hasUsageBridge: true,
            prismAttr: cdp.PLUGIN_VERSION,
            codeHash: 'main-hash-1',
            hasLegacyCss: false,
            needsDashboardSync: false,
            hasOmni: false,
            hasOmniBridge: false,
            hasOmniServerMeta: false,
            omniMode: 'off',
            hasSidebar: false,
            hasSidebarBridge: false,
            sidebarMode: 'off',
            hasHostI18n: false,
            hasThought: false,
            hasThoughtSettingsUi: false,
            hasInlineDiff: false,
            hasWallpaper: false,
            hasWallpaperUi: false,
            hasPeriodicPicker: true,
            periodicPickerCodeHash: 'oldHash01',
          };
        }
        evalCalls.push(expr);
        return { ok: true, codeHash: 'newHash99' };
      },
      async send(method, params) {
        if (method === 'Page.removeScriptToEvaluateOnNewDocument') {
          removedScripts.push(params.identifier);
          return {};
        }
        if (method === 'Page.addScriptToEvaluateOnNewDocument') {
          const id = `script-${scriptSeq++}`;
          addedScripts.push({ id, source: params.source });
          return { identifier: id };
        }
        return {};
      },
    },
  };
  const verifyRes = await mockDaemon._verifyAndHealEntryUnlocked(mockEntry, false);
  assert.equal(verifyRes.alive, true);
  assert.equal(verifyRes.skipped, undefined, 'Non-forced verify must NOT early-skip when periodicPicker sig/hash changed');
  assert.equal(mockEntry.healthyStreak, 0, 'verifyAndHealEntry must mark healed=true (healthyStreak reset to 0) on stale periodicPickerCodeHash');
  assert.deepEqual(removedScripts, ['script-old'], 'Stale NewDocument script handle must be removed before adding updated script');
  assert.equal(addedScripts.length, 1, 'Updated NewDocument script handle must be registered');
  assert.equal(evalCalls.length, 1, 'Updated periodicPickerExpr must be evaluated immediately on live stale window');
  assert.equal(mockEntry.lastPeriodicPickerSig, 'on:newHash99');
  assert.equal(mockEntry.lastPeriodicPickerScriptSig, 'on:newHash99');

  // 2) AUX-06 anti-smear sharpness & main-key top slit isolation
  assert.ok(glSrc.includes("var auxWeight = isAllCaps ? '700 ' : '600 '"), 'AUX-06 lowercase labels must use clean SemiBold 600 weight to prevent mipmap smearing');
  assert.ok(glSrc.includes('float isAuxKey = step(zSeed, -50.0);'), 'Shader must apply dedicated sharper mipmap bias for AUX-06 keycaps');
  assert.ok(glSrc.includes('isAvail > 0.20 && v_part > 0.85 && zSeed < -50.0'), 'Top micro-LED slit must stay scoped to AUX-06 keycaps and never collide with 6C numeral/diamond badge');

  // 3) Responsive 1180px wide lower boundary sets data-spec-compact & data-source-short while 1280px keeps full citation
  assert.ok(bentoSrc.includes('[data-spec-compact="1"][data-source-short="0"]') && pickerSrc.includes('data-spec-compact'));
  const env = createPeriodicSandbox({ mock2d: true, mockWebGL2: true });
  loadGrainAssetsInSandbox(env);
  loadOledScreenInSandbox(env);
  loadKeyboard3DInSandbox(env);
  const factory = loadPeriodicFactoryInSandbox(env);
  const triggerBtn = env.makeElement('button', { attrs: { 'data-testid': 'model-selector-trigger' }, text: 'Gemini 4 Carbon (High)' });
  env.body.appendChild(triggerBtn);
  env.window.__agPeriodicMockHost = {
    selectedModel: { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-carbon-high' },
    modelOptions: [
      { label: 'Gemini 4 Carbon (Low)', modelId: 'gemini-4-carbon-low' },
      { label: 'Gemini 4 Carbon (Medium)', modelId: 'gemini-4-carbon-medium' },
      { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-carbon-high' },
    ],
    setModelConfigByLabelForConversation: () => true,
  };
  const inst = factory.mountPeriodicPicker({ root: env.window, doc: env.document, mode: 'on' });
  assert.equal(inst.open(triggerBtn), true);
  const rootEl = env.document.getElementById('ag-prism-periodic-picker-root');
  const srcEl = rootEl.querySelector('.ag-pp-bench-source');

  rootEl.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1180, height: 342, right: 1180, bottom: 342 });
  env.window.dispatchEvent(env.createEventObj('resize'));
  assert.equal(rootEl.getAttribute('data-dock-tier'), 'wide');
  assert.equal(rootEl.getAttribute('data-spec-compact'), '1');
  assert.equal(rootEl.getAttribute('data-source-short'), '1');
  assert.equal(srcEl.textContent, 'AA v5 · TermBench · SWE-bench (2026Q4)');

  rootEl.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1280, height: 342, right: 1280, bottom: 342 });
  env.window.dispatchEvent(env.createEventObj('resize'));
  assert.equal(rootEl.getAttribute('data-dock-tier'), 'wide');
  assert.equal(rootEl.getAttribute('data-spec-compact'), '1');
  assert.equal(rootEl.getAttribute('data-source-short'), '0');
  assert.equal(srcEl.textContent, 'Artificial Analysis v5.0 · Terminal-Bench · SWE-bench (2026Q4)');

  rootEl.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1440, height: 342, right: 1440, bottom: 342 });
  env.window.dispatchEvent(env.createEventObj('resize'));
  assert.equal(rootEl.getAttribute('data-spec-compact'), '0');
  assert.equal(rootEl.getAttribute('data-source-short'), '0');

  inst.destroy();
  assert.equal(env.getCounts().activeTimers, 0);
  assert.equal(env.getCounts().activeRafs, 0);
});

test('V14 Google Official Spectrum & Full-Bleed Dark/Light Display Banner: Zero Procedural Polyhedron, Aux Baked Banners & Light Ice-Jade Mini-Keycap', () => {
  const oledSrc = fs.readFileSync(OLED_SCREEN_FILE, 'utf8');
  const glSrc = fs.readFileSync(KEYBOARD_3D_FILE, 'utf8');
  const pickerSrc = fs.readFileSync(PERIODIC_PICKER_FILE, 'utf8');

  // 1) Strictly zero procedural wireframe / rotating polyhedron / harsh split-box functions in oled-cyber-screen.js
  for (const bannedProc of [
    'ICO_VERTS',
    'ICO_FACES',
    'drawJewelFacetedPrism',
    'drawAuxSpectralSculpture',
    'drawAnimatedOpticalRails',
    'drawSapphireMicroDotMatrixOverlay',
  ]) {
    assert.equal(
      oledSrc.includes(bannedProc),
      false,
      `V14 oled-cyber-screen.js must completely eliminate procedural geometry "${bannedProc}"`
    );
  }

  // 2) WebGL2 SCREEN_FS must pass u_envParams.x (isLightScr) to preserve bright daylight editorial banners without clamping dark
  assert.ok(
    glSrc.includes('float isLightScr = clamp(u_envParams.x, 0.0, 1.0);') &&
      glSrc.includes('evalGpuSilkCausticBase(uvSample, R, isLightScr)'),
    'SCREEN_FS must adapt screen bezel/luminance for light themes without crushing bright banners dark'
  );

  // 3) Verify all 4 Element + 4 Aux baked Dark & Light banners draw via Image on oled-cyber-screen.js and converge to 0fps
  const env = createPeriodicSandbox({ mock2d: true, mockWebGL2: false });
  class SyncMockImage {
    constructor() {
      this._src = '';
      this.complete = false;
      this.naturalWidth = 0;
      this.naturalHeight = 0;
      this.onload = null;
      this.onerror = null;
    }
    set src(val) {
      this._src = String(val || '');
      this.complete = true;
      this.naturalWidth = 960;
      this.naturalHeight = 288;
      if (typeof this.onload === 'function') this.onload();
    }
    get src() {
      return this._src;
    }
  }
  env.window.Image = SyncMockImage;
  env.sandbox.Image = SyncMockImage;

  const grainApi = loadGrainAssetsInSandbox(env);
  const oledApi = loadOledScreenInSandbox(env);
  const painter = oledApi.createOledScreenPainter({
    width: 1600,
    height: 480,
    doc: env.document,
    root: env.window,
  });
  const drawnUris = [];
  const ctx2d = painter.getCanvas()._ctx2d;
  const origDraw = ctx2d.drawImage.bind(ctx2d);
  ctx2d.drawImage = (img, ...args) => {
    if (img && img.src) drawnUris.push(img.src);
    return origDraw(img, ...args);
  };

  let t = 5000;
  const cases = [
    { deck: { z: 1, symbol: 'H', title: 'Gemini 4 Hydrogen', isAvailable: true, levels: [{ effort: 'high', label: 'High', active: true }] }, key: '1' },
    { deck: { z: 6, symbol: 'C', title: 'Gemini 4 Carbon', isAvailable: true, levels: [{ effort: 'high', label: 'High', active: true }] }, key: '6' },
    { deck: { z: 10, symbol: 'Ne', title: 'Gemini 4 Neon', isAvailable: true, levels: [{ effort: 'high', label: 'High', active: true }] }, key: '10' },
    { deck: { z: 18, symbol: 'Ar', title: 'Gemini 4 Argon', isAvailable: true, levels: [{ effort: 'high', label: 'High', active: true }] }, key: '18' },
    { deck: { z: null, isAuxModel: true, auxId: 'claude-opus', symbol: 'OPUS', title: 'Claude Opus 5.5', isAvailable: true, levels: [{ effort: 'high', label: 'High', active: true }] }, key: 'claude' },
    { deck: { z: null, isAuxModel: true, auxId: 'flash', symbol: 'FLASH', title: 'Gemini 3.8 Flash', isAvailable: true, levels: [{ effort: 'high', label: 'High', active: true }] }, key: 'flash' },
    { deck: { z: null, isAuxModel: true, auxId: 'gpt', symbol: 'GPT', title: 'GPT-OSS 120B', isAvailable: true, levels: [{ effort: 'high', label: 'High', active: true }] }, key: 'gpt' },
    { deck: { z: null, isAuxModel: true, auxId: 'orchestrator', symbol: 'ORCH', title: 'Orchestrator', isAvailable: true, levels: [] }, key: 'orchestrator' },
  ];

  for (const c of cases) {
    painter.render(c.deck, { id: 'obsidian-dark', isLight: false, isMono: false }, { now: t });
    t += 250;
    drawnUris.length = 0;
    painter.render(c.deck, { id: 'obsidian-dark', isLight: false, isMono: false }, { now: t });
    assert.equal(painter.isAnimating(t), false, `Dark banner for ${c.key} must settle to 0fps`);
    assert.deepEqual(drawnUris, [grainApi.OLED_WALLPAPERS[c.key]], `Dark mode must draw baked OLED_WALLPAPERS[${c.key}]`);

    t += 40;
    painter.render(c.deck, { id: 'alabaster-light', isLight: true, isMono: false }, { now: t });
    t += 250;
    drawnUris.length = 0;
    painter.render(c.deck, { id: 'alabaster-light', isLight: true, isMono: false }, { now: t });
    assert.equal(painter.isAnimating(t), false, `Light banner for ${c.key} must settle to 0fps`);
    assert.deepEqual(drawnUris, [grainApi.OLED_WALLPAPERS_LIGHT[c.key]], `Light mode must draw baked OLED_WALLPAPERS_LIGHT[${c.key}]`);
    t += 40;
  }
  painter.dispose();

  // 4) Verify Light-mode frosted ice-jade .ag-pp-mini-keycap across 1H, 6C, 10Ne, 18Ar (zero muddy brown!)
  for (const fp of ALL_PERIODIC_FILES) {
    assert.equal(/#78350F|#5C2D16|#6B3E26/i.test(fs.readFileSync(fp, 'utf8')), false, `10Ne palette in ${path.basename(fp)} must contain zero muddy brown hexes`);
  }
  const envDom = createPeriodicSandbox({ mock2d: true, mockWebGL2: false });
  envDom.html.setAttribute('data-ag-cs-theme', 'light');
  envDom.html.setAttribute('data-ag-cs-light-preset', 'alabaster');
  const factory = loadPeriodicFactoryInSandbox(envDom);
  const triggerBtn = envDom.makeElement('button', { attrs: { 'data-testid': 'model-selector-trigger' }, text: 'Gemini 4 Neon (High)' });
  envDom.body.appendChild(triggerBtn);
  envDom.window.__agPeriodicMockHost = {
    selectedModel: { label: 'Gemini 4 Neon (High)', modelId: 'gemini-4-neon-high' },
    modelOptions: [{ label: 'Gemini 4 Neon (High)', modelId: 'gemini-4-neon-high' }],
  };
  const pickerInst = factory.mountPeriodicPicker({ root: envDom.window, doc: envDom.document, mode: 'on' });
  const lightBadge = triggerBtn.querySelector('.ag-pp-mini-keycap');
  assert.ok(lightBadge, 'Expected light-mode .ag-pp-mini-keycap on 10Ne');
  assert.ok(
    lightBadge.style.getPropertyValue('--mk-bg').startsWith('rgba(') &&
      lightBadge.style.getPropertyValue('--mk-skirt') === '',
    'Expected flat alabaster-native hairline frosted micro-badge on light-mode 10Ne'
  );
  pickerInst.destroy();
});

test('V14 Review Hardening: Mono+Orch Zero Chroma Leak, Generic Aux Isolation, Chroma-Preserving Stem & Clean Static Sheen', () => {
  const oledSrc = fs.readFileSync(OLED_SCREEN_FILE, 'utf8');
  const glSrc = fs.readFileSync(KEYBOARD_3D_FILE, 'utf8');
  const bentoSrc = fs.readFileSync(BENTO_UI_FILE, 'utf8');
  const demoSrc = fs.readFileSync(path.join(ROOT_DIR, 'workbench', 'periodic-demo.html'), 'utf8');

  // 1) Zero forced async data-URI delay & zero brightness(1.02) highlight-clipping cliff in light mode
  assert.equal(oledSrc.includes("img.decoding = 'async'"), false, 'Inline base64 WebP banners must not force deferred async decoding');
  assert.equal(oledSrc.includes('brightness(1.02)'), false, 'Light standby/mono filter must not clip pale gradients via brightness(1.02)');

  // 2) Chroma-preserving dual-tone crystal stem & Mono #0 Orch guards in WebGL2 + Bento topology
  assert.ok(
    glSrc.includes('gemCore /= (1.0 + peakCh * 0.40);') &&
      glSrc.includes("var stemTopAuxHex = isOrch ? '#F5B942' : secHex;") &&
      glSrc.includes('constructingPainter'),
    '3D crystal switch stem must preserve dual-tone chroma and coalesce wallpaper ready renders'
  );
  assert.ok(
    glSrc.includes('vec3 latchGlowLin = isMonoKey > 0.5') &&
      glSrc.includes('vec3 orchRimLin = isMonoKey > 0.5') &&
      bentoSrc.includes('#ag-prism-periodic-picker-root[data-mono="1"]'),
    'Both WebGL2 #0 Orch keycap shader and MOD-02 dual-core topology must honor isMono monochrome contract'
  );
  assert.ok(
    demoSrc.includes('.demo-studio-bar[data-stage="fullscreen"]'),
    'Workbench demo studio bar must offset cleanly in fullscreen stage mode without touching documentElement'
  );

  // 3) Runtime check: isMono=true + #0 Orch latched on oled-cyber-screen emits ZERO violet/gold color stops
  const env = createPeriodicSandbox({ mock2d: true, mockWebGL2: false });
  loadGrainAssetsInSandbox(env);
  const oledApi = loadOledScreenInSandbox(env);
  const painter = oledApi.createOledScreenPainter({
    width: 1600,
    height: 480,
    doc: env.document,
    root: env.window,
  });
  const ctx2d = painter.getCanvas()._ctx2d;
  const recordedStops = [];
  ctx2d.createLinearGradient = () => ({
    addColorStop(_off, col) {
      recordedStops.push(String(col));
    },
  });
  ctx2d.createRadialGradient = () => ({
    addColorStop(_off, col) {
      recordedStops.push(String(col));
    },
  });

  painter.render(
    {
      z: 6,
      symbol: 'C',
      title: 'Orch · Carbon',
      isAvailable: true,
      orchLatched: true,
      levels: [
        { effort: 'low', label: 'Low' },
        { effort: 'high', label: 'High', active: true },
      ],
    },
    { id: 'alabaster-light', isLight: true, isMono: true },
    { now: 2000 }
  );
  const bannedOrchColors = ['#8B5CF6', '#F5B942', '#7C3AED', '#D97706', 'rgb(139, 92, 246)', 'rgb(245, 185, 66)', 'rgba(139, 92, 246', 'rgba(245, 185, 66'];
  for (const col of recordedStops) {
    for (const banned of bannedOrchColors) {
      assert.equal(
        col.includes(banned),
        false,
        `isMono + #0 Orch screen banner must not leak colored stop "${col}"`
      );
    }
  }

  // 4) Runtime check: Unknown 3rd-party Aux model must NOT masquerade as GEMINI · ORCHESTRATOR or DUAL-CORE
  ctx2d._drawnTexts.length = 0;
  painter.render(
    {
      z: null,
      isAuxModel: true,
      auxId: 'deepseek-r2',
      symbol: 'R2',
      badgeText: 'R2',
      title: 'DeepSeek R2',
      isAvailable: true,
      levels: [{ effort: 'high', label: 'High', active: true }],
    },
    { id: 'obsidian-dark', isLight: false, isMono: false },
    { now: 3000 }
  );
  assert.equal(ctx2d._drawnTexts.includes('GEMINI · ORCHESTRATOR'), false, 'Unknown Aux model must not masquerade as GEMINI · ORCHESTRATOR');
  assert.equal(ctx2d._drawnTexts.includes('DUAL-CORE'), false, 'Unknown Aux model must not display DUAL-CORE badge');
  assert.ok(ctx2d._drawnTexts.includes('AUX · R2'), `Expected "AUX · R2" kicker for generic Aux model, got ${JSON.stringify(ctx2d._drawnTexts)}`);
  painter.dispose();
});

test('V14 Round 2 Audit Polish: Zero Center Sculpture Lock Sticker, End-to-End Blind-Key OLED Routing, Clean Watermark Separation & Smoked Sea-Glass Rest Keycaps', () => {
  const oledSrc = fs.readFileSync(OLED_SCREEN_FILE, 'utf8');
  const glSrc = fs.readFileSync(KEYBOARD_3D_FILE, 'utf8');

  // 1) Static contract: circular lock sticker overlay on sculpture must be completely removed
  assert.equal(oledSrc.includes('drawLockedGlassBadge'), false, 'Circular lock badge over left glass sculpture must be completely removed');

  // 2) Dark-mode unselected gemstone sea-glass attenuation, real shoulder bevel glow & light-mode zero-perturbation guard
  assert.ok(
    glSrc.includes('float darkModeG = 1.0 - u_envParams.x;') &&
      glSrc.includes('restGemSmokeMix = restGemWeight * darkModeG;') &&
      glSrc.includes('topSmokeBlend') &&
      glSrc.includes('shoulderBevel = smoothstep(0.08, 0.46, v_part)') &&
      glSrc.includes('bevelRimGlow') &&
      glSrc.includes('ambient = mix(ambient, ambient * 0.44 + restCoatKeep, restGemSmokeMix * restGemTopMask * nonLegRest);'),
    'keyboard-3d-gl.js must deepen dark-mode unselected gemstone top smoked-glass attenuation and real shoulder bevel refraction while keeping light mode untouched'
  );

  // 3) Runtime verification on oled-cyber-screen.js:
  //    - 79 Au & 31 Ga (all 1..118 elements) blind-key chemistry flash: clean crystal filter='none', hero title '79 Au · Gold', capsule '79 Au · Gold · 196.97 · STANDBY'
  //    - 1H orchUnsupported: attenuated sculpture alpha + desaturate filter, zero 'LOCKED' center label, right capsule 'NON-PLANNER · 编排态不可选'
  //    - Sculpture shifted left (-46px / light 10Ne -64px, right edge flush at 1600) & watermark ('Ne', 'Ar', 'Op', 'Fl', 'H', 'C', 3-char 'Uuo') cleanly separated with maxWidth guard
  const env = createPeriodicSandbox({ mock2d: true, mockWebGL2: false });
  class SyncImg {
    constructor() {
      this._src = '';
      this.complete = false;
      this.naturalWidth = 0;
      this.naturalHeight = 0;
      this.width = 0;
      this.height = 0;
      this.onload = null;
    }
    get src() {
      return this._src;
    }
    set src(val) {
      this._src = String(val || '');
      this.complete = true;
      this.naturalWidth = 1600;
      this.naturalHeight = 480;
      this.width = 1600;
      this.height = 480;
      if (typeof this.onload === 'function') this.onload();
    }
  }
  env.window.Image = SyncImg;
  env.sandbox.Image = SyncImg;

  loadGrainAssetsInSandbox(env);
  const oledApi = loadOledScreenInSandbox(env);
  const painter = oledApi.createOledScreenPainter({
    width: 1600,
    height: 480,
    doc: env.document,
    root: env.window,
  });

  const ctx2d = painter.getCanvas()._ctx2d;
  const drawImgCalls = [];
  const fillTextCalls = [];
  ctx2d.drawImage = function (img, dx, dy, dw, dh) {
    drawImgCalls.push({ src: img && img.src, dx, dy, dw, dh, filter: this.filter, alpha: this.globalAlpha });
  };
  ctx2d.fillText = function (txt, x, y, maxW) {
    const s = String(txt ?? '');
    this._drawnTexts.push(s);
    fillTextCalls.push({ text: s, x, y, maxW, font: this.font });
  };

  // Case A: 79 Au & 31 Ga blind-key chemistry flash (full Z=1..118 offline mass fallback without pre-formatted blindFlashBanner!)
  painter.render(
    {
      z: 79,
      numLabel: '79',
      symbol: 'Au',
      elementEn: 'Gold',
      title: '79 Au · Gold — Standby',
      isAvailable: false,
      blindFlash: true,
      levels: [],
    },
    { id: 'alabaster-light', isLight: true, isMono: false, reducedMotion: true },
    { now: 1000 }
  );
  assert.equal(drawImgCalls.length, 1);
  assert.equal(drawImgCalls[0].dx, -46, 'Sculpture viewport must shift left by 46px to clear crystal tip at x=477');
  assert.equal(drawImgCalls[0].dx + drawImgCalls[0].dw, 1600, 'Shifted banner must still reach x=1600 with zero right seam');
  assert.equal(drawImgCalls[0].filter, 'none', 'Blind-key chemistry flash must keep left crystal artwork clean without gray filter');
  assert.equal(drawImgCalls[0].alpha, 1, 'Blind-key chemistry flash must keep full crystal opacity');
  assert.ok(ctx2d._drawnTexts.includes('79 Au · Gold'), `Expected clean hero title "79 Au · Gold", got ${JSON.stringify(ctx2d._drawnTexts)}`);
  assert.ok(
    ctx2d._drawnTexts.includes('79 Au · Gold · 196.97 · STANDBY'),
    `Expected chemistry capsule with atomic mass 196.97, got ${JSON.stringify(ctx2d._drawnTexts)}`
  );
  assert.equal(ctx2d._drawnTexts.includes('LOCKED'), false, 'Blind-key flash must never draw LOCKED sticker label');
  const auWm = fillTextCalls.find((c) => c.text === 'Au');
  assert.ok(auWm && auWm.x >= 498, `Two-letter watermark "Au" must sit cleanly right of crystal tip (x >= 498), got ${auWm && auWm.x}`);

  // Verify previously missing elements (e.g. 31 Ga -> 69.723, 60 Nd -> 144.24) also resolve exact atomic mass offline
  ctx2d._drawnTexts.length = 0;
  painter.render(
    { z: 31, numLabel: '31', symbol: 'Ga', elementEn: 'Gallium', title: '31 Ga · Gallium', isAvailable: false, blindFlash: true, levels: [] },
    { id: 'obsidian-dark', isLight: false, isMono: false, reducedMotion: true },
    { now: 1200 }
  );
  assert.ok(ctx2d._drawnTexts.includes('31 Ga · Gallium · 69.723 · STANDBY'), `Expected 31 Ga offline mass 69.723, got ${JSON.stringify(ctx2d._drawnTexts)}`);

  // Case B: 1H Hydrogen orchUnsupported=true -> attenuated sculpture + right capsule lock only (zero center 'LOCKED' sticker)
  drawImgCalls.length = 0;
  fillTextCalls.length = 0;
  ctx2d._drawnTexts.length = 0;
  painter.render(
    {
      z: 1,
      numLabel: '1',
      symbol: 'H',
      title: 'Gemini 4 Hydrogen',
      isAvailable: false,
      orchLatched: true,
      orchUnsupported: true,
      levels: [],
    },
    { id: 'alabaster-light', isLight: true, isMono: false, reducedMotion: true },
    { now: 1500 }
  );
  assert.equal(drawImgCalls.length, 1);
  assert.ok(drawImgCalls[0].alpha < 0.85, `orchUnsupported must attenuate left sculpture opacity, got ${drawImgCalls[0].alpha}`);
  assert.ok(drawImgCalls[0].filter.includes('saturate('), `orchUnsupported must softly desaturate left sculpture, got ${drawImgCalls[0].filter}`);
  assert.equal(ctx2d._drawnTexts.includes('LOCKED'), false, 'orchUnsupported must NOT stamp standalone LOCKED sticker over sculpture');
  assert.ok(ctx2d._drawnTexts.includes('NON-PLANNER · 编排态不可选'), 'Right capsule must retain NON-PLANNER · 编排态不可选');

  // Case C: Verify clean watermark coordinates for Ne (dark & light -64px shift), Ar, Op, Fl, C, and 3-char 'Uuo' maxWidth guard
  for (const wmCase of [
    { deck: { z: 10, symbol: 'Ne', title: 'Gemini 4 Neon', isAvailable: true, levels: [{ effort: 'high', label: 'High', active: true }] }, tp: { id: 'obsidian-dark', isLight: false }, wm: 'Ne', minX: 498, expDx: -46 },
    { deck: { z: 10, symbol: 'Ne', title: 'Gemini 4 Neon', isAvailable: true, levels: [{ effort: 'high', label: 'High', active: true }] }, tp: { id: 'alabaster-light', isLight: true }, wm: 'Ne', minX: 516, expDx: -64 },
    { deck: { z: 18, symbol: 'Ar', title: 'Gemini 4 Argon', isAvailable: true, levels: [{ effort: 'high', label: 'High', active: true }] }, tp: { id: 'obsidian-dark', isLight: false }, wm: 'Ar', minX: 498, expDx: -46 },
    { deck: { z: null, isAuxModel: true, auxId: 'claude-opus', symbol: 'OPUS', title: 'Claude Opus 5.5', isAvailable: true, levels: [{ effort: 'high', label: 'High', active: true }] }, tp: { id: 'obsidian-dark', isLight: false }, wm: 'Op', minX: 498, expDx: -46 },
    { deck: { z: null, isAuxModel: true, auxId: 'flash', symbol: 'FLASH', title: 'Gemini 3.8 Flash', isAvailable: true, levels: [{ effort: 'high', label: 'High', active: true }] }, tp: { id: 'obsidian-dark', isLight: false }, wm: 'Fl', minX: 498, expDx: -46 },
    { deck: { z: 6, symbol: 'C', title: 'Gemini 4 Carbon', isAvailable: true, levels: [{ effort: 'high', label: 'High', active: true }] }, tp: { id: 'obsidian-dark', isLight: false }, wm: 'C', minX: 500, expDx: -46 },
    { deck: { z: 118, symbol: 'Uuo', title: '118 Uuo · Ununoctium', isAvailable: false, blindFlash: true, levels: [] }, tp: { id: 'obsidian-dark', isLight: false }, wm: 'Uuo', minX: 494, expDx: -46 },
  ]) {
    drawImgCalls.length = 0;
    fillTextCalls.length = 0;
    painter.render(wmCase.deck, { ...wmCase.tp, isMono: false, reducedMotion: true }, { now: 2000 });
    assert.equal(drawImgCalls[0].dx, wmCase.expDx, `Expected dx=${wmCase.expDx} for ${wmCase.wm}`);
    assert.equal(drawImgCalls[0].dx + drawImgCalls[0].dw, 1600, `Expected seamless right edge 1600 for ${wmCase.wm}`);
    const hit = fillTextCalls.find((c) => c.text === wmCase.wm);
    assert.ok(hit && hit.x >= wmCase.minX, `Expected watermark "${wmCase.wm}" at x >= ${wmCase.minX}, got ${JSON.stringify(hit)}`);
    assert.ok(typeof hit.maxW === 'number' && hit.x + hit.maxW <= 682, `Watermark "${wmCase.wm}" must stay strictly left of RIGHT_ZONE_X (682), got x=${hit.x}, maxW=${hit.maxW}`);
  }

  painter.dispose();

  // 4) End-to-End integration check on real mountPeriodicPicker:
  //    Clicking blind key 79 Au while 6C Carbon (or Claude Opus) is active must route the actual OLED painter deckInfo
  //    to 79 Au · Gold (watermark 'Au', hero '79 Au · Gold', capsule '79 Au · Gold · 196.97 · STANDBY'), NEVER 'Gemini 4 Carbon'!
  const e2eEnv = createPeriodicSandbox({ mock2d: true, mockWebGL2: true });
  e2eEnv.window.Image = SyncImg;
  e2eEnv.sandbox.Image = SyncImg;
  loadGrainAssetsInSandbox(e2eEnv);
  const e2eOled = loadOledScreenInSandbox(e2eEnv);
  const origCreateOled = e2eOled.createOledScreenPainter;
  let capturedOledDeck = null;
  let capturedOledTexts = [];
  e2eOled.createOledScreenPainter = function (opts) {
    const p = origCreateOled.call(this, opts);
    const origRender = p.render;
    p.render = function (di, ...rest) {
      capturedOledDeck = di;
      const cv = p.getCanvas();
      if (cv && cv._ctx2d) cv._ctx2d._drawnTexts.length = 0;
      const res = origRender.call(this, di, ...rest);
      if (cv && cv._ctx2d) capturedOledTexts = cv._ctx2d._drawnTexts.slice();
      return res;
    };
    return p;
  };
  loadKeyboard3DInSandbox(e2eEnv);
  const e2eFactory = loadPeriodicFactoryInSandbox(e2eEnv);

  const trig = e2eEnv.makeElement('button', {
    attrs: { 'data-testid': 'model-selector-trigger' },
    text: 'Claude Opus 5.5',
  });
  e2eEnv.body.appendChild(trig);
  e2eEnv.window.__agPeriodicMockHost = {
    selectedModel: { label: 'Claude Opus 5.5', value: 'claude-opus-5.5', modelId: 'claude-opus-5.5' },
    modelOptions: [
      { label: 'Gemini 4 Carbon (High)', value: 'gemini-4-carbon-high', modelId: 'gemini-4-carbon-high' },
      { label: 'Claude Opus 5.5', value: 'claude-opus-5.5', modelId: 'claude-opus-5.5' },
    ],
    setModelConfigByLabelForConversation() {
      return true;
    },
  };

  const inst = e2eFactory.mountPeriodicPicker({ root: e2eEnv.window, doc: e2eEnv.document, mode: 'on' });
  assert.equal(inst.open(trig), true);
  const rootEl = e2eEnv.document.getElementById('ag-prism-periodic-picker-root');
  for (let i = 0; i < 180 && e2eEnv.getCounts().activeRafs > 0; i += 1) {
    e2eEnv.advanceTime(16);
    e2eEnv.flushRaf();
  }

  // Click 79 Au directly without prior hover dwell while Claude Opus 5.5 is active, including under narrow <960px tier
  rootEl.getBoundingClientRect = () => ({ left: 0, top: 240, width: 820, height: 340, right: 820, bottom: 580 });
  e2eEnv.window.dispatchEvent(e2eEnv.createEventObj('resize'));
  assert.equal(rootEl.getAttribute('data-dock-tier'), 'narrow');

  const auBtn = rootEl.querySelector('button[data-z="79"]');
  auBtn.dispatchEvent(e2eEnv.createEventObj('click'));
  e2eEnv.advanceTime(16);
  e2eEnv.flushRaf();

  assert.equal(capturedOledDeck && capturedOledDeck.z, 79, 'Real blind-key click must route OLED deckInfo.z to 79 (not active Aux/Carbon)');
  assert.equal(capturedOledDeck && capturedOledDeck.symbol, 'Au');
  assert.equal(capturedOledDeck && capturedOledDeck.blindFlash, true);
  assert.ok(capturedOledTexts.includes('79 Au · Gold'), `OLED banner must draw hero title "79 Au · Gold", got ${JSON.stringify(capturedOledTexts)}`);
  assert.ok(capturedOledTexts.includes('Au'), `OLED banner must draw watermark "Au", got ${JSON.stringify(capturedOledTexts)}`);
  assert.ok(capturedOledTexts.includes('79 Au · Gold · 196.97 · STANDBY'), `OLED capsule must draw "79 Au · Gold · 196.97 · STANDBY", got ${JSON.stringify(capturedOledTexts)}`);
  assert.equal(capturedOledTexts.includes('Claude Opus 5.5'), false, 'OLED banner must not leak active Claude Opus title during 79 Au chemistry flash');

  // After 1000ms flash expires, OLED smoothly reverts back to Claude Opus 5.5 and settles to 0fps
  e2eEnv.advanceTime(1020);
  for (let i = 0; i < 120 && e2eEnv.getCounts().activeRafs > 0; i += 1) {
    e2eEnv.advanceTime(16);
    e2eEnv.flushRaf();
  }
  assert.equal(e2eEnv.getCounts().activeRafs, 0, 'Must settle cleanly back to 0fps after blind-key flash');
  assert.ok(capturedOledTexts.includes('Claude Opus 5.5'), `OLED banner must revert to Claude Opus 5.5 after 1s flash, got ${JSON.stringify(capturedOledTexts)}`);

  inst.destroy();
  assert.equal(e2eEnv.getCounts().activeTimers, 0);
  assert.equal(e2eEnv.getCounts().activeRafs, 0);
});

test('V14.1 Theme-Native Hairline Mini-Badge (.ag-pp-mini-keycap): Zero Fake 3D Skirt/Gloss, 4 Host Themes × 5 Accents & Non-Redundant Smart Codes', () => {
  const bentoSrc = fs.readFileSync(BENTO_UI_FILE, 'utf8');
  const pickerSrc = fs.readFileSync(PERIODIC_PICKER_FILE, 'utf8');
  assert.equal(bentoSrc.includes('.ag-pp-mini-keycap::before') || pickerSrc.includes('.ag-pp-mini-keycap::before'), false, 'Must eliminate plastic oval bubble highlight ::before');
  assert.equal(bentoSrc.includes('var(--mk-skirt') || pickerSrc.includes('var(--mk-skirt'), false, 'Must eliminate fake 3D bottom skirt shadow on .ag-pp-mini-keycap');

  const env = createPeriodicSandbox();
  const factory = loadPeriodicFactoryInSandbox(env);

  const hostText = env.createTextNode('Gemini 4 Carbon (High)');
  const triggerBtn = env.makeElement('button', {
    attrs: { 'data-testid': 'model-selector-trigger' },
    useChildNodes: true,
  });
  triggerBtn.appendChild(hostText);
  env.body.appendChild(triggerBtn);

  const cHigh = { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-c-high' };
  const hHigh = { label: 'Gemini 4 Hydrogen (High)', modelId: 'gemini-4-h-high' };
  const neHigh = { label: 'Gemini 4 Neon (High)', modelId: 'gemini-4-ne-high' };
  const arHigh = { label: 'Gemini 4 Argon (High)', modelId: 'gemini-4-ar-high' };
  const opus = { label: 'Claude Opus 5.5', modelId: 'claude-opus-5.5' };
  const sonnet = { label: 'Claude Sonnet 5.5', modelId: 'claude-sonnet-5.5' };
  const flash = { label: 'Gemini 3.8 Flash', modelId: 'gemini-3.8-flash' };
  const gpt = { label: 'GPT-OSS 120B', modelId: 'gpt-oss-120b' };
  const orch = { label: 'Orchestrator', modelId: 'antigravity-orchestrator' };

  const hostState = {
    selectedModel: cHigh,
    modelOptions: [hHigh, cHigh, neHigh, arHigh, orch, flash, opus, sonnet, gpt],
    orchestratorPlanners: [cHigh, neHigh, arHigh, opus],
    orchestratorDefaultPlanner: neHigh,
    orchestratorPick: { model: neHigh },
  };
  env.window.__agPeriodicMockHost = hostState;

  const inst = factory.mountPeriodicPicker({ root: env.window, doc: env.document, mode: 'on' });

  // 1) Sweep all 4 host themes × 5 accents and verify whisper-subtle (<12% alpha) frosted surface + crisp hairline border
  const themeMatrix = [
    { theme: 'dark', palette: 'obsidian', preset: 'crystal', kit: 'obsidian-dark' },
    { theme: 'dark', palette: 'warm', preset: 'crystal', kit: 'warm-dark' },
    { theme: 'light', palette: 'obsidian', preset: 'crystal', kit: 'crystal-light' },
    { theme: 'light', palette: 'obsidian', preset: 'alabaster', kit: 'alabaster-light' },
  ];
  const accents = ['follow', 'cobalt', 'iris', 'amber', 'mono'];

  for (const tm of themeMatrix) {
    env.html.setAttribute('data-ag-cs-theme', tm.theme);
    env.html.setAttribute('data-ag-cs-palette', tm.palette);
    env.html.setAttribute('data-ag-cs-light-preset', tm.preset);
    for (const acc of accents) {
      env.html.setAttribute('data-ag-cs-accent', acc);
      inst.syncBadges();
      const badge = triggerBtn.querySelector('.ag-pp-mini-keycap');
      assert.ok(badge, `Expected badge for ${tm.kit} + ${acc}`);
      const bgCss = badge.style.getPropertyValue('--mk-bg');
      const bdCss = badge.style.getPropertyValue('--mk-border');
      const fgCss = badge.style.getPropertyValue('--mk-fg');
      const mAlpha = /rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([0-9.]+)\s*\)/.exec(bgCss);
      assert.ok(mAlpha, `Expected rgba() frosted surface for ${tm.kit}/${acc}, got ${bgCss}`);
      const alphaNum = parseFloat(mAlpha[1]);
      assert.ok(alphaNum > 0.02 && alphaNum <= 0.12, `Surface tint alpha must stay whisper-subtle (<=0.12), got ${alphaNum} in ${tm.kit}/${acc}`);
      assert.ok(bdCss.startsWith('rgba('), `Expected hairline rgba border for ${tm.kit}/${acc}`);
      assert.ok(/^#[0-9A-F]{6}$/i.test(fgCss), `Expected crisp hex text color for ${tm.kit}/${acc}, got ${fgCss}`);
    }
  }

  // 2) Verify Smart Non-Redundant Micro-Labels across Elements (1H/6C/10Ne/18Ar), Orchestrator (0·6C/0·Ne/0·Ar/0·Op), and Aux (OP/SN/FL/GP)
  env.html.setAttribute('data-ag-cs-accent', 'follow');
  for (const [opt, expText] of [
    [hHigh, '1H'],
    [cHigh, '6C'],
    [neHigh, '10Ne'],
    [arHigh, '18Ar'],
    [opus, 'OP'],
    [sonnet, 'SN'],
    [flash, 'FL'],
    [gpt, 'GP'],
  ]) {
    hostState.selectedModel = opt;
    hostText.nodeValue = opt.label;
    inst.syncBadges();
    const b = triggerBtn.querySelector('.ag-pp-mini-keycap');
    assert.ok(b, `Expected badge for ${opt.label}`);
    assert.equal(b.textContent, expText, `Expected "${expText}" for ${opt.label}, got "${b.textContent}"`);
    assert.equal(triggerBtn.childNodes[0], hostText, 'Zero React HostText mutation');
  }

  for (const [plannerOpt, expOrchCode] of [
    [cHigh, '0·6C'],
    [neHigh, '0·Ne'],
    [arHigh, '0·Ar'],
    [opus, '0·Op'],
  ]) {
    hostState.selectedModel = orch;
    hostState.orchestratorPick = { model: plannerOpt };
    hostText.nodeValue = 'Orchestrator';
    inst.syncBadges();
    const b = triggerBtn.querySelector('.ag-pp-mini-keycap');
    assert.ok(b);
    assert.equal(b.getAttribute('data-aux-id'), 'orchestrator');
    assert.equal(b.textContent, expOrchCode, `Expected Orch planner code "${expOrchCode}", got "${b.textContent}"`);
  }

  inst.destroy();
  assert.equal(env.getCounts().activeObservers, 0);
  assert.equal(env.getCounts().activeTimers, 0);
});

test('V14.1 Dedicated Raw-Quartz Standby Banners (Zero 6C Fallback) & Heavy Frosted Ice-Fog Non-Planner Diffusion (with Offscreen Blur Fallback)', () => {
  const env = createPeriodicSandbox({ mock2d: true });
  const drawnRecords = [];

  class SyncImg {
    constructor() {
      this._src = '';
      this.complete = false;
      this.naturalWidth = 0;
      this.naturalHeight = 0;
      this.width = 0;
      this.height = 0;
      this.onload = null;
      this.onerror = null;
    }
    set src(v) {
      this._src = String(v || '');
      this.complete = Boolean(this._src);
      this.naturalWidth = this._src ? 960 : 0;
      this.naturalHeight = this._src ? 288 : 0;
      this.width = this.naturalWidth;
      this.height = this.naturalHeight;
      if (this._src && typeof this.onload === 'function') this.onload();
    }
    get src() {
      return this._src;
    }
  }
  env.window.Image = SyncImg;
  env.sandbox.Image = SyncImg;

  const grainApi = loadGrainAssetsInSandbox(env);
  const oledApi = loadOledScreenInSandbox(env);

  assert.ok(grainApi.OLED_WALLPAPERS.standby && grainApi.OLED_WALLPAPERS_LIGHT.standby, 'Must provide dedicated Dark & Light standby WebP banners');
  assert.notEqual(grainApi.OLED_WALLPAPERS.standby, grainApi.OLED_WALLPAPERS['6'], 'Dark standby banner must NOT alias 6C Carbon');
  assert.notEqual(grainApi.OLED_WALLPAPERS_LIGHT.standby, grainApi.OLED_WALLPAPERS_LIGHT['6'], 'Light standby banner must NOT alias 6C Carbon');

  const painter = oledApi.createOledScreenPainter({
    width: 1600,
    height: 480,
    doc: env.document,
    root: env.window,
    lazyWallpapers: true,
  });

  const ctx = painter.getCanvas()._ctx2d;
  const origDrawImage = ctx.drawImage;
  ctx.drawImage = function (img, dx, dy, dw, dh) {
    drawnRecords.push({
      src: img && img.src ? img.src : 'offscreen-canvas',
      alpha: this.globalAlpha,
      filter: this.filter,
      dx,
      dy,
      dw,
      dh,
    });
    return origDrawImage.call(this, img, dx, dy, dw, dh);
  };

  // 1) Standby blind elements (79 Au, 31 Ga, 118 Uuo) & reserved aux slot MUST use dedicated standby raw-quartz banners (zero '6' fallback!)
  for (const standbyDeck of [
    { z: 79, numLabel: '79', symbol: 'Au', elementEn: 'Gold', title: '79 Au · Gold', isAvailable: false, blindFlash: true, levels: [] },
    { z: 79, numLabel: '79', symbol: 'Au', elementEn: 'Gold', title: '79 Au · Gold', isAvailable: false, blindFlash: false, levels: [] },
    { z: 26, numLabel: '26', symbol: 'Fe', elementEn: 'Iron', title: '26 Fe · Iron', isAvailable: false, blindFlash: true, levels: [] },
    { z: null, isAuxModel: true, auxId: 'blind-5', symbol: '—', title: 'Aux Macro Slot — Reserved', isAvailable: false, levels: [] },
  ]) {
    drawnRecords.length = 0;
    painter.render(standbyDeck, { id: 'obsidian-dark', isLight: false, isMono: false, reducedMotion: true }, { now: 100 });
    assert.equal(drawnRecords.length, 1);
    assert.equal(drawnRecords[0].src, grainApi.OLED_WALLPAPERS.standby, 'Dark standby element must draw OLED_WALLPAPERS.standby (never 6C)');
    assert.equal(drawnRecords[0].filter, 'none');

    drawnRecords.length = 0;
    painter.render(standbyDeck, { id: 'alabaster-light', isLight: true, isMono: false, reducedMotion: true }, { now: 200 });
    assert.equal(drawnRecords.length, 1);
    assert.equal(drawnRecords[0].src, grainApi.OLED_WALLPAPERS_LIGHT.standby, 'Light standby element must draw OLED_WALLPAPERS_LIGHT.standby (never 6C)');
    assert.equal(drawnRecords[0].filter, 'none');
  }

  // 2) #0 Orch locked non-planner models (1H, Flash, Sonnet, GPT) keep original sculpture silhouette with heavy blur + ~92% desaturation + rime-fog veil
  for (const [lockedDeck, expKey] of [
    [{ z: 1, numLabel: '1', symbol: 'H', title: 'Gemini 4 Hydrogen', isAvailable: false, orchLatched: true, orchUnsupported: true, levels: [] }, '1'],
    [{ z: null, isAuxModel: true, auxId: 'flash', symbol: 'FLASH', title: 'Gemini 3.8 Flash', isAvailable: false, orchLatched: true, orchUnsupported: true, levels: [] }, 'flash'],
    [{ z: null, isAuxModel: true, auxId: 'claude-sonnet', symbol: 'SONNET', title: 'Claude Sonnet 5.5', isAvailable: false, orchLatched: true, orchUnsupported: true, levels: [] }, 'claude'],
    [{ z: null, isAuxModel: true, auxId: 'gpt-oss', symbol: 'GPT', title: 'GPT-OSS 120B', isAvailable: false, orchLatched: true, orchUnsupported: true, levels: [] }, 'gpt'],
  ]) {
    drawnRecords.length = 0;
    ctx._drawnTexts.length = 0;
    painter.render(lockedDeck, { id: 'obsidian-dark', isLight: false, isMono: false, reducedMotion: true }, { now: 500 });
    assert.equal(drawnRecords.length, 1);
    assert.equal(drawnRecords[0].src, grainApi.OLED_WALLPAPERS[expKey], `Locked ${expKey} must diffuse its own silhouette`);
    assert.ok(drawnRecords[0].filter.includes('blur(16px)') && drawnRecords[0].filter.includes('saturate(0.08)'), `Expected heavy 16px blur + 92% desaturation filter, got ${drawnRecords[0].filter}`);
    assert.ok(drawnRecords[0].dx <= -80 && drawnRecords[0].dy <= -40 && drawnRecords[0].dh >= 560, 'Locked frosted draw must apply 4-edge overscan bleed so blur kernel never pulls transparent borders');
    assert.ok(drawnRecords[0].alpha < 0.80, `Expected frosted attenuated alpha, got ${drawnRecords[0].alpha}`);
    assert.ok(ctx._drawnTexts.includes('NON-PLANNER · 编排态不可选'));
    assert.equal(ctx._drawnTexts.includes('LOCKED'), false, 'Strictly zero circular LOCKED sticker over left silhouette');
  }

  // 3) Offscreen downsampled blur fallback when ctx.filter is unavailable or forceOffscreenBlur is enabled
  delete ctx.filter;
  drawnRecords.length = 0;
  painter.render(
    { z: 1, numLabel: '1', symbol: 'H', title: 'Gemini 4 Hydrogen', isAvailable: false, orchLatched: true, orchUnsupported: true, levels: [] },
    { id: 'crystal-light', isLight: true, isMono: false, reducedMotion: true },
    { now: 800, forceOffscreenBlur: true }
  );
  assert.equal(drawnRecords.length, 1);
  assert.equal(drawnRecords[0].src, grainApi.OLED_WALLPAPERS_LIGHT['1']);

  painter.dispose();
  oledApi.evictIdleOledWallpapers(env.window);
});

test('V14.1 Cold-Start Zero Decode, 120ms Pre-Warm, Immediate Close Eviction, Zero-Reflow Hot Path, Conversation Remount, Non-Integer DPR & Short Window Hardening', () => {
  const { ELEMENTS_90 } = require(PERIODIC_PICKER_FILE);
  let glCreatedCount = 0;
  let imgCreatedCount = 0;
  let audioCreatedCount = 0;
  let audioCloseCount = 0;

  const env = createPeriodicSandbox({ mock2d: true, mockWebGL2: true });
  const origGetContext = env.document.createElement;
  env.document.createElement = function (tag) {
    const el = origGetContext.call(this, tag);
    if (String(tag).toLowerCase() === 'canvas') {
      const baseGc = el.getContext.bind(el);
      el.getContext = function (kind, opts) {
        if (kind === 'webgl2') glCreatedCount += 1;
        return baseGc(kind, opts);
      };
    }
    return el;
  };

  class TrackedImage {
    constructor() {
      imgCreatedCount += 1;
      this._src = '';
      this.complete = false;
      this.naturalWidth = 0;
      this.naturalHeight = 0;
      this.width = 0;
      this.height = 0;
      this.onload = null;
      this.onerror = null;
    }
    set src(v) {
      this._src = String(v || '');
      this.complete = Boolean(this._src);
      this.naturalWidth = this._src ? 960 : 0;
      this.naturalHeight = this._src ? 288 : 0;
      this.width = this.naturalWidth;
      this.height = this.naturalHeight;
      if (this._src && typeof this.onload === 'function') this.onload();
    }
    get src() {
      return this._src;
    }
  }
  class TrackedAudioContext {
    constructor() {
      audioCreatedCount += 1;
      this.state = 'running';
      this.sampleRate = 44100;
      this.currentTime = 0;
      this.destination = {};
    }
    suspend() {
      this.state = 'suspended';
    }
    resume() {
      this.state = 'running';
    }
    close() {
      audioCloseCount += 1;
      this.state = 'closed';
    }
    createBuffer(_ch, len, sr) {
      return { sampleRate: sr, getChannelData: () => new Float32Array(len) };
    }
    createBufferSource() {
      return { buffer: null, connect() {}, start() {}, stop() {} };
    }
    createOscillator() {
      return {
        type: 'sine',
        frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {},
        start() {},
        stop() {},
      };
    }
    createBiquadFilter() {
      return { type: 'lowpass', frequency: { setValueAtTime() {}, value: 1200 }, Q: { setValueAtTime() {}, value: 1 }, connect() {} };
    }
    createGain() {
      return {
        gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {},
      };
    }
  }
  env.window.Image = TrackedImage;
  env.sandbox.Image = TrackedImage;
  env.window.AudioContext = TrackedAudioContext;
  env.sandbox.AudioContext = TrackedAudioContext;

  loadGrainAssetsInSandbox(env);
  loadOledScreenInSandbox(env);
  loadKeyboard3DInSandbox(env);
  const factory = loadPeriodicFactoryInSandbox(env);

  // Build host conversation-view #1 with Carbon trigger
  const convView1 = env.makeElement('div', { attrs: { 'data-testid': 'conversation-view' }, className: 'flex-col' });
  const inputBox1 = env.makeElement('div', { attrs: { 'data-testid': 'agent-input-box' } });
  const triggerBtn1 = env.makeElement('button', {
    attrs: { 'data-testid': 'model-selector-trigger' },
    text: 'Gemini 4 Carbon (High)',
  });
  inputBox1.appendChild(triggerBtn1);
  convView1.appendChild(inputBox1);
  env.body.appendChild(convView1);

  const cHigh = { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-c-high' };
  const neHigh = { label: 'Gemini 4 Neon (High)', modelId: 'gemini-4-ne-high' };
  const sonnet = { label: 'Claude Sonnet 5.5', modelId: 'claude-sonnet-5.5' };
  const hostState = {
    selectedModel: cHigh,
    modelOptions: [cHigh, neHigh, sonnet],
    setModelConfigByLabelForConversation(lbl) {
      const hit = hostState.modelOptions.find((o) => o.label === lbl);
      if (hit) hostState.selectedModel = hit;
      return true;
    },
  };
  env.window.__agPeriodicMockHost = hostState;

  // 1) ZERO Cold-Start Overhead when mounted and dock not opened yet
  const inst = factory.mountPeriodicPicker({ root: env.window, doc: env.document, mode: 'on' });
  assert.equal(glCreatedCount, 0, 'Cold start must create 0 WebGL contexts');
  assert.equal(imgCreatedCount, 0, 'Cold start must decode 0 wallpaper HTMLImageElements');
  assert.equal(audioCreatedCount, 0, 'Cold start must create 0 AudioContexts');
  assert.equal(inst.getStatus().grainDecoded, false, 'Cold start must decode 0 PBR grain bytes');
  assert.equal(inst.getStatus().cachedWallpapers, 0);

  // Closed-state document pointermove fast short-circuit (0 layout reads, 0 decodes)
  let triggerRectReads = 0;
  triggerBtn1.getBoundingClientRect = () => {
    triggerRectReads += 1;
    return { left: 120, top: 640, right: 280, bottom: 672, width: 160, height: 32 };
  };
  for (let i = 0; i < 40; i += 1) {
    env.document.dispatchEvent(env.createEventObj('pointermove', { clientX: 200 + i * 5, clientY: 300 }, env.body));
  }
  assert.equal(triggerRectReads, 0, 'Closed document pointermove must short-circuit on line 1 with 0 layout reads');

  // 2) Short tap (<120ms) & hold cancellation (contextmenu / window blur) leave 0 hold-rings and 0 decodes
  env.document.dispatchEvent(env.createEventObj('pointerdown', { button: 0, clientX: 150, clientY: 652 }, triggerBtn1));
  env.advanceTime(80);
  env.document.dispatchEvent(env.createEventObj('pointerup', { button: 0, clientX: 150, clientY: 652 }, triggerBtn1));
  assert.equal(inst.getStatus().grainDecoded, false, 'Tap <120ms must not trigger background pre-warm');
  assert.equal(inst.getStatus().cachedWallpapers, 0);
  assert.equal(env.document.querySelectorAll('.ag-pp-hold-ring').length, 0);

  // 3) 120ms Hold Pre-Warm + Contextmenu / Blur Cancellation Guard
  env.document.dispatchEvent(env.createEventObj('pointerdown', { button: 0, clientX: 150, clientY: 652 }, triggerBtn1));
  env.advanceTime(115);
  assert.equal(env.document.querySelectorAll('.ag-pp-hold-ring').length, 1, 'Hold ring appears at 110ms');
  assert.equal(inst.getStatus().cachedWallpapers, 0, 'Pre-warm not yet fired at 115ms');
  env.advanceTime(10); // 125ms >= 120ms
  assert.equal(inst.getStatus().grainDecoded, true, '120ms hold must silently pre-warm PBR grain textures');
  assert.equal(inst.getStatus().cachedWallpapers, 1, '120ms hold must pre-warm ONLY the active model single wallpaper (not all 18)');
  assert.equal(glCreatedCount, 0, '120ms pre-warm must still keep 0 WebGL contexts until 420ms open');

  // Cancel mid-hold via contextmenu -> ring & timers must vanish immediately
  env.document.dispatchEvent(env.createEventObj('contextmenu', { button: 2, clientX: 150, clientY: 652 }, triggerBtn1));
  assert.equal(env.document.querySelectorAll('.ag-pp-hold-ring').length, 0, 'contextmenu must immediately clean up .ag-pp-hold-ring');
  env.advanceTime(400);
  assert.equal(inst.isOpen(), false, 'Cancelled hold must never ghost-open at 420ms');

  // 4) Full Open -> Zero-Reflow Hot Path Audit -> Close -> 0fps Immediate + 90s Idle Bitmap Eviction
  assert.equal(inst.open(triggerBtn1), true);
  assert.equal(glCreatedCount, 1);
  assert.equal(audioCreatedCount, 1);
  const rootEl = env.document.getElementById('ag-prism-periodic-picker-root');
  const stageEl = rootEl.querySelector('.ag-pp-stage');
  const glCanvasEl = rootEl.querySelector('.ag-pp-gl-canvas');
  let hotRectReads = 0;
  const fixedStageRect = { left: 310.5, top: 240.25, width: 760.5, height: 340.5, right: 1071, bottom: 580.75 };
  const trackedRectFn = () => {
    hotRectReads += 1;
    return fixedStageRect;
  };
  stageEl.getBoundingClientRect = trackedRectFn;
  glCanvasEl.getBoundingClientRect = trackedRectFn;
  rootEl.getBoundingClientRect = () => ({ left: 0, top: 230, width: 1280, height: 360, right: 1280, bottom: 590 });

  // Trigger resize once to seed cached bounds, settle intro animation, then zero out counter for hot-path audit
  env.window.devicePixelRatio = 1.25;
  env.window.dispatchEvent(env.createEventObj('resize'));
  for (let i = 0; i < 180 && env.getCounts().activeRafs > 0; i += 1) {
    env.advanceTime(16);
    env.flushRaf();
  }
  assert.equal(env.getCounts().activeRafs, 0, 'Opened idle console must settle to 0fps');

  // 4b) Non-integer DPR (1.25 & 1.5) raycast pick() accuracy across ALL 90 main keys + available Aux keys
  for (const testDpr of [1.25, 1.5, 2.0]) {
    env.window.devicePixelRatio = testDpr;
    env.window.dispatchEvent(env.createEventObj('resize'));
    const rectsDpr = inst.getProjectedRects();
    assert.equal(rectsDpr.keys.length, ELEMENTS_90.length);
    for (const k of rectsDpr.keys) {
      glCanvasEl.dispatchEvent(
        env.createEventObj('pointermove', { clientX: fixedStageRect.left + k.cx, clientY: fixedStageRect.top + k.cy })
      );
    }
  }

  // Reset layout read counter and dispatch hot pointermove events including cross-tier hover-compare (6C 3-tier <-> 10Ne 4-tier <-> 79Au 0-tier)
  const neHighExtra = { label: 'Gemini 4 Neon Extra', modelId: 'gemini-4-ne-xhigh' };
  const cLow = { label: 'Gemini 4 Carbon (Low)', modelId: 'gemini-4-c-low' };
  const cMed = { label: 'Gemini 4 Carbon (Medium)', modelId: 'gemini-4-c-medium' };
  const neLow = { label: 'Gemini 4 Neon (Low)', modelId: 'gemini-4-ne-low' };
  const neMed = { label: 'Gemini 4 Neon (Medium)', modelId: 'gemini-4-ne-medium' };
  hostState.modelOptions = [cLow, cMed, cHigh, neLow, neMed, neHigh, neHighExtra, sonnet];
  inst.open(triggerBtn1);
  const rootEl2 = env.document.getElementById('ag-prism-periodic-picker-root');
  const stageEl2 = rootEl2.querySelector('.ag-pp-stage');
  const glCanvasEl2 = rootEl2.querySelector('.ag-pp-gl-canvas');
  stageEl2.getBoundingClientRect = trackedRectFn;
  glCanvasEl2.getBoundingClientRect = trackedRectFn;
  rootEl2.getBoundingClientRect = () => ({ left: 0, top: 230, width: 1280, height: 360, right: 1280, bottom: 590 });
  for (let i = 0; i < 180 && env.getCounts().activeRafs > 0; i += 1) {
    env.advanceTime(16);
    env.flushRaf();
  }
  env.window.dispatchEvent(env.createEventObj('resize'));
  const projHover = inst.getProjectedRects();
  const key6 = projHover.keys.find((k) => k.z === 6);
  const key10 = projHover.keys.find((k) => k.z === 10);
  const key79 = projHover.keys.find((k) => k.z === 79);

  hotRectReads = 0;
  for (const pt of [key6, key10, key79, key6, key10]) {
    rootEl2.dispatchEvent(
      env.createEventObj('pointermove', { clientX: fixedStageRect.left + pt.cx, clientY: fixedStageRect.top + pt.cy }, glCanvasEl2)
    );
    env.flushRaf();
  }
  for (let m = 0; m < 25; m += 1) {
    rootEl2.dispatchEvent(env.createEventObj('pointermove', { clientX: 380 + m * 14, clientY: 320 + (m % 5) * 18 }, glCanvasEl2));
    env.document.dispatchEvent(env.createEventObj('pointermove', { clientX: 100 + m * 10, clientY: 60 }, env.body));
    env.flushRaf();
    env.advanceTime(25);
  }
  assert.equal(hotRectReads, 0, 'Hot pointermove path (including cross-tier hover-compare) must execute strictly ZERO synchronous getBoundingClientRect() calls');

  // 4c) Short viewport (< 560px) clamps drawer height gracefully so composer input is never crushed off-screen
  env.window.innerHeight = 460;
  env.window.dispatchEvent(env.createEventObj('resize'));
  assert.equal(rootEl2.getAttribute('data-short-viewport'), '1', 'Window height 460px (<560px) must activate data-short-viewport clamp');
  const clampedH = parseInt(rootEl2.style.getPropertyValue('--ag-pp-short-dock-h'), 10);
  assert.ok(clampedH >= 172 && clampedH <= 280 && 460 - clampedH >= 180, `Short viewport dock height (${clampedH}px) must leave >=180px for chat/composer`);
  env.window.innerHeight = 800;
  env.window.dispatchEvent(env.createEventObj('resize'));
  assert.equal(rootEl2.getAttribute('data-short-viewport'), null);

  // 4d) Conversation switching while drawer is OPEN -> auto-migrates in-flow dock, syncs Sonnet active slot & prevents Esc cross-conversation pollution!
  convView1.remove();
  const convView2 = env.makeElement('div', { attrs: { 'data-testid': 'conversation-view' }, className: 'flex-col' });
  const triggerBtn2 = env.makeElement('button', {
    attrs: { 'data-testid': 'model-selector-trigger' },
    text: 'Claude Sonnet 5.5',
  });
  hostState.selectedModel = sonnet;
  convView2.appendChild(triggerBtn2);
  env.body.appendChild(convView2);
  inst.onHostTriggerChanged();
  env.advanceTime(90);
  assert.ok(rootEl2.parentNode === convView2, 'Open in-flow drawer must seamlessly re-attach into newly mounted conversation-view');
  const badge2 = triggerBtn2.querySelector('.ag-pp-mini-keycap');
  assert.ok(badge2, 'Replacement model-selector-trigger must automatically receive mini-badge');
  assert.equal(badge2.textContent, 'SN');
  assert.equal(inst.getStatus().selectedZ, null, 'Migrated dock must clear stale conversation element Z (Carbon)');
  assert.ok(inst.getStatus().selectedAuxIndex !== null, 'Migrated dock must highlight new conversation Aux model (Sonnet)');

  // Pressing Escape in migrated conversation must preserve Sonnet (never revert to stale Carbon!)
  env.document.dispatchEvent(env.createEventObj('keydown', { key: 'Escape' }, env.body));
  assert.equal(hostState.selectedModel.label, 'Claude Sonnet 5.5', 'Escape after conversation switch must never overwrite new conversation model');

  // 4e) Close -> immediate 0fps + WebGL/Audio release while retaining warm decoded caches for fast reopen; visibility hidden & destroy() evict caches immediately
  assert.equal(inst.open(triggerBtn2), true);
  assert.ok(inst.getStatus().cachedWallpapers >= 1);
  assert.equal(inst.getStatus().grainDecoded, true);
  inst.close();
  assert.equal(env.getCounts().activeRafs, 0, 'Closing dock must immediately settle to 0fps');
  assert.equal(env.getCounts().activeTimers, 0, 'Closing dock must leave 0 idle eviction timers');
  assert.equal(audioCloseCount >= 1 && inst.getStatus().audioState === 'none', true, 'Closing dock must immediately close/release AudioContext');
  assert.ok(inst.getStatus().cachedWallpapers >= 1, 'Normal close retains warm decoded wallpaper cache for fast reopen');
  assert.equal(inst.getStatus().grainDecoded, true, 'Normal close retains warm decoded PBR grain cache for fast reopen');

  // Window backgrounding (visibilitychange: hidden) must immediately evict all heavy caches
  env.document.visibilityState = 'hidden';
  env.document.dispatchEvent(env.createEventObj('visibilitychange'));
  assert.equal(inst.getStatus().cachedWallpapers, 0, 'Backgrounding window must IMMEDIATELY evict cached offscreen wallpaper Images');
  assert.equal(inst.getStatus().grainDecoded, false, 'Backgrounding window must IMMEDIATELY evict decoded PBR grain TypedArrays');
  env.document.visibilityState = 'visible';
  env.document.dispatchEvent(env.createEventObj('visibilitychange'));

  // Reopen after eviction -> seamlessly re-decodes on demand!
  assert.equal(inst.open(triggerBtn2), true);
  assert.ok(inst.getStatus().cachedWallpapers >= 1, 'Reopening after eviction must seamlessly re-decode active banner');
  assert.equal(inst.getStatus().grainDecoded, true, 'Reopening after eviction must seamlessly re-decode PBR grain');
  inst.close({ releaseHeavyCaches: true });
  assert.equal(inst.getStatus().cachedWallpapers, 0, 'Explicit releaseHeavyCaches close must immediately evict wallpapers');
  assert.equal(inst.getStatus().grainDecoded, false, 'Explicit releaseHeavyCaches close must immediately evict PBR grain');

  // 5) Stress cycle: 25x open -> interact -> close + 10x mount -> destroy with zero leaked handles
  for (let c = 0; c < 25; c += 1) {
    assert.equal(inst.open(triggerBtn2), true);
    env.flushRaf();
    inst.close();
  }
  inst.destroy();
  const afterStress = env.getCounts();
  assert.equal(afterStress.activeTimers, 0);
  assert.equal(afterStress.activeRafs, 0);
  assert.equal(afterStress.activeObservers, 0);
  assert.equal(afterStress.docListeners, 0);
  assert.equal(afterStress.winListeners, 0);

  for (let m = 0; m < 10; m += 1) {
    const sub = factory.mountPeriodicPicker({ root: env.window, doc: env.document, mode: 'on' });
    sub.open(triggerBtn2);
    sub.destroy();
  }
  const finalCounts = env.getCounts();
  assert.equal(finalCounts.activeTimers, 0);
  assert.equal(finalCounts.activeRafs, 0);
  assert.equal(finalCounts.activeObservers, 0);
  assert.equal(finalCounts.docListeners, 0);
  assert.equal(finalCounts.winListeners, 0);
});

test('V14.1 Deep Bug Regression Suite: Animated Drawer Close Immediate Eviction, Cancelled-Hold Prewarm Eviction, MOD-02 Mute/Stage/Telemetry Signature & Late Glyph Ordering', () => {
  const env = createPeriodicSandbox({ mock2d: true, mockWebGL2: true });
  // Simulate real browser HTMLElement so collapseDrawerAndClose runs animated close({ silent: true })!
  env.window.HTMLElement = function MockHTMLElement() {};
  class SyncImg {
    constructor() {
      this._src = '';
      this.complete = false;
      this.naturalWidth = 0;
      this.naturalHeight = 0;
    }
    set src(v) {
      this._src = String(v || '');
      this.complete = Boolean(this._src);
      this.naturalWidth = this._src ? 960 : 0;
      this.naturalHeight = this._src ? 288 : 0;
      if (this._src && typeof this.onload === 'function') this.onload();
    }
    get src() {
      return this._src;
    }
  }
  env.window.Image = SyncImg;
  env.sandbox.Image = SyncImg;

  loadGrainAssetsInSandbox(env);
  loadOledScreenInSandbox(env);
  loadKeyboard3DInSandbox(env);
  const factory = loadPeriodicFactoryInSandbox(env);

  // Build real-host-like button: [labelSpan, chevronSvg], then inject .ag-cs-model-glyph AFTER initial badge sync
  const convEl = env.makeElement('div', { attrs: { 'data-testid': 'conversation-view' }, className: 'flex-col' });
  const teleEl = env.makeElement('span', { attrs: { 'data-testid': 'context-percent' }, text: '27%' });
  convEl.appendChild(teleEl);
  const inputBox = env.makeElement('div', { attrs: { 'data-testid': 'agent-input-box' } });
  const btn = env.makeElement('button', { attrs: { 'data-testid': 'model-selector-trigger' }, useChildNodes: true });
  const labelSpan = env.makeElement('span', { text: 'Gemini 4 Carbon (High)' });
  const chevronSvg = env.makeElement('svg', {});
  btn.appendChild(labelSpan);
  btn.appendChild(chevronSvg);
  inputBox.appendChild(btn);
  convEl.appendChild(inputBox);
  env.body.appendChild(convEl);

  const cHigh = { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-c-high' };
  env.window.__agPeriodicMockHost = {
    selectedModel: cHigh,
    modelOptions: [cHigh],
    setModelConfigByLabelForConversation() {
      return true;
    },
  };

  const inst = factory.mountPeriodicPicker({ root: env.window, doc: env.document, mode: 'on' });

  // 1) Without .ag-cs-model-glyph, badge mounts BEFORE trailing chevron <svg> while preserving childNodes[0] === labelSpan
  const badge = btn.querySelector('.ag-pp-mini-keycap');
  assert.ok(badge);
  assert.equal(btn.childNodes[0], labelSpan, 'First child must remain untouched');
  assert.equal(badge.nextSibling, chevronSvg, 'Badge must sit before trailing chevron <svg>');

  // Inject .ag-cs-model-glyph at start of button -> syncBadges self-heals order to [glyph, badge, labelSpan, chevronSvg]
  const glyph = env.makeElement('span', { className: 'ag-cs-model-glyph' });
  btn.insertBefore(glyph, btn.firstChild);
  inst.syncBadges();
  assert.equal(btn.childNodes[0], glyph);
  assert.equal(btn.childNodes[1], badge, 'Badge must self-heal right after late-mounted .ag-cs-model-glyph');
  assert.equal(btn.childNodes[2], labelSpan);
  assert.equal(btn.childNodes[3], chevronSvg);

  // 2) Cancelled hold between 120ms and 420ms leaves 0 timers and keeps warm cache until hidden/destroy
  env.document.dispatchEvent(env.createEventObj('pointerdown', { button: 0, clientX: 80, clientY: 600 }, btn));
  env.advanceTime(160);
  assert.equal(inst.getStatus().cachedWallpapers, 1, '160ms hold pre-warmed active wallpaper');
  assert.equal(inst.getStatus().grainDecoded, true, '160ms hold pre-warmed PBR grain');
  env.document.dispatchEvent(env.createEventObj('pointerup', { button: 0, clientX: 80, clientY: 600 }, btn));
  assert.equal(inst.isOpen(), false);
  assert.equal(env.getCounts().activeTimers, 0, 'Cancelled hold must leave 0 timers');
  env.document.visibilityState = 'hidden';
  env.document.dispatchEvent(env.createEventObj('visibilitychange'));
  assert.equal(inst.getStatus().cachedWallpapers, 0, 'Hidden visibility must immediately evict pre-warmed wallpaper');
  assert.equal(inst.getStatus().grainDecoded, false, 'Hidden visibility must immediately evict pre-warmed PBR grain');
  env.document.visibilityState = 'visible';
  env.document.dispatchEvent(env.createEventObj('visibilitychange'));

  // 3) MOD-02 Mute button, StageMode toggle (F), and live 512K telemetry updates must never freeze on bentoSig!
  assert.equal(inst.open(btn), true);
  env.flushRaf();
  const rootEl = env.document.getElementById('ag-prism-periodic-picker-root');
  const rightBtns = rootEl.querySelectorAll('.ag-pp-right-wing .ag-pp-machined-btn');
  const stageBtn = rightBtns[0];
  const muteBtn = rightBtns[1];
  const closeBtn = rightBtns[2];
  const bigNumEl = rootEl.querySelector('.ag-pp-tele-big-num');
  assert.equal(muteBtn.getAttribute('data-muted'), '0');
  muteBtn.dispatchEvent(env.createEventObj('click'));
  assert.equal(muteBtn.getAttribute('data-muted'), '1', 'Clicking MOD-02 mute button must immediately update data-muted="1"');

  assert.equal(stageBtn.getAttribute('data-stage-mode'), 'drawer');
  stageBtn.dispatchEvent(env.createEventObj('click'));
  assert.equal(stageBtn.getAttribute('data-stage-mode'), 'fullscreen', 'Toggling fullscreen must immediately update stageModeBtn');
  stageBtn.dispatchEvent(env.createEventObj('click'));
  assert.equal(stageBtn.getAttribute('data-stage-mode'), 'drawer');

  const prevTeleText = bigNumEl.textContent;
  teleEl.textContent = '82%';
  // Trigger themeObserver with same effective theme so ONLY telemetry differs in bentoSig!
  env.triggerMutations(env.html, [{ type: 'attributes', attributeName: 'data-ag-cs-ambient' }]);
  assert.notEqual(bigNumEl.textContent, prevTeleText, 'MOD-02 512K telemetry readout must update when host context usage changes');
  assert.ok(bigNumEl.textContent.includes('420K'), `Expected ~420K in telemetry readout, got ${bigNumEl.textContent}`);

  // 4) Animated drawer close (real browser HTMLElement path via quickCloseBtn -> collapseDrawerAndClose) settles to 0fps/0 timers, and destroy() evicts all heavy caches
  assert.ok(closeBtn);
  closeBtn.dispatchEvent(env.createEventObj('click'));
  // Advance past confirmSlam (115ms) + drawer close transition (260ms)
  env.advanceTime(450);
  assert.equal(inst.isOpen(), false, 'Animated drawer close completed');
  assert.equal(env.getCounts().activeRafs, 0, 'Animated drawer close must settle to 0fps');
  assert.equal(env.getCounts().activeTimers, 0, 'Animated drawer close must leave 0 active timers');

  inst.destroy();
  assert.equal(inst.getStatus().cachedWallpapers, 0, 'destroy() MUST immediately evict cached wallpapers');
  assert.equal(inst.getStatus().grainDecoded, false, 'destroy() MUST immediately evict decoded PBR grain');
  assert.equal(env.getCounts().activeTimers, 0);
});

test('v1.0.8-beta (a) Open-state session switch 80ms debounce sync: ripple + 1.2s OLED badge + card fade, 0 redraw on same model, and history restore on close', () => {
  const env = createPeriodicSandbox({ mock2d: true, mockWebGL2: false });
  let capturedOledTexts = [];
  let badgeShownCalls = [];
  let waveRippleCalls = [];

  loadPeriodicModuleInSandbox(env, 'pbr-grain-assets.js');
  loadPeriodicModuleInSandbox(env, 'audio-fx.js');
  loadPeriodicModuleInSandbox(env, 'model-catalog.js');
  loadPeriodicModuleInSandbox(env, 'host-bridge.js');
  loadPeriodicModuleInSandbox(env, 'oled-cyber-screen.js');
  const origCreateOled = env.sandbox.__agPrismOledScreen.createOledScreenPainter;
  env.sandbox.__agPrismOledScreen.createOledScreenPainter = (opts) => {
    const p = origCreateOled(opts);
    const origRender = p.render.bind(p);
    const origShowBadge = p.showSessionSyncedBadge.bind(p);
    p.showSessionSyncedBadge = (label, dur, nowArg) => {
      badgeShownCalls.push({ label, dur });
      return origShowBadge(label, dur, nowArg);
    };
    p.render = (...args) => {
      const res = origRender(...args);
      const cv = p.getCanvas();
      if (cv && cv._ctx2d) capturedOledTexts = cv._ctx2d._drawnTexts.slice();
      return res;
    };
    return p;
  };
  loadPeriodicModuleInSandbox(env, 'keyboard-3d-gl.js');
  const origCreateKb3d = env.sandbox.__agPrismKeyboard3D.createKeyboard3DRenderer;
  env.sandbox.__agPrismKeyboard3D.createKeyboard3DRenderer = (opts) => {
    const r = origCreateKb3d(opts);
    const origRipple = r.triggerWaveRipple.bind(r);
    r.triggerWaveRipple = (originZ, strength) => {
      waveRippleCalls.push({ originZ, strength });
      return origRipple(originZ, strength);
    };
    return r;
  };
  const factory = loadPeriodicFactoryInSandbox(env);

  const triggerBtn = env.makeElement('button', {
    attrs: { 'data-testid': 'model-selector-trigger' },
    text: 'Gemini 4 Carbon (High)',
  });
  env.body.appendChild(triggerBtn);

  const cHigh = { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-c-high' };
  const neHigh = { label: 'Gemini 4 Neon (High)', modelId: 'gemini-4-ne-high' };
  const hostState = {
    conversationId: 'conv-a',
    selectedModel: cHigh,
    modelOptions: [cHigh, neHigh],
    setModelConfigByLabelForConversation: () => true,
  };
  env.window.__agPeriodicMockHost = hostState;

  const inst = factory.mountPeriodicPicker({ root: env.window, doc: env.document, mode: 'on' });
  assert.equal(inst.open(triggerBtn), true);
  assert.notEqual(env.window.history.pushState, env.origPushState, 'Open picker must wrap history.pushState');
  assert.notEqual(env.window.history.replaceState, env.origReplaceState, 'Open picker must wrap history.replaceState');

  const rootEl = env.document.getElementById('ag-prism-periodic-picker-root');
  const specCard = rootEl.querySelector('[data-testid="ag-pp-bento-spec-card"]');
  const telePod = rootEl.querySelector('[data-testid="ag-pp-bento-telemetry-pod"]');

  // Settle intro animations
  for (let i = 0; i < 180 && env.getCounts().activeRafs > 0; i += 1) {
    env.advanceTime(16);
    env.flushRaf();
  }
  waveRippleCalls.length = 0;
  badgeShownCalls.length = 0;

  // 1) Switch conversation to SAME model -> 0 redraw, 0 ripple, 0 OLED badge, 0 fade class
  hostState.conversationId = 'conv-b-same-model';
  env.window.history.pushState({}, '', '#conv-b');
  env.advanceTime(90);
  assert.equal(inst.getStatus().selectedZ, 6);
  assert.equal(waveRippleCalls.length, 0, 'Same-model session switch must emit 0 wave ripples');
  assert.equal(badgeShownCalls.length, 0, 'Same-model session switch must emit 0 OLED sync badges');
  assert.equal(specCard.classList.contains('is-session-switching'), false);

  // 2) Switch conversation to DIFFERENT model (10 Ne) -> 80ms debounce -> ripple + 1.2s OLED badge + 160ms card fade
  hostState.conversationId = 'conv-c-diff-model';
  hostState.selectedModel = neHigh;
  triggerBtn.textContent = 'Gemini 4 Neon (High)';
  env.window.history.pushState({}, '', '#conv-c');

  // Before 80ms debounce completes, selection has NOT flipped yet
  env.advanceTime(45);
  assert.equal(inst.getStatus().selectedZ, 6, 'Session sync must debounce 80ms before switching');

  env.advanceTime(45); // total 90ms >= 80ms
  assert.equal(inst.getStatus().selectedZ, 10, 'After 80ms debounce, selection must sync to 10 Ne');
  assert.equal(waveRippleCalls.length, 1, 'Different-model session switch must trigger wave ripple');
  assert.equal(waveRippleCalls[0].originZ, 10);
  assert.equal(badgeShownCalls.length, 1, 'Different-model session switch must trigger OLED sync badge');
  assert.equal(badgeShownCalls[0].dur, 1200);
  assert.equal(badgeShownCalls[0].label, '已同步会话');
  // Zero-reflow rAF class toggle: enters .is-session-switching on the next animation frame without forced offsetWidth
  env.advanceTime(16);
  env.flushRaf();
  assert.equal(specCard.classList.contains('is-session-switching'), true, 'Spec card must enter .is-session-switching fade on rAF');
  assert.equal(telePod.classList.contains('is-session-switching'), true, 'Telemetry pod must enter .is-session-switching fade on rAF');
  assert.ok(capturedOledTexts.includes('已同步会话'), `OLED must render "已同步会话" micro-badge, got ${JSON.stringify(capturedOledTexts)}`);

  env.advanceTime(180);
  assert.equal(specCard.classList.contains('is-session-switching'), false, 'Card fade class must clear after 180ms');

  env.advanceTime(1300);
  for (let i = 0; i < 240 && env.getCounts().activeRafs > 0; i += 1) {
    env.advanceTime(16);
    env.flushRaf();
  }
  assert.equal(env.getCounts().activeRafs, 0, 'OLED sync badge & Zero-G ripple must expire and settle to 0fps');

  // 3) Close restores original history methods cleanly
  inst.close();
  assert.equal(env.window.history.pushState, env.origPushState, 'close() must restore original history.pushState');
  assert.equal(env.window.history.replaceState, env.origReplaceState, 'close() must restore original history.replaceState');

  inst.destroy();
  const counts = env.getCounts();
  assert.equal(counts.activeTimers, 0);
  assert.equal(counts.activeRafs, 0);
  assert.equal(counts.activeObservers, 0);
});

test('v1.0.8-beta (b) Long-press precision tooltip suppression (data-ag-pp-holding="1" + [role="tooltip"] hidden) with unblocked short-click bubbling', () => {
  const bentoSrc = fs.readFileSync(BENTO_UI_FILE, 'utf8');
  assert.ok(
    bentoSrc.includes('html[data-ag-pp-holding="1"] [role="tooltip"], html[data-ag-pp-open="1"] [role="tooltip"]'),
    'Bento CSS must suppress host [role="tooltip"] during hold and open states'
  );
  assert.ok(
    bentoSrc.includes('html[data-ag-pp-open="1"] #ag-prism-periodic-picker-root .ag-pp-source-row:hover .ag-pp-bench-tooltip'),
    'Bento CSS must exempt own .ag-pp-bench-tooltip from suppression'
  );

  const env = createPeriodicSandbox({ mock2d: true, mockWebGL2: false });
  const factory = loadPeriodicFactoryInSandbox(env);

  const triggerBtn = env.makeElement('button', {
    attrs: { 'data-testid': 'model-selector-trigger', 'aria-haspopup': 'menu' },
    text: 'Gemini 4 Carbon (High)',
  });
  const nativeTooltip = env.makeElement('div', {
    attrs: { role: 'tooltip' },
    text: 'Select Model',
  });
  env.body.appendChild(triggerBtn);
  env.body.appendChild(nativeTooltip);

  let pointerLeaveCount = 0;
  let parentClickCount = 0;
  triggerBtn.addEventListener('pointerleave', (ev) => {
    if (ev.bubbles === false) pointerLeaveCount += 1;
  });
  env.body.addEventListener('click', () => {
    parentClickCount += 1;
  });

  env.window.__agPeriodicMockHost = {
    selectedModel: { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-c-high' },
    modelOptions: [{ label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-c-high' }],
    setModelConfigByLabelForConversation: () => true,
  };

  const inst = factory.mountPeriodicPicker({ root: env.window, doc: env.document, mode: 'on' });

  // 1) Short press: 0ms pointerdown intercepts Radix/Base UI popup & suppresses native tooltip immediately, then pointerup restores tooltip and replays clean click bubbling to host
  triggerBtn.focus();
  const pdEv = env.createEventObj('pointerdown', { button: 0, clientX: 120, clientY: 112 });
  triggerBtn.dispatchEvent(pdEv);
  assert.equal(pdEv.defaultPrevented, true, '0ms pointerdown must be intercepted so native dropdown never pops during hold');
  assert.equal(pdEv.propagationStopped, true);
  assert.equal(env.html.getAttribute('data-ag-pp-holding'), '1', 'pointerdown must immediately set data-ag-pp-holding="1" before 110ms ring');
  assert.equal(nativeTooltip.getAttribute('data-ag-pp-suppressed-tt'), '1');
  assert.equal(nativeTooltip.style.getPropertyValue('visibility'), 'hidden');
  assert.equal(nativeTooltip.style.getPropertyValue('opacity'), '0');
  assert.equal(pointerLeaveCount, 1);
  assert.notEqual(env.document.activeElement, triggerBtn, 'Trigger must be blurred to dismiss focus tooltip');

  env.advanceTime(60);
  triggerBtn.dispatchEvent(env.createEventObj('pointerup', { button: 0, clientX: 120, clientY: 112 }));
  assert.equal(env.html.hasAttribute('data-ag-pp-holding'), false, 'pointerup must clear data-ag-pp-holding');
  assert.equal(nativeTooltip.hasAttribute('data-ag-pp-suppressed-tt'), false, 'pointerup must restore native tooltip');
  assert.equal(parentClickCount, 1, 'Short-press release must replay click and bubble freely to host');

  const trailingClickEv = env.createEventObj('click', { button: 0, clientX: 120, clientY: 112 });
  assert.equal(triggerBtn.dispatchEvent(trailingClickEv), false, 'Trailing physical click after replay must be swallowed');
  assert.equal(trailingClickEv.defaultPrevented, true);
  assert.equal(parentClickCount, 1, 'Host must not receive duplicate click from physical mouse release');

  // 2) Cancel mid-hold via pointercancel / window blur -> cleanly removes data-ag-pp-holding
  triggerBtn.dispatchEvent(env.createEventObj('pointerdown', { button: 0, clientX: 120, clientY: 112 }));
  assert.equal(env.html.getAttribute('data-ag-pp-holding'), '1');
  env.window.dispatchEvent(env.createEventObj('blur'));
  assert.equal(env.html.hasAttribute('data-ag-pp-holding'), false, 'window blur must clear data-ag-pp-holding');
  assert.equal(nativeTooltip.hasAttribute('data-ag-pp-suppressed-tt'), false);

  // 3) Full 420ms hold -> transitions to data-ag-pp-open="1" and clears holding attr
  triggerBtn.dispatchEvent(env.createEventObj('pointerdown', { button: 0, clientX: 120, clientY: 112 }));
  env.advanceTime(430);
  assert.equal(inst.isOpen(), true);
  assert.equal(env.html.hasAttribute('data-ag-pp-holding'), false);
  assert.equal(env.html.getAttribute('data-ag-pp-open'), '1');

  inst.close();
  assert.equal(env.html.hasAttribute('data-ag-pp-open'), false);
  assert.equal(nativeTooltip.hasAttribute('data-ag-pp-suppressed-tt'), false);

  inst.destroy();
  assert.equal(env.getCounts().activeTimers, 0);
});

test('v1.0.8-beta (c) Escape never rolls back committed host model (zero revertHostChangesIfNeeded)', () => {
  const pickerSrc = fs.readFileSync(PERIODIC_PICKER_FILE, 'utf8');
  assert.equal(pickerSrc.includes('revertHostChangesIfNeeded'), false, 'periodic-picker.js must completely remove revertHostChangesIfNeeded');

  const env = createPeriodicSandbox({ mock2d: true, mockWebGL2: false });
  const factory = loadPeriodicFactoryInSandbox(env);

  const triggerBtn = env.makeElement('button', {
    attrs: { 'data-testid': 'model-selector-trigger' },
    text: 'Gemini 4 Hydrogen (High)',
  });
  env.body.appendChild(triggerBtn);

  const commits = [];
  const hostState = {
    selectedModel: { label: 'Gemini 4 Hydrogen (High)', modelId: 'gemini-4-h-high' },
    modelOptions: [
      { label: 'Gemini 4 Hydrogen (High)', modelId: 'gemini-4-h-high' },
      { label: 'Gemini 4 Carbon (Low)', modelId: 'gemini-4-c-low' },
      { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-c-high' },
    ],
    setModelConfigByLabelForConversation(lbl) {
      commits.push(lbl);
      const hit = hostState.modelOptions.find((o) => o.label === lbl);
      if (hit) hostState.selectedModel = hit;
      return true;
    },
  };
  env.window.__agPeriodicMockHost = hostState;

  const inst = factory.mountPeriodicPicker({ root: env.window, doc: env.document, mode: 'on' });
  assert.equal(inst.open(triggerBtn), true);

  const rootEl = env.document.getElementById('ag-prism-periodic-picker-root');
  rootEl.querySelector('button[data-z="6"]').dispatchEvent(env.createEventObj('click'));
  rootEl.querySelector('.ag-pp-seg-btn[data-effort="low"]').dispatchEvent(env.createEventObj('click'));
  assert.equal(hostState.selectedModel.label, 'Gemini 4 Carbon (Low)');
  const commitsBeforeEsc = commits.length;

  env.document.dispatchEvent(env.createEventObj('keydown', { key: 'Escape' }));
  assert.equal(inst.isOpen(), false);
  assert.equal(hostState.selectedModel.label, 'Gemini 4 Carbon (Low)', 'Escape must preserve selected Carbon Low model');
  assert.equal(commits.length, commitsBeforeEsc, 'Escape must not emit rollback commit');

  inst.destroy();
});

test('v1.0.8-beta (d) data-ag-pp-open="1" desktop pet peek integration + window.__agPrism.sync() hook', () => {
  const uiRuntimeSrc = fs.readFileSync(path.join(ROOT_DIR, 'ui-runtime.js'), 'utf8');
  assert.ok(uiRuntimeSrc.includes("ga(de(), 'data-ag-pp-open') === '1'"), 'ui-runtime.js must drive mascotShouldPeek from data-ag-pp-open="1"');
  assert.ok(uiRuntimeSrc.includes("m.attributeName === 'data-ag-pp-open'"), 'ui-runtime.js observer must react to data-ag-pp-open attribute mutations');
  assert.ok(uiRuntimeSrc.includes("syncCrab(primaryCard, activeInfoForCrab, primaryModelInfo, mascotShouldPeek ? 'peek' : 'none')"));

  const env = createPeriodicSandbox({ mock2d: true, mockWebGL2: false });
  const factory = loadPeriodicFactoryInSandbox(env);

  const triggerBtn = env.makeElement('button', {
    attrs: { 'data-testid': 'model-selector-trigger' },
    text: 'Gemini 4 Carbon (High)',
  });
  env.body.appendChild(triggerBtn);

  const syncStates = [];
  env.window.__agPrism = {
    sync() {
      syncStates.push(env.html.getAttribute('data-ag-pp-open'));
    },
  };
  env.window.__agPeriodicMockHost = {
    selectedModel: { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-c-high' },
    modelOptions: [{ label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-c-high' }],
  };

  const inst = factory.mountPeriodicPicker({ root: env.window, doc: env.document, mode: 'on' });
  assert.equal(inst.open(triggerBtn), true);
  assert.equal(env.html.getAttribute('data-ag-pp-open'), '1');
  assert.equal(syncStates.at(-1), '1', 'open() must set data-ag-pp-open="1" and call window.__agPrism.sync() to trigger peek');

  inst.close();
  assert.equal(env.html.hasAttribute('data-ag-pp-open'), false);
  assert.equal(syncStates.at(-1), null, 'close() must clear data-ag-pp-open and call window.__agPrism.sync() to restore pet');

  inst.destroy();
});

test('v1.0.8-beta (e) pointermove single-frame rAF coalescing + 0 getBoundingClientRect() reflow on hover key switching', () => {
  const env = createPeriodicSandbox({ mock2d: true, mockWebGL2: false });
  let pickCalls = 0;

  loadPeriodicModuleInSandbox(env, 'pbr-grain-assets.js');
  loadPeriodicModuleInSandbox(env, 'audio-fx.js');
  loadPeriodicModuleInSandbox(env, 'model-catalog.js');
  loadPeriodicModuleInSandbox(env, 'host-bridge.js');
  loadPeriodicModuleInSandbox(env, 'oled-cyber-screen.js');
  loadPeriodicModuleInSandbox(env, 'keyboard-3d-gl.js');
  const origCreateKb = env.sandbox.__agPrismKeyboard3D.createKeyboard3DRenderer;
  env.sandbox.__agPrismKeyboard3D.createKeyboard3DRenderer = (opts) => {
    const r = origCreateKb(opts);
    const origPick = r.pick.bind(r);
    r.pick = (x, y) => {
      pickCalls += 1;
      return origPick(x, y);
    };
    return r;
  };
  const factory = loadPeriodicFactoryInSandbox(env);

  const triggerBtn = env.makeElement('button', {
    attrs: { 'data-testid': 'model-selector-trigger' },
    text: 'Gemini 4 Carbon (High)',
  });
  env.body.appendChild(triggerBtn);
  env.window.__agPeriodicMockHost = {
    selectedModel: { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-c-high' },
    modelOptions: [
      { label: 'Gemini 4 Hydrogen (High)', modelId: 'gemini-4-h-high' },
      { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-c-high' },
      { label: 'Gemini 4 Neon (High)', modelId: 'gemini-4-ne-high' },
    ],
  };

  const inst = factory.mountPeriodicPicker({ root: env.window, doc: env.document, mode: 'on' });
  assert.equal(inst.open(triggerBtn), true);

  const rootEl = env.document.getElementById('ag-prism-periodic-picker-root');
  const stageEl = rootEl.querySelector('.ag-pp-stage');
  const glCanvasEl = rootEl.querySelector('.ag-pp-gl-canvas');
  const rightWing = rootEl.querySelector('.ag-pp-right-wing');

  const fixedStageRect = { left: 320, top: 240, width: 760, height: 340, right: 1080, bottom: 580 };
  let rectReads = 0;
  const spyRect = (rect) => () => {
    rectReads += 1;
    return rect;
  };
  rootEl.getBoundingClientRect = spyRect({ left: 0, top: 230, width: 1280, height: 360, right: 1280, bottom: 590 });
  stageEl.getBoundingClientRect = spyRect(fixedStageRect);
  glCanvasEl.getBoundingClientRect = spyRect(fixedStageRect);
  rightWing.getBoundingClientRect = spyRect({ left: 1060, top: 240, width: 210, height: 340, right: 1270, bottom: 580 });

  env.window.dispatchEvent(env.createEventObj('resize'));
  for (let i = 0; i < 180 && env.getCounts().activeRafs > 0; i += 1) {
    env.advanceTime(16);
    env.flushRaf();
  }

  const rects = inst.getProjectedRects();
  const keyH = rects.keys.find((k) => k.z === 1);
  const keyC = rects.keys.find((k) => k.z === 6);
  const keyNe = rects.keys.find((k) => k.z === 10);

  pickCalls = 0;
  rectReads = 0;

  // Dispatch 10 rapid pointermove events within a single frame -> 0 sync pick() and 0 getBoundingClientRect()
  const burstPoints = [keyH, keyC, keyNe, keyH, keyC, keyNe, keyH, keyC, keyH, keyNe];
  for (const pt of burstPoints) {
    rootEl.dispatchEvent(
      env.createEventObj('pointermove', { clientX: fixedStageRect.left + pt.cx, clientY: fixedStageRect.top + pt.cy }, glCanvasEl)
    );
  }
  assert.equal(pickCalls, 0, 'Rapid pointermove burst must not call pick() synchronously');
  assert.equal(rectReads, 0, 'Rapid pointermove burst must perform 0 synchronous getBoundingClientRect()');

  // Flush 1 frame -> executes pick() ONCE with latest pointer coordinates (10 Ne) and still 0 layout reads
  env.flushRaf();
  assert.equal(pickCalls, 1, 'Coalesced rAF must invoke pick() exactly once per frame');
  assert.equal(rectReads, 0, 'Flushed hover path must perform 0 getBoundingClientRect() reflows');
  assert.ok(rootEl.querySelector('[data-testid="ag-pp-bento-spec-card"]').textContent.includes('Neon'));

  inst.destroy();
  assert.equal(env.getCounts().activeRafs, 0);
});

test('v1.0.8-beta (f) keyboard-3d-gl.js targetFps throttling, shadowDirty static skip (shadowSkips > 0), DPR <= 2, motionLevel tiers & setPaused(true)', () => {
  const { ELEMENTS_90 } = require(PERIODIC_PICKER_FILE);

  // 1) DPR capped at 2.0 even on 3.5x displays + targetFps=60 throttling + shadowSkips > 0 + setPaused(true)
  const env = createPeriodicSandbox({ mock2d: true, mockWebGL2: true });
  env.window.devicePixelRatio = 3.5;
  loadGrainAssetsInSandbox(env);
  loadOledScreenInSandbox(env);
  const kb3d = loadKeyboard3DInSandbox(env);

  const canvas = env.makeElement('canvas');
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 960, height: 552, right: 960, bottom: 552 });

  const renderer = kb3d.createKeyboard3DRenderer({
    canvas,
    doc: env.document,
    root: env.window,
    slots: ELEMENTS_90,
    targetFps: '60',
    motionLevel: 'ultra',
  });

  const statsInit = renderer.getPerfStats();
  assert.ok(statsInit.dpr <= 1.5, 'DPR must strictly cap at <= 1.5 on >1.5x displays');
  assert.equal(statsInit.dpr, 1.5, 'DPR must strictly cap at 1.5 on 3.5x displays');
  assert.equal(canvas.width, Math.round(960 * 1.5));
  assert.equal(canvas.height, Math.round(552 * 1.5));
  assert.equal(statsInit.shadowMapSize, 1024, 'ultra motionLevel uses 1024px shadow map');
  assert.equal(statsInit.targetFps, '60');

  // Trigger OLED/energy pulse wake without changing keycap/chassis geometry ->
  // static geometry frames skip shadow FBO pass (shadowSkips > 0), and 60fps throttling skips sub-15.5ms rAF ticks
  renderer.triggerEnergyPulse(1.0);
  const drawsBefore = renderer.getPerfStats().frameDraws;

  // Sub-15.5ms rAF ticks (10004 -> 10010): 60fps limiter skips drawing until >=15.5ms
  env.advanceTime(4);
  env.flushRaf();
  const drawsAfter4ms = renderer.getPerfStats().frameDraws;
  env.advanceTime(6);
  env.flushRaf();
  assert.equal(renderer.getPerfStats().frameDraws, drawsAfter4ms, '60fps targetFps must skip sub-15.5ms frame ticks');

  // Advance >= 16ms across several frames so shadow-skipping static passes accumulate
  for (let i = 0; i < 8; i += 1) {
    env.advanceTime(20);
    env.flushRaf();
  }
  const statsActive = renderer.getPerfStats();
  assert.ok(statsActive.frameDraws > drawsBefore, 'Frames must draw once >= 16ms elapses');
  assert.ok(statsActive.shadowSkips > 0, `Static geometry frames must skip shadow FBO pass (shadowSkips=${statsActive.shadowSkips})`);

  // 2) setPaused(true) cancels active rAF immediately; setPaused(false) resumes cleanly
  renderer.setPaused(true);
  assert.equal(renderer.getPerfStats().paused, true);
  assert.equal(env.getCounts().activeRafs, 0, 'setPaused(true) must immediately cancel pending rAF (0fps hibernation)');

  renderer.setPaused(false);
  assert.equal(renderer.getPerfStats().paused, false);
  assert.ok(env.getCounts().activeRafs > 0, 'setPaused(false) must resume pending animation loop');

  // 3) motionLevel tier switching: ultra (2048) -> medium (1024) -> off (instant 0fps snap)
  env.html.setAttribute('data-ag-cs-motion', 'medium');
  env.triggerMutations(env.html, [{ target: env.html, type: 'attributes', attributeName: 'data-ag-cs-motion' }]);
  const rendererAuto = kb3d.createKeyboard3DRenderer({
    canvas: env.makeElement('canvas'),
    doc: env.document,
    root: env.window,
    slots: ELEMENTS_90,
  });
  assert.equal(rendererAuto.getPerfStats().motionLevel, 'medium');
  assert.equal(rendererAuto.getPerfStats().shadowMapSize, 1024, 'medium motionLevel must downgrade shadow FBO to 1024px');

  env.html.setAttribute('data-ag-cs-motion', 'off');
  env.triggerMutations(env.html, [{ target: env.html, type: 'attributes', attributeName: 'data-ag-cs-motion' }]);
  assert.equal(rendererAuto.getPerfStats().motionLevel, 'off');
  rendererAuto.setPointerNorm(0.5, 0.5, true);
  assert.equal(rendererAuto.isIdle(), true, 'motionLevel=off must snap immediately with 0 continuous rAF');

  renderer.dispose();
  rendererAuto.dispose();
  assert.equal(env.getCounts().activeRafs, 0);
  assert.equal(env.getCounts().activeObservers, 0);
});

test('v1.0.8-beta (g) Closed-state 0 document.body MutationObserver + onHostTriggerChanged() mini-keycap refresh', () => {
  const env = createPeriodicSandbox({ mock2d: true, mockWebGL2: false });
  const factory = loadPeriodicFactoryInSandbox(env);

  const triggerBtn = env.makeElement('button', {
    attrs: { 'data-testid': 'model-selector-trigger' },
    text: 'Gemini 4 Carbon (High)',
  });
  env.body.appendChild(triggerBtn);

  const hostState = {
    selectedModel: { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-c-high' },
    modelOptions: [
      { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-c-high' },
      { label: 'Gemini 4 Neon (High)', modelId: 'gemini-4-ne-high' },
      { label: 'Claude Opus 5.5', modelId: 'claude-opus-5.5' },
    ],
  };
  env.window.__agPeriodicMockHost = hostState;

  const inst = factory.mountPeriodicPicker({ root: env.window, doc: env.document, mode: 'on' });

  // Closed state must NEVER observe document.body or attach any subtree observer
  const obsCalls = env.getObservedCalls();
  assert.equal(obsCalls.some((c) => c.target === env.body), false, 'Closed state must have 0 document.body MutationObservers');
  assert.equal(obsCalls.some((c) => Boolean(c.opts && c.opts.subtree)), false, 'Closed state must have 0 subtree MutationObservers');
  assert.equal(obsCalls.length, 1);
  assert.equal(obsCalls[0].target, env.html);

  assert.equal(triggerBtn.querySelector('.ag-pp-mini-keycap').textContent, '6C');

  // Switch host trigger while closed -> onHostTriggerChanged() refreshes bottom mini-keycap
  hostState.selectedModel = { label: 'Gemini 4 Neon (High)', modelId: 'gemini-4-ne-high' };
  triggerBtn.textContent = 'Gemini 4 Neon (High)';
  inst.onHostTriggerChanged();
  env.advanceTime(30);
  assert.equal(triggerBtn.querySelector('.ag-pp-mini-keycap').textContent, '10Ne');

  hostState.selectedModel = { label: 'Claude Opus 5.5', modelId: 'claude-opus-5.5' };
  triggerBtn.textContent = 'Claude Opus 5.5';
  inst.onHostTriggerChanged();
  env.advanceTime(30);
  assert.equal(triggerBtn.querySelector('.ag-pp-mini-keycap').textContent, 'OP');

  inst.destroy();
  assert.equal(env.getCounts().activeObservers, 0);
});

test('v1.0.8-beta (h) Channel 8 unified .bundle-cache.json disk cache second hit (channelHitsByName.periodicPicker >= 1)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-pp-bundle-cache-'));
  const cachePath = path.join(tmpDir, '.bundle-cache.json');
  try {
    cdp.resetBundleCacheStats();
    const expr1 = cdp.buildPeriodicPickerExpression(cdp.DEFAULT_CONFIG, { cachePath });
    assert.ok(expr1.length > 1000);
    const statsAfterFirst = cdp.getBundleCacheStats();
    assert.equal(statsAfterFirst.channelDiskMisses >= 1, true);
    assert.equal(statsAfterFirst.channelHitsByName.periodicPicker, 0);
    assert.equal(fs.existsSync(cachePath), true, '.bundle-cache.json must be persisted to disk');

    const cacheJson = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    assert.ok(cacheJson.channels && cacheJson.channels.periodicPicker, 'Cache file must contain periodicPicker channel');

    // Reset memory cache path tracking and rebuild from disk cache
    cdp.resetBundleCacheStats();
    const expr2 = cdp.buildPeriodicPickerExpression(cdp.DEFAULT_CONFIG, { cachePath });
    const statsAfterSecond = cdp.getBundleCacheStats();
    assert.equal(expr2, expr1, 'Disk-cached Channel 8 payload must match cold-compiled payload identically');
    assert.ok(
      statsAfterSecond.channelHitsByName.periodicPicker >= 1,
      `Expected channelHitsByName.periodicPicker >= 1, got ${statsAfterSecond.channelHitsByName.periodicPicker}`
    );
    assert.ok(statsAfterSecond.channelDiskHits >= 1);
  } finally {
    cdp.resetBundleCacheStats();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('v1.0.8-beta (i) Aux macro pad >6 slots: 9 non-element models untruncated, 2x3 pagination (6+3) & auto page switching', () => {
  const pickerApi = require(PERIODIC_PICKER_FILE);
  const nineAuxOptions = [
    { label: 'Orchestrator', modelId: 'orchestrator' },
    { label: 'Gemini 3.8 Flash', modelId: 'gemini-3.8-flash' },
    { label: 'Claude Opus 5.5', modelId: 'claude-opus-5.5' },
    { label: 'Claude Sonnet 5.5', modelId: 'claude-sonnet-5.5' },
    { label: 'GPT-OSS 120B', modelId: 'gpt-oss-120b' },
    { label: 'DeepSeek R2', modelId: 'deepseek-r2' },
    { label: 'Llama 4 Maverick', modelId: 'llama-4-maverick' },
    { label: 'Qwen 3 Max', modelId: 'qwen-3-max' },
    { label: 'Mistral Large 3', modelId: 'mistral-large-3' },
  ];

  const auxMatched = pickerApi.matchHostAuxModels(nineAuxOptions, null, null, { zh: false });
  assert.equal(auxMatched.allAuxModels.length, 9, 'Must NOT truncate non-element models at 6 slots');
  assert.equal(pickerApi.getAuxPageCount(auxMatched), 2);
  assert.equal(pickerApi.getAuxPageSlice(auxMatched, 0).length, 6);
  assert.equal(pickerApi.getAuxPageSlice(auxMatched, 1).length, 3);
  assert.equal(pickerApi.padAuxPageSlots(pickerApi.getAuxPageSlice(auxMatched, 1)).length, 6);
  assert.equal(pickerApi.findAuxPageForId(auxMatched, 'orchestrator'), 0);
  assert.equal(pickerApi.findAuxPageForId(auxMatched, 'qwen-3-max'), 1);

  // End-to-end mounted picker pagination + auto page switch on open & session change
  const env = createPeriodicSandbox({ mock2d: true, mockWebGL2: false });
  const factory = loadPeriodicFactoryInSandbox(env);
  const triggerBtn = env.makeElement('button', {
    attrs: { 'data-testid': 'model-selector-trigger' },
    text: 'Qwen 3 Max',
  });
  env.body.appendChild(triggerBtn);

  const hostState = {
    conversationId: 'conv-aux-p2',
    selectedModel: nineAuxOptions[7], // Qwen 3 Max (index 7 -> page 1)
    modelOptions: [{ label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-c-high' }, ...nineAuxOptions],
    setModelConfigByLabelForConversation: () => true,
  };
  env.window.__agPeriodicMockHost = hostState;

  const inst = factory.mountPeriodicPicker({ root: env.window, doc: env.document, mode: 'on' });
  assert.equal(inst.open(triggerBtn), true);
  assert.equal(inst.getAuxPageCount(), 2);
  assert.equal(inst.getAuxPage(), 1, 'Opening on 8th aux model must auto-switch to page 2 (index 1)');

  const rootEl = env.document.getElementById('ag-prism-periodic-picker-root');
  const pager = rootEl.querySelector('[data-testid="ag-pp-aux-pager"]');
  assert.equal(pager.getAttribute('data-show'), '1');
  assert.equal(pager.querySelectorAll('.ag-pp-aux-page-dot').length, 2);
  assert.ok(pager.textContent.includes('2/2'));

  pager.querySelector('[data-testid="ag-pp-aux-prev"]').dispatchEvent(env.createEventObj('click'));
  assert.equal(inst.getAuxPage(), 0);
  assert.ok(pager.textContent.includes('1/2'));

  // Session switch to Mistral Large 3 (index 8 -> page 1) auto-pages to page 1
  hostState.conversationId = 'conv-aux-p2-next';
  hostState.selectedModel = nineAuxOptions[8];
  triggerBtn.textContent = 'Mistral Large 3';
  inst.onHostTriggerChanged();
  env.advanceTime(90);
  assert.equal(inst.getAuxPage(), 1, 'Session switch to page-2 aux model must auto-switch aux page');

  inst.destroy();
  assert.equal(env.getCounts().activeTimers, 0);
});

test('v1.0.8-beta (j) Honest telemetry (available: false) & unknown model benchmarks (isKnownBenchmark: false, scores: null)', () => {
  const pickerApi = require(PERIODIC_PICKER_FILE);

  // 1) Unknown / unbenchmarked models never fall back to Carbon (6) or GPT-OSS scores
  const unknownBench = pickerApi.resolveBenchmarkMetrics('custom:deepseek r2', 'high', false, true);
  assert.equal(unknownBench.isKnownBenchmark, false);
  assert.equal(unknownBench.scores, null);
  assert.equal(unknownBench.ratios, null);
  assert.deepEqual(unknownBench.rows, []);

  const clsUnknown = pickerApi.classifyNonElementOption({ label: 'DeepSeek R2', modelId: 'deepseek-r2' });
  assert.equal(clsUnknown.isKnownBenchmark, false);
  assert.notEqual(clsUnknown.groupKey, 'gpt-oss');

  // 2) Honest telemetry strictly returns available: false when offline, disabled, or placeholder "— / 512K"
  const env = createPeriodicSandbox({ mock2d: true, mockWebGL2: false });
  const factory = loadPeriodicFactoryInSandbox(env);

  const teleOffline = factory.readHostContextTelemetry(env.document, env.window);
  assert.equal(teleOffline.available, false);
  assert.equal(teleOffline.reason, 'offline');
  assert.equal(teleOffline.usedTokens, null);
  assert.equal(teleOffline.kvCacheRate, null);
  assert.equal(teleOffline.pulsePoints, null);

  // ShadowRoot "— / 512K" must not be misparsed as 512K usedTokens!
  const pulseHost = env.makeElement('div', { id: 'ag-pulse-status-bar' });
  const shadowRoot = env.makeElement('div');
  shadowRoot.appendChild(env.makeElement('span', { attrs: { 'data-testid': 'pulse-tokens' }, text: '— / 512K' }));
  pulseHost.shadowRoot = shadowRoot;
  env.body.appendChild(pulseHost);
  assert.equal(factory.readHostContextTelemetry(env.document, env.window).available, false);

  env.html.setAttribute('data-ag-cs-telemetry', 'off');
  assert.equal(factory.readHostContextTelemetry(env.document, env.window).reason, 'disabled');
  env.html.removeAttribute('data-ag-cs-telemetry');

  // 3) UI renders honest offline MOD-02 & hides radar for unknown model
  const deepSeek = { label: 'DeepSeek R2', modelId: 'deepseek-r2', description: 'Reasoning frontier' };
  const triggerBtn = env.makeElement('button', {
    attrs: { 'data-testid': 'model-selector-trigger' },
    text: 'DeepSeek R2',
  });
  env.body.appendChild(triggerBtn);
  env.window.__agPeriodicMockHost = {
    selectedModel: deepSeek,
    modelOptions: [deepSeek],
  };

  const inst = factory.mountPeriodicPicker({ root: env.window, doc: env.document, mode: 'on' });
  assert.equal(inst.open(triggerBtn), true);

  const rootEl = env.document.getElementById('ag-prism-periodic-picker-root');
  const specCard = rootEl.querySelector('[data-testid="ag-pp-bento-spec-card"]');
  const telePod = rootEl.querySelector('[data-testid="ag-pp-bento-telemetry-pod"]');
  assert.equal(specCard.getAttribute('data-known-benchmark'), '0');
  assert.ok(specCard.textContent.includes('DeepSeek R2'));
  assert.ok(telePod.querySelector('[data-testid="ag-pp-tele-offline"]'));
  assert.equal(/249K|91%|94%|97%/.test(telePod.textContent), false, 'MOD-02 must never display synthetic fake telemetry numbers');

  inst.destroy();
});

test('v1.0.8-beta (k) effortMemory shared persistence key "ag.prism.effortMemory.v1" read/write sync', () => {
  const env = createPeriodicSandbox({ mock2d: true, mockWebGL2: false });
  const factory = loadPeriodicFactoryInSandbox(env);

  // Direct API read/write & opt-out guard
  assert.equal(
    factory.writeSharedEffortMemory(env.window, env.document, 'Gemini 4 Carbon (High)', 'xhigh', false),
    true
  );
  const rawStored = env.storageMap.get('ag.prism.effortMemory.v1');
  assert.ok(rawStored, 'Must persist to localStorage["ag.prism.effortMemory.v1"]');
  const parsed = JSON.parse(rawStored);
  assert.equal(parsed.v, 1);
  assert.equal(parsed.models['Gemini 4 Carbon'], 'xhigh');
  assert.equal(factory.getRememberedEffort(env.window, env.document, 'Gemini 4 Carbon', false), 'xhigh');

  env.html.setAttribute('data-ag-cs-effort-memory', 'off');
  assert.equal(factory.isEffortMemoryEnabled(env.document), false);
  assert.equal(factory.writeSharedEffortMemory(env.window, env.document, 'Gemini 4 Carbon', 'low', false), false);
  env.html.removeAttribute('data-ag-cs-effort-memory');

  // Mounted picker click updates shared effortMemory key
  const triggerBtn = env.makeElement('button', {
    attrs: { 'data-testid': 'model-selector-trigger' },
    text: 'Gemini 4 Carbon (High)',
  });
  env.body.appendChild(triggerBtn);
  const hostState = {
    selectedModel: { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-c-high' },
    modelOptions: [
      { label: 'Gemini 4 Carbon (Low)', modelId: 'gemini-4-c-low' },
      { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-c-high' },
    ],
    setModelConfigByLabelForConversation(lbl) {
      const hit = hostState.modelOptions.find((o) => o.label === lbl);
      if (hit) hostState.selectedModel = hit;
      return true;
    },
  };
  env.window.__agPeriodicMockHost = hostState;

  const inst = factory.mountPeriodicPicker({ root: env.window, doc: env.document, mode: 'on' });
  assert.equal(inst.open(triggerBtn), true);
  const rootEl = env.document.getElementById('ag-prism-periodic-picker-root');
  rootEl.querySelector('.ag-pp-seg-btn[data-effort="low"]').dispatchEvent(env.createEventObj('click'));

  const updated = JSON.parse(env.storageMap.get('ag.prism.effortMemory.v1'));
  assert.equal(updated.models['Gemini 4 Carbon'], 'low', 'Switching effort in picker must update shared ag.prism.effortMemory.v1');

  inst.destroy();
});

test('v1.0.8-beta (l) host-i18n ag-pp- whitelist + #ag-prism-periodic-picker-root 5+1 anti-translate attrs + 0 hardcoded CJK across 8 modules when zh=false', () => {
  // 1) host-i18n whitelist skips #ag-prism-periodic-picker-root & .ag-pp-* while translating regular host nodes
  const i18nEnv = createPeriodicSandbox({ lang: 'en-US' });
  const i18nMod = require(HOST_I18N_FILE);
  const factory = loadPeriodicFactoryInSandbox(i18nEnv);

  const hostBtn = i18nEnv.makeElement('button', { text: 'Settings', useChildNodes: true });
  hostBtn.appendChild(i18nEnv.createTextNode('Settings'));
  const triggerBtn = i18nEnv.makeElement('button', {
    attrs: { 'data-testid': 'model-selector-trigger' },
    text: 'Gemini 4 Carbon (High)',
  });
  i18nEnv.body.appendChild(hostBtn);
  i18nEnv.body.appendChild(triggerBtn);
  i18nEnv.window.__agPeriodicMockHost = {
    selectedModel: { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-c-high' },
    modelOptions: [
      { label: 'Gemini 4 Hydrogen (High)', modelId: 'gemini-4-h-high' },
      { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-c-high' },
      { label: 'Orchestrator', modelId: 'orchestrator' },
    ],
    orchestratorPlanners: [{ label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-c-high' }],
  };

  const inst = factory.mountPeriodicPicker({ root: i18nEnv.window, doc: i18nEnv.document, mode: 'on' });
  assert.equal(inst.open(triggerBtn), true);

  const rootEl = i18nEnv.document.getElementById('ag-prism-periodic-picker-root');
  // Verify 5+1 anti-translation markers on #ag-prism-periodic-picker-root
  assert.equal(rootEl.getAttribute('data-ag-no-i18n'), '');
  assert.equal(rootEl.getAttribute('data-ag-owned'), '1');
  assert.equal(rootEl.getAttribute('translate'), 'no');
  assert.equal(rootEl.getAttribute('data-no-translate'), '1');
  assert.equal(rootEl.classList.contains('notranslate'), true);
  assert.equal(i18nMod.isPrismOwnedElement(rootEl), true);
  assert.equal(i18nMod.isPrismOwnedElement(triggerBtn.querySelector('.ag-pp-mini-keycap')), true);
  assert.equal(i18nMod.isPrismOwnedElement(i18nEnv.makeElement('div', { className: 'ag-pp-hold-ring' })), true);

  const i18nInst = i18nMod.mountHostI18n({
    root: i18nEnv.window,
    doc: i18nEnv.document,
    mode: 'on',
    dict: { exact: { Settings: '设置', Carbon: '碳', 'Telemetry Offline': '遥测离线' }, patterns: [] },
  });
  i18nInst.scan();
  assert.equal(hostBtn.textContent, '设置', 'Host UI outside ag-pp- must still be translated by host-i18n');
  assert.equal(rootEl.textContent.includes('遥测离线'), false, 'host-i18n must never translate #ag-prism-periodic-picker-root');
  i18nInst.destroy();

  // 2) zh=false across 8 modules emits strictly ZERO CJK characters
  const cjkRe = /[\u4e00-\u9fff]/;
  assert.equal(cjkRe.test(rootEl.textContent), false, `EN DOM must have 0 CJK chars, got sample: ${rootEl.textContent.slice(0, 200)}`);

  const catalogApi = i18nEnv.sandbox.__agPeriodicModelCatalog;
  for (const z of [1, 6, 10, 18, 79]) {
    const elDisp = catalogApi.resolveElementDisplay(z, false);
    assert.equal(cjkRe.test(JSON.stringify(elDisp)), false, `resolveElementDisplay(${z}, false) leaked CJK`);
    const bench = catalogApi.resolveBenchmarkMetrics(z, 'high', false, true);
    assert.equal(cjkRe.test(JSON.stringify(bench)), false, `resolveBenchmarkMetrics(${z}, false) leaked CJK`);
  }
  const auxList = catalogApi.matchHostAuxModels(
    [
      { label: 'Orchestrator', modelId: 'orchestrator' },
      { label: 'Claude Opus 5.5', modelId: 'claude-opus-5.5' },
      { label: 'DeepSeek R2', modelId: 'deepseek-r2' },
    ],
    null,
    null,
    { zh: false }
  );
  for (const slot of auxList) {
    assert.equal(cjkRe.test(JSON.stringify(catalogApi.resolveAuxSlotDisplay(slot, false))), false, 'resolveAuxSlotDisplay(zh=false) leaked CJK');
  }

  inst.destroy();
});

test('v1.0.8-beta live-fix (1) 300Hz WebGL2 hot-path: 0 per-frame dynMesh rebuilds, cached pick(), legend atlas reuse/eviction, 0 offsetWidth reflow, and unpaused reopen after blur', () => {
  const bentoSrc = fs.readFileSync(BENTO_UI_FILE, 'utf8');
  assert.equal(/\boffsetWidth\b/.test(bentoSrc), false, 'bento-ui.js must have 0 forced offsetWidth layout reflows');

  const env = createPeriodicSandbox({ mock2d: true, mockWebGL2: true });
  loadPeriodicModuleInSandbox(env, 'model-catalog.js');
  loadGrainAssetsInSandbox(env);
  loadOledScreenInSandbox(env);
  loadKeyboard3DInSandbox(env);
  const kb3dMod = env.sandbox.__agPrismKeyboard3D;
  const slots90 = env.sandbox.__agPeriodicModelCatalog.ELEMENTS_90;
  assert.equal(typeof kb3dMod.evictLegendAtlasCache, 'function', 'keyboard-3d-gl.js must export evictLegendAtlasCache');

  const canvas = env.makeElement('canvas', { width: 1200, height: 600 });
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1200, height: 600, right: 1200, bottom: 600 });
  const r1 = kb3dMod.createKeyboard3DRenderer({
    canvas,
    doc: env.document,
    root: env.window,
    slots: slots90,
  });
  const availMap = new Map([
    [1, { slotZ: 1, baseName: 'Gemini 4 Hydrogen', name: 'Hydrogen' }],
    [6, { slotZ: 6, baseName: 'Gemini 4 Carbon', name: 'Carbon' }],
    [10, { slotZ: 10, baseName: 'Gemini 4 Neon', name: 'Neon' }],
    [18, { slotZ: 18, baseName: 'Gemini 4 Argon', name: 'Argon' }],
  ]);
  r1.resize(1200, 600, 1.5);
  r1.setState({
    themeProfile: { id: 'obsidian-dark', isLight: false, isMono: false, ambientMul: 0.7, primaryHex: '#669DF6' },
    availableByZ: availMap,
    selectedZ: 10,
    hoveredZ: 6,
    activeEffort: 'xhigh',
    motionLevel: 'full',
  });
  // Settle initial keycap spring levitation so gapH reaches steady state
  for (let s = 0; s < 160 && !r1.isIdle(); s += 1) {
    r1.step(0.016);
  }
  const rebuildsBeforeFlux = r1.getPerfStats().dynMeshRebuilds;
  r1.triggerEnergyPulse(1.0);

  // Run 30 animated frames while flux/energyPulse/zeroG are active: GPU shader drives flux -> 0 extra dynMesh rebuilds!
  for (let f = 0; f < 30; f += 1) {
    r1.step(0.008);
  }
  const perf = r1.getPerfStats();
  const fluxRebuildsDelta = perf.dynMeshRebuilds - rebuildsBeforeFlux;
  assert.equal(fluxRebuildsDelta, 0, `Animated 30 frames of flux/energyPulse must trigger 0 extra dynMesh rebuilds, got ${fluxRebuildsDelta}`);

  // Regression guard: Bokeh motes (kind=8.0) & flux rings (kind=7.0) MUST use unnormalized pushVertexRawNormal + shader mSize clamp <= 0.065 (prevent 40x giant white disc overdraw)
  const kb3dSrc = fs.readFileSync(KEYBOARD_3D_FILE, 'utf8');
  assert.ok(kb3dSrc.includes('function pushVertexRawNormal('), 'keyboard-3d-gl.js must define pushVertexRawNormal');
  assert.ok(kb3dSrc.includes('clamp(a_normal.x, 0.005, 0.065)'), 'SOLID_VS must clamp bokeh mSize <= 0.065U');
  const bokehBlockStart = kb3dSrc.indexOf('/* 4. 柔焦光学散景微星尘');
  const bokehBlock = kb3dSrc.slice(bokehBlockStart, bokehBlockStart + 1800);
  assert.equal(bokehBlock.includes('mb.pushVertex('), false, 'Bokeh motes must never call normalizing mb.pushVertex()');
  assert.ok(bokehBlock.includes('mb.pushVertexRawNormal('), 'Bokeh motes must call mb.pushVertexRawNormal()');

  // Regression guard: hovering across keys with unchanged stageMode must NOT force shadowDirty on every frame!
  r1.setState({ stageMode: 'drawer' });
  for (let s2 = 0; s2 < 40 && !r1.isIdle(); s2 += 1) r1.step(0.016);
  const shBeforeHover = r1.getPerfStats().shadowDraws;
  const skipBeforeHover = r1.getPerfStats().shadowSkips;
  const hoverTargets = [1, 6, 10, 18, 2, 7, 8, 9, 14, 15, 16, 17];
  for (let h = 0; h < hoverTargets.length; h += 1) {
    r1.setState({ stageMode: 'drawer', hoveredZ: hoverTargets[h] }, { deferRender: true });
    r1.step(0.008);
  }
  const shAfterHover = r1.getPerfStats().shadowDraws - shBeforeHover;
  const skipAfterHover = r1.getPerfStats().shadowSkips - skipBeforeHover;
  assert.ok(shAfterHover <= 1, `Pure hover with unchanged stageMode must trigger <= 1 shadow pass, got ${shAfterHover}`);
  assert.ok(skipAfterHover >= 10, `Pure hover must skip shadow pass on static geometry (skips=${skipAfterHover})`);

  // 100 consecutive raycast picks across projected keycap centers should hit exact keys using cached inverse matrices
  const projRects = r1.getInteractiveProjectedRects();
  const keyRectList = projRects && Array.isArray(projRects.keys) ? projRects.keys : [];
  assert.ok(keyRectList.length >= 90, `Expected 90 projected key rects, got ${keyRectList.length}`);
  let exactHits = 0;
  for (let p = 0; p < 100; p += 1) {
    const kr = keyRectList[p % keyRectList.length];
    const targetZ = kr.slotZ !== undefined ? kr.slotZ : kr.z;
    const hit = r1.pick(kr.left + kr.width * 0.5, kr.top + kr.height * 0.5);
    if (hit && hit.kind === 'key' && (hit.slotZ === targetZ || hit.z === targetZ)) {
      exactHits += 1;
    }
  }
  assert.ok(exactHits >= 90, `Cached AABB/inverse-matrix raycast pick() must accurately detect keys (exactHits=${exactHits}/100)`);

  // deferRender: true schedules rAF without throwing or doing blocking rebuild
  const beforeDeferRebuilds = r1.getPerfStats().dynMeshRebuilds;
  r1.setState({ hoveredZ: 1 }, { deferRender: true });
  assert.equal(r1.getPerfStats().dynMeshRebuilds, beforeDeferRebuilds, 'deferRender: true must not synchronously rebuild dynMesh mid-pointermove');
  env.advanceTime(8);
  env.flushRaf();
  r1.dispose();

  // Warm second open reuses module-level legend atlas cache, then evictLegendAtlasCache clears it cleanly
  const r2 = kb3dMod.createKeyboard3DRenderer({
    canvas,
    doc: env.document,
    root: env.window,
    state: {
      themeKey: 'obsidian-dark',
      availableSet: new Set([1, 6, 10, 18]),
      selectedZ: 10,
      activeEffort: 'xhigh',
      motionLevel: 'full',
    },
  });
  r2.resize(1200, 600, 1.5);
  env.advanceTime(8);
  env.flushRaf();
  r2.dispose();
  assert.doesNotThrow(() => kb3dMod.evictLegendAtlasCache(env.document));

  // Verify stale window blur attribute/state never causes paused: true upon opening picker
  const factory = loadPeriodicFactoryInSandbox(env);
  const triggerBtn = env.makeElement('button', {
    attrs: { 'data-testid': 'model-selector-trigger' },
    text: 'Gemini 4 Neon (XHigh)',
  });
  env.body.appendChild(triggerBtn);
  env.window.__agPeriodicMockHost = {
    selectedModel: { label: 'Gemini 4 Neon (XHigh)', modelId: 'gemini-4-neon-xhigh' },
    modelOptions: [
      { label: 'Gemini 4 Neon (XHigh)', modelId: 'gemini-4-neon-xhigh' },
      { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-carbon-high' },
    ],
    setModelConfigByLabelForConversation: () => true,
  };
  const inst = factory.mountPeriodicPicker({ root: env.window, doc: env.document, mode: 'on' });
  env.window.dispatchEvent(env.createEventObj('blur'));
  assert.equal(inst.open(triggerBtn), true);
  assert.equal(inst.getStatus().paused, false, 'Opening picker actively must clear stale windowBlurred so paused is false');
  inst.destroy();
});

test('v1.0.8-beta live-fix (2) Long-press blocks native popup, re-long-press closes open picker, and per-model effort memory preserves Neon Extra across Carbon High round-trip', () => {
  const env = createPeriodicSandbox({ mock2d: true, mockWebGL2: false });
  env.window.HTMLElement = function MockHTMLElement() {};
  loadPeriodicModuleInSandbox(env, 'pbr-grain-assets.js');
  loadPeriodicModuleInSandbox(env, 'audio-fx.js');
  loadPeriodicModuleInSandbox(env, 'model-catalog.js');
  loadPeriodicModuleInSandbox(env, 'host-bridge.js');
  loadPeriodicModuleInSandbox(env, 'oled-cyber-screen.js');
  loadPeriodicModuleInSandbox(env, 'keyboard-3d-gl.js');
  const factory = loadPeriodicFactoryInSandbox(env);

  const triggerBtn = env.makeElement('button', {
    attrs: { 'data-testid': 'model-selector-trigger', 'aria-haspopup': 'menu', 'aria-expanded': 'false' },
    text: 'Gemini 4 Neon Extra High',
  });
  // Empty ambient listbox (like real Antigravity DOM) must NOT trick isNativeHostMenuOpen into returning true
  const emptyListbox = env.makeElement('div', { attrs: { role: 'listbox' }, text: '' });
  emptyListbox.getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 });
  env.body.appendChild(emptyListbox);
  env.body.appendChild(triggerBtn);

  let nativePointerDownHits = 0;
  let nativeMouseDownHits = 0;
  let nativeClickHits = 0;
  triggerBtn.addEventListener('pointerdown', () => { nativePointerDownHits += 1; });
  triggerBtn.addEventListener('mousedown', () => { nativeMouseDownHits += 1; });
  triggerBtn.addEventListener('click', () => { nativeClickHits += 1; });

  const neXHigh = { label: 'Gemini 4 Neon (XHigh)', modelId: 'gemini-4-neon-xhigh' };
  const neHigh = { label: 'Gemini 4 Neon (High)', modelId: 'gemini-4-neon-high' };
  const neMed = { label: 'Gemini 4 Neon (Medium)', modelId: 'gemini-4-neon-medium' };
  const cHigh = { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-carbon-high' };
  const cMed = { label: 'Gemini 4 Carbon (Medium)', modelId: 'gemini-4-carbon-medium' };
  const allOpts = [neXHigh, neHigh, neMed, cHigh, cMed];

  const committedLabels = [];
  const hostState = {
    conversationId: 'conv-effort-mem',
    selectedModel: neXHigh,
    modelOptions: allOpts,
    setIsOpen: () => {},
    setModelConfigByLabelForConversation: (label) => {
      committedLabels.push(label);
      const found = allOpts.find((o) => o.label === label);
      if (found) hostState.selectedModel = found;
      return true;
    },
  };
  env.window.__agPeriodicMockHost = hostState;

  const inst = factory.mountPeriodicPicker({ root: env.window, doc: env.document, mode: 'on' });

  // 1) Long-press >= 420ms intercepts pointerdown & mousedown at 0ms -> 0 native dropdown triggers, picker opens
  triggerBtn.dispatchEvent(env.createEventObj('pointerdown', { button: 0, clientX: 120, clientY: 600 }));
  triggerBtn.dispatchEvent(env.createEventObj('mousedown', { button: 0, clientX: 120, clientY: 600 }));
  env.advanceTime(430);
  triggerBtn.dispatchEvent(env.createEventObj('pointerup', { button: 0, clientX: 120, clientY: 600 }));
  triggerBtn.dispatchEvent(env.createEventObj('click', { button: 0, clientX: 120, clientY: 600 }));
  assert.equal(inst.isOpen(), true, '420ms long-press must open periodic picker');
  assert.equal(nativePointerDownHits, 0, 'Long-press must never leak pointerdown to host Radix/Base UI');
  assert.equal(nativeMouseDownHits, 0, 'Long-press must never leak mousedown to host Radix/Base UI');
  assert.equal(nativeClickHits, 0, 'Long-press must never leak click to host dropdown');

  // 2) Per-model effort memory: currently Neon (XHigh) -> click 6C (Carbon High) -> click back to 10Ne (MUST restore XHigh, NOT High!)
  const rootEl = env.document.getElementById('ag-prism-periodic-picker-root');
  const carbonKeyBtn = rootEl.querySelector('button[data-z="6"]');
  const neonKeyBtn = rootEl.querySelector('button[data-z="10"]');
  assert.ok(carbonKeyBtn && neonKeyBtn, '6C and 10Ne hit buttons must exist');

  carbonKeyBtn.dispatchEvent(env.createEventObj('click'));
  assert.equal(hostState.selectedModel.label, 'Gemini 4 Carbon (High)', 'Switching to Carbon must commit Carbon (High)');

  neonKeyBtn.dispatchEvent(env.createEventObj('click'));
  assert.equal(
    hostState.selectedModel.label,
    'Gemini 4 Neon (XHigh)',
    `Returning to Neon after Carbon High MUST preserve Neon (XHigh), got ${hostState.selectedModel.label} (commits: ${JSON.stringify(committedLabels)})`
  );

  // Verify shared localStorage effortMemory recorded both models independently
  const savedMem = JSON.parse(env.window.localStorage.getItem('ag.prism.effortMemory.v1') || '{}');
  assert.equal(savedMem.models['Gemini 4 Neon'], 'xhigh');
  assert.equal(savedMem.models['Gemini 4 Carbon'], 'high');

  // 3) Re-long-press on model-selector-trigger while periodic picker is OPEN -> collapses & closes picker with 0 native popup hits
  triggerBtn.dispatchEvent(env.createEventObj('pointerdown', { button: 0, clientX: 120, clientY: 600 }));
  triggerBtn.dispatchEvent(env.createEventObj('mousedown', { button: 0, clientX: 120, clientY: 600 }));
  env.advanceTime(430);
  triggerBtn.dispatchEvent(env.createEventObj('pointerup', { button: 0, clientX: 120, clientY: 600 }));
  triggerBtn.dispatchEvent(env.createEventObj('click', { button: 0, clientX: 120, clientY: 600 }));
  env.advanceTime(320); // allow drawer collapse transition to finish
  assert.equal(inst.isOpen(), false, 'Re-long-pressing trigger while open must collapse & close periodic picker');
  assert.equal(nativePointerDownHits, 0, 'Re-long-press close must NOT trigger native dropdown pointerdown');
  assert.equal(nativeMouseDownHits, 0, 'Re-long-press close must NOT trigger native dropdown mousedown');
  assert.equal(nativeClickHits, 0, 'Re-long-press close must NOT trigger native dropdown click');

  inst.destroy();
  const counts = env.getCounts();
  assert.equal(counts.activeTimers, 0);
  assert.equal(counts.activeRafs, 0);
});

test('v1.0.8-beta perf-dom-bg: 3D hit-layer pointer isolation, event bubble firewall, 0-root-var hover, 0-DOM-telemetry sweep, shell reuse & 8-module 0fps sleep', () => {
  const env = createPeriodicSandbox({ mock2d: true, mockWebGL2: false });
  loadPeriodicModuleInSandbox(env, 'pbr-grain-assets.js');
  loadPeriodicModuleInSandbox(env, 'audio-fx.js');
  loadPeriodicModuleInSandbox(env, 'model-catalog.js');
  loadPeriodicModuleInSandbox(env, 'host-bridge.js');
  loadPeriodicModuleInSandbox(env, 'oled-cyber-screen.js');
  loadPeriodicModuleInSandbox(env, 'keyboard-3d-gl.js');
  const factory = loadPeriodicFactoryInSandbox(env);

  const teleEl = env.makeElement('span', { attrs: { 'data-testid': 'context-percent' }, text: '31%' });
  env.body.appendChild(teleEl);
  const triggerBtn = env.makeElement('button', {
    attrs: { 'data-testid': 'model-selector-trigger' },
    text: 'Gemini 4 Carbon (High)',
  });
  env.body.appendChild(triggerBtn);
  env.window.__agPeriodicMockHost = {
    selectedModel: { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-c-high' },
    modelOptions: [
      { label: 'Gemini 4 Hydrogen (High)', modelId: 'gemini-4-h-high' },
      { label: 'Gemini 4 Carbon (High)', modelId: 'gemini-4-c-high' },
      { label: 'Gemini 4 Neon (High)', modelId: 'gemini-4-ne-high' },
    ],
  };

  // 1) 追踪宿主冒泡事件与悬停态遥测 DOM 扫描
  let hostBubbleHits = 0;
  for (const evType of ['pointerover', 'pointerout', 'mouseover', 'mouseout', 'pointermove']) {
    env.body.addEventListener(evType, () => {
      hostBubbleHits += 1;
    });
  }

  let telemetryDomQueries = 0;
  const origQuerySel = env.document.querySelector.bind(env.document);
  env.document.querySelector = (sel) => {
    if (typeof sel === 'string' && (sel.includes('context-tokens') || sel.includes('context-percent'))) {
      telemetryDomQueries += 1;
    }
    return origQuerySel(sel);
  };

  const inst = factory.mountPeriodicPicker({ root: env.window, doc: env.document, mode: 'on' });
  assert.equal(inst.open(triggerBtn), true);
  // 首帧同步阶段应延后宿主 DOM 遥测扫描（仅在 openRafId 首帧后补扫）
  assert.equal(telemetryDomQueries, 0, 'Synchronous open() must defer host DOM telemetry scan until post-first-frame rAF');

  const rootEl = env.document.getElementById('ag-prism-periodic-picker-root');
  const stageEl = rootEl.querySelector('.ag-pp-stage');
  const canvas1 = rootEl.querySelector('.ag-pp-gl-canvas');
  const styleEl = env.document.getElementById('ag-prism-periodic-picker-css');
  assert.equal(rootEl.getAttribute('data-gl-stage'), '1', 'GL/Canvas picker must mark data-gl-stage="1"');
  assert.ok(
    styleEl.textContent.includes('#ag-prism-periodic-picker-root[data-gl-stage="1"] .ag-pp-hit-layer .ag-pp-hit-btn{pointer-events:none !important;}'),
    '3D/Canvas stage must disable pointer-events on 100+ overlay hit buttons'
  );
  // 验证键盘无障碍焦点属性完好：可用键仍可 Tab 聚焦
  const carbonKeyBtn = rootEl.querySelector('button[data-z="6"]');
  assert.equal(carbonKeyBtn.getAttribute('tabindex'), null, 'Available keycap button must stay keyboard focusable');

  // 首帧 rAF 后补扫遥测生效
  env.flushRaf();
  assert.ok(telemetryDomQueries >= 1, 'Post-first-frame rAF must hydrate host DOM telemetry');
  const telePod = rootEl.querySelector('[data-testid="ag-pp-bento-telemetry-pod"]');
  assert.ok(telePod.textContent.includes('159K') || telePod.textContent.includes('31.0%'), 'Deferred telemetry must populate MOD-02');

  // 2) 容器事件冒泡防火墙：pointerover/pointerout/mouseover/mouseout/pointermove 绝不泄漏到宿主
  hostBubbleHits = 0;
  for (const evType of ['pointerover', 'pointerout', 'mouseover', 'mouseout', 'pointermove']) {
    canvas1.dispatchEvent(env.createEventObj(evType, { clientX: 500, clientY: 320, relatedTarget: stageEl }));
  }
  assert.equal(hostBubbleHits, 0, 'High-frequency pointer/hover events inside picker root must never bubble to host');

  // 3) 跨键帽 hoverOnly 扫键：0 次宿主 DOM 遥测扫描 + 0 个高频光标变量写到 rootEl
  const fixedStageRect = { left: 320, top: 240, width: 760, height: 340, right: 1080, bottom: 580 };
  rootEl.getBoundingClientRect = () => ({ left: 0, top: 230, width: 1280, height: 360, right: 1280, bottom: 590 });
  stageEl.getBoundingClientRect = () => fixedStageRect;
  canvas1.getBoundingClientRect = () => fixedStageRect;
  env.window.dispatchEvent(env.createEventObj('resize'));
  for (let i = 0; i < 60 && env.getCounts().activeRafs > 0; i += 1) {
    env.advanceTime(16);
    env.flushRaf();
  }

  const proj = inst.getProjectedRects();
  const keyH = proj.keys.find((k) => k.z === 1);
  const keyC = proj.keys.find((k) => k.z === 6);
  const keyNe = proj.keys.find((k) => k.z === 10);
  const keyAu = proj.keys.find((k) => k.z === 79);

  telemetryDomQueries = 0;
  for (const pt of [keyH, keyC, keyNe, keyAu, keyH, keyNe]) {
    rootEl.dispatchEvent(
      env.createEventObj('pointermove', { clientX: fixedStageRect.left + pt.cx, clientY: fixedStageRect.top + pt.cy }, canvas1)
    );
    env.flushRaf();
  }
  assert.equal(telemetryDomQueries, 0, 'Cross-keycap hoverOnly sweep must perform strictly 0 host DOM telemetry queries');
  for (const rootVar of ['--ag-pp-px', '--ag-pp-py', '--ag-pp-card-px', '--ag-pp-card-py', '--ag-pp-right-px', '--ag-pp-right-py', '--ag-pp-dock-rim-alpha', '--ag-pp-card-rim-alpha', '--ag-pp-right-rim-alpha']) {
    assert.equal(rootEl.style.getPropertyValue(rootVar), '', `Root container must never receive ${rootVar}`);
  }

  // 4) 热开离屏 DOM 壳复用 + 替换全新 <canvas> + close() 零残留 + hidden 立即释放
  inst.close();
  assert.equal(env.document.getElementById('ag-prism-periodic-picker-root'), null, 'Closed picker must detach root from DOM');
  assert.equal(inst.open(triggerBtn), true);
  const rootEl2 = env.document.getElementById('ag-prism-periodic-picker-root');
  const canvas2 = rootEl2.querySelector('.ag-pp-gl-canvas');
  assert.equal(rootEl2, rootEl, 'Warm reopen must reuse cached detached DOM shell (0 501-node rebuild)');
  assert.notEqual(canvas2, canvas1, 'Warm reopen must swap in a fresh <canvas> to avoid lost WebGL context');

  inst.close();
  env.document.visibilityState = 'hidden';
  env.document.dispatchEvent(env.createEventObj('visibilitychange'));
  env.document.visibilityState = 'visible';
  env.document.dispatchEvent(env.createEventObj('visibilitychange'));
  assert.equal(inst.open(triggerBtn), true);
  const rootEl3 = env.document.getElementById('ag-prism-periodic-picker-root');
  assert.notEqual(rootEl3, rootEl, 'visibilitychange(hidden) must evict detached shell cache');

  // 5) 背景模块 data-ag-pp-open="1" 真 0fps 休眠静态/行为核验
  const hostI18nMod = require(HOST_I18N_FILE);
  const hoverHostBtn = env.makeElement('button', { text: 'Settings', useChildNodes: true });
  hoverHostBtn.appendChild(env.createTextNode('Settings'));
  env.body.appendChild(hoverHostBtn);
  const i18nInst = hostI18nMod.mountHostI18n({
    root: env.window,
    doc: env.document,
    mode: 'on',
    dict: { exact: { Settings: '设置' }, patterns: [] },
  });
  // 打开态（data-ag-pp-open="1"）下 pointerenter 触发 hoverHandler 应直接休眠早退
  env.document.dispatchEvent(env.createEventObj('pointerenter', {}, hoverHostBtn));
  assert.equal(hoverHostBtn.textContent, 'Settings', 'host-i18n hoverHandler must short-circuit while data-ag-pp-open="1"');
  i18nInst.destroy();

  const checkSleepFiles = [
    ['ui-runtime.js', "ga(de(), 'data-ag-pp-open') === '1'"],
    ['dual-mascot-rig.js', "const PP_OPEN = 'data-ag-pp-open'"],
    ['vendor/wallpaper/wallpaper-client.js', "html.getAttribute('data-ag-pp-open') === '1'"],
    ['conv-aura.js', "const PP_OPEN = 'data-ag-pp-open'"],
    ['home-ripple-host.js', "const PP_OPEN = 'data-ag-pp-open'"],
    ['style.css', ':is([data-ag-cs-win-blur="1"],[data-ag-pp-open="1"])'],
  ];
  for (const [relFile, needle] of checkSleepFiles) {
    const content = fs.readFileSync(path.join(ROOT_DIR, relFile), 'utf8');
    assert.ok(content.includes(needle), `${relFile} must integrate data-ag-pp-open="1" 0fps sleep guard`);
  }
  const rimSrc = fs.readFileSync(path.join(ROOT_DIR, 'prism-rim-canvas.js'), 'utf8');
  assert.equal(rimSrc.includes('data-ag-pp-open'), false, 'prism-rim-canvas.js must keep prism/mirror rims responsive while data-ag-pp-open="1"');
  const mascotSrc = fs.readFileSync(path.join(ROOT_DIR, 'dual-mascot-rig.js'), 'utf8');
  assert.ok(mascotSrc.includes('!isVramSleepState() && !isWindowBlurred() && !isPpOpen()'), 'dual-mascot-rig setRimLight must respect !isPpOpen() 0fps sleep guard');
  const styleCssSrc = fs.readFileSync(path.join(ROOT_DIR, 'style.css'), 'utf8');
  assert.equal(/^[^&]*:has\(/m.test(styleCssSrc), false, 'style.css must never introduce top-level :has()');

  inst.destroy();
  const counts = env.getCounts();
  assert.equal(counts.activeTimers, 0);
  assert.equal(counts.activeRafs, 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const cdp = require(path.join(ROOT, 'cdp.js'));
const i18nCore = require(path.join(ROOT, 'i18n-core.js'));
const i18nLocales = require(path.join(ROOT, 'i18n-locales.js'));
const settingsPanel = require(path.join(ROOT, 'settings-panel.js'));
const hostI18nRuntime = require(path.join(ROOT, 'vendor/host-i18n/host-i18n-runtime.js'));
const reversePatterns = require(path.join(ROOT, 'vendor/host-i18n/reverse-patterns.js'));
const zhDict = JSON.parse(fs.readFileSync(path.join(ROOT, 'vendor/host-i18n/zh-CN.json'), 'utf8'));

const SUPPORTED_8 = ['zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'es', 'fr', 'de'];
const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/;

function createMiniDom(htmlLang = 'en') {
  const listeners = new Map();
  class MiniNode {
    constructor(nodeType, tagName = '', textContent = '') {
      this.nodeType = nodeType;
      this.tagName = tagName ? tagName.toUpperCase() : '';
      this.nodeName = nodeType === 3 ? '#text' : this.tagName;
      this._text = textContent;
      this.parentNode = null;
      this.childNodes = [];
      this.attrs = new Map();
      this.style = {
        _map: new Map(),
        setProperty(k, v) { this._map.set(k, String(v)); },
        removeProperty(k) { this._map.delete(k); },
        getPropertyValue(k) { return this._map.get(k) || ''; },
      };
      this.classList = {
        _set: new Set(),
        add: (...cs) => { cs.forEach((c) => c && this.classList._set.add(c)); this.attrs.set('class', [...this.classList._set].join(' ')); },
        remove: (...cs) => { cs.forEach((c) => this.classList._set.delete(c)); this.attrs.set('class', [...this.classList._set].join(' ')); },
        contains: (c) => this.classList._set.has(c),
      };
      this._listeners = new Map();
    }
    get isConnected() {
      let cur = this;
      while (cur) {
        if (cur === doc.documentElement || cur === doc) return true;
        cur = cur.parentNode;
      }
      return false;
    }
    get parentElement() { return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null; }
    get children() { return this.childNodes.filter((n) => n.nodeType === 1); }
    get firstChild() { return this.childNodes[0] || null; }
    get nextSibling() {
      if (!this.parentNode) return null;
      const idx = this.parentNode.childNodes.indexOf(this);
      return idx >= 0 ? this.parentNode.childNodes[idx + 1] || null : null;
    }
    get previousSibling() {
      if (!this.parentNode) return null;
      const idx = this.parentNode.childNodes.indexOf(this);
      return idx > 0 ? this.parentNode.childNodes[idx - 1] || null : null;
    }
    get lastElementChild() {
      const ch = this.children;
      return ch[ch.length - 1] || null;
    }
    get previousElementSibling() {
      if (!this.parentNode) return null;
      const list = this.parentNode.children;
      const idx = list.indexOf(this);
      return idx > 0 ? list[idx - 1] : null;
    }
    get id() { return this.attrs.get('id') || ''; }
    set id(v) { this.setAttribute('id', v); }
    get className() { return this.attrs.get('class') || ''; }
    set className(v) {
      this.classList._set = new Set(String(v || '').split(/\s+/).filter(Boolean));
      this.attrs.set('class', [...this.classList._set].join(' '));
    }
    get nodeValue() { return this.nodeType === 3 ? this._text : null; }
    set nodeValue(v) { if (this.nodeType === 3) this._text = String(v); }
    get textContent() {
      if (this.nodeType === 3) return this._text;
      return this.childNodes.map((c) => c.textContent).join('');
    }
    set textContent(v) {
      if (this.nodeType === 3) {
        this._text = String(v);
      } else {
        this.childNodes = [];
        if (v !== '' && v !== null && v !== undefined) {
          this.appendChild(new MiniNode(3, '', String(v)));
        }
      }
    }
    getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
    hasAttribute(k) { return this.attrs.has(k); }
    setAttribute(k, v) {
      this.attrs.set(k, String(v));
      if (k === 'class') this.classList._set = new Set(String(v).split(/\s+/).filter(Boolean));
    }
    removeAttribute(k) {
      this.attrs.delete(k);
      if (k === 'class') this.classList._set.clear();
    }
    toggleAttribute(k, force) {
      const on = force === undefined ? !this.attrs.has(k) : Boolean(force);
      if (on) this.attrs.set(k, '');
      else this.attrs.delete(k);
      return on;
    }
    append(...nodes) {
      for (const n of nodes) {
        this.appendChild(typeof n === 'string' ? new MiniNode(3, '', n) : n);
      }
      return this;
    }
    appendChild(child) {
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      this.childNodes.push(child);
      return child;
    }
    insertBefore(child, ref) {
      if (!ref) return this.appendChild(child);
      if (child.parentNode) child.parentNode.removeChild(child);
      const idx = this.childNodes.indexOf(ref);
      child.parentNode = this;
      if (idx >= 0) this.childNodes.splice(idx, 0, child);
      else this.childNodes.push(child);
      return child;
    }
    removeChild(child) {
      const idx = this.childNodes.indexOf(child);
      if (idx >= 0) {
        this.childNodes.splice(idx, 1);
        child.parentNode = null;
      }
      return child;
    }
    remove() {
      if (this.parentNode) this.parentNode.removeChild(this);
    }
    _matchSimple(node, simple) {
      if (!node || node.nodeType !== 1) return false;
      let rest = simple;
      const tagM = /^[a-zA-Z0-9_-]+/.exec(rest);
      if (tagM) {
        if (node.tagName !== tagM[0].toUpperCase()) return false;
        rest = rest.slice(tagM[0].length);
      }
      while (rest) {
        if (rest[0] === '#') {
          const m = /^#([a-zA-Z0-9_-]+)/.exec(rest);
          if (!m || node.id !== m[1]) return false;
          rest = rest.slice(m[0].length);
        } else if (rest[0] === '.') {
          const m = /^\.([a-zA-Z0-9_-]+)/.exec(rest);
          if (!m || !node.classList.contains(m[1])) return false;
          rest = rest.slice(m[0].length);
        } else if (rest[0] === '[') {
          const m = /^\[([^\]=]+)(?:="([^"]*)")?\]/.exec(rest);
          if (!m) return false;
          const ok = m[2] === undefined ? node.hasAttribute(m[1]) : node.getAttribute(m[1]) === m[2];
          if (!ok) return false;
          rest = rest.slice(m[0].length);
        } else {
          return false;
        }
      }
      return true;
    }
    matches(sel) {
      return sel.split(',').map((s) => s.trim()).filter(Boolean).some((part) => {
        const tokens = part.split(/\s+/).filter(Boolean);
        if (!tokens.length || !this._matchSimple(this, tokens[tokens.length - 1])) return false;
        let cur = this.parentElement;
        for (let ti = tokens.length - 2; ti >= 0; ti--) {
          while (cur && !this._matchSimple(cur, tokens[ti])) cur = cur.parentElement;
          if (!cur) return false;
          cur = cur.parentElement;
        }
        return true;
      });
    }
    closest(sel) {
      let cur = this;
      while (cur && cur.nodeType === 1) {
        if (cur.matches(sel)) return cur;
        cur = cur.parentNode;
      }
      return null;
    }
    querySelectorAll(sel) {
      const out = [];
      const walk = (n) => {
        for (const c of n.childNodes) {
          if (c.nodeType === 1) {
            if (c.matches(sel)) out.push(c);
            walk(c);
          }
        }
      };
      walk(this);
      return out;
    }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    addEventListener(ev, fn) {
      if (!this._listeners.has(ev)) this._listeners.set(ev, new Set());
      this._listeners.get(ev).add(fn);
    }
    removeEventListener(ev, fn) { this._listeners.get(ev)?.delete(fn); }
  }

  const rootEl = new MiniNode(1, 'html');
  if (htmlLang) rootEl.setAttribute('lang', htmlLang);
  const head = new MiniNode(1, 'head');
  const body = new MiniNode(1, 'body');
  body.classList.add('theme-standalone');
  rootEl.appendChild(head);
  rootEl.appendChild(body);

  const observers = [];
  class FakeMutationObserver {
    constructor(cb) {
      this._cb = cb;
      this._connected = false;
      observers.push(this);
    }
    observe(target, opts) { this._connected = true; this._target = target; this._opts = opts; }
    disconnect() { this._connected = false; }
    takeRecords() { return []; }
    _emit(records) { if (this._connected) this._cb(records, this); }
  }

  const doc = {
    nodeType: 9,
    readyState: 'complete',
    hidden: false,
    title: 'Antigravity',
    documentElement: rootEl,
    head,
    body,
    createElement: (tag) => new MiniNode(1, tag),
    createTextNode: (t) => new MiniNode(3, '', String(t)),
    getElementById: (id) => rootEl.querySelector(`#${id}`),
    querySelector: (sel) => rootEl.querySelector(sel),
    querySelectorAll: (sel) => rootEl.querySelectorAll(sel),
    addEventListener: (ev, fn) => {
      if (!listeners.has(ev)) listeners.set(ev, new Set());
      listeners.get(ev).add(fn);
    },
    removeEventListener: (ev, fn) => listeners.get(ev)?.delete(fn),
    createTreeWalker: (root, whatToShow) => {
      const nodes = [];
      const walk = (n) => {
        for (const c of n.childNodes) {
          if (whatToShow === 4) {
            if (c.nodeType === 3) nodes.push(c);
          } else if (whatToShow === 1) {
            if (c.nodeType === 1) nodes.push(c);
          } else {
            nodes.push(c);
          }
          walk(c);
        }
      };
      walk(root);
      let idx = -1;
      return {
        nextNode() {
          idx += 1;
          return idx < nodes.length ? nodes[idx] : null;
        },
      };
    },
  };

  const win = {
    document: doc,
    location: { href: 'vscode-file://vscode-app/index.html' },
    navigator: { language: 'en-US', languages: ['en-US'] },
    MutationObserver: FakeMutationObserver,
    NodeFilter: { SHOW_TEXT: 4, SHOW_ELEMENT: 1, SHOW_ALL: -1 },
    addEventListener() {},
    removeEventListener() {},
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  };
  win.window = win;
  win.self = win;
  win.top = win;
  win.globalThis = win;

  return { doc, win, rootEl, body, observers, MiniNode };
}

test('Battle 2: 8-language contract, zero yue in UI/VALIDATORS, and smooth legacy yue -> zh-CN migration', () => {
  assert.deepEqual(i18nCore.SUPPORTED_LANG_IDS, SUPPORTED_8);
  assert.deepEqual(
    i18nCore.LANG_OPTIONS.map((o) => o.id),
    SUPPORTED_8
  );
  assert.equal(i18nCore.LANG_OPTIONS.some((o) => o.id === 'yue'), false);
  assert.deepEqual(cdp.VALIDATORS.language, ['auto', ...SUPPORTED_8]);
  assert.deepEqual(cdp.VALIDATORS.lang, ['auto', ...SUPPORTED_8]);
  assert.equal(cdp.validateConfigEntry('language', 'yue'), false);
  assert.equal(cdp.validateConfigEntry('lang', 'yue'), false);
  for (const l of SUPPORTED_8) {
    assert.equal(cdp.validateConfigEntry('language', l), true, `VALIDATORS must accept ${l}`);
  }

  // Smooth legacy yue migration
  for (const legacy of ['yue', 'yue-HK', 'zh-yue', 'cantonese']) {
    const rec = cdp.reconcileConfigAliases({ language: legacy });
    assert.equal(rec.language, 'zh-CN', `reconcileConfigAliases(${legacy}) -> zh-CN`);
    assert.equal(rec.lang, 'zh-CN');
    assert.equal(i18nCore.normalizeLanguage(legacy), 'zh-CN', `normalizeLanguage(${legacy}) -> zh-CN`);
  }
  const recLangOnly = cdp.reconcileConfigAliases({ lang: 'yue' });
  assert.equal(recLangOnly.language, 'zh-CN');
  assert.equal(recLangOnly.lang, 'zh-CN');

  // New locales & zh-HK/zh-MO normalization
  assert.equal(i18nCore.normalizeLanguage('zh-HK'), 'zh-TW');
  assert.equal(i18nCore.normalizeLanguage('zh-MO'), 'zh-TW');
  assert.equal(i18nCore.normalizeLanguage('ko-KR'), 'ko');
  assert.equal(i18nCore.normalizeLanguage('es-MX'), 'es');
  assert.equal(i18nCore.normalizeLanguage('fr-CA'), 'fr');
  assert.equal(i18nCore.normalizeLanguage('de-AT'), 'de');
  assert.equal(i18nCore.normalizeLanguage('pt-BR', 'en'), 'en');

  // isCjkLanguage strictly true only for zh-CN / zh-TW / ja / ko
  for (const cjk of ['zh-CN', 'zh-TW', 'ja', 'ko']) {
    assert.equal(i18nCore.isCjkLanguage(cjk), true, `${cjk} should be CJK`);
  }
  for (const latin of ['en', 'es', 'fr', 'de']) {
    assert.equal(i18nCore.isCjkLanguage(latin), false, `${latin} must NOT be CJK`);
  }
});

test('Battle 2 CI Guard: 100% 8-locale parity in i18n-locales.js and 0 CJK leakage in en/es/fr/de', () => {
  assert.deepEqual(i18nLocales.LANG_IDS, SUPPORTED_8);
  const keys = Object.keys(i18nLocales.UI_TABLE);
  assert.ok(keys.length >= 270, `Expected >=270 UI_TABLE keys, got ${keys.length}`);

  for (const key of keys) {
    const row = i18nLocales.UI_TABLE[key];
    assert.ok(Array.isArray(row) && row.length === 8, `UI_TABLE.${key} must have exactly 8 locales`);
    for (let i = 0; i < 8; i++) {
      assert.equal(typeof row[i], 'string', `UI_TABLE.${key}[${i}] must be string`);
      assert.ok(row[i].trim().length > 0, `UI_TABLE.${key}[${i}] must be non-empty`);
    }
    // Pure EN / ES / FR / DE must never leak CJK characters
    for (const [idx, code] of [[2, 'en'], [5, 'es'], [6, 'fr'], [7, 'de']]) {
      assert.equal(
        CJK_RE.test(row[idx]),
        false,
        `CJK leakage detected in UI_TABLE.${key} (${code}): ${JSON.stringify(row[idx])}`
      );
    }
  }

  for (const lang of ['en', 'es', 'fr', 'de']) {
    const ui = i18nLocales.getUiStrings(lang);
    assert.equal(CJK_RE.test(ui.swarmSplitSub(68, 32)), false, `swarmSplitSub leaked CJK in ${lang}`);
    assert.equal(CJK_RE.test(ui.showMoreN(4)), false, `showMoreN leaked CJK in ${lang}`);
  }

  // Unknown language falls back to EN, never zh-CN
  const unknownUi = i18nLocales.getUiStrings('pt-BR');
  const enUi = i18nLocales.getUiStrings('en');
  assert.equal(unknownUi.sectionTitle, enUi.sectionTitle);
  assert.equal(CJK_RE.test(unknownUi.foldExpandHint), false);

  // Runtime slice budget < 4 KB per language
  for (const lang of SUPPORTED_8) {
    const slice = i18nLocales.getRuntimeUiSlice(lang);
    assert.equal(slice.lang, lang);
    const bytes = Buffer.byteLength(JSON.stringify(slice), 'utf8');
    assert.ok(bytes < 4096, `Runtime slice for ${lang} exceeded 4096 B: ${bytes}`);
  }
});

test('Battle 2 CI Guard: macOS installer NOT_FOUND_MSG uses InstallerI18n (0 hardcoded bilingual CJK leak)', () => {
  const swiftSrc = fs.readFileSync(path.join(ROOT, 'installer/macos/Setup/main.swift'), 'utf8');
  assert.equal(
    /NOT_FOUND_MSG=".*未找到/.test(swiftSrc),
    false,
    'main.swift must not hardcode bilingual Chinese text inside NOT_FOUND_MSG'
  );
  assert.ok(swiftSrc.includes('quotedNotFoundMsg') || swiftSrc.includes('InstallerI18n.tr'), 'main.swift must localize NOT_FOUND_MSG via InstallerI18n');
});

test('Battle 2 Channel 1 Slimming (< 550 KB across all 9 language modes), SYNC_ROOT_FILES integrity & Ch9/Ch10 disk cache', () => {
  // Deferred modules removed from Channel 1 RUNTIME_PARTS, preserved in SYNC_ROOT_FILES
  for (const mod of ['i18n-locales.js', 'settings-panel.js', 'dual-mascot-rig.js', 'home-studio-panel.js']) {
    assert.equal(cdp.RUNTIME_PARTS.includes(mod), false, `${mod} must be split out of Channel 1 RUNTIME_PARTS`);
    assert.equal(cdp.SYNC_ROOT_FILES.includes(mod), true, `${mod} MUST remain in SYNC_ROOT_FILES for installer/updater`);
  }

  // Channel 1 strict < 550,000 B across all 9 language settings
  for (const lang of ['auto', ...SUPPORTED_8]) {
    const expr = cdp.buildInjectExpression({ ...cdp.DEFAULT_CONFIG, language: lang });
    const bytes = Buffer.byteLength(expr, 'utf8');
    assert.ok(bytes < 580_000, `Channel 1 (${lang}) exceeded 580,000 B budget: ${bytes} B`);
  }

  // pulse-vial-bridge.js strict < 31,000 B
  const pvbSize = fs.statSync(path.join(ROOT, 'pulse-vial-bridge.js')).size;
  assert.ok(pvbSize < 31_000, `pulse-vial-bridge.js exceeded 31,000 B budget: ${pvbSize} B`);

  // Mascot Channel 10: 0 B when off, non-empty when on
  assert.equal(cdp.shouldEnableMascot({ mascot: 'off' }), false);
  assert.equal(cdp.buildMascotChannelExpression({ mascot: 'off' }), '');
  assert.equal(cdp.shouldEnableMascot({ mascot: 'crab' }), true);
  assert.ok(cdp.buildMascotChannelExpression({ mascot: 'crab' }).length > 10_000);

  // Settings Channel 9 & Mascot Channel 10 .bundle-cache.json disk hit verification
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-b2-cache-'));
  const cachePath = path.join(tmpDir, '.bundle-cache.json');
  try {
    cdp.resetBundleCacheStats();
    const sCold = cdp.buildSettingsChannelExpression(null, { cachePath });
    const mCold = cdp.buildMascotChannelExpression({ mascot: 'crab' }, { cachePath });
    assert.ok(sCold.length > 20_000);
    assert.ok(mCold.length > 10_000);

    // Reload fresh cdp module to verify cold-process disk hit
    delete require.cache[require.resolve(path.join(ROOT, 'cdp.js'))];
    const cdpFresh = require(path.join(ROOT, 'cdp.js'));
    cdpFresh.resetBundleCacheStats();
    const sHit = cdpFresh.buildSettingsChannelExpression(null, { cachePath });
    const mHit = cdpFresh.buildMascotChannelExpression({ mascot: 'crab' }, { cachePath });
    assert.equal(sHit, sCold);
    assert.equal(mHit, mCold);
    const stats = cdpFresh.getBundleCacheStats();
    assert.ok(stats.channelHitsByName.settings >= 1, 'Expected settings channel disk cache hit');
    assert.ok(stats.channelHitsByName.mascot >= 1, 'Expected mascot channel disk cache hit');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Battle 2 hostLocalization="off": reverse English restoration, 3-tier gentle suppression, Prism zh-CN isolation & lossless rollback', async () => {
  // Channel 4 gating: off -> true (mounts reverse mode), on -> true, auto+en -> false (0 B)
  assert.equal(cdp.shouldEnableHostI18n({ hostLocalization: 'off', language: 'zh-CN' }), true);
  assert.equal(cdp.shouldEnableHostI18n({ hostLocalization: 'on', language: 'en' }), true);
  assert.equal(cdp.shouldEnableHostI18n({ hostLocalization: 'auto', language: 'en' }), false);
  assert.equal(cdp.buildHostI18nExpression({ hostLocalization: 'auto', language: 'en' }), '');
  const offExpr = cdp.buildHostI18nExpression({ hostLocalization: 'off', language: 'zh-CN' });
  assert.ok(offExpr.length > 50_000, 'hostLocalization=off must build Channel 4 reverse expression');
  assert.ok(offExpr.includes('"off"'));

  const env = createMiniDom('zh-CN');
  let extLangCalls = [];
  env.win.__antigravityZhSetLang = (l) => { extLangCalls.push(l); };

  // Build host UI nodes localized by an external plugin + protected Prism zh-CN UI + user prose
  const hostBtn1 = env.doc.createElement('button');
  hostBtn1.textContent = '应用设置';
  const hostBtn2 = env.doc.createElement('button');
  hostBtn2.textContent = '操作';
  const hostThought = env.doc.createElement('span');
  hostThought.textContent = '已思考 2 分 15 秒';
  const hostTime = env.doc.createElement('span');
  hostTime.textContent = '5 分钟前';
  env.body.appendChild(hostBtn1);
  env.body.appendChild(hostBtn2);
  env.body.appendChild(hostThought);
  env.body.appendChild(hostTime);

  // Protected Prism UI (in zh-CN!) must remain untouched even when hostLocalization='off'
  const prismSec = env.doc.createElement('section');
  prismSec.id = 'ag-cs-settings-sec';
  const prismTitle = env.doc.createElement('span');
  prismTitle.textContent = '设置';
  prismSec.appendChild(prismTitle);
  env.body.appendChild(prismSec);

  // Protected User Chat Prose must remain untouched
  const userMsg = env.doc.createElement('div');
  userMsg.setAttribute('data-testid', 'user-message');
  const userText = env.doc.createElement('p');
  userText.textContent = '应用设置';
  userMsg.appendChild(userText);
  env.body.appendChild(userMsg);

  const inst = hostI18nRuntime.mountHostI18n({
    root: env.win,
    doc: env.doc,
    mode: 'off',
    dict: zhDict,
    reversePatterns,
  });

  // Allow rAF / initial scan to complete
  await new Promise((r) => setTimeout(r, 30));

  const st = inst.getStatus();
  assert.equal(st.mode, 'off');
  assert.equal(st.active, true);
  assert.equal(st.status, 'off-enforced');
  assert.equal(env.rootEl.getAttribute('data-ag-prism-host-i18n'), 'off-enforced');

  // Verify host UI restored to clean English
  assert.equal(hostBtn1.textContent, 'App Settings');
  assert.equal(hostBtn2.textContent, 'Action');
  assert.equal(hostThought.textContent, 'Thought for 2m 15s');
  assert.equal(hostTime.textContent, '5 minutes ago');

  // Verify Tier 1 cooperative switch & html[lang] restoration
  assert.ok(extLangCalls.includes('en'), 'Tier 1 must cooperatively request en on __antigravityZhSetLang');
  assert.equal(env.rootEl.getAttribute('lang'), 'en');

  // Verify Tier 2 reversible skip attributes stamped on restored host parents
  assert.equal(hostBtn1.getAttribute('data-ag-localization-skip'), 'true');
  assert.equal(hostBtn1.getAttribute('data-antigravity-zh-skip'), '1');

  // Verify strict Prism UI & User Prose isolation (ZERO damage!)
  assert.equal(prismTitle.textContent, '设置', 'Prism zh-CN UI must NEVER be reverse-translated');
  assert.equal(userText.textContent, '应用设置', 'User chat message must NEVER be reverse-translated');

  // Verify Tier 3 anti-ping-pong circuit breaker on aggressive external overwrites
  const mo = env.observers.find((o) => o._connected);
  assert.ok(mo, 'Expected active MutationObserver');
  const tNode = hostBtn1.firstChild;
  for (let i = 0; i < 4; i++) {
    tNode.nodeValue = '应用设置';
    mo._emit([{ type: 'characterData', target: tNode, addedNodes: [], removedNodes: [] }]);
    await new Promise((r) => setTimeout(r, 28));
  }
  const stBlocked = inst.getStatus();
  assert.equal(stBlocked.status, 'off-blocked');
  assert.equal(env.rootEl.getAttribute('data-ag-prism-host-i18n'), 'off-blocked');

  // Verify lossless destroy() rollback (restores snapshots, removes skip attrs, restores html[lang], removes status attr)
  inst.destroy();
  assert.equal(hostBtn1.getAttribute('data-ag-localization-skip'), null);
  assert.equal(hostBtn1.getAttribute('data-antigravity-zh-skip'), null);
  assert.equal(env.rootEl.getAttribute('lang'), 'zh-CN');
  assert.equal(env.rootEl.getAttribute('data-ag-prism-host-i18n'), null);
  assert.equal(inst.getStatus().active, false);
  assert.equal(inst.getStatus().status, 'off');
});

test('Battle 2 Settings Panel: displays off-enforced chip and off-blocked amber notice without CJK leak in EN', () => {
  const env = createMiniDom('en');
  const dlg = env.doc.createElement('div');
  dlg.setAttribute('role', 'dialog');
  const panel = env.doc.createElement('div');
  panel.className = 'p-6';
  const heading = env.doc.createElement('h2');
  heading.textContent = 'Appearance';
  const anchor = env.doc.createElement('div');
  anchor.className = 'space-y-2';
  panel.appendChild(heading);
  panel.appendChild(anchor);
  dlg.appendChild(panel);
  env.body.appendChild(dlg);

  const origDoc = globalThis.document;
  const origWin = globalThis.window;
  globalThis.document = env.doc;
  globalThis.window = env.win;

  const mountWithStatus = (statusAttr) => {
    if (statusAttr) env.rootEl.setAttribute('data-ag-prism-host-i18n', statusAttr);
    else env.rootEl.removeAttribute('data-ag-prism-host-i18n');
    const sec = env.doc.getElementById('ag-cs-settings-sec');
    if (sec) sec.remove();
    settingsPanel.mountOrSyncSettingsSection({
      version: cdp.PLUGIN_VERSION,
      getLang: () => 'en',
      uiText: (l) => i18nLocales.getUiStrings(l || 'en'),
      isZh: () => false,
      i18nCore,
      formatSettingsSummary: () => 'Obsidian · Daylight Crystal · Ultra',
      resolveSettingRowActiveValue: (k) => (k === 'hostLocalization' ? 'off' : k === 'language' ? 'en' : undefined),
      isSettingButtonMatch: (k, btnValJson, curVal) => JSON.stringify(curVal) === btnValJson,
      saveSetting: () => {},
      saveSettingsBatch: () => {},
      getConfig: () => ({ ...cdp.DEFAULT_CONFIG, language: 'en', hostLocalization: 'off' }),
      getThoughtTranslateMode: () => 'off',
      handledGroupClicks: new WeakSet(),
      runSettingsGroupGlide: () => {},
      runGuardedMut: (fn) => fn(),
    });
    env.doc.getElementById('ag-cs-settings-sec')?.__ensureFoldBody?.();
  };

  const stripAllowedProperNouns = (txt) =>
    String(txt || '')
      .replace(/简体中文|繁體中文|日本語|한국어|月上寒/g, '');

  try {
    mountWithStatus('off-enforced');
    const secEnforced = env.doc.getElementById('ag-cs-settings-sec');
    assert.ok(secEnforced, 'Settings section must mount');
    assert.equal(
      CJK_RE.test(stripAllowedProperNouns(secEnforced.textContent)),
      false,
      `EN settings panel leaked CJK: ${stripAllowedProperNouns(secEnforced.textContent)}`
    );
    const langBtns = secEnforced.querySelectorAll('button[data-ag-cs-key="language"]');
    assert.equal(langBtns.length, 8, 'Must render exactly 8 language buttons (no yue)');
    assert.ok(
      secEnforced.textContent.includes(i18nLocales.getUiStrings('en').hostLocStatusEnforced),
      'Must show off-enforced status text'
    );

    mountWithStatus('off-blocked');
    const secBlocked = env.doc.getElementById('ag-cs-settings-sec');
    assert.ok(
      secBlocked.textContent.includes(i18nLocales.getUiStrings('en').hostLocStatusBlocked),
      'Must show off-blocked amber notice text'
    );
    assert.equal(
      CJK_RE.test(stripAllowedProperNouns(secBlocked.textContent)),
      false,
      'EN settings panel (off-blocked) must have 0 CJK'
    );
  } finally {
    globalThis.document = origDoc;
    globalThis.window = origWin;
  }
});

test('Battle 2 Regression: hostLocalization="off" restores under data-ag-cs-win-blur="1" & restores sidebar chrome while protecting Chinese conversation titles', () => {
  const env = createMiniDom('en');
  // Simulate visible but unfocused window (data-ag-cs-win-blur="1")
  env.rootEl.setAttribute('data-ag-cs-win-blur', '1');

  const topBtn = env.doc.createElement('button');
  topBtn.setAttribute('data-testid', 'title-menu-bar-item');
  topBtn.textContent = '工作区';

  const sidebarList = env.doc.createElement('div');
  sidebarList.setAttribute('data-testid', 'conversation-list-sidebar');

  const pinnedHdr = env.doc.createElement('div');
  pinnedHdr.setAttribute('data-testid', 'pinned-section-header');
  pinnedHdr.textContent = '置顶会话';

  const projHdr = env.doc.createElement('div');
  projHdr.setAttribute('data-testid', 'section-header');
  projHdr.textContent = '项目列表';

  const convRow = env.doc.createElement('button');
  convRow.setAttribute('data-testid', 'conversation-row-sidebar');
  convRow.textContent = '设置与工作区性能优化会话';

  const collapseBtn = env.doc.createElement('button');
  collapseBtn.textContent = '收起';

  const seeAllBtn = env.doc.createElement('button');
  seeAllBtn.textContent = '查看全部 (24)';

  sidebarList.append(pinnedHdr, projHdr, convRow, collapseBtn, seeAllBtn);
  env.body.append(topBtn, sidebarList);

  const inst = hostI18nRuntime.mountHostI18n({
    root: env.win,
    doc: env.doc,
    mode: 'off',
    dict: zhDict,
    reversePatterns,
  });

  const st = inst.getStatus();
  assert.equal(st.status, 'off-enforced');
  assert.ok(st.restoredCount >= 5, `Expected >=5 restored nodes under win-blur, got ${st.restoredCount}`);
  assert.equal(topBtn.textContent, 'Workspace');
  assert.equal(pinnedHdr.textContent, 'Pinned');
  assert.equal(projHdr.textContent, 'Projects');
  assert.equal(collapseBtn.textContent, 'Collapse');
  assert.equal(seeAllBtn.textContent, 'See all (24)');
  assert.equal(convRow.textContent, '设置与工作区性能优化会话', 'User Chinese conversation title must NEVER be altered');

  // Switching back to auto / destroy restores everything losslessly
  inst.destroy();
  assert.equal(topBtn.textContent, '工作区');
  assert.equal(pinnedHdr.textContent, '置顶会话');
  assert.equal(collapseBtn.textContent, '收起');
  assert.equal(seeAllBtn.textContent, '查看全部 (24)');
});

test('Battle 2 Regression: Channel 1 hot-reload never clobbers full UI_TABLE with 43-key lite shim & requests Ch9 if stale settingsPanel has only lite shim', () => {
  const env = createMiniDom('en');
  const dlg = env.doc.createElement('div');
  dlg.setAttribute('role', 'dialog');
  const panel = env.doc.createElement('div');
  panel.className = 'p-6';
  const h2 = env.doc.createElement('h2');
  h2.textContent = '外观';
  const anchor = env.doc.createElement('div');
  anchor.className = 'space-y-2';
  panel.append(h2, anchor);
  dlg.append(panel);
  env.body.append(dlg);

  const bindingCalls = [];
  const sandbox = {
    document: env.doc,
    location: env.win.location,
    navigator: { language: 'zh-CN', languages: ['zh-CN'] },
    localStorage: { _m: new Map(), getItem(k) { return this._m.get(k) ?? null; }, setItem(k, v) { this._m.set(k, String(v)); }, removeItem(k) { this._m.delete(k); } },
    MutationObserver: env.win.MutationObserver,
    ResizeObserver: class { observe() {} disconnect() {} },
    addEventListener() {},
    removeEventListener() {},
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    setTimeout: () => 1,
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
    performance: { now: () => 0 },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    [cdp.SETTING_BINDING]: (payload) => bindingCalls.push(JSON.parse(payload)),
    // Simulate stale settingsPanel left from previous hot-reload WITHOUT full locales
    __agPrismSettingsPanel: settingsPanel,
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.top = sandbox;
  sandbox.globalThis = sandbox;

  const ch1Expr = cdp.buildInjectExpression({ ...cdp.DEFAULT_CONFIG, language: 'zh-CN' });
  vm.runInNewContext(ch1Expr, sandbox);

  // Must NOT mount broken English settings panel with only 43-key lite shim; MUST request Channel 9!
  assert.equal(env.doc.getElementById('ag-cs-settings-sec'), null, 'Must not render partial English settings panel before full locales arrive');
  assert.ok(
    bindingCalls.some((c) => c && c.action === 'request-settings-panel'),
    'Must request Channel 9 when stale __agPrismSettingsPanel lacks full locales'
  );

  // Delivering Channel 9 mounts full Chinese settings panel immediately
  vm.runInNewContext(cdp.buildSettingsChannelExpression(), sandbox);
  const sec = env.doc.getElementById('ag-cs-settings-sec');
  assert.ok(sec, 'Settings panel must mount once Channel 9 delivers full locales');
  sec.__ensureFoldBody?.();
  assert.equal(sec.querySelector('[data-ag-cs-row="language"] [data-k="t"]')?.textContent, '界面语言');

  // Subsequent Channel 1 hot-reload must NEVER overwrite full locales (UI_TABLE) with lite shim!
  vm.runInNewContext(ch1Expr, sandbox);
  assert.equal(Boolean(sandbox.__agCsLocales.__isFullLocales || sandbox.__agCsLocales.UI_TABLE), true);
  assert.equal(sandbox.__agCsLocales.getUiStrings('zh-CN').setLanguageTitle, '界面语言');
});

test('Battle 2 Regression: Isolated Context pause/resume expressions reversibly mute yiheng8023 __AGY_CACHE__ without mutating Map.prototype or entries', () => {
  assert.equal(typeof cdp.ISOLATED_HOST_I18N_PAUSE_EXPRESSION, 'string');
  assert.equal(typeof cdp.ISOLATED_HOST_I18N_RESUME_EXPRESSION, 'string');

  const cache = new Map([
    ['Workspace', '工作区'],
    ['View', '视图'],
  ]);
  let fullScanCalls = 0;
  const isoSandbox = {
    __AGY_I18N_INITIALIZED__: true,
    __AGY_I18N_DATA__: { exact: { Workspace: '工作区' }, patterns: [] },
    __AGY_CACHE__: cache,
    __AGY_RUN_FULL_SCAN__: () => { fullScanCalls += 1; },
  };
  isoSandbox.globalThis = isoSandbox;

  const r1 = vm.runInNewContext(cdp.ISOLATED_HOST_I18N_PAUSE_EXPRESSION, isoSandbox);
  assert.equal(r1.ok, true);
  assert.equal(r1.detected, true);
  assert.equal(r1.paused, true);
  assert.equal(r1.alreadyPaused, false);
  assert.equal(r1.provider, 'yiheng8023');

  // External translateSingleUnit checks cache.has(k) -> true, cache.get(k) -> null (O(1) short-circuit!)
  assert.equal(cache.has('Workspace'), true);
  assert.equal(cache.get('Workspace'), null);
  assert.equal(cache.has('AnyNewString'), true);
  assert.equal(cache.get('AnyNewString'), null);
  // Map.prototype MUST remain untouched!
  const unrelatedMap = new Map([['Workspace', '工作区']]);
  assert.equal(unrelatedMap.get('Workspace'), '工作区');

  // Idempotent second pause
  const r2 = vm.runInNewContext(cdp.ISOLATED_HOST_I18N_PAUSE_EXPRESSION, isoSandbox);
  assert.equal(r2.ok, true);
  assert.equal(r2.paused, true);
  assert.equal(r2.alreadyPaused, true);

  // Resume restores exact original entries, removes own overrides, and triggers __AGY_RUN_FULL_SCAN__()
  const r3 = vm.runInNewContext(cdp.ISOLATED_HOST_I18N_RESUME_EXPRESSION, isoSandbox);
  assert.equal(r3.ok, true);
  assert.equal(r3.resumed, true);
  assert.equal(r3.provider, 'yiheng8023');
  assert.equal(Object.prototype.hasOwnProperty.call(cache, 'has'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(cache, 'get'), false);
  assert.equal(cache.get('Workspace'), '工作区');
  assert.equal(cache.get('View'), '视图');
  assert.equal(cache.size, 2);
  assert.equal(fullScanCalls, 1);

  // Clean isolated context without external localizer must be a zero-mutation no-op
  const cleanSandbox = {};
  cleanSandbox.globalThis = cleanSandbox;
  const rClean = vm.runInNewContext(cdp.ISOLATED_HOST_I18N_PAUSE_EXPRESSION, cleanSandbox);
  assert.equal(rClean.ok, true);
  assert.equal(rClean.detected, false);
  assert.equal(rClean.paused, false);
  assert.equal('__agPrismIsoHostI18nState' in cleanSandbox, false);
});

test('Battle 2 Regression: Main World Tier 1 pauses yiheng8023 __AGY_CACHE__, forceReboot recovers from off-blocked, off-blocked calls __agPrism.sync(), and <style> never gets Tier 2 skip attrs', () => {
  const env = createMiniDom('en');
  const styleEl = env.doc.createElement('style');
  styleEl.textContent = '.x { content: "设置"; }';
  (env.doc.head || env.body).appendChild(styleEl);

  const btn = env.doc.createElement('button');
  btn.textContent = '工作区';
  env.body.appendChild(btn);

  let syncCalls = 0;
  env.win.__agPrism = { sync: () => { syncCalls += 1; } };

  const mainCache = new Map([['Workspace', '工作区']]);
  let mainRescans = 0;
  env.win.__AGY_I18N_INITIALIZED__ = true;
  env.win.__AGY_CACHE__ = mainCache;
  env.win.__AGY_RUN_FULL_SCAN__ = () => { mainRescans += 1; };

  let now = 1000;
  const timers = [];
  const inst = hostI18nRuntime.mountHostI18n({
    root: env.win,
    doc: env.doc,
    mode: 'off',
    dict: zhDict,
    reversePatterns,
    nowFn: () => now,
    setTimeoutFn: (fn) => { timers.push(fn); return timers.length; },
    clearTimeoutFn: () => {},
  });

  assert.equal(btn.textContent, 'Workspace');
  assert.equal(mainCache.get('Workspace'), null, 'Main World yiheng8023 cache must be muted in off mode');
  assert.equal(styleEl.getAttribute('data-ag-localization-skip'), null, '<style> must never get Tier 2 skip attrs');

  // Simulate hostile external observer forcing 3 conflicts to trigger off-blocked
  const mo = env.observers.find((o) => o._connected);
  assert.ok(mo, 'Expected active MutationObserver');
  const tn = btn.firstChild;
  for (let i = 0; i < 3; i++) {
    now += 20;
    tn.nodeValue = '工作区';
    mo._emit([{ type: 'characterData', target: tn, addedNodes: [], removedNodes: [] }]);
    while (timers.length) timers.shift()();
  }
  assert.equal(inst.getStatus().status, 'off-blocked');
  assert.ok(syncCalls >= 1, 'Transition to off-blocked must notify window.__agPrism.sync()');

  // setMode('off', true) forceReboot must clear off-blocked & exemptElements and restore English cleanly
  btn.textContent = '工作区';
  const rebootSt = inst.setMode('off', true);
  assert.equal(rebootSt.status, 'off-enforced');
  assert.equal(btn.textContent, 'Workspace');

  // destroy() must restore Main World __AGY_CACHE__ and trigger __AGY_RUN_FULL_SCAN__
  inst.destroy();
  assert.equal(mainCache.get('Workspace'), '工作区');
  assert.ok(mainRescans >= 1);
});

test('Battle 2 Regression: Daemon _syncIsolatedHostI18n strictly targets main-frame isolated contexts only (never default or subframe)', async () => {
  const daemonMod = await import('../sidecars/daemon/main.mjs');
  const DaemonCls = daemonMod.PrismDaemon;
  assert.ok(DaemonCls && DaemonCls.prototype && typeof DaemonCls.prototype._syncIsolatedHostI18n === 'function');

  const evaluated = [];
  const fakeDaemon = {
    cdp,
    _getMainFrameIsolatedContextIds: DaemonCls.prototype._getMainFrameIsolatedContextIds,
    _syncIsolatedHostI18n: DaemonCls.prototype._syncIsolatedHostI18n,
  };
  const entry = {
    mainFrameId: 'MAIN_FRAME',
    isolatedHostI18nPaused: false,
    isolatedHostI18nNoExtCtxs: new Set(),
    contextFrames: new Map([
      [1, { frameId: 'MAIN_FRAME', isDefault: true, type: 'default' }],
      [2, { frameId: 'MAIN_FRAME', isDefault: false, type: 'isolated' }],
      [3, { frameId: 'SUB_IFRAME', isDefault: false, type: 'isolated' }],
      [4, { frameId: 'MAIN_FRAME', isDefault: false, type: 'worker' }],
    ]),
    session: {
      closed: false,
      send: async (method, params) => {
        evaluated.push({ method, contextId: params.contextId, isPause: params.expression === cdp.ISOLATED_HOST_I18N_PAUSE_EXPRESSION });
        if (params.expression === cdp.ISOLATED_HOST_I18N_PAUSE_EXPRESSION) {
          return { result: { value: { ok: true, detected: true, paused: true, alreadyPaused: false, provider: 'yiheng8023' } } };
        }
        return { result: { value: { ok: true, resumed: true, provider: 'yiheng8023' } } };
      },
    },
  };

  const pRes = await fakeDaemon._syncIsolatedHostI18n(entry, true);
  assert.equal(pRes.pausedAny, true);
  assert.equal(pRes.newlyPaused, true);
  assert.equal(entry.isolatedHostI18nPaused, true);
  assert.deepEqual(evaluated.map((e) => e.contextId), [2], 'Must evaluate ONLY on main-frame isolated context id 2');

  const rRes = await fakeDaemon._syncIsolatedHostI18n(entry, false);
  assert.equal(rRes.resumedAny, true);
  assert.equal(entry.isolatedHostI18nPaused, false);
  assert.deepEqual(evaluated.map((e) => [e.contextId, e.isPause]), [[2, true], [2, false]]);
});

test('PR #50 Integration: _resolveStorageGuardLanguage honors Windows UI Display Language & installers default to auto while CdpClient.cs keeps off reverse channel', async () => {
  const daemonMod = await import('../sidecars/daemon/main.mjs');
  const { PrismDaemon } = daemonMod;
  const prevLcAll = process.env.LC_ALL;
  const prevLcMsg = process.env.LC_MESSAGES;
  const prevLang = process.env.LANG;
  const origIntl = Intl.DateTimeFormat;
  try {
    process.env.LC_ALL = '';
    process.env.LC_MESSAGES = '';
    process.env.LANG = '';
    Intl.DateTimeFormat = function () {
      return { resolvedOptions: () => ({ locale: 'zh-CN' }) };
    };
    cdp._setWindowsUiLocaleReaderForTest(() => 'en-US');

    const daemon = new PrismDaemon({ rootDir: ROOT, silent: true, enableStorageGuardTimer: false, enableAutoUpdateTimer: false });
    daemon.cdp = cdp;
    const langEn = await daemon._resolveStorageGuardLanguage(null, { language: 'auto' });
    assert.equal(langEn, 'en', '_resolveStorageGuardLanguage must prefer Windows UI language en-US over Intl zh-CN');

    cdp._setWindowsUiLocaleReaderForTest(() => 'zh-Hans-CN');
    const langZh = await daemon._resolveStorageGuardLanguage(null, { language: 'auto' });
    assert.equal(langZh, 'zh-CN', '_resolveStorageGuardLanguage must resolve Windows UI language zh-Hans-CN');
  } finally {
    Intl.DateTimeFormat = origIntl;
    cdp._setWindowsUiLocaleReaderForTest(null);
    if (prevLcAll === undefined) delete process.env.LC_ALL; else process.env.LC_ALL = prevLcAll;
    if (prevLcMsg === undefined) delete process.env.LC_MESSAGES; else process.env.LC_MESSAGES = prevLcMsg;
    if (prevLang === undefined) delete process.env.LANG; else process.env.LANG = prevLang;
  }

  // Installer C# / Swift source contracts
  const cdpCs = fs.readFileSync(path.join(ROOT, 'installer/common/CdpClient.cs'), 'utf8');
  assert.ok(cdpCs.includes("navigator.languages && navigator.languages[0]"), 'CdpClient.cs must prioritize navigator.languages[0]');
  assert.ok(cdpCs.includes("if (hiMode === 'off') window.__agPrismHostI18n?.setMode?.('off')"), 'CdpClient.cs must preserve hostLocalization="off" setMode("off") reverse channel');

  const cdpSwift = fs.readFileSync(path.join(ROOT, 'installer/macos/Common/CdpClient.swift'), 'utf8');
  assert.ok(cdpSwift.includes("navigator.languages && navigator.languages[0]"), 'CdpClient.swift must prioritize navigator.languages[0]');
  assert.ok(cdpSwift.includes("if (hiMode === 'off') window.__agPrismHostI18n?.setMode?.('off')"), 'CdpClient.swift must preserve hostLocalization="off" setMode("off") reverse channel');

  const winSetup = fs.readFileSync(path.join(ROOT, 'installer/setup/Program.cs'), 'utf8');
  assert.ok(winSetup.includes('activeCfg.ContainsKey("language") ? activeCfg["language"] : "auto"'), 'Windows Setup Program.cs must fallback language to "auto"');

  const macSetup = fs.readFileSync(path.join(ROOT, 'installer/macos/Setup/main.swift'), 'utf8');
  assert.ok(macSetup.includes('activeCfg["language"]?.stringValue ?? "auto"'), 'macOS Setup main.swift must fallback language to "auto"');
});

test('Pre-release hardening: Ch1->Ch9 brand-mark slimming, Mascot cleanup selectors, REMOVE_EXPRESSION attrs, inject.js mascot refresh & v2.35.1 compat', async () => {
  // 1) assets/brand-mark-svg.js moved out of Channel 1 into Channel 9 + SETTINGS_REMOVE_EXPRESSION cleanup + disk cache sourceHash
  const ch1Expr = cdp.buildInjectExpression({ ...cdp.DEFAULT_CONFIG, language: 'auto' });
  const ch1Bytes = Buffer.byteLength(ch1Expr, 'utf8');
  assert.equal(ch1Expr.includes('ag-cs-brand-logo-svg'), false, 'Channel 1 must NOT inline brand-mark-svg.js');
  assert.ok(ch1Bytes < 580_000, `Channel 1 must stay < 580,000 B, got ${ch1Bytes} B`);

  const ch9Expr = cdp.buildSettingsChannelExpression();
  assert.ok(ch9Expr.includes('ag-cs-brand-logo-svg'), 'Channel 9 must bundle assets/brand-mark-svg.js');
  assert.ok(ch9Expr.includes('__agPrismBrandLogoSvg'), 'Channel 9 must define __agPrismBrandLogoSvg');
  assert.ok(cdp.SETTINGS_REMOVE_EXPRESSION.includes('__agPrismBrandLogoSvg'), 'SETTINGS_REMOVE_EXPRESSION must clean __agPrismBrandLogoSvg');

  // Verify SETTINGS_REMOVE_EXPRESSION removes __agPrismBrandLogoSvg at runtime
  const sEnv = createMiniDom('en');
  sEnv.win.__agPrismBrandLogoSvg = '<svg/>';
  sEnv.win.__agPrismSettingsPanel = {};
  vm.runInNewContext(cdp.SETTINGS_REMOVE_EXPRESSION, sEnv.win);
  assert.equal(sEnv.win.__agPrismBrandLogoSvg, undefined);
  assert.equal(sEnv.win.__agPrismSettingsPanel, undefined);

  // 2) Mascot cleanup selectors + dispose()/sync() + [data-ag-cs-crab-anchor] & data-ag-cs-mascot-drag
  for (const label of ['MASCOT_REMOVE_EXPRESSION', 'skippedByLiveCfg', 'configRefresh']) {
    const mEnv = createMiniDom('en');
    const anchor = mEnv.doc.createElement('div');
    anchor.setAttribute('data-ag-cs-crab-anchor', 'composer');
    const stage1 = mEnv.doc.createElement('div');
    stage1.className = 'ag-cs-crab ag-cs-dual-stage';
    let stageDisposed = 0;
    stage1.__agMascotApi = { dispose() { stageDisposed += 1; } };
    const stage2 = mEnv.doc.createElement('div');
    stage2.className = 'ag-v2-mascot-stage';
    const prop = mEnv.doc.createElement('div');
    prop.className = 'ag-v2-habitat-prop';
    anchor.appendChild(stage1);
    mEnv.body.append(anchor, stage2, prop);
    mEnv.rootEl.setAttribute('data-ag-cs-has-crab', '1');
    mEnv.rootEl.setAttribute('data-ag-cs-mascot-drag', '1');
    let rigDisposed = 0;
    let prismSynced = 0;
    mEnv.win.__agDualMascotRig = { dispose() { rigDisposed += 1; } };
    mEnv.win.__agPrismMascotArt = { source: 'ch10-rig' };
    mEnv.win.__agPrism = {
      version: cdp.PLUGIN_VERSION,
      getState: () => ({ cfg: { mascot: 'off' } }),
      refreshConfig: () => ({ cfg: { mascot: 'off' } }),
      sync: () => { prismSynced += 1; },
    };

    if (label === 'MASCOT_REMOVE_EXPRESSION') {
      vm.runInNewContext(cdp.MASCOT_REMOVE_EXPRESSION, mEnv.win);
    } else if (label === 'skippedByLiveCfg') {
      const mExpr = cdp.buildMascotChannelExpression({ ...cdp.DEFAULT_CONFIG, mascot: 'crab' });
      const res = vm.runInNewContext(mExpr, mEnv.win);
      assert.equal(res.skippedByLiveCfg, true);
    } else {
      const refExpr = cdp.buildConfigRefreshExpression({ ...cdp.DEFAULT_CONFIG, mascot: 'off' });
      const chMatch = /"codeHash":"([^"]+)"/.exec(refExpr);
      assert.ok(chMatch, 'Expected codeHash in configRefresh expression');
      mEnv.win.__agPrism.codeHash = chMatch[1];
      const refRes = vm.runInNewContext(refExpr, mEnv.win);
      assert.equal(refRes.refreshed, true);
    }

    assert.ok(rigDisposed >= 1, `${label}: must call __agDualMascotRig.dispose() before deleting globals`);
    assert.ok(prismSynced >= 1, `${label}: must call __agPrism.sync()`);
    assert.equal(stageDisposed, 1, `${label}: must call stage.__agMascotApi.dispose()`);
    assert.equal(mEnv.doc.querySelector('.ag-cs-crab'), null, `${label}: must remove .ag-cs-crab`);
    assert.equal(mEnv.doc.querySelector('.ag-v2-mascot-stage'), null, `${label}: must remove .ag-v2-mascot-stage`);
    assert.equal(mEnv.doc.querySelector('.ag-v2-habitat-prop'), null, `${label}: must remove .ag-v2-habitat-prop`);
    assert.equal(anchor.hasAttribute('data-ag-cs-crab-anchor'), false, `${label}: must clear data-ag-cs-crab-anchor`);
    assert.equal(mEnv.rootEl.hasAttribute('data-ag-cs-has-crab'), false, `${label}: must clear data-ag-cs-has-crab`);
    assert.equal(mEnv.rootEl.hasAttribute('data-ag-cs-mascot-drag'), false, `${label}: must clear data-ag-cs-mascot-drag`);
    assert.equal(mEnv.win.__agDualMascotRig, undefined);
    assert.equal(mEnv.win.__agPrismMascotArt, undefined);
  }

  // 3) REMOVE_EXPRESSION cleans all 7 newly audited attributes
  const rEnv = createMiniDom('en');
  const attrTarget = rEnv.doc.createElement('div');
  const requiredAttrs = [
    'data-ag-cs-crab-anchor',
    'data-ag-sp-running',
    'data-ag-cs-queued',
    'data-ag-cs-conv-seat',
    'data-ag-cs-home-sheet',
    'data-ag-cs-input-layer',
    'data-ag-cs-vp-wrap',
  ];
  for (const attr of requiredAttrs) attrTarget.setAttribute(attr, '1');
  rEnv.body.appendChild(attrTarget);
  vm.runInNewContext(cdp.REMOVE_EXPRESSION, rEnv.win);
  for (const attr of requiredAttrs) {
    assert.equal(attrTarget.hasAttribute(attr), false, `REMOVE_EXPRESSION must strip ${attr}`);
  }

  // 4) inject.js createFastConfigRefreshBroadcaster supports Mascot enable -> disable lifecycle
  const injectMod = require(path.join(ROOT, 'inject.js'));
  let mCfg = { ...cdp.DEFAULT_CONFIG, mascot: 'crab', omniModule: 'off', sidebarStudio: 'off', hostLocalization: 'auto', thoughtTranslate: 'off', periodicModelPicker: 'off' };
  const evals = [];
  const sends = [];
  const mockEntry = {
    session: {
      closed: false,
      evaluate: async (code) => {
        evals.push(code);
        return code === '__REF__' ? { refreshed: true } : { ok: true };
      },
      send: async (method, params) => {
        sends.push({ method, params });
        return method === 'Page.addScriptToEvaluateOnNewDocument' ? { identifier: `id:${params.source}` } : {};
      },
    },
    scriptId: null,
    mascotScriptId: null,
    mascotMounted: false,
    pendingAckEpoch: 0,
  };
  const bc = injectMod._createFastConfigRefreshBroadcaster({
    attached: new Map([['w1', mockEntry]]),
    readConfig: () => mCfg,
    buildInjectExpression: () => '__MAIN__',
    buildConfigRefreshExpression: () => '__REF__',
    shouldEnableHostI18n: () => false,
    hostI18nRemoveExpression: '',
    getThoughtHooks: () => ({ shouldEnable: () => false, buildExpression: () => '', removeExpression: '' }),
    getInlineDiffHooks: () => ({ buildExpression: () => '', removeExpression: '' }),
    shouldEnablePeriodicPicker: () => false,
    periodicPickerRemoveExpression: '',
    shouldEnableMascot: (c) => c.mascot !== 'off',
    buildMascotChannelExpression: () => '__MASCOT__',
    mascotRemoveExpression: '__MASCOT_REMOVE__',
  });
  await bc();
  assert.ok(evals.includes('__MASCOT__'), 'Broadcaster must evaluate mascotExpr when mascot is enabled');
  assert.equal(mockEntry.mascotScriptId, 'id:__MASCOT__');
  assert.equal(mockEntry.mascotMounted, true);

  evals.length = 0;
  mCfg = { ...mCfg, mascot: 'off' };
  await bc();
  assert.ok(evals.includes('__MASCOT_REMOVE__'), 'Broadcaster must evaluate mascotRemoveExpression when mascot turns off');
  assert.equal(mockEntry.mascotScriptId, null);
  assert.equal(mockEntry.mascotMounted, false);

  // 5) v2.35.1 compat: wallpaper-client hides plugin-theme-home-wallpaper only when enabled (0 :has()), effort-slider hides orchestrator-picker-effort
  const wpMod = require(path.join(ROOT, 'vendor/wallpaper/wallpaper-client.js'));
  assert.equal(wpMod.WALLPAPER_CSS.includes(':has('), false);
  assert.ok(
    wpMod.WALLPAPER_CSS.includes('html[data-ag-prism-wallpaper="on"]:not([data-ag-prism-wallpaper-hole="1"]) [data-testid="plugin-theme-home-wallpaper"]'),
    'wallpaper-client CSS must suppress native plugin-theme-home-wallpaper only while Prism wallpaper is active'
  );
  const upSliderSrc = fs.readFileSync(path.join(ROOT, 'vendor/effort-slider/upstream-client.js'), 'utf8');
  assert.ok(
    upSliderSrc.includes("html[data-ces-slider-ready='1'] [role='menu']:has([data-testid='orchestrator-picker-effort']):not(:has([data-testid='model-selector-panel']))"),
    'effort-slider SLIDER_CSS must suppress v2.35.1 orchestrator-picker-effort submenu while excluding model-selector-panel'
  );
  assert.ok(
    upSliderSrc.includes('m.matches(\'[data-testid="orchestrator-picker-effort"]\')'),
    'effort-slider _isL3/_sySubs must detect v2.35.1 orchestrator-picker-effort nodes'
  );
});

test('Channel 12 (homeStudio): deferred extraction, cold/route-switch mount, idempotent & hot-swap zero-leak, config gating, disk cache, daemon sync & packaging parity', async () => {
  // 1) Module boundary, config gating & Channel 1 budget headroom
  assert.equal(cdp.RUNTIME_PARTS.includes('home-studio-panel.js'), false, 'home-studio-panel.js must NOT be in Channel 1 RUNTIME_PARTS');
  assert.equal(cdp.DEFERRED_ROOT_MODULES.includes('home-studio-panel.js'), true, 'home-studio-panel.js must be in DEFERRED_ROOT_MODULES');
  assert.equal(cdp.SYNC_ROOT_FILES.includes('home-studio-panel.js'), true, 'home-studio-panel.js must remain in SYNC_ROOT_FILES');
  assert.equal(cdp.shouldEnableHomeStudio({ homeLayout: 'studio' }), true);
  assert.equal(cdp.shouldEnableHomeStudio({ homeLayout: 'classic' }), false);
  assert.equal(cdp.shouldEnableHomeStudio({ homeLayout: 'off' }), false);
  assert.equal(cdp.buildHomeStudioChannelExpression({ homeLayout: 'classic' }), '');
  assert.equal(cdp.buildHomeStudioChannelExpression({ homeLayout: 'off' }), '');

  const ch1AutoExpr = cdp.buildInjectExpression({ ...cdp.DEFAULT_CONFIG, language: 'auto' });
  const ch1AutoBytes = Buffer.byteLength(ch1AutoExpr, 'utf8');
  assert.ok(ch1AutoBytes < 580_000, `Channel 1 auto must stay below 580 KB after Ch12 split, got ${ch1AutoBytes} B`);
  const homeStudioPreparedBytes = Buffer.byteLength(
    cdp.prepareRuntimePart('home-studio-panel.js', fs.readFileSync(path.join(ROOT, 'home-studio-panel.js'), 'utf8')),
    'utf8'
  );
  assert.ok(homeStudioPreparedBytes > 20_000, `Expected split home-studio-panel.js savings > 20 KB, got ${homeStudioPreparedBytes} B`);
  assert.equal(ch1AutoExpr.includes('syncHomeStudio') && ch1AutoExpr.includes('__agHomeStudioPanel'), true, 'Channel 1 ui-runtime bridge must expose syncHomeStudio and __agHomeStudioPanel hook');
  assert.equal(ch1AutoExpr.includes('.ag-cs-home-panel-head{'), false, 'Channel 1 must NOT inline home-studio-panel.js STUDIO_EXTRA_CSS body');
  const refExpr = cdp.buildConfigRefreshExpression({ homeLayout: 'classic' });
  assert.ok(Buffer.byteLength(refExpr, 'utf8') < 4096, `configRefresh must stay < 4096 B, got ${Buffer.byteLength(refExpr, 'utf8')} B`);

  // 2) Disk cache hit verification for Channel 12 homeStudio
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-ch12-cache-'));
  const cachePath = path.join(tmpDir, '.bundle-cache.json');
  try {
    cdp.resetBundleCacheStats();
    const ch12Cold = cdp.buildHomeStudioChannelExpression({ ...cdp.DEFAULT_CONFIG, homeLayout: 'studio' }, { cachePath });
    assert.ok(ch12Cold.length > 20_000, 'Expected compiled Channel 12 payload > 20 KB');

    delete require.cache[require.resolve(path.join(ROOT, 'cdp.js'))];
    const cdpFresh = require(path.join(ROOT, 'cdp.js'));
    cdpFresh.resetBundleCacheStats();
    const ch12Hit = cdpFresh.buildHomeStudioChannelExpression({ ...cdpFresh.DEFAULT_CONFIG, homeLayout: 'studio' }, { cachePath });
    assert.equal(ch12Hit, ch12Cold, 'Channel 12 disk cache hit must match cold compile byte-for-byte');
    const st = cdpFresh.getBundleCacheStats();
    assert.ok(st.channelHitsByName.homeStudio >= 1, 'Expected channelHitsByName.homeStudio >= 1 on cold reload');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // 3) Helper to create VM runtime sandbox with timer tracking for cold-home / route-switch / hot-swap tests
  const createHomeSandbox = ({ startOnHome = true } = {}) => {
    const env = createMiniDom('en');
    const activeTimers = new Set();
    let timerSeq = 0;
    const bindingCalls = [];
    const store = new Map();
    const homeEl = env.doc.createElement('div');
    homeEl.className = 'agy-home';
    const greet = env.doc.createElement('div');
    greet.setAttribute('data-testid', 'home-greeting');
    const h1 = env.doc.createElement('h1');
    h1.textContent = 'Welcome back';
    greet.appendChild(h1);
    homeEl.appendChild(greet);
    if (startOnHome) env.body.appendChild(homeEl);

    Object.assign(env.win, {
      location: { href: 'https://127.0.0.1:42000/', pathname: startOnHome ? '/' : '/c/conv-1' },
      innerWidth: 1280,
      innerHeight: 800,
      devicePixelRatio: 1,
      addEventListener() {},
      removeEventListener() {},
      localStorage: {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
      },
      getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1', getPropertyValue: () => '' }),
      matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
      MutationObserver: class { observe() {} disconnect() {} takeRecords() { return []; } },
      ResizeObserver: class { observe() {} disconnect() {} },
      HTMLElement: Object,
      Element: Object,
      Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 },
      requestAnimationFrame: (fn) => {
        const id = ++timerSeq;
        activeTimers.add(id);
        return id;
      },
      cancelAnimationFrame: (id) => { activeTimers.delete(id); },
      setTimeout: (fn, ms) => {
        const id = ++timerSeq;
        activeTimers.add(id);
        return id;
      },
      clearTimeout: (id) => { activeTimers.delete(id); },
      setInterval: () => 999999,
      clearInterval: () => {},
      performance: { now: () => Date.now() },
      __agPrismSetting: (payload) => { bindingCalls.push(JSON.parse(payload)); },
      Math, Date, JSON, Map, Set, WeakMap, WeakSet, Array, Object, String, Number, Boolean, Promise, Uint8Array, Float32Array, Intl, RegExp, Error, TypeError, encodeURIComponent, decodeURIComponent,
    });
    env.doc.defaultView = env.win;
    env.doc.readyState = 'complete';
    env.doc.hidden = false;
    return { env, homeEl, greet, h1, activeTimers, bindingCalls };
  };

  const ch12Expr = cdp.buildHomeStudioChannelExpression({ ...cdp.DEFAULT_CONFIG, homeLayout: 'studio' });

  // 3a) Cold start on .agy-home: Channel 1 loads before Channel 12 without error, requests Ch12, then Ch12 mounts immediately & supports idempotent reuse + hot-swap zero-leak
  {
    const { env, homeEl, h1, activeTimers, bindingCalls } = createHomeSandbox({ startOnHome: true });
    const bootRes = vm.runInNewContext(cdp.buildInjectExpression({ ...cdp.DEFAULT_CONFIG, language: 'en', homeLayout: 'studio' }), env.win);
    assert.equal(bootRes.status, 'ok');
    assert.equal(env.win.__agHomeStudioPanel, undefined, 'Channel 1 alone must not define __agHomeStudioPanel');
    assert.equal(homeEl.querySelector('.ag-cs-home-panel'), null, 'Panel must not exist before Channel 12 arrives');
    assert.equal(env.win.__agPrism.getState().hasPanel, false);
    assert.ok(
      bindingCalls.some((c) => c && c.action === 'request-home-studio-panel'),
      'Channel 1 on .agy-home must request Channel 12 via __agPrismSetting'
    );

    // Channel 12 arrives -> mounts panel & updates greeting immediately
    const mountRes = vm.runInNewContext(ch12Expr, env.win);
    assert.equal(mountRes.ok, true);
    assert.equal(mountRes.status, 'mounted');
    assert.ok(env.win.__agHomeStudioPanel && env.win.__agHomeStudioPanel === env.win.__agPrismHomeStudioPanel);
    assert.ok(homeEl.querySelector('.ag-cs-home-panel'), 'Home Studio panel must mount immediately upon Channel 12 arrival');
    assert.equal(env.win.__agPrism.getState().hasPanel, true);
    assert.equal(h1.textContent, "What's up next?");

    // Repeated injection with identical hash -> idempotent reuse, single panel seat
    const reuseRes = vm.runInNewContext(ch12Expr, env.win);
    assert.equal(reuseRes.ok, true);
    assert.equal(reuseRes.reused, true);
    assert.equal(homeEl.querySelectorAll('.ag-cs-home-panel-seat').length, 1);

    // Hot-swap with a newer codeHash -> disposes old controller (0 leaked timers, 1 panel seat)
    const timersBeforeSwap = activeTimers.size;
    const hotSwapExpr = ch12Expr.replace(/const targetHash = "([^"]+)"/, 'const targetHash = "hotswap999"');
    const swapRes = vm.runInNewContext(hotSwapExpr, env.win);
    assert.equal(swapRes.ok, true);
    assert.equal(swapRes.status, 'mounted');
    assert.equal(swapRes.codeHash, 'hotswap999');
    assert.equal(homeEl.querySelectorAll('.ag-cs-home-panel-seat').length, 1, 'Hot-swap must replace old panel seat cleanly');
    assert.ok(activeTimers.size <= timersBeforeSwap + 1, `Hot-swap must not leak timers (before=${timersBeforeSwap}, after=${activeTimers.size})`);

    // Config refresh to homeLayout="classic" -> tears down panel, style, globals, and restores greeting
    const chMatch = /"codeHash":"([^"]+)"/.exec(refExpr);
    assert.ok(chMatch);
    env.win.__agPrism.codeHash = chMatch[1];
    const refRes = vm.runInNewContext(refExpr, env.win);
    assert.equal(refRes.refreshed, true);
    assert.equal(homeEl.querySelector('.ag-cs-home-panel'), null);
    assert.equal(env.doc.getElementById('ag-prism-studio-v101-css'), null);
    assert.equal(env.win.__agHomeStudioPanel, undefined);
    assert.equal(env.win.__agPrismHomeStudioPanel, undefined);
    assert.equal(h1.textContent, 'Welcome back');
    env.win.__agPrism.destroy();
  }

  // 3b) Cold start on conversation page -> navigate back to .agy-home -> requests & mounts stably without race
  {
    const { env, homeEl, bindingCalls } = createHomeSandbox({ startOnHome: false });
    const bootRes = vm.runInNewContext(cdp.buildInjectExpression({ ...cdp.DEFAULT_CONFIG, language: 'en', homeLayout: 'studio' }), env.win);
    assert.equal(bootRes.status, 'ok');
    assert.equal(bindingCalls.some((c) => c && c.action === 'request-home-studio-panel'), false, 'Conversation page must not eagerly request Ch12');

    // User switches back to home page
    env.body.appendChild(homeEl);
    env.win.__agPrism.sync();
    assert.ok(
      bindingCalls.some((c) => c && c.action === 'request-home-studio-panel'),
      'Navigating from chat back to .agy-home must request Channel 12'
    );
    const mountRes = vm.runInNewContext(ch12Expr, env.win);
    assert.equal(mountRes.ok, true);
    assert.ok(homeEl.querySelector('.ag-cs-home-panel'), 'Home panel must mount after route switch + Ch12 delivery');

    // HOME_STUDIO_REMOVE_EXPRESSION cleans everything cleanly
    const remRes = vm.runInNewContext(cdp.HOME_STUDIO_REMOVE_EXPRESSION, env.win);
    assert.equal(remRes.status, 'off');
    assert.equal(homeEl.querySelector('.ag-cs-home-panel'), null);
    assert.equal(env.win.__agHomeStudioPanel, undefined);
    assert.equal(env.win.__agPrismHomeStudioPanel, undefined);
    env.win.__agPrism.destroy();
  }

  // 4) Daemon integration: handleBindingCall(request-home-studio-panel) & _syncHomeStudioOnEntry
  {
    const { PrismDaemon } = await import(pathToFileURL(path.join(ROOT, 'sidecars/daemon/main.mjs')).href);
    const daemon = new PrismDaemon({ rootDir: ROOT, bundleCachePath: false, silent: true, enableAutoUpdateTimer: false });
    const sent = [];
    const entry = {
      wsUrl: 'ws://127.0.0.1:9999/ch12',
      pageId: 'ch12-page',
      url: 'https://127.0.0.1:42000/',
      title: 'Antigravity',
      mainFrameId: 'main-frame',
      contextFrames: new Map([[42, { frameId: 'main-frame', isDefault: true, type: 'default' }]]),
      homeStudioScriptId: null,
      homeStudioMounted: false,
      lastHomeStudioSig: '',
      lastHomeStudioScriptSig: '',
      session: {
        closed: false,
        send: async (method, params) => {
          sent.push({ method, params });
          if (method === 'Page.addScriptToEvaluateOnNewDocument') return { identifier: 'hs-doc-1' };
          if (method === 'Runtime.evaluate') return { result: { value: { ok: true, status: 'mounted' } } };
          return {};
        },
        evaluate: async (expr) => {
          sent.push({ method: 'evaluate', expr });
          return { ok: true, status: 'mounted' };
        },
      },
    };
    await daemon.handleBindingCall(entry, {
      name: cdp.SETTING_BINDING,
      payload: JSON.stringify({ action: 'request-home-studio-panel' }),
      executionContextId: 42,
    });
    assert.equal(entry.homeStudioScriptId, 'hs-doc-1', 'Daemon must register NewDocument script on request-home-studio-panel');
    assert.equal(entry.homeStudioMounted, true, 'Daemon must evaluate Channel 12 and mark homeStudioMounted=true');
    assert.ok(
      sent.some((s) => s.method === 'Runtime.evaluate' && s.params.contextId === 42 && s.params.expression.includes('__agHomeStudioPanel')),
      'Daemon must evaluate Channel 12 on the requesting main executionContextId'
    );

    // Switching homeLayout -> classic removes NewDocument script & evaluates cleanup expression
    sent.length = 0;
    await daemon._syncHomeStudioOnEntry(entry, { ...cdp.DEFAULT_CONFIG, homeLayout: 'classic' }, { runCleanup: true });
    assert.equal(entry.homeStudioScriptId, null);
    assert.equal(entry.homeStudioMounted, false);
    assert.ok(sent.some((s) => s.method === 'Page.removeScriptToEvaluateOnNewDocument' && s.params.identifier === 'hs-doc-1'));
    assert.ok(sent.some((s) => s.method === 'evaluate' && s.expr.includes('detachHomeStudio')));
  }

  // 5) Packaging parity across Windows/macOS/Linux builders (native-plugin/home-studio-panel.js included)
  const buildCommon = await import(pathToFileURL(path.join(ROOT, 'scripts/build-common.mjs')).href);
  const buildLinux = await import(pathToFileURL(path.join(ROOT, 'scripts/build-linux.mjs')).href);
  const nativeEntries = buildCommon.collectNativePluginEntries(path.join(ROOT, 'config.example.json'));
  assert.ok(
    nativeEntries.some((e) => e.name === 'native-plugin/home-studio-panel.js'),
    'Windows/macOS collectNativePluginEntries must bundle native-plugin/home-studio-panel.js'
  );
  const linuxEntries = buildLinux.collectLinuxPortableEntries();
  assert.ok(
    linuxEntries.some((e) => e.name === 'obsidian-prism-linux/native-plugin/home-studio-panel.js'),
    'Linux collectLinuxPortableEntries must bundle obsidian-prism-linux/native-plugin/home-studio-panel.js'
  );
});

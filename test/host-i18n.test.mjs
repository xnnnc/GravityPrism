import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, '..');
const cdp = require(path.join(ROOT, 'cdp.js'));
const runtime = require(path.join(ROOT, 'vendor', 'host-i18n', 'host-i18n-runtime.js'));
const settingsPanel = require(path.join(ROOT, 'settings-panel.js'));
const i18nLocales = require(path.join(ROOT, 'i18n-locales.js'));
const i18nCore = require(path.join(ROOT, 'i18n-core.js'));

function createTestEnv(initialTime = 1000) {
  let now = initialTime;
  let nextTimerId = 1;
  const timers = new Map();
  let observerInstances = [];
  const docListeners = new Map();
  const winListeners = new Map();

  function makeText(val) {
    const node = {
      nodeType: 3,
      _nodeValue: String(val),
      parentElement: null,
      parentNode: null,
      isConnected: true,
      get nodeValue() {
        return this._nodeValue;
      },
      set nodeValue(v) {
        const next = String(v);
        if (this._nodeValue === next) return;
        this._nodeValue = next;
        notifyObservers({ type: 'characterData', target: this });
      },
      get textContent() {
        return this._nodeValue;
      },
      set textContent(v) {
        this.nodeValue = v;
      },
      get previousSibling() {
        if (!this.parentNode) return null;
        const list = this.parentNode.childNodes;
        const idx = list.indexOf(this);
        return idx > 0 ? list[idx - 1] : null;
      },
      get nextSibling() {
        if (!this.parentNode) return null;
        const list = this.parentNode.childNodes;
        const idx = list.indexOf(this);
        return idx >= 0 && idx + 1 < list.length ? list[idx + 1] : null;
      },
    };
    return node;
  }

  function makeEl(tag, opts = {}) {
    const attrs = new Map(Object.entries(opts.attrs || {}));
    const classes = new Set((opts.className || '').split(/\s+/).filter(Boolean));
    const childNodes = [];
    const el = {
      nodeType: 1,
      tagName: String(tag).toUpperCase(),
      id: opts.id || attrs.get('id') || '',
      isContentEditable: Boolean(opts.isContentEditable || attrs.get('contenteditable') === 'true'),
      parentElement: null,
      parentNode: null,
      isConnected: true,
      childNodes,
      style: {
        _props: {},
        setProperty(k, v) { this._props[k] = String(v); },
        removeProperty(k) { delete this._props[k]; },
      },
      classList: {
        contains: (c) => classes.has(c),
        add: (c) => classes.add(c),
        remove: (c) => classes.delete(c),
      },
      get className() {
        return Array.from(classes).join(' ');
      },
      set className(v) {
        classes.clear();
        String(v || '').split(/\s+/).filter(Boolean).forEach((c) => classes.add(c));
      },
      get children() {
        return childNodes.filter((c) => c.nodeType === 1);
      },
      get firstChild() {
        return childNodes[0] || null;
      },
      get lastElementChild() {
        const ch = this.children;
        return ch[ch.length - 1] || null;
      },
      get previousSibling() {
        if (!this.parentNode) return null;
        const list = this.parentNode.childNodes;
        const idx = list.indexOf(this);
        return idx > 0 ? list[idx - 1] : null;
      },
      get previousElementSibling() {
        if (!this.parentNode) return null;
        const list = this.parentNode.children;
        const idx = list.indexOf(this);
        return idx > 0 ? list[idx - 1] : null;
      },
      get nextSibling() {
        if (!this.parentNode) return null;
        const list = this.parentNode.childNodes;
        const idx = list.indexOf(this);
        return idx >= 0 && idx + 1 < list.length ? list[idx + 1] : null;
      },
      get textContent() {
        return childNodes.map((c) => (c.nodeType === 3 ? c.nodeValue : c.textContent)).join('');
      },
      set textContent(v) {
        childNodes.length = 0;
        const txt = makeText(v);
        txt.parentElement = this;
        txt.parentNode = this;
        childNodes.push(txt);
        notifyObservers({ type: 'childList', target: this, addedNodes: [txt], removedNodes: [] });
      },
      append(...nodes) {
        for (const n of nodes) {
          const item = typeof n === 'string' ? makeText(n) : n;
          item.parentElement = this;
          item.parentNode = this;
          childNodes.push(item);
          notifyObservers({ type: 'childList', target: this, addedNodes: [item], removedNodes: [] });
        }
        return this;
      },
      appendChild(n) {
        return this.append(n);
      },
      setAttribute(k, v) {
        attrs.set(k, String(v));
        if (k === 'id') this.id = String(v);
        if (k === 'contenteditable') this.isContentEditable = String(v) === 'true';
      },
      getAttribute(k) {
        return attrs.has(k) ? attrs.get(k) : null;
      },
      hasAttribute(k) {
        return attrs.has(k);
      },
      removeAttribute(k) {
        attrs.delete(k);
      },
      toggleAttribute(k, force) {
        const on = force === undefined ? !attrs.has(k) : Boolean(force);
        if (on) attrs.set(k, '');
        else attrs.delete(k);
        return on;
      },
      addEventListener() {},
      removeEventListener() {},
      closest(sel) {
        let cur = this;
        while (cur) {
          if (this._matchSelector && this._matchSelector(cur, sel)) return cur;
          cur = cur.parentElement;
        }
        return null;
      },
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
      },
      _matchSelector(node, sel) {
        return sel.split(',').map((s) => s.trim()).filter(Boolean).some((part) => {
          const tokens = part.split(/\s+/).filter(Boolean);
          if (tokens.length === 0) return false;
          if (!this._matchSimple(node, tokens[tokens.length - 1])) return false;
          let cur = node.parentElement;
          for (let ti = tokens.length - 2; ti >= 0; ti--) {
            while (cur && !this._matchSimple(cur, tokens[ti])) {
              cur = cur.parentElement;
            }
            if (!cur) return false;
            cur = cur.parentElement;
          }
          return true;
        });
      },
      querySelector(sel) {
        return this.querySelectorAll(sel)[0] || null;
      },
      querySelectorAll(sel) {
        const out = [];
        const walk = (n) => {
          for (const c of n.children) {
            if (this._matchSelector(c, sel)) out.push(c);
            walk(c);
          }
        };
        walk(this);
        return out;
      },
    };
    if (opts.text !== undefined) {
      const txt = makeText(opts.text);
      txt.parentElement = el;
      txt.parentNode = el;
      childNodes.push(txt);
    }
    return el;
  }

  function notifyObservers(mutation) {
    for (const obs of observerInstances) {
      if (!obs.connected) continue;
      obs.queue.push(mutation);
    }
  }

  function flushObservers() {
    for (const obs of observerInstances) {
      if (!obs.connected || obs.queue.length === 0) continue;
      const batch = obs.queue.splice(0);
      obs.cb(batch);
    }
  }

  class MockMutationObserver {
    constructor(cb) {
      this.cb = cb;
      this.connected = false;
      this.options = null;
      this.queue = [];
      observerInstances.push(this);
    }
    observe(_target, options) {
      this.connected = true;
      this.options = options;
    }
    disconnect() {
      this.connected = false;
    }
  }

  const html = makeEl('html');
  const head = makeEl('head');
  const body = makeEl('body');
  html.append(head, body);

  const doc = {
    readyState: 'complete',
    hidden: false,
    documentElement: html,
    head,
    body,
    createElement: (t) => makeEl(t),
    getElementById(id) {
      return html.querySelector('#' + id);
    },
    querySelector(s) {
      return html.querySelector(s);
    },
    querySelectorAll(s) {
      return html.querySelectorAll(s);
    },
    addEventListener(ev, fn, opts) {
      const key = `${ev}:${Boolean(opts && (opts === true || opts.capture))}`;
      if (!docListeners.has(key)) docListeners.set(key, new Set());
      docListeners.get(key).add(fn);
    },
    removeEventListener(ev, fn, opts) {
      const key = `${ev}:${Boolean(opts && (opts === true || opts.capture))}`;
      docListeners.get(key)?.delete(fn);
    },
    dispatchEvent(ev) {
      for (const cap of [true, false]) {
        const key = `${ev.type}:${cap}`;
        for (const fn of [...(docListeners.get(key) || [])]) fn(ev);
      }
    },
  };

  const win = {
    document: doc,
    location: { href: 'vscode-file://vscode-app/workbench.html' },
    MutationObserver: MockMutationObserver,
    addEventListener(ev, fn, opts) {
      const key = `${ev}:${Boolean(opts && (opts === true || opts.capture))}`;
      if (!winListeners.has(key)) winListeners.set(key, new Set());
      winListeners.get(key).add(fn);
    },
    removeEventListener(ev, fn, opts) {
      const key = `${ev}:${Boolean(opts && (opts === true || opts.capture))}`;
      winListeners.get(key)?.delete(fn);
    },
    dispatchEvent(ev) {
      for (const cap of [true, false]) {
        const key = `${ev.type}:${cap}`;
        for (const fn of [...(winListeners.get(key) || [])]) fn(ev);
      }
    },
  };

  function setTimeoutFn(fn, ms = 0) {
    const id = nextTimerId++;
    timers.set(id, { fn, runAt: now + ms, isRaf: false });
    return id;
  }
  function clearTimeoutFn(id) {
    timers.delete(id);
  }
  function rafFn(fn) {
    const id = nextTimerId++;
    timers.set(id, { fn, runAt: now + 16, isRaf: true });
    return id;
  }
  function cancelRafFn(id) {
    timers.delete(id);
  }
  function advanceTime(ms) {
    const targetTime = now + ms;
    while (true) {
      flushObservers();
      let earliest = null;
      for (const [id, entry] of timers.entries()) {
        if (entry.runAt <= targetTime && (!earliest || entry.runAt < earliest.entry.runAt)) {
          earliest = { id, entry };
        }
      }
      if (!earliest) break;
      now = Math.max(now, earliest.entry.runAt);
      timers.delete(earliest.id);
      earliest.entry.fn();
    }
    now = targetTime;
    flushObservers();
  }
  function flushRafOnly() {
    flushObservers();
    const rafEntries = [];
    for (const [id, entry] of timers.entries()) {
      if (entry.isRaf) rafEntries.push({ id, entry });
    }
    for (const item of rafEntries) {
      timers.delete(item.id);
      item.entry.fn();
    }
    flushObservers();
  }

  return {
    win,
    doc,
    makeEl,
    makeText,
    timers,
    observerInstances,
    docListeners,
    winListeners,
    nowFn: () => now,
    setNow: (v) => { now = v; },
    setTimeoutFn,
    clearTimeoutFn,
    rafFn,
    cancelRafFn,
    advanceTime,
    flushObservers,
    flushRafOnly,
  };
}

test('dictionary hygiene: vendor/host-i18n/zh-CN.json has 4763 exact + 405 patterns, zero private terms, compact JSON, and safe regexes', () => {
  const dictPath = path.join(ROOT, 'vendor', 'host-i18n', 'zh-CN.json');
  const raw = fs.readFileSync(dictPath, 'utf8');
  assert.equal(raw.includes('\n  '), false, 'zh-CN.json must be compact JSON without pretty-print indentation');

  const dict = JSON.parse(raw);
  const exactKeys = Object.keys(dict.exact || {});
  assert.equal(exactKeys.length, 4763);
  assert.equal((dict.patterns || []).length, 405);
  assert.equal(dict.exact['Unlock the power of agent swarms.'], '解锁智能体 Swarm 协作的强大能力。');
  assert.ok(
    dict.exact["Live view of the native swarm board, roster and @mention graph for the current conversation's swarm."]?.includes('Swarm'),
    'Swarm sidecar description must be translated while preserving Swarm'
  );
  // Antigravity v2.35.0 upstream sync spot-checks (yiheng8023/antigravity-chinese v3.3.63)
  assert.equal(dict.exact['Switch to RTL text direction'], '切换为从右到左的文字方向');
  assert.equal(dict.exact['Select Environment'], '选择环境');
  assert.equal(dict.exact['Clone from Remote'], '从远程克隆');
  assert.equal(
    dict.exact['Agent finished. Queued messages send after background work finishes.'],
    '智能体已完成工作。后台工作结束后将发送排队消息。'
  );
  assert.equal(dict.exact['System UI'], '系统界面字体');
  assert.equal(dict.exact['Prevent sleep'], '阻止系统休眠');

  const eng = runtime.createHostI18nEngine(dict);
  assert.equal(eng.translate('Select Sidebar Item 3'), '选择侧栏第 3 项');
  assert.equal(eng.translate('Work locally on main'), '在 main 上本地工作');
  assert.equal(eng.translate('3 of 8'), '第 3 轮（共 8 轮）');
  assert.equal(eng.translate('Created worker alpha'), null, 'Negative lookahead must keep Swarm "Created worker ..." untranslated');
  assert.equal(eng.translate('Created 2026-11-24'), '创建于 2026-11-24');

  const privRe = /ema-persona|emoji_emma|C:\\Users\\Administrator|\/Users\/|\/home\/|\.hermes|obsidian-prism/i;
  for (const k of exactKeys) {
    assert.equal(privRe.test(k) || privRe.test(dict.exact[k]), false, `Private term leaked in exact: ${k}`);
  }
  const nestedRe = /\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)[+*{]/;
  for (const p of dict.patterns) {
    assert.equal(privRe.test(p.regex) || privRe.test(p.replacement), false, `Private term in pattern: ${p.regex}`);
    assert.equal(nestedRe.test(p.regex), false, `Nested quantifier ReDoS risk: ${p.regex}`);
    assert.doesNotThrow(() => new RegExp(p.regex));
  }
});

test('runtime translates exact, pattern, attributes, multi-text merge, inline reorder, and destroy() restores 100% losslessly with zero DOM pollution', () => {
  const env = createTestEnv();
  const dict = JSON.parse(fs.readFileSync(path.join(ROOT, 'vendor', 'host-i18n', 'zh-CN.json'), 'utf8'));

  const navBtn = env.makeEl('button', {
    text: 'Settings',
    attrs: { title: 'Open Settings', 'aria-label': 'Settings', 'data-tooltip': 'Settings' },
  });
  const patternDiv = env.makeEl('div', { text: '5 minutes ago' });
  const multiTextDiv = env.makeEl('div');
  const t1 = env.makeText('All ');
  const t2 = env.makeText('3');
  const t3 = env.makeText('s run as Flash.');
  multiTextDiv.append(t1, t2, t3);

  const inlineWrap = env.makeEl('div');
  const i1 = env.makeText('Also includes');
  const iSpan = env.makeEl('span', { text: 'Global Permissions' });
  const i2 = env.makeText('when working in this project.');
  inlineWrap.append(i1, iSpan, i2);

  env.doc.body.append(navBtn, patternDiv, multiTextDiv, inlineWrap);

  const inst = runtime.mountHostI18n({
    root: env.win,
    doc: env.doc,
    dict,
    mode: 'auto',
    nowFn: env.nowFn,
    setTimeoutFn: env.setTimeoutFn,
    clearTimeoutFn: env.clearTimeoutFn,
    rafFn: env.rafFn,
    cancelRafFn: env.cancelRafFn,
  });

  const st = inst.getStatus();
  assert.equal(st.active, true);
  assert.equal(st.status, 'active');
  assert.equal(st.yielded, false);
  assert.ok(st.translatedCount >= 5);
  assert.equal(env.doc.documentElement.getAttribute('data-ag-prism-host-i18n'), 'active');

  assert.equal(navBtn.textContent, '设置');
  assert.equal(navBtn.getAttribute('aria-label'), '设置');
  assert.equal(navBtn.getAttribute('data-tooltip'), '设置');
  assert.equal(patternDiv.textContent, '5 分钟前');
  assert.notEqual(multiTextDiv.textContent, 'All 3s run as Flash.');
  assert.equal(i1.nodeValue, '在此项目中工作时，也包含');
  assert.equal(i2.nodeValue, '。');

  // Verify zero private property pollution on DOM nodes
  for (const key of Object.keys(navBtn)) {
    assert.equal(key.startsWith('_agy'), false, `DOM pollution found: ${key}`);
  }
  for (const key of Object.keys(t1)) {
    assert.equal(key.startsWith('_agy'), false, `TextNode pollution found: ${key}`);
  }

  assert.ok((env.docListeners.get('pointerenter:true')?.size || 0) >= 1, 'capture pointerenter must be registered');
  assert.ok((env.winListeners.get('blur:false')?.size || 0) >= 1, 'blur listener must be registered');

  // Verify 100% lossless restore on destroy()
  inst.destroy();
  const after = inst.getStatus();
  assert.equal(after.active, false);
  assert.equal(after.status, 'off');
  assert.equal(after.translatedCount, 0);
  assert.equal(env.doc.documentElement.getAttribute('data-ag-prism-host-i18n'), null);

  assert.equal(navBtn.textContent, 'Settings');
  assert.equal(navBtn.getAttribute('aria-label'), 'Settings');
  assert.equal(navBtn.getAttribute('data-tooltip'), 'Settings');
  assert.equal(patternDiv.textContent, '5 minutes ago');
  assert.equal(t1.nodeValue, 'All ');
  assert.equal(t2.nodeValue, '3');
  assert.equal(t3.nodeValue, 's run as Flash.');
  assert.equal(i1.nodeValue, 'Also includes');
  assert.equal(i2.nodeValue, 'when working in this project.');
  assert.equal(env.timers.size, 0, 'All timers/rAF must be cleared after destroy()');
  assert.equal(env.docListeners.get('pointerenter:true')?.size || 0, 0);
  assert.equal(env.winListeners.get('blur:false')?.size || 0, 0);
});

test('Layer 1 auto-yield: known global flags, root attributes, and html[lang="zh-CN"]', () => {
  const dict = { exact: { Settings: '设置' }, patterns: [] };

  for (const flag of ['__AGY_I18N_INITIALIZED__', '__ANTIGRAVITY_CN__', '__I18N_PATCHED__']) {
    const env = createTestEnv();
    env.win[flag] = true;
    const btn = env.makeEl('button', { text: 'Settings' });
    env.doc.body.append(btn);

    const inst = runtime.mountHostI18n({
      root: env.win,
      doc: env.doc,
      dict,
      mode: 'auto',
      nowFn: env.nowFn,
      setTimeoutFn: env.setTimeoutFn,
      clearTimeoutFn: env.clearTimeoutFn,
      rafFn: env.rafFn,
      cancelRafFn: env.cancelRafFn,
    });
    assert.equal(inst.getStatus().status, 'yielded');
    assert.equal(inst.getStatus().yielded, true);
    assert.equal(inst.getStatus().reason, 'external-ui-zh');
    assert.equal(env.observerInstances.length, 0, 'Must NOT mount MutationObserver when Layer 1 yields');
    assert.equal(btn.textContent, 'Settings');
    assert.equal(env.doc.documentElement.getAttribute('data-ag-prism-host-i18n'), 'yielded');
  }

  // html[lang="zh-CN"]
  const envLang = createTestEnv();
  envLang.doc.documentElement.setAttribute('lang', 'zh-CN');
  const btnLang = envLang.makeEl('button', { text: 'Settings' });
  envLang.doc.body.append(btnLang);
  const instLang = runtime.mountHostI18n({
    root: envLang.win,
    doc: envLang.doc,
    dict,
    mode: 'auto',
  });
  assert.equal(instLang.getStatus().status, 'yielded');
  assert.equal(instLang.getStatus().reason, 'external-ui-zh');
  assert.equal(envLang.observerInstances.length, 0);
});

test('Layer 2 zero-signature unknown external plugin auto-yield via Chrome UI sampling & anchor words', () => {
  const dict = { exact: { Settings: '设置', Cancel: '取消', Save: '保存' }, patterns: [] };

  // Case A: >= 3 Chrome UI controls in zh and >= 25% ratio (no global flags, no html[lang])
  const envA = createTestEnv();
  const nav = envA.makeEl('nav');
  nav.append(
    envA.makeEl('button', { text: '偏好设置' }),
    envA.makeEl('button', { text: '新建对话' }),
    envA.makeEl('button', { text: '扩展管理' }),
    envA.makeEl('button', { text: 'Save' }),
    envA.makeEl('button', { text: 'Cancel' })
  );
  // Put English inside conversation-view so chat messages don't pollute Chrome sampling
  const chat = envA.makeEl('div', { attrs: { 'data-testid': 'conversation-view' } });
  for (let i = 0; i < 20; i++) {
    chat.append(envA.makeEl('button', { text: `Message action ${i}` }));
  }
  envA.doc.body.append(nav, chat);

  const instA = runtime.mountHostI18n({
    root: envA.win,
    doc: envA.doc,
    dict,
    mode: 'auto',
    nowFn: envA.nowFn,
    setTimeoutFn: envA.setTimeoutFn,
    clearTimeoutFn: envA.clearTimeoutFn,
  });
  assert.equal(instA.getStatus().status, 'yielded');
  assert.equal(instA.getStatus().reason, 'external-ui-zh');
  assert.equal(envA.observerInstances.length, 0);

  // Case B: >= 2 anchor words hit directly even with many English buttons
  const envB = createTestEnv();
  const aside = envB.makeEl('aside');
  aside.append(envB.makeEl('button', { text: '设置' }), envB.makeEl('button', { text: '工作区' }));
  for (let i = 0; i < 12; i++) {
    aside.append(envB.makeEl('button', { text: `Workspace Item ${i}` }));
  }
  envB.doc.body.append(aside);
  const instB = runtime.mountHostI18n({ root: envB.win, doc: envB.doc, dict, mode: 'auto' });
  assert.equal(instB.getStatus().status, 'yielded');
  assert.equal(instB.getStatus().reason, 'external-ui-zh');

  // Case C: Only 1 Chinese user-name button & rest English -> must NOT false-trigger yield
  const envC = createTestEnv();
  const header = envC.makeEl('header');
  header.append(
    envC.makeEl('button', { text: '张三' }),
    envC.makeEl('button', { text: 'Settings' }),
    envC.makeEl('button', { text: 'Save' }),
    envC.makeEl('button', { text: 'Cancel' })
  );
  envC.doc.body.append(header);
  const instC = runtime.mountHostI18n({
    root: envC.win,
    doc: envC.doc,
    dict,
    mode: 'auto',
    nowFn: envC.nowFn,
    setTimeoutFn: envC.setTimeoutFn,
    clearTimeoutFn: envC.clearTimeoutFn,
    rafFn: envC.rafFn,
    cancelRafFn: envC.cancelRafFn,
  });
  assert.equal(instC.getStatus().status, 'active');
  assert.equal(header.children[1].textContent, '设置');
  instC.destroy();
});

test('Layer 2b delayed external plugin within 1200ms triggers auto-yield and lossless rollback', () => {
  const env = createTestEnv(1000);
  const dict = { exact: { Settings: '设置', Save: '保存' }, patterns: [] };

  const btn1 = env.makeEl('button', { text: 'Settings' });
  const btn2 = env.makeEl('button', { text: 'File' });
  const btn3 = env.makeEl('button', { text: 'Edit' });
  env.doc.body.append(btn1, btn2, btn3);

  const inst = runtime.mountHostI18n({
    root: env.win,
    doc: env.doc,
    dict,
    mode: 'auto',
    nowFn: env.nowFn,
    setTimeoutFn: env.setTimeoutFn,
    clearTimeoutFn: env.clearTimeoutFn,
    rafFn: env.rafFn,
    cancelRafFn: env.cancelRafFn,
  });
  assert.equal(inst.getStatus().status, 'active');
  assert.equal(btn1.textContent, '设置');

  // External plugin boots 300ms later and writes Chinese to host chrome nodes
  env.advanceTime(300);
  btn2.firstChild.nodeValue = '文件';
  btn3.firstChild.nodeValue = '编辑';
  env.flushObservers();

  const st = inst.getStatus();
  assert.equal(st.status, 'yielded');
  assert.equal(st.reason, 'external-ui-zh');
  assert.equal(st.active, false);
  // Our translated btn1 must be rolled back to its original English!
  assert.equal(btn1.textContent, 'Settings');
  // External plugin's nodes remain untouched
  assert.equal(btn2.textContent, '文件');
  assert.equal(btn3.textContent, '编辑');
});

test('Layer 3 Ping-Pong Circuit Breaker: single-node >= 3 conflicts exempts node; global >= 5 nodes triggers conflict-breaker destroy()', () => {
  const env = createTestEnv(5000);
  const dict = {
    exact: {
      Settings: '设置',
      Save: '保存',
      Cancel: '取消',
      Open: '打开',
      Close: '关闭',
      Copy: '复制',
      Delete: '删除',
    },
    patterns: [],
  };

  // Use mode:'on' to verify breaker still works even when initial auto-yield is skipped!
  const nodes = ['Settings', 'Save', 'Cancel', 'Open', 'Close', 'Copy', 'Delete'].map((t) =>
    env.makeEl('button', { text: t })
  );
  env.doc.body.append(...nodes);

  const inst = runtime.mountHostI18n({
    root: env.win,
    doc: env.doc,
    dict,
    mode: 'on',
    nowFn: env.nowFn,
    setTimeoutFn: env.setTimeoutFn,
    clearTimeoutFn: env.clearTimeoutFn,
    rafFn: env.rafFn,
    cancelRafFn: env.cancelRafFn,
  });
  assert.equal(inst.getStatus().status, 'active');
  assert.equal(nodes[0].textContent, '设置');

  // Normal React update (Settings -> Saved? use Cancel) must NOT count as conflict
  nodes[6].firstChild.nodeValue = 'Save';
  env.advanceTime(50);
  assert.equal(nodes[6].textContent, '保存');
  assert.equal(inst.getStatus().status, 'active');

  // Single-node ping-pong 3 times on nodes[0]: external keeps reverting '设置' -> 'Settings'
  for (let i = 0; i < 3; i++) {
    nodes[0].firstChild.nodeValue = 'Settings';
    env.advanceTime(100);
  }
  assert.equal(inst.getStatus().status, 'active', '1 conflicted node must not trip global 5-node breaker');
  assert.equal(nodes[0].textContent, 'Settings', 'Conflicted node must be exempted and stop fighting');

  // Now 4 more distinct nodes enter genuine ping-pong (>= 2 reverts within 3000ms, total 5 conflicted nodes)
  const origWords = ['Save', 'Cancel', 'Open', 'Close'];
  for (let round = 0; round < 2; round++) {
    for (let idx = 1; idx <= 4; idx++) {
      nodes[idx].firstChild.nodeValue = origWords[idx - 1];
      env.advanceTime(50);
    }
  }

  const finalSt = inst.getStatus();
  assert.equal(finalSt.status, 'yielded');
  assert.equal(finalSt.reason, 'conflict-breaker');
  assert.equal(finalSt.active, false);
  assert.equal(env.doc.documentElement.getAttribute('data-ag-prism-host-i18n'), 'yielded');
  // Remaining unaffected nodes like nodes[5] ('Copy' -> '复制') must be cleanly restored to original!
  assert.equal(nodes[5].textContent, 'Copy');
});

test('strict isolation boundaries: Prism UI, code/editors, inputs, model selector, and chat prose remain untouched', () => {
  const env = createTestEnv();
  const dict = { exact: { Settings: '设置', Save: '保存', Auto: '自动', Copy: '复制' }, patterns: [] };

  const prismSec = env.makeEl('div', { id: 'ag-cs-settings-sec' });
  prismSec.append(env.makeEl('button', { text: 'Settings' }));
  const prismCls = env.makeEl('div', { className: 'ag-prism-sidebar-studio' });
  prismCls.append(env.makeEl('span', { text: 'Save' }));
  const prismAttr = env.makeEl('div', { attrs: { 'data-ag-prism-ui': '1' } });
  prismAttr.append(env.makeEl('span', { text: 'Copy' }));

  const codeEl = env.makeEl('code', { text: 'Settings' });
  const preEl = env.makeEl('pre', { text: 'Save' });
  const monacoEl = env.makeEl('div', { className: 'monaco-editor' });
  monacoEl.append(env.makeEl('span', { text: 'Copy' }));
  const inputEl = env.makeEl('input', { attrs: { value: 'Settings' } });
  const editableEl = env.makeEl('div', { attrs: { contenteditable: 'true' }, text: 'Settings' });

  const modelTrigger = env.makeEl('button', { attrs: { 'data-testid': 'model-selector-trigger' }, text: 'Auto' });
  const modelPanel = env.makeEl('div', { attrs: { 'data-testid': 'model-selector-panel' } });
  modelPanel.append(env.makeEl('span', { text: 'Auto' }));
  const effortEl = env.makeEl('div', { attrs: { 'data-effort': 'high' }, text: 'Settings' });

  const chatProse = env.makeEl('div', { attrs: { 'data-markdown-root': 'true' } });
  chatProse.append(env.makeEl('p', { text: 'Settings' }));
  const convView = env.makeEl('div', { attrs: { 'data-testid': 'conversation-view' } });
  const chatPara = env.makeEl('p', { text: 'Settings' });
  const chatBtn = env.makeEl('button', { text: 'Copy' });
  convView.append(chatPara, chatBtn);

  env.doc.body.append(
    prismSec,
    prismCls,
    prismAttr,
    codeEl,
    preEl,
    monacoEl,
    inputEl,
    editableEl,
    modelTrigger,
    modelPanel,
    effortEl,
    chatProse,
    convView
  );

  const inst = runtime.mountHostI18n({ root: env.win, doc: env.doc, dict, mode: 'on' });
  assert.equal(prismSec.textContent, 'Settings');
  assert.equal(prismCls.textContent, 'Save');
  assert.equal(prismAttr.textContent, 'Copy');
  assert.equal(codeEl.textContent, 'Settings');
  assert.equal(preEl.textContent, 'Save');
  assert.equal(monacoEl.textContent, 'Copy');
  assert.equal(editableEl.textContent, 'Settings');
  assert.equal(modelTrigger.textContent, 'Auto');
  assert.equal(modelPanel.textContent, 'Auto');
  assert.equal(effortEl.textContent, 'Settings');
  assert.equal(chatProse.textContent, 'Settings');
  assert.equal(chatPara.textContent, 'Settings');
  assert.equal(chatBtn.textContent, '复制', 'Interactive host action button in conversation chrome still translates');

  inst.destroy();
  assert.equal(chatBtn.textContent, 'Copy');
});

test('0fps hibernation on document.hidden / window blur and resume scan on focus', () => {
  const env = createTestEnv(1000);
  const dict = { exact: { Settings: '设置', Save: '保存' }, patterns: [] };

  const btn1 = env.makeEl('button', { text: 'Settings' });
  env.doc.body.append(btn1);

  const inst = runtime.mountHostI18n({
    root: env.win,
    doc: env.doc,
    dict,
    mode: 'on',
    nowFn: env.nowFn,
    setTimeoutFn: env.setTimeoutFn,
    clearTimeoutFn: env.clearTimeoutFn,
    rafFn: env.rafFn,
    cancelRafFn: env.cancelRafFn,
  });
  assert.equal(btn1.textContent, '设置');

  // Hide document -> subsequent mutations must NOT schedule rAF
  env.doc.hidden = true;
  env.doc.dispatchEvent({ type: 'visibilitychange' });
  const btn2 = env.makeEl('button', { text: 'Save' });
  env.doc.body.append(btn2);
  env.advanceTime(100);
  assert.equal(btn2.textContent, 'Save', 'Must not translate while hidden (0fps sleep)');

  // Restore visibility -> automatically catches up
  env.doc.hidden = false;
  env.doc.dispatchEvent({ type: 'visibilitychange' });
  assert.equal(btn2.textContent, '保存');

  // Window blur -> pause, focus -> resume
  env.win.dispatchEvent({ type: 'blur' });
  const btn3 = env.makeEl('button', { text: 'Settings' });
  env.doc.body.append(btn3);
  env.advanceTime(100);
  assert.equal(btn3.textContent, 'Settings');
  env.win.dispatchEvent({ type: 'focus' });
  assert.equal(btn3.textContent, '设置');

  inst.destroy();
});

test('Channel 4 isolation: main bundle < 690 KiB without dict, shouldEnableHostI18n gating (incl. off reverse-restore), and auto+non-zh 0 B fail-closed', () => {
  const mainExpr = cdp.buildInjectExpression(cdp.DEFAULT_CONFIG);
  const mainBytes = Buffer.byteLength(mainExpr, 'utf8');
  assert.ok(mainBytes <= 704000, `Main bundle must stay <= 704,000 B, got ${mainBytes}`);
  assert.ok(mainBytes < 690 * 1024, `Main bundle must stay < 690 KiB, got ${mainBytes}`);
  assert.equal(mainExpr.includes('mountHostI18n'), false, 'Main bundle must NOT contain Channel 4 runtime');
  assert.equal(mainExpr.includes('浏览器子智能体已被您的管理员禁用'), false, 'Main bundle must NOT contain zh-CN.json entries');

  assert.equal(cdp.DEFAULT_CONFIG.hostLocalization, 'off');
  assert.deepEqual(cdp.VALIDATORS.hostLocalization, ['auto', 'on', 'off']);

  assert.equal(cdp.shouldEnableHostI18n({ hostLocalization: 'off', language: 'zh-CN' }), true);
  assert.equal(cdp.shouldEnableHostI18n({ hostLocalization: 'off', language: 'en' }), true);
  assert.equal(cdp.shouldEnableHostI18n({ hostLocalization: 'on', language: 'en' }), true);
  assert.equal(cdp.shouldEnableHostI18n({ hostLocalization: 'auto', language: 'zh-CN' }), true);
  assert.equal(cdp.shouldEnableHostI18n({ hostLocalization: 'auto', language: 'en' }), false);
  assert.equal(cdp.shouldEnableHostI18n({ hostLocalization: 'auto', language: 'zh-TW' }), false);
  assert.equal(cdp.shouldEnableHostI18n({ hostLocalization: 'auto', language: 'auto' }, 'zh-CN'), true);
  assert.equal(cdp.shouldEnableHostI18n({ hostLocalization: 'auto', language: 'auto' }, 'en-US'), false);

  const offExpr = cdp.buildHostI18nExpression({ hostLocalization: 'off', language: 'zh-CN' });
  assert.ok(Buffer.byteLength(offExpr, 'utf8') > 100000, 'off mode must mount Channel 4 for reverse English restore');
  assert.doesNotThrow(() => new vm.Script(offExpr));
  assert.equal(cdp.buildHostI18nExpression({ hostLocalization: 'auto', language: 'en' }), '');
  assert.equal(cdp.buildHostI18nExpression({ hostLocalization: 'auto', language: 'zh-TW' }), '');
  assert.equal(cdp.buildHostI18nExpression({ hostLocalization: 'auto', language: 'auto' }, 'en-US'), '');

  const ch4Expr = cdp.buildHostI18nExpression({ hostLocalization: 'auto', language: 'zh-CN' });
  assert.ok(Buffer.byteLength(ch4Expr, 'utf8') > 100000);
  assert.doesNotThrow(() => new vm.Script(ch4Expr));
  assert.doesNotThrow(() => new vm.Script(cdp.HOST_I18N_REMOVE_EXPRESSION));
  assert.ok(cdp.REMOVE_EXPRESSION.includes('__agPrismHostI18n'));

  // Execute Channel 4 expression end-to-end inside isolated VM
  const env = createTestEnv();
  const btn = env.makeEl('button', { text: 'Settings' });
  env.doc.body.append(btn);
  const sandbox = {
    window: env.win,
    globalThis: env.win,
    document: env.doc,
    MutationObserver: env.win.MutationObserver,
    setTimeout: env.setTimeoutFn,
    clearTimeout: env.clearTimeoutFn,
  };
  env.win.window = env.win;
  env.win.globalThis = env.win;
  const res = vm.runInNewContext(ch4Expr, sandbox);
  assert.equal(res.ok, true);
  assert.equal(res.status, 'active');
  assert.equal(btn.textContent, '设置');

  // Remove expression restores DOM cleanly
  vm.runInNewContext(cdp.HOST_I18N_REMOVE_EXPRESSION, sandbox);
  assert.equal(btn.textContent, 'Settings');
});

test('settings-panel renders hostLocalization 3-state control and displays yielded hint when data-ag-prism-host-i18n="yielded"', () => {
  const env = createTestEnv();
  const dialog = env.makeEl('div', { attrs: { role: 'dialog' } });
  const panel = env.makeEl('div', { className: 'p-6' });
  const h2 = env.makeEl('h2', { text: 'Appearance' });
  const anchor = env.makeEl('div', { className: 'space-y-2' });
  panel.append(h2, anchor);
  dialog.append(panel);
  env.doc.body.append(dialog);
  env.doc.documentElement.setAttribute('data-ag-prism-host-i18n', 'yielded');

  const saved = [];
  const origDoc = globalThis.document;
  globalThis.document = env.doc;
  try {
    settingsPanel.mountOrSyncSettingsSection({
      version: '1.0.4',
      getLang: () => 'zh-CN',
      uiText: (l) => i18nLocales.getUiStrings(l),
      isZh: () => true,
      i18nCore,
      formatSettingsSummary: () => 'Obsidian · 白昼冷晶 · 完整',
      resolveSettingRowActiveValue: (k) => (k === 'hostLocalization' ? 'auto' : undefined),
      isSettingButtonMatch: (k, vJson, cur) => vJson === JSON.stringify(cur),
      saveSetting: (k, v) => saved.push([k, v]),
      saveSettingsBatch: () => {},
      getThoughtTranslateMode: () => 'off',
      handledGroupClicks: new WeakSet(),
      runSettingsGroupGlide: () => {},
      runGuardedMut: (fn) => fn(),
    });
    env.doc.getElementById('ag-cs-settings-sec')?.__ensureFoldBody?.();
  } finally {
    globalThis.document = origDoc;
  }

  const row = env.doc.querySelector('[data-ag-cs-row="hostLocalization"]');
  assert.ok(row, 'hostLocalization row must be rendered in settings-panel');
  const desc = row.querySelector('[data-k="d"]');
  assert.equal(desc.textContent, '已检测外部汉化并自动礼让', `Expected yielded hint, got: ${desc.textContent}`);
  const buttons = row.querySelectorAll('button[data-ag-cs-key="hostLocalization"]');
  assert.equal(buttons.length, 3);
  assert.deepEqual(
    buttons.map((b) => JSON.parse(b.getAttribute('data-ag-cs-val'))),
    ['auto', 'on', 'off']
  );
  assert.equal(buttons[0].getAttribute('aria-pressed'), 'true');
});


test('[P0-1] shouldEnableHostI18n resolves LANG=zh_CN.UTF-8 and skips LC_ALL=C.UTF-8 / POSIX fallback', () => {
  const prevLcAll = process.env.LC_ALL;
  const prevLcMsg = process.env.LC_MESSAGES;
  const prevLang = process.env.LANG;
  try {
    process.env.LC_ALL = '';
    process.env.LC_MESSAGES = '';
    process.env.LANG = 'zh_CN.UTF-8';
    assert.equal(cdp.shouldEnableHostI18n({ hostLocalization: 'auto', language: 'auto' }), true);

    process.env.LANG = 'zh_CN.utf8@hans';
    assert.equal(cdp.shouldEnableHostI18n({ hostLocalization: 'auto', language: 'auto' }), true);

    process.env.LANG = 'en_US.UTF-8';
    assert.equal(cdp.shouldEnableHostI18n({ hostLocalization: 'auto', language: 'auto' }), false);

    // LC_ALL=C.UTF-8 must be ignored so Intl fallback or LANG isn't poisoned by POSIX C locale
    const origIntl = Intl.DateTimeFormat;
    Intl.DateTimeFormat = function () {
      return { resolvedOptions: () => ({ locale: 'zh-CN' }) };
    };
    cdp._setWindowsUiLocaleReaderForTest(() => '');
    try {
      process.env.LC_ALL = 'C.UTF-8';
      process.env.LC_MESSAGES = 'POSIX';
      process.env.LANG = 'C';
      assert.equal(cdp.shouldEnableHostI18n({ hostLocalization: 'auto', language: 'auto' }), true);
    } finally {
      Intl.DateTimeFormat = origIntl;
      cdp._setWindowsUiLocaleReaderForTest(null);
    }

    assert.equal(cdp.shouldEnableHostI18n({ hostLocalization: 'auto', language: 'auto' }, 'zh_CN.UTF-8'), true);
    assert.equal(cdp.shouldEnableHostI18n({ hostLocalization: 'auto', language: 'auto' }, 'C.UTF-8'), false);
  } finally {
    if (prevLcAll === undefined) delete process.env.LC_ALL; else process.env.LC_ALL = prevLcAll;
    if (prevLcMsg === undefined) delete process.env.LC_MESSAGES; else process.env.LC_MESSAGES = prevLcMsg;
    if (prevLang === undefined) delete process.env.LANG; else process.env.LANG = prevLang;
  }
});

test('[PR #50] Windows UI Display Language overrides Intl regional format, preserves hostLocalization="off" reverse channel, and prevents daemon skippedByLiveCfg heal churn', async () => {
  const prevLcAll = process.env.LC_ALL;
  const prevLcMsg = process.env.LC_MESSAGES;
  const prevLang = process.env.LANG;
  const origIntl = Intl.DateTimeFormat;
  try {
    process.env.LC_ALL = '';
    process.env.LC_MESSAGES = '';
    process.env.LANG = '';

    // Case 1: Windows Display Language is en-US while Regional Format (Intl) is zh-CN -> auto must NOT enable zh-CN host-i18n
    Intl.DateTimeFormat = function () {
      return { resolvedOptions: () => ({ locale: 'zh-CN' }) };
    };
    cdp._setWindowsUiLocaleReaderForTest(() => 'en-US');
    assert.equal(cdp.readWindowsPreferredUiLanguage(), 'en-US');
    assert.equal(cdp.detectSystemUiLocale(), 'en-US');
    assert.equal(cdp.resolveSystemLangNode(), 'en');
    assert.equal(cdp.shouldEnableHostI18n({ hostLocalization: 'auto', language: 'auto' }), false);
    assert.equal(cdp.shouldEnableHostI18n({}), false);
    // CRITICAL redline: hostLocalization='off' MUST still return true to mount reverse English restoration channel
    assert.equal(cdp.shouldEnableHostI18n({ hostLocalization: 'off', language: 'auto' }), true);
    assert.equal(cdp.shouldEnableHostI18n({ hostLocalization: 'off', language: 'en' }), true);
    const copyEn = cdp.buildRelaunchDialogCopy('auto');
    assert.equal(copyEn.relaunchBtn, 'Relaunch Now');
    assert.equal(/[\u4e00-\u9fa5]/.test(copyEn.body), false);

    // Case 2: Windows Display Language is zh-Hans-CN while Intl is en-US -> enables zh-CN host-i18n and Chinese relaunch prompt
    Intl.DateTimeFormat = function () {
      return { resolvedOptions: () => ({ locale: 'en-US' }) };
    };
    cdp._setWindowsUiLocaleReaderForTest(() => 'zh-Hans-CN');
    assert.equal(cdp.readWindowsPreferredUiLanguage(), 'zh-Hans-CN');
    assert.equal(cdp.detectSystemUiLocale(), 'zh-Hans-CN');
    assert.equal(cdp.resolveSystemLangNode(), 'zh-CN');
    assert.equal(cdp.shouldEnableHostI18n({ hostLocalization: 'auto', language: 'auto' }), true);
    const copyZh = cdp.buildRelaunchDialogCopy('auto');
    assert.equal(copyZh.relaunchBtn, '立即重开');

    // Case 3: buildConfigRefreshExpression honors navigator.languages[0] for auto non-zh destroy() AND preserves setMode('off')
    const runRefresh = (cfg, nav) => {
      const calls = [];
      const refExpr = cdp.buildConfigRefreshExpression(cfg);
      const sb = {
        navigator: nav,
        document: {
          documentElement: {
            setAttribute() {},
            removeAttribute() {},
          },
          querySelectorAll: () => [],
        },
        window: null,
        globalThis: null,
        __agPrism: {
          version: cdp.PLUGIN_VERSION,
          codeHash: JSON.parse(refExpr.match(/"codeHash":"([^"]+)"/)[1] ? `"${refExpr.match(/"codeHash":"([^"]+)"/)[1]}"` : '""'),
          refreshConfig: () => true,
          getState: () => ({ cfg }),
        },
        __agPrismHostI18n: {
          setMode: (m) => calls.push(['setMode', m]),
          destroy: () => calls.push(['destroy']),
        },
      };
      sb.window = sb;
      sb.globalThis = sb;
      const res = vm.runInNewContext(refExpr, sb);
      assert.equal(res.refreshed, true);
      return calls;
    };

    assert.deepEqual(
      runRefresh({ ...cdp.DEFAULT_CONFIG, hostLocalization: 'off', language: 'auto' }, { language: 'en-US', languages: ['en-US'] }),
      [['setMode', 'off']],
      'hostLocalization="off" must invoke setMode("off"), never destroy()'
    );
    assert.deepEqual(
      runRefresh({ ...cdp.DEFAULT_CONFIG, hostLocalization: 'auto', language: 'auto' }, { language: 'zh-CN', languages: ['en-US', 'zh-CN'] }),
      [['destroy']],
      'auto mode must prioritize navigator.languages[0] and gracefully destroy() hostI18n on non-zh UI'
    );
    assert.deepEqual(
      runRefresh({ ...cdp.DEFAULT_CONFIG, hostLocalization: 'auto', language: 'auto' }, { language: 'en-US', languages: ['zh-CN', 'en-US'] }),
      [['setMode', 'auto']],
      'auto mode with zh-CN primary navigator.languages[0] keeps setMode("auto")'
    );

    // Case 4: PrismDaemon consumes skippedByLiveCfg and prevents repeated verifyAndHeal churn on the same sig
    const { PrismDaemon } = await import('../sidecars/daemon/main.mjs');
    let hostI18nEvalCount = 0;
    let currentCfg = { ...cdp.DEFAULT_CONFIG, hostLocalization: 'auto', language: 'auto', omniModule: 'off', sidebarStudio: 'off', thoughtTranslate: 'off', periodicModelPicker: 'off', mascot: 'off', homeLayout: 'off', homeMode: 'off' };
    const daemon = new PrismDaemon({ rootDir: ROOT, silent: true, enableStorageGuardTimer: false, enableAutoUpdateTimer: false });
    daemon.cdp = {
      ...cdp,
      readConfig: () => ({ ...currentCfg }),
      shouldEnableHostI18n: (c) => (c.hostLocalization === 'off' ? true : c.hostLocalization === 'on' ? true : true),
      buildHostI18nExpression: () => '(() => ({ ok: true, status: "off", skippedByLiveCfg: true }))()',
    };
    daemon.injectExpr = '(() => ({ ok: true }))()';
    daemon.hostI18nExpr = '(() => ({ ok: true, status: "off", skippedByLiveCfg: true }))()';
    const entry = {
      wsUrl: 'ws://skip-guard',
      pageId: 'p1',
      url: 'vscode-file://vscode-app/workbench.html',
      title: 'Antigravity',
      mainFrameId: 'MAIN',
      contextFrames: new Map(),
      isolatedHostI18nPaused: false,
      isolatedHostI18nNoExtCtxs: new Set(),
      scriptId: 'main-1',
      omniScriptId: null,
      lastOmniExpr: '',
      sidebarScriptId: null,
      sidebarBindingAdded: false,
      sidebarMounted: false,
      hostI18nScriptId: 'hi-1',
      hostI18nMounted: false,
      hostI18nSkippedByLiveCfg: false,
      lastHostI18nSig: '',
      lastHostI18nScriptSig: 'auto:auto',
      thoughtScriptId: null,
      thoughtMounted: false,
      inlineDiffScriptId: null,
      inlineDiffMounted: false,
      inlineDiffSkipped: true,
      wallpaperScriptId: null,
      wallpaperMounted: false,
      wallpaperSkipped: true,
      suggesterScriptId: null,
      suggesterMounted: false,
      suggesterSkipped: true,
      periodicPickerScriptId: null,
      periodicPickerMounted: false,
      mascotScriptId: null,
      mascotMounted: false,
      homeStudioScriptId: null,
      homeStudioMounted: false,
      session: {
        closed: false,
        send: async (m) => (m === 'Page.addScriptToEvaluateOnNewDocument' ? { identifier: 'hi-new' } : {}),
        evaluate: async (expr) => {
          if (expr.includes('hasHostI18n')) {
            return {
              ready: true,
              isHostDom: true,
              hasStyle: true,
              hasRuntime: true,
              hasOmni: false,
              hasSidebar: false,
              hasSidebarBridge: false,
              hasHostI18n: false,
              hostI18nMode: '',
              hasThought: false,
              hasThoughtSettingsUi: false,
              hasInlineDiff: false,
              hasWallpaper: false,
              hasWallpaperUi: false,
              hasSuggester: false,
              hasSuggesterUi: false,
              hasPeriodicPicker: false,
              hasMascot: false,
              hasHomeStudio: false,
              codeHash: daemon.cdp.buildInjectExpression ? '' : '',
              href: 'vscode-file://vscode-app/workbench.html',
            };
          }
          if (expr.includes('skippedByLiveCfg')) {
            hostI18nEvalCount += 1;
            return { ok: true, status: 'off', skippedByLiveCfg: true };
          }
          return { ok: true };
        },
      },
    };
    // First verify: evaluates once and records hostI18nSkippedByLiveCfg = true
    await daemon._verifyAndHealEntryUnlocked(entry);
    assert.equal(hostI18nEvalCount, 1);
    assert.equal(entry.hostI18nMounted, false);
    assert.equal(entry.hostI18nSkippedByLiveCfg, true);
    assert.equal(entry.lastHostI18nSig, 'auto:auto');

    // Second verify under same sig: MUST NOT re-evaluate hostI18nExpr (0 churn!)
    await daemon._verifyAndHealEntryUnlocked(entry);
    assert.equal(hostI18nEvalCount, 1, 'Repeated health checks under same sig must skip hostI18n heal');

    // Config changes to hostLocalization='off': sig changes -> guard clears and evaluates reverse mode
    currentCfg = { ...currentCfg, hostLocalization: 'off' };
    daemon.hostI18nExpr = '(() => ({ ok: true, status: "off-enforced" }))()';
    let offEvaluated = 0;
    const origEval = entry.session.evaluate;
    entry.session.evaluate = async (expr) => {
      if (expr.includes('off-enforced')) {
        offEvaluated += 1;
        return { ok: true, status: 'off-enforced' };
      }
      return origEval(expr);
    };
    await daemon._verifyAndHealEntryUnlocked(entry);
    assert.equal(offEvaluated, 1, 'Switching to hostLocalization="off" must bypass old skippedByLiveCfg sig');
    assert.equal(entry.hostI18nMounted, true);
    assert.equal(entry.hostI18nSkippedByLiveCfg, false);
    assert.equal(entry.lastHostI18nSig, 'off:auto');
  } finally {
    Intl.DateTimeFormat = origIntl;
    cdp._setWindowsUiLocaleReaderForTest(null);
    if (prevLcAll === undefined) delete process.env.LC_ALL; else process.env.LC_ALL = prevLcAll;
    if (prevLcMsg === undefined) delete process.env.LC_MESSAGES; else process.env.LC_MESSAGES = prevLcMsg;
    if (prevLang === undefined) delete process.env.LANG; else process.env.LANG = prevLang;
  }
});

test('[P0-2 & P1-2] buildHostI18nExpression skips subframes, foreign http localhost without DOM markers, and live localStorage English override', () => {
  const ch4Expr = cdp.buildHostI18nExpression({ hostLocalization: 'auto', language: 'zh-CN' });

  // Subframe guard: window.self !== window.top
  const subEnv = createTestEnv();
  const subWin = { ...subEnv.win, top: {} };
  subWin.self = subWin;
  subWin.window = subWin;
  const subRes = vm.runInNewContext(ch4Expr, {
    window: subWin,
    globalThis: subWin,
    document: subEnv.doc,
    MutationObserver: subEnv.win.MutationObserver,
    setTimeout: subEnv.setTimeoutFn,
    clearTimeout: subEnv.clearTimeoutFn,
  });
  assert.equal(subRes.ok, false);
  assert.equal(subRes.status, 'skipped-subframe');

  // Foreign localhost app without DOM workbench markers
  const foreignEnv = createTestEnv();
  foreignEnv.win.location.href = 'http://127.0.0.1:3000/';
  foreignEnv.win.window = foreignEnv.win;
  foreignEnv.win.globalThis = foreignEnv.win;
  foreignEnv.win.self = foreignEnv.win;
  foreignEnv.win.top = foreignEnv.win;
  const foreignRes = vm.runInNewContext(ch4Expr, {
    window: foreignEnv.win,
    globalThis: foreignEnv.win,
    document: foreignEnv.doc,
    MutationObserver: foreignEnv.win.MutationObserver,
    setTimeout: foreignEnv.setTimeoutFn,
    clearTimeout: foreignEnv.clearTimeoutFn,
  });
  assert.equal(foreignRes.ok, false);
  assert.equal(foreignRes.status, 'skipped-non-host');

  // Live frontend cfg override (disk zh-CN vs frontend localStorage language='en')
  const liveEnEnv = createTestEnv();
  const btn = liveEnEnv.makeEl('button', { text: 'Settings' });
  liveEnEnv.doc.body.append(btn);
  liveEnEnv.win.window = liveEnEnv.win;
  liveEnEnv.win.globalThis = liveEnEnv.win;
  liveEnEnv.win.self = liveEnEnv.win;
  liveEnEnv.win.top = liveEnEnv.win;
  liveEnEnv.win.__agPrism = { getState: () => ({ cfg: { hostLocalization: 'auto', language: 'en' } }) };
  const enRes = vm.runInNewContext(ch4Expr, {
    window: liveEnEnv.win,
    globalThis: liveEnEnv.win,
    document: liveEnEnv.doc,
    MutationObserver: liveEnEnv.win.MutationObserver,
    setTimeout: liveEnEnv.setTimeoutFn,
    clearTimeout: liveEnEnv.clearTimeoutFn,
  });
  assert.equal(enRes.status, 'off');
  assert.equal(enRes.skippedByLiveCfg, true);
  assert.equal(btn.textContent, 'Settings');

  // HOST_I18N_REMOVE_EXPRESSION cleans attribute & factory
  liveEnEnv.doc.documentElement.setAttribute('data-ag-prism-host-i18n', 'active');
  liveEnEnv.win.__agPrismHostI18nFactory = {};
  vm.runInNewContext(cdp.HOST_I18N_REMOVE_EXPRESSION, {
    window: liveEnEnv.win,
    globalThis: liveEnEnv.win,
    document: liveEnEnv.doc,
  });
  assert.equal(liveEnEnv.doc.documentElement.getAttribute('data-ag-prism-host-i18n'), null);
  assert.equal(liveEnEnv.win.__agPrismHostI18nFactory, undefined);

  // buildConfigRefreshExpression includes immediate __agPrismHostI18n destroy on off
  const refreshExpr = cdp.buildConfigRefreshExpression({ hostLocalization: 'off', language: 'zh-CN' });
  assert.ok(refreshExpr.includes('__agPrismHostI18n'));
});

test('[P0-3] sidebar Chinese history titles, project names, editor tabs, title tag, and sidebar-split do NOT false-yield Layer 2a/2b', () => {
  const env = createTestEnv(1000);
  const dict = { exact: { Settings: '设置', Save: '保存', Cancel: '取消' }, patterns: [] };

  const titleEl = env.makeEl('title', { text: '修复前端架构问题 - Antigravity' });
  env.doc.head.append(titleEl);

  const split = env.makeEl('div', { attrs: { 'data-testid': 'sidebar-split' } });
  const sidebar = env.makeEl('aside');
  const projBtn = env.makeEl('button', { attrs: { 'data-testid': 'project-header' }, text: '我的中文项目' });
  const wsSwitch = env.makeEl('button', { attrs: { 'data-testid': 'workspace-switcher' }, text: '测试工作区' });
  const convList = env.makeEl('div', { attrs: { 'data-testid': 'conversation-list-sidebar' } });
  for (const t of ['修复登录逻辑', '优化构建性能', '重构路由系统', '自动模型测试', '账号权限校验']) {
    convList.append(env.makeEl('button', { attrs: { 'data-testid': 'conversation-row-sidebar' }, text: t }));
  }
  const navBtn = env.makeEl('button', { text: 'Settings' });
  const saveBtn = env.makeEl('button', { text: 'Save' });
  const cancelBtn = env.makeEl('button', { text: 'Cancel' });
  // Generic Chinese words containing "模型"/"自动"/"账号" must not trigger exact anchor false-positives
  const userTagBtn = env.makeEl('button', { text: '模型测试记录' });
  const userAutoBtn = env.makeEl('button', { text: '自动生成的标题' });
  sidebar.append(projBtn, wsSwitch, convList, navBtn, saveBtn, cancelBtn, userTagBtn, userAutoBtn);

  const tabs = env.makeEl('div', { className: 'tabs-container' });
  tabs.append(env.makeEl('div', { className: 'tab-label', text: '设计文档.md' }));
  tabs.append(env.makeEl('div', { className: 'tab-label', text: '架构说明.md' }));

  split.append(sidebar, tabs);
  env.doc.body.append(split);

  const inst = runtime.mountHostI18n({
    root: env.win,
    doc: env.doc,
    dict,
    mode: 'auto',
    nowFn: env.nowFn,
    setTimeoutFn: env.setTimeoutFn,
    clearTimeoutFn: env.clearTimeoutFn,
    rafFn: env.rafFn,
    cancelRafFn: env.cancelRafFn,
  });

  assert.equal(inst.getStatus().status, 'active', 'Must NOT yield due to Chinese sidebar/project/tabs');
  assert.equal(navBtn.textContent, '设置');
  assert.equal(saveBtn.textContent, '保存');
  assert.equal(projBtn.textContent, '我的中文项目');
  assert.equal(titleEl.textContent, '修复前端架构问题 - Antigravity');

  // Layer 2b: async loaded Chinese conversation rows within 1200ms must NOT trigger yield!
  env.advanceTime(250);
  const asyncRow1 = env.makeEl('button', { attrs: { 'data-testid': 'conversation-row-sidebar' }, text: '异步加载的中文历史会话一' });
  const asyncRow2 = env.makeEl('button', { attrs: { 'data-testid': 'conversation-row-sidebar' }, text: '异步加载的中文历史会话二' });
  convList.append(asyncRow1, asyncRow2);
  env.advanceTime(100);
  assert.equal(inst.getStatus().status, 'active', 'Layer 2b must ignore async conversation rows');

  inst.destroy();
});

test('[P0-4] detached nodes are pruned from WeakRef trackers and excluded from translatedCount', () => {
  const env = createTestEnv(1000);
  const dict = { exact: { Settings: '设置', Save: '保存', Cancel: '取消' }, patterns: [] };

  const buttons = [];
  for (let i = 0; i < 10; i++) {
    const b = env.makeEl('button', { text: 'Settings' });
    buttons.push(b);
    env.doc.body.append(b);
  }

  const inst = runtime.mountHostI18n({
    root: env.win,
    doc: env.doc,
    dict,
    mode: 'on',
    nowFn: env.nowFn,
    setTimeoutFn: env.setTimeoutFn,
    clearTimeoutFn: env.clearTimeoutFn,
    rafFn: env.rafFn,
    cancelRafFn: env.cancelRafFn,
  });
  assert.equal(inst.getStatus().translatedCount, 10);

  // Detach 6 buttons (SPA route unmount)
  for (let i = 0; i < 6; i++) {
    buttons[i].isConnected = false;
    buttons[i].firstChild.isConnected = false;
  }
  assert.equal(inst.getStatus().translatedCount, 4, 'translatedCount must only count connected nodes');

  // Append disconnected node via mutation -> must not be translated
  const detachedBtn = env.makeEl('button', { text: 'Save' });
  detachedBtn.isConnected = false;
  detachedBtn.firstChild.isConnected = false;
  const liveBtn = env.makeEl('button', { text: 'Cancel' });
  env.doc.body.append(detachedBtn, liveBtn);
  env.advanceTime(50);
  assert.equal(detachedBtn.textContent, 'Save');
  assert.equal(liveBtn.textContent, '取消');
  assert.equal(inst.getStatus().translatedCount, 5);

  inst.destroy();
});

test('[P0-5] React 19 multi-HostText interpolation updates cleanly without tearing sibling text nodes', () => {
  const env = createTestEnv(1000);
  const dict = JSON.parse(fs.readFileSync(path.join(ROOT, 'vendor', 'host-i18n', 'zh-CN.json'), 'utf8'));

  // Sibling interpolation: "All " + "3" + "s run as Flash."
  const flashDiv = env.makeEl('div');
  const f1 = env.makeText('All ');
  const f2 = env.makeText('3');
  const f3 = env.makeText('s run as Flash.');
  flashDiv.append(f1, f2, f3);

  // Countdown interpolation: "Resets in " + "5" + " minutes"
  const resetDiv = env.makeEl('div');
  const r1 = env.makeText('Resets in ');
  const r2 = env.makeText('5');
  const r3 = env.makeText(' minutes');
  resetDiv.append(r1, r2, r3);

  env.doc.body.append(flashDiv, resetDiv);

  const inst = runtime.mountHostI18n({
    root: env.win,
    doc: env.doc,
    dict,
    mode: 'on',
    nowFn: env.nowFn,
    setTimeoutFn: env.setTimeoutFn,
    clearTimeoutFn: env.clearTimeoutFn,
    rafFn: env.rafFn,
    cancelRafFn: env.cancelRafFn,
  });

  // f2 & r2 must NOT be cleared to ''
  assert.equal(f2.nodeValue, '3');
  assert.equal(r2.nodeValue, '5');

  // Simulate React updating interpolated numeric HostText nodes
  f2.nodeValue = '5';
  r2.nodeValue = '4';
  env.advanceTime(50);

  assert.equal(f2.nodeValue, '5');
  assert.equal(r2.nodeValue, '4');
  assert.ok(flashDiv.textContent.includes('5'), `Expected 5 in ${flashDiv.textContent}`);
  assert.ok(!resetDiv.textContent.includes('5 分钟后重置4'), `Must not tear into "5 分钟后重置4", got: ${resetDiv.textContent}`);

  inst.destroy();
  assert.equal(f1.nodeValue, 'All ');
  assert.equal(f2.nodeValue, '5');
  assert.equal(f3.nodeValue, 's run as Flash.');
});

test('[P1-A] Layer 3 handles childList (textContent) ping-pong and ignores single 5-button React refresh', () => {
  const env = createTestEnv(5000);
  const dict = {
    exact: { Settings: '设置', Save: '保存', Cancel: '取消', Open: '打开', Close: '关闭', Copy: '复制' },
    patterns: [],
  };

  const buttons = ['Settings', 'Save', 'Cancel', 'Open', 'Close', 'Copy'].map((t) => env.makeEl('button', { text: t }));
  env.doc.body.append(...buttons);

  const inst = runtime.mountHostI18n({
    root: env.win,
    doc: env.doc,
    dict,
    mode: 'on',
    nowFn: env.nowFn,
    setTimeoutFn: env.setTimeoutFn,
    clearTimeoutFn: env.clearTimeoutFn,
    rafFn: env.rafFn,
    cancelRafFn: env.cancelRafFn,
  });

  // Single refresh of 5 buttons (recent.length === 1) must NOT trip global conflict-breaker
  const words = ['Settings', 'Save', 'Cancel', 'Open', 'Close'];
  for (let i = 0; i < 5; i++) {
    buttons[i].textContent = words[i];
  }
  env.advanceTime(50);
  assert.equal(inst.getStatus().status, 'active', 'Single refresh of 5 buttons must NOT trip conflict-breaker');
  assert.equal(buttons[0].textContent, '设置');

  // Genuine childList (textContent) ping-pong 3 times on buttons[0] -> exempts buttons[0] without killing others
  for (let r = 0; r < 2; r++) {
    buttons[0].textContent = 'Settings';
    env.advanceTime(50);
  }
  assert.equal(inst.getStatus().status, 'active');
  assert.equal(buttons[0].textContent, 'Settings', '3-time childList ping-pong must exempt element');
  assert.equal(buttons[5].textContent, '复制');

  inst.destroy();
});

test('[P1-B] expanded safety boundaries block pills, thinking trigger, orchestrator selector, ces-/ag-anim-, and deep >128 trees', () => {
  const env = createTestEnv();
  const dict = { exact: { Settings: '设置', Save: '保存', Copy: '复制', Auto: '自动' }, patterns: [] };

  const convView = env.makeEl('div', { attrs: { 'data-testid': 'conversation-view' } });
  const pillBtn = env.makeEl('button', { attrs: { 'data-testid': 'entity-pill' }, text: 'Settings' });
  const thinkTrigger = env.makeEl('button', { attrs: { 'data-testid': 'thinking-collapsible-trigger' }, text: 'Save' });
  const msgBubble = env.makeEl('div', { attrs: { 'data-testid': 'user-message-bubble' } });
  msgBubble.append(env.makeEl('button', { text: 'Settings' }));
  const realChromeBtn = env.makeEl('button', { text: 'Copy' });
  convView.append(pillBtn, thinkTrigger, msgBubble, realChromeBtn);

  const orchSel = env.makeEl('button', { attrs: { 'data-testid': 'model-selector-orchestrator' }, text: 'Auto' });
  const cesBox = env.makeEl('div', { className: 'ces-panel' });
  cesBox.append(env.makeEl('span', { text: 'Settings' }));
  const animBox = env.makeEl('div', { className: 'ag-anim-badge' });
  animBox.append(env.makeEl('span', { text: 'Save' }));

  // Deep >128-level tree -> Fail-Closed
  let deepRoot = env.makeEl('div');
  let cur = deepRoot;
  for (let i = 0; i < 132; i++) {
    const nxt = env.makeEl('div');
    cur.append(nxt);
    cur = nxt;
  }
  const deepLeaf = env.makeEl('span', { text: 'Settings' });
  cur.append(deepLeaf);

  env.doc.body.append(convView, orchSel, cesBox, animBox, deepRoot);

  const inst = runtime.mountHostI18n({ root: env.win, doc: env.doc, dict, mode: 'on' });
  assert.equal(pillBtn.textContent, 'Settings');
  assert.equal(thinkTrigger.textContent, 'Save');
  assert.equal(msgBubble.textContent, 'Settings');
  assert.equal(orchSel.textContent, 'Auto');
  assert.equal(cesBox.textContent, 'Settings');
  assert.equal(animBox.textContent, 'Save');
  assert.equal(deepLeaf.textContent, 'Settings', '>128 depth must Fail-Closed');
  assert.equal(realChromeBtn.textContent, '复制');

  inst.destroy();
});

test('[P1-C, P1-D, P1-E, P1-F] hover trailing tooltip, post-1200ms observer hibernation, yielded destroy(), and attribute dynamic switch', () => {
  const env = createTestEnv(1000);
  const dict = { exact: { Settings: '设置', Save: '保存', Expand: '展开', Collapse: '收起', Copy: '复制' }, patterns: [] };

  const rootApp = env.makeEl('div', { id: 'root' });
  const bigParent = env.makeEl('div');
  for (let i = 0; i < 10; i++) bigParent.append(env.makeEl('span', { text: `Item ${i}` }));
  const hoverBtn = env.makeEl('button', { text: 'Settings', attrs: { 'aria-label': 'Expand' } });
  bigParent.append(hoverBtn);
  rootApp.append(bigParent);
  env.doc.body.append(rootApp);

  const inst = runtime.mountHostI18n({
    root: env.win,
    doc: env.doc,
    dict,
    mode: 'on',
    nowFn: env.nowFn,
    setTimeoutFn: env.setTimeoutFn,
    clearTimeoutFn: env.clearTimeoutFn,
    rafFn: env.rafFn,
    cancelRafFn: env.cancelRafFn,
  });

  // [P1-F] Host dynamically changes attribute from 'Expand' (translated '展开') to 'Collapse' -> '收起'
  hoverBtn.setAttribute('aria-label', 'Collapse');
  inst.scan();
  assert.equal(hoverBtn.getAttribute('aria-label'), '收起');

  // [P1-C] Rapid hover within 120ms schedules trailing timer for delayed tooltip
  env.doc.dispatchEvent({ type: 'pointerenter', target: hoverBtn });
  env.advanceTime(30);
  const tooltip = env.makeEl('div', { attrs: { role: 'tooltip' }, text: 'Copy' });
  env.doc.body.append(tooltip);
  env.doc.dispatchEvent({ type: 'pointerenter', target: hoverBtn });
  env.advanceTime(200);
  assert.equal(tooltip.textContent, '复制', 'Trailing hover timer must translate delayed tooltip');

  // [P1-D] After 1200ms Layer 2b window, blur disconnects MutationObserver completely
  env.advanceTime(1500);
  env.win.dispatchEvent({ type: 'blur' });
  assert.equal(env.observerInstances[0].connected, false, 'Observer must disconnect on blur after Layer 2b window');
  const hiddenBtn = env.makeEl('button', { text: 'Save' });
  env.doc.body.append(hiddenBtn);
  env.advanceTime(100);
  assert.equal(hiddenBtn.textContent, 'Save');
  env.win.dispatchEvent({ type: 'focus' });
  assert.equal(env.observerInstances[0].connected, true, 'Observer must reconnect on focus');
  assert.equal(hiddenBtn.textContent, '保存');

  // [P1-F] destroy() restores dynamic attribute to 'Collapse', NOT stale 'Expand'
  inst.destroy();
  assert.equal(hoverBtn.getAttribute('aria-label'), 'Collapse');

  // [P1-E] yielded state destroy() resets status to 'off' and removes root attribute
  const yEnv = createTestEnv();
  yEnv.win.__AGY_I18N_INITIALIZED__ = true;
  const yInst = runtime.mountHostI18n({ root: yEnv.win, doc: yEnv.doc, dict, mode: 'auto' });
  assert.equal(yInst.getStatus().status, 'yielded');
  assert.equal(yEnv.doc.documentElement.getAttribute('data-ag-prism-host-i18n'), 'yielded');
  yInst.destroy();
  assert.equal(yInst.getStatus().status, 'off');
  assert.equal(yInst.getStatus().yielded, false);
  assert.equal(yEnv.doc.documentElement.getAttribute('data-ag-prism-host-i18n'), null);

  // Re-mounting over existing instance destroys old instance cleanly
  const yInst2 = runtime.mountHostI18n({ root: yEnv.win, doc: yEnv.doc, dict, mode: 'on' });
  assert.equal(yInst2.getStatus().status, 'active');
  yInst2.destroy();
});

test('[P1-1 & P2-1] settings-panel shows yield hint only when mode=auto, and daemon verifyAndHealEntry heals missing hostI18nScriptId & checks evalRes.ok', () => {
  const env = createTestEnv();
  const dialog = env.makeEl('div', { attrs: { role: 'dialog' } });
  const panel = env.makeEl('div', { className: 'p-6' });
  panel.append(env.makeEl('h2', { text: 'Appearance' }), env.makeEl('div', { className: 'space-y-2' }));
  dialog.append(panel);
  env.doc.body.append(dialog);
  env.doc.documentElement.setAttribute('data-ag-prism-host-i18n', 'yielded');

  const origDoc = globalThis.document;
  globalThis.document = env.doc;
  try {
    settingsPanel.mountOrSyncSettingsSection({
      version: '1.0.4',
      getLang: () => 'zh-CN',
      uiText: (l) => i18nLocales.getUiStrings(l),
      isZh: () => true,
      i18nCore,
      formatSettingsSummary: () => 'Obsidian · 白昼冷晶 · 完整',
      resolveSettingRowActiveValue: (k) => (k === 'hostLocalization' ? 'off' : undefined),
      isSettingButtonMatch: (k, vJson, cur) => vJson === JSON.stringify(cur),
      saveSetting: () => {},
      saveSettingsBatch: () => {},
      getThoughtTranslateMode: () => 'off',
      handledGroupClicks: new WeakSet(),
      runSettingsGroupGlide: () => {},
      runGuardedMut: (fn) => fn(),
    });
    env.doc.getElementById('ag-cs-settings-sec')?.__ensureFoldBody?.();
  } finally {
    globalThis.document = origDoc;
  }

  const descOff = env.doc.querySelector('[data-ag-cs-row="hostLocalization"] [data-k="d"]').textContent;
  assert.equal(descOff.includes('自动礼让'), false, 'Yield hint must NOT appear when hostLocalization=off');

  const daemonSrc = fs.readFileSync(path.join(ROOT, 'sidecars', 'daemon', 'main.mjs'), 'utf8');
  assert.ok(daemonSrc.includes('!probe.hasHostI18n || !entry.hostI18nScriptId'));
  assert.ok(daemonSrc.includes('if (evalRes && evalRes.ok)'));
});

test('[P2-2 & P2-4] ReDoS patterns complete in linear time, English sentences are uncorrupted, and __proto__ text is safe', () => {
  const dict = JSON.parse(fs.readFileSync(path.join(ROOT, 'vendor', 'host-i18n', 'zh-CN.json'), 'utf8'));
  const engine = runtime.createHostI18nEngine(dict);

  // Ordinary English sentences must not be partially corrupted by anchored patterns #52-#56, #79, #142, #143
  assert.equal(engine.translate('Build takes 5 minutes to finish'), null);
  assert.equal(engine.translate('My task finished'), null);
  assert.equal(engine.translate('When ready, It requires Docker to be installed.'), null);
  assert.equal(engine.translate('5 minutes'), '5 分钟');
  assert.equal(engine.translate('Timer has expired'), '定时器已到期');
  assert.equal(engine.translate('It requires Docker Desktop to be installed.'), '需要安装 Docker Desktop 才能运行。');

  // ReDoS adversarial input stress test (< 50ms)
  const t0 = performance.now();
  assert.equal(engine.translate(' '.repeat(30000) + 'X'), null);
  assert.equal(engine.translate('It requires ' + 'a '.repeat(5000) + 'X'), null);
  assert.equal(engine.translate('Save ' + 'a '.repeat(5000) + 'Ctrl+S'), null);
  assert.equal(engine.translate('Settings' + ' '.repeat(600)), null);
  for (const idx of [52, 53, 54, 55, 56, 79, 83, 142, 143]) {
    const re = new RegExp(dict.patterns[idx].regex);
    re.test(' '.repeat(30000) + 'finished');
    re.test('It requires ' + 'a '.repeat(2000) + '!');
  }
  const elapsed = performance.now() - t0;
  assert.ok(elapsed < 100, `ReDoS stress test took too long: ${elapsed.toFixed(2)}ms`);

  // __proto__ text must not crash or misbehave in Layer 2 or engine
  const env = createTestEnv();
  const nav = env.makeEl('nav');
  nav.append(env.makeEl('button', { text: '__proto__' }), env.makeEl('button', { text: 'constructor' }));
  env.doc.body.append(nav);
  const inst = runtime.mountHostI18n({ root: env.win, doc: env.doc, dict, mode: 'auto' });
  assert.equal(inst.getStatus().status, 'active');
  assert.equal(engine.translate('__proto__'), null);
  inst.destroy();
});

function createBruteForceReferenceTranslator(dictData) {
  const exactDict = dictData.exact || {};
  const patterns = (dictData.patterns || []).concat(dictData.rules || []).map((p) => ({
    regex: new RegExp(p.regex),
    replacement: p.replacement,
  }));
  const translatedValues = Object.create(null);
  for (const k of Object.keys(exactDict)) translatedValues[exactDict[k]] = true;
  const hasOwn = Object.prototype.hasOwnProperty;
  const ZH_CHAR_RE = /[\u4e00-\u9fa5]/;
  const EN_ALPHA_RE = /[a-zA-Z]/;

  function applyPatternsBrute(text) {
    for (let idx = 0; idx < patterns.length; idx++) {
      const pat = patterns[idx];
      pat.regex.lastIndex = 0;
      if (pat.regex.test(text)) {
        pat.regex.lastIndex = 0;
        let result = text.replace(pat.regex, pat.replacement);
        for (let pi = 0; pi < patterns.length; pi++) {
          patterns[pi].regex.lastIndex = 0;
          if (patterns[pi].regex.test(result)) {
            patterns[pi].regex.lastIndex = 0;
            result = result.replace(patterns[pi].regex, patterns[pi].replacement);
          }
        }
        return result;
      }
    }
    return null;
  }

  return function bruteTranslate(rawStr) {
    if (!rawStr || typeof rawStr !== 'string' || rawStr.length > 512) return null;
    const normalized = rawStr.replace(/\s+/g, ' ').trim();
    if (!normalized) return null;
    if (hasOwn.call(exactDict, normalized)) return exactDict[normalized];
    if (!EN_ALPHA_RE.test(normalized)) return null;
    if (translatedValues[normalized]) return null;
    if (ZH_CHAR_RE.test(normalized) && !/[a-zA-Z]{2,}/.test(normalized)) return null;

    const patRes = applyPatternsBrute(normalized);
    if (patRes !== null) return patRes;

    const punctuationMatch = normalized.match(/^([\w\s\-\/]+)([:：…\.？\?!！]+)$/);
    if (punctuationMatch) {
      const base = punctuationMatch[1].trim();
      const punc = punctuationMatch[2];
      if (hasOwn.call(exactDict, base)) return exactDict[base] + (punc === ':' ? '：' : punc);
    }

    const hotkeyMatch = normalized.match(
      /(\((?:Ctrl|Cmd|Alt|Shift)\+[^\s\)]+\)|\b(?:Ctrl|Cmd|Alt|Shift)\+[\w;:,\\/+\-]+)$/i
    );
    if (hotkeyMatch && hotkeyMatch.index > 0) {
      const cmdBase = normalized.slice(0, hotkeyMatch.index).trim();
      const hotkey = hotkeyMatch[1].trim();
      if (cmdBase && /^[\w\s\-\/]+$/.test(cmdBase) && hasOwn.call(exactDict, cmdBase)) {
        return exactDict[cmdBase] + ' ' + hotkey;
      }
    }

    if (
      normalized.includes('. ') ||
      normalized.includes('! ') ||
      normalized.includes('? ') ||
      normalized.includes('。')
    ) {
      const sentences = normalized.split(/([.!?]\s+|[。！？]\s*)/);
      let anyTranslated = false;
      let allTranslated = true;
      const translatedParts = [];
      for (let sIdx = 0; sIdx < sentences.length; sIdx++) {
        const part = sentences[sIdx];
        const trimmedPart = part.trim();
        if (!trimmedPart || /^[.!?。！？\s]+$/.test(part)) {
          translatedParts.push(part.replace(/\.\s*/g, '。 '));
          continue;
        }
        let transPart =
          (hasOwn.call(exactDict, trimmedPart) ? exactDict[trimmedPart] : null) ||
          (hasOwn.call(exactDict, trimmedPart + '.') ? exactDict[trimmedPart + '.'] : null);
        if (!transPart) transPart = applyPatternsBrute(trimmedPart);
        if (!transPart) {
          const pMatch = trimmedPart.match(/^([\w\s\-\/]+)([:：…\.？\?!！]+)$/);
          if (pMatch && hasOwn.call(exactDict, pMatch[1].trim())) {
            transPart = exactDict[pMatch[1].trim()] + (pMatch[2] === ':' ? '：' : pMatch[2]);
          }
        }
        if (transPart) {
          anyTranslated = true;
          translatedParts.push(transPart);
        } else {
          allTranslated = false;
          translatedParts.push(part);
        }
      }
      if (anyTranslated && allTranslated) {
        return translatedParts.join('').replace(/([。！？])[。！？.]*\s*/g, '$1 ').trim();
      }
    }
    return null;
  };
}

test('[Perf-1] pattern precheck index + bounded LRU unitCache (<= 2048) matches 405 brute-force patterns 100% byte-for-byte across full corpus + 250+ edge strings', () => {
  const dict = JSON.parse(fs.readFileSync(path.join(ROOT, 'vendor', 'host-i18n', 'zh-CN.json'), 'utf8'));
  const brute = createBruteForceReferenceTranslator(dict);
  const engine = runtime.createHostI18nEngine(dict);

  const edgeAndPatternCorpus = [
    ...Object.keys(dict.exact),
    ...Object.values(dict.exact).slice(0, 120),
    'Thought for 1h 23m 45.6s',
    'Thought for 2h 10m',
    'Thought for 3h',
    'Thought for 12m 3.5s',
    'Thought for 5m',
    'Thought for 0.8s',
    'See all (18)',
    'See all 9',
    '(4 subagents)',
    '(1 subagent)',
    '7 subagents',
    '1 subagent',
    '5 seconds ago',
    '1 second ago',
    '12 minutes ago',
    '3 hours ago',
    '2 days ago',
    '4 weeks ago',
    '6 months ago',
    '2 years ago',
    '15s ago',
    '8M ago',
    '2h ago',
    '9d ago',
    '09:15 / 12:30',
    '01:02:03 / 04:05:06',
    'Jan 5 - Feb 19',
    'Mar 3 – 12',
    'Apr 14, 2026, 10:30:00 AM',
    'Dec 1, 9:05 PM',
    'Nov 21, 2026',
    'Oct 8',
    'Jan 15日',
    'Sep 3日',
    'AM 09:30',
    'PM 11:05',
    '10:45 PM',
    '08:00:12 AM',
    '84.5% of the customization budget is available.',
    '100% of the customization budget is available',
    'of the customization budget is available.',
    'Show 6 breakdowns',
    'Hide 1 breakdown',
    'You have used some of your weekly limit, it will fully refresh in 3 days.',
    'You have used some of your 5 hour limit, it will fully refresh in 2h 10m.',
    'You have used some of your 5-hour limit, it will fully refresh in 45m',
    'You have hit your 5-hour limit, so the weekly limit does not currently apply. Your 5-hour limit will refresh in 1h.',
    'You have hit your 5-hour limit, it will refresh in 2h 15m. If on a supported paid plan, you can use AI credits in the interim.',
    'You have hit your weekly limit, it will refresh in 4 days',
    '3 days, 4 hours',
    '2 hours, 15 minutes',
    '7 days',
    '1 hour',
    '45 minutes',
    '12 files changed',
    '40 insertions(+)',
    '8 deletions(-)',
    'Step 2 of 5',
    'Task 7 running',
    'Saved at 14:22:09',
    '3 active subagents',
    'Created 4 files',
    'Modified 1 file',
    'Thinking for 1h 2m 3s',
    'Thinking for 2m 10s',
    'Stopped after 8 steps',
    'Scan the code to open this device in ',
    'to browse the store, or add a custom server via the MCP config.',
    '了解更多关于 Inherit General',
    'Also includes global settings when working in this project',
    'Mode: Inherit General',
    'It requires Docker Desktop to be installed.',
    'Configure browser subagent',
    'Configure the browser subagent.',
    '配置浏览器子智能体。 It requires Node',
    'Configure the browser subagent. It requires Chrome',
    'It requires',
    'Manage project folders, agent settings, and permissions.',
    'No folders added yet',
    '+ Add Folder',
    'Permanently delete my-workspace?',
    '快捷键 for quick navigation and control.',
    'Shortcuts for quick navigation and control.',
    'for quick navigation and control',
    'LAYOUT CONTROLS',
    'Layout CONTROLS',
    'Attach screenshot (optional)',
    'Attach a screenshots (optional)',
    'Please list the steps to reproduce the issue',
    'Describe the bug you encountered...',
    'Describe the bug you encountered',
    'STEPS TO REPRODUCE',
    'Steps to Reproduce',
    'Steps to reproduce',
    'Enter Queues after the turn',
    'Alt+Enter Sends immediately',
    'Shift+Enter On empty prompt, sends next in queue',
    'Ctrl+Enter Queues after the turn',
    'Cmd+Enter Sends immediately',
    'On empty prompt, sends next in queue',
    'Queues after the turn',
    'Sends immediately',
    'Models within this group: Gemini, Claude',
    'Inherits your General settings 在此项目中工作时。',
    'Inherits default settings.',
    'Inherits your General settings',
    'Your quota for this model is running low.',
    'Your quota for this model has run out',
    'View Usage',
    'Sends after agent finishes working.',
    'Send Now',
    'Select Project Ctrl+K',
    'Select Model Cmd+M',
    'Cancel (Ctrl+C)',
    'Copy 项目名称',
    'Copy Project Name',
    '4 tasks running',
    'Ran npm test',
    'Explored 12 files',
    'Explored src/core',
    'Edited cdp.js',
    'Viewed README.md',
    'Ran 3 commands',
    'Explored 2 tasks',
    'Timed 30 seconds',
    'Timed 5 minutes',
    '  Timer has expired',
    'Inherits your "General" settings when working in this project.',
    '继承您的“通用”设置 when working in this project.',
    'Browser settings have moved to the Browser section of General settings.',
    'Worked for 1h 5m 9s',
    'Stopped after 2d 3h 4m',
    'Worked for 1d 2h 3m',
    'Message from coordinator',
    'Executing task: lint & test',
    'Record Audio Ctrl+R',
    'Create New Project',
    'Create Project',
    'New Terminal Ctrl+Shift+`',
    'Add Terminal Ctrl+Shift+P',
    'Add Context @file',
    '2 agents running',
    '继承您的全局权限，在此项目中工作时。',
    'Inherits your global permissions when working in this project.',
    'Also includes Global Permissions when working in this project. Learn more.',
    '也包含全局权限，在此项目中工作时',
    'Resets in 2d 5h 12m.',
    'resets in 4h, 20m',
    'Resets in 15 mins, 30 secs',
    'Resets in less than a minute.',
    'resets in a few seconds',
    'Resets soon.',
    'Refreshes in 1d 2h 3m',
    'refreshes in 10m',
    'Refreshes soon',
    'All scheduled tasks run as Flash.',
    '全部 plugins run as Pro.',
    'All automations run as Carbon.',
    'Search tasks...',
    'Search conversations…',
    'Project + Worktree',
    'Workspace + Worktree',
    'Undo to this point.',
    'Undo to here',
    'Failed to add plugin. Please try again.',
    'Failed to add plugin',
    'Mark all 12 conversations as read',
    'Mark 1 conversation as read',
    'Are you sure you want to mark all 8 conversations as read? This action cannot be undone.',
    '5 active conversations',
    '3 archived conversations',
    'Try Remote Control',
    'Try 远程控制',
    '14 tools enabled',
    '2 tools disabled',
    'Disable bash tool for guest',
    'Enable mcp tool for workspace',
    'See less in Sidebar',
    '收起 in Sidebar',
    'More actions for Agent',
    '更多操作 for Agent',
    'Unnamed agent 3',
    'Unnamed Skill 1',
    'UI Extension 2',
    'Automation 4',
    'Rule 9',
    'GitHub MCP, setup required',
    'Model quota will refresh on May 1.',
    'Your quota will refresh on tomorrow.',
    '12,345 / 256,000 tokens (4.8%)',
    '(8,192 tokens) 3.2%',
    '(1,024 tokens)',
    'Rules: 1,240 tokens',
    'Custom Group: 512 tokens',
    '3 demoted',
    '2 excluded',
    '1 tool excluded',
    '8 tools',
    '2 rules exceeded the rules budget and were demoted from full inline content to a file-path pointer.',
    '1 item in MCP exceeded the customization budget and was excluded from context.',
    'Send feedback as user@example.com',
    'Branch feat/host-i18n-v2.0',
    'All changes since main',
    '3 commits to push',
    '1 commit to pull',
    'Send message Enter',
    'Send Message (Cmd+Enter)',
    'Settings:',
    'Save...',
    'Cancel?',
    'Open Settings (Ctrl+,)',
    'Settings Ctrl+Shift+P',
    'Settings. Save! Cancel?',
    'Save. Cancel.',
    '',
    '   ',
    '123456',
    'C:\\projects\\demo-app\\src\\index.js',
    '/usr/local/lib/node_modules/npm/bin/npm-cli.js',
    'v1.0.4-rc.2+build.20261121',
    '__proto__',
    'constructor',
    'hasOwnProperty',
    'A'.repeat(600),
  ];

  // Add 220 diverse unmatched/near-miss boundary strings (optional quantifiers, partial anchors, multi-sentence docs)
  for (let i = 0; i < 220; i++) {
    edgeAndPatternCorpus.push(
      `Experimental option #${i}: Controls whether background worker #${i} caches AST symbols. Requires restart when toggled.`
    );
    edgeAndPatternCorpus.push(`Thought about ${i} items without matching duration format`);
    edgeAndPatternCorpus.push(`Janitor ${i} cleaned 10 rooms - Decibel ${i}`);
  }

  assert.ok(edgeAndPatternCorpus.length >= 4200, `Corpus should be comprehensive, got ${edgeAndPatternCorpus.length}`);

  for (const sample of edgeAndPatternCorpus) {
    const expected = brute(sample);
    const actual = engine.translate(sample);
    assert.strictEqual(actual, expected, `Mismatch for input ${JSON.stringify(sample)}: actual=${actual} vs expected=${expected}`);
  }

  // Verify bounded LRU unitCache stores null negative hits and strictly caps size <= 2048
  assert.equal(engine.maxCacheSize, 2048);
  for (let i = 0; i < 2600; i++) {
    const missKey = `Unmatched unique setting description line item #${i} with English words`;
    assert.equal(engine.translate(missKey), null);
  }
  assert.ok(engine.unitCache.size <= 2048, `unitCache must stay bounded <= 2048, got ${engine.unitCache.size}`);
  const recentMiss = 'Unmatched unique setting description line item #2599 with English words';
  assert.equal(engine.unitCache.has(recentMiss), true, 'Negative null result must be cached in unitCache');
  assert.equal(engine.unitCache.get(recentMiss), null);
});

test('[Perf-2] 500 unmatched long English descriptions run significantly faster with index + negative cache (0 regex on warm pass) & O(1) boundary depth propagation', () => {
  const dict = JSON.parse(fs.readFileSync(path.join(ROOT, 'vendor', 'host-i18n', 'zh-CN.json'), 'utf8'));
  const brute = createBruteForceReferenceTranslator(dict);
  const engine = runtime.createHostI18nEngine(dict);

  const unmatchedDescriptions = Array.from({ length: 500 }, (_, i) =>
    `Configure workspace indexing strategy for partition #${i}. When enabled, background watchers coalesce rapid filesystem events and skip generated build directories during active compilation.`
  );

  // Warm up JIT minimally
  for (let i = 0; i < 10; i++) {
    brute(unmatchedDescriptions[i]);
  }

  const tBrute0 = performance.now();
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < unmatchedDescriptions.length; i++) {
      assert.equal(brute(unmatchedDescriptions[i]), null);
    }
  }
  const bruteElapsedMs = performance.now() - tBrute0;

  const tOpt0 = performance.now();
  // Pass 1: cold pass (exercises first-char bucket + literal anchor indexOf precheck + multi-sentence break)
  for (let i = 0; i < unmatchedDescriptions.length; i++) {
    assert.equal(engine.translate(unmatchedDescriptions[i]), null);
  }
  const optColdMs = performance.now() - tOpt0;

  // Instrument regex.test to prove 0 regex executions on subsequent passes via negative unitCache
  let warmRegexCalls = 0;
  const origTests = engine.patterns.map((p) => p.regex.test);
  for (const p of engine.patterns) {
    const orig = p.regex.test;
    p.regex.test = function (str) {
      warmRegexCalls++;
      return orig.call(this, str);
    };
  }

  let optWarmMs = 0;
  try {
    const tWarm0 = performance.now();
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < unmatchedDescriptions.length; i++) {
        assert.equal(engine.translate(unmatchedDescriptions[i]), null);
      }
    }
    optWarmMs = performance.now() - tWarm0;
  } finally {
    engine.patterns.forEach((p, idx) => {
      p.regex.test = origTests[idx];
    });
  }

  const optTotalMs = optColdMs + optWarmMs;
  assert.equal(warmRegexCalls, 0, 'Second encounter of unmatched strings must hit negative unitCache with 0 regex executions');
  assert.ok(
    optTotalMs < bruteElapsedMs * 0.45,
    `Expected indexed + negative-cached engine (${optTotalMs.toFixed(2)}ms) to be >2.2x faster than brute-force (${bruteElapsedMs.toFixed(2)}ms)`
  );

  // Verify O(1) amortized boundary depth propagation eliminates O(N * D) repeated parent walks
  const env = createTestEnv();
  let cur = env.doc.body;
  for (let d = 0; d < 35; d++) {
    const wrap = env.makeEl('div');
    cur.append(wrap);
    cur = wrap;
  }
  let parentReads = 0;
  const countWrappedParent = (node) => {
    let _p = node.parentElement;
    Object.defineProperty(node, 'parentElement', {
      get() {
        parentReads++;
        return _p;
      },
      set(v) {
        _p = v;
      },
      configurable: true,
    });
  };
  let anc = cur;
  while (anc && anc !== env.doc.documentElement) {
    countWrappedParent(anc);
    anc = anc.parentNode;
  }
  for (let i = 0; i < 80; i++) {
    const btn = env.makeEl('button', { text: 'Settings' });
    cur.append(btn);
    countWrappedParent(btn);
  }
  parentReads = 0;
  const inst = runtime.mountHostI18n({
    root: env.win,
    doc: env.doc,
    dict: { exact: { Settings: '设置' }, patterns: [] },
    mode: 'on',
  });
  assert.equal(inst.getStatus().translatedCount, 80);
  // Old O(N * D) climbed 35 ancestors * (80 elements + 80 text nodes) > 5,600 parentElement reads.
  // Amortized O(1) propagation only reads parentElement for applyTextWrite conflict state (~80 reads).
  assert.ok(parentReads < 350, `Expected amortized O(1) parent reads (< 350), got ${parentReads}`);
  inst.destroy();
});

test('[Perf-3] scanFloatingContainers skips [role="dialog"] & dialog portals, performs 0 disconnect/reconnect when empty, and hoverHandler early-exits on dialog body', () => {
  const env = createTestEnv(1000);
  const dict = {
    exact: { Settings: '设置', Save: '保存', Copy: '复制', Open: '打开', Delete: '删除' },
    patterns: [],
  };

  const topBtn = env.makeEl('button', { text: 'Settings' });
  const dialog = env.makeEl('div', { attrs: { role: 'dialog' } });
  const dialogBody = env.makeEl('div', { className: 'p-6' });
  for (let i = 0; i < 6; i++) dialogBody.append(env.makeEl('div', { text: `Section ${i}` }));
  const dialogLabel = env.makeEl('span', { text: 'Save' });
  dialogBody.append(dialogLabel);
  dialog.append(dialogBody);

  const dialogPortal = env.makeEl('div', { attrs: { 'data-floating-ui-portal': '' } });
  const innerDialog = env.makeEl('div', { attrs: { role: 'dialog' } });
  const innerDialogSpan = env.makeEl('span', { text: 'Open' });
  innerDialog.append(innerDialogSpan);
  dialogPortal.append(innerDialog);

  const ignoredPrism = env.makeEl('div', { className: 'ag-cs-panel', text: 'Copy' });
  env.doc.body.append(topBtn, dialog, dialogPortal, ignoredPrism);

  const inst = runtime.mountHostI18n({
    root: env.win,
    doc: env.doc,
    dict,
    mode: 'on',
    nowFn: env.nowFn,
    setTimeoutFn: env.setTimeoutFn,
    clearTimeoutFn: env.clearTimeoutFn,
    rafFn: env.rafFn,
    cancelRafFn: env.cancelRafFn,
  });

  assert.equal(dialogLabel.textContent, '保存');
  assert.equal(innerDialogSpan.textContent, '打开');

  // Quietly reset raw _nodeValue without firing MO to detect if hover/scanFloatingContainers re-scans dialogs
  dialogLabel.firstChild._nodeValue = 'Save';
  innerDialogSpan.firstChild._nodeValue = 'Open';

  const obs = env.observerInstances[0];
  let disconnectCalls = 0;
  let observeCalls = 0;
  const origDisconnect = obs.disconnect.bind(obs);
  const origObserve = obs.observe.bind(obs);
  obs.disconnect = () => {
    disconnectCalls++;
    origDisconnect();
  };
  obs.observe = (t, o) => {
    observeCalls++;
    origObserve(t, o);
  };

  // 1. Hovering disconnected node, Prism-owned node, [role="dialog"] root, or dialog layout container -> early exit (0 timers, 0 disconnect)
  const detached = env.makeEl('button', { text: 'Delete' });
  detached.isConnected = false;
  env.doc.dispatchEvent({ type: 'pointerenter', target: detached });
  env.doc.dispatchEvent({ type: 'pointerenter', target: ignoredPrism });
  env.doc.dispatchEvent({ type: 'pointerenter', target: dialog });
  env.doc.dispatchEvent({ type: 'pointerenter', target: dialogBody });
  assert.equal(env.timers.size, 0, 'Early-exited pointerenter must not schedule hover timers');
  assert.equal(disconnectCalls, 0);
  assert.equal(observeCalls, 0);

  // 2. Hovering topBtn runs leading target scan (1 disconnect/observe), then trailing scanFloatingContainers finds 0 non-dialog candidates -> 0 extra disconnect/observe!
  env.advanceTime(200);
  disconnectCalls = 0;
  observeCalls = 0;
  env.doc.dispatchEvent({ type: 'pointerenter', target: topBtn });
  assert.equal(disconnectCalls, 1, 'Leading small-target hover scan runs once');
  assert.equal(observeCalls, 1);

  // Now advance past trailing 50ms timer -> scanFloatingContainers runs with only dialog & dialogPortal in DOM
  disconnectCalls = 0;
  observeCalls = 0;
  env.advanceTime(100);
  assert.equal(disconnectCalls, 0, 'scanFloatingContainers with empty non-dialog candidates must do 0 disconnectObserver()');
  assert.equal(observeCalls, 0, 'scanFloatingContainers with empty non-dialog candidates must do 0 reconnectObserver()');
  assert.equal(dialogLabel.textContent, 'Save', '[role="dialog"] must NOT be re-scanned by scanFloatingContainers');
  assert.equal(innerDialogSpan.textContent, 'Open', '[data-floating-ui-portal] wrapping [role="dialog"] must NOT be re-scanned');

  // 3. Genuine small floating listbox / menu portal still translates cleanly
  const listbox = env.makeEl('div', { attrs: { role: 'listbox' } });
  const optItem = env.makeEl('div', { attrs: { role: 'option' }, text: 'Delete' });
  listbox.append(optItem);
  env.doc.body.append(listbox);
  // Simulate un-observed late render by resetting before hover trailing scan
  env.timers.clear();
  env.advanceTime(200);
  const latePopup = env.makeEl('div', { attrs: { 'data-floating-ui-portal': '' } });
  const lateMenu = env.makeEl('div', { attrs: { role: 'menu' }, text: 'Copy' });
  latePopup.append(lateMenu);
  // Insert while observer temporarily off to prove scanFloatingContainers itself translates both without duplicate work
  origDisconnect();
  obs.connected = true;
  observingHack: {
    env.doc.body.childNodes.push(latePopup);
    latePopup.parentElement = env.doc.body;
    latePopup.parentNode = env.doc.body;
  }
  env.doc.dispatchEvent({ type: 'pointerenter', target: topBtn });
  env.advanceTime(120);
  assert.equal(lateMenu.textContent, '复制', 'Non-dialog floating portal / menu must still translate on hover');

  inst.destroy();
});

test('[Perf-4] macOS data-ag-cs-win-blur="1" 0fps hibernation & wake, streaming MO fast-path 0-rAF, and 5ms / <=80-node time-slicing', () => {
  let perfClock = 1000;
  const env = createTestEnv(1000);
  const dict = {
    exact: { Settings: '设置', Save: '保存', Cancel: '取消', Copy: '复制', Open: '打开' },
    patterns: [],
  };

  const convView = env.makeEl('div', { attrs: { 'data-testid': 'conversation-view' } });
  const prose = env.makeEl('div', { className: 'markdown-body' });
  const streamText = env.makeText('Streaming token 0');
  const streamP = env.makeEl('p');
  streamP.append(streamText);
  prose.append(streamP);
  convView.append(prose);
  env.doc.body.append(convView);

  const inst = runtime.mountHostI18n({
    root: env.win,
    doc: env.doc,
    dict,
    mode: 'auto',
    nowFn: env.nowFn,
    perfNowFn: () => perfClock,
    setTimeoutFn: env.setTimeoutFn,
    clearTimeoutFn: env.clearTimeoutFn,
    rafFn: env.rafFn,
    cancelRafFn: env.cancelRafFn,
  });

  // Advance past 1200ms Layer 2b window
  env.advanceTime(1300);
  assert.equal(env.timers.size, 0);

  // 1. Streaming MO fast-path: 40 characterData + childList mutations inside conversation prose must queue 0 rAFs!
  for (let i = 1; i <= 40; i++) {
    streamText.nodeValue = `Streaming token ${i} Settings Save`;
    prose.append(env.makeEl('span', { text: 'Cancel' }));
  }
  env.flushObservers();
  assert.equal(env.timers.size, 0, 'Streaming mutations inside ignored/conversation prose must fast-skip with 0 rAF scheduled');

  // 2. macOS CalculateNativeWinOcclusion: data-ag-cs-win-blur="1" triggers true MO disconnect 0fps sleep
  env.doc.documentElement.setAttribute('data-ag-cs-win-blur', '1');
  const sleepBtn = env.makeEl('button', { text: 'Save' });
  env.doc.body.append(sleepBtn);
  env.flushObservers();
  assert.equal(env.observerInstances[0].connected, false, 'MO must disconnect when data-ag-cs-win-blur="1" is detected');
  assert.equal(env.timers.size, 0, '0 rAF/timers while hibernating on data-ag-cs-win-blur="1"');
  assert.equal(sleepBtn.textContent, 'Save');

  // Clearing data-ag-cs-win-blur and firing focus immediately wakes, reconnects MO, and catches up missed DOM
  env.doc.documentElement.removeAttribute('data-ag-cs-win-blur');
  env.win.dispatchEvent({ type: 'focus' });
  assert.equal(env.observerInstances[0].connected, true, 'MO must reconnect immediately when win-blur clears on focus');
  assert.equal(sleepBtn.textContent, '保存', 'Missed button during win-blur hibernation must translate on wake');

  // 3. Frame node cap (<= 80 nodes/frame): inserting 180 buttons processes at most 80 in frame 1, finishing across frames
  const bulkBtns = [];
  for (let i = 0; i < 180; i++) {
    const b = env.makeEl('button', { text: 'Copy' });
    bulkBtns.push(b);
    env.doc.body.append(b);
  }
  env.flushObservers();
  assert.ok(env.timers.size >= 1, 'Pending rAF scheduled for bulk mutation');
  env.flushRafOnly();
  const translatedAfterFrame1 = bulkBtns.filter((b) => b.textContent === '复制').length;
  assert.ok(
    translatedAfterFrame1 > 0 && translatedAfterFrame1 <= 80,
    `Single frame must cap at <= 80 nodes, got ${translatedAfterFrame1}`
  );
  env.advanceTime(100);
  assert.equal(bulkBtns.filter((b) => b.textContent === '复制').length, 180, 'All 180 buttons finish across subsequent rAF frames');

  // 4. Time-slice budget (< 5ms/frame): simulate 1.5ms per 4 nodes so 5ms budget slices a 40-button batch across multiple frames
  const origGetAttr = env.makeEl('div').getAttribute;
  const slowBtns = [];
  for (let i = 0; i < 40; i++) {
    const b = env.makeEl('button', { text: 'Open' });
    const rawGet = b.getAttribute.bind(b);
    b.getAttribute = (k) => {
      if (k === 'data-testid') perfClock += 0.45;
      return rawGet(k);
    };
    slowBtns.push(b);
    env.doc.body.append(b);
  }
  env.flushObservers();
  env.flushRafOnly();
  const slowDoneFrame1 = slowBtns.filter((b) => b.textContent === '打开').length;
  assert.ok(
    slowDoneFrame1 >= 1 && slowDoneFrame1 < 40,
    `5ms frame budget must yield mid-batch before 40 slow nodes finish, processed ${slowDoneFrame1}`
  );
  env.advanceTime(200);
  assert.equal(slowBtns.filter((b) => b.textContent === '打开').length, 40, 'Remaining time-sliced nodes complete cleanly in next frames');
  void origGetAttr;

  inst.destroy();

  // 5. Lightweight initial scan on huge DOM (> 160 nodes) translates core top bar immediately and slices remainder into rAF
  const bigEnv = createTestEnv(2000);
  const bigBtns = [];
  for (let i = 0; i < 230; i++) {
    const b = bigEnv.makeEl('button', { text: 'Settings' });
    bigBtns.push(b);
    bigEnv.doc.body.append(b);
  }
  const bigInst = runtime.mountHostI18n({
    root: bigEnv.win,
    doc: bigEnv.doc,
    dict,
    mode: 'on',
    nowFn: bigEnv.nowFn,
    setTimeoutFn: bigEnv.setTimeoutFn,
    clearTimeoutFn: bigEnv.clearTimeoutFn,
    rafFn: bigEnv.rafFn,
    cancelRafFn: bigEnv.cancelRafFn,
  });
  assert.equal(bigBtns[0].textContent, '设置', 'First-screen header/nav controls translate synchronously on mount');
  const syncCount = bigBtns.filter((b) => b.textContent === '设置').length;
  assert.ok(syncCount >= 100 && syncCount < 230, `Initial sync scan should stay within budget (~160), got ${syncCount}`);
  bigEnv.advanceTime(100);
  assert.equal(bigBtns.filter((b) => b.textContent === '设置').length, 230, 'Deferred initial scan nodes complete via rAF');
  bigInst.destroy();
});

test('[Coexist-13] Layer 1 detects all Top 13 external localization fingerprints with detectedProvider, exempts external widgets, and resists Map.prototype hijacking', async () => {
  const dict = { exact: { Settings: '设置', Save: '保存', Cancel: '取消' }, patterns: [] };

  const signatureCases = [
    // 1. antigravity-cn-community (1422★)
    {
      label: 'antigravity-cn-community global',
      expectedProvider: 'antigravity-cn-community',
      setup: (env) => { env.win.__agySidebarDragFixInstalled = true; },
    },
    // 2 & 3. yuexps/Antigravity-Hans (432★) & kdczyz (134★)
    {
      label: 'yuexps/Antigravity-Hans __antigravityZhPatchInstalled',
      expectedProvider: 'yuexps/Antigravity-Hans',
      setup: (env) => { env.win.__antigravityZhPatchInstalled = true; },
    },
    {
      label: 'yuexps/Antigravity-Hans __antigravityZhSetLang',
      expectedProvider: 'yuexps/Antigravity-Hans',
      setup: (env) => { env.win.__antigravityZhSetLang = () => {}; },
    },
    {
      label: 'yuexps/Antigravity-Hans __antigravityZhPatchObserver',
      expectedProvider: 'yuexps/Antigravity-Hans',
      setup: (env) => { env.win.__antigravityZhPatchObserver = {}; },
    },
    {
      label: 'yuexps/Antigravity-Hans [data-agy-hans-ui]',
      expectedProvider: 'yuexps/Antigravity-Hans',
      setup: (env) => { env.doc.body.append(env.makeEl('div', { attrs: { 'data-agy-hans-ui': '1' } })); },
    },
    {
      label: 'yuexps/Antigravity-Hans localStorage antigravityHansLang',
      expectedProvider: 'yuexps/Antigravity-Hans',
      setup: (env) => {
        env.win.localStorage = { getItem: (k) => (k === 'antigravityHansLang' ? 'zh-CN' : null) };
      },
    },
    // 4. yiheng8023 (238★, v3.3.59+)
    {
      label: 'yiheng8023 __AGY_I18N_DATA__',
      expectedProvider: 'yiheng8023',
      setup: (env) => { env.win.__AGY_I18N_DATA__ = {}; },
    },
    {
      label: 'yiheng8023 __AGY_CREATE_ENGINE__',
      expectedProvider: 'yiheng8023',
      setup: (env) => { env.win.__AGY_CREATE_ENGINE__ = () => {}; },
    },
    {
      label: 'yiheng8023 __AGY_SWARM_I18N__',
      expectedProvider: 'yiheng8023',
      setup: (env) => { env.win.__AGY_SWARM_I18N__ = true; },
    },
    // 5. 3169657175 (91★)
    {
      label: '3169657175 __agyI18n',
      expectedProvider: '3169657175',
      setup: (env) => { env.win.__agyI18n = {}; },
    },
    {
      label: '3169657175 __agyTranslateEnhancementText',
      expectedProvider: '3169657175',
      setup: (env) => { env.win.__agyTranslateEnhancementText = () => {}; },
    },
    {
      label: '3169657175 #agy-theme-switcher',
      expectedProvider: '3169657175',
      setup: (env) => { env.doc.body.append(env.makeEl('div', { id: 'agy-theme-switcher' })); },
    },
    {
      label: '3169657175 #antigravity-quota-widget',
      expectedProvider: '3169657175',
      setup: (env) => { env.doc.body.append(env.makeEl('div', { id: 'antigravity-quota-widget' })); },
    },
    {
      label: '3169657175 html.agy-theme-active-v2',
      expectedProvider: '3169657175',
      setup: (env) => { env.doc.documentElement.classList.add('agy-theme-active-v2'); },
    },
    // 6. renkeshui (90★)
    {
      label: 'renkeshui __antigravity_i18n_runner_active',
      expectedProvider: 'renkeshui',
      setup: (env) => { env.win.__antigravity_i18n_runner_active = true; },
    },
    {
      label: 'renkeshui __ANTIGRAVITY_I18N_DATA__',
      expectedProvider: 'renkeshui',
      setup: (env) => { env.win.__ANTIGRAVITY_I18N_DATA__ = {}; },
    },
    {
      label: 'renkeshui __ANTIGRAVITY_REVERSE_MAP__',
      expectedProvider: 'renkeshui',
      setup: (env) => { env.win.__ANTIGRAVITY_REVERSE_MAP__ = {}; },
    },
    // 7. cshitian (84★)
    {
      label: 'cshitian script[src*="ag_agent_hanhua.js"]',
      expectedProvider: 'cshitian',
      setup: (env) => {
        env.doc.head.append(
          env.makeEl('script', { attrs: { src: 'vscode-file://vscode-app/out/ag_agent_hanhua.js?v=1' } })
        );
      },
    },
    // 8. nianshou555qiansui (33★)
    {
      label: 'nianshou555qiansui __ag_hanhua_engine__',
      expectedProvider: 'nianshou555qiansui',
      setup: (env) => { env.win.__ag_hanhua_engine__ = {}; },
    },
    // 9. Ace2025001 (32★)
    {
      label: 'Ace2025001 __AGY_ZHCN__',
      expectedProvider: 'Ace2025001',
      setup: (env) => { env.win.__AGY_ZHCN__ = true; },
    },
    {
      label: 'Ace2025001 __AGY_ZHCN_LOOKUP__',
      expectedProvider: 'Ace2025001',
      setup: (env) => { env.win.__AGY_ZHCN_LOOKUP__ = {}; },
    },
    {
      label: 'Ace2025001 [data-model-selector-badge="true"]',
      expectedProvider: 'Ace2025001',
      setup: (env) => {
        env.doc.body.append(env.makeEl('span', { attrs: { 'data-model-selector-badge': 'true' } }));
      },
    },
    // 10. LucasvonLiu (23★)
    {
      label: 'LucasvonLiu localStorage antigravity_chinese_patch_dict',
      expectedProvider: 'LucasvonLiu',
      setup: (env) => {
        env.win.localStorage = {
          getItem: (k) => (k === 'antigravity_chinese_patch_dict' ? '{"Settings":"设置"}' : null),
        };
      },
    },
    // 11. Zero-Touch (20★)
    {
      label: 'Zero-Touch __antigravityZh',
      expectedProvider: 'Zero-Touch',
      setup: (env) => { env.win.__antigravityZh = true; },
    },
    {
      label: 'Zero-Touch __antigravityZhDict',
      expectedProvider: 'Zero-Touch',
      setup: (env) => { env.win.__antigravityZhDict = {}; },
    },
    // 12. yunjuanyunshu (20★)
    {
      label: 'yunjuanyunshu __AG_ZH__',
      expectedProvider: 'yunjuanyunshu',
      setup: (env) => { env.win.__AG_ZH__ = true; },
    },
    // 13. good9527 / zero-marker IIFE via Layer 2a generic DOM sniffing
    {
      label: 'good9527 zero-marker Layer 2a Chrome zh sampling',
      expectedProvider: 'generic-zh-dom',
      setup: (env) => {
        const nav = env.makeEl('nav');
        nav.append(env.makeEl('button', { text: '设置' }), env.makeEl('button', { text: '新建对话' }));
        env.doc.body.append(nav);
      },
    },
  ];

  for (const sc of signatureCases) {
    const env = createTestEnv();
    const hostBtn = env.makeEl('button', { text: 'Settings' });
    env.doc.body.append(hostBtn);
    sc.setup(env);

    const inst = runtime.mountHostI18n({
      root: env.win,
      doc: env.doc,
      dict,
      mode: 'auto',
      nowFn: env.nowFn,
      setTimeoutFn: env.setTimeoutFn,
      clearTimeoutFn: env.clearTimeoutFn,
      rafFn: env.rafFn,
      cancelRafFn: env.cancelRafFn,
    });
    const st = inst.getStatus();
    assert.equal(st.status, 'yielded', `Case [${sc.label}] must yield`);
    assert.equal(st.yielded, true, `Case [${sc.label}] yielded flag must be true`);
    assert.equal(st.reason, 'external-ui-zh', `Case [${sc.label}] must preserve reason='external-ui-zh'`);
    assert.equal(st.detectedProvider, sc.expectedProvider, `Case [${sc.label}] provider mismatch`);
    assert.equal(env.observerInstances.length, 0, `Case [${sc.label}] must mount 0 observers`);
    assert.equal(hostBtn.textContent, 'Settings');
    inst.destroy();
    assert.equal(inst.getStatus().detectedProvider, null);
  }

  // Disabled antigravityHansLang='en' or throwing localStorage must NOT false-yield
  const safeLsEnv = createTestEnv();
  safeLsEnv.win.localStorage = {
    getItem: (k) => {
      if (k === 'antigravityHansLang') return 'en';
      throw new Error('SecurityError');
    },
  };
  const okBtn = safeLsEnv.makeEl('button', { text: 'Settings' });
  safeLsEnv.doc.body.append(okBtn);
  const safeInst = runtime.mountHostI18n({ root: safeLsEnv.win, doc: safeLsEnv.doc, dict, mode: 'auto' });
  assert.equal(safeInst.getStatus().status, 'active');
  assert.equal(safeInst.getStatus().detectedProvider, null);
  assert.equal(okBtn.textContent, '设置');
  safeInst.destroy();

  // External localization widgets exemption in forced mode='on'
  const exEnv = createTestEnv();
  const hansUi = exEnv.makeEl('div', { attrs: { 'data-agy-hans-ui': 'true' } });
  hansUi.append(exEnv.makeEl('button', { text: 'Settings' }));
  const themeSw = exEnv.makeEl('div', { id: 'agy-theme-switcher', text: 'Save' });
  const themeMenu = exEnv.makeEl('div', { id: 'agy-theme-menu', text: 'Cancel' });
  const quotaW = exEnv.makeEl('div', { id: 'antigravity-quota-widget', text: 'Settings' });
  const auditW = exEnv.makeEl('div', { id: 'antigravity-translation-audit', text: 'Save' });
  const realHostBtn = exEnv.makeEl('button', { text: 'Settings' });
  exEnv.doc.body.append(hansUi, themeSw, themeMenu, quotaW, auditW, realHostBtn);

  const exInst = runtime.mountHostI18n({ root: exEnv.win, doc: exEnv.doc, dict, mode: 'on' });
  assert.equal(hansUi.textContent, 'Settings', '[data-agy-hans-ui] must be exempted');
  assert.equal(themeSw.textContent, 'Save', '#agy-theme-switcher must be exempted');
  assert.equal(themeMenu.textContent, 'Cancel', '#agy-theme-menu must be exempted');
  assert.equal(quotaW.textContent, 'Settings', '#antigravity-quota-widget must be exempted');
  assert.equal(auditW.textContent, 'Save', '#antigravity-translation-audit must be exempted');
  assert.equal(realHostBtn.textContent, '设置', 'Normal host button still translates');
  exInst.destroy();

  // Defense against renkeshui monkey-patching Map.prototype.has / Map.prototype.get
  const rtSrc = fs.readFileSync(path.join(ROOT, 'vendor', 'host-i18n', 'host-i18n-runtime.js'), 'utf8');
  assert.equal(/new\s+Map\s*\(/.test(rtSrc), false, 'host-i18n-runtime.js must not use new Map() for string/lookup caches');

  const origMapHas = Map.prototype.has;
  const origMapGet = Map.prototype.get;
  const hijackedDictKeys = new Set([
    'Settings',
    'Save',
    'Cancel',
    'Unmatched English Label',
    'Unmatched English sentence.',
  ]);
  try {
    Map.prototype.has = function (k) {
      if (typeof k === 'string' && hijackedDictKeys.has(k)) return true;
      return origMapHas.call(this, k);
    };
    Map.prototype.get = function (k) {
      if (typeof k === 'string' && hijackedDictKeys.has(k)) return 'POISONED_BY_EXTERNAL_MAP_HOOK';
      return origMapGet.call(this, k);
    };

    const mpEnv = createTestEnv();
    const mpBtn = mpEnv.makeEl('button', {
      text: 'Save',
      attrs: { title: 'Settings', 'aria-label': 'Unmatched English Label' },
    });
    const mpUnmatched = mpEnv.makeEl('span', { text: 'Unmatched English sentence.' });
    mpEnv.doc.body.append(mpBtn, mpUnmatched);

    const mpInst = runtime.mountHostI18n({ root: mpEnv.win, doc: mpEnv.doc, dict, mode: 'on' });
    assert.equal(mpBtn.textContent, '保存');
    assert.equal(mpBtn.getAttribute('title'), '设置');
    assert.equal(mpBtn.getAttribute('aria-label'), 'Unmatched English Label');
    assert.equal(mpUnmatched.textContent, 'Unmatched English sentence.');

    // Second scan hits unitCache & attrSnapshots without touching Map.prototype
    mpInst.scan();
    assert.equal(mpBtn.textContent, '保存');
    assert.equal(mpBtn.getAttribute('title'), '设置');
    assert.equal(mpUnmatched.textContent, 'Unmatched English sentence.');

    mpInst.destroy();
    assert.equal(mpBtn.textContent, 'Save');
    assert.equal(mpBtn.getAttribute('title'), 'Settings');
  } finally {
    Map.prototype.has = origMapHas;
    Map.prototype.get = origMapGet;
  }

  // Verify input dict/exact strong references are severed after engine creation (~0.6 MiB/window saved)
  // and no local machine workspace paths exist in host-i18n runtime or test files
  const { inputExactRef, detachedEngine } = (() => {
    const transientInput = { exact: { Settings: '设置' }, patterns: [{ regex: '^(\\d+)m$', replacement: '$1分钟' }] };
    const ref = new WeakRef(transientInput.exact);
    const eng = runtime.createHostI18nEngine(transientInput);
    assert.equal(Object.getPrototypeOf(eng.exactDict), null);
    assert.notEqual(eng.exactDict, transientInput.exact);
    transientInput.exact.Settings = 'MUTATED_EXTERNALLY';
    assert.equal(eng.translate('Settings'), '设置');
    return { inputExactRef: ref, detachedEngine: eng };
  })();
  if (typeof globalThis.gc === 'function') {
    await new Promise((r) => setTimeout(r, 0));
    globalThis.gc();
    assert.equal(inputExactRef.deref(), undefined, 'External dict.exact must be reclaimed by GC');
    assert.equal(detachedEngine.translate('Settings'), '设置');
  }

  const localWorkspaceLeak = 'workspace_' + 'program';
  const testSelfSrc = fs.readFileSync(path.join(ROOT, 'test', 'host-i18n.test.mjs'), 'utf8');
  assert.equal(rtSrc.includes(localWorkspaceLeak), false, 'Runtime must not contain local workspace path');
  assert.equal(testSelfSrc.includes(localWorkspaceLeak), false, 'Test file must not contain local workspace path');
});

test('Issue #80: host-i18n exempts orchestrator-picker-row/effort and data-ag-cs-orch-l2/l3 / data-ces-orch-row on initial scan and frame-0 pointerenter', () => {
  const env = createTestEnv();
  const dict = { exact: { Settings: '设置', Save: '保存', Cancel: '取消' }, patterns: [] };

  const orchRow = env.makeEl('div', { attrs: { 'data-testid': 'orchestrator-picker-row', role: 'menuitem' } });
  const orchRowLabel = env.makeEl('span', { text: 'Settings' });
  orchRow.append(orchRowLabel);

  const orchEffort = env.makeEl('div', { attrs: { 'data-testid': 'orchestrator-picker-effort' } });
  const orchEffortLabel = env.makeEl('span', { text: 'Save' });
  orchEffort.append(orchEffortLabel);

  const l2Menu = env.makeEl('div', { attrs: { role: 'menu', 'data-ag-cs-orch-l2': '1' } });
  const l2Item = env.makeEl('span', { text: 'Cancel' });
  l2Menu.append(l2Item);

  const l3Menu = env.makeEl('div', { attrs: { role: 'menu', 'data-ag-cs-orch-l3': '1' } });
  const l3Item = env.makeEl('span', { text: 'Settings' });
  l3Menu.append(l3Item);

  const cesRow = env.makeEl('div', { attrs: { 'data-ces-orch-row': '1' } });
  const cesItem = env.makeEl('span', { text: 'Save' });
  cesRow.append(cesItem);

  const normalBtn = env.makeEl('button', { text: 'Settings' });
  env.doc.body.append(orchRow, orchEffort, l2Menu, l3Menu, cesRow, normalBtn);

  const inst = runtime.mountHostI18n({
    root: env.win,
    doc: env.doc,
    dict,
    mode: 'on',
    nowFn: env.nowFn,
    setTimeoutFn: env.setTimeoutFn,
    clearTimeoutFn: env.clearTimeoutFn,
    rafFn: env.rafFn,
    cancelRafFn: env.cancelRafFn,
  });

  // Control button translates normally while all 5 Orchestrator submenu targets remain completely untouched
  assert.equal(normalBtn.textContent, '设置');
  assert.equal(orchRowLabel.textContent, 'Settings');
  assert.equal(orchEffortLabel.textContent, 'Save');
  assert.equal(l2Item.textContent, 'Cancel');
  assert.equal(l3Item.textContent, 'Settings');
  assert.equal(cesItem.textContent, 'Save');

  // Simulate frame-0 pointerenter directly on each Orchestrator submenu node
  for (const tgt of [orchRowLabel, orchEffortLabel, l2Item, l3Item, cesItem]) {
    env.doc.dispatchEvent?.({ type: 'pointerenter', target: tgt });
  }
  env.flushRafs?.();
  assert.equal(orchRowLabel.textContent, 'Settings');
  assert.equal(orchEffortLabel.textContent, 'Save');
  assert.equal(l2Item.textContent, 'Cancel');
  assert.equal(l3Item.textContent, 'Settings');
  assert.equal(cesItem.textContent, 'Save');

  inst.destroy();
});

import assert from 'node:assert/strict';
import fs from 'node:fs';

/**
 * Shared zero-dependency MiniDOM fixture for settings-panel & UI unit tests.
 * Avoids duplicating ~180 lines of fake DOM boilerplate across test files.
 */
export function createSettingsMiniDom({ heading = 'Appearance' } = {}) {
  const matches = (n, selList) =>
    selList.split(',').some((raw) => {
      const s = raw.trim();
      if (!s) return false;
      if (s.startsWith('#')) return n.id === s.slice(1);
      let rest = s;
      const tm = rest.match(/^[a-zA-Z0-9-]+/);
      if (tm) {
        if (n.tagName !== tm[0].toUpperCase()) return false;
        rest = rest.slice(tm[0].length);
      }
      for (const m of rest.matchAll(/\.([a-zA-Z0-9_-]+)/g)) {
        if (!n.classList.contains(m[1])) return false;
      }
      for (const m of rest.matchAll(/\[([^\]=]+)(?:="([^"]*)")?\]/g)) {
        if (!n.hasAttribute(m[1])) return false;
        if (m[2] !== undefined && n.getAttribute(m[1]) !== m[2]) return false;
      }
      return true;
    });

  const makeEl = (tag, doc) => {
    const attrs = new Map();
    const listeners = new Map();
    const el = {
      tagName: String(tag).toUpperCase(),
      nodeType: 1,
      id: '',
      innerHTML: '',
      ownerDocument: doc,
      parentElement: null,
      parentNode: null,
      children: [],
      hidden: false,
      disabled: false,
      open: false,
      value: '',
      className: '',
      _text: '',
      style: { setProperty() {}, removeProperty() {} },
      classList: {
        add(c) {
          if (!el.className.split(/\s+/).includes(c)) el.className = `${el.className} ${c}`.trim();
        },
        remove(c) {
          el.className = el.className
            .split(/\s+/)
            .filter((x) => x !== c)
            .join(' ');
        },
        contains(c) {
          return el.className.split(/\s+/).includes(c);
        },
      },
      get isConnected() {
        let p = el;
        while (p) {
          if (p === doc.documentElement) return true;
          p = p.parentElement;
        }
        return false;
      },
      get textContent() {
        return el.children.length ? el._text + el.children.map((c) => c.textContent).join('') : el._text;
      },
      set textContent(v) {
        el._text = String(v ?? '');
        el.children.length = 0;
      },
      get firstChild() {
        return el.children[0] || null;
      },
      setAttribute(k, v) {
        attrs.set(k, String(v));
        if (k === 'id') el.id = String(v);
        if (k === 'hidden') el.hidden = true;
      },
      getAttribute(k) {
        return attrs.has(k) ? attrs.get(k) : null;
      },
      hasAttribute(k) {
        return attrs.has(k);
      },
      removeAttribute(k) {
        attrs.delete(k);
        if (k === 'hidden') el.hidden = false;
      },
      toggleAttribute(k, f) {
        const on = f === undefined ? !attrs.has(k) : Boolean(f);
        if (on) attrs.set(k, '');
        else attrs.delete(k);
        return on;
      },
      appendChild(c) {
        c.parentElement = el;
        c.parentNode = el;
        el.children.push(c);
        if (el.tagName === 'SELECT' && c.tagName === 'OPTION' && !el.value) el.value = c.value;
        return c;
      },
      removeChild(c) {
        el.children = el.children.filter((x) => x !== c);
        c.parentElement = null;
        c.parentNode = null;
        return c;
      },
      remove() {
        if (el.parentElement) el.parentElement.removeChild(el);
      },
      closest(sel) {
        let cur = el;
        while (cur) {
          if (matches(cur, sel)) return cur;
          cur = cur.parentElement;
        }
        return null;
      },
      addEventListener(ev, fn) {
        if (!listeners.has(ev)) listeners.set(ev, []);
        listeners.get(ev).push(fn);
      },
      removeEventListener() {},
      dispatchEvent(ev) {
        for (const fn of listeners.get(ev.type) || []) fn(ev);
      },
      click() {
        if (el.disabled) return;
        for (const fn of listeners.get('click') || []) fn({ preventDefault() {}, stopPropagation() {} });
      },
      querySelector(sel) {
        return el.querySelectorAll(sel)[0] || null;
      },
      querySelectorAll(sel) {
        const out = [];
        const walk = (n) => {
          for (const c of n.children || []) {
            if (matches(c, sel)) out.push(c);
            walk(c);
          }
        };
        walk(el);
        return out;
      },
    };
    return el;
  };

  const doc = {
    body: null,
    head: null,
    documentElement: null,
    createElement(tag) {
      return makeEl(tag, doc);
    },
    getElementById(id) {
      return doc.documentElement.querySelector('#' + id);
    },
    querySelectorAll(s) {
      return doc.documentElement.querySelectorAll(s);
    },
    querySelector(s) {
      return doc.documentElement.querySelector(s);
    },
  };
  doc.documentElement = makeEl('html', doc);
  doc.head = makeEl('head', doc);
  doc.body = makeEl('body', doc);
  doc.documentElement.appendChild(doc.head);
  doc.documentElement.appendChild(doc.body);

  const dialog = makeEl('div', doc);
  dialog.setAttribute('role', 'dialog');
  const panel = makeEl('div', doc);
  const h2 = makeEl('h2', doc);
  h2.textContent = heading;
  const anchor = makeEl('div', doc);
  anchor.className = 'space-y-2';
  panel.appendChild(h2);
  panel.appendChild(anchor);
  dialog.appendChild(panel);
  doc.body.appendChild(dialog);

  return { doc, dialog, panel, anchor, makeEl };
}

/**
 * Verifies UTF-8 no-BOM and LF-only line endings on a list of file paths.
 */
export function assertFileHygiene(filePaths) {
  for (const fp of filePaths) {
    const buf = fs.readFileSync(fp);
    assert.equal(buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf, false, `${fp} must have 0 UTF-8 BOM`);
    assert.equal(buf.includes(0x0d), false, `${fp} must have 0 CRLF`);
  }
}

/**
 * Verifies pure-ASCII CSS with 0 :has() selectors and balanced braces.
 */
export function assertCssHygiene(css, label = 'CSS') {
  assert.equal(/[^\x00-\x7F]/.test(css), false, `${label} must remain pure ASCII`);
  assert.equal(/:has\(/.test(css), false, `${label} must have 0 :has() selectors`);
  let depth = 0;
  for (const ch of css) {
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    assert.ok(depth >= 0, `${label} must never close an unopened brace`);
  }
  assert.equal(depth, 0, `${label} braces must be balanced`);
}

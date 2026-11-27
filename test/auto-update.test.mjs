import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import {
  UpdateService,
  LATEST_RELEASE_API,
  RELEASES_LIST_API,
  compareSemver,
  isTrustedReleaseAssetUrl,
  normalizeUpdateChannel,
  parseSha256Sums,
} from '../sidecars/daemon/update-service.mjs';
import { PrismDaemon } from '../sidecars/daemon/main.mjs';
import { collectNativePluginEntries } from '../scripts/build-common.mjs';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

const cdp = require(path.join(ROOT, 'cdp.js'));
const settingsPanel = require(path.join(ROOT, 'settings-panel.js'));
const i18nLocales = require(path.join(ROOT, 'i18n-locales.js'));
const i18nCore = require(path.join(ROOT, 'i18n-core.js'));

function makeTempDir(prefix = 'prism-upd-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function makeMockDom() {
  const makeEl = (tag) => {
    const attrs = new Map();
    const children = [];
    const listeners = new Map();
    const classSet = new Set();
    let _text = '';
    const el = {
      tagName: String(tag || 'div').toUpperCase(),
      style: {},
      children,
      parentElement: null,
      hidden: false,
      disabled: false,
      checked: false,
      files: [],
      value: '',
      get id() { return attrs.get('id') || ''; },
      set id(v) { attrs.set('id', String(v)); },
      get className() { return [...classSet].join(' '); },
      set className(v) {
        classSet.clear();
        for (const c of String(v || '').split(/\s+/).filter(Boolean)) classSet.add(c);
      },
      classList: {
        contains: (c) => classSet.has(c),
        add: (...cs) => cs.forEach((c) => classSet.add(c)),
        remove: (...cs) => cs.forEach((c) => classSet.delete(c)),
      },
      get isConnected() {
        let cur = el;
        while (cur) {
          if (cur === doc.documentElement) return true;
          cur = cur.parentElement;
        }
        return false;
      },
      get textContent() {
        if (children.length === 0) return _text;
        return _text + children.map((c) => c.textContent).join('');
      },
      set textContent(v) {
        _text = String(v ?? '');
        children.length = 0;
      },
      set innerHTML(_v) { children.length = 0; },
      setAttribute(k, v) {
        attrs.set(k, String(v));
        if (k === 'hidden') el.hidden = true;
      },
      getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
      hasAttribute: (k) => attrs.has(k),
      removeAttribute(k) {
        attrs.delete(k);
        if (k === 'hidden') el.hidden = false;
      },
      toggleAttribute(k, f) {
        if (f === true) attrs.set(k, '');
        else if (f === false) attrs.delete(k);
        else if (attrs.has(k)) attrs.delete(k);
        else attrs.set(k, '');
      },
      appendChild(c) {
        c.parentElement = el;
        children.push(c);
        return c;
      },
      remove() {
        if (el.parentElement) {
          const i = el.parentElement.children.indexOf(el);
          if (i >= 0) el.parentElement.children.splice(i, 1);
          el.parentElement = null;
        }
      },
      closest(sel) {
        let cur = el;
        while (cur) {
          if (matches(cur, sel)) return cur;
          cur = cur.parentElement;
        }
        return null;
      },
      querySelectorAll(sel) {
        const out = [];
        const walk = (n) => {
          for (const c of n.children) {
            if (matches(c, sel)) out.push(c);
            walk(c);
          }
        };
        walk(el);
        return out;
      },
      querySelector: (sel) => el.querySelectorAll(sel)[0] || null,
      addEventListener(t, fn) {
        if (!listeners.has(t)) listeners.set(t, []);
        listeners.get(t).push(fn);
      },
      click() {
        for (const fn of listeners.get('click') || []) fn({ stopPropagation() {}, preventDefault() {} });
      },
    };
    return el;
  };
  const matches = (el, selList) =>
    selList.split(',').some((raw) => {
      const s = raw.trim();
      if (!s) return false;
      if (s.startsWith('#')) return el.id === s.slice(1);
      let rest = s;
      const tm = rest.match(/^[a-zA-Z0-9-]+/);
      if (tm) {
        if (el.tagName !== tm[0].toUpperCase()) return false;
        rest = rest.slice(tm[0].length);
      }
      for (const m of rest.matchAll(/\.([a-zA-Z0-9_-]+)/g)) {
        if (!el.classList.contains(m[1])) return false;
      }
      for (const m of rest.matchAll(/\[([^\]=]+)(?:="([^"]*)")?\]/g)) {
        if (!el.hasAttribute(m[1])) return false;
        if (m[2] !== undefined && el.getAttribute(m[1]) !== m[2]) return false;
      }
      return true;
    });

  const doc = {
    documentElement: null,
    head: null,
    body: null,
    createElement: (t) => makeEl(t),
    getElementById: (id) => doc.documentElement.querySelector('#' + id),
    querySelectorAll: (s) => doc.documentElement.querySelectorAll(s),
    querySelector: (s) => doc.documentElement.querySelector(s),
  };
  doc.documentElement = makeEl('html');
  doc.head = makeEl('head');
  doc.body = makeEl('body');
  doc.documentElement.appendChild(doc.head);
  doc.documentElement.appendChild(doc.body);
  return doc;
}

test('compareSemver handles v-prefix, prereleases, build metadata, and invalid inputs', () => {
  assert.equal(compareSemver('v1.0.3', '1.0.4'), -1);
  assert.equal(compareSemver('1.0.4', 'v1.0.3'), 1);
  assert.equal(compareSemver('v1.0.3', '1.0.3'), 0);
  assert.equal(compareSemver('1.10.0', '1.2.9'), 1);
  assert.equal(compareSemver('1.0.4-alpha.1', '1.0.4'), -1);
  assert.equal(compareSemver('1.0.4', '1.0.4-rc.1'), 1);
  assert.equal(compareSemver('1.0.4-alpha.1', '1.0.4-alpha.2'), -1);
  assert.equal(compareSemver('1.0.4-1', '1.0.4-alpha'), -1);
  assert.equal(compareSemver('1.0.4+build.99', '1.0.4+build.1'), 0);
  assert.equal(compareSemver('invalid', '1.0.3'), 0);
  assert.equal(compareSemver('1.0', '1.0.3'), 0);
  assert.equal(compareSemver('', '1.0.3'), 0);
  assert.equal(compareSemver(null, '1.0.3'), 0);
});

test('isTrustedReleaseAssetUrl & multi-hop redirect guard reject untrusted protocols, hosts, private IPs, and >5 redirects', async () => {
  assert.equal(isTrustedReleaseAssetUrl('https://api.github.com/repos/hypsunk/GravityPrism/releases/latest'), true);
  assert.equal(isTrustedReleaseAssetUrl('https://github.com/hypsunk/GravityPrism/releases/download/v1.0.4/gravity-prism-installer.exe'), true);
  assert.equal(isTrustedReleaseAssetUrl('https://objects.githubusercontent.com/github-production-release-asset/123'), true);
  assert.equal(isTrustedReleaseAssetUrl('https://release-assets.githubusercontent.com/abc'), true);
  assert.equal(isTrustedReleaseAssetUrl('https://github-releases.githubusercontent.com/xyz'), true);

  assert.equal(isTrustedReleaseAssetUrl('http://github.com/hypsunk/GravityPrism'), false);
  assert.equal(isTrustedReleaseAssetUrl('https://evil.com/installer.exe'), false);
  assert.equal(isTrustedReleaseAssetUrl('https://sub.github.com/file'), false);
  assert.equal(isTrustedReleaseAssetUrl('https://127.0.0.1/file'), false);
  assert.equal(isTrustedReleaseAssetUrl('https://169.254.169.254/latest'), false);
  assert.equal(isTrustedReleaseAssetUrl('https://user:pass@github.com/file'), false);
  assert.equal(isTrustedReleaseAssetUrl('https://github.com:8443/file'), false);
  assert.equal(isTrustedReleaseAssetUrl('file:///C:/Windows/System32/calc.exe'), false);

  // Redirect to untrusted third-party domain must be blocked
  const svcEvilRedirect = new UpdateService({
    fetchFn: async () => ({
      status: 302,
      ok: false,
      headers: new Map([['location', 'https://evil-cdn.example.com/payload.exe']]),
      body: { cancel: async () => {} },
    }),
  });
  const badRes = await svcEvilRedirect.checkForUpdates({ force: true });
  assert.equal(badRes.ok, false);
  assert.equal(badRes.error, 'untrusted_redirect_url');

  // >5 trusted redirects must fail with too_many_redirects
  let hop = 0;
  const svcTooMany = new UpdateService({
    fetchFn: async () => {
      hop += 1;
      return {
        status: 302,
        ok: false,
        headers: new Map([['location', `https://objects.githubusercontent.com/hop-${hop}`]]),
        body: { cancel: async () => {} },
      };
    },
  });
  const loopRes = await svcTooMany.checkForUpdates({ force: true });
  assert.equal(loopRes.ok, false);
  assert.equal(loopRes.error, 'too_many_redirects');
  assert.equal(hop, 6);
});

test('parseSha256Sums & SHA-256 verification pass on valid payload and delete file on sha256_mismatch', async () => {
  const hashA = 'a'.repeat(64);
  const hashB = 'B'.repeat(64);
  const sums = parseSha256Sums([
    '# release checksums',
    `${hashA}  artifacts/windows-installer/gravity-prism-installer.exe`,
    `${hashB} *./Obsidian-Prism-macOS-universal.dmg`,
    'bad-line-ignored',
  ].join('\n'));
  assert.equal(sums.get('gravity-prism-installer.exe'), hashA);
  assert.equal(sums.get('Obsidian-Prism-macOS-universal.dmg'), 'b'.repeat(64));

  const tmpRoot = makeTempDir('prism-upd-sha-');
  try {
    const validPayload = Buffer.from('MZ-valid-installer-bytes');
    const validHash = crypto.createHash('sha256').update(validPayload).digest('hex');
    const spawnCalls = [];
    let unrefCalled = 0;

    // 1) Valid SHA256SUMS.txt fallback (when asset.digest omitted)
    const svcValid = new UpdateService({
      platform: 'win32',
      currentVersion: '1.0.3',
      tmpRoot,
      spawnFn: (cmd, args, opts) => {
        spawnCalls.push({ cmd, args, opts });
        return { unref: () => { unrefCalled += 1; } };
      },
      fetchFn: async (url) => {
        if (url.endsWith('/releases/latest')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              tag_name: 'v1.0.4',
              draft: false,
              prerelease: false,
              html_url: 'https://github.com/hypsunk/GravityPrism/releases/tag/v1.0.4',
              assets: [
                {
                  name: 'gravity-prism-installer.exe',
                  browser_download_url: 'https://github.com/hypsunk/GravityPrism/releases/download/v1.0.4/gravity-prism-installer.exe',
                },
                {
                  name: 'SHA256SUMS.txt',
                  browser_download_url: 'https://github.com/hypsunk/GravityPrism/releases/download/v1.0.4/SHA256SUMS.txt',
                },
              ],
            }),
          };
        }
        if (url.endsWith('/SHA256SUMS.txt')) {
          return {
            ok: true,
            status: 200,
            headers: new Map(),
            arrayBuffer: async () => Buffer.from(`${validHash}  gravity-prism-installer.exe\n`, 'utf8'),
          };
        }
        return {
          ok: true,
          status: 200,
          headers: new Map([['content-length', String(validPayload.length)]]),
          arrayBuffer: async () => validPayload,
        };
      },
    });

    const okApply = await svcValid.applyReleaseUpdate({ confirm: true, auto: false });
    assert.equal(okApply.ok, true);
    assert.equal(okApply.applied, true);
    assert.equal(okApply.scheduled, true);
    assert.equal(okApply.hotReloadExpected, true);
    assert.equal(okApply.needsHardReloadHint, true);
    assert.equal(okApply.mode, 'installer');
    assert.equal(okApply.targetVersion, '1.0.4');
    assert.equal(okApply.sha256Verified, true);
    assert.equal(spawnCalls.length, 1);
    assert.deepEqual(spawnCalls[0].args, ['--install', '--silent', '--no-relaunch-prompt']);
    assert.equal(spawnCalls[0].opts.detached, true);
    assert.equal(spawnCalls[0].opts.windowsHide, true);
    assert.equal(unrefCalled, 1);

    // 2) Tampered binary with asset.digest must fail with sha256_mismatch, delete temp dir/file, and record failed auto tag
    const tamperRoot = makeTempDir('prism-upd-tamper-');
    let tamperSpawned = 0;
    const svcTamper = new UpdateService({
      platform: 'win32',
      currentVersion: '1.0.3',
      tmpRoot: tamperRoot,
      spawnFn: () => {
        tamperSpawned += 1;
        return { unref: () => {} };
      },
      fetchFn: async (url) => {
        if (url.endsWith('/releases/latest')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              tag_name: 'v1.0.5',
              draft: false,
              prerelease: false,
              html_url: 'https://github.com/hypsunk/GravityPrism/releases/tag/v1.0.5',
              assets: [
                {
                  name: 'gravity-prism-installer.exe',
                  digest: `sha256:${'f'.repeat(64)}`,
                  browser_download_url: 'https://objects.githubusercontent.com/tampered.exe',
                },
              ],
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          headers: new Map(),
          arrayBuffer: async () => Buffer.from('corrupted-payload'),
        };
      },
    });
    const badApply = await svcTamper.applyReleaseUpdate({ confirm: true, auto: true });
    assert.equal(badApply.ok, false);
    assert.equal(badApply.applied, false);
    assert.equal(badApply.error, 'sha256_mismatch');
    assert.equal(tamperSpawned, 0);
    assert.deepEqual(fs.readdirSync(tamperRoot), [], 'Tampered installer temp directory must be deleted immediately');

    // Subsequent auto apply for the same failed tag must be skipped without re-downloading
    const retryAuto = await svcTamper.applyReleaseUpdate({ confirm: true, auto: true });
    assert.equal(retryAuto.ok, false);
    assert.equal(retryAuto.skippedFailedTag, true);
    fs.rmSync(tamperRoot, { recursive: true, force: true });

    // 3) Fail-closed when SHA-256 is unavailable (no digest and no SHA256SUMS.txt): must refuse BEFORE downloading .exe or spawning
    let exeDownloaded = false;
    let noShaSpawned = 0;
    const svcNoSha = new UpdateService({
      platform: 'win32',
      currentVersion: '1.0.3',
      tmpRoot,
      spawnFn: () => {
        noShaSpawned += 1;
        return { unref: () => {} };
      },
      fetchFn: async (url) => {
        if (url.endsWith('/releases/latest')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              tag_name: 'v1.0.6',
              draft: false,
              prerelease: false,
              html_url: 'https://github.com/hypsunk/GravityPrism/releases/tag/v1.0.6',
              assets: [
                {
                  name: 'gravity-prism-installer.exe',
                  browser_download_url: 'https://github.com/hypsunk/GravityPrism/releases/download/v1.0.6/gravity-prism-installer.exe',
                },
              ],
            }),
          };
        }
        exeDownloaded = true;
        return { ok: true, status: 200, headers: new Map(), arrayBuffer: async () => Buffer.from('MZ') };
      },
    });
    const noShaRes = await svcNoSha.applyReleaseUpdate({ confirm: true, auto: false });
    assert.equal(noShaRes.ok, false);
    assert.equal(noShaRes.applied, false);
    assert.equal(noShaRes.error, 'sha256_unavailable');
    assert.equal(exeDownloaded, false, 'Must NEVER download .exe when expectedSha256 is unavailable');
    assert.equal(noShaSpawned, 0, 'Must NEVER spawn .exe when expectedSha256 is unavailable');

    // 4) _selectReleaseAssets locks github.com URLs to /hypsunk/GravityPrism/releases/, refuses symlink tmpRoot, and cleans stale temp dirs
    const selWrongRepo = svcNoSha._selectReleaseAssets({
      html_url: 'https://github.com/evil/other/releases/tag/v1.0.6',
      assets: [
        { name: 'gravity-prism-installer.exe', browser_download_url: 'https://github.com/evil/other/releases/download/v1.0.6/gravity-prism-installer.exe' },
        { name: 'SHA256SUMS.txt', browser_download_url: 'https://github.com/evil/other/releases/download/v1.0.6/SHA256SUMS.txt' },
      ],
    });
    assert.equal(selWrongRepo.downloadUrl, null, 'Wrong github.com repo path must be rejected');
    assert.equal(selWrongRepo.shaAsset, null, 'Wrong github.com repo SHA256SUMS.txt must be rejected');
    assert.equal(selWrongRepo.releaseUrl, 'https://github.com/hypsunk/GravityPrism/releases');

    const svcSymTmp = new UpdateService({
      platform: 'win32',
      currentVersion: '1.0.3',
      tmpRoot,
      lstatSyncFn: (p) => (p === tmpRoot ? { isSymbolicLink: () => true, isDirectory: () => false } : fs.lstatSync(p)),
      fetchFn: async (url) => {
        if (url.endsWith('/releases/latest')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              tag_name: 'v1.0.7',
              draft: false,
              prerelease: false,
              assets: [{
                name: 'gravity-prism-installer.exe',
                digest: `sha256:${validHash}`,
                browser_download_url: 'https://github.com/hypsunk/GravityPrism/releases/download/v1.0.7/gravity-prism-installer.exe',
              }],
            }),
          };
        }
        return { ok: true, status: 200, headers: new Map(), arrayBuffer: async () => validPayload };
      },
    });
    const symTmpRes = await svcSymTmp.applyReleaseUpdate({ confirm: true, auto: false });
    assert.equal(symTmpRes.ok, false);
    assert.equal(symTmpRes.error, 'refused_symlink_tmproot');

    const cleanRoot = makeTempDir('prism-upd-clean-');
    try {
      const staleDir = path.join(cleanRoot, 'ag-prism-upd-stale');
      const freshDir = path.join(cleanRoot, 'ag-prism-upd-fresh');
      const otherDir = path.join(cleanRoot, 'unrelated-dir');
      fs.mkdirSync(staleDir);
      fs.mkdirSync(freshDir);
      fs.mkdirSync(otherDir);
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      fs.utimesSync(staleDir, twoHoursAgo, twoHoursAgo);
      const svcClean = new UpdateService({ tmpRoot: cleanRoot });
      const cleaned = await svcClean._cleanupStaleTempDirs();
      assert.equal(cleaned, 1);
      assert.equal(fs.existsSync(staleDir), false, 'Stale ag-prism-upd-* dir >1h must be cleaned');
      assert.equal(fs.existsSync(freshDir), true, 'Fresh ag-prism-upd-* dir must be kept');
      assert.equal(fs.existsSync(otherDir), true, 'Unrelated dir must be kept');
    } finally {
      fs.rmSync(cleanRoot, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('UpdateService enforces TTL cache, force refresh, single-flight lock, draft/prerelease skip, and macOS manual mode', async () => {
  let now = 1_000_000;
  let fetchCount = 0;
  let releasePayload = {
    tag_name: 'v1.0.4',
    draft: false,
    prerelease: false,
    html_url: 'https://github.com/hypsunk/GravityPrism/releases/tag/v1.0.4',
    assets: [
      {
        name: 'Obsidian-Prism-macOS-universal.dmg',
        browser_download_url: 'https://github.com/hypsunk/GravityPrism/releases/download/v1.0.4/Obsidian-Prism-macOS-universal.dmg',
      },
    ],
  };

  const svcMac = new UpdateService({
    platform: 'darwin',
    currentVersion: '1.0.3',
    checkTtlMs: 6 * 60 * 60 * 1000,
    manualCooldownMs: 10_000,
    nowFn: () => now,
    fetchFn: async () => {
      fetchCount += 1;
      await new Promise((r) => setTimeout(r, 15));
      return { ok: true, status: 200, json: async () => releasePayload };
    },
  });

  // Concurrent single-flight lock: two parallel checks hit fetch only once
  const [r1, r2] = await Promise.all([svcMac.checkForUpdates(), svcMac.checkForUpdates()]);
  assert.equal(fetchCount, 1);
  assert.equal(r1.hasUpdate, true);
  assert.equal(r2.hasUpdate, true);

  // Within 6h TTL -> cached hit
  now += 60_000;
  const rCached = await svcMac.checkForUpdates();
  assert.equal(fetchCount, 1);
  assert.equal(rCached.cached, true);

  // force: true bypasses 6h cache
  const rForced = await svcMac.checkForUpdates({ force: true });
  assert.equal(fetchCount, 2);
  assert.equal(rForced.hasUpdate, true);

  // macOS applyReleaseUpdate returns manualRequired: true without spawning or overwriting
  const macApply = await svcMac.applyReleaseUpdate({ confirm: true, auto: false });
  assert.equal(macApply.ok, true);
  assert.equal(macApply.applied, false);
  assert.equal(macApply.manualRequired, true);
  assert.equal(macApply.mode, 'manual');
  assert.ok(macApply.downloadUrl.endsWith('.dmg'));

  // Draft / prerelease must be skipped
  releasePayload = { tag_name: 'v2.0.0-rc.1', draft: false, prerelease: true, assets: [] };
  const rPre = await svcMac.checkForUpdates({ force: true });
  assert.equal(rPre.hasUpdate, false);
  assert.equal(rPre.skippedPrerelease, true);
});

test('PrismDaemon honors autoUpdate=off/on, exposes update-status/check-update/apply-update RPCs, detects hard reload files, and packaging includes update-service.mjs', async () => {
  const workDir = makeTempDir('prism-daemon-upd-');
  try {
    // 1. Verify packaging manifest includes sidecars/daemon/update-service.mjs
    const entries = collectNativePluginEntries(null);
    assert.ok(
      entries.some((e) => e.name === 'native-plugin/sidecars/daemon/update-service.mjs'),
      'Installer payload must include native-plugin/sidecars/daemon/update-service.mjs'
    );

    // 2. Standalone daemon with autoUpdate='off' (default) vs 'on'
    const pluginDir = path.join(workDir, 'plugin');
    fs.mkdirSync(pluginDir, { recursive: true });
    for (const f of ['cdp.js', 'style.css', 'ui-runtime.js']) {
      fs.copyFileSync(path.join(ROOT, f), path.join(pluginDir, f));
    }
    for (const f of cdp.SYNC_ROOT_FILES) {
      const src = path.join(ROOT, f);
      if (fs.existsSync(src)) {
        fs.mkdirSync(path.dirname(path.join(pluginDir, f)), { recursive: true });
        fs.copyFileSync(src, path.join(pluginDir, f));
      }
    }
    if (fs.existsSync(path.join(ROOT, 'assets'))) {
      fs.cpSync(path.join(ROOT, 'assets'), path.join(pluginDir, 'assets'), { recursive: true });
    }
    if (fs.existsSync(path.join(ROOT, 'vendor'))) {
      fs.cpSync(path.join(ROOT, 'vendor'), path.join(pluginDir, 'vendor'), { recursive: true });
    }

    let applyCalls = 0;
    const fakeUpdateSvc = {
      currentVersion: '1.0.3',
      applying: false,
      _checked: false,
      getStatus() {
        return {
          ok: true,
          currentVersion: '1.0.3',
          latestVersion: this._checked ? '1.0.4' : '1.0.3',
          latestTag: this._checked ? 'v1.0.4' : null,
          hasUpdate: this._checked,
          mode: 'installer',
          hotReloadCapable: true,
          manualRequired: false,
          releaseUrl: 'https://github.com/hypsunk/GravityPrism/releases',
          downloadUrl: null,
          checkedAt: this._checked ? 123456 : null,
          lastError: null,
        };
      },
      async checkForUpdates() {
        this._checked = true;
        return this.getStatus();
      },
      async applyReleaseUpdate({ confirm, auto }) {
        applyCalls += 1;
        return { ok: true, applied: true, scheduled: true, hotReloadExpected: true, needsHardReloadHint: true, mode: 'installer', targetVersion: '1.0.4', confirm, auto };
      },
    };

    const daemon = new PrismDaemon({
      rootDir: pluginDir,
      silent: true,
      enableAutoUpdateTimer: false,
      _testUpdateService: fakeUpdateSvc,
    });

    assert.equal(daemon.cdp.DEFAULT_CONFIG.autoUpdate, 'off');
    const st0 = await daemon.executeRepoAction({ action: 'update-status' });
    assert.equal(st0.ok, true);
    assert.equal(st0.autoUpdate, 'off');

    // Background check with autoUpdate='off' MUST NOT trigger applyReleaseUpdate
    const bgOff = await daemon.runUpdateCheck({ force: true, allowAutoApply: true });
    assert.equal(bgOff.hasUpdate, true);
    assert.equal(applyCalls, 0, 'Must never auto-apply update when autoUpdate is off');

    // Switch autoUpdate='on' -> background check MUST auto-apply
    daemon.updateConfigSetting('autoUpdate', 'on');
    const bgOn = await daemon.runUpdateCheck({ force: true, allowAutoApply: true });
    assert.equal(bgOn.autoUpdate, 'on');
    assert.equal(applyCalls, 1, 'Must auto-apply update when autoUpdate is on');

    // Manual apply-update RPC requires confirm: true
    const deniedApply = await daemon.executeRepoAction({ action: 'apply-update' });
    assert.equal(deniedApply.ok, false);
    assert.equal(deniedApply.error, 'confirmation_required');
    assert.equal(applyCalls, 1);

    const manualApply = await daemon.executeRepoAction({ action: 'apply-update', confirm: true });
    assert.equal(manualApply.ok, true);
    assert.equal(manualApply.applied, true);
    assert.equal(applyCalls, 2);

    // 3. Git repo apply-update sets needsHardReload=true when cdp.js changes
    const remoteGit = path.join(workDir, 'remote.git');
    const localGit = path.join(workDir, 'local-git');
    const pusherGit = path.join(workDir, 'pusher-git');
    execFileSync('git', ['init', '--bare', remoteGit], { stdio: 'ignore' });
    execFileSync('git', ['clone', remoteGit, localGit], { stdio: 'ignore' });
    execFileSync('git', ['-C', localGit, 'config', 'user.email', 'test@obsidian-prism.local'], { stdio: 'ignore' });
    execFileSync('git', ['-C', localGit, 'config', 'user.name', 'Test'], { stdio: 'ignore' });
    fs.writeFileSync(
      path.join(localGit, 'cdp.js'),
      "module.exports={PLUGIN_VERSION:'1.0.3',DEFAULT_CONFIG:{autoUpdate:'off'},SYNC_ROOT_FILES:['cdp.js'],readConfig:()=>({autoUpdate:'off'}),validateConfigEntry:()=>true,buildInjectExpression:()=>'(()=>{})()'};\n",
      'utf8'
    );
    execFileSync('git', ['-C', localGit, 'add', 'cdp.js'], { stdio: 'ignore' });
    execFileSync('git', ['-C', localGit, 'commit', '-m', 'init'], { stdio: 'ignore' });
    const branch = execFileSync('git', ['-C', localGit, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim();
    execFileSync('git', ['-C', localGit, 'push', '-u', 'origin', branch], { stdio: 'ignore' });

    execFileSync('git', ['clone', remoteGit, pusherGit], { stdio: 'ignore' });
    execFileSync('git', ['-C', pusherGit, 'config', 'user.email', 'test@obsidian-prism.local'], { stdio: 'ignore' });
    execFileSync('git', ['-C', pusherGit, 'config', 'user.name', 'Test'], { stdio: 'ignore' });
    fs.writeFileSync(
      path.join(pusherGit, 'cdp.js'),
      "module.exports={PLUGIN_VERSION:'1.0.4',DEFAULT_CONFIG:{autoUpdate:'off'},SYNC_ROOT_FILES:['cdp.js'],readConfig:()=>({autoUpdate:'off'}),validateConfigEntry:()=>true,buildInjectExpression:()=>'(()=>{/*v2*/})()'};\n",
      'utf8'
    );
    execFileSync('git', ['-C', pusherGit, 'add', 'cdp.js'], { stdio: 'ignore' });
    execFileSync('git', ['-C', pusherGit, 'commit', '-m', 'core change'], { stdio: 'ignore' });
    execFileSync('git', ['-C', pusherGit, 'push', 'origin', branch], { stdio: 'ignore' });

    const gitDaemon = new PrismDaemon({
      rootDir: pluginDir,
      gitRepoDir: localGit,
      silent: true,
      enableAutoUpdateTimer: false,
      _testUpdateService: {
        currentVersion: '1.0.3',
        applying: false,
        getStatus: () => ({ ok: true, currentVersion: '1.0.3', latestVersion: '1.0.3', hasUpdate: false, checkedAt: null }),
        checkForUpdates: async () => ({ ok: true, currentVersion: '1.0.3', latestVersion: '1.0.3', hasUpdate: false, checkedAt: Date.now() }),
      },
    });
    const gitChk = await gitDaemon.executeRepoAction({ action: 'check-update' });
    assert.equal(gitChk.ok, true);
    assert.equal(gitChk.mode, 'git');
    assert.equal(gitChk.hasUpdate, true);
    assert.equal(gitChk.behind, 1);

    const gitApplyDenied = await gitDaemon.executeRepoAction({ action: 'apply-update' });
    assert.equal(gitApplyDenied.ok, false);
    assert.equal(gitApplyDenied.error, 'confirmation_required');

    const gitApply = await gitDaemon.executeRepoAction({ action: 'apply-update', confirm: true });
    assert.equal(gitApply.ok, true);
    assert.equal(gitApply.updated, true);
    assert.equal(gitApply.needsHardReload, true, 'Changing cdp.js in git diff must set needsHardReload=true');

    // Verify REPO_BINDING forwards top-level force and manual flags
    const receivedRepoActions = [];
    const origExec = daemon.executeRepoAction.bind(daemon);
    daemon.executeRepoAction = async (inp) => {
      receivedRepoActions.push(inp);
      return { ok: true };
    };
    const fakeSession = { send: async () => {} };
    const fakeEntry = {
      session: fakeSession,
      mainFrameId: 'f1',
      contextFrames: new Map([[1, { isDefault: true, type: 'default', frameId: 'f1' }]]),
    };
    await daemon.handleBindingCall(fakeEntry, {
      name: '__agPrismRepoCall',
      payload: JSON.stringify({ id: 7, action: 'check-update', force: true, manual: true }),
      executionContextId: 1,
    });
    assert.equal(receivedRepoActions.length, 1);
    assert.equal(receivedRepoActions[0].force, true);
    assert.equal(receivedRepoActions[0].manual, true);
    daemon.executeRepoAction = origExec;
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});

test('settings-panel & 5-language i18n render autoUpdate(off default), update controls, hard-reload hint, and keep bundle < 690 KiB / <= 704,000 B', async () => {
  const requiredKeys = [
    'setAutoUpdateTitle',
    'setAutoUpdateDesc',
    'updCheckBtn',
    'updApplyBtn',
    'updUpToDate',
    'updAvailTpl',
    'updUpdating',
    'updHotDone',
    'updManualHint',
    'updHotNote',
  ];
  for (const lang of ['zh-CN', 'zh-TW', 'yue', 'en', 'ja']) {
    const ui = i18nLocales.getUiStrings(lang);
    for (const k of requiredKeys) {
      assert.ok(typeof ui[k] === 'string' && ui[k].trim().length > 0, `Missing i18n key ${k} for ${lang}`);
    }
  }

  assert.equal(cdp.DEFAULT_CONFIG.autoUpdate, 'off');
  assert.equal(settingsPanel.PRISM_SETTINGS_SCHEMA.autoUpdate.default, 'off');
  assert.deepEqual(settingsPanel.PRISM_SETTINGS_SCHEMA.autoUpdate.allowed, ['on', 'off']);

  // Renderer bundle budget + zero renderer-side GitHub API calls
  const expr = cdp.buildInjectExpression(cdp.DEFAULT_CONFIG);
  const bytes = Buffer.byteLength(expr, 'utf8');
  assert.ok(bytes < 690 * 1024, `Bundle must stay < 706,560 B (690 KiB), got ${bytes} B`);
  const ghApiRe = new RegExp(['api', 'github', 'com'].join('\\.'), 'i');
  assert.equal(ghApiRe.test(expr), false, 'Renderer bundle must NEVER reference api.github.com');
  assert.ok(fs.statSync(path.join(ROOT, 'pulse-vial-bridge.js')).size < 31000);

  // Mock DOM mount test for Windows hot-reload flow and macOS manual link flow
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  const prevStorage = globalThis.localStorage;
  const doc = makeMockDom();
  const dialog = doc.createElement('div');
  dialog.setAttribute('role', 'dialog');
  const panel = doc.createElement('div');
  const h2 = doc.createElement('h2');
  h2.textContent = 'Appearance';
  const anchor = doc.createElement('div');
  anchor.className = 'space-y-2';
  panel.appendChild(h2);
  panel.appendChild(anchor);
  dialog.appendChild(panel);
  doc.body.appendChild(dialog);

  const storageMap = new Map();
  const storage = {
    getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
    setItem: (k, v) => storageMap.set(k, String(v)),
    removeItem: (k) => storageMap.delete(k),
  };

  let mode = 'win';
  const bridgeCalls = [];
  const win = {
    document: doc,
    localStorage: storage,
    __agPrismRepoBridge: (payload) => {
      bridgeCalls.push(payload);
      if (payload.action === 'update-status' || payload.action === 'check-update') {
        if (mode === 'mac') {
          return {
            ok: true,
            currentVersion: '1.0.3',
            latestVersion: '1.0.4',
            hasUpdate: true,
            manualRequired: true,
            mode: 'manual',
            downloadUrl: 'https://github.com/hypsunk/GravityPrism/releases/download/v1.0.4/Obsidian-Prism-macOS-universal.dmg',
            releaseUrl: 'https://github.com/hypsunk/GravityPrism/releases/tag/v1.0.4',
          };
        }
        return {
          ok: true,
          currentVersion: '1.0.3',
          latestVersion: '1.0.4',
          hasUpdate: true,
          manualRequired: false,
          hotReloadCapable: true,
          mode: 'installer',
        };
      }
      if (payload.action === 'apply-update') {
        return { ok: true, applied: true, hotReloadExpected: true, needsHardReloadHint: true };
      }
      return { ok: true };
    },
  };

  globalThis.document = doc;
  globalThis.window = win;
  globalThis.localStorage = storage;

  const state = settingsPanel.getDefaultSettingsPatch();
  try {
    settingsPanel.mountOrSyncSettingsSection({
      version: '1.0.3',
      getLang: () => state.language,
      uiText: (l) => i18nLocales.getUiStrings(l),
      isZh: () => true,
      i18nCore,
      formatSettingsSummary: () => 'summary',
      resolveSettingRowActiveValue: (k) => state[k],
      isSettingButtonMatch: (_k, valJson, cur) => JSON.parse(valJson) === cur,
      saveSetting: (k, v) => { state[k] = v; },
      saveSettingsBatch: (p) => Object.assign(state, p),
      getThoughtTranslateMode: () => state.thoughtTranslate,
      handledGroupClicks: new WeakSet(),
      runSettingsGroupGlide: () => {},
      runGuardedMut: (fn) => fn(),
    });

    await new Promise((r) => setTimeout(r, 15));
    const sec = doc.getElementById(settingsPanel.SETTINGS_SEC_ID);
    const badge = sec.querySelector('[data-ag-cs-update-badge="1"]');
    const checkBtn = sec.querySelector('[data-ag-cs-update-check="1"]');
    const applyBtn = sec.querySelector('[data-ag-cs-update-apply="1"]');
    const noteEl = sec.querySelector('[data-ag-cs-update-note="1"]');
    const autoOffBtn = sec.querySelectorAll('button[data-ag-cs-key="autoUpdate"]').find((b) => b.getAttribute('data-ag-cs-val') === '"off"');

    assert.equal(autoOffBtn.getAttribute('aria-pressed'), 'true', 'autoUpdate must default to off in UI');
    assert.equal(badge.hidden, false, 'Update badge must light up when update-status finds new version');
    assert.equal(applyBtn.hidden, false, 'Hot-reload update button must show on Windows');
    assert.ok(noteEl.textContent.includes('Ctrl+R'), 'Update note must mention Ctrl+R / Cmd+R hard reload hint');

    applyBtn.click();
    await new Promise((r) => setTimeout(r, 15));
    assert.ok(bridgeCalls.some((c) => c.action === 'apply-update' && c.confirm === true));

    // Switch to macOS manual mode and click Check Update -> must render safe external link
    mode = 'mac';
    checkBtn.click();
    await new Promise((r) => setTimeout(r, 15));
    const macLink = sec.querySelector('[data-ag-cs-update-link="1"]');
    assert.ok(macLink, 'macOS update must render external download link');
    assert.equal(macLink.getAttribute('rel'), 'noopener noreferrer');
    assert.equal(applyBtn.hidden, true);
  } finally {
    if (prevDoc === undefined) delete globalThis.document;
    else globalThis.document = prevDoc;
    if (prevWin === undefined) delete globalThis.window;
    else globalThis.window = prevWin;
    if (prevStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = prevStorage;
  }
});

test('dual update channels (stable / beta): prerelease selection, automatic stable promotion, gentle channel switch-back, cache invalidation & release.yml --prerelease', async () => {
  assert.equal(normalizeUpdateChannel('beta'), 'beta');
  assert.equal(normalizeUpdateChannel('stable'), 'stable');
  assert.equal(normalizeUpdateChannel('invalid'), 'stable');

  const requestedUrls = [];
  let releasesList = [
    {
      tag_name: 'v1.0.8-beta.1',
      draft: true,
      prerelease: true,
      html_url: 'https://github.com/hypsunk/GravityPrism/releases/tag/v1.0.8-beta.1',
      assets: [],
    },
    {
      tag_name: 'v1.0.7-beta.1',
      draft: false,
      prerelease: true,
      html_url: 'https://github.com/hypsunk/GravityPrism/releases/tag/v1.0.7-beta.1',
      assets: [
        {
          name: 'gravity-prism-installer.exe',
          digest: `sha256:${'1'.repeat(64)}`,
          browser_download_url: 'https://github.com/hypsunk/GravityPrism/releases/download/v1.0.7-beta.1/gravity-prism-installer.exe',
        },
      ],
    },
    {
      tag_name: 'v1.0.6',
      draft: false,
      prerelease: false,
      html_url: 'https://github.com/hypsunk/GravityPrism/releases/tag/v1.0.6',
      assets: [
        {
          name: 'gravity-prism-installer.exe',
          digest: `sha256:${'2'.repeat(64)}`,
          browser_download_url: 'https://github.com/hypsunk/GravityPrism/releases/download/v1.0.6/gravity-prism-installer.exe',
        },
      ],
    },
  ];
  let latestStable = releasesList[2];

  const mockFetch = async (url) => {
    requestedUrls.push(url);
    if (url === LATEST_RELEASE_API) {
      return { ok: true, status: 200, json: async () => latestStable };
    }
    if (url === RELEASES_LIST_API) {
      return { ok: true, status: 200, json: async () => releasesList };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };

  // 1) Default stable channel queries /releases/latest and skips prereleases
  const svc = new UpdateService({
    platform: 'win32',
    currentVersion: '1.0.6',
    channel: 'stable',
    fetchFn: mockFetch,
  });
  assert.equal(svc.getStatus().channel, 'stable');
  assert.equal(svc.getStatus().isPrerelease, false);

  const st1 = await svc.checkForUpdates({ force: false });
  assert.equal(st1.ok, true);
  assert.equal(st1.channel, 'stable');
  assert.equal(st1.hasUpdate, false);
  assert.equal(st1.isPrerelease, false);
  assert.equal(requestedUrls.at(-1), LATEST_RELEASE_API);

  // If /releases/latest returns a prerelease on stable channel, it must be skipped
  latestStable = releasesList[1];
  const stSkipPre = await svc.checkForUpdates({ force: true });
  assert.equal(stSkipPre.hasUpdate, false);
  assert.equal(stSkipPre.skippedPrerelease, true);
  assert.equal(stSkipPre.isPrerelease, false);
  latestStable = releasesList[2];

  // 2) Switching to beta channel invalidates cache immediately and picks highest non-draft semver (1.0.7-beta.1 > 1.0.6, skipping 1.0.8-beta.1 draft)
  assert.equal(svc.setChannel('beta'), true);
  assert.equal(svc.getStatus().checkedAt, null, 'setChannel must invalidate cached check result');
  const betaRes = await svc.checkForUpdates({ force: false, manual: true });
  assert.equal(betaRes.ok, true);
  assert.equal(betaRes.channel, 'beta');
  assert.equal(betaRes.hasUpdate, true);
  assert.equal(betaRes.latestTag, 'v1.0.7-beta.1');
  assert.equal(betaRes.latestVersion, '1.0.7-beta.1');
  assert.equal(betaRes.isPrerelease, true);
  assert.equal(requestedUrls.at(-1), RELEASES_LIST_API);

  // 3) Seamless promotion: when official v1.0.7 ships (> v1.0.7-beta.2), beta channel automatically picks v1.0.7
  releasesList = [
    {
      tag_name: 'v1.0.7',
      draft: false,
      prerelease: false,
      html_url: 'https://github.com/hypsunk/GravityPrism/releases/tag/v1.0.7',
      assets: [],
    },
    {
      tag_name: 'v1.0.7-beta.2',
      draft: false,
      prerelease: true,
      html_url: 'https://github.com/hypsunk/GravityPrism/releases/tag/v1.0.7-beta.2',
      assets: [],
    },
    ...releasesList,
  ];
  const promotedRes = await svc.checkForUpdates({ force: true });
  assert.equal(promotedRes.latestVersion, '1.0.7');
  assert.equal(promotedRes.isPrerelease, false, 'Official release outranking beta must clear isPrerelease');

  // 4) Gentle switch-back: user on 1.0.7-beta.1 switching back to stable must NOT downgrade to 1.0.6, and upgrades cleanly when 1.0.7 stable arrives
  const svcOnBetaBuild = new UpdateService({
    platform: 'win32',
    currentVersion: '1.0.7-beta.1',
    channel: 'stable',
    fetchFn: mockFetch,
  });
  latestStable = {
    tag_name: 'v1.0.6',
    draft: false,
    prerelease: false,
    html_url: 'https://github.com/hypsunk/GravityPrism/releases/tag/v1.0.6',
    assets: [],
  };
  const gentleNoDowngrade = await svcOnBetaBuild.checkForUpdates({ force: true });
  assert.equal(gentleNoDowngrade.hasUpdate, false, 'Switching back to stable must never force a downgrade from 1.0.7-beta.1 to 1.0.6');

  latestStable = {
    tag_name: 'v1.0.7',
    draft: false,
    prerelease: false,
    html_url: 'https://github.com/hypsunk/GravityPrism/releases/tag/v1.0.7',
    assets: [],
  };
  const gentlePromote = await svcOnBetaBuild.checkForUpdates({ force: true });
  assert.equal(gentlePromote.hasUpdate, true, 'Stable channel must offer upgrade once 1.0.7 official is published');
  assert.equal(gentlePromote.latestVersion, '1.0.7');

  // 5) PrismDaemon wires config.updateChannel into UpdateService & executeRepoAction / broadcastConfigRefresh
  const workDir = makeTempDir('prism-upd-channel-daemon-');
  const pluginDir = path.join(workDir, 'plugin');
  fs.mkdirSync(pluginDir, { recursive: true });
  let activeCfgChannel = 'stable';
  fs.writeFileSync(
    path.join(pluginDir, 'cdp.js'),
    "let ch='stable';module.exports={PLUGIN_VERSION:'1.0.6',DEFAULT_CONFIG:{autoUpdate:'off',updateChannel:'stable'},readConfig:()=>({autoUpdate:'off',updateChannel:global.__testUpdCh||ch,omniModule:'off'}),validateConfigEntry:()=>true,buildInjectExpression:()=>'(()=>{})()',buildConfigRefreshExpression:()=>'(()=>({refreshed:true}))()'};\n",
    'utf8'
  );
  global.__testUpdCh = activeCfgChannel;
  try {
    const dSvc = new UpdateService({
      platform: 'win32',
      currentVersion: '1.0.6',
      fetchFn: mockFetch,
    });
    latestStable = releasesList.find((r) => r.tag_name === 'v1.0.6');
    releasesList = releasesList.filter((r) => r.tag_name !== 'v1.0.7');

    const daemon = new PrismDaemon({
      rootDir: pluginDir,
      silent: true,
      enableAutoUpdateTimer: false,
      _testUpdateService: dSvc,
    });

    const sInit = await daemon.executeRepoAction({ action: 'check-update' });
    assert.equal(sInit.channel, 'stable');
    assert.equal(sInit.updateChannel, 'stable');
    assert.equal(sInit.hasUpdate, false);

    // Switch config to beta & broadcast refresh -> must sync UpdateService channel & detect 1.0.7-beta.2
    activeCfgChannel = 'beta';
    global.__testUpdCh = 'beta';
    await daemon.broadcastConfigRefresh();
    const sBeta = await daemon.executeRepoAction({ action: 'check-update' });
    assert.equal(sBeta.channel, 'beta');
    assert.equal(sBeta.updateChannel, 'beta');
    assert.equal(sBeta.hasUpdate, true);
    assert.equal(sBeta.isPrerelease, true);
    assert.equal(sBeta.latestVersion, '1.0.7-beta.2');
  } finally {
    delete global.__testUpdCh;
    fs.rmSync(workDir, { recursive: true, force: true });
  }

  // 6) Verify .github/workflows/release.yml attaches --prerelease for hyphenated tags & supports hyphenated CHANGELOG headers
  const wfYml = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'release.yml'), 'utf8');
  assert.ok(wfYml.includes('[[ "${TAG_NAME#v}" == *-* ]]'), 'release.yml must detect prerelease hyphenated tags');
  assert.ok(wfYml.includes('--prerelease'), 'release.yml must pass --prerelease to gh release');
  assert.ok(wfYml.includes('index(trimmed, "## [" ver "]") == 1'), 'release.yml must extract exact hyphenated version headers from CHANGELOG.md');
});

test('UpdateService on linux selects obsidian-prism-linux-portable.tar.gz (with fallback /linux.*\\.tar\\.gz$/i), preserves manual mode, and resolves SHA256SUMS.txt', async () => {
  const linuxDigest = 'f38d1932efb64ce0c8cde81291a8402efdf917b4dc0fb529b5790053ab0f7573';
  const fallbackDigest = '1111111111111111111111111111111111111111111111111111111111111111';
  const shaUrl = 'https://github.com/hypsunk/GravityPrism/releases/download/v1.0.8-beta.1/SHA256SUMS.txt';
  const linuxExactUrl =
    'https://github.com/hypsunk/GravityPrism/releases/download/v1.0.8-beta.1/obsidian-prism-linux-portable.tar.gz';
  const linuxFallbackUrl =
    'https://github.com/hypsunk/GravityPrism/releases/download/v1.0.8-beta.1/obsidian-prism-linux-x64.tar.gz';

  const shaSumsText = [
    `aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111  gravity-prism-installer.exe`,
    `${linuxDigest}  obsidian-prism-linux-portable.tar.gz`,
    `${fallbackDigest}  obsidian-prism-linux-x64.tar.gz`,
  ].join('\n');

  let activeRelease = {
    tag_name: 'v1.0.8-beta.1',
    draft: false,
    prerelease: true,
    html_url: 'https://github.com/hypsunk/GravityPrism/releases/tag/v1.0.8-beta.1',
    assets: [
      {
        name: 'gravity-prism-installer.exe',
        browser_download_url: 'https://github.com/hypsunk/GravityPrism/releases/download/v1.0.8-beta.1/gravity-prism-installer.exe',
      },
      {
        name: 'obsidian-prism-linux-x64.tar.gz',
        browser_download_url: linuxFallbackUrl,
        digest: `sha256:${fallbackDigest}`,
      },
      {
        name: 'obsidian-prism-linux-portable.tar.gz',
        browser_download_url: linuxExactUrl,
        digest: `sha256:${linuxDigest}`,
      },
      {
        name: 'SHA256SUMS.txt',
        browser_download_url: shaUrl,
      },
    ],
  };

  const mockFetch = async (url) => {
    if (url === RELEASES_LIST_API) {
      return { ok: true, status: 200, json: async () => [activeRelease] };
    }
    if (url === shaUrl) {
      return {
        ok: true,
        status: 200,
        headers: { 'content-length': String(Buffer.byteLength(shaSumsText)) },
        arrayBuffer: async () => Buffer.from(shaSumsText, 'utf8'),
      };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };

  const svcLinux = new UpdateService({
    platform: 'linux',
    currentVersion: '1.0.7',
    channel: 'beta',
    fetchFn: mockFetch,
  });

  // 1) Prefers exact obsidian-prism-linux-portable.tar.gz even when another linux*.tar.gz appears earlier
  const st = await svcLinux.checkForUpdates({ force: true });
  assert.equal(st.ok, true);
  assert.equal(st.hasUpdate, true);
  assert.equal(st.mode, 'manual');
  assert.equal(st.manualRequired, true);
  assert.equal(st.hotReloadCapable, false);
  assert.equal(st.assetName, 'obsidian-prism-linux-portable.tar.gz');
  assert.equal(st.downloadUrl, linuxExactUrl);
  assert.equal(st.expectedSha256, linuxDigest);

  // 2) applyReleaseUpdate keeps manual mode and points directly to the Linux tarball URL
  const applyRes = await svcLinux.applyReleaseUpdate({ confirm: true, auto: false });
  assert.equal(applyRes.ok, true);
  assert.equal(applyRes.applied, false);
  assert.equal(applyRes.manualRequired, true);
  assert.equal(applyRes.mode, 'manual');
  assert.equal(applyRes.downloadUrl, linuxExactUrl);

  // 3) When GitHub asset omits inline digest, _resolveExpectedSha256 falls back to SHA256SUMS.txt for linux tarball
  const relNoDigest = {
    ...activeRelease,
    assets: activeRelease.assets.map((a) =>
      a.name === 'obsidian-prism-linux-portable.tar.gz' ? { name: a.name, browser_download_url: a.browser_download_url } : a
    ),
  };
  const selNoDigest = svcLinux._selectReleaseAssets(relNoDigest);
  assert.equal(selNoDigest.targetAsset?.name, 'obsidian-prism-linux-portable.tar.gz');
  assert.equal(selNoDigest.assetDigestSha256, null);
  const resolvedSha = await svcLinux._resolveExpectedSha256(selNoDigest);
  assert.equal(resolvedSha, linuxDigest);

  // 4) Fallback regex /linux.*\.tar\.gz$/i when exact portable filename is absent
  activeRelease = {
    ...activeRelease,
    assets: activeRelease.assets.filter((a) => a.name !== 'obsidian-prism-linux-portable.tar.gz'),
  };
  const stFallback = await svcLinux.checkForUpdates({ force: true });
  assert.equal(stFallback.assetName, 'obsidian-prism-linux-x64.tar.gz');
  assert.equal(stFallback.downloadUrl, linuxFallbackUrl);
  assert.equal(stFallback.expectedSha256, fallbackDigest);
});

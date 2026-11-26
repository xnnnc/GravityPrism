import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { PrismDaemon } from '../sidecars/daemon/main.mjs';
import { SessionHistory } from '../vendor/pulse-dashboard/sidecars/panel/history.mjs';
import { UsageLedger } from '../vendor/pulse-dashboard/sidecars/panel/usage.mjs';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const installTool = require('../tools/install-plugin.cjs');
const settingsPanel = require('../settings-panel.js');
const i18nLocales = require('../i18n-locales.js');
const i18nCore = require('../i18n-core.js');

function mkTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function createMockDomAndStorage() {
  const storeMap = new Map();
  const storage = {
    getItem: (k) => (storeMap.has(k) ? storeMap.get(k) : null),
    setItem: (k, v) => storeMap.set(k, String(v)),
    removeItem: (k) => storeMap.delete(k),
    _map: storeMap,
  };

  function makeEl(tag) {
    const attrs = new Map();
    const listeners = new Map();
    const cls = new Set();
    const el = {
      tagName: String(tag).toUpperCase(),
      id: '',
      _text: '',
      children: [],
      parentElement: null,
      parentNode: null,
      hidden: false,
      disabled: false,
      checked: false,
      type: '',
      value: '',
      isConnected: true,
      style: {},
      get className() {
        return [...cls].join(' ');
      },
      set className(v) {
        cls.clear();
        for (const c of String(v || '').split(/\s+/).filter(Boolean)) cls.add(c);
      },
      get textContent() {
        return el.children.length ? el._text + el.children.map((c) => c.textContent).join('') : el._text;
      },
      set textContent(v) {
        el._text = String(v ?? '');
        el.children.length = 0;
      },
      classList: {
        add: (...a) => a.forEach((c) => c && cls.add(c)),
        remove: (...a) => a.forEach((c) => cls.delete(c)),
        contains: (c) => cls.has(c),
      },
      setAttribute(k, v) {
        attrs.set(k, String(v));
        if (k === 'id') el.id = String(v);
        if (k === 'hidden') el.hidden = true;
      },
      getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
      hasAttribute: (k) => attrs.has(k),
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
        if (c.parentElement) c.remove();
        c.parentElement = el;
        c.parentNode = el;
        el.children.push(c);
        return c;
      },
      removeChild(c) {
        const i = el.children.indexOf(c);
        if (i >= 0) el.children.splice(i, 1);
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
  }

  function matches(el, selList) {
    return selList.split(',').some((raw) => {
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
  }

  const doc = {
    documentElement: makeEl('html'),
    head: makeEl('head'),
    body: makeEl('body'),
    createElement: (t) => makeEl(t),
    getElementById: (id) => doc.documentElement.querySelector('#' + id),
    querySelectorAll: (s) => doc.documentElement.querySelectorAll(s),
    querySelector: (s) => doc.documentElement.querySelector(s),
  };
  doc.documentElement.appendChild(doc.head);
  doc.documentElement.appendChild(doc.body);

  const dialog = makeEl('div');
  dialog.setAttribute('role', 'dialog');
  const panel = makeEl('div');
  const h2 = makeEl('h2');
  h2.textContent = 'Appearance';
  const anchor = makeEl('div');
  anchor.className = 'space-y-2';
  panel.appendChild(h2);
  panel.appendChild(anchor);
  dialog.appendChild(panel);
  doc.body.appendChild(dialog);

  return { doc, storage };
}

test('tools/install-plugin.cjs default uninstall backs up & restores config.json, preserves user data, and --purge-data cleans telemetry/thought/sidebar while sparing redline dirs', async () => {
  const rootTmp = mkTempDir('prism-u1-');
  try {
    const geminiDir = path.join(rootTmp, '.gemini');
    const hostConfigDir = path.join(geminiDir, 'config');
    const targetDir = path.join(hostConfigDir, 'plugins', 'obsidian-prism');
    const telemetryDir = path.join(geminiDir, 'antigravity', 'sidecar_data', 'obsidian-prism', 'telemetry');
    const convArchiveDir = path.join(geminiDir, 'antigravity', 'conversations_archive');
    const sparkDir = path.join(rootTmp, 'Documents', 'Antigravity-Spark');
    const knowledgeDir = path.join(geminiDir, 'antigravity', 'prism-knowledge-space');

    for (const d of [
      hostConfigDir,
      path.join(telemetryDir, 'history-v1'),
      convArchiveDir,
      sparkDir,
      knowledgeDir,
    ]) {
      fs.mkdirSync(d, { recursive: true });
    }
    fs.writeFileSync(path.join(telemetryDir, 'history-v1', 'sample.json'), '{"ok":true}\n');
    fs.writeFileSync(path.join(convArchiveDir, 'archive-keep.txt'), 'keep-archive');
    fs.writeFileSync(path.join(sparkDir, 'spark-keep.txt'), 'keep-spark');
    fs.writeFileSync(path.join(knowledgeDir, 'knowledge-keep.txt'), 'keep-knowledge');

    const thoughtCfg = path.join(hostConfigDir, 'obsidian-prism-thought.json');
    const thoughtCache = path.join(hostConfigDir, 'obsidian-prism-thought-cache.json');
    const usageRollupCache = path.join(hostConfigDir, 'obsidian-prism-usage-rollup-cache.json');
    const sidebarCfg = path.join(hostConfigDir, 'obsidian-prism-sidebar.json');
    const sidebarLock = path.join(hostConfigDir, 'obsidian-prism-sidebar.json.lock');
    const sidebarBak = path.join(hostConfigDir, 'obsidian-prism-sidebar.json.v1.12345.bak');
    const wallpaperCfg = path.join(hostConfigDir, 'obsidian-prism-wallpaper.json');

    fs.writeFileSync(thoughtCfg, JSON.stringify({ apiKey: 'sk-test-secret' }));
    fs.writeFileSync(thoughtCache, '{"c":1}');
    fs.writeFileSync(usageRollupCache, '{"version":2,"scopes":{"local":{}}}');
    fs.writeFileSync(sidebarCfg, '{"folders":[]}');
    fs.writeFileSync(sidebarLock, 'lock');
    fs.writeFileSync(sidebarBak, '{"folders":[]}');
    fs.writeFileSync(wallpaperCfg, '{"enabled":true}');

    // 1) Install into isolated targetDir and customize config.json
    const installRes = await installTool.installPlugin({
      sourceDir: ROOT,
      targetDir,
      hostConfigDir,
      startDaemon: false,
      syncShortcuts: false,
    });
    assert.equal(installRes.ok, true);
    const cfgPath = path.join(targetDir, 'config.json');
    fs.writeFileSync(cfgPath, JSON.stringify({ palette: 'warm', motionLevel: 'subtle', language: 'en' }, null, 2));

    // 2) Default uninstall (purgeData: false) -> backs up config.json & preserves user data
    const un1 = await installTool.uninstallPlugin({
      targetDir,
      hostConfigDir,
      telemetryDir,
      noCdp: true,
      syncShortcuts: false,
      purgeData: false,
    });
    assert.equal(un1.ok, true);
    assert.equal(un1.purgeData, false);
    assert.equal(fs.existsSync(targetDir), false);
    const backupPath = path.join(hostConfigDir, 'obsidian-prism-config.backup.json');
    assert.equal(fs.existsSync(backupPath), true, 'Default uninstall must back up config.json');
    assert.equal(JSON.parse(fs.readFileSync(backupPath, 'utf8')).palette, 'warm');
    assert.equal(fs.existsSync(thoughtCfg), true, 'Default uninstall must keep obsidian-prism-thought.json');
    assert.equal(fs.existsSync(usageRollupCache), true, 'Default uninstall must keep obsidian-prism-usage-rollup-cache.json');
    assert.equal(fs.existsSync(sidebarCfg), true, 'Default uninstall must keep obsidian-prism-sidebar.json');
    assert.equal(fs.existsSync(wallpaperCfg), true, 'Default uninstall must keep obsidian-prism-wallpaper.json');
    assert.equal(fs.existsSync(telemetryDir), true, 'Default uninstall must keep telemetry/');

    // 3) Reinstall automatically inherits obsidian-prism-config.backup.json
    const installRes2 = await installTool.installPlugin({
      sourceDir: ROOT,
      targetDir,
      hostConfigDir,
      startDaemon: false,
      syncShortcuts: false,
    });
    assert.equal(installRes2.restoredFromBackup, true);
    assert.equal(JSON.parse(fs.readFileSync(cfgPath, 'utf8')).palette, 'warm');

    // 4) Purge uninstall (--purge-data) -> clears telemetry/thought/sidebar/backup, NEVER touches redline dirs
    assert.deepEqual(installTool.parseCliArgs(['node', 'install-plugin.cjs', '--uninstall', '--purge-data']).purgeData, true);
    assert.deepEqual(installTool.parseCliArgs(['node', 'install-plugin.cjs', '--uninstall']).purgeData, false);

    const un2 = await installTool.uninstallPlugin({
      targetDir,
      hostConfigDir,
      telemetryDir,
      noCdp: true,
      syncShortcuts: false,
      purgeData: true,
    });
    assert.equal(un2.ok, true);
    assert.equal(un2.purgeData, true);
    assert.equal(fs.existsSync(targetDir), false);
    assert.equal(fs.existsSync(backupPath), false);
    assert.equal(fs.existsSync(thoughtCfg), false);
    assert.equal(fs.existsSync(thoughtCache), false);
    assert.equal(fs.existsSync(usageRollupCache), false, '--purge-data must remove obsidian-prism-usage-rollup-cache.json');
    assert.equal(fs.existsSync(sidebarCfg), false);
    assert.equal(fs.existsSync(sidebarLock), false);
    assert.equal(fs.existsSync(sidebarBak), false);
    assert.equal(fs.existsSync(wallpaperCfg), false, '--purge-data must remove obsidian-prism-wallpaper.json');
    assert.equal(fs.existsSync(telemetryDir), false);

    // Redline directories must be 100% untouched
    assert.equal(fs.readFileSync(path.join(convArchiveDir, 'archive-keep.txt'), 'utf8'), 'keep-archive');
    assert.equal(fs.readFileSync(path.join(sparkDir, 'spark-keep.txt'), 'utf8'), 'keep-spark');
    assert.equal(fs.readFileSync(path.join(knowledgeDir, 'knowledge-keep.txt'), 'utf8'), 'keep-knowledge');
  } finally {
    fs.rmSync(rootTmp, { recursive: true, force: true });
  }
});

test('Redline subdirectories and hijacked AG_PRISM_TELEMETRY_DIR env var are refused during --purge-data, and legacy antigravity-prism sibling is cleaned', async () => {
  const rootTmp = mkTempDir('prism-u1-sec-');
  const prevEnv = process.env.AG_PRISM_TELEMETRY_DIR;
  try {
    const geminiDir = path.join(rootTmp, '.gemini');
    const hostConfigDir = path.join(geminiDir, 'config');
    const targetDir = path.join(hostConfigDir, 'plugins', 'obsidian-prism');
    const legacyDir = path.join(hostConfigDir, 'plugins', 'antigravity-prism');
    const convSubdir = path.join(geminiDir, 'antigravity', 'conversations_archive', '2026');
    const knowledgeSubdir = path.join(geminiDir, 'antigravity', 'prism-knowledge-space', 'notes');
    const sparkSubdir = path.join(rootTmp, 'Documents', 'Antigravity-Spark', 'drafts');
    const evilWorkspace = path.join(rootTmp, 'evil-user-workspace');

    for (const d of [hostConfigDir, targetDir, legacyDir, convSubdir, knowledgeSubdir, sparkSubdir, evilWorkspace]) {
      fs.mkdirSync(d, { recursive: true });
    }
    fs.writeFileSync(path.join(convSubdir, 'keep.txt'), 'archive-2026');
    fs.writeFileSync(path.join(knowledgeSubdir, 'keep.txt'), 'knowledge-notes');
    fs.writeFileSync(path.join(sparkSubdir, 'keep.txt'), 'spark-drafts');
    fs.writeFileSync(path.join(evilWorkspace, 'secret.txt'), 'workspace-file');
    fs.writeFileSync(path.join(legacyDir, 'stale.txt'), 'legacy');

    // 1) Redline subdirectories must be flagged protected and refused by uninstallPlugin
    assert.equal(installTool.isProtectedUserDataPath(convSubdir), true);
    assert.equal(installTool.isProtectedUserDataPath(knowledgeSubdir), true);
    assert.equal(installTool.isProtectedUserDataPath(sparkSubdir), true);
    await assert.rejects(() => installTool.uninstallPlugin({ targetDir: convSubdir, noCdp: true, syncShortcuts: false }), /protected/i);
    await assert.rejects(() => installTool.uninstallPlugin({ targetDir: sparkSubdir, noCdp: true, syncShortcuts: false }), /protected/i);

    // 2) Malicious AG_PRISM_TELEMETRY_DIR pointing outside .gemini/tmpdir or lacking telemetry/obsidian-prism must be rejected
    process.env.AG_PRISM_TELEMETRY_DIR = evilWorkspace;
    assert.equal(installTool.resolveTelemetryDir(hostConfigDir), null);

    const un = await installTool.uninstallPlugin({
      targetDir,
      hostConfigDir,
      noCdp: true,
      syncShortcuts: false,
      purgeData: true,
    });
    assert.equal(un.ok, true);
    assert.equal(un.cleanedLegacyPluginDir, true, 'Uninstall must clean legacy antigravity-prism sibling directory');
    assert.equal(fs.existsSync(legacyDir), false);
    assert.equal(fs.readFileSync(path.join(evilWorkspace, 'secret.txt'), 'utf8'), 'workspace-file');
    assert.equal(fs.readFileSync(path.join(convSubdir, 'keep.txt'), 'utf8'), 'archive-2026');
    assert.equal(fs.readFileSync(path.join(knowledgeSubdir, 'keep.txt'), 'utf8'), 'knowledge-notes');
    assert.equal(fs.readFileSync(path.join(sparkSubdir, 'keep.txt'), 'utf8'), 'spark-drafts');

    // 3) Valid AG_PRISM_TELEMETRY_DIR under os.tmpdir() containing telemetry segment is accepted
    const validTel = path.join(rootTmp, 'obsidian-prism', 'telemetry');
    fs.mkdirSync(validTel, { recursive: true });
    process.env.AG_PRISM_TELEMETRY_DIR = validTel;
    assert.equal(installTool.resolveTelemetryDir(hostConfigDir), path.resolve(validTel));

    // 4) PRISM_USAGE_CACHE_PATH safe override is cleaned on --purge-data, while hijacked/redline paths are refused
    const prevUsageEnv = process.env.PRISM_USAGE_CACHE_PATH;
    try {
      const safeUsageOverride = path.join(rootTmp, 'usage-override', 'obsidian-prism-usage-rollup-cache.json');
      const hijackedUsageFile = path.join(evilWorkspace, 'not-usage-cache.json');
      const redlineUsageFile = path.join(convSubdir, 'obsidian-prism-usage-rollup-cache.json');
      fs.mkdirSync(path.dirname(safeUsageOverride), { recursive: true });
      fs.writeFileSync(safeUsageOverride, '{"version":2,"scopes":{"ssh:box":{}}}');
      fs.writeFileSync(hijackedUsageFile, '{"keep":true}');
      fs.writeFileSync(redlineUsageFile, '{"archive":true}');

      process.env.PRISM_USAGE_CACHE_PATH = safeUsageOverride;
      await installTool.uninstallPlugin({
        targetDir,
        hostConfigDir,
        noCdp: true,
        syncShortcuts: false,
        purgeData: true,
      });
      assert.equal(fs.existsSync(safeUsageOverride), false, 'Valid PRISM_USAGE_CACHE_PATH override must be purged on --purge-data');

      for (const dangerous of [hijackedUsageFile, redlineUsageFile]) {
        process.env.PRISM_USAGE_CACHE_PATH = dangerous;
        await installTool.uninstallPlugin({
          targetDir,
          hostConfigDir,
          noCdp: true,
          syncShortcuts: false,
          purgeData: true,
        });
      }
      assert.equal(fs.existsSync(hijackedUsageFile), true, 'Non-allowlisted PRISM_USAGE_CACHE_PATH filename must be refused');
      assert.equal(fs.existsSync(redlineUsageFile), true, 'Redline PRISM_USAGE_CACHE_PATH must be refused');
    } finally {
      if (prevUsageEnv === undefined) delete process.env.PRISM_USAGE_CACHE_PATH;
      else process.env.PRISM_USAGE_CACHE_PATH = prevUsageEnv;
    }
  } finally {
    if (prevEnv === undefined) delete process.env.AG_PRISM_TELEMETRY_DIR;
    else process.env.AG_PRISM_TELEMETRY_DIR = prevEnv;
    fs.rmSync(rootTmp, { recursive: true, force: true });
  }
});

test('PrismDaemon executeRepoAction uninstall enforces confirm:true, symlink check, and spawns detached installer with --purge-data', async () => {
  const tmpDir = mkTempDir('prism-u2-');
  try {
    const fakeInstaller = path.join(tmpDir, 'obsidian-prism-installer.exe');
    fs.writeFileSync(fakeInstaller, 'MZ-mock');

    const daemon = new PrismDaemon({ rootDir: ROOT });

    // 1) Missing confirm: true must fail closed
    const denied = await daemon.executeRepoAction({ action: 'uninstall', purgeData: true });
    assert.equal(denied.ok, false);
    assert.equal(denied.error, 'confirmation_required');

    // 2) Symlink installer must be refused
    const symDenied = await daemon.executeRepoAction({
      action: 'uninstall',
      confirm: true,
      _testOverrides: {
        installerPath: fakeInstaller,
        lstatSync: () => ({ isSymbolicLink: () => true, isFile: () => false }),
      },
    });
    assert.equal(symDenied.ok, false);
    assert.equal(symDenied.error, 'refused_symlink_installer');

    // 3) Valid installer spawns detached with cwd=os.tmpdir() and --purge-data forwarded
    const spawns = [];
    let unrefCalled = 0;
    let stopCalled = 0;
    let exitCode = null;
    const res = await daemon.executeRepoAction({
      action: 'uninstall',
      confirm: true,
      purgeData: true,
      _testOverrides: {
        installerPath: fakeInstaller,
        spawn: (cmd, args, opts) => {
          spawns.push({ cmd, args, opts });
          return { unref() { unrefCalled++; } };
        },
        stopDelayMs: 10,
        stop: async () => { stopCalled++; },
        exit: (c) => { exitCode = c; },
      },
    });
    assert.equal(res.ok, true);
    assert.equal(res.scheduled, true);
    assert.equal(res.purgeData, true);
    assert.equal(res.engine, 'installer');
    assert.equal(spawns.length, 1);
    assert.equal(spawns[0].cmd, fakeInstaller);
    assert.deepEqual(spawns[0].args, ['--uninstall', '--silent', '--purge-data']);
    assert.equal(spawns[0].opts.detached, true);
    assert.equal(spawns[0].opts.cwd, os.tmpdir());
    assert.equal(spawns[0].opts.stdio, 'ignore');
    assert.equal(spawns[0].opts.windowsHide, true);
    assert.equal(unrefCalled, 1);

    await new Promise((r) => setTimeout(r, 40));
    assert.equal(stopCalled, 1);
    assert.equal(exitCode, 0);

    // 4) Fallback to source-script when installerPath does not exist
    const srcSpawns = [];
    const srcRes = await daemon.executeRepoAction({
      action: 'uninstall',
      confirm: true,
      purgeData: false,
      _testOverrides: {
        installerPath: path.join(tmpDir, 'nonexistent-installer.exe'),
        spawn: (cmd, args, opts) => {
          srcSpawns.push({ cmd, args, opts });
          return { unref() {} };
        },
        skipStop: true,
      },
    });
    assert.equal(srcRes.ok, true);
    assert.equal(srcRes.engine, 'source-script');
    assert.equal(srcSpawns.length, 1);
    assert.equal(srcSpawns[0].opts.detached, true);
    assert.equal(srcSpawns[0].opts.cwd, os.tmpdir());
    assert.equal(srcSpawns[0].opts.env.AG_PRISM_PURGE_DATA, '0');

    // 5) Fallback inlineRunner without external installer or installScriptPath hardens target path, cleans sidecar, uses atomic rename, and calls stop(true)
    const fbSpawns = [];
    const stopArgs = [];
    const origStop = daemon.stop.bind(daemon);
    daemon.stop = async (cleanDom) => { stopArgs.push(cleanDom); };
    const fbRes = await daemon.executeRepoAction({
      action: 'uninstall',
      confirm: true,
      purgeData: false,
      _testOverrides: {
        installerPath: null,
        installScriptPath: null,
        spawn: (cmd, args, opts) => {
          fbSpawns.push({ cmd, args, opts });
          return { unref() {} };
        },
        stopDelayMs: 5,
        exit: () => {},
      },
    });
    assert.equal(fbRes.ok, true);
    assert.equal(fbRes.engine, 'source-script');
    assert.equal(fbSpawns.length, 1);
    const fbScript = fbSpawns[0].args[1] || '';
    assert.ok(fbScript.includes('conversations_archive'), 'Fallback inlineRunner must enforce redline path guard');
    assert.ok(fbScript.includes("obsidian-prism/daemon"), 'Fallback inlineRunner must clean sidecars entry');
    assert.ok(fbScript.includes('renameSync'), 'Fallback inlineRunner must atomically replace config.json');
    await new Promise((r) => setTimeout(r, 30));
    assert.deepEqual(stopArgs, [true], 'Must call this.stop(true) to clean open page DOM when no external installer is used');
    daemon.stop = origStop;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('settings-panel.js inline uninstall UI works across 5 languages and purgeData clears exactly 12 Prism keys while preserving 4 upstream keys', async () => {
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  const prevStorage = globalThis.localStorage;

  const { doc, storage } = createMockDomAndStorage();
  const prismKeys = [
    'ag-prism:config',
    'ag-prism:lastFileConfig',
    'agClaudeStyle.settings.v3',
    'ag-claude-style:config',
    'ag-prism:trajRollup.v1',
    'ag-prism:settings-open',
    'ag-prism:settings-subtab',
    '__op_chroma_v1',
    'agCs.pulseVialMode.v1',
    'ag_prism_thought_zh_cache_v1',
    'ag_prism_thought_view_mode_v1',
    'ag_prism_thought_style_tag_v1',
  ];
  const upstreamKeys = [
    'ag.codexEffortSlider.settings.v1',
    'ag-pulse-enabled',
    'ag-pulse-theme',
    'ag-pulse-cache-v1',
  ];
  for (const k of [...prismKeys, ...upstreamKeys]) storage.setItem(k, 'val-' + k);

  const calls = [];
  const state = settingsPanel.getDefaultSettingsPatch();
  globalThis.document = doc;
  globalThis.localStorage = storage;
  globalThis.window = {
    document: doc,
    localStorage: storage,
    __agPrismRepoBridge: (payload) => {
      calls.push(payload);
      if (payload?.action === 'uninstall') {
        return { ok: true, action: 'uninstall', scheduled: true, purgeData: Boolean(payload.purgeData) };
      }
      return { ok: true, noRemote: true, branch: 'local' };
    },
  };

  const mount = () =>
    settingsPanel.mountOrSyncSettingsSection({
      version: '1.0.6',
      getLang: () => state.language,
      uiText: (l) => i18nLocales.getUiStrings(l),
      isZh: () => state.language !== 'en' && state.language !== 'ja',
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

  try {
    for (const lang of ['zh-CN', 'zh-TW', 'yue', 'en', 'ja']) {
      state.language = lang;
      const prevSec = doc.getElementById(settingsPanel.SETTINGS_SEC_ID);
      if (prevSec) prevSec.remove();
      mount();
      const sec = doc.getElementById(settingsPanel.SETTINGS_SEC_ID);
      const ui = i18nLocales.getUiStrings(lang);
      const uBtn = sec.querySelector('[data-ag-cs-uninstall="1"]');
      const uBox = sec.querySelector('[data-ag-cs-uninstall-box="1"]');
      const uCb = sec.querySelector('[data-ag-cs-uninstall-purge="1"]');
      assert.ok(uBtn && uBox && uCb, `Uninstall controls must exist for ${lang}`);
      assert.equal(uBtn.textContent, ui.uninstallBtn);
      assert.equal(uBox.hidden, true);
      assert.equal(uCb.checked, false, 'Purge checkbox must default to unchecked');
    }

    // Open confirm box, cancel -> no bridge call
    const sec = doc.getElementById(settingsPanel.SETTINGS_SEC_ID);
    const uBtn = sec.querySelector('[data-ag-cs-uninstall="1"]');
    const uBox = sec.querySelector('[data-ag-cs-uninstall-box="1"]');
    const uCb = sec.querySelector('[data-ag-cs-uninstall-purge="1"]');
    const uCancel = sec.querySelector('[data-ag-cs-uninstall-cancel="1"]');
    const uConfirm = sec.querySelector('[data-ag-cs-uninstall-confirm="1"]');
    const uChip = sec.querySelector('[data-ag-cs-uninstall-status]');

    uBtn.click();
    assert.equal(uBox.hidden, false);
    uCancel.click();
    assert.equal(uBox.hidden, true);
    assert.equal(calls.filter((c) => c?.action === 'uninstall').length, 0);

    // Confirm without purgeData -> preserves all localStorage keys
    uBtn.click();
    uConfirm.click();
    await new Promise((r) => setTimeout(r, 10));
    const uCalls1 = calls.filter((c) => c?.action === 'uninstall');
    assert.equal(uCalls1.length, 1);
    assert.deepEqual(uCalls1[0], { action: 'uninstall', confirm: true, purgeData: false });
    for (const k of prismKeys) assert.ok(storage.getItem(k), `Key ${k} must remain when purgeData=false`);
    assert.equal(uChip.getAttribute('data-status'), 'ok');

    // Confirm WITH purgeData -> deletes exact 12 Prism keys and preserves 4 upstream keys
    uBtn.click();
    uCb.checked = true;
    uConfirm.click();
    await new Promise((r) => setTimeout(r, 10));
    const uCalls2 = calls.filter((c) => c?.action === 'uninstall');
    assert.equal(uCalls2.length, 2);
    assert.deepEqual(uCalls2[1], { action: 'uninstall', confirm: true, purgeData: true });
    for (const k of prismKeys) assert.equal(storage.getItem(k), null, `Prism key ${k} must be purged`);
    for (const k of upstreamKeys) assert.ok(storage.getItem(k), `Upstream key ${k} must be preserved`);
  } finally {
    if (prevDoc === undefined) delete globalThis.document;
    else globalThis.document = prevDoc;
    if (prevWin === undefined) delete globalThis.window;
    else globalThis.window = prevWin;
    if (prevStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = prevStorage;
  }
});

test('SessionHistory and UsageLedger enforce LRU file cap on disk without deleting backfill checkpoint', async () => {
  const tmpDir = mkTempDir('prism-u4-');
  try {
    const scope = 'a'.repeat(64);
    const histDir = path.join(tmpDir, 'history-v1');
    const history = new SessionHistory(histDir, { maxFiles: 3 });

    const ids = [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      '44444444-4444-4444-8444-444444444444',
      '55555555-5555-4555-8555-555555555555',
    ];
    for (let i = 0; i < ids.length; i++) {
      await history.save(scope, ids[i], { requests: i + 1, counts: { output: 100 + i } });
      const f = history.file(scope, ids[i]);
      const t = new Date(1_700_000_000_000 + i * 10_000);
      fs.utimesSync(f, t, t);
    }
    await history.pruneOldFiles();
    const keptHist = fs.readdirSync(path.join(histDir, scope)).filter((n) => n.endsWith('.json'));
    assert.equal(keptHist.length, 3, 'SessionHistory must cap files at maxFiles=3');
    assert.equal(keptHist.includes(ids[0] + '.json'), false);
    assert.equal(keptHist.includes(ids[1] + '.json'), false);
    assert.equal(keptHist.includes(ids[4] + '.json'), true);

    const usageDir = path.join(tmpDir, 'usage-v1');
    const ledger = new UsageLedger(usageDir, { maxFiles: 3 });
    await ledger.saveBackfillState(scope, 'ide', {});
    for (let i = 0; i < ids.length; i++) {
      const rowHash = (i + 1).toString(16).repeat(64).slice(0, 64);
      await ledger.ingestRows(scope, ids[i], [
        { id: rowHash, at: 1_700_000_000_000 + i, model: 'gemini', uncached: 10, cacheRead: 0, cacheWrite: 0, output: 20, partial: false, timeBasis: 'request-start' },
      ]);
      const uf = ledger.file(scope, ids[i]);
      const t = new Date(1_700_000_000_000 + i * 10_000);
      fs.utimesSync(uf, t, t);
    }
    await ledger.pruneOldFiles();
    const usageScopeFiles = fs.readdirSync(path.join(usageDir, scope));
    assert.ok(usageScopeFiles.includes('backfill-v1.json'), 'backfill-v1.json must never be evicted');
    const hashFiles = usageScopeFiles.filter((n) => /^[a-f0-9]{64}\.json$/i.test(n));
    assert.equal(hashFiles.length, 3, 'UsageLedger must cap per-conversation files at maxFiles=3');

    // Default UsageLedger maxFiles must be 256 and active pending files must be spared during LRU prune
    assert.equal(new UsageLedger(usageDir).maxFiles, 256);
    const activeUsageFile = ledger.file(scope, ids[2]);
    ledger._files.set(activeUsageFile, Promise.resolve());
    const removedWhileActive = await ledger.pruneOldFiles(2);
    ledger._files.delete(activeUsageFile);
    assert.equal(removedWhileActive, 1);
    assert.equal(fs.existsSync(activeUsageFile), true, 'Active UsageLedger file in _files must be spared from LRU eviction');

    const activeHistFile = history.file(scope, ids[2]);
    history.pending.set(activeHistFile, Promise.resolve());
    const histRemovedWhileActive = await history.pruneOldFiles(2);
    history.pending.delete(activeHistFile);
    assert.equal(histRemovedWhileActive, 1);
    assert.equal(fs.existsSync(activeHistFile), true, 'Active SessionHistory file in pending must be spared from LRU eviction');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Windows Program.cs and macOS main.swift source contracts support --purge-data, config backup/restore, and redline protection', () => {
  const cs = fs.readFileSync(path.join(ROOT, 'installer', 'setup', 'Program.cs'), 'utf8');
  assert.equal(cs.includes('\r\n'), false, 'Program.cs must use pure LF line endings');
  assert.ok(cs.includes('PurgeData'));
  assert.ok(cs.includes('--purge-data'));
  assert.ok(cs.includes('obsidian-prism-config.backup.json'));
  assert.ok(cs.includes('BackupUserConfigBeforeUninstall'));
  assert.ok(cs.includes('RestoreUserConfigBackupIfNeeded'));
  assert.ok(cs.includes('PurgeUserPluginData'));
  assert.ok(cs.includes('IsAllowedTelemetryOverrideDir'));
  assert.ok(cs.includes('CleanInstallDirKeepingSelfExe'));
  assert.ok(cs.includes('conversations_archive'));
  assert.ok(cs.includes('obsidian-prism-thought.json'));
  assert.ok(cs.includes('obsidian-prism-usage-rollup-cache.json'));
  assert.ok(cs.includes('obsidian-prism-sidebar.json'));
  assert.ok(cs.includes('telemetry'));
  assert.ok(cs.includes('IsAllowedAddonsOverrideDir'));
  assert.ok(cs.includes('AG_PRISM_ADDONS_DIR'));
  assert.ok(cs.includes('"addons"'));
  assert.ok(cs.includes('ScheduleSelfDeleteIfNeeded'));

  const swift = fs.readFileSync(path.join(ROOT, 'installer', 'macos', 'Setup', 'main.swift'), 'utf8');
  assert.equal(swift.includes('\r\n'), false, 'main.swift must use pure LF line endings');
  assert.ok(swift.includes('purgeData'));
  assert.ok(swift.includes('--purge-data'));
  assert.ok(swift.includes('obsidian-prism-config.backup.json'));
  assert.ok(swift.includes('backupUserConfigBeforeUninstall'));
  assert.ok(swift.includes('restoreUserConfigBackupIfNeeded'));
  assert.ok(swift.includes('purgeUserPluginData'));
  assert.ok(swift.includes('isAllowedTelemetryOverrideDir'));
  assert.ok(swift.includes('isAllowedAddonsOverrideDir'));
  assert.ok(swift.includes('AG_PRISM_ADDONS_DIR'));
  assert.ok(swift.includes('sidecar_data/obsidian-prism/addons'));
  assert.ok(swift.includes('obsidian-prism-thought.json'));
  assert.ok(swift.includes('obsidian-prism-usage-rollup-cache.json'));
  assert.ok(swift.includes('obsidian-prism-sidebar.json'));
  assert.ok(swift.includes('telemetry'));
  assert.ok(swift.includes('unloadLaunchAgent'));
  assert.ok(swift.includes('normalizeSystemRootPrefix'));
  assert.ok(swift.includes('isNoSuchFileError'));
  assert.ok(swift.includes('NSFileReadNoSuchFileError'));
  assert.ok(swift.includes('NSFileNoSuchFileError'));
  assert.ok(swift.includes('isRegularFileNoSymlink'));
});

test('tools/install-plugin.cjs P1-5: waits for slow-exiting daemon to finish flushing before --purge-data deletes usage cache and escalates to SIGKILL on timeout', async () => {
  assert.ok(
    installTool.DAEMON_STOP_POLL_MS >= 25 && installTool.DAEMON_STOP_POLL_MS <= 40,
    `Expected poll interval within 25..40ms, got ${installTool.DAEMON_STOP_POLL_MS}`
  );
  assert.equal(installTool.DAEMON_STOP_GRACEFUL_TIMEOUT_MS, 800);

  const rootTmp = mkTempDir('prism-p1-5-install-');
  const spawnedChildren = [];
  try {
    const geminiDir = path.join(rootTmp, '.gemini');
    const hostConfigDir = path.join(geminiDir, 'config');
    const targetDir = path.join(hostConfigDir, 'plugins', 'obsidian-prism');
    fs.mkdirSync(targetDir, { recursive: true });

    const usageCachePath = path.join(hostConfigDir, 'obsidian-prism-usage-rollup-cache.json');
    const flushMarkerPath = path.join(rootTmp, 'flushed.marker');
    const triggerFilePath = path.join(rootTmp, 'sigterm.trigger');
    const readyMarkerPath = path.join(rootTmp, 'daemon.ready');
    const stubbornReadyPath = path.join(rootTmp, 'stubborn.ready');
    fs.writeFileSync(usageCachePath, '{"version":2,"scopes":{"local":{"stale":true}}}', 'utf8');

    const waitForChildReady = async (markerFile, proc, timeoutMs = 5000) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (fs.existsSync(markerFile)) return;
        if (proc.exitCode !== null || proc.signalCode !== null) {
          throw new Error(`Child exited before ready (exit=${proc.exitCode}, signal=${proc.signalCode})`);
        }
        await new Promise((r) => setTimeout(r, 10));
      }
      throw new Error(`Timed out waiting for child ready marker: ${markerFile}`);
    };

    // 1) Spawn a real child process simulating a Daemon that flushes dirty usage cache ~160ms after SIGTERM, then exits
    const slowDaemonScript = `
      const fs = require('node:fs');
      const [cachePath, markerPath, triggerPath, readyPath] = process.argv.slice(1);
      let stopping = false;
      function gracefulStop() {
        if (stopping) return;
        stopping = true;
        setTimeout(() => {
          try { fs.writeFileSync(cachePath, '{"version":2,"scopes":{"local":{"revived":true}}}', 'utf8'); } catch {}
          try { fs.writeFileSync(markerPath, String(Date.now()), 'utf8'); } catch {}
          setTimeout(() => process.exit(0), 25);
        }, 160);
      }
      process.on('SIGTERM', gracefulStop);
      const timer = setInterval(() => {
        if (fs.existsSync(triggerPath)) gracefulStop();
      }, 10);
      timer.unref && false;
      fs.writeFileSync(readyPath, '1', 'utf8');
    `;
    const child = spawn(
      process.execPath,
      ['-e', slowDaemonScript, usageCachePath, flushMarkerPath, triggerFilePath, readyMarkerPath],
      {
        stdio: 'ignore',
        windowsHide: true,
      }
    );
    spawnedChildren.push(child);
    let childExited = false;
    child.once('exit', () => {
      childExited = true;
    });
    await waitForChildReady(readyMarkerPath, child);

    const pidFile = path.join(targetDir, '.daemon.pid');
    fs.writeFileSync(pidFile, JSON.stringify({ pid: child.pid, startedAt: Date.now() }), 'utf8');

    const signals = [];
    const daemonStopOpts =
      process.platform === 'win32'
        ? {
            pollIntervalMs: 25,
            gracefulTimeoutMs: 800,
            killWaitMs: 200,
            kill: (p, sig) => {
              signals.push(sig);
              if (sig === 'SIGTERM') {
                fs.writeFileSync(triggerFilePath, '1', 'utf8');
                return;
              }
              process.kill(p, sig);
            },
          }
        : {
            pollIntervalMs: 25,
            gracefulTimeoutMs: 800,
            killWaitMs: 200,
            kill: (p, sig) => {
              signals.push(sig);
              process.kill(p, sig);
            },
          };

    const startedAt = Date.now();
    const unRes = await installTool.uninstallPlugin({
      targetDir,
      hostConfigDir,
      noCdp: true,
      syncShortcuts: false,
      purgeData: true,
      daemonStopOpts,
    });
    const elapsedMs = Date.now() - startedAt;

    assert.equal(unRes.ok, true);
    assert.equal(unRes.stoppedPid, child.pid);
    assert.deepEqual(signals, ['SIGTERM'], 'gracefully exiting daemon must not require SIGKILL escalation');
    assert.equal(fs.existsSync(flushMarkerPath), true, 'slow daemon must have executed its shutdown flush before uninstall finished');
    assert.ok(elapsedMs >= 140, `uninstallPlugin must wait for daemon exit instead of racing ahead (${elapsedMs}ms)`);
    assert.equal(fs.existsSync(usageCachePath), false, 'usage rollup cache flushed during daemon shutdown must be purged cleanly');

    // Wait past any possible late flush and verify cache never resurrects
    await new Promise((r) => setTimeout(r, 250));
    assert.equal(childExited, true, 'slow daemon child process must have exited');
    assert.equal(fs.existsSync(usageCachePath), false, 'usage rollup cache must NOT resurrect after --purge-data');

    // 2) Stubborn process ignoring graceful SIGTERM must escalate to SIGKILL after timeout and exit cleanly
    const stubbornScript = `
      const fs = require('node:fs');
      process.on('SIGTERM', () => {});
      setInterval(() => {}, 1000);
      fs.writeFileSync(process.argv[1], '1', 'utf8');
    `;
    const stubborn = spawn(process.execPath, ['-e', stubbornScript, stubbornReadyPath], {
      stdio: 'ignore',
      windowsHide: true,
    });
    spawnedChildren.push(stubborn);
    await waitForChildReady(stubbornReadyPath, stubborn);
    const stubbornSignals = [];
    const termRes = await installTool.terminatePidAndWait(stubborn.pid, {
      pollIntervalMs: 25,
      gracefulTimeoutMs: 120,
      killWaitMs: 400,
      kill: (p, sig) => {
        stubbornSignals.push(sig);
        if (process.platform === 'win32' && sig === 'SIGTERM') {
          // Simulate POSIX process ignoring SIGTERM
          return;
        }
        process.kill(p, sig);
      },
    });
    assert.deepEqual(stubbornSignals, ['SIGTERM', 'SIGKILL'], 'must escalate to SIGKILL after graceful timeout');
    assert.equal(termRes.signaled, true);
    assert.equal(termRes.escalated, true);
    assert.equal(termRes.exited, true);
  } finally {
    for (const c of spawnedChildren) {
      try {
        process.kill(c.pid, 'SIGKILL');
      } catch {}
    }
    fs.rmSync(rootTmp, { recursive: true, force: true });
  }
});

test('remove.js and tools/install-plugin.cjs preserve addons/ on default uninstall, purge addons/ on --purge-data, and refuse symlink/hijacked addons/', async () => {
  const removeTool = require('../remove.js');
  const rootTmp = mkTempDir('prism-u-addons-');
  const prevAddonsEnv = process.env.AG_PRISM_ADDONS_DIR;
  try {
    const geminiDir = path.join(rootTmp, '.gemini');
    const hostConfigDir = path.join(geminiDir, 'config');
    const targetDir = path.join(hostConfigDir, 'plugins', 'obsidian-prism');
    const addonsDir = path.join(geminiDir, 'antigravity', 'sidecar_data', 'obsidian-prism', 'addons');
    const demoAddonDir = path.join(addonsDir, 'demo-ext');
    const outsideVictim = path.join(rootTmp, 'outside-victim');
    const evilWorkspace = path.join(rootTmp, 'evil-workspace');

    for (const d of [hostConfigDir, targetDir, demoAddonDir, outsideVictim, evilWorkspace]) {
      fs.mkdirSync(d, { recursive: true });
    }
    fs.writeFileSync(path.join(demoAddonDir, 'index.js'), 'export const a = 1;\n', 'utf8');
    fs.writeFileSync(path.join(outsideVictim, 'keep.txt'), 'keep-outside', 'utf8');
    fs.writeFileSync(path.join(evilWorkspace, 'keep.txt'), 'keep-evil', 'utf8');

    // 1) tools/install-plugin.cjs 默认卸载（purgeData: false）必须保留 addons/
    const unKeep = await installTool.uninstallPlugin({
      targetDir,
      hostConfigDir,
      noCdp: true,
      syncShortcuts: false,
      purgeData: false,
    });
    assert.equal(unKeep.ok, true);
    assert.equal(fs.existsSync(path.join(demoAddonDir, 'index.js')), true, 'Default uninstall must preserve addons/');

    // 2) 恶意 AG_PRISM_ADDONS_DIR 与恶意 explicitAddonsDir 参数均必须被对称拒绝
    process.env.AG_PRISM_ADDONS_DIR = evilWorkspace;
    assert.equal(installTool.resolveAddonsDir(hostConfigDir), null);
    assert.equal(installTool.resolveAddonsDir(hostConfigDir, evilWorkspace), null);
    assert.equal(removeTool.resolveSafeAddonsDir(hostConfigDir, geminiDir, evilWorkspace), null);
    delete process.env.AG_PRISM_ADDONS_DIR;

    // 3) tools/install-plugin.cjs --purge-data 清理 addons/
    fs.mkdirSync(targetDir, { recursive: true });
    const unPurge = await installTool.uninstallPlugin({
      targetDir,
      hostConfigDir,
      noCdp: true,
      syncShortcuts: false,
      purgeData: true,
    });
    assert.equal(unPurge.ok, true);
    assert.equal(fs.existsSync(addonsDir), false, '--purge-data must remove sidecar_data/obsidian-prism/addons');
    assert.equal(fs.readFileSync(path.join(evilWorkspace, 'keep.txt'), 'utf8'), 'keep-evil');

    // 3b) tools/install-plugin.cjs 单独传入 purgeAddons: true 且支持合法 AG_PRISM_ADDONS_DIR 覆盖
    const customAddonsDir = path.join(rootTmp, 'obsidian-prism', 'addons');
    fs.mkdirSync(path.join(customAddonsDir, 'ext-a'), { recursive: true });
    fs.writeFileSync(path.join(customAddonsDir, 'ext-a', 'a.js'), '1', 'utf8');
    process.env.AG_PRISM_ADDONS_DIR = customAddonsDir;
    assert.equal(installTool.resolveAddonsDir(hostConfigDir), path.resolve(customAddonsDir));
    fs.mkdirSync(targetDir, { recursive: true });
    const unPurgeAddonsOnly = await installTool.uninstallPlugin({
      targetDir,
      hostConfigDir,
      noCdp: true,
      syncShortcuts: false,
      purgeData: false,
      purgeAddons: true,
    });
    assert.equal(unPurgeAddonsOnly.ok, true);
    assert.equal(fs.existsSync(customAddonsDir), false, 'purgeAddons: true must clean valid AG_PRISM_ADDONS_DIR');
    delete process.env.AG_PRISM_ADDONS_DIR;

    // 4) remove.js purgeUserPluginData 清理 addons/
    fs.mkdirSync(demoAddonDir, { recursive: true });
    fs.writeFileSync(path.join(demoAddonDir, 'index.js'), 'export const b = 2;\n', 'utf8');
    const purgedByRemove = removeTool.purgeUserPluginData({ hostConfigDir });
    assert.equal(fs.existsSync(addonsDir), false, 'remove.js --purge-data must remove addons/');
    assert.ok(purgedByRemove.some((p) => path.resolve(p) === path.resolve(addonsDir)));

    // 5) symlink / junction addons/ 必须被 remove.js 和 tools/install-plugin.cjs 双向拒绝删除，且绝不破坏外部目标
    const linkType = process.platform === 'win32' ? 'junction' : 'dir';
    fs.symlinkSync(outsideVictim, addonsDir, linkType);

    const purgedSymRemove = removeTool.purgeUserPluginData({ hostConfigDir });
    assert.equal(purgedSymRemove.some((p) => path.resolve(p) === path.resolve(addonsDir)), false);
    assert.equal(fs.readFileSync(path.join(outsideVictim, 'keep.txt'), 'utf8'), 'keep-outside');

    fs.mkdirSync(targetDir, { recursive: true });
    const unSym = await installTool.uninstallPlugin({
      targetDir,
      hostConfigDir,
      noCdp: true,
      syncShortcuts: false,
      purgeData: true,
    });
    assert.equal(unSym.ok, true);
    assert.equal(fs.lstatSync(addonsDir).isSymbolicLink(), true, 'Symlink/junction addons/ must never be deleted');
    assert.equal(fs.readFileSync(path.join(outsideVictim, 'keep.txt'), 'utf8'), 'keep-outside');
  } finally {
    if (prevAddonsEnv === undefined) delete process.env.AG_PRISM_ADDONS_DIR;
    else process.env.AG_PRISM_ADDONS_DIR = prevAddonsEnv;
    fs.rmSync(rootTmp, { recursive: true, force: true });
  }
});

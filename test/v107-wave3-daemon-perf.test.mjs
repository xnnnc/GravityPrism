import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import {
  PrismDaemon,
  discoverActivePort,
  isPluginEnabledInHostConfig,
} from '../sidecars/daemon/main.mjs';
import {
  UpdateService,
  LATEST_RELEASE_API,
  RELEASES_LIST_API,
} from '../sidecars/daemon/update-service.mjs';
import {
  ThoughtTranslatorService,
  detectOsSystemProxy,
  detectOsSystemProxyAsync,
  hashThoughtKey,
  SYSTEM_PROXY_CACHE_TTL_MS,
} from '../vendor/thought-translator/translator-service.mjs';
import { discoverLocalConversations } from '../vendor/pulse-dashboard/sidecars/panel/local-conversations.mjs';
import {
  scanConversationStorage,
  scanConversationStorageAsync,
  saveCatalogIndex,
} from '../sidecars/daemon/conversation-archive.mjs';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const installTool = require(path.join(ROOT, 'tools', 'install-plugin.cjs'));

function mkTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function loadFreshCdp(cdpPath) {
  const resolved = require.resolve(cdpPath);
  delete require.cache[resolved];
  return require(resolved);
}

async function createIsolatedPlugin(prefix) {
  const rootTmp = mkTempDir(prefix);
  const pluginDir = path.join(rootTmp, 'plugin');
  const res = await installTool.installPlugin({
    sourceDir: ROOT,
    targetDir: pluginDir,
    startDaemon: false,
    syncShortcuts: false,
  });
  assert.equal(res.ok, true);
  const cdpPath = path.join(pluginDir, 'cdp.js');
  return {
    rootTmp,
    pluginDir,
    cdpPath,
    cleanup() {
      try {
        delete require.cache[require.resolve(cdpPath)];
      } catch {}
      fs.rmSync(rootTmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    },
  };
}

function mutateSameLengthSameMtime(filePath, mutator) {
  const st = fs.statSync(filePath);
  const orig = fs.readFileSync(filePath, 'utf8');
  const next = mutator(orig);
  assert.notEqual(next, orig, `Expected mutation on ${path.basename(filePath)} to change content`);
  assert.equal(
    Buffer.byteLength(next, 'utf8'),
    Buffer.byteLength(orig, 'utf8'),
    `Expected same byte length on ${path.basename(filePath)}`
  );
  fs.writeFileSync(filePath, next, 'utf8');
  fs.utimesSync(filePath, st.atime, st.mtime);
}

test('Wave3 P1-4b: readConfig mtimeMs:size cache, shallow-copy isolation, writeConfig immediate invalidation & missing/corrupt fallback', async () => {
  const snap = await createIsolatedPlugin('prism-w3-readcfg-');
  const origReadFileSync = fs.readFileSync;
  try {
    const cdp = loadFreshCdp(snap.cdpPath);
    const cfgPath = path.resolve(cdp.CONFIG_FILE);

    cdp.writeConfig({ ...cdp.DEFAULT_CONFIG, palette: 'warm' });

    let cfgReads = 0;
    fs.readFileSync = function spyReadFileSync(p, ...rest) {
      if (typeof p === 'string' && path.resolve(p) === cfgPath) cfgReads += 1;
      return origReadFileSync.call(this, p, ...rest);
    };

    // First read hits disk; subsequent reads hit cache (0 readFileSync) and return shallow copies
    const c1 = cdp.readConfig();
    assert.equal(c1.palette, 'warm');
    assert.equal(cfgReads, 1);

    c1.palette = 'mutated-by-caller';
    const c2 = cdp.readConfig();
    const c3 = cdp.readConfig();
    assert.equal(c2.palette, 'warm', 'Caller mutation must never pollute readConfig cache');
    assert.equal(c3.palette, 'warm');
    assert.equal(cfgReads, 1, 'Cached readConfig must avoid repeated fs.readFileSync calls');

    // Same-millisecond writeConfig with EXACT same byte length ('warm' -> 'host') invalidates cache immediately
    cdp.writeConfig({ ...cdp.DEFAULT_CONFIG, palette: 'host' });
    const c4 = cdp.readConfig();
    assert.equal(c4.palette, 'host', 'writeConfig must invalidate cache immediately even within same millisecond');
    assert.equal(cfgReads, 2);

    // PrismDaemon.updateConfigBatch also invalidates cdp config cache immediately
    const daemon = new PrismDaemon({ rootDir: snap.pluginDir, silent: true, enableAutoUpdateTimer: false });
    daemon.cdp = cdp;
    assert.equal(daemon.updateConfigBatch({ palette: 'warm' }), true);
    const c5 = cdp.readConfig();
    assert.equal(c5.palette, 'warm', 'updateConfigBatch must invalidate cdp readConfig cache');
    assert.equal(cfgReads, 3);

    // Corrupt JSON clears cache & falls back to DEFAULT_CONFIG
    fs.writeFileSync(cfgPath, '{invalid-json', 'utf8');
    const cCorrupt = cdp.readConfig();
    assert.equal(cCorrupt.palette, cdp.DEFAULT_CONFIG.palette);

    // Missing file clears cache & falls back to DEFAULT_CONFIG
    fs.unlinkSync(cfgPath);
    const cMissing = cdp.readConfig();
    assert.equal(cMissing.palette, cdp.DEFAULT_CONFIG.palette);
    await daemon.stop(false);
  } finally {
    fs.readFileSync = origReadFileSync;
    snap.cleanup();
  }
});

test('Wave3 P1-4a: _hasSafeV2SidebarClientFile skips disk when sidebarStudio=off, caches mtimeMs:size, and single-pass cfg reuse in rebuildBundle & _verifyAndHealEntryUnlocked', async () => {
  const snap = await createIsolatedPlugin('prism-w3-sidebar-off-');
  const origReadFileSync = fs.readFileSync;
  try {
    const daemon = new PrismDaemon({
      rootDir: snap.pluginDir,
      bundleCachePath: false,
      silent: true,
      enableAutoUpdateTimer: false,
    });
    const sidebarClientPath = path.resolve(snap.pluginDir, 'vendor', 'sidebar-studio', 'sidebar-client.js');
    assert.equal(fs.existsSync(sidebarClientPath), true);

    let sidebarFileReads = 0;
    fs.readFileSync = function spySidebarRead(p, ...rest) {
      if (typeof p === 'string' && path.resolve(p) === sidebarClientPath) sidebarFileReads += 1;
      return origReadFileSync.call(this, p, ...rest);
    };

    let readConfigCalls = 0;
    const origReadConfig = daemon.cdp.readConfig;
    daemon.cdp = {
      ...daemon.cdp,
      readConfig() {
        readConfigCalls += 1;
        return origReadConfig();
      },
    };

    // 1) rebuildBundle reads config ONCE and skips sidebar-client.js when sidebarStudio is off (default)
    daemon.rebuildBundle();
    assert.equal(readConfigCalls, 1, 'rebuildBundle must read config at most once per pass');
    assert.equal(sidebarFileReads, 0, 'rebuildBundle must not read sidebar-client.js when sidebarStudio=off');

    // 2) _verifyAndHealEntryUnlocked skips sidebar-client.js when sidebarStudio=off and reads config ONCE
    readConfigCalls = 0;
    const mockEntry = {
      wsUrl: 'ws://127.0.0.1:9999/page/1',
      title: 'Antigravity',
      url: 'vscode-file://vscode-app/workbench.html',
      mainFrameId: 'F1',
      hasFrameTree: true,
      contextFrames: new Map([[1, { frameId: 'F1', isDefault: true, type: 'default', docGen: 0 }]]),
      sidebarDocument: 0,
      sidebarHostVerified: true,
      sidebarScriptId: null,
      sidebarMounted: false,
      sidebarBindingAdded: false,
      omniScriptId: 'o1',
      lastOmniExpr: 'ok',
      hostI18nScriptId: 'h1',
      hostI18nMounted: true,
      thoughtScriptId: null,
      thoughtMounted: false,
      lastVerifyAt: 0,
      healthyStreak: 0,
      verifyDirty: true,
      lastVerifiedCodeHash: daemon.codeHash,
      session: {
        closed: false,
        async send() { return {}; },
        async evaluate() {
          return {
            ready: true,
            isHostDom: true,
            href: 'vscode-file://vscode-app/workbench.html',
            prismAttr: daemon.cdp.PLUGIN_VERSION,
            hasPrism: true,
            hasRepoBridge: true,
            hasThoughtBridge: true,
            hasUsageBridge: true,
            hasOmniBridge: true,
            hasOmniServerMeta: true,
            hasOmni: true,
            omniMode: 'on',
            hasSidebarBridge: false,
            hasSidebar: false,
            sidebarMode: 'off',
            hasHostI18n: true,
            hasThought: false,
            hasThoughtSettingsUi: false,
            codeHash: daemon.codeHash,
            hasLegacyCss: false,
            needsDashboardSync: false,
          };
        },
        close() { this.closed = true; },
      },
    };

    const verifyRes = await daemon._verifyAndHealEntryUnlocked(mockEntry, true);
    assert.equal(verifyRes.alive, true);
    assert.equal(sidebarFileReads, 0, 'Default sidebarStudio=off must perform 0 disk reads on sidebar-client.js');
    assert.equal(readConfigCalls, 1, '_verifyAndHealEntryUnlocked must read config only once per pass');

    // 3) Direct _hasSafeV2SidebarClientFile caches mtimeMs:size and invalidates on file change
    assert.equal(daemon._hasSafeV2SidebarClientFile(), true);
    assert.equal(daemon._hasSafeV2SidebarClientFile(), true);
    assert.equal(daemon._hasSafeV2SidebarClientFile(), true);
    assert.equal(sidebarFileReads, 1, '_hasSafeV2SidebarClientFile must cache by mtimeMs:size');

    // Mutate to unsafe content -> cache misses and rejects
    fs.writeFileSync(sidebarClientPath, '// SIDEBAR_STUDIO_CLIENT_V2\nsetPrefValue("bad", 1);\n', 'utf8');
    assert.equal(daemon._hasSafeV2SidebarClientFile(), false, 'Mutated unsafe sidebar-client.js must invalidate cache and fail safety check');
    assert.equal(sidebarFileReads, 2);

    await daemon.stop(false);
  } finally {
    fs.readFileSync = origReadFileSync;
    snap.cleanup();
  }
});

test('Wave3 P1-6b & P2-7a: Channel 2~5 share .bundle-cache.json, detect same-length/same-mtime edits, fail-open on tampering, and defer warm-base-hit SHA-256', async () => {
  const snap = await createIsolatedPlugin('prism-w3-ch25-cache-');
  const cacheDir = path.join(snap.rootTmp, 'shared-cache');
  const cachePath = path.join(cacheDir, '.bundle-cache.json');
  const prevEnv = process.env.AG_PRISM_BUNDLE_CACHE_PATH;
  try {
    delete process.env.AG_PRISM_BUNDLE_CACHE_PATH;

    // 0) Never write .bundle-cache.json when cachePath is omitted (repo/test safety)
    const cdpNoCache = loadFreshCdp(snap.cdpPath);
    cdpNoCache.buildOmniClientExpression(null);
    cdpNoCache.buildSidebarStudioExpression(null);
    cdpNoCache.buildHostI18nExpression({ ...cdpNoCache.DEFAULT_CONFIG, hostLocalization: 'on' });
    cdpNoCache.buildThoughtExpression({ ...cdpNoCache.DEFAULT_CONFIG, thoughtTranslate: 'ai' });
    cdpNoCache.buildInlineDiffInjectExpression(cdpNoCache.DEFAULT_CONFIG);
    cdpNoCache.buildSettingsChannelExpression(null);
    cdpNoCache.buildMascotChannelExpression({ ...cdpNoCache.DEFAULT_CONFIG, mascot: 'crab' });
    cdpNoCache.buildHomeStudioChannelExpression({ ...cdpNoCache.DEFAULT_CONFIG, homeLayout: 'studio' });
    assert.equal(fs.existsSync(path.join(snap.pluginDir, '.bundle-cache.json')), false);

    // 1) Cold compile all channels (incl. Ch8 periodicPicker, Ch9 settings, Ch10 mascot, Ch12 homeStudio) into the single shared .bundle-cache.json
    const cdpCold = loadFreshCdp(snap.cdpPath);
    const ch1Cold = cdpCold.buildInjectExpression(cdpCold.DEFAULT_CONFIG, { cachePath, deferCacheWrite: true });

    const tCold0 = performance.now();
    const omniCold = cdpCold.buildOmniClientExpression({ baseUrl: 'http://127.0.0.1:43123', token: 't1' }, null, {
      cachePath,
      deferCacheWrite: true,
    });
    const sidebarCold = cdpCold.buildSidebarStudioExpression({ binding: '__agPrismSidebarCall' }, null, {
      cachePath,
      deferCacheWrite: true,
    });
    const hostI18nCold = cdpCold.buildHostI18nExpression(
      { ...cdpCold.DEFAULT_CONFIG, hostLocalization: 'on' },
      null,
      { cachePath, deferCacheWrite: true }
    );
    const thoughtCold = cdpCold.buildThoughtExpression(
      { ...cdpCold.DEFAULT_CONFIG, thoughtTranslate: 'ai' },
      { cachePath, deferCacheWrite: true }
    );
    const inlineDiffCold = cdpCold.buildInlineDiffInjectExpression(
      cdpCold.DEFAULT_CONFIG,
      { cachePath, deferCacheWrite: true }
    );
    const periodicPickerCold = cdpCold.buildPeriodicPickerExpression(
      { ...cdpCold.DEFAULT_CONFIG, periodicModelPicker: 'on' },
      { cachePath, deferCacheWrite: true }
    );
    const settingsCold = cdpCold.buildSettingsChannelExpression(null, {
      cachePath,
      deferCacheWrite: true,
    });
    const mascotCold = cdpCold.buildMascotChannelExpression(
      { ...cdpCold.DEFAULT_CONFIG, mascot: 'crab' },
      { cachePath, deferCacheWrite: true }
    );
    const homeStudioCold = cdpCold.buildHomeStudioChannelExpression(
      { ...cdpCold.DEFAULT_CONFIG, homeLayout: 'studio' },
      { cachePath, deferCacheWrite: true }
    );
    const coldMs = performance.now() - tCold0;

    // Deferred writes have not hit disk yet
    assert.equal(fs.existsSync(cachePath), false, 'deferCacheWrite must hold writes until flushPendingBundleCache');
    assert.equal(cdpCold.getBundleCacheStats().deferredExprHashRuns, 0);

    // Single atomic flush writes Channel 1 + Channel 2~6 + Channel 8~10 + Channel 12 into ONE .bundle-cache.json
    assert.equal(cdpCold.flushPendingBundleCache(), true);
    assert.deepEqual(fs.readdirSync(cacheDir), ['.bundle-cache.json'], 'Must reuse ONE .bundle-cache.json with zero extra files');
    assert.equal(cdpCold.getBundleCacheStats().diskWrites, 1);
    assert.equal(cdpCold.getBundleCacheStats().deferredExprHashRuns, 1);
    assert.equal(cdpCold.getBundleCacheStats().channelCompileRuns, 9);

    const parsed = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    assert.equal(parsed.schemaVersion, cdpCold.BUNDLE_CACHE_SCHEMA_VERSION);
    assert.ok(parsed.channels && typeof parsed.channels === 'object');
    for (const ch of ['omni', 'sidebar', 'hostI18n', 'thought', 'inlineDiff', 'periodicPicker', 'settings', 'mascot', 'homeStudio']) {
      assert.ok(parsed.channels[ch], `Expected channels.${ch} in .bundle-cache.json`);
      assert.match(parsed.channels[ch].sourceHash, /^[0-9a-f]{64}$/);
      assert.match(parsed.channels[ch].payloadSha256, /^[0-9a-f]{64}$/);
    }

    // 2) Fresh cold reload hits all cached channels byte-identically with 0 channel compilation and ONLY 1 readFileSync + 1 JSON.parse
    const origReadFileSync = fs.readFileSync;
    const origJsonParse = JSON.parse;
    const resolvedCachePath = path.resolve(cachePath);
    let cacheFileReads = 0;
    let cacheJsonParses = 0;
    const cdpHit = loadFreshCdp(snap.cdpPath);
    let ch1Hit;
    let omniHit;
    let sidebarHit;
    let hostI18nHit;
    let thoughtHit;
    let inlineDiffHit;
    let periodicPickerHit;
    let settingsHit;
    let mascotHit;
    let homeStudioHit;
    let hitMs = 0;
    fs.readFileSync = function spyCacheRead(p, ...rest) {
      if (typeof p === 'string' && path.resolve(p) === resolvedCachePath) {
        cacheFileReads += 1;
      }
      return origReadFileSync.call(this, p, ...rest);
    };
    JSON.parse = function spyJsonParse(text, ...rest) {
      if (typeof text === 'string' && text.includes('"schemaVersion"') && text.includes('"basePrefix"')) {
        cacheJsonParses += 1;
      }
      return origJsonParse.call(this, text, ...rest);
    };
    try {
      ch1Hit = cdpHit.buildInjectExpression(cdpHit.DEFAULT_CONFIG, { cachePath });
      assert.equal(ch1Hit, ch1Cold);

      const tHit0 = performance.now();
      omniHit = cdpHit.buildOmniClientExpression({ baseUrl: 'http://127.0.0.1:43123', token: 't1' }, null, { cachePath });
      sidebarHit = cdpHit.buildSidebarStudioExpression({ binding: '__agPrismSidebarCall' }, null, { cachePath });
      hostI18nHit = cdpHit.buildHostI18nExpression({ ...cdpHit.DEFAULT_CONFIG, hostLocalization: 'on' }, null, { cachePath });
      thoughtHit = cdpHit.buildThoughtExpression({ ...cdpHit.DEFAULT_CONFIG, thoughtTranslate: 'ai' }, { cachePath });
      inlineDiffHit = cdpHit.buildInlineDiffInjectExpression(cdpHit.DEFAULT_CONFIG, { cachePath });
      periodicPickerHit = cdpHit.buildPeriodicPickerExpression({ ...cdpHit.DEFAULT_CONFIG, periodicModelPicker: 'on' }, { cachePath });
      settingsHit = cdpHit.buildSettingsChannelExpression(null, { cachePath });
      mascotHit = cdpHit.buildMascotChannelExpression({ ...cdpHit.DEFAULT_CONFIG, mascot: 'crab' }, { cachePath });
      homeStudioHit = cdpHit.buildHomeStudioChannelExpression({ ...cdpHit.DEFAULT_CONFIG, homeLayout: 'studio' }, { cachePath });
      hitMs = performance.now() - tHit0;
    } finally {
      fs.readFileSync = origReadFileSync;
      JSON.parse = origJsonParse;
    }

    assert.equal(cacheFileReads, 1, 'Multi-channel cold reload must execute fs.readFileSync on .bundle-cache.json exactly once');
    assert.equal(cacheJsonParses, 1, 'Multi-channel cold reload must execute JSON.parse on .bundle-cache.json exactly once');
    assert.equal(omniHit, omniCold);
    assert.equal(sidebarHit, sidebarCold);
    assert.equal(hostI18nHit, hostI18nCold);
    assert.equal(thoughtHit, thoughtCold);
    assert.equal(inlineDiffHit, inlineDiffCold);
    assert.equal(periodicPickerHit, periodicPickerCold);
    assert.equal(settingsHit, settingsCold);
    assert.equal(mascotHit, mascotCold);
    assert.equal(homeStudioHit, homeStudioCold);

    const hitStats = cdpHit.getBundleCacheStats();
    assert.equal(hitStats.diskHits, 1);
    assert.equal(hitStats.compileUnifiedRuns, 0);
    assert.equal(hitStats.channelDiskHits, 9);
    assert.equal(hitStats.channelCompileRuns, 0);
    assert.deepEqual(hitStats.channelHitsByName, { omni: 1, sidebar: 1, hostI18n: 1, thought: 1, inlineDiff: 1, wallpaper: 0, periodicPicker: 1, settings: 1, mascot: 1, suggester: 0, homeStudio: 1 });
    assert.ok(hitMs < coldMs, `Expected Channel 2~6 + 8~10 + 12 cache hit (${hitMs.toFixed(1)}ms) faster than cold compile (${coldMs.toFixed(1)}ms)`);

    // 3) P2-7a: Repeated warm-base-hit config updates defer 676KB exprSha256 until actual flush
    cdpHit.resetBundleCacheStats();
    const warmPalettes = ['warm', 'claude', 'host', 'obsidian', 'warm'];
    let lastWarmExpr = '';
    for (const palette of warmPalettes) {
      lastWarmExpr = cdpHit.buildInjectExpression(
        { ...cdpHit.DEFAULT_CONFIG, palette },
        { cachePath, deferCacheWrite: true }
      );
    }
    const beforeFlushStats = cdpHit.getBundleCacheStats();
    assert.equal(beforeFlushStats.lastOutcome, 'warm-base-hit');
    assert.equal(beforeFlushStats.diskBaseHits, warmPalettes.length);
    assert.equal(beforeFlushStats.diskWrites, 0);
    assert.equal(beforeFlushStats.deferredExprHashRuns, 0, 'Must NOT compute 676KB exprSha256 during debounce window');

    assert.equal(cdpHit.flushPendingBundleCache(), true);
    const afterFlushStats = cdpHit.getBundleCacheStats();
    assert.equal(afterFlushStats.diskWrites, 1);
    assert.equal(afterFlushStats.deferredExprHashRuns, 1, 'Must compute exprSha256 exactly once upon flush');

    const cdpWarmReload = loadFreshCdp(snap.cdpPath);
    const warmReloaded = cdpWarmReload.buildInjectExpression(
      { ...cdpWarmReload.DEFAULT_CONFIG, palette: 'warm' },
      { cachePath }
    );
    assert.equal(warmReloaded, lastWarmExpr);
    assert.equal(cdpWarmReload.getBundleCacheStats().diskHits, 1);

    // 4) Same-length, same-mtime 1-byte source edits invalidate each channel cleanly via SHA-256
    const omniPath = path.join(snap.pluginDir, 'vendor', 'omni-viewer', 'omni-client.js');
    const sidebarPath = path.join(snap.pluginDir, 'vendor', 'sidebar-studio', 'sidebar-client.js');
    const hostDictPath = path.join(snap.pluginDir, 'vendor', 'host-i18n', 'zh-CN.json');
    const thoughtClientPath = path.join(snap.pluginDir, 'vendor', 'thought-translator', 'thought-client.js');

    const flipFirstAsciiInLiteral = (src) => {
      const idx = src.indexOf('window');
      assert.ok(idx >= 0);
      // Flip a safe comment or string character of identical byte length
      const m = /'([a-z]{4,})'/.exec(src);
      assert.ok(m, 'Expected single-quoted ascii literal to mutate');
      const word = m[1];
      const nextFirst = word[0] === 'a' ? 'b' : 'a';
      return src.slice(0, m.index + 1) + nextFirst + word.slice(1) + src.slice(m.index + 1 + word.length);
    };

    mutateSameLengthSameMtime(omniPath, flipFirstAsciiInLiteral);
    mutateSameLengthSameMtime(sidebarPath, flipFirstAsciiInLiteral);
    mutateSameLengthSameMtime(hostDictPath, (raw) => {
      const idx = raw.indexOf('Settings');
      assert.ok(idx >= 0, 'Expected Settings key in zh-CN.json');
      return raw.slice(0, idx) + 'Settin9s' + raw.slice(idx + 8);
    });
    mutateSameLengthSameMtime(thoughtClientPath, flipFirstAsciiInLiteral);

    // Same process (cdpHit) MUST invalidate via SHA-256 even though mtime & byte length are identical!
    cdpHit.resetBundleCacheStats();
    const omniAfter = cdpHit.buildOmniClientExpression({ baseUrl: 'http://127.0.0.1:43123', token: 't1' }, null, { cachePath });
    const sidebarAfter = cdpHit.buildSidebarStudioExpression({ binding: '__agPrismSidebarCall' }, null, { cachePath });
    const hostI18nAfter = cdpHit.buildHostI18nExpression({ ...cdpHit.DEFAULT_CONFIG, hostLocalization: 'on' }, null, { cachePath });
    const thoughtAfter = cdpHit.buildThoughtExpression({ ...cdpHit.DEFAULT_CONFIG, thoughtTranslate: 'ai' }, { cachePath });

    assert.notEqual(omniAfter, omniCold, 'Channel 2 must invalidate on same-length/same-mtime 1-byte change');
    assert.notEqual(sidebarAfter, sidebarCold, 'Channel 3 must invalidate on same-length/same-mtime 1-byte change');
    assert.notEqual(hostI18nAfter, hostI18nCold, 'Channel 4 must invalidate on same-length/same-mtime 1-byte change');
    assert.notEqual(thoughtAfter, thoughtCold, 'Channel 5 must invalidate on same-length/same-mtime 1-byte change');
    assert.equal(cdpHit.getBundleCacheStats().channelDiskHits, 0);
    assert.equal(cdpHit.getBundleCacheStats().channelCompileRuns, 4);

    // 5) Tampering channels.omni in .bundle-cache.json gracefully Fail-Opens and self-heals
    const objForTamper = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    objForTamper.channels.omni.minCode = `${objForTamper.channels.omni.minCode}/*evil*/`;
    fs.writeFileSync(cachePath, JSON.stringify(objForTamper), 'utf8');

    const cdpTamper = loadFreshCdp(snap.cdpPath);
    const omniHealed = cdpTamper.buildOmniClientExpression({ baseUrl: 'http://127.0.0.1:43123', token: 't1' }, null, { cachePath });
    assert.equal(omniHealed, omniAfter);
    assert.equal(cdpTamper.getBundleCacheStats().channelDiskHits, 0);
    assert.equal(cdpTamper.getBundleCacheStats().channelCompileRuns, 1);
  } finally {
    if (prevEnv === undefined) delete process.env.AG_PRISM_BUNDLE_CACHE_PATH;
    else process.env.AG_PRISM_BUNDLE_CACHE_PATH = prevEnv;
    snap.cleanup();
  }
});

test('Wave3 P1-5, P1-6c & P2-5: file caches, logBytes counter, tick() /json/list throttle, shortcut backoff & unified process probe', async () => {
  const snap = await createIsolatedPlugin('prism-w3-daemon-idle-');
  const origReadFileSync = fs.readFileSync;
  const origStatSync = fs.statSync;
  let dummyChild = null;
  try {
    // 1) discoverActivePort & isPluginEnabledInHostConfig mtimeMs:size cache + immediate perception of edits/deletes
    const portFile = path.join(snap.rootTmp, 'DevToolsActivePort');
    const hostCfgFile = path.join(snap.rootTmp, 'host-config.json');
    fs.writeFileSync(portFile, '9222\n/devtools/browser/abc\n', 'utf8');
    fs.writeFileSync(hostCfgFile, JSON.stringify({ plugins: { 'obsidian-prism': { enabled: true } } }), 'utf8');

    let portReads = 0;
    let hostCfgReads = 0;
    const prevEnvPort = process.env.AG_CDP_PORT;
    delete process.env.AG_CDP_PORT;

    fs.readFileSync = function spyFiles(p, ...rest) {
      if (typeof p === 'string') {
        const rp = path.resolve(p);
        if (rp === path.resolve(portFile)) portReads += 1;
        if (rp === path.resolve(hostCfgFile)) hostCfgReads += 1;
      }
      return origReadFileSync.call(this, p, ...rest);
    };

    try {
      assert.equal(discoverActivePort(null, portFile), 9222);
      assert.equal(discoverActivePort(null, portFile), 9222);
      assert.equal(discoverActivePort(null, portFile), 9222);
      assert.equal(portReads, 1, 'discoverActivePort must cache by mtimeMs:size');

      // Update port file -> immediately perceived
      fs.writeFileSync(portFile, '19333\n/devtools/browser/def\n', 'utf8');
      assert.equal(discoverActivePort(null, portFile), 19333);
      assert.equal(portReads, 2);

      fs.unlinkSync(portFile);
      assert.equal(discoverActivePort(null, portFile), null);

      assert.equal(isPluginEnabledInHostConfig(hostCfgFile), true);
      assert.equal(isPluginEnabledInHostConfig(hostCfgFile), true);
      assert.equal(hostCfgReads, 1, 'isPluginEnabledInHostConfig must cache by mtimeMs:size');

      fs.writeFileSync(hostCfgFile, JSON.stringify({ plugins: { 'obsidian-prism': { enabled: false } } }), 'utf8');
      assert.equal(isPluginEnabledInHostConfig(hostCfgFile), false);
      assert.equal(hostCfgReads, 2);
    } finally {
      fs.readFileSync = origReadFileSync;
      if (prevEnvPort !== undefined) process.env.AG_CDP_PORT = prevEnvPort;
    }

    // 2) isCurrentOwner cache + log() memory logBytes tracking (0 statSync after init, rotates > 512 KiB)
    const daemon = new PrismDaemon({
      rootDir: snap.pluginDir,
      overridePort: 19222,
      bundleCachePath: false,
      silent: false,
      enableAutoUpdateTimer: false,
      shortcutCheckIntervalMs: 1000,
      shortcutBackoffIntervalMs: 45 * 60 * 1000,
      listPagesFallbackIntervalMs: 12000,
      relaunchHooks: {
        syncShortcuts: () => ({ supported: true, scanned: 1, matched: 1, patched: [], alreadySet: ['A.lnk'], skipped: [] }),
      },
    });
    daemon.claimOwnership();

    let pidReads = 0;
    let logStats = 0;
    const pidResolved = path.resolve(daemon.pidFile);
    const logResolved = path.resolve(daemon.logFile);
    fs.readFileSync = function spyOwnerRead(p, ...rest) {
      if (typeof p === 'string' && path.resolve(p) === pidResolved) pidReads += 1;
      return origReadFileSync.call(this, p, ...rest);
    };
    fs.statSync = function spyLogStat(p, ...rest) {
      if (typeof p === 'string' && path.resolve(p) === logResolved) logStats += 1;
      return origStatSync.call(this, p, ...rest);
    };

    try {
      assert.equal(daemon.isCurrentOwner(), true);
      assert.equal(daemon.isCurrentOwner(), true);
      assert.equal(daemon.isCurrentOwner(), true);
      assert.equal(pidReads, 1, 'isCurrentOwner must cache by mtimeMs:size');

      // Overwrite pidFile with another token -> immediately detects supersede
      fs.writeFileSync(daemon.pidFile, JSON.stringify({ pid: 999999, token: 'other-daemon-token-xxxx' }), 'utf8');
      assert.equal(daemon.isCurrentOwner(), false);
      assert.equal(pidReads, 2);

      // log() stats at most once on first write, then 0 times for subsequent writes + rotates cleanly > 512 KiB
      daemon.log('line-1');
      daemon.log('line-2');
      daemon.log('line-3');
      assert.equal(logStats, 1, 'log() must only statSync once on initialization');
      assert.ok(daemon._logBytes > 0);

      daemon._logBytes = 513 * 1024;
      daemon.log('after-rotate');
      assert.equal(logStats, 1, 'log() rotation must not invoke statSync');
      assert.ok(daemon._logBytes < 1024, 'logBytes must reset after truncation rotation');
      assert.ok(origReadFileSync(daemon.logFile, 'utf8').includes('after-rotate'));
    } finally {
      fs.readFileSync = origReadFileSync;
      fs.statSync = origStatSync;
    }

    // 3) P1-5b: Persistent tick() throttles /json/list when browserSession is subscribed, but manual tick (timer==null) always polls
    daemon.claimOwnership();
    daemon.running = true;
    let listPagesCalls = 0;
    const mockPageUrl = 'ws://127.0.0.1:19222/page/main';
    const mockSession = {
      closed: false,
      async send() { return {}; },
      async evaluate() { return { ready: true, isHostDom: true }; },
      close() { this.closed = true; },
    };
    daemon.sessions.set(mockPageUrl, {
      wsUrl: mockPageUrl,
      pageId: 'p1',
      url: 'vscode-file://vscode-app/workbench.html',
      title: 'Antigravity',
      session: mockSession,
      lastVerifyAt: Date.now(),
      healthyStreak: 3,
      verifyDirty: false,
      lastVerifiedCodeHash: daemon.codeHash || 'h',
      contextFrames: new Map([[1, { frameId: 'F1', isDefault: true, type: 'default' }]]),
      mainFrameId: 'F1',
      thoughtScriptId: null,
      thoughtMounted: false,
      _opChain: Promise.resolve(),
    });
    daemon.codeHash = 'h';
    daemon.injectExpr = 'void 0';
    daemon.cdp = {
      ...daemon.cdp,
      async listPages() {
        listPagesCalls += 1;
        return [
          {
            id: 'p1',
            type: 'page',
            title: 'Antigravity',
            url: 'vscode-file://vscode-app/workbench.html',
            webSocketDebuggerUrl: mockPageUrl,
          },
        ];
      },
    };
    daemon.browserSession = { closed: false, close() { this.closed = true; } };
    daemon.browserPort = 19222;
    daemon._browserDiscoverySubscribed = true;

    // Manual tick (timer == null): ALWAYS polls listPages
    daemon.timer = null;
    await daemon.tick();
    await daemon.tick();
    assert.equal(listPagesCalls, 2, 'Manual tick() with timer==null must always call listPages');

    // Persistent mode (timer != null): throttles /json/list within fallback window
    daemon.timer = setInterval(() => {}, 60000);
    daemon.timer.unref?.();
    const skippedRes = await daemon.tick();
    assert.equal(skippedRes.skippedListPoll, true);
    assert.equal(listPagesCalls, 2, 'Persistent idle tick() must skip /json/list HTTP poll when Target push is active');

    // Target event push forces immediate /json/list on next tick
    daemon._forceListPagesNextTick = true;
    await daemon.tick();
    assert.equal(listPagesCalls, 3, 'Target push must trigger immediate listPages on next tick');

    // Expired fallback window triggers /json/list again
    daemon._lastListPagesAt = Date.now() - 15000;
    await daemon.tick();
    assert.equal(listPagesCalls, 4, 'Expired fallback interval must poll listPages');

    // 4) P1-6c: Shortcut sync backs off to 45 min when all alreadySet + active CDP port, and resets when port disappears
    let syncCount = 0;
    daemon._relaunchHooks = {
      syncShortcuts: () => {
        syncCount += 1;
        return { supported: true, scanned: 2, matched: 2, patched: [], alreadySet: ['a.lnk', 'b.lnk'], skipped: [] };
      },
    };
    daemon._lastShortcutCheckAt = 0;
    daemon._shortcutAllClean = false;
    daemon._hasActiveCdpPort = true;

    daemon._maybeSyncShortcuts(false);
    assert.equal(syncCount, 1);
    assert.equal(daemon._shortcutAllClean, true);

    // Simulate 10 minutes elapsed (> 1s base interval, < 45m backoff) while CDP port is active -> stays backed off
    daemon._lastShortcutCheckAt = Date.now() - 10 * 60 * 1000;
    daemon._maybeSyncShortcuts(false);
    assert.equal(syncCount, 1, 'Clean shortcuts + active CDP port must back off for 30~60 minutes');

    // Simulate active CDP port lost -> immediately resumes normal interval
    daemon._hasActiveCdpPort = false;
    daemon._maybeSyncShortcuts(false);
    assert.equal(syncCount, 2, 'Losing active CDP port must restore normal shortcut check interval');

    // 5) P2-5: Unified inspectProcessSync returns imageName + startTime + commandLine, and stopExistingDaemon calls probe ONCE
    const freshCdp = loadFreshCdp(snap.cdpPath);
    const selfInfo = freshCdp.inspectProcessSync(process.pid);
    assert.ok(selfInfo && selfInfo.pid === process.pid);
    assert.ok(typeof selfInfo.imageName === 'string' && selfInfo.imageName.length > 0);
    assert.equal(typeof selfInfo.commandLine, 'string');
    assert.equal(typeof selfInfo.startTime, 'number');

    dummyChild = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { stdio: 'ignore' });
    const pidDaemon = new PrismDaemon({
      rootDir: snap.pluginDir,
      bundleCachePath: false,
      silent: true,
      enableAutoUpdateTimer: false,
    });
    fs.writeFileSync(
      pidDaemon.pidFile,
      JSON.stringify({ pid: dummyChild.pid, token: 'prev', startedAt: Date.now() }),
      'utf8'
    );

    let probeCalls = 0;
    const killed = [];
    const stoppedUnrelated = pidDaemon.stopExistingDaemon({
      inspectProcess: (pid) => {
        probeCalls += 1;
        return {
          pid,
          imageName: 'node',
          startTime: Date.now(),
          processStartMs: Date.now(),
          commandLine: 'node /app/unrelated.js',
        };
      },
      killProcess: (p) => killed.push(p),
    });
    assert.equal(stoppedUnrelated, false);
    assert.equal(probeCalls, 1, 'stopExistingDaemon must invoke unified process probe only once');
    assert.deepEqual(killed, []);

    probeCalls = 0;
    const stoppedPrism = pidDaemon.stopExistingDaemon({
      inspectProcess: (pid) => {
        probeCalls += 1;
        return {
          pid,
          imageName: 'node',
          startTime: Date.now(),
          processStartMs: Date.now(),
          commandLine: 'node /plugins/obsidian-prism/sidecars/daemon/main.mjs',
        };
      },
      killProcess: (p) => killed.push(p),
    });
    assert.equal(stoppedPrism, true);
    assert.equal(probeCalls, 1, 'stopExistingDaemon must invoke unified process probe only once on match');
    assert.deepEqual(killed, [dummyChild.pid]);

    await daemon.stop(false);
    await pidDaemon.stop(false);
  } finally {
    fs.readFileSync = origReadFileSync;
    fs.statSync = origStatSync;
    if (dummyChild && !dummyChild.killed) {
      try { dummyChild.kill(); } catch {}
    }
    snap.cleanup();
  }
});

test('Wave3 P1-6a & P2-7b: async OS proxy probe deduplicates concurrent calls without blocking event loop, and async first cache load avoids sync readFileSync', async () => {
  const tmpDir = mkTempDir('prism-w3-translator-');
  const origReadFileSync = fs.readFileSync;
  const origPromiseReadFile = fs.promises.readFile;
  try {
    // 1) Sync detectOsSystemProxy export remains intact
    const syncParsed = detectOsSystemProxy({
      platform: 'win32',
      execFileSyncFn: () =>
        '    ProxyEnable    REG_DWORD    0x1\r\n    ProxyServer    REG_SZ    127.0.0.1:7890\r\n',
    });
    assert.equal(syncParsed.enabled, true);
    assert.equal(syncParsed.https?.port, 7890);

    // 2) detectOsSystemProxyAsync + _getCachedOsProxyConfigAsync: in-flight dedup + non-blocking event loop + 30s TTL
    let asyncExecCalls = 0;
    const delayedWinReg = (_file, _args, _opts, cb) => {
      asyncExecCalls += 1;
      setTimeout(() => {
        cb(
          null,
          '    ProxyEnable    REG_DWORD    0x1\r\n    ProxyServer    REG_SZ    http=127.0.0.1:7890;https=127.0.0.1:7891\r\n'
        );
      }, 150);
    };

    const directAsync = await detectOsSystemProxyAsync({ platform: 'win32', execFileFn: delayedWinReg });
    assert.equal(directAsync.enabled, true);
    assert.equal(directAsync.https?.port, 7891);
    assert.equal(asyncExecCalls, 1);

    asyncExecCalls = 0;
    const svc = new ThoughtTranslatorService({
      configDir: tmpDir,
      proxyEnv: {},
      proxyPlatform: 'win32',
      proxyExecFile: delayedWinReg,
    });

    let eventLoopTicks = 0;
    const ticker = setInterval(() => {
      eventLoopTicks += 1;
    }, 10);

    const results = await Promise.all([
      svc._getCachedOsProxyConfigAsync(),
      svc._getCachedOsProxyConfigAsync(),
      svc._getCachedOsProxyConfigAsync(),
      svc._getCachedOsProxyConfigAsync(),
      svc._getCachedOsProxyConfigAsync(),
      svc._getCachedOsProxyConfigAsync(),
    ]);
    clearInterval(ticker);

    assert.equal(asyncExecCalls, 1, '6 concurrent _getCachedOsProxyConfigAsync calls must coalesce into 1 execFile');
    assert.ok(eventLoopTicks >= 3, `Event loop must stay unblocked during async proxy probe (ticks=${eventLoopTicks})`);
    for (const r of results) {
      assert.equal(r.enabled, true);
      assert.equal(r.https?.port, 7891);
    }

    // Subsequent call within 30s TTL hits cache (still 1 execFile call)
    const cachedAgain = await svc._getCachedOsProxyConfigAsync();
    assert.equal(cachedAgain.https?.port, 7891);
    assert.equal(asyncExecCalls, 1);

    // Expired TTL triggers fresh async probe
    svc._proxyCache.ts = Date.now() - SYSTEM_PROXY_CACHE_TTL_MS - 1000;
    const refreshed = await svc._getCachedOsProxyConfigAsync();
    assert.equal(refreshed.https?.port, 7891);
    assert.equal(asyncExecCalls, 2);

    // 3) P2-7b: _ensureCacheLoadedAsync avoids fs.readFileSync on first translateThought and deduplicates concurrent loads
    const thoughtSample = 'Inspecting asynchronous cache hydration behavior without blocking the Node sidecar event loop.';
    const cacheKey = hashThoughtKey(thoughtSample, 'mt');
    const cacheFile = path.join(tmpDir, 'async-thought-cache.json');
    fs.writeFileSync(
      cacheFile,
      JSON.stringify({ version: 1, entries: { [cacheKey]: '正在检查异步缓存预热行为，不阻塞主事件循环。' } }),
      'utf8'
    );

    const svcCache = new ThoughtTranslatorService({
      configDir: tmpDir,
      cacheFile,
      fetchImpl: async () => {
        throw new Error('Should hit disk cache without network');
      },
    });

    let syncCacheReads = 0;
    let asyncCacheReads = 0;
    const resolvedCacheFile = path.resolve(cacheFile);
    fs.readFileSync = function spySyncCache(p, ...rest) {
      if (typeof p === 'string' && path.resolve(p) === resolvedCacheFile) syncCacheReads += 1;
      return origReadFileSync.call(this, p, ...rest);
    };
    fs.promises.readFile = async function spyAsyncCache(p, ...rest) {
      if (typeof p === 'string' && path.resolve(p) === resolvedCacheFile) {
        asyncCacheReads += 1;
        await new Promise((r) => setTimeout(r, 25));
      }
      return origPromiseReadFile.call(this, p, ...rest);
    };

    try {
      const [r1, r2, r3] = await Promise.all([
        svcCache.translateThought({ text: thoughtSample, mode: 'machine' }),
        svcCache.translateThought({ text: thoughtSample, mode: 'machine' }),
        svcCache.translateThought({ text: thoughtSample, mode: 'machine' }),
      ]);
      assert.equal(syncCacheReads, 0, 'Async translateThought must NEVER call sync fs.readFileSync on cacheFile');
      assert.equal(asyncCacheReads, 1, 'Concurrent _ensureCacheLoadedAsync calls must share one in-flight readFile');
      for (const r of [r1, r2, r3]) {
        assert.equal(r.ok, true);
        assert.equal(r.cached, true);
        assert.equal(r.text, '正在检查异步缓存预热行为，不阻塞主事件循环。');
      }

      // Race check: clearCache() during in-flight async load must prevent stale disk entries from resurrecting
      const svcRace = new ThoughtTranslatorService({ configDir: tmpDir, cacheFile });
      const loadProm = svcRace._ensureCacheLoadedAsync();
      svcRace.clearCache();
      await loadProm;
      assert.equal(svcRace.memCache.size, 0, 'clearCache() during in-flight async load must discard stale disk read');
      svcRace.dispose();
    } finally {
      fs.readFileSync = origReadFileSync;
      fs.promises.readFile = origPromiseReadFile;
    }

    svc.dispose();
    svcCache.dispose();
  } finally {
    fs.readFileSync = origReadFileSync;
    fs.promises.readFile = origPromiseReadFile;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Wave3 P2-6a & P2-6b: discoverLocalConversations bounded concurrency + mtimeMs, and scanConversationStorageAsync parity with sync version', async () => {
  const tmpHome = mkTempDir('prism-w3-convs-');
  try {
    const agDir = path.join(tmpHome, '.gemini', 'antigravity');
    const convDir = path.join(agDir, 'conversations');
    const brainDir = path.join(agDir, 'brain');
    const archiveDir = path.join(agDir, 'conversations_archive');
    fs.mkdirSync(convDir, { recursive: true });
    fs.mkdirSync(brainDir, { recursive: true });
    fs.mkdirSync(archiveDir, { recursive: true });

    const now = Date.now();
    const summaries = {};
    const expectedMtimes = new Map();
    const ids = [];

    for (let i = 0; i < 40; i++) {
      const hex = i.toString(16).padStart(12, '0');
      const id = `11111111-2222-4333-8444-${hex}`;
      ids.push(id);
      const dbPath = path.join(convDir, `${id}.db`);
      fs.writeFileSync(dbPath, Buffer.alloc(1024 * ((i % 5) + 1), i & 0xff));
      const mtimeDate = new Date(now - (i + 1) * 3600 * 1000);
      fs.utimesSync(dbPath, mtimeDate, mtimeDate);
      expectedMtimes.set(id, fs.statSync(dbPath).mtimeMs);

      if (i % 2 === 0) {
        fs.writeFileSync(path.join(convDir, `${id}.db-wal`), Buffer.alloc(512, 1));
      }
      if (i % 3 === 0) {
        fs.writeFileSync(path.join(convDir, `${id}.db-shm`), Buffer.alloc(128, 2));
      }
      if (i % 4 === 0) {
        fs.mkdirSync(path.join(brainDir, id), { recursive: true });
      }
      if (i < 32) {
        const isSub = i % 2 === 1;
        summaries[id] = {
          id,
          summary: `Conv #${i}`,
          status: i === 1 ? 'RUNNING' : 'DONE',
          stepCount: i + 1,
          ...(isSub ? { parentConversationId: ids[0], nestingDepth: 1 } : {}),
          lastModifiedTime: { seconds: Math.floor((now - (i + 1) * 86400 * 1000) / 1000) },
        };
      }
    }
    // Non-GUID noise file should be safely ignored
    fs.writeFileSync(path.join(convDir, 'not-a-guid.db'), 'ignored');
    saveCatalogIndex(archiveDir, summaries);

    // 1) P2-6a: discoverLocalConversations returns all 40 with mtimeMs matching disk & stable readSignature
    const disc1 = await discoverLocalConversations({ host: 'app', home: tmpHome });
    const disc2 = await discoverLocalConversations({ host: 'app', home: tmpHome });
    assert.equal(disc1.errors, 0);
    assert.equal(disc1.conversations.length, 40);
    assert.deepEqual(
      disc1.conversations.map((c) => c.id),
      disc2.conversations.map((c) => c.id),
      'Bounded concurrent discovery must preserve deterministic ordering'
    );
    for (const item of disc1.conversations) {
      assert.ok(Number.isFinite(item.mtimeMs) && item.mtimeMs > 0, `Expected positive mtimeMs for ${item.id}`);
      const expected = expectedMtimes.get(item.id);
      assert.ok(Math.abs(item.mtimeMs - expected) < 2, `Expected mtimeMs (${item.mtimeMs}) close to stat (${expected})`);
      assert.equal(await item.readSignature(), item.signature);
    }

    // 2) P2-6b: scanConversationStorageAsync matches sync scanConversationStorage strictly
    const scanOpts = {
      convDir,
      archiveDir,
      subagentMaxAgeHours: 6,
      mainMaxAgeDays: 10,
      keepRecentMain: 4,
      excludeIds: [ids[3]],
      now,
    };
    const syncReport = scanConversationStorage(scanOpts);
    const asyncReport = await scanConversationStorageAsync(scanOpts);
    assert.deepEqual(asyncReport, syncReport, 'scanConversationStorageAsync must produce identical output to sync scanConversationStorage');
    assert.equal(asyncReport.conversationCount, 40);
    assert.equal(asyncReport.mainCount, 16);
    assert.equal(asyncReport.subagentCount, 16);
    assert.equal(asyncReport.unknownCount, 8);
    assert.ok(asyncReport.archivableSubagentCount > 0);
    assert.ok(asyncReport.archivableOldMainCount > 0);

    // Also verify with explicit inline summaries override
    const syncInline = scanConversationStorage({ ...scanOpts, summaries });
    const asyncInline = await scanConversationStorageAsync({ ...scanOpts, summaries });
    assert.deepEqual(asyncInline, syncInline);
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

test('Audit P0-1, P1-4c & P1-5b: inject.js equal-length config write invalidates readConfig cache, autoUpdate boolean normalization, and REMOVE_EXPRESSION fallback cleanup', async () => {
  const snap = await createIsolatedPlugin('prism-audit-fix-');
  const injectPath = path.join(snap.pluginDir, 'inject.js');
  try {
    const cdp = loadFreshCdp(snap.cdpPath);
    delete require.cache[require.resolve(injectPath)];
    const injectMod = require(injectPath);

    // 1) P0-1: inject.js updateConfigBatch uses cdp.writeConfig (atomic replace + invalidateConfigCache)
    cdp.writeConfig({ ...cdp.DEFAULT_CONFIG, palette: 'warm' });
    assert.equal(cdp.readConfig().palette, 'warm');

    // Same-millisecond, EXACT same byte-length update ('warm' -> 'host') must NOT read stale cached config
    assert.equal(injectMod.updateConfigBatch({ palette: 'host' }), true);
    assert.equal(cdp.readConfig().palette, 'host', 'inject.js updateConfigBatch must immediately invalidate readConfig cache');

    assert.equal(injectMod.updateConfigSetting('palette', 'warm'), true);
    assert.equal(cdp.readConfig().palette, 'warm', 'inject.js updateConfigSetting must immediately invalidate readConfig cache');

    const strayConfigTmps = fs
      .readdirSync(snap.pluginDir)
      .filter((n) => n.startsWith('.config.json.') && n.endsWith('.tmp'));
    assert.deepEqual(strayConfigTmps, [], 'Atomic writeConfig must leave zero temporary config files');

    // 2) P1-5b: reconcileConfigAliases aligns boolean autoUpdate & module toggles to 'on'/'off'
    assert.equal(cdp.reconcileConfigAliases({ autoUpdate: true }).autoUpdate, 'on');
    assert.equal(cdp.reconcileConfigAliases({ autoUpdate: false }).autoUpdate, 'off');
    assert.equal(cdp.reconcileConfigAliases({ autoUpdate: 'on' }).autoUpdate, 'on');
    assert.equal(cdp.reconcileConfigAliases({ autoUpdate: 'off' }).autoUpdate, 'off');
    assert.equal(cdp.reconcileConfigAliases({ omniModule: false }).omniModule, 'off');
    assert.equal(cdp.reconcileConfigAliases({ sidebarStudio: true }).sidebarStudio, 'on');
    assert.equal(cdp.reconcileConfigAliases({ telemetryModule: true }).telemetryModule, 'on');
    assert.equal(cdp.reconcileConfigAliases({ effortSliderModule: false }).effortSliderModule, 'off');

    cdp.writeConfig({ ...cdp.DEFAULT_CONFIG, autoUpdate: true });
    assert.equal(cdp.readConfig().autoUpdate, 'on');

    // 3) P1-4c: REMOVE_EXPRESSION removes root drag/resize attrs, element attrs, and --ag-row-i / --ag-origin-* inline styles
    const makeEl = (tag, attrs = {}, styles = {}) => {
      const attrMap = new Map(Object.entries(attrs));
      const styleMap = new Map(Object.entries(styles));
      return {
        tagName: tag.toUpperCase(),
        attributes: [],
        classList: {
          length: 0,
          remove() {},
        },
        style: {
          setProperty(k, v) { styleMap.set(k, String(v)); },
          getPropertyValue(k) { return styleMap.get(k) || ''; },
          removeProperty(k) { styleMap.delete(k); },
        },
        getAttribute(k) { return attrMap.has(k) ? attrMap.get(k) : null; },
        hasAttribute(k) { return attrMap.has(k); },
        setAttribute(k, v) { attrMap.set(k, String(v)); },
        removeAttribute(k) { attrMap.delete(k); },
        querySelectorAll() { return []; },
        remove() {},
      };
    };

    const rootEl = makeEl('html', {
      'data-ag-prism': cdp.PLUGIN_VERSION,
      'data-ag-cs-resizing': '1',
      'data-ag-cs-mascot-drag': '1',
      'data-ag-cs-win-blur': '1',
    });
    const rowRunningEl = makeEl('div', { 'data-ag-cs-row-running': '1' });
    const rowStaggerEl = makeEl('div', { 'data-ag-row-stagger': '1' }, { '--ag-row-i': '4' });
    const overviewShellEl = makeEl(
      'div',
      { 'data-ag-cs-overview-shell': '1' },
      { '--ag-origin-x': '120px', '--ag-origin-y': '48px' }
    );
    const orchBtnEl = makeEl('button', { 'data-ces-orch-b': 'claude', 'data-ces-model-selected': '1' });
    const orchPanelEl = makeEl('div', { 'data-ces-orch-tunable': 'true' });
    const allEls = [rowRunningEl, rowStaggerEl, overviewShellEl, orchBtnEl, orchPanelEl];

    const matchesSingleAttr = (el, sel) => {
      const m = /^\[([a-z0-9-]+)(?:="([^"]*)")?\]$/i.exec(sel.trim());
      if (!m) return false;
      const [, attr, expectedVal] = m;
      if (!el.hasAttribute(attr)) return false;
      return expectedVal === undefined ? true : el.getAttribute(attr) === expectedVal;
    };

    const mockDoc = {
      documentElement: rootEl,
      getElementById() { return null; },
      querySelector() { return null; },
      querySelectorAll(sel) {
        return allEls.filter((el) => matchesSingleAttr(el, sel));
      },
    };
    const sandbox = {
      document: mockDoc,
      window: {},
      globalThis: {},
      CSS: undefined,
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;

    const removeRes = vm.runInNewContext(cdp.REMOVE_EXPRESSION, sandbox);
    assert.equal(typeof removeRes?.removed, 'number');

    assert.equal(rootEl.hasAttribute('data-ag-cs-resizing'), false, 'REMOVE_EXPRESSION must strip data-ag-cs-resizing');
    assert.equal(rootEl.hasAttribute('data-ag-cs-mascot-drag'), false, 'REMOVE_EXPRESSION must strip data-ag-cs-mascot-drag');
    assert.equal(rootEl.hasAttribute('data-ag-cs-win-blur'), false);
    assert.equal(rowRunningEl.hasAttribute('data-ag-cs-row-running'), false, 'REMOVE_EXPRESSION must strip data-ag-cs-row-running');
    assert.equal(rowStaggerEl.hasAttribute('data-ag-row-stagger'), false, 'REMOVE_EXPRESSION must strip data-ag-row-stagger');
    assert.equal(rowStaggerEl.style.getPropertyValue('--ag-row-i'), '', 'REMOVE_EXPRESSION must clear inline --ag-row-i');
    assert.equal(overviewShellEl.hasAttribute('data-ag-cs-overview-shell'), false, 'REMOVE_EXPRESSION must strip data-ag-cs-overview-shell');
    assert.equal(overviewShellEl.style.getPropertyValue('--ag-origin-x'), '', 'REMOVE_EXPRESSION must clear inline --ag-origin-x');
    assert.equal(overviewShellEl.style.getPropertyValue('--ag-origin-y'), '', 'REMOVE_EXPRESSION must clear inline --ag-origin-y');
    assert.equal(orchBtnEl.hasAttribute('data-ces-orch-b'), false, 'REMOVE_EXPRESSION must strip data-ces-orch-b');
    assert.equal(orchBtnEl.hasAttribute('data-ces-model-selected'), false, 'REMOVE_EXPRESSION must strip data-ces-model-selected');
    assert.equal(orchPanelEl.hasAttribute('data-ces-orch-tunable'), false, 'REMOVE_EXPRESSION must strip data-ces-orch-tunable');
  } finally {
    try {
      delete require.cache[require.resolve(injectPath)];
    } catch {}
    snap.cleanup();
  }
});

test('SetFix #5/#6/#7b/#7d: legacy alias normalization, thoughtView off removal, update-status channel race elimination, and inject.js disabled-module zero-eval', async () => {
  const snap = await createIsolatedPlugin('prism-setfix-backend-');
  const injectPath = path.join(snap.pluginDir, 'inject.js');
  try {
    const cdp = loadFreshCdp(snap.cdpPath);

    // 1) #5: reconcileConfigAliases normalizes palette:'claude'->'warm' & mascot:'dual'->'crab' while keeping validators compatible
    assert.equal(cdp.validateConfigEntry('palette', 'claude'), true);
    assert.equal(cdp.validateConfigEntry('mascot', 'dual'), true);
    const normLegacy = cdp.reconcileConfigAliases({ palette: 'claude', mascot: 'dual' });
    assert.equal(normLegacy.palette, 'warm');
    assert.equal(normLegacy.mascot, 'crab');
    assert.equal(cdp.reconcileConfigAliases({ palette: 'obsidian', mascot: 'minis' }).mascot, 'minis');
    assert.equal(cdp.reconcileConfigAliases({ palette: 'host', mascot: 'off' }).palette, 'host');

    cdp.writeConfig({ ...cdp.DEFAULT_CONFIG, palette: 'claude', mascot: 'dual' });
    const persistedCfg = cdp.readConfig();
    assert.equal(persistedCfg.palette, 'warm');
    assert.equal(persistedCfg.mascot, 'crab');
    const diskJson = JSON.parse(fs.readFileSync(path.join(snap.pluginDir, 'config.json'), 'utf8'));
    assert.equal(diskJson.palette, 'warm');
    assert.equal(diskJson.mascot, 'crab');

    // 2) #7b: buildConfigRefreshExpression & buildInjectExpression remove data-ag-prism-thought-view when thoughtTranslate === 'off'
    const makeThoughtAttrHarness = (initialAttrs = {}) => {
      const attrs = new Map(Object.entries(initialAttrs));
      const setCalls = [];
      const removeCalls = [];
      const htmlEl = {
        getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
        hasAttribute(k) { return attrs.has(k); },
        setAttribute(k, v) {
          setCalls.push([k, String(v)]);
          attrs.set(k, String(v));
        },
        removeAttribute(k) {
          removeCalls.push(k);
          attrs.delete(k);
        },
      };
      return { attrs, setCalls, removeCalls, htmlEl };
    };

    const refreshHarness = makeThoughtAttrHarness({ 'data-ag-prism-thought-view': 'bilingual' });
    let activeCfgState = { ...cdp.DEFAULT_CONFIG, thoughtTranslate: 'off', thoughtView: 'bilingual' };
    const offRefreshExpr = cdp.buildConfigRefreshExpression(activeCfgState);
    const codeHash = offRefreshExpr.match(/"codeHash":"([^"]+)"/)[1];
    const refreshCtx = {
      document: { documentElement: refreshHarness.htmlEl },
      window: {
        __agPrism: {
          version: cdp.PLUGIN_VERSION,
          codeHash,
          refreshConfig(next) {
            activeCfgState = next;
            return true;
          },
          getState() {
            return { cfg: activeCfgState };
          },
        },
      },
      navigator: { language: 'zh-CN' },
    };
    const offRes = vm.runInNewContext(offRefreshExpr, refreshCtx);
    assert.equal(offRes.refreshed, true);
    assert.equal(
      refreshHarness.htmlEl.hasAttribute('data-ag-prism-thought-view'),
      false,
      'buildConfigRefreshExpression must remove data-ag-prism-thought-view when thoughtTranslate=off'
    );
    assert.equal(
      refreshHarness.setCalls.some(([k]) => k === 'data-ag-prism-thought-view'),
      false,
      'buildConfigRefreshExpression must NOT write data-ag-prism-thought-view when thoughtTranslate=off'
    );

    const onRefreshExpr = cdp.buildConfigRefreshExpression({
      ...cdp.DEFAULT_CONFIG,
      thoughtTranslate: 'ai',
      thoughtView: 'bilingual',
    });
    const onRes = vm.runInNewContext(onRefreshExpr, refreshCtx);
    assert.equal(onRes.refreshed, true);
    assert.equal(refreshHarness.htmlEl.getAttribute('data-ag-prism-thought-view'), 'bilingual');

    const backOffExpr = cdp.buildConfigRefreshExpression({
      ...cdp.DEFAULT_CONFIG,
      thoughtTranslate: 'off',
      thoughtView: 'bilingual',
    });
    vm.runInNewContext(backOffExpr, refreshCtx);
    assert.equal(refreshHarness.htmlEl.hasAttribute('data-ag-prism-thought-view'), false);

    // 3) #6: update-status { version, channel } eliminates 40ms config-write race, supports legacy string version, timeout fallback & concurrent channel isolation
    cdp.writeConfig({ ...cdp.DEFAULT_CONFIG, updateChannel: 'stable', autoUpdate: 'off' });
    let fetchDelayByChannel = { stable: 5, beta: 5 };
    const fetchLog = [];
    const mockFetch = async (url) => {
      const ch = url === RELEASES_LIST_API ? 'beta' : 'stable';
      fetchLog.push(ch);
      const delay = fetchDelayByChannel[ch] || 0;
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
      if (url === LATEST_RELEASE_API) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            tag_name: 'v1.0.6',
            draft: false,
            prerelease: false,
            html_url: 'https://github.com/RMvdesi/obsidian-prism/releases/tag/v1.0.6',
            assets: [],
          }),
        };
      }
      if (url === RELEASES_LIST_API) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              tag_name: 'v1.0.7-beta.1',
              draft: false,
              prerelease: true,
              html_url: 'https://github.com/RMvdesi/obsidian-prism/releases/tag/v1.0.7-beta.1',
              assets: [],
            },
          ],
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    };

    const updSvc = new UpdateService({
      platform: 'win32',
      currentVersion: '1.0.6',
      channel: 'stable',
      fetchFn: mockFetch,
    });
    const daemon = new PrismDaemon({
      rootDir: snap.pluginDir,
      silent: true,
      enableAutoUpdateTimer: false,
      _testUpdateService: updSvc,
    });
    // Isolate from host git repository so update-status exercises release channel logic offline without git fetch
    daemon._inspectGitRepoState = async () => ({
      isGitRepo: false,
      repoDir: null,
      repoPath: 'plugin',
      branch: 'standalone',
      commit: '1.0.6',
      dirty: false,
      remoteName: '',
      remoteUrl: '',
      hasRemote: false,
      noRemote: true,
      ahead: 0,
      behind: 0,
      netGitCfg: [],
      blockedUnc: false,
    });

    // Warm stable cache first
    const stableCheck = await daemon.executeRepoAction({ action: 'check-update' });
    assert.equal(stableCheck.channel, 'stable');
    assert.equal(stableCheck.hasUpdate, false);

    // Simulate 40ms race: config.json is STILL 'stable' on disk, but UI invokes update-status with { version, channel: 'beta' }
    assert.equal(cdp.readConfig().updateChannel, 'stable');
    const raceBeta = await daemon.executeRepoAction({
      action: 'update-status',
      version: '1.0.6',
      channel: 'beta',
    });
    assert.equal(raceBeta.ok, true);
    assert.equal(raceBeta.channel, 'beta', 'Explicit channel must immediately override stale config.json');
    assert.equal(raceBeta.updateChannel, 'beta');
    assert.equal(raceBeta.hasUpdate, true);
    assert.equal(raceBeta.latestVersion, '1.0.7-beta.1');
    assert.equal(raceBeta.isPrerelease, true);
    assert.equal(raceBeta.checking, false);
    assert.equal(updSvc.channel, 'beta');

    // Compatibility with 2-arg object form, nested version object form, and legacy string version form
    const twoArgStable = await daemon.executeRepoAction('update-status', { version: '1.0.6', channel: 'stable' });
    assert.equal(twoArgStable.channel, 'stable');
    assert.equal(twoArgStable.hasUpdate, false);

    const nestedObjBeta = await daemon.executeRepoAction({
      action: 'update-status',
      version: { version: '1.0.6', channel: 'beta' },
    });
    assert.equal(nestedObjBeta.channel, 'beta');
    assert.equal(nestedObjBeta.latestVersion, '1.0.7-beta.1');

    const legacyStrStatus = await daemon.executeRepoAction('update-status', '1.0.6');
    assert.equal(legacyStrStatus.ok, true);
    assert.equal(legacyStrStatus.channel, 'stable', 'Legacy string version falls back to config.json channel');

    // REPO_BINDING forwards top-level & input channel/version cleanly
    const bindingReplies = [];
    const fakeRepoEntry = {
      session: {
        send: async (method, params) => {
          if (method === 'Runtime.evaluate') bindingReplies.push(params.expression);
        },
      },
      mainFrameId: 'f-main',
      contextFrames: new Map([[1, { isDefault: true, type: 'default', frameId: 'f-main' }]]),
    };
    await daemon.handleBindingCall(fakeRepoEntry, {
      name: '__agPrismRepoCall',
      payload: JSON.stringify({ id: 91, action: 'update-status', version: '1.0.6', channel: 'beta' }),
      executionContextId: 1,
    });
    assert.equal(bindingReplies.length, 1);
    assert.ok(bindingReplies[0].includes('"channel":"beta"'));
    assert.ok(bindingReplies[0].includes('"latestVersion":"1.0.7-beta.1"'));

    // Short timeout fallback prevents blocking UI while still returning target channel + checking=true
    fetchDelayByChannel = { stable: 220, beta: 180 };
    const t0 = Date.now();
    const timedOutStable = await daemon.executeRepoAction({
      action: 'update-status',
      version: '1.0.6',
      channel: 'stable',
      waitTimeoutMs: 35,
    });
    const elapsedMs = Date.now() - t0;
    assert.ok(elapsedMs < 150, `Timeout fallback must return promptly without blocking UI (took ${elapsedMs}ms)`);
    assert.equal(timedOutStable.channel, 'stable');
    assert.equal(timedOutStable.updateChannel, 'stable');
    assert.equal(timedOutStable.checking, true);

    // Concurrent switch back to beta while slow stable check is still in flight must NOT reuse stable promise or let slow stable overwrite beta cache
    fetchDelayByChannel = { stable: 220, beta: 15 };
    const fastBetaDuringSlowStable = await daemon.executeRepoAction({
      action: 'update-status',
      version: '1.0.6',
      channel: 'beta',
      waitTimeoutMs: 1000,
    });
    assert.equal(fastBetaDuringSlowStable.channel, 'beta');
    assert.equal(fastBetaDuringSlowStable.latestVersion, '1.0.7-beta.1');
    assert.equal(fastBetaDuringSlowStable.checking, false);
    await new Promise((r) => setTimeout(r, 260));
    assert.equal(daemon._lastUpdateState?.channel, 'beta', 'Late slow stable check must never overwrite newer beta state');

    // 4) #7d: inject.js broadcastFastConfigRefresh does ZERO omni/sidebar compilation or evaluation when disabled
    delete require.cache[require.resolve(injectPath)];
    const injectMod = require(injectPath);
    assert.equal(typeof injectMod._createFastConfigRefreshBroadcaster, 'function');

    let activeBroadCfg = {
      ...cdp.DEFAULT_CONFIG,
      omniModule: 'off',
      sidebarStudio: 'off',
      hostLocalization: 'off',
      thoughtTranslate: 'off',
      periodicModelPicker: 'off',
    };
    let omniBuildCount = 0;
    let sidebarBuildCount = 0;
    let periodicBuildCount = 0;
    const evalHistory = [];
    const cdpSendHistory = [];
    let refreshReturnsRefreshed = true;
    const mockEntry = {
      session: {
        closed: false,
        async evaluate(code) {
          evalHistory.push(code);
          if (code === '__REFRESH__') return { refreshed: refreshReturnsRefreshed };
          return { ok: true };
        },
        async send(method, params) {
          cdpSendHistory.push({ method, params });
          if (method === 'Page.addScriptToEvaluateOnNewDocument') {
            return { identifier: `id:${params.source}` };
          }
          return {};
        },
      },
      scriptId: 'old-main',
      omniScriptId: 'old-omni',
      sidebarScriptId: 'old-sidebar',
      hostI18nScriptId: null,
      thoughtScriptId: null,
      thoughtMounted: false,
      pendingAckEpoch: 0,
    };
    const attached = new Map([['p1', mockEntry]]);
    const broadcast = injectMod._createFastConfigRefreshBroadcaster({
      attached,
      readConfig: () => activeBroadCfg,
      buildInjectExpression: () => '__MAIN__',
      buildConfigRefreshExpression: () => '__REFRESH__',
      buildOmniClientExpression: () => {
        omniBuildCount += 1;
        return '__OMNI__';
      },
      buildSidebarStudioExpression: () => {
        sidebarBuildCount += 1;
        return '__SIDEBAR__';
      },
      shouldEnableHostI18n: () => false,
      buildHostI18nExpression: () => '__HOST_I18N__',
      hostI18nRemoveExpression: '',
      getThoughtHooks: () => ({
        shouldEnable: () => false,
        buildExpression: () => '__THOUGHT__',
        removeExpression: '',
      }),
      getInlineDiffHooks: () => ({
        buildExpression: () => '',
        removeExpression: '',
      }),
      buildPeriodicPickerExpression: () => {
        periodicBuildCount += 1;
        return '__PERIODIC__';
      },
    });

    // Disabled state (fast refresh path): 0 builds, 0 evals, old omni/sidebar scripts removed & nulled
    await broadcast();
    assert.equal(omniBuildCount, 0, 'inject.js must NOT build omniExpr when omniModule=off');
    assert.equal(sidebarBuildCount, 0, 'inject.js must NOT build sidebarExpr when sidebarStudio=off');
    assert.equal(periodicBuildCount, 0, 'inject.js must NOT build periodicPickerExpr when periodicModelPicker=off');
    assert.deepEqual(evalHistory, ['__REFRESH__'], 'Disabled omni/sidebar must trigger 0 extra evaluate calls');
    assert.equal(mockEntry.omniScriptId, null);
    assert.equal(mockEntry.sidebarScriptId, null);
    assert.ok(
      cdpSendHistory.some((c) => c.method === 'Page.removeScriptToEvaluateOnNewDocument' && c.params.identifier === 'old-omni')
    );
    assert.ok(
      cdpSendHistory.some((c) => c.method === 'Page.removeScriptToEvaluateOnNewDocument' && c.params.identifier === 'old-sidebar')
    );
    assert.equal(
      cdpSendHistory.some((c) => c.method === 'Page.addScriptToEvaluateOnNewDocument' && (c.params.source === '__OMNI__' || c.params.source === '__SIDEBAR__')),
      false
    );

    // Disabled state (fallback full inject path): still 0 omni/sidebar evals
    evalHistory.length = 0;
    cdpSendHistory.length = 0;
    refreshReturnsRefreshed = false;
    await broadcast();
    assert.equal(omniBuildCount, 0);
    assert.equal(sidebarBuildCount, 0);
    assert.deepEqual(evalHistory, ['__REFRESH__', '__MAIN__']);

    // Enabled state: builds, evaluates, and registers both omniExpr and sidebarExpr
    evalHistory.length = 0;
    cdpSendHistory.length = 0;
    refreshReturnsRefreshed = true;
    activeBroadCfg = { ...activeBroadCfg, omniModule: 'on', sidebarStudio: 'on' };
    await broadcast();
    assert.equal(omniBuildCount, 1);
    assert.equal(sidebarBuildCount, 1);
    assert.deepEqual(evalHistory, ['__REFRESH__', '__OMNI__', '__SIDEBAR__']);
    assert.equal(mockEntry.omniScriptId, 'id:__OMNI__');
    assert.equal(mockEntry.sidebarScriptId, 'id:__SIDEBAR__');
  } finally {
    try {
      delete require.cache[require.resolve(injectPath)];
    } catch {}
    snap.cleanup();
  }
});

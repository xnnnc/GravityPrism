import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { PrismDaemon } from '../sidecars/daemon/main.mjs';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CDP_PATH = path.join(ROOT, 'cdp.js');
const installTool = require(path.join(ROOT, 'tools', 'install-plugin.cjs'));

function mkTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function loadFreshCdp(cdpFilePath = CDP_PATH) {
  const resolved = require.resolve(cdpFilePath);
  delete require.cache[resolved];
  return require(resolved);
}

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

async function createIsolatedPluginSnapshot(prefix) {
  const rootTmp = mkTempDir(prefix);
  const pluginDir = path.join(rootTmp, 'plugin');
  const installRes = await installTool.installPlugin({
    sourceDir: ROOT,
    targetDir: pluginDir,
    startDaemon: false,
    syncShortcuts: false,
  });
  assert.equal(installRes.ok, true);
  const cdpPath = path.join(pluginDir, 'cdp.js');
  const cleanup = () => {
    try {
      delete require.cache[require.resolve(cdpPath)];
    } catch {}
    fs.rmSync(rootTmp, { recursive: true, force: true });
  };
  return { rootTmp, pluginDir, cdpPath, cleanup };
}

test('v107 A2-1: cold compile writes .bundle-cache.json, cold reload hits cache byte-identically and skips mangler/CSS compilation', async () => {
  const snap = await createIsolatedPluginSnapshot('prism-v107-cache-hit-');
  const cacheDir = path.join(snap.rootTmp, 'cache');
  const cachePath = path.join(cacheDir, '.bundle-cache.json');
  try {
    // 1) Cold module load -> cache miss -> full compile -> atomic disk write
    const cdpCold = loadFreshCdp(snap.cdpPath);
    const exprCold = cdpCold.buildInjectExpression(cdpCold.DEFAULT_CONFIG, { cachePath });
    const coldStats = cdpCold.getBundleCacheStats();

    assert.equal(coldStats.diskHits, 0);
    assert.equal(coldStats.diskMisses, 1);
    assert.equal(coldStats.diskWrites, 1);
    assert.equal(coldStats.diskWriteFailures, 0);
    assert.equal(coldStats.compileUnifiedRuns, 1);
    assert.ok(coldStats.mangledUnitRuns > 0, 'Cold compile must run JS unit mangler');
    assert.equal(coldStats.cssMinifyRuns, 1, 'Cold compile must run CSS minifier');
    assert.equal(coldStats.lastOutcome, 'compiled');

    assert.equal(fs.existsSync(cachePath), true, 'Cache file must be created on cold miss');
    const dirEntries = fs.readdirSync(cacheDir);
    assert.deepEqual(dirEntries, ['.bundle-cache.json'], 'Atomic write must leave zero stray .tmp files');

    const parsed = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    assert.equal(parsed.schemaVersion, cdpCold.BUNDLE_CACHE_SCHEMA_VERSION);
    assert.equal(parsed.pluginVersion, cdpCold.PLUGIN_VERSION);
    assert.match(parsed.sourceHash, /^[0-9a-f]{64}$/);
    assert.equal(Array.isArray(parsed.entries), true);
    assert.equal(parsed.entries.length, 1);
    assert.equal(parsed.entries[0].exprSha256, sha256(exprCold));

    // 2) Fresh cold module reload (simulating daemon restart with empty in-memory caches) -> disk hit!
    const cdpHit = loadFreshCdp(snap.cdpPath);
    const exprHit = cdpHit.buildInjectExpression(cdpHit.DEFAULT_CONFIG, { cachePath });
    const hitStats = cdpHit.getBundleCacheStats();

    assert.equal(exprHit, exprCold, 'Disk cache hit must match live cold compile byte-for-byte');
    assert.equal(hitStats.diskHits, 1);
    assert.equal(hitStats.diskMisses, 0);
    assert.equal(hitStats.diskWrites, 0);
    assert.equal(hitStats.compileUnifiedRuns, 0, 'Disk cache hit must completely skip compileUnifiedBundle()');
    assert.equal(hitStats.mangledUnitRuns, 0, 'Disk cache hit must completely skip JS mangler');
    assert.equal(hitStats.cssMinifyRuns, 0, 'Disk cache hit must completely skip CSS minifier');
    assert.equal(hitStats.lastOutcome, 'disk-hit');

    assert.doesNotThrow(() => new vm.Script(exprHit), 'Cached inject expression must remain syntactically valid JS');

    // 3) buildConfigRefreshExpression right after a cold disk hit also reuses verified codeHash without compiling
    const refreshAfterHit = cdpHit.buildConfigRefreshExpression(cdpHit.DEFAULT_CONFIG);
    const refreshLive = cdpCold.buildConfigRefreshExpression(cdpCold.DEFAULT_CONFIG);
    assert.equal(refreshAfterHit, refreshLive);
    assert.equal(cdpHit.getBundleCacheStats().compileUnifiedRuns, 0);
    assert.equal(cdpHit.getBundleCacheStats().mangledUnitRuns, 0);
  } finally {
    snap.cleanup();
  }
});

test('v107 A2-2: cross-process cold start hits disk cache with byte-identical output and significantly lower latency', async () => {
  const snap = await createIsolatedPluginSnapshot('prism-v107-cache-proc-');
  const cachePath = path.join(snap.rootTmp, '.bundle-cache.json');
  try {
    const childCode = [
      "const crypto = require('crypto');",
      `const cdp = require(${JSON.stringify(snap.cdpPath)});`,
      'const cp = process.env.TEST_CACHE_PATH;',
      'const t0 = performance.now();',
      'const expr = cdp.buildInjectExpression(cdp.DEFAULT_CONFIG, { cachePath: cp });',
      'const t1 = performance.now();',
      'const hash = crypto.createHash("sha256").update(expr, "utf8").digest("hex");',
      'console.log(JSON.stringify({ ms: +(t1 - t0).toFixed(2), bytes: Buffer.byteLength(expr, "utf8"), hash, stats: cdp.getBundleCacheStats() }));',
    ].join('\n');

    const cold = JSON.parse(
      execFileSync(process.execPath, ['-e', childCode], {
        cwd: snap.pluginDir,
        env: { ...process.env, TEST_CACHE_PATH: cachePath },
        encoding: 'utf8',
        windowsHide: true,
      })
    );
    const hit = JSON.parse(
      execFileSync(process.execPath, ['-e', childCode], {
        cwd: snap.pluginDir,
        env: { ...process.env, TEST_CACHE_PATH: cachePath },
        encoding: 'utf8',
        windowsHide: true,
      })
    );

    assert.equal(cold.stats.diskHits, 0);
    assert.equal(cold.stats.compileUnifiedRuns, 1);
    assert.ok(cold.stats.mangledUnitRuns > 0);

    assert.equal(hit.stats.diskHits, 1);
    assert.equal(hit.stats.compileUnifiedRuns, 0);
    assert.equal(hit.stats.mangledUnitRuns, 0);
    assert.equal(hit.stats.cssMinifyRuns, 0);
    assert.equal(hit.bytes, cold.bytes);
    assert.equal(hit.hash, cold.hash, 'Cross-process cached bundle SHA-256 must match cold compile');
    assert.ok(hit.ms < cold.ms, `Expected disk cache hit (${hit.ms}ms) to be faster than cold compile (${cold.ms}ms)`);
  } finally {
    snap.cleanup();
  }
});

test('v107 A2-3: config changes miss cache cleanly, cap retained variants at BUNDLE_CACHE_MAX_ENTRIES, and normalize equivalent aliases', async () => {
  const snap = await createIsolatedPluginSnapshot('prism-v107-cache-cfg-');
  const cachePath = path.join(snap.rootTmp, '.bundle-cache.json');
  try {
    const cdp = loadFreshCdp(snap.cdpPath);
    const variants = [
      { ...cdp.DEFAULT_CONFIG, palette: 'obsidian' },
      { ...cdp.DEFAULT_CONFIG, palette: 'warm' },
      { ...cdp.DEFAULT_CONFIG, palette: 'warm', cornerStyle: 'sharp' },
      { ...cdp.DEFAULT_CONFIG, palette: 'host' },
      { ...cdp.DEFAULT_CONFIG, palette: 'obsidian', motionLevel: 'off' },
      { ...cdp.DEFAULT_CONFIG, palette: 'warm', language: 'zh-CN' },
    ];

    const compiledByIdx = [];
    for (let i = 0; i < variants.length; i++) {
      const expr = cdp.buildInjectExpression(variants[i], { cachePath });
      const liveBaseline = cdp.buildInjectExpression(variants[i], { cachePath: false });
      assert.equal(expr, liveBaseline, `Variant #${i} cached build must equal live uncached output`);
      compiledByIdx.push(expr);
    }

    assert.equal(cdp.getBundleCacheStats().diskMisses, variants.length);
    assert.equal(cdp.getBundleCacheStats().diskWrites, variants.length);

    const parsed = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    assert.equal(
      parsed.entries.length,
      cdp.BUNDLE_CACHE_MAX_ENTRIES,
      `Cache entries must be bounded at ${cdp.BUNDLE_CACHE_MAX_ENTRIES}`
    );

    // Cold reload: the 4 most recent variants must all hit disk cache without compiling
    const cdpFresh = loadFreshCdp(snap.cdpPath);
    for (let i = variants.length - cdpFresh.BUNDLE_CACHE_MAX_ENTRIES; i < variants.length; i++) {
      const expr = cdpFresh.buildInjectExpression(variants[i], { cachePath });
      assert.equal(expr, compiledByIdx[i]);
    }
    assert.equal(cdpFresh.getBundleCacheStats().diskHits, cdpFresh.BUNDLE_CACHE_MAX_ENTRIES);
    assert.equal(cdpFresh.getBundleCacheStats().compileUnifiedRuns, 0);

    // Equivalent alias / undefined property normalization hits the exact same entry
    const aliasVariant = {
      ...variants[variants.length - 1],
      homeRipple: 'on',
      unusedOptionalField: undefined,
    };
    const aliasExpr = cdpFresh.buildInjectExpression(aliasVariant, { cachePath });
    assert.equal(aliasExpr, compiledByIdx[variants.length - 1]);
    assert.equal(cdpFresh.getBundleCacheStats().diskHits, cdpFresh.BUNDLE_CACHE_MAX_ENTRIES + 1);
    assert.equal(cdpFresh.getBundleCacheStats().compileUnifiedRuns, 0);

    // Evicted oldest variant (#0) misses exact entry, fast-assembles from verified base template without re-mangling, and writes back
    const evictedExpr = cdpFresh.buildInjectExpression(variants[0], { cachePath });
    assert.equal(evictedExpr, compiledByIdx[0]);
    assert.equal(cdpFresh.getBundleCacheStats().diskMisses, 1);
    assert.equal(cdpFresh.getBundleCacheStats().diskBaseHits, 1);
    assert.equal(cdpFresh.getBundleCacheStats().compileUnifiedRuns, 0);
    assert.equal(cdpFresh.getBundleCacheStats().mangledUnitRuns, 0);
  } finally {
    snap.cleanup();
  }
});

test('v107 A2-4: SHA-256 source hash detects 1-byte source edits even when file length and mtime stay unchanged, and uninstall cleans cache', async () => {
  const tmpRoot = mkTempDir('prism-v107-cache-src-');
  const hostCfgDir = path.join(tmpRoot, '.gemini', 'config');
  const pluginDir = path.join(hostCfgDir, 'plugins', 'obsidian-prism');
  try {
    fs.mkdirSync(hostCfgDir, { recursive: true });
    const installRes = await installTool.installPlugin({
      sourceDir: ROOT,
      targetDir: pluginDir,
      hostConfigDir: hostCfgDir,
      startDaemon: false,
      syncShortcuts: false,
    });
    assert.equal(installRes.ok, true);

    const isolatedCdpPath = path.join(pluginDir, 'cdp.js');
    const cachePath = path.join(pluginDir, '.bundle-cache.json');
    const cdpIso = loadFreshCdp(isolatedCdpPath);

    const exprBefore = cdpIso.buildInjectExpression(cdpIso.DEFAULT_CONFIG, { cachePath });
    const hashBefore = JSON.parse(fs.readFileSync(cachePath, 'utf8')).sourceHash;

    // Modify style.css keeping EXACT byte length and restoring EXACT original atime/mtime
    const stylePath = path.join(pluginDir, 'style.css');
    const origStat = fs.statSync(stylePath);
    const origCss = fs.readFileSync(stylePath, 'utf8');
    const mutatedCss = origCss.replace(/#([0-9a-fA-F]{6})/, (m, hex) => {
      const nextFirst = hex[0].toLowerCase() === 'a' ? 'b' : 'a';
      return `#${nextFirst}${hex.slice(1)}`;
    });
    assert.notEqual(mutatedCss, origCss, 'Expected style.css mutation to change at least 1 hex color');
    assert.equal(Buffer.byteLength(mutatedCss, 'utf8'), Buffer.byteLength(origCss, 'utf8'));
    fs.writeFileSync(stylePath, mutatedCss, 'utf8');
    fs.utimesSync(stylePath, origStat.atime, origStat.mtime);

    // Same process call: SHA-256 must STILL miss despite identical mtimeMs:size, and invalidate stale CSS
    const exprAfter = cdpIso.buildInjectExpression(cdpIso.DEFAULT_CONFIG, { cachePath });
    const hashAfter = JSON.parse(fs.readFileSync(cachePath, 'utf8')).sourceHash;

    assert.notEqual(hashAfter, hashBefore, 'SHA-256 sourceHash must flip on 1-byte content change');
    assert.notEqual(exprAfter, exprBefore, 'Recompiled output must reflect mutated style.css');
    assert.equal(cdpIso.getBundleCacheStats().diskMisses, 2);

    // Next cold reload hits the updated cache
    const cdpIsoReload = loadFreshCdp(isolatedCdpPath);
    const exprAfterHit = cdpIsoReload.buildInjectExpression(cdpIsoReload.DEFAULT_CONFIG, { cachePath });
    assert.equal(exprAfterHit, exprAfter);
    assert.equal(cdpIsoReload.getBundleCacheStats().diskHits, 1);
    assert.equal(cdpIsoReload.getBundleCacheStats().compileUnifiedRuns, 0);

    // Default uninstall removes pluginDir including .bundle-cache.json automatically
    const uninst = await installTool.uninstallPlugin({
      targetDir: pluginDir,
      hostConfigDir: hostCfgDir,
      noCdp: true,
      syncShortcuts: false,
      purgeData: false,
    });
    assert.equal(uninst.ok, true);
    assert.equal(fs.existsSync(cachePath), false, 'Default uninstall must automatically remove .bundle-cache.json');
    assert.equal(fs.existsSync(pluginDir), false);
  } finally {
    try {
      delete require.cache[require.resolve(path.join(pluginDir, 'cdp.js'))];
    } catch {}
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('v107 A2-5: corrupted/tampered cache JSON gracefully Fail-Opens to live compile and self-heals', async () => {
  const snap = await createIsolatedPluginSnapshot('prism-v107-cache-corrupt-');
  const cachePath = path.join(snap.rootTmp, '.bundle-cache.json');
  try {
    const cdp = loadFreshCdp(snap.cdpPath);
    const expectedExpr = cdp.buildInjectExpression(cdp.DEFAULT_CONFIG, { cachePath });
    const validRaw = fs.readFileSync(cachePath, 'utf8');
    const validObj = JSON.parse(validRaw);

    const tamperedCases = [
      { name: 'broken JSON syntax', content: '{"schemaVersion":1,"entries":[broken' },
      { name: 'empty 0-byte file', content: '' },
      { name: 'non-object JSON root (array)', content: '[]' },
      { name: 'wrong schemaVersion number', content: JSON.stringify({ ...validObj, schemaVersion: 999 }) },
      { name: 'wrong schemaVersion type', content: JSON.stringify({ ...validObj, schemaVersion: '1' }) },
      { name: 'wrong pluginVersion', content: JSON.stringify({ ...validObj, pluginVersion: '0.0.1' }) },
      { name: 'mismatched sourceHash', content: JSON.stringify({ ...validObj, sourceHash: '0'.repeat(64) }) },
      { name: 'malformed non-hex sourceHash', content: JSON.stringify({ ...validObj, sourceHash: 'not-a-sha256' }) },
      { name: 'non-array entries', content: JSON.stringify({ ...validObj, entries: {} }) },
      {
        name: 'invalid entry bootCfgJson type (number)',
        content: JSON.stringify({
          ...validObj,
          entries: [{ ...validObj.entries[0], bootCfgJson: 123456 }],
        }),
      },
      {
        name: 'empty entry bootCfgJson string',
        content: JSON.stringify({
          ...validObj,
          entries: [{ ...validObj.entries[0], bootCfgJson: '' }],
        }),
      },
      {
        name: '1-char tampered bootCfgJson failing exprSha256 integrity check',
        content: JSON.stringify({
          ...validObj,
          entries: [{ ...validObj.entries[0], bootCfgJson: validObj.entries[0].bootCfgJson + ' ' }],
        }),
      },
      {
        name: '1-char tampered baseSuffix failing baseSha256 integrity check',
        content: JSON.stringify({
          ...validObj,
          baseSuffix: validObj.baseSuffix + ' ',
        }),
      },
    ];

    for (const tc of tamperedCases) {
      fs.writeFileSync(cachePath, tc.content, 'utf8');
      cdp.resetBundleCacheStats();

      const recovered = cdp.buildInjectExpression(cdp.DEFAULT_CONFIG, { cachePath });
      assert.equal(recovered, expectedExpr, `Case "${tc.name}" must Fail-Open to exact valid bundle`);
      const st = cdp.getBundleCacheStats();
      assert.equal(st.diskHits, 0, `Case "${tc.name}" must NOT register a disk hit`);
      assert.equal(st.diskMisses, 1, `Case "${tc.name}" must register a disk miss`);
      assert.equal(st.diskWrites, 1, `Case "${tc.name}" must self-heal cache on disk`);

      // Verify self-healed file now produces a clean cold disk hit
      const cdpVerify = loadFreshCdp(snap.cdpPath);
      const hitAfterHeal = cdpVerify.buildInjectExpression(cdpVerify.DEFAULT_CONFIG, { cachePath });
      assert.equal(hitAfterHeal, expectedExpr, `Case "${tc.name}" self-healed cache must match byte-for-byte`);
      assert.equal(cdpVerify.getBundleCacheStats().diskHits, 1, `Case "${tc.name}" must hit after self-healing`);
      assert.equal(cdpVerify.getBundleCacheStats().compileUnifiedRuns, 0);
    }

    // Tampered basePrefix on config-miss must reject base template, fall back to full live compile, and self-heal
    const freshObj = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    fs.writeFileSync(
      cachePath,
      JSON.stringify({ ...freshObj, basePrefix: `${freshObj.basePrefix}/*tampered*/` }),
      'utf8'
    );
    const cdpTamperBase = loadFreshCdp(snap.cdpPath);
    const altCfg = { ...cdpTamperBase.DEFAULT_CONFIG, palette: 'claude' };
    const expectedAlt = cdp.buildInjectExpression(altCfg, { cachePath: false });
    const recoveredAlt = cdpTamperBase.buildInjectExpression(altCfg, { cachePath });
    assert.equal(recoveredAlt, expectedAlt, 'Tampered basePrefix must Fail-Open to full live compile');
    assert.equal(cdpTamperBase.getBundleCacheStats().diskBaseHits, 0);
    assert.equal(cdpTamperBase.getBundleCacheStats().compileUnifiedRuns, 1);
    assert.equal(cdpTamperBase.getBundleCacheStats().diskWrites, 1);
  } finally {
    snap.cleanup();
  }
});

test('v107 A2-6: unwritable and symlink cache paths Fail-Open silently without throwing or leaving temp files', async () => {
  const snap = await createIsolatedPluginSnapshot('prism-v107-cache-unwritable-');
  const testDir = path.join(snap.rootTmp, 'unwritable');
  fs.mkdirSync(testDir, { recursive: true });
  try {
    const cdp = loadFreshCdp(snap.cdpPath);
    const baseline = cdp.buildInjectExpression(cdp.DEFAULT_CONFIG, { cachePath: false });

    // Case A: parent directory segment is an existing regular file -> ENOTDIR on all platforms (incl. Windows Admin)
    const blockingFile = path.join(testDir, 'not-a-directory');
    fs.writeFileSync(blockingFile, 'blocker', 'utf8');
    const unwritableNestedPath = path.join(blockingFile, '.bundle-cache.json');

    cdp.resetBundleCacheStats();
    const exprA = cdp.buildInjectExpression(cdp.DEFAULT_CONFIG, { cachePath: unwritableNestedPath });
    assert.equal(exprA, baseline);
    assert.equal(cdp.getBundleCacheStats().diskWriteFailures, 1);

    // Case B: target cache path itself is an existing directory -> EISDIR/EPERM on all platforms
    const dirAsFile = path.join(testDir, 'dir-as-cache');
    fs.mkdirSync(dirAsFile);

    cdp.resetBundleCacheStats();
    const exprB = cdp.buildInjectExpression(cdp.DEFAULT_CONFIG, { cachePath: dirAsFile });
    assert.equal(exprB, baseline);
    assert.equal(cdp.getBundleCacheStats().diskWriteFailures, 1);

    // Case C: symlink cache target must be refused without touching victim file (when platform permits creating symlinks)
    const victimFile = path.join(testDir, 'victim.txt');
    const symlinkCache = path.join(testDir, 'symlink-cache.json');
    fs.writeFileSync(victimFile, 'DO-NOT-TOUCH', 'utf8');
    let symlinkCreated = false;
    try {
      fs.symlinkSync(victimFile, symlinkCache, 'file');
      symlinkCreated = true;
    } catch {}
    if (symlinkCreated) {
      cdp.resetBundleCacheStats();
      const exprC = cdp.buildInjectExpression(cdp.DEFAULT_CONFIG, { cachePath: symlinkCache });
      assert.equal(exprC, baseline);
      assert.equal(cdp.getBundleCacheStats().diskWriteFailures, 1);
      assert.equal(fs.readFileSync(victimFile, 'utf8'), 'DO-NOT-TOUCH', 'Symlink target must NEVER be overwritten');
    }

    // Ensure no leftover .tmp files in testDir
    const leftoverTmp = fs.readdirSync(testDir).filter((n) => n.endsWith('.tmp'));
    assert.deepEqual(leftoverTmp, []);
  } finally {
    snap.cleanup();
  }
});

test('v107 A2-7: default buildInjectExpression never pollutes repo, and PrismDaemon isolates git repos vs installed plugin dirs', async () => {
  const repoCachePath = path.join(ROOT, '.bundle-cache.json');
  const prevEnv = process.env.AG_PRISM_BUNDLE_CACHE_PATH;
  const tmpRoot = mkTempDir('prism-v107-cache-daemon-');
  try {
    delete process.env.AG_PRISM_BUNDLE_CACHE_PATH;
    assert.equal(fs.existsSync(repoCachePath), false, 'Repo must start clean without .bundle-cache.json');

    // 1) Direct cdp.buildInjectExpression(DEFAULT_CONFIG) never creates .bundle-cache.json in repo
    const cdp = loadFreshCdp(CDP_PATH);
    const expr = cdp.buildInjectExpression(cdp.DEFAULT_CONFIG);
    assert.ok(expr.length > 10000);
    assert.equal(fs.existsSync(repoCachePath), false, 'Default buildInjectExpression must NEVER pollute git repo');
    assert.equal(cdp.getBundleCacheStats().diskWrites, 0);

    // 2) AG_PRISM_BUNDLE_CACHE_PATH='off' disables caching; explicit env path enables it
    const envCachePath = path.join(tmpRoot, 'env-cache', '.bundle-cache.json');
    process.env.AG_PRISM_BUNDLE_CACHE_PATH = envCachePath;
    cdp.buildInjectExpression(cdp.DEFAULT_CONFIG);
    assert.equal(fs.existsSync(envCachePath), true, 'Explicit AG_PRISM_BUNDLE_CACHE_PATH must be honored');
    process.env.AG_PRISM_BUNDLE_CACHE_PATH = 'off';
    const cdpOff = loadFreshCdp(CDP_PATH);
    cdpOff.buildInjectExpression(cdpOff.DEFAULT_CONFIG);
    assert.equal(cdpOff.getBundleCacheStats().diskHits, 0);
    assert.equal(cdpOff.getBundleCacheStats().diskWrites, 0);
    delete process.env.AG_PRISM_BUNDLE_CACHE_PATH;

    // 3) PrismDaemon on Git repo root (or git worktree with .git file) NEVER resolves cache path inside repo
    const repoDaemon = new PrismDaemon({ rootDir: ROOT, silent: true, enableAutoUpdateTimer: false });
    assert.equal(repoDaemon.resolveBundleCachePath(), null, 'PrismDaemon on git repo in test runtime must not pollute repo or home');

    const fakeWorktree = path.join(tmpRoot, 'fake-worktree');
    fs.mkdirSync(fakeWorktree, { recursive: true });
    fs.writeFileSync(path.join(fakeWorktree, '.git'), 'gitdir: /tmp/fake\n', 'utf8');
    fs.copyFileSync(CDP_PATH, path.join(fakeWorktree, 'cdp.js'));
    const wtDaemon = new PrismDaemon({ rootDir: fakeWorktree, silent: true, enableAutoUpdateTimer: false });
    assert.equal(wtDaemon.resolveBundleCachePath(), null, 'PrismDaemon must recognize git worktree .git file');

    // 4) PrismDaemon with explicit bundleCachePath: false disables cache; string path overrides it
    const disabledDaemon = new PrismDaemon({ rootDir: ROOT, bundleCachePath: false, silent: true, enableAutoUpdateTimer: false });
    assert.equal(disabledDaemon.resolveBundleCachePath(), null);

    const customCache = path.join(tmpRoot, 'custom-daemon-cache.json');
    const customDaemon = new PrismDaemon({ rootDir: ROOT, bundleCachePath: customCache, silent: true, enableAutoUpdateTimer: false });
    assert.equal(customDaemon.resolveBundleCachePath(), path.resolve(customCache));
    customDaemon.rebuildBundle();
    assert.equal(fs.existsSync(customCache), true);

    // 5) PrismDaemon on installed non-git plugin dir stores .bundle-cache.json inside plugin dir and hits on restart
    const installedDir = path.join(tmpRoot, 'installed-plugin');
    await installTool.installPlugin({
      sourceDir: ROOT,
      targetDir: installedDir,
      startDaemon: false,
      syncShortcuts: false,
    });

    const d1 = new PrismDaemon({ rootDir: installedDir, silent: true, enableAutoUpdateTimer: false });
    const resolvedInstalledCache = d1.resolveBundleCachePath();
    assert.equal(resolvedInstalledCache, path.join(installedDir, '.bundle-cache.json'));
    const firstExpr = d1.rebuildBundle();
    assert.equal(fs.existsSync(resolvedInstalledCache), true);

    // Simulate daemon restart on same installed plugin dir with fresh cdp.js module load
    delete require.cache[require.resolve(path.join(installedDir, 'cdp.js'))];
    const d2 = new PrismDaemon({ rootDir: installedDir, silent: true, enableAutoUpdateTimer: false });
    const secondExpr = d2.rebuildBundle();
    assert.equal(secondExpr, firstExpr, 'Restarted daemon must receive byte-identical injectExpr from disk cache');
    assert.equal(d2.cdp.getBundleCacheStats().diskHits, 1);
    assert.equal(d2.cdp.getBundleCacheStats().compileUnifiedRuns, 0);
    assert.equal(d2.cdp.getBundleCacheStats().mangledUnitRuns, 0);
    assert.equal(d2.codeHash, d1.codeHash);

    assert.equal(fs.existsSync(repoCachePath), false, 'Repo must still have zero .bundle-cache.json residue');
  } finally {
    if (prevEnv === undefined) delete process.env.AG_PRISM_BUNDLE_CACHE_PATH;
    else process.env.AG_PRISM_BUNDLE_CACHE_PATH = prevEnv;
    try {
      delete require.cache[require.resolve(path.join(tmpRoot, 'fake-worktree', 'cdp.js'))];
    } catch {}
    try {
      delete require.cache[require.resolve(path.join(tmpRoot, 'installed-plugin', 'cdp.js'))];
    } catch {}
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('v107 A2-8: single-pass PrismDaemon.rebuildBundle cold hit parses .bundle-cache.json once across all 8 sub-channels and detects same-length same-mtime disk tampering', async () => {
  const snap = await createIsolatedPluginSnapshot('prism-v107-cache-root-');
  const cachePath = path.join(snap.pluginDir, '.bundle-cache.json');
  const origReadFileSync = fs.readFileSync;
  const origJsonParse = JSON.parse;
  try {
    // 1) Enable all 8 precompiled sub-channels (Channels 2-8 + 10 mascot) and cold-compile into .bundle-cache.json via PrismDaemon.rebuildBundle()
    const cdpSeed = loadFreshCdp(snap.cdpPath);
    cdpSeed.writeConfig({
      ...cdpSeed.DEFAULT_CONFIG,
      omniModule: 'on',
      sidebarStudio: 'on',
      hostLocalization: 'on',
      thoughtTranslate: 'ai',
    });

    const dCold = new PrismDaemon({
      rootDir: snap.pluginDir,
      bundleCachePath: cachePath,
      silent: true,
      enableAutoUpdateTimer: false,
    });
    const coldInjectExpr = dCold.rebuildBundle();
    assert.equal(fs.existsSync(cachePath), true);
    assert.ok(dCold.omniExpr.length > 0);
    assert.ok(dCold.sidebarExpr.length > 0);
    assert.ok(dCold.hostI18nExpr.length > 0);
    assert.ok(dCold.thoughtExpr.length > 0);
    assert.ok(dCold.inlineDiffExpr.length > 0);
    assert.ok(dCold.wallpaperExpr.length > 0);
    assert.ok(dCold.periodicPickerExpr.length > 0);
    assert.ok(dCold.mascotExpr.length > 0);
    assert.ok(dCold.homeStudioExpr.length > 0);

    // 2) Simulate cold daemon restart: all 9 channels hit disk cache with ONLY 1 readFileSync + 1 JSON.parse
    delete require.cache[require.resolve(snap.cdpPath)];
    const dHit = new PrismDaemon({
      rootDir: snap.pluginDir,
      bundleCachePath: cachePath,
      silent: true,
      enableAutoUpdateTimer: false,
    });

    const resolvedCachePath = path.resolve(cachePath);
    let cacheReads = 0;
    let cacheParses = 0;
    fs.readFileSync = function spyDaemonCacheRead(p, ...rest) {
      if (typeof p === 'string' && path.resolve(p) === resolvedCachePath) {
        cacheReads += 1;
      }
      return origReadFileSync.call(this, p, ...rest);
    };
    JSON.parse = function spyDaemonJsonParse(text, ...rest) {
      if (typeof text === 'string' && text.includes('"schemaVersion"') && text.includes('"basePrefix"')) {
        cacheParses += 1;
      }
      return origJsonParse.call(this, text, ...rest);
    };
    let hitInjectExpr;
    try {
      hitInjectExpr = dHit.rebuildBundle();
    } finally {
      fs.readFileSync = origReadFileSync;
      JSON.parse = origJsonParse;
    }

    assert.equal(hitInjectExpr, coldInjectExpr);
    assert.equal(dHit.omniExpr, dCold.omniExpr);
    assert.equal(dHit.sidebarExpr, dCold.sidebarExpr);
    assert.equal(dHit.hostI18nExpr, dCold.hostI18nExpr);
    assert.equal(dHit.thoughtExpr, dCold.thoughtExpr);
    assert.equal(dHit.inlineDiffExpr, dCold.inlineDiffExpr);
    assert.equal(dHit.wallpaperExpr, dCold.wallpaperExpr);
    assert.equal(dHit.periodicPickerExpr, dCold.periodicPickerExpr);
    assert.equal(dHit.mascotExpr, dCold.mascotExpr);
    assert.equal(dHit.homeStudioExpr, dCold.homeStudioExpr);
    assert.equal(cacheReads, 1, 'rebuildBundle() cold hit across 10 channels must read .bundle-cache.json only once');
    assert.equal(cacheParses, 1, 'rebuildBundle() cold hit across 10 channels must JSON.parse .bundle-cache.json only once');

    const hitStats = dHit.cdp.getBundleCacheStats();
    assert.equal(hitStats.diskHits, 1);
    assert.equal(hitStats.channelDiskHits, 10);
    assert.equal(hitStats.channelHitsByName.wallpaper, 1);
    assert.equal(hitStats.channelHitsByName.periodicPicker, 1);
    assert.equal(hitStats.channelHitsByName.mascot, 1);
    assert.equal(hitStats.channelHitsByName.suggester, 1);
    assert.equal(hitStats.channelHitsByName.homeStudio, 1);
    assert.equal(hitStats.compileUnifiedRuns, 0);
    assert.equal(hitStats.channelCompileRuns, 0);

    // 3) Same-process same-length same-mtime tampering on .bundle-cache.json (WITHOUT resetBundleCacheStats) must NOT reuse stale cached root
    const stBefore = fs.statSync(cachePath);
    const rawBefore = fs.readFileSync(cachePath, 'utf8');
    const tamperedRaw = rawBefore.replace('\\"obsidian\\"', '\\"Obsidian\\"');
    assert.notEqual(tamperedRaw, rawBefore);
    assert.equal(Buffer.byteLength(tamperedRaw, 'utf8'), Buffer.byteLength(rawBefore, 'utf8'));
    fs.writeFileSync(cachePath, tamperedRaw, 'utf8');
    fs.utimesSync(cachePath, stBefore.atime, stBefore.mtime);

    const prevMisses = dHit.cdp.getBundleCacheStats().diskMisses;
    const prevWrites = dHit.cdp.getBundleCacheStats().diskWrites;
    const recoveredExpr = dHit.cdp.buildInjectExpression(dHit.cdp.readConfig(), { cachePath });
    assert.equal(recoveredExpr, coldInjectExpr, 'Same-length same-mtime tampered cache must fail open to valid bundle');
    const afterTamperStats = dHit.cdp.getBundleCacheStats();
    assert.equal(afterTamperStats.diskMisses, prevMisses + 1, 'Tampered cache must register a miss instead of reusing stale root cache');
    assert.equal(afterTamperStats.diskWrites, prevWrites + 1, 'Tampered cache must self-heal on disk');

    // 4) Deleting cache file clears root cache immediately and triggers clean rebuild
    fs.unlinkSync(cachePath);
    const afterUnlink = dHit.cdp.buildInjectExpression(dHit.cdp.readConfig(), { cachePath });
    assert.equal(afterUnlink, coldInjectExpr);
    assert.equal(fs.existsSync(cachePath), true);

    await dCold.stop(false);
    await dHit.stop(false);
  } finally {
    fs.readFileSync = origReadFileSync;
    JSON.parse = origJsonParse;
    snap.cleanup();
  }
});

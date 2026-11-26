import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..', '..');

// Phase 1 root-file allowlist ratchet (see RFC #69):
// Metadata files + existing runtime modules awaiting Phase 2 src/ migration.
// Adding new ad-hoc files to the repository root fails this gate.
const ALLOWED_ROOT_FILES = new Set([
  // Repository & package metadata
  '.gitattributes',
  '.gitignore',
  'CHANGELOG.md',
  'CITATION.cff',
  'LICENSE',
  'NOTICE',
  'README.md',
  'README.en.md',
  'README.zh-CN.md',
  'THIRD_PARTY_NOTICES.md',
  'config.example.json',
  'package.json',
  'plugin.json',
  // Legacy runtime modules pending Phase 2 src/ consolidation
  'animated-icons.js',
  'cdp.js',
  'context-menu-btw.js',
  'conv-aura.js',
  'crystal-prism-core.js',
  'dual-mascot-rig.js',
  'home-ripple-host.js',
  'home-studio-panel.js',
  'host-workbench-enhancer.js',
  'i18n-core.js',
  'i18n-locales.js',
  'inject.js',
  'model-glyph-crystal.js',
  'motion-engine.js',
  'prism-rim-canvas.js',
  'pulse-vial-bridge.js',
  'remove.js',
  'ripple-core.js',
  'settings-panel.js',
  'smooth-caret.js',
  'stream-choreography.js',
  'style.css',
  'ui-runtime.js',
  'usage-core.js',
  'vial-core.js',
]);

// Existing legacy version-stamped test files grandfathered until Phase 3 consolidation.
// New tests MUST be named by domain (or appended to existing domain tests), never v10x-* / issueXX-*.
const LEGACY_VERSIONED_TESTS = new Set([
  'v107-beta2-thought-proxy.test.mjs',
  'v107-beta2-ui.test.mjs',
  'v107-beta3-compact-ctx.test.mjs',
  'v107-beta3-installer-hardening.test.mjs',
  'v107-beta3-qa-spinner.test.mjs',
  'v107-beta3-slider-slash.test.mjs',
  'v107-beta3-update-resilience.test.mjs',
  'v107-beta3-wallpaper.test.mjs',
  'v107-beta4-features.test.mjs',
  'v107-bundle-cache.test.mjs',
  'v107-channel5-thought.test.mjs',
  'v107-channel6-inline-diff.test.mjs',
  'v107-clawd-physics.test.mjs',
  'v107-context-menu-btw.test.mjs',
  'v107-notranslate-deadcode.test.mjs',
  'v107-redteam-regressions.test.mjs',
  'v107-select-dark-contrast.test.mjs',
  'v107-settings-and-fullscreen.test.mjs',
  'v107-settings-modules-fps.test.mjs',
  'v107-sidebar-resize-perf.test.mjs',
  'v107-vram-reclaim.test.mjs',
  'v107-wave3-canvas-i18n-perf.test.mjs',
  'v107-wave3-daemon-perf.test.mjs',
  'v107-wave3-ui-perf.test.mjs',
  'v108-conv-ripple.test.mjs',
  'v108-i18n-and-host-off.test.mjs',
  'v108-issue57-58.test.mjs',
  'v108-linux-support.test.mjs',
  'v108-ls-memory-guard.test.mjs',
  'v108-periodic-lock-and-cssom.test.mjs',
  'v108-split-view-multipane.test.mjs',
  'v234-compat.test.mjs',
  'v235-effort-and-locked-selectors.test.mjs',
  'v235-sidecar-theme-sync.test.mjs',
]);

function listTrackedRootFiles() {
  try {
    const out = execFileSync('git', ['ls-files', '--', ':!*/*'], {
      cwd: ROOT,
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.includes('/'));
  } catch {
    const ignored = new Set(['config.json', '.bundle-cache.json', '.DS_Store', 'package-lock.json']);
    return fs
      .readdirSync(ROOT, { withFileTypes: true })
      .filter((d) => d.isFile() && !ignored.has(d.name))
      .map((d) => d.name);
  }
}

test('Phase 1 directory hygiene: community docs live in .github/, multilingual docs in docs/, Windows bat scripts in scripts/win/, and root stays within allowlist', () => {
  // 1) Relocated files exist at their canonical destinations
  for (const rel of [
    '.github/CONTRIBUTING.md',
    '.github/CODE_OF_CONDUCT.md',
    '.github/SECURITY.md',
    'README.en.md',
    'docs/CONTRIBUTORS.md',
    'scripts/win/inject.bat',
    'scripts/win/watch.bat',
    'scripts/win/remove.bat',
    'scripts/run-tests.mjs',
    'test/helpers/mini-dom.mjs',
  ]) {
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `Expected relocated/new file to exist: ${rel}`);
  }

  // 2) Relocated files must not remain duplicated at repository root
  for (const oldRoot of [
    'CONTRIBUTING.md',
    'CODE_OF_CONDUCT.md',
    'SECURITY.md',
    'CONTRIBUTORS.md',
    'inject.bat',
    'watch.bat',
    'remove.bat',
  ]) {
    assert.equal(fs.existsSync(path.join(ROOT, oldRoot)), false, `Relocated file must not remain at root: ${oldRoot}`);
  }

  // 3) Root file allowlist ratchet (prevents new ad-hoc files from accumulating at root)
  const trackedRoot = listTrackedRootFiles();
  const unexpected = trackedRoot.filter((f) => !ALLOWED_ROOT_FILES.has(f));
  assert.deepEqual(
    unexpected,
    [],
    `Unexpected root file(s) outside allowlist (place docs in docs/, governance in .github/, scripts in scripts/): ${unexpected.join(', ')}`
  );

  // 4) Windows helper .bat scripts resolve repo root two levels up from scripts/win/
  const injectBat = fs.readFileSync(path.join(ROOT, 'scripts', 'win', 'inject.bat'), 'utf8');
  const watchBat = fs.readFileSync(path.join(ROOT, 'scripts', 'win', 'watch.bat'), 'utf8');
  const removeBat = fs.readFileSync(path.join(ROOT, 'scripts', 'win', 'remove.bat'), 'utf8');
  assert.ok(injectBat.includes('..\\..\\inject.js'), 'scripts/win/inject.bat must resolve ../../inject.js');
  assert.ok(watchBat.includes('..\\..\\inject.js'), 'scripts/win/watch.bat must resolve ../../inject.js');
  assert.ok(removeBat.includes('..\\..\\remove.js'), 'scripts/win/remove.bat must resolve ../../remove.js');
});

test('Phase 1 documentation relative links and image assets resolve to real files on disk', () => {
  const docsToCheck = ['README.md', 'README.en.md', 'docs/CONTRIBUTORS.md', 'CHANGELOG.md'];
  for (const relDoc of docsToCheck) {
    const absDoc = path.join(ROOT, relDoc);
    const rawContent = fs.readFileSync(absDoc, 'utf8');
    // Strip fenced code blocks and inline code spans so illustrative snippets like `<a href="http...">` are not parsed as links
    const content = rawContent.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]+`/g, '');
    const docDir = path.dirname(absDoc);

    // Check markdown links ](relative-path) and HTML src/srcset/href="relative-path"
    const mdLinks = [...content.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]);
    const htmlRefs = [...content.matchAll(/\b(?:src|srcset|href)="([^"]+)"/g)].map((m) => m[1]);
    for (const rawRef of [...mdLinks, ...htmlRefs]) {
      if (/^(?:https?:|mailto:|#)/i.test(rawRef)) continue;
      const cleanRef = rawRef.split('#')[0].split('?')[0];
      if (!cleanRef) continue;
      const target = path.resolve(docDir, cleanRef);
      assert.ok(
        fs.existsSync(target),
        `Broken relative link in ${relDoc}: "${rawRef}" (resolved to ${path.relative(ROOT, target)})`
      );
    }
  }
});

test('Phase 1 test naming ratchet & package.json fast/gates scripts + shared MiniDOM helper', async () => {
  // 1) Block new version-stamped or issue-stamped test filenames
  const testEntries = fs.readdirSync(path.join(ROOT, 'test'), { withFileTypes: true });
  const badNewVersioned = testEntries
    .filter((d) => d.isFile() && d.name.endsWith('.test.mjs'))
    .map((d) => d.name)
    .filter((name) => /^(?:v\d+|issue\d+)-/i.test(name) && !LEGACY_VERSIONED_TESTS.has(name));
  assert.deepEqual(
    badNewVersioned,
    [],
    `New tests must be named by domain or appended to an existing domain test (not v10x-*/issueXX-*): ${badNewVersioned.join(', ')}`
  );

  // 2) package.json exposes test:gates and test:fast, and npm test includes test/gates/
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.ok(
    typeof pkg.scripts['test:gates'] === 'string' &&
      (pkg.scripts['test:gates'].includes('--gates') || pkg.scripts['test:gates'].includes('test/gates/')),
    'package.json must expose test:gates'
  );
  assert.ok(typeof pkg.scripts['test:fast'] === 'string' && pkg.scripts['test:fast'].includes('run-tests.mjs'), 'package.json must expose test:fast');
  assert.ok(pkg.scripts.test.includes('test/gates/'), 'npm test must include test/gates/*.test.mjs');

  // 3) Shared test/helpers/mini-dom.mjs works cleanly
  const helperMod = await import('../helpers/mini-dom.mjs');
  assert.equal(typeof helperMod.createSettingsMiniDom, 'function');
  assert.equal(typeof helperMod.assertFileHygiene, 'function');
  assert.equal(typeof helperMod.assertCssHygiene, 'function');
  const { doc, dialog, panel } = helperMod.createSettingsMiniDom();
  assert.equal(doc.querySelector('[role="dialog"]'), dialog);
  assert.ok(panel.querySelector('div.space-y-2'));
  helperMod.assertFileHygiene([
    path.join(ROOT, 'test/helpers/mini-dom.mjs'),
    path.join(ROOT, 'test/gates/repo-hygiene.test.mjs'),
    path.join(ROOT, 'scripts/run-tests.mjs'),
  ]);
});

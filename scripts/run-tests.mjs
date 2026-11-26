#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const args = new Set(process.argv.slice(2));
const fastMode = args.has('--fast');
const gatesOnly = args.has('--gates');

// Heavy integration / installer-build / long-timer suites skipped in --fast local dev loop
// (always included in full `npm test` and CI).
const SLOW_INTEGRATION_TESTS = new Set([
  'auto-update.test.mjs',
  'bundle.test.mjs',
  'inline-diff-rpc.test.mjs',
  'installer.test.mjs',
  'macos-installer.test.mjs',
  'omni-server.test.mjs',
  'prompt-suggester.test.mjs',
  'security-daemon.test.mjs',
  'uninstall-and-storage.test.mjs',
  'v107-beta2-thought-proxy.test.mjs',
  'v107-beta3-installer-hardening.test.mjs',
  'v107-beta3-update-resilience.test.mjs',
  'v107-wave3-daemon-perf.test.mjs',
  'v108-ls-memory-guard.test.mjs',
  'vendor-coexist.test.mjs',
]);

function collectTests(dir, filterFn = () => true) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith('.test.mjs') && filterFn(d.name))
    .map((d) => path.relative(ROOT, path.join(dir, d.name)))
    .sort();
}

const gateFiles = collectTests(path.join(ROOT, 'test', 'gates'));
const rootTestFiles = gatesOnly
  ? []
  : collectTests(path.join(ROOT, 'test'), (name) => !fastMode || !SLOW_INTEGRATION_TESTS.has(name));

const files = [...gateFiles, ...rootTestFiles];
if (files.length === 0) {
  console.error('No test files matched.');
  process.exit(1);
}

const concurrency = Math.min(4, Math.max(2, typeof os.availableParallelism === 'function' ? os.availableParallelism() : 4));
const res = spawnSync(process.execPath, ['--test', `--test-concurrency=${concurrency}`, ...files], {
  cwd: ROOT,
  stdio: 'inherit',
});

process.exit(res.status ?? 1);

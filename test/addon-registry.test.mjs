import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  AddonRegistry,
  MAX_MANIFEST_BYTES,
  isLabEnabled,
  isTrustedAddonUrl,
  isValidSemver,
  validateSafeRelativePath,
  validateAddonManifest,
  validateAddonsDir,
  resolveSafeAddonsDir,
} from '../sidecars/daemon/addon-registry.mjs';
import { PrismDaemon } from '../sidecars/daemon/main.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function mkTempDir(prefix) {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

function sha256Hex(content) {
  return crypto.createHash('sha256').update(Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8')).digest('hex');
}

function makeMockResponse({ status = 200, headers = {}, body = '' } = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf8');
  const hdrMap = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: (name) => hdrMap.get(String(name).toLowerCase()) ?? null,
    },
    body: {
      getReader() {
        let sent = false;
        return {
          async read() {
            if (sent) return { done: true, value: undefined };
            sent = true;
            return { done: false, value: new Uint8Array(buf) };
          },
          async cancel() {},
          releaseLock() {},
        };
      },
      async cancel() {},
    },
    async arrayBuffer() {
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    },
    async text() {
      return buf.toString('utf8');
    },
  };
}

function createDirLink(targetDir, linkPath) {
  const linkType = process.platform === 'win32' ? 'junction' : 'dir';
  fs.symlinkSync(targetDir, linkPath, linkType);
}

test('isTrustedAddonUrl enforces HTTPS allowlist, RMvdesi/obsidian-prism repo prefix, and blocks ports/userInfo/traversal', () => {
  // 允许的白名单 URL
  const allowed = [
    'https://github.com/RMvdesi/obsidian-prism/releases/download/v1.0.8/manifest.json',
    'https://raw.githubusercontent.com/RMvdesi/obsidian-prism/main/addons/demo/manifest.json',
    'https://api.github.com/repos/RMvdesi/obsidian-prism/releases/latest',
    'https://objects.githubusercontent.com/github-production-release-asset-123/asset.js?sig=abc',
    'https://release-assets.githubusercontent.com/asset/foo.js',
    'https://github-releases.githubusercontent.com/1234/demo.js',
  ];
  for (const url of allowed) {
    assert.equal(isTrustedAddonUrl(url), true, `Expected trusted URL to pass: ${url}`);
  }

  // 严禁的非白名单 / SSRF / 绕过 URL
  const blocked = [
    '',
    'http://github.com/RMvdesi/obsidian-prism/releases/download/v1.0.8/manifest.json',
    'file:///etc/passwd',
    'data:application/json,{}',
    'https://github.com:443/RMvdesi/obsidian-prism/releases/download/v1.0.8/manifest.json',
    'https://github.com:8443/RMvdesi/obsidian-prism/releases/download/v1.0.8/manifest.json',
    'https://objects.githubusercontent.com:443/asset.js',
    'https://user@github.com/RMvdesi/obsidian-prism/releases/download/v1.0.8/manifest.json',
    'https://user:pass@raw.githubusercontent.com/RMvdesi/obsidian-prism/main/a.json',
    'https://evil.example.com/RMvdesi/obsidian-prism/manifest.json',
    'https://github.com.evil.com/RMvdesi/obsidian-prism/manifest.json',
    'https://127.0.0.1/RMvdesi/obsidian-prism/manifest.json',
    'https://169.254.169.254/latest/meta-data/',
    'https://github.com/other-org/obsidian-prism/releases/download/v1/manifest.json',
    'https://github.com/RMvdesi/obsidian-prism-evil/releases/download/v1/manifest.json',
    'https://raw.githubusercontent.com/attacker/obsidian-prism/main/manifest.json',
    'https://api.github.com/repos/attacker/obsidian-prism/releases/latest',
    'https://github.com/RMvdesi/obsidian-prism/',
    'https://github.com/RMvdesi/obsidian-prism/../attacker/repo/manifest.json',
    'https://github.com/RMvdesi/obsidian-prism/%2e%2e/attacker/manifest.json',
    'https://raw.githubusercontent.com/RMvdesi/obsidian-prism/main/a%5cb.js',
    'https://objects.githubusercontent.com/a%00b.js',
  ];
  for (const url of blocked) {
    assert.equal(isTrustedAddonUrl(url), false, `Expected untrusted URL to be rejected: ${url}`);
  }
});

test('validateSafeRelativePath and validateAddonManifest block traversal, absolute paths, drives, backslashes, and bad schemas', () => {
  assert.equal(validateSafeRelativePath('index.js').ok, true);
  assert.equal(validateSafeRelativePath('lib/sub/worker.mjs').ok, true);

  const badRelPaths = [
    '',
    '../escape.js',
    'a/../b.js',
    './index.js',
    '/etc/passwd',
    '\\windows\\system32\\cmd.exe',
    'a\\b.js',
    'C:/temp/a.js',
    'C:rel.js',
    'file.js:ads',
    'bad\0name.js',
    'trailing-slash/',
    'trailing-dot.',
    'trailing-space ',
    'CON.js',
    'sub/NUL',
    'conversations_archive/hack.js',
    'prism-knowledge-space/hack.js',
    'antigravity-spark/hack.js',
    '.git/config',
    'manifest.json',
  ];
  for (const p of badRelPaths) {
    assert.equal(validateSafeRelativePath(p).ok, false, `Expected bad relative path rejected: ${JSON.stringify(p)}`);
  }

  assert.equal(isValidSemver('1.0.8'), true);
  assert.equal(isValidSemver('1.0.8-beta.2'), true);
  assert.equal(isValidSemver('1.0.8-'), false);
  assert.equal(isValidSemver('not-a-version'), false);

  const goodSha = sha256Hex('console.log(1);');
  const manifestUrl = 'https://raw.githubusercontent.com/RMvdesi/obsidian-prism/main/addons/sample/manifest.json';
  const okManifest = validateAddonManifest(
    {
      id: 'sample-addon',
      version: '1.2.3',
      entry: 'index.js',
      files: [{ path: 'index.js', sha256: goodSha }],
    },
    { manifestUrl }
  );
  assert.equal(okManifest.ok, true);
  assert.equal(
    okManifest.manifest.files[0].url,
    'https://raw.githubusercontent.com/RMvdesi/obsidian-prism/main/addons/sample/index.js'
  );

  // 非法 ID / 非法 SHA / entry 不在 files[] / 非白名单 file.url
  assert.equal(
    validateAddonManifest({ id: 'Bad_ID', version: '1.0.0', files: [{ path: 'a.js', sha256: goodSha }] }, { manifestUrl }).ok,
    false
  );
  assert.equal(
    validateAddonManifest({ id: 'a', version: '1.0.0', files: [{ path: 'a.js', sha256: goodSha }] }, { manifestUrl }).ok,
    false
  );
  assert.equal(
    validateAddonManifest({ id: 'valid-id', version: '1.0.0', files: [{ path: 'a.js', sha256: 'short' }] }, { manifestUrl }).ok,
    false
  );
  assert.equal(
    validateAddonManifest(
      { id: 'valid-id', version: '1.0.0', entry: 'missing.js', files: [{ path: 'a.js', sha256: goodSha }] },
      { manifestUrl }
    ).ok,
    false
  );
  assert.equal(
    validateAddonManifest(
      {
        id: 'valid-id',
        version: '1.0.0',
        files: [{ path: 'a.js', sha256: goodSha, url: 'https://evil.example.com/a.js' }],
      },
      { manifestUrl }
    ).ok,
    false
  );
});

test('AddonRegistry bundled periodic-picker status performs strictly 0 network calls and cannot be removed or overridden', async () => {
  const tmpDir = mkTempDir('prism-addon-bundled-');
  let fetchCalls = 0;
  try {
    const addonsDir = path.join(tmpDir, 'addons');
    const registry = new AddonRegistry({
      rootDir: ROOT,
      addonsDir,
      fetchFn: async () => {
        fetchCalls += 1;
        throw new Error('unexpected_network_call');
      },
    });

    const listRes = registry.listAddons();
    assert.equal(listRes.ok, true);
    assert.equal(fetchCalls, 0, 'listAddons must make 0 network requests');
    const periodic = listRes.addons.find((a) => a.id === 'periodic-picker');
    assert.ok(periodic, 'periodic-picker bundled declaration must be present');
    assert.equal(periodic.kind, 'bundled');
    assert.equal(periodic.entry, 'vendor/periodic-picker/periodic-picker.js');
    assert.equal(periodic.installed, true);
    assert.equal(periodic.available, true);
    assert.equal(periodic.removable, false);

    const statusRes = registry.getAddonStatus('periodic-picker');
    assert.equal(statusRes.ok, true);
    assert.equal(statusRes.addon.kind, 'bundled');
    assert.equal(statusRes.addon.installed, true);
    assert.equal(fetchCalls, 0, 'getAddonStatus must make 0 network requests');

    const missingRes = registry.getAddonStatus('uninstalled-demo');
    assert.equal(missingRes.ok, true);
    assert.equal(missingRes.addon.installed, false);
    assert.equal(fetchCalls, 0);

    // 禁止卸载 bundled 模块
    const rmBundled = registry.remove('periodic-picker');
    assert.equal(rmBundled.ok, false);
    assert.equal(rmBundled.error, 'cannot_remove_bundled_addon');

    // 未执行 install 时不得提前创建 addonsDir 污染磁盘
    assert.equal(fs.existsSync(addonsDir), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('AddonRegistry install verifies redirects, memory SHA-256, atomic rename, upgrade rollback, and leaves zero disk residue on mismatch', async () => {
  const tmpDir = mkTempDir('prism-addon-install-');
  try {
    const addonsDir = path.join(tmpDir, 'addons');
    const file1Body = 'export const hello = () => "v1";\n';
    const file2Body = 'export const helper = 42;\n';
    const manifestUrl = 'https://github.com/RMvdesi/obsidian-prism/releases/download/v1.0.8/manifest.json';
    const cdnFile1Url = 'https://objects.githubusercontent.com/github-production-release-asset-1/index.js';
    const file2Url = 'https://raw.githubusercontent.com/RMvdesi/obsidian-prism/main/addons/demo-pack/lib/helper.js';

    const manifestObj = {
      id: 'demo-pack',
      version: '1.0.0',
      name: 'Demo Pack',
      entry: 'index.js',
      files: [
        {
          path: 'index.js',
          url: 'https://github.com/RMvdesi/obsidian-prism/releases/download/v1.0.8/index.js',
          sha256: sha256Hex(file1Body),
          size: Buffer.byteLength(file1Body),
        },
        {
          path: 'lib/helper.js',
          url: file2Url,
          sha256: sha256Hex(file2Body),
          size: Buffer.byteLength(file2Body),
        },
      ],
    };

    const seenRedirectModes = [];
    const routes = new Map([
      [manifestUrl, () => makeMockResponse({ status: 200, body: JSON.stringify(manifestObj) })],
      [
        'https://github.com/RMvdesi/obsidian-prism/releases/download/v1.0.8/index.js',
        () => makeMockResponse({ status: 302, headers: { location: cdnFile1Url } }),
      ],
      [cdnFile1Url, () => makeMockResponse({ status: 200, body: file1Body })],
      [file2Url, () => makeMockResponse({ status: 200, body: file2Body })],
    ]);

    const registry = new AddonRegistry({
      rootDir: ROOT,
      addonsDir,
      fetchFn: async (url, opts) => {
        seenRedirectModes.push(opts?.redirect);
        const handler = routes.get(url);
        if (!handler) return makeMockResponse({ status: 404 });
        return handler();
      },
    });

    // 1) 正常安装（含合法 302 跳转至 objects.githubusercontent.com）
    const res = await registry.install({ manifestUrl });
    assert.equal(res.ok, true);
    assert.equal(res.id, 'demo-pack');
    assert.equal(res.version, '1.0.0');
    assert.equal(res.filesCount, 2);
    assert.ok(seenRedirectModes.every((m) => m === 'manual'), 'Every fetch must enforce redirect: manual');

    const installedDir = path.join(addonsDir, 'demo-pack');
    assert.equal(fs.readFileSync(path.join(installedDir, 'index.js'), 'utf8'), file1Body);
    assert.equal(fs.readFileSync(path.join(installedDir, 'lib', 'helper.js'), 'utf8'), file2Body);
    assert.equal(fs.existsSync(path.join(installedDir, 'manifest.json')), true);
    // 无残留隐藏 staging/backup 目录
    assert.deepEqual(fs.readdirSync(addonsDir), ['demo-pack']);

    // 列出与状态查询可见
    const status = registry.getAddonStatus('demo-pack');
    assert.equal(status.ok, true);
    assert.equal(status.addon.installed, true);
    assert.equal(status.addon.version, '1.0.0');

    // 1b) 覆盖升级时若新版本 SHA-256 失败，旧版本文件 100% 完好无损；验签通过则原子替换为 v2
    const v2BadUrl = 'https://raw.githubusercontent.com/RMvdesi/obsidian-prism/main/addons/demo-pack/v2-bad.json';
    const v2TamperedFileUrl = 'https://raw.githubusercontent.com/RMvdesi/obsidian-prism/main/addons/demo-pack/v2-tampered.js';
    routes.set(v2BadUrl, () =>
      makeMockResponse({
        status: 200,
        body: JSON.stringify({
          id: 'demo-pack',
          version: '2.0.0',
          entry: 'index.js',
          files: [{ path: 'index.js', url: v2TamperedFileUrl, sha256: sha256Hex('good-v2') }],
        }),
      })
    );
    routes.set(v2TamperedFileUrl, () => makeMockResponse({ status: 200, body: 'corrupted-v2' }));
    const v2BadRes = await registry.install({ manifestUrl: v2BadUrl });
    assert.equal(v2BadRes.ok, false);
    assert.equal(v2BadRes.error, 'sha256_mismatch');
    assert.equal(fs.readFileSync(path.join(installedDir, 'index.js'), 'utf8'), file1Body, 'Existing v1 must remain intact on failed upgrade');

    const v2Body = 'export const hello = () => "v2";\n';
    const v2GoodUrl = 'https://raw.githubusercontent.com/RMvdesi/obsidian-prism/main/addons/demo-pack/v2-good.json';
    const v2FileUrl = 'https://raw.githubusercontent.com/RMvdesi/obsidian-prism/main/addons/demo-pack/v2.js';
    routes.set(v2GoodUrl, () =>
      makeMockResponse({
        status: 200,
        body: JSON.stringify({
          id: 'demo-pack',
          version: '2.0.0',
          entry: 'index.js',
          files: [{ path: 'index.js', url: v2FileUrl, sha256: sha256Hex(v2Body) }],
        }),
      })
    );
    routes.set(v2FileUrl, () => makeMockResponse({ status: 200, body: v2Body }));
    const v2GoodRes = await registry.install({ manifestUrl: v2GoodUrl });
    assert.equal(v2GoodRes.ok, true);
    assert.equal(v2GoodRes.version, '2.0.0');
    assert.equal(fs.readFileSync(path.join(installedDir, 'index.js'), 'utf8'), v2Body);
    assert.equal(fs.existsSync(path.join(installedDir, 'lib', 'helper.js')), false, 'Old v1 files must be atomically replaced');
    assert.deepEqual(fs.readdirSync(addonsDir), ['demo-pack'], 'No .backup-* or .staging-* residue after upgrade');

    // 1c) 单文件超过 maxFileBytes 上限时拒绝写盘
    const cappedRegistry = new AddonRegistry({
      rootDir: ROOT,
      addonsDir,
      maxFileBytes: 2048,
      fetchFn: async (url) => {
        const handler = routes.get(url);
        return handler ? handler() : makeMockResponse({ status: 404 });
      },
    });
    const bigFileBuf = Buffer.alloc(4096, 0x61);
    const bigFileManifestUrl = 'https://raw.githubusercontent.com/RMvdesi/obsidian-prism/main/addons/too-big/manifest.json';
    const bigFileUrl = 'https://raw.githubusercontent.com/RMvdesi/obsidian-prism/main/addons/too-big/big.bin';
    routes.set(bigFileManifestUrl, () =>
      makeMockResponse({
        status: 200,
        body: JSON.stringify({
          id: 'too-big',
          version: '1.0.0',
          files: [{ path: 'big.bin', url: bigFileUrl, sha256: sha256Hex(bigFileBuf) }],
        }),
      })
    );
    routes.set(bigFileUrl, () => makeMockResponse({ status: 200, body: bigFileBuf }));
    const bigFileRes = await cappedRegistry.install({ manifestUrl: bigFileManifestUrl });
    assert.equal(bigFileRes.ok, false);
    assert.equal(bigFileRes.error, 'payload_too_large');
    assert.equal(fs.existsSync(path.join(addonsDir, 'too-big')), false);

    // 2) SHA-256 不匹配：全新安装拒绝写盘，零目录残留
    const badManifestUrl = 'https://raw.githubusercontent.com/RMvdesi/obsidian-prism/main/addons/bad-sha/manifest.json';
    const badFileUrl = 'https://raw.githubusercontent.com/RMvdesi/obsidian-prism/main/addons/bad-sha/main.js';
    routes.set(badManifestUrl, () =>
      makeMockResponse({
        status: 200,
        body: JSON.stringify({
          id: 'bad-sha',
          version: '1.0.0',
          files: [{ path: 'main.js', url: badFileUrl, sha256: sha256Hex('expected-content') }],
        }),
      })
    );
    routes.set(badFileUrl, () => makeMockResponse({ status: 200, body: 'tampered-content!' }));

    const badRes = await registry.install({ manifestUrl: badManifestUrl });
    assert.equal(badRes.ok, false);
    assert.equal(badRes.error, 'sha256_mismatch');
    assert.equal(fs.existsSync(path.join(addonsDir, 'bad-sha')), false, 'Target dir must not exist on SHA-256 mismatch');
    assert.deepEqual(fs.readdirSync(addonsDir), ['demo-pack'], 'No staging residue allowed after failure');

    // 3) 302 跨站劫持与超过 5 跳拦截
    const hijackUrl = 'https://github.com/RMvdesi/obsidian-prism/releases/download/v1.0.8/hijack.json';
    routes.set(hijackUrl, () =>
      makeMockResponse({ status: 302, headers: { location: 'https://evil.example.com/steal.json' } })
    );
    const hijackRes = await registry.install({ manifestUrl: hijackUrl });
    assert.equal(hijackRes.ok, false);
    assert.equal(hijackRes.error, 'untrusted_redirect_url');

    const crossRepoHijack = 'https://github.com/RMvdesi/obsidian-prism/releases/download/v1.0.8/cross-repo.json';
    routes.set(crossRepoHijack, () =>
      makeMockResponse({ status: 302, headers: { location: 'https://github.com/attacker/evil/manifest.json' } })
    );
    const crossRepoRes = await registry.install({ manifestUrl: crossRepoHijack });
    assert.equal(crossRepoRes.ok, false);
    assert.equal(crossRepoRes.error, 'untrusted_redirect_url');

    const portRedirect = 'https://github.com/RMvdesi/obsidian-prism/releases/download/v1.0.8/port.json';
    routes.set(portRedirect, () =>
      makeMockResponse({ status: 302, headers: { location: 'https://objects.githubusercontent.com:443/a.json' } })
    );
    const portRes = await registry.install({ manifestUrl: portRedirect });
    assert.equal(portRes.ok, false);
    assert.equal(portRes.error, 'untrusted_redirect_url');

    // 超过 5 跳重定向循环
    const loopUrl = 'https://github.com/RMvdesi/obsidian-prism/releases/download/v1.0.8/loop.json';
    routes.set(loopUrl, () => makeMockResponse({ status: 302, headers: { location: loopUrl } }));
    const loopRes = await registry.install({ manifestUrl: loopUrl });
    assert.equal(loopRes.ok, false);
    assert.equal(loopRes.error, 'too_many_redirects');

    // 4) 超大 manifest (> 512 KiB) 拦截
    const hugeManifestUrl = 'https://raw.githubusercontent.com/RMvdesi/obsidian-prism/main/addons/huge/manifest.json';
    routes.set(hugeManifestUrl, () =>
      makeMockResponse({ status: 200, body: Buffer.alloc(MAX_MANIFEST_BYTES + 64, 0x20) })
    );
    const hugeRes = await registry.install({ manifestUrl: hugeManifestUrl });
    assert.equal(hugeRes.ok, false);
    assert.equal(hugeRes.error, 'payload_too_large');

    // 5) 禁止覆盖内置 bundled periodic-picker
    const spoofBundledUrl = 'https://raw.githubusercontent.com/RMvdesi/obsidian-prism/main/addons/spoof/manifest.json';
    routes.set(spoofBundledUrl, () =>
      makeMockResponse({
        status: 200,
        body: JSON.stringify({
          id: 'periodic-picker',
          version: '9.9.9',
          files: [{ path: 'index.js', url: file2Url, sha256: sha256Hex(file2Body) }],
        }),
      })
    );
    const spoofRes = await registry.install({ manifestUrl: spoofBundledUrl });
    assert.equal(spoofRes.ok, false);
    assert.equal(spoofRes.error, 'cannot_override_bundled_addon');

    // 6) 安全卸载外部扩展
    const rmRes = registry.remove('demo-pack');
    assert.equal(rmRes.ok, true);
    assert.equal(rmRes.removed, true);
    assert.equal(fs.existsSync(installedDir), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('AddonRegistry blocks symlink/junction targets, redline addonsDir, and hijacked AG_PRISM_ADDONS_DIR', async () => {
  const tmpDir = mkTempDir('prism-addon-sym-');
  try {
    // 1) 红线目录与越权外部目录必须拒绝
    assert.equal(validateAddonsDir(path.join(tmpDir, 'conversations_archive', 'addons')).ok, false);
    assert.equal(validateAddonsDir(path.join(tmpDir, 'prism-knowledge-space', 'addons')).ok, false);
    assert.equal(validateAddonsDir(path.join(tmpDir, 'Antigravity-Spark', 'addons')).ok, false);
    assert.throws(
      () => new AddonRegistry({ rootDir: ROOT, addonsDir: path.join(tmpDir, 'conversations_archive', 'addons') }),
      /redline_addons_dir/
    );

    // 2) 非法 AG_PRISM_ADDONS_DIR 环境变量：resolveSafeAddonsDir 返回 null，constructor 拒绝采纳并回退默认安全路径
    const evilEnvDir = path.join(tmpDir, 'unrelated-folder');
    fs.mkdirSync(evilEnvDir, { recursive: true });
    assert.equal(resolveSafeAddonsDir({ env: { AG_PRISM_ADDONS_DIR: evilEnvDir } }), null);
    const validEnvDir = path.join(tmpDir, 'obsidian-prism', 'addons');
    assert.equal(resolveSafeAddonsDir({ env: { AG_PRISM_ADDONS_DIR: validEnvDir } }), path.resolve(validEnvDir));

    const regWithBadEnv = new AddonRegistry({
      rootDir: ROOT,
      homeDir: tmpDir,
      env: { AG_PRISM_ADDONS_DIR: evilEnvDir },
    });
    assert.equal(regWithBadEnv._rejectedEnvAddonsDir, true);
    assert.notEqual(regWithBadEnv.addonsDir, path.resolve(evilEnvDir));

    // 3) symlink / junction 目标在 install 与 remove 时均 100% 拒绝且不触碰外部目录
    const addonsDir = path.join(tmpDir, 'safe-addons');
    const outsideVictim = path.join(tmpDir, 'outside-victim');
    fs.mkdirSync(addonsDir, { recursive: true });
    fs.mkdirSync(outsideVictim, { recursive: true });
    const victimFile = path.join(outsideVictim, 'precious.txt');
    fs.writeFileSync(victimFile, 'do-not-touch', 'utf8');

    const symAddonTarget = path.join(addonsDir, 'linked-addon');
    createDirLink(outsideVictim, symAddonTarget);

    const payload = 'export const x = 1;\n';
    const manifestUrl = 'https://raw.githubusercontent.com/RMvdesi/obsidian-prism/main/addons/linked-addon/manifest.json';
    const fileUrl = 'https://raw.githubusercontent.com/RMvdesi/obsidian-prism/main/addons/linked-addon/index.js';
    const registry = new AddonRegistry({
      rootDir: ROOT,
      addonsDir,
      fetchFn: async (url) => {
        if (url === manifestUrl) {
          return makeMockResponse({
            status: 200,
            body: JSON.stringify({
              id: 'linked-addon',
              version: '1.0.0',
              files: [{ path: 'index.js', url: fileUrl, sha256: sha256Hex(payload) }],
            }),
          });
        }
        return makeMockResponse({ status: 200, body: payload });
      },
    });

    const installOverLink = await registry.install({ manifestUrl });
    assert.equal(installOverLink.ok, false);
    assert.equal(installOverLink.error, 'refused_symlink_target');
    assert.equal(fs.readFileSync(victimFile, 'utf8'), 'do-not-touch');
    assert.equal(fs.existsSync(path.join(outsideVictim, 'index.js')), false);

    const removeLink = registry.remove('linked-addon');
    assert.equal(removeLink.ok, false);
    assert.equal(removeLink.error, 'refused_symlink_target');
    assert.equal(fs.readFileSync(victimFile, 'utf8'), 'do-not-touch');

    // listAddons 也必须忽略 symlink 目录
    const listed = registry.listAddons();
    assert.equal(listed.addons.some((a) => a.id === 'linked-addon'), false);

    // 4) 拒绝非合法 addonId 路径穿越删除
    assert.equal(registry.remove('../outside-victim').ok, false);
    assert.equal(fs.readFileSync(victimFile, 'utf8'), 'do-not-touch');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('PrismDaemon executeRepoAction gates addons-* behind OBSIDIAN_PRISM_ADDONS_LAB=1 (Fail-Closed by default)', async () => {
  const tmpDir = mkTempDir('prism-addon-daemon-');
  const prevLab = process.env.OBSIDIAN_PRISM_ADDONS_LAB;
  let fetchCalls = 0;
  try {
    const addonsDir = path.join(tmpDir, 'addons');
    const codeBody = 'export const ok = true;\n';
    const manifestUrl = 'https://raw.githubusercontent.com/RMvdesi/obsidian-prism/main/addons/lab-mod/manifest.json';
    const codeUrl = 'https://raw.githubusercontent.com/RMvdesi/obsidian-prism/main/addons/lab-mod/mod.js';

    const registry = new AddonRegistry({
      rootDir: ROOT,
      addonsDir,
      fetchFn: async (url) => {
        fetchCalls += 1;
        if (url === manifestUrl) {
          return makeMockResponse({
            status: 200,
            body: JSON.stringify({
              id: 'lab-mod',
              version: '1.0.0',
              files: [{ path: 'mod.js', url: codeUrl, sha256: sha256Hex(codeBody) }],
            }),
          });
        }
        return makeMockResponse({ status: 200, body: codeBody });
      },
    });

    const daemon = new PrismDaemon({
      rootDir: ROOT,
      _testAddonRegistry: registry,
      enableAutoUpdateTimer: false,
      enableStorageGuardTimer: false,
      silent: true,
    });

    // 1) 未开启或非严格 '1' 时全部 Fail-Closed
    for (const val of [undefined, '', '0', 'true', '1 ']) {
      if (val === undefined) delete process.env.OBSIDIAN_PRISM_ADDONS_LAB;
      else process.env.OBSIDIAN_PRISM_ADDONS_LAB = val;
      assert.equal(isLabEnabled(), false);

      for (const action of ['addons-list', 'addons-status', 'addons-install', 'addons-remove']) {
        const denied = await daemon.executeRepoAction({ action, id: 'periodic-picker', manifestUrl });
        assert.equal(denied.ok, false);
        assert.equal(denied.action, action);
        assert.equal(denied.error, 'addons_lab_disabled');
      }
    }
    assert.equal(fetchCalls, 0, 'Lab-disabled calls must never trigger network access');

    // 2) 开启 OBSIDIAN_PRISM_ADDONS_LAB === '1' 后正常暴露受控调试接口
    process.env.OBSIDIAN_PRISM_ADDONS_LAB = '1';
    assert.equal(isLabEnabled(), true);

    const listRes = await daemon.executeRepoAction({ action: 'addons-list' });
    assert.equal(listRes.ok, true);
    assert.equal(listRes.labEnabled, true);
    assert.equal(listRes.addons.some((a) => a.id === 'periodic-picker' && a.kind === 'bundled'), true);
    assert.equal(fetchCalls, 0);

    const statusRes = await daemon.executeRepoAction({ action: 'addons-status', id: 'periodic-picker' });
    assert.equal(statusRes.ok, true);
    assert.equal(statusRes.addon.id, 'periodic-picker');
    assert.equal(statusRes.addon.installed, true);
    assert.equal(fetchCalls, 0);

    const instRes = await daemon.executeRepoAction({ action: 'addons-install', manifestUrl });
    assert.equal(instRes.ok, true);
    assert.equal(instRes.id, 'lab-mod');
    assert.equal(fs.existsSync(path.join(addonsDir, 'lab-mod', 'mod.js')), true);

    const rmRes = await daemon.executeRepoAction({ action: 'addons-remove', id: 'lab-mod' });
    assert.equal(rmRes.ok, true);
    assert.equal(rmRes.removed, true);
    assert.equal(fs.existsSync(path.join(addonsDir, 'lab-mod')), false);
  } finally {
    if (prevLab === undefined) delete process.env.OBSIDIAN_PRISM_ADDONS_LAB;
    else process.env.OBSIDIAN_PRISM_ADDONS_LAB = prevLab;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

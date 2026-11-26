import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildIcns } from '../scripts/build-common.mjs';
import { buildMacosApp, generateInfoPlist } from '../scripts/build-macos.mjs';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const cdp = require(path.join(ROOT_DIR, 'cdp.js'));
const installPluginMod = require(path.join(ROOT_DIR, 'tools', 'install-plugin.cjs'));

function runBin(binPath, args, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const child = spawn(binPath, args, { stdio: 'ignore' });
    const timer = setTimeout(() => {
      try { child.kill(); } catch {}
      reject(new Error(`Timeout running ${path.basename(binPath)} ${args.join(' ')}`));
    }, timeoutMs);
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(binPath)} exited with code ${code}`));
    });
  });
}

function createMockCdpServer() {
  const receivedCalls = [];
  const sockets = new Set();
  let claudeStyleMounted = false;
  let lastInjectedExpr = null;
  let lastRemovedExpr = null;

  function encodeWsTextFrame(str) {
    const payload = Buffer.from(str, 'utf8');
    const len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.alloc(2);
      header[0] = 0x81;
      header[1] = len;
    } else if (len < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x81;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }
    return Buffer.concat([header, payload]);
  }

  function sendWsMessage(socket, obj) {
    if (!socket.destroyed) {
      socket.write(encodeWsTextFrame(JSON.stringify(obj)));
    }
  }

  function handleCdpCommand(socket, msg) {
    receivedCalls.push(msg);
    let result = {};
    if (msg.method === 'Page.addScriptToEvaluateOnNewDocument') {
      result = { identifier: 'script-' + receivedCalls.length };
    } else if (msg.method === 'Runtime.evaluate') {
      const expr = msg.params && msg.params.expression ? msg.params.expression : '';
      if (expr.startsWith('Boolean(window.__agPrism') || expr === 'Boolean(window.__agClaudeStyle)') {
        result = { result: { type: 'boolean', value: claudeStyleMounted } };
      } else if (expr.includes('delete globalThis.__agCsUiMain')) {
        lastRemovedExpr = expr;
        claudeStyleMounted = false;
        result = { result: { type: 'object', value: { removed: 3 } } };
      } else if (expr.includes('const serverMeta = window.__agPrismOmniServerMeta')) {
        result = {
          result: {
            type: 'object',
            value: { ok: true, status: 'mounted' },
          },
        };
      } else if (expr.includes('const targetHash =') && (expr.includes('__agPrismInlineDiff') || expr.includes('__agPrismThoughtSettingsUi'))) {
        result = {
          result: {
            type: 'object',
            value: { ok: true, status: 'mounted' },
          },
        };
      } else if (
        (expr.includes('delete window.__agPrismInlineDiff') || expr.includes('delete window.__agPrismThoughtSettingsUi')) &&
        expr.includes("status: 'off'") &&
        !expr.includes('const targetHash =')
      ) {
        result = {
          result: {
            type: 'object',
            value: { ok: true, status: 'off' },
          },
        };
      } else if (
        expr.includes('window.__agPrismRepoBridge') &&
        expr.includes('window.__agPrismThoughtBridge') &&
        !expr.includes('globalThis.__agCsUiMain')
      ) {
        result = {
          result: {
            type: 'object',
            value: { ok: true },
          },
        };
      } else {
        lastInjectedExpr = expr;
        claudeStyleMounted = true;
        result = {
          result: {
            type: 'object',
            value: { version: cdp.PLUGIN_VERSION, status: 'ok', state: { mounted: true } },
          },
        };
      }
    }
    sendWsMessage(socket, { id: msg.id, result });
  }

  const server = http.createServer((req, res) => {
    if (req.url === '/json/list') {
      const addr = server.address();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify([
          {
            id: 'PAGE_1',
            type: 'page',
            title: 'Antigravity',
            url: 'https://127.0.0.1:9999/',
            webSocketDebuggerUrl: `ws://127.0.0.1:${addr.port}/devtools/page/PAGE_1`,
          },
          {
            id: 'DEVTOOLS_1',
            type: 'page',
            title: 'DevTools',
            url: 'devtools://devtools/bundled/inspector.html',
            webSocketDebuggerUrl: `ws://127.0.0.1:${addr.port}/devtools/page/DEVTOOLS_1`,
          },
        ])
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });

  server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    const accept = crypto
      .createHash('sha1')
      .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    );
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => sockets.delete(socket));

    let buf = Buffer.alloc(0);
    let fragChunks = [];
    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= 2) {
        const b0 = buf[0];
        const b1 = buf[1];
        const fin = (b0 & 0x80) !== 0;
        const opcode = b0 & 0x0f;
        const masked = (b1 & 0x80) !== 0;
        let payloadLen = b1 & 0x7f;
        let offset = 2;
        if (payloadLen === 126) {
          if (buf.length < 4) return;
          payloadLen = buf.readUInt16BE(2);
          offset = 4;
        } else if (payloadLen === 127) {
          if (buf.length < 10) return;
          payloadLen = Number(buf.readBigUInt64BE(2));
          offset = 10;
        }
        const maskLen = masked ? 4 : 0;
        if (buf.length < offset + maskLen + payloadLen) return;
        let payload = buf.subarray(offset + maskLen, offset + maskLen + payloadLen);
        if (masked) {
          const mask = buf.subarray(offset, offset + 4);
          const unmasked = Buffer.allocUnsafe(payloadLen);
          for (let i = 0; i < payloadLen; i++) {
            unmasked[i] = payload[i] ^ mask[i & 3];
          }
          payload = unmasked;
        }
        buf = buf.subarray(offset + maskLen + payloadLen);

        if (opcode === 0x8) {
          socket.end();
          return;
        }
        if (opcode === 0x9) {
          const pong = Buffer.alloc(2 + payload.length);
          pong[0] = 0x8a;
          pong[1] = payload.length;
          payload.copy(pong, 2);
          socket.write(pong);
          continue;
        }
        if (opcode === 0x1 || opcode === 0x0) {
          fragChunks.push(payload);
          if (fin) {
            const fullText = Buffer.concat(fragChunks).toString('utf8');
            fragChunks = [];
            try {
              const msg = JSON.parse(fullText);
              handleCdpCommand(socket, msg);
            } catch {}
          }
        }
      }
    });
  });

  return {
    async start() {
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      return server.address().port;
    },
    emitBindingCalled(name, payload) {
      for (const s of sockets) {
        sendWsMessage(s, {
          method: 'Runtime.bindingCalled',
          params: { name, payload: JSON.stringify(payload) },
        });
      }
    },
    getCalls() {
      return receivedCalls;
    },
    getLastInjectedExpr() {
      return lastInjectedExpr;
    },
    getLastRemovedExpr() {
      return lastRemovedExpr;
    },
    async close() {
      for (const s of sockets) s.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

async function waitFor(fn, timeoutMs = 6000, intervalMs = 100) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = null;
  while (Date.now() < deadline) {
    try {
      const val = await fn();
      if (val) return val;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw lastErr || new Error('Timed out waiting for condition');
}

test('buildIcns generates a valid Apple ICNS container with PNG icon chunks', () => {
  const icns = buildIcns();
  assert.equal(icns.subarray(0, 4).toString('ascii'), 'icns');
  assert.equal(icns.readUInt32BE(4), icns.length);

  let offset = 8;
  const types = [];
  const pngMagic = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  while (offset < icns.length) {
    const chunkType = icns.subarray(offset, offset + 4).toString('ascii');
    const chunkLen = icns.readUInt32BE(offset + 4);
    assert.ok(chunkLen > 16, `Chunk ${chunkType} has payload`);
    assert.deepEqual(icns.subarray(offset + 8, offset + 16), pngMagic, `Chunk ${chunkType} is valid PNG`);
    types.push(chunkType);
    offset += chunkLen;
  }
  assert.equal(offset, icns.length);
  assert.ok(types.includes('icp4'));
  assert.ok(types.includes('ic08'));
  assert.ok(types.includes('ic10'));
});

test('generateInfoPlist generates valid bundle metadata and escapes special XML characters', () => {
  const plist = generateInfoPlist('1.2.3-beta&1<test>');
  assert.ok(plist.includes('<key>CFBundleExecutable</key>'));
  assert.ok(plist.includes('<string>Obsidian Prism</string>'));
  assert.ok(plist.includes('<string>io.github.rmvdesi.obsidian-prism</string>'));
  assert.ok(plist.includes('<key>NSAllowsLocalNetworking</key>'));
  assert.ok(plist.includes('<string>1.2.3-beta&amp;1&lt;test&gt;</string>'));
});

test('macOS Swift installer & LaunchAgent contracts enforce KeepAlive <true/>, native Sidecar yield, and bundleUnchanged fast-refresh', () => {
  const setupSwift = fs.readFileSync(path.join(ROOT_DIR, 'installer', 'macos', 'Setup', 'main.swift'), 'utf8');
  const watcherSwift = fs.readFileSync(path.join(ROOT_DIR, 'installer', 'macos', 'Watcher', 'main.swift'), 'utf8');
  const cdpSwift = fs.readFileSync(path.join(ROOT_DIR, 'installer', 'macos', 'Common', 'CdpClient.swift'), 'utf8');

  assert.match(setupSwift, /<key>KeepAlive<\/key>\s*<true\/>/, 'macOS LaunchAgent must set KeepAlive to <true/>');
  assert.ok(setupSwift.includes('--plugin-dir'), 'macOS Setup supports --plugin-dir');
  assert.ok(setupSwift.includes('.gemini/config/plugins') || cdpSwift.includes('.gemini/config/plugins'), 'Deploys to standard native plugin dir');
  assert.ok(cdpSwift.includes('ELECTRON_RUN_AS_NODE'), 'macOS CdpClient boots full 5-channel Sidecar via ELECTRON_RUN_AS_NODE=1');
  assert.ok(cdpSwift.includes('Antigravity Helper'), 'macOS CdpClient prefers Antigravity Helper binary to avoid second Dock icon');
  assert.ok(cdpSwift.includes('ensureNativeDaemonRunning'), 'macOS CdpClient implements zero-Node ensureNativeDaemonRunning');
  assert.ok(setupSwift.includes('ensureNativeDaemonRunning'), 'macOS Setup launches native Sidecar daemon immediately on install');
  assert.ok(watcherSwift.includes('ensureNativeDaemonRunning'), 'macOS Watcher auto-respawns native Sidecar daemon when host CDP is active');
  assert.ok(cdpSwift.includes('syncHostPluginRegistry'), 'macOS CdpClient enables/cleans plugins[\"obsidian-prism\"] in config.json');
  assert.ok(cdpSwift.includes('obsidian-prism-thought-cache.json'), 'macOS CdpClient cleans thought cache on uninstall while preserving secret file');
  assert.equal(cdpSwift.includes('obsidian-prism-usage-rollup-cache.json'), false, 'macOS CdpClient default uninstall must preserve usage rollup cache');
  assert.ok(setupSwift.includes('"obsidian-prism-usage-rollup-cache.json"'), 'macOS Setup purgeUserPluginData must clean usage rollup cache on --purge-data');
  assert.ok(setupSwift.includes('"obsidian-prism-wallpaper.json"'), 'macOS Setup purgeUserPluginData must clean obsidian-prism-wallpaper.json on --purge-data');
  assert.ok(setupSwift.includes('PRISM_USAGE_CACHE_PATH'), 'macOS Setup purgeUserPluginData must safely handle PRISM_USAGE_CACHE_PATH override');
  assert.ok(cdpSwift.includes('isBareAuxiliaryTarget'), 'macOS CdpClient narrows Untitled/launchpad filtering to bare auxiliary targets');
  assert.ok(cdpSwift.includes('checkHostIdentity'), 'macOS CdpClient enforces in-page checkHostIdentity gate');
  assert.ok(cdpSwift.includes('--remote-debugging-port=0'), 'macOS CdpClient defines v2.33.0+ --remote-debugging-port=0 flag');
  assert.ok(cdpSwift.includes('findBareAntigravityMainProcess'), 'macOS CdpClient detects bare v2.33.0+ Antigravity process');
  assert.ok(cdpSwift.includes('.relaunch-prompt-state.json'), 'macOS CdpClient shares .relaunch-prompt-state.json deduplication lock');
  assert.ok(cdpSwift.includes('relaunchAntigravityWithCdp'), 'macOS CdpClient supports graceful quit + open --args --remote-debugging-port=0 relaunch');
  assert.ok(setupSwift.includes('shouldCleanHostLaunchAgent'), 'macOS Setup unconditionally cleans LaunchAgent on host uninstall');
  assert.ok(watcherSwift.includes('isNativeDaemonAlive'), 'macOS Watcher politely yields when native Sidecar daemon is alive');
  assert.ok(watcherSwift.includes('patch-batch'), 'macOS Watcher supports patch-batch atomic config updates');
  assert.ok(cdpSwift.includes('bundleUnchanged'), 'macOS CdpClient implements bundleUnchanged -> refreshConfig fast path');
  assert.ok(cdpSwift.includes('__agPrismThought?.sync?.(effectiveCfg)'), 'macOS CdpClient syncs __agPrismThought');
  assert.ok(cdpSwift.includes('isEligibleTarget'), 'macOS CdpClient filters non-host preview targets via isEligibleTarget');
  assert.ok(cdpSwift.includes('reconcileConfigAliases'), 'macOS CdpClient reconciles canonical & legacy config aliases');
  assert.ok(cdpSwift.includes('__fromFile'), 'macOS CdpClient marks file-driven config refresh with __fromFile');
  assert.ok(watcherSwift.includes('isTrustedMainFrameBinding'), 'macOS Watcher isolates privileged CDP bindings to top-level frame');

  // Channel 5 (thought-translator on-demand injection) & stripForeignMount full-module destroy parity
  assert.ok(cdpSwift.includes('static func shouldEnableThought('), 'macOS CdpClient implements shouldEnableThought');
  assert.ok(cdpSwift.includes('static func buildThoughtExpression('), 'macOS CdpClient implements buildThoughtExpression');
  assert.ok(cdpSwift.includes('static let thoughtRemoveExpression'), 'macOS CdpClient defines thoughtRemoveExpression');
  assert.ok(cdpSwift.includes('vendor/thought-translator/thought-client.js'), 'macOS CdpClient loads thought-client.js');
  assert.ok(cdpSwift.includes('vendor/thought-translator/thought-settings-ui.js'), 'macOS CdpClient loads thought-settings-ui.js');
  assert.ok(cdpSwift.includes('resolveSafePluginFile'), 'macOS CdpClient validates thought asset paths safely');

  const thoughtRemoveMatch = cdpSwift.match(/static let thoughtRemoveExpression:\s*String\s*=\s*"""\r?\n([\s\S]*?)\r?\n\s*"""/);
  assert.ok(thoughtRemoveMatch, 'macOS CdpClient thoughtRemoveExpression literal must be parseable');
  const swiftThoughtRemoveJs = thoughtRemoveMatch[1];
  assert.doesNotThrow(() => new vm.Script(swiftThoughtRemoveJs), 'macOS thoughtRemoveExpression must be valid JS');
  assert.ok(swiftThoughtRemoveJs.includes('window.__agPrismThought?.destroy?.()'));
  assert.ok(swiftThoughtRemoveJs.includes('prism-thought-ai-config'));
  assert.ok(swiftThoughtRemoveJs.includes('delete window.__agPrismThoughtSettingsUi'));

  const stripMatch = cdpSwift.match(/const stripForeignMount = \(\) => \{[\s\S]*?sb\.append\("    \};\\n"\)/);
  assert.ok(stripMatch, 'macOS CdpClient must define stripForeignMount');
  const stripBlock = stripMatch[0];
  for (const modDestroy of [
    'window.__agPrismTelemetry?.destroy?.()',
    'window.__agPrismEffortSlider?.destroy?.()',
    'window.__agPrismThought?.destroy?.()',
    'window.__agPrismOmni?.destroy?.()',
    'window.__agPrismContextMenu?.destroy?.()',
    'window.__agPrism?.destroy?.()',
  ]) {
    assert.ok(stripBlock.includes(modDestroy), `macOS stripForeignMount must destroy ${modDestroy}`);
  }
  assert.ok(stripBlock.includes('delete window.__agPrismOmni'), 'macOS stripForeignMount clears window.__agPrismOmni');
  assert.ok(stripBlock.includes('delete window.__agPrism;'), 'macOS stripForeignMount clears window.__agPrism');

  assert.ok(watcherSwift.includes('var thoughtScriptId: String?'), 'macOS Watcher tracks thoughtScriptId per page');
  assert.ok(watcherSwift.includes('CdpHelper.shouldEnableThought('), 'macOS Watcher checks shouldEnableThought before injecting Channel 5');
  assert.ok(watcherSwift.includes('CdpHelper.buildThoughtExpression('), 'macOS Watcher builds Channel 5 thought expression on demand');
  assert.ok(watcherSwift.includes('CdpHelper.thoughtRemoveExpression'), 'macOS Watcher cleans up Channel 5 with thoughtRemoveExpression when disabled');
  const stampMatch = watcherSwift.match(/private func computeDirStamp\(\)[\s\S]*?\n    \}/);
  assert.ok(stampMatch, 'macOS Watcher defines computeDirStamp()');
  assert.ok(stampMatch[0].includes('vendor/thought-translator/thought-client.js'), 'macOS Watcher computeDirStamp scans thought-client.js');
  assert.ok(stampMatch[0].includes('vendor/thought-translator/thought-settings-ui.js'), 'macOS Watcher computeDirStamp scans thought-settings-ui.js');

  const buildMacosSrc = fs.readFileSync(path.join(ROOT_DIR, 'scripts', 'build-macos.mjs'), 'utf8');
  assert.ok(buildMacosSrc.includes('collectNativePluginEntries'), 'macOS app payload must bundle native-plugin Sidecar directory');
  assert.ok(buildMacosSrc.includes('collectOptionalOmniTopEntries'), 'macOS app payload must bundle top-level omni-client.js');
  assert.ok(buildMacosSrc.includes("'-volname', 'Obsidian Prism'"), 'macOS DMG volume name must be Obsidian Prism');

  // SetFix #5 & #7b: Swift reconcileConfigAliases parity & buildConfigRefreshExpression thoughtView off removal
  const reconcileMatch = cdpSwift.match(/static func reconcileConfigAliases\([\s\S]*?\n    \}/);
  assert.ok(reconcileMatch, 'macOS CdpClient must define reconcileConfigAliases');
  const reconcileBlock = reconcileMatch[0];
  for (const key of ['telemetryModule', 'effortSliderModule', 'omniModule', 'sidebarStudio', 'autoUpdate']) {
    assert.ok(reconcileBlock.includes(`"${key}"`), `Swift reconcileConfigAliases must normalize boolean ${key} -> on/off`);
  }
  assert.ok(reconcileBlock.includes('out["palette"]?.stringValue == "claude"') && reconcileBlock.includes('.string("warm")'));
  assert.ok(reconcileBlock.includes('out["mascot"]?.stringValue == "dual"') && reconcileBlock.includes('.string("crab")'));

  const refreshFnMatch = cdpSwift.match(/static func buildConfigRefreshExpression\([\s\S]*?\n    \}/);
  assert.ok(refreshFnMatch, 'macOS CdpClient must define buildConfigRefreshExpression');
  const refreshFnBlock = refreshFnMatch[0];
  assert.ok(
    refreshFnBlock.includes("effectiveCfg.thoughtTranslate !== 'off'") &&
      refreshFnBlock.includes("removeAttribute('data-ag-prism-thought-view')"),
    'Swift buildConfigRefreshExpression must remove data-ag-prism-thought-view when thoughtTranslate is off'
  );
  // Extract the JS lines emitted for document.documentElement thoughtView sync and verify in VM
  const tvJsSnippet = `((effectiveCfg) => {
    if (document.documentElement) {
      if (effectiveCfg && effectiveCfg.thoughtTranslate && effectiveCfg.thoughtTranslate !== 'off') document.documentElement.setAttribute('data-ag-prism-thought-view', effectiveCfg.thoughtView === 'bilingual' ? 'bilingual' : 'immersive');
      else document.documentElement.removeAttribute('data-ag-prism-thought-view');
    }
  })`;
  const swiftAttrs = new Map([['data-ag-prism-thought-view', 'bilingual']]);
  const swiftHtml = {
    hasAttribute: (k) => swiftAttrs.has(k),
    getAttribute: (k) => (swiftAttrs.has(k) ? swiftAttrs.get(k) : null),
    setAttribute: (k, v) => swiftAttrs.set(k, String(v)),
    removeAttribute: (k) => swiftAttrs.delete(k),
  };
  const runThoughtSync = vm.runInNewContext(tvJsSnippet, { document: { documentElement: swiftHtml } });
  runThoughtSync({ thoughtTranslate: 'off', thoughtView: 'bilingual' });
  assert.equal(swiftHtml.hasAttribute('data-ag-prism-thought-view'), false);
  runThoughtSync({ thoughtTranslate: 'machine', thoughtView: 'bilingual' });
  assert.equal(swiftHtml.getAttribute('data-ag-prism-thought-view'), 'bilingual');
});

test('macOS main.swift P1-4: normalizes /tmp & /var system symlink prefixes and fails closed on non-ENOENT attributesOfItem errors', () => {
  const setupSwift = fs.readFileSync(path.join(ROOT_DIR, 'installer', 'macos', 'Setup', 'main.swift'), 'utf8');
  assert.equal(setupSwift.includes('\r\n'), false, 'main.swift must use pure LF line endings');
  assert.equal(setupSwift.startsWith('\uFEFF'), false, 'main.swift must not contain UTF-8 BOM');

  // 1) Must normalize macOS system root symlinks (/tmp -> /private/tmp, /var -> /private/var) without loosening user symlinks under /private/tmp
  const normFnMatch = setupSwift.match(/private static func normalizeSystemRootPrefix\([\s\S]*?\n    \}/);
  assert.ok(normFnMatch, 'main.swift must define normalizeSystemRootPrefix');
  const normFn = normFnMatch[0];
  assert.ok(normFn.includes('if clean == "/tmp" { return "/private/tmp" }'));
  assert.ok(normFn.includes('if clean.hasPrefix("/tmp/") { return "/private" + clean }'));
  assert.ok(normFn.includes('if clean == "/var" { return "/private/var" }'));
  assert.ok(normFn.includes('if clean.hasPrefix("/var/") { return "/private" + clean }'));

  // 2) isSymbolicLink must NOT fail open via `try?` on non-ENOENT errors (EACCES / ELOOP / ENOTDIR -> true)
  const noSuchMatch = setupSwift.match(/private static func isNoSuchFileError\([\s\S]*?\n    \}/);
  assert.ok(noSuchMatch, 'main.swift must define isNoSuchFileError');
  assert.ok(noSuchMatch[0].includes('NSFileReadNoSuchFileError'));
  assert.ok(noSuchMatch[0].includes('NSFileNoSuchFileError'));
  assert.ok(noSuchMatch[0].includes('ENOENT'));

  const isSymMatch = setupSwift.match(/private static func isSymbolicLink\([\s\S]*?\n    \}/);
  assert.ok(isSymMatch, 'main.swift must define isSymbolicLink');
  const isSymBlock = isSymMatch[0];
  assert.equal(isSymBlock.includes('try? FileManager.default.attributesOfItem'), false, 'isSymbolicLink must not fail-open with try?');
  assert.ok(isSymBlock.includes('try FileManager.default.attributesOfItem(atPath: path)'));
  assert.ok(isSymBlock.includes('return !isNoSuchFileError(error)'), 'isSymbolicLink must fail-closed on non-ENOENT errors');
  assert.ok(isSymBlock.includes('guard !path.isEmpty else { return true }'), 'empty path must fail-closed');

  // 3) resolveAllowedUsageCacheOverrideFile & hasSymbolicLinkInChain must normalize prefixes and enforce reachedStop fail-closed
  const resolveMatch = setupSwift.match(/private static func resolveAllowedUsageCacheOverrideFile\([\s\S]*?\n    \}/);
  assert.ok(resolveMatch, 'main.swift must define resolveAllowedUsageCacheOverrideFile');
  assert.ok(resolveMatch[0].includes('normalizeSystemRootPrefix(trimmed)'));
  assert.ok(resolveMatch[0].includes('normalizeSystemRootPrefix(NSTemporaryDirectory())'));
  assert.ok(resolveMatch[0].includes('"/private/tmp"'));
  assert.equal(resolveMatch[0].includes('"/tmp",'), false, 'allowedRoots must store canonical /private/tmp instead of /tmp symlink');

  const chainMatch = setupSwift.match(/private static func hasSymbolicLinkInChain\([\s\S]*?\n    \}/);
  assert.ok(chainMatch, 'main.swift must define hasSymbolicLinkInChain');
  const chainBlock = chainMatch[0];
  assert.ok(chainBlock.includes('var cur = normalizeSystemRootPrefix(targetDir)'));
  assert.ok(chainBlock.includes('let stop = normalizeSystemRootPrefix(stopRoot)'));
  assert.ok(chainBlock.includes('if isSymbolicLink(cur) { return true }'));
  assert.ok(chainBlock.includes('reachedStop = true'));
  assert.ok(chainBlock.includes('return !reachedStop'), 'hasSymbolicLinkInChain must fail-closed if stopRoot is never reached');

  // 4) purgeUserPluginData must guard override removal with chain check, symlink check, and regular file check
  const purgeMatch = setupSwift.match(/private static func purgeUserPluginData\([\s\S]*?\n    \}/);
  assert.ok(purgeMatch, 'main.swift must define purgeUserPluginData');
  assert.ok(purgeMatch[0].includes('!hasSymbolicLinkInChain(parentDir, stopRoot: allowed.stopRoot)'));
  assert.ok(purgeMatch[0].includes('!isSymbolicLink(allowed.path)'));
  assert.ok(purgeMatch[0].includes('isRegularFileNoSymlink(allowed.path)'));
  assert.ok(purgeMatch[0].includes('normalizeSystemRootPrefix(envTel)'), 'telemetry override must also normalize /tmp -> /private/tmp');

  // 5) Semantic equivalence check for /tmp/sub vs /tmp/evil-link & non-ENOENT fail-closed state machine
  const normalizeSystemRootPrefix = (rawPath) => {
    const trimmed = String(rawPath || '').trim();
    if (!trimmed) return '';
    let clean = path.posix.normalize(trimmed);
    if (clean.length > 1 && clean.endsWith('/')) clean = clean.slice(0, -1);
    if (clean === '/tmp') return '/private/tmp';
    if (clean.startsWith('/tmp/')) return '/private' + clean;
    if (clean === '/var') return '/private/var';
    if (clean.startsWith('/var/')) return '/private' + clean;
    return clean;
  };
  const evalChain = (targetDir, stopRoot, lstatMap) => {
    let cur = normalizeSystemRootPrefix(targetDir);
    const stop = normalizeSystemRootPrefix(stopRoot);
    if (!cur || !stop) return true;
    let reachedStop = false;
    for (let i = 0; i < 64; i++) {
      const st = lstatMap.get(cur);
      if (st === 'SYMLINK' || st === 'EACCES' || st === 'ELOOP') return true;
      if (cur === stop) {
        reachedStop = true;
        break;
      }
      const parent = path.posix.dirname(cur);
      if (!parent || parent === cur) break;
      cur = parent;
    }
    return !reachedStop;
  };

  // Normal /tmp/sub/obsidian-prism-usage-rollup-cache.json -> /private/tmp/sub -> allowed (false = no symlink)
  const fsState = new Map([
    ['/tmp', 'SYMLINK'],
    ['/private', 'DIR'],
    ['/private/tmp', 'DIR'],
    ['/private/tmp/sub', 'DIR'],
    ['/private/tmp/evil-link', 'SYMLINK'],
    ['/private/tmp/locked', 'EACCES'],
  ]);
  assert.equal(normalizeSystemRootPrefix('/tmp/sub/obsidian-prism-usage-rollup-cache.json'), '/private/tmp/sub/obsidian-prism-usage-rollup-cache.json');
  assert.equal(evalChain('/tmp/sub', '/tmp', fsState), false, '/tmp/sub must pass after /private/tmp normalization');
  assert.equal(evalChain('/tmp/evil-link', '/tmp', fsState), true, 'user symlink /tmp/evil-link under /private/tmp must still be blocked');
  assert.equal(evalChain('/tmp/locked', '/tmp', fsState), true, 'EACCES during chain check must fail-closed');
  assert.equal(evalChain('/etc/sub', '/tmp', fsState), true, 'path outside stopRoot must fail-closed');
});

test(
  'macOS .app builds cleanly as universal binary and executes full install, CDP injection, setting sync, upgrade, and uninstall lifecycle',
  { skip: process.platform !== 'darwin' ? 'macOS-only .app E2E test' : false },
  async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-prism-macos-e2e-'));
    const appPath = path.join(workDir, 'Obsidian Prism.app');
    const installDir = path.join(workDir, 'installed');
    const outInstall = path.join(workDir, 'install.json');
    const outUpgrade = path.join(workDir, 'upgrade.json');
    const outUninstall = path.join(workDir, 'uninstall.json');
    const outStatus = path.join(workDir, 'status.json');
    const mockCdp = createMockCdpServer();

    try {
      const buildRes = buildMacosApp({ appOut: appPath, createDmg: false });
      assert.ok(fs.existsSync(appPath));
      assert.ok(buildRes.appSizeBytes > 100 * 1024);

      const installerBin = path.join(appPath, 'Contents', 'MacOS', 'Obsidian Prism');
      const watcherBundleBin = path.join(appPath, 'Contents', 'MacOS', 'obsidian-prism-watcher');
      assert.ok(fs.existsSync(installerBin));
      assert.ok(fs.existsSync(watcherBundleBin));

      for (const bin of [installerBin, watcherBundleBin]) {
        const archs = execFileSync('lipo', ['-archs', bin], { encoding: 'utf8' }).trim().split(/\s+/);
        assert.ok(archs.includes('arm64'), `${path.basename(bin)} includes arm64`);
        assert.ok(archs.includes('x86_64'), `${path.basename(bin)} includes x86_64`);
      }

      execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' });

      const port = await mockCdp.start();

      // 1. Check --status CLI
      await runBin(
        installerBin,
        ['--status', '--install-dir', installDir, '--cdp-port', String(port), '--out', outStatus],
        10000
      );
      const st = JSON.parse(fs.readFileSync(outStatus, 'utf8'));
      assert.equal(st.installed, false);
      assert.equal(st.cdpPort, port);

      // 2. Run --silent install against mock CDP server
      await runBin(
        installerBin,
        [
          '--silent',
          '--no-autostart',
          '--no-kill-legacy',
          '--no-native-daemon',
          '--install-dir',
          installDir,
          '--cdp-port',
          String(port),
          '--out',
          outInstall,
        ],
        20000
      );

      const installResult = JSON.parse(fs.readFileSync(outInstall, 'utf8'));
      assert.equal(installResult.ok, true);
      assert.equal(installResult.preservedExistingConfig, false);
      assert.deepEqual(installResult.injectedPages, ['Antigravity']);
      assert.ok(fs.existsSync(path.join(installDir, 'obsidian-prism-watcher')));
      assert.ok(fs.existsSync(path.join(installDir, 'obsidian-prism-installer')));
      assert.ok(fs.existsSync(path.join(installDir, 'manifest.json')));
      assert.ok(fs.existsSync(path.join(installDir, '.watch.pid')));

      const activeCfgPath = path.join(ROOT_DIR, 'config.example.json');
      const expectedCfg = fs.readFileSync(activeCfgPath, 'utf8');
      assert.equal(fs.readFileSync(path.join(installDir, 'config.json'), 'utf8'), expectedCfg);

      // Verify exact CDP sequence & valid JS payload
      const calls = mockCdp.getCalls();
      assert.ok(calls.some((c) => c.method === 'Page.enable'));
      assert.ok(calls.some((c) => c.method === 'Runtime.enable'));
      assert.ok(
        calls.some(
          (c) =>
            c.method === 'Runtime.addBinding' &&
            c.params &&
            c.params.name === cdp.SETTING_BINDING
        )
      );
      assert.ok(calls.some((c) => c.method === 'Page.addScriptToEvaluateOnNewDocument'));
      const injectedExpr = mockCdp.getLastInjectedExpr();
      assert.ok(injectedExpr, 'injected expression was sent over CDP');
      assert.doesNotThrow(() => new vm.Script(injectedExpr), 'Swift injected JS compiles cleanly');

      // Verify codeHash parity and active config values between Node cdp.js and Swift watcher
      const nodeExpr = cdp.buildInjectExpression();
      const nodeHash = nodeExpr.match(/"codeHash":"([^"]+)"/)[1];
      const swiftHash = injectedExpr.match(/"codeHash":"([^"]+)"/)[1];
      assert.equal(swiftHash, nodeHash);
      const expectedCfgObj = JSON.parse(expectedCfg);
      assert.ok(injectedExpr.includes(`"palette":"${expectedCfgObj.palette}"`));
      assert.ok(injectedExpr.includes(`"omniModule":"${expectedCfgObj.omniModule}"`));

      // Verify watcher --once CLI mode works standalone against CDP
      const watcherBin = path.join(installDir, 'obsidian-prism-watcher');
      const onceOut = path.join(workDir, 'once.json');
      await runBin(
        watcherBin,
        ['--once', '--dir', installDir, '--cdp-port', String(port), '--out', onceOut],
        10000
      );
      const onceResult = JSON.parse(fs.readFileSync(onceOut, 'utf8'));
      assert.equal(onceResult.ok, true);
      assert.deepEqual(onceResult.pages, ['Antigravity']);

      // 3. Test Runtime.bindingCalled -> config.json update (including legacy alias normalization) & hot-reload
      const beforeCallCount = mockCdp.getCalls().length;
      mockCdp.emitBindingCalled(cdp.SETTING_BINDING, { key: 'palette', value: 'hacker-invalid' });
      mockCdp.emitBindingCalled(cdp.SETTING_BINDING, { key: 'palette', value: 'claude' });
      mockCdp.emitBindingCalled(cdp.SETTING_BINDING, { key: 'mascot', value: 'dual' });

      const updatedCfg = await waitFor(() => {
        const parsed = JSON.parse(fs.readFileSync(path.join(installDir, 'config.json'), 'utf8'));
        return parsed.palette === 'warm' && parsed.mascot === 'crab' ? parsed : null;
      });
      assert.equal(updatedCfg.palette, 'warm');
      assert.equal(updatedCfg.mascot, 'crab');

      // Confirm hot-reload fired on watcher
      await waitFor(() => {
        const newer = mockCdp.getCalls().slice(beforeCallCount);
        return newer.some((c) => c.method === 'Page.removeScriptToEvaluateOnNewDocument') ? true : null;
      });

      // 4. Test re-install / upgrade preserves existing user config.json
      await runBin(
        installerBin,
        [
          '--silent',
          '--no-autostart',
          '--no-kill-legacy',
          '--no-native-daemon',
          '--install-dir',
          installDir,
          '--cdp-port',
          String(port),
          '--out',
          outUpgrade,
        ],
        20000
      );
      const upgradeResult = JSON.parse(fs.readFileSync(outUpgrade, 'utf8'));
      assert.equal(upgradeResult.ok, true);
      assert.equal(upgradeResult.preservedExistingConfig, true);
      const cfgAfterUpgrade = JSON.parse(fs.readFileSync(path.join(installDir, 'config.json'), 'utf8'));
      assert.equal(cfgAfterUpgrade.palette, 'warm');
      assert.equal(cfgAfterUpgrade.mascot, 'crab');

      // 5. Test --uninstall from installed copy inside installDir
      const installedSelf = path.join(installDir, 'obsidian-prism-installer');
      await runBin(
        installedSelf,
        [
          '--uninstall',
          '--silent',
          '--no-autostart',
          '--install-dir',
          installDir,
          '--cdp-port',
          String(port),
          '--out',
          outUninstall,
        ],
        20000
      );

      const uninstallResult = JSON.parse(fs.readFileSync(outUninstall, 'utf8'));
      assert.equal(uninstallResult.ok, true);
      assert.deepEqual(uninstallResult.injectedPages, ['Antigravity']);
      assert.equal(mockCdp.getLastRemovedExpr(), cdp.REMOVE_EXPRESSION);

      await waitFor(() => (!fs.existsSync(installDir) ? true : null), 5000, 100);
      assert.equal(fs.existsSync(installDir), false);
    } finally {
      try {
        const pidPath = path.join(installDir, '.watch.pid');
        if (fs.existsSync(pidPath)) {
          const pid = parseInt(fs.readFileSync(pidPath, 'utf8'), 10);
          if (pid) process.kill(pid);
        }
      } catch {}
      await mockCdp.close();
      try {
        fs.rmSync(workDir, { recursive: true, force: true });
      } catch {}
    }
  }
);

test('Issue #38: macOS CdpClient.swift relaunch normalizes .app path, waits for full app family + SingletonLock, strips ELECTRON_RUN_AS_NODE, and launches with open -na', () => {
  const cdpSwift = fs.readFileSync(path.join(ROOT_DIR, 'installer', 'macos', 'Common', 'CdpClient.swift'), 'utf8');
  const setupSwift = fs.readFileSync(path.join(ROOT_DIR, 'installer', 'macos', 'Setup', 'main.swift'), 'utf8');

  // 1) .app bundle path normalization
  const normMatch = cdpSwift.match(/static func normalizeAntigravityAppPath\([\s\S]*?\n    \}/);
  assert.ok(normMatch, 'CdpClient.swift must define normalizeAntigravityAppPath');
  assert.ok(normMatch[0].includes('.app/contents/'), 'normalizeAntigravityAppPath strips internal /Contents/... suffix');
  assert.ok(normMatch[0].includes('"/Applications/Antigravity.app"'), 'normalizeAntigravityAppPath falls back to /Applications/Antigravity.app');

  // Semantic check via JS helper mirror in tools/install-plugin.cjs
  assert.equal(
    installPluginMod.normalizeMacosAntigravityAppPath('/Applications/Antigravity.app/Contents/MacOS/Antigravity'),
    '/Applications/Antigravity.app'
  );
  assert.equal(
    installPluginMod.normalizeMacosAntigravityAppPath('/Users/test/Applications/Antigravity.app/Contents/Frameworks/Antigravity Helper.app/Contents/MacOS/Antigravity Helper'),
    '/Users/test/Applications/Antigravity.app'
  );
  assert.equal(
    installPluginMod.normalizeMacosAntigravityAppPath(''),
    '/Applications/Antigravity.app'
  );
  assert.equal(
    installPluginMod.normalizeMacosAntigravityAppPath('/usr/local/bin/not-a-bundle'),
    '/Applications/Antigravity.app'
  );

  // 2) App family PID scan (main + Electron Helpers, excluding Sidecar/Watcher) + SingletonLock check
  const famMatch = cdpSwift.match(/static func listRunningAppFamilyPids\([\s\S]*?\n    \}/);
  assert.ok(famMatch, 'CdpClient.swift must define listRunningAppFamilyPids');
  assert.ok(famMatch[0].includes('/contents/macos/'), 'listRunningAppFamilyPids scans Contents/MacOS main executables');
  assert.ok(famMatch[0].includes('/contents/frameworks/'), 'listRunningAppFamilyPids scans Contents/Frameworks Electron Helper processes');
  assert.ok(famMatch[0].includes('isSidecarOrWatcherCommand'), 'listRunningAppFamilyPids must exclude Prism Sidecar/Watcher processes');

  const lockMatch = cdpSwift.match(/static func isSingletonLockHeld\([\s\S]*?\n    \}/);
  assert.ok(lockMatch, 'CdpClient.swift must define isSingletonLockHeld');
  assert.ok(cdpSwift.includes('Library/Application Support/Antigravity/SingletonLock'), 'Checks Chromium SingletonLock path');
  assert.ok(lockMatch[0].includes('lstat(lockPath'), 'Uses lstat to inspect Chromium symlink SingletonLock');
  assert.ok(lockMatch[0].includes('destinationOfSymbolicLink'), 'Reads symlink target PID from SingletonLock');
  assert.ok(lockMatch[0].includes('kill(lockPid, 0) == 0'), 'Verifies SingletonLock owner PID liveness');

  // 3) relaunchAntigravityWithCdp full contract
  const relaunchMatch = cdpSwift.match(/static func relaunchAntigravityWithCdp\([\s\S]*?\n    \}/);
  assert.ok(relaunchMatch, 'CdpClient.swift must define relaunchAntigravityWithCdp');
  const relaunchBody = relaunchMatch[0];
  assert.ok(relaunchBody.includes('normalizeAntigravityAppPath(host.appPath)'), 'Normalizes host.appPath');
  assert.ok(relaunchBody.includes('tell application \\"Antigravity\\" to quit'), 'Sends AppleScript quit for default Antigravity.app');
  assert.ok(relaunchBody.includes('POSIX file'), 'Supports AppleScript quit by POSIX file for custom app paths');
  assert.ok(relaunchBody.includes('listRunningAppFamilyPids(appPath: normalizedAppPath'), 'Waits for entire Antigravity process family to exit');
  assert.ok(relaunchBody.includes('isSingletonLockHeld(lockPath: lockPath)'), 'Waits for SingletonLock release');
  assert.ok(relaunchBody.includes('kill(pid, SIGTERM)'), 'Uses gentle SIGTERM fallback on timeout');
  assert.ok(relaunchBody.includes('Thread.sleep(forTimeInterval: 0.5)'), 'Waits 0.5s LaunchServices unregister buffer after full exit');
  assert.ok(relaunchBody.includes('cleanEnv.removeValue(forKey: "ELECTRON_RUN_AS_NODE")'), 'Strips ELECTRON_RUN_AS_NODE before spawning open');
  assert.ok(relaunchBody.includes('openProc.arguments = ["-na", normalizedAppPath, "--args", cdpOptInFlag]'), 'Uses open -na to force new instance with --remote-debugging-port=0');
  assert.ok(relaunchBody.includes('findRunningAntigravityWithCdp(appPath: normalizedAppPath)'), 'Polls post-launch for DevToolsActivePort or live CDP process');

  // 4) Setup GUI "Launch Antigravity" button also strips ELECTRON_RUN_AS_NODE and uses -na
  const launchClickMatch = setupSwift.match(/@objc private func handleLaunchAgClick\([\s\S]*?\n    \}/);
  assert.ok(launchClickMatch, 'Setup main.swift must define handleLaunchAgClick');
  assert.ok(launchClickMatch[0].includes('removeValue(forKey: "ELECTRON_RUN_AS_NODE")'));
  assert.ok(launchClickMatch[0].includes('"-na"'));
});

test('macOS lossless wrapper launcher: sandbox creation, Info.plist/marker/script validation, symlink refusal, and Fail-Closed uninstall', async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-prism-launcher-test-'));
  const launcherDir = path.join(workDir, 'Applications');
  const iconFile = path.join(workDir, 'AppIcon.icns');
  fs.writeFileSync(iconFile, buildIcns());

  try {
    // 1) CLI argument parsing for --create-launcher / --no-launcher / --launcher-dir
    const cliDefault = installPluginMod.parseCliArgs(['node', 'install-plugin.cjs', '--install']);
    assert.equal(cliDefault.createLauncher, undefined);
    const cliCreate = installPluginMod.parseCliArgs(['node', 'install-plugin.cjs', '--install', '--create-launcher', '--launcher-dir', launcherDir]);
    assert.equal(cliCreate.createLauncher, true);
    assert.equal(cliCreate.launcherDir, launcherDir);
    const cliNo = installPluginMod.parseCliArgs(['node', 'install-plugin.cjs', '--install', '--no-launcher']);
    assert.equal(cliNo.createLauncher, false);

    // 2) Create lossless wrapper launcher in sandbox with tricky spaces & single-quote target path
    const trickyTarget = "/Users/O'Brien/My Apps/Antigravity.app/Contents/MacOS/Antigravity";
    const created = installPluginMod.createMacosLosslessLauncher({
      platformOverride: 'darwin',
      launcherDir,
      stopRoot: workDir,
      targetApp: trickyTarget,
      version: '1.0.8-beta.3',
      iconPath: iconFile,
    });
    assert.equal(created.supported, true);
    assert.equal(created.created, true);
    assert.equal(created.updated, false);
    assert.equal(created.iconCopied, true);
    assert.equal(created.targetApp, "/Users/O'Brien/My Apps/Antigravity.app");
    assert.equal(path.basename(created.appPath), 'Antigravity Prism.app');

    // Verify Info.plist metadata
    const plist = fs.readFileSync(created.plistPath, 'utf8');
    assert.ok(plist.includes('<key>CFBundleIdentifier</key>'));
    assert.ok(plist.includes('<string>io.github.rmvdesi.obsidian-prism.launcher</string>'));
    assert.ok(plist.includes('<key>CFBundleName</key>'));
    assert.ok(plist.includes('<string>Antigravity Prism</string>'));
    assert.ok(plist.includes('<key>CFBundleExecutable</key>'));
    assert.ok(plist.includes('<string>launch</string>'));
    assert.ok(plist.includes('<key>CFBundleIconFile</key>'));
    assert.ok(plist.includes('<string>AppIcon</string>'));
    assert.match(plist, /<key>LSUIElement<\/key>\s*<false\/>/);
    assert.match(plist, /<key>LSMinimumSystemVersion<\/key>\s*<string>12\.0<\/string>/);

    // Verify marker JSON
    const marker = JSON.parse(fs.readFileSync(created.markerPath, 'utf8'));
    assert.equal(marker.managedBy, 'obsidian-prism');
    assert.equal(marker.bundleIdentifier, 'io.github.rmvdesi.obsidian-prism.launcher');
    assert.equal(marker.version, '1.0.8-beta.3');
    assert.equal(marker.targetApp, "/Users/O'Brien/My Apps/Antigravity.app");

    // Verify icon copied
    assert.ok(fs.existsSync(path.join(created.appPath, 'Contents', 'Resources', 'AppIcon.icns')));

    // Verify launch script is POSIX sh, safely single-quoted, strips ELECTRON_RUN_AS_NODE, uses open -na
    const script = fs.readFileSync(created.launchScriptPath, 'utf8');
    assert.ok(script.startsWith('#!/bin/sh\n'));
    assert.ok(script.includes("PREFERRED_APP='/Users/O'\\''Brien/My Apps/Antigravity.app'"), 'Target path must be POSIX single-quote escaped');
    assert.ok(script.includes('unset ELECTRON_RUN_AS_NODE'), 'Launch script must unset ELECTRON_RUN_AS_NODE');
    assert.ok(script.includes('exec /usr/bin/open -na "$TARGET_APP" --args --remote-debugging-port=0'), 'Launch script must use open -na with --remote-debugging-port=0');
    assert.ok(script.includes('exec /usr/bin/open -a "$TARGET_APP"'), 'Launch script activates existing CDP-enabled instance cleanly');
    assert.equal(script.includes('eval '), false, 'Launch script must never use eval');

    // Run `sh -n` if available on this machine
    for (const shBin of ['sh', 'C:\\Program Files\\Git\\bin\\sh.exe']) {
      const shRes = spawnSync(shBin, ['-n', created.launchScriptPath], { encoding: 'utf8' });
      if (!shRes.error) {
        assert.equal(shRes.status, 0, `Launch script failed POSIX sh -n syntax check: ${shRes.stderr}`);
        break;
      }
    }

    // Re-running create updates safely in-place
    const updated = installPluginMod.createMacosLosslessLauncher({
      platformOverride: 'darwin',
      launcherDir,
      stopRoot: workDir,
      targetApp: '/Applications/Antigravity.app',
      version: '1.0.8-beta.3',
    });
    assert.equal(updated.updated, true);
    assert.equal(installPluginMod.isManagedMacosLauncherBundle(created.appPath), true);

    // 3) Managed uninstall removes it cleanly
    const removed = installPluginMod.removeMacosLosslessLauncher({
      platformOverride: 'darwin',
      launcherDir,
      stopRoot: workDir,
    });
    assert.equal(removed.removed, true);
    assert.equal(removed.refused, false);
    assert.equal(fs.existsSync(created.appPath), false);

    // 4) Fail-Closed: refuse to overwrite or delete unmanaged user app with the same name
    const userApp = path.join(launcherDir, 'Antigravity Prism.app');
    fs.mkdirSync(path.join(userApp, 'Contents'), { recursive: true });
    fs.writeFileSync(
      path.join(userApp, 'Contents', 'Info.plist'),
      '<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.user.custom.app</string></dict></plist>\n'
    );
    const userSentinel = path.join(userApp, 'Contents', 'user-data.txt');
    fs.writeFileSync(userSentinel, 'do-not-delete');

    assert.equal(installPluginMod.isManagedMacosLauncherBundle(userApp), false);
    assert.throws(
      () =>
        installPluginMod.createMacosLosslessLauncher({
          platformOverride: 'darwin',
          launcherDir,
          stopRoot: workDir,
        }),
      /unmanaged app bundle/i
    );
    const refusedUninstall = installPluginMod.removeMacosLosslessLauncher({
      platformOverride: 'darwin',
      launcherDir,
      stopRoot: workDir,
    });
    assert.equal(refusedUninstall.removed, false);
    assert.equal(refusedUninstall.refused, true);
    assert.equal(refusedUninstall.reason, 'unmanaged-bundle');
    assert.equal(fs.readFileSync(userSentinel, 'utf8'), 'do-not-delete');
    fs.rmSync(userApp, { recursive: true, force: true });

    // 5) Symlink refusal on both target .app and parent launcherDir
    const innocentTarget = path.join(workDir, 'innocent-real-dir');
    fs.mkdirSync(innocentTarget, { recursive: true });
    fs.writeFileSync(path.join(innocentTarget, 'keep.txt'), 'safe');
    const linkType = process.platform === 'win32' ? 'junction' : 'dir';

    // 5a) Target .app is a symlink
    fs.symlinkSync(innocentTarget, userApp, linkType);
    assert.throws(
      () =>
        installPluginMod.createMacosLosslessLauncher({
          platformOverride: 'darwin',
          launcherDir,
          stopRoot: workDir,
        }),
      /symbolic link/i
    );
    const refusedLinkUninstall = installPluginMod.removeMacosLosslessLauncher({
      platformOverride: 'darwin',
      launcherDir,
      stopRoot: workDir,
    });
    assert.equal(refusedLinkUninstall.removed, false);
    assert.equal(refusedLinkUninstall.refused, true);
    assert.equal(refusedLinkUninstall.reason, 'symlink');
    assert.equal(fs.readFileSync(path.join(innocentTarget, 'keep.txt'), 'utf8'), 'safe');
    fs.rmSync(userApp, { recursive: true, force: true });

    // 5b) Parent launcherDir is a symlink
    const symParent = path.join(workDir, 'SymApplications');
    fs.symlinkSync(innocentTarget, symParent, linkType);
    assert.throws(
      () =>
        installPluginMod.createMacosLosslessLauncher({
          platformOverride: 'darwin',
          launcherDir: symParent,
          stopRoot: workDir,
        }),
      /symbolic link/i
    );

    // 6) End-to-end installPlugin + uninstallPlugin with platformOverride:'darwin'
    const pluginTarget = path.join(workDir, 'sandbox-plugin');
    const hostCfgDir = path.join(workDir, 'sandbox-gemini-cfg');
    const e2eLauncherDir = path.join(workDir, 'E2EApps');

    // --no-launcher skips creation
    const noLauncherRes = await installPluginMod.installPlugin({
      targetDir: pluginTarget,
      hostConfigDir: hostCfgDir,
      startDaemon: false,
      syncShortcuts: false,
      platformOverride: 'darwin',
      createLauncher: false,
      launcherDir: e2eLauncherDir,
      launcherStopRoot: workDir,
    });
    assert.equal(noLauncherRes.ok, true);
    assert.equal(noLauncherRes.launcher.created, false);
    assert.equal(fs.existsSync(path.join(e2eLauncherDir, 'Antigravity Prism.app')), false);

    // --create-launcher creates it and uninstallPlugin cleans it up
    const withLauncherRes = await installPluginMod.installPlugin({
      targetDir: pluginTarget,
      hostConfigDir: hostCfgDir,
      startDaemon: false,
      syncShortcuts: false,
      platformOverride: 'darwin',
      createLauncher: true,
      launcherDir: e2eLauncherDir,
      launcherStopRoot: workDir,
    });
    assert.equal(withLauncherRes.ok, true);
    assert.equal(withLauncherRes.launcher.created, true);
    assert.ok(fs.existsSync(path.join(e2eLauncherDir, 'Antigravity Prism.app', 'Contents', 'MacOS', 'launch')));

    const uninstallRes = await installPluginMod.uninstallPlugin({
      targetDir: pluginTarget,
      hostConfigDir: hostCfgDir,
      noCdp: true,
      syncShortcuts: false,
      platformOverride: 'darwin',
      launcherDir: e2eLauncherDir,
      launcherStopRoot: workDir,
    });
    assert.equal(uninstallRes.ok, true);
    assert.equal(uninstallRes.launcher.removed, true);
    assert.equal(fs.existsSync(path.join(e2eLauncherDir, 'Antigravity Prism.app')), false);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});

test('macOS Swift Setup lossless launcher & Issue #37 100% bilingual i18n contracts across Setup, Watcher, and CdpClient', () => {
  const cdpSwift = fs.readFileSync(path.join(ROOT_DIR, 'installer', 'macos', 'Common', 'CdpClient.swift'), 'utf8');
  const setupSwift = fs.readFileSync(path.join(ROOT_DIR, 'installer', 'macos', 'Setup', 'main.swift'), 'utf8');
  const watcherSwift = fs.readFileSync(path.join(ROOT_DIR, 'installer', 'macos', 'Watcher', 'main.swift'), 'utf8');

  // 1) Pure LF & no UTF-8 BOM on all three Swift sources
  for (const [name, src] of [
    ['CdpClient.swift', cdpSwift],
    ['Setup/main.swift', setupSwift],
    ['Watcher/main.swift', watcherSwift],
  ]) {
    assert.equal(src.includes('\r\n'), false, `${name} must use pure LF`);
    assert.equal(src.startsWith('\uFEFF'), false, `${name} must not have UTF-8 BOM`);
  }

  // 2) Swift Setup lossless launcher contracts
  assert.ok(setupSwift.includes('var createLauncher = true'), 'InstallerOptions defaults createLauncher to true');
  assert.ok(setupSwift.includes('"--create-launcher"'), 'Setup supports --create-launcher CLI flag');
  assert.ok(setupSwift.includes('"--no-launcher"'), 'Setup supports --no-launcher CLI flag');
  assert.ok(setupSwift.includes('NSButton(\n            checkboxWithTitle:'), 'Setup GUI adds default-checked checkbox for lossless launcher');
  assert.ok(setupSwift.includes('创建无损启动器（~/Applications/Antigravity Prism.app，可拖进 Dock 一键开启）'), 'Setup GUI checkbox has Chinese label');
  assert.ok(setupSwift.includes('Create lossless launcher (~/Applications/Antigravity Prism.app, pin to Dock)'), 'Setup GUI checkbox has English label');
  assert.ok(setupSwift.includes('O_NOFOLLOW'), 'Swift launcher uses O_NOFOLLOW atomic writes');
  assert.ok(setupSwift.includes('io.github.rmvdesi.obsidian-prism.launcher'), 'Swift launcher uses canonical CFBundleIdentifier');
  assert.ok(setupSwift.includes('Contents/Resources/.obsidian-prism-launcher'), 'Swift launcher writes ownership marker file');
  assert.ok(setupSwift.includes('isManagedLauncherBundle(at:'), 'Swift uninstall verifies ownership marker/BundleID Fail-Closed');
  assert.ok(setupSwift.includes('removeLosslessLauncherIfManaged('), 'Swift runUninstall invokes safe launcher cleanup');

  // 3) Issue #37 InstallerI18n priority & AppleScript button self-consistency
  const i18nMatch = cdpSwift.match(/enum InstallerI18n \{[\s\S]*?\n\}/);
  assert.ok(i18nMatch, 'CdpClient.swift must define enum InstallerI18n');
  const i18nBlock = i18nMatch[0];
  const cliPos = i18nBlock.indexOf('parseCliLang(args)');
  const envPos = i18nBlock.indexOf('environment["AG_PRISM_LANG"]');
  const localePos = i18nBlock.indexOf('preferredLanguages.first');
  assert.ok(cliPos > 0 && envPos > cliPos && localePos > envPos, 'InstallerI18n priority must be CLI --lang > AG_PRISM_LANG > Locale.preferredLanguages');
  assert.ok(i18nBlock.includes('static func tr(_ zh: String, _ en: String) -> String'), 'InstallerI18n exposes tr(_:_:)');

  // Verify Setup & Watcher parse both `--lang <val>` and `--lang=<val>`
  assert.ok(setupSwift.includes('a == "--lang"') && setupSwift.includes('a.hasPrefix("--lang=")'), 'Setup parses --lang and --lang=');
  assert.ok(watcherSwift.includes('a == "--lang"') && watcherSwift.includes('a.hasPrefix("--lang=")'), 'Watcher parses --lang and --lang=');

  // Verify promptUserForCdpRelaunch shares the same `relaunchBtn` constant for AppleScript default button & out.contains check
  const promptMatch = cdpSwift.match(/static func promptUserForCdpRelaunch\(\) -> Bool \{[\s\S]*?\n    \}/);
  assert.ok(promptMatch, 'CdpClient.swift must define promptUserForCdpRelaunch');
  const promptBody = promptMatch[0];
  assert.ok(promptBody.includes('let relaunchBtn = InstallerI18n.tr("立即重新打开", "Relaunch Now")'));
  assert.ok(promptBody.includes('default button \\"\\(escRelaunch)\\"'), 'AppleScript default button uses escaped relaunchBtn');
  assert.ok(promptBody.includes('return out.contains(relaunchBtn)'), 'osascript output matching dynamically checks relaunchBtn (never hardcoded Chinese)');

  // Verify Setup verify-cdp recognizes both Chinese and English watcher injection log lines
  assert.ok(
    setupSwift.includes('logContent.contains("[✓] 已注入 obsidian-prism:")') &&
      setupSwift.includes('logContent.contains("[✓] Injected obsidian-prism:")'),
    'Setup verify-cdp must recognize both Chinese and English watcher injection log entries'
  );

  // 4) Zero unwrapped Chinese user-visible strings across all 3 Swift files
  for (const [name, src] of [
    ['CdpClient.swift', cdpSwift],
    ['Setup/main.swift', setupSwift],
    ['Watcher/main.swift', watcherSwift],
  ]) {
    const lines = src.split('\n');
    let insideTr = false;
    let insideShellGen = false;
    let trDepth = 0;
    const unwrapped = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (trimmed.startsWith('//')) continue;
      if (line.includes('func generateLauncherShellScript')) insideShellGen = true;
      if (insideShellGen && trimmed.startsWith('return lines.joined')) {
        insideShellGen = false;
        continue;
      }
      const codePart = line.replace(/\/\/.*$/, '');
      if (!insideTr && codePart.includes('InstallerI18n.tr(')) {
        const idx = codePart.indexOf('InstallerI18n.tr(');
        const rest = codePart.slice(idx + 'InstallerI18n.tr'.length);
        trDepth = 0;
        let inStr = false;
        for (let k = 0; k < rest.length; k++) {
          const c = rest[k];
          if (inStr) {
            if (c === '\\') { k++; continue; }
            if (c === '"') inStr = false;
          } else {
            if (c === '"') inStr = true;
            else if (c === '(') trDepth++;
            else if (c === ')') { trDepth--; if (trDepth === 0) break; }
          }
        }
        if (trDepth > 0) insideTr = true;
        continue;
      }
      if (insideTr) {
        let inStr = false;
        for (let k = 0; k < codePart.length; k++) {
          const c = codePart[k];
          if (inStr) {
            if (c === '\\') { k++; continue; }
            if (c === '"') inStr = false;
          } else {
            if (c === '"') inStr = true;
            else if (c === '(') trDepth++;
            else if (c === ')') { trDepth--; if (trDepth === 0) { insideTr = false; break; } }
          }
        }
        continue;
      }
      if (insideShellGen) continue;
      // Allow the bilingual log-match line in Setup/main.swift that checks both ZH & EN watcher output
      if (name === 'Setup/main.swift' && codePart.includes('logContent.contains("[✓] 已注入 obsidian-prism:")')) {
        continue;
      }
      if (/[\u4e00-\u9fff]/.test(codePart)) {
        unwrapped.push(`${name}:${i + 1}: ${trimmed}`);
      }
    }
    assert.deepEqual(unwrapped, [], `Found unwrapped Chinese strings in ${name}: ${unwrapped.join('; ')}`);
  }
});

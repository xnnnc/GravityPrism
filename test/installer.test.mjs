import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

function runExe(exePath, args, timeoutMs = 20000, customEnv = null) {
  return new Promise((resolve, reject) => {
    const child = spawn(exePath, args, {
      stdio: 'ignore',
      windowsHide: true,
      env: customEnv || process.env,
    });
    const timer = setTimeout(() => {
      try { child.kill(); } catch {}
      reject(new Error(`Timeout running ${path.basename(exePath)} ${args.join(' ')}`));
    }, timeoutMs);
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(exePath)} exited with code ${code}`));
    });
  });
}

import { VALIDATORS, buildInstaller } from '../scripts/build-installer.mjs';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const cdp = require(path.join(ROOT_DIR, 'cdp.js'));
const cliInstaller = require(path.join(ROOT_DIR, 'tools', 'install-plugin.cjs'));

function createMockCdpServer(options = {}) {
  const extraTargets = Array.isArray(options.extraTargets) ? options.extraTargets : [];
  const receivedCalls = [];
  const sockets = new Set();
  let prismMounted = false;
  let lastInjectedExpr = null;
  let lastRemovedExpr = null;
  const thoughtInjectExprs = [];
  const thoughtRemoveExprs = [];
  const addedScriptsById = new Map();

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
      const id = 'script-' + receivedCalls.length;
      addedScriptsById.set(id, (msg.params && msg.params.source) || '');
      result = { identifier: id };
    } else if (msg.method === 'Page.getFrameTree') {
      result = { frameTree: { frame: { id: 'MAIN_FRAME' } } };
    } else if (msg.method === 'Runtime.enable') {
      sendWsMessage(socket, {
        method: 'Runtime.executionContextCreated',
        params: {
          context: {
            id: 1,
            auxData: { frameId: 'MAIN_FRAME', isDefault: true, type: 'default' },
          },
        },
      });
    } else if (msg.method === 'Runtime.evaluate') {
      const expr = msg.params && msg.params.expression ? msg.params.expression : '';
      if (expr.startsWith('Boolean(window.__agPrism') || expr === 'Boolean(window.__agClaudeStyle)') {
        result = { result: { type: 'boolean', value: prismMounted } };
      } else if (expr.includes('delete globalThis.__agCsUiMain')) {
        lastRemovedExpr = expr;
        prismMounted = false;
        result = { result: { type: 'object', value: { removed: 3 } } };
      } else if (expr.includes('const isHostDom = Boolean(')) {
        result = {
          result: {
            type: 'object',
            value: {
              ready: true,
              isHostDom: true,
              prismAttr: cdp.PLUGIN_VERSION,
              hasPrism: prismMounted,
              hasRepoBridge: prismMounted,
              hasThoughtBridge: prismMounted,
              hasUsageBridge: prismMounted,
              hasOmniBridge: prismMounted,
              hasOmniServerMeta: prismMounted,
              hasOmni: prismMounted,
              omniMode: 'on',
              hasInlineDiff: prismMounted,
              codeHash: '',
              hasLegacyCss: false,
              needsDashboardSync: false,
            },
          },
        };
      } else if (expr.includes('const serverMeta = window.__agPrismOmniServerMeta')) {
        result = {
          result: {
            type: 'object',
            value: { ok: true, status: 'mounted' },
          },
        };
      } else if (expr.includes('const targetHash =') && expr.includes('__agPrismInlineDiff')) {
        result = {
          result: {
            type: 'object',
            value: { ok: true, status: 'mounted' },
          },
        };
      } else if (
        expr.includes('delete window.__agPrismInlineDiff') &&
        expr.includes("status: 'off'") &&
        !expr.includes('const targetHash =')
      ) {
        result = {
          result: {
            type: 'object',
            value: { ok: true, status: 'off' },
          },
        };
      } else if (expr.includes('const targetHash =') && expr.includes('__agPrismThoughtSettingsUi')) {
        thoughtInjectExprs.push(expr);
        result = {
          result: {
            type: 'object',
            value: { ok: true, status: 'mounted' },
          },
        };
      } else if (
        expr.includes('delete window.__agPrismThoughtSettingsUi') &&
        expr.includes("status: 'off'") &&
        !expr.includes('const targetHash =')
      ) {
        thoughtRemoveExprs.push(expr);
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
        prismMounted = true;
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
      const baseTargets = [
        {
          id: 'PAGE_1',
          type: 'page',
          title: 'Antigravity',
          url: 'https://127.0.0.1:9999/',
          webSocketDebuggerUrl: `ws://127.0.0.1:${addr.port}/devtools/page/PAGE_1`,
        },
        {
          id: 'BARE_UNTITLED_1',
          type: 'page',
          title: 'Untitled',
          url: 'https://127.0.0.1:9999/',
          webSocketDebuggerUrl: `ws://127.0.0.1:${addr.port}/devtools/page/BARE_UNTITLED_1`,
        },
        {
          id: 'LAUNCHPAD_1',
          type: 'page',
          title: 'Antigravity Launchpad',
          url: 'https://127.0.0.1:9999/launchpad.html',
          webSocketDebuggerUrl: `ws://127.0.0.1:${addr.port}/devtools/page/LAUNCHPAD_1`,
        },
        {
          id: 'USER_PREVIEW_1',
          type: 'page',
          title: 'AI Rap Video Generator',
          url: 'http://127.0.0.1:3115/',
          webSocketDebuggerUrl: `ws://127.0.0.1:${addr.port}/devtools/page/USER_PREVIEW_1`,
        },
        {
          id: 'EXT_WEB_1',
          type: 'page',
          title: 'Antigravity Spoofed External',
          url: 'https://example.com/',
          webSocketDebuggerUrl: `ws://127.0.0.1:${addr.port}/devtools/page/EXT_WEB_1`,
        },
        {
          id: 'DEVTOOLS_1',
          type: 'page',
          title: 'DevTools',
          url: 'devtools://devtools/bundled/inspector.html',
          webSocketDebuggerUrl: `ws://127.0.0.1:${addr.port}/devtools/page/DEVTOOLS_1`,
        },
      ];
      for (const extra of extraTargets) {
        baseTargets.push({
          ...extra,
          webSocketDebuggerUrl: `ws://127.0.0.1:${addr.port}/devtools/page/${extra.id}`,
        });
      }
      res.end(JSON.stringify(baseTargets));
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
    emitBindingCalled(name, payload, executionContextId = 1) {
      for (const s of sockets) {
        sendWsMessage(s, {
          method: 'Runtime.bindingCalled',
          params: { name, payload: JSON.stringify(payload), executionContextId },
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
    getThoughtInjectExprs() {
      return thoughtInjectExprs;
    },
    getThoughtRemoveExprs() {
      return thoughtRemoveExprs;
    },
    getAddedScriptsById() {
      return addedScriptsById;
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

test('installer manifest validators match inject.js, cdp.js, and config.example.json 100%', () => {
  const injectSrc = fs.readFileSync(path.join(ROOT_DIR, 'inject.js'), 'utf8');
  assert.ok(injectSrc.includes('validateConfigEntry'), 'inject.js must delegate directly to cdp.validateConfigEntry');
  assert.deepEqual(Object.keys(VALIDATORS).sort(), Object.keys(cdp.VALIDATORS).sort());

  const exampleCfg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'config.example.json'), 'utf8'));
  assert.deepEqual(Object.keys(exampleCfg).sort(), Object.keys(cdp.VALIDATORS).sort());
  for (const k of Object.keys(cdp.VALIDATORS)) {
    assert.ok(k in cdp.DEFAULT_CONFIG, `DEFAULT_CONFIG includes ${k}`);
    assert.ok(k in exampleCfg, `config.example.json includes ${k}`);
  }

  assert.equal(cdp.STYLE_ID, 'ag-prism-css');
  assert.equal(cdp.DEFAULT_CONFIG.palette, 'obsidian');
  assert.equal(cdp.DEFAULT_CONFIG.lightPreset, 'crystal');
  assert.equal(cdp.DEFAULT_CONFIG.motionLevel, 'ultra');
  assert.equal(cdp.DEFAULT_CONFIG.telemetryModule, 'auto');
  assert.equal(cdp.DEFAULT_CONFIG.effortSliderModule, 'auto');

  assert.deepEqual(VALIDATORS.palette, ['host', 'obsidian', 'warm', 'claude']);
  assert.deepEqual(VALIDATORS.lightPreset, ['crystal', 'alabaster']);
  assert.deepEqual(VALIDATORS.motionLevel, ['off', 'subtle', 'standard', 'ultra']);
  assert.deepEqual(VALIDATORS.telemetryModule, ['auto', 'on', 'off']);
  assert.deepEqual(VALIDATORS.effortSliderModule, ['auto', 'on', 'off']);

  assert.equal(exampleCfg.palette, 'obsidian');
  assert.equal(exampleCfg.lightPreset, 'crystal');
  assert.equal(exampleCfg.motionLevel, 'ultra');
  assert.equal(exampleCfg.telemetryModule, 'auto');
  assert.equal(exampleCfg.effortSliderModule, 'auto');

  // Wave 2: 6 new settings + host-workbench-enhancer.js registration parity
  assert.deepEqual(VALIDATORS.accentTone, ['follow', 'cobalt', 'iris', 'amber', 'mono']);
  assert.deepEqual(VALIDATORS.cornerStyle, ['sharp', 'balanced', 'soft']);
  assert.deepEqual(VALIDATORS.codeFont, ['default', 'jetbrains', 'cascadia', 'sfmono']);
  assert.equal(VALIDATORS.codeLigatures, 'boolean');
  assert.deepEqual(VALIDATORS.ambientIntensity, ['0', '35', '70', '100']);
  assert.deepEqual(VALIDATORS.thoughtView, ['immersive', 'bilingual']);
  assert.equal(exampleCfg.accentTone, 'follow');
  assert.equal(exampleCfg.cornerStyle, 'balanced');
  assert.equal(exampleCfg.codeFont, 'default');
  assert.equal(exampleCfg.codeLigatures, false);
  assert.equal(exampleCfg.ambientIntensity, '100');
  assert.equal(exampleCfg.thoughtView, 'immersive');
  assert.ok(cdp.RUNTIME_PARTS.includes('host-workbench-enhancer.js'));
  assert.ok(cdp.SYNC_ROOT_FILES.includes('host-workbench-enhancer.js'));
});

test(
  'installer.exe builds cleanly and executes full install, native Sidecar deployment, CDP injection, patch-batch sync, polite daemon yield, upgrade, and uninstall lifecycle',
  { skip: process.platform !== 'win32' ? 'Windows-only installer.exe E2E test' : false },
  async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-prism-e2e-'));
    const installerExe = path.join(workDir, 'installer.exe');
    const installDir = path.join(workDir, 'installed');
    const nativePluginDir = path.join(workDir, 'plugins', 'obsidian-prism');
    const outInstall = path.join(workDir, 'install.json');
    const outUpgrade = path.join(workDir, 'upgrade.json');
    const outUninstall = path.join(workDir, 'uninstall.json');
    const outStatus = path.join(workDir, 'status.json');
    const mockCdp = createMockCdpServer();

    try {
      const buildRes = buildInstaller({ outputPath: installerExe });
      assert.ok(fs.existsSync(installerExe));
      assert.ok(buildRes.sizeBytes > 50 * 1024);

      const port = await mockCdp.start();

      // 1. Check --status CLI
      await runExe(
        installerExe,
        ['--status', '--install-dir', installDir, '--plugin-dir', nativePluginDir, '--cdp-port', String(port), '--out', outStatus],
        10000
      );
      const st = JSON.parse(fs.readFileSync(outStatus, 'utf8'));
      assert.equal(st.installed, false);
      assert.equal(st.nativePluginInstalled, false);
      assert.equal(st.cdpPort, port);

      // Prepare 0-byte empty host config.json, user secret file, ephemeral cache file, and usage rollup cache in sandbox config root
      const sandboxHostCfgPath = path.join(workDir, 'config.json');
      const sandboxSecretPath = path.join(workDir, 'obsidian-prism-thought.json');
      const sandboxCachePath = path.join(workDir, 'obsidian-prism-thought-cache.json');
      const sandboxUsageCachePath = path.join(workDir, 'obsidian-prism-usage-rollup-cache.json');
      fs.writeFileSync(sandboxHostCfgPath, '', 'utf8');
      fs.writeFileSync(sandboxSecretPath, JSON.stringify({ engine: 'gemini', apiKey: 'test-user-secret' }), 'utf8');
      fs.writeFileSync(sandboxCachePath, JSON.stringify({ entries: { a: '1' } }), 'utf8');
      fs.writeFileSync(sandboxUsageCachePath, JSON.stringify({ version: 2, scopes: { local: {} } }), 'utf8');

      // 2. Run --silent install (--no-native-daemon to specifically exercise C# Watcher standalone fallback)
      await runExe(
        installerExe,
        [
          '--silent',
          '--no-autostart',
          '--no-kill-legacy',
          '--no-native-daemon',
          '--install-dir',
          installDir,
          '--plugin-dir',
          nativePluginDir,
          '--cdp-port',
          String(port),
          '--out',
          outInstall,
        ],
        20000
      );

      const installResult = JSON.parse(fs.readFileSync(outInstall, 'utf8'));
      assert.equal(installResult.ok, true);
      assert.equal(installResult.nativePluginDeployed, true);
      assert.equal(installResult.preservedExistingConfig, false);
      assert.deepEqual(installResult.injectedPages, ['Antigravity']);
      const hostRegistryAfterInstall = JSON.parse(fs.readFileSync(sandboxHostCfgPath, 'utf8'));
      assert.deepEqual(hostRegistryAfterInstall.plugins['obsidian-prism'], { enabled: true });
      assert.ok(fs.existsSync(path.join(installDir, 'obsidian-prism-watcher.exe')));
      assert.ok(fs.existsSync(path.join(installDir, 'obsidian-prism-installer.exe')));
      assert.ok(fs.existsSync(path.join(installDir, 'manifest.json')));
      assert.ok(fs.existsSync(path.join(installDir, 'host-workbench-enhancer.js')));
      assert.ok(fs.existsSync(path.join(installDir, 'vendor', 'pulse-dashboard', 'inline-fallback.js')));
      assert.ok(fs.existsSync(path.join(installDir, 'vendor', 'effort-slider', 'slider-coexist.js')));
      assert.ok(fs.existsSync(path.join(installDir, 'vendor', 'thought-translator', 'thought-client.js')));
      assert.ok(fs.existsSync(path.join(installDir, 'vendor', 'thought-translator', 'thought-settings-ui.js')));
      assert.ok(fs.existsSync(path.join(installDir, '.watch.pid')));

      // Verify full 5-channel native Sidecar plugin directory deployed cleanly
      assert.ok(fs.existsSync(path.join(nativePluginDir, 'plugin.json')));
      assert.ok(fs.existsSync(path.join(nativePluginDir, 'sidecars', 'daemon', 'sidecar.json')));
      assert.ok(fs.existsSync(path.join(nativePluginDir, 'sidecars', 'daemon', 'main.mjs')));
      assert.ok(fs.existsSync(path.join(nativePluginDir, 'vendor', 'thought-translator', 'translator-service.mjs')));
      assert.ok(fs.existsSync(path.join(nativePluginDir, 'vendor', 'pulse-dashboard', 'sidecars', 'panel', 'store.mjs')));
      assert.ok(fs.existsSync(path.join(nativePluginDir, 'host-workbench-enhancer.js')));
      assert.ok(fs.existsSync(path.join(nativePluginDir, 'config.json')));

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
      assert.doesNotThrow(() => new vm.Script(injectedExpr), 'C# injected JS compiles cleanly');

      // Verify codeHash parity and active config values between Node cdp.js and C# watcher
      const nodeExpr = cdp.buildInjectExpression();
      const nodeHash = nodeExpr.match(/"codeHash":"([^"]+)"/)[1];
      const csHash = injectedExpr.match(/"codeHash":"([^"]+)"/)[1];
      assert.equal(csHash, nodeHash);
      const expectedCfgObj = JSON.parse(expectedCfg);
      assert.ok(injectedExpr.includes(`"palette":"${expectedCfgObj.palette}"`));
      assert.ok(injectedExpr.includes(`"lightPreset":"${expectedCfgObj.lightPreset}"`));

      // Verify watcher --once CLI mode works standalone against CDP
      const watcherExe = path.join(installDir, 'obsidian-prism-watcher.exe');
      const onceOut = path.join(workDir, 'once.json');
      await runExe(
        watcherExe,
        ['--once', '--dir', installDir, '--cdp-port', String(port), '--out', onceOut],
        10000
      );
      const onceResult = JSON.parse(fs.readFileSync(onceOut, 'utf8'));
      assert.equal(onceResult.ok, true);
      assert.deepEqual(onceResult.pages, ['Antigravity']);

      // 3. Test Runtime.bindingCalled (single + patch-batch) -> config.json update & hot-reload
      const beforeCallCount = mockCdp.getCalls().length;
      mockCdp.emitBindingCalled(cdp.SETTING_BINDING, { key: 'palette', value: 'hacker-invalid' });
      mockCdp.emitBindingCalled(cdp.SETTING_BINDING, { key: 'lightPreset', value: 'invalid-preset' });
      mockCdp.emitBindingCalled(cdp.SETTING_BINDING, { key: 'lightPreset', value: 'alabaster' });
      mockCdp.emitBindingCalled(cdp.SETTING_BINDING, { key: 'palette', value: 'warm' });
      mockCdp.emitBindingCalled(cdp.SETTING_BINDING, {
        action: 'patch-batch',
        entries: {
          accentTone: 'iris',
          cornerStyle: 'soft',
          ambientIntensity: '70',
          thoughtView: 'bilingual',
          codeLigatures: true,
        },
      });

      const updatedCfg = await waitFor(() => {
        const parsed = JSON.parse(fs.readFileSync(path.join(installDir, 'config.json'), 'utf8'));
        return parsed.palette === 'warm' &&
          parsed.lightPreset === 'alabaster' &&
          parsed.accentTone === 'iris' &&
          parsed.cornerStyle === 'soft' &&
          parsed.ambientIntensity === '70' &&
          parsed.thoughtView === 'bilingual' &&
          parsed.codeLigatures === true
          ? parsed
          : null;
      });
      assert.equal(updatedCfg.palette, 'warm');
      assert.equal(updatedCfg.lightPreset, 'alabaster');
      assert.equal(updatedCfg.accentTone, 'iris');
      assert.equal(updatedCfg.ambientIntensity, '70');

      const syncedPluginCfg = await waitFor(() => {
        const parsed = JSON.parse(fs.readFileSync(path.join(nativePluginDir, 'config.json'), 'utf8'));
        return parsed.accentTone === 'iris' && parsed.thoughtView === 'bilingual' ? parsed : null;
      });
      assert.equal(syncedPluginCfg.accentTone, 'iris');
      assert.equal(syncedPluginCfg.thoughtView, 'bilingual');

      // Confirm hot-reload fired on watcher
      await waitFor(() => {
        const newer = mockCdp.getCalls().slice(beforeCallCount);
        return newer.some((c) => c.method === 'Page.removeScriptToEvaluateOnNewDocument') ? true : null;
      });

      // 3a. Channel 5 (thought-translator): default off must not inject; hot-toggle ai -> off injects then removes cleanly
      assert.equal(
        mockCdp.getThoughtInjectExprs().length,
        0,
        'Channel 5 thought expression must NOT be injected when thoughtTranslate defaults to off'
      );
      mockCdp.emitBindingCalled(cdp.SETTING_BINDING, { key: 'thoughtTranslate', value: 'ai' });
      const thoughtInjected = await waitFor(() => {
        const arr = mockCdp.getThoughtInjectExprs();
        return arr.length > 0 ? arr[arr.length - 1] : null;
      }, 6000, 100);
      assert.doesNotThrow(() => new vm.Script(thoughtInjected), 'C# Channel 5 thought JS must compile cleanly');
      assert.ok(thoughtInjected.includes('"thoughtTranslate":"ai"'), 'C# Channel 5 bootCfg reflects ai mode');
      const registeredThoughtScriptId = Array.from(mockCdp.getAddedScriptsById().entries())
        .reverse()
        .find(([, src]) => src.includes('const targetHash =') && src.includes('__agPrismThoughtSettingsUi'))?.[0];
      assert.ok(registeredThoughtScriptId, 'C# Watcher must register Channel 5 via Page.addScriptToEvaluateOnNewDocument');

      const beforeDisableCallIdx = mockCdp.getCalls().length;
      mockCdp.emitBindingCalled(cdp.SETTING_BINDING, { key: 'thoughtTranslate', value: 'off' });
      await waitFor(() => {
        const removedExprs = mockCdp.getThoughtRemoveExprs();
        const removedScript = mockCdp
          .getCalls()
          .slice(beforeDisableCallIdx)
          .some(
            (c) =>
              c.method === 'Page.removeScriptToEvaluateOnNewDocument' &&
              c.params?.identifier === registeredThoughtScriptId
          );
        return removedExprs.length > 0 && removedScript ? true : null;
      }, 6000, 100);

      // 3b. Test Watcher polite yield when native Sidecar daemon (.daemon.pid) is alive & auto-resume on exit
      const daemonPidPath = path.join(nativePluginDir, '.daemon.pid');
      const watchLogPath = path.join(installDir, 'watch.log');
      const mockDaemonProc = spawn(
        process.execPath,
        ['-e', 'setInterval(() => {}, 1000)', path.join(nativePluginDir, 'sidecars', 'daemon', 'main.mjs')],
        { stdio: 'ignore', windowsHide: true }
      );
      try {
        fs.writeFileSync(daemonPidPath, JSON.stringify({ pid: mockDaemonProc.pid }), 'utf8');
        await waitFor(() => {
          const logText = fs.existsSync(watchLogPath) ? fs.readFileSync(watchLogPath, 'utf8') : '';
          return logText.includes('检测到本地守护服务运行中') ||
            logText.includes('Local background daemon detected; Watcher entering standby mode')
            ? true
            : null;
        }, 6000, 120);
        fs.unlinkSync(daemonPidPath);
        await waitFor(() => {
          const logText = fs.existsSync(watchLogPath) ? fs.readFileSync(watchLogPath, 'utf8') : '';
          return logText.includes('本地守护服务已离线') ||
            logText.includes('Local background daemon offline; Watcher taking over live injection')
            ? true
            : null;
        }, 6000, 120);
      } finally {
        try { mockDaemonProc.kill(); } catch {}
      }

      // 4. Test re-install / upgrade preserves existing user config.json across both dirs
      await runExe(
        installerExe,
        [
          '--silent',
          '--no-autostart',
          '--no-kill-legacy',
          '--no-native-daemon',
          '--install-dir',
          installDir,
          '--plugin-dir',
          nativePluginDir,
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
      assert.equal(cfgAfterUpgrade.lightPreset, 'alabaster');
      assert.equal(cfgAfterUpgrade.accentTone, 'iris');

      // 5. Test --uninstall from installed copy inside installDir (exercises self-delete, plugin cleanup & CDP cleanup)
      const installedSelf = path.join(installDir, 'obsidian-prism-installer.exe');
      await runExe(
        installedSelf,
        [
          '--uninstall',
          '--silent',
          '--no-autostart',
          '--install-dir',
          installDir,
          '--plugin-dir',
          nativePluginDir,
          '--cdp-port',
          String(port),
          '--out',
          outUninstall,
        ],
        20000
      );

      const uninstallResult = JSON.parse(fs.readFileSync(outUninstall, 'utf8'));
      assert.equal(uninstallResult.ok, true);
      assert.equal(uninstallResult.selfDeleteScheduled, true);
      assert.deepEqual(uninstallResult.injectedPages, ['Antigravity']);
      assert.equal(mockCdp.getLastRemovedExpr(), cdp.REMOVE_EXPRESSION);
      assert.equal(fs.existsSync(nativePluginDir), false);
      const hostRegistryAfterUninstall = JSON.parse(fs.readFileSync(sandboxHostCfgPath, 'utf8'));
      assert.equal(hostRegistryAfterUninstall.plugins?.['obsidian-prism'], undefined);
      assert.equal(fs.existsSync(sandboxCachePath), false, 'ephemeral thought cache must be removed on uninstall');
      assert.equal(fs.existsSync(sandboxSecretPath), true, 'user secret file obsidian-prism-thought.json must be preserved');
      assert.equal(fs.existsSync(sandboxUsageCachePath), true, 'usage rollup cache must be preserved on default uninstall (without --purge-data)');

      await waitFor(() => (!fs.existsSync(installDir) ? true : null), 20000, 150);
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

test('CLI syncHostPluginRegistry safely initializes 0-byte config.json and preserves user secret file on uninstall', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-prism-cli-reg-'));
  try {
    const cfgPath = path.join(workDir, 'config.json');
    const secretPath = path.join(workDir, 'obsidian-prism-thought.json');
    const cachePath = path.join(workDir, 'obsidian-prism-thought-cache.json');
    fs.writeFileSync(cfgPath, '', 'utf8');
    fs.writeFileSync(secretPath, '{"apiKey":"keep-me"}', 'utf8');
    fs.writeFileSync(cachePath, '{"cached":1}', 'utf8');

    assert.equal(cliInstaller.syncHostPluginRegistry(workDir, true), true);
    const enabledCfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    assert.deepEqual(enabledCfg.plugins['obsidian-prism'], { enabled: true });

    enabledCfg.plugins['antigravity-prism'] = { enabled: true };
    enabledCfg.sidecars = { 'obsidian-prism/daemon': { enabled: true }, other: { enabled: true } };
    fs.writeFileSync(cfgPath, JSON.stringify(enabledCfg, null, 2), 'utf8');

    assert.equal(cliInstaller.syncHostPluginRegistry(workDir, false), true);
    const cleanedCfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    assert.equal(cleanedCfg.plugins['obsidian-prism'], undefined);
    assert.equal(cleanedCfg.plugins['antigravity-prism'], undefined);
    assert.equal(cleanedCfg.sidecars['obsidian-prism/daemon'], undefined);
    assert.deepEqual(cleanedCfg.sidecars.other, { enabled: true });
    assert.equal(fs.existsSync(cachePath), false);
    assert.equal(fs.existsSync(secretPath), true);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});

test(
  'installer.exe zero-Node bare-machine mode boots full 5-channel native Sidecar via ELECTRON_RUN_AS_NODE=1, injects Untitled Conversation, and auto-respawns daemon',
  { skip: process.platform !== 'win32' ? 'Windows-only zero-Node native daemon E2E test' : false },
  async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-prism-zero-node-'));
    const installerExe = path.join(workDir, 'installer.exe');
    const installDir = path.join(workDir, 'installed');
    const nativePluginDir = path.join(workDir, 'plugins', 'obsidian-prism');
    const outInstall = path.join(workDir, 'install.json');
    const outStatus = path.join(workDir, 'status.json');
    const outUninstall = path.join(workDir, 'uninstall.json');
    const mockCdp = createMockCdpServer({
      extraTargets: [
        {
          id: 'SWARM_FULL_VIEW_1',
          type: 'page',
          title: 'Untitled Conversation - antigravity - Antigravity',
          url: 'https://127.0.0.1:9999/?view=agent',
        },
      ],
    });

    try {
      buildInstaller({ outputPath: installerExe });
      const port = await mockCdp.start();

      // Strip all Node.js directories from PATH to simulate a bare Windows machine without system Node.js
      const rawPath = process.env.PATH || process.env.Path || '';
      const strippedPath = rawPath
        .split(path.delimiter)
        .filter((seg) => {
          if (!seg) return false;
          try {
            return !fs.existsSync(path.join(seg.trim(), 'node.exe'));
          } catch {
            return true;
          }
        })
        .join(path.delimiter);

      const localAppData = process.env.LOCALAPPDATA || '';
      const realAgExe = localAppData
        ? path.join(localAppData, 'Programs', 'antigravity', 'Antigravity.exe')
        : '';
      const bareEnv = {
        ...process.env,
        PATH: strippedPath,
        Path: strippedPath,
      };
      delete bareEnv.AG_PRISM_NO_NATIVE_DAEMON;
      if (!realAgExe || !fs.existsSync(realAgExe)) {
        bareEnv.AG_PRISM_ELECTRON_EXE = process.execPath;
      }

      await runExe(
        installerExe,
        [
          '--silent',
          '--no-autostart',
          '--no-kill-legacy',
          '--install-dir',
          installDir,
          '--plugin-dir',
          nativePluginDir,
          '--cdp-port',
          String(port),
          '--out',
          outInstall,
        ],
        25000,
        bareEnv
      );

      const installRes = JSON.parse(fs.readFileSync(outInstall, 'utf8'));
      assert.equal(installRes.ok, true);
      assert.equal(installRes.nativePluginDeployed, true);
      assert.equal(installRes.nativeDaemonStarted, true, 'Setup must immediately boot native 5-channel daemon');

      await runExe(
        installerExe,
        ['--status', '--install-dir', installDir, '--plugin-dir', nativePluginDir, '--cdp-port', String(port), '--out', outStatus],
        10000,
        bareEnv
      );
      const statusObj = JSON.parse(fs.readFileSync(outStatus, 'utf8'));
      assert.equal(statusObj.nativeDaemonAlive, true);

      // Wait for all 6 privileged 5-channel bindings to be registered by sidecars/daemon/main.mjs
      const requiredBindings = [
        '__agPrismSetting',
        '__agPrismMetricsCall',
        '__agPrismThoughtCall',
        '__agPrismUsageCall',
        '__agPrismRepoCall',
        '__agPrismOmniCall',
      ];
      await waitFor(() => {
        const bound = new Set(
          mockCdp
            .getCalls()
            .filter((c) => c.method === 'Runtime.addBinding' && c.params?.name)
            .map((c) => c.params.name)
        );
        return requiredBindings.every((b) => bound.has(b)) ? true : null;
      }, 8000, 120);

      // Verify Untitled Conversation Swarm Full View was injected alongside Antigravity main window (2 pages, bare Untitled/launchpad skipped)
      assert.ok(
        installRes.injectedPages.some((t) => t.startsWith('Untitled Conversation')),
        `Expected Untitled Conversation to be injected, got: ${JSON.stringify(installRes.injectedPages)}`
      );
      assert.equal(installRes.injectedPages.includes('Untitled'), false);

      // Kill the native daemon and verify background C# Watcher auto-respawns it
      const pidFile = path.join(nativePluginDir, '.daemon.pid');
      const firstLock = JSON.parse(fs.readFileSync(pidFile, 'utf8'));
      assert.ok(firstLock.pid > 0);
      try {
        process.kill(firstLock.pid);
      } catch {}

      const respawnedLock = await waitFor(() => {
        if (!fs.existsSync(pidFile)) return null;
        const parsed = JSON.parse(fs.readFileSync(pidFile, 'utf8'));
        return parsed.pid > 0 && parsed.pid !== firstLock.pid ? parsed : null;
      }, 12000, 200);
      assert.notEqual(respawnedLock.pid, firstLock.pid, 'Watcher must auto-respawn native Sidecar daemon');

      // Clean uninstall stops both Watcher and Electron RunAsNode native daemon
      await runExe(
        installerExe,
        [
          '--uninstall',
          '--silent',
          '--no-autostart',
          '--install-dir',
          installDir,
          '--plugin-dir',
          nativePluginDir,
          '--cdp-port',
          String(port),
          '--out',
          outUninstall,
        ],
        25000,
        bareEnv
      );
      const unRes = JSON.parse(fs.readFileSync(outUninstall, 'utf8'));
      assert.equal(unRes.ok, true);
      assert.equal(fs.existsSync(nativePluginDir), false);
      assert.equal(fs.existsSync(installDir), false);
    } finally {
      try {
        const pidFile = path.join(nativePluginDir, '.daemon.pid');
        if (fs.existsSync(pidFile)) {
          const parsed = JSON.parse(fs.readFileSync(pidFile, 'utf8'));
          if (parsed.pid) process.kill(parsed.pid);
        }
      } catch {}
      try {
        const wPidFile = path.join(installDir, '.watch.pid');
        if (fs.existsSync(wPidFile)) {
          const wPid = parseInt(fs.readFileSync(wPidFile, 'utf8'), 10);
          if (wPid) process.kill(wPid);
        }
      } catch {}
      await mockCdp.close();
      try {
        fs.rmSync(workDir, { recursive: true, force: true });
      } catch {}
    }
  }
);

test(
  'installer.exe v2.33.0+ compatibility: patches Antigravity.lnk with --remote-debugging-port=0 (ignoring Antigravity Tools.lnk), writes shared .relaunch-prompt-state.json once, and restores original .lnk args on uninstall',
  { skip: process.platform !== 'win32' ? 'Windows-only .lnk & relaunch-state E2E test' : false },
  async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-prism-v233-'));
    const installerExe = path.join(workDir, 'installer.exe');
    const installDir = path.join(workDir, 'installed');
    const nativePluginDir = path.join(workDir, 'plugins', 'obsidian-prism');
    const shortcutDir = path.join(workDir, 'shortcuts');
    const fakeBinDir = path.join(workDir, 'fake-bin');
    const fakeAppData = path.join(workDir, 'appdata');
    const outInstall = path.join(workDir, 'install.json');
    const outUninstall = path.join(workDir, 'uninstall.json');

    fs.mkdirSync(shortcutDir, { recursive: true });
    fs.mkdirSync(fakeBinDir, { recursive: true });
    fs.mkdirSync(fakeAppData, { recursive: true });

    const fakeAgExe = path.join(fakeBinDir, 'Antigravity.exe');
    const fakeToolsExe = path.join(fakeBinDir, 'antigravity-tools.exe');
    fs.writeFileSync(fakeAgExe, 'stub', 'utf8');
    fs.writeFileSync(fakeToolsExe, 'stub', 'utf8');

    const agLnk = path.join(shortcutDir, 'Antigravity.lnk');
    const toolsLnk = path.join(shortcutDir, 'Antigravity Tools.lnk');

    const createLnkPs = [
      '$sh = New-Object -ComObject WScript.Shell;',
      '$s1 = $sh.CreateShortcut($env:TEST_AG_LNK);',
      '$s1.TargetPath = $env:TEST_AG_EXE;',
      '$s1.Arguments = "--reuse-window";',
      '$s1.Save();',
      '$s2 = $sh.CreateShortcut($env:TEST_TOOLS_LNK);',
      '$s2.TargetPath = $env:TEST_TOOLS_EXE;',
      '$s2.Arguments = "--helper";',
      '$s2.Save();',
    ].join(' ');
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', createLnkPs], {
      env: {
        ...process.env,
        TEST_AG_LNK: agLnk,
        TEST_AG_EXE: fakeAgExe,
        TEST_TOOLS_LNK: toolsLnk,
        TEST_TOOLS_EXE: fakeToolsExe,
      },
    });

    const readLnkArgs = (lnkFile) =>
      execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          '$sh = New-Object -ComObject WScript.Shell; Write-Output ($sh.CreateShortcut($env:TEST_LNK).Arguments)',
        ],
        {
          encoding: 'utf8',
          env: { ...process.env, TEST_LNK: lnkFile },
        }
      ).trim();

    const dummyBareHost = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      stdio: 'ignore',
      windowsHide: true,
    });

    try {
      buildInstaller({ outputPath: installerExe });

      const testEnv = {
        ...process.env,
        APPDATA: fakeAppData,
        AG_PRISM_SHORTCUT_DIRS: shortcutDir,
        AG_PRISM_MOCK_BARE_HOST_PID: String(dummyBareHost.pid),
        AG_PRISM_MOCK_BARE_HOST_UPTIME_MS: '12000',
        AG_PRISM_MOCK_RELAUNCH_DECISION: 'no',
      };
      delete testEnv.NODE_ENV;
      delete testEnv.PRISM_NO_RELAUNCH_PROMPT;
      delete testEnv.AG_PRISM_NO_RELAUNCH_PROMPT;

      await runExe(
        installerExe,
        [
          '--silent',
          '--no-autostart',
          '--no-kill-legacy',
          '--no-native-daemon',
          '--install-dir',
          installDir,
          '--plugin-dir',
          nativePluginDir,
          '--out',
          outInstall,
        ],
        20000,
        testEnv
      );

      const installRes = JSON.parse(fs.readFileSync(outInstall, 'utf8'));
      assert.equal(installRes.ok, true);
      assert.equal(installRes.patchedShortcuts, 1);
      assert.equal(installRes.bareHostDetected, true);
      assert.equal(readLnkArgs(agLnk), '--reuse-window --remote-debugging-port=0');
      assert.equal(readLnkArgs(toolsLnk), '--helper', 'must not touch Antigravity Tools.lnk');

      const patchedRecord = JSON.parse(
        fs.readFileSync(path.join(nativePluginDir, '.patched-shortcuts.json'), 'utf8')
      );
      assert.ok(Array.isArray(patchedRecord.patchedPaths) && patchedRecord.patchedPaths.length === 1);

      // Verify background Watcher writes shared .relaunch-prompt-state.json deduplication lock once
      const promptStatePath = path.join(nativePluginDir, '.relaunch-prompt-state.json');
      const stateObj = await waitFor(() => {
        if (!fs.existsSync(promptStatePath)) return null;
        const parsed = JSON.parse(fs.readFileSync(promptStatePath, 'utf8'));
        return parsed.hostPid === dummyBareHost.pid && parsed.decision === 'no' ? parsed : null;
      }, 8000, 150);
      assert.equal(stateObj.hostPid, dummyBareHost.pid);
      assert.ok(String(stateObj.hostKey).startsWith(`${dummyBareHost.pid}:`));

      // Uninstall must cleanly strip --remote-debugging-port=0 while preserving original --reuse-window
      await runExe(
        installerExe,
        [
          '--uninstall',
          '--silent',
          '--no-autostart',
          '--install-dir',
          installDir,
          '--plugin-dir',
          nativePluginDir,
          '--out',
          outUninstall,
        ],
        20000,
        testEnv
      );

      const unRes = JSON.parse(fs.readFileSync(outUninstall, 'utf8'));
      assert.equal(unRes.ok, true);
      assert.equal(unRes.restoredShortcuts, 1);
      assert.equal(readLnkArgs(agLnk), '--reuse-window');
      assert.equal(readLnkArgs(toolsLnk), '--helper');
    } finally {
      try {
        dummyBareHost.kill();
      } catch {}
      try {
        const wPidFile = path.join(installDir, '.watch.pid');
        if (fs.existsSync(wPidFile)) {
          const wPid = parseInt(fs.readFileSync(wPidFile, 'utf8'), 10);
          if (wPid) process.kill(wPid);
        }
      } catch {}
      try {
        fs.rmSync(workDir, { recursive: true, force: true });
      } catch {}
    }
  }
);

test('interactive GUI installers require explicit user confirmation before installing (Windows & macOS)', () => {
  const winSrc = fs.readFileSync(path.join(ROOT_DIR, 'installer', 'setup', 'Program.cs'), 'utf8');
  const winInitMatch = winSrc.match(/private\s+async\s+Task\s+StartInitialActionAsync\(\)[\s\S]*?\n\s{8}\}/);
  assert.ok(winInitMatch, 'Windows InstallerForm.StartInitialActionAsync must exist');
  assert.doesNotMatch(
    winInitMatch[0],
    /ExecuteInstallAsync\s*\(/,
    'Windows GUI must NOT auto-run ExecuteInstallAsync() on launch without user click'
  );
  assert.match(winInitMatch[0], /PrepareInstallChoiceAsync\s*\(/);
  assert.match(winSrc, /_installBtn\.Click\s*\+=\s*async\s*\(s,\s*e\)\s*=>\s*await\s+ExecuteInstallAsync\(\)/);
  assert.match(winSrc, /_closeBtn\.Text\s*=\s*InstallerI18n\.Tr\("取消",\s*"Cancel"\)/);

  const macSrc = fs.readFileSync(path.join(ROOT_DIR, 'installer', 'macos', 'Setup', 'main.swift'), 'utf8');
  const macInitMatch = macSrc.match(/private\s+func\s+startInitialAction\(\)[\s\S]*?\n\s{4}\}/);
  assert.ok(macInitMatch, 'macOS InstallerAppDelegate.startInitialAction must exist');
  assert.doesNotMatch(
    macInitMatch[0],
    /executeInstall\s*\(/,
    'macOS GUI must NOT auto-run executeInstall() on launch without user click'
  );
  assert.match(macInitMatch[0], /prepareInstallChoice\s*\(/);
  assert.match(macSrc, /#selector\(handleInstallClick\)/);
  assert.match(macSrc, /closeBtn\s*=\s*NSButton\(\s*title:\s*(?:"取消"|InstallerI18n\.tr\("取消",\s*"Cancel"\))/);
});

test('Windows InstallerForm configures 96-DPI AutoScaleDimensions with AutoScaleMode.Dpi and safe button margins (#28)', () => {
  const winSrc = fs.readFileSync(path.join(ROOT_DIR, 'installer', 'setup', 'Program.cs'), 'utf8');
  const ctorMatch = winSrc.match(/public\s+InstallerForm\s*\(InstallerOptions\s+opts\)[\s\S]*?\n\s{8}\}/);
  assert.ok(ctorMatch, 'InstallerForm constructor must exist');
  const ctor = ctorMatch[0];
  const suspendIdx = ctor.indexOf('SuspendLayout();');
  const dimsIdx = ctor.indexOf('AutoScaleDimensions = new SizeF(96F, 96F);');
  const modeIdx = ctor.indexOf('AutoScaleMode = AutoScaleMode.Dpi;');
  const resumeIdx = ctor.indexOf('ResumeLayout(false);');
  const performIdx = ctor.indexOf('PerformLayout();');
  assert.ok(suspendIdx >= 0, 'InstallerForm must call SuspendLayout() before adding controls');
  assert.equal(ctor.includes('AutoScaleMode = AutoScaleMode.Font;'), false, 'InstallerForm must not pre-set AutoScaleMode.Font');
  assert.ok(dimsIdx > suspendIdx, 'InstallerForm must set AutoScaleDimensions to 96 DPI base');
  assert.ok(modeIdx > dimsIdx, 'InstallerForm must set AutoScaleMode.Dpi after AutoScaleDimensions');
  assert.ok(resumeIdx > modeIdx, 'InstallerForm must call ResumeLayout(false) after setting AutoScaleMode');
  assert.ok(performIdx > resumeIdx, 'InstallerForm must call PerformLayout() after ResumeLayout(false)');
  assert.ok(ctor.includes('_metaLabel.AutoEllipsis = true;'), '_metaLabel must enable AutoEllipsis to avoid long-path clipping');

  // Verify 96-DPI button geometry leaves generous horizontal padding for 6-7 CJK char labels and stays non-overlapping within ClientSize(588, 464)
  const readRect = (field) => {
    const loc = ctor.match(new RegExp(`${field}\\.Location\\s*=\\s*new\\s+Point\\((\\d+),\\s*(\\d+)\\);`));
    const sz = ctor.match(new RegExp(`${field}\\.Size\\s*=\\s*new\\s+Size\\((\\d+),\\s*(\\d+)\\);`));
    assert.ok(loc && sz, `Missing Location/Size for ${field}`);
    return { x: Number(loc[1]), y: Number(loc[2]), w: Number(sz[1]), h: Number(sz[2]) };
  };
  const uninstallR = readRect('_uninstallBtn');
  const openDirR = readRect('_openDirBtn');
  const installR = readRect('_installBtn');
  const launchR = readRect('_launchAgBtn');
  const closeR = readRect('_closeBtn');
  assert.ok(uninstallR.w >= 134, `Expected _uninstallBtn width >= 134 at 96 DPI, got ${uninstallR.w}`);
  assert.ok(openDirR.w >= 120, `Expected _openDirBtn width >= 120 at 96 DPI for 6 CJK chars, got ${openDirR.w}`);
  assert.ok(installR.w >= 136, `Expected _installBtn width >= 136 at 96 DPI for bold labels, got ${installR.w}`);
  assert.equal(launchR.x, installR.x);
  assert.equal(launchR.w, installR.w);
  assert.ok(uninstallR.x + uninstallR.w + 8 <= openDirR.x, '_uninstallBtn and _openDirBtn must keep >= 8px gap');
  assert.ok(openDirR.x + openDirR.w + 16 <= installR.x, '_openDirBtn and _installBtn must keep clean group separation');
  assert.ok(installR.x + installR.w + 8 <= closeR.x, '_installBtn and _closeBtn must keep >= 8px gap');
  assert.ok(closeR.x + closeR.w <= 568, `Rightmost button must stay within 20px right margin of 588px ClientSize, got ${closeR.x + closeR.w}`);
});

test('Windows C# installer & Watcher Channel 5 contracts and cdp.js REMOVE_EXPRESSION data-ces-model-selected cleanup', () => {
  const cdpCs = fs.readFileSync(path.join(ROOT_DIR, 'installer', 'common', 'CdpClient.cs'), 'utf8');
  const watcherCs = fs.readFileSync(path.join(ROOT_DIR, 'installer', 'watcher', 'Program.cs'), 'utf8');

  assert.ok(cdpCs.includes('public static bool ShouldEnableThought(Dictionary<string, object> cfg)'));
  assert.ok(cdpCs.includes('public static string BuildThoughtExpression(string pluginDir, Dictionary<string, object> cfg)'));
  assert.ok(cdpCs.includes('public const string ThoughtRemoveExpression'));
  assert.ok(cdpCs.includes('ResolveSafePluginFile'));
  assert.ok(cdpCs.includes('vendor/thought-translator/thought-client.js'));
  assert.ok(cdpCs.includes('vendor/thought-translator/thought-settings-ui.js'));

  assert.ok(watcherCs.includes('public string ThoughtScriptId;'));
  assert.ok(watcherCs.includes('CdpHelper.ShouldEnableThought('));
  assert.ok(watcherCs.includes('CdpHelper.BuildThoughtExpression('));
  assert.ok(watcherCs.includes('CdpHelper.ThoughtRemoveExpression'));
  assert.ok(watcherCs.includes('vendor/thought-translator/'));

  // Verify cdp.js REMOVE_EXPRESSION statically includes & strips data-ces-model-selected
  assert.ok(
    cdp.REMOVE_EXPRESSION.includes("'data-ces-model-selected'"),
    'cdp.REMOVE_EXPRESSION static attribute cleanup list must include data-ces-model-selected'
  );
  const removedAttrs = [];
  const fakeRow = {
    removeAttribute(attr) {
      removedAttrs.push(attr);
    },
  };
  const fakeDoc = {
    documentElement: {
      removeAttribute() {},
      getAttribute() { return null; },
      style: { removeProperty() {} },
    },
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll(sel) {
      if (sel === '[data-ces-model-selected]') return [fakeRow];
      return [];
    },
  };
  const ctx = { window: {}, globalThis: {}, document: fakeDoc };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.runInNewContext(cdp.REMOVE_EXPRESSION, ctx);
  assert.ok(
    removedAttrs.includes('data-ces-model-selected'),
    'Executing cdp.REMOVE_EXPRESSION must strip data-ces-model-selected from DOM nodes'
  );
});

test('Windows C# CdpClient ReconcileConfigAliases (#5) & BuildConfigRefreshExpression thoughtView off removal (#7b)', () => {
  const cdpCs = fs.readFileSync(path.join(ROOT_DIR, 'installer', 'common', 'CdpClient.cs'), 'utf8');

  // Static contract parity
  for (const key of ['telemetryModule', 'effortSliderModule', 'omniModule', 'sidebarStudio', 'autoUpdate']) {
    assert.ok(cdpCs.includes(`"${key}"`), `C# ReconcileConfigAliases must handle boolean->on/off for ${key}`);
  }
  assert.ok(cdpCs.includes('"claude"') && cdpCs.includes('"warm"'), 'C# ReconcileConfigAliases maps palette claude->warm');
  assert.ok(cdpCs.includes('"dual"') && cdpCs.includes('"crab"'), 'C# ReconcileConfigAliases maps mascot dual->crab');
  assert.ok(
    cdpCs.includes("removeAttribute('data-ag-prism-thought-view')"),
    'C# BuildConfigRefreshExpression removes data-ag-prism-thought-view when thoughtTranslate is off'
  );

  // Live C# execution verification on Windows via csc.exe
  if (process.platform === 'win32') {
    const winDir = process.env.WINDIR || 'C:\\Windows';
    const csc = [
      path.join(winDir, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
      path.join(winDir, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'),
    ].find((p) => fs.existsSync(p));
    assert.ok(csc, 'Expected .NET Framework csc.exe on Windows');

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-prism-cs-alias-'));
    try {
      const probeCs = path.join(tmpDir, 'Probe.cs');
      const probeExe = path.join(tmpDir, 'probe.exe');
      const cfgDir = path.join(tmpDir, 'plugin');
      fs.mkdirSync(cfgDir, { recursive: true });
      fs.writeFileSync(path.join(cfgDir, 'style.css'), '/* stub */', 'utf8');
      fs.writeFileSync(path.join(cfgDir, 'ui-runtime.js'), '/* stub */', 'utf8');
      fs.writeFileSync(
        path.join(cfgDir, 'config.json'),
        JSON.stringify({
          palette: 'claude',
          mascot: 'dual',
          telemetryModule: true,
          effortSliderModule: false,
          omniModule: false,
          sidebarStudio: true,
          autoUpdate: true,
          thoughtTranslate: 'off',
          thoughtView: 'bilingual',
        }),
        'utf8'
      );

      fs.writeFileSync(
        probeCs,
        [
          'using System;',
          'using System.Collections.Generic;',
          'using AgyClaudeStyle;',
          'class Probe {',
          '  static void Main(string[] args) {',
          '    var m = new PluginManifest();',
          '    m.Version = "1.0.6";',
          '    m.SettingBinding = "__agPrismSetting";',
          '    m.Parts = new List<string> { "ui-runtime.js" };',
          '    m.DefaultConfig = new Dictionary<string, object>(StringComparer.Ordinal) {',
          '      { "palette", "obsidian" }, { "mascot", "crab" }, { "thoughtTranslate", "off" }, { "thoughtView", "immersive" }',
          '    };',
          '    var cfg = CdpHelper.ReadConfig(args[0], m);',
          '    var exprOff = CdpHelper.BuildConfigRefreshExpression(args[0], m);',
          '    var outObj = new Dictionary<string, object>(StringComparer.Ordinal) {',
          '      { "cfg", cfg },',
          '      { "exprOff", exprOff }',
          '    };',
          '    Console.Write(MiniJson.Stringify(outObj, false));',
          '  }',
          '}',
        ].join('\n'),
        'utf8'
      );

      execFileSync(
        csc,
        [
          '/nologo',
          '/utf8output',
          '/codepage:65001',
          '/target:exe',
          `/out:${probeExe}`,
          '/r:System.dll',
          '/r:System.Core.dll',
          '/r:System.Net.Http.dll',
          path.join(ROOT_DIR, 'installer', 'common', 'MiniJson.cs'),
          path.join(ROOT_DIR, 'installer', 'common', 'CdpClient.cs'),
          probeCs,
        ],
        { stdio: 'pipe' }
      );

      const rawOut = execFileSync(probeExe, [cfgDir], { encoding: 'utf8' });
      const parsed = JSON.parse(rawOut);
      assert.equal(parsed.cfg.palette, 'warm', 'C# ReadConfig/ReconcileConfigAliases must normalize palette claude->warm');
      assert.equal(parsed.cfg.mascot, 'crab', 'C# ReadConfig/ReconcileConfigAliases must normalize mascot dual->crab');
      assert.equal(parsed.cfg.telemetryModule, 'on');
      assert.equal(parsed.cfg.effortSliderModule, 'off');
      assert.equal(parsed.cfg.omniModule, 'off');
      assert.equal(parsed.cfg.sidebarStudio, 'on');
      assert.equal(parsed.cfg.autoUpdate, 'on');

      // Execute C#-generated BuildConfigRefreshExpression in VM for off vs ai
      assert.doesNotThrow(() => new vm.Script(parsed.exprOff), 'C# BuildConfigRefreshExpression must be valid JS');
      const attrs = new Map([['data-ag-prism-thought-view', 'bilingual']]);
      let liveCfg = null;
      const htmlEl = {
        hasAttribute: (k) => attrs.has(k),
        getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
        setAttribute: (k, v) => attrs.set(k, String(v)),
        removeAttribute: (k) => attrs.delete(k),
      };
      const vmCtx = {
        document: { documentElement: htmlEl },
        window: {
          __agPrism: {
            version: '1.0.6',
            refreshConfig(c) {
              liveCfg = c;
            },
            getState() {
              return { cfg: liveCfg };
            },
          },
        },
      };
      const resOff = vm.runInNewContext(parsed.exprOff, vmCtx);
      assert.equal(resOff.refreshed, true);
      assert.equal(htmlEl.hasAttribute('data-ag-prism-thought-view'), false, 'C# refresh expr must strip thought-view when off');

      // Re-run with thoughtTranslate='ai' -> sets data-ag-prism-thought-view='bilingual'
      fs.writeFileSync(
        path.join(cfgDir, 'config.json'),
        JSON.stringify({ thoughtTranslate: 'ai', thoughtView: 'bilingual' }),
        'utf8'
      );
      const parsedOn = JSON.parse(execFileSync(probeExe, [cfgDir], { encoding: 'utf8' }));
      const resOn = vm.runInNewContext(parsedOn.exprOff, vmCtx);
      assert.equal(resOn.refreshed, true);
      assert.equal(htmlEl.getAttribute('data-ag-prism-thought-view'), 'bilingual');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
});

test('remove.js preserves usage rollup cache by default and --purge-data safely cleans it while blocking symlinks and redline dirs', () => {
  const removeMod = require(path.join(ROOT_DIR, 'remove.js'));
  assert.deepEqual(removeMod.parseCliArgs([]), { purgeData: false });
  assert.deepEqual(removeMod.parseCliArgs(['--purge-data']), { purgeData: true });

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-prism-remove-purge-'));
  try {
    const geminiDir = path.join(workDir, '.gemini');
    const cfgDir = path.join(geminiDir, 'config');
    const telemetryDir = path.join(geminiDir, 'antigravity', 'sidecar_data', 'obsidian-prism', 'telemetry');
    const redlineDir = path.join(geminiDir, 'antigravity', 'conversations_archive');
    const overrideDir = path.join(workDir, 'override-usage');
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.mkdirSync(telemetryDir, { recursive: true });
    fs.mkdirSync(redlineDir, { recursive: true });
    fs.mkdirSync(overrideDir, { recursive: true });

    const usageCachePath = path.join(cfgDir, 'obsidian-prism-usage-rollup-cache.json');
    const thoughtCfgPath = path.join(cfgDir, 'obsidian-prism-thought.json');
    const thoughtCachePath = path.join(cfgDir, 'obsidian-prism-thought-cache.json');
    const backupCfgPath = path.join(cfgDir, 'obsidian-prism-config.backup.json');
    const sidebarCfgPath = path.join(cfgDir, 'obsidian-prism-sidebar.json');
    const sidebarBakPath = path.join(cfgDir, 'obsidian-prism-sidebar.json.v1.bak');
    const telSamplePath = path.join(telemetryDir, 'sample.json');
    const safeOverrideUsagePath = path.join(overrideDir, 'obsidian-prism-usage-rollup-cache.json');
    const hijackedNamePath = path.join(overrideDir, 'not-prism-file.json');
    const redlineUsagePath = path.join(redlineDir, 'obsidian-prism-usage-rollup-cache.json');

    fs.writeFileSync(usageCachePath, '{"version":2,"scopes":{"local":{}}}', 'utf8');
    fs.writeFileSync(thoughtCfgPath, '{"engine":"gemini"}', 'utf8');
    fs.writeFileSync(thoughtCachePath, '{"entries":{}}', 'utf8');
    fs.writeFileSync(backupCfgPath, '{"palette":"warm"}', 'utf8');
    fs.writeFileSync(sidebarCfgPath, '{"folders":[]}', 'utf8');
    fs.writeFileSync(sidebarBakPath, '{"folders":[]}', 'utf8');
    fs.writeFileSync(telSamplePath, '{"ok":true}', 'utf8');
    fs.writeFileSync(safeOverrideUsagePath, '{"version":2,"scopes":{"ssh:dev":{}}}', 'utf8');
    fs.writeFileSync(hijackedNamePath, '{"keep":true}', 'utf8');
    fs.writeFileSync(redlineUsagePath, '{"archive":true}', 'utf8');

    const baseEnv = {
      ...process.env,
      HOME: workDir,
      USERPROFILE: workDir,
      APPDATA: path.join(workDir, 'appdata'),
      LOCALAPPDATA: path.join(workDir, 'localappdata'),
      AG_PRISM_GEMINI_CONFIG_DIR: cfgDir,
      PRISM_USAGE_CACHE_PATH: safeOverrideUsagePath,
    };
    delete baseEnv.AG_CDP_PORT;
    delete baseEnv.AG_PRISM_TELEMETRY_DIR;

    // 1. Default `node remove.js` (no --purge-data) must preserve user configs and usage rollup cache
    execFileSync(process.execPath, [path.join(ROOT_DIR, 'remove.js')], {
      env: baseEnv,
      stdio: 'pipe',
    });
    assert.equal(fs.existsSync(usageCachePath), true, 'default remove.js must preserve obsidian-prism-usage-rollup-cache.json');
    assert.equal(fs.existsSync(safeOverrideUsagePath), true, 'default remove.js must preserve PRISM_USAGE_CACHE_PATH');
    assert.equal(fs.existsSync(thoughtCfgPath), true, 'default remove.js must preserve obsidian-prism-thought.json');
    assert.equal(fs.existsSync(telSamplePath), true, 'default remove.js must preserve telemetry dir');

    // 2. `node remove.js --purge-data` cleans usage rollup cache, configs, caches, safe override, and telemetry
    execFileSync(process.execPath, [path.join(ROOT_DIR, 'remove.js'), '--purge-data'], {
      env: baseEnv,
      stdio: 'pipe',
    });
    assert.equal(fs.existsSync(usageCachePath), false, '--purge-data must remove obsidian-prism-usage-rollup-cache.json');
    assert.equal(fs.existsSync(safeOverrideUsagePath), false, '--purge-data must remove safe PRISM_USAGE_CACHE_PATH override');
    assert.equal(fs.existsSync(thoughtCfgPath), false);
    assert.equal(fs.existsSync(thoughtCachePath), false);
    assert.equal(fs.existsSync(backupCfgPath), false);
    assert.equal(fs.existsSync(sidebarCfgPath), false);
    assert.equal(fs.existsSync(sidebarBakPath), false);
    assert.equal(fs.existsSync(telemetryDir), false);

    // 3. Security guard: hijacked filename & redline directory must never be deleted by --purge-data
    removeMod.purgeUserPluginData({ hostConfigDir: cfgDir, usageCachePath: hijackedNamePath });
    removeMod.purgeUserPluginData({ hostConfigDir: cfgDir, usageCachePath: redlineUsagePath });
    assert.equal(fs.existsSync(hijackedNamePath), true, 'non-allowlisted PRISM_USAGE_CACHE_PATH filename must never be deleted');
    assert.equal(fs.existsSync(redlineUsagePath), true, 'files inside redline conversations_archive must never be deleted');

    // 4. Symlink guard: symlinked usage cache file must never be unlinked (best-effort on platforms allowing file symlinks)
    const realVictim = path.join(workDir, 'victim.json');
    fs.writeFileSync(realVictim, '{"protected":true}', 'utf8');
    const symlinkCache = path.join(cfgDir, 'obsidian-prism-usage-rollup-cache.json');
    let symlinkCreated = false;
    try {
      fs.symlinkSync(realVictim, symlinkCache);
      symlinkCreated = true;
    } catch {}
    if (symlinkCreated) {
      removeMod.purgeUserPluginData({ hostConfigDir: cfgDir });
      assert.equal(fs.existsSync(symlinkCache), true, 'symlinked cache file must be refused by lstatSync guard');
      assert.equal(fs.existsSync(realVictim), true, 'symlink target must remain intact');
    }
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});

test('remove.js P1-5: --purge-data waits for slow-exiting daemon flush before deleting usage cache and escalates to SIGKILL on timeout', async () => {
  const removeMod = require(path.join(ROOT_DIR, 'remove.js'));
  assert.ok(
    removeMod.DAEMON_STOP_POLL_MS >= 25 && removeMod.DAEMON_STOP_POLL_MS <= 40,
    `Expected poll interval within 25..40ms, got ${removeMod.DAEMON_STOP_POLL_MS}`
  );
  assert.equal(removeMod.DAEMON_STOP_GRACEFUL_TIMEOUT_MS, 800);

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-prism-remove-p1-5-'));
  const spawnedChildren = [];
  try {
    const geminiDir = path.join(workDir, '.gemini');
    const cfgDir = path.join(geminiDir, 'config');
    fs.mkdirSync(cfgDir, { recursive: true });

    const usageCachePath = path.join(cfgDir, 'obsidian-prism-usage-rollup-cache.json');
    const flushMarkerPath = path.join(workDir, 'remove-flushed.marker');
    const triggerFilePath = path.join(workDir, 'remove-sigterm.trigger');
    const readyMarkerPath = path.join(workDir, 'remove-daemon.ready');
    const stubbornReadyPath = path.join(workDir, 'remove-stubborn.ready');
    const daemonPidFile = path.join(workDir, '.daemon.pid');
    const watchPidFile = path.join(workDir, '.watch.pid');
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

    const slowDaemonScript = `
      const fs = require('node:fs');
      const [cachePath, markerPath, triggerPath, readyPath] = process.argv.slice(1);
      let stopping = false;
      function gracefulStop() {
        if (stopping) return;
        stopping = true;
        setTimeout(() => {
          try { fs.writeFileSync(cachePath, '{"version":2,"scopes":{"local":{"revivedByRemove":true}}}', 'utf8'); } catch {}
          try { fs.writeFileSync(markerPath, String(Date.now()), 'utf8'); } catch {}
          setTimeout(() => process.exit(0), 25);
        }, 160);
      }
      process.on('SIGTERM', gracefulStop);
      setInterval(() => {
        if (fs.existsSync(triggerPath)) gracefulStop();
      }, 10);
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

    fs.writeFileSync(daemonPidFile, JSON.stringify({ pid: child.pid, startedAt: Date.now() }), 'utf8');

    const signals = [];
    const stopOpts = {
      hostConfigDir: cfgDir,
      watchPidFile,
      daemonPidFile,
      noCdp: true,
      pollIntervalMs: 25,
      gracefulTimeoutMs: 800,
      killWaitMs: 200,
      kill: (p, sig) => {
        signals.push(sig);
        if (process.platform === 'win32' && sig === 'SIGTERM') {
          fs.writeFileSync(triggerFilePath, '1', 'utf8');
          return;
        }
        process.kill(p, sig);
      },
    };

    const startedAt = Date.now();
    await removeMod.main(['--purge-data'], stopOpts);
    const elapsedMs = Date.now() - startedAt;

    assert.deepEqual(signals, ['SIGTERM'], 'gracefully exiting daemon must not require SIGKILL escalation');
    assert.equal(fs.existsSync(flushMarkerPath), true, 'slow daemon must have flushed before remove.js purged data');
    assert.ok(elapsedMs >= 140, `remove.js must wait for daemon exit before purging cache (${elapsedMs}ms)`);
    assert.equal(fs.existsSync(daemonPidFile), false, '.daemon.pid lock file must be removed');
    assert.equal(fs.existsSync(usageCachePath), false, 'usage cache written during daemon shutdown must be purged');

    await new Promise((r) => setTimeout(r, 250));
    assert.equal(childExited, true, 'slow daemon child process must have exited');
    assert.equal(fs.existsSync(usageCachePath), false, 'usage cache must NOT resurrect after remove.js --purge-data');

    // Timeout escalation to SIGKILL
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
    const termRes = await removeMod.terminatePidAndWait(stubborn.pid, {
      pollIntervalMs: 25,
      gracefulTimeoutMs: 120,
      killWaitMs: 400,
      kill: (p, sig) => {
        stubbornSignals.push(sig);
        if (process.platform === 'win32' && sig === 'SIGTERM') return;
        process.kill(p, sig);
      },
    });
    assert.deepEqual(stubbornSignals, ['SIGTERM', 'SIGKILL'], 'remove.js must escalate to SIGKILL after graceful timeout');
    assert.equal(termRes.signaled, true);
    assert.equal(termRes.escalated, true);
    assert.equal(termRes.exited, true);
  } finally {
    for (const c of spawnedChildren) {
      try {
        process.kill(c.pid, 'SIGKILL');
      } catch {}
    }
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});

test(
  'Windows installer.exe --uninstall --purge-data removes obsidian-prism-usage-rollup-cache.json & safe PRISM_USAGE_CACHE_PATH while sparing redline/hijacked files',
  { skip: process.platform !== 'win32' ? 'Windows-only installer.exe --purge-data E2E test' : false },
  async () => {
    const csSrc = fs.readFileSync(path.join(ROOT_DIR, 'installer', 'setup', 'Program.cs'), 'utf8');
    assert.ok(
      csSrc.includes('"obsidian-prism-usage-rollup-cache.json"'),
      'Program.cs PurgeUserPluginData must include obsidian-prism-usage-rollup-cache.json'
    );

    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-prism-win-purge-usage-'));
    const installerExe = path.join(workDir, 'installer.exe');
    const installDir = path.join(workDir, 'installed');
    const geminiDir = path.join(workDir, '.gemini');
    const cfgDir = path.join(geminiDir, 'config');
    const nativePluginDir = path.join(cfgDir, 'plugins', 'obsidian-prism');
    const overrideDir = path.join(workDir, 'override');
    const redlineDir = path.join(geminiDir, 'antigravity', 'conversations_archive');
    const outPurge = path.join(workDir, 'purge.json');
    const outGuard = path.join(workDir, 'guard.json');

    fs.mkdirSync(nativePluginDir, { recursive: true });
    fs.mkdirSync(installDir, { recursive: true });
    fs.mkdirSync(overrideDir, { recursive: true });
    fs.mkdirSync(redlineDir, { recursive: true });

    const usageCachePath = path.join(cfgDir, 'obsidian-prism-usage-rollup-cache.json');
    const safeOverridePath = path.join(overrideDir, 'obsidian-prism-usage-rollup-cache.json');
    const thoughtCfgPath = path.join(cfgDir, 'obsidian-prism-thought.json');
    const wallpaperCfgPath = path.join(cfgDir, 'obsidian-prism-wallpaper.json');
    const hijackedPath = path.join(overrideDir, 'important-user-data.json');
    const redlinePath = path.join(redlineDir, 'obsidian-prism-usage-rollup-cache.json');

    fs.writeFileSync(usageCachePath, '{"version":2,"scopes":{"local":{}}}', 'utf8');
    fs.writeFileSync(safeOverridePath, '{"version":2,"scopes":{"ssh:prod":{}}}', 'utf8');
    fs.writeFileSync(thoughtCfgPath, '{"engine":"gemini"}', 'utf8');
    fs.writeFileSync(wallpaperCfgPath, '{"enabled":true}', 'utf8');
    fs.writeFileSync(hijackedPath, '{"keep":true}', 'utf8');
    fs.writeFileSync(redlinePath, '{"archive":true}', 'utf8');

    try {
      buildInstaller({ outputPath: installerExe });
      await runExe(
        installerExe,
        [
          '--uninstall',
          '--silent',
          '--no-autostart',
          '--purge-data',
          '--install-dir',
          installDir,
          '--plugin-dir',
          nativePluginDir,
          '--out',
          outPurge,
        ],
        20000,
        {
          ...process.env,
          AG_PRISM_GEMINI_CONFIG_DIR: cfgDir,
          PRISM_USAGE_CACHE_PATH: safeOverridePath,
        }
      );

      const purgeRes = JSON.parse(fs.readFileSync(outPurge, 'utf8'));
      assert.equal(purgeRes.ok, true);
      assert.equal(fs.existsSync(usageCachePath), false, 'installer.exe --purge-data must delete obsidian-prism-usage-rollup-cache.json');
      assert.equal(fs.existsSync(safeOverridePath), false, 'installer.exe --purge-data must delete safe PRISM_USAGE_CACHE_PATH');
      assert.equal(fs.existsSync(thoughtCfgPath), false);
      assert.equal(fs.existsSync(wallpaperCfgPath), false, 'installer.exe --purge-data must delete obsidian-prism-wallpaper.json');

      // Re-run with hijacked filename & redline path -> must be strictly refused
      for (const dangerousTarget of [hijackedPath, redlinePath]) {
        await runExe(
          installerExe,
          [
            '--uninstall',
            '--silent',
            '--no-autostart',
            '--purge-data',
            '--install-dir',
            installDir,
            '--plugin-dir',
            nativePluginDir,
            '--out',
            outGuard,
          ],
          20000,
          {
            ...process.env,
            AG_PRISM_GEMINI_CONFIG_DIR: cfgDir,
            PRISM_USAGE_CACHE_PATH: dangerousTarget,
          }
        );
      }
      assert.equal(fs.existsSync(hijackedPath), true, 'installer.exe --purge-data must never delete non-allowlisted filename');
      assert.equal(fs.existsSync(redlinePath), true, 'installer.exe --purge-data must never delete files under conversations_archive');
    } finally {
      try {
        fs.rmSync(workDir, { recursive: true, force: true });
      } catch {}
    }
  }
);

test('Windows C# installer & watcher bilingual i18n coverage: InstallerI18n contract, key UI/dialog English pairs, and zero untranslated CJK literals (#37)', () => {
  const cdpCs = fs.readFileSync(path.join(ROOT_DIR, 'installer', 'common', 'CdpClient.cs'), 'utf8');
  const setupCs = fs.readFileSync(path.join(ROOT_DIR, 'installer', 'setup', 'Program.cs'), 'utf8');
  const watcherCs = fs.readFileSync(path.join(ROOT_DIR, 'installer', 'watcher', 'Program.cs'), 'utf8');

  // 1. Unified InstallerI18n engine contract
  assert.ok(cdpCs.includes('public static class InstallerI18n'));
  assert.ok(cdpCs.includes('public static bool IsZhUi'));
  assert.ok(cdpCs.includes('public static void SetPreferredLang(string lang)'));
  assert.ok(cdpCs.includes('public static string Tr(string zh, string en)'));
  assert.ok(cdpCs.includes('public static string TrFormat(string zhFormat, string enFormat, params object[] args)'));
  assert.ok(cdpCs.includes('public static bool TryParseLangArg('));
  assert.ok(cdpCs.includes('AG_PRISM_LANG'));
  assert.ok(cdpCs.includes('CultureInfo.CurrentUICulture'));
  assert.ok(cdpCs.includes('GetCdpRelaunchPromptCaption()'));
  assert.ok(cdpCs.includes('GetCdpRelaunchPromptText()'));

  // 2. CLI --lang / --help & WinForms UseMnemonic safety
  assert.ok(setupCs.includes('InstallerI18n.TryParseLangArg('), 'Setup ParseArgs must support --lang en|zh and --lang=en|zh');
  assert.ok(setupCs.includes('BuildHelpText()'), 'Setup must provide bilingual --help output');
  assert.ok(watcherCs.includes('InstallerI18n.TryParseLangArg('), 'Watcher Main must support --lang en|zh and --lang=en|zh');
  assert.ok(watcherCs.includes('BuildHelpText()'), 'Watcher must provide bilingual --help output');
  assert.ok(setupCs.includes('_uninstallBtn.UseMnemonic = false;'), 'WinForms buttons with & must disable mnemonic prefix');
  assert.ok(setupCs.includes('_closeBtn.UseMnemonic = false;'), 'WinForms buttons with & must disable mnemonic prefix');
  assert.ok(setupCs.includes('_subtitleLabel.UseMnemonic = false;'), 'WinForms labels with & must disable mnemonic prefix');

  // 3. Key window/button/relaunch prompt English strings exist
  for (const phrase of [
    'Obsidian Prism Installer',
    'Uninstall & Reset',
    'Open Config Dir',
    'Install Now',
    'Reinstall / Update',
    'Launch Antigravity',
    'Done & Close',
    'Activate Obsidian Prism Now',
    'Confirm Uninstall',
  ]) {
    assert.ok(setupCs.includes(`"${phrase}"`), `setup/Program.cs must include English UI phrase: ${phrase}`);
  }
  assert.ok(cdpCs.includes('"Obsidian Prism · Restore UI Connection"'));
  assert.ok(cdpCs.includes('Reopen Antigravity now to restore the Obsidian Prism interface?'));

  // 4. Static audit: every non-comment CJK string literal in the 3 C# files must be inside InstallerI18n.Tr/TrFormat
  // (except explicit CJK keyword matching in IndexOf), and every Tr/TrFormat call must have a clean non-CJK English second arg.
  const allowedMatchKeywords = new Set([
    '符号链接',
    '重解析点',
    '正由另一进程使用',
    '拒绝访问',
    '[✓] 已注入 obsidian-prism:',
  ]);

  function stripCommentsPreserveLines(src) {
    let out = '';
    let i = 0;
    let inStr = false;
    let verbatim = false;
    let inChar = false;
    while (i < src.length) {
      const ch = src[i];
      const next = src[i + 1];
      if (inStr) {
        out += ch;
        if (verbatim) {
          if (ch === '"' && next === '"') {
            out += next;
            i += 2;
            continue;
          }
          if (ch === '"') inStr = false;
        } else {
          if (ch === '\\' && i + 1 < src.length) {
            out += next;
            i += 2;
            continue;
          }
          if (ch === '"') inStr = false;
        }
        i++;
        continue;
      }
      if (inChar) {
        out += ch;
        if (ch === '\\' && i + 1 < src.length) {
          out += next;
          i += 2;
          continue;
        }
        if (ch === "'") inChar = false;
        i++;
        continue;
      }
      if (ch === '/' && next === '/') {
        while (i < src.length && src[i] !== '\n') i++;
        continue;
      }
      if (ch === '/' && next === '*') {
        i += 2;
        while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
          if (src[i] === '\n') out += '\n';
          i++;
        }
        i += 2;
        continue;
      }
      if (ch === '@' && next === '"') {
        inStr = true;
        verbatim = true;
        out += '@"';
        i += 2;
        continue;
      }
      if (ch === '"') {
        inStr = true;
        verbatim = false;
        out += ch;
        i++;
        continue;
      }
      if (ch === "'") {
        inChar = true;
        out += ch;
        i++;
        continue;
      }
      out += ch;
      i++;
    }
    return out;
  }

  function extractTrCalls(code) {
    const calls = [];
    const re = /InstallerI18n\.Tr(?:Format)?\s*\(/g;
    let m;
    while ((m = re.exec(code)) !== null) {
      let depth = 1;
      let i = m.index + m[0].length;
      let inStr = false;
      let verbatim = false;
      let argStart = i;
      const args = [];
      while (i < code.length && depth > 0) {
        const ch = code[i];
        const next = code[i + 1];
        if (inStr) {
          if (verbatim) {
            if (ch === '"' && next === '"') { i += 2; continue; }
            if (ch === '"') inStr = false;
          } else {
            if (ch === '\\') { i += 2; continue; }
            if (ch === '"') inStr = false;
          }
          i++;
          continue;
        }
        if (ch === '@' && next === '"') { inStr = true; verbatim = true; i += 2; continue; }
        if (ch === '"') { inStr = true; verbatim = false; i++; continue; }
        if (ch === '(') depth++;
        else if (ch === ')') {
          depth--;
          if (depth === 0) {
            args.push(code.slice(argStart, i).trim());
            break;
          }
        } else if (ch === ',' && depth === 1) {
          args.push(code.slice(argStart, i).trim());
          argStart = i + 1;
        }
        i++;
      }
      calls.push({ start: m.index, end: i + 1, args });
    }
    return calls;
  }

  for (const [label, rawSrc] of [
    ['installer/common/CdpClient.cs', cdpCs],
    ['installer/setup/Program.cs', setupCs],
    ['installer/watcher/Program.cs', watcherCs],
  ]) {
    const code = stripCommentsPreserveLines(rawSrc);
    const trCalls = extractTrCalls(code);
    assert.ok(trCalls.length > 0, `${label} must contain InstallerI18n.Tr/TrFormat calls`);
    for (const c of trCalls) {
      assert.ok(c.args.length >= 2, `${label} Tr call missing English arg: ${c.args[0]}`);
      assert.ok(c.args[1].length > 2, `${label} Tr call has empty English arg for: ${c.args[0]}`);
      assert.equal(/[\u4e00-\u9fa5]/.test(c.args[1]), false, `${label} English branch must not contain CJK: ${c.args[1]}`);
    }

    // Mask out all Tr/TrFormat call spans, then ensure zero bare CJK string literals remain outside allowlisted IndexOf keywords
    let masked = '';
    let cursor = 0;
    for (const c of trCalls) {
      if (c.start >= cursor) {
        masked += code.slice(cursor, c.start);
        masked += ' '.repeat(c.end - c.start);
        cursor = c.end;
      }
    }
    masked += code.slice(cursor);

    const strRe = /@"(?:""|[^"])*"|"(?:\\.|[^"\\])*"/g;
    let sm;
    const bareCjk = [];
    while ((sm = strRe.exec(masked)) !== null) {
      const lit = sm[0];
      if (!/[\u4e00-\u9fa5]/.test(lit)) continue;
      const inner = lit.startsWith('@"') ? lit.slice(2, -1).replace(/""/g, '"') : lit.slice(1, -1);
      if (allowedMatchKeywords.has(inner)) continue;
      bareCjk.push(inner);
    }
    assert.deepEqual(bareCjk, [], `${label} still has untranslated bare CJK string literal(s)`);
  }
});

test(
  'Windows C# InstallerI18n priority (CLI --lang > AG_PRISM_LANG > CurrentUICulture), relaunch prompt & WinForms English button fit (#37)',
  { skip: process.platform !== 'win32' ? 'Windows-only C# InstallerI18n runtime test' : false },
  () => {
    const winDir = process.env.WINDIR || 'C:\\Windows';
    const csc = [
      path.join(winDir, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
      path.join(winDir, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'),
    ].find((p) => fs.existsSync(p));
    assert.ok(csc, 'Expected .NET Framework csc.exe on Windows');

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-prism-cs-i18n-'));
    try {
      const probeCs = path.join(tmpDir, 'I18nProbe.cs');
      const probeExe = path.join(tmpDir, 'i18n-probe.exe');
      fs.writeFileSync(
        probeCs,
        [
          'using System;',
          'using System.Collections.Generic;',
          'using System.Drawing;',
          'using System.Globalization;',
          'using System.Threading;',
          'using System.Windows.Forms;',
          'using AgyClaudeStyle;',
          'class I18nProbe {',
          '  static int MeasureNoPrefix(string text, string family, float size, bool bold) {',
          '    using (Font f = new Font(family, size, bold ? FontStyle.Bold : FontStyle.Regular)) {',
          '      return TextRenderer.MeasureText(text, f, Size.Empty, TextFormatFlags.NoPrefix).Width;',
          '    }',
          '  }',
          '  static void Main() {',
          '    var res = new Dictionary<string, object>(StringComparer.Ordinal);',
          '    Environment.SetEnvironmentVariable("AG_PRISM_LANG", null);',
          '    InstallerI18n.SetPreferredLang(null);',
          '    Thread.CurrentThread.CurrentUICulture = new CultureInfo("en-US");',
          '    res["cultureEn"] = InstallerI18n.EffectiveLang;',
          '    res["captionEn"] = CdpHelper.GetCdpRelaunchPromptCaption();',
          '    res["textEn"] = CdpHelper.GetCdpRelaunchPromptText();',
          '    Thread.CurrentThread.CurrentUICulture = new CultureInfo("ja-JP");',
          '    res["cultureJa"] = InstallerI18n.EffectiveLang;',
          '    Thread.CurrentThread.CurrentUICulture = new CultureInfo("zh-CN");',
          '    res["cultureZhCn"] = InstallerI18n.EffectiveLang;',
          '    res["captionZh"] = CdpHelper.GetCdpRelaunchPromptCaption();',
          '    res["textZh"] = CdpHelper.GetCdpRelaunchPromptText();',
          '    Thread.CurrentThread.CurrentUICulture = new CultureInfo("zh-TW");',
          '    res["cultureZhTw"] = InstallerI18n.EffectiveLang;',
          '    Environment.SetEnvironmentVariable("AG_PRISM_LANG", "en");',
          '    res["envEnOverZh"] = InstallerI18n.EffectiveLang;',
          '    Thread.CurrentThread.CurrentUICulture = new CultureInfo("en-US");',
          '    Environment.SetEnvironmentVariable("AG_PRISM_LANG", "zh-CN");',
          '    res["envZhOverEn"] = InstallerI18n.EffectiveLang;',
          '    InstallerI18n.SetPreferredLang("en");',
          '    res["explicitEnOverEnvZh"] = InstallerI18n.EffectiveLang;',
          '    Environment.SetEnvironmentVariable("AG_PRISM_LANG", "en");',
          '    InstallerI18n.SetPreferredLang("zh");',
          '    res["explicitZhOverEnvEn"] = InstallerI18n.EffectiveLang;',
          '    string parsed1 = null, parsed2 = null;',
          '    string[] a1 = new string[] { "--lang", "en" }; int i1 = 0;',
          '    bool ok1 = InstallerI18n.TryParseLangArg(a1, ref i1, out parsed1);',
          '    string[] a2 = new string[] { "--lang=zh-CN" }; int i2 = 0;',
          '    bool ok2 = InstallerI18n.TryParseLangArg(a2, ref i2, out parsed2);',
          '    res["parsePairOk"] = ok1 && i1 == 1 && parsed1 == "en";',
          '    res["parseEqOk"] = ok2 && i2 == 0 && parsed2 == "zh-CN";',
          '    var widths = new Dictionary<string, object>(StringComparer.Ordinal);',
          '    widths["uninstallEn"] = MeasureNoPrefix("Uninstall & Reset", "Segoe UI", 9.5f, false);',
          '    widths["openDirEn"] = MeasureNoPrefix("Open Config Dir", "Segoe UI", 9.5f, false);',
          '    widths["reinstallEn"] = MeasureNoPrefix("Reinstall / Update", "Segoe UI", 9.5f, true);',
          '    widths["launchEn"] = MeasureNoPrefix("Launch Antigravity", "Segoe UI", 9.5f, false);',
          '    widths["doneCloseEn"] = MeasureNoPrefix("Done & Close", "Segoe UI", 9.5f, false);',
          '    res["widths"] = widths;',
          '    Console.Write(MiniJson.Stringify(res, false));',
          '  }',
          '}',
        ].join('\n'),
        'utf8'
      );

      execFileSync(
        csc,
        [
          '/nologo',
          '/utf8output',
          '/codepage:65001',
          '/warnaserror',
          '/target:exe',
          `/out:${probeExe}`,
          '/r:System.dll',
          '/r:System.Core.dll',
          '/r:System.Drawing.dll',
          '/r:System.Net.Http.dll',
          '/r:System.Windows.Forms.dll',
          path.join(ROOT_DIR, 'installer', 'common', 'MiniJson.cs'),
          path.join(ROOT_DIR, 'installer', 'common', 'CdpClient.cs'),
          probeCs,
        ],
        { stdio: 'pipe' }
      );

      const out = JSON.parse(execFileSync(probeExe, [], { encoding: 'utf8' }));
      assert.equal(out.cultureEn, 'en');
      assert.equal(out.cultureJa, 'en');
      assert.equal(out.cultureZhCn, 'zh');
      assert.equal(out.cultureZhTw, 'zh');
      assert.equal(out.envEnOverZh, 'en');
      assert.equal(out.envZhOverEn, 'zh');
      assert.equal(out.explicitEnOverEnvZh, 'en');
      assert.equal(out.explicitZhOverEnvEn, 'zh');
      assert.equal(out.parsePairOk, true);
      assert.equal(out.parseEqOk, true);

      assert.equal(out.captionEn, 'Obsidian Prism · Restore UI Connection');
      assert.equal(/[\u4e00-\u9fa5]/.test(out.captionEn), false);
      assert.equal(/[\u4e00-\u9fa5]/.test(out.textEn), false);
      assert.ok(out.textEn.includes('--remote-debugging-port=0'));
      assert.ok(out.textEn.includes('Obsidian Prism'));
      assert.ok(out.captionZh.includes('恢复界面连接'));
      assert.ok(out.textZh.includes('--remote-debugging-port=0'));

      // Verify English WinForms button labels fit comfortably inside 96-DPI button widths with >= 12px horizontal padding
      assert.ok(out.widths.uninstallEn <= 136 - 12, `Uninstall & Reset width ${out.widths.uninstallEn}px exceeds safe fit in 136px`);
      assert.ok(out.widths.openDirEn <= 122 - 12, `Open Config Dir width ${out.widths.openDirEn}px exceeds safe fit in 122px`);
      assert.ok(out.widths.reinstallEn <= 144 - 12, `Reinstall / Update width ${out.widths.reinstallEn}px exceeds safe fit in 144px`);
      assert.ok(out.widths.launchEn <= 144 - 12, `Launch Antigravity width ${out.widths.launchEn}px exceeds safe fit in 144px`);
      assert.ok(out.widths.doneCloseEn <= 110 - 12, `Done & Close width ${out.widths.doneCloseEn}px exceeds safe fit in 110px`);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
);

test(
  'Windows installer.exe & watcher.exe E2E bilingual CLI (--lang en|zh, AG_PRISM_LANG, --help, English install/uninstall/watch.log) (#37)',
  { skip: process.platform !== 'win32' ? 'Windows-only installer.exe bilingual E2E test' : false },
  async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-prism-i18n-e2e-'));
    const installerExe = path.join(workDir, 'installer.exe');
    const installDir = path.join(workDir, 'installed');
    const nativePluginDir = path.join(workDir, 'plugins', 'obsidian-prism');
    const outHelpEn = path.join(workDir, 'help-en.txt');
    const outHelpZh = path.join(workDir, 'help-zh.txt');
    const outStatusEnvEn = path.join(workDir, 'status-env-en.json');
    const outStatusCliZh = path.join(workDir, 'status-cli-zh.json');
    const outStatusCliEn = path.join(workDir, 'status-cli-en.json');
    const outInstallEn = path.join(workDir, 'install-en.json');
    const outUninstallEn = path.join(workDir, 'uninstall-en.json');
    const outWatcherHelpEn = path.join(workDir, 'watcher-help-en.txt');
    const mockCdp = createMockCdpServer();

    try {
      buildInstaller({ outputPath: installerExe });
      const port = await mockCdp.start();

      // 1. --help in English and Chinese
      await runExe(installerExe, ['--help', '--lang', 'en', '--out', outHelpEn], 10000);
      await runExe(installerExe, ['--help', '--lang=zh', '--out', outHelpZh], 10000);
      const helpEn = fs.readFileSync(outHelpEn, 'utf8');
      const helpZh = fs.readFileSync(outHelpZh, 'utf8');
      assert.equal(/[\u4e00-\u9fa5]/.test(helpEn), false, `English --help must not contain CJK: ${helpEn}`);
      assert.ok(helpEn.includes('Obsidian Prism Installer for Windows'));
      assert.ok(helpEn.includes('--lang <zh|en>'));
      assert.ok(helpZh.includes('黑曜棱镜') && helpZh.includes('--lang <zh|en>'));

      // 2. Priority check via --status: CLI --lang overrides AG_PRISM_LANG
      await runExe(
        installerExe,
        ['--status', '--install-dir', installDir, '--plugin-dir', nativePluginDir, '--out', outStatusEnvEn],
        10000,
        { ...process.env, AG_PRISM_LANG: 'en' }
      );
      assert.equal(JSON.parse(fs.readFileSync(outStatusEnvEn, 'utf8')).uiLang, 'en');

      await runExe(
        installerExe,
        ['--status', '--lang=zh', '--install-dir', installDir, '--plugin-dir', nativePluginDir, '--out', outStatusCliZh],
        10000,
        { ...process.env, AG_PRISM_LANG: 'en' }
      );
      assert.equal(JSON.parse(fs.readFileSync(outStatusCliZh, 'utf8')).uiLang, 'zh');

      await runExe(
        installerExe,
        ['--status', '--lang', 'en', '--install-dir', installDir, '--plugin-dir', nativePluginDir, '--out', outStatusCliEn],
        10000,
        { ...process.env, AG_PRISM_LANG: 'zh' }
      );
      assert.equal(JSON.parse(fs.readFileSync(outStatusCliEn, 'utf8')).uiLang, 'en');

      // 3. Silent install in English mode (--lang=en overriding AG_PRISM_LANG=zh) -> English result & English watch.log
      await runExe(
        installerExe,
        [
          '--silent',
          '--lang=en',
          '--no-autostart',
          '--no-kill-legacy',
          '--no-native-daemon',
          '--install-dir',
          installDir,
          '--plugin-dir',
          nativePluginDir,
          '--cdp-port',
          String(port),
          '--out',
          outInstallEn,
        ],
        20000,
        { ...process.env, AG_PRISM_LANG: 'zh' }
      );

      const installEnRes = JSON.parse(fs.readFileSync(outInstallEn, 'utf8'));
      assert.equal(installEnRes.ok, true);
      assert.deepEqual(installEnRes.injectedPages, ['Antigravity']);
      assert.equal(/[\u4e00-\u9fa5]/.test(installEnRes.headline), false, `English headline had CJK: ${installEnRes.headline}`);
      assert.equal(/[\u4e00-\u9fa5]/.test(installEnRes.detail), false, `English detail had CJK: ${installEnRes.detail}`);
      assert.ok(installEnRes.headline.includes('Installed!'));

      const watchLogPath = path.join(installDir, 'watch.log');
      const watchLogEn = await waitFor(() => {
        if (!fs.existsSync(watchLogPath)) return null;
        const t = fs.readFileSync(watchLogPath, 'utf8');
        return t.includes('[✓] Injected obsidian-prism:') ? t : null;
      }, 6000, 120);
      assert.ok(watchLogEn.includes('watcher started'));
      assert.ok(watchLogEn.includes('[+] Connected to debug port'));
      assert.equal(/[\u4e00-\u9fa5]/.test(watchLogEn), false, `English watch.log must not contain CJK: ${watchLogEn}`);

      // 4. Watcher --help --lang en
      const watcherExe = path.join(installDir, 'obsidian-prism-watcher.exe');
      await runExe(watcherExe, ['--help', '--lang', 'en', '--out', outWatcherHelpEn], 10000, { ...process.env, AG_PRISM_LANG: 'zh' });
      const watcherHelpEn = fs.readFileSync(outWatcherHelpEn, 'utf8');
      assert.equal(/[\u4e00-\u9fa5]/.test(watcherHelpEn), false);
      assert.ok(watcherHelpEn.includes('Obsidian Prism Background Watcher'));

      // 5. Silent uninstall in English mode via AG_PRISM_LANG=en
      await runExe(
        installerExe,
        [
          '--uninstall',
          '--silent',
          '--no-autostart',
          '--install-dir',
          installDir,
          '--plugin-dir',
          nativePluginDir,
          '--cdp-port',
          String(port),
          '--out',
          outUninstallEn,
        ],
        20000,
        { ...process.env, AG_PRISM_LANG: 'en' }
      );
      const uninstallEnRes = JSON.parse(fs.readFileSync(outUninstallEn, 'utf8'));
      assert.equal(uninstallEnRes.ok, true);
      assert.equal(/[\u4e00-\u9fa5]/.test(uninstallEnRes.headline), false, `English uninstall headline had CJK: ${uninstallEnRes.headline}`);
      assert.equal(/[\u4e00-\u9fa5]/.test(uninstallEnRes.detail), false, `English uninstall detail had CJK: ${uninstallEnRes.detail}`);
      assert.ok(uninstallEnRes.headline.includes('Uninstalled'));
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

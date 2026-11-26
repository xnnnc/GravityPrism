#!/usr/bin/env node
// Build standalone Universal macOS Obsidian Prism.app & .dmg for Obsidian Prism (obsidian-prism).
// Zero external npm dependencies: uses built-in Node zlib + macOS swiftc / lipo / codesign / hdiutil.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  ROOT_DIR,
  cdp,
  createManifest,
  resolveActiveConfigFile,
  collectOptionalOmniTopEntries,
  collectNativePluginEntries,
  renderPrismIconPng,
  buildIcns,
} from './build-common.mjs';

const __filename = fileURLToPath(import.meta.url);

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function generateInfoPlist(version = cdp.PLUGIN_VERSION) {
  const safeShortVersion = escapeXml(version);
  const numericMatch = String(version).match(/^\d+(?:\.\d+){0,2}/);
  const safeBundleVersion = escapeXml(numericMatch ? numericMatch[0] : '1.0.8.3');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>zh_CN</string>
  <key>CFBundleDisplayName</key>
  <string>Obsidian Prism</string>
  <key>CFBundleExecutable</key>
  <string>Obsidian Prism</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>CFBundleIdentifier</key>
  <string>io.github.rmvdesi.obsidian-prism</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>Obsidian Prism</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>${safeShortVersion}</string>
  <key>CFBundleSignature</key>
  <string>????</string>
  <key>CFBundleVersion</key>
  <string>${safeBundleVersion}</string>
  <key>LSMinimumSystemVersion</key>
  <string>11.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>NSPrincipalClass</key>
  <string>NSApplication</string>
  <key>NSAppTransportSecurity</key>
  <dict>
    <key>NSAllowsLocalNetworking</key>
    <true/>
  </dict>
</dict>
</plist>
`;
}

function ensureMacosTools() {
  if (process.platform !== 'darwin') {
    throw new Error('macOS app build requires macOS (swiftc, lipo, codesign, hdiutil)');
  }
  const sdkPath = execFileSync('xcrun', ['--show-sdk-path', '--sdk', 'macosx'], {
    encoding: 'utf8',
  }).trim();
  const swiftc = execFileSync('xcrun', ['--find', 'swiftc'], { encoding: 'utf8' }).trim();
  const lipo = execFileSync('xcrun', ['--find', 'lipo'], { encoding: 'utf8' }).trim();
  return { sdkPath, swiftc, lipo };
}

function compileUniversalSwift({ swiftc, lipo, sdkPath, sources, frameworks = [], outputPath, stageDir, name }) {
  const arches = ['arm64', 'x86_64'];
  const slices = [];
  for (const arch of arches) {
    const sliceOut = path.join(stageDir, `${name}-${arch}`);
    const args = [
      '-swift-version', '5',
      '-O',
      '-sdk', sdkPath,
      '-target', `${arch}-apple-macos11.0`,
    ];
    for (const fw of frameworks) {
      args.push('-framework', fw);
    }
    args.push(...sources, '-o', sliceOut);
    execFileSync(swiftc, args, { stdio: 'inherit' });
    slices.push(sliceOut);
  }
  execFileSync(lipo, ['-create', ...slices, '-output', outputPath], { stdio: 'inherit' });
  fs.chmodSync(outputPath, 0o755);
}

function generateIcnsFile(outPath, stageDir) {
  try {
    const iconsetDir = path.join(stageDir, 'AppIcon.iconset');
    fs.mkdirSync(iconsetDir, { recursive: true });
    const iconsetSpecs = [
      ['icon_16x16.png', 16],
      ['icon_16x16@2x.png', 32],
      ['icon_32x32.png', 32],
      ['icon_32x32@2x.png', 64],
      ['icon_128x128.png', 128],
      ['icon_128x128@2x.png', 256],
      ['icon_256x256.png', 256],
      ['icon_256x256@2x.png', 512],
      ['icon_512x512.png', 512],
      ['icon_512x512@2x.png', 1024],
    ];
    for (const [filename, size] of iconsetSpecs) {
      fs.writeFileSync(path.join(iconsetDir, filename), renderPrismIconPng(size));
    }
    execFileSync('iconutil', ['-c', 'icns', iconsetDir, '-o', outPath], { stdio: 'inherit' });
  } catch {
    fs.writeFileSync(outPath, buildIcns());
  }
}

function createDmgWithRetry(srcFolder, dmgPath) {
  const maxAttempts = 3;
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (fs.existsSync(dmgPath)) fs.rmSync(dmgPath, { force: true });
      execFileSync(
        'hdiutil',
        ['create', '-volname', 'Obsidian Prism', '-srcfolder', srcFolder, '-ov', '-format', 'UDZO', dmgPath],
        { stdio: 'inherit' }
      );
      return;
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
      }
    }
  }
  throw lastErr;
}

function dirSizeBytes(dirPath) {
  let total = 0;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const full = path.join(dirPath, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) total += dirSizeBytes(full);
    else total += fs.statSync(full).size;
  }
  return total;
}

function buildMacosApp({
  appOut = path.join(ROOT_DIR, 'Obsidian Prism.app'),
  dmgOut = path.join(ROOT_DIR, 'Obsidian-Prism-macOS-universal.dmg'),
  createDmg = true,
  configPath,
  version = cdp.PLUGIN_VERSION,
} = {}) {
  const { sdkPath, swiftc, lipo } = ensureMacosTools();
  const stageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-prism-macos-build-'));

  try {
    const commonMiniJson = path.join(ROOT_DIR, 'installer', 'macos', 'Common', 'MiniJson.swift');
    const commonCdpClient = path.join(ROOT_DIR, 'installer', 'macos', 'Common', 'CdpClient.swift');
    const watcherMain = path.join(ROOT_DIR, 'installer', 'macos', 'Watcher', 'main.swift');
    const setupMain = path.join(ROOT_DIR, 'installer', 'macos', 'Setup', 'main.swift');

    const watcherOut = path.join(stageDir, 'obsidian-prism-watcher');
    compileUniversalSwift({
      swiftc,
      lipo,
      sdkPath,
      sources: [commonMiniJson, commonCdpClient, watcherMain],
      outputPath: watcherOut,
      stageDir,
      name: 'watcher',
    });

    const setupOut = path.join(stageDir, 'Obsidian Prism');
    compileUniversalSwift({
      swiftc,
      lipo,
      sdkPath,
      sources: [commonMiniJson, commonCdpClient, setupMain],
      frameworks: ['Cocoa'],
      outputPath: setupOut,
      stageDir,
      name: 'setup',
    });

    const stagedApp = path.join(stageDir, 'Obsidian Prism.app');
    const contentsDir = path.join(stagedApp, 'Contents');
    const macosDir = path.join(contentsDir, 'MacOS');
    const resourcesDir = path.join(contentsDir, 'Resources');
    const payloadDir = path.join(resourcesDir, 'payload');

    fs.mkdirSync(macosDir, { recursive: true });
    fs.mkdirSync(payloadDir, { recursive: true });

    fs.writeFileSync(path.join(contentsDir, 'Info.plist'), generateInfoPlist(version), 'utf8');
    fs.writeFileSync(path.join(contentsDir, 'PkgInfo'), 'APPL????', 'ascii');

    fs.copyFileSync(setupOut, path.join(macosDir, 'Obsidian Prism'));
    fs.chmodSync(path.join(macosDir, 'Obsidian Prism'), 0o755);
    fs.copyFileSync(watcherOut, path.join(macosDir, 'obsidian-prism-watcher'));
    fs.chmodSync(path.join(macosDir, 'obsidian-prism-watcher'), 0o755);

    generateIcnsFile(path.join(resourcesDir, 'AppIcon.icns'), stageDir);

    const manifest = createManifest();
    const manifestJson = JSON.stringify(manifest, null, 2) + '\n';
    const activeConfigFile = resolveActiveConfigFile(configPath);

    const payloadEntries = [
      { name: 'manifest.json', data: Buffer.from(manifestJson, 'utf8') },
      { name: 'style.css', data: Buffer.from(cdp.readCss(), 'utf8') },
      { name: 'config.json', data: fs.readFileSync(activeConfigFile) },
      { name: 'config.example.json', data: fs.readFileSync(path.join(ROOT_DIR, 'config.example.json')) },
      ...manifest.parts.map((part) => ({
        name: part,
        data: Buffer.from(cdp.prepareRuntimePart(part, fs.readFileSync(path.join(ROOT_DIR, part), 'utf8')), 'utf8'),
      })),
      ...collectOptionalOmniTopEntries(),
      ...collectNativePluginEntries(activeConfigFile),
    ];

    for (const entry of payloadEntries) {
      const dest = path.join(payloadDir, entry.name);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, entry.data);
    }

    execFileSync('codesign', ['--force', '--deep', '--sign', '-', stagedApp], { stdio: 'inherit' });

    if (fs.existsSync(appOut)) {
      fs.rmSync(appOut, { recursive: true, force: true });
    }
    fs.mkdirSync(path.dirname(appOut), { recursive: true });
    execFileSync('ditto', [stagedApp, appOut], { stdio: 'inherit' });

    let dmgSizeBytes = 0;
    if (createDmg) {
      const dmgStage = path.join(stageDir, 'dmg-stage');
      fs.mkdirSync(dmgStage, { recursive: true });
      execFileSync('ditto', [stagedApp, path.join(dmgStage, 'Obsidian Prism.app')], { stdio: 'inherit' });
      fs.symlinkSync('/Applications', path.join(dmgStage, 'Applications'));

      const tempDmg = path.join(stageDir, 'out.dmg');
      createDmgWithRetry(dmgStage, tempDmg);
      fs.mkdirSync(path.dirname(dmgOut), { recursive: true });
      fs.copyFileSync(tempDmg, dmgOut);
      dmgSizeBytes = fs.statSync(dmgOut).size;
    }

    return {
      appOut,
      dmgOut: createDmg ? dmgOut : null,
      appSizeBytes: dirSizeBytes(appOut),
      dmgSizeBytes,
      watcherSizeBytes: fs.statSync(watcherOut).size,
      fileCount: payloadEntries.length,
    };
  } finally {
    fs.rmSync(stageDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const args = process.argv.slice(2);
  let dmgOut = path.join(ROOT_DIR, 'Obsidian-Prism-macOS-universal.dmg');
  let appOut = path.join(ROOT_DIR, 'Obsidian Prism.app');
  let createDmg = true;
  let version = cdp.PLUGIN_VERSION;
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--out' || args[i] === '-o' || args[i] === '--dmg') && i + 1 < args.length) {
      dmgOut = path.resolve(args[++i]);
    } else if (args[i] === '--app-out' && i + 1 < args.length) {
      appOut = path.resolve(args[++i]);
    } else if (args[i] === '--version' && i + 1 < args.length) {
      version = args[++i];
    } else if (args[i] === '--no-dmg') {
      createDmg = false;
    }
  }
  const res = buildMacosApp({ appOut, dmgOut, createDmg, version });
  const dmgMsg = res.dmgOut
    ? `, DMG ${(res.dmgSizeBytes / 1024).toFixed(1)} KB (${res.dmgOut})`
    : '';
  console.log(
    `[✓] Built ${res.appOut} (${(res.appSizeBytes / 1024).toFixed(1)} KB; ` +
    `${res.fileCount} payload files${dmgMsg})`
  );
}

export {
  generateInfoPlist,
  buildMacosApp,
};

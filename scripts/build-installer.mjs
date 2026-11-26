#!/usr/bin/env node
// Build standalone Windows installer.exe for Obsidian Prism (obsidian-prism).
// Zero external npm dependencies: uses built-in Node zlib + Windows .NET Framework csc.exe.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  ROOT_DIR,
  cdp,
  VALIDATORS,
  createManifest,
  resolveActiveConfigFile,
  collectOptionalOmniTopEntries,
  collectNativePluginEntries,
  buildMultiResIco,
  buildZip,
} from './build-common.mjs';

const __filename = fileURLToPath(import.meta.url);

function findCsc() {
  const winDir = process.env.WINDIR || 'C:\\Windows';
  const candidates = [
    path.join(winDir, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
    path.join(winDir, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('csc.exe (.NET Framework 4.x) not found');
}

function buildInstaller({ outputPath = path.join(ROOT_DIR, 'installer.exe'), configPath } = {}) {
  const csc = findCsc();
  const stageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-prism-build-'));

  try {
    const icoPath = path.join(stageDir, 'app.ico');
    fs.writeFileSync(icoPath, buildMultiResIco());

    const manifest = createManifest();
    const manifestJson = JSON.stringify(manifest, null, 2) + '\n';
    fs.writeFileSync(path.join(stageDir, 'manifest.json'), manifestJson, 'utf8');

    const watcherOut = path.join(stageDir, 'obsidian-prism-watcher.exe');
    const commonMiniJson = path.join(ROOT_DIR, 'installer', 'common', 'MiniJson.cs');
    const commonCdpClient = path.join(ROOT_DIR, 'installer', 'common', 'CdpClient.cs');
    const watcherMain = path.join(ROOT_DIR, 'installer', 'watcher', 'Program.cs');

    execFileSync(csc, [
      '/nologo',
      '/utf8output',
      '/codepage:65001',
      '/target:winexe',
      '/optimize+',
      `/win32icon:${icoPath}`,
      `/out:${watcherOut}`,
      '/r:System.dll',
      '/r:System.Core.dll',
      '/r:System.Net.Http.dll',
      commonMiniJson,
      commonCdpClient,
      watcherMain,
    ], { stdio: 'inherit' });

    const activeConfigFile = resolveActiveConfigFile(configPath);
    const optionalOmniTopEntries = collectOptionalOmniTopEntries();

    const payloadFiles = [
      { name: 'obsidian-prism-watcher.exe', data: fs.readFileSync(watcherOut) },
      { name: 'manifest.json', data: Buffer.from(manifestJson, 'utf8') },
      { name: 'style.css', data: Buffer.from(cdp.readCss(), 'utf8') },
      { name: 'config.json', data: fs.readFileSync(activeConfigFile) },
      { name: 'config.example.json', data: fs.readFileSync(path.join(ROOT_DIR, 'config.example.json')) },
      ...manifest.parts.map((part) => ({
        name: part,
        data: Buffer.from(cdp.prepareRuntimePart(part, fs.readFileSync(path.join(ROOT_DIR, part), 'utf8')), 'utf8'),
      })),
      ...optionalOmniTopEntries,
      ...collectNativePluginEntries(activeConfigFile),
    ];

    const payloadZip = path.join(stageDir, 'payload.zip');
    fs.writeFileSync(payloadZip, buildZip(payloadFiles));

    const setupManifest = path.join(ROOT_DIR, 'installer', 'setup', 'app.manifest');
    const setupMain = path.join(ROOT_DIR, 'installer', 'setup', 'Program.cs');
    const tempOut = path.join(stageDir, 'installer.exe');

    execFileSync(csc, [
      '/nologo',
      '/utf8output',
      '/codepage:65001',
      '/target:winexe',
      '/optimize+',
      `/win32icon:${icoPath}`,
      `/win32manifest:${setupManifest}`,
      `/resource:${payloadZip},AGY_PAYLOAD.zip`,
      `/out:${tempOut}`,
      '/r:System.dll',
      '/r:System.Core.dll',
      '/r:System.Drawing.dll',
      '/r:System.IO.Compression.dll',
      '/r:System.IO.Compression.FileSystem.dll',
      '/r:System.Net.Http.dll',
      '/r:System.Windows.Forms.dll',
      commonMiniJson,
      commonCdpClient,
      setupMain,
    ], { stdio: 'inherit' });

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.copyFileSync(tempOut, outputPath);
    const stat = fs.statSync(outputPath);
    return {
      outputPath,
      sizeBytes: stat.size,
      watcherSizeBytes: fs.statSync(watcherOut).size,
      payloadZipBytes: fs.statSync(payloadZip).size,
      fileCount: payloadFiles.length,
    };
  } finally {
    fs.rmSync(stageDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const args = process.argv.slice(2);
  let outputPath = path.join(ROOT_DIR, 'installer.exe');
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--out' || args[i] === '-o') && i + 1 < args.length) {
      outputPath = path.resolve(args[++i]);
    }
  }
  const res = buildInstaller({ outputPath });
  console.log(
    `[✓] Built ${res.outputPath} (${(res.sizeBytes / 1024).toFixed(1)} KB; ` +
    `payload ${(res.payloadZipBytes / 1024).toFixed(1)} KB, ${res.fileCount} files)`
  );
}

export {
  VALIDATORS,
  buildInstaller,
  buildZip,
  buildMultiResIco,
};

#!/usr/bin/env node
// Build standalone zero-dependency Linux portable archive (.tar.gz) for Obsidian Prism (obsidian-prism).
// Zero external npm or OS binary dependencies: uses built-in Node zlib + POSIX ustar tar writer.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import {
  ROOT_DIR,
  cdp,
  resolveActiveConfigFile,
  collectNativePluginEntries,
  renderPrismIconPng,
} from './build-common.mjs';

const __filename = fileURLToPath(import.meta.url);
const ARCHIVE_ROOT_PREFIX = 'obsidian-prism-linux';

function generateInstallSh(version = cdp.PLUGIN_VERSION) {
  return [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    '',
    `# Obsidian Prism ${version} — Linux Lossless Portable Installer`,
    '# Zero host binary / app.asar modification; delegates to tools/install-plugin.cjs.',
    '',
    'SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"',
    'PLUGIN_SRC="$SCRIPT_DIR/native-plugin"',
    'INSTALLER_JS="$PLUGIN_SRC/tools/install-plugin.cjs"',
    '',
    'if ! command -v node >/dev/null 2>&1; then',
    '  printf \'[Obsidian Prism] Node.js >= 22 is required. Please install Node.js 22+ and retry.\\n\' >&2',
    '  printf \'[Obsidian Prism] 需要 Node.js >= 22，请先安装 Node.js 22+ 后重试。\\n\' >&2',
    '  exit 1',
    'fi',
    '',
    'NODE_MAJOR="$(node -p "parseInt(process.versions.node.split(\'.\')[0], 10)" 2>/dev/null || echo 0)"',
    'if [ "${NODE_MAJOR:-0}" -lt 22 ]; then',
    '  printf \'[Obsidian Prism] Detected Node.js %s; Node.js >= 22 is required.\\n\' "$(node -v 2>/dev/null || echo unknown)" >&2',
    '  exit 1',
    'fi',
    '',
    'if [ ! -f "$INSTALLER_JS" ]; then',
    '  printf \'[Obsidian Prism] Missing installer entry: %s\\n\' "$INSTALLER_JS" >&2',
    '  exit 1',
    'fi',
    '',
    'exec node "$INSTALLER_JS" --install "$@"',
    '',
  ].join('\n');
}

function generateUninstallSh(version = cdp.PLUGIN_VERSION) {
  return [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    '',
    `# Obsidian Prism ${version} — Linux Lossless Uninstaller`,
    '# Restores patched XDG .desktop files, removes shadow overrides/managed launcher, and stops daemon.',
    '',
    'SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"',
    'PLUGIN_SRC="$SCRIPT_DIR/native-plugin"',
    'INSTALLER_JS="$PLUGIN_SRC/tools/install-plugin.cjs"',
    'REMOVE_JS="$PLUGIN_SRC/remove.js"',
    '',
    'if ! command -v node >/dev/null 2>&1; then',
    '  printf \'[Obsidian Prism] Node.js >= 22 is required to run uninstall.\\n\' >&2',
    '  exit 1',
    'fi',
    '',
    'if [ -f "$REMOVE_JS" ]; then',
    '  node "$REMOVE_JS" >/dev/null 2>&1 || true',
    'fi',
    '',
    'if [ ! -f "$INSTALLER_JS" ]; then',
    '  printf \'[Obsidian Prism] Missing installer entry: %s\\n\' "$INSTALLER_JS" >&2',
    '  exit 1',
    'fi',
    '',
    'exec node "$INSTALLER_JS" --uninstall "$@"',
    '',
  ].join('\n');
}

function generateStatusSh(version = cdp.PLUGIN_VERSION) {
  return [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    '',
    `# Obsidian Prism ${version} — Linux Installation Status Check`,
    '',
    'SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"',
    'PLUGIN_SRC="$SCRIPT_DIR/native-plugin"',
    'INSTALLER_JS="$PLUGIN_SRC/tools/install-plugin.cjs"',
    '',
    'if ! command -v node >/dev/null 2>&1; then',
    '  printf \'[Obsidian Prism] Node.js >= 22 is required.\\n\' >&2',
    '  exit 1',
    'fi',
    '',
    'if [ ! -f "$INSTALLER_JS" ]; then',
    '  printf \'[Obsidian Prism] Missing installer entry: %s\\n\' "$INSTALLER_JS" >&2',
    '  exit 1',
    'fi',
    '',
    'exec node "$INSTALLER_JS" --status "$@"',
    '',
  ].join('\n');
}

function generateLinuxReadme(version = cdp.PLUGIN_VERSION) {
  return [
    `Obsidian Prism ${version} — Linux Portable Package`,
    '==================================================',
    '',
    'Requirements:',
    '- Node.js >= 22',
    '- Antigravity for Linux (.deb / AppImage / portable tarball)',
    '',
    'Usage:',
    '  ./install.sh                  Install plugin, configure XDG .desktop launchers (rootless shadow copy if system-owned), and start background service',
    '  ./install.sh --target-exe /path/to/Antigravity.AppImage --create-launcher',
    '                                Create a managed XDG launcher for AppImage or portable Antigravity builds',
    '  ./status.sh                   Inspect plugin installation & background service status',
    '  ./uninstall.sh                Cleanly remove plugin, revert .desktop launch flags / shadow copies, and stop background service',
    '  ./uninstall.sh --purge-data   Also remove Obsidian Prism background service config/caches (preserves user conversations)',
    '',
    'Safety Guarantees:',
    '- Never modifies Antigravity host application files or binaries.',
    '- Never requires root/sudo (uses ~/.local/share/applications XDG shadow overrides for /usr/share/applications).',
    '- Never uses SIGKILL / kill -9 against Antigravity or language_server.',
    '',
  ].join('\n');
}

function writeOctalField(buf, offset, length, value) {
  const oct = Math.max(0, Math.trunc(Number(value) || 0)).toString(8);
  const digits = length - 1;
  const padded = oct.length >= digits ? oct.slice(-digits) : oct.padStart(digits, '0');
  buf.write(padded, offset, digits, 'ascii');
  buf[offset + digits] = 0;
}

function splitUstarPath(posixPath) {
  const bytes = Buffer.from(posixPath, 'utf8');
  if (bytes.length <= 100) {
    return { name: posixPath, prefix: '', needsLongLink: false };
  }
  const slashIdx = posixPath.lastIndexOf('/');
  if (slashIdx > 0) {
    let splitPos = slashIdx;
    while (splitPos > 0) {
      const prefix = posixPath.slice(0, splitPos);
      const name = posixPath.slice(splitPos + 1);
      if (Buffer.byteLength(prefix, 'utf8') <= 155 && Buffer.byteLength(name, 'utf8') <= 100) {
        return { name, prefix, needsLongLink: false };
      }
      splitPos = posixPath.lastIndexOf('/', splitPos - 1);
    }
  }
  return { name: posixPath.slice(-100), prefix: '', needsLongLink: true };
}

function createTarHeader({ name, size = 0, mode = 0o644, mtime = 0, typeflag = '0', prefix = '' }) {
  const header = Buffer.alloc(512, 0);
  Buffer.from(name, 'utf8').copy(header, 0, 0, Math.min(100, Buffer.byteLength(name, 'utf8')));
  writeOctalField(header, 100, 8, mode);
  writeOctalField(header, 108, 8, 0);
  writeOctalField(header, 116, 8, 0);
  writeOctalField(header, 124, 12, size);
  writeOctalField(header, 136, 12, mtime);
  header.fill(0x20, 148, 156);
  header[156] = typeflag.charCodeAt(0);
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');
  header.write('root', 265, 4, 'ascii');
  header.write('root', 297, 4, 'ascii');
  writeOctalField(header, 329, 8, 0);
  writeOctalField(header, 337, 8, 0);
  if (prefix) {
    Buffer.from(prefix, 'utf8').copy(header, 345, 0, Math.min(155, Buffer.byteLength(prefix, 'utf8')));
  }
  let sum = 0;
  for (let i = 0; i < 512; i++) {
    sum += header[i];
  }
  const chk = sum.toString(8).padStart(6, '0');
  header.write(chk, 148, 6, 'ascii');
  header[154] = 0;
  header[155] = 0x20;
  return header;
}

function buildTarBuffer(entries, mtimeSec = Math.floor(Date.now() / 1000)) {
  const chunks = [];
  const emittedDirs = new Set();

  const emitDirChain = (relPath) => {
    const parts = relPath.split('/').filter(Boolean);
    let acc = '';
    for (let i = 0; i < parts.length - 1; i++) {
      acc = acc ? `${acc}/${parts[i]}` : parts[i];
      const dirEntry = `${acc}/`;
      if (emittedDirs.has(dirEntry)) continue;
      emittedDirs.add(dirEntry);
      const split = splitUstarPath(dirEntry);
      if (split.needsLongLink) {
        const longBuf = Buffer.from(dirEntry + '\0', 'utf8');
        chunks.push(createTarHeader({ name: '././@LongLink', size: longBuf.length, mode: 0o644, mtime: mtimeSec, typeflag: 'L' }));
        chunks.push(longBuf);
        const pad = (512 - (longBuf.length % 512)) % 512;
        if (pad > 0) chunks.push(Buffer.alloc(pad, 0));
      }
      chunks.push(createTarHeader({ name: split.name, prefix: split.prefix, size: 0, mode: 0o755, mtime: mtimeSec, typeflag: '5' }));
    }
  };

  for (const entry of entries) {
    const cleanName = String(entry.name || '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (!cleanName) continue;
    emitDirChain(cleanName);
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(String(entry.data || ''), 'utf8');
    const mode = Number.isInteger(entry.mode) ? entry.mode : 0o644;
    const split = splitUstarPath(cleanName);
    if (split.needsLongLink) {
      const longBuf = Buffer.from(cleanName + '\0', 'utf8');
      chunks.push(createTarHeader({ name: '././@LongLink', size: longBuf.length, mode: 0o644, mtime: mtimeSec, typeflag: 'L' }));
      chunks.push(longBuf);
      const longPad = (512 - (longBuf.length % 512)) % 512;
      if (longPad > 0) chunks.push(Buffer.alloc(longPad, 0));
    }
    chunks.push(createTarHeader({ name: split.name, prefix: split.prefix, size: data.length, mode, mtime: mtimeSec, typeflag: '0' }));
    if (data.length > 0) {
      chunks.push(data);
      const pad = (512 - (data.length % 512)) % 512;
      if (pad > 0) chunks.push(Buffer.alloc(pad, 0));
    }
  }

  chunks.push(Buffer.alloc(1024, 0));
  return Buffer.concat(chunks);
}

function parseTarEntries(tarOrGzBuffer) {
  let tarBuf = tarOrGzBuffer;
  if (tarBuf.length >= 2 && tarBuf[0] === 0x1f && tarBuf[1] === 0x8b) {
    tarBuf = zlib.gunzipSync(tarBuf);
  }
  const entries = [];
  let offset = 0;
  let pendingLongName = null;
  while (offset + 512 <= tarBuf.length) {
    const hdr = tarBuf.subarray(offset, offset + 512);
    if (hdr.every((b) => b === 0)) break;
    const rawName = hdr.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    const rawPrefix = hdr.subarray(345, 500).toString('utf8').replace(/\0.*$/, '');
    const modeStr = hdr.subarray(100, 108).toString('ascii').replace(/\0.*$/, '').trim();
    const sizeStr = hdr.subarray(124, 136).toString('ascii').replace(/\0.*$/, '').trim();
    const typeflag = String.fromCharCode(hdr[156] || 48);
    const size = parseInt(sizeStr || '0', 8) || 0;
    const mode = parseInt(modeStr || '644', 8) || 0o644;
    offset += 512;
    const data = Buffer.from(tarBuf.subarray(offset, offset + size));
    offset += Math.ceil(size / 512) * 512;
    if (typeflag === 'L') {
      pendingLongName = data.toString('utf8').replace(/\0+$/, '');
      continue;
    }
    const fullName = pendingLongName || (rawPrefix ? `${rawPrefix}/${rawName}` : rawName);
    pendingLongName = null;
    entries.push({ name: fullName, typeflag, mode, size, data });
  }
  return entries;
}

function collectLinuxPortableEntries({ configPath = null, version = cdp.PLUGIN_VERSION } = {}) {
  const activeConfigFile = resolveActiveConfigFile(configPath);
  const rawPluginEntries = collectNativePluginEntries(activeConfigFile);
  const seen = new Set();
  const entries = [];

  const pushEntry = (name, data, mode = 0o644) => {
    const norm = name.replace(/\\/g, '/').replace(/^\/+/, '');
    if (seen.has(norm)) return;
    seen.add(norm);
    entries.push({ name: norm, data, mode });
  };

  pushEntry(`${ARCHIVE_ROOT_PREFIX}/install.sh`, Buffer.from(generateInstallSh(version), 'utf8'), 0o755);
  pushEntry(`${ARCHIVE_ROOT_PREFIX}/uninstall.sh`, Buffer.from(generateUninstallSh(version), 'utf8'), 0o755);
  pushEntry(`${ARCHIVE_ROOT_PREFIX}/status.sh`, Buffer.from(generateStatusSh(version), 'utf8'), 0o755);
  pushEntry(`${ARCHIVE_ROOT_PREFIX}/README-LINUX.txt`, Buffer.from(generateLinuxReadme(version), 'utf8'), 0o644);
  pushEntry(`${ARCHIVE_ROOT_PREFIX}/assets/obsidian-prism-256.png`, renderPrismIconPng(256), 0o644);

  for (const item of rawPluginEntries) {
    pushEntry(`${ARCHIVE_ROOT_PREFIX}/${item.name}`, item.data, 0o644);
  }

  for (const toolRel of ['tools/install-plugin.cjs', 'tools/patch-asar.cjs']) {
    const abs = path.join(ROOT_DIR, ...toolRel.split('/'));
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      pushEntry(`${ARCHIVE_ROOT_PREFIX}/native-plugin/${toolRel}`, fs.readFileSync(abs), 0o644);
    }
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));
  return entries;
}

function buildLinuxPortable({
  outPath = path.join(ROOT_DIR, 'dist', 'obsidian-prism-linux-portable.tar.gz'),
  configPath = null,
  version = cdp.PLUGIN_VERSION,
} = {}) {
  const resolvedOut = path.resolve(outPath);
  const entries = collectLinuxPortableEntries({ configPath, version });
  const tarBuf = buildTarBuffer(entries);
  const gzBuf = zlib.gzipSync(tarBuf, { level: 9 });
  fs.mkdirSync(path.dirname(resolvedOut), { recursive: true });
  fs.writeFileSync(resolvedOut, gzBuf);
  return {
    outPath: resolvedOut,
    sizeBytes: gzBuf.length,
    tarSizeBytes: tarBuf.length,
    fileCount: entries.length,
    version,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const args = process.argv.slice(2);
  let outPath = path.join(ROOT_DIR, 'dist', 'obsidian-prism-linux-portable.tar.gz');
  let configPath = null;
  let version = cdp.PLUGIN_VERSION;
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--out' || args[i] === '-o') && i + 1 < args.length) {
      outPath = path.resolve(args[++i]);
    } else if (args[i] === '--config' && i + 1 < args.length) {
      configPath = path.resolve(args[++i]);
    } else if (args[i] === '--version' && i + 1 < args.length) {
      version = args[++i];
    }
  }
  const res = buildLinuxPortable({ outPath, configPath, version });
  console.log(
    `[✓] Built ${res.outPath} (${(res.sizeBytes / 1024).toFixed(1)} KB gz / ` +
    `${(res.tarSizeBytes / 1024).toFixed(1)} KB tar; ${res.fileCount} files)`
  );
}

export {
  ARCHIVE_ROOT_PREFIX,
  generateInstallSh,
  generateUninstallSh,
  generateStatusSh,
  generateLinuxReadme,
  buildTarBuffer,
  parseTarEntries,
  collectLinuxPortableEntries,
  buildLinuxPortable,
};

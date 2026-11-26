// Shared build helpers for Obsidian Prism (obsidian-prism) Windows and macOS installers.
// Zero external npm dependencies: uses built-in Node zlib only.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const cdp = require(path.join(ROOT_DIR, 'cdp.js'));

const VALIDATORS = { ...cdp.VALIDATORS };

function getEffectiveRuntimeParts() {
  return [...cdp.RUNTIME_PARTS];
}

function createManifest() {
  return {
    version: cdp.PLUGIN_VERSION,
    styleId: cdp.STYLE_ID,
    settingBinding: cdp.SETTING_BINDING,
    sidebarBinding: cdp.SIDEBAR_BINDING,
    inlineDiffBinding: cdp.INLINE_DIFF_BINDING,
    wallpaperBinding: cdp.WALLPAPER_BINDING,
    suggesterBinding: cdp.SUGGESTER_BINDING,
    parts: getEffectiveRuntimeParts(),
    defaultConfig: cdp.DEFAULT_CONFIG,
    validators: VALIDATORS,
    removeExpression: cdp.REMOVE_EXPRESSION,
    swarmI18nRemoveExpression: cdp.SWARM_I18N_REMOVE_EXPRESSION,
  };
}

function resolveActiveConfigFile(configPath) {
  if (configPath) return configPath;
  return path.join(ROOT_DIR, 'config.example.json');
}

// --- Pure Node PNG + Multi-Size ICO + Apple ICNS generator (4-Color Prismatic Star on Obsidian Badge) ---
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const combined = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(combined), 0);
  return Buffer.concat([len, combined, crcBuf]);
}

function encodePngRgba(width, height, rgba) {
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0;
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function renderPrismIconPng(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const half = size * 0.5;
  const maxR = size * 0.40;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const dx = (x + 0.5 - half) / maxR;
      const dy = (y + 0.5 - half) / maxR;
      // Superellipse / astroid 4-pointed rounded star: |dx|^0.62 + |dy|^0.62 <= 1
      const starMetric = Math.pow(Math.abs(dx), 0.62) + Math.pow(Math.abs(dy), 0.62);
      if (starMetric <= 1.04) {
        const edgeAlpha =
          starMetric <= 0.96
            ? 255
            : Math.max(0, Math.min(255, Math.round(((1.04 - starMetric) / 0.08) * 255)));

        let r, g, b;
        const diamond = Math.abs(dx) + Math.abs(dy);
        if (diamond <= 0.28) {
          r = 248; g = 250; b = 255;
        } else if (dx <= 0 && dy <= 0) {
          // Top-left: Google Royal Blue (#4285F4)
          r = 66; g = 133; b = 244;
        } else if (dx > 0 && dy <= 0) {
          // Top-right: Google Red (#EA4335)
          r = 234; g = 67; b = 53;
        } else if (dx > 0 && dy > 0) {
          // Bottom-right: Google Yellow (#FBBC04)
          r = 251; g = 188; b = 4;
        } else {
          // Bottom-left: Google Green (#34A853)
          r = 52; g = 168; b = 83;
        }
        rgba[idx] = r;
        rgba[idx + 1] = g;
        rgba[idx + 2] = b;
        rgba[idx + 3] = edgeAlpha;
      }
    }
  }
  return encodePngRgba(size, size, rgba);
}

function collectOptionalSidebarTopEntries() {
  const sidebarClientRel = 'vendor/sidebar-studio/sidebar-client.js';
  const sidebarClientAbs = path.join(ROOT_DIR, 'vendor', 'sidebar-studio', 'sidebar-client.js');
  if (!fs.existsSync(sidebarClientAbs)) return [];
  try {
    return [
      {
        name: sidebarClientRel,
        data: Buffer.from(cdp.minifyJs(fs.readFileSync(sidebarClientAbs, 'utf8')), 'utf8'),
      },
    ];
  } catch {
    return [];
  }
}

function collectOptionalThoughtTopEntries() {
  const entries = [];
  for (const rel of [
    'vendor/thought-translator/thought-client.js',
    'vendor/thought-translator/thought-settings-ui.js',
  ]) {
    const abs = path.join(ROOT_DIR, ...rel.split('/'));
    if (!fs.existsSync(abs)) continue;
    try {
      entries.push({
        name: rel,
        data: Buffer.from(cdp.minifyJs(fs.readFileSync(abs, 'utf8')), 'utf8'),
      });
    } catch {}
  }
  return entries;
}

function collectOptionalInlineDiffTopEntries() {
  const rel = 'vendor/inline-diff/inline-diff-client.js';
  const abs = path.join(ROOT_DIR, 'vendor', 'inline-diff', 'inline-diff-client.js');
  if (!fs.existsSync(abs)) return [];
  try {
    return [
      {
        name: rel,
        data: Buffer.from(cdp.minifyJs(fs.readFileSync(abs, 'utf8')), 'utf8'),
      },
    ];
  } catch {
    return [];
  }
}

function collectOptionalWallpaperTopEntries() {
  const entries = [];
  for (const rel of [
    'vendor/wallpaper/wallpaper-client.js',
    'vendor/wallpaper/wallpaper-settings-ui.js',
  ]) {
    const abs = path.join(ROOT_DIR, ...rel.split('/'));
    if (!fs.existsSync(abs)) continue;
    try {
      entries.push({
        name: rel,
        data: Buffer.from(cdp.minifyJs(fs.readFileSync(abs, 'utf8')), 'utf8'),
      });
    } catch {}
  }
  return entries;
}

function collectOptionalSuggesterTopEntries() {
  const entries = [];
  for (const rel of [
    'vendor/prompt-suggester/suggester-client.js',
    'vendor/prompt-suggester/suggester-settings-ui.js',
  ]) {
    const abs = path.join(ROOT_DIR, ...rel.split('/'));
    if (!fs.existsSync(abs)) continue;
    try {
      entries.push({
        name: rel,
        data: Buffer.from(cdp.minifyJs(fs.readFileSync(abs, 'utf8')), 'utf8'),
      });
    } catch {}
  }
  return entries;
}

function collectOptionalOmniTopEntries() {
  const entries = [];
  const omniClientRel = 'vendor/omni-viewer/omni-client.js';
  const omniClientAbs = path.join(ROOT_DIR, 'vendor', 'omni-viewer', 'omni-client.js');
  if (fs.existsSync(omniClientAbs)) {
    try {
      entries.push({
        name: omniClientRel,
        data: Buffer.from(cdp.minifyJs(fs.readFileSync(omniClientAbs, 'utf8')), 'utf8'),
      });
    } catch {}
  }
  entries.push(...collectOptionalSidebarTopEntries());
  entries.push(...collectOptionalThoughtTopEntries());
  entries.push(...collectOptionalInlineDiffTopEntries());
  entries.push(...collectOptionalWallpaperTopEntries());
  entries.push(...collectOptionalSuggesterTopEntries());
  return entries;
}

function collectNativePluginEntries(activeConfigFile) {
  const entries = [];
  const seen = new Set();
  const pushEntry = (zipRel, fileBuf) => {
    const normalized = zipRel.replace(/\\/g, '/').replace(/^\/+/, '');
    if (seen.has(normalized)) return;
    seen.add(normalized);
    entries.push({ name: normalized, data: fileBuf });
  };

  for (const rel of cdp.SYNC_ROOT_FILES || []) {
    const abs = path.join(ROOT_DIR, rel);
    try {
      if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
        pushEntry(`native-plugin/${rel}`, fs.readFileSync(abs));
      }
    } catch {}
  }

  if (activeConfigFile && fs.existsSync(activeConfigFile)) {
    try {
      pushEntry('native-plugin/config.json', fs.readFileSync(activeConfigFile));
    } catch {}
  }

  const walkSubDir = (subRel) => {
    const absDir = path.join(ROOT_DIR, subRel);
    if (!fs.existsSync(absDir)) return;
    let dirents = [];
    try {
      dirents = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const dirent of dirents) {
      const name = dirent.name;
      if (
        name === '.DS_Store' ||
        name === '__pycache__' ||
        name === '.daemon.pid' ||
        name.endsWith('.log') ||
        name.endsWith('.tmp')
      ) {
        continue;
      }
      const nextRel = `${subRel}/${name}`;
      if (nextRel === 'assets/screenshots') continue;
      const nextAbs = path.join(absDir, name);
      if (dirent.isDirectory()) {
        walkSubDir(nextRel);
      } else if (dirent.isFile()) {
        try {
          pushEntry(`native-plugin/${nextRel}`, fs.readFileSync(nextAbs));
        } catch {}
      }
    }
  };

  walkSubDir('assets');
  walkSubDir('vendor');
  walkSubDir('sidecars');
  return entries;
}

function buildMultiResIco(sizes = [16, 32, 48, 256]) {
  const pngs = sizes.map((s) => ({ size: s, data: renderPrismIconPng(s) }));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);

  const dirEntries = [];
  let offset = 6 + pngs.length * 16;
  for (const item of pngs) {
    const entry = Buffer.alloc(16);
    entry[0] = item.size >= 256 ? 0 : item.size;
    entry[1] = item.size >= 256 ? 0 : item.size;
    entry[2] = 0;
    entry[3] = 0;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(item.data.length, 8);
    entry.writeUInt32LE(offset, 12);
    dirEntries.push(entry);
    offset += item.data.length;
  }
  return Buffer.concat([header, ...dirEntries, ...pngs.map((p) => p.data)]);
}

function buildIcns() {
  const cache = new Map();
  const pngFor = (size) => {
    if (!cache.has(size)) cache.set(size, renderPrismIconPng(size));
    return cache.get(size);
  };
  const specs = [
    ['icp4', 16],
    ['ic11', 32],
    ['icp5', 32],
    ['ic12', 64],
    ['icp6', 64],
    ['ic07', 128],
    ['ic13', 256],
    ['ic08', 256],
    ['ic14', 512],
    ['ic09', 512],
    ['ic10', 1024],
  ];
  const chunks = [];
  let totalLen = 8;
  for (const [osType, size] of specs) {
    const png = pngFor(size);
    const hdr = Buffer.alloc(8);
    hdr.write(osType, 0, 4, 'ascii');
    hdr.writeUInt32BE(8 + png.length, 4);
    chunks.push(hdr, png);
    totalLen += 8 + png.length;
  }
  const fileHdr = Buffer.alloc(8);
  fileHdr.write('icns', 0, 4, 'ascii');
  fileHdr.writeUInt32BE(totalLen, 4);
  return Buffer.concat([fileHdr, ...chunks]);
}

function buildZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name.replace(/\\/g, '/'), 'utf8');
    const rawBuf = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, 'utf8');
    const compBuf = zlib.deflateRawSync(rawBuf, { level: 9 });
    const crc = crc32(rawBuf);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x596f, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compBuf.length, 18);
    local.writeUInt32LE(rawBuf.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    localParts.push(local, nameBuf, compBuf);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x596f, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compBuf.length, 20);
    central.writeUInt32LE(rawBuf.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);

    centralParts.push(central, nameBuf);
    offset += local.length + nameBuf.length + compBuf.length;
  }

  const centralSize = centralParts.reduce((s, b) => s + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, eocd]);
}

export {
  ROOT_DIR,
  cdp,
  VALIDATORS,
  createManifest,
  resolveActiveConfigFile,
  collectOptionalOmniTopEntries,
  collectOptionalSidebarTopEntries,
  collectOptionalThoughtTopEntries,
  collectOptionalInlineDiffTopEntries,
  collectOptionalWallpaperTopEntries,
  collectOptionalSuggesterTopEntries,
  collectNativePluginEntries,
  renderPrismIconPng,
  buildMultiResIco,
  buildIcns,
  buildZip,
};

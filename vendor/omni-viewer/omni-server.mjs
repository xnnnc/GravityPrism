// Obsidian Prism — Omni Local Streaming Gateway, Scoped Sandbox Server & Native File RPC Engine
// 仅监听 127.0.0.1 随机空闲端口，每次启动生成 64 位 hex 主鉴权令牌 + 独立 HMAC 单目录沙盒子令牌，提供 HTTP 206 Range 流、HTML 沙盒与安全文件 RPC。

import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const OMNI_VERSION = '1.0.8-beta.3';
export const OMNI_BINDING = '__agPrismOmniCall';

const MAX_TEXT_SLICE_BYTES = 2 * 1024 * 1024;
const DEFAULT_HEAD_BYTES = 262144;
const MAX_SANDBOX_MOUNTS = 64;
const DEFAULT_SANDBOX_TTL_MS = 30 * 60 * 1000;

const VIEWER_CSP = [
  "default-src 'self' blob: data:",
  "script-src 'unsafe-inline' 'self' blob:",
  "style-src 'unsafe-inline' 'self'",
  "img-src 'self' data: blob: http: https:",
  "media-src 'self' data: blob:",
  "font-src 'self' data: blob:",
  "connect-src 'self'",
  "frame-src 'self' blob: data:",
  "object-src 'none'",
  "base-uri 'none'",
].join('; ');

export const SANDBOX_HTML_CSP = "sandbox allow-scripts; connect-src 'none'; form-action 'none'; navigate-to 'none'";
const SUPPORTED_VIEWER_LANGS = Object.freeze(['zh-CN', 'zh-TW', 'yue', 'en', 'ja', 'ko', 'es', 'fr', 'de']);

const MIME_BY_EXT = Object.freeze({
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.ogv': 'video/ogg',
  '.avi': 'video/x-msvideo',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/opus',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.pdf': 'application/pdf',
  '.csv': 'text/csv; charset=utf-8',
  '.tsv': 'text/tab-separated-values; charset=utf-8',
  '.jsonl': 'application/x-ndjson; charset=utf-8',
  '.ndjson': 'application/x-ndjson; charset=utf-8',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mmd': 'text/plain; charset=utf-8',
  '.mermaid': 'text/plain; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.xml': 'application/xml; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.log': 'text/plain; charset=utf-8',
  '.yml': 'text/yaml; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
});

const KIND_BY_EXT = Object.freeze({
  '.mp4': 'video',
  '.m4v': 'video',
  '.mov': 'video',
  '.webm': 'video',
  '.mkv': 'video',
  '.ogv': 'video',
  '.avi': 'video',
  '.mp3': 'audio',
  '.wav': 'audio',
  '.ogg': 'audio',
  '.opus': 'audio',
  '.m4a': 'audio',
  '.aac': 'audio',
  '.flac': 'audio',
  '.svg': 'svg',
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.webp': 'image',
  '.gif': 'image',
  '.ico': 'image',
  '.avif': 'image',
  '.bmp': 'image',
  '.html': 'html',
  '.htm': 'html',
  '.pdf': 'pdf',
  '.csv': 'table',
  '.tsv': 'table',
  '.jsonl': 'table',
  '.ndjson': 'table',
  '.ttf': 'font',
  '.otf': 'font',
  '.woff': 'font',
  '.woff2': 'font',
  '.mmd': 'mermaid',
  '.mermaid': 'mermaid',
});

const BLOCKED_EXTERNAL_EXEC_EXTS = new Set([
  '.bat', '.cmd', '.ps1', '.psm1', '.psd1', '.vbs', '.vbe', '.wsf', '.wsh', '.ws', '.sct',
  '.hta', '.scr', '.pif', '.com', '.msi', '.msp', '.reg', '.lnk', '.url', '.scf', '.exe',
  '.dll', '.cpl', '.msc', '.jar', '.jse', '.js', '.cjs', '.mjs', '.appref-ms', '.search-ms',
  '.library-ms', '.app', '.command', '.terminal', '.chm', '.iso', '.img', '.vhd', '.vhdx', '.inf',
]);

const SENSITIVE_BASENAMES = new Set([
  'keys.txt',
  'secrets.json',
  '.npmrc',
  '.pypirc',
  '.git-credentials',
  '.netrc',
  '.envrc',
  '.pgpass',
  '.bash_history',
  'consolehost_history.txt',
  'hosts.yml',
  'logins.json',
  'key4.db',
  'obsidian-prism-sidebar.json',
  'credentials.json',
  'kubeconfig',
  'cookies',
  'cookies-journal',
  'login data',
  'login data-journal',
  'local state',
  'web data',
]);

const SENSITIVE_EXTS = new Set([
  '.pem', '.key', '.pfx', '.p12', '.kdbx', '.jks', '.keystore', '.ppk', '.ovpn',
]);

const SENSITIVE_DIR_SEGMENTS = new Set(['.ssh', '.aws', '.gnupg', '.kube']);

// 拦截远程 Windows UNC / SMB 路径（防 NetNTLMv2 哈希泄露，仅放行本地盘符或 WSL 回路）
export function isBlockedUncPath(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') return false;
  let s = rawInput.trim();
  if (!s) return false;
  if (s.startsWith('@') && s.length > 1 && !s.startsWith('@/')) s = s.slice(1).trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  if (/^file:\/\//i.test(s)) {
    const afterScheme = s.slice(7);
    if (!afterScheme.startsWith('/')) {
      const host = afterScheme.split(/[/?#\\]/)[0].toLowerCase();
      if (
        host &&
        host !== 'localhost' &&
        host !== '127.0.0.1' &&
        host !== '[::1]' &&
        host !== 'wsl.localhost' &&
        host !== 'wsl$' &&
        !/^[a-z]:$/i.test(host)
      ) {
        return true;
      }
    }
    try {
      s = decodeURIComponent(afterScheme);
    } catch {
      s = afterScheme;
    }
  }
  if (/^[\\/]{2}/.test(s)) {
    const rest = s.replace(/^[\\/]+/, '');
    if (/^[?.][\\/]/.test(rest)) {
      const inner = rest.slice(2).replace(/^[\\/]+/, '');
      if (/^[A-Za-z]:(?:[\\/]|$)/.test(inner)) {
        return false;
      }
      const uncMatch = inner.match(/^(?:global[\\/]+)*unc[\\/]+(.+)$/i);
      if (uncMatch) {
        const uncHost = uncMatch[1].split(/[\\/]/)[0].toLowerCase();
        return uncHost !== 'localhost' && uncHost !== '127.0.0.1' && uncHost !== 'wsl.localhost' && uncHost !== 'wsl$';
      }
      // 除本地盘符与本地回环 UNC 白名单外，拦截全部 NT 设备路径（如 GLOBALROOT\Device\LanmanRedirector / WebDavRedirector / Mup 等）
      return true;
    }
    const host = rest.split(/[\\/]/)[0].toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === 'wsl.localhost' || host === 'wsl$') {
      return false;
    }
    return true;
  }
  return false;
}

// 敏感凭据文件统一黑名单校验
export function isSensitiveFilePath(filePath) {
  if (!filePath || typeof filePath !== 'string') return false;
  const normalized = filePath.replace(/\\/g, '/').replace(/\/+$/, '');
  const base = path.posix.basename(normalized).toLowerCase();
  if (!base) return false;
  if (base === '.env' || base.startsWith('.env.')) return true;
  if (/^obsidian-prism-thought.*\.json(?:\.tmp)?$/i.test(base)) return true;
  if (SENSITIVE_BASENAMES.has(base)) return true;
  const ext = path.posix.extname(base);
  if (ext && SENSITIVE_EXTS.has(ext)) return true;
  if (/^id_(?:rsa|ed25519|ecdsa|dsa)(?:\.pem|\.key)?$/.test(base)) return true;
  const segs = normalized.toLowerCase().split('/');
  for (let i = 0; i < segs.length; i++) {
    if (SENSITIVE_DIR_SEGMENTS.has(segs[i])) return true;
    if (segs[i] === 'thought-translator' && base.endsWith('.json')) return true;
  }
  return false;
}

export function detectPreviewKind(filePath, mime = '') {
  const ext = path.extname(String(filePath || '')).toLowerCase();
  if (KIND_BY_EXT[ext]) return KIND_BY_EXT[ext];
  const lowMime = String(mime || '').toLowerCase();
  if (lowMime.startsWith('video/')) return 'video';
  if (lowMime.startsWith('audio/')) return 'audio';
  if (lowMime === 'image/svg+xml') return 'svg';
  if (lowMime.startsWith('image/')) return 'image';
  if (lowMime.startsWith('text/html')) return 'html';
  if (lowMime === 'application/pdf') return 'pdf';
  if (lowMime.startsWith('font/')) return 'font';
  return 'text';
}

export function lookupMimeType(filePath, isBinary = false) {
  const ext = path.extname(String(filePath || '')).toLowerCase();
  if (MIME_BY_EXT[ext]) return MIME_BY_EXT[ext];
  return isBinary ? 'application/octet-stream' : 'text/plain; charset=utf-8';
}

// 解析本地路径、file:// URI 以及 #L10-L20 / :10:5 / (10,5) 行号定位
export function parseRawPathInput(rawInput, workspaceHint = '') {
  let raw = String(rawInput || '').trim();
  if (!raw || raw.includes('\0')) {
    return { cleanPath: '', blockedUnc: false, lineStart: null, lineEnd: null, col: null };
  }
  if (isBlockedUncPath(raw)) {
    return { cleanPath: '', blockedUnc: true, lineStart: null, lineEnd: null, col: null };
  }
  if (raw.startsWith('@') && raw.length > 1 && !raw.startsWith('@/')) {
    raw = raw.slice(1).trim();
  }
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    raw = raw.slice(1, -1).trim();
  }

  let lineStart = null;
  let lineEnd = null;
  const hashMatch = /#L?(\d+)(?:-(?:L)?(\d+))?$/i.exec(raw);
  if (hashMatch) {
    lineStart = parseInt(hashMatch[1], 10);
    lineEnd = hashMatch[2] ? parseInt(hashMatch[2], 10) : lineStart;
    raw = raw.slice(0, hashMatch.index);
  }

  if (/^file:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      raw = fileURLToPath(u);
    } catch {
      raw = decodeURIComponent(raw.replace(/^file:\/\/\/?/i, ''));
      if (process.platform === 'win32' && /^\/[A-Za-z]:/.test(raw)) {
        raw = raw.slice(1);
      }
    }
  } else {
    try {
      if (/%[0-9A-Fa-f]{2}/.test(raw)) raw = decodeURIComponent(raw);
    } catch {}
  }

  if (isBlockedUncPath(raw)) {
    return { cleanPath: '', blockedUnc: true, lineStart, lineEnd, col: null };
  }

  let col = null;
  if (lineStart === null) {
    const parenMatch = /\((\d+)(?:,\s*(\d+))?\)$/.exec(raw);
    if (parenMatch) {
      lineStart = parseInt(parenMatch[1], 10);
      lineEnd = lineStart;
      if (parenMatch[2]) col = parseInt(parenMatch[2], 10);
      raw = raw.slice(0, parenMatch.index);
    } else {
      const colonMatch = /^(.*?):(\d+)(?:(?:-(\d+))|(?::(\d+)))?$/.exec(raw);
      if (colonMatch && colonMatch[1] && !/^[A-Za-z]$/.test(colonMatch[1])) {
        raw = colonMatch[1];
        lineStart = parseInt(colonMatch[2], 10);
        lineEnd = colonMatch[3] ? parseInt(colonMatch[3], 10) : lineStart;
        if (colonMatch[4]) col = parseInt(colonMatch[4], 10);
      }
    }
  }

  raw = raw.trim();
  if (!raw) return { cleanPath: '', blockedUnc: false, lineStart, lineEnd, col };
  if (isBlockedUncPath(raw)) {
    return { cleanPath: '', blockedUnc: true, lineStart, lineEnd, col };
  }

  let wsRoot = '';
  if (workspaceHint && typeof workspaceHint === 'string' && !isBlockedUncPath(workspaceHint)) {
    const parsedWs = /^file:\/\//i.test(workspaceHint.trim())
      ? parseRawPathInput(workspaceHint.trim(), '').cleanPath
      : workspaceHint.trim();
    if (parsedWs && !isBlockedUncPath(parsedWs)) wsRoot = path.resolve(parsedWs);
  }

  let absPath;
  if (path.isAbsolute(raw) || (process.platform === 'win32' && /^[A-Za-z]:[\\/]/.test(raw))) {
    absPath = path.resolve(raw);
  } else if (wsRoot) {
    absPath = path.resolve(wsRoot, raw);
  } else {
    absPath = path.resolve(raw);
  }

  if (isBlockedUncPath(absPath)) {
    return { cleanPath: '', blockedUnc: true, lineStart, lineEnd, col };
  }

  let relPath = '';
  if (wsRoot) {
    const rel = path.relative(wsRoot, absPath);
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
      relPath = rel.replace(/\\/g, '/');
    }
  }

  return { cleanPath: absPath, blockedUnc: false, wsRoot, relPath, lineStart, lineEnd, col };
}

function constantTimeTokenMatch(expectedHex, providedStr) {
  if (typeof expectedHex !== 'string' || typeof providedStr !== 'string') return false;
  if (expectedHex.length === 0 || expectedHex.length !== providedStr.length) return false;
  const a = Buffer.from(expectedHex, 'utf8');
  const b = Buffer.from(providedStr, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// 回退切片尾部未闭合的 UTF-8 多字节序列（1~3 字节），避免跨分片拼接出现 \uFFFD 乱码
function trimIncompleteUtf8Tail(buf) {
  const len = buf.length;
  if (len < 4) return len;
  let contCount = 0;
  let idx = len - 1;
  while (idx >= 0 && contCount < 3 && (buf[idx] & 0xc0) === 0x80) {
    contCount++;
    idx--;
  }
  if (idx < 0) return len;
  const lead = buf[idx];
  if (lead < 0x80) {
    // 若最后几个是孤立延续字节，保留原长；正常 ASCII 结尾无需截断
    return len;
  }
  let expectedTotal = 0;
  if (lead >= 0xc2 && lead <= 0xdf) expectedTotal = 2;
  else if (lead >= 0xe0 && lead <= 0xef) expectedTotal = 3;
  else if (lead >= 0xf0 && lead <= 0xf4) expectedTotal = 4;
  else return len;

  const actualBytes = 1 + contCount;
  if (actualBytes < expectedTotal && idx > 0) {
    return idx;
  }
  return len;
}

async function resolveSafeFileRealPath(absPath, { allowDir = false } = {}) {
  if (!absPath || isBlockedUncPath(absPath)) {
    const err = new Error('Blocked unsafe or remote UNC path');
    err.statusCode = 403;
    throw err;
  }
  if (isSensitiveFilePath(absPath)) {
    const err = new Error('Access to sensitive file blocked');
    err.statusCode = 403;
    throw err;
  }
  let realTarget;
  try {
    realTarget = await fs.promises.realpath(absPath);
  } catch (e) {
    const err = new Error('Target file not found');
    err.code = e?.code || 'ENOENT';
    err.statusCode = 404;
    throw err;
  }
  if (isBlockedUncPath(realTarget) || isSensitiveFilePath(realTarget)) {
    const err = new Error('Access to sensitive target blocked');
    err.statusCode = 403;
    throw err;
  }
  const st = await fs.promises.stat(realTarget);
  if (!st.isFile() && !(allowDir && st.isDirectory())) {
    const err = new Error('Target is not a regular file');
    err.statusCode = 400;
    throw err;
  }
  return { realTarget, stat: st };
}

async function readSafeFileSlice(absPath, offset = 0, maxBytes = DEFAULT_HEAD_BYTES) {
  const { realTarget, stat: st } = await resolveSafeFileRealPath(absPath, { allowDir: false });
  const rawOff = Math.floor(Number(offset) || 0);
  const safeOffset = rawOff > 0 ? (rawOff < st.size ? rawOff : st.size) : 0;
  const rawMax = Math.floor(Number(maxBytes) || DEFAULT_HEAD_BYTES);
  const clampedMax = rawMax > 0 && rawMax <= MAX_TEXT_SLICE_BYTES ? rawMax : DEFAULT_HEAD_BYTES;
  const avail = st.size > safeOffset ? st.size - safeOffset : 0;
  const toRead = avail < clampedMax ? avail : clampedMax;
  if (!(toRead >= 0 && toRead <= MAX_TEXT_SLICE_BYTES)) {
    throw new RangeError('Slice size out of bounds');
  }

  const buf = Buffer.alloc(toRead);
  let fh = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      fh = await fs.promises.open(realTarget, 'r');
      break;
    } catch (e) {
      if (attempt < 2 && (e?.code === 'EBUSY' || e?.code === 'EPERM')) {
        await new Promise((r) => setTimeout(r, 15));
        continue;
      }
      throw e;
    }
  }
  let bytesRead = 0;
  try {
    if (toRead > 0) {
      const res = await fh.read(buf, 0, toRead, safeOffset);
      bytesRead = res.bytesRead;
    }
  } finally {
    await fh.close();
  }

  let sliceBuf = buf.subarray(0, bytesRead);
  let hasNullByte = false;
  const probeLen = Math.min(sliceBuf.length, 4096);
  for (let i = 0; i < probeLen; i++) {
    if (sliceBuf[i] === 0) {
      hasNullByte = true;
      break;
    }
  }

  const rawTruncated = safeOffset + bytesRead < st.size;
  if (!hasNullByte && rawTruncated) {
    const cleanLen = trimIncompleteUtf8Tail(sliceBuf);
    if (cleanLen > 0 && cleanLen < sliceBuf.length) {
      sliceBuf = sliceBuf.subarray(0, cleanLen);
      bytesRead = cleanLen;
    }
  }

  const nextOffset = safeOffset + bytesRead;
  const truncated = nextOffset < st.size;
  return {
    realTarget,
    stat: st,
    buffer: sliceBuf,
    hasNullByte,
    offset: safeOffset,
    bytesRead,
    truncated,
    nextOffset: truncated ? nextOffset : null,
  };
}

function parseHttpByteRange(rangeHeader, totalSize) {
  if (!rangeHeader || typeof rangeHeader !== 'string' || !rangeHeader.startsWith('bytes=')) {
    return null;
  }
  if (totalSize <= 0) return { unsatisfiable: true };
  const spec = rangeHeader.slice('bytes='.length).split(',')[0].trim();
  const m = /^(\d*)-(\d*)$/.exec(spec);
  if (!m || (m[1] === '' && m[2] === '')) return { unsatisfiable: true };

  let start;
  let end;
  if (m[1] === '') {
    const suffixLen = parseInt(m[2], 10);
    if (!Number.isFinite(suffixLen) || suffixLen <= 0) return { unsatisfiable: true };
    start = Math.max(0, totalSize - suffixLen);
    end = totalSize - 1;
  } else {
    start = parseInt(m[1], 10);
    end = m[2] !== '' ? parseInt(m[2], 10) : totalSize - 1;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= totalSize || end < start) {
      return { unsatisfiable: true };
    }
    end = Math.min(end, totalSize - 1);
  }
  return { start, end, length: end - start + 1 };
}

function buildFallbackViewerHtml(ctx) {
  const esc = (s) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  return `<!doctype html><html lang="${esc(ctx.lang || 'zh-CN')}" data-theme="${esc(ctx.theme || 'dark')}" data-ag-cs-corners="${esc(ctx.corners || 'balanced')}"><head><meta charset="utf-8"><title>${esc(ctx.name || 'Omni Workbench')}</title></head><body><main data-kind="${esc(ctx.kind)}" data-stream="${esc(ctx.streamUrl || '')}">${esc(ctx.name || ctx.kind)}</main></body></html>`;
}

export class OmniServer {
  constructor(options = {}) {
    this.host = '127.0.0.1';
    this.requestedPort = Number.isInteger(options.port) && options.port >= 0 ? options.port : 0;
    this.token =
      typeof options.token === 'string' && options.token.length >= 32
        ? options.token
        : crypto.randomBytes(32).toString('hex');
    this.sandboxSecret = crypto.randomBytes(32);
    this.sandboxTtlMs =
      Number.isFinite(Number(options.sandboxTtlMs)) && Number(options.sandboxTtlMs) > 0
        ? Math.floor(Number(options.sandboxTtlMs))
        : DEFAULT_SANDBOX_TTL_MS;
    this.version = options.version || OMNI_VERSION;
    this.execHooks = options.execHooks || null;
    this.customWorkbenchRenderer = options.renderWorkbenchHtml || null;
    this.server = null;
    this.port = 0;
    this.baseUrl = '';
    this.sockets = new Set();
    this.sandboxMounts = new Map();
    this._workbenchModPromise = null;
  }

  get running() {
    return Boolean(this.server && this.port > 0);
  }

  async start() {
    if (this.server && this.port > 0) return this.getServerInfo();

    const srv = http.createServer((req, res) => {
      void this._handleHttpRequest(req, res);
    });

    srv.on('connection', (socket) => {
      this.sockets.add(socket);
      socket.on('close', () => this.sockets.delete(socket));
    });

    await new Promise((resolve, reject) => {
      srv.once('error', reject);
      srv.listen(this.requestedPort, this.host, () => {
        srv.removeListener('error', reject);
        resolve();
      });
    });

    const addr = srv.address();
    this.server = srv;
    this.port = typeof addr === 'object' && addr ? addr.port : this.requestedPort;
    this.baseUrl = `http://127.0.0.1:${this.port}`;
    return this.getServerInfo();
  }

  async stop() {
    const srv = this.server;
    this.server = null;
    this.port = 0;
    this.baseUrl = '';
    this.sandboxMounts.clear();
    for (const sock of this.sockets) {
      try {
        sock.destroy();
      } catch {}
    }
    this.sockets.clear();
    if (srv) {
      await new Promise((resolve) => srv.close(() => resolve()));
    }
  }

  getServerInfo() {
    return {
      ok: Boolean(this.server && this.port > 0),
      baseUrl: this.baseUrl,
      token: this.token,
      port: this.port,
      pid: process.pid,
      version: this.version,
    };
  }

  _deriveSandboxToken(mountId) {
    return crypto
      .createHmac('sha256', this.sandboxSecret)
      .update(`omni-sandbox-v1:${mountId}`)
      .digest('hex');
  }

  _pruneExpiredSandboxMounts(now = Date.now()) {
    for (const [id, entry] of this.sandboxMounts.entries()) {
      if (!entry || entry.expiresAt <= now) {
        this.sandboxMounts.delete(id);
      }
    }
  }

  _registerSandboxDir(realRootDir) {
    const now = Date.now();
    this._pruneExpiredSandboxMounts(now);
    const mountId = crypto.createHash('sha256').update(realRootDir).digest('hex').slice(0, 16);
    if (this.sandboxMounts.has(mountId)) {
      this.sandboxMounts.delete(mountId);
    } else if (this.sandboxMounts.size >= MAX_SANDBOX_MOUNTS) {
      const oldestKey = this.sandboxMounts.keys().next().value;
      if (oldestKey !== undefined) this.sandboxMounts.delete(oldestKey);
    }
    this.sandboxMounts.set(mountId, { realRootDir, expiresAt: now + this.sandboxTtlMs });
    return mountId;
  }

  _resolveSandboxRoot(mountId) {
    const entry = this.sandboxMounts.get(mountId);
    if (!entry) return null;
    const now = Date.now();
    if (entry.expiresAt <= now) {
      this.sandboxMounts.delete(mountId);
      return null;
    }
    entry.expiresAt = now + this.sandboxTtlMs;
    return entry.realRootDir;
  }

  _isValidHostHeader(req) {
    const rawHost = typeof req.headers.host === 'string' ? req.headers.host.trim().toLowerCase() : '';
    if (!rawHost) return false;
    return rawHost === `127.0.0.1:${this.port}` || rawHost === '127.0.0.1';
  }

  _isTrustedLocalOrigin(origin) {
    if (typeof origin !== 'string' || !origin || origin === 'null' || /[\r\n\s]/.test(origin)) {
      return false;
    }
    const lowOrigin = origin.toLowerCase();
    if (/^(?:vscode-file|app):\/\/[a-z0-9._-]+(?:\/[^\s]*)?$/.test(lowOrigin)) {
      return true;
    }
    if (/^file:\/\/[^\s]*$/.test(lowOrigin)) {
      return true;
    }
    return /^https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d{1,5})?$/.test(lowOrigin);
  }

  _resolveCorsHeaders(req, { isSandbox = false } = {}) {
    const rawOrigin = typeof req.headers?.origin === 'string' ? req.headers.origin.trim() : '';
    const corsHeaders = { Vary: 'Origin' };
    if (!rawOrigin) {
      return corsHeaders;
    }
    if (rawOrigin === 'null') {
      if (isSandbox) {
        corsHeaders['Access-Control-Allow-Origin'] = 'null';
      }
      return corsHeaders;
    }
    if (this._isTrustedLocalOrigin(rawOrigin)) {
      corsHeaders['Access-Control-Allow-Origin'] = rawOrigin;
    }
    return corsHeaders;
  }

  _isTrustedOriginAndFetchSite(req, { isSandbox = false, isViewerOrStream = false } = {}) {
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin.trim() : '';
    let trustedLocalOrigin = false;
    if (origin && origin !== 'null') {
      if (this._isTrustedLocalOrigin(origin)) {
        trustedLocalOrigin = true;
      } else {
        return false;
      }
    }
    const fetchSite = typeof req.headers['sec-fetch-site'] === 'string' ? req.headers['sec-fetch-site'].trim().toLowerCase() : '';
    if (fetchSite === 'cross-site' && !isSandbox) {
      const fetchDest = typeof req.headers['sec-fetch-dest'] === 'string' ? req.headers['sec-fetch-dest'].trim().toLowerCase() : '';
      const fetchMode = typeof req.headers['sec-fetch-mode'] === 'string' ? req.headers['sec-fetch-mode'].trim().toLowerCase() : '';
      // 允许本地桌面宿主 (vscode-file:// / https://127.0.0.1) 通过 iframe/video/audio 嵌入 /viewer 与 /stream，拒绝跨站 API 探测
      if (isViewerOrStream && (trustedLocalOrigin || fetchMode === 'navigate' || fetchDest === 'iframe' || fetchDest === 'video' || fetchDest === 'audio' || fetchDest === 'font' || fetchDest === 'image')) {
        return true;
      }
      if (!trustedLocalOrigin) return false;
    }
    return true;
  }

  async _loadWorkbenchModule() {
    if (this.customWorkbenchRenderer) {
      return { renderWorkbenchHtml: this.customWorkbenchRenderer };
    }
    if (!this._workbenchModPromise) {
      this._workbenchModPromise = import('./workbench-page.mjs').catch(() => {
        this._workbenchModPromise = null;
        return null;
      });
    }
    return this._workbenchModPromise;
  }

  _sendJson(res, statusCode, obj, extraHeaders = {}) {
    if (res.headersSent) return;
    const body = Buffer.from(JSON.stringify(obj), 'utf8');
    res.writeHead(statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': body.length,
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    });
    res.end(body);
  }

  async _serveFileStream(req, res, absPath, { isSandbox = false } = {}) {
    let realTarget;
    let st;
    try {
      const resolved = await resolveSafeFileRealPath(absPath, { allowDir: false });
      realTarget = resolved.realTarget;
      st = resolved.stat;
    } catch (err) {
      const code = err?.statusCode || (err?.code === 'ENOENT' ? 404 : 400);
      return this._sendJson(res, code, { ok: false, error: err?.message || 'File unavailable' });
    }

    const ext = path.extname(realTarget).toLowerCase();
    const mime = MIME_BY_EXT[ext] || 'application/octet-stream';
    const baseHeaders = {
      'Content-Type': mime,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=0, must-revalidate',
      'Referrer-Policy': 'no-referrer',
      ...this._resolveCorsHeaders(req, { isSandbox }),
      'Access-Control-Expose-Headers': 'Accept-Ranges, Content-Range, Content-Length',
      'X-Content-Type-Options': 'nosniff',
    };
    if (isSandbox && (ext === '.html' || ext === '.htm')) {
      delete baseHeaders['X-Content-Type-Options'];
      baseHeaders['Content-Security-Policy'] = SANDBOX_HTML_CSP;
    } else if (ext === '.html' || ext === '.htm' || ext === '.xhtml' || ext === '.svg') {
      baseHeaders['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
    }

    const rangeInfo = parseHttpByteRange(req.headers.range, st.size);
    if (rangeInfo && rangeInfo.unsatisfiable) {
      res.writeHead(416, {
        ...baseHeaders,
        'Content-Range': `bytes */${st.size}`,
        'Content-Length': 0,
      });
      res.end();
      return;
    }

    const isHead = req.method === 'HEAD';
    if (rangeInfo) {
      res.writeHead(206, {
        ...baseHeaders,
        'Content-Range': `bytes ${rangeInfo.start}-${rangeInfo.end}/${st.size}`,
        'Content-Length': rangeInfo.length,
      });
      if (isHead) {
        res.end();
        return;
      }
      const stream = fs.createReadStream(realTarget, { start: rangeInfo.start, end: rangeInfo.end });
      const cleanup = () => {
        if (!stream.destroyed) stream.destroy();
      };
      req.once('close', cleanup);
      res.once('close', cleanup);
      stream.on('error', () => {
        cleanup();
        if (!res.headersSent) this._sendJson(res, 500, { ok: false, error: 'Stream read error' });
        else res.destroy();
      });
      stream.pipe(res);
      return;
    }

    res.writeHead(200, {
      ...baseHeaders,
      'Content-Length': st.size,
    });
    if (isHead || st.size === 0) {
      res.end();
      return;
    }
    const stream = fs.createReadStream(realTarget);
    const cleanup = () => {
      if (!stream.destroyed) stream.destroy();
    };
    req.once('close', cleanup);
    res.once('close', cleanup);
    stream.on('error', () => {
      cleanup();
      if (!res.headersSent) this._sendJson(res, 500, { ok: false, error: 'Stream read error' });
      else res.destroy();
    });
    stream.pipe(res);
  }

  async _handleHttpRequest(req, res) {
    try {
      if (!this._isValidHostHeader(req)) {
        return this._sendJson(res, 403, { ok: false, error: 'Forbidden Host header' });
      }

      const rawUrl = req.url || '/';
      const rawPathname = rawUrl.split('?')[0];
      const u = new URL(rawUrl, `http://127.0.0.1:${this.port || 80}`);
      const pathname = u.pathname;
      const isSandboxRoute = pathname.startsWith('/sandbox/');
      const isStreamOrViewer = pathname === '/stream' || pathname === '/viewer';

      if (!this._isTrustedOriginAndFetchSite(req, { isSandbox: isSandboxRoute, isViewerOrStream: isStreamOrViewer })) {
        return this._sendJson(res, 403, { ok: false, error: 'Cross-site request blocked' });
      }

      if (req.method === 'OPTIONS') {
        if (isSandboxRoute || pathname === '/stream') {
          res.writeHead(204, {
            ...this._resolveCorsHeaders(req, { isSandbox: isSandboxRoute }),
            'Access-Control-Allow-Headers': 'Range, Content-Type',
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
            'Access-Control-Max-Age': '600',
            'Referrer-Policy': 'no-referrer',
          });
          res.end();
          return;
        }
        res.writeHead(204, { 'Referrer-Policy': 'no-referrer' });
        res.end();
        return;
      }

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return this._sendJson(res, 405, { ok: false, error: 'Method not allowed' });
      }

      // 1. 单目录只读子令牌沙盒路由: /sandbox/<sandboxTok>/<mountId>/<relPath...>
      if (isSandboxRoute) {
        const rawSegs = rawPathname.slice('/sandbox/'.length).split('/');
        if (rawSegs.length < 3) {
          return this._sendJson(res, 404, { ok: false, error: 'Invalid sandbox path' });
        }
        let pathTok = '';
        let mountId = '';
        let decodedRelSegs;
        try {
          pathTok = decodeURIComponent(rawSegs[0]);
          mountId = decodeURIComponent(rawSegs[1]);
          decodedRelSegs = rawSegs.slice(2).map((s) => decodeURIComponent(s));
        } catch {
          return this._sendJson(res, 400, { ok: false, error: 'Malformed URI encoding' });
        }
        if (!/^[0-9a-f]{16}$/.test(mountId)) {
          return this._sendJson(res, 404, { ok: false, error: 'Invalid sandbox mount' });
        }
        const expectedSandboxTok = this._deriveSandboxToken(mountId);
        if (!constantTimeTokenMatch(expectedSandboxTok, pathTok)) {
          return this._sendJson(res, 401, { ok: false, error: 'Unauthorized sandbox token' });
        }
        if (decodedRelSegs.some((seg) => seg === '..' || seg.includes('\0') || seg.includes('\\'))) {
          return this._sendJson(res, 403, { ok: false, error: 'Sandbox path traversal blocked' });
        }
        const realRoot = this._resolveSandboxRoot(mountId);
        if (!realRoot) {
          return this._sendJson(res, 404, { ok: false, error: 'Sandbox mount expired or not found' });
        }
        const subRel = decodedRelSegs.filter(Boolean).join(path.sep);
        if (!subRel) {
          return this._sendJson(res, 404, { ok: false, error: 'Missing sandbox file path' });
        }
        const candidate = path.resolve(realRoot, subRel);
        const relToRoot = path.relative(realRoot, candidate);
        if (!relToRoot || relToRoot.startsWith('..') || path.isAbsolute(relToRoot)) {
          return this._sendJson(res, 403, { ok: false, error: 'Sandbox path traversal blocked' });
        }
        if (isSensitiveFilePath(candidate)) {
          return this._sendJson(res, 403, { ok: false, error: 'Access to sensitive file blocked' });
        }
        let realTarget;
        try {
          realTarget = await fs.promises.realpath(candidate);
        } catch {
          return this._sendJson(res, 404, { ok: false, error: 'Sandbox asset not found' });
        }
        if (isSensitiveFilePath(realTarget)) {
          return this._sendJson(res, 403, { ok: false, error: 'Access to sensitive file blocked' });
        }
        const realRel = path.relative(realRoot, realTarget);
        if (!realRel || realRel.startsWith('..') || path.isAbsolute(realRel)) {
          return this._sendJson(res, 403, { ok: false, error: 'Sandbox symlink escape blocked' });
        }
        return await this._serveFileStream(req, res, realTarget, { isSandbox: true });
      }

      // 2. 主鉴权令牌常量时间校验（沙盒子令牌在此 100% 拒绝）
      const headerTok = typeof req.headers['x-prism-token'] === 'string' ? req.headers['x-prism-token'].trim() : '';
      const queryTok = u.searchParams.get('token') || '';
      const providedTok = headerTok || queryTok;
      if (!constantTimeTokenMatch(this.token, providedTok)) {
        return this._sendJson(res, 401, { ok: false, error: 'Unauthorized' });
      }

      if (pathname === '/health') {
        return this._sendJson(res, 200, { ok: true, pid: process.pid, version: this.version });
      }

      if (pathname === '/meta') {
        const rawPath = u.searchParams.get('path') || '';
        const parsed = parseRawPathInput(rawPath);
        if (parsed.blockedUnc) return this._sendJson(res, 403, { ok: false, error: 'Blocked remote UNC path' });
        const absPath = parsed.cleanPath;
        if (!absPath) return this._sendJson(res, 400, { ok: false, error: 'Missing path parameter' });

        const headBytes = u.searchParams.has('headBytes')
          ? parseInt(u.searchParams.get('headBytes'), 10)
          : DEFAULT_HEAD_BYTES;
        const offset = u.searchParams.has('offset') ? parseInt(u.searchParams.get('offset'), 10) : 0;

        let sliceRes;
        try {
          sliceRes = await readSafeFileSlice(absPath, offset, headBytes);
        } catch (err) {
          const code = err?.statusCode || (err?.code === 'ENOENT' ? 404 : 400);
          return this._sendJson(res, code, { ok: false, error: err?.message || 'Unable to read file metadata' });
        }

        const ext = path.extname(absPath).toLowerCase();
        const previewKind = detectPreviewKind(absPath, MIME_BY_EXT[ext] || '');
        const forceBinary =
          previewKind === 'video' || previewKind === 'audio' || previewKind === 'pdf' || previewKind === 'font' ||
          (previewKind === 'image' && ext !== '.svg');
        const isBinary = forceBinary || sliceRes.hasNullByte;
        const mime = lookupMimeType(absPath, isBinary);

        const payload = {
          ok: true,
          path: absPath,
          name: path.basename(absPath),
          ext,
          size: sliceRes.stat.size,
          mtimeMs: sliceRes.stat.mtimeMs,
          mime,
          isBinary,
          previewKind,
        };
        if (!isBinary) {
          payload.textSlice = sliceRes.buffer.toString('utf8');
          payload.truncated = sliceRes.truncated;
          payload.nextOffset = sliceRes.nextOffset;
        }
        return this._sendJson(res, 200, payload);
      }

      if (pathname === '/stream') {
        const rawPath = u.searchParams.get('path') || '';
        const parsed = parseRawPathInput(rawPath);
        if (parsed.blockedUnc) return this._sendJson(res, 403, { ok: false, error: 'Blocked remote UNC path' });
        const absPath = parsed.cleanPath;
        if (!absPath) return this._sendJson(res, 400, { ok: false, error: 'Missing path parameter' });
        return await this._serveFileStream(req, res, absPath, { isSandbox: false });
      }

      if (pathname === '/sandbox-init') {
        const rawPath = u.searchParams.get('path') || '';
        const parsed = parseRawPathInput(rawPath);
        if (parsed.blockedUnc) return this._sendJson(res, 403, { ok: false, error: 'Blocked remote UNC path' });
        const absPath = parsed.cleanPath;
        if (!absPath) return this._sendJson(res, 400, { ok: false, error: 'Missing path parameter' });

        let realHtmlPath;
        try {
          const resolved = await resolveSafeFileRealPath(absPath, { allowDir: false });
          realHtmlPath = resolved.realTarget;
        } catch (err) {
          const code = err?.statusCode || (err?.code === 'ENOENT' ? 404 : 400);
          return this._sendJson(res, code, { ok: false, error: err?.message || 'HTML file unavailable' });
        }

        const realRootDir = path.dirname(realHtmlPath);
        const fileName = path.basename(realHtmlPath);
        const mountId = this._registerSandboxDir(realRootDir);
        const sandboxTok = this._deriveSandboxToken(mountId);
        const sandboxUrl = `${this.baseUrl}/sandbox/${sandboxTok}/${mountId}/${encodeURIComponent(fileName)}`;
        return this._sendJson(res, 200, {
          ok: true,
          mountId,
          fileName,
          url: sandboxUrl,
          sandboxUrl,
        });
      }

      if (pathname === '/viewer') {
        const rawPath = u.searchParams.get('path') || '';
        const reqKind = (u.searchParams.get('kind') || 'auto').trim().toLowerCase();
        const parsed = rawPath ? parseRawPathInput(rawPath) : { cleanPath: '', blockedUnc: false };
        if (parsed.blockedUnc) {
          return this._sendJson(res, 403, { ok: false, error: 'Blocked remote UNC path' });
        }
        const absPath = parsed.cleanPath;

        let st = null;
        let realTargetPath = '';
        if (absPath) {
          try {
            const resolved = await resolveSafeFileRealPath(absPath, { allowDir: false });
            realTargetPath = resolved.realTarget;
            st = resolved.stat;
          } catch (err) {
            if (err?.statusCode === 403) {
              return this._sendJson(res, 403, { ok: false, error: err.message });
            }
            st = null;
          }
          if (!st && reqKind !== 'mermaid') {
            return this._sendJson(res, 404, { ok: false, error: 'Target file not found' });
          }
        } else if (reqKind !== 'mermaid') {
          return this._sendJson(res, 400, { ok: false, error: 'Missing path parameter' });
        }

        const wbMod = await this._loadWorkbenchModule();
        const mime = absPath ? lookupMimeType(absPath, false) : 'text/plain; charset=utf-8';
        let resolvedKind = reqKind;
        if (!resolvedKind || resolvedKind === 'auto') {
          if (wbMod && typeof wbMod.detectWorkbenchKind === 'function') {
            resolvedKind = wbMod.detectWorkbenchKind(absPath, mime) || detectPreviewKind(absPath, mime);
          } else {
            resolvedKind = detectPreviewKind(absPath, mime);
          }
        }

        let sandboxUrl = '';
        if (resolvedKind === 'html' && realTargetPath && st) {
          const mountId = this._registerSandboxDir(path.dirname(realTargetPath));
          const sandboxTok = this._deriveSandboxToken(mountId);
          sandboxUrl = `${this.baseUrl}/sandbox/${sandboxTok}/${mountId}/${encodeURIComponent(path.basename(realTargetPath))}`;
        }

        const theme = u.searchParams.get('theme') === 'light' ? 'light' : 'dark';
        const rawPal = u.searchParams.get('palette') || 'obsidian';
        const palette = rawPal === 'warm' || rawPal === 'host' ? rawPal : 'obsidian';
        const lightPreset = u.searchParams.get('lightPreset') === 'alabaster' ? 'alabaster' : 'crystal';
        const rawAccent = u.searchParams.get('accent') || 'follow';
        const accent = ['follow', 'cobalt', 'iris', 'amber', 'mono'].includes(rawAccent) ? rawAccent : 'follow';
        const rawCorners = u.searchParams.get('corners') || 'balanced';
        const corners = ['sharp', 'balanced', 'soft'].includes(rawCorners) ? rawCorners : 'balanced';
        const rawLang = u.searchParams.get('lang') || 'zh-CN';
        const lang = SUPPORTED_VIEWER_LANGS.includes(rawLang) ? rawLang : 'zh-CN';

        const ctx = {
          baseUrl: this.baseUrl,
          port: this.port,
          token: this.token,
          path: absPath,
          filePath: absPath,
          name: absPath ? path.basename(absPath) : u.searchParams.get('name') || 'Mermaid Diagram',
          fileName: absPath ? path.basename(absPath) : u.searchParams.get('name') || 'Mermaid Diagram',
          ext: absPath ? path.extname(absPath).toLowerCase() : '',
          size: st ? st.size : 0,
          mtimeMs: st ? st.mtimeMs : 0,
          mime,
          kind: resolvedKind,
          previewKind: resolvedKind,
          streamUrl: absPath
            ? `${this.baseUrl}/stream?token=${encodeURIComponent(this.token)}&path=${encodeURIComponent(absPath)}`
            : '',
          metaUrl: absPath
            ? `${this.baseUrl}/meta?token=${encodeURIComponent(this.token)}&path=${encodeURIComponent(absPath)}`
            : '',
          sandboxInitUrl: absPath
            ? `${this.baseUrl}/sandbox-init?token=${encodeURIComponent(this.token)}&path=${encodeURIComponent(absPath)}`
            : '',
          sandboxUrl,
          theme,
          palette,
          lightPreset,
          accent,
          accentTone: accent,
          corners,
          cornerStyle: corners,
          lang,
          language: lang,
          version: this.version,
        };

        const html =
          wbMod && typeof wbMod.renderWorkbenchHtml === 'function'
            ? await wbMod.renderWorkbenchHtml(ctx)
            : buildFallbackViewerHtml(ctx);
        const bodyBuf = Buffer.from(String(html || ''), 'utf8');
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Length': bodyBuf.length,
          'Cache-Control': 'no-store',
          'Referrer-Policy': 'no-referrer',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': VIEWER_CSP,
        });
        if (req.method === 'HEAD') res.end();
        else res.end(bodyBuf);
        return;
      }

      return this._sendJson(res, 404, { ok: false, error: 'Route not found' });
    } catch (err) {
      if (!res.headersSent) {
        this._sendJson(res, 500, { ok: false, error: err?.message || 'Internal server error' });
      } else {
        res.destroy();
      }
    }
  }

  // ── CDP Binding RPC Dispatcher (`__agPrismOmniCall`) ──────────────────────
  async handleRpcAction(action, rawParams = {}) {
    const act = String(action || rawParams?.action || 'getServerInfo').trim();
    if (act === 'getServerInfo') {
      await this.start();
      return this.getServerInfo();
    }

    if (act === 'resolvePath') {
      const parsed = parseRawPathInput(rawParams.rawPath ?? rawParams.path ?? '', rawParams.workspaceHint || '');
      if (parsed.blockedUnc) {
        return {
          ok: false,
          blockedUnc: true,
          error: 'Blocked remote UNC path',
          exists: false,
          path: '',
          absPath: '',
          relPath: '',
          line: null,
          endLine: null,
          col: null,
          lineStart: null,
          lineEnd: null,
          isDir: false,
          size: 0,
          ext: '',
        };
      }
      if (!parsed.cleanPath) {
        return {
          ok: false,
          exists: false,
          path: '',
          absPath: '',
          relPath: '',
          line: null,
          endLine: null,
          col: null,
          lineStart: null,
          lineEnd: null,
          isDir: false,
          size: 0,
          ext: '',
        };
      }
      let isSens = isSensitiveFilePath(parsed.cleanPath);
      let st = null;
      try {
        st = await fs.promises.stat(parsed.cleanPath);
        if (st && !isSens) {
          const realP = await fs.promises.realpath(parsed.cleanPath).catch(() => '');
          if (realP && (isSensitiveFilePath(realP) || isBlockedUncPath(realP))) {
            isSens = true;
          }
        }
      } catch {
        st = null;
      }
      const exists = Boolean(st);
      const isDir = Boolean(st && st.isDirectory());
      const size = st && st.isFile() ? st.size : 0;
      const ext = isDir ? '' : path.extname(parsed.cleanPath).toLowerCase();
      return {
        ok: true,
        exists,
        path: parsed.cleanPath,
        absPath: parsed.cleanPath,
        relPath: parsed.relPath || path.basename(parsed.cleanPath),
        name: path.basename(parsed.cleanPath),
        line: parsed.lineStart,
        endLine: parsed.lineEnd,
        col: parsed.col ?? null,
        lineStart: parsed.lineStart,
        lineEnd: parsed.lineEnd,
        isDir,
        size,
        ext,
        previewKind: isDir ? 'directory' : detectPreviewKind(parsed.cleanPath),
        isSensitive: isSens,
      };
    }

    if (act === 'revealInFolder') {
      const parsed = parseRawPathInput(rawParams.path ?? rawParams.rawPath ?? '', rawParams.workspaceHint || '');
      if (parsed.blockedUnc) return { ok: false, error: 'Blocked remote UNC path' };
      if (!parsed.cleanPath) return { ok: false, error: 'Invalid path' };
      let realTarget;
      let st;
      try {
        realTarget = await fs.promises.realpath(parsed.cleanPath);
        if (isBlockedUncPath(realTarget)) return { ok: false, error: 'Blocked remote UNC target' };
        st = await fs.promises.stat(realTarget);
      } catch {
        return { ok: false, error: 'Target path does not exist' };
      }
      const absPath = parsed.cleanPath;
      const isDir = st.isDirectory();
      if (this.execHooks && typeof this.execHooks.revealInFolder === 'function') {
        await this.execHooks.revealInFolder(absPath, { isDir });
        return { ok: true, absPath, isDir };
      }
      if (process.platform === 'win32') {
        const winPath = realTarget.replace(/\//g, '\\');
        const args = isDir ? [winPath] : [`/select,${winPath}`];
        const child = spawn('explorer.exe', args, { detached: true, stdio: 'ignore', windowsHide: false });
        child.on('error', () => {});
        child.unref();
      } else if (process.platform === 'darwin') {
        const args = isDir ? [realTarget] : ['-R', realTarget];
        const child = spawn('open', args, { detached: true, stdio: 'ignore' });
        child.on('error', () => {});
        child.unref();
      } else {
        const targetDir = isDir ? realTarget : path.dirname(realTarget);
        const child = spawn('xdg-open', [targetDir], { detached: true, stdio: 'ignore' });
        child.on('error', () => {});
        child.unref();
      }
      return { ok: true, absPath, isDir };
    }

    if (act === 'openExternal') {
      const rawTarget = String(rawParams.target ?? rawParams.url ?? rawParams.path ?? '').trim();
      if (!rawTarget || /[\x00-\x1f\x7f]/.test(rawTarget)) {
        return { ok: false, blocked: true, error: 'Invalid or unsafe target' };
      }
      if (isBlockedUncPath(rawTarget)) {
        return { ok: false, blocked: true, error: 'Blocked remote UNC path' };
      }

      // 分支 A: 网页或邮件协议白名单 (http / https / mailto)
      if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(rawTarget) && !/^[A-Za-z]:[\\/]/.test(rawTarget) && !/^file:\/\//i.test(rawTarget)) {
        let parsedUrl;
        try {
          parsedUrl = new URL(rawTarget);
        } catch {
          return { ok: false, blocked: true, error: 'Malformed URL' };
        }
        const proto = parsedUrl.protocol.toLowerCase();
        if (proto !== 'http:' && proto !== 'https:' && proto !== 'mailto:') {
          return { ok: false, blocked: true, error: `Blocked unsafe protocol: ${proto}` };
        }
        const safeHref = parsedUrl.href;
        if (this.execHooks && typeof this.execHooks.openExternal === 'function') {
          await this.execHooks.openExternal(safeHref, { kind: 'url' });
          return { ok: true, target: safeHref, kind: 'url' };
        }
        if (process.platform === 'win32') {
          const child = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', safeHref], {
            detached: true,
            stdio: 'ignore',
            windowsHide: true,
          });
          child.on('error', () => {});
          child.unref();
        } else if (process.platform === 'darwin') {
          const child = spawn('open', [safeHref], { detached: true, stdio: 'ignore' });
          child.on('error', () => {});
          child.unref();
        } else {
          const child = spawn('xdg-open', [safeHref], { detached: true, stdio: 'ignore' });
          child.on('error', () => {});
          child.unref();
        }
        return { ok: true, target: safeHref, kind: 'url' };
      }

      // 分支 B: 已存在且非敏感、非可执行脚本/快捷方式的本地文件（经 realpath 双重校验）
      const parsed = parseRawPathInput(rawTarget, rawParams.workspaceHint || '');
      if (parsed.blockedUnc) return { ok: false, blocked: true, error: 'Blocked remote UNC path' };
      if (!parsed.cleanPath) return { ok: false, error: 'Invalid file path' };
      if (isSensitiveFilePath(parsed.cleanPath)) {
        return { ok: false, blocked: true, error: 'Blocked sensitive file' };
      }
      const lexExt = path.extname(parsed.cleanPath).toLowerCase();
      if (BLOCKED_EXTERNAL_EXEC_EXTS.has(lexExt)) {
        return { ok: false, blocked: true, error: `Blocked executable extension: ${lexExt}` };
      }
      let realTarget;
      let st;
      try {
        const resolved = await resolveSafeFileRealPath(parsed.cleanPath, { allowDir: true });
        realTarget = resolved.realTarget;
        st = resolved.stat;
      } catch (err) {
        return { ok: false, blocked: /blocked|sensitive|unc/i.test(String(err?.message || '')), error: err?.message || 'Target file does not exist' };
      }
      const realExt = path.extname(realTarget).toLowerCase();
      if (BLOCKED_EXTERNAL_EXEC_EXTS.has(realExt)) {
        return { ok: false, blocked: true, error: `Blocked executable target extension: ${realExt}` };
      }
      if (!st.isFile() && !st.isDirectory()) {
        return { ok: false, error: 'Unsupported target type' };
      }
      if (this.execHooks && typeof this.execHooks.openExternal === 'function') {
        await this.execHooks.openExternal(realTarget, { kind: 'file' });
        return { ok: true, target: realTarget, kind: 'file' };
      }
      if (process.platform === 'win32') {
        const winPath = realTarget.replace(/\//g, '\\');
        const child = spawn('explorer.exe', [winPath], { detached: true, stdio: 'ignore', windowsHide: false });
        child.on('error', () => {});
        child.unref();
      } else if (process.platform === 'darwin') {
        const child = spawn('open', [realTarget], { detached: true, stdio: 'ignore' });
        child.on('error', () => {});
        child.unref();
      } else {
        const child = spawn('xdg-open', [realTarget], { detached: true, stdio: 'ignore' });
        child.on('error', () => {});
        child.unref();
      }
      return { ok: true, target: realTarget, kind: 'file' };
    }

    if (act === 'readTextSlice') {
      const parsed = parseRawPathInput(rawParams.path ?? rawParams.rawPath ?? '', rawParams.workspaceHint || '');
      if (parsed.blockedUnc) return { ok: false, status: 403, error: 'Blocked remote UNC path' };
      if (!parsed.cleanPath) return { ok: false, error: 'Missing path' };
      try {
        const res = await readSafeFileSlice(parsed.cleanPath, rawParams.offset || 0, rawParams.maxBytes || DEFAULT_HEAD_BYTES);
        const text = res.buffer.toString('utf8');
        return {
          ok: true,
          path: parsed.cleanPath,
          size: res.stat.size,
          text,
          textSlice: text,
          truncated: res.truncated,
          nextOffset: res.nextOffset,
        };
      } catch (err) {
        return { ok: false, status: err?.statusCode || 400, error: err?.message || 'Failed to read text slice' };
      }
    }

    return { ok: false, error: `Unknown Omni RPC action: ${act}` };
  }
}

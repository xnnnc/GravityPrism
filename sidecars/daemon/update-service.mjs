// Obsidian Prism Auto-Update Service (sidecars/daemon/update-service.mjs)
// Pure Node >= 22 built-ins; all network traffic stays in the sidecar daemon.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

export const GITHUB_REPO = 'xnnnc/GravityPrism';
export const LATEST_RELEASE_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
export const RELEASES_LIST_API = `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=15`;
export const RELEASES_PAGE_URL = `https://github.com/${GITHUB_REPO}/releases`;

export function normalizeUpdateChannel(raw) {
  return raw === 'beta' ? 'beta' : 'stable';
}

export const CHECK_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
export const MANUAL_COOLDOWN_MS = 10_000; // 10 seconds
export const MAX_ASSET_BYTES = 64 * 1024 * 1024; // 64 MiB
export const MAX_REDIRECTS = 5;

export const TRUSTED_RELEASE_HOSTS = Object.freeze([
  'github.com',
  'api.github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
  'github-releases.githubusercontent.com',
]);

const TRUSTED_HOST_SET = new Set(TRUSTED_RELEASE_HOSTS);
const SEMVER_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;
const SHA256_LINE_RE = /^([0-9a-fA-F]{64})\s+[* ]?(.+)$/;
const DIGEST_SHA256_RE = /^sha256:([0-9a-fA-F]{64})$/i;

export function parseSemver(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  const m = SEMVER_RE.exec(trimmed);
  if (!m) return null;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  const patch = Number(m[3]);
  if (!Number.isSafeInteger(major) || !Number.isSafeInteger(minor) || !Number.isSafeInteger(patch)) {
    return null;
  }
  const pre = m[4] ? m[4].split('.').filter(Boolean) : [];
  if (m[4] && pre.length === 0) return null;
  return { major, minor, patch, pre };
}

function comparePrereleaseId(a, b) {
  const aNum = /^\d+$/.test(a);
  const bNum = /^\d+$/.test(b);
  if (aNum && bNum) {
    const na = Number(a);
    const nb = Number(b);
    return na < nb ? -1 : na > nb ? 1 : 0;
  }
  if (aNum && !bNum) return -1; // numeric < non-numeric per SemVer 2.0.0
  if (!aNum && bNum) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

export function compareSemver(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return 0;

  if (pa.major !== pb.major) return pa.major > pb.major ? 1 : -1;
  if (pa.minor !== pb.minor) return pa.minor > pb.minor ? 1 : -1;
  if (pa.patch !== pb.patch) return pa.patch > pb.patch ? 1 : -1;

  const aHasPre = pa.pre.length > 0;
  const bHasPre = pb.pre.length > 0;
  if (!aHasPre && !bHasPre) return 0;
  if (!aHasPre && bHasPre) return 1;
  if (aHasPre && !bHasPre) return -1;

  const len = Math.max(pa.pre.length, pb.pre.length);
  for (let i = 0; i < len; i++) {
    if (i >= pa.pre.length) return -1;
    if (i >= pb.pre.length) return 1;
    const cmp = comparePrereleaseId(pa.pre[i], pb.pre[i]);
    if (cmp !== 0) return cmp;
  }
  return 0;
}

export function isTrustedReleaseAssetUrl(rawUrl) {
  if (typeof rawUrl !== 'string') return false;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 4096) return false;
  let u;
  try {
    u = new URL(trimmed);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  if (u.username || u.password) return false;
  if (u.port && u.port !== '443') return false;
  const host = u.hostname.toLowerCase();
  return TRUSTED_HOST_SET.has(host);
}

export function isTrustedSelectedAssetUrl(rawUrl) {
  if (!isTrustedReleaseAssetUrl(rawUrl)) return false;
  try {
    const u = new URL(rawUrl.trim());
    if (u.hostname.toLowerCase() === 'github.com') {
      return u.pathname.toLowerCase().startsWith(`/${GITHUB_REPO.toLowerCase()}/releases/`);
    }
    return true;
  } catch {
    return false;
  }
}

export function parseSha256Sums(text) {
  const map = new Map();
  if (typeof text !== 'string' || !text) return map;
  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const m = SHA256_LINE_RE.exec(line);
    if (!m) continue;
    const hex = m[1].toLowerCase();
    let filePart = m[2].trim();
    if (filePart.startsWith('./') || filePart.startsWith('.\\')) {
      filePart = filePart.slice(2);
    }
    const baseName = filePart.split(/[\\/]/).filter(Boolean).pop();
    if (baseName) {
      map.set(baseName, hex);
    }
  }
  return map;
}

function getHeaderValue(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') {
    return String(headers.get(name) || '');
  }
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) return String(v || '');
  }
  return '';
}

async function readResponseBufferWithLimit(res, maxBytes) {
  const clRaw = getHeaderValue(res.headers, 'content-length');
  if (clRaw) {
    const cl = Number(clRaw);
    if (Number.isFinite(cl) && cl > maxBytes) {
      throw new Error('asset_too_large');
    }
  }
  if (res.body && typeof res.body.getReader === 'function') {
    const reader = res.body.getReader();
    const chunks = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const buf = Buffer.from(value);
        total += buf.byteLength;
        if (total > maxBytes) {
          try { await reader.cancel(); } catch {}
          throw new Error('asset_too_large');
        }
        chunks.push(buf);
      }
    } finally {
      try { reader.releaseLock(); } catch {}
    }
    return Buffer.concat(chunks, total);
  }
  if (typeof res.arrayBuffer === 'function') {
    const ab = await res.arrayBuffer();
    const buf = Buffer.from(ab);
    if (buf.byteLength > maxBytes) {
      throw new Error('asset_too_large');
    }
    return buf;
  }
  if (typeof res.text === 'function') {
    const txt = await res.text();
    const buf = Buffer.from(txt, 'utf8');
    if (buf.byteLength > maxBytes) {
      throw new Error('asset_too_large');
    }
    return buf;
  }
  throw new Error('unsupported_response_body');
}

function normalizeVersionStr(v) {
  return String(v || '').trim().replace(/^v/i, '');
}

export class UpdateService {
  constructor({
    fetchFn = globalThis.fetch,
    spawnFn = spawn,
    platform = process.platform,
    currentVersion = '1.2.4',
    channel = 'stable',
    checkTtlMs = CHECK_TTL_MS,
    manualCooldownMs = MANUAL_COOLDOWN_MS,
    tmpRoot = os.tmpdir(),
    maxAssetBytes = MAX_ASSET_BYTES,
    lstatSyncFn = fs.lstatSync,
    nowFn = Date.now,
  } = {}) {
    this.fetchFn = fetchFn;
    this.spawnFn = spawnFn;
    this.platform = platform;
    this.currentVersion = normalizeVersionStr(currentVersion) || '1.2.4';
    this.channel = normalizeUpdateChannel(channel);
    this.checkTtlMs = Math.max(0, Number(checkTtlMs) || 0);
    this.manualCooldownMs = Math.max(0, Number(manualCooldownMs) || 0);
    this.tmpRoot = tmpRoot || os.tmpdir();
    this.maxAssetBytes = Math.max(1024, Number(maxAssetBytes) || MAX_ASSET_BYTES);
    this.lstatSyncFn = typeof lstatSyncFn === 'function' ? lstatSyncFn : fs.lstatSync;
    this.nowFn = typeof nowFn === 'function' ? nowFn : Date.now;

    this._lastCheckAt = 0;
    this._lastManualCheckAt = 0;
    this._lastCheckResult = null;
    this._lastRelease = null;
    this._checkInFlight = null;
    this._inFlightChannel = null;
    this._applyInFlight = null;
    this._failedAutoTags = new Set();
    this._lastError = null;
    this.applying = false;
  }

  setChannel(nextChannel) {
    const norm = normalizeUpdateChannel(nextChannel);
    if (norm === this.channel) return false;
    this.channel = norm;
    this._lastCheckAt = 0;
    this._lastManualCheckAt = 0;
    this._lastCheckResult = null;
    this._lastRelease = null;
    this._lastError = null;
    return true;
  }

  async _trustedFetch(rawUrl, opts = {}, redirectCount = 0) {
    if (typeof this.fetchFn !== 'function') {
      throw new Error('fetch_unavailable');
    }
    if (!isTrustedReleaseAssetUrl(rawUrl)) {
      throw new Error('untrusted_release_url');
    }
    const signal = opts.signal || (typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(opts.timeoutMs || 20_000) : undefined);
    const res = await this.fetchFn(rawUrl, {
      ...opts,
      ...(signal ? { signal } : {}),
      redirect: 'manual',
    });
    const status = Number(res?.status || 0);
    if (status === 301 || status === 302 || status === 303 || status === 307 || status === 308) {
      try { await res.body?.cancel?.(); } catch {}
      if (redirectCount >= MAX_REDIRECTS) {
        throw new Error('too_many_redirects');
      }
      const loc = getHeaderValue(res.headers, 'location').trim();
      if (!loc) {
        throw new Error('redirect_without_location');
      }
      let nextUrl;
      try {
        nextUrl = new URL(loc, rawUrl).toString();
      } catch {
        throw new Error('untrusted_redirect_url');
      }
      if (!isTrustedReleaseAssetUrl(nextUrl)) {
        throw new Error('untrusted_redirect_url');
      }
      return this._trustedFetch(nextUrl, opts, redirectCount + 1);
    }
    return res;
  }

  _selectReleaseAssets(rel) {
    const assets = Array.isArray(rel?.assets) ? rel.assets : [];
    const winAsset =
      assets.find((a) => String(a?.name || '').toLowerCase() === 'gravity-prism-installer.exe') || null;
    const macAsset =
      assets.find((a) => String(a?.name || '') === 'Obsidian-Prism-macOS-universal.dmg') ||
      assets.find((a) => /\.dmg$/i.test(String(a?.name || ''))) ||
      null;
    const linuxAsset =
      assets.find((a) => String(a?.name || '').toLowerCase() === 'obsidian-prism-linux-portable.tar.gz') ||
      assets.find((a) => /linux.*\.tar\.gz$/i.test(String(a?.name || ''))) ||
      null;
    const rawShaAsset = assets.find((a) => String(a?.name || '') === 'SHA256SUMS.txt') || null;
    const shaAsset =
      rawShaAsset && isTrustedSelectedAssetUrl(rawShaAsset.browser_download_url)
        ? rawShaAsset
        : null;

    const targetAsset =
      this.platform === 'win32'
        ? winAsset
        : this.platform === 'darwin'
          ? macAsset
          : this.platform === 'linux'
            ? linuxAsset
            : null;
    const mode = this.platform === 'win32' ? 'installer' : 'manual';
    const hotReloadCapable = this.platform === 'win32';
    const manualRequired = this.platform !== 'win32';

    let assetDigestSha256 = null;
    const m = DIGEST_SHA256_RE.exec(String(targetAsset?.digest || '').trim());
    if (m) assetDigestSha256 = m[1].toLowerCase();

    const downloadUrl =
      targetAsset && isTrustedSelectedAssetUrl(targetAsset.browser_download_url)
        ? targetAsset.browser_download_url
        : null;
    const releaseUrl = isTrustedSelectedAssetUrl(rel?.html_url) ? rel.html_url : RELEASES_PAGE_URL;

    return {
      targetAsset,
      shaAsset,
      assetDigestSha256,
      downloadUrl,
      releaseUrl,
      mode,
      hotReloadCapable,
      manualRequired,
    };
  }

  async _cleanupStaleTempDirs() {
    try {
      const rootStat = this.lstatSyncFn(this.tmpRoot);
      if (
        !rootStat ||
        (typeof rootStat.isSymbolicLink === 'function' && rootStat.isSymbolicLink()) ||
        (typeof rootStat.isDirectory === 'function' && !rootStat.isDirectory())
      ) {
        return 0;
      }
      const entries = await fs.promises.readdir(this.tmpRoot, { withFileTypes: true });
      const cutoffMs = this.nowFn() - 60 * 60 * 1000;
      let removed = 0;
      for (const ent of entries) {
        if (!ent || !String(ent.name || '').startsWith('ag-prism-upd-')) continue;
        if (typeof ent.isSymbolicLink === 'function' && ent.isSymbolicLink()) continue;
        if (typeof ent.isDirectory === 'function' && !ent.isDirectory()) continue;
        const full = path.join(this.tmpRoot, ent.name);
        try {
          const st = this.lstatSyncFn(full);
          if (!st || (typeof st.isSymbolicLink === 'function' && st.isSymbolicLink())) continue;
          if (typeof st.isDirectory === 'function' && !st.isDirectory()) continue;
          if (Number.isFinite(st.mtimeMs) && st.mtimeMs < cutoffMs) {
            await fs.promises.rm(full, { recursive: true, force: true });
            removed += 1;
          }
        } catch {}
      }
      return removed;
    } catch {
      return 0;
    }
  }

  _pickBestBetaOrStableRelease(rawList) {
    const list = Array.isArray(rawList) ? rawList : rawList && typeof rawList === 'object' ? [rawList] : [];
    let best = null;
    let bestTag = '';
    for (const rel of list) {
      if (!rel || typeof rel !== 'object' || rel.draft === true) continue;
      const tag = String(rel.tag_name || '').trim();
      if (!tag || !parseSemver(tag)) continue;
      if (!best || compareSemver(tag, bestTag) > 0) {
        best = rel;
        bestTag = tag;
      }
    }
    return best;
  }

  getStatus() {
    if (this._lastCheckResult && this._lastCheckResult.channel === this.channel) {
      return {
        ...this._lastCheckResult,
        channel: this.channel,
        isPrerelease: Boolean(this._lastCheckResult.isPrerelease),
        applying: this.applying,
        lastError: this._lastError,
      };
    }
    return {
      ok: true,
      channel: this.channel,
      isPrerelease: false,
      currentVersion: this.currentVersion,
      latestVersion: this.currentVersion,
      latestTag: null,
      hasUpdate: false,
      mode: this.platform === 'win32' ? 'installer' : 'manual',
      hotReloadCapable: this.platform === 'win32',
      manualRequired: this.platform !== 'win32',
      releaseUrl: RELEASES_PAGE_URL,
      downloadUrl: null,
      checkedAt: null,
      applying: this.applying,
      lastError: this._lastError,
    };
  }

  async checkForUpdates({ force = false, manual = false, channel = null } = {}) {
    if (channel !== null && channel !== undefined) {
      this.setChannel(channel);
    }
    const targetChannel = this.channel;
    if (this._checkInFlight && this._inFlightChannel === targetChannel) {
      return this._checkInFlight;
    }

    const now = this.nowFn();
    if (
      !force &&
      this._lastCheckResult &&
      this._lastCheckResult.channel === targetChannel &&
      this._lastCheckAt > 0 &&
      now - this._lastCheckAt < this.checkTtlMs
    ) {
      return {
        ...this._lastCheckResult,
        channel: targetChannel,
        isPrerelease: Boolean(this._lastCheckResult.isPrerelease),
        cached: true,
        applying: this.applying,
        lastError: this._lastError,
      };
    }

    if (
      manual &&
      this._lastCheckResult &&
      this._lastCheckResult.channel === targetChannel &&
      this._lastManualCheckAt > 0 &&
      now - this._lastManualCheckAt < this.manualCooldownMs
    ) {
      return {
        ...this._lastCheckResult,
        channel: targetChannel,
        isPrerelease: Boolean(this._lastCheckResult.isPrerelease),
        cached: true,
        throttled: true,
        applying: this.applying,
        lastError: this._lastError,
      };
    }

    const run = async () => {
      void this._cleanupStaleTempDirs().catch(() => {});
      try {
        const apiUrl = targetChannel === 'beta' ? RELEASES_LIST_API : LATEST_RELEASE_API;
        const res = await this._trustedFetch(apiUrl, {
          headers: {
            Accept: 'application/vnd.github+json',
            'User-Agent': 'Obsidian-Prism-Updater',
          },
          timeoutMs: 15_000,
        });
        if (!res.ok) {
          const errCode = `http_${res.status}`;
          if (this.channel === targetChannel) this._lastError = errCode;
          return {
            ...this.getStatus(),
            channel: targetChannel,
            ok: false,
            error: errCode,
            lastError: errCode,
            checkedAt: this.nowFn(),
          };
        }
        const payload = await res.json();
        const checkedAt = this.nowFn();

        let rel = null;
        if (targetChannel === 'beta') {
          rel = this._pickBestBetaOrStableRelease(payload);
          if (!rel) {
            const emptyBetaRes = {
              ok: true,
              channel: targetChannel,
              isPrerelease: false,
              currentVersion: this.currentVersion,
              latestVersion: this.currentVersion,
              latestTag: null,
              hasUpdate: false,
              mode: this.platform === 'win32' ? 'installer' : 'manual',
              hotReloadCapable: this.platform === 'win32',
              manualRequired: this.platform !== 'win32',
              releaseUrl: RELEASES_PAGE_URL,
              downloadUrl: null,
              checkedAt,
              applying: this.applying,
              lastError: null,
            };
            if (this.channel === targetChannel) {
              this._lastError = null;
              this._lastRelease = null;
              this._lastCheckAt = checkedAt;
              if (manual) this._lastManualCheckAt = checkedAt;
              this._lastCheckResult = emptyBetaRes;
            }
            return emptyBetaRes;
          }
        } else {
          rel = payload;
          if (rel?.draft === true || rel?.prerelease === true) {
            const skippedRes = {
              ok: true,
              channel: targetChannel,
              isPrerelease: false,
              currentVersion: this.currentVersion,
              latestVersion: this.currentVersion,
              latestTag: null,
              hasUpdate: false,
              skippedPrerelease: true,
              mode: this.platform === 'win32' ? 'installer' : 'manual',
              hotReloadCapable: this.platform === 'win32',
              manualRequired: this.platform !== 'win32',
              releaseUrl: RELEASES_PAGE_URL,
              downloadUrl: null,
              checkedAt,
              applying: this.applying,
              lastError: null,
            };
            if (this.channel === targetChannel) {
              this._lastError = null;
              this._lastRelease = null;
              this._lastCheckAt = checkedAt;
              if (manual) this._lastManualCheckAt = checkedAt;
              this._lastCheckResult = skippedRes;
            }
            return skippedRes;
          }
        }

        const latestTag = String(rel?.tag_name || '').trim();
        const latestVersion = normalizeVersionStr(latestTag) || this.currentVersion;
        const parsedLatest = parseSemver(latestTag);
        const isPrerelease = Boolean(rel?.prerelease === true || (parsedLatest && parsedLatest.pre.length > 0));
        // Gentle channel switch: compareSemver > 0 ensures switching beta -> stable never forces a downgrade
        const hasUpdate = Boolean(latestTag && compareSemver(latestTag, this.currentVersion) > 0);
        const sel = this._selectReleaseAssets(rel);

        const out = {
          ok: true,
          channel: targetChannel,
          isPrerelease,
          currentVersion: this.currentVersion,
          latestVersion,
          latestTag: latestTag || null,
          hasUpdate,
          mode: sel.mode,
          hotReloadCapable: sel.hotReloadCapable,
          manualRequired: sel.manualRequired,
          releaseUrl: sel.releaseUrl,
          downloadUrl: sel.downloadUrl,
          assetName: sel.targetAsset?.name || null,
          expectedSha256: sel.assetDigestSha256,
          checkedAt,
          applying: this.applying,
          lastError: null,
        };
        if (this.channel === targetChannel) {
          this._lastError = null;
          this._lastRelease = rel;
          this._lastCheckAt = checkedAt;
          if (manual) this._lastManualCheckAt = checkedAt;
          this._lastCheckResult = out;
        }
        return out;
      } catch (err) {
        const msg = String(err?.message || err || 'check_failed');
        if (this.channel === targetChannel) this._lastError = msg;
        return {
          ...this.getStatus(),
          channel: targetChannel,
          ok: false,
          error: msg,
          lastError: msg,
          checkedAt: this.nowFn(),
        };
      } finally {
        if (this._checkInFlight === p) {
          this._checkInFlight = null;
          this._inFlightChannel = null;
        }
      }
    };

    const p = run();
    this._checkInFlight = p;
    this._inFlightChannel = targetChannel;
    return p;
  }

  async _resolveExpectedSha256(sel) {
    if (sel.assetDigestSha256) return sel.assetDigestSha256;
    const shaUrl = sel.shaAsset?.browser_download_url;
    if (!shaUrl || !isTrustedSelectedAssetUrl(shaUrl) || !sel.targetAsset?.name) {
      return null;
    }
    const res = await this._trustedFetch(shaUrl, {
      headers: { 'User-Agent': 'Obsidian-Prism-Updater' },
      timeoutMs: 15_000,
    });
    if (!res.ok) {
      try { await res.body?.cancel?.(); } catch {}
      throw new Error(`sha256sums_http_${res.status}`);
    }
    const buf = await readResponseBufferWithLimit(res, 1024 * 1024);
    const sums = parseSha256Sums(buf.toString('utf8'));
    if (sums.has(sel.targetAsset.name)) return sums.get(sel.targetAsset.name);
    const lowerTarget = sel.targetAsset.name.toLowerCase();
    for (const [k, v] of sums.entries()) {
      if (k.toLowerCase() === lowerTarget) return v;
    }
    return null;
  }

  async applyReleaseUpdate({ confirm = false, auto = false } = {}) {
    if (confirm !== true) {
      return { ok: false, applied: false, error: 'confirmation_required' };
    }
    if (this._applyInFlight) {
      return this._applyInFlight;
    }

    const run = async () => {
      this.applying = true;
      let tmpDir = null;
      let latestTag = null;
      try {
        const status = await this.checkForUpdates({ force: false });
        if (!status.ok) {
          return {
            ok: false,
            applied: false,
            error: status.error || 'check_failed',
          };
        }
        if (!status.hasUpdate) {
          return {
            ok: true,
            channel: this.channel,
            isPrerelease: Boolean(status.isPrerelease),
            applied: false,
            upToDate: true,
            currentVersion: this.currentVersion,
            latestVersion: status.latestVersion,
          };
        }

        latestTag = status.latestTag;
        if (auto && latestTag && this._failedAutoTags.has(latestTag)) {
          return {
            ok: false,
            channel: this.channel,
            isPrerelease: Boolean(status.isPrerelease),
            applied: false,
            skippedFailedTag: true,
            targetVersion: status.latestVersion,
            latestTag,
            error: 'auto_update_previously_failed_for_tag',
          };
        }

        if (this.platform !== 'win32') {
          return {
            ok: true,
            channel: this.channel,
            isPrerelease: Boolean(status.isPrerelease),
            applied: false,
            manualRequired: true,
            mode: 'manual',
            targetVersion: status.latestVersion,
            latestTag,
            downloadUrl: status.downloadUrl || status.releaseUrl,
            releaseUrl: status.releaseUrl,
          };
        }

        const sel = this._selectReleaseAssets(this._lastRelease);
        if (!sel.targetAsset || !sel.downloadUrl) {
          throw new Error('installer_asset_not_found');
        }

        const expectedSha256 = await this._resolveExpectedSha256(sel);
        if (!expectedSha256) {
          throw new Error('sha256_unavailable');
        }
        const dlRes = await this._trustedFetch(sel.downloadUrl, {
          headers: { 'User-Agent': 'Obsidian-Prism-Updater' },
          timeoutMs: 120_000,
        });
        if (!dlRes.ok) {
          try { await dlRes.body?.cancel?.(); } catch {}
          throw new Error(`download_http_${dlRes.status}`);
        }
        const buf = await readResponseBufferWithLimit(dlRes, this.maxAssetBytes);

        // 写盘前先在内存中完成 SHA-256 验签，杜绝未验签二进制落盘
        const actualSha256 = crypto.createHash('sha256').update(buf).digest('hex').toLowerCase();
        if (actualSha256 !== expectedSha256) {
          throw new Error('sha256_mismatch');
        }

        const rootStat = this.lstatSyncFn(this.tmpRoot);
        if (
          !rootStat ||
          (typeof rootStat.isSymbolicLink === 'function' && rootStat.isSymbolicLink()) ||
          (typeof rootStat.isDirectory === 'function' && !rootStat.isDirectory())
        ) {
          throw new Error('refused_symlink_tmproot');
        }
        tmpDir = fs.mkdtempSync(path.join(this.tmpRoot, 'ag-prism-upd-'));
        const dirStat = this.lstatSyncFn(tmpDir);
        if (dirStat && typeof dirStat.isSymbolicLink === 'function' && dirStat.isSymbolicLink()) {
          throw new Error('refused_symlink_tmpdir');
        }

        const exePath = path.join(tmpDir, 'gravity-prism-installer.exe');
        const fd = fs.openSync(exePath, 'wx', 0o700);
        try {
          fs.writeFileSync(fd, buf);
        } finally {
          fs.closeSync(fd);
        }

        const exeStat = this.lstatSyncFn(exePath);
        if (!exeStat || (typeof exeStat.isSymbolicLink === 'function' && exeStat.isSymbolicLink()) || (typeof exeStat.isFile === 'function' && !exeStat.isFile())) {
          throw new Error('refused_symlink_installer');
        }
        if (exeStat.size > this.maxAssetBytes) {
          throw new Error('asset_too_large');
        }

        const spawnCwd =
          this.platform === 'win32'
            ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32')
            : path.dirname(exePath);
        const child = this.spawnFn(exePath, ['--install', '--silent', '--no-relaunch-prompt'], {
          detached: true,
          cwd: spawnCwd,
          stdio: 'ignore',
          windowsHide: true,
        });
        child?.on?.('error', () => {});
        child?.unref?.();

        this._lastError = null;
        return {
          ok: true,
          applied: true,
          scheduled: true,
          hotReloadExpected: true,
          needsHardReloadHint: true,
          mode: 'installer',
          targetVersion: status.latestVersion,
          latestTag,
          sha256: actualSha256,
          sha256Verified: Boolean(expectedSha256),
        };
      } catch (err) {
        if (tmpDir) {
          try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
        }
        const msg = String(err?.message || err || 'apply_failed');
        this._lastError = msg;
        if (auto && latestTag) {
          this._failedAutoTags.add(latestTag);
        }
        return {
          ok: false,
          applied: false,
          error: msg,
          targetVersion: this._lastCheckResult?.latestVersion || null,
          latestTag,
        };
      } finally {
        this.applying = false;
        this._applyInFlight = null;
      }
    };

    this._applyInFlight = run();
    return this._applyInFlight;
  }
}

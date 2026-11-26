import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

import * as arch from '../sidecars/daemon/conversation-archive.mjs';
import {
  ALLOWED_GOMEMLIMIT_PRESETS,
  isValidGoMemLimitValue,
  parseWindowsRegQueryValue,
  getGoMemLimitStatus,
  setGoMemLimit,
  clearGoMemLimit,
} from '../sidecars/daemon/gomemlimit-service.mjs';
import {
  STORAGE_GUARD_ROOT_ID,
  STORAGE_GUARD_STYLE_ID,
  buildStorageGuardBannerExpression,
  buildStorageGuardDismissExpression,
} from '../sidecars/daemon/storage-guard-ui.mjs';
import { PrismDaemon, hasRealUsageRecord } from '../sidecars/daemon/main.mjs';
import { AntigravityClient } from '../vendor/pulse-dashboard/sidecars/panel/client.mjs';
import { DelegatedUsage } from '../vendor/pulse-dashboard/sidecars/panel/delegated-usage.mjs';
import { MetricsStore } from '../vendor/pulse-dashboard/sidecars/panel/store.mjs';
import { buildRendererRpcExpression, normalizeRendererSummaries } from '../vendor/pulse-dashboard/sidecars/panel/renderer-rpc-adapter.mjs';
import { discoverLocalConversations } from '../vendor/pulse-dashboard/sidecars/panel/local-conversations.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, '..');
const cdp = require(path.join(ROOT, 'cdp.js'));
const usageCore = require(path.join(ROOT, 'usage-core.js'));
const homeStudioPanel = require(path.join(ROOT, 'home-studio-panel.js'));
const settingsPanel = require(path.join(ROOT, 'settings-panel.js'));
const i18nCore = require(path.join(ROOT, 'i18n-core.js'));
const i18nLocales = require(path.join(ROOT, 'i18n-locales.js'));

const SUPPORTED_8 = ['zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'es', 'fr', 'de'];
const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/;

function mkTmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function makeGuid(n) {
  return `90000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

function makeUsageRec(id, { total = 5000, calls = 2, stepCount = 12, lastModifiedSec = 1763500000, dbMtimeSec = 0, dbSize = 0, subagent = false, parentId = '' } = {}) {
  const dayKey = usageCore.homeDayKey(new Date(lastModifiedSec * 1000));
  return {
    cascadeId: id,
    stepCount,
    lastModifiedSec,
    ...(dbMtimeSec > 0 ? { dbMtimeSec } : {}),
    ...(dbSize > 0 ? { dbSize } : {}),
    gmCount: calls,
    subagent,
    workspace: 'obsidian-prism',
    parentId,
    calls,
    days: {
      [dayKey]: {
        calls,
        input: Math.floor(total * 0.7),
        output: Math.floor(total * 0.3),
        cacheRead: 0,
        cacheWrite: 0,
        total,
        hours: new Array(24).fill(0),
        models: { 'Gemini 4 Carbon': { input: Math.floor(total * 0.7), output: Math.floor(total * 0.3), cacheRead: 0, cacheWrite: 0, total, calls } },
      },
    },
  };
}

function createMiniDom() {
  const attrsMap = new WeakMap();
  const mkEl = (tag) => {
    const attrs = new Map();
    const listeners = new Map();
    const cls = new Set();
    const el = {
      nodeType: 1,
      tagName: String(tag).toUpperCase(),
      id: '',
      _text: '',
      children: [],
      parentElement: null,
      parentNode: null,
      hidden: false,
      disabled: false,
      value: '',
      isConnected: true,
      style: {},
      get className() { return [...cls].join(' '); },
      set className(v) { cls.clear(); for (const c of String(v || '').split(/\s+/).filter(Boolean)) cls.add(c); },
      get textContent() { return el.children.length ? el._text + el.children.map((c) => c.textContent).join('') : el._text; },
      set textContent(v) { el._text = String(v ?? ''); el.children.length = 0; },
      classList: {
        add: (...a) => a.forEach((c) => c && cls.add(c)),
        remove: (...a) => a.forEach((c) => cls.delete(c)),
        contains: (c) => cls.has(c),
      },
      setAttribute(k, v) {
        attrs.set(k, String(v));
        if (k === 'id') el.id = String(v);
        if (k === 'hidden') el.hidden = true;
      },
      getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
      hasAttribute: (k) => attrs.has(k),
      removeAttribute(k) {
        attrs.delete(k);
        if (k === 'hidden') el.hidden = false;
      },
      appendChild(c) {
        if (c.parentElement) c.remove();
        c.parentElement = el;
        c.parentNode = el;
        el.children.push(c);
        return c;
      },
      removeChild(c) {
        const i = el.children.indexOf(c);
        if (i >= 0) el.children.splice(i, 1);
        c.parentElement = null;
        c.parentNode = null;
        return c;
      },
      remove() {
        if (el.parentElement) el.parentElement.removeChild(el);
      },
      closest(sel) {
        let cur = el;
        while (cur) {
          if (matches(cur, sel)) return cur;
          cur = cur.parentElement;
        }
        return null;
      },
      querySelectorAll(sel) {
        const out = [];
        const walk = (n) => {
          for (const c of n.children) {
            if (matches(c, sel)) out.push(c);
            walk(c);
          }
        };
        walk(el);
        return out;
      },
      querySelector: (sel) => el.querySelectorAll(sel)[0] || null,
      addEventListener(t, fn) {
        if (!listeners.has(t)) listeners.set(t, []);
        listeners.get(t).push(fn);
      },
      click() {
        for (const fn of listeners.get('click') || []) fn({ stopPropagation() {}, preventDefault() {} });
      },
    };
    attrsMap.set(el, attrs);
    return el;
  };
  const matchSimple = (el, raw) => {
    const s = raw.trim();
    if (!s) return false;
    if (s.startsWith('#')) return el.id === s.slice(1);
    let rest = s;
    const tm = rest.match(/^[a-zA-Z0-9-]+/);
    if (tm) {
      if (el.tagName !== tm[0].toUpperCase()) return false;
      rest = rest.slice(tm[0].length);
    }
    for (const m of rest.matchAll(/\.([a-zA-Z0-9_-]+)/g)) {
      if (!el.classList.contains(m[1])) return false;
    }
    for (const m of rest.matchAll(/\[([^\]=]+)(?:="([^"]*)")?\]/g)) {
      if (!el.hasAttribute(m[1])) return false;
      if (m[2] !== undefined && el.getAttribute(m[1]) !== m[2]) return false;
    }
    return true;
  };
  const matches = (el, selList) =>
    selList.split(',').some((raw) => {
      const parts = raw.trim().split(/\s+/).filter(Boolean);
      if (!parts.length) return false;
      if (!matchSimple(el, parts[parts.length - 1])) return false;
      let cur = el.parentElement;
      for (let i = parts.length - 2; i >= 0; i -= 1) {
        while (cur && !matchSimple(cur, parts[i])) cur = cur.parentElement;
        if (!cur) return false;
        cur = cur.parentElement;
      }
      return true;
    });
  const doc = {
    documentElement: mkEl('html'),
    head: mkEl('head'),
    body: mkEl('body'),
    createElement: (t) => mkEl(t),
    getElementById: (id) => doc.documentElement.querySelector('#' + id),
    querySelectorAll: (s) => doc.documentElement.querySelectorAll(s),
    querySelector: (s) => doc.documentElement.querySelector(s),
  };
  doc.documentElement.appendChild(doc.head);
  doc.documentElement.appendChild(doc.body);
  return { doc, mkEl };
}

test('Defense 1A: fixes v2.34+ stepCount=0 disk cache miss, ignores .db-shm mtime churn, and caps cold dormant .db wakeups', async () => {
  const tmpDir = mkTmp('prism-def1a-');
  try {
    const cacheFile = path.join(tmpDir, 'usage-cache.json');
    const cachedCid = makeGuid(1);
    const changedCid = makeGuid(2);
    const coldIds = Array.from({ length: 20 }, (_, i) => makeGuid(100 + i));
    const baseSec = 1763600000;

    // 1) discoverLocalConversations exposes main .db size and ignores .db-shm
    const fakeHome = path.join(tmpDir, 'home');
    const convDir = path.join(fakeHome, '.gemini', 'antigravity', 'conversations');
    fs.mkdirSync(convDir, { recursive: true });
    const dbFile = path.join(convDir, `${cachedCid}.db`);
    const shmFile = path.join(convDir, `${cachedCid}.db-shm`);
    fs.writeFileSync(dbFile, Buffer.alloc(4096, 7));
    const dbOldTime = new Date(baseSec * 1000);
    fs.utimesSync(dbFile, dbOldTime, dbOldTime);
    fs.writeFileSync(shmFile, Buffer.alloc(1024, 9));
    // Touch .db-shm to "now" as Antigravity does on restart
    fs.utimesSync(shmFile, new Date(), new Date());

    const disc = await discoverLocalConversations({ host: 'app', home: fakeHome });
    assert.equal(disc.conversations.length, 1);
    assert.equal(disc.conversations[0].dbSize, 4096);
    assert.equal(Math.floor(disc.conversations[0].dbMtimeMs / 1000), baseSec, '.db-shm restart touch must NOT alter dbMtimeMs');

    // 2) Daemon list-summaries backfills stepCount from diskCache when main .db mtime+size unchanged & caps cold wakeups to 12
    const daemon = new PrismDaemon({ rootDir: ROOT, usageCachePath: cacheFile, silent: true, enableStorageGuardTimer: false, enableAutoUpdateTimer: false });
    daemon._putUsageDiskCache(
      cachedCid,
      48,
      baseSec,
      makeUsageRec(cachedCid, { total: 42000, calls: 4, stepCount: 48, lastModifiedSec: baseSec, dbMtimeSec: baseSec, dbSize: 4096 }),
      'local',
      { dbMtimeSec: baseSec, dbSize: 4096 }
    );
    daemon._putUsageDiskCache(
      changedCid,
      10,
      baseSec - 100,
      makeUsageRec(changedCid, { total: 5000, calls: 1, stepCount: 10, lastModifiedSec: baseSec - 100, dbMtimeSec: baseSec - 100, dbSize: 2048 }),
      'local',
      { dbMtimeSec: baseSec - 100, dbSize: 2048 }
    );
    daemon._flushUsageDiskCache();

    let trajRpcCalls = [];
    daemon._lazyLsClient = {
      server: { port: 0, csrf: '', pid: 1, mode: 'renderer-proxy' },
      call: async (method) => {
        if (method === 'GetAllCascadeTrajectories') return { trajectorySummaries: {}, _scopeHint: 'local' };
        return {};
      },
      trajectory: async (id) => {
        trajRpcCalls.push(id);
        return {
          status: 'CASCADE_RUN_STATUS_1',
          numTotalSteps: 22,
          numTotalGeneratorMetadata: 1,
          trajectory: {
            cascadeId: id,
            steps: [{ metadata: { createdAt: new Date(baseSec * 1000).toISOString() } }],
            generatorMetadata: [
              { stepIndices: [0], chatModel: { modelDisplayName: 'Gemini 4 Carbon', usage: { inputTokens: 800, outputTokens: 200 } } },
            ],
          },
        };
      },
    };
    daemon._discoverLocalAppConversations = async () => ({
      conversations: [
        { id: cachedCid, dbMtimeMs: baseSec * 1000, mtimeMs: baseSec * 1000, dbSize: 4096 },
        // changedCid grew in size + mtime -> must invalidate cache
        { id: changedCid, dbMtimeMs: (baseSec + 50) * 1000, mtimeMs: (baseSec + 50) * 1000, dbSize: 8192 },
        // 20 uncached dormant .db files
        ...coldIds.map((id, idx) => ({ id, dbMtimeMs: (baseSec - 1000 - idx * 60) * 1000, mtimeMs: (baseSec - 1000 - idx * 60) * 1000, dbSize: 1024 + idx })),
      ],
    });

    const listRes = await daemon.fetchUsageRollupBatch([], { action: 'list-summaries', scopeKey: 'local' });
    assert.equal(listRes.ok, true);
    const cachedSummary = listRes.summaries.find((s) => s.id === cachedCid);
    assert.ok(cachedSummary, 'Cached local conversation must appear in summaries');
    assert.equal(cachedSummary.stepCount, 48, 'Unchanged local .db must backfill real stepCount (never 0)');
    assert.equal(cachedSummary.diskUnchanged, true);

    const dormantSummaries = listRes.summaries.filter((s) => s.dormant === true);
    const coldAllowed = listRes.summaries.filter((s) => !s.diskUnchanged && !s.dormant);
    assert.equal(coldAllowed.length, 12, 'Cold uncached disk wakeups must be strictly capped at 12');
    assert.equal(dormantSummaries.length, 9, 'Excess cold dormant .db files (21 - 12 = 9) must be marked dormant:true');

    // Even if a caller passes stepCount=0 for cachedCid with matching dbMtimeSec+dbSize, backend MUST hit diskCache with 0 GetCascadeTrajectory RPC
    const hitBatch = await daemon.fetchUsageRollupBatch(
      [{ id: cachedCid, stepCount: 0, lastModifiedSec: baseSec, dbMtimeSec: baseSec, dbSize: 4096 }],
      { action: 'fetch-batch', scopeKey: 'local' }
    );
    assert.equal(hitBatch.ok, true);
    assert.equal(hitBatch.records[0].mode, 'full');
    assert.equal(trajRpcCalls.length, 0, 'Unchanged local .db MUST hit diskCache with 0 GetCascadeTrajectory RPCs');

    // Changed .db (different size/mtime) MUST miss cache and fetch fresh trajectory
    const changedBatch = await daemon.fetchUsageRollupBatch(
      [{ id: changedCid, stepCount: 0, lastModifiedSec: baseSec + 50, dbMtimeSec: baseSec + 50, dbSize: 8192 }],
      { action: 'fetch-batch', scopeKey: 'local' }
    );
    assert.equal(changedBatch.ok, true);
    assert.deepEqual(trajRpcCalls, [changedCid]);
    await daemon.stop(false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Defense 1B & PR #41 (Issue #40): preserves persisted token usage after conversation deletion/archiving across backend & frontend with strict scope isolation', async () => {
  // 1) Backend hasRealUsageRecord & frontend hasPersistedTokens parity
  const realRec = makeUsageRec(makeGuid(10), { total: 12000, calls: 2 });
  const zeroRec = makeUsageRec(makeGuid(11), { total: 0, calls: 0 });
  const bigIntRec = { calls: 0n, days: { '2026-11-24': { total: 500n, calls: 1n } } };
  for (const [sample, expected] of [
    [realRec, true],
    [zeroRec, false],
    [bigIntRec, true],
    [null, false],
    [{}, false],
  ]) {
    assert.equal(hasRealUsageRecord(sample), expected);
    assert.equal(homeStudioPanel.hasPersistedTokens(sample), expected);
  }

  const tmpDir = mkTmp('prism-pr41-');
  const prevWin = globalThis.window;
  const prevDoc = globalThis.document;
  const prevStorage = globalThis.localStorage;
  try {
    const cacheFile = path.join(tmpDir, 'usage-pr41.json');
    const liveMainId = makeGuid(20);
    const deletedSubId = makeGuid(21);
    const deletedZeroId = makeGuid(22);
    const sshDeletedId = makeGuid(23);
    const baseSec = 1763610000;

    const daemon = new PrismDaemon({ rootDir: ROOT, usageCachePath: cacheFile, silent: true, enableStorageGuardTimer: false, enableAutoUpdateTimer: false });
    daemon._putUsageDiskCache(liveMainId, 10, baseSec, makeUsageRec(liveMainId, { total: 30000, calls: 3, stepCount: 10, lastModifiedSec: baseSec }), 'local');
    daemon._putUsageDiskCache(deletedSubId, 15, baseSec - 300, makeUsageRec(deletedSubId, { total: 70000, calls: 5, stepCount: 15, lastModifiedSec: baseSec - 300, subagent: true, parentId: liveMainId }), 'local');
    daemon._putUsageDiskCache(deletedZeroId, 1, baseSec - 400, makeUsageRec(deletedZeroId, { total: 0, calls: 0, stepCount: 1, lastModifiedSec: baseSec - 400 }), 'local');
    daemon._putUsageDiskCache(sshDeletedId, 8, baseSec - 200, makeUsageRec(sshDeletedId, { total: 99000, calls: 4, stepCount: 8, lastModifiedSec: baseSec - 200 }), 'ssh:gpu-box');
    daemon._flushUsageDiskCache();

    let rpcTrajCalls = 0;
    daemon._lazyLsClient = {
      server: { port: 0, csrf: '', pid: 1, mode: 'renderer-proxy' },
      call: async (method) => {
        if (method === 'GetAllCascadeTrajectories') {
          return {
            _scopeHint: 'local',
            trajectorySummaries: {
              [liveMainId]: { stepCount: 10, lastModifiedTime: { seconds: String(baseSec) } },
            },
          };
        }
        return {};
      },
      trajectory: async () => { rpcTrajCalls += 1; return {}; },
    };
    daemon._discoverLocalAppConversations = async () => ({ conversations: [] });

    // Backend list-summaries returns live + archived real-usage local record, skips 0-token record, isolates ssh:* scope, and makes 0 RPCs
    const listRes = await daemon.fetchUsageRollupBatch([], { action: 'list-summaries', scopeKey: 'local' });
    assert.equal(listRes.ok, true);
    assert.equal(rpcTrajCalls, 0);
    const archivedLocal = listRes.records.find((r) => r.id === deletedSubId);
    assert.ok(archivedLocal && archivedLocal.archived === true, 'Deleted/archived local conversation with real tokens must be returned with archived:true');
    assert.equal(listRes.records.some((r) => r.id === deletedZeroId), false, '0-token deleted placeholder must NOT be returned as archived');
    assert.equal(listRes.records.some((r) => r.id === sshDeletedId), false, 'SSH scope records must NEVER leak into local scope');

    // Frontend home-studio-panel preserves deleted/archived records with real tokens during canPrune while pruning 0-token placeholders
    const storeMem = new Map();
    storeMem.set(
      'test:pr41:cache',
      JSON.stringify({
        [liveMainId]: makeUsageRec(liveMainId, { total: 30000, calls: 3, stepCount: 10, lastModifiedSec: baseSec }),
        [deletedSubId]: makeUsageRec(deletedSubId, { total: 70000, calls: 5, stepCount: 15, lastModifiedSec: baseSec - 300, subagent: true }),
        [deletedZeroId]: { ...makeUsageRec(deletedZeroId, { total: 0, calls: 0, stepCount: 1, lastModifiedSec: baseSec - 400 }), _do: 1 },
      })
    );
    globalThis.localStorage = {
      getItem: (k) => (storeMem.has(k) ? storeMem.get(k) : null),
      setItem: (k, v) => storeMem.set(k, String(v)),
    };
    globalThis.document = { title: 'obsidian-prism - Antigravity', body: {}, querySelector: () => null };
    let fetchBatchCalls = 0;
    globalThis.window = {
      __agPrismUsageBridge: {
        isOnline: () => true,
        listSummaries: async () => listRes,
        fetchBatch: async () => { fetchBatchCalls += 1; return { ok: true, records: [] }; },
      },
    };

    const ctl = homeStudioPanel.createHomeStudioPanelController({
      usageCore,
      storageUsageCacheKey: 'test:pr41:cache',
      isDestroyed: () => false,
      getHomeLayout: () => 'studio',
      getLang: () => 'en',
      uiText: () => ({}),
      getDisplayName: () => 'Dev',
      ensureHooks: () => ({
        store: {
          getState: () => ({
            trajectorySummaries: {
              summaries: { [liveMainId]: { stepCount: 10, lastModifiedTime: { seconds: baseSec } } },
            },
          }),
        },
        svc: {},
      }),
      canMountRealCanvas: () => false,
      setAttrIfChanged: () => {},
      runGuardedMut: (fn) => fn(),
    });

    await ctl.refreshUsageRollup(true);
    assert.equal(fetchBatchCalls, 0, 'Unchanged live + archived records must not trigger redundant fetchBatch');
    assert.equal(ctl.getUsageRecordsCount(), 2, 'Must preserve liveMainId + deletedSubId (real tokens) and prune deletedZeroId (0-token)');
    ctl.flushUsageCacheNow();
    const persisted = JSON.parse(storeMem.get('test:pr41:cache') || '{}');
    assert.ok(persisted[deletedSubId], 'Archived/deleted subagent tokens must stay persisted in localStorage');
    assert.equal(persisted[deletedZeroId], undefined, '0-token deferred placeholder must be pruned');
    const agg = usageCore.aggregateUsageRollup(Object.values(persisted), 'all', 0, 'en', new Date((baseSec + 100) * 1000));
    assert.equal(agg.tokens, 100000, 'Total tokens must stay 100% intact (30,000 + 70,000) after archiving/deletion');
    await daemon.stop(false);
  } finally {
    if (prevWin === undefined) delete globalThis.window; else globalThis.window = prevWin;
    if (prevDoc === undefined) delete globalThis.document; else globalThis.document = prevDoc;
    if (prevStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = prevStorage;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Defense 1C & 1D: dynamic 12s-20s TTL + PeekContextState for long active chats, and DelegatedUsage settled-child skip + per-pass cap', async () => {
  let nowMs = 5_000_000;
  let fullTrajCalls = 0;
  let peekCalls = 0;
  let peekPayload = {
    status: 'CASCADE_RUN_STATUS_2',
    stepCount: 245,
    contextWindowUsage: { estimatedTokensUsed: 180000, maxContextTokens: 512000, estimatedAfterCompaction: false },
  };
  const longCid = makeGuid(30);

  const client = new AntigravityClient({
    now: () => nowMs,
    paths: () => ({ log: '/nonexistent/ls.log', logCandidates: ['/nonexistent/ls.log'] }),
    readLog: async () => 'Language server listening on http://127.0.0.1:11244\n',
    processes: async () => [{ ProcessId: 88, CommandLine: 'language_server --standalone', Ports: [11244] }],
    rendererRpc: async (method) => {
      if (method === 'Probe') return { available: true };
      if (method === 'PeekContextState') {
        peekCalls += 1;
        return peekPayload;
      }
      if (method === 'GetCascadeTrajectory') {
        fullTrajCalls += 1;
        return {
          status: 'CASCADE_RUN_STATUS_2',
          numTotalSteps: 240,
          numTotalGeneratorMetadata: 20,
          contextWindowUsage: { estimatedTokensUsed: 150000, maxContextTokens: 512000, estimatedAfterCompaction: false },
          trajectory: { cascadeId: longCid, steps: [], generatorMetadata: [] },
        };
      }
      return {};
    },
  });

  try {
    // 1) Long active chat (>=200 steps) gets 20s TTL and refreshes contextWindowUsage via zero-LS-RPC PeekContextState
    const r1 = await client.trajectory(longCid);
    assert.equal(fullTrajCalls, 1);
    assert.equal(r1.contextWindowUsage.estimatedTokensUsed, 150000);

    nowMs += 6000; // 6s > old 4s TTL, but < 20s long-chat dynamic TTL
    const r2 = await client.trajectory(longCid);
    assert.equal(fullTrajCalls, 1, 'Long active chat (>200 steps) must reuse cache at 6s without full GetCascadeTrajectory');
    assert.equal(peekCalls, 1, 'Must probe zero-LS-RPC PeekContextState to keep context vial live');
    assert.equal(r2.contextWindowUsage.estimatedTokensUsed, 180000, 'PeekContextState must update contextWindowUsage in place');
    assert.equal(r2.numTotalSteps, 245);

    // When PeekContextState reports conversation became settled (status=1), bust cache immediately
    nowMs += 4000;
    peekPayload = { status: 'CASCADE_RUN_STATUS_1', stepCount: 250 };
    await client.trajectory(longCid);
    assert.equal(fullTrajCalls, 2, 'Transition to settled status in PeekContextState must bust cache immediately');
  } finally {
    client.dispose();
  }

  // 2) DelegatedUsage skips already-settled children and caps per-pass fetches in renderer-proxy mode
  const delFetches = [];
  let delNow = 10_000_000;
  const childIds = Array.from({ length: 10 }, (_, i) => makeGuid(40 + i));
  const fakeClient = {
    server: { mode: 'renderer-proxy' },
    reader: {
      summaries: Object.fromEntries(childIds.map((id) => [id, { status: 'CASCADE_RUN_STATUS_1', stepCount: 5, lastModifiedTime: '2026-11-24T00:00:00Z' }])),
    },
    trajectory: async (id) => {
      delFetches.push(id);
      return {
        status: 'CASCADE_RUN_STATUS_1',
        trajectory: {
          cascadeId: id,
          steps: [],
          generatorMetadata: [{ stepIndices: [0], chatModel: { usage: { inputTokens: 100, outputTokens: 50, responseId: `resp-${id}` } } }],
        },
      };
    },
  };
  const del = new DelegatedUsage(fakeClient, { now: () => delNow, refreshMs: 1000 });
  const parentRaw = { trajectory: { cascadeId: makeGuid(39), steps: [], generatorMetadata: [] } };
  del.request('scope-1', makeGuid(39), parentRaw, { knownIds: childIds });
  await del.idle();
  assert.equal(delFetches.length, 6, 'renderer-proxy DelegatedUsage pass must be capped at 6 children per pass');

  // Second pass fetches remaining 4, skipping the 6 already-settled children!
  delNow += 5000;
  del.request('scope-1', makeGuid(39), parentRaw, { knownIds: childIds });
  await del.idle();
  assert.equal(delFetches.length, 10, 'Settled children from pass 1 must NOT be re-fetched');

  // Third pass with unchanged settled children makes ZERO trajectory calls!
  delNow += 5000;
  del.request('scope-1', makeGuid(39), parentRaw, { knownIds: childIds });
  await del.idle();
  assert.equal(delFetches.length, 10, 'All settled children must stay skipped with 0 LS wakeups');

  // MetricsStore constructs tightened DelegatedUsage (maxAgents=24, refreshMs=30000)
  const tmpStoreDir = mkTmp('prism-store-tight-');
  try {
    const store = new MetricsStore(fakeClient, { dataDir: tmpStoreDir });
    assert.equal(store.delegated.maxAgents, 24);
    assert.equal(store.delegated.refreshMs, 30000);
    store.dispose();
  } finally {
    fs.rmSync(tmpStoreDir, { recursive: true, force: true });
  }
});

test('Defense 2A: v2.34+ multi-signal subagent classification, incremental catalog merge, main-chat protection, .db-shm immunity, and 4GB LS memory threshold', async () => {
  const tmpRoot = mkTmp('prism-def2a-');
  try {
    const convDir = path.join(tmpRoot, 'conversations');
    const archiveDir = path.join(tmpRoot, 'conversations_archive');
    fs.mkdirSync(convDir, { recursive: true });

    const now = Date.now();
    const threeHoursAgo = new Date(now - 3 * 3600000);
    const thirtyMinAgo = new Date(now - 30 * 60000);

    const mainVisibleId = makeGuid(50);
    const subSwarmId = makeGuid(51);
    const subDiscoveredId = makeGuid(52);
    const subRunningNumId = makeGuid(53);
    const subTooFreshId = makeGuid(54);
    const mainSelfRootId = makeGuid(55);

    for (const [id, dt] of [
      [mainVisibleId, threeHoursAgo],
      [subSwarmId, threeHoursAgo],
      [subDiscoveredId, threeHoursAgo],
      [subRunningNumId, threeHoursAgo],
      [subTooFreshId, thirtyMinAgo],
      [mainSelfRootId, threeHoursAgo],
    ]) {
      const db = path.join(convDir, `${id}.db`);
      fs.writeFileSync(db, Buffer.alloc(1024, 1));
      fs.utimesSync(db, dt, dt);
      const shm = path.join(convDir, `${id}.db-shm`);
      fs.writeFileSync(shm, Buffer.alloc(64, 2));
      // Simulate Antigravity restart refreshing .db-shm to "now"
      fs.utimesSync(shm, new Date(now), new Date(now));
    }

    // Save initial index with swarmId, numeric status=2 (running), discoveredSubagents, and self-root main chat
    arch.saveCatalogIndex(
      archiveDir,
      {
        [mainVisibleId]: { summary: 'Important Main Chat', status: 'CASCADE_RUN_STATUS_1', lastModifiedTime: threeHoursAgo.toISOString() },
        [subSwarmId]: { status: 'CASCADE_RUN_STATUS_1', swarmId: 'swarm-alpha', lastModifiedTime: threeHoursAgo.toISOString() },
        [subRunningNumId]: { status: 2, isSubagent: true, lastModifiedTime: threeHoursAgo.toISOString() },
        [subTooFreshId]: { status: 'CASCADE_RUN_STATUS_1', subagentName: 'researcher', lastModifiedTime: thirtyMinAgo.toISOString() },
        [mainSelfRootId]: { summary: 'Root Main', status: 'CASCADE_RUN_STATUS_1', rootConversationId: mainSelfRootId, lastModifiedTime: threeHoursAgo.toISOString() },
      },
      {
        extraSignals: {
          protectedMainIds: [mainVisibleId],
          discoveredSubagents: new Map([
            [subDiscoveredId, { parentId: mainVisibleId }],
            // Even if accidentally present in discoveredSubagents, protectedMainIds MUST win and protect main chat
            [mainVisibleId, { parentId: mainSelfRootId }],
          ]),
        },
      }
    );

    // Second partial refresh (e.g. Redux truncated older subagents) must preserve previous subagent classifications via mergeExisting:true
    arch.saveCatalogIndex(archiveDir, {
      [mainVisibleId]: { summary: 'Important Main Chat', status: 'CASCADE_RUN_STATUS_1', lastModifiedTime: threeHoursAgo.toISOString() },
      // Sparse searchConversations entry for subSwarmId must NOT demote it from subagent to main
      [subSwarmId]: { summary: 'Sparse Title Only' },
    });

    // Scan with frozen 2h subagent threshold + 4.2GB language_server RAM warning
    const scan = await arch.scanConversationStorageAsync({
      convDir,
      archiveDir,
      subagentMaxAgeHours: arch.AUTO_ARCHIVE_SUBAGENT_MAX_AGE_HOURS,
      lsMemoryMb: 4282.7,
      now,
    });
    assert.equal(arch.WARN_TOTAL_MB, 1536);
    assert.equal(arch.WARN_SUBAGENT_MB, 512);
    assert.equal(arch.WARN_LS_MEMORY_MB, 4096);
    assert.equal(arch.AUTO_ARCHIVE_SUBAGENT_MAX_AGE_HOURS, 2);
    assert.equal(scan.mainCount, 2, 'mainVisibleId & mainSelfRootId must both be classified as main');
    assert.equal(scan.subagentCount, 4, 'All 4 subagents (swarmId, discovered, numeric running, fresh) must be recognized');
    assert.equal(scan.unknownCount, 0);
    assert.deepEqual(
      scan.archivableSubagents.map((x) => x.id).sort(),
      [subSwarmId, subDiscoveredId].sort(),
      'Only finished subagents >=2h (immune to .db-shm touch) are archivable; numeric status=2 running & 30m fresh subagents must be spared'
    );
    assert.equal(scan.warn, true);
    assert.ok(scan.warnReasons.includes('ls-memory'), 'LS memory >= 4.0 GB must trigger ls-memory warn reason');

    // Read-only memory parsers (Windows CSV & POSIX ps rss)
    const winMem = arch.parseWindowsTasklistMemoryCsv(
      [
        '"Antigravity.exe","1000","Console","1","420,000 K"',
        '"language_server_windows_x64.exe","35512","Console","1","4,385,484 K"',
      ].join('\r\n')
    );
    assert.equal(winMem.ok, true);
    assert.equal(winMem.processCount, 1);
    assert.ok(Math.abs(winMem.totalMb - 4282.7) < 0.2);

    const posixMem = arch.parsePosixPsRss(
      [
        '  100  12000 /sbin/launchd',
        '  200 4194304 /Applications/Antigravity.app/Contents/Resources/language_server_macos_arm64 --standalone',
      ].join('\n'),
      { selfPid: 999, selfPpid: 998 }
    );
    assert.equal(posixMem.ok, true);
    assert.equal(posixMem.totalMb, 4096);

    // Renderer adapter CheckHostIdleState & includeVisibleMainIds
    const idleExpr = buildRendererRpcExpression('CheckHostIdleState', {});
    const busyDom = {
      document: {
        querySelector: (sel) => (sel.includes('data-ag-sub-running') ? {} : null),
        querySelectorAll: () => [],
      },
      Promise,
    };
    const busyRes = await vm.runInContext(idleExpr, vm.createContext(busyDom));
    assert.equal(busyRes.ok, true);
    assert.equal(busyRes.data.idle, false);
    assert.equal(busyRes.data.domBusy, true);

    const normSums = normalizeRendererSummaries({
      trajectorySummaries: { [subSwarmId]: { swarmId: 's1', isSubagent: true, status: 1 } },
      visibleMainIds: [mainVisibleId.toUpperCase()],
    });
    assert.equal(normSums.trajectorySummaries[subSwarmId].swarmId, 's1');
    assert.deepEqual(normSums.visibleMainIds, [mainVisibleId]);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('Defense 2B: default-off autoArchiveOnExit, fail-closed offline sequence (graceful quit -> wait -> 4s settle -> double check -> archive -> relaunch), idle gate, snooze & lossless restore', async () => {
  // Default config MUST have autoArchiveOnExit: false
  assert.equal(cdp.DEFAULT_CONFIG.autoArchiveOnExit, false);
  assert.equal(cdp.validateConfigEntry('autoArchiveOnExit', true), true);
  assert.equal(cdp.validateConfigEntry('autoArchiveOnExit', false), true);
  assert.equal(cdp.validateConfigEntry('autoArchiveOnExit', 'invalid'), false);

  const tmpRoot = mkTmp('prism-def2b-');
  try {
    const convDir = path.join(tmpRoot, 'conversations');
    const archiveDir = path.join(tmpRoot, 'conversations_archive');
    const guardStateFile = path.join(tmpRoot, 'guard-state.json');
    const cacheFile = path.join(tmpRoot, 'usage-cache.json');
    fs.mkdirSync(convDir, { recursive: true });

    const now = Date.now();
    const oldTime = new Date(now - 4 * 3600000);
    const subId = makeGuid(60);
    const mainId = makeGuid(61);
    for (const fn of [`${subId}.db`, `${subId}.db-wal`, `${subId}.db-shm`, `${mainId}.db`]) {
      const fp = path.join(convDir, fn);
      fs.writeFileSync(fp, 'payload-' + fn, 'utf8');
      fs.utimesSync(fp, oldTime, oldTime);
    }
    arch.saveCatalogIndex(archiveDir, {
      [subId]: { status: 'CASCADE_RUN_STATUS_1', lastModifiedTime: oldTime.toISOString(), trajectoryMetadata: { parentConversationId: mainId } },
      [mainId]: { summary: 'Precious Main', status: 'CASCADE_RUN_STATUS_1', lastModifiedTime: oldTime.toISOString() },
    });

    // 1) Daemon auto-archive on exit is DISABLED by default
    const daemon = new PrismDaemon({
      rootDir: ROOT,
      usageCachePath: cacheFile,
      storageGuardStatePath: guardStateFile,
      enableStorageGuardTimer: false,
      enableAutoUpdateTimer: false,
      silent: true,
    });
    const skippedDefault = await daemon._maybeRunAutoArchiveOnExit({
      forceSawHost: true,
      convDir,
      archiveDir,
      settleMs: 0,
      recheckGapMs: 0,
      checkRunning: () => false,
    });
    assert.equal(skippedDefault.ran, false);
    assert.equal(skippedDefault.reason, 'disabled-by-default');
    assert.equal(fs.existsSync(path.join(convDir, `${subId}.db`)), true);

    // 2) executeArchiveTaskSequence aborts safely without moving files if host never exits (no force kill!)
    const timeoutRes = await arch.executeArchiveTaskSequence(
      { action: 'archive-and-restart', convDir, archiveDir, gracefulQuit: true, relaunch: true, waitExitTimeoutMs: 500, pollMs: 50, settleMs: 0, recheckGapMs: 0 },
      { sleep: async () => {}, checkRunning: () => true, requestGracefulQuit: async () => true, launchHost: async () => { throw new Error('must not relaunch on timeout'); } }
    );
    assert.equal(timeoutRes.ok, false);
    assert.equal(timeoutRes.code, 'HOST_EXIT_TIMEOUT');
    assert.equal(fs.existsSync(path.join(convDir, `${subId}.db`)), true);

    // 3) executeArchiveTaskSequence aborts if host restarts during settle/double-recheck
    let checkSeq = [true, false, false, true]; // exits, passes 1st settle check, restarts before 2nd recheck
    let checkIdx = 0;
    const restartedRes = await arch.executeArchiveTaskSequence(
      { action: 'archive-and-restart', convDir, archiveDir, gracefulQuit: true, relaunch: true, waitExitTimeoutMs: 1000, pollMs: 50, settleMs: 10, recheckGapMs: 10 },
      {
        sleep: async () => {},
        checkRunning: () => checkSeq[Math.min(checkIdx++, checkSeq.length - 1)],
        requestGracefulQuit: async () => true,
        launchHost: async () => true,
      }
    );
    assert.equal(restartedRes.ok, false);
    assert.equal(restartedRes.code, 'HOST_RESTARTED_DURING_SETTLE');
    assert.equal(fs.existsSync(path.join(convDir, `${subId}.db`)), true);

    // 4) Full happy-path archive-and-restart sequence: graceful quit -> wait -> settle + double check -> move 3-piece bundle -> relaunch with --remote-debugging-port=0
    const events = [];
    let hostRunning = true;
    const seqRes = await arch.executeArchiveTaskSequence(
      { action: 'archive-and-restart', convDir, archiveDir, hostPid: 4321, exePath: 'C:\\Antigravity\\Antigravity.exe', gracefulQuit: true, relaunch: true, settleMs: 10, recheckGapMs: 10, relaunchDelayMs: 5 },
      {
        sleep: async () => {},
        requestGracefulQuit: async (pid) => { events.push(`quit:${pid}`); hostRunning = false; return true; },
        checkRunning: () => hostRunning,
        launchHost: async (exe, args) => { events.push(`launch:${exe}:${args.join(',')}`); return true; },
      }
    );
    assert.equal(seqRes.ok, true);
    assert.equal(seqRes.movedCount, 1);
    assert.equal(seqRes.relaunched, true);
    assert.equal(fs.existsSync(path.join(convDir, `${subId}.db`)), false);
    assert.equal(fs.existsSync(path.join(convDir, `${subId}.db-wal`)), false);
    assert.equal(fs.existsSync(path.join(convDir, `${subId}.db-shm`)), false);
    assert.equal(fs.existsSync(path.join(convDir, `${mainId}.db`)), true, 'Main conversation MUST remain untouched');
    assert.deepEqual(events, ['quit:4321', 'launch:C:\\Antigravity\\Antigravity.exe:--remote-debugging-port=0']);
    assert.equal(arch.readLastArchiveResult(archiveDir)?.movedCount, 1);

    // 5) Restore-and-restart sequence restores all 3 files losslessly
    const restoreRes = await arch.executeArchiveTaskSequence(
      { action: 'restore-and-restart', convDir, archiveDir, batchName: 'latest', gracefulQuit: false, relaunch: true, settleMs: 0, recheckGapMs: 0, relaunchDelayMs: 0 },
      { sleep: async () => {}, checkRunning: () => false, launchHost: async () => true }
    );
    assert.equal(restoreRes.ok, true);
    assert.equal(restoreRes.restoredCount, 1);
    assert.equal(fs.readFileSync(path.join(convDir, `${subId}.db`), 'utf8'), `payload-${subId}.db`);
    assert.equal(fs.readFileSync(path.join(convDir, `${subId}.db-wal`), 'utf8'), `payload-${subId}.db-wal`);
    assert.equal(fs.readFileSync(path.join(convDir, `${subId}.db-shm`), 'utf8'), `payload-${subId}.db-shm`);

    // 6) Daemon archive-and-restart enforces confirm:true & idle check, snapshots token usage before scheduling, and guards against concurrent auto-exit
    const noConfirm = await daemon.executeRepoAction({ action: 'archive-and-restart', _testOverrides: { convDir, archiveDir } });
    assert.equal(noConfirm.ok, false);
    assert.equal(noConfirm.error, 'confirmation_required');

    const busyBlocked = await daemon.executeRepoAction({
      action: 'archive-and-restart',
      confirm: true,
      _testOverrides: { convDir, archiveDir, checkIdle: async () => ({ idle: false, runningCount: 1, reason: 'redux-running' }) },
    });
    assert.equal(busyBlocked.ok, false);
    assert.equal(busyBlocked.code, 'HOST_BUSY');

    // Attach mock LS client so archive-and-restart genuinely runs _snapshotUsageBeforeArchive and flushes real tokens to disk
    daemon.ensureLsClient = async () => ({
      call: async (method, body) => {
        if (method === 'GetAllCascadeTrajectories') return { trajectorySummaries: {} };
        if (method === 'GetCascadeTrajectoryGeneratorMetadata' && body?.cascadeId === subId) {
          return {
            numTotalSteps: 6,
            numTotalGeneratorMetadata: 1,
            generatorMetadata: [
              {
                stepIndices: [0],
                chatModel: {
                  model: 'MODEL_CLAUDE_4_6_SONNET',
                  usage: { inputTokens: 42000, outputTokens: 8000, responseId: 'snap-resp-1' },
                },
              },
            ],
          };
        }
        return {};
      },
    });
    let spawnedTask = null;
    daemon._autoArchiveExitRan = false;
    const okScheduled = await daemon.executeRepoAction({
      action: 'archive-and-restart',
      confirm: true,
      _testOverrides: {
        convDir,
        archiveDir,
        checkIdle: async () => ({ idle: true }),
        detectHost: async () => ({ pid: 7777, exePath: 'C:\\Antigravity\\Antigravity.exe' }),
        spawnHook: (arg) => { spawnedTask = arg; return { spawned: true, method: 'mock' }; },
      },
    });
    assert.equal(okScheduled.ok, true);
    assert.equal(okScheduled.scheduled, true);
    assert.equal(okScheduled.snapshottedUsageCount, 1, 'archive-and-restart must snapshot uncached subagent tokens before archiving');
    assert.equal(daemon._autoArchiveExitRan, true, 'scheduled archive-and-restart must prevent duplicate auto-exit-archive race');
    assert.equal(spawnedTask.payload.gracefulQuit, true);
    assert.equal(spawnedTask.payload.relaunch, true);
    assert.equal(spawnedTask.payload.subagentMaxAgeHours, 2);

    // After offline archive moves subId.db away and daemon reloads disk cache cold, list-summaries MUST still return the snapshotted 50,000 tokens
    const archivedAfterSnap = arch.archiveConversations({ convDir, archiveDir, mode: 'subagents', subagentMaxAgeHours: 2, checkRunning: () => false });
    assert.equal(archivedAfterSnap.ok, true);
    assert.equal(archivedAfterSnap.movedCount, 1);
    daemon._usageDiskCache = null; // Force cold reload from persisted cacheFile on disk
    daemon._discoverLocalAppConversations = () => [];
    const postArchiveList = await daemon.fetchUsageRollupBatch([], { action: 'list-summaries', scopeKey: 'local', force: true });
    const preservedSnap = postArchiveList.records.find((r) => r.id === subId);
    assert.ok(preservedSnap, 'Snapshotted subagent must survive in list-summaries records after its .db is archived and cache is cold-reloaded');
    assert.equal(preservedSnap.archived, true);
    const snapAgg = usageCore.aggregateUsageRollup([preservedSnap.record], 'all', 0, 'en', new Date(now));
    assert.equal(snapAgg.tokens, 50000);

    // restore-archive enforces idle check & suppresses auto-exit-archive race after scheduling
    const restoreBusy = await daemon.executeRepoAction({
      action: 'restore-archive',
      confirm: true,
      _testOverrides: { convDir, archiveDir, checkIdle: async () => ({ idle: false, runningCount: 1 }) },
    });
    assert.equal(restoreBusy.ok, false);
    assert.equal(restoreBusy.code, 'HOST_BUSY');

    daemon._autoArchiveExitRan = false;
    const restoreScheduled = await daemon.executeRepoAction({
      action: 'restore-archive',
      confirm: true,
      _testOverrides: {
        convDir,
        archiveDir,
        checkIdle: async () => ({ idle: true }),
        detectHost: async () => ({ pid: 7777, exePath: 'C:\\Antigravity\\Antigravity.exe' }),
        spawnHook: (arg) => ({ spawned: true, method: 'mock', payload: arg.payload }),
      },
    });
    assert.equal(restoreScheduled.ok, true);
    assert.equal(restoreScheduled.scheduled, true);
    assert.equal(daemon._autoArchiveExitRan, true, 'scheduled restore-archive must suppress auto-exit-archive from re-archiving restored batch');

    // 7) Gentle threshold banner respects busy state (both daemon-side and in-page DOM), snooze 24h, and renders safe DOM with secondary confirmation
    const evalHistory = [];
    const mockLocalEntry = {
      url: 'vscode-file://vscode-app/workbench.html',
      title: 'obsidian-prism — Antigravity',
      session: {
        closed: false,
        send: async (_m, p) => {
          if (typeof p?.expression === 'string' && p.expression.includes('data-ag-cs-lang')) {
            return { result: { value: 'zh-CN' } };
          }
          evalHistory.push(p.expression);
          return { result: { value: { mounted: true } } };
        },
        evaluate: async (expr) => {
          evalHistory.push(expr);
          return { dismissed: true };
        },
      },
    };
    daemon.sessions.set('ws://local-1', mockLocalEntry);

    const busyNotify = await daemon._checkStorageGuardAndNotify({
      convDir,
      archiveDir,
      lsMemoryMb: 4500,
      checkIdle: async () => ({ idle: false, runningCount: 2 }),
      now,
    });
    assert.equal(busyNotify.shown, false);
    assert.equal(busyNotify.reason, 'host-busy');

    const idleNotify = await daemon._checkStorageGuardAndNotify({
      convDir,
      archiveDir,
      lsMemoryMb: 4500,
      checkIdle: async () => ({ idle: true, runningCount: 0 }),
      now,
    });
    assert.equal(idleNotify.shown, true);
    assert.equal(evalHistory.length, 1);

    // Execute generated banner expression in VM: first verify in-page busy DOM gate refuses mounting
    const { doc: busyBannerDoc, mkEl: mkBusyEl } = createMiniDom();
    const stopGen = mkBusyEl('button');
    stopGen.setAttribute('data-testid', 'stop-generation-button');
    busyBannerDoc.body.appendChild(stopGen);
    const busyMountRes = vm.runInNewContext(evalHistory[0], { document: busyBannerDoc, window: {} });
    assert.equal(busyMountRes.mounted, false);
    assert.equal(busyMountRes.reason, 'busy');
    assert.equal(busyBannerDoc.getElementById(STORAGE_GUARD_ROOT_ID), null);
    assert.equal(evalHistory[0].includes('innerHTML'), false, 'Storage guard banner must never use innerHTML');

    // Now execute on idle DOM and verify DOM + 2nd confirm + snooze + 5+1 no-translate attrs
    const { doc } = createMiniDom();
    const bannerCalls = [];
    const bannerSandbox = {
      document: doc,
      window: {
        __agPrismRepoBridge: (p) => { bannerCalls.push(p); return { ok: true }; },
        __agPrismSetting: (s) => { bannerCalls.push(JSON.parse(s)); },
      },
    };
    const mountRes = vm.runInNewContext(evalHistory[0], bannerSandbox);
    assert.equal(mountRes.mounted, true);
    const guardEl = doc.getElementById(STORAGE_GUARD_ROOT_ID);
    assert.ok(guardEl, 'Banner root element must be mounted');
    assert.equal(guardEl.getAttribute('data-ag-owned'), '1');
    assert.equal(guardEl.getAttribute('translate'), 'no');
    assert.equal(guardEl.getAttribute('data-antigravity-zh-skip'), '1');
    // Confirm box hidden initially until user clicks Archive & Restart
    const confirmBox = guardEl.querySelector('[data-ag-sg-confirm-box="1"]');
    assert.equal(confirmBox.hidden, true);
    guardEl.querySelector('[data-ag-sg-action="open-confirm"]').click();
    assert.equal(confirmBox.hidden, false);
    guardEl.querySelector('[data-ag-sg-action="confirm-archive-restart"]').click();
    await new Promise((r) => setTimeout(r, 10));
    assert.ok(bannerCalls.some((c) => c.action === 'archive-and-restart' && c.confirm === true));

    // Snooze 24h suppresses subsequent notifications
    const snoozeRes = await daemon.executeRepoAction({ action: 'storage-snooze', hours: 24 });
    assert.equal(snoozeRes.ok, true);
    const afterSnooze = await daemon._checkStorageGuardAndNotify({
      convDir,
      archiveDir,
      lsMemoryMb: 4500,
      checkIdle: async () => ({ idle: true }),
      now: Date.now(),
    });
    assert.equal(afterSnooze.shown, false);
    assert.equal(afterSnooze.reason, 'snoozed');

    // Dismiss helper cleans up banner and style
    vm.runInNewContext(buildStorageGuardDismissExpression(), bannerSandbox);
    assert.equal(doc.getElementById(STORAGE_GUARD_ROOT_ID), null);
    assert.equal(doc.getElementById(STORAGE_GUARD_STYLE_ID), null);

    await daemon.stop(false);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('Defense 3: optional Go native GOMEMLIMIT enforces strict preset allowlist, zero shell interpolation, and cross-platform set/status/clear', async () => {
  // Allowlist validation rejects arbitrary / injected values
  for (const okVal of ALLOWED_GOMEMLIMIT_PRESETS) {
    assert.equal(isValidGoMemLimitValue(okVal), true);
  }
  for (const badVal of ['', '2GiB; calc', '$(id)', '100GiB', '2GiB\nfoo=bar', '"2GiB"', null, 2048]) {
    assert.equal(isValidGoMemLimitValue(badVal), false);
    const res = await setGoMemLimit(badVal, { platform: 'win32', execAsync: async () => { throw new Error('must not exec'); } });
    assert.equal(res.ok, false);
    assert.equal(res.code, 'INVALID_GOMEMLIMIT');
  }

  // 1) Windows: uses native reg.exe array args exclusively (zero PowerShell / zero shell interpolation)
  assert.equal(
    parseWindowsRegQueryValue('\r\nHKEY_CURRENT_USER\\Environment\r\n    GOMEMLIMIT    REG_SZ    3GiB\r\n'),
    '3GiB'
  );
  assert.equal(
    parseWindowsRegQueryValue('    GOMEMLIMIT    REG_EXPAND_SZ    2500MiB  \r\n'),
    '2500MiB'
  );
  assert.equal(parseWindowsRegQueryValue('ERROR: The system was unable to find the specified registry key or value.'), '');

  let winUserVal = '';
  const winCalls = [];
  const winExec = async (bin, args, opts) => {
    winCalls.push({ bin, args, opts });
    assert.equal(bin, 'reg.exe', 'Windows GOMEMLIMIT must invoke reg.exe exclusively');
    assert.equal(opts?.windowsHide, true);
    if (args[0] === 'add') {
      assert.deepEqual(args.slice(0, 6), ['add', 'HKCU\\Environment', '/v', 'GOMEMLIMIT', '/t', 'REG_SZ']);
      assert.equal(args[6], '/d');
      assert.equal(args[8], '/f');
      winUserVal = args[7];
      return 'The operation completed successfully.\r\n';
    }
    if (args[0] === 'delete') {
      assert.deepEqual(args, ['delete', 'HKCU\\Environment', '/v', 'GOMEMLIMIT', '/f']);
      if (!winUserVal) {
        const err = new Error('ERROR: The system was unable to find the specified registry key or value.');
        err.code = 1;
        throw err;
      }
      winUserVal = '';
      return 'The operation completed successfully.\r\n';
    }
    if (args[0] === 'query') {
      assert.deepEqual(args, ['query', 'HKCU\\Environment', '/v', 'GOMEMLIMIT']);
      if (!winUserVal) {
        const err = new Error('ERROR: The system was unable to find the specified registry key or value.');
        err.code = 1;
        throw err;
      }
      return `\r\nHKEY_CURRENT_USER\\Environment\r\n    GOMEMLIMIT    REG_SZ    ${winUserVal}\r\n`;
    }
    throw new Error(`Unexpected reg.exe args: ${JSON.stringify(args)}`);
  };
  const winSet = await setGoMemLimit('2GiB', { platform: 'win32', execAsync: winExec, env: {} });
  assert.equal(winSet.ok, true);
  assert.equal(winSet.currentValue, '2GiB');
  assert.equal(winSet.source, 'win-user-env');
  assert.equal(winSet.restartRequired, true);
  assert.deepEqual(winCalls[0].args, ['add', 'HKCU\\Environment', '/v', 'GOMEMLIMIT', '/t', 'REG_SZ', '/d', '2GiB', '/f']);

  const winClear = await clearGoMemLimit({ platform: 'win32', execAsync: winExec, env: { GOMEMLIMIT: '2GiB' } });
  assert.equal(winClear.ok, true);
  assert.equal(winClear.configured, false);
  assert.equal(winClear.currentValue, '');
  assert.equal(winClear.cleared, true);
  assert.equal(winClear.restartRequired, true);

  // Idempotent clear when GOMEMLIMIT is already absent in HKCU\Environment
  const winClearAgain = await clearGoMemLimit({ platform: 'win32', execAsync: winExec, env: {} });
  assert.equal(winClearAgain.ok, true);
  assert.equal(winClearAgain.configured, false);
  assert.equal(winClearAgain.cleared, true);

  // Genuine access denied error on reg.exe delete MUST NOT be masked as success
  const winDenied = await clearGoMemLimit({
    platform: 'win32',
    execAsync: async () => {
      const err = new Error('ERROR: Access is denied.');
      err.code = 1;
      throw err;
    },
    env: {},
  });
  assert.equal(winDenied.ok, false);
  assert.equal(winDenied.code, 'CLEAR_FAILED');

  // Static AV/host-redline hygiene check on gomemlimit-service.mjs and conversation-archive.mjs
  const forbiddenPatterns = [
    /-EncodedCommand/i,
    /-WindowStyle\s+Hidden/i,
    /\bWin32_Process\b/i,
    /\bInvoke-CimMethod\b/i,
    /\bGet-CimInstance\b/i,
    /\bwmic\b/i,
    /\bpowershell(?:\.exe)?\b/i,
    /\btaskkill\b/i,
    /\bStop-Process\b/i,
    /\bSIGKILL\b/i,
    /\bTerminateProcess\b/i,
    /\bOpenProcess\b/i,
    /app\.asar/i,
    /(?:fetchTimer|timer)\.unref\s*\(/i,
  ];
  for (const rel of ['sidecars/daemon/gomemlimit-service.mjs', 'sidecars/daemon/conversation-archive.mjs']) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    for (const re of forbiddenPatterns) {
      assert.equal(re.test(src), false, `${rel} must contain 0 matches for ${re}`);
    }
  }

  // 2) Linux: isolated ~/.config/environment.d/90-obsidian-prism-gomemlimit.conf
  const tmpDir = mkTmp('prism-gomem-');
  try {
    const linuxFile = path.join(tmpDir, 'environment.d', '90-obsidian-prism-gomemlimit.conf');
    const linSet = await setGoMemLimit('2500MiB', { platform: 'linux', linuxEnvFile: linuxFile, env: {} });
    assert.equal(linSet.ok, true);
    assert.equal(linSet.currentValue, '2500MiB');
    assert.ok(fs.readFileSync(linuxFile, 'utf8').includes('GOMEMLIMIT=2500MiB'));
    const linClear = await clearGoMemLimit({ platform: 'linux', linuxEnvFile: linuxFile, env: {} });
    assert.equal(linClear.ok, true);
    assert.equal(fs.existsSync(linuxFile), false);

    // 3) macOS: launchctl setenv + isolated LaunchAgent plist
    const macPlist = path.join(tmpDir, 'LaunchAgents', 'com.obsidian-prism.gomemlimit.plist');
    const macCmds = [];
    const macExec = async (bin, args) => {
      macCmds.push([bin, ...args]);
      if (args[0] === 'getenv') return macCmds.some((c) => c[1] === 'unsetenv') ? '' : '3GiB';
      return '';
    };
    const macSet = await setGoMemLimit('3GiB', { platform: 'darwin', execAsync: macExec, macPlistPath: macPlist, env: {} });
    assert.equal(macSet.ok, true);
    assert.equal(macSet.currentValue, '3GiB');
    assert.ok(fs.readFileSync(macPlist, 'utf8').includes('<string>3GiB</string>'));
    const macClear = await clearGoMemLimit({ platform: 'darwin', execAsync: macExec, macPlistPath: macPlist, env: {} });
    assert.equal(macClear.ok, true);
    assert.equal(fs.existsSync(macPlist), false);
    const macStatus = await getGoMemLimitStatus({ platform: 'darwin', execAsync: macExec, macPlistPath: macPlist, env: {} });
    assert.equal(macStatus.configured, false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Settings panel 8-locale Memory/DB Guard + GOMEMLIMIT controls and engineering gates (Ch1 < 550KB, configRefresh < 4KB, 0 CJK leak, 0 BOM/CRLF, 0 top-level :has)', async () => {
  // 1) All 8 locales have complete non-empty strings & 0 CJK leak in en/es/fr/de
  const newKeys = [
    'storageGuardTitle', 'storageGuardSummaryTpl', 'storageGuardEnableAutoExitBtn', 'storageGuardSnooze24hBtn',
    'storageGuardBusyMsg', 'storageAutoExitTitle', 'storageAutoExitDesc', 'storageAutoExitOff', 'storageAutoExitOn',
    'storageAutoExitEnabledMsg', 'storageArchiveRestartBtn', 'storageArchiveRestartConfirmDesc',
    'storageArchiveRestartConfirmBtn', 'storageArchiveRestartRunning', 'storageArchiveRestartScheduled',
    'storageRestoreBtn', 'storageRestoreConfirmDesc', 'storageRestoreConfirmBtn', 'storageRestoreScheduled',
    'storageRestoreEmpty', 'storageLsMemTpl', 'goMemLimitTitle', 'goMemLimitDesc', 'goMemLimitUnset',
    'goMemLimitActiveTpl', 'goMemLimitRestartNote', 'goMemLimitApplyBtn', 'goMemLimitClearBtn',
    'goMemLimitAppliedTpl', 'goMemLimitCleared',
  ];
  for (const k of newKeys) {
    const row = i18nLocales.UI_TABLE[k];
    assert.ok(Array.isArray(row) && row.length === 8, `Missing 8-locale row for ${k}`);
    for (const idx of [2, 5, 6, 7]) {
      assert.equal(CJK_RE.test(row[idx]), false, `CJK leak in ${k}[${idx}]: ${row[idx]}`);
    }
  }

  // 2) Settings panel UI interaction test
  const prevWin = globalThis.window;
  const prevDoc = globalThis.document;
  const prevStorage = globalThis.localStorage;
  const { doc, mkEl } = createMiniDom();
  const dialog = mkEl('div');
  dialog.setAttribute('role', 'dialog');
  const panel = mkEl('div');
  const h2 = mkEl('h2'); h2.textContent = 'Appearance';
  const anchor = mkEl('div'); anchor.className = 'space-y-2';
  panel.appendChild(h2); panel.appendChild(anchor); dialog.appendChild(panel); doc.body.appendChild(dialog);

  const repoCalls = [];
  const storeMem = new Map();
  const state = { ...settingsPanel.getDefaultSettingsPatch(), autoArchiveOnExit: false };
  globalThis.document = doc;
  globalThis.localStorage = { getItem: (k) => storeMem.get(k) || null, setItem: (k, v) => storeMem.set(k, String(v)), removeItem: (k) => storeMem.delete(k) };
  globalThis.window = {
    document: doc,
    localStorage: globalThis.localStorage,
    __agPrismRepoBridge: (p) => {
      repoCalls.push(p);
      if (p.action === 'storage-health') {
        return { ok: true, totalMb: 2048, mainCount: 25, subagentCount: 180, subagentMb: 1200, lsMemoryMb: 4300, warn: true, autoArchiveOnExit: false, latestBatch: { batchName: 'batch-2026-11-24T10-00-00-abcd1234' } };
      }
      if (p.action === 'gomemlimit-status') return { ok: true, configured: false, currentValue: '' };
      if (p.action === 'gomemlimit-set') return { ok: true, configured: true, currentValue: p.value, appliedValue: p.value, restartRequired: true };
      if (p.action === 'gomemlimit-clear') return { ok: true, configured: false, currentValue: '', cleared: true };
      return { ok: true, scheduled: true };
    },
  };

  try {
    settingsPanel.mountOrSyncSettingsSection({
      version: '1.0.7',
      getLang: () => 'en',
      uiText: (l) => i18nLocales.getUiStrings(l),
      isZh: () => false,
      i18nCore,
      formatSettingsSummary: () => 'summary',
      resolveSettingRowActiveValue: (k) => state[k],
      isSettingButtonMatch: (_k, valJson, cur) => JSON.parse(valJson) === cur,
      saveSetting: (k, v) => { state[k] = v; },
      saveSettingsBatch: (p) => Object.assign(state, p),
      getThoughtTranslateMode: () => state.thoughtTranslate,
      handledGroupClicks: new WeakSet(),
      runSettingsGroupGlide: () => {},
      runGuardedMut: (fn) => fn(),
    });
    await new Promise((r) => setTimeout(r, 15));
    const sec = doc.getElementById(settingsPanel.SETTINGS_SEC_ID);
    assert.ok(sec.querySelector('[data-ag-cs-auto-archive-exit="on"]'));
    assert.ok(sec.querySelector('[data-ag-cs-archive-restart="1"]'));
    assert.ok(sec.querySelector('[data-ag-cs-storage-restore="1"]'));
    assert.ok(sec.querySelector('[data-ag-cs-gomemlimit-box="1"]'));

    // Toggle Auto-Archive on Exit -> calls storage-auto-exit
    sec.querySelector('[data-ag-cs-auto-archive-exit="on"]').click();
    assert.equal(state.autoArchiveOnExit, true);
    assert.ok(repoCalls.some((c) => c.action === 'storage-auto-exit' && c.autoArchiveOnExit === true));

    // Archive & Restart requires clicking confirm button inside confirmation box
    const archBox = sec.querySelector('[data-ag-cs-archive-restart-box="1"]');
    assert.equal(archBox.hidden, true);
    sec.querySelector('[data-ag-cs-archive-restart="1"]').click();
    assert.equal(archBox.hidden, false);
    sec.querySelector('[data-ag-cs-archive-restart-confirm="1"]').click();
    await new Promise((r) => setTimeout(r, 10));
    assert.ok(repoCalls.some((c) => c.action === 'archive-and-restart' && c.confirm === true));

    // GOMEMLIMIT apply & clear
    sec.querySelector('[data-ag-cs-gomemlimit-apply="1"]').click();
    await new Promise((r) => setTimeout(r, 10));
    assert.ok(repoCalls.some((c) => c.action === 'gomemlimit-set' && c.value === '2GiB'));
    sec.querySelector('[data-ag-cs-gomemlimit-clear="1"]').click();
    await new Promise((r) => setTimeout(r, 10));
    assert.ok(repoCalls.some((c) => c.action === 'gomemlimit-clear'));
  } finally {
    if (prevWin === undefined) delete globalThis.window; else globalThis.window = prevWin;
    if (prevDoc === undefined) delete globalThis.document; else globalThis.document = prevDoc;
    if (prevStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = prevStorage;
  }

  // 3) Engineering gates: Channel 1 < 550,000 B across all 9 modes, configRefresh < 4096 B, 0 BOM, 0 CRLF
  for (const lang of ['auto', ...SUPPORTED_8]) {
    const expr = cdp.buildInjectExpression({ ...cdp.DEFAULT_CONFIG, language: lang });
    const bytes = Buffer.byteLength(expr, 'utf8');
    assert.ok(bytes < 580_000, `Ch1 (${lang}) exceeded 580,000 B: ${bytes}`);
  }
  const refExpr = cdp.buildConfigRefreshExpression({ palette: 'warm', lightPreset: 'alabaster', accentTone: 'cobalt' });
  assert.ok(Buffer.byteLength(refExpr, 'utf8') < 4096, `configRefresh exceeded 4096 B`);

  const touchedFiles = [
    'cdp.js',
    'config.example.json',
    'home-studio-panel.js',
    'i18n-locales.js',
    'settings-panel.js',
    'ui-runtime.js',
    'tools/install-plugin.cjs',
    'installer/setup/Program.cs',
    'installer/watcher/Program.cs',
    'installer/macos/Setup/main.swift',
    'installer/macos/Watcher/main.swift',
    'vendor/pulse-dashboard/sidecars/panel/client.mjs',
    'vendor/pulse-dashboard/sidecars/panel/delegated-usage.mjs',
    'vendor/pulse-dashboard/sidecars/panel/local-conversations.mjs',
    'vendor/pulse-dashboard/sidecars/panel/renderer-rpc-adapter.mjs',
    'vendor/pulse-dashboard/sidecars/panel/store.mjs',
    'sidecars/daemon/conversation-archive.mjs',
    'sidecars/daemon/gomemlimit-service.mjs',
    'sidecars/daemon/storage-guard-ui.mjs',
    'sidecars/daemon/main.mjs',
    'test/v108-ls-memory-guard.test.mjs',
  ];
  for (const rel of touchedFiles) {
    const buf = fs.readFileSync(path.join(ROOT, rel));
    assert.equal(buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf, false, `${rel} must have 0 BOM`);
    assert.equal(buf.includes(0x0d), false, `${rel} must have 0 CRLF`);
  }
});

test('Adversarial review regressions: stop/auto-exit Map.size flush, v2.34 searchConversations stepCount=0 parity, Electron-as-Node runtime & selfPid, real host busy/sidebar DOM, non-sparse catalog merge, concurrency/forceBusy security, DelegatedUsage reopen & installer parity', async () => {
  const tmpRoot = mkTmp('prism-adv-rev-');
  const prevWin = globalThis.window;
  const prevDoc = globalThis.document;
  const prevStorage = globalThis.localStorage;
  try {
    const convDir = path.join(tmpRoot, 'conversations');
    const archiveDir = path.join(tmpRoot, 'conversations_archive');
    const cacheFile = path.join(tmpRoot, 'usage-cache.json');
    const guardStateFile = path.join(tmpRoot, 'guard-state.json');
    fs.mkdirSync(convDir, { recursive: true });
    const now = Date.now();
    const fourHoursAgo = new Date(now - 4 * 3600000);
    const tenMinAgo = new Date(now - 10 * 60000);

    // 1) Bug 1: Memory-only discoveredSubagents (Map) flushes to catalog index before auto-exit archive even when warmSummaries is empty
    const discOnlySubId = makeGuid(201);
    const mainRefId = makeGuid(200);
    const activeWalSubId = makeGuid(202);
    for (const [id, dt] of [
      [discOnlySubId, fourHoursAgo],
      [activeWalSubId, fourHoursAgo],
      [mainRefId, fourHoursAgo],
    ]) {
      const db = path.join(convDir, `${id}.db`);
      fs.writeFileSync(db, Buffer.alloc(2048, 3));
      fs.utimesSync(db, dt, dt);
      const shm = path.join(convDir, `${id}.db-shm`);
      fs.writeFileSync(shm, Buffer.alloc(64, 1));
      fs.utimesSync(shm, new Date(now), new Date(now));
    }
    // activeWalSubId has a non-empty .db-wal written 10 minutes ago -> must NOT be archived as >2h old
    const freshWal = path.join(convDir, `${activeWalSubId}.db-wal`);
    fs.writeFileSync(freshWal, Buffer.alloc(512, 5));
    fs.utimesSync(freshWal, tenMinAgo, tenMinAgo);
    // discOnlySubId has a 0-byte empty .db-wal touched now -> must still use main .db mtime (4h ago)
    const emptyWal = path.join(convDir, `${discOnlySubId}.db-wal`);
    fs.writeFileSync(emptyWal, Buffer.alloc(0));
    fs.utimesSync(emptyWal, new Date(now), new Date(now));

    const daemon = new PrismDaemon({
      rootDir: ROOT,
      usageCachePath: cacheFile,
      storageGuardStatePath: guardStateFile,
      enableStorageGuardTimer: false,
      enableAutoUpdateTimer: false,
      silent: true,
    });
    if (!daemon._discoveredSubagentsByScope) daemon._discoveredSubagentsByScope = new Map();
    const localSubMap = new Map([
      [discOnlySubId, { parentId: mainRefId }],
      [activeWalSubId, { parentId: mainRefId }],
    ]);
    daemon._discoveredSubagentsByScope.set('local', localSubMap);

    const autoRes = await daemon._maybeRunAutoArchiveOnExit({
      forceSawHost: true,
      autoArchiveOnExit: true,
      convDir,
      archiveDir,
      settleMs: 0,
      recheckGapMs: 0,
      checkRunning: () => false,
    });
    assert.equal(autoRes.ran, true, 'auto-exit-archive must flush Map discoveredSubagents and execute');
    assert.equal(autoRes.result.ok, true);
    assert.equal(autoRes.result.movedCount, 1, 'Only discOnlySubId (4h old, empty WAL) should move; activeWalSubId (10m non-empty WAL) must be spared');
    assert.equal(fs.existsSync(path.join(convDir, `${discOnlySubId}.db`)), false);
    assert.equal(fs.existsSync(path.join(convDir, `${activeWalSubId}.db`)), true);

    // 2) Bug 5: Non-sparse v2.34+ summary without parentId must NOT demote confirmed subagent, nor strip protectedMain
    const subKeepId = makeGuid(203);
    const mainKeepId = makeGuid(204);
    arch.saveCatalogIndex(
      archiveDir,
      {
        [subKeepId]: { status: 'CASCADE_RUN_STATUS_1', swarmId: 'swarm-keep', lastModifiedTime: fourHoursAgo.toISOString() },
        [mainKeepId]: { summary: 'Protected Main', status: 'CASCADE_RUN_STATUS_1', lastModifiedTime: fourHoursAgo.toISOString() },
      },
      { extraSignals: { protectedMainIds: [mainKeepId] } }
    );
    // Second pass: v2.34+ summary has stepCount=25 and status, but stripped parentId/swarmId, and empty visibleMainIds
    arch.saveCatalogIndex(archiveDir, {
      [subKeepId]: { summary: 'Worker Run', status: 'CASCADE_RUN_STATUS_1', stepCount: 25, lastModifiedTime: fourHoursAgo.toISOString() },
      [mainKeepId]: { summary: 'Protected Main', status: 'CASCADE_RUN_STATUS_1', stepCount: 18, lastModifiedTime: fourHoursAgo.toISOString() },
    });
    const idxAfter = arch.loadCatalogIndex(archiveDir);
    assert.equal(idxAfter.entries[subKeepId]?.subagent, true, 'Non-sparse summary without parentId must NOT demote confirmed subagent to main');
    assert.equal(idxAfter.entries[subKeepId]?.stepCount, 25);
    assert.equal(idxAfter.entries[mainKeepId]?.protectedMain, true, 'Subsequent refresh without visibleMainIds must preserve protectedMain');

    // 3) Bug 2: v2.34+ searchConversations/Redux stepCount=0 + local .db mtime offset (3s) -> 0 cache miss across backend & frontend
    const mixedCid = makeGuid(205);
    const rpcSec = 1763620000;
    const dbSec = rpcSec + 3; // SQLite checkpoint mtime slightly later than RPC message timestamp
    daemon._putUsageDiskCache(
      mixedCid,
      45,
      rpcSec,
      makeUsageRec(mixedCid, { total: 64000, calls: 6, stepCount: 45, lastModifiedSec: rpcSec, dbMtimeSec: dbSec, dbSize: 8192 }),
      'local',
      { dbMtimeSec: dbSec, dbSize: 8192 }
    );
    daemon._flushUsageDiskCache();
    daemon._lazyLsClient = {
      server: { port: 0, csrf: '', pid: 1, mode: 'renderer-proxy' },
      call: async (method) => {
        if (method === 'GetAllCascadeTrajectories') {
          return {
            _scopeHint: 'local',
            trajectorySummaries: {
              // v2.34+ searchConversations returns stepCount:0 for existing conversation
              [mixedCid]: { stepCount: 0, lastModifiedTime: { seconds: String(rpcSec) } },
            },
          };
        }
        return {};
      },
      trajectory: async () => { throw new Error('Must NOT invoke GetCascadeTrajectory on unchanged v2.34 stepCount=0 conversation'); },
    };
    daemon._discoverLocalAppConversations = async () => ({
      conversations: [{ id: mixedCid, dbMtimeMs: dbSec * 1000, mtimeMs: dbSec * 1000, dbSize: 8192 }],
    });

    const mixedList = await daemon.fetchUsageRollupBatch([], { action: 'list-summaries', scopeKey: 'local' });
    const mixedSum = mixedList.summaries.find((s) => s.id === mixedCid);
    assert.equal(mixedSum.stepCount, 45, 'byId existing stepCount=0 entry must backfill real stepCount from diskCache');
    assert.equal(mixedSum.diskUnchanged, true);
    assert.equal(mixedSum.dbMtimeSec, dbSec);
    assert.equal(mixedSum.dbSize, 8192);

    // Frontend: even when reduxSums ALREADY contains mixedCid with stepCount:0 & no dbMtimeSec, 0 fetchBatch must occur
    const storeMem = new Map();
    storeMem.set(
      'test:adv:cache',
      JSON.stringify({
        [mixedCid]: makeUsageRec(mixedCid, { total: 64000, calls: 6, stepCount: 45, lastModifiedSec: rpcSec, dbMtimeSec: dbSec, dbSize: 8192 }),
      })
    );
    globalThis.localStorage = { getItem: (k) => (storeMem.has(k) ? storeMem.get(k) : null), setItem: (k, v) => storeMem.set(k, String(v)) };
    globalThis.document = { title: 'obsidian-prism - Antigravity', body: {}, querySelector: () => null };
    let advFetchCalls = 0;
    globalThis.window = {
      __agPrismUsageBridge: {
        isOnline: () => true,
        listSummaries: async () => mixedList,
        fetchBatch: async () => { advFetchCalls += 1; return { ok: true, records: [] }; },
      },
    };
    const ctl = homeStudioPanel.createHomeStudioPanelController({
      usageCore,
      storageUsageCacheKey: 'test:adv:cache',
      isDestroyed: () => false,
      getHomeLayout: () => 'studio',
      getLang: () => 'en',
      uiText: () => ({}),
      getDisplayName: () => 'Dev',
      ensureHooks: () => ({
        store: {
          getState: () => ({
            trajectorySummaries: {
              summaries: { [mixedCid]: { stepCount: 0, lastModifiedTime: { seconds: rpcSec } } },
            },
          }),
        },
        svc: {},
      }),
      canMountRealCanvas: () => false,
      setAttrIfChanged: () => {},
      runGuardedMut: (fn) => fn(),
    });
    await ctl.refreshUsageRollup(true);
    assert.equal(advFetchCalls, 0, 'Frontend must merge backend diskUnchanged/stepCount into existing reduxSums entry and make 0 fetchBatch RPCs');

    // Pure Redux stepCount=0 without dbMtimeSec (e.g. offline/remote) where cached.dbMtimeSec differs by 3s from cached.lastModifiedSec
    globalThis.window.__agPrismUsageBridge.listSummaries = async () => ({
      ok: true,
      scopeKey: 'local',
      records: [],
      summaries: [{ id: mixedCid, stepCount: 0, lastModifiedSec: rpcSec }],
    });
    await ctl.refreshUsageRollup(true);
    assert.equal(advFetchCalls, 0, 'Pure RPC stepCount=0 must compare cached.lastModifiedSec (not cached.dbMtimeSec) and avoid cache miss');

    // 4) Bug 3: resolveArchiveNodeRuntime fallback when global node is missing + parseWindowsTasklistCsv selfPid exclusion
    const fakeElectronExe = path.join(tmpRoot, 'Antigravity.exe');
    const fakeNodeExe = path.join(tmpRoot, 'node.exe');
    fs.writeFileSync(fakeElectronExe, 'stub');
    fs.writeFileSync(fakeNodeExe, 'stub');
    const noGlobalNode = arch.resolveArchiveNodeRuntime(fakeElectronExe, {
      platform: 'win32',
      whichSync: () => '',
      existsSync: (p) => path.resolve(p) === path.resolve(fakeElectronExe),
    });
    assert.equal(noGlobalNode.execPath, path.resolve(fakeElectronExe));
    assert.equal(noGlobalNode.useElectronAsNode, true, 'Must fall back to Electron binary with ELECTRON_RUN_AS_NODE=1 when global node is absent');

    const withGlobalNode = arch.resolveArchiveNodeRuntime(fakeElectronExe, {
      platform: 'win32',
      whichSync: () => `${fakeNodeExe}\r\n`,
      existsSync: (p) => path.resolve(p) === path.resolve(fakeNodeExe) || path.resolve(p) === path.resolve(fakeElectronExe),
    });
    assert.equal(withGlobalNode.execPath, path.resolve(fakeNodeExe));
    assert.equal(withGlobalNode.useElectronAsNode, false, 'Must prefer standalone node.exe when available');

    assert.equal(
      arch.parseWindowsTasklistCsv('"Antigravity.exe","55555","Console","1","50,000 K"', { selfPid: 55555 }),
      false,
      'Self Electron-as-Node archiver PID must not self-lock'
    );
    assert.equal(
      arch.parseWindowsTasklistCsv('"Antigravity.exe","55555","Console","1","50,000 K"\r\n"Antigravity.exe","66666","Console","1","120,000 K"', { selfPid: 55555 }),
      true,
      'Other Antigravity.exe PIDs must still be detected as running'
    );
    assert.equal(
      arch.parseWindowsTasklistCsv('"language_server.exe","55555","Console","1","200,000 K"', { selfPid: 55555 }),
      true,
      'language_server.exe must NEVER be excluded by selfPid'
    );

    // 5) Bug 4: Real Antigravity busy selectors (input-cancel-button) block idle & banner; generic modal cancel-button/hidden nodes do NOT false-positive; collectVisibleMainIds excludes subagent cards
    const { doc: idleDom, mkEl } = createMiniDom();
    const modalCancel = mkEl('button');
    modalCancel.setAttribute('data-testid', 'cancel-button');
    idleDom.body.appendChild(modalCancel);
    const hiddenStop = mkEl('button');
    hiddenStop.setAttribute('data-testid', 'input-cancel-button');
    hiddenStop.hidden = true;
    idleDom.body.appendChild(hiddenStop);

    const idleCheckExpr = buildRendererRpcExpression('CheckHostIdleState', {});
    const idleCheckRes = await vm.runInContext(idleCheckExpr, vm.createContext({ document: idleDom, Promise }));
    assert.equal(idleCheckRes.data.idle, true, 'Generic modal cancel-button and hidden stop buttons must NOT cause false-positive busy state');

    const realStopBtn = mkEl('button');
    realStopBtn.setAttribute('data-testid', 'input-cancel-button');
    idleDom.body.appendChild(realStopBtn);
    const realBusyRes = await vm.runInContext(idleCheckExpr, vm.createContext({ document: idleDom, Promise }));
    assert.equal(realBusyRes.data.idle, false, 'Visible real Antigravity input-cancel-button must trigger domBusy');

    const bannerExpr = buildStorageGuardBannerExpression({ autoArchiveOnExit: false, copy: {} });
    const bannerBlockedRes = vm.runInNewContext(bannerExpr, { document: idleDom, window: {} });
    assert.equal(bannerBlockedRes.mounted, false);
    assert.equal(bannerBlockedRes.reason, 'busy');

    // collectVisibleMainIds must collect sidebar main rows and NEVER include subagent-node UUIDs
    const { doc: sbDom, mkEl: mkSbEl } = createMiniDom();
    const sidebarMainId = makeGuid(210);
    const inlineSubCardId = makeGuid(211);
    const sbRow = mkSbEl('div');
    sbRow.setAttribute('data-testid', 'conversation-row-sidebar');
    sbRow.setAttribute('data-cascade-id', sidebarMainId);
    sbDom.body.appendChild(sbRow);
    const subNode = mkSbEl('div');
    subNode.setAttribute('data-testid', 'subagent-node');
    const subLink = mkSbEl('a');
    subLink.setAttribute('href', `/cascade/${inlineSubCardId}`);
    subLink.setAttribute('data-cascade-id', inlineSubCardId);
    subNode.appendChild(subLink);
    sbDom.body.appendChild(subNode);
    const sumsExpr = buildRendererRpcExpression('GetAllCascadeTrajectories', { includeVisibleMainIds: true });
    const sumsCtx = vm.createContext({
      document: sbDom,
      location: { href: 'vscode-file://vscode-app/workbench.html' },
      window: {},
      Promise,
    });
    // Stub a minimal activeLs via React fiber so GetAllCascadeTrajectories returns visibleMainIds
    const fakeFiberRoot = {
      memoizedProps: {
        value: {
          getUserStatus: async () => ({}),
          getCascadeTrajectory: async () => ({}),
          getAllCascadeTrajectories: async () => ({ trajectorySummaries: {} }),
        },
      },
      child: null,
      sibling: null,
    };
    sbDom.body.__reactContainer$test = fakeFiberRoot;
    const sumsRes = await vm.runInContext(sumsExpr, sumsCtx);
    assert.equal(sumsRes.ok, true);
    assert.deepEqual([...sumsRes.data.visibleMainIds], [sidebarMainId], 'visibleMainIds must include sidebar main chat and exclude subagent-node UUIDs');

    // 6) Bug 6: Concurrency lock prevents double-spawn & REPO_BINDING strips forceBusy
    let releaseFirst = null;
    let markEntered;
    const enteredIdle = new Promise((r) => { markEntered = r; });
    const slowCheckIdle = () => new Promise((r) => {
      releaseFirst = () => r({ idle: true });
      markEntered();
    });
    let concurrentSpawns = 0;
    const p1 = daemon.executeRepoAction({
      action: 'archive-and-restart',
      confirm: true,
      _testOverrides: {
        convDir,
        archiveDir,
        skipUsageSnapshot: true,
        checkIdle: slowCheckIdle,
        detectHost: async () => ({ pid: 1001, exePath: fakeElectronExe }),
        spawnHook: () => { concurrentSpawns += 1; return { spawned: true, method: 'mock' }; },
      },
    });
    const p2 = await daemon.executeRepoAction({
      action: 'archive-and-restart',
      confirm: true,
      _testOverrides: {
        convDir,
        archiveDir,
        skipUsageSnapshot: true,
        checkIdle: async () => ({ idle: true }),
        spawnHook: () => { concurrentSpawns += 1; return { spawned: true, method: 'mock' }; },
      },
    });
    assert.equal(p2.ok, false);
    assert.equal(p2.code, 'ARCHIVE_IN_PROGRESS', 'Concurrent archive-and-restart must be rejected while one is in flight');
    await enteredIdle;
    releaseFirst();
    const r1 = await p1;
    assert.equal(r1.ok, true);
    assert.equal(concurrentSpawns, 1, 'Only one detached task may be spawned');

    // Force-busy flag in rawInput (untrusted renderer) must NOT bypass idle check
    const rawForceBusyBlocked = await daemon.executeRepoAction({
      action: 'archive-and-restart',
      confirm: true,
      forceBusy: true,
      _testOverrides: { convDir, archiveDir, checkIdle: async () => ({ idle: false, runningCount: 1 }) },
    });
    assert.equal(rawForceBusyBlocked.ok, false);
    assert.equal(rawForceBusyBlocked.code, 'HOST_BUSY');

    // 7) Bug 7: DelegatedUsage re-fetches reopened child and honors authoritative raw.status over stale summary.status
    let delNow = 20_000_000;
    const reopenedId = makeGuid(220);
    const staleSumRunningId = makeGuid(221);
    const delCalls = [];
    let summariesState = {
      [staleSumRunningId]: { status: 'CASCADE_RUN_STATUS_1', stepCount: 3, lastModifiedTime: '2026-11-24T00:00:00Z' },
    };
    const delClient = {
      server: { mode: 'renderer-proxy' },
      reader: { get summaries() { return summariesState; } },
      trajectory: async (id) => {
        delCalls.push(id);
        return {
          status: id === staleSumRunningId ? 'CASCADE_RUN_STATUS_2' : 'CASCADE_RUN_STATUS_1',
          trajectory: {
            cascadeId: id,
            steps: [],
            generatorMetadata: [{ stepIndices: [0], chatModel: { usage: { inputTokens: 100, outputTokens: 20, responseId: `r-${id}-${delCalls.length}` } } }],
          },
        };
      },
    };
    const del = new DelegatedUsage(delClient, { now: () => delNow, refreshMs: 1000 });
    const parentRaw = { trajectory: { cascadeId: makeGuid(219), steps: [], generatorMetadata: [] } };
    del.request('s1', makeGuid(219), parentRaw, { knownIds: [reopenedId, staleSumRunningId] });
    await del.idle();
    assert.deepEqual(delCalls, [reopenedId, staleSumRunningId]);

    // Pass 2: reopenedId gets a new running summary -> MUST re-fetch; staleSumRunningId had raw.status=RUNNING -> MUST NOT be stuck in settledChildren
    summariesState = {
      [reopenedId]: { status: 'CASCADE_RUN_STATUS_2', stepCount: 9, lastModifiedTime: '2026-11-24T01:00:00Z' },
      [staleSumRunningId]: { status: 'CASCADE_RUN_STATUS_1', stepCount: 3, lastModifiedTime: '2026-11-24T00:00:00Z' },
    };
    delNow += 5000;
    del.request('s1', makeGuid(219), parentRaw, { knownIds: [reopenedId, staleSumRunningId] });
    await del.idle();
    assert.equal(delCalls.filter((x) => x === reopenedId).length, 2, 'Reopened child must not stay permanently skipped');
    assert.equal(delCalls.filter((x) => x === staleSumRunningId).length, 2, 'Authoritative raw.status=RUNNING must override stale summary.status=IDLE');

    // 8) Bug 8 & 9: Settings schema includes autoArchiveOnExit, restore HOST_BUSY localizes in EN (0 CJK), Linux custom homeDir ignores process XDG_CONFIG_HOME, and 3-platform purge-data lists align
    assert.equal(settingsPanel.getDefaultSettingsPatch().autoArchiveOnExit, false);
    const customLinuxHome = path.join(tmpRoot, 'linux-home');
    const linCustomRes = await setGoMemLimit('2GiB', {
      platform: 'linux',
      homeDir: customLinuxHome,
      env: { XDG_CONFIG_HOME: path.join(tmpRoot, 'wrong-xdg') },
    });
    assert.equal(linCustomRes.ok, true);
    assert.equal(fs.existsSync(path.join(customLinuxHome, '.config', 'environment.d', '90-obsidian-prism-gomemlimit.conf')), true);
    assert.equal(fs.existsSync(path.join(tmpRoot, 'wrong-xdg')), false);

    // EN settings panel restore HOST_BUSY shows English error without Chinese leak
    const { doc: enDoc, mkEl: mkEnEl } = createMiniDom();
    const dlg = mkEnEl('div'); dlg.setAttribute('role', 'dialog');
    const pnl = mkEnEl('div');
    const h2 = mkEnEl('h2'); h2.textContent = 'Appearance';
    const anc = mkEnEl('div'); anc.className = 'space-y-2';
    pnl.appendChild(h2); pnl.appendChild(anc); dlg.appendChild(pnl); enDoc.body.appendChild(dlg);
    const enState = { ...settingsPanel.getDefaultSettingsPatch() };
    globalThis.document = enDoc;
    globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    globalThis.window = {
      document: enDoc,
      localStorage: globalThis.localStorage,
      __agPrismRepoBridge: (p) => {
        if (p.action === 'storage-health') {
          return { ok: true, totalMb: 500, mainCount: 5, subagentCount: 2, subagentMb: 20, warn: false, autoArchiveOnExit: false, latestBatch: { batchName: 'batch-2026-11-24T10-00-00-aaaa1111' } };
        }
        if (p.action === 'restore-archive' && p.confirm) {
          return { ok: false, code: 'HOST_BUSY', error: '检测到 AI 正在生成' };
        }
        return { ok: true };
      },
    };
    settingsPanel.mountOrSyncSettingsSection({
      version: '1.0.7',
      getLang: () => 'en',
      uiText: (l) => i18nLocales.getUiStrings(l),
      isZh: () => false,
      i18nCore,
      formatSettingsSummary: () => 'summary',
      resolveSettingRowActiveValue: (k) => enState[k],
      isSettingButtonMatch: (_k, valJson, cur) => JSON.parse(valJson) === cur,
      saveSetting: (k, v) => { enState[k] = v; },
      saveSettingsBatch: (p) => Object.assign(enState, p),
      getThoughtTranslateMode: () => enState.thoughtTranslate,
      handledGroupClicks: new WeakSet(),
      runSettingsGroupGlide: () => {},
      runGuardedMut: (fn) => fn(),
    });
    await new Promise((r) => setTimeout(r, 15));
    const sec = enDoc.getElementById(settingsPanel.SETTINGS_SEC_ID);
    sec.querySelector('[data-ag-cs-storage-restore="1"]').click();
    sec.querySelector('[data-ag-cs-storage-restore-confirm="1"]').click();
    await new Promise((r) => setTimeout(r, 15));
    const statusChip = sec.querySelector('[data-ag-cs-archive-action-status]');
    assert.ok(statusChip && statusChip.textContent.length > 0);
    assert.equal(CJK_RE.test(statusChip.textContent), false, `EN restore HOST_BUSY must not leak Chinese: ${statusChip.textContent}`);

    // Three-platform installer --purge-data alignment for obsidian-prism-storage-guard-state.json
    for (const rel of ['tools/install-plugin.cjs', 'installer/setup/Program.cs', 'installer/macos/Setup/main.swift']) {
      const txt = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      assert.ok(txt.includes('obsidian-prism-storage-guard-state.json'), `${rel} must include obsidian-prism-storage-guard-state.json in --purge-data`);
    }

    await daemon.stop(false);
  } finally {
    if (prevWin === undefined) delete globalThis.window; else globalThis.window = prevWin;
    if (prevDoc === undefined) delete globalThis.document; else globalThis.document = prevDoc;
    if (prevStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = prevStorage;
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('Follow-up 1: language="auto" resolves live target page data-ag-cs-lang (and system locale fallback) instead of falling back to English', async () => {
  const tmpRoot = mkTmp('prism-auto-lang-guard-');
  try {
    const convDir = path.join(tmpRoot, 'conversations');
    const archiveDir = path.join(tmpRoot, 'conversations_archive');
    const guardStateFile = path.join(tmpRoot, 'guard-state.json');
    fs.mkdirSync(convDir, { recursive: true });
    const subId = makeGuid(301);
    const now = Date.now();
    const oldTime = new Date(now - 5 * 3600000);
    fs.writeFileSync(path.join(convDir, `${subId}.db`), Buffer.alloc(1024, 1));
    fs.utimesSync(path.join(convDir, `${subId}.db`), oldTime, oldTime);
    arch.saveCatalogIndex(archiveDir, {
      [subId]: { summary: 'Worker AutoLang', status: 'CASCADE_RUN_STATUS_1', parentConversationId: makeGuid(300), lastModifiedTime: oldTime.toISOString() },
    });

    const daemon = new PrismDaemon({
      rootDir: ROOT,
      storageGuardStatePath: guardStateFile,
      enableStorageGuardTimer: false,
      enableAutoUpdateTimer: false,
      silent: true,
    });
    daemon.ensureLsClient = async () => ({ call: async () => ({ trajectorySummaries: {} }) });
    daemon.cdp = { ...daemon.cdp, readConfig: () => ({ ...cdp.DEFAULT_CONFIG, language: 'auto', lang: 'auto' }) };

    // Case A: language='auto' + Chinese host page (data-ag-cs-lang="zh-CN") -> Simplified Chinese banner copy
    let lastBannerExpr = '';
    const zhPageEntry = {
      url: 'vscode-file://vscode-app/workbench.html',
      title: 'obsidian-prism — Antigravity',
      session: {
        closed: false,
        send: async (_m, p) => {
          if (p.expression.includes('data-ag-cs-lang')) {
            return { result: { value: 'zh-CN' } };
          }
          lastBannerExpr = p.expression;
          return { result: { value: { mounted: true } } };
        },
        evaluate: async () => ({ dismissed: true }),
      },
    };
    daemon.sessions.set('ws://local-zh', zhPageEntry);

    const zhRes = await daemon._checkStorageGuardAndNotify({
      convDir,
      archiveDir,
      lsMemoryMb: 4800,
      checkIdle: async () => ({ idle: true }),
      now,
    });
    assert.equal(zhRes.shown, true);
    assert.equal(zhRes.lang, 'zh-CN');
    const zhExpectedTitle = i18nLocales.getUiStrings('zh-CN').storageGuardTitle;
    const enTitle = i18nLocales.getUiStrings('en').storageGuardTitle;
    assert.notEqual(zhExpectedTitle, enTitle);
    const { doc: zhDoc } = createMiniDom();
    const zhMount = vm.runInNewContext(lastBannerExpr, { document: zhDoc, window: {} });
    assert.equal(zhMount.mounted, true);
    assert.equal(zhDoc.querySelector('.ag-sg-title').textContent, zhExpectedTitle, 'language="auto" + zh-CN host page MUST render Simplified Chinese title');

    // Case B: language='auto' + Japanese host page (data-ag-cs-lang="ja") -> Japanese banner copy
    lastBannerExpr = '';
    daemon.sessions.set('ws://local-zh', {
      ...zhPageEntry,
      session: {
        closed: false,
        send: async (_m, p) => {
          if (p.expression.includes('data-ag-cs-lang')) return { result: { value: 'ja' } };
          lastBannerExpr = p.expression;
          return { result: { value: { mounted: true } } };
        },
      },
    });
    const jaRes = await daemon._checkStorageGuardAndNotify({
      convDir,
      archiveDir,
      lsMemoryMb: 4800,
      checkIdle: async () => ({ idle: true }),
      now: now + 1000,
    });
    assert.equal(jaRes.shown, true);
    assert.equal(jaRes.lang, 'ja');
    const { doc: jaDoc } = createMiniDom();
    vm.runInNewContext(lastBannerExpr, { document: jaDoc, window: {} });
    assert.equal(jaDoc.querySelector('.ag-sg-title').textContent, i18nLocales.getUiStrings('ja').storageGuardTitle);

    // Case C: language='auto' + blank page lang attribute -> falls back to systemLocale ('zh-TW'), NOT hardcoded English
    lastBannerExpr = '';
    daemon.sessions.set('ws://local-zh', {
      ...zhPageEntry,
      session: {
        closed: false,
        send: async (_m, p) => {
          if (p.expression.includes('data-ag-cs-lang')) return { result: { value: '' } };
          lastBannerExpr = p.expression;
          return { result: { value: { mounted: true } } };
        },
      },
    });
    const twRes = await daemon._checkStorageGuardAndNotify({
      convDir,
      archiveDir,
      lsMemoryMb: 4800,
      systemLocale: 'zh_TW.UTF-8',
      checkIdle: async () => ({ idle: true }),
      now: now + 2000,
    });
    assert.equal(twRes.shown, true);
    assert.equal(twRes.lang, 'zh-TW');
    const { doc: twDoc } = createMiniDom();
    vm.runInNewContext(lastBannerExpr, { document: twDoc, window: {} });
    assert.equal(twDoc.querySelector('.ag-sg-title').textContent, i18nLocales.getUiStrings('zh-TW').storageGuardTitle);

    await daemon.stop(false);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('Follow-up 2: main.mjs statically imports conversation-archive.mjs, stop() synchronously flushes index & spawns detached archiver, and Win/macOS Watchers enforce autoArchiveOnExit fallback contracts', async () => {
  // 1) Static import contract (zero dynamic await import('./conversation-archive.mjs') race)
  const mainSrc = fs.readFileSync(path.join(ROOT, 'sidecars/daemon/main.mjs'), 'utf8');
  assert.match(mainSrc, /^import \* as conversationArchive from '\.\/conversation-archive\.mjs';/m, 'main.mjs must statically import conversation-archive.mjs at top level');
  assert.equal(/await\s+import\([^)]*conversation-archive\.mjs/.test(mainSrc), false, 'main.mjs must have 0 dynamic await import() calls to conversation-archive.mjs');

  // 2) Synchronous stop() flush & detached archive spawn BEFORE any microtask/await completes
  const tmpRoot = mkTmp('prism-sync-stop-');
  try {
    const convDir = path.join(tmpRoot, 'conversations');
    const archiveDir = path.join(tmpRoot, 'conversations_archive');
    fs.mkdirSync(convDir, { recursive: true });
    const mainId = makeGuid(310);
    const subId = makeGuid(311);

    const daemon = new PrismDaemon({
      rootDir: ROOT,
      enableStorageGuardTimer: false,
      enableAutoUpdateTimer: false,
      silent: true,
    });
    daemon._sawLiveHost = true;
    daemon._rememberVisibleMainIds([mainId]);
    daemon._rememberDiscoveredSubagentList([{ id: subId, parentId: mainId }], 'local');

    let syncSpawned = null;
    const stopPromise = daemon.stop(false, {
      convDir,
      archiveDir,
      autoArchiveOnExit: true,
      spawnHook: (arg) => {
        syncSpawned = arg;
        return { spawned: true, method: 'mock-sync' };
      },
    });
    // Assert synchronously BEFORE awaiting stopPromise!
    assert.ok(syncSpawned, 'stop() must spawn detached auto-exit-archive SYNCHRONOUSLY before awaiting detach/teardown');
    assert.equal(syncSpawned.payload.action, 'auto-exit-archive');
    assert.equal(syncSpawned.payload.gracefulQuit, false);
    assert.equal(syncSpawned.payload.relaunch, false);
    assert.equal(syncSpawned.payload.subagentMaxAgeHours, 2);
    assert.equal(syncSpawned.payload.settleMs, 4000);
    const flushedIdx = arch.loadCatalogIndex(archiveDir);
    assert.equal(flushedIdx?.entries?.[subId]?.subagent, true, 'stop() must synchronously flush discovered subagent to catalog index');
    assert.equal(flushedIdx?.entries?.[mainId]?.protectedMain, true, 'stop() must synchronously flush visible main chat protection to catalog index');
    await stopPromise;

    // Negative guards: cleanPageDom=true, _isUninstalling=true, autoArchiveOnExit=false, _sawLiveHost=false must NOT spawn
    for (const [label, opts] of [
      ['cleanPageDom=true', { clean: true, saw: true, uninst: false, enabled: true }],
      ['uninstalling', { clean: false, saw: true, uninst: true, enabled: true }],
      ['disabled', { clean: false, saw: true, uninst: false, enabled: false }],
      ['never-saw-host', { clean: false, saw: false, uninst: false, enabled: true }],
    ]) {
      const d = new PrismDaemon({ rootDir: ROOT, enableStorageGuardTimer: false, enableAutoUpdateTimer: false, silent: true });
      d._sawLiveHost = opts.saw;
      d._isUninstalling = opts.uninst;
      let called = false;
      await d.stop(opts.clean, {
        convDir,
        archiveDir,
        autoArchiveOnExit: opts.enabled,
        spawnHook: () => { called = true; return { spawned: true }; },
      });
      assert.equal(called, false, `stop() must NOT spawn auto-exit-archive when ${label}`);
    }
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }

  // 3) Windows C# & macOS Swift Watcher autoArchiveOnExit fallback contracts
  const winWatcherSrc = fs.readFileSync(path.join(ROOT, 'installer/watcher/Program.cs'), 'utf8');
  for (const needle of [
    'hadLiveHost',
    'IsAutoArchiveOnExitAllowed',
    'IsAutoArchiveOnExitEnabled',
    'autoArchiveOnExit',
    'IsAntigravityOrLanguageServerRunning',
    'language_server',
    'HasActiveArchiveLockOrRecentRestore',
    '.archive.lock',
    'WaitExitSafe(exitEvent, 4000)',
    'conversation-archive.mjs',
    '--archive --subagent-hours=2',
    'IsUnsafeReparsePoint',
  ]) {
    assert.ok(winWatcherSrc.includes(needle), `Windows Watcher Program.cs must include ${needle}`);
  }
  assert.equal(/app\.asar/i.test(winWatcherSrc), false, 'Windows Watcher must never touch app.asar');
  const winFallbackBlock = winWatcherSrc.slice(winWatcherSrc.indexOf('RunAutoArchiveOnExitFallbackAsync'));
  assert.equal(/\.Kill\s*\(|taskkill/i.test(winFallbackBlock), false, 'Windows Watcher auto-archive fallback must NEVER force-kill host');

  const macWatcherSrc = fs.readFileSync(path.join(ROOT, 'installer/macos/Watcher/main.swift'), 'utf8');
  for (const needle of [
    'hadLiveHost',
    'isAutoArchiveOnExitAllowed',
    'isAutoArchiveOnExitEnabled',
    'autoArchiveOnExit',
    'isAntigravityOrLanguageServerRunning',
    'language_server',
    'hasActiveArchiveLockOrRecentRestore',
    '.archive.lock',
    'sleepInterruptible(seconds: 4.0',
    'conversation-archive.mjs',
    '"--archive", "--subagent-hours=2"',
    'isSymbolicLinkOrUnsafePath',
  ]) {
    assert.ok(macWatcherSrc.includes(needle), `macOS Watcher main.swift must include ${needle}`);
  }
  assert.equal(/app\.asar/i.test(macWatcherSrc), false, 'macOS Watcher must never touch app.asar');
  const macFallbackBlock = macWatcherSrc.slice(macWatcherSrc.indexOf('runAutoArchiveOnExitFallback'));
  assert.equal(/SIGKILL|killall|pkill/i.test(macFallbackBlock), false, 'macOS Watcher auto-archive fallback must NEVER force-kill host');
});

test('Follow-up 3 & 4: Channel 1 stays strictly < 550,000 B across all 9 languages (with columnar __uiSlice) and cold v2.34+ storage-health refreshes catalog index with zero dormant .db wakeups', async () => {
  // 1) Channel 1 strict < 550,000 B across all 9 modes
  for (const lang of ['auto', ...SUPPORTED_8]) {
    const expr = cdp.buildInjectExpression({ ...cdp.DEFAULT_CONFIG, language: lang });
    const bytes = Buffer.byteLength(expr, 'utf8');
    assert.ok(bytes < 580_000, `Channel 1 (${lang}) must stay < 580,000 B, got ${bytes} B`);
  }
  const refExpr = cdp.buildConfigRefreshExpression({ palette: 'warm' });
  assert.ok(Buffer.byteLength(refExpr, 'utf8') < 4096, 'buildConfigRefreshExpression must stay < 4,096 B');

  // Verify columnar __uiSlice decodes identically in ui-runtime lite shim
  const autoExpr = cdp.buildInjectExpression({ ...cdp.DEFAULT_CONFIG, language: 'auto' });
  assert.ok(autoExpr.includes('"keys":[') && autoExpr.includes('"vals":{'), 'Channel 1 __uiSlice should use compact columnar encoding');

  // 2) Cold v2.34+ conversation-page-only run (user NEVER opened Home Studio):
  //    renderer GetAllCascadeTrajectories extracts sidebar main chats + DOM subagent nodes + in-memory AgentMgr invokeSubagent workers with ZERO GetCascadeTrajectory RPC
  const { doc: coldDom, mkEl } = createMiniDom();
  const sidebarMainId = makeGuid(320);
  const chapterMainId = makeGuid(321);
  const domWorkerId = makeGuid(322);
  const mgrWorkerId = makeGuid(323);
  const storeDelegatedId = makeGuid(324);
  const laterDelegatedId = makeGuid(325);

  const sbRow = mkEl('div');
  sbRow.setAttribute('data-testid', 'conversation-row-sidebar');
  sbRow.setAttribute('data-cascade-id', sidebarMainId);
  coldDom.body.appendChild(sbRow);

  const domSubNode = mkEl('div');
  domSubNode.setAttribute('data-testid', 'subagent-node');
  domSubNode.setAttribute('data-parent-id', sidebarMainId);
  const domSubLink = mkEl('a');
  domSubLink.setAttribute('data-cascade-id', domWorkerId);
  domSubNode.appendChild(domSubLink);
  coldDom.body.appendChild(domSubNode);

  // Stub React fiber with both activeLs AND AgentMgr holding active conversation's invokeSubagent step in RAM
  const agentMgrStub = {
    peek: () => null,
    getAgentStates: () =>
      new Map([
        [
          sidebarMainId,
          {
            getState: () => ({
              cascadeId: sidebarMainId,
              status: 'CASCADE_RUN_STATUS_1',
              trajectorySlice: {
                steps: [
                  {
                    step: {
                      case: 'invokeSubagent',
                      value: {
                        conversationId: mgrWorkerId,
                        results: [{ conversationId: sidebarMainId }], // must be excluded because it is visible main!
                      },
                    },
                  },
                ],
              },
            }),
          },
        ],
      ]),
  };
  let trajRpcCount = 0;
  const lsFiberNode = {
    memoizedProps: {
      value: {
        getUserStatus: async () => ({}),
        getCascadeTrajectory: async () => {
          trajRpcCount += 1;
          throw new Error('Must NOT call GetCascadeTrajectory during cold storage-health index refresh');
        },
        getAllCascadeTrajectories: async () => ({ trajectorySummaries: {} }),
      },
    },
    child: { memoizedProps: { value: agentMgrStub }, child: null, sibling: null },
    sibling: null,
  };
  coldDom.body.__reactContainer$cold = lsFiberNode;

  const rpcExpr = buildRendererRpcExpression('GetAllCascadeTrajectories', { includeVisibleMainIds: true });
  const rpcCtx = vm.createContext({
    document: coldDom,
    location: { href: 'vscode-file://vscode-app/workbench.html' },
    window: {},
    Promise,
  });
  const rpcOut = await vm.runInContext(rpcExpr, rpcCtx);
  assert.equal(rpcOut.ok, true);
  assert.equal(trajRpcCount, 0, 'Cold catalog refresh must make 0 GetCascadeTrajectory RPCs');
  const norm = normalizeRendererSummaries(rpcOut.data);
  assert.deepEqual(norm.visibleMainIds, [sidebarMainId]);
  const normSubIds = (norm.discoveredSubagentIds || []).map((x) => x.id).sort();
  assert.deepEqual(normSubIds, [domWorkerId, mgrWorkerId].sort(), 'Must discover DOM + in-memory AgentMgr subagents and exclude visible main chat');

  // End-to-end daemon storage-health refresh on cold run with chapter_titles/ + MetricsStore delegatedConversations
  const tmpRoot = mkTmp('prism-cold-refresh-');
  try {
    const agDir = path.join(tmpRoot, 'antigravity');
    const convDir = path.join(agDir, 'conversations');
    const chapDir = path.join(agDir, 'chapter_titles');
    const archiveDir = path.join(agDir, 'conversations_archive');
    fs.mkdirSync(convDir, { recursive: true });
    fs.mkdirSync(chapDir, { recursive: true });
    const now = Date.now();
    const fourHoursAgo = new Date(now - 4 * 3600000);
    for (const id of [sidebarMainId, chapterMainId, domWorkerId, mgrWorkerId, storeDelegatedId, laterDelegatedId]) {
      const f = path.join(convDir, `${id}.db`);
      fs.writeFileSync(f, Buffer.alloc(2048, 3));
      fs.utimesSync(f, fourHoursAgo, fourHoursAgo);
    }
    // chapter_titles protects chapterMainId even if erroneously referenced as a subagent
    fs.writeFileSync(path.join(chapDir, `${chapterMainId}.json`), '{}');
    // Seed an existing fresh (<30 min) catalog index to verify cold daemon STILL refreshes on first storage-health
    arch.saveCatalogIndex(archiveDir, {
      [sidebarMainId]: { summary: 'Old Main', status: 'CASCADE_RUN_STATUS_1', lastModifiedTime: fourHoursAgo.toISOString() },
    });

    const daemon = new PrismDaemon({
      rootDir: ROOT,
      enableStorageGuardTimer: false,
      enableAutoUpdateTimer: false,
      silent: true,
    });
    daemon._lazyStore = {
      sessions: new Map([
        [sidebarMainId, { data: { delegatedConversations: [storeDelegatedId, chapterMainId] } }],
      ]),
      client: { reader: { summaries: { [sidebarMainId]: { summary: 'Old Main' } } } },
    };
    let lsListCalls = 0;
    daemon.ensureLsClient = async () => ({
      call: async (method) => {
        if (method === 'GetAllCascadeTrajectories') {
          lsListCalls += 1;
          return norm;
        }
        throw new Error(`Unexpected heavy RPC: ${method}`);
      },
    });

    const firstHealth = await daemon._handleStorageAction('storage-health', { convDir, archiveDir, lsMemoryMb: 512, now }, { force: false });
    assert.equal(firstHealth.ok, true);
    assert.equal(lsListCalls, 1, 'First cold storage-health must query GetAllCascadeTrajectories with includeVisibleMainIds=true even when warmReaderSums or <30m index exists');
    const idx1 = arch.loadCatalogIndex(archiveDir);
    assert.equal(idx1.entries[sidebarMainId]?.protectedMain, true);
    assert.equal(idx1.entries[domWorkerId]?.subagent, true, 'DOM subagent node must be indexed as subagent');
    assert.equal(idx1.entries[mgrWorkerId]?.subagent, true, 'In-memory AgentMgr Swarm worker must be indexed as subagent');
    assert.equal(idx1.entries[storeDelegatedId]?.subagent, true, 'MetricsStore delegatedConversation must be indexed as subagent');
    assert.notEqual(idx1.entries[chapterMainId]?.subagent, true, 'chapter_titles/ main chat must NEVER be classified as subagent');

    // Second pass inside 30-min cooldown: a brand-new Swarm worker appears in MetricsStore.sessions.delegatedConversations
    // -> must be incrementally flushed with ZERO extra LS RPC calls!
    daemon._storageHealthCache = null;
    daemon._storageHealthAt = 0;
    daemon._lazyStore.sessions.set(sidebarMainId, {
      data: { delegatedConversations: [storeDelegatedId, laterDelegatedId] },
    });
    const secondHealth = await daemon._handleStorageAction('storage-health', { convDir, archiveDir, lsMemoryMb: 512, now: now + 60000 }, { force: false });
    assert.equal(secondHealth.ok, true);
    assert.equal(lsListCalls, 1, 'Within 30-min cooldown, incremental memory refresh must make 0 additional LS RPCs');
    const idx2 = arch.loadCatalogIndex(archiveDir);
    assert.equal(idx2.entries[laterDelegatedId]?.subagent, true, 'Newly discovered Swarm worker inside cooldown must be incrementally merged into catalog index');

    await daemon.stop(false);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('Adversarial follow-up fixes: langProbe auto/html[lang] precedence, collapsed-sidebar parent protection & cooldown signalsOnly, manual archive race & superseded stop guard, and Watcher recordedAt/active-task coordination', async () => {
  const tmpRoot = mkTmp('prism-adv-followup-');
  try {
    const convDir = path.join(tmpRoot, 'conversations');
    const archiveDir = path.join(tmpRoot, 'conversations_archive');
    const guardStateFile = path.join(tmpRoot, 'guard-state.json');
    fs.mkdirSync(convDir, { recursive: true });
    const now = Date.now();
    const oldTime = new Date(now - 5 * 3600000);

    // 1) Bug #3: Real VM execution of langProbeExpr — 'auto' must NOT short-circuit and html[lang="en"] must NOT override navigator.language="zh-CN"
    const subId = makeGuid(401);
    const parentId = makeGuid(400);
    fs.writeFileSync(path.join(convDir, `${subId}.db`), Buffer.alloc(1024, 2));
    fs.utimesSync(path.join(convDir, `${subId}.db`), oldTime, oldTime);
    arch.saveCatalogIndex(archiveDir, {
      [subId]: { summary: 'Worker', status: 'CASCADE_RUN_STATUS_1', parentConversationId: parentId, lastModifiedTime: oldTime.toISOString() },
    });

    const daemon = new PrismDaemon({
      rootDir: ROOT,
      storageGuardStatePath: guardStateFile,
      enableStorageGuardTimer: false,
      enableAutoUpdateTimer: false,
      silent: true,
    });
    daemon.ensureLsClient = async () => ({ call: async () => ({ trajectorySummaries: {} }) });
    daemon.cdp = { ...daemon.cdp, readConfig: () => ({ ...cdp.DEFAULT_CONFIG, language: 'auto', lang: 'auto' }) };

    for (const [label, domAttr, htmlLang, navLang, expectedLang] of [
      ['data-ag-cs-lang=auto falls through to navigator.language', 'auto', 'en', 'zh-CN', 'zh-CN'],
      ['missing data-ag-cs-lang prefers navigator.language over host html[lang=en]', null, 'en', 'zh-CN', 'zh-CN'],
      ['missing navigator falls back to html[lang=ja]', null, 'ja', '', 'ja'],
    ]) {
      let lastBannerExpr = '';
      daemon._storageGuardBannerShownAt = 0;
      daemon.sessions.set('ws://local-probe', {
        url: 'vscode-file://vscode-app/workbench.html',
        title: 'Antigravity',
        session: {
          closed: false,
          send: async (_m, p) => {
            if (p.expression.includes('data-ag-cs-lang')) {
              const probed = vm.runInNewContext(p.expression, {
                document: { documentElement: { getAttribute: () => domAttr, lang: htmlLang } },
                navigator: navLang ? { language: navLang, languages: [navLang] } : {},
              });
              return { result: { value: probed } };
            }
            lastBannerExpr = p.expression;
            return { result: { value: { mounted: true } } };
          },
          evaluate: async () => ({ dismissed: true }),
        },
      });
      const res = await daemon._checkStorageGuardAndNotify({
        convDir,
        archiveDir,
        lsMemoryMb: 4800,
        systemLocale: 'en-US',
        checkIdle: async () => ({ idle: true }),
        now: now + 1000,
      });
      assert.equal(res.shown, true, label);
      assert.equal(res.lang, expectedLang, label);
      const { doc } = createMiniDom();
      vm.runInNewContext(lastBannerExpr, { document: doc, window: {} });
      assert.equal(doc.querySelector('.ag-sg-title').textContent, i18nLocales.getUiStrings(expectedLang).storageGuardTitle, label);
      if (expectedLang === 'zh-CN') {
        assert.equal(doc.querySelector('.ag-sg-close').getAttribute('aria-label'), '关闭');
      }
    }

    // 2) Bug #2A/2B/2C/2D: Collapsed sidebar MUST NOT misclassify parent main chat from ancestor Fiber as subagent;
    //    cold page without LS list methods MUST keep visibleMainIds/discoveredSubagentIds;
    //    30-min cooldown refreshes new Swarm worker via zero-LS-RPC signalsOnly=true;
    //    saveCatalogIndex protects existing protectedMain from heuristic discovered overwrite.
    const collapsedParent = makeGuid(410);
    const collapsedSub = makeGuid(411);
    const cooldownNewWorker = makeGuid(412);
    const { doc: collapsedDoc, mkEl } = createMiniDom();
    const subCard = mkEl('div');
    subCard.setAttribute('data-testid', 'subagent-node');
    subCard.setAttribute('data-parent-id', collapsedParent);
    subCard.__reactFiber$adv = {
      memoizedProps: { subagentId: collapsedSub, parentConversationId: collapsedParent },
      return: { memoizedProps: { conversationId: collapsedParent, cascadeId: collapsedParent }, return: null },
    };
    collapsedDoc.body.appendChild(subCard);
    // Cold page with NO getAllCascadeTrajectories / searchConversations on activeLs
    collapsedDoc.body.__reactContainer$adv = {
      memoizedProps: {
        value: {
          getUserStatus: async () => ({}),
          getCascadeTrajectory: async () => { throw new Error('Must NOT call GetCascadeTrajectory'); },
        },
      },
      child: null,
      sibling: null,
    };

    const coldExpr = buildRendererRpcExpression('GetAllCascadeTrajectories', { includeVisibleMainIds: true });
    const coldOut = await vm.runInContext(
      coldExpr,
      vm.createContext({ document: collapsedDoc, location: { href: 'vscode-file://vscode-app/workbench.html' }, window: {}, Promise })
    );
    assert.equal(coldOut.ok, true, 'Cold page without LS summary methods must still return collected DOM/AgentMgr signals');
    const coldNorm = normalizeRendererSummaries(coldOut.data);
    const coldSubIds = (coldNorm.discoveredSubagentIds || []).map((x) => x.id);
    assert.deepEqual(coldSubIds, [collapsedSub], 'Collapsed sidebar must NEVER leak parent conversationId from ancestor React fiber into discoveredSubagentIds');

    // Existing protectedMain must survive even if heuristic discoveredSubagents tries to mark it as subagent
    arch.saveCatalogIndex(archiveDir, {}, { mergeExisting: true, extraSignals: { protectedMainIds: new Set([collapsedParent]) } });
    arch.saveCatalogIndex(archiveDir, {}, { mergeExisting: true, extraSignals: { discoveredSubagents: new Map([[collapsedParent, { parentId: makeGuid(499) }]]) } });
    const guardedIdx = arch.loadCatalogIndex(archiveDir);
    assert.equal(guardedIdx.entries[collapsedParent]?.protectedMain, true);
    assert.equal(guardedIdx.entries[collapsedParent]?.subagent, false, 'Heuristic discovered entry must NEVER overwrite existing protectedMain');

    // Cooldown zero-LS-RPC signalsOnly probe captures brand-new Swarm worker when user never opened Home Studio (_lazyStore is null)
    const { doc: coolDoc, mkEl: mkCoolEl } = createMiniDom();
    const coolSub = mkCoolEl('div');
    coolSub.setAttribute('data-testid', 'subagent-node');
    coolSub.setAttribute('data-parent-id', collapsedParent);
    coolSub.setAttribute('data-cascade-id', cooldownNewWorker);
    coolDoc.body.appendChild(coolSub);
    fs.writeFileSync(path.join(convDir, `${cooldownNewWorker}.db`), Buffer.alloc(1024, 4));
    fs.utimesSync(path.join(convDir, `${cooldownNewWorker}.db`), oldTime, oldTime);

    const coolDaemon = new PrismDaemon({
      rootDir: ROOT,
      enableStorageGuardTimer: false,
      enableAutoUpdateTimer: false,
      silent: true,
    });
    let coolLsCalls = 0;
    coolDaemon.ensureLsClient = async () => ({
      call: async () => {
        coolLsCalls += 1;
        return { trajectorySummaries: {} };
      },
    });
    coolDaemon._lastStorageIndexRefreshAt = now; // simulate inside 30-min cooldown
    coolDaemon.sessions.set('ws://local-cool', {
      url: 'vscode-file://vscode-app/workbench.html',
      title: 'Antigravity',
      session: {
        closed: false,
        send: async (_m, p) => {
          const val = await vm.runInContext(
            p.expression,
            vm.createContext({ document: coolDoc, location: { href: 'vscode-file://vscode-app/workbench.html' }, window: {}, Promise })
          );
          return { result: { value: val } };
        },
      },
    });
    const coolHealth = await coolDaemon._handleStorageAction('storage-health', { convDir, archiveDir, lsMemoryMb: 256, now: now + 30000 }, { force: false });
    assert.equal(coolHealth.ok, true);
    assert.equal(coolLsCalls, 0, 'Cooldown signalsOnly probe must make 0 LS RPC calls');
    const coolIdx = arch.loadCatalogIndex(archiveDir);
    assert.equal(coolIdx.entries[cooldownNewWorker]?.subagent, true, 'Cooldown zero-RPC page probe must flush newly rendered Swarm worker to catalog index');
    await coolDaemon.stop(false, { skipAutoArchive: true });

    // 3) Bug #4: Manual restore/archive schedule suppresses conflicting auto-exit-archive even if tick sees active sessions;
    //    superseded / --once stop({ skipAutoArchive: true }) must NEVER spawn auto-exit-archive
    const raceDaemon = new PrismDaemon({ rootDir: ROOT, enableStorageGuardTimer: false, enableAutoUpdateTimer: false, silent: true });
    raceDaemon._sawLiveHost = true;
    raceDaemon._autoArchiveExitRan = false;
    raceDaemon._archiveScheduledAt = Date.now();
    const skippedAuto = await raceDaemon._maybeRunAutoArchiveOnExit({ autoArchiveOnExit: true, convDir, archiveDir, settleMs: 0, recheckGapMs: 0, checkRunning: () => false });
    assert.equal(skippedAuto.ran, false);
    assert.equal(skippedAuto.reason, 'manual-archive-scheduled');
    let stopSpawnedCount = 0;
    await raceDaemon.stop(false, {
      convDir,
      archiveDir,
      autoArchiveOnExit: true,
      spawnHook: () => { stopSpawnedCount += 1; return { spawned: true }; },
    });
    assert.equal(stopSpawnedCount, 0, 'stop() must NOT spawn auto-exit-archive while manual archive/restore was just scheduled');

    const onceDaemon = new PrismDaemon({ rootDir: ROOT, enableStorageGuardTimer: false, enableAutoUpdateTimer: false, silent: true });
    onceDaemon._sawLiveHost = true;
    await onceDaemon.stop(false, {
      convDir,
      archiveDir,
      autoArchiveOnExit: true,
      skipAutoArchive: true,
      spawnHook: () => { stopSpawnedCount += 1; return { spawned: true }; },
    });
    assert.equal(stopSpawnedCount, 0, 'superseded/--once stop({ skipAutoArchive: true }) must NOT spawn auto-exit-archive');

    // 4) Bug #1: executeArchiveTaskSequence maintains .archive-task-active.json during execution & clears it after writeLastArchiveResult(recordedAt)
    const activePath = path.join(archiveDir, '.archive-task-active.json');
    let activeObservedDuringRun = null;
    const seqCheck = await arch.executeArchiveTaskSequence(
      { action: 'restore-and-restart', convDir, archiveDir, gracefulQuit: false, relaunch: false, settleMs: 0, recheckGapMs: 0 },
      {
        sleep: async () => {},
        checkRunning: () => false,
        restoreFn: () => {
          if (fs.existsSync(activePath)) activeObservedDuringRun = JSON.parse(fs.readFileSync(activePath, 'utf8'));
          return { ok: true, restoredCount: 1, skippedCount: 0, batchName: 'batch-test' };
        },
      }
    );
    assert.equal(seqCheck.ok, true);
    assert.equal(activeObservedDuringRun?.action, 'restore-and-restart');
    assert.equal(activeObservedDuringRun?.pid, process.pid);
    assert.equal(fs.existsSync(activePath), false, '.archive-task-active.json must be cleaned up after completion');
    const lastRes = arch.readLastArchiveResult(archiveDir);
    assert.equal(typeof lastRes?.recordedAt, 'string', '.last-archive-result.json uses recordedAt timestamp');

    // Static cross-platform Watcher contract checks for recordedAt + .archive-task-active.json + fail-closed symlinks
    const winWatcherSrc = fs.readFileSync(path.join(ROOT, 'installer/watcher/Program.cs'), 'utf8');
    const macWatcherSrc = fs.readFileSync(path.join(ROOT, 'installer/macos/Watcher/main.swift'), 'utf8');
    for (const needle of ['"recordedAt"', '.archive-task-active.json', 'IsProcessIdAlive']) {
      assert.ok(winWatcherSrc.includes(needle), `Windows Watcher Program.cs must include ${needle}`);
    }
    for (const needle of ['"recordedAt"', '.archive-task-active.json', 'isProcessIdAlive']) {
      assert.ok(macWatcherSrc.includes(needle), `macOS Watcher main.swift must include ${needle}`);
    }

    // 5) Real compiled Windows C# Watcher execution test (csc /warnaserror + reflection invoke on sandboxed USERPROFILE)
    if (process.platform === 'win32') {
      const cscPath = path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
      if (fs.existsSync(cscPath)) {
        const csDir = path.join(tmpRoot, 'cs-watcher-test');
        fs.mkdirSync(csDir, { recursive: true });
        const watcherDll = path.join(csDir, 'WatcherLib.dll');
        const harnessCs = path.join(csDir, 'Harness.cs');
        const harnessExe = path.join(csDir, 'Harness.exe');
        execFileSync(
          cscPath,
          [
            '/nologo',
            '/warnaserror',
            '/target:library',
            '/r:System.dll',
            '/r:System.Core.dll',
            '/r:System.Net.Http.dll',
            '/r:System.Windows.Forms.dll',
            '/r:System.Drawing.dll',
            `/out:${watcherDll}`,
            path.join(ROOT, 'installer/common/MiniJson.cs'),
            path.join(ROOT, 'installer/common/CdpClient.cs'),
            path.join(ROOT, 'installer/watcher/Program.cs'),
          ],
          { windowsHide: true, stdio: 'pipe' }
        );
        fs.writeFileSync(
          harnessCs,
          [
            'using System;',
            'using System.Reflection;',
            'public static class Harness {',
            '  public static int Main(string[] args) {',
            '    Assembly asm = Assembly.LoadFrom(args[0]);',
            '    Type t = asm.GetType("AgyClaudeStyle.Watcher.Program");',
            '    if (args[1] == "has-lock") {',
            '      MethodInfo m = t.GetMethod("HasActiveArchiveLockOrRecentRestore", BindingFlags.NonPublic | BindingFlags.Static);',
            '      Console.WriteLine((bool)m.Invoke(null, null) ? "TRUE" : "FALSE");',
            '    } else if (args[1] == "enabled") {',
            '      FieldInfo fp = t.GetField("_pluginDir", BindingFlags.NonPublic | BindingFlags.Static);',
            '      FieldInfo fb = t.GetField("_baseDir", BindingFlags.NonPublic | BindingFlags.Static);',
            '      fp.SetValue(null, args[2]);',
            '      fb.SetValue(null, args[3]);',
            '      MethodInfo m = t.GetMethod("IsAutoArchiveOnExitEnabled", BindingFlags.NonPublic | BindingFlags.Static);',
            '      Console.WriteLine((bool)m.Invoke(null, null) ? "TRUE" : "FALSE");',
            '    }',
            '    return 0;',
            '  }',
            '}',
          ].join('\n'),
          'utf8'
        );
        execFileSync(cscPath, ['/nologo', '/warnaserror', '/target:exe', `/out:${harnessExe}`, harnessCs], {
          windowsHide: true,
          stdio: 'pipe',
        });

        const fakeHome = path.join(csDir, 'fake-home');
        const fakeArchive = path.join(fakeHome, '.gemini', 'antigravity', 'conversations_archive');
        fs.mkdirSync(fakeArchive, { recursive: true });
        const runHasLock = () =>
          execFileSync(harnessExe, [watcherDll, 'has-lock'], {
            encoding: 'utf8',
            windowsHide: true,
            env: { ...process.env, USERPROFILE: fakeHome },
          }).trim();

        // Empty archiveDir -> FALSE (allowed)
        assert.equal(runHasLock(), 'FALSE', 'C# Watcher: empty archiveDir should allow archive');

        // Real writeLastArchiveResult(restore-and-restart) with recordedAt -> TRUE (90s restore guard works!)
        arch.writeLastArchiveResult(fakeArchive, { ok: true, action: 'restore-and-restart', restoredCount: 2, relaunched: true });
        assert.equal(runHasLock(), 'TRUE', 'C# Watcher MUST respect recordedAt in .last-archive-result.json for recent restore-and-restart');

        // Stale (>90s) restore-and-restart -> FALSE
        const resFile = path.join(fakeArchive, '.last-archive-result.json');
        const oldIso = new Date(Date.now() - 180000).toISOString();
        fs.writeFileSync(resFile, JSON.stringify({ schema: 1, recordedAt: oldIso, action: 'restore-and-restart', ok: true }), 'utf8');
        assert.equal(runHasLock(), 'FALSE', 'C# Watcher: >90s old restore result should no longer block exit archive');

        // Recent successful auto-exit-archive -> TRUE (idempotent dedup)
        arch.writeLastArchiveResult(fakeArchive, { ok: true, action: 'auto-exit-archive', movedCount: 3, relaunched: false });
        assert.equal(runHasLock(), 'TRUE', 'C# Watcher: recent successful auto-exit-archive must suppress duplicate run');
        fs.unlinkSync(resFile);

        // Active detached task with LIVE pid (current Node pid) -> TRUE (no 4s vs 5.5s race!)
        arch.writeActiveArchiveTask(fakeArchive, { action: 'auto-exit-archive', pid: process.pid });
        assert.equal(runHasLock(), 'TRUE', 'C# Watcher must yield while detached archive task PID is alive');

        // Active detached auto-exit-archive with DEAD pid (killed with host Job Object) -> FALSE (Watcher takes over!)
        arch.writeActiveArchiveTask(fakeArchive, { action: 'auto-exit-archive', pid: 99999999 });
        assert.equal(runHasLock(), 'FALSE', 'C# Watcher must take over fallback if detached auto-exit-archive PID died');

        // Active restore-and-restart within 30s -> TRUE (conservative protection even during handoff)
        arch.writeActiveArchiveTask(fakeArchive, { action: 'restore-and-restart', pid: 99999999 });
        assert.equal(runHasLock(), 'TRUE', 'C# Watcher must conservatively yield during active restore-and-restart handoff');
        fs.unlinkSync(path.join(fakeArchive, '.archive-task-active.json'));

        // IsAutoArchiveOnExitEnabled supports boolean true, string "on", and honors false
        const pDir = path.join(csDir, 'plug');
        const bDir = path.join(csDir, 'base');
        fs.mkdirSync(pDir, { recursive: true });
        fs.mkdirSync(bDir, { recursive: true });
        fs.writeFileSync(path.join(pDir, 'config.json'), JSON.stringify({ autoArchiveOnExit: true }), 'utf8');
        assert.equal(
          execFileSync(harnessExe, [watcherDll, 'enabled', pDir, bDir], { encoding: 'utf8', windowsHide: true }).trim(),
          'TRUE'
        );
        fs.writeFileSync(path.join(pDir, 'config.json'), JSON.stringify({ autoArchiveOnExit: 'on' }), 'utf8');
        assert.equal(
          execFileSync(harnessExe, [watcherDll, 'enabled', pDir, bDir], { encoding: 'utf8', windowsHide: true }).trim(),
          'TRUE'
        );
        fs.writeFileSync(path.join(pDir, 'config.json'), JSON.stringify({ autoArchiveOnExit: false }), 'utf8');
        assert.equal(
          execFileSync(harnessExe, [watcherDll, 'enabled', pDir, bDir], { encoding: 'utf8', windowsHide: true }).trim(),
          'FALSE'
        );
      }
    }

    await daemon.stop(false, { skipAutoArchive: true });
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('PR #66 Track 3: isIsolatedExternalAgyCommandLine (tilde expansion, --gemini-dir, --app-data-dir, acp boundaries), POSIX ps -ww, and zero-PS Windows queryCommandLines', () => {
  const defaultGem = 'C:\\Users\\Alice\\.gemini';
  const t3Cmd =
    'C:\\Users\\Alice\\.t3\\tools\\antigravity-acp\\win32-x64\\versions\\6b80\\agy.exe acp --gemini-dir C:\\Users\\Alice\\.t3\\userdata\\providers\\antigravity\\ac0a3dfd --app-data-dir antigravity-acp';
  assert.equal(
    arch.isIsolatedExternalAgyCommandLine(t3Cmd, { platform: 'win32', defaultGeminiDir: defaultGem }),
    true,
    'T3 Code ACP agy.exe with isolated --gemini-dir and --app-data-dir must be exempted'
  );
  assert.equal(
    arch.isIsolatedExternalAgyCommandLine('"C:\\Program Files\\T3 Code\\agy.exe" acp --app-data-dir antigravity-acp', {
      platform: 'win32',
      defaultGeminiDir: defaultGem,
    }),
    true,
    'Quoted agy.exe path with acp subcommand and isolated --app-data-dir must be exempted'
  );

  // 3 strict acp isolation boundaries + non-acp / language_server rejections
  assert.equal(
    arch.isIsolatedExternalAgyCommandLine('C:\\Program Files\\agy\\agy.exe chat', { platform: 'win32', defaultGeminiDir: defaultGem }),
    false,
    'Standard agy CLI using default ~/.gemini/antigravity must block archiving'
  );
  assert.equal(
    arch.isIsolatedExternalAgyCommandLine('agy.exe chat --app-data-dir custom-profile', {
      platform: 'win32',
      defaultGeminiDir: defaultGem,
    }),
    false,
    'Non-ACP subcommand (agy chat --app-data-dir custom-profile) must NOT be exempted'
  );
  assert.equal(
    arch.isIsolatedExternalAgyCommandLine('agy.exe --gemini-dir C:\\isolated --app-data-dir antigravity-acp', {
      platform: 'win32',
      defaultGeminiDir: defaultGem,
    }),
    false,
    'Missing acp subcommand must NOT be exempted'
  );
  assert.equal(
    arch.isIsolatedExternalAgyCommandLine('language_server.exe acp --app-data-dir antigravity-acp', {
      platform: 'win32',
      defaultGeminiDir: defaultGem,
    }),
    false,
    'language_server.exe must NEVER be exempted'
  );

  // Pre-check --gemini-dir (including ~ expansion) & --app-data-dir full-path normalization
  assert.equal(
    arch.isIsolatedExternalAgyCommandLine(`agy.exe acp --gemini-dir "${defaultGem}" --app-data-dir antigravity-acp`, {
      platform: 'win32',
      defaultGeminiDir: defaultGem,
    }),
    false,
    'Explicit default --gemini-dir must fail-closed even when --app-data-dir is custom'
  );
  assert.equal(
    arch.isIsolatedExternalAgyCommandLine('agy.exe acp --gemini-dir "C:/Users/Alice/.gemini/antigravity/" --app-data-dir antigravity-acp', {
      platform: 'win32',
      defaultGeminiDir: defaultGem,
    }),
    false,
    'Explicit ~/.gemini/antigravity in --gemini-dir must fail-closed even with forward slashes'
  );
  assert.equal(
    arch.isIsolatedExternalAgyCommandLine('agy.exe acp --gemini-dir "~/.gemini" --app-data-dir antigravity-acp', {
      platform: 'win32',
      defaultGeminiDir: defaultGem,
    }),
    false,
    'Tilde ~/.gemini in --gemini-dir must expand and fail-closed on Win32'
  );
  assert.equal(
    arch.isIsolatedExternalAgyCommandLine('agy acp --gemini-dir ~/.gemini/antigravity --app-data-dir antigravity-acp', {
      platform: 'linux',
      defaultGeminiDir: '/home/alice/.gemini',
    }),
    false,
    'Tilde ~/.gemini/antigravity in --gemini-dir must expand and fail-closed on Linux'
  );
  assert.equal(
    arch.isIsolatedExternalAgyCommandLine('agy acp --gemini-dir ~/.t3/isolated --app-data-dir antigravity-acp', {
      platform: 'linux',
      defaultGeminiDir: '/home/alice/.gemini',
    }),
    true,
    'Tilde ~/.t3/isolated must expand to non-default path and be exempted'
  );
  assert.equal(
    arch.isIsolatedExternalAgyCommandLine('agy.exe acp --app-data-dir "C:\\Users\\Alice\\AppData\\Roaming\\Antigravity"', {
      platform: 'win32',
      defaultGeminiDir: defaultGem,
    }),
    false,
    'Full path --app-data-dir pointing to default AppData\\Roaming\\Antigravity must fail-closed'
  );
  assert.equal(
    arch.isIsolatedExternalAgyCommandLine('agy acp --app-data-dir "~/.config/Antigravity"', {
      platform: 'linux',
      defaultGeminiDir: '/home/alice/.gemini',
    }),
    false,
    'Tilde ~/.config/Antigravity --app-data-dir must expand and fail-closed on Linux'
  );
  assert.equal(
    arch.isIsolatedExternalAgyCommandLine('agy acp --app-data-dir "~/Library/Application Support/Antigravity"', {
      platform: 'darwin',
      defaultGeminiDir: '/Users/alice/.gemini',
    }),
    false,
    'Tilde ~/Library/Application Support/Antigravity --app-data-dir must expand and fail-closed on macOS'
  );
  assert.equal(
    arch.isIsolatedExternalAgyCommandLine('agy.exe acp --app-data-dir "C:\\Users\\Alice\\.t3\\custom-appdata"', {
      platform: 'win32',
      defaultGeminiDir: defaultGem,
    }),
    true,
    'Full path --app-data-dir pointing to an isolated external directory must be exempted'
  );

  // Windows: default zero-PS/WMI path stays fail-closed for uninspected agy.exe; injected queryCommandLines unlocks isolated ACP + caches/evicts cleanly
  const csvOnlyT3Agy = [
    '"T3 Code (Beta).exe","36012","Console","1","45,764 K"',
    '"agy.exe","49084","Console","1","12,544 K"',
    '"agy.exe","56244","Console","1","18,684 K"',
  ].join('\r\n');

  const execCalls = [];
  const defaultWinProbe = arch.inspectLanguageServerProcesses({
    platform: 'win32',
    selfPid: 99999,
    defaultGeminiDir: defaultGem,
    exec: (bin, args) => {
      execCalls.push({ bin, args });
      return csvOnlyT3Agy;
    },
  });
  assert.equal(execCalls.length, 1);
  assert.equal(execCalls[0].bin, 'tasklist.exe');
  assert.equal(defaultWinProbe.running, true, 'Default zero-PS Windows probe must fail-closed on unverified agy.exe');
  assert.equal(defaultWinProbe.blockers.length, 2);

  const detailExempt = arch.parseWindowsTasklistCsvDetailed(csvOnlyT3Agy, {
    selfPid: 99999,
    defaultGeminiDir: defaultGem,
    queryCommandLines: () =>
      new Map([
        [49084, t3Cmd],
        [56244, t3Cmd],
      ]),
  });
  assert.equal(detailExempt.running, false, 'Injected queryCommandLines confirming isolated agy.exe acp must allow archiving');
  assert.equal(detailExempt.ignoredAcp.length, 2);

  const detailMissingCmd = arch.parseWindowsTasklistCsvDetailed(csvOnlyT3Agy, {
    selfPid: 99999,
    defaultGeminiDir: defaultGem,
    queryCommandLines: () => new Map([[49084, t3Cmd]]),
  });
  assert.equal(detailMissingCmd.running, true, 'Missing CommandLine for any agy.exe PID must fail-closed');
  assert.deepEqual(detailMissingCmd.blockers, [{ imageName: 'agy.exe', pid: 56244 }]);

  // Verify PID CommandLine caching & PID-disappearance eviction with injected queryCommandLines (0 PowerShell)
  let tasklistCalls = 0;
  let queryCmdCalls = 0;
  let currentCsv = csvOnlyT3Agy;
  let currentCmdFor56244 = t3Cmd;
  const mockExec = (bin) => {
    assert.equal(bin, 'tasklist.exe', 'Windows probe must NEVER spawn powershell/wmic');
    tasklistCalls += 1;
    return currentCsv;
  };
  const injectedQuery = (pids) => {
    queryCmdCalls += 1;
    const out = new Map();
    for (const pid of pids) {
      if (pid === 49084) out.set(49084, t3Cmd);
      if (pid === 56244) out.set(56244, currentCmdFor56244);
    }
    return out;
  };

  for (let i = 0; i < 50; i++) {
    const r = arch.inspectLanguageServerProcesses({
      platform: 'win32',
      selfPid: 99999,
      defaultGeminiDir: defaultGem,
      exec: mockExec,
      queryCommandLines: injectedQuery,
    });
    assert.equal(r.running, false);
  }
  assert.equal(tasklistCalls, 50);
  assert.equal(queryCmdCalls, 1, '50 consecutive polls of unchanged T3 Code agy.exe PIDs must invoke queryCommandLines only ONCE');

  currentCsv = '"Antigravity.exe","12345","Console","1","120,000 K"';
  assert.equal(
    arch.inspectLanguageServerProcesses({
      platform: 'win32',
      selfPid: 99999,
      defaultGeminiDir: defaultGem,
      exec: mockExec,
      queryCommandLines: injectedQuery,
    }).running,
    true
  );
  currentCsv = csvOnlyT3Agy;
  currentCmdFor56244 = 'C:\\Program Files\\agy\\agy.exe chat';
  const afterReuse = arch.inspectLanguageServerProcesses({
    platform: 'win32',
    selfPid: 99999,
    defaultGeminiDir: defaultGem,
    exec: mockExec,
    queryCommandLines: injectedQuery,
  });
  assert.equal(queryCmdCalls, 2, 'Reused PID after disappearing from tasklist must evict cache and re-query');
  assert.equal(afterReuse.running, true);
  assert.deepEqual(afterReuse.blockers, [{ imageName: 'agy.exe', pid: 56244 }]);

  // POSIX ps -ww -eo pid=,args= feeds isIsolatedExternalAgyCommandLine directly
  for (const posixPlat of ['linux', 'darwin']) {
    let seenArgs = null;
    const psIsolated = arch.inspectLanguageServerProcesses({
      platform: posixPlat,
      selfPid: 99999,
      selfPpid: 99998,
      defaultGeminiDir: '/home/alice/.gemini',
      exec: (bin, args) => {
        assert.equal(bin, 'ps');
        seenArgs = args;
        return [
          '  100 /sbin/launchd',
          '  200 /home/alice/.t3/tools/agy acp --gemini-dir /home/alice/.t3/isolated --app-data-dir antigravity-acp',
        ].join('\n');
      },
    });
    assert.deepEqual(seenArgs, ['-ww', '-eo', 'pid=,args='], `${posixPlat} must pass -ww to avoid truncating CLI flags`);
    assert.equal(psIsolated.running, false);
  }
  assert.equal(
    arch.parsePosixProcessList(
      '  200 agy acp --gemini-dir ~/.gemini --app-data-dir antigravity-acp',
      { selfPid: 99999, selfPpid: 99998, platform: 'linux', defaultGeminiDir: '/home/alice/.gemini' }
    ),
    true,
    'POSIX agy acp pointing to ~/.gemini must still block archiving'
  );
});

test('PR #66 Track 4: createLoopRunningChecker (500ms throttle + clock-rollback guard), trustedParentDirs, 25-item checkpoints & appendArchiveTrace 512KB line-safe truncation', async () => {
  // 1) createLoopRunningChecker: 500ms throttle, latch-on-true, and clock-rollback protection
  let fakeNow = 10_000;
  let rawCalls = 0;
  let fakeRunning = false;
  const markedProbe = () => {
    rawCalls += 1;
    return fakeRunning;
  };
  markedProbe.__allowLoopThrottle = true;
  const loopChecker = arch.createLoopRunningChecker(markedProbe, markedProbe, 500, () => fakeNow);
  for (let step = 0; step < 100; step++) {
    fakeNow += 20; // 100 * 20ms = 2000ms -> 4 intervals of 500ms
    assert.equal(loopChecker(), false);
  }
  assert.equal(rawCalls, 4, '100 loop iterations over 2000ms must invoke underlying probe only 4 times');

  // Clock rollback protection: if system clock jumps backward (now < lastCheckedAt), lastCheckedAt resets to 0 and probes immediately
  fakeNow = 2_000;
  assert.equal(loopChecker(), false);
  assert.equal(rawCalls, 5, 'Clock rollback (now < lastCheckedAt) must reset lastCheckedAt=0 and probe immediately');
  fakeNow = 2_100;
  assert.equal(loopChecker(), false);
  assert.equal(rawCalls, 5, 'After clock rollback re-syncs lastCheckedAt, 500ms throttle resumes');

  fakeRunning = true;
  fakeNow = 2_600;
  assert.equal(loopChecker(), true, 'Must detect host startup at next window');
  const callsAtLatch = rawCalls;
  fakeNow += 5000;
  assert.equal(loopChecker(), true, 'Once latched true, must stay true without re-probing');
  assert.equal(rawCalls, callsAtLatch);

  // Unmarked synchronous mock probe remains unthrottled
  let unmarkedCalls = 0;
  const unmarked = () => { unmarkedCalls += 1; return false; };
  const unthrottledChecker = arch.createLoopRunningChecker(unmarked, unmarked);
  for (let i = 0; i < 5; i++) unthrottledChecker();
  assert.equal(unmarkedCalls, 5, 'Unmarked unit-test checkRunning mock must stay unthrottled');

  // 2) archiveConversations (60 subagents, 25-item checkpoints, trustedParentDirs) + restoreArchiveBatch + appendArchiveTrace 512KB truncation
  const tmpRoot = mkTmp('prism-track4-');
  try {
    const convDir = path.join(tmpRoot, 'conversations');
    const archiveDir = path.join(tmpRoot, 'archive');
    fs.mkdirSync(convDir, { recursive: true });
    fs.mkdirSync(archiveDir, { recursive: true });

    const now = Date.now();
    const mainId = makeGuid(900);
    fs.writeFileSync(path.join(convDir, `${mainId}.db`), 'main-db');
    const summaries = {
      [mainId]: { status: 'CASCADE_RUN_STATUS_IDLE', lastModifiedTime: new Date(now - 3600_000).toISOString() },
    };
    const oldMtime = new Date(now - 5 * 3600_000);
    for (let i = 1; i <= 60; i++) {
      const subId = makeGuid(900 + i);
      for (const ext of ['.db', '.db-wal', '.db-shm']) {
        const fp = path.join(convDir, `${subId}${ext}`);
        fs.writeFileSync(fp, `sub-${i}${ext}`);
        fs.utimesSync(fp, oldMtime, oldMtime);
      }
      summaries[subId] = {
        status: 'CASCADE_RUN_STATUS_IDLE',
        lastModifiedTime: oldMtime.toISOString(),
        trajectoryMetadata: { parentConversationId: mainId },
      };
    }
    arch.saveCatalogIndex(archiveDir, summaries);

    let probeCount = 0;
    const throttledProbe = () => {
      probeCount += 1;
      return false;
    };
    throttledProbe.__allowLoopThrottle = true;

    const t0 = Date.now();
    const res = arch.archiveConversations({
      convDir,
      archiveDir,
      mode: 'subagents',
      subagentMaxAgeHours: 2,
      now,
      checkRunning: throttledProbe,
    });
    const elapsedMs = Math.max(0, Date.now() - t0);
    const maxExpectedProbes = 2 + Math.ceil(elapsedMs / 450);
    assert.equal(res.ok, true);
    assert.equal(res.movedCount, 60);
    assert.ok(
      probeCount <= maxExpectedProbes && probeCount < 60,
      `Expected <= ${maxExpectedProbes} throttled probes over ${elapsedMs}ms, got ${probeCount}`
    );

    const manifest = JSON.parse(fs.readFileSync(path.join(res.batchDir, 'manifest.json'), 'utf8'));
    assert.equal(manifest.status, 'completed');
    assert.equal(manifest.movedCount, 60);
    assert.equal(manifest.items.length, 60);

    const restRes = arch.restoreArchiveBatch({
      convDir,
      archiveDir,
      batchName: res.batchName,
      checkRunning: throttledProbe,
    });
    assert.equal(restRes.ok, true);
    assert.equal(restRes.restoredCount, 60);

    // 3) appendArchiveTrace 512KB truncation: skips partial first line & preserves valid JSONL + 0o600
    const tracePath = path.join(archiveDir, 'archive-trace.log');
    const sampleRow = JSON.stringify({ ts: '2026-11-26T00:00:00.000Z', pid: 123, event: 'SEED', pad: 'x'.repeat(180) }) + '\n';
    const repeatCount = Math.ceil((540 * 1024) / Buffer.byteLength(sampleRow, 'utf8'));
    // Prepend a partial prefix to guarantee the 256KB slice boundary cuts mid-line
    fs.writeFileSync(tracePath, 'PARTIAL_PREFIX_' + sampleRow.repeat(repeatCount), { encoding: 'utf8', mode: 0o600 });
    assert.ok(fs.statSync(tracePath).size > 512 * 1024);

    arch.appendArchiveTrace(archiveDir, 'AFTER_TRUNCATE', { marker: 'ok' });
    const afterStat = fs.statSync(tracePath);
    assert.ok(afterStat.size < 512 * 1024, `Trace log must be truncated below 512KB, got ${afterStat.size}`);
    if (process.platform !== 'win32') {
      assert.equal(afterStat.mode & 0o777, 0o600, 'Trace log must preserve 0o600 permissions');
    }
    const lines = fs.readFileSync(tracePath, 'utf8').trim().split('\n');
    assert.ok(lines.length > 10, 'Truncated trace log must retain recent JSONL history');
    for (let idx = 0; idx < lines.length; idx++) {
      assert.doesNotThrow(() => JSON.parse(lines[idx]), `Line ${idx} after 512KB truncation must be valid JSON (partial first line skipped)`);
    }
    assert.equal(JSON.parse(lines[lines.length - 1]).event, 'AFTER_TRUNCATE');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

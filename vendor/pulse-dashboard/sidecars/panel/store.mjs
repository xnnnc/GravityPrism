// Upstream: ATtacK030130/antigrative-dashboard v0.9.1 (MIT License — Copyright (c) 2026 AG Pulse contributors)
// Integrated & adapted for Obsidian Prism under GPL-3.0-only compatibility terms.
// Supports isolated dataDir & cdpPort options and enriches listConversations with subagent/workspace metadata.
import { BackgroundStatistics } from './background-statistics.mjs';
import { dirname, join } from 'node:path';
import { collectionFailure } from './collection-state.mjs';
import { createHash } from 'node:crypto';
import { AntigravityClient } from './client.mjs';
import { quotaMetrics, trajectoryMetrics } from './metrics.mjs';
import { SessionHistory, usableMetrics, reconcileMetrics, safeMetrics } from './history.mjs';
import { TranscriptReader } from './transcript.mjs';
import { DelegatedUsage } from './delegated-usage.mjs';
import { safeTaskUsage } from './task-usage.mjs';
import { delegatedIds } from './delegation.mjs';
import { platformPaths } from '../../compat/platform.mjs';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCAL_SCOPE = createHash('sha256').update('ag-pulse:local-unauthenticated').digest('hex');
const BACKGROUND_RECHECK_MS = 5 * 60 * 1000, BACKGROUND_MANUAL_COOLDOWN_MS = 10 * 1000;

function extractWorkspaceName(sum) {
  if (!sum || typeof sum !== 'object') return '';
  const wsList = sum.workspaces || sum.trajectoryMetadata?.workspaces;
  const first = Array.isArray(wsList) && wsList.length ? wsList[0] : null;
  const raw = String(
    first?.workspaceFolderAbsoluteUri ||
    first?.gitRootAbsoluteUri ||
    first?.uri ||
    first?.path ||
    sum.workspaceUri ||
    sum.workspacePath ||
    sum.trajectoryMetadata?.workspaceUri ||
    ''
  ).trim();
  if (!raw) return '';
  try {
    const decoded = decodeURIComponent(raw.replace(/^file:\/\//i, '')).replace(/[\\/]+$/, '');
    const parts = decoded.split(/[\\/]/).filter(Boolean);
    return parts.at(-1) || '';
  } catch {
    const parts = raw.replace(/[\\/]+$/, '').split(/[\\/]/).filter(Boolean);
    return parts.at(-1) || '';
  }
}

function toIsoResetTime(raw) {
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(raw)) return raw;
  if (raw && typeof raw === 'object' && raw.seconds !== undefined) {
    const sec = Number(raw.seconds);
    const nanos = Number(raw.nanos ?? 0);
    if (Number.isFinite(sec) && sec > 0) {
      return new Date(sec * 1000 + Math.floor((Number.isFinite(nanos) ? nanos : 0) / 1e6)).toISOString();
    }
  }
  if (typeof raw === 'number' || typeof raw === 'bigint') {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return new Date(n > 1e11 ? n : n * 1000).toISOString();
  }
  return null;
}

export function fallbackQuotaFromUserStatus(user, now = Date.now()) {
  const configs = user?.userStatus?.cascadeModelConfigData?.clientModelConfigs;
  if (!Array.isArray(configs) || !configs.length) return [];
  const groups = new Map();
  for (const cfg of configs) {
    const qi = cfg?.quotaInfo;
    if (!qi || typeof qi !== 'object') continue;
    const rawFrac = qi.remainingFraction ?? qi.remaining?.remainingFraction ?? qi.remaining;
    const fracNum = typeof rawFrac === 'number' || (typeof rawFrac === 'string' && rawFrac.trim() !== '') ? Number(rawFrac) : NaN;
    if (!Number.isFinite(fracNum) || fracNum < 0 || fracNum > 1) continue;
    const label = String(cfg.label || cfg.displayName || cfg.modelOrAlias?.model || cfg.model || cfg.id || '').trim();
    const modelId = String(cfg.modelOrAlias?.model || cfg.model || cfg.id || '').trim();
    const hay = `${label} ${modelId}`.toLowerCase();
    let family = 'model';
    let displayName = label || modelId || 'Quota Pool';
    if (/argon|wtu/.test(hay)) { family = 'gemini-argon'; displayName = 'Gemini (Argon)'; }
    else if (/claude|anthropic|gpt|openai|\bo[134]\b/.test(hay)) { family = 'claude'; displayName = 'Claude / GPT'; }
    else if (/gemini|google|carbon|hydrogen/.test(hay)) { family = 'gemini'; displayName = 'Gemini'; }
    else if (modelId || label) { family = (modelId || label).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'model'; }
    const winKey = typeof qi.window === 'string' && /week|7d|7_days/i.test(qi.window) ? 'weekly' : '5h';
    const resetTime = toIsoResetTime(qi.resetTime ?? qi.resetAt);
    const bucket = {
      bucketId: `${family}-${winKey}`,
      window: winKey,
      remainingFraction: fracNum,
      ...(qi.remainingAmount !== undefined ? { remainingAmount: qi.remainingAmount } : {}),
      ...(resetTime ? { resetTime } : {}),
      disabled: qi.disabled === true,
      description: displayName,
    };
    let g = groups.get(family);
    if (!g) {
      g = { displayName, description: '', buckets: new Map() };
      groups.set(family, g);
    }
    const prev = g.buckets.get(winKey);
    if (!prev || fracNum < prev.remainingFraction) {
      g.buckets.set(winKey, bucket);
    }
  }
  if (!groups.size) return [];
  const payload = {
    groups: [...groups.values()].map((g) => ({
      displayName: g.displayName,
      description: g.description,
      buckets: [...g.buckets.values()],
    })),
  };
  return quotaMetrics(payload, now);
}

export class MetricsStore {
  constructor(clientOrOpts = undefined, maybeOpts = {}) {
    const isClientInstance = clientOrOpts && typeof clientOrOpts.call === 'function';
    const opts = isClientInstance ? (maybeOpts || {}) : (clientOrOpts || maybeOpts || {});
    const resolvedDataDir = opts.dataDir || platformPaths().data;
    const cdpPort = opts.cdpPort ?? opts.debugPort ?? null;
    const client = isClientInstance
      ? clientOrOpts
      : (opts.client || new AntigravityClient({ ...(cdpPort ? { cdpPort } : {}), ...(typeof opts.rendererRpc === 'function' ? { rendererRpc: opts.rendererRpc } : {}), ...(opts.dataDir ? { paths: () => platformPaths({ dataDir: resolvedDataDir }) } : {}) }));
    if (cdpPort && typeof client.setCdpPort === 'function') client.setCdpPort(cdpPort);

    const history = opts.history || new SessionHistory(join(resolvedDataDir, 'history-v1'));
    const onTrajectory = opts.onTrajectory || null;
    const onBackgroundResult = opts.onBackgroundResult || null;
    const background = opts.background;
    const transcripts = opts.transcripts !== undefined ? opts.transcripts : new TranscriptReader();
    const owns = opts.owns || (() => true);

    this.dataDir = resolvedDataDir;
    this.client = client;
    this.history = history;
    this.onTrajectory = onTrajectory;
    this.onBackgroundResult = onBackgroundResult;
    this.transcripts = transcripts;
    this.owns = owns;
    this.background =
      background === undefined
        ? (typeof client.streamTrajectoryPage === 'function' && history.directory
            ? new BackgroundStatistics({
                directory: join(dirname(history.directory), 'collection-jobs'),
                owns: () => this.owned(),
                onComplete: (...args) => this.acceptBackground(...args),
              })
            : null)
        : background;
    if (this.background && client.reader) client.reader.isBackgroundManaged = id => this.sessions.get(id)?.backgroundOnly === true;
    this.delegated = new DelegatedUsage(client, {
      owns,
      maxAgents: 24,
      refreshMs: 30000,
      onSource: async (scope, id, raw, options = {}) => {
        if (this.owned() && scope === this.storageScope() && this.onTrajectory && (!options.isCurrent || options.isCurrent() === true)) {
          await this.onTrajectory(scope, id, raw, options);
        }
      },
      onUpdate: async (scope, id, taskUsage, delegatedConversations) => {
        const entry = this.sessions.get(id);
        if (!this.owned() || scope !== this.storageScope() || !entry?.data) return;
        const identity = this.identity, epoch = this.epoch;
        const current = () => this.owned() && identity === this.identity && epoch === this.epoch && this.sessions.get(id) === entry;
        entry.data = { ...entry.data, taskUsage, delegatedConversations };
        try {
          const saved = await this.history.save(scope, id, entry.data, { isCurrent: current });
          if (saved && current()) entry.savedAt = saved.savedAt;
        } catch {
          if (current()) this.persistenceError = '统计暂时无法保存到本地';
        }
      },
    });
  }

  setCdpPort(port) {
    if (this.client && typeof this.client.setCdpPort === 'function') {
      this.client.setCdpPort(port);
    }
  }

  storageScope(identity = this.identity) { return identity || LOCAL_SCOPE; }
  quota = null;
  quotaAt = 0;
  quotaPending = null;
  identity = null;
  serverPid = null;
  summaries = [];
  summariesAt = 0;
  sessions = new Map();
  persistenceError = null;
  usagePersistenceError = false;
  usagePersistenceFailures = new Set();
  usagePersistenceFailureVersions = new Map();
  usagePersistenceFailureSerial = 0;
  epoch = 0;
  disposed = false;

  owned() { return !this.disposed && this.owns() === true; }
  setUsagePersistenceError(source, failed) {
    if (failed) {
      this.usagePersistenceFailures.add(source);
      this.usagePersistenceFailureVersions.set(source, ++this.usagePersistenceFailureSerial);
    } else {
      this.usagePersistenceFailures.delete(source);
      this.usagePersistenceFailureVersions.delete(source);
    }
    this.usagePersistenceError = this.usagePersistenceFailures.size > 0;
  }
  usageFailureVersion(source) { return this.usagePersistenceFailureVersions.get(source) || 0; }
  clearUsagePersistenceErrors() { this.usagePersistenceFailures.clear(); this.usagePersistenceFailureVersions.clear(); this.usagePersistenceError = false; }

  evictSessions(keepId = null) {
    if (this.sessions.size > 32) {
      for (const [oldId, oldEntry] of this.sessions) {
        if (this.sessions.size <= 32) break;
        if (oldId === keepId || oldEntry?.pending) continue;
        if (oldEntry?.backgroundOnly && this.background?.state(oldId)?.state === 'processing') continue;
        this.sessions.delete(oldId);
      }
    }
  }

  async cachedSession(id) {
    if (!this.owned() || !GUID.test(id)) return null;
    id = id.toLowerCase();
    const identity = this.identity, scope = this.storageScope(identity), epoch = this.epoch;
    const entry = this.sessions.get(id);
    if (usableMetrics(entry?.data)) return { ...entry.data, transcriptRestoredFromHistory: !!entry.data.transcriptStats, restoredFromHistory: true, savedAt: entry.savedAt || null };
    const saved = await this.history.load(scope, id);
    if (!this.owned() || identity !== this.identity || epoch !== this.epoch) return null;
    if (!saved) return null;
    if (!this.sessions.has(id)) {
      this.sessions.set(id, { data: saved.metrics, savedAt: saved.savedAt, updatedAt: 0 });
      this.evictSessions(id);
    }
    return { ...saved.metrics, transcriptRestoredFromHistory: !!saved.metrics.transcriptStats, restoredFromHistory: true, savedAt: saved.savedAt };
  }

  async refreshQuota(force = false) {
    if (!this.owned()) throw new Error('后台已重新连接，请等待刷新');
    if (!force && this.quota && Date.now() - this.quotaAt < 60000) return;
    if (this.quotaPending) return this.quotaPending;
    const epoch = this.epoch;
    this.quotaPending = (async () => {
      const user = await this.client.call('GetUserStatus');
      if (!this.owned() || epoch !== this.epoch) throw new Error('后台已重新连接，请等待刷新');
      const email = user.userStatus?.email;
      const identity = email ? createHash('sha256').update(email).digest('hex') : null;
      if (identity !== this.identity) {
        this.background?.reset();
        this.delegated.reset();
        this.transcripts?.reset();
        this.client.resetTrajectories?.();
        this.quota = null;
        this.quotaAt = 0;
        this.sessions.clear();
        this.summaries = [];
        this.summariesAt = 0;
        this.clearUsagePersistenceErrors();
      }
      this.identity = identity;
      let primaryQuota = null;
      let quotaErr = null;
      try {
        const response = await this.client.call('RetrieveUserQuotaSummary', force ? { forceRefresh: true } : {});
        if (!this.owned() || epoch !== this.epoch || identity !== this.identity) throw new Error('后台已重新连接，请等待刷新');
        primaryQuota = quotaMetrics(response);
      } catch (err) {
        if (!this.owned() || epoch !== this.epoch || identity !== this.identity) throw new Error('后台已重新连接，请等待刷新');
        quotaErr = err;
      }
      const hasUsablePool = (groups) =>
        Array.isArray(groups) &&
        groups.some((g) => g?.windows && (g.windows['5h']?.available || g.windows.weekly?.available));
      if (!hasUsablePool(primaryQuota)) {
        const fallbackQuota = fallbackQuotaFromUserStatus(user);
        if (hasUsablePool(fallbackQuota)) {
          this.quota = fallbackQuota;
          this.quotaAt = Date.now();
          return;
        }
        if (quotaErr) throw quotaErr;
      }
      this.quota = Array.isArray(primaryQuota) ? primaryQuota : [];
      this.quotaAt = Date.now();
    })().finally(() => { this.quotaPending = null; });
    return this.quotaPending;
  }

  async listConversations(force = false) {
    if (!this.owned()) throw new Error('后台已重新连接，请等待刷新');
    if (!force && Date.now() - this.summariesAt < 12000) return this.summaries;
    const scope = this.identity, epoch = this.epoch;
    const response = await this.client.call('GetAllCascadeTrajectories', { excludeSubtrajectories: false });
    if (!this.owned() || scope !== this.identity || epoch !== this.epoch) throw new Error('后台已重新连接，请等待刷新');
    const toEpochMs = (t) => {
      if (t === undefined || t === null || t === '') return 0;
      if (typeof t === 'bigint' || typeof t === 'number') {
        const n = Number(t);
        if (!Number.isFinite(n) || n <= 0) return 0;
        return n > 1e11 ? n : n * 1000;
      }
      if (typeof t === 'string') return Date.parse(t) || 0;
      if (typeof t === 'object' && t.seconds !== undefined) {
        const s = Number(t.seconds || 0);
        return Number.isFinite(s) && s > 0 ? s * 1000 : 0;
      }
      return 0;
    };
    this.summaries = Object.entries(response.trajectorySummaries || {})
      .map(([id, value]) => {
        const meta = value?.trajectoryMetadata || {};
        const subagent = Boolean(meta.parentConversationId) || Number(meta.nestingDepth || 0) > 0;
        const modMs = toEpochMs(value?.lastModifiedTime);
        const modIso = typeof value?.lastModifiedTime === 'string'
          ? value.lastModifiedTime
          : (modMs > 0 ? new Date(modMs).toISOString() : null);
        return {
          id,
          title: value?.summary || '未命名会话',
          modifiedAt: modIso || value?.lastModifiedTime,
          lastModifiedTime: value?.lastModifiedTime,
          createdTime: value?.createdTime,
          status: value?.status,
          stepCount: value?.stepCount,
          lastUserInputStepIndex: value?.lastUserInputStepIndex,
          trajectoryMetadata: meta,
          subagent,
          parentConversationId: meta.parentConversationId || null,
          rootConversationId: meta.rootConversationId || null,
          workspace: extractWorkspaceName(value),
          _sortMs: toEpochMs(value?.lastModifiedTime),
        };
      })
      .sort((a, b) => b._sortMs - a._sortMs);
    this.summariesAt = Date.now();
    return this.summaries;
  }

  async acceptBackground(scope, id, result, { database, revision, isCurrent }) {
    const entry = this.sessions.get(id), epoch = this.epoch, identity = this.identity;
    const current = () => isCurrent() && this.owned() && scope === this.storageScope(identity) && identity === this.identity && epoch === this.epoch && this.sessions.get(id) === entry;
    if (!entry || !current()) return;
    const fresh = safeMetrics(result.metrics, id);
    fresh.delegatedConversations = [...new Set([...(result.delegatedIds || []), ...(entry.data?.delegatedConversations || [])])].filter(x => GUID.test(x)).slice(0, 128);
    const previousTask = safeTaskUsage(entry.data?.previousTaskUsage) || safeTaskUsage(entry.data?.taskUsage);
    if (previousTask) fresh.previousTaskUsage = previousTask;
    if (fresh.delegatedConversations.length || result.delegatedTruncated) {
      fresh.taskUsage = {
        tokens: { ...fresh.tokens, outputAvailable: fresh.tokens.outputRequests > 0, complete: false },
        cache: { ...fresh.cache, complete: false },
        ownTokens: fresh.tokens.totalTokens,
        subagentTokens: 0,
        subagents: Math.max(1, fresh.delegatedConversations.length),
        loadedSubagents: 0,
        state: 'partial',
        complete: false,
      };
    }
    if (this.onBackgroundResult) {
      try {
        await this.onBackgroundResult(scope, id, database, { isCurrent: current });
        if (current()) {
          this.setUsagePersistenceError('background:' + id, false);
          entry.backgroundUsageComplete = true;
        }
      } catch (error) {
        if (current()) {
          this.setUsagePersistenceError('background:' + id, true);
          entry.backgroundUsageComplete = false;
          throw error;
        }
        return;
      }
    }
    if (!current()) return;
    entry.data = { ...reconcileMetrics(entry.data, fresh, entry.savedAt || null), ...(previousTask ? { previousTaskUsage: previousTask } : {}), conversationId: id };
    entry.collection = null;
    entry.backgroundRevision = revision;
    entry.backgroundCheckedAt = Date.now();
    entry.backgroundCompletedAt = Date.now();
    entry.backgroundReady = true;
    entry.updatedAt = Date.now();
    entry.lastSuccessAt = new Date().toISOString();
    try {
      const saved = await this.history.save(scope, id, entry.data, { isCurrent: current });
      if (saved && current()) entry.savedAt = saved.savedAt;
    } catch {
      if (current()) this.persistenceError = '统计暂时无法保存到本地';
    }
  }

  startBackground(scope, id, entry, current) {
    const ep = this.client.server || this.client.reader?.endpoint;
    if (!ep || ep.mode === 'renderer-proxy' || !ep.csrf) return false;
    const started = this.background?.request(scope, id, ep, { summary: this.client.reader?.summaries?.[id], isCurrent: current });
    if (started) {
      entry.backgroundOnly = true;
      entry.backgroundReady = false;
    }
    return started;
  }

  async session(id, force = false) {
    if (!GUID.test(id)) throw new Error('会话标识无效');
    if (!this.owned()) throw new Error('后台已重新连接，请等待刷新');
    id = id.toLowerCase();
    const identity = this.identity, scope = this.storageScope(identity), epoch = this.epoch;
    let entry = this.sessions.get(id);
    if (entry?.pending) return entry.pending;
    if (!force && entry?.data && Date.now() - entry.updatedAt < 4500) return entry.data;
    entry ||= {};
    this.sessions.delete(id);
    this.sessions.set(id, entry);
    this.evictSessions(id);
    const current = () => this.owned() && identity === this.identity && epoch === this.epoch && this.sessions.get(id) === entry;
    entry.pending = (async () => {
      if (!entry.data) {
        const saved = await this.history.load(scope, id);
        if (!current()) throw new Error('后台已重新连接，请等待刷新');
        if (saved) {
          entry.data = saved.metrics;
          entry.savedAt = saved.savedAt;
          entry.lastSuccessAt = saved.savedAt;
        }
      }
      if (entry.backgroundOnly && this.background) {
        const state = this.background.state(id);
        if (state?.state === 'processing') return entry.data || null;
        if (entry.backgroundReady) {
          const age = Date.now() - (entry.backgroundCompletedAt || 0);
          if (force && age < BACKGROUND_MANUAL_COOLDOWN_MS) return entry.data;
          if (!force && Date.now() - entry.backgroundCheckedAt < 30000) return entry.data;
          const summary = await this.client.reader.summary(id, null, force);
          if (!current()) throw Error('后台已重新连接，请等待刷新');
          entry.backgroundCheckedAt = Date.now();
          const revision = JSON.stringify([summary.stepCount ?? null, summary.lastModifiedTime ?? null, summary.status ?? null, summary.lastUserInputStepIndex ?? null]);
          if (revision === entry.backgroundRevision && age < (force ? BACKGROUND_MANUAL_COOLDOWN_MS : BACKGROUND_RECHECK_MS)) return entry.data;
        }
        this.startBackground(scope, id, entry, current);
        return entry.data || null;
      }
      const raw = await this.client.trajectory(id, { force, isCurrent: current });
      if (!current()) throw new Error('后台已重新连接，请等待刷新');
      if (this.onTrajectory) {
        try {
          const result = await this.onTrajectory(scope, id, raw, { isCurrent: current, guardKey: entry });
          if (current() && result?.deferred !== true) this.setUsagePersistenceError('foreground:' + id, false);
        } catch {
          if (current()) this.setUsagePersistenceError('foreground:' + id, true);
        }
      }
      if (!current()) throw new Error('后台已重新连接，请等待刷新');
      entry.collection = null;
      entry.lastSuccessAt = new Date().toISOString();
      const fresh = trajectoryMetrics(raw);
      fresh.delegatedConversations = [...new Set([...delegatedIds(id, raw, this.client.reader?.summaries || {}), ...(entry.data?.delegatedConversations || [])])].slice(0, 128);
      fresh.taskUsage = this.delegated.request(scope, id, raw, { saved: entry.data?.taskUsage, knownIds: fresh.delegatedConversations, force, isCurrent: current });
      try {
        if (this.transcripts) fresh.transcriptStats = this.transcripts.request(scope, id, raw);
      } catch {}
      entry.data = { ...reconcileMetrics(entry.data, fresh, entry.savedAt || null), conversationId: id };
      entry.updatedAt = Date.now();
      try {
        const saved = await this.history.save(scope, id, entry.data, { isCurrent: current });
        if (saved && current()) entry.savedAt = saved.savedAt;
        if (current()) this.persistenceError = null;
      } catch {
        if (current()) this.persistenceError = '统计暂时无法保存到本地';
      }
      if (!current()) throw new Error('后台已重新连接，请等待刷新');
      return entry.data;
    })()
      .catch(error => {
        if (current()) {
          entry.collection = collectionFailure(error);
          if (entry.collection && entry.collection.kind !== 'field') this.startBackground(scope, id, entry, current);
        }
        if (current() && usableMetrics(entry.data)) {
          entry.updatedAt = Date.now();
          entry.data = { ...entry.data, transcriptRestoredFromHistory: !!entry.data.transcriptStats, restoredFromHistory: true, savedAt: entry.savedAt || null };
          return entry.data;
        }
        throw error;
      })
      .finally(() => { entry.pending = null; });
    return entry.pending;
  }

  async snapshot({ conversationId, force = false, quotaRefresh = false, selectLatest = true, cdpPort = null } = {}) {
    if (cdpPort) this.setCdpPort(cdpPort);
    let connection = 'live', error = null, speed = null, sessionError = null, collection = null;
    try {
      if (!this.owned()) throw new Error('后台已重新连接，请等待刷新');
      const server = await this.client.discover();
      if (!this.owned()) throw new Error('后台已重新连接，请等待刷新');
      if (server.pid !== this.serverPid) {
        this.epoch++;
        this.background?.reset();
        this.delegated.reset();
        this.transcripts?.reset();
        this.quota = null;
        this.quotaAt = 0;
        this.sessions.clear();
        this.identity = null;
        this.summaries = [];
        this.summariesAt = 0;
        this.serverPid = server.pid;
        this.clearUsagePersistenceErrors();
      }
      try {
        await this.refreshQuota(force || quotaRefresh);
      } catch (e) {
        connection = this.quota ? 'stale' : 'offline';
        error = e.message;
      }
      let summaries = this.summaries;
      if (!conversationId && selectLatest !== false) {
        try {
          summaries = await this.listConversations(force);
        } catch (e) {
          connection = this.quota ? 'stale' : 'offline';
          error ||= e.message;
        }
      }
      const selected = conversationId || (selectLatest !== false ? summaries[0]?.id : null);
      if (selected) {
        try {
          speed = await this.session(selected, force);
        } catch (e) {
          sessionError = e.message;
        }
        const entry = this.sessions.get(selected.toLowerCase());
        if (entry?.collection || this.background?.state(selected.toLowerCase())) {
          collection = { ...entry?.collection, ...this.background?.state(selected.toLowerCase()), freshness: usableMetrics(speed) ? 'saved' : 'unavailable', lastSuccessAt: entry.lastSuccessAt || null };
        }
      }
    } catch (e) {
      connection = this.quota ? 'stale' : 'offline';
      error = e.message;
      if (conversationId) speed = await this.cachedSession(conversationId);
    }
    if (!collection && conversationId) {
      const entry = this.sessions.get(conversationId.toLowerCase());
      if (entry?.collection || this.background?.state(conversationId.toLowerCase())) {
        collection = { ...entry?.collection, ...this.background?.state(conversationId.toLowerCase()), freshness: usableMetrics(speed) ? 'saved' : 'unavailable', lastSuccessAt: entry.lastSuccessAt || null };
      }
    }
    return {
      connection,
      error,
      sessionError,
      collection,
      serverTime: new Date().toISOString(),
      quotaUpdatedAt: this.quotaAt ? new Date(this.quotaAt).toISOString() : null,
      groups: this.quota || [],
      speed,
      conversations: this.summaries,
      persistenceError: this.persistenceError,
      source: 'Antigravity local API',
    };
  }

  dispose() {
    this.disposed = true;
    this.background?.dispose();
    this.delegated.dispose();
    this.transcripts?.reset();
    this.client?.dispose?.();
    this.sessions.clear();
    this.summaries = [];
    this.summariesAt = 0;
    this.epoch++;
  }
}

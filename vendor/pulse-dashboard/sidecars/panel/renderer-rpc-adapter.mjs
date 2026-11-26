// Obsidian Prism — Read-only Host Renderer LS Wrapper RPC Adapter (Antigravity v2.34.0+)
// Used ONLY as a fallback when language_server no longer exposes --csrf_token on the command line.
// Strictly read-only allowlist; projects numeric/structural telemetry in-renderer and strips all prompts,
// message text, snippets, tool payloads, and token breakdown trees before crossing CDP.

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_METHODS = new Set([
  'Probe',
  'PeekContextState',
  'CheckHostIdleState',
  'GetUserStatus',
  'RetrieveUserQuotaSummary',
  'GetAllCascadeTrajectories',
  'GetCascadeTrajectory',
]);

const STEP_STATUS_NAMES = Object.freeze({
  0: 'CORTEX_STEP_STATUS_UNSPECIFIED',
  1: 'CORTEX_STEP_STATUS_PENDING',
  2: 'CORTEX_STEP_STATUS_RUNNING',
  3: 'CORTEX_STEP_STATUS_DONE',
  4: 'CORTEX_STEP_STATUS_INVALID',
  5: 'CORTEX_STEP_STATUS_CLEARED',
  6: 'CORTEX_STEP_STATUS_CANCELED',
  7: 'CORTEX_STEP_STATUS_ERROR',
  8: 'CORTEX_STEP_STATUS_GENERATING',
  9: 'CORTEX_STEP_STATUS_WAITING',
  11: 'CORTEX_STEP_STATUS_QUEUED',
  12: 'CORTEX_STEP_STATUS_INTERRUPTED',
});

function estimateSummaryTextTokens(val) {
  if (typeof val === 'number') return Number.isFinite(val) && val > 0 ? Math.round(val) : 0;
  if (typeof val === 'bigint') {
    const n = Number(val);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
  }
  if (val && typeof val === 'object' && typeof val.tokens === 'number' && Number.isFinite(val.tokens) && val.tokens > 0) {
    return Math.round(val.tokens);
  }
  if (typeof val !== 'string' || !val) return 0;
  let nonAscii = 0;
  for (let i = 0; i < val.length; i += 1) {
    if (val.charCodeAt(i) > 127) nonAscii += 1;
  }
  return Math.ceil((val.length - nonAscii) / 4 + nonAscii / 1.5);
}

function normalizeStepStatus(rawStatus) {
  if (typeof rawStatus === 'string' && rawStatus.trim()) return rawStatus.trim();
  if (typeof rawStatus === 'number' || typeof rawStatus === 'bigint') {
    const n = Number(rawStatus);
    if (Number.isInteger(n) && n >= 0) {
      return STEP_STATUS_NAMES[n] || `CORTEX_STEP_STATUS_${n}`;
    }
  }
  return undefined;
}

function normalizeContextWindowUsage(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const est = Number(raw.estimatedTokensUsed);
  if (!Number.isSafeInteger(est) || est < 0) return undefined;
  const mx = raw.maxContextTokens !== undefined && raw.maxContextTokens !== null ? Number(raw.maxContextTokens) : undefined;
  const gmIdx = raw.generatorMetadataIndex !== undefined && raw.generatorMetadataIndex !== null ? Number(raw.generatorMetadataIndex) : undefined;
  const lastIdx = raw.lastStepIndex !== undefined && raw.lastStepIndex !== null ? Number(raw.lastStepIndex) : undefined;
  return {
    estimatedTokensUsed: est,
    ...(Number.isSafeInteger(mx) && mx > 0 ? { maxContextTokens: mx } : {}),
    ...(Number.isSafeInteger(gmIdx) && gmIdx >= 0 ? { generatorMetadataIndex: gmIdx } : {}),
    ...(Number.isSafeInteger(lastIdx) && lastIdx >= 0 ? { lastStepIndex: lastIdx } : {}),
    estimatedAfterCompaction: raw.estimatedAfterCompaction === true,
  };
}

function normalizeCompactedIndices(raw) {
  const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.compactedAtStepIndices) ? raw.compactedAtStepIndices : null;
  if (!arr || !arr.length) return undefined;
  const out = [];
  for (const item of arr) {
    const n = Number(item);
    if (Number.isSafeInteger(n) && n >= 0) out.push(n);
  }
  return out.length ? out.slice(-64) : undefined;
}

function serializeJsonForEval(val) {
  const raw = JSON.stringify(val === undefined ? null : val);
  return String(raw).replace(/[<>/\u2028\u2029]/g, (ch) =>
    `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`
  );
}

export function protoTimestampToIso(val) {
  if (val === undefined || val === null || val === '') return undefined;
  if (typeof val === 'bigint' || typeof val === 'number') {
    const num = Number(val);
    if (!Number.isFinite(num) || num <= 0) return undefined;
    const d = new Date(num > 1e11 ? num : num * 1000);
    return Number.isFinite(d.getTime()) ? d.toISOString() : undefined;
  }
  if (typeof val === 'string') {
    const ms = Date.parse(val);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
  }
  if (typeof val === 'object') {
    const sec = Number(val.seconds ?? 0);
    const nanos = Number(val.nanos ?? 0);
    if (!Number.isFinite(sec) || sec <= 0) return undefined;
    const ms = sec * 1000 + (Number.isFinite(nanos) && nanos >= 0 ? Math.floor(nanos / 1e6) : 0);
    if (!Number.isFinite(ms)) return undefined;
    const d = new Date(ms);
    return Number.isFinite(d.getTime()) ? d.toISOString() : undefined;
  }
  return undefined;
}

export function protoDurationToObject(val) {
  if (val === null || val === undefined) return undefined;
  if (typeof val === 'number') return Number.isFinite(val) && val >= 0 ? val : undefined;
  if (typeof val === 'string') return /^\d+(?:\.\d+)?s$/.test(val) ? val : undefined;
  if (typeof val === 'object') {
    if (val.seconds === undefined && val.nanos === undefined) return undefined;
    const sec = Math.trunc(Number(val.seconds ?? 0));
    const nanos = Math.trunc(Number(val.nanos ?? 0));
    if (!Number.isSafeInteger(sec) || sec < 0 || !Number.isInteger(nanos) || nanos < 0 || nanos >= 1e9) {
      return undefined;
    }
    return { seconds: sec, nanos };
  }
  return undefined;
}

export function camelToUpperSnake(str) {
  const s = String(str || '').trim();
  if (!s) return '';
  return s
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

export function normalizeApiProvider(provider, meta = {}) {
  if (typeof provider === 'string' && /GOOGLE_GEMINI|OPENAI|ANTHROPIC/i.test(provider)) {
    return provider;
  }
  const hint = `${meta.modelDisplayName || ''} ${meta.responseModel || ''} ${meta.responseModelFull || ''}`.toLowerCase();
  const custom = meta.customMetadata && typeof meta.customMetadata === 'object' ? meta.customMetadata : {};
  if (custom.used_claude === 'true' || /\bclaude\b|anthropic|\bsonnet\b|\bopus\b|\bhaiku\b/.test(hint)) {
    return 'API_PROVIDER_ANTHROPIC';
  }
  if (/\bgpt\b|openai|\bo[134]\b/.test(hint)) {
    return 'API_PROVIDER_OPENAI';
  }
  if (/\bgemini\b|neon|carbon|argon|hydrogen|orchestrator/.test(hint) || Number(provider) === 24) {
    return 'API_PROVIDER_GOOGLE_GEMINI';
  }
  return typeof provider === 'string' ? provider : '';
}

export function extractModelLabelMap(userStatusPayload) {
  const map = new Map();
  const configs = userStatusPayload?.userStatus?.cascadeModelConfigData?.clientModelConfigs;
  if (!Array.isArray(configs)) return map;
  for (const cfg of configs) {
    if (!cfg || typeof cfg !== 'object') continue;
    const label = typeof cfg.label === 'string' ? cfg.label.trim() : '';
    if (!label) continue;
    const modelVal = cfg.modelOrAlias?.choice?.value ?? cfg.modelOrAlias?.model;
    if (modelVal !== undefined && modelVal !== null) {
      map.set(String(modelVal), label);
    }
    if (typeof cfg.modelId === 'string' && cfg.modelId.trim()) {
      map.set(cfg.modelId.trim(), label);
    }
  }
  return map;
}

export function normalizeRendererUserStatus(raw) {
  const us = raw?.userStatus && typeof raw.userStatus === 'object' ? raw.userStatus : {};
  const configs = Array.isArray(us?.cascadeModelConfigData?.clientModelConfigs)
    ? us.cascadeModelConfigData.clientModelConfigs.map((cfg) => ({
        label: typeof cfg?.label === 'string' ? cfg.label : '',
        modelId: typeof cfg?.modelId === 'string' ? cfg.modelId : '',
        modelOrAlias: cfg?.modelOrAlias || undefined,
        quotaInfo: cfg?.quotaInfo
          ? {
              remainingFraction: cfg.quotaInfo.remainingFraction,
              resetTime: protoTimestampToIso(cfg.quotaInfo.resetTime),
            }
          : undefined,
      }))
    : [];
  return {
    userStatus: {
      email: typeof us.email === 'string' ? us.email : undefined,
      name: typeof us.name === 'string' ? us.name : undefined,
      cascadeModelConfigData: { clientModelConfigs: configs },
    },
  };
}

export function normalizeRendererQuotaSummary(raw) {
  const root = raw?.response && typeof raw.response === 'object' ? raw.response : raw && typeof raw === 'object' ? raw : {};
  const groups = Array.isArray(root.groups)
    ? root.groups
        .filter((g) => g && typeof g === 'object')
        .map((g) => ({
          displayName: typeof g.displayName === 'string' ? g.displayName : '',
          description: typeof g.description === 'string' ? g.description : '',
          buckets: Array.isArray(g.buckets)
            ? g.buckets
                .filter((b) => b && typeof b === 'object')
                .map((b) => {
                  const out = {
                    bucketId: typeof b.bucketId === 'string' ? b.bucketId : '',
                    displayName: typeof b.displayName === 'string' ? b.displayName : '',
                    description: typeof b.description === 'string' ? b.description : '',
                    disabled: b.disabled === true,
                  };
                  if (typeof b.window === 'string') out.window = b.window;
                  if (b.remaining && typeof b.remaining === 'object') {
                    if (b.remaining.case === 'remainingFraction' && b.remaining.value !== undefined) {
                      out.remainingFraction = b.remaining.value;
                    } else if (b.remaining.case === 'remainingAmount' && b.remaining.value !== undefined) {
                      out.remainingAmount = b.remaining.value;
                    } else {
                      if (b.remaining.remainingFraction !== undefined) out.remainingFraction = b.remaining.remainingFraction;
                      if (b.remaining.remainingAmount !== undefined) out.remainingAmount = b.remaining.remainingAmount;
                    }
                  }
                  if (b.remainingFraction !== undefined) out.remainingFraction = b.remainingFraction;
                  if (b.remainingAmount !== undefined) out.remainingAmount = b.remainingAmount;
                  const iso = protoTimestampToIso(b.resetTime);
                  if (iso) out.resetTime = iso;
                  return out;
                })
            : [],
        }))
    : [];
  return { response: { groups } };
}

export function normalizeRendererSummaries(raw) {
  const out = {};
  const visibleMainIds = Array.isArray(raw?.visibleMainIds)
    ? Array.from(raw.visibleMainIds, (x) => String(x || '').trim().toLowerCase()).filter((x) => GUID_RE.test(x))
    : null;
  const discoveredSubagentIds = [];
  if (Array.isArray(raw?.discoveredSubagentIds)) {
    const seenSub = new Set();
    for (const item of raw.discoveredSubagentIds) {
      const rawId = typeof item === 'string' ? item : item?.id || item?.cascadeId || '';
      const id = String(rawId || '').trim().toLowerCase();
      if (!GUID_RE.test(id) || seenSub.has(id)) continue;
      seenSub.add(id);
      const rawPid = typeof item === 'object' && item ? item.parentId || item.parentConversationId || '' : '';
      const pid = String(rawPid || '').trim().toLowerCase();
      discoveredSubagentIds.push(GUID_RE.test(pid) && pid !== id ? { id, parentId: pid } : { id });
      if (discoveredSubagentIds.length >= 512) break;
    }
  }
  const extraFields = {
    ...(visibleMainIds && visibleMainIds.length ? { visibleMainIds } : {}),
    ...(discoveredSubagentIds.length ? { discoveredSubagentIds } : {}),
  };
  if (raw && typeof raw.trajectorySummaries === 'object' && !Array.isArray(raw.trajectorySummaries)) {
    for (const [id, sum] of Object.entries(raw.trajectorySummaries)) {
      if (!GUID_RE.test(id) || !sum || typeof sum !== 'object') continue;
      const key = id.toLowerCase();
      const modIso = protoTimestampToIso(sum.lastModifiedTime);
      const createdIso = protoTimestampToIso(sum.createdTime);
      const stepCount = Number(sum.stepCount ?? sum.numTotalSteps ?? 0);
      out[key] = {
        summary: typeof sum.summary === 'string' ? sum.summary : typeof sum.title === 'string' ? sum.title : 'Untitled Conversation',
        ...(Number.isSafeInteger(stepCount) && stepCount > 0 ? { stepCount } : {}),
        ...(modIso ? { lastModifiedTime: modIso } : {}),
        ...(createdIso ? { createdTime: createdIso } : {}),
        ...(typeof sum.status === 'string' || typeof sum.status === 'number' ? { status: sum.status } : {}),
        ...(Array.isArray(sum.workspaces) ? { workspaces: sum.workspaces } : {}),
        ...(sum.subagent === true ? { subagent: true } : {}),
        ...(sum.isSubagent === true ? { isSubagent: true } : {}),
        ...(typeof sum.parentConversationId === 'string' && sum.parentConversationId ? { parentConversationId: sum.parentConversationId } : {}),
        ...(typeof sum.parentId === 'string' && sum.parentId ? { parentId: sum.parentId } : {}),
        ...(typeof sum.parentCascadeId === 'string' && sum.parentCascadeId ? { parentCascadeId: sum.parentCascadeId } : {}),
        ...(typeof sum.rootConversationId === 'string' && sum.rootConversationId ? { rootConversationId: sum.rootConversationId } : {}),
        ...(typeof sum.swarmId === 'string' && sum.swarmId ? { swarmId: sum.swarmId } : {}),
        ...(typeof sum.subagentName === 'string' && sum.subagentName ? { subagentName: sum.subagentName } : {}),
        ...(sum.trajectoryMetadata && typeof sum.trajectoryMetadata === 'object' ? { trajectoryMetadata: sum.trajectoryMetadata } : {}),
      };
    }
    return { trajectorySummaries: out, ...extraFields };
  }
  const results = Array.isArray(raw?.results) ? raw.results : [];
  for (const item of results) {
    const id = typeof item?.cascadeId === 'string' ? item.cascadeId.trim() : '';
    if (!GUID_RE.test(id)) continue;
    const key = id.toLowerCase();
    const modIso = protoTimestampToIso(item.lastModifiedTime);
    const ws = typeof item.workspaceName === 'string' ? item.workspaceName.trim() : '';
    out[key] = {
      summary: typeof item.title === 'string' && item.title.trim() ? item.title.trim() : 'Untitled Conversation',
      ...(modIso ? { lastModifiedTime: modIso } : {}),
      ...(ws ? { workspaces: [{ workspaceFolderAbsoluteUri: ws }] } : {}),
    };
  }
  return { trajectorySummaries: out, ...extraFields };
}

export function normalizeRendererTrajectory(raw, cascadeId, modelLabelMap = null) {
  const traj = raw?.trajectory && typeof raw.trajectory === 'object' ? raw.trajectory : {};
  const rawSteps = Array.isArray(traj.steps) ? traj.steps : [];
  const rawGms = Array.isArray(traj.generatorMetadata) ? traj.generatorMetadata : [];

  const steps = rawSteps.map((s) => {
    const stepCase = typeof s?.stepCase === 'string' ? s.stepCase : typeof s?.step?.case === 'string' ? s.step.case : '';
    let typeStr = typeof s?.type === 'string' && s.type ? s.type : '';
    if (!typeStr && stepCase) {
      typeStr = `CORTEX_STEP_TYPE_${camelToUpperSnake(stepCase)}`;
    }
    if (!typeStr && s?.type !== undefined) {
      typeStr = `CORTEX_STEP_TYPE_${String(s.type)}`;
    }
    const meta = s?.metadata && typeof s.metadata === 'object' ? s.metadata : {};
    const normMeta = {};
    const createdAt = protoTimestampToIso(meta.createdAt);
    const startedAt = protoTimestampToIso(meta.startedAt);
    const completedAt = protoTimestampToIso(meta.completedAt);
    if (createdAt) normMeta.createdAt = createdAt;
    if (startedAt) normMeta.startedAt = startedAt;
    if (completedAt) normMeta.completedAt = completedAt;
    if (meta.hasToolCall || meta.toolCall) normMeta.toolCall = { id: '1' };

    const stepOut = { type: typeStr, metadata: normMeta };
    const normStatus = normalizeStepStatus(s?.status);
    if (normStatus) stepOut.status = normStatus;
    if (stepCase === 'plannerResponse' || s?.hasToolCalls || s?.plannerResponse) {
      const hasCalls = Boolean(s?.hasToolCalls || s?.plannerResponse?.toolCalls?.length);
      const hasResp = Boolean(s?.hasResponseText || (typeof s?.plannerResponse?.response === 'string' && s.plannerResponse.response.trim()));
      if (hasCalls || hasResp) {
        stepOut.plannerResponse = {
          toolCalls: hasCalls ? [{}] : [],
          response: hasResp ? 'x' : '',
        };
      }
    }
    const inv = s?.invokeSubagent || (stepCase === 'invokeSubagent' ? s?.step?.value : null);
    if (inv && typeof inv === 'object') {
      const cid = typeof inv.conversationId === 'string' && GUID_RE.test(inv.conversationId) ? inv.conversationId.toLowerCase() : null;
      const resIds = Array.isArray(inv.results)
        ? inv.results
            .map((r) => (typeof r?.conversationId === 'string' && GUID_RE.test(r.conversationId) ? { conversationId: r.conversationId.toLowerCase() } : null))
            .filter(Boolean)
        : [];
      if (cid || resIds.length) {
        stepOut.invokeSubagent = { ...(cid ? { conversationId: cid } : {}), ...(resIds.length ? { results: resIds } : {}) };
      }
    }
    const cp = s?.checkpoint || (stepCase === 'checkpoint' ? s?.step?.value : null);
    if (cp && typeof cp === 'object') {
      const cpIndex = cp.checkpointIndex !== undefined && cp.checkpointIndex !== null ? Number(cp.checkpointIndex) : undefined;
      const incStart = cp.includedStepIndexStart !== undefined && cp.includedStepIndexStart !== null ? Number(cp.includedStepIndexStart) : undefined;
      const incEnd = cp.includedStepIndexEnd !== undefined && cp.includedStepIndexEnd !== null ? Number(cp.includedStepIndexEnd) : undefined;
      const explicitSumTok = cp.summaryTokens !== undefined && cp.summaryTokens !== null ? Number(cp.summaryTokens) : undefined;
      const computedSumTok =
        estimateSummaryTextTokens(cp.userIntent) +
        estimateSummaryTextTokens(cp.sessionSummary) +
        estimateSummaryTextTokens(cp.codeChangeSummary) +
        estimateSummaryTextTokens(cp.memorySummary);
      const summaryTokens =
        Number.isSafeInteger(explicitSumTok) && explicitSumTok > 0
          ? explicitSumTok
          : computedSumTok > 0
            ? computedSumTok
            : undefined;
      const cpCw = cp.contextWindowMetadata && typeof cp.contextWindowMetadata === 'object' ? cp.contextWindowMetadata : null;
      const cpCwEst = cpCw ? Number(cpCw.estimatedTokensUsed ?? cpCw.tokenBreakdown?.totalTokens) : NaN;
      const cpCwMax = cpCw && cpCw.maxContextTokens !== undefined && cpCw.maxContextTokens !== null ? Number(cpCw.maxContextTokens) : NaN;
      stepOut.checkpoint = {
        ...(Number.isSafeInteger(cpIndex) && cpIndex >= 0 ? { checkpointIndex: cpIndex } : {}),
        intentOnly: cp.intentOnly === true,
        ...(Number.isSafeInteger(incStart) && incStart >= 0 ? { includedStepIndexStart: incStart } : {}),
        ...(Number.isSafeInteger(incEnd) && incEnd >= 0 ? { includedStepIndexEnd: incEnd } : {}),
        ...(cp.renderLatestCheckpoint !== undefined ? { renderLatestCheckpoint: Boolean(cp.renderLatestCheckpoint) } : {}),
        ...(cp.modelSummarizationFailed !== undefined ? { modelSummarizationFailed: Boolean(cp.modelSummarizationFailed) } : {}),
        ...(cp.usedFallbackSummary !== undefined ? { usedFallbackSummary: Boolean(cp.usedFallbackSummary) } : {}),
        ...(summaryTokens !== undefined ? { summaryTokens } : {}),
        ...(Number.isSafeInteger(cpCwEst) && cpCwEst >= 0
          ? {
              contextWindowMetadata: {
                estimatedTokensUsed: cpCwEst,
                ...(Number.isSafeInteger(cpCwMax) && cpCwMax > 0 ? { maxContextTokens: cpCwMax } : {}),
              },
            }
          : {}),
      };
    }
    return stepOut;
  });

  const generatorMetadata = [];
  for (const g of rawGms) {
    if (!g || typeof g !== 'object') continue;
    const cm = g.chatModel || (g.metadata?.case === 'chatModel' ? g.metadata.value : null);
    if (!cm || typeof cm !== 'object') continue;
    const u = cm.usage && typeof cm.usage === 'object' ? cm.usage : null;
    if (!u) continue;
    const modelKey = cm.model !== undefined && cm.model !== null ? String(cm.model) : u.model !== undefined && u.model !== null ? String(u.model) : '';
    const displayName =
      (typeof cm.modelDisplayName === 'string' && cm.modelDisplayName.trim()) ||
      (modelLabelMap && modelKey && modelLabelMap.get(modelKey)) ||
      (modelLabelMap && typeof cm.responseModel === 'string' && modelLabelMap.get(cm.responseModel)) ||
      '';
    const provider = normalizeApiProvider(u.apiProvider, {
      modelDisplayName: displayName,
      responseModel: cm.responseModel,
      responseModelFull: cm.responseModelFull,
      customMetadata: cm.customMetadata,
    });
    const normUsage = {
      model: u.model,
      inputTokens: u.inputTokens,
      outputTokens: u.outputTokens,
      ...(u.thinkingOutputTokens !== undefined ? { thinkingOutputTokens: u.thinkingOutputTokens } : {}),
      ...(u.responseOutputTokens !== undefined ? { responseOutputTokens: u.responseOutputTokens } : {}),
      ...(u.cacheWriteTokens !== undefined ? { cacheWriteTokens: u.cacheWriteTokens } : {}),
      ...(u.cacheReadTokens !== undefined ? { cacheReadTokens: u.cacheReadTokens } : {}),
      apiProvider: provider,
      ...(typeof u.messageId === 'string' && u.messageId ? { messageId: u.messageId } : {}),
      ...(typeof u.responseId === 'string' && u.responseId ? { responseId: u.responseId } : {}),
    };
    const retryInfos = Array.isArray(cm.retryInfos)
      ? cm.retryInfos
          .filter((ri) => ri && ri.usage && typeof ri.usage === 'object')
          .map((ri) => ({
            usage: {
              outputTokens: ri.usage.outputTokens,
              ...(ri.usage.responseOutputTokens !== undefined ? { responseOutputTokens: ri.usage.responseOutputTokens } : {}),
              ...(ri.usage.thinkingOutputTokens !== undefined ? { thinkingOutputTokens: ri.usage.thinkingOutputTokens } : {}),
            },
          }))
      : [];
    const csm = cm.chatStartMetadata && typeof cm.chatStartMetadata === 'object' ? cm.chatStartMetadata : null;
    const cw = csm?.contextWindowMetadata && typeof csm.contextWindowMetadata === 'object' ? csm.contextWindowMetadata : null;
    const csmCreated = protoTimestampToIso(csm?.createdAt);
    const csmStartIdx = csm?.startStepIndex !== undefined && csm?.startStepIndex !== null ? Number(csm.startStepIndex) : undefined;
    const csmCpIdx = csm?.checkpointIndex !== undefined && csm?.checkpointIndex !== null ? Number(csm.checkpointIndex) : undefined;
    const csmStepsCov =
      csm?.stepsCoveredByCheckpoint !== undefined && csm?.stepsCoveredByCheckpoint !== null ? Number(csm.stepsCoveredByCheckpoint) : undefined;
    const chatStartMetadata = csm
      ? {
          ...(csmCreated ? { createdAt: csmCreated } : {}),
          ...(Number.isSafeInteger(csmStartIdx) && csmStartIdx >= 0 ? { startStepIndex: csmStartIdx } : {}),
          ...(Number.isSafeInteger(csmCpIdx) && csmCpIdx >= 0 ? { checkpointIndex: csmCpIdx } : {}),
          ...(Number.isSafeInteger(csmStepsCov) && csmStepsCov >= 0 ? { stepsCoveredByCheckpoint: csmStepsCov } : {}),
          ...(cw
            ? {
                contextWindowMetadata: {
                  estimatedTokensUsed: cw.estimatedTokensUsed ?? cw.tokenBreakdown?.totalTokens,
                  maxContextTokens: cw.maxContextTokens,
                },
              }
            : {}),
        }
      : undefined;
    const ttft = protoDurationToObject(cm.timeToFirstToken);
    const streamDur = protoDurationToObject(cm.streamingDuration);
    const stepIndices = Array.isArray(g.stepIndices)
      ? g.stepIndices.map((idx) => Number(idx)).filter((idx) => Number.isInteger(idx) && idx >= 0)
      : [];
    generatorMetadata.push({
      stepIndices,
      chatModel: {
        model: cm.model,
        ...(displayName ? { modelDisplayName: displayName } : {}),
        ...(typeof cm.responseModel === 'string' && cm.responseModel ? { responseModel: cm.responseModel } : {}),
        ...(typeof cm.responseModelFull === 'string' && cm.responseModelFull ? { responseModelFull: cm.responseModelFull } : {}),
        usage: normUsage,
        ...(retryInfos.length ? { retryInfos } : {}),
        ...(chatStartMetadata ? { chatStartMetadata } : {}),
        ...(ttft !== undefined ? { timeToFirstToken: ttft } : {}),
        ...(streamDur !== undefined ? { streamingDuration: streamDur } : {}),
      },
    });
  }

  const rawStatus = raw?.status;
  const status =
    typeof rawStatus === 'string' && rawStatus
      ? rawStatus
      : rawStatus !== undefined && rawStatus !== null
        ? `CASCADE_RUN_STATUS_${String(rawStatus)}`
        : null;

  const numSteps = Number(raw?.numTotalSteps);
  const numGm = Number(raw?.numTotalGeneratorMetadata);
  const contextWindowUsage = normalizeContextWindowUsage(raw?.contextWindowUsage ?? traj?.contextWindowUsage);
  const compactedAtStepIndices = normalizeCompactedIndices(
    raw?.compactedAtStepIndices ?? raw?.compactionInfo ?? traj?.compactedAtStepIndices ?? traj?.compactionInfo
  );
  return {
    status,
    numTotalSteps: Number.isSafeInteger(numSteps) && numSteps >= 0 ? numSteps : steps.length,
    numTotalGeneratorMetadata: Number.isSafeInteger(numGm) && numGm >= 0 ? numGm : generatorMetadata.length,
    ...(contextWindowUsage ? { contextWindowUsage } : {}),
    ...(compactedAtStepIndices ? { compactedAtStepIndices } : {}),
    trajectory: {
      cascadeId: String(traj.cascadeId || cascadeId || '').toLowerCase(),
      steps,
      generatorMetadata,
    },
  };
}

export function buildRendererRpcExpression(method, body = {}) {
  if (!ALLOWED_METHODS.has(method)) {
    throw new Error(`Unsupported renderer RPC method: ${String(method)}`);
  }
  const safeParams = { method };
  if (method === 'GetCascadeTrajectory' || method === 'PeekContextState') {
    const cid = typeof body?.cascadeId === 'string' ? body.cascadeId.trim() : '';
    if (!GUID_RE.test(cid)) throw new Error('Invalid cascadeId for renderer RPC');
    safeParams.cascadeId = cid;
  } else if (method === 'RetrieveUserQuotaSummary') {
    safeParams.forceRefresh = Boolean(body?.forceRefresh);
  } else if (method === 'GetAllCascadeTrajectories') {
    const rawMax = Number(body?.maxEntries);
    if (Number.isInteger(rawMax) && rawMax >= 1 && rawMax <= 4096) {
      safeParams.maxEntries = rawMax;
    }
    if (body?.includeVisibleMainIds === true) {
      safeParams.includeVisibleMainIds = true;
    }
    if (body?.signalsOnly === true) {
      safeParams.signalsOnly = true;
      safeParams.includeVisibleMainIds = true;
    }
  }
  const argLiteral = serializeJsonForEval(safeParams);
  return `(async (params) => {
    const g = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : null;
    const guidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isLs = (v) => Boolean(v && typeof v === 'object' && typeof v.getUserStatus === 'function' && typeof v.getCascadeTrajectory === 'function');
    const isAgentMgr = (v) => Boolean(v && typeof v === 'object' && typeof v.peek === 'function' && typeof v.getAgentStates === 'function');
    const clearCachedRef = (key) => { try { if (g) delete g[key]; } catch {} };
    const saveCachedRef = (key, v) => {
      if (!g || !v) return;
      const box = typeof WeakRef === 'function' ? new WeakRef(v) : v;
      try {
        Object.defineProperty(g, key, { value: box, configurable: true, writable: true, enumerable: false });
      } catch {
        try { g[key] = box; } catch {}
      }
    };
    const readCachedRef = (key) => {
      try {
        const ref = g && g[key];
        if (!ref) return null;
        return typeof ref.deref === 'function' ? ref.deref() : ref && ref.value ? ref.value : ref;
      } catch {
        return null;
      }
    };
    const clearCachedLs = () => clearCachedRef('__agPrismLsRef');
    const saveCachedLs = (v) => saveCachedRef('__agPrismLsRef', v);
    const saveCachedStore = (st) => saveCachedRef('__agPrismStoreRef', st);
    const saveCachedAgentMgr = (mgr) => saveCachedRef('__agPrismAgentMgrRef', mgr);
    let usedCache = false;
    const findLs = (forceRescan = false) => {
      if (!forceRescan) {
        try {
          const cached = readCachedRef('__agPrismLsRef');
          if (isLs(cached)) {
            usedCache = true;
            return cached;
          }
          if (g && g.__agPrismLsRef) clearCachedLs();
        } catch {}
      }
      usedCache = false;
      const root = document.getElementById('root') || document.body;
      if (!root) return null;
      const fk = Object.keys(root).find((k) => k.startsWith('__reactContainer$') || k.startsWith('__reactFiber$'));
      if (!fk || !root[fk]) return null;
      const q = [root[fk]];
      const seen = new Set();
      let visited = 0;
      while (q.length && visited < 4000) {
        const f = q.shift();
        if (!f || seen.has(f)) continue;
        seen.add(f);
        visited += 1;
        const v = f.memoizedProps && f.memoizedProps.value;
        if (isLs(v)) {
          saveCachedLs(v);
          return v;
        }
        if (f.child) q.push(f.child);
        if (f.sibling) q.push(f.sibling);
      }
      return null;
    };
    const ts = (v) => {
      if (v === undefined || v === null || v === '') return undefined;
      if (typeof v === 'string') return v;
      if (typeof v === 'bigint' || typeof v === 'number') {
        const n = Number(v);
        if (!Number.isFinite(n) || n <= 0) return undefined;
        const d = new Date(n > 1e11 ? n : n * 1000);
        return Number.isFinite(d.getTime()) ? d.toISOString() : undefined;
      }
      if (typeof v === 'object' && (v.seconds !== undefined || v.nanos !== undefined)) {
        return { seconds: String(v.seconds ?? 0), nanos: Number(v.nanos ?? 0) };
      }
      return undefined;
    };
    const dur = (v) => {
      if (v === undefined || v === null) return undefined;
      if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? v : undefined;
      if (typeof v === 'bigint') {
        const n = Number(v);
        return Number.isFinite(n) && n >= 0 ? n : undefined;
      }
      if (typeof v === 'string') return v;
      if (typeof v === 'object' && (v.seconds !== undefined || v.nanos !== undefined)) {
        return { seconds: String(v.seconds ?? 0), nanos: Number(v.nanos ?? 0) };
      }
      return undefined;
    };
    const numStr = (v) => (v === undefined || v === null ? undefined : String(v));
    const numVal = (v) => {
      if (v === undefined || v === null) return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    };
    const choiceVal = (v) => {
      if (v === undefined || v === null) return undefined;
      if (typeof v === 'string') {
        const n = Number(v);
        return /^\\d+$/.test(v) && Number.isSafeInteger(n) ? n : v;
      }
      const n = Number(v);
      return Number.isFinite(n) ? n : String(v);
    };
    const tsSec = (v) => {
      if (v === undefined || v === null) return 0;
      if (typeof v === 'bigint' || typeof v === 'number') {
        const n = Number(v);
        if (!Number.isFinite(n) || n <= 0) return 0;
        return n > 1e11 ? n / 1000 : n;
      }
      if (typeof v === 'string') { const ms = Date.parse(v); return Number.isFinite(ms) ? ms / 1000 : 0; }
      if (typeof v === 'object' && v.seconds !== undefined) {
        const s = Number(v.seconds);
        const ns = Number(v.nanos ?? 0);
        if (!Number.isFinite(s) || s <= 0) return 0;
        return s + (Number.isFinite(ns) && ns > 0 ? ns / 1e9 : 0);
      }
      return 0;
    };
    const estStrTok = (str) => {
      if (typeof str !== 'string' || !str) return 0;
      let nonAscii = 0;
      for (let i = 0; i < str.length; i += 1) {
        if (str.charCodeAt(i) > 127) nonAscii += 1;
      }
      return Math.ceil((str.length - nonAscii) / 4 + nonAscii / 1.5);
    };
    const extractReduxSums = (st) => {
      if (!st || typeof st.getState !== 'function') return null;
      try {
        const s = st.getState();
        const sums = s && s.trajectorySummaries && s.trajectorySummaries.summaries;
        if (sums && typeof sums === 'object' && !Array.isArray(sums)) return sums;
      } catch {}
      return null;
    };
    const findReduxSummaries = () => {
      try {
        const cached = readCachedRef('__agPrismStoreRef');
        const cachedSums = extractReduxSums(cached);
        if (cachedSums) return cachedSums;
        if (g && g.__agPrismStoreRef) clearCachedRef('__agPrismStoreRef');
      } catch {}
      try {
        if (typeof document === 'undefined' || !document || typeof document.querySelectorAll !== 'function') return null;
        const anchors = document.querySelectorAll('[data-testid="new-conversation-button"], [data-testid="home-greeting"], [data-testid="agent-input-box"], [data-testid="conversation-view"], [data-testid="conversation-row-sidebar"]');
        for (let i = 0; i < anchors.length; i += 1) {
          const el = anchors[i];
          const fk = el && Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
          for (let f = fk && el[fk], depth = 0; f && depth < 60; f = f.return, depth += 1) {
            const mp = f.memoizedProps;
            if (mp && mp.store && typeof mp.store.getState === 'function') {
              const sums = extractReduxSums(mp.store);
              if (sums) {
                saveCachedStore(mp.store);
                return sums;
              }
            }
            for (let d = f.dependencies && f.dependencies.firstContext; d; d = d.next) {
              const v = d.memoizedValue;
              if (v && v.store && typeof v.store.getState === 'function') {
                const sums = extractReduxSums(v.store);
                if (sums) {
                  saveCachedStore(v.store);
                  return sums;
                }
              }
            }
          }
        }
      } catch {}
      return null;
    };
    const findAgentMgr = () => {
      try {
        const cached = readCachedRef('__agPrismAgentMgrRef');
        if (isAgentMgr(cached)) return cached;
        if (g && g.__agPrismAgentMgrRef) clearCachedRef('__agPrismAgentMgrRef');
      } catch {}
      try {
        if (typeof document !== 'undefined' && document && typeof document.querySelectorAll === 'function') {
          const anchors = document.querySelectorAll('[data-testid="conversation-view"], [data-testid="agent-input-box"], [data-testid="new-conversation-button"]');
          for (let i = 0; i < anchors.length; i += 1) {
            const el = anchors[i];
            const fk = el && Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
            for (let f = fk && el[fk], depth = 0; f && depth < 80; f = f.return, depth += 1) {
              const v = f.memoizedProps && f.memoizedProps.value;
              if (isAgentMgr(v)) {
                saveCachedAgentMgr(v);
                return v;
              }
              for (let d = f.dependencies && f.dependencies.firstContext; d; d = d.next) {
                if (isAgentMgr(d.memoizedValue)) {
                  saveCachedAgentMgr(d.memoizedValue);
                  return d.memoizedValue;
                }
              }
            }
          }
        }
        const root = (typeof document !== 'undefined' && document && (document.getElementById('root') || document.body)) || null;
        if (!root) return null;
        const fk = Object.keys(root).find((k) => k.startsWith('__reactContainer$') || k.startsWith('__reactFiber$'));
        if (!fk || !root[fk]) return null;
        const q = [root[fk]];
        const seen = new Set();
        let visited = 0;
        while (q.length && visited < 4000) {
          const f = q.shift();
          if (!f || seen.has(f)) continue;
          seen.add(f);
          visited += 1;
          const v = f.memoizedProps && f.memoizedProps.value;
          if (isAgentMgr(v)) {
            saveCachedAgentMgr(v);
            return v;
          }
          if (f.child) q.push(f.child);
          if (f.sibling) q.push(f.sibling);
        }
      } catch {}
      return null;
    };
    const projectContextWindowUsage = (cwu) => {
      if (!cwu || typeof cwu !== 'object') return undefined;
      const est = numVal(cwu.estimatedTokensUsed);
      if (est === undefined || est < 0) return undefined;
      const mx = numVal(cwu.maxContextTokens);
      const gmIdx = numVal(cwu.generatorMetadataIndex);
      const lastIdx = numVal(cwu.lastStepIndex);
      return {
        estimatedTokensUsed: est,
        ...(mx !== undefined && mx > 0 ? { maxContextTokens: mx } : {}),
        ...(gmIdx !== undefined && gmIdx >= 0 ? { generatorMetadataIndex: gmIdx } : {}),
        ...(lastIdx !== undefined && lastIdx >= 0 ? { lastStepIndex: lastIdx } : {}),
        estimatedAfterCompaction: Boolean(cwu.estimatedAfterCompaction),
      };
    };
    const projectCompactedIndices = (raw) => {
      const arr = Array.isArray(raw) ? raw : Array.isArray(raw && raw.compactedAtStepIndices) ? raw.compactedAtStepIndices : null;
      if (!arr || !arr.length) return undefined;
      const out = [];
      for (let i = 0; i < arr.length; i += 1) {
        const n = numVal(arr[i]);
        if (n !== undefined && Number.isInteger(n) && n >= 0) out.push(n);
      }
      return out.length ? out.slice(-64) : undefined;
    };
    const readLiveAgentState = (cid) => {
      try {
        const mgr = findAgentMgr();
        if (!mgr) return null;
        const prov = mgr.peek(cid) || mgr.peek(String(cid || '').toLowerCase());
        const st = prov && typeof prov.getState === 'function' ? prov.getState() : null;
        if (!st || typeof st !== 'object') return null;
        const contextWindowUsage = projectContextWindowUsage(st.contextWindowUsage);
        const compactedAtStepIndices = projectCompactedIndices(st.compactedAtStepIndices || st.compactionInfo);
        const totalSteps = numVal(st.trajectorySlice && st.trajectorySlice.totalStepsLength);
        const stStatus = typeof st.status === 'bigint' ? Number(st.status) : st.status;
        if (!contextWindowUsage && !compactedAtStepIndices && totalSteps === undefined && stStatus === undefined) return null;
        return {
          ...(contextWindowUsage ? { contextWindowUsage } : {}),
          ...(compactedAtStepIndices ? { compactedAtStepIndices } : {}),
          ...(totalSteps !== undefined && totalSteps >= 0 ? { stepCount: totalSteps } : {}),
          ...(stStatus !== undefined ? { status: stStatus } : {}),
        };
      } catch {
        return null;
      }
    };
    if (params.method === 'CheckHostIdleState') {
      const isRunningStatus = (st) => {
        const n = typeof st === 'bigint' ? Number(st) : st;
        if (n === 2 || n === 'CASCADE_RUN_STATUS_2') return true;
        return /RUNNING|IN_PROGRESS|GENERATING|ACTIVE/i.test(String(n || ''));
      };
      let runningCount = 0;
      let reason = 'idle';
      try {
        const sums = findReduxSummaries();
        if (sums && typeof sums === 'object') {
          for (const k of Object.keys(sums)) {
            if (!guidRe.test(k)) continue;
            const v = sums[k];
            if (v && isRunningStatus(v.status)) {
              runningCount += 1;
              reason = 'redux-running';
            }
          }
        }
      } catch {}
      try {
        const mgr = findAgentMgr();
        if (mgr && typeof mgr.getAgentStates === 'function') {
          const states = mgr.getAgentStates();
          const vals = states instanceof Map ? [...states.values()] : states && typeof states === 'object' ? Object.values(states) : [];
          for (let i = 0; i < vals.length; i += 1) {
            const st = vals[i] && typeof vals[i].getState === 'function' ? vals[i].getState() : vals[i];
            if (st && isRunningStatus(st.status)) {
              runningCount += 1;
              if (reason === 'idle') reason = 'agent-mgr-running';
            }
          }
        }
      } catch {}
      let domBusy = false;
      try {
        if (typeof document !== 'undefined' && document) {
          const busySel = [
            '[data-ag-sub-running="1"]',
            '.ag-cs-conv-aura-host[data-state="thinking"]',
            '.ag-cs-conv-aura-host[data-state="streaming"]',
            '.ag-cs-conv-aura-host[data-state="swarm"]',
            '[data-testid="running-row"]',
            '[data-testid="background-task-row"]',
            '[data-testid="input-cancel-button"]',
            '[data-testid="stop-button"]',
            '[data-testid="agent-loading"]',
            '[data-testid="thinking-collapsible-trigger"][data-op-thought-state="streaming"]',
            '[data-testid="agent-input-box"] [data-testid="cancel-button"]',
            '[data-testid="stop-generation-button"]',
          ].join(',');
          const isVis = (el) => {
            if (!el) return false;
            if (el.hidden === true) return false;
            try {
              if (typeof el.closest === 'function' && el.closest('[hidden]')) return false;
              if (el.style && (el.style.display === 'none' || el.style.visibility === 'hidden')) return false;
              if (typeof getComputedStyle === 'function') {
                const cs = getComputedStyle(el);
                if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) return false;
              }
            } catch {}
            return true;
          };
          const nodes = typeof document.querySelectorAll === 'function'
            ? document.querySelectorAll(busySel)
            : (typeof document.querySelector === 'function' && document.querySelector(busySel) ? [document.querySelector(busySel)] : []);
          const list = nodes && nodes.length ? nodes : (typeof document.querySelector === 'function' && document.querySelector(busySel) ? [document.querySelector(busySel)] : []);
          for (let i = 0; i < list.length; i += 1) {
            if (isVis(list[i])) {
              domBusy = true;
              if (reason === 'idle') reason = 'dom-busy';
              break;
            }
          }
        }
      } catch {}
      return { ok: true, data: { idle: runningCount === 0 && !domBusy, runningCount, domBusy, reason } };
    }
    if (params.method === 'PeekContextState') {
      const live = readLiveAgentState(params.cascadeId);
      const sums = findReduxSummaries();
      const lowerCid = params.cascadeId.toLowerCase();
      const sum = sums && (sums[params.cascadeId] || sums[lowerCid]) || null;
      const sumStepCount = sum ? numVal(sum.stepCount !== undefined ? sum.stepCount : sum.numTotalSteps) : undefined;
      const sumMod = sum ? ts(sum.lastModifiedTime) : undefined;
      const sumStatus = sum ? (typeof sum.status === 'bigint' ? Number(sum.status) : sum.status) : undefined;
      const stepCount =
        live && live.stepCount !== undefined && sumStepCount !== undefined
          ? Math.max(live.stepCount, sumStepCount)
          : live && live.stepCount !== undefined
            ? live.stepCount
            : sumStepCount;
      return {
        ok: true,
        data: {
          ...(stepCount !== undefined ? { stepCount } : {}),
          ...(sumMod !== undefined ? { lastModifiedTime: sumMod } : {}),
          ...(live && live.status !== undefined ? { status: live.status } : sumStatus !== undefined ? { status: sumStatus } : {}),
          ...(live && live.contextWindowUsage ? { contextWindowUsage: live.contextWindowUsage } : {}),
          ...(live && live.compactedAtStepIndices ? { compactedAtStepIndices: live.compactedAtStepIndices } : {}),
        },
      };
    }
    const collectVisibleMainIds = () => {
      if (!params.includeVisibleMainIds) return [];
      const seen = new Set();
      const guidScanRe = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/ig;
      const addFrom = (txt) => {
        if (typeof txt !== 'string' || txt.length < 36) return;
        const ms = txt.match(guidScanRe);
        if (ms) {
          for (let j = 0; j < ms.length && seen.size < 512; j += 1) seen.add(ms[j].toLowerCase());
        }
      };
      try {
        if (typeof location !== 'undefined' && location && typeof location.href === 'string') addFrom(location.href);
        if (typeof document !== 'undefined' && document && typeof document.querySelectorAll === 'function') {
          // 严格限定仅采集侧栏主对话行，排除子代理子树（避免主对话内子代理卡片 UUID 混入 protectedMainIds 导致永久漏归档）
          const subTreeSel = '[data-testid="subagent-node"], [data-testid="subagent-tab-conversation"], [data-ag-sub-running]';
          const rows = document.querySelectorAll('[data-testid="conversation-row-sidebar"], nav [data-cascade-id], aside [data-cascade-id]');
          for (let i = 0; i < rows.length && i < 400 && seen.size < 512; i += 1) {
            const el = rows[i];
            if (!el || typeof el.getAttribute !== 'function') continue;
            try {
              if (typeof el.closest === 'function' && el.closest(subTreeSel)) continue;
            } catch {}
            for (const attr of ['data-cascade-id', 'data-conversation-id', 'data-id', 'href', 'id']) {
              addFrom(el.getAttribute(attr));
            }
            try {
              const fk = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
              for (let f = fk && el[fk], d = 0; f && d < 6; f = f.return, d += 1) {
                const p = f.memoizedProps;
                if (!p || typeof p !== 'object') continue;
                for (const pk of ['cascadeId', 'conversationId', 'trajectoryId', 'id']) {
                  if (typeof p[pk] === 'string' && guidRe.test(p[pk])) seen.add(p[pk].toLowerCase());
                }
              }
            } catch {}
          }
        }
      } catch {}
      return [...seen];
    };
    const collectVisibleSubagentIds = (mainIds) => {
      if (!params.includeVisibleMainIds) return [];
      const excludedParentIds = new Set(Array.isArray(mainIds) ? mainIds : []);
      const found = new Map();
      const guidScanRe = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/ig;
      const markExcludedParent = (rawPid) => {
        const pid = String(rawPid || '').trim().toLowerCase();
        if (guidRe.test(pid)) {
          excludedParentIds.add(pid);
          found.delete(pid);
        }
      };
      const addSub = (rawId, rawParentId) => {
        const id = String(rawId || '').trim().toLowerCase();
        const pid = String(rawParentId || '').trim().toLowerCase();
        if (guidRe.test(pid)) markExcludedParent(pid);
        if (!guidRe.test(id) || excludedParentIds.has(id) || (guidRe.test(pid) && id === pid) || found.size >= 512) return;
        const safePid = guidRe.test(pid) && pid !== id ? pid : '';
        const prev = found.get(id);
        if (!prev) found.set(id, safePid ? { id, parentId: safePid } : { id });
        else if (safePid && !prev.parentId) prev.parentId = safePid;
      };
      const addFromText = (txt, parentId) => {
        if (typeof txt !== 'string' || txt.length < 36) return;
        const ms = txt.match(guidScanRe);
        if (ms) {
          for (let j = 0; j < ms.length && found.size < 512; j += 1) addSub(ms[j], parentId);
        }
      };
      // 1) 当前对话页内已渲染的子代理卡片/标签节点（零 RPC，绝不唤醒沉睡 .db）
      try {
        if (typeof document !== 'undefined' && document && typeof document.querySelectorAll === 'function') {
          const subRoots = document.querySelectorAll('[data-testid="subagent-node"], [data-testid="subagent-tab-conversation"], [data-ag-sub-running]');
          for (let i = 0; i < subRoots.length && i < 400 && found.size < 512; i += 1) {
            const el = subRoots[i];
            if (!el || typeof el.getAttribute !== 'function') continue;
            const parentHint = el.getAttribute('data-parent-id') || el.getAttribute('data-parent-conversation-id') || '';
            markExcludedParent(parentHint);
            const scanTargets = [el];
            try {
              if (typeof el.querySelectorAll === 'function') {
                const inner = el.querySelectorAll('[data-cascade-id], [data-conversation-id], [data-subagent-id], a[href]');
                for (let k = 0; k < inner.length && k < 16; k += 1) scanTargets.push(inner[k]);
              }
            } catch {}
            for (let t = 0; t < scanTargets.length; t += 1) {
              const node = scanTargets[t];
              if (!node || typeof node.getAttribute !== 'function') continue;
              for (const attr of ['data-cascade-id', 'data-conversation-id', 'data-subagent-id', 'data-id', 'href', 'id']) {
                addFromText(node.getAttribute(attr), parentHint);
              }
            }
            try {
              const fk = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
              for (let f = fk && el[fk], d = 0; f && d < 6; f = f.return, d += 1) {
                const p = f.memoizedProps;
                if (!p || typeof p !== 'object') continue;
                const pId = p.parentConversationId || p.parentCascadeId || p.parentId || parentHint;
                markExcludedParent(pId);
                // 仅在卡片自身 Fiber(d===0)接受通用 cascadeId/conversationId，祖先层严禁把父主对话容器 ID 误当子代理
                const childKeys = d === 0
                  ? ['subagentId', 'childConversationId', 'cascadeId', 'conversationId', 'trajectoryId']
                  : ['subagentId', 'childConversationId'];
                for (const pk of childKeys) {
                  if (typeof p[pk] === 'string' && guidRe.test(p[pk])) addSub(p[pk], pId);
                }
              }
            } catch {}
          }
        }
      } catch {}
      // 2) 当前活跃会话 AgentManager 纯内存状态中的委托子代理（零 GetCascadeTrajectory RPC）
      try {
        const mgr = findAgentMgr();
        if (mgr && typeof mgr.getAgentStates === 'function') {
          const states = mgr.getAgentStates();
          const isMapLike = states instanceof Map || Boolean(states && typeof states.entries === 'function' && typeof states.get === 'function');
          const entries = isMapLike
            ? [...states.entries()]
            : states && typeof states === 'object'
              ? Object.entries(states)
              : [];
          for (let i = 0; i < entries.length && found.size < 512; i += 1) {
            const [rawKey, rawProv] = entries[i];
            const st = rawProv && typeof rawProv.getState === 'function' ? rawProv.getState() : rawProv;
            if (!st || typeof st !== 'object') continue;
            const selfId = guidRe.test(String(st.cascadeId || ''))
              ? String(st.cascadeId).toLowerCase()
              : guidRe.test(String(rawKey || ''))
                ? String(rawKey).toLowerCase()
                : '';
            const tm = st.trajectoryMetadata && typeof st.trajectoryMetadata === 'object' ? st.trajectoryMetadata : null;
            const explicitParent = String(
              st.parentConversationId || st.parentCascadeId || (tm && (tm.parentConversationId || tm.parentCascadeId)) || ''
            ).trim().toLowerCase();
            if (st.isSubagent === true || (tm && tm.isSubagent === true) || (guidRe.test(explicitParent) && explicitParent !== selfId)) {
              if (selfId) addSub(selfId, explicitParent);
            }
            const parentId = selfId;
            for (const listKey of ['delegatedConversations', 'subagentConversationIds', 'childConversationIds']) {
              const list = st[listKey];
              if (!Array.isArray(list) || list.length === 0) continue;
              markExcludedParent(parentId);
              for (let j = 0; j < list.length && found.size < 512; j += 1) {
                const entry = list[j];
                addSub(typeof entry === 'string' ? entry : (entry && (entry.id || entry.cascadeId || entry.conversationId)), parentId);
              }
            }
            const steps = (st.trajectorySlice && Array.isArray(st.trajectorySlice.steps) && st.trajectorySlice.steps) ||
              (Array.isArray(st.steps) ? st.steps : null);
            if (steps) {
              for (let j = 0; j < steps.length && found.size < 512; j += 1) {
                const step = steps[j];
                const sc = step && step.step && step.step.case;
                const inv = sc === 'invokeSubagent'
                  ? (step.step && step.step.value)
                  : (step && step.invokeSubagent);
                if (!inv || typeof inv !== 'object') continue;
                markExcludedParent(parentId);
                if (typeof inv.conversationId === 'string') addSub(inv.conversationId, parentId);
                if (Array.isArray(inv.results)) {
                  for (let r = 0; r < inv.results.length && found.size < 512; r += 1) {
                    const resItem = inv.results[r];
                    if (resItem && typeof resItem.conversationId === 'string') addSub(resItem.conversationId, parentId);
                  }
                }
              }
            }
          }
        }
      } catch {}
      return [...found.values()];
    };
    if (params.method === 'GetAllCascadeTrajectories' && params.signalsOnly) {
      const visibleMainIds = collectVisibleMainIds();
      const discoveredSubagentIds = collectVisibleSubagentIds(visibleMainIds);
      return {
        ok: true,
        data: {
          trajectorySummaries: {},
          ...(visibleMainIds.length ? { visibleMainIds } : {}),
          ...(discoveredSubagentIds.length ? { discoveredSubagentIds } : {}),
        },
      };
    }
    let ls = findLs(false);
    if (!ls) return { ok: false, error: 'renderer_ls_unavailable' };
    if (params.method === 'Probe') return { ok: true, data: { available: true } };
    const execWithLs = async (activeLs) => {
      if (params.method === 'GetUserStatus') {
        const r = await activeLs.getUserStatus({});
        const us = (r && r.userStatus) || {};
        const cfgs = (us.cascadeModelConfigData && us.cascadeModelConfigData.clientModelConfigs) || [];
        return {
          ok: true,
          data: {
            userStatus: {
              email: typeof us.email === 'string' ? us.email : undefined,
              name: typeof us.name === 'string' ? us.name : undefined,
              cascadeModelConfigData: {
                clientModelConfigs: cfgs.slice(0, 256).map((c) => ({
                  label: c && c.label,
                  modelId: c && c.modelId,
                  modelOrAlias: c && c.modelOrAlias && c.modelOrAlias.choice ? { choice: { case: c.modelOrAlias.choice.case, value: choiceVal(c.modelOrAlias.choice.value) } } : undefined,
                  quotaInfo: c && c.quotaInfo ? { remainingFraction: c.quotaInfo.remainingFraction, resetTime: ts(c.quotaInfo.resetTime) } : undefined,
                })),
              },
            },
          },
        };
      }
      if (params.method === 'RetrieveUserQuotaSummary') {
        const r = await activeLs.retrieveUserQuotaSummary(params.forceRefresh ? { forceRefresh: true } : {});
        const root = (r && r.response) || r || {};
        const groups = Array.isArray(root.groups) ? root.groups.map((g) => ({
          displayName: g && g.displayName,
          description: g && g.description,
          buckets: Array.isArray(g && g.buckets) ? g.buckets.map((b) => ({
            bucketId: b && b.bucketId,
            displayName: b && b.displayName,
            description: b && b.description,
            window: b && b.window,
            disabled: Boolean(b && b.disabled),
            remaining: b && b.remaining ? { case: b.remaining.case, value: b.remaining.value !== undefined ? numVal(b.remaining.value) : undefined } : undefined,
            remainingFraction: b && b.remainingFraction,
            remainingAmount: b && b.remainingAmount !== undefined ? numStr(b.remainingAmount) : undefined,
            resetTime: ts(b && b.resetTime),
          })) : [],
        })) : [];
        return { ok: true, data: { response: { groups } } };
      }
      if (params.method === 'GetAllCascadeTrajectories') {
        const readScopeHint = () => {
          try {
            const cleanSeg = (s) => String(s || '').trim().toLowerCase().replace(/[^a-z0-9._:@-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
            const docEl = typeof document !== 'undefined' && document && document.documentElement;
            const attr = docEl && typeof docEl.getAttribute === 'function' ? String(docEl.getAttribute('data-ag-prism-scope') || '').trim() : '';
            if (/^(?:local|ssh:[a-z0-9._:@-]+|remote:[a-z0-9._:@-]+)$/i.test(attr)) return attr.toLowerCase();
            const href = typeof location !== 'undefined' && location && typeof location.href === 'string' ? location.href : '';
            if (href) {
              let dec = href;
              try { dec = decodeURIComponent(href); } catch {}
              const sshM = dec.match(/ssh-remote\\+([^/&#?\\s]+)/i);
              if (sshM && sshM[1]) {
                const h = cleanSeg(sshM[1]);
                if (h) return 'ssh:' + h;
              }
              const remM = dec.match(/(?:vscode-remote:\\/\\/|remoteAuthority=)([a-z0-9_-]+)\\+([^/&#?\\s]+)/i);
              if (remM && remM[1] && remM[2]) {
                const id = cleanSeg(remM[1] + '-' + remM[2]);
                if (id) return 'remote:' + id;
              }
            }
            const title = typeof document !== 'undefined' && document && typeof document.title === 'string' ? document.title : '';
            if (title) {
              const tSsh = title.match(/\\[SSH:\\s*([^\\]]+)\\]/i);
              if (tSsh && tSsh[1]) {
                const h = cleanSeg(tSsh[1]);
                if (h) return 'ssh:' + h;
              }
              const tRem = title.match(/\\[(WSL|Dev Container|Codespaces|Tunnel|Remote):\\s*([^\\]]+)\\]/i);
              if (tRem && tRem[1] && tRem[2]) {
                const id = cleanSeg(tRem[1] + '-' + tRem[2]);
                if (id) return 'remote:' + id;
              }
            }
          } catch {}
          return '';
        };
        const scopeHint = readScopeHint();
        const maxEntries = Number.isInteger(params.maxEntries) && params.maxEntries >= 1 && params.maxEntries <= 4096 ? params.maxEntries : 1024;
        const visibleMainIds = collectVisibleMainIds();
        const discoveredSubagentIds = collectVisibleSubagentIds(visibleMainIds);
        const projectSummaryEntry = (v) => {
          const tm = v.trajectoryMetadata && typeof v.trajectoryMetadata === 'object' ? v.trajectoryMetadata : null;
          return {
            summary: typeof v.summary === 'string' && v.summary ? v.summary : undefined,
            stepCount: numVal(v.stepCount !== undefined ? v.stepCount : v.numTotalSteps),
            lastModifiedTime: ts(v.lastModifiedTime),
            createdTime: ts(v.createdTime),
            status: typeof v.status === 'bigint' ? Number(v.status) : v.status,
            workspaces: Array.isArray(v.workspaces) ? v.workspaces.slice(0, 4).map((w) => ({ workspaceFolderAbsoluteUri: w && w.workspaceFolderAbsoluteUri })) : undefined,
            ...(v.subagent === true ? { subagent: true } : {}),
            ...(v.isSubagent === true ? { isSubagent: true } : {}),
            ...(typeof v.parentConversationId === 'string' && v.parentConversationId ? { parentConversationId: v.parentConversationId } : {}),
            ...(typeof v.parentId === 'string' && v.parentId ? { parentId: v.parentId } : {}),
            ...(typeof v.parentCascadeId === 'string' && v.parentCascadeId ? { parentCascadeId: v.parentCascadeId } : {}),
            ...(typeof v.rootConversationId === 'string' && v.rootConversationId ? { rootConversationId: v.rootConversationId } : {}),
            ...(typeof v.swarmId === 'string' && v.swarmId ? { swarmId: v.swarmId } : {}),
            ...(typeof v.subagentName === 'string' && v.subagentName ? { subagentName: v.subagentName } : {}),
            trajectoryMetadata: tm ? {
              parentConversationId: tm.parentConversationId,
              parentCascadeId: tm.parentCascadeId,
              rootConversationId: tm.rootConversationId,
              nestingDepth: numVal(tm.nestingDepth),
              ...(tm.isSubagent === true ? { isSubagent: true } : {}),
              ...(typeof tm.subagentName === 'string' && tm.subagentName ? { subagentName: tm.subagentName } : {}),
              ...(typeof tm.swarmId === 'string' && tm.swarmId ? { swarmId: tm.swarmId } : {}),
            } : undefined,
          };
        };
        const projectSummariesMap = (sums) => {
          const out = Object.create(null);
          const keys = Object.keys(sums)
            .filter((k) => guidRe.test(k) && sums[k] && typeof sums[k] === 'object')
            .sort((a, b) => tsSec(sums[b] && sums[b].lastModifiedTime) - tsSec(sums[a] && sums[a].lastModifiedTime))
            .slice(0, maxEntries);
          for (let i = 0; i < keys.length; i += 1) {
            const k = keys[i];
            const v = sums[k];
            out[k.toLowerCase()] = projectSummaryEntry(v);
          }
          return out;
        };
        const withExtra = (payload) => ({
          ...payload,
          ...(scopeHint ? { scopeHint } : {}),
          ...(visibleMainIds.length ? { visibleMainIds } : {}),
          ...(discoveredSubagentIds.length ? { discoveredSubagentIds } : {}),
        });
        if (typeof activeLs.getAllCascadeTrajectories === 'function') {
          const r = await activeLs.getAllCascadeTrajectories({ excludeSubtrajectories: false });
          const out = projectSummariesMap((r && r.trajectorySummaries) || {});
          return { ok: true, data: withExtra({ trajectorySummaries: out }) };
        }
        const reduxSums = findReduxSummaries();
        if (reduxSums && typeof reduxSums === 'object' && Object.keys(reduxSums).length > 0) {
          const merged = Object.create(null);
          const sortSecs = Object.create(null);
          const rKeys = Object.keys(reduxSums);
          for (let i = 0; i < rKeys.length; i += 1) {
            const rk = rKeys[i];
            if (!guidRe.test(rk)) continue;
            const v = reduxSums[rk];
            if (!v || typeof v !== 'object') continue;
            const key = rk.toLowerCase();
            merged[key] = projectSummaryEntry(v);
            sortSecs[key] = tsSec(v.lastModifiedTime);
          }
          if (typeof activeLs.searchConversations === 'function') {
            try {
              const sr = await activeLs.searchConversations({ query: '' });
              const sList = Array.isArray(sr && sr.results) ? sr.results : [];
              for (let i = 0; i < sList.length; i += 1) {
                const it = sList[i];
                const rawCid = it && typeof it.cascadeId === 'string' ? it.cascadeId.trim() : '';
                if (!rawCid || !guidRe.test(rawCid)) continue;
                const cid = rawCid.toLowerCase();
                const sSec = tsSec(it.lastModifiedTime);
                const title = typeof it.title === 'string' && it.title.trim() ? it.title.trim() : undefined;
                const ws = typeof it.workspaceName === 'string' ? it.workspaceName.trim() : '';
                if (merged[cid]) {
                  if (!merged[cid].summary && title) merged[cid].summary = title;
                  if ((!merged[cid].workspaces || !merged[cid].workspaces.length) && ws) {
                    merged[cid].workspaces = [{ workspaceFolderAbsoluteUri: ws }];
                  }
                  if (sSec > (sortSecs[cid] || 0)) {
                    merged[cid].lastModifiedTime = ts(it.lastModifiedTime);
                    sortSecs[cid] = sSec;
                  }
                } else {
                  merged[cid] = {
                    summary: title,
                    lastModifiedTime: ts(it.lastModifiedTime),
                    ...(ws ? { workspaces: [{ workspaceFolderAbsoluteUri: ws }] } : {}),
                  };
                  sortSecs[cid] = sSec;
                }
              }
            } catch {}
          }
          const topKeys = Object.keys(merged)
            .sort((a, b) => (sortSecs[b] || 0) - (sortSecs[a] || 0))
            .slice(0, maxEntries);
          const out = Object.create(null);
          for (let i = 0; i < topKeys.length; i += 1) {
            out[topKeys[i]] = merged[topKeys[i]];
          }
          return { ok: true, data: withExtra({ trajectorySummaries: out }) };
        }
        if (typeof activeLs.searchConversations === 'function') {
          const r = await activeLs.searchConversations({ query: '' });
          const rawList = Array.isArray(r && r.results) ? r.results.slice() : [];
          rawList.sort((a, b) => tsSec(b && b.lastModifiedTime) - tsSec(a && a.lastModifiedTime));
          const list = rawList.slice(0, maxEntries);
          return {
            ok: true,
            data: withExtra({
              results: list.map((it) => ({
                cascadeId: it && it.cascadeId,
                title: it && it.title,
                workspaceName: it && it.workspaceName,
                archived: Boolean(it && it.archived),
                lastModifiedTime: ts(it && it.lastModifiedTime),
              })),
            }),
          };
        }
        if (params.includeVisibleMainIds && (visibleMainIds.length > 0 || discoveredSubagentIds.length > 0)) {
          return { ok: true, data: withExtra({ trajectorySummaries: {} }) };
        }
        return { ok: false, error: 'renderer_summaries_unavailable' };
      }
      if (params.method === 'GetCascadeTrajectory') {
        const t = await activeLs.getCascadeTrajectory({ cascadeId: params.cascadeId });
        const traj = (t && t.trajectory) || {};
        const rawSteps = Array.isArray(traj.steps) ? traj.steps : [];
        const rawGms = Array.isArray(traj.generatorMetadata) ? traj.generatorMetadata : [];
        const liveState = readLiveAgentState(params.cascadeId);
        const steps = rawSteps.map((s) => {
          const sc = (s && s.step && s.step.case) || '';
          const sv = (s && s.step && s.step.value) || null;
          const m = (s && s.metadata) || {};
          const item = {
            type: typeof (s && s.type) === 'bigint' ? Number(s.type) : (s && s.type),
            status: typeof (s && s.status) === 'bigint' ? Number(s.status) : (s && s.status),
            stepCase: sc,
            metadata: {
              createdAt: ts(m.createdAt),
              startedAt: ts(m.startedAt),
              completedAt: ts(m.completedAt),
              hasToolCall: Boolean(m.toolCall),
            },
          };
          if (sc === 'plannerResponse' && sv && typeof sv === 'object') {
            item.hasToolCalls = Array.isArray(sv.toolCalls) && sv.toolCalls.length > 0;
            item.hasResponseText = typeof sv.response === 'string' && sv.response.trim().length > 0;
          } else if (sc === 'invokeSubagent' && sv && typeof sv === 'object') {
            const cid = typeof sv.conversationId === 'string' && guidRe.test(sv.conversationId) ? sv.conversationId : undefined;
            const res = Array.isArray(sv.results)
              ? sv.results.map((x) => (x && typeof x.conversationId === 'string' && guidRe.test(x.conversationId) ? { conversationId: x.conversationId } : null)).filter(Boolean)
              : [];
            if (cid || res.length) item.invokeSubagent = { conversationId: cid, results: res };
          } else {
            const cp = (sc === 'checkpoint' ? sv : null) || (s && s.checkpoint && typeof s.checkpoint === 'object' ? s.checkpoint : null);
            if (cp && typeof cp === 'object') {
              const sumTok =
                estStrTok(cp.userIntent) +
                estStrTok(cp.sessionSummary) +
                estStrTok(cp.codeChangeSummary) +
                estStrTok(cp.memorySummary);
              const cpCw = cp.contextWindowMetadata && typeof cp.contextWindowMetadata === 'object' ? cp.contextWindowMetadata : null;
              const cpCwEst = cpCw ? numVal(cpCw.estimatedTokensUsed ?? (cpCw.tokenBreakdown && cpCw.tokenBreakdown.totalTokens)) : undefined;
              const cpCwMax = cpCw ? numVal(cpCw.maxContextTokens) : undefined;
              item.checkpoint = {
                ...(numVal(cp.checkpointIndex) !== undefined ? { checkpointIndex: numVal(cp.checkpointIndex) } : {}),
                intentOnly: Boolean(cp.intentOnly),
                ...(numVal(cp.includedStepIndexStart) !== undefined ? { includedStepIndexStart: numVal(cp.includedStepIndexStart) } : {}),
                ...(numVal(cp.includedStepIndexEnd) !== undefined ? { includedStepIndexEnd: numVal(cp.includedStepIndexEnd) } : {}),
                ...(cp.renderLatestCheckpoint !== undefined ? { renderLatestCheckpoint: Boolean(cp.renderLatestCheckpoint) } : {}),
                ...(cp.modelSummarizationFailed !== undefined ? { modelSummarizationFailed: Boolean(cp.modelSummarizationFailed) } : {}),
                ...(cp.usedFallbackSummary !== undefined ? { usedFallbackSummary: Boolean(cp.usedFallbackSummary) } : {}),
                ...(sumTok > 0 ? { summaryTokens: sumTok } : {}),
                ...(cpCwEst !== undefined
                  ? {
                      contextWindowMetadata: {
                        estimatedTokensUsed: cpCwEst,
                        ...(cpCwMax !== undefined && cpCwMax > 0 ? { maxContextTokens: cpCwMax } : {}),
                      },
                    }
                  : {}),
              };
            }
          }
          return item;
        });
        const gms = [];
        for (let i = 0; i < rawGms.length; i += 1) {
          const g = rawGms[i];
          const cm = g && ((g.metadata && g.metadata.case === 'chatModel' && g.metadata.value) || g.chatModel);
          if (!cm || !cm.usage) continue;
          const u = cm.usage;
          const csm = cm.chatStartMetadata;
          const cw = csm && csm.contextWindowMetadata;
          const cmMeta = cm.customMetadata && typeof cm.customMetadata === 'object'
            ? { used_claude: cm.customMetadata.used_claude, used_non_gemini_model: cm.customMetadata.used_non_gemini_model }
            : undefined;
          gms.push({
            stepIndices: Array.isArray(g.stepIndices) ? g.stepIndices.map(Number) : [],
            chatModel: {
              model: numVal(cm.model),
              modelDisplayName: typeof cm.modelDisplayName === 'string' ? cm.modelDisplayName : undefined,
              responseModel: typeof cm.responseModel === 'string' ? cm.responseModel : undefined,
              responseModelFull: typeof cm.responseModelFull === 'string' ? cm.responseModelFull : undefined,
              customMetadata: cmMeta,
              timeToFirstToken: dur(cm.timeToFirstToken),
              streamingDuration: dur(cm.streamingDuration),
              usage: {
                model: numVal(u.model),
                inputTokens: numStr(u.inputTokens),
                outputTokens: numStr(u.outputTokens),
                thinkingOutputTokens: numStr(u.thinkingOutputTokens),
                responseOutputTokens: numStr(u.responseOutputTokens),
                cacheWriteTokens: numStr(u.cacheWriteTokens),
                cacheReadTokens: numStr(u.cacheReadTokens),
                apiProvider: u.apiProvider,
                messageId: typeof u.messageId === 'string' ? u.messageId : undefined,
                responseId: typeof u.responseId === 'string' ? u.responseId : undefined,
              },
              retryInfos: Array.isArray(cm.retryInfos)
                ? cm.retryInfos
                    .filter((ri) => ri && ri.usage)
                    .map((ri) => ({
                      usage: {
                        outputTokens: numStr(ri.usage.outputTokens),
                        responseOutputTokens: numStr(ri.usage.responseOutputTokens),
                        thinkingOutputTokens: numStr(ri.usage.thinkingOutputTokens),
                      },
                    }))
                : [],
              chatStartMetadata: csm
                ? {
                    createdAt: ts(csm.createdAt),
                    startStepIndex: numVal(csm.startStepIndex),
                    checkpointIndex: numVal(csm.checkpointIndex),
                    stepsCoveredByCheckpoint: numVal(csm.stepsCoveredByCheckpoint),
                    contextWindowMetadata: cw
                      ? {
                          estimatedTokensUsed: numVal(cw.estimatedTokensUsed ?? (cw.tokenBreakdown && cw.tokenBreakdown.totalTokens)),
                          maxContextTokens: numVal(cw.maxContextTokens),
                        }
                      : undefined,
                  }
                : undefined,
            },
          });
        }
        const directCwu = projectContextWindowUsage((t && t.contextWindowUsage) || traj.contextWindowUsage);
        const contextWindowUsage = (liveState && liveState.contextWindowUsage) || directCwu;
        const compactedAtStepIndices =
          (liveState && liveState.compactedAtStepIndices) ||
          projectCompactedIndices((t && (t.compactedAtStepIndices || t.compactionInfo)) || traj.compactedAtStepIndices || traj.compactionInfo);
        return {
          ok: true,
          data: {
            status: typeof (t && t.status) === 'bigint' ? Number(t.status) : (t && t.status),
            numTotalSteps: numVal(t && t.numTotalSteps),
            numTotalGeneratorMetadata: numVal(t && t.numTotalGeneratorMetadata),
            ...(contextWindowUsage ? { contextWindowUsage } : {}),
            ...(compactedAtStepIndices ? { compactedAtStepIndices } : {}),
            trajectory: {
              cascadeId: traj.cascadeId || params.cascadeId,
              steps,
              generatorMetadata: gms,
            },
          },
        };
      }
      return { ok: false, error: 'unsupported_method' };
    };
    try {
      const firstRes = await execWithLs(ls);
      if (firstRes && !firstRes.ok && usedCache && firstRes.error === 'renderer_summaries_unavailable') {
        clearCachedLs();
        const retryLs = findLs(true);
        if (retryLs && retryLs !== ls) return await execWithLs(retryLs);
      }
      return firstRes;
    } catch (err) {
      if (usedCache) {
        clearCachedLs();
        const retryLs = findLs(true);
        if (retryLs && retryLs !== ls) {
          try {
            return await execWithLs(retryLs);
          } catch (retryErr) {
            return { ok: false, error: String((retryErr && retryErr.message) || retryErr || 'renderer_rpc_failed') };
          }
        }
      }
      return { ok: false, error: String((err && err.message) || err || 'renderer_rpc_failed') };
    }
  })(${argLiteral})`;
}

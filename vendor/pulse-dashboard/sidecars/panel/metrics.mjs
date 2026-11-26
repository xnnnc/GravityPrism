// Upstream: ATtacK030130/antigrative-dashboard v0.9.1 (MIT License — Copyright (c) 2026 AG Pulse contributors)
// Integrated & adapted for Obsidian Prism under GPL-3.0-only compatibility terms.
// Pure transforms. No credentials, prompts, or message text enter the public result.
import { contextMetrics } from './context.mjs';
import { classifyRates, RATE_VERSION, RATE_REASONS } from './rate-quality.mjs';
export function seconds(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value === 'string' && /^\d+(?:\.\d+)?s$/.test(value)) {
    const n = Number(value.slice(0, -1));
    return Number.isFinite(n) ? n : null;
  }
  if (value && typeof value === 'object') {
    if (value.seconds === undefined && value.nanos === undefined) return null;
    const whole = Number(value.seconds ?? 0), nanos = Number(value.nanos ?? 0);
    if (!Number.isSafeInteger(whole) || whole < 0 || !Number.isInteger(nanos) || nanos < 0 || nanos >= 1e9) return null;
    const n = whole + nanos / 1e9;
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  return null;
}

export function tokenCount(value) {
  if (typeof value === 'bigint') {
    if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    return Number(value);
  }
  if (typeof value !== 'number' && !(typeof value === 'string' && /^\d+$/.test(value))) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

export function requestCacheMetrics(usage) {
  const input = tokenCount(usage.inputTokens);
  if ((usage.cacheReadTokens !== undefined && tokenCount(usage.cacheReadTokens) === null) ||
      (usage.cacheWriteTokens !== undefined && tokenCount(usage.cacheWriteTokens) === null)) return null;
  const read = tokenCount(usage.cacheReadTokens) ?? 0;
  const write = tokenCount(usage.cacheWriteTokens) ?? 0;
  const provider = String(usage.apiProvider || '');
  if (input === null) return null;
  // Antigravity ModelUsageStats normalizes inputTokens to uncached input,
  // including Gemini (verified against live records with cacheRead > input).
  // These are NOT upstream Gemini/OpenAI prompt_tokens. Add the separate
  // cache read/write counts exactly once for this local interface.
  const total = input + read + write;
  // A tool follow-up can explicitly report zero input. It is a valid neutral
  // sample, even though an all-zero denominator cannot produce a hit ratio.
  if (!Number.isSafeInteger(total) || total < 0 || read + write > total) return null;
  // A provider label is unnecessary for a validated zero denominator: it
  // contributes neither numerator nor denominator and never invents a ratio.
  if (total > 0 && !/GOOGLE_GEMINI|OPENAI|ANTHROPIC/.test(provider)) return null;
  return { inputTokens:total, cachedTokens:read, cacheWriteTokens:write, uncachedTokens:total-read-write };
}

function unionSeconds(intervals) {
  const sorted = intervals.filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b >= a).sort((a, b) => a[0] - b[0]);
  let total = 0, start = null, end = null;
  for (const [a, b] of sorted) {
    if (start === null) { start = a; end = b; }
    else if (a <= end) end = Math.max(end, b);
    else { total += end - start; start = a; end = b; }
  }
  if (start !== null) total += end - start;
  return total / 1000;
}

function safeNonNegInt(value) {
  if (value === undefined || value === null || value === '' || typeof value === 'boolean') return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

function firstValidIso(...values) {
  for (const v of values) {
    if (typeof v === 'string' && Number.isFinite(Date.parse(v))) {
      return new Date(v).toISOString();
    }
  }
  return null;
}

function estimateTextFieldTokens(val) {
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
  for (let i = 0; i < val.length; i++) if (val.charCodeAt(i) > 127) nonAscii++;
  return Math.ceil((val.length - nonAscii) / 4 + nonAscii / 1.5);
}

function isStepInProgress(status) {
  if (status === undefined || status === null) return false;
  if (typeof status === 'number' || typeof status === 'bigint') {
    const n = Number(status);
    return n === 1 || n === 2 || n === 8 || n === 9 || n === 11;
  }
  return /PENDING|RUNNING|GENERATING|WAITING|QUEUED/i.test(String(status));
}

function isStepFailedOrCanceled(status) {
  if (status === undefined || status === null) return false;
  if (typeof status === 'number' || typeof status === 'bigint') {
    const n = Number(status);
    return n === 4 || n === 5 || n === 6 || n === 7 || n === 12;
  }
  return /INVALID|CLEARED|CANCEL|ERROR|INTERRUPT/i.test(String(status));
}

function extractCheckpointPayload(step) {
  if (!step || typeof step !== 'object') return null;
  const typeStr = String(step.type || '');
  const stepCase = step.stepCase || step.step?.case || '';
  const hasCpObj = step.checkpoint && typeof step.checkpoint === 'object';
  if (!/CHECKPOINT|COMPACT/i.test(typeStr) && stepCase !== 'checkpoint' && !hasCpObj) return null;
  return (hasCpObj ? step.checkpoint : null) || (stepCase === 'checkpoint' && step.step?.value && typeof step.step.value === 'object' ? step.step.value : null) || {};
}

function findPostChatCompaction(response, trajectory, steps, lastChatInfo, lastActiveAt) {
  const totalSteps = Number(steps?.length) || 0;
  let latestCp = null;
  if (totalSteps > 0) {
    const lowerBound =
      lastChatInfo?.anchorStepIndex !== null && lastChatInfo?.anchorStepIndex !== undefined
        ? Math.max(0, lastChatInfo.anchorStepIndex)
        : Math.max(0, totalSteps - 64);
    for (let i = totalSteps - 1; i >= lowerBound; i--) {
      const step = steps[i];
      const cp = extractCheckpointPayload(step);
      if (!cp) continue;
      if (cp.intentOnly === true) continue;
      if (cp.modelSummarizationFailed === true && cp.usedFallbackSummary !== true) continue;
      if (isStepInProgress(step.status) || isStepFailedOrCanceled(step.status)) continue;
      const cpTimeIso = firstValidIso(step.metadata?.completedAt, step.metadata?.startedAt, step.metadata?.createdAt);
      const cpMs = cpTimeIso ? Date.parse(cpTimeIso) : NaN;
      const cpIdx = safeNonNegInt(cp.checkpointIndex);
      let isAfter = false;
      const hasStrongAnchor = lastChatInfo && lastChatInfo.maxStepIndex !== null;
      const hasBothTimes = Boolean(lastChatInfo && Number.isFinite(cpMs) && Number.isFinite(lastChatInfo.createdMs));
      if (!lastChatInfo) {
        isAfter = true;
      } else if (hasStrongAnchor) {
        if (i > lastChatInfo.maxStepIndex) isAfter = true;
        else if (i === lastChatInfo.maxStepIndex) {
          isAfter =
            (cpIdx !== null && lastChatInfo.checkpointIndex !== null && lastChatInfo.checkpointIndex > 0 && cpIdx > lastChatInfo.checkpointIndex) ||
            (hasBothTimes && cpMs > lastChatInfo.createdMs);
        }
      } else if (hasBothTimes && cpMs < lastChatInfo.createdMs) {
        // 无强 stepIndices 锚点时，若 checkpoint 时间早于最新 chat 请求时间则严格否决，避免旧压缩误清高水位
        isAfter = false;
      } else if (lastChatInfo.anchorStepIndex !== null) {
        if (i > lastChatInfo.anchorStepIndex) isAfter = true;
        else if (i === lastChatInfo.anchorStepIndex) {
          isAfter =
            (cpIdx !== null && lastChatInfo.checkpointIndex !== null && lastChatInfo.checkpointIndex > 0 && cpIdx > lastChatInfo.checkpointIndex) ||
            (hasBothTimes && cpMs > lastChatInfo.createdMs);
        }
      } else if (cpIdx !== null && lastChatInfo.checkpointIndex !== null && lastChatInfo.checkpointIndex > 0 && cpIdx > lastChatInfo.checkpointIndex) {
        isAfter = true;
      } else if (hasBothTimes) {
        isAfter = cpMs > lastChatInfo.createdMs;
      } else if (lastChatInfo.checkpointIndex !== null && lastChatInfo.checkpointIndex > 0 && cpIdx !== null && cpIdx <= lastChatInfo.checkpointIndex) {
        isAfter = false;
      } else if (i >= totalSteps - 3) {
        isAfter = true;
      }
      if (isAfter) {
        latestCp = { stepIndex: i, checkpoint: cp, timeIso: cpTimeIso, ms: cpMs };
        break;
      }
    }
  }

  const rawIndices =
    response?.compactedAtStepIndices ??
    response?.compactionInfo?.compactedAtStepIndices ??
    trajectory?.compactedAtStepIndices ??
    trajectory?.compactionInfo?.compactedAtStepIndices;
  let maxCompactedIdx = null;
  if (Array.isArray(rawIndices)) {
    for (const v of rawIndices) {
      const n = safeNonNegInt(v);
      if (n !== null && (maxCompactedIdx === null || n > maxCompactedIdx)) maxCompactedIdx = n;
    }
  }

  if (maxCompactedIdx !== null) {
    const stepAt = maxCompactedIdx < totalSteps ? steps[maxCompactedIdx] : null;
    const stepTimeIso = firstValidIso(stepAt?.metadata?.completedAt, stepAt?.metadata?.startedAt, stepAt?.metadata?.createdAt, lastActiveAt);
    const stepMs = stepTimeIso ? Date.parse(stepTimeIso) : NaN;
    let idxAfter = false;
    const hasStrongAnchor = lastChatInfo && lastChatInfo.maxStepIndex !== null;
    const hasBothTimes = Boolean(lastChatInfo && Number.isFinite(stepMs) && Number.isFinite(lastChatInfo.createdMs));
    if (!lastChatInfo) {
      idxAfter = true;
    } else if (hasStrongAnchor) {
      idxAfter = maxCompactedIdx > lastChatInfo.maxStepIndex;
    } else if (hasBothTimes && stepMs < lastChatInfo.createdMs) {
      idxAfter = false;
    } else if (lastChatInfo.anchorStepIndex !== null) {
      idxAfter = maxCompactedIdx > lastChatInfo.anchorStepIndex;
    } else if (hasBothTimes) {
      idxAfter = stepMs > lastChatInfo.createdMs;
    } else if (maxCompactedIdx >= Math.max(0, totalSteps - 3)) {
      idxAfter = true;
    }
    if (idxAfter && (!latestCp || maxCompactedIdx > latestCp.stepIndex)) {
      return {
        stepIndex: maxCompactedIdx,
        checkpoint: extractCheckpointPayload(stepAt),
        timeIso: stepTimeIso,
        ms: stepMs,
        fromIndices: true,
      };
    }
  }

  return latestCp;
}

function estimatePostCompactionTokens(compaction, totalSteps, prevUsed, maxTokens) {
  const cp = compaction?.checkpoint || {};
  const explicitSum = safeNonNegInt(cp.summaryTokens);
  const summaryTokens =
    explicitSum !== null && explicitSum > 0
      ? explicitSum
      : estimateTextFieldTokens(cp.userIntent) +
        estimateTextFieldTokens(cp.sessionSummary) +
        estimateTextFieldTokens(cp.codeChangeSummary) +
        estimateTextFieldTokens(cp.memorySummary);
  const trailingSteps =
    Number.isSafeInteger(compaction?.stepIndex) && totalSteps > compaction.stepIndex + 1
      ? totalSteps - 1 - compaction.stepIndex
      : 0;
  const trailingTokens = Math.min(trailingSteps, 32) * 300;
  const maxCap = maxTokens > 0 ? maxTokens : 512000;
  let baseOverhead = Math.min(16000, Math.max(4000, Math.round(maxCap * 0.025)));
  if (prevUsed !== null && prevUsed > 0) {
    baseOverhead = Math.min(baseOverhead, Math.floor(prevUsed * 0.5));
  }
  let est =
    summaryTokens > 0
      ? baseOverhead + summaryTokens + trailingTokens
      : Math.max(4000, Math.round(maxCap * 0.04)) + trailingTokens;
  if (prevUsed !== null && prevUsed > 0) {
    const ceiling = Math.min(Math.max(1000, Math.floor(prevUsed * 0.35)), Math.floor(maxCap * 0.35));
    est = Math.min(est, ceiling);
  }
  if (maxTokens > 0) est = Math.min(est, maxTokens);
  return Math.max(0, Math.round(est));
}

function resolveContextMetrics(response, trajectory, steps, lastChatInfo, lastChatWithCw, lastActiveAt) {
  const lastChat = lastChatInfo?.chat || null;
  const lastChatCw = lastChat?.chatStartMetadata?.contextWindowMetadata || null;
  const fallbackMax =
    tokenCount(lastChatCw?.maxContextTokens) ||
    tokenCount(lastChatWithCw?.chat?.chatStartMetadata?.contextWindowMetadata?.maxContextTokens) ||
    null;
  const model =
    lastChat?.modelDisplayName ||
    lastChat?.responseModel ||
    String(lastChat?.model || '') ||
    lastChatWithCw?.chat?.modelDisplayName ||
    lastChatWithCw?.chat?.responseModel ||
    '';

  const latestCompaction = findPostChatCompaction(response, trajectory, steps, lastChatInfo, lastActiveAt);

  // 1) Host-reported live ContextWindowUsage (Antigravity v2.34+ AgentState.contextWindowUsage)
  const rawCwu = response?.contextWindowUsage || trajectory?.contextWindowUsage || null;
  const cwuUsed = rawCwu && typeof rawCwu === 'object' ? tokenCount(rawCwu.estimatedTokensUsed) : null;
  if (cwuUsed !== null) {
    const cwuMax = tokenCount(rawCwu.maxContextTokens) || fallbackMax;
    const cwuGmIdx = safeNonNegInt(rawCwu.generatorMetadataIndex);
    const cwuLastStepIdx = safeNonNegInt(rawCwu.lastStepIndex);
    const cwuAfterCompact = rawCwu.estimatedAfterCompaction === true;
    const chatNewerByGm = lastChatInfo && cwuGmIdx !== null && lastChatInfo.index !== null && lastChatInfo.index > cwuGmIdx;
    const chatNewerByStep =
      lastChatInfo &&
      lastChatInfo.anchorStepIndex !== null &&
      cwuLastStepIdx !== null &&
      lastChatInfo.anchorStepIndex > cwuLastStepIdx;
    const chatStrictlyNewer = Boolean(chatNewerByGm || chatNewerByStep);
    const lastChatHasCw = tokenCount(lastChatCw?.estimatedTokensUsed) !== null;
    const cwuNewerStep =
      lastChatInfo &&
      lastChatInfo.anchorStepIndex !== null &&
      cwuLastStepIdx !== null &&
      cwuLastStepIdx > lastChatInfo.anchorStepIndex;

    if (!chatStrictlyNewer && (cwuAfterCompact || !lastChatHasCw || latestCompaction !== null || cwuNewerStep)) {
      const isCompacted = cwuAfterCompact || Boolean(latestCompaction);
      return contextMetrics(
        { estimatedTokensUsed: cwuUsed, maxContextTokens: cwuMax },
        {
          model,
          sampledAt: latestCompaction?.timeIso || lastActiveAt || lastChatInfo?.createdAt || null,
          compacted: isCompacted,
          estimatedAfterCompaction: isCompacted,
          source: 'Antigravity context window usage',
        }
      );
    }
  }

  // 2) Post-compaction fallback when a completed non-intentOnly checkpoint / compactedAtStepIndices is newer than lastChat
  if (latestCompaction) {
    const cpCw = latestCompaction.checkpoint?.contextWindowMetadata;
    const cpCwUsed = cpCw && typeof cpCw === 'object' ? tokenCount(cpCw.estimatedTokensUsed) : null;
    const cpCwMax = (cpCw && typeof cpCw === 'object' ? tokenCount(cpCw.maxContextTokens) : null) || fallbackMax;
    if (cpCwUsed !== null) {
      return contextMetrics(
        { estimatedTokensUsed: cpCwUsed, maxContextTokens: cpCwMax },
        {
          model,
          sampledAt: latestCompaction.timeIso || lastActiveAt || lastChatInfo?.createdAt || null,
          compacted: true,
          estimatedAfterCompaction: true,
          source: 'Antigravity context window usage',
        }
      );
    }
    const prevUsed = tokenCount(lastChatCw?.estimatedTokensUsed);
    if (prevUsed !== null || fallbackMax !== null) {
      const est = estimatePostCompactionTokens(latestCompaction, Number(steps?.length) || 0, prevUsed, fallbackMax);
      return contextMetrics(
        { estimatedTokensUsed: est, maxContextTokens: fallbackMax },
        {
          model,
          sampledAt: latestCompaction.timeIso || lastActiveAt || lastChatInfo?.createdAt || null,
          compacted: true,
          estimatedAfterCompaction: true,
          source: 'Antigravity post-compaction estimate',
        }
      );
    }
  }

  // 3) Default: latest chatModel's chatStartMetadata.contextWindowMetadata
  return contextMetrics(lastChatCw, {
    model,
    sampledAt: lastChatInfo?.createdAt || null,
  });
}

export function trajectoryMetrics(response, storage = null) {
  const trajectory = response.trajectory || {};
  const generators = trajectory.generatorMetadata || [];
  const samples = storage?.samples || [], ids = storage?.ids || new Map();
  const steps = trajectory.steps || [];
  const counts = { input: 0, output: 0, responseOutput: 0, thinkingOutput: 0, cacheRead: 0, cacheWrite: 0 };
  let modelSeconds = 0, ttftSeconds = 0, ttftSamples = 0, missingTiming = 0;
  const cache = { inputTokens:0, cachedTokens:0, cacheWriteTokens:0, uncachedTokens:0, outputTokens:0, measuredRequests:0, missingRequests:0 };
  // Token availability is independent of cache-ratio availability. In particular,
  // a historical request may retain output usage but lack normalized input data.
  const tokens = { inputTokens:0, cachedTokens:0, cacheWriteTokens:0, uncachedTokens:0, outputTokens:0,
    measuredRequests:0, inputRequests:0, outputRequests:0, missingInputRequests:0, missingOutputRequests:0,
    uncachedRequests:0, cachedRequests:0, cacheWriteRequests:0 };
  let lastChatInfo = null, lastChatWithCw = null;
  for (const [index, generator] of generators.entries()) {
    const chat = generator?.chatModel;
    if (chat && typeof chat === 'object') {
      const gSteps = Array.isArray(generator.stepIndices)
        ? generator.stepIndices.map(safeNonNegInt).filter(i => i !== null)
        : [];
      const maxStepIndex = gSteps.length ? Math.max(...gSteps) : null;
      const startStepIndex = safeNonNegInt(chat.chatStartMetadata?.startStepIndex);
      const checkpointIndex = safeNonNegInt(chat.chatStartMetadata?.checkpointIndex);
      const createdAt = firstValidIso(chat.chatStartMetadata?.createdAt);
      const createdMs = createdAt ? Date.parse(createdAt) : NaN;
      lastChatInfo = {
        index,
        chat,
        maxStepIndex,
        startStepIndex,
        // proto3 未设置标量常序列化为 0，仅在 startStepIndex > 0 时作为弱回退锚点，避免将 0 误判为有效步序锚点
        anchorStepIndex: maxStepIndex !== null ? maxStepIndex : (startStepIndex !== null && startStepIndex > 0 ? startStepIndex : null),
        checkpointIndex,
        createdAt,
        createdMs,
      };
      if (chat.chatStartMetadata?.contextWindowMetadata && typeof chat.chatStartMetadata.contextWindowMetadata === 'object') {
        lastChatWithCw = lastChatInfo;
      }
    }
    if (!chat?.usage) continue;
    const usage = chat.usage;
    // IDE executionId identifies a planner run/turn, not an individual model
    // request: tool follow-ups share it while having distinct responseIds.
    // Never collapse those follow-ups, even when no request ID was returned.
    const id = usage.responseId ? `response:${usage.apiProvider||''}:${usage.responseId}`
      : usage.messageId ? `message:${usage.messageId}` : `index:${index}`;
    const signature = JSON.stringify([usage.outputTokens,usage.responseOutputTokens,usage.thinkingOutputTokens,
      seconds(chat.streamingDuration),seconds(chat.timeToFirstToken),chat.responseModel,chat.model,usage.model]);
    if (ids.has(id)) {
      const previous = ids.get(id);
      if (previous.signature !== signature && !previous.sample.reasons.includes('duplicate-scope')) previous.sample.reasons.push('duplicate-scope');
      if(storage)ids.set(id,previous);
      continue;
    }
    const cached = requestCacheMetrics(usage);
    if(cached) {
      for(const key of ['inputTokens','cachedTokens','cacheWriteTokens','uncachedTokens'])cache[key]+=cached[key];
      cache.outputTokens+=tokenCount(usage.outputTokens)??0;
      cache.measuredRequests++;
    } else cache.missingRequests++;
    const output = tokenCount(usage.outputTokens);
    // These fields come from the local normalized ModelUsageStats contract,
    // not upstream prompt_tokens. Account for each readable component even
    // when another component (or the cache-ratio provider) is unavailable.
    const input = tokenCount(usage.inputTokens);
    const read = usage.cacheReadTokens === undefined && input !== null ? 0 : tokenCount(usage.cacheReadTokens);
    const write = usage.cacheWriteTokens === undefined && input !== null ? 0 : tokenCount(usage.cacheWriteTokens);
    const parts = [['uncachedTokens','uncachedRequests',input],['cachedTokens','cachedRequests',read],['cacheWriteTokens','cacheWriteRequests',write]];
    for (const [field,coverage,value] of parts) if (value !== null) {
      tokens[field] = tokens[field] === null ? null : tokenCount(tokens[field]+value);
      tokens[coverage]++;
    }
    if (input !== null && read !== null && write !== null && tokenCount(input+read+write) !== null) tokens.inputRequests++;
    else tokens.missingInputRequests++;
    if (output !== null) { tokens.outputTokens = tokens.outputTokens === null ? null : tokenCount(tokens.outputTokens+output); tokens.outputRequests++; }
    else tokens.missingOutputRequests++;
    if (parts.some(([, ,value])=>value!==null) || output !== null) tokens.measuredRequests++;
    const visible = tokenCount(usage.responseOutputTokens);
    const thinking = tokenCount(usage.thinkingOutputTokens);
    // Gemini may finish thinking before the first visible streaming token. Pair the
    // response token count with streamingDuration; do not charge thinking to that span.
    const responseTokens = visible ?? (output !== null && thinking !== null ? Math.max(0, output - thinking) : output);
    const duration = seconds(chat.streamingDuration);
    const ttft = seconds(chat.timeToFirstToken);
    counts.input += tokenCount(usage.inputTokens) ?? 0;
    counts.output += output ?? 0;
    counts.responseOutput += responseTokens ?? 0;
    counts.thinkingOutput += thinking ?? 0;
    counts.cacheRead += tokenCount(usage.cacheReadTokens) ?? 0;
    counts.cacheWrite += tokenCount(usage.cacheWriteTokens) ?? 0;
    if (ttft !== null) { ttftSeconds += ttft; ttftSamples++; }
    modelSeconds += (ttft ?? 0) + (duration ?? 0);
    const reasons = [];
    if (['outputTokens','responseOutputTokens','thinkingOutputTokens'].some(key=>usage[key] !== undefined && tokenCount(usage[key]) === null) ||
        output !== null && (visible !== null && visible > output || thinking !== null && thinking > output ||
          visible !== null && thinking !== null && visible + thinking > output)) reasons.push('token-scope');
    // One retryInfos entry is the ordinary attempt record, not evidence of a retry.
    // Multiple differing usage records lack attempt-specific timing in this API.
    const attempts = (Array.isArray(chat.retryInfos) ? chat.retryInfos : []).filter(info=>info?.usage);
    if (attempts.length > 1 && attempts.some(info=>['outputTokens','responseOutputTokens','thinkingOutputTokens'].some(key=>
        tokenCount(info.usage[key]) !== tokenCount(usage[key])))) reasons.push('retry-scope');
    const planners = (generator.stepIndices || []).map(i=>Number.isInteger(i) && i >= 0 ? steps[i] : null)
      .filter(step=>/PLANNER_RESPONSE/.test(String(step?.type || '')));
    const toolOnly = planners.length > 0 && planners.every(step=>step.plannerResponse?.toolCalls?.length > 0 &&
      !String(step.plannerResponse?.response || '').trim());
    const basis = visible !== null || thinking !== null ? 'response' : 'all-output';
    const sample = { responseTokens, duration, ttft, reasons, toolOnly,
      tps: responseTokens !== null && duration > 0 ? responseTokens / duration : null,
      model: chat.modelDisplayName || chat.responseModel || String(chat.model || usage.model || ''), basis,
      profile: JSON.stringify([usage.apiProvider || '',chat.responseModel || usage.model || chat.model || chat.modelDisplayName || '',basis]) };
    samples.push(sample);
    ids.set(id,{signature,sample});
  }
  (storage?.classify || classifyRates)(samples);
  const accepted = samples.filter(sample=>sample.status === 'ok');
  missingTiming = samples.filter(sample=>sample.status === 'missing' && sample.responseTokens > 0).length;
  const excludedTiming = samples.filter(sample=>sample.status === 'unreliable').length;
  const rateWarnings = samples.filter(sample=>sample.status === 'ok' && (sample.duration < 1 || sample.outlier)).length;
  const timingReasons = Object.fromEntries(RATE_REASONS.map(reason=>[reason,samples.filter(sample=>sample.reasons.includes(reason)).length]));
  let acceptedCount = 0, streamingSeconds = 0, sampledTokens = 0, peakTps = null;
  const recentTps = [];
  for (const s of accepted) {
    acceptedCount++;
    streamingSeconds += s.duration;
    sampledTokens += s.responseTokens;
    if (typeof s.tps === 'number' && Number.isFinite(s.tps)) {
      if (peakTps === null || s.tps > peakTps) peakTps = s.tps;
      if (recentTps.length === 16) recentTps.shift();
      recentTps.push(Math.round(s.tps * 10) / 10);
    }
  }
  const basisSamples = acceptedCount ? accepted : samples;
  const tools = steps.filter(s => /SEARCH_WEB|BROWSE|RUN_COMMAND|COMMAND|READ|WRITE|EDIT|CODE_ACTION|TOOL|MCP|LIST|GREP|VIEW|FIND|TERMINAL/i.test(String(s.type || '')) || s.metadata?.toolCall);
  const toolSeconds = storage ? storage.toolSeconds() : unionSeconds(tools.map(s => [Date.parse(s.metadata.startedAt || s.metadata.createdAt), Date.parse(s.metadata.completedAt)]));
  const latest = samples.at(-1) || null;
  const lastChat = lastChatInfo?.chat || (storage ? storage.lastChat() : null);
  if (!lastChatInfo && lastChat && typeof lastChat === 'object') {
    const startStepIndex = safeNonNegInt(lastChat.chatStartMetadata?.startStepIndex);
    const checkpointIndex = safeNonNegInt(lastChat.chatStartMetadata?.checkpointIndex);
    const createdAt = firstValidIso(lastChat.chatStartMetadata?.createdAt);
    lastChatInfo = {
      index: null,
      chat: lastChat,
      maxStepIndex: null,
      startStepIndex,
      anchorStepIndex: startStepIndex !== null && startStepIndex > 0 ? startStepIndex : null,
      checkpointIndex,
      createdAt,
      createdMs: createdAt ? Date.parse(createdAt) : NaN,
    };
  }
  let lastActiveMs = NaN;
  const considerTime = value => {
    if (typeof value !== 'string') return;
    const ms = Date.parse(value);
    if (Number.isFinite(ms) && (!Number.isFinite(lastActiveMs) || ms > lastActiveMs)) lastActiveMs = ms;
  };
  considerTime(lastChat?.chatStartMetadata?.createdAt);
  for (let i = steps.length - 1, stop = Math.max(0, steps.length - 8); i >= stop; i--) {
    const meta = steps[i]?.metadata;
    considerTime(meta?.completedAt);
    considerTime(meta?.startedAt);
    considerTime(meta?.createdAt);
  }
  const lastActiveAt = Number.isFinite(lastActiveMs) ? new Date(lastActiveMs).toISOString() : null;
  const inputParts=[tokens.uncachedTokens,tokens.cachedTokens,tokens.cacheWriteTokens];
  tokens.inputTokens = tokenCount(inputParts.reduce((sum,value)=>sum+(value??0),0));
  const totalTokens=tokenCount((tokens.inputTokens??0)+(tokens.outputTokens??0));
  return {
    source: 'Antigravity request metadata', status: response.status || null,
    conversationId: trajectory.cascadeId || null,
    steps: Number(response.numTotalSteps ?? steps.length), rounds: steps.filter(s => /USER_INPUT/.test(String(s.type))).length,
    requests: ids.size, measuredRequests: acceptedCount, missingTiming, excludedTiming, rateWarnings, timingReasons, rateVersion: RATE_VERSION, counts,
    tokens:{...tokens,totalTokens,
      complete:tokens.missingInputRequests===0&&tokens.missingOutputRequests===0&&inputParts.every(value=>value!==null)&&tokens.outputTokens!==null&&totalTokens!==null},
    cache:{...cache,totalTokens:cache.inputTokens+cache.outputTokens,hitRate:cache.inputTokens>0?cache.cachedTokens/cache.inputTokens:null,complete:cache.missingRequests===0},
    tps: streamingSeconds > 0 ? sampledTokens / streamingSeconds : null, latestTps: latest?.status === 'ok' ? latest.tps : null,
    peakTps, recentTps, lastActiveAt,
    latestRateStatus: latest?.status ?? 'missing',
    rateBasis: basisSamples.length && basisSamples.every(s => s.basis === 'response') ? 'response' : 'all-output',
    streamingSeconds, modelSeconds, toolSeconds, ttftSeconds: ttftSamples ? ttftSeconds / ttftSamples : null,
    latestShortSample: latest?.status === 'ok' && latest.duration < 1, model: latest?.model || null,
    context: resolveContextMetrics(response, trajectory, steps, lastChatInfo, lastChatWithCw, lastActiveAt),
    complete: Number(response.numTotalGeneratorMetadata ?? generators.length) === generators.length,
  };
}

export function quotaMetrics(response, now = Date.now()) {
  const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
  const text=value=>typeof value==='string'?value:'';
  const root = object(response?.response)?response.response:object(response)?response:{};
  const normWindow=raw=>{
    const s=text(raw).trim().toLowerCase().replace(/^quota[_-]?window[_-]?/, '');
    if(/^(?:5h|5hr|5[_-]?hours?|five[_-]?hours?)$/.test(s))return '5h';
    if(/^(?:weekly|week|1w|7d|7[_-]?days?)$/.test(s))return 'weekly';
    return null;
  };
  const SUFFIX_RE=/[-_](5h|5hr|5[_-]?hours?|five[_-]?hours?|weekly|7[_-]?days?)$/i;
  const bucketFamily=bucket=>text(bucket?.bucketId).replace(SUFFIX_RE, '');
  const cadence=bucket=>{
    // Do not reinterpret an explicitly different cadence from its name.
    if(Object.hasOwn(bucket,'window'))return normWindow(bucket.window);
    const m=text(bucket.bucketId).match(SUFFIX_RE);
    return m?normWindow(m[1]):null;
  };
  const remainingValue=(bucket,field)=>Object.hasOwn(bucket,field)?bucket[field]
    :object(bucket.remaining)?bucket.remaining[field]:undefined;
  const fraction=value=>{
    // Proto JSON uses a number. Also accept decimal text from legacy adapters,
    // but never turn null, blanks, booleans or arrays into an exhausted quota.
    if(typeof value!=='number'&&!(typeof value==='string'&&/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)))return null;
    const result=Number(value);return Number.isFinite(result)&&result>=0&&result<=1?result:null;
  };
  let groups=Array.isArray(root.groups)?root.groups.filter(object):[];
  if(!groups.length&&Array.isArray(root.buckets)){
    // Older summaries may return only a flat bucket list. Keep each bucket
    // family distinct so Argon's weekly allowance cannot replace Gemini's.
    const families=new Map();
    for(const [index,bucket]of root.buckets.entries()){
      if(!object(bucket))continue;
      const key=bucketFamily(bucket)||`group-${index}`;
      if(!families.has(key))families.set(key,{displayName:text(bucket.displayName)||key,buckets:[]});
      families.get(key).buckets.push(bucket);
    }
    groups=[...families.values()];
  }
  return groups.map((group, index) => ({
    id: (Array.isArray(group.buckets)?group.buckets.filter(object).map(bucketFamily).find(Boolean):null)||`group-${index}`,
    name: text(group.displayName) || `Quota Group ${index + 1}`, description: text(group.description),
    windows: Object.fromEntries(['5h', 'weekly'].map(window => {
      const bucket = (Array.isArray(group.buckets)?group.buckets:[]).find(b=>object(b)&&cadence(b)===window);
      if (!bucket) return [window, { available: false, reason: 'Quota window not returned by account' }];
      const remaining = fraction(remainingValue(bucket,'remainingFraction'));
      const date = typeof bucket.resetTime==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(bucket.resetTime)?Date.parse(bucket.resetTime):NaN;
      return [window, { available: true, id: text(bucket.bucketId), remaining, amount: tokenCount(remainingValue(bucket,'remainingAmount')),
        resetAt: Number.isFinite(date) ? new Date(date).toISOString() : null,
        expired: Number.isFinite(date) && date <= now, disabled: bucket.disabled === true, description: text(bucket.description) }];
    })),
  }));
}

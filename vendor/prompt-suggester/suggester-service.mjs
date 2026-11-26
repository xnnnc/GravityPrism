// Obsidian Prism — Channel 11 Context-Aware Next-Prompt Suggester Service (v1.0.8 · Beta)
// - Beta 默认严格关闭（enabled: false）；开启后在助手回复完成时结合上下文预测下一条用户可执行提示词
// - 与思考转译双向共享渠道凭据（名称、Base URL、API Key），但独立保存提示词建议选中的渠道与各渠道模型 ID（modelsByProfile）
// - 未配置或无明确下一步可执行提示时保持静默零打扰

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildNoThinkingParams,
  isKeylessAllowedEndpoint,
  redactSecrets,
} from '../thought-translator/translator-service.mjs';

export const ALLOWED_SUGGESTER_ACTIONS = new Set([
  'get-config',
  'save-config',
  'fetch-models',
  'test-connection',
  'suggest',
  'cancel',
  'clear-cache',
]);

export const DEFAULT_SUGGESTER_CONFIG = Object.freeze({
  version: 1,
  enabled: false,
  ttlMinutes: 15,
  activeProfileId: '',
  modelsByProfile: Object.freeze({}),
});

const MAX_TURNS = 6;
const MAX_TURN_CHARS = 2200;
const MAX_TOTAL_CONTEXT_CHARS = 7200;
const MAX_CACHE_ENTRIES = 32;

const SYCOPHANTIC_PREFIX_RE =
  /^(?:(?:太厉害了|太棒了|太好了|太强了|非常好|非常棒|很棒|好棒|真棒|牛啊|完美|好的|明白|收到|谢谢(?:你)?|非常感谢|辛苦了|Awesome|Great(?:\s+job|\s+work)?|Nice(?:\s+work)?|Looks\s+good|Perfect|Amazing|Got\s+it|Okay|Thanks(?:\s+a\s+lot)?|Thank\s+you|素晴らしい|すごい|完璧です|了解です|わかりました|ありがとう(?:ございます)?)[!！,，。.\s]+)+/i;

const BRACKET_PLACEHOLDER_RE =
  /\[[^\]\n]{1,24}(?:数据|结果|输出|日志|内容|路径|代码|data|result|output|log|path|here)[^\]\n]*\]/i;

// 拦截用户自言自语式独白（例如“我先去看看”），仅保留面向 AI 的明确指令
const SELF_NARRATION_RE =
  /^(?:我(?:先|去|先去|现在去|去打开|去看看|去看下|去试下|去试试|自己去)|让我(?:先)?(?:去|自己去)|(?:let\s+me|i\s+will|i'll)\s+go\s+(?:check|look|test|try|open)\b)/i;

// 严格互斥的简/繁高频特征字集合（不含简繁共用字）
const SIMP_ONLY_RE = /[这们个说请让给对发会时过还开关验证设档实际显处点线与为么仅没记认种现动页选闭体国语]/g;
const TRAD_ONLY_RE = /[這們個說請讓給對發會時過還開關驗證設檔實際顯處點線與為麼僅沒記認種現動頁選閉體國語]/g;

// 西/法/德拉丁语系特征字符与常用词，避免西/法/德对话被误判覆写为英文
const DE_DIACRITIC_RE = /[äöüßÄÖÜ]/g;
const DE_WORD_RE =
  /\b(?:der|die|das|und|oder|nicht|bitte|für|mit|von|den|dem|ein|eine|einen|ist|sind|wir|ich|kann|prüfe|prüfen|führe|ausführen|behebe|beheben|fehler|datei|änderungen|weiter)\b/gi;
const FR_DIACRITIC_RE = /[çœæàâèêëîïôùûüÇŒÆÀÂÈÊËÎÏÔÙÛÜ]/g;
const FR_WORD_RE =
  /\b(?:le|la|les|des|du|une|pour|avec|dans|sur|pas|est|sont|nous|vous|merci|vérifie|vérifier|exécute|exécuter|corrige|corriger|fichier|erreur|cette|ceci|continue|continuer)\b/gi;
const ES_DIACRITIC_RE = /[¿¡ñÑáéíóúÁÉÍÓÚ]/g;
const ES_WORD_RE =
  /\b(?:el|la|los|las|del|una|para|por|con|sin|pero|que|qué|cómo|esto|esta|este|favor|ejecuta|ejecutar|revisa|revisar|corrige|corregir|archivo|pruebas|prueba|código|errores|continúa|continuar)\b/gi;

// 过滤非对话专用模型（嵌入、语音、图像/视频生成、审核等），并优先排序低延迟轻量对话模型
const NON_CHAT_MODEL_RE = new RegExp(
  [
    '(?:^|[-_/:.])(?:embedding|embeddings|rerank|moderation|whisper|tts|transcribe|imagen|dall-e|veo|sora|lyria|aqa)(?:$|[-_/:.\\d])',
    '(?:^|[-_/:.])(?:native-audio|computer-use|deep-research|robotics|customtools|live-translate|nano-banana)(?:$|[-_/:.\\d])',
    '-image(?:-|$)',
    '-live(?:-|$)',
    '-realtime(?:-|$)',
    '^antigravity-preview(?:-|$)',
    '^gemini-decision(?:-|$)',
    '^genie-(?:\\d|$)',
    '^(?:babbage|davinci)-002$',
  ].join('|'),
  'i'
);
const FAST_CHAT_MODEL_RE = /(?:^|[-_/:.])(?:flash|mini|nano|haiku|deepseek-chat|turbo|lite)(?:$|[-_/:.\d])/i;

// 将语言码统一规范为 8 语（zh-CN/zh-TW/en/ja/ko/es/fr/de），移除 yue，未知语言兜底 en
function normalizeSuggesterLang(raw, defaultLang = 'en') {
  const s = String(raw || '').trim().toLowerCase().replace(/_/g, '-');
  if (!s || s === 'auto') return defaultLang;
  if (s === 'yue' || s.startsWith('yue-') || s === 'zh-yue' || s.includes('cantonese')) return 'zh-CN';
  if (/^zh-(tw|hk|mo|hant)/.test(s) || s === 'tw' || s === 'hant') return 'zh-TW';
  if (/^zh(?:\b|-)/.test(s)) return 'zh-CN';
  if (/^(ja|jp)(?:\b|-)/.test(s) || s === 'japanese') return 'ja';
  if (/^(ko|kr)(?:\b|-)/.test(s) || s === 'korean') return 'ko';
  if (/^es(?:\b|-)/.test(s) || s === 'spanish') return 'es';
  if (/^fr(?:\b|-)/.test(s) || s === 'french') return 'fr';
  if (/^de(?:\b|-)/.test(s) || s === 'german') return 'de';
  if (/^en(?:\b|-)/.test(s) || s === 'english') return 'en';
  return defaultLang;
}

export function curateChatModelList(rawModels = []) {
  if (!Array.isArray(rawModels) || rawModels.length === 0) return [];
  const unique = Array.from(
    new Set(rawModels.map((m) => String(m || '').trim()).filter(Boolean))
  );
  const chatCapable = unique.filter((id) => !NON_CHAT_MODEL_RE.test(id));
  const pool = chatCapable.length > 0 ? chatCapable : unique;
  return pool.sort((a, b) => {
    const aFast = FAST_CHAT_MODEL_RE.test(a) ? 0 : 1;
    const bFast = FAST_CHAT_MODEL_RE.test(b) ? 0 : 1;
    if (aFast !== bFast) return aFast - bFast;
    return a.localeCompare(b);
  });
}

function assertNoSymlinkSync(targetPath, label = 'path') {
  try {
    const st = fs.lstatSync(targetPath);
    if (st.isSymbolicLink()) {
      throw new Error(`Refusing symbolic link for ${label}`);
    }
    return st;
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
}

// 使用随机临时文件与 Windows 锁冲突退避重试实现原子写盘（对齐 translator-service.mjs）
function atomicWriteJsonSync(filePath, dataObj) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  assertNoSymlinkSync(dir, 'config directory');
  assertNoSymlinkSync(filePath, 'config file');
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  const raw = JSON.stringify(dataObj, null, 2) + '\n';
  try {
    fs.writeFileSync(tmpPath, raw, { encoding: 'utf8', mode: 0o600 });
    for (let attempt = 0; ; attempt++) {
      try {
        fs.renameSync(tmpPath, filePath);
        break;
      } catch (err) {
        if (
          process.platform !== 'win32' ||
          attempt >= 3 ||
          !['EBUSY', 'EPERM', 'EACCES', 'EEXIST'].includes(err?.code)
        ) {
          throw err;
        }
        try {
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 15 * (attempt + 1));
        } catch {}
      }
    }
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {}
    throw err;
  }
}

function sameUrlOrigin(u1, u2) {
  try {
    return new URL(String(u1 || '').trim()).origin === new URL(String(u2 || '').trim()).origin;
  } catch {
    return false;
  }
}

// 联合脱敏所有已知密钥与内置凭据正则，避免任意已保存渠道的 API Key 外泄
function redactWithKeys(text, keys = []) {
  const list = Array.isArray(keys)
    ? Array.from(new Set(keys.map((k) => String(k || '').trim()).filter(Boolean)))
    : typeof keys === 'string' && keys.trim()
    ? [keys.trim()]
    : [];
  let out = redactSecrets(text, list[0] || '');
  for (let i = 1; i < list.length; i++) {
    out = redactSecrets(out, list[i]);
  }
  return out;
}

export function sanitizeSuggesterConfig(raw = {}) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  // Beta 功能严格 Fail-Closed：缺失 enabled 字段时一律默认为 false，杜绝残缺配置静默耗配额
  const enabled = Boolean(src.enabled);
  const rawTtl = Number(src.ttlMinutes);
  const ttlMinutes = Number.isFinite(rawTtl)
    ? Math.max(1, Math.min(120, Math.round(rawTtl)))
    : 15;
  const rawProf =
    typeof src.activeProfileId === 'string'
      ? src.activeProfileId
      : typeof src.profileId === 'string'
      ? src.profileId
      : '';
  const activeProfileId = rawProf.trim().slice(0, 80);

  const modelsByProfile = {};
  if (src.modelsByProfile && typeof src.modelsByProfile === 'object' && !Array.isArray(src.modelsByProfile)) {
    for (const [k, v] of Object.entries(src.modelsByProfile)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      const pid = String(k || '').trim().slice(0, 80);
      const mid = typeof v === 'string' ? v.trim().slice(0, 140) : '';
      if (pid && mid) modelsByProfile[pid] = mid;
    }
  }

  return {
    version: 1,
    enabled,
    ttlMinutes,
    activeProfileId,
    modelsByProfile,
  };
}

export function detectConversationLang(turns = [], fallbackLang = 'en') {
  const normFallback = normalizeSuggesterLang(fallbackLang, 'en');
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i];
    if (!t || t.role !== 'user') continue;
    const s = String(t.text || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`[^`\n]+`/g, ' ')
      .replace(/https?:\/\/\S+/g, ' ')
      .trim();
    if (!s) continue;

    // 1) 日文假名检测
    const kana = (s.match(/[\u3040-\u30ff]/g) || []).length;
    if (kana >= 2) return 'ja';

    // 2) 韩文谚文检测
    const hangul = (s.match(/[\uac00-\ud7af\u1100-\u11ff\u3130-\u318f]/g) || []).length;
    if (hangul >= 2) return 'ko';

    // 3) 汉字简繁检测（不返回 yue）
    const cjk = (s.match(/[\u4e00-\u9fff]/g) || []).length;
    if (cjk >= 2) {
      const simpHits = (s.match(SIMP_ONLY_RE) || []).length;
      const tradHits = (s.match(TRAD_ONLY_RE) || []).length;
      if (tradHits >= 2 && tradHits > simpHits * 2) return 'zh-TW';
      if (simpHits >= 1) return 'zh-CN';
      if (normFallback === 'zh-TW') return 'zh-TW';
      return 'zh-CN';
    }

    // 4) 拉丁语系检测：识别西/法/德特征，并避免把 es/fr/de 兜底强行覆写为 en
    const latinWords = (s.match(/[A-Za-z\u00c0-\u00d6\u00d8-\u00f6\u00f8-\u00ff]{2,}/g) || []).length;
    if (latinWords >= 2) {
      const deScore = (s.match(DE_DIACRITIC_RE) || []).length * 2 + (s.match(DE_WORD_RE) || []).length;
      const frScore = (s.match(FR_DIACRITIC_RE) || []).length * 2 + (s.match(FR_WORD_RE) || []).length;
      const esScore = (s.match(ES_DIACRITIC_RE) || []).length * 2 + (s.match(ES_WORD_RE) || []).length;
      const scores = [
        ['de', deScore],
        ['fr', frScore],
        ['es', esScore],
      ].sort((a, b) => b[1] - a[1]);
      if (scores[0][1] >= 2) {
        if (scores[0][1] > scores[1][1]) return scores[0][0];
        if (normFallback === scores[0][0] || normFallback === scores[1][0]) return normFallback;
        return scores[0][0];
      }
      if (normFallback === 'es' || normFallback === 'fr' || normFallback === 'de') {
        return normFallback;
      }
      return 'en';
    }
  }
  return normFallback;
}

export function sanitizeConversationTurns(rawTurns = [], explicitKeys = '') {
  if (!Array.isArray(rawTurns)) return [];
  const cleaned = [];
  for (const item of rawTurns) {
    if (!item || typeof item !== 'object') continue;
    const role = item.role === 'assistant' ? 'assistant' : item.role === 'user' ? 'user' : '';
    if (!role) continue;
    let text = String(item.text || '')
      .replace(/\r\n/g, '\n')
      .replace(/<\/?(?:conversation_turn|conversation_context|thought_source|system_instruction)\b[^>]*>/gi, '')
      .replace(/^(?:Agent working|Running\s*[^\n]*)\s*$/gim, '')
      .replace(/```[\w-]*\n([\s\S]*?)```/g, (full, code) => {
        const trimmedCode = String(code || '').trim();
        if (trimmedCode.length <= 450) return full;
        return `\`\`\`\n${trimmedCode.slice(0, 300)}\n... [truncated]\n\`\`\``;
      });
    text = redactWithKeys(text, explicitKeys)
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (!text) continue;
    if (role === 'assistant' && /^(?:Agent working|Thinking|Running\b)/i.test(text) && text.length < 140) {
      continue;
    }
    if (text.length > MAX_TURN_CHARS) {
      text =
        role === 'assistant'
          ? `${text.slice(0, 700)}\n...\n${text.slice(-1400)}`
          : text.slice(-MAX_TURN_CHARS);
    }
    const prev = cleaned[cleaned.length - 1];
    if (prev && prev.role === role) {
      prev.text = `${prev.text}\n\n${text}`.slice(-MAX_TURN_CHARS);
    } else {
      cleaned.push({ role, text });
    }
  }

  const recent = cleaned.slice(-MAX_TURNS);
  let total = 0;
  const bounded = [];
  for (let i = recent.length - 1; i >= 0; i--) {
    const t = recent[i];
    if (total + t.text.length > MAX_TOTAL_CONTEXT_CHARS && bounded.length >= 2) {
      const remain = MAX_TOTAL_CONTEXT_CHARS - total;
      if (remain > 200) {
        bounded.unshift({ role: t.role, text: t.text.slice(-remain) });
      }
      break;
    }
    total += t.text.length;
    bounded.unshift(t);
  }
  return bounded;
}

export function parseSingleSuggestion(rawText = '') {
  const text = String(rawText || '')
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '')
    .replace(/```[\w-]*|```/g, '')
    .trim();
  if (!text) return '';

  const cleanOne = (s) =>
    String(s || '')
      .replace(/^\s*(?:[-*•]|\d+[.)、])\s*/, '')
      .replace(/^["'「『“”]+|["'」』“”]+$/g, '')
      .replace(SYCOPHANTIC_PREFIX_RE, '')
      .replace(/\s+/g, ' ')
      .replace(/[。.]+$/, '')
      .trim();

  const isAcceptable = (s) => {
    if (!s || s.length < 2 || s.length > 120) return false;
    if (/^(?:suggestion|output|none|null|nothing|n\/a|empty|silence|无|暂无)\s*:?\.?$/i.test(s)) return false;
    if (s.startsWith('{') || s.startsWith('[')) return false;
    if (BRACKET_PLACEHOLDER_RE.test(s)) return false;
    if (SELF_NARRATION_RE.test(s)) return false;
    return true;
  };

  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      const cand =
        typeof parsed?.suggestion === 'string'
          ? parsed.suggestion
          : Array.isArray(parsed?.suggestions)
          ? parsed.suggestions[0]
          : Array.isArray(parsed)
          ? parsed[0]
          : '';
      const cleaned = cleanOne(cand);
      if (isAcceptable(cleaned)) return cleaned;
    } catch {}
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const cleaned = cleanOne(rawLine);
    if (isAcceptable(cleaned)) return cleaned;
  }
  return '';
}

function buildSamplingInstruction(lang = 'en') {
  const langLabelMap = {
    'zh-CN': 'Simplified Chinese (简体中文 — strictly Simplified characters, NEVER Traditional Chinese)',
    'zh-TW': 'Traditional Chinese (繁體中文)',
    en: 'English',
    ja: 'Japanese (日本語)',
    ko: 'Korean (한국어)',
    es: 'Spanish (Español)',
    fr: 'French (Français)',
    de: 'German (Deutsch)',
  };
  const normLang = normalizeSuggesterLang(lang, 'en');
  const langLabel = langLabelMap[normLang] || langLabelMap.en;

  return [
    '[SUGGESTION MODE: Predict what the user might naturally type next into the coding agent.]',
    'FIRST: Look at the user\'s recent messages and original goal. Your job is to help the user save time and phrase their next prompt cleanly ALONG THEIR EXISTING DIRECTION — NEVER invent new tasks or change their direction.',
    'THE TEST: Would the user see it and think "I was just about to type that"?',
    '',
    'WHEN TO SUGGEST (be specific, crisp, and natural):',
    '- Assistant asked a confirmation/choice question at the end -> phrase the natural decision aligned with the user\'s prior intent (e.g., "按这个方案改", "好，把这部分补齐").',
    '- User asked for a multi-step goal and an earlier step just finished -> prompt the remaining step they already asked for (e.g., user asked "fix bug and run tests", bug is fixed -> "跑一下测试验证"; diagnosis finished -> "按这个原因修复").',
    '- Code was just written/modified but not yet verified or committed -> suggest the immediate verification or commit only if clearly expected in this workflow.',
    '',
    'WHEN TO STAY SILENT (reply with NOTHING):',
    '- The task is already implemented, tested, and deployed/verified with NO open question or unfinished step -> reply NOTHING.',
    '- After an ambiguous error or open-ended design trade-off where the user needs to think or inspect -> reply NOTHING.',
    '',
    'NEVER SUGGEST:',
    '- New feature ideas, extra audits, or tangential checks the user never asked about (e.g., do NOT invent "检查不同分辨率适配" or "优化性能").',
    '- Self-action monologues ("我去设置里看下", "我先试试", "Let me check").',
    '- Evaluative/flattery filler ("太棒了", "好的谢谢", "looks good", "thanks").',
    '- Assistant-voice ("我来...", "Let me...", "I\'ll...") or multiple sentences.',
    '',
    `Format: ONE short, direct phrase in ${langLabel} (4-22 CJK characters or 2-12 Latin words), matching the user's concise tone, with no quotes and no trailing period. Or reply with NOTHING.`,
  ].join('\n');
}

function buildLowEffortParams(model, baseUrl = '') {
  const base = buildNoThinkingParams(model, baseUrl);
  if (base) return base;
  const m = String(model || '').trim().toLowerCase();
  if (/^gemini-(?:2\.5|3)/i.test(m)) {
    return { reasoning_effort: 'low' };
  }
  return null;
}

export class PromptSuggesterService {
  constructor(options = {}) {
    const configDir = options.configDir || path.join(os.homedir(), '.gemini', 'config');
    this.configFile = options.configFile || path.join(configDir, 'obsidian-prism-suggester.json');
    this._translatorService = options.translatorService || null;
    this._getTranslatorService =
      typeof options.getTranslatorService === 'function' ? options.getTranslatorService : null;
    this._configCache = null;
    this._memCache = new Map();
    this._inflight = new Map();
  }

  loadConfig() {
    if (this._configCache) {
      return {
        ...this._configCache,
        modelsByProfile: { ...(this._configCache.modelsByProfile || {}) },
      };
    }
    try {
      const st = assertNoSymlinkSync(this.configFile, 'suggester config');
      if (st && st.isFile()) {
        const raw = JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
        this._configCache = sanitizeSuggesterConfig(raw);
        return {
          ...this._configCache,
          modelsByProfile: { ...this._configCache.modelsByProfile },
        };
      }
    } catch {}
    this._configCache = sanitizeSuggesterConfig(DEFAULT_SUGGESTER_CONFIG);
    return {
      ...this._configCache,
      modelsByProfile: { ...this._configCache.modelsByProfile },
    };
  }

  getConfigSync() {
    return this.loadConfig();
  }

  saveConfig(patch = {}) {
    const cur = this.loadConfig();
    const nextModelsByProfile =
      patch && patch.modelsByProfile && typeof patch.modelsByProfile === 'object'
        ? patch.modelsByProfile
        : cur.modelsByProfile;
    const merged = sanitizeSuggesterConfig({
      ...cur,
      ...(patch && typeof patch === 'object' ? patch : {}),
      modelsByProfile: nextModelsByProfile,
    });
    atomicWriteJsonSync(this.configFile, merged);
    this._configCache = merged;
    return {
      ...merged,
      modelsByProfile: { ...merged.modelsByProfile },
    };
  }

  async _resolveTranslator() {
    if (this._translatorService) return this._translatorService;
    if (this._getTranslatorService) {
      try {
        return await this._getTranslatorService();
      } catch {
        return null;
      }
    }
    return null;
  }

  _resolveSuggesterModelForProfile(profileObj, cfg) {
    if (!profileObj) return '';
    const ownModel = cfg?.modelsByProfile?.[profileObj.id];
    if (typeof ownModel === 'string' && ownModel.trim()) {
      return ownModel.trim();
    }
    return String(profileObj.model || '').trim();
  }

  async _inspectAiBackend() {
    const cfg = this.loadConfig();
    const tr = await this._resolveTranslator();
    if (!tr || typeof tr._resolveEffectiveCredentials !== 'function') {
      return {
        ready: false,
        tr: null,
        selectedProfileId: '',
        profileName: '',
        model: '',
        profiles: [],
        baseUrl: '',
        apiKey: '',
        allApiKeys: [],
      };
    }
    try {
      const sanitized =
        typeof tr.getSanitizedConfig === 'function' ? tr.getSanitizedConfig() : null;
      const store = typeof tr.loadStore === 'function' ? tr.loadStore() : {};
      const rawProfiles = Array.isArray(store?.profiles) ? store.profiles.filter(Boolean) : [];
      const baseSanitizedProfiles = Array.isArray(sanitized?.profiles)
        ? sanitized.profiles
        : rawProfiles.map((p) => ({
            id: String(p.id || ''),
            name: String(p.name || p.id || ''),
            baseUrl: String(p.baseUrl || ''),
            model: String(p.model || ''),
            hasApiKey: Boolean(p.apiKey),
            keylessAllowed: isKeylessAllowedEndpoint(p.baseUrl),
            maskedKey: '',
          }));

      // 覆盖叠加提示词建议自身按渠道独立的模型选择（凭据共享，模型 ID 相互独立）
      const suggesterProfiles = baseSanitizedProfiles.map((p) => ({
        ...p,
        model: this._resolveSuggesterModelForProfile(p, cfg),
      }));

      const checkCreds = (profileObj = null) => {
        if (!profileObj) {
          return { ok: false, creds: { baseUrl: '', apiKey: '' }, model: '', profile: null };
        }
        const effectiveModel = this._resolveSuggesterModelForProfile(profileObj, cfg);
        const c = tr._resolveEffectiveCredentials({
          profileId: profileObj.id,
          model: effectiveModel,
        });
        const ok = Boolean(
          !c.baseUrlError &&
            c.baseUrl &&
            effectiveModel &&
            (c.apiKey || isKeylessAllowedEndpoint(c.baseUrl))
        );
        return { ok, creds: c, model: effectiveModel, profile: profileObj };
      };

      let targetProfile = cfg.activeProfileId
        ? rawProfiles.find((p) => p.id === cfg.activeProfileId) || null
        : null;

      if (!targetProfile && rawProfiles.length > 0) {
        const thoughtActive = rawProfiles.find((p) => p.id === store?.activeProfileId) || null;
        if (thoughtActive && checkCreds(thoughtActive).ok) {
          targetProfile = thoughtActive;
        } else {
          targetProfile =
            rawProfiles.find((p) => checkCreds(p).ok) || thoughtActive || rawProfiles[0];
        }
      }

      const chosen = checkCreds(targetProfile);
      const selectedProfileId = String(
        targetProfile?.id || cfg.activeProfileId || store?.activeProfileId || ''
      ).trim();

      // 汇总全部已保存渠道的非空 API Key，用于统一脱敏对话与错误文本
      const allApiKeys = Array.from(
        new Set(
          rawProfiles
            .map((p) => (typeof p?.apiKey === 'string' ? p.apiKey.trim() : ''))
            .concat(chosen.creds?.apiKey ? [String(chosen.creds.apiKey).trim()] : [])
            .filter(Boolean)
        )
      );

      return {
        ready: chosen.ok,
        tr,
        selectedProfileId,
        profileName: String(chosen.profile?.name || '').trim(),
        model: chosen.model,
        profiles: suggesterProfiles,
        baseUrl: String(chosen.creds?.baseUrl || '').trim(),
        apiKey: String(chosen.creds?.apiKey || '').trim(),
        allApiKeys,
      };
    } catch {
      return {
        ready: false,
        tr: null,
        selectedProfileId: '',
        profileName: '',
        model: '',
        profiles: [],
        baseUrl: '',
        apiKey: '',
        allApiKeys: [],
      };
    }
  }

  async getPublicState() {
    const cfg = this.loadConfig();
    const ai = await this._inspectAiBackend();
    return {
      ok: true,
      config: {
        ...cfg,
        activeProfileId: ai.selectedProfileId || cfg.activeProfileId || '',
      },
      profiles: ai.profiles,
      backend: {
        aiReady: ai.ready,
        engine: ai.ready ? 'ai' : 'unconfigured',
        profileId: ai.selectedProfileId,
        profileName: ai.profileName,
        model: ai.model,
      },
      cacheCount: this._memCache.size,
    };
  }

  async saveWorkbenchConfig(payload = {}) {
    const curCfg = this.loadConfig();
    const nextModelsByProfile = { ...(curCfg.modelsByProfile || {}) };
    const tr = await this._resolveTranslator();

    if (Array.isArray(payload?.profiles) && tr && typeof tr.saveConfig === 'function') {
      const prevStore = typeof tr.loadStore === 'function' ? tr.loadStore() : {};
      const prevMap = new Map(
        (Array.isArray(prevStore?.profiles) ? prevStore.profiles : []).map((p) => [p.id, p])
      );

      const validIds = new Set();
      const providerSyncedProfiles = payload.profiles.map((p) => {
        const pid = String(p?.id || '').trim();
        if (pid) validIds.add(pid);
        const suggesterModel = typeof p?.model === 'string' ? p.model.trim() : '';
        if (pid && suggesterModel) {
          nextModelsByProfile[pid] = suggesterModel;
        }

        const existingThoughtProf = prevMap.get(pid);
        const rawKey = typeof p?.apiKey === 'string' ? p.apiKey.trim() : '';
        let inheritedKey = '';
        if (!rawKey && p?.copyKeyFromId && !existingThoughtProf) {
          const srcProf = prevMap.get(p.copyKeyFromId);
          if (srcProf && srcProf.apiKey && sameUrlOrigin(p?.baseUrl, srcProf.baseUrl)) {
            inheritedKey = srcProf.apiKey;
          }
        }

        // 仅同步渠道基础凭据字段（id、name、baseUrl、apiKey）至共享配置，保留思考转译已选 model
        const preservedThoughtModel = existingThoughtProf
          ? existingThoughtProf.model
          : suggesterModel || 'gpt-4o-mini';

        return {
          id: pid,
          name: p?.name,
          baseUrl: p?.baseUrl,
          model: preservedThoughtModel,
          apiKey: rawKey || inheritedKey,
          keepExistingKey: Boolean(p?.keepExistingKey !== false && !inheritedKey),
        };
      });

      // 清理已被删除的渠道对应的独立模型记录
      for (const oldId of Object.keys(nextModelsByProfile)) {
        if (!validIds.has(oldId)) delete nextModelsByProfile[oldId];
      }

      const keptThoughtProfileId = providerSyncedProfiles.some((p) => p.id === prevStore?.activeProfileId)
        ? prevStore.activeProfileId
        : providerSyncedProfiles[0]?.id || 'default';

      const saveRes = tr.saveConfig({
        activeProfileId: keptThoughtProfileId,
        profiles: providerSyncedProfiles,
      });
      if (saveRes && saveRes.ok === false) {
        return { ok: false, error: saveRes.error || 'Failed to save profiles' };
      }
    }

    const patch = { modelsByProfile: nextModelsByProfile };
    if (payload?.enabled !== undefined) patch.enabled = Boolean(payload.enabled);
    if (payload?.ttlMinutes !== undefined) patch.ttlMinutes = payload.ttlMinutes;
    if (typeof payload?.activeProfileId === 'string') {
      patch.activeProfileId = payload.activeProfileId;
    }
    this.saveConfig(patch);
    return this.getPublicState();
  }

  async fetchModels(payload = {}) {
    const ai = await this._inspectAiBackend();
    if (!ai.tr || typeof ai.tr.fetchModels !== 'function') {
      return { ok: false, error: 'Translator service unavailable' };
    }
    const lookupProfileId = String(
      payload?.copyKeyFromId || payload?.profileId || ai.selectedProfileId || ''
    ).trim();
    const res = await ai.tr.fetchModels({
      profileId: lookupProfileId,
      baseUrl: payload?.baseUrl,
      apiKey: payload?.apiKey,
    });
    if (!res || !res.ok || !Array.isArray(res.models)) return res;
    const curated = curateChatModelList(res.models);
    return {
      ...res,
      models: curated,
      count: curated.length,
      rawCount: res.models.length,
    };
  }

  async testConnection(payload = {}) {
    if (Array.isArray(payload?.profiles)) {
      const saved = await this.saveWorkbenchConfig(payload);
      if (saved && saved.ok === false) return saved;
    }
    const ai = await this._inspectAiBackend();
    if (!ai.tr || typeof ai.tr.testConnection !== 'function') {
      return { ok: false, error: 'Translator service unavailable' };
    }
    const lookupProfileId = String(
      payload?.activeProfileId || payload?.profileId || ai.selectedProfileId || ''
    ).trim();
    return ai.tr.testConnection({
      profileId: lookupProfileId,
      baseUrl: payload?.baseUrl,
      model: payload?.model || ai.model,
      apiKey: payload?.apiKey,
    });
  }

  cancelRequest(requestId = '') {
    const id = String(requestId || '').trim();
    if (!id) {
      let count = 0;
      for (const ctl of this._inflight.values()) {
        try {
          ctl.abort();
          count += 1;
        } catch {}
      }
      this._inflight.clear();
      return { ok: true, cancelled: count > 0, count };
    }
    const ctl = this._inflight.get(id);
    if (ctl) {
      this._inflight.delete(id);
      try {
        ctl.abort();
      } catch {}
      return { ok: true, cancelled: true };
    }
    return { ok: true, cancelled: false };
  }

  clearCache() {
    const cleared = this._memCache.size;
    this._memCache.clear();
    return { ok: true, cleared, count: 0 };
  }

  _getCache(key) {
    if (!this._memCache.has(key)) return null;
    const val = this._memCache.get(key);
    this._memCache.delete(key);
    this._memCache.set(key, val);
    return val;
  }

  _setCache(key, val) {
    if (this._memCache.has(key)) this._memCache.delete(key);
    this._memCache.set(key, val);
    while (this._memCache.size > MAX_CACHE_ENTRIES) {
      const oldest = this._memCache.keys().next().value;
      this._memCache.delete(oldest);
    }
  }

  async suggest(input = {}) {
    const cfg = this.loadConfig();
    if (!cfg.enabled) {
      return { ok: false, reason: 'disabled', error: 'Prompt suggester is disabled' };
    }
    const ai = await this._inspectAiBackend();
    if (!ai.ready || !ai.tr || typeof ai.tr._request !== 'function') {
      return { ok: false, reason: 'ai-not-configured' };
    }

    const secretKeys = ai.allApiKeys && ai.allApiKeys.length > 0 ? ai.allApiKeys : ai.apiKey;
    const turns = sanitizeConversationTurns(input?.turns, secretKeys);
    if (turns.length === 0) {
      return { ok: false, reason: 'empty-conversation', error: 'No conversation history yet' };
    }

    const detectedLang = detectConversationLang(turns, input?.lang || 'en');
    const forceRefresh = Boolean(input?.forceRefresh);
    const cacheSeed = JSON.stringify({
      v: 8,
      turns,
      lang: detectedLang,
      engine: `${ai.baseUrl}|${ai.model}`,
    });
    const cacheKey = crypto.createHash('sha256').update(cacheSeed).digest('hex').slice(0, 24);

    if (!forceRefresh) {
      const hit = this._getCache(cacheKey);
      if (hit && hit.suggestion) {
        return {
          ok: true,
          suggestion: hit.suggestion,
          engine: 'ai',
          model: hit.model || ai.model,
          lang: detectedLang,
          cached: true,
        };
      }
    }

    const reqId = String(input?.requestId || `sug_${Date.now()}`).trim();
    const prevCtl = this._inflight.get(reqId);
    if (prevCtl) {
      try {
        prevCtl.abort();
      } catch {}
    }
    const abortCtl = new AbortController();
    this._inflight.set(reqId, abortCtl);
    const timeoutTimer = setTimeout(() => {
      try {
        abortCtl.abort(new Error('Suggest request timed out'));
      } catch {}
    }, 15000);
    if (timeoutTimer.unref) timeoutTimer.unref();

    try {
      const chatMessages = turns.map((t) => ({
        role: t.role === 'user' ? 'user' : 'assistant',
        content: t.text,
      }));
      const samplingInstruction = buildSamplingInstruction(detectedLang);
      if (chatMessages[chatMessages.length - 1]?.role === 'user') {
        chatMessages.push({ role: 'assistant', content: '(Acknowledged.)' });
      }
      chatMessages.push({
        role: 'user',
        content: `[SAMPLING_INSTRUCTION — DO NOT ANSWER AS ASSISTANT]\n${samplingInstruction}`,
      });

      const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };
      if (ai.apiKey) {
        headers.Authorization = `Bearer ${ai.apiKey}`;
      }

      const targetModel = ai.model;
      const lowEffort = buildLowEffortParams(targetModel, ai.baseUrl);
      const sendOnce = (includeLowEffort) => {
        const payload = {
          model: targetModel,
          stream: false,
          temperature: forceRefresh ? 0.4 : 0.2,
          max_tokens: 400,
          messages: chatMessages,
        };
        if (includeLowEffort && lowEffort) {
          Object.assign(payload, lowEffort);
        }
        return ai.tr._request(`${ai.baseUrl}/chat/completions`, {
          method: 'POST',
          headers,
          redirect: 'error',
          body: JSON.stringify(payload),
          signal: abortCtl.signal,
        });
      };

      let res = await sendOnce(Boolean(lowEffort));
      if (!res.ok && lowEffort && (res.status === 400 || res.status === 422)) {
        try {
          await res.body?.cancel?.();
        } catch {}
        res = await sendOnce(false);
      }

      if (!res.ok) {
        const errSnippet =
          typeof ai.tr._readResponseTextBounded === 'function'
            ? await ai.tr._readResponseTextBounded(res, 16384).catch(() => '')
            : '';
        return {
          ok: false,
          reason: 'upstream-error',
          error: `HTTP ${res.status}: ${redactWithKeys(errSnippet.slice(0, 160), secretKeys)}`,
        };
      }

      const rawBody =
        typeof ai.tr._readResponseTextBounded === 'function'
          ? await ai.tr._readResponseTextBounded(res, 256 * 1024)
          : await res.text();
      const data = JSON.parse(rawBody);
      const rawContent = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || '';
      if (/^\s*(?:NOTHING|NONE|NULL)\s*\.?\s*$/i.test(String(rawContent || ''))) {
        return { ok: false, reason: 'no-clear-step' };
      }
      const suggestion = parseSingleSuggestion(rawContent);
      if (!suggestion) {
        return { ok: false, reason: 'empty-suggestion', error: 'Model returned empty suggestion' };
      }

      this._setCache(cacheKey, {
        suggestion,
        engine: 'ai',
        model: targetModel,
      });

      return {
        ok: true,
        suggestion,
        engine: 'ai',
        model: targetModel,
        profileName: ai.profileName,
        lang: detectedLang,
        cached: false,
      };
    } catch (err) {
      if (abortCtl.signal.aborted && !String(err?.message || '').includes('timed out')) {
        return { ok: false, cancelled: true, reason: 'cancelled' };
      }
      return {
        ok: false,
        reason: 'upstream-error',
        error: redactWithKeys(err?.message || 'Suggestion request failed', secretKeys).slice(0, 180),
      };
    } finally {
      clearTimeout(timeoutTimer);
      if (this._inflight.get(reqId) === abortCtl) {
        this._inflight.delete(reqId);
      }
    }
  }

  async handleAction(action, payload = {}) {
    if (!ALLOWED_SUGGESTER_ACTIONS.has(action)) {
      return { ok: false, error: `Unsupported suggester action: ${action}` };
    }
    switch (action) {
      case 'get-config':
        return this.getPublicState();
      case 'save-config':
        return this.saveWorkbenchConfig(payload);
      case 'fetch-models':
        return this.fetchModels(payload);
      case 'test-connection':
        return this.testConnection(payload);
      case 'suggest':
        return this.suggest(payload);
      case 'cancel':
        return this.cancelRequest(payload?.requestId);
      case 'clear-cache':
        return this.clearCache();
      default:
        return { ok: false, error: 'Unhandled action' };
    }
  }

  dispose() {
    this.cancelRequest();
    this._memCache.clear();
  }
}

export function createPromptSuggesterService(options = {}) {
  return new PromptSuggesterService(options);
}

export default createPromptSuggesterService;

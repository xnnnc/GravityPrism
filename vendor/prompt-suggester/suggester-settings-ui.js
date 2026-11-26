// Obsidian Prism — Channel 11 Context-Aware Next-Prompt Suggester Settings Card UI (v1.0.8 · Beta, 8-Locale, 0 innerHTML)
// 复用与思考转译一致的 OpenAI 兼容渠道工作台（.ag-cs-thought-cfg-box）：
// - 与思考转译双向共享渠道凭据池，通过 reloadProfiles()/syncFromPeer() 防止跨卡片陈旧凭据覆写
// - 独立保存提示词建议选中的渠道与各渠道模型 ID

(function (root) {
  'use strict';
  const G = root || (typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : null);
  if (!G) return;

  const NO_TR_ATTRS = [
    ['translate', 'no'],
    ['data-no-translate', 'true'],
    ['data-ag-localization-skip', 'true'],
    ['data-agy-no-translate', 'true'],
    ['data-antigravity-zh-skip', '1'],
    ['data-ag-no-i18n', ''],
  ];

  const I18N_KEYS = [
    'title',
    'desc',
    'on',
    'off',
    'profilesLabel',
    'defaultProfName',
    'customProfPrefix',
    'addProfile',
    'delProfile',
    'fieldName',
    'fieldNamePh',
    'fieldBaseUrl',
    'fieldApiKey',
    'fieldModel',
    'fetchModels',
    'saveBtn',
    'testBtn',
    'clearCacheBtn',
    'clearKeyBtn',
    'keyClearedBadge',
    'keylessPh',
    'keylessBadge',
    'savedKeyPh',
    'quickSelect',
    'cacheBadge',
    'fetchingModels',
    'fetchOk',
    'fetchErr',
    'savingCfg',
    'saveOk',
    'saveErr',
    'testingConn',
    'testOk',
    'testErr',
    'clearOk',
    'shareHint',
    'ttlLabel',
    'ttlFmt',
  ];

  // 8 语词典（zh-CN / zh-TW / en / ja / ko / es / fr / de，移除 yue，en/es/fr/de 严格 0 CJK）
  const I18N_ROWS = {
    'zh-CN':
      '建议下一条提示词 (Beta)|实验性功能，默认关闭。开启后每轮回复完成时（含后台完成的会话），结合上下文在空输入框中预测下一条消息，按 Tab 使用它。|开启|关闭|OpenAI 兼容渠道预设|OpenAI 兼容主力渠道|自定义渠道|+ 新增渠道|删除当前|渠道名称|例如：Gemini AI Studio / 主力网关|接口地址 (Base URL)|接口密钥 (API Key)|模型 ID (Model)|拉取模型列表|保存渠道配置|发送测试消息|清空缓存|清除密钥|待保存清除|本地渠道可留空免密|本地免密|已保存 {0}（留空保持不变）|▾ 从已拉取的 {0} 个上游模型中快速选择…|缓存 {0} 条|正在拉取上游模型列表…|✓ 成功拉取 {0} 个模型 · {1}ms|拉取模型失败|正在保存配置…|✓ 已保存（{0} · {1}）|保存失败|正在保存并发送测试消息…|✓ 连通正常 · {0}ms · {1} 回复: 「{2}」|测试连接失败|✓ 已清空提示词建议缓存|仅同步渠道提供商（名称、地址、API 密钥）；同一渠道下选择的「模型 ID」与「思考转译」完全独立保存，互不覆盖。|有效时长限制|{0} 分钟',
    'zh-TW':
      '建議下一條提示詞 (Beta)|實驗性功能，預設關閉。開啟後每輪回覆完成時（含背景完成的對話），結合上下文在空輸入框中預測下一條訊息，按 Tab 使用它。|開啟|關閉|OpenAI 相容管道預設|OpenAI 相容主力管道|自訂管道|+ 新增管道|刪除目前|管道名稱|例如：Gemini AI Studio / 主力閘道|介面位址 (Base URL)|介面金鑰 (API Key)|模型 ID (Model)|擷取模型清單|儲存管道設定|傳送測試訊息|清除快取|清除金鑰|待儲存清除|本機管道可留空免密|本機免密|已儲存 {0}（留空維持不變）|▾ 從已擷取的 {0} 個上游模型中快速選擇…|快取 {0} 筆|正在擷取上游模型清單…|✓ 成功擷取 {0} 個模型 · {1}ms|擷取模型失敗|正在儲存設定…|✓ 已儲存（{0} · {1}）|儲存失敗|正在儲存並傳送測試訊息…|✓ 連線正常 · {0}ms · {1} 回覆: 「{2}」|測試連線失敗|✓ 已清除提示詞建議快取|僅同步管道提供者（名稱、位址、API 金鑰）；同一管道下選擇的「模型 ID」與「思考轉譯」完全獨立儲存，互不覆蓋。|有效時長限制|{0} 分鐘',
    en:
      'Suggest next prompt (Beta)|Experimental, off by default. Predicts your next message in an empty composer after each completed reply (including background tasks). Press Tab to use it.|On|Off|OpenAI Endpoint Profiles|Primary OpenAI Profile|Profile|+ New|Delete|Profile Name|e.g. Gemini AI Studio / Primary Gateway|Base URL|API Key|Model ID|Fetch Models|Save Config|Send Test Message|Clear Cache|Clear|Pending clear|Optional for local endpoint|Keyless OK|Saved {0} (leave blank to keep)|▾ Quick-select from {0} models…|Cache: {0}|Fetching upstream /models…|✓ Loaded {0} models · {1}ms|Failed to fetch models|Saving configuration…|✓ Saved ({0} · {1})|Save failed|Testing endpoint latency…|✓ Connected · {0}ms · {1} Reply: "{2}"|Connection test failed|✓ Cleared prompt suggestion cache|Syncs provider credentials (Name, Base URL, API Key) only; the selected Model ID per profile is saved independently from Thought Translator.|Suggestion Expiry|{0} min',
    ja:
      '次のプロンプトを提案 (Beta)|実験的機能（初期状態はオフ）。有効化すると応答完了後（バックグラウンド完了タスクを含む）に空の入力欄へ次のメッセージを予測します。Tab で使用します。|オン|オフ|OpenAI 互換接続先プリセット|OpenAI 互換メインプロファイル|カスタム接続先|+ 追加|削除|接続先名|例: Gemini AI Studio / メインGW|Base URL|API Key|Model ID|モデル一覧取得|設定を保存|接続テスト送信|キャッシュ消去|キー消去|保存時に消去|ローカル接続先は空欄可|キー不要|保存済み {0}（空欄で維持）|▾ 取得した {0} 個のモデルから選択…|キャッシュ {0} 件|上流のモデル一覧を取得中…|✓ {0} 個のモデルを取得 · {1}ms|モデル一覧の取得に失敗しました|設定を保存中…|✓ 保存完了（{0} · {1}）|保存失敗|保存して接続テストを送信中…|✓ 接続正常 · {0}ms · {1} 応答: 「{2}」|接続テストに失敗しました|✓ 提案キャッシュを消去しました|接続先情報（名前・URL・APIキー）のみ共有され、選択したモデルIDは「思考翻訳」とは完全に独立して保存されます。|有効期限|{0} 分',
    ko:
      '다음 프롬프트 제안 (Beta)|실험적 기능(기본 꺼짐). 활성화하면 각 응답 완료 후(백그라운드 완료 작업 포함) 문맥을 바탕으로 빈 입력창에 다음 메시지를 예측하며 Tab 키로 입력할 수 있습니다.|켜짐|꺼짐|OpenAI 호환 프로필 프리셋|OpenAI 호환 기본 프로필|사용자 지정 프로필|+ 추가|삭제|프로필 이름|예: Gemini AI Studio / 메인 게이트웨이|Base URL|API Key|Model ID|모델 목록 가져오기|설정 저장|테스트 전송|캐시 비우기|키 지우기|저장 시 삭제|로컬 엔드포인트는 비워 둘 수 있음|키 불필요|{0} 저장됨 (비우면 유지)|▾ 가져온 {0}개 모델 중 빠른 선택…|캐시 {0}개|모델 목록을 불러오는 중…|✓ {0}개 모델 로드 · {1}ms|모델 목록 가져오기 실패|설정을 저장하는 중…|✓ 저장됨 ({0} · {1})|저장 실패|저장 후 연결 테스트 중…|✓ 연결 정상 · {0}ms · {1} 응답: "{2}"|연결 테스트 실패|✓ 프롬프트 제안 캐시를 비웠습니다|공급자 자격 증명(이름, Base URL, API 키)만 동기화되며, 프로필별 선택 모델 ID는 사고 번역과 완전히 독립적으로 저장됩니다.|제안 유효 시간|{0}분',
    es:
      'Sugerir siguiente prompt (Beta)|Función experimental, desactivada por defecto. Al activarla, predice tu siguiente mensaje en el editor vacío tras cada respuesta (incluidas tareas en segundo plano). Pulsa Tab para usarlo.|Activado|Desactivado|Perfiles OpenAI compatibles|Perfil OpenAI principal|Perfil personalizado|+ Nuevo|Eliminar|Nombre del perfil|ej. Gemini AI Studio / Pasarela principal|Base URL|API Key|Model ID|Obtener modelos|Guardar config.|Enviar prueba|Limpiar caché|Borrar clave|Pendiente borrar|Opcional para servidor local|Sin clave|Guardado {0} (vacío para mantener)|▾ Selección rápida de {0} modelos…|Caché: {0}|Obteniendo /models…|✓ {0} modelos cargados · {1}ms|Error al obtener modelos|Guardando configuración…|✓ Guardado ({0} · {1})|Error al guardar|Probando latencia del endpoint…|✓ Conectado · {0}ms · {1} Respuesta: "{2}"|Error de conexión|✓ Caché de sugerencias limpiada|Solo sincroniza credenciales del proveedor (Nombre, Base URL, API Key); el Model ID elegido por perfil se guarda de forma independiente al Traductor de pensamiento.|Vigencia de sugerencia|{0} min',
    fr:
      'Suggérer le prompt suivant (Beta)|Fonction expérimentale, désactivée par défaut. Prédit votre prochain message dans la zone de saisie vide après chaque réponse (tâches en arrière-plan incluses). Appuyez sur Tab pour l’utiliser.|Activé|Désactivé|Profils OpenAI compatibles|Profil OpenAI principal|Profil personnalisé|+ Nouveau|Supprimer|Nom du profil|ex. Gemini AI Studio / Passerelle principale|Base URL|API Key|Model ID|Charger les modèles|Enregistrer|Tester l’envoi|Vider le cache|Effacer clé|Suppression en attente|Facultatif en local|Sans clé|Enregistré {0} (laisser vide pour garder)|▾ Choisir parmi {0} modèles…|Cache : {0}|Récupération de /models…|✓ {0} modèles chargés · {1}ms|Échec de récupération des modèles|Enregistrement…|✓ Enregistré ({0} · {1})|Échec d’enregistrement|Test de connexion en cours…|✓ Connecté · {0}ms · {1} Réponse : « {2} »|Échec du test de connexion|✓ Cache de suggestions vidé|Synchronise uniquement les identifiants du fournisseur (Nom, Base URL, API Key) ; le Model ID par profil reste indépendant du Traducteur de réflexion.|Durée de validité|{0} min',
    de:
      'Nächsten Prompt vorschlagen (Beta)|Experimentell, standardmäßig aus. Sagt nach jeder abgeschlossenen Antwort (auch bei Hintergrundaufgaben) deine nächste Nachricht im leeren Eingabefeld voraus. Mit Tab übernehmen.|Ein|Aus|OpenAI-kompatible Profile|Primäres OpenAI-Profil|Benutzerdefiniertes Profil|+ Neu|Löschen|Profilname|z. B. Gemini AI Studio / Haupt-Gateway|Base URL|API Key|Model ID|Modelle abrufen|Speichern|Test senden|Cache leeren|Löschen|Löschen vorgemerkt|Für lokal optional|Ohne Schlüssel|{0} gespeichert (leer lassen zum Behalten)|▾ Schnellauswahl aus {0} Modellen…|Cache: {0}|Rufe /models ab…|✓ {0} Modelle geladen · {1}ms|Modellabruf fehlgeschlagen|Speichere Konfiguration…|✓ Gespeichert ({0} · {1})|Speichern fehlgeschlagen|Teste Endpunktlatenz…|✓ Verbunden · {0}ms · {1} Antwort: „{2}“|Verbindungstest fehlgeschlagen|✓ Prompt-Vorschlagscache geleert|Synchronisiert nur Anbieterdaten (Name, Base URL, API-Schlüssel); die gewählte Modell-ID pro Profil wird unabhängig vom Denk-Übersetzer gespeichert.|Gültigkeitsdauer|{0} Min.',
  };

  const fmt = (tpl, args) => String(tpl || '').replace(/\{(\d)\}/g, (_, i) => String(args[i] ?? ''));

  const SUGGESTER_I18N = Object.fromEntries(
    Object.entries(I18N_ROWS).map(([lang, row]) => {
      const vals = row.split('|');
      const map = {};
      for (let i = 0; i < I18N_KEYS.length; i++) map[I18N_KEYS[i]] = vals[i] || '';
      return [lang, map];
    })
  );

  // 对齐 wallpaper-settings-ui.js 8 语规范（yue -> zh-CN，zh-HK/MO -> zh-TW，未知返回空字符串交由调用方兜底 en）
  function normalizeLang(raw) {
    const s = String(raw || '').trim().toLowerCase().replace(/_/g, '-');
    if (!s || s === 'auto') return '';
    if (s === 'yue' || s.startsWith('yue-') || s === 'zh-yue' || s.includes('cantonese')) return 'zh-CN';
    if (/^zh-(tw|hk|mo|hant)/.test(s) || s === 'tw' || s === 'hant') return 'zh-TW';
    if (/^zh(?:\b|-)/.test(s)) return 'zh-CN';
    if (/^(ja|jp)(?:\b|-)/.test(s) || s === 'japanese') return 'ja';
    if (/^(ko|kr)(?:\b|-)/.test(s) || s === 'korean') return 'ko';
    if (/^es(?:\b|-)/.test(s) || s === 'spanish') return 'es';
    if (/^fr(?:\b|-)/.test(s) || s === 'french') return 'fr';
    if (/^de(?:\b|-)/.test(s) || s === 'german') return 'de';
    if (/^en(?:\b|-)/.test(s) || s === 'english') return 'en';
    return '';
  }

  function resolveLang(doc, ctx) {
    if (ctx && ctx.lang) {
      const l = normalizeLang(ctx.lang);
      if (l) return l;
    }
    if (ctx && typeof ctx.getLang === 'function') {
      const l = normalizeLang(ctx.getLang());
      if (l) return l;
    }
    try {
      const de = doc && doc.documentElement;
      if (de && typeof de.getAttribute === 'function') {
        const l1 = normalizeLang(de.getAttribute('data-ag-cs-lang'));
        if (l1) return l1;
        const l2 = normalizeLang(de.getAttribute('data-ag-prism-lang'));
        if (l2) return l2;
      }
      const navObj = G && 'navigator' in G ? G.navigator : typeof navigator !== 'undefined' ? navigator : null;
      const navLang = normalizeLang(navObj?.language || '');
      if (navLang) return navLang;
    } catch {}
    return 'en';
  }

  function isLocalKeylessUrl(rawUrl) {
    try {
      const u = new URL(String(rawUrl || '').trim());
      const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
      return h === '127.0.0.1' || h === 'localhost' || h === '::1';
    } catch {
      return false;
    }
  }

  function sameOriginUrl(u1, u2) {
    try {
      return new URL(String(u1 || '').trim()).origin === new URL(String(u2 || '').trim()).origin;
    } catch {
      return false;
    }
  }

  function isGoogleAiStudioUrl(rawUrl) {
    try {
      return new URL(String(rawUrl || '').trim()).hostname.toLowerCase() === 'generativelanguage.googleapis.com';
    } catch {
      return false;
    }
  }

  function markNoTrOwned(el) {
    if (el && typeof el.setAttribute === 'function') {
      for (let i = 0; i < NO_TR_ATTRS.length; i++) {
        el.setAttribute(NO_TR_ATTRS[i][0], NO_TR_ATTRS[i][1]);
      }
      el.setAttribute('data-ag-owned', '1');
    }
    return el;
  }

  // 设置卡片基础样式与模型下拉菜单样式：按需在挂载设置 UI 时注入，destroy() 时彻底移除（纯 ASCII、0 :has()）
  const MODEL_DD_STYLE_ID = 'ag-prism-model-dd-css';
  const MODEL_DD_CSS = [
    '[data-testid="prism-suggester-slot"]{margin-top:10px;}',
    '.ag-prism-sg-card{display:flex;flex-direction:column;gap:10px;padding:12px 14px;border-radius:var(--ag-cs-r-md,10px);border:1px solid var(--ag-cs-border-1,rgba(128,128,128,0.22));background:var(--ag-cs-tonal-2,rgba(20,22,28,0.72));}',
    'html[data-ag-cs-theme="light"] .ag-prism-sg-card,html>body:is(.theme-light,.light-theme,.light) .ag-prism-sg-card{background:var(--ag-cs-tonal-2,rgba(255,255,255,0.88));border-color:var(--ag-cs-border-1,rgba(15,23,42,0.10));}',
    '.ag-prism-sg-row{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;}',
    '.ag-prism-sg-meta{display:flex;flex-direction:column;gap:2px;flex:1 1 200px;min-width:0;}',
    '.ag-prism-sg-title{font-size:13px;font-weight:600;color:var(--foreground);line-height:1.35;}',
    '.ag-prism-sg-desc{font-size:11.5px;color:var(--muted-foreground);line-height:1.45;}',
    '.ag-prism-model-dd-wrap{position:relative;}',
    '.ag-prism-model-dd-btn{display:flex !important;align-items:center;justify-content:space-between;gap:8px;cursor:pointer;text-align:left;}',
    '.ag-prism-model-dd-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--ag-cs-mono-stack,monospace);font-size:12px;flex:1 1 auto;min-width:0;}',
    '.ag-prism-model-dd-caret{font-size:11px;opacity:0.72;flex-shrink:0;transition:transform 140ms ease;}',
    '.ag-prism-model-dd-wrap[data-open="1"] .ag-prism-model-dd-caret{transform:rotate(180deg);}',
    '.ag-prism-model-dd-menu{position:absolute;left:0;right:0;bottom:calc(100% + 5px);z-index:60;max-height:208px;overflow-y:auto;overscroll-behavior:contain;padding:4px;border-radius:var(--ag-cs-r-md,8px);border:1px solid var(--ag-cs-border-2,rgba(128,128,128,0.32));background:var(--card,#1c1d22);box-shadow:0 10px 28px -6px rgba(0,0,0,0.45);}',
    'html[data-ag-cs-theme="light"] .ag-prism-model-dd-menu,html>body:is(.theme-light,.light-theme,.light) .ag-prism-model-dd-menu{background:var(--card,#fdfcfb);border-color:rgba(15,23,42,0.14);box-shadow:0 10px 26px -6px rgba(15,23,42,0.18);}',
    '.ag-prism-model-dd-head{padding:4px 8px 5px;font-size:11px;color:var(--muted-foreground);border-bottom:1px solid var(--ag-cs-border-1,rgba(128,128,128,0.16));margin-bottom:3px;user-select:none;}',
    '.ag-prism-model-dd-opt{appearance:none;width:100%;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 8px;border:0;border-radius:5px;background:transparent;color:var(--foreground);font-family:var(--ag-cs-mono-stack,monospace);font-size:12px;line-height:1.4;text-align:left;cursor:pointer;}',
    '.ag-prism-model-dd-opt:hover{background:var(--ag-cs-hover-wash,rgba(128,128,128,0.12));}',
    '.ag-prism-model-dd-opt[data-selected="1"]{background:color-mix(in srgb,var(--primary,#d97757) 16%,transparent);font-weight:600;}',
  ].join('\n');

  function ensureModelDropdownStyle(doc) {
    if (!doc || typeof doc.getElementById !== 'function') return;
    if (doc.getElementById(MODEL_DD_STYLE_ID)) return;
    const st = doc.createElement('style');
    st.id = MODEL_DD_STYLE_ID;
    markNoTrOwned(st);
    st.textContent = MODEL_DD_CSS;
    (doc.head || doc.documentElement)?.appendChild?.(st);
  }

  function unhideSlot(slotEl) {
    if (!slotEl) return;
    slotEl.hidden = false;
    try {
      slotEl.removeAttribute?.('hidden');
    } catch {}
    if (slotEl.style) {
      slotEl.style.display = '';
    }
  }

  // 记录当前窗口已挂载的 Suggester 设置卡片句柄，供跨卡片/跨窗口 reloadProfiles() 统一刷新
  const activeHandles = new Set();

  function mountSuggesterUi(slotEl, ctx = {}) {
    if (!slotEl) return null;
    const doc = slotEl.ownerDocument || (typeof document !== 'undefined' ? document : null);
    if (!doc || typeof doc.createElement !== 'function') return null;

    const guard = typeof ctx.runGuardedMut === 'function' ? ctx.runGuardedMut : (fn) => fn();

    const existingHandle = slotEl.__agPrismSgUiHandle;
    if (existingHandle && existingHandle.root && existingHandle.root.parentNode === slotEl) {
      guard(() => unhideSlot(slotEl));
      existingHandle.updateLang(resolveLang(doc, ctx));
      return existingHandle;
    }

    const resolveBridge = () =>
      (typeof window !== 'undefined' && window.__agPrismSuggesterBridge) || G.__agPrismSuggesterBridge || null;
    const resolveClient = () =>
      (typeof window !== 'undefined' && window.__agPrismSuggester) || G.__agPrismSuggester || null;
    const notifyPeerThoughtUi = () => {
      try {
        const sec = doc.getElementById?.('ag-cs-settings-sec') || doc.getElementById?.('ag-prism-settings-sec');
        sec?.__prismThoughtUiHandle?.reloadConfig?.();
      } catch {}
    };

    const mk = (tag, cls, txt) => {
      const el = doc.createElement(tag);
      if (cls) el.className = cls;
      if (txt !== undefined) el.textContent = String(txt);
      return el;
    };
    const mkBtn = (cls, txt, testId) => {
      const b = mk('button', cls, txt);
      b.type = 'button';
      if (testId) b.setAttribute('data-testid', testId);
      return b;
    };

    const segBtnCls =
      (ctx && ctx.btnClass) || 'ag-cs-seg-btn data-[pressed]:bg-secondary data-[pressed]:text-foreground';
    let curLang = resolveLang(doc, ctx);
    let pack = SUGGESTER_I18N[curLang] || SUGGESTER_I18N.en;
    let reloadPromise = null;
    let uiDestroyed = false;

    const state = {
      loaded: false,
      busy: false,
      enabled: false,
      ttlMinutes: 15,
      cacheCount: 0,
      activeProfileId: 'default',
      profiles: [
        {
          id: 'default',
          name: pack.defaultProfName,
          baseUrl: 'https://api.openai.com/v1',
          model: 'gpt-4o-mini',
          hasApiKey: false,
          maskedKey: '',
          draftKey: '',
          clearSavedKey: false,
          copyKeyFromId: '',
        },
      ],
      fetchedModels: [],
    };

    const card = mk('div', 'ag-prism-sg-card');
    card.setAttribute('data-testid', 'prism-suggester-card');
    card.setAttribute('data-ag-cs-lang', curLang);
    markNoTrOwned(card);

    // 1) 头部行：标题、说明与 Beta 总开关
    const headRow = mk('div', 'ag-prism-sg-row');
    const headMeta = mk('div', 'ag-prism-sg-meta');
    const titleEl = mk('span', 'ag-prism-sg-title', pack.title);
    const descEl = mk('span', 'ag-prism-sg-desc', pack.desc);
    headMeta.appendChild(titleEl);
    headMeta.appendChild(descEl);

    const enableGrp = mk('div', 'ag-cs-seg-group');
    enableGrp.setAttribute('role', 'group');
    enableGrp.setAttribute('data-ui-kind', 'switch');
    enableGrp.setAttribute('data-switch-on', '0');
    const enableThumb = mk('span', 'ag-cs-switch-thumb');
    enableThumb.setAttribute('aria-hidden', 'true');
    const enableOnBtn = mkBtn(segBtnCls, pack.on, 'prism-sg-enable-on');
    const enableOffBtn = mkBtn(segBtnCls, pack.off, 'prism-sg-enable-off');
    enableGrp.appendChild(enableThumb);
    enableGrp.appendChild(enableOnBtn);
    enableGrp.appendChild(enableOffBtn);
    headRow.appendChild(headMeta);
    headRow.appendChild(enableGrp);

    // 2) 与思考转译视觉对齐的渠道配置工作台（.ag-cs-thought-cfg-box）
    const cfgBox = mk('div', 'ag-cs-thought-cfg-box');
    cfgBox.setAttribute('data-testid', 'prism-sg-ai-config');

    const TTL_CHOICES = [5, 15, 30];
    const ttlBar = mk('div', 'ag-cs-thought-bar');
    const ttlLbl = mk('span', 'ag-cs-thought-label', pack.ttlLabel);
    const ttlGrp = mk(
      'div',
      'inline-flex items-center rounded-lg border border-border bg-secondary/20 p-0.5 gap-0.5 select-none min-h-8'
    );
    ttlGrp.setAttribute('role', 'group');
    ttlGrp.setAttribute('data-testid', 'prism-sg-ttl-group');
    const ttlBtns = new Map();
    for (const mins of TTL_CHOICES) {
      const tb = mkBtn(segBtnCls, fmt(pack.ttlFmt, [mins]), `prism-sg-ttl-${mins}`);
      tb.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (state.ttlMinutes === mins) return;
        state.ttlMinutes = mins;
        resolveClient()?.applyConfig?.({ ttlMinutes: mins });
        renderProfilePillsAndForm();
        const bridge = resolveBridge();
        if (bridge && !bridge.isDisposed?.()) {
          void bridge.call('save-config', { ttlMinutes: mins }, 6000).then((res) => {
            if (res && res.ok) resolveClient()?.applyConfig?.(res.config, res.backend);
          });
        }
      });
      ttlBtns.set(mins, tb);
      ttlGrp.appendChild(tb);
    }
    ttlBar.appendChild(ttlLbl);
    ttlBar.appendChild(ttlGrp);
    cfgBox.appendChild(ttlBar);

    const profBar = mk('div', 'ag-cs-thought-bar');
    const profLbl = mk('span', 'ag-cs-thought-label', pack.profilesLabel);
    const profPills = mk('div', 'ag-cs-thought-profiles');
    profBar.appendChild(profLbl);
    profBar.appendChild(profPills);
    cfgBox.appendChild(profBar);

    const grid = mk('div', 'ag-cs-thought-grid');
    const mkField = (labelText, inputEl, extraRightEl) => {
      const wrap = mk('div', 'ag-cs-thought-field');
      const lbl = doc.createElement('label');
      const lblSpan = doc.createElement('span');
      lblSpan.textContent = labelText;
      lbl.appendChild(lblSpan);
      if (extraRightEl) lbl.appendChild(extraRightEl);
      wrap.appendChild(lbl);
      wrap.appendChild(inputEl);
      return { wrap, lblSpan };
    };

    const nameInput = mk('input', 'ag-cs-thought-input');
    nameInput.type = 'text';
    nameInput.setAttribute('data-testid', 'prism-sg-prof-name');
    nameInput.placeholder = pack.fieldNamePh;

    const urlInput = mk('input', 'ag-cs-thought-input');
    urlInput.type = 'text';
    urlInput.setAttribute('data-mono', '1');
    urlInput.setAttribute('data-testid', 'prism-sg-base-url');
    urlInput.placeholder = 'https://api.openai.com/v1';

    const keyRightWrap = mk('span', 'inline-flex items-center gap-1.5');
    const keyMetaBadge = mk('span', 'text-[11px] opacity-80');
    const clearKeyBtn = mkBtn('ag-cs-thought-btn', pack.clearKeyBtn, 'prism-sg-clear-key-btn');
    clearKeyBtn.hidden = true;
    if (clearKeyBtn.style) {
      clearKeyBtn.style.display = 'none';
      clearKeyBtn.style.fontSize = '10.5px';
      clearKeyBtn.style.padding = '0 5px';
      clearKeyBtn.style.minHeight = '18px';
      clearKeyBtn.style.lineHeight = '16px';
    }
    keyRightWrap.appendChild(keyMetaBadge);
    keyRightWrap.appendChild(clearKeyBtn);

    const keyInput = mk('input', 'ag-cs-thought-input');
    keyInput.type = 'password';
    keyInput.autocomplete = 'off';
    keyInput.setAttribute('data-mono', '1');
    keyInput.setAttribute('data-testid', 'prism-sg-api-key');
    keyInput.placeholder = 'sk-...';

    const modelRow = mk('div', 'ag-cs-thought-input-row');
    const modelInput = mk('input', 'ag-cs-thought-input');
    modelInput.type = 'text';
    modelInput.setAttribute('data-mono', '1');
    modelInput.setAttribute('data-testid', 'prism-sg-model-input');
    modelInput.placeholder = 'gemini-3-flash-preview';

    const fetchModelsBtn = mkBtn('ag-cs-thought-btn', pack.fetchModels, 'prism-sg-fetch-models-btn');
    modelRow.appendChild(modelInput);
    modelRow.appendChild(fetchModelsBtn);

    ensureModelDropdownStyle(doc);
    const modelSelectWrap = mk('div', 'ag-cs-thought-field ag-prism-model-dd-wrap');
    modelSelectWrap.setAttribute('data-span', '2');
    modelSelectWrap.setAttribute('data-open', '0');
    modelSelectWrap.hidden = true;

    const modelSelect = mkBtn('ag-cs-thought-select ag-prism-model-dd-btn', '', 'prism-sg-model-select');
    modelSelect.setAttribute('aria-haspopup', 'listbox');
    modelSelect.setAttribute('aria-expanded', 'false');
    const modelSelectLabel = mk('span', 'ag-prism-model-dd-label', '');
    const modelSelectCaret = mk('span', 'ag-prism-model-dd-caret', '\u25be');
    modelSelectCaret.setAttribute('aria-hidden', 'true');
    modelSelect.appendChild(modelSelectLabel);
    modelSelect.appendChild(modelSelectCaret);

    const modelMenu = mk('div', 'ag-prism-model-dd-menu');
    modelMenu.setAttribute('role', 'listbox');
    modelMenu.setAttribute('data-testid', 'prism-sg-model-listbox');
    modelMenu.hidden = true;
    modelSelectWrap.appendChild(modelSelect);
    modelSelectWrap.appendChild(modelMenu);

    let detachMenuDismiss = null;
    const closeModelMenu = () => {
      if (detachMenuDismiss) {
        detachMenuDismiss();
        detachMenuDismiss = null;
      }
      guard(() => {
        modelMenu.hidden = true;
        modelSelectWrap.setAttribute('data-open', '0');
        modelSelect.setAttribute('aria-expanded', 'false');
      });
    };
    const syncModelMenuSelection = (selectedVal) => {
      const val = String(selectedVal || '').trim();
      const total = state.fetchedModels.length;
      guard(() => {
        modelSelectLabel.textContent =
          val && state.fetchedModels.includes(val) ? val : fmt(pack.quickSelect, [total]);
        const items = modelMenu.querySelectorAll?.('.ag-prism-model-dd-opt') || [];
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          const on = it.getAttribute('data-model-id') === val;
          it.setAttribute('data-selected', on ? '1' : '0');
          it.setAttribute('aria-selected', on ? 'true' : 'false');
          const chk = it.lastChild;
          if (chk && chk.nodeType === 1) chk.textContent = on ? '\u2713' : '';
        }
      });
    };
    const openModelMenu = () => {
      if (!state.fetchedModels.length) return;
      guard(() => {
        modelMenu.hidden = false;
        modelSelectWrap.setAttribute('data-open', '1');
        modelSelect.setAttribute('aria-expanded', 'true');
      });
      const selEl = modelMenu.querySelector?.('.ag-prism-model-dd-opt[data-selected="1"]');
      try {
        selEl?.scrollIntoView?.({ block: 'nearest' });
      } catch {}
      if (!detachMenuDismiss) {
        const onDocDown = (ev) => {
          if (ev?.target && modelSelectWrap.contains?.(ev.target)) return;
          closeModelMenu();
        };
        const onDocKey = (ev) => {
          if (ev?.key === 'Escape') {
            ev.stopPropagation?.();
            closeModelMenu();
          }
        };
        doc.addEventListener?.('pointerdown', onDocDown, true);
        doc.addEventListener?.('keydown', onDocKey, true);
        detachMenuDismiss = () => {
          doc.removeEventListener?.('pointerdown', onDocDown, true);
          doc.removeEventListener?.('keydown', onDocKey, true);
        };
      }
    };
    modelSelect.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (modelMenu.hidden) openModelMenu();
      else closeModelMenu();
    });

    const nameField = mkField(pack.fieldName, nameInput);
    const urlField = mkField(pack.fieldBaseUrl, urlInput);
    const keyField = mkField(pack.fieldApiKey, keyInput, keyRightWrap);
    const modelField = mkField(pack.fieldModel, modelRow);

    grid.appendChild(nameField.wrap);
    grid.appendChild(urlField.wrap);
    grid.appendChild(keyField.wrap);
    grid.appendChild(modelField.wrap);
    grid.appendChild(modelSelectWrap);
    cfgBox.appendChild(grid);

    const actRow = mk('div', 'ag-cs-thought-actions');
    const btnGrp = mk('div', 'ag-cs-thought-btn-group');
    const saveBtn = mkBtn('ag-cs-thought-btn', pack.saveBtn, 'prism-sg-save-btn');
    saveBtn.setAttribute('data-primary', '1');
    const testBtn = mkBtn('ag-cs-thought-btn', pack.testBtn, 'prism-sg-test-btn');
    const clearCacheBtn = mkBtn('ag-cs-thought-btn', pack.clearCacheBtn, 'prism-sg-clear-cache-btn');
    const cacheStatsBadge = mk('span', 'ag-cs-thought-cache-badge', fmt(pack.cacheBadge, [0]));
    if (cacheStatsBadge.style) {
      cacheStatsBadge.style.fontSize = '11px';
      cacheStatsBadge.style.opacity = '0.75';
      cacheStatsBadge.style.alignSelf = 'center';
      cacheStatsBadge.style.padding = '0 4px';
    }
    btnGrp.appendChild(saveBtn);
    btnGrp.appendChild(testBtn);
    btnGrp.appendChild(clearCacheBtn);
    btnGrp.appendChild(cacheStatsBadge);

    const statusBadge = mk('span', 'ag-cs-thought-status', '');
    statusBadge.setAttribute('data-testid', 'prism-sg-status-badge');
    statusBadge.hidden = true;

    actRow.appendChild(btnGrp);
    actRow.appendChild(statusBadge);
    cfgBox.appendChild(actRow);

    const shareHintEl = mk('p', 'ag-cs-thought-hint', pack.shareHint);
    cfgBox.appendChild(shareHintEl);

    card.appendChild(headRow);
    card.appendChild(cfgBox);

    function setBtnPressed(btn, on) {
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (on) btn.setAttribute('data-pressed', '');
      else btn.removeAttribute('data-pressed');
    }

    const setStatus = (kind, msg) => {
      guard(() => {
        if (!msg) {
          statusBadge.hidden = true;
          statusBadge.textContent = '';
          return;
        }
        statusBadge.hidden = false;
        statusBadge.setAttribute('data-state', kind);
        statusBadge.textContent = msg;
      });
    };

    const getActiveProfile = () =>
      state.profiles.find((p) => p.id === state.activeProfileId) || state.profiles[0];

    const syncFormIntoProfile = () => {
      const cur = getActiveProfile();
      if (!cur) return;
      cur.name = nameInput.value.trim() || cur.name || 'Profile';
      cur.baseUrl = urlInput.value.trim() || 'https://api.openai.com/v1';
      cur.model = modelInput.value.trim();
      if (keyInput.value.trim()) {
        cur.draftKey = keyInput.value.trim();
      }
    };

    const syncKeyHintForUrl = (cur) => {
      if (!cur) return;
      guard(() => {
        const inheritedProf =
          cur.copyKeyFromId && !cur.hasApiKey
            ? state.profiles.find((p) => p.id === cur.copyKeyFromId)
            : null;
        const canInheritKey = Boolean(
          inheritedProf && inheritedProf.hasApiKey && sameOriginUrl(cur.baseUrl, inheritedProf.baseUrl)
        );
        const effHasKey = Boolean(cur.hasApiKey || canInheritKey);
        const effMask = cur.maskedKey || (canInheritKey ? inheritedProf.maskedKey : '');
        const showClearBtn = Boolean(cur.hasApiKey && !cur.draftKey && !cur.clearSavedKey);
        clearKeyBtn.hidden = !showClearBtn;
        if (clearKeyBtn.style) clearKeyBtn.style.display = showClearBtn ? '' : 'none';
        clearKeyBtn.textContent = pack.clearKeyBtn;

        if (cur.clearSavedKey && !cur.draftKey) {
          keyInput.placeholder = isLocalKeylessUrl(cur.baseUrl) ? pack.keylessPh : 'sk-...';
          keyMetaBadge.textContent = pack.keyClearedBadge;
        } else if (effHasKey && effMask && !cur.draftKey) {
          keyInput.placeholder = fmt(pack.savedKeyPh, [effMask]);
          keyMetaBadge.textContent = `✓ ${effMask}`;
        } else if (!cur.draftKey && isLocalKeylessUrl(cur.baseUrl)) {
          keyInput.placeholder = pack.keylessPh;
          keyMetaBadge.textContent = pack.keylessBadge;
        } else {
          keyInput.placeholder = 'sk-...';
          keyMetaBadge.textContent = '';
        }
      });
    };

    const renderProfilePillsAndForm = () => {
      if (uiDestroyed) return;
      guard(() => {
        unhideSlot(slotEl);
        enableGrp.setAttribute('data-switch-on', state.enabled ? '1' : '0');
        setBtnPressed(enableOnBtn, state.enabled);
        setBtnPressed(enableOffBtn, !state.enabled);
        for (const [mins, tb] of ttlBtns.entries()) {
          setBtnPressed(tb, state.ttlMinutes === mins);
          tb.textContent = fmt(pack.ttlFmt, [mins]);
        }
        cfgBox.hidden = !state.enabled;
        if (cfgBox.style) cfgBox.style.display = state.enabled ? '' : 'none';

        while (profPills.firstChild) profPills.removeChild(profPills.firstChild);
        for (const p of state.profiles) {
          const chip = mkBtn('ag-cs-thought-prof-chip', p.name || p.id);
          chip.setAttribute('data-profile-id', p.id);
          chip.setAttribute('data-active', p.id === state.activeProfileId ? '1' : '0');
          chip.addEventListener('click', (ev) => {
            ev.stopPropagation();
            syncFormIntoProfile();
            state.activeProfileId = p.id;
            closeModelMenu();
            modelSelectWrap.hidden = true;
            renderProfilePillsAndForm();
            // 立即持久化提示词建议独立选中的渠道标签页
            const bridge = resolveBridge();
            if (bridge && !bridge.isDisposed?.()) {
              void bridge.call('save-config', { activeProfileId: p.id }, 6000).then((res) => {
                if (res && res.ok) resolveClient()?.applyConfig?.(res.config, res.backend);
              });
            }
          });
          profPills.appendChild(chip);
        }

        const addBtn = mkBtn('ag-cs-thought-btn', pack.addProfile, 'prism-sg-add-profile-btn');
        addBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          syncFormIntoProfile();
          const prevCur = getActiveProfile();
          const newId = `prof_${Date.now().toString(36)}_${state.profiles.length + 1}`;
          state.profiles.push({
            id: newId,
            name: `${pack.customProfPrefix} ${state.profiles.length + 1}`,
            baseUrl: prevCur?.baseUrl || 'https://api.openai.com/v1',
            model: isGoogleAiStudioUrl(prevCur?.baseUrl)
              ? 'gemini-3-flash-preview'
              : prevCur?.model || 'gpt-4o-mini',
            hasApiKey: false,
            maskedKey: '',
            draftKey: '',
            clearSavedKey: false,
            copyKeyFromId: prevCur?.hasApiKey ? prevCur.id : '',
          });
          state.activeProfileId = newId;
          modelSelectWrap.hidden = true;
          renderProfilePillsAndForm();
        });
        profPills.appendChild(addBtn);

        if (state.profiles.length > 1) {
          const delBtn = mkBtn('ag-cs-thought-btn', pack.delProfile, 'prism-sg-del-profile-btn');
          delBtn.setAttribute('data-danger', '1');
          delBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (state.profiles.length <= 1) return;
            state.profiles = state.profiles.filter((item) => item.id !== state.activeProfileId);
            state.activeProfileId = state.profiles[0].id;
            modelSelectWrap.hidden = true;
            renderProfilePillsAndForm();
          });
          profPills.appendChild(delBtn);
        }

        const cur = getActiveProfile();
        if (cur) {
          nameInput.value = cur.name || '';
          urlInput.value = cur.baseUrl || 'https://api.openai.com/v1';
          modelInput.value = cur.model || '';
          keyInput.value = cur.draftKey || '';
          syncKeyHintForUrl(cur);
        }
        cacheStatsBadge.textContent = fmt(pack.cacheBadge, [state.cacheCount]);
      });
    };

    const buildSavePayload = () => {
      syncFormIntoProfile();
      return {
        enabled: state.enabled,
        ttlMinutes: state.ttlMinutes,
        activeProfileId: state.activeProfileId,
        profiles: state.profiles.map((p) => ({
          id: p.id,
          name: p.name,
          baseUrl: p.baseUrl,
          model: p.model,
          apiKey: p.draftKey || '',
          keepExistingKey: Boolean(!p.draftKey && !p.clearSavedKey),
          copyKeyFromId: p.copyKeyFromId || '',
        })),
      };
    };

    const syncFromPayload = (res) => {
      if (uiDestroyed || !res || !res.ok) return;
      state.loaded = true;
      const cfg = res.config || {};
      if (cfg.enabled !== undefined) state.enabled = Boolean(cfg.enabled);
      if (Number.isFinite(Number(cfg.ttlMinutes))) state.ttlMinutes = Number(cfg.ttlMinutes);
      if (typeof res.cacheCount === 'number') state.cacheCount = res.cacheCount;
      if (Array.isArray(res.profiles) && res.profiles.length > 0) {
        state.profiles = res.profiles.map((p) => ({
          id: p.id,
          name: p.name,
          baseUrl: p.baseUrl,
          model: p.model,
          hasApiKey: Boolean(p.hasApiKey),
          maskedKey: p.maskedKey || '',
          draftKey: '',
          clearSavedKey: false,
          copyKeyFromId: '',
        }));
      }
      if (cfg.activeProfileId && state.profiles.some((p) => p.id === cfg.activeProfileId)) {
        state.activeProfileId = cfg.activeProfileId;
      } else if (state.activeProfileId && state.profiles.some((p) => p.id === state.activeProfileId)) {
        // 保留当前仍然存在的渠道选择
      } else if (state.profiles.length > 0) {
        state.activeProfileId = state.profiles[0].id;
      }
      renderProfilePillsAndForm();
    };

    nameInput.addEventListener('input', () => {
      const cur = getActiveProfile();
      if (cur) {
        cur.name = nameInput.value;
        const activeChip = profPills.querySelector?.(`[data-profile-id="${cur.id}"]`);
        if (activeChip) activeChip.textContent = cur.name.trim() || cur.id;
      }
    });
    urlInput.addEventListener('input', () => {
      const cur = getActiveProfile();
      if (cur) {
        cur.baseUrl = urlInput.value;
        syncKeyHintForUrl(cur);
      }
    });
    modelInput.addEventListener('input', () => {
      const cur = getActiveProfile();
      if (cur) cur.model = modelInput.value;
      if (!modelSelectWrap.hidden) syncModelMenuSelection(modelInput.value);
    });
    keyInput.addEventListener('input', () => {
      const cur = getActiveProfile();
      if (cur) {
        cur.draftKey = keyInput.value;
        if (cur.draftKey.trim()) cur.clearSavedKey = false;
        syncKeyHintForUrl(cur);
      }
    });
    clearKeyBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const cur = getActiveProfile();
      if (!cur) return;
      cur.clearSavedKey = true;
      cur.copyKeyFromId = '';
      cur.draftKey = '';
      keyInput.value = '';
      syncKeyHintForUrl(cur);
    });

    const toggleEnabled = async (nextEnabled) => {
      if (state.enabled === nextEnabled) return;
      if (!nextEnabled) closeModelMenu();
      state.enabled = nextEnabled;
      resolveClient()?.applyConfig?.({ enabled: nextEnabled });
      renderProfilePillsAndForm();
      const bridge = resolveBridge();
      if (!bridge || bridge.isDisposed?.()) return;
      const res = await bridge.call('save-config', { enabled: nextEnabled }, 6000);
      if (res && res.ok) {
        syncFromPayload(res);
        resolveClient()?.applyConfig?.(res.config, res.backend);
      }
    };
    enableOnBtn.addEventListener('click', () => void toggleEnabled(true));
    enableOffBtn.addEventListener('click', () => void toggleEnabled(false));

    fetchModelsBtn.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const bridge = resolveBridge();
      if (!bridge || bridge.isDisposed?.() || state.busy) return;
      syncFormIntoProfile();
      const cur = getActiveProfile();
      state.busy = true;
      fetchModelsBtn.disabled = true;
      setStatus('idle', pack.fetchingModels);
      try {
        const res = await bridge.call(
          'fetch-models',
          {
            profileId: cur?.id,
            copyKeyFromId: cur?.copyKeyFromId || '',
            baseUrl: cur?.baseUrl,
            apiKey: cur?.draftKey || '',
          },
          15000
        );
        if (res && res.ok && Array.isArray(res.models)) {
          state.fetchedModels = res.models;
          guard(() => {
            while (modelMenu.firstChild) modelMenu.removeChild(modelMenu.firstChild);
            const headEl = mk('div', 'ag-prism-model-dd-head', fmt(pack.quickSelect, [res.models.length]));
            modelMenu.appendChild(headEl);
            for (const mid of res.models) {
              const opt = mkBtn('ag-prism-model-dd-opt', '');
              opt.setAttribute('role', 'option');
              opt.setAttribute('data-model-id', mid);
              const txtSpan = mk('span', 'ag-prism-model-dd-label', mid);
              const chkSpan = mk('span', '', '');
              opt.appendChild(txtSpan);
              opt.appendChild(chkSpan);
              opt.addEventListener('click', (optEv) => {
                optEv.stopPropagation();
                modelInput.value = mid;
                const activeCur = getActiveProfile();
                if (activeCur) activeCur.model = mid;
                syncModelMenuSelection(mid);
                closeModelMenu();
              });
              modelMenu.appendChild(opt);
            }
            modelSelectWrap.hidden = res.models.length === 0;
          });
          syncModelMenuSelection(cur?.model || modelInput.value);
          setStatus('ok', fmt(pack.fetchOk, [res.models.length, res.latencyMs || 0]));
        } else {
          setStatus('err', `✕ ${res?.error || pack.fetchErr}`);
        }
      } finally {
        state.busy = false;
        fetchModelsBtn.disabled = false;
      }
    });

    saveBtn.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const bridge = resolveBridge();
      if (!bridge || bridge.isDisposed?.() || state.busy) return;
      if (reloadPromise) {
        try {
          await reloadPromise;
        } catch {}
      }
      state.busy = true;
      saveBtn.disabled = true;
      setStatus('idle', pack.savingCfg);
      try {
        const res = await bridge.call('save-config', buildSavePayload(), 8000);
        if (res && res.ok) {
          syncFromPayload(res);
          resolveClient()?.applyConfig?.(res.config, res.backend);
          notifyPeerThoughtUi();
          const cur = getActiveProfile();
          setStatus('ok', fmt(pack.saveOk, [cur?.name || '', cur?.model || '']));
        } else {
          setStatus('err', `✕ ${res?.error || pack.saveErr}`);
        }
      } finally {
        state.busy = false;
        saveBtn.disabled = false;
      }
    });

    testBtn.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const bridge = resolveBridge();
      if (!bridge || bridge.isDisposed?.() || state.busy) return;
      if (reloadPromise) {
        try {
          await reloadPromise;
        } catch {}
      }
      state.busy = true;
      testBtn.disabled = true;
      setStatus('idle', pack.testingConn);
      try {
        const payload = buildSavePayload();
        const cur = getActiveProfile();
        const res = await bridge.call(
          'test-connection',
          {
            ...payload,
            baseUrl: cur?.baseUrl,
            model: cur?.model,
            apiKey: cur?.draftKey || '',
          },
          18000
        );
        // test-connection 内部已先保存共享渠道配置，无论连通结果均通知思考转译 UI 与本地重载最新渠道
        notifyPeerThoughtUi();
        await refreshState();
        if (res && res.ok) {
          setStatus('ok', fmt(pack.testOk, [res.latencyMs || 0, res.model || '', res.reply || 'OK']));
        } else {
          setStatus('err', `✕ ${res?.error || pack.testErr}`);
        }
      } finally {
        state.busy = false;
        testBtn.disabled = false;
      }
    });

    clearCacheBtn.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const bridge = resolveBridge();
      if (!bridge || bridge.isDisposed?.()) return;
      const res = await bridge.call('clear-cache', {}, 4000);
      if (res && res.ok) {
        state.cacheCount = 0;
        renderProfilePillsAndForm();
        setStatus('ok', pack.clearOk);
      }
    });

    async function refreshState() {
      if (uiDestroyed) return { ok: false, destroyed: true };
      const bridge = resolveBridge();
      if (!bridge || bridge.isDisposed?.()) {
        renderProfilePillsAndForm();
        return { ok: false, offline: true };
      }
      const res = await bridge.call('get-config', {}, 6000);
      if (uiDestroyed) return { ok: false, destroyed: true };
      if (res && res.ok) {
        syncFromPayload(res);
        resolveClient()?.applyConfig?.(res.config, res.backend);
      } else {
        renderProfilePillsAndForm();
      }
      return res || { ok: false };
    }

    // 跨卡片/跨窗口共享凭据刷新钩子：思考转译卡片保存渠道或守护进程广播时调用，防止陈旧 state.profiles 覆写新密钥
    function reloadProfiles() {
      if (uiDestroyed) return Promise.resolve({ ok: false, destroyed: true });
      if (reloadPromise) return reloadPromise;
      reloadPromise = Promise.resolve()
        .then(() => refreshState())
        .catch(() => ({ ok: false }))
        .finally(() => {
          reloadPromise = null;
        });
      return reloadPromise;
    }

    function updateLang(nextLang) {
      const resolved = normalizeLang(nextLang) || curLang || 'en';
      if (resolved === curLang && card.getAttribute('data-ag-cs-lang') === resolved) return;
      curLang = resolved;
      pack = SUGGESTER_I18N[curLang] || SUGGESTER_I18N.en;
      guard(() => {
        card.setAttribute('data-ag-cs-lang', curLang);
        titleEl.textContent = pack.title;
        descEl.textContent = pack.desc;
        enableOnBtn.textContent = pack.on;
        enableOffBtn.textContent = pack.off;
        ttlLbl.textContent = pack.ttlLabel;
        profLbl.textContent = pack.profilesLabel;
        nameField.lblSpan.textContent = pack.fieldName;
        nameInput.placeholder = pack.fieldNamePh;
        urlField.lblSpan.textContent = pack.fieldBaseUrl;
        keyField.lblSpan.textContent = pack.fieldApiKey;
        modelField.lblSpan.textContent = pack.fieldModel;
        fetchModelsBtn.textContent = pack.fetchModels;
        saveBtn.textContent = pack.saveBtn;
        testBtn.textContent = pack.testBtn;
        clearCacheBtn.textContent = pack.clearCacheBtn;
        shareHintEl.textContent = pack.shareHint;
      });
      renderProfilePillsAndForm();
    }

    function destroy() {
      if (uiDestroyed) return;
      uiDestroyed = true;
      activeHandles.delete(handle);
      closeModelMenu();
      guard(() => {
        if (card.parentNode) card.parentNode.removeChild(card);
        slotEl.hidden = true;
        if (slotEl.style) slotEl.style.display = 'none';
      });
      if (slotEl.__agPrismSgUiHandle === handle) {
        slotEl.__agPrismSgUiHandle = null;
      }
      // 无存活卡片实例时彻底卸载 #ag-prism-model-dd-css，杜绝样式标签残留泄漏
      if (activeHandles.size === 0) {
        try {
          doc.getElementById?.(MODEL_DD_STYLE_ID)?.remove?.();
        } catch {}
      }
    }

    guard(() => {
      unhideSlot(slotEl);
      while (slotEl.firstChild) slotEl.removeChild(slotEl.firstChild);
      slotEl.appendChild(card);
    });
    renderProfilePillsAndForm();

    const handle = {
      root: card,
      updateLang,
      refreshState,
      reloadProfiles,
      syncFromPeer: reloadProfiles,
      destroy,
    };
    activeHandles.add(handle);
    slotEl.__agPrismSgUiHandle = handle;
    void refreshState();
    return handle;
  }

  function reloadProfiles() {
    const tasks = [];
    for (const h of activeHandles) {
      try {
        if (h && typeof h.reloadProfiles === 'function') {
          tasks.push(Promise.resolve(h.reloadProfiles()));
        }
      } catch {}
    }
    return Promise.all(tasks);
  }

  const api = {
    mountSuggesterUi,
    SUGGESTER_I18N,
    normalizeLang,
    resolveLang,
    reloadProfiles,
    syncFromPeer: reloadProfiles,
  };
  G.__agPrismSuggesterSettingsUi = api;
  G.__prismMountSuggesterUi = mountSuggesterUi;
  if (typeof window !== 'undefined' && window) {
    window.__agPrismSuggesterSettingsUi = api;
    window.__prismMountSuggesterUi = mountSuggesterUi;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);

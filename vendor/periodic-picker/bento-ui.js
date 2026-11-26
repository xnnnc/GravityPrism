/**
 * Obsidian Prism — Periodic Picker Bento UI & Theme Engine
 * Stylesheet CSS, 4-Kit CNC Theme Resolver, 5-Axis Radar, 512K Telemetry Pod,
 * Aux Pad Pagination UI, Anti-i18n Isolation & Strict EN/ZH Bilingual Rendering.
 *
 * Contract:
 *   globalThis.__agPeriodicBentoUi (Browser) / module.exports (Node)
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module && typeof module.exports === 'object') {
    module.exports = api;
  }
  if (root && typeof root === 'object') {
    root.__agPeriodicBentoUi = api;
  }
  if (typeof globalThis === 'object' && globalThis) {
    globalThis.__agPeriodicBentoUi = api;
  }
  if (typeof window === 'object' && window) {
    window.__agPeriodicBentoUi = api;
  }
})(
  typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this,
  function () {
    'use strict';

    var STYLE_ID = 'ag-prism-periodic-picker-css';
    var ROOT_ID = 'ag-prism-periodic-picker-root';
    var ROOT_MARKER_ATTR = 'data-ag-prism-periodic-picker';
    var SVG_NS = 'http://www.w3.org/2000/svg';

    var BENCHMARK_SOURCE_CITATION =
      'Artificial Analysis v5.0 · Terminal-Bench · SWE-bench (2026Q4)';
    var BENCHMARK_SOURCE_CITATION_SHORT = 'AA v5 · TermBench · SWE-bench (2026Q4)';

    var RADAR_AXES = [
      { key: 'aa', zh: 'AA v5', en: 'AA v5', vertexZh: '推理', vertexEn: 'AA' },
      { key: 'term', zh: 'TermBench', en: 'TermBench', vertexZh: '终端', vertexEn: 'Term' },
      { key: 'sci', zh: 'HLE-D', en: 'HLE-D', vertexZh: '科学', vertexEn: 'Sci' },
      { key: 'swe', zh: 'SWE-Pro', en: 'SWE-Pro', vertexZh: '工程', vertexEn: 'SWE' },
      { key: 'tps', zh: '吞吐极速', en: 'Velocity', vertexZh: '极速', vertexEn: 'Speed' },
    ];

    var BENTO_I18N = {
      'zh-CN': {
        detailsOpen: '展开面板 ▾', detailsClose: '收起面板 ▴',
        teleOff: '遥测未开启', teleOffTitle: '实时遥测未开启', teleDisabledTitle: '实时遥测已关闭',
        teleOffSub: '仅展示真实上下文指标 · 已禁用模拟数据',
        badgeDisabled: '已关闭', badgeOffline: '未开启', badgeTight: '紧凑 TIGHT', badgeOptimal: '充裕 OPTIMAL',
        kv: '缓存 ', free: '余量 ', specBtn: '规格',
        flipToSpec: '切换回 MOD-01 评测规格面板', flipToTele: '切换至 MOD-02 512K 实时遥测面板',
        metaKicker: '原生模型元信息', metaModel: '名称', metaEffort: '推理档位', metaDefault: '默认', metaId: '原生标识',
        metaNote: '未收录于 2026Q4 基准库 · 仅展示真实宿主元数据',
        ttHead: '2026Q4 评测口径与思考档位说明',
        infoAria: '评测指标与思考档位说明',
        ttLines: ['AA v5：Artificial Analysis 综合智力指数（满分 100）', 'TermBench：命令行与终端自主排障通过率（%）', 'HLE-D / GPQA-D：前沿科学与多步难题推理（%）', 'SWE-Pro / AutoBench：真实软件工程修复率（%）', '思考档位：Low 极速响应 · Med 均衡 · High 深度 · XHigh 极限推理'],
        locked: '锁定态', hoverTag: '预览', activeTag: '当前',
        orchTopo: '双核路由拓扑 · DUAL-CORE', planner: '规划核', runner: '执行核',
        inFlowDock: '内嵌底坞', stage3d: '全屏展台',
        dockReturn: '收起回输入框正下方内嵌底坞 (F)', stageExpand: '展开全屏 3D 展台并解锁自由旋转 (F)',
        unmute: '开启机械音效', mute: '静音', closeDock: '收起底坞 (Esc / Enter)',
        auxPrev: '上一页副盘模型', auxNext: '下一页副盘模型', pagePre: '第 ', pageSuf: ' 页',
        radarAxes: ['AA v5', 'TermBench', 'HLE-D', 'SWE-Pro', '吞吐极速'],
        radarVerts: ['推理', '终端', '科学', '工程', '极速'],
      },
      'zh-TW': {
        detailsOpen: '展開面板 ▾', detailsClose: '收起面板 ▴',
        teleOff: '遙測未開啟', teleOffTitle: '即時遙測未開啟', teleDisabledTitle: '即時遙測已關閉',
        teleOffSub: '僅顯示真實上下文指標 · 已停用模擬資料',
        badgeDisabled: '已關閉', badgeOffline: '未開啟', badgeTight: '緊湊 TIGHT', badgeOptimal: '充裕 OPTIMAL',
        kv: '快取 ', free: '餘量 ', specBtn: '規格',
        flipToSpec: '切換回 MOD-01 評測規格面板', flipToTele: '切換至 MOD-02 512K 即時遙測面板',
        metaKicker: '原生模型中繼資料', metaModel: '名稱', metaEffort: '推理檔位', metaDefault: '預設', metaId: '原生識別',
        metaNote: '未收錄於 2026Q4 基準庫 · 僅顯示真實宿主中繼資料',
        ttHead: '2026Q4 評測口徑與思考檔位說明',
        infoAria: '評測指標與思考檔位說明',
        ttLines: ['AA v5：Artificial Analysis 綜合智力指數（滿分 100）', 'TermBench：命令列與終端自主排障通過率（%）', 'HLE-D / GPQA-D：前沿科學與多步難題推理（%）', 'SWE-Pro / AutoBench：真實軟體工程修復率（%）', '思考檔位：Low 極速響應 · Med 均衡 · High 深度 · XHigh 極限推理'],
        locked: '鎖定態', hoverTag: '預覽', activeTag: '目前',
        orchTopo: '雙核路由拓樸 · DUAL-CORE', planner: '規劃核', runner: '執行核',
        inFlowDock: '內嵌底塢', stage3d: '全螢幕展台',
        dockReturn: '收合回輸入框下方內嵌底塢 (F)', stageExpand: '展開全螢幕 3D 展台並解鎖自由旋轉 (F)',
        unmute: '開啟機械音效', mute: '靜音', closeDock: '收合底塢 (Esc / Enter)',
        auxPrev: '上一頁副盤模型', auxNext: '下一頁副盤模型', pagePre: '第 ', pageSuf: ' 頁',
        radarAxes: ['AA v5', 'TermBench', 'HLE-D', 'SWE-Pro', '吞吐極速'],
        radarVerts: ['推理', '終端', '科學', '工程', '極速'],
      },
      en: {
        detailsOpen: 'Details ▾', detailsClose: 'Hide Panel ▴',
        teleOff: 'Telemetry Off', teleOffTitle: 'Telemetry Offline', teleDisabledTitle: 'Telemetry Disabled',
        teleOffSub: 'Live metrics only · Synthetic fallback disabled',
        badgeDisabled: 'DISABLED', badgeOffline: 'OFFLINE', badgeTight: 'TIGHT', badgeOptimal: 'OPTIMAL',
        kv: 'KV ', free: 'Free ', specBtn: 'Spec',
        flipToSpec: 'Switch to MOD-01 Spec & Benchmarks', flipToTele: 'Switch to MOD-02 512K Telemetry',
        metaKicker: 'NATIVE MODEL METADATA', metaModel: 'MODEL', metaEffort: 'EFFORT', metaDefault: 'Default', metaId: 'TAG / ID',
        metaNote: 'Not listed in 2026Q4 benchmarks · Showing live host metadata',
        ttHead: '2026Q4 Benchmarks & Thinking Tiers',
        infoAria: 'Benchmark metrics and thinking tiers explanation',
        ttLines: ['AA v5: Artificial Analysis Intelligence Index (0-100)', 'TermBench: Autonomous terminal & CLI task accuracy (%)', 'HLE-D / GPQA-D: Frontier science & deep reasoning (%)', 'SWE-Pro / AutoBench: Real-world software engineering (%)', 'Effort: Low Fast · Med Balanced · High Deep · XHigh Max'],
        locked: 'Locked', hoverTag: 'Hover', activeTag: 'Active',
        orchTopo: 'Dual-Core Routing Topology', planner: 'PLANNER', runner: 'RUNNER',
        inFlowDock: 'In-Flow Dock', stage3d: '3D Stage',
        dockReturn: 'Return to In-Flow Desk Dock below Input Box (F)', stageExpand: 'Expand Fullscreen 3D Stage & Free Orbit (F)',
        unmute: 'Unmute Audio', mute: 'Mute Audio', closeDock: 'Collapse Dock (Esc / Enter)',
        auxPrev: 'Previous aux pad page', auxNext: 'Next aux pad page', pagePre: 'Page ', pageSuf: '',
        radarAxes: ['AA v5', 'TermBench', 'HLE-D', 'SWE-Pro', 'Velocity'],
        radarVerts: ['AA', 'Term', 'Sci', 'SWE', 'Speed'],
      },
      ja: {
        detailsOpen: '詳細 ▾', detailsClose: 'パネルを閉じる ▴',
        teleOff: '計測オフ', teleOffTitle: 'テレメトリ未接続', teleDisabledTitle: 'テレメトリ無効',
        teleOffSub: '実測コンテキスト指標のみ表示 · 擬似データ無効',
        badgeDisabled: '無効', badgeOffline: 'オフライン', badgeTight: '逼迫 TIGHT', badgeOptimal: '余裕 OPTIMAL',
        kv: 'KV ', free: '残 ', specBtn: '仕様',
        flipToSpec: 'MOD-01 ベンチマーク仕様へ戻る', flipToTele: 'MOD-02 512K リアルタイム計測へ切替',
        metaKicker: 'ネイティブモデルメタ情報', metaModel: 'モデル', metaEffort: '推論レベル', metaDefault: '既定', metaId: '識別子',
        metaNote: '2026Q4 ベンチ対象外 · ホスト実メタデータを表示中',
        ttHead: '2026Q4 評価指標と推論レベル説明',
        infoAria: '評価指標と推論レベルの説明',
        ttLines: ['AA v5：Artificial Analysis 総合知能指数 (100点満点)', 'TermBench：端末・CLI 自律修復成功率 (%)', 'HLE-D / GPQA-D：先端科学・多段推論正答率 (%)', 'SWE-Pro / AutoBench：実ソフトウェア修正率 (%)', '推論レベル：Low 高速 · Med 均衡 · High 深層 · XHigh 極限'],
        locked: 'ロック中', hoverTag: 'プレビュー', activeTag: '現在',
        orchTopo: 'デュアルコア経路トポロジ', planner: '計画コア', runner: '実行コア',
        inFlowDock: 'インラインドック', stage3d: '3Dステージ',
        dockReturn: '入力欄下のインラインドックへ戻す (F)', stageExpand: '全画面 3D ステージを展開して自由回転 (F)',
        unmute: 'メカニカル音を有効化', mute: 'ミュート', closeDock: 'ドックを閉じる (Esc / Enter)',
        auxPrev: '前のサブキーページ', auxNext: '次のサブキーページ', pagePre: '', pageSuf: ' ページ',
        radarAxes: ['AA v5', 'TermBench', 'HLE-D', 'SWE-Pro', '生成速度'],
        radarVerts: ['AA', 'Term', '科学', 'SWE', '速度'],
      },
      ko: {
        detailsOpen: '상세 ▾', detailsClose: '패널 접기 ▴',
        teleOff: '텔레메트리 꺼짐', teleOffTitle: '텔레메트리 오프라인', teleDisabledTitle: '텔레메트리 비활성',
        teleOffSub: '실시간 컨텍스트 지표만 표시 · 가상 데이터 비활성화',
        badgeDisabled: '꺼짐', badgeOffline: '오프라인', badgeTight: '부족 TIGHT', badgeOptimal: '여유 OPTIMAL',
        kv: '캐시 ', free: '여유 ', specBtn: '사양',
        flipToSpec: 'MOD-01 벤치마크 사양으로 전환', flipToTele: 'MOD-02 512K 실시간 텔레메트리로 전환',
        metaKicker: '기본 모델 메타데이터', metaModel: '모델', metaEffort: '추론 수준', metaDefault: '기본값', metaId: '태그 / ID',
        metaNote: '2026Q4 벤치마크 미등재 · 호스트 메타데이터 표시 중',
        ttHead: '2026Q4 벤치마크 및 사고 수준 안내',
        infoAria: '벤치마크 지표 및 사고 수준 안내',
        ttLines: ['AA v5: Artificial Analysis 종합 지능 지수 (0-100)', 'TermBench: 터미널·CLI 자율 작업 정확도 (%)', 'HLE-D / GPQA-D: 첨단 과학 및 심층 추론 (%)', 'SWE-Pro / AutoBench: 실제 소프트웨어 엔지니어링 (%)', '수준: Low 고속 · Med 균형 · High 심층 · XHigh 최대'],
        locked: '잠김', hoverTag: '미리보기', activeTag: '활성',
        orchTopo: '듀얼 코어 라우팅 토폴로지', planner: '플래너', runner: '러너',
        inFlowDock: '인라인 독', stage3d: '3D 스테이지',
        dockReturn: '입력창 아래 인라인 독으로 복귀 (F)', stageExpand: '전체 화면 3D 스테이지 및 자유 회전 (F)',
        unmute: '키캡 사운드 켜기', mute: '음소거', closeDock: '독 닫기 (Esc / Enter)',
        auxPrev: '이전 보조 키 페이지', auxNext: '다음 보조 키 페이지', pagePre: '', pageSuf: '페이지',
        radarAxes: ['AA v5', 'TermBench', 'HLE-D', 'SWE-Pro', '처리 속도'],
        radarVerts: ['AA', 'Term', '과학', 'SWE', '속도'],
      },
      es: {
        detailsOpen: 'Detalles ▾', detailsClose: 'Ocultar ▴',
        teleOff: 'Telemetría apagada', teleOffTitle: 'Telemetría desconectada', teleDisabledTitle: 'Telemetría desactivada',
        teleOffSub: 'Solo métricas reales · Datos sintéticos desactivados',
        badgeDisabled: 'APAGADA', badgeOffline: 'OFFLINE', badgeTight: 'JUSTO', badgeOptimal: 'ÓPTIMO',
        kv: 'KV ', free: 'Libre ', specBtn: 'Espec.',
        flipToSpec: 'Volver a especificaciones MOD-01', flipToTele: 'Cambiar a telemetría MOD-02 512K',
        metaKicker: 'METADATOS DEL MODELO', metaModel: 'MODELO', metaEffort: 'ESFUERZO', metaDefault: 'Predet.', metaId: 'TAG / ID',
        metaNote: 'Fuera de benchmarks 2026Q4 · Mostrando metadatos reales',
        ttHead: 'Benchmarks 2026Q4 y niveles de esfuerzo',
        infoAria: 'Explicación de métricas y niveles de razonamiento',
        ttLines: ['AA v5: Índice de inteligencia Artificial Analysis (0-100)', 'TermBench: Precisión autónoma en terminal y CLI (%)', 'HLE-D / GPQA-D: Ciencia de frontera y razonamiento (%)', 'SWE-Pro / AutoBench: Ingeniería de software real (%)', 'Esfuerzo: Low Rápido · Med Equil. · High Prof. · XHigh Máx'],
        locked: 'Bloqueado', hoverTag: 'Vista previa', activeTag: 'Activo',
        orchTopo: 'Topología de doble núcleo', planner: 'PLANIF.', runner: 'EJECUTOR',
        inFlowDock: 'Dock integrado', stage3d: 'Escena 3D',
        dockReturn: 'Volver al dock bajo el editor (F)', stageExpand: 'Expandir escena 3D y órbita libre (F)',
        unmute: 'Activar sonido', mute: 'Silenciar', closeDock: 'Contraer dock (Esc / Enter)',
        auxPrev: 'Página anterior', auxNext: 'Página siguiente', pagePre: 'Página ', pageSuf: '',
        radarAxes: ['AA v5', 'TermBench', 'HLE-D', 'SWE-Pro', 'Velocidad'],
        radarVerts: ['AA', 'Term', 'Cienc.', 'SWE', 'Vel.'],
      },
      fr: {
        detailsOpen: 'Détails ▾', detailsClose: 'Masquer ▴',
        teleOff: 'Télémétrie coupée', teleOffTitle: 'Télémétrie hors ligne', teleDisabledTitle: 'Télémétrie désactivée',
        teleOffSub: 'Métriques réelles uniquement · Secours synthétique coupé',
        badgeDisabled: 'COUPÉE', badgeOffline: 'HORS LIGNE', badgeTight: 'SERRÉ', badgeOptimal: 'OPTIMAL',
        kv: 'KV ', free: 'Libre ', specBtn: 'Spéc.',
        flipToSpec: 'Revenir au panneau MOD-01', flipToTele: 'Passer à la télémétrie MOD-02 512K',
        metaKicker: 'MÉTADONNÉES NATIVES', metaModel: 'MODÈLE', metaEffort: 'EFFORT', metaDefault: 'Défaut', metaId: 'TAG / ID',
        metaNote: 'Absent des benchmarks 2026Q4 · Métadonnées hôte réelles',
        ttHead: 'Benchmarks 2026Q4 et niveaux de réflexion',
        infoAria: 'Explication des benchmarks et niveaux de réflexion',
        ttLines: ['AA v5 : Indice d’intelligence Artificial Analysis (0-100)', 'TermBench : Précision autonome terminal & CLI (%)', 'HLE-D / GPQA-D : Science avancée & raisonnement (%)', 'SWE-Pro / AutoBench : Génie logiciel réel (%)', 'Effort : Low Rapide · Med Équil. · High Prof. · XHigh Max'],
        locked: 'Verrouillé', hoverTag: 'Aperçu', activeTag: 'Actif',
        orchTopo: 'Topologie double cœur', planner: 'PLANIF.', runner: 'EXÉC.',
        inFlowDock: 'Dock intégré', stage3d: 'Scène 3D',
        dockReturn: 'Revenir au dock sous la zone de saisie (F)', stageExpand: 'Agrandir la scène 3D en plein écran (F)',
        unmute: 'Activer le son', mute: 'Couper le son', closeDock: 'Fermer le dock (Esc / Enter)',
        auxPrev: 'Page précédente', auxNext: 'Page suivante', pagePre: 'Page ', pageSuf: '',
        radarAxes: ['AA v5', 'TermBench', 'HLE-D', 'SWE-Pro', 'Vélocité'],
        radarVerts: ['AA', 'Term', 'Sci', 'SWE', 'Vit.'],
      },
      de: {
        detailsOpen: 'Details ▾', detailsClose: 'Ausblenden ▴',
        teleOff: 'Telemetrie aus', teleOffTitle: 'Telemetrie offline', teleDisabledTitle: 'Telemetrie deaktiviert',
        teleOffSub: 'Nur Live-Kontextmetriken · Synthetik deaktiviert',
        badgeDisabled: 'AUS', badgeOffline: 'OFFLINE', badgeTight: 'KNAPP', badgeOptimal: 'OPTIMAL',
        kv: 'KV ', free: 'Frei ', specBtn: 'Daten',
        flipToSpec: 'Zurück zu MOD-01 Spezifikationen', flipToTele: 'Zu MOD-02 512K-Telemetrie wechseln',
        metaKicker: 'NATIVE MODELL-METADATEN', metaModel: 'MODELL', metaEffort: 'AUFWAND', metaDefault: 'Standard', metaId: 'TAG / ID',
        metaNote: 'Nicht in 2026Q4-Benchmarks · Zeige echte Host-Metadaten',
        ttHead: '2026Q4-Benchmarks & Denkstufen',
        infoAria: 'Erklärung zu Benchmarks und Denkstufen',
        ttLines: ['AA v5: Artificial Analysis Intelligence Index (0-100)', 'TermBench: Autonome Terminal- & CLI-Aufgaben (%)', 'HLE-D / GPQA-D: Spitzenwissenschaft & Tiefenlogik (%)', 'SWE-Pro / AutoBench: Reale Softwareentwicklung (%)', 'Aufwand: Low Schnell · Med Ausgew. · High Tief · XHigh Max'],
        locked: 'Gesperrt', hoverTag: 'Vorschau', activeTag: 'Aktiv',
        orchTopo: 'Dual-Core-Routingtopologie', planner: 'PLANER', runner: 'RUNNER',
        inFlowDock: 'Inline-Dock', stage3d: '3D-Bühne',
        dockReturn: 'Zurück zum Inline-Dock unter dem Eingabefeld (F)', stageExpand: 'Vollbild-3D-Bühne & freies Drehen (F)',
        unmute: 'Ton einschalten', mute: 'Stummschalten', closeDock: 'Dock schließen (Esc / Enter)',
        auxPrev: 'Vorherige Aux-Seite', auxNext: 'Nächste Aux-Seite', pagePre: 'Seite ', pageSuf: '',
        radarAxes: ['AA v5', 'TermBench', 'HLE-D', 'SWE-Pro', 'Tempo'],
        radarVerts: ['AA', 'Term', 'Wiss.', 'SWE', 'Tempo'],
      },
    };

    function normalizePeriodicLang(raw) {
      var s = String(raw || '').trim().toLowerCase().replace(/_/g, '-');
      if (!s || s === 'auto') return '';
      if (s === 'yue' || s.indexOf('yue-') === 0 || s === 'zh-yue' || s.indexOf('cantonese') !== -1) return 'zh-CN';
      if (/^zh-(tw|hant|hk|mo)/.test(s) || s === 'tw' || s === 'hant') return 'zh-TW';
      if (/^zh(?:$|-)/.test(s)) return 'zh-CN';
      if (/^(ja|jp)(?:$|-)/.test(s) || s === 'japanese') return 'ja';
      if (/^(ko|kr)(?:$|-)/.test(s) || s === 'korean') return 'ko';
      if (/^es(?:$|-)/.test(s) || s === 'spanish') return 'es';
      if (/^fr(?:$|-)/.test(s) || s === 'french') return 'fr';
      if (/^de(?:$|-)/.test(s) || s === 'german') return 'de';
      if (/^en(?:$|-)/.test(s) || s === 'english') return 'en';
      return '';
    }

    function resolveLocale(doc, rt) {
      try {
        var de = doc && doc.documentElement;
        var attr = (de && de.getAttribute && (de.getAttribute('data-ag-cs-lang') || de.getAttribute('lang'))) || '';
        var nAttr = normalizePeriodicLang(attr);
        if (nAttr) return nAttr;
        var navObj = rt && 'navigator' in rt ? rt.navigator : (typeof navigator !== 'undefined' ? navigator : null);
        var navLang = (navObj && navObj.language) || '';
        var nNav = normalizePeriodicLang(navLang);
        if (nNav) return nNav;
      } catch (e) {}
      return 'en';
    }

    function getBentoI18nPack(langOrZh) {
      if (typeof langOrZh === 'string') {
        return BENTO_I18N[normalizePeriodicLang(langOrZh) || langOrZh] || BENTO_I18N.en;
      }
      if (langOrZh === true) return BENTO_I18N['zh-CN'];
      return BENTO_I18N.en;
    }

    var CORE_FOUR_ELEMENTS = [
      { slotZ: 1, symbol: 'H' },
      { slotZ: 6, symbol: 'C' },
      { slotZ: 10, symbol: 'Ne' },
      { slotZ: 18, symbol: 'Ar' },
    ];

    var MINI_BADGE_SOUL_HEX = {
      1: { dark: '#56C8FA', light: '#0284C7' },
      6: { dark: '#669DF6', light: '#2563EB' },
      10: { dark: '#F4845F', light: '#D95D24' },
      18: { dark: '#9B7DF7', light: '#6D28D9' },
      orchestrator: { dark: '#E2B354', light: '#A16207' },
      flash: { dark: '#38BDF8', light: '#0284C7' },
      claude: { dark: '#DF8458', light: '#B45309' },
      gpt: { dark: '#4FD1C5', light: '#0F766E' },
      fallback: { dark: '#8EA4C8', light: '#475569' },
    };

    var MINI_BADGE_THEME_SUBSTRATES = {
      'obsidian-dark': {
        surfaceRgb: [255, 255, 255],
        surfaceBaseAlpha: 0.038,
        tintSurfaceAlpha: 0.092,
        borderRgb: [218, 228, 255],
        borderAlpha: 0.19,
        fgRgb: [204, 212, 226],
        fgTintMix: 0.36,
        borderTintMix: 0.28,
      },
      'warm-dark': {
        surfaceRgb: [245, 236, 222],
        surfaceBaseAlpha: 0.046,
        tintSurfaceAlpha: 0.096,
        borderRgb: [232, 206, 174],
        borderAlpha: 0.22,
        fgRgb: [218, 208, 194],
        fgTintMix: 0.38,
        borderTintMix: 0.30,
      },
      'crystal-light': {
        surfaceRgb: [15, 23, 42],
        surfaceBaseAlpha: 0.056,
        tintSurfaceAlpha: 0.096,
        borderRgb: [15, 23, 42],
        borderAlpha: 0.22,
        fgRgb: [26, 36, 52],
        fgTintMix: 0.24,
        borderTintMix: 0.26,
      },
      'alabaster-light': {
        surfaceRgb: [42, 32, 20],
        surfaceBaseAlpha: 0.062,
        tintSurfaceAlpha: 0.096,
        borderRgb: [42, 32, 20],
        borderAlpha: 0.23,
        fgRgb: [36, 30, 24],
        fgTintMix: 0.22,
        borderTintMix: 0.24,
      },
    };

    var HUD_GEM_STYLES = {
      1: {
        dot: 'linear-gradient(135deg, #38BDF8 0%, #7DD3FC 55%, #BAE6FD 100%)',
        glow: 'rgba(56, 189, 248, 0.36)',
        ring: 'rgba(56, 189, 248, 0.24)',
        haloDark: 'rgba(56, 189, 248, 0.032)',
        haloLight: 'rgba(2, 132, 199, 0.024)',
      },
      6: {
        dot: 'linear-gradient(135deg, #2563EB 0%, #3B82F6 50%, #67E8F9 100%)',
        glow: 'rgba(59, 130, 246, 0.38)',
        ring: 'rgba(96, 165, 250, 0.26)',
        haloDark: 'rgba(59, 130, 246, 0.034)',
        haloLight: 'rgba(29, 78, 216, 0.024)',
      },
      10: {
        dot: 'linear-gradient(135deg, #FF5A3D 0%, #FF6B4A 52%, #FFB347 100%)',
        glow: 'rgba(255, 107, 74, 0.38)',
        ring: 'rgba(255, 138, 92, 0.25)',
        haloDark: 'rgba(255, 107, 74, 0.032)',
        haloLight: 'rgba(234, 88, 12, 0.024)',
      },
      18: {
        dot: 'linear-gradient(135deg, #3B66F5 0%, #7C5CFF 55%, #A78BFA 100%)',
        glow: 'rgba(124, 92, 255, 0.38)',
        ring: 'rgba(139, 92, 246, 0.26)',
        haloDark: 'rgba(124, 92, 255, 0.034)',
        haloLight: 'rgba(109, 40, 217, 0.024)',
      },
      fallback: {
        dot: 'linear-gradient(180deg, #60A5FA 0%, #3B82F6 100%)',
        glow: 'rgba(59, 130, 246, 0.34)',
        ring: 'rgba(96, 165, 250, 0.22)',
        haloDark: 'rgba(59, 130, 246, 0.048)',
        haloLight: 'rgba(37, 99, 235, 0.036)',
      },
      monoDark: {
        dot: 'linear-gradient(180deg, #F1F5F9 0%, #CBD5E1 100%)',
        glow: 'rgba(226, 232, 240, 0.36)',
        ring: 'rgba(226, 232, 240, 0.22)',
        haloDark: 'rgba(208, 216, 230, 0.058)',
        haloLight: 'rgba(100, 116, 139, 0.045)',
      },
      monoLight: {
        dot: 'linear-gradient(180deg, #334155 0%, #0F172A 100%)',
        glow: 'rgba(51, 65, 85, 0.26)',
        ring: 'rgba(51, 65, 85, 0.18)',
        haloDark: 'rgba(208, 216, 230, 0.058)',
        haloLight: 'rgba(71, 85, 105, 0.045)',
      },
    };

    var PICKER_CSS = [
      /* V14 PRISM-118 Precision Hardware Desk Console · Google Official Dual-Tone Spectrum */
      '#ag-prism-periodic-picker-root{',
      'position:fixed;inset:0;z-index:2147483640;display:flex;flex-direction:column;align-items:center;justify-content:center;',
      'gap:8px;padding:10px 12px;box-sizing:border-box;overflow:hidden;isolation:isolate;contain:layout style paint;',
      'font-family:"Inter","SF Pro Display","Plus Jakarta Sans",-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Noto Sans SC",sans-serif;',
      '--pp-ambient-mul:1;',
      '--ag-pp-model-accent:#3B82F6;--ag-pp-model-secondary:#67E8F9;--ag-pp-model-grad:linear-gradient(90deg,#3B82F6 0%,#67E8F9 100%);--ag-pp-model-glow:rgba(59,130,246,0.32);',
      '--pp-elem-halo:rgba(226,232,240,0.02);--pp-elem-ring:rgba(226,232,240,0.24);',
      '--pp-spatial-scrim:radial-gradient(ellipse 74% 64% at 50% 44%,rgba(22,26,34,0.88) 0%,rgba(12,14,19,0.95) 54%,rgba(5,7,10,0.985) 100%);',
      '--pp-felt-bg:linear-gradient(180deg,rgba(0,0,0,0.22) 0%,rgba(0,0,0,0) 18px),radial-gradient(ellipse 72% 85% at 50% 18%,rgba(255,255,255,0.032) 0%,rgba(255,255,255,0.006) 48%,rgba(0,0,0,0.34) 100%),repeating-linear-gradient(45deg,rgba(255,255,255,0.014) 0px,rgba(255,255,255,0.014) 1px,transparent 1px,transparent 3px),repeating-linear-gradient(-45deg,rgba(0,0,0,0.075) 0px,rgba(0,0,0,0.075) 1px,transparent 1px,transparent 3px),linear-gradient(180deg,#181A1F 0%,#121418 100%);',
      '--pp-dock-hairline:rgba(218,228,242,0.12);--pp-grip-bg:rgba(220,228,240,0.22);',
      '--pp-cnc-shell:linear-gradient(168deg,#3B4049 0%,#2B3038 36%,#20242B 100%);',
      '--pp-cnc-border:rgba(196,208,224,0.22);--pp-cnc-chamfer-top:rgba(244,248,255,0.44);--pp-cnc-chamfer-bot:rgba(0,0,0,0.72);',
      '--pp-cnc-shadow:0 6px 14px rgba(0,0,0,0.44);--pp-cnc-engraving:rgba(210,218,230,0.52);',
      '--pp-screen-bg:linear-gradient(180deg,#0A0C10 0%,#0E1116 100%);--pp-screen-border:rgba(255,255,255,0.08);',
      '--pp-screen-inset:inset 0 2px 7px rgba(0,0,0,0.72),inset 0 0 0 1px rgba(0,0,0,0.55);',
      '--pp-btn-well-bg:linear-gradient(180deg,#12151B 0%,#181C24 100%);',
      '--pp-btn-metal:linear-gradient(165deg,#4B525E 0%,#303640 52%,#22262E 100%);',
      '--pp-btn-metal-hover:linear-gradient(165deg,#5A6372 0%,#3A414D 52%,#292E38 100%);--pp-btn-metal-fg:#E8EEF6;',
      '--pp-bento-fg:#F5F7FA;--pp-bento-sub:#B6C0CE;--pp-bento-dim:#7C8798;',
      '--pp-bento-pill-bg:rgba(255,255,255,0.055);--pp-bento-pill-border:rgba(255,255,255,0.13);',
      '--pp-bento-pill-active:rgba(240,245,252,0.16);--pp-bento-track:rgba(255,255,255,0.10);',
      '--pp-seg-active-bg:linear-gradient(180deg,rgba(255,255,255,0.145) 0%,rgba(255,255,255,0.085) 100%);--pp-seg-active-fg:#F8FAFC;--pp-seg-active-border:rgba(255,255,255,0.22);--pp-seg-active-shadow:inset 0 1px 0 rgba(255,255,255,0.32),inset 0 -1px 0 rgba(0,0,0,0.44),0 1px 3px rgba(0,0,0,0.36);',
      '--pp-rim-core:rgba(255,255,255,0.92);--pp-rim-ice:rgba(214,226,244,0.48);--pp-rim-violet:rgba(168,180,200,0.16);',
      '--pp-contact-shadow:radial-gradient(ellipse 46% 24% at 50% 56%,rgba(0,0,0,0.58) 0%,rgba(0,0,0,0.34) 36%,rgba(0,0,0,0.12) 64%,rgba(0,0,0,0) 92%);',
      '--pp-levitation-shadow:radial-gradient(ellipse 56% 38% at 50% 64%,rgba(0,0,0,0.48) 0%,rgba(0,0,0,0.28) 32%,rgba(0,0,0,0.11) 60%,rgba(0,0,0,0.03) 80%,rgba(0,0,0,0) 100%);',
      '--pp-topo-color:rgba(176,192,214,0.30);--pp-topo-mul:0.035;',
      '--pp-hud-bg:linear-gradient(180deg,rgba(36,40,48,0.88) 0%,rgba(22,25,31,0.94) 100%);',
      '--pp-hud-border:rgba(218,228,242,0.18);--pp-hud-top-gleam:rgba(255,255,255,0.28);--pp-hud-bottom-lip:rgba(0,0,0,0.52);',
      '--pp-hud-shadow:rgba(0,0,0,0.44);--pp-hud-fg:#F5F7FA;--pp-hud-muted:#B6C0CE;--pp-hud-hover-fg:#FFFFFF;',
      '--pp-reset-active-bg:linear-gradient(180deg,#3C434F 0%,#262B33 100%);--pp-reset-active-ring:rgba(226,234,246,0.48);',
      '--pp-reset-active-shadow:inset 0 1px 0 rgba(255,255,255,0.46),0 8px 20px rgba(0,0,0,0.46);',
      '--pp-reset-kbd-bg:rgba(255,255,255,0.09);--pp-reset-kbd-border:rgba(255,255,255,0.16);--pp-focus-ring:rgba(226,236,248,0.58);',
      '--pp-tooltip-bg:rgba(13,16,22,0.96);--pp-tooltip-border:rgba(218,228,242,0.20);',
      '--pp-orch-bus:#F0BD5E;--pp-orch-ret:#B494F6;--pp-orch-node:#151224;',
      '--pp-orch-box-bd:rgba(168,132,232,0.44);--pp-orch-box-bg:rgba(158,122,224,0.10);',
      '--pp-orch-run-bd:rgba(125,211,252,0.36);--pp-orch-run-bg:rgba(125,211,252,0.08);',
      'background:var(--pp-spatial-scrim);',
      'opacity:0;transition:opacity 180ms cubic-bezier(0.2,0,0,1);',
      '}',
      '#ag-prism-periodic-picker-root[data-open="1"]{opacity:1;}',
      '#ag-prism-periodic-picker-root[data-stage-mode="drawer"]{',
      'position:relative;inset:auto;z-index:24;flex:0 0 auto;width:100%;height:0px;',
      'display:flex;flex-direction:column;align-items:stretch;justify-content:flex-start;',
      'padding:0;gap:0;overflow:hidden;border-top:1px solid var(--pp-dock-hairline);',
      'background:var(--pp-felt-bg);box-shadow:none;',
      'transition:height 300ms cubic-bezier(0.22,1,0.36,1),opacity 180ms ease;',
      '}',
      '#ag-prism-periodic-picker-root[data-stage-mode="drawer"][data-in-flow="0"]{position:fixed;left:0;right:0;bottom:0;top:auto;z-index:2147483640;}',
      '#ag-prism-periodic-picker-root[data-stage-mode="drawer"][data-open="1"]{height:clamp(336px,38vh,392px);max-height:calc(100vh - 176px);opacity:1;}',
      '#ag-prism-periodic-picker-root[data-stage-mode="drawer"][data-dock-tier="medium"][data-open="1"]{height:clamp(368px,43vh,422px);max-height:calc(100vh - 176px);}',
      '#ag-prism-periodic-picker-root[data-stage-mode="drawer"][data-short-viewport="1"][data-open="1"]{height:var(--ag-pp-short-dock-h,236px) !important;max-height:calc(100vh - 176px);}',
      '#ag-prism-periodic-picker-root[data-stage-mode="drawer"][data-short-viewport="1"] .ag-pp-spatial-dock{padding:6px 10px 6px;gap:8px;}',
      '#ag-prism-periodic-picker-root[data-stage-mode="drawer"][data-short-viewport="1"] .ag-pp-stage{min-height:0 !important;}',
      '#ag-prism-periodic-picker-root[data-stage-mode="drawer"][data-short-viewport="1"] .ag-pp-micro-tags,#ag-prism-periodic-picker-root[data-stage-mode="drawer"][data-short-viewport="1"] .ag-pp-source-row,#ag-prism-periodic-picker-root[data-stage-mode="drawer"][data-short-viewport="1"] .ag-pp-tele-subscreen,#ag-prism-periodic-picker-root[data-stage-mode="drawer"][data-short-viewport="1"] .ag-pp-pulse-svg{display:none;}',
      '#ag-prism-periodic-picker-root[data-stage-mode="drawer"][data-short-viewport="1"] .ag-pp-radar-pane{grid-template-columns:68px minmax(0,1fr);gap:4px;}',
      '#ag-prism-periodic-picker-root[data-stage-mode="drawer"][data-short-viewport="1"] .ag-pp-radar-svg{width:66px;height:66px;}',
      '@media (max-height:560px){#ag-prism-periodic-picker-root[data-stage-mode="drawer"][data-open="1"]{height:clamp(184px,45vh,252px) !important;max-height:calc(100vh - 176px);}#ag-prism-periodic-picker-root[data-stage-mode="drawer"] .ag-pp-spatial-dock{padding:6px 10px 6px;gap:8px;}#ag-prism-periodic-picker-root[data-stage-mode="drawer"] .ag-pp-stage{min-height:0 !important;}#ag-prism-periodic-picker-root[data-stage-mode="drawer"] .ag-pp-micro-tags,#ag-prism-periodic-picker-root[data-stage-mode="drawer"] .ag-pp-source-row,#ag-prism-periodic-picker-root[data-stage-mode="drawer"] .ag-pp-tele-subscreen,#ag-prism-periodic-picker-root[data-stage-mode="drawer"] .ag-pp-pulse-svg{display:none;}#ag-prism-periodic-picker-root[data-stage-mode="drawer"] .ag-pp-radar-pane{grid-template-columns:68px minmax(0,1fr);gap:4px;}#ag-prism-periodic-picker-root[data-stage-mode="drawer"] .ag-pp-radar-svg{width:66px;height:66px;}}',
      '#ag-prism-periodic-picker-root[data-stage-mode="drawer"][data-closing="1"]{height:0px !important;opacity:0;transition:height 260ms cubic-bezier(0.32,0,0.67,0),opacity 180ms ease;}',
      '#ag-prism-periodic-picker-root[data-stage-mode="drawer"] > .ag-pp-deskmat-stage{opacity:0;pointer-events:none;}',
      '#ag-prism-periodic-picker-root[data-orbit-dragging="1"],#ag-prism-periodic-picker-root[data-orbit-dragging="1"] *{cursor:grabbing !important;}',
      '#ag-prism-periodic-picker-root[data-orbit-dragging="1"] .ag-pp-hit-layer .ag-pp-hit-btn{pointer-events:none !important;}',
      '#ag-prism-periodic-picker-root[data-gl-stage="1"] .ag-pp-hit-layer .ag-pp-hit-btn{pointer-events:none !important;}',
      '#ag-prism-periodic-picker-root[data-effort-dragging="1"],#ag-prism-periodic-picker-root[data-effort-dragging="1"] *{cursor:ew-resize !important;}',
      /* Warm Dark Bronze-Titanium CNC + Champagne Chamfer */
      '#ag-prism-periodic-picker-root[data-kit="warm-dark"]{',
      '--pp-spatial-scrim:radial-gradient(ellipse 74% 64% at 50% 44%,rgba(28,22,18,0.89) 0%,rgba(16,12,10,0.955) 54%,rgba(8,6,5,0.985) 100%);',
      '--pp-felt-bg:linear-gradient(180deg,rgba(0,0,0,0.22) 0%,rgba(0,0,0,0) 18px),radial-gradient(ellipse 72% 85% at 50% 18%,rgba(255,240,218,0.036) 0%,rgba(255,240,218,0.008) 48%,rgba(0,0,0,0.36) 100%),repeating-linear-gradient(45deg,rgba(255,240,218,0.015) 0px,rgba(255,240,218,0.015) 1px,transparent 1px,transparent 3px),repeating-linear-gradient(-45deg,rgba(0,0,0,0.08) 0px,rgba(0,0,0,0.08) 1px,transparent 1px,transparent 3px),linear-gradient(180deg,#1C1714 0%,#14100E 100%);',
      '--pp-dock-hairline:rgba(232,202,162,0.14);--pp-grip-bg:rgba(232,202,162,0.24);',
      '--pp-cnc-shell:linear-gradient(168deg,#42362D 0%,#302720 38%,#221B16 100%);',
      '--pp-cnc-border:rgba(224,194,154,0.24);--pp-cnc-chamfer-top:rgba(252,232,200,0.46);--pp-cnc-chamfer-bot:rgba(0,0,0,0.74);',
      '--pp-cnc-engraving:rgba(226,204,174,0.55);',
      '--pp-screen-bg:linear-gradient(180deg,#0C0A08 0%,#120E0B 100%);--pp-screen-border:rgba(245,224,196,0.09);',
      '--pp-btn-well-bg:linear-gradient(180deg,#171310 0%,#1F1915 100%);',
      '--pp-btn-metal:linear-gradient(165deg,#544539 0%,#392E26 52%,#261E19 100%);',
      '--pp-btn-metal-hover:linear-gradient(165deg,#645345 0%,#45382E 52%,#2F261F 100%);',
      '--pp-btn-metal-fg:#FAF3E8;--pp-bento-fg:#FAF5EE;--pp-bento-sub:#CEC0B0;--pp-bento-dim:#948474;',
      '--pp-seg-active-bg:linear-gradient(180deg,rgba(252,232,202,0.155) 0%,rgba(230,196,154,0.088) 100%);--pp-seg-active-fg:#FFF8EE;--pp-seg-active-border:rgba(244,214,174,0.24);--pp-seg-active-shadow:inset 0 1px 0 rgba(255,242,220,0.30),inset 0 -1px 0 rgba(0,0,0,0.48),0 1px 3px rgba(0,0,0,0.40);',
      '--pp-rim-core:rgba(255,244,226,0.92);--pp-rim-ice:rgba(236,196,144,0.48);--pp-rim-violet:rgba(200,152,108,0.16);',
      '--pp-tooltip-bg:rgba(20,16,13,0.97);--pp-tooltip-border:rgba(232,202,162,0.22);',
      '}',
      /* Crystal Light — Silver Anodized CNC Aluminum */
      '#ag-prism-periodic-picker-root[data-kit="crystal-light"]{',
      '--pp-spatial-scrim:radial-gradient(ellipse 74% 64% at 50% 44%,rgba(234,239,246,0.91) 0%,rgba(218,225,235,0.96) 54%,rgba(202,210,224,0.985) 100%);',
      '--pp-felt-bg:linear-gradient(180deg,rgba(24,36,56,0.10) 0%,rgba(24,36,56,0) 16px),radial-gradient(ellipse 76% 88% at 50% 16%,rgba(255,255,255,0.34) 0%,rgba(255,255,255,0.06) 52%,rgba(100,112,130,0.12) 100%),repeating-linear-gradient(45deg,rgba(255,255,255,0.14) 0px,rgba(255,255,255,0.14) 1px,transparent 1px,transparent 3px),repeating-linear-gradient(-45deg,rgba(40,52,70,0.036) 0px,rgba(40,52,70,0.036) 1px,transparent 1px,transparent 3px),linear-gradient(180deg,#D8DDE5 0%,#CFD5DF 100%);',
      '--pp-dock-hairline:rgba(25,35,52,0.13);--pp-grip-bg:rgba(30,41,59,0.20);',
      '--pp-cnc-shell:linear-gradient(168deg,#F2F5F9 0%,#E1E6EE 44%,#CFD6E1 100%);',
      '--pp-cnc-border:rgba(15,23,42,0.14);--pp-cnc-chamfer-top:rgba(255,255,255,0.98);--pp-cnc-chamfer-bot:rgba(51,65,85,0.22);',
      '--pp-cnc-shadow:0 5px 12px rgba(24,36,56,0.15);--pp-cnc-engraving:rgba(48,58,74,0.68);',
      '--pp-screen-bg:linear-gradient(180deg,#F9FBFE 0%,#EEF2F8 100%);--pp-screen-border:rgba(15,23,42,0.10);',
      '--pp-screen-inset:inset 0 1.5px 4px rgba(15,23,42,0.10),inset 0 0 0 1px rgba(15,23,42,0.06);',
      '--pp-btn-well-bg:linear-gradient(180deg,#D2D9E3 0%,#E0E6EF 100%);',
      '--pp-btn-metal:linear-gradient(165deg,#FFFFFF 0%,#E6EBF2 52%,#CED6E2 100%);',
      '--pp-btn-metal-hover:linear-gradient(165deg,#FFFFFF 0%,#F2F6FB 52%,#DCE3EE 100%);',
      '--pp-btn-metal-fg:#18202C;--pp-bento-fg:#111827;--pp-bento-sub:#3B4657;--pp-bento-dim:#606D80;',
      '--pp-bento-pill-bg:rgba(15,23,42,0.055);--pp-bento-pill-border:rgba(15,23,42,0.14);',
      '--pp-bento-pill-active:#FFFFFF;--pp-bento-track:rgba(15,23,42,0.11);',
      '--pp-seg-active-bg:linear-gradient(180deg,#FFFFFF 0%,#F0F4FA 100%);--pp-seg-active-fg:#0F172A;--pp-seg-active-border:rgba(15,23,42,0.18);--pp-seg-active-shadow:0 1px 3px rgba(15,23,42,0.14),0 0.5px 1px rgba(15,23,42,0.08),inset 0 1px 0 #FFFFFF;',
      '--pp-rim-core:rgba(255,255,255,0.98);--pp-rim-ice:rgba(96,136,214,0.44);--pp-rim-violet:rgba(59,130,246,0.16);',
      '--pp-contact-shadow:radial-gradient(ellipse 46% 24% at 50% 56%,rgba(24,36,56,0.22) 0%,rgba(24,36,56,0.12) 38%,rgba(24,36,56,0.04) 68%,rgba(24,36,56,0) 94%);',
      '--pp-levitation-shadow:radial-gradient(ellipse 56% 38% at 50% 64%,rgba(24,36,56,0.20) 0%,rgba(24,36,56,0.11) 34%,rgba(24,36,56,0.04) 64%,rgba(24,36,56,0) 100%);',
      '--pp-hud-bg:linear-gradient(180deg,rgba(250,252,255,0.90) 0%,rgba(232,238,246,0.95) 100%);',
      '--pp-hud-border:rgba(15,23,42,0.14);--pp-hud-top-gleam:#FFFFFF;--pp-hud-bottom-lip:rgba(15,23,42,0.08);',
      '--pp-hud-shadow:rgba(15,23,42,0.14);--pp-hud-fg:#0F172A;--pp-hud-muted:#334155;--pp-hud-hover-fg:#0F172A;',
      '--pp-reset-active-bg:linear-gradient(180deg,#FFFFFF 0%,#EDF2FA 100%);--pp-reset-active-ring:rgba(37,99,235,0.42);',
      '--pp-reset-active-shadow:inset 0 1px 0 #FFFFFF,0 6px 16px rgba(15,23,42,0.14);',
      '--pp-reset-kbd-bg:rgba(15,23,42,0.06);--pp-reset-kbd-border:rgba(15,23,42,0.14);--pp-focus-ring:rgba(37,99,235,0.46);',
      '--pp-tooltip-bg:rgba(250,252,255,0.98);--pp-tooltip-border:rgba(15,23,42,0.16);',
      '--pp-orch-bus:#C2780E;--pp-orch-ret:#6D28D9;--pp-orch-node:#FFFFFF;',
      '--pp-orch-box-bd:rgba(109,40,217,0.32);--pp-orch-box-bg:rgba(124,58,237,0.07);',
      '--pp-orch-run-bd:rgba(2,132,199,0.32);--pp-orch-run-bg:rgba(14,165,233,0.07);',
      '}',
      /* Alabaster Light — Braun / Studio Warm Silver CNC Aluminum */
      '#ag-prism-periodic-picker-root[data-kit="alabaster-light"]{',
      '--pp-spatial-scrim:radial-gradient(ellipse 74% 64% at 50% 44%,rgba(232,228,221,0.91) 0%,rgba(216,211,202,0.96) 54%,rgba(200,194,184,0.985) 100%);',
      '--pp-felt-bg:linear-gradient(180deg,rgba(42,36,28,0.10) 0%,rgba(42,36,28,0) 16px),radial-gradient(ellipse 76% 88% at 50% 16%,rgba(255,254,250,0.34) 0%,rgba(255,253,248,0.06) 52%,rgba(90,82,70,0.12) 100%),repeating-linear-gradient(45deg,rgba(255,255,255,0.14) 0px,rgba(255,255,255,0.14) 1px,transparent 1px,transparent 3px),repeating-linear-gradient(-45deg,rgba(60,52,42,0.042) 0px,rgba(60,52,42,0.042) 1px,transparent 1px,transparent 3px),linear-gradient(180deg,#D6D2C9 0%,#CBC6BC 100%);',
      '--pp-dock-hairline:rgba(48,42,34,0.14);--pp-grip-bg:rgba(58,50,40,0.22);',
      '--pp-cnc-shell:linear-gradient(168deg,#F4F3EF 0%,#E4E2DC 44%,#D3D0C8 100%);',
      '--pp-cnc-border:rgba(40,36,30,0.15);--pp-cnc-chamfer-top:rgba(255,255,255,0.98);--pp-cnc-chamfer-bot:rgba(68,62,52,0.24);',
      '--pp-cnc-shadow:0 5px 12px rgba(42,36,28,0.15);--pp-cnc-engraving:rgba(56,52,46,0.70);',
      '--pp-screen-bg:linear-gradient(180deg,#FAF9F6 0%,#F0EEE9 100%);--pp-screen-border:rgba(40,36,30,0.10);',
      '--pp-screen-inset:inset 0 1.5px 4px rgba(40,36,30,0.10),inset 0 0 0 1px rgba(40,36,30,0.06);',
      '--pp-btn-well-bg:linear-gradient(180deg,#D6D3CB 0%,#E4E1DA 100%);',
      '--pp-btn-metal:linear-gradient(165deg,#FFFFFF 0%,#EAE8E2 52%,#D4D1C9 100%);',
      '--pp-btn-metal-hover:linear-gradient(165deg,#FFFFFF 0%,#F5F3EE 52%,#E0DDD5 100%);',
      '--pp-btn-metal-fg:#1B1C20;--pp-bento-fg:#15161A;--pp-bento-sub:#42444B;--pp-bento-dim:#666972;',
      '--pp-bento-pill-bg:rgba(28,30,36,0.055);--pp-bento-pill-border:rgba(28,30,36,0.14);',
      '--pp-bento-pill-active:#FFFFFF;--pp-bento-track:rgba(28,30,36,0.12);',
      '--pp-seg-active-bg:linear-gradient(180deg,#FFFFFF 0%,#F4F2ED 100%);--pp-seg-active-fg:#14161B;--pp-seg-active-border:rgba(32,34,40,0.18);--pp-seg-active-shadow:0 1px 3px rgba(40,36,28,0.15),0 0.5px 1px rgba(40,36,28,0.09),inset 0 1px 0 #FFFFFF;',
      '--pp-rim-core:rgba(255,255,255,0.98);--pp-rim-ice:rgba(120,136,162,0.40);--pp-rim-violet:rgba(59,130,246,0.14);',
      '--pp-contact-shadow:radial-gradient(ellipse 46% 24% at 50% 56%,rgba(42,36,28,0.22) 0%,rgba(42,36,28,0.12) 38%,rgba(42,36,28,0.04) 68%,rgba(42,36,28,0) 94%);',
      '--pp-levitation-shadow:radial-gradient(ellipse 56% 38% at 50% 64%,rgba(42,36,28,0.20) 0%,rgba(42,36,28,0.11) 34%,rgba(42,36,28,0.04) 64%,rgba(42,36,28,0) 100%);',
      '--pp-hud-bg:linear-gradient(180deg,rgba(252,251,248,0.92) 0%,rgba(236,233,226,0.96) 100%);',
      '--pp-hud-border:rgba(40,36,30,0.14);--pp-hud-top-gleam:#FFFFFF;--pp-hud-bottom-lip:rgba(40,36,30,0.08);',
      '--pp-hud-shadow:rgba(40,36,30,0.14);--pp-hud-fg:#15161A;--pp-hud-muted:#42444B;--pp-hud-hover-fg:#15161A;',
      '--pp-reset-active-bg:linear-gradient(180deg,#FFFFFF 0%,#F3F1EC 100%);--pp-reset-active-ring:rgba(37,99,235,0.38);',
      '--pp-reset-active-shadow:inset 0 1px 0 #FFFFFF,0 6px 16px rgba(40,36,30,0.14);',
      '--pp-reset-kbd-bg:rgba(40,36,30,0.06);--pp-reset-kbd-border:rgba(40,36,30,0.14);--pp-focus-ring:rgba(37,99,235,0.44);',
      '--pp-tooltip-bg:rgba(252,251,248,0.98);--pp-tooltip-border:rgba(40,36,30,0.16);',
      '--pp-orch-bus:#B45309;--pp-orch-ret:#6D28D9;--pp-orch-node:#FAF9F6;',
      '--pp-orch-box-bd:rgba(109,40,217,0.32);--pp-orch-box-bg:rgba(124,58,237,0.07);',
      '--pp-orch-run-bd:rgba(2,132,199,0.32);--pp-orch-run-bg:rgba(14,165,233,0.07);',
      '}',
      '#ag-prism-periodic-picker-root[data-mono="1"]{',
      '--pp-orch-bus:#D4D8E0;--pp-orch-ret:#9CA3AF;--pp-orch-node:#12151B;',
      '--pp-orch-box-bd:rgba(203,213,225,0.32);--pp-orch-box-bg:rgba(226,232,240,0.06);',
      '--pp-orch-run-bd:rgba(148,163,184,0.28);--pp-orch-run-bg:rgba(148,163,184,0.05);',
      '}',
      '#ag-prism-periodic-picker-root[data-kit="crystal-light"][data-mono="1"],#ag-prism-periodic-picker-root[data-kit="alabaster-light"][data-mono="1"]{',
      '--pp-orch-bus:#334155;--pp-orch-ret:#64748B;--pp-orch-node:#FFFFFF;',
      '--pp-orch-box-bd:rgba(51,65,85,0.26);--pp-orch-box-bg:rgba(51,65,85,0.05);',
      '--pp-orch-run-bd:rgba(71,85,105,0.24);--pp-orch-run-bg:rgba(71,85,105,0.04);',
      '}',
      '#ag-prism-periodic-picker-root[data-kit="crystal-light"][data-stage-mode="drawer"],#ag-prism-periodic-picker-root[data-kit="alabaster-light"][data-stage-mode="drawer"]{backdrop-filter:none;-webkit-backdrop-filter:none;}',
      '.ag-pp-dock-top-rim{',
      'position:absolute;left:0;right:0;top:0;height:1.5px;pointer-events:none;z-index:8;contain:strict;opacity:var(--ag-pp-dock-rim-alpha,0);transition:opacity 80ms linear;',
      'background:radial-gradient(176px circle at var(--ag-pp-px,-999px) 0px,var(--pp-rim-core) 0%,var(--pp-rim-ice) 44%,var(--pp-rim-violet) 76%,transparent 100%);',
      '}',
      '#ag-prism-periodic-picker-root[data-stage-mode="drawer"][data-pointer-near="1"] .ag-pp-dock-top-rim{opacity:var(--ag-pp-dock-rim-alpha,0);}',
      '.ag-pp-dock-grip{',
      'position:absolute;top:4px;left:50%;transform:translateX(-50%);width:30px;height:2.5px;border-radius:999px;',
      'background:var(--pp-grip-bg);pointer-events:none;z-index:7;',
      '}',
      '#ag-prism-periodic-picker-root[data-stage-mode="fullscreen"] .ag-pp-dock-top-rim,#ag-prism-periodic-picker-root[data-stage-mode="fullscreen"] .ag-pp-dock-grip{display:none;}',
      '.ag-pp-spatial-dock{',
      'position:relative;z-index:2;display:flex;flex-direction:row;align-items:stretch;justify-content:space-between;',
      'width:100%;max-width:none;height:100%;flex:1 1 auto;min-height:0;',
      'padding:11px 14px 10px;gap:12px;border-radius:0;box-sizing:border-box;',
      'background:transparent;border:0;box-shadow:none;',
      '}',
      '.ag-pp-bento-grid,.ag-pp-stage,.ag-pp-right-wing{',
      'opacity:0;transform:translate3d(0,8px,0);',
      'transition:opacity 240ms cubic-bezier(0.22,1,0.36,1),transform 260ms cubic-bezier(0.22,1,0.36,1);',
      '}',
      '.ag-pp-bento-grid{transition-delay:0ms;}',
      '.ag-pp-stage{transition-delay:40ms;}',
      '.ag-pp-right-wing{transition-delay:80ms;}',
      '#ag-prism-periodic-picker-root[data-open="1"] .ag-pp-bento-grid,#ag-prism-periodic-picker-root[data-open="1"] .ag-pp-stage,#ag-prism-periodic-picker-root[data-open="1"] .ag-pp-right-wing{',
      'opacity:1;transform:translate3d(0,0,0);',
      '}',
      '.ag-pp-bento-grid{position:relative;z-index:4;flex:0 0 clamp(284px,24.8%,338px);width:clamp(284px,24.8%,338px);height:100%;min-width:0;display:flex;flex-direction:column;contain:layout style;}',
      '.ag-pp-flip-inner{position:relative;width:100%;height:100%;display:flex;flex-direction:column;}',
      '.ag-pp-right-wing{position:relative;z-index:4;flex:0 0 clamp(218px,19.2%,268px);width:clamp(218px,19.2%,268px);height:100%;min-width:0;display:flex;flex-direction:column;contain:layout style;}',
      '.ag-pp-bento-card{',
      'position:relative;width:100%;height:100%;display:flex;flex-direction:column;justify-content:space-between;gap:5px;',
      'padding:6px 8px 7px;border-radius:11px;box-sizing:border-box;min-width:0;overflow:visible;',
      'background:var(--pp-cnc-shell);border:1px solid var(--pp-cnc-border);color:var(--pp-bento-fg);',
      'box-shadow:inset 0 1px 0 var(--pp-cnc-chamfer-top),var(--pp-cnc-shadow);',
      'user-select:none;-webkit-user-select:none;',
      '}',
      '#ag-prism-periodic-picker-root[data-corners="sharp"] .ag-pp-bento-card{border-radius:7px;}',
      '#ag-prism-periodic-picker-root[data-corners="soft"] .ag-pp-bento-card{border-radius:13px;}',
      '.ag-pp-card-rim{',
      'position:absolute;inset:-1px;border-radius:inherit;padding:1.25px;pointer-events:none;z-index:6;contain:layout style paint;',
      'background:radial-gradient(164px circle at var(--ag-pp-card-px,-999px) var(--ag-pp-card-py,-999px),var(--pp-rim-core) 0%,var(--pp-rim-ice) 42%,var(--pp-rim-violet) 74%,transparent 100%);',
      '-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);',
      '-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);mask-composite:exclude;',
      'opacity:var(--ag-pp-card-rim-alpha,0);transition:opacity 80ms linear;',
      '}',
      '.ag-pp-tele-rim{',
      'background:radial-gradient(164px circle at var(--ag-pp-right-px,-999px) var(--ag-pp-right-py,-999px),var(--pp-rim-core) 0%,var(--pp-rim-ice) 42%,var(--pp-rim-violet) 74%,transparent 100%);',
      'opacity:var(--ag-pp-right-rim-alpha,0);',
      '}',
      /* Gentle 160ms Session-Switch Content Cross-Fade */
      '@keyframes ag-pp-session-fade{0%{opacity:0.36;transform:translate3d(0,3px,0);}100%{opacity:1;transform:translate3d(0,0,0);}}',
      '.ag-pp-bento-card.is-session-switching .ag-pp-spec-body,.ag-pp-bento-card.is-session-switching .ag-pp-tele-screen,.ag-pp-bento-card.is-session-switching .ag-pp-tele-subscreen{animation:ag-pp-session-fade 160ms cubic-bezier(0.22,1,0.36,1) both;}',
      '.ag-pp-cnc-header{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:0 3px;height:13px;flex:0 0 auto;}',
      '.ag-pp-cnc-label{font-family:"JetBrains Mono","SF Mono",Consolas,monospace;font-size:8.5px;font-weight:720;letter-spacing:0.10em;text-transform:uppercase;color:var(--pp-cnc-engraving);line-height:1;white-space:nowrap;}',
      '.ag-pp-card-flip-btn{',
      'display:inline-flex;align-items:center;gap:3px;height:16px;padding:0 5px;border-radius:4px;',
      'border:1px solid var(--pp-bento-pill-border);background:var(--pp-bento-pill-bg);color:var(--pp-bento-dim);',
      'font-family:"JetBrains Mono",Consolas,monospace;font-size:8.5px;font-weight:700;cursor:pointer;line-height:1;',
      'transition:background 120ms ease,color 120ms ease,border-color 120ms ease;',
      '}',
      '.ag-pp-card-flip-btn:hover{background:var(--pp-bento-pill-active);color:var(--pp-bento-fg);border-color:var(--ag-pp-spec-accent,var(--ag-pp-model-accent));}',
      '.ag-pp-card-flip-btn svg{width:9.5px;height:9.5px;display:block;}',
      '#ag-prism-periodic-picker-root[data-dock-tier="wide"] .ag-pp-card-flip-btn,#ag-prism-periodic-picker-root[data-dock-tier="medium"] .ag-pp-card-flip-btn{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);clip-path:inset(50%);border:0;opacity:0;}',
      '.ag-pp-recess-screen{position:relative;display:flex;flex-direction:column;border-radius:6.5px;padding:5.5px 7.5px;box-sizing:border-box;min-width:0;background:var(--pp-screen-bg);border:1px solid var(--pp-screen-border);box-shadow:var(--pp-screen-inset);}',
      '.ag-pp-spec-body{display:flex;flex-direction:column;gap:4.5px;min-width:0;flex:1 1 auto;min-height:0;overflow:hidden;}',
      '.ag-pp-spec-main{display:flex;flex-direction:column;gap:3px;min-width:0;flex:0 0 auto;}',
      '.ag-pp-spec-kicker-row{display:flex;align-items:center;justify-content:space-between;gap:5px;min-width:0;}',
      '.ag-pp-family-badge{display:inline-flex;align-items:center;gap:4.5px;height:17px;padding:0 6px;border-radius:4px;font-family:"JetBrains Mono",Consolas,monospace;font-size:9px;font-weight:760;letter-spacing:0.05em;text-transform:uppercase;white-space:nowrap;background:var(--pp-bento-pill-bg);border:1px solid var(--ag-pp-spec-accent,var(--ag-pp-model-accent));color:var(--pp-bento-fg);}',
      '.ag-pp-family-dot{width:5px;height:5px;border-radius:50%;background:var(--ag-pp-spec-accent,var(--ag-pp-model-accent));}',
      '.ag-pp-state-tag{font-family:"JetBrains Mono",Consolas,monospace;font-size:8.8px;font-weight:700;color:var(--pp-bento-dim);letter-spacing:0.04em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.ag-pp-spec-title{margin:0;font-size:15.5px;font-weight:800;line-height:1.1;letter-spacing:-0.02em;color:var(--pp-bento-fg);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.ag-pp-micro-tags{display:flex;align-items:center;gap:4px;flex-wrap:nowrap;overflow:hidden;}',
      '.ag-pp-micro-tag{display:inline-flex;align-items:center;height:15px;padding:0 5px;border-radius:3.5px;border:1px solid var(--pp-bento-pill-border);background:var(--pp-bento-pill-bg);font-size:9px;font-weight:660;color:var(--pp-bento-sub);white-space:nowrap;line-height:1;}',
      '.ag-pp-spec-tagline{display:none;}',
      '.ag-pp-radar-pane{flex:1 1 auto;min-height:0;overflow:hidden;display:grid;grid-template-columns:88px minmax(0,1fr);gap:6px;align-items:center;}',
      '.ag-pp-meta-pane{display:none;flex:1 1 auto;min-height:0;overflow:hidden;flex-direction:column;justify-content:center;gap:6px;padding:8px 10px;}',
      '.ag-pp-spec-card[data-known-benchmark="0"] .ag-pp-radar-pane,.ag-pp-spec-card[data-known-benchmark="0"] .ag-pp-source-row{display:none !important;}',
      '.ag-pp-spec-card[data-known-benchmark="0"] .ag-pp-meta-pane{display:flex;}',
      '.ag-pp-meta-kicker{font-family:"JetBrains Mono",Consolas,monospace;font-size:8.5px;font-weight:740;letter-spacing:0.06em;text-transform:uppercase;color:var(--pp-bento-dim);}',
      '.ag-pp-meta-grid{display:grid;grid-template-columns:auto minmax(0,1fr);gap:4px 10px;align-items:baseline;font-size:10px;}',
      '.ag-pp-meta-key{font-family:"JetBrains Mono",Consolas,monospace;font-size:9px;color:var(--pp-bento-dim);white-space:nowrap;}',
      '.ag-pp-meta-val{font-family:"JetBrains Mono",Consolas,monospace;font-size:9.8px;font-weight:720;color:var(--pp-bento-fg);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.ag-pp-meta-note{font-size:9.5px;line-height:1.35;color:var(--pp-bento-sub);}',
      '.ag-pp-radar-col{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.5px;min-width:0;}',
      '.ag-pp-radar-svg{width:88px;height:88px;display:block;overflow:visible;}',
      '.ag-pp-radar-vtx-lbl{font-size:8.8px;font-weight:720;fill:var(--pp-bento-sub);letter-spacing:0.01em;}',
      '.ag-pp-radar-poly,.ag-pp-radar-poly-runner,.ag-pp-radar-poly-cmp{transition:opacity 120ms ease;}',
      '.ag-pp-radar-legend{display:none;align-items:center;justify-content:center;gap:6px;font-size:8.2px;font-weight:680;color:var(--pp-bento-dim);line-height:1;}',
      '.ag-pp-radar-legend[data-show="1"]{display:flex;}',
      '.ag-pp-radar-leg-item{display:inline-flex;align-items:center;gap:3px;white-space:nowrap;}',
      '.ag-pp-radar-leg-swatch{width:7px;height:2px;border-radius:1px;background:var(--ag-pp-spec-accent,var(--ag-pp-model-accent));}',
      '.ag-pp-radar-leg-swatch.is-dashed{background:transparent;border-top:1.5px dashed var(--pp-bento-sub);}',
      '.ag-pp-radar-bars{display:flex;flex-direction:column;gap:3.2px;min-width:0;}',
      '.ag-pp-radar-row{display:grid;grid-template-columns:54px minmax(0,1fr) 48px;align-items:center;gap:4px;font-size:10px;line-height:1.1;}',
      '.ag-pp-spec-card[data-comparing="1"] .ag-pp-radar-row{grid-template-columns:54px minmax(0,1fr) 68px;}',
      '.ag-pp-radar-lbl{color:var(--pp-bento-sub);font-weight:680;font-size:9.4px;letter-spacing:-0.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.ag-pp-radar-track{height:4.5px;border-radius:2px;background:var(--pp-bento-track);overflow:hidden;position:relative;}',
      '.ag-pp-radar-track::after{content:"";position:absolute;inset:0;pointer-events:none;z-index:2;background:linear-gradient(90deg,transparent calc(50% - 0.5px),rgba(255,255,255,0.24) calc(50% - 0.5px),rgba(255,255,255,0.24) calc(50% + 0.5px),transparent calc(50% + 0.5px),transparent calc(75% - 0.5px),rgba(255,255,255,0.24) calc(75% - 0.5px),rgba(255,255,255,0.24) calc(75% + 0.5px),transparent calc(75% + 0.5px));}',
      '#ag-prism-periodic-picker-root[data-theme="light"] .ag-pp-radar-track::after{background:linear-gradient(90deg,transparent calc(50% - 0.5px),rgba(15,23,42,0.18) calc(50% - 0.5px),rgba(15,23,42,0.18) calc(50% + 0.5px),transparent calc(50% + 0.5px),transparent calc(75% - 0.5px),rgba(15,23,42,0.18) calc(75% - 0.5px),rgba(15,23,42,0.18) calc(75% + 0.5px),transparent calc(75% + 0.5px));}',
      '.ag-pp-radar-fill{height:100%;border-radius:2px;background:var(--ag-pp-spec-grad,var(--ag-pp-spec-accent,var(--ag-pp-model-accent)));}',
      '.ag-pp-radar-val-wrap{display:inline-flex;align-items:baseline;justify-content:flex-end;gap:2.5px;min-width:0;}',
      '.ag-pp-radar-val{font-family:"JetBrains Mono",Consolas,monospace;font-weight:760;color:var(--pp-bento-fg);text-align:right;font-size:9.8px;font-variant-numeric:tabular-nums;white-space:nowrap;}',
      '.ag-pp-delta-tag{display:none;font-family:"JetBrains Mono",Consolas,monospace;font-size:7.8px;font-weight:760;white-space:nowrap;}',
      '.ag-pp-delta-tag[data-dir="up"]{display:inline;color:#93C5FD;}',
      '.ag-pp-delta-tag[data-dir="down"]{display:inline;color:#F0A07A;}',
      '#ag-prism-periodic-picker-root[data-theme="light"] .ag-pp-delta-tag[data-dir="up"]{color:#1D4ED8;}',
      '#ag-prism-periodic-picker-root[data-theme="light"] .ag-pp-delta-tag[data-dir="down"]{color:#B45309;}',
      '.ag-pp-radar-scale-row{display:grid;grid-template-columns:54px minmax(0,1fr) 48px;align-items:center;gap:4px;margin-top:1px;}',
      '.ag-pp-spec-card[data-comparing="1"] .ag-pp-radar-scale-row{grid-template-columns:54px minmax(0,1fr) 68px;}',
      '.ag-pp-radar-scale-ticks{position:relative;height:9px;font-family:"JetBrains Mono",Consolas,monospace;font-size:7.3px;color:var(--pp-bento-dim);line-height:1;}',
      '.ag-pp-radar-scale-ticks span{position:absolute;top:0;white-space:nowrap;}',
      '.ag-pp-radar-scale-ticks span[data-tick="0"]{left:0;}',
      '.ag-pp-radar-scale-ticks span[data-tick="50"]{left:50%;transform:translateX(-50%);}',
      '.ag-pp-radar-scale-ticks span[data-tick="75"]{left:75%;transform:translateX(-50%);}',
      '.ag-pp-radar-scale-ticks span[data-tick="100"]{right:0;}',
      '.ag-pp-spec-card[data-comparing="1"] .ag-pp-radar-scale-ticks span[data-tick="75"],#ag-prism-periodic-picker-root[data-dock-tier="medium"] .ag-pp-radar-scale-ticks span[data-tick="75"],#ag-prism-periodic-picker-root[data-spec-compact="1"] .ag-pp-radar-scale-ticks span[data-tick="75"]{display:none;}',
      '#ag-prism-periodic-picker-root[data-spec-compact="1"] .ag-pp-radar-pane{grid-template-columns:74px minmax(0,1fr);gap:4px;}',
      '#ag-prism-periodic-picker-root[data-spec-compact="1"] .ag-pp-radar-svg{width:74px;height:74px;}',
      '#ag-prism-periodic-picker-root[data-spec-compact="1"] .ag-pp-radar-row,#ag-prism-periodic-picker-root[data-spec-compact="1"] .ag-pp-radar-scale-row{grid-template-columns:53px minmax(0,1fr) 46px;gap:3px;}',
      '#ag-prism-periodic-picker-root[data-spec-compact="1"] .ag-pp-spec-card[data-comparing="1"] .ag-pp-radar-pane{grid-template-columns:70px minmax(0,1fr);gap:3.5px;}',
      '#ag-prism-periodic-picker-root[data-spec-compact="1"] .ag-pp-spec-card[data-comparing="1"] .ag-pp-radar-svg{width:70px;height:70px;}',
      '#ag-prism-periodic-picker-root[data-spec-compact="1"] .ag-pp-spec-card[data-comparing="1"] .ag-pp-radar-lbl{font-size:8.8px;}',
      '#ag-prism-periodic-picker-root[data-spec-compact="1"] .ag-pp-spec-card[data-comparing="1"] .ag-pp-radar-row,#ag-prism-periodic-picker-root[data-spec-compact="1"] .ag-pp-spec-card[data-comparing="1"] .ag-pp-radar-scale-row{grid-template-columns:50px minmax(0,1fr) 64px;gap:3px;}',
      '#ag-prism-periodic-picker-root[data-spec-compact="1"] .ag-pp-spec-card[data-comparing="1"] .ag-pp-radar-scale-ticks span[data-tick="50"]{display:none;}',
      '#ag-prism-periodic-picker-root[data-spec-compact="1"] .ag-pp-bench-source{font-size:7.6px;letter-spacing:-0.015em;}',
      '#ag-prism-periodic-picker-root[data-spec-compact="1"][data-source-short="0"] .ag-pp-bench-source{font-size:7.3px;letter-spacing:-0.025em;}',
      '.ag-pp-effort-strip{display:flex;flex-direction:column;gap:3.5px;flex:0 0 auto;position:relative;}',
      '.ag-pp-effort-row-top{display:flex;align-items:center;gap:6px;min-width:0;}',
      '.ag-pp-bento-efforts{flex:1 1 auto;display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:2px;padding:2px;border-radius:6px;background:var(--pp-btn-well-bg);border:1px solid var(--pp-screen-border);box-shadow:inset 0 1.5px 4px rgba(0,0,0,0.45);}',
      '.ag-pp-bento-eff-btn{position:relative;overflow:hidden;height:22px;padding:0 5px 1.5px;border-radius:4px;border:1px solid transparent;background:transparent;color:var(--pp-bento-sub);font-family:"JetBrains Mono",inherit;font-size:10px;font-weight:720;cursor:pointer;line-height:1;white-space:nowrap;transition:background 130ms ease,color 130ms ease,border-color 130ms ease,box-shadow 130ms ease;}',
      '.ag-pp-bento-eff-btn:hover{color:var(--pp-bento-fg);background:var(--pp-bento-pill-bg);}',
      '.ag-pp-bento-eff-btn[data-active="1"]{background:var(--pp-seg-active-bg);color:var(--pp-seg-active-fg);border-color:var(--pp-seg-active-border);box-shadow:var(--pp-seg-active-shadow);}',
      '.ag-pp-bento-eff-btn[data-active="1"]::after{content:"";position:absolute;left:8px;right:8px;bottom:1.5px;height:2px;border-radius:1px;background:var(--ag-pp-spec-accent,var(--ag-pp-model-accent));background-image:var(--ag-pp-spec-grad,none);box-shadow:0 0 6px var(--ag-pp-spec-glow,var(--ag-pp-model-glow));transition:background 150ms ease,box-shadow 150ms ease;}',
      '#ag-prism-periodic-picker-root[data-theme="light"] .ag-pp-bento-eff-btn[data-active="1"]::after{box-shadow:0 0 3px var(--ag-pp-spec-glow,var(--ag-pp-model-glow));}',
      '.ag-pp-bento-eff-note{display:none;}',
      '.ag-pp-bento-efforts .ag-pp-bento-eff-note{display:flex;align-items:center;justify-content:center;height:22px;padding:0 8px;font-family:"JetBrains Mono",Consolas,monospace;font-size:9.5px;font-weight:700;color:var(--pp-bento-dim);letter-spacing:0.04em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.ag-pp-source-row{display:flex;align-items:center;justify-content:space-between;gap:5px;min-width:0;position:relative;}',
      '.ag-pp-bench-source{font-family:"JetBrains Mono",Consolas,monospace;font-size:8.2px;font-weight:620;color:var(--pp-bento-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1 1 auto;}',
      '.ag-pp-info-trigger{position:relative;flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border-radius:50%;border:1px solid var(--pp-bento-pill-border);background:var(--pp-bento-pill-bg);color:var(--pp-bento-dim);font-family:"JetBrains Mono",monospace;font-size:8.5px;font-weight:780;cursor:help;line-height:1;padding:0;}',
      '.ag-pp-info-trigger:hover,.ag-pp-info-trigger:focus-visible{color:var(--pp-bento-fg);border-color:var(--ag-pp-spec-accent,var(--ag-pp-model-accent));}',
      '.ag-pp-bench-tooltip{position:absolute;left:0;right:0;bottom:calc(100% + 6px);z-index:24;padding:8px 9px;border-radius:7px;background:var(--pp-tooltip-bg);border:1px solid var(--pp-tooltip-border);color:var(--pp-bento-fg);box-shadow:0 10px 26px rgba(0,0,0,0.48);font-size:9.5px;line-height:1.42;opacity:0;visibility:hidden;transform:translateY(4px);pointer-events:none;transition:opacity 140ms ease,transform 140ms ease,visibility 140ms ease;}',
      '.ag-pp-source-row:hover .ag-pp-bench-tooltip,.ag-pp-source-row:focus-within .ag-pp-bench-tooltip{opacity:1;visibility:visible;transform:translateY(0);}',
      '.ag-pp-tt-head{font-weight:780;margin-bottom:4px;color:var(--pp-bento-fg);letter-spacing:0.02em;}',
      '.ag-pp-tt-line{color:var(--pp-bento-sub);margin:1.5px 0;}',
      '.ag-pp-tt-line strong{color:var(--pp-bento-fg);font-weight:740;}',
      /* MOD-02 // TELEMETRY Machined Circular Controls + 512K Screen + Offline Placeholder + Aux Pager */
      '.ag-pp-machined-ctrls{display:flex;align-items:center;justify-content:space-evenly;gap:8px;padding:1px 4px 2px;flex:0 0 auto;}',
      '.ag-pp-machined-well{display:flex;align-items:center;justify-content:center;width:34px;height:34px;padding:3px;border-radius:50%;box-sizing:border-box;background:var(--pp-btn-well-bg);box-shadow:inset 0 2px 4px rgba(0,0,0,0.68),0 1px 0 rgba(255,255,255,0.14);}',
      '.ag-pp-machined-btn{display:inline-flex;align-items:center;justify-content:center;gap:2px;width:28px;height:28px;padding:0;border-radius:50%;border:1px solid var(--pp-cnc-border);background:var(--pp-btn-metal);color:var(--pp-btn-metal-fg);box-shadow:inset 0 1px 0 var(--pp-cnc-chamfer-top),inset 0 -1px 2px rgba(0,0,0,0.35),0 2px 4px rgba(0,0,0,0.38);font-family:"JetBrains Mono",Consolas,monospace;font-size:11.5px;font-weight:800;cursor:pointer;line-height:1;transition:transform 90ms ease,background 130ms ease,border-color 140ms ease;}',
      '.ag-pp-machined-btn:hover{background:var(--pp-btn-metal-hover);border-color:var(--ag-pp-model-accent);}',
      '.ag-pp-machined-btn:active{transform:translateY(1px) scale(0.94);}',
      '.ag-pp-machined-btn svg{width:13px;height:13px;display:block;flex:0 0 auto;}',
      '#ag-prism-periodic-picker-root[data-stage-mode="drawer"] .ag-pp-stage-mode-btn svg{display:none;}',
      '#ag-prism-periodic-picker-root[data-stage-mode="fullscreen"] .ag-pp-stage-mode-btn .ag-pp-stage-key-tag{display:none;}',
      '.ag-pp-machined-btn[data-muted="1"] .ag-pp-vol-wave{display:none;}',
      '.ag-pp-machined-btn[data-muted="0"] .ag-pp-vol-mute{display:none;}',
      '.ag-pp-stage-btn-lbl{display:none;}',
      '.ag-pp-tele-screen{flex:1.28 1 0;min-height:0;overflow:hidden;justify-content:space-between;gap:2px;padding:5px 7.5px;}',
      '.ag-pp-tele-top-row{display:flex;align-items:baseline;justify-content:space-between;gap:6px;}',
      '.ag-pp-tele-hero-512k{font-family:"JetBrains Mono",Consolas,monospace;font-size:20px;font-weight:800;line-height:1;letter-spacing:-0.03em;color:var(--pp-bento-fg);}',
      '.ag-pp-tele-health{font-family:"JetBrains Mono",Consolas,monospace;font-size:8.2px;font-weight:760;padding:1.5px 5px;border-radius:3.5px;background:var(--pp-bento-pill-bg);border:1px solid var(--pp-bento-pill-border);color:var(--pp-bento-sub);white-space:nowrap;}',
      '.ag-pp-tele-health[data-level="warn"]{color:#E5A856;border-color:rgba(229,168,86,0.44);}',
      '.ag-pp-tele-health[data-level="offline"]{color:var(--pp-bento-dim);border-color:var(--pp-bento-pill-border);}',
      '#ag-prism-periodic-picker-root[data-theme="light"] .ag-pp-tele-health[data-level="warn"]{color:#B45309;border-color:rgba(180,83,9,0.36);}',
      '.ag-pp-tele-offline-box{display:none;flex:1 1 auto;flex-direction:column;align-items:center;justify-content:center;gap:3px;text-align:center;padding:6px 4px;}',
      '.ag-pp-tele-offline-title{font-family:"JetBrains Mono",Consolas,monospace;font-size:10px;font-weight:760;color:var(--pp-bento-sub);letter-spacing:0.03em;}',
      '.ag-pp-tele-offline-sub{font-size:8.6px;line-height:1.3;color:var(--pp-bento-dim);}',
      '.ag-pp-tele-screen[data-telemetry-available="0"] .ag-pp-tele-sub-row,',
      '.ag-pp-tele-screen[data-telemetry-available="0"] .ag-pp-crystal-bar,',
      '.ag-pp-tele-screen[data-telemetry-available="0"] .ag-pp-tele-ticks,',
      '.ag-pp-tele-screen[data-telemetry-available="0"] .ag-pp-pulse-svg,',
      '.ag-pp-tele-screen[data-telemetry-available="0"] .ag-pp-tele-metrics{display:none !important;}',
      '.ag-pp-tele-screen[data-telemetry-available="0"] .ag-pp-tele-offline-box{display:flex;}',
      '.ag-pp-tele-screen[data-has-pulse="0"] .ag-pp-pulse-svg{display:none !important;}',
      '.ag-pp-compact-tele-wrap[data-telemetry-available="0"] .ag-pp-compact-tele-bar{display:none !important;}',
      '.ag-pp-tele-sub-row{display:flex;align-items:center;justify-content:space-between;gap:4px;font-family:"JetBrains Mono",Consolas,monospace;font-size:9.6px;color:var(--pp-bento-sub);}',
      '.ag-pp-tele-big-num{font-weight:760;color:var(--pp-bento-fg);font-variant-numeric:tabular-nums;}',
      '.ag-pp-tele-cap-lbl{font-size:8.8px;color:var(--pp-bento-dim);}',
      '.ag-pp-crystal-bar{position:relative;height:5px;border-radius:2px;background:var(--pp-bento-track);overflow:hidden;flex:0 0 auto;}',
      '.ag-pp-crystal-fill{height:100%;border-radius:2px;background:var(--ag-pp-model-grad,var(--ag-pp-model-accent));transition:width 240ms cubic-bezier(0.22,1,0.36,1);}',
      '.ag-pp-tele-ticks{display:flex;justify-content:space-between;font-family:"JetBrains Mono",Consolas,monospace;font-size:7.6px;color:var(--pp-bento-dim);line-height:1;}',
      '.ag-pp-pulse-svg{width:100%;height:26px;display:block;overflow:visible;flex:0 1 auto;}',
      '.ag-pp-tele-metrics{display:flex;align-items:center;justify-content:space-between;gap:6px;font-family:"JetBrains Mono",Consolas,monospace;font-size:9.2px;color:var(--pp-bento-sub);line-height:1.15;}',
      '.ag-pp-tele-kv strong{color:var(--pp-bento-fg);font-weight:760;font-variant-numeric:tabular-nums;}',
      '.ag-pp-tele-subscreen{flex:0.78 1 0;min-height:0;overflow:hidden;justify-content:space-between;gap:2px;padding:4.5px 7.5px;}',
      '.ag-pp-solo-view{display:flex;flex-direction:column;justify-content:space-between;height:100%;gap:2px;}',
      '.ag-pp-orch-view{display:none;flex-direction:column;justify-content:space-between;height:100%;gap:2px;}',
      '#ag-prism-periodic-picker-root[data-orch-latched="1"] .ag-pp-solo-view{display:none;}',
      '#ag-prism-periodic-picker-root[data-orch-latched="1"] .ag-pp-orch-view{display:flex;}',
      '.ag-pp-sub-title{font-family:"JetBrains Mono",Consolas,monospace;font-size:9px;font-weight:720;color:var(--pp-bento-sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center;}',
      '.ag-pp-acoustics-svg{width:100%;height:24px;display:block;}',
      '.ag-pp-pinhole-row{display:flex;align-items:center;justify-content:center;gap:5px;}',
      '.ag-pp-pinhole-dot{width:4px;height:4px;border-radius:50%;background:var(--pp-bento-track);transition:background 160ms ease,box-shadow 160ms ease;}',
      '.ag-pp-pinhole-dot[data-lit="1"]{background:var(--ag-pp-model-grad,var(--ag-pp-model-accent));box-shadow:0 0 5px var(--ag-pp-model-glow);}',
      '.ag-pp-topo-svg{width:100%;height:26px;display:block;overflow:visible;}',
      '.ag-pp-topo-nodes{display:flex;align-items:center;justify-content:space-between;gap:4px;}',
      '.ag-pp-topo-box{flex:1 1 0;min-width:0;padding:4px 5px;border-radius:4.5px;border:1px solid var(--pp-orch-box-bd);background:var(--pp-orch-box-bg);text-align:center;}',
      '.ag-pp-topo-box.is-runner{border-color:var(--pp-orch-run-bd);background:var(--pp-orch-run-bg);}',
      '.ag-pp-topo-role{display:block;font-family:"JetBrains Mono",Consolas,monospace;font-size:7.5px;font-weight:720;letter-spacing:0.06em;color:var(--pp-bento-dim);text-transform:uppercase;}',
      '.ag-pp-topo-val{display:block;font-family:"JetBrains Mono",Consolas,monospace;font-size:9.5px;font-weight:800;color:var(--pp-bento-fg);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.ag-pp-topo-arrow{flex:0 0 auto;font-family:"JetBrains Mono",monospace;font-size:11px;font-weight:800;color:var(--pp-orch-bus);}',
      /* Aux Pad Pagination Strip (Hidden with zero footprint when auxPageCount <= 1) */
      '.ag-pp-aux-pager{display:none;align-items:center;justify-content:space-between;gap:6px;flex:0 0 auto;height:22px;padding:0 6px;border-radius:6px;background:var(--pp-screen-bg);border:1px solid var(--pp-screen-border);box-shadow:var(--pp-screen-inset);}',
      '.ag-pp-aux-pager[data-show="1"]{display:flex;}',
      '.ag-pp-aux-page-btn{display:inline-flex;align-items:center;justify-content:center;width:18px;height:16px;padding:0;border-radius:4px;border:1px solid var(--pp-bento-pill-border);background:var(--pp-bento-pill-bg);color:var(--pp-bento-sub);font-family:"JetBrains Mono",Consolas,monospace;font-size:10px;font-weight:760;line-height:1;cursor:pointer;transition:background 120ms ease,color 120ms ease,border-color 120ms ease;}',
      '.ag-pp-aux-page-btn:hover{background:var(--pp-bento-pill-active);color:var(--pp-bento-fg);border-color:var(--ag-pp-model-accent);}',
      '.ag-pp-aux-page-mid{display:inline-flex;align-items:center;gap:5px;min-width:0;}',
      '.ag-pp-aux-page-dots{display:inline-flex;align-items:center;gap:4px;}',
      '.ag-pp-aux-page-dot{width:6px;height:6px;padding:0;border:0;border-radius:999px;background:var(--pp-bento-track);cursor:pointer;transition:width 150ms ease,background 150ms ease,box-shadow 150ms ease;}',
      '.ag-pp-aux-page-dot[data-active="1"]{width:14px;background:var(--ag-pp-model-grad,var(--ag-pp-model-accent));box-shadow:0 0 6px var(--ag-pp-model-glow);}',
      '.ag-pp-aux-page-txt{font-family:"JetBrains Mono",Consolas,monospace;font-size:8.5px;font-weight:720;color:var(--pp-bento-dim);font-variant-numeric:tabular-nums;}',
      /* Medium (960-1180px) & Narrow (<960px) Sleek 38px CNC Top Hardware Bar */
      '.ag-pp-compact-bar{display:none;align-items:center;justify-content:space-between;gap:8px;height:38px;padding:0 8px 0 11px;border-radius:8px;background:var(--pp-cnc-shell);border:1px solid var(--pp-cnc-border);color:var(--pp-bento-fg);box-shadow:inset 0 1px 0 var(--pp-cnc-chamfer-top),0 4px 12px rgba(0,0,0,0.28);font-size:11.5px;flex:0 0 auto;user-select:none;box-sizing:border-box;}',
      '.ag-pp-compact-left{display:inline-flex;align-items:center;gap:7px;min-width:0;overflow:hidden;cursor:pointer;}',
      '.ag-pp-compact-hw-badge{display:none;align-items:center;font-family:"JetBrains Mono","SF Mono",Consolas,monospace;font-size:9px;font-weight:740;letter-spacing:0.09em;text-transform:uppercase;color:var(--pp-cnc-engraving);white-space:nowrap;}',
      '.ag-pp-compact-model-pill{display:none;align-items:center;gap:5px;height:20px;padding:0 7px;border-radius:4.5px;background:var(--pp-screen-bg);border:1px solid var(--pp-screen-border);box-shadow:var(--pp-screen-inset);font-family:"JetBrains Mono",Consolas,monospace;font-size:9.5px;font-weight:740;color:var(--pp-bento-fg);white-space:nowrap;}',
      '.ag-pp-compact-pill-dot{width:5px;height:5px;border-radius:50%;background:var(--ag-pp-model-accent);box-shadow:0 0 5px var(--ag-pp-model-glow);flex:0 0 auto;}',
      '.ag-pp-compact-title{font-weight:780;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.ag-pp-compact-metrics{font-family:"JetBrains Mono",Consolas,monospace;font-size:10.5px;color:var(--pp-bento-sub);white-space:nowrap;}',
      '.ag-pp-compact-right{display:inline-flex;align-items:center;gap:7px;flex:0 0 auto;}',
      '.ag-pp-compact-tele-wrap{display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 7px;border-radius:5px;background:var(--pp-screen-bg);border:1px solid var(--pp-screen-border);box-shadow:var(--pp-screen-inset);}',
      '.ag-pp-compact-512k{font-family:"JetBrains Mono",Consolas,monospace;font-size:9.6px;font-weight:740;color:var(--pp-bento-sub);white-space:nowrap;font-variant-numeric:tabular-nums;}',
      '.ag-pp-compact-tele-bar{width:46px;height:4px;border-radius:2px;background:var(--pp-bento-track);overflow:hidden;flex:0 0 auto;}',
      '.ag-pp-compact-tele-fill{height:100%;border-radius:2px;background:var(--ag-pp-model-grad,var(--ag-pp-model-accent));transition:width 240ms cubic-bezier(0.22,1,0.36,1);}',
      '.ag-pp-compact-toggle-lbl{font-size:10px;font-weight:740;color:var(--ag-pp-model-accent);white-space:nowrap;cursor:pointer;}',
      '.ag-pp-compact-ctrls{display:inline-flex;align-items:center;gap:4px;}',
      '.ag-pp-compact-ctrls .ag-pp-machined-btn{width:24px;height:24px;font-size:10px;}',
      '#ag-prism-periodic-picker-root[data-stage-mode="drawer"][data-dock-tier="medium"] .ag-pp-spatial-dock{display:grid;grid-template-columns:clamp(278px,27.5%,328px) minmax(0,1fr);grid-template-rows:38px minmax(0,1fr);gap:8px 10px;padding:9px 12px 8px;}',
      '#ag-prism-periodic-picker-root[data-stage-mode="drawer"][data-dock-tier="medium"] .ag-pp-compact-bar{display:flex;grid-column:1 / -1;grid-row:1;}',
      '#ag-prism-periodic-picker-root[data-stage-mode="drawer"][data-dock-tier="medium"] .ag-pp-compact-left{cursor:default;gap:8px;}',
      '#ag-prism-periodic-picker-root[data-stage-mode="drawer"][data-dock-tier="medium"] .ag-pp-compact-hw-badge,#ag-prism-periodic-picker-root[data-stage-mode="drawer"][data-dock-tier="medium"] .ag-pp-compact-model-pill{display:inline-flex;}',
      '#ag-prism-periodic-picker-root[data-stage-mode="drawer"][data-dock-tier="medium"] .ag-pp-narrow-only,#ag-prism-periodic-picker-root[data-stage-mode="drawer"][data-dock-tier="medium"] .ag-pp-compact-toggle-lbl{display:none;}',
      '#ag-prism-periodic-picker-root[data-stage-mode="drawer"][data-dock-tier="medium"] .ag-pp-bento-grid{grid-column:1;grid-row:2;width:100%;flex:none;}',
      '#ag-prism-periodic-picker-root[data-stage-mode="drawer"][data-dock-tier="medium"] .ag-pp-stage{grid-column:2;grid-row:2;}',
      '#ag-prism-periodic-picker-root[data-stage-mode="drawer"][data-dock-tier="medium"] .ag-pp-right-wing{display:none;}',
      '#ag-prism-periodic-picker-root[data-stage-mode="drawer"][data-dock-tier="narrow"] .ag-pp-spatial-dock{flex-direction:column;gap:6px;padding:8px 10px 6px;}',
      '#ag-prism-periodic-picker-root[data-stage-mode="drawer"][data-dock-tier="narrow"] .ag-pp-compact-bar{display:flex;}',
      '#ag-prism-periodic-picker-root[data-stage-mode="drawer"][data-dock-tier="narrow"] .ag-pp-compact-tele-bar{display:none;}',
      '#ag-prism-periodic-picker-root[data-stage-mode="drawer"][data-dock-tier="narrow"] .ag-pp-bento-grid,#ag-prism-periodic-picker-root[data-stage-mode="drawer"][data-dock-tier="narrow"] .ag-pp-right-wing{display:none;position:absolute;top:50px;left:10px;width:min(336px,calc(100% - 20px));height:282px;z-index:16;flex:none;}',
      '#ag-prism-periodic-picker-root[data-stage-mode="drawer"][data-dock-tier="narrow"][data-compact-expanded="1"][data-card-flipped="0"] .ag-pp-bento-grid{display:flex;}',
      '#ag-prism-periodic-picker-root[data-stage-mode="drawer"][data-dock-tier="narrow"][data-compact-expanded="1"][data-card-flipped="1"] .ag-pp-right-wing{display:flex;}',
      /* Fullscreen Studio Showcase (F) */
      '#ag-prism-periodic-picker-root[data-stage-mode="fullscreen"]{justify-content:center;padding:12px;}',
      '#ag-prism-periodic-picker-root[data-stage-mode="fullscreen"] .ag-pp-spatial-dock{position:relative;display:block;width:min(98vw,1560px);height:calc(100vh - 24px);padding:0;}',
      '#ag-prism-periodic-picker-root[data-stage-mode="fullscreen"] .ag-pp-stage{position:absolute;inset:52px 0 38px 0;width:100%;height:auto;max-width:none;}',
      '#ag-prism-periodic-picker-root[data-stage-mode="fullscreen"] .ag-pp-bento-grid{position:absolute;top:4px;left:8px;width:auto;max-width:450px;height:auto;z-index:10;}',
      '#ag-prism-periodic-picker-root[data-stage-mode="fullscreen"] .ag-pp-right-wing{position:absolute;top:4px;right:8px;width:auto;max-width:340px;height:auto;z-index:10;}',
      '#ag-prism-periodic-picker-root[data-stage-mode="fullscreen"] .ag-pp-bento-card{flex-direction:row;align-items:center;gap:10px;padding:6px 10px;height:auto;border-radius:10px;}',
      '#ag-prism-periodic-picker-root[data-stage-mode="fullscreen"] .ag-pp-bento-foldable,#ag-prism-periodic-picker-root[data-stage-mode="fullscreen"] .ag-pp-cnc-header,#ag-prism-periodic-picker-root[data-stage-mode="fullscreen"] .ag-pp-tele-subscreen,#ag-prism-periodic-picker-root[data-stage-mode="fullscreen"] .ag-pp-pulse-svg,#ag-prism-periodic-picker-root[data-stage-mode="fullscreen"] .ag-pp-tele-ticks,#ag-prism-periodic-picker-root[data-stage-mode="fullscreen"] .ag-pp-tele-metrics,#ag-prism-periodic-picker-root[data-stage-mode="fullscreen"] .ag-pp-aux-pager{display:none !important;}',
      '#ag-prism-periodic-picker-root[data-stage-mode="fullscreen"] .ag-pp-spec-body{flex-direction:row;align-items:center;gap:8px;}',
      '#ag-prism-periodic-picker-root[data-stage-mode="fullscreen"] .ag-pp-spec-main{flex-direction:row;align-items:center;gap:7px;padding:0;background:transparent;border:0;box-shadow:none;}',
      '#ag-prism-periodic-picker-root[data-stage-mode="fullscreen"] .ag-pp-spec-title{font-size:13.5px;}',
      '#ag-prism-periodic-picker-root[data-stage-mode="fullscreen"] .ag-pp-micro-tags{display:none;}',
      '#ag-prism-periodic-picker-root[data-stage-mode="fullscreen"] .ag-pp-bento-efforts{width:auto;}',
      '#ag-prism-periodic-picker-root[data-stage-mode="fullscreen"] .ag-pp-tele-screen{flex-direction:row;align-items:center;gap:8px;padding:4px 8px;}',
      '#ag-prism-periodic-picker-root[data-stage-mode="fullscreen"] .ag-pp-tele-top-row{display:none;}',
      '#ag-prism-periodic-picker-root[data-stage-mode="fullscreen"] .ag-pp-crystal-bar{width:56px;flex:0 0 56px;}',
      '#ag-prism-periodic-picker-root[data-stage-mode="fullscreen"] .ag-pp-machined-ctrls{display:flex;gap:5px;padding:0;order:2;}',
      '#ag-prism-periodic-picker-root[data-stage-mode="fullscreen"] .ag-pp-machined-well{width:30px;height:30px;padding:2px;}',
      '#ag-prism-periodic-picker-root[data-stage-mode="fullscreen"] .ag-pp-machined-btn{width:24px;height:24px;}',
      /* Studio Cyclorama Background */
      '.ag-pp-deskmat-stage{position:absolute;inset:0;z-index:0;pointer-events:none;overflow:hidden;user-select:none;-webkit-user-select:none;}',
      '.ag-pp-deskmat-glow{position:absolute;inset:0;pointer-events:none;background:var(--pp-felt-bg);opacity:0.96;}',
      '.ag-pp-prism-aura,.ag-pp-prism-aura-wings,.ag-pp-prism-aura-core,.ag-pp-studio-halo{opacity:0 !important;pointer-events:none;}',
      '.ag-pp-deskmat-topo{position:absolute;inset:-3%;width:106%;height:106%;display:block;pointer-events:none;color:var(--pp-topo-color);opacity:calc(var(--pp-ambient-mul,1) * var(--pp-topo-mul,0.018));}',
      '.ag-pp-deskmat-topo path{stroke-width:0.85;}',
      '.ag-pp-stage{position:relative;z-index:1;flex:1 1 0;min-width:0;width:100%;height:100%;min-height:190px;background:transparent;border:0;box-shadow:none;padding:0;margin:0;box-sizing:border-box;user-select:none;-webkit-user-select:none;contain:layout style;}',
      '.ag-pp-floor-shadow{position:absolute;left:4%;right:4%;top:30%;bottom:-16%;z-index:0;pointer-events:none;border-radius:50%;contain:layout style;will-change:transform;transform:translate3d(var(--pp-shadow-px,0px),var(--pp-shadow-py,0px),0);transition:transform 140ms cubic-bezier(0.22,1,0.36,1);}',
      '#ag-prism-periodic-picker-root[data-orbit-dragging="1"] .ag-pp-floor-shadow{transition:none;}',
      '.ag-pp-floor-shadow::before{content:"";position:absolute;inset:8% -4% -12% -4%;pointer-events:none;border-radius:50%;background:var(--pp-levitation-shadow);}',
      '.ag-pp-floor-shadow::after{content:"";position:absolute;inset:20% 5% 0% 5%;pointer-events:none;border-radius:50%;background:var(--pp-contact-shadow);will-change:transform;transform:translate3d(calc(var(--pp-shadow-px,0px) * -0.35),calc(var(--pp-shadow-py,0px) * -0.35),0);}',
      '.ag-pp-gl-canvas{position:relative;z-index:1;display:block;width:100%;height:100%;background:transparent;border:0;outline:none;touch-action:none;}',
      '.ag-pp-hit-layer{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:2;}',
      '.ag-pp-hit-btn{position:absolute;margin:0;padding:0;border:0;background:transparent;color:transparent;opacity:0;pointer-events:auto;cursor:inherit;box-sizing:border-box;border-radius:6px;outline:none;}',
      '.ag-pp-hit-btn:focus-visible{opacity:1;cursor:pointer;box-shadow:0 0 0 2px var(--pp-focus-ring);background:rgba(148,163,184,0.14);}',
      '.ag-pp-key-blind{pointer-events:none !important;width:1px !important;height:1px !important;}',
      '.ag-pp-sr-only{position:absolute !important;width:1px !important;height:1px !important;padding:0 !important;margin:-1px !important;overflow:hidden !important;clip:rect(0,0,0,0) !important;clip-path:inset(50%) !important;white-space:nowrap !important;border:0 !important;pointer-events:none !important;}',
      '.ag-pp-hud-pill{position:absolute;left:50%;bottom:6px;transform:translateX(-50%);z-index:9;display:inline-flex;align-items:center;justify-content:center;padding:0;margin:0;background:transparent;border:0;box-shadow:none;font-size:11px;line-height:1;user-select:none;-webkit-user-select:none;}',
      '#ag-prism-periodic-picker-root[data-stage-mode="drawer"] .ag-pp-hud-pill{right:16px;left:auto;transform:none;opacity:0;pointer-events:none;}',
      '.ag-pp-hud-reset-btn{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:6px;flex:0 0 auto;height:28px;padding:0 10.5px 0 9px;margin:0;border-radius:999px;box-sizing:border-box;background:var(--pp-hud-bg);border:1px solid var(--pp-hud-border);color:var(--pp-hud-muted);box-shadow:inset 0 1px 0 var(--pp-hud-top-gleam),inset 0 -1px 0 var(--pp-hud-bottom-lip),0 8px 20px var(--pp-hud-shadow);font-family:inherit;font-size:11px;font-weight:620;line-height:1;white-space:nowrap;cursor:pointer;outline:none;transition:opacity 180ms ease,background 160ms ease,color 150ms ease,border-color 180ms ease,transform 100ms ease;}',
      '.ag-pp-hud-reset-btn svg{width:13px;height:13px;display:block;pointer-events:none;flex:0 0 auto;}',
      '.ag-pp-reset-label{pointer-events:none;line-height:1;}',
      '.ag-pp-reset-kbd{display:inline-flex;align-items:center;justify-content:center;height:15px;min-width:15px;padding:0 4px;border-radius:4px;background:var(--pp-reset-kbd-bg);border:1px solid var(--pp-reset-kbd-border);font-size:9.5px;font-weight:700;font-family:"JetBrains Mono",Consolas,monospace;line-height:1;opacity:0.86;pointer-events:none;}',
      '.ag-pp-hud-reset-btn[data-rotated="0"]{opacity:0.42;}',
      '.ag-pp-hud-reset-btn[data-rotated="0"]:hover{opacity:0.92;color:var(--pp-hud-hover-fg);}',
      '.ag-pp-hud-reset-btn:active{transform:translateY(0.5px) scale(0.96);}',
      '.ag-pp-hud-reset-btn[data-rotated="1"]{opacity:1;color:var(--pp-hud-fg);background:var(--pp-reset-active-bg);border-color:var(--pp-reset-active-ring);box-shadow:var(--pp-reset-active-shadow);}',
      '.ag-pp-hold-ring{position:fixed;pointer-events:none;z-index:2147483645;box-sizing:border-box;}',
      '.ag-pp-hold-ring svg{display:block;width:100%;height:100%;overflow:visible;}',
      '.ag-pp-mini-keycap{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:0.5px;height:16px;padding:0 5px;margin:0 2px;border-radius:4px;box-sizing:border-box;flex:0 0 auto;background:var(--mk-bg,rgba(255,255,255,0.045));color:var(--mk-fg,var(--secondary-foreground,#C8D0DF));border:1px solid var(--mk-border,rgba(218,228,255,0.19));box-shadow:none;font-family:var(--ag-cs-mono-stack,"JetBrains Mono","Google Sans Code","SF Mono","Cascadia Code",Consolas,ui-monospace,monospace);font-size:9.5px;font-weight:600;line-height:1;vertical-align:middle;pointer-events:none;user-select:none;-webkit-user-select:none;font-variant-numeric:tabular-nums;letter-spacing:0.015em;}',
      'html[data-ag-pp-open="1"] .ag-pp-mini-keycap{pointer-events:auto;cursor:pointer;}',
      '.ag-pp-mk-z{position:relative;font-size:9.5px;font-weight:600;line-height:1;letter-spacing:0.01em;}',
      '.ag-pp-mk-z:empty{display:none;}',
      '.ag-pp-mk-sym{position:relative;font-size:9.5px;font-weight:600;line-height:1;letter-spacing:0.015em;}',
      /* Native Host Tooltip Suppression during Long-Press Hold & Open Picker */
      'html[data-ag-pp-holding="1"] [role="tooltip"], html[data-ag-pp-open="1"] [role="tooltip"] { opacity: 0 !important; visibility: hidden !important; pointer-events: none !important; }',
      'html[data-ag-pp-open="1"] #ag-prism-periodic-picker-root .ag-pp-source-row:hover .ag-pp-bench-tooltip, html[data-ag-pp-open="1"] #ag-prism-periodic-picker-root .ag-pp-source-row:focus-within .ag-pp-bench-tooltip { opacity: 1 !important; visibility: visible !important; transform: translateY(0); pointer-events: auto !important; }',
      /* Motion Level Blur Downgrade (medium / low / subtle / off) */
      'html[data-ag-cs-motion="medium"] #ag-prism-periodic-picker-root,html[data-ag-cs-motion="low"] #ag-prism-periodic-picker-root,html[data-ag-cs-motion="subtle"] #ag-prism-periodic-picker-root,html[data-ag-cs-motion="off"] #ag-prism-periodic-picker-root{backdrop-filter:none !important;-webkit-backdrop-filter:none !important;}',
      'html[data-ag-cs-motion="medium"] #ag-prism-periodic-picker-root .ag-pp-floor-shadow::before,html[data-ag-cs-motion="medium"] #ag-prism-periodic-picker-root .ag-pp-floor-shadow::after,html[data-ag-cs-motion="low"] #ag-prism-periodic-picker-root .ag-pp-floor-shadow::before,html[data-ag-cs-motion="low"] #ag-prism-periodic-picker-root .ag-pp-floor-shadow::after,html[data-ag-cs-motion="subtle"] #ag-prism-periodic-picker-root .ag-pp-floor-shadow::before,html[data-ag-cs-motion="subtle"] #ag-prism-periodic-picker-root .ag-pp-floor-shadow::after,html[data-ag-cs-motion="off"] #ag-prism-periodic-picker-root .ag-pp-floor-shadow::before,html[data-ag-cs-motion="off"] #ag-prism-periodic-picker-root .ag-pp-floor-shadow::after{filter:none !important;opacity:0.42;}',
      'html[data-ag-cs-motion="off"] #ag-prism-periodic-picker-root,html[data-ag-cs-motion="off"] #ag-prism-periodic-picker-root *{transition:none !important;transition-delay:0ms !important;animation:none !important;}',
      '@media (prefers-reduced-motion:reduce){',
      '#ag-prism-periodic-picker-root,.ag-pp-spatial-dock,.ag-pp-bento-grid,.ag-pp-stage,.ag-pp-right-wing,.ag-pp-hud-pill,.ag-pp-hud-reset-btn,.ag-pp-floor-shadow,.ag-pp-radar-poly,.ag-pp-radar-poly-runner,.ag-pp-radar-poly-cmp,.ag-pp-radar-fill,.ag-pp-crystal-fill,.ag-pp-bench-tooltip,.ag-pp-bento-card.is-session-switching .ag-pp-spec-body,.ag-pp-bento-card.is-session-switching .ag-pp-tele-screen,.ag-pp-bento-card.is-session-switching .ag-pp-tele-subscreen{transition:none !important;transition-delay:0ms !important;animation:none !important;}',
      '}',
    ].join('\n');

    function buildPickerCss() {
      return PICKER_CSS;
    }

    /* ── Safe DOM & Isolation Helpers ──────────────────────────────────────── */

    function safeRemove(node) {
      if (!node) return;
      if (typeof node.remove === 'function') {
        node.remove();
      } else if (node.parentNode && typeof node.parentNode.removeChild === 'function') {
        node.parentNode.removeChild(node);
      } else if (node.parentElement && typeof node.parentElement.removeChild === 'function') {
        node.parentElement.removeChild(node);
      }
    }

    function setStyleVar(el, prop, val) {
      if (!el || !el.style) return;
      if (val === null || val === undefined || val === '') {
        if (typeof el.style.removeProperty === 'function') {
          el.style.removeProperty(prop);
        } else {
          delete el.style[prop];
        }
        return;
      }
      if (typeof el.style.setProperty === 'function') {
        el.style.setProperty(prop, String(val));
      } else {
        el.style[prop] = String(val);
      }
    }

    function mkEl(doc, tag, className, text) {
      var el = doc.createElement(tag);
      if (className) el.className = className;
      if (text !== undefined && text !== null) el.textContent = String(text);
      return el;
    }

    function mkSvg(doc, tag, attrs) {
      var el =
        typeof doc.createElementNS === 'function' ? doc.createElementNS(SVG_NS, tag) : doc.createElement(tag);
      if (attrs) {
        var keys = Object.keys(attrs);
        for (var i = 0; i < keys.length; i += 1) {
          el.setAttribute(keys[i], String(attrs[keys[i]]));
        }
      }
      return el;
    }

    /**
     * Stamp full 5+1 anti-translation / ownership markers so host-i18n never rewrites Periodic Picker DOM.
     */
    function markPeriodicOwnedRoot(el) {
      if (!el || typeof el !== 'object') return el;
      if (typeof el.setAttribute === 'function') {
        el.setAttribute('data-ag-no-i18n', '');
        el.setAttribute('data-ag-owned', '1');
        el.setAttribute('translate', 'no');
        el.setAttribute('data-no-translate', '1');
        el.setAttribute('data-ag-localization-skip', 'true');
        el.setAttribute('data-agy-no-translate', 'true');
        el.setAttribute('data-antigravity-zh-skip', '1');
      }
      if (el.classList && typeof el.classList.add === 'function') {
        if (!el.classList.contains('notranslate')) el.classList.add('notranslate');
      } else {
        var cur = String(el.className || '');
        if (!/(?:^|\s)notranslate(?:\s|$)/.test(cur)) {
          el.className = cur ? cur + ' notranslate' : 'notranslate';
        }
      }
      return el;
    }

    function isZhLocale(doc, rt) {
      var l = resolveLocale(doc, rt);
      return l === 'zh-CN' || l === 'zh-TW';
    }

    var _bentoRmMqlCache = typeof WeakMap === 'function' ? new WeakMap() : null;
    function isReducedMotion(doc, rt) {
      try {
        if (doc && doc.documentElement && doc.documentElement.getAttribute('data-ag-cs-motion') === 'off') {
          return true;
        }
        if (rt && typeof rt.matchMedia === 'function') {
          var mm = rt.matchMedia;
          if (_bentoRmMqlCache) {
            var cached = _bentoRmMqlCache.get(rt);
            if (cached && cached.fn === mm && cached.mq) {
              return Boolean(cached.mq.matches);
            }
            var mq = mm.call(rt, '(prefers-reduced-motion: reduce)');
            _bentoRmMqlCache.set(rt, { fn: mm, mq: mq });
            return Boolean(mq && mq.matches);
          }
          return Boolean(mm.call(rt, '(prefers-reduced-motion: reduce)').matches);
        }
      } catch (e) {}
      return false;
    }

    function ensureStyles(doc) {
      if (!doc) return null;
      var existing = typeof doc.getElementById === 'function' ? doc.getElementById(STYLE_ID) : null;
      if (existing) return existing;
      var styleEl = doc.createElement('style');
      styleEl.id = STYLE_ID;
      styleEl.setAttribute('id', STYLE_ID);
      styleEl.textContent = PICKER_CSS;
      var mountTarget = doc.head || doc.documentElement;
      if (mountTarget && typeof mountTarget.appendChild === 'function') {
        mountTarget.appendChild(styleEl);
      }
      return styleEl;
    }

    function cleanupUiResiduals(doc) {
      if (!doc) return;
      try {
        if (doc.documentElement && typeof doc.documentElement.removeAttribute === 'function') {
          doc.documentElement.removeAttribute(ROOT_MARKER_ATTR);
          doc.documentElement.removeAttribute('data-ag-pp-open');
          doc.documentElement.removeAttribute('data-ag-pp-holding');
        }
      } catch (e) {}
      try {
        if (typeof doc.getElementById === 'function') {
          safeRemove(doc.getElementById(STYLE_ID));
          safeRemove(doc.getElementById(ROOT_ID));
        }
        if (typeof doc.querySelectorAll === 'function') {
          var leftovers = doc.querySelectorAll(
            '#' + STYLE_ID + ', #' + ROOT_ID + ', .ag-pp-hold-ring, .ag-pp-mini-keycap'
          );
          for (var i = 0; i < leftovers.length; i += 1) {
            safeRemove(leftovers[i]);
          }
        }
      } catch (e) {}
    }

    /* ── Theme Profile & Color Computation ─────────────────────────────────── */

    function parseHexRgb255(hex, fallbackRgb) {
      var s = String(hex || '').trim();
      if (s.charAt(0) === '#') s = s.slice(1);
      if (s.length === 3) {
        s = s.charAt(0) + s.charAt(0) + s.charAt(1) + s.charAt(1) + s.charAt(2) + s.charAt(2);
      }
      if (s.length !== 6) return fallbackRgb || [136, 150, 172];
      var num = parseInt(s, 16);
      if (isNaN(num)) return fallbackRgb || [136, 150, 172];
      return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
    }

    function lerpRgb255(a, b, t) {
      var k = t < 0 ? 0 : t > 1 ? 1 : t;
      return [
        Math.round(a[0] + (b[0] - a[0]) * k),
        Math.round(a[1] + (b[1] - a[1]) * k),
        Math.round(a[2] + (b[2] - a[2]) * k),
      ];
    }

    function rgba255Css(rgb, alpha) {
      var a = Math.round((alpha < 0 ? 0 : alpha > 1 ? 1 : alpha) * 1000) / 1000;
      return 'rgba(' + rgb[0] + ', ' + rgb[1] + ', ' + rgb[2] + ', ' + a + ')';
    }

    function rgb255ToHex(rgb) {
      var to2 = function (v) {
        var h = Math.max(0, Math.min(255, Math.round(v))).toString(16);
        return h.length === 1 ? '0' + h : h;
      };
      return ('#' + to2(rgb[0]) + to2(rgb[1]) + to2(rgb[2])).toUpperCase();
    }

    function resolveThemeNativeMiniBadgeColors(tintKey, profile) {
      var prof = profile || { id: 'obsidian-dark', isLight: false, isMono: false, accent: 'follow', primaryHex: '#669DF6' };
      var kitId = MINI_BADGE_THEME_SUBSTRATES[prof.id] ? prof.id : (prof.isLight ? 'crystal-light' : 'obsidian-dark');
      var sub = MINI_BADGE_THEME_SUBSTRATES[kitId];

      if (prof.isMono || prof.accent === 'mono') {
        var monoFg = prof.isLight
          ? (kitId === 'alabaster-light' ? '#3B352E' : '#334155')
          : (kitId === 'warm-dark' ? '#CFC8BE' : '#C8CDD6');
        return {
          bg: rgba255Css(sub.surfaceRgb, sub.surfaceBaseAlpha + 0.012),
          fg: monoFg,
          border: rgba255Css(sub.borderRgb, sub.borderAlpha),
        };
      }

      var soulEntry = MINI_BADGE_SOUL_HEX[tintKey] || MINI_BADGE_SOUL_HEX.fallback;
      var soulHex = prof.isLight ? soulEntry.light : soulEntry.dark;
      var soulRgb = parseHexRgb255(soulHex, sub.fgRgb);

      var harmonyRgb = soulRgb;
      var acc = String(prof.accent || 'follow');
      if (acc === 'cobalt' || acc === 'iris' || acc === 'amber') {
        var hostAccRgb = parseHexRgb255(prof.primaryHex, soulRgb);
        harmonyRgb = lerpRgb255(hostAccRgb, soulRgb, 0.25);
      } else if (kitId === 'warm-dark' && tintKey === 'orchestrator') {
        harmonyRgb = [228, 182, 98];
      }

      var bgRgb = lerpRgb255(sub.surfaceRgb, harmonyRgb, 0.62);
      var borderRgb = lerpRgb255(sub.borderRgb, harmonyRgb, sub.borderTintMix);
      var fgRgb = lerpRgb255(sub.fgRgb, harmonyRgb, sub.fgTintMix);

      return {
        bg: rgba255Css(bgRgb, sub.tintSurfaceAlpha),
        fg: rgb255ToHex(fgRgb),
        border: rgba255Css(borderRgb, sub.borderAlpha + 0.04),
      };
    }

    var cachedComputedThemeByDoc = typeof WeakMap === 'function' ? new WeakMap() : null;

    function invalidateComputedThemeCache(doc) {
      if (cachedComputedThemeByDoc && doc && typeof doc === 'object') {
        cachedComputedThemeByDoc.delete(doc);
      }
    }

    function detectLightDarkMode(doc, rt) {
      try {
        var de = doc && doc.documentElement;
        if (de && typeof de.getAttribute === 'function') {
          var explicit = de.getAttribute('data-ag-cs-theme') || de.getAttribute('data-theme') || '';
          if (explicit === 'light') return 'light';
          if (explicit === 'dark') return 'dark';
        }
        if (de && de.classList && typeof de.classList.contains === 'function') {
          if (de.classList.contains('light') && !de.classList.contains('dark')) return 'light';
          if (de.classList.contains('dark')) return 'dark';
        }
        if (doc && doc.body && doc.body.classList && typeof doc.body.classList.contains === 'function') {
          if (doc.body.classList.contains('light') && !doc.body.classList.contains('dark')) return 'light';
          if (doc.body.classList.contains('dark')) return 'dark';
        }
        if (cachedComputedThemeByDoc && doc && typeof doc === 'object') {
          var cachedMode = cachedComputedThemeByDoc.get(doc);
          if (cachedMode === 'light' || cachedMode === 'dark') return cachedMode;
        }
        if (rt && typeof rt.getComputedStyle === 'function' && (doc.body || de)) {
          var bg = rt.getComputedStyle(doc.body || de).backgroundColor || '';
          var m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([0-9.]+))?\s*\)/i.exec(bg);
          if (m) {
            var alpha = m[4] !== undefined ? parseFloat(m[4]) : 1;
            if (alpha > 0.1) {
              var lum = 0.299 * Number(m[1]) + 0.587 * Number(m[2]) + 0.114 * Number(m[3]);
              var resolvedMode = lum > 145 ? 'light' : 'dark';
              if (cachedComputedThemeByDoc && doc && typeof doc === 'object') {
                cachedComputedThemeByDoc.set(doc, resolvedMode);
              }
              return resolvedMode;
            }
          }
        }
        var fallbackMode = 'dark';
        if (rt && typeof rt.matchMedia === 'function') {
          if (rt.matchMedia('(prefers-color-scheme: light)').matches) fallbackMode = 'light';
        }
        if (cachedComputedThemeByDoc && doc && typeof doc === 'object') {
          cachedComputedThemeByDoc.set(doc, fallbackMode);
        }
        return fallbackMode;
      } catch (e) {}
      return 'dark';
    }

    function resolvePrismThemeProfile(doc, rt) {
      var de = doc && doc.documentElement;
      var ga = function (attr) {
        try {
          return de && typeof de.getAttribute === 'function' ? de.getAttribute(attr) || '' : '';
        } catch (e) {
          return '';
        }
      };

      var rawPalette = ga('data-ag-cs-palette').toLowerCase();
      var palette =
        rawPalette === 'warm' || rawPalette === 'claude' || rawPalette === 'host' || rawPalette === 'obsidian'
          ? rawPalette
          : 'obsidian';

      var theme = detectLightDarkMode(doc, rt);
      var isLight = theme === 'light';

      var rawLightPreset = ga('data-ag-cs-light-preset').toLowerCase();
      var lightPreset = rawLightPreset === 'alabaster' ? 'alabaster' : 'crystal';

      var rawAccent = ga('data-ag-cs-accent').toLowerCase();
      var accent =
        rawAccent === 'cobalt' ||
        rawAccent === 'iris' ||
        rawAccent === 'amber' ||
        rawAccent === 'mono' ||
        rawAccent === 'follow'
          ? rawAccent
          : 'follow';
      var isMono = accent === 'mono';

      var rawCorners = ga('data-ag-cs-corners').toLowerCase();
      var corners = rawCorners === 'sharp' || rawCorners === 'soft' ? rawCorners : 'balanced';

      var rawAmbient = ga('data-ag-cs-ambient');
      var ambientMul = 1;
      if (rawAmbient !== '' && rawAmbient !== null && rawAmbient !== undefined) {
        var numAmb = Number(rawAmbient);
        if (Number.isFinite(numAmb)) {
          ambientMul = numAmb <= 0 ? 0 : numAmb > 1 ? Math.min(1, numAmb / 100) : numAmb;
        }
      }

      var isWarmTone = palette === 'warm' || palette === 'claude';
      var kitId = 'obsidian-dark';
      if (isLight) {
        kitId = isWarmTone || lightPreset === 'alabaster' ? 'alabaster-light' : 'crystal-light';
      } else {
        kitId = isWarmTone ? 'warm-dark' : 'obsidian-dark';
      }

      var rimTone = 'default';
      if (accent === 'mono' || accent === 'cobalt' || accent === 'iris' || accent === 'amber') {
        rimTone = accent;
      } else if (isWarmTone || (isLight && lightPreset === 'alabaster')) {
        rimTone = 'warm';
      }

      var primaryHex = '#669DF6';
      if (accent === 'cobalt') {
        primaryHex = isLight ? '#2563EB' : '#669DF6';
      } else if (accent === 'iris') {
        primaryHex = isLight ? '#7C3AED' : '#A58AF8';
      } else if (accent === 'amber') {
        primaryHex = isLight ? '#D97706' : '#F2B84B';
      } else if (accent === 'mono') {
        primaryHex = isLight ? '#334155' : '#D4D7E0';
      } else if (kitId === 'warm-dark') {
        primaryHex = '#D97757';
      } else if (kitId === 'alabaster-light') {
        primaryHex = isWarmTone ? '#C25934' : '#B45309';
      } else if (kitId === 'crystal-light') {
        primaryHex = '#2563EB';
      }

      return {
        id: kitId,
        theme: theme,
        isLight: isLight,
        palette: palette,
        lightPreset: lightPreset,
        accent: accent,
        rimTone: rimTone,
        isMono: isMono,
        corners: corners,
        ambientMul: ambientMul,
        primaryHex: primaryHex,
      };
    }

    function miniKeycapColorsForZ(slotZ, profile) {
      return resolveThemeNativeMiniBadgeColors(slotZ, profile);
    }

    function miniKeycapColorsForAux(miniKey, profile) {
      return resolveThemeNativeMiniBadgeColors(miniKey || 'fallback', profile);
    }

    function hudGemColorsForZ(slotZ, profile) {
      if (profile && profile.isMono) {
        return profile.isLight ? HUD_GEM_STYLES.monoLight : HUD_GEM_STYLES.monoDark;
      }
      return HUD_GEM_STYLES[slotZ] || HUD_GEM_STYLES.fallback;
    }

    function selectHudIslandElements(entries, availMap) {
      if (!Array.isArray(entries) || entries.length === 0) {
        return CORE_FOUR_ELEMENTS.slice();
      }
      if (entries.length <= 4) {
        return entries.slice();
      }
      var picked = [];
      var seen = new Set();
      for (var ci = 0; ci < CORE_FOUR_ELEMENTS.length; ci += 1) {
        var cz = CORE_FOUR_ELEMENTS[ci].slotZ;
        if (availMap && availMap.has(cz)) {
          picked.push(availMap.get(cz));
          seen.add(cz);
        }
      }
      for (var ei = 0; ei < entries.length && picked.length < 4; ei += 1) {
        var ez = entries[ei].slotZ || entries[ei].z;
        if (!seen.has(ez)) {
          picked.push(entries[ei]);
          seen.add(ez);
        }
      }
      return picked;
    }

    function resolveHoldRingStops(profile) {
      if (profile.accent === 'cobalt') {
        return {
          track: profile.isLight ? 'rgba(63,102,133,0.20)' : 'rgba(81,125,159,0.24)',
          stops: profile.isLight
            ? [['0%', '#3F6685'], ['100%', '#517D9F']]
            : [['0%', '#517D9F'], ['100%', '#7DA4C4']],
        };
      }
      if (profile.accent === 'iris') {
        return {
          track: profile.isLight ? 'rgba(66,86,139,0.20)' : 'rgba(130,148,204,0.24)',
          stops: profile.isLight
            ? [['0%', '#31426E'], ['100%', '#566CA3']]
            : [['0%', '#42568B'], ['100%', '#8B9FD4']],
        };
      }
      if (profile.accent === 'amber') {
        return {
          track: profile.isLight ? 'rgba(180,108,42,0.22)' : 'rgba(214,162,84,0.24)',
          stops: profile.isLight
            ? [['0%', '#B46928'], ['100%', '#D48B3E']]
            : [['0%', '#C98A42'], ['100%', '#E0B06A']],
        };
      }
      if (profile.accent === 'mono') {
        return {
          track: profile.isLight ? 'rgba(35,38,44,0.18)' : 'rgba(212,215,224,0.20)',
          stops: profile.isLight
            ? [['0%', '#23262C'], ['100%', '#525866']]
            : [['0%', '#F2F4F8'], ['100%', '#8E96A4']],
        };
      }
      if (profile.palette === 'warm' || profile.palette === 'claude' || profile.id === 'alabaster-light') {
        return {
          track: profile.isLight ? 'rgba(170,110,64,0.18)' : 'rgba(217,138,78,0.22)',
          stops: [['0%', '#D8B36A'], ['52%', '#D98A4E'], ['100%', '#DCE4F0']],
        };
      }
      return {
        track: profile.isLight ? 'rgba(51,65,85,0.18)' : 'rgba(226,232,240,0.22)',
        stops: [['0%', '#7DD3FC'], ['35%', '#DCE4F0'], ['70%', '#D98A4E'], ['100%', '#4F7CF0']],
      };
    }

    function spawnHoldRing(doc, rt, btn, reqRaf, holdOpenDelayMs, holdRingDelayMs) {
      if (!doc || !doc.body || !btn || typeof btn.getBoundingClientRect !== 'function') return null;
      var rect = btn.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return null;

      var profile = resolvePrismThemeProfile(doc, rt);
      var ringSpec = resolveHoldRingStops(profile);
      var pad = 3;
      var w = Math.round(rect.width + pad * 2);
      var h = Math.round(rect.height + pad * 2);
      var radius = 10;
      try {
        if (rt && typeof rt.getComputedStyle === 'function') {
          var cs = rt.getComputedStyle(btn);
          var parsedR = parseFloat(cs && cs.borderRadius);
          if (Number.isFinite(parsedR) && parsedR >= 0) {
            radius = Math.min(Math.round(h / 2), Math.round(parsedR + pad));
          }
        }
      } catch (e) {}

      var wrap = mkEl(doc, 'div', 'ag-pp-hold-ring');
      markPeriodicOwnedRoot(wrap);
      setStyleVar(wrap, 'left', Math.round(rect.left - pad) + 'px');
      setStyleVar(wrap, 'top', Math.round(rect.top - pad) + 'px');
      setStyleVar(wrap, 'width', w + 'px');
      setStyleVar(wrap, 'height', h + 'px');

      var perim = Math.max(40, Math.round(2 * (w + h)));
      var svg = mkSvg(doc, 'svg', { viewBox: '0 0 ' + w + ' ' + h, fill: 'none' });
      var defs = mkSvg(doc, 'defs');
      var gradId = 'ag-pp-ring-grad';
      var grad = mkSvg(doc, 'linearGradient', { id: gradId, x1: '0%', y1: '0%', x2: '100%', y2: '100%' });
      for (var i = 0; i < ringSpec.stops.length; i += 1) {
        grad.appendChild(mkSvg(doc, 'stop', { offset: ringSpec.stops[i][0], 'stop-color': ringSpec.stops[i][1] }));
      }
      defs.appendChild(grad);
      svg.appendChild(defs);

      svg.appendChild(
        mkSvg(doc, 'rect', {
          x: '1',
          y: '1',
          width: String(Math.max(2, w - 2)),
          height: String(Math.max(2, h - 2)),
          rx: String(radius),
          ry: String(radius),
          stroke: ringSpec.track,
          'stroke-width': '2',
        })
      );
      var progRect = mkSvg(doc, 'rect', {
        x: '1',
        y: '1',
        width: String(Math.max(2, w - 2)),
        height: String(Math.max(2, h - 2)),
        rx: String(radius),
        ry: String(radius),
        stroke: 'url(#' + gradId + ')',
        'stroke-width': '2.2',
        'stroke-linecap': 'round',
        'stroke-dasharray': String(perim),
        'stroke-dashoffset': String(perim),
      });
      svg.appendChild(progRect);
      wrap.appendChild(svg);
      doc.body.appendChild(wrap);

      var openMs = Number(holdOpenDelayMs) || 420;
      var ringMs = Number(holdRingDelayMs) || 110;
      var remainMs = Math.max(80, openMs - ringMs);
      var raf = reqRaf
        ? reqRaf(function () {
            setStyleVar(progRect, 'transition', 'stroke-dashoffset ' + remainMs + 'ms linear');
            progRect.setAttribute('stroke-dashoffset', '0');
          })
        : 0;

      return { el: wrap, raf: raf };
    }

    /* ── Deskmat Topographic Silkscreen & Studio Floor Rig ──────────────────── */

    function resolveGrainAssets(rt) {
      if (rt && rt.__agPrismGrainAssets && typeof rt.__agPrismGrainAssets === 'object') {
        return rt.__agPrismGrainAssets;
      }
      if (
        typeof globalThis === 'object' &&
        globalThis &&
        globalThis.__agPrismGrainAssets &&
        typeof globalThis.__agPrismGrainAssets === 'object'
      ) {
        return globalThis.__agPrismGrainAssets;
      }
      if (typeof require === 'function') {
        try {
          var mod = require('./pbr-grain-assets.js');
          if (mod && typeof mod === 'object') return mod;
        } catch (e) {}
      }
      return null;
    }

    var SAFE_SVG_PATH_RE = /^[MmLlHhVvCcSsQqTtAaZz0-9.,+\-\sEe]+$/;

    function normalizeSvgAsset(rawAsset, fallbackSize) {
      if (!rawAsset || typeof rawAsset !== 'object') return null;
      var defDim = Number(fallbackSize) > 0 ? Number(fallbackSize) : 2048;
      var viewBoxStr = '0 0 ' + defDim + ' ' + defDim;
      var rawVb = rawAsset.viewBox;
      if (typeof rawVb === 'number' && Number.isFinite(rawVb) && rawVb > 0) {
        var hNum = Number(rawAsset.height || rawAsset.vbH);
        viewBoxStr = '0 0 ' + rawVb + ' ' + (Number.isFinite(hNum) && hNum > 0 ? hNum : rawVb);
      } else if (typeof rawVb === 'string' && rawVb.trim()) {
        var trimmedVb = rawVb.trim();
        if (/^\d+(?:\.\d+)?$/.test(trimmedVb)) {
          viewBoxStr = '0 0 ' + trimmedVb + ' ' + trimmedVb;
        } else if (/^[\d.\-\s]+$/.test(trimmedVb)) {
          viewBoxStr = trimmedVb.replace(/\s+/g, ' ');
        }
      } else if (Number(rawAsset.width) > 0 && Number(rawAsset.height) > 0) {
        viewBoxStr = '0 0 ' + Number(rawAsset.width) + ' ' + Number(rawAsset.height);
      }

      var rawPaths = Array.isArray(rawAsset.paths) ? rawAsset.paths : [];
      var paths = [];
      for (var i = 0; i < rawPaths.length; i += 1) {
        var item = rawPaths[i];
        var dStr = '';
        var strokeOnly = false;
        var strokeWidth = 0;
        var fillRule = '';
        if (typeof item === 'string') {
          dStr = item.trim();
          if (dStr && !/[zZ]\s*$/.test(dStr)) {
            strokeOnly = true;
            strokeWidth = 2.2;
          }
        } else if (item && typeof item === 'object' && typeof item.d === 'string') {
          dStr = item.d.trim();
          if (item.fill === 'none' || item.strokeOnly) strokeOnly = true;
          if (Number(item.strokeWidth) > 0) strokeWidth = Number(item.strokeWidth);
          if (typeof item.fillRule === 'string' && item.fillRule) fillRule = item.fillRule;
        }
        if (!dStr || !SAFE_SVG_PATH_RE.test(dStr)) continue;
        paths.push({ d: dStr, strokeOnly: strokeOnly, strokeWidth: strokeWidth, fillRule: fillRule });
      }
      if (!paths.length) return null;
      return { viewBox: viewBoxStr, paths: paths };
    }

    function appendSvgPathsToNode(doc, svgEl, spec) {
      for (var i = 0; i < spec.paths.length; i += 1) {
        var p = spec.paths[i];
        var attrs = { d: p.d };
        if (p.strokeOnly) {
          attrs.fill = 'none';
          attrs.stroke = 'currentColor';
          attrs['stroke-width'] = String(p.strokeWidth || 2.2);
          attrs['stroke-linecap'] = 'round';
          attrs['stroke-linejoin'] = 'round';
        } else {
          attrs.fill = 'currentColor';
          if (p.fillRule) attrs['fill-rule'] = p.fillRule;
        }
        svgEl.appendChild(mkSvg(doc, 'path', attrs));
      }
    }

    function mountDeskmatTopoSvgIfAvailable(doc, stageWrap, rt) {
      if (!doc || !stageWrap) return false;
      if (stageWrap.getAttribute('data-has-topo') === '1') return true;
      var assets = resolveGrainAssets(rt);
      var topoSpec = assets && assets.DESKMAT_TOPO ? normalizeSvgAsset(assets.DESKMAT_TOPO, 2048) : null;
      if (!topoSpec) return false;
      var svg = mkSvg(doc, 'svg', {
        class: 'ag-pp-deskmat-topo',
        viewBox: topoSpec.viewBox,
        preserveAspectRatio: 'xMidYMid slice',
        'aria-hidden': 'true',
        focusable: 'false',
      });
      appendSvgPathsToNode(doc, svg, topoSpec);
      stageWrap.appendChild(svg);
      stageWrap.setAttribute('data-has-topo', '1');
      return true;
    }

    function buildDeskmatStage(doc, rt) {
      var stageWrap = mkEl(doc, 'div', 'ag-pp-deskmat-stage');
      stageWrap.setAttribute('aria-hidden', 'true');
      markPeriodicOwnedRoot(stageWrap);
      stageWrap.setAttribute('data-has-topo', '0');
      var glowEl = mkEl(doc, 'div', 'ag-pp-deskmat-glow');
      var auraEl = mkEl(doc, 'div', 'ag-pp-prism-aura');
      auraEl.setAttribute('aria-hidden', 'true');
      markPeriodicOwnedRoot(auraEl);
      auraEl.appendChild(mkEl(doc, 'div', 'ag-pp-prism-aura-wings'));
      auraEl.appendChild(mkEl(doc, 'div', 'ag-pp-prism-aura-core'));
      stageWrap.appendChild(glowEl);
      stageWrap.appendChild(auraEl);
      mountDeskmatTopoSvgIfAvailable(doc, stageWrap, rt);
      return stageWrap;
    }

    function mountStudioFloorRig(doc, stageContainer) {
      if (!doc || !stageContainer) return null;
      var haloEl = mkEl(doc, 'div', 'ag-pp-studio-halo');
      haloEl.setAttribute('aria-hidden', 'true');
      var shadowEl = mkEl(doc, 'div', 'ag-pp-floor-shadow');
      shadowEl.setAttribute('aria-hidden', 'true');
      stageContainer.appendChild(haloEl);
      stageContainer.appendChild(shadowEl);
      return { haloEl: haloEl, shadowEl: shadowEl };
    }

    /* ── HUD Linear Vector SVG Icons ───────────────────────────────────────── */

    function buildHudResetViewSvg(doc) {
      var svg = mkSvg(doc, 'svg', { viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true', focusable: 'false' });
      svg.appendChild(mkSvg(doc, 'path', { d: 'M4.3 10.2a8.1 8.1 0 0 1 14.2-3.9', stroke: 'currentColor', 'stroke-width': '1.45', 'stroke-linecap': 'round' }));
      svg.appendChild(mkSvg(doc, 'path', { d: 'M18.7 3.5v3.3h-3.3', stroke: 'currentColor', 'stroke-width': '1.45', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
      svg.appendChild(mkSvg(doc, 'path', { d: 'M19.7 13.8a8.1 8.1 0 0 1-14.2 3.9', stroke: 'currentColor', 'stroke-width': '1.35', 'stroke-linecap': 'round', opacity: '0.68' }));
      svg.appendChild(mkSvg(doc, 'circle', { cx: '12', cy: '12', r: '3.2', stroke: 'currentColor', 'stroke-width': '1.35' }));
      svg.appendChild(mkSvg(doc, 'path', { d: 'M12 6.6v1.8M12 15.6v1.8M6.6 12h1.8M15.6 12h1.8', stroke: 'currentColor', 'stroke-width': '1.35', 'stroke-linecap': 'round' }));
      svg.appendChild(mkSvg(doc, 'circle', { cx: '12', cy: '12', r: '0.95', fill: 'currentColor' }));
      return svg;
    }

    function buildHudMuteSvg(doc) {
      var svg = mkSvg(doc, 'svg', { viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true', focusable: 'false' });
      svg.appendChild(mkSvg(doc, 'path', { d: 'M11 5.4L6.4 9.2H3.5v5.6h2.9L11 18.6V5.4z', stroke: 'currentColor', 'stroke-width': '1.35', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
      svg.appendChild(mkSvg(doc, 'path', { class: 'ag-pp-vol-wave', d: 'M15.1 9a4.5 4.5 0 0 1 0 6', stroke: 'currentColor', 'stroke-width': '1.35', 'stroke-linecap': 'round' }));
      svg.appendChild(mkSvg(doc, 'path', { class: 'ag-pp-vol-wave', d: 'M18.1 6.5a8 8 0 0 1 0 11', stroke: 'currentColor', 'stroke-width': '1.35', 'stroke-linecap': 'round' }));
      svg.appendChild(mkSvg(doc, 'path', { class: 'ag-pp-vol-mute', d: 'M15.8 9.6l4.8 4.8', stroke: 'currentColor', 'stroke-width': '1.35', 'stroke-linecap': 'round' }));
      svg.appendChild(mkSvg(doc, 'path', { class: 'ag-pp-vol-mute', d: 'M20.6 9.6l-4.8 4.8', stroke: 'currentColor', 'stroke-width': '1.35', 'stroke-linecap': 'round' }));
      return svg;
    }

    function buildHudCloseSvg(doc) {
      var svg = mkSvg(doc, 'svg', { viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true', focusable: 'false' });
      svg.appendChild(mkSvg(doc, 'path', { d: 'M7.2 7.2l9.6 9.6', stroke: 'currentColor', 'stroke-width': '1.35', 'stroke-linecap': 'round' }));
      svg.appendChild(mkSvg(doc, 'path', { d: 'M16.8 7.2l-9.6 9.6', stroke: 'currentColor', 'stroke-width': '1.35', 'stroke-linecap': 'round' }));
      return svg;
    }

    function buildStageModeIconSvg(doc) {
      var svg = mkSvg(doc, 'svg', { viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true', focusable: 'false' });
      var pathNode = mkSvg(doc, 'path', {
        d: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
        stroke: 'currentColor',
        'stroke-width': '1.6',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      });
      svg.appendChild(pathNode);
      return { svg: svg, path: pathNode };
    }

    function buildCardFlipIconSvg(doc) {
      var svg = mkSvg(doc, 'svg', { viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true', focusable: 'false' });
      svg.appendChild(
        mkSvg(doc, 'path', {
          d: 'M17 4l3 3-3 3M20 7H9a5 5 0 0 0-5 5M7 20l-3-3 3-3M4 17h11a5 5 0 0 0 5-5',
          stroke: 'currentColor',
          'stroke-width': '1.65',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        })
      );
      return svg;
    }

    /* ── Five-Axis Radar, Telemetry Pulse, Acoustics & Dual-Core Topology ──── */

    function computePentagonPoint(cx, cy, radius, idx) {
      var ang = -Math.PI * 0.5 + (idx * Math.PI * 2) / 5;
      return { x: cx + Math.cos(ang) * radius, y: cy + Math.sin(ang) * radius };
    }

    function buildPentagonPointsAttr(cx, cy, radius, ratios) {
      var pts = [];
      for (var i = 0; i < 5; i += 1) {
        var rScale = Array.isArray(ratios) ? Math.max(0.15, Math.min(1, Number(ratios[i]) || 0.5)) : 1;
        var pt = computePentagonPoint(cx, cy, radius * rScale, i);
        pts.push(pt.x.toFixed(1) + ',' + pt.y.toFixed(1));
      }
      return pts.join(' ');
    }

    function buildPentagonPathAttr(cx, cy, radius) {
      var segs = [];
      for (var i = 0; i < 5; i += 1) {
        var pt = computePentagonPoint(cx, cy, radius, i);
        segs.push((i === 0 ? 'M' : 'L') + pt.x.toFixed(1) + ' ' + pt.y.toFixed(1));
      }
      return segs.join(' ') + ' Z';
    }

    function buildFiveAxisRadarSvg(doc, langOrZh) {
      var cx = 66;
      var cy = 68;
      var maxR = 40;
      var pack = getBentoI18nPack(langOrZh);
      var svg = mkSvg(doc, 'svg', {
        class: 'ag-pp-radar-svg',
        viewBox: '0 0 132 132',
        fill: 'none',
        'aria-hidden': 'true',
        focusable: 'false',
      });

      svg.appendChild(mkSvg(doc, 'path', { d: buildPentagonPathAttr(cx, cy, maxR), stroke: 'currentColor', 'stroke-opacity': '0.24', 'stroke-width': '1.05' }));
      svg.appendChild(mkSvg(doc, 'path', { d: buildPentagonPathAttr(cx, cy, maxR * 0.75), stroke: 'currentColor', 'stroke-opacity': '0.14', 'stroke-width': '0.9', 'stroke-dasharray': '2.4 2.2' }));
      svg.appendChild(mkSvg(doc, 'path', { d: buildPentagonPathAttr(cx, cy, maxR * 0.5), stroke: 'currentColor', 'stroke-opacity': '0.12', 'stroke-width': '0.85', 'stroke-dasharray': '2 2.4' }));

      var vertexLabels = [];
      for (var s = 0; s < 5; s += 1) {
        var tip = computePentagonPoint(cx, cy, maxR, s);
        svg.appendChild(mkSvg(doc, 'line', { x1: String(cx), y1: String(cy), x2: tip.x.toFixed(1), y2: tip.y.toFixed(1), stroke: 'currentColor', 'stroke-opacity': '0.14', 'stroke-width': '0.9' }));
        var lPt = computePentagonPoint(cx, cy, maxR + 13.5, s);
        var anchor = s === 0 ? 'middle' : s === 1 || s === 2 ? 'start' : 'end';
        var lx = lPt.x + (s === 1 ? -4 : s === 4 ? 4 : s === 2 ? -5 : s === 3 ? 5 : 0);
        var ly = lPt.y + (s === 0 ? -1.5 : s === 2 || s === 3 ? 3.5 : 2.5);
        var vLbl = mkSvg(doc, 'text', { class: 'ag-pp-radar-vtx-lbl', x: lx.toFixed(1), y: ly.toFixed(1), 'text-anchor': anchor });
        vLbl.textContent = (pack.radarVerts && pack.radarVerts[s]) || RADAR_AXES[s].vertexEn;
        svg.appendChild(vLbl);
        vertexLabels.push(vLbl);
      }

      var rDefs = mkSvg(doc, 'defs');
      var rFillGrad = mkSvg(doc, 'linearGradient', { id: 'ag-pp-radar-fill-grad', x1: '0%', y1: '0%', x2: '100%', y2: '100%' });
      var rFillStop0 = mkSvg(doc, 'stop', { offset: '0%', 'stop-color': '#3B82F6', 'stop-opacity': '0.32' });
      var rFillStop1 = mkSvg(doc, 'stop', { offset: '100%', 'stop-color': '#67E8F9', 'stop-opacity': '0.18' });
      rFillGrad.appendChild(rFillStop0);
      rFillGrad.appendChild(rFillStop1);
      var rStrokeGrad = mkSvg(doc, 'linearGradient', { id: 'ag-pp-radar-stroke-grad', x1: '0%', y1: '0%', x2: '100%', y2: '100%' });
      var rStrokeStop0 = mkSvg(doc, 'stop', { offset: '0%', 'stop-color': '#3B82F6' });
      var rStrokeStop1 = mkSvg(doc, 'stop', { offset: '100%', 'stop-color': '#67E8F9' });
      rStrokeGrad.appendChild(rStrokeStop0);
      rStrokeGrad.appendChild(rStrokeStop1);
      rDefs.appendChild(rFillGrad);
      rDefs.appendChild(rStrokeGrad);
      svg.appendChild(rDefs);

      var runnerPoly = mkSvg(doc, 'polygon', {
        class: 'ag-pp-radar-poly-runner',
        'data-radar-role': 'runner-1h',
        points: buildPentagonPointsAttr(cx, cy, maxR, [0.51, 0.54, 0.54, 0.74, 0.42]),
        fill: 'rgba(56, 189, 248, 0.12)',
        stroke: '#38BDF8',
        'stroke-width': '1.35',
        'stroke-dasharray': '3.2 2.2',
        'stroke-linejoin': 'round',
      });

      var comparePoly = mkSvg(doc, 'polygon', {
        class: 'ag-pp-radar-poly-cmp',
        'data-radar-role': 'compare',
        points: buildPentagonPointsAttr(cx, cy, maxR, [0.60, 0.65, 0.69, 0.84, 0.17]),
        fill: 'rgba(148, 163, 184, 0.08)',
        stroke: '#94A3B8',
        'stroke-width': '1.25',
        'stroke-dasharray': '2.8 2.2',
        'stroke-linejoin': 'round',
      });

      var dataPoly = mkSvg(doc, 'polygon', {
        class: 'ag-pp-radar-poly',
        'data-radar-role': 'primary',
        points: buildPentagonPointsAttr(cx, cy, maxR, [0.60, 0.65, 0.69, 0.84, 0.17]),
        fill: 'url(#ag-pp-radar-fill-grad)',
        stroke: 'url(#ag-pp-radar-stroke-grad)',
        'stroke-width': '1.7',
        'stroke-linejoin': 'round',
      });
      svg.appendChild(dataPoly);

      var dots = [];
      for (var d = 0; d < 5; d += 1) {
        var dp = computePentagonPoint(cx, cy, maxR * 0.65, d);
        var dot = mkSvg(doc, 'circle', { cx: dp.x.toFixed(1), cy: dp.y.toFixed(1), r: '2.1', fill: '#3B82F6' });
        svg.appendChild(dot);
        dots.push(dot);
      }

      return {
        svg: svg,
        poly: dataPoly,
        fillStop0: rFillStop0,
        fillStop1: rFillStop1,
        strokeStop0: rStrokeStop0,
        strokeStop1: rStrokeStop1,
        runnerPoly: runnerPoly,
        runnerMounted: false,
        comparePoly: comparePoly,
        compareMounted: false,
        vertexLabels: vertexLabels,
        dots: dots,
        cx: cx,
        cy: cy,
        maxR: maxR,
      };
    }

    function updateFiveAxisRadarSvg(radarRefs, scores, accentHex, secondaryHex, glowRgba, runnerScores, compareScores, zh, isLight) {
      if (!radarRefs || !radarRefs.poly) return;
      var arr = Array.isArray(scores) && scores.length >= 5 ? scores : [0.6, 0.6, 0.6, 0.6, 0.3];
      var strokeHex = accentHex || (isLight ? '#1D4ED8' : '#3B82F6');
      var secHex = secondaryHex || strokeHex;
      radarRefs.poly.setAttribute('points', buildPentagonPointsAttr(radarRefs.cx, radarRefs.cy, radarRefs.maxR, arr));
      if (radarRefs.fillStop0 && radarRefs.fillStop1 && radarRefs.strokeStop0 && radarRefs.strokeStop1) {
        radarRefs.fillStop0.setAttribute('stop-color', strokeHex);
        radarRefs.fillStop0.setAttribute('stop-opacity', isLight ? '0.24' : '0.34');
        radarRefs.fillStop1.setAttribute('stop-color', secHex);
        radarRefs.fillStop1.setAttribute('stop-opacity', isLight ? '0.14' : '0.20');
        radarRefs.strokeStop0.setAttribute('stop-color', strokeHex);
        radarRefs.strokeStop1.setAttribute('stop-color', secHex);
        radarRefs.poly.setAttribute('stroke', 'url(#ag-pp-radar-stroke-grad)');
        radarRefs.poly.setAttribute('fill', 'url(#ag-pp-radar-fill-grad)');
      } else {
        radarRefs.poly.setAttribute('stroke', strokeHex);
        radarRefs.poly.setAttribute('fill', glowRgba || 'rgba(59, 130, 246, 0.24)');
      }

      if (Array.isArray(radarRefs.vertexLabels)) {
        var pack = getBentoI18nPack(zh);
        for (var vi = 0; vi < radarRefs.vertexLabels.length && vi < RADAR_AXES.length; vi += 1) {
          radarRefs.vertexLabels[vi].textContent = (pack.radarVerts && pack.radarVerts[vi]) || RADAR_AXES[vi].vertexEn;
        }
      }

      var wantRunner = Array.isArray(runnerScores) && runnerScores.length >= 5;
      if (wantRunner && radarRefs.runnerPoly) {
        radarRefs.runnerPoly.setAttribute('points', buildPentagonPointsAttr(radarRefs.cx, radarRefs.cy, radarRefs.maxR, runnerScores));
        radarRefs.runnerPoly.setAttribute('stroke', isLight ? '#0284C7' : '#38BDF8');
        radarRefs.runnerPoly.setAttribute('fill', isLight ? 'rgba(2, 132, 199, 0.10)' : 'rgba(56, 189, 248, 0.12)');
        if (!radarRefs.runnerMounted) {
          if (typeof radarRefs.svg.insertBefore === 'function') {
            radarRefs.svg.insertBefore(radarRefs.runnerPoly, radarRefs.poly);
          } else {
            radarRefs.svg.appendChild(radarRefs.runnerPoly);
          }
          radarRefs.runnerMounted = true;
        }
      } else if (!wantRunner && radarRefs.runnerMounted && radarRefs.runnerPoly) {
        safeRemove(radarRefs.runnerPoly);
        radarRefs.runnerMounted = false;
      }

      var wantCompare = !wantRunner && Array.isArray(compareScores) && compareScores.length >= 5;
      if (wantCompare && radarRefs.comparePoly) {
        radarRefs.comparePoly.setAttribute('points', buildPentagonPointsAttr(radarRefs.cx, radarRefs.cy, radarRefs.maxR, compareScores));
        radarRefs.comparePoly.setAttribute('stroke', isLight ? '#64748B' : '#CBD5E1');
        radarRefs.comparePoly.setAttribute('fill', isLight ? 'rgba(100, 116, 139, 0.08)' : 'rgba(203, 213, 225, 0.09)');
        if (!radarRefs.compareMounted) {
          if (typeof radarRefs.svg.insertBefore === 'function') {
            radarRefs.svg.insertBefore(radarRefs.comparePoly, radarRefs.poly);
          } else {
            radarRefs.svg.appendChild(radarRefs.comparePoly);
          }
          radarRefs.compareMounted = true;
        }
      } else if (!wantCompare && radarRefs.compareMounted && radarRefs.comparePoly) {
        safeRemove(radarRefs.comparePoly);
        radarRefs.compareMounted = false;
      }

      for (var i = 0; i < 5; i += 1) {
        var rScale = Math.max(0.15, Math.min(1, Number(arr[i]) || 0.5));
        var pt = computePentagonPoint(radarRefs.cx, radarRefs.cy, radarRefs.maxR * rScale, i);
        var dot = radarRefs.dots[i];
        if (dot) {
          dot.setAttribute('cx', pt.x.toFixed(1));
          dot.setAttribute('cy', pt.y.toFixed(1));
          dot.setAttribute('fill', i >= 2 ? secHex : strokeHex);
        }
      }
    }

    function buildTelemetryPulseSvg(doc) {
      var svg = mkSvg(doc, 'svg', { class: 'ag-pp-pulse-svg', viewBox: '0 0 180 38', fill: 'none', 'aria-hidden': 'true', focusable: 'false' });
      var defs = mkSvg(doc, 'defs');
      var grad = mkSvg(doc, 'linearGradient', { id: 'ag-pp-pulse-grad', x1: '0%', y1: '0%', x2: '0%', y2: '100%' });
      var stopTop = mkSvg(doc, 'stop', { offset: '0%', 'stop-color': '#3B82F6', 'stop-opacity': '0.28' });
      var stopBot = mkSvg(doc, 'stop', { offset: '100%', 'stop-color': '#67E8F9', 'stop-opacity': '0.0' });
      grad.appendChild(stopTop);
      grad.appendChild(stopBot);
      var lineGrad = mkSvg(doc, 'linearGradient', { id: 'ag-pp-pulse-stroke-grad', x1: '0%', y1: '0%', x2: '100%', y2: '0%' });
      var lStop0 = mkSvg(doc, 'stop', { offset: '0%', 'stop-color': '#3B82F6' });
      var lStop1 = mkSvg(doc, 'stop', { offset: '100%', 'stop-color': '#67E8F9' });
      lineGrad.appendChild(lStop0);
      lineGrad.appendChild(lStop1);
      defs.appendChild(grad);
      defs.appendChild(lineGrad);
      svg.appendChild(defs);

      for (var ti = 0; ti <= 32; ti += 1) {
        var tx = 4 + (ti / 32) * 172;
        var isMajor = ti % 8 === 0;
        svg.appendChild(mkSvg(doc, 'line', { x1: tx.toFixed(1), y1: isMajor ? '1.5' : '3.5', x2: tx.toFixed(1), y2: '6.5', stroke: 'currentColor', 'stroke-opacity': isMajor ? '0.32' : '0.14', 'stroke-width': isMajor ? '0.9' : '0.7' }));
      }

      svg.appendChild(mkSvg(doc, 'line', { x1: '4', y1: '22', x2: '176', y2: '22', stroke: 'currentColor', 'stroke-opacity': '0.12', 'stroke-width': '0.75' }));

      var areaPath = mkSvg(doc, 'path', { d: 'M4 22 L176 22 Z', fill: 'url(#ag-pp-pulse-grad)' });
      var linePath = mkSvg(doc, 'path', { d: 'M4 22 L176 22', stroke: 'url(#ag-pp-pulse-stroke-grad)', 'stroke-width': '1.4', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      var endDot = mkSvg(doc, 'circle', { cx: '176', cy: '22', r: '2.2', fill: '#67E8F9' });
      svg.appendChild(areaPath);
      svg.appendChild(linePath);
      svg.appendChild(endDot);
      return { svg: svg, area: areaPath, line: linePath, dot: endDot, stopTop: stopTop, stopBot: stopBot, lStop0: lStop0, lStop1: lStop1 };
    }

    function updateTelemetryPulseSvg(pulseRefs, points, accentHex, secondaryHex) {
      if (!pulseRefs || !pulseRefs.line) return;
      if (!Array.isArray(points) || points.length < 2) {
        pulseRefs.line.setAttribute('d', 'M4 22 L176 22');
        pulseRefs.area.setAttribute('d', 'M4 22 L176 22 Z');
        pulseRefs.dot.setAttribute('cx', '176');
        pulseRefs.dot.setAttribute('cy', '22');
        return;
      }
      var arr = points;
      var x0 = 4;
      var w = 172;
      var yMid = 22.5;
      var samples = 44;
      var mean = 0;
      for (var mi = 0; mi < arr.length; mi += 1) {
        mean += Number(arr[mi]) || 0.35;
      }
      mean /= arr.length;

      var segs = [];
      var lastX = x0;
      var lastY = yMid;
      for (var i = 0; i <= samples; i += 1) {
        var u = i / samples;
        var px = x0 + u * w;
        var hPos = u * (arr.length - 1);
        var idx0 = Math.floor(hPos);
        var idx1 = Math.min(arr.length - 1, idx0 + 1);
        var frac = hPos - idx0;
        var hVal = (Number(arr[idx0]) || 0.35) * (1 - frac) + (Number(arr[idx1]) || 0.35) * frac;
        var edgeFade = Math.sin(u * Math.PI);
        var b1 = Math.exp(-Math.pow((u - 0.23) / 0.052, 2)) * Math.sin((u - 0.23) * 96) * 1.18;
        var b2 = Math.exp(-Math.pow((u - 0.51) / 0.064, 2)) * Math.sin((u - 0.51) * 112) * 1.52;
        var b3 = Math.exp(-Math.pow((u - 0.8) / 0.056, 2)) * Math.sin((u - 0.8) * 100) * 1.12;
        var microRipple = Math.sin(u * 52 + mean * 8) * 0.14;
        var ampScale = (0.58 + Math.min(0.62, hVal * 0.78)) * (0.24 + 0.76 * edgeFade);
        var dy = (b1 + b2 + b3 + microRipple) * 12.8 * ampScale;
        var py = Math.max(7.5, Math.min(36.5, yMid - dy - (hVal - mean) * 10));
        segs.push((i === 0 ? 'M' : 'L') + px.toFixed(1) + ' ' + py.toFixed(1));
        lastX = px;
        lastY = py;
      }
      var lineD = segs.join(' ');
      var areaD = lineD + ' L' + lastX.toFixed(1) + ' 36 L' + x0.toFixed(1) + ' 36 Z';
      var hex = accentHex || '#3B82F6';
      var sec = secondaryHex || hex;
      pulseRefs.line.setAttribute('d', lineD);
      if (pulseRefs.lStop0 && pulseRefs.lStop1) {
        pulseRefs.lStop0.setAttribute('stop-color', hex);
        pulseRefs.lStop1.setAttribute('stop-color', sec);
        pulseRefs.line.setAttribute('stroke', 'url(#ag-pp-pulse-stroke-grad)');
      } else {
        pulseRefs.line.setAttribute('stroke', hex);
      }
      pulseRefs.area.setAttribute('d', areaD);
      pulseRefs.dot.setAttribute('cx', lastX.toFixed(1));
      pulseRefs.dot.setAttribute('cy', lastY.toFixed(1));
      pulseRefs.dot.setAttribute('fill', sec);
      if (pulseRefs.stopTop) pulseRefs.stopTop.setAttribute('stop-color', hex);
      if (pulseRefs.stopBot) pulseRefs.stopBot.setAttribute('stop-color', sec);
    }

    function buildSoloAcousticsSvg(doc) {
      var svg = mkSvg(doc, 'svg', { class: 'ag-pp-acoustics-svg', viewBox: '0 0 180 36', fill: 'none', 'aria-hidden': 'true', focusable: 'false' });
      var barCount = 29;
      var bars = [];
      var mid = (barCount - 1) * 0.5;
      for (var i = 0; i < barCount; i += 1) {
        var dist = Math.abs(i - mid) / mid;
        var env = Math.max(0.14, Math.pow(1 - dist * 0.88, 1.55));
        var h = Math.max(3, env * 28);
        var x = 6 + i * 5.95;
        var y = 18 - h * 0.5;
        var rect = mkSvg(doc, 'rect', { x: x.toFixed(1), y: y.toFixed(1), width: '2.3', height: h.toFixed(1), rx: '1.15', fill: '#3B82F6', opacity: (0.28 + env * 0.66).toFixed(2) });
        svg.appendChild(rect);
        bars.push(rect);
      }
      return { svg: svg, bars: bars };
    }

    function updateSoloAcousticsSvg(acRefs, accentHex, secondaryHex, energyNorm, seedNum) {
      if (!acRefs || !Array.isArray(acRefs.bars)) return;
      var hex = accentHex || '#3B82F6';
      var sec = secondaryHex || hex;
      var eNorm = Math.max(0.32, Math.min(1.0, Number(energyNorm) || 0.72));
      var seed = Number(seedNum) || 6;
      var count = acRefs.bars.length;
      var mid = (count - 1) * 0.5;
      for (var i = 0; i < count; i += 1) {
        var dist = Math.abs(i - mid) / mid;
        var wave = 0.74 + 0.26 * Math.abs(Math.sin(i * 0.92 + seed * 0.45));
        var env = Math.max(0.12, Math.pow(1 - dist * 0.9, 1.48) * wave * eNorm);
        var h = Math.max(3, env * 30);
        var rect = acRefs.bars[i];
        rect.setAttribute('y', (18 - h * 0.5).toFixed(1));
        rect.setAttribute('height', h.toFixed(1));
        rect.setAttribute('fill', i >= mid ? sec : hex);
        rect.setAttribute('opacity', (0.22 + env * 0.72).toFixed(2));
      }
    }

    function buildDualCoreTopologySvg(doc) {
      var svg = mkSvg(doc, 'svg', { class: 'ag-pp-topo-svg', viewBox: '0 0 180 26', fill: 'none', 'aria-hidden': 'true', focusable: 'false' });
      svg.appendChild(mkSvg(doc, 'path', { d: 'M38 6 L142 6', stroke: 'var(--pp-orch-bus)', 'stroke-width': '1.35', 'stroke-linecap': 'round' }));
      svg.appendChild(mkSvg(doc, 'path', { d: 'M137 3 L143 6 L137 9', stroke: 'var(--pp-orch-bus)', 'stroke-width': '1.35', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
      svg.appendChild(mkSvg(doc, 'path', { d: 'M142 20 L38 20', stroke: 'var(--pp-orch-ret)', 'stroke-width': '1.2', 'stroke-dasharray': '3 2.5', 'stroke-linecap': 'round' }));
      svg.appendChild(mkSvg(doc, 'path', { d: 'M43 17 L37 20 L43 23', stroke: 'var(--pp-orch-ret)', 'stroke-width': '1.2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
      svg.appendChild(mkSvg(doc, 'circle', { cx: '90', cy: '13', r: '3.2', fill: 'var(--pp-orch-node)', stroke: 'var(--pp-orch-bus)', 'stroke-width': '1.2' }));
      return svg;
    }

    /* ── Bento Twin Cards Builder & Incremental Updater ────────────────────── */

    function clearBentoSessionSwitchFade(bentoRefs, rt) {
      if (!bentoRefs) return;
      var clrRaf =
        (rt && typeof rt.cancelAnimationFrame === 'function' ? rt.cancelAnimationFrame.bind(rt) : null) ||
        (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : null);
      var clrT =
        (rt && typeof rt.clearTimeout === 'function' ? rt.clearTimeout.bind(rt) : clearTimeout);
      if (bentoRefs._sessionFadeRaf) {
        if (clrRaf) {
          try {
            clrRaf(bentoRefs._sessionFadeRaf);
          } catch (e) {}
        }
        bentoRefs._sessionFadeRaf = 0;
      }
      if (bentoRefs._sessionFadeTimer) {
        try {
          clrT(bentoRefs._sessionFadeTimer);
        } catch (e2) {}
        bentoRefs._sessionFadeTimer = 0;
      }
    }

    function triggerBentoSessionSwitchFade(bentoRefs, doc, rt) {
      if (!bentoRefs || isReducedMotion(doc, rt)) return;
      clearBentoSessionSwitchFade(bentoRefs, rt);
      var cards = [bentoRefs.specCard, bentoRefs.telePod];
      for (var i = 0; i < cards.length; i += 1) {
        var c = cards[i];
        if (!c || !c.classList) continue;
        c.classList.remove('is-session-switching');
      }
      var reqRaf =
        (rt && typeof rt.requestAnimationFrame === 'function' ? rt.requestAnimationFrame.bind(rt) : null) ||
        (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null);
      var setT = (rt && typeof rt.setTimeout === 'function' ? rt.setTimeout.bind(rt) : setTimeout);
      var applySessionFade = function () {
        bentoRefs._sessionFadeRaf = 0;
        for (var k = 0; k < cards.length; k += 1) {
          if (cards[k] && cards[k].classList) cards[k].classList.add('is-session-switching');
        }
        bentoRefs._sessionFadeTimer = setT(function () {
          bentoRefs._sessionFadeTimer = 0;
          for (var j = 0; j < cards.length; j += 1) {
            if (cards[j] && cards[j].classList) cards[j].classList.remove('is-session-switching');
          }
        }, 180);
      };
      if (reqRaf) {
        bentoRefs._sessionFadeRaf = reqRaf(applySessionFade);
      } else {
        applySessionFade();
      }
    }

    function buildBentoTwinCards(doc, handlers, opts) {
      var langInit = (opts && opts.lang) ? (normalizePeriodicLang(opts.lang) || 'en') : (handlers && handlers.lang) ? (normalizePeriodicLang(handlers.lang) || 'en') : ((opts && opts.zh !== undefined) ? (opts.zh ? 'zh-CN' : 'en') : (handlers && handlers.zh !== undefined) ? (handlers.zh ? 'zh-CN' : 'en') : resolveLocale(doc, opts && opts.root));
      var packInit = getBentoI18nPack(langInit);
      var activeHandlers = handlers || {};

      /* Medium & Narrow Top 38px Hardware Bar */
      var compactBar = mkEl(doc, 'div', 'ag-pp-compact-bar');
      markPeriodicOwnedRoot(compactBar);
      compactBar.setAttribute('data-testid', 'ag-pp-compact-summary');

      var compactLeft = mkEl(doc, 'div', 'ag-pp-compact-left');
      compactLeft.setAttribute('role', 'button');
      compactLeft.setAttribute('tabindex', '0');
      var compactHwBadge = mkEl(doc, 'span', 'ag-pp-compact-hw-badge', 'PRISM-118 // CNC-6063 · 512K TELEMETRY');
      var compactModelPill = mkEl(doc, 'span', 'ag-pp-compact-model-pill');
      var compactPillDot = mkEl(doc, 'span', 'ag-pp-compact-pill-dot');
      compactPillDot.setAttribute('aria-hidden', 'true');
      var compactPillText = mkEl(doc, 'span', '', '6C · High');
      compactModelPill.appendChild(compactPillDot);
      compactModelPill.appendChild(compactPillText);

      var compactDot = mkEl(doc, 'span', 'ag-pp-family-dot ag-pp-narrow-only');
      var compactTitle = mkEl(doc, 'span', 'ag-pp-compact-title ag-pp-narrow-only', 'Gemini 4 Carbon');
      var compactMetrics = mkEl(doc, 'span', 'ag-pp-compact-metrics ag-pp-narrow-only', '');
      var compactToggleLbl = mkEl(doc, 'span', 'ag-pp-compact-toggle-lbl ag-pp-narrow-only', packInit.detailsOpen);
      compactLeft.appendChild(compactHwBadge);
      compactLeft.appendChild(compactModelPill);
      compactLeft.appendChild(compactDot);
      compactLeft.appendChild(compactTitle);
      compactLeft.appendChild(compactMetrics);
      compactLeft.appendChild(compactToggleLbl);

      var compactRight = mkEl(doc, 'div', 'ag-pp-compact-right');
      var compactTeleWrap = mkEl(doc, 'div', 'ag-pp-compact-tele-wrap');
      compactTeleWrap.setAttribute('data-telemetry-available', '0');
      var compact512k = mkEl(doc, 'span', 'ag-pp-compact-512k', packInit.teleOff);
      var compact512kBar = mkEl(doc, 'div', 'ag-pp-compact-tele-bar');
      var compact512kFill = mkEl(doc, 'div', 'ag-pp-compact-tele-fill');
      setStyleVar(compact512kFill, 'width', '0%');
      compact512kBar.appendChild(compact512kFill);
      compactTeleWrap.appendChild(compact512k);
      compactTeleWrap.appendChild(compact512kBar);
      var compactCtrls = mkEl(doc, 'div', 'ag-pp-compact-ctrls');

      var compactStageBtn = mkEl(doc, 'button', 'ag-pp-machined-btn');
      compactStageBtn.type = 'button';
      var compactModeIcon = buildStageModeIconSvg(doc);
      compactStageBtn.appendChild(compactModeIcon.svg);
      compactStageBtn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (activeHandlers && typeof activeHandlers.onToggleStageMode === 'function') activeHandlers.onToggleStageMode();
      });

      var compactMuteBtn = mkEl(doc, 'button', 'ag-pp-machined-btn');
      compactMuteBtn.type = 'button';
      compactMuteBtn.setAttribute('data-muted', '0');
      compactMuteBtn.appendChild(buildHudMuteSvg(doc));
      compactMuteBtn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (activeHandlers && typeof activeHandlers.onToggleMute === 'function') activeHandlers.onToggleMute();
      });

      var compactCloseBtn = mkEl(doc, 'button', 'ag-pp-machined-btn');
      compactCloseBtn.type = 'button';
      compactCloseBtn.appendChild(buildHudCloseSvg(doc));
      compactCloseBtn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (activeHandlers && typeof activeHandlers.onConfirmClose === 'function') activeHandlers.onConfirmClose();
      });

      compactCtrls.appendChild(compactStageBtn);
      compactCtrls.appendChild(compactMuteBtn);
      compactCtrls.appendChild(compactCloseBtn);
      compactRight.appendChild(compactTeleWrap);
      compactRight.appendChild(compactCtrls);

      compactBar.appendChild(compactLeft);
      compactBar.appendChild(compactRight);
      compactBar.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); });
      compactLeft.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (activeHandlers && typeof activeHandlers.onToggleCompactExpand === 'function') activeHandlers.onToggleCompactExpand();
      });
      compactBar.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (ev.target === compactBar && activeHandlers && typeof activeHandlers.onToggleCompactExpand === 'function') {
          activeHandlers.onToggleCompactExpand();
        }
      });

      /* Left Wing: MOD-01 // SPEC */
      var grid = mkEl(doc, 'div', 'ag-pp-bento-grid');
      markPeriodicOwnedRoot(grid);
      grid.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); });
      grid.addEventListener('click', function (ev) { ev.stopPropagation(); });

      var flipInner = mkEl(doc, 'div', 'ag-pp-flip-inner');
      var specCard = mkEl(doc, 'section', 'ag-pp-bento-card ag-pp-spec-card');
      specCard.setAttribute('data-testid', 'ag-pp-bento-spec-card');
      specCard.setAttribute('data-known-benchmark', '1');
      // 独立零子节点倒角高光层，隔离光标 CSS 变量写入避免卡片子树样式重算
      var specCardRim = mkEl(doc, 'div', 'ag-pp-card-rim ag-pp-spec-rim');
      specCardRim.setAttribute('aria-hidden', 'true');
      specCard.appendChild(specCardRim);

      var specHeader = mkEl(doc, 'div', 'ag-pp-cnc-header');
      var specEngrave = mkEl(doc, 'span', 'ag-pp-cnc-label', 'MOD-01 // SPEC');
      var cardFlipBtn = mkEl(doc, 'button', 'ag-pp-card-flip-btn');
      cardFlipBtn.type = 'button';
      cardFlipBtn.setAttribute('data-testid', 'ag-pp-card-flip-btn');
      cardFlipBtn.setAttribute('aria-pressed', 'false');
      cardFlipBtn.appendChild(buildCardFlipIconSvg(doc));
      var cardFlipLabel = mkEl(doc, 'span', '', '512K');
      cardFlipBtn.appendChild(cardFlipLabel);
      cardFlipBtn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (activeHandlers && typeof activeHandlers.onToggleCardFlip === 'function') activeHandlers.onToggleCardFlip();
      });
      specHeader.appendChild(specEngrave);
      specHeader.appendChild(cardFlipBtn);

      var specBody = mkEl(doc, 'div', 'ag-pp-spec-body');

      var specMain = mkEl(doc, 'div', 'ag-pp-spec-main');
      var kickerRow = mkEl(doc, 'div', 'ag-pp-spec-kicker-row');
      var famBadge = mkEl(doc, 'span', 'ag-pp-family-badge');
      var famDot = mkEl(doc, 'span', 'ag-pp-family-dot');
      famDot.setAttribute('aria-hidden', 'true');
      var famText = mkEl(doc, 'span', '', '6 C · DIAMOND');
      famBadge.appendChild(famDot);
      famBadge.appendChild(famText);
      var stateTag = mkEl(doc, 'span', 'ag-pp-state-tag ag-pp-bento-foldable', 'ACTIVE');
      kickerRow.appendChild(famBadge);
      kickerRow.appendChild(stateTag);

      var titleEl = mkEl(doc, 'h2', 'ag-pp-spec-title', 'Gemini 4 Carbon');
      var microTagsEl = mkEl(doc, 'div', 'ag-pp-micro-tags');
      var microTagNodes = [];
      for (var ti = 0; ti < 3; ti += 1) {
        var tagSpan = mkEl(doc, 'span', 'ag-pp-micro-tag', '');
        microTagsEl.appendChild(tagSpan);
        microTagNodes.push(tagSpan);
      }
      var taglineEl = mkEl(doc, 'p', 'ag-pp-spec-tagline ag-pp-bento-foldable', '');

      specMain.appendChild(kickerRow);
      specMain.appendChild(titleEl);
      specMain.appendChild(microTagsEl);
      specMain.appendChild(taglineEl);

      var radarPane = mkEl(doc, 'div', 'ag-pp-recess-screen ag-pp-radar-pane ag-pp-bento-foldable');
      var radarCol = mkEl(doc, 'div', 'ag-pp-radar-col');
      var radarSvgRefs = buildFiveAxisRadarSvg(doc, langInit);
      var radarLegend = mkEl(doc, 'div', 'ag-pp-radar-legend');
      radarLegend.setAttribute('data-show', '0');
      var legPri = mkEl(doc, 'span', 'ag-pp-radar-leg-item');
      legPri.appendChild(mkEl(doc, 'span', 'ag-pp-radar-leg-swatch'));
      var legPriText = mkEl(doc, 'span', '', '6C');
      legPri.appendChild(legPriText);
      var legSec = mkEl(doc, 'span', 'ag-pp-radar-leg-item');
      legSec.appendChild(mkEl(doc, 'span', 'ag-pp-radar-leg-swatch is-dashed'));
      var legSecText = mkEl(doc, 'span', '', '1H');
      legSec.appendChild(legSecText);
      radarLegend.appendChild(legPri);
      radarLegend.appendChild(legSec);
      radarCol.appendChild(radarSvgRefs.svg);
      radarCol.appendChild(radarLegend);

      var radarBarsWrap = mkEl(doc, 'div', 'ag-pp-radar-bars');
      var barRefs = [];
      for (var bi = 0; bi < RADAR_AXES.length; bi += 1) {
        var rRow = mkEl(doc, 'div', 'ag-pp-radar-row');
        var rLbl = mkEl(doc, 'span', 'ag-pp-radar-lbl', (packInit.radarAxes && packInit.radarAxes[bi]) || RADAR_AXES[bi].en);
        var rTrack = mkEl(doc, 'div', 'ag-pp-radar-track');
        var rFill = mkEl(doc, 'div', 'ag-pp-radar-fill');
        setStyleVar(rFill, 'width', '65%');
        rTrack.appendChild(rFill);
        var rValWrap = mkEl(doc, 'span', 'ag-pp-radar-val-wrap');
        var rVal = mkEl(doc, 'span', 'ag-pp-radar-val', '60');
        var rDelta = mkEl(doc, 'span', 'ag-pp-delta-tag', '');
        rValWrap.appendChild(rVal);
        rValWrap.appendChild(rDelta);
        rRow.appendChild(rLbl);
        rRow.appendChild(rTrack);
        rRow.appendChild(rValWrap);
        radarBarsWrap.appendChild(rRow);
        barRefs.push({ lbl: rLbl, fill: rFill, val: rVal, delta: rDelta });
      }
      var scaleRow = mkEl(doc, 'div', 'ag-pp-radar-scale-row');
      scaleRow.appendChild(mkEl(doc, 'span', '', ''));
      var scaleTicks = mkEl(doc, 'div', 'ag-pp-radar-scale-ticks');
      var t0 = mkEl(doc, 'span', '', '0');
      t0.setAttribute('data-tick', '0');
      var t50 = mkEl(doc, 'span', '', '50%');
      t50.setAttribute('data-tick', '50');
      var t75 = mkEl(doc, 'span', '', '75%');
      t75.setAttribute('data-tick', '75');
      var t100 = mkEl(doc, 'span', '', '100');
      t100.setAttribute('data-tick', '100');
      scaleTicks.appendChild(t0);
      scaleTicks.appendChild(t50);
      scaleTicks.appendChild(t75);
      scaleTicks.appendChild(t100);
      scaleRow.appendChild(scaleTicks);
      scaleRow.appendChild(mkEl(doc, 'span', '', ''));
      radarBarsWrap.appendChild(scaleRow);

      radarPane.appendChild(radarCol);
      radarPane.appendChild(radarBarsWrap);

      /* Pure Native Metadata Pane for Unknown / Unlisted Models (isKnownBenchmark === false) */
      var metaPane = mkEl(doc, 'div', 'ag-pp-recess-screen ag-pp-meta-pane ag-pp-bento-foldable');
      metaPane.setAttribute('data-testid', 'ag-pp-unknown-meta-pane');
      var metaKicker = mkEl(doc, 'div', 'ag-pp-meta-kicker', packInit.metaKicker);
      var metaGrid = mkEl(doc, 'div', 'ag-pp-meta-grid');
      var metaModelKey = mkEl(doc, 'span', 'ag-pp-meta-key', packInit.metaModel);
      var metaModelVal = mkEl(doc, 'span', 'ag-pp-meta-val', '');
      var metaEffortKey = mkEl(doc, 'span', 'ag-pp-meta-key', packInit.metaEffort);
      var metaEffortVal = mkEl(doc, 'span', 'ag-pp-meta-val', '');
      var metaIdKey = mkEl(doc, 'span', 'ag-pp-meta-key', packInit.metaId);
      var metaIdVal = mkEl(doc, 'span', 'ag-pp-meta-val', '');
      metaGrid.appendChild(metaModelKey);
      metaGrid.appendChild(metaModelVal);
      metaGrid.appendChild(metaEffortKey);
      metaGrid.appendChild(metaEffortVal);
      metaGrid.appendChild(metaIdKey);
      metaGrid.appendChild(metaIdVal);
      var metaNote = mkEl(doc, 'div', 'ag-pp-meta-note', packInit.metaNote);
      metaPane.appendChild(metaKicker);
      metaPane.appendChild(metaGrid);
      metaPane.appendChild(metaNote);

      var effortStrip = mkEl(doc, 'div', 'ag-pp-effort-strip');
      var effortTopRow = mkEl(doc, 'div', 'ag-pp-effort-row-top');
      var effortCapsuleGroup = mkEl(doc, 'div', 'ag-pp-bento-efforts');
      var effortLockedNoteEl = mkEl(doc, 'span', 'ag-pp-bento-eff-note', '');
      setStyleVar(effortLockedNoteEl, 'display', 'none');
      effortLockedNoteEl.hidden = true;
      effortLockedNoteEl.setAttribute('aria-hidden', 'true');
      effortCapsuleGroup.appendChild(effortLockedNoteEl);
      var effortNoteEl = mkEl(doc, 'span', 'ag-pp-bento-eff-note ag-pp-bento-foldable', '');
      effortTopRow.appendChild(effortCapsuleGroup);
      effortTopRow.appendChild(effortNoteEl);

      var sourceRow = mkEl(doc, 'div', 'ag-pp-source-row ag-pp-bento-foldable');
      var sourceCiteEl = mkEl(doc, 'div', 'ag-pp-bench-source', BENCHMARK_SOURCE_CITATION);
      var infoBtn = mkEl(doc, 'button', 'ag-pp-info-trigger', 'i');
      infoBtn.type = 'button';
      infoBtn.setAttribute('aria-label', packInit.infoAria || 'Benchmark metrics and thinking tiers explanation');
      var benchTooltip = mkEl(doc, 'div', 'ag-pp-bench-tooltip');
      markPeriodicOwnedRoot(benchTooltip);
      benchTooltip.setAttribute('role', 'tooltip');
      var ttHead = mkEl(doc, 'div', 'ag-pp-tt-head', packInit.ttHead);
      var ttLines = [];
      for (var tli = 0; tli < 5; tli += 1) {
        var lineNode = mkEl(doc, 'div', 'ag-pp-tt-line', '');
        benchTooltip.appendChild(lineNode);
        ttLines.push(lineNode);
      }
      benchTooltip.insertBefore(ttHead, ttLines[0]);
      sourceRow.appendChild(sourceCiteEl);
      sourceRow.appendChild(infoBtn);
      sourceRow.appendChild(benchTooltip);

      effortStrip.appendChild(effortTopRow);
      effortStrip.appendChild(sourceRow);

      specBody.appendChild(specMain);
      specBody.appendChild(radarPane);
      specBody.appendChild(metaPane);
      specCard.appendChild(specHeader);
      specCard.appendChild(specBody);
      specCard.appendChild(effortStrip);
      flipInner.appendChild(specCard);
      grid.appendChild(flipInner);

      /* Right Wing: MOD-02 // TELEMETRY */
      var rightWing = mkEl(doc, 'div', 'ag-pp-right-wing');
      markPeriodicOwnedRoot(rightWing);
      rightWing.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); });
      rightWing.addEventListener('click', function (ev) { ev.stopPropagation(); });

      var telePod = mkEl(doc, 'section', 'ag-pp-bento-card ag-pp-telemetry-pod');
      telePod.setAttribute('data-testid', 'ag-pp-bento-telemetry-pod');
      telePod.setAttribute('data-telemetry-available', '0');
      var telePodRim = mkEl(doc, 'div', 'ag-pp-card-rim ag-pp-tele-rim');
      telePodRim.setAttribute('aria-hidden', 'true');
      telePod.appendChild(telePodRim);

      var teleHeader = mkEl(doc, 'div', 'ag-pp-cnc-header');
      var teleKicker = mkEl(doc, 'span', 'ag-pp-cnc-label', 'MOD-02 // TELEMETRY');
      var cardFlipBackBtn = mkEl(doc, 'button', 'ag-pp-card-flip-btn ag-pp-card-flip-back-btn');
      cardFlipBackBtn.type = 'button';
      cardFlipBackBtn.setAttribute('data-testid', 'ag-pp-card-flip-back-btn');
      cardFlipBackBtn.setAttribute('aria-pressed', 'true');
      cardFlipBackBtn.appendChild(buildCardFlipIconSvg(doc));
      var cardFlipBackLabel = mkEl(doc, 'span', '', packInit.specBtn);
      cardFlipBackBtn.appendChild(cardFlipBackLabel);
      cardFlipBackBtn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (activeHandlers && typeof activeHandlers.onToggleCardFlip === 'function') activeHandlers.onToggleCardFlip();
      });
      teleHeader.appendChild(teleKicker);
      teleHeader.appendChild(cardFlipBackBtn);

      var machinedCtrls = mkEl(doc, 'div', 'ag-pp-machined-ctrls');
      var stageWell = mkEl(doc, 'div', 'ag-pp-machined-well');
      var stageModeBtn = mkEl(doc, 'button', 'ag-pp-machined-btn ag-pp-stage-mode-btn');
      stageModeBtn.type = 'button';
      stageModeBtn.setAttribute('data-testid', 'ag-pp-stage-mode-btn');
      stageModeBtn.setAttribute('data-ag-pp-action', 'toggle-stage-mode');
      var modeIconRefs = buildStageModeIconSvg(doc);
      var modeLabelSpan = mkEl(doc, 'span', 'ag-pp-stage-btn-lbl', packInit.stage3d);
      var modeKeyTag = mkEl(doc, 'span', 'ag-pp-stage-key-tag', 'F');
      stageModeBtn.appendChild(modeIconRefs.svg);
      stageModeBtn.appendChild(modeKeyTag);
      stageModeBtn.appendChild(modeLabelSpan);
      stageModeBtn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (activeHandlers && typeof activeHandlers.onToggleStageMode === 'function') activeHandlers.onToggleStageMode();
      });
      stageWell.appendChild(stageModeBtn);

      var muteWell = mkEl(doc, 'div', 'ag-pp-machined-well');
      var quickMuteBtn = mkEl(doc, 'button', 'ag-pp-machined-btn');
      quickMuteBtn.type = 'button';
      quickMuteBtn.setAttribute('data-muted', '0');
      quickMuteBtn.appendChild(buildHudMuteSvg(doc));
      quickMuteBtn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (activeHandlers && typeof activeHandlers.onToggleMute === 'function') activeHandlers.onToggleMute();
      });
      muteWell.appendChild(quickMuteBtn);

      var closeWell = mkEl(doc, 'div', 'ag-pp-machined-well');
      var quickCloseBtn = mkEl(doc, 'button', 'ag-pp-machined-btn');
      quickCloseBtn.type = 'button';
      quickCloseBtn.appendChild(buildHudCloseSvg(doc));
      quickCloseBtn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (activeHandlers && typeof activeHandlers.onConfirmClose === 'function') activeHandlers.onConfirmClose();
      });
      closeWell.appendChild(quickCloseBtn);

      machinedCtrls.appendChild(stageWell);
      machinedCtrls.appendChild(muteWell);
      machinedCtrls.appendChild(closeWell);

      var teleScreen = mkEl(doc, 'div', 'ag-pp-recess-screen ag-pp-tele-screen');
      teleScreen.setAttribute('data-telemetry-available', '0');
      teleScreen.setAttribute('data-has-pulse', '0');
      var teleTopRow = mkEl(doc, 'div', 'ag-pp-tele-top-row');
      var teleHero512k = mkEl(doc, 'span', 'ag-pp-tele-hero-512k', '512K');
      var teleHealth = mkEl(doc, 'span', 'ag-pp-tele-health ag-pp-bento-foldable', packInit.badgeOffline);
      teleHealth.setAttribute('data-level', 'offline');
      teleTopRow.appendChild(teleHero512k);
      teleTopRow.appendChild(teleHealth);

      var teleOfflineBox = mkEl(doc, 'div', 'ag-pp-tele-offline-box');
      teleOfflineBox.setAttribute('data-testid', 'ag-pp-tele-offline');
      var teleOfflineTitle = mkEl(doc, 'div', 'ag-pp-tele-offline-title', packInit.teleOffTitle);
      var teleOfflineSub = mkEl(doc, 'div', 'ag-pp-tele-offline-sub', packInit.teleOffSub);
      teleOfflineBox.appendChild(teleOfflineTitle);
      teleOfflineBox.appendChild(teleOfflineSub);

      var teleSubRow = mkEl(doc, 'div', 'ag-pp-tele-sub-row');
      var bigNumEl = mkEl(doc, 'span', 'ag-pp-tele-big-num', '— / 512K');
      var capLblEl = mkEl(doc, 'span', 'ag-pp-tele-cap-lbl ag-pp-bento-foldable', '—');
      teleSubRow.appendChild(bigNumEl);
      teleSubRow.appendChild(capLblEl);

      var crystalBar = mkEl(doc, 'div', 'ag-pp-crystal-bar');
      var crystalFill = mkEl(doc, 'div', 'ag-pp-crystal-fill');
      setStyleVar(crystalFill, 'width', '0%');
      crystalBar.appendChild(crystalFill);

      var ticksRow = mkEl(doc, 'div', 'ag-pp-tele-ticks ag-pp-bento-foldable');
      ticksRow.appendChild(mkEl(doc, 'span', '', '0'));
      ticksRow.appendChild(mkEl(doc, 'span', '', '128K'));
      ticksRow.appendChild(mkEl(doc, 'span', '', '384K'));
      ticksRow.appendChild(mkEl(doc, 'span', '', '512K'));

      var pulseSvgRefs = buildTelemetryPulseSvg(doc);

      var teleMetrics = mkEl(doc, 'div', 'ag-pp-tele-metrics ag-pp-bento-foldable');
      var cacheKv = mkEl(doc, 'span', 'ag-pp-tele-kv');
      var cacheLbl = mkEl(doc, 'span', '', packInit.kv);
      var cacheVal = mkEl(doc, 'strong', '', '—');
      cacheKv.appendChild(cacheLbl);
      cacheKv.appendChild(cacheVal);

      var freeKv = mkEl(doc, 'span', 'ag-pp-tele-kv');
      var freeLbl = mkEl(doc, 'span', '', packInit.free);
      var freeVal = mkEl(doc, 'strong', '', '—');
      freeKv.appendChild(freeLbl);
      freeKv.appendChild(freeVal);
      teleMetrics.appendChild(cacheKv);
      teleMetrics.appendChild(freeKv);

      teleScreen.appendChild(teleTopRow);
      teleScreen.appendChild(teleOfflineBox);
      teleScreen.appendChild(teleSubRow);
      teleScreen.appendChild(crystalBar);
      teleScreen.appendChild(ticksRow);
      teleScreen.appendChild(pulseSvgRefs.svg);
      teleScreen.appendChild(teleMetrics);

      var teleSubScreen = mkEl(doc, 'div', 'ag-pp-recess-screen ag-pp-tele-subscreen');
      var soloView = mkEl(doc, 'div', 'ag-pp-solo-view');
      var soloSwitchTitle = mkEl(doc, 'div', 'ag-pp-sub-title', 'High · 0.88U Diamond Prism');
      var soloAcousticsRefs = buildSoloAcousticsSvg(doc);
      var pinholeRow = mkEl(doc, 'div', 'ag-pp-pinhole-row');
      var pinholeDots = [];
      for (var pd = 0; pd < 4; pd += 1) {
        var pDot = mkEl(doc, 'span', 'ag-pp-pinhole-dot');
        pDot.setAttribute('data-lit', pd < 3 ? '1' : '0');
        pinholeRow.appendChild(pDot);
        pinholeDots.push(pDot);
      }
      soloView.appendChild(soloSwitchTitle);
      soloView.appendChild(soloAcousticsRefs.svg);
      soloView.appendChild(pinholeRow);

      var orchView = mkEl(doc, 'div', 'ag-pp-orch-view');
      orchView.setAttribute('data-testid', 'ag-pp-dualcore-topology');
      var orchTopoTitle = mkEl(doc, 'div', 'ag-pp-sub-title', packInit.orchTopo);
      var topoNodes = mkEl(doc, 'div', 'ag-pp-topo-nodes');
      var plannerBox = mkEl(doc, 'div', 'ag-pp-topo-box');
      var plannerRoleEl = mkEl(doc, 'span', 'ag-pp-topo-role', packInit.planner);
      var plannerValEl = mkEl(doc, 'span', 'ag-pp-topo-val', '6C High');
      plannerBox.appendChild(plannerRoleEl);
      plannerBox.appendChild(plannerValEl);
      var topoArrow = mkEl(doc, 'span', 'ag-pp-topo-arrow', '→');
      var runnerBox = mkEl(doc, 'div', 'ag-pp-topo-box is-runner');
      var runnerRoleEl = mkEl(doc, 'span', 'ag-pp-topo-role', packInit.runner);
      var runnerValEl = mkEl(doc, 'span', 'ag-pp-topo-val', '1H High');
      runnerBox.appendChild(runnerRoleEl);
      runnerBox.appendChild(runnerValEl);
      topoNodes.appendChild(plannerBox);
      topoNodes.appendChild(topoArrow);
      topoNodes.appendChild(runnerBox);
      var dualCoreTopoSvg = buildDualCoreTopologySvg(doc);
      orchView.appendChild(orchTopoTitle);
      orchView.appendChild(topoNodes);
      orchView.appendChild(dualCoreTopoSvg);

      teleSubScreen.appendChild(soloView);
      teleSubScreen.appendChild(orchView);

      /* Aux Pad Pagination Controls (hidden with zero footprint when auxPageCount <= 1) */
      var auxPager = mkEl(doc, 'div', 'ag-pp-aux-pager');
      markPeriodicOwnedRoot(auxPager);
      auxPager.setAttribute('data-testid', 'ag-pp-aux-pager');
      auxPager.setAttribute('data-show', '0');

      var pagerState = { page: 0, count: 1 };
      var auxPrevBtn = mkEl(doc, 'button', 'ag-pp-aux-page-btn', '<');
      auxPrevBtn.type = 'button';
      auxPrevBtn.setAttribute('data-testid', 'ag-pp-aux-prev');
      auxPrevBtn.setAttribute('aria-label', packInit.auxPrev);
      auxPrevBtn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (pagerState.count <= 1) return;
        var nextPage = (pagerState.page - 1 + pagerState.count) % pagerState.count;
        if (activeHandlers && typeof activeHandlers.onAuxPageChange === 'function') {
          activeHandlers.onAuxPageChange(nextPage);
        }
      });

      var auxMidWrap = mkEl(doc, 'div', 'ag-pp-aux-page-mid');
      var auxDotsWrap = mkEl(doc, 'div', 'ag-pp-aux-page-dots');
      var auxPageTxt = mkEl(doc, 'span', 'ag-pp-aux-page-txt', '1/1');
      auxMidWrap.appendChild(auxDotsWrap);
      auxMidWrap.appendChild(auxPageTxt);

      var auxNextBtn = mkEl(doc, 'button', 'ag-pp-aux-page-btn', '>');
      auxNextBtn.type = 'button';
      auxNextBtn.setAttribute('data-testid', 'ag-pp-aux-next');
      auxNextBtn.setAttribute('aria-label', packInit.auxNext);
      auxNextBtn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (pagerState.count <= 1) return;
        var nextPage = (pagerState.page + 1) % pagerState.count;
        if (activeHandlers && typeof activeHandlers.onAuxPageChange === 'function') {
          activeHandlers.onAuxPageChange(nextPage);
        }
      });

      auxPager.appendChild(auxPrevBtn);
      auxPager.appendChild(auxMidWrap);
      auxPager.appendChild(auxNextBtn);

      telePod.appendChild(teleHeader);
      telePod.appendChild(machinedCtrls);
      telePod.appendChild(teleScreen);
      telePod.appendChild(teleSubScreen);
      telePod.appendChild(auxPager);
      rightWing.appendChild(telePod);

      return {
        compactBar: compactBar,
        compactHwBadge: compactHwBadge,
        compactPillText: compactPillText,
        compactTitle: compactTitle,
        compactMetrics: compactMetrics,
        compactToggleLbl: compactToggleLbl,
        compactTeleWrap: compactTeleWrap,
        compact512k: compact512k,
        compact512kFill: compact512kFill,
        compactStageBtn: compactStageBtn,
        compactModeIcon: compactModeIcon,
        compactMuteBtn: compactMuteBtn,
        compactCloseBtn: compactCloseBtn,
        grid: grid,
        rightWing: rightWing,
        flipInner: flipInner,
        cardFlipBtn: cardFlipBtn,
        cardFlipLabel: cardFlipLabel,
        cardFlipBackBtn: cardFlipBackBtn,
        cardFlipBackLabel: cardFlipBackLabel,
        specCard: specCard,
        specCardRim: specCardRim,
        telePod: telePod,
        telePodRim: telePodRim,
        teleScreen: teleScreen,
        teleOfflineBox: teleOfflineBox,
        teleOfflineTitle: teleOfflineTitle,
        teleOfflineSub: teleOfflineSub,
        ctrlCapsule: machinedCtrls,
        famText: famText,
        stateTag: stateTag,
        titleEl: titleEl,
        microTagNodes: microTagNodes,
        taglineEl: taglineEl,
        radarPane: radarPane,
        radarSvgRefs: radarSvgRefs,
        radarLegend: radarLegend,
        legPriText: legPriText,
        legSecText: legSecText,
        barRefs: barRefs,
        metaPane: metaPane,
        metaKicker: metaKicker,
        metaModelKey: metaModelKey,
        metaModelVal: metaModelVal,
        metaEffortKey: metaEffortKey,
        metaEffortVal: metaEffortVal,
        metaIdKey: metaIdKey,
        metaIdVal: metaIdVal,
        metaNote: metaNote,
        effortCapsuleGroup: effortCapsuleGroup,
        _effortBtnPool: [],
        _effortLockedNoteEl: effortLockedNoteEl,
        _effortTargetSpec: { kind: 'element', z: null, auxIndex: null },
        _sessionFadeRaf: 0,
        _sessionFadeTimer: 0,
        lastBentoEffSig: '',
        effortNoteEl: effortNoteEl,
        sourceCiteEl: sourceCiteEl,
        infoBtn: infoBtn,
        ttHead: ttHead,
        ttLines: ttLines,
        teleKicker: teleKicker,
        teleHealth: teleHealth,
        stageModeBtn: stageModeBtn,
        modeIconRefs: modeIconRefs,
        modeLabelSpan: modeLabelSpan,
        quickMuteBtn: quickMuteBtn,
        quickCloseBtn: quickCloseBtn,
        bigNumEl: bigNumEl,
        capLblEl: capLblEl,
        crystalFill: crystalFill,
        cacheLbl: cacheLbl,
        cacheVal: cacheVal,
        freeLbl: freeLbl,
        freeVal: freeVal,
        pulseSvgRefs: pulseSvgRefs,
        soloSwitchTitle: soloSwitchTitle,
        soloAcousticsRefs: soloAcousticsRefs,
        pinholeDots: pinholeDots,
        orchTopoTitle: orchTopoTitle,
        plannerRoleEl: plannerRoleEl,
        plannerValEl: plannerValEl,
        runnerRoleEl: runnerRoleEl,
        runnerValEl: runnerValEl,
        auxPager: auxPager,
        auxPrevBtn: auxPrevBtn,
        auxNextBtn: auxNextBtn,
        auxDotsWrap: auxDotsWrap,
        auxPageTxt: auxPageTxt,
        _pagerState: pagerState,
        _handlers: activeHandlers,
        _lastDomSig: '',
        _lastCommittedCssSig: '',
        _lastPagerSig: '',
      };
    }

    function syncAuxPagerDom(bentoRefs, doc, auxPage, auxPageCount, langOrZh, handlers) {
      if (!bentoRefs || !bentoRefs.auxPager) return;
      if (handlers) bentoRefs._handlers = handlers;
      var pack = getBentoI18nPack(langOrZh);
      var langKey = typeof langOrZh === 'string' ? (normalizePeriodicLang(langOrZh) || langOrZh) : (langOrZh ? 'zh-CN' : 'en');
      var total = Math.max(1, Number(auxPageCount) || 1);
      var page = Math.max(0, Math.min(total - 1, Number(auxPage) || 0));
      if (bentoRefs._pagerState) {
        bentoRefs._pagerState.page = page;
        bentoRefs._pagerState.count = total;
      }

      if (total <= 1) {
        bentoRefs.auxPager.setAttribute('data-show', '0');
        setStyleVar(bentoRefs.auxPager, 'display', 'none');
        bentoRefs._lastPagerSig = '1:0';
        return;
      }

      bentoRefs.auxPager.setAttribute('data-show', '1');
      setStyleVar(bentoRefs.auxPager, 'display', null);
      if (bentoRefs.auxPrevBtn) {
        bentoRefs.auxPrevBtn.setAttribute('aria-label', pack.auxPrev);
      }
      if (bentoRefs.auxNextBtn) {
        bentoRefs.auxNextBtn.setAttribute('aria-label', pack.auxNext);
      }
      if (bentoRefs.auxPageTxt) {
        bentoRefs.auxPageTxt.textContent = (page + 1) + '/' + total;
      }

      var pSig = total + ':' + page + ':' + langKey;
      if (bentoRefs._lastPagerSig === pSig) return;
      bentoRefs._lastPagerSig = pSig;

      if (bentoRefs.auxDotsWrap && doc) {
        bentoRefs.auxDotsWrap.textContent = '';
        for (var pi = 0; pi < total; pi += 1) {
          (function (idx) {
            var dot = mkEl(doc, 'button', 'ag-pp-aux-page-dot');
            dot.type = 'button';
            dot.setAttribute('data-page-index', String(idx));
            dot.setAttribute('data-active', idx === page ? '1' : '0');
            if (idx === page) dot.setAttribute('aria-current', 'page');
            dot.setAttribute('aria-label', pack.pagePre + (idx + 1) + pack.pageSuf);
            dot.addEventListener('click', function (ev) {
              ev.stopPropagation();
              var h = bentoRefs._handlers;
              if (h && typeof h.onAuxPageChange === 'function') {
                h.onAuxPageChange(idx);
              }
            });
            bentoRefs.auxDotsWrap.appendChild(dot);
          })(pi);
        }
      }
    }

    function syncBentoTwinCardsDom(bentoRefs, params) {
      if (!bentoRefs || !params || !params.bSpec) return;
      var doc = params.doc || (bentoRefs.specCard && bentoRefs.specCard.ownerDocument) || null;
      var rt = params.root || (typeof globalThis !== 'undefined' ? globalThis : null);
      var overlayEl = params.overlayEl || null;
      var bSpec = params.bSpec;
      var committed = params.committed || {};
      var tele = params.telemetry || { available: false, reason: 'offline' };
      var lang = params.lang ? (normalizePeriodicLang(params.lang) || 'en') : (typeof params.zh === 'boolean' ? (params.zh ? 'zh-CN' : 'en') : resolveLocale(doc, rt));
      var pack = getBentoI18nPack(lang);
      var zh = lang === 'zh-CN' || lang === 'zh-TW';
      var profile = params.profile || resolvePrismThemeProfile(doc, rt);
      var stageMode = params.stageMode || 'drawer';
      var muted = Boolean(params.muted);
      var cardFlipped = Boolean(params.cardFlipped);
      var compactExpanded = Boolean(params.compactExpanded);
      var orchLatched = Boolean(params.orchLatched);
      var auxPage = Number(params.auxPage) || 0;
      var auxPageCount = Number(params.auxPageCount) || 1;
      var handlers = params.handlers || bentoRefs._handlers || {};

      if (params.sessionSwitched) {
        triggerBentoSessionSwitchFade(bentoRefs, doc, rt);
      }

      var isLight = Boolean(profile && profile.isLight);
      var isMono = Boolean(profile && profile.isMono);
      var useShortCite =
        (overlayEl && overlayEl.getAttribute && overlayEl.getAttribute('data-source-short') === '1') ||
        ((overlayEl && overlayEl.getAttribute && overlayEl.getAttribute('data-dock-tier')) || 'wide') !== 'wide';

      var teleAvailable = Boolean(tele && tele.available === true && Number.isFinite(tele.usedTokens) && Number.isFinite(tele.maxTokens) && tele.maxTokens > 0);
      var isKnownBenchmark = bSpec.isKnownBenchmark !== false && (bSpec.isAvailable === false || Array.isArray(bSpec.scores));

      var teleSig = teleAvailable
        ? '1:' + tele.usedTokens + '/' + tele.maxTokens + ':' + (tele.kvCacheRate === null ? 'none' : tele.kvCacheRate) + ':' + (Array.isArray(tele.pulsePoints) ? tele.pulsePoints.length : 0)
        : '0:' + (tele.reason || 'offline');

      var bentoSig =
        (profile ? profile.id + ':' + profile.accent + ':' + (isMono ? '1' : '0') : '') +
        '|' + lang +
        '|' + stageMode +
        '|' + (muted ? '1' : '0') +
        '|' + (useShortCite ? '1' : '0') +
        '|' + (cardFlipped ? '1' : '0') +
        '|' + (compactExpanded ? '1' : '0') +
        '|' + (orchLatched ? '1' : '0') +
        '|' + (isKnownBenchmark ? '1' : '0') +
        '|' + auxPage + '/' + auxPageCount +
        '|' + (bSpec.badge || '') +
        '|' + (bSpec.stateText || '') +
        '|' + (bSpec.title || '') +
        '|' + (bSpec.tagline || '') +
        '|' + (bSpec.accentHex || '') +
        '|' + (bSpec.tierNote || '') +
        '|' + (bSpec.compactText || '') +
        '|' + (bSpec.shortTag || '') +
        '|' + (bSpec.compareTag || '') +
        '|' + (bSpec.plannerTopoLabel || '') +
        '|' + (bSpec.activeEffort || '') +
        '|' + (bSpec.modelId || '') +
        '|' + (Array.isArray(bSpec.microTags) ? bSpec.microTags.join(',') : '') +
        '|' + (Array.isArray(bSpec.compareRatios) ? bSpec.compareRatios.join(',') : '') +
        '|' + (Array.isArray(bSpec.runnerRatios) ? bSpec.runnerRatios.join(',') : '') +
        '|' + (Array.isArray(bSpec.scores) ? bSpec.scores.join(',') : '') +
        '|' + (bSpec.levels ? bSpec.levels.map(function (l) { return l.effort + ':' + (l.active ? '1' : '0') + ':' + l.label; }).join(',') : '') +
        '|' + (committed.compactPillLabel || '') +
        '|' + (committed.accentHex || '') +
        '|' + (committed.switchSpec || '') +
        '|' + (committed.litDots || 0) +
        '|' + teleSig;

      syncAuxPagerDom(bentoRefs, doc, auxPage, auxPageCount, lang, handlers);

      if (bentoRefs._lastDomSig === bentoSig) return;
      bentoRefs._lastDomSig = bentoSig;

      var committedAccentHex = isMono
        ? (isLight ? '#334155' : '#E2E8F0')
        : (isLight && committed.accentHexLight ? committed.accentHexLight : committed.accentHex || '#3B82F6');
      var committedSecondaryHex = isMono
        ? (isLight ? '#475569' : '#CBD5E1')
        : (isLight && committed.secondaryHexLight ? committed.secondaryHexLight : (committed.secondaryHex || committedAccentHex));
      var committedGlowRgba = isMono ? 'rgba(148, 163, 184, 0.24)' : (committed.glowRgba || 'rgba(59, 130, 246, 0.26)');

      var specAccentHex = isMono
        ? (isLight ? '#334155' : '#E2E8F0')
        : (isLight && bSpec.accentHexLight ? bSpec.accentHexLight : bSpec.accentHex || '#3B82F6');
      var specSecondaryHex = isMono
        ? (isLight ? '#475569' : '#CBD5E1')
        : (isLight && bSpec.secondaryHexLight ? bSpec.secondaryHexLight : (bSpec.secondaryHex || specAccentHex));
      var specGlowRgba = isMono ? 'rgba(148, 163, 184, 0.24)' : (bSpec.glowRgba || 'rgba(59, 130, 246, 0.26)');

      if (overlayEl) {
        var committedCssSig = committedAccentHex + '|' + committedSecondaryHex + '|' + committedGlowRgba;
        if (bentoRefs._lastCommittedCssSig !== committedCssSig) {
          bentoRefs._lastCommittedCssSig = committedCssSig;
          setStyleVar(overlayEl, '--ag-pp-model-accent', committedAccentHex);
          setStyleVar(overlayEl, '--ag-pp-model-secondary', committedSecondaryHex);
          setStyleVar(overlayEl, '--ag-pp-model-grad', 'linear-gradient(90deg, ' + committedAccentHex + ' 0%, ' + committedSecondaryHex + ' 100%)');
          setStyleVar(overlayEl, '--ag-pp-model-glow', committedGlowRgba);
        }
      }
      if (bentoRefs.specCard) {
        bentoRefs.specCard.setAttribute('data-known-benchmark', isKnownBenchmark ? '1' : '0');
        setStyleVar(bentoRefs.specCard, '--ag-pp-spec-accent', specAccentHex);
        setStyleVar(bentoRefs.specCard, '--ag-pp-spec-secondary', specSecondaryHex);
        setStyleVar(bentoRefs.specCard, '--ag-pp-spec-grad', 'linear-gradient(90deg, ' + specAccentHex + ' 0%, ' + specSecondaryHex + ' 100%)');
        setStyleVar(bentoRefs.specCard, '--ag-pp-spec-glow', specGlowRgba);
      }

      bentoRefs.famText.textContent = bSpec.badge || '';
      bentoRefs.stateTag.textContent = bSpec.stateText || '';
      bentoRefs.titleEl.textContent = bSpec.title || '';
      bentoRefs.taglineEl.textContent = bSpec.tagline || '';

      if (Array.isArray(bentoRefs.microTagNodes)) {
        var tags = Array.isArray(bSpec.microTags) ? bSpec.microTags : [];
        for (var ti = 0; ti < bentoRefs.microTagNodes.length; ti += 1) {
          var tNode = bentoRefs.microTagNodes[ti];
          var tVal = tags[ti] || '';
          tNode.textContent = tVal;
          setStyleVar(tNode, 'display', tVal ? 'inline-flex' : 'none');
        }
      }

      if (bentoRefs.compactPillText) {
        bentoRefs.compactPillText.textContent = committed.compactPillLabel || '6C · High';
      }
      if (bentoRefs.compactTitle) bentoRefs.compactTitle.textContent = bSpec.title || '';
      if (bentoRefs.compactMetrics) {
        bentoRefs.compactMetrics.textContent = isKnownBenchmark
          ? (bSpec.compactText || '')
          : (bSpec.activeEffortLabel || bSpec.activeEffort || 'Native');
      }
      if (bentoRefs.compactToggleLbl) {
        bentoRefs.compactToggleLbl.textContent = compactExpanded ? pack.detailsClose : pack.detailsOpen;
      }

      if (bentoRefs.cardFlipBtn && bentoRefs.cardFlipLabel) {
        bentoRefs.cardFlipBtn.setAttribute('aria-pressed', cardFlipped ? 'true' : 'false');
        var flipText = cardFlipped ? pack.specBtn : '512K';
        var flipTitle = cardFlipped ? pack.flipToSpec : pack.flipToTele;
        bentoRefs.cardFlipLabel.textContent = flipText;
        bentoRefs.cardFlipBtn.setAttribute('aria-label', flipTitle);
        bentoRefs.cardFlipBtn.title = flipTitle;
      }
      if (bentoRefs.cardFlipBackBtn && bentoRefs.cardFlipBackLabel) {
        var backText = pack.specBtn;
        var backTitle = pack.flipToSpec;
        bentoRefs.cardFlipBackBtn.setAttribute('aria-pressed', cardFlipped ? 'true' : 'false');
        bentoRefs.cardFlipBackLabel.textContent = backText;
        bentoRefs.cardFlipBackBtn.setAttribute('aria-label', backTitle);
        bentoRefs.cardFlipBackBtn.title = backTitle;
      }

      if (isKnownBenchmark) {
        updateFiveAxisRadarSvg(
          bentoRefs.radarSvgRefs,
          bSpec.scores,
          specAccentHex,
          specSecondaryHex,
          specGlowRgba,
          bSpec.runnerRatios,
          bSpec.compareRatios,
          lang,
          isLight
        );
        if (bentoRefs.radarLegend && bentoRefs.legPriText && bentoRefs.legSecText) {
          if (bSpec.runnerRatios) {
            bentoRefs.radarLegend.setAttribute('data-show', '1');
            bentoRefs.legPriText.textContent = bSpec.shortTag || 'Planner';
            bentoRefs.legSecText.textContent = '1H';
          } else if (bSpec.compareRatios) {
            bentoRefs.radarLegend.setAttribute('data-show', '1');
            bentoRefs.legPriText.textContent = bSpec.shortTag || pack.hoverTag;
            bentoRefs.legSecText.textContent = bSpec.compareTag || pack.activeTag;
          } else {
            bentoRefs.radarLegend.setAttribute('data-show', '0');
          }
        }
        var rows = Array.isArray(bSpec.benchRows) ? bSpec.benchRows : [];
        var hasAnyDelta = false;
        for (var ri = 0; ri < bentoRefs.barRefs.length; ri += 1) {
          var br = bentoRefs.barRefs[ri];
          if (!br) continue;
          var rItem = rows[ri];
          if (rItem) {
            br.lbl.textContent = (pack.radarAxes && pack.radarAxes[ri]) || rItem.label;
            setStyleVar(br.fill, 'width', Math.max(8, Math.min(100, Number(rItem.fillPct) || 20)) + '%');
            br.val.textContent = rItem.valText;
            if (br.delta) {
              br.delta.textContent = rItem.deltaText || '';
              br.delta.setAttribute('data-dir', rItem.deltaDir || '');
              if (rItem.deltaText) hasAnyDelta = true;
            }
          }
        }
        if (bentoRefs.specCard) {
          bentoRefs.specCard.setAttribute('data-comparing', hasAnyDelta ? '1' : '0');
        }
      } else {
        if (bentoRefs.specCard) bentoRefs.specCard.setAttribute('data-comparing', '0');
        if (bentoRefs.metaKicker) {
          bentoRefs.metaKicker.textContent = pack.metaKicker;
        }
        if (bentoRefs.metaModelKey) bentoRefs.metaModelKey.textContent = pack.metaModel;
        if (bentoRefs.metaModelVal) bentoRefs.metaModelVal.textContent = bSpec.title || '—';
        if (bentoRefs.metaEffortKey) bentoRefs.metaEffortKey.textContent = pack.metaEffort;
        if (bentoRefs.metaEffortVal) {
          bentoRefs.metaEffortVal.textContent = bSpec.activeEffortLabel || bSpec.activeEffort || pack.metaDefault;
        }
        if (bentoRefs.metaIdKey) bentoRefs.metaIdKey.textContent = pack.metaId;
        if (bentoRefs.metaIdVal) {
          var nativeTagText = bSpec.modelId || (Array.isArray(bSpec.microTags) && bSpec.microTags.length ? bSpec.microTags.join(' · ') : '') || bSpec.badge || '—';
          bentoRefs.metaIdVal.textContent = nativeTagText;
        }
        if (bentoRefs.metaNote) {
          bentoRefs.metaNote.textContent = pack.metaNote;
        }
      }

      if (bentoRefs.sourceCiteEl) {
        bentoRefs.sourceCiteEl.textContent = useShortCite ? BENCHMARK_SOURCE_CITATION_SHORT : BENCHMARK_SOURCE_CITATION;
        bentoRefs.sourceCiteEl.title = BENCHMARK_SOURCE_CITATION;
      }
      if (bentoRefs.infoBtn && pack.infoAria) {
        bentoRefs.infoBtn.setAttribute('aria-label', pack.infoAria);
      }
      if (bentoRefs.ttHead && Array.isArray(bentoRefs.ttLines)) {
        bentoRefs.ttHead.textContent = pack.ttHead;
        var ttCopy = pack.ttLines;
        for (var tli = 0; tli < bentoRefs.ttLines.length; tli += 1) {
          bentoRefs.ttLines[tli].textContent = ttCopy[tli] || '';
        }
      }

      var bentoEffSig =
        bSpec.kind +
        ':' + (bSpec.z !== null && bSpec.z !== undefined ? bSpec.z : bSpec.auxIndex) +
        ':' + (orchLatched ? 'orch' : 'solo') +
        ':' + lang +
        '|' + (bSpec.levels || []).map(function (l) { return l.effort + ':' + (l.active ? '1' : '0') + ':' + l.label; }).join(',');

      if (bentoRefs.lastBentoEffSig !== bentoEffSig && doc) {
        bentoRefs.lastBentoEffSig = bentoEffSig;
        if (!Array.isArray(bentoRefs._effortBtnPool)) bentoRefs._effortBtnPool = [];
        if (!bentoRefs._effortTargetSpec) {
          bentoRefs._effortTargetSpec = { kind: 'element', z: null, auxIndex: null };
        }
        bentoRefs._effortTargetSpec.kind = bSpec.kind;
        bentoRefs._effortTargetSpec.z = bSpec.z !== undefined ? bSpec.z : null;
        bentoRefs._effortTargetSpec.auxIndex = bSpec.auxIndex !== undefined ? bSpec.auxIndex : null;

        var lockedNoteEl = bentoRefs._effortLockedNoteEl;
        if (!lockedNoteEl) {
          lockedNoteEl = mkEl(doc, 'span', 'ag-pp-bento-eff-note', '');
          bentoRefs._effortLockedNoteEl = lockedNoteEl;
          bentoRefs.effortCapsuleGroup.appendChild(lockedNoteEl);
        }

        var btnPool = bentoRefs._effortBtnPool;
        var hasLevels = Boolean(bSpec.isAvailable && bSpec.levels && bSpec.levels.length > 0);
        if (!hasLevels) {
          lockedNoteEl.textContent = bSpec.stateText || pack.locked;
          setStyleVar(lockedNoteEl, 'display', '');
          lockedNoteEl.hidden = false;
          lockedNoteEl.removeAttribute('aria-hidden');
          for (var hi = 0; hi < btnPool.length; hi += 1) {
            var hBtn = btnPool[hi];
            setStyleVar(hBtn, 'display', 'none');
            hBtn.hidden = true;
            hBtn.setAttribute('aria-hidden', 'true');
            hBtn.setAttribute('tabindex', '-1');
            hBtn.setAttribute('data-active', '0');
            hBtn.setAttribute('aria-pressed', 'false');
            hBtn.removeAttribute('data-bento-effort');
          }
        } else {
          setStyleVar(lockedNoteEl, 'display', 'none');
          lockedNoteEl.hidden = true;
          lockedNoteEl.setAttribute('aria-hidden', 'true');
          for (var li = 0; li < bSpec.levels.length; li += 1) {
            var lvl = bSpec.levels[li];
            var cBtn = btnPool[li];
            if (!cBtn) {
              cBtn = mkEl(doc, 'button', 'ag-pp-bento-eff-btn', lvl.label);
              cBtn.type = 'button';
              (function (pooledBtn) {
                pooledBtn.addEventListener('click', function (ev) {
                  ev.stopPropagation();
                  var effCode = pooledBtn.getAttribute('data-bento-effort');
                  if (!effCode) return;
                  var h = bentoRefs._handlers;
                  var tgt = bentoRefs._effortTargetSpec || {};
                  if (tgt.kind === 'aux' && tgt.auxIndex !== null && tgt.auxIndex !== undefined) {
                    if (h && typeof h.onAuxEffortSelect === 'function') h.onAuxEffortSelect(tgt.auxIndex, effCode);
                  } else if (tgt.z !== null && tgt.z !== undefined) {
                    if (h && typeof h.onEffortSelect === 'function') h.onEffortSelect(effCode, tgt.z);
                  }
                });
              })(cBtn);
              bentoRefs.effortCapsuleGroup.appendChild(cBtn);
              btnPool.push(cBtn);
            }
            if (cBtn.textContent !== lvl.label) cBtn.textContent = lvl.label;
            if (cBtn.getAttribute('data-bento-effort') !== lvl.effort) {
              cBtn.setAttribute('data-bento-effort', lvl.effort);
            }
            var activeStr = lvl.active ? '1' : '0';
            if (cBtn.getAttribute('data-active') !== activeStr) {
              cBtn.setAttribute('data-active', activeStr);
              cBtn.setAttribute('aria-pressed', lvl.active ? 'true' : 'false');
            }
            if (cBtn.hidden) {
              setStyleVar(cBtn, 'display', '');
              cBtn.hidden = false;
              cBtn.removeAttribute('aria-hidden');
              cBtn.removeAttribute('tabindex');
            }
          }
          for (var xi = bSpec.levels.length; xi < btnPool.length; xi += 1) {
            var extraBtn = btnPool[xi];
            if (!extraBtn.hidden) {
              setStyleVar(extraBtn, 'display', 'none');
              extraBtn.hidden = true;
              extraBtn.setAttribute('aria-hidden', 'true');
              extraBtn.setAttribute('tabindex', '-1');
            }
            extraBtn.setAttribute('data-active', '0');
            extraBtn.setAttribute('aria-pressed', 'false');
            extraBtn.removeAttribute('data-bento-effort');
          }
        }
      }
      bentoRefs.effortNoteEl.textContent = bSpec.tierNote || '';

      /* Right MOD-02: Real 512K Telemetry or Honest Offline Placeholder */
      bentoRefs.teleKicker.textContent = 'MOD-02 // TELEMETRY';
      if (bentoRefs.telePod) bentoRefs.telePod.setAttribute('data-telemetry-available', teleAvailable ? '1' : '0');
      if (bentoRefs.teleScreen) bentoRefs.teleScreen.setAttribute('data-telemetry-available', teleAvailable ? '1' : '0');
      if (bentoRefs.compactTeleWrap) bentoRefs.compactTeleWrap.setAttribute('data-telemetry-available', teleAvailable ? '1' : '0');

      if (!teleAvailable) {
        var isDisabled = tele && tele.reason === 'disabled';
        bentoRefs.teleHealth.setAttribute('data-level', 'offline');
        bentoRefs.teleHealth.textContent = isDisabled ? pack.badgeDisabled : pack.badgeOffline;
        if (bentoRefs.teleOfflineTitle) {
          bentoRefs.teleOfflineTitle.textContent = isDisabled ? pack.teleDisabledTitle : pack.teleOffTitle;
        }
        if (bentoRefs.teleOfflineSub) {
          bentoRefs.teleOfflineSub.textContent = pack.teleOffSub;
        }
        bentoRefs.bigNumEl.textContent = '—';
        bentoRefs.capLblEl.textContent = '—';
        setStyleVar(bentoRefs.crystalFill, 'width', '0%');
        bentoRefs.cacheLbl.textContent = pack.kv;
        bentoRefs.cacheVal.textContent = '—';
        bentoRefs.freeLbl.textContent = pack.free;
        bentoRefs.freeVal.textContent = '—';
        if (bentoRefs.teleScreen) bentoRefs.teleScreen.setAttribute('data-has-pulse', '0');
        updateTelemetryPulseSvg(bentoRefs.pulseSvgRefs, null, committedAccentHex, committedSecondaryHex);
        if (bentoRefs.compact512k) bentoRefs.compact512k.textContent = pack.teleOff;
        if (bentoRefs.compact512kFill) setStyleVar(bentoRefs.compact512kFill, 'width', '0%');
      } else {
        var ratio = tele.maxTokens > 0 ? Math.max(0, Math.min(1, tele.usedTokens / tele.maxTokens)) : 0;
        var healthLevel = tele.healthLevel || (ratio > 0.78 ? 'warn' : 'ok');
        bentoRefs.teleHealth.setAttribute('data-level', healthLevel);
        bentoRefs.teleHealth.textContent = healthLevel === 'warn' ? pack.badgeTight : pack.badgeOptimal;
        var usedLbl = tele.usedLabel || String(tele.usedTokens);
        var maxLbl = tele.maxLabel || String(tele.maxTokens);
        var pctVal = typeof tele.pct === 'number' && Number.isFinite(tele.pct) ? tele.pct : Math.round(ratio * 1000) / 10;
        bentoRefs.bigNumEl.textContent = usedLbl + ' / ' + maxLbl;
        bentoRefs.capLblEl.textContent = tele.percentText || pctVal.toFixed(1) + '%';
        var fillPctStr = Math.max(3, Math.min(100, ratio * 100)).toFixed(1) + '%';
        setStyleVar(bentoRefs.crystalFill, 'width', fillPctStr);
        bentoRefs.cacheLbl.textContent = pack.kv;
        bentoRefs.cacheVal.textContent =
          typeof tele.kvCacheRate === 'number' && Number.isFinite(tele.kvCacheRate)
            ? Math.round(tele.kvCacheRate) + '%'
            : (tele.cacheText && tele.cacheText !== '—' ? tele.cacheText : '—');
        bentoRefs.freeLbl.textContent = pack.free;
        bentoRefs.freeVal.textContent = tele.freeLabel || '—';

        var hasRealPulse = Array.isArray(tele.pulsePoints) && tele.pulsePoints.length >= 2;
        if (bentoRefs.teleScreen) bentoRefs.teleScreen.setAttribute('data-has-pulse', hasRealPulse ? '1' : '0');
        updateTelemetryPulseSvg(bentoRefs.pulseSvgRefs, hasRealPulse ? tele.pulsePoints : null, committedAccentHex, committedSecondaryHex);
        if (bentoRefs.compact512k) bentoRefs.compact512k.textContent = usedLbl + ' / ' + maxLbl;
        if (bentoRefs.compact512kFill) setStyleVar(bentoRefs.compact512kFill, 'width', fillPctStr);
      }

      /* Bottom Sub-Screen */
      if (bentoRefs.soloSwitchTitle) {
        bentoRefs.soloSwitchTitle.textContent = committed.switchSpec || 'High · 0.88U Cobalt Diamond Prism';
      }
      if (bentoRefs.soloAcousticsRefs) {
        var acEnergy = committed.litDots ? 0.45 + committed.litDots * 0.14 : 0.35;
        updateSoloAcousticsSvg(bentoRefs.soloAcousticsRefs, committedAccentHex, committedSecondaryHex, acEnergy, committed.telemetrySeed);
      }
      if (Array.isArray(bentoRefs.pinholeDots)) {
        var litN = Math.max(0, Math.min(4, Number(committed.litDots) || 0));
        for (var pd = 0; pd < bentoRefs.pinholeDots.length; pd += 1) {
          bentoRefs.pinholeDots[pd].setAttribute('data-lit', pd < litN ? '1' : '0');
        }
      }
      if (bentoRefs.orchTopoTitle) {
        bentoRefs.orchTopoTitle.textContent = pack.orchTopo;
      }
      if (bentoRefs.plannerRoleEl) bentoRefs.plannerRoleEl.textContent = pack.planner;
      if (bentoRefs.runnerRoleEl) bentoRefs.runnerRoleEl.textContent = pack.runner;
      if (bentoRefs.plannerValEl) bentoRefs.plannerValEl.textContent = bSpec.plannerTopoLabel || '6C High';
      if (bentoRefs.runnerValEl) bentoRefs.runnerValEl.textContent = '1H High';

      /* Integrated Machined Controls */
      var isFull = stageMode === 'fullscreen';
      var modeBtnText = isFull ? pack.inFlowDock : pack.stage3d;
      var modeTitle = isFull ? pack.dockReturn : pack.stageExpand;
      var modePathD = isFull ? 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5' : 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5';

      bentoRefs.modeLabelSpan.textContent = modeBtnText;
      bentoRefs.stageModeBtn.setAttribute('data-stage-mode', stageMode);
      bentoRefs.stageModeBtn.setAttribute('aria-pressed', isFull ? 'true' : 'false');
      bentoRefs.stageModeBtn.setAttribute('aria-label', modeTitle);
      bentoRefs.stageModeBtn.title = modeTitle;
      if (bentoRefs.modeIconRefs && bentoRefs.modeIconRefs.path) {
        bentoRefs.modeIconRefs.path.setAttribute('d', modePathD);
      }
      if (bentoRefs.compactStageBtn) {
        bentoRefs.compactStageBtn.setAttribute('aria-label', modeTitle);
        bentoRefs.compactStageBtn.title = modeTitle;
        if (bentoRefs.compactModeIcon && bentoRefs.compactModeIcon.path) {
          bentoRefs.compactModeIcon.path.setAttribute('d', modePathD);
        }
      }

      var muteTitleText = muted ? pack.unmute : pack.mute;
      var closeTitleText = pack.closeDock;
      bentoRefs.quickMuteBtn.setAttribute('data-muted', muted ? '1' : '0');
      bentoRefs.quickMuteBtn.title = muteTitleText;
      bentoRefs.quickMuteBtn.setAttribute('aria-label', muteTitleText);
      bentoRefs.quickCloseBtn.title = closeTitleText;
      bentoRefs.quickCloseBtn.setAttribute('aria-label', closeTitleText);

      if (bentoRefs.compactMuteBtn) {
        bentoRefs.compactMuteBtn.setAttribute('data-muted', muted ? '1' : '0');
        bentoRefs.compactMuteBtn.title = muteTitleText;
        bentoRefs.compactMuteBtn.setAttribute('aria-label', muteTitleText);
      }
      if (bentoRefs.compactCloseBtn) {
        bentoRefs.compactCloseBtn.title = closeTitleText;
        bentoRefs.compactCloseBtn.setAttribute('aria-label', closeTitleText);
      }
    }

    return {
      STYLE_ID: STYLE_ID,
      ROOT_ID: ROOT_ID,
      ROOT_MARKER_ATTR: ROOT_MARKER_ATTR,
      BENCHMARK_SOURCE_CITATION: BENCHMARK_SOURCE_CITATION,
      BENCHMARK_SOURCE_CITATION_SHORT: BENCHMARK_SOURCE_CITATION_SHORT,
      RADAR_AXES: RADAR_AXES,
      CORE_FOUR_ELEMENTS: CORE_FOUR_ELEMENTS,
      HUD_GEM_STYLES: HUD_GEM_STYLES,
      PICKER_CSS: PICKER_CSS,
      buildPickerCss: buildPickerCss,
      ensureStyles: ensureStyles,
      cleanupUiResiduals: cleanupUiResiduals,
      markPeriodicOwnedRoot: markPeriodicOwnedRoot,
      normalizePeriodicLang: normalizePeriodicLang,
      resolveLocale: resolveLocale,
      getBentoI18nPack: getBentoI18nPack,
      isZhLocale: isZhLocale,
      isReducedMotion: isReducedMotion,
      invalidateComputedThemeCache: invalidateComputedThemeCache,
      detectLightDarkMode: detectLightDarkMode,
      resolvePrismThemeProfile: resolvePrismThemeProfile,
      resolveThemeNativeMiniBadgeColors: resolveThemeNativeMiniBadgeColors,
      miniKeycapColorsForZ: miniKeycapColorsForZ,
      miniKeycapColorsForAux: miniKeycapColorsForAux,
      hudGemColorsForZ: hudGemColorsForZ,
      selectHudIslandElements: selectHudIslandElements,
      resolveHoldRingStops: resolveHoldRingStops,
      spawnHoldRing: spawnHoldRing,
      normalizeSvgAsset: normalizeSvgAsset,
      appendSvgPathsToNode: appendSvgPathsToNode,
      mountDeskmatTopoSvgIfAvailable: mountDeskmatTopoSvgIfAvailable,
      buildDeskmatStage: buildDeskmatStage,
      mountStudioFloorRig: mountStudioFloorRig,
      buildHudResetViewSvg: buildHudResetViewSvg,
      buildHudMuteSvg: buildHudMuteSvg,
      buildHudCloseSvg: buildHudCloseSvg,
      buildStageModeIconSvg: buildStageModeIconSvg,
      buildCardFlipIconSvg: buildCardFlipIconSvg,
      computePentagonPoint: computePentagonPoint,
      buildPentagonPointsAttr: buildPentagonPointsAttr,
      buildPentagonPathAttr: buildPentagonPathAttr,
      buildFiveAxisRadarSvg: buildFiveAxisRadarSvg,
      updateFiveAxisRadarSvg: updateFiveAxisRadarSvg,
      buildTelemetryPulseSvg: buildTelemetryPulseSvg,
      updateTelemetryPulseSvg: updateTelemetryPulseSvg,
      buildSoloAcousticsSvg: buildSoloAcousticsSvg,
      updateSoloAcousticsSvg: updateSoloAcousticsSvg,
      buildDualCoreTopologySvg: buildDualCoreTopologySvg,
      buildBentoTwinCards: buildBentoTwinCards,
      syncAuxPagerDom: syncAuxPagerDom,
      syncBentoTwinCardsDom: syncBentoTwinCardsDom,
      updateBentoTwinCards: syncBentoTwinCardsDom,
      triggerBentoSessionSwitchFade: triggerBentoSessionSwitchFade,
      clearBentoSessionSwitchFade: clearBentoSessionSwitchFade,
      mkEl: mkEl,
      mkSvg: mkSvg,
      setStyleVar: setStyleVar,
      safeRemove: safeRemove,
    };
  }
);

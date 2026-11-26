/**
 * Obsidian Prism — On-Demand 3D Custom Mechanical Periodic Model Picker Controller
 * Slim orchestrator shell consuming the 7 modular vendor/periodic-picker/* sibling units:
 *   pbr-grain-assets.js -> audio-fx.js -> model-catalog.js -> host-bridge.js
 *   -> oled-cyber-screen.js -> keyboard-3d-gl.js -> bento-ui.js -> periodic-picker.js
 *
 * Contract:
 *   globalThis.__agPrismPeriodicPickerFactory / module.exports
 *   globalThis.__agPrismPeriodicPicker (mounted singleton controller)
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module && typeof module.exports === 'object') {
    module.exports = api;
  }
  if (root && typeof root === 'object') {
    root.__agPrismPeriodicPickerFactory = api;
  }
  if (typeof globalThis === 'object' && globalThis) {
    globalThis.__agPrismPeriodicPickerFactory = api;
  }
  if (typeof window === 'object' && window) {
    window.__agPrismPeriodicPickerFactory = api;
  }
})(
  typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this,
  function () {
    'use strict';

    /* ── Sibling Module Resolvers (Browser globalThis + Node require fallback) ─ */

    function resolveSiblingModule(rt, globalKeys, reqPath) {
      var hosts = [];
      if (rt && typeof rt === 'object') hosts.push(rt);
      if (typeof globalThis === 'object' && globalThis && hosts.indexOf(globalThis) === -1) hosts.push(globalThis);
      if (typeof window === 'object' && window && hosts.indexOf(window) === -1) hosts.push(window);
      for (var h = 0; h < hosts.length; h += 1) {
        var host = hosts[h];
        for (var k = 0; k < globalKeys.length; k += 1) {
          var mod = host[globalKeys[k]];
          if (mod && typeof mod === 'object') return mod;
        }
      }
      if (typeof require === 'function' && reqPath) {
        try {
          var loaded = require(reqPath);
          if (loaded && typeof loaded === 'object') return loaded;
        } catch (e) {}
      }
      return null;
    }

    function resolveGrainAssets(rt) {
      return resolveSiblingModule(rt, ['__agPrismGrainAssets', '__agPeriodicPbrGrainAssets'], './pbr-grain-assets.js');
    }

    function resolveAudioFxModule(rt) {
      return resolveSiblingModule(rt, ['__agPeriodicAudioFx'], './audio-fx.js');
    }

    function resolveModelCatalogModule(rt) {
      return resolveSiblingModule(rt, ['__agPeriodicModelCatalog'], './model-catalog.js');
    }

    function resolveHostBridgeModule(rt) {
      return resolveSiblingModule(rt, ['__agPeriodicHostBridge'], './host-bridge.js');
    }

    function resolveOledScreenModule(rt) {
      return resolveSiblingModule(rt, ['__agPrismOledScreen', '__agPeriodicOledScreen'], './oled-cyber-screen.js');
    }

    function resolveKeyboard3DFactory(rt) {
      var mod = resolveSiblingModule(
        rt,
        ['__agPrismKeyboard3D', '__agPrismPeriodicKeyboard3D', '__agPeriodicKeyboard3D'],
        './keyboard-3d-gl.js'
      );
      return mod && typeof mod.createKeyboard3DRenderer === 'function' ? mod : null;
    }

    function resolveBentoUiModule(rt) {
      return resolveSiblingModule(rt, ['__agPeriodicBentoUi'], './bento-ui.js');
    }

    /* Default module references for top-level re-exports */
    var defaultAudioFx = resolveAudioFxModule(null) || {};
    var defaultCatalog = resolveModelCatalogModule(null) || {};
    var defaultHostBridge = resolveHostBridgeModule(null) || {};
    var defaultBentoUi = resolveBentoUiModule(null) || {};

    /* ── Interaction & Layout Constants (Preserving Native Tactile Tuning) ─── */

    var HOLD_RING_DELAY_MS = 110;
    var HOLD_PREWARM_DELAY_MS = 120;
    var HOLD_OPEN_DELAY_MS = 420;
    var HOLD_MAX_DRIFT_PX = 10;
    var SESSION_SYNC_DEBOUNCE_MS = 80;
    var SESSION_SYNC_CLICK_FOLLOWUP_MS = 200;
    var SESSION_SYNC_ROUTE_FOLLOWUP_MS = 220;
    var OPEN_LOCK_GUARD_INTERVAL_MS = 280;
    var SESSION_BADGE_DURATION_MS = 1200;
    var SHORT_VIEWPORT_HEIGHT_PX = 560;
    var SUPPRESS_CLICK_WINDOW_MS = 800;
    var BLIND_HOVER_DWELL_MS = 150;
    var CONFIRM_SLAM_DELAY_MS = 115;
    var ORBIT_DRAG_THRESHOLD_PX = 6;
    var SLIDER_SCRUB_THRESHOLD_PX = 3;
    var ORBIT_PITCH_RAD_PER_PX = 0.0046;
    var ORBIT_YAW_RAD_PER_PX = 0.0046;
    var ORBIT_FLING_WINDOW_MS = 50;
    var ORBIT_MAX_VEL_RAD = 6.2;
    var ORBIT_FALLBACK_FLING_SCALE = 0.88;
    var POST_DRAG_SUPPRESS_MS = 360;
    var DOCK_WIDE_BREAKPOINT_PX = 1180;
    var DOCK_MEDIUM_BREAKPOINT_PX = 960;
    var DOCK_OPEN_TRANSITION_MS = 300;
    var DOCK_CLOSE_TRANSITION_MS = 260;
    var BLIND_FLASH_DURATION_MS = 1000;
    var EXT_RIM_PROXIMITY_PX = 150;
    var AUX_WHEEL_THROTTLE_MS = 140;

    function isNodeConnectedToDoc(docRef, node) {
      if (!node || typeof node !== 'object') return false;
      if (node.isConnected === false) return false;
      if (node.parentNode) {
        var cur = node;
        var guard = 0;
        while (cur && guard < 64) {
          if (cur.isConnected === false) return false;
          if (docRef && (cur === docRef || cur === docRef.body || cur === docRef.documentElement)) {
            return true;
          }
          cur = cur.parentNode;
          guard += 1;
        }
        return false;
      }
      if (node.isConnected === true) return true;
      return Boolean(docRef && (node === docRef || node === docRef.body || node === docRef.documentElement));
    }

    function smoothRimWeight(distPx, maxDistPx) {
      if (distPx <= 0) return 1;
      if (distPx >= maxDistPx) return 0;
      var u = 1 - distPx / maxDistPx;
      return u * u * (3 - 2 * u);
    }

    function attachCompareDeltas(rows, baseBench) {
      if (!Array.isArray(rows)) return [];
      var baseVals = baseBench && Array.isArray(baseBench.rawValues) ? baseBench.rawValues : null;
      var baseRows = baseBench && Array.isArray(baseBench.rows) ? baseBench.rows : null;
      var out = [];
      for (var i = 0; i < rows.length; i += 1) {
        var r = rows[i];
        var deltaText = '';
        var deltaDir = '';
        var sameMetric = !baseRows || !baseRows[i] || baseRows[i].label === r.label;
        if (sameMetric && baseVals && typeof r.raw === 'number' && typeof baseVals[i] === 'number') {
          var diff = r.raw - baseVals[i];
          if (Math.abs(diff) >= 0.05) {
            deltaDir = diff > 0 ? 'up' : 'down';
            var sign = diff > 0 ? '+' : '';
            deltaText = r.unit === 'pct' ? sign + diff.toFixed(1) + '%' : sign + Math.round(diff);
          }
        }
        out.push({
          label: r.label,
          valText: r.valText,
          fillPct: r.fillPct,
          deltaText: deltaText,
          deltaDir: deltaDir,
        });
      }
      return out;
    }

    var PP_I18N = {
      'zh-CN': {
        tierOrch: '常规步骤卸载至 1H (~168 tok/s)', tierLocked: '暗刻阳极盲键 · 0.00U 锁定态', tierAuxSingle: '0.76U 反重力悬浮 + 自适应推理',
        tierXHigh: 'Extra · 1.06U 满功率三环全息场', tierHigh: 'High · 0.88U 折光微晶光柱悬浮', tierMed: 'Medium · 0.64U 双磁通环均衡悬浮', tierLow: 'Low · 0.40U 轻盈疾速低延迟微浮',
        sessPre: '当前会话：', sessSuf: ' · 点选已点亮键帽即可切换',
        nonPlanner: '编排态不可选', reserved: '预留槽位', clickOrch: '点击锁存双核编排', compare: '悬停对比', active: '当前激活', orchLatched: '编排锁存 · 点 #0 解锁', standby: '待机盲键',
        effDefault: '默认', notInOrch: '该模型不在编排主核白名单内 · 解锁 #0 Orch 后可单独调用',
        orch1HTagline: '编排态下 1H 自动作为后台高速执行核 (~168 tok/s)，不可设为主规划核',
        orchLockedTags: ['编排态锁定', '1H 后台执行', '解锁可直连'],
        tierNonPlanner: 'NON-PLANNER · 编排态锁定', tierOrchSwitch: '#0 机械自锁开关 · 主核 + 1H 并发',
        unrelNonPlanner: 'NON-PLANNER · 编排态不可选', unrelAuxBlind: '未开放 · 副盘暗刻盲键',
        unrelNoModels: '当前宿主未返回可用元素模型', unrelStandby: '未发布 · 待机盲键',
        thinkDepth: '思考深度', thinkMode: '思考深度', plannerStatus: '编排状态', elemStatus: '元素状态',
        grpPre: '第 ', grpSuf: ' 族', elemSeriesSuf: 'Google 元素直连模型', blindDescSuf: '尚未开放的化学元素键位', blindSubSuf: '物理待机盲键',
        synced: '已同步会话', pickerAria: 'Google 元素周期表 3D 模型选择器', hudAria: '三维视角复位与无障碍快切栏',
        resetTitle: '复位三维视角 (R)', resetLbl: '回正',
        muteOn: '已静音（点击开启机械轴音效）', muteOff: '切换机械键盘音效', muteInit: '切换机械键盘音效', closeLbl: '确认并关闭',
      },
      'zh-TW': {
        tierOrch: '常規步驟卸載至 1H (~168 tok/s)', tierLocked: '暗刻陽極盲鍵 · 0.00U 鎖定態', tierAuxSingle: '0.76U 反重力懸浮 + 自適應推理',
        tierXHigh: 'Extra · 1.06U 滿功率三環全像場', tierHigh: 'High · 0.88U 折光微晶光柱懸浮', tierMed: 'Medium · 0.64U 雙磁通環均衡懸浮', tierLow: 'Low · 0.40U 輕盈疾速低延遲微浮',
        sessPre: '目前工作階段：', sessSuf: ' · 點選已點亮鍵帽即可切換',
        nonPlanner: '編排態不可選', reserved: '預留槽位', clickOrch: '點擊鎖存雙核編排', compare: '懸停對比', active: '目前啟用', orchLatched: '編排鎖存 · 點 #0 解鎖', standby: '待機盲鍵',
        effDefault: '預設', notInOrch: '此模型不在編排主核白名單內 · 解鎖 #0 Orch 後可單獨呼叫',
        orch1HTagline: '編排態下 1H 自動作為背景高速執行核 (~168 tok/s)，不可設為主規劃核',
        orchLockedTags: ['編排態鎖定', '1H 背景執行', '解鎖可直連'],
        tierNonPlanner: 'NON-PLANNER · 編排態鎖定', tierOrchSwitch: '#0 機械自鎖開關 · 主核 + 1H 並發',
        unrelNonPlanner: 'NON-PLANNER · 編排態不可選', unrelAuxBlind: '未開放 · 副盤暗刻盲鍵',
        unrelNoModels: '目前宿主未回傳可用元素模型', unrelStandby: '未發布 · 待機盲鍵',
        thinkDepth: '思考深度', thinkMode: '思考深度', plannerStatus: '編排狀態', elemStatus: '元素狀態',
        grpPre: '第 ', grpSuf: ' 族', elemSeriesSuf: 'Google 元素直連模型', blindDescSuf: '尚未開放的化學元素鍵位', blindSubSuf: '實體待機盲鍵',
        synced: '已同步工作階段', pickerAria: 'Google 元素週期表 3D 模型選擇器', hudAria: '三維視角重設與無障礙快切列',
        resetTitle: '重設三維視角 (R)', resetLbl: '重設',
        muteOn: '已靜音（點擊開啟機械軸音效）', muteOff: '切換機械鍵盤音效', muteInit: '切換機械鍵盤音效', closeLbl: '確認並關閉',
      },
      en: {
        tierOrch: 'Routine steps offloaded to 1H (~168 tok/s)', tierLocked: 'Anodized Blind Key · 0.00U Locked', tierAuxSingle: '0.76U Levitation + Adaptive Mode',
        tierXHigh: 'Extra · 1.06U 3-Ring Holographic Field', tierHigh: 'High · 0.88U Crystal Pillar Lift', tierMed: 'Medium · 0.64U Dual-Flux Balanced Lift', tierLow: 'Low · 0.40U Agile Low-Latency Float',
        sessPre: 'Current session: ', sessSuf: ' · Click a lit keycap to switch',
        nonPlanner: 'NON-PLANNER', reserved: 'RESERVED', clickOrch: 'CLICK TO LATCH ORCH', compare: 'COMPARE', active: 'ACTIVE', orchLatched: 'ORCH LATCHED', standby: 'STANDBY',
        effDefault: 'Default', notInOrch: 'Not in Orchestrator planner allowlist · Unlatch #0 Orch to use standalone',
        orch1HTagline: 'In Orchestrator mode, 1H runs as fast background runner (~168 tok/s) · Unlatch #0 Orch for standalone use',
        orchLockedTags: ['Orch Locked', '1H Runner', 'Standalone'],
        tierNonPlanner: 'NON-PLANNER · Locked in Orch', tierOrchSwitch: '#0 Latching Switch · Planner + 1H',
        unrelNonPlanner: 'NON-PLANNER · Locked in Orch', unrelAuxBlind: 'Reserved · Blind Macro Key',
        unrelNoModels: 'No live element models detected', unrelStandby: 'Standby · Matte PBT Keycap',
        thinkDepth: 'Thinking Level', thinkMode: 'Thinking Mode', plannerStatus: 'Planner Status', elemStatus: 'Element Status',
        grpPre: 'Group ', grpSuf: '', elemSeriesSuf: 'Google Element Series', blindDescSuf: 'Unreleased Element Keycap', blindSubSuf: 'Standby Keycap',
        synced: 'SYNCED', pickerAria: 'Periodic Table 3D Model Picker', hudAria: '3D View Reset & Accessibility Controls',
        resetTitle: 'Reset 3D View (R)', resetLbl: 'Reset',
        muteOn: 'Audio muted (Click to unmute)', muteOff: 'Toggle Mechanical Keycap Audio', muteInit: 'Toggle Mechanical Keycap Audio', closeLbl: 'Confirm and close',
      },
      ja: {
        tierOrch: '通常処理は 1H (~168 tok/s) へ自動オフロード', tierLocked: '陽極酸化ブラインドキー · 0.00U ロック', tierAuxSingle: '0.76U 浮揚 + アダプティブ推論',
        tierXHigh: 'Extra · 1.06U フル出力3連ホログラム場', tierHigh: 'High · 0.88U 屈折クリスタル浮揚', tierMed: 'Medium · 0.64U デュアル磁束バランス', tierLow: 'Low · 0.40U 軽量・低遅延フロート',
        sessPre: '現在のセッション：', sessSuf: ' · 点灯キーをクリックして切替',
        nonPlanner: 'オーケストラ非対象', reserved: '予約枠', clickOrch: 'クリックで二重コア固定', compare: 'ホバー比較', active: '現在選択中', orchLatched: 'ORCH 固定中', standby: '待機キー',
        effDefault: '既定', notInOrch: '計画コア対象外 · #0 Orch 解除で単独利用可能',
        orch1HTagline: 'オーケストラ時は 1H が高速実行コア (~168 tok/s) として動作',
        orchLockedTags: ['ORCH 固定', '1H 実行コア', '単独呼出可'],
        tierNonPlanner: 'NON-PLANNER · オーケストラ固定', tierOrchSwitch: '#0 ラッチスイッチ · 計画 + 1H 並列',
        unrelNonPlanner: 'NON-PLANNER · オーケストラ固定', unrelAuxBlind: '未開放 · サブキー盲鍵',
        unrelNoModels: '利用可能な元素モデルがありません', unrelStandby: '未公開 · 待機 PBT キー',
        thinkDepth: '推論レベル', thinkMode: '推論モード', plannerStatus: '計画コア状態', elemStatus: '元素ステータス',
        grpPre: '第 ', grpSuf: ' 族', elemSeriesSuf: 'Google 元素モデル', blindDescSuf: '未公開の元素キーキャップ', blindSubSuf: '待機キーキャップ',
        synced: '同期済', pickerAria: '周期表 3D モデルピッカー', hudAria: '3D 視点リセット・操作バー',
        resetTitle: '3D 視点をリセット (R)', resetLbl: 'リセット',
        muteOn: '消音中（クリックでサウンド有効）', muteOff: 'メカニカルキー音を切替', muteInit: 'メカニカルキー音を切替', closeLbl: '確定して閉じる',
      },
      ko: {
        tierOrch: '일반 단계는 1H (~168 tok/s)로 오프로드', tierLocked: '아노다이징 블라인드 키 · 0.00U 잠금', tierAuxSingle: '0.76U 부양 + 적응형 추론',
        tierXHigh: 'Extra · 1.06U 풀파워 3링 홀로그램', tierHigh: 'High · 0.88U 크리스탈 필러 리프트', tierMed: 'Medium · 0.64U 듀얼 플럭스 균형', tierLow: 'Low · 0.40U 저지연 경량 플로트',
        sessPre: '현재 세션: ', sessSuf: ' · 켜진 키캡을 눌러 전환',
        nonPlanner: '플래너 제외', reserved: '예약 슬롯', clickOrch: '클릭하여 ORCH 잠금', compare: '비교 미리보기', active: '활성화됨', orchLatched: 'ORCH 잠금', standby: '대기 키',
        effDefault: '기본값', notInOrch: 'Orchestrator 플래너 허용 목록 외 · #0 Orch 해제 시 단독 사용',
        orch1HTagline: '오케스트레이션 모드에서 1H는 고속 실행 코어(~168 tok/s)로 작동',
        orchLockedTags: ['Orch 잠금', '1H 러너', '단독 사용'],
        tierNonPlanner: 'NON-PLANNER · 오케스트레이션 잠금', tierOrchSwitch: '#0 래치 스위치 · 플래너 + 1H',
        unrelNonPlanner: 'NON-PLANNER · 오케스트레이션 잠금', unrelAuxBlind: '예약됨 · 블라인드 매크로 키',
        unrelNoModels: '사용 가능한 원소 모델 없음', unrelStandby: '대기 · 매트 PBT 키캡',
        thinkDepth: '사고 수준', thinkMode: '사고 모드', plannerStatus: '플래너 상태', elemStatus: '원소 상태',
        grpPre: '', grpSuf: '족', elemSeriesSuf: 'Google 원소 시리즈', blindDescSuf: '미공개 원소 키캡', blindSubSuf: '대기 키캡',
        synced: '동기화됨', pickerAria: '주기율표 3D 모델 선택기', hudAria: '3D 뷰 초기화 및 접근성 도구',
        resetTitle: '3D 뷰 초기화 (R)', resetLbl: '초기화',
        muteOn: '음소거됨 (클릭하여 소리 켜기)', muteOff: '기계식 키캡 사운드 전환', muteInit: '기계식 키캡 사운드 전환', closeLbl: '확인 및 닫기',
      },
      es: {
        tierOrch: 'Pasos rutinarios delegados a 1H (~168 tok/s)', tierLocked: 'Tecla ciega anodizada · 0.00U', tierAuxSingle: '0.76U Levitación + Modo adaptable',
        tierXHigh: 'Extra · 1.06U Campo holográfico triple', tierHigh: 'High · 0.88U Elevación cristalina', tierMed: 'Medium · 0.64U Flujo dual equilibrado', tierLow: 'Low · 0.40U Flotación ágil baja latencia',
        sessPre: 'Sesión actual: ', sessSuf: ' · Haz clic en una tecla activa para cambiar',
        nonPlanner: 'NO PLANIF.', reserved: 'RESERVADO', clickOrch: 'CLIC PARA ANCLAR ORCH', compare: 'COMPARAR', active: 'ACTIVO', orchLatched: 'ORCH ANCLADO', standby: 'ESPERA',
        effDefault: 'Predet.', notInOrch: 'Fuera de la lista de planificadores de Orchestrator · Desancla #0 Orch para usar solo',
        orch1HTagline: 'En modo Orch, 1H actúa como ejecutor rápido (~168 tok/s)',
        orchLockedTags: ['Bloqueado Orch', 'Ejecutor 1H', 'Independiente'],
        tierNonPlanner: 'NON-PLANNER · Bloqueado en Orch', tierOrchSwitch: 'Interruptor #0 · Planificador + 1H',
        unrelNonPlanner: 'NON-PLANNER · Bloqueado en Orch', unrelAuxBlind: 'Reservada · Tecla macro ciega',
        unrelNoModels: 'No se detectaron modelos activos', unrelStandby: 'En espera · Tecla PBT mate',
        thinkDepth: 'Nivel de pensamiento', thinkMode: 'Modo de pensamiento', plannerStatus: 'Estado del planificador', elemStatus: 'Estado del elemento',
        grpPre: 'Grupo ', grpSuf: '', elemSeriesSuf: 'Serie Elemento Google', blindDescSuf: 'Tecla de elemento no lanzada', blindSubSuf: 'Tecla en espera',
        synced: 'SINCRONIZADO', pickerAria: 'Selector 3D Tabla Periódica', hudAria: 'Controles de vista 3D y accesibilidad',
        resetTitle: 'Restablecer vista 3D (R)', resetLbl: 'Restablecer',
        muteOn: 'Silenciado (clic para activar sonido)', muteOff: 'Alternar sonido mecánico', muteInit: 'Alternar sonido mecánico', closeLbl: 'Confirmar y cerrar',
      },
      fr: {
        tierOrch: 'Étapes courantes déchargées sur 1H (~168 tok/s)', tierLocked: 'Touche aveugle anodisée · 0.00U', tierAuxSingle: '0.76U Lévitation + Mode adaptatif',
        tierXHigh: 'Extra · 1.06U Champ holographique 3 anneaux', tierHigh: 'High · 0.88U Pilier cristal', tierMed: 'Medium · 0.64U Double flux équilibré', tierLow: 'Low · 0.40U Flottement rapide',
        sessPre: 'Session en cours : ', sessSuf: ' · Cliquez sur une touche allumée pour changer',
        nonPlanner: 'HORS PLANIF.', reserved: 'RÉSERVÉ', clickOrch: 'CLIQUER POUR VERROUILLER ORCH', compare: 'COMPARER', active: 'ACTIF', orchLatched: 'ORCH VERROUILLÉ', standby: 'VEILLE',
        effDefault: 'Défaut', notInOrch: 'Hors liste des planificateurs Orchestrator · Déverrouillez #0 Orch',
        orch1HTagline: 'En mode Orch, 1H s’exécute en arrière-plan rapide (~168 tok/s)',
        orchLockedTags: ['Verrouillé Orch', 'Exécuteur 1H', 'Autonome'],
        tierNonPlanner: 'NON-PLANNER · Verrouillé Orch', tierOrchSwitch: 'Interrupteur #0 · Planif. + 1H',
        unrelNonPlanner: 'NON-PLANNER · Verrouillé Orch', unrelAuxBlind: 'Réservé · Touche macro aveugle',
        unrelNoModels: 'Aucun modèle élément actif détecté', unrelStandby: 'En veille · Touche PBT mat',
        thinkDepth: 'Niveau de réflexion', thinkMode: 'Mode de réflexion', plannerStatus: 'Statut planificateur', elemStatus: 'Statut élément',
        grpPre: 'Groupe ', grpSuf: '', elemSeriesSuf: 'Série Élément Google', blindDescSuf: 'Touche élément non publiée', blindSubSuf: 'Touche en veille',
        synced: 'SYNCHRONISÉ', pickerAria: 'Sélecteur 3D Tableau Périodique', hudAria: 'Réinitialisation vue 3D et accessibilité',
        resetTitle: 'Réinitialiser la vue 3D (R)', resetLbl: 'Réinit.',
        muteOn: 'Son coupé (cliquer pour réactiver)', muteOff: 'Basculer le son mécanique', muteInit: 'Basculer le son mécanique', closeLbl: 'Confirmer et fermer',
      },
      de: {
        tierOrch: 'Routinen auf 1H ausgelagert (~168 tok/s)', tierLocked: 'Eloxierte Blindtaste · 0.00U', tierAuxSingle: '0.76U Levitation + Adaptivmodus',
        tierXHigh: 'Extra · 1.06U 3-Ring-Hologrammfeld', tierHigh: 'High · 0.88U Kristallsäulen-Hub', tierMed: 'Medium · 0.64U Dual-Flux-Balance', tierLow: 'Low · 0.40U Flinker Low-Latency-Hub',
        sessPre: 'Aktuelle Sitzung: ', sessSuf: ' · Beleuchtete Taste zum Wechseln klicken',
        nonPlanner: 'KEIN PLANER', reserved: 'RESERVIERT', clickOrch: 'KLICKEN FÜR ORCH-MODUS', compare: 'VERGLEICH', active: 'AKTIV', orchLatched: 'ORCH AKTIV', standby: 'BEREIT',
        effDefault: 'Standard', notInOrch: 'Nicht in der Orchestrator-Planerliste · #0 Orch lösen für Einzelbetrieb',
        orch1HTagline: 'Im Orch-Modus läuft 1H als schneller Hintergrund-Runner (~168 tok/s)',
        orchLockedTags: ['Orch-gesperrt', '1H-Runner', 'Eigenständig'],
        tierNonPlanner: 'NON-PLANNER · In Orch gesperrt', tierOrchSwitch: '#0 Rastschalter · Planer + 1H',
        unrelNonPlanner: 'NON-PLANNER · In Orch gesperrt', unrelAuxBlind: 'Reserviert · Blinde Makrotaste',
        unrelNoModels: 'Keine aktiven Elementmodelle erkannt', unrelStandby: 'Standby · Matte PBT-Taste',
        thinkDepth: 'Denktiefe', thinkMode: 'Denkmodus', plannerStatus: 'Planer-Status', elemStatus: 'Element-Status',
        grpPre: 'Gruppe ', grpSuf: '', elemSeriesSuf: 'Google-Elementserie', blindDescSuf: 'Unveröffentlichte Elementtaste', blindSubSuf: 'Standby-Taste',
        synced: 'SYNCHRONISIERT', pickerAria: 'Periodensystem 3D-Modellauswahl', hudAria: '3D-Ansicht zurücksetzen & Bedienung',
        resetTitle: '3D-Ansicht zurücksetzen (R)', resetLbl: 'Reset',
        muteOn: 'Stummgeschaltet (klicken für Ton)', muteOff: 'Mechanisches Tastenklicken umschalten', muteInit: 'Mechanisches Tastenklicken umschalten', closeLbl: 'Bestätigen und schließen',
      },
    };
    function getPpI18nPack(langOrZh) {
      if (typeof langOrZh === 'string') return PP_I18N[langOrZh] || PP_I18N.en;
      return langOrZh ? PP_I18N['zh-CN'] : PP_I18N.en;
    }

    function formatAntigravTierNote(activeEffortCode, isAvailable, isAuxSingle, langOrZh, isOrchActive) {
      var pk = getPpI18nPack(langOrZh);
      if (isOrchActive && isAvailable) return pk.tierOrch;
      if (!isAvailable) return pk.tierLocked;
      if (isAuxSingle) return pk.tierAuxSingle;
      var code = String(activeEffortCode || 'high').toLowerCase();
      if (code.indexOf('xhigh') === 0 || code === 'max') return pk.tierXHigh;
      if (code.indexOf('high') === 0) return pk.tierHigh;
      if (code.indexOf('med') === 0) return pk.tierMed;
      return pk.tierLow;
    }

    function formatSwitchSpecText(effortCode, switchName, isAvailable, isAuxSingle) {
      if (!isAvailable) return '0.00U · Matte PBT Standby';
      var sw = switchName || 'Crystal Prism';
      if (isAuxSingle) return 'Adaptive · 0.76U ' + sw;
      var code = String(effortCode || 'high').toLowerCase();
      if (code.indexOf('xhigh') === 0 || code === 'max') return 'XHigh · 1.06U ' + sw;
      if (code.indexOf('high') === 0) return 'High · 0.88U ' + sw;
      if (code.indexOf('med') === 0) return 'Med · 0.64U ' + sw;
      return 'Low · 0.40U ' + sw;
    }

    function resolveEffortLitDots(effortCode, isAvailable) {
      if (!isAvailable) return 0;
      var code = String(effortCode || 'high').toLowerCase();
      if (code.indexOf('xhigh') === 0 || code === 'max') return 4;
      if (code.indexOf('high') === 0) return 3;
      if (code.indexOf('med') === 0) return 2;
      return 1;
    }

    function resolveEffortShortBadge(effortCode) {
      var code = String(effortCode || 'high').toLowerCase();
      if (code.indexOf('xhigh') === 0 || code === 'max') return 'XHigh';
      if (code.indexOf('high') === 0) return 'High';
      if (code.indexOf('med') === 0) return 'Med';
      if (code === 'low' || code === 'minimal') return 'Low';
      return 'High';
    }

    function fallbackKeyRect(slot, stageW, stageH) {
      var padX = stageW * 0.055;
      var padTop = stageH * 0.14;
      var cellW = ((stageW - padX * 2) * 0.84) / 18;
      var cellH = (stageH * 0.78) / 7;
      return {
        left: padX + (slot.col - 1) * cellW + 1,
        top: padTop + (slot.row - 1) * cellH + 1,
        width: Math.max(12, cellW - 2),
        height: Math.max(12, cellH - 2),
      };
    }

    function fallbackAuxKeyRect(auxIdx, stageW, stageH) {
      var col = auxIdx % 2;
      var row = Math.floor(auxIdx / 2);
      var baseLeft = stageW * 0.855;
      var baseTop = stageH * 0.44;
      var cellW = Math.max(24, stageW * 0.045);
      var cellH = Math.max(24, stageH * 0.11);
      return {
        left: baseLeft + col * (cellW + 4),
        top: baseTop + row * (cellH + 4),
        width: cellW,
        height: cellH,
      };
    }

    function pushOrbitSample(samples, x, y, tMs) {
      if (!Array.isArray(samples)) return;
      samples.push({ x: x, y: y, t: tMs });
      while (samples.length > 1 && tMs - samples[0].t > 56) samples.shift();
      while (samples.length > 16) samples.shift();
    }

    function computeOrbitFlingVelocity(samples, endX, endY, endMs) {
      if (!Array.isArray(samples) || samples.length < 1) return { velPitch: 0, velYaw: 0 };
      var lastSample = samples[samples.length - 1];
      if (endMs - lastSample.t > 52) return { velPitch: 0, velYaw: 0 };
      var anchor = samples[0];
      for (var i = samples.length - 1; i >= 0; i -= 1) {
        anchor = samples[i];
        if (endMs - samples[i].t >= ORBIT_FLING_WINDOW_MS) break;
      }
      var dtSec = (endMs - anchor.t) / 1000;
      if (dtSec < 0.004 || dtSec > 0.1) return { velPitch: 0, velYaw: 0 };
      var vx = (endX - anchor.x) / dtSec;
      var vy = (endY - anchor.y) / dtSec;
      return {
        velPitch: Math.max(-ORBIT_MAX_VEL_RAD, Math.min(ORBIT_MAX_VEL_RAD, vy * ORBIT_PITCH_RAD_PER_PX)),
        velYaw: Math.max(-ORBIT_MAX_VEL_RAD, Math.min(ORBIT_MAX_VEL_RAD, vx * ORBIT_YAW_RAD_PER_PX)),
      };
    }

    function hasPointerCoords(ev) {
      if (!ev) return false;
      return (Number(ev.clientX) || 0) !== 0 || (Number(ev.clientY) || 0) !== 0;
    }

    function resolvePickedControlAction(picked) {
      if (!picked || picked.kind !== 'control') return null;
      return picked.action || picked.id || null;
    }

    /* ── Main Controller Factory ───────────────────────────────────────────── */

    function mountPeriodicPicker(options) {
      var opts = options && typeof options === 'object' ? options : {};
      var root = opts.root || (typeof window !== 'undefined' ? window : globalThis);
      var doc = opts.doc || (root && root.document) || (typeof document !== 'undefined' ? document : null);
      var initialMode = opts.mode === 'off' ? 'off' : 'on';
      var requestedStageMode =
        opts.initialStageMode === 'fullscreen' || opts.stageMode === 'fullscreen' ? 'fullscreen' : 'drawer';

      /* Resolve sibling modules (allowing test overrides on opts.root) */
      var audioFx = resolveAudioFxModule(root) || defaultAudioFx;
      var catalog = resolveModelCatalogModule(root) || defaultCatalog;
      var hostBridge = resolveHostBridgeModule(root) || defaultHostBridge;
      var bentoUi = resolveBentoUiModule(root) || defaultBentoUi;

      var ROOT_ID = bentoUi.ROOT_ID || 'ag-prism-periodic-picker-root';
      var ROOT_MARKER_ATTR = bentoUi.ROOT_MARKER_ATTR || 'data-ag-prism-periodic-picker';
      var ELEMENTS_90 = catalog.ELEMENTS_90 || [];
      var SLOT_BY_Z = catalog.SLOT_BY_Z || new Map();
      var GROUP_META = catalog.GROUP_META || {};
      var ELEMENT_LORE = catalog.ELEMENT_LORE || {};
      var ELEMENT_SPEC_PROFILES = catalog.ELEMENT_SPEC_PROFILES || {};
      var EFFORT_ORDER = catalog.EFFORT_ORDER || ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
      var EFFORT_NORM_MAP = catalog.EFFORT_NORM_MAP || {};
      var EFFORT_LABELS = catalog.EFFORT_LABELS || {};
      var AUX_PAGE_SIZE = catalog.AUX_PAGE_SIZE || 6;
      var EXCLUDED_FAMILY_RE = catalog.EXCLUDED_FAMILY_RE || hostBridge.EXCLUDED_FAMILY_RE;

      var mkEl = bentoUi.mkEl;
      var setStyleVar = bentoUi.setStyleVar;
      var safeRemove = bentoUi.safeRemove;
      var markPeriodicOwnedRoot =
        typeof bentoUi.markPeriodicOwnedRoot === 'function' ? bentoUi.markPeriodicOwnedRoot : function (el) { return el; };

      var setTimer = root && typeof root.setTimeout === 'function' ? root.setTimeout.bind(root) : setTimeout;
      var clearTimer = root && typeof root.clearTimeout === 'function' ? root.clearTimeout.bind(root) : clearTimeout;
      var setIntervalFn =
        root && typeof root.setInterval === 'function'
          ? root.setInterval.bind(root)
          : typeof setInterval === 'function'
          ? setInterval
          : null;
      var clearIntervalFn =
        root && typeof root.clearInterval === 'function'
          ? root.clearInterval.bind(root)
          : typeof clearInterval === 'function'
          ? clearInterval
          : null;
      function isHostModelTriggerLocked(triggerBtn) {
        if (typeof hostBridge.isModelTriggerLocked === 'function') {
          return Boolean(hostBridge.isModelTriggerLocked(triggerBtn, doc));
        }
        return false;
      }
      var reqRaf =
        root && typeof root.requestAnimationFrame === 'function'
          ? root.requestAnimationFrame.bind(root)
          : typeof requestAnimationFrame === 'function'
          ? requestAnimationFrame
          : null;
      var cancelRaf =
        root && typeof root.cancelAnimationFrame === 'function'
          ? root.cancelAnimationFrame.bind(root)
          : typeof cancelAnimationFrame === 'function'
          ? cancelAnimationFrame
          : null;

      /* Clean up any pre-existing singleton instance before mounting */
      if (root && root.__agPrismPeriodicPicker && typeof root.__agPrismPeriodicPicker.destroy === 'function') {
        try {
          root.__agPrismPeriodicPicker.destroy();
        } catch (e) {}
      }

      if (initialMode === 'off') {
        if (typeof bentoUi.cleanupUiResiduals === 'function') bentoUi.cleanupUiResiduals(doc);
        if (typeof hostBridge.setHoldTooltipSuppression === 'function') hostBridge.setHoldTooltipSuppression(doc, false);
        if (typeof hostBridge.setOpenTooltipSuppression === 'function') hostBridge.setOpenTooltipSuppression(doc, false);
        var offStageMode = requestedStageMode;
        var offController = {
          destroy: function () {
            if (typeof bentoUi.cleanupUiResiduals === 'function') bentoUi.cleanupUiResiduals(doc);
          },
          getStatus: function () {
            return { status: 'off', mode: 'off', stageMode: offStageMode, orchLatched: false, open: false };
          },
          setMode: function (nextMode) {
            if (nextMode === 'on') {
              return mountPeriodicPicker({
                root: root,
                doc: doc,
                mode: 'on',
                initialStageMode: offStageMode,
              });
            }
            if (typeof bentoUi.cleanupUiResiduals === 'function') bentoUi.cleanupUiResiduals(doc);
            return offController;
          },
          open: function () { return false; },
          close: function () {},
          isOpen: function () { return false; },
          getStageMode: function () { return offStageMode; },
          setStageMode: function (m) {
            offStageMode = m === 'fullscreen' ? 'fullscreen' : 'drawer';
            return offStageMode;
          },
          toggleStageMode: function () {
            offStageMode = offStageMode === 'drawer' ? 'fullscreen' : 'drawer';
            return offStageMode;
          },
          toggleCardFlip: function () { return false; },
          setPointerNorm: function () { return false; },
          setPointerClient: function () { return false; },
          getProjectedRects: function () { return null; },
          getChassisOrbit: function () { return { pitch: 0, yaw: 0, isRotated: false }; },
          setChassisOrbit: function () { return false; },
          resetChassisOrbit: function () { return false; },
          syncBadges: function () {},
          onHostTriggerChanged: function () {},
          getAuxPage: function () { return 0; },
          setAuxPage: function () { return 0; },
          getAuxPageCount: function () { return 1; },
        };
        return offController;
      }

      var currentMode = 'on';
      var stageMode = requestedStageMode;
      var isDestroyed = false;

      var audioEngine =
        typeof audioFx.createAudioFxEngine === 'function'
          ? audioFx.createAudioFxEngine({ root: root, doc: doc })
          : null;
      var muted = audioEngine
        ? audioEngine.isMuted()
        : typeof audioFx.readMutedPref === 'function'
        ? audioFx.readMutedPref(root)
        : false;

      var explicitConfirmSlamMs =
        opts.confirmSlamMs !== undefined && Number.isFinite(Number(opts.confirmSlamMs))
          ? Math.max(0, Math.round(Number(opts.confirmSlamMs)))
          : opts.enableConfirmSlam === true
          ? CONFIRM_SLAM_DELAY_MS
          : opts.enableConfirmSlam === false
          ? 0
          : null;

      function readClockMs() {
        if (root && root.performance && typeof root.performance.now === 'function') {
          return root.performance.now();
        }
        return Date.now();
      }

      function playSound(kind, stepIndex) {
        if (isDestroyed || muted || !audioEngine) return false;
        return audioEngine.playSound(kind, stepIndex);
      }

      function syncPrismHostUi() {
        try {
          if (root && root.__agPrism && typeof root.__agPrism.sync === 'function') {
            root.__agPrism.sync();
          }
        } catch (e) {}
      }

      /* ── Controller Runtime State ──────────────────────────────────────── */

      var holdState = null;
      var isReplayingNativeTrigger = false;
      var pendingLongPressReleaseBtn = null;
      var suppressUntilMs = 0;
      var suppressTargetBtn = null;
      var suppressTrailingUntilMs = 0;
      var suppressTrailingBtn = null;
      var suppressTimer = 0;

      var overlayEl = null;
      var deskmatEl = null;
      var dockTopRimEl = null;
      var dockGripEl = null;
      var spatialDockEl = null;
      var bentoRefs = null;
      var stageEl = null;
      var floorShadowEl = null;
      var canvasEl = null;
      var hitLayerEl = null;
      var hudPillEl = null;
      var swatchesWrapEl = null;
      var activeRenderer = null;
      var dockResizeObserver = null;
      /* 离屏 DOM 壳与遥测缓存（正常 close 保留以便热开 <16ms，hidden/destroy/releaseHeavyCaches 立即释放） */
      var cachedShell = null;
      var cachedHostTelemetry = null;
      var activeHudElementsKey = '';

      /* Zero-reflow cached geometry (updated ONLY in open / resize / ResizeObserver / transitionend) */
      var cachedOverlayWidth = 1280;
      var cachedComposerHeight = 0;
      var cachedDockBounds = { left: 60, top: 220, width: 1280, height: 340 };
      var cachedCardBounds = { left: 74, top: 232, width: 300, height: 316 };
      var cachedRightCardBounds = { left: 1080, top: 232, width: 246, height: 316 };
      var cachedStageBounds = { left: 320, top: 220, width: 760, height: 340, valid: false };
      var lastStageRectFn = null;
      var rimGlowWasActive = false;
      var rimDockWasActive = false;
      var rimCardWasActive = false;
      var rimRightWasActive = false;
      var lastDockCompactSig = '';
      var lastShadowPxStr = '';
      var lastShadowPyStr = '';
      var lastStageCursor = '';

      /* High-refresh (120-300Hz) single-frame pointermove coalescing state */
      var lastPointerClient = { x: -9999, y: -9999, active: false };
      var lastFlushedPointer = { x: NaN, y: NaN, target: null, inside: false };
      var extNearRendererActive = false;
      var pendingPointerMove = null;
      var pointerMoveRafId = 0;
      var lastAuxWheelMs = 0;

      /* Incremental DOM diff caches (0 full 90-key scans on hover!) */
      var lastDomSelectedZ = undefined;
      var lastDomHoveredZ = null;
      var lastDomSelectedAuxLocal = undefined;
      var lastDomOrchLatched = undefined;
      var lastDomChromeSig = '';
      var lastDomHaloSig = '';
      var lastDomHudSig = '';
      var lastDomCtrlSig = '';
      var lastDomBannerSig = '';
      var availabilityDomVersion = 0;
      var lastDomAvailVersion = -1;

      /* Active host session, pagination & selection state */
      var activeAnchorBtn = null;
      var activeHostCtx = null;
      var fullAvailableEntries = [];
      var fullAvailableByZ = new Map();
      var fullAuxSlots = [];
      var effectiveAuxAll = [];
      var orchRegistry = null;
      var orchLatched = false;
      var availableEntries = [];
      var availableByZ = new Map();
      var activeAuxPage = 0;
      var auxPageCount = 1;
      var auxSlots = []; /* Current 6-slot 2x3 page slice */
      var selectedZ = null;
      var selectedGlobalAuxIndex = null;
      var hoveredZ = null;
      var hoveredAuxIndex = null; /* Page-local 0..5 */
      var inspectedBlindZ = null;
      var inspectedBlindAuxIndex = null; /* Page-local 0..5 */
      var blindFlashZ = null;
      var pressedZ = null;
      var pressedAuxIndex = null; /* Page-local 0..5 */
      var hoveredEffort = null;
      var pressedEffort = null;
      var dragEffortProgress = null;
      var hoveredBtn = null;
      var pressedBtn = null;
      var lockedShakeZ = null;
      var lockedShakeAuxIndex = null; /* Page-local { auxIndex, progress } */
      var cardFlipped = false;
      var compactExpanded = false;
      var isConfirmClosing = false;
      var isDrawerClosing = false;
      var confirmSlamZ = null;
      var confirmSlamAuxIndex = null; /* Page-local 0..5 */
      var pointerDownOutside = false;
      var isOrbitDragging = false;
      var gestureState = null;
      var pendingServoOrbit = null;
      var suppressPostDragClickUntil = 0;
      var activeEffortByZ = new Map();
      var activeEffortByGlobalAux = new Map();
      var activeCommittedAuxBadge = null;
      var activeCommittedElementZ = null;

      /* Open-only session sync state (80ms debounce + zero-redraw identical signature) */
      var lastSessionSig = { fullSig: '', modelSig: '', convId: '' };
      var sessionSyncTimer = 0;
      var sessionSyncFollowupTimer = 0;
      var openLockGuardTimer = 0;
      var sessionTriggerObserver = null;
      var sessionHistoryPatched = false;
      var origHistoryPushState = null;
      var origHistoryReplaceState = null;
      var wrappedHistoryPushState = null;
      var wrappedHistoryReplaceState = null;
      var openSessionWindowListeners = [];
      var openSessionDocListeners = [];

      /* Focus / visibility 0fps sleep state */
      var windowBlurred = false;
      var isHostPaused = false;

      var keyNodesByZ = new Map();
      var auxKeyNodes = [];
      var hudChipByZ = new Map();
      var uiRefs = null;

      var openRafId = 0;
      var modeLayoutRafId = 0;
      var orbitSyncRafId = 0;
      var badgeSyncTimer = 0;
      var blindDwellTimer = 0;
      var blindFlashTimer = 0;
      var confirmCloseTimer = 0;
      var drawerClosingTimer = 0;
      var pendingTimers = new Set();

      /* Lightweight documentElement-only attribute observer (NEVER observes document.body!) */
      var themeObserver = null;
      var isMutatingBadge = false;

      var docListeners = [];
      var rootListeners = [];

      function onDoc(type, fn, capture) {
        if (!doc || typeof doc.addEventListener !== 'function') return;
        doc.addEventListener(type, fn, Boolean(capture));
        docListeners.push([type, fn, Boolean(capture)]);
      }

      function onRoot(type, fn, capture) {
        if (!root || typeof root.addEventListener !== 'function') return;
        root.addEventListener(type, fn, Boolean(capture));
        rootListeners.push([type, fn, Boolean(capture)]);
      }

      function removeAllListeners() {
        if (doc && typeof doc.removeEventListener === 'function') {
          for (var i = 0; i < docListeners.length; i += 1) {
            doc.removeEventListener(docListeners[i][0], docListeners[i][1], docListeners[i][2]);
          }
        }
        docListeners.length = 0;
        if (root && typeof root.removeEventListener === 'function') {
          for (var j = 0; j < rootListeners.length; j += 1) {
            root.removeEventListener(rootListeners[j][0], rootListeners[j][1], rootListeners[j][2]);
          }
        }
        rootListeners.length = 0;
      }

      function scheduleTrackedTimer(fn, delayMs) {
        var tid = setTimer(function () {
          pendingTimers.delete(tid);
          fn();
        }, delayMs);
        pendingTimers.add(tid);
        return tid;
      }

      function cancelBlindDwellTimer() {
        if (blindDwellTimer) {
          clearTimer(blindDwellTimer);
          pendingTimers.delete(blindDwellTimer);
          blindDwellTimer = 0;
        }
      }

      function cancelBlindFlashTimer() {
        if (blindFlashTimer) {
          clearTimer(blindFlashTimer);
          pendingTimers.delete(blindFlashTimer);
          blindFlashTimer = 0;
        }
        blindFlashZ = null;
      }

      function stopOrbitFollowSync() {
        if (orbitSyncRafId && cancelRaf) cancelRaf(orbitSyncRafId);
        orbitSyncRafId = 0;
      }

      function cancelPendingPointerMoveRaf() {
        if (pointerMoveRafId && cancelRaf) cancelRaf(pointerMoveRafId);
        pointerMoveRafId = 0;
        pendingPointerMove = null;
      }

      function clearBadgeTimer() {
        if (badgeSyncTimer) {
          clearTimer(badgeSyncTimer);
          badgeSyncTimer = 0;
        }
      }

      function clearSessionSyncTimer() {
        if (sessionSyncTimer) {
          clearTimer(sessionSyncTimer);
          sessionSyncTimer = 0;
        }
      }

      function clearSessionSyncFollowupTimer() {
        if (sessionSyncFollowupTimer) {
          clearTimer(sessionSyncFollowupTimer);
          sessionSyncFollowupTimer = 0;
        }
      }

      function clearOpenLockGuardTimer() {
        if (openLockGuardTimer) {
          if (clearIntervalFn) {
            try { clearIntervalFn(openLockGuardTimer); } catch (e) {}
          }
          openLockGuardTimer = 0;
        }
      }

      function clearTransientAsync() {
        if (openRafId && cancelRaf) cancelRaf(openRafId);
        openRafId = 0;
        if (modeLayoutRafId && cancelRaf) cancelRaf(modeLayoutRafId);
        modeLayoutRafId = 0;
        stopOrbitFollowSync();
        cancelPendingPointerMoveRaf();
        clearSessionSyncTimer();
        clearSessionSyncFollowupTimer();
        clearOpenLockGuardTimer();
        blindDwellTimer = 0;
        blindFlashTimer = 0;
        blindFlashZ = null;
        extNearRendererActive = false;
        confirmCloseTimer = 0;
        drawerClosingTimer = 0;
        isConfirmClosing = false;
        isDrawerClosing = false;
        confirmSlamZ = null;
        confirmSlamAuxIndex = null;
        lockedShakeAuxIndex = null;
        isOrbitDragging = false;
        gestureState = null;
        pendingServoOrbit = null;
        dragEffortProgress = null;
        suppressPostDragClickUntil = 0;
        pendingTimers.forEach(function (tid) {
          clearTimer(tid);
        });
        pendingTimers.clear();
      }

      /* ── Immediate VRAM / Offscreen / Audio Cache Release ──────────────── */

      function releaseAllHeavyCaches() {
        cachedShell = null;
        cachedHostTelemetry = null;
        if (activeRenderer) {
          if (typeof activeRenderer.releaseCaches === 'function') {
            try { activeRenderer.releaseCaches(); } catch (e) {}
          }
          if (activeRenderer.oledPainter && typeof activeRenderer.oledPainter.releaseCaches === 'function') {
            try { activeRenderer.oledPainter.releaseCaches(); } catch (e2) {}
          }
        }
        var oledMod = resolveOledScreenModule(root);
        if (oledMod) {
          if (typeof oledMod.releaseCaches === 'function') {
            try { oledMod.releaseCaches(root); } catch (e3) {}
          }
          if (typeof oledMod.evictIdleOledWallpapers === 'function') {
            try { oledMod.evictIdleOledWallpapers(root); } catch (e4) {}
          }
        }
        var grainMod = resolveGrainAssets(root);
        if (grainMod && typeof grainMod.evictGrainTextures === 'function') {
          try { grainMod.evictGrainTextures(); } catch (e5) {}
        }
        var kbMod = resolveKeyboard3DFactory(root);
        if (kbMod && typeof kbMod.evictLegendAtlasCache === 'function') {
          try { kbMod.evictLegendAtlasCache(); } catch (eKb) {}
        }
        if (audioEngine && typeof audioEngine.dispose === 'function') {
          try { audioEngine.dispose(); } catch (e6) {}
        }
      }

      /* ── True 0fps Blur / Hidden Sleep Synchronization ─────────────────── */

      function isHostWinBlurAttrSet() {
        try {
          if (doc && doc.documentElement && typeof doc.documentElement.getAttribute === 'function') {
            return doc.documentElement.getAttribute('data-ag-cs-win-blur') === '1';
          }
        } catch (e) {}
        return false;
      }

      function isDocHiddenNow() {
        return Boolean(doc && (doc.hidden === true || doc.visibilityState === 'hidden'));
      }

      function clearStaleBlurIfActive() {
        if (windowBlurred && !isDocHiddenNow() && !isHostWinBlurAttrSet()) {
          windowBlurred = false;
        }
      }

      function computeHostPaused() {
        if (isDocHiddenNow()) return true;
        if (isHostWinBlurAttrSet()) return true;
        if (windowBlurred) return true;
        return false;
      }

      function applyRendererPausedState(paused) {
        var flag = Boolean(paused);
        if (flag) {
          stopOrbitFollowSync();
          cancelPendingPointerMoveRaf();
        }
        if (activeRenderer) {
          if (typeof activeRenderer.setPaused === 'function') {
            try { activeRenderer.setPaused(flag); } catch (e) {}
          }
          if (activeRenderer.oledPainter && typeof activeRenderer.oledPainter.setPaused === 'function') {
            try { activeRenderer.oledPainter.setPaused(flag); } catch (e2) {}
          }
        }
      }

      function syncHostPauseState() {
        var nextPaused = computeHostPaused();
        if (nextPaused === isHostPaused) return nextPaused;
        isHostPaused = nextPaused;
        if (overlayEl && !isDestroyed) {
          applyRendererPausedState(isHostPaused);
          if (!isHostPaused && !isDrawerClosing && !isConfirmClosing) {
            syncSceneAndDom(true);
          }
        }
        return isHostPaused;
      }

      /* ── Mini Keycap Badge Sync (.ag-pp-mini-keycap, Zero body MO) ──────── */

      function inferOrchCompactBadgeFromHost(hostCtx, rawBtnLabel) {
        var candidates = [];
        if (hostCtx && hostCtx.orchestratorPick && hostCtx.orchestratorPick.model) {
          candidates.push(hostCtx.orchestratorPick.model);
        }
        if (rawBtnLabel) {
          var pm = /\(([^)]+)\)/.exec(String(rawBtnLabel));
          if (pm && pm[1]) {
            candidates.push('Gemini 4 ' + pm[1].trim());
            candidates.push(pm[1].trim());
          }
        }
        if (hostCtx && hostCtx.orchestratorDefaultPlanner) {
          candidates.push(hostCtx.orchestratorDefaultPlanner);
        }
        if (hostCtx && Array.isArray(hostCtx.orchestratorPlanners) && hostCtx.orchestratorPlanners.length > 0) {
          candidates.push(hostCtx.orchestratorPlanners[0]);
        }
        for (var i = 0; i < candidates.length; i += 1) {
          var cand = candidates[i];
          if (!cand) continue;
          var elP = catalog.parseElementModelLabel(cand);
          if (elP) return hostBridge.formatOrchElementCompactBadge(elP.slotZ, SLOT_BY_Z.get(elP.slotZ));
          var rawStr = typeof cand === 'string' ? cand : String(cand.label || cand.modelId || '');
          if (/\b(?:opus|sonnet|haiku|claude|flash|gpt|codex)\b/i.test(rawStr)) {
            return hostBridge.formatOrchAuxCompactBadge(rawStr, rawStr);
          }
        }
        if (activeCommittedElementZ !== null) {
          return hostBridge.formatOrchElementCompactBadge(activeCommittedElementZ, SLOT_BY_Z.get(activeCommittedElementZ));
        }
        if (hostCtx && Array.isArray(hostCtx.modelOptions) && hostCtx.modelOptions.length > 0) {
          var foundZs = new Set();
          var hasOpusOpt = false;
          for (var m = 0; m < hostCtx.modelOptions.length; m += 1) {
            var mo = hostCtx.modelOptions[m];
            var mp = catalog.parseElementModelLabel(mo);
            if (mp) foundZs.add(mp.slotZ);
            else if (mo && /\bopus\b/i.test(String(mo.label || '') + ' ' + String(mo.modelId || ''))) hasOpusOpt = true;
          }
          if (foundZs.has(6)) return '0·6C';
          if (foundZs.has(10)) return '0·Ne';
          if (foundZs.has(18)) return '0·Ar';
          if (hasOpusOpt) return '0·Op';
        }
        return '0·6C';
      }

      function classifyDirectHostAuxBadge(rawLabel, modelId, hostCtx) {
        var txt = String(rawLabel || '').trim();
        var mid = String(modelId || '').trim();
        var hay = (txt + ' ' + mid).toLowerCase();
        if (!hay.trim()) return null;

        if (/orchestrator|编排|调度器/.test(hay)) {
          return {
            kind: 'aux',
            auxId: 'orchestrator',
            shortLabel: inferOrchCompactBadgeFromHost(hostCtx, txt),
            miniKey: 'orchestrator',
          };
        }
        if (/\bopus\b/.test(hay)) return { kind: 'aux', auxId: 'claude-opus', shortLabel: 'OP', miniKey: 'claude' };
        if (/\bsonnet\b/.test(hay)) return { kind: 'aux', auxId: 'claude-sonnet', shortLabel: 'SN', miniKey: 'claude' };
        if (/\bhaiku\b/.test(hay)) return { kind: 'aux', auxId: 'claude-haiku', shortLabel: 'HK', miniKey: 'claude' };
        if (/\b(?:claude|anthropic)\b/.test(hay)) return { kind: 'aux', auxId: 'claude-sonnet', shortLabel: 'CL', miniKey: 'claude' };
        if (/\bflash\b/.test(hay)) return { kind: 'aux', auxId: 'flash', shortLabel: 'FL', miniKey: 'flash' };
        if (/\bcodex\b/.test(hay)) return { kind: 'aux', auxId: 'codex', shortLabel: 'CX', miniKey: 'gpt' };
        if (/\b(?:gpt|openai)\b|\bo[134](?:-[a-z0-9]+)?\b/.test(hay)) return { kind: 'aux', auxId: 'gpt-oss', shortLabel: 'GP', miniKey: 'gpt' };
        return null;
      }

      function resolveButtonBadgeDescriptor(btn) {
        if (!btn) return null;
        var hostCtx = hostBridge.readHostModelContext(btn, root, doc);
        var ctxSel = hostCtx && hostCtx.selectedModel ? hostCtx.selectedModel : null;
        var cleanNow = hostBridge.readCleanButtonLabel(btn, false);
        var ctxLabel = ctxSel && typeof ctxSel.label === 'string' ? ctxSel.label.trim() : '';

        if (activeCommittedAuxBadge) {
          var matchesBtn = cleanNow && cleanNow === activeCommittedAuxBadge.label;
          var matchesCtx = (!cleanNow || cleanNow === ctxLabel) && ctxLabel && ctxLabel === activeCommittedAuxBadge.label;
          if (matchesBtn || matchesCtx) {
            return {
              kind: 'aux',
              auxId: activeCommittedAuxBadge.id,
              shortLabel: activeCommittedAuxBadge.shortLabel,
              miniKey: activeCommittedAuxBadge.miniKey || 'fallback',
            };
          }
          if (!overlayEl && (cleanNow || ctxLabel)) activeCommittedAuxBadge = null;
        }

        if (activeCommittedElementZ !== null && ctxSel) {
          var committedParsed = catalog.parseElementModelLabel(ctxSel);
          if (
            committedParsed &&
            committedParsed.slotZ === activeCommittedElementZ &&
            (!cleanNow || !EXCLUDED_FAMILY_RE.test(cleanNow))
          ) {
            var directCheck = cleanNow ? catalog.parseElementModelLabel(cleanNow) : committedParsed;
            if (!directCheck || directCheck.slotZ === activeCommittedElementZ) {
              return { kind: 'element', slotZ: committedParsed.slotZ, symbol: committedParsed.symbol };
            }
          }
        }

        if (cleanNow) {
          if (!EXCLUDED_FAMILY_RE.test(cleanNow)) {
            var direct = catalog.parseElementModelLabel(cleanNow);
            if (direct) return { kind: 'element', slotZ: direct.slotZ, symbol: direct.symbol };
            if (ctxSel && typeof ctxSel.modelId === 'string') {
              var assisted = catalog.parseElementModelLabel({ label: cleanNow, modelId: ctxSel.modelId });
              if (assisted) return { kind: 'element', slotZ: assisted.slotZ, symbol: assisted.symbol };
            }
          }
          var auxDirect = classifyDirectHostAuxBadge(
            cleanNow,
            ctxSel && typeof ctxSel.modelId === 'string' && (!ctxLabel || ctxLabel === cleanNow) ? ctxSel.modelId : '',
            hostCtx
          );
          if (auxDirect) return auxDirect;
          return null;
        }
        if (ctxSel) {
          var fallbackParsed = catalog.parseElementModelLabel(ctxSel);
          if (fallbackParsed) return { kind: 'element', slotZ: fallbackParsed.slotZ, symbol: fallbackParsed.symbol };
          return classifyDirectHostAuxBadge(ctxSel.label, ctxSel.modelId, hostCtx);
        }
        return null;
      }

      function removeAllMiniKeycaps() {
        if (!doc || typeof doc.querySelectorAll !== 'function') return;
        try {
          var badges = doc.querySelectorAll('.ag-pp-mini-keycap');
          for (var i = 0; i < badges.length; i += 1) safeRemove(badges[i]);
        } catch (e) {}
      }

      function placeMiniBadgeInButton(btn, badge) {
        if (!btn || !badge) return;
        var glyph = typeof btn.querySelector === 'function' ? btn.querySelector('.ag-cs-model-glyph') : null;
        if (glyph && glyph.parentNode === btn && typeof btn.insertBefore === 'function') {
          if (badge.parentNode !== btn || glyph.nextSibling !== badge) {
            if (glyph.nextSibling) btn.insertBefore(badge, glyph.nextSibling);
            else if (typeof btn.appendChild === 'function') btn.appendChild(badge);
          }
          return;
        }
        if (badge.parentNode === btn) return;
        var chList = btn.children || btn.childNodes;
        var lastChild =
          btn.lastElementChild || btn.lastChild || (chList && chList.length > 0 ? chList[chList.length - 1] : null);
        var lastTag = lastChild && lastChild.tagName ? String(lastChild.tagName).toLowerCase() : '';
        if (lastTag === 'svg' && lastChild !== btn.firstChild && lastChild.parentNode === btn && typeof btn.insertBefore === 'function') {
          btn.insertBefore(badge, lastChild);
          return;
        }
        if (typeof btn.appendChild === 'function') btn.appendChild(badge);
      }

      function syncMiniKeycapOnSingleButton(btn, profile) {
        if (!btn || !doc) return;
        var existing = typeof btn.querySelector === 'function' ? btn.querySelector('.ag-pp-mini-keycap') : null;
        var desc = resolveButtonBadgeDescriptor(btn);
        if (!desc) {
          if (existing) {
            isMutatingBadge = true;
            try { safeRemove(existing); } finally { isMutatingBadge = false; }
          }
          return;
        }
        var isAuxDesc = desc.kind === 'aux';
        var zText = isAuxDesc ? '' : String(desc.slotZ);
        var symText = isAuxDesc ? desc.shortLabel : desc.symbol;
        var colors = isAuxDesc
          ? bentoUi.miniKeycapColorsForAux(desc.miniKey, profile)
          : bentoUi.miniKeycapColorsForZ(desc.slotZ, profile);
        var sig =
          (isAuxDesc ? 'aux:' + desc.auxId + ':' + symText : desc.slotZ + ':' + desc.symbol) +
          ':' + profile.id + ':' + (profile.accent || 'follow') + ':' + (profile.isMono ? '1' : '0');

        isMutatingBadge = true;
        try {
          var badge = existing;
          if (!badge) {
            badge = mkEl(doc, 'span', 'ag-pp-mini-keycap');
            markPeriodicOwnedRoot(badge);
            badge.setAttribute('data-ag-no-i18n', '1');
            badge.setAttribute('data-ag-owned', '1');
            badge.setAttribute('aria-hidden', 'true');
            badge.appendChild(mkEl(doc, 'span', 'ag-pp-mk-z', zText));
            badge.appendChild(mkEl(doc, 'span', 'ag-pp-mk-sym', symText));
            placeMiniBadgeInButton(btn, badge);
          } else {
            placeMiniBadgeInButton(btn, badge);
            if (badge.getAttribute('data-sig') !== sig) {
              var zNode = badge.querySelector ? badge.querySelector('.ag-pp-mk-z') : badge.firstChild;
              var sNode = badge.querySelector ? badge.querySelector('.ag-pp-mk-sym') : badge.children && badge.children[1];
              if (zNode) zNode.textContent = zText;
              if (sNode) sNode.textContent = symText;
            }
          }
          if (badge.getAttribute('data-sig') !== sig) {
            badge.setAttribute('data-sig', sig);
            if (isAuxDesc) {
              badge.removeAttribute('data-z');
              badge.setAttribute('data-aux-id', desc.auxId);
              badge.setAttribute('data-symbol', symText);
            } else {
              badge.removeAttribute('data-aux-id');
              badge.setAttribute('data-z', String(desc.slotZ));
              badge.setAttribute('data-symbol', desc.symbol);
            }
            setStyleVar(badge, '--mk-bg', colors.bg);
            setStyleVar(badge, '--mk-fg', colors.fg);
            setStyleVar(badge, '--mk-border', colors.border);
            setStyleVar(badge, '--mk-skirt', null);
            setStyleVar(badge, '--mk-gloss', null);
            setStyleVar(badge, '--mk-gleam', null);
          }
        } finally {
          isMutatingBadge = false;
        }
      }

      function syncMiniKeycapBadges() {
        if (isDestroyed || currentMode === 'off' || !doc) return;
        bentoUi.ensureStyles(doc);
        var profile = bentoUi.resolvePrismThemeProfile(doc, root);
        var buttons = hostBridge.collectVisibleModelTriggerButtons(doc);
        if (
          activeAnchorBtn &&
          isNodeConnectedToDoc(doc, activeAnchorBtn) &&
          buttons.indexOf(activeAnchorBtn) === -1 &&
          !hostBridge.isInsideExcludedZone(activeAnchorBtn)
        ) {
          buttons.push(activeAnchorBtn);
        }
        for (var i = 0; i < buttons.length; i += 1) {
          syncMiniKeycapOnSingleButton(buttons[i], profile);
        }
      }

      function scheduleBadgeSync(delayMs) {
        if (isDestroyed || currentMode === 'off') return;
        if (badgeSyncTimer) return;
        badgeSyncTimer = setTimer(function () {
          badgeSyncTimer = 0;
          if (!isDestroyed && currentMode === 'on') syncMiniKeycapBadges();
        }, Math.max(16, Number(delayMs) || 40));
      }

      /* ── Prewarm & Long-Press Hold Management (Pain Point #2 Tooltip Guard) */

      function prewarmActiveModelAssets(btn) {
        if (isDestroyed || currentMode === 'off') return;
        try {
          var grainMod = resolveGrainAssets(root);
          if (grainMod && typeof grainMod.getGrainTextures === 'function') {
            grainMod.getGrainTextures();
          }
          var oledMod = resolveOledScreenModule(root);
          if (oledMod && typeof oledMod.prewarmOledWallpaper === 'function') {
            var profile = bentoUi.resolvePrismThemeProfile(doc, root);
            var modeTag = profile.isLight ? 'light' : 'dark';
            var desc = resolveButtonBadgeDescriptor(btn);
            var targetKey = '6';
            if (desc) {
              if (desc.kind === 'element') {
                var zNum = Number(desc.slotZ) || 6;
                targetKey = zNum === 1 || zNum === 6 || zNum === 10 || zNum === 18 ? String(zNum) : 'standby';
              } else if (desc.kind === 'aux') {
                if (desc.auxId === 'orchestrator' && desc.shortLabel) {
                  if (/6C/i.test(desc.shortLabel)) targetKey = '6';
                  else if (/Ne/i.test(desc.shortLabel)) targetKey = '10';
                  else if (/Ar/i.test(desc.shortLabel)) targetKey = '18';
                  else if (/1H/i.test(desc.shortLabel)) targetKey = '1';
                  else if (/Op/i.test(desc.shortLabel)) targetKey = 'claude';
                  else targetKey = 'orchestrator';
                } else if (desc.miniKey === 'claude' || desc.miniKey === 'flash' || desc.miniKey === 'gpt' || desc.miniKey === 'orchestrator') {
                  targetKey = desc.miniKey;
                }
              }
            }
            oledMod.prewarmOledWallpaper(root, modeTag, targetKey);
          }
        } catch (e) {}
      }

      function cancelHold(willOpenImmediately) {
        var prevHold = holdState;
        if (prevHold) {
          if (prevHold.ringTimer) clearTimer(prevHold.ringTimer);
          if (prevHold.prewarmTimer) clearTimer(prevHold.prewarmTimer);
          if (prevHold.openTimer) clearTimer(prevHold.openTimer);
          if (prevHold.ring && prevHold.ring.raf && cancelRaf) cancelRaf(prevHold.ring.raf);
          if (prevHold.ring && prevHold.ring.el) safeRemove(prevHold.ring.el);
          holdState = null;
        }
        if (doc && typeof doc.querySelectorAll === 'function') {
          try {
            var strayRings = doc.querySelectorAll('.ag-pp-hold-ring');
            for (var i = 0; i < strayRings.length; i += 1) safeRemove(strayRings[i]);
          } catch (e) {}
        }
        if (prevHold) {
          if (typeof hostBridge.setHoldTooltipSuppression === 'function') {
            hostBridge.setHoldTooltipSuppression(doc, false, prevHold.btn);
          }
          if (!willOpenImmediately && !overlayEl && typeof hostBridge.suppressNativeTooltip === 'function') {
            hostBridge.suppressNativeTooltip(doc, prevHold.btn, false);
          }
        }
      }

      function armSuppressNextClick(targetBtn) {
        suppressUntilMs = Date.now() + SUPPRESS_CLICK_WINDOW_MS;
        suppressTargetBtn = targetBtn || null;
        if (suppressTimer) {
          clearTimer(suppressTimer);
          suppressTimer = 0;
        }
      }

      function armSuppressTrailingNativeRelease(targetBtn) {
        suppressTrailingBtn = targetBtn || null;
        suppressTrailingUntilMs = Date.now() + 260;
      }

      function isTargetWithinNode(node, target) {
        if (!node || !target) return false;
        if (node === target) return true;
        if (typeof node.contains === 'function') {
          try { return Boolean(node.contains(target)); } catch (e) {}
        }
        return false;
      }

      function isNativeHostMenuOpen(docRef, triggerBtn) {
        try {
          if (triggerBtn && typeof triggerBtn.getAttribute === 'function') {
            if (triggerBtn.getAttribute('aria-expanded') === 'true') return true;
            if (triggerBtn.getAttribute('data-state') === 'open') return true;
            var popOpen = triggerBtn.getAttribute('data-popup-open');
            if (popOpen !== null && popOpen !== 'false') return true;
          }
          if (docRef && typeof docRef.querySelectorAll === 'function') {
            var menus = docRef.querySelectorAll(
              '[data-testid="model-selector-panel"], [role="menu"], [data-radix-popper-content-wrapper], [data-radix-menu-content]'
            );
            for (var i = 0; i < menus.length; i += 1) {
              var m = menus[i];
              if (!m) continue;
              if (overlayEl && isTargetWithinNode(overlayEl, m)) continue;
              if (typeof m.getAttribute === 'function') {
                if (m.getAttribute('data-state') === 'closed') continue;
                if (m.getAttribute('aria-hidden') === 'true') continue;
                if (m.hasAttribute && m.hasAttribute('hidden')) continue;
              }
              if (typeof m.getBoundingClientRect === 'function') {
                var mr = m.getBoundingClientRect();
                var hasText = Boolean(m.textContent && String(m.textContent).trim());
                if (mr && mr.width === 0 && mr.height === 0 && !hasText) continue;
              }
              return true;
            }
          }
        } catch (e) {}
        return false;
      }

      function createSyntheticTriggerEvent(kind, type, init) {
        var win = (doc && doc.defaultView) || root || null;
        var Ctor = null;
        if (kind === 'pointer') {
          Ctor = win && typeof win.PointerEvent === 'function' ? win.PointerEvent : null;
        }
        if (!Ctor) {
          Ctor = win && typeof win.MouseEvent === 'function' ? win.MouseEvent : null;
        }
        if (Ctor) {
          try {
            return new Ctor(type, init);
          } catch (e) {}
        }
        var evObj = Object.assign(
          {
            type: type,
            bubbles: true,
            cancelable: true,
            defaultPrevented: false,
            propagationStopped: false,
            immediatePropagationStopped: false,
            preventDefault: function () { this.defaultPrevented = true; },
            stopPropagation: function () { this.propagationStopped = true; },
            stopImmediatePropagation: function () {
              this.immediatePropagationStopped = true;
              this.propagationStopped = true;
            },
          },
          init
        );
        return evObj;
      }

      function replayNativeTriggerClick(triggerBtn, meta) {
        if (!triggerBtn || typeof triggerBtn.dispatchEvent !== 'function' || isDestroyed) return false;
        if (isHostModelTriggerLocked(triggerBtn)) return false;
        var m = meta || {};
        var cx = Number(m.clientX) || 0;
        var cy = Number(m.clientY) || 0;
        var pid = m.pointerId !== undefined ? m.pointerId : 1;
        var ptype = typeof m.pointerType === 'string' && m.pointerType ? m.pointerType : 'mouse';

        /* Temporarily clear suppression windows so replayed native events always pass cleanly */
        suppressUntilMs = 0;
        suppressTargetBtn = null;
        suppressTrailingUntilMs = 0;
        suppressTrailingBtn = null;
        if (suppressTimer) {
          clearTimer(suppressTimer);
          suppressTimer = 0;
        }

        var dispatched = false;
        isReplayingNativeTrigger = true;
        try {
          var seq = [
            ['pointer', 'pointerdown', { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: pid, pointerType: ptype, clientX: cx, clientY: cy, isPrimary: true }],
            ['mouse', 'mousedown', { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: cx, clientY: cy }],
            ['pointer', 'pointerup', { bubbles: true, cancelable: true, button: 0, buttons: 0, pointerId: pid, pointerType: ptype, clientX: cx, clientY: cy, isPrimary: true }],
            ['mouse', 'mouseup', { bubbles: true, cancelable: true, button: 0, buttons: 0, clientX: cx, clientY: cy }],
            ['mouse', 'click', { bubbles: true, cancelable: true, button: 0, buttons: 0, clientX: cx, clientY: cy }],
          ];
          for (var i = 0; i < seq.length; i += 1) {
            var evSynth = createSyntheticTriggerEvent(seq[i][0], seq[i][1], seq[i][2]);
            try {
              triggerBtn.dispatchEvent(evSynth);
              dispatched = true;
            } catch (eDisp) {}
          }
        } finally {
          isReplayingNativeTrigger = false;
        }

        /* Swallow the physical browser's trailing mouseup/click on triggerBtn so Radix menu does not immediately close */
        armSuppressTrailingNativeRelease(triggerBtn);

        if (!m.wasNativeMenuOpen && typeof Promise === 'function') {
          Promise.resolve().then(function () {
            if (isDestroyed || overlayEl || !isNodeConnectedToDoc(doc, triggerBtn)) return;
            if (isNativeHostMenuOpen(doc, triggerBtn)) return;
            var ctxFallback = hostBridge.readHostModelContext(triggerBtn, root, doc);
            if (ctxFallback && typeof ctxFallback.setIsOpen === 'function') {
              try { ctxFallback.setIsOpen(true); } catch (eOpen) {}
            }
          });
        }
        return dispatched;
      }

      /* ── Aux 2x3 Pagination Helpers ────────────────────────────────────── */

      function getLocalAuxIndex(globalIdx) {
        if (globalIdx === null || globalIdx === undefined || globalIdx < 0) return null;
        var start = activeAuxPage * AUX_PAGE_SIZE;
        if (globalIdx >= start && globalIdx < start + AUX_PAGE_SIZE) {
          return globalIdx - start;
        }
        return null;
      }

      function resolveGlobalAuxIndexFromLocal(localIdx) {
        if (localIdx === null || localIdx === undefined || localIdx < 0 || localIdx >= auxSlots.length) return null;
        var slot = auxSlots[localIdx];
        if (!slot) return null;
        if (typeof slot._globalAuxIndex === 'number' && slot._globalAuxIndex >= 0) return slot._globalAuxIndex;
        var candidate = activeAuxPage * AUX_PAGE_SIZE + localIdx;
        return candidate < effectiveAuxAll.length ? candidate : null;
      }

      function rebuildAuxPageSlice() {
        var totalPages =
          typeof catalog.getAuxPageCount === 'function'
            ? Math.max(1, catalog.getAuxPageCount(effectiveAuxAll))
            : Math.max(1, Math.ceil(effectiveAuxAll.length / AUX_PAGE_SIZE));
        auxPageCount = totalPages;
        if (activeAuxPage < 0) activeAuxPage = 0;
        if (activeAuxPage >= auxPageCount) activeAuxPage = auxPageCount - 1;

        var start = activeAuxPage * AUX_PAGE_SIZE;
        var rawSlice =
          typeof catalog.getAuxPageSlice === 'function'
            ? catalog.getAuxPageSlice(effectiveAuxAll, activeAuxPage)
            : effectiveAuxAll.slice(start, start + AUX_PAGE_SIZE);
        var padded =
          typeof catalog.padAuxPageSlots === 'function' ? catalog.padAuxPageSlots(rawSlice) : rawSlice.slice(0, AUX_PAGE_SIZE);

        auxSlots = [];
        for (var i = 0; i < AUX_PAGE_SIZE; i += 1) {
          var item = padded[i];
          var isReal = i < rawSlice.length && item && item.id && String(item.id).indexOf('blind-') !== 0;
          var globalIdx = isReal ? start + i : -1;
          auxSlots.push(
            Object.assign({}, item, {
              slotIndex: i,
              auxIndex: i,
              _globalAuxIndex: globalIdx,
            })
          );
        }
      }

      function isGlobalOrchToggleSlot(globalIdx, slot) {
        return Boolean(
          globalIdx === 0 &&
            slot &&
            slot.id === 'orchestrator' &&
            (!orchRegistry || orchRegistry.latchCapable)
        );
      }

      /* ── Orchestrator Registry & Availability Resolution ───────────────── */

      function buildOrchestratorRegistry(hostCtx) {
        var allowedZSet = new Set();
        var allowedAuxIdSet = new Set();
        var plannerByZ = new Map();
        var plannerByAuxId = new Map();
        var hasExplicitWhitelist = Boolean(
          hostCtx && Array.isArray(hostCtx.orchestratorPlanners) && hostCtx.orchestratorPlanners.length > 0
        );
        var latchCapable = Boolean(
          !hostCtx ||
            Array.isArray(hostCtx.orchestratorPlanners) ||
            (hostCtx.orchestratorPick && typeof hostCtx.orchestratorPick === 'object') ||
            hostCtx.orchestratorPlannerIndex instanceof Map ||
            hostCtx.orchestratorDefaultPlanner
        );

        function recordPlannerOpt(rawOpt, forcedEffKey) {
          if (!rawOpt) return;
          var optObj = typeof rawOpt === 'string' ? { label: rawOpt, value: rawOpt } : rawOpt;
          if (!optObj || typeof optObj.label !== 'string' || !optObj.label.trim()) return;
          var parsedEl = catalog.parseElementModelLabel(optObj);
          if (parsedEl) {
            allowedZSet.add(parsedEl.slotZ);
            var effEl = forcedEffKey ? catalog.normalizeEnEffortWord(forcedEffKey) : parsedEl.effort || 'high';
            if (!EFFORT_LABELS[effEl]) effEl = 'high';
            var zMap = plannerByZ.get(parsedEl.slotZ);
            if (!zMap) {
              zMap = new Map();
              plannerByZ.set(parsedEl.slotZ, zMap);
            }
            if (!zMap.has(effEl)) zMap.set(effEl, optObj);
            return;
          }
          var clsAux = catalog.classifyNonElementOption(optObj, forcedEffKey);
          if (clsAux && clsAux.groupKey && clsAux.groupKey !== 'orchestrator') {
            allowedAuxIdSet.add(clsAux.groupKey);
            var effAux = clsAux.variantEffort || 'high';
            var aMap = plannerByAuxId.get(clsAux.groupKey);
            if (!aMap) {
              aMap = new Map();
              plannerByAuxId.set(clsAux.groupKey, aMap);
            }
            if (!aMap.has(effAux)) aMap.set(effAux, optObj);
          }
        }

        if (hasExplicitWhitelist) {
          for (var i = 0; i < hostCtx.orchestratorPlanners.length; i += 1) {
            recordPlannerOpt(hostCtx.orchestratorPlanners[i], '');
          }
        }
        if (hostCtx && hostCtx.orchestratorPlannerIndex instanceof Map) {
          hostCtx.orchestratorPlannerIndex.forEach(function (innerMap) {
            if (!(innerMap instanceof Map)) return;
            innerMap.forEach(function (opt, effKey) {
              recordPlannerOpt(opt, String(effKey || ''));
            });
          });
        }
        if (allowedZSet.size === 0 && allowedAuxIdSet.size === 0) {
          allowedZSet.add(10);
          allowedZSet.add(6);
          allowedZSet.add(18);
          allowedAuxIdSet.add('claude-opus');
        }
        return {
          latchCapable: latchCapable,
          allowedZSet: allowedZSet,
          allowedAuxIdSet: allowedAuxIdSet,
          plannerByZ: plannerByZ,
          plannerByAuxId: plannerByAuxId,
        };
      }

      function mergeOrderedLevelsWithPlannerMap(baseLevels, plannerMap) {
        var byEff = new Map();
        if (Array.isArray(baseLevels)) {
          for (var i = 0; i < baseLevels.length; i += 1) {
            var bl = baseLevels[i];
            if (bl && bl.effort) {
              byEff.set(bl.effort, {
                effort: bl.effort,
                label: bl.label,
                option: bl.option,
                modelOption: bl.modelOption || bl.option,
              });
            }
          }
        }
        if (plannerMap instanceof Map) {
          plannerMap.forEach(function (pOpt, effCode) {
            if (!byEff.has(effCode)) {
              byEff.set(effCode, {
                effort: effCode,
                label: EFFORT_LABELS[effCode] || effCode,
                option: pOpt,
                modelOption: pOpt,
              });
            }
          });
        }
        var out = [];
        for (var k = 0; k < EFFORT_ORDER.length; k += 1) {
          if (byEff.has(EFFORT_ORDER[k])) out.push(byEff.get(EFFORT_ORDER[k]));
        }
        byEff.forEach(function (lv, ek2) {
          if (EFFORT_ORDER.indexOf(ek2) === -1) out.push(lv);
        });
        if (out.length >= 2) {
          for (var m = 0; m < out.length; m += 1) {
            if (EFFORT_LABELS[out[m].effort]) out[m].label = EFFORT_LABELS[out[m].effort];
          }
        }
        return out;
      }

      function syncHitButtonsAvailabilityDom() {
        keyNodesByZ.forEach(function (btn, z) {
          var isAvailNow = availableByZ.has(z);
          btn.className = 'ag-pp-hit-btn ag-pp-key ' + (isAvailNow ? 'ag-pp-key-avail' : 'ag-pp-key-blind');
          if (z === selectedZ) btn.classList.add('is-levitated');
          btn.setAttribute('data-available', isAvailNow ? '1' : '0');
          if (isAvailNow) {
            btn.removeAttribute('tabindex');
            btn.removeAttribute('aria-disabled');
            btn.setAttribute('aria-pressed', z === selectedZ ? 'true' : 'false');
          } else {
            btn.setAttribute('tabindex', '-1');
            btn.setAttribute('aria-disabled', 'true');
            btn.removeAttribute('aria-pressed');
          }
        });
        var localSelAux = getLocalAuxIndex(selectedGlobalAuxIndex);
        for (var ai = 0; ai < auxKeyNodes.length; ai += 1) {
          var auxBtn = auxKeyNodes[ai];
          var aSlot = auxSlots[ai];
          if (!auxBtn || !aSlot) continue;
          var isAuxAvailNow = Boolean(aSlot.available);
          var isOrchBtn = isGlobalOrchToggleSlot(aSlot._globalAuxIndex, aSlot);
          auxBtn.className = 'ag-pp-hit-btn ag-pp-aux-key ' + (isAuxAvailNow ? 'ag-pp-key-avail' : 'ag-pp-key-blind');
          if (!isOrchBtn && localSelAux === ai) auxBtn.classList.add('is-levitated');
          auxBtn.setAttribute('data-aux-id', aSlot.id);
          auxBtn.setAttribute('data-available', isAuxAvailNow ? '1' : '0');
          auxBtn.setAttribute(
            'aria-label',
            isAuxAvailNow
              ? aSlot.title + ' (' + aSlot.badgeCode + ' ' + aSlot.shortLabel + ')'
              : aSlot.badgeCode + ' (Reserved Macro Key)'
          );
          if (isOrchBtn) {
            auxBtn.setAttribute('data-latched', orchLatched ? '1' : '0');
            auxBtn.setAttribute('aria-pressed', orchLatched ? 'true' : 'false');
          } else {
            auxBtn.removeAttribute('data-latched');
            if (isAuxAvailNow) auxBtn.setAttribute('aria-pressed', localSelAux === ai ? 'true' : 'false');
            else auxBtn.removeAttribute('aria-pressed');
          }
          if (isAuxAvailNow) {
            auxBtn.removeAttribute('tabindex');
            auxBtn.removeAttribute('aria-disabled');
          } else {
            auxBtn.setAttribute('tabindex', '-1');
            auxBtn.setAttribute('aria-disabled', 'true');
          }
        }
      }

      function recomputeEffectiveAvailability() {
        var reg = orchRegistry || buildOrchestratorRegistry(activeHostCtx);
        if (!orchLatched) {
          availableEntries = fullAvailableEntries.slice();
          availableByZ = new Map(fullAvailableByZ);
          effectiveAuxAll = [];
          for (var i = 0; i < fullAuxSlots.length; i += 1) {
            var src = fullAuxSlots[i];
            effectiveAuxAll.push(
              Object.assign({}, src, {
                available: Boolean(src.available),
                levels: Array.isArray(src.levels) ? src.levels.slice() : [],
              })
            );
          }
        } else {
          availableEntries = [];
          availableByZ = new Map();
          for (var e = 0; e < fullAvailableEntries.length; e += 1) {
            var elEntry = fullAvailableEntries[e];
            if (!reg.allowedZSet.has(elEntry.slotZ)) continue;
            var clonedEntry = Object.assign({}, elEntry, {
              levels: mergeOrderedLevelsWithPlannerMap(elEntry.levels, reg.plannerByZ.get(elEntry.slotZ)),
            });
            availableEntries.push(clonedEntry);
            availableByZ.set(elEntry.slotZ, clonedEntry);
          }
          effectiveAuxAll = [];
          for (var k = 0; k < fullAuxSlots.length; k += 1) {
            var aSrc = fullAuxSlots[k];
            if (k === 0 && aSrc.id === 'orchestrator') {
              effectiveAuxAll.push(Object.assign({}, aSrc, { available: Boolean(aSrc.available), levels: [] }));
            } else {
              var allowedInOrch = Boolean(aSrc.available && reg.allowedAuxIdSet.has(aSrc.id));
              effectiveAuxAll.push(
                Object.assign({}, aSrc, {
                  available: allowedInOrch,
                  levels: allowedInOrch
                    ? mergeOrderedLevelsWithPlannerMap(aSrc.levels, reg.plannerByAuxId.get(aSrc.id))
                    : Array.isArray(aSrc.levels)
                    ? aSrc.levels.slice()
                    : [],
                })
              );
            }
          }
        }
        rebuildAuxPageSlice();
        availabilityDomVersion += 1;
        lastDomSelectedZ = undefined;
        lastDomSelectedAuxLocal = undefined;
        lastDomHudSig = '';
        syncHitButtonsAvailabilityDom();
      }

      function resolvePlannerCandidateRef(candidate) {
        if (!candidate) return null;
        var optObj = typeof candidate === 'string' ? { label: candidate, value: candidate } : candidate;
        var parsedEl = catalog.parseElementModelLabel(optObj);
        if (parsedEl && availableByZ.has(parsedEl.slotZ)) {
          return { kind: 'element', z: parsedEl.slotZ, effort: parsedEl.effort || '' };
        }
        var clsAux = catalog.classifyNonElementOption(optObj, '');
        if (clsAux && clsAux.groupKey && clsAux.groupKey !== 'orchestrator') {
          for (var k = 1; k < effectiveAuxAll.length; k += 1) {
            if (effectiveAuxAll[k] && effectiveAuxAll[k].available && effectiveAuxAll[k].id === clsAux.groupKey) {
              return { kind: 'aux', globalAuxIndex: k, effort: clsAux.variantEffort || '' };
            }
          }
        }
        var rawText = typeof optObj.label === 'string' ? optObj.label : String(candidate || '');
        var parenM = /\(([^)]+)\)/.exec(rawText);
        if (parenM) {
          var innerHint = parenM[1].trim();
          var innerEl = catalog.parseElementModelLabel('Gemini 4 ' + innerHint);
          if (innerEl && availableByZ.has(innerEl.slotZ)) {
            return { kind: 'element', z: innerEl.slotZ, effort: innerEl.effort || '' };
          }
          if (/opus/i.test(innerHint)) {
            for (var op = 1; op < effectiveAuxAll.length; op += 1) {
              if (effectiveAuxAll[op] && effectiveAuxAll[op].available && effectiveAuxAll[op].id === 'claude-opus') {
                return { kind: 'aux', globalAuxIndex: op, effort: '' };
              }
            }
          }
        }
        return null;
      }

      function ensureValidPlannerSelectedForOrch(preferredHint) {
        if (selectedZ !== null && availableByZ.has(selectedZ)) return;
        if (
          selectedGlobalAuxIndex !== null &&
          selectedGlobalAuxIndex > 0 &&
          effectiveAuxAll[selectedGlobalAuxIndex] &&
          effectiveAuxAll[selectedGlobalAuxIndex].available
        ) {
          return;
        }
        var hints = [
          preferredHint,
          activeHostCtx && activeHostCtx.orchestratorPick && activeHostCtx.orchestratorPick.model,
          activeHostCtx && activeHostCtx.orchestratorDefaultPlanner,
        ];
        for (var h = 0; h < hints.length; h += 1) {
          var ref = resolvePlannerCandidateRef(hints[h]);
          if (ref) {
            if (ref.kind === 'element') {
              selectedZ = ref.z;
              selectedGlobalAuxIndex = null;
              if (ref.effort) activeEffortByZ.set(ref.z, ref.effort);
              return;
            }
            if (ref.kind === 'aux') {
              selectedZ = null;
              selectedGlobalAuxIndex = ref.globalAuxIndex;
              if (ref.effort) activeEffortByGlobalAux.set(ref.globalAuxIndex, ref.effort);
              return;
            }
          }
        }
        var priorityZs = [10, 6, 18];
        for (var pz = 0; pz < priorityZs.length; pz += 1) {
          if (availableByZ.has(priorityZs[pz])) {
            selectedZ = priorityZs[pz];
            selectedGlobalAuxIndex = null;
            return;
          }
        }
        if (availableEntries.length > 0) {
          selectedZ = availableEntries[0].slotZ;
          selectedGlobalAuxIndex = null;
          return;
        }
        for (var ak = 1; ak < effectiveAuxAll.length; ak += 1) {
          if (effectiveAuxAll[ak] && effectiveAuxAll[ak].available) {
            selectedZ = null;
            selectedGlobalAuxIndex = ak;
            return;
          }
        }
      }

      function normalizeEffortCode(raw) {
        if (typeof hostBridge.normalizeEffortToken === 'function') {
          return hostBridge.normalizeEffortToken(raw);
        }
        var w = String(raw || '').trim().toLowerCase();
        if (w === 'extra' || w === 'extrahigh' || w === 'extra high') return 'xhigh';
        if (w === 'med') return 'medium';
        return w;
      }

      function resolveLevelForElementWithMemory(entry, explicitPreferred) {
        if (!entry || !entry.levels || !entry.levels.length) return null;
        var rememberedLocal = activeEffortByZ.get(entry.slotZ) || '';
        var rememberedShared =
          typeof hostBridge.getRememberedEffort === 'function'
            ? hostBridge.getRememberedEffort(root, doc, entry.baseName || entry.name, orchLatched)
            : '';
        return hostBridge.resolveLevelForElement(entry, explicitPreferred || '', rememberedLocal, rememberedShared);
      }

      function resolveLevelForAuxWithMemory(auxSlot, globalAuxIdx, explicitPreferred) {
        if (!auxSlot || !auxSlot.levels || !auxSlot.levels.length) return null;
        var rememberedLocal = activeEffortByGlobalAux.get(globalAuxIdx) || '';
        var rememberedShared =
          typeof hostBridge.getRememberedEffort === 'function'
            ? hostBridge.getRememberedEffort(root, doc, auxSlot.title || auxSlot.shortLabel, orchLatched)
            : '';
        return hostBridge.resolveLevelForAuxSlot(auxSlot, explicitPreferred || '', rememberedLocal, rememberedShared);
      }

      /* ── Session Context Signature & Live Host Sync ────────────────────── */

      function computeSessionContextSignature(hostCtxObj, triggerBtn) {
        var convId =
          (hostCtxObj && (hostCtxObj.conversationId || hostCtxObj.cascadeId || hostCtxObj.threadId)) || '';
        var selOpt = hostCtxObj && hostCtxObj.selectedModel ? hostCtxObj.selectedModel : null;
        var activeModelKey = '';
        var activeEffort = '';
        var orchPlanner = '';

        if (selOpt) {
          var elP = catalog.parseElementModelLabel(selOpt);
          if (elP) {
            activeModelKey = 'el:' + elP.slotZ;
            activeEffort = elP.effort || '';
          } else {
            var cls = catalog.classifyNonElementOption(selOpt, '');
            if (cls && cls.groupKey === 'orchestrator') {
              activeModelKey = 'orch';
              var pickModel =
                (hostCtxObj && hostCtxObj.orchestratorPick && hostCtxObj.orchestratorPick.model) ||
                (hostCtxObj && hostCtxObj.orchestratorDefaultPlanner) ||
                null;
              if (pickModel) {
                var pEl = catalog.parseElementModelLabel(pickModel);
                if (pEl) {
                  orchPlanner = 'el:' + pEl.slotZ;
                  activeEffort = pEl.effort || '';
                } else {
                  var pCls = catalog.classifyNonElementOption(pickModel, '');
                  orchPlanner = pCls ? 'aux:' + pCls.groupKey : String(pickModel.modelId || pickModel.label || '');
                  activeEffort = (pCls && pCls.variantEffort) || '';
                }
              } else {
                orchPlanner = String(selOpt.label || '');
              }
            } else if (cls) {
              activeModelKey = 'aux:' + cls.groupKey;
              activeEffort = cls.variantEffort || '';
            } else {
              activeModelKey = String(selOpt.modelId || selOpt.value || selOpt.label || '');
            }
          }
        } else if (triggerBtn) {
          activeModelKey = 'btn:' + hostBridge.readCleanButtonLabel(triggerBtn, false);
        }

        var modelSig = activeModelKey + '|' + activeEffort + '|' + orchPlanner;
        return {
          convId: String(convId),
          activeModelKey: activeModelKey,
          activeEffort: activeEffort,
          orchPlanner: orchPlanner,
          modelSig: modelSig,
          fullSig: String(convId) + '|' + modelSig,
        };
      }

      function syncHostWithActiveState() {
        var syncRes = hostBridge.syncHostWithActiveState({
          doc: doc,
          root: root,
          activeHostCtx: activeHostCtx,
          orchLatched: orchLatched,
          selectedZ: selectedZ,
          selectedAuxIndex: selectedGlobalAuxIndex,
          availableByZ: availableByZ,
          auxSlots: effectiveAuxAll,
          fullAuxSlots: fullAuxSlots,
          activeEffortByZ: activeEffortByZ,
          activeEffortByAux: activeEffortByGlobalAux,
          orchRegistry: orchRegistry,
          slotByZ: SLOT_BY_Z,
          activeCommittedElementZ: activeCommittedElementZ,
          activeCommittedAuxBadge: activeCommittedAuxBadge,
          anchorBtn: activeAnchorBtn,
          syncMiniKeycapBadges: syncMiniKeycapBadges,
          inferOrchCompactBadgeFromHost: inferOrchCompactBadgeFromHost,
        });
        if (syncRes) {
          activeCommittedElementZ = syncRes.activeCommittedElementZ;
          activeCommittedAuxBadge = syncRes.activeCommittedAuxBadge;
        }
        /* Keep session signature aligned with our own commit so local clicks never echo as external session switches */
        lastSessionSig = computeSessionContextSignature(activeHostCtx, activeAnchorBtn);
      }

      /* ── Deck & Bento Payload Builder ──────────────────────────────────── */

      function resolveInspectedElementZ() {
        if (hoveredZ !== null && availableByZ.has(hoveredZ)) return hoveredZ;
        if (inspectedBlindZ !== null) return inspectedBlindZ;
        if (blindFlashZ !== null && !availableByZ.has(blindFlashZ)) return blindFlashZ;
        if (selectedZ !== null) return selectedZ;
        if (availableEntries.length > 0) return availableEntries[0].slotZ;
        return 6;
      }

      function resolveCommittedCompareBaseline(zh) {
        if (
          selectedGlobalAuxIndex !== null &&
          effectiveAuxAll[selectedGlobalAuxIndex] &&
          effectiveAuxAll[selectedGlobalAuxIndex].available
        ) {
          var sAux = effectiveAuxAll[selectedGlobalAuxIndex];
          if (isGlobalOrchToggleSlot(selectedGlobalAuxIndex, sAux)) return null;
          var sAuxLvl = resolveLevelForAuxWithMemory(sAux, selectedGlobalAuxIndex, '');
          var sAuxEff = sAuxLvl ? sAuxLvl.effort : 'high';
          var auxBench = catalog.resolveBenchmarkMetrics(sAux.id, sAuxEff, zh, true);
          if (!auxBench || !auxBench.isKnownBenchmark) return null;
          return {
            kind: 'aux',
            key: selectedGlobalAuxIndex,
            shortTag: sAux.shortLabel || sAux.badgeCode || 'Aux',
            bench: auxBench,
          };
        }
        if (selectedZ !== null && availableByZ.has(selectedZ)) {
          var sEntry = availableByZ.get(selectedZ);
          var sSlot = SLOT_BY_Z.get(selectedZ);
          var sEff = activeEffortByZ.get(selectedZ) || '';
          if (!sEff) {
            var sDef = resolveLevelForElementWithMemory(sEntry, '');
            sEff = sDef ? sDef.effort : 'high';
          }
          var elBench = catalog.resolveBenchmarkMetrics(selectedZ, sEff, zh, true);
          if (!elBench || !elBench.isKnownBenchmark) return null;
          return {
            kind: 'element',
            key: selectedZ,
            shortTag: sSlot ? sSlot.numLabel + sSlot.symbol : String(selectedZ),
            bench: elBench,
          };
        }
        return null;
      }

      function resolveCommittedTelemetrySpec(zh) {
        if (
          selectedGlobalAuxIndex !== null &&
          effectiveAuxAll[selectedGlobalAuxIndex] &&
          effectiveAuxAll[selectedGlobalAuxIndex].available
        ) {
          var sAux = effectiveAuxAll[selectedGlobalAuxIndex];
          var isOrchAux = Boolean(orchLatched && selectedGlobalAuxIndex > 0);
          var sAuxLvl = resolveLevelForAuxWithMemory(sAux, selectedGlobalAuxIndex, '');
          var sAuxEff = sAuxLvl ? sAuxLvl.effort : 'high';
          var sAuxEffLabel = EFFORT_LABELS[sAuxEff] || 'High';
          return {
            accentHex: isOrchAux ? '#8B5CF6' : sAux.accentHex || '#3B82F6',
            secondaryHex: isOrchAux ? '#F5B942' : sAux.secondaryHex || sAux.accentHex || '#67E8F9',
            accentHexLight: isOrchAux ? '#6D28D9' : sAux.accentHexLight || sAux.accentHex || '#1D4ED8',
            secondaryHexLight: isOrchAux ? '#B45309' : sAux.secondaryHexLight || sAux.secondaryHex || sAux.accentHexLight || '#0284C7',
            glowRgba: isOrchAux ? 'rgba(139, 92, 246, 0.30)' : sAux.glowRgba || 'rgba(59, 130, 246, 0.26)',
            compactPillLabel: isOrchAux
              ? 'ORCH · ' + (sAux.shortLabel || 'Aux') + ' + 1H'
              : (sAux.shortLabel || 'Aux') + ' · ' + sAuxEffLabel,
            switchSpec: formatSwitchSpecText(
              sAuxEff,
              (sAux.shortLabel || 'Aux') + ' Switch',
              true,
              !sAux.levels || sAux.levels.length <= 1
            ),
            litDots: resolveEffortLitDots(sAuxEff, true),
            telemetrySeed: 20 + selectedGlobalAuxIndex * 3,
          };
        }
        var cz = selectedZ !== null && availableByZ.has(selectedZ) ? selectedZ : 6;
        var cEntry = availableByZ.get(cz) || null;
        var cProf = ELEMENT_SPEC_PROFILES[cz] || ELEMENT_SPEC_PROFILES[6] || ELEMENT_SPEC_PROFILES.fallback;
        var cEff = activeEffortByZ.get(cz) || '';
        if (!cEff && cEntry) {
          var cDef = resolveLevelForElementWithMemory(cEntry, '');
          cEff = cDef ? cDef.effort : 'high';
        }
        var isOrchMain = Boolean(orchLatched);
        var cSlotMeta = SLOT_BY_Z.get(cz) || ELEMENTS_90[5];
        var cTag = cSlotMeta ? String(cz) + cSlotMeta.symbol : '6C';
        var cEffLabel = EFFORT_LABELS[cEff || 'high'] || 'High';
        return {
          accentHex: isOrchMain ? '#8B5CF6' : cProf.accentHex,
          secondaryHex: isOrchMain ? '#F5B942' : cProf.secondaryHex || cProf.accentHex,
          accentHexLight: isOrchMain ? '#6D28D9' : cProf.accentHexLight || cProf.accentHex,
          secondaryHexLight: isOrchMain ? '#B45309' : cProf.secondaryHexLight || cProf.accentHexLight || cProf.accentHex,
          glowRgba: isOrchMain ? 'rgba(139, 92, 246, 0.28)' : cProf.glowRgba,
          compactPillLabel: isOrchMain ? 'ORCH · ' + cTag + ' + 1H' : cTag + ' · ' + cEffLabel,
          switchSpec: formatSwitchSpecText(
            cEff || 'high',
            zh ? cProf.switchSpecZh : cProf.switchSpecEn,
            Boolean(cEntry),
            cEntry && cEntry.levels ? cEntry.levels.length <= 1 : false
          ),
          litDots: resolveEffortLitDots(cEff || 'high', Boolean(cEntry)),
          telemetrySeed: cz,
        };
      }

      function resolveActivePlannerTopologyLabel() {
        if (selectedGlobalAuxIndex !== null && selectedGlobalAuxIndex > 0 && effectiveAuxAll[selectedGlobalAuxIndex]) {
          var aSlot = effectiveAuxAll[selectedGlobalAuxIndex];
          var aEff = activeEffortByGlobalAux.get(selectedGlobalAuxIndex) || 'high';
          return (aSlot.shortLabel || 'Opus') + ' ' + resolveEffortShortBadge(aEff);
        }
        var pz = selectedZ !== null ? selectedZ : 6;
        var pSlot = SLOT_BY_Z.get(pz);
        var pEff = activeEffortByZ.get(pz) || 'high';
        return (pSlot ? pSlot.numLabel + pSlot.symbol : '6C') + ' ' + resolveEffortShortBadge(pEff);
      }

      function resolveCurrentLang() {
        if (typeof bentoUi.resolveLocale === 'function') return bentoUi.resolveLocale(doc, root);
        return bentoUi.isZhLocale(doc, root) ? 'zh-CN' : 'en';
      }

      function buildCurrentDeckPayload(langOrZh) {
        var langCode = typeof langOrZh === 'string' ? langOrZh : (langOrZh ? 'zh-CN' : 'en');
        var zh = langCode === 'zh-CN' || langCode === 'zh-TW';
        var pk = getPpI18nPack(langCode);
        var currentSessionOpt = activeHostCtx && activeHostCtx.selectedModel;
        var currentParsed = catalog.parseElementModelLabel(currentSessionOpt);
        var sessionBanner = null;
        if (selectedZ === null && !orchLatched && currentSessionOpt && currentSessionOpt.label && !currentParsed) {
          var rawName = String(currentSessionOpt.label);
          sessionBanner = pk.sessPre + rawName + pk.sessSuf;
        }

        var runnerBench1H = orchLatched ? catalog.resolveBenchmarkMetrics(1, 'high', zh, true) : null;
        var activePlannerTopo = resolveActivePlannerTopologyLabel();

        var blindFlashSlot = blindFlashZ !== null ? SLOT_BY_Z.get(blindFlashZ) || null : null;
        var blindFlashBannerText = blindFlashSlot
          ? blindFlashSlot.numLabel + ' ' + blindFlashSlot.symbol + ' · ' + blindFlashSlot.name + ' · ' + blindFlashSlot.mass + ' · STANDBY'
          : '';

        /* Priority: 1) Hovered Aux -> 2) Hovered Element -> 3) Inspected Blind -> 4) Selected Aux -> 5) Selected/Default Element */
        var inspectAuxSlot = null;
        var inspectGlobalAuxIdx = null;
        var isHoverPreview = false;
        var hoveredGlobalAux = resolveGlobalAuxIndexFromLocal(hoveredAuxIndex);
        var effectiveHoverAuxLocal =
          hoveredAuxIndex !== null && isGlobalOrchToggleSlot(hoveredGlobalAux, auxSlots[hoveredAuxIndex]) && orchLatched
            ? null
            : hoveredAuxIndex;

        if (effectiveHoverAuxLocal !== null && auxSlots[effectiveHoverAuxLocal]) {
          inspectAuxSlot = auxSlots[effectiveHoverAuxLocal];
          inspectGlobalAuxIdx = inspectAuxSlot._globalAuxIndex;
          isHoverPreview = inspectGlobalAuxIdx !== selectedGlobalAuxIndex;
        } else if (hoveredZ !== null && availableByZ.has(hoveredZ)) {
          inspectAuxSlot = null;
          isHoverPreview = hoveredZ !== selectedZ;
        } else if (inspectedBlindZ !== null) {
          inspectAuxSlot = null;
          isHoverPreview = true;
        } else if (inspectedBlindAuxIndex !== null && auxSlots[inspectedBlindAuxIndex]) {
          inspectAuxSlot = auxSlots[inspectedBlindAuxIndex];
          inspectGlobalAuxIdx = inspectAuxSlot._globalAuxIndex;
          isHoverPreview = true;
        } else if (blindFlashZ !== null && !availableByZ.has(blindFlashZ)) {
          inspectAuxSlot = null;
          isHoverPreview = false;
        } else if (selectedGlobalAuxIndex !== null && effectiveAuxAll[selectedGlobalAuxIndex]) {
          inspectAuxSlot = effectiveAuxAll[selectedGlobalAuxIndex];
          inspectGlobalAuxIdx = selectedGlobalAuxIndex;
          isHoverPreview = false;
        }

        var baseline = !orchLatched && isHoverPreview ? resolveCommittedCompareBaseline(zh) : null;

        if (inspectAuxSlot) {
          var fullOrigAux =
            inspectGlobalAuxIdx !== null && inspectGlobalAuxIdx >= 0 ? fullAuxSlots[inspectGlobalAuxIdx] : inspectAuxSlot;
          var isNonPlannerAuxLocked = Boolean(
            orchLatched &&
              inspectGlobalAuxIdx !== null &&
              inspectGlobalAuxIdx > 0 &&
              fullOrigAux &&
              fullOrigAux.available &&
              !inspectAuxSlot.available
          );

          var activeAuxEff = '';
          if (inspectAuxSlot.available && inspectAuxSlot.levels && inspectAuxSlot.levels.length > 0) {
            var chosenAuxLvl = resolveLevelForAuxWithMemory(inspectAuxSlot, inspectGlobalAuxIdx, '');
            activeAuxEff = chosenAuxLvl ? chosenAuxLvl.effort : inspectAuxSlot.levels[0].effort;
          }
          var auxLevelsOut = [];
          if (inspectAuxSlot.available && Array.isArray(inspectAuxSlot.levels)) {
            for (var ai = 0; ai < inspectAuxSlot.levels.length; ai += 1) {
              var alv = inspectAuxSlot.levels[ai];
              auxLevelsOut.push({
                effort: alv.effort,
                label: alv.label,
                active: alv.effort === activeAuxEff,
                option: alv.option,
              });
            }
          }

          var isOrchTogglePreview = isGlobalOrchToggleSlot(inspectGlobalAuxIdx, inspectAuxSlot);
          var isOrchAuxPlanner = Boolean(orchLatched && !isOrchTogglePreview && inspectAuxSlot.available);
          var auxBenchKey = isOrchTogglePreview ? 6 : inspectAuxSlot.id;
          var auxBenchKnown = Boolean(inspectAuxSlot.available || isNonPlannerAuxLocked);
          var auxBench = catalog.resolveBenchmarkMetrics(auxBenchKey, activeAuxEff || 'high', zh, auxBenchKnown);
          var auxHasBench = Boolean(auxBench && auxBench.isKnownBenchmark);
          var useAuxCompare = Boolean(
            auxHasBench &&
              baseline &&
              inspectAuxSlot.available &&
              !isOrchTogglePreview &&
              !(baseline.kind === 'aux' && baseline.key === inspectGlobalAuxIdx)
          );
          var auxRowsWithDelta = auxHasBench
            ? (useAuxCompare ? attachCompareDeltas(auxBench.rows, baseline.bench) : auxBench.rows)
            : [];

          var auxDisplayTitle = isOrchAuxPlanner
            ? 'Orch · ' + inspectAuxSlot.title.replace(/^Claude\s+/i, '')
            : inspectAuxSlot.title;
          var auxOledBadge = isOrchAuxPlanner ? 'ORCH · ' + inspectAuxSlot.badgeCode : inspectAuxSlot.shortLabel;
          var auxCardBadge = isOrchAuxPlanner
            ? 'ORCH · ' + inspectAuxSlot.badgeCode + ' · DUAL-CORE'
            : inspectAuxSlot.badgeCode + ' · ' + inspectAuxSlot.roleTag;
          var auxStateText = isNonPlannerAuxLocked
            ? pk.nonPlanner
            : !inspectAuxSlot.available
            ? pk.reserved
            : isOrchTogglePreview
            ? pk.clickOrch
            : isHoverPreview
            ? pk.compare
            : pk.active;

          var auxSingle = auxLevelsOut.length <= 1;
          var auxMicroTags = zh ? inspectAuxSlot.scenesZh : inspectAuxSlot.scenesEn;
          var auxOptRef = inspectAuxSlot.defaultOption || null;
          for (var aoi = 0; aoi < auxLevelsOut.length; aoi += 1) {
            if (auxLevelsOut[aoi] && auxLevelsOut[aoi].active && auxLevelsOut[aoi].option) {
              auxOptRef = auxLevelsOut[aoi].option;
              break;
            }
          }
          var auxModelId = (auxOptRef && (auxOptRef.modelId || auxOptRef.value)) || inspectAuxSlot.id || '';

          return {
            inspectKind: 'aux',
            auxSlot: inspectAuxSlot,
            globalAuxIndex: inspectGlobalAuxIdx,
            slot: null,
            availEntry: null,
            bentoSpec: {
              kind: 'aux',
              auxIndex: inspectGlobalAuxIdx,
              z: null,
              modelId: auxModelId,
              isKnownBenchmark: auxHasBench,
              badge: auxCardBadge,
              stateText: auxStateText,
              title: auxDisplayTitle,
              shortTag: inspectAuxSlot.shortLabel || inspectAuxSlot.badgeCode,
              microTags: Array.isArray(auxMicroTags) ? auxMicroTags.slice(0, 3) : [],
              tagline: isNonPlannerAuxLocked
                ? pk.notInOrch
                : (zh ? inspectAuxSlot.taglineZh : inspectAuxSlot.taglineEn),
              scores: auxHasBench ? auxBench.ratios : null,
              benchRows: auxRowsWithDelta,
              compactText: auxBench ? auxBench.compactText : '',
              runnerRatios: auxHasBench && isOrchAuxPlanner && runnerBench1H && runnerBench1H.isKnownBenchmark ? runnerBench1H.ratios : null,
              compareRatios: useAuxCompare ? baseline.bench.ratios : null,
              compareTag: useAuxCompare ? baseline.shortTag : '',
              accentHex: isOrchAuxPlanner ? '#8B5CF6' : inspectAuxSlot.accentHex,
              secondaryHex: isOrchAuxPlanner ? '#F5B942' : inspectAuxSlot.secondaryHex || inspectAuxSlot.accentHex,
              accentHexLight: isOrchAuxPlanner ? '#6D28D9' : inspectAuxSlot.accentHexLight || inspectAuxSlot.accentHex,
              secondaryHexLight: isOrchAuxPlanner ? '#B45309' : inspectAuxSlot.secondaryHexLight || inspectAuxSlot.secondaryHex || inspectAuxSlot.accentHexLight,
              glowRgba: isOrchAuxPlanner ? 'rgba(139, 92, 246, 0.30)' : inspectAuxSlot.glowRgba,
              isAvailable: inspectAuxSlot.available,
              levels: auxLevelsOut,
              activeEffort: activeAuxEff,
              activeEffortLabel: EFFORT_LABELS[activeAuxEff] || activeAuxEff || pk.effDefault,
              tierNote: isNonPlannerAuxLocked
                ? pk.tierNonPlanner
                : isOrchTogglePreview
                ? pk.tierOrchSwitch
                : formatAntigravTierNote(activeAuxEff, inspectAuxSlot.available, auxSingle, langCode, isOrchAuxPlanner),
              switchSpec: formatSwitchSpecText(activeAuxEff, inspectAuxSlot.shortLabel + ' Switch', inspectAuxSlot.available, auxSingle),
              litDots: resolveEffortLitDots(activeAuxEff, inspectAuxSlot.available),
              plannerTopoLabel: activePlannerTopo,
              telemetrySeed: 20 + Math.max(0, Number(inspectGlobalAuxIdx) || 0) * 3,
            },
            deckInfo: {
              z: 0,
              lang: langCode,
              isAuxModel: true,
              auxId: inspectAuxSlot.oledAuxId || inspectAuxSlot.id,
              auxSlotId: inspectAuxSlot.id,
              auxIndex: inspectAuxSlot.slotIndex,
              globalAuxIndex: inspectGlobalAuxIdx,
              orchLatched: isOrchAuxPlanner,
              orchUnsupported: isNonPlannerAuxLocked,
              badgeText: auxOledBadge,
              badgeCode: inspectAuxSlot.badgeCode,
              roleTag: inspectAuxSlot.roleTag,
              numLabel: inspectAuxSlot.badgeCode,
              groupCode: 'AUX',
              symbol: inspectAuxSlot.shortLabel,
              elementEn: inspectAuxSlot.title,
              mass: '512K',
              title: auxDisplayTitle,
              chemLabel: inspectAuxSlot.badgeCode + ' · ' + inspectAuxSlot.title,
              subtitle: zh ? inspectAuxSlot.taglineZh : inspectAuxSlot.taglineEn,
              sessionBanner: sessionBanner,
              blindFlash: Boolean(blindFlashBannerText && !isHoverPreview),
              blindFlashBanner: !isHoverPreview ? blindFlashBannerText : '',
              isAvailable: Boolean(inspectAuxSlot.available),
              unreleasedText: isNonPlannerAuxLocked
                ? pk.unrelNonPlanner
                : inspectAuxSlot.available
                ? ''
                : pk.unrelAuxBlind,
              effortTitle: pk.thinkMode,
              levels: auxLevelsOut,
              hoveredEffort: hoveredEffort,
              pressedEffort: pressedEffort,
              dragEffortProgress: dragEffortProgress,
            },
          };
        }

        var inspectZ = resolveInspectedElementZ();
        var slot = SLOT_BY_Z.get(inspectZ) || ELEMENTS_90[5];
        var availEntry = availableByZ.get(inspectZ) || null;
        var fullElemEntry = fullAvailableByZ.get(inspectZ) || null;
        var groupInfo = GROUP_META[slot.group] || GROUP_META.transition || { zh: '', en: '' };
        var elProf = ELEMENT_SPEC_PROFILES[slot.z] || ELEMENT_SPEC_PROFILES.fallback;

        if (availEntry) {
          var lore = ELEMENT_LORE[slot.z];
          var subtitle = lore
            ? (zh ? lore.zh : lore.en)
            : pk.grpPre + slot.col + pk.grpSuf + ' · ' + (zh ? groupInfo.zh : groupInfo.en) + ' · ' + pk.elemSeriesSuf;

          var activeEff = selectedZ === slot.z ? activeEffortByZ.get(slot.z) || '' : '';
          if (!activeEff) {
            var defLvl = resolveLevelForElementWithMemory(availEntry, '');
            activeEff = defLvl ? defLvl.effort : '';
          }
          var levelsOut = [];
          var activeElOpt = availEntry.defaultOption || null;
          for (var li = 0; li < availEntry.levels.length; li += 1) {
            var lv = availEntry.levels[li];
            if (lv.effort === activeEff) activeElOpt = lv.option;
            levelsOut.push({
              effort: lv.effort,
              label: lv.label,
              active: lv.effort === activeEff,
              option: lv.option,
            });
          }

          var elBench = catalog.resolveBenchmarkMetrics(slot.z, activeEff, zh, true);
          var elHasBench = Boolean(elBench && elBench.isKnownBenchmark);
          var isOrchElemPlanner = Boolean(orchLatched);
          var useElemCompare = Boolean(elHasBench && baseline && !(baseline.kind === 'element' && baseline.key === slot.z));
          var elemRowsWithDelta = elHasBench
            ? (useElemCompare ? attachCompareDeltas(elBench.rows, baseline.bench) : elBench.rows)
            : [];
          var elemDisplayTitle = isOrchElemPlanner ? 'Orch · ' + (availEntry.name || slot.name) : availEntry.baseName;
          var elemOledBadge = isOrchElemPlanner ? 'ORCH · ' + slot.numLabel + slot.symbol : slot.numLabel + slot.symbol;
          var elemCardBadge = isOrchElemPlanner
            ? 'ORCH · ' + slot.numLabel + ' ' + slot.symbol + ' · +1H'
            : slot.numLabel + ' ' + slot.symbol + ' · ' + elProf.roleTag;
          var elMicroTags = zh ? elProf.scenesZh : elProf.scenesEn;

          return {
            inspectKind: 'element',
            auxSlot: null,
            globalAuxIndex: null,
            slot: slot,
            availEntry: availEntry,
            bentoSpec: {
              kind: 'element',
              auxIndex: null,
              z: slot.z,
              modelId: (activeElOpt && (activeElOpt.modelId || activeElOpt.value)) || '',
              isKnownBenchmark: elHasBench,
              badge: elemCardBadge,
              stateText:
                selectedZ === slot.z
                  ? hoveredGlobalAux === 0 && orchLatched
                    ? pk.orchLatched
                    : pk.active
                  : pk.compare,
              title: elemDisplayTitle,
              shortTag: slot.numLabel + slot.symbol,
              microTags: Array.isArray(elMicroTags) ? elMicroTags.slice(0, 3) : [],
              tagline: zh ? elProf.taglineZh : elProf.taglineEn,
              scores: elHasBench ? elBench.ratios : null,
              benchRows: elemRowsWithDelta,
              compactText: elBench ? elBench.compactText : '',
              runnerRatios: elHasBench && isOrchElemPlanner && runnerBench1H && runnerBench1H.isKnownBenchmark ? runnerBench1H.ratios : null,
              compareRatios: useElemCompare ? baseline.bench.ratios : null,
              compareTag: useElemCompare ? baseline.shortTag : '',
              accentHex: isOrchElemPlanner ? '#8B5CF6' : elProf.accentHex,
              secondaryHex: isOrchElemPlanner ? '#F5B942' : elProf.secondaryHex || elProf.accentHex,
              accentHexLight: isOrchElemPlanner ? '#6D28D9' : elProf.accentHexLight || elProf.accentHex,
              secondaryHexLight: isOrchElemPlanner ? '#B45309' : elProf.secondaryHexLight || elProf.accentHexLight || elProf.accentHex,
              glowRgba: isOrchElemPlanner ? 'rgba(139, 92, 246, 0.28)' : elProf.glowRgba,
              isAvailable: true,
              levels: levelsOut,
              activeEffort: activeEff,
              activeEffortLabel: EFFORT_LABELS[activeEff] || activeEff || pk.effDefault,
              tierNote: formatAntigravTierNote(activeEff, true, levelsOut.length <= 1, langCode, isOrchElemPlanner),
              switchSpec: formatSwitchSpecText(activeEff, zh ? elProf.switchSpecZh : elProf.switchSpecEn, true, levelsOut.length <= 1),
              litDots: resolveEffortLitDots(activeEff, true),
              plannerTopoLabel: activePlannerTopo,
              telemetrySeed: slot.z,
            },
            deckInfo: {
              z: slot.z,
              lang: langCode,
              isAuxModel: false,
              orchLatched: isOrchElemPlanner,
              orchUnsupported: false,
              badgeText: elemOledBadge,
              roleTag: elProf.roleTag,
              numLabel: slot.numLabel,
              groupCode: 'G' + slot.col,
              symbol: slot.symbol,
              elementEn: availEntry.name || slot.name,
              mass: slot.mass,
              title: elemDisplayTitle,
              chemLabel: slot.numLabel + ' ' + slot.symbol + ' · ' + availEntry.name + (zh ? ' (' + slot.zh + ')' : ''),
              subtitle: subtitle,
              sessionBanner: sessionBanner,
              blindFlash: Boolean(blindFlashBannerText && !isHoverPreview),
              blindFlashBanner: !isHoverPreview ? blindFlashBannerText : '',
              isAvailable: true,
              unreleasedText: '',
              effortTitle: pk.thinkDepth,
              levels: levelsOut,
              hoveredEffort: hoveredEffort,
              pressedEffort: pressedEffort,
              dragEffortProgress: dragEffortProgress,
            },
          };
        }

        if (orchLatched && fullElemEntry) {
          var lockedElBench = catalog.resolveBenchmarkMetrics(slot.z, 'high', zh, true);
          var lockedHasBench = Boolean(lockedElBench && lockedElBench.isKnownBenchmark);
          return {
            inspectKind: 'blind-element',
            auxSlot: null,
            globalAuxIndex: null,
            slot: slot,
            availEntry: null,
            bentoSpec: {
              kind: 'blind-element',
              auxIndex: null,
              z: slot.z,
              isKnownBenchmark: lockedHasBench,
              badge: slot.numLabel + ' ' + slot.symbol + ' · NON-PLANNER',
              stateText: pk.nonPlanner,
              title: fullElemEntry.baseName,
              shortTag: slot.numLabel + slot.symbol,
              microTags: pk.orchLockedTags,
              tagline: slot.z === 1 ? pk.orch1HTagline : pk.notInOrch,
              scores: lockedHasBench ? lockedElBench.ratios : null,
              benchRows: lockedHasBench ? lockedElBench.rows : [],
              compactText: lockedHasBench ? lockedElBench.compactText : '',
              runnerRatios: null,
              compareRatios: null,
              compareTag: '',
              accentHex: elProf.accentHex,
              accentHexLight: elProf.accentHexLight || elProf.accentHex,
              glowRgba: elProf.glowRgba,
              isAvailable: false,
              levels: [],
              activeEffort: '',
              tierNote: pk.tierNonPlanner,
              switchSpec: '0.00U · Orch Locked',
              litDots: 0,
              plannerTopoLabel: activePlannerTopo,
              telemetrySeed: slot.z,
            },
            deckInfo: {
              z: slot.z,
              lang: langCode,
              isAuxModel: false,
              orchLatched: false,
              orchUnsupported: true,
              badgeText: slot.numLabel + slot.symbol,
              numLabel: slot.numLabel,
              groupCode: 'G' + slot.col,
              symbol: slot.symbol,
              elementEn: fullElemEntry.name || slot.name,
              mass: slot.mass,
              title: fullElemEntry.baseName,
              chemLabel: slot.numLabel + ' ' + slot.symbol + ' · ' + (fullElemEntry.name || slot.name),
              subtitle: zh ? elProf.taglineZh : elProf.taglineEn,
              sessionBanner: sessionBanner,
              blindFlash: false,
              blindFlashBanner: '',
              isAvailable: false,
              unreleasedText: pk.unrelNonPlanner,
              effortTitle: pk.plannerStatus,
              levels: [],
              hoveredEffort: null,
              pressedEffort: null,
            },
          };
        }

        var isBlindFlashNow = Boolean(blindFlashZ === slot.z);
        var chemFlashStr = slot.numLabel + ' ' + slot.symbol + ' · ' + slot.name + ' · ' + slot.mass + ' · STANDBY';
        var unrelText = isBlindFlashNow
          ? chemFlashStr
          : fullAvailableEntries.length === 0
          ? pk.unrelNoModels
          : pk.unrelStandby;
        var blindBench = catalog.resolveBenchmarkMetrics(slot.z, '', zh, false);

        return {
          inspectKind: 'blind-element',
          auxSlot: null,
          globalAuxIndex: null,
          slot: slot,
          availEntry: null,
          bentoSpec: {
            kind: 'blind-element',
            auxIndex: null,
            z: slot.z,
            isKnownBenchmark: false,
            badge: slot.numLabel + ' ' + slot.symbol + ' · STANDBY',
            stateText: pk.standby,
            title: slot.numLabel + ' ' + slot.symbol + ' · ' + slot.name,
            shortTag: slot.numLabel + slot.symbol,
            microTags: [pk.grpPre + slot.col + pk.grpSuf, slot.mass + ' u', 'STANDBY'],
            tagline: pk.grpPre + slot.col + pk.grpSuf + ' · ' + (zh ? groupInfo.zh : groupInfo.en) + ' · ' + pk.blindDescSuf,
            scores: null,
            benchRows: [],
            compactText: blindBench ? blindBench.compactText : '',
            runnerRatios: null,
            compareRatios: null,
            compareTag: '',
            accentHex: '#94A3B8',
            accentHexLight: '#475569',
            glowRgba: 'rgba(148, 163, 184, 0.22)',
            isAvailable: false,
            levels: [],
            activeEffort: '',
            tierNote: formatAntigravTierNote('', false, false, langCode, false),
            switchSpec: '0.00U · Matte PBT Standby',
            litDots: 0,
            plannerTopoLabel: activePlannerTopo,
            telemetrySeed: slot.z,
          },
          deckInfo: {
            z: slot.z,
            lang: langCode,
            isAuxModel: false,
            orchLatched: false,
            orchUnsupported: false,
            blindFlash: isBlindFlashNow,
            blindFlashBanner: isBlindFlashNow ? chemFlashStr : '',
            numLabel: slot.numLabel,
            groupCode: 'G' + slot.col,
            symbol: slot.symbol,
            elementEn: slot.name,
            mass: slot.mass,
            title: isBlindFlashNow
              ? slot.numLabel + ' ' + slot.symbol + ' · ' + slot.name
              : slot.numLabel + ' ' + slot.symbol + ' · ' + slot.name + ' — Standby',
            chemLabel: zh ? slot.zh : slot.name,
            subtitle: pk.grpPre + slot.col + pk.grpSuf + ' · ' + (zh ? groupInfo.zh : groupInfo.en) + ' · ' + slot.mass + ' u · ' + pk.blindSubSuf,
            sessionBanner: sessionBanner,
            isAvailable: false,
            unreleasedText: unrelText,
            effortTitle: pk.elemStatus,
            levels: [],
            hoveredEffort: null,
            pressedEffort: null,
          },
        };
      }

      /* ── Zero-Reflow Geometry Cache & Dock Compact Tier ────────────────── */

      function refreshCachedLayoutRects() {
        if (!overlayEl) return;
        try {
          if (typeof overlayEl.getBoundingClientRect === 'function') {
            var or = overlayEl.getBoundingClientRect();
            if (or && or.width > 160) cachedOverlayWidth = Number(or.width) || 0;
          }
          var targetDock = spatialDockEl || stageEl || overlayEl;
          if (targetDock && typeof targetDock.getBoundingClientRect === 'function') {
            var dr = targetDock.getBoundingClientRect();
            if (dr && dr.width > 40 && dr.height > 40) {
              cachedDockBounds = {
                left: Number(dr.left) || 0,
                top: Number(dr.top) || 0,
                width: Number(dr.width) || 1280,
                height: Number(dr.height) || 340,
              };
              if (cachedOverlayWidth <= 160 && dr.width > 160) cachedOverlayWidth = Number(dr.width) || 0;
            }
          }
          if (cachedOverlayWidth <= 160 && overlayEl.parentElement) {
            var pw = Number(overlayEl.parentElement.clientWidth) || 0;
            if (pw > 160) {
              cachedOverlayWidth = pw;
            } else if (typeof overlayEl.parentElement.getBoundingClientRect === 'function') {
              var pr = overlayEl.parentElement.getBoundingClientRect();
              if (pr && pr.width > 160) cachedOverlayWidth = Number(pr.width) || 0;
            }
          }
          var hostBox = overlayEl.parentElement;
          var composerBox =
            (hostBox && typeof hostBox.querySelector === 'function' && hostBox.querySelector('[data-testid="agent-input-box"]')) ||
            (doc && typeof doc.querySelector === 'function' ? doc.querySelector('[data-testid="agent-input-box"]') : null);
          if (composerBox && typeof composerBox.getBoundingClientRect === 'function') {
            var compR = composerBox.getBoundingClientRect();
            cachedComposerHeight = compR && compR.height > 28 ? Number(compR.height) : 0;
          } else {
            cachedComposerHeight = 0;
          }
          if (bentoRefs && bentoRefs.grid && typeof bentoRefs.grid.getBoundingClientRect === 'function') {
            var cr = bentoRefs.grid.getBoundingClientRect();
            if (cr && cr.width > 20 && cr.height > 20) {
              cachedCardBounds = {
                left: Number(cr.left) || 0,
                top: Number(cr.top) || 0,
                width: Number(cr.width) || 300,
                height: Number(cr.height) || 316,
              };
            }
          }
          if (bentoRefs && bentoRefs.rightWing && typeof bentoRefs.rightWing.getBoundingClientRect === 'function') {
            var rr = bentoRefs.rightWing.getBoundingClientRect();
            if (rr && rr.width > 20 && rr.height > 20) {
              cachedRightCardBounds = {
                left: Number(rr.left) || 0,
                top: Number(rr.top) || 0,
                width: Number(rr.width) || 246,
                height: Number(rr.height) || 316,
              };
            }
          }
          if (stageEl && typeof stageEl.getBoundingClientRect === 'function') {
            var sr = stageEl.getBoundingClientRect();
            lastStageRectFn = stageEl.getBoundingClientRect;
            if (sr && sr.width > 80 && sr.height > 60) {
              cachedStageBounds = {
                left: Number(sr.left) || 0,
                top: Number(sr.top) || 0,
                width: Number(sr.width) || 1280,
                height: Number(sr.height) || 680,
                valid: true,
              };
              if (activeRenderer && typeof activeRenderer.syncCanvasBounds === 'function') {
                activeRenderer.syncCanvasBounds(cachedStageBounds);
              }
            } else {
              cachedStageBounds.valid = false;
            }
          }
        } catch (e) {}
      }

      /* Strictly zero getBoundingClientRect() calls — reads cached measurements only! */
      function syncDockCompactState() {
        if (!overlayEl) return false;
        if (stageMode !== 'drawer') {
          var fullSig = 'fullscreen';
          if (lastDockCompactSig === fullSig) return false;
          lastDockCompactSig = fullSig;
          overlayEl.setAttribute('data-dock-tier', 'wide');
          overlayEl.setAttribute('data-dock-compact', '0');
          overlayEl.setAttribute('data-spec-compact', '0');
          overlayEl.setAttribute('data-source-short', '0');
          overlayEl.setAttribute('data-compact-expanded', '0');
          overlayEl.removeAttribute('data-short-viewport');
          setStyleVar(overlayEl, '--ag-pp-short-dock-h', null);
          return true;
        }
        var winH = Number(root && root.innerHeight) || 800;
        var isShortVp = winH > 0 && winH < SHORT_VIEWPORT_HEIGHT_PX;
        var clampedShortH = 0;
        if (isShortVp) {
          var availShortH = winH - 180;
          if (cachedComposerHeight > 28 && cachedComposerHeight < winH * 0.7) {
            availShortH = Math.min(availShortH, winH - cachedComposerHeight - 84);
          }
          var minShortH = winH < 420 ? 172 : 196;
          clampedShortH = Math.max(minShortH, Math.min(268, Math.round(availShortH)));
        }

        var measuredW = cachedOverlayWidth > 160 ? cachedOverlayWidth : cachedDockBounds.width;
        if (measuredW <= 160 && root && Number(root.innerWidth) > 160) measuredW = Number(root.innerWidth);
        if (measuredW <= 160) measuredW = 1280;

        var tier =
          measuredW >= DOCK_WIDE_BREAKPOINT_PX
            ? 'wide'
            : measuredW >= DOCK_MEDIUM_BREAKPOINT_PX
            ? 'medium'
            : 'narrow';
        var isCompact = tier !== 'wide';
        var isSpecCompact = tier === 'medium' || (tier === 'wide' && measuredW < 1300);
        var useShortSource = tier !== 'wide' || measuredW < 1260;
        if (tier !== 'narrow' && compactExpanded) compactExpanded = false;
        var compExpFlag = tier === 'narrow' && compactExpanded ? '1' : '0';

        var nextSig =
          'drawer|' + tier + '|' + (isCompact ? '1' : '0') + '|' + (isSpecCompact ? '1' : '0') +
          '|' + (useShortSource ? '1' : '0') + '|' + compExpFlag + '|' + (isShortVp ? clampedShortH : '0');
        if (lastDockCompactSig === nextSig) return false;
        lastDockCompactSig = nextSig;

        if (isShortVp) {
          overlayEl.setAttribute('data-short-viewport', '1');
          setStyleVar(overlayEl, '--ag-pp-short-dock-h', clampedShortH + 'px');
        } else {
          overlayEl.removeAttribute('data-short-viewport');
          setStyleVar(overlayEl, '--ag-pp-short-dock-h', null);
        }
        overlayEl.setAttribute('data-dock-tier', tier);
        overlayEl.setAttribute('data-dock-compact', isCompact ? '1' : '0');
        overlayEl.setAttribute('data-spec-compact', isSpecCompact ? '1' : '0');
        overlayEl.setAttribute('data-source-short', useShortSource ? '1' : '0');
        overlayEl.setAttribute('data-compact-expanded', compExpFlag);
        return true;
      }

      var lastBoundsSyncMs = 0;

      function clearLocalRimGlow() {
        if (!overlayEl) return;
        if (rimGlowWasActive) {
          rimGlowWasActive = false;
          overlayEl.setAttribute('data-pointer-near', '0');
        }
        if (rimDockWasActive && dockTopRimEl) {
          rimDockWasActive = false;
          setStyleVar(dockTopRimEl, '--ag-pp-dock-rim-alpha', '0');
          setStyleVar(dockTopRimEl, '--ag-pp-px', '-999px');
        }
        var specRim = bentoRefs && bentoRefs.specCardRim;
        if (rimCardWasActive && specRim) {
          rimCardWasActive = false;
          setStyleVar(specRim, '--ag-pp-card-rim-alpha', '0');
          setStyleVar(specRim, '--ag-pp-card-px', '-999px');
          setStyleVar(specRim, '--ag-pp-card-py', '-999px');
        }
        var teleRim = bentoRefs && bentoRefs.telePodRim;
        if (rimRightWasActive && teleRim) {
          rimRightWasActive = false;
          setStyleVar(teleRim, '--ag-pp-right-rim-alpha', '0');
          setStyleVar(teleRim, '--ag-pp-right-px', '-999px');
          setStyleVar(teleRim, '--ag-pp-right-py', '-999px');
        }
      }

      function updateDynamicPrismCssVars(clientX, clientY) {
        if (!overlayEl) return { nearAny: false, extDockDist: Infinity };
        var cx = Number(clientX) || 0;
        var cy = Number(clientY) || 0;
        var b = cachedDockBounds;
        var cb = cachedCardBounds;
        var rb = cachedRightCardBounds;
        var localX = cx - b.left;
        var localY = cy - b.top;
        var cardX = cx - cb.left;
        var cardY = cy - cb.top;
        var rightX = cx - rb.left;
        var rightY = cy - rb.top;

        var dxDock = Math.max(0, -localX, localX - b.width);
        var dyDockBox = Math.max(0, -localY, localY - b.height);
        var extDockDist = Math.hypot(dxDock, dyDockBox);
        var dyTopEdge = localY < 0 ? -localY : localY * 0.78;
        var dockAlpha = smoothRimWeight(Math.hypot(dxDock, dyTopEdge), EXT_RIM_PROXIMITY_PX);

        var cardAlpha = smoothRimWeight(
          Math.hypot(Math.max(0, -cardX, cardX - cb.width), Math.max(0, -cardY, cardY - cb.height)),
          EXT_RIM_PROXIMITY_PX
        );
        var rightAlpha = smoothRimWeight(
          Math.hypot(Math.max(0, -rightX, rightX - rb.width), Math.max(0, -rightY, rightY - rb.height)),
          EXT_RIM_PROXIMITY_PX
        );

        var dockNear = dockAlpha > 0.008;
        var cardNear = cardAlpha > 0.008;
        var rightNear = rightAlpha > 0.008;
        var nearAny = dockNear || cardNear || rightNear;
        if (!nearAny && !rimGlowWasActive) return { nearAny: false, extDockDist: extDockDist };
        if (!nearAny && rimGlowWasActive) {
          clearLocalRimGlow();
          return { nearAny: false, extDockDist: extDockDist };
        }
        if (!rimGlowWasActive) {
          rimGlowWasActive = true;
          overlayEl.setAttribute('data-pointer-near', '1');
        }
        // 仅写入各自独立的零子节点光环层，禁止向 #ag-prism-periodic-picker-root 写入高频 CSS 变量
        if (dockTopRimEl) {
          if (dockNear) {
            rimDockWasActive = true;
            setStyleVar(dockTopRimEl, '--ag-pp-dock-rim-alpha', dockAlpha.toFixed(3));
            setStyleVar(dockTopRimEl, '--ag-pp-px', localX.toFixed(1) + 'px');
          } else if (rimDockWasActive) {
            rimDockWasActive = false;
            setStyleVar(dockTopRimEl, '--ag-pp-dock-rim-alpha', '0');
            setStyleVar(dockTopRimEl, '--ag-pp-px', '-999px');
          }
        }
        var specRim = bentoRefs && bentoRefs.specCardRim;
        if (specRim) {
          if (cardNear) {
            rimCardWasActive = true;
            setStyleVar(specRim, '--ag-pp-card-rim-alpha', cardAlpha.toFixed(3));
            setStyleVar(specRim, '--ag-pp-card-px', cardX.toFixed(1) + 'px');
            setStyleVar(specRim, '--ag-pp-card-py', cardY.toFixed(1) + 'px');
          } else if (rimCardWasActive) {
            rimCardWasActive = false;
            setStyleVar(specRim, '--ag-pp-card-rim-alpha', '0');
            setStyleVar(specRim, '--ag-pp-card-px', '-999px');
            setStyleVar(specRim, '--ag-pp-card-py', '-999px');
          }
        }
        var teleRim = bentoRefs && bentoRefs.telePodRim;
        if (teleRim) {
          if (rightNear) {
            rimRightWasActive = true;
            setStyleVar(teleRim, '--ag-pp-right-rim-alpha', rightAlpha.toFixed(3));
            setStyleVar(teleRim, '--ag-pp-right-px', rightX.toFixed(1) + 'px');
            setStyleVar(teleRim, '--ag-pp-right-py', rightY.toFixed(1) + 'px');
          } else if (rimRightWasActive) {
            rimRightWasActive = false;
            setStyleVar(teleRim, '--ag-pp-right-rim-alpha', '0');
            setStyleVar(teleRim, '--ag-pp-right-px', '-999px');
            setStyleVar(teleRim, '--ag-pp-right-py', '-999px');
          }
        }
        return { nearAny: nearAny, extDockDist: extDockDist };
      }

      /* ── Orbit Parallax, Hit Layer & Effort Slider Geometry ────────────── */

      function getChassisOrbitSafe() {
        if (activeRenderer && typeof activeRenderer.getChassisOrbit === 'function') {
          try {
            var o = activeRenderer.getChassisOrbit();
            if (o && typeof o === 'object') {
              var p = Number(o.pitch) || 0;
              var y = Number(o.yaw) || 0;
              var rot = o.isRotated !== undefined ? Boolean(o.isRotated) : Math.hypot(p, y) > 0.008;
              if (!rot && pendingServoOrbit && Math.hypot(pendingServoOrbit.pitch, pendingServoOrbit.yaw) > 0.008) {
                return { pitch: pendingServoOrbit.pitch, yaw: pendingServoOrbit.yaw, isRotated: true };
              }
              return { pitch: p, yaw: y, isRotated: rot };
            }
          } catch (e) {}
        }
        return { pitch: 0, yaw: 0, isRotated: false };
      }

      function syncOrbitParallaxAndHud() {
        if (!overlayEl) return;
        var orbit = getChassisOrbitSafe();
        var reduced = bentoUi.isReducedMotion(doc, root);
        var nextShadowPx = (reduced ? 0 : orbit.yaw * 18).toFixed(2) + 'px';
        var nextShadowPy = (reduced ? 0 : orbit.pitch * 14).toFixed(2) + 'px';
        if (floorShadowEl && (nextShadowPx !== lastShadowPxStr || nextShadowPy !== lastShadowPyStr)) {
          lastShadowPxStr = nextShadowPx;
          lastShadowPyStr = nextShadowPy;
          setStyleVar(floorShadowEl, '--pp-shadow-px', nextShadowPx);
          setStyleVar(floorShadowEl, '--pp-shadow-py', nextShadowPy);
        }
        if (uiRefs && uiRefs.resetBtn) {
          var rotFlag = orbit.isRotated ? '1' : '0';
          if (uiRefs.lastRotatedFlag !== rotFlag) {
            uiRefs.lastRotatedFlag = rotFlag;
            uiRefs.resetBtn.setAttribute('data-rotated', rotFlag);
          }
        }
      }

      function startOrbitFollowSync() {
        if (!reqRaf || !overlayEl || isDestroyed || !activeRenderer || isHostPaused) return;
        if (orbitSyncRafId) return;
        var lastPitch = NaN;
        var lastYaw = NaN;
        var unchangedFrames = 0;
        var stepCount = 0;
        function tick() {
          orbitSyncRafId = 0;
          if (!overlayEl || isDestroyed || !activeRenderer || isHostPaused) return;
          if (typeof activeRenderer.getChassisOrbit === 'function') {
            try {
              var rawO = activeRenderer.getChassisOrbit();
              if (rawO && (Boolean(rawO.isRotated) || Math.hypot(Number(rawO.pitch) || 0, Number(rawO.yaw) || 0) > 0.008)) {
                pendingServoOrbit = null;
              }
            } catch (e) {}
          }
          var hasIdleApi = typeof activeRenderer.isIdle === 'function';
          var idleDone = hasIdleApi ? Boolean(activeRenderer.isIdle()) : false;
          if (idleDone && !isOrbitDragging) pendingServoOrbit = null;
          syncOrbitParallaxAndHud();
          var o = getChassisOrbitSafe();
          if (Math.abs(o.pitch - lastPitch) < 1e-5 && Math.abs(o.yaw - lastYaw) < 1e-5) {
            unchangedFrames += 1;
          } else {
            unchangedFrames = 0;
            lastPitch = o.pitch;
            lastYaw = o.yaw;
          }
          stepCount += 1;
          if (stepCount >= 240) {
            pendingServoOrbit = null;
            if (!isOrbitDragging) syncHitLayerRects();
            return;
          }
          if (hasIdleApi ? (idleDone && !isOrbitDragging) : (!isOrbitDragging && unchangedFrames >= 2)) {
            syncHitLayerRects();
            return;
          }
          orbitSyncRafId = reqRaf(tick);
        }
        orbitSyncRafId = reqRaf(tick);
      }

      function readStageBoundsZeroReflow() {
        if (stageEl && stageEl.getBoundingClientRect !== lastStageRectFn && typeof stageEl.getBoundingClientRect === 'function') {
          try {
            var sr = stageEl.getBoundingClientRect();
            lastStageRectFn = stageEl.getBoundingClientRect;
            if (sr && sr.width > 80 && sr.height > 60) {
              cachedStageBounds = {
                left: Number(sr.left) || 0,
                top: Number(sr.top) || 0,
                width: Number(sr.width) || 1280,
                height: Number(sr.height) || 680,
                valid: true,
              };
            }
          } catch (e) {}
        }
        return cachedStageBounds;
      }

      function applyBoxRect(el, rect) {
        if (!el || !rect) return;
        var l = Math.round(rect.left);
        var t = Math.round(rect.top);
        var w = Math.max(1, Math.round(rect.width));
        var h = Math.max(1, Math.round(rect.height));
        var rKey = l + ',' + t + ',' + w + ',' + h;
        if (el._ppRectKey === rKey) return;
        el._ppRectKey = rKey;
        setStyleVar(el, 'left', l + 'px');
        setStyleVar(el, 'top', t + 'px');
        setStyleVar(el, 'width', w + 'px');
        setStyleVar(el, 'height', h + 'px');
      }

      function syncHitLayerRects(skipBoundsMeasure) {
        if (!overlayEl || !stageEl || !uiRefs || isOrbitDragging) return;
        syncOrbitParallaxAndHud();
        if (!skipBoundsMeasure) refreshCachedLayoutRects();
        var stageRect = readStageBoundsZeroReflow();
        var stageW = stageRect && stageRect.valid && stageRect.width > 80 ? stageRect.width : 1280;
        var stageH = stageRect && stageRect.valid && stageRect.height > 60 ? stageRect.height : 680;

        var proj = null;
        if (activeRenderer && typeof activeRenderer.getInteractiveProjectedRects === 'function') {
          try { proj = activeRenderer.getInteractiveProjectedRects(); } catch (e) { proj = null; }
        }

        var keyRectMap = new Map();
        if (proj && Array.isArray(proj.availableKeys)) {
          for (var i = 0; i < proj.availableKeys.length; i += 1) {
            var pk = proj.availableKeys[i];
            keyRectMap.set(pk.slotZ || pk.z, { left: pk.left, top: pk.top, width: pk.width, height: pk.height });
          }
        } else if (proj && Array.isArray(proj.keys)) {
          for (var k = 0; k < proj.keys.length; k += 1) {
            var item = proj.keys[k];
            if (!item.available) continue;
            keyRectMap.set(item.slotZ || item.z, { left: item.left, top: item.top, width: item.width, height: item.height });
          }
        } else {
          availableByZ.forEach(function (_, z) {
            var slot = SLOT_BY_Z.get(z);
            if (slot) keyRectMap.set(z, fallbackKeyRect(slot, stageW, stageH));
          });
        }

        keyRectMap.forEach(function (rUpper, zUpper) {
          if (zUpper === selectedZ) return;
          var sUpper = SLOT_BY_Z.get(zUpper);
          if (!sUpper) return;
          keyRectMap.forEach(function (rLower, zLower) {
            if (zUpper === zLower || zLower === selectedZ) return;
            var sLower = SLOT_BY_Z.get(zLower);
            if (!sLower || sLower.col !== sUpper.col || sLower.row <= sUpper.row) return;
            if (rUpper.top + rUpper.height > rLower.top - 1) {
              rUpper.height = Math.max(12, rLower.top - rUpper.top - 1);
            }
          });
        });

        keyRectMap.forEach(function (rectVal, zKey) {
          var btn = keyNodesByZ.get(zKey);
          if (btn) applyBoxRect(btn, rectVal);
        });

        if (auxKeyNodes.length > 0) {
          var projAux = proj && Array.isArray(proj.auxKeys) ? proj.auxKeys : null;
          for (var ai = 0; ai < auxKeyNodes.length; ai += 1) {
            var ab = auxKeyNodes[ai];
            var aSlot = auxSlots[ai];
            if (!ab || !aSlot || !aSlot.available) continue;
            var matchedAuxRect = null;
            if (projAux) {
              for (var pa = 0; pa < projAux.length; pa += 1) {
                var cand = projAux[pa];
                if (cand && (cand.auxIndex === ai || cand.slotIndex === ai)) {
                  matchedAuxRect = cand;
                  break;
                }
              }
            }
            applyBoxRect(ab, matchedAuxRect || fallbackAuxKeyRect(ai, stageW, stageH));
          }
        }

        if (uiRefs.effortButtons && uiRefs.effortButtons.length > 0) {
          var projEfforts = proj && Array.isArray(proj.efforts) ? proj.efforts : null;
          for (var ei = 0; ei < uiRefs.effortButtons.length; ei += 1) {
            var eb = uiRefs.effortButtons[ei];
            var effCode = eb.getAttribute('data-ag-pp-effort');
            var matchedRect = null;
            if (projEfforts) {
              for (var pe = 0; pe < projEfforts.length; pe += 1) {
                if (projEfforts[pe].effort === effCode) {
                  matchedRect = projEfforts[pe];
                  break;
                }
              }
            }
            applyBoxRect(
              eb,
              matchedRect || { left: stageW * 0.42 + ei * 58, top: stageH * 0.34, width: 52, height: 24 }
            );
          }
        }
      }

      function syncEffortButtonRectsOnly() {
        if (!overlayEl || !stageEl || !uiRefs || isOrbitDragging) return;
        if (!uiRefs.effortButtons || uiRefs.effortButtons.length === 0) return;
        var stageRect = readStageBoundsZeroReflow();
        var stageW = stageRect && stageRect.valid && stageRect.width > 80 ? stageRect.width : 1280;
        var stageH = stageRect && stageRect.valid && stageRect.height > 60 ? stageRect.height : 680;
        var projEfforts = getProjectedEffortsSafe();
        for (var ei = 0; ei < uiRefs.effortButtons.length; ei += 1) {
          var eb = uiRefs.effortButtons[ei];
          var effCode = eb.getAttribute('data-ag-pp-effort');
          var matchedRect = null;
          if (projEfforts) {
            for (var pe = 0; pe < projEfforts.length; pe += 1) {
              if (projEfforts[pe].effort === effCode) {
                matchedRect = projEfforts[pe];
                break;
              }
            }
          }
          applyBoxRect(
            eb,
            matchedRect || { left: stageW * 0.42 + ei * 58, top: stageH * 0.34, width: 52, height: 24 }
          );
        }
      }

      function resizeCanvasToStage(skipRectRefresh) {
        if (!stageEl || !canvasEl) return;
        if (!skipRectRefresh || !cachedStageBounds.valid) refreshCachedLayoutRects();
        var sBounds = readStageBoundsZeroReflow();
        var cssW = sBounds.valid ? sBounds.width : 1280;
        var cssH = sBounds.valid ? sBounds.height : 680;
        var dpr = Math.min(2, Math.max(1, Number(root && root.devicePixelRatio) || 1));
        if (activeRenderer && typeof activeRenderer.resize === 'function') {
          try { activeRenderer.resize(cssW, cssH, dpr, sBounds.valid ? sBounds : null); } catch (e) {}
        }
      }

      function resolveStageLocalPoint(clientX, clientY) {
        var sRect = readStageBoundsZeroReflow();
        return {
          x: (Number(clientX) || 0) - (sRect.valid ? sRect.left : 0),
          y: (Number(clientY) || 0) - (sRect.valid ? sRect.top : 0),
        };
      }

      function getProjectedEffortsSafe() {
        if (!activeRenderer || typeof activeRenderer.getInteractiveProjectedRects !== 'function') return null;
        try {
          var proj = activeRenderer.getInteractiveProjectedRects();
          if (proj && Array.isArray(proj.efforts) && proj.efforts.length > 0) return proj.efforts;
        } catch (e) {}
        return null;
      }

      function isPointInEffortSliderBand(clientX, clientY) {
        var efforts = getProjectedEffortsSafe();
        if (!efforts || efforts.length === 0) return false;
        var pt = resolveStageLocalPoint(clientX, clientY);
        var minL = Infinity;
        var minT = Infinity;
        var maxR = -Infinity;
        var maxB = -Infinity;
        for (var i = 0; i < efforts.length; i += 1) {
          var er = efforts[i];
          if (!er) continue;
          var l = Number(er.left) || 0;
          var t = Number(er.top) || 0;
          var r = l + Math.max(1, Number(er.width) || 0);
          var b = t + Math.max(1, Number(er.height) || 0);
          if (l < minL) minL = l;
          if (t < minT) minT = t;
          if (r > maxR) maxR = r;
          if (b > maxB) maxB = b;
        }
        return Number.isFinite(minL) && pt.x >= minL - 10 && pt.x <= maxR + 10 && pt.y >= minT - 7 && pt.y <= maxB + 7;
      }

      function isPointInAuxPadRegion(clientX, clientY) {
        if (!activeRenderer || typeof activeRenderer.getInteractiveProjectedRects !== 'function') return false;
        try {
          var proj = activeRenderer.getInteractiveProjectedRects();
          if (!proj || !Array.isArray(proj.auxKeys) || proj.auxKeys.length === 0) return false;
          var pt = resolveStageLocalPoint(clientX, clientY);
          var minL = Infinity;
          var minT = Infinity;
          var maxR = -Infinity;
          var maxB = -Infinity;
          for (var i = 0; i < proj.auxKeys.length; i += 1) {
            var ar = proj.auxKeys[i];
            if (!ar) continue;
            var l = Number(ar.left) || 0;
            var t = Number(ar.top) || 0;
            var r = l + Math.max(1, Number(ar.width) || 0);
            var b = t + Math.max(1, Number(ar.height) || 0);
            if (l < minL) minL = l;
            if (t < minT) minT = t;
            if (r > maxR) maxR = r;
            if (b > maxB) maxB = b;
          }
          return Number.isFinite(minL) && pt.x >= minL - 18 && pt.x <= maxR + 18 && pt.y >= minT - 18 && pt.y <= maxB + 18;
        } catch (e) {
          return false;
        }
      }

      function resolveEffortAlongSlider(clientX, clientY) {
        var directEffort = null;
        if (activeRenderer && typeof activeRenderer.pick === 'function') {
          try {
            var picked = activeRenderer.pick(Number(clientX) || 0, Number(clientY) || 0);
            if (picked && picked.kind === 'effort' && picked.effort) directEffort = picked.effort;
          } catch (e) {}
        }
        var efforts = getProjectedEffortsSafe();
        if (!efforts || efforts.length === 0) return { effort: directEffort, progress: null };
        var pt = resolveStageLocalPoint(clientX, clientY);
        var centers = [];
        for (var i = 0; i < efforts.length; i += 1) {
          var er = efforts[i];
          centers.push({
            effort: er.effort,
            cx: (Number(er.left) || 0) + (Number(er.width) || 0) * 0.5,
            cy: (Number(er.top) || 0) + (Number(er.height) || 0) * 0.5,
          });
        }
        if (centers.length === 1) return { effort: directEffort || centers[0].effort, progress: 1 };
        var vx = centers[centers.length - 1].cx - centers[0].cx;
        var vy = centers[centers.length - 1].cy - centers[0].cy;
        var lenSq = vx * vx + vy * vy;
        var progress =
          lenSq > 4 ? Math.max(0, Math.min(1, ((pt.x - centers[0].cx) * vx + (pt.y - centers[0].cy) * vy) / lenSq)) : 0;
        var bestEffort = centers[0].effort;
        var bestDist = Infinity;
        for (var j = 0; j < centers.length; j += 1) {
          var ti = j / (centers.length - 1);
          var dAxis = lenSq > 4 ? Math.abs(progress - ti) : Math.hypot(pt.x - centers[j].cx, pt.y - centers[j].cy);
          if (dAxis < bestDist) {
            bestDist = dAxis;
            bestEffort = centers[j].effort;
          }
        }
        return { effort: directEffort || bestEffort, progress: progress };
      }

      function getActiveEffortForElement(slotZ) {
        if (slotZ === null || !availableByZ.has(slotZ)) return '';
        if (selectedZ === slotZ && activeEffortByZ.has(slotZ)) return activeEffortByZ.get(slotZ) || '';
        var entry = availableByZ.get(slotZ);
        var defLvl = resolveLevelForElementWithMemory(entry, '');
        return defLvl ? defLvl.effort : '';
      }

      function resolveEffortLevelNorm(entry, chosenLvl, chosenIdx) {
        if (chosenLvl && EFFORT_NORM_MAP[chosenLvl.effort] !== undefined) return EFFORT_NORM_MAP[chosenLvl.effort];
        var count = entry && Array.isArray(entry.levels) ? entry.levels.length : 1;
        return count <= 1 ? 0.78 : Math.max(0.2, Math.min(1, 0.25 + (chosenIdx / (count - 1)) * 0.75));
      }

      /* ── Selection & Effort Handlers (Live Sync + Shared Effort Memory) ── */

      function handleAuxEffortSelect(globalAuxIdx, effortCode, soundOverride) {
        if (isConfirmClosing || isDrawerClosing) return;
        var slot = effectiveAuxAll[globalAuxIdx];
        if (!slot || !slot.available || !slot.levels || !slot.levels.length) return;
        var wantEff = normalizeEffortCode(effortCode) || effortCode;
        var chosenLvl = null;
        var chosenIdx = 0;
        for (var i = 0; i < slot.levels.length; i += 1) {
          if (slot.levels[i].effort === wantEff || normalizeEffortCode(slot.levels[i].effort) === wantEff) {
            chosenLvl = slot.levels[i];
            chosenIdx = i;
            break;
          }
        }
        if (!chosenLvl) return;
        selectedZ = null;
        selectedGlobalAuxIndex = globalAuxIdx;
        activeEffortByGlobalAux.set(globalAuxIdx, chosenLvl.effort);
        if (typeof hostBridge.writeSharedEffortMemory === 'function' && slot.id !== 'orchestrator') {
          hostBridge.writeSharedEffortMemory(root, doc, slot.title || slot.shortLabel, chosenLvl.effort, orchLatched);
        }
        syncHostWithActiveState();
        playSound(soundOverride || 'step', chosenIdx);
        syncSceneAndDom(true);
        if (activeRenderer && !bentoUi.isReducedMotion(doc, root) && typeof activeRenderer.triggerEnergyPulse === 'function') {
          try { activeRenderer.triggerEnergyPulse(resolveEffortLevelNorm(slot, chosenLvl, chosenIdx)); } catch (e) {}
        }
        scheduleSettledRectSync();
      }

      function handleEffortSelect(effortCode, inspectSlotZ, soundOverride) {
        if (isConfirmClosing || isDrawerClosing) return;
        var hoveredGlobalAux = resolveGlobalAuxIndexFromLocal(hoveredAuxIndex);
        var nonOrchHovGlobalAux = hoveredGlobalAux !== null && hoveredGlobalAux > 0 ? hoveredGlobalAux : null;
        if (
          (inspectSlotZ === undefined || inspectSlotZ === null || inspectSlotZ === 0) &&
          hoveredZ === null &&
          (nonOrchHovGlobalAux !== null || selectedGlobalAuxIndex !== null)
        ) {
          var targetGlobalAux = nonOrchHovGlobalAux !== null ? nonOrchHovGlobalAux : selectedGlobalAuxIndex;
          if (targetGlobalAux !== null && effectiveAuxAll[targetGlobalAux] && effectiveAuxAll[targetGlobalAux].available) {
            handleAuxEffortSelect(targetGlobalAux, effortCode, soundOverride);
            return;
          }
        }
        var candidateZ =
          inspectSlotZ !== undefined && inspectSlotZ !== null && inspectSlotZ !== 0
            ? inspectSlotZ
            : hoveredZ !== null && availableByZ.has(hoveredZ)
            ? hoveredZ
            : selectedZ !== null && availableByZ.has(selectedZ)
            ? selectedZ
            : resolveInspectedElementZ();
        if (candidateZ === null || !availableByZ.has(candidateZ)) return;
        var entry = availableByZ.get(candidateZ);
        var wantEff = normalizeEffortCode(effortCode) || effortCode;
        var chosenLvl = null;
        var chosenIdx = 0;
        for (var i = 0; i < entry.levels.length; i += 1) {
          if (entry.levels[i].effort === wantEff || normalizeEffortCode(entry.levels[i].effort) === wantEff) {
            chosenLvl = entry.levels[i];
            chosenIdx = i;
            break;
          }
        }
        if (!chosenLvl) return;
        var switchedElement = selectedZ !== candidateZ || selectedGlobalAuxIndex !== null;
        selectedZ = candidateZ;
        selectedGlobalAuxIndex = null;
        activeEffortByZ.set(candidateZ, chosenLvl.effort);
        if (!(gestureState && gestureState.scrubbing)) pressedEffort = null;
        if (hoveredEffort !== null) hoveredEffort = chosenLvl.effort;
        if (typeof hostBridge.writeSharedEffortMemory === 'function') {
          hostBridge.writeSharedEffortMemory(root, doc, entry.baseName || entry.name, chosenLvl.effort, orchLatched);
        }
        syncHostWithActiveState();
        var levelNorm = resolveEffortLevelNorm(entry, chosenLvl, chosenIdx);
        playSound(soundOverride || 'step', chosenIdx);
        syncSceneAndDom(true);
        if (activeRenderer && !bentoUi.isReducedMotion(doc, root)) {
          if (switchedElement && typeof activeRenderer.triggerWaveRipple === 'function') {
            try { activeRenderer.triggerWaveRipple(candidateZ, 1.0); } catch (e) {}
          }
          if (typeof activeRenderer.triggerEnergyPulse === 'function') {
            try { activeRenderer.triggerEnergyPulse(levelNorm); } catch (e2) {}
          }
        }
        if (switchedElement) scheduleSettledRectSync();
      }

      function forwardPointerToRenderer(clientX, clientY, inside) {
        if (!activeRenderer) return false;
        var isInside = inside !== false;
        if (typeof activeRenderer.setPointerClient === 'function') {
          activeRenderer.setPointerClient(
            isInside ? Number(clientX) || 0 : -9999,
            isInside ? Number(clientY) || 0 : -9999,
            isInside
          );
          return true;
        }
        if (typeof activeRenderer.setPointerNorm === 'function') {
          if (!isInside) {
            activeRenderer.setPointerNorm(0, 0, false);
          } else {
            var sb = readStageBoundsZeroReflow();
            var rw = sb.valid && sb.width > 0 ? sb.width : 1280;
            var rh = sb.valid && sb.height > 0 ? sb.height : 680;
            var nx = Math.max(-1, Math.min(1, (((Number(clientX) || 0) - (sb.valid ? sb.left : 0)) / rw) * 2 - 1));
            var ny = Math.max(-1, Math.min(1, (((Number(clientY) || 0) - (sb.valid ? sb.top : 0)) / rh) * 2 - 1));
            activeRenderer.setPointerNorm(nx, ny, true);
          }
          return true;
        }
        return false;
      }

      /* ── Unified Scene & Bento DOM Sync (0 getBoundingClientRect on Hover!) */

      function syncSceneAndDom(skipRectSync, syncOpts) {
        if (!overlayEl || !uiRefs) return;
        var optsObj = syncOpts && typeof syncOpts === 'object' ? syncOpts : null;
        var hoverOnly = Boolean(optsObj && optsObj.hoverOnly);
        var deferRender = Boolean(optsObj && optsObj.deferRender);
        var langCode = resolveCurrentLang();
        var zh = langCode === 'zh-CN' || langCode === 'zh-TW';
        var pk = getPpI18nPack(langCode);
        var profile = bentoUi.resolvePrismThemeProfile(doc, root);

        var chromeSig =
          profile.theme +
          '|' + profile.id +
          '|' + (profile.rimTone || 'default') +
          '|' + profile.corners +
          '|' + (profile.isMono ? '1' : '0') +
          '|' + stageMode +
          '|' + (cardFlipped ? '1' : '0') +
          '|' + (orchLatched ? '1' : '0') +
          '|' + profile.ambientMul;

        if (!hoverOnly || chromeSig !== lastDomChromeSig) {
          if (chromeSig !== lastDomChromeSig) {
            lastDomChromeSig = chromeSig;
            overlayEl.setAttribute('data-theme', profile.theme);
            overlayEl.setAttribute('data-kit', profile.id);
            overlayEl.setAttribute('data-rim-tone', profile.rimTone || 'default');
            overlayEl.setAttribute('data-corners', profile.corners);
            overlayEl.setAttribute('data-mono', profile.isMono ? '1' : '0');
            overlayEl.setAttribute('data-stage-mode', stageMode);
            overlayEl.setAttribute('data-card-flipped', cardFlipped ? '1' : '0');
            overlayEl.setAttribute('data-orch-latched', orchLatched ? '1' : '0');
            var ambOpacity = profile.ambientMul <= 0 ? 0.22 : Math.max(0.35, Math.min(1, profile.ambientMul));
            setStyleVar(overlayEl, '--pp-ambient-mul', ambOpacity.toFixed(3));
            if (deskmatEl && typeof bentoUi.mountDeskmatTopoSvgIfAvailable === 'function') {
              bentoUi.mountDeskmatTopoSvgIfAvailable(doc, deskmatEl, root);
            }
          }
          if (!hoverOnly) syncDockCompactState();
        }

        var haloZ = selectedZ !== null ? selectedZ : resolveInspectedElementZ();
        var haloSig = haloZ + '|' + profile.id + '|' + (profile.isLight ? 'L' : 'D');
        if (haloSig !== lastDomHaloSig) {
          lastDomHaloSig = haloSig;
          var haloGem = bentoUi.hudGemColorsForZ(haloZ, profile);
          setStyleVar(overlayEl, '--pp-elem-halo', profile.isLight ? haloGem.haloLight : haloGem.haloDark);
          setStyleVar(overlayEl, '--pp-elem-ring', haloGem.ring);
        }

        /* O(1) incremental keycap DOM sync (only touch prev/next selected & hovered nodes, NEVER loop all 90!) */
        if (selectedZ !== lastDomSelectedZ) {
          if (lastDomSelectedZ !== undefined && lastDomSelectedZ !== null) {
            var prevSelBtn = keyNodesByZ.get(lastDomSelectedZ);
            if (prevSelBtn) {
              prevSelBtn.classList.remove('is-levitated');
              if (availableByZ.has(lastDomSelectedZ)) prevSelBtn.setAttribute('aria-pressed', 'false');
            }
          }
          if (selectedZ !== null) {
            var nextSelBtn = keyNodesByZ.get(selectedZ);
            if (nextSelBtn) {
              nextSelBtn.classList.add('is-levitated');
              nextSelBtn.setAttribute('aria-pressed', 'true');
            }
          }
          lastDomSelectedZ = selectedZ;
        }
        if (hoveredZ !== lastDomHoveredZ) {
          if (lastDomHoveredZ !== null) {
            var prevHovBtn = keyNodesByZ.get(lastDomHoveredZ);
            if (prevHovBtn) prevHovBtn.removeAttribute('data-hovered');
          }
          if (hoveredZ !== null) {
            var nextHovBtn = keyNodesByZ.get(hoveredZ);
            if (nextHovBtn) nextHovBtn.setAttribute('data-hovered', '1');
          }
          lastDomHoveredZ = hoveredZ;
        }

        var localSelAux = getLocalAuxIndex(selectedGlobalAuxIndex);
        if (
          localSelAux !== lastDomSelectedAuxLocal ||
          orchLatched !== lastDomOrchLatched ||
          lastDomAvailVersion !== availabilityDomVersion
        ) {
          lastDomSelectedAuxLocal = localSelAux;
          lastDomOrchLatched = orchLatched;
          lastDomAvailVersion = availabilityDomVersion;
          for (var ak = 0; ak < auxKeyNodes.length; ak += 1) {
            var auxBtn = auxKeyNodes[ak];
            var aSlot = auxSlots[ak];
            if (!auxBtn || !aSlot) continue;
            if (isGlobalOrchToggleSlot(aSlot._globalAuxIndex, aSlot)) {
              auxBtn.classList.remove('is-levitated');
              auxBtn.setAttribute('data-latched', orchLatched ? '1' : '0');
              if (aSlot.available) auxBtn.setAttribute('aria-pressed', orchLatched ? 'true' : 'false');
            } else {
              var isAuxSel = localSelAux === ak;
              if (isAuxSel) {
                auxBtn.classList.add('is-levitated');
                auxBtn.setAttribute('aria-pressed', 'true');
              } else {
                auxBtn.classList.remove('is-levitated');
                if (aSlot.available) auxBtn.setAttribute('aria-pressed', 'false');
              }
            }
          }
        }

        var hudSig = selectedZ + '|' + availabilityDomVersion + '|' + profile.id + '|' + (profile.isLight ? 'L' : 'D');
        if (hudSig !== lastDomHudSig) {
          lastDomHudSig = hudSig;
          hudChipByZ.forEach(function (chipObj, z) {
            var c = bentoUi.hudGemColorsForZ(z, profile);
            var isSel = z === selectedZ;
            var isAvailChip = availableByZ.has(z);
            setStyleVar(chipObj.dot, '--dot-bg', c.dot);
            setStyleVar(chipObj.dot, '--dot-glow', c.glow || c.ring);
            setStyleVar(chipObj.btn, '--chip-ring', c.ring);
            chipObj.btn.setAttribute('data-selected', isSel ? '1' : '0');
            chipObj.btn.setAttribute('data-available', isAvailChip ? '1' : '0');
            chipObj.btn.setAttribute('aria-pressed', isSel ? 'true' : 'false');
          });
        }

        var payload = buildCurrentDeckPayload(langCode);
        var dInfo = payload.deckInfo;
        var committed = resolveCommittedTelemetrySpec(zh);
        // 纯悬停扫键禁止同步读取宿主 DOM 遥测，直接复用缓存；首帧开放可选跳过 DOM 扫描
        var telemetry;
        if (hoverOnly) {
          telemetry = cachedHostTelemetry || { available: false, reason: 'offline' };
        } else if (optsObj && optsObj.deferTelemetryDomScan) {
          telemetry = hostBridge.readHostContextTelemetry(doc, root, { skipDomScan: true, anchorBtn: activeAnchorBtn });
          cachedHostTelemetry = telemetry;
        } else {
          telemetry = hostBridge.readHostContextTelemetry(doc, root, { anchorBtn: activeAnchorBtn });
          cachedHostTelemetry = telemetry;
        }

        bentoUi.syncBentoTwinCardsDom(bentoRefs, {
          doc: doc,
          root: root,
          overlayEl: overlayEl,
          bSpec: payload.bentoSpec,
          committed: committed,
          telemetry: telemetry,
          lang: langCode,
          zh: zh,
          profile: profile,
          stageMode: stageMode,
          muted: muted,
          cardFlipped: cardFlipped,
          compactExpanded: compactExpanded,
          orchLatched: orchLatched,
          auxPage: activeAuxPage,
          auxPageCount: auxPageCount,
          handlers: bentoRefs ? bentoRefs._handlers : null,
        });

        var nextSrTitle = dInfo.blindFlash && dInfo.blindFlashBanner ? dInfo.blindFlashBanner : dInfo.title;
        var bannerSig = (dInfo.sessionBanner || '') + '|' + nextSrTitle + '|' + dInfo.chemLabel + '|' + dInfo.subtitle;
        if (bannerSig !== lastDomBannerSig) {
          lastDomBannerSig = bannerSig;
          if (dInfo.sessionBanner) {
            uiRefs.bannerText.textContent = dInfo.sessionBanner;
            uiRefs.banner.setAttribute('data-show', '1');
          } else {
            uiRefs.bannerText.textContent = '';
            uiRefs.banner.setAttribute('data-show', '0');
          }
          uiRefs.srTitle.textContent = nextSrTitle;
          uiRefs.srChem.textContent = dInfo.chemLabel;
          uiRefs.srSub.textContent = dInfo.subtitle;
        }

        var effSig =
          (dInfo.isAuxModel ? 'aux:' + dInfo.globalAuxIndex : String(dInfo.z)) +
          ':' + (orchLatched ? 'orch' : 'solo') +
          '|' + dInfo.levels.map(function (l) { return l.effort + ':' + (l.active ? '1' : '0'); }).join(',');

        var effortLayoutChanged = false;
        if (uiRefs.lastEffortSig !== effSig) {
          var prevEffCount = uiRefs.effortButtons.length;
          uiRefs.lastEffortSig = effSig;
          if (!Array.isArray(uiRefs.effortButtonPool)) uiRefs.effortButtonPool = [];
          if (!uiRefs.effortTargetInfo) {
            uiRefs.effortTargetInfo = { isAuxModel: false, globalAuxIndex: null, z: null, effortTitle: '' };
          }
          uiRefs.effortTargetInfo.isAuxModel = Boolean(dInfo.isAuxModel);
          uiRefs.effortTargetInfo.globalAuxIndex =
            dInfo.globalAuxIndex !== undefined ? dInfo.globalAuxIndex : null;
          uiRefs.effortTargetInfo.z = dInfo.z;
          uiRefs.effortTargetInfo.effortTitle = dInfo.effortTitle || '';

          var effPool = uiRefs.effortButtonPool;
          uiRefs.effortButtons.length = 0;

          for (var li = 0; li < dInfo.levels.length; li += 1) {
            var lvl = dInfo.levels[li];
            var eBtn = effPool[li];
            if (!eBtn) {
              eBtn = mkEl(doc, 'button', 'ag-pp-hit-btn ag-pp-seg-btn', lvl.label);
              eBtn.type = 'button';
              (function (pooledBtn) {
                pooledBtn.addEventListener('focus', function () {
                  var ef = pooledBtn.getAttribute('data-effort');
                  if (ef && hoveredEffort !== ef) {
                    hoveredEffort = ef;
                    syncSceneAndDom(true, { hoverOnly: true, deferRender: true });
                  }
                });
                pooledBtn.addEventListener('blur', function () {
                  var ef = pooledBtn.getAttribute('data-effort');
                  if (ef && hoveredEffort === ef) {
                    hoveredEffort = null;
                    syncSceneAndDom(true, { hoverOnly: true, deferRender: true });
                  }
                });
                pooledBtn.addEventListener('click', function (ev) {
                  ev.stopPropagation();
                  if (hasPointerCoords(ev) && activeRenderer && typeof activeRenderer.pick === 'function') {
                    var picked = activeRenderer.pick(ev.clientX, ev.clientY);
                    if (picked) {
                      dispatchPickedTarget(picked);
                      return;
                    }
                  }
                  var ef = pooledBtn.getAttribute('data-effort');
                  if (!ef) return;
                  var tgt = uiRefs && uiRefs.effortTargetInfo ? uiRefs.effortTargetInfo : {};
                  if (tgt.isAuxModel && tgt.globalAuxIndex !== null && tgt.globalAuxIndex !== undefined) {
                    handleAuxEffortSelect(tgt.globalAuxIndex, ef);
                  } else {
                    handleEffortSelect(ef, tgt.z);
                  }
                });
              })(eBtn);
              hitLayerEl.appendChild(eBtn);
              effPool.push(eBtn);
              effortLayoutChanged = true;
            }
            if (eBtn.textContent !== lvl.label) eBtn.textContent = lvl.label;
            if (eBtn.getAttribute('data-ag-pp-effort') !== lvl.effort) {
              eBtn.setAttribute('data-ag-pp-effort', lvl.effort);
              effortLayoutChanged = true;
            }
            if (eBtn.getAttribute('data-effort') !== lvl.effort) {
              eBtn.setAttribute('data-effort', lvl.effort);
            }
            var eAct = lvl.active ? '1' : '0';
            if (eBtn.getAttribute('data-active') !== eAct) {
              eBtn.setAttribute('data-active', eAct);
              eBtn.setAttribute('aria-pressed', lvl.active ? 'true' : 'false');
            }
            var eAria = dInfo.effortTitle + ': ' + lvl.label;
            if (eBtn.getAttribute('aria-label') !== eAria) eBtn.setAttribute('aria-label', eAria);
            if (eBtn.hidden) {
              setStyleVar(eBtn, 'display', '');
              eBtn.hidden = false;
              eBtn.removeAttribute('aria-hidden');
              eBtn.removeAttribute('tabindex');
            }
            uiRefs.effortButtons.push(eBtn);
          }

          for (var xi = dInfo.levels.length; xi < effPool.length; xi += 1) {
            var unusedBtn = effPool[xi];
            if (!unusedBtn.hidden) {
              setStyleVar(unusedBtn, 'display', 'none');
              unusedBtn.hidden = true;
              unusedBtn.setAttribute('aria-hidden', 'true');
              unusedBtn.setAttribute('tabindex', '-1');
            }
            unusedBtn.setAttribute('data-active', '0');
            unusedBtn.setAttribute('aria-pressed', 'false');
            unusedBtn.removeAttribute('data-ag-pp-effort');
            unusedBtn.removeAttribute('data-effort');
          }
          if (uiRefs.effortButtons.length !== prevEffCount) effortLayoutChanged = true;
        }

        var rotFlagNow = getChassisOrbitSafe().isRotated ? '1' : '0';
        var ctrlSig = langCode + '|' + (muted ? '1' : '0') + '|' + rotFlagNow;
        if (ctrlSig !== lastDomCtrlSig) {
          lastDomCtrlSig = ctrlSig;
          if (uiRefs.resetBtn) {
            var resetLbl = pk.resetTitle;
            uiRefs.resetBtn.setAttribute('aria-label', resetLbl);
            uiRefs.resetBtn.title = resetLbl;
            if (uiRefs.resetLabel) uiRefs.resetLabel.textContent = pk.resetLbl;
            uiRefs.lastRotatedFlag = rotFlagNow;
            uiRefs.resetBtn.setAttribute('data-rotated', rotFlagNow);
          }
          if (uiRefs.muteBtn) {
            var muteLbl = muted ? pk.muteOn : pk.muteOff;
            uiRefs.muteBtn.setAttribute('data-muted', muted ? '1' : '0');
            uiRefs.muteBtn.setAttribute('aria-pressed', muted ? 'true' : 'false');
            uiRefs.muteBtn.setAttribute('aria-label', muteLbl);
            uiRefs.muteBtn.title = muteLbl;
          }
          if (uiRefs.closeBtn) {
            var closeLbl = pk.closeLbl;
            uiRefs.closeBtn.setAttribute('aria-label', closeLbl);
            uiRefs.closeBtn.title = closeLbl;
          }
        }

        var litTierCount = payload && payload.bentoSpec ? Number(payload.bentoSpec.litDots) || 2 : 2;
        var hardwareStatePayload = {
          muted: Boolean(muted),
          hoveredControl: hoveredBtn,
          pressedControl: pressedBtn,
          effortTier: Math.max(0, Math.min(3, litTierCount - 1)),
        };
        if (activeRenderer && typeof activeRenderer.setHardwareState === 'function') {
          try { activeRenderer.setHardwareState(hardwareStatePayload); } catch (e) {}
        }
        if (activeRenderer && typeof activeRenderer.setState === 'function') {
          try {
            var nextRendererState = {
              themeProfile: profile,
              stageMode: stageMode,
              paused: isHostPaused,
              orchLatched: Boolean(orchLatched),
              availableByZ: availableByZ,
              selectedZ: selectedZ,
              confirmSlamZ: confirmSlamZ,
              hoveredZ: hoveredZ,
              pressedZ: pressedZ,
              lockedShakeZ: lockedShakeZ,
              lockedShakeAuxIndex: lockedShakeAuxIndex,
              auxModels: auxSlots,
              auxPage: activeAuxPage,
              auxPageCount: auxPageCount,
              selectedAuxIndex: localSelAux,
              hoveredAuxIndex: hoveredAuxIndex,
              pressedAuxIndex: pressedAuxIndex,
              confirmSlamAuxIndex: confirmSlamAuxIndex,
              confirmSlamActive: Boolean(isConfirmClosing && (confirmSlamZ !== null || confirmSlamAuxIndex !== null)),
              deckInfo: dInfo,
              hardwareState: hardwareStatePayload,
              topControls: { muted: muted, hoveredBtn: hoveredBtn, pressedBtn: pressedBtn },
              reducedMotion: bentoUi.isReducedMotion(doc, root),
            };
            if (deferRender) {
              activeRenderer.setState(nextRendererState, { deferRender: true });
            } else {
              activeRenderer.setState(nextRendererState);
            }
          } catch (e2) {}
        }

        if (!isOrbitDragging) {
          if (!skipRectSync) {
            syncHitLayerRects(false);
          } else if (effortLayoutChanged && !hoverOnly) {
            syncEffortButtonRectsOnly();
          }
        }
      }

      function scheduleSettledRectSync() {
        if (!activeRenderer || isDestroyed || !overlayEl) return;
        scheduleTrackedTimer(function () {
          if (overlayEl && !isDestroyed && !isOrbitDragging) syncHitLayerRects(true);
        }, 180);
      }

      /* ── Clean Close / Confirm Actions (NO Host Model Rollback on Esc!) ── */

      function shouldAnimateDrawerCollapse() {
        if (isDestroyed || !overlayEl || stageMode !== 'drawer' || bentoUi.isReducedMotion(doc, root)) return false;
        return Boolean(root && typeof root.HTMLElement === 'function');
      }

      function collapseDrawerAndClose(closeOpts) {
        var co = closeOpts && typeof closeOpts === 'object' ? closeOpts : {};
        if (!overlayEl || isDestroyed) return;
        if (!shouldAnimateDrawerCollapse()) {
          close(co);
          return;
        }
        if (isDrawerClosing) return;
        clearTransientAsync();
        isDrawerClosing = true;
        clearLocalRimGlow();
        forwardPointerToRenderer(-9999, -9999, false);
        overlayEl.setAttribute('data-closing', '1');
        overlayEl.setAttribute('data-open', '0');
        drawerClosingTimer = scheduleTrackedTimer(function () {
          drawerClosingTimer = 0;
          if (!isDestroyed && overlayEl) close({ silent: true, fromAnimatedCollapse: true });
        }, DOCK_CLOSE_TRANSITION_MS);
      }

      function resolveConfirmSlamDelayMs() {
        if (
          isDestroyed ||
          !overlayEl ||
          (selectedZ === null && selectedGlobalAuxIndex === null) ||
          bentoUi.isReducedMotion(doc, root) ||
          !activeRenderer ||
          typeof activeRenderer.setState !== 'function'
        ) {
          return 0;
        }
        if (explicitConfirmSlamMs !== null) return explicitConfirmSlamMs;
        var isBrowserRuntime = Boolean(
          root && (typeof root.HTMLElement === 'function' || typeof root.WebGL2RenderingContext === 'function')
        );
        if (!isBrowserRuntime) return 0;
        if (typeof activeRenderer.getRendererMode === 'function') {
          var rMode = activeRenderer.getRendererMode();
          if (rMode !== 'webgl2' && rMode !== 'canvas2d') return 0;
        }
        return CONFIRM_SLAM_DELAY_MS;
      }

      function confirmAndClose() {
        if (isDestroyed || !overlayEl || isConfirmClosing || isDrawerClosing) return;
        playSound('slam');
        var slamDelay = resolveConfirmSlamDelayMs();
        if (slamDelay <= 0) {
          collapseDrawerAndClose();
          return;
        }
        isConfirmClosing = true;
        confirmSlamZ = selectedZ;
        confirmSlamAuxIndex = getLocalAuxIndex(selectedGlobalAuxIndex);
        cancelBlindDwellTimer();
        cancelBlindFlashTimer();
        inspectedBlindZ = null;
        inspectedBlindAuxIndex = null;
        blindFlashZ = null;
        extNearRendererActive = false;
        hoveredZ = null;
        hoveredAuxIndex = null;
        pressedZ = selectedZ;
        pressedAuxIndex = confirmSlamAuxIndex;
        hoveredEffort = null;
        pressedEffort = null;
        hoveredBtn = null;
        pressedBtn = null;
        lockedShakeZ = null;
        lockedShakeAuxIndex = null;
        lastPointerClient.x = -9999;
        lastPointerClient.y = -9999;
        lastPointerClient.active = false;
        clearLocalRimGlow();
        forwardPointerToRenderer(-9999, -9999, false);
        overlayEl.setAttribute('data-confirm-slam', '1');
        syncSceneAndDom(true);

        confirmCloseTimer = scheduleTrackedTimer(function () {
          confirmCloseTimer = 0;
          if (isDestroyed || !overlayEl) return;
          isConfirmClosing = false;
          collapseDrawerAndClose({ silent: true });
        }, slamDelay);
      }

      /* ── Keycap, Aux Pad Pagination, Knob & Hardware Control Actions ────── */

      function setAuxPageAction(nextPage) {
        if (isDestroyed || isConfirmClosing || isDrawerClosing) return activeAuxPage;
        var clamped = Math.max(0, Math.min(Math.max(0, auxPageCount - 1), Math.floor(Number(nextPage) || 0)));
        if (clamped === activeAuxPage) return activeAuxPage;
        activeAuxPage = clamped;
        hoveredAuxIndex = null;
        pressedAuxIndex = null;
        inspectedBlindAuxIndex = null;
        lockedShakeAuxIndex = null;
        rebuildAuxPageSlice();
        syncHitButtonsAvailabilityDom();
        playSound('step', activeAuxPage % 6);
        syncSceneAndDom(true);
        scheduleSettledRectSync();
        return activeAuxPage;
      }

      function stepActiveEffortByDelta(deltaSteps) {
        if (isConfirmClosing || isDrawerClosing || !overlayEl) return false;
        var rawSteps = Math.trunc(Number(deltaSteps) || 0);
        if (rawSteps === 0) rawSteps = deltaSteps >= 0 ? 1 : -1;
        var dir = rawSteps >= 0 ? 1 : -1;
        var clampedDelta = Math.max(-4, Math.min(4, rawSteps));
        var curDeck = buildCurrentDeckPayload(resolveCurrentLang());
        var levels = curDeck && curDeck.bentoSpec && Array.isArray(curDeck.bentoSpec.levels) ? curDeck.bentoSpec.levels : [];
        if (levels.length < 2) {
          if (activeRenderer && typeof activeRenderer.rotateKnobStep === 'function') {
            try { activeRenderer.rotateKnobStep(dir); } catch (e) {}
          }
          playSound('ratchet', 1);
          return false;
        }
        var curIdx = 0;
        for (var i = 0; i < levels.length; i += 1) {
          if (levels[i].active) { curIdx = i; break; }
        }
        var nextIdx = Math.max(0, Math.min(levels.length - 1, curIdx + clampedDelta));
        if (activeRenderer && typeof activeRenderer.rotateKnobStep === 'function') {
          try { activeRenderer.rotateKnobStep(clampedDelta); } catch (e2) {}
        }
        if (nextIdx === curIdx) {
          playSound('ratchet', nextIdx);
          return false;
        }
        var targetEffort = levels[nextIdx].effort;
        if (curDeck.inspectKind === 'aux' && curDeck.globalAuxIndex !== null && curDeck.globalAuxIndex !== undefined) {
          handleAuxEffortSelect(curDeck.globalAuxIndex, targetEffort, 'ratchet');
        } else if (curDeck.slot) {
          handleEffortSelect(targetEffort, curDeck.slot.z, 'ratchet');
        } else {
          handleEffortSelect(targetEffort, null, 'ratchet');
        }
        return true;
      }

      function handleAvailableKeyClick(slotZ) {
        if (isConfirmClosing || isDrawerClosing) return;
        var entry = availableByZ.get(slotZ);
        if (!entry) {
          triggerBlindKeyFeedback(slotZ);
          return;
        }
        if (selectedZ === slotZ && selectedGlobalAuxIndex === null) {
          confirmAndClose();
          return;
        }
        cancelBlindDwellTimer();
        cancelBlindFlashTimer();
        inspectedBlindZ = null;
        inspectedBlindAuxIndex = null;
        blindFlashZ = null;
        extNearRendererActive = false;
        var chosen = resolveLevelForElementWithMemory(entry, '');
        selectedZ = slotZ;
        selectedGlobalAuxIndex = null;
        confirmSlamAuxIndex = null;
        if (chosen) activeEffortByZ.set(slotZ, chosen.effort);
        syncHostWithActiveState();
        playSound('lift');
        syncSceneAndDom(true);
        if (activeRenderer && !bentoUi.isReducedMotion(doc, root) && typeof activeRenderer.triggerWaveRipple === 'function') {
          try { activeRenderer.triggerWaveRipple(slotZ, 1.0); } catch (e) {}
        }
        if (lastPointerClient.active) forwardPointerToRenderer(lastPointerClient.x, lastPointerClient.y, true);
        scheduleSettledRectSync();
      }

      function triggerBlindAuxKeyFeedback(localAuxIdx) {
        if (isConfirmClosing || isDrawerClosing) return;
        cancelBlindDwellTimer();
        cancelBlindFlashTimer();
        blindFlashZ = null;
        hoveredAuxIndex = localAuxIdx;
        inspectedBlindAuxIndex = localAuxIdx;
        playSound('lock');
        var btn = auxKeyNodes[localAuxIdx];
        if (btn) btn.classList.remove('is-locked-shake');

        lockedShakeAuxIndex = { auxIndex: localAuxIdx, progress: 0.25 };
        syncSceneAndDom(true);

        scheduleTrackedTimer(function () {
          if (isDestroyed || !overlayEl || isConfirmClosing || isDrawerClosing) return;
          if (btn) btn.classList.add('is-locked-shake');
          lockedShakeAuxIndex = { auxIndex: localAuxIdx, progress: 0.65 };
          syncSceneAndDom(true);
        }, 45);

        scheduleTrackedTimer(function () {
          if (btn) btn.classList.remove('is-locked-shake');
          lockedShakeAuxIndex = null;
          if (!isDestroyed && overlayEl && !isConfirmClosing && !isDrawerClosing) syncSceneAndDom(true);
        }, 155);
      }

      function handleAuxKeyClick(localAuxIdx) {
        if (isConfirmClosing || isDrawerClosing) return;
        var slot = auxSlots[localAuxIdx];
        if (!slot) return;
        var globalIdx = slot._globalAuxIndex;

        if (isGlobalOrchToggleSlot(globalIdx, slot)) {
          if (!slot.available) {
            triggerBlindAuxKeyFeedback(localAuxIdx);
            return;
          }
          cancelBlindDwellTimer();
          cancelBlindFlashTimer();
          blindFlashZ = null;
          inspectedBlindZ = null;
          inspectedBlindAuxIndex = null;
          lockedShakeZ = null;
          lockedShakeAuxIndex = null;

          orchLatched = !orchLatched;
          recomputeEffectiveAvailability();
          if (orchLatched) {
            ensureValidPlannerSelectedForOrch();
            syncHostWithActiveState();
            playSound('orch-latch');
            if (activeRenderer && !bentoUi.isReducedMotion(doc, root)) {
              if (typeof activeRenderer.triggerWaveRipple === 'function') {
                try { activeRenderer.triggerWaveRipple('aux:0', 0.9); } catch (e) {}
              }
              if (typeof activeRenderer.triggerEnergyPulse === 'function') {
                try { activeRenderer.triggerEnergyPulse(1.0); } catch (e2) {}
              }
            }
          } else {
            syncHostWithActiveState();
            playSound('orch-unlatch');
            if (activeRenderer && !bentoUi.isReducedMotion(doc, root) && typeof activeRenderer.triggerWaveRipple === 'function') {
              try { activeRenderer.triggerWaveRipple('aux:0', 0.65); } catch (e3) {}
            }
          }
          syncSceneAndDom(true);
          if (lastPointerClient.active) forwardPointerToRenderer(lastPointerClient.x, lastPointerClient.y, true);
          scheduleSettledRectSync();
          return;
        }

        if (!slot.available || globalIdx < 0) {
          triggerBlindAuxKeyFeedback(localAuxIdx);
          return;
        }
        if (selectedGlobalAuxIndex === globalIdx && selectedZ === null) {
          confirmAndClose();
          return;
        }
        cancelBlindDwellTimer();
        cancelBlindFlashTimer();
        inspectedBlindZ = null;
        inspectedBlindAuxIndex = null;
        blindFlashZ = null;
        extNearRendererActive = false;
        selectedZ = null;
        confirmSlamZ = null;
        selectedGlobalAuxIndex = globalIdx;
        var chosenAux = resolveLevelForAuxWithMemory(slot, globalIdx, '');
        if (chosenAux) activeEffortByGlobalAux.set(globalIdx, chosenAux.effort);
        syncHostWithActiveState();
        playSound('lift');
        syncSceneAndDom(true);
        if (activeRenderer && !bentoUi.isReducedMotion(doc, root) && typeof activeRenderer.triggerEnergyPulse === 'function') {
          try { activeRenderer.triggerEnergyPulse(0.82); } catch (e4) {}
        }
        if (lastPointerClient.active) forwardPointerToRenderer(lastPointerClient.x, lastPointerClient.y, true);
        scheduleSettledRectSync();
      }

      function triggerBlindKeyFeedback(slotZ) {
        if (isConfirmClosing || isDrawerClosing) return;
        cancelBlindDwellTimer();
        cancelBlindFlashTimer();

        if (orchLatched && fullAvailableByZ.has(slotZ)) {
          blindFlashZ = null;
          hoveredZ = slotZ;
          inspectedBlindZ = slotZ;
          playSound('lock');
          var lockBtn = keyNodesByZ.get(slotZ);
          if (lockBtn) lockBtn.classList.remove('is-locked-shake');
          lockedShakeZ = { z: slotZ, progress: 0.25 };
          syncSceneAndDom(true);
          scheduleTrackedTimer(function () {
            if (isDestroyed || !overlayEl || isConfirmClosing || isDrawerClosing) return;
            if (lockBtn) lockBtn.classList.add('is-locked-shake');
            lockedShakeZ = { z: slotZ, progress: 0.65 };
            syncSceneAndDom(true);
          }, 45);
          scheduleTrackedTimer(function () {
            if (lockBtn) lockBtn.classList.remove('is-locked-shake');
            lockedShakeZ = null;
            if (!isDestroyed && overlayEl && !isConfirmClosing && !isDrawerClosing) syncSceneAndDom(true);
          }, 155);
          return;
        }

        blindFlashZ = slotZ;
        playSound('fidget');
        if (activeRenderer && typeof activeRenderer.triggerBlindKeyPress === 'function') {
          try { activeRenderer.triggerBlindKeyPress(slotZ); } catch (e) {}
        }
        syncSceneAndDom(true);
        var flashedZ = slotZ;
        blindFlashTimer = scheduleTrackedTimer(function () {
          blindFlashTimer = 0;
          if (blindFlashZ === flashedZ) blindFlashZ = null;
          if (!isDestroyed && overlayEl && !isConfirmClosing && !isDrawerClosing) syncSceneAndDom(true);
        }, BLIND_FLASH_DURATION_MS);
      }

      function resetOrbitViewAction(fromHardwareControl) {
        if (isConfirmClosing || isDrawerClosing || !overlayEl) return false;
        var beforeOrbit = getChassisOrbitSafe();
        pendingServoOrbit = null;
        var didReset = false;
        if (activeRenderer) {
          if (bentoUi.isReducedMotion(doc, root) && typeof activeRenderer.setChassisOrbit === 'function') {
            try { activeRenderer.setChassisOrbit(0, 0); didReset = true; } catch (e) {}
          } else if (typeof activeRenderer.resetChassisOrbit === 'function') {
            try { activeRenderer.resetChassisOrbit(); didReset = true; } catch (e2) {}
          } else if (typeof activeRenderer.setChassisOrbit === 'function') {
            try { activeRenderer.setChassisOrbit(0, 0); didReset = true; } catch (e3) {}
          }
        }
        if (beforeOrbit.isRotated || didReset || fromHardwareControl) playSound('reset');
        syncHitLayerRects(true);
        if (didReset && !bentoUi.isReducedMotion(doc, root)) {
          stopOrbitFollowSync();
          startOrbitFollowSync();
        }
        return didReset;
      }

      function isFlexColumnContainer(el) {
        if (!el || typeof el !== 'object') return false;
        if (el.classList && typeof el.classList.contains === 'function' && el.classList.contains('flex-col')) return true;
        if (typeof el.className === 'string' && /\bflex-col\b/.test(el.className)) return true;
        if (el.style && el.style.flexDirection === 'column') return true;
        try {
          if (root && typeof root.getComputedStyle === 'function') {
            var cs = root.getComputedStyle(el);
            if (cs && String(cs.display).indexOf('flex') !== -1 && cs.flexDirection === 'column') return true;
          }
        } catch (e) {}
        return false;
      }

      function resolveDrawerMountHost(docRef, triggerEl) {
        if (!docRef) return { host: null, inFlow: false };
        try {
          var effectiveTrigger =
            (triggerEl && isNodeConnectedToDoc(docRef, triggerEl) ? triggerEl : null) ||
            hostBridge.findFallbackModelTrigger(docRef, triggerEl);
          var convEl =
            (effectiveTrigger && typeof effectiveTrigger.closest === 'function' && effectiveTrigger.closest('[data-testid="conversation-view"]')) ||
            (typeof docRef.querySelector === 'function' ? docRef.querySelector('[data-testid="conversation-view"]') : null);
          if (convEl && typeof convEl.appendChild === 'function') return { host: convEl, inFlow: true };
          var inputBox =
            (effectiveTrigger && typeof effectiveTrigger.closest === 'function' && effectiveTrigger.closest('[data-testid="agent-input-box"]')) ||
            (typeof docRef.querySelector === 'function' ? docRef.querySelector('[data-testid="agent-input-box"]') : null);
          if (inputBox) {
            var cur = inputBox.parentElement;
            var guard = 0;
            while (cur && cur !== docRef.body && cur !== docRef.documentElement && guard < 12) {
              if (isFlexColumnContainer(cur) && typeof cur.appendChild === 'function') return { host: cur, inFlow: true };
              cur = cur.parentElement;
              guard += 1;
            }
          }
        } catch (e) {}
        return { host: docRef.body, inFlow: false };
      }

      function findNearBottomScrollContainer(hostEl) {
        if (!hostEl || typeof hostEl.querySelectorAll !== 'function') return null;
        try {
          /* Strictly query explicit scroll containers only — never scan every <div> in a long chat thread */
          var candidates = hostEl.querySelectorAll(
            '.ag-chat-stream, [data-testid*="scroll"], [role="log"], [class*="overflow-y-auto"], [class*="overflow-auto"], [class*="overflow-y-scroll"]'
          );
          var limit = Math.min(candidates.length, 24);
          for (var i = 0; i < limit; i += 1) {
            var el = candidates[i];
            if (!el || (overlayEl && (el === overlayEl || (typeof overlayEl.contains === 'function' && overlayEl.contains(el))))) continue;
            var sh = Number(el.scrollHeight) || 0;
            var ch = Number(el.clientHeight) || 0;
            var st = Number(el.scrollTop) || 0;
            if (sh > ch + 4 && sh - st - ch <= 72) return el;
          }
        } catch (e) {}
        return null;
      }

      function getStageModeAction() { return stageMode; }

      function setStageModeAction(nextStageMode) {
        if (isDestroyed || isDrawerClosing) return stageMode;
        var prevMode = stageMode;
        stageMode = nextStageMode === 'fullscreen' ? 'fullscreen' : 'drawer';
        if (!overlayEl) return stageMode;

        overlayEl.setAttribute('data-stage-mode', stageMode);
        if (stageMode === 'fullscreen') {
          overlayEl.setAttribute('aria-modal', 'true');
          overlayEl.removeAttribute('data-in-flow');
          overlayEl.setAttribute('data-dock-compact', '0');
          overlayEl.setAttribute('data-compact-expanded', '0');
          if (doc && doc.body && overlayEl.parentNode !== doc.body) doc.body.appendChild(overlayEl);
          overlayEl.setAttribute('data-open', '1');
        } else if (prevMode === 'fullscreen' && stageMode === 'drawer') {
          if (isOrbitDragging) {
            isOrbitDragging = false;
            gestureState = null;
            overlayEl.removeAttribute('data-orbit-dragging');
            if (activeRenderer && typeof activeRenderer.endChassisOrbitDrag === 'function') {
              try { activeRenderer.endChassisOrbitDrag(0, 0); } catch (e) {}
            }
          }
          if (getChassisOrbitSafe().isRotated || pendingServoOrbit) resetOrbitViewAction(false);
          overlayEl.setAttribute('aria-modal', 'false');
          var mountDest = resolveDrawerMountHost(doc, activeAnchorBtn);
          overlayEl.setAttribute('data-in-flow', mountDest.inFlow ? '1' : '0');
          if (mountDest.host && overlayEl.parentNode !== mountDest.host) mountDest.host.appendChild(overlayEl);
          overlayEl.setAttribute('data-open', '1');
        }

        if (prevMode !== stageMode) playSound('step', stageMode === 'fullscreen' ? 3 : 1);
        refreshCachedLayoutRects();
        syncDockCompactState();
        resizeCanvasToStage();
        syncSceneAndDom(true);
        if (!isOrbitDragging) syncHitLayerRects(true);

        if (reqRaf) {
          if (modeLayoutRafId && cancelRaf) cancelRaf(modeLayoutRafId);
          modeLayoutRafId = reqRaf(function () {
            modeLayoutRafId = 0;
            if (overlayEl && !isDestroyed) {
              refreshCachedLayoutRects();
              syncDockCompactState();
              resizeCanvasToStage();
              if (!isOrbitDragging) syncHitLayerRects(true);
            }
          });
        }
        return stageMode;
      }

      function toggleStageModeAction() { return setStageModeAction(stageMode === 'drawer' ? 'fullscreen' : 'drawer'); }

      function toggleCardFlipAction() {
        if (isConfirmClosing || isDrawerClosing || !overlayEl) return false;
        cardFlipped = !cardFlipped;
        playSound('step', cardFlipped ? 3 : 1);
        syncSceneAndDom(true);
        return cardFlipped;
      }

      function toggleCompactExpandAction() {
        if (isConfirmClosing || isDrawerClosing || !overlayEl) return false;
        compactExpanded = !compactExpanded;
        playSound('step', compactExpanded ? 2 : 0);
        syncSceneAndDom(true);
        return compactExpanded;
      }

      function toggleMuteAction() {
        if (isConfirmClosing || isDrawerClosing) return;
        muted = audioEngine ? audioEngine.toggleMuted(true) : !muted;
        if (!audioEngine && typeof audioFx.writeMutedPref === 'function') audioFx.writeMutedPref(root, muted);
        if (!muted) playSound('step', 2);
        syncSceneAndDom(true);
      }

      function triggerPrismWaveAction() {
        if (isConfirmClosing || isDrawerClosing || !overlayEl) return false;
        playSound('prism-wave');
        if (activeRenderer) {
          if (typeof activeRenderer.triggerControlPress === 'function') {
            try { activeRenderer.triggerControlPress('prism-wave'); } catch (e) {}
          }
          if (!bentoUi.isReducedMotion(doc, root) && typeof activeRenderer.triggerWaveRipple === 'function') {
            try { activeRenderer.triggerWaveRipple('prism-wave', 1.15); } catch (e2) {}
          }
        }
        syncHitLayerRects(true);
        return true;
      }

      function dispatchPickedTarget(picked) {
        if (isConfirmClosing || isDrawerClosing) return;
        if (!picked) {
          if (stageMode === 'fullscreen') confirmAndClose();
          return;
        }
        if (picked.kind === 'chassis') return;
        if (picked.kind === 'aux-key') {
          var auxIdx = picked.auxIndex !== undefined ? picked.auxIndex : picked.slotIndex;
          if (Number.isFinite(auxIdx)) handleAuxKeyClick(auxIdx);
          return;
        }
        if (picked.kind === 'key') {
          var kz = picked.slotZ || picked.z;
          if (availableByZ.has(kz)) handleAvailableKeyClick(kz);
          else triggerBlindKeyFeedback(kz);
          return;
        }
        if (picked.kind === 'effort') {
          var curDeck = buildCurrentDeckPayload(resolveCurrentLang());
          if (curDeck.inspectKind === 'aux' && curDeck.globalAuxIndex !== null && curDeck.globalAuxIndex !== undefined) {
            handleAuxEffortSelect(curDeck.globalAuxIndex, picked.effort);
          } else {
            handleEffortSelect(picked.effort);
          }
          return;
        }
        if (picked.kind === 'control') {
          var ctrlAction = resolvePickedControlAction(picked);
          if (ctrlAction === 'prism-wave') {
            triggerPrismWaveAction();
          } else if (ctrlAction === 'reset-view' || ctrlAction === 'reset') {
            if (activeRenderer && typeof activeRenderer.triggerControlPress === 'function') {
              try { activeRenderer.triggerControlPress('reset-view'); } catch (e) {}
            }
            resetOrbitViewAction(true);
          } else if (ctrlAction === 'mute') {
            toggleMuteAction();
            if (activeRenderer && typeof activeRenderer.triggerControlPress === 'function') {
              try { activeRenderer.triggerControlPress('mute'); } catch (e2) {}
            }
          } else if (ctrlAction === 'close') {
            if (activeRenderer && typeof activeRenderer.triggerControlPress === 'function') {
              try { activeRenderer.triggerControlPress('close'); } catch (e3) {}
            }
            confirmAndClose();
          }
        }
      }

      /* ── Selection State Sync from Host Context (+ Auto Aux Page Locate) ─ */

      function syncSelectionStateFromHostCtx(hostCtxObj) {
        var curOption = hostCtxObj && hostCtxObj.selectedModel ? hostCtxObj.selectedModel : null;
        fullAvailableEntries = hostCtxObj
          ? catalog.matchGoogleElementModels(hostCtxObj.modelOptions, hostCtxObj.effortIndex)
          : [];
        fullAvailableByZ = fullAvailableEntries.byZ || new Map();
        fullAuxSlots = catalog.matchHostAuxModels(
          hostCtxObj ? hostCtxObj.modelOptions : null,
          hostCtxObj ? hostCtxObj.effortIndex : null,
          hostCtxObj ? hostCtxObj.orchestratorPlanners : null,
          { zh: bentoUi.isZhLocale(doc, root) }
        );
        orchRegistry = buildOrchestratorRegistry(hostCtxObj);

        orchLatched = false;
        selectedZ = null;
        selectedGlobalAuxIndex = null;

        if (curOption) {
          var initParsed = catalog.parseElementModelLabel(curOption);
          if (initParsed && fullAvailableByZ.has(initParsed.slotZ)) {
            selectedZ = initParsed.slotZ;
            var initNormEff = normalizeEffortCode(initParsed.effort);
            if (initNormEff) {
              activeEffortByZ.set(initParsed.slotZ, initNormEff);
              var initElEntry = fullAvailableByZ.get(initParsed.slotZ);
              if (initElEntry && typeof hostBridge.writeSharedEffortMemory === 'function') {
                hostBridge.writeSharedEffortMemory(
                  root,
                  doc,
                  initElEntry.baseName || initElEntry.name,
                  initNormEff,
                  false
                );
              }
            }
          } else {
            var initAuxCls = catalog.classifyNonElementOption(curOption, '');
            if (initAuxCls && initAuxCls.groupKey === 'orchestrator' && (!orchRegistry || orchRegistry.latchCapable)) {
              orchLatched = true;
            } else {
              for (var ai = 0; ai < fullAuxSlots.length; ai += 1) {
                var aCandidate = fullAuxSlots[ai];
                if (!aCandidate || !aCandidate.available) continue;
                var labelMatched = false;
                if (Array.isArray(aCandidate.allOptions)) {
                  for (var oi = 0; oi < aCandidate.allOptions.length; oi += 1) {
                    if (aCandidate.allOptions[oi] && aCandidate.allOptions[oi].label === curOption.label) {
                      labelMatched = true;
                      break;
                    }
                  }
                }
                if (labelMatched || (initAuxCls && aCandidate.id === initAuxCls.groupKey)) {
                  selectedGlobalAuxIndex = ai;
                  if (initAuxCls && initAuxCls.variantEffort) {
                    var initAuxNormEff = normalizeEffortCode(initAuxCls.variantEffort);
                    if (initAuxNormEff) {
                      activeEffortByGlobalAux.set(ai, initAuxNormEff);
                      if (aCandidate.id !== 'orchestrator' && typeof hostBridge.writeSharedEffortMemory === 'function') {
                        hostBridge.writeSharedEffortMemory(
                          root,
                          doc,
                          aCandidate.title || aCandidate.shortLabel,
                          initAuxNormEff,
                          false
                        );
                      }
                    }
                  }
                  break;
                }
              }
            }
          }
        }

        recomputeEffectiveAvailability();
        if (orchLatched) {
          ensureValidPlannerSelectedForOrch(curOption);
        }

        /* Auto-flip 2x3 Aux Pad page if active non-element model lives on page 2+ */
        if (selectedGlobalAuxIndex !== null && effectiveAuxAll[selectedGlobalAuxIndex]) {
          var selAuxObj = effectiveAuxAll[selectedGlobalAuxIndex];
          var targetPage =
            typeof catalog.findAuxPageForId === 'function'
              ? catalog.findAuxPageForId(effectiveAuxAll, selAuxObj.id)
              : Math.floor(selectedGlobalAuxIndex / AUX_PAGE_SIZE);
          if (targetPage >= 0 && targetPage !== activeAuxPage) {
            activeAuxPage = targetPage;
            rebuildAuxPageSlice();
            syncHitButtonsAvailabilityDom();
          }
        } else if (activeAuxPage >= auxPageCount) {
          activeAuxPage = 0;
          rebuildAuxPageSlice();
          syncHitButtonsAvailabilityDom();
        }
      }

      /* ── Pain Point #1: Open-Only Live Session Sync (80ms Debounce) ────── */

      function showOledSessionSyncedBadge(label, durationMs) {
        var dur = Number(durationMs) || SESSION_BADGE_DURATION_MS;
        if (activeRenderer && typeof activeRenderer.showSessionSyncedBadge === 'function') {
          try { activeRenderer.showSessionSyncedBadge(label, dur); return true; } catch (e) {}
        }
        if (activeRenderer && activeRenderer.oledPainter && typeof activeRenderer.oledPainter.showSessionSyncedBadge === 'function') {
          try { activeRenderer.oledPainter.showSessionSyncedBadge(label, dur); return true; } catch (e2) {}
        }
        return false;
      }

      function attachLocalSessionTriggerObserver() {
        if (sessionTriggerObserver) {
          try { sessionTriggerObserver.disconnect(); } catch (e) {}
          sessionTriggerObserver = null;
        }
        if (!overlayEl || isDestroyed || !doc) return;
        var ObsCtor = (root && root.MutationObserver) || (typeof MutationObserver === 'function' ? MutationObserver : null);
        if (!ObsCtor) return;

        var targetNode = null;
        if (activeAnchorBtn && isNodeConnectedToDoc(doc, activeAnchorBtn)) {
          var inputAncestor =
            typeof activeAnchorBtn.closest === 'function'
              ? activeAnchorBtn.closest('[data-testid="agent-input-box"]')
              : null;
          targetNode = inputAncestor || activeAnchorBtn;
        } else {
          var liveOverlayHint = overlayEl && isNodeConnectedToDoc(doc, overlayEl) ? overlayEl : null;
          var fbTrig = hostBridge.findFallbackModelTrigger(doc, liveOverlayHint);
          targetNode =
            (fbTrig && typeof fbTrig.closest === 'function' && fbTrig.closest('[data-testid="agent-input-box"]')) ||
            fbTrig ||
            (typeof doc.querySelector === 'function'
              ? doc.querySelector('[data-testid="agent-input-box"]') ||
                doc.querySelector('[data-testid="model-selector-trigger"]')
              : null);
        }
        /* Strictly forbid observing document.body or documentElement here */
        if (!targetNode || targetNode === doc.body || targetNode === doc.documentElement) return;

        sessionTriggerObserver = new ObsCtor(function (mutations) {
          if (isMutatingBadge || isDestroyed || !overlayEl || isDrawerClosing) return;
          for (var i = 0; i < mutations.length; i += 1) {
            var m = mutations[i];
            if (!m || !m.target) continue;
            if (hostBridge.isOwnedDecorationNode(m.target)) continue;
            if (m.target.parentElement && hostBridge.isOwnedDecorationNode(m.target.parentElement)) continue;
            if (overlayEl && (m.target === overlayEl || (typeof overlayEl.contains === 'function' && overlayEl.contains(m.target)))) {
              continue;
            }
            var liveTrigger =
              (activeAnchorBtn && isNodeConnectedToDoc(doc, activeAnchorBtn) ? activeAnchorBtn : null) ||
              hostBridge.findFallbackModelTrigger(doc);
            if (isHostModelTriggerLocked(liveTrigger)) {
              cancelHold(false);
              collapseDrawerAndClose();
              return;
            }
            scheduleSessionSync(SESSION_SYNC_DEBOUNCE_MS);
            return;
          }
        });
        try {
          sessionTriggerObserver.observe(targetNode, {
            childList: true,
            characterData: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['disabled', 'aria-disabled', 'data-disabled', 'data-model-label'],
          });
        } catch (e2) {
          sessionTriggerObserver = null;
        }
      }

      function detachOpenSessionSyncWatchers() {
        clearSessionSyncTimer();
        clearSessionSyncFollowupTimer();
        clearOpenLockGuardTimer();
        if (sessionTriggerObserver) {
          try { sessionTriggerObserver.disconnect(); } catch (e) {}
          sessionTriggerObserver = null;
        }
        if (doc && typeof doc.removeEventListener === 'function') {
          for (var di = 0; di < openSessionDocListeners.length; di += 1) {
            doc.removeEventListener(
              openSessionDocListeners[di][0],
              openSessionDocListeners[di][1],
              openSessionDocListeners[di][2]
            );
          }
        }
        openSessionDocListeners.length = 0;
        if (root && typeof root.removeEventListener === 'function') {
          for (var i = 0; i < openSessionWindowListeners.length; i += 1) {
            root.removeEventListener(openSessionWindowListeners[i][0], openSessionWindowListeners[i][1], false);
          }
        }
        openSessionWindowListeners.length = 0;

        if (sessionHistoryPatched && root && root.history) {
          try {
            if (wrappedHistoryPushState && root.history.pushState === wrappedHistoryPushState) {
              root.history.pushState = origHistoryPushState;
            }
          } catch (e2) {}
          try {
            if (wrappedHistoryReplaceState && root.history.replaceState === wrappedHistoryReplaceState) {
              root.history.replaceState = origHistoryReplaceState;
            }
          } catch (e3) {}
        }
        sessionHistoryPatched = false;
        origHistoryPushState = null;
        origHistoryReplaceState = null;
        wrappedHistoryPushState = null;
        wrappedHistoryReplaceState = null;
      }

      function attachOpenSessionSyncWatchers() {
        detachOpenSessionSyncWatchers();
        if (!overlayEl || isDestroyed) return;

        var onRouteSignal = function () {
          scheduleSessionSync(SESSION_SYNC_DEBOUNCE_MS);
          scheduleSessionSyncFollowup(SESSION_SYNC_ROUTE_FOLLOWUP_MS);
        };
        var onOpenExternalClick = function (ev) {
          if (!overlayEl || isDestroyed || isDrawerClosing || isConfirmClosing || currentMode === 'off') return;
          if (ev && isTargetWithinNode(overlayEl, ev.target)) return;
          scheduleSessionSync(SESSION_SYNC_DEBOUNCE_MS);
          scheduleSessionSyncFollowup(SESSION_SYNC_CLICK_FOLLOWUP_MS);
        };
        if (doc && typeof doc.addEventListener === 'function') {
          doc.addEventListener('click', onOpenExternalClick, true);
          openSessionDocListeners.push(['click', onOpenExternalClick, true]);
        }
        if (root && typeof root.addEventListener === 'function') {
          root.addEventListener('popstate', onRouteSignal, false);
          root.addEventListener('hashchange', onRouteSignal, false);
          openSessionWindowListeners.push(['popstate', onRouteSignal], ['hashchange', onRouteSignal]);
        }
        if (root && root.history && typeof root.history === 'object') {
          try {
            if (typeof root.history.pushState === 'function') {
              origHistoryPushState = root.history.pushState;
              wrappedHistoryPushState = function () {
                var ret = origHistoryPushState.apply(this, arguments);
                onRouteSignal();
                return ret;
              };
              root.history.pushState = wrappedHistoryPushState;
              sessionHistoryPatched = true;
            }
            if (typeof root.history.replaceState === 'function') {
              origHistoryReplaceState = root.history.replaceState;
              wrappedHistoryReplaceState = function () {
                var ret = origHistoryReplaceState.apply(this, arguments);
                onRouteSignal();
                return ret;
              };
              root.history.replaceState = wrappedHistoryReplaceState;
              sessionHistoryPatched = true;
            }
          } catch (e) {}
        }
        if (setIntervalFn) {
          openLockGuardTimer = setIntervalFn(function () {
            if (!overlayEl || isDestroyed || isDrawerClosing || isConfirmClosing || currentMode === 'off') {
              clearOpenLockGuardTimer();
              return;
            }
            var liveOv1 = overlayEl && isNodeConnectedToDoc(doc, overlayEl) ? overlayEl : null;
            var probeTrigger =
              (activeAnchorBtn && isNodeConnectedToDoc(doc, activeAnchorBtn) ? activeAnchorBtn : null) ||
              hostBridge.findFallbackModelTrigger(doc, liveOv1);
            if (isHostModelTriggerLocked(probeTrigger)) {
              clearOpenLockGuardTimer();
              cancelHold(false);
              collapseDrawerAndClose();
            }
          }, OPEN_LOCK_GUARD_INTERVAL_MS);
        }
        attachLocalSessionTriggerObserver();
      }

      function runSessionSyncFromHost() {
        sessionSyncTimer = 0;
        if (!overlayEl || isDestroyed || isDrawerClosing || isConfirmClosing || currentMode === 'off') return false;

        /* Prefer current pane's activeAnchorBtn when still connected; re-discover within same pane or fallback after React session re-render */
        var connectedAnchor = activeAnchorBtn && isNodeConnectedToDoc(doc, activeAnchorBtn) ? activeAnchorBtn : null;
        var liveOv2 = overlayEl && isNodeConnectedToDoc(doc, overlayEl) ? overlayEl : null;
        var latestTrigger =
          connectedAnchor ||
          hostBridge.findFallbackModelTrigger(doc, liveOv2) ||
          hostBridge.findFallbackModelTrigger(doc);

        var triggerReplaced = Boolean(latestTrigger && latestTrigger !== activeAnchorBtn);
        if (latestTrigger) activeAnchorBtn = latestTrigger;

        /* Lock guard MUST run before re-docking or same-signature early return (e.g. switching to a running session with the same model) */
        if (isHostModelTriggerLocked(latestTrigger)) {
          cancelHold(false);
          collapseDrawerAndClose();
          return true;
        }

        /* Seamlessly re-dock in-flow drawer if conversation-view container was swapped */
        if (stageMode === 'drawer') {
          var mountDest = resolveDrawerMountHost(doc, latestTrigger);
          var overlayConnected = isNodeConnectedToDoc(doc, overlayEl);
          if (!overlayConnected || (mountDest.host && overlayEl.parentNode !== mountDest.host)) {
            overlayEl.setAttribute('data-in-flow', mountDest.inFlow ? '1' : '0');
            if (mountDest.host && typeof mountDest.host.appendChild === 'function') {
              mountDest.host.appendChild(overlayEl);
            }
            refreshCachedLayoutRects();
            syncDockCompactState();
            resizeCanvasToStage();
          }
        }
        if (triggerReplaced) {
          attachLocalSessionTriggerObserver();
        }

        var nextCtx = hostBridge.readHostModelContext(latestTrigger, root, doc);
        var nextSig = computeSessionContextSignature(nextCtx, latestTrigger);

        /* Same model / effort / planner -> ZERO redraw, ZERO wave ripple, ZERO OLED badge flash! */
        if (nextSig.fullSig === lastSessionSig.fullSig) {
          return false;
        }
        if (nextSig.modelSig === lastSessionSig.modelSig) {
          activeHostCtx = nextCtx;
          lastSessionSig = nextSig;
          return false;
        }

        /* Model / effort / planner changed on session switch -> smooth animated transition */
        activeHostCtx = nextCtx;
        lastSessionSig = nextSig;
        activeCommittedAuxBadge = null;
        activeCommittedElementZ = null;
        hoveredZ = null;
        hoveredAuxIndex = null;
        inspectedBlindZ = null;
        inspectedBlindAuxIndex = null;
        blindFlashZ = null;
        pressedZ = null;
        pressedAuxIndex = null;
        hoveredEffort = null;
        pressedEffort = null;
        lockedShakeZ = null;
        lockedShakeAuxIndex = null;

        syncSelectionStateFromHostCtx(activeHostCtx);
        overlayEl.setAttribute('data-orch-latched', orchLatched ? '1' : '0');
        syncSceneAndDom(true, { deferRender: true });
        syncMiniKeycapBadges();

        var langCode = resolveCurrentLang();
        var pk = getPpI18nPack(langCode);
        var localSelAux = getLocalAuxIndex(selectedGlobalAuxIndex);
        var rippleOrigin = selectedZ !== null ? selectedZ : localSelAux !== null ? 'aux:' + localSelAux : 'prism-wave';
        if (activeRenderer && !bentoUi.isReducedMotion(doc, root) && typeof activeRenderer.triggerWaveRipple === 'function') {
          try { activeRenderer.triggerWaveRipple(rippleOrigin, 0.92); } catch (e) {}
        }
        if (typeof bentoUi.triggerBentoSessionSwitchFade === 'function') {
          bentoUi.triggerBentoSessionSwitchFade(bentoRefs, doc, root);
        }
        showOledSessionSyncedBadge(pk.synced, SESSION_BADGE_DURATION_MS);
        scheduleSettledRectSync();
        return true;
      }

      function scheduleSessionSync(delayMs) {
        if (!overlayEl || isDestroyed || isDrawerClosing || isConfirmClosing || currentMode === 'off') return;
        clearSessionSyncTimer();
        sessionSyncTimer = setTimer(runSessionSyncFromHost, Math.max(0, Number(delayMs) || SESSION_SYNC_DEBOUNCE_MS));
      }

      function scheduleSessionSyncFollowup(delayMs) {
        if (!overlayEl || isDestroyed || isDrawerClosing || isConfirmClosing || currentMode === 'off') return;
        clearSessionSyncFollowupTimer();
        sessionSyncFollowupTimer = setTimer(function () {
          sessionSyncFollowupTimer = 0;
          runSessionSyncFromHost();
        }, Math.max(0, Number(delayMs) || SESSION_SYNC_CLICK_FOLLOWUP_MS));
      }

      /* Public host callback wired by ui-runtime.js: closed -> sync mini keycap, open -> 80ms debounced sync */
      function onHostTriggerChanged() {
        if (isDestroyed || currentMode === 'off') return;
        if (overlayEl && !isDrawerClosing) {
          var liveOv3 = overlayEl && isNodeConnectedToDoc(doc, overlayEl) ? overlayEl : null;
          var liveTrigger =
            (activeAnchorBtn && isNodeConnectedToDoc(doc, activeAnchorBtn) ? activeAnchorBtn : null) ||
            hostBridge.findFallbackModelTrigger(doc, liveOv3);
          if (isHostModelTriggerLocked(liveTrigger)) {
            cancelHold(false);
            collapseDrawerAndClose();
            return;
          }
          scheduleSessionSync(SESSION_SYNC_DEBOUNCE_MS);
          return;
        }
        if (activeAnchorBtn && !isNodeConnectedToDoc(doc, activeAnchorBtn)) {
          activeAnchorBtn = null;
          activeCommittedElementZ = null;
          activeCommittedAuxBadge = null;
        }
        scheduleBadgeSync(24);
      }

      /* ── High-Refresh Single-Frame rAF Pointer Move Coalescing ─────────── */

      function clearStageHoverAndPress() {
        if (isConfirmClosing || isDrawerClosing) return;
        cancelBlindDwellTimer();
        lastStageCursor = 'default';
        if (stageEl) setStyleVar(stageEl, 'cursor', 'default');
        if (canvasEl) setStyleVar(canvasEl, 'cursor', 'default');
        var hadHoverOrPress =
          hoveredZ !== null ||
          hoveredAuxIndex !== null ||
          inspectedBlindZ !== null ||
          inspectedBlindAuxIndex !== null ||
          pressedZ !== null ||
          pressedAuxIndex !== null ||
          hoveredEffort !== null ||
          pressedEffort !== null ||
          hoveredBtn !== null ||
          pressedBtn !== null;
        hoveredZ = null;
        hoveredAuxIndex = null;
        inspectedBlindZ = null;
        inspectedBlindAuxIndex = null;
        pressedZ = null;
        pressedAuxIndex = null;
        hoveredEffort = null;
        pressedEffort = null;
        hoveredBtn = null;
        pressedBtn = null;
        if (hadHoverOrPress) syncSceneAndDom(true, { hoverOnly: true, deferRender: true });
      }

      function isTargetInBentoOrHud(target) {
        if (!target) return false;
        return Boolean(
          (hudPillEl && typeof hudPillEl.contains === 'function' && hudPillEl.contains(target)) ||
            (bentoRefs && bentoRefs.rightWing && typeof bentoRefs.rightWing.contains === 'function' && bentoRefs.rightWing.contains(target)) ||
            (bentoRefs && bentoRefs.compactBar && typeof bentoRefs.compactBar.contains === 'function' && bentoRefs.compactBar.contains(target)) ||
            (bentoRefs && bentoRefs.grid && typeof bentoRefs.grid.contains === 'function' && bentoRefs.grid.contains(target))
        );
      }

      function flushPendingPointerMove() {
        pointerMoveRafId = 0;
        var pm = pendingPointerMove;
        pendingPointerMove = null;
        if (!pm || !overlayEl || isDestroyed || isConfirmClosing || isDrawerClosing || isHostPaused) return;

        var cx = pm.cx;
        var cy = pm.cy;
        if (
          cx === lastFlushedPointer.x &&
          cy === lastFlushedPointer.y &&
          pm.target === lastFlushedPointer.target &&
          pm.insideOverlay === lastFlushedPointer.inside
        ) {
          return;
        }
        lastFlushedPointer.x = cx;
        lastFlushedPointer.y = cy;
        lastFlushedPointer.target = pm.target;
        lastFlushedPointer.inside = pm.insideOverlay;

        if (!pm.insideOverlay) {
          var prox = updateDynamicPrismCssVars(cx, cy);
          if (prox && prox.extDockDist <= EXT_RIM_PROXIMITY_PX) {
            extNearRendererActive = true;
            forwardPointerToRenderer(cx, cy, true);
          } else if (extNearRendererActive) {
            extNearRendererActive = false;
            forwardPointerToRenderer(-9999, -9999, false);
          }
          return;
        }

        var coordsMoved = cx !== lastPointerClient.x || cy !== lastPointerClient.y || !lastPointerClient.active;
        lastPointerClient.x = cx;
        lastPointerClient.y = cy;
        lastPointerClient.active = true;
        extNearRendererActive = false;

        if (coordsMoved) {
          updateDynamicPrismCssVars(cx, cy);
          forwardPointerToRenderer(cx, cy, true);
        }

        if (isTargetInBentoOrHud(pm.target)) {
          clearStageHoverAndPress();
          return;
        }

        if (activeRenderer && typeof activeRenderer.pick === 'function') {
          var hitMove = activeRenderer.pick(cx, cy);
          var nextHovZ = hitMove && hitMove.kind === 'key' ? hitMove.slotZ || hitMove.z : null;
          var nextHovAux =
            hitMove && hitMove.kind === 'aux-key'
              ? (hitMove.auxIndex !== undefined ? hitMove.auxIndex : hitMove.slotIndex)
              : null;
          var nextHovEff = hitMove && hitMove.kind === 'effort' ? hitMove.effort : null;
          var nextHovBtn = resolvePickedControlAction(hitMove);

          var interactiveCursor =
            (hitMove && hitMove.kind === 'key' && availableByZ.has(nextHovZ)) ||
            (hitMove && hitMove.kind === 'aux-key' && Boolean(auxSlots[nextHovAux] && auxSlots[nextHovAux].available)) ||
            (hitMove && (hitMove.kind === 'effort' || hitMove.kind === 'control'));
          var cursorVal = interactiveCursor ? 'pointer' : 'default';
          if (lastStageCursor !== cursorVal) {
            lastStageCursor = cursorVal;
            setStyleVar(stageEl, 'cursor', cursorVal);
            setStyleVar(canvasEl, 'cursor', cursorVal);
          }

          if (
            nextHovZ !== hoveredZ ||
            nextHovAux !== hoveredAuxIndex ||
            nextHovEff !== hoveredEffort ||
            nextHovBtn !== hoveredBtn
          ) {
            var zChanged = nextHovZ !== hoveredZ;
            var auxChanged = nextHovAux !== hoveredAuxIndex;
            hoveredZ = nextHovZ;
            hoveredAuxIndex = nextHovAux;
            hoveredEffort = nextHovEff;
            hoveredBtn = nextHovBtn;

            if (zChanged || auxChanged) {
              cancelBlindDwellTimer();
              inspectedBlindZ = null;
              inspectedBlindAuxIndex = null;
              if (nextHovZ !== null && !availableByZ.has(nextHovZ)) {
                var targetBlindZ = nextHovZ;
                if (orchLatched && fullAvailableByZ.has(targetBlindZ)) {
                  inspectedBlindZ = targetBlindZ;
                } else if (blindFlashZ === null) {
                  blindDwellTimer = scheduleTrackedTimer(function () {
                    blindDwellTimer = 0;
                    if (isDestroyed || !overlayEl || isConfirmClosing || isDrawerClosing || blindFlashZ !== null || hoveredZ !== targetBlindZ) return;
                    inspectedBlindZ = targetBlindZ;
                    syncSceneAndDom(true, { hoverOnly: true, deferRender: true });
                  }, BLIND_HOVER_DWELL_MS);
                }
              } else if (nextHovAux !== null && auxSlots[nextHovAux] && !auxSlots[nextHovAux].available) {
                var targetBlindAux = nextHovAux;
                var targetBlindGlobal = auxSlots[targetBlindAux]._globalAuxIndex;
                var isOrchNonPlannerAux = Boolean(
                  orchLatched && targetBlindGlobal >= 0 && fullAuxSlots[targetBlindGlobal] && fullAuxSlots[targetBlindGlobal].available
                );
                if (isOrchNonPlannerAux) {
                  inspectedBlindAuxIndex = targetBlindAux;
                } else {
                  blindDwellTimer = scheduleTrackedTimer(function () {
                    blindDwellTimer = 0;
                    if (isDestroyed || !overlayEl || isConfirmClosing || isDrawerClosing || hoveredAuxIndex !== targetBlindAux) return;
                    inspectedBlindAuxIndex = targetBlindAux;
                    syncSceneAndDom(true, { hoverOnly: true, deferRender: true });
                  }, BLIND_HOVER_DWELL_MS);
                }
              }
            }
            syncSceneAndDom(true, { hoverOnly: true, deferRender: true });
          }
        }
      }

      function queueCoalescedPointerMove(cx, cy, target, insideOverlay) {
        pendingPointerMove = { cx: cx, cy: cy, target: target, insideOverlay: Boolean(insideOverlay) };
        if (!reqRaf) {
          flushPendingPointerMove();
          return;
        }
        if (!pointerMoveRafId) {
          pointerMoveRafId = reqRaf(flushPendingPointerMove);
        }
      }

      /* ── Open & Close Lifecycle ────────────────────────────────────────── */

      function bindCanvasClickHandler(targetCanvas) {
        if (!targetCanvas) return;
        targetCanvas.addEventListener('click', function (ev) {
          if (!overlayEl || isDestroyed || isConfirmClosing || isDrawerClosing) return;
          ev.stopPropagation();
          var clickX = Number(ev.clientX) || 0;
          var clickY = Number(ev.clientY) || 0;
          if (activeRenderer && typeof activeRenderer.pick === 'function') {
            var hit = activeRenderer.pick(clickX, clickY);
            if (!hit) {
              if (hasPointerCoords(ev) && isPointInEffortSliderBand(clickX, clickY)) {
                var bandRes = resolveEffortAlongSlider(clickX, clickY);
                if (bandRes.effort) {
                  var cDeck = buildCurrentDeckPayload(resolveCurrentLang());
                  if (cDeck.inspectKind === 'aux' && cDeck.globalAuxIndex !== null && cDeck.globalAuxIndex !== undefined) {
                    handleAuxEffortSelect(cDeck.globalAuxIndex, bandRes.effort);
                  } else {
                    handleEffortSelect(bandRes.effort);
                  }
                  return;
                }
              }
              if ((stageMode === 'fullscreen' && pointerDownOutside) || !hasPointerCoords(ev)) confirmAndClose();
              return;
            }
            dispatchPickedTarget(hit);
          }
        });
      }

      function rebuildHudSwatches(wrapEl, hudElements, profile) {
        if (!wrapEl) return;
        wrapEl.textContent = '';
        hudChipByZ.clear();
        for (var hi = 0; hi < hudElements.length; hi += 1) {
          (function (elEntry) {
            var ez = elEntry.slotZ || elEntry.z;
            var isAvailChip = availableByZ.has(ez);
            var chip = mkEl(doc, 'button', 'ag-pp-hud-chip ag-pp-sr-only');
            chip.type = 'button';
            chip.setAttribute('data-hud-z', String(ez));
            chip.setAttribute('data-ag-pp-swatch-z', String(ez));
            chip.setAttribute('data-available', isAvailChip ? '1' : '0');
            chip.setAttribute('data-selected', ez === selectedZ ? '1' : '0');
            chip.setAttribute('aria-pressed', ez === selectedZ ? 'true' : 'false');
            var dot = mkEl(doc, 'span', 'ag-pp-hud-dot');
            dot.setAttribute('aria-hidden', 'true');
            var cPal = bentoUi.hudGemColorsForZ(ez, profile);
            setStyleVar(dot, '--dot-bg', cPal.dot);
            setStyleVar(dot, '--dot-glow', cPal.glow || cPal.ring);
            setStyleVar(chip, '--chip-ring', cPal.ring);
            chip.appendChild(dot);
            chip.appendChild(mkEl(doc, 'span', 'ag-pp-chip-z', String(ez)));
            chip.appendChild(typeof doc.createTextNode === 'function' ? doc.createTextNode(' ') : mkEl(doc, 'span', '', ' '));
            chip.appendChild(mkEl(doc, 'span', 'ag-pp-chip-sym', elEntry.symbol));
            chip.addEventListener('click', function (ev) {
              ev.stopPropagation();
              if (availableByZ.has(ez)) handleAvailableKeyClick(ez);
              else triggerBlindKeyFeedback(ez);
            });
            hudChipByZ.set(ez, { btn: chip, dot: dot });
            wrapEl.appendChild(chip);
          })(hudElements[hi]);
        }
      }

      function computeHudElementsKey(hudElements) {
        var parts = [];
        for (var i = 0; i < hudElements.length; i += 1) {
          parts.push(String(hudElements[i].slotZ || hudElements[i].z));
        }
        return parts.join(',');
      }

      function open(anchorBtn) {
        if (isDestroyed || currentMode === 'off' || !doc || !doc.body) return false;
        var triggerEl =
          anchorBtn ||
          hostBridge.findFallbackModelTrigger(
            doc,
            activeAnchorBtn && isNodeConnectedToDoc(doc, activeAnchorBtn) ? activeAnchorBtn : null
          );
        if (isHostModelTriggerLocked(triggerEl)) {
          if (overlayEl) {
            close({ silent: true });
          }
          return false;
        }
        bentoUi.ensureStyles(doc);
        if (audioEngine && typeof audioEngine.rearm === 'function') audioEngine.rearm();
        lastStageCursor = '';
        rimGlowWasActive = false;
        rimDockWasActive = false;
        rimCardWasActive = false;
        rimRightWasActive = false;
        lastDockCompactSig = '';
        lastShadowPxStr = '';
        lastShadowPyStr = '';

        if (overlayEl) {
          close({ silent: true, preserveCaches: true });
        }

        activeAnchorBtn = triggerEl || null;
        activeHostCtx = hostBridge.readHostModelContext(triggerEl, root, doc);

        /* Suppress native Radix tooltip while open and prevent residual focus tooltip on trigger */
        if (typeof hostBridge.setHoldTooltipSuppression === 'function') {
          hostBridge.setHoldTooltipSuppression(doc, false, triggerEl);
        }
        if (typeof hostBridge.setOpenTooltipSuppression === 'function') {
          hostBridge.setOpenTooltipSuppression(doc, true);
        }
        try {
          if (triggerEl && typeof triggerEl.blur === 'function') triggerEl.blur();
        } catch (eBlur) {}

        cardFlipped = false;
        compactExpanded = false;
        activeAuxPage = 0;
        hoveredZ = null;
        hoveredAuxIndex = null;
        inspectedBlindZ = null;
        inspectedBlindAuxIndex = null;
        blindFlashZ = null;
        extNearRendererActive = false;
        pressedZ = null;
        pressedAuxIndex = null;
        hoveredEffort = null;
        pressedEffort = null;
        dragEffortProgress = null;
        hoveredBtn = null;
        pressedBtn = null;
        lockedShakeZ = null;
        lockedShakeAuxIndex = null;
        isConfirmClosing = false;
        isDrawerClosing = false;
        confirmSlamZ = null;
        confirmSlamAuxIndex = null;
        pointerDownOutside = false;
        isOrbitDragging = false;
        gestureState = null;
        pendingServoOrbit = null;
        suppressPostDragClickUntil = 0;
        lastPointerClient.x = -9999;
        lastPointerClient.y = -9999;
        lastPointerClient.active = false;
        lastFlushedPointer.x = NaN;
        lastFlushedPointer.y = NaN;
        lastFlushedPointer.target = null;
        lastFlushedPointer.inside = false;
        lastDomSelectedZ = undefined;
        lastDomHoveredZ = null;
        lastDomSelectedAuxLocal = undefined;
        lastDomOrchLatched = undefined;
        lastDomChromeSig = '';
        lastDomHaloSig = '';
        lastDomHudSig = '';
        lastDomCtrlSig = '';
        lastDomBannerSig = '';
        lastDomAvailVersion = -1;

        syncSelectionStateFromHostCtx(activeHostCtx);
        lastSessionSig = computeSessionContextSignature(activeHostCtx, activeAnchorBtn);

        var langCode = resolveCurrentLang();
        var zh = langCode === 'zh-CN' || langCode === 'zh-TW';
        var pk = getPpI18nPack(langCode);
        var profile = bentoUi.resolvePrismThemeProfile(doc, root);
        var hudElements = bentoUi.selectHudIslandElements(fullAvailableEntries, fullAvailableByZ);
        var nextHudKey = computeHudElementsKey(hudElements);
        activeHudElementsKey = nextHudKey;

        var reusedShell = Boolean(cachedShell && cachedShell.doc === doc && cachedShell.overlayEl);
        if (reusedShell) {
          // 复用离屏 501 节点 DOM 壳（仅替换 1 个全新 WebGL <canvas>），大幅削减热开同步开销
          var shell = cachedShell;
          cachedShell = null;
          overlayEl = shell.overlayEl;
          deskmatEl = shell.deskmatEl;
          dockTopRimEl = shell.dockTopRimEl;
          dockGripEl = shell.dockGripEl;
          spatialDockEl = shell.spatialDockEl;
          bentoRefs = shell.bentoRefs;
          stageEl = shell.stageEl;
          floorShadowEl = shell.floorShadowEl;
          hitLayerEl = shell.hitLayerEl;
          hudPillEl = shell.hudPillEl;
          swatchesWrapEl = shell.swatchesWrapEl;
          uiRefs = shell.uiRefs;

          keyNodesByZ.clear();
          shell.keyNodesByZ.forEach(function (btn, zKey) {
            keyNodesByZ.set(zKey, btn);
          });
          auxKeyNodes.length = 0;
          for (var ra = 0; ra < shell.auxKeyNodes.length; ra += 1) {
            auxKeyNodes.push(shell.auxKeyNodes[ra]);
          }
          hudChipByZ.clear();
          shell.hudChipByZ.forEach(function (obj, zKey) {
            hudChipByZ.set(zKey, obj);
          });

          overlayEl.removeAttribute('data-closing');
          overlayEl.removeAttribute('data-confirm-slam');
          overlayEl.removeAttribute('data-orbit-dragging');
          overlayEl.removeAttribute('data-effort-dragging');
          overlayEl.removeAttribute('data-in-flow');
          overlayEl.removeAttribute('data-short-viewport');
          setStyleVar(overlayEl, '--ag-pp-short-dock-h', null);
          overlayEl.setAttribute('aria-modal', stageMode === 'fullscreen' ? 'true' : 'false');
          overlayEl.setAttribute('aria-label', pk.pickerAria);
          overlayEl.setAttribute('data-stage-mode', stageMode);
          overlayEl.setAttribute('data-theme', profile.theme);
          overlayEl.setAttribute('data-kit', profile.id);
          overlayEl.setAttribute('data-rim-tone', profile.rimTone || 'default');
          overlayEl.setAttribute('data-corners', profile.corners);
          overlayEl.setAttribute('data-mono', profile.isMono ? '1' : '0');
          overlayEl.setAttribute('data-card-flipped', '0');
          overlayEl.setAttribute('data-orch-latched', orchLatched ? '1' : '0');
          overlayEl.setAttribute('data-pointer-near', '0');
          overlayEl.setAttribute('data-open', '0');
          if (hudPillEl) hudPillEl.setAttribute('aria-label', pk.hudAria);

          // 重置局部光环、地板投影与 Bento 差分缓存
          if (dockTopRimEl) {
            setStyleVar(dockTopRimEl, '--ag-pp-dock-rim-alpha', '0');
            setStyleVar(dockTopRimEl, '--ag-pp-px', '-999px');
          }
          if (bentoRefs) {
            bentoRefs._lastDomSig = '';
            bentoRefs._lastCommittedCssSig = '';
            bentoRefs._lastPagerSig = '';
            bentoRefs.lastBentoEffSig = '';
            if (bentoRefs.specCardRim) {
              setStyleVar(bentoRefs.specCardRim, '--ag-pp-card-rim-alpha', '0');
              setStyleVar(bentoRefs.specCardRim, '--ag-pp-card-px', '-999px');
              setStyleVar(bentoRefs.specCardRim, '--ag-pp-card-py', '-999px');
            }
            if (bentoRefs.telePodRim) {
              setStyleVar(bentoRefs.telePodRim, '--ag-pp-right-rim-alpha', '0');
              setStyleVar(bentoRefs.telePodRim, '--ag-pp-right-px', '-999px');
              setStyleVar(bentoRefs.telePodRim, '--ag-pp-right-py', '-999px');
            }
            if (bentoRefs.specCard && bentoRefs.specCard.classList) bentoRefs.specCard.classList.remove('is-session-switching');
            if (bentoRefs.telePod && bentoRefs.telePod.classList) bentoRefs.telePod.classList.remove('is-session-switching');
          }
          if (floorShadowEl) {
            setStyleVar(floorShadowEl, '--pp-shadow-px', '0px');
            setStyleVar(floorShadowEl, '--pp-shadow-py', '0px');
          }
          if (uiRefs) {
            uiRefs.lastEffortSig = '';
            uiRefs.lastRotatedFlag = '0';
            if (uiRefs.resetBtn) uiRefs.resetBtn.setAttribute('data-rotated', '0');
          }

          // 增量同步 90 颗主键盘键帽与 6 颗副盘键帽的可用状态（避免跨打开周期宿主模型变化后状态过期）
          for (var rIdx = 0; rIdx < ELEMENTS_90.length; rIdx += 1) {
            var rSlot = ELEMENTS_90[rIdx];
            var rBtn = keyNodesByZ.get(rSlot.z);
            if (!rBtn) continue;
            var rAvail = availableByZ.has(rSlot.z);
            var rAvailStr = rAvail ? '1' : '0';
            rBtn._ppRectKey = '';
            if (rBtn.classList) rBtn.classList.remove('is-levitated');
            rBtn.removeAttribute('data-hovered');
            if (rBtn.getAttribute('data-available') !== rAvailStr) {
              rBtn.className = 'ag-pp-hit-btn ag-pp-key ' + (rAvail ? 'ag-pp-key-avail' : 'ag-pp-key-blind');
              rBtn.setAttribute('data-available', rAvailStr);
              if (rAvail) {
                rBtn.removeAttribute('tabindex');
                rBtn.removeAttribute('aria-disabled');
              } else {
                rBtn.setAttribute('tabindex', '-1');
                rBtn.setAttribute('aria-disabled', 'true');
              }
            }
            var nextAria = fullAvailableByZ.has(rSlot.z)
              ? fullAvailableByZ.get(rSlot.z).baseName + ' (' + rSlot.numLabel + ' ' + rSlot.symbol + ')'
              : rSlot.numLabel + ' ' + rSlot.symbol + ' ' + rSlot.name + ' (Unreleased)';
            if (rBtn.getAttribute('aria-label') !== nextAria) rBtn.setAttribute('aria-label', nextAria);
          }

          var localSelReuse = getLocalAuxIndex(selectedGlobalAuxIndex);
          for (var rAk = 0; rAk < auxKeyNodes.length; rAk += 1) {
            var rAuxBtn = auxKeyNodes[rAk];
            var rAuxSlot = auxSlots[rAk];
            if (!rAuxBtn) continue;
            var rAuxAvail = Boolean(rAuxSlot && rAuxSlot.available);
            var rAuxAvailStr = rAuxAvail ? '1' : '0';
            var rIsOrch = rAuxSlot && isGlobalOrchToggleSlot(rAuxSlot._globalAuxIndex, rAuxSlot);
            rAuxBtn._ppRectKey = '';
            if (rAuxBtn.classList) rAuxBtn.classList.remove('is-levitated');
            rAuxBtn.className = 'ag-pp-hit-btn ag-pp-aux-key ' + (rAuxAvail ? 'ag-pp-key-avail' : 'ag-pp-key-blind');
            rAuxBtn.setAttribute('data-aux-id', rAuxSlot ? rAuxSlot.id : 'blind-' + rAk);
            rAuxBtn.setAttribute('data-available', rAuxAvailStr);
            if (rIsOrch) {
              rAuxBtn.setAttribute('data-latched', orchLatched ? '1' : '0');
              rAuxBtn.setAttribute('aria-pressed', orchLatched ? 'true' : 'false');
            } else {
              rAuxBtn.removeAttribute('data-latched');
              rAuxBtn.setAttribute('aria-pressed', localSelReuse === rAk ? 'true' : 'false');
            }
            if (rAuxAvail) {
              rAuxBtn.removeAttribute('tabindex');
              rAuxBtn.removeAttribute('aria-disabled');
            } else {
              rAuxBtn.setAttribute('tabindex', '-1');
              rAuxBtn.setAttribute('aria-disabled', 'true');
            }
            var nextAuxAria = rAuxAvail
              ? rAuxSlot.title + ' (' + rAuxSlot.badgeCode + ' ' + rAuxSlot.shortLabel + ')'
              : (rAuxSlot ? rAuxSlot.badgeCode : 'AUX') + ' (Reserved Macro Key)';
            if (rAuxBtn.getAttribute('aria-label') !== nextAuxAria) rAuxBtn.setAttribute('aria-label', nextAuxAria);
          }

          if (shell.hudElementsKey !== nextHudKey && swatchesWrapEl) {
            rebuildHudSwatches(swatchesWrapEl, hudElements, profile);
          }

          // 替换全新 <canvas>（避免上次 dispose() 调用 WEBGL_lose_context 导致上下文永久失效）
          var freshCanvas = mkEl(doc, 'canvas', 'ag-pp-gl-canvas');
          freshCanvas.setAttribute('aria-hidden', 'true');
          if (stageEl && hitLayerEl && typeof stageEl.insertBefore === 'function') {
            stageEl.insertBefore(freshCanvas, hitLayerEl);
          } else if (stageEl) {
            stageEl.appendChild(freshCanvas);
          }
          if (shell.canvasEl) safeRemove(shell.canvasEl);
          canvasEl = freshCanvas;
          bindCanvasClickHandler(canvasEl);
        } else {
          overlayEl = mkEl(doc, 'div', 'ag-periodic-picker-backdrop');
          overlayEl.id = ROOT_ID;
          overlayEl.setAttribute('id', ROOT_ID);
          markPeriodicOwnedRoot(overlayEl);
          overlayEl.setAttribute('role', 'dialog');
          overlayEl.setAttribute('aria-modal', stageMode === 'fullscreen' ? 'true' : 'false');
          overlayEl.setAttribute('aria-label', pk.pickerAria);
          overlayEl.setAttribute('data-stage-mode', stageMode);
          overlayEl.setAttribute('data-theme', profile.theme);
          overlayEl.setAttribute('data-kit', profile.id);
          overlayEl.setAttribute('data-rim-tone', profile.rimTone || 'default');
          overlayEl.setAttribute('data-corners', profile.corners);
          overlayEl.setAttribute('data-mono', profile.isMono ? '1' : '0');
          overlayEl.setAttribute('data-card-flipped', '0');
          overlayEl.setAttribute('data-orch-latched', orchLatched ? '1' : '0');
          overlayEl.setAttribute('data-pointer-near', '0');
          overlayEl.setAttribute('data-open', '0');

          deskmatEl = bentoUi.buildDeskmatStage(doc, root);
          dockTopRimEl = mkEl(doc, 'div', 'ag-pp-dock-top-rim');
          dockTopRimEl.setAttribute('aria-hidden', 'true');
          dockGripEl = mkEl(doc, 'div', 'ag-pp-dock-grip');
          dockGripEl.setAttribute('aria-hidden', 'true');
          spatialDockEl = mkEl(doc, 'div', 'ag-pp-spatial-dock');

          bentoRefs = bentoUi.buildBentoTwinCards(
            doc,
            {
              onToggleCardFlip: toggleCardFlipAction,
              onToggleCompactExpand: toggleCompactExpandAction,
              onToggleStageMode: toggleStageModeAction,
              onToggleMute: function () {
                toggleMuteAction();
                if (activeRenderer && typeof activeRenderer.triggerControlPress === 'function') {
                  try { activeRenderer.triggerControlPress('mute'); } catch (e) {}
                }
              },
              onConfirmClose: confirmAndClose,
              onEffortSelect: handleEffortSelect,
              onAuxEffortSelect: handleAuxEffortSelect,
              onAuxPageChange: setAuxPageAction,
            },
            { lang: langCode, zh: zh, root: root }
          );

          stageEl = mkEl(doc, 'div', 'ag-pp-stage ag-pp-modal');
          var floorRig = bentoUi.mountStudioFloorRig(doc, stageEl);
          floorShadowEl = (floorRig && floorRig.shadowEl) || null;
          canvasEl = mkEl(doc, 'canvas', 'ag-pp-gl-canvas');
          canvasEl.setAttribute('aria-hidden', 'true');
          hitLayerEl = mkEl(doc, 'div', 'ag-pp-hit-layer');

          var srDeck = mkEl(doc, 'div', 'ag-pp-sr-only');
          srDeck.setAttribute('data-testid', 'ag-pp-inspector-deck');
          srDeck.setAttribute('aria-live', 'polite');
          var srBanner = mkEl(doc, 'div', '');
          srBanner.setAttribute('data-testid', 'ag-pp-session-banner');
          srBanner.setAttribute('data-show', '0');
          var srBannerText = mkEl(doc, 'span', '', '');
          srBanner.appendChild(srBannerText);
          var srTitle = mkEl(doc, 'span', '', '');
          var srChem = mkEl(doc, 'span', '', '');
          var srSub = mkEl(doc, 'span', '', '');
          srDeck.appendChild(srBanner);
          srDeck.appendChild(srTitle);
          srDeck.appendChild(srChem);
          srDeck.appendChild(srSub);
          hitLayerEl.appendChild(srDeck);

          keyNodesByZ.clear();
          for (var idx = 0; idx < ELEMENTS_90.length; idx += 1) {
            (function (slot) {
              var isAvailInit = availableByZ.has(slot.z);
              var keyBtn = mkEl(doc, 'button', 'ag-pp-hit-btn ag-pp-key ' + (isAvailInit ? 'ag-pp-key-avail' : 'ag-pp-key-blind'));
              keyBtn.type = 'button';
              keyBtn.setAttribute('data-ag-pp-z', String(slot.z));
              keyBtn.setAttribute('data-z', String(slot.z));
              keyBtn.setAttribute('data-symbol', slot.symbol);
              keyBtn.setAttribute('data-available', isAvailInit ? '1' : '0');
              if (!isAvailInit) {
                keyBtn.setAttribute('tabindex', '-1');
                keyBtn.setAttribute('aria-disabled', 'true');
              }
              keyBtn.setAttribute(
                'aria-label',
                fullAvailableByZ.has(slot.z)
                  ? fullAvailableByZ.get(slot.z).baseName + ' (' + slot.numLabel + ' ' + slot.symbol + ')'
                  : slot.numLabel + ' ' + slot.symbol + ' ' + slot.name + ' (Unreleased)'
              );
              keyBtn.addEventListener('click', function (ev) {
                ev.stopPropagation();
                if (hasPointerCoords(ev) && activeRenderer && typeof activeRenderer.pick === 'function') {
                  var picked = activeRenderer.pick(ev.clientX, ev.clientY);
                  if (picked) { dispatchPickedTarget(picked); return; }
                }
                if (availableByZ.has(slot.z)) handleAvailableKeyClick(slot.z);
                else triggerBlindKeyFeedback(slot.z);
              });
              keyNodesByZ.set(slot.z, keyBtn);
              hitLayerEl.appendChild(keyBtn);
            })(ELEMENTS_90[idx]);
          }

          auxKeyNodes.length = 0;
          var localSelInit = getLocalAuxIndex(selectedGlobalAuxIndex);
          for (var ak = 0; ak < AUX_PAGE_SIZE; ak += 1) {
            (function (slotIdx) {
              var auxSlot = auxSlots[slotIdx];
              var isAuxAvail = Boolean(auxSlot && auxSlot.available);
              var isOrchSlot = auxSlot && isGlobalOrchToggleSlot(auxSlot._globalAuxIndex, auxSlot);
              var auxBtn = mkEl(doc, 'button', 'ag-pp-hit-btn ag-pp-aux-key ' + (isAuxAvail ? 'ag-pp-key-avail' : 'ag-pp-key-blind'));
              auxBtn.type = 'button';
              auxBtn.setAttribute('data-ag-pp-aux', String(slotIdx));
              auxBtn.setAttribute('data-aux-index', String(slotIdx));
              auxBtn.setAttribute('data-aux-id', auxSlot ? auxSlot.id : 'blind-' + slotIdx);
              auxBtn.setAttribute('data-available', isAuxAvail ? '1' : '0');
              if (isOrchSlot) {
                auxBtn.setAttribute('data-latched', orchLatched ? '1' : '0');
                auxBtn.setAttribute('aria-pressed', orchLatched ? 'true' : 'false');
              } else {
                auxBtn.setAttribute('aria-pressed', localSelInit === slotIdx ? 'true' : 'false');
              }
              if (!isAuxAvail) {
                auxBtn.setAttribute('tabindex', '-1');
                auxBtn.setAttribute('aria-disabled', 'true');
              }
              auxBtn.setAttribute(
                'aria-label',
                isAuxAvail
                  ? auxSlot.title + ' (' + auxSlot.badgeCode + ' ' + auxSlot.shortLabel + ')'
                  : (auxSlot ? auxSlot.badgeCode : 'AUX') + ' (Reserved Macro Key)'
              );
              auxBtn.addEventListener('click', function (ev) {
                ev.stopPropagation();
                if (hasPointerCoords(ev) && activeRenderer && typeof activeRenderer.pick === 'function') {
                  var picked = activeRenderer.pick(ev.clientX, ev.clientY);
                  if (picked) { dispatchPickedTarget(picked); return; }
                }
                handleAuxKeyClick(slotIdx);
              });
              auxKeyNodes.push(auxBtn);
              hitLayerEl.appendChild(auxBtn);
            })(ak);
          }

          stageEl.appendChild(canvasEl);
          stageEl.appendChild(hitLayerEl);

          hudPillEl = mkEl(doc, 'div', 'ag-pp-hud-pill');
          hudPillEl.setAttribute('role', 'toolbar');
          hudPillEl.setAttribute('aria-label', pk.hudAria);
          hudPillEl.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); });
          hudPillEl.addEventListener('click', function (ev) { ev.stopPropagation(); });

          var resetBtn = mkEl(doc, 'button', 'ag-pp-hud-icon-btn ag-pp-hud-reset-btn');
          resetBtn.type = 'button';
          resetBtn.setAttribute('data-ag-pp-action', 'reset-view');
          resetBtn.setAttribute('data-testid', 'ag-pp-reset-view-btn');
          resetBtn.setAttribute('data-rotated', '0');
          var initResetLbl = pk.resetTitle;
          resetBtn.setAttribute('aria-label', initResetLbl);
          resetBtn.title = initResetLbl;
          resetBtn.appendChild(bentoUi.buildHudResetViewSvg(doc));
          var resetLabelSpan = mkEl(doc, 'span', 'ag-pp-reset-label', pk.resetLbl);
          var resetKbdSpan = mkEl(doc, 'span', 'ag-pp-reset-kbd', 'R');
          resetKbdSpan.setAttribute('aria-hidden', 'true');
          resetBtn.appendChild(resetLabelSpan);
          resetBtn.appendChild(resetKbdSpan);
          resetBtn.addEventListener('click', function (ev) {
            ev.stopPropagation();
            resetOrbitViewAction();
          });

          swatchesWrapEl = mkEl(doc, 'div', 'ag-pp-hud-swatches ag-pp-sr-only');
          rebuildHudSwatches(swatchesWrapEl, hudElements, profile);

          var hudActions = mkEl(doc, 'div', 'ag-pp-hud-actions ag-pp-sr-only');
          var muteBtn = mkEl(doc, 'button', 'ag-pp-hud-icon-btn ag-pp-hud-mute-btn ag-pp-sr-only');
          muteBtn.type = 'button';
          muteBtn.setAttribute('data-ag-pp-action', 'mute');
          muteBtn.setAttribute('data-testid', 'ag-pp-mute-btn');
          muteBtn.setAttribute('data-muted', muted ? '1' : '0');
          muteBtn.setAttribute('aria-pressed', muted ? 'true' : 'false');
          muteBtn.setAttribute('aria-label', pk.muteInit);
          muteBtn.appendChild(bentoUi.buildHudMuteSvg(doc));
          muteBtn.addEventListener('click', function (ev) {
            ev.stopPropagation();
            toggleMuteAction();
            if (activeRenderer && typeof activeRenderer.triggerControlPress === 'function') {
              try { activeRenderer.triggerControlPress('mute'); } catch (e) {}
            }
          });

          var closeBtn = mkEl(doc, 'button', 'ag-pp-hud-icon-btn ag-pp-hud-close-btn ag-pp-sr-only');
          closeBtn.type = 'button';
          closeBtn.setAttribute('data-ag-pp-action', 'close');
          closeBtn.setAttribute('data-testid', 'ag-pp-close-btn');
          closeBtn.setAttribute('aria-label', pk.closeLbl);
          closeBtn.appendChild(bentoUi.buildHudCloseSvg(doc));
          closeBtn.addEventListener('click', function (ev) {
            ev.stopPropagation();
            confirmAndClose();
          });

          hudActions.appendChild(muteBtn);
          hudActions.appendChild(closeBtn);
          hudPillEl.appendChild(resetBtn);
          hudPillEl.appendChild(swatchesWrapEl);
          hudPillEl.appendChild(hudActions);

          spatialDockEl.appendChild(bentoRefs.compactBar);
          spatialDockEl.appendChild(bentoRefs.grid);
          spatialDockEl.appendChild(stageEl);
          spatialDockEl.appendChild(bentoRefs.rightWing);
          spatialDockEl.appendChild(hudPillEl);

          overlayEl.appendChild(deskmatEl);
          overlayEl.appendChild(dockTopRimEl);
          overlayEl.appendChild(dockGripEl);
          overlayEl.appendChild(spatialDockEl);

          uiRefs = {
            banner: srBanner,
            bannerText: srBannerText,
            srTitle: srTitle,
            srChem: srChem,
            srSub: srSub,
            resetBtn: resetBtn,
            resetLabel: resetLabelSpan,
            muteBtn: muteBtn,
            closeBtn: closeBtn,
            effortButtons: [],
            effortButtonPool: [],
            effortTargetInfo: { isAuxModel: false, globalAuxIndex: null, z: null, effortTitle: '' },
            lastEffortSig: '',
            lastRotatedFlag: '0',
          };

          bindCanvasClickHandler(canvasEl);
        }

        var pinnedScrollEl = null;
        if (stageMode === 'drawer') {
          var drawerMount = resolveDrawerMountHost(doc, triggerEl);
          overlayEl.setAttribute('data-in-flow', drawerMount.inFlow ? '1' : '0');
          if (drawerMount.inFlow) pinnedScrollEl = findNearBottomScrollContainer(drawerMount.host);
          (drawerMount.host || doc.body).appendChild(overlayEl);
        } else {
          doc.body.appendChild(overlayEl);
        }

        if (doc.documentElement && typeof doc.documentElement.setAttribute === 'function') {
          doc.documentElement.setAttribute('data-ag-pp-open', '1');
        }
        /* Notify host mascot/runtime immediately so desktop pet enters peek mode */
        syncPrismHostUi();

        var ResizeObsCtor = (root && root.ResizeObserver) || (typeof ResizeObserver === 'function' ? ResizeObserver : null);
        if (ResizeObsCtor && overlayEl) {
          try {
            dockResizeObserver = new ResizeObsCtor(function () {
              if (!overlayEl || isDestroyed || isDrawerClosing) return;
              refreshCachedLayoutRects();
              var roTierChanged = syncDockCompactState();
              resizeCanvasToStage(!roTierChanged);
              if (!isOrbitDragging) syncHitLayerRects(true);
              if (!isConfirmClosing) syncSceneAndDom(true);
            });
            dockResizeObserver.observe(overlayEl);
            if (spatialDockEl) dockResizeObserver.observe(spatialDockEl);
          } catch (e) {
            dockResizeObserver = null;
          }
        }

        var kbFactory = resolveKeyboard3DFactory(root);
        if (kbFactory) {
          try {
            activeRenderer = kbFactory.createKeyboard3DRenderer({
              canvas: canvasEl,
              doc: doc,
              root: root,
              slots: ELEMENTS_90,
              auxModels: auxSlots,
              auxPage: activeAuxPage,
              auxPageCount: auxPageCount,
            });
          } catch (e) {
            activeRenderer = null;
          }
        }

        // 3D/Canvas 舞台启用拾取时，屏蔽命中层 100+ 透明按钮的鼠标命中测试，杜绝跨按钮 pointerover/pointerenter 风暴
        var useGlStagePick = Boolean(activeRenderer && typeof activeRenderer.pick === 'function');
        overlayEl.setAttribute('data-gl-stage', useGlStagePick ? '1' : '0');

        clearStaleBlurIfActive();
        isHostPaused = computeHostPaused();
        refreshCachedLayoutRects();
        var initTierChanged = syncDockCompactState();
        resizeCanvasToStage(!initTierChanged);
        syncSceneAndDom(true, { deferTelemetryDomScan: Boolean(reqRaf) });
        if (isHostPaused) applyRendererPausedState(true);

        if (activeRenderer && !isHostPaused && !bentoUi.isReducedMotion(doc, root) && typeof activeRenderer.triggerIntroWake === 'function') {
          try {
            activeRenderer.triggerIntroWake();
            scheduleSettledRectSync();
          } catch (e) {}
        }
        if (!useGlStagePick || !reqRaf) {
          syncHitLayerRects(true);
        }

        attachOpenSessionSyncWatchers();

        if (!reusedShell) {
          /* 阻止容器内指针/悬停事件冒泡泄漏至宿主 document/window（规避宿主 main.js 全页 UpdateLayoutTree 与底层光环误触发） */
          var stopHoverBubbleToHost = function (ev) {
            if (!ev) return;
            if (ev.type === 'mouseout' && !ev.relatedTarget && !ev.toElement) return;
            if (typeof ev.stopPropagation === 'function') ev.stopPropagation();
          };
          overlayEl.addEventListener('pointerover', stopHoverBubbleToHost);
          overlayEl.addEventListener('pointerout', stopHoverBubbleToHost);
          overlayEl.addEventListener('mouseover', stopHoverBubbleToHost);
          overlayEl.addEventListener('mouseout', stopHoverBubbleToHost);

          /* Capture-phase post-drag click guard */
          overlayEl.addEventListener(
            'click',
            function (ev) {
              if (suppressPostDragClickUntil > 0) {
                var blockClick = !isTargetInBentoOrHud(ev && ev.target) && readClockMs() <= suppressPostDragClickUntil;
                suppressPostDragClickUntil = 0;
                if (blockClick) {
                  if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
                  if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
                  if (ev && typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
                  return;
                }
              }
            },
            true
          );

        /* Rotary knob effort wheel + 2x3 Aux Pad page scroll wheel */
        overlayEl.addEventListener('wheel', function (ev) {
          if (!overlayEl || isDestroyed || isConfirmClosing || isDrawerClosing || !ev) return;
          var wx = Number(ev.clientX) || 0;
          var wy = Number(ev.clientY) || 0;
          var deltaY = Number(ev.deltaY) || 0;
          if (!deltaY) return;

          var hitWheel = activeRenderer && typeof activeRenderer.pick === 'function' ? activeRenderer.pick(wx, wy) : null;
          if (hitWheel && hitWheel.kind === 'control' && resolvePickedControlAction(hitWheel) === 'mute') {
            if (typeof ev.preventDefault === 'function') ev.preventDefault();
            if (typeof ev.stopPropagation === 'function') ev.stopPropagation();
            stepActiveEffortByDelta(deltaY < 0 ? 1 : -1);
            return;
          }
          if (auxPageCount > 1) {
            var overAuxPager = Boolean(
              bentoRefs && bentoRefs.auxPager && ev.target && typeof bentoRefs.auxPager.contains === 'function' && bentoRefs.auxPager.contains(ev.target)
            );
            var overAuxPad = Boolean((hitWheel && hitWheel.kind === 'aux-key') || overAuxPager || isPointInAuxPadRegion(wx, wy));
            if (overAuxPad) {
              if (typeof ev.preventDefault === 'function') ev.preventDefault();
              if (typeof ev.stopPropagation === 'function') ev.stopPropagation();
              var nowWheelMs = readClockMs();
              if (nowWheelMs - lastAuxWheelMs >= AUX_WHEEL_THROTTLE_MS) {
                lastAuxWheelMs = nowWheelMs;
                var dirPage = deltaY > 0 ? 1 : -1;
                setAuxPageAction((activeAuxPage + dirPage + auxPageCount) % auxPageCount);
              }
            }
          }
        });

        overlayEl.addEventListener('click', function (ev) {
          if (stageMode === 'fullscreen' && (ev.target === overlayEl || (deskmatEl && ev.target === deskmatEl))) {
            confirmAndClose();
          }
        });

        var releasePressVisuals = function () {
          if (!overlayEl || isDestroyed || isConfirmClosing || isDrawerClosing) return;
          if (pressedZ !== null || pressedAuxIndex !== null || pressedEffort !== null || pressedBtn !== null) {
            pressedZ = null;
            pressedAuxIndex = null;
            pressedEffort = null;
            pressedBtn = null;
            syncSceneAndDom(true);
          }
        };

        overlayEl.addEventListener('pointerdown', function (ev) {
          if (!overlayEl || isDestroyed || isConfirmClosing || isDrawerClosing || !ev || ev.button !== 0) return;
          cancelPendingPointerMoveRaf();
          suppressPostDragClickUntil = 0;
          if (isTargetInBentoOrHud(ev.target)) return;

          if (compactExpanded) {
            compactExpanded = false;
            syncDockCompactState();
          }

          var sx = Number(ev.clientX) || 0;
          var sy = Number(ev.clientY) || 0;
          var nowTs = readClockMs();
          pointerDownOutside = false;
          if (!isOrbitDragging && nowTs - lastBoundsSyncMs > 120) {
            lastBoundsSyncMs = nowTs;
            refreshCachedLayoutRects();
          }

          var hit = activeRenderer && typeof activeRenderer.pick === 'function' ? activeRenderer.pick(sx, sy) : null;
          var targetEffAttr =
            ev.target && typeof ev.target.getAttribute === 'function' ? ev.target.getAttribute('data-ag-pp-effort') : null;
          var curDeckDown = buildCurrentDeckPayload(resolveCurrentLang());
          var isAvailInspected = Boolean(
            curDeckDown.deckInfo && curDeckDown.deckInfo.isAvailable && curDeckDown.deckInfo.levels && curDeckDown.deckInfo.levels.length > 1
          );
          var inSliderBand =
            isAvailInspected && Boolean((hit && hit.kind === 'effort') || targetEffAttr || isPointInEffortSliderBand(sx, sy));

          if (inSliderBand) {
            var startSliderRes = resolveEffortAlongSlider(sx, sy);
            var startEffort = (hit && hit.kind === 'effort' && hit.effort) || targetEffAttr || startSliderRes.effort || null;
            gestureState = {
              active: true,
              pointerId: ev.pointerId,
              kind: 'slider',
              scrubbing: false,
              inspectKind: curDeckDown.inspectKind,
              inspectZ: curDeckDown.slot ? curDeckDown.slot.z : resolveInspectedElementZ(),
              inspectGlobalAuxIndex: curDeckDown.globalAuxIndex,
              startEffort: startEffort,
              startX: sx,
              startY: sy,
              lastX: sx,
              lastY: sy,
              samples: [],
            };
            if (startEffort) {
              hoveredEffort = startEffort;
              pressedEffort = startEffort;
              playSound('down');
              syncSceneAndDom(true);
            }
            return;
          }

          if (hit && hit.kind === 'control' && resolvePickedControlAction(hit) === 'mute') {
            hoveredBtn = 'mute';
            pressedBtn = 'mute';
            gestureState = {
              active: true,
              pointerId: ev.pointerId,
              kind: 'knob',
              rotated: false,
              accumPx: 0,
              startX: sx,
              startY: sy,
              lastX: sx,
              lastY: sy,
              samples: [],
            };
            playSound('down');
            syncSceneAndDom(true);
            return;
          }

          gestureState = {
            active: true,
            pointerId: ev.pointerId,
            kind: 'orbit',
            isOrbitDragging: false,
            drawerDragSuppressed: false,
            startX: sx,
            startY: sy,
            lastX: sx,
            lastY: sy,
            samples: [{ x: sx, y: sy, t: nowTs }],
          };

          if (!hit) {
            pointerDownOutside = stageMode === 'fullscreen';
            return;
          }
          if (hit.kind === 'aux-key') {
            pressedAuxIndex = hit.auxIndex !== undefined ? hit.auxIndex : hit.slotIndex;
            playSound('down');
            syncSceneAndDom(true);
          } else if (hit.kind === 'key') {
            pressedZ = hit.slotZ || hit.z;
            playSound('down');
            syncSceneAndDom(true);
          } else if (hit.kind === 'control') {
            var downCtrl = resolvePickedControlAction(hit);
            hoveredBtn = downCtrl;
            pressedBtn = downCtrl;
            playSound('down');
            syncSceneAndDom(true);
          }
        });

        overlayEl.addEventListener('pointermove', function (ev) {
          if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
          if (!overlayEl || isDestroyed || isConfirmClosing || isDrawerClosing || isHostPaused || !ev) return;
          var cx = Number(ev.clientX) || 0;
          var cy = Number(ev.clientY) || 0;

          /* Active drag gestures (knob / effort slider / fullscreen 3D orbit) run immediately for 1:1 tracking */
          if (gestureState && gestureState.active) {
            var nowTs = readClockMs();
            var distFromStart = Math.hypot(cx - gestureState.startX, cy - gestureState.startY);

            if (gestureState.kind === 'knob') {
              var kDx = cx - gestureState.lastX;
              var kDy = gestureState.lastY - cy;
              gestureState.lastX = cx;
              gestureState.lastY = cy;
              if (distFromStart > ORBIT_DRAG_THRESHOLD_PX) {
                gestureState.dragged = true;
                overlayEl.setAttribute('data-effort-dragging', '1');
                try {
                  if (typeof overlayEl.setPointerCapture === 'function' && ev.pointerId !== undefined) overlayEl.setPointerCapture(ev.pointerId);
                } catch (e) {}
              }
              gestureState.accumPx += Math.abs(kDx) >= Math.abs(kDy) ? kDx : kDy;
              if (Math.abs(gestureState.accumPx) >= 16) {
                var kSteps = Math.trunc(gestureState.accumPx / 16);
                gestureState.accumPx -= kSteps * 16;
                gestureState.rotated = true;
                gestureState.dragged = true;
                stepActiveEffortByDelta(Math.max(-4, Math.min(4, kSteps)));
              }
              return;
            }
            if (gestureState.kind === 'slider') {
              if (!gestureState.scrubbing && distFromStart > SLIDER_SCRUB_THRESHOLD_PX) {
                gestureState.scrubbing = true;
                overlayEl.setAttribute('data-effort-dragging', '1');
                try {
                  if (typeof overlayEl.setPointerCapture === 'function' && ev.pointerId !== undefined) overlayEl.setPointerCapture(ev.pointerId);
                } catch (e2) {}
              }
              if (gestureState.scrubbing) {
                var sliderHit = resolveEffortAlongSlider(cx, cy);
                dragEffortProgress = sliderHit.progress;
                var scrubEffort = sliderHit.effort;
                if (scrubEffort) {
                  hoveredEffort = scrubEffort;
                  pressedEffort = scrubEffort;
                }
                if (gestureState.inspectKind === 'aux' && gestureState.inspectGlobalAuxIndex !== null && gestureState.inspectGlobalAuxIndex !== undefined) {
                  var auxSlotCur = effectiveAuxAll[gestureState.inspectGlobalAuxIndex];
                  var curAuxLvl = resolveLevelForAuxWithMemory(auxSlotCur, gestureState.inspectGlobalAuxIndex, '');
                  var curAuxEff = curAuxLvl ? curAuxLvl.effort : '';
                  if (scrubEffort && scrubEffort !== curAuxEff) {
                    handleAuxEffortSelect(gestureState.inspectGlobalAuxIndex, scrubEffort);
                  } else {
                    syncSceneAndDom(true);
                  }
                } else {
                  var curEff = getActiveEffortForElement(gestureState.inspectZ);
                  if (scrubEffort && scrubEffort !== curEff) handleEffortSelect(scrubEffort, gestureState.inspectZ);
                  else syncSceneAndDom(true);
                }
                gestureState.lastX = cx;
                gestureState.lastY = cy;
                return;
              }
            } else if (gestureState.kind === 'orbit') {
              if (stageMode !== 'fullscreen') {
                if (distFromStart > ORBIT_DRAG_THRESHOLD_PX && !gestureState.drawerDragSuppressed) {
                  gestureState.drawerDragSuppressed = true;
                  pointerDownOutside = false;
                  cancelBlindDwellTimer();
                  releasePressVisuals();
                }
                gestureState.lastX = cx;
                gestureState.lastY = cy;
                if (gestureState.drawerDragSuppressed) return;
              } else {
                if (!gestureState.isOrbitDragging && distFromStart > ORBIT_DRAG_THRESHOLD_PX) {
                  gestureState.isOrbitDragging = true;
                  isOrbitDragging = true;
                  pointerDownOutside = false;
                  cancelBlindDwellTimer();
                  cancelPendingPointerMoveRaf();
                  if (
                    hoveredZ !== null || hoveredAuxIndex !== null || inspectedBlindZ !== null || inspectedBlindAuxIndex !== null ||
                    pressedZ !== null || pressedAuxIndex !== null || pressedEffort !== null || pressedBtn !== null
                  ) {
                    hoveredZ = null;
                    hoveredAuxIndex = null;
                    inspectedBlindZ = null;
                    inspectedBlindAuxIndex = null;
                    pressedZ = null;
                    pressedAuxIndex = null;
                    pressedEffort = null;
                    pressedBtn = null;
                    syncSceneAndDom(true);
                  }
                  overlayEl.setAttribute('data-orbit-dragging', '1');
                  try {
                    if (typeof overlayEl.setPointerCapture === 'function' && ev.pointerId !== undefined) overlayEl.setPointerCapture(ev.pointerId);
                  } catch (e3) {}
                  var ux = (cx - gestureState.startX) / distFromStart;
                  var uy = (cy - gestureState.startY) / distFromStart;
                  gestureState.lastX = gestureState.startX + ux * ORBIT_DRAG_THRESHOLD_PX;
                  gestureState.lastY = gestureState.startY + uy * ORBIT_DRAG_THRESHOLD_PX;
                  gestureState.samples = [{ x: gestureState.lastX, y: gestureState.lastY, t: nowTs }];
                }
                if (gestureState.isOrbitDragging) {
                  var stepDx = cx - gestureState.lastX;
                  var stepDy = cy - gestureState.lastY;
                  gestureState.lastX = cx;
                  gestureState.lastY = cy;
                  pushOrbitSample(gestureState.samples, cx, cy, nowTs);
                  var dPitch = stepDy * ORBIT_PITCH_RAD_PER_PX;
                  var dYaw = stepDx * ORBIT_YAW_RAD_PER_PX;
                  if (activeRenderer) {
                    if (!bentoUi.isReducedMotion(doc, root) && typeof activeRenderer.dragChassisOrbitDelta === 'function') {
                      try {
                        if (!pendingServoOrbit) {
                          var baseO = getChassisOrbitSafe();
                          pendingServoOrbit = { pitch: baseO.pitch, yaw: baseO.yaw };
                        }
                        pendingServoOrbit.pitch = Math.max(-0.6283, Math.min(0.6632, pendingServoOrbit.pitch + dPitch));
                        pendingServoOrbit.yaw = Math.max(-0.7854, Math.min(0.7854, pendingServoOrbit.yaw + dYaw));
                        activeRenderer.dragChassisOrbitDelta(dPitch, dYaw);
                        startOrbitFollowSync();
                      } catch (e4) {}
                    } else if (typeof activeRenderer.addChassisOrbitDelta === 'function') {
                      try { activeRenderer.addChassisOrbitDelta(dPitch, dYaw); } catch (e5) {}
                    }
                  }
                  syncOrbitParallaxAndHud();
                  return;
                }
                gestureState.lastX = cx;
                gestureState.lastY = cy;
                pushOrbitSample(gestureState.samples, cx, cy, nowTs);
              }
            }
          }

          /* High-refresh hover path (120-300Hz): coalesce CSS rim vars + 96-keycap raycast pick to 1 rAF/frame */
          queueCoalescedPointerMove(cx, cy, ev.target, true);
        });

        function finishActiveGesture(ev, isCancel) {
          if (!overlayEl || isDestroyed) return;
          if (gestureState && gestureState.active) {
            var gs = gestureState;
            gestureState = null;
            try {
              if (typeof overlayEl.releasePointerCapture === 'function' && gs.pointerId !== undefined) {
                overlayEl.releasePointerCapture(gs.pointerId);
              }
            } catch (e) {}

            if (gs.kind === 'orbit' && gs.drawerDragSuppressed) {
              suppressPostDragClickUntil = readClockMs() + POST_DRAG_SUPPRESS_MS;
            } else if (gs.kind === 'orbit' && gs.isOrbitDragging) {
              isOrbitDragging = false;
              overlayEl.removeAttribute('data-orbit-dragging');
              suppressPostDragClickUntil = readClockMs() + POST_DRAG_SUPPRESS_MS;
              var endX = ev && ev.clientX !== undefined ? Number(ev.clientX) || gs.lastX : gs.lastX;
              var endY = ev && ev.clientY !== undefined ? Number(ev.clientY) || gs.lastY : gs.lastY;
              var fling =
                !isCancel && !isConfirmClosing && !isDrawerClosing && !bentoUi.isReducedMotion(doc, root)
                  ? computeOrbitFlingVelocity(gs.samples, endX, endY, readClockMs())
                  : { velPitch: 0, velYaw: 0 };

              var needsAsyncSettleSync = false;
              if (activeRenderer) {
                if (typeof activeRenderer.endChassisOrbitDrag === 'function') {
                  try { activeRenderer.endChassisOrbitDrag(fling.velPitch, fling.velYaw); } catch (e2) {}
                  if (!isConfirmClosing && !isDrawerClosing && !bentoUi.isReducedMotion(doc, root)) {
                    var stillCoasting = typeof activeRenderer.isIdle === 'function' ? !activeRenderer.isIdle() : true;
                    if (stillCoasting) {
                      needsAsyncSettleSync = true;
                      startOrbitFollowSync();
                    }
                  }
                } else if (!isCancel && !isConfirmClosing && !isDrawerClosing && !bentoUi.isReducedMotion(doc, root) && typeof activeRenderer.flingChassisOrbit === 'function') {
                  var fp = fling.velPitch * ORBIT_FALLBACK_FLING_SCALE;
                  var fy = fling.velYaw * ORBIT_FALLBACK_FLING_SCALE;
                  if (Math.hypot(fp, fy) > 0.025) {
                    try {
                      activeRenderer.flingChassisOrbit(fp, fy);
                      needsAsyncSettleSync = true;
                      startOrbitFollowSync();
                    } catch (e3) {}
                  }
                }
              }
              if (!needsAsyncSettleSync) syncHitLayerRects(true);
              else syncOrbitParallaxAndHud();
            } else if (gs.kind === 'knob' && (gs.rotated || gs.dragged)) {
              overlayEl.removeAttribute('data-effort-dragging');
              suppressPostDragClickUntil = readClockMs() + POST_DRAG_SUPPRESS_MS;
              if (!isConfirmClosing && !isDrawerClosing) syncSceneAndDom(true);
            } else if (gs.kind === 'slider' && gs.scrubbing) {
              dragEffortProgress = null;
              overlayEl.removeAttribute('data-effort-dragging');
              suppressPostDragClickUntil = readClockMs() + POST_DRAG_SUPPRESS_MS;
              pressedEffort = null;
              if (!isConfirmClosing && !isDrawerClosing) syncSceneAndDom(true);
            }
          }
          releasePressVisuals();
        }

        overlayEl.addEventListener('pointerup', function (ev) { finishActiveGesture(ev, false); });
        overlayEl.addEventListener('pointercancel', function (ev) { finishActiveGesture(ev, true); });

        overlayEl.addEventListener('transitionend', function (ev) {
          if (!overlayEl || isDestroyed || isConfirmClosing || isDrawerClosing) return;
          if (!ev || ev.target === overlayEl) {
            lastBoundsSyncMs = readClockMs();
            refreshCachedLayoutRects();
            syncDockCompactState();
          }
        });

        overlayEl.addEventListener('pointerleave', function (ev) {
          if (!overlayEl || isDestroyed || isConfirmClosing || isDrawerClosing) return;
          if (isOrbitDragging || (gestureState && gestureState.scrubbing)) return;
          cancelPendingPointerMoveRaf();
          if (ev && ev.relatedTarget && Number.isFinite(Number(ev.clientX)) && Number.isFinite(Number(ev.clientY))) {
            updateDynamicPrismCssVars(ev.clientX, ev.clientY);
          } else {
            clearLocalRimGlow();
          }
          lastPointerClient.x = -9999;
          lastPointerClient.y = -9999;
          lastPointerClient.active = false;
          forwardPointerToRenderer(-9999, -9999, false);
          clearStageHoverAndPress();
        });

          stageEl.addEventListener('pointerleave', function (ev) {
            if (!overlayEl || isDestroyed || isConfirmClosing || isDrawerClosing) return;
            if (isOrbitDragging || (gestureState && gestureState.scrubbing)) return;
            var stillInOverlay = Boolean(
              ev && ev.relatedTarget && typeof overlayEl.contains === 'function' && overlayEl.contains(ev.relatedTarget)
            );
            if (!stillInOverlay) {
              cancelPendingPointerMoveRaf();
              lastPointerClient.x = -9999;
              lastPointerClient.y = -9999;
              lastPointerClient.active = false;
              if (ev && ev.relatedTarget && Number.isFinite(Number(ev.clientX)) && Number.isFinite(Number(ev.clientY))) {
                updateDynamicPrismCssVars(ev.clientX, ev.clientY);
              } else {
                clearLocalRimGlow();
              }
              forwardPointerToRenderer(-9999, -9999, false);
            }
            clearStageHoverAndPress();
          });
        }

        if (reqRaf) {
          if (openRafId && cancelRaf) cancelRaf(openRafId);
          openRafId = reqRaf(function () {
            openRafId = 0;
            if (overlayEl && !isDrawerClosing) {
              overlayEl.setAttribute('data-open', '1');
              if (pinnedScrollEl) {
                try { pinnedScrollEl.scrollTop = pinnedScrollEl.scrollHeight; } catch (e) {}
                scheduleTrackedTimer(function () {
                  if (overlayEl && !isDrawerClosing && pinnedScrollEl) {
                    try { pinnedScrollEl.scrollTop = pinnedScrollEl.scrollHeight; } catch (e2) {}
                  }
                }, DOCK_OPEN_TRANSITION_MS + 16);
              }
              refreshCachedLayoutRects();
              var rafTierChanged = syncDockCompactState();
              resizeCanvasToStage(!rafTierChanged);
              syncHitLayerRects(true);
              // 首帧后异步补齐宿主 DOM 遥测扫描，避免阻塞 open() 首帧绘制
              if (cachedHostTelemetry && cachedHostTelemetry.domScanDeferred) {
                var fullTele = hostBridge.readHostContextTelemetry(doc, root, { anchorBtn: activeAnchorBtn });
                cachedHostTelemetry = fullTele;
                if (fullTele && (fullTele.available || fullTele.reason !== 'offline')) {
                  syncSceneAndDom(true);
                }
              }
            }
          });
        } else {
          overlayEl.setAttribute('data-open', '1');
          if (pinnedScrollEl) {
            try { pinnedScrollEl.scrollTop = pinnedScrollEl.scrollHeight; } catch (e) {}
          }
        }

        playSound('chime');
        return true;
      }

      function close(closeOpts) {
        var co = closeOpts && typeof closeOpts === 'object' ? closeOpts : {};

        detachOpenSessionSyncWatchers();
        clearTransientAsync();

        hoveredZ = null;
        hoveredAuxIndex = null;
        inspectedBlindZ = null;
        inspectedBlindAuxIndex = null;
        blindFlashZ = null;
        extNearRendererActive = false;
        pressedZ = null;
        pressedAuxIndex = null;
        hoveredEffort = null;
        pressedEffort = null;
        hoveredBtn = null;
        pressedBtn = null;
        lockedShakeZ = null;
        lockedShakeAuxIndex = null;
        pointerDownOutside = false;
        lastPointerClient.x = -9999;
        lastPointerClient.y = -9999;
        lastPointerClient.active = false;

        if (dockResizeObserver) {
          try { dockResizeObserver.disconnect(); } catch (e) {}
          dockResizeObserver = null;
        }

        /* Clean up tooltip suppression & prevent focus bounce back onto trigger button */
        try {
          if (activeAnchorBtn && doc && doc.activeElement === activeAnchorBtn && typeof activeAnchorBtn.blur === 'function') {
            activeAnchorBtn.blur();
          }
        } catch (eBlur) {}
        if (typeof hostBridge.setHoldTooltipSuppression === 'function') {
          hostBridge.setHoldTooltipSuppression(doc, false, activeAnchorBtn);
        }
        if (typeof hostBridge.suppressNativeTooltip === 'function') {
          hostBridge.suppressNativeTooltip(doc, activeAnchorBtn, false);
        }
        if (typeof hostBridge.setOpenTooltipSuppression === 'function') {
          hostBridge.setOpenTooltipSuppression(doc, false);
        } else if (doc && doc.documentElement && typeof doc.documentElement.removeAttribute === 'function') {
          try { doc.documentElement.removeAttribute('data-ag-pp-open'); } catch (eAttr) {}
        }

        var hadOverlay = Boolean(overlayEl);

        if (activeRenderer) {
          if (co.releaseHeavyCaches) {
            if (typeof activeRenderer.releaseCaches === 'function') {
              try { activeRenderer.releaseCaches(); } catch (eRc) {}
            }
            if (activeRenderer.oledPainter && typeof activeRenderer.oledPainter.releaseCaches === 'function') {
              try { activeRenderer.oledPainter.releaseCaches(); } catch (eRc2) {}
            }
          }
          if (typeof activeRenderer.dispose === 'function') {
            try { activeRenderer.dispose(); } catch (eDisp) {}
          }
          activeRenderer = null;
        }

        if (audioEngine && typeof audioEngine.dispose === 'function') {
          try { audioEngine.dispose(); } catch (eAud) {}
        }

        if (co.releaseHeavyCaches) {
          releaseAllHeavyCaches();
        }

        if (bentoRefs) {
          if (typeof bentoUi.clearBentoSessionSwitchFade === 'function') {
            bentoUi.clearBentoSessionSwitchFade(bentoRefs, root);
          } else {
            if (bentoRefs._sessionFadeRaf && cancelRaf) {
              try { cancelRaf(bentoRefs._sessionFadeRaf); } catch (eRaf) {}
              bentoRefs._sessionFadeRaf = 0;
            }
            if (bentoRefs._sessionFadeTimer) {
              var clearFadeT = (root && typeof root.clearTimeout === 'function' ? root.clearTimeout : clearTimeout);
              try { clearFadeT(bentoRefs._sessionFadeTimer); } catch (e) {}
              bentoRefs._sessionFadeTimer = 0;
            }
          }
        }
        if (hadOverlay) {
          var toRemove = overlayEl;
          if (!co.releaseHeavyCaches && !isDestroyed && currentMode !== 'off') {
            // 正常关闭保留离屏 DOM 壳，仍立即卸载出 document 确保关闭态零残留节点
            cachedShell = {
              doc: doc,
              overlayEl: overlayEl,
              deskmatEl: deskmatEl,
              dockTopRimEl: dockTopRimEl,
              dockGripEl: dockGripEl,
              spatialDockEl: spatialDockEl,
              bentoRefs: bentoRefs,
              stageEl: stageEl,
              floorShadowEl: floorShadowEl,
              canvasEl: canvasEl,
              hitLayerEl: hitLayerEl,
              hudPillEl: hudPillEl,
              swatchesWrapEl: swatchesWrapEl,
              uiRefs: uiRefs,
              hudElementsKey: activeHudElementsKey,
              keyNodesByZ: new Map(keyNodesByZ),
              auxKeyNodes: auxKeyNodes.slice(),
              hudChipByZ: new Map(hudChipByZ),
            };
          } else {
            cachedShell = null;
          }
          cachedHostTelemetry = null;
          overlayEl = null;
          deskmatEl = null;
          dockTopRimEl = null;
          dockGripEl = null;
          spatialDockEl = null;
          bentoRefs = null;
          stageEl = null;
          floorShadowEl = null;
          canvasEl = null;
          hitLayerEl = null;
          hudPillEl = null;
          swatchesWrapEl = null;
          uiRefs = null;
          lastStageRectFn = null;
          cachedStageBounds.valid = false;
          rimGlowWasActive = false;
          rimDockWasActive = false;
          rimCardWasActive = false;
          rimRightWasActive = false;
          lastDockCompactSig = '';
          lastShadowPxStr = '';
          lastShadowPyStr = '';
          lastStageCursor = '';
          lastFlushedPointer.x = NaN;
          lastFlushedPointer.y = NaN;
          lastFlushedPointer.target = null;
          lastFlushedPointer.inside = false;
          lastDomSelectedZ = undefined;
          lastDomHoveredZ = null;
          lastDomSelectedAuxLocal = undefined;
          lastDomOrchLatched = undefined;
          lastDomChromeSig = '';
          lastDomHaloSig = '';
          lastDomHudSig = '';
          lastDomCtrlSig = '';
          lastDomBannerSig = '';
          lastDomAvailVersion = -1;
          keyNodesByZ.clear();
          auxKeyNodes.length = 0;
          hudChipByZ.clear();
          safeRemove(toRemove);
          syncMiniKeycapBadges();
        }

        /* Restore host desktop pet immediately out of peek mode */
        syncPrismHostUi();
      }

      function isOpen() { return Boolean(overlayEl && !isDrawerClosing); }

      /* ── External Inspection / Sandbox Helpers ─────────────────────────── */

      function setPointerNormExternal(nx, ny, inside) {
        if (isConfirmClosing || isDrawerClosing || !activeRenderer || typeof activeRenderer.setPointerNorm !== 'function') return false;
        activeRenderer.setPointerNorm(Number(nx) || 0, Number(ny) || 0, inside !== false);
        scheduleSettledRectSync();
        return true;
      }

      function setPointerClientExternal(clientX, clientY, inside) {
        if (isConfirmClosing || isDrawerClosing) return false;
        var isInside = inside !== false;
        lastPointerClient.x = isInside ? Number(clientX) || 0 : -9999;
        lastPointerClient.y = isInside ? Number(clientY) || 0 : -9999;
        lastPointerClient.active = isInside;
        if (isInside) updateDynamicPrismCssVars(clientX, clientY);
        else clearLocalRimGlow();
        if (!forwardPointerToRenderer(clientX, clientY, isInside)) return false;
        scheduleSettledRectSync();
        return true;
      }

      function getProjectedRectsExternal() {
        if (!activeRenderer || typeof activeRenderer.getInteractiveProjectedRects !== 'function') return null;
        try { return activeRenderer.getInteractiveProjectedRects(); } catch (e) { return null; }
      }

      function setChassisOrbitExternal(pitchRad, yawRad) {
        if (isConfirmClosing || isDrawerClosing || !activeRenderer || typeof activeRenderer.setChassisOrbit !== 'function') return false;
        try {
          pendingServoOrbit = null;
          stopOrbitFollowSync();
          activeRenderer.setChassisOrbit(Number(pitchRad) || 0, Number(yawRad) || 0);
          syncHitLayerRects(true);
          return true;
        } catch (e) {
          return false;
        }
      }

      /* ── Typing-Safe Keyboard Guard ────────────────────────────────────── */

      function isNodeEditableInput(node) {
        if (!node || typeof node !== 'object') return false;
        if (overlayEl && typeof overlayEl.contains === 'function' && overlayEl.contains(node)) return false;
        var tag = typeof node.tagName === 'string' ? node.tagName.toUpperCase() : '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
        if (node.isContentEditable === true) return true;
        if (typeof node.getAttribute === 'function') {
          var ce = node.getAttribute('contenteditable');
          if (ce === 'true' || ce === '' || ce === 'plaintext-only') return true;
          var role = node.getAttribute('role');
          if (role === 'textbox' || role === 'searchbox' || role === 'combobox') return true;
        }
        if (typeof node.closest === 'function') {
          var anc = node.closest(
            'input, textarea, select, [contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"], [role="textbox"]'
          );
          if (anc && (!overlayEl || typeof overlayEl.contains !== 'function' || !overlayEl.contains(anc))) return true;
        }
        return false;
      }

      function isEditableInputEvent(ev, docRef) {
        var t = ev && ev.target;
        if (isNodeEditableInput(t)) return true;
        if (!t || t === docRef || (docRef && (t === docRef.body || t === docRef.documentElement))) {
          if (docRef && isNodeEditableInput(docRef.activeElement)) return true;
        }
        return false;
      }

      /* ── Global Document & Window Handlers ─────────────────────────────── */

      function onDocPointerDown(ev) {
        if (isDestroyed || currentMode === 'off' || !ev || isReplayingNativeTrigger) return;
        if (ev.button !== 0 || ev.ctrlKey || ev.metaKey || ev.altKey || ev.shiftKey) return;

        if (overlayEl) {
          if (!isDrawerClosing && ev.target && typeof ev.target.closest === 'function') {
            var hitBadge = ev.target.closest('.ag-pp-mini-keycap');
            if (hitBadge && !hostBridge.isInsideExcludedZone(hitBadge)) {
              cancelHold(false);
              pendingLongPressReleaseBtn = null;
              var badgeBtn =
                (typeof hitBadge.closest === 'function' && hitBadge.closest('button')) || hitBadge;
              armSuppressNextClick(badgeBtn);
              if (typeof ev.preventDefault === 'function') ev.preventDefault();
              if (typeof ev.stopPropagation === 'function') ev.stopPropagation();
              if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
              collapseDrawerAndClose();
              return;
            }
          }
          if (isTargetWithinNode(overlayEl, ev.target)) return;
        }

        var triggerBtn = hostBridge.matchModelTriggerButton(ev.target, root, doc);
        if (!triggerBtn) return;

        if (isHostModelTriggerLocked(triggerBtn)) {
          pendingLongPressReleaseBtn = null;
          cancelHold(false);
          if (overlayEl && !isDrawerClosing) {
            collapseDrawerAndClose();
          }
          return;
        }

        /* User is actively pressing trigger inside this window -> clear any stale blur flag */
        clearStaleBlurIfActive();
        if (isHostPaused) syncHostPauseState();

        /* 0ms capture interception: prevent Radix/Base UI from opening native dropdown on pointerdown */
        if (typeof ev.preventDefault === 'function') ev.preventDefault();
        if (typeof ev.stopPropagation === 'function') ev.stopPropagation();
        if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();

        pendingLongPressReleaseBtn = null;
        suppressTrailingUntilMs = 0;
        suppressTrailingBtn = null;
        cancelHold(false);

        if (typeof hostBridge.setHoldTooltipSuppression === 'function') {
          hostBridge.setHoldTooltipSuppression(doc, true, triggerBtn);
        }
        if (typeof hostBridge.suppressNativeTooltip === 'function') {
          hostBridge.suppressNativeTooltip(doc, triggerBtn, true);
        }

        var wasOpenAtDown = Boolean(overlayEl && !isDrawerClosing);
        var wasNativeOpenAtDown = isNativeHostMenuOpen(doc, triggerBtn);
        var startX = Number(ev.clientX) || 0;
        var startY = Number(ev.clientY) || 0;
        var state = {
          btn: triggerBtn,
          wasOpen: wasOpenAtDown,
          wasNativeMenuOpen: wasNativeOpenAtDown,
          pointerId: ev.pointerId !== undefined ? ev.pointerId : 1,
          pointerType: typeof ev.pointerType === 'string' && ev.pointerType ? ev.pointerType : 'mouse',
          startX: startX,
          startY: startY,
          lastX: startX,
          lastY: startY,
          drifted: false,
          triggeredLongPress: false,
          ring: null,
          ringTimer: 0,
          prewarmTimer: 0,
          openTimer: 0,
          didPrewarm: false,
        };
        holdState = state;

        state.ringTimer = setTimer(function () {
          var lockedNow = isHostModelTriggerLocked(triggerBtn);
          if (holdState !== state || isDestroyed || !isNodeConnectedToDoc(doc, triggerBtn) || lockedNow) {
            cancelHold(false);
            if (lockedNow && overlayEl && !isDrawerClosing) collapseDrawerAndClose();
            return;
          }
          state.ringTimer = 0;
          state.ring = bentoUi.spawnHoldRing(doc, root, triggerBtn, reqRaf, HOLD_OPEN_DELAY_MS, HOLD_RING_DELAY_MS);
          if (state.ring && state.ring.el) markPeriodicOwnedRoot(state.ring.el);
        }, HOLD_RING_DELAY_MS);

        if (!wasOpenAtDown) {
          state.prewarmTimer = setTimer(function () {
            var lockedNow = isHostModelTriggerLocked(triggerBtn);
            if (holdState !== state || isDestroyed || !isNodeConnectedToDoc(doc, triggerBtn) || lockedNow) {
              if (lockedNow) {
                cancelHold(false);
                if (overlayEl && !isDrawerClosing) collapseDrawerAndClose();
              }
              return;
            }
            state.prewarmTimer = 0;
            state.didPrewarm = true;
            prewarmActiveModelAssets(triggerBtn);
          }, HOLD_PREWARM_DELAY_MS);
        }

        state.openTimer = setTimer(function () {
          var lockedNow = isHostModelTriggerLocked(triggerBtn);
          if (holdState !== state || isDestroyed || !isNodeConnectedToDoc(doc, triggerBtn) || lockedNow) {
            cancelHold(false);
            if (lockedNow && overlayEl && !isDrawerClosing) collapseDrawerAndClose();
            return;
          }
          state.triggeredLongPress = true;
          pendingLongPressReleaseBtn = triggerBtn;
          cancelHold(true);
          armSuppressNextClick(triggerBtn);
          if (state.wasOpen) {
            collapseDrawerAndClose();
          } else {
            var ctx = hostBridge.readHostModelContext(triggerBtn, root, doc);
            hostBridge.dismissNativeHostMenu(ctx, doc);
            open(triggerBtn);
          }
        }, HOLD_OPEN_DELAY_MS);
      }

      function onDocMouseDown(ev) {
        if (isDestroyed || currentMode === 'off' || !ev || isReplayingNativeTrigger) return;
        if (ev.button !== 0 || ev.ctrlKey || ev.metaKey || ev.altKey || ev.shiftKey) return;
        if (overlayEl && isTargetWithinNode(overlayEl, ev.target)) return;

        var matchedTrigger = hostBridge.matchModelTriggerButton(ev.target, root, doc);
        var lockProbeBtn = matchedTrigger || (holdState && isTargetWithinNode(holdState.btn, ev.target) ? holdState.btn : null);
        if (lockProbeBtn && isHostModelTriggerLocked(lockProbeBtn)) {
          cancelHold(false);
          if (overlayEl && !isDrawerClosing) {
            collapseDrawerAndClose();
          }
          return;
        }

        var shouldBlock = false;
        if (holdState && isTargetWithinNode(holdState.btn, ev.target)) {
          shouldBlock = true;
        } else if (
          suppressUntilMs &&
          Date.now() <= suppressUntilMs &&
          (!suppressTargetBtn || isTargetWithinNode(suppressTargetBtn, ev.target))
        ) {
          shouldBlock = true;
        } else if (matchedTrigger) {
          shouldBlock = true;
        }

        if (shouldBlock) {
          if (typeof ev.preventDefault === 'function') ev.preventDefault();
          if (typeof ev.stopPropagation === 'function') ev.stopPropagation();
          if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
        }
      }

      function onDocPointerMove(ev) {
        if (!holdState && (!overlayEl || isConfirmClosing || isDrawerClosing || isHostPaused)) return;
        if (!ev || isDestroyed) return;
        if (holdState) {
          if (!isNodeConnectedToDoc(doc, holdState.btn) || isHostModelTriggerLocked(holdState.btn)) {
            var lockedInMove = isHostModelTriggerLocked(holdState.btn);
            cancelHold(false);
            if (lockedInMove && overlayEl && !isDrawerClosing) collapseDrawerAndClose();
          } else {
            var mx = Number(ev.clientX) || 0;
            var my = Number(ev.clientY) || 0;
            holdState.lastX = mx;
            holdState.lastY = my;
            var dx = mx - holdState.startX;
            var dy = my - holdState.startY;
            if (!holdState.drifted && dx * dx + dy * dy >= HOLD_MAX_DRIFT_PX * HOLD_MAX_DRIFT_PX) {
              /* Cancel long-press timers/ring immediately, but keep holdState until pointerup so quick clicks inside triggerBtn still replay cleanly */
              holdState.drifted = true;
              if (holdState.ringTimer) { clearTimer(holdState.ringTimer); holdState.ringTimer = 0; }
              if (holdState.prewarmTimer) { clearTimer(holdState.prewarmTimer); holdState.prewarmTimer = 0; }
              if (holdState.openTimer) { clearTimer(holdState.openTimer); holdState.openTimer = 0; }
              if (holdState.ring) {
                try { holdState.ring.remove(); } catch (eRing) {}
                holdState.ring = null;
              }
              if (typeof hostBridge.setHoldTooltipSuppression === 'function') {
                hostBridge.setHoldTooltipSuppression(doc, false, holdState.btn);
              }
              if (typeof hostBridge.suppressNativeTooltip === 'function') {
                hostBridge.suppressNativeTooltip(doc, holdState.btn, false);
              }
            }
          }
        }
        if (overlayEl && !isDestroyed && !isConfirmClosing && !isDrawerClosing && !isHostPaused) {
          var insideDock = Boolean(ev.target && typeof overlayEl.contains === 'function' && overlayEl.contains(ev.target));
          if (!insideDock) {
            queueCoalescedPointerMove(Number(ev.clientX) || 0, Number(ev.clientY) || 0, ev.target, false);
          }
        }
      }

      function onDocPointerUp(ev) {
        if (isDestroyed || currentMode === 'off' || !ev || isReplayingNativeTrigger) return;
        if (pendingLongPressReleaseBtn) {
          var lpBtn = pendingLongPressReleaseBtn;
          pendingLongPressReleaseBtn = null;
          armSuppressNextClick(lpBtn);
          if (!overlayEl || !isTargetWithinNode(overlayEl, ev.target)) {
            if (typeof ev.preventDefault === 'function') ev.preventDefault();
            if (typeof ev.stopPropagation === 'function') ev.stopPropagation();
            if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
          }
          return;
        }
        if (!holdState) return;

        var st = holdState;
        var btn = st.btn;
        if (isHostModelTriggerLocked(btn)) {
          cancelHold(false);
          armSuppressTrailingNativeRelease(btn);
          if (overlayEl && !isDrawerClosing) {
            collapseDrawerAndClose();
          }
          return;
        }
        var upX = ev.clientX !== undefined ? Number(ev.clientX) || st.startX : st.lastX;
        var upY = ev.clientY !== undefined ? Number(ev.clientY) || st.startY : st.lastY;
        var dx = upX - st.startX;
        var dy = upY - st.startY;
        var driftedNow = st.drifted || dx * dx + dy * dy >= HOLD_MAX_DRIFT_PX * HOLD_MAX_DRIFT_PX;

        if (typeof ev.preventDefault === 'function') ev.preventDefault();
        if (typeof ev.stopPropagation === 'function') ev.stopPropagation();
        if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();

        cancelHold(false);

        var releasedInsideBtn = isTargetWithinNode(btn, ev.target);
        if ((!driftedNow || releasedInsideBtn) && !st.triggeredLongPress && isNodeConnectedToDoc(doc, btn)) {
          if (overlayEl) {
            close({ silent: true });
          }
          replayNativeTriggerClick(btn, {
            clientX: upX,
            clientY: upY,
            pointerId: ev.pointerId !== undefined ? ev.pointerId : st.pointerId,
            pointerType: typeof ev.pointerType === 'string' && ev.pointerType ? ev.pointerType : st.pointerType,
            wasNativeMenuOpen: st.wasNativeMenuOpen,
          });
        } else {
          armSuppressTrailingNativeRelease(btn);
        }
      }

      function onDocPointerCancel() {
        pendingLongPressReleaseBtn = null;
        if (holdState) {
          var cancelBtn = holdState.btn;
          cancelHold(false);
          armSuppressTrailingNativeRelease(cancelBtn);
        }
      }

      function onDocScroll() {
        if (holdState) {
          var scrollBtn = holdState.btn;
          cancelHold(false);
          armSuppressTrailingNativeRelease(scrollBtn);
        }
        if (overlayEl && !isDestroyed && !isConfirmClosing && !isDrawerClosing && !isOrbitDragging) {
          var nowScrollMs = readClockMs();
          if (nowScrollMs - lastBoundsSyncMs > 120) {
            lastBoundsSyncMs = nowScrollMs;
            refreshCachedLayoutRects();
          }
        }
      }

      function onDocVisibilityChange() {
        if (isDocHiddenNow()) {
          pendingLongPressReleaseBtn = null;
          if (holdState) cancelHold(false);
          clearDragAndPointerOnBlur();
          releaseAllHeavyCaches();
        } else {
          clearStaleBlurIfActive();
        }
        syncHostPauseState();
      }

      function onDocSuppressClick(ev) {
        if (isReplayingNativeTrigger) return;

        if (suppressTrailingUntilMs) {
          if (Date.now() > suppressTrailingUntilMs) {
            suppressTrailingUntilMs = 0;
            suppressTrailingBtn = null;
          } else if (ev && isTargetWithinNode(suppressTrailingBtn, ev.target)) {
            if (typeof ev.preventDefault === 'function') ev.preventDefault();
            if (typeof ev.stopPropagation === 'function') ev.stopPropagation();
            if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
            if (ev.type === 'click') {
              suppressTrailingUntilMs = 0;
              suppressTrailingBtn = null;
            }
            return;
          }
        }

        if (!suppressUntilMs) {
          if (ev && ev.type === 'click' && !overlayEl) syncMiniKeycapBadges();
          return;
        }
        if (Date.now() > suppressUntilMs) {
          suppressUntilMs = 0;
          suppressTargetBtn = null;
          return;
        }
        if (ev && overlayEl && typeof overlayEl.contains === 'function' && overlayEl.contains(ev.target)) return;
        if (ev) {
          if (typeof ev.preventDefault === 'function') ev.preventDefault();
          if (typeof ev.stopPropagation === 'function') ev.stopPropagation();
          if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
        }
        if (ev && ev.type === 'click') {
          suppressUntilMs = 0;
          suppressTargetBtn = null;
          if (suppressTimer) {
            clearTimer(suppressTimer);
            suppressTimer = 0;
          }
        }
      }

      function onDocKeyDown(ev) {
        if (holdState) cancelHold(false);
        if (!overlayEl || isDrawerClosing || !ev) return;

        /* Esc cleanly closes the dock WITHOUT rolling back any selected host model */
        if (ev.key === 'Escape') {
          if (typeof ev.preventDefault === 'function') ev.preventDefault();
          if (typeof ev.stopPropagation === 'function') ev.stopPropagation();
          if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
          collapseDrawerAndClose();
          return;
        }
        if (isEditableInputEvent(ev, doc)) return;

        if ((ev.key === 'f' || ev.key === 'F') && !ev.ctrlKey && !ev.metaKey && !ev.altKey && !ev.shiftKey && !isConfirmClosing) {
          if (typeof ev.preventDefault === 'function') ev.preventDefault();
          if (typeof ev.stopPropagation === 'function') ev.stopPropagation();
          toggleStageModeAction();
        } else if ((ev.key === 'r' || ev.key === 'R') && !ev.ctrlKey && !ev.metaKey && !ev.altKey && !ev.shiftKey && !isConfirmClosing) {
          if (getChassisOrbitSafe().isRotated) {
            if (typeof ev.preventDefault === 'function') ev.preventDefault();
            if (typeof ev.stopPropagation === 'function') ev.stopPropagation();
            resetOrbitViewAction();
          }
        } else if (ev.key === 'Enter') {
          if (isConfirmClosing) {
            if (typeof ev.preventDefault === 'function') ev.preventDefault();
            if (typeof ev.stopPropagation === 'function') ev.stopPropagation();
            return;
          }
          var actEl = doc && doc.activeElement;
          if (actEl && typeof actEl.getAttribute === 'function') {
            var actKind = actEl.getAttribute('data-ag-pp-action');
            var actTestId = actEl.getAttribute('data-testid');
            if (
              actEl.getAttribute('data-ag-pp-effort') ||
              actEl.getAttribute('data-bento-effort') ||
              actKind === 'mute' ||
              actKind === 'reset-view' ||
              actTestId === 'ag-pp-stage-mode-btn' ||
              actTestId === 'ag-pp-card-flip-btn' ||
              actTestId === 'ag-pp-compact-summary' ||
              actTestId === 'ag-pp-aux-prev' ||
              actTestId === 'ag-pp-aux-next' ||
              actEl.getAttribute('data-page-index') !== null ||
              actEl.getAttribute('data-hud-z')
            ) {
              return;
            }
          }
          if (typeof ev.preventDefault === 'function') ev.preventDefault();
          if (typeof ev.stopPropagation === 'function') ev.stopPropagation();
          confirmAndClose();
        }
      }

      function onWindowResize() {
        if (holdState) cancelHold(false);
        if (overlayEl && !isDrawerClosing) {
          refreshCachedLayoutRects();
          var resTierChanged = syncDockCompactState();
          resizeCanvasToStage(!resTierChanged);
          syncHitLayerRects(true);
          if (!isConfirmClosing) syncSceneAndDom(true);
        }
      }

      function clearDragAndPointerOnBlur() {
        cancelPendingPointerMoveRaf();
        stopOrbitFollowSync();
        if (!overlayEl) return;
        var wasDragging = isOrbitDragging;
        isOrbitDragging = false;
        gestureState = null;
        pendingServoOrbit = null;
        dragEffortProgress = null;
        overlayEl.removeAttribute('data-orbit-dragging');
        overlayEl.removeAttribute('data-effort-dragging');
        if (wasDragging && activeRenderer && typeof activeRenderer.endChassisOrbitDrag === 'function') {
          try { activeRenderer.endChassisOrbitDrag(0, 0); } catch (e) {}
        }
        if (!isConfirmClosing && !isDrawerClosing) {
          lastPointerClient.x = -9999;
          lastPointerClient.y = -9999;
          lastPointerClient.active = false;
          clearLocalRimGlow();
          forwardPointerToRenderer(-9999, -9999, false);
        }
      }

      function onWindowBlur(ev) {
        if (ev && ev.target && root && ev.target !== root) return;
        windowBlurred = true;
        pendingLongPressReleaseBtn = null;
        if (holdState) cancelHold(false);
        clearDragAndPointerOnBlur();
        syncHostPauseState();
      }

      function onWindowFocus() {
        windowBlurred = false;
        syncHostPauseState();
      }

      function onWindowMouseOut(ev) {
        if (isDestroyed || !ev) return;
        if (!ev.relatedTarget && !ev.toElement) {
          if (holdState) cancelHold(false);
          if (!overlayEl || isConfirmClosing || isDrawerClosing) return;
          cancelPendingPointerMoveRaf();
          lastPointerClient.x = -9999;
          lastPointerClient.y = -9999;
          lastPointerClient.active = false;
          clearLocalRimGlow();
          forwardPointerToRenderer(-9999, -9999, false);
        }
      }

      /* Strictly documentElement attributes-only observer (ZERO document.body MutationObserver!) */
      function setupThemeObserver() {
        var ObsCtor = (root && root.MutationObserver) || (typeof MutationObserver === 'function' ? MutationObserver : null);
        if (!ObsCtor || !doc || !doc.documentElement) return;
        if (themeObserver) {
          try { themeObserver.disconnect(); } catch (e) {}
        }
        themeObserver = new ObsCtor(function (mutations) {
          if (isDestroyed || currentMode === 'off') return;
          var sawBlurAttr = false;
          var sawThemeAttr = false;
          if (Array.isArray(mutations) && mutations.length > 0) {
            for (var i = 0; i < mutations.length; i += 1) {
              var attrName = mutations[i] && mutations[i].attributeName;
              if (attrName === 'data-ag-cs-win-blur') sawBlurAttr = true;
              else sawThemeAttr = true;
            }
          } else {
            sawBlurAttr = true;
            sawThemeAttr = true;
          }
          if (sawBlurAttr) {
            if (!isHostWinBlurAttrSet()) windowBlurred = false;
            syncHostPauseState();
          }
          if (sawThemeAttr) {
            bentoUi.invalidateComputedThemeCache(doc);
            syncMiniKeycapBadges();
            if (overlayEl && !isDrawerClosing) syncSceneAndDom(true);
          }
        });
        try {
          themeObserver.observe(doc.documentElement, {
            attributes: true,
            attributeFilter: [
              'data-ag-cs-palette',
              'data-ag-cs-theme',
              'data-theme',
              'data-ag-cs-light-preset',
              'data-ag-cs-accent',
              'data-ag-cs-corners',
              'data-ag-cs-ambient',
              'data-ag-cs-motion',
              'data-ag-cs-lang',
              'data-ag-cs-telemetry',
              'data-ag-cs-win-blur',
              'class',
            ],
          });
        } catch (e) {}
      }

      function disconnectObservers() {
        if (themeObserver) {
          try { themeObserver.disconnect(); } catch (e) {}
          themeObserver = null;
        }
        detachOpenSessionSyncWatchers();
      }

      function activate() {
        if (!doc || !doc.documentElement) return;
        doc.documentElement.setAttribute(ROOT_MARKER_ATTR, '1');
        bentoUi.ensureStyles(doc);
        onDoc('pointerdown', onDocPointerDown, true);
        onDoc('mousedown', onDocMouseDown, true);
        onDoc('pointermove', onDocPointerMove, true);
        onDoc('pointerup', onDocPointerUp, true);
        onDoc('pointercancel', onDocPointerCancel, true);
        onDoc('contextmenu', onDocPointerCancel, true);
        onDoc('scroll', onDocScroll, true);
        onDoc('visibilitychange', onDocVisibilityChange, false);
        onDoc('mouseup', onDocSuppressClick, true);
        onDoc('click', onDocSuppressClick, true);
        onDoc('keydown', onDocKeyDown, true);
        onRoot('resize', onWindowResize, false);
        onRoot('blur', onWindowBlur, false);
        onRoot('focus', onWindowFocus, false);
        onRoot('mouseout', onWindowMouseOut, false);
        setupThemeObserver();
        syncMiniKeycapBadges();
      }

      function deactivate() {
        cancelHold(false);
        pendingLongPressReleaseBtn = null;
        isReplayingNativeTrigger = false;
        bentoUi.invalidateComputedThemeCache(doc);
        clearBadgeTimer();
        clearTransientAsync();
        disconnectObservers();
        if (suppressTimer) {
          clearTimer(suppressTimer);
          suppressTimer = 0;
        }
        suppressUntilMs = 0;
        suppressTargetBtn = null;
        suppressTrailingUntilMs = 0;
        suppressTrailingBtn = null;
        close({ silent: true, releaseHeavyCaches: true });
        releaseAllHeavyCaches();
        removeAllMiniKeycaps();
        removeAllListeners();
        if (typeof bentoUi.cleanupUiResiduals === 'function') bentoUi.cleanupUiResiduals(doc);
      }

      var instanceApi = {
        destroy: function () {
          if (isDestroyed) return;
          isDestroyed = true;
          currentMode = 'off';
          deactivate();
          if (root && root.__agPrismPeriodicPicker === instanceApi) {
            try { delete root.__agPrismPeriodicPicker; } catch (e) { root.__agPrismPeriodicPicker = undefined; }
          }
        },
        getStatus: function () {
          var grainMod = resolveGrainAssets(root);
          var oledMod = resolveOledScreenModule(root);
          return {
            status: isDestroyed ? 'destroyed' : currentMode === 'on' ? 'active' : 'off',
            mode: currentMode,
            stageMode: stageMode,
            paused: Boolean(isHostPaused),
            orchLatched: Boolean(orchLatched),
            cardFlipped: Boolean(cardFlipped),
            open: Boolean(overlayEl && !isDrawerClosing),
            selectedZ: selectedZ,
            selectedAuxIndex: selectedGlobalAuxIndex,
            auxPage: activeAuxPage,
            auxPageCount: auxPageCount,
            confirmClosing: isConfirmClosing,
            confirmSlamZ: confirmSlamZ,
            confirmSlamAuxIndex: confirmSlamAuxIndex,
            availableCount: availableEntries.length,
            grainDecoded: Boolean(
              grainMod && typeof grainMod.hasDecodedGrainTextures === 'function' && grainMod.hasDecodedGrainTextures()
            ),
            cachedWallpapers:
              oledMod && typeof oledMod.getCachedOledWallpaperCount === 'function'
                ? oledMod.getCachedOledWallpaperCount(root)
                : 0,
            audioState: audioEngine && typeof audioEngine.getAudioState === 'function' ? audioEngine.getAudioState() : 'none',
            rendererMode:
              activeRenderer && typeof activeRenderer.getRendererMode === 'function'
                ? activeRenderer.getRendererMode()
                : 'headless',
          };
        },
        setMode: function (nextMode) {
          if (isDestroyed) return instanceApi;
          var normalized = nextMode === 'off' ? 'off' : 'on';
          if (normalized === currentMode) return instanceApi;
          currentMode = normalized;
          if (currentMode === 'off') deactivate();
          else activate();
          return instanceApi;
        },
        open: open,
        close: close,
        isOpen: isOpen,
        getStageMode: getStageModeAction,
        setStageMode: setStageModeAction,
        toggleStageMode: toggleStageModeAction,
        toggleCardFlip: toggleCardFlipAction,
        getAuxPage: function () { return activeAuxPage; },
        setAuxPage: setAuxPageAction,
        getAuxPageCount: function () { return auxPageCount; },
        setPointerNorm: setPointerNormExternal,
        setPointerClient: setPointerClientExternal,
        getProjectedRects: getProjectedRectsExternal,
        getChassisOrbit: getChassisOrbitSafe,
        setChassisOrbit: setChassisOrbitExternal,
        resetChassisOrbit: resetOrbitViewAction,
        syncBadges: syncMiniKeycapBadges,
        onHostTriggerChanged: onHostTriggerChanged,
      };

      activate();
      if (root && typeof root === 'object') {
        root.__agPrismPeriodicPicker = instanceApi;
      }
      return instanceApi;
    }

    /* ── Public Module Exports (Backward-Compatible Re-Exports + Factory) ──── */

    return {
      mountPeriodicPicker: mountPeriodicPicker,
      createPeriodicModelPickerController: mountPeriodicPicker,

      /* Re-exports from model-catalog.js */
      ELEMENTS_90: defaultCatalog.ELEMENTS_90,
      SLOT_BY_Z: defaultCatalog.SLOT_BY_Z,
      ELEMENT_BY_NAME: defaultCatalog.ELEMENT_BY_NAME,
      GROUP_META: defaultCatalog.GROUP_META,
      ELEMENT_LORE: defaultCatalog.ELEMENT_LORE,
      ELEMENT_SPEC_PROFILES: defaultCatalog.ELEMENT_SPEC_PROFILES,
      BENCHMARK_2026Q4_DB: defaultCatalog.BENCHMARK_2026Q4_DB,
      AUX_MODEL_PRESETS: defaultCatalog.AUX_MODEL_PRESETS,
      AUX_PAGE_SIZE: defaultCatalog.AUX_PAGE_SIZE,
      EFFORT_ORDER: defaultCatalog.EFFORT_ORDER,
      EFFORT_NORM_MAP: defaultCatalog.EFFORT_NORM_MAP,
      EFFORT_LABELS: defaultCatalog.EFFORT_LABELS,
      EFFORT_LABELS_ZH: defaultCatalog.EFFORT_LABELS_ZH,
      normalizeZhEffortWord: defaultCatalog.normalizeZhEffortWord,
      normalizeEnEffortWord: defaultCatalog.normalizeEnEffortWord,
      stripEffortSuffixFromLabel: defaultCatalog.stripEffortSuffixFromLabel,
      parseElementModelLabel: defaultCatalog.parseElementModelLabel,
      matchGoogleElementModels: defaultCatalog.matchGoogleElementModels,
      resolveBenchmarkMetrics: defaultCatalog.resolveBenchmarkMetrics,
      classifyNonElementOption: defaultCatalog.classifyNonElementOption,
      matchHostAuxModels: defaultCatalog.matchHostAuxModels,
      getAuxPageCount: defaultCatalog.getAuxPageCount,
      getAuxPageSlice: defaultCatalog.getAuxPageSlice,
      findAuxPageForId: defaultCatalog.findAuxPageForId,
      padAuxPageSlots: defaultCatalog.padAuxPageSlots,
      resolveElementDisplay: defaultCatalog.resolveElementDisplay,
      resolveAuxSlotDisplay: defaultCatalog.resolveAuxSlotDisplay,
      getLocalizedEffortLabel: defaultCatalog.getLocalizedEffortLabel,

      /* Re-exports from host-bridge.js */
      readHostModelContext: defaultHostBridge.readHostModelContext,
      readHostModelContextFromFiber: defaultHostBridge.readHostModelContextFromFiber,
      readHostModelContextFromDomMenu: defaultHostBridge.readHostModelContextFromDomMenu,
      commitModelOption: defaultHostBridge.commitModelOption,
      commitOrchestratorPlannerPick: defaultHostBridge.commitOrchestratorPlannerPick,
      syncHostWithActiveState: defaultHostBridge.syncHostWithActiveState,
      readHostContextTelemetry: defaultHostBridge.readHostContextTelemetry,
      suppressNativeTooltip: defaultHostBridge.suppressNativeTooltip,
      setHoldTooltipSuppression: defaultHostBridge.setHoldTooltipSuppression,
      setOpenTooltipSuppression: defaultHostBridge.setOpenTooltipSuppression,
      readSharedEffortMemory: defaultHostBridge.readSharedEffortMemory,
      writeSharedEffortMemory: defaultHostBridge.writeSharedEffortMemory,
      getRememberedEffort: defaultHostBridge.getRememberedEffort,
      isEffortMemoryEnabled: defaultHostBridge.isEffortMemoryEnabled,
      normalizeEffortToken: defaultHostBridge.normalizeEffortToken,
      findFallbackModelTrigger: defaultHostBridge.findFallbackModelTrigger,
      isModelTriggerLocked: defaultHostBridge.isModelTriggerLocked,
      collectVisibleModelTriggerButtons: defaultHostBridge.collectVisibleModelTriggerButtons,
      matchModelTriggerButton: defaultHostBridge.matchModelTriggerButton,
      dismissNativeHostMenu: defaultHostBridge.dismissNativeHostMenu,

      /* Re-exports from bento-ui.js */
      STYLE_ID: defaultBentoUi.STYLE_ID,
      ROOT_ID: defaultBentoUi.ROOT_ID,
      ROOT_MARKER_ATTR: defaultBentoUi.ROOT_MARKER_ATTR,
      PICKER_CSS: defaultBentoUi.PICKER_CSS,
      buildPickerCss: defaultBentoUi.buildPickerCss,
      ensureStyles: defaultBentoUi.ensureStyles,
      cleanupUiResiduals: defaultBentoUi.cleanupUiResiduals,
      markPeriodicOwnedRoot: defaultBentoUi.markPeriodicOwnedRoot,
      isZhLocale: defaultBentoUi.isZhLocale,
      isReducedMotion: defaultBentoUi.isReducedMotion,
      resolvePrismThemeProfile: defaultBentoUi.resolvePrismThemeProfile,
      detectLightDarkMode: defaultBentoUi.detectLightDarkMode,
      invalidateComputedThemeCache: defaultBentoUi.invalidateComputedThemeCache,
      buildBentoTwinCards: defaultBentoUi.buildBentoTwinCards,
      syncBentoTwinCardsDom: defaultBentoUi.syncBentoTwinCardsDom,
      updateBentoTwinCards: defaultBentoUi.updateBentoTwinCards,
      syncAuxPagerDom: defaultBentoUi.syncAuxPagerDom,
      triggerBentoSessionSwitchFade: defaultBentoUi.triggerBentoSessionSwitchFade,
      clearBentoSessionSwitchFade: defaultBentoUi.clearBentoSessionSwitchFade,

      /* Re-exports from audio-fx.js */
      MUTE_STORAGE_KEY: defaultAudioFx.MUTE_STORAGE_KEY,
      readMutedPref: defaultAudioFx.readMutedPref,
      writeMutedPref: defaultAudioFx.writeMutedPref,
      createAudioFxEngine: defaultAudioFx.createAudioFxEngine,
    };
  }
);

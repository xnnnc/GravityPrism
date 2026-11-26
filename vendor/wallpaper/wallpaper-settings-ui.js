// Obsidian Prism — Channel 7 Local Static/Dynamic Wallpaper Settings Card UI (v1.0.8-beta.3 · Beta, Five-Locale, 0 innerHTML)
// Exposes globalThis.__prismMountWallpaperUi(slotEl, ctx) and window.__prismMountWallpaperUi(slotEl, ctx)

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

  const I18N_KEYS =
    'title|desc|enableLabel|on|off|pickBtn|applyBtn|clearBtn|pathPh|opacityLabel|blurLabel|dimLabel|fitLabel|fitCover|fitContain|pauseBlurLabel|pauseBlurDesc|stIdle|stOffline|stActiveImg|stActiveVid|stBlobFallback|stVideoBlocked|stManualLinux|stCanceled|stPicking|stSaving|stCleared|errUnsupportedExt|errSensitivePath|errSymlink|errUncDevice|errNotFound|errInvalidMagic|errTooLarge|errBlobTooLarge|errGeneric'.split(
      '|'
    );

  const I18N_ROWS = {
    'zh-CN':
      '自定义静态 / 动态背景壁纸 (Beta)|Beta 实验性功能，默认关闭，可能随版本调整：纯本机读取图片与 MP4/WebM，零外网请求，支持失焦或进入对话自动 0fps 休眠。|启用背景壁纸 (Beta)|开启|关闭|选择图片 / 视频|应用|清除|输入本地图片或 MP4/WebM 视频绝对路径…|壁纸透明度|高斯模糊|护眼遮罩|铺满模式|铺满裁切|完整居中|失焦自动暂停视频|窗口失焦或最小化时立即暂停动态视频，减少 GPU 占用。|未启用壁纸（Beta · 零资源占用）。|Prism 后台守护进程未连接，壁纸服务暂不可用。|已启用静态图片壁纸（Beta · 本机只读流）。|已启用动态视频壁纸（Beta · 失焦/隐藏自动 0fps 休眠）。|受宿主安全策略限制时可能降级，已自动切换至安全小图回退渲染（<= 8 MB）。|动态视频流受宿主安全策略限制或无法解码，请改用静态图片（<= 8 MB）或调整本机媒体策略。|Linux 环境请直接在上方输入框粘贴本地媒体文件绝对路径后点击「应用」。|已取消文件选择。|正在打开系统文件选择器…|正在校验并保存壁纸配置…|已清除壁纸并释放本机端口。|文件格式不支持：仅允许 JPG/PNG/WebP/GIF/AVIF/MP4/WebM（严禁 SVG/HTML/脚本）。|安全拦截：禁止读取系统目录或凭据目录（如 .ssh/.aws/.gemini/Windows）。|安全拦截：禁止使用符号链接（Symlink）作为壁纸文件。|安全拦截：禁止使用 UNC 网络路径或系统设备路径。|文件不存在或无法访问，请检查路径是否正确。|文件头校验未通过：文件实际内容与扩展名不匹配。|文件体积超出允许上限，请更换较小素材。|图片超过 8 MB 的安全回退上限，请压缩图片或放宽本机端口访问。|操作失败，请检查文件路径与权限。',
    'zh-TW':
      '自訂靜態 / 動態背景桌布 (Beta)|Beta 實驗性功能，預設關閉，可能隨版本調整：純本機讀取圖片與 MP4/WebM，零外網請求，支援失焦或進入對話自動 0fps 休眠。|啟用背景桌布 (Beta)|開啟|關閉|選擇圖片 / 影片|套用|清除|輸入本機圖片或 MP4/WebM 影片絕對路徑…|桌布透明度|高斯模糊|護眼遮罩|鋪滿模式|鋪滿裁切|完整置中|失焦自動暫停影片|視窗失焦或最小化時立即暫停動態影片，降低 GPU 負載。|未啟用桌布（Beta · 零資源佔用）。|Prism 背景守護行程未連線，桌布服務暫時不可用。|已啟用靜態圖片桌布（Beta · 本機唯讀串流）。|已啟用動態影片桌布（Beta · 失焦/隱藏自動 0fps 休眠）。|受宿主安全策略限制時可能降級，已自動切換至安全小圖回退算繪（<= 8 MB）。|動態影片串流受宿主安全策略限制或無法解碼，請改用靜態圖片（<= 8 MB）。|Linux 環境請直接在上方輸入框貼上本機媒體絕對路徑後點擊「套用」。|已取消檔案選擇。|正在開啟系統檔案選擇器…|正在驗證並儲存桌布設定…|已清除桌布並釋放本機連接埠。|檔案格式不支援：僅允許 JPG/PNG/WebP/GIF/AVIF/MP4/WebM（嚴禁 SVG/HTML/腳本）。|安全攔截：禁止讀取系統目錄或憑證目錄（如 .ssh/.aws/.gemini/Windows）。|安全攔截：禁止使用符號連結（Symlink）作為桌布檔案。|安全攔截：禁止使用 UNC 網路路徑或系統裝置路徑。|檔案不存在或無法存取，請檢查路徑是否正確。|檔案標頭驗證未通過：檔案內容與副檔名不符。|檔案體積超出上限，請更換較小素材。|圖片超過 8 MB 的安全回退上限，請壓縮圖片或放寬本機存取限制。|操作失敗，請檢查檔案路徑與權限。',
    en:
      'Custom Static / Live Wallpaper (Beta)|Beta experimental feature (off by default, may evolve across versions): 100% local images & MP4/WebM, zero external network requests, auto 0fps sleep on blur or chat.|Enable Wallpaper (Beta)|On|Off|Choose Image / Video|Apply|Clear|Enter absolute path to local image or MP4/WebM video…|Opacity|Gaussian Blur|Eye-Care Dim|Fit Mode|Cover|Contain|Pause Video on Blur|Automatically pauses video wallpaper when window loses focus or minimizes.|Wallpaper disabled (Beta · 0 resource usage).|Prism background daemon is offline; wallpaper service unavailable.|Static image wallpaper active (Beta · local read-only stream).|Live video wallpaper active (Beta · auto 0fps sleep on blur/hide).|Restricted by host security policy; automatically switched to <= 8 MB safe image fallback.|Video stream restricted by host security policy or failed to decode. Try a static image (<= 8 MB) instead.|On Linux, paste the absolute local media file path above and click Apply.|File selection canceled.|Opening native file picker…|Validating and saving wallpaper settings…|Wallpaper cleared and local port released.|Unsupported format: only JPG/PNG/WebP/GIF/AVIF/MP4/WebM allowed (no SVG/HTML/scripts).|Blocked for security: system and credential directories (.ssh/.aws/.gemini/Windows) are forbidden.|Blocked for security: symbolic links are not allowed as wallpaper files.|Blocked for security: UNC network paths and NT device paths are forbidden.|File not found or unreadable. Check the path and try again.|Magic-byte check failed: file contents do not match its extension.|File size exceeds the maximum allowed limit.|Image exceeds the 8 MB safe fallback limit. Compress the image or allow local loopback stream.|Action failed. Check file path and permissions.',
    ja:
      'カスタム静止画 / 動画壁紙 (Beta)|Beta 実験的機能（既定オフ、今後のバージョンで変更される場合があります）：完全ローカルで静止画・MP4/WebM を読み込み、外部通信ゼロ・非アクティブ時は 0fps 休止。|背景壁紙を有効化 (Beta)|オン|オフ|画像 / 動画を選択|適用|クリア|ローカル画像または MP4/WebM 動画の絶対パスを入力…|不透明度|ぼかし量|保護オーバーレイ|表示モード|画面いっぱいに覆う|全体を表示|フォーカス喪失時に動画を一時停止|ウィンドウが非アクティブ・最小化時に動画再生を自動停止し GPU 負荷を抑えます。|壁紙は無効です（Beta · リソース消費ゼロ）。|Prism バックグラウンドデーモン未接続のため壁紙機能を利用できません。|静止画壁紙が有効です（Beta · ローカル読取専用ストリーム）。|動画壁紙が有効です（Beta · 非表示・非アクティブ時は自動 0fps 休止）。|ホストのセキュリティポリシー制限により、安全な画像フォールバック（<= 8 MB）へ自動切替しました。|動画ストリームがホストのセキュリティポリシーで制限されたかデコードに失敗しました。8 MB 以下の静止画をお試しください。|Linux では上の入力欄へメディアの絶対パスを貼り付けて「適用」を押してください。|ファイル選択をキャンセルしました。|システムファイル選択ダイアログを開いています…|壁紙設定を検証して保存中…|壁紙をクリアしてローカルポートを解放しました。|未対応の形式です：JPG/PNG/WebP/GIF/AVIF/MP4/WebM のみ許可（SVG/HTML/スクリプト禁止）。|セキュリティ保護：システムおよび認証情報ディレクトリ（.ssh/.aws/.gemini/Windows 等）は読取不可です。|セキュリティ保護：シンボリックリンクは壁紙ファイルとして使用できません。|セキュリティ保護：UNC ネットワークパスおよびデバイスパスは使用できません。|ファイルが見つからないか読み取れません。パスを確認してください。|マジックバイト検証に失敗：ファイル実体が拡張子と一致しません。|ファイルサイズが上限を超えています。より小さい素材を選択してください。|画像が 8 MB の安全フォールバック上限を超えています。画像を圧縮してください。|操作に失敗しました。ファイルパスと権限を確認してください。',
    ko:
      '사용자 지정 정적 / 동적 배경화면 (Beta)|Beta 실험적 기능(기본값 꺼짐, 버전에 따라 조정될 수 있음): 100% 로컬 이미지 및 MP4/WebM, 외부 네트워크 요청 없음, 포커스 해제 시 자동 0fps 절전.|배경화면 사용 (Beta)|켜짐|꺼짐|이미지 / 동영상 선택|적용|지우기|로컬 이미지 또는 MP4/WebM 동영상의 절대 경로 입력…|불투명도|가우시안 블러|화면 어둡게|맞춤 모드|채우기|전체 맞춤|포커스 잃을 때 동영상 일시정지|창이 비활성화되거나 최소화되면 동영상 재생을 자동으로 멈춰 GPU 사용을 줄입니다.|배경화면 꺼짐 (Beta · 리소스 사용 없음).|Prism 백그라운드 데몬이 오프라인이라 배경화면 서비스를 사용할 수 없습니다.|정적 이미지 배경화면 활성 (Beta · 로컬 읽기 전용 스트림).|동적 동영상 배경화면 활성 (Beta · 비활성 시 자동 0fps 절전).|호스트 보안 정책으로 로컬 포트가 제한되어 <= 8 MB 안전 이미지 폴백으로 전환했습니다.|동영상 스트림이 호스트 보안 정책에 의해 제한되었거나 디코딩에 실패했습니다. 8 MB 이하 정적 이미지를 사용해 보세요.|Linux에서는 위 입력란에 로컬 미디어 절대 경로를 붙여넣고 적용을 누르세요.|파일 선택이 취소되었습니다.|시스템 파일 선택기를 여는 중…|배경화면 설정을 검증하고 저장하는 중…|배경화면을 지우고 로컬 포트를 해제했습니다.|지원하지 않는 형식입니다: JPG/PNG/WebP/GIF/AVIF/MP4/WebM만 허용됩니다.|보안 차단: 시스템 및 자격 증명 디렉터리(.ssh/.aws/.gemini/Windows)는 금지됩니다.|보안 차단: 심볼릭 링크는 배경화면 파일로 사용할 수 없습니다.|보안 차단: UNC 네트워크 경로 및 장치 경로는 금지됩니다.|파일을 찾을 수 없거나 읽을 수 없습니다. 경로를 확인하세요.|매직 바이트 검사 실패: 파일 내용이 확장자와 일치하지 않습니다.|파일 크기가 허용 한도를 초과했습니다.|이미지가 8 MB 안전 폴백 한도를 초과했습니다. 이미지를 압축하세요.|작업에 실패했습니다. 파일 경로와 권한을 확인하세요.',
    es:
      'Fondo estático / animado personalizado (Beta)|Función Beta experimental (desactivada por defecto, puede evolucionar entre versiones): 100 % imágenes locales y MP4/WebM, cero peticiones externas, reposo automático a 0fps al perder foco.|Activar fondo (Beta)|Activado|Desactivado|Elegir imagen / vídeo|Aplicar|Limpiar|Introduce ruta absoluta a imagen local o vídeo MP4/WebM…|Opacidad|Desenfoque|Atenuación|Ajuste|Cubrir|Contener|Pausar vídeo al desenfocar|Pausa automáticamente el vídeo cuando la ventana pierde el foco o se minimiza.|Fondo desactivado (Beta · 0 uso de recursos).|El demonio de Prism está desconectado; servicio de fondo no disponible.|Fondo de imagen estática activo (Beta · flujo local de solo lectura).|Fondo de vídeo activo (Beta · reposo automático 0fps al ocultar).|Restringido por la política de seguridad del host; se cambió al respaldo seguro de imagen <= 8 MB.|Flujo de vídeo restringido por la política de seguridad del host o error de decodificación. Prueba una imagen <= 8 MB.|En Linux, pega arriba la ruta absoluta del archivo y pulsa Aplicar.|Selección de archivo cancelada.|Abriendo selector de archivos…|Validando y guardando ajustes de fondo…|Fondo borrado y puerto local liberado.|Formato no soportado: solo JPG/PNG/WebP/GIF/AVIF/MP4/WebM (sin SVG/HTML/scripts).|Bloqueado por seguridad: rutas de sistema o credenciales (.ssh/.aws/.gemini/Windows) prohibidas.|Bloqueado por seguridad: no se permiten enlaces simbólicos.|Bloqueado por seguridad: rutas UNC y de dispositivo prohibidas.|Archivo no encontrado o ilegible. Comprueba la ruta.|Falló la verificación de cabecera: el contenido no coincide con la extensión.|El tamaño del archivo supera el límite permitido.|La imagen supera el límite seguro de 8 MB. Comprime la imagen.|Error en la operación. Comprueba ruta y permisos.',
    fr:
      'Fond d’écran statique / animé (Beta)|Fonction Beta expérimentale (désactivée par défaut, susceptible d’évoluer) : images et MP4/WebM 100 % locaux, zéro requête réseau externe, mise en veille 0fps hors focus.|Activer le fond (Beta)|Activé|Désactivé|Choisir image / vidéo|Appliquer|Effacer|Chemin absolu vers une image locale ou vidéo MP4/WebM…|Opacité|Flou gaussien|Assombrissement|Ajustement|Couvrir|Contenir|Mettre la vidéo en pause hors focus|Met automatiquement la vidéo en pause quand la fenêtre perd le focus ou est réduite.|Fond désactivé (Beta · 0 ressource).|Le démon Prism est hors ligne ; service indisponible.|Fond image statique actif (Beta · flux local en lecture seule).|Fond vidéo actif (Beta · veille 0fps auto hors focus).|Restreint par la politique de sécurité hôte ; bascule vers un repli image sécurisé <= 8 Mo.|Flux vidéo restreint par la politique de sécurité hôte ou illisible. Essayez une image <= 8 Mo.|Sous Linux, collez le chemin absolu ci-dessus et cliquez sur Appliquer.|Sélection annulée.|Ouverture du sélecteur de fichiers…|Validation et enregistrement du fond…|Fond effacé et port local libéré.|Format non pris en charge : JPG/PNG/WebP/GIF/AVIF/MP4/WebM uniquement.|Bloqué par sécurité : dossiers système et d’identifiants interdits.|Bloqué par sécurité : les liens symboliques sont interdits.|Bloqué par sécurité : chemins réseau UNC et périphériques interdits.|Fichier introuvable ou illisible. Vérifiez le chemin.|Échec du contrôle d’en-tête : le contenu ne correspond pas à l’extension.|La taille du fichier dépasse la limite autorisée.|L’image dépasse la limite sécurisée de 8 Mo. Compressez l’image.|Échec de l’opération. Vérifiez le chemin et les droits.',
    de:
      'Eigenes statisches / Live-Hintergrundbild (Beta)|Experimentelle Beta-Funktion (standardmäßig aus, kann sich zwischen Versionen ändern): 100 % lokale Bilder & MP4/WebM, keine externen Anfragen, automatischer 0fps-Ruhezustand bei Fokusverlust.|Hintergrund aktivieren (Beta)|Ein|Aus|Bild / Video wählen|Anwenden|Leeren|Absoluten Pfad zu lokalem Bild oder MP4/WebM-Video eingeben…|Deckkraft|Gaußscher Weichzeichner|Abdunklung|Anpassung|Füllen|Einpassen|Video bei Fokusverlust pausieren|Pausiert Live-Videos automatisch bei Fokusverlust oder Minimieren, um GPU zu sparen.|Hintergrund deaktiviert (Beta · 0 Ressourcen).|Prism-Daemon ist offline; Hintergrunddienst nicht verfügbar.|Statisches Hintergrundbild aktiv (Beta · lokaler Nur-Lese-Stream).|Live-Videohintergrund aktiv (Beta · auto 0fps bei Fokusverlust).|Durch Host-Sicherheitsrichtlinie eingeschränkt; sicher auf <= 8 MB Bild-Fallback gewechselt.|Videostream durch Host-Sicherheitsrichtlinie eingeschränkt oder nicht dekodierbar. Bitte Bild <= 8 MB nutzen.|Unter Linux absoluten Dateipfad oben einfügen und auf Anwenden klicken.|Dateiauswahl abgebrochen.|Öffne System-Dateiauswahl…|Prüfe und speichere Hintergrundeinstellungen…|Hintergrund geleert und lokalen Port freigegeben.|Nicht unterstütztes Format: nur JPG/PNG/WebP/GIF/AVIF/MP4/WebM erlaubt.|Aus Sicherheitsgründen blockiert: System- und Anmeldeverzeichnisse verboten.|Aus Sicherheitsgründen blockiert: Symlinks sind nicht erlaubt.|Aus Sicherheitsgründen blockiert: UNC-Netzwerk- und Gerätepfade verboten.|Datei nicht gefunden oder nicht lesbar. Pfad prüfen.|Magic-Byte-Prüfung fehlgeschlagen: Inhalt passt nicht zur Erweiterung.|Dateigröße überschreitet das zulässige Limit.|Bild überschreitet 8 MB Sicherheits-Limit. Bitte Bild komprimieren.|Aktion fehlgeschlagen. Dateipfad und Berechtigungen prüfen.',
  };

  const WALLPAPER_I18N = Object.fromEntries(
    Object.entries(I18N_ROWS).map(([lang, row]) => {
      const vals = row.split('|');
      const map = {};
      for (let i = 0; i < I18N_KEYS.length; i++) map[I18N_KEYS[i]] = vals[i] || '';
      return [lang, map];
    })
  );

  function normalizeLang(raw) {
    const s = String(raw || '').trim().toLowerCase().replace(/_/g, '-');
    if (!s || s === 'auto') return '';
    if (s === 'yue' || s.startsWith('yue-') || s === 'zh-yue' || s.includes('cantonese')) return 'zh-CN';
    if (/^zh-(tw|hk|mo|hant)/.test(s) || s === 'tw' || s === 'hant') return 'zh-TW';
    if (/^zh\b/.test(s)) return 'zh-CN';
    if (/^(ja|jp)\b/.test(s) || s === 'japanese') return 'ja';
    if (/^(ko|kr)\b/.test(s) || s === 'korean') return 'ko';
    if (/^es\b/.test(s) || s === 'spanish') return 'es';
    if (/^fr\b/.test(s) || s === 'french') return 'fr';
    if (/^de\b/.test(s) || s === 'german') return 'de';
    if (/^en\b/.test(s) || s === 'english') return 'en';
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
      const navObj = G && 'navigator' in G ? G.navigator : (typeof navigator !== 'undefined' ? navigator : null);
      const navLang = normalizeLang(navObj?.language || '');
      if (navLang) return navLang;
    } catch {}
    return 'en';
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

  function mapErrorCode(code, pack) {
    switch (code) {
      case 'unsupported-extension':
        return pack.errUnsupportedExt;
      case 'blocked-sensitive-path':
        return pack.errSensitivePath;
      case 'symlink-not-allowed':
        return pack.errSymlink;
      case 'blocked-unc-or-device':
      case 'invalid-scheme':
        return pack.errUncDevice;
      case 'file-not-found':
      case 'not-a-regular-file':
      case 'file-unreadable':
      case 'empty-file':
        return pack.errNotFound;
      case 'invalid-magic-bytes':
        return pack.errInvalidMagic;
      case 'file-too-large':
        return pack.errTooLarge;
      case 'blob-size-limit-exceeded':
        return pack.errBlobTooLarge;
      case 'blob-image-only':
      case 'video-stream-blocked':
        return pack.stVideoBlocked;
      case 'manual-input-required':
        return pack.stManualLinux;
      case 'bridge-offline':
      case 'bridge-disposed':
        return pack.stOffline;
      default:
        return pack.errGeneric;
    }
  }

  function mountWallpaperUi(slotEl, ctx = {}) {
    if (!slotEl) return null;
    const win = (ctx && ctx.window) || (typeof window !== 'undefined' ? window : G);
    const doc = (ctx && ctx.document) || slotEl.ownerDocument || (win && win.document) || (typeof document !== 'undefined' ? document : null);
    if (!doc) return null;

    const guard = typeof ctx.runGuardedMut === 'function' ? ctx.runGuardedMut : (fn) => fn();
    const resolveClient = () => (win && win.__agPrismWallpaper) || G.__agPrismWallpaper || null;
    const resolveBridge = () =>
      (win && win.__agPrismWallpaperBridge) ||
      G.__agPrismWallpaperBridge ||
      resolveClient()?.bridge ||
      null;

    // 幂等复用：已挂载实例仅刷新语言与状态，不重建 DOM 避免打断输入/滑块拖动
    const existingHandle = slotEl.__agPrismWpUiHandle;
    if (existingHandle && existingHandle.root && existingHandle.root.parentElement === slotEl) {
      const nextLang = resolveLang(doc, ctx);
      existingHandle.updateLang(nextLang);
      const client = resolveClient();
      if (client && typeof client.getState === 'function') {
        existingHandle.syncState(client.getState());
      }
      return existingHandle;
    }

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

    const segBtnCls = (ctx && ctx.btnClass) || 'ag-cs-seg-btn data-[pressed]:bg-secondary data-[pressed]:text-foreground';
    let curLang = resolveLang(doc, ctx);
    let pack = WALLPAPER_I18N[curLang] || WALLPAPER_I18N.en;
    let busy = false;
    let customStatus = null; // { tone, text } | null
    let lastState = {
      enabled: false,
      mediaPath: '',
      mediaType: '',
      opacity: 0.28,
      blurPx: 4,
      dimOverlay: 0.45,
      fit: 'cover',
      pauseOnBlur: true,
      renderMode: 'idle',
      lastError: '',
      bridgeOnline: Boolean(resolveBridge()?.isOnline?.()),
    };

    const card = mk('div', 'ag-prism-wp-card');
    card.setAttribute('data-testid', 'prism-wallpaper-card');
    card.setAttribute('data-ag-cs-lang', curLang);
    markNoTrOwned(card);

    // 1) Header + Enable switch
    const headRow = mk('div', 'ag-prism-wp-row');
    const headMeta = mk('div', 'ag-prism-wp-meta');
    const titleEl = mk('span', 'ag-prism-wp-title', pack.title);
    const descEl = mk('span', 'ag-prism-wp-desc', pack.desc);
    headMeta.appendChild(titleEl);
    headMeta.appendChild(descEl);

    const enableGrp = mk('div', 'ag-cs-seg-group');
    enableGrp.setAttribute('role', 'group');
    enableGrp.setAttribute('data-ui-kind', 'switch');
    enableGrp.setAttribute('data-switch-on', '0');
    const enableThumb = mk('span', 'ag-cs-switch-thumb');
    enableThumb.setAttribute('aria-hidden', 'true');
    const enableOnBtn = mkBtn(segBtnCls, pack.on, 'prism-wp-enable-on');
    const enableOffBtn = mkBtn(segBtnCls, pack.off, 'prism-wp-enable-off');
    enableGrp.appendChild(enableThumb);
    enableGrp.appendChild(enableOnBtn);
    enableGrp.appendChild(enableOffBtn);
    headRow.appendChild(headMeta);
    headRow.appendChild(enableGrp);

    // 2) Path input + Pick / Apply / Clear buttons
    const pathRow = mk('div', 'ag-prism-wp-path-row');
    const pathInput = mk('input', 'ag-prism-wp-path-input');
    pathInput.type = 'text';
    pathInput.setAttribute('data-testid', 'prism-wp-path-input');
    pathInput.setAttribute('placeholder', pack.pathPh);
    pathInput.setAttribute('autocomplete', 'off');
    pathInput.setAttribute('spellcheck', 'false');

    const pickBtn = mkBtn('ag-cs-thought-btn', pack.pickBtn, 'prism-wp-pick-btn');
    const applyBtn = mkBtn('ag-cs-thought-btn', pack.applyBtn, 'prism-wp-apply-btn');
    const clearBtn = mkBtn('ag-cs-thought-btn', pack.clearBtn, 'prism-wp-clear-btn');
    pathRow.appendChild(pathInput);
    pathRow.appendChild(pickBtn);
    pathRow.appendChild(applyBtn);
    pathRow.appendChild(clearBtn);

    // 3) Sliders: Opacity / Blur / Dim Overlay
    const slidersGrid = mk('div', 'ag-prism-wp-sliders');
    const mkSlider = (testId, labelText, min, max, step, valText) => {
      const wrap = mk('div', 'ag-prism-wp-slider-item');
      const head = mk('div', 'ag-prism-wp-slider-head');
      const lbl = mk('span', '', labelText);
      const val = mk('span', 'ag-prism-wp-slider-val', valText);
      head.appendChild(lbl);
      head.appendChild(val);
      const inp = mk('input', 'ag-prism-wp-range');
      inp.type = 'range';
      inp.min = String(min);
      inp.max = String(max);
      inp.step = String(step);
      inp.setAttribute('data-testid', testId);
      wrap.appendChild(head);
      wrap.appendChild(inp);
      slidersGrid.appendChild(wrap);
      return { lbl, val, inp };
    };

    const opacityCtrl = mkSlider('prism-wp-opacity', pack.opacityLabel, 0.05, 0.85, 0.01, '28%');
    const blurCtrl = mkSlider('prism-wp-blur', pack.blurLabel, 0, 24, 1, '4 px');
    const dimCtrl = mkSlider('prism-wp-dim', pack.dimLabel, 0, 0.85, 0.01, '45%');

    // 4) Fit Mode (cover / contain)
    const fitRow = mk('div', 'ag-prism-wp-row');
    const fitMeta = mk('div', 'ag-prism-wp-meta');
    const fitLbl = mk('span', 'ag-prism-wp-title', pack.fitLabel);
    fitMeta.appendChild(fitLbl);
    const fitGrp = mk('div', 'ag-cs-seg-group');
    fitGrp.setAttribute('role', 'group');
    const fitCoverBtn = mkBtn(segBtnCls, pack.fitCover, 'prism-wp-fit-cover');
    const fitContainBtn = mkBtn(segBtnCls, pack.fitContain, 'prism-wp-fit-contain');
    fitGrp.appendChild(fitCoverBtn);
    fitGrp.appendChild(fitContainBtn);
    fitRow.appendChild(fitMeta);
    fitRow.appendChild(fitGrp);

    // 5) Pause Video on Blur switch
    const pauseRow = mk('div', 'ag-prism-wp-row');
    const pauseMeta = mk('div', 'ag-prism-wp-meta');
    const pauseLbl = mk('span', 'ag-prism-wp-title', pack.pauseBlurLabel);
    const pauseDesc = mk('span', 'ag-prism-wp-desc', pack.pauseBlurDesc);
    pauseMeta.appendChild(pauseLbl);
    pauseMeta.appendChild(pauseDesc);
    const pauseGrp = mk('div', 'ag-cs-seg-group');
    pauseGrp.setAttribute('role', 'group');
    pauseGrp.setAttribute('data-ui-kind', 'switch');
    pauseGrp.setAttribute('data-switch-on', '1');
    const pauseThumb = mk('span', 'ag-cs-switch-thumb');
    pauseThumb.setAttribute('aria-hidden', 'true');
    const pauseOnBtn = mkBtn(segBtnCls, pack.on, 'prism-wp-pause-blur-on');
    const pauseOffBtn = mkBtn(segBtnCls, pack.off, 'prism-wp-pause-blur-off');
    pauseGrp.appendChild(pauseThumb);
    pauseGrp.appendChild(pauseOnBtn);
    pauseGrp.appendChild(pauseOffBtn);
    pauseRow.appendChild(pauseMeta);
    pauseRow.appendChild(pauseGrp);

    // 6) Status banner
    const statusEl = mk('div', 'ag-prism-wp-status', pack.stIdle);
    statusEl.setAttribute('data-testid', 'prism-wp-status');
    statusEl.setAttribute('role', 'status');
    statusEl.setAttribute('data-tone', 'idle');

    card.appendChild(headRow);
    card.appendChild(pathRow);
    card.appendChild(slidersGrid);
    card.appendChild(fitRow);
    card.appendChild(pauseRow);
    card.appendChild(statusEl);

    function setBtnPressed(btn, on) {
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (on) btn.setAttribute('data-pressed', '');
      else btn.removeAttribute('data-pressed');
    }

    function computeStatusView(st) {
      if (customStatus) return customStatus;
      const bridge = resolveBridge();
      const online = st.bridgeOnline !== undefined ? st.bridgeOnline : Boolean(bridge?.isOnline?.());
      if (!online) return { tone: 'warn', text: pack.stOffline };
      if (st.lastError) return { tone: 'error', text: mapErrorCode(st.lastError, pack) };
      if (st.mediaError) return { tone: 'error', text: mapErrorCode(st.mediaError, pack) };
      if (!st.enabled) return { tone: 'idle', text: pack.stIdle };
      if (st.renderMode === 'blob-fallback') return { tone: 'warn', text: pack.stBlobFallback };
      if (st.mediaType === 'video') return { tone: 'ok', text: pack.stActiveVid };
      if (st.mediaType === 'image') return { tone: 'ok', text: pack.stActiveImg };
      return { tone: 'idle', text: pack.stIdle };
    }

    function renderUiFromState() {
      guard(() => {
        enableGrp.setAttribute('data-switch-on', lastState.enabled ? '1' : '0');
        setBtnPressed(enableOnBtn, lastState.enabled);
        setBtnPressed(enableOffBtn, !lastState.enabled);

        // 仅当输入框未聚焦时同步后端路径，防止打断用户输入
        if (doc.activeElement !== pathInput && pathInput.value !== (lastState.mediaPath || '')) {
          pathInput.value = lastState.mediaPath || '';
        }

        const op = Number.isFinite(Number(lastState.opacity)) ? Number(lastState.opacity) : 0.28;
        const bl = Number.isFinite(Number(lastState.blurPx)) ? Number(lastState.blurPx) : 4;
        const dm = Number.isFinite(Number(lastState.dimOverlay)) ? Number(lastState.dimOverlay) : 0.45;

        opacityCtrl.inp.value = String(op);
        opacityCtrl.val.textContent = `${Math.round(op * 100)}%`;
        blurCtrl.inp.value = String(bl);
        blurCtrl.val.textContent = `${Math.round(bl)} px`;
        dimCtrl.inp.value = String(dm);
        dimCtrl.val.textContent = `${Math.round(dm * 100)}%`;

        const isContain = lastState.fit === 'contain';
        setBtnPressed(fitCoverBtn, !isContain);
        setBtnPressed(fitContainBtn, isContain);

        const pBlur = lastState.pauseOnBlur !== false;
        pauseGrp.setAttribute('data-switch-on', pBlur ? '1' : '0');
        setBtnPressed(pauseOnBtn, pBlur);
        setBtnPressed(pauseOffBtn, !pBlur);

        pickBtn.disabled = busy;
        applyBtn.disabled = busy;
        clearBtn.disabled = busy;

        const sv = computeStatusView(lastState);
        statusEl.setAttribute('data-tone', sv.tone);
        statusEl.textContent = sv.text;
      });
    }

    function updateLang(nextLangRaw) {
      const navObj = win && 'navigator' in win ? win.navigator : (G && 'navigator' in G ? G.navigator : (typeof navigator !== 'undefined' ? navigator : null));
      const nextCode = normalizeLang(nextLangRaw) || normalizeLang(navObj?.language || '') || 'en';
      if (nextCode === curLang) return;
      curLang = nextCode;
      pack = WALLPAPER_I18N[curLang] || WALLPAPER_I18N.en;
      customStatus = null;
      guard(() => {
        card.setAttribute('data-ag-cs-lang', curLang);
        titleEl.textContent = pack.title;
        descEl.textContent = pack.desc;
        enableOnBtn.textContent = pack.on;
        enableOffBtn.textContent = pack.off;
        pathInput.setAttribute('placeholder', pack.pathPh);
        pickBtn.textContent = pack.pickBtn;
        applyBtn.textContent = pack.applyBtn;
        clearBtn.textContent = pack.clearBtn;
        opacityCtrl.lbl.textContent = pack.opacityLabel;
        blurCtrl.lbl.textContent = pack.blurLabel;
        dimCtrl.lbl.textContent = pack.dimLabel;
        fitLbl.textContent = pack.fitLabel;
        fitCoverBtn.textContent = pack.fitCover;
        fitContainBtn.textContent = pack.fitContain;
        pauseLbl.textContent = pack.pauseBlurLabel;
        pauseDesc.textContent = pack.pauseBlurDesc;
        pauseOnBtn.textContent = pack.on;
        pauseOffBtn.textContent = pack.off;
      });
      renderUiFromState();
    }

    function syncState(next) {
      if (!next || typeof next !== 'object') return;
      lastState = { ...lastState, ...next };
      renderUiFromState();
    }

    async function saveConfigPatch(patch, opts = {}) {
      const bridge = resolveBridge();
      if (!bridge || !bridge.isOnline()) {
        customStatus = { tone: 'warn', text: pack.stOffline };
        renderUiFromState();
        return { ok: false, offline: true };
      }
      if (!opts.silentBusy) {
        busy = true;
        customStatus = { tone: 'idle', text: pack.stSaving };
        renderUiFromState();
      }
      try {
        const res = await bridge.saveConfig(patch);
        if (res && res.ok && res.config) {
          customStatus = null;
          const client = resolveClient();
          if (client && typeof client.applyConfig === 'function') {
            lastState = client.applyConfig(res.config);
          } else {
            lastState = { ...lastState, ...res.config, lastError: '' };
          }
        } else {
          customStatus = {
            tone: 'error',
            text: mapErrorCode(res && res.code, pack),
          };
          if (res && res.config) {
            lastState = { ...lastState, ...res.config };
          }
        }
        return res;
      } finally {
        busy = false;
        renderUiFromState();
      }
    }

    enableOnBtn.addEventListener('click', () => {
      const typed = String(pathInput.value || '').trim();
      const patch = typed && typed !== lastState.mediaPath ? { enabled: true, mediaPath: typed } : { enabled: true };
      void saveConfigPatch(patch);
    });
    enableOffBtn.addEventListener('click', () => {
      void saveConfigPatch({ enabled: false });
    });

    pickBtn.addEventListener('click', async () => {
      if (busy) return;
      const bridge = resolveBridge();
      if (!bridge || !bridge.isOnline()) {
        customStatus = { tone: 'warn', text: pack.stOffline };
        renderUiFromState();
        return;
      }
      busy = true;
      customStatus = { tone: 'idle', text: pack.stPicking };
      renderUiFromState();
      try {
        const res = await bridge.pickMedia({ autoEnable: true });
        if (res && res.canceled) {
          customStatus = { tone: 'idle', text: pack.stCanceled };
        } else if (res && res.manualRequired) {
          customStatus = { tone: 'warn', text: pack.stManualLinux };
          try {
            pathInput.focus?.();
          } catch {}
        } else if (res && res.ok && res.config) {
          customStatus = null;
          pathInput.value = res.config.mediaPath || '';
          const client = resolveClient();
          if (client && typeof client.applyConfig === 'function') {
            lastState = client.applyConfig(res.config);
          } else {
            lastState = { ...lastState, ...res.config, lastError: '' };
          }
        } else {
          customStatus = { tone: 'error', text: mapErrorCode(res && res.code, pack) };
        }
      } finally {
        busy = false;
        renderUiFromState();
      }
    });

    applyBtn.addEventListener('click', () => {
      const typed = String(pathInput.value || '').trim();
      if (!typed) {
        void saveConfigPatch({ mediaPath: '', enabled: false });
        return;
      }
      void saveConfigPatch({ mediaPath: typed, enabled: true });
    });

    pathInput.addEventListener('keydown', (ev) => {
      if (ev && ev.key === 'Enter') {
        ev.preventDefault?.();
        applyBtn.click?.();
      }
    });

    clearBtn.addEventListener('click', async () => {
      if (busy) return;
      const bridge = resolveBridge();
      if (!bridge || !bridge.isOnline()) {
        customStatus = { tone: 'warn', text: pack.stOffline };
        renderUiFromState();
        return;
      }
      busy = true;
      renderUiFromState();
      try {
        const res = await bridge.clearMedia();
        if (res && res.ok && res.config) {
          pathInput.value = '';
          customStatus = { tone: 'idle', text: pack.stCleared };
          const client = resolveClient();
          if (client && typeof client.applyConfig === 'function') {
            lastState = client.applyConfig(res.config);
          } else {
            lastState = { ...lastState, ...res.config, lastError: '' };
          }
        } else {
          customStatus = { tone: 'error', text: mapErrorCode(res && res.code, pack) };
        }
      } finally {
        busy = false;
        renderUiFromState();
      }
    });

    const bindSlider = (ctrl, key, fmt) => {
      ctrl.inp.addEventListener('input', () => {
        const v = Number(ctrl.inp.value);
        if (!Number.isFinite(v)) return;
        lastState[key] = v;
        ctrl.val.textContent = fmt(v);
        resolveClient()?.previewVisualVars?.({ [key]: v });
      });
      ctrl.inp.addEventListener('change', () => {
        const v = Number(ctrl.inp.value);
        if (!Number.isFinite(v)) return;
        void saveConfigPatch({ [key]: v }, { silentBusy: true });
      });
    };

    bindSlider(opacityCtrl, 'opacity', (v) => `${Math.round(v * 100)}%`);
    bindSlider(blurCtrl, 'blurPx', (v) => `${Math.round(v)} px`);
    bindSlider(dimCtrl, 'dimOverlay', (v) => `${Math.round(v * 100)}%`);

    fitCoverBtn.addEventListener('click', () => {
      resolveClient()?.previewVisualVars?.({ fit: 'cover' });
      void saveConfigPatch({ fit: 'cover' }, { silentBusy: true });
    });
    fitContainBtn.addEventListener('click', () => {
      resolveClient()?.previewVisualVars?.({ fit: 'contain' });
      void saveConfigPatch({ fit: 'contain' }, { silentBusy: true });
    });

    pauseOnBtn.addEventListener('click', () => {
      void saveConfigPatch({ pauseOnBlur: true }, { silentBusy: true });
    });
    pauseOffBtn.addEventListener('click', () => {
      void saveConfigPatch({ pauseOnBlur: false }, { silentBusy: true });
    });

    let unsub = null;
    const client = resolveClient();
    if (client) {
      if (typeof client.getState === 'function') {
        lastState = { ...lastState, ...client.getState() };
      }
      if (typeof client.subscribe === 'function') {
        unsub = client.subscribe((st) => {
          if (card.isConnected === false) {
            try {
              unsub?.();
            } catch {}
            unsub = null;
            return;
          }
          syncState(st);
        });
      }
    }

    guard(() => {
      while (slotEl.firstChild) slotEl.removeChild(slotEl.firstChild);
      slotEl.hidden = false;
      slotEl.removeAttribute?.('hidden');
      slotEl.appendChild(card);
    });
    renderUiFromState();

    // 初次挂载时若在线且尚未拉过配置，静默同步一次后端配置
    const bridge = resolveBridge();
    if (bridge && bridge.isOnline() && !lastState.mediaPath && !lastState.enabled) {
      void bridge.getConfig().then((res) => {
        if (res && res.ok && res.config) {
          const liveClient = resolveClient();
          if (liveClient && typeof liveClient.applyConfig === 'function') {
            syncState(liveClient.applyConfig(res.config));
          } else {
            syncState({ ...res.config, bridgeOnline: true });
          }
        }
      });
    }

    const handle = {
      root: card,
      updateLang,
      syncState,
      destroy() {
        try {
          unsub?.();
        } catch {}
        unsub = null;
        try {
          card.remove?.();
        } catch {}
        if (slotEl.__agPrismWpUiHandle === handle) {
          slotEl.__agPrismWpUiHandle = null;
        }
      },
    };
    slotEl.__agPrismWpUiHandle = handle;
    return handle;
  }

  const exported = {
    WALLPAPER_I18N,
    mountWallpaperUi,
  };

  G.__prismMountWallpaperUi = mountWallpaperUi;
  G.__agPrismWallpaperSettingsUi = exported;
  if (typeof window !== 'undefined') {
    window.__prismMountWallpaperUi = mountWallpaperUi;
    window.__agPrismWallpaperSettingsUi = exported;
  }
  if (typeof module === 'object' && module.exports) {
    module.exports = exported;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : null);

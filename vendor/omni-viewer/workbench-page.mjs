// Obsidian Prism — Omni Full-Format Streaming Workbench Frontend (workbench-page.mjs)
// Self-contained zero-CDN HTML workbench supporting Video/Audio, SVG/Image Pan-Zoom,
// HTML Responsive Sandbox, PDF Stream, CSV/TSV/JSONL Data Grid, Font Waterfall & Mermaid Vector Lens.

const EXT_KIND_MAP = Object.freeze({
  mp4: 'video',
  webm: 'video',
  mov: 'video',
  m4v: 'video',
  mkv: 'video',
  ogv: 'video',
  avi: 'video',
  mp3: 'audio',
  wav: 'audio',
  ogg: 'audio',
  opus: 'audio',
  m4a: 'audio',
  aac: 'audio',
  flac: 'audio',
  weba: 'audio',
  svg: 'svg',
  svgz: 'svg',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  webp: 'image',
  gif: 'image',
  ico: 'image',
  avif: 'image',
  bmp: 'image',
  apng: 'image',
  html: 'html',
  htm: 'html',
  xhtml: 'html',
  pdf: 'pdf',
  csv: 'table',
  tsv: 'table',
  tab: 'table',
  jsonl: 'table',
  ndjson: 'table',
  ttf: 'font',
  otf: 'font',
  woff: 'font',
  woff2: 'font',
  mmd: 'mermaid',
  mermaid: 'mermaid',
});

const SUPPORTED_KINDS = new Set([
  'video',
  'audio',
  'svg',
  'image',
  'html',
  'pdf',
  'table',
  'font',
  'mermaid',
  'text',
]);

export function detectWorkbenchKind(filePath = '', mime = '') {
  const cleanPath = String(filePath || '')
    .split(/[?#]/)[0]
    .trim();
  const dotIdx = cleanPath.lastIndexOf('.');
  const slashIdx = Math.max(cleanPath.lastIndexOf('/'), cleanPath.lastIndexOf('\\'));
  const ext = dotIdx > slashIdx ? cleanPath.slice(dotIdx + 1).toLowerCase() : '';
  if (ext && Object.prototype.hasOwnProperty.call(EXT_KIND_MAP, ext)) {
    return EXT_KIND_MAP[ext];
  }
  const m = String(mime || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (!m) return 'text';
  if (m === 'image/svg+xml') return 'svg';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  if (m.startsWith('image/')) return 'image';
  if (m === 'text/html' || m === 'application/xhtml+xml') return 'html';
  if (m === 'application/pdf') return 'pdf';
  if (
    m === 'text/csv' ||
    m === 'text/tab-separated-values' ||
    m.includes('jsonl') ||
    m.includes('ndjson')
  ) {
    return 'table';
  }
  if (
    m.startsWith('font/') ||
    m.includes('opentype') ||
    m.includes('truetype') ||
    m.includes('font-woff')
  ) {
    return 'font';
  }
  return 'text';
}

/**
 * RFC4180-compliant CSV / TSV parser supporting quoted fields, embedded newlines, and escaped quotes.
 */
export function parseDelimitedTable(text = '', delimiterHint = '') {
  const raw = String(text || '').replace(/^\uFEFF/, '');
  if (!raw.trim()) return { headers: [], rows: [], delimiter: delimiterHint || ',' };

  let delim = delimiterHint;
  if (!delim) {
    const firstLineEnd = raw.indexOf('\n');
    const sample = firstLineEnd >= 0 ? raw.slice(0, firstLineEnd) : raw.slice(0, 2048);
    const tabs = (sample.match(/\t/g) || []).length;
    const commas = (sample.match(/,/g) || []).length;
    delim = tabs > commas ? '\t' : ',';
  }

  const allRows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const len = raw.length;

  for (let i = 0; i < len; i++) {
    const ch = raw[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < len && raw[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field.length === 0) {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(field);
      field = '';
    } else if (ch === '\r') {
      if (i + 1 < len && raw[i + 1] === '\n') i += 1;
      row.push(field);
      allRows.push(row);
      row = [];
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      allRows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    allRows.push(row);
  }

  while (
    allRows.length > 0 &&
    allRows[allRows.length - 1].length === 1 &&
    allRows[allRows.length - 1][0] === ''
  ) {
    allRows.pop();
  }
  if (allRows.length === 0) return { headers: [], rows: [], delimiter: delim };

  let maxCols = 0;
  for (let i = 0; i < allRows.length; i++) {
    if (allRows[i].length > maxCols) maxCols = allRows[i].length;
  }
  const firstRow = allRows[0];
  const headers = [];
  for (let c = 0; c < maxCols; c++) {
    const h = firstRow[c] !== undefined ? String(firstRow[c]).trim() : '';
    headers.push(h || `Col ${c + 1}`);
  }
  const rows = [];
  for (let r = 1; r < allRows.length; r++) {
    const src = allRows[r];
    const norm = new Array(maxCols);
    for (let c = 0; c < maxCols; c++) {
      norm[c] = src[c] !== undefined ? src[c] : '';
    }
    rows.push(norm);
  }
  return { headers, rows, delimiter: delim };
}

/**
 * Fault-tolerant JSONL / NDJSON parser collecting union column keys without throwing on malformed lines.
 */
export function parseJsonLinesTable(text = '') {
  const raw = String(text || '').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/);
  const parsedObjects = [];
  const colSet = new Set();
  let malformedCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    try {
      const val = JSON.parse(trimmed);
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        for (const k of Object.keys(val)) colSet.add(k);
        parsedObjects.push(val);
      } else {
        colSet.add('value');
        parsedObjects.push({ value: val });
      }
    } catch {
      malformedCount += 1;
      colSet.add('_raw_invalid');
      parsedObjects.push({ _raw_invalid: trimmed.slice(0, 500) });
    }
  }

  const headers = Array.from(colSet);
  const rows = parsedObjects.map((obj) =>
    headers.map((h) => {
      const v = obj[h];
      if (v === undefined || v === null) return '';
      if (typeof v === 'object') {
        try {
          return JSON.stringify(v);
        } catch {
          return String(v);
        }
      }
      return String(v);
    })
  );
  return { headers, rows, malformedCount };
}

/**
 * Formats seconds as mm:ss.SSS (or hh:mm:ss.SSS when >= 3600s).
 */
export function formatTimecodeMs(seconds) {
  const safe = Number.isFinite(Number(seconds)) && Number(seconds) >= 0 ? Number(seconds) : 0;
  const totalMs = Math.round(safe * 1000);
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const sec = totalSec % 60;
  const min = Math.floor(totalSec / 60) % 60;
  const hr = Math.floor(totalSec / 3600);
  const pad2 = (n) => (n < 10 ? `0${n}` : String(n));
  const pad3 = (n) => (n < 10 ? `00${n}` : n < 100 ? `0${n}` : String(n));
  if (hr > 0) return `${pad2(hr)}:${pad2(min)}:${pad2(sec)}.${pad3(ms)}`;
  return `${pad2(min)}:${pad2(sec)}.${pad3(ms)}`;
}

// 8+1-language table: [zh-CN, zh-TW, yue, en, ja, ko, es, fr, de]
export const WORKBENCH_I18N = {
  viewCanvas: ['画布', '畫布', '畫布', 'Canvas', 'キャンバス', '캔버스', 'Lienzo', 'Canevas', 'Leinwand'],
  viewSource: ['源码', '原始碼', '源碼', 'Source', 'ソース', '소스', 'Código', 'Source', 'Quelltext'],
  viewPreview: ['预览', '預覽', '預覽', 'Preview', 'プレビュー', '미리보기', 'Vista previa', 'Aperçu', 'Vorschau'],
  viewSplit: ['对照', '對照', '對照', 'Split', '分割', '분할', 'Dividido', 'Scindé', 'Geteilt'],
  viewTable: ['表格', '表格', '表格', 'Table', 'テーブル', '표', 'Tabla', 'Tableau', 'Tabelle'],
  viewRaw: ['纯文本', '純文字', '純文字', 'Raw Text', 'テキスト', '원문', 'Texto sin formato', 'Texte brut', 'Rohtext'],
  bgChecker: ['棋盘格', '棋盤格', '棋盤格', 'Checker', 'チェッカー', '체커', 'Damero', 'Damier', 'Raster'],
  bgCheckerLight: ['浅棋盘格', '淺棋盤格', '淺棋盤格', 'Light Checker', '明チェッカー', '밝은 체커', 'Damero claro', 'Damier clair', 'Helles Raster'],
  bgCheckerDark: ['深棋盘格', '深棋盤格', '深棋盤格', 'Dark Checker', '暗チェッカー', '어두운 체커', 'Damero oscuro', 'Damier sombre', 'Dunkles Raster'],
  bgDark: ['深色底', '深色底', '深色底', 'Dark', 'ダーク', '어둡게', 'Oscuro', 'Sombre', 'Dunkel'],
  bgLight: ['浅色底', '淺色底', '淺色底', 'Light', 'ライト', '밝게', 'Claro', 'Clair', 'Hell'],
  fitWin: ['适应窗口', '適應視窗', '適應視窗', 'Fit', '全体表示', '맞춤', 'Ajustar', 'Ajuster', 'Anpassen'],
  zoom100: ['1:1', '1:1', '1:1', '1:1', '1:1', '1:1', '1:1', '1:1', '1:1'],
  copySvg: ['复制 SVG', '複製 SVG', '複製 SVG', 'Copy SVG', 'SVG コピー', 'SVG 복사', 'Copiar SVG', 'Copier SVG', 'SVG kopieren'],
  copyText: ['复制内容', '複製內容', '複製內容', 'Copy', 'コピー', '복사', 'Copiar', 'Copier', 'Kopieren'],
  prevFrame: ['< 1帧', '< 1幀', '< 1格', '-1F', '< 1F', '-1F', '-1F', '-1F', '-1F'],
  nextFrame: ['1帧 >', '1幀 >', '1格 >', '+1F', '1F >', '+1F', '+1F', '+1F', '+1F'],
  playPause: ['播放 / 暂停', '播放 / 暫停', '播放 / 暫停', 'Play / Pause', '再生 / 一時停止', '재생 / 일시정지', 'Reproducir / Pausa', 'Lire / Pause', 'Wiedergabe / Pause'],
  loopOne: ['循环', '循環', '循環', 'Loop', 'ループ', '반복', 'Bucle', 'Boucle', 'Schleife'],
  setPointA: ['设 A 点', '設 A 點', '設 A 點', 'Set A', 'A点', 'A 지정', 'Fijar A', 'Définir A', 'A setzen'],
  setPointB: ['设 B 点', '設 B 點', '設 B 點', 'Set B', 'B点', 'B 지정', 'Fijar B', 'Définir B', 'B setzen'],
  clearAB: ['清除 A-B', '清除 A-B', '清除 A-B', 'Clear A-B', 'A-B解除', 'A-B 해제', 'Borrar A-B', 'Effacer A-B', 'A-B löschen'],
  saveFrame: ['下载帧 PNG', '下載幀 PNG', '下載格 PNG', 'Save Frame', 'フレーム保存', '프레임 저장', 'Guardar fotograma', 'Enregistrer l’image', 'Frame speichern'],
  copyFrame: ['复制帧', '複製幀', '複製格', 'Copy Frame', 'フレームコピー', '프레임 복사', 'Copiar fotograma', 'Copier l’image', 'Frame kopieren'],
  addMarker: ['+ 打点', '+ 打點', '+ 打點', '+ Marker', '+ マーカー', '+ 마커', '+ Marcador', '+ Marqueur', '+ Marker'],
  copyMarkers: ['复制时间点', '複製時間點', '複製時間點', 'Copy Timecodes', 'タイムコードコピー', '타임코드 복사', 'Copiar códigos', 'Copier les codes', 'Timecodes kopieren'],
  vpDesktop: ['桌面 100%', '桌面 100%', '桌面 100%', 'Desktop 100%', 'デスクトップ', '데스크톱 100%', 'Escritorio 100%', 'Bureau 100%', 'Desktop 100%'],
  vpTablet: ['平板 768px', '平板 768px', '平板 768px', 'Tablet 768px', 'タブレット 768', '태블릿 768px', 'Tableta 768px', 'Tablette 768px', 'Tablet 768px'],
  vpMobile: ['手机 390px', '手機 390px', '手機 390px', 'Mobile 390px', 'モバイル 390', '모바일 390px', 'Móvil 390px', 'Mobile 390px', 'Mobil 390px'],
  reloadBtn: ['刷新', '重新整理', '重新整理', 'Reload', '再読込', '새로고침', 'Recargar', 'Recharger', 'Neu laden'],
  filterPh: ['搜索过滤数据行…', '搜尋過濾資料列…', '搜尋過濾資料行…', 'Filter rows…', '行を絞り込む…', '행 필터링…', 'Filtrar filas…', 'Filtrer les lignes…', 'Zeilen filtern…'],
  loadMore: ['加载更多切片', '載入更多切片', '載入更多切片', 'Load More', 'さらに読み込む', '더 불러오기', 'Cargar más', 'Charger plus', 'Mehr laden'],
  prevPage: ['上一页', '上一頁', '上一頁', 'Prev', '前へ', '이전', 'Anterior', 'Préc.', 'Zurück'],
  nextPage: ['下一页', '下一頁', '下一頁', 'Next', '次へ', '다음', 'Siguiente', 'Suiv.', 'Weiter'],
  rowsUnit: ['行', '列', '行', 'rows', '行', '행', 'filas', 'lignes', 'Zeilen'],
  colsUnit: ['列', '欄', '欄', 'cols', '列', '열', 'cols', 'cols', 'Spalten'],
  fontPh: ['输入样张测试文本…', '輸入樣張測試文字…', '輸入測試文字…', 'Type sample text…', 'テスト文字列を入力…', '샘플 텍스트 입력…', 'Escribe texto de prueba…', 'Saisir un texte d’essai…', 'Beispieltext eingeben…'],
  fontLiga: ['编程连字', '程式連字', '代碼連字', 'Ligatures', '合字', '합자', 'Ligaduras', 'Ligatures', 'Ligaturen'],
  wrapLines: ['自动换行', '自動換行', '自動換行', 'Wrap', '折り返し', '줄 바꿈', 'Ajuste de línea', 'Retour à la ligne', 'Zeilenumbruch'],
  copiedOk: ['已复制到剪贴板', '已複製到剪貼簿', '已複製到剪貼簿', 'Copied to clipboard', 'コピーしました', '클립보드에 복사됨', 'Copiado al portapapeles', 'Copié dans le presse-papiers', 'In Zwischenablage kopiert'],
  savedPng: ['已导出 PNG', '已匯出 PNG', '已匯出 PNG', 'PNG exported', 'PNGを書き出しました', 'PNG 내보내기 완료', 'PNG exportado', 'PNG exporté', 'PNG exportiert'],
  loading: ['正在加载…', '正在載入…', '載入緊…', 'Loading…', '読み込み中…', '불러오는 중…', 'Cargando…', 'Chargement…', 'Wird geladen…'],
  emptyData: ['暂无可展示内容', '暫無可顯示內容', '暫時冇內容顯示', 'No content to display', '表示するデータがありません', '표시할 내용이 없습니다', 'Sin contenido para mostrar', 'Aucun contenu à afficher', 'Keine Inhalte anzuzeigen'],
  loadError: ['加载失败', '載入失敗', '載入失敗', 'Failed to load file', '読み込みに失敗しました', '파일을 불러오지 못했습니다', 'Error al cargar el archivo', 'Échec du chargement', 'Datei konnte nicht geladen werden'],
  waitingMermaid: ['等待传入图表数据…', '等待傳入圖表資料…', '等待傳入圖表數據…', 'Waiting for diagram payload…', '図表データを待機中…', '다이어그램 데이터 대기 중…', 'Esperando datos del diagrama…', 'En attente du diagramme…', 'Warte auf Diagrammdaten…'],
  sandboxIsolated: ['沙盒隔离', '沙盒隔離', '沙盒隔離', 'Sandbox Isolated', 'サンドボックス隔離', '샌드박스 격리', 'Aislado en sandbox', 'Isolé en sandbox', 'Sandbox-isoliert'],
};

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function serializeSafeJson(val) {
  return JSON.stringify(val)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function extractFileName(filePath = '') {
  const clean = String(filePath || '').split(/[?#]/)[0];
  const idx = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'));
  return idx >= 0 ? clean.slice(idx + 1) : clean;
}

const WORKBENCH_CSS = `
:root {
  color-scheme: dark;
  --wb-r-sm: 4px; --wb-r-md: 6px; --wb-r-lg: 10px;
  --wb-bg: #0B0B0E; --wb-surface: #121318; --wb-panel: #171820; --wb-elevated: #1D1E28;
  --wb-border: rgba(255,255,255,0.08); --wb-border-strong: rgba(255,255,255,0.14);
  --wb-fg: #F2F2F5; --wb-fg-sec: #C4C4CE; --wb-muted: #8A8A98;
  --wb-accent: #669DF6; --wb-accent-ink: #8AB4F8; --wb-accent-fg: #0B0D13; --wb-accent-soft: rgba(102,157,246,0.15);
  --wb-checker-a: #161820; --wb-checker-b: #1F222D;
  --wb-font-sans: "Google Sans", "Google Sans Text", Inter, "Segoe UI Variable", "PingFang SC", "Noto Sans SC", "Microsoft YaHei UI", system-ui, sans-serif;
  --wb-font-mono: "JetBrains Mono", "Cascadia Code", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
html[data-wb-palette="warm"]:not([data-wb-theme="light"]),
html[data-wb-palette="claude"]:not([data-wb-theme="light"]) {
  --wb-bg: #141413; --wb-surface: #1B1A18; --wb-panel: #22201D; --wb-elevated: #292623;
  --wb-border: rgba(245,240,230,0.09); --wb-border-strong: rgba(245,240,230,0.16);
  --wb-fg: #F2EFE9; --wb-fg-sec: #CEC8BC; --wb-muted: #A39E93;
  --wb-accent: #D97757; --wb-accent-ink: #EE9B7E; --wb-accent-fg: #FFFFFF; --wb-accent-soft: rgba(217,119,87,0.16);
  --wb-checker-a: #1A1917; --wb-checker-b: #24221F;
}
html[data-wb-theme="light"] {
  color-scheme: light;
  --wb-bg: #F4F7FB; --wb-surface: #FFFFFF; --wb-panel: #EEF3FA; --wb-elevated: #E5ECF6;
  --wb-border: rgba(15,23,42,0.11); --wb-border-strong: rgba(15,23,42,0.18);
  --wb-fg: #0F172A; --wb-fg-sec: #334155; --wb-muted: #516076;
  --wb-accent: #2563EB; --wb-accent-ink: #1D4ED8; --wb-accent-fg: #FFFFFF; --wb-accent-soft: rgba(37,99,235,0.11);
  --wb-checker-a: #E8EEF6; --wb-checker-b: #F8FAFC;
}
html[data-wb-theme="light"][data-wb-light-preset="alabaster"],
html[data-wb-theme="light"][data-wb-palette="warm"],
html[data-wb-theme="light"][data-wb-palette="claude"] {
  --wb-bg: #F6F4EE; --wb-surface: #FFFFFF; --wb-panel: #EFECE3; --wb-elevated: #E6E1D5;
  --wb-border: rgba(42,32,20,0.12); --wb-border-strong: rgba(42,32,20,0.20);
  --wb-fg: #1C1814; --wb-fg-sec: #3F3830; --wb-muted: #5F564B;
  --wb-accent: #C25934; --wb-accent-ink: #9A3412; --wb-accent-fg: #FFFFFF; --wb-accent-soft: rgba(194,89,52,0.12);
  --wb-checker-a: #EAE5DA; --wb-checker-b: #FAF8F3;
}
html[data-wb-accent="cobalt"] { --wb-accent: #669DF6; --wb-accent-ink: #8AB4F8; --wb-accent-fg: #0B0D13; --wb-accent-soft: rgba(102,157,246,0.16); }
html[data-wb-theme="light"][data-wb-accent="cobalt"] { --wb-accent: #2563EB; --wb-accent-ink: #1D4ED8; --wb-accent-fg: #FFFFFF; --wb-accent-soft: rgba(37,99,235,0.12); }
html[data-wb-accent="iris"] { --wb-accent: #A58AF8; --wb-accent-ink: #BBA6FF; --wb-accent-fg: #120E1F; --wb-accent-soft: rgba(165,138,248,0.16); }
html[data-wb-theme="light"][data-wb-accent="iris"] { --wb-accent: #7C3AED; --wb-accent-ink: #6D28D9; --wb-accent-fg: #FFFFFF; --wb-accent-soft: rgba(124,58,237,0.12); }
html[data-wb-accent="amber"] { --wb-accent: #F2B84B; --wb-accent-ink: #F6CB75; --wb-accent-fg: #14120E; --wb-accent-soft: rgba(242,184,75,0.16); }
html[data-wb-theme="light"][data-wb-accent="amber"] { --wb-accent: #D97706; --wb-accent-ink: #92400E; --wb-accent-fg: #FFFFFF; --wb-accent-soft: rgba(217,119,6,0.12); }
html[data-wb-accent="mono"] { --wb-accent: #D4D7E0; --wb-accent-ink: #E2E5EE; --wb-accent-fg: #0E0F14; --wb-accent-soft: rgba(212,215,224,0.14); }
html[data-wb-theme="light"][data-wb-accent="mono"] { --wb-accent: #334155; --wb-accent-ink: #1E293B; --wb-accent-fg: #F8FAFC; --wb-accent-soft: rgba(51,65,85,0.11); }
html[data-wb-corners="sharp"] { --wb-r-sm: 2px; --wb-r-md: 4px; --wb-r-lg: 6px; }
html[data-wb-corners="soft"] { --wb-r-sm: 6px; --wb-r-md: 10px; --wb-r-lg: 14px; }

* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0; width: 100%; height: 100%; min-height: 100vh; overflow: hidden;
  background: var(--wb-bg); color: var(--wb-fg);
  font-family: var(--wb-font-sans); font-size: 12.5px; line-height: 1.45;
  -webkit-font-smoothing: antialiased;
}
#wb-app { display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 100vh; }
#wb-topbar {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  min-height: 38px; padding: 4px 10px; background: var(--wb-surface);
  border-bottom: 1px solid var(--wb-border); flex-shrink: 0; flex-wrap: wrap;
}
.wb-top-left, .wb-top-right { display: flex; align-items: center; gap: 6px; min-width: 0; flex-wrap: wrap; }
.wb-top-left { flex: 1 1 auto; overflow: hidden; }
.wb-badge {
  display: inline-flex; align-items: center; height: 19px; padding: 0 6px;
  border-radius: var(--wb-r-sm); background: var(--wb-accent-soft); color: var(--wb-accent-ink);
  font-family: var(--wb-font-mono); font-size: 10px; font-weight: 600; letter-spacing: 0.04em; flex-shrink: 0;
}
.wb-filename {
  font-weight: 600; font-size: 12.5px; color: var(--wb-fg);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: min(280px, 46vw);
}
.wb-pill {
  display: inline-flex; align-items: center; height: 20px; padding: 0 7px;
  border-radius: 999px; border: 1px solid var(--wb-border); background: var(--wb-panel);
  color: var(--wb-muted); font-family: var(--wb-font-mono); font-size: 10.5px;
  font-variant-numeric: tabular-nums; white-space: nowrap;
}
.wb-sandbox-badge {
  display: inline-flex; align-items: center; gap: 4px; height: 20px; padding: 0 7px;
  border-radius: 999px; border: 1px solid var(--wb-border-strong); background: var(--wb-panel);
  color: var(--wb-muted); font-size: 10.5px; font-weight: 500; letter-spacing: 0.01em;
  white-space: nowrap; user-select: none;
}
.wb-seg {
  display: inline-flex; align-items: center; gap: 2px; padding: 2px;
  background: var(--wb-panel); border: 1px solid var(--wb-border); border-radius: var(--wb-r-md);
}
.wb-btn, .wb-seg-btn, .wb-select, .wb-input {
  height: 24px; padding: 0 8px; border-radius: var(--wb-r-sm);
  border: 1px solid var(--wb-border); background: var(--wb-surface); color: var(--wb-fg-sec);
  font-family: inherit; font-size: 11.5px; font-weight: 500; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; gap: 4px;
  transition: background 120ms ease, color 120ms ease, border-color 120ms ease; white-space: nowrap;
}
.wb-seg-btn { height: 20px; border: 0; background: transparent; padding: 0 7px; font-size: 11px; }
.wb-btn:hover:not(:disabled), .wb-seg-btn:hover:not(:disabled) { background: var(--wb-elevated); color: var(--wb-fg); }
.wb-btn:disabled, .wb-seg-btn:disabled { opacity: 0.42; cursor: not-allowed; pointer-events: none; }
.wb-btn[data-active="1"], .wb-seg-btn[data-active="1"] {
  background: var(--wb-accent-soft); color: var(--wb-accent-ink); border-color: transparent; font-weight: 600;
}
.wb-select option { background: var(--wb-surface); color: var(--wb-fg); }
.wb-input { cursor: text; outline: none; background: var(--wb-panel); color: var(--wb-fg); }
.wb-input:focus { border-color: var(--wb-accent); }
.wb-mono-readout {
  font-family: var(--wb-font-mono); font-size: 11px; font-variant-numeric: tabular-nums;
  color: var(--wb-fg-sec); padding: 0 4px;
}

#wb-stage { position: relative; flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
#wb-toast {
  position: fixed; right: 12px; bottom: 12px; z-index: 99; padding: 5px 10px;
  border-radius: var(--wb-r-md); background: var(--wb-fg); color: var(--wb-bg);
  font-size: 11.5px; font-weight: 500; opacity: 0; pointer-events: none;
  transform: translateY(6px); transition: opacity 150ms ease, transform 150ms ease;
}
#wb-toast[data-open="1"] { opacity: 0.96; transform: translateY(0); }

/* Media (Video & Audio) */
.wb-media-wrap { display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 0; }
.wb-video-viewport {
  flex: 1 1 auto; min-height: 0; display: flex; align-items: center; justify-content: center;
  background: #050507; padding: 8px; overflow: hidden;
}
.wb-video { max-width: 100%; max-height: 100%; border-radius: var(--wb-r-md); outline: none; background: #000; }
.wb-audio-viewport {
  flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 14px; padding: 20px;
}
.wb-wave-card {
  width: min(100%, 760px); background: var(--wb-surface); border: 1px solid var(--wb-border);
  border-radius: var(--wb-r-lg); padding: 16px; display: flex; flex-direction: column; gap: 12px;
}
.wb-wave-canvas { width: 100%; height: 112px; display: block; cursor: ew-resize; border-radius: var(--wb-r-sm); background: var(--wb-panel); }
.wb-audio-el { width: 100%; height: 34px; }
.wb-media-deck {
  flex-shrink: 0; display: flex; flex-direction: column; gap: 6px; padding: 8px 10px;
  background: var(--wb-surface); border-top: 1px solid var(--wb-border);
}
.wb-toolbar-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.wb-markers { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; min-height: 22px; }
.wb-marker-chip {
  display: inline-flex; align-items: center; gap: 4px; height: 20px; padding: 0 7px;
  border-radius: 999px; background: var(--wb-panel); border: 1px solid var(--wb-border);
  color: var(--wb-fg); font-family: var(--wb-font-mono); font-size: 10.5px; cursor: pointer;
}
.wb-marker-chip:hover { border-color: var(--wb-accent); color: var(--wb-accent); }

/* SVG / Image / Mermaid Pan-Zoom Canvas */
.wb-panzoom-viewport {
  position: relative; flex: 1 1 auto; min-height: 0; overflow: hidden;
  cursor: grab; user-select: none; touch-action: none;
}
.wb-panzoom-viewport:active { cursor: grabbing; }
.wb-panzoom-viewport[data-backdrop="checker"],
.wb-panzoom-viewport[data-backdrop="checker-light"],
.wb-panzoom-viewport[data-backdrop="checker-dark"] {
  background-size: 16px 16px;
  background-position: 0 0, 0 8px, 8px -8px, -8px 0;
}
.wb-panzoom-viewport[data-backdrop="checker"] {
  background-color: var(--wb-checker-a);
  background-image:
    linear-gradient(45deg, var(--wb-checker-b) 25%, transparent 25%),
    linear-gradient(-45deg, var(--wb-checker-b) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, var(--wb-checker-b) 75%),
    linear-gradient(-45deg, transparent 75%, var(--wb-checker-b) 75%);
}
.wb-panzoom-viewport[data-backdrop="checker-light"] {
  background-color: #E2E8F0;
  background-image:
    linear-gradient(45deg, #F8FAFC 25%, transparent 25%),
    linear-gradient(-45deg, #F8FAFC 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #F8FAFC 75%),
    linear-gradient(-45deg, transparent 75%, #F8FAFC 75%);
}
.wb-panzoom-viewport[data-backdrop="checker-dark"] {
  background-color: #14161E;
  background-image:
    linear-gradient(45deg, #212531 25%, transparent 25%),
    linear-gradient(-45deg, #212531 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #212531 75%),
    linear-gradient(-45deg, transparent 75%, #212531 75%);
}
.wb-panzoom-viewport[data-backdrop="dark"] { background: #090A0F; }
.wb-panzoom-viewport[data-backdrop="light"] { background: #F8FAFC; }
.wb-panzoom-layer {
  position: absolute; left: 0; top: 0; transform-origin: 0 0; will-change: transform;
  display: inline-flex; align-items: center; justify-content: center;
}
.wb-panzoom-layer > img, .wb-panzoom-layer > svg { display: block; max-width: none; max-height: none; }

/* HTML Responsive Sandbox & PDF */
.wb-sandbox-shell {
  flex: 1 1 auto; min-height: 0; display: flex; width: 100%; height: 100%; overflow: hidden;
  background: var(--wb-bg);
}
.wb-sandbox-preview-pane {
  flex: 1 1 auto; min-width: 0; height: 100%; display: flex; justify-content: center;
  align-items: stretch; padding: 8px; overflow: auto;
}
.wb-sandbox-frame-wrap {
  width: 100%; height: 100%; background: #FFFFFF; border: 1px solid var(--wb-border-strong);
  border-radius: var(--wb-r-md); overflow: hidden; transition: width 160ms ease; flex-shrink: 0;
}
.wb-sandbox-frame, .wb-pdf-frame { width: 100%; height: 100%; border: 0; display: block; background: #FFF; }
.wb-source-pane {
  flex: 1 1 50%; min-width: 0; height: 100%; overflow: auto; background: var(--wb-surface);
  border-left: 1px solid var(--wb-border); padding: 10px 12px;
  font-family: var(--wb-font-mono); font-size: 12px; line-height: 1.55; white-space: pre; tab-size: 2;
}
.wb-source-pane[data-wrap="1"] { white-space: pre-wrap; word-break: break-word; }

/* Table (CSV / TSV / JSONL) */
.wb-table-bar {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 6px 10px; background: var(--wb-surface); border-bottom: 1px solid var(--wb-border); flex-wrap: wrap;
}
.wb-table-scroll { flex: 1 1 auto; min-height: 0; overflow: auto; background: var(--wb-bg); }
.wb-table { width: max-content; min-width: 100%; border-collapse: separate; border-spacing: 0; font-size: 12px; }
.wb-table th, .wb-table td {
  padding: 5px 10px; border-bottom: 1px solid var(--wb-border); border-right: 1px solid var(--wb-border);
  text-align: left; max-width: 360px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.wb-table th {
  position: sticky; top: 0; z-index: 2; background: var(--wb-panel); color: var(--wb-fg);
  font-weight: 600; cursor: pointer; user-select: none;
}
.wb-table th:hover { background: var(--wb-elevated); }
.wb-table th.wb-col-idx, .wb-table td.wb-col-idx {
  position: sticky; left: 0; z-index: 1; background: var(--wb-surface); color: var(--wb-muted);
  font-family: var(--wb-font-mono); font-size: 11px; text-align: right; width: 48px; min-width: 48px;
}
.wb-table th.wb-col-idx { z-index: 3; background: var(--wb-panel); cursor: default; }
.wb-table tbody tr:hover td { background: var(--wb-accent-soft); }

/* Font Specimen Waterfall */
.wb-font-scroll { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
.wb-font-row {
  padding: 10px 12px; border-radius: var(--wb-r-md); background: var(--wb-surface);
  border: 1px solid var(--wb-border); display: flex; flex-direction: column; gap: 4px;
}
.wb-font-size-tag { font-family: var(--wb-font-mono); font-size: 10.5px; color: var(--wb-muted); }
.wb-font-sample { color: var(--wb-fg); word-break: break-word; line-height: 1.35; }
.wb-glyph-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(38px, 1fr)); gap: 4px;
}
.wb-glyph-cell {
  height: 38px; display: flex; align-items: center; justify-content: center;
  background: var(--wb-surface); border: 1px solid var(--wb-border); border-radius: var(--wb-r-sm);
  font-size: 18px; color: var(--wb-fg);
}
.wb-empty {
  flex: 1 1 auto; display: flex; align-items: center; justify-content: center;
  color: var(--wb-muted); font-size: 12.5px; padding: 24px; text-align: center;
}
`;

function bootPrismWorkbench(INIT_STATE, I18N_TABLE) {
  const LANG_IDX = { 'zh-CN': 0, 'zh-TW': 1, yue: 2, en: 3, ja: 4, ko: 5, es: 6, fr: 7, de: 8 };
  const urlQs = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
  const readHashParams = () =>
    new URLSearchParams(typeof location !== 'undefined' && location.hash ? location.hash.slice(1) : '');
  const hashQs = readHashParams();

  const state = {
    baseUrl: INIT_STATE.baseUrl || (typeof location !== 'undefined' ? location.origin : ''),
    token: INIT_STATE.token || urlQs.get('token') || '',
    path: INIT_STATE.path || urlQs.get('path') || '',
    name: INIT_STATE.name || hashQs.get('title') || urlQs.get('name') || urlQs.get('title') || '',
    kind: INIT_STATE.kind || urlQs.get('kind') || 'auto',
    theme: INIT_STATE.theme || urlQs.get('theme') || 'dark',
    palette: INIT_STATE.palette || urlQs.get('palette') || 'obsidian',
    lightPreset: INIT_STATE.lightPreset || urlQs.get('lightPreset') || 'crystal',
    accent: INIT_STATE.accent || urlQs.get('accent') || 'follow',
    corners: INIT_STATE.corners || urlQs.get('corners') || 'balanced',
    lang: INIT_STATE.lang || urlQs.get('lang') || 'zh-CN',
    rawContent: INIT_STATE.rawContent || hashQs.get('raw') || urlQs.get('raw') || '',
    sandboxUrl: INIT_STATE.sandboxUrl || '',
    meta: INIT_STATE.meta || null,
    textBuffer: '',
    truncated: false,
    nextOffset: 0,
    onThemeRefresh: null,
    cleanupFn: null,
  };

  function tr(key) {
    const row = I18N_TABLE[key];
    if (!row) return key;
    const idx = Object.prototype.hasOwnProperty.call(LANG_IDX, state.lang) ? LANG_IDX[state.lang] : 0;
    return row[idx] !== undefined ? row[idx] : row[0];
  }

  function formatBytes(bytes) {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n < 0) return '';
    if (n < 1024) return `${n} B`;
    if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1073741824) return `${(n / 1048576).toFixed(2)} MB`;
    return `${(n / 1073741824).toFixed(2)} GB`;
  }

  function buildApiUrl(route, extraParams = {}) {
    const base = String(state.baseUrl || '').replace(/\/$/, '');
    const qs = new URLSearchParams();
    if (state.token) qs.set('token', state.token);
    if (state.path && extraParams.path === undefined) qs.set('path', state.path);
    for (const [k, v] of Object.entries(extraParams)) {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    }
    return `${base}${route}?${qs.toString()}`;
  }

  const htmlEl = document.documentElement;
  const badgeEl = document.getElementById('wb-kind-badge');
  const titleEl = document.getElementById('wb-title');
  const pillsEl = document.getElementById('wb-meta-pills');
  const toolsEl = document.getElementById('wb-mode-tools');
  const stageEl = document.getElementById('wb-stage');
  const toastEl = document.getElementById('wb-toast');
  let toastTimer = 0;

  function showToast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.setAttribute('data-open', '1');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.removeAttribute('data-open');
    }, 1800);
  }

  async function copyPlainText(txt) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(String(txt || ''));
        showToast(tr('copiedOk'));
        return true;
      }
    } catch {}
    const ta = document.createElement('textarea');
    ta.value = String(txt || '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      showToast(tr('copiedOk'));
    } catch {}
    ta.remove();
    return true;
  }

  function triggerBlobDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function applyThemeAttrs() {
    htmlEl.setAttribute('data-wb-theme', state.theme === 'light' ? 'light' : 'dark');
    htmlEl.setAttribute('data-wb-palette', state.palette || 'obsidian');
    htmlEl.setAttribute('data-wb-light-preset', state.lightPreset === 'alabaster' ? 'alabaster' : 'crystal');
    htmlEl.setAttribute('data-wb-accent', state.accent || 'follow');
    htmlEl.setAttribute('data-wb-corners', state.corners || 'balanced');
    htmlEl.setAttribute('lang', state.lang || 'zh-CN');
  }

  function setMetaPills(items) {
    pillsEl.replaceChildren();
    for (const txt of items) {
      if (!txt) continue;
      pillsEl.appendChild(el('span', 'wb-pill', txt));
    }
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';

  const SAFE_SVG_TAG_KEYS = [
    'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
    'text', 'tspan', 'defs', 'marker', 'clippath', 'mask', 'pattern',
    'lineargradient', 'radialgradient', 'stop', 'style', 'title', 'desc',
    'use', 'image', 'symbol', 'switch', 'a', 'filter',
    'fegaussianblur', 'feoffset', 'feblend', 'fecolormatrix', 'femerge', 'femergenode', 'fedropshadow',
  ];

  const SAFE_SVG_TAG_NAMES = [
    'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
    'text', 'tspan', 'defs', 'marker', 'clipPath', 'mask', 'pattern',
    'linearGradient', 'radialGradient', 'stop', 'style', 'title', 'desc',
    'use', 'image', 'symbol', 'switch', 'a', 'filter',
    'feGaussianBlur', 'feOffset', 'feBlend', 'feColorMatrix', 'feMerge', 'feMergeNode', 'feDropShadow',
  ];

  const SAFE_SVG_PRESENTATION_KEYS = [
    'version', 'id', 'class', 'viewbox', 'preserveaspectratio',
    'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry',
    'd', 'points', 'transform', 'transform-origin',
    'fill', 'fill-opacity', 'fill-rule',
    'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity',
    'opacity', 'color', 'stop-color', 'stop-opacity', 'offset',
    'gradientunits', 'gradienttransform', 'spreadmethod',
    'patternunits', 'patterncontentunits', 'patterntransform',
    'clippathunits', 'clip-path', 'clip-rule',
    'mask', 'maskunits', 'filter', 'filterunits',
    'stddeviation', 'dx', 'dy', 'in', 'in2', 'result', 'mode', 'type', 'values', 'flood-color', 'flood-opacity',
    'marker-start', 'marker-mid', 'marker-end', 'markerwidth', 'markerheight', 'markerunits', 'refx', 'refy', 'orient',
    'font-family', 'font-size', 'font-weight', 'font-style',
    'text-anchor', 'dominant-baseline', 'alignment-baseline', 'baseline-shift', 'letter-spacing', 'word-spacing', 'text-decoration',
    'xml:space', 'direction', 'unicode-bidi',
    'display', 'visibility', 'overflow', 'vector-effect', 'shape-rendering', 'text-rendering', 'image-rendering', 'paint-order',
    'aria-label', 'aria-hidden', 'role',
  ];

  const SAFE_SVG_PRESENTATION_ATTRS = [
    'version', 'id', 'class', 'viewBox', 'preserveAspectRatio',
    'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry',
    'd', 'points', 'transform', 'transform-origin',
    'fill', 'fill-opacity', 'fill-rule',
    'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity',
    'opacity', 'color', 'stop-color', 'stop-opacity', 'offset',
    'gradientUnits', 'gradientTransform', 'spreadMethod',
    'patternUnits', 'patternContentUnits', 'patternTransform',
    'clipPathUnits', 'clip-path', 'clip-rule',
    'mask', 'maskUnits', 'filter', 'filterUnits',
    'stdDeviation', 'dx', 'dy', 'in', 'in2', 'result', 'mode', 'type', 'values', 'flood-color', 'flood-opacity',
    'marker-start', 'marker-mid', 'marker-end', 'markerWidth', 'markerHeight', 'markerUnits', 'refX', 'refY', 'orient',
    'font-family', 'font-size', 'font-weight', 'font-style',
    'text-anchor', 'dominant-baseline', 'alignment-baseline', 'baseline-shift', 'letter-spacing', 'word-spacing', 'text-decoration',
    'xml:space', 'direction', 'unicode-bidi',
    'display', 'visibility', 'overflow', 'vector-effect', 'shape-rendering', 'text-rendering', 'image-rendering', 'paint-order',
    'aria-label', 'aria-hidden', 'role',
  ];

  function resolveSafeSvgTag(lowerName) {
    const idx = SAFE_SVG_TAG_KEYS.indexOf(lowerName);
    return idx >= 0 ? SAFE_SVG_TAG_NAMES[idx] : null;
  }

  function resolveSafeSvgPresentationAttr(lowerAttr) {
    const idx = SAFE_SVG_PRESENTATION_KEYS.indexOf(lowerAttr);
    return idx >= 0 ? SAFE_SVG_PRESENTATION_ATTRS[idx] : null;
  }

  const HTML_VOID_SKIP_TAGS = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr',
  ]);

  function decodeBasicXmlEntities(raw) {
    const str = String(raw || '');
    if (str.indexOf('&') < 0) return str;
    let out = '';
    let i = 0;
    const n = str.length;
    while (i < n) {
      const amp = str.indexOf('&', i);
      if (amp < 0) {
        out += str.slice(i);
        break;
      }
      out += str.slice(i, amp);
      const semi = str.indexOf(';', amp + 1);
      if (semi < 0 || semi - amp > 12) {
        out += '&';
        i = amp + 1;
        continue;
      }
      const ent = str.slice(amp + 1, semi);
      let decoded = null;
      if (ent === 'lt') decoded = '<';
      else if (ent === 'gt') decoded = '>';
      else if (ent === 'amp') decoded = '&';
      else if (ent === 'quot') decoded = '"';
      else if (ent === 'apos') decoded = "'";
      else if (ent === 'nbsp') decoded = '\u00A0';
      else if (ent.startsWith('#x') || ent.startsWith('#X')) {
        const code = Number.parseInt(ent.slice(2), 16);
        if (Number.isInteger(code) && code >= 0x20 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff)) {
          decoded = String.fromCodePoint(code);
        }
      } else if (ent.startsWith('#')) {
        const code = Number.parseInt(ent.slice(1), 10);
        if (Number.isInteger(code) && code >= 0x20 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff)) {
          decoded = String.fromCodePoint(code);
        }
      }
      if (decoded !== null) {
        out += decoded;
        i = semi + 1;
      } else {
        out += '&';
        i = amp + 1;
      }
    }
    return out;
  }

  function escapeXmlText(raw) {
    let out = '';
    const s = String(raw || '');
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === '&') out += '&amp;';
      else if (ch === '<') out += '&lt;';
      else if (ch === '>') out += '&gt;';
      else out += ch;
    }
    return out;
  }

  function escapeXmlAttr(raw) {
    let out = '';
    const s = String(raw || '');
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === '&') out += '&amp;';
      else if (ch === '<') out += '&lt;';
      else if (ch === '>') out += '&gt;';
      else if (ch === '"') out += '&quot;';
      else out += ch;
    }
    return out;
  }

  function stripCssCommentsLinear(cssText) {
    const src = String(cssText || '');
    let out = '';
    let pos = 0;
    while (pos < src.length) {
      const open = src.indexOf('/*', pos);
      if (open < 0) {
        out += src.slice(pos);
        break;
      }
      out += src.slice(pos, open);
      const close = src.indexOf('*/', open + 2);
      if (close < 0) break;
      pos = close + 2;
    }
    return out;
  }

  function hasOnlySafeCssUrls(valStr) {
    const lower = valStr.toLowerCase();
    if (lower.includes('image-set(') || lower.includes('-webkit-image-set(')) return false;
    let pos = 0;
    while (pos < lower.length) {
      const idx = lower.indexOf('url(', pos);
      if (idx < 0) return true;
      const close = valStr.indexOf(')', idx + 4);
      if (close < 0) return false;
      let inner = valStr.slice(idx + 4, close).trim();
      if (
        (inner.startsWith('"') && inner.endsWith('"') && inner.length >= 2) ||
        (inner.startsWith("'") && inner.endsWith("'") && inner.length >= 2)
      ) {
        inner = inner.slice(1, -1).trim();
      }
      if (!/^#[A-Za-z0-9_.:-]+$/.test(inner)) return false;
      pos = close + 1;
    }
    return true;
  }

  function sanitizeSvgStyleDeclarations(rawStyle) {
    const cleanInput = stripCssCommentsLinear(rawStyle);
    if (!cleanInput) return '';
    const parts = cleanInput.split(';');
    const safeDecls = [];
    for (let i = 0; i < parts.length; i++) {
      const decl = parts[i].trim();
      if (!decl) continue;
      const colon = decl.indexOf(':');
      if (colon <= 0) continue;
      const prop = decl.slice(0, colon).trim();
      const val = decl.slice(colon + 1).trim();
      if (!prop || !val) continue;
      if (!/^(?:--[A-Za-z0-9_-]+|[A-Za-z][A-Za-z0-9-]*)$/.test(prop)) continue;
      if (val.indexOf('\\') >= 0 || val.indexOf('<') >= 0 || val.indexOf('>') >= 0) continue;
      const lowVal = val.toLowerCase();
      if (
        lowVal.includes('@import') ||
        lowVal.includes('@charset') ||
        lowVal.includes('expression') ||
        lowVal.includes('javascript') ||
        lowVal.includes('vbscript') ||
        lowVal.includes('behavior') ||
        lowVal.includes('-moz-binding')
      ) {
        continue;
      }
      if (!hasOnlySafeCssUrls(val)) continue;
      safeDecls.push(`${prop}: ${val}`);
    }
    return safeDecls.join('; ');
  }

  function sanitizeSvgStyleSheet(rawCss) {
    const stripped = stripCssCommentsLinear(rawCss);
    if (!stripped) return '';
    const safeRules = [];
    let pos = 0;
    const len = stripped.length;
    while (pos < len) {
      const braceOpen = stripped.indexOf('{', pos);
      if (braceOpen < 0) break;
      const rawSel = stripped.slice(pos, braceOpen).trim();
      let depth = 1;
      let cursor = braceOpen + 1;
      while (cursor < len && depth > 0) {
        const ch = stripped[cursor];
        if (ch === '{') depth += 1;
        else if (ch === '}') depth -= 1;
        cursor += 1;
      }
      const rawBody = stripped.slice(braceOpen + 1, Math.max(braceOpen + 1, cursor - 1));
      pos = cursor;
      const selStart = rawSel.lastIndexOf(';');
      const cleanSel = (selStart >= 0 ? rawSel.slice(selStart + 1) : rawSel).trim();
      if (
        !cleanSel ||
        cleanSel.startsWith('@') ||
        cleanSel.indexOf('\\') >= 0 ||
        cleanSel.indexOf('<') >= 0 ||
        cleanSel.indexOf('>') >= 0
      ) {
        continue;
      }
      const cleanBody = sanitizeSvgStyleDeclarations(rawBody);
      if (cleanBody) {
        safeRules.push(`${cleanSel} { ${cleanBody}; }`);
      }
    }
    return safeRules.join('\n');
  }

  function isAsciiWhitespace(code) {
    return code === 32 || code === 9 || code === 10 || code === 13 || code === 12;
  }

  function isTagNameChar(code) {
    return (
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122) ||
      (code >= 48 && code <= 57) ||
      code === 45 ||
      code === 95 ||
      code === 58 ||
      code === 46
    );
  }

  function findRawScriptEnd(src, fromIdx) {
    const n = src.length;
    let p = fromIdx;
    while (p < n) {
      const lt = src.indexOf('</', p);
      if (lt < 0) return n;
      if (src.slice(lt + 2, lt + 8).toLowerCase() === 'script') {
        const nextCode = src.charCodeAt(lt + 8);
        if (Number.isNaN(nextCode) || isAsciiWhitespace(nextCode) || nextCode === 62 || nextCode === 47) {
          const gt = src.indexOf('>', lt + 8);
          return gt < 0 ? n : gt + 1;
        }
      }
      p = lt + 2;
    }
    return n;
  }

  function skipDeclarationOrPi(src, fromIdx) {
    const n = src.length;
    let i = fromIdx;
    let quote = 0;
    let bracketDepth = 0;
    while (i < n) {
      const code = src.charCodeAt(i);
      if (quote !== 0) {
        if (code === quote) quote = 0;
      } else if (code === 34 || code === 39) {
        quote = code;
      } else if (code === 91) {
        bracketDepth += 1;
      } else if (code === 93 && bracketDepth > 0) {
        bracketDepth -= 1;
      } else if (code === 62 && bracketDepth === 0) {
        return i + 1;
      }
      i += 1;
    }
    return n;
  }

  function findSvgStartIndex(src) {
    const lower = src.toLowerCase();
    let pos = 0;
    while (pos < lower.length) {
      const idx = lower.indexOf('<svg', pos);
      if (idx < 0) return -1;
      const next = lower.charCodeAt(idx + 4);
      if (Number.isNaN(next) || isAsciiWhitespace(next) || next === 62 || next === 47) {
        return idx;
      }
      pos = idx + 4;
    }
    return -1;
  }

  const SAFE_FRAGMENT_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_.:-';
  const SAFE_BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

  function resolveSafeRasterDataPrefix(subMime) {
    if (subMime === 'png') return 'data:image/png;base64,';
    if (subMime === 'jpeg' || subMime === 'jpg') return 'data:image/jpeg;base64,';
    if (subMime === 'webp') return 'data:image/webp;base64,';
    if (subMime === 'gif') return 'data:image/gif;base64,';
    return null;
  }

  function rebuildSafeChars(str, alphabet) {
    if (!str) return null;
    let out = '';
    for (let i = 0; i < str.length; i++) {
      const idx = alphabet.indexOf(str[i]);
      if (idx < 0) return null;
      out += alphabet[idx];
    }
    return out;
  }

  function sanitizeSvgHrefConstantPool(rawVal, allowRasterDataUri) {
    const trimmed = String(rawVal || '').trim();
    if (!trimmed) return null;
    if (trimmed[0] === '#' && trimmed.length > 1 && trimmed.length <= 256) {
      const cleanId = rebuildSafeChars(trimmed.slice(1), SAFE_FRAGMENT_CHARS);
      return cleanId ? `#${cleanId}` : null;
    }
    if (allowRasterDataUri && trimmed.slice(0, 11).toLowerCase() === 'data:image/') {
      const semi = trimmed.indexOf(';', 11);
      if (semi > 11 && semi <= 20 && trimmed.slice(semi, semi + 8).toLowerCase() === ';base64,') {
        const subMime = trimmed.slice(11, semi).toLowerCase();
        const safePrefix = resolveSafeRasterDataPrefix(subMime);
        if (safePrefix) {
          const cleanB64 = rebuildSafeChars(trimmed.slice(semi + 8), SAFE_BASE64_CHARS);
          if (cleanB64) return safePrefix + cleanB64;
        }
      }
    }
    return null;
  }

  function applySafeSvgAttribute(elNode, canonicalTag, rawAttrName, rawAttrValue) {
    const attrLower = rawAttrName.toLowerCase();
    const decodedVal = decodeBasicXmlEntities(rawAttrValue);
    if (attrLower === 'href' || attrLower === 'xlink:href') {
      const safeRef = sanitizeSvgHrefConstantPool(decodedVal, canonicalTag === 'image');
      if (
        safeRef &&
        (safeRef.startsWith('#') ||
          safeRef.startsWith('data:image/png;base64,') ||
          safeRef.startsWith('data:image/jpeg;base64,') ||
          safeRef.startsWith('data:image/webp;base64,') ||
          safeRef.startsWith('data:image/gif;base64,'))
      ) {
        elNode.setAttribute('href', safeRef);
      }
      return;
    }
    if (attrLower === 'style') {
      const safeStyle = sanitizeSvgStyleDeclarations(decodedVal);
      if (safeStyle) elNode.setAttribute('style', safeStyle);
      return;
    }
    if (attrLower === 'xmlns') {
      elNode.setAttribute('xmlns', SVG_NS);
      return;
    }
    const canonicalAttr = resolveSafeSvgPresentationAttr(attrLower);
    if (!canonicalAttr) return;
    if (
      canonicalAttr === 'clip-path' ||
      canonicalAttr === 'fill' ||
      canonicalAttr === 'stroke' ||
      canonicalAttr === 'filter' ||
      canonicalAttr === 'mask' ||
      canonicalAttr === 'marker-start' ||
      canonicalAttr === 'marker-mid' ||
      canonicalAttr === 'marker-end'
    ) {
      if (!hasOnlySafeCssUrls(decodedVal)) return;
    }
    elNode.setAttribute(canonicalAttr, decodedVal);
  }

  function mountSafeSvgDom(doc, rawSvg) {
    if (typeof rawSvg !== 'string' || rawSvg.length === 0 || rawSvg.length > 8 * 1024 * 1024) {
      return null;
    }
    const startIdx = findSvgStartIndex(rawSvg);
    if (startIdx < 0) return null;

    const createSvgEl = (canonicalTag) =>
      typeof doc.createElementNS === 'function'
        ? doc.createElementNS(SVG_NS, canonicalTag)
        : doc.createElement(canonicalTag);
    const appendSafeText = (parent, parentTag, rawText, decodeEntities) => {
      if (!rawText) return;
      const textVal = decodeEntities ? decodeBasicXmlEntities(rawText) : rawText;
      if (!textVal) return;
      if (parentTag === 'style') {
        const prevCss = parent.textContent || '';
        const mergedCss = sanitizeSvgStyleSheet(prevCss ? `${prevCss}\n${textVal}` : textVal);
        parent.textContent = mergedCss;
        return;
      }
      if (typeof doc.createTextNode === 'function') {
        parent.appendChild(doc.createTextNode(textVal));
      } else {
        parent.textContent = (parent.textContent || '') + textVal;
      }
    };

    const len = rawSvg.length;
    let i = startIdx;
    let rootSvg = null;
    const elStack = [];
    const tagStack = [];
    const skipStack = [];

    while (i < len) {
      const lt = rawSvg.indexOf('<', i);
      if (lt < 0) {
        if (skipStack.length === 0 && elStack.length > 0) {
          appendSafeText(elStack[elStack.length - 1], tagStack[tagStack.length - 1], rawSvg.slice(i), true);
        }
        break;
      }
      if (lt > i && skipStack.length === 0 && elStack.length > 0) {
        appendSafeText(elStack[elStack.length - 1], tagStack[tagStack.length - 1], rawSvg.slice(i, lt), true);
      }
      if (lt + 1 >= len) break;

      if (rawSvg.startsWith('<!--', lt)) {
        const endComment = rawSvg.indexOf('-->', lt + 4);
        i = endComment < 0 ? len : endComment + 3;
        continue;
      }
      if (rawSvg.startsWith('<![CDATA[', lt)) {
        const endCdata = rawSvg.indexOf(']]>', lt + 9);
        const cdataBody = endCdata < 0 ? rawSvg.slice(lt + 9) : rawSvg.slice(lt + 9, endCdata);
        if (skipStack.length === 0 && elStack.length > 0) {
          appendSafeText(elStack[elStack.length - 1], tagStack[tagStack.length - 1], cdataBody, false);
        }
        i = endCdata < 0 ? len : endCdata + 3;
        continue;
      }
      const secondChar = rawSvg.charCodeAt(lt + 1);
      if (secondChar === 33 || secondChar === 63) {
        i = skipDeclarationOrPi(rawSvg, lt + 2);
        continue;
      }

      // Closing tag </name>
      if (secondChar === 47) {
        let p = lt + 2;
        while (p < len && isAsciiWhitespace(rawSvg.charCodeAt(p))) p += 1;
        const nameStart = p;
        while (p < len && isTagNameChar(rawSvg.charCodeAt(p))) p += 1;
        const closeLower = rawSvg.slice(nameStart, p).toLowerCase();
        const gt = rawSvg.indexOf('>', p);
        i = gt < 0 ? len : gt + 1;
        if (!closeLower) continue;

        if (skipStack.length > 0) {
          const matchIdx = skipStack.lastIndexOf(closeLower);
          if (matchIdx >= 0) {
            skipStack.length = matchIdx;
          }
          continue;
        }
        const canonicalClose = resolveSafeSvgTag(closeLower);
        if (canonicalClose) {
          const matchIdx = tagStack.lastIndexOf(canonicalClose);
          if (matchIdx >= 0) {
            elStack.length = matchIdx;
            tagStack.length = matchIdx;
            if (matchIdx === 0 && rootSvg) {
              break;
            }
          }
        }
        continue;
      }

      // Opening tag <name attr="val" ...>
      let p = lt + 1;
      if (!isTagNameChar(rawSvg.charCodeAt(p))) {
        if (skipStack.length === 0 && elStack.length > 0) {
          appendSafeText(elStack[elStack.length - 1], tagStack[tagStack.length - 1], '<', false);
        }
        i = lt + 1;
        continue;
      }
      while (p < len && isTagNameChar(rawSvg.charCodeAt(p))) p += 1;
      const rawTagLower = rawSvg.slice(lt + 1, p).toLowerCase();

      const parsedAttrs = [];
      let selfClosing = false;
      let malformed = false;
      while (p < len) {
        while (p < len && isAsciiWhitespace(rawSvg.charCodeAt(p))) p += 1;
        if (p >= len) {
          malformed = true;
          break;
        }
        const ch = rawSvg.charCodeAt(p);
        if (ch === 62) {
          p += 1;
          break;
        }
        if (ch === 47 && p + 1 < len && rawSvg.charCodeAt(p + 1) === 62) {
          selfClosing = true;
          p += 2;
          break;
        }
        if (!isTagNameChar(ch)) {
          p += 1;
          continue;
        }
        const attrStart = p;
        while (p < len && isTagNameChar(rawSvg.charCodeAt(p))) p += 1;
        const attrName = rawSvg.slice(attrStart, p);
        while (p < len && isAsciiWhitespace(rawSvg.charCodeAt(p))) p += 1;
        let attrVal = '';
        if (p < len && rawSvg.charCodeAt(p) === 61) {
          p += 1;
          while (p < len && isAsciiWhitespace(rawSvg.charCodeAt(p))) p += 1;
          if (p < len) {
            const q = rawSvg.charCodeAt(p);
            if (q === 34 || q === 39) {
              p += 1;
              const valStart = p;
              const endQ = rawSvg.indexOf(q === 34 ? '"' : "'", p);
              if (endQ < 0) {
                attrVal = rawSvg.slice(valStart);
                p = len;
              } else {
                attrVal = rawSvg.slice(valStart, endQ);
                p = endQ + 1;
              }
            } else {
              const valStart = p;
              while (
                p < len &&
                !isAsciiWhitespace(rawSvg.charCodeAt(p)) &&
                rawSvg.charCodeAt(p) !== 62 &&
                !(rawSvg.charCodeAt(p) === 47 && p + 1 < len && rawSvg.charCodeAt(p + 1) === 62)
              ) {
                p += 1;
              }
              attrVal = rawSvg.slice(valStart, p);
            }
          }
        }
        parsedAttrs.push([attrName, attrVal]);
      }
      i = p;
      if (malformed) break;

      if (rawTagLower === 'script') {
        if (!selfClosing) {
          i = findRawScriptEnd(rawSvg, i);
        }
        continue;
      }

      if (skipStack.length > 0) {
        if (!selfClosing && !HTML_VOID_SKIP_TAGS.has(rawTagLower)) {
          skipStack.push(rawTagLower);
        }
        continue;
      }

      const canonicalTag = resolveSafeSvgTag(rawTagLower);
      if (!canonicalTag) {
        if (!rootSvg) return null;
        if (!selfClosing && !HTML_VOID_SKIP_TAGS.has(rawTagLower)) {
          skipStack.push(rawTagLower);
        }
        continue;
      }
      if (!rootSvg && canonicalTag !== 'svg') {
        return null;
      }

      const node = createSvgEl(canonicalTag);
      for (let a = 0; a < parsedAttrs.length; a++) {
        applySafeSvgAttribute(node, canonicalTag, parsedAttrs[a][0], parsedAttrs[a][1]);
      }
      if (canonicalTag === 'svg' && !node.getAttribute('xmlns')) {
        node.setAttribute('xmlns', SVG_NS);
      }

      if (!rootSvg) {
        rootSvg = node;
      } else if (elStack.length > 0) {
        elStack[elStack.length - 1].appendChild(node);
      }

      if (!selfClosing) {
        elStack.push(node);
        tagStack.push(canonicalTag);
      } else if (node === rootSvg) {
        break;
      }
    }

    return rootSvg;
  }

  function resolveSerializableSvgAttr(lowerAttr) {
    if (lowerAttr === 'xmlns') return 'xmlns';
    if (lowerAttr === 'style') return 'style';
    if (lowerAttr === 'href') return 'href';
    return resolveSafeSvgPresentationAttr(lowerAttr);
  }

  function serializeSafeSvgNode(node) {
    if (!node) return '';
    if (node.nodeType === 3 || node._isText) {
      return escapeXmlText(node.nodeValue ?? node.textContent ?? '');
    }
    const rawName = String(node.localName || node.tagName || '').toLowerCase();
    const canonicalTag = resolveSafeSvgTag(rawName);
    if (!canonicalTag) return '';
    let out = `<${canonicalTag}`;
    if (node.attributes && typeof node.attributes.length === 'number') {
      for (let i = 0; i < node.attributes.length; i++) {
        const attr = node.attributes[i];
        const cAttr = resolveSerializableSvgAttr(String(attr.name || '').toLowerCase());
        if (cAttr) {
          out += ` ${cAttr}="${escapeXmlAttr(attr.value)}"`;
        }
      }
    } else if (node._attrs instanceof Map) {
      for (const [k, v] of node._attrs.entries()) {
        const cAttr = resolveSerializableSvgAttr(String(k || '').toLowerCase());
        if (cAttr) {
          out += ` ${cAttr}="${escapeXmlAttr(v)}"`;
        }
      }
    }
    const kids = node.childNodes || node.children || [];
    if (kids.length === 0) {
      const leafText = canonicalTag === 'style' ? (node.textContent || '') : '';
      if (!leafText) return `${out}/>`;
      return `${out}>${escapeXmlText(leafText)}</${canonicalTag}>`;
    }
    out += '>';
    for (let i = 0; i < kids.length; i++) {
      out += serializeSafeSvgNode(kids[i]);
    }
    out += `</${canonicalTag}>`;
    return out;
  }

  function readSvgDimensionsFromElement(svgEl) {
    let w = 0;
    let h = 0;
    let viewBox = '';
    const rawVb = (svgEl && svgEl.getAttribute('viewBox')) || '';
    if (rawVb) {
      viewBox = rawVb.trim();
      const parts = viewBox.split(/[\s,]+/).map(Number);
      if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
        w = parts[2];
        h = parts[3];
      }
    }
    const parseLen = (val) => {
      if (!val) return 0;
      const m = String(val).trim().match(/^([0-9]+(?:\.[0-9]+)?)(?:px)?$/i);
      return m ? Number(m[1]) : 0;
    };
    const explicitW = parseLen(svgEl && svgEl.getAttribute('width'));
    const explicitH = parseLen(svgEl && svgEl.getAttribute('height'));
    if (explicitW > 0) w = explicitW;
    if (explicitH > 0) h = explicitH;
    if (w <= 0 || h <= 0) {
      w = 800;
      h = 600;
    }
    return { width: Math.round(w * 100) / 100, height: Math.round(h * 100) / 100, viewBox };
  }

  function rasterizeSvgToPng(svgMarkup, scaleMul, baseName) {
    const svgEl = mountSafeSvgDom(document, svgMarkup);
    if (!svgEl) return;
    const dims = readSvgDimensionsFromElement(svgEl);
    const MAX_DIM = 8192;
    const MAX_PIXELS = 33554432;
    let outW = Math.max(1, Math.round(dims.width * scaleMul));
    let outH = Math.max(1, Math.round(dims.height * scaleMul));
    if (outW > MAX_DIM || outH > MAX_DIM) {
      const k = MAX_DIM / Math.max(outW, outH);
      outW = Math.max(1, Math.floor(outW * k));
      outH = Math.max(1, Math.floor(outH * k));
    }
    if (outW * outH > MAX_PIXELS) {
      const k = Math.sqrt(MAX_PIXELS / (outW * outH));
      outW = Math.max(1, Math.floor(outW * k));
      outH = Math.max(1, Math.floor(outH * k));
    }
    const cleanXml = serializeSafeSvgNode(svgEl);
    if (!cleanXml) return;
    const blob = new Blob([cleanXml], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = outW;
      cv.height = outH;
      const ctx = cv.getContext('2d');
      if (ctx) {
        try {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, outW, outH);
          cv.toBlob((pngBlob) => {
            if (pngBlob) {
              const stem = (baseName || 'vector').replace(/\.[^.]+$/, '');
              triggerBlobDownload(pngBlob, `${stem}-${scaleMul}x.png`);
              showToast(`${tr('savedPng')} (${outW}×${outH})`);
            }
          }, 'image/png');
        } catch {
          showToast(tr('loadError'));
        }
      }
      URL.revokeObjectURL(url);
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  }

  // ── Engine 2 & 5: Pan-Zoom Vector / Bitmap / Mermaid Stage ───────────────
  function mountPanZoomStage({ isVector, svgMarkup, imgUrl, rawSource }) {
    let viewMode = 'canvas';
    let backdrop = 'checker';
    let scale = 1;
    let panX = 0;
    let panY = 0;
    let natW = 800;
    let natH = 600;
    let viewBoxStr = '';

    toolsEl.replaceChildren();
    stageEl.replaceChildren();

    const viewport = el('div', 'wb-panzoom-viewport');
    viewport.setAttribute('data-backdrop', backdrop);
    const layer = el('div', 'wb-panzoom-layer');
    viewport.appendChild(layer);

    const sourcePane = el('pre', 'wb-source-pane');
    sourcePane.hidden = true;
    sourcePane.textContent = rawSource || svgMarkup || '';

    stageEl.appendChild(viewport);
    stageEl.appendChild(sourcePane);

    const zoomReadout = el('span', 'wb-mono-readout', '100%');
    const applyTransform = () => {
      layer.style.transform = `translate3d(${panX.toFixed(2)}px, ${panY.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;
      zoomReadout.textContent = `${Math.round(scale * 100)}%`;
    };

    const fitToViewport = () => {
      const vw = viewport.clientWidth || 640;
      const vh = viewport.clientHeight || 420;
      if (natW <= 0 || natH <= 0) return;
      const pad = 32;
      const fitS = Math.min((vw - pad) / natW, (vh - pad) / natH, 4);
      scale = Math.max(0.1, Math.min(16, Number.isFinite(fitS) && fitS > 0 ? fitS : 1));
      panX = (vw - natW * scale) * 0.5;
      panY = (vh - natH * scale) * 0.5;
      applyTransform();
    };

    const setZoomOneToOne = () => {
      const vw = viewport.clientWidth || 640;
      const vh = viewport.clientHeight || 420;
      scale = 1;
      panX = (vw - natW) * 0.5;
      panY = (vh - natH) * 0.5;
      applyTransform();
    };

    const zoomAroundPoint = (nextScaleRaw, cx, cy) => {
      const nextS = Math.max(0.1, Math.min(16, nextScaleRaw));
      const ratio = nextS / scale;
      panX = cx - (cx - panX) * ratio;
      panY = cy - (cy - panY) * ratio;
      scale = nextS;
      applyTransform();
    };

    if (isVector) {
      const svgEl = mountSafeSvgDom(document, svgMarkup);
      if (!svgEl) {
        stageEl.replaceChildren(el('div', 'wb-empty', state.kind === 'mermaid' ? tr('waitingMermaid') : tr('emptyData')));
        return () => {};
      }
      const dims = readSvgDimensionsFromElement(svgEl);
      natW = dims.width;
      natH = dims.height;
      viewBoxStr = dims.viewBox;
      svgEl.style.width = `${natW}px`;
      svgEl.style.height = `${natH}px`;
      layer.replaceChildren(svgEl);
      setMetaPills([
        `${natW}×${natH}`,
        viewBoxStr ? `viewBox ${viewBoxStr}` : '',
        state.meta?.size ? formatBytes(state.meta.size) : '',
      ]);
    } else {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.alt = state.name || 'image';
      img.draggable = false;
      img.onload = () => {
        natW = img.naturalWidth || 800;
        natH = img.naturalHeight || 600;
        setMetaPills([`${natW}×${natH}`, state.meta?.size ? formatBytes(state.meta.size) : '']);
        fitToViewport();
      };
      img.onerror = () => {
        stageEl.replaceChildren(el('div', 'wb-empty', tr('loadError')));
      };
      img.src = imgUrl;
      layer.appendChild(img);
    }

    // Build top toolbar controls
    if (isVector) {
      const sandboxBadge = el('span', 'wb-sandbox-badge', tr('sandboxIsolated'));
      sandboxBadge.setAttribute('data-testid', 'wb-sandbox-badge');
      sandboxBadge.title = tr('sandboxIsolated');
      toolsEl.appendChild(sandboxBadge);
    }
    if (isVector && (rawSource || svgMarkup)) {
      const modeSeg = el('div', 'wb-seg');
      const btnCanvas = el('button', 'wb-seg-btn', tr('viewCanvas'));
      const btnSrc = el('button', 'wb-seg-btn', tr('viewSource'));
      btnCanvas.type = btnSrc.type = 'button';
      const syncModeUi = () => {
        btnCanvas.setAttribute('data-active', viewMode === 'canvas' ? '1' : '0');
        btnSrc.setAttribute('data-active', viewMode === 'source' ? '1' : '0');
        viewport.hidden = viewMode !== 'canvas';
        sourcePane.hidden = viewMode !== 'source';
      };
      btnCanvas.onclick = () => { viewMode = 'canvas'; syncModeUi(); };
      btnSrc.onclick = () => { viewMode = 'source'; syncModeUi(); };
      syncModeUi();
      modeSeg.append(btnCanvas, btnSrc);
      toolsEl.appendChild(modeSeg);
    }

    const bgSeg = el('div', 'wb-seg');
    const bgChoices = isVector
      ? [
          ['checker', 'bgChecker'],
          ['checker-light', 'bgCheckerLight'],
          ['checker-dark', 'bgCheckerDark'],
          ['dark', 'bgDark'],
          ['light', 'bgLight'],
        ]
      : [
          ['checker', 'bgChecker'],
          ['dark', 'bgDark'],
          ['light', 'bgLight'],
        ];
    for (const [id, k] of bgChoices) {
      const b = el('button', 'wb-seg-btn', tr(k));
      b.type = 'button';
      b.setAttribute('data-bg-id', id);
      if (id === backdrop) b.setAttribute('data-active', '1');
      b.onclick = () => {
        backdrop = id;
        viewport.setAttribute('data-backdrop', id);
        for (const ch of bgSeg.children) ch.setAttribute('data-active', ch === b ? '1' : '0');
      };
      bgSeg.appendChild(b);
    }
    toolsEl.appendChild(bgSeg);

    const btnOut = el('button', 'wb-btn', '−');
    const btnIn = el('button', 'wb-btn', '+');
    const btnFit = el('button', 'wb-btn', tr('fitWin'));
    const btn100 = el('button', 'wb-btn', tr('zoom100'));
    btnOut.type = btnIn.type = btnFit.type = btn100.type = 'button';
    btnOut.onclick = () => zoomAroundPoint(scale / 1.25, (viewport.clientWidth || 400) * 0.5, (viewport.clientHeight || 300) * 0.5);
    btnIn.onclick = () => zoomAroundPoint(scale * 1.25, (viewport.clientWidth || 400) * 0.5, (viewport.clientHeight || 300) * 0.5);
    btnFit.onclick = fitToViewport;
    btn100.onclick = setZoomOneToOne;
    toolsEl.append(btnOut, zoomReadout, btnIn, btnFit, btn100);

    if (isVector) {
      for (const mul of [1, 2, 4]) {
        const expBtn = el('button', 'wb-btn', `${mul}x PNG`);
        expBtn.type = 'button';
        expBtn.onclick = () => rasterizeSvgToPng(svgMarkup, mul, state.name || 'diagram');
        toolsEl.appendChild(expBtn);
      }
      const cpBtn = el('button', 'wb-btn', tr('copySvg'));
      cpBtn.type = 'button';
      cpBtn.onclick = () => void copyPlainText(rawSource || svgMarkup);
      toolsEl.appendChild(cpBtn);
    }

    const onWheel = (ev) => {
      ev.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const cx = ev.clientX - rect.left;
      const cy = ev.clientY - rect.top;
      const factor = ev.deltaY < 0 ? 1.14 : 1 / 1.14;
      zoomAroundPoint(scale * factor, cx, cy);
    };
    viewport.addEventListener('wheel', onWheel, { passive: false });

    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const onDown = (ev) => {
      if (ev.button !== 0 && ev.button !== 1) return;
      dragging = true;
      lastX = ev.clientX;
      lastY = ev.clientY;
      viewport.setPointerCapture?.(ev.pointerId);
    };
    const onMove = (ev) => {
      if (!dragging) return;
      panX += ev.clientX - lastX;
      panY += ev.clientY - lastY;
      lastX = ev.clientX;
      lastY = ev.clientY;
      applyTransform();
    };
    const onUp = (ev) => {
      if (!dragging) return;
      dragging = false;
      viewport.releasePointerCapture?.(ev.pointerId);
    };
    viewport.addEventListener('pointerdown', onDown);
    viewport.addEventListener('pointermove', onMove);
    viewport.addEventListener('pointerup', onUp);
    viewport.addEventListener('pointercancel', onUp);

    requestAnimationFrame(fitToViewport);
    return () => {
      viewport.removeEventListener('wheel', onWheel);
    };
  }

  // ── Engine 1: Video & Audio Streaming Stage (Frame Step, A-B, PNG, WebAudio Waveform) ─
  function mountMediaStage(isAudio) {
    toolsEl.replaceChildren();
    stageEl.replaceChildren();

    const streamUrl = buildApiUrl('/stream');
    const wrap = el('div', 'wb-media-wrap');
    const mediaEl = document.createElement(isAudio ? 'audio' : 'video');
    mediaEl.crossOrigin = 'anonymous';
    mediaEl.controls = true;
    mediaEl.preload = 'metadata';
    mediaEl.src = streamUrl;

    let pointA = null;
    let pointB = null;
    const markers = [];
    let rafId = 0;
    let audioCtx = null;
    let wavePeaks = null;
    let analyser = null;
    let timeDomainBuf = null;
    let waveCanvas = null;

    if (isAudio) {
      mediaEl.className = 'wb-audio-el';
      const vp = el('div', 'wb-audio-viewport');
      const card = el('div', 'wb-wave-card');
      waveCanvas = el('canvas', 'wb-wave-canvas');
      card.append(waveCanvas, mediaEl);
      vp.appendChild(card);
      wrap.appendChild(vp);
    } else {
      mediaEl.className = 'wb-video';
      mediaEl.playsInline = true;
      const vp = el('div', 'wb-video-viewport');
      vp.appendChild(mediaEl);
      wrap.appendChild(vp);
    }

    const deck = el('div', 'wb-media-deck');
    const row = el('div', 'wb-toolbar-row');
    const markerBar = el('div', 'wb-markers');

    const tcReadout = el('span', 'wb-mono-readout', '00:00.000 / 00:00.000');

    if (!isAudio) {
      const btnPrevF = el('button', 'wb-btn', tr('prevFrame'));
      const btnNextF = el('button', 'wb-btn', tr('nextFrame'));
      btnPrevF.type = btnNextF.type = 'button';
      const stepFrame = (dir) => {
        mediaEl.pause();
        const dur = Number.isFinite(mediaEl.duration) ? mediaEl.duration : Infinity;
        mediaEl.currentTime = Math.max(0, Math.min(dur, (mediaEl.currentTime || 0) + dir * (1 / 30)));
      };
      btnPrevF.onclick = () => stepFrame(-1);
      btnNextF.onclick = () => stepFrame(1);
      row.append(btnPrevF, btnNextF);
    }

    const rateSel = el('select', 'wb-select');
    for (const r of [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2]) {
      const opt = el('option', '', `${r}x`);
      opt.value = String(r);
      if (r === 1) opt.selected = true;
      rateSel.appendChild(opt);
    }
    rateSel.onchange = () => {
      mediaEl.playbackRate = Number(rateSel.value) || 1;
    };

    const btnLoop = el('button', 'wb-btn', tr('loopOne'));
    btnLoop.type = 'button';
    btnLoop.onclick = () => {
      mediaEl.loop = !mediaEl.loop;
      btnLoop.setAttribute('data-active', mediaEl.loop ? '1' : '0');
    };

    const btnA = el('button', 'wb-btn', tr('setPointA'));
    const btnB = el('button', 'wb-btn', tr('setPointB'));
    const btnClearAB = el('button', 'wb-btn', tr('clearAB'));
    btnA.type = btnB.type = btnClearAB.type = 'button';
    const syncAbUi = () => {
      btnA.textContent = pointA !== null ? `A ${formatTimecodeMs(pointA)}` : tr('setPointA');
      btnB.textContent = pointB !== null ? `B ${formatTimecodeMs(pointB)}` : tr('setPointB');
      btnA.setAttribute('data-active', pointA !== null ? '1' : '0');
      btnB.setAttribute('data-active', pointB !== null ? '1' : '0');
      drawWaveformOnce();
    };
    btnA.onclick = () => {
      pointA = mediaEl.currentTime || 0;
      if (pointB !== null && pointB <= pointA) pointB = null;
      syncAbUi();
    };
    btnB.onclick = () => {
      const nowT = mediaEl.currentTime || 0;
      if (pointA === null) pointA = 0;
      if (nowT > pointA + 0.02) pointB = nowT;
      syncAbUi();
    };
    btnClearAB.onclick = () => {
      pointA = null;
      pointB = null;
      syncAbUi();
    };

    row.append(tcReadout, rateSel, btnLoop, btnA, btnB, btnClearAB);

    if (!isAudio) {
      const captureFrameBlob = (cb) => {
        if ((typeof mediaEl.readyState === 'number' && mediaEl.readyState < 2) || !mediaEl.videoWidth || !mediaEl.videoHeight) {
          showToast(tr('emptyData'));
          return;
        }
        const vw = mediaEl.videoWidth;
        const vh = mediaEl.videoHeight;
        const cv = document.createElement('canvas');
        cv.width = vw;
        cv.height = vh;
        const ctx = cv.getContext('2d');
        if (!ctx) return;
        try {
          ctx.drawImage(mediaEl, 0, 0, vw, vh);
          cv.toBlob((blob) => blob && cb(blob, vw, vh), 'image/png');
        } catch {
          showToast(tr('loadError'));
        }
      };
      const btnSaveFrame = el('button', 'wb-btn', tr('saveFrame'));
      const btnCopyFrame = el('button', 'wb-btn', tr('copyFrame'));
      btnSaveFrame.type = btnCopyFrame.type = 'button';
      btnSaveFrame.onclick = () => {
        captureFrameBlob((blob, vw, vh) => {
          const stamp = formatTimecodeMs(mediaEl.currentTime || 0).replace(/[:.]/g, '-');
          triggerBlobDownload(blob, `frame-${stamp}.png`);
          showToast(`${tr('savedPng')} (${vw}×${vh})`);
        });
      };
      btnCopyFrame.onclick = () => {
        captureFrameBlob(async (blob) => {
          try {
            if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
              await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
              showToast(tr('copiedOk'));
              return;
            }
          } catch {}
          triggerBlobDownload(blob, 'frame.png');
          showToast(tr('savedPng'));
        });
      };
      row.append(btnSaveFrame, btnCopyFrame);
    }

    const renderMarkers = () => {
      markerBar.replaceChildren();
      for (let i = 0; i < markers.length; i++) {
        const t = markers[i];
        const chip = el('button', 'wb-marker-chip', `#${i + 1} ${formatTimecodeMs(t)}`);
        chip.type = 'button';
        chip.onclick = () => {
          mediaEl.currentTime = t;
          updateTimecode();
          drawWaveformOnce();
        };
        markerBar.appendChild(chip);
      }
    };

    const btnMark = el('button', 'wb-btn', tr('addMarker'));
    const btnCopyMarks = el('button', 'wb-btn', tr('copyMarkers'));
    btnMark.type = btnCopyMarks.type = 'button';
    btnMark.onclick = () => {
      markers.push(mediaEl.currentTime || 0);
      markers.sort((a, b) => a - b);
      renderMarkers();
      drawWaveformOnce();
    };
    btnCopyMarks.onclick = () => {
      const list = markers.length > 0 ? markers.map((t) => formatTimecodeMs(t)).join('\n') : formatTimecodeMs(mediaEl.currentTime || 0);
      void copyPlainText(list);
    };
    row.append(btnMark, btnCopyMarks);

    deck.append(row, markerBar);
    wrap.appendChild(deck);
    stageEl.appendChild(wrap);

    function drawWaveformOnce() {
      if (!isAudio || !waveCanvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = waveCanvas.clientWidth || 640;
      const cssH = waveCanvas.clientHeight || 112;
      const pw = Math.max(4, Math.round(cssW * dpr));
      const ph = Math.max(4, Math.round(cssH * dpr));
      if (waveCanvas.width !== pw || waveCanvas.height !== ph) {
        waveCanvas.width = pw;
        waveCanvas.height = ph;
      }
      const ctx = waveCanvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      const cs = getComputedStyle(htmlEl);
      const accentCol = cs.getPropertyValue('--wb-accent').trim() || '#669DF6';
      const mutedCol = cs.getPropertyValue('--wb-muted').trim() || '#8A8A98';
      const dur = Number.isFinite(mediaEl.duration) && mediaEl.duration > 0 ? mediaEl.duration : 0;
      const progress = dur > 0 ? Math.max(0, Math.min(1, (mediaEl.currentTime || 0) / dur)) : 0;

      if (dur > 0 && pointA !== null) {
        const xA = (pointA / dur) * cssW;
        const xB = pointB !== null ? (pointB / dur) * cssW : cssW;
        ctx.fillStyle = cs.getPropertyValue('--wb-accent-soft').trim() || 'rgba(102,157,246,0.15)';
        ctx.fillRect(xA, 0, Math.max(2, xB - xA), cssH);
      }

      if (wavePeaks && wavePeaks.length > 0) {
        const bars = wavePeaks.length;
        const step = cssW / bars;
        const barW = Math.max(1.5, step * 0.64);
        const midY = cssH * 0.5;
        for (let i = 0; i < bars; i++) {
          const x = i * step + (step - barW) * 0.5;
          const amp = Math.max(0.04, wavePeaks[i]) * (cssH * 0.42);
          ctx.fillStyle = i / bars <= progress ? accentCol : mutedCol;
          ctx.globalAlpha = i / bars <= progress ? 0.95 : 0.34;
          ctx.fillRect(x, midY - amp, barW, amp * 2);
        }
        ctx.globalAlpha = 1;
      } else if (analyser && timeDomainBuf && !mediaEl.paused) {
        analyser.getByteTimeDomainData(timeDomainBuf);
        ctx.beginPath();
        ctx.strokeStyle = accentCol;
        ctx.lineWidth = 1.6;
        const slice = cssW / timeDomainBuf.length;
        for (let i = 0; i < timeDomainBuf.length; i++) {
          const v = timeDomainBuf[i] / 128.0;
          const y = (v * cssH) * 0.5;
          if (i === 0) ctx.moveTo(0, y);
          else ctx.lineTo(i * slice, y);
        }
        ctx.stroke();
      } else {
        ctx.strokeStyle = mutedCol;
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.moveTo(0, cssH * 0.5);
        ctx.lineTo(cssW, cssH * 0.5);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      if (dur > 0) {
        const px = progress * cssW;
        ctx.fillStyle = accentCol;
        ctx.fillRect(Math.max(0, px - 0.75), 0, 1.5, cssH);
      }
    }

    function updateTimecode() {
      const cur = mediaEl.currentTime || 0;
      const dur = Number.isFinite(mediaEl.duration) ? mediaEl.duration : 0;
      if (pointA !== null && pointB !== null && cur >= pointB) {
        mediaEl.currentTime = pointA;
      }
      tcReadout.textContent = `${formatTimecodeMs(mediaEl.currentTime || 0)} / ${formatTimecodeMs(dur)}`;
    }

    function tickPlayLoop() {
      rafId = 0;
      if (mediaEl.paused || mediaEl.ended) {
        updateTimecode();
        drawWaveformOnce();
        return;
      }
      updateTimecode();
      drawWaveformOnce();
      rafId = requestAnimationFrame(tickPlayLoop);
    }

    mediaEl.addEventListener('loadedmetadata', () => {
      const durStr = Number.isFinite(mediaEl.duration) ? formatTimecodeMs(mediaEl.duration) : '';
      const dimStr = !isAudio && mediaEl.videoWidth ? `${mediaEl.videoWidth}×${mediaEl.videoHeight}` : '';
      setMetaPills([dimStr, durStr, state.meta?.size ? formatBytes(state.meta.size) : '']);
      updateTimecode();
      drawWaveformOnce();
    });
    mediaEl.addEventListener('timeupdate', () => {
      updateTimecode();
      if (mediaEl.paused) drawWaveformOnce();
    });
    mediaEl.addEventListener('seeked', () => {
      updateTimecode();
      drawWaveformOnce();
    });
    mediaEl.addEventListener('error', () => {
      stageEl.replaceChildren(el('div', 'wb-empty', tr('loadError')));
    });
    mediaEl.addEventListener('play', () => {
      if (isAudio && !wavePeaks && !analyser && typeof AudioContext !== 'undefined') {
        try {
          audioCtx = new AudioContext();
          const srcNode = audioCtx.createMediaElementSource(mediaEl);
          analyser = audioCtx.createAnalyser();
          analyser.fftSize = 512;
          timeDomainBuf = new Uint8Array(analyser.frequencyBinCount);
          srcNode.connect(analyser);
          analyser.connect(audioCtx.destination);
        } catch {}
      }
      if (audioCtx && audioCtx.state === 'suspended' && typeof audioCtx.resume === 'function') {
        audioCtx.resume().catch(() => {});
      }
      if (!rafId) rafId = requestAnimationFrame(tickPlayLoop);
    });
    mediaEl.addEventListener('pause', () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      updateTimecode();
      drawWaveformOnce();
    });

    if (isAudio && waveCanvas) {
      let scrubbing = false;
      const seekAtClientX = (clientX) => {
        const dur = mediaEl.duration;
        if (!Number.isFinite(dur) || dur <= 0) return;
        const rect = waveCanvas.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
        mediaEl.currentTime = ratio * dur;
        updateTimecode();
        drawWaveformOnce();
      };
      waveCanvas.addEventListener('pointerdown', (ev) => {
        scrubbing = true;
        waveCanvas.setPointerCapture?.(ev.pointerId);
        seekAtClientX(ev.clientX);
      });
      waveCanvas.addEventListener('pointermove', (ev) => {
        if (scrubbing) seekAtClientX(ev.clientX);
      });
      const stopScrub = (ev) => {
        if (!scrubbing) return;
        scrubbing = false;
        waveCanvas.releasePointerCapture?.(ev.pointerId);
      };
      waveCanvas.addEventListener('pointerup', stopScrub);
      waveCanvas.addEventListener('pointercancel', stopScrub);

      let waveAborted = false;
      const waveAbortCtl = typeof AbortController === 'function' ? new AbortController() : null;
      const maxDecodeBytes = 8 * 1024 * 1024;
      if (state.meta && state.meta.size > 0 && state.meta.size <= maxDecodeBytes && typeof AudioContext !== 'undefined') {
        fetch(streamUrl, waveAbortCtl ? { signal: waveAbortCtl.signal } : undefined)
          .then((r) => (r.ok ? r.arrayBuffer() : null))
          .then(async (buf) => {
            if (!buf || waveAborted) return;
            const OfflineOrCtx = window.OfflineAudioContext || window.AudioContext;
            const decodeCtx = OfflineOrCtx === window.AudioContext ? new AudioContext() : new OfflineOrCtx(1, 2, 44100);
            const audioBuf = await decodeCtx.decodeAudioData(buf);
            if (typeof decodeCtx.close === 'function') decodeCtx.close().catch(() => {});
            if (waveAborted) return;
            const ch0 = audioBuf.getChannelData(0);
            const ch1 = audioBuf.numberOfChannels > 1 ? audioBuf.getChannelData(1) : null;
            const buckets = 220;
            const blockSize = Math.max(1, Math.floor(ch0.length / buckets));
            const peaks = new Float32Array(buckets);
            let maxPeak = 0.01;
            for (let b = 0; b < buckets; b++) {
              const start = b * blockSize;
              const end = Math.min(ch0.length, start + blockSize);
              let pk = 0;
              for (let j = start; j < end; j += Math.max(1, Math.floor(blockSize / 64))) {
                const v = ch1 ? (Math.abs(ch0[j]) + Math.abs(ch1[j])) * 0.5 : Math.abs(ch0[j]);
                if (v > pk) pk = v;
              }
              peaks[b] = pk;
              if (pk > maxPeak) maxPeak = pk;
            }
            for (let b = 0; b < buckets; b++) peaks[b] /= maxPeak;
            if (waveAborted) return;
            wavePeaks = peaks;
            drawWaveformOnce();
          })
          .catch(() => {});
      }
      requestAnimationFrame(drawWaveformOnce);
      state._abortWaveDecode = () => {
        waveAborted = true;
        try { waveAbortCtl?.abort(); } catch {}
      };
    }

    state.onThemeRefresh = isAudio ? drawWaveformOnce : null;

    return () => {
      state.onThemeRefresh = null;
      if (typeof state._abortWaveDecode === 'function') {
        state._abortWaveDecode();
        state._abortWaveDecode = null;
      }
      if (rafId) cancelAnimationFrame(rafId);
      try {
        mediaEl.pause();
        mediaEl.removeAttribute('src');
        mediaEl.load();
      } catch {}
      if (audioCtx && typeof audioCtx.close === 'function') {
        audioCtx.close().catch(() => {});
      }
    };
  }

  // ── Engine 3: HTML Responsive Sandbox & PDF Native Stream ─────────────────
  // 严格核验目标资源确实为真实 PDF（文件后缀 .pdf 或后端确认 application/pdf），严禁显式 kind=pdf 绕过沙盒加载 HTML/SVG
  function isVerifiedPdfResource() {
    const cleanPath = String(state.path || '').split(/[?#]/)[0].trim().toLowerCase();
    if (/\.(?:html?|xhtml|svg)$/i.test(cleanPath)) return false;
    const mime = String(state.meta?.mime || '').split(';')[0].trim().toLowerCase();
    if (mime) return mime === 'application/pdf';
    return Boolean(cleanPath) && cleanPath.endsWith('.pdf');
  }

  function injectSrcdocCspMeta(rawHtml) {
    const html = String(rawHtml ?? '');
    const metaTag = '<meta http-equiv="Content-Security-Policy" content="connect-src \'none\'; form-action \'none\'">';
    const doctypeMatch = /^\s*<!doctype\b[^>]*>/i.exec(html);
    if (doctypeMatch) {
      const idx = doctypeMatch.index + doctypeMatch[0].length;
      return `${html.slice(0, idx)}${metaTag}${html.slice(idx)}`;
    }
    const htmlOpenMatch = /^\s*<html\b[^>]*>/i.exec(html);
    if (htmlOpenMatch) {
      const idx = htmlOpenMatch.index + htmlOpenMatch[0].length;
      return `${html.slice(0, idx)}${metaTag}${html.slice(idx)}`;
    }
    return `${metaTag}${html}`;
  }

  function mountHtmlOrPdfStage(isPdf) {
    toolsEl.replaceChildren();
    stageEl.replaceChildren();

    if (isPdf && isVerifiedPdfResource()) {
      const frame = el('iframe', 'wb-pdf-frame');
      frame.src = buildApiUrl('/stream');
      const btnReload = el('button', 'wb-btn', tr('reloadBtn'));
      btnReload.type = 'button';
      btnReload.onclick = () => {
        frame.src = buildApiUrl('/stream', { _t: Date.now() });
      };
      toolsEl.appendChild(btnReload);
      setMetaPills([state.meta?.size ? formatBytes(state.meta.size) : 'PDF']);
      stageEl.appendChild(frame);
      return () => {};
    }

    let vpMode = 'desktop';
    let layoutMode = 'preview';
    let sandboxUrl = '';

    const shell = el('div', 'wb-sandbox-shell');
    const previewPane = el('div', 'wb-sandbox-preview-pane');
    const frameWrap = el('div', 'wb-sandbox-frame-wrap');
    const frame = el('iframe', 'wb-sandbox-frame');
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('referrerpolicy', 'no-referrer');
    frameWrap.appendChild(frame);
    previewPane.appendChild(frameWrap);

    const srcPane = el('pre', 'wb-source-pane');
    srcPane.hidden = true;
    srcPane.textContent = state.textBuffer || '';

    shell.append(previewPane, srcPane);
    stageEl.appendChild(shell);

    const sandboxBadge = el('span', 'wb-sandbox-badge', tr('sandboxIsolated'));
    sandboxBadge.setAttribute('data-testid', 'wb-sandbox-badge');
    sandboxBadge.title = tr('sandboxIsolated');

    const vpSeg = el('div', 'wb-seg');
    for (const [id, k, wCss] of [['desktop', 'vpDesktop', '100%'], ['tablet', 'vpTablet', '768px'], ['mobile', 'vpMobile', '390px']]) {
      const b = el('button', 'wb-seg-btn', tr(k));
      b.type = 'button';
      b.setAttribute('data-vp', id);
      if (id === vpMode) b.setAttribute('data-active', '1');
      b.onclick = () => {
        vpMode = id;
        frameWrap.style.width = wCss;
        for (const ch of vpSeg.children) ch.setAttribute('data-active', ch === b ? '1' : '0');
      };
      vpSeg.appendChild(b);
    }

    const modeSeg = el('div', 'wb-seg');
    for (const [id, k] of [['preview', 'viewPreview'], ['split', 'viewSplit'], ['source', 'viewSource']]) {
      const b = el('button', 'wb-seg-btn', tr(k));
      b.type = 'button';
      if (id === layoutMode) b.setAttribute('data-active', '1');
      b.onclick = async () => {
        layoutMode = id;
        for (const ch of modeSeg.children) ch.setAttribute('data-active', ch === b ? '1' : '0');
        previewPane.hidden = id === 'source';
        srcPane.hidden = id === 'preview';
        if (id !== 'preview' && !state.textBuffer && state.path) {
          try {
            const m = await fetch(buildApiUrl('/meta', { headBytes: 262144, offset: 0 })).then((r) => r.json());
            if (m && typeof m.textSlice === 'string') {
              state.textBuffer = m.textSlice;
              srcPane.textContent = state.textBuffer;
            }
          } catch {}
        }
      };
      modeSeg.appendChild(b);
    }

    const btnReload = el('button', 'wb-btn', tr('reloadBtn'));
    btnReload.type = 'button';
    btnReload.onclick = () => {
      if (sandboxUrl) {
        const sep = sandboxUrl.includes('?') ? '&' : '?';
        frame.src = `${sandboxUrl}${sep}_t=${Date.now()}`;
      } else if (state.rawContent && !state.path) {
        frame.srcdoc = injectSrcdocCspMeta(state.rawContent);
      }
    };

    toolsEl.append(sandboxBadge, vpSeg, modeSeg, btnReload);

    if (state.rawContent && !state.path) {
      frame.srcdoc = injectSrcdocCspMeta(state.rawContent);
      srcPane.textContent = state.rawContent;
    } else if (state.sandboxUrl) {
      sandboxUrl = state.sandboxUrl.startsWith('http')
        ? state.sandboxUrl
        : `${state.baseUrl.replace(/\/$/, '')}${state.sandboxUrl}`;
      frame.src = sandboxUrl;
    } else {
      const showSandboxFail = () => {
        frame.removeAttribute('src');
        const errBox = el('div', 'wb-empty', tr('loadError'));
        frameWrap.replaceChildren(errBox);
      };
      fetch(buildApiUrl('/sandbox-init'))
        .then((r) => (r.ok ? r.json() : null))
        .then((res) => {
          if (res && res.ok && res.url) {
            sandboxUrl = res.url.startsWith('http') ? res.url : `${state.baseUrl.replace(/\/$/, '')}${res.url}`;
            frame.src = sandboxUrl;
          } else {
            showSandboxFail();
          }
        })
        .catch(() => {
          showSandboxFail();
        });
    }
    return () => {};
  }

  // ── Engine 4a: Data Table Stage (CSV / TSV / JSONL) ───────────────────────
  function mountTableStage() {
    toolsEl.replaceChildren();
    stageEl.replaceChildren();

    const PAGE_SIZE = 200;
    let viewMode = 'table';
    let filterQuery = '';
    let sortCol = -1;
    let sortDir = 0; // 0: original, 1: asc, -1: desc
    let page = 0;

    const cleanP = state.path.split(/[?#]/)[0];
    const ext = (cleanP.includes('.') ? cleanP.split('.').pop() || '' : '').toLowerCase();
    const isJsonl =
      ext === 'jsonl' ||
      ext === 'ndjson' ||
      Boolean(state.meta?.mime && /jsonl|ndjson/i.test(state.meta.mime)) ||
      (!ext && /^\s*\{/.test(state.textBuffer || state.rawContent || ''));
    if (!state.textBuffer && state.rawContent) {
      state.textBuffer = state.rawContent;
    }
    const parseCurrentBuffer = () => {
      let srcTxt = state.textBuffer || '';
      if (state.truncated && srcTxt.length > 0) {
        const lastNl = srcTxt.lastIndexOf('\n');
        if (lastNl > 0) srcTxt = srcTxt.slice(0, lastNl + 1);
      }
      return isJsonl
        ? parseJsonLinesTable(srcTxt)
        : parseDelimitedTable(srcTxt, ext === 'tsv' || ext === 'tab' ? '\t' : '');
    };

    let parsed = parseCurrentBuffer();

    const modeSeg = el('div', 'wb-seg');
    const btnTbl = el('button', 'wb-seg-btn', tr('viewTable'));
    const btnRaw = el('button', 'wb-seg-btn', tr('viewRaw'));
    btnTbl.type = btnRaw.type = 'button';

    const tableBar = el('div', 'wb-table-bar');
    const searchInput = el('input', 'wb-input');
    searchInput.type = 'search';
    searchInput.placeholder = tr('filterPh');
    searchInput.style.minWidth = '210px';

    const rightControls = el('div', 'wb-top-right');
    const countPill = el('span', 'wb-pill', '');
    const btnPrev = el('button', 'wb-btn', tr('prevPage'));
    const pageInfo = el('span', 'wb-mono-readout', '1 / 1');
    const btnNext = el('button', 'wb-btn', tr('nextPage'));
    const btnMore = el('button', 'wb-btn', tr('loadMore'));
    btnPrev.type = btnNext.type = btnMore.type = 'button';
    rightControls.append(countPill, btnPrev, pageInfo, btnNext, btnMore);
    tableBar.append(searchInput, rightControls);

    const scrollWrap = el('div', 'wb-table-scroll');
    const tableEl = el('table', 'wb-table');
    scrollWrap.appendChild(tableEl);

    const rawPane = el('pre', 'wb-source-pane');
    rawPane.style.borderLeft = '0';
    rawPane.hidden = true;

    stageEl.append(tableBar, scrollWrap, rawPane);

    function renderGrid() {
      const q = filterQuery.trim().toLowerCase();
      const indexed = [];
      for (let i = 0; i < parsed.rows.length; i++) {
        const r = parsed.rows[i];
        if (!q || r.some((cell) => String(cell).toLowerCase().includes(q))) {
          indexed.push({ origIdx: i + 1, cells: r });
        }
      }
      if (sortCol >= 0 && sortDir !== 0) {
        indexed.sort((a, b) => {
          const va = a.cells[sortCol] ?? '';
          const vb = b.cells[sortCol] ?? '';
          const na = Number(va);
          const nb = Number(vb);
          if (va !== '' && vb !== '' && Number.isFinite(na) && Number.isFinite(nb)) {
            return (na - nb) * sortDir;
          }
          return String(va).localeCompare(String(vb)) * sortDir;
        });
      }

      const totalPages = Math.max(1, Math.ceil(indexed.length / PAGE_SIZE));
      if (page >= totalPages) page = totalPages - 1;
      if (page < 0) page = 0;

      const rowLabel = q ? `${indexed.length} / ${parsed.rows.length} ${tr('rowsUnit')}` : `${parsed.rows.length} ${tr('rowsUnit')}`;
      const colLabel = `${parsed.headers.length} ${tr('colsUnit')}`;
      countPill.textContent = `${rowLabel} · ${colLabel}`;
      setMetaPills([`${parsed.rows.length} ${tr('rowsUnit')}`, colLabel, state.meta?.size ? formatBytes(state.meta.size) : '']);

      pageInfo.textContent = `${page + 1} / ${totalPages}`;
      btnPrev.disabled = page <= 0;
      btnNext.disabled = page >= totalPages - 1;
      btnMore.hidden = !(state.truncated && state.nextOffset > 0);

      tableEl.replaceChildren();
      if (parsed.headers.length === 0) {
        scrollWrap.replaceChildren(el('div', 'wb-empty', tr('emptyData')));
        return;
      }
      if (!scrollWrap.contains(tableEl)) scrollWrap.replaceChildren(tableEl);

      const thead = document.createElement('thead');
      const headTr = document.createElement('tr');
      headTr.appendChild(el('th', 'wb-col-idx', '#'));
      parsed.headers.forEach((h, colIdx) => {
        const arrow = sortCol === colIdx ? (sortDir === 1 ? ' ↑' : sortDir === -1 ? ' ↓' : '') : '';
        const th = el('th', '', `${h}${arrow}`);
        th.onclick = () => {
          if (sortCol !== colIdx) {
            sortCol = colIdx;
            sortDir = 1;
          } else if (sortDir === 1) {
            sortDir = -1;
          } else {
            sortCol = -1;
            sortDir = 0;
          }
          renderGrid();
        };
        headTr.appendChild(th);
      });
      thead.appendChild(headTr);

      const tbody = document.createElement('tbody');
      const slice = indexed.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
      for (const item of slice) {
        const trRow = document.createElement('tr');
        trRow.appendChild(el('td', 'wb-col-idx', String(item.origIdx)));
        for (let c = 0; c < parsed.headers.length; c++) {
          const val = item.cells[c] ?? '';
          const td = el('td', '', val);
          if (val.length > 36) td.title = val;
          trRow.appendChild(td);
        }
        tbody.appendChild(trRow);
      }
      tableEl.append(thead, tbody);
    }

    searchInput.oninput = () => {
      filterQuery = searchInput.value || '';
      page = 0;
      renderGrid();
    };
    btnPrev.onclick = () => { if (page > 0) { page -= 1; renderGrid(); } };
    btnNext.onclick = () => { page += 1; renderGrid(); };
    btnMore.onclick = async () => {
      if (!state.truncated || !state.nextOffset) return;
      btnMore.disabled = true;
      try {
        const nextMeta = await fetch(buildApiUrl('/meta', { headBytes: 262144, offset: state.nextOffset })).then((r) => r.json());
        if (nextMeta && typeof nextMeta.textSlice === 'string') {
          state.textBuffer += nextMeta.textSlice;
          state.truncated = Boolean(nextMeta.truncated);
          state.nextOffset = Number(nextMeta.nextOffset || 0);
          parsed = parseCurrentBuffer();
          rawPane.textContent = state.textBuffer;
          renderGrid();
        }
      } catch {}
      btnMore.disabled = false;
    };

    const syncMode = () => {
      btnTbl.setAttribute('data-active', viewMode === 'table' ? '1' : '0');
      btnRaw.setAttribute('data-active', viewMode === 'raw' ? '1' : '0');
      tableBar.hidden = viewMode !== 'table';
      scrollWrap.hidden = viewMode !== 'table';
      rawPane.hidden = viewMode !== 'raw';
      if (viewMode === 'raw') rawPane.textContent = state.textBuffer;
    };
    btnTbl.onclick = () => { viewMode = 'table'; syncMode(); };
    btnRaw.onclick = () => { viewMode = 'raw'; syncMode(); };
    modeSeg.append(btnTbl, btnRaw);
    toolsEl.appendChild(modeSeg);

    syncMode();
    renderGrid();
    return () => {};
  }

  // ── Engine 4b: Font Waterfall Specimen Stage (TTF / OTF / WOFF2) ──────────
  function mountFontStage() {
    toolsEl.replaceChildren();
    stageEl.replaceChildren();

    const familyName = `PrismPreviewFont_${Date.now()}`;
    const defaultSpecimen =
      '天地玄黄 宇宙洪荒 · The quick brown fox jumps over the lazy dog · 0123456789 != === => <= ->';
    let ligaOn = true;

    const input = el('input', 'wb-input');
    input.type = 'text';
    input.value = defaultSpecimen;
    input.placeholder = tr('fontPh');
    input.style.minWidth = '240px';

    const btnLiga = el('button', 'wb-btn', tr('fontLiga'));
    btnLiga.type = 'button';
    btnLiga.setAttribute('data-active', '1');

    toolsEl.append(input, btnLiga);

    const scroll = el('div', 'wb-font-scroll');
    const sampleNodes = [];
    for (const sz of [12, 16, 24, 36, 56]) {
      const card = el('div', 'wb-font-row');
      card.appendChild(el('span', 'wb-font-size-tag', `${sz}px`));
      const sp = el('div', 'wb-font-sample', defaultSpecimen);
      sp.style.fontSize = `${sz}px`;
      sp.style.fontFamily = `"${familyName}", var(--wb-font-sans)`;
      card.appendChild(sp);
      sampleNodes.push(sp);
      scroll.appendChild(card);
    }

    const glyphCard = el('div', 'wb-font-row');
    glyphCard.appendChild(el('span', 'wb-font-size-tag', 'ASCII & Symbols'));
    const grid = el('div', 'wb-glyph-grid');
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{};:\'",.<>/?\\|~`';
    for (const ch of chars) {
      const cell = el('span', 'wb-glyph-cell', ch);
      cell.style.fontFamily = `"${familyName}", var(--wb-font-mono)`;
      grid.appendChild(cell);
    }
    glyphCard.appendChild(grid);
    scroll.appendChild(glyphCard);
    stageEl.appendChild(scroll);

    const syncLiga = () => {
      const feat = ligaOn ? '"liga" 1, "calt" 1' : '"liga" 0, "calt" 0';
      for (const sp of sampleNodes) sp.style.fontFeatureSettings = feat;
      btnLiga.setAttribute('data-active', ligaOn ? '1' : '0');
    };
    syncLiga();

    input.oninput = () => {
      const txt = input.value || defaultSpecimen;
      for (const sp of sampleNodes) sp.textContent = txt;
    };
    btnLiga.onclick = () => {
      ligaOn = !ligaOn;
      syncLiga();
    };

    const ext = (state.path.split('.').pop() || 'FONT').toUpperCase();
    setMetaPills([ext, state.meta?.size ? formatBytes(state.meta.size) : '']);

    let loadedFontFace = null;
    let disposed = false;
    if (typeof FontFace === 'function' && document.fonts) {
      const face = new FontFace(familyName, `url("${buildApiUrl('/stream')}")`);
      face
        .load()
        .then((loaded) => {
          if (disposed) return;
          loadedFontFace = loaded;
          document.fonts.add(loaded);
        })
        .catch(() => {
          if (disposed) return;
          setMetaPills([ext, tr('loadError')]);
          scroll.insertBefore(el('div', 'wb-empty', tr('loadError')), scroll.firstChild);
        });
    }
    return () => {
      disposed = true;
      if (loadedFontFace && document.fonts && typeof document.fonts.delete === 'function') {
        try { document.fonts.delete(loadedFontFace); } catch {}
        loadedFontFace = null;
      }
    };
  }

  // ── Fallback Plain Text Stage ─────────────────────────────────────────────
  function mountPlainTextStage() {
    toolsEl.replaceChildren();
    stageEl.replaceChildren();

    let wrapOn = true;
    const pane = el('pre', 'wb-source-pane');
    pane.style.borderLeft = '0';
    pane.setAttribute('data-wrap', '1');
    pane.textContent = state.textBuffer || state.rawContent || '';

    const btnWrap = el('button', 'wb-btn', tr('wrapLines'));
    btnWrap.type = 'button';
    btnWrap.setAttribute('data-active', '1');
    btnWrap.onclick = () => {
      wrapOn = !wrapOn;
      pane.setAttribute('data-wrap', wrapOn ? '1' : '0');
      btnWrap.setAttribute('data-active', wrapOn ? '1' : '0');
    };

    const btnCopy = el('button', 'wb-btn', tr('copyText'));
    btnCopy.type = 'button';
    btnCopy.onclick = () => void copyPlainText(pane.textContent || '');
    toolsEl.append(btnWrap, btnCopy);

    if (state.truncated && state.nextOffset > 0) {
      const btnMore = el('button', 'wb-btn', tr('loadMore'));
      btnMore.type = 'button';
      const mountSeq = loadSeq;
      let loadingMore = false;
      btnMore.onclick = async () => {
        if (loadingMore || loadSeq !== mountSeq) return;
        loadingMore = true;
        btnMore.disabled = true;
        try {
          const nextMeta = await fetch(buildApiUrl('/meta', { headBytes: 262144, offset: state.nextOffset })).then((r) => r.json());
          if (loadSeq !== mountSeq) return;
          if (nextMeta && typeof nextMeta.textSlice === 'string') {
            state.textBuffer += nextMeta.textSlice;
            state.truncated = Boolean(nextMeta.truncated);
            state.nextOffset = Number(nextMeta.nextOffset || 0);
            pane.appendChild(document.createTextNode(nextMeta.textSlice));
            if (!state.truncated) btnMore.hidden = true;
          }
        } catch {} finally {
          loadingMore = false;
          if (loadSeq === mountSeq) btnMore.disabled = false;
        }
      };
      toolsEl.appendChild(btnMore);
    }

    setMetaPills([state.meta?.size ? formatBytes(state.meta.size) : '']);
    stageEl.appendChild(pane);
    return () => {};
  }

  // ── Master Loader & Dispatcher ────────────────────────────────────────────
  let loadSeq = 0;

  async function mountCurrentResource() {
    const seq = ++loadSeq;
    state.onThemeRefresh = null;
    if (typeof state.cleanupFn === 'function') {
      try { state.cleanupFn(); } catch {}
      state.cleanupFn = null;
    }

    applyThemeAttrs();
    const displayTitle = state.name || (state.path ? state.path.split(/[\\/]/).pop() : '') || (state.kind === 'mermaid' ? 'Mermaid Diagram' : 'Workbench');
    titleEl.textContent = displayTitle;
    titleEl.title = state.path || displayTitle;
    if (typeof document !== 'undefined') document.title = `${displayTitle} · Prism Omni`;

    // Fetch /meta when path is given and not pure in-memory payload
    if (state.path && !state.rawContent) {
      stageEl.replaceChildren(el('div', 'wb-empty', tr('loading')));
      try {
        const res = await fetch(buildApiUrl('/meta', { headBytes: 262144, offset: 0 }));
        const meta = await res.json();
        if (seq !== loadSeq) return;
        if (!res.ok || meta?.ok === false) {
          stageEl.replaceChildren(el('div', 'wb-empty', `${tr('loadError')}${meta?.error ? ': ' + meta.error : ''}`));
          return;
        }
        state.meta = meta;
        if (meta.name && !state.name) {
          state.name = meta.name;
          titleEl.textContent = meta.name;
          if (typeof document !== 'undefined') document.title = `${meta.name} · Prism Omni`;
        }
        if (state.kind === 'auto' || !state.kind) {
          state.kind = detectWorkbenchKind(state.path, meta.mime || '');
        } else if (state.kind === 'pdf' && !isVerifiedPdfResource()) {
          state.kind = detectWorkbenchKind(state.path, meta.mime || '');
          if (state.kind === 'pdf') state.kind = 'text';
        }
        state.textBuffer = typeof meta.textSlice === 'string' ? meta.textSlice : '';
        state.truncated = Boolean(meta.truncated);
        state.nextOffset = Number(meta.nextOffset || 0);
      } catch {
        if (seq !== loadSeq) return;
        if (state.kind === 'auto' || !state.kind) {
          state.kind = detectWorkbenchKind(state.path, '');
        } else if (state.kind === 'pdf' && !isVerifiedPdfResource()) {
          state.kind = detectWorkbenchKind(state.path, '');
          if (state.kind === 'pdf') state.kind = 'text';
        }
      }
    } else if (state.kind === 'auto' || !state.kind) {
      state.kind = state.rawContent.includes('<svg') ? 'mermaid' : detectWorkbenchKind(state.path, '');
    } else if (state.kind === 'pdf' && !isVerifiedPdfResource()) {
      state.kind = state.rawContent.includes('<svg') ? 'mermaid' : detectWorkbenchKind(state.path, state.meta?.mime || '');
      if (state.kind === 'pdf') state.kind = 'text';
    }

    badgeEl.textContent = String(state.kind || 'FILE').toUpperCase();

    if (state.kind === 'video') {
      state.cleanupFn = mountMediaStage(false);
    } else if (state.kind === 'audio') {
      state.cleanupFn = mountMediaStage(true);
    } else if (state.kind === 'image') {
      state.cleanupFn = mountPanZoomStage({ isVector: false, imgUrl: buildApiUrl('/stream') });
    } else if (state.kind === 'svg' || state.kind === 'mermaid') {
      let svgTxt = state.rawContent || state.textBuffer || '';
      if (!svgTxt && state.path && state.kind === 'svg') {
        try {
          svgTxt = await fetch(buildApiUrl('/stream')).then((r) => (r.ok ? r.text() : ''));
        } catch {}
      } else if (state.truncated && state.path && state.kind === 'svg') {
        try {
          const fullTxt = await fetch(buildApiUrl('/stream')).then((r) => (r.ok ? r.text() : ''));
          if (fullTxt) svgTxt = fullTxt;
        } catch {}
      }
      if (seq !== loadSeq) return;
      if (svgTxt.includes('<svg')) {
        state.cleanupFn = mountPanZoomStage({ isVector: true, svgMarkup: svgTxt, rawSource: svgTxt });
      } else if (state.kind === 'mermaid' && !svgTxt) {
        stageEl.replaceChildren(el('div', 'wb-empty', tr('waitingMermaid')));
      } else {
        state.textBuffer = svgTxt;
        state.cleanupFn = mountPlainTextStage();
      }
    } else if (state.kind === 'html') {
      state.cleanupFn = mountHtmlOrPdfStage(false);
    } else if (state.kind === 'pdf') {
      state.cleanupFn = mountHtmlOrPdfStage(true);
    } else if (state.kind === 'table') {
      state.cleanupFn = mountTableStage();
    } else if (state.kind === 'font') {
      state.cleanupFn = mountFontStage();
    } else {
      state.cleanupFn = mountPlainTextStage();
    }

    try {
      if (window.parent && window.parent !== window) {
        let targetOrigin = '*';
        try {
          if (typeof document !== 'undefined' && document.referrer) {
            const ref = new URL(document.referrer);
            if (
              ref.origin &&
              ref.origin !== 'null' &&
              (ref.protocol === 'vscode-file:' ||
                ref.protocol === 'app:' ||
                ((ref.protocol === 'http:' || ref.protocol === 'https:') &&
                  /^(?:127\.0\.0\.1|localhost|\[::1\])$/i.test(ref.hostname)))
            ) {
              targetOrigin = ref.origin;
            }
          }
        } catch {}
        window.parent.postMessage({ type: 'ag-prism-workbench-ready', kind: state.kind }, targetOrigin);
      }
    } catch {}
  }

  // Live theme / language / payload hot-sync via postMessage (strictly parent-frame only)
  window.addEventListener('message', (ev) => {
    if (!ev || (typeof window.parent !== 'undefined' && ev.source !== window.parent)) return;
    const d = ev.data;
    if (!d || typeof d !== 'object') return;

    if (d.type === 'theme-change' && d.payload) {
      if (d.payload.themeType === 'light' || d.payload.themeType === 'dark') {
        state.theme = d.payload.themeType;
      }
      if (d.payload.cssVariables && typeof d.payload.cssVariables === 'object') {
        const cv = d.payload.cssVariables;
        for (const [k, v] of Object.entries(cv)) {
          if (typeof k === 'string' && k.startsWith('--')) htmlEl.style.setProperty(k, String(v));
        }
        if (cv['--ag-cs-tonal-0']) htmlEl.style.setProperty('--wb-bg', String(cv['--ag-cs-tonal-0']));
        if (cv['--ag-cs-tonal-1']) htmlEl.style.setProperty('--wb-surface', String(cv['--ag-cs-tonal-1']));
        if (cv['--ag-cs-tonal-2']) htmlEl.style.setProperty('--wb-panel', String(cv['--ag-cs-tonal-2']));
        if (cv['--ag-cs-tonal-3']) htmlEl.style.setProperty('--wb-elevated', String(cv['--ag-cs-tonal-3']));
        if (cv['--font-sans']) htmlEl.style.setProperty('--wb-font-sans', String(cv['--font-sans']));
      }
      applyThemeAttrs();
      if (typeof state.onThemeRefresh === 'function') state.onThemeRefresh();
      return;
    }

    if (d.type === 'ag-prism-workbench-reload') {
      if (typeof document === 'undefined' || document.visibilityState !== 'hidden') {
        if (!d.path || d.path === state.path) {
          state.meta = null;
          state.textBuffer = '';
          void mountCurrentResource();
        }
      }
      return;
    }

    if (d.type === 'ag-prism-workbench-sync') {
      let needRemount = false;
      const prevLang = state.lang;
      if (d.theme === 'light' || d.theme === 'dark') state.theme = d.theme;
      if (d.palette) state.palette = d.palette;
      if (d.lightPreset) state.lightPreset = d.lightPreset;
      if (d.accent) state.accent = d.accent;
      if (d.corners) state.corners = d.corners;
      if (d.lang) state.lang = d.lang;
      if (d.title) state.name = d.title;

      if (d.kind && d.kind !== state.kind) {
        state.kind = d.kind;
        needRemount = true;
      }
      if (typeof d.path === 'string' && d.path !== state.path) {
        state.path = d.path;
        state.meta = null;
        state.name = d.title || '';
        state.rawContent = '';
        state.sandboxUrl = '';
        needRemount = true;
      }
      if (typeof d.rawContent === 'string' && d.rawContent !== state.rawContent) {
        state.rawContent = d.rawContent;
        if (!d.kind && d.rawContent.includes('<svg') && state.kind !== 'svg') {
          state.kind = 'mermaid';
        }
        needRemount = true;
      }

      applyThemeAttrs();
      if (needRemount || state.lang !== prevLang) {
        void mountCurrentResource();
      } else if (typeof state.onThemeRefresh === 'function') {
        state.onThemeRefresh();
      }
    }
  });

  window.addEventListener('hashchange', () => {
    const nextHash = readHashParams();
    const nextRaw = nextHash.get('raw') || '';
    const nextTitle = nextHash.get('title') || '';
    if (nextRaw && nextRaw !== state.rawContent) {
      state.rawContent = nextRaw;
      if (nextTitle) state.name = nextTitle;
      if (nextRaw.includes('<svg') && state.kind !== 'svg') state.kind = 'mermaid';
      void mountCurrentResource();
    }
  });

  void mountCurrentResource();
}

export function renderWorkbenchHtml(ctx = {}) {
  const filePath = String(ctx.path ?? ctx.filePath ?? '');
  const rawKind = String(ctx.kind || 'auto').trim().toLowerCase();
  const resolvedKind =
    rawKind && rawKind !== 'auto' && SUPPORTED_KINDS.has(rawKind)
      ? rawKind
      : ctx.rawContent && String(ctx.rawContent).includes('<svg')
      ? 'mermaid'
      : detectWorkbenchKind(filePath, ctx.mime || '');

  const theme = ctx.theme === 'light' ? 'light' : 'dark';
  const palette = ['obsidian', 'warm', 'claude', 'host'].includes(ctx.palette) ? ctx.palette : 'obsidian';
  const lightPreset = ctx.lightPreset === 'alabaster' ? 'alabaster' : 'crystal';
  const rawAccent = ctx.accent || ctx.accentTone || 'follow';
  const accent = ['follow', 'cobalt', 'iris', 'amber', 'mono'].includes(rawAccent) ? rawAccent : 'follow';
  const rawCorners = ctx.corners || ctx.cornerStyle || 'balanced';
  const corners = ['sharp', 'balanced', 'soft'].includes(rawCorners) ? rawCorners : 'balanced';
  const rawLang = ctx.lang || ctx.language || 'zh-CN';
  const lang = ['zh-CN', 'zh-TW', 'yue', 'en', 'ja', 'ko', 'es', 'fr', 'de'].includes(rawLang) ? rawLang : 'zh-CN';
  const fileName = String(ctx.name ?? ctx.fileName ?? (extractFileName(filePath) || (resolvedKind === 'mermaid' ? 'Mermaid Diagram' : 'Workbench')));

  const explicitKind = rawKind && rawKind !== 'auto' && SUPPORTED_KINDS.has(rawKind) ? rawKind : '';
  const initKind = explicitKind
    ? explicitKind
    : ctx.rawContent && String(ctx.rawContent).includes('<svg')
    ? 'mermaid'
    : filePath || ctx.mime
    ? resolvedKind
    : '';

  const initPayload = {
    baseUrl: ctx.baseUrl || '',
    token: ctx.token || '',
    path: filePath,
    name: ctx.name !== undefined || ctx.fileName !== undefined ? String(ctx.name ?? ctx.fileName) : '',
    kind: initKind,
    theme: ctx.theme ? theme : '',
    palette: ctx.palette ? palette : '',
    lightPreset: ctx.lightPreset ? lightPreset : '',
    accent: ctx.accent || ctx.accentTone ? accent : '',
    corners: ctx.corners || ctx.cornerStyle ? corners : '',
    lang: ctx.lang || ctx.language ? lang : '',
    rawContent: typeof ctx.rawContent === 'string' ? ctx.rawContent : '',
    sandboxUrl: typeof ctx.sandboxUrl === 'string' ? ctx.sandboxUrl : '',
    meta: ctx.meta && typeof ctx.meta === 'object' ? ctx.meta : null,
  };

  const inlineJs = [
    `const EXT_KIND_MAP = ${JSON.stringify(EXT_KIND_MAP)};`,
    detectWorkbenchKind.toString().replace(/^export\s+/, ''),
    parseDelimitedTable.toString().replace(/^export\s+/, ''),
    parseJsonLinesTable.toString().replace(/^export\s+/, ''),
    formatTimecodeMs.toString().replace(/^export\s+/, ''),
    bootPrismWorkbench.toString(),
    `bootPrismWorkbench(${serializeSafeJson(initPayload)}, ${serializeSafeJson(WORKBENCH_I18N)});`,
  ].join('\n');

  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}" data-wb-theme="${escapeHtml(theme)}" data-wb-palette="${escapeHtml(palette)}" data-wb-light-preset="${escapeHtml(lightPreset)}" data-wb-accent="${escapeHtml(accent)}" data-wb-corners="${escapeHtml(corners)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(fileName)} · Prism Omni</title>
<style id="ag-prism-workbench-css">${WORKBENCH_CSS}</style>
</head>
<body>
<div id="wb-app">
  <header id="wb-topbar">
    <div class="wb-top-left">
      <span id="wb-kind-badge" class="wb-badge">${escapeHtml(resolvedKind.toUpperCase())}</span>
      <span id="wb-title" class="wb-filename" title="${escapeHtml(filePath || fileName)}">${escapeHtml(fileName)}</span>
      <div id="wb-meta-pills" class="wb-top-left"></div>
    </div>
    <div id="wb-mode-tools" class="wb-top-right"></div>
  </header>
  <main id="wb-stage"></main>
</div>
<div id="wb-toast" role="status" aria-live="polite"></div>
<script>${inlineJs}</script>
</body>
</html>`;
}

export default {
  WORKBENCH_I18N,
  detectWorkbenchKind,
  parseDelimitedTable,
  parseJsonLinesTable,
  formatTimecodeMs,
  renderWorkbenchHtml,
};

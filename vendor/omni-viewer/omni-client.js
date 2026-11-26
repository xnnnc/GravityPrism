// Obsidian Prism — Omni Native Browser Router, Context Menu & Streaming Workbench Client (v1.0.8-beta.3)
// Second-channel runtime (`window.__agPrismOmni`) + CommonJS factory for deterministic unit tests.
// Engineering & security guarantees:
// 1. ZERO custom side-dock DOM or rogue `wcvBrowser` calls: 100% native integration with Antigravity's
//    resizable, tab-closeable Right Side Panel (`openUrlInBrowserPane` + Redux `sidePanelV2` / `sidePanel`).
// 2. ZERO hover popups or inline clutter; enhanced actions live in Right-Click (`contextmenu`) menu.
// 3. Zero-DOM-Mutation bare URL/path activation via CSS Custom Highlight API (`CSS.highlights` + Range)
//    so React 19 `HostText` nodes are never split or detached (`0` `removeChild`/`insertBefore` crashes),
//    with automatic `<span>` fallback only in headless test harnesses lacking `CSS.highlights`.
// 4. 100% alignment with `style.css` tokens (`--ag-cs-*`) and zero-residue re-entrant `destroy() <-> sync()`.

(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  const W = root || (typeof window !== 'undefined' ? window : globalThis);
  if (W && W.document && !W.__agPrismOmniDisableAutoBoot) {
    try {
      W.__agPrismOmni?.destroy?.();
    } catch (_) {}
    const instance = api.createOmniClient({ window: W, document: W.document });
    W.__agPrismOmni = instance;
    if (typeof globalThis !== 'undefined') {
      globalThis.__agPrismOmni = instance;
    }
    const initCfg = W.__agPrism?.getState?.()?.cfg || W.__agPrismOmniBootCfg || null;
    const initMeta = W.__agPrismOmniServerMeta || null;
    instance.sync(initCfg, initMeta);
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const VERSION = '1.0.8-beta.3';
  const STYLE_EL_ID = 'ag-prism-omni-css';
  const HL_URL_NAME = 'ag-omni-url';
  const HL_PATH_NAME = 'ag-omni-path';
  const GUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

  // Compact 8-locale fallback table [zh-CN, zh-TW, en, ja, ko, es, fr, de]; primary source is `window.__agCsLocales`
  const LANG_INDEX = { 'zh-CN': 0, 'zh-TW': 1, en: 2, ja: 3, ko: 4, es: 5, fr: 6, de: 7 };
  const FALLBACK_ROWS = {
    omniOpenBuiltin: ['在右侧面板打开', '在右側面板開啟', 'Open in Side Pane', '右パネルで開く', '오른쪽 패널에서 열기', 'Abrir en panel lateral', 'Ouvrir dans le panneau latéral', 'Im Seitenbereich öffnen'],
    omniOpenPreview: ['在右侧检视台预览', '在右側檢視台預覽', 'Preview in Workbench', 'ワークベンチでプレビュー', '워크벤치에서 미리보기', 'Previsualizar en Workbench', 'Aperçu dans Workbench', 'In Workbench vorschauen'],
    omniOpenExternal: ['使用系统默认程序打开', '使用系統預設程式開啟', 'Open in Default App', '既定のアプリで開く', '기본 앱으로 열기', 'Abrir en app predeterminada', 'Ouvrir avec l’app par défaut', 'In Standard-App öffnen'],
    omniOpenBrowser: ['在系统浏览器中打开', '在系統瀏覽器中開啟', 'Open in System Browser', '標準ブラウザで開く', '시스템 브라우저에서 열기', 'Abrir en el navegador', 'Ouvrir dans le navigateur', 'Im Systembrowser öffnen'],
    omniRevealFolder: ['在文件夹中显示', '在資料夾中顯示', 'Reveal in Folder', 'フォルダに表示', '폴더에서 보기', 'Mostrar en carpeta', 'Afficher dans le dossier', 'Im Ordner anzeigen'],
    omniInsertMention: ['作为 @引用 填入输入框', '作為 @引用 填入輸入框', 'Insert as @Mention', '@参照として入力欄へ挿入', '@멘션으로 입력창에 삽입', 'Insertar como @mención', 'Insérer comme @mention', 'Als @Erwähnung einfügen'],
    omniCopyLink: ['复制链接地址', '複製連結位址', 'Copy Link URL', 'リンクURLをコピー', '링크 URL 복사', 'Copiar enlace', 'Copier le lien', 'Link-URL kopieren'],
    omniCopyAbsPath: ['复制绝对路径', '複製絕對路徑', 'Copy Absolute Path', '絶対パスをコピー', '절대 경로 복사', 'Copiar ruta absoluta', 'Copier le chemin absolu', 'Absoluten Pfad kopieren'],
    omniCopyRelPath: ['复制相对路径', '複製相對路徑', 'Copy Relative Path', '相対パスをコピー', '상대 경로 복사', 'Copiar ruta relativa', 'Copier le chemin relatif', 'Relativen Pfad kopieren'],
    omniCopyText: ['复制文本', '複製文字', 'Copy Text', 'テキストをコピー', '텍스트 복사', 'Copiar texto', 'Copier le texte', 'Text kopieren'],
    omniZoomDiagram: ['放大查看图表', '放大檢視圖表', 'Zoom Diagram', '図を拡大表示', '다이어그램 확대', 'Ampliar diagrama', 'Agrandir le diagramme', 'Diagramm vergrößern'],
    omniViewWorkbench: ['检视台视图', '檢視台檢視', 'Workbench View', 'プレビュー表示', '워크벤치 보기', 'Vista Workbench', 'Vue Workbench', 'Workbench-Ansicht'],
    omniViewRaw: ['原始视图', '原始檢視', 'Raw View', 'ソース表示', '원본 보기', 'Vista sin formato', 'Vue brute', 'Rohansicht'],
    omniViewPreview: ['预览', '預覽', 'Preview', 'プレビュー', '미리보기', 'Vista previa', 'Aperçu', 'Vorschau'],
    omniViewSource: ['源码', '原始碼', 'Source', 'ソース', '소스', 'Código fuente', 'Code source', 'Quelltext'],
    omniSandboxIsolated: ['沙盒隔离', '沙盒隔離', 'Sandbox Isolated', 'サンドボックス隔離', '샌드박스 격리', 'Aislado en sandbox', 'Isolé en sandbox', 'Sandbox-isoliert'],
    omniCopied: ['已复制', '已複製', 'Copied', 'コピー済', '복사됨', 'Copiado', 'Copié', 'Kopiert'],
    omniMermaidDiagram: ['Mermaid 图表', 'Mermaid 圖表', 'Mermaid Diagram', 'Mermaid 図', 'Mermaid 다이어그램', 'Diagrama Mermaid', 'Diagramme Mermaid', 'Mermaid-Diagramm'],
    omniMermaidSvg: ['Mermaid SVG 图表', 'Mermaid SVG 圖表', 'Mermaid SVG', 'Mermaid SVG', 'Mermaid SVG', 'Mermaid SVG', 'Mermaid SVG', 'Mermaid SVG'],
    omniHintClick: ['单击', '單擊', 'Click', 'クリック', '클릭', 'Clic', 'Clic', 'Klick'],
    omniHintCtrlClick: ['Ctrl+单击', 'Ctrl+單擊', 'Ctrl+Click', 'Ctrl+クリック', 'Ctrl+클릭', 'Ctrl+Clic', 'Ctrl+Clic', 'Strg+Klick'],
  };

  const PREVIEW_KIND_BY_EXT = {
    mp4: 'video', webm: 'video', mov: 'video', m4v: 'video', mkv: 'video', ogv: 'video',
    mp3: 'audio', wav: 'audio', ogg: 'audio', flac: 'audio', m4a: 'audio', aac: 'audio', opus: 'audio',
    svg: 'svg', png: 'image', jpg: 'image', jpeg: 'image', webp: 'image', gif: 'image', avif: 'image', bmp: 'image', ico: 'image',
    html: 'html', htm: 'html', pdf: 'pdf',
    csv: 'table', tsv: 'table', jsonl: 'table', ndjson: 'table',
    ttf: 'font', otf: 'font', woff: 'font', woff2: 'font',
    mmd: 'mermaid', mermaid: 'mermaid',
  };

  const AUX_SWITCHABLE_EXTS = new Set(Object.keys(PREVIEW_KIND_BY_EXT));
  const AUTO_PREVIEW_EXTS = new Set(['html', 'htm', 'svg']);

  const KNOWN_FILE_EXTS = new Set([
    ...AUX_SWITCHABLE_EXTS,
    'js', 'mjs', 'cjs', 'jsx', 'ts', 'mts', 'cts', 'tsx',
    'json', 'jsonc', 'yaml', 'yml', 'toml', 'ini', 'env', 'conf',
    'md', 'mdx', 'txt', 'log', 'rst', 'css', 'scss', 'less', 'vue', 'svelte',
    'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift', 'c', 'h', 'cpp', 'hpp', 'cs', 'php', 'lua',
    'sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd', 'sql', 'graphql', 'proto', 'xml', 'lock', 'dockerfile',
  ]);

  const SKIP_WALK_TAGS = new Set([
    'PRE', 'CODE', 'A', 'BUTTON', 'SCRIPT', 'STYLE', 'TEXTAREA',
    'INPUT', 'SELECT', 'OPTION', 'SVG', 'NOSCRIPT', 'IFRAME', 'CANVAS',
  ]);

  const SCAN_CONTAINER_SELECTOR = [
    '[data-testid="planner-response-text"]',
    '[data-testid="agent-response"]',
    '[data-testid="artifact-view"]',
    '[data-testid="background-task-command"]',
    '[data-testid="terminal-output"]',
    '.markdown-body',
    '[data-omni-scan="true"]',
  ].join(', ');

  const STATIC_EXCLUDED_SELECTOR = [
    'pre', 'code', 'a', 'button', 'svg',
    '[contenteditable="true"]',
    '[data-testid="agent-input-box"]',
    '[data-testid="entity-pill"]',
    '.inline-pill',
    '.code-block',
    '.ag-prism-thought-overlay',
    '.ag-prism-thought-chunk',
    '.ag-omni-autolink',
    '.ag-omni-menu',
    '.ag-omni-aux-bar',
    '[data-agy-hans-ui]',
    '#agy-theme-switcher',
    '#agy-theme-menu',
    '#antigravity-quota-widget',
    '#antigravity-translation-audit',
  ].join(', ');
  const STREAMING_EXCLUDED_SELECTOR = '[data-ag-cs-spark-streaming="1"], [data-ag-cs-thought-streaming="1"]';
  const EXCLUDED_ANCESTOR_SELECTOR = `${STATIC_EXCLUDED_SELECTOR}, ${STREAMING_EXCLUDED_SELECTOR}`;

  const FILE_PILL_SELECTOR = [
    '[data-testid="entity-pill"]',
    '.inline-pill',
    '.ag-prism-thought-file-pill',
    'a[href^="file:"]',
    'a[href^="vscode-file:"]',
    'a[href^="antigravity-ide://file"]',
    '[data-testid="attached-context-pill"]',
    '[data-testid="user-message-document-chip"]',
    '[data-testid="artifact-card"]',
    '[data-testid="bubble-artifact-card"]',
    '[data-testid="artifact-row"]',
  ].join(', ');

  const AUX_FILE_VIEW_SELECTOR = [
    '[data-testid="binary-file-no-preview"]',
    '[data-testid="artifact-pdf-no-preview"]',
    '[data-omni-aux-error]',
    '[data-omni-aux-file]',
  ].join(', ');

  const HOST_AUX_ERROR_RE =
    /exceeds the \d+\s*MB display limit|Failed to read file content|Preview is not available for this file type|Unable to display/i;

  const BARE_TOKEN_RE = new RegExp(
    [
      '(https?:\\/\\/[^\\s<>"\'`\\]]+)',
      '\\b(localhost:\\d{2,5}(?:\\/[^\\s<>"\'`\\]]*)?)',
      '\\b([A-Za-z]:[\\\\/](?:[^\\\\/\\s<>"\'|?*:\\r\\n]+[\\\\/])*[^\\\\/\\s<>"\'|?*:\\r\\n]+\\.[A-Za-z0-9]{1,8}(?:#L\\d+(?:-L?\\d+)?|:\\d+(?::\\d+)?)?)',
      '(?<![A-Za-z0-9_@:/.-])((?:\\.{1,2}\\/|~\\/|\\/(?![\\/\\s])|[A-Za-z0-9_.-]+\\/)(?:[A-Za-z0-9_.-]+\\/)*[A-Za-z0-9_.-]+\\.[A-Za-z0-9]{1,8}(?:#L\\d+(?:-L?\\d+)?|:\\d+(?::\\d+)?)?)',
    ].join('|'),
    'g'
  );

  const TRAILING_PUNCT_RE = /[.,;:!?。，；：！？、）】》"'`]+$/;

  function shortStableHash(input) {
    const str = String(input || '');
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36).padStart(7, '0');
  }

  function normalizeLangCode(raw) {
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

  function splitPathAndLineRange(rawInput) {
    let str = String(rawInput || '').trim();
    if (!str) return { pathPart: '', lineStart: null, lineEnd: null };
    let lineStart = null;
    let lineEnd = null;
    const hashMatch = /#L(\d+)(?:-L?(\d+))?$/i.exec(str);
    if (hashMatch) {
      lineStart = parseInt(hashMatch[1], 10);
      lineEnd = hashMatch[2] ? parseInt(hashMatch[2], 10) : null;
      str = str.slice(0, hashMatch.index);
    } else {
      const colonMatch = /:(\d+)(?:(?:-(\d+))|(?::\d+))?$/.exec(str);
      if (colonMatch && colonMatch.index > 2) {
        lineStart = parseInt(colonMatch[1], 10);
        lineEnd = colonMatch[2] ? parseInt(colonMatch[2], 10) : null;
        str = str.slice(0, colonMatch.index);
      }
    }
    return { pathPart: str, lineStart, lineEnd };
  }

  function parseFileUriToPath(rawUriOrPath) {
    const input = String(rawUriOrPath || '').trim();
    if (!input) return { filePath: '', lineStart: null, lineEnd: null };
    let cleaned = input;
    if (/^antigravity-ide:\/\/file/i.test(cleaned)) {
      cleaned = 'file://' + cleaned.replace(/^antigravity-ide:\/\/file/i, '');
    } else if (/^vscode-file:\/\/vscode-app/i.test(cleaned)) {
      cleaned = 'file://' + cleaned.replace(/^vscode-file:\/\/vscode-app/i, '');
    }
    const { pathPart: preSplit, lineStart: preStart, lineEnd: preEnd } = splitPathAndLineRange(cleaned);
    let pathStr = preSplit;
    if (/^file:\/\//i.test(pathStr)) {
      let rest = pathStr.replace(/^file:\/\//i, '');
      if (/^localhost\//i.test(rest)) rest = rest.slice('localhost'.length);
      try { rest = decodeURIComponent(rest); } catch (_) {}
      if (/^\/[A-Za-z]:[\\/]/.test(rest)) {
        rest = rest.slice(1).replace(/\//g, '\\');
      } else if (/^[A-Za-z]:[\\/]/.test(rest)) {
        rest = rest.replace(/\//g, '\\');
      }
      pathStr = rest;
    } else {
      try {
        if (/%[0-9A-Fa-f]{2}/.test(pathStr)) pathStr = decodeURIComponent(pathStr);
      } catch (_) {}
    }
    const post = splitPathAndLineRange(pathStr);
    return {
      filePath: post.pathPart || pathStr,
      lineStart: preStart || post.lineStart || null,
      lineEnd: preEnd || post.lineEnd || null,
    };
  }

  function getFileExt(filePath) {
    const { pathPart } = splitPathAndLineRange(filePath);
    const clean = String(pathPart || '').split(/[?#]/)[0];
    const base = clean.split(/[\\/]/).pop() || '';
    const dot = base.lastIndexOf('.');
    if (dot <= 0 || dot === base.length - 1) {
      return base.toLowerCase() === 'dockerfile' ? 'dockerfile' : '';
    }
    return base.slice(dot + 1).toLowerCase();
  }

  function getBaseName(filePath) {
    const { pathPart } = splitPathAndLineRange(filePath);
    const clean = String(pathPart || '').replace(/[\\/]+$/, '');
    const parts = clean.split(/[\\/]/);
    return parts[parts.length - 1] || clean;
  }

  function detectPreviewKind(filePath, explicitKind) {
    if (explicitKind && explicitKind !== 'auto') return explicitKind;
    return PREVIEW_KIND_BY_EXT[getFileExt(filePath)] || 'auto';
  }

  function normalizeSlashes(p) {
    return String(p || '').replace(/\\/g, '/').replace(/\/+/g, '/');
  }

  function computeRelativePath(absOrRawPath, workspaceRoot) {
    const raw = String(absOrRawPath || '').trim();
    if (!raw) return '';
    const { pathPart, lineStart, lineEnd } = splitPathAndLineRange(raw);
    const suffix = lineStart ? (lineEnd ? `#L${lineStart}-L${lineEnd}` : `#L${lineStart}`) : '';
    const normFile = normalizeSlashes(pathPart);
    if (!workspaceRoot) return normFile + suffix;
    const normRoot = normalizeSlashes(parseFileUriToPath(workspaceRoot).filePath).replace(/\/$/, '');
    if (!normRoot) return normFile + suffix;
    const isWinPath = /^[A-Za-z]:\//.test(normFile) || /^[A-Za-z]:\//.test(normRoot);
    const cmpFile = isWinPath ? normFile.toLowerCase() : normFile;
    const cmpRoot = isWinPath ? normRoot.toLowerCase() : normRoot;
    if (cmpFile === cmpRoot) return '.' + suffix;
    if (cmpFile.startsWith(cmpRoot + '/')) return normFile.slice(normRoot.length + 1) + suffix;
    return normFile + suffix;
  }

  function isHttpUrl(str) {
    return /^https?:\/\/[^\s]+$/i.test(String(str || '').trim());
  }

  function toFileUri(filePath) {
    const p = String(filePath || '').trim();
    if (!p) return '';
    if (/^file:\/\//i.test(p)) return p;
    const norm = normalizeSlashes(p);
    if (/^[A-Za-z]:\//.test(norm)) return 'file:///' + encodeURI(norm);
    if (norm.startsWith('/')) return 'file://' + encodeURI(norm);
    return '';
  }

  function mayContainBareToken(raw) {
    if (!raw || raw.length < 4 || raw.length > 32000) return false;
    if (raw.indexOf('http') !== -1 || raw.indexOf('localhost:') !== -1) return true;
    return raw.indexOf('.') !== -1 && (raw.indexOf('/') !== -1 || raw.indexOf('\\') !== -1);
  }

  function tokenizeBareText(text) {
    const raw = String(text || '');
    if (!mayContainBareToken(raw)) return null;

    BARE_TOKEN_RE.lastIndex = 0;
    const tokens = [];
    let lastIdx = 0;
    let match;

    while ((match = BARE_TOKEN_RE.exec(raw)) !== null) {
      const fullMatch = match[0];
      const matchStart = match.index;
      let candidate = fullMatch;
      let trailing = '';

      while (candidate.length > 0) {
        const punct = TRAILING_PUNCT_RE.exec(candidate);
        if (punct) {
          trailing = punct[0] + trailing;
          candidate = candidate.slice(0, -punct[0].length);
          continue;
        }
        if (candidate.endsWith(')')) {
          const opens = (candidate.match(/\(/g) || []).length;
          const closes = (candidate.match(/\)/g) || []).length;
          if (closes > opens) {
            trailing = ')' + trailing;
            candidate = candidate.slice(0, -1);
            continue;
          }
        }
        break;
      }

      let kind = '';
      let url = '';
      let filePath = '';
      let lineStart = null;
      let lineEnd = null;

      if (match[1]) {
        if (isHttpUrl(candidate)) {
          kind = 'url';
          url = candidate;
        }
      } else if (match[2]) {
        kind = 'url';
        url = 'http://' + candidate;
      } else if (match[3] || match[4]) {
        const parsed = splitPathAndLineRange(candidate);
        const ext = getFileExt(parsed.pathPart);
        if (ext && KNOWN_FILE_EXTS.has(ext) && !/^https?:/i.test(candidate)) {
          kind = 'file';
          filePath = parsed.pathPart;
          lineStart = parsed.lineStart;
          lineEnd = parsed.lineEnd;
        }
      }

      if (!kind) continue;

      if (matchStart > lastIdx) {
        tokens.push({ type: 'text', value: raw.slice(lastIdx, matchStart), start: lastIdx, end: matchStart });
      }
      tokens.push({
        type: kind,
        display: candidate,
        url,
        filePath,
        lineStart,
        lineEnd,
        start: matchStart,
        end: matchStart + candidate.length,
      });
      lastIdx = matchStart + candidate.length;
      if (trailing) {
        tokens.push({ type: 'text', value: trailing, start: lastIdx, end: lastIdx + trailing.length });
        lastIdx += trailing.length;
      }
    }

    if (tokens.length === 0) return null;
    if (lastIdx < raw.length) {
      tokens.push({ type: 'text', value: raw.slice(lastIdx), start: lastIdx, end: raw.length });
    }
    return tokens;
  }

  function readFiberFileHint(el, maxDepth = 20) {
    if (!el || typeof el !== 'object') return '';
    try {
      const keys = Object.keys(el);
      const fk = keys.find((k) => k.startsWith('__reactFiber') || k.startsWith('__reactProps'));
      if (!fk || !el[fk]) return '';
      let cur = el[fk];
      for (let depth = 0; depth < maxDepth && cur; depth++, cur = cur.return) {
        if (
          typeof cur.key === 'string' &&
          (cur.key.startsWith('file://') || /^[A-Za-z]:[\\/]/.test(cur.key) || cur.key.startsWith('/'))
        ) {
          return cur.key;
        }
        const p = cur.memoizedProps || (depth === 0 ? cur : null);
        if (!p || typeof p !== 'object') continue;
        const direct =
          p.fileUri || p.uri || p.filePath || p.absoluteUri || p.href ||
          p['data-uri'] || p['data-active-file-uri'] || p['data-file-uri'];
        if (typeof direct === 'string' && (direct.startsWith('file://') || /[\\/]/.test(direct))) {
          return direct;
        }
        const parsedObj = p.parsedUri || p.resource;
        if (parsedObj && typeof parsedObj === 'object') {
          const objPath = parsedObj.fsPath || parsedObj.path || '';
          if (typeof objPath === 'string' && (objPath.startsWith('file://') || /[\\/]/.test(objPath))) {
            return objPath;
          }
        }
        if (Array.isArray(p.artifactUris) && typeof p.artifactUris[0] === 'string') {
          return p.artifactUris[0];
        }
        if (typeof p.title === 'string' && (p.title.startsWith('file://') || /^[A-Za-z]:[\\/]/.test(p.title) || p.title.startsWith('/'))) {
          return p.title;
        }
      }
    } catch (_) {}
    return '';
  }

  function findClosest(el, selector) {
    let cur = el && el.nodeType === 1 ? el : el && el.parentElement ? el.parentElement : null;
    while (cur && cur.nodeType === 1) {
      if (typeof cur.matches === 'function' && cur.matches(selector)) return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  function isMermaidContainer(el) {
    if (!el || el.nodeType !== 1) return false;
    const tid = String(el.getAttribute?.('data-testid') || '').toLowerCase();
    const cls = String(el.className || '').toLowerCase();
    if (tid.includes('mermaid') || /\bmermaid\b/.test(cls)) {
      return Boolean(el.querySelector?.('svg') || el.tagName === 'SVG');
    }
    if (el.tagName === 'SVG') {
      const id = String(el.getAttribute?.('id') || '').toLowerCase();
      const roleDesc = String(el.getAttribute?.('aria-roledescription') || '').toLowerCase();
      if (
        id.startsWith('mermaid') ||
        roleDesc.includes('flowchart') ||
        roleDesc.includes('sequence') ||
        roleDesc.includes('diagram') ||
        roleDesc.includes('state') ||
        roleDesc.includes('gantt') ||
        roleDesc.includes('class') ||
        roleDesc.includes('er')
      ) {
        return true;
      }
    }
    return false;
  }

  function findMermaidTarget(startEl) {
    let cur = startEl && startEl.nodeType === 1 ? startEl : startEl?.parentElement;
    for (let i = 0; i < 8 && cur && cur.nodeType === 1; i++, cur = cur.parentElement) {
      if (cur.hasAttribute?.('data-omni-mermaid-box')) return cur;
      if (isMermaidContainer(cur)) {
        return cur.tagName === 'SVG' && cur.parentElement ? cur.parentElement : cur;
      }
    }
    return null;
  }

  function extractTargetMeta(startNode, defaultMermaidLabel = 'Mermaid Diagram') {
    const el = startNode && startNode.nodeType === 1 ? startNode : startNode?.parentElement;
    if (!el) return null;
    if (findClosest(el, '.ag-omni-menu')) return null;

    // 1. Activated fallback autolink span
    const autoSpan = findClosest(el, '.ag-omni-autolink');
    if (autoSpan) {
      const autoUrl = autoSpan.getAttribute('data-omni-url');
      if (autoUrl) {
        return { kind: 'url', url: autoUrl, text: (autoSpan.textContent || '').trim(), element: autoSpan };
      }
      const autoPath = autoSpan.getAttribute('data-omni-path');
      if (autoPath) {
        const ls = parseInt(autoSpan.getAttribute('data-omni-line-start') || '', 10);
        const le = parseInt(autoSpan.getAttribute('data-omni-line-end') || '', 10);
        return {
          kind: 'file',
          filePath: autoPath,
          lineStart: Number.isFinite(ls) ? ls : null,
          lineEnd: Number.isFinite(le) ? le : null,
          text: (autoSpan.textContent || '').trim(),
          element: autoSpan,
        };
      }
    }

    // 2. Native file pill / inline-pill / artifact card / file:// anchor
    const pillEl = findClosest(el, FILE_PILL_SELECTOR);
    if (pillEl) {
      let rawRef =
        pillEl.getAttribute?.('data-uri') ||
        pillEl.getAttribute?.('data-file-uri') ||
        pillEl.getAttribute?.('data-file-path') ||
        pillEl.getAttribute?.('href') ||
        '';
      if (!rawRef || rawRef === '#') {
        const t = pillEl.getAttribute?.('title') || '';
        if (t.startsWith('file://') || /^[A-Za-z]:[\\/]/.test(t) || t.startsWith('/') || /[\\/]/.test(t)) {
          rawRef = t;
        }
      }
      if (!rawRef) {
        const nestedPill = pillEl.querySelector?.('[data-uri], a[href^="file:"], [title]');
        if (nestedPill) {
          rawRef =
            nestedPill.getAttribute('data-uri') ||
            nestedPill.getAttribute('href') ||
            nestedPill.getAttribute('title') ||
            '';
        }
      }
      if (!rawRef) rawRef = readFiberFileHint(pillEl);
      if (rawRef && !/^https?:\/\//i.test(rawRef)) {
        const parsed = parseFileUriToPath(rawRef);
        let lineStart = parsed.lineStart;
        let lineEnd = parsed.lineEnd;
        const labelText = (pillEl.textContent || '').trim();
        if (!lineStart && labelText) {
          const labelRange = splitPathAndLineRange(labelText);
          if (labelRange.lineStart) {
            lineStart = labelRange.lineStart;
            lineEnd = labelRange.lineEnd;
          }
        }
        if (parsed.filePath) {
          return {
            kind: 'file',
            filePath: parsed.filePath,
            rawUri: rawRef.startsWith('file://') ? rawRef : toFileUri(parsed.filePath),
            lineStart,
            lineEnd,
            text: labelText || getBaseName(parsed.filePath),
            element: pillEl,
          };
        }
      }
    }

    // 3. Anchor with file scheme href, or http(s) anchor inside Prism's own `.ag-prism-thought-overlay`
    const anchor = findClosest(el, 'a[href]');
    if (anchor) {
      const href = String(anchor.getAttribute('href') || '').trim();
      if (isHttpUrl(href)) {
        if (findClosest(anchor, '.ag-prism-thought-overlay')) {
          return { kind: 'url', url: href, text: (anchor.textContent || '').trim(), element: anchor };
        }
        return null;
      }
      if (/^(?:file|vscode-file|antigravity-ide):/i.test(href)) {
        const parsed = parseFileUriToPath(href);
        if (parsed.filePath) {
          return {
            kind: 'file',
            filePath: parsed.filePath,
            rawUri: href,
            lineStart: parsed.lineStart,
            lineEnd: parsed.lineEnd,
            text: (anchor.textContent || '').trim() || getBaseName(parsed.filePath),
            element: anchor,
          };
        }
      }
    }

    // 4. Thought translator inline code chip (`code.ag-prism-thought-code`) carrying a URL or file path
    const thoughtCode = findClosest(el, 'code.ag-prism-thought-code');
    if (thoughtCode) {
      const rawCode = (thoughtCode.textContent || '').trim().replace(/^@/, '');
      if (isHttpUrl(rawCode)) {
        return { kind: 'url', url: rawCode, text: rawCode, element: thoughtCode };
      }
      if (/^localhost:\d{2,5}(?:\/[^\s]*)?$/i.test(rawCode)) {
        return { kind: 'url', url: 'http://' + rawCode, text: rawCode, element: thoughtCode };
      }
      if (!/\s/.test(rawCode)) {
        const parsedCode = parseFileUriToPath(rawCode);
        const ext = getFileExt(parsedCode.filePath);
        if (ext && KNOWN_FILE_EXTS.has(ext)) {
          return {
            kind: 'file',
            filePath: parsedCode.filePath,
            lineStart: parsedCode.lineStart,
            lineEnd: parsedCode.lineEnd,
            text: rawCode,
            element: thoughtCode,
          };
        }
      }
    }

    // 5. Code block path header (e.g. header bar above `<pre>` displaying `src/app.ts`)
    const codeHeader = findClosest(
      el,
      '[data-testid*="code-block-header"], [data-testid*="code-header"], .code-block-header, [data-code-file]'
    );
    if (codeHeader && el.tagName !== 'BUTTON') {
      const rawCodeFile =
        codeHeader.getAttribute?.('data-code-file') ||
        codeHeader.getAttribute?.('data-file-path') ||
        (el.textContent || codeHeader.textContent || '').trim();
      const parsedHeader = splitPathAndLineRange(rawCodeFile);
      const ext = getFileExt(parsedHeader.pathPart);
      if (ext && KNOWN_FILE_EXTS.has(ext) && !/\s/.test(parsedHeader.pathPart)) {
        return {
          kind: 'file',
          filePath: parsedHeader.pathPart,
          lineStart: parsedHeader.lineStart,
          lineEnd: parsedHeader.lineEnd,
          text: rawCodeFile,
          element: codeHeader,
        };
      }
    }

    // 6. Mermaid SVG diagram block
    const mermaidBox = findMermaidTarget(el);
    if (mermaidBox) {
      const svgEl = mermaidBox.tagName === 'SVG' ? mermaidBox : mermaidBox.querySelector?.('svg');
      const svgMarkup = svgEl ? svgEl.outerHTML : '';
      if (svgMarkup) {
        return {
          kind: 'mermaid',
          rawContent: svgMarkup,
          text: (mermaidBox.getAttribute?.('aria-label') || defaultMermaidLabel).trim(),
          element: mermaidBox,
        };
      }
    }

    return null;
  }

  // Aligned 100% with `style.css` tokens (`--ag-cs-accent`, `--ag-cs-r-*`, `--ag-cs-popover-bg`, `--ag-cs-mono-stack`, etc.)
  const OMNI_CSS = [
    ':root::highlight(ag-omni-url){color:var(--link,var(--ag-cs-accent,var(--primary,#669DF6)));text-decoration:underline;text-decoration-color:color-mix(in srgb,var(--ag-cs-accent,var(--primary,#669DF6)) 46%,transparent)}',
    ':root::highlight(ag-omni-path){color:var(--ag-cs-accent,var(--primary,#669DF6));background-color:color-mix(in srgb,var(--ag-cs-accent,var(--primary,#669DF6)) 12%,transparent);text-decoration:underline;text-decoration-color:color-mix(in srgb,var(--ag-cs-accent,var(--primary,#669DF6)) 36%,transparent)}',
    'html[data-ag-omni-hover-token="1"],html[data-ag-omni-hover-token="1"] body{cursor:pointer}',
    '.ag-omni-autolink{cursor:pointer;color:var(--link,var(--ag-cs-accent,var(--primary,#669DF6)));text-decoration:underline;text-decoration-color:color-mix(in srgb,var(--ag-cs-accent,var(--primary,#669DF6)) 44%,transparent);text-underline-offset:3px;border-radius:var(--ag-cs-r-sm,4px);transition:color .12s ease,background-color .12s ease,text-decoration-color .12s ease}',
    '.ag-omni-autolink[data-omni-path]{font-family:var(--ag-cs-mono-stack,var(--font-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace));font-size:.92em;padding:0 3px;background:color-mix(in srgb,var(--ag-cs-accent,var(--primary,#669DF6)) 9%,transparent);text-decoration:none;border:1px solid color-mix(in srgb,var(--ag-cs-accent,var(--primary,#669DF6)) 22%,transparent)}',
    '.ag-omni-autolink:hover{background:color-mix(in srgb,var(--ag-cs-accent,var(--primary,#669DF6)) 16%,transparent);text-decoration-color:var(--ag-cs-accent,var(--primary,#669DF6))}',
    'html[data-ag-cs-motion="off"] .ag-omni-autolink,html[data-ag-cs-motion="off"] .ag-omni-menu,html[data-ag-cs-motion="off"] .ag-omni-mermaid-zoom-btn{transition:none!important;animation:none!important}',
    '.ag-omni-menu{position:fixed;z-index:2147483640;min-width:208px;max-width:300px;padding:5px;border-radius:var(--ag-cs-r-lg,10px);background:var(--ag-cs-popover-bg,var(--card,rgba(23,24,30,.95)));color:var(--foreground,#F2F2F5);border:1px solid var(--ag-cs-border-2,var(--card-border,rgba(255,255,255,.12)));box-shadow:var(--ag-cs-surface-sh,0 14px 36px rgba(0,0,0,.38));backdrop-filter:blur(16px) saturate(140%);-webkit-backdrop-filter:blur(16px) saturate(140%);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:12.5px;line-height:1.35;user-select:none;outline:none}',
    '.ag-omni-menu-header{padding:4px 8px 5px;font-size:11px;color:var(--muted-foreground,rgba(148,163,184,.85));white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-bottom:1px solid var(--ag-cs-border-1,var(--border,rgba(148,163,184,.14)));margin-bottom:4px;font-family:var(--ag-cs-mono-stack,var(--font-mono,ui-monospace,SFMono-Regular,Menlo,monospace))}',
    '.ag-omni-menu-sep{height:1px;margin:4px;background:var(--ag-cs-border-1,var(--border,rgba(148,163,184,.15)))}',
    '.ag-omni-menu-item{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;padding:6px 9px;border:0;border-radius:var(--ag-cs-r-sm,4px);background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}',
    '.ag-omni-menu-item:hover,.ag-omni-menu-item[data-active="1"]{background:color-mix(in srgb,var(--ag-cs-accent,var(--primary,#669DF6)) 16%,transparent);color:var(--foreground,inherit)}',
    '.ag-omni-menu-kbd{font-size:10.5px;color:var(--muted-foreground,inherit);opacity:.78;font-family:var(--ag-cs-mono-stack,ui-monospace,SFMono-Regular,Menlo,monospace);flex-shrink:0}',
    '.ag-omni-btn{display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:24px;padding:0 6px;border:1px solid transparent;border-radius:var(--ag-cs-r-sm,4px);background:transparent;color:inherit;font-size:12px;line-height:1;cursor:pointer;opacity:.82}',
    '.ag-omni-btn:hover:not(:disabled){opacity:1;background:var(--ag-cs-hover-wash,color-mix(in srgb,var(--ag-cs-accent,#669DF6) 14%,transparent))}',
    '.ag-omni-btn:disabled{opacity:.32;cursor:default}',
    '.ag-omni-btn[data-active="1"]{opacity:1;background:color-mix(in srgb,var(--ag-cs-accent,var(--primary,#669DF6)) 18%,transparent);border-color:color-mix(in srgb,var(--ag-cs-accent,var(--primary,#669DF6)) 38%,transparent)}',
    '.ag-omni-mermaid-zoom-btn{position:absolute;top:6px;right:6px;z-index:3;height:24px;padding:0 7px;border-radius:var(--ag-cs-r-sm,4px);border:1px solid var(--ag-cs-border-2,rgba(148,163,184,.22));background:var(--ag-cs-popover-bg,var(--card,rgba(20,23,30,.88)));color:var(--foreground,#e2e8f0);font-size:11px;cursor:pointer;opacity:0;transition:opacity .14s ease,background-color .14s ease}',
    '[data-omni-mermaid-box]:hover>.ag-omni-mermaid-zoom-btn,.ag-omni-mermaid-zoom-btn:focus-visible{opacity:.92}',
    '.ag-omni-mermaid-zoom-btn:hover{opacity:1!important;background:color-mix(in srgb,var(--ag-cs-accent,var(--primary,#669DF6)) 18%,var(--card,#1e293b))}',
    '.ag-omni-aux-bar{display:flex;align-items:center;gap:6px;padding:4px 10px;border-bottom:1px solid var(--ag-cs-border-1,var(--border,rgba(148,163,184,.16)));background:var(--ag-cs-tonal-2,var(--card,var(--ag-cs-panel-bg,rgba(20,23,30,.9))));font-size:11.5px;flex-shrink:0}',
    '.ag-omni-sandbox-badge{margin-left:auto;display:inline-flex;align-items:center;gap:4px;height:20px;padding:0 7px;border-radius:999px;border:1px solid var(--ag-cs-border-1,var(--border,rgba(148,163,184,.2)));background:var(--ag-cs-tonal-1,rgba(255,255,255,.04));color:var(--muted-foreground,var(--ag-cs-muted,#94a3b8));font-size:10.5px;font-weight:500;letter-spacing:.01em;line-height:1;white-space:nowrap;user-select:none;opacity:.86}',
    '.ag-omni-aux-overlay{width:100%;flex:1 1 0%;min-height:360px;border:0;display:block;background:var(--ag-cs-tonal-0,var(--background,#0B0B0E));opacity:0;transition:opacity 140ms ease}',
    '.ag-omni-aux-overlay[data-wb-ready="1"]{opacity:1}',
  ].join('');

  function createOmniClient(env = {}) {
    const W = env.window || (typeof window !== 'undefined' ? window : globalThis);
    const D = env.document || W?.document || null;

    let enabled = true;
    let linkTarget = 'builtin';
    let serverMeta = null;
    let cachedWorkspaceRoot = '';
    let mounted = false;
    let destroyed = false;

    let rpcSeq = 0;
    let tabSeq = 0;
    const pendingRpc = new Map();
    const processedTextNodes = new WeakSet();
    const createdAutolinks = new Set();
    const decoratedMermaidBoxes = new Set();
    const mountedAuxSwitches = new Set();

    // Zero-DOM-mutation CSS Custom Highlight API state
    const textNodeTokenMap = new WeakMap();
    const excludedElCache = new WeakMap();
    const highlightedParentCount = new WeakMap();
    const trackedHighlightNodes = new Set();
    let urlHighlight = null;
    let pathHighlight = null;
    let hoverTokenActive = false;
    let pointerMoveRaf = null;
    let pendingPointerTarget = null;
    let pendingPointerX = 0;
    let pendingPointerY = 0;

    let domObserver = null;
    let rootAttrObserver = null;
    let scanTimer = null;
    let textScanTimer = null;
    const pendingScanRoots = new Set();
    const pendingTextNodes = new Set();

    let activeMenuEl = null;
    let activeMenuItems = [];
    let activeMenuIndex = -1;

    // Observable native browser tab history & logical-to-host tabId map
    let lastOpenedTab = null;
    const openedNativeTabs = [];
    const logicalTabIdMap = new Map();

    function supportsHighlightApi() {
      return Boolean(
        W?.CSS?.highlights &&
          typeof W.CSS.highlights.set === 'function' &&
          typeof W.Highlight === 'function' &&
          typeof D?.createRange === 'function' &&
          (typeof D?.caretRangeFromPoint === 'function' || typeof D?.caretPositionFromPoint === 'function')
      );
    }

    function resolveLang() {
      const attrLang = normalizeLangCode(D?.documentElement?.getAttribute?.('data-ag-cs-lang'));
      if (attrLang) return attrLang;
      const cfgLang = normalizeLangCode(W?.__agPrism?.getState?.()?.cfg?.language);
      if (cfgLang) return cfgLang;
      const navObj = W && 'navigator' in W ? W.navigator : (typeof navigator !== 'undefined' ? navigator : null);
      const navLang = normalizeLangCode(navObj?.language || '');
      return navLang || 'en';
    }

    function getStrings() {
      const lang = resolveLang();
      const idx = LANG_INDEX[lang] ?? 2;
      const base = {};
      for (const k of Object.keys(FALLBACK_ROWS)) {
        base[k] = FALLBACK_ROWS[k][idx] ?? FALLBACK_ROWS[k][2];
      }
      try {
        const shared = W?.__agCsLocales?.getUiStrings?.(lang);
        if (shared && typeof shared === 'object') return { ...base, ...shared };
      } catch (_) {}
      return base;
    }

    function resolveEffectiveLinkMode(ev) {
      const invert = Boolean(ev && (ev.ctrlKey || ev.metaKey));
      const baseMode = linkTarget === 'external' ? 'external' : 'builtin';
      return invert ? (baseMode === 'builtin' ? 'external' : 'builtin') : baseMode;
    }

    function readVisualState() {
      const rootEl = D?.documentElement;
      const getAttr = (name, fallback) => {
        const v = rootEl?.getAttribute?.(name);
        return v ? String(v) : fallback;
      };
      const rawPalette = getAttr('data-ag-cs-palette', 'obsidian');
      return {
        theme: getAttr('data-ag-cs-theme', 'dark') === 'light' ? 'light' : 'dark',
        palette: rawPalette === 'claude' ? 'warm' : rawPalette,
        lightPreset: getAttr('data-ag-cs-light-preset', 'crystal'),
        accent: getAttr('data-ag-cs-accent', 'follow'),
        corners: getAttr('data-ag-cs-corners', 'balanced'),
        motion: getAttr('data-ag-cs-motion', 'standard'),
        lang: resolveLang(),
      };
    }

    // ── Legacy `.ag-omni-dock` Residue Sweeper (#209) ────────────────────────
    function purgeLegacyOmniDock() {
      if (!D || typeof D.querySelectorAll !== 'function') return;
      try {
        const staleDocks = D.querySelectorAll('.ag-omni-dock, [data-testid="ag-omni-dock"]');
        for (const node of staleDocks) {
          try { node.remove?.(); } catch (_) {}
        }
        const auxSplit = D.querySelector?.('[data-testid="aux-pane-split"]');
        const mainPane = auxSplit?.firstElementChild;
        if (mainPane && mainPane.style) {
          if (mainPane.style.flex === '1 1 0%' || mainPane.style.minWidth === '320px') {
            mainPane.style.flex = '';
            mainPane.style.flexGrow = '1';
            mainPane.style.minWidth = '300px';
          }
        }
      } catch (_) {}
      try {
        W?.electronNative?.wcvBrowser?.hide?.('ag-prism-omni-browser');
        W?.electronNative?.wcvBrowser?.dispose?.('ag-prism-omni-browser');
      } catch (_) {}
    }

    // ── Bridge / RPC Client (`__agPrismOmniBridge` + `__agPrismOmniCall`) ────
    function installRpcResolver() {
      if (!W) return;
      const prevResolve = typeof W.__agPrismOmniResolve === 'function' ? W.__agPrismOmniResolve : null;
      W.__agPrismOmniResolve = (id, res) => {
        const entry = pendingRpc.get(id);
        if (entry) {
          clearTimeout(entry.timer);
          pendingRpc.delete(id);
          entry.resolve(res);
          return;
        }
        if (prevResolve && prevResolve !== W.__agPrismOmniResolve) {
          try { prevResolve(id, res); } catch (_) {}
        }
      };
    }

    function callOmniRpc(action, params = {}, timeoutMs = 6000) {
      if (!W) return Promise.resolve({ ok: false, offline: true });
      try {
        if (W.__agPrismOmniBridge && typeof W.__agPrismOmniBridge.call === 'function') {
          return Promise.resolve(W.__agPrismOmniBridge.call({ action, ...params }, timeoutMs));
        }
        if (typeof W.__agPrismOmniCall === 'function') {
          installRpcResolver();
          const id = ++rpcSeq;
          return new Promise((resolve) => {
            const timer = setTimeout(() => {
              pendingRpc.delete(id);
              resolve({ ok: false, timeout: true });
            }, timeoutMs);
            pendingRpc.set(id, { resolve, timer });
            try {
              const directRet = W.__agPrismOmniCall(JSON.stringify({ id, action, ...params }));
              if (directRet !== undefined) {
                clearTimeout(timer);
                pendingRpc.delete(id);
                Promise.resolve(directRet)
                  .then((val) => {
                    if (typeof val === 'string') {
                      try { resolve(JSON.parse(val)); return; } catch (_) {}
                    }
                    resolve(val);
                  })
                  .catch((err) => resolve({ ok: false, error: String(err?.message || err) }));
              }
            } catch (err) {
              clearTimeout(timer);
              pendingRpc.delete(id);
              resolve({ ok: false, error: String(err?.message || err) });
            }
          });
        }
      } catch (_) {}
      return Promise.resolve({ ok: false, offline: true });
    }

    async function ensureServerMeta() {
      if (serverMeta && serverMeta.baseUrl && serverMeta.token) return serverMeta;
      const globalMeta = W?.__agPrismOmniServerMeta;
      if (globalMeta && globalMeta.baseUrl && globalMeta.token) {
        serverMeta = {
          baseUrl: String(globalMeta.baseUrl).replace(/\/+$/, ''),
          token: String(globalMeta.token),
          port: globalMeta.port || null,
        };
        return serverMeta;
      }
      const res = await callOmniRpc('getServerInfo', {});
      if (res && res.ok && res.baseUrl && res.token) {
        serverMeta = {
          baseUrl: String(res.baseUrl).replace(/\/+$/, ''),
          token: String(res.token),
          port: res.port || null,
        };
        return serverMeta;
      }
      return null;
    }

    // ── Host React Fiber & Redux Store Discovery (`/main.js` #208 Contract) ──
    function discoverHostBridge() {
      let browserCtx = null;
      let reduxStore = null;
      if (!D) return { browserCtx: null, reduxStore: null };

      try {
        const candidates = [D.getElementById?.('root'), D.body].filter(Boolean);
        const queue = [];
        for (const hostNode of candidates) {
          const keys = Object.keys(hostNode);
          for (const k of keys) {
            if (k.startsWith('__reactContainer') || k.startsWith('__reactFiber')) {
              if (hostNode[k]) queue.push(hostNode[k]);
            }
          }
        }
        const seen = new Set();
        let steps = 0;
        while (queue.length && steps++ < 2000 && (!browserCtx || !reduxStore)) {
          const n = queue.shift();
          if (!n || seen.has(n)) continue;
          seen.add(n);
          const mp = n.memoizedProps;
          if (mp && typeof mp === 'object') {
            if (
              !reduxStore &&
              mp.store &&
              typeof mp.store.getState === 'function' &&
              typeof mp.store.dispatch === 'function'
            ) {
              reduxStore = mp.store;
            }
            const ctxVal =
              typeof mp.openUrlInBrowserPane === 'function'
                ? mp
                : mp.value && typeof mp.value === 'object' && typeof mp.value.openUrlInBrowserPane === 'function'
                ? mp.value
                : null;
            if (!browserCtx && ctxVal && ctxVal.isBrowserPaneAvailable !== false) {
              browserCtx = ctxVal;
            }
          }
          if (n.child) queue.push(n.child);
          if (n.sibling) queue.push(n.sibling);
        }
      } catch (_) {}

      return { browserCtx, reduxStore };
    }

    function findFocusedCascadeIdFromLayout(layoutState) {
      if (!layoutState || !layoutState.rootNode) return '';
      const panes = [];
      const walk = (node) => {
        if (!node) return;
        if (node.type === 'pane') panes.push(node);
        else if (Array.isArray(node.children)) node.children.forEach(walk);
      };
      walk(layoutState.rootNode);
      const focusedId = layoutState.focusedPaneId;
      const hit = panes.find((p) => p.id === focusedId || p.cascadeId === focusedId) || panes[0];
      return hit && typeof hit.cascadeId === 'string' ? hit.cascadeId : '';
    }

    function resolveHostTreeId(reduxStore, browserCtx) {
      if (browserCtx && typeof browserCtx.getTargetTreeId === 'function') {
        try {
          const tid = browserCtx.getTargetTreeId();
          if (tid && typeof tid === 'object' && typeof tid.kind === 'string') return tid;
        } catch (_) {}
      }

      const pathname = String(W?.location?.pathname || '');
      const search = String(W?.location?.search || '');
      const cMatch = pathname.match(/\/c\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
      if (cMatch && cMatch[1]) {
        return { kind: 'cascadeId', cascadeId: cMatch[1] };
      }

      try {
        const st = reduxStore?.getState?.();
        const layoutCid = findFocusedCascadeIdFromLayout(st?.multiConvoLayout);
        if (layoutCid && GUID_RE.test(layoutCid)) {
          return { kind: 'cascadeId', cascadeId: layoutCid };
        }
      } catch (_) {}

      if (search) {
        try {
          const qs = new URLSearchParams(search);
          const projId = qs.get('project');
          if (projId) return { kind: 'newConversation', projectId: projId };
        } catch (_) {}
      }

      const cascadeDom = D?.querySelector?.('[data-cascade-id]');
      const domCid = cascadeDom?.getAttribute?.('data-cascade-id') || '';
      if (domCid && GUID_RE.test(domCid)) {
        return { kind: 'cascadeId', cascadeId: domCid };
      }

      return { kind: 'home' };
    }

    function getSidePanelPaneSlice(sliceObj, treeId) {
      if (!sliceObj || !treeId) return null;
      if (treeId.kind === 'cascadeId') return sliceObj.conversationPanes?.[treeId.cascadeId] || null;
      if (treeId.kind === 'newConversation') return sliceObj.newConversationPanes?.[treeId.projectId] || null;
      if (treeId.kind === 'customView') return sliceObj.customViewPanes?.[treeId.viewId] || null;
      return sliceObj.homePane || null;
    }

    function recordNativeTabOpen(entry) {
      lastOpenedTab = entry;
      openedNativeTabs.push(entry);
      if (openedNativeTabs.length > 32) openedNativeTabs.shift();
    }

    // ── Native Host Right-Side Browser Tab Launcher (#208 + #209) ────────────
    function openInHostNativeBrowserTab(rawUrl, opts = {}) {
      const url = String(rawUrl || '').trim();
      if (!url) return false;

      const title = String(opts.title || '').trim();
      const preferredTabId = String(opts.preferredTabId || '').trim();
      const { browserCtx, reduxStore } = discoverHostBridge();
      const treeId = resolveHostTreeId(reduxStore, browserCtx);

      // 1. Primary path: Host React Context `openUrlInBrowserPane(url, { preferredTabId, targetTreeId })`
      //    Always prefer `openUrlInBrowserPane` when available so the host router updates URL `?tab=browser__...`
      //    atomically and activates the WCV guest immediately (avoiding router `?tab=` snap-back to an older tab).
      if (browserCtx && typeof browserCtx.openUrlInBrowserPane === 'function') {
        try {
          let mappedHostTabId = preferredTabId ? logicalTabIdMap.get(preferredTabId) || preferredTabId : '';
          if (reduxStore && preferredTabId && logicalTabIdMap.has(preferredTabId)) {
            const preSt = reduxStore.getState?.() || {};
            const prePane = getSidePanelPaneSlice(preSt.sidePanelV2 || preSt.sidePanel, treeId);
            const stillOpen = prePane?.tabs?.find((t) => t.id === mappedHostTabId);
            if (!stillOpen) {
              logicalTabIdMap.delete(preferredTabId);
              mappedHostTabId = preferredTabId;
            } else if (stillOpen.content?.customView?.customPaneKey === 'browser') {
              // Refresh initialUrl if query/theme params changed on an existing logical tab
              let curInp = {};
              try { curInp = JSON.parse(stillOpen.content.customView.serializedInputs || '{}'); } catch (_) {}
              if (curInp.initialUrl !== url) {
                const updatedInputs = JSON.stringify({
                  ...curInp,
                  tabId: stillOpen.id,
                  initialUrl: url,
                  entryUrl: url,
                  ...(title ? { pageTitle: title } : {}),
                });
                reduxStore.dispatch({
                  type: preSt.sidePanelV2 ? 'sidePanelV2/setContent' : 'sidePanel/setContent',
                  payload: {
                    panelScope: treeId,
                    treeId,
                    tabId: stillOpen.id,
                    keepOpen: true,
                    background: false,
                    content: {
                      type: 'customView',
                      customView: { customPaneKey: 'browser', serializedInputs: updatedInputs },
                    },
                  },
                });
              }
            }
          }

          const ctxOpts = {};
          if (mappedHostTabId) ctxOpts.preferredTabId = mappedHostTabId;
          if (treeId) ctxOpts.targetTreeId = treeId;
          const opened = browserCtx.openUrlInBrowserPane(url, ctxOpts);
          if (opened !== false) {
            let activeTabId = mappedHostTabId || preferredTabId;
            if (reduxStore) {
              try {
                const st = reduxStore.getState?.() || {};
                const hasV2 = Boolean(st.sidePanelV2);
                const pane = getSidePanelPaneSlice(hasV2 ? st.sidePanelV2 : st.sidePanel, treeId);
                const matchedTab =
                  (mappedHostTabId && pane?.tabs?.find((t) => t.id === mappedHostTabId)) ||
                  (pane?.activeTabId && pane?.tabs?.find((t) => t.id === pane.activeTabId && t.content?.customView?.customPaneKey === 'browser')) ||
                  pane?.tabs?.find((t) => {
                    if (t.content?.type !== 'customView' || t.content.customView?.customPaneKey !== 'browser') {
                      return false;
                    }
                    try {
                      const inp = JSON.parse(t.content.customView.serializedInputs || '{}');
                      return inp.initialUrl === url || inp.entryUrl === url;
                    } catch (_) {
                      return false;
                    }
                  });
                if (matchedTab) {
                  activeTabId = matchedTab.id;
                  if (preferredTabId) logicalTabIdMap.set(preferredTabId, matchedTab.id);
                }

                reduxStore.dispatch({
                  type: 'sidePanel/setSidePanelOpen',
                  payload: { treeId, isOpen: true },
                });
                if (hasV2 && treeId?.kind === 'cascadeId' && st.sidePanelV2?.overviewPanelOpen?.[treeId.cascadeId]) {
                  reduxStore.dispatch({
                    type: 'sidePanelV2/setOverviewPanelOpen',
                    payload: { cascadeId: treeId.cascadeId, open: false },
                  });
                }
                if (title && matchedTab) {
                  let prevInputs = {};
                  try {
                    prevInputs = JSON.parse(matchedTab.content?.customView?.serializedInputs || '{}');
                  } catch (_) {}
                  if (prevInputs.pageTitle !== title) {
                    const nextInputs = JSON.stringify({
                      ...prevInputs,
                      tabId: matchedTab.id,
                      initialUrl: prevInputs.initialUrl || url,
                      entryUrl: prevInputs.entryUrl || url,
                      pageTitle: title,
                    });
                    reduxStore.dispatch({
                      type: hasV2 ? 'sidePanelV2/setContent' : 'sidePanel/setContent',
                      payload: {
                        panelScope: treeId,
                        treeId,
                        tabId: matchedTab.id,
                        keepOpen: true,
                        background: false,
                        content: {
                          type: 'customView',
                          customView: { customPaneKey: 'browser', serializedInputs: nextInputs },
                        },
                      },
                    });
                  }
                }
              } catch (_) {}
            }
            recordNativeTabOpen({
              method: 'context',
              url,
              tabId: activeTabId || 'host-browser-tab',
              title,
              treeId,
            });
            return true;
          }
        } catch (_) {}
      }

      // 2. Fallback path: Direct Redux `store.dispatch` (`sidePanelV2/*` & legacy `sidePanel/*`)
      if (reduxStore && typeof reduxStore.dispatch === 'function') {
        try {
          const st = reduxStore.getState?.() || {};
          const hasV2 = Boolean(st.sidePanelV2);
          const pane = getSidePanelPaneSlice(hasV2 ? st.sidePanelV2 : st.sidePanel, treeId);

          let tabId = preferredTabId;
          let existingInputs = null;
          if (pane && Array.isArray(pane.tabs)) {
            const existing = pane.tabs.find((t) => {
              if (t.content?.type !== 'customView' || t.content.customView?.customPaneKey !== 'browser') {
                return false;
              }
              if (tabId && t.id === tabId) return true;
              if (!tabId) {
                try {
                  const inp = JSON.parse(t.content.customView.serializedInputs || '{}');
                  return inp.initialUrl === url;
                } catch (_) {}
              }
              return false;
            });
            if (existing) {
              tabId = existing.id;
              try {
                existingInputs = JSON.parse(existing.content.customView.serializedInputs || '{}');
              } catch (_) {}
            }
          }
          if (!tabId) {
            tabId = `browser__${Date.now()}_${(++tabSeq).toString(36)}`;
          }

          const serializedInputs = JSON.stringify({
            ...(existingInputs || {}),
            tabId,
            initialUrl: url,
            entryUrl: url,
            ...(title ? { pageTitle: title } : {}),
          });

          reduxStore.dispatch({
            type: 'sidePanel/setSidePanelOpen',
            payload: { treeId, isOpen: true },
          });

          if (hasV2) {
            if (treeId?.kind === 'cascadeId' && st.sidePanelV2?.overviewPanelOpen?.[treeId.cascadeId]) {
              reduxStore.dispatch({
                type: 'sidePanelV2/setOverviewPanelOpen',
                payload: { cascadeId: treeId.cascadeId, open: false },
              });
            }
            reduxStore.dispatch({
              type: 'sidePanelV2/setContent',
              payload: {
                panelScope: treeId,
                treeId,
                tabId,
                keepOpen: true,
                background: false,
                content: {
                  type: 'customView',
                  customView: { customPaneKey: 'browser', serializedInputs },
                },
              },
            });
            reduxStore.dispatch({
              type: 'sidePanelV2/setActiveTab',
              payload: { panelScope: treeId, treeId, tabId },
            });
          } else {
            reduxStore.dispatch({
              type: 'sidePanel/setContent',
              payload: {
                treeId,
                tabId,
                keepOpen: true,
                background: false,
                content: {
                  type: 'customView',
                  customView: { customPaneKey: 'browser', serializedInputs },
                },
              },
            });
            reduxStore.dispatch({
              type: 'sidePanel/setActiveTab',
              payload: { treeId, tabId },
            });
          }

          recordNativeTabOpen({ method: 'redux', url, tabId, title, treeId });
          return true;
        } catch (_) {}
      }

      // 3. Headless / Unit-Test Observable Fallback (no host React Fiber / Redux store mounted)
      const fallbackTabId = preferredTabId || `browser__fallback_${++tabSeq}`;
      const fallbackEntry = { method: 'fallback', url, tabId: fallbackTabId, title, treeId: null };
      recordNativeTabOpen(fallbackEntry);
      if (typeof env.onNativeTabOpen === 'function') {
        try { env.onNativeTabOpen(fallbackEntry); } catch (_) {}
        return true;
      }
      const isLocalGateway = Boolean(serverMeta?.baseUrl && url.startsWith(serverMeta.baseUrl + '/'));
      if (!isLocalGateway && env.fallbackToExternal !== false) {
        void openExternalTarget(url);
      }
      return true;
    }

    function discoverWorkspaceRoot() {
      if (cachedWorkspaceRoot || !D) return cachedWorkspaceRoot;
      try {
        const composer = D.querySelector('[data-testid="agent-input-box"]');
        if (composer) {
          const fk = Object.keys(composer).find((k) => k.startsWith('__reactFiber'));
          let cur = fk ? composer[fk] : null;
          for (let i = 0; i < 6 && cur; i++, cur = cur.return) {
            const wsScripts = cur.memoizedProps?.agentScripts?.workspaceScriptsDir;
            if (typeof wsScripts === 'string' && wsScripts.startsWith('file://')) {
              const decoded = parseFileUriToPath(wsScripts).filePath;
              const trimmed = decoded.replace(/[\\/]\.(?:agents|gemini)(?:[\\/]agents)?$/i, '');
              if (trimmed && trimmed !== decoded) {
                cachedWorkspaceRoot = trimmed;
                return cachedWorkspaceRoot;
              }
            }
          }
        }
        const { reduxStore } = discoverHostBridge();
        if (reduxStore) {
          const st = reduxStore.getState();
          const byWs = st?.vcsWorkspaceState?.byWorkspaceUri;
          if (byWs && typeof byWs === 'object') {
            const firstUri = Object.keys(byWs)[0];
            if (firstUri) {
              cachedWorkspaceRoot = parseFileUriToPath(firstUri).filePath;
              if (cachedWorkspaceRoot) return cachedWorkspaceRoot;
            }
          }
          const selUri = st?.settingsScreen?.selectedWorkspaceUri;
          if (typeof selUri === 'string' && selUri) {
            cachedWorkspaceRoot = parseFileUriToPath(selUri).filePath;
            if (cachedWorkspaceRoot) return cachedWorkspaceRoot;
          }
        }
      } catch (_) {}
      return cachedWorkspaceRoot;
    }

    async function copyTextToClipboard(text) {
      const str = String(text ?? '');
      if (!str) return false;
      try {
        if (W?.navigator?.clipboard?.writeText) {
          await W.navigator.clipboard.writeText(str);
          return true;
        }
      } catch (_) {}
      try {
        if (D && typeof D.createElement === 'function') {
          const ta = D.createElement('textarea');
          ta.value = str;
          if (ta.style) {
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            ta.style.pointerEvents = 'none';
          }
          D.body?.appendChild?.(ta);
          ta.select?.();
          const ok = Boolean(D.execCommand?.('copy'));
          ta.remove?.();
          return ok;
        }
      } catch (_) {}
      return false;
    }

    async function openExternalTarget(targetUrlOrPath) {
      const raw = String(targetUrlOrPath || '').trim();
      if (!raw) return false;
      if (isHttpUrl(raw) && typeof W?.electronNative?.openExternal === 'function') {
        try {
          await W.electronNative.openExternal(raw);
          return true;
        } catch (_) {}
      }
      const rpcRes = await callOmniRpc('openExternal', { target: raw });
      if (rpcRes && rpcRes.ok) return true;
      if (typeof W?.electronNative?.openExternal === 'function') {
        try {
          const uri = isHttpUrl(raw) ? raw : toFileUri(raw) || raw;
          await W.electronNative.openExternal(uri);
          return true;
        } catch (_) {}
      }
      if (isHttpUrl(raw) && typeof W?.open === 'function') {
        try {
          W.open(raw, '_blank', 'noopener,noreferrer');
          return true;
        } catch (_) {}
      }
      return false;
    }

    async function revealFileInFolder(filePath, rawUri) {
      const cleanPath = splitPathAndLineRange(filePath).pathPart;
      if (!cleanPath) return false;
      if (typeof W?.electronNative?.revealInFilePicker === 'function') {
        try {
          const arg = rawUri && /^file:\/\//i.test(rawUri) ? rawUri : toFileUri(cleanPath) || cleanPath;
          await W.electronNative.revealInFilePicker(arg);
          return true;
        } catch (_) {}
      }
      const rpcRes = await callOmniRpc('revealInFolder', { path: cleanPath });
      return Boolean(rpcRes && rpcRes.ok);
    }

    function insertFileMentionIntoComposer(filePath) {
      if (!D) return false;
      const ce =
        D.querySelector('[data-testid="agent-input-box"] [contenteditable="true"]') ||
        D.querySelector('#antigravity\\.agentSidePanelInputBox [contenteditable="true"]');
      if (!ce) return false;

      const wsRoot = discoverWorkspaceRoot();
      const rel = computeRelativePath(splitPathAndLineRange(filePath).pathPart, wsRoot);
      const tokenPath = rel && !rel.startsWith('..') ? rel : normalizeSlashes(splitPathAndLineRange(filePath).pathPart);
      const existing = String(ce.textContent || '');
      const needsLeadSpace = existing.length > 0 && !/\s$/.test(existing);
      const mentionStr = `${needsLeadSpace ? ' ' : ''}@${tokenPath} `;

      try { ce.focus?.(); } catch (_) {}

      let inserted = false;
      try {
        if (typeof D.execCommand === 'function') {
          const before = ce.textContent;
          const ok = D.execCommand('insertText', false, mentionStr);
          if (ok && ce.textContent !== before) inserted = true;
        }
      } catch (_) {}

      if (!inserted) {
        ce.textContent = String(ce.textContent || '') + mentionStr;
        try {
          const EvCtor = W?.InputEvent || W?.Event;
          if (typeof EvCtor === 'function') {
            ce.dispatchEvent(new EvCtor('input', { bubbles: true, cancelable: false, data: mentionStr, inputType: 'insertText' }));
          }
        } catch (_) {}
      }
      return true;
    }

    // ── Streaming Workbench URL Builder & Aux Sync ───────────────────────────
    function buildViewerUrl(meta, opts = {}) {
      const vs = readVisualState();
      const params = [
        `token=${encodeURIComponent(meta.token)}`,
        `path=${encodeURIComponent(opts.filePath || '')}`,
        `kind=${encodeURIComponent(opts.kind || 'auto')}`,
        `theme=${encodeURIComponent(vs.theme)}`,
        `palette=${encodeURIComponent(vs.palette)}`,
        `lightPreset=${encodeURIComponent(vs.lightPreset)}`,
        `accent=${encodeURIComponent(vs.accent)}`,
        `corners=${encodeURIComponent(vs.corners)}`,
        `lang=${encodeURIComponent(vs.lang)}`,
      ];
      if (opts.name) params.push(`name=${encodeURIComponent(String(opts.name))}`);
      if (opts.lineStart) params.push(`lineStart=${encodeURIComponent(String(opts.lineStart))}`);
      if (opts.lineEnd) params.push(`lineEnd=${encodeURIComponent(String(opts.lineEnd))}`);
      const hash = opts.rawContent
        ? `#raw=${encodeURIComponent(String(opts.rawContent))}${opts.name ? `&title=${encodeURIComponent(String(opts.name))}` : ''}`
        : '';
      return `${meta.baseUrl}/viewer?${params.join('&')}${hash}`;
    }

    function buildSyncPayload(sessionOverride) {
      const vs = readVisualState();
      return {
        type: 'ag-prism-workbench-sync',
        theme: vs.theme,
        palette: vs.palette,
        lightPreset: vs.lightPreset,
        accent: vs.accent,
        corners: vs.corners,
        lang: vs.lang,
        path: sessionOverride?.filePath || '',
        ...(sessionOverride?.lineStart ? { lineStart: sessionOverride.lineStart } : {}),
        ...(sessionOverride?.lineEnd ? { lineEnd: sessionOverride.lineEnd } : {}),
        ...(sessionOverride?.rawContent ? { rawContent: sessionOverride.rawContent } : {}),
      };
    }

    // SEC-7: Strictly lock postMessage targetOrigin to `serverMeta.baseUrl` (never `'*'`)
    function pushWorkbenchSyncToIframe(iframeEl, sessionOverride) {
      if (!iframeEl || !iframeEl.contentWindow || !serverMeta?.baseUrl) return;
      try {
        iframeEl.contentWindow.postMessage(buildSyncPayload(sessionOverride), serverMeta.baseUrl);
      } catch (_) {}
    }

    function broadcastThemeAndLocaleSync() {
      const s = getStrings();
      for (const rec of mountedAuxSwitches) {
        if (rec.iframe && rec.iframe.isConnected && rec.iframe.contentWindow) {
          pushWorkbenchSyncToIframe(rec.iframe, { filePath: rec.filePath });
        }
        syncAuxBarUi(rec, s);
      }
      for (const box of decoratedMermaidBoxes) {
        const btn = box.querySelector?.('.ag-omni-mermaid-zoom-btn');
        if (btn) {
          btn.textContent = `⤢ ${s.omniZoomDiagram}`;
          btn.title = s.omniZoomDiagram;
        }
      }
    }

    // ── Public API: `openUrl` & `openFile` (Unified Native Side Tab Routing) ──
    async function openUrl(rawUrl, mode = 'auto') {
      const url = String(rawUrl || '').trim();
      if (!url) return false;
      const effectiveMode =
        mode === 'builtin' || mode === 'external'
          ? mode
          : linkTarget === 'external'
          ? 'external'
          : 'builtin';
      if (effectiveMode === 'external' || !enabled) return openExternalTarget(url);
      return openInHostNativeBrowserTab(url);
    }

    async function openFile(rawFilePath, opts = {}) {
      const parsed = parseFileUriToPath(rawFilePath);
      const cleanPath = parsed.filePath;
      const lineStart = opts.lineStart ?? parsed.lineStart ?? null;
      const lineEnd = opts.lineEnd ?? parsed.lineEnd ?? null;
      const mode = opts.mode || 'workbench';

      if (mode === 'reveal') return revealFileInFolder(cleanPath, opts.rawUri);
      if (mode === 'external' || !enabled) return openExternalTarget(cleanPath);

      let finalPath = cleanPath;
      const isInlineMermaid = opts.kind === 'mermaid' && !finalPath;
      if (
        finalPath &&
        !isInlineMermaid &&
        !/^[A-Za-z]:[\\/]/.test(finalPath) &&
        !finalPath.startsWith('/')
      ) {
        const wsHint = discoverWorkspaceRoot();
        const res = await callOmniRpc('resolvePath', { rawPath: finalPath, workspaceHint: wsHint });
        if (res && res.ok && res.absPath) finalPath = res.absPath;
        else if (wsHint) finalPath = normalizeSlashes(wsHint).replace(/\/$/, '') + '/' + finalPath.replace(/^\.\//, '');
      }

      const meta = await ensureServerMeta();
      if (!meta) {
        if (finalPath) return openExternalTarget(finalPath);
        return false;
      }

      const resolvedKind = isInlineMermaid ? 'mermaid' : detectPreviewKind(finalPath, opts.kind);
      const s = getStrings();
      const baseTitle = opts.title || (finalPath ? getBaseName(finalPath) : s.omniZoomDiagram);
      const rangeSuffix = lineStart ? (lineEnd ? ` #L${lineStart}-L${lineEnd}` : ` #L${lineStart}`) : '';
      const tabTitle = `${baseTitle}${rangeSuffix}`;
      const preferredTabId = isInlineMermaid
        ? 'prism-omni__mermaid'
        : `prism-omni__${shortStableHash(normalizeSlashes(finalPath).toLowerCase())}`;

      const viewerUrl = buildViewerUrl(meta, {
        filePath: finalPath,
        kind: resolvedKind,
        name: baseTitle,
        lineStart,
        lineEnd,
        rawContent: isInlineMermaid ? opts.rawContent || '' : '',
      });

      return openInHostNativeBrowserTab(viewerUrl, {
        title: tabTitle,
        preferredTabId,
      });
    }

    // ── Right-Click Optical Context Menu ─────────────────────────────────────
    function closeContextMenu() {
      if (activeMenuEl) {
        try { activeMenuEl.remove(); } catch (_) {}
        activeMenuEl = null;
      }
      activeMenuItems = [];
      activeMenuIndex = -1;
    }

    function highlightMenuIndex(idx) {
      if (!activeMenuItems.length) return;
      const count = activeMenuItems.length;
      activeMenuIndex = ((idx % count) + count) % count;
      activeMenuItems.forEach((btn, i) => {
        if (i === activeMenuIndex) {
          btn.setAttribute('data-active', '1');
          btn.focus?.();
        } else {
          btn.removeAttribute('data-active');
        }
      });
    }

    function markNoTranslate(el) {
      if (!el || typeof el.setAttribute !== 'function') return el;
      el.setAttribute('translate', 'no');
      el.setAttribute('data-no-translate', 'true');
      el.setAttribute('data-ag-localization-skip', 'true');
      el.setAttribute('data-agy-no-translate', 'true');
      el.setAttribute('data-antigravity-zh-skip', '1');
      el.setAttribute('data-ag-no-i18n', '');
      return el;
    }

    function openContextMenuAt(clientX, clientY, headerLabel, entries) {
      if (!D) return;
      closeContextMenu();

      const menu = markNoTranslate(D.createElement('div'));
      menu.className = 'ag-omni-menu ag-prism-omni-menu';
      menu.setAttribute('role', 'menu');
      menu.setAttribute('data-testid', 'ag-omni-context-menu');
      menu.setAttribute('data-ag-prism-omni-owned', '1');
      menu.tabIndex = -1;

      if (headerLabel) {
        const hdr = D.createElement('div');
        hdr.className = 'ag-omni-menu-header';
        hdr.textContent = headerLabel;
        menu.appendChild(hdr);
      }

      const itemButtons = [];
      for (const entry of entries) {
        if (!entry) continue;
        if (entry.separator) {
          const sep = D.createElement('div');
          sep.className = 'ag-omni-menu-sep';
          sep.setAttribute('role', 'separator');
          menu.appendChild(sep);
          continue;
        }
        const btn = D.createElement('button');
        btn.type = 'button';
        btn.className = 'ag-omni-menu-item';
        btn.setAttribute('role', 'menuitem');
        btn.setAttribute('data-omni-action', entry.id);

        const lbl = D.createElement('span');
        lbl.textContent = entry.label;
        btn.appendChild(lbl);

        if (entry.hint) {
          const kbd = D.createElement('span');
          kbd.className = 'ag-omni-menu-kbd';
          kbd.textContent = entry.hint;
          btn.appendChild(kbd);
        }

        const idx = itemButtons.length;
        btn.addEventListener('mouseenter', () => highlightMenuIndex(idx));
        btn.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          closeContextMenu();
          void entry.run();
        });

        itemButtons.push(btn);
        menu.appendChild(btn);
      }

      activeMenuEl = menu;
      activeMenuItems = itemButtons;
      (D.body || D.documentElement).appendChild(menu);

      const vw = W?.innerWidth || 1280;
      const vh = W?.innerHeight || 800;
      const rect = menu.getBoundingClientRect?.() || { width: 230, height: 220 };
      const left = Math.max(8, Math.min(clientX, vw - (rect.width || 230) - 8));
      const top = Math.max(8, Math.min(clientY, vh - (rect.height || 220) - 8));
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;

      if (itemButtons.length > 0) highlightMenuIndex(0);
    }

    function buildMenuForTarget(meta, selectedText) {
      const s = getStrings();
      const entries = [];

      if (meta.kind === 'url') {
        entries.push({
          id: 'open-builtin',
          label: s.omniOpenBuiltin,
          hint: linkTarget === 'builtin' ? s.omniHintClick : s.omniHintCtrlClick,
          run: () => openUrl(meta.url, 'builtin'),
        });
        entries.push({
          id: 'open-browser',
          label: s.omniOpenBrowser,
          hint: linkTarget === 'external' ? s.omniHintClick : s.omniHintCtrlClick,
          run: () => openUrl(meta.url, 'external'),
        });
        entries.push({ separator: true });
        entries.push({
          id: 'copy-link',
          label: s.omniCopyLink,
          run: () => copyTextToClipboard(meta.url),
        });
        const copyTxt = selectedText || (meta.text && meta.text !== meta.url ? meta.text : '');
        if (copyTxt) {
          entries.push({ id: 'copy-text', label: s.omniCopyText, run: () => copyTextToClipboard(copyTxt) });
        }
        return { header: meta.url, entries };
      }

      if (meta.kind === 'file') {
        const wsRoot = discoverWorkspaceRoot();
        const absBase = meta.filePath;
        const relWithRange = computeRelativePath(
          absBase + (meta.lineStart ? (meta.lineEnd ? `#L${meta.lineStart}-L${meta.lineEnd}` : `#L${meta.lineStart}`) : ''),
          wsRoot
        );

        entries.push({
          id: 'open-preview',
          label: s.omniOpenPreview,
          run: () =>
            openFile(absBase, {
              mode: 'workbench',
              rawUri: meta.rawUri,
              lineStart: meta.lineStart,
              lineEnd: meta.lineEnd,
            }),
        });
        entries.push({
          id: 'reveal-folder',
          label: s.omniRevealFolder,
          run: () => revealFileInFolder(absBase, meta.rawUri),
        });
        entries.push({
          id: 'open-external',
          label: s.omniOpenExternal,
          run: () => openFile(absBase, { mode: 'external', rawUri: meta.rawUri }),
        });
        entries.push({ separator: true });
        entries.push({
          id: 'insert-mention',
          label: s.omniInsertMention,
          hint: '@',
          run: () => insertFileMentionIntoComposer(absBase),
        });
        entries.push({ separator: true });
        entries.push({
          id: 'copy-abs-path',
          label: s.omniCopyAbsPath,
          run: async () => {
            let finalAbs = absBase;
            if (!/^[A-Za-z]:[\\/]/.test(absBase) && !absBase.startsWith('/')) {
              const res = await callOmniRpc('resolvePath', { rawPath: absBase, workspaceHint: wsRoot });
              if (res?.ok && res.absPath) finalAbs = res.absPath;
            }
            return copyTextToClipboard(finalAbs);
          },
        });
        entries.push({
          id: 'copy-rel-path',
          label: s.omniCopyRelPath,
          run: async () => {
            let finalRel = relWithRange;
            if (!wsRoot) {
              const res = await callOmniRpc('resolvePath', { rawPath: absBase, workspaceHint: '' });
              if (res?.ok && res.relPath) finalRel = res.relPath;
            }
            return copyTextToClipboard(finalRel);
          },
        });
        if (selectedText) {
          entries.push({ id: 'copy-text', label: s.omniCopyText, run: () => copyTextToClipboard(selectedText) });
        }
        return { header: getBaseName(absBase), entries };
      }

      if (meta.kind === 'mermaid') {
        entries.push({
          id: 'zoom-diagram',
          label: s.omniZoomDiagram,
          run: () =>
            openFile('', {
              kind: 'mermaid',
              mode: 'workbench',
              rawContent: meta.rawContent,
              title: meta.text || s.omniZoomDiagram,
            }),
        });
        entries.push({
          id: 'copy-text',
          label: s.omniCopyText,
          run: () => copyTextToClipboard(meta.rawContent),
        });
        return { header: meta.text || s.omniMermaidSvg || 'Mermaid SVG', entries };
      }

      return null;
    }

    // ── Zero-DOM-Mutation CSS Highlight Hit-Testing ──────────────────────────
    function resolveCaretPoint(clientX, clientY) {
      if (!D || !Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
      try {
        if (typeof D.caretRangeFromPoint === 'function') {
          const r = D.caretRangeFromPoint(clientX, clientY);
          if (r && r.startContainer) return { node: r.startContainer, offset: r.startOffset };
        }
        if (typeof D.caretPositionFromPoint === 'function') {
          const p = D.caretPositionFromPoint(clientX, clientY);
          if (p && p.offsetNode) return { node: p.offsetNode, offset: p.offset };
        }
      } catch (_) {}
      return null;
    }

    function pointHitsRangeRects(range, clientX, clientY) {
      if (!range || typeof range.getClientRects !== 'function') return true;
      const rects = range.getClientRects();
      if (!rects || rects.length === 0) return true;
      for (let i = 0; i < rects.length; i++) {
        const rc = rects[i];
        if (
          clientX >= rc.left - 2 &&
          clientX <= rc.right + 2 &&
          clientY >= rc.top - 2 &&
          clientY <= rc.bottom + 2
        ) {
          return true;
        }
      }
      return false;
    }

    function hitTestHighlightedToken(clientX, clientY) {
      const pt = resolveCaretPoint(clientX, clientY);
      if (!pt || pt.node.nodeType !== 3) return null;
      const rec = textNodeTokenMap.get(pt.node);
      if (!rec || !rec.spans.length) return null;
      for (let i = 0; i < rec.spans.length; i++) {
        const sp = rec.spans[i];
        if (pt.offset >= sp.start && pt.offset <= sp.end && pointHitsRangeRects(sp.range, clientX, clientY)) {
          return {
            kind: sp.type,
            url: sp.url || '',
            filePath: sp.filePath || '',
            lineStart: sp.lineStart,
            lineEnd: sp.lineEnd,
            text: sp.display,
            element: pt.node.parentElement,
          };
        }
      }
      return null;
    }

    function setHoverTokenCursor(active) {
      if (hoverTokenActive === active) return;
      hoverTokenActive = active;
      const rootEl = D?.documentElement;
      if (!rootEl) return;
      if (active) rootEl.setAttribute('data-ag-omni-hover-token', '1');
      else rootEl.removeAttribute('data-ag-omni-hover-token');
    }

    // ── Event Handlers ───────────────────────────────────────────────────────
    function evalPointerHoverAt(rawTarget, x, y) {
      if (!enabled || !urlHighlight || (!urlHighlight.size && !pathHighlight?.size)) {
        if (hoverTokenActive) setHoverTokenCursor(false);
        return;
      }
      const el = rawTarget && rawTarget.nodeType === 1 ? rawTarget : rawTarget?.parentElement;
      if (!el || !el.isConnected || !highlightedParentCount.get(el) || !findClosest(el, SCAN_CONTAINER_SELECTOR) || isExcludedElement(el)) {
        if (hoverTokenActive) setHoverTokenCursor(false);
        return;
      }
      const hit = hitTestHighlightedToken(x, y);
      setHoverTokenCursor(Boolean(hit));
    }

    function flushPointerMove() {
      pointerMoveRaf = null;
      const target = pendingPointerTarget;
      pendingPointerTarget = null;
      evalPointerHoverAt(target, pendingPointerX, pendingPointerY);
    }

    function onDocPointerMove(ev) {
      if (!enabled || !urlHighlight || (!urlHighlight.size && !pathHighlight?.size)) {
        if (hoverTokenActive) setHoverTokenCursor(false);
        return;
      }
      const rawTarget = ev?.target || null;
      const targetEl = rawTarget && rawTarget.nodeType === 1 ? rawTarget : rawTarget?.parentElement;
      if (!targetEl || !targetEl.isConnected || !highlightedParentCount.get(targetEl)) {
        if (pointerMoveRaf !== null) cancelPendingPointerRaf();
        if (hoverTokenActive) setHoverTokenCursor(false);
        return;
      }
      if (typeof W?.requestAnimationFrame === 'function') {
        pendingPointerTarget = targetEl;
        pendingPointerX = ev.clientX;
        pendingPointerY = ev.clientY;
        if (pointerMoveRaf === null) {
          pointerMoveRaf = W.requestAnimationFrame(flushPointerMove);
        }
        return;
      }
      evalPointerHoverAt(targetEl, ev.clientX, ev.clientY);
    }

    function onDocClickCapture(ev) {
      if (!enabled) return;
      if (activeMenuEl && !findClosest(ev.target, '.ag-omni-menu')) {
        closeContextMenu();
      }
      if (ev.button !== 0 || ev.defaultPrevented || ev.altKey || ev.shiftKey) return;

      const el = ev.target && ev.target.nodeType === 1 ? ev.target : ev.target?.parentElement;
      if (!el) return;
      if (findClosest(el, '[data-testid="agent-input-box"], [contenteditable="true"], .ag-omni-menu, [data-omni-ignore]')) {
        return;
      }

      // 1. Check fallback `.ag-omni-autolink` span
      const autoSpan = findClosest(el, '.ag-omni-autolink');
      if (autoSpan) {
        const autoUrl = autoSpan.getAttribute('data-omni-url');
        const autoPath = autoSpan.getAttribute('data-omni-path');
        if (autoUrl) {
          ev.preventDefault();
          ev.stopPropagation();
          void openUrl(autoUrl, resolveEffectiveLinkMode(ev));
          return;
        }
        if (autoPath) {
          ev.preventDefault();
          ev.stopPropagation();
          const ls = parseInt(autoSpan.getAttribute('data-omni-line-start') || '', 10);
          const le = parseInt(autoSpan.getAttribute('data-omni-line-end') || '', 10);
          void openFile(autoPath, {
            mode: ev.ctrlKey || ev.metaKey ? 'external' : 'workbench',
            lineStart: Number.isFinite(ls) ? ls : null,
            lineEnd: Number.isFinite(le) ? le : null,
          });
          return;
        }
      }

      // 2. Yield host-native http(s) anchors to Antigravity's built-in link router; handle `.ag-prism-thought-overlay` anchors
      const anchor = findClosest(el, 'a[href]');
      if (anchor) {
        if (anchor.hasAttribute('download') || anchor.getAttribute('data-testid') === 'entity-pill') return;
        const href = String(anchor.getAttribute('href') || '').trim();
        if (!isHttpUrl(href) || !findClosest(anchor, '.ag-prism-thought-overlay')) return;
        ev.preventDefault();
        ev.stopPropagation();
        void openUrl(href, resolveEffectiveLinkMode(ev));
        return;
      }

      // 3. Check zero-DOM-mutation CSS Highlight token at click coordinates
      if (urlHighlight || pathHighlight) {
        let sel = '';
        try { sel = String(W?.getSelection?.()?.toString?.() || '').trim(); } catch (_) {}
        if (!sel) {
          const hit = hitTestHighlightedToken(ev.clientX, ev.clientY);
          if (hit) {
            ev.preventDefault();
            ev.stopPropagation();
            if (hit.kind === 'url') {
              void openUrl(hit.url, resolveEffectiveLinkMode(ev));
            } else if (hit.kind === 'file') {
              void openFile(hit.filePath, {
                mode: ev.ctrlKey || ev.metaKey ? 'external' : 'workbench',
                lineStart: hit.lineStart,
                lineEnd: hit.lineEnd,
              });
            }
          }
        }
      }
    }

    function onDocContextMenu(ev) {
      if (!enabled) return;
      const el = ev.target && ev.target.nodeType === 1 ? ev.target : ev.target?.parentElement;
      if (!el) return;

      if (findClosest(el, '[data-testid="agent-input-box"] [contenteditable="true"]')) {
        closeContextMenu();
        return;
      }

      const nativeAnchor = findClosest(el, 'a[href]');
      if (nativeAnchor && !findClosest(nativeAnchor, '.ag-prism-thought-overlay')) {
        const nativeHref = String(nativeAnchor.getAttribute('href') || '').trim();
        if (isHttpUrl(nativeHref)) {
          closeContextMenu();
          return;
        }
      }

      let selectedText = '';
      try { selectedText = String(W?.getSelection?.()?.toString?.() || '').trim(); } catch (_) {}

      const meta = extractTargetMeta(el, getStrings().omniMermaidDiagram) || hitTestHighlightedToken(ev.clientX, ev.clientY);
      if (!meta) {
        closeContextMenu();
        return;
      }

      const built = buildMenuForTarget(meta, selectedText);
      if (!built || !built.entries.length) return;

      ev.preventDefault();
      ev.stopPropagation();
      openContextMenuAt(ev.clientX || 0, ev.clientY || 0, built.header, built.entries);
    }

    function onDocKeyDown(ev) {
      if (!enabled || !activeMenuEl) return;
      if (ev.key === 'Escape') {
        ev.preventDefault();
        ev.stopPropagation();
        closeContextMenu();
      } else if (ev.key === 'ArrowDown') {
        ev.preventDefault();
        highlightMenuIndex(activeMenuIndex + 1);
      } else if (ev.key === 'ArrowUp') {
        ev.preventDefault();
        highlightMenuIndex(activeMenuIndex - 1);
      } else if (ev.key === 'Enter' && activeMenuIndex >= 0 && activeMenuItems[activeMenuIndex]) {
        ev.preventDefault();
        activeMenuItems[activeMenuIndex].click();
      }
    }

    function cancelPendingPointerRaf() {
      if (pointerMoveRaf !== null) {
        try { W?.cancelAnimationFrame?.(pointerMoveRaf); } catch (_) {}
        pointerMoveRaf = null;
      }
      pendingPointerTarget = null;
    }

    function onWindowBlurOrScroll(ev) {
      if (activeMenuEl) {
        if (ev?.type === 'scroll' && findClosest(ev.target, '.ag-omni-menu')) return;
        closeContextMenu();
      }
      cancelPendingPointerRaf();
      if (hoverTokenActive) setHoverTokenCursor(false);
    }

    // SEC-7: Strict origin + source window verification on incoming postMessage for inline Aux switchers
    function onWindowMessage(ev) {
      if (!enabled || !ev || !ev.data || typeof ev.data !== 'object') return;
      if (!serverMeta?.baseUrl || ev.origin !== serverMeta.baseUrl) return;
      if (ev.data.type !== 'ag-prism-workbench-ready') return;

      for (const rec of mountedAuxSwitches) {
        if (rec.iframe && rec.iframe.isConnected && ev.source === rec.iframe.contentWindow) {
          rec.iframe.setAttribute('data-wb-ready', '1');
          pushWorkbenchSyncToIframe(rec.iframe, { filePath: rec.filePath });
          return;
        }
      }
    }

    // ── Safe Incremental Scanner (`CSS.highlights` Primary + `<span>` Fallback) ─
    function isExcludedElement(el) {
      if (!el || el.nodeType !== 1) return true;
      if (SKIP_WALK_TAGS.has(el.tagName)) return true;
      let staticExcluded = excludedElCache.get(el);
      if (staticExcluded === undefined) {
        staticExcluded = Boolean(findClosest(el, STATIC_EXCLUDED_SELECTOR));
        excludedElCache.set(el, staticExcluded);
      }
      if (staticExcluded) return true;
      return Boolean(findClosest(el, STREAMING_EXCLUDED_SELECTOR));
    }

    function isExcludedFromLinkify(node) {
      return isExcludedElement(node?.parentElement);
    }

    function ensureHighlightRegistries() {
      if (!supportsHighlightApi()) return false;
      if (!urlHighlight) {
        urlHighlight = new W.Highlight();
        W.CSS.highlights.set(HL_URL_NAME, urlHighlight);
      }
      if (!pathHighlight) {
        pathHighlight = new W.Highlight();
        W.CSS.highlights.set(HL_PATH_NAME, pathHighlight);
      }
      return true;
    }

    function collectHighlightAncestors(parentEl) {
      const list = [];
      let cur = parentEl;
      for (let depth = 0; cur && cur.nodeType === 1 && depth < 4; depth++) {
        list.push(cur);
        if (typeof cur.matches === 'function' && cur.matches(SCAN_CONTAINER_SELECTOR)) break;
        cur = cur.parentElement;
      }
      return list;
    }

    function adjustHighlightedAncestors(ancestors, delta) {
      if (!ancestors || !ancestors.length) return;
      for (let i = 0; i < ancestors.length; i++) {
        const el = ancestors[i];
        const next = (highlightedParentCount.get(el) || 0) + delta;
        if (next > 0) highlightedParentCount.set(el, next);
        else highlightedParentCount.delete(el);
      }
    }

    function clearHighlightEntryForNode(textNode) {
      const prev = textNodeTokenMap.get(textNode);
      if (prev && prev.spans) {
        for (const sp of prev.spans) {
          if (sp.range) {
            urlHighlight?.delete?.(sp.range);
            pathHighlight?.delete?.(sp.range);
          }
        }
      }
      if (prev && prev.ancestors) {
        adjustHighlightedAncestors(prev.ancestors, -1);
      }
      textNodeTokenMap.delete(textNode);
      trackedHighlightNodes.delete(textNode);
    }

    let lastPruneAt = 0;
    function pruneDisconnectedHighlights(force = false) {
      const now = Date.now();
      if (!force && now - lastPruneAt < 3000 && trackedHighlightNodes.size < 256) return;
      lastPruneAt = now;
      if (trackedHighlightNodes.size) {
        for (const tn of Array.from(trackedHighlightNodes)) {
          const prev = textNodeTokenMap.get(tn);
          const curParent = tn.parentElement || null;
          if (!tn.isConnected || !curParent) {
            clearHighlightEntryForNode(tn);
            continue;
          }
          if (prev && prev.parentEl !== curParent) {
            excludedElCache.delete(curParent);
            if (isExcludedElement(curParent)) {
              clearHighlightEntryForNode(tn);
              continue;
            }
            adjustHighlightedAncestors(prev.ancestors, -1);
            prev.parentEl = curParent;
            prev.ancestors = collectHighlightAncestors(curParent);
            adjustHighlightedAncestors(prev.ancestors, 1);
          } else if (isExcludedElement(curParent)) {
            clearHighlightEntryForNode(tn);
          }
        }
      }
      if (createdAutolinks.size > 0) {
        for (const el of createdAutolinks) {
          if (!el || el.isConnected === false) createdAutolinks.delete(el);
        }
      }
      if (decoratedMermaidBoxes.size > 0) {
        for (const el of decoratedMermaidBoxes) {
          if (!el || el.isConnected === false) decoratedMermaidBoxes.delete(el);
        }
      }
      if (openedNativeTabs.length > 128) {
        openedNativeTabs.splice(0, openedNativeTabs.length - 128);
      }
    }

    function registerHighlightOnTextNode(textNode) {
      const raw = textNode.nodeValue || '';
      const existing = textNodeTokenMap.get(textNode);
      if (!existing && !mayContainBareToken(raw)) return;
      const curParent = textNode.parentElement || null;
      if (existing && existing.parentEl !== curParent && curParent) {
        excludedElCache.delete(curParent);
      }
      if (isExcludedFromLinkify(textNode)) {
        if (existing) clearHighlightEntryForNode(textNode);
        return;
      }
      if (existing && existing.rawValue === raw) {
        if (existing.parentEl !== curParent) {
          adjustHighlightedAncestors(existing.ancestors, -1);
          existing.parentEl = curParent;
          existing.ancestors = collectHighlightAncestors(curParent);
          adjustHighlightedAncestors(existing.ancestors, 1);
        }
        return;
      }

      const tokens = tokenizeBareText(raw);
      if (!tokens) {
        if (existing) clearHighlightEntryForNode(textNode);
        return;
      }

      ensureHighlightRegistries();
      const oldSpans = existing?.spans || [];
      const reusedOld = oldSpans.length ? new Uint8Array(oldSpans.length) : null;
      const spans = [];
      for (const tok of tokens) {
        if (tok.type === 'text') continue;
        let reusedRange = null;
        for (let k = 0; k < oldSpans.length; k++) {
          if (reusedOld[k]) continue;
          const prev = oldSpans[k];
          if (prev.range && prev.type === tok.type && prev.start === tok.start && prev.end === tok.end) {
            reusedOld[k] = 1;
            reusedRange = prev.range;
            break;
          }
        }
        if (reusedRange) {
          spans.push({ ...tok, range: reusedRange });
          continue;
        }
        try {
          const range = D.createRange();
          range.setStart(textNode, tok.start);
          range.setEnd(textNode, tok.end);
          if (tok.type === 'url') urlHighlight.add(range);
          else pathHighlight.add(range);
          spans.push({ ...tok, range });
        } catch (_) {}
      }
      for (let k = 0; k < oldSpans.length; k++) {
        if (!reusedOld[k] && oldSpans[k].range) {
          urlHighlight?.delete?.(oldSpans[k].range);
          pathHighlight?.delete?.(oldSpans[k].range);
        }
      }
      if (spans.length > 0) {
        const ancestors = existing && existing.parentEl === curParent ? existing.ancestors : collectHighlightAncestors(curParent);
        if (!existing || existing.parentEl !== curParent) {
          if (existing?.ancestors) adjustHighlightedAncestors(existing.ancestors, -1);
          adjustHighlightedAncestors(ancestors, 1);
        }
        textNodeTokenMap.set(textNode, { rawValue: raw, spans, parentEl: curParent, ancestors });
        trackedHighlightNodes.add(textNode);
      } else if (existing) {
        clearHighlightEntryForNode(textNode);
      }
    }

    function linkifyTextNodeFallback(textNode) {
      if (!D || !textNode || processedTextNodes.has(textNode)) return;
      processedTextNodes.add(textNode);
      const raw = textNode.nodeValue || '';
      if (!mayContainBareToken(raw) || isExcludedFromLinkify(textNode)) return;

      const tokens = tokenizeBareText(raw);
      if (!tokens) return;
      const parent = textNode.parentNode;
      if (!parent) return;

      const frag = D.createDocumentFragment();
      for (const tok of tokens) {
        if (tok.type === 'text') {
          const tn = D.createTextNode(tok.value);
          processedTextNodes.add(tn);
          frag.appendChild(tn);
        } else {
          const span = markNoTranslate(D.createElement('span'));
          span.className = 'ag-omni-autolink';
          span.setAttribute('role', 'link');
          span.tabIndex = 0;
          span.textContent = tok.display;
          if (tok.type === 'url') {
            span.setAttribute('data-omni-url', tok.url);
          } else {
            span.setAttribute('data-omni-path', tok.filePath);
            if (tok.lineStart) span.setAttribute('data-omni-line-start', String(tok.lineStart));
            if (tok.lineEnd) span.setAttribute('data-omni-line-end', String(tok.lineEnd));
          }
          createdAutolinks.add(span);
          frag.appendChild(span);
        }
      }
      parent.replaceChild(frag, textNode);
    }

    function scanContainerForBareTokens(container) {
      if (!D || !container || container.nodeType !== 1) return;
      if (isExcludedElement(container)) return;

      const useHighlights = supportsHighlightApi();
      const handleNode = useHighlights ? registerHighlightOnTextNode : linkifyTextNodeFallback;

      if (typeof D.createTreeWalker === 'function') {
        const walker = D.createTreeWalker(container, 4 /* SHOW_TEXT */, {
          acceptNode(node) {
            if (!useHighlights && processedTextNodes.has(node)) return 2;
            const raw = node.nodeValue || '';
            if (!mayContainBareToken(raw) && (!useHighlights || !textNodeTokenMap.has(node))) return 2;
            if (isExcludedFromLinkify(node)) return 2;
            return 1;
          },
        });
        const batch = [];
        let cur;
        while ((cur = walker.nextNode()) && batch.length < 400) batch.push(cur);
        for (let i = 0; i < batch.length; i++) handleNode(batch[i]);
      } else {
        const walk = (el, budget) => {
          if (!el || budget.n <= 0) return;
          if (el.nodeType === 3) {
            budget.n--;
            handleNode(el);
            return;
          }
          if (el.nodeType !== 1) return;
          if (isExcludedElement(el)) return;
          for (const k of Array.from(el.childNodes || [])) walk(k, budget);
        };
        walk(container, { n: 400 });
      }
    }

    function decorateMermaidContainers(scopeEl) {
      if (!D || !scopeEl || typeof scopeEl.querySelectorAll !== 'function') return;
      const candidates = scopeEl.querySelectorAll(
        '[data-testid*="mermaid"], .mermaid, svg[id^="mermaid"], svg[aria-roledescription]'
      );
      for (const node of candidates) {
        if (!isMermaidContainer(node)) continue;
        const box = node.tagName === 'SVG' && node.parentElement ? node.parentElement : node;
        if (!box || box.hasAttribute('data-omni-mermaid-box')) continue;

        const prevPos = box.style?.position || '';
        box.setAttribute('data-omni-mermaid-box', '1');
        if (prevPos) box.setAttribute('data-omni-orig-pos', prevPos);
        if (box.style && (!prevPos || prevPos === 'static')) box.style.position = 'relative';

        const btn = markNoTranslate(D.createElement('button'));
        btn.type = 'button';
        btn.className = 'ag-omni-mermaid-zoom-btn';
        btn.setAttribute('data-testid', 'ag-omni-mermaid-zoom');
        btn.setAttribute('data-ag-prism-omni-owned', '1');
        const s = getStrings();
        btn.textContent = `⤢ ${s.omniZoomDiagram}`;
        btn.title = s.omniZoomDiagram;
        btn.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          const svgEl = box.tagName === 'SVG' ? box : box.querySelector?.('svg');
          if (!svgEl) return;
          void openFile('', {
            kind: 'mermaid',
            mode: 'workbench',
            rawContent: svgEl.outerHTML,
            title: getStrings().omniZoomDiagram,
          });
        });

        box.appendChild(btn);
        decoratedMermaidBoxes.add(box);
      }
    }

    function extractAuxFileRef(viewEl) {
      if (!viewEl) return '';
      const directAttr =
        viewEl.getAttribute?.('data-omni-aux-file') ||
        viewEl.getAttribute?.('data-active-file-uri') ||
        viewEl.getAttribute?.('data-file-uri') ||
        viewEl.getAttribute?.('data-uri') ||
        viewEl.getAttribute?.('data-file-path') ||
        '';
      if (directAttr) return directAttr;

      const subNode = viewEl.querySelector?.('[data-active-file-uri], [data-file-uri], [data-uri]');
      if (subNode) {
        const subAttr =
          subNode.getAttribute('data-active-file-uri') ||
          subNode.getAttribute('data-file-uri') ||
          subNode.getAttribute('data-uri') ||
          '';
        if (subAttr) return subAttr;
      }

      const fromSelfFiber = readFiberFileHint(viewEl, 20);
      if (fromSelfFiber) return fromSelfFiber;

      if (viewEl.firstElementChild) {
        const fromChildFiber = readFiberFileHint(viewEl.firstElementChild, 10);
        if (fromChildFiber) return fromChildFiber;
      }
      if (viewEl.parentElement && viewEl.parentElement !== D?.body && viewEl.parentElement !== D?.documentElement) {
        const fromParentFiber = readFiberFileHint(viewEl.parentElement, 20);
        if (fromParentFiber) return fromParentFiber;
      }
      return '';
    }

    function isValidAuxShell(shell) {
      if (!shell || shell === D?.body || shell === D?.documentElement) return false;
      const shellTid = String(shell.getAttribute?.('data-testid') || '');
      if (shellTid.includes('split') || shellTid === 'overview-panel-host' || shellTid === 'conversation-view') {
        return false;
      }
      if (findClosest(shell, '[data-testid="conversation-view"], aside, .agy-home, .ag-omni-menu')) {
        return false;
      }
      return true;
    }

    function resolveAuxMountHost(viewEl) {
      const tid = String(viewEl.getAttribute?.('data-testid') || '');
      const isSelfShell =
        Boolean(viewEl.classList?.contains?.('relative') && viewEl.classList?.contains?.('h-full')) &&
        isValidAuxShell(viewEl);
      if (isSelfShell) return viewEl;

      const isChildLeaf =
        tid === 'binary-file-no-preview' ||
        tid === 'artifact-pdf-no-preview' ||
        viewEl.hasAttribute?.('data-omni-aux-error') ||
        viewEl.hasAttribute?.('data-omni-aux-file') ||
        HOST_AUX_ERROR_RE.test(viewEl.textContent || '');

      if (isChildLeaf && viewEl.parentElement) {
        const shell = findClosest(viewEl.parentElement, '.relative.h-full.w-full');
        if (isValidAuxShell(shell)) return shell;
        const parent = viewEl.parentElement;
        const ptid = String(parent.getAttribute?.('data-testid') || '');
        if (
          parent !== D.body &&
          parent !== D.documentElement &&
          !ptid.includes('split') &&
          ptid !== 'conversation-view' &&
          parent.children?.length === 1
        ) {
          return parent;
        }
      }
      return viewEl;
    }

    function isAutoPreviewFilePath(filePath) {
      const ext = getFileExt(filePath);
      return Boolean(ext && AUTO_PREVIEW_EXTS.has(ext));
    }

    function isNodeAncestorOf(ancestor, node) {
      let cur = node?.parentElement;
      while (cur) {
        if (cur === ancestor) return true;
        cur = cur.parentElement;
      }
      return false;
    }

    function syncAuxBarUi(rec, strings) {
      if (!rec || !rec.bar) return;
      const s = strings || getStrings();
      const isAuto = isAutoPreviewFilePath(rec.filePath);
      if (rec.btnWb) rec.btnWb.textContent = isAuto ? s.omniViewPreview : s.omniViewWorkbench;
      if (rec.btnRaw) rec.btnRaw.textContent = isAuto ? s.omniViewSource : s.omniViewRaw;
      if (isAuto) {
        if (!rec.sandboxBadge && D) {
          const badge = markNoTranslate(D.createElement('span'));
          badge.className = 'ag-omni-sandbox-badge';
          badge.setAttribute('data-testid', 'ag-omni-sandbox-badge');
          badge.setAttribute('data-ag-prism-omni-owned', '1');
          rec.sandboxBadge = badge;
        }
        if (rec.sandboxBadge) {
          rec.sandboxBadge.textContent = s.omniSandboxIsolated;
          rec.sandboxBadge.title = s.omniSandboxIsolated;
          if (rec.sandboxBadge.parentNode !== rec.bar) {
            rec.bar.appendChild(rec.sandboxBadge);
          }
        }
      } else if (rec.sandboxBadge) {
        try { rec.sandboxBadge.remove?.(); } catch (_) {}
        rec.sandboxBadge = null;
      }
    }

    function isAutoPreviewAuxShell(shell) {
      if (!isValidAuxShell(shell)) return false;
      if (!findClosest(shell, '[data-testid="aux-pane-split"]')) return false;
      if (findClosest(shell, '[data-testid="csv-file-viewer"], video')) return false;
      if (shell.querySelector?.('[data-testid="conversation-view"], aside, .agy-home, [data-testid="csv-file-viewer"], video')) {
        return false;
      }
      const rawRef = extractAuxFileRef(shell);
      if (!rawRef) return false;
      const { filePath } = parseFileUriToPath(rawRef);
      return isAutoPreviewFilePath(filePath);
    }

    function unmountSingleAuxSwitch(rec) {
      if (!rec) return;
      for (const item of rec.hiddenKids) {
        if (item.el?.style) item.el.style.display = item.display;
      }
      rec.hiddenKids = [];
      if (rec.hostEl && rec.hostEl.style) {
        rec.hostEl.style.display = rec.origHostDisplay || '';
        rec.hostEl.style.flexDirection = rec.origHostFlexDir || '';
      }
      try { rec.bar?.remove?.(); } catch (_) {}
      try { rec.iframe?.remove?.(); } catch (_) {}
      rec.sandboxBadge = null;
      rec.viewEl?.removeAttribute?.('data-omni-aux-mounted');
      rec.hostEl?.removeAttribute?.('data-omni-aux-mounted');
      mountedAuxSwitches.delete(rec);
    }

    function hasHostUnsupportedState(viewEl, hostEl) {
      const root = hostEl || viewEl;
      if (!root) return false;
      const tid = String(viewEl?.getAttribute?.('data-testid') || '');
      if (
        viewEl?.isConnected &&
        (tid === 'binary-file-no-preview' ||
          tid === 'artifact-pdf-no-preview' ||
          viewEl.hasAttribute?.('data-omni-aux-error') ||
          viewEl.hasAttribute?.('data-omni-aux-file'))
      ) {
        return true;
      }
      if (root.querySelector?.(AUX_FILE_VIEW_SELECTOR)) return true;
      for (const ch of Array.from(root.children || [])) {
        if (ch.hasAttribute?.('data-ag-prism-omni-owned')) continue;
        const txt = String(ch.textContent || '');
        if (txt.length > 0 && txt.length < 4096 && HOST_AUX_ERROR_RE.test(txt)) return true;
      }
      return false;
    }

    function reconcileMountedAuxSwitches() {
      if (!mountedAuxSwitches.size) return;
      for (const rec of Array.from(mountedAuxSwitches)) {
        if (!rec.hostEl || !rec.hostEl.isConnected) {
          unmountSingleAuxSwitch(rec);
          continue;
        }
        const hostUnsupported = hasHostUnsupportedState(rec.viewEl, rec.hostEl);
        if (!hostUnsupported && rec.hostEl.querySelector?.('[data-testid="csv-file-viewer"], video')) {
          unmountSingleAuxSwitch(rec);
          continue;
        }
        const curRaw = extractAuxFileRef(rec.hostEl) || extractAuxFileRef(rec.viewEl);
        if (!curRaw) continue;
        const curPath = parseFileUriToPath(curRaw).filePath;
        if (curPath && curPath !== rec.filePath) {
          const nextExt = getFileExt(curPath);
          const keepUnsupported = Boolean(nextExt && AUX_SWITCHABLE_EXTS.has(nextExt) && hostUnsupported);
          const keepAutoPreview = Boolean(nextExt && AUTO_PREVIEW_EXTS.has(nextExt) && isAutoPreviewAuxShell(rec.hostEl));
          if (keepUnsupported || keepAutoPreview) {
            rec.filePath = curPath;
            syncAuxBarUi(rec, getStrings());
            if (rec.activeMode === 'workbench' && rec.iframe && serverMeta?.baseUrl && serverMeta?.token) {
              const nextSrc = buildViewerUrl(serverMeta, { filePath: curPath, kind: detectPreviewKind(curPath) });
              if (rec.iframe.src !== nextSrc) {
                rec.iframe.removeAttribute('data-wb-ready');
                rec.iframe.src = nextSrc;
              }
              pushWorkbenchSyncToIframe(rec.iframe, { filePath: curPath });
            } else if (rec.switchMode && shouldAutoActivateWorkbench(rec.viewEl, rec.hostEl, curPath)) {
              void rec.switchMode(true, { auto: true });
            }
          } else {
            unmountSingleAuxSwitch(rec);
          }
        }
      }
    }

    function shouldAutoActivateWorkbench(viewEl, hostEl, filePath) {
      if (hasHostUnsupportedState(viewEl, hostEl)) return true;
      const resolved =
        filePath || parseFileUriToPath(extractAuxFileRef(hostEl) || extractAuxFileRef(viewEl)).filePath;
      return isAutoPreviewFilePath(resolved);
    }

    function collectAuxCandidateViews(scopeEl) {
      const seen = new Set();
      const candidates = [];
      const pushUnique = (el) => {
        if (el && el.nodeType === 1 && !seen.has(el)) {
          seen.add(el);
          candidates.push(el);
        }
      };

      if (typeof scopeEl.matches === 'function' && scopeEl.matches(AUX_FILE_VIEW_SELECTOR)) {
        pushUnique(scopeEl);
      }
      for (const el of scopeEl.querySelectorAll(AUX_FILE_VIEW_SELECTOR)) {
        pushUnique(el);
      }

      // Detect host File Pane `UHc` (>20MB / >200MB / read-error) and normal `.html/.htm/.svg` views in aux-pane-split
      const shellPool = new Set();
      if (scopeEl !== D.body && scopeEl !== D.documentElement) {
        const ancShell = findClosest(scopeEl, '.relative.h-full.w-full');
        if (isValidAuxShell(ancShell)) shellPool.add(ancShell);
      }
      for (const sh of scopeEl.querySelectorAll('.relative.h-full.w-full')) {
        if (isValidAuxShell(sh)) shellPool.add(sh);
      }

      const autoShells = [];
      for (const sh of shellPool) {
        if (sh.querySelector?.(AUX_FILE_VIEW_SELECTOR)) continue;
        const txt = String(sh.textContent || '');
        const hasHostError = txt.length > 0 && txt.length < 4096 && HOST_AUX_ERROR_RE.test(txt);
        if (hasHostError) {
          pushUnique(sh);
        } else if (isAutoPreviewAuxShell(sh)) {
          autoShells.push(sh);
        }
      }
      for (const sh of autoShells) {
        const hasMoreSpecificDescendant = autoShells.some((other) => other !== sh && isNodeAncestorOf(sh, other));
        if (!hasMoreSpecificDescendant) pushUnique(sh);
      }
      return candidates;
    }

    function decorateAuxUnsupportedViews(scopeEl) {
      if (!D || !scopeEl || typeof scopeEl.querySelectorAll !== 'function') return;
      reconcileMountedAuxSwitches();
      const candidates = collectAuxCandidateViews(scopeEl);

      for (const viewEl of candidates) {
        if (viewEl.hasAttribute('data-omni-aux-mounted') || findClosest(viewEl, '[data-omni-aux-mounted]')) {
          continue;
        }
        const rawAttr = extractAuxFileRef(viewEl);
        if (!rawAttr) continue;
        const { filePath } = parseFileUriToPath(rawAttr);
        const ext = getFileExt(filePath);
        if (!ext || !AUX_SWITCHABLE_EXTS.has(ext)) continue;

        const hostEl = resolveAuxMountHost(viewEl);
        if (
          hostEl.hasAttribute('data-omni-aux-mounted') ||
          hostEl.querySelector?.('[data-testid="ag-omni-aux-switcher"]')
        ) {
          continue;
        }

        viewEl.setAttribute('data-omni-aux-mounted', '1');
        hostEl.setAttribute('data-omni-aux-mounted', '1');

        const origHostDisplay = hostEl.style?.display || '';
        const origHostFlexDir = hostEl.style?.flexDirection || '';
        if (hostEl !== viewEl && hostEl.style) {
          hostEl.style.display = 'flex';
          hostEl.style.flexDirection = 'column';
        }

        const s = getStrings();
        const bar = markNoTranslate(D.createElement('div'));
        bar.className = 'ag-omni-aux-bar';
        bar.setAttribute('data-testid', 'ag-omni-aux-switcher');
        bar.setAttribute('data-ag-prism-omni-owned', '1');

        const btnWb = D.createElement('button');
        btnWb.type = 'button';
        btnWb.className = 'ag-omni-btn';

        const btnRaw = D.createElement('button');
        btnRaw.type = 'button';
        btnRaw.className = 'ag-omni-btn';
        btnRaw.setAttribute('data-active', '1');

        bar.appendChild(btnWb);
        bar.appendChild(btnRaw);

        const rec = {
          viewEl, hostEl, origHostDisplay, origHostFlexDir,
          bar, btnWb, btnRaw, sandboxBadge: null, iframe: null, filePath, hiddenKids: [], activeMode: 'raw',
        };
        syncAuxBarUi(rec, s);

        const switchMode = async (toWorkbench, opts = {}) => {
          if (toWorkbench) {
            const meta = await ensureServerMeta();
            if (!meta) {
              if (!opts.auto) void openFile(rec.filePath, { mode: 'workbench' });
              return;
            }
            btnWb.setAttribute('data-active', '1');
            btnRaw.removeAttribute('data-active');
            syncAuxBarUi(rec, getStrings());
            if (hostEl.style) {
              hostEl.style.display = 'flex';
              hostEl.style.flexDirection = 'column';
            }
            if (rec.activeMode !== 'workbench') {
              for (const ch of Array.from(hostEl.children || [])) {
                if (ch === bar || ch === rec.iframe) continue;
                if (ch.style) {
                  rec.hiddenKids.push({ el: ch, display: ch.style.display || '' });
                  ch.style.display = 'none';
                }
              }
            }
            if (!rec.iframe) {
              const ifr = markNoTranslate(D.createElement('iframe'));
              ifr.className = 'ag-omni-aux-overlay';
              ifr.setAttribute('data-testid', 'ag-omni-aux-iframe');
              ifr.setAttribute('data-ag-prism-omni-owned', '1');
              ifr.setAttribute('referrerpolicy', 'no-referrer');
              ifr.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');
              if (ifr.style) ifr.style.backgroundColor = 'var(--ag-cs-tonal-0,var(--background,#0B0B0E))';
              ifr.addEventListener('load', () => {
                pushWorkbenchSyncToIframe(ifr, { filePath: rec.filePath });
                if (!ifr.hasAttribute('data-wb-ready')) ifr.setAttribute('data-wb-ready', '1');
              });
              rec.iframe = ifr;
              hostEl.appendChild(ifr);
            }
            rec.activeMode = 'workbench';
            const nextSrc = buildViewerUrl(meta, { filePath: rec.filePath, kind: detectPreviewKind(rec.filePath) });
            rec.iframe.hidden = false;
            if (rec.iframe.src !== nextSrc) {
              rec.iframe.removeAttribute('data-wb-ready');
              rec.iframe.src = nextSrc;
            }
            pushWorkbenchSyncToIframe(rec.iframe, { filePath: rec.filePath });
          } else {
            btnRaw.setAttribute('data-active', '1');
            btnWb.removeAttribute('data-active');
            rec.activeMode = 'raw';
            if (rec.iframe) rec.iframe.hidden = true;
            for (const item of rec.hiddenKids) {
              if (item.el?.style) item.el.style.display = item.display;
            }
            rec.hiddenKids = [];
          }
        };

        rec.switchMode = switchMode;
        btnWb.addEventListener('click', () => void switchMode(true));
        btnRaw.addEventListener('click', () => void switchMode(false));

        if (hostEl.firstChild) hostEl.insertBefore(bar, hostEl.firstChild);
        else hostEl.appendChild(bar);
        mountedAuxSwitches.add(rec);

        if (shouldAutoActivateWorkbench(viewEl, hostEl, filePath)) {
          void switchMode(true, { auto: true });
        }
      }
    }

    function runScanNow(targetRoot) {
      if (!enabled || !D) return;
      const root = targetRoot || D.body || D.documentElement;
      if (!root || root.nodeType !== 1) return;

      pruneDisconnectedHighlights();
      if (typeof root.matches === 'function' && root.matches(SCAN_CONTAINER_SELECTOR)) {
        scanContainerForBareTokens(root);
      } else if (typeof root.querySelectorAll === 'function') {
        for (const c of root.querySelectorAll(SCAN_CONTAINER_SELECTOR)) {
          scanContainerForBareTokens(c);
        }
      }
      decorateMermaidContainers(root);
      decorateAuxUnsupportedViews(root);
    }

    function isIgnoredMutationTarget(node) {
      let cur = node && node.nodeType === 1 ? node : node?.parentElement;
      let sawExplicitScan = false;
      for (let d = 0; cur && d < 24; d++, cur = cur.parentElement) {
        const scanAttr = cur.getAttribute?.('data-omni-scan');
        if (scanAttr !== null && scanAttr !== undefined && scanAttr !== 'false' && scanAttr !== '0') {
          sawExplicitScan = true;
        }
        const id = cur.id;
        if (
          id === 'ag-prism-pulse-bar' ||
          id === 'ag-pulse-status-bar' ||
          id === 'ag-cs-settings-sec' ||
          id === 'agy-theme-switcher' ||
          id === 'agy-theme-menu' ||
          id === 'antigravity-quota-widget' ||
          id === 'antigravity-translation-audit'
        ) {
          return true;
        }
        if (cur.hasAttribute?.('data-agy-hans-ui')) {
          return true;
        }
        if (!sawExplicitScan && cur.getAttribute?.('role') === 'dialog') {
          return true;
        }
        if (cur.hasAttribute?.('data-hover-card-popup') || cur.tagName === 'ASIDE') return true;
        if (d === 0) {
          const f = cur.firstElementChild;
          if (f?.hasAttribute?.('data-hover-card-popup') || f?.firstElementChild?.hasAttribute?.('data-hover-card-popup')) return true;
          if (cur.hasAttribute?.('data-base-ui-portal') && cur.querySelector?.('[data-hover-card-popup]')) return true;
        }
        const tid = cur.getAttribute?.('data-testid');
        if (tid === 'agent-input-box' || tid === 'conversation-row-sidebar' || tid === 'conversation-list-sidebar' || tid === 'project-header') return true;
        if (cur.parentElement?.getAttribute?.('data-testid') === 'sidebar-split' && cur === cur.parentElement.firstElementChild) return true;
        const cls = typeof cur.className === 'string' ? cur.className : '';
        if (
          cls &&
          (cls.indexOf('ag-prism-thought-') !== -1 ||
            cls.indexOf('ag-omni-') !== -1 ||
            cls.indexOf('ces-root') !== -1 ||
            cls.indexOf('ag-cs-stream-chunk') !== -1 ||
            cls.indexOf('ag-cs-code-scan') !== -1 ||
            cls.indexOf('ag-cs-crab') !== -1 ||
            cls.indexOf('ag-cs-conv-aura-host') !== -1 ||
            cls.indexOf('ag-cs-ripple-host') !== -1 ||
            cls.indexOf('ag-anim-icon') !== -1 ||
            cls.indexOf('ag-cs-thinking-spark') !== -1 ||
            cls.indexOf('ag-cs-prism-rim-cv') !== -1 ||
            cls.indexOf('ag-cs-smooth-caret') !== -1 ||
            cls.indexOf('ag-v2-mascot-') !== -1 ||
            cls.indexOf('ag-v2-chroma-fx') !== -1)
        ) {
          return true;
        }
      }
      return false;
    }

    function scheduleTextNodeHighlight(textNode) {
      if (!enabled || !textNode || textNode.nodeType !== 3) return;
      const raw = textNode.nodeValue || '';
      const tracked = textNodeTokenMap.has(textNode);
      if (!mayContainBareToken(raw) && !tracked) return;
      if (!tracked && (!textNode.parentElement || !findClosest(textNode.parentElement, SCAN_CONTAINER_SELECTOR))) {
        return;
      }
      pendingTextNodes.add(textNode);
      if (textScanTimer) return;
      const delay = D?.documentElement?.hasAttribute?.('data-ag-cs-stream-active') ? 480 : 120;
      textScanTimer = setTimeout(() => {
        textScanTimer = null;
        if (!enabled) {
          pendingTextNodes.clear();
          return;
        }
        const batch = Array.from(pendingTextNodes);
        pendingTextNodes.clear();
        for (let i = 0; i < batch.length; i++) {
          const tn = batch[i];
          if (!tn.isConnected) clearHighlightEntryForNode(tn);
          else registerHighlightOnTextNode(tn);
        }
      }, delay);
    }

    function hasPendingAncestor(el, set) {
      let cur = el?.parentElement;
      while (cur) {
        if (set.has(cur)) return true;
        cur = cur.parentElement;
      }
      return false;
    }

    function scheduleIncrementalScan(node) {
      if (!enabled || !D) return;
      const el = node && node.nodeType === 1 ? node : node?.parentElement;
      if (el) pendingScanRoots.add(el);
      if (scanTimer) return;
      const delay = D.documentElement?.hasAttribute?.('data-ag-cs-stream-active') ? 280 : 60;
      scanTimer = setTimeout(() => {
        scanTimer = null;
        if (!enabled) {
          pendingScanRoots.clear();
          return;
        }
        pruneDisconnectedHighlights();
        const rootSet = new Set(pendingScanRoots);
        pendingScanRoots.clear();
        let scannedAuxSplit = false;
        for (const r of rootSet) {
          if (!r || !r.isConnected) continue;
          if (rootSet.size > 1 && hasPendingAncestor(r, rootSet)) continue;
          if (findClosest(r, SCAN_CONTAINER_SELECTOR)) {
            scanContainerForBareTokens(r);
          } else if (typeof r.querySelectorAll === 'function') {
            for (const c of r.querySelectorAll(SCAN_CONTAINER_SELECTOR)) {
              scanContainerForBareTokens(c);
            }
          }
          decorateMermaidContainers(r);
          if (!findClosest(r, '[data-testid="conversation-view"]')) {
            const auxRoot = !scannedAuxSplit && (findClosest(r, '[data-testid="aux-pane-split"]') || r.querySelector?.('[data-testid="aux-pane-split"]'));
            if (auxRoot) {
              scannedAuxSplit = true;
              decorateAuxUnsupportedViews(auxRoot);
            } else if (
              (typeof r.matches === 'function' && r.matches(AUX_FILE_VIEW_SELECTOR)) ||
              r.querySelector?.(AUX_FILE_VIEW_SELECTOR)
            ) {
              decorateAuxUnsupportedViews(r);
            }
          }
        }
      }, delay);
    }

    // ── Lifecycle & Zero-Residue Teardown ────────────────────────────────────
    function ensureStyleInjected() {
      if (!D) return;
      let styleEl = D.getElementById?.(STYLE_EL_ID);
      if (!styleEl) {
        styleEl = D.createElement('style');
        styleEl.id = STYLE_EL_ID;
        styleEl.textContent = OMNI_CSS;
        (D.head || D.documentElement)?.appendChild?.(styleEl);
      }
    }

    function unwrapAllModifications() {
      if (textScanTimer) {
        clearTimeout(textScanTimer);
        textScanTimer = null;
      }
      pendingTextNodes.clear();
      // 1. Clear CSS Custom Highlights (zero DOM changes needed)
      for (const tn of Array.from(trackedHighlightNodes)) {
        clearHighlightEntryForNode(tn);
      }
      trackedHighlightNodes.clear();
      if (urlHighlight) {
        try { urlHighlight.clear(); } catch (_) {}
        urlHighlight = null;
      }
      if (pathHighlight) {
        try { pathHighlight.clear(); } catch (_) {}
        pathHighlight = null;
      }
      try {
        W?.CSS?.highlights?.delete?.(HL_URL_NAME);
        W?.CSS?.highlights?.delete?.(HL_PATH_NAME);
      } catch (_) {}
      setHoverTokenCursor(false);

      // 2. Unwrap fallback autolink spans if any were created
      const parentsToNormalize = new Set();
      for (const span of Array.from(createdAutolinks)) {
        const p = span.parentNode;
        if (p && D) {
          const tn = D.createTextNode(span.textContent || '');
          p.replaceChild(tn, span);
          parentsToNormalize.add(p);
        } else {
          try { span.remove?.(); } catch (_) {}
        }
      }
      createdAutolinks.clear();
      for (const p of parentsToNormalize) {
        try { p.normalize?.(); } catch (_) {}
      }

      // 3. Remove Mermaid zoom buttons
      for (const box of Array.from(decoratedMermaidBoxes)) {
        box.querySelectorAll?.('.ag-omni-mermaid-zoom-btn').forEach((b) => b.remove());
        const origPos = box.getAttribute?.('data-omni-orig-pos') || '';
        if (box.style) box.style.position = origPos;
        box.removeAttribute?.('data-omni-orig-pos');
        box.removeAttribute?.('data-omni-mermaid-box');
      }
      decoratedMermaidBoxes.clear();

      // 4. Remove Aux view switchers & restore shell styles
      for (const rec of Array.from(mountedAuxSwitches)) {
        unmountSingleAuxSwitch(rec);
      }
      mountedAuxSwitches.clear();
    }

    function ensureRootAttrObserver() {
      if (!D?.documentElement || !W || typeof W.MutationObserver !== 'function' || rootAttrObserver) return;
      rootAttrObserver = new W.MutationObserver((mutations) => {
        let needSync = false;
        for (const m of mutations) {
          const attr = m.attributeName;
          if (attr === 'data-ag-prism-omni') {
            const v = D.documentElement.getAttribute('data-ag-prism-omni');
            if (v === 'off' && enabled) { sync({ omniModule: 'off' }); return; }
            if (v === 'on' && !enabled) { sync({ omniModule: 'on' }); return; }
          } else if (attr === 'data-ag-prism-link-target') {
            const lt = D.documentElement.getAttribute('data-ag-prism-link-target');
            if (lt === 'builtin' || lt === 'external') linkTarget = lt;
          } else {
            needSync = true;
          }
        }
        if (needSync && enabled) broadcastThemeAndLocaleSync();
      });
      rootAttrObserver.observe(D.documentElement, {
        attributes: true,
        attributeFilter: [
          'data-ag-cs-theme', 'data-ag-cs-palette', 'data-ag-cs-light-preset',
          'data-ag-cs-accent', 'data-ag-cs-corners', 'data-ag-cs-motion',
          'data-ag-cs-lang', 'data-ag-prism-omni', 'data-ag-prism-link-target',
        ],
      });
    }

    function attachRuntime() {
      if (mounted || !D || !W) return;
      mounted = true;
      installRpcResolver();
      ensureStyleInjected();
      ensureRootAttrObserver();

      D.addEventListener('click', onDocClickCapture, true);
      D.addEventListener('contextmenu', onDocContextMenu, true);
      D.addEventListener('keydown', onDocKeyDown, true);
      D.addEventListener('mousemove', onDocPointerMove, { passive: true });
      D.addEventListener('visibilitychange', onWindowBlurOrScroll);
      D.addEventListener('scroll', onWindowBlurOrScroll, true);
      W.addEventListener?.('blur', onWindowBlurOrScroll);
      W.addEventListener?.('resize', onWindowBlurOrScroll);
      W.addEventListener?.('message', onWindowMessage);

      if (typeof W.MutationObserver === 'function') {
        domObserver = new W.MutationObserver((mutations) => {
          for (let i = 0; i < mutations.length; i++) {
            const m = mutations[i];
            if (isIgnoredMutationTarget(m.target)) continue;
            if (m.type === 'childList') {
              const useHl = supportsHighlightApi();
              let queuedTargetAux = false;
              for (let j = 0; j < m.addedNodes.length; j++) {
                const n = m.addedNodes[j];
                if (n.nodeType !== 1 && n.nodeType !== 3) continue;
                if (isIgnoredMutationTarget(n)) continue;
                if (useHl && n.nodeType === 3) {
                  scheduleTextNodeHighlight(n);
                  if (!queuedTargetAux && mountedAuxSwitches.size > 0 && findClosest(m.target, '[data-testid="aux-pane-split"]')) {
                    queuedTargetAux = true;
                    scheduleIncrementalScan(m.target);
                  }
                } else {
                  scheduleIncrementalScan(n);
                }
              }
              if (
                !queuedTargetAux &&
                m.removedNodes.length > 0 &&
                mountedAuxSwitches.size > 0 &&
                findClosest(m.target, '[data-testid="aux-pane-split"]')
              ) {
                scheduleIncrementalScan(m.target);
              }
            } else if (m.type === 'characterData' && m.target) {
              if (supportsHighlightApi() && m.target.nodeType === 3) {
                scheduleTextNodeHighlight(m.target);
                if (mountedAuxSwitches.size > 0 && findClosest(m.target, '[data-testid="aux-pane-split"]')) {
                  scheduleIncrementalScan(m.target);
                }
              } else {
                scheduleIncrementalScan(m.target);
              }
            } else if (m.type === 'attributes') {
              const attrName = m.attributeName;
              if (
                (attrName === 'data-ag-cs-spark-streaming' || attrName === 'data-ag-cs-thought-streaming') &&
                m.target &&
                !m.target.hasAttribute?.(attrName)
              ) {
                scheduleIncrementalScan(m.target);
              } else if (
                (attrName === 'data-active-file-uri' ||
                  attrName === 'data-file-uri' ||
                  attrName === 'data-uri' ||
                  attrName === 'data-file-path') &&
                m.target &&
                findClosest(m.target, '[data-testid="aux-pane-split"]')
              ) {
                scheduleIncrementalScan(m.target);
              }
            }
          }
        });
        const obsRoot = D.body || D.documentElement;
        if (obsRoot) {
          domObserver.observe(obsRoot, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: [
              'data-ag-cs-spark-streaming',
              'data-ag-cs-thought-streaming',
              'data-active-file-uri',
              'data-file-uri',
              'data-uri',
              'data-file-path',
            ],
          });
        }
      }

      runScanNow(D.body || D.documentElement);
    }

    function detachRuntime(removeRootAttrs = false) {
      if (scanTimer) {
        clearTimeout(scanTimer);
        scanTimer = null;
      }
      if (textScanTimer) {
        clearTimeout(textScanTimer);
        textScanTimer = null;
      }
      cancelPendingPointerRaf();
      pendingScanRoots.clear();
      pendingTextNodes.clear();

      if (domObserver) {
        try { domObserver.disconnect(); } catch (_) {}
        domObserver = null;
      }
      if (removeRootAttrs && rootAttrObserver) {
        try { rootAttrObserver.disconnect(); } catch (_) {}
        rootAttrObserver = null;
      }
      closeContextMenu();
      purgeLegacyOmniDock();
      unwrapAllModifications();

      if (D) {
        D.removeEventListener('click', onDocClickCapture, true);
        D.removeEventListener('contextmenu', onDocContextMenu, true);
        D.removeEventListener('keydown', onDocKeyDown, true);
        D.removeEventListener('mousemove', onDocPointerMove, { passive: true });
        D.removeEventListener('visibilitychange', onWindowBlurOrScroll);
        D.removeEventListener('scroll', onWindowBlurOrScroll, true);
        try { D.getElementById?.(STYLE_EL_ID)?.remove?.(); } catch (_) {}
        if (D.documentElement) {
          D.documentElement.removeAttribute?.('data-ag-omni-hover-token');
          if (removeRootAttrs) {
            D.documentElement.removeAttribute?.('data-ag-prism-omni');
            D.documentElement.removeAttribute?.('data-ag-prism-link-target');
          }
        }
      }
      if (W) {
        W.removeEventListener?.('blur', onWindowBlurOrScroll);
        W.removeEventListener?.('resize', onWindowBlurOrScroll);
        W.removeEventListener?.('message', onWindowMessage);
      }
      mounted = false;
    }

    function sync(cfg = null, incomingServerMeta = null) {
      purgeLegacyOmniDock();
      if (incomingServerMeta && typeof incomingServerMeta === 'object' && incomingServerMeta.baseUrl) {
        serverMeta = {
          baseUrl: String(incomingServerMeta.baseUrl).replace(/\/+$/, ''),
          token: String(incomingServerMeta.token || ''),
          port: incomingServerMeta.port || null,
        };
      }

      const rootEl = D?.documentElement;
      const rawOmni =
        cfg && cfg.omniModule !== undefined
          ? cfg.omniModule
          : rootEl?.getAttribute?.('data-ag-prism-omni') || 'on';
      const nextEnabled = rawOmni !== 'off' && rawOmni !== false;

      if (destroyed && !nextEnabled) return getState();
      destroyed = false;

      const rawTarget =
        cfg && cfg.linkTarget !== undefined
          ? cfg.linkTarget
          : rootEl?.getAttribute?.('data-ag-prism-link-target') || linkTarget || 'builtin';
      linkTarget = rawTarget === 'external' ? 'external' : 'builtin';

      enabled = nextEnabled;
      if (!enabled) {
        detachRuntime(true);
        return getState();
      }

      ensureRootAttrObserver();
      if (rootEl?.setAttribute) {
        if (rootEl.getAttribute('data-ag-prism-omni') !== 'on') {
          rootEl.setAttribute('data-ag-prism-omni', 'on');
        }
        if (rootEl.getAttribute('data-ag-prism-link-target') !== linkTarget) {
          rootEl.setAttribute('data-ag-prism-link-target', linkTarget);
        }
      }

      attachRuntime();
      broadcastThemeAndLocaleSync();
      return getState();
    }

    function destroy() {
      destroyed = true;
      enabled = false;
      if (rootAttrObserver) {
        try { rootAttrObserver.disconnect(); } catch (_) {}
        rootAttrObserver = null;
      }
      for (const item of pendingRpc.values()) {
        clearTimeout(item.timer);
        item.resolve({ ok: false, disposed: true });
      }
      pendingRpc.clear();
      logicalTabIdMap.clear();
      detachRuntime(true);
    }

    function getState() {
      return {
        version: VERSION,
        enabled,
        mounted,
        highlightMode: supportsHighlightApi() ? 'css-highlights' : 'span-fallback',
        linkTarget,
        hasServerMeta: Boolean(serverMeta?.baseUrl && serverMeta?.token),
        serverMeta: serverMeta ? { ...serverMeta } : null,
        dockOpen: false,
        lastOpenedTab: lastOpenedTab ? { ...lastOpenedTab } : null,
        openedTabsCount: openedNativeTabs.length,
        menuOpen: Boolean(activeMenuEl && activeMenuEl.isConnected),
      };
    }

    return {
      version: VERSION,
      sync,
      openUrl,
      openFile,
      openInHostNativeBrowserTab,
      destroy,
      getState,
      _getOpenedTabs: () => openedNativeTabs.map((x) => ({ ...x })),
      _scanRoot: runScanNow,
    };
  }

  return {
    VERSION,
    PREVIEW_KIND_BY_EXT,
    AUTO_PREVIEW_EXTS,
    createOmniClient,
    shortStableHash,
    normalizeLangCode,
    splitPathAndLineRange,
    parseFileUriToPath,
    detectPreviewKind,
    computeRelativePath,
    tokenizeBareText,
    extractTargetMeta,
  };
});

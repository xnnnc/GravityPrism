// Obsidian Prism — On-demand Idle Storage & Memory Guard Banner (0 B in Channel 1)
// 仅在检测到对话库/子代理/language_server 内存超限且页面空闲时由 Daemon 按需注入，
// 平时零字节占用、零定时器；纯 DOM 构造杜绝 XSS，支持深浅双主题与 5+1 防翻译属性。

export const STORAGE_GUARD_ROOT_ID = 'ag-prism-storage-guard';
export const STORAGE_GUARD_STYLE_ID = 'ag-prism-storage-guard-css';

function serializeSafeJson(val) {
  return JSON.stringify(val === undefined ? null : val).replace(/[<>/\u2028\u2029]/g, (ch) =>
    `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`
  );
}

const BANNER_CSS = [
  `#${STORAGE_GUARD_ROOT_ID}{position:fixed;right:18px;bottom:76px;z-index:2147483000;max-width:392px;width:calc(100vw - 36px);`,
  'padding:13px 15px;border-radius:12px;font-family:inherit;font-size:12px;line-height:1.45;',
  'background:var(--card,rgba(22,23,28,.96));color:var(--foreground,#f3f4f6);',
  'border:1px solid rgba(245,158,11,.42);box-shadow:0 12px 34px rgba(0,0,0,.38);backdrop-filter:blur(10px);',
  'display:flex;flex-direction:column;gap:9px;box-sizing:border-box}',
  `#${STORAGE_GUARD_ROOT_ID} .ag-sg-head{display:flex;align-items:center;justify-content:space-between;gap:8px}`,
  `#${STORAGE_GUARD_ROOT_ID} .ag-sg-title{font-weight:600;font-size:12.5px;color:#fbbf24;display:flex;align-items:center;gap:6px}`,
  `html[data-ag-cs-theme="light"] #${STORAGE_GUARD_ROOT_ID} .ag-sg-title,html>body:is(.theme-light,.light-theme,.light) #${STORAGE_GUARD_ROOT_ID} .ag-sg-title,html>body:is(.vscode-light,.vscode-high-contrast-light) #${STORAGE_GUARD_ROOT_ID} .ag-sg-title{color:#b45309}`,
  `#${STORAGE_GUARD_ROOT_ID} .ag-sg-close{background:transparent;border:none;color:var(--muted-foreground,#9ca3af);cursor:pointer;font-size:14px;line-height:1;padding:2px 5px;border-radius:6px}`,
  `#${STORAGE_GUARD_ROOT_ID} .ag-sg-close:hover{background:rgba(148,163,184,.16);color:var(--foreground,#fff)}`,
  `#${STORAGE_GUARD_ROOT_ID} .ag-sg-desc{margin:0;color:var(--muted-foreground,#cbd5e1);font-size:11.5px}`,
  `#${STORAGE_GUARD_ROOT_ID} .ag-sg-actions{display:flex;flex-wrap:wrap;gap:6px;align-items:center}`,
  `#${STORAGE_GUARD_ROOT_ID} .ag-sg-btn{border-radius:7px;padding:5px 10px;font-size:11.5px;font-weight:500;cursor:pointer;border:1px solid rgba(148,163,184,.28);background:rgba(148,163,184,.1);color:var(--foreground,#f3f4f6)}`,
  `#${STORAGE_GUARD_ROOT_ID} .ag-sg-btn:hover{background:rgba(148,163,184,.2)}`,
  `#${STORAGE_GUARD_ROOT_ID} .ag-sg-btn:disabled{opacity:.55;cursor:default}`,
  `#${STORAGE_GUARD_ROOT_ID} .ag-sg-btn-primary{background:rgba(245,158,11,.18);border-color:rgba(245,158,11,.55);color:#fde68a}`,
  `html[data-ag-cs-theme="light"] #${STORAGE_GUARD_ROOT_ID} .ag-sg-btn-primary,html>body:is(.theme-light,.light-theme,.light) #${STORAGE_GUARD_ROOT_ID} .ag-sg-btn-primary,html>body:is(.vscode-light,.vscode-high-contrast-light) #${STORAGE_GUARD_ROOT_ID} .ag-sg-btn-primary{color:#92400e;background:rgba(245,158,11,.16)}`,
  `#${STORAGE_GUARD_ROOT_ID} .ag-sg-confirm{padding:9px 10px;border-radius:8px;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.32);display:flex;flex-direction:column;gap:7px}`,
  `#${STORAGE_GUARD_ROOT_ID} .ag-sg-confirm[hidden]{display:none!important}`,
  `#${STORAGE_GUARD_ROOT_ID} .ag-sg-status{font-size:11px;color:var(--muted-foreground,#94a3b8);min-height:0}`,
  `#${STORAGE_GUARD_ROOT_ID} .ag-sg-status[data-tone="ok"]{color:#34d399}`,
  `#${STORAGE_GUARD_ROOT_ID} .ag-sg-status[data-tone="err"]{color:#f87171}`,
].join('');

export function buildStorageGuardDismissExpression() {
  return `(() => {
    try {
      document.getElementById(${JSON.stringify(STORAGE_GUARD_ROOT_ID)})?.remove?.();
      document.getElementById(${JSON.stringify(STORAGE_GUARD_STYLE_ID)})?.remove?.();
      return { dismissed: true };
    } catch { return { dismissed: false }; }
  })()`;
}

/**
 * 构建按需注入页面的温和超限提醒浮条表达式（纯 DOM API，0 innerHTML，8 语文案由调用方传入）。
 */
export function buildStorageGuardBannerExpression(payload = {}) {
  const safeData = serializeSafeJson({
    rootId: STORAGE_GUARD_ROOT_ID,
    styleId: STORAGE_GUARD_STYLE_ID,
    css: BANNER_CSS,
    autoArchiveOnExit: Boolean(payload.autoArchiveOnExit),
    copy: payload.copy || {},
  });

  return `((cfg) => {
    try {
      if (typeof document === 'undefined' || !document.body) return { mounted: false, reason: 'no-body' };
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
      const hasVisibleBusy = () => {
        const list = typeof document.querySelectorAll === 'function'
          ? document.querySelectorAll(busySel)
          : (document.querySelector(busySel) ? [document.querySelector(busySel)] : []);
        for (let i = 0; i < list.length; i += 1) {
          const el = list[i];
          if (!el || el.hidden === true) continue;
          try {
            if (typeof el.closest === 'function' && el.closest('[hidden]')) continue;
            if (el.style && (el.style.display === 'none' || el.style.visibility === 'hidden')) continue;
          } catch {}
          return true;
        }
        return false;
      };
      if (hasVisibleBusy()) return { mounted: false, reason: 'busy' };

      const markNoTr = (el) => {
        if (!el || !el.setAttribute) return el;
        el.setAttribute('translate', 'no');
        el.setAttribute('data-no-translate', 'true');
        el.setAttribute('data-ag-localization-skip', 'true');
        el.setAttribute('data-agy-no-translate', 'true');
        el.setAttribute('data-antigravity-zh-skip', '1');
        el.setAttribute('data-ag-no-i18n', '');
        el.setAttribute('data-ag-owned', '1');
        return el;
      };

      let st = document.getElementById(cfg.styleId);
      if (!st) {
        st = document.createElement('style');
        st.id = cfg.styleId;
        st.setAttribute('data-ag-owned', '1');
        (document.head || document.documentElement).appendChild(st);
      }
      if (st.textContent !== cfg.css) st.textContent = cfg.css;

      const prev = document.getElementById(cfg.rootId);
      if (prev) prev.remove();

      const c = cfg.copy || {};
      const root = markNoTr(document.createElement('aside'));
      root.id = cfg.rootId;
      root.setAttribute('role', 'status');
      root.setAttribute('aria-live', 'polite');

      const head = document.createElement('div');
      head.className = 'ag-sg-head';
      const title = document.createElement('span');
      title.className = 'ag-sg-title';
      title.textContent = c.title || 'Antigravity Memory & DB Guard';
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'ag-sg-close';
      closeBtn.textContent = '×';
      closeBtn.setAttribute('aria-label', c.close || 'Close');
      closeBtn.addEventListener('click', () => { root.remove(); });
      head.appendChild(title);
      head.appendChild(closeBtn);

      const desc = document.createElement('p');
      desc.className = 'ag-sg-desc';
      desc.textContent = c.summary || '';

      const status = document.createElement('div');
      status.className = 'ag-sg-status';

      const setStatus = (msg, tone) => {
        status.textContent = String(msg || '');
        if (tone) status.setAttribute('data-tone', tone);
        else status.removeAttribute('data-tone');
      };

      const callRepo = (payloadObj) => {
        try {
          const b = window.__agPrismRepoBridge;
          if (typeof b === 'function') return Promise.resolve(b(payloadObj));
          if (b && typeof b.call === 'function') return Promise.resolve(b.call(payloadObj));
        } catch (err) {
          return Promise.resolve({ ok: false, error: String(err && err.message ? err.message : err) });
        }
        return Promise.resolve({ ok: false, offline: true });
      };

      const actions = document.createElement('div');
      actions.className = 'ag-sg-actions';

      const btnArchiveRestart = document.createElement('button');
      btnArchiveRestart.type = 'button';
      btnArchiveRestart.className = 'ag-sg-btn ag-sg-btn-primary';
      btnArchiveRestart.setAttribute('data-ag-sg-action', 'open-confirm');
      btnArchiveRestart.textContent = c.archiveRestartBtn || 'Archive & Restart';
      actions.appendChild(btnArchiveRestart);

      if (!cfg.autoArchiveOnExit) {
        const btnEnableAuto = document.createElement('button');
        btnEnableAuto.type = 'button';
        btnEnableAuto.className = 'ag-sg-btn';
        btnEnableAuto.setAttribute('data-ag-sg-action', 'enable-auto-exit');
        btnEnableAuto.textContent = c.enableAutoExitBtn || 'Enable Auto-Archive on Exit';
        btnEnableAuto.addEventListener('click', () => {
          btnEnableAuto.disabled = true;
          try {
            if (typeof window.__agPrismSetting === 'function') {
              window.__agPrismSetting(JSON.stringify({ key: 'autoArchiveOnExit', value: true }));
              setStatus(c.autoExitEnabledMsg || 'Enabled auto-archive on exit', 'ok');
              return;
            }
          } catch {}
          void callRepo({ action: 'storage-auto-exit', autoArchiveOnExit: true }).then((r) => {
            if (r && r.ok !== false) setStatus(c.autoExitEnabledMsg || 'Enabled auto-archive on exit', 'ok');
            else {
              btnEnableAuto.disabled = false;
              setStatus((r && r.error) || 'Failed', 'err');
            }
          });
        });
        actions.appendChild(btnEnableAuto);
      }

      const btnSnooze = document.createElement('button');
      btnSnooze.type = 'button';
      btnSnooze.className = 'ag-sg-btn';
      btnSnooze.setAttribute('data-ag-sg-action', 'snooze-24h');
      btnSnooze.textContent = c.snooze24hBtn || 'Snooze 24h';
      btnSnooze.addEventListener('click', () => {
        btnSnooze.disabled = true;
        void callRepo({ action: 'storage-snooze', hours: 24 }).finally(() => {
          root.remove();
        });
      });
      actions.appendChild(btnSnooze);

      const confirmBox = document.createElement('div');
      confirmBox.className = 'ag-sg-confirm';
      confirmBox.hidden = true;
      confirmBox.setAttribute('data-ag-sg-confirm-box', '1');

      const confirmText = document.createElement('p');
      confirmText.className = 'ag-sg-desc';
      confirmText.textContent = c.confirmDesc || 'Will preserve token stats, close Antigravity gracefully, move finished subagents (>2h) without deleting any files, keep all main chats, and relaunch.';

      const confirmBtns = document.createElement('div');
      confirmBtns.className = 'ag-sg-actions';

      const btnCancel = document.createElement('button');
      btnCancel.type = 'button';
      btnCancel.className = 'ag-sg-btn';
      btnCancel.setAttribute('data-ag-sg-action', 'cancel-confirm');
      btnCancel.textContent = c.cancelBtn || 'Cancel';

      const btnConfirm = document.createElement('button');
      btnConfirm.type = 'button';
      btnConfirm.className = 'ag-sg-btn ag-sg-btn-primary';
      btnConfirm.setAttribute('data-ag-sg-action', 'confirm-archive-restart');
      btnConfirm.textContent = c.confirmBtn || 'Confirm Archive & Restart';

      btnArchiveRestart.addEventListener('click', () => {
        confirmBox.hidden = !confirmBox.hidden;
      });
      btnCancel.addEventListener('click', () => {
        confirmBox.hidden = true;
      });
      btnConfirm.addEventListener('click', () => {
        if (hasVisibleBusy()) {
          setStatus(c.busyBlockedMsg || 'AI or Swarm is currently running; please retry when idle.', 'err');
          return;
        }
        btnConfirm.disabled = true;
        btnArchiveRestart.disabled = true;
        setStatus(c.runningMsg || 'Saving token ledger & launching safe offline archiver...', '');
        void callRepo({ action: 'archive-and-restart', confirm: true }).then((r) => {
          if (r && r.ok) {
            btnCancel.disabled = true;
            btnSnooze.disabled = true;
            setStatus(c.scheduledMsg || 'Scheduled safe offline archive & restart.', 'ok');
          } else {
            btnConfirm.disabled = false;
            btnArchiveRestart.disabled = false;
            const msg = r && r.code === 'HOST_BUSY'
              ? (c.busyBlockedMsg || r.error)
              : (r && r.error) || 'Failed';
            setStatus(msg, 'err');
          }
        });
      });

      confirmBtns.appendChild(btnCancel);
      confirmBtns.appendChild(btnConfirm);
      confirmBox.appendChild(confirmText);
      confirmBox.appendChild(confirmBtns);

      root.appendChild(head);
      root.appendChild(desc);
      root.appendChild(actions);
      root.appendChild(confirmBox);
      root.appendChild(status);
      document.body.appendChild(root);
      return { mounted: true };
    } catch (err) {
      return { mounted: false, error: String(err && err.message ? err.message : err) };
    }
  })(${safeData})`;
}

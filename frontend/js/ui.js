/* SmartExams shared UI primitives: formatting, toasts, dialogs, skeletons, session helpers. */
(function initUiKit(global) {
  const SE = global.SE || (global.SE = {});
  const doc = global.document;
  const MAX_TOASTS = 3;

  const escapeHtml = (value) => String(value === null || value === undefined ? '' : value)
    .replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[character]);

  const round = (value, digits) => {
    const factor = 10 ** (digits === undefined ? 0 : digits);
    return Math.round((Number(value) || 0) * factor) / factor;
  };

  const formatDate = (value, options) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat(undefined, options || { dateStyle: 'medium' }).format(date);
  };

  const formatDateTime = (value) => formatDate(value, { dateStyle: 'medium', timeStyle: 'short' });

  const formatDuration = (seconds) => {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    if (hours) return `${hours}h ${minutes}m`;
    if (minutes) return `${minutes}m ${secs}s`;
    return `${secs}s`;
  };

  const formatClock = (seconds) => {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  };

  const toastContainer = () => {
    let container = doc.querySelector('[data-toast-container]');
    if (!container) {
      container = doc.createElement('div');
      container.className = 'toast-container';
      container.setAttribute('data-toast-container', '');
      container.setAttribute('role', 'status');
      container.setAttribute('aria-live', 'polite');
      doc.body.appendChild(container);
    }
    return container;
  };

  const toast = (message, type, options) => {
    if (!message) return null;
    const opts = options || {};
    const container = toastContainer();
    while (container.children.length >= MAX_TOASTS) container.removeChild(container.firstElementChild);

    const icon = type === 'success' ? '✓' : (type === 'error' || type === 'warning') ? '!' : 'i';
    const element = doc.createElement('div');
    element.className = `toast toast-${type || 'info'}`;
    element.setAttribute('role', 'alert');
    element.innerHTML = `<span class="toast-icon" aria-hidden="true">${icon}</span><span class="toast-text">${escapeHtml(message)}</span>`;

    const close = doc.createElement('button');
    close.type = 'button';
    close.className = 'toast-close';
    close.setAttribute('aria-label', 'Dismiss notification');
    close.textContent = '×';
    close.addEventListener('click', () => element.remove());
    element.appendChild(close);

    container.appendChild(element);
    const duration = opts.duration === undefined ? (type === 'error' ? 6000 : 3500) : opts.duration;
    if (duration > 0) setTimeout(() => element.remove(), duration);
    return element;
  };

const buildDialog = (className) => {
    const dialog = doc.createElement('dialog');
    dialog.className = `se-dialog ${className}`.trim();
    return dialog;
  };

  const dismiss = (dialog, resolve, value) => {
    resolve(value);
    if (dialog.open) dialog.close();
    dialog.remove();
  };

  const confirmDialog = (options) => {
    const opts = options || {};
    return new Promise((resolve) => {
      const dialog = buildDialog('se-confirm');
      const body = opts.bodyHtml
        ? `<div class="se-dialog-body">${opts.bodyHtml}</div>`
        : `<p class="se-dialog-body">${escapeHtml(opts.message || '')}</p>`;
      dialog.innerHTML = `<div class="se-dialog-inner">
        <h2 class="se-dialog-title">${escapeHtml(opts.title || 'Please confirm')}</h2>
        ${body}
        <div class="se-dialog-actions">
          <button type="button" class="btn secondary" data-cancel>${escapeHtml(opts.cancelText || 'Cancel')}</button>
          <button type="button" class="btn ${opts.danger ? 'danger' : 'primary'}" data-confirm>${escapeHtml(opts.confirmText || 'Confirm')}</button>
        </div></div>`;
      doc.body.appendChild(dialog);
      const confirmButton = dialog.querySelector('[data-confirm]');
      confirmButton.addEventListener('click', () => dismiss(dialog, resolve, true));
      dialog.querySelector('[data-cancel]').addEventListener('click', () => dismiss(dialog, resolve, false));
      dialog.addEventListener('cancel', (event) => {
        event.preventDefault();
        dismiss(dialog, resolve, false);
      });
      dialog.addEventListener('click', (event) => {
        if (event.target === dialog) dismiss(dialog, resolve, false);
      });
      dialog.showModal();
      confirmButton.focus();
    });
  };

  const openModal = (options) => {
    const opts = options || {};
    const actions = opts.actions || [];
    return new Promise((resolve) => {
      const dialog = buildDialog('se-modal');
      dialog.innerHTML = `<div class="se-dialog-inner">
        <h2 class="se-dialog-title">${escapeHtml(opts.title || '')}</h2>
        <div class="se-dialog-body">${opts.contentHtml || ''}</div>
        <div class="se-dialog-actions">
          <button type="button" class="btn secondary" data-close>${escapeHtml(opts.closeText || 'Close')}</button>
          ${actions.map((action, index) => `<button type="button" class="btn ${action.variant || 'primary'}" data-action="${index}">${escapeHtml(action.label)}</button>`).join('')}
        </div></div>`;
      doc.body.appendChild(dialog);
      dialog.querySelector('[data-close]').addEventListener('click', () => dismiss(dialog, resolve, null));
      dialog.addEventListener('cancel', (event) => {
        event.preventDefault();
        dismiss(dialog, resolve, null);
      });
      dialog.addEventListener('click', (event) => {
        if (event.target === dialog) dismiss(dialog, resolve, null);
      });
      actions.forEach((action, index) => {
        const button = dialog.querySelector(`[data-action="${index}"]`);
        if (!button) return;
        button.addEventListener('click', async () => {
          if (typeof action.onClick !== 'function') {
            dismiss(dialog, resolve, action.value === undefined ? true : action.value);
            return;
          }
          button.disabled = true;
          try {
            const outcome = await action.onClick(dialog);
            if (outcome !== false) dismiss(dialog, resolve, outcome);
          } finally {
            if (button.isConnected) button.disabled = false;
          }
        });
      });
      if (typeof opts.onOpen === 'function') opts.onOpen(dialog);
      dialog.showModal();
      const firstField = dialog.querySelector('input, select, textarea');
      if (firstField) firstField.focus();
    });
  };

  const skeletonLines = (count) => Array.from({ length: count || 3 }, () => '<div class="skeleton skeleton-line"></div>').join('');
  const skeletonCards = (count) => Array.from({ length: count || 3 }, () => '<div class="skeleton skeleton-card"></div>').join('');

  const emptyState = (opts) => {
    const options = opts || {};
    return `<div class="empty-state">
      <p class="empty-title">${escapeHtml(options.title || 'Nothing to show yet')}</p>
      <p class="empty-text">${escapeHtml(options.message || '')}</p>
      ${options.actionHtml || ''}
    </div>`;
  };

  const setButtonLoading = (button, isLoading, loadingText) => {
    if (!button) return;
    if (isLoading) {
      button.dataset.originalText = button.textContent;
      button.disabled = true;
      button.classList.add('is-loading');
      button.textContent = loadingText || 'Please wait...';
    } else {
      button.classList.remove('is-loading');
      button.disabled = false;
      if (button.dataset.originalText) button.textContent = button.dataset.originalText;
    }
  };

  const goToLogin = () => {
    if (/\/login\.html$/.test(global.location.pathname)) return;
    const next = encodeURIComponent(global.location.pathname + global.location.search);
    global.location.href = `/login.html?next=${next}`;
  };

  const requireUser = async (role) => {
    try {
      const data = await SE.apiData('/api/users/me', { redirectOn401: false });
      if (!data || !data.user) throw new SE.ApiError('Authentication required', 401, null);
      if (role && data.user.role !== role) {
        global.location.href = data.user.role === 'admin' ? '/admin.html' : '/';
        return null;
      }
      return data.user;
    } catch (error) {
      if (!(error instanceof SE.ApiError) || error.status === 401 || error.status === 403 || error.status === 0) {
        goToLogin();
        return null;
      }
      throw error;
    }
  };

  const initNav = (user) => {
    doc.querySelectorAll('[data-user-name]').forEach((element) => {
      element.textContent = user ? user.name : '';
    });
    doc.querySelectorAll('[data-logout]').forEach((button) => {
      button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          await SE.api('/api/auth/logout', { method: 'POST', redirectOn401: false });
        } catch (_error) {
          /* Logging out locally is still the right outcome. */
        }
        global.location.href = '/login.html';
      });
    });
  };

  SE.escapeHtml = escapeHtml;
  SE.round = round;
  SE.formatDate = formatDate;
  SE.formatDateTime = formatDateTime;
  SE.formatDuration = formatDuration;
  SE.formatClock = formatClock;
  SE.toast = toast;
  SE.confirmDialog = confirmDialog;
  SE.openModal = openModal;
  SE.skeletonLines = skeletonLines;
  SE.skeletonCards = skeletonCards;
  SE.emptyState = emptyState;
  SE.setButtonLoading = setButtonLoading;
  SE.requireUser = requireUser;
  SE.initNav = initNav;
  SE.goToLogin = goToLogin;
})(window);
/**
 * INKWELL — Markdown to HTML Converter
 * app.js — Client-side UI and integration logic
 *
 * Architecture:
 *  - Frontend calls Python backend API for all markdown processing
 *  - Python backend handles: markdown parsing, sanitization, statistics
 *  - Frontend handles: UI interactions, live preview updates, theme, storage
 *  - Debounced update loop keeps preview in sync (≤150ms lag)
 *  - localStorage persists editor state across refreshes
 *  - Panel drag-resize with mouse + touch support
 *  - Full keyboard accessibility
 */

'use strict';

/* ═══════════════════════════════════════════════════════════
   1. CONSTANTS & DOM REFERENCES
═══════════════════════════════════════════════════════════ */
const STORAGE_KEY   = 'inkwell_md_content';
const STORAGE_THEME = 'inkwell_theme';
const STORAGE_TOKEN = 'inkwell_token';
const STORAGE_USERNAME = 'inkwell_username';
const DEBOUNCE_MS   = 80;
const API_BASE      = window.location.protocol === 'file:' ? 'http://localhost:5000' : window.location.origin;

const $ = id => document.getElementById(id);

const dom = {
  input:          $('md-input'),
  preview:        $('preview-output'),
  lineNumbers:    $('line-numbers'),
  charCount:      $('char-count'),
  wordCount:      $('word-count'),
  lineCount:      $('line-count'),
  readTime:       $('read-time'),
  htmlSize:       $('html-size'),
  saveIndicator:  $('save-indicator'),
  previewStatus:  $('preview-status'),
  editorHint:     $('editor-hint'),

  btnCopy:        $('btn-copy'),
  btnDownload:    $('btn-download'),
  btnClear:       $('btn-clear'),
  btnTheme:       $('btn-theme'),

  modalBackdrop:  $('modal-backdrop'),
  modalCancel:    $('modal-cancel'),
  modalConfirm:   $('modal-confirm'),

  loginModal:     $('login-modal'),
  registerModal:  $('register-modal'),
  loginForm:      $('login-form'),
  registerForm:   $('register-form'),

  authControls:   $('auth-controls'),

  resizeHandle:   $('resize-handle'),
  editorPanel:    document.querySelector('.panel--editor'),

  toast:          $('toast'),
};

/* ═══════════════════════════════════════════════════════════
   2. UTILITY FUNCTIONS
═══════════════════════════════════════════════════════════ */

/**
 * Returns a debounced version of fn that fires after `delay`ms of quiet.
 * @param {Function} fn
 * @param {number} delay
 */
function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/* ═══════════════════════════════════════════════════════════
   4. THEME MANAGEMENT
═══════════════════════════════════════════════════════════ */
const ThemeManager = (() => {
  let current = localStorage.getItem(STORAGE_THEME) || 'light';

  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    dom.btnTheme.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    dom.btnTheme.querySelector('.btn-icon').textContent = theme === 'dark' ? '◐' : '◑';
  }

  function toggle() {
    current = current === 'light' ? 'dark' : 'light';
    localStorage.setItem(STORAGE_THEME, current);
    apply(current);
    ToastManager.show(current === 'dark' ? 'Dark mode on' : 'Light mode on', 'info');
  }

  function init() { apply(current); }

  return { init, toggle, get current() { return current; } };
})();

/* ═══════════════════════════════════════════════════════════
   5. TOAST MANAGER
═══════════════════════════════════════════════════════════ */
const ToastManager = (() => {
  let hideTimer;

  /**
   * @param {string} message
   * @param {'success'|'error'|'info'} type
   * @param {number} duration ms
   */
  function show(message, type = 'success', duration = 2200) {
    clearTimeout(hideTimer);

    dom.toast.textContent = message;
    dom.toast.className   = `toast toast--${type} show`;
    dom.toast.hidden      = false;

    hideTimer = setTimeout(hide, duration);
  }

  function hide() {
    dom.toast.classList.remove('show');
    setTimeout(() => { dom.toast.hidden = true; }, 250);
  }

  return { show, hide };
})();

/* ═══════════════════════════════════════════════════════════
   AUTH MANAGER
═══════════════════════════════════════════════════════════ */
const AuthManager = (() => {
  let token = localStorage.getItem(STORAGE_TOKEN) || null;
  let username = localStorage.getItem(STORAGE_USERNAME) || null;

  function getAuthHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }

  function setToken(newToken, user) {
    token = newToken;
    username = user;
    localStorage.setItem(STORAGE_TOKEN, token);
    localStorage.setItem(STORAGE_USERNAME, username);
    setWorkspaceEnabled(true);
    updateAuthUI();
  }

  function clearToken() {
    token = null;
    username = null;
    localStorage.removeItem(STORAGE_TOKEN);
    localStorage.removeItem(STORAGE_USERNAME);
    setWorkspaceEnabled(false);
    updateAuthUI();
  }

  function isAuthenticated() {
    return !!token;
  }

  function getToken() { return token; }
  function getUsername() { return username; }

  function updateAuthUI() {
    const container = dom.authControls;
    if (!container) return;
    container.innerHTML = '';
    if (isAuthenticated()) {
      const span = document.createElement('span');
      span.className = 'btn-label';
      span.textContent = `Logged in as ${username}`;
      container.appendChild(span);
      const btn = document.createElement('button');
      btn.className = 'btn btn--ghost';
      btn.textContent = 'Logout';
      btn.addEventListener('click', () => {
        clearToken();
        // Optionally clear editor content
        dom.input.value = '';
        render('');
        ToastManager.show('Logged out', 'info');
      });
      container.appendChild(btn);
    } else {
      const btnLogin = document.createElement('button');
      btnLogin.className = 'btn btn--outline';
      btnLogin.textContent = 'Login';
      btnLogin.addEventListener('click', () => AuthUI.openLogin());
      container.appendChild(btnLogin);
      const btnReg = document.createElement('button');
      btnReg.className = 'btn btn--primary';
      btnReg.textContent = 'Sign up';
      btnReg.addEventListener('click', () => AuthUI.openRegister());
      container.appendChild(btnReg);
    }
  }

  async function login(usernameVal, password) {
    const res = await fetch(`${API_BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: usernameVal, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    setToken(data.token, data.username);
    ToastManager.show(`Welcome back, ${data.username}!`, 'success');
    AuthUI.closeAll(true);
  }

  async function register(usernameVal, password) {
    const res = await fetch(`${API_BASE}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: usernameVal, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');
    setToken(data.token, data.username);
    ToastManager.show(`Account created for ${data.username}!`, 'success');
    AuthUI.closeAll(true);
  }

  return { getAuthHeaders, setToken, clearToken, isAuthenticated, getToken, getUsername, updateAuthUI, login, register };
})();

/* ═══════════════════════════════════════════════════════════
   AUTH UI (modal handling)
═══════════════════════════════════════════════════════════ */
const AuthUI = (() => {
  function open(modalEl) {
    modalEl.hidden = false;
    document.addEventListener('keydown', onKey);
    // focus first input
    const input = modalEl.querySelector('input');
    if (input) input.focus();
  }
  function close(modalEl, force = false) {
    if (modalEl === dom.loginModal && !AuthManager.isAuthenticated() && !force) return;
    modalEl.hidden = true;
    if (modalEl === dom.registerModal && !AuthManager.isAuthenticated() && !force) {
      open(dom.loginModal);
      return;
    }
    document.removeEventListener('keydown', onKey);
  }
  function closeAll(force = false) {
    close(dom.loginModal, force);
    close(dom.registerModal, force);
  }
  function onKey(e) {
    if (e.key === 'Escape') closeAll();
  }
  function switchModal(from, to) {
    close(from);
    open(to);
  }

  dom.loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    const username = dom.loginForm.username.value.trim();
    const password = dom.loginForm.password.value;
    try {
      await AuthManager.login(username, password);
    } catch (err) {
      ToastManager.show(err.message, 'error');
    }
  });

  dom.registerForm.addEventListener('submit', async e => {
    e.preventDefault();
    const username = dom.registerForm.username.value.trim();
    const password = dom.registerForm.password.value;
    try {
      await AuthManager.register(username, password);
    } catch (err) {
      ToastManager.show(err.message, 'error');
    }
  });

  // Switch links
  document.querySelectorAll('.auth-switch').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const target = document.getElementById(targetId);
      const current = btn.closest('.modal-backdrop');
      switchModal(current, target);
    });
  });

  // Close on backdrop click
  [dom.loginModal, dom.registerModal].forEach(modal => {
    modal.addEventListener('click', e => {
      if (e.target === modal) close(modal);
    });
  });

  return { openLogin: () => open(dom.loginModal), openRegister: () => open(dom.registerModal), closeAll };
})();

function setWorkspaceEnabled(enabled) {
  dom.input.disabled = !enabled;
  [dom.btnCopy, dom.btnDownload, dom.btnClear].forEach(button => {
    button.disabled = !enabled;
  });
  document.querySelectorAll('[data-format]').forEach(button => {
    button.disabled = !enabled;
  });
}

/* ═══════════════════════════════════════════════════════════
   3. LINE NUMBER RENDERER
═══════════════════════════════════════════════════════════ */
function renderLineNumbers(text) {
  const lineCount = text.split('\n').length;
  // Only re-render if count changed (performance guard)
  const current = dom.lineNumbers.children.length;
  if (current === lineCount) return;

  const frag = document.createDocumentFragment();
  for (let i = 1; i <= lineCount; i++) {
    const span = document.createElement('span');
    span.textContent = i;
    frag.appendChild(span);
  }
  dom.lineNumbers.innerHTML = '';
  dom.lineNumbers.appendChild(frag);
}

/* Sync line number scroll with textarea scroll */
function syncLineScroll() {
  dom.lineNumbers.scrollTop = dom.input.scrollTop;
}

/* ═══════════════════════════════════════════════════════════
   4. STATISTICS DISPLAY (from API response)
═══════════════════════════════════════════════════════════ */
function updateCounters(stats) {
  const chars = stats.chars || 0;
  const words = stats.words || 0;
  const lines = stats.lines || 1;

  dom.charCount.textContent = `${chars.toLocaleString()} char${chars !== 1 ? 's' : ''}`;
  dom.wordCount.textContent = `${words.toLocaleString()} word${words !== 1 ? 's' : ''}`;
  dom.lineCount.textContent = `${lines.toLocaleString()} line${lines !== 1 ? 's' : ''}`;
  dom.readTime.textContent  = stats.read_time || '<1 min read';
  dom.htmlSize.textContent  = stats.html_size || '0 B';
}

/* ═══════════════════════════════════════════════════════════
   5. CORE RENDER LOOP (calls Python API)
═══════════════════════════════════════════════════════════ */
let lastRenderedHTML = '';
let renderRequest = null;
let renderSequence = 0;

async function render(text) {
  const sequence = ++renderSequence;
  if (renderRequest) renderRequest.abort();
  renderRequest = new AbortController();

  if (!AuthManager.isAuthenticated()) {
    dom.preview.innerHTML = '<div class="preview-empty"><p class="preview-empty-text">Login to start converting</p></div>';
    dom.previewStatus.textContent = 'Login required';
    updateCounters({ chars: 0, words: 0, lines: 1, read_time: '<1 min read', html_size: '0 B' });
    return;
  }

  try {
    // Call Python backend to convert markdown
    const response = await fetch(`${API_BASE}/api/convert`, {
      method: 'POST',
      headers: AuthManager.getAuthHeaders(),
      body: JSON.stringify({ markdown: text }),
      signal: renderRequest.signal
    });

    if (!response.ok) {
      if (response.status === 401) {
        AuthManager.clearToken();
        AuthUI.openLogin();
      }
      throw new Error(`API error: ${response.statusText}`);
    }

    const data = await response.json();
    if (sequence !== renderSequence) return;
    const cleanHTML = data.html;
    lastRenderedHTML = cleanHTML;

    // Update preview
    if (cleanHTML.trim()) {
      dom.preview.innerHTML = cleanHTML;
      dom.preview.classList.remove('preview-empty-state');
    } else {
      dom.preview.innerHTML = `
        <div class="preview-empty">
          <p class="preview-empty-text">Your rendered post will appear here</p>
        </div>`;
    }

    // Update counters with stats from API
    updateCounters(data.stats);

    // Update line numbers
    renderLineNumbers(text);

    // Status indicator
    dom.previewStatus.textContent = 'Live ●';
    clearTimeout(render._statusTimer);
    render._statusTimer = setTimeout(() => {
      dom.previewStatus.textContent = 'Live';
    }, 600);
  } catch (err) {
    if (err.name === 'AbortError' || sequence !== renderSequence) return;
    console.error('Render error:', err);
    dom.preview.innerHTML = `<p style="color:red;">Error: ${err.message}</p>`;
    dom.previewStatus.textContent = 'Error';
  }
}

render._statusTimer = null;

/* Debounced version for input events */
const renderDebounced = debounce(render, DEBOUNCE_MS);

/* ═══════════════════════════════════════════════════════════
   6. LOCAL STORAGE PERSISTENCE
═══════════════════════════════════════════════════════════ */
let saveTimer;

function saveToStorage(text) {
  try {
    localStorage.setItem(STORAGE_KEY, text);
    // Flash save indicator
    dom.saveIndicator.textContent = '✓ Saved';
    dom.saveIndicator.classList.add('visible');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => dom.saveIndicator.classList.remove('visible'), 2000);
  } catch (e) {
    // Storage quota exceeded or private mode
    console.warn('localStorage write failed:', e);
  }
}

function loadFromStorage() {
  try {
    return localStorage.getItem(STORAGE_KEY) || '';
  } catch (e) {
    return '';
  }
}

function clearStorage() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
}

/* Apply a Markdown pattern to the current selection and keep editing in place. */
function formatSelection(format) {
  const input = dom.input;
  const start = input.selectionStart;
  const end = input.selectionEnd;
  const selected = input.value.slice(start, end);
  const lineStart = input.value.lastIndexOf('\n', start - 1) + 1;
  const lineEndIndex = input.value.indexOf('\n', end);
  const lineEnd = lineEndIndex === -1 ? input.value.length : lineEndIndex;
  const selectedLines = input.value.slice(lineStart, lineEnd);
  let before = '';
  let after = '';
  let replacement = selected;

  if (format === 'bold') { before = '**'; after = '**'; }
  if (format === 'italic') { before = '*'; after = '*'; }
  if (format === 'heading') { before = '# '; }
  if (format === 'link') { before = '['; after = '](https://)'; }
  if (format === 'code') { before = '`'; after = '`'; }
  if (format === 'quote') {
    replacement = selectedLines.split('\n').map(line => `> ${line}`).join('\n');
    input.setSelectionRange(lineStart, lineEnd);
  }
  if (format === 'bullet') {
    replacement = selectedLines.split('\n').map(line => `- ${line}`).join('\n');
    input.setSelectionRange(lineStart, lineEnd);
  }
  if (format === 'rule') {
    replacement = `${selected ? `${selected}\n` : ''}---`;
    before = '';
    after = '';
  }

  const selectionStart = input.selectionStart;
  const selectionEnd = input.selectionEnd;
  input.setRangeText(`${before}${replacement}${after}`, selectionStart, selectionEnd, 'select');
  input.dispatchEvent(new Event('input'));
  input.focus();
}

/* ═══════════════════════════════════════════════════════════
   7. CLIPBOARD — Copy HTML
═══════════════════════════════════════════════════════════ */
async function copyHTML() {
  const html = lastRenderedHTML;

  if (!html.trim()) {
    ToastManager.show('Nothing to copy — write some Markdown first!', 'error');
    return;
  }

  try {
    await navigator.clipboard.writeText(html);
    dom.btnCopy.classList.add('btn--success-flash');
    setTimeout(() => dom.btnCopy.classList.remove('btn--success-flash'), 1200);
    ToastManager.show('HTML copied to clipboard ✓', 'success');
  } catch (_) {
    // Fallback for browsers without Clipboard API
    try {
      const el = document.createElement('textarea');
      el.value = html;
      el.style.cssText = 'position:fixed;left:-9999px;top:-9999px';
      document.body.appendChild(el);
      el.focus();
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      ToastManager.show('HTML copied to clipboard ✓', 'success');
    } catch (err) {
      ToastManager.show('Copy failed — please copy manually.', 'error');
    }
  }
}

/* ═══════════════════════════════════════════════════════════
   8. DOWNLOAD — Export as HTML (calls Python API)
═══════════════════════════════════════════════════════════ */
async function downloadFile() {
  if (!lastRenderedHTML.trim()) {
    ToastManager.show('Nothing to download — write some Markdown first!', 'error');
    return;
  }

  try {
    // Call Python API to generate document and get filename
    const response = await fetch(`${API_BASE}/api/download`, {
      method: 'POST',
      headers: AuthManager.getAuthHeaders(),
      body: JSON.stringify({ markdown: dom.input.value })
    });

    if (!response.ok) {
      throw new Error(`Download failed: ${response.statusText}`);
    }

    const data = await response.json();
    const blob = new Blob([data.html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = data.filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Free the object URL after download
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    ToastManager.show(`Downloaded as ${data.filename} ✓`, 'success');
  } catch (err) {
    console.error('Download error:', err);
    ToastManager.show('Download failed — please try again.', 'error');
  }
}

/* ═══════════════════════════════════════════════════════════
   9. CLEAR CANVAS MODAL
═══════════════════════════════════════════════════════════ */
const ClearModal = (() => {
  function open() {
    dom.modalBackdrop.hidden = false;
    dom.modalConfirm.focus();
    document.addEventListener('keydown', onKey);
  }

  function close() {
    dom.modalBackdrop.hidden = true;
    document.removeEventListener('keydown', onKey);
    dom.btnClear.focus();
  }

  function confirm() {
    dom.input.value = '';
    clearStorage();
    render('');
    close();
    ToastManager.show('Canvas cleared', 'info');
    dom.input.focus();
  }

  function onKey(e) {
    if (e.key === 'Escape') close();
    if (e.key === 'Enter')  confirm();
  }

  dom.modalCancel.addEventListener('click', close);
  dom.modalConfirm.addEventListener('click', confirm);
  dom.modalBackdrop.addEventListener('click', e => {
    if (e.target === dom.modalBackdrop) close();
  });

  return { open, close };
})();

/* ═══════════════════════════════════════════════════════════
   10. PANEL RESIZE (Drag Handle)
═══════════════════════════════════════════════════════════ */
const ResizeManager = (() => {
  const STORAGE_KEY_SPLIT = 'inkwell_split';
  let dragging = false;
  let startX, startWidth;

  const workspace    = document.querySelector('.workspace');
  const editorPanel  = dom.editorPanel;
  const handle       = dom.resizeHandle;
  const isMobile     = () => window.innerWidth <= 768;

  function restoreSplit() {
    if (isMobile()) return;
    const saved = localStorage.getItem(STORAGE_KEY_SPLIT);
    if (saved) editorPanel.style.flex = `0 0 ${saved}`;
  }

  function saveSplit(pct) {
    localStorage.setItem(STORAGE_KEY_SPLIT, pct);
  }

  function startDrag(e) {
    if (isMobile()) return;
    dragging  = true;
    startX    = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
    startWidth = editorPanel.offsetWidth;
    handle.classList.add('is-dragging');
    document.body.style.cursor    = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  function doDrag(e) {
    if (!dragging) return;
    const clientX  = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
    const delta    = clientX - startX;
    const total    = workspace.offsetWidth;
    const newWidth = Math.min(Math.max(startWidth + delta, total * 0.2), total * 0.8);
    const pct      = `${((newWidth / total) * 100).toFixed(2)}%`;
    editorPanel.style.flex = `0 0 ${pct}`;
  }

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('is-dragging');
    document.body.style.cursor    = '';
    document.body.style.userSelect = '';
    // Save split ratio
    const total    = workspace.offsetWidth;
    const pct      = `${((editorPanel.offsetWidth / total) * 100).toFixed(2)}%`;
    saveSplit(pct);
  }

  // Keyboard resize (arrow keys when handle focused)
  handle.addEventListener('keydown', e => {
    if (isMobile()) return;
    const step   = e.shiftKey ? 50 : 10;
    const total  = workspace.offsetWidth;
    const current = editorPanel.offsetWidth;
    let newWidth  = current;

    if (e.key === 'ArrowLeft')  newWidth -= step;
    if (e.key === 'ArrowRight') newWidth += step;
    else return;

    e.preventDefault();
    const clamped = Math.min(Math.max(newWidth, total * 0.2), total * 0.8);
    editorPanel.style.flex = `0 0 ${clamped}px`;
    saveSplit(`${((clamped / total) * 100).toFixed(2)}%`);
  });

  handle.addEventListener('mousedown',  startDrag);
  handle.addEventListener('touchstart', startDrag, { passive: true });
  document.addEventListener('mousemove', doDrag);
  document.addEventListener('touchmove',  doDrag, { passive: true });
  document.addEventListener('mouseup',  endDrag);
  document.addEventListener('touchend',  endDrag);

  return { restoreSplit };
})();

/* ═══════════════════════════════════════════════════════════
   11. EVENT LISTENERS
═══════════════════════════════════════════════════════════ */
function attachEventListeners() {
  // Real-time Markdown rendering (with debounce)
  dom.input.addEventListener('input', () => {
    const text = dom.input.value;
    renderDebounced(text);
    saveToStorage(text);
  });

  // Sync line numbers on scroll
  dom.input.addEventListener('scroll', syncLineScroll);

  // Tab key support inside textarea
  dom.input.addEventListener('keydown', e => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = dom.input.selectionStart;
      const end   = dom.input.selectionEnd;
      const val   = dom.input.value;
      dom.input.value = val.substring(0, start) + '  ' + val.substring(end);
      dom.input.selectionStart = dom.input.selectionEnd = start + 2;
      // Trigger re-render
      dom.input.dispatchEvent(new Event('input'));
    }
  });

  // Button: Copy HTML
  dom.btnCopy.addEventListener('click', copyHTML);

  // Button: Download
  dom.btnDownload.addEventListener('click', downloadFile);

  // Button: Clear Canvas
  dom.btnClear.addEventListener('click', () => ClearModal.open());

  // Button: Theme Toggle
  dom.btnTheme.addEventListener('click', () => ThemeManager.toggle());

  document.querySelectorAll('[data-format]').forEach(button => {
    button.addEventListener('click', () => formatSelection(button.dataset.format));
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && ['b', 'i', 'k'].includes(e.key.toLowerCase())) {
      e.preventDefault();
      formatSelection({ b: 'bold', i: 'italic', k: 'link' }[e.key.toLowerCase()]);
      return;
    }
    // Ctrl/Cmd + Shift + C → Copy HTML
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'c') {
      e.preventDefault();
      copyHTML();
    }
    // Ctrl/Cmd + Shift + D → Download
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'd') {
      e.preventDefault();
      downloadFile();
    }
    // Ctrl/Cmd + Shift + T → Theme toggle
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 't') {
      e.preventDefault();
      ThemeManager.toggle();
    }
  });

  // Resize: reset on double-click to 50/50
  dom.resizeHandle.addEventListener('dblclick', () => {
    dom.editorPanel.style.flex = '0 0 50%';
    localStorage.setItem('inkwell_split', '50.00%');
    ToastManager.show('Split reset to 50 / 50', 'info');
  });
}

/* ═══════════════════════════════════════════════════════════
   12. INITIALIZATION
═══════════════════════════════════════════════════════════ */
const DEFAULT_CONTENT = `# Welcome to Inkwell ✦

A **distraction-free** Markdown editor that converts your writing to clean HTML in real-time.

## Features at a glance

- 📝 **Live preview** updates as you type (< 150ms latency)
- 🔒 **XSS-safe** — all output is sanitised by the backend
- 💾 **Auto-save** — your work persists across page refreshes
- 📋 **Copy HTML** — grab the raw markup instantly
- 📥 **Download** — export as a self-contained \`.html\` file
- 🌙 **Dark mode** — easy on the eyes for late-night writing

## Writing in Markdown

### Text formatting

You can use **bold**, *italics*, ~~strikethrough~~, and \`inline code\`.

### Code blocks

\`\`\`javascript
// A simple debounce function
function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
\`\`\`

### Blockquotes

> "The best way to predict the future is to invent it."  
> — Alan Kay

---

Start editing and watch the magic happen! 🎨`;

function init() {
  // 1. Apply saved theme
  ThemeManager.init();

  // 2. Auth UI
  AuthManager.updateAuthUI();
  setWorkspaceEnabled(AuthManager.isAuthenticated());

  // 3. Load persisted content (or default on first visit)
  const saved = loadFromStorage();
  dom.input.value = saved !== '' ? saved : DEFAULT_CONTENT;

  // 4. Attach all event listeners first
  attachEventListeners();

  // 5. Restore saved panel split
  ResizeManager.restoreSplit();

  // 6. Initial render
  render(dom.input.value);

  // 7. Focus textarea and position cursor at end
  dom.input.focus();
  dom.input.selectionStart = dom.input.selectionEnd = dom.input.value.length;

  // If not authenticated, prompt login
  if (!AuthManager.isAuthenticated()) {
    AuthUI.openLogin();
  }
}

// Boot when DOM is fully parsed
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

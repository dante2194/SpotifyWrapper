// ==UserScript==
// @name         SpotiDown Helper + Spotify UI Integration
// @namespace    sharmanhall.spotidown.helper
// @version      2.0.0
// @description  Replaces Spotify track/album Share buttons with a SpotiDown download button, adds per-track download controls, and keeps the SpotiDown helper flow.
// @match        https://open.spotify.com/*
// @match        https://spotidown.app/*
// @grant        none
// @icon         https://www.google.com/s2/favicons?sz=64&domain=spotify.com
// @license      MIT
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const SPOTIDOWN_BASE = 'https://spotidown.app/';
  const AUTO_FLAGS = { sdh_auto: '1' };

  function isSpotify() {
    return location.host === 'open.spotify.com';
  }

  function isSpotiDown() {
    return location.host === 'spotidown.app';
  }

  function buildSpotiDownURL(spUrl, extraFlags = {}) {
    const u = new URL(SPOTIDOWN_BASE);
    u.searchParams.set('sdh_url', spUrl);

    Object.entries({
      ...AUTO_FLAGS,
      ...extraFlags
    }).forEach(([k, v]) => {
      u.searchParams.set(k, v);
    });

    return u.toString();
  }

  /* ============================================================
   * SPOTIFY
   * ============================================================ */

  function cssInjectSpotify() {
    if (document.getElementById('sdh-spotify-css')) return;

    const style = document.createElement('style');
    style.id = 'sdh-spotify-css';

    style.textContent = `
      .sdh-row-dl {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        border: 0;
        background: #1fdf64;
        color: #000;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transform: translateY(-50%);
        position: absolute;
        top: 50%;
        right: 100%;
        margin-right: 8px;
      }

      .sdh-row-dl:hover {
        transform: translateY(-50%) scale(1.08);
      }

      .sdh-page-dl {
        display: inline-flex !important;
        align-items: center;
        justify-content: center;
        gap: 8px;
        box-sizing: border-box;
        min-height: 32px;
        padding: 8px 16px;
        border: 0;
        border-radius: 999px;
        background: #1fdf64;
        color: #000;
        font-weight: 700;
        cursor: pointer;
        font: inherit;
        line-height: 1;
        white-space: nowrap;
      }

      .sdh-page-dl:hover {
        filter: brightness(1.05);
        transform: scale(1.02);
      }

      .sdh-page-dl:focus-visible {
        outline: 2px solid currentColor;
        outline-offset: 2px;
      }
    `;

    document.head.appendChild(style);
  }

  function getTrackHrefFromRow(row) {
    const a = row.querySelector('a[href*="/track/"]');

    return a
      ? new URL(a.href, location.href).toString()
      : null;
  }

  function addRowButton(row) {
    if (row.__sdh_dl) return;

    const href = getTrackHrefFromRow(row);
    if (!href) return;

    const btn = document.createElement('button');

    btn.type = 'button';
    btn.className = 'sdh-row-dl';
    btn.title = '';
    btn.setAttribute('aria-label', '');

    btn.textContent = '↓';

    row.style.position = row.style.position || 'relative';

    row.appendChild(btn);

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      window.open(
        buildSpotiDownURL(href, { sdh_open: '1' }),
        '_blank',
        'noopener,noreferrer'
      );
    });

    row.__sdh_dl = true;
  }

  function isDownloadTargetPage() {
    return (
      /^\/track\/[^/?#]+(?:[/?#]|$)/.test(location.pathname) ||
      /^\/album\/[^/?#]+(?:[/?#]|$)/.test(location.pathname)
    );
  }

  function makePageDownloadButton() {
    const btn = document.createElement('button');

    btn.id = 'sdh-page-dl';
    btn.className = 'sdh-page-dl';
    btn.type = 'button';

    btn.textContent = '↓';
    btn.title = '';
    btn.setAttribute('aria-label', '');

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const url = new URL(location.href);
      url.hash = '';

      window.open(
        buildSpotiDownURL(url.toString(), { sdh_open: '1' }),
        '_blank',
        'noopener,noreferrer'
      );
    });

    return btn;
  }

  function replaceShareButton(shareButton) {
    if (!shareButton) return;
    if (shareButton.dataset.sdhReplaced === '1') return;

    const replacement = makePageDownloadButton();
    shareButton.replaceWith(replacement);
  }

  function restoreOrReplaceShareButton() {
    if (!isDownloadTargetPage()) {
      document.getElementById('sdh-page-dl')?.remove();
      return;
    }

    const shareButton =
      document.querySelector(
        '[data-testid="entity-share-button"][aria-label="Share"]'
      ) ||
      document.querySelector('[data-testid="entity-share-button"]');

    if (shareButton) replaceShareButton(shareButton);
  }

  function scanSpotify() {
    cssInjectSpotify();
    restoreOrReplaceShareButton();

    document
      .querySelectorAll('[data-testid="tracklist-row"]')
      .forEach(addRowButton);
  }

  function watchSpotify() {
    let scheduled = false;

    const scheduleScan = () => {
      if (scheduled) return;
      scheduled = true;

      requestAnimationFrame(() => {
        scheduled = false;
        scanSpotify();
      });
    };

    const observer = new MutationObserver((mutations) => {
      if (
        mutations.some(
          m =>
            m.type === 'childList' &&
            (m.addedNodes.length || m.removedNodes.length)
        )
      ) {
        scheduleScan();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    let lastHref = location.href;

    const navTimer = setInterval(() => {
      if (location.href !== lastHref) {
        lastHref = location.href;
        scheduleScan();
      }
    }, 500);

    window.addEventListener('popstate', scheduleScan);
    window.addEventListener('hashchange', scheduleScan);

    window.addEventListener(
      'beforeunload',
      () => clearInterval(navTimer),
      { once: true }
    );
  }

  /* ============================================================
   * SPOTIDOWN HELPER
   * ============================================================ */

  function spotiDownHelper() {

    const MAX_TRACKS = 100;
    const RESOLVE_POOL = 3;
    const PACE_MS = [100, 300];
    const OPEN_DELAY_MS = 500;
    const OPEN_MODE = 'iframe';

    const Stats = { total: 0, resolved: 0, opened: 0, failed: 0 };

    const state = {
      sectionObserver: null,
      anchorObserver: null,
      healTimer: null
    };

    function wait(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    function randInt(min, max) {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    const pace = () => wait(randInt(PACE_MS[0], PACE_MS[1]));

    /* ---------- STABLE MOUNT ---------- */

    function getToolbarAnchor() {
      const sec = document.getElementById('download-section');

      const parent =
        sec?.parentElement ||
        document.querySelector('main .container') ||
        document.querySelector('main') ||
        document.body;

      if (!parent) return null;

      let anchor = document.getElementById('sdh-toolbar-anchor');

      if (!anchor) {
        anchor = document.createElement('div');
        anchor.id = 'sdh-toolbar-anchor';

        if (sec && sec.parentElement === parent) {
          parent.insertBefore(anchor, sec);
        } else {
          parent.prepend(anchor);
        }
      }

      return anchor;
    }

    function ensureToolbar() {
      const host = getToolbarAnchor();
      if (!host) return null;

      let bar = document.getElementById('sdh-toolbar');

      if (!bar) {
        bar = document.createElement('div');
        bar.id = 'sdh-toolbar';

        bar.innerHTML = `
          <div id="sdh-buttons" style="margin-bottom:8px;"></div>
          <div id="sdh-counters" style="margin:6px 0 10px 0;font-weight:600;">
            <span id="sdh-count-total">Total: 0</span> ·
            <span id="sdh-count-res">Resolved: 0</span> ·
            <span id="sdh-count-open">Opened: 0</span> ·
            <span id="sdh-count-fail">Failed: 0</span>
          </div>
        `;

        host.appendChild(bar);
      }

      return bar;
    }

    function updateCounters() {
      const t = document.getElementById('sdh-count-total');
      const r = document.getElementById('sdh-count-res');
      const o = document.getElementById('sdh-count-open');
      const f = document.getElementById('sdh-count-fail');

      if (t) t.textContent = `Total: ${Stats.total}`;
      if (r) r.textContent = `Resolved: ${Stats.resolved}`;
      if (o) o.textContent = `Opened: ${Stats.opened}`;
      if (f) f.textContent = `Failed: ${Stats.failed}`;
    }

    function styleBtn(btn, bg = '#28a745') {
      Object.assign(btn.style, {
        display: 'inline-block',
        padding: '6px 10px',
        margin: '0 6px 6px 0',
        border: '0',
        borderRadius: '6px',
        cursor: 'pointer',
        fontWeight: '600',
        fontSize: '13px',
        color: '#fff',
        background: bg
      });
    }

    /* ---------- BUTTONS ---------- */

    function insertButtons() {
      const bar = ensureToolbar();
      if (!bar) return;

      const panel = bar.querySelector('#sdh-buttons');
      if (!panel) return;

      if (!document.getElementById('sdh-inline-btn')) {
        const btn = document.createElement('button');
        btn.id = 'sdh-inline-btn';
        btn.textContent = `Resolve Direct Links (up to ${MAX_TRACKS}, ${RESOLVE_POOL}×)`;
        styleBtn(btn);
        btn.addEventListener('click', () => resolveAllParallel().catch(alertStop));
        panel.appendChild(btn);
      }

      if (!document.getElementById('sdh-bulk-btn')) {
        const bulk = document.createElement('button');
        bulk.id = 'sdh-bulk-btn';
        bulk.textContent = 'Download Resolved';
        styleBtn(bulk, '#157347');
        bulk.addEventListener('click', () => bulkOpenResolved().catch(alertStop));
        panel.appendChild(bulk);
      }
    }

    function alertStop(e) {
      console.warn('[SpotiDown Helper] stopped:', e);
      alert(`Stopped: ${e.message}`);
    }

    /* ---------- BADGES ---------- */

    function rowRootFromForm(form) {
      return (
        form.closest('.grid-container') ||
        form.closest('.spotidown') ||
        form.parentElement
      );
    }

    function ensureBadgeRow(rowRoot) {
      if (!rowRoot) return null;

      let wrap = rowRoot.querySelector('.sdh-badge-wrap');

      if (!wrap) {
        wrap = document.createElement('div');
        wrap.className = 'sdh-badge-wrap';
        Object.assign(wrap.style, { marginTop: '6px' });
        rowRoot.appendChild(wrap);
      }

      return wrap;
    }

    function setBadge(rowRoot, text, state, retryFn) {
      const wrap = ensureBadgeRow(rowRoot);
      if (!wrap) return;

      wrap.innerHTML = '';

      const badge = document.createElement('span');
      badge.textContent = text;

      Object.assign(badge.style, {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '12px',
        fontWeight: '600',
        padding: '4px 8px',
        borderRadius: '999px',
        color: '#fff',
        marginRight: '6px'
      });

      const colors = {
        pending: '#6c757d',
        working: '#0d6efd',
        resolved: '#198754',
        opened: '#20c997',
        failed: '#dc3545'
      };

      badge.style.background = colors[state] || '#6c757d';

      wrap.appendChild(badge);

      if (retryFn && state === 'failed') {
        const retry = document.createElement('button');
        retry.textContent = 'Retry';
        styleBtn(retry, '#ffc107');
        retry.style.fontSize = '11px';
        retry.addEventListener('click', retryFn);
        wrap.appendChild(retry);
      }
    }

    /* ---------- HELPERS ---------- */

    function getTrackForms() {
      return Array.from(document.getElementsByName('submitspurl'));
    }

    function getDesiredFilenameFromForm(form) {
      try {
        const encoded = form.querySelector('input[name="data"]')?.value || '';
        const obj = JSON.parse(atob(encoded));
        const name = (obj.name || 'Track').trim();
        const artist = (obj.artist || '').replace(/\//g, '-').trim();
        const nice = artist ? `${name} - ${artist}.mp3` : `${name}.mp3`;
        return nice.replace(/^SpotiDown\.App\s*-\s*/i, '');
      } catch {
        return 'track.mp3';
      }
    }

    async function postFormToTrack(form) {
      const fd = new FormData(form);

      const resp = await fetch('/action/track', {
        method: 'POST',
        body: fd,
        credentials: 'same-origin'
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const json = await resp.json();
      if (json.error) throw new Error(json.message || 'Server error');

      return json.data;
    }

    function extractDirectLink(html) {
      const dp = new DOMParser();
      const doc = dp.parseFromString(html, 'text/html');

      let a = doc.querySelector('a#popup[href]');

      if (!a) {
        a = Array.from(doc.querySelectorAll('a[href]')).find(x => {
          const href = (x.getAttribute('href') || '').toLowerCase();
          const text = (x.textContent || '').toLowerCase();

          return (
            href.includes('rapid.spotidown.app') ||
            text.includes('download mp3') ||
            /\.mp3(\?|$)/.test(href)
          );
        });
      }

      return a ? a.getAttribute('href') : null;
    }

    function replaceButtonWithLink(form, href) {
      if (!href) return null;

      const btn =
        form.querySelector('button.abutton') ||
        form.querySelector('.abutton');

      const a = document.createElement('a');

      a.className = 'abutton is-success is-fullwidth';
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';

      a.innerHTML = '<span><span>Download Mp3 (Direct)</span></span>';

      a.setAttribute('download', getDesiredFilenameFromForm(form));

      if (btn && btn.parentElement) {
        btn.parentElement.replaceChild(a, btn);
      } else {
        form.appendChild(a);
      }

      return a;
    }

    function openOne(href) {
      if (!href) return false;

      if (OPEN_MODE === 'tab') {
        window.open(href, '_blank', 'noopener');
      } else if (OPEN_MODE === 'iframe') {
        const frame = document.createElement('iframe');
        frame.style.display = 'none';
        frame.src = href;
        document.body.appendChild(frame);
        setTimeout(() => frame.remove(), 15000);
      } else {
        window.location.href = href;
      }

      return true;
    }

    /* ---------- COUNTERS ---------- */

    function decFailed() {
      Stats.failed = Math.max(0, Stats.failed - 1);
    }

    function incResolved() { Stats.resolved++; }
    function incOpened() { Stats.opened++; }

    /* ---------- RESOLVE ---------- */

    async function resolveOne(form, row, isRetry = false) {
      setBadge(row, 'Resolving…', 'working');

      try {
        const html = await postFormToTrack(form);
        const href = extractDirectLink(html);

        if (!href) throw new Error('No direct link');

        replaceButtonWithLink(form, href);
        setBadge(row, 'Resolved', 'resolved');

        if (isRetry) {
          decFailed();
          incResolved();
        } else {
          incResolved();
        }

        updateCounters();

      } catch (e) {
        if (!isRetry) {
          Stats.failed++;
          updateCounters();
        }

        setBadge(row, 'Failed', 'failed', () => resolveOne(form, row, true));
      }
    }

    async function retryOpen(row, href) {
      setBadge(row, 'Opening…', 'working');

      try {
        openOne(href);

        decFailed();
        incOpened();
        updateCounters();

        setBadge(row, 'Opened', 'opened');

      } catch (e) {
        setBadge(row, 'Open failed', 'failed', () => retryOpen(row, href));
      }
    }

    async function resolveAllParallel() {
      const forms = getTrackForms().slice(0, MAX_TRACKS);

      Stats.total = forms.length;
      updateCounters();

      let index = 0;

      async function worker() {
        while (index < forms.length) {
          const i = index++;
          const form = forms[i];
          const row = rowRootFromForm(form);

          await resolveOne(form, row);
          await pace();
        }
      }

      await Promise.all(
        Array.from({ length: RESOLVE_POOL }, worker)
      );
    }

    async function bulkOpenResolved() {
      const forms = getTrackForms().slice(0, MAX_TRACKS);

      for (const f of forms) {
        const row = rowRootFromForm(f);

        const a = f.parentElement?.querySelector(
          'a.abutton[href*="rapid.spotidown.app"]'
        );

        if (!a) continue;

        try {
          setBadge(row, 'Opening…', 'working');
          openOne(a.href);

          incOpened();
          updateCounters();

          setBadge(row, 'Opened', 'opened');

        } catch (e) {
          Stats.failed++;
          updateCounters();
          setBadge(row, 'Open failed', 'failed', () => retryOpen(row, a.href));
        }

        await wait(OPEN_DELAY_MS);
      }
    }

    /* ---------- WATCHERS ---------- */

    function watchSection() {
      if (state.anchorObserver) state.anchorObserver.disconnect();

      state.anchorObserver = new MutationObserver(() => {
        ensureToolbar();
        insertButtons();
      });

      state.anchorObserver.observe(document.body, {
        childList: true,
        subtree: true
      });

      const sec = document.getElementById('download-section');

      if (state.sectionObserver) state.sectionObserver.disconnect();

      if (sec) {
        state.sectionObserver = new MutationObserver(mutations => {
          if (mutations.some(m => m.type === 'childList')) {
            ensureToolbar();
            insertButtons();
          }
        });

        state.sectionObserver.observe(sec, {
          childList: true,
          subtree: false
        });
      }
    }

    function startSelfHeal() {
      if (state.healTimer) clearInterval(state.healTimer);

      state.healTimer = setInterval(() => {
        if (!document.getElementById('sdh-toolbar')) ensureToolbar();
        insertButtons();
      }, 1500);
    }

    /* ---------- AUTO FLOW ---------- */

    async function maybeAutoFromParams() {
      const q = new URLSearchParams(location.search);
      const given = q.get('sdh_url');

      if (!given) return;

      const input =
        document.getElementById('url') ||
        document.querySelector('input[name="url"]');

      const send =
        document.getElementById('send') ||
        Array.from(document.querySelectorAll('button')).find(
          b => /download/i.test(b.textContent || '')
        );

      if (input && send) {
        input.value = given;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        send.click();
      }

      const auto = q.get('sdh_auto') === '1';
      const open = q.get('sdh_open') === '1';

      if (auto || open) {
        const t0 = Date.now();

        const poll = setInterval(async () => {
          const forms = getTrackForms();

          if (forms.length || Date.now() - t0 > 20000) {
            clearInterval(poll);
            if (auto) await resolveAllParallel();
            if (open) await bulkOpenResolved();
          }
        }, 800);
      }
    }

    function bootstrap() {
      ensureToolbar();
      insertButtons();
      updateCounters();

      watchSection();
      startSelfHeal();

      maybeAutoFromParams();
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bootstrap);
    } else {
      bootstrap();
    }

    window.addEventListener('hashchange', bootstrap);
    window.addEventListener('popstate', bootstrap);
  }

  /* ============================================================
   * ENTRYPOINTS
   * ============================================================ */

  if (isSpotify()) {
    scanSpotify();
    watchSpotify();
  } else if (isSpotiDown()) {
    spotiDownHelper();
  }

})();

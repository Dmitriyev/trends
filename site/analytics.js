(() => {
  if (!globalThis.crypto?.randomUUID) return;
  const root = document.querySelector('#trend-apify');
  if (!root) return;
  const endpoint = '/api/analytics';
  const idleTimeout = 30 * 60 * 1000;
  const activeTimeout = 30 * 1000;
  const mobile = navigator.userAgentData?.mobile || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const device = mobile ? 'mobile' : 'desktop';
  const dialog = root.querySelector('.player-dialog');
  let playerTimer;

  function read(storage, key) {
    try {
      return JSON.parse(window[storage].getItem(key));
    } catch {
      return null;
    }
  }

  function write(storage, key, value) {
    try {
      window[storage].setItem(key, JSON.stringify(value));
    } catch {
      // Browsers with storage disabled can still report the current page.
    }
  }

  const visitorId = read('localStorage', 'trendsVisitor') || crypto.randomUUID();
  write('localStorage', 'trendsVisitor', visitorId);
  const pending = [];
  const candidates = new Map();
  const paginationSeen = new Set();
  const paginationClicked = new Set();
  function paginationContext(button) {
    const panel = button.closest('[data-tab], [data-platform], [role="tabpanel"], section[id], .tab-panel');
    const active = root.querySelector('[role="tab"][aria-selected="true"], .tab.active, .tab.is-active, [data-tab].active');
    const raw = [panel?.dataset.tab, panel?.dataset.platform, panel?.id, active?.dataset.tab, active?.textContent].filter(Boolean).join(' ').toLowerCase();
    const tab = /instagram|инстаграм/.test(raw) ? 'instagram' : /youtube|ютуб/.test(raw) ? 'youtube'
      : /tiktok|тикток/.test(raw) ? 'tiktok' : /trend|тренд/.test(raw) ? 'trends' : 'home';
    const n = Number(button.dataset.page || button.dataset.nextPage || button.closest('[data-page]')?.dataset.page || 1);
    return { tab, page: Number.isSafeInteger(n) && n > 0 ? n : 1 };
  }
  function paginationEvent(kind, button) {
    const { tab, page } = paginationContext(button);
    const key = tab + ':' + page;
    const dedupe = kind === 'pagination_seen' ? paginationSeen : paginationClicked;
    if (dedupe.has(key)) return;
    dedupe.add(key);
    record(kind, 'trends.local', key);
  }

  let session = read('sessionStorage', 'trendsSession');
  let lastInteraction = Date.now();
  let activeSince = lastInteraction;
  let dirty = true;
  let sending = false;

  function source() {
    const campaign = new URLSearchParams(location.search).get('utm_source');
    if (campaign) return campaign.slice(0, 100);
    return document.referrer ? new URL(document.referrer).hostname.slice(0, 100) : 'direct';
  }

  function persist() {
    write('sessionStorage', 'trendsSession', { ...session, seen: [...session.seen] });
  }

  function checkSession(now = Date.now()) {
    if (session && now - session.lastActivity < idleTimeout) return false;
    if (session) flush(true);
    session = {
      id: crypto.randomUUID(), startedAt: now, lastActivity: now, source: source(),
      activeMs: 0, seen: new Set(), depthAtClick: null, moreSeen: false,
    };
    activeSince = now;
    dirty = true;
    paginationSeen.clear();
    paginationClicked.clear();
    for (const element of candidates.keys()) candidates.set(element, performance.now());
    persist();
    return true;
  }

  if (session) session.seen = new Set(session.seen);
  checkSession();

  function tick(now = Date.now()) {
    if (!document.hidden) {
      const activeUntil = dialog?.open ? now : Math.min(now, lastInteraction + activeTimeout);
      const elapsed = Math.max(0, Math.min(activeUntil - activeSince, 15000));
      if (elapsed) {
        session.activeMs += elapsed;
        session.lastActivity = Math.max(session.lastActivity, activeUntil);
        dirty = true;
      }
    }
    activeSince = now;
  }

  function flush(immediate = false) {
    persist();
    if ((!dirty && !pending.length) || (sending && !immediate)) return;
    const events = pending.slice(0, 10);
    const body = JSON.stringify({
      visitorId, sessionId: session.id, startedAt: session.startedAt,
      source: session.source, device, depth: session.seen.size, depthAtClick: session.depthAtClick,
      moreSeen: session.moreSeen, activeMs: session.activeMs, events,
    });
    dirty = false;
    if (immediate) {
      if (navigator.sendBeacon?.(endpoint, body)) pending.splice(0, events.length);
      else {
        pending.splice(0, events.length);
        void fetch(endpoint, { method: 'POST', body, keepalive: true }).catch(() => {});
      }
      return;
    }
    sending = true;
    const ids = new Set(events.map(event => event.id));
    const sessionId = session.id;
    fetch(endpoint, { method: 'POST', body }).then(response => {
      if (!response.ok) throw new Error('Analytics upload failed');
      for (let i = pending.length - 1; i >= 0 && ids.size; i--) {
        if (ids.delete(pending[i].id)) pending.splice(i, 1);
      }
    }).catch(() => {
      if (session.id === sessionId) dirty = true;
    }).finally(() => { sending = false; });
  }

  function interacted() {
    const now = Date.now();
    tick(now);
    const started = checkSession(now);
    lastInteraction = now;
    session.lastActivity = now;
    if (started) flush();
  }

  function record(kind, domain, video = '') {
    interacted();
    pending.push({ id: crypto.randomUUID(), at: Date.now(), kind, domain, video });
    if (pending.length > 10) pending.shift();
    flush(true);
  }

  for (const event of ['pointerdown', 'keydown', 'wheel', 'touchmove', 'scroll']) {
    window.addEventListener(event, interacted, { passive: true, capture: true });
  }

  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.intersectionRatio >= 0.5) candidates.set(entry.target, performance.now());
      else candidates.delete(entry.target);
    }
  }, { threshold: 0.5 });
  for (const element of root.querySelectorAll('article:has(> a.cover), .more')) {
    observer.observe(element);
  }

  function collectVisible(forceButton = false) {
    if (document.hidden || Date.now() - session.lastActivity >= idleTimeout) return;
    for (const [element, since] of candidates) {
      const button = element.matches('.more');
      if (element.closest('[hidden]') || (!(forceButton && button) && performance.now() - since < 1000)) continue;
      if (button) {
        if (!session.moreSeen) dirty = session.moreSeen = true;
        paginationEvent('pagination_seen', element);
        continue;
      }
      const cover = element.querySelector('a.cover[href]');
      if (cover && !session.seen.has(cover.href)) {
        session.seen.add(cover.href);
        dirty = true;
      }
    }
  }

  root.addEventListener('click', event => {
    if (!event.target.closest('.more')) return;
    interacted();
    paginationEvent('pagination_clicked', event.target.closest('.more'));
    if (session.depthAtClick !== null) return;
    collectVisible(true);
    session.moreSeen = true;
    session.depthAtClick = session.seen.size;
    flush(true);
  }, { capture: true });

  function outbound(event) {
    if (event.defaultPrevented || (event.type === 'auxclick' && event.button !== 1)) return;
    const link = event.target.closest('a[href]');
    if (!link) return;
    const url = new URL(link.href);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin === location.origin) return;
    record('outbound_click', url.hostname.replace(/^www\./, ''));
  }

  document.addEventListener('click', outbound);
  document.addEventListener('auxclick', outbound);

  document.addEventListener('visibilitychange', () => {
    const now = Date.now();
    if (document.hidden) {
      // The visibility flag has already changed, so accrue the last foreground interval here.
      const end = dialog?.open ? now : Math.min(now, lastInteraction + activeTimeout);
      const elapsed = Math.max(0, Math.min(end - activeSince, 15000));
      session.activeMs += elapsed;
      if (elapsed) session.lastActivity = Math.max(session.lastActivity, end);
      if (elapsed) dirty = true;
      activeSince = now;
      clearTimeout(playerTimer);
      flush(true);
    } else {
      activeSince = now;
      for (const element of candidates.keys()) candidates.set(element, performance.now());
      interacted();
      trackOpenPlayer();
    }
  });
  window.addEventListener('pagehide', () => {
    clearTimeout(playerTimer);
    tick();
    flush(true);
  });
  setInterval(() => { tick(); collectVisible(); }, 500);
  setInterval(() => flush(), 15000);
  flush();

  function trackOpenPlayer() {
    clearTimeout(playerTimer);
    const frame = dialog?.querySelector('iframe.player-frame');
    if (!frame || !dialog.open || document.hidden) return;
    const url = new URL(frame.src);
    const domain = url.hostname.replace(/^www\./, '');
    const parts = url.pathname.split('/').filter(Boolean);
    const id = domain === 'instagram.com' ? parts[1] : parts.at(-1);
    if (!['youtube.com', 'tiktok.com', 'instagram.com'].includes(domain) || !id) return;
    playerTimer = setTimeout(() => {
      if (dialog.open && frame.isConnected && !document.hidden) {
        record('player_open_3s', domain, domain + ':' + id);
      }
    }, 3000);
  }

  if (dialog) {
    // The feed adds a new frame each time the dialog opens.
    new MutationObserver(trackOpenPlayer).observe(dialog, { childList: true });
    dialog.addEventListener('close', () => {
      if (!dialog.open) clearTimeout(playerTimer);
    });
  }
})();

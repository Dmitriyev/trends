(() => {
  if (!globalThis.crypto?.randomUUID) return;
  const root = document.querySelector('#trend-apify');
  if (!root) return;
  const endpoint = '/api/analytics';
  const idleTimeout = 30 * 60 * 1000;
  const activeTimeout = 30 * 1000;

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
  let session = read('sessionStorage', 'trendsSession');
  let lastInteraction = Date.now();
  let activeSince = lastInteraction;
  let playing = false;
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
    for (const element of candidates.keys()) candidates.set(element, performance.now());
    persist();
    return true;
  }

  if (session) session.seen = new Set(session.seen);
  checkSession();

  function tick(now = Date.now()) {
    if (!document.hidden) {
      const activeUntil = playing ? now : Math.min(now, lastInteraction + activeTimeout);
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
      source: session.source, depth: session.seen.size, depthAtClick: session.depthAtClick,
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
      const end = playing ? now : Math.min(now, lastInteraction + activeTimeout);
      const elapsed = Math.max(0, Math.min(end - activeSince, 15000));
      session.activeMs += elapsed;
      if (elapsed) session.lastActivity = Math.max(session.lastActivity, end);
      if (elapsed) dirty = true;
      activeSince = now;
      flush(true);
    } else {
      activeSince = now;
      for (const element of candidates.keys()) candidates.set(element, performance.now());
      interacted();
    }
  });
  window.addEventListener('pagehide', () => {
    tick();
    flush(true);
  });
  setInterval(() => { tick(); collectVisible(); }, 500);
  setInterval(() => flush(), 15000);
  flush();

  let youtubeApi;
  function loadYouTube() {
    if (window.YT?.Player) return Promise.resolve();
    youtubeApi ??= new Promise(resolve => {
      window.onYouTubeIframeAPIReady = resolve;
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.onerror = () => { youtubeApi = undefined; script.remove(); };
      document.head.append(script);
    });
    return youtubeApi;
  }

  function trackPlayer(frame, host, id, dialog) {
    const video = host + ':' + id;
    let previous;
    let watched = 0;
    let lastSession = session.id;
    let reported = false;
    let polling;
    let player;

    function state(isPlaying) {
      if (playing !== isPlaying) tick();
      playing = isPlaying;
      if (!playing) previous = undefined;
      if (playing && !document.hidden) interacted();
    }

    function progress(time) {
      if (!playing || document.hidden || !Number.isFinite(time)) {
        previous = undefined;
        return;
      }
      if (lastSession !== session.id) {
        lastSession = session.id;
        previous = undefined;
        watched = 0;
        reported = false;
      }
      const now = performance.now();
      const delta = time - previous?.time;
      const elapsed = (now - previous?.now) / 1000;
      if (delta > 0 && delta <= elapsed * 4 + 0.35) watched += Math.min(delta, elapsed);
      previous = { time, now };
      if (!reported && watched >= 3) {
        reported = true;
        record('video_view', host, video);
      }
    }

    function message(event) {
      if (event.source !== frame.contentWindow || event.origin !== 'https://www.tiktok.com') return;
      const data = event.data;
      if (!data?.['x-tiktok-player']) return;
      if (data.type === 'onStateChange') state(data.value === 1);
      if (data.type === 'onCurrentTime') progress(data.value?.currentTime);
      if (data.type === 'onPlayerError') state(false);
    }

    if (host === 'tiktok.com') window.addEventListener('message', message);
    else void loadYouTube().then(() => {
      if (!frame.isConnected || !dialog.open) return;
      player = new window.YT.Player(frame, {
        events: {
          onStateChange: event => state(event.data === 1),
          onError: () => state(false),
        },
      });
      polling = setInterval(() => progress(player.getCurrentTime?.()), 250);
    });

    dialog.addEventListener('close', () => {
      state(false);
      clearInterval(polling);
      window.removeEventListener('message', message);
      player?.destroy?.();
    }, { once: true });
  }

  const dialog = root.querySelector('.player-dialog');
  if (dialog) {
    new MutationObserver(records => {
      for (const record of records) {
        for (const frame of record.addedNodes) {
          if (!(frame instanceof HTMLIFrameElement) || !frame.isConnected) continue;
          const url = new URL(frame.src);
          if (url.origin === 'https://www.youtube.com' && /^\/embed\/[\w-]{11}$/.test(url.pathname)) {
            url.searchParams.set('enablejsapi', '1');
            url.searchParams.set('origin', location.origin);
            frame.src = url.href;
            trackPlayer(frame, 'youtube.com', url.pathname.split('/').at(-1), dialog);
          } else if (url.origin === 'https://www.tiktok.com' && /^\/player\/v1\/\d+$/.test(url.pathname)) {
            trackPlayer(frame, 'tiktok.com', url.pathname.split('/').at(-1), dialog);
          }
        }
      }
    }).observe(dialog, { childList: true });
  }
})();

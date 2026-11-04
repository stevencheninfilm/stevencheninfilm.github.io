/* A preview starts immediately. A fully downloaded, decoded HD file replaces it
 * without replacing the media element or its existing transport listeners. */
(function (root, factory) {
  const exported = factory();
  if (typeof module === 'object' && module.exports) module.exports = exported;
  if (root?.document) root.ProgressiveVideo = exported.install(root);
})(typeof window === 'object' ? window : globalThis, () => {
  'use strict';

  const MAX_FILE_BYTES = 64 * 1024 * 1024;
  const MAX_GROUP_BYTES = 96 * 1024 * 1024;
  const MAX_HELD_BYTES = 192 * 1024 * 1024;
  const abortError = () => Object.assign(new Error('HD request is no longer current'), { name: 'AbortError' });
  const snapshot = video => ({
    time: Number.isFinite(video.currentTime) ? video.currentTime : 0,
    paused: video.paused, muted: video.muted, volume: video.volume,
    playbackRate: video.playbackRate, defaultMuted: video.defaultMuted,
    loop: video.loop, src: video.currentSrc || video.getAttribute('src') || video.src
  });
  const safeTime = (time, video) => Number.isFinite(video.duration)
    ? Math.max(0, Math.min(time, Math.max(0, video.duration - .04))) : Math.max(0, time);
  const applySettings = (video, state) => {
    for (const name of ['defaultMuted', 'muted', 'volume', 'playbackRate', 'loop']) {
      if (video[name] !== state[name]) video[name] = state[name];
    }
  };

  function waitForFrame(video, getTime, { signal, timeout = 15000, setTimer = setTimeout, clearTimer = clearTimeout, checkInitially = true } = {}) {
    return new Promise((resolve, reject) => {
      let timer, metadataSeen = false, finished = false;
      const events = ['loadedmetadata', 'loadeddata', 'canplay', 'seeked', 'timeupdate'];
      const cleanup = () => {
        clearTimer(timer);
        events.forEach(name => video.removeEventListener(name, check));
        video.removeEventListener('error', failed);
        signal?.removeEventListener('abort', canceled);
      };
      const done = error => {
        if (finished) return;
        finished = true; cleanup(); error ? reject(error) : resolve();
      };
      const failed = () => done(new Error('HD media could not decode'));
      const canceled = () => done(abortError());
      const check = () => {
        if (signal?.aborted) return canceled();
        if (video.error) return failed();
        if (video.readyState < 1) return;
        const target = safeTime(getTime(), video);
        // Seek only if needed: seeking to an unchanged time can stall Safari.
        if (!metadataSeen || Math.abs(video.currentTime - target) > .08) {
          metadataSeen = true;
          if (Math.abs(video.currentTime - target) > .04) {
            try { video.currentTime = target; } catch (error) { done(error); return; }
          }
        }
        if (video.readyState >= 2 && !video.seeking && Math.abs(video.currentTime - target) <= .1) done();
      };
      events.forEach(name => video.addEventListener(name, check));
      video.addEventListener('error', failed);
      signal?.addEventListener('abort', canceled, { once: true });
      timer = setTimer(() => done(new Error('HD decoder timed out')), timeout);
      if (checkInitially) check();
    });
  }

  async function fetchBlob(url, { fetcher, signal, limit = MAX_FILE_BYTES, BlobClass = Blob }) {
    const response = await fetcher(url, { signal, cache: 'force-cache', credentials: 'same-origin', priority: 'low' });
    if (!response.ok || response.type === 'opaque') throw new Error('HD download failed');
    const declared = Number(response.headers?.get('content-length'));
    if (declared > limit) throw new Error('HD file exceeds memory budget');
    if (!response.body?.getReader) {
      const blob = await response.blob();
      if (signal.aborted) throw abortError();
      if (!blob.size || blob.size > limit) throw new Error('Invalid HD file size');
      return blob;
    }
    const reader = response.body.getReader(), chunks = [];
    let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (signal.aborted) throw abortError();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > limit) throw new Error('HD file exceeds memory budget');
        chunks.push(value);
      }
    } catch (error) {
      await reader.cancel().catch(() => {});
      throw error;
    } finally { reader.releaseLock(); }
    if (!bytes) throw new Error('Empty HD file');
    return new BlobClass(chunks, { type: response.headers?.get('content-type') || 'video/mp4' });
  }

  // Kept separate from DOM discovery so transaction behavior can be tested with
  // media doubles, including asynchronous errors and abandoned downloads.
  function createTransaction(options) {
    const { videos, sources, fetcher, createDecoder, createURL, revokeURL,
      onState = () => {}, canCommit = () => true, makeCover = () => () => {},
      setTimer = setTimeout, clearTimer = clearTimeout,
      fileLimit = MAX_FILE_BYTES, groupLimit = MAX_GROUP_BYTES,
      AbortControllerClass = AbortController, BlobClass = Blob } = options;
    const controller = new AbortControllerClass();
    const signal = controller.signal;
    const urls = [], decoders = [], covers = [];
    const intents = new Map();
    const pendingInternalPauses = new Map();
    const nativeListeners = [];
    let state = 'idle', committed = false, disposed = false, byteSize = 0;
    const publish = (next, extra = {}) => { state = next; return onState(next, { videos, intents, byteSize, ...extra }); };
    const assertCurrent = () => { if (signal.aborted || !canCommit()) throw abortError(); };
    const releaseDecoders = () => {
      decoders.splice(0).forEach(video => {
        video.pause(); video.removeAttribute('src'); video.load(); video.remove?.();
      });
    };
    const releaseUrls = () => urls.splice(0).forEach(revokeURL);
    const removeCovers = () => covers.splice(0).forEach(remove => remove());
    const frameOptions = { signal, setTimer, clearTimer };
    const master = videos[videos.length - 1];
    const pauseForSourceChange = video => {
      if (!video.paused && !pendingInternalPauses.get(video)) pendingInternalPauses.set(video, 1);
      video.pause();
    };
    const setIntent = (video, patch) => {
      if (state !== 'switching' && state !== 'restoring') return false;
      const targets = videos.length > 1 && ('time' in patch || 'paused' in patch) ? videos : [video];
      targets.forEach(target => {
        const intent = intents.get(target);
        Object.assign(intent, patch);
        // Media-property events are queued, so apply explicit controls now.
        // An older queued event then reads the latest actual property value.
        applySettings(target, intent);
        if ('time' in patch && target.readyState >= 1) {
          const time = safeTime(intent.time, target);
          if (Math.abs(target.currentTime - time) > .04) {
            try { target.currentTime = time; } catch (_) {}
          }
        }
      });
      return true;
    };
    videos.forEach(video => {
      const capture = event => {
        if (!['switching', 'restoring'].includes(state) || !intents.has(video)) return;
        const intent = intents.get(video);
        if (event.type === 'pause') {
          const pending = pendingInternalPauses.get(video) || 0;
          if (pending) { pendingInternalPauses.set(video, pending - 1); return; }
          const targets = videos.length > 1 ? videos : [video];
          targets.forEach(target => { intents.get(target).paused = true; });
        } else if (event.type === 'play') {
          const targets = videos.length > 1 ? videos : [video];
          targets.forEach(target => { intents.get(target).paused = false; });
        } else if (event.type === 'volumechange') {
          intent.muted = video.muted; intent.volume = video.volume;
        } else if (event.type === 'ratechange') {
          intent.playbackRate = video.playbackRate;
        } else if (event.type === 'seeking' && video.readyState >= 1 && Math.abs(video.currentTime - intent.time) > .1) {
          const targets = videos.length > 1 ? videos : [video];
          targets.forEach(target => { intents.get(target).time = video.currentTime; });
        }
      };
      for (const name of ['pause', 'play', 'volumechange', 'ratechange', 'seeking']) {
        video.addEventListener(name, capture); nativeListeners.push([video, name, capture]);
      }
    });
    const removeNativeListeners = () => nativeListeners.splice(0).forEach(([video, name, listener]) => video.removeEventListener(name, listener));
    const resume = async () => {
      if (!canCommit()) return;
      await Promise.allSettled(videos.map(video => {
        const intent = intents.get(video);
        applySettings(video, intent);
        if (intent.paused) { video.pause(); return Promise.resolve(); }
        return Promise.resolve(video.play());
      }));
    };
    const replaceSources = async (sourcesToUse, useSignal) => {
      const pending = videos.map((video, index) => {
        const ready = waitForFrame(video, () => intents.get(video).time,
          { ...frameOptions, signal: useSignal ? signal : undefined, checkInitially: false });
        // Install all readiness listeners before loading any source. No member
        // is resumed until Promise.all confirms the whole comparison is ready.
        return { video, source: sourcesToUse[index], ready };
      });
      pending.forEach(({ video, source }) => {
        pauseForSourceChange(video); video.src = source; video.load(); applySettings(video, intents.get(video));
      });
      await Promise.all(pending.map(item => item.ready));
      // Explicit transport changes during decode may have moved the desired
      // position again; wait for that final position before revealing HD.
      await Promise.all(videos.map(video => waitForFrame(video, () => intents.get(video).time,
        { ...frameOptions, signal: useSignal ? signal : undefined })));
    };

    return {
      get state() { return state; }, get byteSize() { return byteSize; },
      getIntent(video) { return { ...(intents.get(video) || snapshot(video)) }; },
      setIntent,
      abort() { controller.abort(); },
      dispose() { disposed = true; controller.abort(); releaseDecoders(); removeCovers(); releaseUrls(); removeNativeListeners(); },
      async run() {
        const deadline = setTimer(() => controller.abort(), 120000);
        let snapshots;
        try {
          publish('loading');
          // Fetch sequentially within the one active group, so an HD comparison
          // never opens competing full-file requests before preview playback.
          for (const source of sources) {
            assertCurrent();
            const blob = await fetchBlob(source, { fetcher, signal, limit: fileLimit, BlobClass });
            byteSize += blob.size;
            if (byteSize > groupLimit) throw new Error('HD group exceeds memory budget');
            urls.push(createURL(blob));
          }
          assertCurrent();
          // Validate every file before touching a visible preview. This catches
          // unsupported or damaged HD sources while preview keeps playing.
          for (const url of urls) {
            assertCurrent();
            const decoder = createDecoder(); decoders.push(decoder);
            decoder.muted = true; decoder.preload = 'auto'; decoder.playsInline = true;
            const time = master.currentTime;
            const ready = waitForFrame(decoder, () => time, frameOptions);
            decoder.src = url; decoder.load(); await ready;
          }
          assertCurrent();
          snapshots = videos.map(snapshot);
          const time = snapshots[snapshots.length - 1].time;
          videos.forEach((video, index) => intents.set(video, { ...snapshots[index], time }));
          // The start listeners may pause the pair before this transaction does.
          // Both are internal pauses, and native pause events are asynchronous.
          videos.forEach(video => pendingInternalPauses.set(video, video.paused ? 0 : 1));
          // All group flags and the start event are published before any pause,
          // source, metadata or seeking events can reach a synchronizer.
          publish('switching');
          assertCurrent();
          videos.forEach(video => covers.push(makeCover(video)));
          releaseDecoders();
          await replaceSources(urls, true);
          assertCurrent();
          committed = true;
          const playback = publish('hd');
          if (!playback?.handled) await resume();
          removeCovers();
          return { quality: 'hd', bytes: byteSize, urls: [...urls] };
        } catch (error) {
          if (snapshots && !disposed) {
            publish('restoring');
            if (canCommit()) {
              try { await replaceSources(snapshots.map(item => item.src), false); }
              catch (_) { /* Keep the native retry controls and original source. */ }
            } else {
              // Background tabs may suspend media decoding. Restore their low
              // sources without holding up the newly visible group's queue.
              videos.forEach((video, index) => {
                pauseForSourceChange(video);
                video.addEventListener('loadedmetadata', () => {
                  const intent = intents.get(video);
                  applySettings(video, intent);
                  try { video.currentTime = safeTime(intent.time, video); } catch (_) {}
                }, { once: true });
                video.src = snapshots[index].src;
                video.load(); applySettings(video, intents.get(video));
              });
            }
          }
          if (!disposed) {
            const playback = publish('preview', { error });
            if (snapshots && !playback?.handled) await resume();
          }
          removeCovers();
          releaseUrls();
          throw error;
        } finally {
          clearTimer(deadline); releaseDecoders(); removeNativeListeners();
          if (!committed) releaseUrls();
        }
      }
    };
  }

  function install(win) {
    const doc = win.document;
    const entries = [...doc.querySelectorAll('video[data-src-hd]')];
    const groups = [], byVideo = new WeakMap(), byRoot = new Map();
    let active = null, timer = null, stopped = false, heldBytes = 0;
    const roots = new Set();
    const setTimer = win.setTimeout.bind(win), clearTimer = win.clearTimeout.bind(win);
    const sourceFor = video => new URL(video.dataset.srcHd, doc.baseURI).href;
    const event = (group, name, extra = {}) => {
      const detail = { videos: group.videos, ...extra };
      group.root.dispatchEvent(new win.CustomEvent(`progressive-video:${name}`, { bubbles: true, detail }));
      return detail;
    };
    entries.forEach(video => {
      const root = video.closest('[data-progressive-group]') || video;
      let group = byRoot.get(root);
      if (!group) {
        group = { root, videos: [], quality: 'preview', transaction: null, failures: 0, attempts: 0,
          readyAt: 0, started: false, previewFailed: false, visible: !win.IntersectionObserver, bytes: 0 };
        groups.push(group); byRoot.set(root, group); roots.add(root);
      }
      group.videos.push(video); byVideo.set(video, group);
    });
    const current = group => {
      if (doc.hidden || stopped || win.navigator.onLine === false || !group.visible || !group.root.isConnected) return false;
      const card = group.root.closest('.deck-card');
      if (card && (!(card.classList.contains('is-active') || card.classList.contains('is-slide-layer'))
          || card.closest('.project-deck')?.classList.contains('is-strip')
          || doc.body.classList.contains('is-v3-loading'))) return false;
      if (group.root.closest('[aria-hidden="true"], [hidden]')) return false;
      const rect = group.videos[0].getBoundingClientRect();
      const style = win.getComputedStyle(group.videos[0]);
      return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < win.innerHeight
        && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const mark = (group, state) => {
      group.root.dataset.progressiveState = state;
      group.videos.forEach(video => {
        video.dataset.progressiveState = state;
        video.dataset.progressiveSwitching = String(state === 'switching' || state === 'restoring');
      });
    };
    const makeCover = video => {
      let canvas;
      try {
        if (!video.videoWidth || !video.videoHeight || !video.parentElement) return () => {};
        canvas = doc.createElement('canvas');
        // An HD or retina-sized canvas is unnecessary for a brief hold frame.
        const scale = Math.min(1, 1280 / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.setAttribute('aria-hidden', 'true'); canvas.dataset.progressiveCover = '';
        Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%',
          pointerEvents: 'none', objectFit: win.getComputedStyle(video).objectFit || 'cover', zIndex: '1' });
        video.parentElement.insertBefore(canvas, video.nextSibling);
      } catch (_) { canvas?.remove(); }
      return () => canvas?.remove();
    };
    const refreshReady = group => {
      if (group.started || !group.videos.every(video => video.readyState >= 2 && (video.currentSrc || video.getAttribute('src')))) return;
      group.started = true;
      // The first preview frame gets a quiet interval before HD can use the
      // connection; save-data/slow links delay HD rather than disabling it.
      const connection = win.navigator.connection || win.navigator.mozConnection || win.navigator.webkitConnection;
      const slow = connection?.saveData || /(^|-)2g$|3g/.test(connection?.effectiveType || '');
      group.readyAt = Date.now() + (slow ? 4000 : 1200);
    };
    // currentSrc may keep its old URL briefly after the preview owner removes
    // src to cancel a departed request. Only attached sources authorize work.
    const hasLoadedSources = group => group.videos.every(video => video.getAttribute('src')
      || video.querySelector?.('source[src]')?.getAttribute('src'));
    const hasPreviewFrame = group => hasLoadedSources(group) && group.videos.every(video => video.readyState >= 2);
    const start = async group => {
      active = group; group.attempts++;
      const room = MAX_HELD_BYTES - heldBytes;
      const transaction = createTransaction({
        videos: group.videos, sources: group.videos.map(sourceFor),
        fetcher: win.fetch.bind(win), createDecoder: () => doc.createElement('video'),
        createURL: blob => win.URL.createObjectURL(blob), revokeURL: url => win.URL.revokeObjectURL(url),
        canCommit: () => current(group), makeCover, setTimer, clearTimer,
        groupLimit: Math.min(MAX_GROUP_BYTES, room),
        AbortControllerClass: win.AbortController, BlobClass: win.Blob,
        onState(state, detail) {
          mark(group, state);
          if (state === 'switching') event(group, 'switch-start', {
            time: detail.intents.get(group.videos.at(-1))?.time || 0,
            playing: !detail.intents.get(group.videos.at(-1))?.paused,
            recovery: group.previewFailed
          });
          if (state === 'hd') {
            group.quality = 'hd';
            group.previewFailed = false;
            group.videos.forEach(video => { video.dataset.progressiveQuality = 'hd'; });
            return event(group, 'switch-end', { quality: 'hd', handled: false });
          }
          if (state === 'preview' && detail.error) return event(group, 'switch-error', {
            reason: detail.error.name === 'AbortError' ? 'canceled' : 'unavailable', handled: false
          });
        }
      });
      group.transaction = transaction;
      try {
        const result = await transaction.run();
        group.bytes = result.bytes; heldBytes += result.bytes;
      } catch (error) {
        if (error.name !== 'AbortError') group.failures++;
        mark(group, 'preview');
        transaction.dispose(); group.transaction = null;
      } finally {
        if (active === group) active = null;
        schedule(50);
      }
    };
    const pump = () => {
      timer = null;
      if (stopped) return;
      if (active) {
        if (!current(active)) active.transaction?.abort();
        return;
      }
      let nextDelay = Infinity;
      for (const group of groups) {
        if (group.quality === 'hd' || group.failures >= 2 || group.attempts >= 6 || !current(group)) continue;
        // A departed preview may have been unloaded by its owner. The earlier
        // readyAt timestamp must not let HD outrun its first frame on return.
        if (!hasPreviewFrame(group) && !(group.previewFailed && hasLoadedSources(group))) continue;
        refreshReady(group);
        if (!group.started) continue;
        const remaining = group.readyAt - Date.now();
        if (remaining > 0) { nextDelay = Math.min(nextDelay, remaining); continue; }
        if (heldBytes >= MAX_HELD_BYTES) continue;
        start(group); return;
      }
      if (Number.isFinite(nextDelay)) schedule(nextDelay + 10);
    };
    function schedule(delay = 0) {
      if (stopped) return;
      if (timer !== null) clearTimer(timer);
      timer = setTimer(pump, delay);
    }
    groups.forEach(group => {
      mark(group, 'preview');
      group.videos.forEach(video => {
        for (const name of ['loadeddata', 'playing', 'canplay', 'play']) video.addEventListener(name, () => schedule());
      });
    });
    let intersection;
    if (win.IntersectionObserver) {
      intersection = new win.IntersectionObserver(records => {
        records.forEach(record => { const group = byRoot.get(record.target); if (group) group.visible = record.isIntersecting; });
        schedule();
      }, { threshold: .01 });
      roots.forEach(root => intersection.observe(root));
    }
    const mutation = new win.MutationObserver(() => schedule());
    mutation.observe(doc.body, { subtree: true, attributes: true, attributeFilter: ['class', 'aria-hidden', 'hidden'] });
    doc.addEventListener('video-loader:preview-failed', e => {
      const failed = e.detail?.videos;
      if (!Array.isArray(failed)) return;
      const matching = new Set(failed.map(video => byVideo.get(video)).filter(Boolean));
      matching.forEach(group => {
        if (group.quality === 'hd' || !current(group) || !hasLoadedSources(group)
          || !group.videos.every(video => failed.includes(video))
          || ['switching', 'restoring'].includes(group.transaction?.state)) return;
        // Only the preview owner's explicit timeout/error can bypass the first
        // frame gate. An ordinary slow preview still gets the connection first.
        group.previewFailed = true;
        group.started = true;
        group.readyAt = Math.min(group.readyAt || Infinity, Date.now() + 200);
        schedule(200);
      });
    });
    doc.addEventListener('visibilitychange', () => schedule());
    win.addEventListener('online', () => schedule());
    win.addEventListener('resize', () => schedule());
    win.addEventListener('pagehide', e => {
      active?.transaction?.abort();
      if (e.persisted) return;
      stopped = true; if (timer !== null) clearTimer(timer);
      intersection?.disconnect(); mutation.disconnect();
      groups.forEach(group => group.transaction?.dispose());
    });
    win.addEventListener('pageshow', () => schedule());
    schedule();
    return {
      isSwitching(target) { const group = byVideo.get(target) || byRoot.get(target); return ['switching', 'restoring'].includes(group?.transaction?.state); },
      getIntent(video) { return byVideo.get(video)?.transaction?.getIntent(video) || snapshot(video); },
      setIntent(video, patch) { return byVideo.get(video)?.transaction?.setIntent(video, patch) || false; },
      refresh: () => schedule(),
      get status() { return groups.map(group => ({ quality: group.quality, state: group.transaction?.state || 'idle', attempts: group.attempts, bytes: group.bytes })); }
    };
  }
  return { install, createTransaction, waitForFrame, fetchBlob, snapshot };
});

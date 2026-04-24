// =========================
// CONFIG
// =========================

const API_BASE = 'http://127.0.0.1:5000';

const CONTINUE_STORAGE_KEY = 'streambox_continue_watching';
const PLAYER_PREFS_STORAGE_KEY = 'streambox_player_preferences';

// =========================
// CONTINUE WATCHING STORAGE
// =========================

function loadContinueWatching() {
    try {
        const parsed = JSON.parse(localStorage.getItem(CONTINUE_STORAGE_KEY) || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

function saveContinueWatching(items) {
    localStorage.setItem(CONTINUE_STORAGE_KEY, JSON.stringify(Array.isArray(items) ? items : []));
}

// =========================
// PLAYER PREFERENCES STORAGE
// =========================

const DEFAULT_PLAYER_PREFS = {
    autoplayNextEpisodeEnabled: true,
    preferredQuality: null,
    preferredSubtitleLanguage: 'off',
    preferredTranslatorId: null,
    preferredFitMode: 'contain',
    subtitleLanguageBySource: {}
};

const QUALITY_FALLBACK_ORDER = [
    "4K",
    "2K",
    "1080p Ultra",
    "1080p",
    "720p",
    "480p",
    "360p"
];

function loadPlayerPrefs() {
    try {
        const parsed = JSON.parse(localStorage.getItem(PLAYER_PREFS_STORAGE_KEY) || '{}');
        return {
            ...DEFAULT_PLAYER_PREFS,
            preferredQuality: parsed?.preferredQuality || DEFAULT_PLAYER_PREFS.preferredQuality,
            preferredSubtitleLanguage: parsed?.preferredSubtitleLanguage || DEFAULT_PLAYER_PREFS.preferredSubtitleLanguage,
            preferredTranslatorId: parsed?.preferredTranslatorId || DEFAULT_PLAYER_PREFS.preferredTranslatorId,
            preferredFitMode: parsed?.preferredFitMode || DEFAULT_PLAYER_PREFS.preferredFitMode,
            autoplayNextEpisodeEnabled: parsed?.autoplayNextEpisodeEnabled ?? DEFAULT_PLAYER_PREFS.autoplayNextEpisodeEnabled
        };
    } catch (e) {
        return {...DEFAULT_PLAYER_PREFS};
    }
}

function savePlayerPrefs() {
    try {
        localStorage.setItem(PLAYER_PREFS_STORAGE_KEY, JSON.stringify({
            preferredQuality: playerPrefs.preferredQuality || null,
            preferredSubtitleLanguage: playerPrefs.preferredSubtitleLanguage || 'off',
            preferredTranslatorId: playerPrefs.preferredTranslatorId || null,
            preferredFitMode: playerPrefs.preferredFitMode || 'contain',
            autoplayNextEpisodeEnabled: !!playerPrefs.autoplayNextEpisodeEnabled
        }));
    } catch (e) {
    }
}

function updatePlayerPreference(key, value) {
    playerPrefs[key] = value;
    savePlayerPrefs();
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
}

function safeImageUrl(value) {
    const url = String(value || '').trim();
    if (!/^https?:\/\//i.test(url)) return '';
    return url.replace(/[\n\r"'\\()]/g, encodeURIComponent);
}

function backgroundImageStyle(url, extra = '') {
    const safeUrl = safeImageUrl(url);
    const style = `${safeUrl ? `background-image:url(${safeUrl});` : ''}${extra}`;
    return style ? `style="${escapeAttr(style)}"` : '';
}

function getStoredSubtitleLanguageForSource(sourceUrl) {
    return playerPrefs.preferredSubtitleLanguage || 'off';
}

function updateSubtitleLanguageForSource(sourceUrl, language) {
    updatePlayerPreference('preferredSubtitleLanguage', language || 'off');
}

function setElementStyles(el, styles) {
    if (el) Object.assign(el.style, styles);
}

function clearElementStyles(el, styles) {
    if (!el) return;
    Object.keys(styles).forEach(key => {
        el.style[key] = '';
    });
}

function clearFocusedState() {
    document.querySelectorAll('.focus').forEach(node => node.classList.remove('focus'));
}

function getVisibleFocusables(selector) {
    return Array.from(document.querySelectorAll(selector))
        .filter(node => node.offsetParent !== null);
}

function setFocusedElement(target, {
    selector = `#screen-${currentScreen} [data-focusable="true"], .sidebar [data-focusable="true"]`,
    focus = false,
    ensureVisible = true
} = {}) {
    const nextFocusables = getVisibleFocusables(selector);
    if (!nextFocusables.length) return null;

    const nextIndex = Math.max(0, nextFocusables.findIndex(node => node === target));
    clearFocusedState();
    focusables = nextFocusables;
    focusIndex = nextIndex;

    const active = focusables[focusIndex];
    if (!active) return null;

    active.classList.add('focus');
    if (focus) active.focus?.();
    if (ensureVisible) ensureFocusedElementVisible(active);
    return active;
}

function focusFirstScreenFocusable(screen) {
    const first = document.querySelector(`#screen-${screen} [data-focusable="true"]`);
    if (first) setFocusedElement(first);
}

async function fetchJson(endpoint, errorMessage, {params, init} = {}) {
    const query = params ? `?${new URLSearchParams(params).toString()}` : '';
    const res = await fetch(`${API_BASE}${endpoint}${query}`, init);
    if (!res.ok) throw new Error(errorMessage);
    return await res.json();
}

function buildStreamUrl({url, translation, season, episode}) {
    const params = new URLSearchParams({url});
    if (season && episode) {
        params.set('season', String(season));
        params.set('episode', String(episode));
    }
    if (translation) params.set('translation', String(translation));
    return `${API_BASE}/stream?${params.toString()}`;
}

function isSupportedQualityLabel(quality) {
    return /^(?:\d{3,4}p(?:\s+Ultra)?|[248]K)$/i.test(String(quality || "").trim());
}

function getQualityOrder(quality) {
    const value = String(quality || "").trim().toLowerCase();
    return {
        "360p": 1,
        "480p": 2,
        "720p": 3,
        "1080p": 4,
        "1080p ultra": 5,
        "2k": 6,
        "4k": 7
    }[value] || 999;
}

function getStreamQualityEntries(streams = currentStreams) {
    return Object.entries(streams || {})
        .filter(([quality, url]) =>
            url &&
            typeof url === "string" &&
            /^https?:\/\//i.test(url) &&
            isSupportedQualityLabel(quality) &&
            !["translator_id", "season", "episode"].includes(String(quality))
        )
        .sort((a, b) => getQualityOrder(a[0]) - getQualityOrder(b[0]));
}

function pickStreamByQuality(streams, preferredQuality) {
    const priority = [
        preferredQuality,
        playerPrefs.preferredQuality,
        ...QUALITY_FALLBACK_ORDER
    ].filter(Boolean);

    for (const quality of priority) {
        if (streams?.[quality]) return {quality, url: streams[quality]};
    }

    const entries = getStreamQualityEntries(streams);
    const fallback = entries[entries.length - 1];
    return fallback ? {quality: fallback[0], url: fallback[1]} : {quality: null, url: ""};
}

function getPlayerLayoutElements() {
    return {
        html: document.documentElement,
        body: document.body,
        sidebar: document.querySelector('.sidebar'),
        main: document.querySelector('.main'),
        screen: document.getElementById('screen-player'),
        stage: document.getElementById('player-stage'),
        wrap: document.querySelector('#screen-player .player-wrap'),
        overlay: document.getElementById('player-ui-overlay'),
        video: document.getElementById('player-video')
    };
}

function getPlayerLayoutStyles(viewportHeight = `${window.innerHeight}px`) {
    return {
        html: {width: '100%', height: '100%', overflow: 'hidden', margin: '0', padding: '0'},
        body: {width: '100%', height: '100%', minHeight: viewportHeight, overflow: 'hidden', margin: '0', padding: '0', background: '#000'},
        main: {
            position: 'fixed', inset: '0', left: '0', top: '0', width: '100vw', height: viewportHeight,
            minHeight: viewportHeight, maxWidth: '100vw', maxHeight: viewportHeight, margin: '0',
            padding: '0', overflow: 'hidden', background: '#000'
        },
        screen: {
            position: 'fixed', inset: '0', left: '0', top: '0', width: '100vw', height: viewportHeight,
            minHeight: viewportHeight, maxWidth: '100vw', maxHeight: viewportHeight, padding: '0',
            margin: '0', zIndex: '2000', overflow: 'hidden', background: '#000'
        },
        wrap: {
            position: 'absolute', inset: '0', left: '0', top: '0', width: '100vw', height: viewportHeight,
            minHeight: viewportHeight, maxWidth: '100vw', maxHeight: viewportHeight, padding: '0',
            margin: '0', overflow: 'hidden', background: '#000'
        },
        stage: {
            position: 'absolute', inset: '0', left: '0', top: '0', width: '100vw', height: viewportHeight,
            minHeight: viewportHeight, maxWidth: '100vw', maxHeight: viewportHeight, zIndex: '2001',
            overflow: 'hidden', background: '#000'
        },
        video: {
            position: 'absolute', inset: '0', left: '0', top: '0', width: '100%', height: '100%',
            minWidth: '0', minHeight: '0', maxWidth: 'none', maxHeight: 'none', display: 'block',
            margin: '0', padding: '0', borderRadius: '0', objectPosition: 'center center',
            objectFit: 'contain', transformOrigin: 'center center', transform: 'scale(1)', background: '#000'
        },
        overlay: {
            position: 'absolute', inset: '0', display: 'flex', flexDirection: 'column',
            justifyContent: 'space-between', opacity: '1', visibility: 'visible',
            pointerEvents: 'auto', transition: 'opacity 220ms ease, visibility 220ms ease', zIndex: '2002'
        }
    };
}


function continueEntryKey(entry) {
    if (!entry) return 'empty____';
    return `${entry.sourceUrl || ''}__${entry.season || ''}__${entry.episode || ''}__${entry.translationId || ''}`;
}

function continueDisplayKey(entry) {
    const sourceUrl = entry?.sourceUrl || '';
    const title = String(entry?.title || '').trim().toLowerCase();
    const isSeries = !!(
        entry?.season ||
        entry?.savedSeason ||
        entry?.episode ||
        entry?.savedEpisode ||
        entry?.seriesLabel
    );

    if (isSeries) {
        return sourceUrl ? `${sourceUrl}__series` : `${title}__series`;
    }

    return sourceUrl ? `${sourceUrl}__movie` : `${title}__movie`;
}

function upsertContinueWatching(entry) {
    const items = loadContinueWatching();
    const key = continueEntryKey(entry);

    const filtered = items.filter(item => continueEntryKey(item) !== key);
    filtered.unshift(entry);

    const finalItems = filtered.slice(0, 30);
    saveContinueWatching(finalItems);
}

function mergeContinueSourcesExact(localItems = [], remoteItems = []) {
    const mergedByExactKey = new Map();
    localItems = Array.isArray(localItems) ? localItems : [];
    remoteItems = Array.isArray(remoteItems) ? remoteItems : [];

    remoteItems.forEach((item, index) => {
        const key = continueEntryKey(item);
        mergedByExactKey.set(key, {
            ...item,
            currentTime: Number(item.currentTime || 0),
            quality: item.quality || null,
            translationId: item.translationId || null,
            translatorName: item.translatorName || null,
            source: 'remote',
            _listOrder: 1000 + index
        });
    });

    localItems.forEach((item, index) => {
        const key = continueEntryKey(item);
        const existing = mergedByExactKey.get(key) || {};
        mergedByExactKey.set(key, {
            ...existing,
            ...item,
            currentTime: Number(item.currentTime || item.savedTime || existing.currentTime || 0),
            source: existing.source === 'remote' ? 'hybrid' : 'local',
            _listOrder: index
        });
    });

    return Array.from(mergedByExactKey.values());
}

function mergeContinueSources(localItems = [], remoteItems = []) {
    const exactItems = mergeContinueSourcesExact(localItems, remoteItems);
    const dedupedForDisplay = new Map();

    exactItems.forEach(item => {
        const displayKey = continueDisplayKey(item);
        const existing = dedupedForDisplay.get(displayKey);

        const currentEpisode = Number(item.episode || item.savedEpisode || 0);
        const existingEpisode = Number(existing?.episode || existing?.savedEpisode || 0);

        const currentSeason = Number(item.season || item.savedSeason || 0);
        const existingSeason = Number(existing?.season || existing?.savedSeason || 0);

        const currentTime = Number(item.currentTime || item.savedTime || 0);
        const existingTime = Number(existing?.currentTime || existing?.savedTime || 0);

        const currentUpdatedAt = Number(item.updatedAt || item.timestamp || item.syncedAt || 0);
        const existingUpdatedAt = Number(existing?.updatedAt || existing?.timestamp || existing?.syncedAt || 0);

        if (!existing) {
            dedupedForDisplay.set(displayKey, item);
            return;
        }

        const shouldReplace =
            currentUpdatedAt > existingUpdatedAt ||
            (currentUpdatedAt === existingUpdatedAt && currentSeason > existingSeason) ||
            (currentSeason === existingSeason && currentEpisode > existingEpisode) ||
            (currentSeason === existingSeason && currentEpisode === existingEpisode && currentTime >= existingTime) ||
            ((item._listOrder ?? 999999) < (existing._listOrder ?? 999999));

        if (shouldReplace) {
            dedupedForDisplay.set(displayKey, {
                ...existing,
                ...item,
                currentTime: Math.max(existingTime, currentTime),
                _listOrder: Math.min(existing._listOrder ?? 999999, item._listOrder ?? 999999)
            });
        }
    });

    return Array.from(dedupedForDisplay.values()).sort((a, b) => {
        const aUpdatedAt = Number(a.updatedAt || a.timestamp || a.syncedAt || 0);
        const bUpdatedAt = Number(b.updatedAt || b.timestamp || b.syncedAt || 0);
        if (bUpdatedAt !== aUpdatedAt) return bUpdatedAt - aUpdatedAt;

        const aOrder = Number(a._listOrder ?? 999999);
        const bOrder = Number(b._listOrder ?? 999999);
        if (aOrder !== bOrder) return aOrder - bOrder;

        const aSeason = Number(a.season || a.savedSeason || 0);
        const bSeason = Number(b.season || b.savedSeason || 0);
        if (bSeason !== aSeason) return bSeason - aSeason;

        const aEpisode = Number(a.episode || a.savedEpisode || 0);
        const bEpisode = Number(b.episode || b.savedEpisode || 0);
        if (bEpisode !== aEpisode) return bEpisode - aEpisode;

        return String(a.title || '').localeCompare(String(b.title || ''));
    });
}

async function loadRemoteContinueWatching() {
    if (remoteContinueLoadPromise) return await remoteContinueLoadPromise;

    remoteContinueLoadPromise = (async () => {
        try {
            const data = await fetchJson('/continue_remote', 'Failed to load remote continue', {
                init: {cache: 'no-store'}
            });
            remoteContinueItems = Array.isArray(data.items) ? data.items : [];
            return remoteContinueItems;
        } catch (e) {
            return remoteContinueItems;
        } finally {
            remoteContinueLoadPromise = null;
        }
    })();

    return await remoteContinueLoadPromise;
}

async function refreshContinueWatching({focusFirst = false} = {}) {
    renderContinueWatching();
    setTimeout(() => {
        refreshFocusables();
        if (focusFirst) focusFirstScreenFocusable('continue');
    }, 20);

    if (isLoggedIn) {
        const focusedContinueId = document.querySelector('#screen-continue .focus')?.dataset?.id || null;
        await loadRemoteContinueWatching();
        renderContinueWatching();

        setTimeout(() => {
            refreshFocusables();
            const sameCard = focusedContinueId
                ? Array.from(document.querySelectorAll('#screen-continue [data-id]'))
                    .find(card => card.dataset.id === focusedContinueId)
                : null;
            if (sameCard) setFocusedElement(sameCard);
        }, 20);
    }
}

// =========================
// GLOBAL STATE
// =========================

let playerPrefs = loadPlayerPrefs();
let currentScreen = 'home';
let focusables = [];
let focusIndex = 0;
let currentHomeItems = [];
let currentSearchItems = [];
let currentSelectedItem = null;
let currentStreams = {};
let currentTranslators = {};
let currentTranslationId = null;
let currentQuality = null;
let currentTranslatorName = null;
let playerStatus = "Idle";
let currentSearchQuery = "";
let isLoggedIn = false;
let authStatusText = "Not logged in";
let currentEpisodesData = null;
let currentSelectedSeason = null;
let currentSelectedEpisode = null;
let currentTranslatorPremium = false;
let isPlayerEpisodesOpen = false;
let pendingResumeTime = 0;
let remoteContinueItems = [];
let remoteContinueLoadPromise = null;
let continueRenderSignature = "";
const posterRowScrollAnimations = new WeakMap();
const movieDetailsCache = new Map();
const movieTranslatorsCache = new Map();
const movieEpisodesCache = new Map();
let focusedCardPreloadTimer = null;
let lastRemoteSyncAt = 0;
let currentSubtitles = {};
let currentSubtitleLanguage = 'off';
let currentSubtitleForcedTranslation = null;
let currentVideoFitMode = playerPrefs.preferredFitMode || 'contain';
let isQualityDropdownOpen = false;
let pendingSubtitleLanguage = null;
let pendingPreplayResumeTime = 0;
let isTranslatorDropdownOpen = false;
let isPlayerOverlayVisible = true;
let playerOverlayHideTimer = null;
let autoplayNextEpisodeEnabled = !!playerPrefs.autoplayNextEpisodeEnabled;
let nextEpisodeCountdownTimer = null;
let savedAppChromeDisplay = null;
let nextEpisodeCountdownValue = 5;
let pendingNextEpisode = null;
let autoplayHandledPlaybackKey = null;
let currentDetailsRequestToken = 0;

// =========================
// GENERAL HELPERS
// =========================

function itemMeta(item) {
    const parts = [];
    if (item.category) parts.push(item.category);
    parts.push(`IMDb ${item.rating ?? 'N/A'}`);
    return parts.join(' • ');
}

function isSeriesItem(item) {
    const type = String(item?.type || '').toLowerCase();
    const url = String(item?.sourceUrl || '').toLowerCase();
    return type.includes('tv_series') || type.includes('series') || url.includes('/series/');
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function deferResult(promise) {
    return promise.then(value => ({value}), error => ({error}));
}

async function unwrapResult(promise) {
    const result = await promise;
    if (result?.error) throw result.error;
    return result?.value;
}

async function syncCurrentPlaybackToRemote(options = {}) {
    if (!isLoggedIn || !currentSelectedItem?.sourceUrl) return;

    const now = Date.now();
    const force = !!options.force;

    if (!force && now - lastRemoteSyncAt < 15000) return;

    const video = document.getElementById('player-video');

    const payload = {
        sourceUrl: currentSelectedItem.sourceUrl,
        translationId: currentTranslationId || 0,
        season: currentSelectedSeason || 0,
        episode: currentSelectedEpisode || 0,
        currentTime: Math.floor(video?.currentTime || 0),
        duration: Math.floor(video?.duration || 0)
    };

    lastRemoteSyncAt = now;

    try {
        const res = await fetch(`${API_BASE}/sync_continue_remote`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (data.ok) {
            await refreshContinueWatching({focusFirst: currentScreen === 'continue'});
        }
    } catch (e) {
    }
}

// =========================
// PLAYER RESUME HELPERS
// =========================

function tryApplyResumeTime(video, resumeTime, desc) {
    if (!video || !resumeTime || !Number.isFinite(resumeTime) || resumeTime <= 0) return false;

    try {
        const duration = Number.isFinite(video.duration) ? video.duration : null;
        const safeTime = duration
            ? Math.max(0, Math.min(resumeTime, Math.max(0, duration - 2)))
            : Math.max(0, resumeTime);

        video.currentTime = safeTime;
        if (desc) {
            desc.textContent = `Восстанавливаем просмотр с ${safeTime} сек...`;
        }
        pendingResumeTime = safeTime;
        return true;
    } catch (e) {
        return false;
    }
}


// =========================
// API LOADERS
// =========================


async function loadMoviesFromAPI(query = 'matrix') {
    const data = await fetchJson('/search', 'Не удалось получить фильмы', {params: {q: query}});
    return (Array.isArray(data) ? data : []).map(item => ({
        id: item.url,
        title: item.title,
        meta: itemMeta(item),
        type: item.type || item.format || item.category || 'movie',
        sourceUrl: item.url,
        rating: item.rating ?? 'N/A',
        thumbnail: item.image || '',
        category: item.category || ''
    }));
}

async function performSearch(query) {
    const normalized = (query || "").trim();
    const target = document.getElementById('search-results');
    if (target) {
        target.innerHTML = `
    <div class="empty-box" style="grid-column: 1 / -1;">
      Searching...
    </div>
  `;
    }
    if (!normalized) {
        currentSearchItems = [];
        renderSearchResults([]);
        return;
    }

    try {
        const results = await loadMoviesFromAPI(normalized);
        currentSearchItems = results;
        currentSearchQuery = normalized;
        renderSearchResults(currentSearchItems);
    } catch (err) {
        currentSearchItems = [];
        if (target) {
            target.innerHTML = `
    <div class="empty-box" style="grid-column: 1 / -1;">
      Ошибка поиска: ${escapeHtml(err.message)}
    </div>
  `;
        }
        return;
    }

    const input = document.getElementById("searchInput");
    if (input) {
        input.value = normalized;
    }

    setTimeout(() => {
        refreshFocusables();

        const firstCard = document.querySelector('#screen-search .search-result[data-focusable="true"]');
        if (firstCard) {
            document.querySelectorAll('.focus').forEach(el => el.classList.remove('focus'));
            focusIndex = focusables.indexOf(firstCard);
            if (focusIndex >= 0) {
                focusables[focusIndex].classList.add('focus');
                ensureFocusedElementVisible(focusables[focusIndex]);
            }
        }
    }, 20);
}

async function loadMovieDetails(url) {
    return await fetchJson('/movie', 'Не удалось получить details', {params: {url}});
}

async function loadMovieStream(url) {
    return await fetchJson('/stream', 'Не удалось получить stream', {params: {url}});
}

async function loadMovieTranslators(url) {
    return await fetchJson('/translators', 'Не удалось получить озвучки', {params: {url}});
}

async function loadEpisodesData(url) {
    return await fetchJson('/episodes', 'Не удалось получить episodes', {params: {url}});
}

function cacheKey(url) {
    return String(url || '').trim();
}

function rememberCachedData(cache, key, data, maxSize = 80) {
    if (cache.has(key)) cache.delete(key);

    while (cache.size >= maxSize) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey === undefined) break;
        cache.delete(oldestKey);
    }

    cache.set(key, {data});
}

async function loadCached(cache, url, loader) {
    const key = cacheKey(url);
    if (!key) return await loader();

    const cached = cache.get(key);
    if (cached?.data) return cached.data;
    if (cached?.promise) return await cached.promise;

    const promise = loader()
        .then(data => {
            rememberCachedData(cache, key, data);
            return data;
        })
        .catch(error => {
            cache.delete(key);
            throw error;
        });

    cache.set(key, {promise});
    return await promise;
}

async function loadMovieDetailsCached(url) {
    return await loadCached(movieDetailsCache, url, () => loadMovieDetails(url));
}

async function loadMovieTranslatorsCached(url) {
    return await loadCached(movieTranslatorsCache, url, () => loadMovieTranslators(url));
}

async function loadEpisodesDataWithRetry(url, attempts = 3) {
    let lastData = null;
    let lastError = null;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
            const data = await loadEpisodesData(url);
            lastData = data;
            if (getNormalizedEpisodesInfo(data).length) return data;
        } catch (error) {
            lastError = error;
        }

        if (attempt < attempts - 1) {
            await sleep(300 + attempt * 500);
        }
    }

    if (lastData) return lastData;
    throw lastError || new Error('Не удалось получить episodes');
}

async function loadEpisodesDataWithRetryCached(url, attempts = 3, {force = false} = {}) {
    const key = cacheKey(url);
    if (!key) return await loadEpisodesDataWithRetry(url, attempts);
    if (force) movieEpisodesCache.delete(key);

    const cached = movieEpisodesCache.get(key);
    if (cached?.data) return cached.data;
    if (cached?.promise) return await cached.promise;

    const promise = loadEpisodesDataWithRetry(url, attempts)
        .then(data => {
            if (getNormalizedEpisodesInfo(data).length) {
                rememberCachedData(movieEpisodesCache, key, data);
            } else {
                movieEpisodesCache.delete(key);
            }
            return data;
        })
        .catch(error => {
            movieEpisodesCache.delete(key);
            throw error;
        });

    movieEpisodesCache.set(key, {promise});
    return await promise;
}

async function preloadCardData(item) {
    if (!item?.sourceUrl) return;

    void loadMovieTranslatorsCached(item.sourceUrl).catch(() => {});

    try {
        const details = await loadMovieDetailsCached(item.sourceUrl);
        const merged = {...item, ...details};
        if (isSeriesItem(merged)) {
            void loadEpisodesDataWithRetryCached(item.sourceUrl).catch(() => {});
        }
    } catch (e) {
    }
}

function scheduleFocusedCardPreload(element) {
    if (!element || element.dataset?.type !== 'card') return;
    clearTimeout(focusedCardPreloadTimer);

    focusedCardPreloadTimer = setTimeout(() => {
        const cards = [element, element.previousElementSibling, element.nextElementSibling]
            .filter(card => card?.dataset?.type === 'card');
        const seen = new Set();

        cards.forEach(card => {
            const id = card.dataset.id;
            if (!id || seen.has(id)) return;
            seen.add(id);
            const item = findItemById(id);
            if (item) void preloadCardData(item);
        });
    }, 140);
}

async function loadSubtitlesData(url, options = {}) {
    return await fetchJson('/subtitles', 'Не удалось получить subtitles', {
        params: {
            url,
            ...(options.translation ? {translation: String(options.translation)} : {}),
            ...(options.season ? {season: String(options.season)} : {}),
            ...(options.episode ? {episode: String(options.episode)} : {})
        }
    });
}


// =========================
// SUBTITLES
// =========================

function clearManagedSubtitleTracks(video = document.getElementById('player-video')) {
    if (!video) return;

    Array.from(video.querySelectorAll('track[data-managed-subtitle="true"]')).forEach(track => track.remove());

    for (let i = 0; i < video.textTracks.length; i += 1) {
        try {
            video.textTracks[i].mode = 'disabled';
        } catch (e) {
        }
    }
}

function resetSubtitleState({video = document.getElementById('player-video'), clearTracks = false, render = true, updateMeta = false} = {}) {
    currentSubtitles = {};
    currentSubtitleLanguage = 'off';
    currentSubtitleForcedTranslation = null;
    pendingSubtitleLanguage = null;
    if (clearTracks) clearManagedSubtitleTracks(video);
    if (render) renderSubtitleButtons();
    if (updateMeta) updatePlayerMeta();
}

function applyTranslatorState(translatorId, {fallbackName = null, clearMissing = false} = {}) {
    const translator = translatorId ? currentTranslators[String(translatorId)] : null;
    if (!translator) {
        if (clearMissing) {
            currentTranslatorName = fallbackName;
            currentTranslatorPremium = false;
        }
        return false;
    }

    currentTranslatorName = translator.name || fallbackName;
    currentTranslatorPremium = !!translator.premium;
    return true;
}

function applyPreferredTranslatorIfAvailable() {
    const preferredId = playerPrefs.preferredTranslatorId ? String(playerPrefs.preferredTranslatorId) : null;
    if (!preferredId || !currentTranslators[preferredId]) return false;
    currentTranslationId = preferredId;
    return applyTranslatorState(preferredId);
}

function activateManagedSubtitleTrack(video, language) {
    if (!video) return;

    const tryActivate = () => {
        for (let i = 0; i < video.textTracks.length; i += 1) {
            const textTrack = video.textTracks[i];
            const matchesLanguage =
                String(textTrack.language || '').toLowerCase() === String(language || '').toLowerCase()
                || String(textTrack.label || '').toLowerCase() === String(language || '').toLowerCase();

            try {
                textTrack.mode = matchesLanguage ? 'showing' : 'disabled';
            } catch (e) {
            }
        }
    };

    tryActivate();
    setTimeout(tryActivate, 0);
    setTimeout(tryActivate, 150);
    setTimeout(tryActivate, 400);
}

function renderSubtitleButtons() {
    const container = document.getElementById("subtitle-buttons");
    if (!container) return;

    container.innerHTML = "";

    const subtitleEntries = Object.entries(currentSubtitles || {}).filter(([, value]) => !!value);
    const isSubtitleTranslation = String(currentTranslationId || '') === '238';
    const shouldShowSubtitles = isSubtitleTranslation && subtitleEntries.length > 0;
    if (!shouldShowSubtitles) {
        setTimeout(refreshFocusables, 50);
        return;
    }

    const offBtn = document.createElement("button");
    offBtn.textContent = "Subtitles: Off";
    offBtn.className = "action-btn secondary";
    offBtn.setAttribute("data-focusable", "true");
    offBtn.setAttribute("data-type", "subtitle-select");
    offBtn.setAttribute("data-lang", "off");

    if (currentSubtitleLanguage === "off") {
        offBtn.style.background = "rgba(255,255,255,0.24)";
    }

    container.appendChild(offBtn);

    subtitleEntries.forEach(([lang, url]) => {
        if (!url) return;

        const btn = document.createElement("button");
        btn.textContent = `Subtitles: ${lang}`;
        btn.className = "action-btn secondary";
        btn.setAttribute("data-focusable", "true");
        btn.setAttribute("data-type", "subtitle-select");
        btn.setAttribute("data-lang", lang);

        if (currentSubtitleForcedTranslation && String(currentTranslationId || '') !== String(currentSubtitleForcedTranslation)) {
            btn.setAttribute("data-force-translation", String(currentSubtitleForcedTranslation));
        }

        if (currentSubtitleLanguage === lang) {
            btn.style.background = "rgba(255,255,255,0.24)";
        }

        container.appendChild(btn);
    });

    setTimeout(refreshFocusables, 50);
}

function applySelectedSubtitleTrack(language) {
    const video = document.getElementById('player-video');
    if (!video) return;

    clearManagedSubtitleTracks(video);

    if (!language || language === 'off' || !currentSubtitles[language]) {
        currentSubtitleLanguage = 'off';
        updatePlayerPreference('preferredSubtitleLanguage', 'off');
        updateSubtitleLanguageForSource(currentSelectedItem?.sourceUrl, 'off');
        updatePlayerMeta();
        renderSubtitleButtons();
        return;
    }

    const track = document.createElement('track');
    track.kind = 'subtitles';
    track.label = language;
    track.srclang = language;
    track.src = `${currentSubtitles[language]}${currentSubtitles[language].includes('?') ? '&' : '?'}v=${Date.now()}`;
    track.default = true;
    track.setAttribute('data-managed-subtitle', 'true');

    currentSubtitleLanguage = language;
    updatePlayerPreference('preferredSubtitleLanguage', language);
    updateSubtitleLanguageForSource(currentSelectedItem?.sourceUrl, language);
    track.addEventListener('load', () => {
        activateManagedSubtitleTrack(video, language);
    }, {once: true});

    track.addEventListener('error', () => {
        currentSubtitleLanguage = 'off';
        updatePlayerPreference('preferredSubtitleLanguage', 'off');
        updateSubtitleLanguageForSource(currentSelectedItem?.sourceUrl, 'off');
        clearManagedSubtitleTracks(video);
        updatePlayerMeta();
        renderSubtitleButtons();
    }, {once: true});

    video.appendChild(track);
    activateManagedSubtitleTrack(video, language);

    updatePlayerMeta();
    renderSubtitleButtons();
}

async function refreshSubtitlesForCurrentPlayback(preferredLanguage = null) {
    const video = document.getElementById('player-video');
    if (!currentSelectedItem?.sourceUrl) {
        resetSubtitleState();
        return;
    }

    const requestOptions = {
        translation: currentTranslationId || 0,
        season: currentSelectedSeason || 0,
        episode: currentSelectedEpisode || 0
    };
    if (String(currentTranslationId || '') !== '238') {
        resetSubtitleState({video, clearTracks: true, updateMeta: true});
        return;
    }

    currentSubtitles = {};
    currentSubtitleForcedTranslation = null;

    let data = await loadSubtitlesData(currentSelectedItem.sourceUrl, requestOptions);


    currentSubtitles = data.subtitles || {};

    if (!Object.keys(currentSubtitles).length) {
        applySelectedSubtitleTrack('off');
        return;
    }

    renderSubtitleButtons();

    const storedSubtitleLanguage = getStoredSubtitleLanguageForSource(currentSelectedItem?.sourceUrl) || 'off';
    const targetLanguage = preferredLanguage && preferredLanguage !== 'off'
        ? preferredLanguage
        : (storedSubtitleLanguage !== 'off' ? storedSubtitleLanguage : null);
    if (targetLanguage && currentSubtitles[targetLanguage]) {
        if (currentSubtitleForcedTranslation && String(currentTranslationId || '') !== String(currentSubtitleForcedTranslation)) {
            pendingSubtitleLanguage = targetLanguage;
            await switchTranslator(String(currentSubtitleForcedTranslation));
            return;
        }

        applySelectedSubtitleTrack(targetLanguage);
        return;
    }

    if (preferredLanguage === 'off') {
        applySelectedSubtitleTrack('off');
    } else {
        currentSubtitleLanguage = 'off';
        updatePlayerMeta();
        renderSubtitleButtons();
    }
}

// =========================
// RENDER HELPERS
// =========================

function createPosterCard(item) {
    const thumbStyle = backgroundImageStyle(item.thumbnail);
    return `
        <div class="poster-card" data-focusable="true" data-type="card" data-id="${escapeAttr(item.id)}">
          <div class="poster-thumb" ${thumbStyle}></div>
          <div class="card-title">${escapeHtml(item.title)}</div>
          <div class="card-meta">${escapeHtml(item.meta)}</div>
        </div>
      `;
}

function renderRows(targetId, title, subtitle, items) {
    const target = document.getElementById(targetId);
    if (!target) return;
    target.innerHTML = `
        <div class="row-block">
          <div class="row-title">${escapeHtml(title)}</div>
          <div class="row-subtitle">${escapeHtml(subtitle)}</div>
          <div class="poster-row">
            ${items.map(createPosterCard).join('')}
          </div>
        </div>
      `;
}

async function resumeFromContinue(item) {
    currentSelectedSeason = item.savedSeason || item.season || null;
    currentSelectedEpisode = item.savedEpisode || item.episode || null;
    currentTranslationId = item.savedTranslationId || item.translationId || null;
    currentTranslatorName = item.savedTranslatorName || item.translatorName || null;
    currentQuality = item.savedQuality || item.quality || null;

    const resumeTime = Number(item.savedTime || item.currentTime || 0);
    pendingPreplayResumeTime = resumeTime > 0 ? resumeTime : 0;

    await openDetailsForItem(item, {preservePlaybackState: true});

    setTimeout(() => {
        const playBtn = document.querySelector('#screen-details [data-type="play-item"]');
        if (!playBtn) return;

        refreshFocusables();
        setFocusedElement(playBtn, {
            selector: `#screen-${currentScreen} [data-focusable="true"], .sidebar [data-focusable="true"]`,
            focus: true
        });
    }, 80);
}

function renderContinueWatching() {
    const localItems = loadContinueWatching();
    const items = mergeContinueSources(localItems, remoteContinueItems);

    const target = document.getElementById('continue-content');
    if (!target) return;

    const nextSignature = JSON.stringify(items.map(item => [
        continueEntryKey(item),
        item.currentTime || item.savedTime || 0,
        item.updatedAt || item.timestamp || item.syncedAt || 0
    ]));
    if (nextSignature === continueRenderSignature && target.children.length) return;
    continueRenderSignature = nextSignature;

    if (!items.length) {
        target.innerHTML = `
        <div class="empty-box">Здесь будут недосмотренные фильмы и серии.</div>
      `;
        return;
    }

    const normalized = items.map(item => ({
        id: continueEntryKey(item),
        title: item.title,
        meta: item.seriesLabel
            ? `${item.seriesLabel} • ${item.translatorName || 'Без озвучки'}${item.currentTime ? ` • ${Math.floor((item.currentTime || 0) / 60)} мин` : ''}`
            : `${item.remoteInfo || item.translatorName || 'Без озвучки'}${item.currentTime ? ` • ${Math.floor((item.currentTime || 0) / 60)} мин` : ''}`,
        type: item.type || 'movie',
        sourceUrl: item.sourceUrl,
        rating: item.rating ?? 'N/A',
        thumbnail: item.thumbnail || '',
        category: item.category || '',
        savedTime: item.currentTime || 0,
        savedSeason: item.season || null,
        savedEpisode: item.episode || null,
        savedTranslationId: item.translationId || null,
        savedTranslatorName: item.translatorName || null,
        savedQuality: item.quality || null,
        remoteInfo: item.remoteInfo || null,
        source: item.source || null,
        updatedAt: item.updatedAt || item.timestamp || item.syncedAt || 0
    }));

    renderRows('continue-content', 'Continue Watching', 'Недосмотренное', normalized);
}

function renderSearchResults(items) {
    const target = document.getElementById('search-results');
    if (!target) return;
    if (!items || items.length === 0) {
        target.innerHTML = `
    <div class="empty-box" style="grid-column: 1 / -1;">
      Ничего не найдено. Попробуй другой запрос.
    </div>
  `;
        return;
    }
    target.innerHTML = items.map(item => {
        const thumbStyle = backgroundImageStyle(item.thumbnail, 'height:190px;');
        return `
          <div class="search-result" data-focusable="true" data-type="card" data-id="${escapeAttr(item.id)}">
            <div class="poster-thumb" ${thumbStyle}></div>
            <div class="card-title">${escapeHtml(item.title)}</div>
            <div class="card-meta">${escapeHtml(item.meta)}</div>
          </div>
        `;
    }).join('');
}

function renderDetails(item, details = null) {
    const target = document.getElementById('details-content');
    if (!target) return;

    const title = details?.title || item?.title || 'Unknown title';
    const description = details?.description || 'Описание загружается...';
    const rating = details?.rating ?? item?.rating ?? 'N/A';
    const type = details?.type || item?.type || 'movie';
    const thumbnail = details?.thumbnail || item?.thumbnail || '';
    const posterStyle = backgroundImageStyle(thumbnail);

    target.innerHTML = `
        <div class="details-layout">
          <div class="details-poster" ${posterStyle}></div>
          <div>
            <div class="eyebrow">${escapeHtml(type)}</div>
            <h2 class="screen-title" style="font-size:56px; margin-bottom:12px;">${escapeHtml(title)}</h2>
            <div class="tag-row">
              <span class="tag">IMDb ${escapeHtml(rating)}</span>
              <span class="tag">HD</span>
              <span class="tag">Online</span>
            </div>
            <div class="screen-desc" style="max-width:800px; line-height:1.5;">${escapeHtml(description || 'Нет описания')}</div>
            <div class="btn-row">
              <button class="action-btn primary" data-focusable="true" data-type="play-item">▶ Play</button>
              <button class="action-btn secondary" data-focusable="true" data-type="back-home">← Back</button>
            </div>
            <div id="series-panel" style="margin-top:24px;"></div>
          </div>
        </div>
      `;
}

function renderSeriesPanel(targetId = "series-panel") {
    const panel = document.getElementById(targetId);
    if (!panel) return;

    const normalized = getNormalizedEpisodesInfo();

    if (!normalized.length) {
        panel.innerHTML = "";
        if (targetId === "player-series-panel") {
            panel.style.display = "none";
        }
        return;
    }

    const seasonsHtml = [...normalized]
        .sort((a, b) => Number(a.season) - Number(b.season))
        .map(seasonBlock => {
            const seasonNum = String(seasonBlock.season);
            const isActiveSeason = String(currentSelectedSeason) === seasonNum;

            const episodesHtml = isActiveSeason
                ? (seasonBlock.episodes || []).map(ep => {
                    const episodeNum = String(ep.episode);
                    const translations = Array.isArray(ep.translations) ? ep.translations : [];
                    const hasPremium = translations.some(t => t.premium);
                    const isSelectedEpisode = String(currentSelectedEpisode) === episodeNum;
                    return `
<button
  class="action-btn secondary"
  data-focusable="true"
  data-type="episode-select"
  data-season="${escapeAttr(seasonNum)}"
  data-episode="${escapeAttr(episodeNum)}"
  style="text-align:left; justify-content:flex-start; width:100%; margin-top:10px; border:${hasPremium ? '1px solid rgba(255,215,0,0.35)' : 'none'}; background:${isSelectedEpisode ? 'rgba(87,166,255,0.22)' : 'rgba(255,255,255,0.12)'};"
>
  <div style="display:flex; width:100%; align-items:center; justify-content:space-between; gap:14px;">
    <div style="font-weight:700;">Серия ${escapeHtml(episodeNum)}</div>
    <div class="hint">${translations.length ? `${translations.length} озвучек` : 'Без переводов'}${hasPremium ? ' • Premium' : ''}</div>
  </div>
</button>
          `;
                }).join("")
                : "";
            return `
      <div style="margin-bottom:18px;">
        <button
          class="action-btn ${isActiveSeason ? "primary" : "secondary"}"
          data-focusable="true"
          data-type="season-select"
          data-season="${escapeAttr(seasonNum)}"
        >
          Сезон ${escapeHtml(seasonNum)}
        </button>
        <div style="margin-top:10px; display:grid; gap:10px;">
          ${episodesHtml}
        </div>
      </div>
    `;
        }).join("");

    panel.innerHTML = `
    <div class="row-title" style="font-size:26px; margin-bottom:12px;">Сезоны и серии</div>
    ${seasonsHtml}
  `;
    if (targetId === "player-series-panel") {
        panel.style.display = isPlayerEpisodesOpen ? "block" : "none";
    }
}

function renderSeriesPanels() {
    renderSeriesPanel();
    renderSeriesPanel("player-series-panel");
}

function renderTranslatorButtons() {
    const container = document.getElementById("translator-buttons");
    const label = document.getElementById('translator-select-label');
    if (!container) return;

    const entries = getAvailableTranslatorsForCurrentEpisode();
    container.style.display = currentSelectedItem && entries.length && isTranslatorDropdownOpen ? "block" : "none";
    container.innerHTML = "";

    const selectedEntry = entries.find(([id]) => String(id) === String(currentTranslationId)) || null;

    if (label) {
        const selectedName = selectedEntry?.[1]?.name || currentTranslatorName || 'Choose voice acting';
        const selectedPremium = !!selectedEntry?.[1]?.premium;
        label.textContent = selectedPremium ? `${selectedName} ⭐` : selectedName;
    }

    entries.forEach(([id, data], index) => {
        if (!data) return;

        const btn = document.createElement("button");
        const premiumMark = data.premium ? " ⭐" : "";
        const isSelected = String(currentTranslationId) === String(id);

        btn.textContent = `${data.name || `Translator ${id}`}${premiumMark}`;
        btn.className = "action-btn secondary";
        btn.style.width = '100%';
        btn.style.justifyContent = 'space-between';
        btn.style.textAlign = 'left';
        btn.style.marginTop = index === 0 ? '0' : '8px';
        btn.style.padding = '18px 20px';
        btn.style.borderRadius = '16px';
        btn.style.fontSize = '22px';

        if (data.premium) {
            btn.style.border = "1px solid rgba(255, 215, 0, 0.45)";
        }

        btn.setAttribute("data-focusable", "true");
        btn.setAttribute("data-type", "translator");
        btn.setAttribute("data-id", id);

        if (isSelected) {
            btn.style.background = data.premium
                ? "rgba(255, 215, 0, 0.22)"
                : "rgba(255,255,255,0.20)";
            btn.style.boxShadow = '0 0 0 1px rgba(255,255,255,0.08) inset';
        }

        container.appendChild(btn);
    });

    setTimeout(refreshFocusables, 50);
}

async function switchTranslator(translationId) {
    if (!currentSelectedItem?.sourceUrl) return;

    currentTranslationId = translationId;
    applyTranslatorState(translationId, {fallbackName: `Translator ${translationId}`, clearMissing: true});
    ensureFitModeButton();
    playerStatus = "Loading";
    updatePlayerMeta();

    const title = document.getElementById('player-title');
    const desc = document.getElementById('player-desc');
    const video = document.getElementById('player-video');
    if (!video) return;

    const currentTime = video.currentTime || 0;
    const preferredQuality = currentQuality;
    persistCurrentPlaybackProgress({currentTime});
    resetSubtitleState();

    if (title) title.textContent = currentSelectedItem.title || 'Player';
    if (desc) desc.textContent = 'Меняем озвучку...';

    try {
        const res = await fetch(buildStreamUrl({
            url: currentSelectedItem.sourceUrl,
            translation: translationId,
            season: currentSelectedSeason,
            episode: currentSelectedEpisode
        }));
        if (!res.ok) throw new Error('Не удалось получить stream для выбранной озвучки');

        const streamData = await res.json();
        currentStreams = streamData;

        const selectedStream = pickStreamByQuality(streamData, preferredQuality);
        const streamUrl = selectedStream.url;
        currentQuality = selectedStream.quality;

        if (String(currentTranslationId || '') !== '238') {
            resetSubtitleState({video, clearTracks: true});
        }

        if (!streamUrl) {
            if (desc) desc.textContent = 'Для этой озвучки нет доступного видео.';
            return;
        }

        video.src = streamUrl;
        video.load();

        video.onloadedmetadata = () => {
            video.currentTime = currentTime;
            applyFullscreenVideoPresentation(video);
            updatePlayerProgressUI(video);
            playerStatus = "Playing";
            updatePlayerMeta();
            video.play().then(() => {
                showPlayerOverlayAndSchedule(1800);
            }).catch(() => {
            });
        };

        if (desc) {
            desc.textContent = currentTranslatorPremium
                ? 'Premium-озвучка выбрана.'
                : 'Озвучка переключена.';
        }

        renderQualityButtons();
        await refreshSubtitlesForCurrentPlayback(pendingSubtitleLanguage || currentSubtitleLanguage);
        pendingSubtitleLanguage = null;
        updatePlayerMeta();
    } catch (err) {
        playerStatus = "Error";
        updatePlayerMeta();
        if (desc) {
            desc.textContent = currentTranslatorPremium
                ? `Premium-озвучка недоступна или не загрузилась: ${err.message}`
                : `Ошибка смены озвучки: ${err.message}`;
        }
    }
}

function updatePlayerMeta() {
    const statusTag = document.getElementById("player-status-tag");
    const translatorTag = document.getElementById("player-translator-tag");
    const qualityTag = document.getElementById("player-quality-tag");
    const subtitleTag = document.getElementById("player-subtitle-tag");

    if (statusTag) statusTag.textContent = playerStatus || "Idle";

    if (translatorTag) {
        translatorTag.textContent = `Translator: ${currentTranslatorName || "—"}${currentTranslatorPremium ? " ⭐ Premium" : ""}`;
    }

    if (qualityTag) {
        qualityTag.textContent = `Quality: ${currentQuality || "—"}`;
    }

    if (subtitleTag) {
        subtitleTag.textContent = `Subtitles: ${currentSubtitleLanguage === 'off' ? 'Off' : currentSubtitleLanguage}`;
    }

    updateAutoplayButtonLabel();
    updateFitModeButtonLabel();
    updatePlayerToggleButtonLabel();
    updateQualityDropdownLabel();
    ensurePlayerOverlayControlLayout();
    updatePlayerProgressUI();
}

function updateLoginStatus() {
    const status = document.getElementById("login-status");
    if (status) {
        status.textContent = authStatusText;
    }
}

async function checkAuthStatus() {
    try {
        const res = await fetch(`${API_BASE}/auth/status`);
        if (!res.ok) throw new Error("Failed to get auth status");

        const data = await res.json();
        isLoggedIn = !!data.logged_in;
        authStatusText = isLoggedIn ? "Logged in" : "Not logged in";
    } catch (err) {
        isLoggedIn = false;
        authStatusText = "Auth status unavailable";
    }

    updateLoginStatus();
}

async function performLogin() {
    const emailInput = document.getElementById("login-email");
    const passwordInput = document.getElementById("login-password");

    const email = emailInput?.value?.trim() || "";
    const password = passwordInput?.value || "";

    if (!email || !password) {
        authStatusText = "Введите email и password";
        updateLoginStatus();
        return;
    }

    authStatusText = "Logging in...";
    updateLoginStatus();

    try {
        const res = await fetch(`${API_BASE}/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email,
                password
            })
        });

        const data = await res.json();

        if (!res.ok || !data.ok) {
            throw new Error(data.error || "Login failed");
        }

        isLoggedIn = true;
        authStatusText = "Logged in successfully";
        updateLoginStatus();

        await checkAuthStatus();
        await refreshContinueWatching({focusFirst: currentScreen === 'continue'});
    } catch (err) {
        isLoggedIn = false;
        authStatusText = `Login failed: ${err.message}`;
        updateLoginStatus();
    }
}

function renderQualityButtons() {
    const container = document.getElementById("quality-buttons");
    if (!container) return;

    container.innerHTML = "";
    container.style.display = 'none';

    const existingMenu = document.getElementById('quality-options-menu');
    if (existingMenu) {
        existingMenu.remove();
    }

    const qualityEntries = getStreamQualityEntries();

    const triggerBtn = document.createElement('button');
    triggerBtn.className = 'action-btn secondary';
    triggerBtn.setAttribute('data-focusable', 'true');
    triggerBtn.setAttribute('data-type', 'quality-toggle');
    triggerBtn.style.minWidth = '220px';
    triggerBtn.style.minHeight = '76px';
    triggerBtn.style.display = 'inline-flex';
    triggerBtn.style.alignItems = 'center';
    triggerBtn.style.justifyContent = 'center';
    triggerBtn.style.textAlign = 'center';
    container.appendChild(triggerBtn);

    const menu = document.createElement('div');
    menu.id = 'quality-options-menu';
    menu.style.display = isQualityDropdownOpen ? 'flex' : 'none';
    menu.style.flexDirection = 'column';
    menu.style.gap = '8px';
    menu.style.width = '220px';
    menu.style.padding = '12px';
    menu.style.border = '1px solid rgba(255,255,255,0.10)';
    menu.style.borderRadius = '18px';
    menu.style.background = 'rgba(8,10,16,0.90)';
    menu.style.boxShadow = '0 16px 36px rgba(0,0,0,0.24)';
    menu.style.position = 'absolute';
    menu.style.zIndex = '2100';

    qualityEntries.forEach(([quality, url]) => {
        const btn = document.createElement("button");
        const isPremium = /ultra|^[248]k$/i.test(String(quality));

        btn.textContent = isPremium ? `${quality} ⭐` : quality;
        btn.className = "action-btn secondary";
        btn.setAttribute("data-focusable", "true");
        btn.setAttribute("data-type", "quality");
        btn.setAttribute("data-quality", quality);
        btn.setAttribute("data-url", url);
        btn.style.width = '100%';
        btn.style.display = 'inline-flex';
        btn.style.alignItems = 'center';
        btn.style.justifyContent = 'center';
        btn.style.textAlign = 'center';

        if (isPremium) {
            btn.style.border = "1px solid rgba(255, 215, 0, 0.45)";
        }

        if (currentQuality === quality) {
            btn.style.background = isPremium
                ? "rgba(255, 215, 0, 0.22)"
                : "rgba(255,255,255,0.24)";
        }

        menu.appendChild(btn);
    });

    const stage = document.getElementById('player-stage');
    if (stage) {
        stage.appendChild(menu);
    }

    updateQualityDropdownLabel();
    ensurePlayerOverlayControlLayout();
    setTimeout(refreshFocusables, 50);
}

function switchQuality(url, quality) {
    if (!url || !quality) return;

    const normalizedQuality = String(quality).trim();
    const normalizedCurrentQuality = String(currentQuality || '').trim();
    const video = document.getElementById("player-video");
    const currentSrc = video?.currentSrc || video?.src || '';

    if (normalizedCurrentQuality === normalizedQuality && currentSrc === url) {
        showPlayerOverlayAndSchedule(1800);
        return;
    }

    currentQuality = quality;
    updatePlayerPreference('preferredQuality', quality);
    ensureFitModeButton();
    playerStatus = "Loading";
    updatePlayerMeta();

    if (!video) return;

    const currentTime = video.currentTime || 0;

    video.src = url;
    video.load();

    video.onloadedmetadata = () => {
        video.currentTime = currentTime;
        applyFullscreenVideoPresentation(video);
        updatePlayerProgressUI(video);

        if (currentSubtitleLanguage !== 'off') {
            applySelectedSubtitleTrack(currentSubtitleLanguage);
        }

        playerStatus = "Playing";
        video.play().then(() => {
            showPlayerOverlayAndSchedule(1800);
        }).catch(() => {
        });
    };
}

function persistCurrentPlaybackProgress(options = {}) {
    const video = document.getElementById('player-video');
    if (!video || !currentSelectedItem?.sourceUrl) return;
    const currentTime = Number(options.currentTime ?? video.currentTime ?? 0);
    if (!currentTime || currentTime < 5) return;

    const isSeries = !!(currentSelectedSeason && currentSelectedEpisode);
    const seriesLabel = isSeries ? `S${currentSelectedSeason} • E${currentSelectedEpisode}` : null;

    const entry = {
        sourceUrl: currentSelectedItem.sourceUrl,
        title: currentSelectedItem.title || currentSelectedItem.name || 'Unknown title',
        thumbnail: currentSelectedItem.thumbnail || '',
        type: currentSelectedItem.type || 'movie',
        rating: currentSelectedItem.rating ?? 'N/A',
        category: currentSelectedItem.category || '',
        currentTime: Math.floor(currentTime),
        season: currentSelectedSeason || null,
        episode: currentSelectedEpisode || null,
        seriesLabel,
        translationId: currentTranslationId || null,
        translatorName: currentTranslatorName || null,
        quality: currentQuality || null,
        updatedAt: Date.now()
    };

    upsertContinueWatching(entry);

    renderContinueWatching();
    syncCurrentPlaybackToRemote();
}

// =========================
// SCREEN + FOCUS NAVIGATION
// =========================

function switchScreen(screen) {
    if (currentScreen === 'player' && screen !== 'player') {
        clearNextEpisodeOverlay();
        clearPlayerOverlayHideTimer();
        showPlayerOverlay();
        restoreAppLayoutAfterPlayer();
    }

    currentScreen = screen;
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
    document.getElementById(`screen-${screen}`)?.classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.screen === screen);
    });

    if (screen === 'player') {
        applyPlayerFullscreenLayout();
        showPlayerOverlay();
    }

    if (screen === 'continue') {
        refreshContinueWatching({focusFirst: true});
        return;
    }

    setTimeout(refreshFocusables, 20);
}

function refreshFocusables() {
    const preplayModal = document.getElementById('preplay-modal');
    const isPreplayOpen = preplayModal && preplayModal.style.display === 'flex';
    const qualityMenu = document.getElementById('quality-options-menu');
    const isQualityOpen = currentScreen === 'player' && isQualityDropdownOpen && qualityMenu && qualityMenu.style.display !== 'none';

    const selector = isPreplayOpen
        ? '#preplay-modal [data-focusable="true"]'
        : isQualityOpen
            ? '#quality-options-menu [data-focusable="true"], #screen-player [data-type="quality-toggle"][data-focusable="true"]'
            : `#screen-${currentScreen} [data-focusable="true"], .sidebar [data-focusable="true"]`;

    const previousFocused = focusables[focusIndex] || document.querySelector('.focus');

    focusables = getVisibleFocusables(selector);
    clearFocusedState();
    if (!focusables.length) return;

    let nextIndex = focusables.findIndex(el => el === previousFocused);

    if (nextIndex < 0) {
        if (isPreplayOpen) {
            nextIndex = 0;
        } else if (isQualityOpen) {
            nextIndex = focusables.findIndex(el => el.dataset.type === 'quality-toggle');
            if (nextIndex < 0) nextIndex = 0;
        } else {
            nextIndex = focusables.findIndex(el => el.closest(`#screen-${currentScreen}`));
            if (nextIndex < 0) nextIndex = 0;
        }
    }

    focusIndex = nextIndex;
    focusables[focusIndex].classList.add('focus');
    ensureFocusedElementVisible(focusables[focusIndex]);
    syncPlayerToggleFocusStyle();
    updatePlayerProgressUI();
}

function moveFocus(dir) {
    if (!focusables.length) return;
    const active = focusables[focusIndex];
    if (currentScreen === 'player') {
        showPlayerOverlayAndSchedule(1800);

        if (active?.dataset?.type === 'player-seekbar' && dir === 'left') {
            seekPlayerBy(-10);
            return;
        }

        if (active?.dataset?.type === 'player-seekbar' && dir === 'right') {
            seekPlayerBy(10);
            return;
        }
    }
    const preplayModal = document.getElementById('preplay-modal');
    const isPreplayOpen = preplayModal && preplayModal.style.display === 'flex';

    if (!isPreplayOpen && currentScreen === 'search') {
        const input = document.getElementById('searchInput');
        const searchBtn = document.querySelector('[data-type="search-run"]');
        const firstCard = document.querySelector('#screen-search .search-result[data-focusable="true"]');

        if (dir === 'right' && active === input && searchBtn) {
            focusables[focusIndex].classList.remove('focus');
            focusIndex = focusables.indexOf(searchBtn);
            if (focusIndex >= 0) {
                focusables[focusIndex].classList.add('focus');
                ensureFocusedElementVisible(focusables[focusIndex]);
                return;
            }
        }

        if (dir === 'left' && active === searchBtn && input) {
            focusables[focusIndex].classList.remove('focus');
            focusIndex = focusables.indexOf(input);
            if (focusIndex >= 0) {
                focusables[focusIndex].classList.add('focus');
                ensureFocusedElementVisible(focusables[focusIndex]);
                return;
            }
        }

        if (dir === 'down' && (active === input || active === searchBtn) && firstCard) {
            focusables[focusIndex].classList.remove('focus');
            focusIndex = focusables.indexOf(firstCard);
            if (focusIndex >= 0) {
                focusables[focusIndex].classList.add('focus');
                ensureFocusedElementVisible(focusables[focusIndex]);
                return;
            }
        }
    }

    const activePosterRow = active.closest('.poster-row');
    if (activePosterRow && (dir === 'left' || dir === 'right')) {
        const next = getPosterRowNeighbor(active, dir);

        if (next) {
            active.classList.remove('focus');
            focusIndex = focusables.indexOf(next);
            next.classList.add('focus');
            ensureFocusedElementVisible(next);
            return;
        }
    }

    focusables[focusIndex].classList.remove('focus');
    const activeRect = active.getBoundingClientRect();

    const directionalCandidates = focusables.map((el, idx) => ({el, idx, rect: el.getBoundingClientRect()}))
        .filter(item => item.idx !== focusIndex)
        .filter(item => {
            if (dir === 'right') return item.rect.left >= activeRect.left + 10;
            if (dir === 'left') return item.rect.right <= activeRect.right - 10;
            if (dir === 'down') return item.rect.top >= activeRect.top + 10;
            if (dir === 'up') return item.rect.bottom <= activeRect.bottom - 10;
            return false;
        });

    const samePosterRowCandidates = (dir === 'left' || dir === 'right') && activePosterRow
        ? directionalCandidates.filter(item => item.el.closest('.poster-row') === activePosterRow)
        : [];

    const candidatesSource = samePosterRowCandidates.length
        ? samePosterRowCandidates
        : directionalCandidates;

    const candidates = candidatesSource.sort((a, b) => {
        if (dir === 'right' || dir === 'left') {
            const da = Math.abs(a.rect.left - activeRect.left) + Math.abs(a.rect.top - activeRect.top) * 2;
            const db = Math.abs(b.rect.left - activeRect.left) + Math.abs(b.rect.top - activeRect.top) * 2;
            return da - db;
        }
        const da = Math.abs(a.rect.top - activeRect.top) + Math.abs(a.rect.left - activeRect.left) * 2;
        const db = Math.abs(b.rect.top - activeRect.top) + Math.abs(b.rect.left - activeRect.left) * 2;
        return da - db;
    });
    if (candidates.length) {
        focusIndex = candidates[0].idx;
        focusables[focusIndex].classList.add('focus');
        ensureFocusedElementVisible(focusables[focusIndex]);
        syncPlayerToggleFocusStyle();
        updatePlayerProgressUI();
        return;
    }

    const activeElement = active;
    const screenRoot =
        activeElement?.closest('.screen.active') ||
        document.querySelector(`#screen-${currentScreen}`) ||
        document.querySelector('.screen.active');

    const verticalScrollContainer = activeElement?.closest('.poster-row')
        ? screenRoot
        : (activeElement?.closest('#preplay-modal > div') || screenRoot);

    if (verticalScrollContainer && (dir === 'up' || dir === 'down')) {
        const scrollStep = Math.max(180, Math.round(window.innerHeight * 0.18));
        const maxScrollTop = verticalScrollContainer.scrollHeight - verticalScrollContainer.clientHeight;
        const currentScrollTop = verticalScrollContainer.scrollTop || 0;

        if (dir === 'up' && currentScrollTop > 0) {
            focusables[focusIndex].classList.add('focus');
            verticalScrollContainer.scrollBy({
                top: -scrollStep,
                behavior: 'smooth'
            });
            syncPlayerToggleFocusStyle();
            updatePlayerProgressUI();
            return;
        }

        if (dir === 'down' && currentScrollTop < maxScrollTop - 2) {
            focusables[focusIndex].classList.add('focus');
            verticalScrollContainer.scrollBy({
                top: scrollStep,
                behavior: 'smooth'
            });
            syncPlayerToggleFocusStyle();
            updatePlayerProgressUI();
            return;
        }
    }

    focusables[focusIndex].classList.add('focus');
    ensureFocusedElementVisible(focusables[focusIndex]);
    syncPlayerToggleFocusStyle();
    updatePlayerProgressUI();
}

function getPosterRowNeighbor(element, dir) {
    let next = dir === 'right' ? element.nextElementSibling : element.previousElementSibling;

    while (next) {
        if (next.matches?.('[data-focusable="true"]') && next.offsetParent !== null) return next;
        next = dir === 'right' ? next.nextElementSibling : next.previousElementSibling;
    }

    return null;
}

function scrollPosterRowTo(row, left, behavior) {
    if (behavior !== 'smooth' || typeof requestAnimationFrame !== 'function') {
        row.scrollLeft = left;
        return;
    }

    const previousAnimation = posterRowScrollAnimations.get(row);
    if (previousAnimation) cancelAnimationFrame(previousAnimation.frame);

    const startLeft = row.scrollLeft;
    const distance = left - startLeft;
    if (Math.abs(distance) < 1) {
        posterRowScrollAnimations.delete(row);
        return;
    }

    const duration = currentScreen === 'continue' ? 260 : 200;
    const getTime = () => (window.performance?.now ? window.performance.now() : Date.now());
    const startedAt = getTime();

    const step = now => {
        const progress = Math.min(1, (now - startedAt) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        row.scrollLeft = startLeft + distance * eased;

        if (progress < 1) {
            const frame = requestAnimationFrame(step);
            posterRowScrollAnimations.set(row, {frame});
        } else {
            row.scrollLeft = left;
            posterRowScrollAnimations.delete(row);
        }
    };

    posterRowScrollAnimations.set(row, {frame: requestAnimationFrame(step)});
}

function ensureFocusedElementVisible(element) {
    if (!element) return;
    scheduleFocusedCardPreload(element);

    const posterRow = element.closest('.poster-row');
    const scrollBehavior = currentScreen === 'continue' && !posterRow ? 'auto' : 'smooth';

    if (posterRow) {
        const horizontalPadding = 24;
        const itemLeft = element.offsetLeft;
        const itemRight = itemLeft + element.offsetWidth;
        const visibleLeft = posterRow.scrollLeft;
        const visibleRight = visibleLeft + posterRow.clientWidth;
        let targetLeft = null;

        if (itemLeft < visibleLeft + horizontalPadding) {
            targetLeft = Math.max(0, itemLeft - horizontalPadding);
        } else if (itemRight > visibleRight - horizontalPadding) {
            targetLeft = itemRight - posterRow.clientWidth + horizontalPadding;
        }

        if (targetLeft !== null) {
            scrollPosterRowTo(posterRow, targetLeft, scrollBehavior);
        }

        return;
    }

    const screenRoot =
        element.closest('.screen.active') ||
        document.querySelector(`#screen-${currentScreen}`) ||
        document.querySelector('.screen.active');

    const scrollContainer = screenRoot;

    if (!scrollContainer) {
        element.scrollIntoView({block: 'nearest', inline: 'nearest', behavior: scrollBehavior});
        return;
    }

    const elementRect = element.getBoundingClientRect();
    const containerRect = scrollContainer.getBoundingClientRect();
    const verticalPadding = 24;
    const horizontalPadding = 24;

    if (scrollContainer.scrollHeight > scrollContainer.clientHeight) {
        if (elementRect.top < containerRect.top + verticalPadding) {
            scrollContainer.scrollBy({
                top: elementRect.top - containerRect.top - verticalPadding,
                behavior: scrollBehavior
            });
        } else if (elementRect.bottom > containerRect.bottom - verticalPadding) {
            scrollContainer.scrollBy({
                top: elementRect.bottom - containerRect.bottom + verticalPadding,
                behavior: scrollBehavior
            });
        }
    }

    if (scrollContainer.scrollWidth > scrollContainer.clientWidth) {
        if (elementRect.left < containerRect.left + horizontalPadding) {
            scrollContainer.scrollBy({
                left: elementRect.left - containerRect.left - horizontalPadding,
                behavior: scrollBehavior
            });
        } else if (elementRect.right > containerRect.right - horizontalPadding) {
            scrollContainer.scrollBy({
                left: elementRect.right - containerRect.right + horizontalPadding,
                behavior: scrollBehavior
            });
        }
    }

    if (!element.closest('.poster-row')) {
        element.scrollIntoView({block: 'nearest', inline: 'nearest', behavior: scrollBehavior});
    }
}

function findItemById(id) {
    return [...currentHomeItems, ...currentSearchItems].find(item => item.id === id)
        || mergeContinueSources(loadContinueWatching(), remoteContinueItems).find(item => continueEntryKey(item) === id)
        || null;
}

function findContinueEntryForCurrentItem() {
    if (!currentSelectedItem?.sourceUrl) return null;

    const items = mergeContinueSourcesExact(loadContinueWatching(), remoteContinueItems);
    const isSeries = !!(currentSelectedSeason && currentSelectedEpisode);

    if (isSeries) {
        return items.find(item =>
            item.sourceUrl === currentSelectedItem.sourceUrl &&
            String(item.season || '') === String(currentSelectedSeason || '') &&
            String(item.episode || '') === String(currentSelectedEpisode || '')
        ) || null;
    }

    const seriesFallback = items.find(item =>
        item.sourceUrl === currentSelectedItem.sourceUrl &&
        item.season &&
        item.episode
    ) || null;

    if (seriesFallback) return seriesFallback;

    return items.find(item =>
        item.sourceUrl === currentSelectedItem.sourceUrl &&
        !item.season &&
        !item.episode
    ) || null;
}

// =========================
// SERIES HELPERS
// =========================

function getNormalizedEpisodesInfo(sourceData = currentEpisodesData) {
    const root = sourceData || null;
    const info = root?.episodesInfo ?? root?.seasons ?? root?.items ?? root?.episodes ?? null;
    const normalizeEpisodeArray = (episodesLike) => {
        if (Array.isArray(episodesLike)) {
            return episodesLike.map((ep, idx) => ({
                ...ep,
                episode: String(ep?.episode ?? ep?.id ?? ep?.number ?? ep?.name ?? (idx + 1))
            }));
        }

        if (episodesLike && typeof episodesLike === 'object') {
            return Object.entries(episodesLike).map(([epKey, epValue], idx) => ({
                ...(epValue && typeof epValue === 'object' ? epValue : {}),
                episode: String(epValue?.episode ?? epValue?.id ?? epValue?.number ?? epKey ?? (idx + 1))
            }));
        }

        return [];
    };

    const normalizedFromEpisodesInfo = (() => {
        if (!info) return [];

        if (Array.isArray(info)) {
            return info.map((seasonBlock, idx) => ({
                season: String(seasonBlock?.season ?? seasonBlock?.id ?? seasonBlock?.number ?? seasonBlock?.name ?? (idx + 1)),
                episodes: normalizeEpisodeArray(
                    seasonBlock?.episodes ?? seasonBlock?.series ?? seasonBlock?.items ?? seasonBlock?.list ?? seasonBlock?.children ?? []
                )
            })).filter(block => block.season && block.episodes.length);
        }

        if (typeof info === 'object') {
            return Object.entries(info).map(([seasonKey, rawSeason], idx) => {
                const seasonObject = rawSeason && typeof rawSeason === 'object' ? rawSeason : {};
                const episodesSource =
                    seasonObject.episodes
                    ?? seasonObject.series
                    ?? seasonObject.items
                    ?? seasonObject.list
                    ?? seasonObject.children
                    ?? rawSeason;

                return {
                    season: String(seasonObject.season ?? seasonObject.id ?? seasonObject.number ?? seasonObject.name ?? seasonKey ?? (idx + 1)),
                    episodes: normalizeEpisodeArray(episodesSource)
                };
            }).filter(block => block.season && block.episodes.length);
        }

        return [];
    })();

    if (normalizedFromEpisodesInfo.length) return normalizedFromEpisodesInfo;

    const seriesInfo = root?.seriesInfo;
    if (!seriesInfo || typeof seriesInfo !== 'object') {
        return [];
    }

    const seasonMap = new Map();
    const preferredTranslatorId = String(currentTranslationId || '');
    const sortedSeriesEntries = Object.entries(seriesInfo)
        .filter(([, entry]) => entry && typeof entry === 'object')
        .sort(([a], [b]) => {
            if (String(a) === preferredTranslatorId) return -1;
            if (String(b) === preferredTranslatorId) return 1;
            return Number(a) - Number(b);
        });

    sortedSeriesEntries.forEach(([translatorIdKey, seriesEntry]) => {
        const episodesBySeason = seriesEntry.episodes || {};
        const translatorId = String(seriesEntry.translator_id || translatorIdKey || preferredTranslatorId || '');
        const translatorName = seriesEntry.translator_name || currentTranslators[translatorId]?.name || currentTranslatorName || 'Translator';
        const translatorPremium = !!(seriesEntry.premium || currentTranslators[translatorId]?.premium);

        Object.entries(episodesBySeason).forEach(([seasonKey, episodeSet]) => {
            let episodeValues = [];

            if (Array.isArray(episodeSet)) {
                episodeValues = episodeSet;
            } else if (episodeSet instanceof Set) {
                episodeValues = Array.from(episodeSet);
            } else if (episodeSet && typeof episodeSet === 'object') {
                episodeValues = Object.keys(episodeSet);
            }

            const season = String(seasonKey);
            if (!seasonMap.has(season)) seasonMap.set(season, new Map());

            episodeValues.map(v => String(v)).forEach(episode => {
                const episodeMap = seasonMap.get(season);
                if (!episodeMap.has(episode)) {
                    episodeMap.set(episode, {episode, translations: []});
                }

                const episodeInfo = episodeMap.get(episode);
                if (!episodeInfo.translations.some(t => String(t.translator_id) === translatorId)) {
                    episodeInfo.translations.push({
                        translator_id: translatorId,
                        translator_name: translatorName,
                        premium: translatorPremium
                    });
                }
            });
        });
    });

    return Array.from(seasonMap.entries())
        .map(([season, episodeMap]) => ({
            season,
            episodes: Array.from(episodeMap.values())
                .sort((a, b) => Number(a.episode) - Number(b.episode))
        }))
        .filter(block => block.season && block.episodes.length)
        .sort((a, b) => Number(a.season) - Number(b.season));
}

function getFlatEpisodes() {
    const normalized = getNormalizedEpisodesInfo();
    if (!normalized.length) return [];

    return normalized.flatMap(seasonBlock =>
        (seasonBlock.episodes || []).map(ep => ({
            season: String(seasonBlock.season),
            episode: String(ep.episode)
        }))
    );
}

function getAdjacentEpisode(direction) {
    const episodes = getFlatEpisodes();
    if (!episodes.length || !currentSelectedSeason || !currentSelectedEpisode) return null;

    const currentIndex = episodes.findIndex(ep =>
        ep.season === String(currentSelectedSeason) && ep.episode === String(currentSelectedEpisode)
    );

    if (currentIndex === -1) return null;

    const nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    if (nextIndex < 0 || nextIndex >= episodes.length) return null;

    return episodes[nextIndex];
}

function getAvailableTranslatorsForCurrentEpisode() {
    if (!isSeriesItem(currentSelectedItem)) {
        return Object.entries(currentTranslators || {}).filter(([, data]) => !!data);
    }

    const season = String(currentSelectedSeason || '');
    const episode = String(currentSelectedEpisode || '');
    const normalized = getNormalizedEpisodesInfo();

    const seasonBlock = normalized.find(block => String(block.season) === season);
    const episodeBlock = seasonBlock?.episodes?.find(ep => String(ep.episode) === episode);
    const translations = Array.isArray(episodeBlock?.translations) ? episodeBlock.translations : [];

    if (!translations.length) {
        return Object.entries(currentTranslators || {}).filter(([, data]) => !!data);
    }

    const allowedIds = new Set(
        translations.map(t => String(t.translator_id ?? t.id)).filter(Boolean)
    );

    return Object.entries(currentTranslators || {})
        .filter(([id, data]) => !!data && allowedIds.has(String(id)));
}

function ensureTranslatorAvailableForCurrentEpisode() {
    const availableEntries = getAvailableTranslatorsForCurrentEpisode();

    if (!availableEntries.length) {
        return false;
    }

    const hasCurrent = currentTranslationId &&
        availableEntries.some(([id]) => String(id) === String(currentTranslationId));

    if (hasCurrent) {
        return true;
    }

    const nextEntry = availableEntries[0];
    if (!nextEntry) {
        return false;
    }

    currentTranslationId = String(nextEntry[0]);
    currentTranslatorName = nextEntry[1]?.name || `Translator ${nextEntry[0]}`;
    currentTranslatorPremium = !!nextEntry[1]?.premium;

    return true;
}

// =========================
// AUTOPLAY NEXT EPISODE
// =========================

function clearNextEpisodeOverlay() {
    if (nextEpisodeCountdownTimer) {
        clearInterval(nextEpisodeCountdownTimer);
        nextEpisodeCountdownTimer = null;
    }

    nextEpisodeCountdownValue = 5;
    pendingNextEpisode = null;

    const overlay = document.getElementById('next-episode-overlay');
    if (overlay) {
        overlay.style.display = 'none';
    }

    const countdown = document.getElementById('next-episode-countdown');
    if (countdown) {
        countdown.textContent = 'Next episode in 5s';
    }
}

function updateAutoplayButtonLabel() {
    const btn = document.querySelector('[data-type="player-autoplay-toggle"]');
    if (btn) {
        btn.textContent = `Autoplay: ${autoplayNextEpisodeEnabled ? 'On' : 'Off'}`;
    }
}


function formatPlayerTime(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;

    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function updatePlayerProgressUI(video = document.getElementById('player-video')) {
    if (currentScreen !== 'player') return;
    const currentEl = document.getElementById('player-current-time');
    const totalEl = document.getElementById('player-total-time');
    const fillEl = document.getElementById('player-seekbar-fill');
    const seekBtn = document.getElementById('player-seekbar');
    if (!currentEl || !totalEl || !fillEl || !seekBtn) return;

    const currentTime = Number(video?.currentTime || 0);
    const duration = Number(video?.duration || 0);
    const progress = duration > 0 ? Math.max(0, Math.min(100, (currentTime / duration) * 100)) : 0;

    currentEl.textContent = formatPlayerTime(currentTime);
    totalEl.textContent = formatPlayerTime(duration);
    fillEl.style.width = `${progress}%`;

    const isFocused = seekBtn.classList.contains('focus');
    seekBtn.style.border = isFocused ? '2px solid #57a6ff' : '1px solid rgba(255,255,255,0.08)';
    seekBtn.style.boxShadow = isFocused
        ? '0 0 0 4px rgba(87,166,255,0.22), 0 10px 30px rgba(87,166,255,0.25)'
        : 'none';
}

function seekPlayerBy(deltaSeconds) {
    const video = document.getElementById('player-video');
    if (!video) return;

    const duration = Number(video.duration || 0);
    const current = Number(video.currentTime || 0);
    const target = duration > 0
        ? Math.max(0, Math.min(duration, current + deltaSeconds))
        : Math.max(0, current + deltaSeconds);

    video.currentTime = target;
    updatePlayerProgressUI(video);
    showPlayerOverlayAndSchedule(2200);
}

async function playSpecificEpisode(season, episode) {
    clearNextEpisodeOverlay();
    currentSelectedSeason = String(season);
    currentSelectedEpisode = String(episode);

    renderSeriesPanels();
    updatePlayerMeta();

    autoplayHandledPlaybackKey = null;
    await openPlayerForSelected();
}

function maybeStartNextEpisodeCountdown() {
    clearNextEpisodeOverlay();

    if (!autoplayNextEpisodeEnabled) return;
    if (!isSeriesItem(currentSelectedItem)) return;

    const nextEpisode = getAdjacentEpisode('next');
    if (!nextEpisode) return;

    pendingNextEpisode = nextEpisode;

    const overlay = document.getElementById('next-episode-overlay');
    const title = document.getElementById('next-episode-title');
    const countdown = document.getElementById('next-episode-countdown');

    if (!overlay || !title || !countdown) return;

    title.textContent = `Season ${nextEpisode.season} • Episode ${nextEpisode.episode}`;
    nextEpisodeCountdownValue = 5;
    countdown.textContent = `Next episode in ${nextEpisodeCountdownValue}s`;
    overlay.style.display = 'block';

    nextEpisodeCountdownTimer = setInterval(async () => {
        nextEpisodeCountdownValue -= 1;

        if (nextEpisodeCountdownValue <= 0) {
            clearNextEpisodeOverlay();
            await playSpecificEpisode(nextEpisode.season, nextEpisode.episode);
            return;
        }

        countdown.textContent = `Next episode in ${nextEpisodeCountdownValue}s`;
    }, 1000);

    setTimeout(refreshFocusables, 20);
}

function triggerAutoplayNextEpisode(playbackKey) {
    if (!playbackKey) return;
    if (autoplayHandledPlaybackKey === playbackKey) return;

    autoplayHandledPlaybackKey = playbackKey;
    playerStatus = "Ended";
    updatePlayerMeta();
    maybeStartNextEpisodeCountdown();
}

function hideEpisodeControls() {
    const episodesBtn = document.getElementById("player-episodes-btn");
    const prevEpisodeBtn = document.querySelector('[data-type="player-prev-episode"]');
    const nextEpisodeBtn = document.querySelector('[data-type="player-next-episode"]');

    if (episodesBtn) episodesBtn.style.display = "none";
    if (prevEpisodeBtn) prevEpisodeBtn.style.display = "none";
    if (nextEpisodeBtn) nextEpisodeBtn.style.display = "none";
}

function updatePlayerSeriesControls(isSeriesType) {
    const prevEpisodeBtn = document.querySelector('[data-type="player-prev-episode"]');
    const nextEpisodeBtn = document.querySelector('[data-type="player-next-episode"]');
    const autoplayBtn = document.querySelector('[data-type="player-autoplay-toggle"]');
    const episodeControlsGroup = document.getElementById('player-episode-controls-group');
    const fallbackEpisodeControlsGroup = document.getElementById("player-episodes-btn")?.closest('.btn-row')?.parentElement;
    const display = isSeriesType ? "inline-flex" : "none";

    hideEpisodeControls();
    if (prevEpisodeBtn) prevEpisodeBtn.style.display = display;
    if (nextEpisodeBtn) nextEpisodeBtn.style.display = display;
    if (autoplayBtn) autoplayBtn.style.display = display;

    if (episodeControlsGroup) {
        episodeControlsGroup.style.display = 'none';
    } else if (fallbackEpisodeControlsGroup) {
        fallbackEpisodeControlsGroup.style.display = 'none';
    }
}

function closePlayerToDetails() {
    const video = document.getElementById('player-video');
    clearNextEpisodeOverlay();
    persistCurrentPlaybackProgress();

    if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
    }

    clearPlayerOverlayHideTimer();
    restoreAppLayoutAfterPlayer();
    playerStatus = "Paused";
    updatePlayerMeta();
    switchScreen('details');
}

function ensureSeriesSelection() {
    const normalized = getNormalizedEpisodesInfo();
    if (currentSelectedSeason && currentSelectedEpisode) {
        return true;
    }

    if (!normalized.length) {
        return false;
    }

    const firstSeasonBlock = normalized[0] || null;
    const firstEpisodeBlock = firstSeasonBlock?.episodes?.[0] || null;

    if (!currentSelectedSeason && firstSeasonBlock?.season != null) {
        currentSelectedSeason = String(firstSeasonBlock.season);
    }
    if (!currentSelectedEpisode && firstEpisodeBlock?.episode != null) {
        currentSelectedEpisode = String(firstEpisodeBlock.episode);
    }

    return !!(currentSelectedSeason && currentSelectedEpisode);
}

// =========================
// SCREEN DATA LOADING
// =========================

async function reloadContent() {
    try {
        currentHomeItems = await loadMoviesFromAPI('matrix');
        renderRows('home-content', 'Search Results', 'Реальные данные с backend', currentHomeItems);
        currentSearchItems = [...currentHomeItems];
        currentSearchQuery = "matrix";

        const input = document.getElementById("searchInput");
        if (input) {
            input.value = currentSearchQuery;
        }

        renderSearchResults(currentSearchItems);
        await refreshContinueWatching();
        setTimeout(refreshFocusables, 20);
    } catch (err) {
        const target = document.getElementById('home-content');
        if (target) target.innerHTML = `<div class="empty-box">Ошибка загрузки API: ${escapeHtml(err.message)}</div>`;
    }
}

// =========================
// DETAILS SCREEN
// =========================

async function openDetailsForItem(item, options = {}) {
    if (!item?.sourceUrl) return;

    const requestToken = ++currentDetailsRequestToken;
    const isDifferentItem = currentSelectedItem?.sourceUrl !== item.sourceUrl;
    closePreplayModal();
    currentSelectedItem = item;

    const savedEntry = mergeContinueSourcesExact(loadContinueWatching(), remoteContinueItems)
        .filter(entry => entry.sourceUrl === item.sourceUrl)
        .sort((a, b) => {
            const seasonDiff = Number(b.season || b.savedSeason || 0) - Number(a.season || a.savedSeason || 0);
            if (seasonDiff !== 0) return seasonDiff;

            const episodeDiff = Number(b.episode || b.savedEpisode || 0) - Number(a.episode || a.savedEpisode || 0);
            if (episodeDiff !== 0) return episodeDiff;

            return Number(b.currentTime || b.savedTime || 0) - Number(a.currentTime || a.savedTime || 0);
        })[0] || null;

    if (!options.preservePlaybackState && savedEntry) {
        currentSelectedSeason = savedEntry.savedSeason || savedEntry.season || currentSelectedSeason || null;
        currentSelectedEpisode = savedEntry.savedEpisode || savedEntry.episode || currentSelectedEpisode || null;
        currentTranslationId = savedEntry.savedTranslationId || savedEntry.translationId || currentTranslationId || null;
        currentTranslatorName = savedEntry.savedTranslatorName || savedEntry.translatorName || currentTranslatorName || null;
        currentQuality = savedEntry.savedQuality || savedEntry.quality || currentQuality || null;
        pendingPreplayResumeTime = Number(savedEntry.savedTime || savedEntry.currentTime || 0) || 0;
    }

    if (isDifferentItem) {
        currentEpisodesData = null;
        if (!options.preservePlaybackState) {
            currentSelectedSeason = savedEntry?.savedSeason || savedEntry?.season || null;
            currentSelectedEpisode = savedEntry?.savedEpisode || savedEntry?.episode || null;
            currentTranslationId = savedEntry?.savedTranslationId || savedEntry?.translationId || null;
            currentTranslatorName = savedEntry?.savedTranslatorName || savedEntry?.translatorName || null;
            currentTranslatorPremium = false;
            resetSubtitleState();
        }
        isPlayerEpisodesOpen = false;
        clearNextEpisodeOverlay();
        hideEpisodeControls();
    }

    renderDetails(item);
    switchScreen('details');

    let translatorsPromise = deferResult(loadMovieTranslatorsCached(item.sourceUrl));
    let episodesPromise = isSeriesItem(item)
        ? deferResult(loadEpisodesDataWithRetryCached(item.sourceUrl))
        : null;

    try {
        const details = await loadMovieDetailsCached(item.sourceUrl);
        if (requestToken !== currentDetailsRequestToken) return;
        const merged = {...item, ...details, meta: item.meta};
        currentSelectedItem = merged;
        renderDetails(merged, details);
        renderTranslatorButtons();
        setTimeout(refreshFocusables, 20);
        if (!episodesPromise && isSeriesItem(merged)) {
            episodesPromise = deferResult(loadEpisodesDataWithRetryCached(item.sourceUrl));
        }
    } catch (err) {
    }

    try {
        const translatorsData = translatorsPromise
            ? await unwrapResult(translatorsPromise)
            : await loadMovieTranslatorsCached(item.sourceUrl);
        if (requestToken !== currentDetailsRequestToken) return;
        currentTranslators = translatorsData.translators || {};

        if (currentTranslationId && !currentTranslators[currentTranslationId]) {
            currentTranslationId = null;
        }


        if (!applyTranslatorState(currentTranslationId) && !currentTranslationId && !applyPreferredTranslatorIfAvailable()) {
            const firstTranslatorEntry = Object.entries(currentTranslators)[0] || null;
            if (firstTranslatorEntry) {
                currentTranslationId = String(firstTranslatorEntry[0]);
                applyTranslatorState(currentTranslationId);
            }
        }


        renderTranslatorButtons();
    } catch (err) {
        currentTranslators = {};
        renderTranslatorButtons();
    }

    try {
        const isSeriesType = isSeriesItem(currentSelectedItem);
        if (!isSeriesType) {
            currentEpisodesData = null;
            currentSelectedSeason = null;
            currentSelectedEpisode = null;
            renderSeriesPanels();
            setTimeout(refreshFocusables, 20);
            return;
        }
        const episodesData = episodesPromise
            ? await unwrapResult(episodesPromise)
            : await loadEpisodesDataWithRetryCached(item.sourceUrl);
        if (requestToken !== currentDetailsRequestToken) return;
        currentEpisodesData = episodesData;

        if (!getNormalizedEpisodesInfo().length) {
            setTimeout(async () => {
                if (requestToken !== currentDetailsRequestToken) return;
                try {
                    currentEpisodesData = await loadEpisodesDataWithRetryCached(item.sourceUrl, 2, {force: true});
                    ensureSeriesSelection();
                    ensureTranslatorAvailableForCurrentEpisode();
                    renderSeriesPanels();
                    renderTranslatorButtons();
                    setTimeout(refreshFocusables, 20);
                } catch (retryError) {
                }
            }, 1200);
        }

        ensureSeriesSelection();
        ensureTranslatorAvailableForCurrentEpisode();
        renderSeriesPanels();
        renderTranslatorButtons();
        setTimeout(refreshFocusables, 20);
    } catch (e) {
        currentEpisodesData = null;
        if (requestToken === currentDetailsRequestToken && isSeriesItem(currentSelectedItem)) {
            setTimeout(async () => {
                if (requestToken !== currentDetailsRequestToken) return;
                try {
                    currentEpisodesData = await loadEpisodesDataWithRetryCached(item.sourceUrl, 2, {force: true});
                    ensureSeriesSelection();
                    ensureTranslatorAvailableForCurrentEpisode();
                    renderSeriesPanels();
                    renderTranslatorButtons();
                    setTimeout(refreshFocusables, 20);
                } catch (retryError) {
                }
            }, 1600);
        }
    }
}

// =========================
// PLAYER
// =========================

async function openPlayerForSelected(initialTime = 0) {
    clearNextEpisodeOverlay();
    autoplayHandledPlaybackKey = null;
    if (!currentSelectedItem?.sourceUrl) return;

    const continueEntry = findContinueEntryForCurrentItem();
    const effectiveInitialTime = Number(initialTime || pendingPreplayResumeTime || continueEntry?.currentTime || continueEntry?.savedTime || 0);
    pendingResumeTime = effectiveInitialTime > 0 ? effectiveInitialTime : 0;
    const resumeTargetSeconds = Number(effectiveInitialTime || 0);

    const setResumeTargetOnVideo = () => {
        const resumeVideo = document.getElementById('player-video');
        if (!resumeVideo) return;
        resumeVideo.dataset.resumeTarget = pendingResumeTime > 0 ? String(pendingResumeTime) : '';
    };

    setResumeTargetOnVideo();

    if (continueEntry) {
        if (!currentSelectedSeason && (continueEntry.season || continueEntry.savedSeason)) {
            currentSelectedSeason = String(continueEntry.season || continueEntry.savedSeason);
        }
        if (!currentSelectedEpisode && (continueEntry.episode || continueEntry.savedEpisode)) {
            currentSelectedEpisode = String(continueEntry.episode || continueEntry.savedEpisode);
        }

        currentTranslationId = (continueEntry.translationId || continueEntry.savedTranslationId)
            ? String(continueEntry.translationId || continueEntry.savedTranslationId)
            : (currentTranslationId || null);

        currentTranslatorName = continueEntry.translatorName || continueEntry.savedTranslatorName || currentTranslatorName || null;

        if (!currentQuality && (continueEntry.quality || continueEntry.savedQuality)) {
            currentQuality = continueEntry.quality || continueEntry.savedQuality;
        }
    }
    const isSeriesType = isSeriesItem(currentSelectedItem);

    if (isSeriesType && !getNormalizedEpisodesInfo().length) {
        try {
            const episodesData = await loadEpisodesDataWithRetryCached(currentSelectedItem.sourceUrl);
            currentEpisodesData = episodesData;

            renderSeriesPanels();
        } catch (e) {
        }
    }
    if (isSeriesType) {
        renderSeriesPanels();

        let resolved = ensureSeriesSelection();

        if (!resolved) {
            const normalized = getNormalizedEpisodesInfo();
            const fallbackSeason = normalized[0]?.season || '1';
            const fallbackEpisode = normalized[0]?.episodes?.[0]?.episode || '1';

            currentSelectedSeason = String(currentSelectedSeason || fallbackSeason);
            currentSelectedEpisode = String(currentSelectedEpisode || fallbackEpisode);
            resolved = !!(currentSelectedSeason && currentSelectedEpisode);
        }
        ensureTranslatorAvailableForCurrentEpisode();

        if (!resolved) {
            const desc = document.getElementById('player-desc');
            if (desc) {
                desc.textContent = 'Не удалось определить сезон и серию.';
            }
            renderSeriesPanels();
            setTimeout(refreshFocusables, 20);
            return;
        }
    }
    const title = document.getElementById('player-title');
    const desc = document.getElementById('player-desc');
    const video = document.getElementById('player-video');
    if (!title || !desc || !video) return;

    currentVideoFitMode = playerPrefs.preferredFitMode || 'contain';
    ensureFitModeButton();
    currentTranslators = {};
    resetSubtitleState({video, clearTracks: true});

    try {
        const translatorsData = await loadMovieTranslatorsCached(currentSelectedItem.sourceUrl);
        currentTranslators = translatorsData.translators || {};

        const entries = Object.entries(currentTranslators);

        if (entries.length > 0 && currentTranslationId && !currentTranslators[currentTranslationId]) {
            currentTranslationId = null;
        }

        if (!applyTranslatorState(currentTranslationId, {clearMissing: true})) {
            applyPreferredTranslatorIfAvailable();
        }

        if (isSeriesType) {
            ensureTranslatorAvailableForCurrentEpisode();
        }
        updatePlayerMeta();
        updatePlayerSeriesControls(isSeriesType);
        ensurePlayerOverlayControlLayout();
    } catch (e) {
    }
    title.textContent = currentSelectedItem.title || 'Player';
    desc.textContent = effectiveInitialTime && Number.isFinite(effectiveInitialTime)
        ? `Загружаем stream URL... resume с ${effectiveInitialTime} сек.`
        : 'Загружаем stream URL...';
    video.removeAttribute('src');
    video.load();
    switchScreen('player');
    applyPlayerFullscreenLayout();
    showPlayerOverlay();
    setTimeout(() => {
        if (currentScreen === 'player') {
            focusPlayerToggleButton({visibleOnly: true});
        }
    }, 20);
    try {
        const preferredQuality = currentQuality;
        const res = await fetch(buildStreamUrl({
            url: currentSelectedItem.sourceUrl,
            translation: currentTranslationId,
            season: currentSelectedSeason,
            episode: currentSelectedEpisode
        }));
        if (!res.ok) throw new Error('Не удалось получить stream');
        const streamData = await res.json();
        currentStreams = streamData;
        if (streamData.translator_id) {
            currentTranslationId = String(streamData.translator_id);
        }

        applyTranslatorState(currentTranslationId, {clearMissing: true});

        if (isSeriesType) {
            ensureTranslatorAvailableForCurrentEpisode();
        }

        const selectedStream = pickStreamByQuality(streamData, preferredQuality);
        const streamUrl = selectedStream.url;
        currentQuality = selectedStream.quality;

        if (!streamUrl) {
            desc.textContent = 'Backend не вернул подходящую ссылку на видео.';
            return;
        }

        syncCurrentPlaybackToRemote({force: true});

        playerStatus = "Loading";
        updatePlayerMeta();
        renderQualityButtons();
        renderSeriesPanel("player-series-panel");
        updatePlayerProgressUI(video);

        const playbackKey = `${currentSelectedItem.sourceUrl}__${currentSelectedSeason || ''}__${currentSelectedEpisode || ''}__${Date.now()}`;
        video.dataset.playbackKey = playbackKey;

        video.dataset.resumeTarget = resumeTargetSeconds > 0 ? String(resumeTargetSeconds) : '';
        video.dataset.resumeSeeking = '';
        video.dataset.resumeApplied = resumeTargetSeconds > 0 ? '' : '1';

        video.onloadedmetadata = null;
        video.onloadeddata = null;
        video.oncanplay = null;
        video.onseeked = null;
        video.ontimeupdate = null;
        video.onended = null;

        const startPlayback = () => {
            playerStatus = "Playing";
            updatePlayerMeta();
            video.play().then(() => {
                showPlayerOverlayAndSchedule(1800);
            }).catch(() => {
            });
        };

        const markResumeApplied = () => {
            pendingResumeTime = 0;
            video.dataset.resumeTarget = '';
            video.dataset.resumeSeeking = '';
            video.dataset.resumeApplied = '1';
            if (playerStatus === "Loading") startPlayback();
        };

        const applyResumeTarget = () => {
            const resumeTarget = Number(video.dataset.resumeTarget || pendingResumeTime || resumeTargetSeconds || 0);
            if (!resumeTarget || resumeTarget <= 0) return;
            if (video.dataset.resumeApplied === '1' || video.dataset.resumeSeeking === '1') return;

            if (video.currentTime >= Math.max(1, resumeTarget - 3)) {
                markResumeApplied();
                return;
            }

            if (video.readyState >= 1 || Number.isFinite(video.duration)) {
                pendingResumeTime = resumeTarget;
                video.dataset.resumeSeeking = '1';
                if (!tryApplyResumeTime(video, resumeTarget, desc)) {
                    video.dataset.resumeSeeking = '';
                }
            }
        };

        video.src = streamUrl;
        video.load();

        applyResumeTarget();
        setTimeout(applyResumeTarget, 400);
        setTimeout(applyResumeTarget, 1400);

        try {
            await refreshSubtitlesForCurrentPlayback(pendingSubtitleLanguage || currentSubtitleLanguage);
        } catch (subtitleError) {
            resetSubtitleState({video, clearTracks: true, updateMeta: true});
        }

        pendingSubtitleLanguage = null;

        video.onloadedmetadata = () => {
            applyFullscreenVideoPresentation(video);
            video.onended = () => {
                triggerAutoplayNextEpisode(video.dataset.playbackKey || playbackKey);
            };
            applyResumeTarget();

            updatePlayerProgressUI(video);
        };

        video.onloadeddata = () => {
            applyResumeTarget();
        };

        video.oncanplay = () => {
            updatePlayerProgressUI(video);
            applyResumeTarget();

            if (video.dataset.resumeTarget && video.dataset.resumeApplied !== '1') return;
            startPlayback();
        };

        video.onseeked = () => {
            const resumeTarget = Number(video.dataset.resumeTarget || pendingResumeTime || 0);
            if (resumeTarget > 0 && Math.abs(video.currentTime - resumeTarget) <= 3) {
                markResumeApplied();
            } else {
                video.dataset.resumeSeeking = '';
            }
        };

        let lastPersistSecond = -1;
        video.ontimeupdate = () => {
            updatePlayerProgressUI(video);
            const second = Math.floor(video.currentTime);

            const resumeTarget = Number(video.dataset.resumeTarget || pendingResumeTime || 0);

            if (resumeTarget > 0 && second > 0 && Math.abs(second - resumeTarget) <= 3) {
                markResumeApplied();
            }

            if (resumeTarget > 0 && second > 0 && second < Math.max(3, resumeTarget - 5)) {
                video.dataset.resumeSeeking = '';
                applyResumeTarget();
            }

            if (second > 0 && second % 15 === 0 && second !== lastPersistSecond) {
                lastPersistSecond = second;
                persistCurrentPlaybackProgress();
            }

            if (
                autoplayNextEpisodeEnabled &&
                isSeriesItem(currentSelectedItem) &&
                Number.isFinite(video.duration) &&
                video.duration > 0 &&
                (video.duration - video.currentTime) <= 0.75
            ) {
                triggerAutoplayNextEpisode(video.dataset.playbackKey || playbackKey);
            }

        };

        setTimeout(() => {
            const resumeTarget = Number(video.dataset.resumeTarget || pendingResumeTime || effectiveInitialTime || 0);
            if (resumeTarget > 0 && Math.abs(video.currentTime - resumeTarget) <= 3) {
                markResumeApplied();
            } else if (resumeTarget > 0 && video.currentTime < Math.max(3, resumeTarget - 5)) {
                video.dataset.resumeSeeking = '';
                applyResumeTarget();
            }
        }, 1500);

    } catch (err) {
        desc.textContent = currentTranslatorPremium
            ? `Не удалось загрузить premium-озвучку: ${err.message}`
            : `Ошибка загрузки stream: ${err.message}`;
    }
    setTimeout(refreshFocusables, 20);
}

async function switchToEpisode(direction) {
    clearNextEpisodeOverlay();

    if ((!currentSelectedSeason || !currentSelectedEpisode) && getNormalizedEpisodesInfo().length) {
        ensureSeriesSelection();
    }

    const targetEpisode = getAdjacentEpisode(direction);
    if (!targetEpisode) return;

    currentSelectedSeason = targetEpisode.season;
    currentSelectedEpisode = targetEpisode.episode;

    renderSeriesPanels();
    updatePlayerMeta();

    await openPlayerForSelected();
}

function togglePlayerEpisodesPanel() {
    const normalized = getNormalizedEpisodesInfo();
    if (!normalized.length) return;

    ensureSeriesSelection();
    isPlayerEpisodesOpen = !isPlayerEpisodesOpen;
    renderSeriesPanels();
    setTimeout(refreshFocusables, 20);
}

function closePreplayModal() {
    const modal = document.getElementById('preplay-modal');
    if (modal) {
        modal.style.display = 'none';
    }

    closeTranslatorDropdown();
}

function openPreplayModal() {
    const modal = document.getElementById('preplay-modal');
    const title = document.getElementById('preplay-title');
    const desc = document.getElementById('preplay-desc');
    const selection = document.getElementById('preplay-selection');
    const label = document.getElementById('translator-select-label');

    if (!modal) return;

    const isSeries = isSeriesItem(currentSelectedItem);
    ensureTranslatorAvailableForCurrentEpisode();
    closeTranslatorDropdown();

    const seasonText = currentSelectedSeason || '—';
    const episodeText = currentSelectedEpisode || '—';
    const translatorText = currentTranslatorName || 'Default translator';
    const qualityText = currentQuality || playerPrefs.preferredQuality || 'Auto';
    const summaryText = isSeries
        ? `Season ${seasonText} • Episode ${episodeText}\nVoice acting: ${translatorText}\nQuality: ${qualityText}`
        : `Voice acting: ${translatorText}\nQuality: ${qualityText}`;

    if (title) {
        title.textContent = currentSelectedItem?.title || 'Ready to play';
    }

    if (desc) {
        desc.textContent = isSeries
            ? 'Review the selected episode and voice acting before playback starts.'
            : 'Review the selected voice acting before playback starts.';
    }

    if (selection) {
        selection.textContent = summaryText;
        selection.style.whiteSpace = 'pre-line';
    }

    if (label) {
        label.textContent = translatorText;
    }

    modal.style.display = 'flex';
    renderTranslatorButtons();
    setTimeout(refreshFocusables, 20);
    focusPreplayStartButton();
}

function focusPreplayStartButton() {
    setTimeout(() => {
        const startBtn = document.querySelector('#preplay-modal [data-type="preplay-start"]');
        if (!startBtn) return;

        refreshFocusables();
        setFocusedElement(startBtn, {selector: '#preplay-modal [data-focusable="true"]', focus: true});
    }, 80);
}

function closeTranslatorDropdown() {
    isTranslatorDropdownOpen = false;

    const container = document.getElementById('translator-buttons');
    const trigger = document.getElementById('translator-select-trigger');

    if (container) {
        container.style.display = 'none';
    }

    if (trigger) {
        trigger.setAttribute('aria-expanded', 'false');
        trigger.style.background = 'rgba(255,255,255,0.10)';
    }
}

function openTranslatorDropdown() {
    isTranslatorDropdownOpen = true;

    const container = document.getElementById('translator-buttons');
    const trigger = document.getElementById('translator-select-trigger');

    if (container) {
        container.style.display = 'block';
    }

    if (trigger) {
        trigger.setAttribute('aria-expanded', 'true');
        trigger.style.background = 'rgba(87,166,255,0.18)';
    }

    renderTranslatorButtons();

    setTimeout(() => {
        const options = Array.from(document.querySelectorAll('#translator-buttons [data-type="translator"]'));
        const selectedOption = options.find(option => String(option.dataset.id) === String(currentTranslationId));
        const firstOption = selectedOption || options[0];
        if (!firstOption) return;

        refreshFocusables();
        setFocusedElement(firstOption, {selector: '#preplay-modal [data-focusable="true"]', focus: true});
    }, 60);
}

function toggleTranslatorDropdown() {
    if (isTranslatorDropdownOpen) {
        closeTranslatorDropdown();
        focusPreplayStartButton();
        return;
    }

    openTranslatorDropdown();
}

function applyPlayerFullscreenLayout() {
    const {sidebar, ...elements} = getPlayerLayoutElements();
    const styles = getPlayerLayoutStyles();

    if (sidebar) {
        if (savedAppChromeDisplay === null) {
            savedAppChromeDisplay = sidebar.style.display || '';
        }
        sidebar.style.display = 'none';
    }

    Object.entries(styles).forEach(([key, value]) => setElementStyles(elements[key], value));
}


function restoreAppLayoutAfterPlayer() {
    const {sidebar, ...elements} = getPlayerLayoutElements();
    const styles = getPlayerLayoutStyles();

    if (sidebar) {
        sidebar.style.display = savedAppChromeDisplay ?? '';
    }

    Object.entries(styles).forEach(([key, value]) => clearElementStyles(elements[key], value));
}

function applyFullscreenVideoPresentation(video = document.getElementById('player-video')) {
    if (!video) return;

    const fitMode = currentVideoFitMode || playerPrefs.preferredFitMode || 'contain';
    const isSeries = isSeriesItem(currentSelectedItem);

    const SERIES_ZOOM = 1.2;
    const MOVIE_ZOOM = 1;

    video.style.position = 'absolute';
    video.style.inset = '0';
    video.style.left = '0';
    video.style.top = '0';
    video.style.width = '100%';
    video.style.height = '100%';
    video.style.minWidth = '0';
    video.style.minHeight = '0';
    video.style.maxWidth = 'none';
    video.style.maxHeight = 'none';
    video.style.display = 'block';
    video.style.margin = '0';
    video.style.padding = '0';
    video.style.borderRadius = '0';
    video.style.objectPosition = 'center center';
    video.style.transformOrigin = 'center center';

    if (fitMode === 'zoom') {
        video.style.objectFit = 'cover';
        video.style.transform = isSeries
            ? `scale(${SERIES_ZOOM})`
            : `scale(${MOVIE_ZOOM})`;
    } else {
        video.style.objectFit = 'contain';
        video.style.transform = 'scale(1)';
    }

    updateFitModeButtonLabel();
}

function updateFitModeButtonLabel() {
    const btn = document.querySelector('[data-type="player-fit-toggle"]');
    if (!btn) return;

    const fitMode = currentVideoFitMode || playerPrefs.preferredFitMode || 'contain';
    btn.textContent = fitMode === 'zoom'
        ? 'Frame: Zoom fill'
        : 'Frame: Full frame';
}

function ensureFitModeButton() {
    const playbackRow = document.querySelector('#screen-player [data-type="player-toggle"]')?.closest('.btn-row');
    if (!playbackRow) return;

    let btn = document.querySelector('#screen-player [data-type="player-fit-toggle"]');
    if (!btn) {
        btn = document.createElement('button');
        btn.className = 'action-btn secondary';
        btn.setAttribute('data-focusable', 'true');
        btn.setAttribute('data-type', 'player-fit-toggle');
        playbackRow.appendChild(btn);
    }

    btn.style.display = 'inline-flex';
    updateFitModeButtonLabel();
    ensurePlayerOverlayControlLayout();
}

function updatePlayerToggleButtonLabel() {
    const btn = document.querySelector('#screen-player [data-type="player-toggle"]');
    const video = document.getElementById('player-video');
    if (!btn) return;

    btn.textContent = video && !video.paused ? '❚❚' : '▶';
    btn.style.display = 'inline-flex';
    btn.style.alignItems = 'center';
    btn.style.justifyContent = 'center';
    btn.style.textAlign = 'center';
    btn.style.padding = '0';
    btn.style.lineHeight = '1';
    btn.style.color = '#ffffff';
    btn.style.background = 'rgba(255,255,255,0.10)';
    btn.style.border = '1px solid rgba(255,255,255,0.22)';
    btn.style.boxShadow = '0 8px 24px rgba(0,0,0,0.18)';
    btn.style.borderRadius = '22px';
    syncPlayerToggleFocusStyle();
}

function syncPlayerToggleFocusStyle() {
    if (currentScreen !== 'player') return;
    const btn = document.querySelector('#screen-player [data-type="player-toggle"]');
    if (!btn) return;

    const isFocused = btn.classList.contains('focus');

    if (isFocused) {
        btn.style.border = '2px solid #6ea8ff';
        btn.style.boxShadow = '0 0 0 4px rgba(110,168,255,0.22), 0 8px 24px rgba(0,0,0,0.18)';
    } else {
        btn.style.border = '1px solid rgba(255,255,255,0.22)';
        btn.style.boxShadow = '0 8px 24px rgba(0,0,0,0.18)';
    }
}

function updateQualityDropdownLabel() {
    const btn = document.querySelector('#screen-player [data-type="quality-toggle"]');
    if (!btn) return;

    btn.textContent = currentQuality ? `Quality: ${currentQuality} ▾` : 'Quality ▾';
}

function closeQualityDropdown() {
    isQualityDropdownOpen = false;
    const menu = document.getElementById('quality-options-menu');
    if (menu) {
        menu.style.display = 'none';
    }
    updateQualityDropdownLabel();
}

function openQualityDropdown() {
    isQualityDropdownOpen = true;
    const menu = document.getElementById('quality-options-menu');
    if (menu) {
        menu.style.display = 'flex';
    }
    ensurePlayerOverlayControlLayout();
    updateQualityDropdownLabel();
    setTimeout(() => {
        refreshFocusables();
        const firstQualityBtn = document.querySelector('#quality-options-menu [data-type="quality"]');
        if (!firstQualityBtn) return;
        const idx = focusables.findIndex(node => node === firstQualityBtn);
        if (idx >= 0) {
            document.querySelectorAll('.focus').forEach(node => node.classList.remove('focus'));
            focusIndex = idx;
            focusables[focusIndex].classList.add('focus');
            ensureFocusedElementVisible(focusables[focusIndex]);
        }
    }, 20);
}

function toggleQualityDropdown() {
    if (isQualityDropdownOpen) {
        closeQualityDropdown();
    } else {
        openQualityDropdown();
    }
}


function ensurePlayerOverlayControlLayout() {
    const controlsShell = document.querySelector('#screen-player .player-controls-shell');
    const playbackRow = document.querySelector('#screen-player [data-type="player-toggle"]')?.closest('.btn-row');
    const progressShell = document.getElementById('player-progress-shell');
    const qualityContainer = document.getElementById('quality-buttons');
    const subtitleContainer = document.getElementById('subtitle-buttons');
    if (!controlsShell || !playbackRow) return;

    const prevBtn = document.querySelector('#screen-player [data-type="player-prev-episode"]');
    const nextBtn = document.querySelector('#screen-player [data-type="player-next-episode"]');
    const toggleBtn = document.querySelector('#screen-player [data-type="player-toggle"]');
    const restartBtn = document.querySelector('#screen-player [data-type="player-restart"]');
    const backBtn = document.querySelector('#screen-player [data-type="player-back"]');
    const fitBtn = document.querySelector('#screen-player [data-type="player-fit-toggle"]');
    const autoplayBtn = document.querySelector('#screen-player [data-type="player-autoplay-toggle"]');
    const qualityToggleBtn = document.querySelector('#screen-player [data-type="quality-toggle"]');
    const episodeGroup = document.getElementById('player-episode-controls-group');

    let leftGroup = playbackRow.querySelector('#player-controls-left-group');
    let centerGroup = playbackRow.querySelector('#player-controls-center-group');
    let rightGroup = playbackRow.querySelector('#player-controls-right-group');

    if (!leftGroup || !centerGroup || !rightGroup) {
        playbackRow.innerHTML = '';

        leftGroup = document.createElement('div');
        leftGroup.id = 'player-controls-left-group';

        centerGroup = document.createElement('div');
        centerGroup.id = 'player-controls-center-group';

        rightGroup = document.createElement('div');
        rightGroup.id = 'player-controls-right-group';

        playbackRow.appendChild(leftGroup);
        playbackRow.appendChild(centerGroup);
        playbackRow.appendChild(rightGroup);
    }

    controlsShell.style.display = 'flex';
    controlsShell.style.flexDirection = 'column';
    controlsShell.style.gap = '18px';
    controlsShell.style.width = '100%';
    controlsShell.style.maxWidth = 'none';

    if (progressShell) {
        progressShell.style.display = 'flex';
        progressShell.style.flexDirection = 'column';
        progressShell.style.gap = '10px';
        progressShell.style.width = '100%';
        progressShell.style.maxWidth = 'none';
        progressShell.style.pointerEvents = 'auto';
    }

    playbackRow.style.position = 'relative';
    playbackRow.style.display = 'block';
    playbackRow.style.width = '100%';
    playbackRow.style.minHeight = '76px';
    playbackRow.style.maxWidth = 'none';
    playbackRow.style.flexWrap = 'nowrap';
    playbackRow.style.gap = '0';

    leftGroup.style.position = 'absolute';
    leftGroup.style.left = '0';
    leftGroup.style.top = '50%';
    leftGroup.style.transform = 'translateY(-50%)';
    leftGroup.style.display = 'flex';
    leftGroup.style.gap = '12px';
    leftGroup.style.alignItems = 'center';
    leftGroup.style.justifyContent = 'flex-start';

    centerGroup.style.position = 'absolute';
    centerGroup.style.left = '50%';
    centerGroup.style.top = '50%';
    centerGroup.style.transform = 'translate(-50%, -50%)';
    centerGroup.style.width = '0';
    centerGroup.style.height = '76px';
    centerGroup.style.display = 'block';
    centerGroup.style.pointerEvents = 'none';

    rightGroup.style.position = 'absolute';
    rightGroup.style.right = '0';
    rightGroup.style.top = '50%';
    rightGroup.style.transform = 'translateY(-50%)';
    rightGroup.style.display = 'flex';
    rightGroup.style.gap = '12px';
    rightGroup.style.alignItems = 'center';
    rightGroup.style.justifyContent = 'flex-end';

    const applyIconButtonStyle = (btn, text, width = '76px') => {
        if (!btn) return;
        btn.textContent = text;
        btn.style.display = btn.style.display === 'none' ? 'none' : 'inline-flex';
        btn.style.alignItems = 'center';
        btn.style.justifyContent = 'center';
        btn.style.textAlign = 'center';
        btn.style.minWidth = width;
        btn.style.width = width;
        btn.style.minHeight = '76px';
        btn.style.height = '76px';
        btn.style.padding = '0';
        btn.style.lineHeight = '1';
        btn.style.margin = '0';
        btn.style.color = '#ffffff';
        btn.style.pointerEvents = 'auto';
    };

    if (backBtn) {
        applyIconButtonStyle(backBtn, '←');
        leftGroup.appendChild(backBtn);
    }

    if (qualityToggleBtn) {
        qualityToggleBtn.style.display = 'inline-flex';
        qualityToggleBtn.style.alignItems = 'center';
        qualityToggleBtn.style.justifyContent = 'center';
        qualityToggleBtn.style.textAlign = 'center';
        qualityToggleBtn.style.minHeight = '76px';
        qualityToggleBtn.style.height = '76px';
        qualityToggleBtn.style.minWidth = '220px';
        qualityToggleBtn.style.margin = '0';
        qualityToggleBtn.style.color = '#ffffff';
        qualityToggleBtn.style.pointerEvents = 'auto';
        leftGroup.appendChild(qualityToggleBtn);
    }

    if (restartBtn) {
        restartBtn.style.display = 'none';
    }

    if (autoplayBtn) {
        autoplayBtn.style.display = autoplayBtn.style.display === 'none' ? 'none' : 'inline-flex';
        autoplayBtn.style.alignItems = 'center';
        autoplayBtn.style.justifyContent = 'center';
        autoplayBtn.style.textAlign = 'center';
        autoplayBtn.style.minHeight = '76px';
        autoplayBtn.style.height = '76px';
        autoplayBtn.style.margin = '0';
        autoplayBtn.style.color = '#ffffff';
        autoplayBtn.style.pointerEvents = 'auto';
        rightGroup.appendChild(autoplayBtn);
    }

    if (fitBtn) {
        fitBtn.style.display = 'inline-flex';
        fitBtn.style.alignItems = 'center';
        fitBtn.style.justifyContent = 'center';
        fitBtn.style.textAlign = 'center';
        fitBtn.style.minHeight = '76px';
        fitBtn.style.height = '76px';
        fitBtn.style.margin = '0';
        fitBtn.style.color = '#ffffff';
        fitBtn.style.pointerEvents = 'auto';
        rightGroup.appendChild(fitBtn);
    }

    if (prevBtn) {
        applyIconButtonStyle(prevBtn, '⏮');
        prevBtn.style.position = 'absolute';
        prevBtn.style.right = '116px';
        prevBtn.style.top = '50%';
        prevBtn.style.transform = 'translateY(-50%)';
        centerGroup.appendChild(prevBtn);
    }

    if (toggleBtn) {
        applyIconButtonStyle(toggleBtn, '▶', '92px');
        toggleBtn.style.position = 'absolute';
        toggleBtn.style.left = '50%';
        toggleBtn.style.top = '50%';
        toggleBtn.style.transform = 'translate(-50%, -50%)';
        toggleBtn.style.fontSize = '28px';
        toggleBtn.style.background = 'rgba(255,255,255,0.10)';
        toggleBtn.style.border = '1px solid rgba(255,255,255,0.22)';
        toggleBtn.style.boxShadow = '0 8px 24px rgba(0,0,0,0.18)';
        toggleBtn.style.borderRadius = '22px';
        toggleBtn.style.color = '#ffffff';
        centerGroup.appendChild(toggleBtn);
        updatePlayerToggleButtonLabel();
    }

    if (nextBtn) {
        applyIconButtonStyle(nextBtn, '⏭');
        nextBtn.style.position = 'absolute';
        nextBtn.style.left = '116px';
        nextBtn.style.top = '50%';
        nextBtn.style.transform = 'translateY(-50%)';
        centerGroup.appendChild(nextBtn);
    }

    if (qualityContainer) {
        qualityContainer.style.display = 'none';
        qualityContainer.innerHTML = '';
        qualityContainer.style.flexDirection = '';
        qualityContainer.style.alignItems = '';
        qualityContainer.style.gap = '';
        qualityContainer.style.marginTop = '';
        qualityContainer.style.justifyContent = '';
    }

    const qualityMenu = document.getElementById('quality-options-menu');
    if (qualityMenu && qualityToggleBtn) {
        const stage = document.getElementById('player-stage');
        const stageRect = stage?.getBoundingClientRect();
        const toggleRect = qualityToggleBtn.getBoundingClientRect();
        const menuWidth = 220;
        const left = stageRect ? toggleRect.left - stageRect.left + (toggleRect.width - menuWidth) / 2 : 0;
        const bottomOffset = stageRect ? stageRect.bottom - toggleRect.top + 12 : 118;

        qualityMenu.style.position = 'absolute';
        qualityMenu.style.left = `${Math.max(12, left)}px`;
        qualityMenu.style.right = 'auto';
        qualityMenu.style.bottom = `${bottomOffset}px`;
        qualityMenu.style.width = '220px';
        qualityMenu.style.zIndex = '2100';
    }

    if (subtitleContainer) {
        subtitleContainer.style.marginTop = '10px';
        subtitleContainer.style.justifyContent = 'flex-end';
    }

    if (episodeGroup) {
        episodeGroup.style.display = 'none';
    }

    const optionLabels = document.querySelectorAll('#screen-player .player-controls-shell .eyebrow');
    optionLabels.forEach(label => {
        if (label.textContent?.trim() === 'Playback' || label.textContent?.trim() === 'Playback options') {
            label.style.display = 'none';
        }
    });
}


function showPlayerOverlay() {
    const overlay = document.getElementById('player-ui-overlay');
    if (!overlay) return;

    overlay.style.display = 'flex';
    overlay.style.opacity = '1';
    overlay.style.visibility = 'visible';
    overlay.style.pointerEvents = 'auto';
    isPlayerOverlayVisible = true;
}

function hidePlayerOverlay() {
    const overlay = document.getElementById('player-ui-overlay');
    if (!overlay) return;

    if (currentScreen !== 'player') return;
    if (document.getElementById('preplay-modal')?.style.display === 'flex') return;
    if (document.getElementById('next-episode-overlay')?.style.display === 'block') return;
    if (isPlayerEpisodesOpen) return;
    if (isQualityDropdownOpen) return;

    focusPlayerToggleButton();
    overlay.style.opacity = '0';
    overlay.style.visibility = 'hidden';
    overlay.style.pointerEvents = 'none';
    isPlayerOverlayVisible = false;
}

function clearPlayerOverlayHideTimer() {
    if (playerOverlayHideTimer) {
        clearTimeout(playerOverlayHideTimer);
        playerOverlayHideTimer = null;
    }
}

function schedulePlayerOverlayAutoHide(forceDelay = 2600) {
    clearPlayerOverlayHideTimer();

    if (currentScreen !== 'player') return;
    const video = document.getElementById('player-video');
    if (!video || video.paused) return;
    if (document.getElementById('next-episode-overlay')?.style.display === 'block') return;
    if (isPlayerEpisodesOpen) return;

    playerOverlayHideTimer = setTimeout(() => {
        hidePlayerOverlay();
    }, forceDelay);
}

function showPlayerOverlayAndSchedule(forceDelay = 2600) {
    showPlayerOverlay();
    schedulePlayerOverlayAutoHide(forceDelay);
}

function focusPlayerToggleButton({visibleOnly = false} = {}) {
    const toggleBtn = document.querySelector('#screen-player [data-type="player-toggle"]');
    if (!toggleBtn) return;

    const active = setFocusedElement(toggleBtn, {
        selector: `#screen-${currentScreen} [data-focusable="true"], .sidebar [data-focusable="true"]`,
        focus: visibleOnly,
        ensureVisible: visibleOnly
    });
    if (!active) return;
    syncPlayerToggleFocusStyle();
}

// =========================
// INPUT ACTIONS
// =========================

async function activateFocused() {
    if (currentScreen === 'player') {
        showPlayerOverlayAndSchedule(1800);
    }

    const el = focusables[focusIndex];
    if (!el) return;

    switch (el.dataset.type) {
        case 'nav':
            switchScreen(el.dataset.screen);
            break;
        case 'search-input':
        case 'login-email':
        case 'login-password':
            el.focus();
            break;
        case 'card': {
            const item = findItemById(el.dataset.id);
            if (!item) break;
            if (item?.savedTime || currentScreen === 'continue') await resumeFromContinue(item);
            else await openDetailsForItem(item);
            break;
        }
        case 'hero-details':
            if (currentHomeItems[0]) await openDetailsForItem(currentHomeItems[0]);
            break;
        case 'hero-reload':
            await reloadContent();
            break;
        case 'season-select':
            currentSelectedSeason = el.dataset.season;
            renderSeriesPanels();
            setTimeout(refreshFocusables, 20);
            break;
        case 'episode-select':
            currentSelectedSeason = el.dataset.season;
            currentSelectedEpisode = el.dataset.episode;
            ensureTranslatorAvailableForCurrentEpisode();
            renderSeriesPanels();

            if (currentScreen === 'details') {
                const entry = findContinueEntryForCurrentItem();
                const resumeTime = Number(entry?.currentTime || entry?.savedTime || 0);
                pendingPreplayResumeTime = resumeTime > 0 ? resumeTime : 0;
                openPreplayModal();
            } else {
                await openPlayerForSelected();
                await syncCurrentPlaybackToRemote({force: true});
            }
            break;
        case 'search-run':
            await performSearch(document.getElementById("searchInput")?.value || currentSearchQuery);
            break;
        case 'back-home':
            switchScreen('home');
            break;
        case 'play-item': {
            const entry = findContinueEntryForCurrentItem();
            const resumeTime = Number(entry?.currentTime || entry?.savedTime || pendingPreplayResumeTime || 0);
            pendingPreplayResumeTime = resumeTime > 0 ? resumeTime : 0;
            ensureSeriesSelection();
            ensureTranslatorAvailableForCurrentEpisode();
            renderSeriesPanels();
            openPreplayModal();
            break;
        }
        case 'player-prev-episode':
            await switchToEpisode('prev');
            break;
        case 'player-next-episode':
            await switchToEpisode('next');
            break;
        case 'player-seekbar':
            showPlayerOverlayAndSchedule(2200);
            break;
        case 'player-autoplay-toggle':
            autoplayNextEpisodeEnabled = !autoplayNextEpisodeEnabled;
            updatePlayerPreference('autoplayNextEpisodeEnabled', autoplayNextEpisodeEnabled);
            if (!autoplayNextEpisodeEnabled) clearNextEpisodeOverlay();
            updatePlayerMeta();
            break;
        case 'preplay-start': {
            const hasTranslator = ensureTranslatorAvailableForCurrentEpisode();
            if (!hasTranslator && isSeriesItem(currentSelectedItem)) {
                const selection = document.getElementById('preplay-selection');
                if (selection) selection.textContent = 'No available voice acting for the selected episode';
                break;
            }

            const entry = findContinueEntryForCurrentItem();
            const resumeTime = Number(pendingPreplayResumeTime || entry?.currentTime || entry?.savedTime || 0);
            closePreplayModal();
            await openPlayerForSelected(resumeTime);
            pendingPreplayResumeTime = 0;
            break;
        }
        case 'preplay-cancel':
            closePreplayModal();
            setTimeout(refreshFocusables, 20);
            break;
        case 'next-episode-confirm':
            if (pendingNextEpisode) await playSpecificEpisode(pendingNextEpisode.season, pendingNextEpisode.episode);
            break;
        case 'next-episode-cancel':
            clearNextEpisodeOverlay();
            break;
        case 'player-episodes-toggle':
            togglePlayerEpisodesPanel();
            break;
        case 'quality-toggle':
            toggleQualityDropdown();
            break;
        case 'player-toggle': {
            const video = document.getElementById('player-video');
            if (!video) break;

            if (video.paused) {
                try {
                    await video.play();
                    playerStatus = "Playing";
                    showPlayerOverlayAndSchedule(2600);
                } catch (e) {
                }
            } else {
                persistCurrentPlaybackProgress();
                video.pause();
                clearPlayerOverlayHideTimer();
                showPlayerOverlay();
                playerStatus = "Paused";
            }
            updatePlayerMeta();
            break;
        }
        case 'player-restart': {
            const video = document.getElementById('player-video');
            if (!video) break;
            video.currentTime = 0;
            try {
                await video.play();
                showPlayerOverlayAndSchedule(2600);
            } catch (e) {
            }
            break;
        }
        case 'player-fit-toggle':
            currentVideoFitMode = currentVideoFitMode === 'zoom' ? 'contain' : 'zoom';
            updatePlayerPreference('preferredFitMode', currentVideoFitMode);
            applyFullscreenVideoPresentation(document.getElementById('player-video'));
            showPlayerOverlayAndSchedule(2600);
            break;
        case 'preplay-translator-toggle':
            toggleTranslatorDropdown();
            break;
        case 'translator':
            if (currentScreen === 'details') {
                currentTranslationId = String(el.dataset.id);
                applyTranslatorState(currentTranslationId, {fallbackName: `Translator ${currentTranslationId}`, clearMissing: true});
                updatePlayerPreference('preferredTranslatorId', String(currentTranslationId));
                closeTranslatorDropdown();
                renderTranslatorButtons();
                openPreplayModal();
                focusPreplayStartButton();
            } else {
                await switchTranslator(el.dataset.id);
            }
            break;
        case 'subtitle-select': {
            const lang = el.dataset.lang;
            const forceTranslation = el.dataset.forceTranslation;
            if (lang === 'off') {
                pendingSubtitleLanguage = null;
                applySelectedSubtitleTrack('off');
            } else if (forceTranslation && String(currentTranslationId || '') !== String(forceTranslation)) {
                pendingSubtitleLanguage = lang;
                await switchTranslator(String(forceTranslation));
            } else {
                applySelectedSubtitleTrack(lang);
            }
            break;
        }
        case 'quality': {
            const selectedQuality = String(el.dataset.quality || '').trim();
            const selectedUrl = String(el.dataset.url || '').trim();
            const video = document.getElementById('player-video');
            const currentVideoUrl = String(video?.currentSrc || video?.src || '').trim();
            const activeQualityUrl = String(currentStreams?.[currentQuality] || '').trim();
            const isSameQuality = selectedQuality === String(currentQuality || '').trim();
            const isSameUrl = !!selectedUrl && (selectedUrl === currentVideoUrl || selectedUrl === activeQualityUrl);

            closeQualityDropdown();
            if (isSameQuality || isSameUrl) {
                showPlayerOverlayAndSchedule(1800);
                setTimeout(() => {
                    refreshFocusables();
                    const qualityToggleBtn = document.querySelector('#screen-player [data-type="quality-toggle"]');
                    if (qualityToggleBtn) setFocusedElement(qualityToggleBtn);
                }, 20);
                break;
            }

            switchQuality(el.dataset.url, el.dataset.quality);
            renderQualityButtons();
            updatePlayerMeta();
            break;
        }
        case 'player-back':
            closePlayerToDetails();
            break;
        case 'login-submit':
            await performLogin();
            break;
    }
}

function handleBack() {
    const preplayModal = document.getElementById('preplay-modal');

    if (preplayModal && preplayModal.style.display === 'flex') {
        if (isTranslatorDropdownOpen) {
            closeTranslatorDropdown();
            focusPreplayStartButton();
            return;
        }

        closePreplayModal();
        setTimeout(refreshFocusables, 20);
        return;
    }

    if (currentScreen === 'player') {
        if (isQualityDropdownOpen) {
            closeQualityDropdown();
            setTimeout(refreshFocusables, 20);
            return;
        }
        closePlayerToDetails();
        return;
    }

    if (currentScreen === 'details') {
        switchScreen('home');
    }
}

// =========================
// APP BOOTSTRAP
// =========================

async function init() {
    await reloadContent();
    await checkAuthStatus();
    await refreshContinueWatching();
    refreshFocusables();
    const searchInput = document.getElementById("searchInput");

    if (searchInput) {
        searchInput.addEventListener("keydown", async (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                await performSearch(searchInput.value);
            }
        });
    }
    const loginEmail = document.getElementById("login-email");
    const loginPassword = document.getElementById("login-password");

    if (loginEmail) {
        loginEmail.addEventListener("keydown", async (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                document.getElementById("login-password")?.focus();
            }
        });
    }

    if (loginPassword) {
        loginPassword.addEventListener("keydown", async (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                await performLogin();
            }

            if (e.key === "Escape") {
                e.preventDefault();
                loginPassword.blur();
            }
        });
    }
    document.addEventListener('keydown', async (e) => {
        const activeTag = document.activeElement?.tagName;
        const isTyping = activeTag === "INPUT" || activeTag === "TEXTAREA";

        if (isTyping && e.key !== "Enter" && e.key !== "Escape") {
            return;
        }
        if (e.key === "Escape") {
            e.preventDefault();
            searchInput.blur();
        }
        if (isTyping && (e.key === "Escape" || e.keyCode === 8)) {
            document.activeElement.blur();
        }
        const code = e.keyCode || e.which;
        if ([37, 38, 39, 40, 13, 10009, 8].includes(code)) e.preventDefault();
        switch (code) {
            case 37:
                moveFocus('left');
                break;
            case 38:
                moveFocus('up');
                break;
            case 39:
                moveFocus('right');
                break;
            case 40:
                moveFocus('down');
                break;
            case 13:
                await activateFocused();
                break;
            case 10009:
            case 8:
                handleBack();
                break;
        }
    });
}

init();

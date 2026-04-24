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
        debugContinue('Loaded continue watching', parsed);
        return parsed;
    } catch (e) {
        console.error('Failed to parse continue watching', e);
        debugContinue('Failed to parse continue watching', {error: String(e)});
        return [];
    }
}

function saveContinueWatching(items) {
    localStorage.setItem(CONTINUE_STORAGE_KEY, JSON.stringify(items));
    debugContinue('Saved continue watching', items);
}

// =========================
// PLAYER PREFERENCES STORAGE
// =========================

const DEFAULT_PLAYER_PREFS = {
    autoplayNextEpisodeEnabled: true,
    preferredQuality: '1080p',
    preferredSubtitleLanguage: 'off',
    preferredTranslatorId: null,
    preferredFitMode: 'contain'
};

function loadPlayerPrefs() {
    try {
        const parsed = JSON.parse(localStorage.getItem(PLAYER_PREFS_STORAGE_KEY) || '{}');
        return {
            ...DEFAULT_PLAYER_PREFS,
            ...(parsed || {})
        };
    } catch (e) {
        console.error('Failed to parse player prefs', e);
        return {...DEFAULT_PLAYER_PREFS};
    }
}

function savePlayerPrefs() {
    localStorage.setItem(PLAYER_PREFS_STORAGE_KEY, JSON.stringify(playerPrefs));
}

function updatePlayerPreference(key, value) {
    playerPrefs[key] = value;
    savePlayerPrefs();
}


// =========================
// DEBUG HELPERS
// =========================

function debugContinue(message, payload = null) {
    const timestamp = new Date().toLocaleTimeString();
    const line = payload
        ? `[${timestamp}] ${message}: ${JSON.stringify(payload, null, 2)}`
        : `[${timestamp}] ${message}`;

    console.log('[ContinueWatching]', message, payload ?? '');
    console.warn('[ContinueWatching]', message, payload ?? '');

    let debugEl = document.getElementById('continue-debug');

    if (!debugEl) {
        debugEl = document.createElement('div');
        debugEl.id = 'continue-debug';
        document.body.appendChild(debugEl);
    }

    Object.assign(debugEl.style, {
        position: 'fixed',
        bottom: '0',
        left: '0',
        width: '100%',
        maxHeight: '220px',
        overflowY: 'auto',
        background: 'rgba(0,0,0,0.95)',
        color: '#00ff88',
        fontSize: '12px',
        padding: '10px',
        zIndex: '999999',
        whiteSpace: 'pre-wrap',
        fontFamily: 'monospace',
        display: 'block',
        visibility: 'visible',
        opacity: '1',
        pointerEvents: 'auto'
    });

    const previous = debugEl.textContent ? `${debugEl.textContent}\n\n` : '';
    debugEl.textContent = `${previous}${line}`;
}

function continueEntryKey(entry) {
    return `${entry.sourceUrl}__${entry.season || ''}__${entry.episode || ''}`;
}

function upsertContinueWatching(entry) {
    debugContinue('Upsert requested', entry);
    const items = loadContinueWatching();
    const key = continueEntryKey(entry);

    const filtered = items.filter(item => continueEntryKey(item) !== key);
    filtered.unshift(entry);

    const finalItems = filtered.slice(0, 30);
    debugContinue('Upsert final items', finalItems);
    saveContinueWatching(finalItems);
}

function mergeContinueSources(localItems = [], remoteItems = []) {
    const map = new Map();

    remoteItems.forEach(item => {
        const key = continueEntryKey(item);
        map.set(key, {
            ...item,
            currentTime: 0,
            quality: item.quality || null,
            translationId: item.translationId || null,
            translatorName: item.translatorName || null,
            source: 'remote'
        });
    });

    localItems.forEach(item => {
        const key = continueEntryKey(item);
        const existing = map.get(key) || {};
        map.set(key, {
            ...existing,
            ...item,
            source: existing.source === 'remote' ? 'hybrid' : 'local'
        });
    });

    return Array.from(map.values());
}

async function loadRemoteContinueWatching() {
    try {
        const res = await fetch(`${API_BASE}/continue_remote`);
        if (!res.ok) throw new Error('Failed to load remote continue');

        const data = await res.json();
        remoteContinueItems = Array.isArray(data.items) ? data.items : [];
        debugContinue('Loaded remote continue', remoteContinueItems);
        return remoteContinueItems;
    } catch (e) {
        console.error(e);
        debugContinue('Failed to load remote continue', {error: String(e)});
        remoteContinueItems = [];
        return [];
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

function clearContinueDebug() {
    const debugEl = document.getElementById('continue-debug');
    if (debugEl) {
        debugEl.textContent = '';
    }
}

// =========================
// REMOTE SYNC
// =========================

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
    debugContinue('Syncing remote continue', payload);

    try {
        const res = await fetch(`${API_BASE}/sync_continue_remote`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        debugContinue('Remote sync result', data);

        if (data.ok) {
            await loadRemoteContinueWatching();
            renderContinueWatching();
        }
    } catch (e) {
        console.error(e);
        debugContinue('Remote sync failed', {error: String(e), payload});
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

        debugContinue('Applying resume time', {
            requestedTime: resumeTime,
            safeTime,
            duration: video.duration,
            currentTimeBefore: video.currentTime,
            readyState: video.readyState,
            seekable: video.seekable?.length || 0
        });

        video.currentTime = safeTime;
        if (desc) {
            desc.textContent = `Восстанавливаем просмотр с ${safeTime} сек...`;
        }
        pendingResumeTime = safeTime;
        return true;
    } catch (e) {
        debugContinue('Apply resume time failed', {
            requestedTime: resumeTime,
            error: String(e)
        });
        return false;
    }
}


// =========================
// API LOADERS
// =========================


async function loadMoviesFromAPI(query = '') {
    const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error('Не удалось получить фильмы');
    const data = await res.json();
    return data.map(item => ({
        id: item.url,
        title: item.title,
        meta: itemMeta(item),
        type: 'movie',
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

    const results = await loadMoviesFromAPI(normalized);
    currentSearchItems = results;
    currentSearchQuery = normalized;
    renderSearchResults(currentSearchItems);

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
                focusables[focusIndex].scrollIntoView({block: 'nearest', inline: 'nearest', behavior: 'smooth'});
            }
        }
    }, 20);
}

async function loadMovieDetails(url) {
    const res = await fetch(`${API_BASE}/movie?url=${encodeURIComponent(url)}`);
    if (!res.ok) throw new Error('Не удалось получить details');
    return await res.json();
}

async function loadMovieStream(url) {
    const res = await fetch(`${API_BASE}/stream?url=${encodeURIComponent(url)}`);
    if (!res.ok) throw new Error('Не удалось получить stream');
    return await res.json();
}

async function loadMovieTranslators(url) {
    const res = await fetch(`${API_BASE}/translators?url=${encodeURIComponent(url)}`);
    if (!res.ok) throw new Error('Не удалось получить озвучки');
    return await res.json();
}

async function loadEpisodesData(url) {
    debugContinue('loadEpisodesData request', {url});

    const res = await fetch(`${API_BASE}/episodes?url=${encodeURIComponent(url)}`);

    debugContinue('loadEpisodesData response status', {
        url,
        status: res.status,
        ok: res.ok
    });

    if (!res.ok) throw new Error('Не удалось получить episodes');

    const data = await res.json();

    debugContinue('loadEpisodesData response body', {
        url,
        hasEpisodesInfo: !!data?.episodesInfo,
        episodesInfoLength: Array.isArray(data?.episodesInfo) ? data.episodesInfo.length : null,
        hasSeriesInfo: !!data?.seriesInfo,
        seriesInfoKeys: data?.seriesInfo && typeof data.seriesInfo === 'object' ? Object.keys(data.seriesInfo) : [],
        type: data?.type,
        title: data?.title
    });

    return data;
}

async function loadSubtitlesData(url, options = {}) {
    const params = new URLSearchParams({url});

    if (options.translation) params.set('translation', String(options.translation));
    if (options.season) params.set('season', String(options.season));
    if (options.episode) params.set('episode', String(options.episode));

    const res = await fetch(`${API_BASE}/subtitles?${params.toString()}`);
    if (!res.ok) throw new Error('Не удалось получить subtitles');
    return await res.json();
}

// =========================
// SUBTITLES
// =========================

function renderSubtitleButtons() {
    const container = document.getElementById("subtitle-buttons");
    if (!container) return;

    container.innerHTML = "";

    const subtitleEntries = Object.entries(currentSubtitles || {}).filter(([, value]) => !!value);
    const shouldShowSubtitles = String(currentTranslationId || '') === '238' && subtitleEntries.length > 0;
    container.style.display = shouldShowSubtitles ? "flex" : "none";

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

    Array.from(video.querySelectorAll('track[data-managed-subtitle="true"]')).forEach(track => track.remove());

    for (let i = 0; i < video.textTracks.length; i += 1) {
        video.textTracks[i].mode = 'disabled';
    }

    if (!language || language === 'off' || !currentSubtitles[language]) {
        currentSubtitleLanguage = 'off';
        updatePlayerPreference('preferredSubtitleLanguage', 'off');
        updatePlayerMeta();
        renderSubtitleButtons();
        return;
    }

    const track = document.createElement('track');
    track.kind = 'subtitles';
    track.label = language;
    track.srclang = language;
    track.src = currentSubtitles[language];
    track.default = true;
    track.setAttribute('data-managed-subtitle', 'true');
    video.appendChild(track);

    currentSubtitleLanguage = language;
    updatePlayerPreference('preferredSubtitleLanguage', language);

    track.addEventListener('load', () => {
        const tracks = video.textTracks;
        if (tracks.length) {
            tracks[tracks.length - 1].mode = 'showing';
        }
    }, {once: true});

    updatePlayerMeta();
    renderSubtitleButtons();
}

async function refreshSubtitlesForCurrentPlayback(preferredLanguage = null) {
    if (!currentSelectedItem?.sourceUrl) {
        currentSubtitles = {};
        currentSubtitleForcedTranslation = null;
        renderSubtitleButtons();
        return;
    }

    const requestOptions = {
        translation: currentTranslationId || 0,
        season: currentSelectedSeason || 0,
        episode: currentSelectedEpisode || 0
    };

    currentSubtitles = {};
    currentSubtitleForcedTranslation = null;

    let data = await loadSubtitlesData(currentSelectedItem.sourceUrl, requestOptions);

    if ((!data.languages || !data.languages.length) && String(currentTranslationId || '') !== '238') {
        const fallbackData = await loadSubtitlesData(currentSelectedItem.sourceUrl, {
            translation: '238',
            season: currentSelectedSeason || 0,
            episode: currentSelectedEpisode || 0
        });

        if (fallbackData.languages && fallbackData.languages.length) {
            data = fallbackData;
            currentSubtitleForcedTranslation = '238';
        }
    }

    currentSubtitles = data.subtitles || {};
    renderSubtitleButtons();

    const preferredSubtitleLanguage = playerPrefs.preferredSubtitleLanguage || 'off';

    const targetLanguage = preferredLanguage && preferredLanguage !== 'off'
        ? preferredLanguage
        : (currentSubtitleLanguage !== 'off'
            ? currentSubtitleLanguage
            : (preferredSubtitleLanguage !== 'off' ? preferredSubtitleLanguage : null));
    if (targetLanguage && currentSubtitles[targetLanguage]) {
        if (currentSubtitleForcedTranslation && String(currentTranslationId || '') !== String(currentSubtitleForcedTranslation)) {
            pendingSubtitleLanguage = targetLanguage;
            await switchTranslator(String(currentSubtitleForcedTranslation));
            return;
        }

        applySelectedSubtitleTrack(targetLanguage);
        return;
    }

    if (preferredLanguage === 'off' || !Object.keys(currentSubtitles).length) {
        applySelectedSubtitleTrack('off');
    } else {
        updatePlayerMeta();
    }
}

// =========================
// RENDER HELPERS
// =========================

function createPosterCard(item) {
    const thumbStyle = item.thumbnail ? `style="background-image:url('${item.thumbnail}')"` : '';
    return `
        <div class="poster-card" data-focusable="true" data-type="card" data-id="${item.id}">
          <div class="poster-thumb" ${thumbStyle}></div>
          <div class="card-title">${item.title}</div>
          <div class="card-meta">${item.meta}</div>
        </div>
      `;
}

function renderRows(targetId, title, subtitle, items) {
    const target = document.getElementById(targetId);
    target.innerHTML = `
        <div class="row-block">
          <div class="row-title">${title}</div>
          <div class="row-subtitle">${subtitle}</div>
          <div class="poster-row">
            ${items.map(createPosterCard).join('')}
          </div>
        </div>
      `;
}

async function resumeFromContinue(item) {
    debugContinue('Resume requested', item);
    currentSelectedSeason = item.savedSeason || item.season || null;
    currentSelectedEpisode = item.savedEpisode || item.episode || null;
    currentTranslationId = item.savedTranslationId || item.translationId || null;
    currentTranslatorName = item.savedTranslatorName || item.translatorName || null;
    currentQuality = item.savedQuality || item.quality || null;

    const resumeTime = Number(item.savedTime || item.currentTime || 0);
    pendingPreplayResumeTime = resumeTime > 0 ? resumeTime : 0;

    debugContinue('Computed resume time', {resumeTime, item});

    await openDetailsForItem(item, {preservePlaybackState: true});

    setTimeout(() => {
        const playBtn = document.querySelector('#screen-details [data-type="play-item"]');
        if (!playBtn) return;

        refreshFocusables();
        document.querySelectorAll('.focus').forEach(node => node.classList.remove('focus'));

        focusables = Array.from(document.querySelectorAll(`#screen-${currentScreen} [data-focusable="true"], .sidebar [data-focusable="true"]`))
            .filter(node => node.offsetParent !== null);

        const playIndex = focusables.findIndex(node => node === playBtn);
        focusIndex = playIndex >= 0 ? playIndex : 0;

        if (focusables[focusIndex]) {
            focusables[focusIndex].classList.add('focus');
            focusables[focusIndex].focus?.();
            focusables[focusIndex].scrollIntoView({block: 'nearest', inline: 'nearest', behavior: 'smooth'});
        }
    }, 80);
}

function renderContinueWatching() {
    const localItems = loadContinueWatching();
    const items = mergeContinueSources(localItems, remoteContinueItems);
    debugContinue('Rendering continue watching', items);

    const target = document.getElementById('continue-content');
    if (!target) return;

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
        source: item.source || null
    }));

    renderRows('continue-content', 'Continue Watching', 'Недосмотренное', normalized);
}

function renderSearchResults(items) {
    const target = document.getElementById('search-results');
    if (!items || items.length === 0) {
        target.innerHTML = `
    <div class="empty-box" style="grid-column: 1 / -1;">
      Ничего не найдено. Попробуй другой запрос.
    </div>
  `;
        return;
    }
    target.innerHTML = items.map(item => {
        const thumbStyle = item.thumbnail
            ? `style="background-image:url('${item.thumbnail}');height:190px;"`
            : 'style="height:190px;"';
        return `
          <div class="search-result" data-focusable="true" data-type="card" data-id="${item.id}">
            <div class="poster-thumb" ${thumbStyle}></div>
            <div class="card-title">${item.title}</div>
            <div class="card-meta">${item.meta}</div>
          </div>
        `;
    }).join('');
}

function renderDetails(item, details = null) {
    const title = details?.title || item?.title || 'Unknown title';
    const description = details?.description || 'Описание загружается...';
    const rating = details?.rating ?? item?.rating ?? 'N/A';
    const type = details?.type || item?.type || 'movie';
    const thumbnail = details?.thumbnail || item?.thumbnail || '';
    const posterStyle = thumbnail ? `style="background-image:url('${thumbnail}')"` : '';

    document.getElementById('details-content').innerHTML = `
        <div class="details-layout">
          <div class="details-poster" ${posterStyle}></div>
          <div>
            <div class="eyebrow">${type}</div>
            <h2 class="screen-title" style="font-size:56px; margin-bottom:12px;">${title}</h2>
            <div class="tag-row">
              <span class="tag">IMDb ${rating}</span>
              <span class="tag">HD</span>
              <span class="tag">Online</span>
            </div>
            <div class="screen-desc" style="max-width:800px; line-height:1.5;">${description || 'Нет описания'}</div>
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

    debugContinue('renderSeriesPanel', {
        targetId,
        normalized,
        selectedSeason: currentSelectedSeason,
        selectedEpisode: currentSelectedEpisode,
        isPlayerEpisodesOpen
    });
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
  data-season="${seasonNum}"
  data-episode="${episodeNum}"
  style="text-align:left; justify-content:flex-start; width:100%; margin-top:10px; border:${hasPremium ? '1px solid rgba(255,215,0,0.35)' : 'none'}; background:${isSelectedEpisode ? 'rgba(87,166,255,0.22)' : 'rgba(255,255,255,0.12)'};"
>
  <div style="display:flex; width:100%; align-items:center; justify-content:space-between; gap:14px;">
    <div style="font-weight:700;">Серия ${episodeNum}</div>
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
          data-season="${seasonNum}"
        >
          Сезон ${seasonNum}
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
    currentTranslatorName = currentTranslators[translationId]?.name || `Translator ${translationId}`;
    currentTranslatorPremium = !!currentTranslators[translationId]?.premium;
    ensureFitModeButton();
    updatePlayerPreference('preferredTranslatorId', String(translationId));
    playerStatus = "Loading";
    updatePlayerMeta();

    const title = document.getElementById('player-title');
    const desc = document.getElementById('player-desc');
    const video = document.getElementById('player-video');

    const currentTime = video.currentTime || 0;

    title.textContent = currentSelectedItem.title || 'Player';
    desc.textContent = 'Меняем озвучку...';

    try {
        let streamRequest = `${API_BASE}/stream?url=${encodeURIComponent(currentSelectedItem.sourceUrl)}&translation=${encodeURIComponent(translationId)}`;

        if (currentSelectedSeason && currentSelectedEpisode) {
            streamRequest += `&season=${encodeURIComponent(currentSelectedSeason)}&episode=${encodeURIComponent(currentSelectedEpisode)}`;
        }

        const res = await fetch(streamRequest);

        if (!res.ok) throw new Error('Не удалось получить stream для выбранной озвучки');

        const streamData = await res.json();
        console.log('STREAM DATA FULL:', streamData);
        currentStreams = streamData;

        let streamUrl = "";
        currentQuality = null;

        const qualityPriority = [
            playerPrefs.preferredQuality,
            "4K",
            "2K",
            "1080p Ultra",
            "1080p",
            "720p",
            "480p",
            "360p"
        ].filter(Boolean);

        for (const qualityKey of qualityPriority) {
            if (streamData[qualityKey]) {
                streamUrl = streamData[qualityKey];
                currentQuality = qualityKey;
                break;
            }
        }

        if (!streamUrl) {
            desc.textContent = 'Для этой озвучки нет доступного видео.';
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

        desc.textContent = currentTranslatorPremium
            ? 'Premium-озвучка выбрана.'
            : 'Озвучка переключена.';

        renderQualityButtons();
        await refreshSubtitlesForCurrentPlayback(pendingSubtitleLanguage || currentSubtitleLanguage);
        pendingSubtitleLanguage = null;
        updatePlayerMeta();
    } catch (err) {
        console.error(err);
        playerStatus = "Error";
        updatePlayerMeta();
        desc.textContent = currentTranslatorPremium
            ? `Premium-озвучка недоступна или не загрузилась: ${err.message}`
            : `Ошибка смены озвучки: ${err.message}`;
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
        console.error(err);
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
        await loadRemoteContinueWatching();
        renderContinueWatching();
    } catch (err) {
        console.error(err);
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

    const isSupportedQualityLabel = (quality) => {
        const value = String(quality || "").trim();
        return /^(?:\d{3,4}p(?:\s+Ultra)?|[248]K)$/i.test(value);
    };

    const getQualityOrder = (quality) => {
        const value = String(quality || "").trim().toLowerCase();
        if (value === "360p") return 1;
        if (value === "480p") return 2;
        if (value === "720p") return 3;
        if (value === "1080p") return 4;
        if (value === "1080p ultra") return 5;
        if (value === "2k") return 6;
        if (value === "4k") return 7;
        return 999;
    };

    const qualityEntries = Object.entries(currentStreams)
        .filter(([quality, url]) => {
            if (!url) return false;
            if (["translator_id", "season", "episode"].includes(String(quality))) return false;
            if (!isSupportedQualityLabel(quality)) return false;
            if (typeof url !== "string") return false;
            return /^https?:\/\//i.test(url);
        })
        .sort((a, b) => getQualityOrder(a[0]) - getQualityOrder(b[0]));

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
    currentQuality = quality;
    updatePlayerPreference('preferredQuality', quality);
    ensureFitModeButton();
    playerStatus = "Loading";
    updatePlayerMeta();
    const video = document.getElementById("player-video");
    if (!video || !url) return;

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

function persistCurrentPlaybackProgress() {
    const video = document.getElementById('player-video');
    if (!video || !currentSelectedItem?.sourceUrl) {
        debugContinue('Skip persist: no video or no selected item');
        return;
    }
    if (!video.currentTime || video.currentTime < 5) {
        debugContinue('Skip persist: currentTime too small', {currentTime: video.currentTime || 0});
        return;
    }

    const isSeries = !!(currentSelectedSeason && currentSelectedEpisode);
    const seriesLabel = isSeries ? `S${currentSelectedSeason} • E${currentSelectedEpisode}` : null;

    const entry = {
        sourceUrl: currentSelectedItem.sourceUrl,
        title: currentSelectedItem.title || currentSelectedItem.name || 'Unknown title',
        thumbnail: currentSelectedItem.thumbnail || '',
        type: currentSelectedItem.type || 'movie',
        rating: currentSelectedItem.rating ?? 'N/A',
        category: currentSelectedItem.category || '',
        currentTime: Math.floor(video.currentTime),
        season: currentSelectedSeason || null,
        episode: currentSelectedEpisode || null,
        seriesLabel,
        translationId: currentTranslationId || null,
        translatorName: currentTranslatorName || null,
        quality: currentQuality || null
    };

    debugContinue('Persisting playback progress', entry);
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
    document.getElementById(`screen-${screen}`).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.screen === screen);
    });

    if (screen === 'player') {
        applyPlayerFullscreenLayout();
        showPlayerOverlay();
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

    focusables = Array.from(document.querySelectorAll(selector))
        .filter(el => el.offsetParent !== null);

    document.querySelectorAll('.focus').forEach(el => el.classList.remove('focus'));
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
    focusables[focusIndex].scrollIntoView({block: 'nearest', inline: 'nearest', behavior: 'smooth'});
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
                focusables[focusIndex].scrollIntoView({block: 'nearest', inline: 'nearest', behavior: 'smooth'});
                return;
            }
        }

        if (dir === 'left' && active === searchBtn && input) {
            focusables[focusIndex].classList.remove('focus');
            focusIndex = focusables.indexOf(input);
            if (focusIndex >= 0) {
                focusables[focusIndex].classList.add('focus');
                focusables[focusIndex].scrollIntoView({block: 'nearest', inline: 'nearest', behavior: 'smooth'});
                return;
            }
        }

        if (dir === 'down' && (active === input || active === searchBtn) && firstCard) {
            focusables[focusIndex].classList.remove('focus');
            focusIndex = focusables.indexOf(firstCard);
            if (focusIndex >= 0) {
                focusables[focusIndex].classList.add('focus');
                focusables[focusIndex].scrollIntoView({block: 'nearest', inline: 'nearest', behavior: 'smooth'});
                return;
            }
        }
    }
    focusables[focusIndex].classList.remove('focus');
    const activeRect = active.getBoundingClientRect();
    const candidates = focusables.map((el, idx) => ({el, idx, rect: el.getBoundingClientRect()}))
        .filter(item => item.idx !== focusIndex)
        .filter(item => {
            if (dir === 'right') return item.rect.left >= activeRect.left + 10;
            if (dir === 'left') return item.rect.right <= activeRect.right - 10;
            if (dir === 'down') return item.rect.top >= activeRect.top + 10;
            if (dir === 'up') return item.rect.bottom <= activeRect.bottom - 10;
            return false;
        })
        .sort((a, b) => {
            if (dir === 'right' || dir === 'left') {
                const da = Math.abs(a.rect.left - activeRect.left) + Math.abs(a.rect.top - activeRect.top) * 2;
                const db = Math.abs(b.rect.left - activeRect.left) + Math.abs(b.rect.top - activeRect.top) * 2;
                return da - db;
            }
            const da = Math.abs(a.rect.top - activeRect.top) + Math.abs(a.rect.left - activeRect.left) * 2;
            const db = Math.abs(b.rect.top - activeRect.top) + Math.abs(b.rect.left - activeRect.left) * 2;
            return da - db;
        });
    if (candidates.length) focusIndex = candidates[0].idx;
    focusables[focusIndex].classList.add('focus');
    focusables[focusIndex].scrollIntoView({block: 'nearest', inline: 'nearest', behavior: 'smooth'});
    syncPlayerToggleFocusStyle();
    updatePlayerProgressUI();
}

function findItemById(id) {
    return [...currentHomeItems, ...currentSearchItems].find(item => item.id === id)
        || mergeContinueSources(loadContinueWatching(), remoteContinueItems).find(item => continueEntryKey(item) === id)
        || null;
}

function findContinueEntryForCurrentItem() {
    if (!currentSelectedItem?.sourceUrl) return null;

    const items = mergeContinueSources(loadContinueWatching(), remoteContinueItems);
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

function getNormalizedEpisodesInfo() {
    const root = currentEpisodesData || null;
    const info = root?.episodesInfo ?? root?.seasons ?? root?.items ?? root?.episodes ?? null;

    debugContinue('getNormalizedEpisodesInfo input', {
        hasRoot: !!root,
        rootKeys: root && typeof root === 'object' ? Object.keys(root) : [],
        infoType: Array.isArray(info) ? 'array' : typeof info,
        infoKeys: info && typeof info === 'object' && !Array.isArray(info) ? Object.keys(info) : [],
        hasSeriesInfo: !!root?.seriesInfo,
        seriesInfoKeys: root?.seriesInfo && typeof root.seriesInfo === 'object' ? Object.keys(root.seriesInfo) : []
    });
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

    if (normalizedFromEpisodesInfo.length) {
        debugContinue('getNormalizedEpisodesInfo from episodesInfo', normalizedFromEpisodesInfo);
        return normalizedFromEpisodesInfo;
    }

    const seriesInfo = root?.seriesInfo;
    if (!seriesInfo || typeof seriesInfo !== 'object') {
        return [];
    }

    const preferredTranslatorId = String(currentTranslationId || '');
    const seriesEntry = (preferredTranslatorId && seriesInfo[preferredTranslatorId])
        ? seriesInfo[preferredTranslatorId]
        : Object.values(seriesInfo).find(Boolean);

    if (!seriesEntry || typeof seriesEntry !== 'object') {
        return [];
    }

    const episodesBySeason = seriesEntry.episodes || {};
    const translatorId = preferredTranslatorId || String(seriesEntry.translator_id || '');
    const translatorName = seriesEntry.translator_name || currentTranslatorName || 'Translator';
    const translatorPremium = !!seriesEntry.premium;

    const normalizedFromSeriesInfo = Object.entries(episodesBySeason).map(([seasonKey, episodeSet]) => {
        let episodeValues = [];

        if (Array.isArray(episodeSet)) {
            episodeValues = episodeSet;
        } else if (episodeSet instanceof Set) {
            episodeValues = Array.from(episodeSet);
        } else if (episodeSet && typeof episodeSet === 'object') {
            episodeValues = Object.keys(episodeSet);
        }

        const sortedEpisodes = episodeValues
            .map(v => String(v))
            .sort((a, b) => Number(a) - Number(b));

        return {
            season: String(seasonKey),
            episodes: sortedEpisodes.map(ep => ({
                episode: String(ep),
                translations: [{
                    translator_id: translatorId,
                    translator_name: translatorName,
                    premium: translatorPremium
                }]
            }))
        };
    }).filter(block => block.season && block.episodes.length)
        .sort((a, b) => Number(a.season) - Number(b.season));

    debugContinue('getNormalizedEpisodesInfo from seriesInfo', normalizedFromSeriesInfo);
    return normalizedFromSeriesInfo;
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

    const preferredTranslatorId = playerPrefs.preferredTranslatorId
        ? String(playerPrefs.preferredTranslatorId)
        : null;

    const preferredEntry = preferredTranslatorId
        ? availableEntries.find(([id]) => String(id) === preferredTranslatorId)
        : null;

    const nextEntry = preferredEntry || availableEntries[0];
    if (!nextEntry) {
        return false;
    }

    currentTranslationId = String(nextEntry[0]);
    currentTranslatorName = nextEntry[1]?.name || `Translator ${nextEntry[0]}`;
    currentTranslatorPremium = !!nextEntry[1]?.premium;
    updatePlayerPreference('preferredTranslatorId', String(currentTranslationId));

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
    renderBothSeriesPanels();
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

function ensureSeriesSelection() {
    debugContinue('ensureSeriesSelection start', {
        selectedSeason: currentSelectedSeason,
        selectedEpisode: currentSelectedEpisode
    });

    const normalized = getNormalizedEpisodesInfo();
    if (currentSelectedSeason && currentSelectedEpisode) {
        return true;
    }

    if (!normalized.length) {
        debugContinue('ensureSeriesSelection result', {
            season: currentSelectedSeason,
            episode: currentSelectedEpisode,
            hasInfo: false,
            rawEpisodesInfo: currentEpisodesData?.episodesInfo || null
        });
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

    debugContinue('ensureSeriesSelection result', {
        season: currentSelectedSeason,
        episode: currentSelectedEpisode,
        hasInfo: true,
        normalized
    });

    return !!(currentSelectedSeason && currentSelectedEpisode);
}

// =========================
// SCREEN DATA LOADING
// =========================

async function reloadContent() {
    try {
        currentHomeItems = await loadMoviesFromAPI('');
        renderRows('home-content', 'Search Results', 'Реальные данные с backend', currentHomeItems);
        currentSearchItems = [...currentHomeItems];
        currentSearchQuery = "";

        const input = document.getElementById("searchInput");
        if (input) {
            input.value = currentSearchQuery;
        }

        renderSearchResults(currentSearchItems);
        await loadRemoteContinueWatching();
        renderContinueWatching();
        setTimeout(refreshFocusables, 20);
    } catch (err) {
        console.error(err);
        document.getElementById('home-content').innerHTML = `<div class="empty-box">Ошибка загрузки API: ${err.message}</div>`;
    }
}

// =========================
// DETAILS SCREEN
// =========================

async function openDetailsForItem(item, options = {}) {
    if (!item?.sourceUrl) return;

    if (isSeriesItem(item)) {
        clearContinueDebug();
        debugContinue('openDetailsForItem start', {
            title: item?.title,
            sourceUrl: item?.sourceUrl,
            type: item?.type,
            options
        });
    }

    const isDifferentItem = currentSelectedItem?.sourceUrl !== item.sourceUrl;
    closePreplayModal();
    currentSelectedItem = item;

    const savedEntry = mergeContinueSources(loadContinueWatching(), remoteContinueItems)
        .find(entry => entry.sourceUrl === item.sourceUrl) || null;

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
            currentSubtitles = {};
            currentSubtitleLanguage = 'off';
            currentSubtitleForcedTranslation = null;
            pendingSubtitleLanguage = null;
        }
        isPlayerEpisodesOpen = false;
        clearNextEpisodeOverlay();
        const episodesBtn = document.getElementById("player-episodes-btn");
        if (episodesBtn) {
            episodesBtn.style.display = "none";
        }
        const prevEpisodeBtn = document.querySelector('[data-type="player-prev-episode"]');
        if (prevEpisodeBtn) {
            prevEpisodeBtn.style.display = "none";
        }

        const nextEpisodeBtn = document.querySelector('[data-type="player-next-episode"]');
        if (nextEpisodeBtn) {
            nextEpisodeBtn.style.display = "none";
        }
    }

    renderDetails(item);
    switchScreen('details');

    try {
        const details = await loadMovieDetails(item.sourceUrl);
        const merged = {...item, ...details, meta: item.meta};
        currentSelectedItem = merged;
        debugContinue('openDetailsForItem details loaded', {
            title: merged?.title,
            type: merged?.type,
            sourceUrl: merged?.sourceUrl
        });
        renderDetails(merged, details);
        renderTranslatorButtons();
        setTimeout(refreshFocusables, 20);
    } catch (err) {
        console.error(err);
    }

    try {
        const translatorsData = await loadMovieTranslators(item.sourceUrl);
        currentTranslators = translatorsData.translators || {};

        if (currentTranslationId && !currentTranslators[currentTranslationId]) {
            currentTranslationId = null;
        }

        const preferredTranslatorId = playerPrefs.preferredTranslatorId
            ? String(playerPrefs.preferredTranslatorId)
            : null;

        if (!currentTranslationId && preferredTranslatorId && currentTranslators[preferredTranslatorId]) {
            currentTranslationId = preferredTranslatorId;
        }

        if (currentTranslationId && currentTranslators[currentTranslationId]) {
            currentTranslatorName = currentTranslators[currentTranslationId].name;
            currentTranslatorPremium = !!currentTranslators[currentTranslationId].premium;
        } else if (!currentTranslationId) {
            const firstTranslatorEntry = Object.entries(currentTranslators)[0] || null;
            if (firstTranslatorEntry) {
                currentTranslationId = String(firstTranslatorEntry[0]);
                currentTranslatorName = firstTranslatorEntry[1]?.name || null;
                currentTranslatorPremium = !!firstTranslatorEntry[1]?.premium;
            }
        }

        if (currentTranslationId) {
            updatePlayerPreference('preferredTranslatorId', String(currentTranslationId));
        }

        renderTranslatorButtons();
    } catch (err) {
        console.error('Translator load error on details:', err);
        currentTranslators = {};
        renderTranslatorButtons();
    }

    try {
        const isSeriesType = isSeriesItem(currentSelectedItem);
        if (!isSeriesType) {
            currentEpisodesData = null;
            currentSelectedSeason = null;
            currentSelectedEpisode = null;
            renderBothSeriesPanels();
            setTimeout(refreshFocusables, 20);
            return;
        }
        const episodesData = await loadEpisodesData(item.sourceUrl);
        currentEpisodesData = episodesData;

        debugContinue('Raw episodes data loaded', {
            hasEpisodesInfo: !!episodesData?.episodesInfo,
            hasSeriesInfo: !!episodesData?.seriesInfo,
            episodesInfo: episodesData?.episodesInfo || null,
            seriesInfo: episodesData?.seriesInfo || null
        });

        ensureSeriesSelection();
        ensureTranslatorAvailableForCurrentEpisode();
        renderBothSeriesPanels();
        renderTranslatorButtons();
        debugContinue('Details episodes loaded', {
            title: currentSelectedItem?.title,
            normalized: getNormalizedEpisodesInfo(),
            season: currentSelectedSeason,
            episode: currentSelectedEpisode
        });
        setTimeout(refreshFocusables, 20);
    } catch (e) {
        console.error("Episodes load error:", e);
        currentEpisodesData = null;
    }
}

// =========================
// PLAYER
// =========================

async function openPlayerForSelected(initialTime = 0) {
    clearNextEpisodeOverlay();
    autoplayHandledPlaybackKey = null;
    if (!currentSelectedItem?.sourceUrl) return;

    debugContinue('openPlayerForSelected start', {
        title: currentSelectedItem?.title,
        sourceUrl: currentSelectedItem?.sourceUrl,
        type: currentSelectedItem?.type,
        initialTime,
        selectedSeason: currentSelectedSeason,
        selectedEpisode: currentSelectedEpisode,
        translationId: currentTranslationId
    });

    const continueEntry = findContinueEntryForCurrentItem();
    const effectiveInitialTime = Number(initialTime || continueEntry?.currentTime || continueEntry?.savedTime || 0);
    pendingResumeTime = effectiveInitialTime > 0 ? effectiveInitialTime : 0;

    if (continueEntry) {
        if (!currentSelectedSeason && (continueEntry.season || continueEntry.savedSeason)) {
            currentSelectedSeason = String(continueEntry.season || continueEntry.savedSeason);
        }
        if (!currentSelectedEpisode && (continueEntry.episode || continueEntry.savedEpisode)) {
            currentSelectedEpisode = String(continueEntry.episode || continueEntry.savedEpisode);
        }
        if (!currentTranslationId && (continueEntry.translationId || continueEntry.savedTranslationId)) {
            currentTranslationId = String(continueEntry.translationId || continueEntry.savedTranslationId);
        }
        if (!currentTranslatorName && (continueEntry.translatorName || continueEntry.savedTranslatorName)) {
            currentTranslatorName = continueEntry.translatorName || continueEntry.savedTranslatorName;
        }
        if (!currentQuality && (continueEntry.quality || continueEntry.savedQuality)) {
            currentQuality = continueEntry.quality || continueEntry.savedQuality;
        }
    }

    const isSeriesType = isSeriesItem(currentSelectedItem);

    if (isSeriesType && !getNormalizedEpisodesInfo().length) {
        debugContinue('openPlayerForSelected lazy episodes load start', {
            title: currentSelectedItem?.title,
            sourceUrl: currentSelectedItem?.sourceUrl
        });

        try {
            const episodesData = await loadEpisodesData(currentSelectedItem.sourceUrl);
            currentEpisodesData = episodesData;

            debugContinue('openPlayerForSelected lazy episodes load success', {
                normalized: getNormalizedEpisodesInfo(),
                raw: episodesData
            });

            renderSeriesPanel();
            renderSeriesPanel("player-series-panel");
        } catch (e) {
            console.error('Episodes lazy load error:', e);
            debugContinue('openPlayerForSelected lazy episodes load error', {
                error: String(e)
            });
        }
    }
    if (isSeriesType) {
        renderBothSeriesPanels();

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
            debugContinue('Failed to resolve series selection before stream', {
                title: currentSelectedItem?.title,
                episodesInfo: currentEpisodesData?.episodesInfo || null,
                normalized: getNormalizedEpisodesInfo()
            });
            const desc = document.getElementById('player-desc');
            if (desc) {
                desc.textContent = 'Не удалось определить сезон и серию.';
            }
            renderBothSeriesPanels();
            setTimeout(refreshFocusables, 20);
            return;
        }
    }
    const title = document.getElementById('player-title');
    const desc = document.getElementById('player-desc');
    const video = document.getElementById('player-video');
    currentVideoFitMode = playerPrefs.preferredFitMode || 'contain';
    ensureFitModeButton();
    currentTranslators = {};

    try {
        const translatorsData = await loadMovieTranslators(currentSelectedItem.sourceUrl);
        currentTranslators = translatorsData.translators || {};

        const entries = Object.entries(currentTranslators);

        if (entries.length > 0 && currentTranslationId && !currentTranslators[currentTranslationId]) {
            currentTranslationId = null;
        }

        const preferredTranslatorId = playerPrefs.preferredTranslatorId ? String(playerPrefs.preferredTranslatorId) : null;
        if (!currentTranslationId && preferredTranslatorId && currentTranslators[preferredTranslatorId]) {
            currentTranslationId = preferredTranslatorId;
        }

        if (currentTranslationId && currentTranslators[currentTranslationId]) {
            currentTranslatorName = currentTranslators[currentTranslationId].name;
            currentTranslatorPremium = !!currentTranslators[currentTranslationId].premium;
        } else {
            currentTranslatorPremium = false;
        }

        if (isSeriesType) {
            ensureTranslatorAvailableForCurrentEpisode();
        }
        updatePlayerMeta();
        const episodesBtn = document.getElementById("player-episodes-btn");
        if (episodesBtn) {
            episodesBtn.style.display = "none";
        }

        const prevEpisodeBtn = document.querySelector('[data-type="player-prev-episode"]');
        if (prevEpisodeBtn) {
            prevEpisodeBtn.style.display = isSeriesType ? "inline-flex" : "none";
        }

        const nextEpisodeBtn = document.querySelector('[data-type="player-next-episode"]');
        if (nextEpisodeBtn) {
            nextEpisodeBtn.style.display = isSeriesType ? "inline-flex" : "none";
        }

        const autoplayBtn = document.querySelector('[data-type="player-autoplay-toggle"]');
        if (autoplayBtn) {
            autoplayBtn.style.display = isSeriesType ? "inline-flex" : "none";
        }

        const episodeControlsGroup = document.getElementById('player-episode-controls-group');
        if (episodeControlsGroup) {
            episodeControlsGroup.style.display = 'none';
        } else {
            const fallbackEpisodeControlsGroup = episodesBtn?.closest('.btn-row')?.parentElement;
            if (fallbackEpisodeControlsGroup) {
                fallbackEpisodeControlsGroup.style.display = 'none';
            }
        }

        ensurePlayerOverlayControlLayout();
    } catch (e) {
        console.error("Translator load error:", e);
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
        debugContinue('Preparing stream request', {
            title: currentSelectedItem?.title,
            type: currentSelectedItem?.type,
            season: currentSelectedSeason,
            episode: currentSelectedEpisode,
            translationId: currentTranslationId,
            normalized: getNormalizedEpisodesInfo()
        });
        let streamUrlRequest = `${API_BASE}/stream?url=${encodeURIComponent(currentSelectedItem.sourceUrl)}`;

        if (currentSelectedSeason && currentSelectedEpisode) {
            streamUrlRequest += `&season=${encodeURIComponent(currentSelectedSeason)}&episode=${encodeURIComponent(currentSelectedEpisode)}`;
        }
        if (currentTranslationId) {
            streamUrlRequest += `&translation=${encodeURIComponent(currentTranslationId)}`;
        }

        const res = await fetch(streamUrlRequest);
        if (!res.ok) throw new Error('Не удалось получить stream');
        const streamData = await res.json();
        console.log('STREAM DATA FULL:', streamData);
        debugContinue('stream response body', streamData);
        currentStreams = streamData;
        if (streamData.translator_id) {
            currentTranslationId = String(streamData.translator_id);
        }

        if (currentTranslationId && currentTranslators[currentTranslationId]) {
            currentTranslatorName = currentTranslators[currentTranslationId].name;
            currentTranslatorPremium = !!currentTranslators[currentTranslationId].premium;
            updatePlayerPreference('preferredTranslatorId', String(currentTranslationId));
        } else {
            currentTranslatorName = null;
            currentTranslatorPremium = false;
        }

        if (isSeriesType) {
            ensureTranslatorAvailableForCurrentEpisode();
        }

        let streamUrl = "";
        currentQuality = null;

        const qualityPriority = [
            playerPrefs.preferredQuality,
            "4K",
            "2K",
            "1080p Ultra",
            "1080p",
            "720p",
            "480p",
            "360p"
        ].filter(Boolean);

        for (const qualityKey of qualityPriority) {
            if (streamData[qualityKey]) {
                streamUrl = streamData[qualityKey];
                currentQuality = qualityKey;
                break;
            }
        }

        if (!streamUrl) {
            desc.textContent = 'Backend не вернул подходящую ссылку на видео.';
            return;
        }

        syncCurrentPlaybackToRemote({force: true});

        playerStatus = "Loading";
        updatePlayerMeta();
        renderQualityButtons();
        renderBothSeriesPanels();
        updatePlayerProgressUI(video);

        const playbackKey = `${currentSelectedItem.sourceUrl}__${currentSelectedSeason || ''}__${currentSelectedEpisode || ''}__${Date.now()}`;
        video.dataset.playbackKey = playbackKey;

        video.src = streamUrl;
        video.load();
        await refreshSubtitlesForCurrentPlayback(pendingSubtitleLanguage || currentSubtitleLanguage);
        pendingSubtitleLanguage = null;

        video.onloadedmetadata = null;
        video.onloadeddata = null;
        video.oncanplay = null;
        video.onseeked = null;
        video.ontimeupdate = null;
        video.onended = null;

        video.onloadedmetadata = () => {
            applyFullscreenVideoPresentation(video);
            debugContinue('Player metadata loaded', {
                initialTime: effectiveInitialTime,
                duration: video.duration,
                currentTimeBeforeSeek: video.currentTime,
                readyState: video.readyState,
                seekable: video.seekable?.length || 0
            });
            video.onended = () => {
                triggerAutoplayNextEpisode(video.dataset.playbackKey || playbackKey);
            };
            if (!pendingResumeTime && effectiveInitialTime > 0) {
                pendingResumeTime = effectiveInitialTime;
            }

            if (pendingResumeTime > 0) {
                tryApplyResumeTime(video, pendingResumeTime, desc);
            }

            updatePlayerProgressUI(video);
        };

        video.onloadeddata = () => {
            if (pendingResumeTime > 0 && video.currentTime < Math.max(1, pendingResumeTime - 2)) {
                debugContinue('Retry resume on loadeddata', {
                    pendingResumeTime,
                    currentTime: video.currentTime,
                    readyState: video.readyState
                });
                tryApplyResumeTime(video, pendingResumeTime, desc);
            }
        };

        video.oncanplay = () => {
            updatePlayerProgressUI(video);
            if (pendingResumeTime > 0 && video.currentTime < Math.max(1, pendingResumeTime - 2)) {
                debugContinue('Retry resume on canplay', {
                    pendingResumeTime,
                    currentTime: video.currentTime,
                    readyState: video.readyState
                });
                tryApplyResumeTime(video, pendingResumeTime, desc);
            }

            playerStatus = "Playing";
            updatePlayerMeta();
            video.play().then(() => {
                showPlayerOverlayAndSchedule(1800);
            }).catch(() => {
            });
        };

        video.onseeked = () => {
            debugContinue('Seek completed', {
                pendingResumeTime,
                actualTime: video.currentTime,
                duration: video.duration,
                readyState: video.readyState,
                seekable: video.seekable?.length || 0
            });

            if (pendingResumeTime > 0 && Math.abs(video.currentTime - pendingResumeTime) <= 3) {
                pendingResumeTime = 0;
            }
        };

        let lastPersistSecond = -1;
        video.ontimeupdate = () => {
            updatePlayerProgressUI(video);
            const second = Math.floor(video.currentTime);

            if (pendingResumeTime > 0 && second > 0 && Math.abs(second - pendingResumeTime) <= 3) {
                debugContinue('Resume confirmed by timeupdate', {
                    pendingResumeTime,
                    currentTime: video.currentTime
                });
                pendingResumeTime = 0;
            }

            if (pendingResumeTime > 0 && second > 0 && second < Math.max(3, pendingResumeTime - 5)) {
                debugContinue('Resume still not applied, retrying from timeupdate', {
                    pendingResumeTime,
                    currentTime: video.currentTime
                });
                tryApplyResumeTime(video, pendingResumeTime, desc);
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
            if (pendingResumeTime > 0 && video.currentTime < Math.max(3, pendingResumeTime - 5)) {
                debugContinue('Resume fallback timeout retry', {
                    pendingResumeTime,
                    currentTime: video.currentTime,
                    readyState: video.readyState,
                    seekable: video.seekable?.length || 0
                });
                tryApplyResumeTime(video, pendingResumeTime, desc);
            }
        }, 1500);

    } catch (err) {
        console.error(err);
        desc.textContent = currentTranslatorPremium
            ? `Не удалось загрузить premium-озвучку: ${err.message}`
            : `Ошибка загрузки stream: ${err.message}`;
    }
    setTimeout(refreshFocusables, 20);
}

async function switchToEpisode(direction) {
    clearNextEpisodeOverlay();
    debugContinue('switchToEpisode click', {
        direction,
        selectedSeason: currentSelectedSeason,
        selectedEpisode: currentSelectedEpisode,
        normalized: getNormalizedEpisodesInfo()
    });

    if ((!currentSelectedSeason || !currentSelectedEpisode) && getNormalizedEpisodesInfo().length) {
        ensureSeriesSelection();
    }

    const targetEpisode = getAdjacentEpisode(direction);
    if (!targetEpisode) {
        debugContinue('switchToEpisode: no target episode', {
            direction,
            season: currentSelectedSeason,
            episode: currentSelectedEpisode,
            normalized: getNormalizedEpisodesInfo()
        });
        return;
    }

    currentSelectedSeason = targetEpisode.season;
    currentSelectedEpisode = targetEpisode.episode;

    renderBothSeriesPanels();
    updatePlayerMeta();

    await openPlayerForSelected();
}

function togglePlayerEpisodesPanel() {
    debugContinue('togglePlayerEpisodesPanel click', {
        selectedSeason: currentSelectedSeason,
        selectedEpisode: currentSelectedEpisode,
        isPlayerEpisodesOpen
    });

    const normalized = getNormalizedEpisodesInfo();
    if (!normalized.length) {
        debugContinue('togglePlayerEpisodesPanel: no normalized episodes', {
            currentEpisodesData,
            normalized
        });
        return;
    }

    ensureSeriesSelection();
    isPlayerEpisodesOpen = !isPlayerEpisodesOpen;
    renderBothSeriesPanels();
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
        document.querySelectorAll('.focus').forEach(node => node.classList.remove('focus'));

        focusables = Array.from(document.querySelectorAll('#preplay-modal [data-focusable="true"]'))
            .filter(node => node.offsetParent !== null);

        const startIndex = focusables.findIndex(node => node === startBtn);
        focusIndex = startIndex >= 0 ? startIndex : 0;

        if (focusables[focusIndex]) {
            focusables[focusIndex].classList.add('focus');
            focusables[focusIndex].focus?.();
            focusables[focusIndex].scrollIntoView({block: 'center', inline: 'nearest', behavior: 'smooth'});
        }
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
        const selectedOption = document.querySelector(`#translator-buttons [data-type="translator"][data-id="${currentTranslationId}"]`);
        const firstOption = selectedOption || document.querySelector('#translator-buttons [data-type="translator"]');
        if (!firstOption) return;

        refreshFocusables();
        document.querySelectorAll('.focus').forEach(node => node.classList.remove('focus'));

        focusables = Array.from(document.querySelectorAll('#preplay-modal [data-focusable="true"]'))
            .filter(node => node.offsetParent !== null);

        const optionIndex = focusables.findIndex(node => node === firstOption);
        focusIndex = optionIndex >= 0 ? optionIndex : 0;

        if (focusables[focusIndex]) {
            focusables[focusIndex].classList.add('focus');
            focusables[focusIndex].focus?.();
            focusables[focusIndex].scrollIntoView({block: 'nearest', inline: 'nearest', behavior: 'smooth'});
        }
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
    const viewportHeight = `${window.innerHeight}px`;
    const html = document.documentElement;
    const body = document.body;
    const sidebar = document.querySelector('.sidebar');
    const main = document.querySelector('.main');
    const screen = document.getElementById('screen-player');
    const stage = document.getElementById('player-stage');
    const wrap = document.querySelector('#screen-player .player-wrap');
    const overlay = document.getElementById('player-ui-overlay');
    const video = document.getElementById('player-video');

    if (sidebar) {
        if (savedAppChromeDisplay === null) {
            savedAppChromeDisplay = sidebar.style.display || '';
        }
        sidebar.style.display = 'none';
    }

    if (html) {
        html.style.width = '100%';
        html.style.height = '100%';
        html.style.overflow = 'hidden';
        html.style.margin = '0';
        html.style.padding = '0';
    }

    if (body) {
        body.style.width = '100%';
        body.style.height = '100%';
        body.style.minHeight = viewportHeight;
        body.style.overflow = 'hidden';
        body.style.margin = '0';
        body.style.padding = '0';
        body.style.background = '#000';
    }

    if (main) {
        main.style.position = 'fixed';
        main.style.inset = '0';
        main.style.left = '0';
        main.style.top = '0';
        main.style.width = '100vw';
        main.style.height = viewportHeight;
        main.style.minHeight = viewportHeight;
        main.style.maxWidth = '100vw';
        main.style.maxHeight = viewportHeight;
        main.style.margin = '0';
        main.style.padding = '0';
        main.style.overflow = 'hidden';
        main.style.background = '#000';
    }

    if (screen) {
        screen.style.position = 'fixed';
        screen.style.inset = '0';
        screen.style.left = '0';
        screen.style.top = '0';
        screen.style.width = '100vw';
        screen.style.height = viewportHeight;
        screen.style.minHeight = viewportHeight;
        screen.style.maxWidth = '100vw';
        screen.style.maxHeight = viewportHeight;
        screen.style.padding = '0';
        screen.style.margin = '0';
        screen.style.zIndex = '2000';
        screen.style.overflow = 'hidden';
        screen.style.background = '#000';
    }

    if (wrap) {
        wrap.style.position = 'absolute';
        wrap.style.inset = '0';
        wrap.style.left = '0';
        wrap.style.top = '0';
        wrap.style.width = '100vw';
        wrap.style.height = viewportHeight;
        wrap.style.minHeight = viewportHeight;
        wrap.style.maxWidth = '100vw';
        wrap.style.maxHeight = viewportHeight;
        wrap.style.padding = '0';
        wrap.style.margin = '0';
        wrap.style.overflow = 'hidden';
        wrap.style.background = '#000';
    }

    if (stage) {
        stage.style.position = 'absolute';
        stage.style.inset = '0';
        stage.style.left = '0';
        stage.style.top = '0';
        stage.style.width = '100vw';
        stage.style.height = viewportHeight;
        stage.style.minHeight = viewportHeight;
        stage.style.maxWidth = '100vw';
        stage.style.maxHeight = viewportHeight;
        stage.style.zIndex = '2001';
        stage.style.overflow = 'hidden';
        stage.style.background = '#000';
    }

    if (video) {
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
        video.style.objectFit = 'contain';
        video.style.transformOrigin = 'center center';
        video.style.transform = 'scale(1)';
        video.style.background = '#000';
    }

    if (overlay) {
        overlay.style.position = 'absolute';
        overlay.style.inset = '0';
        overlay.style.display = 'flex';
        overlay.style.flexDirection = 'column';
        overlay.style.justifyContent = 'space-between';
        overlay.style.opacity = '1';
        overlay.style.visibility = 'visible';
        overlay.style.pointerEvents = 'auto';
        overlay.style.transition = 'opacity 220ms ease, visibility 220ms ease';
        overlay.style.zIndex = '2002';
    }
}


function restoreAppLayoutAfterPlayer() {
    const html = document.documentElement;
    const body = document.body;
    const sidebar = document.querySelector('.sidebar');
    const main = document.querySelector('.main');
    const screen = document.getElementById('screen-player');
    const stage = document.getElementById('player-stage');
    const wrap = document.querySelector('#screen-player .player-wrap');
    const overlay = document.getElementById('player-ui-overlay');
    const video = document.getElementById('player-video');

    if (sidebar) {
        sidebar.style.display = savedAppChromeDisplay ?? '';
    }

    if (html) {
        html.style.width = '';
        html.style.height = '';
        html.style.overflow = '';
        html.style.margin = '';
        html.style.padding = '';
    }

    if (body) {
        body.style.width = '';
        body.style.height = '';
        body.style.minHeight = '';
        body.style.overflow = '';
        body.style.margin = '';
        body.style.padding = '';
        body.style.background = '';
    }

    if (main) {
        main.style.position = '';
        main.style.inset = '';
        main.style.left = '';
        main.style.top = '';
        main.style.width = '';
        main.style.height = '';
        main.style.minHeight = '';
        main.style.maxWidth = '';
        main.style.maxHeight = '';
        main.style.margin = '';
        main.style.padding = '';
        main.style.overflow = '';
        main.style.background = '';
    }

    if (screen) {
        screen.style.position = '';
        screen.style.inset = '';
        screen.style.left = '';
        screen.style.top = '';
        screen.style.width = '';
        screen.style.height = '';
        screen.style.minHeight = '';
        screen.style.maxWidth = '';
        screen.style.maxHeight = '';
        screen.style.padding = '';
        screen.style.margin = '';
        screen.style.zIndex = '';
        screen.style.overflow = '';
        screen.style.background = '';
    }

    if (wrap) {
        wrap.style.position = '';
        wrap.style.inset = '';
        wrap.style.left = '';
        wrap.style.top = '';
        wrap.style.width = '';
        wrap.style.height = '';
        wrap.style.minHeight = '';
        wrap.style.maxWidth = '';
        wrap.style.maxHeight = '';
        wrap.style.padding = '';
        wrap.style.margin = '';
        wrap.style.overflow = '';
        wrap.style.background = '';
    }

    if (stage) {
        stage.style.position = '';
        stage.style.inset = '';
        stage.style.left = '';
        stage.style.top = '';
        stage.style.width = '';
        stage.style.height = '';
        stage.style.minHeight = '';
        stage.style.maxWidth = '';
        stage.style.maxHeight = '';
        stage.style.zIndex = '';
        stage.style.overflow = '';
        stage.style.background = '';
    }

    if (video) {
        video.style.position = '';
        video.style.left = '';
        video.style.top = '';
        video.style.inset = '';
        video.style.width = '';
        video.style.height = '';
        video.style.minWidth = '';
        video.style.minHeight = '';
        video.style.maxWidth = '';
        video.style.maxHeight = '';
        video.style.display = '';
        video.style.margin = '';
        video.style.padding = '';
        video.style.borderRadius = '';
        video.style.objectFit = '';
        video.style.objectPosition = '';
        video.style.transformOrigin = '';
        video.style.transform = '';
        video.style.background = '';
    }

    if (overlay) {
        overlay.style.position = '';
        overlay.style.inset = '';
        overlay.style.display = '';
        overlay.style.flexDirection = '';
        overlay.style.justifyContent = '';
        overlay.style.opacity = '';
        overlay.style.visibility = '';
        overlay.style.pointerEvents = '';
        overlay.style.transition = '';
        overlay.style.zIndex = '';
    }
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
            focusables[focusIndex].scrollIntoView({block: 'nearest', inline: 'nearest', behavior: 'smooth'});
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

    const candidateFocusables = Array.from(
        document.querySelectorAll(`#screen-${currentScreen} [data-focusable="true"], .sidebar [data-focusable="true"]`)
    ).filter(node => !visibleOnly || node.offsetParent !== null);

    const nextIndex = candidateFocusables.findIndex(node => node === toggleBtn);
    if (nextIndex === -1) return;

    document.querySelectorAll('.focus').forEach(node => node.classList.remove('focus'));
    focusables = candidateFocusables;
    focusIndex = nextIndex;
    toggleBtn.classList.add('focus');

    if (visibleOnly) {
        toggleBtn.focus?.();
        toggleBtn.scrollIntoView({block: 'nearest', inline: 'nearest', behavior: 'smooth'});
    }

    syncPlayerToggleFocusStyle();
}

function renderBothSeriesPanels() {
    renderSeriesPanel();
    renderSeriesPanel("player-series-panel");
}

function exitPlayerToDetails() {
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


// =========================
// INPUT ACTIONS
// =========================

async function activateFocused() {
    if (currentScreen === 'player') {
        showPlayerOverlayAndSchedule(1800);
    }

    const el = focusables[focusIndex];
    if (!el) return;
    if (el.dataset.type === 'nav') {
        switchScreen(el.dataset.screen);
        return;
    }
    if (el.dataset.type === 'search-input') {
        el.focus();
        return;
    }
    if (el.dataset.type === 'login-email' || el.dataset.type === 'login-password') {
        el.focus();
        return;
    }
    if (el.dataset.type === 'card') {
        const item = findItemById(el.dataset.id);
        debugContinue('Card activated', {currentScreen, id: el.dataset.id, item});

        if (currentScreen === 'continue' && item) {
            await resumeFromContinue(item);
        } else if (item?.savedTime) {
            await resumeFromContinue(item);
        } else {
            await openDetailsForItem(item);
        }
        return;
    }
    if (el.dataset.type === 'hero-details') {
        if (currentHomeItems[0]) await openDetailsForItem(currentHomeItems[0]);
        return;
    }
    if (el.dataset.type === 'hero-reload') {
        await reloadContent();
        return;
    }
    if (el.dataset.type === 'season-select') {
        currentSelectedSeason = el.dataset.season;
        renderSeriesPanel();
        renderSeriesPanel("player-series-panel");
        setTimeout(refreshFocusables, 20);
        return;
    }

    if (el.dataset.type === 'episode-select') {
        currentSelectedSeason = el.dataset.season;
        currentSelectedEpisode = el.dataset.episode;
        ensureTranslatorAvailableForCurrentEpisode();
        renderSeriesPanel();
        renderSeriesPanel("player-series-panel");
        await openPlayerForSelected();
        await syncCurrentPlaybackToRemote({force: true});
        return;
    }
    if (el.dataset.type === 'search-run') {
        const input = document.getElementById("searchInput");
        const query = input ? input.value : currentSearchQuery;
        await performSearch(query);
        return;
    }
    if (el.dataset.type === 'back-home') {
        switchScreen('home');
        return;
    }
    if (el.dataset.type === 'play-item') {
        debugContinue('Play item pressed', {
            title: currentSelectedItem?.title,
            type: currentSelectedItem?.type,
            season: currentSelectedSeason,
            episode: currentSelectedEpisode,
            normalized: getNormalizedEpisodesInfo()
        });

        pendingPreplayResumeTime = 0;
        ensureSeriesSelection();
        ensureTranslatorAvailableForCurrentEpisode();
        renderSeriesPanel();
        renderSeriesPanel("player-series-panel");
        openPreplayModal();
        return;
    }
    if (el.dataset.type === 'player-prev-episode') {
        await switchToEpisode('prev');
        return;
    }

    if (el.dataset.type === 'player-next-episode') {
        await switchToEpisode('next');
        return;
    }
    if (el.dataset.type === 'player-seekbar') {
        showPlayerOverlayAndSchedule(2200);
        return;
    }
    if (el.dataset.type === 'player-autoplay-toggle') {
        autoplayNextEpisodeEnabled = !autoplayNextEpisodeEnabled;
        updatePlayerPreference('autoplayNextEpisodeEnabled', autoplayNextEpisodeEnabled);

        if (!autoplayNextEpisodeEnabled) {
            clearNextEpisodeOverlay();
        }

        updatePlayerMeta();
        return;
    }

    if (el.dataset.type === 'preplay-start') {
        const hasTranslator = ensureTranslatorAvailableForCurrentEpisode();

        if (!hasTranslator && isSeriesItem(currentSelectedItem)) {
            const selection = document.getElementById('preplay-selection');
            if (selection) {
                selection.textContent = 'No available voice acting for the selected episode';
            }
            return;
        }

        const resumeTime = pendingPreplayResumeTime || 0;
        pendingPreplayResumeTime = 0;

        closePreplayModal();
        await openPlayerForSelected(resumeTime);
        return;
    }

    if (el.dataset.type === 'preplay-cancel') {
        closePreplayModal();
        setTimeout(refreshFocusables, 20);
        return;
    }

    if (el.dataset.type === 'next-episode-confirm') {
        if (pendingNextEpisode) {
            const target = pendingNextEpisode;
            await playSpecificEpisode(target.season, target.episode);
        }
        return;
    }

    if (el.dataset.type === 'next-episode-cancel') {
        clearNextEpisodeOverlay();
        return;
    }
    if (el.dataset.type === 'player-episodes-toggle') {
        return;
    }

    if (el.dataset.type === 'quality-toggle') {
        toggleQualityDropdown();
        return;
    }

    if (el.dataset.type === 'player-toggle') {
        const video = document.getElementById('player-video');

        if (video.paused) {
            try {
                await video.play();
                playerStatus = "Playing";
                showPlayerOverlayAndSchedule(2600);
            } catch (e) {
                console.log(e);
            }
        } else {
            persistCurrentPlaybackProgress();
            video.pause();
            clearPlayerOverlayHideTimer();
            showPlayerOverlay();
            playerStatus = "Paused";
        }

        updatePlayerMeta();
        return;
    }

    if (el.dataset.type === 'player-restart') {
        const video = document.getElementById('player-video');
        video.currentTime = 0;
        try {
            await video.play();
            showPlayerOverlayAndSchedule(2600);
        } catch (e) {
            console.log(e);
        }
        return;
    }
    if (el.dataset.type === 'player-fit-toggle') {
        const video = document.getElementById('player-video');
        currentVideoFitMode = currentVideoFitMode === 'zoom' ? 'contain' : 'zoom';
        updatePlayerPreference('preferredFitMode', currentVideoFitMode);
        applyFullscreenVideoPresentation(video);
        showPlayerOverlayAndSchedule(2600);
        return;
    }
    if (el.dataset.type === 'preplay-translator-toggle') {
        toggleTranslatorDropdown();
        return;
    }

    if (el.dataset.type === 'translator') {
        if (currentScreen === 'details') {
            currentTranslationId = String(el.dataset.id);
            currentTranslatorName = currentTranslators[currentTranslationId]?.name || `Translator ${currentTranslationId}`;
            currentTranslatorPremium = !!currentTranslators[currentTranslationId]?.premium;
            updatePlayerPreference('preferredTranslatorId', String(currentTranslationId));

            closeTranslatorDropdown();
            renderTranslatorButtons();
            openPreplayModal();
            focusPreplayStartButton();
            return;
        }

        await switchTranslator(el.dataset.id);
        return;
    }
    if (el.dataset.type === 'subtitle-select') {
        const lang = el.dataset.lang;
        const forceTranslation = el.dataset.forceTranslation;

        if (lang === 'off') {
            pendingSubtitleLanguage = null;
            applySelectedSubtitleTrack('off');
            return;
        }

        if (forceTranslation && String(currentTranslationId || '') !== String(forceTranslation)) {
            pendingSubtitleLanguage = lang;
            await switchTranslator(String(forceTranslation));
            return;
        }

        applySelectedSubtitleTrack(lang);
        return;
    }

    if (el.dataset.type === 'quality') {
        switchQuality(el.dataset.url, el.dataset.quality);
        closeQualityDropdown();
        renderQualityButtons();
        updatePlayerMeta();
        return;
    }
    if (el.dataset.type === 'player-back') {
        exitPlayerToDetails();
        return;
    }
    if (el.dataset.type === 'login-submit') {
        await performLogin();
        return;
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

        exitPlayerToDetails();
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
    renderContinueWatching();
    await checkAuthStatus();
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


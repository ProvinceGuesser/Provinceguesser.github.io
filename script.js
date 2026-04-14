const $ = id => document.getElementById(id);

// ===== СОСТОЯНИЕ =====
let allPoints = [];
let currentLinks = [];

let currentRound = 1;
let totalRounds = 5;
let totalScore = 0;
let roundPoints = [];
let roundTargetPoint = null;   // правильная точка раунда
let currentViewPoint = null;   // текущая просматриваемая точка

// Панорама
let panoX = 0;
let panoZoom = 1;
let panoImageWidth = 0;
let panoDragging = false;
let panoDragStartX = 0;
let panoDragStartPanoX = 0;
let panoLastMouseX = 0;
let panoLastMoveTime = 0;
let panoVelocity = 0;
let panoAnimFrame = null;
let panoReady = false;

// Карта
let mapZoom = 1;
let mapPanX = 0, mapPanY = 0;
let isMapDragging = false;
let mapDragStartX = 0, mapDragStartY = 0;
let mapStartPanX = 0, mapStartPanY = 0;
let markerPlaced = false;
let markerMapX = 0, markerMapY = 0;
let lastMapMouseX = null, lastMapMouseY = null;

// Лидерборд
let db = null;
let currentLbRounds = 5;

// ===== SUPABASE =====
try {
    if (typeof supabaseClient !== 'undefined') {
        db = supabaseClient;
        console.log('Supabase подключён ✅');
    } else {
        console.warn('Supabase не подключён');
    }
} catch (err) {
    console.warn('Ошибка Supabase:', err);
    db = null;
}

// ===== ЭКРАНЫ =====
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = $(id);
    if (el) el.classList.add('active');
}

// ===== HUD =====
function updateHUD() {
    if ($('hudRound')) $('hudRound').textContent = currentRound;
    if ($('hudTotalRounds')) $('hudTotalRounds').textContent = totalRounds;
    if ($('hudScore')) $('hudScore').textContent = totalScore.toLocaleString();
}

// ===== ЗАГРУЗКА ТОЧЕК ИЗ SUPABASE =====
async function loadPointsFromSupabase() {
    if (!db) {
        console.error('Supabase client не найден');
        return;
    }

    try {
        const { data, error } = await db
            .from('points')
            .select('*')
            .order('id', { ascending: true });

        if (error) throw error;

        allPoints = (data || []).map(item => ({
            id: item.id,
            x: item.x,
            y: item.y,
            name: item.name,
            panorama: item.panorama_url
        }));

        console.log('Точки загружены из Supabase:', allPoints.length);
    } catch (err) {
        console.error('Ошибка загрузки points:', err);
        alert('Не удалось загрузить точки из базы');
        allPoints = [];
    }
}

// ===== ЗАГРУЗКА LINKS =====
async function loadLinksForCurrentPoint() {
    if (!db || !currentViewPoint) {
        currentLinks = [];
        renderPanoramaLinks();
        return;
    }

    try {
        const { data, error } = await db
            .from('point_links')
            .select('*')
            .eq('from_point_id', currentViewPoint.id)
            .order('id', { ascending: true });

        if (error) throw error;

        currentLinks = data || [];
        renderPanoramaLinks();
        updateReturnOriginButton();
    } catch (err) {
        console.error('Ошибка загрузки links:', err);
        currentLinks = [];
        renderPanoramaLinks();
        updateReturnOriginButton();
    }
}

// ===== ПЕРЕХОДЫ НА ПАНОРАМЕ =====
function renderPanoramaLinks() {
    const layer = $('panoramaLinksLayer');
    if (!layer) return;

    layer.innerHTML = '';

    if (!currentLinks || !currentLinks.length || !panoReady || !panoImageWidth) {
        return;
    }

    const container = $('panorama');
    const viewW = container.clientWidth;
    const viewH = container.clientHeight;

    currentLinks.forEach(link => {
        const targetPoint = allPoints.find(p => p.id === link.to_point_id);
        const label = link.label || (targetPoint ? targetPoint.name : 'Переход');

        const worldX = (link.pano_x / 100) * panoImageWidth;
        let screenX = worldX + panoX;

        while (screenX < 0) screenX += panoImageWidth;
        while (screenX > panoImageWidth) screenX -= panoImageWidth;

        const candidates = [screenX, screenX - panoImageWidth, screenX + panoImageWidth];

        candidates.forEach(cx => {
            if (cx >= -80 && cx <= viewW + 80) {
                const el = document.createElement('div');
                el.className = 'panorama-link';
                el.style.left = `${cx}px`;
                el.style.top = `${(link.pano_y / 100) * viewH}px`;

                el.innerHTML = `
                    <div class="panorama-link__arrow"></div>
                    <div class="panorama-link__label">${label}</div>
                `;

                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    goToLinkedPoint(link.to_point_id);
                });

                layer.appendChild(el);
            }
        });
    });
}

async function goToLinkedPoint(targetId) {
    const nextPoint = allPoints.find(p => p.id === targetId);

    if (!nextPoint) {
        alert('Точка перехода не найдена');
        return;
    }

    currentViewPoint = nextPoint;

    const img = $('panoramaImg');
    if (img) img.style.opacity = '0';

    setTimeout(async () => {
        loadPanorama(currentViewPoint.panorama);
        await loadLinksForCurrentPoint();
    }, 180);
}

function updateReturnOriginButton() {
    const btn = $('btnReturnOrigin');
    if (!btn) return;

    if (!roundTargetPoint || !currentViewPoint || roundTargetPoint.id === currentViewPoint.id) {
        btn.classList.add('hidden');
    } else {
        btn.classList.remove('hidden');
    }
}

async function returnToOriginPoint() {
    if (!roundTargetPoint) return;

    currentViewPoint = roundTargetPoint;

    const img = $('panoramaImg');
    if (img) img.style.opacity = '0';

    setTimeout(async () => {
        loadPanorama(currentViewPoint.panorama);
        await loadLinksForCurrentPoint();
    }, 180);
}

// ===== ПАНОРАМА =====
function loadPanorama(imageUrl) {
    const viewport = $('panoramaViewport');
    const img = $('panoramaImg');

    if (!viewport || !img) return;

    panoX = 0;
    panoZoom = 1;
    panoVelocity = 0;
    panoReady = false;

    if (panoAnimFrame) {
        cancelAnimationFrame(panoAnimFrame);
        panoAnimFrame = null;
    }

    const oldClone = viewport.querySelector('.panorama__img--clone');
    if (oldClone) oldClone.remove();

    img.onload = function () {
        setupPanorama();
    };

    img.src = imageUrl;

    if (img.complete && img.naturalWidth > 0) {
        setupPanorama();
    }
}

function setupPanorama() {
    const viewport = $('panoramaViewport');
    const img = $('panoramaImg');
    const container = $('panorama');

    if (!viewport || !img || !container || !img.naturalWidth) return;

    const containerH = container.clientHeight;
    const scale = containerH / img.naturalHeight;
    panoImageWidth = img.naturalWidth * scale;

    img.style.height = containerH + 'px';
    img.style.width = panoImageWidth + 'px';
    img.style.opacity = '1';

    let clone = viewport.querySelector('.panorama__img--clone');
    if (!clone) {
        clone = document.createElement('img');
        clone.className = 'panorama__img panorama__img--clone';
        clone.draggable = false;
        viewport.appendChild(clone);
    }

    clone.src = img.src;
    clone.style.height = containerH + 'px';
    clone.style.width = panoImageWidth + 'px';

    panoX = -(Math.random() * panoImageWidth);
    panoReady = true;
    applyPanorama();
}

function applyPanorama() {
    if (!panoReady || !panoImageWidth) return;

    const viewport = $('panoramaViewport');
    if (!viewport) return;

    while (panoX > 0) panoX -= panoImageWidth;
    while (panoX < -panoImageWidth) panoX += panoImageWidth;

    viewport.style.transform = `translateX(${panoX}px)`;
    renderPanoramaLinks();
}

function panoInertiaLoop() {
    if (Math.abs(panoVelocity) < 0.3) {
        panoVelocity = 0;
        panoAnimFrame = null;
        return;
    }

    panoX += panoVelocity;
    panoVelocity *= 0.92;
    applyPanorama();
    panoAnimFrame = requestAnimationFrame(panoInertiaLoop);
}

function stopPanoInertia() {
    if (panoAnimFrame) {
        cancelAnimationFrame(panoAnimFrame);
        panoAnimFrame = null;
    }
    panoVelocity = 0;
}

const panoEl = $('panorama');
if (panoEl) {
    panoEl.addEventListener('mousedown', (e) => {
        if (e.target.closest('.hud') ||
            e.target.closest('.btn-open-map') ||
            e.target.closest('.map-panel') ||
            e.target.closest('.panorama-link')) return;

        panoDragging = true;
        panoDragStartX = e.clientX;
        panoDragStartPanoX = panoX;
        panoLastMouseX = e.clientX;
        panoLastMoveTime = Date.now();
        stopPanoInertia();
        e.preventDefault();
    });

    panoEl.addEventListener('wheel', (e) => {
        if (e.target.closest('.map-panel')) return;
        e.preventDefault();

        const container = $('panorama');
        const img = $('panoramaImg');
        if (!img || !img.naturalWidth) return;

        const containerH = container.clientHeight;
        const delta = e.deltaY > 0 ? -0.15 : 0.15;
        const newZoom = Math.max(1, Math.min(3, panoZoom + delta));

        if (newZoom === panoZoom) return;

        const oldWidth = panoImageWidth;
        panoZoom = newZoom;

        const scale = (containerH * panoZoom) / img.naturalHeight;
        panoImageWidth = img.naturalWidth * scale;
        const h = containerH * panoZoom;

        img.style.height = h + 'px';
        img.style.width = panoImageWidth + 'px';

        const clone = $('panoramaViewport')?.querySelector('.panorama__img--clone');
        if (clone) {
            clone.style.height = h + 'px';
            clone.style.width = panoImageWidth + 'px';
        }

        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const ratio = panoImageWidth / oldWidth;
        panoX = mouseX - (mouseX - panoX) * ratio;

        applyPanorama();
    }, { passive: false });
}

document.addEventListener('mousemove', (e) => {
    if (!panoDragging) return;

    const now = Date.now();
    const dt = now - panoLastMoveTime;

    if (dt > 0) {
        const dx = e.clientX - panoLastMouseX;
        panoVelocity = dx * (16 / Math.max(dt, 1));
        panoVelocity = Math.max(-30, Math.min(30, panoVelocity));
    }

    panoLastMouseX = e.clientX;
    panoLastMoveTime = now;

    panoX = panoDragStartPanoX + (e.clientX - panoDragStartX);
    applyPanorama();
});

document.addEventListener('mouseup', () => {
    if (!panoDragging) return;
    panoDragging = false;

    if (Math.abs(panoVelocity) > 1) {
        panoAnimFrame = requestAnimationFrame(panoInertiaLoop);
    }
});

window.addEventListener('resize', () => {
    if (panoReady) setupPanorama();
});

// ===== ПРЕДЗАГРУЗКА =====
function preloadNextRound() {
    if (currentRound >= totalRounds) return;
    const next = roundPoints[currentRound];
    if (next && next.panorama) {
        const img = new Image();
        img.src = next.panorama;
    }
}

// ===== СЛУЧАЙНЫЕ ТОЧКИ =====
function pickRandomPoints(count) {
    if (!Array.isArray(allPoints) || allPoints.length === 0) {
        return [];
    }

    const shuffled = [...allPoints].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, shuffled.length));
}

// ===== КАРТА =====
function initMap() {
    const body = $('mapBody');
    const container = $('mapContainer');
    if (!body || !container) return;

    const rect = body.getBoundingClientRect();
    const size = Math.min(rect.width, rect.height);

    container.style.width = size + 'px';
    container.style.height = size + 'px';

    mapZoom = 1;
    mapPanX = (rect.width - size) / 2;
    mapPanY = (rect.height - size) / 2;
    applyMapTransform();
}

function applyMapTransform() {
    const container = $('mapContainer');
    if (!container) return;
    container.style.transform = `translate(${mapPanX}px, ${mapPanY}px) scale(${mapZoom})`;
}

function zoomMap(delta, clientX, clientY) {
    const body = $('mapBody');
    if (!body) return;

    const rect = body.getBoundingClientRect();
    const oldZoom = mapZoom;
    const newZoom = Math.max(0.5, Math.min(10, mapZoom + delta));
    if (newZoom === oldZoom) return;

    const mx = (clientX != null ? clientX : lastMapMouseX) ?? rect.left + rect.width / 2;
    const my = (clientY != null ? clientY : lastMapMouseY) ?? rect.top + rect.height / 2;
    const mouseX = mx - rect.left;
    const mouseY = my - rect.top;

    mapPanX = mouseX - (mouseX - mapPanX) * (newZoom / oldZoom);
    mapPanY = mouseY - (mouseY - mapPanY) * (newZoom / oldZoom);
    mapZoom = newZoom;
    applyMapTransform();
}

function fitMap() {
    const body = $('mapBody');
    const container = $('mapContainer');
    if (!body || !container) return;

    const rect = body.getBoundingClientRect();
    const size = parseFloat(container.style.width);
    mapZoom = 1;
    mapPanX = (rect.width - size) / 2;
    mapPanY = (rect.height - size) / 2;
    applyMapTransform();
}

const mapBody = $('mapBody');
if (mapBody) {
    mapBody.addEventListener('mousedown', (e) => {
        if (e.button === 2 || e.ctrlKey || e.shiftKey) {
            isMapDragging = true;
            mapDragStartX = e.clientX;
            mapDragStartY = e.clientY;
            mapStartPanX = mapPanX;
            mapStartPanY = mapPanY;
            e.preventDefault();
        }
    });

    mapBody.addEventListener('contextmenu', e => e.preventDefault());

    mapBody.addEventListener('mousemove', (e) => {
        lastMapMouseX = e.clientX;
        lastMapMouseY = e.clientY;
    });

    mapBody.addEventListener('wheel', (e) => {
        e.preventDefault();
        zoomMap(e.deltaY > 0 ? -0.3 : 0.3, e.clientX, e.clientY);
    }, { passive: false });
}

document.addEventListener('mousemove', (e) => {
    if (!isMapDragging) return;
    mapPanX = mapStartPanX + (e.clientX - mapDragStartX);
    mapPanY = mapStartPanY + (e.clientY - mapDragStartY);
    applyMapTransform();
});

document.addEventListener('mouseup', () => {
    isMapDragging = false;
});

const mapContainer = $('mapContainer');
if (mapContainer) {
    mapContainer.addEventListener('click', (e) => {
        if (isMapDragging) return;

        const rect = mapContainer.getBoundingClientRect();
        const x = (e.clientX - rect.left) / mapZoom;
        const y = (e.clientY - rect.top) / mapZoom;
        const size = parseFloat(mapContainer.style.width);

        const percX = (x / size) * 100;
        const percY = (y / size) * 100;
        if (percX < 0 || percX > 100 || percY < 0 || percY > 100) return;

        const marker = $('mapMarker');
        if (marker) {
            marker.style.left = percX + '%';
            marker.style.top = percY + '%';
            marker.classList.remove('hidden');
        }

        markerPlaced = true;
        markerMapX = percX;
        markerMapY = percY;
        if ($('btnGuess')) $('btnGuess').disabled = false;

        const gameX = Math.round((percX / 100) * 6000 - 3000);
        const gameY = Math.round(3000 - (percY / 100) * 6000);
        if ($('mapCoords')) $('mapCoords').textContent = `X: ${gameX}  Y: ${gameY}`;
    });
}

if ($('btnMapZoomIn')) $('btnMapZoomIn').addEventListener('click', () => zoomMap(0.4, lastMapMouseX, lastMapMouseY));
if ($('btnMapZoomOut')) $('btnMapZoomOut').addEventListener('click', () => zoomMap(-0.4, lastMapMouseX, lastMapMouseY));
if ($('btnMapFit')) $('btnMapFit').addEventListener('click', fitMap);

// ===== ИГРОВАЯ ЛОГИКА =====
function resetForNewRound() {
    if ($('mapMarker')) $('mapMarker').classList.add('hidden');
    if ($('btnGuess')) $('btnGuess').disabled = true;
    if ($('mapCoords')) $('mapCoords').textContent = 'X: — Y: —';
    if ($('mapPanel')) $('mapPanel').classList.remove('active');
    markerPlaced = false;
    fitMap();
    updateReturnOriginButton();
}

function startGame() {
    const nickname = $('nickname')?.value.trim();
    if (!nickname) {
        if ($('nickname')) {
            $('nickname').focus();
            $('nickname').style.borderColor = '#ff4444';
            setTimeout(() => { $('nickname').style.borderColor = ''; }, 1500);
        }
        return;
    }

    const activeBtn = document.querySelector('#roundOptions .setting__btn.active');
    totalRounds = parseInt(activeBtn?.dataset.value || 5);
    if (totalRounds > allPoints.length) totalRounds = allPoints.length;

    currentRound = 1;
    totalScore = 0;
    roundPoints = pickRandomPoints(totalRounds);

    if (!roundPoints || roundPoints.length === 0) {
        alert('Нет доступных точек. Проверь загрузку из Supabase.');
        return;
    }

    roundTargetPoint = roundPoints[0];
    currentViewPoint = roundTargetPoint;

    updateHUD();
    resetForNewRound();
    showScreen('screenGame');

    setTimeout(async () => {
    loadPanorama(currentViewPoint.panorama);
    await loadLinksForCurrentPoint();
    initMap();
    updateReturnOriginButton();
    }, 100);
}

function showResultOnMap(guessX, guessY, actualX, actualY) {
    const zoomEl = $('resultMapZoom');
    const mapEl = $('resultMap');

    if (!zoomEl || !mapEl) return;

    const gx = ((guessX + 3000) / 6000) * 100;
    const gy = ((3000 - guessY) / 6000) * 100;
    const ax = ((actualX + 3000) / 6000) * 100;
    const ay = ((3000 - actualY) / 6000) * 100;

    const cx = (gx + ax) / 2;
    const cy = (gy + ay) / 2;
    const span = Math.max(Math.abs(gx - ax), Math.abs(gy - ay));

    const padding = 15;
    let zoom = Math.min(15, Math.max(1, 80 / Math.max(span + padding * 2, 5)));
    zoom = Math.round(zoom * 10) / 10;

    const zoomedSize = 100 * zoom;
    let left = 50 - cx * zoom;
    let top = 50 - cy * zoom;

    const minLeft = 100 - zoomedSize;
    const minTop = 100 - zoomedSize;

    left = Math.max(minLeft, Math.min(0, left));
    top = Math.max(minTop, Math.min(0, top));

    const counterScale = 1 / zoom;

    const pinG = $('resultPinGuess');
    const pinA = $('resultPinActual');
    const line = $('resultLinePath');

    if (pinG) {
        pinG.style.left = gx + '%';
        pinG.style.top = gy + '%';
        pinG.style.transform = `translate(-50%, -50%) scale(${counterScale})`;
    }

    if (pinA) {
        pinA.style.left = ax + '%';
        pinA.style.top = ay + '%';
        pinA.style.transform = `translate(-50%, -50%) scale(${counterScale})`;
    }

    if (line) {
        line.setAttribute('x1', gx);
        line.setAttribute('y1', gy);
        line.setAttribute('x2', ax);
        line.setAttribute('y2', ay);
        line.setAttribute('stroke-width', 0.5 / zoom);
        line.setAttribute('stroke-dasharray', `${1.5 / zoom},${1 / zoom}`);
    }

    zoomEl.style.transition = 'none';
    zoomEl.style.width = '100%';
    zoomEl.style.height = '100%';
    zoomEl.style.left = '0%';
    zoomEl.style.top = '0%';
    zoomEl.getBoundingClientRect();

    if (pinG && pinA) {
        pinG.style.animation = 'none';
        pinA.style.animation = 'none';
        pinG.getBoundingClientRect();
        pinG.style.animation = '';
        pinA.style.animation = '';
    }

    setTimeout(() => {
        zoomEl.style.transition = 'all 1s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        zoomEl.style.width = zoomedSize + '%';
        zoomEl.style.height = zoomedSize + '%';
        zoomEl.style.left = left + '%';
        zoomEl.style.top = top + '%';
    }, 500);
}

function makeGuess() {
    if (!roundTargetPoint || !markerPlaced) return;

    const guessX = Math.round((markerMapX / 100) * 6000 - 3000);
    const guessY = Math.round(3000 - (markerMapY / 100) * 6000);
    const actualX = roundTargetPoint.x;
    const actualY = roundTargetPoint.y;

    const distance = Math.round(Math.sqrt(
        Math.pow(guessX - actualX, 2) + Math.pow(guessY - actualY, 2)
    ));

    const roundScore = Math.round(5000 * Math.exp(-distance / 800));
    totalScore += roundScore;

    if ($('resultDistance')) $('resultDistance').textContent = distance.toLocaleString();
    if ($('resultScore')) $('resultScore').textContent = roundScore.toLocaleString();
    if ($('resultTotalScore')) $('resultTotalScore').textContent = totalScore.toLocaleString();
    if ($('resultLocation')) $('resultLocation').textContent = roundTargetPoint.name;

    if (roundScore >= 4000) {
        if ($('resultEmoji')) $('resultEmoji').textContent = '🎯';
        if ($('resultTitle')) $('resultTitle').textContent = 'Отлично!';
    } else if (roundScore >= 2000) {
        if ($('resultEmoji')) $('resultEmoji').textContent = '👍';
        if ($('resultTitle')) $('resultTitle').textContent = 'Хорошо!';
    } else if (roundScore >= 500) {
        if ($('resultEmoji')) $('resultEmoji').textContent = '🤔';
        if ($('resultTitle')) $('resultTitle').textContent = 'Неплохо';
    } else {
        if ($('resultEmoji')) $('resultEmoji').textContent = '😅';
        if ($('resultTitle')) $('resultTitle').textContent = 'Далековато...';
    }

    if ($('btnNextRound')) {
        $('btnNextRound').textContent = currentRound >= totalRounds
            ? '🏁 Посмотреть результаты'
            : 'Следующий раунд →';
    }

    updateScoreDots();
    preloadNextRound();
    if ($('mapPanel')) $('mapPanel').classList.remove('active');
    showScreen('screenRoundResult');

    setTimeout(() => {
        showResultOnMap(guessX, guessY, actualX, actualY);
    }, 100);
}

function nextRound() {
    if (currentRound >= totalRounds) {
        showFinalResults();
        showScreen('screenFinal');
    } else {
        currentRound++;
        roundTargetPoint = roundPoints[currentRound - 1];
        currentViewPoint = roundTargetPoint;
        updateHUD();
        resetForNewRound();
        showScreen('screenGame');
        setTimeout(async () => {
            loadPanorama(currentViewPoint.panorama);
            await loadLinksForCurrentPoint();
            initMap();
            updateReturnOriginButton();
        }, 100);
    }
}

function updateScoreDots() {
    const c = $('scoreDots');
    if (!c) return;

    c.innerHTML = '';
    for (let i = 0; i < totalRounds; i++) {
        const d = document.createElement('div');
        d.className = 'score-dot' + (i < currentRound ? ' score-dot--filled' : '');
        c.appendChild(d);
    }
}

function showFinalResults() {
    const max = totalRounds * 5000;
    const pct = Math.round((totalScore / max) * 100);

    if ($('finalScore')) $('finalScore').textContent = totalScore.toLocaleString();
    if ($('finalScoreMax')) $('finalScoreMax').textContent = '/ ' + max.toLocaleString();
    if ($('finalPercentage')) $('finalPercentage').textContent = pct + '%';

    if ($('finalScoreFill')) {
        $('finalScoreFill').style.width = '0%';
        setTimeout(() => { $('finalScoreFill').style.width = pct + '%'; }, 100);
    }

    if (pct >= 90) {
        if ($('finalEmoji')) $('finalEmoji').textContent = '🏆';
        if ($('finalRankText')) $('finalRankText').textContent = 'Мастер Province!';
    } else if (pct >= 70) {
        if ($('finalEmoji')) $('finalEmoji').textContent = '🥇';
        if ($('finalRankText')) $('finalRankText').textContent = 'Отлично знаешь карту!';
    } else if (pct >= 50) {
        if ($('finalEmoji')) $('finalEmoji').textContent = '🥈';
        if ($('finalRankText')) $('finalRankText').textContent = 'Хорошо!';
    } else if (pct >= 30) {
        if ($('finalEmoji')) $('finalEmoji').textContent = '🥉';
        if ($('finalRankText')) $('finalRankText').textContent = 'Неплохо';
    } else {
        if ($('finalEmoji')) $('finalEmoji').textContent = '🗺️';
        if ($('finalRankText')) $('finalRankText').textContent = 'Стоит поизучать карту!';
    }
}

// ===== ЛИДЕРБОРД =====
async function saveScore(nickname, score, rounds) {
    // localStorage fallback
    saveScoreLocalBest(nickname, score, rounds);

    if (!db) return;

    try {
        // Ищем существующую запись этого ника для этих раундов
        const { data: existing, error: selectError } = await db
            .from('leaderboard')
            .select('*')
            .eq('nickname', nickname)
            .eq('rounds', rounds)
            .limit(1);

        if (selectError) throw selectError;

        const maxScore = rounds * 5000;

        if (!existing || existing.length === 0) {
            // Нет записи — создаём
            const { error: insertError } = await db
                .from('leaderboard')
                .insert({
                    nickname,
                    score,
                    rounds,
                    max_score: maxScore
                });

            if (insertError) throw insertError;
        } else {
            const old = existing[0];

            // Обновляем только если новый результат лучше
            if (score > old.score) {
                const { error: updateError } = await db
                    .from('leaderboard')
                    .update({
                        score,
                        max_score: maxScore,
                        created_at: new Date().toISOString()
                    })
                    .eq('id', old.id);

                if (updateError) throw updateError;
            }
        }
    } catch (err) {
        console.warn('Не удалось сохранить в Supabase:', err);
    }
}

async function loadLeaderboard(rounds) {
    if (db) {
        try {
            const { data, error } = await db
                .from('leaderboard')
                .select('*')
                .eq('rounds', rounds)
                .order('score', { ascending: false })
                .limit(50);

            if (error) throw error;
            if (data && data.length > 0) return data;
        } catch (err) {
            console.warn('Supabase недоступен, загружаем локально:', err);
        }
    }

    return loadLeaderboardLocal(rounds);
}

function saveScoreLocalBest(nickname, score, rounds) {
    const key = 'mtaLb_' + rounds;
    let entries = loadLeaderboardLocal(rounds);

    const existingIndex = entries.findIndex(e =>
        e.nickname.toLowerCase() === nickname.toLowerCase()
    );

    const newEntry = {
        nickname,
        score,
        rounds,
        max_score: rounds * 5000,
        created_at: new Date().toISOString()
    };

    if (existingIndex === -1) {
        entries.push(newEntry);
    } else {
        if (score > entries[existingIndex].score) {
            entries[existingIndex] = newEntry;
        }
    }

    entries.sort((a, b) => b.score - a.score);
    localStorage.setItem(key, JSON.stringify(entries.slice(0, 50)));
}

function loadLeaderboardLocal(rounds) {
    try {
        return JSON.parse(localStorage.getItem('mtaLb_' + rounds) || '[]');
    } catch {
        return [];
    }
}

async function renderLeaderboard(highlightNickname, rounds) {
    if (rounds !== undefined) currentLbRounds = rounds;

    document.querySelectorAll('.lb-tab').forEach(t => {
        t.classList.toggle('active', parseInt(t.dataset.rounds) === currentLbRounds);
    });

    const list = $('leaderboardList');
    if (!list) return;

    list.innerHTML = '<div class="leaderboard__empty">Загрузка...</div>';

    for (let i = 1; i <= 3; i++) {
        const p = $('podium' + i);
        if (!p) continue;
        p.querySelector('.podium__name').textContent = '—';
        p.querySelector('.podium__score').textContent = '—';
        p.style.opacity = '0.3';
    }

    const entries = await loadLeaderboard(currentLbRounds);

    for (let i = 0; i < Math.min(3, entries.length); i++) {
        const p = $('podium' + (i + 1));
        if (!p) continue;
        p.querySelector('.podium__name').textContent = entries[i].nickname;
        p.querySelector('.podium__score').textContent = entries[i].score.toLocaleString();
        p.style.opacity = '1';
    }

    if (entries.length === 0) {
        list.innerHTML = `<div class="leaderboard__empty">
            Нет результатов для ${currentLbRounds} раундов.<br>Сыграй первым!
        </div>`;
        return;
    }

    list.innerHTML = '';

    entries.forEach((e, i) => {
        const isMe = highlightNickname &&
            e.nickname.toLowerCase() === highlightNickname.toLowerCase();
        const pct = Math.round((e.score / e.max_score) * 100);
        const dateStr = new Date(e.created_at).toLocaleDateString('ru-RU');

        const row = document.createElement('div');
        row.className = 'leaderboard__row' + (isMe ? ' leaderboard__row--highlight' : '');
        row.innerHTML = `
            <span class="leaderboard__pos">${getMedal(i)}</span>
            <span class="leaderboard__row-name">${isMe ? '→ ' : ''}${e.nickname}</span>
            <div class="leaderboard__row-info">
                <span class="leaderboard__row-score">${e.score.toLocaleString()}</span>
                <span class="leaderboard__row-details">${pct}% · ${dateStr}</span>
            </div>
        `;
        list.appendChild(row);
    });
}

function getMedal(i) {
    if (i === 0) return '🥇';
    if (i === 1) return '🥈';
    if (i === 2) return '🥉';
    return i + 1;
}

const _originalShowFinal = showFinalResults;
showFinalResults = function () {
    _originalShowFinal();
    const nickname = $('nickname')?.value.trim() || 'Игрок';
    saveScore(nickname, totalScore, totalRounds);
};

// ===== ОБРАБОТЧИКИ =====
document.querySelectorAll('.setting__options').forEach(g => {
    g.querySelectorAll('.setting__btn').forEach(b => {
        b.addEventListener('click', () => {
            g.querySelectorAll('.setting__btn').forEach(x => x.classList.remove('active'));
            b.classList.add('active');
        });
    });
});

if ($('btnStart')) {
    $('btnStart').addEventListener('click', async () => {
        if (!allPoints.length) {
            await loadPointsFromSupabase();
        }

        if (!allPoints.length) {
            alert('Не удалось загрузить точки из базы.');
            return;
        }

        startGame();
    });
}

if ($('btnPlayAgain')) $('btnPlayAgain').addEventListener('click', () => showScreen('screenMenu'));
if ($('btnNextRound')) $('btnNextRound').addEventListener('click', nextRound);
if ($('btnGuess')) $('btnGuess').addEventListener('click', makeGuess);

if ($('btnOpenMap')) {
    $('btnOpenMap').addEventListener('click', () => {
        const p = $('mapPanel');
        if (!p) return;
        p.classList.toggle('active');
        if (p.classList.contains('active')) setTimeout(initMap, 50);
    });
}

if ($('btnCloseMap')) $('btnCloseMap').addEventListener('click', () => $('mapPanel')?.classList.remove('active'));

if ($('btnHowToPlay')) $('btnHowToPlay').addEventListener('click', () => $('modalHowTo')?.classList.add('active'));
if ($('btnCloseHowTo')) $('btnCloseHowTo').addEventListener('click', () => $('modalHowTo')?.classList.remove('active'));
document.querySelector('.modal__backdrop')?.addEventListener('click', () => $('modalHowTo')?.classList.remove('active'));

document.addEventListener('keydown', (e) => {
    if (!$('screenGame')?.classList.contains('active')) return;
    if (e.key === 'm' || e.key === 'M' || e.key === 'ь' || e.key === 'Ь') {
        const p = $('mapPanel');
        if (!p) return;
        p.classList.toggle('active');
        if (p.classList.contains('active')) setTimeout(initMap, 50);
    }
});

if ($('btnShare')) {
    $('btnShare').addEventListener('click', () => {
        const nick = $('nickname')?.value || 'Игрок';
        const max = totalRounds * 5000;
        const pct = Math.round((totalScore / max) * 100);
        navigator.clipboard?.writeText(
            `🗺️ MTA Province Guesser\nИгрок: ${nick}\nСчёт: ${totalScore.toLocaleString()}/${max.toLocaleString()} (${pct}%)`
        );
        const t = $('toast');
        if (t) {
            t.classList.remove('hidden');
            setTimeout(() => t.classList.add('hidden'), 2500);
        }
    });
}

if ($('btnLeaderboard')) {
    $('btnLeaderboard').addEventListener('click', () => {
        renderLeaderboard(null, totalRounds || 5);
        showScreen('screenLeaderboard');
    });
}

if ($('btnFinalLb')) {
    $('btnFinalLb').addEventListener('click', () => {
        const nick = $('nickname')?.value.trim() || 'Игрок';
        renderLeaderboard(nick, totalRounds);
        showScreen('screenLeaderboard');
    });
}

if ($('btnLbBack')) $('btnLbBack').addEventListener('click', () => showScreen('screenMenu'));

document.querySelectorAll('.lb-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const rounds = parseInt(tab.dataset.rounds);
        const nick = $('nickname')?.value.trim() || null;
        renderLeaderboard(nick, rounds);
    });
});

console.log('Обработчики лидерборда привязаны ✅');

if ($('btnReturnOrigin')) {
    $('btnReturnOrigin').addEventListener('click', returnToOriginPoint);
}
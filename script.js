// ===== СОСТОЯНИЕ =====
let currentRound = 1;
let totalRounds = 5;
let totalScore = 0;
let roundPoints = [];
let currentPoint = null;

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

const $ = id => document.getElementById(id);

// ===== ЭКРАНЫ =====
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    $(id).classList.add('active');
}

// ===== HUD =====
function updateHUD() {
    $('hudRound').textContent = currentRound;
    $('hudTotalRounds').textContent = totalRounds;
    $('hudScore').textContent = totalScore.toLocaleString();
}

// ===== ПАНОРАМА =====

function loadPanorama(imageUrl) {
    const viewport = $('panoramaViewport');
    const img = $('panoramaImg');

    // Сброс
    panoX = 0;
    panoZoom = 1;
    panoVelocity = 0;
    panoReady = false;
    if (panoAnimFrame) {
        cancelAnimationFrame(panoAnimFrame);
        panoAnimFrame = null;
    }

    // Убираем старый клон
    const oldClone = viewport.querySelector('.panorama__img--clone');
    if (oldClone) oldClone.remove();

    // Загружаем новое изображение
    img.onload = function () {
        setupPanorama();
    };

    img.src = imageUrl;

    // Если уже в кеше
    if (img.complete && img.naturalWidth > 0) {
        setupPanorama();
    }
}

function setupPanorama() {
    const viewport = $('panoramaViewport');
    const img = $('panoramaImg');
    const container = $('panorama');

    if (!img.naturalWidth) return;

    // Считаем размеры
    const containerH = container.clientHeight;
    const scale = containerH / img.naturalHeight;
    panoImageWidth = img.naturalWidth * scale;

    img.style.height = containerH + 'px';
    img.style.width = panoImageWidth + 'px';

    // Создаём клон для бесшовной прокрутки
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

    // Случайная начальная позиция
    panoX = -(Math.random() * panoImageWidth);

    panoReady = true;
    applyPanorama();
}

function applyPanorama() {
    if (!panoReady) return;

    const viewport = $('panoramaViewport');

    // Зацикливание
    if (panoImageWidth > 0) {
        while (panoX > 0) panoX -= panoImageWidth;
        while (panoX < -panoImageWidth) panoX += panoImageWidth;
    }

    viewport.style.transform = `translateX(${panoX}px)`;
}

// Инерция — плавная
function panoInertiaLoop() {
    if (Math.abs(panoVelocity) < 0.3) {
        panoVelocity = 0;
        panoAnimFrame = null;
        return;
    }

    panoX += panoVelocity;
    panoVelocity *= 0.92; // трение
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

// ===== ПАНОРАМА — МЫШЬ =====

$('panorama').addEventListener('mousedown', (e) => {
    // Не перехватываем клики по UI элементам
    if (e.target.closest('.hud') ||
        e.target.closest('.btn-open-map') ||
        e.target.closest('.map-panel')) return;

    panoDragging = true;
    panoDragStartX = e.clientX;
    panoDragStartPanoX = panoX;
    panoLastMouseX = e.clientX;
    panoLastMoveTime = Date.now();
    stopPanoInertia();
    e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
    if (!panoDragging) return;

    const now = Date.now();
    const dt = now - panoLastMoveTime;

    // Скорость для инерции (пиксели в кадр, ~16ms)
    if (dt > 0) {
        const dx = e.clientX - panoLastMouseX;
        panoVelocity = dx * (16 / Math.max(dt, 1)); // нормализуем к 60fps
        // Ограничиваем максимальную скорость
        panoVelocity = Math.max(-30, Math.min(30, panoVelocity));
    }

    panoLastMouseX = e.clientX;
    panoLastMoveTime = now;

    // Двигаем панораму
    panoX = panoDragStartPanoX + (e.clientX - panoDragStartX);
    applyPanorama();
});

document.addEventListener('mouseup', () => {
    if (!panoDragging) return;
    panoDragging = false;

    // Запускаем инерцию только если есть скорость
    if (Math.abs(panoVelocity) > 1) {
        panoAnimFrame = requestAnimationFrame(panoInertiaLoop);
    }
});

// Зум панорамы колёсиком
$('panorama').addEventListener('wheel', (e) => {
    if (e.target.closest('.map-panel')) return;
    e.preventDefault();

    const container = $('panorama');
    const img = $('panoramaImg');
    if (!img.naturalWidth) return;

    const containerH = container.clientHeight;
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    const newZoom = Math.max(1, Math.min(3, panoZoom + delta));

    if (newZoom === panoZoom) return;

    const oldWidth = panoImageWidth;
    panoZoom = newZoom;

    const scale = (containerH * panoZoom) / img.naturalHeight;
    panoImageWidth = img.naturalWidth * scale;
    const h = containerH * panoZoom;

    // Обновляем оригинал и клон
    img.style.height = h + 'px';
    img.style.width = panoImageWidth + 'px';

    const clone = $('panoramaViewport').querySelector('.panorama__img--clone');
    if (clone) {
        clone.style.height = h + 'px';
        clone.style.width = panoImageWidth + 'px';
    }

    // Zoom to cursor — сохраняем точку под курсором
    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const ratio = panoImageWidth / oldWidth;
    panoX = mouseX - (mouseX - panoX) * ratio;

    // Вертикальное центрирование
    const offsetY = (containerH - h) / 2;
    $('panoramaViewport').style.top = offsetY + 'px';

    applyPanorama();
}, { passive: false });

// ===== ПАНОРАМА — ТАЧСКРИН =====

let touchStartX = 0;
let touchStartPanoX = 0;
let touchLastX = 0;
let touchLastTime = 0;

$('panorama').addEventListener('touchstart', (e) => {
    if (e.target.closest('.hud') ||
        e.target.closest('.btn-open-map') ||
        e.target.closest('.map-panel')) return;

    panoDragging = true;
    touchStartX = e.touches[0].clientX;
    touchStartPanoX = panoX;
    touchLastX = touchStartX;
    touchLastTime = Date.now();
    stopPanoInertia();
}, { passive: true });

$('panorama').addEventListener('touchmove', (e) => {
    if (!panoDragging) return;

    const now = Date.now();
    const dt = now - touchLastTime;
    const currentX = e.touches[0].clientX;

    if (dt > 0) {
        panoVelocity = (currentX - touchLastX) * (16 / Math.max(dt, 1));
        panoVelocity = Math.max(-30, Math.min(30, panoVelocity));
    }

    touchLastX = currentX;
    touchLastTime = now;

    panoX = touchStartPanoX + (currentX - touchStartX);
    applyPanorama();
}, { passive: true });

$('panorama').addEventListener('touchend', () => {
    panoDragging = false;
    if (Math.abs(panoVelocity) > 1) {
        panoAnimFrame = requestAnimationFrame(panoInertiaLoop);
    }
});

// Ресайз
window.addEventListener('resize', () => {
    if (panoReady) setupPanorama();
});

// ===== ПРЕДЗАГРУЗКА =====
function preloadNextRound() {
    if (currentRound >= totalRounds) return;
    const next = roundPoints[currentRound];
    if (next) {
        const img = new Image();
        img.src = next.panorama;
    }
}

// ===== СЛУЧАЙНЫЕ ТОЧКИ =====
function pickRandomPoints(count) {
    const shuffled = [...allPoints].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, shuffled.length));
}

// ===== КАРТА =====
function initMap() {
    const body = $('mapBody');
    const container = $('mapContainer');
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
    $('mapContainer').style.transform = `translate(${mapPanX}px, ${mapPanY}px) scale(${mapZoom})`;
}

function zoomMap(delta, clientX, clientY) {
    const body = $('mapBody');
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
    const rect = body.getBoundingClientRect();
    const size = parseFloat($('mapContainer').style.width);
    mapZoom = 1;
    mapPanX = (rect.width - size) / 2;
    mapPanY = (rect.height - size) / 2;
    applyMapTransform();
}

// Перетаскивание карты — ПКМ
$('mapBody').addEventListener('mousedown', (e) => {
    if (e.button === 2 || e.ctrlKey || e.shiftKey) {
        isMapDragging = true;
        mapDragStartX = e.clientX;
        mapDragStartY = e.clientY;
        mapStartPanX = mapPanX;
        mapStartPanY = mapPanY;
        e.preventDefault();
    }
});
$('mapBody').addEventListener('contextmenu', e => e.preventDefault());

document.addEventListener('mousemove', (e) => {
    if (!isMapDragging) return;
    mapPanX = mapStartPanX + (e.clientX - mapDragStartX);
    mapPanY = mapStartPanY + (e.clientY - mapDragStartY);
    applyMapTransform();
});
document.addEventListener('mouseup', () => { isMapDragging = false; });

$('mapBody').addEventListener('mousemove', (e) => {
    lastMapMouseX = e.clientX;
    lastMapMouseY = e.clientY;
});

$('mapBody').addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomMap(e.deltaY > 0 ? -0.3 : 0.3, e.clientX, e.clientY);
}, { passive: false });

// Маркер
$('mapContainer').addEventListener('click', (e) => {
    if (isMapDragging) return;
    const container = $('mapContainer');
    const rect = container.getBoundingClientRect();
    const x = (e.clientX - rect.left) / mapZoom;
    const y = (e.clientY - rect.top) / mapZoom;
    const size = parseFloat(container.style.width);

    const percX = (x / size) * 100;
    const percY = (y / size) * 100;
    if (percX < 0 || percX > 100 || percY < 0 || percY > 100) return;

    const marker = $('mapMarker');
    marker.style.left = percX + '%';
    marker.style.top = percY + '%';
    marker.classList.remove('hidden');

    markerPlaced = true;
    markerMapX = percX;
    markerMapY = percY;
    $('btnGuess').disabled = false;

    const gameX = Math.round((percX / 100) * 6000 - 3000);
    const gameY = Math.round(3000 - (percY / 100) * 6000);
    $('mapCoords').textContent = `X: ${gameX}  Y: ${gameY}`;
});

$('btnMapZoomIn').addEventListener('click', () => zoomMap(0.4, lastMapMouseX, lastMapMouseY));
$('btnMapZoomOut').addEventListener('click', () => zoomMap(-0.4, lastMapMouseX, lastMapMouseY));
$('btnMapFit').addEventListener('click', fitMap);

// ===== ИГРОВАЯ ЛОГИКА =====

function resetForNewRound() {
    $('mapMarker').classList.add('hidden');
    $('btnGuess').disabled = true;
    $('mapCoords').textContent = 'X: — Y: —';
    $('mapPanel').classList.remove('active');
    markerPlaced = false;
    fitMap();
}

function startGame() {
    const nickname = $('nickname').value.trim();
    if (!nickname) {
        $('nickname').focus();
        $('nickname').style.borderColor = '#ff4444';
        setTimeout(() => { $('nickname').style.borderColor = ''; }, 1500);
        return;
    }

    const activeBtn = document.querySelector('#roundOptions .setting__btn.active');
    totalRounds = parseInt(activeBtn?.dataset.value || 5);
    if (totalRounds > allPoints.length) totalRounds = allPoints.length;

    currentRound = 1;
    totalScore = 0;
    roundPoints = pickRandomPoints(totalRounds);
    currentPoint = roundPoints[0];

    updateHUD();
    resetForNewRound();
    showScreen('screenGame');

    setTimeout(() => {
        loadPanorama(currentPoint.panorama);
        initMap();
    }, 100);
}
// ===== ПОКАЗ РЕЗУЛЬТАТА НА КАРТЕ =====
function showResultOnMap(guessX, guessY, actualX, actualY) {
    const zoomEl = $('resultMapZoom');
    const mapEl = $('resultMap');

    // Игровые координаты → проценты
    const gx = ((guessX + 3000) / 6000) * 100;
    const gy = ((3000 - guessY) / 6000) * 100;
    const ax = ((actualX + 3000) / 6000) * 100;
    const ay = ((3000 - actualY) / 6000) * 100;

    // Центр между точками
    const cx = (gx + ax) / 2;
    const cy = (gy + ay) / 2;

    // Расстояние
    const span = Math.max(Math.abs(gx - ax), Math.abs(gy - ay));

    // Зум — чтобы точки + отступ помещались
    const padding = 15;
    let zoom = Math.min(15, Math.max(1, 80 / Math.max(span + padding * 2, 5)));
    zoom = Math.round(zoom * 10) / 10;

    // Размер зумленной карты в % от контейнера
    const zoomedSize = 100 * zoom;

    // Позиция: сдвигаем так чтобы cx,cy были в центре видимой области
    // cx% от карты должен быть на 50% контейнера
    let left = 50 - cx * zoom;
    let top = 50 - cy * zoom;

    // Ограничиваем чтобы карта не выходила за края
    const minLeft = 100 - zoomedSize;  // максимально влево
    const minTop = 100 - zoomedSize;

    left = Math.max(minLeft, Math.min(0, left));
    top = Math.max(minTop, Math.min(0, top));

    const counterScale = 1 / zoom;

    // Маркеры
    const pinG = $('resultPinGuess');
    const pinA = $('resultPinActual');

    pinG.style.left = gx + '%';
    pinG.style.top = gy + '%';
    pinG.style.transform = `translate(-50%, -50%) scale(${counterScale})`;

    pinA.style.left = ax + '%';
    pinA.style.top = ay + '%';
    pinA.style.transform = `translate(-50%, -50%) scale(${counterScale})`;

    // Линия
    const line = $('resultLinePath');
    line.setAttribute('x1', gx);
    line.setAttribute('y1', gy);
    line.setAttribute('x2', ax);
    line.setAttribute('y2', ay);
    line.setAttribute('stroke-width', 0.5 / zoom);
    line.setAttribute('stroke-dasharray', `${1.5 / zoom},${1 / zoom}`);

    // Сброс — показываем всю карту
    zoomEl.style.transition = 'none';
    zoomEl.style.width = '100%';
    zoomEl.style.height = '100%';
    zoomEl.style.left = '0%';
    zoomEl.style.top = '0%';
    zoomEl.getBoundingClientRect();

    // Анимации маркеров
    pinG.style.animation = 'none';
    pinA.style.animation = 'none';
    pinG.getBoundingClientRect();
    pinG.style.animation = '';
    pinA.style.animation = '';

    // Зум с задержкой
    setTimeout(() => {
        zoomEl.style.transition = 'all 1s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        zoomEl.style.width = zoomedSize + '%';
        zoomEl.style.height = zoomedSize + '%';
        zoomEl.style.left = left + '%';
        zoomEl.style.top = top + '%';
    }, 500);
}

function makeGuess() {
    if (!currentPoint || !markerPlaced) return;

    const guessX = Math.round((markerMapX / 100) * 6000 - 3000);
    const guessY = Math.round(3000 - (markerMapY / 100) * 6000);
    const actualX = currentPoint.x;
    const actualY = currentPoint.y;

    const distance = Math.round(Math.sqrt(
        Math.pow(guessX - actualX, 2) + Math.pow(guessY - actualY, 2)
    ));

    const roundScore = Math.round(5000 * Math.exp(-distance / 800));
    totalScore += roundScore;

    $('resultDistance').textContent = distance.toLocaleString();
    $('resultScore').textContent = roundScore.toLocaleString();
    $('resultTotalScore').textContent = totalScore.toLocaleString();
    $('resultLocation').textContent = currentPoint.name;

    if (roundScore >= 4000) {
        $('resultEmoji').textContent = '🎯'; $('resultTitle').textContent = 'Отлично!';
    } else if (roundScore >= 2000) {
        $('resultEmoji').textContent = '👍'; $('resultTitle').textContent = 'Хорошо!';
    } else if (roundScore >= 500) {
        $('resultEmoji').textContent = '🤔'; $('resultTitle').textContent = 'Неплохо';
    } else {
        $('resultEmoji').textContent = '😅'; $('resultTitle').textContent = 'Далековато...';
    }

    $('btnNextRound').textContent = currentRound >= totalRounds
        ? '🏁 Посмотреть результаты' : 'Следующий раунд →';

    updateScoreDots();
    preloadNextRound();
    $('mapPanel').classList.remove('active');
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
        currentPoint = roundPoints[currentRound - 1];
        updateHUD();
        resetForNewRound();
        showScreen('screenGame');
        setTimeout(() => {
            loadPanorama(currentPoint.panorama);
            initMap();
        }, 100);
    }
}

function updateScoreDots() {
    const c = $('scoreDots');
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
    $('finalScore').textContent = totalScore.toLocaleString();
    $('finalScoreMax').textContent = '/ ' + max.toLocaleString();
    $('finalPercentage').textContent = pct + '%';
    $('finalScoreFill').style.width = '0%';
    setTimeout(() => { $('finalScoreFill').style.width = pct + '%'; }, 100);

    if (pct >= 90)      { $('finalEmoji').textContent = '🏆'; $('finalRankText').textContent = 'Мастер Province!'; }
    else if (pct >= 70)  { $('finalEmoji').textContent = '🥇'; $('finalRankText').textContent = 'Отлично знаешь карту!'; }
    else if (pct >= 50)  { $('finalEmoji').textContent = '🥈'; $('finalRankText').textContent = 'Хорошо!'; }
    else if (pct >= 30)  { $('finalEmoji').textContent = '🥉'; $('finalRankText').textContent = 'Неплохо'; }
    else                 { $('finalEmoji').textContent = '🗺️'; $('finalRankText').textContent = 'Стоит поизучать карту!'; }
}

// ===== ОБРАБОТЧИКИ =====
document.querySelectorAll('.setting__options').forEach(g => {
    g.querySelectorAll('.setting__btn').forEach(b => {
        b.addEventListener('click', () => {
            g.querySelectorAll('.setting__btn').forEach(x => x.classList.remove('active'));
            b.classList.add('active');
        });
    });
});

$('btnStart').addEventListener('click', startGame);
$('btnPlayAgain').addEventListener('click', () => showScreen('screenMenu'));
$('btnNextRound').addEventListener('click', nextRound);
$('btnGuess').addEventListener('click', makeGuess);

$('btnOpenMap').addEventListener('click', () => {
    const p = $('mapPanel');
    p.classList.toggle('active');
    if (p.classList.contains('active')) setTimeout(initMap, 50);
});
$('btnCloseMap').addEventListener('click', () => $('mapPanel').classList.remove('active'));

$('btnHowToPlay').addEventListener('click', () => $('modalHowTo').classList.add('active'));
$('btnCloseHowTo').addEventListener('click', () => $('modalHowTo').classList.remove('active'));
document.querySelector('.modal__backdrop').addEventListener('click', () => $('modalHowTo').classList.remove('active'));

document.addEventListener('keydown', (e) => {
    if (!$('screenGame').classList.contains('active')) return;
    if (e.key === 'm' || e.key === 'M' || e.key === 'ь' || e.key === 'Ь') {
        const p = $('mapPanel');
        p.classList.toggle('active');
        if (p.classList.contains('active')) setTimeout(initMap, 50);
    }
});

$('btnShare')?.addEventListener('click', () => {
    const nick = $('nickname').value || 'Игрок';
    const max = totalRounds * 5000;
    const pct = Math.round((totalScore / max) * 100);
    navigator.clipboard?.writeText(
        `🗺️ MTA Province Guesser\nИгрок: ${nick}\nСчёт: ${totalScore.toLocaleString()}/${max.toLocaleString()} (${pct}%)`
    );
    const t = $('toast');
    t.classList.remove('hidden');
    setTimeout(() => t.classList.add('hidden'), 2500);
});

// ===== ТАБЛИЦА ЛИДЕРОВ =====

// ===== SUPABASE =====
// ВСТАВЬ СВОИ КЛЮЧИ:
const SUPABASE_URL = 'https://nftichzrxjkgqporlivb.supabase.co/';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5mdGljaHpyeGprZ3Fwb3JsaXZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2OTY4NjgsImV4cCI6MjA5MDI3Mjg2OH0.rRUa-58ZEro9yus16R1nJTMSZVsoZlg-wHZL1QoGxrM';                 

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentLbRounds = 5; // активная вкладка

// Сохранить результат
async function saveScore(nickname, score, rounds) {
    try {
        await db.from('leaderboard').insert({
            nickname: nickname,
            score: score,
            rounds: rounds,
            max_score: rounds * 5000
        });
    } catch (err) {
        console.error('Ошибка сохранения:', err);
    }
}

// Загрузить таблицу по кол-ву раундов
async function loadLeaderboard(rounds) {
    try {
        const { data, error } = await db
            .from('leaderboard')
            .select('*')
            .eq('rounds', rounds)
            .order('score', { ascending: false })
            .limit(50);

        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error('Ошибка загрузки:', err);
        return [];
    }
}

// Отрисовать таблицу
async function renderLeaderboard(highlightNickname, rounds) {
    if (rounds !== undefined) currentLbRounds = rounds;

    // Обновляем активную вкладку
    document.querySelectorAll('.lb-tab').forEach(t => {
        t.classList.toggle('active', parseInt(t.dataset.rounds) === currentLbRounds);
    });

    const list = $('leaderboardList');
    list.innerHTML = '<div class="leaderboard__empty">Загрузка...</div>';

    // Сброс подиума
    for (let i = 1; i <= 3; i++) {
        const p = $('podium' + i);
        p.querySelector('.podium__name').textContent = '—';
        p.querySelector('.podium__score').textContent = '—';
        p.style.opacity = '0.3';
    }

    const entries = await loadLeaderboard(currentLbRounds);

    // Подиум (топ-3)
    for (let i = 0; i < Math.min(3, entries.length); i++) {
        const p = $('podium' + (i + 1));
        const pct = Math.round((entries[i].score / entries[i].max_score) * 100);
        p.querySelector('.podium__name').textContent = entries[i].nickname;
        p.querySelector('.podium__score').textContent = entries[i].score.toLocaleString();
        p.style.opacity = '1';
    }

    // Список
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

// Сохраняем результат
const _originalShowFinal = showFinalResults;
showFinalResults = function () {
    _originalShowFinal();
    const nickname = $('nickname').value.trim() || 'Игрок';
    saveScore(nickname, totalScore, totalRounds);
};

// Кнопки
$('btnLeaderboard')?.addEventListener('click', () => {
    renderLeaderboard(null, totalRounds || 5);
    showScreen('screenLeaderboard');
});

$('btnFinalLb')?.addEventListener('click', () => {
    const nick = $('nickname').value.trim() || 'Игрок';
    renderLeaderboard(nick, totalRounds);
    showScreen('screenLeaderboard');
});

$('btnLbBack')?.addEventListener('click', () => showScreen('screenMenu'));

// Вкладки лидерборда
document.querySelectorAll('.lb-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const rounds = parseInt(tab.dataset.rounds);
        const nick = $('nickname').value.trim() || null;
        renderLeaderboard(nick, rounds);
    });
});
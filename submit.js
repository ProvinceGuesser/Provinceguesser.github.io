const $ = (id) => document.getElementById(id);

// ===== ПАНОРАМА =====
let panoX = 0;
let panoZoom = 1;
let panoImageWidth = 0;
let panoDragging = false;
let panoDragStartX = 0;
let panoDragStartPanoX = 0;
let panoReady = false;

function loadPanorama(src) {
  const img = $('panoramaImg');
  const viewport = $('panoramaViewport');
  const placeholder = $('panoramaPlaceholder');

  panoReady = false;
  panoX = 0;
  panoZoom = 1;

  const oldClone = viewport.querySelector('.panorama__img--clone');
  if (oldClone) oldClone.remove();

  placeholder.classList.remove('hidden');

  img.onload = function () {
    setupPanorama();
    placeholder.classList.add('hidden');
  };

  img.onerror = function () {
    placeholder.textContent = 'Не удалось загрузить панораму';
    placeholder.classList.remove('hidden');
  };

  img.src = src;
}

function setupPanorama() {
  const viewport = $('panoramaViewport');
  const img = $('panoramaImg');
  const container = $('panorama');
  if (!img.naturalWidth || !img.naturalHeight) return;

  const containerH = container.clientHeight;
  const scale = (containerH * panoZoom) / img.naturalHeight;
  panoImageWidth = img.naturalWidth * scale;

  img.style.height = (containerH * panoZoom) + 'px';
  img.style.width = panoImageWidth + 'px';

  let clone = viewport.querySelector('.panorama__img--clone');
  if (!clone) {
    clone = document.createElement('img');
    clone.className = 'panorama__img panorama__img--clone';
    clone.draggable = false;
    viewport.appendChild(clone);
  }

  clone.src = img.src;
  clone.style.height = img.style.height;
  clone.style.width = img.style.width;

  panoX = -(Math.random() * panoImageWidth);
  panoReady = true;
  applyPanorama();
}

function applyPanorama() {
  if (!panoReady || !panoImageWidth) return;
  const viewport = $('panoramaViewport');
  while (panoX > 0) panoX -= panoImageWidth;
  while (panoX < -panoImageWidth) panoX += panoImageWidth;
  viewport.style.transform = `translateX(${panoX}px)`;
}

$('panorama').addEventListener('mousedown', (e) => {
  if (!panoReady) return;
  panoDragging = true;
  panoDragStartX = e.clientX;
  panoDragStartPanoX = panoX;
});

document.addEventListener('mousemove', (e) => {
  if (!panoDragging || !panoReady) return;
  panoX = panoDragStartPanoX + (e.clientX - panoDragStartX);
  applyPanorama();
});

document.addEventListener('mouseup', () => {
  panoDragging = false;
});

$('panorama').addEventListener('wheel', (e) => {
  e.preventDefault();
  if (!panoReady) return;

  const container = $('panorama');
  const img = $('panoramaImg');

  const oldWidth = panoImageWidth;
  const delta = e.deltaY > 0 ? -0.15 : 0.15;
  const newZoom = Math.max(1, Math.min(4, panoZoom + delta));
  if (newZoom === panoZoom) return;

  const rect = container.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;

  panoZoom = newZoom;
  const scale = (container.clientHeight * panoZoom) / img.naturalHeight;
  panoImageWidth = img.naturalWidth * scale;

  const newHeight = container.clientHeight * panoZoom;
  img.style.height = newHeight + 'px';
  img.style.width = panoImageWidth + 'px';

  const clone = $('panoramaViewport').querySelector('.panorama__img--clone');
  if (clone) {
    clone.style.height = newHeight + 'px';
    clone.style.width = panoImageWidth + 'px';
  }

  const ratio = panoImageWidth / oldWidth;
  panoX = mouseX - (mouseX - panoX) * ratio;

  applyPanorama();
}, { passive: false });

window.addEventListener('resize', () => {
  if (panoReady) setupPanorama();
});

// ===== КАРТА =====
let markerPlaced = false;
let markerPercX = 0;
let markerPercY = 0;
let mapZoom = 1;
let mapPanX = 0;
let mapPanY = 0;
let mapDragging = false;
let mapDragStartX = 0;
let mapDragStartY = 0;
let mapDragOriginX = 0;
let mapDragOriginY = 0;
let mapMoved = false;

function applyMapTransform() {
  $('mapInner').style.transform = `translate(${mapPanX}px, ${mapPanY}px) scale(${mapZoom})`;
}

function clampMap() {
  const map = $('map');
  const w = map.clientWidth;
  const h = map.clientHeight;
  const scaledW = w * mapZoom;
  const scaledH = h * mapZoom;
  const minX = Math.min(0, w - scaledW);
  const minY = Math.min(0, h - scaledH);
  mapPanX = Math.max(minX, Math.min(0, mapPanX));
  mapPanY = Math.max(minY, Math.min(0, mapPanY));
}

function zoomMap(delta, clientX = null, clientY = null) {
  const map = $('map');
  const rect = map.getBoundingClientRect();
  const oldZoom = mapZoom;
  const newZoom = Math.max(1, Math.min(8, mapZoom + delta));
  if (newZoom === oldZoom) return;

  const mouseX = clientX !== null ? clientX - rect.left : rect.width / 2;
  const mouseY = clientY !== null ? clientY - rect.top : rect.height / 2;

  mapPanX = mouseX - (mouseX - mapPanX) * (newZoom / oldZoom);
  mapPanY = mouseY - (mouseY - mapPanY) * (newZoom / oldZoom);
  mapZoom = newZoom;
  clampMap();
  applyMapTransform();
}

function resetMapView() {
  mapZoom = 1;
  mapPanX = 0;
  mapPanY = 0;
  applyMapTransform();
}

$('map').addEventListener('mousedown', (e) => {
  mapDragging = true;
  mapMoved = false;
  mapDragStartX = e.clientX;
  mapDragStartY = e.clientY;
  mapDragOriginX = mapPanX;
  mapDragOriginY = mapPanY;
});

document.addEventListener('mousemove', (e) => {
  if (!mapDragging) return;
  const dx = e.clientX - mapDragStartX;
  const dy = e.clientY - mapDragStartY;
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) mapMoved = true;
  mapPanX = mapDragOriginX + dx;
  mapPanY = mapDragOriginY + dy;
  clampMap();
  applyMapTransform();
});

document.addEventListener('mouseup', () => {
  mapDragging = false;
});

$('map').addEventListener('wheel', (e) => {
  e.preventDefault();
  zoomMap(e.deltaY > 0 ? -0.2 : 0.2, e.clientX, e.clientY);
}, { passive: false });

$('mapZoomIn').addEventListener('click', () => zoomMap(0.4));
$('mapZoomOut').addEventListener('click', () => zoomMap(-0.4));
$('mapReset').addEventListener('click', resetMapView);

$('map').addEventListener('click', (e) => {
  if (mapMoved) return;
  const rect = $('map').getBoundingClientRect();
  const localX = (e.clientX - rect.left - mapPanX) / mapZoom;
  const localY = (e.clientY - rect.top - mapPanY) / mapZoom;
  const percX = (localX / rect.width) * 100;
  const percY = (localY / rect.height) * 100;
  if (percX < 0 || percX > 100 || percY < 0 || percY > 100) return;

  markerPercX = percX;
  markerPercY = percY;

  const gameX = Math.round((markerPercX / 100) * 6000 - 3000);
  const gameY = Math.round(3000 - (markerPercY / 100) * 6000);

  $('coordX').textContent = gameX;
  $('coordY').textContent = gameY;

  const marker = $('mapMarker');
  marker.style.left = markerPercX + '%';
  marker.style.top = markerPercY + '%';
  marker.classList.remove('hidden');

  markerPlaced = true;
});

// ===== ФАЙЛ =====
let selectedFile = null;

$('panoramaFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  selectedFile = file;
  const url = URL.createObjectURL(file);
  loadPanorama(url);
  $('statusBox').textContent = `Файл выбран: ${file.name}`;
});

// ===== ОТПРАВКА =====
$('btnSubmit').addEventListener('click', async () => {
  const nickname = $('nickname').value.trim();
  const placeName = $('placeName').value.trim();

  if (!placeName) {
    $('statusBox').textContent = 'Введите название места';
    return;
  }

  if (!selectedFile) {
    $('statusBox').textContent = 'Выберите файл панорамы';
    return;
  }

  if (!markerPlaced) {
    $('statusBox').textContent = 'Поставьте метку на карте';
    return;
  }

  const x = Math.round((markerPercX / 100) * 6000 - 3000);
  const y = Math.round(3000 - (markerPercY / 100) * 6000);

  $('statusBox').textContent = 'Загрузка файла...';

  try {
    const ext = selectedFile.name.split('.').pop().toLowerCase();
    const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const filePath = `user-submissions/${fileName}`;

    const { error: uploadError } = await supabaseClient
      .storage
      .from('panoramas')
      .upload(filePath, selectedFile, {
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) throw uploadError;

    const { data: publicData } = supabaseClient
      .storage
      .from('panoramas')
      .getPublicUrl(filePath);

    const panoramaUrl = publicData.publicUrl;

    $('statusBox').textContent = 'Сохранение заявки...';

    const { error: insertError } = await supabaseClient
      .from('submissions')
      .insert({
        nickname: nickname || null,
        place_name: placeName,
        x,
        y,
        panorama_url: panoramaUrl,
        status: 'pending'
      });

    if (insertError) throw insertError;

    $('statusBox').textContent = 'Готово! Заявка отправлена на модерацию ✅';

    $('placeName').value = '';
    $('panoramaFile').value = '';
    selectedFile = null;
  } catch (err) {
    console.error(err);
    $('statusBox').textContent = 'Ошибка: ' + (err.message || 'не удалось отправить');
  }
});

$('btnReset').addEventListener('click', () => {
  markerPlaced = false;
  $('mapMarker').classList.add('hidden');
  $('coordX').textContent = '—';
  $('coordY').textContent = '—';
  $('statusBox').textContent = 'Сброшено';
  $('placeName').value = '';
  $('panoramaFile').value = '';
  selectedFile = null;
});
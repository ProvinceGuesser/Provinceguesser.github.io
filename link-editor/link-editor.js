const $ = (id) => document.getElementById(id);

let points = [];
let links = [];
let selectedLinkId = null;

// panorama state
let panoX = 0;
let panoZoom = 1;
let panoImageWidth = 0;
let panoDragging = false;
let panoDragStartX = 0;
let panoDragStartPanoX = 0;
let panoReady = false;

// draft hotspot
let draftHotspot = null;

async function loadPoints() {
  const { data, error } = await supabaseClient
    .from('points')
    .select('*')
    .order('id', { ascending: true });

  if (error) {
    console.error(error);
    alert('Ошибка загрузки points');
    return;
  }

  points = (data || []).map(item => ({
    id: item.id,
    x: item.x,
    y: item.y,
    name: item.name,
    panorama: item.panorama_url
  }));

  fillPointSelects();
}

function fillPointSelects() {
  const from = $('fromPoint');
  const to = $('toPoint');

  from.innerHTML = '';
  to.innerHTML = '';

  points.forEach(p => {
    const o1 = document.createElement('option');
    o1.value = p.id;
    o1.textContent = `${p.id} — ${p.name}`;
    from.appendChild(o1);

    const o2 = document.createElement('option');
    o2.value = p.id;
    o2.textContent = `${p.id} — ${p.name}`;
    to.appendChild(o2);
  });

  if (points.length) {
    from.value = points[0].id;
    loadCurrentPoint();
  }
}

function getCurrentPoint() {
  const id = Number($('fromPoint').value);
  return points.find(p => p.id === id);
}

function getTargetPoint() {
  const id = Number($('toPoint').value);
  return points.find(p => p.id === id);
}

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
    renderLinks();
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
  renderLinks();
}

$('panorama').addEventListener('mousedown', (e) => {
  if (!panoReady) return;
  if (e.target.closest('.hotspot')) return;

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

async function loadLinks() {
  const current = getCurrentPoint();
  if (!current) return;

  const { data, error } = await supabaseClient
    .from('point_links')
    .select('*')
    .eq('from_point_id', current.id)
    .order('id', { ascending: true });

  if (error) {
    console.error(error);
    alert('Ошибка загрузки связей');
    return;
  }

  links = data || [];
  renderLinksList();
  renderLinks();
}

function renderLinks() {
  const layer = $('hotspotLayer');
  layer.innerHTML = '';

  const container = $('panorama');
  const viewW = container.clientWidth;
  const viewH = container.clientHeight;

  // existing links
  links.forEach(link => {
    const worldX = (link.pano_x / 100) * panoImageWidth;
    let screenX = worldX + panoX;

    // wrap around
    while (screenX < 0) screenX += panoImageWidth;
    while (screenX > panoImageWidth) screenX -= panoImageWidth;

    // show if near viewport (consider duplicate wrap)
    const candidates = [screenX, screenX - panoImageWidth, screenX + panoImageWidth];

    candidates.forEach(cx => {
      if (cx >= -60 && cx <= viewW + 60) {
        const el = document.createElement('div');
        el.className = 'hotspot';
        if (selectedLinkId === link.id) el.style.filter = 'drop-shadow(0 0 8px #1e90ff)';

        el.style.left = `${cx}px`;
        el.style.top = `${(link.pano_y / 100) * viewH}px`;

        const targetPoint = points.find(p => p.id === link.to_point_id);

        el.innerHTML = `
          <div class="hotspot__arrow"></div>
          <div class="hotspot__label">${link.label || (targetPoint ? targetPoint.name : 'Переход')}</div>
        `;

        el.addEventListener('click', (e) => {
          e.stopPropagation();
          selectedLinkId = link.id;
          renderLinks();
          renderLinksList();
          $('panoX').textContent = Number(link.pano_x).toFixed(1);
          $('panoY').textContent = Number(link.pano_y).toFixed(1);
        });

        layer.appendChild(el);
      }
    });
  });

  // draft hotspot
  if (draftHotspot) {
    const worldX = (draftHotspot.pano_x / 100) * panoImageWidth;
    let screenX = worldX + panoX;
    while (screenX < 0) screenX += panoImageWidth;
    while (screenX > panoImageWidth) screenX -= panoImageWidth;

    const candidates = [screenX, screenX - panoImageWidth, screenX + panoImageWidth];
    candidates.forEach(cx => {
      if (cx >= -60 && cx <= viewW + 60) {
        const el = document.createElement('div');
        el.className = 'hotspot hotspot--draft';
        el.style.left = `${cx}px`;
        el.style.top = `${(draftHotspot.pano_y / 100) * viewH}px`;

        el.innerHTML = `
          <div class="hotspot__arrow"></div>
          <div class="hotspot__label">Новая стрелка</div>
        `;
        layer.appendChild(el);
      }
    });
  }
}

function renderLinksList() {
  const list = $('linksList');

  if (!links.length) {
    list.innerHTML = '<div class="link-card">Связей пока нет</div>';
    return;
  }

  list.innerHTML = '';

  links.forEach(link => {
    const targetPoint = points.find(p => p.id === link.to_point_id);
    const card = document.createElement('div');
    card.className = 'link-card' + (selectedLinkId === link.id ? ' active' : '');

    card.innerHTML = `
      <div class="link-card__title">
        → ${targetPoint ? targetPoint.name : ('Точка #' + link.to_point_id)}
      </div>
      <div class="link-card__meta">
        ID связи: ${link.id}<br>
        pano_x: ${Number(link.pano_x).toFixed(1)}<br>
        pano_y: ${Number(link.pano_y).toFixed(1)}<br>
        label: ${link.label || '—'}
      </div>
    `;

    card.addEventListener('click', () => {
      selectedLinkId = link.id;
      renderLinksList();
      renderLinks();
      $('panoX').textContent = Number(link.pano_x).toFixed(1);
      $('panoY').textContent = Number(link.pano_y).toFixed(1);
    });

    list.appendChild(card);
  });
}

$('panorama').addEventListener('click', (e) => {
  if (!panoReady) return;
  if (panoDragging) return;

  const rect = $('panorama').getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const clickY = e.clientY - rect.top;

  let worldX = clickX - panoX;
  while (worldX < 0) worldX += panoImageWidth;
  while (worldX > panoImageWidth) worldX -= panoImageWidth;

  const pano_x = (worldX / panoImageWidth) * 100;
  const pano_y = (clickY / rect.height) * 100;

  draftHotspot = {
    pano_x,
    pano_y
  };

  selectedLinkId = null;
  $('panoX').textContent = pano_x.toFixed(1);
  $('panoY').textContent = pano_y.toFixed(1);

  renderLinks();
  renderLinksList();
});

$('btnClearMarker').addEventListener('click', () => {
  draftHotspot = null;
  selectedLinkId = null;
  $('panoX').textContent = '—';
  $('panoY').textContent = '—';
  renderLinks();
  renderLinksList();
});

$('fromPoint').addEventListener('change', async () => {
  await loadCurrentPoint();
});

async function loadCurrentPoint() {
  const current = getCurrentPoint();
  if (!current) return;

  loadPanorama(current.panorama);
  draftHotspot = null;
  selectedLinkId = null;
  $('panoX').textContent = '—';
  $('panoY').textContent = '—';
  await loadLinks();
}

$('btnSave').addEventListener('click', async () => {
  const from = getCurrentPoint();
  const to = getTargetPoint();
  const label = $('linkLabel').value.trim();

  if (!from || !to) {
    alert('Выбери точки');
    return;
  }

  if (from.id === to.id) {
    alert('Нельзя связывать точку саму с собой');
    return;
  }

  if (!draftHotspot) {
    alert('Сначала кликни по панораме, чтобы поставить стрелку');
    return;
  }

  const payload = {
    from_point_id: from.id,
    to_point_id: to.id,
    pano_x: draftHotspot.pano_x,
    pano_y: draftHotspot.pano_y,
    label: label || null
  };

  const { error } = await supabaseClient
    .from('point_links')
    .insert(payload);

  if (error) {
    console.error(error);
    alert('Ошибка сохранения связи: ' + error.message);
    return;
  }

  draftHotspot = null;
  $('linkLabel').value = '';
  $('panoX').textContent = '—';
  $('panoY').textContent = '—';

  await loadLinks();
});

$('btnDelete').addEventListener('click', async () => {
  if (!selectedLinkId) {
    alert('Сначала выбери связь');
    return;
  }

  const { error } = await supabaseClient
    .from('point_links')
    .delete()
    .eq('id', selectedLinkId);

  if (error) {
    console.error(error);
    alert('Ошибка удаления: ' + error.message);
    return;
  }

  selectedLinkId = null;
  await loadLinks();
});

async function init() {
  await loadPoints();
}

init();
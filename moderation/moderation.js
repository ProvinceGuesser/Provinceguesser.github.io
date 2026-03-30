const loginWrap = document.getElementById('loginWrap');
const adminPage = document.getElementById('adminPage');
const loginUsername = document.getElementById('loginUsername');
const loginPassword = document.getElementById('loginPassword');
const btnLogin = document.getElementById('btnLogin');
const loginStatus = document.getElementById('loginStatus');

const listEl = document.getElementById('list');
const btnReload = document.getElementById('btnReload');
const btnLogout = document.getElementById('btnLogout');
const btnExportApproved = document.getElementById('btnExportApproved');
const exportBoxWrap = document.getElementById('exportBoxWrap');
const exportBox = document.getElementById('exportBox');
const btnCopyExport = document.getElementById('btnCopyExport');

const selectedBox = document.getElementById('selectedBox');
const markersWrap = document.getElementById('modMapMarkers');

const mapPanel = document.getElementById('mapPanel');
const btnToggleMap = document.getElementById('btnToggleMap');

const modMap = document.getElementById('modMap');
const modMapInner = document.getElementById('modMapInner');

const AUTH_KEY = 'moderation_auth_ok';
let currentStatus = 'pending';
let allLoadedSubmissions = [];
let selectedId = null;
let mapCollapsed = false;
let existingPoints = [];

// map state
let mapZoom = 1;
let mapPanX = 0;
let mapPanY = 0;
let mapDragging = false;
let mapDragStartX = 0;
let mapDragStartY = 0;
let mapDragOriginX = 0;
let mapDragOriginY = 0;

function isLoggedIn() {
  return localStorage.getItem(AUTH_KEY) === '1';
}

function setLoggedIn(state) {
  localStorage.setItem(AUTH_KEY, state ? '1' : '0');
}

function showAdmin() {
  if (loginWrap) loginWrap.classList.add('hidden');
  if (adminPage) adminPage.classList.remove('hidden');
  loadSubmissions();
}

function showLogin() {
  if (adminPage) adminPage.classList.add('hidden');
  if (loginWrap) loginWrap.classList.remove('hidden');
}

async function login() {
  const username = loginUsername?.value.trim() || '';
  const password = loginPassword?.value.trim() || '';

  if (!username || !password) {
    if (loginStatus) loginStatus.textContent = 'Введите логин и пароль';
    return;
  }

  if (loginStatus) loginStatus.textContent = 'Проверка...';

  const { data, error } = await supabaseClient
    .from('moderators')
    .select('*')
    .eq('username', username)
    .eq('password', password)
    .limit(1);

  if (error) {
    console.error(error);
    if (loginStatus) loginStatus.textContent = 'Ошибка входа';
    return;
  }

  if (!data || data.length === 0) {
    if (loginStatus) loginStatus.textContent = 'Неверный логин или пароль';
    return;
  }

  setLoggedIn(true);
  if (loginStatus) loginStatus.textContent = '';
  showAdmin();
}

async function loadSubmissions() {
  if (listEl) {
    listEl.innerHTML = '<div class="empty">Загрузка...</div>';
  }

  if (selectedBox) {
    selectedBox.innerHTML = '<div class="selected-empty">Нажми на маркер на карте или на карточку слева</div>';
  }

  if (markersWrap) {
    markersWrap.innerHTML = '';
  }

  const { data, error } = await supabaseClient
    .from('submissions')
    .select('*')
    .eq('status', currentStatus)
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    if (listEl) {
      listEl.innerHTML = '<div class="empty">Ошибка загрузки</div>';
    }
    allLoadedSubmissions = [];
    renderMapMarkers();
    return;
  }

  allLoadedSubmissions = data || [];
  updateTabs();
  await loadExistingPoints();

  if (!allLoadedSubmissions.length) {
    if (listEl) {
      listEl.innerHTML = `<div class="empty">Нет заявок со статусом "${currentStatus}"</div>`;
    }
    renderMapMarkers();
    return;
  }

  renderList();
  renderMapMarkers();
}

function renderList() {
  if (!listEl) return;
  listEl.innerHTML = '';

  allLoadedSubmissions.forEach((item) => {
    const pointObject = buildPointObject(item);

    const div = document.createElement('div');
    div.className = 'card';
    div.dataset.id = item.id;
    if (selectedId === item.id) div.classList.add('active');

    div.innerHTML = `
      <img src="${item.panorama_url}" alt="preview" />
      <div class="card__info">
        <div class="card__title">${item.place_name}</div>
        <div class="meta">
          <div><b>Ник:</b> ${item.nickname || '—'}</div>
          <div><b>Координаты:</b> X ${item.x}, Y ${item.y}</div>
          <div><b>Статус:</b> ${item.status}</div>
          <div><b>Дата:</b> ${new Date(item.created_at).toLocaleString('ru-RU')}</div>
        </div>
        <div class="code-box">${escapeHtml(pointObject)}</div>
        <div class="actions">${getActionsForStatus(item)}</div>
      </div>
    `;

    div.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      selectSubmission(item.id);
    });

    listEl.appendChild(div);
  });

  bindActions();
}

function renderMapMarkers() {
  if (!markersWrap) return;
  markersWrap.innerHTML = '';

  // ===== Уже добавленные точки =====
  if (Array.isArray(existingPoints)) {
    existingPoints.forEach((item) => {
      const marker = document.createElement('div');
      marker.className = 'mod-marker mod-marker--existing';
      marker.title = `[Уже добавлено] ${item.name}`;
      marker.dataset.type = 'existing';
      marker.dataset.pointId = item.id;

      const px = ((item.x + 3000) / 6000) * 100;
      const py = ((3000 - item.y) / 6000) * 100;

      marker.style.left = px + '%';
      marker.style.top = py + '%';

      marker.addEventListener('click', (e) => {
        e.stopPropagation();

        document.querySelectorAll('.mod-marker').forEach(m => m.classList.remove('active'));
        document.querySelectorAll('.card').forEach(card => card.classList.remove('active'));

        marker.classList.add('active');
        selectedId = null;

        if (selectedBox) {
          selectedBox.innerHTML = `
            <div class="selected-card">
              <img src="${item.panorama}" alt="preview" />
              <div class="selected-card__info">
                <div class="selected-card__title">${item.name}</div>
                <div class="meta">
                  <div><b>Тип:</b> Уже добавленная точка</div>
                  <div><b>ID:</b> ${item.id}</div>
                  <div><b>Координаты:</b> X ${item.x}, Y ${item.y}</div>
                </div>
                <div class="code-box">${escapeHtml(`{
    id: ${item.id},
    x: ${item.x},
    y: ${item.y},
    name: "${item.name.replace(/"/g, '\\"')}",
    panorama: "${item.panorama}"
}`)}</div>
              </div>
            </div>
          `;
        }
      });

      markersWrap.appendChild(marker);
    });
  }

  // ===== Заявки текущего статуса =====
  allLoadedSubmissions.forEach((item) => {
    const marker = document.createElement('div');
    marker.className = `mod-marker mod-marker--${item.status}`;
    marker.dataset.id = item.id;

    if (selectedId === item.id) marker.classList.add('active');

    const px = ((item.x + 3000) / 6000) * 100;
    const py = ((3000 - item.y) / 6000) * 100;

    marker.style.left = px + '%';
    marker.style.top = py + '%';
    marker.title = item.place_name;

    marker.addEventListener('click', (e) => {
      e.stopPropagation();
      selectSubmission(item.id);
    });

    markersWrap.appendChild(marker);
  });
}

function selectSubmission(id) {
  selectedId = id;
  const item = allLoadedSubmissions.find(x => x.id === id);
  if (!item) return;

  document.querySelectorAll('.card').forEach(card => {
    card.classList.toggle('active', Number(card.dataset.id) === id);
  });

  document.querySelectorAll('.mod-marker').forEach(marker => {
    marker.classList.toggle('active', Number(marker.dataset.id) === id);
  });

  if (selectedBox) {
    selectedBox.innerHTML = `
      <div class="selected-card">
        <img src="${item.panorama_url}" alt="preview" />
        <div class="selected-card__info">
          <div class="selected-card__title">${item.place_name}</div>
          <div class="meta">
            <div><b>Ник:</b> ${item.nickname || '—'}</div>
            <div><b>Координаты:</b> X ${item.x}, Y ${item.y}</div>
            <div><b>Статус:</b> ${item.status}</div>
            <div><b>Дата:</b> ${new Date(item.created_at).toLocaleString('ru-RU')}</div>
          </div>
          <div class="code-box">${escapeHtml(buildPointObject(item))}</div>
          <div class="actions">
            ${getActionsForStatus(item)}
          </div>
        </div>
      </div>
    `;
  }

  bindActions();
}

function getActionsForStatus(item) {
  const copyBtn = `<button class="pending" data-copy='${escapeAttr(buildPointObject(item))}'>Копировать объект</button>`;

  if (item.status === 'pending') {
    return `
      <button class="approve" data-id="${item.id}" data-setstatus="approved">Одобрить</button>
      <button class="reject" data-id="${item.id}" data-setstatus="rejected">Отклонить</button>
      ${copyBtn}
    `;
  }

  if (item.status === 'approved') {
    return `
      <button class="reject" data-id="${item.id}" data-setstatus="rejected">В rejected</button>
      <button class="pending" data-id="${item.id}" data-setstatus="pending">Вернуть в pending</button>
      ${copyBtn}
    `;
  }

  if (item.status === 'rejected') {
    return `
      <button class="approve" data-id="${item.id}" data-setstatus="approved">Одобрить</button>
      <button class="pending" data-id="${item.id}" data-setstatus="pending">Вернуть в pending</button>
      ${copyBtn}
    `;
  }

  return copyBtn;
}

function buildPointObject(item) {
  return `{
    id: ${item.id},
    x: ${item.x},
    y: ${item.y},
    name: "${item.place_name.replace(/"/g, '\\"')}",
    panorama: "${item.panorama_url}"
}`;
}

function bindActions() {
  document.querySelectorAll('[data-setstatus]').forEach(btn => {
    btn.onclick = async () => {
      const id = Number(btn.dataset.id);
      const status = btn.dataset.setstatus;
      await updateStatus(id, status);
    };
  });

  document.querySelectorAll('[data-copy]').forEach(btn => {
    btn.onclick = async () => {
      const text = btn.dataset.copy;
      await navigator.clipboard.writeText(text);
      const old = btn.textContent;
      btn.textContent = 'Скопировано';
      setTimeout(() => btn.textContent = old, 1200);
    };
  });
}

async function updateStatus(id, status) {
  const item = allLoadedSubmissions.find(x => x.id === id);

  if (!item) {
    alert('Заявка не найдена');
    return;
  }

  // 1. Сначала меняем статус в submissions
  const { error: submissionError } = await supabaseClient
    .from('submissions')
    .update({ status })
    .eq('id', id);

  if (submissionError) {
    console.error('Ошибка обновления submissions:', submissionError);
    alert('Ошибка обновления статуса: ' + submissionError.message);
    return;
  }

  // 2. Если approved — добавляем в points
  if (status === 'approved') {
    // Проверяем, нет ли уже точки с этим submission_id
    const { data: existingPoint, error: checkError } = await supabaseClient
      .from('points')
      .select('*')
      .eq('submission_id', item.id)
      .limit(1);

    if (checkError) {
      console.error('Ошибка проверки points:', checkError);
      alert('Статус обновлён, но не удалось проверить points: ' + checkError.message);
      await loadSubmissions();
      return;
    }

    // Если точки ещё нет — вставляем
    if (!existingPoint || existingPoint.length === 0) {
      // Получаем текущий максимальный id
      const { data: maxRows, error: maxError } = await supabaseClient
        .from('points')
        .select('id')
        .order('id', { ascending: false })
        .limit(1);

      if (maxError) {
        console.error('Ошибка получения max id:', maxError);
        alert('Статус approved поставлен, но не удалось получить max id: ' + maxError.message);
        await loadSubmissions();
        return;
      }

      const maxId = (maxRows && maxRows.length > 0) ? maxRows[0].id : 0;
      const newId = maxId + 1;

      const pointData = {
        id: newId,
        submission_id: item.id,
        x: item.x,
        y: item.y,
        name: item.place_name,
        panorama_url: item.panorama_url
      };

      const { error: pointInsertError } = await supabaseClient
        .from('points')
        .insert(pointData);

      if (pointInsertError) {
        console.error('Ошибка вставки в points:', pointInsertError);
        alert('Статус approved поставлен, но точка не добавилась в points: ' + pointInsertError.message);
        await loadSubmissions();
        return;
      }
    }
  }

  // 3. Если переводим из approved обратно в pending/rejected — удаляем из points
  if (status === 'pending' || status === 'rejected') {
    const { error: deletePointError } = await supabaseClient
      .from('points')
      .delete()
      .eq('submission_id', item.id);

    if (deletePointError) {
      console.error('Ошибка удаления из points:', deletePointError);
    }
  }

  if (selectedId === id && status !== currentStatus) {
    selectedId = null;
  }

  await loadSubmissions();
}

async function exportApproved() {
  const { data, error } = await supabaseClient
    .from('submissions')
    .select('*')
    .eq('status', 'approved')
    .order('id', { ascending: true });

  if (error) {
    console.error(error);
    alert('Ошибка экспорта');
    return;
  }

  const approved = data || [];

  if (!exportBoxWrap || !exportBox) return;

  if (!approved.length) {
    exportBoxWrap.classList.remove('hidden');
    exportBox.value = 'const allPoints = [];\n';
    return;
  }

  let out = 'const allPoints = [\n';

  approved.forEach((item, i) => {
    out += `    {\n`;
    out += `        id: ${item.id},\n`;
    out += `        x: ${item.x},\n`;
    out += `        y: ${item.y},\n`;
    out += `        name: "${item.place_name.replace(/"/g, '\\"')}",\n`;
    out += `        panorama: "${item.panorama_url}"\n`;
    out += `    }`;
    if (i < approved.length - 1) out += ',';
    out += '\n';
  });

  out += '];\n';

  exportBoxWrap.classList.remove('hidden');
  exportBox.value = out;
}

function updateTabs() {
  document.querySelectorAll('.mod-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.status === currentStatus);
  });
}

function escapeHtml(str) {
  return str
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeAttr(str) {
  return str
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

// ===== MAP =====
function applyMapTransform() {
  if (!modMapInner) return;
  modMapInner.style.transform = `translate(${mapPanX}px, ${mapPanY}px) scale(${mapZoom})`;
}

function clampMap() {
  if (!modMap) return;

  const w = modMap.clientWidth;
  const h = modMap.clientHeight;
  const scaledW = w * mapZoom;
  const scaledH = h * mapZoom;

  const minX = Math.min(0, w - scaledW);
  const minY = Math.min(0, h - scaledH);

  mapPanX = Math.max(minX, Math.min(0, mapPanX));
  mapPanY = Math.max(minY, Math.min(0, mapPanY));
}

function zoomMap(delta, clientX = null, clientY = null) {
  if (!modMap) return;

  const rect = modMap.getBoundingClientRect();
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

if (modMap) {
  modMap.addEventListener('mousedown', (e) => {
    mapDragging = true;
    mapDragStartX = e.clientX;
    mapDragStartY = e.clientY;
    mapDragOriginX = mapPanX;
    mapDragOriginY = mapPanY;
  });

  document.addEventListener('mousemove', (e) => {
    if (!mapDragging) return;

    const dx = e.clientX - mapDragStartX;
    const dy = e.clientY - mapDragStartY;

    mapPanX = mapDragOriginX + dx;
    mapPanY = mapDragOriginY + dy;

    clampMap();
    applyMapTransform();
  });

  document.addEventListener('mouseup', () => {
    mapDragging = false;
  });

  modMap.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomMap(e.deltaY > 0 ? -0.2 : 0.2, e.clientX, e.clientY);
  }, { passive: false });
}

const modMapZoomIn = document.getElementById('modMapZoomIn');
const modMapZoomOut = document.getElementById('modMapZoomOut');
const modMapReset = document.getElementById('modMapReset');

if (modMapZoomIn) modMapZoomIn.addEventListener('click', () => zoomMap(0.4));
if (modMapZoomOut) modMapZoomOut.addEventListener('click', () => zoomMap(-0.4));
if (modMapReset) modMapReset.addEventListener('click', resetMapView);

// ===== COLLAPSE MAP =====
if (btnToggleMap && mapPanel) {
  btnToggleMap.addEventListener('click', () => {
    mapCollapsed = !mapCollapsed;
    mapPanel.classList.toggle('collapsed', mapCollapsed);
    btnToggleMap.textContent = mapCollapsed ? 'Развернуть карту' : 'Свернуть карту';
  });
}

// ===== EVENTS =====
if (btnLogin) btnLogin.addEventListener('click', login);

if (loginPassword) {
  loginPassword.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') login();
  });
}

if (btnReload) btnReload.addEventListener('click', loadSubmissions);

if (btnLogout) {
  btnLogout.addEventListener('click', () => {
    setLoggedIn(false);
    showLogin();
  });
}

if (btnExportApproved) btnExportApproved.addEventListener('click', exportApproved);

if (btnCopyExport) {
  btnCopyExport.addEventListener('click', async () => {
    if (!exportBox) return;
    await navigator.clipboard.writeText(exportBox.value);
    btnCopyExport.textContent = 'Скопировано';
    setTimeout(() => btnCopyExport.textContent = 'Копировать points.js', 1200);
  });
}

document.addEventListener('click', (e) => {
  const tab = e.target.closest('.mod-tab');
  if (!tab) return;
  currentStatus = tab.dataset.status;
  selectedId = null;
  loadSubmissions();
});

// ===== INIT =====
if (isLoggedIn()) {
  showAdmin();
} else {
  showLogin();
}

async function loadExistingPoints() {
  const { data, error } = await supabaseClient
    .from('points')
    .select('*')
    .order('id', { ascending: true });

  if (error) {
    console.error('Ошибка загрузки existing points:', error);
    existingPoints = [];
    return;
  }

  existingPoints = (data || []).map(item => ({
    id: item.id,
    x: item.x,
    y: item.y,
    name: item.name,
    panorama: item.panorama_url,
    submission_id: item.submission_id
  }));
}
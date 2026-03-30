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

const AUTH_KEY = 'moderation_auth_ok';
let currentStatus = 'pending';

function isLoggedIn() {
  return localStorage.getItem(AUTH_KEY) === '1';
}

function setLoggedIn(state) {
  localStorage.setItem(AUTH_KEY, state ? '1' : '0');
}

function showAdmin() {
  loginWrap.classList.add('hidden');
  adminPage.classList.remove('hidden');
  loadSubmissions();
}

function showLogin() {
  adminPage.classList.add('hidden');
  loginWrap.classList.remove('hidden');
}

async function login() {
  const username = loginUsername.value.trim();
  const password = loginPassword.value.trim();

  if (!username || !password) {
    loginStatus.textContent = 'Введите логин и пароль';
    return;
  }

  loginStatus.textContent = 'Проверка...';

  const { data, error } = await supabaseClient
    .from('moderators')
    .select('*')
    .eq('username', username)
    .eq('password', password)
    .limit(1);

  if (error) {
    console.error(error);
    loginStatus.textContent = 'Ошибка входа';
    return;
  }

  if (!data || data.length === 0) {
    loginStatus.textContent = 'Неверный логин или пароль';
    return;
  }

  setLoggedIn(true);
  loginStatus.textContent = '';
  showAdmin();
}

async function loadSubmissions() {
  listEl.innerHTML = '<div class="empty">Загрузка...</div>';

  const { data, error } = await supabaseClient
    .from('submissions')
    .select('*')
    .eq('status', currentStatus)
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    listEl.innerHTML = '<div class="empty">Ошибка загрузки</div>';
    return;
  }

  updateTabs();

  if (!data || data.length === 0) {
    listEl.innerHTML = `<div class="empty">Нет заявок со статусом "${currentStatus}"</div>`;
    return;
  }

  listEl.innerHTML = '';

  data.forEach((item) => {
    const pointObject = `{
    id: ${item.id},
    x: ${item.x},
    y: ${item.y},
    name: "${item.place_name.replace(/"/g, '\\"')}",
    panorama: "${item.panorama_url}"
}`;

    const actions = getActionsForStatus(item);

    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = `
      <img src="${item.panorama_url}" alt="preview" />
      <div class="card__info">
        <h2>${item.place_name}</h2>
        <div class="meta">
          <div><b>Ник:</b> ${item.nickname || '—'}</div>
          <div><b>Координаты:</b> X ${item.x}, Y ${item.y}</div>
          <div><b>Статус:</b> ${item.status}</div>
          <div><b>Дата:</b> ${new Date(item.created_at).toLocaleString('ru-RU')}</div>
        </div>
        <div class="code-box">${escapeHtml(pointObject)}</div>
        <div class="actions">${actions}</div>
      </div>
    `;
    listEl.appendChild(div);
  });

  bindActions();
}

function getActionsForStatus(item) {
  const copyBtn = `<button class="pending" data-copy='${escapeAttr(`{
    id: ${item.id},
    x: ${item.x},
    y: ${item.y},
    name: "${item.place_name.replace(/"/g, '\\"')}",
    panorama: "${item.panorama_url}"
}`)}'>Копировать объект</button>`;

  if (item.status === 'pending') {
    return `
      <button class="approve" data-id="${item.id}" data-setstatus="approved">Одобрить</button>
      <button class="reject" data-id="${item.id}" data-setstatus="rejected">Отклонить</button>
      ${copyBtn}
    `;
  }

  if (item.status === 'approved') {
    return `
      <button class="reject" data-id="${item.id}" data-setstatus="rejected">Переместить в rejected</button>
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

function bindActions() {
  document.querySelectorAll('[data-setstatus]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const status = btn.dataset.setstatus;
      await updateStatus(id, status);
    });
  });

  document.querySelectorAll('[data-copy]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const text = btn.dataset.copy;
      await navigator.clipboard.writeText(text);
      const old = btn.textContent;
      btn.textContent = 'Скопировано';
      setTimeout(() => btn.textContent = old, 1200);
    });
  });
}

async function updateStatus(id, status) {
  const { error } = await supabaseClient
    .from('submissions')
    .update({ status })
    .eq('id', id);

  if (error) {
    console.error(error);
    alert('Ошибка обновления статуса');
    return;
  }

  loadSubmissions();
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

  if (approved.length === 0) {
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
    out += `\n`;
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

// events
btnLogin.addEventListener('click', login);
loginPassword.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') login();
});

btnReload.addEventListener('click', loadSubmissions);

btnLogout.addEventListener('click', () => {
  setLoggedIn(false);
  showLogin();
});

btnExportApproved.addEventListener('click', exportApproved);

btnCopyExport.addEventListener('click', async () => {
  await navigator.clipboard.writeText(exportBox.value);
  btnCopyExport.textContent = 'Скопировано';
  setTimeout(() => btnCopyExport.textContent = 'Копировать points.js', 1200);
});

document.addEventListener('click', (e) => {
  const tab = e.target.closest('.mod-tab');
  if (!tab) return;
  currentStatus = tab.dataset.status;
  loadSubmissions();
});

// init
if (isLoggedIn()) {
  showAdmin();
} else {
  showLogin();
}
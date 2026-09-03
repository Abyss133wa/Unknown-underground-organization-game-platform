// 游戏邀约平台 · 前端交互逻辑
let games = [];           // 当前招募列表缓存
let currentStatus = 'active'; // 当前筛选：默认进行中（过期局归档到「已结束」）
let currentGame = null;    // 详情中正在查看的招募
let joinMode = 'join';     // 'join' | 'leave'
let editingId = null;      // 编辑中的招募 id
let lastCreatedId = null;  // 刚创建的招募，用于复制分享链接
let adminToken = localStorage.getItem('admin_token') || null; // 管理员令牌
let isAdmin = !!adminToken;

const STATUS_TEXT = { open: '招募中', full: '已满员', ended: '已结束' };
const NICK_KEY = 'saved_nickname';

const $ = (id) => document.getElementById(id);

// ===== 工具 =====
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => (t.hidden = true), 2400);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function pad(n) { return String(n).padStart(2, '0'); }

function getNick() { return localStorage.getItem(NICK_KEY) || ''; }
function saveNick(n) { if (n) localStorage.setItem(NICK_KEY, n); }
function fillNick(input) { if (input && !input.value) input.value = getNick(); }

function gameShareUrl(id) {
  return `${location.origin}${location.pathname.replace(/\/$/, '') || '/'}#game-${id}`;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    return false;
  }
}

function parseGameHash() {
  const m = location.hash.match(/^#game-(\d+)$/);
  return m ? Number(m[1]) : null;
}

function setGameHash(id) {
  const next = `#game-${id}`;
  if (location.hash !== next) history.replaceState(null, '', next);
}

function clearGameHash() {
  if (location.hash.startsWith('#game-')) {
    history.replaceState(null, '', location.pathname + location.search);
  }
}

function closeDetail() {
  closeModal('detail-modal');
  clearGameHash();
}

// ISO 字符串 → "MM-DD HH:mm"
function formatTime(iso) {
  const d = new Date(iso);
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ISO 字符串 → datetime-local 值 "YYYY-MM-DDTHH:mm"
function toLocalInput(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// datetime-local 值补秒，确保后端可解析
function normTime(v) { return v.length === 16 ? v + ':00' : v; }

// ===== API 封装 =====
async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (adminToken) headers['X-Admin-Token'] = adminToken;
  const res = await fetch(path, {
    headers,
    ...options,
  });
  if (!res.ok) {
    let detail = '请求失败';
    try { const j = await res.json(); detail = j.detail || detail; } catch (e) { /* ignore */ }
    throw new Error(detail);
  }
  return res.json();
}

// ===== 列表加载与渲染 =====
async function loadGames() {
  try {
    games = await api('/api/games');
    render();
  } catch (e) { toast(e.message); }
}

function matchesFilter(g) {
  const now = Date.now();
  switch (currentStatus) {
    case 'all':
      return true;
    case 'active':
      return g.status === 'open' || g.status === 'full';
    case 'upcoming':
      return g.status !== 'ended' && new Date(g.start_time).getTime() > now;
    default:
      return g.status === currentStatus;
  }
}

function render() {
  const list = $('game-list');
  const empty = $('empty');
  const filtered = games.filter(matchesFilter);
  list.innerHTML = '';
  empty.hidden = filtered.length > 0;
  filtered.forEach((g) => list.appendChild(card(g)));
}

function card(g) {
  const el = document.createElement('div');
  el.className = 'game-card';
  const pct = g.max_players ? Math.min(100, Math.round((g.signup_count / g.max_players) * 100)) : 0;
  el.innerHTML = `
    <div class="head">
      <h3>${escapeHtml(g.title)}</h3>
      <span class="badge ${g.status}">${STATUS_TEXT[g.status] || g.status}</span>
    </div>
    ${g.game_type ? `<div class="type">${escapeHtml(g.game_type)}</div>` : ''}
    <div class="meta">🕐 ${formatTime(g.start_time)} — ${formatTime(g.end_time)}</div>
    ${g.channel ? `<div class="meta">📍 ${escapeHtml(g.channel)}</div>` : ''}
    <div class="progress"><i style="width:${pct}%"></i></div>
    <div class="count">${g.signup_count} / ${g.max_players} 人 · 发起人 ${escapeHtml(g.creator_nickname)}</div>
  `;
  el.addEventListener('click', () => openDetail(g));
  return el;
}

// ===== 模态开关 =====
// 每次打开递增 z-index，保证后打开的弹窗浮在上层（如从详情弹出的报名表单）
let modalZ = 50;
function openModal(id) { $(id).style.zIndex = ++modalZ; $(id).hidden = false; }
function closeModal(id) { $(id).hidden = true; }

document.querySelectorAll('[data-close]').forEach((b) => {
  b.addEventListener('click', () => {
    const modal = b.closest('.modal');
    if (!modal) return;
    if (modal.id === 'detail-modal') closeDetail();
    else modal.hidden = true;
  });
});

// ===== 发起 / 编辑 =====
$('btn-create').addEventListener('click', () => openCreate(null));

function openCreate(game) {
  editingId = game ? game.id : null;
  $('create-title').textContent = game ? '编辑招募' : '发起招募';
  $('edit-token-wrap').hidden = !game || isAdmin;
  const f = $('create-form');
  f.reset();
  if (game) {
    f.title.value = game.title;
    f.game_type.value = game.game_type || '';
    f.start_time.value = toLocalInput(game.start_time);
    f.end_time.value = toLocalInput(game.end_time);
    f.max_players.value = game.max_players;
    f.channel.value = game.channel || '';
    f.creator_nickname.value = game.creator_nickname;
    f.description.value = game.description || '';
    f.admin_token.value = '';
  } else {
    fillNick(f.creator_nickname);
  }
  openModal('create-modal');
}

$('create-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const body = {
    title: f.title.value.trim(),
    game_type: f.game_type.value.trim() || null,
    start_time: normTime(f.start_time.value),
    end_time: normTime(f.end_time.value),
    max_players: parseInt(f.max_players.value, 10),
    channel: f.channel.value.trim() || null,
    creator_nickname: f.creator_nickname.value.trim(),
    description: f.description.value.trim() || null,
  };
  saveNick(body.creator_nickname);
  try {
    if (editingId) {
      if (!isAdmin) body.admin_token = f.admin_token.value.trim();
      await api(`/api/games/${editingId}`, { method: 'PATCH', body: JSON.stringify(body) });
      toast('已保存修改');
    } else {
      const created = await api('/api/games', { method: 'POST', body: JSON.stringify(body) });
      showToken(created.admin_token, created.id);
    }
    closeModal('create-modal');
    await loadGames();
  } catch (err) { toast(err.message); }
});

function showToken(token, gameId) {
  lastCreatedId = gameId;
  $('token-text').textContent = token;
  openModal('token-modal');
}

$('token-copy').addEventListener('click', async () => {
  if (await copyText($('token-text').textContent)) toast('已复制到剪贴板');
  else toast('复制失败，请手动长按选择复制');
});

$('token-share').addEventListener('click', async () => {
  if (!lastCreatedId) return;
  if (await copyText(gameShareUrl(lastCreatedId))) toast('招募链接已复制，发给群友即可');
  else toast('复制失败，请手动复制地址栏链接');
});

// ===== 详情 =====
function openDetail(g) {
  currentGame = g;
  $('detail-title').textContent = g.title;
  $('detail-status').className = 'badge ' + g.status;
  $('detail-status').textContent = STATUS_TEXT[g.status] || g.status;
  $('detail-body').innerHTML = detailRows(g);
  $('detail-count').textContent = g.signup_count;
  $('detail-max').textContent = g.max_players;
  renderSignups(g);
  $('admin-token').value = '';
  $('admin-token').hidden = isAdmin;  // 管理员免口令，隐藏口令输入框
  $('detail-join').hidden = g.status !== 'open';
  $('detail-end').hidden = g.status === 'ended';
  setGameHash(g.id);
  openModal('detail-modal');
}

function detailRows(g) {
  const rows = [];
  if (g.game_type) rows.push(`<div class="row">类型：${escapeHtml(g.game_type)}</div>`);
  rows.push(`<div class="row">时间：${formatTime(g.start_time)} — ${formatTime(g.end_time)}</div>`);
  rows.push(`<div class="row">人数：${g.signup_count} / ${g.max_players} 人</div>`);
  if (g.channel) rows.push(`<div class="row">渠道：${escapeHtml(g.channel)}</div>`);
  rows.push(`<div class="row">发起人：${escapeHtml(g.creator_nickname)}</div>`);
  if (g.description) rows.push(`<div class="row">备注：${escapeHtml(g.description)}</div>`);
  return rows.join('');
}

function renderSignups(g) {
  const ul = $('detail-signups');
  ul.innerHTML = '';
  if (!g.signups.length) {
    ul.innerHTML = '<li class="r">还没有人报名，快来抢位置～</li>';
    return;
  }
  g.signups.forEach((s) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${escapeHtml(s.nickname)}</span><span class="r">${s.remark ? escapeHtml(s.remark) : ''}</span>`;
    ul.appendChild(li);
  });
}

// ===== 报名 / 取消报名 =====
$('detail-join').addEventListener('click', () => openJoin(currentGame, 'join'));
$('detail-leave').addEventListener('click', () => openJoin(currentGame, 'leave'));

function openJoin(g, mode) {
  joinMode = mode;
  $('join-title').textContent = mode === 'join' ? '报名参与' : '取消报名';
  $('join-game-title').textContent = g.title;
  $('join-remark-label').hidden = mode === 'leave';
  const f = $('join-form');
  f.reset();
  f.remark.hidden = mode === 'leave';
  fillNick(f.nickname);
  openModal('join-modal');
}

$('join-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const nickname = f.nickname.value.trim();
  if (!nickname) return;
  saveNick(nickname);
  try {
    if (joinMode === 'join') {
      const conflicts = await checkConflict(nickname, currentGame);
      if (conflicts.length) {
        const names = conflicts.map((c) => c.title).join('、');
        if (!confirm(`你已报名了时间重叠的游戏：${names}\n确定仍要报名吗？`)) return;
      }
      await api(`/api/games/${currentGame.id}/join`, {
        method: 'POST',
        body: JSON.stringify({ nickname, remark: f.remark.value.trim() || null }),
      });
      toast('报名成功');
    } else {
      await api(`/api/games/${currentGame.id}/join?nickname=${encodeURIComponent(nickname)}`, {
        method: 'DELETE',
      });
      toast('已取消报名');
    }
    closeModal('join-modal');
    await loadGames();
    const fresh = await api(`/api/games/${currentGame.id}`);
    openDetail(fresh);
  } catch (err) { toast(err.message); }
});

// ===== 管理（编辑 / 删除） =====
$('detail-edit').addEventListener('click', () => {
  if (isAdmin) { openCreate(currentGame); return; }
  const token = $('admin-token').value.trim();
  if (!token) { toast('请先输入管理口令'); return; }
  openCreate(currentGame);
  $('edit-admin-token').value = token;
});

$('detail-delete').addEventListener('click', async () => {
  const token = $('admin-token').value.trim();
  if (!isAdmin && !token) { toast('请输入管理口令'); return; }
  if (!confirm('确定删除该招募？此操作不可恢复。')) return;
  try {
    let url = `/api/games/${currentGame.id}`;
    if (!isAdmin) url += `?admin_token=${encodeURIComponent(token)}`;
    await api(url, { method: 'DELETE' });
    toast('已删除');
    closeDetail();
    await loadGames();
  } catch (err) { toast(err.message); }
});

$('detail-end').addEventListener('click', async () => {
  const token = $('admin-token').value.trim();
  if (!isAdmin && !token) { toast('请输入管理口令'); return; }
  if (!confirm('结束后不能再报名，确定结束该招募？')) return;
  try {
    let url = `/api/games/${currentGame.id}/end`;
    if (!isAdmin) url += `?admin_token=${encodeURIComponent(token)}`;
    const fresh = await api(url, { method: 'POST' });
    toast('已结束招募');
    await loadGames();
    openDetail(fresh);
  } catch (err) { toast(err.message); }
});

$('detail-share').addEventListener('click', async () => {
  if (!currentGame) return;
  if (await copyText(gameShareUrl(currentGame.id))) toast('招募链接已复制');
  else toast('复制失败，请手动复制地址栏');
});

// ===== 我的报名 =====
$('btn-my').addEventListener('click', () => {
  $('my-form').reset();
  $('my-result').hidden = true;
  fillNick($('my-form').nickname);
  openModal('my-modal');
});

$('my-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nickname = e.target.nickname.value.trim();
  if (!nickname) return;
  saveNick(nickname);
  try {
    const mine = await api(`/api/games/me?nickname=${encodeURIComponent(nickname)}`);
    renderMyGames(mine);
  } catch (err) { toast(err.message); }
});

function renderMyGames(list) {
  const box = $('my-result');
  box.innerHTML = '';
  box.hidden = false;
  if (!list.length) {
    box.innerHTML = '<div class="none">该昵称还没有报名任何游戏</div>';
    return;
  }
  list.forEach((g) => {
    const item = document.createElement('div');
    item.className = 'my-item';
    item.innerHTML = `
      <div>
        <div class="t">${escapeHtml(g.title)}</div>
        <div class="m">${formatTime(g.start_time)} — ${formatTime(g.end_time)}</div>
      </div>
      <span class="badge ${g.status}">${STATUS_TEXT[g.status] || g.status}</span>
    `;
    item.addEventListener('click', () => {
      closeModal('my-modal');
      openDetail(g);
    });
    box.appendChild(item);
  });
}

// 报名前检查时间冲突：返回该昵称已报名的、与当前招募时间重叠的其它招募
async function checkConflict(nickname, game) {
  try {
    const mine = await api(`/api/games/me?nickname=${encodeURIComponent(nickname)}`);
    const s = new Date(game.start_time);
    const e = new Date(game.end_time);
    return mine.filter((g) =>
      g.id !== game.id &&
      g.status !== 'ended' &&
      new Date(g.end_time) > s &&
      new Date(g.start_time) < e
    );
  } catch (err) { return []; }
}

// ===== 我的招募 =====
$('btn-created').addEventListener('click', () => {
  $('created-form').reset();
  $('created-result').hidden = true;
  fillNick($('created-form').nickname);
  openModal('created-modal');
});

$('created-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nickname = e.target.nickname.value.trim();
  if (!nickname) return;
  saveNick(nickname);
  try {
    const mine = await api(`/api/games/mine?nickname=${encodeURIComponent(nickname)}`);
    renderCreatedGames(mine);
  } catch (err) { toast(err.message); }
});

function renderCreatedGames(list) {
  const box = $('created-result');
  box.innerHTML = '';
  box.hidden = false;
  if (!list.length) {
    box.innerHTML = '<div class="none">该昵称还没有发布过招募</div>';
    return;
  }
  list.forEach((g) => {
    const item = document.createElement('div');
    item.className = 'my-item';
    item.innerHTML = `
      <div>
        <div class="t">${escapeHtml(g.title)}</div>
        <div class="m">${formatTime(g.start_time)} — ${formatTime(g.end_time)} · ${g.signup_count}/${g.max_players} 人</div>
      </div>
      <span class="badge ${g.status}">${STATUS_TEXT[g.status] || g.status}</span>
    `;
    item.addEventListener('click', () => {
      closeModal('created-modal');
      openDetail(g);
    });
    box.appendChild(item);
  });
}

// ===== 筛选 =====
$('filters').addEventListener('click', (e) => {
  const btn = e.target.closest('.filter');
  if (!btn) return;
  document.querySelectorAll('.filter').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  currentStatus = btn.dataset.status;
  render();
});

// ===== 管理员 =====
function updateAdminUI() {
  $('admin-badge').hidden = !isAdmin;
  $('btn-admin').textContent = isAdmin ? '退出管理员' : '管理员登录';
}

$('btn-admin').addEventListener('click', () => {
  if (isAdmin) {
    adminToken = null;
    isAdmin = false;
    localStorage.removeItem('admin_token');
    updateAdminUI();
    toast('已退出管理员');
  } else {
    openModal('admin-modal');
  }
});

$('admin-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    const res = await api('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username: f.username.value.trim(), password: f.password.value }),
    });
    adminToken = res.admin_token;
    isAdmin = true;
    localStorage.setItem('admin_token', adminToken);
    updateAdminUI();
    closeModal('admin-modal');
    f.reset();
    toast('管理员登录成功');
  } catch (err) { toast(err.message); }
});

async function openFromHash() {
  const id = parseGameHash();
  if (!id) return;
  try {
    const g = await api(`/api/games/${id}`);
    openDetail(g);
  } catch (err) {
    toast(err.message);
    clearGameHash();
  }
}

window.addEventListener('hashchange', () => {
  if (parseGameHash()) openFromHash();
  else closeModal('detail-modal');
});

// ===== 启动 =====
loadGames();
updateAdminUI();
openFromHash();

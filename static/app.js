// 游戏邀约平台 · 前端交互逻辑
let games = [];           // 当前招募列表缓存
let currentStatus = 'all'; // 当前筛选状态
let currentGame = null;    // 详情中正在查看的招募
let joinMode = 'join';     // 'join' | 'leave'
let editingId = null;      // 编辑中的招募 id
let adminToken = localStorage.getItem('admin_token') || null; // 管理员令牌
let isAdmin = !!adminToken;

const STATUS_TEXT = { open: '招募中', full: '已满员', ended: '已结束' };

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

function render() {
  const list = $('game-list');
  const empty = $('empty');
  const filtered = currentStatus === 'all'
    ? games
    : games.filter((g) => g.status === currentStatus);
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
    if (modal) modal.hidden = true;
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
  try {
    if (editingId) {
      if (!isAdmin) body.admin_token = f.admin_token.value.trim();
      await api(`/api/games/${editingId}`, { method: 'PATCH', body: JSON.stringify(body) });
      toast('已保存修改');
    } else {
      const created = await api('/api/games', { method: 'POST', body: JSON.stringify(body) });
      showToken(created.admin_token);
    }
    closeModal('create-modal');
    await loadGames();
  } catch (err) { toast(err.message); }
});

function showToken(token) {
  $('token-text').textContent = token;
  openModal('token-modal');
}

$('token-copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('token-text').textContent);
    toast('已复制到剪贴板');
  } catch (e) {
    toast('复制失败，请手动长按选择复制');
  }
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
  openModal('join-modal');
}

$('join-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const nickname = f.nickname.value.trim();
  if (!nickname) return;
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
    closeModal('detail-modal');
    await loadGames();
  } catch (err) { toast(err.message); }
});

// ===== 我的报名 =====
$('btn-my').addEventListener('click', () => {
  $('my-form').reset();
  $('my-result').hidden = true;
  openModal('my-modal');
});

$('my-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nickname = e.target.nickname.value.trim();
  if (!nickname) return;
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
  openModal('created-modal');
});

$('created-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nickname = e.target.nickname.value.trim();
  if (!nickname) return;
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

// ===== 启动 =====
loadGames();
updateAdminUI();

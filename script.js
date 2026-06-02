/* ============================================================
   NEXUS — script.js
   Full productivity app logic
   ============================================================ */

'use strict';

// ── HELPERS ──────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

const TODAY = () => new Date().toISOString().slice(0, 10);

function fmt(min) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function fmtH(min) {
  return (min / 60).toFixed(1) + 'h';
}

function fmtHShort(min) {
  const h = (min / 60);
  return h < 1 ? `${Math.round(min)}m` : `${h.toFixed(1)}h`;
}

function notify(msg, duration = 3000) {
  const el = $('notification');
  $('notifText').textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), duration);
}

function getLast7Days() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
}

function getWeekOfMonth(dateStr) {
  const d = new Date(dateStr);
  return `S${Math.ceil(d.getDate() / 7)}`;
}

function dayLabel(dateStr) {
  const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  return days[new Date(dateStr).getDay()];
}

const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

// ── STATE ────────────────────────────────────────────────────
const DEFAULT_STATE = {
  tasks: [],
  sessions: [],
  goals: { daily: 4, weekly: 20, monthly: 80 },
  theme: 'dark',
  streak: 0,
  lastActiveDate: null,
};

let S = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem('nexus_v2');
    return raw ? { ...DEFAULT_STATE, ...JSON.parse(raw) } : { ...DEFAULT_STATE };
  } catch { return { ...DEFAULT_STATE }; }
}

function save() {
  localStorage.setItem('nexus_v2', JSON.stringify(S));
}

// ── TASK HELPERS ─────────────────────────────────────────────
function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function getTaskTime(taskId) {
  return S.sessions
    .filter(s => s.taskId === taskId && s.type === 'focus')
    .reduce((a, s) => a + s.minutes, 0);
}

function getDayMinutes(dateStr, cat) {
  return S.sessions
    .filter(s => s.date === dateStr && s.type === 'focus' && (!cat || s.cat === cat))
    .reduce((a, s) => a + s.minutes, 0);
}

function getWeekMinutes(cat) {
  const days = getLast7Days();
  return days.reduce((a, d) => a + getDayMinutes(d, cat), 0);
}

function getMonthMinutes(cat, monthStr) {
  const m = monthStr || new Date().toISOString().slice(0, 7);
  return S.sessions
    .filter(s => s.date.startsWith(m) && s.type === 'focus' && (!cat || s.cat === cat))
    .reduce((a, s) => a + s.minutes, 0);
}

function getYearMinutes(cat) {
  const y = new Date().getFullYear().toString();
  return S.sessions
    .filter(s => s.date.startsWith(y) && s.type === 'focus' && (!cat || s.cat === cat))
    .reduce((a, s) => a + s.minutes, 0);
}

// ── STREAK ───────────────────────────────────────────────────
function updateStreak() {
  const today = TODAY();
  if (S.lastActiveDate === today) return;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = yesterday.toISOString().slice(0, 10);
  if (S.lastActiveDate === yStr) {
    S.streak = (S.streak || 0) + 1;
  } else if (S.lastActiveDate !== today) {
    S.streak = 1;
  }
  S.lastActiveDate = today;
  save();
}

// ── THEME ────────────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  $('themeIcon').textContent = theme === 'dark' ? '☀' : '☾';
}

$('themeToggle').addEventListener('click', () => {
  S.theme = S.theme === 'dark' ? 'light' : 'dark';
  applyTheme(S.theme);
  save();
  rebuildCharts();
});

// ── NAVIGATION ───────────────────────────────────────────────
const PAGE_TITLES = {
  dashboard: 'Dashboard',
  tasks: 'Tarefas',
  pomodoro: 'Pomodoro',
  stats: 'Estatísticas',
  goals: 'Metas',
  ranking: 'Ranking',
};

let currentView = 'dashboard';

function switchView(view) {
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  $$('.view').forEach(v => v.classList.toggle('active', v.id === `view-${view}`));
  $('pageTitle').textContent = PAGE_TITLES[view] || view;
  currentView = view;
  if (view === 'dashboard') renderDashboard();
  if (view === 'tasks') renderTasks();
  if (view === 'stats') renderStats();
  if (view === 'goals') renderGoals();
  if (view === 'ranking') renderRanking();
  if (view === 'pomodoro') renderPomodoroTaskSelect();
}

$$('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

// ── CHARTS REGISTRY ──────────────────────────────────────────
const charts = {};

function destroyChart(key) {
  if (charts[key]) { charts[key].destroy(); delete charts[key]; }
}

function chartColors() {
  const isDark = S.theme !== 'light';
  return {
    text: isDark ? '#9090aa' : '#5a5a72',
    grid: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)',
    study: '#4a9eff',
    exercise: '#3ecf74',
    art: '#ff8c42',
    purple: '#a855f7',
  };
}

function baseChartOpts(type) {
  const c = chartColors();
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { color: c.text, font: { family: 'DM Mono', size: 11 }, boxWidth: 10 }
      },
      tooltip: {
        backgroundColor: '#1c1c26',
        titleColor: '#e8e8f0',
        bodyColor: '#9090aa',
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        padding: 10,
        cornerRadius: 8,
      }
    },
    scales: type === 'pie' || type === 'doughnut' ? {} : {
      x: {
        ticks: { color: c.text, font: { family: 'DM Mono', size: 11 } },
        grid: { color: c.grid },
        border: { color: 'transparent' }
      },
      y: {
        ticks: { color: c.text, font: { family: 'DM Mono', size: 11 } },
        grid: { color: c.grid },
        border: { color: 'transparent' },
        beginAtZero: true,
      }
    }
  };
}

function rebuildCharts() {
  if (currentView === 'dashboard') renderDashboard();
  if (currentView === 'stats') renderStats();
  if (currentView === 'ranking') renderRanking();
}

// ── DASHBOARD ────────────────────────────────────────────────
function renderDashboard() {
  const today = TODAY();
  const todayTasks = S.tasks.filter(t => t.date === today);
  const doneTasks = todayTasks.filter(t => t.done);
  const totalMin = getDayMinutes(today);

  $('kpi-total').textContent = todayTasks.length;
  $('kpi-done').textContent = doneTasks.length;
  $('kpi-time').textContent = fmtHShort(totalMin);
  $('kpi-streak').textContent = S.streak || 0;

  // Mini task list
  const list = $('dashTaskList');
  const pending = S.tasks.filter(t => !t.done).slice(0, 6);
  if (pending.length === 0) {
    list.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:10px 0">Nenhuma tarefa pendente 🎉</div>';
  } else {
    list.innerHTML = pending.map(t => `
      <div class="task-mini-item">
        <div class="task-mini-dot" style="background:var(--${t.cat === 'study' ? 'study' : t.cat === 'exercise' ? 'exercise' : 'art'})"></div>
        <span class="task-mini-name">${escHtml(t.name)}</span>
        <span class="task-mini-cat">${catLabel(t.cat)}</span>
      </div>
    `).join('');
  }

  // Daily chart (bar - categories today)
  const c = chartColors();
  const cats = ['study', 'exercise', 'art'];
  const catMins = cats.map(cat => getDayMinutes(today, cat));
  destroyChart('daily');
  const dailyCtx = $('dailyChart').getContext('2d');
  charts.daily = new Chart(dailyCtx, {
    type: 'bar',
    data: {
      labels: ['Estudo', 'Exercício', 'Arte'],
      datasets: [{
        data: catMins.map(m => +(m / 60).toFixed(2)),
        backgroundColor: [c.study + '99', c.exercise + '99', c.art + '99'],
        borderColor: [c.study, c.exercise, c.art],
        borderWidth: 2,
        borderRadius: 6,
      }]
    },
    options: {
      ...baseChartOpts('bar'),
      plugins: { ...baseChartOpts('bar').plugins, legend: { display: false } },
    }
  });

  // Weekly chart (line)
  const days = getLast7Days();
  const dayMins = days.map(d => +(getDayMinutes(d) / 60).toFixed(2));
  destroyChart('weekly');
  const weeklyCtx = $('weeklyChart').getContext('2d');
  charts.weekly = new Chart(weeklyCtx, {
    type: 'line',
    data: {
      labels: days.map(dayLabel),
      datasets: [{
        label: 'Horas',
        data: dayMins,
        borderColor: c.orange || '#ff8c42',
        backgroundColor: 'rgba(255,140,66,0.1)',
        pointBackgroundColor: '#ff8c42',
        pointRadius: 4,
        tension: 0.4,
        fill: true,
      }]
    },
    options: baseChartOpts('line'),
  });

  // Category pie
  const weekCats = cats.map(cat => getWeekMinutes(cat));
  destroyChart('cat');
  const catCtx = $('catChart').getContext('2d');
  charts.cat = new Chart(catCtx, {
    type: 'doughnut',
    data: {
      labels: ['Estudo', 'Exercício', 'Arte'],
      datasets: [{
        data: weekCats,
        backgroundColor: [c.study + 'cc', c.exercise + 'cc', c.art + 'cc'],
        borderColor: ['#0e0e11'],
        borderWidth: 2,
      }]
    },
    options: {
      ...baseChartOpts('doughnut'),
      cutout: '65%',
    }
  });
}

// ── TASKS ────────────────────────────────────────────────────
let taskFilter = 'all';
let statusFilter = 'all-status';
let editingTaskId = null;

function catLabel(cat) {
  return { study: 'Estudo', exercise: 'Exercício', art: 'Arte' }[cat] || cat;
}

function catEmoji(cat) {
  return { study: '📚', exercise: '🏋️', art: '🎨' }[cat] || '';
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderTasks() {
  let tasks = [...S.tasks];

  if (taskFilter !== 'all') tasks = tasks.filter(t => t.cat === taskFilter);
  if (statusFilter === 'pending') tasks = tasks.filter(t => !t.done);
  if (statusFilter === 'done') tasks = tasks.filter(t => t.done);

  tasks.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return b.date.localeCompare(a.date);
  });

  const list = $('taskList');
  const empty = $('emptyTasks');

  if (tasks.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'flex';
    empty.style.flexDirection = 'column';
    empty.style.alignItems = 'center';
  } else {
    empty.style.display = 'none';
    list.innerHTML = tasks.map(t => taskCardHTML(t)).join('');
    list.querySelectorAll('.task-check').forEach(btn => {
      btn.addEventListener('click', () => toggleTask(btn.dataset.id));
    });
    list.querySelectorAll('.edit-task-btn').forEach(btn => {
      btn.addEventListener('click', () => openEditTask(btn.dataset.id));
    });
    list.querySelectorAll('.delete-task-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteTask(btn.dataset.id));
    });
    list.querySelectorAll('.start-btn').forEach(btn => {
      btn.addEventListener('click', () => startPomodoro(btn.dataset.id));
    });
  }
}

function taskCardHTML(t) {
  const timeMin = getTaskTime(t.id);
  const timeBadge = timeMin > 0 ? `<span class="task-time-badge">⏱ ${fmt(timeMin)}</span>` : '';
  return `
    <div class="task-card ${t.done ? 'done' : ''}" data-id="${t.id}">
      <button class="task-check" data-id="${t.id}">${t.done ? '✓' : ''}</button>
      <span class="task-cat-pill task-cat-${t.cat}">${catEmoji(t.cat)} ${catLabel(t.cat)}</span>
      <div class="task-info">
        <div class="task-name">${escHtml(t.name)}</div>
        <div class="task-meta">${t.date}${t.desc ? ' · ' + escHtml(t.desc.slice(0, 60)) : ''}</div>
      </div>
      ${timeBadge}
      <div class="task-actions">
        ${!t.done ? `<button class="task-btn start-btn" data-id="${t.id}">▶ Iniciar</button>` : ''}
        <button class="task-btn edit-task-btn" data-id="${t.id}">Editar</button>
        <button class="task-btn delete-btn delete-task-btn" data-id="${t.id}">✕</button>
      </div>
    </div>
  `;
}

function toggleTask(id) {
  const t = S.tasks.find(t => t.id === id);
  if (t) { t.done = !t.done; save(); renderTasks(); renderDashboard(); }
}

function deleteTask(id) {
  if (!confirm('Excluir esta tarefa?')) return;
  S.tasks = S.tasks.filter(t => t.id !== id);
  save();
  renderTasks();
  renderDashboard();
  notify('Tarefa excluída.');
}

function openEditTask(id) {
  const t = S.tasks.find(t => t.id === id);
  if (!t) return;
  editingTaskId = id;
  $('taskModalTitle').textContent = 'Editar Tarefa';
  $('taskName').value = t.name;
  $('taskCategory').value = t.cat;
  $('taskDate').value = t.date;
  $('taskDesc').value = t.desc || '';
  openModal('taskModal');
}

// Filters
$$('.filter-btn[data-filter]').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.filter-btn[data-filter]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    taskFilter = btn.dataset.filter;
    renderTasks();
  });
});

$$('.filter-btn[data-status]').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.filter-btn[data-status]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    statusFilter = btn.dataset.status;
    renderTasks();
  });
});

// ── TASK MODAL ───────────────────────────────────────────────
function openModal(id) {
  $(id).classList.add('open');
}

function closeModal(id) {
  $(id).classList.remove('open');
}

function openNewTask() {
  editingTaskId = null;
  $('taskModalTitle').textContent = 'Nova Tarefa';
  $('taskName').value = '';
  $('taskCategory').value = 'study';
  $('taskDate').value = TODAY();
  $('taskDesc').value = '';
  openModal('taskModal');
}

$('newTaskBtn').addEventListener('click', openNewTask);
document.addEventListener('click', e => {
  if (e.target && e.target.id === 'emptyNewTask') openNewTask();
});
$('closeTaskModal').addEventListener('click', () => closeModal('taskModal'));
$('cancelTask').addEventListener('click', () => closeModal('taskModal'));

$('saveTask').addEventListener('click', () => {
  const name = $('taskName').value.trim();
  const cat = $('taskCategory').value;
  const date = $('taskDate').value;
  const desc = $('taskDesc').value.trim();

  if (!name) { notify('Digite o nome da tarefa.'); return; }
  if (!date) { notify('Selecione a data.'); return; }

  if (editingTaskId) {
    const t = S.tasks.find(t => t.id === editingTaskId);
    if (t) { t.name = name; t.cat = cat; t.date = date; t.desc = desc; }
    notify('Tarefa atualizada!');
  } else {
    S.tasks.push({ id: newId(), name, cat, date, desc, done: false });
    notify('Tarefa criada!');
  }

  save();
  closeModal('taskModal');
  renderTasks();
  renderDashboard();
});

// Close modal on overlay click
$$('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
});

// ── POMODORO ─────────────────────────────────────────────────
let pomState = {
  focusMin: 25,
  breakMin: 5,
  currentMin: 25,
  seconds: 0,
  phase: 'focus', // 'focus' | 'break'
  running: false,
  interval: null,
  linkedTaskId: '',
  sessionsToday: 0,
  sessionStartTime: null,
};

function renderPomodoroTaskSelect() {
  const sel = $('pomodoroTaskSelect');
  const pending = S.tasks.filter(t => !t.done);
  sel.innerHTML = '<option value="">— Nenhuma —</option>' +
    pending.map(t => `<option value="${t.id}">${escHtml(t.name)} (${catLabel(t.cat)})</option>`).join('');
  if (pomState.linkedTaskId) sel.value = pomState.linkedTaskId;
}

$('pomodoroTaskSelect').addEventListener('change', e => {
  pomState.linkedTaskId = e.target.value;
});

function startPomodoro(taskId) {
  switchView('pomodoro');
  setTimeout(() => {
    $('pomodoroTaskSelect').value = taskId;
    pomState.linkedTaskId = taskId;
  }, 100);
}

// Mode buttons
$$('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const focus = parseInt(btn.dataset.focus);
    const brk = parseInt(btn.dataset.break);
    if (focus === 0 && brk === 0) {
      openModal('customModal');
      return;
    }
    $$('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    pomReset(focus, brk);
  });
});

$('customModeBtn').addEventListener('click', () => openModal('customModal'));
$('closeCustomModal').addEventListener('click', () => closeModal('customModal'));
$('cancelCustom').addEventListener('click', () => closeModal('customModal'));
$('applyCustom').addEventListener('click', () => {
  const f = parseInt($('customFocus').value);
  const b = parseInt($('customBreak').value);
  if (!f || !b || f < 1 || b < 1) { notify('Valores inválidos.'); return; }
  $$('.mode-btn').forEach(b2 => b2.classList.remove('active'));
  $('customModeBtn').classList.add('active');
  pomReset(f, b);
  closeModal('customModal');
});

function pomReset(focus, brk) {
  pomStop();
  pomState.focusMin = focus;
  pomState.breakMin = brk;
  pomState.phase = 'focus';
  pomState.currentMin = focus;
  pomState.seconds = 0;
  updatePomUI();
}

function pomStop() {
  if (pomState.interval) { clearInterval(pomState.interval); pomState.interval = null; }
  pomState.running = false;
  $('pomStart').textContent = '▶';
  $('pomStart').classList.remove('running');
}

function updatePomUI() {
  const total = pomState.currentMin * 60;
  const elapsed = pomState.currentMin * 60 - pomState.seconds;
  const pct = elapsed / total;
  const circumference = 553;
  const offset = circumference * pct;
  $('ringProgress').style.strokeDashoffset = offset;
  $('ringProgress').style.stroke = pomState.phase === 'focus' ? '#ff8c42' : '#3ecf74';

  const m = Math.floor(pomState.seconds / 60);
  const s = pomState.seconds % 60;
  $('pomodoroTime').textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  $('pomodoroPhase').textContent = pomState.phase === 'focus' ? 'FOCO' : 'DESCANSO';

  // Session dots (max 8)
  const dots = $('sessionDots');
  const count = Math.min(pomState.sessionsToday, 8);
  dots.innerHTML = Array.from({ length: Math.max(count, 4) }, (_, i) =>
    `<div class="session-dot ${i < count ? 'filled' : ''}"></div>`
  ).join('');
}

$('pomStart').addEventListener('click', () => {
  if (pomState.running) {
    pomStop();
  } else {
    if (pomState.seconds === 0) {
      pomState.seconds = pomState.currentMin * 60;
      pomState.sessionStartTime = Date.now();
    }
    pomState.running = true;
    $('pomStart').textContent = '⏸';
    $('pomStart').classList.add('running');
    pomState.interval = setInterval(pomTick, 1000);
  }
});

$('pomRestart').addEventListener('click', () => {
  pomReset(pomState.focusMin, pomState.breakMin);
});

$('pomSkip').addEventListener('click', () => {
  pomPhaseEnd();
});

function pomTick() {
  pomState.seconds--;
  updatePomUI();
  if (pomState.seconds <= 0) pomPhaseEnd();
}

function pomPhaseEnd() {
  pomStop();
  if (pomState.phase === 'focus') {
    const minutes = pomState.focusMin;
    const taskId = pomState.linkedTaskId;
    const task = S.tasks.find(t => t.id === taskId);
    const cat = task ? task.cat : 'study';

    S.sessions.push({
      id: newId(),
      taskId,
      taskName: task ? task.name : 'Sem tarefa',
      cat,
      date: TODAY(),
      minutes,
      type: 'focus',
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    });

    pomState.sessionsToday++;
    save();
    updateStreak();
    addSessionLogItem(cat, task ? task.name : 'Sem tarefa', minutes);
    notify(`✓ Sessão de ${minutes}min registrada!`);
    playBeep();

    // Switch to break
    pomState.phase = 'break';
    pomState.currentMin = pomState.breakMin;
    pomState.seconds = pomState.breakMin * 60;
  } else {
    pomState.phase = 'focus';
    pomState.currentMin = pomState.focusMin;
    pomState.seconds = 0;
    notify('Descansou! Pronto para focar.');
  }
  updatePomUI();
}

function addSessionLogItem(cat, taskName, minutes) {
  const log = $('sessionLog');
  const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const item = document.createElement('div');
  item.className = 'session-log-item';
  item.innerHTML = `
    <span class="cat-dot cat-${cat}"></span>
    <span class="log-task">${escHtml(taskName)}</span>
    <span class="log-time">${time}</span>
    <span class="log-dur">${minutes}m</span>
  `;
  log.prepend(item);
}

// Rebuild session log from saved data on load
function buildSessionLog() {
  const log = $('sessionLog');
  const todaySessions = S.sessions
    .filter(s => s.date === TODAY() && s.type === 'focus')
    .slice(-10)
    .reverse();
  log.innerHTML = '';
  todaySessions.forEach(s => {
    const item = document.createElement('div');
    item.className = 'session-log-item';
    item.innerHTML = `
      <span class="cat-dot cat-${s.cat}"></span>
      <span class="log-task">${escHtml(s.taskName || 'Sem tarefa')}</span>
      <span class="log-time">${s.time || ''}</span>
      <span class="log-dur">${s.minutes}m</span>
    `;
    log.appendChild(item);
  });
  pomState.sessionsToday = todaySessions.length;
  updatePomUI();
}

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.8);
  } catch (e) {}
}

// ── STATS ────────────────────────────────────────────────────
let currentStatsPeriod = 'daily';

$$('.stats-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.stats-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    $$('.stats-panel').forEach(p => p.classList.remove('active'));
    currentStatsPeriod = btn.dataset.period;
    $(`stats-${currentStatsPeriod}`).classList.add('active');
    renderStats();
  });
});

function renderStats() {
  const period = currentStatsPeriod;
  if (period === 'daily') renderStatsDaily();
  if (period === 'weekly') renderStatsWeekly();
  if (period === 'monthly') renderStatsMonthly();
  if (period === 'annual') renderStatsAnnual();
}

function renderStatsDaily() {
  const today = TODAY();
  const sMin = getDayMinutes(today, 'study');
  const eMin = getDayMinutes(today, 'exercise');
  const aMin = getDayMinutes(today, 'art');
  const done = S.tasks.filter(t => t.done && t.date === today).length;
  $('d-study').textContent = fmtHShort(sMin);
  $('d-exercise').textContent = fmtHShort(eMin);
  $('d-art').textContent = fmtHShort(aMin);
  $('d-tasks').textContent = done;

  const c = chartColors();
  destroyChart('statsDailyBar');
  charts.statsDailyBar = new Chart($('statsDailyBar').getContext('2d'), {
    type: 'bar',
    data: {
      labels: ['Estudo', 'Exercício', 'Arte'],
      datasets: [{
        label: 'Horas hoje',
        data: [sMin / 60, eMin / 60, aMin / 60].map(v => +v.toFixed(2)),
        backgroundColor: [c.study + '99', c.exercise + '99', c.art + '99'],
        borderColor: [c.study, c.exercise, c.art],
        borderWidth: 2,
        borderRadius: 8,
      }]
    },
    options: { ...baseChartOpts('bar'), plugins: { ...baseChartOpts('bar').plugins, legend: { display: false } } }
  });
}

function renderStatsWeekly() {
  const days = getLast7Days();
  const sMin = getWeekMinutes('study');
  const eMin = getWeekMinutes('exercise');
  const aMin = getWeekMinutes('art');
  const total = sMin + eMin + aMin;
  const avg = total / 7;

  $('w-study').textContent = fmtHShort(sMin);
  $('w-exercise').textContent = fmtHShort(eMin);
  $('w-art').textContent = fmtHShort(aMin);
  $('w-avg').textContent = fmtHShort(avg);

  const c = chartColors();
  destroyChart('statsWeeklyLine');
  charts.statsWeeklyLine = new Chart($('statsWeeklyLine').getContext('2d'), {
    type: 'line',
    data: {
      labels: days.map(dayLabel),
      datasets: [
        {
          label: 'Estudo',
          data: days.map(d => +(getDayMinutes(d, 'study') / 60).toFixed(2)),
          borderColor: c.study,
          backgroundColor: c.study + '22',
          tension: 0.4, fill: true, pointRadius: 4,
        },
        {
          label: 'Exercício',
          data: days.map(d => +(getDayMinutes(d, 'exercise') / 60).toFixed(2)),
          borderColor: c.exercise,
          backgroundColor: c.exercise + '22',
          tension: 0.4, fill: true, pointRadius: 4,
        },
        {
          label: 'Arte',
          data: days.map(d => +(getDayMinutes(d, 'art') / 60).toFixed(2)),
          borderColor: c.art,
          backgroundColor: c.art + '22',
          tension: 0.4, fill: true, pointRadius: 4,
        },
      ]
    },
    options: baseChartOpts('line'),
  });
}

function renderStatsMonthly() {
  const monthStr = new Date().toISOString().slice(0, 7);
  const sMin = getMonthMinutes('study');
  const eMin = getMonthMinutes('exercise');
  const aMin = getMonthMinutes('art');
  const total = sMin + eMin + aMin;

  $('m-study').textContent = fmtHShort(sMin);
  $('m-exercise').textContent = fmtHShort(eMin);
  $('m-art').textContent = fmtHShort(aMin);
  $('m-total').textContent = fmtHShort(total);

  // Build week buckets for current month
  const weeks = { 'S1': 0, 'S2': 0, 'S3': 0, 'S4': 0, 'S5': 0 };
  S.sessions.filter(s => s.date.startsWith(monthStr) && s.type === 'focus').forEach(s => {
    const wk = getWeekOfMonth(s.date);
    if (weeks[wk] !== undefined) weeks[wk] += s.minutes;
  });

  const c = chartColors();
  destroyChart('statsMonthBar');
  charts.statsMonthBar = new Chart($('statsMonthBar').getContext('2d'), {
    type: 'bar',
    data: {
      labels: Object.keys(weeks),
      datasets: [{
        label: 'Horas por semana',
        data: Object.values(weeks).map(m => +(m / 60).toFixed(2)),
        backgroundColor: c.purple + '99',
        borderColor: c.purple,
        borderWidth: 2,
        borderRadius: 6,
      }]
    },
    options: { ...baseChartOpts('bar'), plugins: { ...baseChartOpts('bar').plugins, legend: { display: false } } }
  });

  destroyChart('statsMonthPie');
  charts.statsMonthPie = new Chart($('statsMonthPie').getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: ['Estudo', 'Exercício', 'Arte'],
      datasets: [{
        data: [sMin, eMin, aMin],
        backgroundColor: [c.study + 'cc', c.exercise + 'cc', c.art + 'cc'],
        borderColor: 'transparent',
        borderWidth: 0,
      }]
    },
    options: { ...baseChartOpts('doughnut'), cutout: '60%' }
  });
}

function renderStatsAnnual() {
  const year = new Date().getFullYear().toString();
  const sMin = getYearMinutes('study');
  const eMin = getYearMinutes('exercise');
  const aMin = getYearMinutes('art');
  const total = sMin + eMin + aMin;
  const yearTasks = S.tasks.filter(t => t.done && t.date.startsWith(year)).length;
  const topCat = [['Estudo', sMin], ['Exercício', eMin], ['Arte', aMin]]
    .sort((a, b) => b[1] - a[1])[0][0];
  const avgPerMonth = total / 12;

  $('a-total').textContent = fmtHShort(total);
  $('a-tasks').textContent = yearTasks;
  $('a-top').textContent = topCat;
  $('a-avg').textContent = fmtHShort(avgPerMonth);

  // Per month data
  const monthMins = Array.from({ length: 12 }, (_, i) => {
    const m = `${year}-${String(i + 1).padStart(2, '0')}`;
    return +(getMonthMinutes(null, m) / 60).toFixed(2);
  });

  const c = chartColors();
  destroyChart('statsAnnualLine');
  charts.statsAnnualLine = new Chart($('statsAnnualLine').getContext('2d'), {
    type: 'line',
    data: {
      labels: MONTHS,
      datasets: [{
        label: 'Horas/mês',
        data: monthMins,
        borderColor: c.purple,
        backgroundColor: c.purple + '22',
        tension: 0.4,
        fill: true,
        pointRadius: 4,
        pointBackgroundColor: c.purple,
      }]
    },
    options: baseChartOpts('line'),
  });
}

// ── GOALS ────────────────────────────────────────────────────
let editingGoalPeriod = null;

$$('.edit-goal-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    editingGoalPeriod = btn.dataset.period;
    $('goalModalTitle').textContent = {
      daily: 'Meta Diária', weekly: 'Meta Semanal', monthly: 'Meta Mensal'
    }[editingGoalPeriod];
    $('goalHours').value = S.goals[editingGoalPeriod];
    openModal('goalModal');
  });
});

$('closeGoalModal').addEventListener('click', () => closeModal('goalModal'));
$('cancelGoal').addEventListener('click', () => closeModal('goalModal'));

$('saveGoal').addEventListener('click', () => {
  const h = parseFloat($('goalHours').value);
  if (!h || h < 0.5) { notify('Valor inválido.'); return; }
  S.goals[editingGoalPeriod] = h;
  save();
  closeModal('goalModal');
  renderGoals();
  notify('Meta atualizada!');
});

function renderGoals() {
  const today = TODAY();
  const dayMin = getDayMinutes(today);
  const weekMin = getWeekMinutes();
  const monthMin = getMonthMinutes();

  const dailyGoalMin = S.goals.daily * 60;
  const weeklyGoalMin = S.goals.weekly * 60;
  const monthlyGoalMin = S.goals.monthly * 60;

  $('goal-daily-val').textContent = S.goals.daily + 'h';
  $('goal-weekly-val').textContent = S.goals.weekly + 'h';
  $('goal-monthly-val').textContent = S.goals.monthly + 'h';

  const dp = Math.min(100, (dayMin / dailyGoalMin) * 100);
  const wp = Math.min(100, (weekMin / weeklyGoalMin) * 100);
  const mp = Math.min(100, (monthMin / monthlyGoalMin) * 100);

  $('goal-daily-bar').style.width = dp + '%';
  $('goal-weekly-bar').style.width = wp + '%';
  $('goal-monthly-bar').style.width = mp + '%';

  $('goal-daily-label').textContent = `${fmtHShort(dayMin)} / ${S.goals.daily}h`;
  $('goal-weekly-label').textContent = `${fmtHShort(weekMin)} / ${S.goals.weekly}h`;
  $('goal-monthly-label').textContent = `${fmtHShort(monthMin)} / ${S.goals.monthly}h`;

  // Category mini bars in daily
  const sMin = getDayMinutes(today, 'study');
  const eMin = getDayMinutes(today, 'exercise');
  const aMin = getDayMinutes(today, 'art');
  const maxMin = Math.max(sMin, eMin, aMin, 1);
  $('gd-study').style.width = (sMin / maxMin * 100) + '%';
  $('gd-exercise').style.width = (eMin / maxMin * 100) + '%';
  $('gd-art').style.width = (aMin / maxMin * 100) + '%';
}

// ── RANKING ─────────────────────────────────────────────────
let rankPeriod = 'month';

$$('.filter-btn[data-rank-period]').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.filter-btn[data-rank-period]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    rankPeriod = btn.dataset.rankPeriod;
    renderRanking();
  });
});

function getRankingData(period) {
  let sMin, eMin, aMin;
  if (period === 'week') {
    sMin = getWeekMinutes('study');
    eMin = getWeekMinutes('exercise');
    aMin = getWeekMinutes('art');
  } else if (period === 'year') {
    sMin = getYearMinutes('study');
    eMin = getYearMinutes('exercise');
    aMin = getYearMinutes('art');
  } else {
    sMin = getMonthMinutes('study');
    eMin = getMonthMinutes('exercise');
    aMin = getMonthMinutes('art');
  }
  return [
    { cat: 'study', label: 'Estudo', min: sMin, color: '#4a9eff', emoji: '📚' },
    { cat: 'exercise', label: 'Exercício', min: eMin, color: '#3ecf74', emoji: '🏋️' },
    { cat: 'art', label: 'Arte', min: aMin, color: '#ff8c42', emoji: '🎨' },
  ].sort((a, b) => b.min - a.min);
}

const MEDALS = ['🥇', '🥈', '🥉'];
const MEDAL_CLASSES = ['podium-rank-1', 'podium-rank-2', 'podium-rank-3'];

function renderRanking() {
  const data = getRankingData(rankPeriod);
  const maxMin = Math.max(...data.map(d => d.min), 1);

  // Podium
  const podium = $('rankingPodium');
  podium.innerHTML = data.map((d, i) => `
    <div class="podium-card ${MEDAL_CLASSES[i]}">
      <div class="podium-medal">${MEDALS[i]}</div>
      <div class="podium-cat-name">${d.emoji} ${d.label}</div>
      <div class="podium-hours">${fmtHShort(d.min)}</div>
      <div class="podium-sub">${periodLabel(rankPeriod)}</div>
      <div class="podium-bar">
        <div class="podium-bar-fill" style="width:${(d.min / maxMin * 100)}%;background:${d.color}"></div>
      </div>
    </div>
  `).join('');

  // Details
  const details = $('rankingDetails');
  details.innerHTML = data.map(d => `
    <div class="rank-detail-row">
      <span class="rank-detail-label">${d.emoji} ${d.label}</span>
      <div class="rank-detail-bar">
        <div class="rank-detail-fill" style="width:${(d.min / maxMin * 100)}%;background:${d.color}"></div>
      </div>
      <span class="rank-detail-val">${fmtHShort(d.min)}</span>
    </div>
  `).join('');

  // Chart
  const c = chartColors();
  destroyChart('rankingChart');

  // For chart: show weekly breakdown per category
  const days = getLast7Days();
  charts.rankingChart = new Chart($('rankingChart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: days.map(dayLabel),
      datasets: [
        {
          label: 'Estudo',
          data: days.map(d => +(getDayMinutes(d, 'study') / 60).toFixed(2)),
          backgroundColor: c.study + 'bb',
          borderRadius: 4,
        },
        {
          label: 'Exercício',
          data: days.map(d => +(getDayMinutes(d, 'exercise') / 60).toFixed(2)),
          backgroundColor: c.exercise + 'bb',
          borderRadius: 4,
        },
        {
          label: 'Arte',
          data: days.map(d => +(getDayMinutes(d, 'art') / 60).toFixed(2)),
          backgroundColor: c.art + 'bb',
          borderRadius: 4,
        },
      ]
    },
    options: {
      ...baseChartOpts('bar'),
      scales: {
        ...baseChartOpts('bar').scales,
        x: { ...baseChartOpts('bar').scales.x, stacked: true },
        y: { ...baseChartOpts('bar').scales.y, stacked: true },
      }
    }
  });
}

function periodLabel(period) {
  return { month: 'este mês', week: 'esta semana', year: 'este ano' }[period] || '';
}

// ── DATE DISPLAY ─────────────────────────────────────────────
function updateDateDisplay() {
  const now = new Date();
  const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  $('dateDisplay').textContent = now.toLocaleDateString('pt-BR', opts);
}

// ── EXPORT / IMPORT ──────────────────────────────────────────
$('exportBtn').addEventListener('click', () => {
  const json = JSON.stringify(S, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nexus-backup-${TODAY()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  notify('Backup exportado com sucesso!');
});

$('importFile').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      S = { ...DEFAULT_STATE, ...data };
      save();
      notify('Backup importado com sucesso!');
      rebuildAll();
    } catch {
      notify('Arquivo inválido.');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

function rebuildAll() {
  renderDashboard();
  renderTasks();
  renderGoals();
  renderRanking();
  buildSessionLog();
}

// ── INIT ─────────────────────────────────────────────────────
function init() {
  applyTheme(S.theme);
  updateDateDisplay();
  updateStreak();
  buildSessionLog();
  renderDashboard();
  renderTasks();

  // Set default date for task modal
  $('taskDate').value = TODAY();

  // Update date display every minute
  setInterval(updateDateDisplay, 60000);
}

init();

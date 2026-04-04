/* SwimMotivator — Training Log Module */

// ── State ────────────────────────────────────────────────
const STORAGE_KEY = 'swimMotivator_training';
const GOALS_KEY = 'swimMotivator_goals';

let tPool = 25;
let tDuration = 60;
let tReps = 1;
let tDistance = 25;
let tStroke = 'free';
let tIntensity = 'easy';
let tInterval = '';
let tSetType = '';
let tFeeling = 0;
let tSets = []; // current session sets

const STROKE_LABELS = {
  free: 'Freestyle', back: 'Backstroke', breast: 'Breaststroke',
  fly: 'Butterfly', im: 'IM', kick: 'Kick', pull: 'Pull', choice: 'Choice',
};

const STROKE_ICONS = {
  free: '\u{1F3CA}', back: '\u{1F519}', breast: '\u{1F438}',
  fly: '\u{1F98B}', im: '\u{1F504}', kick: '\u{1F9B6}',
  pull: '\u{1F4AA}', choice: '\u{1F3AF}',
};

const INTENSITY_COLORS = {
  easy: '#69f0ae', moderate: '#00e5ff', hard: '#ffab40', sprint: '#ff5252',
};

const FEELING_EMOJIS = [null, '\u{1F629}', '\u{1F613}', '\u{1F60A}', '\u{1F4AA}', '\u{1F525}'];

// ── Templates ────────────────────────────────────────────
const TEMPLATES = {
  warmup: { reps: 1, distance: 400, stroke: 'choice', intensity: 'easy', type: 'warmup', interval: '' },
  main_free: { reps: 8, distance: 100, stroke: 'free', intensity: 'hard', type: 'main', interval: '2:00' },
  main_im: { reps: 4, distance: 100, stroke: 'im', intensity: 'hard', type: 'main', interval: '2:30' },
  kick: { reps: 6, distance: 50, stroke: 'kick', intensity: 'moderate', type: '', interval: '1:15' },
  sprint: { reps: 8, distance: 25, stroke: 'free', intensity: 'sprint', type: 'main', interval: '1:00' },
  cooldown: { reps: 1, distance: 200, stroke: 'choice', intensity: 'easy', type: 'cooldown', interval: '' },
};

// ── LocalStorage helpers ─────────────────────────────────
function loadSessions() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

function saveSessions(sessions) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

function loadGoals() {
  try { return JSON.parse(localStorage.getItem(GOALS_KEY)) || []; }
  catch { return []; }
}

function saveGoals(goals) {
  localStorage.setItem(GOALS_KEY, JSON.stringify(goals));
}

// ── Tab rendering ────────────────────────────────────────
function renderTrainingTab() {
  // Set today's date
  const dateInput = document.getElementById('tDate');
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }
}

function switchTrainingView(view) {
  document.querySelectorAll('.training-nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
  document.querySelectorAll('.training-view').forEach(v => v.classList.remove('active'));

  const viewMap = { log: 'trainingLog', history: 'trainingHistory', goals: 'trainingGoals', stats: 'trainingStats' };
  const el = document.getElementById(viewMap[view]);
  if (el) el.classList.add('active');

  if (view === 'history') renderHistory();
  if (view === 'goals') renderGoals();
  if (view === 'stats') renderStats();
}

// ── Set builder controls ─────────────────────────────────
function setPool(val) {
  tPool = val;
  document.querySelectorAll('[data-pool]').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.pool) === val);
  });
}

function setDuration(val) {
  val = parseInt(val);
  if (!val || val < 1) return;
  tDuration = val;
  document.querySelectorAll('.t-field .t-toggle-group .t-toggle').forEach(btn => {
    const dur = parseInt(btn.textContent);
    btn.classList.toggle('active', dur === val);
  });
  const custom = document.getElementById('tDurationCustom');
  if (custom && ![45, 60, 75, 90].includes(val)) {
    custom.value = val;
  }
}

function stepReps(delta) {
  tReps = Math.max(1, Math.min(50, tReps + delta));
  document.getElementById('tReps').textContent = tReps;
}

function setReps(val) {
  tReps = val;
  document.getElementById('tReps').textContent = val;
}

function setDistance(val) {
  tDistance = val;
  document.querySelectorAll('.t-presets-dist .t-preset').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.textContent) === val);
  });
}

function setStroke(val) {
  tStroke = val;
  document.querySelectorAll('.t-stroke').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.stroke === val);
  });
}

function setIntensity(val) {
  tIntensity = val;
  document.querySelectorAll('.t-intensity').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.int === val);
  });
}

function setType(val) {
  tSetType = val;
  document.querySelectorAll('.t-type').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === val);
  });
}

function setFeeling(val) {
  tFeeling = val;
  document.querySelectorAll('.t-feeling').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.feel) === val);
  });
}

// ── Add set ──────────────────────────────────────────────
function addSet() {
  const set = {
    reps: tReps,
    distance: tDistance,
    stroke: tStroke,
    intensity: tIntensity,
    interval: document.getElementById('tInterval')?.value || '',
    type: tSetType,
  };
  tSets.push(set);
  renderSessionSets();
}

function removeSet(idx) {
  tSets.splice(idx, 1);
  renderSessionSets();
}

function applyTemplate(key) {
  const t = TEMPLATES[key];
  if (!t) return;
  tSets.push({ ...t });
  renderSessionSets();
}

function renderSessionSets() {
  const card = document.getElementById('tSessionCard');
  const list = document.getElementById('tSetsList');
  const totalEl = document.getElementById('tTotalDist');

  if (!tSets.length) {
    card.style.display = 'none';
    return;
  }
  card.style.display = 'block';

  let totalDist = 0;
  let html = '';

  tSets.forEach((s, i) => {
    const dist = s.reps * s.distance;
    totalDist += dist;
    const icon = STROKE_ICONS[s.stroke] || '';
    const label = s.reps > 1 ? `${s.reps} x ${s.distance}m` : `${s.distance}m`;
    const strokeLabel = STROKE_LABELS[s.stroke] || s.stroke;
    const intColor = INTENSITY_COLORS[s.intensity] || '#8892a8';
    const typeLabel = s.type ? `<span class="t-set-type">${s.type === 'warmup' ? 'Warm Up' : s.type === 'cooldown' ? 'Cool Down' : 'Main Set'}</span>` : '';
    const intervalLabel = s.interval ? `<span class="t-set-interval">on ${s.interval}</span>` : '';

    html += `<div class="t-set-row">
      <span class="t-set-icon">${icon}</span>
      <div class="t-set-info">
        <span class="t-set-main">${typeLabel}${label} ${strokeLabel} ${intervalLabel}</span>
        <span class="t-set-meta"><span class="t-set-int-dot" style="background:${intColor}"></span>${s.intensity} &middot; ${dist.toLocaleString()}m</span>
      </div>
      <button class="t-set-remove" onclick="removeSet(${i})" title="Remove">&times;</button>
    </div>`;
  });

  list.innerHTML = html;
  totalEl.textContent = totalDist.toLocaleString() + 'm';

  // Hide save success when editing
  document.getElementById('tSaveSuccess').style.display = 'none';
}

// ── Save session ─────────────────────────────────────────
function saveSession() {
  if (!tSets.length) return;

  const session = {
    id: 'session_' + Date.now(),
    date: document.getElementById('tDate')?.value || new Date().toISOString().split('T')[0],
    pool: tPool,
    duration: tDuration,
    sets: [...tSets],
    totalDistance: tSets.reduce((sum, s) => sum + s.reps * s.distance, 0),
    feeling: tFeeling,
    notes: document.getElementById('tNotes')?.value || '',
    savedAt: new Date().toISOString(),
  };

  const sessions = loadSessions();
  sessions.unshift(session);
  saveSessions(sessions);

  // Reset
  tSets = [];
  tFeeling = 0;
  renderSessionSets();
  document.getElementById('tNotes').value = '';
  document.querySelectorAll('.t-feeling').forEach(b => b.classList.remove('active'));
  document.getElementById('tSessionCard').style.display = 'none';

  // Show success
  document.getElementById('tSaveSuccess').style.display = 'flex';
  setTimeout(() => {
    document.getElementById('tSaveSuccess').style.display = 'none';
  }, 5000);
}

// ── History ──────────────────────────────────────────────
function renderHistory() {
  const container = document.getElementById('tHistoryList');
  const sessions = loadSessions();

  if (!sessions.length) {
    container.innerHTML = '<div class="club-empty-state">No sessions recorded yet. Start logging!</div>';
    return;
  }

  let html = '';
  sessions.forEach((s, i) => {
    const dateStr = formatSessionDate(s.date);
    const feelEmoji = FEELING_EMOJIS[s.feeling] || '';
    const setsSummary = s.sets.map(set => {
      const label = set.reps > 1 ? `${set.reps}x${set.distance}` : `${set.distance}`;
      return `${label} ${STROKE_LABELS[set.stroke] || set.stroke}`;
    }).join(', ');

    html += `<div class="t-history-item">
      <div class="t-history-header">
        <div class="t-history-date">${dateStr}</div>
        <div class="t-history-meta">
          <span>${s.pool || 25}m pool</span>
          <span>${s.duration || '?'}min</span>
          <span class="t-history-dist">${(s.totalDistance || 0).toLocaleString()}m</span>
          ${feelEmoji ? `<span class="t-history-feel">${feelEmoji}</span>` : ''}
        </div>
      </div>
      <div class="t-history-sets">${setsSummary}</div>
      ${s.notes ? `<div class="t-history-notes">${escapeHtml(s.notes)}</div>` : ''}
      <button class="t-history-delete" onclick="deleteSession(${i})">Delete</button>
    </div>`;
  });

  container.innerHTML = html;
}

function deleteSession(idx) {
  const sessions = loadSessions();
  sessions.splice(idx, 1);
  saveSessions(sessions);
  renderHistory();
}

function formatSessionDate(dateStr) {
  if (!dateStr) return 'Unknown';
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ── Goals ────────────────────────────────────────────────
function showGoalForm() {
  document.getElementById('tGoalForm').style.display = 'block';
  updateGoalForm();
  // Set default deadline to 3 months from now
  const d = new Date();
  d.setMonth(d.getMonth() + 3);
  document.getElementById('tGoalDeadline').value = d.toISOString().split('T')[0];
}

function hideGoalForm() {
  document.getElementById('tGoalForm').style.display = 'none';
}

function updateGoalForm() {
  const type = document.getElementById('tGoalType').value;
  const fields = document.getElementById('tGoalFields');

  if (type === 'pb') {
    fields.innerHTML = `
      <div class="t-field">
        <label class="t-label">Event</label>
        <select id="tGoalEvent" class="t-input">
          <option>50 Freestyle</option><option>100 Freestyle</option><option>200 Freestyle</option>
          <option>50 Backstroke</option><option>100 Backstroke</option><option>200 Backstroke</option>
          <option>50 Breaststroke</option><option>100 Breaststroke</option><option>200 Breaststroke</option>
          <option>50 Butterfly</option><option>100 Butterfly</option><option>200 Butterfly</option>
          <option>200 IM</option><option>400 IM</option>
        </select>
      </div>
      <div class="t-field">
        <label class="t-label">Target time</label>
        <input type="text" id="tGoalTarget" class="t-input" placeholder="e.g. 1:05.00">
      </div>`;
  } else if (type === 'distance') {
    fields.innerHTML = `
      <div class="t-field">
        <label class="t-label">Weekly distance target (meters)</label>
        <input type="number" id="tGoalTarget" class="t-input" placeholder="e.g. 10000" min="100" step="500">
      </div>`;
  } else if (type === 'sessions') {
    fields.innerHTML = `
      <div class="t-field">
        <label class="t-label">Sessions per week</label>
        <input type="number" id="tGoalTarget" class="t-input" placeholder="e.g. 4" min="1" max="14">
      </div>`;
  } else {
    fields.innerHTML = `
      <div class="t-field">
        <label class="t-label">Describe your goal</label>
        <input type="text" id="tGoalTarget" class="t-input" placeholder="e.g. Learn butterfly turns">
      </div>`;
  }
}

function saveGoal() {
  const type = document.getElementById('tGoalType').value;
  const deadline = document.getElementById('tGoalDeadline').value;
  const targetEl = document.getElementById('tGoalTarget');
  const target = targetEl ? targetEl.value : '';

  if (!target) return;

  const goal = {
    id: 'goal_' + Date.now(),
    type,
    target,
    event: type === 'pb' ? (document.getElementById('tGoalEvent')?.value || '') : '',
    deadline,
    createdAt: new Date().toISOString().split('T')[0],
    completed: false,
  };

  const goals = loadGoals();
  goals.unshift(goal);
  saveGoals(goals);
  hideGoalForm();
  renderGoals();
}

function renderGoals() {
  const container = document.getElementById('tGoalsList');
  const goals = loadGoals();

  if (!goals.length) {
    container.innerHTML = '<div class="club-empty-state">No goals set yet. Set your first goal!</div>';
    return;
  }

  const sessions = loadSessions();
  let html = '';

  goals.forEach((g, i) => {
    const progress = calcGoalProgress(g, sessions);
    const daysLeft = g.deadline ? Math.ceil((new Date(g.deadline) - new Date()) / (1000 * 60 * 60 * 24)) : null;
    const deadlineStr = g.deadline ? formatSessionDate(g.deadline) : '';
    const isOverdue = daysLeft !== null && daysLeft < 0;
    const completedCls = g.completed ? ' completed' : '';

    let description = '';
    if (g.type === 'pb') description = `Hit ${g.target} in ${g.event}`;
    else if (g.type === 'distance') description = `Swim ${parseInt(g.target).toLocaleString()}m per week`;
    else if (g.type === 'sessions') description = `${g.target} sessions per week`;
    else description = g.target;

    html += `<div class="t-goal-item${completedCls}">
      <div class="t-goal-header">
        <button class="t-goal-check${g.completed ? ' checked' : ''}" onclick="toggleGoalComplete(${i})">${g.completed ? '&#10003;' : ''}</button>
        <div class="t-goal-desc">${escapeHtml(description)}</div>
        <button class="t-goal-delete" onclick="deleteGoal(${i})">&times;</button>
      </div>
      ${progress !== null ? `
      <div class="t-goal-progress">
        <div class="t-goal-bar"><div class="t-goal-fill" style="width:${Math.min(100, progress)}%"></div></div>
        <span class="t-goal-pct">${Math.round(progress)}%</span>
      </div>` : ''}
      <div class="t-goal-footer">
        ${deadlineStr ? `<span class="t-goal-deadline${isOverdue ? ' overdue' : ''}">${isOverdue ? 'Overdue' : daysLeft + ' days left'} &middot; ${deadlineStr}</span>` : ''}
      </div>
    </div>`;
  });

  container.innerHTML = html;
}

function calcGoalProgress(goal, sessions) {
  if (goal.type === 'distance') {
    const target = parseInt(goal.target) || 0;
    if (!target) return null;
    const thisWeek = getWeekSessions(sessions);
    const weekDist = thisWeek.reduce((s, sess) => s + (sess.totalDistance || 0), 0);
    return (weekDist / target) * 100;
  }
  if (goal.type === 'sessions') {
    const target = parseInt(goal.target) || 0;
    if (!target) return null;
    const thisWeek = getWeekSessions(sessions);
    return (thisWeek.length / target) * 100;
  }
  return null; // PB and custom goals can't be auto-tracked from training data
}

function getWeekSessions(sessions) {
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  return sessions.filter(s => {
    const d = new Date(s.date + 'T00:00:00');
    return d >= weekAgo && d <= now;
  });
}

function toggleGoalComplete(idx) {
  const goals = loadGoals();
  if (goals[idx]) {
    goals[idx].completed = !goals[idx].completed;
    saveGoals(goals);
    renderGoals();
  }
}

function deleteGoal(idx) {
  const goals = loadGoals();
  goals.splice(idx, 1);
  saveGoals(goals);
  renderGoals();
}

// ── Stats ────────────────────────────────────────────────
function renderStats() {
  const sessions = loadSessions();

  // This week
  const weekSessions = getWeekSessions(sessions);
  const weekDist = weekSessions.reduce((s, sess) => s + (sess.totalDistance || 0), 0);
  document.getElementById('tsWeekDist').textContent = weekDist.toLocaleString() + 'm';
  document.getElementById('tsWeekSessions').textContent = weekSessions.length + ' sessions';

  // This month
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthSessions = sessions.filter(s => new Date(s.date + 'T00:00:00') >= monthStart);
  const monthDist = monthSessions.reduce((s, sess) => s + (sess.totalDistance || 0), 0);
  document.getElementById('tsMonthDist').textContent = monthDist.toLocaleString() + 'm';
  document.getElementById('tsMonthSessions').textContent = monthSessions.length + ' sessions';

  // Total
  const totalDist = sessions.reduce((s, sess) => s + (sess.totalDistance || 0), 0);
  document.getElementById('tsTotalDist').textContent = totalDist.toLocaleString() + 'm';
  document.getElementById('tsTotalSessions').textContent = sessions.length + ' sessions';

  // Avg feeling
  const feelings = sessions.filter(s => s.feeling > 0).map(s => s.feeling);
  if (feelings.length) {
    const avg = feelings.reduce((a, b) => a + b, 0) / feelings.length;
    const emoji = FEELING_EMOJIS[Math.round(avg)] || '';
    document.getElementById('tsAvgFeel').textContent = emoji + ' ' + avg.toFixed(1);
  } else {
    document.getElementById('tsAvgFeel').textContent = '-';
  }

  // Streak
  const streak = calcStreak(sessions);
  document.getElementById('tsStreak').textContent = streak > 1 ? `${streak} week streak!` : streak === 1 ? '1 week active' : 'Start your streak!';

  // Charts
  renderWeeklyChart(sessions);
  renderBreakdownChart(sessions);
}

function calcStreak(sessions) {
  // Count consecutive weeks with at least 1 session
  let streak = 0;
  const now = new Date();
  let weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Start of current week (Sunday)
  weekStart.setHours(0, 0, 0, 0);

  for (let w = 0; w < 52; w++) {
    const wEnd = new Date(weekStart);
    wEnd.setDate(wEnd.getDate() + 7);
    const hasSessions = sessions.some(s => {
      const d = new Date(s.date + 'T00:00:00');
      return d >= weekStart && d < wEnd;
    });
    if (hasSessions) streak++;
    else break;
    weekStart.setDate(weekStart.getDate() - 7);
  }
  return streak;
}

function renderWeeklyChart(sessions) {
  destroyChart('weeklyDist');
  const canvas = document.getElementById('tsWeeklyChart');
  if (!canvas) return;

  // Last 8 weeks
  const weeks = [];
  const now = new Date();
  for (let w = 7; w >= 0; w--) {
    const start = new Date(now);
    start.setDate(start.getDate() - start.getDay() - (w * 7));
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const dist = sessions
      .filter(s => { const d = new Date(s.date + 'T00:00:00'); return d >= start && d < end; })
      .reduce((sum, s) => sum + (s.totalDistance || 0), 0);
    const label = `${start.getDate()}/${start.getMonth() + 1}`;
    weeks.push({ label, dist });
  }

  charts.weeklyDist = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: weeks.map(w => w.label),
      datasets: [{
        label: 'Distance (m)',
        data: weeks.map(w => w.dist),
        backgroundColor: weeks.map((w, i) => i === weeks.length - 1 ? COLORS.amber : COLORS.amber + '66'),
        borderRadius: 6,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { grid: { display: false }, ticks: { color: COLORS.tick } },
        y: { grid: { color: COLORS.grid }, ticks: { color: COLORS.tick, callback: v => (v / 1000) + 'k' } },
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ctx.raw.toLocaleString() + 'm' } },
      },
    },
  });
}

function renderBreakdownChart(sessions) {
  destroyChart('breakdown');
  const canvas = document.getElementById('tsBreakdownChart');
  if (!canvas) return;

  // Stroke breakdown across all sessions
  const strokeDist = {};
  sessions.forEach(s => {
    (s.sets || []).forEach(set => {
      const stroke = set.stroke || 'choice';
      strokeDist[stroke] = (strokeDist[stroke] || 0) + set.reps * set.distance;
    });
  });

  const entries = Object.entries(strokeDist).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return;

  const strokeColors = {
    free: '#00e5ff', back: '#69f0ae', breast: '#b388ff',
    fly: '#ffd740', im: '#ff4081', kick: '#ffab40',
    pull: '#ff5252', choice: '#8892a8',
  };

  charts.breakdown = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: entries.map(([k]) => STROKE_LABELS[k] || k),
      datasets: [{
        data: entries.map(([, v]) => v),
        backgroundColor: entries.map(([k]) => strokeColors[k] || '#8892a8'),
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: { position: 'right', labels: { usePointStyle: true, pointStyle: 'circle', padding: 10, font: { size: 10 }, color: '#8892a8' } },
        tooltip: { callbacks: { label: ctx => `${ctx.label}: ${ctx.raw.toLocaleString()}m` } },
      },
    },
  });
}

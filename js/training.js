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
  updateAICoach('log');
}

function switchTrainingView(view) {
  document.querySelectorAll('.training-nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
  document.querySelectorAll('.training-view').forEach(v => v.classList.remove('active'));

  const viewMap = { log: 'trainingLog', history: 'trainingHistory', goals: 'trainingGoals', events: 'trainingEvents', qualify: 'trainingQualify', stats: 'trainingStats' };
  const el = document.getElementById(viewMap[view]);
  if (el) el.classList.add('active');

  if (view === 'history') renderHistory();
  if (view === 'goals') renderGoals();
  if (view === 'events') renderEvents();
  if (view === 'qualify') renderQualifying();
  if (view === 'stats') renderStats();

  updateAICoach(view);
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

// ── Events ──────────────────────────────────────────────
const EVENTS_KEY = 'swimMotivator_events';

function loadEvents() {
  try { return JSON.parse(localStorage.getItem(EVENTS_KEY)) || []; }
  catch { return []; }
}

function saveEventsData(events) {
  localStorage.setItem(EVENTS_KEY, JSON.stringify(events));
}

function showEventForm() {
  document.getElementById('tEventForm').style.display = 'block';
  const d = new Date(); d.setDate(d.getDate() + 30);
  document.getElementById('tEventDate').value = d.toISOString().split('T')[0];
}

function hideEventForm() {
  document.getElementById('tEventForm').style.display = 'none';
}

function toggleEventEntry(btn) {
  btn.classList.toggle('active');
}

function saveEvent() {
  const name = document.getElementById('tEventName').value.trim();
  const date = document.getElementById('tEventDate').value;
  const venue = document.getElementById('tEventVenue').value.trim();
  const notes = document.getElementById('tEventNotes').value.trim();
  if (!name || !date) return;

  const entries = [];
  document.querySelectorAll('#tEventEntries .t-stroke.active').forEach(btn => {
    entries.push(btn.dataset.entry);
  });

  const ev = {
    id: 'event_' + Date.now(),
    name, date, venue, entries, notes,
    createdAt: new Date().toISOString(),
  };

  const events = loadEvents();
  events.push(ev);
  saveEventsData(events);
  hideEventForm();

  // Reset form
  document.getElementById('tEventName').value = '';
  document.getElementById('tEventVenue').value = '';
  document.getElementById('tEventNotes').value = '';
  document.querySelectorAll('#tEventEntries .t-stroke').forEach(b => b.classList.remove('active'));
  renderEvents();
}

function renderEvents() {
  const events = loadEvents();
  const now = new Date();
  const upcoming = events.filter(e => new Date(e.date + 'T23:59:59') >= now)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  const past = events.filter(e => new Date(e.date + 'T23:59:59') < now)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const sessions = loadSessions();
  const upEl = document.getElementById('tEventsList');
  const pastEl = document.getElementById('tPastEventsList');

  if (!upcoming.length) {
    upEl.innerHTML = '<div class="club-empty-state">No upcoming events. Add your next competition!</div>';
  } else {
    upEl.innerHTML = upcoming.map((e, i) => renderEventCard(e, false, sessions)).join('');
  }

  if (!past.length) {
    pastEl.innerHTML = '<div class="club-empty-state">Past events will appear here.</div>';
  } else {
    pastEl.innerHTML = past.map(e => renderEventCard(e, true, sessions)).join('');
  }
}

function renderEventCard(ev, isPast, sessions) {
  const d = new Date(ev.date + 'T00:00:00');
  const now = new Date();
  const daysUntil = Math.ceil((d - now) / (1000 * 60 * 60 * 24));
  const dateStr = formatSessionDate(ev.date);

  let countdownHtml = '';
  if (!isPast) {
    const cls = daysUntil <= 7 ? 'soon' : daysUntil <= 30 ? 'medium' : 'far';
    const label = daysUntil === 0 ? 'TODAY!' : daysUntil === 1 ? 'Tomorrow!' : `${daysUntil} days`;
    countdownHtml = `<span class="event-countdown ${cls}">${label}</span>`;
  }

  const entriesHtml = (ev.entries || []).map(e =>
    `<span class="event-entry-chip">${escapeHtml(e)}</span>`
  ).join('');

  // AI tip for upcoming events
  let aiTip = '';
  if (!isPast && daysUntil <= 14 && sessions.length > 0) {
    const weekSess = getWeekSessions(sessions);
    const weekDist = weekSess.reduce((s, sess) => s + (sess.totalDistance || 0), 0);
    if (daysUntil <= 3) {
      aiTip = `<div class="event-ai-tip">Taper time! Keep sessions light and focus on rest. You've got this!</div>`;
    } else if (daysUntil <= 7) {
      aiTip = `<div class="event-ai-tip">Competition week! Reduce volume by 30-40%, focus on speed and technique.</div>`;
    } else if (weekDist > 8000) {
      aiTip = `<div class="event-ai-tip">Great training volume this week (${weekDist.toLocaleString()}m). Start thinking about tapering next week.</div>`;
    }
  }

  return `<div class="event-card ${isPast ? 'past' : 'upcoming'}">
    <button class="event-delete" onclick="deleteEvent('${ev.id}')">&times;</button>
    <div class="event-header">
      <div class="event-name">${escapeHtml(ev.name)}</div>
      ${countdownHtml}
    </div>
    <div class="event-meta">${dateStr}${ev.venue ? ' &middot; ' + escapeHtml(ev.venue) : ''}</div>
    ${entriesHtml ? `<div class="event-entries">${entriesHtml}</div>` : ''}
    ${ev.notes ? `<div class="event-notes">${escapeHtml(ev.notes)}</div>` : ''}
    ${aiTip}
  </div>`;
}

function deleteEvent(id) {
  const events = loadEvents().filter(e => e.id !== id);
  saveEventsData(events);
  renderEvents();
}

// ── Herts County Qualifying Times 2026 (from official document) ──
// Format: { event: { ageGroup: { qt: seconds, ct: seconds } } }
// Using FEMALE times - add OPEN later. Age groups: '10/11', '12', '13', '14', '15', '16+'
const HERTS_QT = {
  '50 Freestyle':     { '10/11': { qt: 35.00, ct: 37.80 }, '12': { qt: 35.25, ct: 31.05 }, '13': { qt: 33.53, ct: 29.96 }, '14': { qt: 32.36, ct: 29.60 }, '15': { qt: 31.97, ct: 28.60 }, '16+': { qt: 30.89, ct: null } },
  '100 Freestyle':    { '10/11': { qt: 75.00, ct: 86.58 }, '12': { qt: 71.89, ct: 79.80 }, '13': { qt: 67.51, ct: 74.94 }, '14': { qt: 65.19, ct: 71.36 }, '15': { qt: 64.04, ct: 71.04 }, '16+': { qt: 60.84, ct: 67.53 } },
  '200 Freestyle':    { '10/11': { qt: 171.23, ct: 190.07 }, '12': { qt: 155.67, ct: 172.79 }, '13': { qt: 143.88, ct: 159.89 }, '14': { qt: 137.58, ct: 154.36 }, '15': { qt: 136.18, ct: 152.33 }, '16+': { qt: 133.97, ct: 148.28 } },
  '400 Freestyle':    { '12': { qt: 332.32, ct: null }, '13': { qt: 318.08, ct: null }, '14': { qt: 303.08, ct: null }, '15': { qt: 291.00, ct: null }, '16+': { qt: 284.62, ct: null } },
  '50 Breaststroke':  { '10/11': { qt: 47.00, ct: 52.17 }, '12': { qt: 43.00, ct: 47.73 }, '13': { qt: 40.40, ct: 44.46 }, '14': { qt: 38.44, ct: 42.67 }, '15': { qt: 36.20, ct: 40.18 }, '16+': { qt: 36.20, ct: 40.18 } },
  '100 Breaststroke': { '10/11': { qt: 102.00, ct: 113.40 }, '12': { qt: 95.00, ct: 105.37 }, '13': { qt: 88.59, ct: 97.77 }, '14': { qt: 84.86, ct: 92.75 }, '15': { qt: 82.50, ct: 91.35 }, '16+': { qt: 79.26, ct: 88.08 } },
  '200 Breaststroke': { '10/11': { qt: 220.42, ct: 247.53 }, '12': { qt: 208.13, ct: 230.92 }, '13': { qt: 193.19, ct: 213.00 }, '14': { qt: 185.31, ct: 203.57 }, '15': { qt: 178.48, ct: 198.31 }, '16+': { qt: 173.12, ct: 192.06 } },
  '50 Butterfly':     { '10/11': { qt: 40.45, ct: 43.07 }, '12': { qt: 37.00, ct: 41.07 }, '13': { qt: 34.74, ct: 39.69 }, '14': { qt: 33.89, ct: 37.40 }, '15': { qt: 32.46, ct: 36.03 }, '16+': { qt: 31.33, ct: 34.78 } },
  '100 Butterfly':    { '10/11': { qt: 85.00, ct: null }, '12': { qt: 82.00, ct: null }, '13': { qt: 75.63, ct: null }, '14': { qt: 72.88, ct: null }, '15': { qt: 70.00, ct: null }, '16+': { qt: 68.12, ct: null } },
  '200 Butterfly':    { '13': { qt: 173.33, ct: null }, '14': { qt: 164.66, ct: null }, '15': { qt: 159.58, ct: null }, '16+': { qt: 156.57, ct: null } },
  '50 Backstroke':    { '10/11': { qt: 40.48, ct: 44.94 }, '12': { qt: 37.24, ct: 41.34 }, '13': { qt: 35.55, ct: 39.46 }, '14': { qt: 34.77, ct: 39.17 }, '15': { qt: 31.82, ct: 35.32 }, '16+': { qt: 33.25, ct: 36.93 } },
  '100 Backstroke':   { '10/11': { qt: 85.00, ct: 93.53 }, '12': { qt: 79.66, ct: 86.18 }, '13': { qt: 75.31, ct: 83.06 }, '14': { qt: 72.42, ct: 78.24 }, '15': { qt: 70.42, ct: 78.45 }, '16+': { qt: 66.36, ct: 73.20 } },
  '200 Backstroke':   { '13': { qt: 163.32, ct: null }, '14': { qt: 154.66, ct: null }, '15': { qt: 154.00, ct: null }, '16+': { qt: 147.11, ct: null } },
  '100 Individual Medley': { '10/11': { qt: 91.00, ct: 101.41 }, '12': { qt: 82.54, ct: 91.62 }, '13': { qt: 78.18, ct: 86.00 }, '14': { qt: 75.06, ct: 83.25 }, '15': { qt: 74.00, ct: 82.14 }, '16+': { qt: 71.27, ct: 79.11 } },
  '200 Individual Medley': { '10/11': { qt: 198.09, ct: null }, '12': { qt: 178.81, ct: null }, '13': { qt: 164.45, ct: null }, '14': { qt: 162.76, ct: null }, '15': { qt: 159.82, ct: null }, '16+': { qt: 155.58, ct: null } },
};

function getSwimmerAge() {
  if (!activeSwimmer || !activeSwimmer.yob) return null;
  const now = new Date();
  return now.getFullYear() - activeSwimmer.yob;
}

function getAgeGroup(age) {
  if (!age) return null;
  if (age <= 11) return '10/11';
  if (age <= 15) return String(age);
  return '16+';
}

function renderQualifying() {
  const grid = document.getElementById('qualGrid');
  const age = getSwimmerAge();
  const ageGroup = getAgeGroup(age);

  if (!activeSwimmer || !ageGroup) {
    grid.innerHTML = '<div class="club-empty-state">Select a swimmer to see qualifying times.</div>';
    return;
  }

  // Get swimmer's PBs
  const swimmerPBs = {};
  ALL_PBS.filter(pb => String(pb.tiref) === String(activeSwimmer.tiref)).forEach(pb => {
    const t = parseTimeToSeconds(pb.best_time);
    if (t) swimmerPBs[pb.event] = { time: t, timeStr: pb.best_time };
  });

  let html = '';
  let qualifiedCount = 0;
  let closeCount = 0;
  let totalEvents = 0;

  Object.entries(HERTS_QT).forEach(([event, groups]) => {
    const standard = groups[ageGroup];
    if (!standard) return;
    totalEvents++;

    const pb = swimmerPBs[event];
    const qt = standard.qt;
    const ct = standard.ct;

    if (!pb) {
      html += `<div class="qual-row">
        <div class="qual-event">${event}</div>
        <div class="qual-bar-wrap"><div class="qual-bar-fill target" style="width:0%"></div></div>
        <div class="qual-no-time">No PB</div>
        <div class="qual-qt">QT: ${formatSeconds(qt)}</div>
        <div class="qual-status-icon">&#9675;</div>
      </div>`;
      return;
    }

    const pct = Math.min(100, (qt / pb.time) * 100);
    let status, barClass, icon;

    if (pb.time <= qt) {
      status = 'qualified';
      barClass = 'qualified';
      icon = '\u2705';
      qualifiedCount++;
    } else if (ct && pb.time <= ct) {
      status = 'close';
      barClass = 'close';
      icon = '\u{1F525}';
      closeCount++;
    } else if (pct >= 90) {
      status = 'close';
      barClass = 'close';
      icon = '\u{1F4AA}';
      closeCount++;
    } else {
      status = 'target';
      barClass = 'target';
      icon = '\u{1F3AF}';
    }

    const diff = pb.time - qt;
    const diffStr = diff > 0 ? `${diff.toFixed(2)}s to go` : `${Math.abs(diff).toFixed(2)}s under!`;

    html += `<div class="qual-row">
      <div class="qual-event">${event}</div>
      <div class="qual-bar-wrap">
        <div class="qual-bar-fill ${barClass}" style="width:${pct}%"></div>
        <span class="qual-bar-pct">${diffStr}</span>
      </div>
      <div class="qual-your-time">${pb.timeStr}</div>
      <div class="qual-qt">QT: ${formatSeconds(qt)}</div>
      <div class="qual-status-icon">${icon}</div>
    </div>`;
  });

  grid.innerHTML = html || '<div class="club-empty-state">No qualifying standards found for this age group.</div>';

  // AI qualifying insight
  const msgEl = document.getElementById('aiQualifyMessage');
  if (msgEl) {
    const name = activeSwimmer.name.split(' ')[0];
    if (qualifiedCount > 0 && qualifiedCount === totalEvents) {
      msgEl.innerHTML = `<strong>${name}</strong> has qualified in <span class="ai-good">ALL ${qualifiedCount} events</span>! Absolutely incredible. You're performing at county championship level across the board. Time to set your sights on <span class="ai-highlight">regional qualifiers</span>!`;
    } else if (qualifiedCount > 0) {
      msgEl.innerHTML = `Great news, <strong>${name}</strong>! You've hit qualifying times in <span class="ai-good">${qualifiedCount} event${qualifiedCount > 1 ? 's' : ''}</span>. ${closeCount > 0 ? `You're also really close in <span class="ai-warn">${closeCount} more</span> - a few good training sessions could tip those over!` : ''} Keep pushing, every session gets you closer.`;
    } else if (closeCount > 0) {
      msgEl.innerHTML = `<strong>${name}</strong>, you're <span class="ai-warn">so close</span> in ${closeCount} event${closeCount > 1 ? 's' : ''}! The gap is small - focus on race pace work and technique drills. A PB swim at your next meet could get you there. ${closeCount >= 3 ? 'You\'re knocking on the door - keep going!' : ''}`;
    } else {
      msgEl.innerHTML = `<strong>${name}</strong>, county qualifying times are your next big target! Focus on consistent training and the times will come. Every swimmer starts somewhere - track your progress here and watch those bars grow. You've got this!`;
    }
  }
}

// ── AI Coach Insights ────────────────────────────────────
function updateAICoach(view) {
  const el = document.getElementById('aiCoachMessage');
  if (!el) return;

  const sessions = loadSessions();
  const goals = loadGoals();
  const events = loadEvents();
  const name = activeSwimmer ? activeSwimmer.name.split(' ')[0] : 'Swimmer';

  if (!sessions.length) {
    el.innerHTML = `Hey <strong>${name}</strong>! Welcome to your training log. Start by recording your first session and I'll give you personalised insights on your training. Let's get faster together!`;
    return;
  }

  const weekSess = getWeekSessions(sessions);
  const weekDist = weekSess.reduce((s, sess) => s + (sess.totalDistance || 0), 0);
  const weekCount = weekSess.length;

  // Last 2 weeks comparison
  const now = new Date();
  const twoWeeksAgo = new Date(now); twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
  const oneWeekAgo = new Date(now); oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const prevWeekSess = sessions.filter(s => {
    const d = new Date(s.date + 'T00:00:00');
    return d >= twoWeeksAgo && d < oneWeekAgo;
  });
  const prevWeekDist = prevWeekSess.reduce((s, sess) => s + (sess.totalDistance || 0), 0);
  const prevWeekCount = prevWeekSess.length;

  // Feeling trend
  const recentFeelings = sessions.slice(0, 5).filter(s => s.feeling > 0).map(s => s.feeling);
  const avgFeeling = recentFeelings.length ? recentFeelings.reduce((a, b) => a + b, 0) / recentFeelings.length : 0;

  // Intensity analysis
  let hardSets = 0, totalSets = 0;
  weekSess.forEach(s => (s.sets || []).forEach(set => {
    totalSets++;
    if (set.intensity === 'hard' || set.intensity === 'sprint') hardSets++;
  }));
  const hardPct = totalSets > 0 ? Math.round((hardSets / totalSets) * 100) : 0;

  // Upcoming events
  const nextEvent = events.filter(e => new Date(e.date + 'T23:59:59') >= now)
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0];
  const daysToEvent = nextEvent ? Math.ceil((new Date(nextEvent.date) - now) / (1000 * 60 * 60 * 24)) : null;

  // Streak
  const streak = calcStreak(sessions);

  let msg = '';

  if (view === 'log') {
    // Context-aware log page insight
    if (daysToEvent !== null && daysToEvent <= 3) {
      msg = `<strong>Race day is ${daysToEvent === 0 ? 'TODAY' : daysToEvent === 1 ? 'TOMORROW' : `in ${daysToEvent} days`}!</strong> ${nextEvent.name} is right around the corner. Keep today's session <span class="ai-highlight">light and sharp</span> - short sprints, technique focus, save the energy for when it counts! You're ready for this.`;
    } else if (daysToEvent !== null && daysToEvent <= 7) {
      msg = `Competition week, <strong>${name}</strong>! ${escapeHtml(nextEvent.name)} is in <span class="ai-warn">${daysToEvent} days</span>. Time to start tapering - reduce your volume but keep the intensity. Your body needs to be fresh and fast on race day!`;
    } else if (weekCount === 0) {
      msg = `No sessions logged this week yet, <strong>${name}</strong>. ${prevWeekCount > 0 ? `Last week you did ${prevWeekCount} sessions and ${prevWeekDist.toLocaleString()}m - let's match that!` : 'Jump in the pool and let\'s get started!'} Consistency is the secret to getting faster.`;
    } else if (avgFeeling < 2.5 && recentFeelings.length >= 3) {
      msg = `I've noticed you've been feeling <span class="ai-warn">quite tired</span> in recent sessions, <strong>${name}</strong>. That's a sign to maybe ease off a bit. Try an <span class="ai-highlight">easy recovery session</span> today - long, smooth freestyle with plenty of rest. Your body gets faster during recovery, not just during hard work!`;
    } else if (hardPct > 60) {
      msg = `Wow, <strong>${name}</strong> - you're going hard! <span class="ai-fire">${hardPct}% of your sets</span> this week were hard or sprint intensity. That's great for building speed, but make sure you're mixing in some <span class="ai-highlight">easy and moderate work</span> too. The 80/20 rule works: 80% easy, 20% hard.`;
    } else if (weekDist > prevWeekDist * 1.3 && prevWeekDist > 0) {
      msg = `Your volume is <span class="ai-good">up ${Math.round(((weekDist / prevWeekDist) - 1) * 100)}%</span> compared to last week, <strong>${name}</strong>! Great progress, but don't increase by more than 10-15% per week to stay injury-free. Listen to your body!`;
    } else {
      msg = `Welcome back, <strong>${name}</strong>! ${weekCount > 0 ? `You've already done <span class="ai-good">${weekCount} session${weekCount > 1 ? 's' : ''}</span> this week (${weekDist.toLocaleString()}m).` : ''} ${streak > 1 ? `You're on a <span class="ai-fire">${streak}-week streak</span> - keep it going!` : ''} Every session in the pool is making you a stronger swimmer!`;
    }
  } else if (view === 'history') {
    const totalDist = sessions.reduce((s, sess) => s + (sess.totalDistance || 0), 0);
    const days = sessions.length > 1 ? Math.ceil((new Date(sessions[0].date) - new Date(sessions[sessions.length - 1].date)) / (1000 * 60 * 60 * 24)) : 0;
    msg = `<strong>${name}</strong>, you've logged <span class="ai-good">${sessions.length} sessions</span> covering <span class="ai-highlight">${totalDist.toLocaleString()}m</span>${days > 0 ? ` over ${days} days` : ''}. That's like swimming ${(totalDist / 1500).toFixed(1)} miles! ${sessions.length >= 10 ? 'Your consistency is really paying off.' : 'Keep adding sessions and watch your progress grow.'} Look back at your notes - they\'re great for spotting what works.`;
  } else if (view === 'goals') {
    const activeGoals = goals.filter(g => !g.completed);
    const completedGoals = goals.filter(g => g.completed);
    if (!goals.length) {
      msg = `Setting goals is the first step to getting faster, <strong>${name}</strong>! Try a mix of <span class="ai-highlight">PB targets</span> (like a time for your best event), <span class="ai-highlight">training goals</span> (like sessions per week), and <span class="ai-highlight">technique goals</span> (like improving your turns). SMART goals work best - Specific, Measurable, Achievable, Relevant, and Time-bound!`;
    } else {
      msg = `<strong>${name}</strong>, you have <span class="ai-good">${activeGoals.length} active goal${activeGoals.length !== 1 ? 's' : ''}</span>${completedGoals.length > 0 ? ` and you've already smashed <span class="ai-fire">${completedGoals.length}</span>` : ''}! ${activeGoals.length > 0 ? 'Focus on one goal at a time in each session. Before you dive in, think: "Which goal am I working towards today?"' : 'Time to set some new challenges!'} Remember, the best swimmers are goal-driven swimmers.`;
    }
  } else if (view === 'events') {
    const upcomingEvents = events.filter(e => new Date(e.date + 'T23:59:59') >= now);
    if (!upcomingEvents.length) {
      msg = `No events on the calendar yet, <strong>${name}</strong>! Adding your upcoming competitions helps you <span class="ai-highlight">plan your training</span>. I'll give you taper advice as race day approaches, and help you peak at the right time. Check with your coach about upcoming galas!`;
    } else {
      msg = `<strong>${name}</strong>, you have <span class="ai-good">${upcomingEvents.length} event${upcomingEvents.length > 1 ? 's' : ''}</span> coming up! ${daysToEvent !== null && daysToEvent <= 14 ? `With <span class="ai-warn">${nextEvent.name}</span> in ${daysToEvent} days, now is the time to sharpen your race skills. Practice your starts, turns, and finishes.` : 'Use your events to set goals and focus your training. Every session should build towards your next competition.'} Visualise your races - see yourself touching the wall!`;
    }
  } else if (view === 'stats') {
    if (weekDist > prevWeekDist && prevWeekDist > 0) {
      msg = `Your numbers are going <span class="ai-good">up</span>, <strong>${name}</strong>! This week: <span class="ai-highlight">${weekDist.toLocaleString()}m</span> vs last week's ${prevWeekDist.toLocaleString()}m. ${hardPct > 40 ? 'Good intensity balance too.' : hardPct < 15 ? 'Try adding more hard sets next week to push your speed.' : 'Nice mix of intensities.'} The charts tell the story of a swimmer who's putting in the work!`;
    } else if (prevWeekDist > 0 && weekDist < prevWeekDist * 0.7) {
      msg = `Volume is <span class="ai-warn">down this week</span>, <strong>${name}</strong>. That's OK if it's a recovery or taper week! ${daysToEvent !== null && daysToEvent <= 14 ? `With ${nextEvent.name} coming up, tapering is smart.` : 'If you can fit in another session or two, it\'ll help keep your fitness building.'} Consistency over time matters more than any single week.`;
    } else {
      msg = `Here's your training dashboard, <strong>${name}</strong>! ${streak > 2 ? `<span class="ai-fire">${streak}-week streak</span> - that's real dedication! ` : ''}Look at the weekly chart to spot trends. Aim for a gradual increase in distance over time, with the occasional easy week for recovery. Your stroke breakdown shows where your training focus has been.`;
    }
  }

  el.innerHTML = msg;
}

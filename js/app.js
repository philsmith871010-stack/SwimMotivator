/* SwimMotivator v4 — Motivational Dashboard with Head-to-Head */

let CONFIG = {};
let ALL_PBS = [];
let ALL_RANKS = [];
let ALL_SQUAD = [];
let HISTORY = {};  // keyed by tiref (string)
let activeSwimmer = 'bella';
let selectedEvent = null;
let comparators = [];  // [{tiref, name, color}] — max 3
const COMP_COLORS = ['#69f0ae', '#b388ff', '#ffab40'];
const historyCache = {};  // loaded on demand

// ── Init ──────────────────────────────────────────────────
async function init() {
  try {
    setStatus('Loading data...');
    [CONFIG, ALL_PBS, ALL_RANKS, ALL_SQUAD] = await Promise.all([
      fetchJSON('config.json'),
      fetchJSON('personal_bests.json'),
      fetchJSON('ranks.json').catch(() => []),
      fetchJSON('squad.json').catch(() => []),
    ]);

    const bella = CONFIG.swimmers.bella;
    const amber = CONFIG.swimmers.amber;
    const [bHist, aHist] = await Promise.all([
      fetchJSON(`history/${bella.tiref}.json`).catch(() => []),
      fetchJSON(`history/${amber.tiref}.json`).catch(() => []),
    ]);
    HISTORY[bella.tiref] = bHist;
    HISTORY[amber.tiref] = aHist;

    setupToggle();
    refresh();
    setStatus('Ready', true);
  } catch (err) {
    setStatus(`Error: ${err.message}`);
    console.error(err);
  }
}

function setStatus(msg, ok = false) {
  const el = document.getElementById('statusText');
  el.textContent = msg;
  el.className = ok ? 'connected' : '';
}

function getSwimmer() { return CONFIG.swimmers?.[activeSwimmer] || {}; }
function getColor() { return activeSwimmer === 'bella' ? COLORS.bella : COLORS.amber; }
function getGlow() { return activeSwimmer === 'bella' ? COLORS.bellaGlow : COLORS.amberGlow; }

// ── Toggle ────────────────────────────────────────────────
function setupToggle() {
  document.querySelectorAll('.swimmer-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeSwimmer = btn.dataset.swimmer;
      document.querySelectorAll('.swimmer-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedEvent = null;
      comparators = [];
      refresh();
    });
  });
}

// ── Refresh ───────────────────────────────────────────────
function refresh() {
  const swimmer = getSwimmer();
  const history = HISTORY[swimmer.tiref] || [];
  const pbs = ALL_PBS.filter(r => r.tiref === swimmer.tiref);
  const ranks = ALL_RANKS.filter(r => r.tiref === swimmer.tiref);
  const cur = ranks.filter(r => r.year === 2026);
  const prev = ranks.filter(r => r.year === 2025);

  updatePBBanner(history);
  updateHeroStats(pbs, cur, prev, history);
  updateSeasonSummary(history, ranks, cur, prev);
  updateRankings(pbs, ranks);
  if (selectedEvent) {
    updateProgressChart();
    updateGoals(ranks, history);
    updateSquad();
    updateCompareInfo();
    updateSwimmerPicker();
  }
  updateRankProgression(ranks, pbs);
}

// ── PB Celebration Banner ─────────────────────────────────
function updatePBBanner(history) {
  const banner = document.getElementById('pbBanner');
  const pbs = history.filter(r => Number(r.is_pb) === 1).sort(sortByDate);
  if (!pbs.length) { banner.style.display = 'none'; return; }

  const latest = pbs[pbs.length - 1];
  const strokeNames = CONFIG.stroke_names || {};
  const eventName = strokeNames[String(latest.stroke_code)] || 'Event';
  const courseLabel = latest.course === 'S' ? 'SC' : 'LC';

  // Find previous PB for this stroke/course to calculate drop
  const sameEvent = pbs.filter(r => r.stroke_code === latest.stroke_code && r.course === latest.course);
  let dropText = '';
  if (sameEvent.length >= 2) {
    const prev = sameEvent[sameEvent.length - 2];
    const drop = parseTimeToSeconds(prev.time) - parseTimeToSeconds(latest.time);
    if (drop > 0) dropText = ` — dropped ${drop.toFixed(2)}s`;
  }

  document.getElementById('pbHeadline').textContent = `NEW PB! ${eventName} ${courseLabel} ${latest.time}`;
  document.getElementById('pbDetail').textContent = `${latest.meet_name || ''} — ${latest.date || ''}${dropText}`;
  banner.style.display = 'block';
}

// ── Hero Stats ────────────────────────────────────────────
function updateHeroStats(pbs, cur, prev, history) {
  // Best event
  const bestPB = pbs.reduce((a, b) => ((a?.wa_points || 0) > (b?.wa_points || 0) ? a : b), null);
  if (bestPB) {
    document.getElementById('statBestEvent').textContent = fmtEvent(bestPB.stroke, bestPB.course);
    const rank = cur.find(r => r.event === bestPB.stroke && r.course === bestPB.course);
    document.getElementById('statBestRank').textContent = rank ? `#${rank.rank} in England` : bestPB.time;
  }

  // Season PBs
  const seasonPBs = history.filter(r => Number(r.is_pb) === 1 && isCurrentSeason(r.date));
  document.getElementById('statPBCount').textContent = seasonPBs.length || '0';

  // PB streak: count consecutive meets ending now that had a PB
  const meets = [...new Set(history.map(r => r.meet_name).filter(Boolean))];
  let streak = 0;
  const meetsByDate = {};
  history.forEach(r => { if (r.meet_name) meetsByDate[r.meet_name] = r; });
  const sortedMeets = [...new Set(history.filter(r => r.meet_name).sort(sortByDate).map(r => r.meet_name))];
  for (let i = sortedMeets.length - 1; i >= 0; i--) {
    const meetSwims = history.filter(r => r.meet_name === sortedMeets[i]);
    if (meetSwims.some(r => Number(r.is_pb) === 1)) streak++;
    else break;
  }
  document.getElementById('statPBStreak').textContent = streak > 0 ? `${streak} meet PB streak!` : 'Keep pushing!';

  // Events ranked
  document.getElementById('statEventsRanked').textContent = cur.length || '-';
  if (cur.length) {
    const avg = Math.round(cur.reduce((s, r) => s + r.rank, 0) / cur.length);
    document.getElementById('statAvgRank').textContent = `Avg rank #${avg}`;
  } else {
    document.getElementById('statAvgRank').textContent = '';
  }

  // Ranks improved
  let improved = 0, total = 0;
  cur.forEach(cr => {
    const pr = prev.find(p => p.event === cr.event && p.course === cr.course);
    if (pr) { total++; if (cr.rank < pr.rank) improved++; }
  });
  const trendEl = document.getElementById('statTrend');
  trendEl.textContent = total > 0 ? `${improved}/${total}` : '-';
  trendEl.className = `stat-value ${improved > total / 2 ? 'green' : 'red'}`;
  document.getElementById('statTrendDetail').textContent = total > 0 ? 'events improved' : '';
}

function isCurrentSeason(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return false;
  return d >= new Date(2025, 8, 1); // Sep 2025 onwards = current season
}

// ── Season Summary ────────────────────────────────────────
function updateSeasonSummary(history, allRanks, cur, prev) {
  const container = document.getElementById('seasonSummary');
  const seasonSwims = history.filter(r => isCurrentSeason(r.date));
  const seasonPBs = seasonSwims.filter(r => Number(r.is_pb) === 1);
  const seasonMeets = new Set(seasonSwims.map(r => r.meet_name).filter(Boolean));
  const pbEvents = new Set(seasonPBs.map(r => r.stroke_code));

  // Biggest rank jump
  let biggestJump = 0, biggestEvent = '';
  cur.forEach(cr => {
    const pr = prev.find(p => p.event === cr.event && p.course === cr.course);
    if (pr && pr.rank - cr.rank > biggestJump) {
      biggestJump = pr.rank - cr.rank;
      biggestEvent = fmtEvent(cr.event, cr.course);
    }
  });

  let html = '';
  html += `<div class="season-chip"><strong>${seasonPBs.length}</strong> PBs across <strong>${pbEvents.size}</strong> events</div>`;
  html += `<div class="season-chip"><strong>${seasonMeets.size}</strong> meets this season</div>`;
  if (biggestJump > 0) {
    html += `<div class="season-chip">Biggest jump: <span class="highlight">&#9650;${biggestJump}</span> ${biggestEvent}</div>`;
  }

  // Best WA this season
  const bestWA = seasonSwims.reduce((max, r) => {
    const wa = parseInt(r.wa_points) || 0;
    return wa > max.wa ? { wa, r } : max;
  }, { wa: 0, r: null });
  if (bestWA.wa > 0) {
    const evName = CONFIG.stroke_names?.[String(bestWA.r.stroke_code)] || '';
    html += `<div class="season-chip">Best WA: <strong class="highlight">${bestWA.wa}</strong> ${evName}</div>`;
  }

  container.innerHTML = html;
}

// ── Rankings List ─────────────────────────────────────────
function updateRankings(pbs, ranks) {
  const container = document.getElementById('rankingsList');
  const eventMap = new Map();
  pbs.forEach(pb => {
    const key = `${pb.stroke}|${pb.course}`;
    if (!eventMap.has(key) || (pb.wa_points || 0) > (eventMap.get(key).wa_points || 0))
      eventMap.set(key, pb);
  });

  const events = [...eventMap.values()]
    .sort((a, b) => (b.wa_points || 0) - (a.wa_points || 0))
    .map(pb => {
      const cr = ranks.find(r => r.event === pb.stroke && r.course === pb.course && r.year === 2026);
      const pr = ranks.find(r => r.event === pb.stroke && r.course === pb.course && r.year === 2025);
      let move = null, dir = 'same';
      if (cr && pr) { move = pr.rank - cr.rank; dir = move > 0 ? 'up' : move < 0 ? 'down' : 'same'; }
      return { pb, cr, pr, move, dir };
    });

  if (!events.length) { container.innerHTML = '<div class="loading">No PB data</div>'; return; }
  if (!selectedEvent) {
    selectedEvent = { stroke: events[0].pb.stroke, course: events[0].pb.course };
    updateProgressChart(); updateGoals(ranks, HISTORY[getSwimmer().tiref] || []); updateSquad(); updateSwimmerPicker();
  }

  let html = '';
  events.forEach(e => {
    const sel = selectedEvent && selectedEvent.stroke === e.pb.stroke && selectedEvent.course === e.pb.course;
    const rank = e.cr?.rank;
    const bc = rank ? (rank <= 50 ? 'gold' : rank <= 100 ? 'silver' : rank <= 250 ? 'cyan' : 'grey') : 'grey';
    let moveHtml = '';
    if (e.move !== null) {
      const arrow = e.dir === 'up' ? '&#9650;' : e.dir === 'down' ? '&#9660;' : '&#8212;';
      moveHtml = `<span class="rank-move ${e.dir}">${arrow}${Math.abs(e.move) || ''}</span>`;
    }
    html += `<div class="rank-row${sel ? ' selected' : ''}" onclick="selectEvent('${e.pb.stroke}','${e.pb.course}')">
      <span class="rank-event">${fmtEvent(e.pb.stroke, e.pb.course)}</span>
      <span class="rank-time">${e.pb.time}</span>
      <span class="rank-badge ${bc}">${rank ? '#' + rank : '-'}</span>
      ${moveHtml}
    </div>`;
  });
  container.innerHTML = html;
}

function fmtEvent(stroke, course) {
  return stroke.replace('Freestyle', 'Free').replace('Breaststroke', 'Breast')
    .replace('Butterfly', 'Fly').replace('Backstroke', 'Back')
    .replace('Individual Medley', 'IM') + ' ' + course;
}

function selectEvent(stroke, course) {
  selectedEvent = { stroke, course };
  comparators = [];
  refresh();
}

// ── Progress Chart with Comparators ──────────────────────
async function updateProgressChart() {
  if (!selectedEvent) return;
  const swimmer = getSwimmer();
  const history = HISTORY[swimmer.tiref] || [];
  const courseFilter = document.getElementById('chartCourse').value;
  const strokeNames = CONFIG.stroke_names || {};
  let strokeCode = null;
  for (const [code, name] of Object.entries(strokeNames)) {
    if (name === selectedEvent.stroke) { strokeCode = code; break; }
  }
  const courseMap = { SC: 'S', LC: 'L' };
  const hCourse = courseMap[selectedEvent.course] || '';

  const filterH = (h) => h
    .filter(r => !strokeCode || String(r.stroke_code) === strokeCode)
    .filter(r => courseFilter ? r.course === courseFilter : (!hCourse || r.course === hCourse))
    .filter(r => r.time && Number.isFinite(parseTimeToSeconds(r.time)))
    .sort(sortByDate);

  const myData = filterH(history);
  const color = getColor();

  // Build main swimmer dataset
  const datasets = [buildDataset(myData, swimmer.name, color, getGlow(), true)];

  // Add comparator datasets
  for (const comp of comparators) {
    let h = historyCache[comp.tiref];
    if (!h) {
      try { h = await fetchJSON(`history/${comp.tiref}.json`); } catch { h = []; }
      historyCache[comp.tiref] = h;
    }
    const cd = filterH(h);
    datasets.push(buildDataset(cd, comp.name, comp.color, comp.color + '22', false));
  }

  destroyChart('progress');
  charts.progress = new Chart(document.getElementById('progressChart'), {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { type: 'time', time: { parser: 'dd/MM/yyyy', unit: 'month', displayFormats: { month: 'MMM yy' } },
             grid: { color: COLORS.grid }, ticks: { color: COLORS.tick } },
        y: { reverse: true, grid: { color: COLORS.grid },
             ticks: { color: COLORS.tick, callback: v => formatSeconds(v) } },
      },
      plugins: {
        legend: { display: datasets.length > 1, labels: { usePointStyle: true, pointStyle: 'circle', padding: 12, font: { size: 10 } } },
        tooltip: {
          callbacks: {
            title: ctx => ctx[0]?.dataset.label || '',
            label: ctx => {
              const p = ctx.raw;
              const lines = [`Time: ${formatSeconds(p.y)}`, `Date: ${p.rawDate || ''}`];
              if (p.meetName) lines.push(`Meet: ${p.meetName}`);
              if (p.waPoints) lines.push(`WA: ${p.waPoints}`);
              if (p.isPb) lines.push('PB!');
              return lines;
            },
          },
        },
      },
    },
  });

  document.getElementById('chartTitle').textContent = `${fmtEvent(selectedEvent.stroke, selectedEvent.course)} — Progress`;
}

function buildDataset(rows, label, color, glow, showPBs) {
  const data = rows.map(r => ({
    x: parseDate(r.date || ''), y: parseTimeToSeconds(r.time),
    isPb: Number(r.is_pb || 0) === 1, meetName: r.meet_name || '',
    rawDate: r.date || '', waPoints: r.wa_points,
  })).filter(p => p.x && Number.isFinite(p.y));

  return {
    label, data,
    borderColor: color, backgroundColor: glow,
    pointBackgroundColor: data.map(p => (showPBs && p.isPb) ? COLORS.gold : color),
    pointRadius: data.map(p => (showPBs && p.isPb) ? 7 : 3),
    pointHoverRadius: 8, borderWidth: 2.5, tension: 0.2, spanGaps: true,
    fill: false,
  };
}

// ── Comparator Management ─────────────────────────────────
function toggleComparator(tiref, name) {
  const swimmer = getSwimmer();
  if (String(tiref) === String(swimmer.tiref)) return;

  const idx = comparators.findIndex(c => c.tiref === tiref);
  if (idx >= 0) {
    comparators.splice(idx, 1);
  } else {
    if (comparators.length >= 3) comparators.shift();
    const colorIdx = comparators.length;
    comparators.push({ tiref, name, color: COMP_COLORS[colorIdx % COMP_COLORS.length] });
  }
  updateProgressChart();
  updateSquad();
  updateCompareInfo();
  updateSwimmerPicker();
}

function clearComparators() {
  comparators = [];
  updateProgressChart();
  updateSquad();
  updateCompareInfo();
  updateSwimmerPicker();
}

function updateCompareInfo() {
  const info = document.getElementById('compareInfo');
  const chips = document.getElementById('compareChips');
  if (!comparators.length) { info.style.display = 'none'; return; }
  info.style.display = 'flex';
  chips.innerHTML = comparators.map(c =>
    `<span class="compare-chip"><span class="dot" style="background:${c.color}"></span>${c.name}</span>`
  ).join('');
}

// ── Swimmer Picker (below chart) ─────────────────────────
let pickerOpen = false;

function togglePickerOpen() {
  pickerOpen = !pickerOpen;
  document.getElementById('pickerList').classList.toggle('open', pickerOpen);
  document.getElementById('pickerToggle').classList.toggle('open', pickerOpen);
}

function updateSwimmerPicker() {
  const picker = document.getElementById('swimmerPicker');
  const list = document.getElementById('pickerList');
  if (!selectedEvent) { picker.style.display = 'none'; return; }

  const swimmer = getSwimmer();
  const swimmerYob = swimmer.yob;
  const eventName = selectedEvent.stroke;

  const squadRows = ALL_SQUAD.filter(r => r.event === eventName)
    .filter(r => r.yob && Math.abs(r.yob - swimmerYob) <= 1)
    .filter(r => r.best_time && Number.isFinite(parseTimeToSeconds(r.best_time)))
    .sort((a, b) => parseTimeToSeconds(a.best_time) - parseTimeToSeconds(b.best_time));

  if (!squadRows.length) { picker.style.display = 'none'; return; }

  const targetId = String(swimmer.tiref);
  const compTirefs = new Set(comparators.map(c => c.tiref));

  let html = '';
  squadRows.forEach(r => {
    const tid = String(r.tiref);
    const isTarget = tid === targetId;
    const isComp = compTirefs.has(tid);
    const comp = comparators.find(c => c.tiref === tid);
    const dotColor = isTarget ? getColor() : comp ? comp.color : 'transparent';
    const cls = isTarget ? ' is-active' : isComp ? ' is-selected' : '';

    html += `<span class="picker-item${cls}" ${!isTarget ? `onclick="toggleComparator('${tid}','${r.swimmer_name || 'Swimmer'}')"` : ''}>`;
    if (isComp || isTarget) html += `<span class="picker-dot" style="background:${dotColor}"></span>`;
    html += `${r.swimmer_name || '-'} <span class="picker-time">${r.best_time}</span></span>`;
  });

  list.innerHTML = html;
  picker.style.display = 'block';
}

// ── Goals with Projections ────────────────────────────────
function updateGoals(ranks, history) {
  if (!selectedEvent) return;
  const container = document.getElementById('goalsContainer');
  const swimmer = getSwimmer();
  ranks = ranks || ALL_RANKS.filter(r => r.tiref === swimmer.tiref);
  history = history || HISTORY[swimmer.tiref] || [];

  const rank = ranks.find(r =>
    r.tiref === swimmer.tiref && r.event === selectedEvent.stroke &&
    r.course === selectedEvent.course && r.year === 2026);

  if (!rank) {
    container.innerHTML = '<div style="color:var(--text-3);font-size:0.8rem">No ranking data for this event</div>';
    return;
  }

  const currentTime = parseTimeToSeconds(rank.time);
  if (!currentTime) { container.innerHTML = '-'; return; }

  // Calculate improvement rate from history
  const strokeNames = CONFIG.stroke_names || {};
  let strokeCode = null;
  for (const [c, n] of Object.entries(strokeNames)) { if (n === selectedEvent.stroke) { strokeCode = c; break; } }
  const courseMap = { SC: 'S', LC: 'L' };
  const hCourse = courseMap[selectedEvent.course] || '';
  const eventHistory = (history || [])
    .filter(r => String(r.stroke_code) === strokeCode && r.course === hCourse)
    .filter(r => r.time && Number.isFinite(parseTimeToSeconds(r.time)))
    .sort(sortByDate);

  // Improvement rate: seconds dropped per month over last 12 months
  let ratePerMonth = null;
  if (eventHistory.length >= 2) {
    const now = new Date();
    const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    const recent = eventHistory.filter(r => { const d = parseDate(r.date); return d && d >= yearAgo; });
    if (recent.length >= 2) {
      const first = recent[0], last = recent[recent.length - 1];
      const t1 = parseTimeToSeconds(first.time), t2 = parseTimeToSeconds(last.time);
      const d1 = parseDate(first.date), d2 = parseDate(last.date);
      if (t1 && t2 && d1 && d2 && d2 > d1) {
        const months = (d2 - d1) / (1000 * 60 * 60 * 24 * 30.44);
        if (months > 0) ratePerMonth = (t1 - t2) / months;
      }
    }
  }

  const milestones = [
    { label: 'Top 50', target: 50 },
    { label: 'Top 100', target: 100 },
    { label: 'Top 200', target: 200 },
  ].filter(m => m.target < rank.rank);

  let html = '';
  if (!milestones.length) {
    html += `<div class="goal-row"><span class="goal-achieved">Already top ${rank.rank}!</span></div>`;
  }

  milestones.forEach(m => {
    const ratio = m.target / rank.rank;
    const estTime = currentTime * (0.95 + 0.05 * ratio);
    const drop = currentTime - estTime;

    let projection = '';
    if (ratePerMonth && ratePerMonth > 0 && drop > 0) {
      const monthsNeeded = drop / ratePerMonth;
      const targetDate = new Date();
      targetDate.setMonth(targetDate.getMonth() + Math.ceil(monthsNeeded));
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      projection = `~${monthNames[targetDate.getMonth()]} ${targetDate.getFullYear()}`;
    }

    html += `<div class="goal-row">
      <span class="goal-label">${m.label} in England</span>
      <span class="goal-time">~${formatSeconds(estTime)}</span>
      <span class="goal-drop">drop ${drop.toFixed(2)}s ${projection ? `<span class="goal-date">${projection}</span>` : ''}</span>
    </div>`;
  });

  html += `<div class="goal-row">
    <span class="goal-label">Current: #${rank.rank}</span>
    <span class="goal-time">${rank.time}</span>
    <span class="goal-drop">${ratePerMonth ? `improving ${ratePerMonth.toFixed(2)}s/month` : ''}</span>
  </div>`;

  container.innerHTML = html;
}

// ── Club Standings (clickable for comparison) ─────────────
function updateSquad() {
  if (!selectedEvent) return;
  const container = document.getElementById('squadContainer');
  const titleEl = document.getElementById('clubEventTitle');
  const swimmer = getSwimmer();
  const swimmerYob = swimmer.yob;

  titleEl.textContent = `${fmtEvent(selectedEvent.stroke, selectedEvent.course)} (YoB ${swimmerYob - 1}-${swimmerYob + 1})`;

  const eventName = selectedEvent.stroke;
  let squadRows = ALL_SQUAD.filter(r => r.event === eventName)
    .filter(r => r.yob && Math.abs(r.yob - swimmerYob) <= 1)
    .filter(r => r.best_time && Number.isFinite(parseTimeToSeconds(r.best_time)))
    .sort((a, b) => parseTimeToSeconds(a.best_time) - parseTimeToSeconds(b.best_time));

  if (!squadRows.length) {
    container.innerHTML = '<div style="color:var(--text-3);font-size:0.8rem;padding:1rem">No club data</div>';
    return;
  }

  const bellaId = String(CONFIG.swimmers.bella.tiref);
  const amberId = String(CONFIG.swimmers.amber.tiref);
  const targetId = String(swimmer.tiref);
  const compTirefs = new Set(comparators.map(c => c.tiref));

  let html = '';
  squadRows.forEach((r, i) => {
    const pos = i + 1;
    const tid = String(r.tiref);
    const isTarget = tid === targetId;
    const isComp = compTirefs.has(tid);
    const comp = comparators.find(c => c.tiref === tid);
    const targetCls = isTarget ? ` is-target ${activeSwimmer}` : '';
    const compCls = isComp ? ' is-compared' : '';
    const posCls = pos <= 3 ? ` p${pos}` : '';
    const dotColor = isTarget ? getColor() : comp ? comp.color : 'transparent';
    const canClick = !isTarget;

    html += `<div class="squad-row${targetCls}${compCls}" ${canClick ? `onclick="toggleComparator('${tid}','${r.swimmer_name || 'Swimmer'}')"` : ''}>
      <span class="squad-pos${posCls}">${pos}</span>
      <span class="squad-color-dot" style="background:${dotColor}"></span>
      <span class="squad-name">${r.swimmer_name || '-'}</span>
      <span class="squad-time">${r.best_time}</span>
    </div>`;
  });

  container.innerHTML = html;
}

// ── Rank Progression Chart ────────────────────────────────
function updateRankProgression(ranks, pbs) {
  const swimmer = getSwimmer();
  pbs = pbs || ALL_PBS.filter(r => r.tiref === swimmer.tiref);
  const eventMap = new Map();
  pbs.forEach(pb => {
    const key = `${pb.stroke}|${pb.course}`;
    if (!eventMap.has(key) || (pb.wa_points || 0) > (eventMap.get(key).wa_points || 0))
      eventMap.set(key, pb);
  });
  const topEvents = [...eventMap.values()].sort((a, b) => (b.wa_points || 0) - (a.wa_points || 0)).slice(0, 4);
  const colors = [getColor(), COLORS.gold, COLORS.purple, COLORS.green];
  const years = [2023, 2024, 2025, 2026];

  const datasets = topEvents.map((ev, i) => {
    const data = years.map(y => {
      const r = ranks.find(rk => rk.event === ev.stroke && rk.course === ev.course && rk.year === y);
      return r ? { x: y, y: r.rank } : null;
    }).filter(Boolean);
    return {
      label: fmtEvent(ev.stroke, ev.course), data,
      borderColor: colors[i], backgroundColor: colors[i],
      pointRadius: 5, pointHoverRadius: 8, borderWidth: 2, tension: 0.3, spanGaps: true,
    };
  });

  destroyChart('rankProg');
  charts.rankProg = new Chart(document.getElementById('rankChart'), {
    type: 'line', data: { datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { type: 'linear', min: 2022.5, max: 2026.5,
             ticks: { stepSize: 1, color: COLORS.tick, callback: v => String(v) },
             grid: { color: COLORS.grid } },
        y: { reverse: true, title: { display: true, text: 'National Rank', color: COLORS.tick, font: { size: 10 } },
             grid: { color: COLORS.grid }, ticks: { color: COLORS.tick } },
      },
      plugins: {
        legend: { labels: { usePointStyle: true, pointStyle: 'circle', padding: 12, font: { size: 10 } } },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: #${ctx.raw.y} (${ctx.raw.x})` } },
      },
    },
  });
}

// ── Event Listeners ──────────────────────────────────────
document.getElementById('chartCourse')?.addEventListener('change', updateProgressChart);

// ── Start ────────────────────────────────────────────────
init();

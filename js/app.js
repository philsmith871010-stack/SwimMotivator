/* SwimMotivator v3 — Motivational Dashboard */

let CONFIG = {};
let ALL_PBS = [];
let ALL_RANKS = [];
let ALL_SQUAD = [];
let HISTORY = {};  // keyed by tiref
let activeSwimmer = 'bella';
let selectedEvent = null;  // { stroke, course }

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

    // Pre-load history for both swimmers
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

function getSwimmer() {
  return CONFIG.swimmers?.[activeSwimmer] || {};
}

function getSwimmerColor() {
  return activeSwimmer === 'bella' ? COLORS.bella : COLORS.amber;
}

function getSwimmerGlow() {
  return activeSwimmer === 'bella' ? COLORS.bellaGlow : COLORS.amberGlow;
}

// ── Swimmer Toggle ────────────────────────────────────────
function setupToggle() {
  document.querySelectorAll('.swimmer-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeSwimmer = btn.dataset.swimmer;
      document.querySelectorAll('.swimmer-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedEvent = null;
      refresh();
    });
  });
}

// ── Refresh Everything ────────────────────────────────────
function refresh() {
  const swimmer = getSwimmer();
  const tiref = swimmer.tiref;

  const pbs = ALL_PBS.filter(r => r.tiref === tiref);
  const ranks = ALL_RANKS.filter(r => r.tiref === tiref);
  const currentYearRanks = ranks.filter(r => r.year === 2026);
  const prevYearRanks = ranks.filter(r => r.year === 2025);

  updateHeroStats(pbs, currentYearRanks, prevYearRanks);
  updateRankings(pbs, ranks);
  if (selectedEvent) {
    updateProgressChart();
    updateGoals();
    updateSquad();
  }
  updateRankProgression(ranks);
}

// ── Hero Stats ────────────────────────────────────────────
function updateHeroStats(pbs, currentRanks, prevRanks) {
  // Best event by WA
  const bestPB = pbs.reduce((a, b) => ((a?.wa_points || 0) > (b?.wa_points || 0) ? a : b), null);
  if (bestPB) {
    const shortName = (bestPB.stroke || '').replace('stroke', '').replace('Individual Medley', 'IM');
    document.getElementById('statBestEvent').textContent = shortName;
    const rank = currentRanks.find(r => r.event === bestPB.stroke && r.course === bestPB.course);
    document.getElementById('statBestRank').textContent = rank ? `#${rank.rank} in England` : '';

    document.getElementById('statBestWA').textContent = bestPB.wa_points || '-';
    document.getElementById('statBestWAEvent').textContent = `${shortName} (${bestPB.course})`;
  }

  // Events ranked
  document.getElementById('statEventsRanked').textContent = currentRanks.length || '-';
  if (currentRanks.length) {
    const avgRank = Math.round(currentRanks.reduce((s, r) => s + r.rank, 0) / currentRanks.length);
    document.getElementById('statAvgRank').textContent = `Avg rank #${avgRank}`;
  } else {
    document.getElementById('statAvgRank').textContent = 'No 2026 rankings yet';
  }

  // Year progress — compare ranks between years
  let improvements = 0, total = 0;
  currentRanks.forEach(cr => {
    const pr = prevRanks.find(p => p.event === cr.event && p.course === cr.course);
    if (pr) {
      total++;
      if (cr.rank < pr.rank) improvements++;
    }
  });

  const trendEl = document.getElementById('statTrend');
  const trendDetailEl = document.getElementById('statTrendDetail');
  if (total > 0) {
    trendEl.textContent = `${improvements}/${total}`;
    trendEl.className = `stat-value ${improvements > total / 2 ? 'green' : 'red'}`;
    trendDetailEl.textContent = 'events improved rank';
  } else {
    trendEl.textContent = '-';
    trendEl.className = 'stat-value green';
    trendDetailEl.textContent = 'Need 2+ years of data';
  }
}

// ── Rankings List ─────────────────────────────────────────
function updateRankings(pbs, ranks) {
  const container = document.getElementById('rankingsList');

  // Build event list from PBs, enrich with rank data
  const eventMap = new Map();
  pbs.forEach(pb => {
    const key = `${pb.stroke}|${pb.course}`;
    if (!eventMap.has(key) || (pb.wa_points || 0) > (eventMap.get(key).wa_points || 0)) {
      eventMap.set(key, pb);
    }
  });

  const events = [...eventMap.values()]
    .sort((a, b) => (b.wa_points || 0) - (a.wa_points || 0))
    .map(pb => {
      const currentRank = ranks.find(r => r.event === pb.stroke && r.course === pb.course && r.year === 2026);
      const prevRank = ranks.find(r => r.event === pb.stroke && r.course === pb.course && r.year === 2025);
      let move = null, moveDir = 'same';
      if (currentRank && prevRank) {
        move = prevRank.rank - currentRank.rank;
        moveDir = move > 0 ? 'up' : move < 0 ? 'down' : 'same';
      }
      return { pb, currentRank, prevRank, move, moveDir };
    });

  if (!events.length) {
    container.innerHTML = '<div class="loading">No PB data available</div>';
    return;
  }

  // Auto-select first event if none selected
  if (!selectedEvent) {
    selectedEvent = { stroke: events[0].pb.stroke, course: events[0].pb.course };
    updateProgressChart();
    updateGoals();
    updateSquad();
  }

  let html = '';
  events.forEach(e => {
    const isSelected = selectedEvent &&
      selectedEvent.stroke === e.pb.stroke && selectedEvent.course === e.pb.course;
    const selClass = isSelected ? ' selected' : '';

    const shortEvent = formatEventName(e.pb.stroke, e.pb.course);
    const rank = e.currentRank?.rank;
    const badgeClass = rank ? (rank <= 50 ? 'gold' : rank <= 100 ? 'silver' : rank <= 250 ? 'cyan' : 'grey') : 'grey';
    const rankText = rank ? `#${rank}` : '-';

    let moveHtml = '';
    if (e.move !== null) {
      const arrow = e.moveDir === 'up' ? '&#9650;' : e.moveDir === 'down' ? '&#9660;' : '&#8212;';
      moveHtml = `<span class="rank-move ${e.moveDir}">${arrow}${Math.abs(e.move) || ''}</span>`;
    }

    html += `<div class="rank-row${selClass}" onclick="selectEvent('${e.pb.stroke}','${e.pb.course}')">
      <span class="rank-event">${shortEvent}</span>
      <span class="rank-time">${e.pb.time}</span>
      <span class="rank-badge ${badgeClass}">${rankText}</span>
      ${moveHtml}
    </div>`;
  });

  container.innerHTML = html;
}

function formatEventName(stroke, course) {
  let s = stroke.replace('Freestyle', 'Free').replace('Breaststroke', 'Breast')
    .replace('Butterfly', 'Fly').replace('Backstroke', 'Back')
    .replace('Individual Medley', 'IM');
  return `${s} ${course}`;
}

function selectEvent(stroke, course) {
  selectedEvent = { stroke, course };
  refresh();
}

// ── Progress Chart ────────────────────────────────────────
function updateProgressChart() {
  if (!selectedEvent) return;
  const swimmer = getSwimmer();
  const history = HISTORY[swimmer.tiref] || [];
  const courseFilter = document.getElementById('chartCourse').value;

  // Find the stroke code for this event
  const strokeNames = CONFIG.stroke_names || {};
  let strokeCode = null;
  for (const [code, name] of Object.entries(strokeNames)) {
    if (name === selectedEvent.stroke) { strokeCode = code; break; }
  }

  const courseMap = { SC: 'S', LC: 'L' };
  const historyCourse = courseMap[selectedEvent.course] || '';

  const filtered = history
    .filter(r => !strokeCode || String(r.stroke_code) === strokeCode)
    .filter(r => {
      if (courseFilter) return r.course === courseFilter;
      return !historyCourse || r.course === historyCourse;
    })
    .filter(r => r.time && Number.isFinite(parseTimeToSeconds(r.time)))
    .sort(sortByDate);

  const data = filtered.map(r => ({
    x: parseDate(r.date || ''),
    y: parseTimeToSeconds(r.time),
    isPb: Number(r.is_pb || 0) === 1,
    meetName: r.meet_name || '',
    rawDate: r.date || '',
    waPoints: r.wa_points,
  })).filter(p => p.x && Number.isFinite(p.y));

  const color = getSwimmerColor();
  const glow = getSwimmerGlow();

  destroyChart('progress');
  charts.progress = new Chart(document.getElementById('progressChart'), {
    type: 'line',
    data: {
      datasets: [{
        label: selectedEvent.stroke,
        data,
        borderColor: color,
        backgroundColor: glow,
        pointBackgroundColor: data.map(p => p.isPb ? COLORS.gold : color),
        pointRadius: data.map(p => p.isPb ? 7 : 3),
        pointHoverRadius: 9,
        borderWidth: 2.5,
        tension: 0.2,
        spanGaps: true,
        fill: true,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          type: 'time',
          time: { parser: 'dd/MM/yyyy', unit: 'month', displayFormats: { month: 'MMM yy' } },
          grid: { color: COLORS.grid },
          ticks: { color: COLORS.tick },
        },
        y: {
          reverse: true,
          grid: { color: COLORS.grid },
          ticks: { color: COLORS.tick, callback: v => formatSeconds(v) },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: ctx => ctx[0]?.raw?.meetName || '',
            label: ctx => {
              const p = ctx.raw;
              const lines = [`Time: ${formatSeconds(p.y)}`, `Date: ${p.rawDate}`];
              if (p.waPoints) lines.push(`WA: ${p.waPoints}`);
              if (p.isPb) lines.push('PB!');
              return lines;
            },
          },
        },
      },
    },
  });

  document.getElementById('chartTitle').textContent =
    `${formatEventName(selectedEvent.stroke, selectedEvent.course)} — Progress`;
}

// ── Goals ─────────────────────────────────────────────────
function updateGoals() {
  if (!selectedEvent) return;
  const container = document.getElementById('goalsContainer');
  const swimmer = getSwimmer();
  const ranks = ALL_RANKS.filter(r =>
    r.tiref === swimmer.tiref && r.event === selectedEvent.stroke &&
    r.course === selectedEvent.course && r.year === 2026);

  if (!ranks.length) {
    container.innerHTML = '<div style="color:var(--text-3);font-size:0.8rem">No ranking data for this event</div>';
    return;
  }

  const rank = ranks[0];
  const currentTime = parseTimeToSeconds(rank.time);
  if (!currentTime) {
    container.innerHTML = '<div style="color:var(--text-3);font-size:0.8rem">-</div>';
    return;
  }

  // Estimate times needed for milestone ranks
  // Rough heuristic: assume roughly linear distribution in the ranking range
  const milestones = [
    { label: 'Top 50', target: 50 },
    { label: 'Top 100', target: 100 },
    { label: 'Top 200', target: 200 },
  ].filter(m => m.target < rank.rank);

  let html = '';

  if (milestones.length === 0) {
    // Already in a good position
    html += `<div class="goal-row">
      <span class="goal-achieved">Already in top ${rank.rank}!</span>
    </div>`;
  }

  milestones.forEach(m => {
    // Estimate: each rank position ≈ proportional time drop
    // Very rough but motivational
    const ratio = m.target / rank.rank;
    const estimatedTime = currentTime * (0.95 + 0.05 * ratio);  // crude estimate
    const drop = currentTime - estimatedTime;

    html += `<div class="goal-row">
      <span class="goal-label">${m.label} in England</span>
      <span class="goal-time">~${formatSeconds(estimatedTime)}</span>
      <span class="goal-drop">drop ${drop.toFixed(2)}s</span>
    </div>`;
  });

  // Current position
  html += `<div class="goal-row">
    <span class="goal-label">Current: #${rank.rank}</span>
    <span class="goal-time">${rank.time}</span>
    <span class="goal-drop">&nbsp;</span>
  </div>`;

  container.innerHTML = html;
}

// ── Club Standings ────────────────────────────────────────
function updateSquad() {
  if (!selectedEvent) return;
  const container = document.getElementById('squadContainer');
  const titleEl = document.getElementById('clubEventTitle');
  const swimmer = getSwimmer();
  const swimmerYob = swimmer.yob;
  const ageMode = document.getElementById('ageGroupMode')?.value || 'exact';
  const range = ageMode === 'close' ? 1 : 0;
  const yobLabel = range ? `YoB ${swimmerYob - range}-${swimmerYob + range}` : `YoB ${swimmerYob}`;

  titleEl.textContent = `${formatEventName(selectedEvent.stroke, selectedEvent.course)} (${yobLabel})`;

  // Filter squad data for this event + age group peers
  const eventName = selectedEvent.stroke;
  let squadRows = ALL_SQUAD.filter(r => r.event === eventName);
  squadRows = squadRows
    .filter(r => r.yob && Math.abs(r.yob - swimmerYob) <= range)
    .filter(r => r.best_time && Number.isFinite(parseTimeToSeconds(r.best_time)))
    .sort((a, b) => parseTimeToSeconds(a.best_time) - parseTimeToSeconds(b.best_time));

  if (!squadRows.length) {
    container.innerHTML = '<div style="color:var(--text-3);font-size:0.8rem;padding:1rem">No club data for this event</div>';
    return;
  }

  const bellaId = String(CONFIG.swimmers.bella.tiref);
  const amberId = String(CONFIG.swimmers.amber.tiref);
  const targetId = String(swimmer.tiref);

  let html = '';
  squadRows.forEach((r, i) => {
    const pos = i + 1;
    const isTarget = String(r.tiref) === targetId;
    const isBella = String(r.tiref) === bellaId;
    const isAmber = String(r.tiref) === amberId;
    const targetClass = isTarget ? ` is-target ${activeSwimmer}` : '';
    const posClass = pos <= 3 ? ` p${pos}` : '';

    html += `<div class="squad-row${targetClass}">
      <span class="squad-pos${posClass}">${pos}</span>
      <span class="squad-name">${r.swimmer_name || '-'}</span>
      <span class="squad-time">${r.best_time}</span>
    </div>`;
  });

  container.innerHTML = html;

  // Scroll target into view within the squad list only (not the whole page)
  setTimeout(() => {
    const target = container.querySelector('.is-target');
    if (target) {
      const containerRect = container.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const offset = targetRect.top - containerRect.top - containerRect.height / 2;
      container.scrollTop += offset;
    }
  }, 100);
}

// ── Rank Progression Chart ────────────────────────────────
function updateRankProgression(ranks) {
  const swimmer = getSwimmer();

  // Get top 4 events by best WA from PBs
  const pbs = ALL_PBS.filter(r => r.tiref === swimmer.tiref);
  const eventMap = new Map();
  pbs.forEach(pb => {
    const key = `${pb.stroke}|${pb.course}`;
    if (!eventMap.has(key) || (pb.wa_points || 0) > (eventMap.get(key).wa_points || 0)) {
      eventMap.set(key, pb);
    }
  });
  const topEvents = [...eventMap.values()]
    .sort((a, b) => (b.wa_points || 0) - (a.wa_points || 0))
    .slice(0, 4);

  const eventColors = [getSwimmerColor(), COLORS.gold, COLORS.purple, COLORS.green];
  const years = [2023, 2024, 2025, 2026];

  const datasets = topEvents.map((ev, i) => {
    const data = years.map(year => {
      const r = ranks.find(rk =>
        rk.event === ev.stroke && rk.course === ev.course && rk.year === year);
      return r ? { x: year, y: r.rank } : null;
    }).filter(Boolean);

    return {
      label: formatEventName(ev.stroke, ev.course),
      data,
      borderColor: eventColors[i],
      backgroundColor: eventColors[i],
      pointRadius: 5,
      pointHoverRadius: 8,
      borderWidth: 2,
      tension: 0.3,
      spanGaps: true,
    };
  });

  destroyChart('rankProg');
  charts.rankProg = new Chart(document.getElementById('rankChart'), {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          type: 'linear',
          min: 2022.5, max: 2026.5,
          ticks: { stepSize: 1, color: COLORS.tick, callback: v => String(v) },
          grid: { color: COLORS.grid },
        },
        y: {
          reverse: true,
          title: { display: true, text: 'National Rank', color: COLORS.tick, font: { size: 10 } },
          grid: { color: COLORS.grid },
          ticks: { color: COLORS.tick },
        },
      },
      plugins: {
        legend: {
          labels: { usePointStyle: true, pointStyle: 'circle', padding: 12, font: { size: 10 } },
        },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.dataset.label}: #${ctx.raw.y} (${ctx.raw.x})`,
          },
        },
      },
    },
  });
}

// ── Event Listeners ──────────────────────────────────────
document.getElementById('chartCourse')?.addEventListener('change', updateProgressChart);
document.getElementById('ageGroupMode')?.addEventListener('change', updateSquad);

// ── Start ────────────────────────────────────────────────
init();

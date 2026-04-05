/* SwimMotivator v5 — Multi-level Dashboard with Tabs */

let CONFIG = {};
let ALL_PBS = [];
let ALL_RANKS = [];
let ALL_SQUAD = [];
let ALL_SWIMMERS = [];  // [{tiref, name, yob}] — built from squad.json
let HISTORY = {};  // keyed by tiref (string)
let activeSwimmer = null;  // {tiref, name, yob} — current swimmer object
let selectedEvent = null;
let comparators = [];  // [{tiref, name, color}] — max 3
const COMP_COLORS = ['#69f0ae', '#b388ff', '#ffab40'];
const BELLA_TIREF = '1373165';
const AMBER_TIREF = '1479966';

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

    // Build unique swimmer list from squad data
    const swimmerMap = new Map();
    ALL_SQUAD.forEach(r => {
      const tid = String(r.tiref);
      if (!swimmerMap.has(tid)) {
        swimmerMap.set(tid, { tiref: tid, name: r.swimmer_name || 'Unknown', yob: r.yob });
      }
    });
    ALL_SWIMMERS = [...swimmerMap.values()].sort((a, b) => a.name.localeCompare(b.name));

    // Default to Bella
    const defaultSwimmer = ALL_SWIMMERS.find(s => s.tiref === BELLA_TIREF) || ALL_SWIMMERS[0];
    activeSwimmer = defaultSwimmer;

    // Load history for default swimmer
    await loadHistory(activeSwimmer.tiref);

    setupSwimmerSelect();
    refresh();
    setStatus('Ready', true);
  } catch (err) {
    setStatus(`Error: ${err.message}`);
    console.error(err);
  }
}

async function loadHistory(tiref) {
  tiref = String(tiref);
  if (HISTORY[tiref]) return HISTORY[tiref];
  try {
    const h = await fetchJSON(`history/${tiref}.json`);
    HISTORY[tiref] = h;
    return h;
  } catch {
    HISTORY[tiref] = [];
    return [];
  }
}

function setStatus(msg, ok = false) {
  const el = document.getElementById('statusText');
  el.textContent = msg;
  el.className = ok ? 'connected' : '';
}

function getSwimmer() { return activeSwimmer || {}; }
function getColor() {
  if (!activeSwimmer) return COLORS.amber;
  if (String(activeSwimmer.tiref) === BELLA_TIREF) return COLORS.bella;
  if (String(activeSwimmer.tiref) === AMBER_TIREF) return COLORS.amber;
  return COLORS.purple;
}
function getGlow() {
  if (!activeSwimmer) return COLORS.amberGlow;
  if (String(activeSwimmer.tiref) === BELLA_TIREF) return COLORS.bellaGlow;
  if (String(activeSwimmer.tiref) === AMBER_TIREF) return COLORS.amberGlow;
  return 'rgba(179, 136, 255, 0.25)';
}

// ── Swimmer Select Dropdown ───────────────────────────────
function setupSwimmerSelect() {
  const searchInput = document.getElementById('swimmerSearch');
  const dropdown = document.getElementById('swimmerDropdown');

  updateSearchInputStyle();

  // Build dropdown HTML with search box + swimmer list
  function renderDropdown(filter = '') {
    const lc = filter.toLowerCase();
    const filtered = lc ? ALL_SWIMMERS.filter(s => s.name.toLowerCase().includes(lc)) : ALL_SWIMMERS;

    // Group by YOB
    const groups = {};
    filtered.forEach(s => {
      const yob = s.yob || '?';
      if (!groups[yob]) groups[yob] = [];
      groups[yob].push(s);
    });

    let html = '<input type="text" class="dd-search" id="ddSearchInput" placeholder="Type to filter...">';
    const yobs = Object.keys(groups).sort((a, b) => Number(a) - Number(b));
    yobs.forEach(yob => {
      html += `<div class="dd-group-label">Born ${yob}</div>`;
      groups[yob].forEach(s => {
        const isActive = activeSwimmer && String(s.tiref) === String(activeSwimmer.tiref);
        html += `<div class="dd-item${isActive ? ' active' : ''}" data-tiref="${s.tiref}">
          <span>${s.name}</span>
          <span class="dd-yob">${s.yob || ''}</span>
        </div>`;
      });
    });

    if (!filtered.length) html += '<div style="padding:1rem;color:var(--text-3);font-size:0.8rem;text-align:center">No matches</div>';
    dropdown.innerHTML = html;

    // Wire up search within dropdown
    const ddSearch = document.getElementById('ddSearchInput');
    if (ddSearch) {
      ddSearch.value = filter;
      ddSearch.focus();
      ddSearch.addEventListener('input', () => renderDropdown(ddSearch.value));
    }

    // Wire up item clicks
    dropdown.querySelectorAll('.dd-item').forEach(item => {
      item.addEventListener('click', async () => {
        const tiref = item.dataset.tiref;
        const swimmer = ALL_SWIMMERS.find(s => String(s.tiref) === tiref);
        if (swimmer) {
          await selectSwimmer(swimmer);
          closeDropdown();
        }
      });
    });
  }

  function openDropdown() {
    renderDropdown('');
    dropdown.classList.add('open');
    searchInput.classList.add('open');
  }

  function closeDropdown() {
    dropdown.classList.remove('open');
    searchInput.classList.remove('open');
  }

  searchInput.addEventListener('click', (e) => {
    e.stopPropagation();
    if (dropdown.classList.contains('open')) closeDropdown();
    else openDropdown();
  });

  dropdown.addEventListener('click', (e) => e.stopPropagation());

  document.addEventListener('click', () => closeDropdown());
}

async function selectSwimmer(swimmer) {
  activeSwimmer = swimmer;
  selectedEvent = null;
  comparators = [];
  setStatus('Loading...');
  await loadHistory(swimmer.tiref);
  updateSearchInputStyle();
  refresh();
  setStatus('Ready', true);
}

function updateSearchInputStyle() {
  const input = document.getElementById('swimmerSearch');
  if (!activeSwimmer) return;
  input.value = activeSwimmer.name;
  input.classList.remove('has-bella', 'has-amber', 'has-other');
  if (String(activeSwimmer.tiref) === BELLA_TIREF) input.classList.add('has-bella');
  else if (String(activeSwimmer.tiref) === AMBER_TIREF) input.classList.add('has-amber');
  else input.classList.add('has-other');
}

// ── Refresh ───────────────────────────────────────────────
function refresh() {
  const swimmer = getSwimmer();
  const tiref = swimmer.tiref;
  const history = HISTORY[tiref] || [];

  // Use official PBs if available, otherwise derive from history
  let pbs = ALL_PBS.filter(r => String(r.tiref) === String(tiref));
  if (!pbs.length && history.length) {
    pbs = derivePBsFromHistory(history, tiref, swimmer.name, swimmer.yob);
  }

  const ranks = ALL_RANKS.filter(r => String(r.tiref) === String(tiref));
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

// Derive PB records from history data (for swimmers without official PB data)
function derivePBsFromHistory(history, tiref, name, yob) {
  const strokeNames = CONFIG.stroke_names || {};
  const courseLabels = { S: 'SC', L: 'LC' };
  const best = {};

  history.forEach(r => {
    const strokeName = strokeNames[String(r.stroke_code)];
    if (!strokeName) return;
    const course = courseLabels[r.course] || r.course;
    const key = `${strokeName}|${course}`;
    const time = parseTimeToSeconds(r.time);
    if (!time || !Number.isFinite(time)) return;

    if (!best[key] || time < parseTimeToSeconds(best[key].time)) {
      best[key] = {
        tiref: tiref,
        course: course,
        stroke: strokeName,
        time: r.time,
        wa_points: parseInt(r.wa_points) || 0,
        date: r.date,
        meet: r.meet_name,
        swimmer_name: name,
        yob: yob,
      };
    }
  });

  return Object.values(best);
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
  const bestPB = pbs.length ? pbs.reduce((a, b) => ((a?.wa_points || 0) > (b?.wa_points || 0) ? a : b), null) : null;
  if (bestPB) {
    document.getElementById('statBestEvent').textContent = fmtEvent(bestPB.stroke, bestPB.course);
    const rank = cur.find(r => r.event === bestPB.stroke && r.course === bestPB.course);
    document.getElementById('statBestRank').textContent = rank ? `#${rank.rank} in England` : bestPB.time;
  } else {
    document.getElementById('statBestEvent').textContent = '-';
    document.getElementById('statBestRank').textContent = '';
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

  // Events ranked (or total events if no ranking data)
  if (cur.length) {
    document.getElementById('statEventsRanked').textContent = cur.length;
    const avg = Math.round(cur.reduce((s, r) => s + r.rank, 0) / cur.length);
    document.getElementById('statAvgRank').textContent = `Avg rank #${avg}`;
    document.querySelector('.stat-card:nth-child(3) .stat-label').textContent = 'Events Ranked';
  } else {
    const eventCount = new Set(pbs.map(p => `${p.stroke}|${p.course}`)).size;
    document.getElementById('statEventsRanked').textContent = eventCount || '-';
    document.getElementById('statAvgRank').textContent = eventCount ? 'active events' : '';
    document.querySelector('.stat-card:nth-child(3) .stat-label').textContent = 'Events Swum';
  }

  // Ranks improved (or best WA if no ranking data)
  const trendEl = document.getElementById('statTrend');
  if (cur.length) {
    let improved = 0, total = 0;
    cur.forEach(cr => {
      const pr = prev.find(p => p.event === cr.event && p.course === cr.course);
      if (pr) { total++; if (cr.rank < pr.rank) improved++; }
    });
    trendEl.textContent = total > 0 ? `${improved}/${total}` : '-';
    trendEl.className = `stat-value ${improved > total / 2 ? 'green' : 'red'}`;
    document.getElementById('statTrendDetail').textContent = total > 0 ? 'events improved' : '';
    document.querySelector('.stat-card:nth-child(4) .stat-label').textContent = 'Ranks Improved';
  } else {
    const bestWA = pbs.reduce((max, p) => Math.max(max, p.wa_points || 0), 0);
    trendEl.textContent = bestWA || '-';
    trendEl.className = 'stat-value green';
    document.getElementById('statTrendDetail').textContent = bestWA ? 'best WA points' : '';
    document.querySelector('.stat-card:nth-child(4) .stat-label').textContent = 'Best WA Points';
  }
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
    const h = await loadHistory(comp.tiref);
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
  ranks = ranks || ALL_RANKS.filter(r => String(r.tiref) === String(swimmer.tiref));
  history = history || HISTORY[swimmer.tiref] || [];

  const rank = ranks.find(r =>
    String(r.tiref) === String(swimmer.tiref) && r.event === selectedEvent.stroke &&
    r.course === selectedEvent.course && r.year === 2026);

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

  // Get current PB time for this event
  const pb = ALL_PBS.find(p =>
    String(p.tiref) === String(swimmer.tiref) && p.stroke === selectedEvent.stroke && p.course === selectedEvent.course);
  const currentTime = rank ? parseTimeToSeconds(rank.time) : (pb ? parseTimeToSeconds(pb.time) : null);

  if (!currentTime && !eventHistory.length) {
    container.innerHTML = '<div style="color:var(--text-3);font-size:0.8rem">No data for this event</div>';
    return;
  }

  let html = '';

  // Show ranking milestones if we have ranking data
  if (rank) {
    const milestones = [
      { label: 'Top 50', target: 50 },
      { label: 'Top 100', target: 100 },
      { label: 'Top 200', target: 200 },
    ].filter(m => m.target < rank.rank);

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
  } else {
    // No ranking data — show history-based progression info
    if (currentTime) {
      html += `<div class="goal-row">
        <span class="goal-label">Current PB</span>
        <span class="goal-time">${formatSeconds(currentTime)}</span>
        <span class="goal-drop">${ratePerMonth && ratePerMonth > 0 ? `improving ${ratePerMonth.toFixed(2)}s/month` : ''}</span>
      </div>`;
    }

    // Total drop from first to last swim
    if (eventHistory.length >= 2) {
      const firstTime = parseTimeToSeconds(eventHistory[0].time);
      const lastTime = parseTimeToSeconds(eventHistory[eventHistory.length - 1].time);
      if (firstTime && lastTime) {
        const totalDrop = firstTime - lastTime;
        html += `<div class="goal-row">
          <span class="goal-label">Total improvement</span>
          <span class="goal-time">${formatSeconds(firstTime)} &rarr; ${formatSeconds(lastTime)}</span>
          <span class="goal-drop">${totalDrop > 0 ? `dropped ${totalDrop.toFixed(2)}s` : ''}</span>
        </div>`;
      }
    }

    // Season PBs in this event
    const seasonPBs = eventHistory.filter(r => Number(r.is_pb) === 1 && isCurrentSeason(r.date));
    html += `<div class="goal-row">
      <span class="goal-label">Swims this event</span>
      <span class="goal-time">${eventHistory.length} total</span>
      <span class="goal-drop">${seasonPBs.length ? `${seasonPBs.length} PB${seasonPBs.length > 1 ? 's' : ''} this season` : ''}</span>
    </div>`;

    // Projected time at current improvement rate
    if (ratePerMonth && ratePerMonth > 0 && currentTime) {
      const projectedTime = currentTime - (ratePerMonth * 6);
      html += `<div class="goal-row">
        <span class="goal-label">6-month projection</span>
        <span class="goal-time goal-achieved">${formatSeconds(projectedTime)}</span>
        <span class="goal-drop"><span class="goal-date">at current rate</span></span>
      </div>`;
    }
  }

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

  const targetId = String(swimmer.tiref);
  const compTirefs = new Set(comparators.map(c => c.tiref));

  let html = '';
  squadRows.forEach((r, i) => {
    const pos = i + 1;
    const tid = String(r.tiref);
    const isTarget = tid === targetId;
    const isComp = compTirefs.has(tid);
    const comp = comparators.find(c => c.tiref === tid);
    const targetCls = isTarget ? ' is-target' : '';
    const compCls = isComp ? ' is-compared' : '';
    const posCls = pos <= 3 ? ` p${pos}` : '';
    const dotColor = isTarget ? getColor() : comp ? comp.color : 'transparent';
    const targetStyle = isTarget ? ` style="color:${getColor()}"` : '';
    const canClick = !isTarget;

    html += `<div class="squad-row${targetCls}${compCls}"${targetStyle} ${canClick ? `onclick="toggleComparator('${tid}','${r.swimmer_name || 'Swimmer'}')"` : ''}>
      <span class="squad-pos${posCls}">${pos}</span>
      <span class="squad-color-dot" style="background:${dotColor}"></span>
      <span class="squad-name">${r.swimmer_name || '-'}</span>
      <span class="squad-time">${r.best_time}</span>
    </div>`;
  });

  container.innerHTML = html;
}

// ── Rank / WA Progression Chart ──────────────────────────
function updateRankProgression(ranks, pbs) {
  const swimmer = getSwimmer();
  pbs = pbs || ALL_PBS.filter(r => String(r.tiref) === String(swimmer.tiref));
  const eventMap = new Map();
  pbs.forEach(pb => {
    const key = `${pb.stroke}|${pb.course}`;
    if (!eventMap.has(key) || (pb.wa_points || 0) > (eventMap.get(key).wa_points || 0))
      eventMap.set(key, pb);
  });
  const topEvents = [...eventMap.values()].sort((a, b) => (b.wa_points || 0) - (a.wa_points || 0)).slice(0, 4);
  const colors = [getColor(), COLORS.gold, COLORS.purple, COLORS.green];

  const hasRanks = ranks.length > 0;
  const chartTitle = document.querySelector('.chart-short')?.closest('.card')?.querySelector('.card-title');

  if (hasRanks) {
    // Show rank progression by year
    if (chartTitle) chartTitle.textContent = 'Rank Progression';
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
  } else {
    // No ranking data — show best WA points over time from history
    if (chartTitle) chartTitle.textContent = 'Best WA Points Progression';
    const history = HISTORY[swimmer.tiref] || [];
    const strokeNames = CONFIG.stroke_names || {};
    const courseLabels = { S: 'SC', L: 'LC' };

    const datasets = topEvents.map((ev, i) => {
      let evStrokeCode = null;
      for (const [code, name] of Object.entries(strokeNames)) {
        if (name === ev.stroke) { evStrokeCode = code; break; }
      }
      const evCourse = ev.course === 'SC' ? 'S' : ev.course === 'LC' ? 'L' : ev.course;

      // Get PB swims for this event over time
      const pbSwims = history
        .filter(r => String(r.stroke_code) === evStrokeCode && r.course === evCourse && Number(r.is_pb) === 1)
        .filter(r => parseInt(r.wa_points) > 0)
        .sort(sortByDate)
        .map(r => ({ x: parseDate(r.date), y: parseInt(r.wa_points) }))
        .filter(p => p.x);

      return {
        label: fmtEvent(ev.stroke, ev.course), data: pbSwims,
        borderColor: colors[i], backgroundColor: colors[i],
        pointRadius: 5, pointHoverRadius: 8, borderWidth: 2, tension: 0.3, spanGaps: true,
      };
    }).filter(ds => ds.data.length > 0);

    destroyChart('rankProg');
    charts.rankProg = new Chart(document.getElementById('rankChart'), {
      type: 'line', data: { datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: { type: 'time', time: { unit: 'month', displayFormats: { month: 'MMM yy' } },
               grid: { color: COLORS.grid }, ticks: { color: COLORS.tick } },
          y: { title: { display: true, text: 'WA Points', color: COLORS.tick, font: { size: 10 } },
               grid: { color: COLORS.grid }, ticks: { color: COLORS.tick } },
        },
        plugins: {
          legend: { labels: { usePointStyle: true, pointStyle: 'circle', padding: 12, font: { size: 10 } } },
          tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.raw.y} WA` } },
        },
      },
    });
  }
}

// ── Tab Navigation ──────────────────────────────────────
let activeTab = 'dashboard';

function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

function switchTab(tab) {
  activeTab = tab;

  // Update tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });

  // Update panels
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.remove('active');
  });

  const panelMap = {
    dashboard: 'panelDashboard',
    club: 'panelClub',
    national: 'panelNational',
    training: 'panelTraining',
    county: 'panelCounty',
    region: 'panelRegion',
  };
  const panel = document.getElementById(panelMap[tab]);
  if (panel) panel.classList.add('active');

  // Render tab content
  if (tab === 'club') renderClubTab();
  if (tab === 'national') renderNationalTab();
  if (tab === 'training' && typeof renderTrainingTab === 'function') renderTrainingTab();
}

// ── Club Tab ─────────────────────────────────────────────
let clubInitialized = false;

function initClubFilters() {
  if (clubInitialized) return;
  clubInitialized = true;

  const eventSelect = document.getElementById('clubEventFilter');
  const events = [...new Set(ALL_SQUAD.map(r => r.event))].sort();
  events.forEach(ev => {
    const opt = document.createElement('option');
    opt.value = ev;
    opt.textContent = ev;
    eventSelect.appendChild(opt);
  });

  // Age filter from swimmer YoBs
  const ageSelect = document.getElementById('clubAgeFilter');
  const yobs = [...new Set(ALL_SQUAD.map(r => r.yob).filter(Boolean))].sort();
  yobs.forEach(yob => {
    const opt = document.createElement('option');
    opt.value = yob;
    opt.textContent = `Born ${yob}`;
    ageSelect.appendChild(opt);
  });

  // Wire up filter changes
  ['clubEventFilter', 'clubCourseFilter', 'clubAgeFilter', 'clubSexFilter'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', renderClubLeaderboard);
  });

  // Default to first event
  if (events.length) {
    eventSelect.value = events[0];
  }
}

function renderClubTab() {
  initClubFilters();
  renderClubStats();
  renderClubLeaderboard();
}

function renderClubStats() {
  // Unique swimmers
  const swimmerSet = new Set();
  ALL_SQUAD.forEach(r => swimmerSet.add(String(r.tiref)));
  document.getElementById('clubStatSwimmers').textContent = swimmerSet.size;

  // Count by sex
  const sexCount = {};
  ALL_SWIMMERS.forEach(s => {
    // Determine sex from squad data
    const sq = ALL_SQUAD.find(r => String(r.tiref) === s.tiref);
    if (sq && sq.sex) sexCount[sq.sex] = (sexCount[sq.sex] || 0) + 1;
  });
  const detailParts = [];
  if (sexCount.F) detailParts.push(`${sexCount.F} girls`);
  if (sexCount.M) detailParts.push(`${sexCount.M} boys`);
  document.getElementById('clubStatSwimmersDetail').textContent = detailParts.join(', ') || 'active swimmers';

  // Season PBs across club
  let totalPBs = 0;
  let pbSwimmers = new Set();
  for (const [tiref, history] of Object.entries(HISTORY)) {
    const seasonPBs = history.filter(r => Number(r.is_pb) === 1 && isCurrentSeason(r.date));
    totalPBs += seasonPBs.length;
    if (seasonPBs.length) pbSwimmers.add(tiref);
  }
  document.getElementById('clubStatPBs').textContent = totalPBs || '-';
  document.getElementById('clubStatPBsDetail').textContent = pbSwimmers.size ? `by ${pbSwimmers.size} swimmers` : 'this season';

  // Events covered
  const eventSet = new Set(ALL_SQUAD.map(r => r.event));
  document.getElementById('clubStatEvents').textContent = eventSet.size;
  document.getElementById('clubStatEventsDetail').textContent = 'across all swimmers';

  // Top WA
  let topWA = 0, topWASwimmer = '';
  ALL_SQUAD.forEach(r => {
    if ((r.best_wa || 0) > topWA) {
      topWA = r.best_wa;
      topWASwimmer = r.swimmer_name || '';
    }
  });
  document.getElementById('clubStatTopWA').textContent = topWA || '-';
  document.getElementById('clubStatTopWADetail').textContent = topWASwimmer;
}

function renderClubLeaderboard() {
  const container = document.getElementById('clubLeaderboard');
  const titleEl = document.getElementById('clubLeaderboardTitle');
  const event = document.getElementById('clubEventFilter').value;
  const ageFilter = document.getElementById('clubAgeFilter').value;
  const sexFilter = document.getElementById('clubSexFilter').value;

  if (!event) {
    container.innerHTML = '<div class="club-empty-state">Select an event above to see club rankings</div>';
    titleEl.textContent = 'Select an event';
    renderClubChart([]);
    return;
  }

  let rows = ALL_SQUAD.filter(r => r.event === event);
  if (ageFilter) rows = rows.filter(r => String(r.yob) === ageFilter);
  if (sexFilter) {
    // Need to determine sex - check personal_bests or use swimmer data
    const sexMap = {};
    ALL_PBS.forEach(p => { if (p.sex) sexMap[String(p.tiref)] = p.sex; });
    ALL_SQUAD.forEach(r => { if (r.sex) sexMap[String(r.tiref)] = r.sex; });
    rows = rows.filter(r => sexMap[String(r.tiref)] === sexFilter);
  }

  rows = rows.filter(r => r.best_time && Number.isFinite(parseTimeToSeconds(r.best_time)));
  rows.sort((a, b) => parseTimeToSeconds(a.best_time) - parseTimeToSeconds(b.best_time));

  const label = event.replace('Freestyle', 'Free').replace('Breaststroke', 'Breast')
    .replace('Butterfly', 'Fly').replace('Backstroke', 'Back').replace('Individual Medley', 'IM');
  titleEl.textContent = label + (ageFilter ? ` (Born ${ageFilter})` : ' (All Ages)');

  if (!rows.length) {
    container.innerHTML = '<div class="club-empty-state">No swimmers found for this event</div>';
    renderClubChart([]);
    return;
  }

  const targetId = activeSwimmer ? String(activeSwimmer.tiref) : '';

  let html = '';
  rows.forEach((r, i) => {
    const pos = i + 1;
    const tid = String(r.tiref);
    const isMe = tid === targetId;
    const posCls = pos <= 3 ? ` p${pos}` : '';
    const rowCls = isMe ? ' is-highlighted' : '';

    html += `<div class="club-lb-row${rowCls}" onclick="switchToSwimmerDashboard('${tid}')">
      <span class="club-lb-pos${posCls}">${pos}</span>
      <span class="club-lb-name">${r.swimmer_name || '-'}</span>
      <span class="club-lb-yob">${r.yob || ''}</span>
      <span class="club-lb-time">${r.best_time}</span>
      <span class="club-lb-wa">${r.best_wa || '-'}</span>
    </div>`;
  });

  container.innerHTML = html;
  renderClubChart(rows.slice(0, 5));
}

async function renderClubChart(topRows) {
  destroyChart('clubTop');
  const canvas = document.getElementById('clubChart');
  if (!canvas || !topRows.length) return;

  const chartColors = [COLORS.amber, COLORS.gold, COLORS.purple, COLORS.green, COLORS.bella];
  const datasets = [];

  for (let i = 0; i < topRows.length; i++) {
    const r = topRows[i];
    const tiref = String(r.tiref);
    const history = await loadHistory(tiref);

    const strokeNames = CONFIG.stroke_names || {};
    let strokeCode = null;
    for (const [code, name] of Object.entries(strokeNames)) {
      if (name === r.event) { strokeCode = code; break; }
    }

    const eventSwims = history
      .filter(h => String(h.stroke_code) === strokeCode)
      .filter(h => h.time && Number.isFinite(parseTimeToSeconds(h.time)))
      .sort(sortByDate)
      .map(h => ({
        x: parseDate(h.date),
        y: parseTimeToSeconds(h.time),
      }))
      .filter(p => p.x);

    if (eventSwims.length) {
      datasets.push({
        label: r.swimmer_name || `#${i + 1}`,
        data: eventSwims,
        borderColor: chartColors[i],
        backgroundColor: chartColors[i] + '22',
        pointRadius: 3,
        pointHoverRadius: 6,
        borderWidth: 2,
        tension: 0.3,
        spanGaps: true,
        fill: false,
      });
    }
  }

  if (!datasets.length) return;

  charts.clubTop = new Chart(canvas, {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: {
          type: 'time',
          time: { parser: 'dd/MM/yyyy', unit: 'month', displayFormats: { month: 'MMM yy' } },
          grid: { color: COLORS.grid }, ticks: { color: COLORS.tick },
        },
        y: {
          reverse: true,
          grid: { color: COLORS.grid },
          ticks: { color: COLORS.tick, callback: v => formatSeconds(v) },
        },
      },
      plugins: {
        legend: { labels: { usePointStyle: true, pointStyle: 'circle', padding: 12, font: { size: 10 } } },
        tooltip: {
          callbacks: { label: ctx => `${ctx.dataset.label}: ${formatSeconds(ctx.raw.y)}` },
        },
      },
    },
  });
}

function switchToSwimmerDashboard(tiref) {
  const swimmer = ALL_SWIMMERS.find(s => String(s.tiref) === tiref);
  if (swimmer) {
    selectSwimmer(swimmer);
    switchTab('dashboard');
  }
}

// ── National Tab ─────────────────────────────────────────
function renderNationalTab() {
  if (!activeSwimmer) return;
  const swimmer = activeSwimmer;
  const tiref = String(swimmer.tiref);
  const ranks = ALL_RANKS.filter(r => String(r.tiref) === tiref);
  const year = parseInt(document.getElementById('natYearFilter').value) || 2026;
  const curRanks = ranks.filter(r => r.year === year);
  const prevRanks = ranks.filter(r => r.year === year - 1);

  document.getElementById('natSwimmerName').textContent = swimmer.name;

  // Stats
  if (curRanks.length) {
    const rankedOnly = curRanks.filter(r => r.rank != null);
    const bestRank = rankedOnly.length ? rankedOnly.reduce((min, r) => r.rank < min.rank ? r : min, rankedOnly[0]) : null;
    document.getElementById('natStatBestRank').textContent = bestRank ? `#${bestRank.rank}` : '-';
    document.getElementById('natStatBestRankDetail').textContent =
      bestRank ? fmtEvent(bestRank.event, bestRank.course) : 'Times recorded';

    document.getElementById('natStatEventsRanked').textContent = rankedOnly.length || curRanks.length;
    document.getElementById('natStatEventsRankedDetail').textContent = `in ${year}`;

    const avgRank = rankedOnly.length ? Math.round(rankedOnly.reduce((s, r) => s + r.rank, 0) / rankedOnly.length) : null;
    document.getElementById('natStatAvgRank').textContent = avgRank ? `#${avgRank}` : '-';
    document.getElementById('natStatAvgRankDetail').textContent = rankedOnly.length ? 'across all events' : '';

    let improved = 0, total = 0;
    curRanks.forEach(cr => {
      const pr = prevRanks.find(p => p.event === cr.event && p.course === cr.course);
      if (pr) { total++; if (cr.rank < pr.rank) improved++; }
    });
    document.getElementById('natStatImproved').textContent = total > 0 ? `${improved}/${total}` : '-';
    document.getElementById('natStatImproved').className =
      `stat-value ${improved > total / 2 ? 'green' : total > 0 ? 'red' : 'green'}`;
    document.getElementById('natStatImprovedDetail').textContent =
      total > 0 ? `vs ${year - 1}` : '';
  } else {
    document.getElementById('natStatBestRank').textContent = '-';
    document.getElementById('natStatBestRankDetail').textContent = 'No ranking data';
    document.getElementById('natStatEventsRanked').textContent = '-';
    document.getElementById('natStatEventsRankedDetail').textContent = '';
    document.getElementById('natStatAvgRank').textContent = '-';
    document.getElementById('natStatAvgRankDetail').textContent = '';
    document.getElementById('natStatImproved').textContent = '-';
    document.getElementById('natStatImprovedDetail').textContent = '';
  }

  // Rankings list
  renderNationalRankingsList(curRanks, prevRanks, year);

  // Rank progression chart
  renderNationalRankChart(ranks);

  // Year-on-year comparison
  renderNationalYoY(curRanks, prevRanks, year);
}

function renderNationalRankingsList(curRanks, prevRanks, year) {
  const container = document.getElementById('nationalRankingsList');

  if (!curRanks.length) {
    // Try to show PB-based info instead
    const swimmer = activeSwimmer;
    const pbs = ALL_PBS.filter(r => String(r.tiref) === String(swimmer.tiref));
    const history = HISTORY[swimmer.tiref] || [];
    const derivedPbs = pbs.length ? pbs : derivePBsFromHistory(history, swimmer.tiref, swimmer.name, swimmer.yob);

    if (derivedPbs.length) {
      let html = '<div style="padding:0.5rem 0.75rem;color:var(--text-3);font-size:0.75rem;margin-bottom:0.5rem">' +
        'National ranking data will be available after the overnight data load. Showing current PBs:</div>';
      derivedPbs
        .sort((a, b) => (b.wa_points || 0) - (a.wa_points || 0))
        .forEach(pb => {
          html += `<div class="nat-rank-row">
            <span class="nat-rank-event">${fmtEvent(pb.stroke, pb.course)}</span>
            <span class="nat-rank-time">${pb.time}</span>
            <span class="nat-rank-badge other">${pb.wa_points || '-'} WA</span>
            <span class="nat-rank-move same"></span>
          </div>`;
        });
      container.innerHTML = html;
    } else {
      container.innerHTML = '<div class="club-empty-state">No ranking data available yet.<br>Rankings will populate after the overnight data load.</div>';
    }
    return;
  }

  const sorted = [...curRanks].sort((a, b) => {
    if (a.rank == null && b.rank == null) return 0;
    if (a.rank == null) return 1;
    if (b.rank == null) return -1;
    return a.rank - b.rank;
  });
  let html = '';
  sorted.forEach(r => {
    const hasRank = r.rank != null;
    const badgeCls = !hasRank ? 'other' : r.rank <= 50 ? 'top50' : r.rank <= 100 ? 'top100' :
      r.rank <= 250 ? 'top250' : r.rank <= 500 ? 'top500' : 'other';

    const prev = prevRanks.find(p => p.event === r.event && p.course === r.course);
    let moveHtml = '';
    if (prev && hasRank && prev.rank != null) {
      const diff = prev.rank - r.rank;
      const dir = diff > 0 ? 'up' : diff < 0 ? 'down' : 'same';
      const arrow = dir === 'up' ? '&#9650;' : dir === 'down' ? '&#9660;' : '&#8212;';
      moveHtml = `<span class="nat-rank-move ${dir}">${arrow}${Math.abs(diff) || ''}</span>`;
    } else if (!prev) {
      moveHtml = '<span class="nat-rank-move same">NEW</span>';
    } else {
      moveHtml = '<span class="nat-rank-move same">&#8212;</span>';
    }

    const rankDisplay = hasRank ? `#${r.rank}${r.total_in_ranking ? ' / ' + r.total_in_ranking : ''}` : `${r.total_in_ranking ? r.total_in_ranking + ' swimmers' : 'Ranked'}`;

    html += `<div class="nat-rank-row">
      <span class="nat-rank-event">${fmtEvent(r.event, r.course)}</span>
      <span class="nat-rank-time">${r.time}</span>
      <span class="nat-rank-badge ${badgeCls}">${rankDisplay}</span>
      ${moveHtml}
    </div>`;
  });

  container.innerHTML = html;
}

function renderNationalRankChart(allRanks) {
  destroyChart('nationalRank');
  const canvas = document.getElementById('nationalRankChart');
  if (!canvas) return;

  // Get top events by best rank
  const eventBest = {};
  allRanks.filter(r => r.rank != null).forEach(r => {
    const key = `${r.event}|${r.course}`;
    if (!eventBest[key] || r.rank < eventBest[key].rank) eventBest[key] = r;
  });

  const topEvents = Object.values(eventBest)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 5);

  const chartColors = [COLORS.amber, COLORS.gold, COLORS.purple, COLORS.green, COLORS.bella];
  const years = [2023, 2024, 2025, 2026];

  const datasets = topEvents.map((ev, i) => {
    const data = years.map(y => {
      const r = allRanks.find(rk => rk.event === ev.event && rk.course === ev.course && rk.year === y);
      return r ? { x: y, y: r.rank } : null;
    }).filter(Boolean);
    return {
      label: fmtEvent(ev.event, ev.course), data,
      borderColor: chartColors[i], backgroundColor: chartColors[i],
      pointRadius: 5, pointHoverRadius: 8, borderWidth: 2, tension: 0.3, spanGaps: true,
    };
  });

  if (!datasets.length || datasets.every(d => !d.data.length)) {
    // No chart data
    return;
  }

  charts.nationalRank = new Chart(canvas, {
    type: 'line', data: { datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { type: 'linear', min: 2022.5, max: 2026.5,
          ticks: { stepSize: 1, color: COLORS.tick, callback: v => String(v) },
          grid: { color: COLORS.grid } },
        y: { reverse: true,
          title: { display: true, text: 'National Rank', color: COLORS.tick, font: { size: 10 } },
          grid: { color: COLORS.grid }, ticks: { color: COLORS.tick } },
      },
      plugins: {
        legend: { labels: { usePointStyle: true, pointStyle: 'circle', padding: 12, font: { size: 10 } } },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: #${ctx.raw.y} (${ctx.raw.x})` } },
      },
    },
  });
}

function renderNationalYoY(curRanks, prevRanks, year) {
  const container = document.getElementById('natYoyContainer');

  if (!curRanks.length && !prevRanks.length) {
    container.innerHTML = '<div class="club-empty-state">Year-on-year data will appear after rankings are loaded</div>';
    return;
  }

  // Merge events from both years
  const eventKeys = new Set();
  curRanks.forEach(r => eventKeys.add(`${r.event}|${r.course}`));
  prevRanks.forEach(r => eventKeys.add(`${r.event}|${r.course}`));

  let html = `<div class="yoy-row" style="font-weight:600;color:var(--text-3);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.5px">
    <span>Event</span>
    <span>${year - 1}</span>
    <span>${year}</span>
    <span>Change</span>
  </div>`;

  [...eventKeys].sort().forEach(key => {
    const [event, course] = key.split('|');
    const cur = curRanks.find(r => r.event === event && r.course === course);
    const prev = prevRanks.find(r => r.event === event && r.course === course);

    let changeCls = 'same', changeText = '-';
    if (cur && prev) {
      const diff = prev.rank - cur.rank;
      changeCls = diff > 0 ? 'up' : diff < 0 ? 'down' : 'same';
      const arrow = diff > 0 ? '\u25B2' : diff < 0 ? '\u25BC' : '\u2014';
      changeText = `${arrow}${Math.abs(diff) || ''}`;
    } else if (cur && !prev) {
      changeText = 'NEW';
      changeCls = 'up';
    } else if (!cur && prev) {
      changeText = '-';
      changeCls = 'same';
    }

    html += `<div class="yoy-row">
      <span class="yoy-event">${fmtEvent(event, course)}</span>
      <span class="yoy-prev">${prev ? '#' + prev.rank : '-'}</span>
      <span class="yoy-curr">${cur ? '#' + cur.rank : '-'}</span>
      <span class="yoy-change ${changeCls}">${changeText}</span>
    </div>`;
  });

  container.innerHTML = html;
}

// ── Event Listeners ──────────────────────────────────────
document.getElementById('chartCourse')?.addEventListener('change', updateProgressChart);
document.getElementById('natYearFilter')?.addEventListener('change', renderNationalTab);

// ── Start ────────────────────────────────────────────────
setupTabs();
init();

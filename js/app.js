/* SwimMotivator — Main dashboard application */

let CONFIG = {};
let ALL_SWIMMERS = [];
let ALL_PBs = [];
let ALL_MEET_RESULTS = [];
let HISTORY_INDEX = [];
let ALL_CLUBS = [];

// ── Tabs ──────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});

// ── Init ──────────────────────────────────────────────────
async function init() {
  try {
    setStatus('Loading data...');
    [CONFIG, ALL_SWIMMERS, ALL_PBs, ALL_MEET_RESULTS, HISTORY_INDEX, ALL_CLUBS] = await Promise.all([
      fetchJSON('config.json'),
      fetchJSON('swimmers.json'),
      fetchJSON('personal_bests.json'),
      fetchJSON('meet_results.json'),
      fetchJSON('history_index.json'),
      fetchJSON('clubs.json'),
    ]);

    populateOverview();
    populateSelects();
    loadPerformanceTab();
    loadPeerTab();
    loadMeetResultsTab();
    loadClubTab();
    setStatus('Data loaded', true);
  } catch (err) {
    setStatus(`Failed to load: ${err.message}`, false, true);
    console.error(err);
  }
}

function setStatus(msg, connected = false, error = false) {
  const el = document.getElementById('statusText');
  el.textContent = msg;
  el.className = error ? 'error' : connected ? 'connected' : '';
}

// ── Overview Tab ──────────────────────────────────────────
function populateOverview() {
  document.getElementById('statSwimmers').textContent = ALL_SWIMMERS.length;
  document.getElementById('statMeets').textContent =
    new Set(ALL_MEET_RESULTS.map(r => r.meetcode)).size;
  document.getElementById('statResults').textContent =
    ALL_MEET_RESULTS.length.toLocaleString();
  document.getElementById('statPBs').textContent = ALL_PBs.length;

  // Bella's latest PB
  const bellaPBs = ALL_PBs.filter(r => r.tiref === CONFIG.target_tirefs.bella);
  const amberPBs = ALL_PBs.filter(r => r.tiref === CONFIG.target_tirefs.amber);

  buildPBSummary('bellaPBSummary', bellaPBs, 'Bella');
  buildPBSummary('amberPBSummary', amberPBs, 'Amber');
}

function buildPBSummary(containerId, pbs, name) {
  const container = document.getElementById(containerId);
  if (!pbs.length) {
    container.innerHTML = '<div class="loading">No PB data yet</div>';
    return;
  }

  // Group by stroke, show best WA points
  const byStroke = {};
  pbs.forEach(pb => {
    const key = `${pb.stroke} (${pb.course})`;
    if (!byStroke[key] || (pb.wa_points || 0) > (byStroke[key].wa_points || 0)) {
      byStroke[key] = pb;
    }
  });

  const sorted = Object.values(byStroke).sort((a, b) => (b.wa_points || 0) - (a.wa_points || 0));
  let html = '<table class="data-table"><thead><tr><th>Event</th><th>Time</th><th>WA</th><th>Date</th></tr></thead><tbody>';
  sorted.forEach(pb => {
    html += `<tr>
      <td>${pb.stroke} (${pb.course})</td>
      <td>${pb.time}</td>
      <td>${pb.wa_points || '-'}</td>
      <td>${pb.date || '-'}</td>
    </tr>`;
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

// ── Populate Selects ──────────────────────────────────────
function populateSelects() {
  const strokeNames = CONFIG.stroke_names || {};

  // Performance tab swimmer selects
  const perfSwimmerSelects = ['perfSwimmer1', 'perfSwimmer2'];
  perfSwimmerSelects.forEach(id => {
    const sel = document.getElementById(id);
    sel.innerHTML = '';
    HISTORY_INDEX.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.tiref;
      opt.textContent = `${s.swimmer_name} (${s.tiref})`;
      sel.appendChild(opt);
    });
  });

  // Default to Bella & Amber
  const s1 = document.getElementById('perfSwimmer1');
  const s2 = document.getElementById('perfSwimmer2');
  if ([...s1.options].some(o => o.value === String(CONFIG.target_tirefs.bella)))
    s1.value = String(CONFIG.target_tirefs.bella);
  if ([...s2.options].some(o => o.value === String(CONFIG.target_tirefs.amber)))
    s2.value = String(CONFIG.target_tirefs.amber);

  // Event selects (including club rankings)
  ['perfEvent', 'peerEvent', 'clubEvent'].forEach(id => {
    const sel = document.getElementById(id);
    sel.innerHTML = '';
    Object.entries(strokeNames).forEach(([code, name]) => {
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = name;
      sel.appendChild(opt);
    });
  });
}

// ── Performance Tab (Bella & Amber) ──────────────────────
async function loadPerformanceTab() {
  const tiref1 = document.getElementById('perfSwimmer1').value;
  const tiref2 = document.getElementById('perfSwimmer2').value;
  const strokeCode = document.getElementById('perfEvent').value;
  const course = document.getElementById('perfCourse').value;

  let rows1 = [], rows2 = [];
  try {
    [rows1, rows2] = await Promise.all([
      fetchJSON(`history/${tiref1}.json`).catch(() => []),
      fetchJSON(`history/${tiref2}.json`).catch(() => []),
    ]);
  } catch { /* ignore */ }

  const filter = rows => rows
    .filter(r => !strokeCode || String(r.stroke_code) === strokeCode)
    .filter(r => !course || r.course === course)
    .filter(r => r.time && Number.isFinite(parseTimeToSeconds(r.time)))
    .sort(sortByDate);

  const filtered1 = filter(rows1);
  const filtered2 = filter(rows2);

  const name1 = document.getElementById('perfSwimmer1').selectedOptions[0]?.textContent || 'Swimmer 1';
  const name2 = document.getElementById('perfSwimmer2').selectedOptions[0]?.textContent || 'Swimmer 2';

  const ds1 = buildSwimmerDataset(filtered1, name1, CHART_COLORS.bella, CHART_COLORS.bellaGlow);
  const ds2 = buildSwimmerDataset(filtered2, name2, CHART_COLORS.amber, CHART_COLORS.amberGlow);

  destroyChart('performance');
  chartInstances.performance = new Chart(document.getElementById('performanceChart'), {
    type: 'line',
    data: { datasets: [ds1, ds2] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { x: timeScaleConfig(), y: timeYAxisConfig() },
      plugins: { tooltip: { callbacks: swimTooltipCallbacks() } },
    },
  });
}

// ── Peer Comparison Tab ──────────────────────────────────
const PEER_PALETTE = [
  '#00e5ff', '#ff4081', '#ffd740', '#b388ff', '#69f0ae',
  '#ff6e40', '#40c4ff', '#eeff41', '#e040fb', '#64ffda',
];
let peerSelectedTirefs = new Set();
let peerLeaderboard = [];    // current filtered leaderboard data
let peerGroupsCache = null;  // current peer groups Map
let bellaFilteredCache = [];
let amberFilteredCache = [];

function getPeerColor(index) {
  return PEER_PALETTE[index % PEER_PALETTE.length];
}

async function loadPeerTab() {
  const strokeCode = document.getElementById('peerEvent').value;
  const course = document.getElementById('peerCourse').value;
  const yobFilter = document.getElementById('peerYob').value;
  const sexFilter = document.getElementById('peerSex').value;
  const strokeName = CONFIG.stroke_names?.[strokeCode] || '50 Freestyle';

  // Load Bella & Amber history
  let bellaRows = [], amberRows = [];
  try {
    [bellaRows, amberRows] = await Promise.all([
      fetchJSON(`history/${CONFIG.target_tirefs.bella}.json`).catch(() => []),
      fetchJSON(`history/${CONFIG.target_tirefs.amber}.json`).catch(() => []),
    ]);
  } catch { /* ignore */ }

  const filterHistory = rows => rows
    .filter(r => !strokeCode || String(r.stroke_code) === strokeCode)
    .filter(r => !course || r.course === course)
    .filter(r => r.time && Number.isFinite(parseTimeToSeconds(r.time)))
    .sort(sortByDate);

  bellaFilteredCache = filterHistory(bellaRows);
  amberFilteredCache = filterHistory(amberRows);

  // Get peer data from meet results
  let peerResults = ALL_MEET_RESULTS.filter(r => r.event === strokeName);
  if (course) {
    const courseLabel = course === 'S' ? 'Short' : 'Long';
    peerResults = peerResults.filter(r =>
      r.course && r.course.toLowerCase().includes(courseLabel.toLowerCase()));
  }
  if (yobFilter) peerResults = peerResults.filter(r => String(r.yob) === yobFilter);
  if (sexFilter) peerResults = peerResults.filter(r => r.sex === sexFilter);
  peerResults = peerResults.filter(r => r.time && Number.isFinite(parseTimeToSeconds(r.time)));

  // Group by tiref — build leaderboard
  const peerGroups = new Map();
  peerResults.forEach(r => {
    if (!peerGroups.has(String(r.tiref))) peerGroups.set(String(r.tiref), []);
    peerGroups.get(String(r.tiref)).push({ ...r, date: r.meet_date || r.date });
  });
  peerGroupsCache = peerGroups;

  // Build leaderboard: best time per swimmer
  peerLeaderboard = [];
  for (const [tiref, rows] of peerGroups.entries()) {
    let bestTime = Infinity, bestRow = null;
    rows.forEach(r => {
      const secs = parseTimeToSeconds(r.time);
      if (secs !== null && secs < bestTime) { bestTime = secs; bestRow = r; }
    });
    if (bestRow) {
      peerLeaderboard.push({
        tiref,
        name: bestRow.swimmer_name || `Swimmer ${tiref}`,
        club: bestRow.club || '-',
        yob: bestRow.yob || '-',
        sex: bestRow.sex || '-',
        bestTime,
        bestTimeStr: bestRow.time,
        waPoints: bestRow.wa_points || '-',
        date: bestRow.meet_date || bestRow.date || '-',
        swimCount: rows.length,
      });
    }
  }
  peerLeaderboard.sort((a, b) => a.bestTime - b.bestTime);

  // Clean up selections that are no longer in filtered results
  const validTirefs = new Set(peerLeaderboard.map(p => p.tiref));
  for (const t of peerSelectedTirefs) {
    if (!validTirefs.has(t)) peerSelectedTirefs.delete(t);
  }

  renderLeaderboard();
  renderPeerChart();

  document.getElementById('peerCount').textContent = peerLeaderboard.length;
}

function renderLeaderboard() {
  const container = document.getElementById('leaderboardContainer');
  const bellaId = String(CONFIG.target_tirefs?.bella);
  const amberId = String(CONFIG.target_tirefs?.amber);
  const selectedArr = [...peerSelectedTirefs];

  let html = '<table class="data-table"><thead><tr>';
  html += '<th style="width:2.5rem">#</th><th></th><th>Swimmer</th><th>Club</th><th>YoB</th><th>Best Time</th><th>WA</th><th>Swims</th>';
  html += '</tr></thead><tbody>';

  peerLeaderboard.forEach((p, i) => {
    const isBella = p.tiref === bellaId;
    const isAmber = p.tiref === amberId;
    const isSelected = peerSelectedTirefs.has(p.tiref);
    const selIdx = selectedArr.indexOf(p.tiref);
    const color = isBella ? CHART_COLORS.bella : isAmber ? CHART_COLORS.amber : isSelected ? getPeerColor(selIdx) : null;

    const rowCls = isSelected ? ' class="peer-selected"' : '';
    const nameCls = isBella ? ' class="highlight-bella"' : isAmber ? ' class="highlight-amber"' : isSelected ? ` style="color:${color};font-weight:600"` : '';
    const rankCls = i < 3 ? ` rank-${i + 1}` : '';
    const dot = color ? `<span class="peer-color-dot" style="background:${color}"></span>` : '';

    html += `<tr${rowCls} data-tiref="${p.tiref}" onclick="togglePeerSelection('${p.tiref}')">`;
    html += `<td><span class="rank-num${rankCls}">${i + 1}</span></td>`;
    html += `<td>${dot}</td>`;
    html += `<td${nameCls}>${p.name}</td>`;
    html += `<td>${p.club}</td>`;
    html += `<td>${p.yob}</td>`;
    html += `<td>${p.bestTimeStr}</td>`;
    html += `<td>${p.waPoints}</td>`;
    html += `<td>${p.swimCount}</td>`;
    html += `</tr>`;
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

function togglePeerSelection(tiref) {
  const bellaId = String(CONFIG.target_tirefs?.bella);
  const amberId = String(CONFIG.target_tirefs?.amber);
  if (tiref === bellaId || tiref === amberId) return; // always shown

  if (peerSelectedTirefs.has(tiref)) {
    peerSelectedTirefs.delete(tiref);
  } else {
    peerSelectedTirefs.add(tiref);
  }
  renderLeaderboard();
  renderPeerChart();
}

function selectTopN(n) {
  peerSelectedTirefs.clear();
  const bellaId = String(CONFIG.target_tirefs?.bella);
  const amberId = String(CONFIG.target_tirefs?.amber);
  let count = 0;
  for (const p of peerLeaderboard) {
    if (p.tiref === bellaId || p.tiref === amberId) continue;
    peerSelectedTirefs.add(p.tiref);
    count++;
    if (count >= n) break;
  }
  renderLeaderboard();
  renderPeerChart();
}

function clearPeerSelection() {
  peerSelectedTirefs.clear();
  renderLeaderboard();
  renderPeerChart();
}

function renderPeerChart() {
  if (!peerGroupsCache) return;
  const bellaId = String(CONFIG.target_tirefs?.bella);
  const amberId = String(CONFIG.target_tirefs?.amber);
  const selectedArr = [...peerSelectedTirefs];

  const datasets = [];

  // Unselected peers as faint lines
  for (const [tiref, rows] of peerGroupsCache.entries()) {
    if (tiref === bellaId || tiref === amberId) continue;
    if (peerSelectedTirefs.has(tiref)) continue;
    const sorted = rows.sort(sortByDate);
    const data = sorted
      .map(r => ({ x: parseDate(r.date), y: parseTimeToSeconds(r.time) }))
      .filter(p => p.x && Number.isFinite(p.y));
    if (!data.length) continue;
    datasets.push({
      label: rows[0].swimmer_name || `Swimmer ${tiref}`,
      data,
      borderColor: 'rgba(138, 150, 180, 0.08)',
      backgroundColor: 'rgba(138, 150, 180, 0.08)',
      borderWidth: 1,
      pointRadius: 0,
      pointHoverRadius: 2,
      tension: 0.3,
      spanGaps: true,
      showInLegend: false,
    });
  }

  // Selected peers with bright colours
  selectedArr.forEach((tiref, idx) => {
    const rows = peerGroupsCache.get(tiref);
    if (!rows) return;
    const color = getPeerColor(idx);
    const sorted = rows.sort(sortByDate);
    const data = sorted
      .map(r => ({
        x: parseDate(r.date), y: parseTimeToSeconds(r.time),
        meetName: r.meet_name || 'N/A', rawDate: r.date || 'N/A',
      }))
      .filter(p => p.x && Number.isFinite(p.y));
    if (!data.length) return;
    datasets.push({
      label: rows[0].swimmer_name || `Swimmer ${tiref}`,
      data,
      borderColor: color,
      backgroundColor: color,
      borderWidth: 2.5,
      pointRadius: 4,
      pointHoverRadius: 7,
      pointBackgroundColor: color,
      tension: 0.3,
      spanGaps: true,
      showInLegend: true,
    });
  });

  // Bella & Amber always on top
  datasets.push(buildSwimmerDataset(bellaFilteredCache, 'Bella', CHART_COLORS.bella, CHART_COLORS.bellaGlow));
  datasets.push(buildSwimmerDataset(amberFilteredCache, 'Amber', CHART_COLORS.amber, CHART_COLORS.amberGlow));

  destroyChart('peer');
  chartInstances.peer = new Chart(document.getElementById('peerChart'), {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { x: timeScaleConfig(), y: timeYAxisConfig() },
      plugins: {
        legend: {
          labels: { filter: (item, data) => data.datasets[item.datasetIndex].showInLegend !== false },
        },
        tooltip: {
          mode: 'nearest',
          intersect: true,
          callbacks: swimTooltipCallbacks(),
        },
      },
    },
  });
}

// ── Meet Results Tab ─────────────────────────────────────
let meetResultsPage = 0;
const RESULTS_PER_PAGE = 50;
let filteredMeetResults = [];

function loadMeetResultsTab() {
  filterMeetResults();
}

function filterMeetResults() {
  const search = (document.getElementById('meetSearch')?.value || '').toLowerCase();
  filteredMeetResults = ALL_MEET_RESULTS.filter(r => {
    if (!search) return true;
    return (r.swimmer_name || '').toLowerCase().includes(search)
      || (r.event || '').toLowerCase().includes(search)
      || (r.meet_name || '').toLowerCase().includes(search)
      || (r.club || '').toLowerCase().includes(search)
      || String(r.tiref).includes(search);
  });
  meetResultsPage = 0;
  renderMeetResultsTable();
}

function renderMeetResultsTable() {
  const start = meetResultsPage * RESULTS_PER_PAGE;
  const pageRows = filteredMeetResults.slice(start, start + RESULTS_PER_PAGE);
  const totalPages = Math.ceil(filteredMeetResults.length / RESULTS_PER_PAGE);
  const bellaId = String(CONFIG.target_tirefs?.bella);
  const amberId = String(CONFIG.target_tirefs?.amber);

  let html = '<table class="data-table"><thead><tr>';
  html += '<th>Swimmer</th><th>Event</th><th>Time</th><th>WA</th><th>Meet</th><th>Date</th><th>Club</th>';
  html += '</tr></thead><tbody>';

  pageRows.forEach(r => {
    const isB = String(r.tiref) === bellaId;
    const isA = String(r.tiref) === amberId;
    const cls = isB ? ' class="highlight-bella"' : isA ? ' class="highlight-amber"' : '';
    html += `<tr>
      <td${cls}>${r.swimmer_name || '-'}</td>
      <td>${r.event || '-'}</td>
      <td>${r.time || '-'}</td>
      <td>${r.wa_points || '-'}</td>
      <td>${r.meet_name || '-'}</td>
      <td>${r.meet_date || '-'}</td>
      <td>${r.club || '-'}</td>
    </tr>`;
  });
  html += '</tbody></table>';

  html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:1rem;font-size:0.8rem;color:var(--text-secondary)">`;
  html += `<span>${filteredMeetResults.length.toLocaleString()} results</span>`;
  html += `<span>Page ${meetResultsPage + 1} of ${totalPages || 1}</span>`;
  html += `<span>`;
  if (meetResultsPage > 0) html += `<button onclick="meetResultsPage--;renderMeetResultsTable()" style="background:var(--bg-input);border:1px solid var(--border);color:var(--text-primary);padding:0.25rem 0.75rem;border-radius:6px;cursor:pointer;margin-right:0.5rem">Prev</button>`;
  if (start + RESULTS_PER_PAGE < filteredMeetResults.length) html += `<button onclick="meetResultsPage++;renderMeetResultsTable()" style="background:var(--bg-input);border:1px solid var(--border);color:var(--text-primary);padding:0.25rem 0.75rem;border-radius:6px;cursor:pointer">Next</button>`;
  html += `</span></div>`;

  document.getElementById('meetResultsContainer').innerHTML = html;
}

// ── Club Rankings Tab ────────────────────────────────────
function loadClubTab() {
  const event = document.getElementById('clubEvent').value;
  const strokeNames = CONFIG.stroke_names || {};
  const eventName = strokeNames[event] || '50 Free';

  let rows = ALL_MEET_RESULTS.filter(r => r.event === eventName);
  rows = rows.filter(r => r.wa_points && Number(r.wa_points) > 0);

  const clubPoints = new Map();
  const clubCounts = new Map();
  rows.forEach(r => {
    const club = (r.club || 'Unknown').trim();
    const wa = Number(r.wa_points);
    if (!Number.isFinite(wa)) return;
    clubPoints.set(club, (clubPoints.get(club) || 0) + wa);
    clubCounts.set(club, (clubCounts.get(club) || 0) + 1);
  });

  const clubs = Array.from(clubPoints.keys())
    .map(club => ({ club, avg: clubPoints.get(club) / clubCounts.get(club), count: clubCounts.get(club) }))
    .filter(c => c.count >= 2)
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 15);

  // Highlight Co St Albans
  const colors = clubs.map(c =>
    c.club.includes('St Albans') ? CHART_COLORS.amber : 'rgba(138, 150, 180, 0.5)');
  const borderColors = clubs.map(c =>
    c.club.includes('St Albans') ? CHART_COLORS.amber : 'rgba(138, 150, 180, 0.3)');

  destroyChart('club');
  chartInstances.club = new Chart(document.getElementById('clubChart'), {
    type: 'bar',
    data: {
      labels: clubs.map(c => c.club),
      datasets: [{
        label: 'Avg WA Points',
        data: clubs.map(c => Number(c.avg.toFixed(1))),
        backgroundColor: colors,
        borderColor: borderColors,
        borderWidth: 1,
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      scales: {
        x: { grid: { color: CHART_COLORS.gridLight }, ticks: { color: CHART_COLORS.tick } },
        y: {
          grid: { display: false },
          ticks: {
            color: CHART_COLORS.tick,
            font: { size: 11 },
            callback: function(value) {
              const label = this.getLabelForValue(value);
              return label.length > 25 ? label.slice(0, 25) + '...' : label;
            },
          },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `Avg WA: ${ctx.raw} (${clubs[ctx.dataIndex]?.count} swims)`,
          },
        },
      },
    },
  });
}

// ── Event Listeners ──────────────────────────────────────
['perfSwimmer1', 'perfSwimmer2', 'perfEvent', 'perfCourse'].forEach(id => {
  document.getElementById(id)?.addEventListener('change', loadPerformanceTab);
});

['peerEvent', 'peerCourse', 'peerYob', 'peerSex'].forEach(id => {
  document.getElementById(id)?.addEventListener('change', loadPeerTab);
});

document.getElementById('meetSearch')?.addEventListener('input', () => {
  clearTimeout(window._meetSearchTimer);
  window._meetSearchTimer = setTimeout(filterMeetResults, 300);
});

document.getElementById('clubEvent')?.addEventListener('change', loadClubTab);

document.getElementById('selectTop5Btn')?.addEventListener('click', () => selectTopN(5));
document.getElementById('selectTop10Btn')?.addEventListener('click', () => selectTopN(10));
document.getElementById('clearSelectionBtn')?.addEventListener('click', clearPeerSelection);

// ── Start ────────────────────────────────────────────────
init();

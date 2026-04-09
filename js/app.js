/* SwimMotivator v7 — County-focused motivational dashboard */

const STROKE_NAMES = {
  1: '50 Freestyle', 2: '100 Freestyle', 3: '200 Freestyle', 4: '400 Freestyle',
  5: '800 Freestyle', 6: '1500 Freestyle', 7: '50 Breaststroke', 8: '100 Breaststroke',
  9: '200 Breaststroke', 10: '50 Butterfly', 11: '100 Butterfly', 12: '200 Butterfly',
  13: '50 Backstroke', 14: '100 Backstroke', 15: '200 Backstroke',
  16: '200 Individual Medley', 17: '400 Individual Medley', 18: '100 Individual Medley',
};

let ALL_SWIMMERS = [];
let COUNTY_RANKS = [];
let currentData = null;
let activeSwimmer = null;

// ── Init ──────────────────────────────────────────────────
async function init() {
  try {
    setStatus('Loading data...');

    const [swimmers, countyRanks] = await Promise.all([
      fetchJSON('swimmers.json'),
      fetchJSON('county_ranks.json').catch(() => []),
    ]);

    ALL_SWIMMERS = swimmers.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    COUNTY_RANKS = countyRanks;

    setupTabs();
    setupSwimmerSelect();

    // Default to first swimmer
    if (ALL_SWIMMERS.length > 0) {
      await selectSwimmer(ALL_SWIMMERS[0]);
    }

    setStatus(`${ALL_SWIMMERS.length} swimmers loaded`, true);
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

// ── Tabs ──────────────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const panel = document.getElementById('panel' + btn.dataset.tab.charAt(0).toUpperCase() + btn.dataset.tab.slice(1));
      if (panel) panel.classList.add('active');
    });
  });
}

// ── Swimmer Select ────────────────────────────────────────
function setupSwimmerSelect() {
  const searchInput = document.getElementById('swimmerSearch');
  const dropdown = document.getElementById('swimmerDropdown');

  function renderDropdown(filter = '') {
    const lc = filter.toLowerCase();
    const filtered = lc ? ALL_SWIMMERS.filter(s => s.name.toLowerCase().includes(lc)) : ALL_SWIMMERS;

    const groups = {};
    filtered.forEach(s => {
      const key = s.yob || '?';
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    });

    let html = '<input type="text" class="dd-search" id="ddSearchInput" placeholder="Type to filter...">';
    Object.keys(groups).sort((a, b) => Number(a) - Number(b)).forEach(yob => {
      html += `<div class="dd-group-label">Born ${yob}</div>`;
      groups[yob].forEach(s => {
        const isActive = activeSwimmer && String(s.tiref) === String(activeSwimmer.tiref);
        html += `<div class="dd-item${isActive ? ' active' : ''}" data-tiref="${s.tiref}">
          <span>${s.name}</span>
          <span class="dd-yob">${s.sex === 'F' ? 'G' : s.sex === 'M' ? 'B' : ''} ${s.yob || ''}</span>
        </div>`;
      });
    });

    if (!filtered.length) html += '<div style="padding:1rem;color:var(--text-3);text-align:center">No matches</div>';
    dropdown.innerHTML = html;

    const ddSearch = document.getElementById('ddSearchInput');
    if (ddSearch) {
      ddSearch.value = filter;
      ddSearch.focus();
      ddSearch.addEventListener('input', () => renderDropdown(ddSearch.value));
    }

    dropdown.querySelectorAll('.dd-item').forEach(item => {
      item.addEventListener('click', async () => {
        const tiref = item.dataset.tiref;
        const swimmer = ALL_SWIMMERS.find(s => String(s.tiref) === tiref);
        if (swimmer) {
          await selectSwimmer(swimmer);
          dropdown.classList.remove('open');
          searchInput.classList.remove('open');
        }
      });
    });
  }

  searchInput.addEventListener('click', (e) => {
    e.stopPropagation();
    if (dropdown.classList.contains('open')) {
      dropdown.classList.remove('open');
      searchInput.classList.remove('open');
    } else {
      renderDropdown('');
      dropdown.classList.add('open');
      searchInput.classList.add('open');
    }
  });

  dropdown.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', () => {
    dropdown.classList.remove('open');
    searchInput.classList.remove('open');
  });
}

async function selectSwimmer(swimmer) {
  activeSwimmer = swimmer;
  document.getElementById('swimmerSearch').value = swimmer.name;

  setStatus('Loading...');
  try {
    const resp = await fetch(`${DATA_BASE}/swimmers/${swimmer.tiref}.json`);
    currentData = await resp.json();
  } catch {
    currentData = { pbs: [], history: [], rankings: { county: [] } };
  }

  refresh();
  setStatus(`${swimmer.name} — ${ALL_SWIMMERS.length} swimmers loaded`, true);
}

// ── Refresh All Tabs ──────────────────────────────────────
function refresh() {
  if (!currentData || !activeSwimmer) return;
  renderDashboard();
  renderCounty();
  renderHistory();
  renderClub();
}

// ── DASHBOARD TAB ─────────────────────────────────────────
function renderDashboard() {
  const d = currentData;
  const pbs = d.pbs || [];
  const history = d.history || [];
  const rankings = (d.rankings && d.rankings.county) || [];

  // Hero stats
  const latestYear = rankings.length ? Math.max(...rankings.map(r => r.year)) : null;
  const latestRankings = latestYear ? rankings.filter(r => r.year === latestYear) : [];
  const bestRank = latestRankings.length ? Math.min(...latestRankings.map(r => r.rank).filter(Boolean)) : null;
  const bestRankEntry = bestRank ? latestRankings.find(r => r.rank === bestRank) : null;

  setText('statBestRank', bestRank ? `#${bestRank}` : '-');
  setText('statBestRankDetail', bestRankEntry ? `${bestRankEntry.event} ${bestRankEntry.course} (${latestYear})` : '-');
  setText('statPBCount', pbs.length);
  const scCount = pbs.filter(p => p.course === 'SC').length;
  const lcCount = pbs.filter(p => p.course === 'LC').length;
  setText('statPBDetail', `${scCount} SC, ${lcCount} LC`);
  setText('statEventsRanked', latestRankings.length);
  setText('statEventsDetail', latestYear ? `County ${latestYear}` : '-');
  setText('statTotalSwims', history.length);
  const events = new Set(history.map(h => `${h.stroke_code}-${h.course}`));
  setText('statSwimsDetail', `across ${events.size} events`);

  // PB Table
  renderPBTable(pbs);

  // Best Rankings
  renderBestRankings(latestRankings, latestYear);
}

function renderPBTable(pbs) {
  if (!pbs.length) {
    document.getElementById('pbTable').innerHTML = '<div class="club-empty-state">No personal bests recorded</div>';
    return;
  }

  const sc = pbs.filter(p => p.course === 'SC').sort((a, b) => (a.stroke || '').localeCompare(b.stroke || ''));
  const lc = pbs.filter(p => p.course === 'LC').sort((a, b) => (a.stroke || '').localeCompare(b.stroke || ''));

  let html = '';
  for (const [label, rows] of [['Short Course', sc], ['Long Course', lc]]) {
    if (!rows.length) continue;
    html += `<h3 style="margin:1rem 0 0.5rem;color:var(--text-2);font-size:0.85rem">${label}</h3>`;
    html += `<table class="data-table"><thead><tr>
      <th>Event</th><th>Time</th><th>WA Pts</th><th>Date</th><th>Meet</th>
    </tr></thead><tbody>`;
    rows.forEach(r => {
      html += `<tr>
        <td>${r.stroke}</td>
        <td class="time-cell">${r.time}</td>
        <td>${r.wa_points || ''}</td>
        <td>${r.date || ''}</td>
        <td>${r.meet || ''}</td>
      </tr>`;
    });
    html += '</tbody></table>';
  }
  document.getElementById('pbTable').innerHTML = html;
}

function renderBestRankings(rankings, year) {
  if (!rankings.length) {
    document.getElementById('bestRankings').innerHTML = '<div class="club-empty-state">No county rankings found</div>';
    return;
  }

  const sorted = [...rankings].sort((a, b) => (a.rank || 999) - (b.rank || 999));
  let html = `<table class="data-table"><thead><tr>
    <th>Rank</th><th>Event</th><th>Course</th><th>Age</th><th>Time</th><th>Out of</th>
  </tr></thead><tbody>`;
  sorted.forEach(r => {
    const pct = r.total_in_ranking ? Math.round((r.rank / r.total_in_ranking) * 100) : null;
    const rankClass = r.rank <= 3 ? 'rank-gold' : r.rank <= 10 ? 'rank-silver' : '';
    html += `<tr>
      <td class="${rankClass}"><strong>#${r.rank || '?'}</strong></td>
      <td>${r.event}</td>
      <td>${r.course}</td>
      <td>${r.age_group}</td>
      <td class="time-cell">${r.time || ''}</td>
      <td>${r.total_in_ranking || '?'}${pct != null ? ` (top ${pct}%)` : ''}</td>
    </tr>`;
  });
  html += '</tbody></table>';
  document.getElementById('bestRankings').innerHTML = html;
}

// ── COUNTY RANKINGS TAB ───────────────────────────────────
function renderCounty() {
  const rankings = (currentData.rankings && currentData.rankings.county) || [];
  const years = [...new Set(rankings.map(r => r.year))].sort().reverse();

  // Year filter
  const yearSelect = document.getElementById('ctyYearFilter');
  const prevYear = yearSelect.value;
  yearSelect.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
  if (prevYear && years.includes(Number(prevYear))) yearSelect.value = prevYear;
  yearSelect.onchange = () => renderCounty();

  const selectedYear = Number(yearSelect.value) || years[0];
  const yearRankings = rankings.filter(r => r.year === selectedYear);
  const allYearRankings = rankings;

  // Stats
  const bestRank = yearRankings.length ? Math.min(...yearRankings.map(r => r.rank).filter(Boolean)) : null;
  const bestEntry = bestRank ? yearRankings.find(r => r.rank === bestRank) : null;
  setText('ctyBestRank', bestRank ? `#${bestRank}` : '-');
  setText('ctyBestRankDetail', bestEntry ? `${bestEntry.event} ${bestEntry.course}` : '-');

  const top10 = yearRankings.filter(r => r.rank && r.rank <= 10);
  setText('ctyTop10', top10.length);
  setText('ctyTop10Detail', `in ${selectedYear}`);

  const rankedEntries = yearRankings.filter(r => r.rank);
  const avgRank = rankedEntries.length ? Math.round(rankedEntries.reduce((s, r) => s + r.rank, 0) / rankedEntries.length) : null;
  setText('ctyAvgRank', avgRank ? `#${avgRank}` : '-');
  setText('ctyAvgDetail', `across ${rankedEntries.length} events`);

  // Ranks improved: compare selectedYear vs previous year
  const prevYearNum = selectedYear - 1;
  const prevRankings = rankings.filter(r => r.year === prevYearNum);
  let improved = 0;
  yearRankings.forEach(yr => {
    const prev = prevRankings.find(pr => pr.event === yr.event && pr.course === yr.course);
    if (prev && yr.rank && prev.rank && yr.rank < prev.rank) improved++;
  });
  setText('ctyImproved', improved || '-');
  setText('ctyImprovedDetail', prevRankings.length ? `vs ${prevYearNum}` : 'no prior year');

  // Rankings list
  const sorted = [...yearRankings].sort((a, b) => (a.rank || 999) - (b.rank || 999));
  if (!sorted.length) {
    document.getElementById('countyRankingsList').innerHTML = '<div class="club-empty-state">No rankings for this year</div>';
  } else {
    let html = `<table class="data-table"><thead><tr>
      <th>Rank</th><th>Event</th><th>Course</th><th>Age</th><th>Time</th><th>Total</th><th>vs Last Year</th>
    </tr></thead><tbody>`;
    sorted.forEach(r => {
      const prev = prevRankings.find(pr => pr.event === r.event && pr.course === r.course);
      let change = '';
      if (prev && prev.rank && r.rank) {
        const diff = prev.rank - r.rank;
        if (diff > 0) change = `<span class="rank-up">+${diff}</span>`;
        else if (diff < 0) change = `<span class="rank-down">${diff}</span>`;
        else change = '<span class="rank-same">=</span>';
      }
      const rankClass = r.rank <= 3 ? 'rank-gold' : r.rank <= 10 ? 'rank-silver' : '';
      html += `<tr>
        <td class="${rankClass}"><strong>#${r.rank || '?'}</strong></td>
        <td>${r.event}</td><td>${r.course}</td><td>${r.age_group}</td>
        <td class="time-cell">${r.time || ''}</td>
        <td>${r.total_in_ranking || '?'}</td>
        <td>${change}</td>
      </tr>`;
    });
    html += '</tbody></table>';
    document.getElementById('countyRankingsList').innerHTML = html;
  }

  // Rank progression chart
  renderRankProgressionChart(allYearRankings);

  // Year-on-year comparison
  renderYoYComparison(rankings, years);
}

function renderRankProgressionChart(rankings) {
  destroyChart('rankProgression');
  const canvas = document.getElementById('rankProgressionChart');
  if (!canvas) return;

  // Group by event+course
  const groups = {};
  rankings.forEach(r => {
    const key = `${r.event} ${r.course}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  });

  // Only show events with 2+ years of data
  const datasets = [];
  const eventColors = ['#00e5ff', '#ff4081', '#ffd740', '#69f0ae', '#b388ff', '#ff6e40', '#8c9eff', '#80cbc4'];
  let colorIdx = 0;

  Object.keys(groups).sort().forEach(key => {
    const entries = groups[key].sort((a, b) => a.year - b.year);
    if (entries.length < 2) return;
    const color = eventColors[colorIdx % eventColors.length];
    colorIdx++;
    datasets.push({
      label: key,
      data: entries.map(e => ({ x: e.year, y: e.rank })),
      borderColor: color,
      backgroundColor: color + '33',
      tension: 0.3,
      pointRadius: 4,
    });
  });

  if (!datasets.length) return;

  charts['rankProgression'] = new Chart(canvas, {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { reverse: true, title: { display: true, text: 'Rank' }, min: 1 },
        x: { type: 'linear', title: { display: true, text: 'Year' }, ticks: { stepSize: 1 } },
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.dataset.label}: #${ctx.parsed.y}`
          }
        }
      }
    }
  });
}

function renderYoYComparison(rankings, years) {
  const el = document.getElementById('yoyComparison');
  if (years.length < 2) {
    el.innerHTML = '<div class="club-empty-state">Need 2+ years of data for comparison</div>';
    return;
  }

  const latest = years[0];
  const prev = years[1];
  const latestR = rankings.filter(r => r.year === latest);
  const prevR = rankings.filter(r => r.year === prev);

  let html = `<table class="data-table"><thead><tr>
    <th>Event</th><th>Course</th><th>${prev}</th><th>${latest}</th><th>Change</th>
  </tr></thead><tbody>`;

  latestR.sort((a, b) => (a.event || '').localeCompare(b.event || '')).forEach(r => {
    const p = prevR.find(pr => pr.event === r.event && pr.course === r.course);
    let change = '';
    if (p && p.rank && r.rank) {
      const diff = p.rank - r.rank;
      if (diff > 0) change = `<span class="rank-up">+${diff} places</span>`;
      else if (diff < 0) change = `<span class="rank-down">${diff} places</span>`;
      else change = '<span class="rank-same">Same</span>';
    } else if (!p) {
      change = '<span class="rank-new">NEW</span>';
    }
    html += `<tr>
      <td>${r.event}</td><td>${r.course}</td>
      <td>${p ? '#' + p.rank : '-'}</td>
      <td><strong>#${r.rank || '?'}</strong></td>
      <td>${change}</td>
    </tr>`;
  });
  html += '</tbody></table>';
  el.innerHTML = html;
}

// ── HISTORY TAB ───────────────────────────────────────────
function renderHistory() {
  const history = currentData.history || [];

  // Stats
  const pbSwims = history.filter(h => h.is_pb);
  const events = new Set(history.map(h => `${h.stroke_code}-${h.course}`));
  const dates = history.map(h => parseDate(h.date)).filter(Boolean).sort((a, b) => b - a);

  setText('histTotalSwims', history.length);
  setText('histSwimsDetail', history.length ? '' : 'No history data');
  setText('histEvents', events.size);
  setText('histEventsDetail', 'unique event/course combos');
  setText('histPBs', pbSwims.length);
  setText('histPBsDetail', history.length ? `${(pbSwims.length / history.length * 100).toFixed(0)}% PB rate` : '');

  const latestDate = dates[0];
  setText('histLatest', latestDate ? latestDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '-');
  setText('histLatestDetail', '');

  // Event filter
  const eventFilter = document.getElementById('histEventFilter');
  const prevVal = eventFilter.value;
  const eventKeys = [...events].sort((a, b) => {
    const [sa] = a.split('-');
    const [sb] = b.split('-');
    return Number(sa) - Number(sb);
  });

  eventFilter.innerHTML = '<option value="">All Events</option>' +
    eventKeys.map(k => {
      const [code, course] = k.split('-');
      const name = STROKE_NAMES[Number(code)] || `Stroke ${code}`;
      const courseLabel = course === 'S' ? 'SC' : 'LC';
      return `<option value="${k}">${name} ${courseLabel}</option>`;
    }).join('');
  if (prevVal) eventFilter.value = prevVal;
  eventFilter.onchange = () => {
    renderTimeChart(history, eventFilter.value);
    renderHistoryTable(history, eventFilter.value);
  };

  renderTimeChart(history, eventFilter.value);
  renderHistoryTable(history, eventFilter.value);
}

function renderTimeChart(history, eventKey) {
  destroyChart('timeProgression');
  const canvas = document.getElementById('timeProgressionChart');
  if (!canvas) return;

  let filtered = history;
  if (eventKey) {
    const [code, course] = eventKey.split('-');
    filtered = history.filter(h => String(h.stroke_code) === code && h.course === course);
  }

  if (!filtered.length) return;

  // Group by event for coloring
  const groups = {};
  filtered.forEach(h => {
    const key = `${h.stroke_code}-${h.course}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(h);
  });

  const eventColors = ['#00e5ff', '#ff4081', '#ffd740', '#69f0ae', '#b388ff', '#ff6e40'];
  const datasets = [];
  let colorIdx = 0;

  Object.keys(groups).sort().forEach(key => {
    const [code, course] = key.split('-');
    const name = STROKE_NAMES[Number(code)] || `Stroke ${code}`;
    const courseLabel = course === 'S' ? 'SC' : 'LC';
    const entries = groups[key]
      .map(h => ({ x: parseDate(h.date), y: parseTimeToSeconds(h.time), isPB: h.is_pb, time: h.time }))
      .filter(e => e.x && e.y)
      .sort((a, b) => a.x - b.x);

    if (!entries.length) return;
    const color = eventColors[colorIdx % eventColors.length];
    colorIdx++;

    datasets.push({
      label: `${name} ${courseLabel}`,
      data: entries,
      borderColor: color,
      backgroundColor: entries.map(e => e.isPB ? '#ffd740' : color + '80'),
      pointRadius: entries.map(e => e.isPB ? 6 : 3),
      pointStyle: entries.map(e => e.isPB ? 'star' : 'circle'),
      tension: 0.2,
      showLine: true,
    });
  });

  charts['timeProgression'] = new Chart(canvas, {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          reverse: true,
          title: { display: true, text: 'Time (seconds)' },
          ticks: { callback: v => formatSeconds(v) }
        },
        x: { type: 'time', time: { unit: 'month' }, title: { display: true, text: 'Date' } },
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: ctx => {
              const pt = ctx.raw;
              return `${ctx.dataset.label}: ${pt.time}${pt.isPB ? ' (PB!)' : ''}`;
            }
          }
        }
      }
    }
  });
}

function renderHistoryTable(history, eventKey) {
  let filtered = history;
  if (eventKey) {
    const [code, course] = eventKey.split('-');
    filtered = history.filter(h => String(h.stroke_code) === code && h.course === course);
  }

  if (!filtered.length) {
    document.getElementById('historyTable').innerHTML = '<div class="club-empty-state">No history data</div>';
    return;
  }

  // Sort by date descending
  const sorted = [...filtered].sort((a, b) => {
    const da = parseDate(a.date);
    const db = parseDate(b.date);
    return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
  });

  let html = `<table class="data-table"><thead><tr>
    <th>Date</th><th>Event</th><th>Course</th><th>Time</th><th>WA</th><th>Meet</th><th></th>
  </tr></thead><tbody>`;
  sorted.forEach(h => {
    const name = STROKE_NAMES[h.stroke_code] || `Stroke ${h.stroke_code}`;
    const courseLabel = h.course === 'S' ? 'SC' : 'LC';
    const pbBadge = h.is_pb ? '<span class="pb-badge">PB</span>' : '';
    html += `<tr class="${h.is_pb ? 'pb-row' : ''}">
      <td>${h.date || ''}</td>
      <td>${name}</td>
      <td>${courseLabel}</td>
      <td class="time-cell">${h.time}</td>
      <td>${h.wa_points || ''}</td>
      <td>${h.meet_name || ''}</td>
      <td>${pbBadge}</td>
    </tr>`;
  });
  html += '</tbody></table>';
  document.getElementById('historyTable').innerHTML = html;
}

// ── CLUB TAB ──────────────────────────────────────────────
function renderClub() {
  // Stats
  setText('clubSize', ALL_SWIMMERS.length);
  const girls = ALL_SWIMMERS.filter(s => s.sex === 'F').length;
  const boys = ALL_SWIMMERS.filter(s => s.sex === 'M').length;
  setText('clubSizeDetail', `${girls} girls, ${boys} boys`);

  // We'd need all PBs for club stats — skip for now, populate on filter change
  setText('clubPBs', '-');
  setText('clubPBsDetail', 'Select an event');
  setText('clubTopWA', '-');
  setText('clubTopWADetail', '');

  const events = new Set(COUNTY_RANKS.map(r => r.event));
  setText('clubEvents', events.size);
  setText('clubEventsDetail', 'events in county rankings');

  // Event filter options
  const eventFilter = document.getElementById('clubEventFilter');
  if (!eventFilter.dataset.populated) {
    const sorted = [...events].sort();
    eventFilter.innerHTML = '<option value="">Select Event</option>' +
      sorted.map(e => `<option value="${e}">${e}</option>`).join('');
    eventFilter.dataset.populated = 'true';
  }

  eventFilter.onchange = renderClubLeaderboard;
  document.getElementById('clubCourseFilter').onchange = renderClubLeaderboard;
  document.getElementById('clubSexFilter').onchange = renderClubLeaderboard;
}

function renderClubLeaderboard() {
  const event = document.getElementById('clubEventFilter').value;
  const course = document.getElementById('clubCourseFilter').value;
  const sex = document.getElementById('clubSexFilter').value;

  if (!event) {
    document.getElementById('clubLeaderboard').innerHTML = '<div class="club-empty-state">Select an event above</div>';
    document.getElementById('clubLeaderboardTitle').textContent = 'Select an event';
    return;
  }

  let filtered = COUNTY_RANKS.filter(r => r.event === event);
  if (course) filtered = filtered.filter(r => r.course === course);
  if (sex) filtered = filtered.filter(r => r.sex === sex);

  // Get latest year per swimmer (best rank for that year)
  const bySwimmer = {};
  filtered.forEach(r => {
    const key = String(r.tiref);
    if (!bySwimmer[key] || r.year > bySwimmer[key].year ||
        (r.year === bySwimmer[key].year && (r.rank || 999) < (bySwimmer[key].rank || 999))) {
      bySwimmer[key] = r;
    }
  });

  const rows = Object.values(bySwimmer).sort((a, b) => (a.rank || 999) - (b.rank || 999));
  const courseLabel = course || 'All';
  document.getElementById('clubLeaderboardTitle').textContent = `${event} (${courseLabel})`;

  if (!rows.length) {
    document.getElementById('clubLeaderboard').innerHTML = '<div class="club-empty-state">No data for this combination</div>';
    return;
  }

  let html = `<table class="data-table"><thead><tr>
    <th>#</th><th>County Rank</th><th>Swimmer</th><th>YOB</th><th>Time</th><th>Year</th>
  </tr></thead><tbody>`;
  rows.forEach((r, idx) => {
    const isMe = activeSwimmer && String(r.tiref) === String(activeSwimmer.tiref);
    const rowClass = isMe ? 'highlight-row' : '';
    html += `<tr class="${rowClass}">
      <td>${idx + 1}</td>
      <td><strong>#${r.rank || '?'}</strong></td>
      <td>${r.swimmer_name || '?'}</td>
      <td>${r.yob || ''}</td>
      <td class="time-cell">${r.time || ''}</td>
      <td>${r.year}</td>
    </tr>`;
  });
  html += '</tbody></table>';
  document.getElementById('clubLeaderboard').innerHTML = html;
}

// ── Helpers ───────────────────────────────────────────────
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text == null ? '-' : text;
}

// ── Boot ──────────────────────────────────────────────────
init();

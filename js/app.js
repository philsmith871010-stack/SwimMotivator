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

    // Default to Isabella Smith, fall back to first swimmer
    const defaultSwimmer = ALL_SWIMMERS.find(s => s.tiref === 1373165) || ALL_SWIMMERS[0];
    if (defaultSwimmer) {
      await selectSwimmer(defaultSwimmer);
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
  const mergedPBs = mergePBsToSC(pbs);
  setText('statPBCount', mergedPBs.length);
  const lcOrigin = mergedPBs.filter(p => p.originalCourse === 'LC').length;
  setText('statPBDetail', lcOrigin ? `${mergedPBs.length - lcOrigin} SC, ${lcOrigin} converted` : `${mergedPBs.length} SC`);
  setText('statEventsRanked', latestRankings.length);
  setText('statEventsDetail', latestYear ? `County ${latestYear}` : '-');
  setText('statTotalSwims', history.length);
  const events = new Set(history.map(h => `${h.stroke_code}-${h.course}`));
  setText('statSwimsDetail', `across ${events.size} events`);

  // PB Table (all converted to SC equivalent)
  renderPBTable(mergedPBs);

  // Best Rankings
  renderBestRankings(latestRankings, latestYear);
}

function mergePBsToSC(pbs) {
  const byEvent = {};
  pbs.forEach(p => {
    const secs = parseTimeToSeconds(p.time);
    const scSecs = p.course === 'LC'
      ? (p.converted_time ? parseTimeToSeconds(p.converted_time) : toScEquivalent(secs, 'LC', p.stroke))
      : secs;
    if (!scSecs) return;
    const key = p.stroke;
    if (!byEvent[key] || scSecs < byEvent[key].scSecs) {
      byEvent[key] = { ...p, scSecs, scTime: formatSeconds(scSecs), originalCourse: p.course };
    }
  });
  return Object.values(byEvent).sort((a, b) => (a.stroke || '').localeCompare(b.stroke || ''));
}

function renderPBTable(pbs) {
  if (!pbs.length) {
    document.getElementById('pbTable').innerHTML = '<div class="club-empty-state">No personal bests recorded</div>';
    return;
  }

  let html = `<h3 style="margin:1rem 0 0.5rem;color:var(--text-2);font-size:0.85rem">SC Equivalent</h3>`;
  html += `<table class="data-table"><thead><tr>
    <th>Event</th><th>Time</th><th>WA Pts</th><th>Date</th><th>Meet</th>
  </tr></thead><tbody>`;
  pbs.forEach(r => {
    const badge = r.originalCourse === 'LC'
      ? ' <span style="font-size:0.65rem;color:var(--accent-2);opacity:0.7;vertical-align:super">LC</span>' : '';
    html += `<tr>
      <td>${r.stroke}${badge}</td>
      <td class="time-cell">${r.scTime || r.time}</td>
      <td>${r.wa_points || ''}</td>
      <td>${r.date || ''}</td>
      <td>${r.meet || ''}</td>
    </tr>`;
  });
  html += '</tbody></table>';
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

  // Year filter — always default to most recent year
  const yearSelect = document.getElementById('ctyYearFilter');
  yearSelect.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
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
    sorted.forEach((r, i) => {
      const prev = prevRankings.find(pr => pr.event === r.event && pr.course === r.course);
      let change = '';
      if (prev && prev.rank && r.rank) {
        const diff = prev.rank - r.rank;
        if (diff > 0) change = `<span class="rank-up">+${diff}</span>`;
        else if (diff < 0) change = `<span class="rank-down">${diff}</span>`;
        else change = '<span class="rank-same">=</span>';
      }
      const rankClass = r.rank <= 3 ? 'rank-gold' : r.rank <= 10 ? 'rank-silver' : '';
      const key = `${r.event} ${r.course}`;
      html += `<tr data-event-key="${key}" style="cursor:pointer"${i === 0 ? ' class="selected-row"' : ''}>
        <td class="${rankClass}"><strong>#${r.rank || '?'}</strong></td>
        <td>${r.event}</td><td>${r.course}</td><td>${r.age_group}</td>
        <td class="time-cell">${r.time || ''}</td>
        <td>${r.total_in_ranking || '?'}</td>
        <td>${change}</td>
      </tr>`;
    });
    html += '</tbody></table>';
    document.getElementById('countyRankingsList').innerHTML = html;

    // Click row to select event for chart
    const defaultKey = sorted[0] ? `${sorted[0].event} ${sorted[0].course}` : null;
    document.querySelectorAll('#countyRankingsList tr[data-event-key]').forEach(row => {
      row.addEventListener('click', () => {
        document.querySelectorAll('#countyRankingsList tr.selected-row').forEach(r => r.classList.remove('selected-row'));
        row.classList.add('selected-row');
        renderRankProgressionChart(allYearRankings, row.dataset.eventKey);
      });
    });
  }

  // Rank progression chart — default to best-ranked event
  const defaultChartKey = sorted.length ? `${sorted[0].event} ${sorted[0].course}` : null;
  renderRankProgressionChart(allYearRankings, defaultChartKey);

  // Year-on-year comparison
  renderYoYComparison(rankings, years);
}

function renderRankProgressionChart(rankings, selectedKey) {
  destroyChart('rankProgression');
  const canvas = document.getElementById('rankProgressionChart');
  if (!canvas) return;

  // Filter to selected event+course, best rank per year
  const filtered = selectedKey ? rankings.filter(r => `${r.event} ${r.course}` === selectedKey) : rankings;
  const bestByYear = {};
  filtered.forEach(r => {
    if (!bestByYear[r.year] || r.rank < bestByYear[r.year].rank) bestByYear[r.year] = r;
  });
  const entries = Object.values(bestByYear).sort((a, b) => a.year - b.year);
  if (entries.length < 2) {
    canvas.parentElement.querySelector('.club-empty-state')?.remove();
    return;
  }

  const color = '#00e5ff';
  const datasets = [{
    label: selectedKey || 'Rank',
    data: entries.map(e => ({ x: e.year, y: e.rank })),
    borderColor: color,
    backgroundColor: color + '33',
    tension: 0,
    pointRadius: 5,
    borderWidth: 2,
  }];

  charts['rankProgression'] = new Chart(canvas, {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { reverse: true, title: { display: true, text: 'Rank' }, min: 1 },
        x: { type: 'linear', title: { display: true, text: 'Year' }, ticks: { stepSize: 1, callback: v => String(v) } },
      },
      plugins: {
        legend: { display: false },
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

  // Event filter — reset to "All Events" on swimmer change
  const eventFilter = document.getElementById('histEventFilter');
  const eventKeys = [...events].sort((a, b) => {
    const [sa] = a.split('-');
    const [sb] = b.split('-');
    return Number(sa) - Number(sb);
  });

  eventFilter.innerHTML = eventKeys.map(k => {
      const [code, course] = k.split('-');
      const name = STROKE_NAMES[Number(code)] || `Stroke ${code}`;
      const courseLabel = course === 'S' ? 'SC' : 'LC';
      return `<option value="${k}">${name} ${courseLabel}</option>`;
    }).join('');

  // Default to 50 Freestyle SC, fall back to first event
  const defaultEvent = eventKeys.find(k => k === '1-S') || eventKeys[0] || '';
  eventFilter.value = defaultEvent;

  const dateRange = document.getElementById('histDateRange');
  const startAgeInput = document.getElementById('histStartAge');
  const compareAdd = document.getElementById('histCompareAdd');
  const compareTags = document.getElementById('histCompareTags');
  let compareSwimmers = [];
  let compareCache = {};

  startAgeInput.oninput = () => {
    const useAge = startAgeInput.value !== '';
    dateRange.disabled = useAge;
    dateRange.style.opacity = useAge ? '0.4' : '1';
    refreshHistory();
  };

  // Populate compare dropdown with all club swimmers except active
  function populateCompareDropdown() {
    compareAdd.innerHTML = '<option value="">Add swimmer...</option>' +
      ALL_SWIMMERS.filter(s => s.tiref !== activeSwimmer.tiref)
        .map(s => `<option value="${s.tiref}">${s.name}</option>`).join('');
  }
  populateCompareDropdown();

  function renderCompareTags() {
    compareTags.innerHTML = compareSwimmers.map(s =>
      `<span style="background:var(--bg-card);border:1px solid var(--border);border-radius:4px;padding:0.15rem 0.4rem;font-size:0.7rem;color:var(--text-2);display:inline-flex;align-items:center;gap:0.25rem">
        ${s.name}<span data-tiref="${s.tiref}" style="cursor:pointer;color:var(--text-3);font-size:0.8rem">&times;</span>
      </span>`
    ).join('');
    compareTags.querySelectorAll('span[data-tiref]').forEach(x => {
      x.addEventListener('click', () => {
        compareSwimmers = compareSwimmers.filter(s => String(s.tiref) !== x.dataset.tiref);
        renderCompareTags();
        refreshHistory();
      });
    });
  }

  compareAdd.onchange = async () => {
    const tiref = compareAdd.value;
    if (!tiref || compareSwimmers.find(s => String(s.tiref) === tiref)) { compareAdd.value = ''; return; }
    const swimmer = ALL_SWIMMERS.find(s => String(s.tiref) === tiref);
    if (!swimmer) return;
    if (!compareCache[tiref]) {
      try {
        const resp = await fetch(`${DATA_BASE}/swimmers/${tiref}.json`);
        compareCache[tiref] = await resp.json();
      } catch { compareCache[tiref] = { history: [] }; }
    }
    compareSwimmers.push(swimmer);
    compareAdd.value = '';
    renderCompareTags();
    refreshHistory();
  };

  const refreshHistory = () => {
    const startAge = startAgeInput.value !== '' ? Number(startAgeInput.value) : null;
    const useAge = startAge !== null;
    const years = Number(dateRange.value);
    const cutoff = (!useAge && years) ? new Date(Date.now() - years * 365.25 * 24 * 60 * 60 * 1000) : null;
    const filtered = cutoff ? history.filter(h => { const d = parseDate(h.date); return d && d >= cutoff; }) : history;
    const compData = compareSwimmers.map(s => {
      const h = (compareCache[s.tiref] && compareCache[s.tiref].history) || [];
      return { name: s.name, yob: s.yob, history: cutoff ? h.filter(r => { const d = parseDate(r.date); return d && d >= cutoff; }) : h };
    });
    renderTimeChart(filtered, eventFilter.value, compData, useAge, startAge);
    renderHistoryTable(filtered, eventFilter.value);
  };
  eventFilter.onchange = refreshHistory;
  dateRange.onchange = refreshHistory;

  refreshHistory();
}

function dateToAge(date, yob) {
  if (!date || !yob) return null;
  const dob = new Date(yob, 11, 31);
  return (date.getTime() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
}

function renderTimeChart(history, eventKey, compareData, useAge, startAge) {
  destroyChart('timeProgression');
  const canvas = document.getElementById('timeProgressionChart');
  if (!canvas || !eventKey) return;

  const [code, course] = eventKey.split('-');
  const filtered = history.filter(h => String(h.stroke_code) === code && h.course === course);
  if (!filtered.length) return;

  const toX = (date, yob) => useAge ? dateToAge(date, yob) : date;

  const entries = filtered
    .map(h => {
      const d = parseDate(h.date);
      const x = toX(d, activeSwimmer.yob);
      const age = dateToAge(d, activeSwimmer.yob);
      return { x, y: parseTimeToSeconds(h.time), isPB: h.is_pb, time: h.time, age };
    })
    .filter(e => e.x != null && e.y && (!useAge || !startAge || e.age >= startAge))
    .sort((a, b) => a.x - b.x);

  if (!entries.length) return;
  const color = '#00e5ff';
  const hasCompare = compareData && compareData.length > 0;

  // Comparison swimmers behind
  const compColors = ['#ff4081', '#ffd740', '#69f0ae', '#b388ff', '#ff6e40', '#80cbc4'];
  const datasets = [];

  if (hasCompare) {
    compareData.forEach((comp, i) => {
      const compEntries = comp.history
        .filter(h => String(h.stroke_code) === code && h.course === course)
        .map(h => {
          const d = parseDate(h.date);
          const x = toX(d, comp.yob);
          return { x, y: parseTimeToSeconds(h.time), time: h.time, age: dateToAge(d, comp.yob) };
        })
        .filter(e => e.x != null && e.y && (!useAge || !startAge || e.age >= startAge))
        .sort((a, b) => a.x - b.x);
      if (!compEntries.length) return;
      const c = compColors[i % compColors.length];
      datasets.push({
        label: comp.name,
        data: compEntries,
        borderColor: c + '66',
        backgroundColor: c + '33',
        pointRadius: 0,
        tension: 0,
        showLine: true,
        borderWidth: 1.5,
        borderDash: [4, 3],
        order: 2,
      });
    });
  }

  // Active swimmer on top
  datasets.push({
    label: activeSwimmer.name,
    data: entries,
    borderColor: color,
    backgroundColor: entries.map(e => e.isPB ? '#FFD700' : color + '80'),
    pointRadius: entries.map(e => e.isPB ? 7 : 3),
    pointStyle: entries.map(e => e.isPB ? 'star' : 'circle'),
    pointBorderColor: entries.map(e => e.isPB ? '#FFD700' : color),
    pointBorderWidth: entries.map(e => e.isPB ? 2 : 1),
    tension: 0,
    showLine: true,
    borderWidth: 2,
    order: 1,
  });

  const xScale = useAge
    ? { type: 'linear', title: { display: true, text: 'Age' }, ticks: { callback: v => v.toFixed(1) } }
    : { type: 'time', time: { unit: 'month' }, title: { display: true, text: 'Date' } };

  charts['timeProgression'] = new Chart(canvas, {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          reverse: true,
          title: { display: true, text: 'Time' },
          ticks: { callback: v => formatSeconds(v) }
        },
        x: xScale,
      },
      plugins: {
        legend: { display: hasCompare, labels: { usePointStyle: false, boxWidth: 12, font: { size: 10 } } },
        tooltip: {
          callbacks: {
            label: ctx => {
              const pt = ctx.raw;
              const prefix = hasCompare ? ctx.dataset.label + ': ' : '';
              const ageStr = pt.age != null ? ` (age ${pt.age.toFixed(1)})` : '';
              return `${prefix}${pt.time}${pt.isPB ? ' \u{1F3C5} PB!' : ''}${useAge ? '' : ageStr}`;
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

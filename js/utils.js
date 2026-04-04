/* SwimMotivator — Shared utilities */

const DATA_BASE = 'data/json';

async function fetchJSON(path) {
  const resp = await fetch(`${DATA_BASE}/${path}`);
  if (!resp.ok) throw new Error(`Failed to load ${path}: ${resp.status}`);
  return resp.json();
}

function parseTimeToSeconds(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const t = timeStr.trim();
  if (!t) return null;
  if (t.includes(':')) {
    const parts = t.split(':');
    if (parts.length !== 2) return null;
    const mins = Number(parts[0]);
    const secs = Number(parts[1]);
    if (!Number.isFinite(mins) || !Number.isFinite(secs)) return null;
    return mins * 60 + secs;
  }
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

function formatSeconds(v) {
  if (v == null || Number.isNaN(v)) return '';
  if (v >= 60) {
    const mins = Math.floor(v / 60);
    const secs = (v % 60).toFixed(2).padStart(5, '0');
    return `${mins}:${secs}`;
  }
  return v.toFixed(2);
}

function parseDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  const day = Number(parts[0]);
  const month = Number(parts[1]);
  let year = Number(parts[2]);
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
  if (year < 100) year += 2000;
  return new Date(year, month - 1, day);
}

function sortByDate(a, b) {
  const da = parseDate(a.date || a.meet_date || '');
  const db = parseDate(b.date || b.meet_date || '');
  return (da ? da.getTime() : 0) - (db ? db.getTime() : 0);
}

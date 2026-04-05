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

// ── British Swimming Equivalent Time Conversion ─────────
// Official SPORTSYSTEMS algorithm for LC <-> SC conversion.
// Uses physics-based turn factors per event (not simple percentages).
// Source: British Swimming / Chester-le-Street ASC EquivalentTime

const TURN_FACTORS = {
  '50 Freestyle': 42.245, '100 Freestyle': 42.245,
  '200 Freestyle': 43.786, '400 Freestyle': 44.233,
  '800 Freestyle': 45.525, '1500 Freestyle': 46.221,
  '50 Breaststroke': 63.616, '100 Breaststroke': 63.616,
  '200 Breaststroke': 66.598,
  '50 Butterfly': 38.269, '100 Butterfly': 38.269,
  '200 Butterfly': 39.76,
  '50 Backstroke': 40.5, '100 Backstroke': 40.5,
  '200 Backstroke': 41.98,
  '100 Individual Medley': 49.7,
  '200 Individual Medley': 49.7, '400 Individual Medley': 55.366,
};

function getEventDistance(event) {
  const m = event.match(/(\d+)/);
  return m ? parseInt(m[1]) : 0;
}

/**
 * Convert SC (25m) time to LC (50m) equivalent using British Swimming algorithm.
 * @param {number} scSeconds - SC time in seconds
 * @param {string} event - Event name e.g. "200 Freestyle"
 * @returns {number|null} LC equivalent time in seconds
 */
function scToLc(scSeconds, event) {
  const tf = TURN_FACTORS[event];
  if (!tf || !scSeconds) return null;
  const dist = getEventDistance(event);
  if (!dist) return null;
  const turnsPerHundredSc = 3; // 25m pool
  const numTurnFactor = (dist / 100) * (dist / 100) * (turnsPerHundredSc - 1);
  // SC -> LC: sourceTime + sqrt(sourceTime^2 + 4 * 1 * turnFactor * numTurnFactor) / 2
  const lcTime = (scSeconds + Math.sqrt(scSeconds * scSeconds + 4 * tf * numTurnFactor)) / 2;
  return lcTime;
}

/**
 * Convert LC (50m) time to SC (25m) equivalent using British Swimming algorithm.
 * @param {number} lcSeconds - LC time in seconds
 * @param {string} event - Event name e.g. "200 Freestyle"
 * @returns {number|null} SC equivalent time in seconds
 */
function lcToSc(lcSeconds, event) {
  const tf = TURN_FACTORS[event];
  if (!tf || !lcSeconds) return null;
  const dist = getEventDistance(event);
  if (!dist) return null;
  const turnsPerHundredSc = 3;
  const turnValue = (tf / lcSeconds) * (dist / 100);
  const distanceTime = lcSeconds; // poolMeasure = 1 for metric
  const turnTime = turnValue * (dist / 100) * (turnsPerHundredSc - 1);
  const converted = distanceTime - turnTime + 0.05;
  return Math.floor(converted * 10) / 10;
}

/**
 * Normalise an event name from data to match TURN_FACTORS keys.
 * Handles variations like "50 Free", "200 IM", stroke codes, etc.
 */
function normaliseEvent(event) {
  if (!event) return event;
  const e = event.trim();
  // Already a standard name?
  if (TURN_FACTORS[e]) return e;
  // Map short forms
  const map = {
    'Free': 'Freestyle', 'Back': 'Backstroke', 'Breast': 'Breaststroke',
    'Fly': 'Butterfly', 'IM': 'Individual Medley',
  };
  for (const [short, long] of Object.entries(map)) {
    const re = new RegExp(`^(\\d+)\\s+${short}$`, 'i');
    const m = e.match(re);
    if (m) {
      const full = `${m[1]} ${long}`;
      if (TURN_FACTORS[full]) return full;
    }
  }
  return event;
}

/**
 * Convert any time to SC equivalent seconds.
 * If already SC, returns the time as-is. If LC, converts.
 * @param {number} seconds - Time in seconds
 * @param {string} course - "SC", "LC", "S", "L"
 * @param {string} event - Event name
 * @returns {number|null} SC equivalent seconds
 */
function toScEquivalent(seconds, course, event) {
  if (!seconds) return null;
  const isLc = course === 'LC' || course === 'L';
  if (!isLc) return seconds;
  return lcToSc(seconds, normaliseEvent(event));
}

/* SwimMotivator — Chart.js configurations and dark theme */

const CHART_COLORS = {
  bella: '#ff4081',
  bellaGlow: 'rgba(255, 64, 129, 0.2)',
  amber: '#00e5ff',
  amberGlow: 'rgba(0, 229, 255, 0.2)',
  gold: '#ffd740',
  peer: 'rgba(138, 150, 180, 0.3)',
  peerLine: 'rgba(138, 150, 180, 0.15)',
  purple: '#b388ff',
  green: '#69f0ae',
  orange: '#ffab40',
  grid: '#1e2640',
  gridLight: 'rgba(30, 38, 64, 0.6)',
  tick: '#5a6480',
  tooltipBg: '#1a2035',
  tooltipBorder: '#2a3352',
};

// Dark theme defaults
Chart.defaults.color = '#8892a8';
Chart.defaults.borderColor = CHART_COLORS.grid;
Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
Chart.defaults.font.size = 12;
Chart.defaults.plugins.legend.labels.usePointStyle = true;
Chart.defaults.plugins.legend.labels.pointStyle = 'circle';
Chart.defaults.plugins.legend.labels.padding = 16;
Chart.defaults.plugins.tooltip.backgroundColor = CHART_COLORS.tooltipBg;
Chart.defaults.plugins.tooltip.borderColor = CHART_COLORS.tooltipBorder;
Chart.defaults.plugins.tooltip.borderWidth = 1;
Chart.defaults.plugins.tooltip.cornerRadius = 8;
Chart.defaults.plugins.tooltip.padding = 12;
Chart.defaults.plugins.tooltip.titleFont = { weight: '600', size: 13 };
Chart.defaults.plugins.tooltip.bodyFont = { size: 12 };

const chartInstances = {};

function destroyChart(name) {
  if (chartInstances[name]) {
    chartInstances[name].destroy();
    delete chartInstances[name];
  }
}

function timeScaleConfig() {
  return {
    type: 'time',
    time: { parser: 'dd/MM/yyyy', unit: 'month', displayFormats: { month: 'MMM yy' } },
    grid: { color: CHART_COLORS.gridLight },
    ticks: { color: CHART_COLORS.tick, maxRotation: 45 },
  };
}

function timeYAxisConfig() {
  return {
    reverse: true,
    grid: { color: CHART_COLORS.gridLight },
    ticks: {
      color: CHART_COLORS.tick,
      callback: v => formatSeconds(v),
    },
  };
}

function buildSwimmerDataset(rows, label, color, glowColor) {
  const data = rows
    .map(r => ({
      x: parseDate(r.date || ''),
      y: parseTimeToSeconds(r.time),
      meetName: r.meet_name || 'N/A',
      rawDate: r.date || 'N/A',
      rawTime: r.time || '',
      waPoints: r.wa_points,
      isPb: Number(r.is_pb || 0) === 1,
    }))
    .filter(p => p.x && Number.isFinite(p.y));

  return {
    label,
    data,
    borderColor: color,
    backgroundColor: glowColor,
    pointBackgroundColor: data.map(p => p.isPb ? CHART_COLORS.gold : color),
    pointRadius: data.map(p => p.isPb ? 7 : 3),
    pointHoverRadius: 9,
    borderWidth: 2.5,
    spanGaps: true,
    tension: 0.25,
    fill: false,
  };
}

function swimTooltipCallbacks() {
  return {
    title: items => items.length ? items[0].dataset.label : '',
    label: ctx => {
      const p = ctx.raw || {};
      return [
        `Time: ${formatSeconds(p.y)}`,
        `Date: ${p.rawDate}`,
        `Meet: ${p.meetName}`,
        `WA: ${p.waPoints ?? 'N/A'}`,
        p.isPb ? 'PB!' : '',
      ].filter(Boolean);
    },
  };
}

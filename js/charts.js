/* SwimMotivator v3 — Chart configurations */

const COLORS = {
  bella: '#ff4081',
  bellaGlow: 'rgba(255, 64, 129, 0.15)',
  amber: '#00e5ff',
  amberGlow: 'rgba(0, 229, 255, 0.15)',
  gold: '#ffd740',
  purple: '#b388ff',
  green: '#69f0ae',
  red: '#ff5252',
  grid: 'rgba(30, 38, 64, 0.6)',
  tick: '#5a6480',
  tooltipBg: '#1a2035',
  tooltipBorder: '#2a3352',
};

Chart.defaults.color = '#8892a8';
Chart.defaults.borderColor = 'rgba(30, 38, 64, 0.4)';
Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
Chart.defaults.font.size = 11;
Chart.defaults.plugins.tooltip.backgroundColor = COLORS.tooltipBg;
Chart.defaults.plugins.tooltip.borderColor = COLORS.tooltipBorder;
Chart.defaults.plugins.tooltip.borderWidth = 1;
Chart.defaults.plugins.tooltip.cornerRadius = 8;
Chart.defaults.plugins.tooltip.padding = 10;

const charts = {};

function destroyChart(name) {
  if (charts[name]) { charts[name].destroy(); delete charts[name]; }
}

// js/chart.js

Chart.register({
  id: 'lightDark',
  beforeDraw(chart) {
    const {
      ctx,
      chartArea: { left, right, top, bottom },
      scales: { x }
    } = chart;
    ctx.save();

    // Clip to chart area
    ctx.beginPath();
    ctx.rect(left, top, right - left, bottom - top);
    ctx.clip();

    // dark half (0–720)
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    const darkStart = Math.max(x.getPixelForValue(0), left);
    const darkEnd = Math.min(x.getPixelForValue(720), right);
    if (darkEnd > darkStart) {
      ctx.fillRect(darkStart, top, darkEnd - darkStart, bottom - top);
    }

    // light half (720–1439)
    ctx.fillStyle = 'rgba(255,255,200,0.2)';
    const lightStart = Math.max(x.getPixelForValue(720), left);
    const lightEnd = Math.min(x.getPixelForValue(1439), right);
    if (lightEnd > lightStart) {
      ctx.fillRect(lightStart, top, lightEnd - lightStart, bottom - top);
    }

    ctx.restore();
  }
});

let currentChart = null;
let currentEventListeners = [];

let zoomState = {
  originalXMin: 0,
  originalXMax: 1439
};

let panState = {
  isPanning: false,
  startX: 0,
  startMin: 0,
  startMax: 0
};

document.addEventListener('DOMContentLoaded', async () => {
  // 1) Fetch the XLSX workbook
  let wb;
  try {
    const resp = await fetch('../data/Mouse_Data.xlsx');
    const ab = await resp.arrayBuffer();
    wb = XLSX.read(ab, { type: 'array' });
  } catch (err) {
    console.error('⚠️ could not load XLSX:', err);
    return;
  }

  // 2) Helper to convert a sheet into rows
  function sheetToRows(name) {
    const raw = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1 });
    const ids = raw[0].slice(1);
    return raw.slice(1).map((row) => {
      const obj = {};
      ids.forEach((id, i) => {
        obj[id] = +row[i + 1];
      });
      return obj;
    });
  }

  // 3) Load all four sheets
  const dataSets = {
    maleAct: sheetToRows('Male Act'),
    femAct: sheetToRows('Fem Act'),
    maleTemp: sheetToRows('Male Temp'),
    femTemp: sheetToRows('Fem Temp')
  };

  // 4) Grab references to the mode toggle buttons
  const btnA = document.getElementById('btnActivity');
  const btnT = document.getElementById('btnTemperature');
  if (btnA && btnT) {
    btnA.addEventListener('click', () =>
      initChart('Activity', dataSets.maleAct, dataSets.femAct)
    );
    btnT.addEventListener('click', () =>
      initChart('Temperature', dataSets.maleTemp, dataSets.femTemp)
    );
  } else {
    console.warn('btnActivity / btnTemperature not found—mode toggle disabled');
  }

  // 5) Insert a “zoom‐hint” below the canvas if not present
  if (!document.getElementById('zoomHint')) {
    const visualization = document.getElementById('visualization');
    if (visualization) {
      const hint = document.createElement('div');
      hint.id = 'zoomHint';
      hint.style.cssText =
        'text-align: center; font-size: 0.9em; color: #666; margin-top: 10px;';
      hint.textContent =
        'Use mouse wheel to zoom in/out • Click and drag to pan when zoomed • Zoom out fully to reset view';
      visualization.appendChild(hint);
    }
  }

  // 6) Read URL query‐string to decide initial mode
  const params = new URLSearchParams(window.location.search);
  const requestedMode = params.get('mode') || 'Activity';

  if (requestedMode === 'Temperature') {
    initChart('Temperature', dataSets.maleTemp, dataSets.femTemp);
  } else {
    initChart('Activity', dataSets.maleAct, dataSets.femAct);
  }
});

function cleanupEventListeners() {
  currentEventListeners.forEach(({ element, event, handler }) => {
    element.removeEventListener(event, handler);
  });
  currentEventListeners = [];
}

function initChart(mode, maleRows, femRows) {
  // Remove old chart & listeners
  cleanupEventListeners();

  const canvasEl = document.getElementById('homeChart');
  if (!canvasEl) {
    console.error('Canvas element #homeChart not found');
    return;
  }

  canvasEl.style.userSelect = 'none';
  canvasEl.style.webkitUserSelect = 'none';
  canvasEl.style.mozUserSelect = 'none';
  canvasEl.style.msUserSelect = 'none';

  if (currentChart) {
    currentChart.destroy();
    currentChart = null;
  }

  zoomState = {
    originalXMin: 0,
    originalXMax: 1439
  };

  panState = {
    isPanning: false,
    startX: 0,
    startMin: 0,
    startMax: 0
  };

  // Compute averages and raw curves
  const total = maleRows.length;
  const days = Math.floor(total / 1440);

  function avgCurve(rows, id, wantEstrus = null) {
    const sum = Array(1440).fill(0),
      cnt = Array(1440).fill(0);
    rows.forEach((r, i) => {
      const day = Math.floor(i / 1440) + 1,
        m = i % 1440;
      if (wantEstrus !== null) {
        const isE = ( (day - 2) % 4 === 0 );
        if (isE !== wantEstrus) return;
      }
      sum[m] += r[id];
      cnt[m]++;
    });
    return sum.map((s, j) => (cnt[j] ? s / cnt[j] : 0));
  }

  const maleIDs = Object.keys(maleRows[0]),
    femIDs = Object.keys(femRows[0]);

  const maleCurves = maleIDs.map((id) => avgCurve(maleRows, id, null)),
    femECurves = femIDs.map((id) => avgCurve(femRows, id, true)),
    femNECurves = femIDs.map((id) => avgCurve(femRows, id, false));

  function groupAvg(curves) {
    return curves[0].map((_, i) => curves.reduce((s, c) => s + c[i], 0) / curves.length);
  }

  const maleAvg = groupAvg(maleCurves),
    femEAvg = groupAvg(femECurves),
    femNEAvg = groupAvg(femNECurves);

  const datasets = [
    mkDS(maleAvg, 'Male (avg)', 'lightblue', 'maleAvg', true),
    mkDS(femNEAvg, 'Female non-estrus (avg)', 'lightpink', 'femNEAvg', true),
    mkDS(femEAvg, 'Female estrus (avg)', '#d93d5f', 'femEAvg', true)
  ];

  maleCurves.concat(femNECurves, femECurves).forEach((curve) => {
    datasets.push(mkDS(curve, '', 'transparent', '', false));
  });

  function minuteToTime(m) {
    const h = Math.floor(m / 60),
      mm = m % 60;
    return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  const ctx = canvasEl.getContext('2d');
  const config = {
    type: 'line',
    data: { labels: Array.from({ length: 1440 }, (_, i) => i), datasets },
    options: {
      plugins: {
        lightDark: {},
        legend: {
          labels: {
            filter: (item) => item.text !== ''
          },
          onClick: (event, item, legend) => {
            const chart = legend.chart;
            const grp = chart.data.datasets[item.datasetIndex].metaGroup;
            const show = chart.data.datasets[item.datasetIndex].hidden;

            chart.data.datasets.forEach((ds) => {
              if (ds.metaGroup === grp && ds.label === '') {
                ds.hidden = !show;
              }
            });
            chart.update();
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: 'Time of Day' },
          ticks: { callback: minuteToTime, maxTicksLimit: 12, stepSize: 120 },
          min: 0,
          max: 1439
        },
        y: {
          title: { display: true, text: mode }
        }
      },
      interaction: {
        mode: 'nearest',
        intersect: false,
        axis: 'x'
      },
      elements: { point: { radius: 0 } },
      tooltip: {
        callbacks: {
          title: (items) => minuteToTime(items[0].label),
          label: (ctx) => {
            const L = ctx.dataset.label;
            return `${L}${L ? ': ' : ''}${ctx.parsed.y.toFixed(1)}`;
          },
          labelColor: (ctx) => ({
            borderColor: ctx.dataset.borderColor,
            backgroundColor: ctx.dataset.backgroundColor
          })
        }
      },
      onHover: (event, activeElements) => {
        const xScale = currentChart.scales.x;
        const isZoomed = xScale.min > 0 || xScale.max < 1439;
        ctx.canvas.style.cursor = isZoomed
          ? 'grab'
          : activeElements.length > 0
          ? 'pointer'
          : 'default';
      }
    }
  };

  currentChart = new Chart(ctx, config);

  canvasEl.addEventListener('wheel', handleZoom);
  currentEventListeners.push({
    element: canvasEl,
    event: 'wheel',
    handler: handleZoom
  });

  const panHandlers = {
    mousedown: handlePanStart,
    mousemove: handlePanMove,
    mouseup: handlePanEnd,
    mouseleave: handlePanEnd,
    touchstart: handlePanStart,
    touchmove: handlePanMove,
    touchend: handlePanEnd
  };

  Object.entries(panHandlers).forEach(([event, handler]) => {
    canvasEl.addEventListener(event, handler);
    currentEventListeners.push({
      element: canvasEl,
      event: event,
      handler: handler
    });
  });

  // 7) Programmatically set the checkboxes based on URL‐param "group"
  const params = new URLSearchParams(window.location.search);
  const requestedGroup = params.get('group'); // e.g. "female" or "male"

  if (requestedGroup === 'female') {
    // Uncheck “Male” & “Female (Non-Estrus)”, leave only “Female (Estrus)” checked:
    const maleCB = document.getElementById('maleToggle');
    const femNECB = document.getElementById('femaleNonEstrusToggle');
    const femECB = document.getElementById('femaleEstrusToggle');
    if (maleCB) maleCB.checked = false;
    if (femNECB) femNECB.checked = false;
    if (femECB) femECB.checked = true;

    // Hide all datasets except the one whose metaGroup === 'femEAvg':
    currentChart.data.datasets.forEach((ds) => {
      if (ds.metaGroup === 'femEAvg') ds.hidden = false;
      else ds.hidden = true;
    });
    currentChart.update();
  } else if (requestedGroup === 'male') {
    // Uncheck “Female (Non-Estrus)” & “Female (Estrus)”, leave only “Male” checked:
    const maleCB = document.getElementById('maleToggle');
    const femNECB = document.getElementById('femaleNonEstrusToggle');
    const femECB = document.getElementById('femaleEstrusToggle');
    if (maleCB) maleCB.checked = true;
    if (femNECB) femNECB.checked = false;
    if (femECB) femECB.checked = false;

    // Hide all datasets except the one whose metaGroup === 'maleAvg':
    currentChart.data.datasets.forEach((ds) => {
      if (ds.metaGroup === 'maleAvg') ds.hidden = false;
      else ds.hidden = true;
    });
    currentChart.update();
  }
  // (If you need other behaviors, e.g. group="femaleNonEstrus", add similar blocks here)

  // 8) Wire up the checkboxes so they toggle the chart dataset as normal
  const map = {
    maleToggle: 'maleAvg',
    femaleNonEstrusToggle: 'femNEAvg',
    femaleEstrusToggle: 'femEAvg'
  };

  Object.entries(map).forEach(([cbId, grp]) => {
    const cb = document.getElementById(cbId);
    if (!cb) {
      console.warn(`checkbox #${cbId} not found`);
      return;
    }

    const handler = (e) => {
      if (currentChart) {
        currentChart.data.datasets.forEach((ds) => {
          if (ds.metaGroup === grp && ds.label !== '') {
            ds.hidden = !e.target.checked;
          }
        });
        currentChart.update();
      }
    };

    cb.addEventListener('change', handler);
    currentEventListeners.push({
      element: cb,
      event: 'change',
      handler: handler
    });
  });
}

function mkDS(data, label, color, metaGroup, visible) {
  return {
    label,
    data,
    borderColor: label ? color : 'transparent',
    backgroundColor: label ? color : 'transparent',
    fill: false,
    pointRadius: 0,
    pointHitRadius: 0,
    hidden: !visible,
    metaGroup
  };
}

function handleZoom(e) {
  e.preventDefault();

  if (!currentChart || panState.isPanning) return;

  const rect = e.target.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const chartArea = currentChart.chartArea;

  if (x < chartArea.left || x > chartArea.right) return;

  const xScale = currentChart.scales.x;
  const currentMin = xScale.min;
  const currentMax = xScale.max;
  const range = currentMax - currentMin;

  const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
  const mouseX = xScale.getValueForPixel(x);

  let newRange = range * zoomFactor;
  const minRange = 60;
  const maxRange = 1439;
  newRange = Math.max(minRange, Math.min(maxRange, newRange));

  const ratio = (mouseX - currentMin) / range;
  let newMin = mouseX - newRange * ratio;
  let newMax = mouseX + newRange * (1 - ratio);

  if (newMin < 0) {
    newMin = 0;
    newMax = newRange;
  }
  if (newMax > 1439) {
    newMax = 1439;
    newMin = 1439 - newRange;
  }

  xScale.options.min = Math.round(newMin);
  xScale.options.max = Math.round(newMax);
  currentChart.update('none');
}

function handlePanStart(e) {
  if (!currentChart) return;

  const xScale = currentChart.scales.x;
  const isZoomed = xScale.min > 0 || xScale.max < 1439;
  if (!isZoomed) return;

  const rect = e.target.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const x = clientX - rect.left;
  const chartArea = currentChart.chartArea;
  if (x < chartArea.left || x > chartArea.right) return;

  e.preventDefault();
  panState.isPanning = true;
  panState.startX = clientX;
  panState.startMin = xScale.min;
  panState.startMax = xScale.max;
  e.target.style.cursor = 'grabbing';
}

function handlePanMove(e) {
  if (!panState.isPanning || !currentChart) return;
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const xScale = currentChart.scales.x;
  const deltaX = clientX - panState.startX;

  const dataRange = panState.startMax - panState.startMin;
  const pixelRange = currentChart.chartArea.right - currentChart.chartArea.left;
  const dataDelta = -(deltaX / pixelRange) * dataRange;

  let newMin = panState.startMin + dataDelta;
  let newMax = panState.startMax + dataDelta;

  if (newMin < 0) {
    newMin = 0;
    newMax = newMin + dataRange;
  }
  if (newMax > 1439) {
    newMax = 1439;
    newMin = newMax - dataRange;
  }

  xScale.options.min = Math.round(newMin);
  xScale.options.max = Math.round(newMax);
  currentChart.update('none');
}

function handlePanEnd(e) {
  if (!panState.isPanning) return;
  panState.isPanning = false;

  if (currentChart) {
    const xScale = currentChart.scales.x;
    const isZoomed = xScale.min > 0 || xScale.max < 1439;
    e.target.style.cursor = isZoomed ? 'grab' : 'default';
  }
}

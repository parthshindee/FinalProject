// js/chart.js

// 0) Define & register our light/dark shading plugin ONCE
Chart.register({
  id: 'lightDark',
  beforeDraw(chart) {
    const { ctx, chartArea: { top, bottom }, scales: { x } } = chart;
    ctx.save();
    // dark half (0–720)
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    ctx.fillRect(
      x.getPixelForValue(0), top,
      x.getPixelForValue(720) - x.getPixelForValue(0),
      bottom - top
    );
    // light half (720–1439)
    ctx.fillStyle = 'rgba(255,255,200,0.2)';
    ctx.fillRect(
      x.getPixelForValue(720), top,
      x.getPixelForValue(1439) - x.getPixelForValue(720),
      bottom - top
    );
    ctx.restore();
  }
});


document.addEventListener('DOMContentLoaded', async () => {
  let wb;
  try {
    const resp = await fetch('data/Mouse_Data.xlsx');
    const ab   = await resp.arrayBuffer();
    wb = XLSX.read(ab, { type: 'array' });
  } catch (err) {
    console.error('⚠️ could not load XLSX:', err);
    return;
  }

  // Helper: turn a sheet into [{ mouseID: value, … }, …]
  function sheetToRows(name) {
    const raw = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1 });
    const ids = raw[0].slice(1);
    return raw.slice(1).map(row => {
      const obj = {};
      ids.forEach((id,i) => obj[id] = +row[i+1]);
      return obj;
    });
  }

  // Parse all four sheets into our dataSets object
  const dataSets = {
    maleAct:   sheetToRows('Male Act'),
    femAct:    sheetToRows('Fem Act'),
    maleTemp:  sheetToRows('Male Temp'),
    femTemp:   sheetToRows('Fem Temp')
  };

  // Grab our two mode‐toggle buttons
  const btnA = document.getElementById('btnActivity');
  const btnT = document.getElementById('btnTemperature');

  if (!btnA || !btnT) {
    console.warn('btnActivity / btnTemperature not found—mode toggle disabled');
  } else {
    // Register exactly one listener per button:
    btnA.addEventListener('click', () => {
      initChart('Activity', dataSets.maleAct, dataSets.femAct);
      setActiveButton('Activity');
    });
    btnT.addEventListener('click', () => {
      initChart('Temperature', dataSets.maleTemp, dataSets.femTemp);
      setActiveButton('Temperature');
    });
  }

  // INITIAL DRAW defaulting to Activity
  initChart('Activity', dataSets.maleAct, dataSets.femAct);
  setActiveButton('Activity');
});


/**
 *  setActiveButton(which) toggles the `.active` class on the two .mode-btns.
 *  Pass in exactly either 'Activity' or 'Temperature'.
 */
function setActiveButton(which) {
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  const id = which === 'Activity' ? 'btnActivity' : 'btnTemperature';
  const button = document.getElementById(id);
  if (button) button.classList.add('active');
}


function initChart(mode, maleRows, femRows) {
  // 1) Destroy any existing Chart on #homeChart
  const canvasEl = document.getElementById('homeChart');
  const existing = Chart.getChart(canvasEl);
  if (existing) {
    existing.destroy();
  }

  // 2) Compute how many days we have (each CSV is minute‐by‐minute rows)
  const total = maleRows.length;
  const days  = Math.floor(total / 1440);

  // 3) Helper to average a single mouse's 1440‐point curve.
  //    If wantEstrus is `true`, only include estrus days ((day−2)%4===0).
  //    If wantEstrus is `false`, only include non-estrus days.
  //    If wantEstrus is `null`, include all days.
  function avgCurve(rows, id, wantEstrus = null) {
    const sum = Array(1440).fill(0),
          cnt = Array(1440).fill(0);

    rows.forEach((r,i) => {
      const day = Math.floor(i / 1440) + 1,
            m   = i % 1440;

      if (wantEstrus !== null) {
        const isE = ((day - 2) % 4 === 0);
        if (isE !== wantEstrus) return;
      }

      sum[m] += r[id];
      cnt[m]++;
    });

    return sum.map((s,j) => cnt[j] ? s / cnt[j] : 0);
  }

  // 4) Get all mouse IDs for maleRows/femRows
  const maleIDs = Object.keys(maleRows[0] || {});
  const femIDs  = Object.keys(femRows[0]  || {});

  // 5) Build arrays of 1440‐length “curves” for each individual mouse:
  const maleCurves   = maleIDs.map(id => avgCurve(maleRows, id, null));
  const femEcurves   = femIDs.map(id => avgCurve(femRows, id, true));
  const femNEcurves  = femIDs.map(id => avgCurve(femRows, id, false));

  // 6) Compute a “group average” of any set of curves:
  function groupAvg(curves) {
    return curves[0].map((_,i) => 
      curves.reduce((s,c) => s + c[i], 0) / curves.length
    );
  }

  // 7) Build the three “average” curves:
  const maleAvg = groupAvg(maleCurves);
  const femEAvg = groupAvg(femEcurves);
  const femNEAvg= groupAvg(femNEcurves);

  // 8) Build our three “average” datasets (visible in legend by default):
  const datasets = [
    mkDS(maleAvg,   'Male (avg)',              'lightblue', 'maleAvg',  true),
    mkDS(femNEAvg,  'Female non-estrus (avg)', 'lightpink', 'femNEAvg', true),
    mkDS(femEAvg,   'Female estrus (avg)',     '#d93d5f',   'femEAvg',  true)
  ];

  // 9) Append all hidden individual‐mouse curves (no labels, transparent),
  //    so they only appear when the user clicks on a legend entry:
  maleCurves.concat(femNEcurves, femEcurves).forEach(curve => {
    datasets.push(mkDS(curve, '', 'transparent', '', false));
  });

  // 10) Build Chart.js config
  function minuteToTime(m) {
    const h = Math.floor(m/60), mm = m % 60;
    return `${String(h).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
  }

  const ctx = canvasEl.getContext('2d');
  const config = {
    type: 'line',
    data: {
      labels: Array.from({ length: 1440 }, (_, i) => i),
      datasets
    },
    options: {
      plugins: {
        lightDark: {},
        legend: {
          labels: {
            // Only show legend items whose text is non‐empty
            filter: item => item.text !== ''
          },
          onClick: (_, item) => {
            // When the user clicks any one of the three “avg” legend items,
            // toggle the visibility of all matching hidden curves for that group.
            const grp  = config.data.datasets[item.datasetIndex].metaGroup;
            // The clicked‐on average is currently either hidden==false or hidden==true.
            const show = config.data.datasets[item.datasetIndex].hidden;
            config.data.datasets.forEach(ds => {
              if (ds.metaGroup === grp && ds.label === '') {
                ds.hidden = !show;
              }
            });
            homeChart.update();
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: 'Time of Day' },
          ticks: {
            callback: minuteToTime,
            maxTicksLimit: 12,
            stepSize: 120
          }
        },
        y: {
          title: { display: true, text: mode }
        }
      },
      interaction: { mode: 'nearest', intersect: false },
      elements: { point: { radius: 0, hitRadius: 0 } },
      tooltip: {
        callbacks: {
          title: items => minuteToTime(items[0].label),
          label: ctx => {
            const L = ctx.dataset.label;
            return `${L}${L ? ': ' : ''}${ctx.parsed.y.toFixed(1)}`;
          },
          labelColor: ctx => ({
            borderColor:     ctx.dataset.borderColor,
            backgroundColor: ctx.dataset.backgroundColor
          })
        }
      }
    }
  };

  // 11) Instantiate the chart and keep a reference in `homeChart`
  const homeChart = new Chart(ctx, config);

  // 12) Wire up the three bottom‐checkboxes to toggle only their respective “avg” datasets
  const map = {
    maleToggle:             'maleAvg',
    femaleNonEstrusToggle: 'femNEAvg',
    femaleEstrusToggle:    'femEAvg'
  };
  Object.entries(map).forEach(([cbId, grp]) => {
    const cb = document.getElementById(cbId);
    if (!cb) {
      console.warn(`checkbox #${cbId} not found`);
      return;
    }
    cb.addEventListener('change', e => {
      homeChart.data.datasets.forEach(ds => {
        if (ds.metaGroup === grp && ds.label !== '') {
          ds.hidden = !e.target.checked;
        }
      });
      homeChart.update();
    });
  });
}


// ---------------
// Helper: build a Chart.js dataset object
function mkDS(data, label, color, metaGroup, visible) {
  return {
    label,
    data,
    borderColor:      label ? color : 'transparent',
    backgroundColor:  label ? color : 'transparent',
    fill:             false,
    pointRadius:      0,
    pointHitRadius:   0,
    hidden:           !visible,
    metaGroup
  };
}

// js/chart.js

// 0) Define & register our light/dark shading plugin ONCE
Chart.register({
  id: 'lightDark',
  beforeDraw(chart) {
    const {ctx, chartArea:{top,bottom}, scales:{x}} = chart;
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

  function sheetToRows(name) {
    const raw = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1 });
    const ids = raw[0].slice(1);
    return raw.slice(1).map(row => {
      const obj = {};
      ids.forEach((id,i)=> obj[id] = +row[i+1]);
      return obj;
    });
  }

  const dataSets = {
    maleAct:   sheetToRows('Male Act'),
    femAct:    sheetToRows('Fem Act'),
    maleTemp:  sheetToRows('Male Temp'),
    femTemp:   sheetToRows('Fem Temp')
  };

  // mode buttons (if present)
  const btnA = document.getElementById('btnActivity');
  const btnT = document.getElementById('btnTemperature');
  if (btnA && btnT) {
    btnA.addEventListener('click', () => initChart('Activity',    dataSets.maleAct, dataSets.femAct));
    btnT.addEventListener('click', () => initChart('Temperature', dataSets.maleTemp, dataSets.femTemp));
  } else {
    console.warn('btnActivity / btnTemperature not found—mode toggle disabled');
  }

  // initial
  initChart('Activity', dataSets.maleAct, dataSets.femAct);
});


function initChart(mode, maleRows, femRows) {
  // destroy any existing chart on that canvas
  const canvasEl = document.getElementById('homeChart');
  const existing = Chart.getChart(canvasEl);
  if (existing) existing.destroy();

  // how many days
  const total = maleRows.length;
  const days  = Math.floor(total/1440);

  // helper: average a single mouse, optionally filtering estrus
  function avgCurve(rows, id, wantEstrus = null) {
    const sum = Array(1440).fill(0),
          cnt = Array(1440).fill(0);
    rows.forEach((r,i)=>{
      const day = Math.floor(i/1440)+1,
            m   = i%1440;
      if (wantEstrus!==null) {
        const isE = ((day-2)%4===0);
        if (isE !== wantEstrus) return;
      }
      sum[m] += r[id];
      cnt[m]++;
    });
    return sum.map((s,j)=> cnt[j]? s/cnt[j] : 0);
  }

  const maleIDs = Object.keys(maleRows[0]),
        femIDs  = Object.keys(femRows[0]);

  const maleCurves  = maleIDs.map(id=> avgCurve(maleRows, id, null)),
        femECurves  = femIDs.map(id=> avgCurve(femRows, id, true)),
        femNECurves = femIDs.map(id=> avgCurve(femRows, id, false));

  function groupAvg(curves) {
    return curves[0].map((_,i)=> 
      curves.reduce((s,c)=> s + c[i], 0) / curves.length
    );
  }

  const maleAvg = groupAvg(maleCurves),
        femEAvg = groupAvg(femECurves),
        femNEAvg= groupAvg(femNECurves);

  // build our three avg‐datasets
  const datasets = [
    mkDS(maleAvg,   'Male (avg)',               'lightblue',   'maleAvg',  true),
    mkDS(femNEAvg,  'Female non-estrus (avg)',  'lightpink',   'femNEAvg', true),
    mkDS(femEAvg,   'Female estrus (avg)',      '#d93d5f',     'femEAvg',  true)
  ];

  // append all the hidden individual curves
  maleCurves.concat(femNECurves, femECurves).forEach(curve=>{
    datasets.push(mkDS(curve, '', 'transparent','', false));
  });

  function minuteToTime(m) {
    const h = Math.floor(m/60), mm = m%60;
    return `${String(h).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
  }

  const ctx = canvasEl.getContext('2d');
  const config = {
    type: 'line',
    data: { labels: Array.from({length:1440},(_,i)=>i), datasets },
    options: {
      plugins: {
        lightDark: {},
        legend: {
          labels: {
            // only show items whose text isn't empty
            filter: item => item.text !== ''
          },
          onClick: (_, item) => {
            const grp = config.data.datasets[item.datasetIndex].metaGroup,
                  show = config.data.datasets[item.datasetIndex].hidden;
            config.data.datasets.forEach(ds=>{
              if (ds.metaGroup === grp && ds.label==='') {
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
          ticks: { callback: minuteToTime, maxTicksLimit: 12, stepSize: 120 }
        },
        y: {
          title: { display: true, text: mode }
        }
      },
      interaction: { mode: 'nearest', intersect: false },
      elements: { point: { radius: 0 } },
      tooltip: {
        callbacks: {
          title: items => minuteToTime(items[0].label),
          label: ctx => {
            const L = ctx.dataset.label;
            return `${L}${L?': ':''}${ctx.parsed.y.toFixed(1)}`;
          },
          labelColor: ctx => ({
            borderColor:   ctx.dataset.borderColor,
            backgroundColor:ctx.dataset.backgroundColor
          })
        }
      }
    }
  };

  const homeChart = new Chart(ctx, config);

  // bottom‐of‐page checkboxes
  const map = {
    maleToggle:             'maleAvg',
    femaleNonEstrusToggle: 'femNEAvg',
    femaleEstrusToggle:    'femEAvg'
  };
  Object.entries(map).forEach(([cbId, grp])=>{
    const cb = document.getElementById(cbId);
    if (!cb) console.warn(`checkbox #${cbId} not found`);
    else cb.addEventListener('change', e=>{
      homeChart.data.datasets.forEach(ds=>{
        if (ds.metaGroup===grp && ds.label!=='') {
          ds.hidden = !e.target.checked;
        }
      });
      homeChart.update();
    });
  });
}

// dataset factory
function mkDS(data, label, color, metaGroup, visible) {
  return {
    label,
    data,
    borderColor:     label? color : 'transparent',
    backgroundColor: label? color : 'transparent',
    fill:            false,
    pointRadius:     0,
    pointHitRadius:  0,
    hidden:          !visible,
    metaGroup
  };
}



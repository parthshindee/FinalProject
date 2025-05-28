// js/chart.js

// Utility to convert minute-of-day into "HH:MM" format
function minuteToTime(min) {
    const m = Number(min);
    const hrs = Math.floor(m / 60);
    const mins = m % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }
  
  // Generate labels 0–1439
  const labels = Array.from({ length: 1440 }, (_, i) => i);
  // Sample data (replace with real data fetch)
  const femaleData = labels.map(m => 50 + 30 * Math.sin((2 * Math.PI / 1440) * (m - 360)));
  const maleData   = labels.map(m => 40 + 25 * Math.sin((2 * Math.PI / 1440) * (m - 300)));
  
  const ctx = document.getElementById('activityChart').getContext('2d');
  const chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Female',
          data: femaleData,
          borderColor: 'rgba(255,99,132,0.8)',
          backgroundColor: 'rgba(255,99,132,0.8)', // legend & tooltip square
          pointRadius: 0,
          fill: false
        },
        {
          label: 'Male',
          data: maleData,
          borderColor: 'rgba(54,162,235,0.8)',
          backgroundColor: 'rgba(54,162,235,0.8)',
          pointRadius: 0,
          fill: false
        }
      ]
    },
    options: {
      scales: {
        x: {
          ticks: {
            callback: (val) => minuteToTime(val),
            maxTicksLimit: 12,
            stepSize: 120
          },
          title: { display: true, text: 'Time of Day' }
        },
        y: {
          title: { display: true, text: 'Mean Activity' }
        }
      },
      interaction: { mode: 'nearest', intersect: false },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: {
            usePointStyle: true,
            pointStyle: 'circle',
            generateLabels: (chart) => {
              return Chart.defaults.plugins.legend.labels.generateLabels(chart).map(label => ({
                ...label,
                fillStyle: chart.data.datasets[label.datasetIndex].backgroundColor,
                strokeStyle: chart.data.datasets[label.datasetIndex].borderColor
              }));
            }
          }
        },
        tooltip: {
          callbacks: {
            // Show time in HH:MM instead of raw minutes
            title: (items) => minuteToTime(items[0].label),
            // Return a string so we don't get [object Object]
            label: (ctx) => {
              const y = ctx.parsed.y.toFixed(2);
              return `${ctx.dataset.label}: ${y}`;
            },
            // Color the little square in the tooltip
            labelColor: (ctx) => {
              return {
                borderColor: ctx.dataset.borderColor,
                backgroundColor: ctx.dataset.backgroundColor
              };
            }
          }
        }
      },
      elements: {
        point: { radius: 0 }
      }
    }
  });
  
  // Toggle datasets via checkboxes
  document.getElementById('femaleToggle').addEventListener('change', e => {
    chart.getDatasetMeta(0).hidden = !e.target.checked;
    chart.update();
  });
  document.getElementById('maleToggle').addEventListener('change', e => {
    chart.getDatasetMeta(1).hidden = !e.target.checked;
    chart.update();
  });
  

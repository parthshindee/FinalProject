// js/chart.js

// Sample data: minute-of-day (0–1439) vs. mean activity
// (In your real project you’d fetch this from a CSV or JSON endpoint)
const labels = Array.from({ length: 1440 }, (_, i) => i);
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
        fill: false,
        hidden: false
      },
      {
        label: 'Male',
        data: maleData,
        borderColor: 'rgba(54,162,235,0.8)',
        fill: false,
        hidden: false
      }
    ]
  },
  options: {
    scales: {
      x: { display: true, title: { display: true, text: 'Minute of Day' } },
      y: { display: true, title: { display: true, text: 'Mean Activity' } }
    },
    interaction: { mode: 'nearest', intersect: false },
    plugins: { legend: { display: false } }
  }
});

// Wire up the checkboxes to toggle datasets
document.getElementById('femaleToggle').addEventListener('change', e => {
  chart.getDatasetMeta(0).hidden = !e.target.checked;
  chart.update();
});
document.getElementById('maleToggle').addEventListener('change', e => {
  chart.getDatasetMeta(1).hidden = !e.target.checked;
  chart.update();
});

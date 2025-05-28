// js/chart.js

// Utility to convert minute-of-day into "HH:MM" format
function minuteToTime(minute) {
    const hrs = Math.floor(minute / 60);
    const mins = minute % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}
  
// Generate labels 0–1439
const labels = Array.from({ length: 1440 }, (_, i) => i);
// Sample sine‐wave data (replace with real data fetch in your project)
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
            },
            {
                label: 'Male',
                data: maleData,
                borderColor: 'rgba(54,162,235,0.8)',
                fill: false,
            }
        ]
    },
    options: {
        scales: {
            x: {
                ticks: {
                    // Show only every 2-hour tick (120 min) and format nicely
                    callback: (val, idx) => minuteToTime(val),
                    maxTicksLimit: 12,
                    stepSize: 120
                },
                title: {
                    display: true,
                    text: 'Time of Day'
                }
            },
            y: {
                title: {
                    display: true,
                    text: 'Mean Activity'
                }
            }
        },
        plugins: {
            legend: {
                display: true,
                position: 'top',
                align: 'end',
                labels: {
                    usePointStyle: true,
                    padding: 20
                }
            }
        },
        interaction: {
            mode: 'nearest',
            intersect: false
        },
        elements: {
            point: {
                radius: 0
            }
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

// -------------------------------------------------------------
// scroll.js
//
// A scroll‐driven “day‐by‐day” visualization of female mouse
// activity (0–100%) and temperature (36–39 °C), using real data.
// Both curves are drawn in black. Dual Y‐axes: left=temperature,
// right=activity (displayed as percent).  
// -------------------------------------------------------------

// Globals for D3 elements
let svg, g;
let xScale, yScaleTemp, yScaleAct;
let tempLine, actLine;
let tempPath, actPath;
let focus, tooltip;
let allData; // holds { day, hour, activity, temperature }

// Margins for the chart; note margin.right is larger so the "Activity" label fits
const margin = { top: 20, right: 70, bottom: 40, left: 50 };


// 1) Load Excel, compute hour‐by‐hour averages (days 1–7)
document.addEventListener("DOMContentLoaded", async () => {
  let workbook;
  try {
    const resp = await fetch("../data/Mouse_Data.xlsx");
    const ab = await resp.arrayBuffer();
    workbook = XLSX.read(ab, { type: "array" });
  } catch (err) {
    console.error("⚠️ could not load XLSX:", err);
    return;
  }

  // Helper: turn a sheet into an array of {ID: value, ...} rows
  function sheetToRows(name) {
    const raw = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1 });
    const ids = raw[0].slice(1);
    return raw.slice(1).map((row) => {
      const obj = {};
      ids.forEach((id, i) => {
        obj[id] = +row[i + 1];
      });
      return obj;
    });
  }

  // Read female Activity and Temperature sheets
  const femActRows = sheetToRows("Fem Act");
  const femTempRows = sheetToRows("Fem Temp");

  // Compute days (1440 minutes per day)
  const totalMinutes = femActRows.length;
  const days = Math.floor(totalMinutes / 1440); // likely 14; we only storyboard first 7

  // Prepare 2D arrays to sum and count per [day][hour]
  const actSum = Array.from({ length: days + 1 }, () =>
    Array.from({ length: 24 }, () => 0)
  );
  const actCount = Array.from({ length: days + 1 }, () =>
    Array.from({ length: 24 }, () => 0)
  );
  const tempSum = Array.from({ length: days + 1 }, () =>
    Array.from({ length: 24 }, () => 0)
  );
  const tempCount = Array.from({ length: days + 1 }, () =>
    Array.from({ length: 24 }, () => 0)
  );

  // Bin every minute into (day, hour)
  femActRows.forEach((row, i) => {
    const day = Math.floor(i / 1440) + 1;
    const minuteOfDay = i % 1440;
    const hour = Math.floor(minuteOfDay / 60);
    Object.values(row).forEach((val) => {
      actSum[day][hour] += val;
      actCount[day][hour]++;
    });
  });
  femTempRows.forEach((row, i) => {
    const day = Math.floor(i / 1440) + 1;
    const minuteOfDay = i % 1440;
    const hour = Math.floor(minuteOfDay / 60);
    Object.values(row).forEach((val) => {
      tempSum[day][hour] += val;
      tempCount[day][hour]++;
    });
  });

  // Build `allData` = [ {day, hour, activity (0–1), temperature}, ... ] for days 1–7
  allData = [];
  for (let d = 1; d <= Math.min(days, 7); d++) {
    for (let h = 0; h < 24; h++) {
      const avgAct =
        actCount[d][h] > 0 ? actSum[d][h] / actCount[d][h] : 0;
      const avgTemp =
        tempCount[d][h] > 0 ? tempSum[d][h] / tempCount[d][h] : 0;
      allData.push({
        day: d,
        hour: h,
        activity: avgAct,
        temperature: avgTemp,
      });
    }
  }

  // Once data is ready, set up the chart
  initChart();
});


// 2) Create the SVG, scales, axes, lines, and initial plot
function initChart() {
  const chartContainer = d3.select("#chart");
  const rect = chartContainer.node().getBoundingClientRect();
  const width = rect.width - margin.left - margin.right;
  const height = rect.height - margin.top - margin.bottom;

  // Append SVG
  svg = chartContainer
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom);

  g = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // Create tooltip DIV (initially hidden)
  tooltip = d3
    .select("body")
    .append("div")
    .attr("class", "tooltip");

  // X scale: hours from 0 to 24
  xScale = d3.scaleLinear().domain([0, 24]).range([0, width]);

  // Y scale for temperature: 36–39 °C (left axis)
  yScaleTemp = d3
    .scaleLinear()
    .domain([36, 39])
    .nice()
    .range([height, 0]);

  // Y scale for activity: 0–1 (we will render ticks as percentages on the right)
  yScaleAct = d3
    .scaleLinear()
    .domain([0, 1])
    .nice()
    .range([height, 0]);

  // Two line generators (both drawn in black)
  tempLine = d3
    .line()
    .x((d) => xScale(d.hour))
    .y((d) => yScaleTemp(d.temperature))
    .curve(d3.curveMonotoneX);

  actLine = d3
    .line()
    .x((d) => xScale(d.hour))
    .y((d) => yScaleAct(d.activity))
    .curve(d3.curveMonotoneX);

  // Draw “dark‐phase” background shading (hours 18–24 and 0–6)
  addDarkShading(width, height);

  // Left Y‐axis for temperature
  g.append("g")
    .attr("class", "axis")
    .call(d3.axisLeft(yScaleTemp).ticks(4));

  // Right Y‐axis for activity, formatted in whole‐percent steps
  g.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(${width},0)`)
    .call(
      d3
        .axisRight(yScaleAct)
        .ticks(5)
        .tickFormat((d) => `${Math.round(d * 100)}%`)
    );

  // X‐axis at bottom
  g.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${height})`)
    .call(
      d3
        .axisBottom(xScale)
        .ticks(6)
        .tickFormat((d) => `${d}:00`)
    );

  // Left axis label: Temperature (in red color)
  g.append("text")
    .attr("class", "axis-label")
    .attr("transform", "rotate(-90)")
    .attr("y", -margin.left + 15)
    .attr("x", -(height / 2))
    .attr("dy", "1em")
    .style("text-anchor", "middle")
    .style("fill", "#ff6b6b")
    .text("Temperature (°C)");

  // Right axis label: Activity (in teal), moved left by 20px so it does not get clipped
  g.append("text")
    .attr("class", "axis-label")
    .attr("transform", "rotate(-90)")
    .attr("y", width + margin.right - 25)
    .attr("x", -(height / 2))
    .attr("dy", "1em")
    .style("text-anchor", "middle")
    .style("fill", "#4ecdc4")
    .text("Activity (%)");

  // Empty path elements for transitions
  tempPath = g
    .append("path")
    .attr("class", "temp-line")
    .attr("fill", "none")
    .attr("stroke", "#000")       // draw temperature curve in black
    .attr("stroke-width", 3);

  actPath = g
    .append("path")
    .attr("class", "act-line")
    .attr("fill", "none")
    .attr("stroke", "#000")       // draw activity curve in black
    .attr("stroke-width", 3);

  // Add a crosshair group (initially hidden)
  setupFocus(width, height);

  // Plot Day 1 by default
  updateChartDay(1);

  // Initialize Scrollama
  initScrollama();
}


// 3) Draw background rectangles behind “dark” hours
function addDarkShading(width, height) {
  // Gray overlay from 18:00 → 24:00
  g.append("rect")
    .attr("x", xScale(18))
    .attr("y", 0)
    .attr("width", xScale(24) - xScale(18))
    .attr("height", height)
    .attr("fill", "rgba(0,0,0,0.05)");

  // Gray overlay from 0:00 → 6:00
  g.append("rect")
    .attr("x", xScale(0))
    .attr("y", 0)
    .attr("width", xScale(6) - xScale(0))
    .attr("height", height)
    .attr("fill", "rgba(0,0,0,0.05)");
}


// 4) Update both paths to show data for “day” (1–7)
function updateChartDay(day) {
  const dayData = allData.filter((d) => d.day === day);

  // Temperature curve transition
  tempPath
    .datum(dayData)
    .transition()
    .duration(800)
    .ease(d3.easeQuadInOut)
    .attr("d", tempLine);

  // Activity curve transition
  actPath
    .datum(dayData)
    .transition()
    .duration(800)
    .ease(d3.easeQuadInOut)
    .attr("d", actLine);
}


// 5) Create crosshair circles and tooltip on mousemove
function setupFocus(width, height) {
  const bisect = d3.bisector((d) => d.hour).left;

  focus = g.append("g").attr("class", "focus").style("display", "none");

  // Circle for temperature (red)
  focus
    .append("circle")
    .attr("r", 5)
    .attr("fill", "#ff6b6b")
    .attr("stroke", "#fff")
    .attr("stroke-width", 2);

  // Circle for activity (teal)
  focus
    .append("circle")
    .attr("r", 5)
    .attr("fill", "#4ecdc4")
    .attr("stroke", "#fff")
    .attr("stroke-width", 2);

  // Overlay to capture pointer events
  svg
    .append("rect")
    .attr("class", "overlay")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .style("fill", "none")
    .style("pointer-events", "all")
    .on("mouseover", () => focus.style("display", null))
    .on("mouseout", () => {
      focus.style("display", "none");
      tooltip.style("opacity", 0);
    })
    .on("mousemove", function (event) {
      const [mouseX] = d3.pointer(event);
      // Invert to get hour from mouseX (account for left margin)
      const x0 = xScale.invert(mouseX - margin.left);

      // Find the currently active day (via the “.step.active” element)
      const currentDay = getCurrentStepDay();
      const dayData = allData.filter((d) => d.day === currentDay);
      const i = bisect(dayData, x0, 1);
      const d0 = dayData[i - 1];
      const d1 = dayData[i];
      if (!d0 || !d1) return;
      const d = x0 - d0.hour > d1.hour - x0 ? d1 : d0;

      // Move the temperature circle
      focus
        .select("circle:nth-child(1)")
        .attr(
          "transform",
          `translate(${xScale(d.hour)}, ${yScaleTemp(d.temperature)})`
        );

      // Move the activity circle
      focus
        .select("circle:nth-child(2)")
        .attr(
          "transform",
          `translate(${xScale(d.hour)}, ${yScaleAct(d.activity)})`
        );

      // Show tooltip with both values
      tooltip
        .style("opacity", 1)
        .html(
          `Day ${d.day}, ${d.hour}:00<br/>
           Temp: ${d.temperature.toFixed(1)} °C<br/>
           Activity: ${Math.round(d.activity * 100)}%`
        )
        .style("left", event.pageX + 10 + "px")
        .style("top", event.pageY - 10 + "px");
    });
}


// 6) Helper: find day from the “.step.active” element
function getCurrentStepDay() {
  const active = document.querySelector(".step.active");
  return active ? +active.dataset.step + 1 : 1;
}


// 7) When a step scrolls into view, update chart title + day indicator
function updateVisualization(idx) {
  const day = idx + 1;
  document.getElementById("dayIndicator").textContent = `Day ${day}`;

  const chartTitle = document.getElementById("chartTitle");
  switch (idx) {
    case 0:
      chartTitle.textContent = "Day 1: Baseline Patterns";
      break;
    case 1:
      chartTitle.textContent = "Day 2: Pattern Consistency";
      break;
    case 2:
      chartTitle.textContent = "Day 3: Rhythm Established";
      break;
    case 3:
      chartTitle.textContent = "Day 4: Early Estrus Signals";
      break;
    case 4:
      chartTitle.textContent = "Day 5: Peak Estrus";
      break;
    case 5:
      chartTitle.textContent = "Day 6: Sustained Estrus";
      break;
    case 6:
      chartTitle.textContent = "Day 7: Recovery Phase";
      break;
    default:
      chartTitle.textContent = `Day ${day}`;
  }

  updateChartDay(day);
}


// 8) Hook up Scrollama steps
function initScrollama() {
  const scroller = scrollama();

  scroller
    .setup({
      step: ".step",
      offset: 0.5,
      debug: false,
    })
    .onStepEnter((response) => {
      // Remove “active” from all steps
      d3.selectAll(".step").classed("active", false);
      // Mark current step as “active”
      d3.select(response.element).classed("active", true);
      // Update the graph for this step
      updateVisualization(response.index);
    });

  // Recalculate on window resize
  window.addEventListener("resize", () => {
    scroller.resize();
  });

  // Show day 1 on load
  updateVisualization(0);
}

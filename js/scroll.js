// -------------------------------------------------------------
// scroll.js
//
// Uses D3 + Scrollama to drive a step‐by‐step, day‐by‐day reveal
// using real data from data/Mouse_Data.xlsx (female mice).
// -------------------------------------------------------------

// Global variables for chart elements
let svg, g;
let xScale, yScaleActivity, yScaleTemp;
let activityLine, tempLine;
let activityPath, tempPath;
let focus, tooltip;
let allData; // will hold processed day/hour averages

// Margin conventions
const margin = { top: 20, right: 30, bottom: 40, left: 50 };

// 1) Load the Excel file, parse the “Fem Act” and “Fem Temp” sheets, 
//    then compute hour‐by‐hour averages for each day (1–7).
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

  // Helper: convert a sheet into an array of row‐objects { ID: value, … }
  function sheetToRows(name) {
    const raw = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1 });
    const ids = raw[0].slice(1); // first row: [ "Minute", "F1", "F2", … ]
    return raw.slice(1).map(row => {
      const obj = {};
      ids.forEach((id, i) => {
        obj[id] = +row[i + 1];
      });
      return obj;
    });
  }

  // Parse the female sheets
  const femActRows = sheetToRows("Fem Act");
  const femTempRows = sheetToRows("Fem Temp");

  // Determine total minutes and days (1440 minutes/day)
  const totalMinutes = femActRows.length;
  const days = Math.floor(totalMinutes / 1440);

  // Data structure: for each day (1–7), for each hour (0–23), accumulate sums & counts
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

  // Collect activity & temperature minute‐by‐minute into hourly bins
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

  // Build a single array of { day, hour, avgActivity, avgTemp }
  allData = [];
  for (let d = 1; d <= days; d++) {
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

  // Now that data is ready, build the chart
  initChart();
});

// 2) Initialize the chart container and axes (called once)
function initChart() {
  const chartContainer = d3.select("#chart");
  const rect = chartContainer.node().getBoundingClientRect();
  const width = rect.width - margin.left - margin.right;
  const height = rect.height - margin.top - margin.bottom;

  svg = chartContainer
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom);

  g = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // Create a hidden tooltip
  tooltip = d3
    .select("body")
    .append("div")
    .attr("class", "tooltip");

  // X scale: hours 0–24
  xScale = d3.scaleLinear().domain([0, 24]).range([0, width]);

  // Y scales:
  // Activity in [0,1]
  yScaleActivity = d3
    .scaleLinear()
    .domain([0, 1])
    .range([height, height / 2]);

  // Temperature in [minTemp, maxTemp] – we know female temp is roughly 36–39 °C
  yScaleTemp = d3
    .scaleLinear()
    .domain([36, 39])
    .range([height / 2, 0]);

  // Line generators
  activityLine = d3
    .line()
    .x((d) => xScale(d.hour))
    .y((d) => yScaleActivity(d.activity))
    .curve(d3.curveMonotoneX);

  tempLine = d3
    .line()
    .x((d) => xScale(d.hour))
    .y((d) => yScaleTemp(d.temperature))
    .curve(d3.curveMonotoneX);

  // Draw “dark‐phase” shading for a single 24‐h block
  addDarkPeriods(width, height);

  // X axis (hours)
  g.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${height})`)
    .call(
      d3
        .axisBottom(xScale)
        .ticks(6)
        .tickFormat((d) => `${d}:00`)
    );

  // Y axis for activity (bottom half)
  g.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${height / 2})`)
    .call(d3.axisLeft(yScaleActivity).ticks(4));

  // Y axis for temperature (top half)
  g.append("g")
    .attr("class", "axis")
    .call(d3.axisLeft(yScaleTemp).ticks(4));

  // Axis labels
  g.append("text")
    .attr("class", "axis-label")
    .attr("transform", "rotate(-90)")
    .attr("y", -margin.left + 10)
    .attr("x", -height / 4)
    .attr("dy", "1em")
    .style("text-anchor", "middle")
    .style("fill", "#4ecdc4")
    .text("Activity Level");

  g.append("text")
    .attr("class", "axis-label")
    .attr("transform", "rotate(-90)")
    .attr("y", -margin.left + 10)
    .attr("x", -(3 * height) / 4)
    .attr("dy", "1em")
    .style("text-anchor", "middle")
    .style("fill", "#ff6b6b")
    .text("Temperature (°C)");

  // Empty paths for activity & temperature
  activityPath = g
    .append("path")
    .attr("class", "activity-line")
    .attr("fill", "none")
    .attr("stroke", "#4ecdc4")
    .attr("stroke-width", 3);

  tempPath = g
    .append("path")
    .attr("class", "temp-line")
    .attr("fill", "none")
    .attr("stroke", "#ff6b6b")
    .attr("stroke-width", 3);

  // Add crosshair + tooltip interactions
  setupInteraction(width, height);

  // Initialize with Day 1
  updateChartForDay(1);

  // Set up Scrollama now that chart exists
  initScrollama();
}

// 3) Draw semi‐transparent rectangles for “dark” hours (18:00–06:00)
function addDarkPeriods(width, height) {
  // 18:00 → 24:00 is dark
  g.append("rect")
    .attr("x", xScale(18))
    .attr("y", 0)
    .attr("width", xScale(24) - xScale(18))
    .attr("height", height)
    .attr("fill", "rgba(0, 0, 0, 0.05)");

  // 0:00 → 06:00 is dark
  g.append("rect")
    .attr("x", xScale(0))
    .attr("y", 0)
    .attr("width", xScale(6) - xScale(0))
    .attr("height", height)
    .attr("fill", "rgba(0, 0, 0, 0.05)");
}

// 4) Update lines to show data for a specific day (1–7)
function updateChartForDay(day) {
  const dayData = allData.filter((d) => d.day === day);

  // Transition the activity line
  activityPath
    .datum(dayData)
    .transition()
    .duration(800)
    .ease(d3.easeQuadInOut)
    .attr("d", activityLine);

  // Transition the temperature line
  tempPath
    .datum(dayData)
    .transition()
    .duration(800)
    .ease(d3.easeQuadInOut)
    .attr("d", tempLine);
}

// 5) Setup crosshair circles + tooltip on mousemove
function setupInteraction(width, height) {
  const bisect = d3.bisector((d) => d.hour).left;

  focus = g.append("g").attr("class", "focus").style("display", "none");

  // Circle for activity
  focus
    .append("circle")
    .attr("r", 5)
    .attr("fill", "#4ecdc4")
    .attr("stroke", "#ffffff")
    .attr("stroke-width", 2);

  // Circle for temperature
  focus
    .append("circle")
    .attr("r", 5)
    .attr("fill", "#ff6b6b")
    .attr("stroke", "#ffffff")
    .attr("stroke-width", 2);

  // Transparent overlay to capture pointer events
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
      // Get mouse coordinates relative to the drawing area
      const [mouseX, mouseY] = d3.pointer(event);
      const x0 = xScale.invert(mouseX - margin.left);

      // Determine which “step” is active → current day
      const currentDay = getCurrentDay();
      const dayData = allData.filter((d) => d.day === currentDay);

      // Find nearest hour within that day’s array
      const i = bisect(dayData, x0, 1);
      const d0 = dayData[i - 1];
      const d1 = dayData[i];
      if (!d0 || !d1) return;
      const d =
        x0 - d0.hour > d1.hour - x0
          ? d1
          : d0;

      // Move the circles to the correct y‐positions
      focus
        .select("circle:nth-child(1)")
        .attr(
          "transform",
          `translate(${xScale(d.hour)}, ${yScaleActivity(d.activity)})`
        );

      focus
        .select("circle:nth-child(2)")
        .attr(
          "transform",
          `translate(${xScale(d.hour)}, ${yScaleTemp(d.temperature)})`
        );

      // Show a tooltip
      tooltip
        .style("opacity", 1)
        .html(
          `Day ${d.day}, ${d.hour}:00<br/>
           Activity: ${d.activity.toFixed(2)}<br/>
           Temp: ${d.temperature.toFixed(1)} °C`
        )
        .style("left", event.pageX + 10 + "px")
        .style("top", event.pageY - 10 + "px");
    });
}

// 6) Helper to read “data-step” of the currently active step
function getCurrentDay() {
  const active = document.querySelector(".step.active");
  if (!active) return 1;
  return parseInt(active.dataset.step, 10) + 1;
}

// 7) On step enter, mark it “active” and call updateVisualization
function updateVisualization(index) {
  const day = index + 1;
  document.getElementById("dayIndicator").textContent = `Day ${day}`;

  const chartTitle = document.getElementById("chartTitle");
  switch (index) {
    case 0:
      chartTitle.textContent = "Day 1: Baseline Patterns";
      break;
    case 1:
      chartTitle.textContent = "Day 2: Pattern Consistency";
      break;
    case 2:
      chartTitle.textContent = "Day 3: Rhythm Establishment";
      break;
    case 3:
      chartTitle.textContent = "Day 4: Early Estrus Signals";
      break;
    case 4:
      chartTitle.textContent = "Day 5: Peak Estrus";
      break;
    case 5:
      chartTitle.textContent = "Day 6: Estrus Continues";
      break;
    case 6:
      chartTitle.textContent = "Day 7: Recovery Phase";
      break;
    default:
      chartTitle.textContent = `Day ${day}`;
      break;
  }

  updateChartForDay(day);
}

// 8) Initialize Scrollama after chart is set up
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
      // Update chart based on index
      updateVisualization(response.index);
    });

  // Recalculate on resize
  window.addEventListener("resize", () => {
    scroller.resize();
  });

  // Ensure Day 1 is active at load
  updateVisualization(0);
}

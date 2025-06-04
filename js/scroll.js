// -------------------------------------------------------------
// scroll.js
//
// A scroll-driven "day-by-day" visualization comparing male and
// female mouse activity (0–100%) and temperature (36–39 °C).
// Shows 14 days of data with estrus cycle effects on days 6, 10, 14.
// -------------------------------------------------------------

// Globals for D3 elements
let svg, g;
let xScale, yScaleTemp, yScaleAct;
let tempLineMale, tempLineFemale, actLineMale, actLineFemale;
let tempPathMale, tempPathFemale, actPathMale, actPathFemale;
let focus, tooltip;
let allDataMale, allDataFemale; // holds { day, hour, activity, temperature }

// Margins for the chart; note margin.right is larger so the "Activity" label fits
const margin = { top: 20, right: 70, bottom: 40, left: 50 };


// 1) Load Excel, compute hour-by-hour averages for both sexes (days 1–14)
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

  // Read all sheets
  const maleActRows = sheetToRows("Male Act");
  const maleTempRows = sheetToRows("Male Temp");
  const femActRows = sheetToRows("Fem Act");
  const femTempRows = sheetToRows("Fem Temp");

  // Compute days (1440 minutes per day)
  const totalMinutes = femActRows.length;
  const days = Math.floor(totalMinutes / 1440); // 14 days

  // Prepare 2D arrays to sum and count per [day][hour] for both sexes
  const actSumMale = Array.from({ length: days + 1 }, () =>
    Array.from({ length: 24 }, () => 0)
  );
  const actCountMale = Array.from({ length: days + 1 }, () =>
    Array.from({ length: 24 }, () => 0)
  );
  const tempSumMale = Array.from({ length: days + 1 }, () =>
    Array.from({ length: 24 }, () => 0)
  );
  const tempCountMale = Array.from({ length: days + 1 }, () =>
    Array.from({ length: 24 }, () => 0)
  );
  
  const actSumFemale = Array.from({ length: days + 1 }, () =>
    Array.from({ length: 24 }, () => 0)
  );
  const actCountFemale = Array.from({ length: days + 1 }, () =>
    Array.from({ length: 24 }, () => 0)
  );
  const tempSumFemale = Array.from({ length: days + 1 }, () =>
    Array.from({ length: 24 }, () => 0)
  );
  const tempCountFemale = Array.from({ length: days + 1 }, () =>
    Array.from({ length: 24 }, () => 0)
  );

  // Bin every minute into (day, hour) for males
  maleActRows.forEach((row, i) => {
    const day = Math.floor(i / 1440) + 1;
    const minuteOfDay = i % 1440;
    const hour = Math.floor(minuteOfDay / 60);
    Object.values(row).forEach((val) => {
      actSumMale[day][hour] += val;
      actCountMale[day][hour]++;
    });
  });
  maleTempRows.forEach((row, i) => {
    const day = Math.floor(i / 1440) + 1;
    const minuteOfDay = i % 1440;
    const hour = Math.floor(minuteOfDay / 60);
    Object.values(row).forEach((val) => {
      tempSumMale[day][hour] += val;
      tempCountMale[day][hour]++;
    });
  });

  // Bin every minute into (day, hour) for females
  femActRows.forEach((row, i) => {
    const day = Math.floor(i / 1440) + 1;
    const minuteOfDay = i % 1440;
    const hour = Math.floor(minuteOfDay / 60);
    Object.values(row).forEach((val) => {
      actSumFemale[day][hour] += val;
      actCountFemale[day][hour]++;
    });
  });
  femTempRows.forEach((row, i) => {
    const day = Math.floor(i / 1440) + 1;
    const minuteOfDay = i % 1440;
    const hour = Math.floor(minuteOfDay / 60);
    Object.values(row).forEach((val) => {
      tempSumFemale[day][hour] += val;
      tempCountFemale[day][hour]++;
    });
  });

  // Build data arrays for both sexes
  allDataMale = [];
  allDataFemale = [];
  
  for (let d = 1; d <= Math.min(days, 14); d++) {
    for (let h = 0; h < 24; h++) {
      // Male data
      const avgActMale =
        actCountMale[d][h] > 0 ? actSumMale[d][h] / actCountMale[d][h] : 0;
      const avgTempMale =
        tempCountMale[d][h] > 0 ? tempSumMale[d][h] / tempCountMale[d][h] : 0;
      allDataMale.push({
        day: d,
        hour: h,
        activity: avgActMale,
        temperature: avgTempMale,
      });
      
      // Female data
      const avgActFemale =
        actCountFemale[d][h] > 0 ? actSumFemale[d][h] / actCountFemale[d][h] : 0;
      const avgTempFemale =
        tempCountFemale[d][h] > 0 ? tempSumFemale[d][h] / tempCountFemale[d][h] : 0;
      allDataFemale.push({
        day: d,
        hour: h,
        activity: avgActFemale,
        temperature: avgTempFemale,
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
    .attr("class", "tooltip")
    .style("position", "absolute")
    .style("background", "rgba(0, 0, 0, 0.9)")
    .style("color", "white")
    .style("padding", "12px")
    .style("border-radius", "4px")
    .style("pointer-events", "none")
    .style("font-size", "12px")
    .style("line-height", "1.4")
    .style("opacity", "0")
    .style("transition", "opacity 0.2s");

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

  // Line generators for both sexes
  tempLineMale = d3
    .line()
    .x((d) => xScale(d.hour))
    .y((d) => yScaleTemp(d.temperature))
    .curve(d3.curveMonotoneX);

  tempLineFemale = d3
    .line()
    .x((d) => xScale(d.hour))
    .y((d) => yScaleTemp(d.temperature))
    .curve(d3.curveMonotoneX);

  actLineMale = d3
    .line()
    .x((d) => xScale(d.hour))
    .y((d) => yScaleAct(d.activity))
    .curve(d3.curveMonotoneX);

  actLineFemale = d3
    .line()
    .x((d) => xScale(d.hour))
    .y((d) => yScaleAct(d.activity))
    .curve(d3.curveMonotoneX);

  // Draw "dark-phase" background shading (hours 18–24 and 0–6)
  addDarkShading(width, height);

  // Left Y-axis for temperature
  g.append("g")
    .attr("class", "axis")
    .call(d3.axisLeft(yScaleTemp).ticks(4));

  // Right Y-axis for activity, formatted in whole-percent steps
  g.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(${width},0)`)
    .call(
      d3
        .axisRight(yScaleAct)
        .ticks(5)
        .tickFormat((d) => `${Math.round(d * 100)}%`)
    );

  // X-axis at bottom
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

  // Right axis label: Activity (in teal)
  g.append("text")
    .attr("class", "axis-label")
    .attr("transform", "rotate(-90)")
    .attr("y", width + margin.right - 25)
    .attr("x", -(height / 2))
    .attr("dy", "1em")
    .style("text-anchor", "middle")
    .style("fill", "#4ecdc4")
    .text("Activity (%)");

  // Path elements for male (blue) and female (red) lines
  tempPathMale = g
    .append("path")
    .attr("class", "temp-line-male")
    .attr("fill", "none")
    .attr("stroke", "lightblue")
    .attr("stroke-width", 3);

  tempPathFemale = g
    .append("path")
    .attr("class", "temp-line-female")
    .attr("fill", "none")
    .attr("stroke", "#ff6b6b")
    .attr("stroke-width", 3);

  actPathMale = g
    .append("path")
    .attr("class", "act-line-male")
    .attr("fill", "none")
    .attr("stroke", "lightblue")
    .attr("stroke-width", 3)
    .attr("stroke-dasharray", "5,5");

  actPathFemale = g
    .append("path")
    .attr("class", "act-line-female")
    .attr("fill", "none")
    .attr("stroke", "#ff6b6b")
    .attr("stroke-width", 3)
    .attr("stroke-dasharray", "5,5");

  // Add legend
  const legend = g.append("g")
    .attr("class", "legend")
    .attr("transform", `translate(${width - 150}, 20)`);

  // Male legend
  legend.append("line")
    .attr("x1", 0)
    .attr("x2", 20)
    .attr("y1", 0)
    .attr("y2", 0)
    .attr("stroke", "lightblue")
    .attr("stroke-width", 3);
  
  legend.append("text")
    .attr("x", 25)
    .attr("y", 4)
    .text("Male")
    .style("font-size", "14px");

  // Female legend
  legend.append("line")
    .attr("x1", 0)
    .attr("x2", 20)
    .attr("y1", 20)
    .attr("y2", 20)
    .attr("stroke", "#ff6b6b")
    .attr("stroke-width", 3);
  
  legend.append("text")
    .attr("x", 25)
    .attr("y", 24)
    .text("Female")
    .style("font-size", "14px");

  // Add crosshair group (initially hidden)
  setupFocus(width, height);

  // Plot Day 1 by default
  updateChartDay(1);

  // Initialize Scrollama
  initScrollama();
}


// 3) Draw background rectangles behind "dark" hours
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


// 4) Update both paths to show data for "day" (1–14)
function updateChartDay(day) {
  const dayDataMale = allDataMale.filter((d) => d.day === day);
  const dayDataFemale = allDataFemale.filter((d) => d.day === day);

  // Temperature curves
  tempPathMale
    .datum(dayDataMale)
    .transition()
    .duration(800)
    .ease(d3.easeQuadInOut)
    .attr("d", tempLineMale);

  tempPathFemale
    .datum(dayDataFemale)
    .transition()
    .duration(800)
    .ease(d3.easeQuadInOut)
    .attr("d", tempLineFemale);

  // Activity curves
  actPathMale
    .datum(dayDataMale)
    .transition()
    .duration(800)
    .ease(d3.easeQuadInOut)
    .attr("d", actLineMale);

  actPathFemale
    .datum(dayDataFemale)
    .transition()
    .duration(800)
    .ease(d3.easeQuadInOut)
    .attr("d", actLineFemale);
}


// 5) Create crosshair circles and tooltip on mousemove
function setupFocus(width, height) {
  const bisect = d3.bisector((d) => d.hour).left;

  focus = g.append("g").attr("class", "focus").style("display", "none");

  // Circles for male temp and activity
  focus
    .append("circle")
    .attr("class", "male-temp")
    .attr("r", 5)
    .attr("fill", "lightblue")
    .attr("stroke", "#fff")
    .attr("stroke-width", 2);

  focus
    .append("circle")
    .attr("class", "male-act")
    .attr("r", 5)
    .attr("fill", "lightblue")
    .attr("stroke", "#fff")
    .attr("stroke-width", 2);

  // Circles for female temp and activity
  focus
    .append("circle")
    .attr("class", "female-temp")
    .attr("r", 5)
    .attr("fill", "#ff6b6b")
    .attr("stroke", "#fff")
    .attr("stroke-width", 2);

  focus
    .append("circle")
    .attr("class", "female-act")
    .attr("r", 5)
    .attr("fill", "#ff6b6b")
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
      const x0 = xScale.invert(mouseX - margin.left);

      const currentDay = getCurrentStepDay();
      const dayDataMale = allDataMale.filter((d) => d.day === currentDay);
      const dayDataFemale = allDataFemale.filter((d) => d.day === currentDay);
      
      const i = bisect(dayDataMale, x0, 1);
      const d0Male = dayDataMale[i - 1];
      const d1Male = dayDataMale[i];
      const d0Female = dayDataFemale[i - 1];
      const d1Female = dayDataFemale[i];
      
      if (!d0Male || !d1Male || !d0Female || !d1Female) return;
      
      const dMale = x0 - d0Male.hour > d1Male.hour - x0 ? d1Male : d0Male;
      const dFemale = x0 - d0Female.hour > d1Female.hour - x0 ? d1Female : d0Female;

      // Move the circles
      focus
        .select(".male-temp")
        .attr(
          "transform",
          `translate(${xScale(dMale.hour)}, ${yScaleTemp(dMale.temperature)})`
        );

      focus
        .select(".male-act")
        .attr(
          "transform",
          `translate(${xScale(dMale.hour)}, ${yScaleAct(dMale.activity)})`
        );

      focus
        .select(".female-temp")
        .attr(
          "transform",
          `translate(${xScale(dFemale.hour)}, ${yScaleTemp(dFemale.temperature)})`
        );

      focus
        .select(".female-act")
        .attr(
          "transform",
          `translate(${xScale(dFemale.hour)}, ${yScaleAct(dFemale.activity)})`
        );

      // Show tooltip with both values
      tooltip
        .style("opacity", 1)
        .html(
          `Day ${dMale.day}, ${dMale.hour}:00<br/>
           <strong>Male:</strong><br/>
           Temp: ${dMale.temperature.toFixed(1)} °C<br/>
           Activity: ${Math.round(dMale.activity * 100)}%<br/>
           <strong>Female:</strong><br/>
           Temp: ${dFemale.temperature.toFixed(1)} °C<br/>
           Activity: ${Math.round(dFemale.activity * 100)}%`
        )
        .style("left", event.pageX + 10 + "px")
        .style("top", event.pageY - 10 + "px");
    });
}


// 6) Helper: find day from the ".step.active" element
function getCurrentStepDay() {
  const active = document.querySelector(".step.active");
  return active ? +active.dataset.step + 1 : 1;
}


// 7) When a step scrolls into view, update chart title + day indicator
function updateVisualization(idx) {
  const day = idx + 1;
  document.getElementById("dayIndicator").textContent = `Day ${day}`;

  const chartTitle = document.getElementById("chartTitle");
  const estrusDays = [6, 10, 14];
  
  if (estrusDays.includes(day)) {
    chartTitle.textContent = `Day ${day}: Estrus Phase - Elevated Temperature`;
  } else {
    chartTitle.textContent = `Day ${day}: Regular Patterns`;
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
      // Remove "active" from all steps
      d3.selectAll(".step").classed("active", false);
      // Mark current step as "active"
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

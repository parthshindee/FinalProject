let svg, g, labelsGroup;
let xScale, yScaleTemp, yScaleAct;
let tempLineMale, tempLineFemale, actLineMale, actLineFemale;
let tempPathMale, tempPathFemale, actPathMale, actPathFemale;
let focus, tooltip;
let allDataMale, allDataFemale;

const margin = { top: 20, right: 70, bottom: 40, left: 50 };


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

  const maleActRows = sheetToRows("Male Act");
  const maleTempRows = sheetToRows("Male Temp");
  const femActRows = sheetToRows("Fem Act");
  const femTempRows = sheetToRows("Fem Temp");

  const totalMinutes = femActRows.length;
  const days = Math.floor(totalMinutes / 1440); // 14 days

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

  allDataMale = [];
  allDataFemale = [];
  
  for (let d = 1; d <= Math.min(days, 14); d++) {
    for (let h = 0; h < 24; h++) {
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

  initChart();
});


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

  svg.append("defs")
    .append("clipPath")
    .attr("id", "chart-clip")
    .append("rect")
    .attr("width", width)
    .attr("height", height);

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

  xScale = d3.scaleLinear().domain([0, 24]).range([0, width]);

  yScaleTemp = d3
    .scaleLinear()
    .domain([35.5, 39])
    .nice()
    .range([height, 0]);

  yScaleAct = d3
    .scaleLinear()
    .domain([0, 100])
    .nice()
    .range([height, 0]);

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

  g.append("g")
    .attr("class", "axis")
    .call(d3.axisLeft(yScaleTemp).ticks(4));

  g.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(${width},0)`)
    .call(
      d3
        .axisRight(yScaleAct)
        .ticks(5)
        .tickFormat((d) => `${d}%`)
    );

  g.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${height})`)
    .call(
      d3
        .axisBottom(xScale)
        .ticks(6)
        .tickFormat((d) => `${d}:00`)
    );

  addDarkShading(width, height);

  g.append("text")
    .attr("class", "axis-label")
    .attr("transform", "rotate(-90)")
    .attr("y", -margin.left + 15)
    .attr("x", -(height / 2))
    .attr("dy", "1em")
    .style("text-anchor", "middle")
    .style("fill", "#000")
    .text("Temperature (°C)");

  g.append("text")
    .attr("class", "axis-label")
    .attr("transform", "rotate(-90)")
    .attr("y", width + margin.right - 25)
    .attr("x", -(height / 2))
    .attr("dy", "1em")
    .style("text-anchor", "middle")
    .style("fill", "#000")
    .text("Activity (%)");

  const linesGroup = g.append("g")
    .attr("clip-path", "url(#chart-clip)");

  tempPathMale = linesGroup
    .append("path")
    .attr("class", "temp-line-male")
    .attr("fill", "none")
    .attr("stroke", "lightblue")
    .attr("stroke-width", 3);

  tempPathFemale = linesGroup
    .append("path")
    .attr("class", "temp-line-female")
    .attr("fill", "none")
    .attr("stroke", "#ff6b6b")
    .attr("stroke-width", 3);

  actPathMale = linesGroup
    .append("path")
    .attr("class", "act-line-male")
    .attr("fill", "none")
    .attr("stroke", "lightblue")
    .attr("stroke-width", 3)
    .attr("stroke-dasharray", "5,5");

  actPathFemale = linesGroup
    .append("path")
    .attr("class", "act-line-female")
    .attr("fill", "none")
    .attr("stroke", "#ff6b6b")
    .attr("stroke-width", 3)
    .attr("stroke-dasharray", "5,5");

  labelsGroup = g.append("g")
    .attr("class", "line-labels");

  setupFocus(width, height);

  updateChartDay(1);

  initScrollama();
}


function addDarkShading(width, height) {
  const shadingGroup = g.insert("g", ":first-child")
    .attr("clip-path", "url(#chart-clip)");
    
  shadingGroup.append("rect")
    .attr("x", xScale(18))
    .attr("y", 0)
    .attr("width", xScale(24) - xScale(18))
    .attr("height", height)
    .attr("fill", "rgba(0,0,0,0.05)");

  shadingGroup.append("rect")
    .attr("x", xScale(0))
    .attr("y", 0)
    .attr("width", xScale(6) - xScale(0))
    .attr("height", height)
    .attr("fill", "rgba(0,0,0,0.05)");
}


function updateChartDay(day) {
  const dayDataMale = allDataMale.filter((d) => d.day === day);
  const dayDataFemale = allDataFemale.filter((d) => d.day === day);

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
    
  labelsGroup.selectAll("*").remove();
  
  const maleTempPoint = dayDataMale.find(d => d.hour === 5);
  if (maleTempPoint) {
    labelsGroup.append("text")
      .attr("x", xScale(5))
      .attr("y", yScaleTemp(maleTempPoint.temperature) + 20)
      .attr("text-anchor", "middle")
      .attr("fill", "#4682B4") 
      .attr("font-size", "12px")
      .attr("font-weight", "600")
      .style("paint-order", "stroke")
      .style("stroke", "white")
      .style("stroke-width", "4px")
      .style("stroke-linejoin", "round")
      .text("Male Temp");
  }
  
  const femaleTempPoint = dayDataFemale.find(d => d.hour === 3);
  if (femaleTempPoint) {
    labelsGroup.append("text")
      .attr("x", xScale(3))
      .attr("y", yScaleTemp(femaleTempPoint.temperature) - 10)
      .attr("text-anchor", "middle")
      .attr("fill", "#DC143C") 
      .attr("font-size", "12px")
      .attr("font-weight", "600")
      .style("paint-order", "stroke")
      .style("stroke", "white")
      .style("stroke-width", "4px")
      .style("stroke-linejoin", "round")
      .text("Female Temp");
  }
  
  const maleActPoint = dayDataMale.find(d => d.hour === 15);
  if (maleActPoint) {
    labelsGroup.append("text")
      .attr("x", xScale(15))
      .attr("y", yScaleAct(maleActPoint.activity) - 10)
      .attr("text-anchor", "middle")
      .attr("fill", "#4682B4")
      .attr("font-size", "12px")
      .attr("font-weight", "600")
      .style("paint-order", "stroke")
      .style("stroke", "white")
      .style("stroke-width", "4px")
      .style("stroke-linejoin", "round")
      .text("Male Activity");
  }
  
  const femaleActPoint = dayDataFemale.find(d => d.hour === 20);
  if (femaleActPoint) {
    labelsGroup.append("text")
      .attr("x", xScale(20))
      .attr("y", yScaleAct(femaleActPoint.activity) - 10)
      .attr("text-anchor", "middle")
      .attr("fill", "#DC143C")
      .attr("font-size", "12px")
      .attr("font-weight", "600")
      .style("paint-order", "stroke")
      .style("stroke", "white")
      .style("stroke-width", "4px")
      .style("stroke-linejoin", "round")
      .text("Female Activity");
  }
}


function setupFocus(width, height) {
  const bisect = d3.bisector((d) => d.hour).left;

  focus = g.append("g").attr("class", "focus").style("display", "none");

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

      tooltip
        .style("opacity", 1)
        .html(
          `Day ${dMale.day}, ${dMale.hour}:00<br/>
           <strong>Male:</strong><br/>
           Temp: ${dMale.temperature.toFixed(1)} °C<br/>
           Activity: ${dMale.activity.toFixed(1)}%<br/>
           <strong>Female:</strong><br/>
           Temp: ${dFemale.temperature.toFixed(1)} °C<br/>
           Activity: ${dFemale.activity.toFixed(1)}%`
        )
        .style("left", event.pageX + 10 + "px")
        .style("top", event.pageY - 10 + "px");
    });
}


function getCurrentStepDay() {
  const active = document.querySelector(".step.active");
  return active ? +active.dataset.step + 1 : 1;
}


function updateVisualization(idx) {
  const day = idx + 1;
  document.getElementById("dayIndicator").textContent = `Day ${day}`;

  const chartTitle = document.getElementById("chartTitle");
  
  switch (day) {
    case 1:
      chartTitle.textContent = "Day 1: Establishing Sex Differences";
      break;
    case 2:
      chartTitle.textContent = "Day 2: Consistent Sex-Based Patterns";
      break;
    case 3:
      chartTitle.textContent = "Day 3: Baseline Established";
      break;
    case 4:
      chartTitle.textContent = "Day 4: Pre-Estrus Stability";
      break;
    case 5:
      chartTitle.textContent = "Day 5: Approaching First Estrus";
      break;
    case 6:
      chartTitle.textContent = "Day 6: First Estrus Peak";
      break;
    case 7:
      chartTitle.textContent = "Day 7: Post-Estrus Recovery";
      break;
    case 8:
      chartTitle.textContent = "Day 8: Inter-Estrus Period";
      break;
    case 9:
      chartTitle.textContent = "Day 9: Preparing for Next Cycle";
      break;
    case 10:
      chartTitle.textContent = "Day 10: Second Estrus Peak";
      break;
    case 11:
      chartTitle.textContent = "Day 11: Gradual Decline";
      break;
    case 12:
      chartTitle.textContent = "Day 12: Stable Inter-Estrus";
      break;
    case 13:
      chartTitle.textContent = "Day 13: Pre-Estrus Indicators";
      break;
    case 14:
      chartTitle.textContent = "Day 14: Third Estrus Peak";
      break;
    default:
      chartTitle.textContent = `Day ${day}`;
  }

  updateChartDay(day);
}


function initScrollama() {
  const scroller = scrollama();

  scroller
    .setup({
      step: ".step",
      offset: 0.5,
      debug: false,
    })
    .onStepEnter((response) => {
      d3.selectAll(".step").classed("active", false);
      d3.select(response.element).classed("active", true);
      updateVisualization(response.index);
    });

  window.addEventListener("resize", () => {
    scroller.resize();
  });

  updateVisualization(0);
}

// =================================================================================
// --- GLOBAL VARIABLES AND CONFIGURATION ---
// =================================================================================
let originalData = [];
let activeSelection = [];

const margin = { top: 60, right: 30, bottom: 60, left: 80 };
const tooltip = d3.select(".tooltip");
const colorScale = d3.scaleOrdinal(d3.schemeTableau10);

// =================================================================================
// --- DATA LOADING AND PROCESSING ---
// =================================================================================
const csvFilePath = "./ds_salaries.csv"; 

document.addEventListener('DOMContentLoaded', () => { loadData(); });

function loadData() {
    d3.csv(csvFilePath).then(data => {
        processRawData(data);
        initializeDashboard();
    }).catch(error => {
        console.error("D3 Error:", error);
        showError(`Could not load the file from "${csvFilePath}".<br>Please check the file path and name.`);
    });
}

function processRawData(rawData) {
    const expLevelMap = { 'EN': 'Entry-level', 'MI': 'Mid-level', 'SE': 'Senior-level', 'EX': 'Executive-level' };
    const sizeMap = { 'S': 'Small', 'M': 'Medium', 'L': 'Large' };
    originalData = rawData.map((row, i) => {
        const d = {
            id: `d-${i}`,
            workYear: +row.work_year,
            experienceLevel: expLevelMap[row.experience_level] || row.experience_level,
            jobTitle: row.job_title,
            salaryInUSD: +row.salary_in_usd,
            remoteRatio: +row.remote_ratio,
            companySize: sizeMap[row.company_size] || row.company_size
        };
        if (isNaN(d.workYear) || isNaN(d.salaryInUSD) || !d.jobTitle) return null;
        return d;
    }).filter(d => d !== null && d.salaryInUSD > 0);
    
    if (originalData.length === 0) throw new Error("No valid data was processed from the CSV.");
    activeSelection = [...originalData];
}

// =================================================================================
// --- DASHBOARD INITIALIZATION AND UTILITIES ---
// =================================================================================
function initializeDashboard() {
    d3.select("#loading").style("display", "none");
    d3.select("#content").style("display", "block");
    
    // Reset button now also resets histogram controls
    d3.select("#resetButton").on("click", () => {
        const brush = d3.brushX();
        d3.select("#interactive-histogram .brush").call(brush.move, null);
        
        // Reset controls
        d3.select("#bin-slider").property("value", 40);
        d3.select("#bin-count-label").text("40");
        d3.select("#group-by-select").property("value", "none");

        updateInteractiveHistogram(); // Redraw histogram with default settings
        updateAllCharts(originalData); // Update other charts
    });

    // Event listeners for new histogram controls
    d3.select("#bin-slider").on("input", function() {
        d3.select("#bin-count-label").text(this.value);
        updateInteractiveHistogram();
    });
    d3.select("#group-by-select").on("change", updateInteractiveHistogram);
    
    createAllVisualizations();
    window.addEventListener('resize', () => {
        createAllVisualizations();
        // Also update histogram on resize as its dimensions change
        updateInteractiveHistogram();
    });
}

function showError(message) { d3.select("#loading").style("display", "none"); d3.select("#error").style("display", "block").html(`<i class="fas fa-exclamation-triangle"></i> ${message}`); }
function showTooltip(event, text) { tooltip.style("opacity", .9); tooltip.html(text).style("left", `${event.pageX + 10}px`).style("top", `${event.pageY - 28}px`); }
function hideTooltip() { tooltip.style("opacity", 0); }

// =================================================================================
// --- CHART UPDATE LOGIC ---
// =================================================================================
function updateAllCharts(data) {
    activeSelection = data;
    // Update all visualizations with the new data selection
    createSummaryTable(activeSelection);
    updateBoxPlot();
    updateTreemap();
}

function createAllVisualizations() {
    createSummaryTable(originalData);
    createInteractiveHistogram(); // Setup histogram structure
    createBoxPlot();
    createTreemap();
}

// =================================================================================
// --- SUMMARY & ORIGINAL VISUALIZATIONS ---
// =================================================================================
function createSummaryTable(data) {
    d3.select("#data-summary").html("");
    const formatCurrency = d3.format("$,.0f");
    const summaryData = [
        { label: "Selected Records", value: data.length.toLocaleString() },
        { label: "Average Salary (USD)", value: formatCurrency(d3.mean(data, d => d.salaryInUSD) || 0) },
        { label: "Median Salary (USD)", value: formatCurrency(d3.median(data, d => d.salaryInUSD) || 0) },
        { label: "Unique Job Titles", value: new Set(data.map(d=>d.jobTitle)).size }
    ];
    d3.select("#data-summary").selectAll(".summary-item").data(summaryData).enter().append("div")
        .attr("class", "summary-item").html(d => `<div class="value">${d.value}</div><div class="label">${d.label}</div>`);
}


// =================================================================================
// --- NEW: FULLY INTERACTIVE HISTOGRAM ---
// =================================================================================

function createInteractiveHistogram() {
    d3.select("#interactive-histogram").html(""); // Clear previous SVG
    const containerNode = d3.select("#interactive-histogram").node();
    if(!containerNode) return;

    const histMargin = { top: 10, right: 30, bottom: 50, left: 60 };
    const width = containerNode.getBoundingClientRect().width - histMargin.left - histMargin.right;
    const height = 350 - histMargin.top - histMargin.bottom;

    const svg = d3.select("#interactive-histogram").append("svg")
        .attr("width", width + histMargin.left + histMargin.right)
        .attr("height", height + histMargin.top + histMargin.bottom)
      .append("g")
        .attr("transform", `translate(${histMargin.left},${histMargin.top})`);

    // Add main groups for axes and chart elements
    svg.append("g").attr("class", "x-axis axis");
    svg.append("g").attr("class", "y-axis axis");
    svg.append("g").attr("class", "bars-container");
    svg.append("text").attr("class", "x-label").attr("text-anchor", "middle").attr("x", width/2).attr("y", height + 40).text("Salary in USD");

    // Add brush
    const brush = d3.brushX()
        .extent([[0, 0], [width, height]])
        .on("end", event => {
            if (!event.selection) {
                updateAllCharts(originalData); // If brush is cleared, show all data
                return;
            }
            const x = d3.select("#interactive-histogram").node().__x; // Get scale from node
            const [x0, x1] = event.selection.map(x.invert);
            const brushedData = originalData.filter(d => d.salaryInUSD >= x0 && d.salaryInUSD <= x1);
            updateAllCharts(brushedData);
        });
    svg.append("g").attr("class", "brush").call(brush);

    // Initial draw
    updateInteractiveHistogram();
}

function updateInteractiveHistogram() {
    const containerNode = d3.select("#interactive-histogram").node();
    if(!containerNode) return;
    
    const numBins = +d3.select("#bin-slider").property("value");
    const groupBy = d3.select("#group-by-select").property("value");

    const histMargin = { top: 10, right: 30, bottom: 50, left: 60 };
    const svg = d3.select("#interactive-histogram svg g");
    const width = d3.select("#interactive-histogram svg").attr("width") - histMargin.left - histMargin.right;
    const height = d3.select("#interactive-histogram svg").attr("height") - histMargin.top - histMargin.bottom;

    const x = d3.scaleLinear()
        .domain(d3.extent(originalData, d => d.salaryInUSD)).nice()
        .range([0, width]);
    
    // Store scale on the node for the brush to access it
    d3.select("#interactive-histogram").node().__x = x;
    
    svg.select(".x-axis")
        .attr("transform", `translate(0,${height})`)
        .transition().duration(500)
        .call(d3.axisBottom(x).tickFormat(d => `$${d/1000}K`));

    const histogram = d3.histogram()
        .value(d => d.salaryInUSD)
        .domain(x.domain())
        .thresholds(x.ticks(numBins));

    const bins = histogram(originalData);

    // --- GROUPING LOGIC ---
    let y, subgroups, xSubgroup;
    if (groupBy === 'none') {
        y = d3.scaleLinear()
            .domain([0, d3.max(bins, d => d.length)]).nice()
            .range([height, 0]);
    } else {
        subgroups = [...new Set(originalData.map(d => d[groupBy]))].sort();
        colorScale.domain(subgroups);
        xSubgroup = d3.scaleBand()
            .domain(subgroups)
            .padding([0.05]);

        // Find the max count within any subgroup in any bin
        let maxGroupCount = 0;
        bins.forEach(bin => {
            const groupCounts = d3.rollup(bin, v => v.length, d => d[groupBy]);
            const currentMax = d3.max([...groupCounts.values()]);
            if (currentMax > maxGroupCount) {
                maxGroupCount = currentMax;
            }
        });
        y = d3.scaleLinear()
            .domain([0, maxGroupCount]).nice()
            .range([height, 0]);
    }

    svg.select(".y-axis").transition().duration(500).call(d3.axisLeft(y));

    // --- DRAWING LOGIC ---
    const binGroups = svg.select(".bars-container").selectAll(".bin-group").data(bins);
    binGroups.exit().remove();
    const binGroupsEnter = binGroups.enter().append("g").attr("class", "bin-group");
    
    binGroups.merge(binGroupsEnter)
        .attr("transform", d => `translate(${x(d.x0)}, 0)`);

    // Clear previous rects before drawing new ones
    binGroups.selectAll("rect").remove();
    binGroupsEnter.selectAll("rect").remove();

    if (groupBy === 'none') {
        // --- SIMPLE HISTOGRAM ---
        binGroups.merge(binGroupsEnter)
            .append("rect")
            .attr("x", 1)
            .attr("width", d => Math.max(0, x(d.x1) - x(d.x0) - 1))
            .attr("fill", "#4a90e2")
            .attr("y", height)
            .attr("height", 0)
            .on("mouseover", (e, d) => showTooltip(e, `Range: ${d3.format("$,.0f")(d.x0)} - ${d3.format("$,.0f")(d.x1)}<br>Count: ${d.length}`))
            .on("mouseout", hideTooltip)
            .transition().duration(750)
            .attr("y", d => y(d.length))
            .attr("height", d => height - y(d.length));
    } else {
        // --- GROUPED HISTOGRAM ---
        xSubgroup.range([0, Math.max(0, x(bins[0].x1) - x(bins[0].x0))]);
        
        binGroups.merge(binGroupsEnter).each(function(binData) {
            const groupCounts = d3.rollup(binData, v => v.length, d => d[groupBy]);
            const groupArray = Array.from(groupCounts, ([key, value]) => ({key, value}));
            
            d3.select(this).selectAll("rect")
                .data(groupArray)
                .enter()
                .append("rect")
                .attr("x", d => xSubgroup(d.key))
                .attr("width", xSubgroup.bandwidth())
                .attr("fill", d => colorScale(d.key))
                .attr("y", height)
                .attr("height", 0)
                .on("mouseover", (e, d) => showTooltip(e, `Group: ${d.key}<br>Range: ${d3.format("$,.0f")(binData.x0)} - ${d3.format("$,.0f")(binData.x1)}<br>Count: ${d.value}`))
                .on("mouseout", hideTooltip)
                .transition().duration(750)
                .attr("y", d => y(d.value))
                .attr("height", d => height - y(d.value));
        });
    }

    // --- LEGEND LOGIC ---
    const legendContainer = d3.select("#histogram-legend");
    legendContainer.html(""); // Clear previous legend
    if (groupBy !== 'none' && subgroups) {
        subgroups.forEach(group => {
            const legendItem = legendContainer.append("div").attr("class", "legend-item");
            legendItem.append("div")
                .attr("class", "legend-color")
                .style("background-color", colorScale(group));
            legendItem.append("span").text(group);
        });
    }
}


// =================================================================================
// --- OTHER ADVANCED VISUALIZATIONS (BoxPlot, Treemap) ---
// =================================================================================

function createBoxPlot() {
    d3.select("#box-plot").html("");
    const containerNode = d3.select("#box-plot").node();
    if(!containerNode) return;
    const bpMargin = { top: 20, right: 30, bottom: 50, left: 60 };
    const width = containerNode.getBoundingClientRect().width - bpMargin.left - bpMargin.right;
    const height = 400 - bpMargin.top - bpMargin.bottom;
    const svg = d3.select("#box-plot").append("svg").attr("width", width + bpMargin.left + bpMargin.right).attr("height", height + bpMargin.top + bpMargin.bottom).append("g").attr("transform", `translate(${bpMargin.left},${bpMargin.top})`);
    svg.append("g").attr("class", "x-axis axis");
    svg.append("g").attr("class", "y-axis axis");
    svg.append("g").attr("class", "box-plots");
    updateBoxPlot();
}

function updateBoxPlot() {
    const containerNode = d3.select("#box-plot").node();
    const svg = d3.select("#box-plot svg g");
    if(!containerNode || !svg.node() || activeSelection.length === 0) {
        if (svg.node()) svg.select(".box-plots").html(""); // Clear if no data
        return;
    }
    const bpMargin = { top: 20, right: 30, bottom: 50, left: 60 };
    const width = containerNode.getBoundingClientRect().width - bpMargin.left - bpMargin.right;
    const height = 400 - bpMargin.top - bpMargin.bottom;

    const sumstat = d3.group(activeSelection, d => d.experienceLevel);
    const categories = ['Entry-level', 'Mid-level', 'Senior-level', 'Executive-level'];
    
    const y = d3.scaleLinear().domain(d3.extent(activeSelection, d => d.salaryInUSD)).nice().range([height, 0]);
    svg.select(".y-axis").transition().duration(500).call(d3.axisLeft(y).tickFormat(d => `$${d/1000}K`));
    const x = d3.scaleBand().range([0, width]).domain(categories).padding(0.75);
    svg.select(".x-axis").attr("transform", `translate(0, ${height})`).call(d3.axisBottom(x));

    const boxPlots = svg.select(".box-plots").selectAll("g.boxplot").data([...sumstat.entries()], d => d[0]);
    boxPlots.exit().remove();
    const boxEnter = boxPlots.enter().append("g").attr("class", "boxplot");
    boxEnter.append("line").attr("class", "center-line");
    boxEnter.append("rect").attr("class", "box");
    boxEnter.append("line").attr("class", "median-line");

    boxEnter.merge(boxPlots).each(function([key, value]) {
        value.sort((a,b) => a.salaryInUSD - b.salaryInUSD);
        const q1 = d3.quantile(value, .25, d => d.salaryInUSD);
        const median = d3.quantile(value, .5, d => d.salaryInUSD);
        const q3 = d3.quantile(value, .75, d => d.salaryInUSD);
        const iqr = q3 - q1;
        const min = q1 - 1.5 * iqr;
        const max = q3 + 1.5 * iqr;
        const boxWidth = x.bandwidth();
        const g = d3.select(this);
        g.select(".center-line").transition().duration(500).attr("x1", x(key) + boxWidth/2).attr("x2", x(key) + boxWidth/2).attr("y1", y(min)).attr("y2", y(max)).attr("stroke", "#333");
        g.select(".box").transition().duration(500).attr("x", x(key)).attr("y", y(q3)).attr("width", boxWidth).attr("height", y(q1) - y(q3)).attr("stroke", "black").style("fill", colorScale(key));
        g.select(".median-line").transition().duration(500).attr("x1", x(key)).attr("x2", x(key) + boxWidth).attr("y1", y(median)).attr("y2", y(median)).attr("stroke", "black").style("stroke-width", "2px");
    });
}

function createTreemap() {
    d3.select("#treemap-chart").html("");
    const containerNode = d3.select("#treemap-chart").node();
    if(!containerNode) return;
    const tmMargin = {top: 10, right: 10, bottom: 10, left: 10};
    const width = containerNode.getBoundingClientRect().width - tmMargin.left - tmMargin.right;
    const height = 450 - tmMargin.top - tmMargin.bottom;
    const svg = d3.select("#treemap-chart").append("svg").attr("width", width + tmMargin.left + tmMargin.right).attr("height", height + tmMargin.top + tmMargin.bottom).append("g").attr("transform", `translate(${tmMargin.left},${tmMargin.top})`);
    updateTreemap();
}

function updateTreemap() {
    const svg = d3.select("#treemap-chart svg g");
    if(svg.empty()) return;
    svg.selectAll("*").remove(); // Clear previous content
    if (activeSelection.length === 0) return;
    
    const width = d3.select("#treemap-chart svg").attr("width") - 20;
    const height = d3.select("#treemap-chart svg").attr("height") - 20;

    const jobCounts = d3.rollup(activeSelection, v => ({ avgSalary: d3.mean(v, d => d.salaryInUSD), count: v.length }), d => d.jobTitle);
    const topJobsData = Array.from(jobCounts.entries()).sort((a, b) => b[1].count - a[1].count).slice(0, 20).map(([title, data]) => ({ name: title, value: data.avgSalary, count: data.count }));
    if(topJobsData.length === 0) return;

    const root = d3.hierarchy({ children: topJobsData }).sum(d => d.value);
    d3.treemap().size([width, height]).padding(4)(root);

    const cell = svg.selectAll("g").data(root.leaves()).enter().append("g").attr("transform", d => `translate(${d.x0},${d.y0})`);
    cell.append("rect").attr("id", (d,i) => `rect-${i}`).attr("width", d => d.x1 - d.x0).attr("height", d => d.y1 - d.y0).attr("fill", d => colorScale(d.data.name))
        .on("mouseover", (e, d) => showTooltip(e, `<b>${d.data.name}</b><br>Avg. Salary: ${d3.format("$,.0f")(d.data.value)}<br>Count: ${d.data.count}`))
        .on("mouseout", hideTooltip);
    cell.append("clipPath").attr("id", (d,i) => `clip-${i}`).append("use").attr("xlink:href", (d,i) => `#rect-${i}`);
    cell.append("text").attr("clip-path", (d,i) => `url(#clip-${i})`).selectAll("tspan").data(d => d.data.name.split(/(?=[A-Z][^A-Z])/g)).join("tspan").attr("x", 4).attr("y", (d, i) => 13 + i * 10).text(d => d).attr("font-size", "12px").attr("fill", "white");
}

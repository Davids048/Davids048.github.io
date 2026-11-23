// Meta page: read the per-line code data in loc.csv, show summary stats about
// the codebase, and draw a brushable scatterplot of commits by date and time of day.
// A time slider and a scrollytelling story filter the commits up to a chosen time,
// and a unit visualization shows the lines of each file.
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import scrollama from 'https://cdn.jsdelivr.net/npm/scrollama@3.2.0/+esm';

// The scales are module-level because the brush handlers also use them.
let xScale;
let yScale;

// Read loc.csv and convert the numeric and date columns from strings.
async function loadData() {
    const data = await d3.csv('loc.csv', (row) => ({
        ...row,
        line: Number(row.line),
        depth: Number(row.depth),
        length: Number(row.length),
        date: new Date(row.date + 'T00:00' + row.timezone),
        datetime: new Date(row.datetime),
    }));

    return data;
}

// Group the line rows by commit and return one object per commit. The rows of
// each commit are kept in a non-enumerable lines property, so console output
// stays short.
function processCommits(data) {
    return d3
        .groups(data, (d) => d.commit)
        .map(([commit, lines]) => {
            let first = lines[0];
            let { author, date, time, timezone, datetime } = first;
            let ret = {
                id: commit,
                url: 'https://github.com/Davids048/Davids048.github.io/commit/' + commit,
                author,
                date,
                time,
                timezone,
                datetime,
                hourFrac: datetime.getHours() + datetime.getMinutes() / 60,
                totalLines: lines.length,
            };

            Object.defineProperty(ret, 'lines', {
                value: lines,
                configurable: false,
                writable: false,
                enumerable: false,
            });

            return ret;
        })
        .sort((a, b) => a.datetime - b.datetime);
}

// Render the summary stats of the whole codebase as a <dl> in #stats.
function renderCommitInfo(data, commits) {
    // Clear the old stats, because the slider calls this again with filtered data.
    d3.select('#stats').html('');
    const dl = d3.select('#stats').append('dl').attr('class', 'stats');

    dl.append('dt').html('Total <abbr title="Lines of code">LOC</abbr>');
    dl.append('dd').text(data.length);

    dl.append('dt').text('Total commits');
    dl.append('dd').text(commits.length);

    dl.append('dt').text('Files');
    dl.append('dd').text(d3.group(data, (d) => d.file).size);

    // Average file length is the mean of the last line number of each file.
    const fileLengths = d3.rollups(
        data,
        (v) => d3.max(v, (v) => v.line),
        (d) => d.file,
    );
    dl.append('dt').text('Average file length');
    dl.append('dd').text(Math.round(d3.mean(fileLengths, (d) => d[1])));

    dl.append('dt').text('Max depth');
    dl.append('dd').text(d3.max(data, (d) => d.depth));

    // The period of the day (morning, afternoon, ...) with the most edited lines.
    const workByPeriod = d3.rollups(
        data,
        (v) => v.length,
        (d) => d.datetime.toLocaleString('en', { dayPeriod: 'short' }),
    );
    dl.append('dt').text('Most active time');
    dl.append('dd').text(d3.greatest(workByPeriod, (d) => d[1])?.[0]);
}

// Draw the scatterplot of commits: date on the X axis, time of day on the Y
// axis, and dot area proportional to the number of edited lines.
function renderScatterPlot(data, commits) {
    const width = 1000;
    const height = 600;
    const margin = { top: 10, right: 10, bottom: 30, left: 20 };
    const usableArea = {
        top: margin.top,
        right: width - margin.right,
        bottom: height - margin.bottom,
        left: margin.left,
        width: width - margin.left - margin.right,
        height: height - margin.top - margin.bottom,
    };

    const svg = d3
        .select('#chart')
        .append('svg')
        .attr('viewBox', `0 0 ${width} ${height}`)
        .style('overflow', 'visible');

    xScale = d3
        .scaleTime()
        .domain(d3.extent(commits, (d) => d.datetime))
        .range([usableArea.left, usableArea.right])
        .nice();

    yScale = d3.scaleLinear().domain([0, 24]).range([usableArea.bottom, usableArea.top]);

    // Grid lines are an axis with no labels and full-width ticks, drawn first
    // so that the dots and the axes are painted on top of them.
    const gridlines = svg
        .append('g')
        .attr('class', 'gridlines')
        .attr('transform', `translate(${usableArea.left}, 0)`);
    gridlines.call(d3.axisLeft(yScale).tickFormat('').tickSize(-usableArea.width));

    const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
    const rScale = d3.scaleSqrt().domain([minLines, maxLines]).range([2, 30]);

    // Large dots are drawn first, so the small dots on top stay hoverable.
    const sortedCommits = d3.sort(commits, (d) => -d.totalLines);

    const dots = svg.append('g').attr('class', 'dots');
    dots
        .selectAll('circle')
        .data(sortedCommits, (d) => d.id)
        .join('circle')
        .attr('cx', (d) => xScale(d.datetime))
        .attr('cy', (d) => yScale(d.hourFrac))
        .attr('r', (d) => rScale(d.totalLines))
        .style('--r', (d) => rScale(d.totalLines))
        .attr('fill', 'steelblue')
        .style('fill-opacity', 0.7)
        .on('mouseenter', (event, commit) => {
            d3.select(event.currentTarget).style('fill-opacity', 1);
            renderTooltipContent(commit);
            updateTooltipVisibility(true);
            updateTooltipPosition(event);
        })
        .on('mouseleave', (event) => {
            d3.select(event.currentTarget).style('fill-opacity', 0.7);
            updateTooltipVisibility(false);
        });

    const xAxis = d3.axisBottom(xScale);
    const yAxis = d3
        .axisLeft(yScale)
        .tickFormat((d) => String(d % 24).padStart(2, '0') + ':00');

    svg
        .append('g')
        .attr('transform', `translate(0, ${usableArea.bottom})`)
        .attr('class', 'x-axis')
        .call(xAxis);

    svg
        .append('g')
        .attr('transform', `translate(${usableArea.left}, 0)`)
        .attr('class', 'y-axis')
        .call(yAxis);

    createBrushSelector(svg, commits);
}

// Redraw the existing scatterplot for a new set of commits: rescale the X axis
// and join the dots by commit id, so each commit keeps its own <circle>.
function updateScatterPlot(data, commits) {
    const svg = d3.select('#chart').select('svg');

    xScale = xScale.domain(d3.extent(commits, (d) => d.datetime)).nice();

    const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
    const rScale = d3.scaleSqrt().domain([minLines, maxLines]).range([2, 30]);

    const xAxisGroup = svg.select('g.x-axis');
    xAxisGroup.selectAll('*').remove();
    xAxisGroup.call(d3.axisBottom(xScale));

    const sortedCommits = d3.sort(commits, (d) => -d.totalLines);
    svg.select('g.dots')
        .selectAll('circle')
        .data(sortedCommits, (d) => d.id)
        .join('circle')
        .attr('cx', (d) => xScale(d.datetime))
        .attr('cy', (d) => yScale(d.hourFrac))
        .attr('r', (d) => rScale(d.totalLines))
        .style('--r', (d) => rScale(d.totalLines))
        .attr('fill', 'steelblue')
        .style('fill-opacity', 0.7)
        .on('mouseenter', (event, commit) => {
            d3.select(event.currentTarget).style('fill-opacity', 1);
            renderTooltipContent(commit);
            updateTooltipVisibility(true);
            updateTooltipPosition(event);
        })
        .on('mouseleave', (event) => {
            d3.select(event.currentTarget).style('fill-opacity', 0.7);
            updateTooltipVisibility(false);
        });
}

// Unit visualization: one row per file, sorted by size, with one dot per line
// colored by the technology (file type) of the line.
function updateFileDisplay(filteredCommits) {
    const lines = filteredCommits.flatMap((d) => d.lines);
    const files = d3
        .groups(lines, (d) => d.file)
        .map(([name, lines]) => {
            return { name, lines };
        })
        .sort((a, b) => b.lines.length - a.lines.length);

    const filesContainer = d3
        .select('#files')
        .selectAll('div')
        .data(files, (d) => d.name)
        .join(
            // This code only runs when the div is initially rendered.
            (enter) =>
                enter.append('div').call((div) => {
                    div.append('dt').call((dt) => {
                        dt.append('code');
                        dt.append('small');
                    });
                    div.append('dd');
                }),
        );

    filesContainer.select('dt > code').text((d) => d.name);
    filesContainer.select('dt > small').text((d) => `${d.lines.length} lines`);

    filesContainer
        .select('dd')
        .selectAll('div')
        .data((d) => d.lines)
        .join('div')
        .attr('class', 'loc')
        .attr('style', (d) => `--color: ${colors(d.type)}`);
}

// Fill in the tooltip fields with the data of one commit.
function renderTooltipContent(commit) {
    const link = document.getElementById('commit-link');
    const date = document.getElementById('commit-date');
    const time = document.getElementById('commit-hour');
    const author = document.getElementById('commit-author');
    const lines = document.getElementById('commit-lines');

    if (Object.keys(commit).length === 0) return;

    link.href = commit.url;
    link.textContent = commit.id;
    date.textContent = commit.datetime?.toLocaleString('en', { dateStyle: 'full' });
    time.textContent = commit.datetime?.toLocaleString('en', { timeStyle: 'short' });
    author.textContent = commit.author;
    lines.textContent = commit.totalLines;
}

function updateTooltipVisibility(isVisible) {
    const tooltip = document.getElementById('commit-tooltip');
    tooltip.hidden = !isVisible;
}

// Place the tooltip at the cursor, and flip it to the cursor's left or top
// side when it would otherwise go past the right or bottom edge of the window.
function updateTooltipPosition(event) {
    const tooltip = document.getElementById('commit-tooltip');
    const { width, height } = tooltip.getBoundingClientRect();
    const x = event.clientX + width > window.innerWidth ? event.clientX - width : event.clientX;
    const y = event.clientY + height > window.innerHeight ? event.clientY - height : event.clientY;
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
}

// Add a 2D brush to the chart. The brush overlay is moved below the dots, so
// the dots still receive the mouse events for the tooltip.
function createBrushSelector(svg, commits) {
    svg.call(d3.brush().on('start brush end', (event) => brushed(event, commits)));
    svg.selectAll('.dots, .overlay ~ *').raise();
}

// Highlight the commits inside the brush and update the count and the
// language breakdown below the chart.
function brushed(event, commits) {
    const selection = event.selection;
    d3.selectAll('circle').classed('selected', (d) => isCommitSelected(selection, d));
    renderSelectionCount(selection, commits);
    renderLanguageBreakdown(selection, commits);
}

// A commit is selected when its dot center is inside the brush rectangle.
function isCommitSelected(selection, commit) {
    if (!selection) {
        return false;
    }
    const [x0, x1] = selection.map((d) => d[0]);
    const [y0, y1] = selection.map((d) => d[1]);
    const x = xScale(commit.datetime);
    const y = yScale(commit.hourFrac);
    return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

function renderSelectionCount(selection, commits) {
    const selectedCommits = selection
        ? commits.filter((d) => isCommitSelected(selection, d))
        : [];

    const countElement = document.querySelector('#selection-count');
    countElement.textContent = `${selectedCommits.length || 'No'} commits selected`;

    return selectedCommits;
}

// Show the lines and the share of lines per language (file type) in the
// selected commits.
function renderLanguageBreakdown(selection, commits) {
    const selectedCommits = selection
        ? commits.filter((d) => isCommitSelected(selection, d))
        : [];
    const container = document.getElementById('language-breakdown');

    if (selectedCommits.length === 0) {
        container.innerHTML = '';
        return;
    }
    const lines = selectedCommits.flatMap((d) => d.lines);

    const breakdown = d3.rollup(
        lines,
        (v) => v.length,
        (d) => d.type,
    );

    container.innerHTML = '';

    for (const [language, count] of breakdown) {
        const proportion = count / lines.length;
        const formatted = d3.format('.1~%')(proportion);

        container.innerHTML += `
            <dt>${language}</dt>
            <dd>${count} lines (${formatted})</dd>
        `;
    }
}

let data = await loadData();
let commits = processCommits(data);

// Colors for the technologies (file types) in the unit visualization.
let colors = d3.scaleOrdinal(d3.schemeTableau10);

// The slider value is a percentage of the time between the first and the last
// commit, and commitMaxTime is the date that this percentage maps to.
let commitProgress = 100;
let timeScale = d3
    .scaleTime()
    .domain([d3.min(commits, (d) => d.datetime), d3.max(commits, (d) => d.datetime)])
    .range([0, 100]);
let commitMaxTime = timeScale.invert(commitProgress);

// Will get updated as user changes slider
let filteredCommits = commits;

const slider = document.getElementById('commit-progress');
const selectedTime = document.getElementById('commit-time');

// Show only the commits up to commitMaxTime in the time label, the stats, the
// scatterplot and the file unit visualization.
function updateView() {
    selectedTime.textContent = commitMaxTime.toLocaleString('en', {
        dateStyle: 'long',
        timeStyle: 'short',
    });
    filteredCommits = commits.filter((d) => d.datetime <= commitMaxTime);
    renderCommitInfo(filteredCommits.flatMap((d) => d.lines), filteredCommits);
    updateScatterPlot(data, filteredCommits);
    updateFileDisplay(filteredCommits);
}

function onTimeSliderChange() {
    commitProgress = Number(slider.value);
    commitMaxTime = timeScale.invert(commitProgress);
    updateView();
}

renderScatterPlot(data, commits);
slider.addEventListener('input', onTimeSliderChange);
onTimeSliderChange();

// Scrollytelling: one story step per commit, next to the sticky scatterplot.
d3.select('#scatter-story')
    .selectAll('.step')
    .data(commits)
    .join('div')
    .attr('class', 'step')
    .html(
        (d, i) => `
        On ${d.datetime.toLocaleString('en', {
            dateStyle: 'full',
            timeStyle: 'short',
        })},
        I made <a href="${d.url}" target="_blank">${
            i > 0 ? 'another glorious commit' : 'my first commit, and it was glorious'
        }</a>.
        I edited ${d.totalLines} lines across ${
            d3.rollups(
                d.lines,
                (D) => D.length,
                (d) => d.file,
            ).length
        } files.
        Then I looked over all I had made, and I saw that it was very good.
    `,
    );

// When a story step crosses the middle of the screen, show the commits up to
// the commit of that step, and move the slider to match.
function onStepEnter(response) {
    commitMaxTime = response.element.__data__.datetime;
    commitProgress = timeScale(commitMaxTime);
    slider.value = commitProgress;
    updateView();
}

const scroller = scrollama();
scroller
    .setup({
        container: '#scrolly-1',
        step: '#scrolly-1 .step',
    })
    .onStepEnter(onStepEnter);

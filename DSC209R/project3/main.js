// Interactive chart for DSC 209R Project 3: climate-related disasters per year by type for one place (the World
// or a country), the temperature change of that place, and a ranking of countries for the selected years and types.
// The three views share one state object: picking a country, toggling a disaster type, or brushing a year range
// redraws every view.

import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

// Categorical colors in fixed order. Each disaster type keeps its color when other types are hidden.
const TYPE_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'];
const WARM = '#e34948';
const COOL = '#2a78d6';
const SURFACE = '#ffffff';
const RANKING_SIZE = 12;

const data = await d3.json('data/climate_disasters.json');
const years = data.years;
const placeByIso = new Map(data.places.map((place) => [place.iso3, place]));
const color = d3.scaleOrdinal(data.types, TYPE_COLORS);

const state = {
    place: 'WLD',
    activeTypes: new Set(data.types),
    yearRange: [years[0], years.at(-1)],
    // 'total' ranks countries by disasters in the selected years; 'change' ranks them by the rise in disasters per
    // year from the first half of the selected years to the second half.
    measure: 'total',
};

const areaSvg = d3.select('#chart-area');
const temperatureSvg = d3.select('#chart-temperature');
const rankingSvg = d3.select('#chart-ranking');
const tooltip = d3.select('#tooltip');
const placeInput = document.querySelector('#place-input');

// Shared horizontal layout of the two time charts, so their years line up vertically.
const margin = { top: 12, right: 16, bottom: 28, left: 48 };
let x = d3.scaleLinear();

// Return the visible disaster types in the fixed order of data.types.
function activeTypes() {
    return data.types.filter((type) => state.activeTypes.has(type));
}

// Return the selected place's yearly counts as rows like { year, Flood, Storm, ..., total }.
function placeRows(place) {
    return years.map((year, i) => {
        let row = { year, total: 0 };
        for (let type of activeTypes()) {
            row[type] = place.counts[type][i];
            row.total += row[type];
        }
        return row;
    });
}

/** Fill the place search box's suggestion list and select a place when the visitor picks a name. */
function setUpPlacePicker() {
    let datalist = d3.select('#place-names');
    datalist.selectAll('option')
        .data(data.places)
        .join('option')
        .attr('value', (place) => place.name);

    let isoByName = new Map(data.places.map((place) => [place.name.toLowerCase(), place.iso3]));
    placeInput.value = 'World';
    placeInput.addEventListener('change', () => {
        let iso3 = isoByName.get(placeInput.value.trim().toLowerCase());
        if (iso3) {
            selectPlace(iso3);
        }
    });
    d3.select('#reset-place').on('click', () => selectPlace('WLD'));
    d3.select('#ranking-measure').on('change', (event) => {
        state.measure = event.target.value;
        renderRanking();
    });
}

/** Draw one toggle button per disaster type. A hidden type is removed from every view. */
function setUpTypeToggles() {
    d3.select('#type-toggles')
        .selectAll('button')
        .data(data.types)
        .join('button')
        .attr('type', 'button')
        .attr('aria-pressed', 'true')
        .style('--color', (type) => color(type))
        .html((type) => `<span class="swatch"></span><span class="type-name"></span>`)
        .call((buttons) => buttons.select('.type-name').text((type) => type))
        .on('click', function (event, type) {
            // Keep at least one type visible so the charts never go empty.
            if (state.activeTypes.has(type) && state.activeTypes.size === 1) {
                return;
            }
            state.activeTypes.has(type) ? state.activeTypes.delete(type) : state.activeTypes.add(type);
            d3.select(this).attr('aria-pressed', state.activeTypes.has(type));
            render();
        });
}

function selectPlace(iso3) {
    state.place = iso3;
    placeInput.value = placeByIso.get(iso3).name;
    render();
}

/**
 * Draw the stacked area chart of disasters per year for the selected place and types. Dragging across the chart
 * selects a year range for the ranking; a click without dragging resets it to all years.
 */
function renderArea(width) {
    let height = 300;
    let place = placeByIso.get(state.place);
    let rows = placeRows(place);
    let series = d3.stack().keys(activeTypes())(rows);

    x = d3.scaleLinear([years[0], years.at(-1)], [margin.left, width - margin.right]);
    let y = d3.scaleLinear([0, d3.max(rows, (row) => row.total) || 1], [height - margin.bottom, margin.top]).nice();

    areaSvg.attr('viewBox', [0, 0, width, height]).attr('width', width).attr('height', height);

    areaSvg.selectAll('.grid').data([null]).join('g').attr('class', 'grid')
        .attr('transform', `translate(${margin.left},0)`)
        .call(d3.axisLeft(y).ticks(5).tickSize(-(width - margin.left - margin.right)))
        .call((g) => g.select('.domain').remove());

    areaSvg.selectAll('.layers').data([null]).join('g').attr('class', 'layers')
        .selectAll('path')
        .data(series, (layer) => layer.key)
        .join('path')
        .attr('fill', (layer) => color(layer.key))
        .attr('stroke', SURFACE)
        .attr('stroke-width', 1)
        .attr('d', d3.area().x((d) => x(d.data.year)).y0((d) => y(d[0])).y1((d) => y(d[1])));

    areaSvg.selectAll('.x-axis').data([null]).join('g').attr('class', 'x-axis')
        .attr('transform', `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(x).ticks(Math.min(9, width / 70)).tickFormat(d3.format('d')));

    let brush = d3.brushX()
        .extent([[margin.left, margin.top], [width - margin.right, height - margin.bottom]])
        .on('end', (event) => {
            if (!event.sourceEvent) {
                return;
            }
            if (event.selection) {
                let [start, end] = event.selection.map((px) => Math.round(x.invert(px)));
                state.yearRange = [start, Math.max(start, end)];
            } else {
                state.yearRange = [years[0], years.at(-1)];
            }
            renderRanking();
            renderSummary();
        });
    let brushGroup = areaSvg.selectAll('.brush').data([null]).join('g').attr('class', 'brush').call(brush);
    let [start, end] = state.yearRange;
    let fullRange = start === years[0] && end === years.at(-1);
    brushGroup.call(brush.move, fullRange ? null : [x(start), x(end)]);

    areaSvg.selectAll('.hover-rule').data([null]).join('line').attr('class', 'hover-rule')
        .attr('y1', margin.top).attr('y2', height - margin.bottom);
}

/** Draw one bar per year for the selected place's temperature change: red above the baseline, blue below it. */
function renderTemperature(width) {
    let height = 130;
    let place = placeByIso.get(state.place);
    let values = years.map((year, i) => ({ year, value: place.temperature[i] }));
    let known = values.filter((d) => d.value !== null);
    let extent = d3.extent(known, (d) => d.value);
    let y = d3.scaleLinear([Math.min(0, extent[0] ?? 0), Math.max(0, extent[1] ?? 1)],
        [height - margin.bottom, margin.top]).nice();
    let barWidth = Math.max(1, (x(years[1]) - x(years[0])) - 2);

    temperatureSvg.attr('viewBox', [0, 0, width, height]).attr('width', width).attr('height', height);

    temperatureSvg.selectAll('.grid').data([null]).join('g').attr('class', 'grid')
        .attr('transform', `translate(${margin.left},0)`)
        .call(d3.axisLeft(y).ticks(4).tickFormat((d) => `${d > 0 ? '+' : ''}${d}°C`)
            .tickSize(-(width - margin.left - margin.right)))
        .call((g) => g.select('.domain').remove());

    temperatureSvg.selectAll('.bars').data([null]).join('g').attr('class', 'bars')
        .selectAll('rect')
        .data(known, (d) => d.year)
        .join('rect')
        .attr('x', (d) => x(d.year) - barWidth / 2)
        .attr('width', barWidth)
        .attr('y', (d) => y(Math.max(0, d.value)))
        .attr('height', (d) => Math.abs(y(d.value) - y(0)))
        .attr('fill', (d) => (d.value >= 0 ? WARM : COOL));

    temperatureSvg.selectAll('.baseline').data([null]).join('line').attr('class', 'baseline')
        .attr('x1', margin.left).attr('x2', width - margin.right).attr('y1', y(0)).attr('y2', y(0));

    temperatureSvg.selectAll('.no-data').data(known.length ? [] : [null]).join('text').attr('class', 'no-data')
        .attr('x', width / 2).attr('y', height / 2).attr('text-anchor', 'middle')
        .text('No temperature data for this place');

    temperatureSvg.selectAll('.x-axis').data([null]).join('g').attr('class', 'x-axis')
        .attr('transform', `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(x).ticks(Math.min(9, width / 70)).tickFormat(d3.format('d')));

    temperatureSvg.selectAll('.hover-rule').data([null]).join('line').attr('class', 'hover-rule')
        .attr('y1', margin.top).attr('y2', height - margin.bottom);
}

// Split the selected years into a first half and a second half of equal length (the middle year of an odd range
// is left out), so the 'change' measure compares two periods of the same length.
function rangeHalves() {
    let [start, end] = state.yearRange;
    let half = Math.floor((end - start + 1) / 2);
    return [[start, start + half - 1], [end - half + 1, end]];
}

// Return a place's disasters in the visible types, summed over the years from start to end.
function sumYears(place, start, end) {
    let first = years.indexOf(start);
    let last = years.indexOf(end);
    return d3.sum(activeTypes(), (type) => d3.sum(place.counts[type].slice(first, last + 1)));
}

/**
 * Draw the top countries for the selected years and types, ranked by total disasters or by the rise in disasters
 * per year. Clicking a bar (or pressing Enter on it) shows that country in the time charts.
 */
function renderRanking() {
    let width = rankingSvg.node().parentElement.clientWidth;
    let barHeight = 22;
    let rankingMargin = { top: 4, right: 64, bottom: 4, left: 110 };
    let [start, end] = state.yearRange;
    let [[a0, a1], [b0, b1]] = rangeHalves();
    let halfLength = a1 - a0 + 1;
    // A change needs at least two years; with one selected year the ranking falls back to totals.
    let measure = state.measure === 'change' && halfLength > 0 ? 'change' : 'total';

    let totals = data.places
        .filter((place) => place.iso3 !== 'WLD')
        .map((place) => {
            let before = sumYears(place, a0, a1) / halfLength;
            let after = sumYears(place, b0, b1) / halfLength;
            let total = sumYears(place, start, end);
            return {
                iso3: place.iso3,
                name: place.name,
                total,
                before,
                after,
                value: measure === 'change' ? after - before : total,
            };
        })
        .sort((a, b) => b.value - a.value)
        .slice(0, RANKING_SIZE);

    let span = (s, e) => (s === e ? `${s}` : `${s}–${e}`);
    let format = measure === 'change' ? (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}/yr` : (v) => `${v}`;

    let height = rankingMargin.top + rankingMargin.bottom + totals.length * barHeight;
    let xRank = d3.scaleLinear([0, d3.max(totals, (d) => d.value) || 1],
        [rankingMargin.left, width - rankingMargin.right]);

    rankingSvg.attr('viewBox', [0, 0, width, height]).attr('width', width).attr('height', height);
    d3.select('#ranking-title').text(measure === 'change'
        ? 'Countries where disasters rose the most'
        : `Countries with the most disasters, ${span(start, end)}`);
    d3.select('#ranking-subtitle').text(measure === 'change'
        ? `Average disasters per year in ${span(b0, b1)} minus ${span(a0, a1)}, visible types only.`
        : 'Total recorded disasters in the selected years, visible types only.');

    let rows = rankingSvg.selectAll('g.rank')
        .data(totals, (d) => d.iso3)
        .join((enter) => {
            let g = enter.append('g').attr('class', 'rank').attr('tabindex', 0).attr('role', 'button');
            g.append('rect').attr('class', 'hit');
            g.append('rect').attr('class', 'bar');
            g.append('text').attr('class', 'name');
            g.append('text').attr('class', 'value');
            g.append('title');
            return g;
        })
        .attr('transform', (d, i) => `translate(0,${rankingMargin.top + i * barHeight})`)
        .classed('selected', (d) => d.iso3 === state.place)
        .attr('aria-label', (d) => `${d.name}: ${format(d.value)}`)
        .on('click', (event, d) => selectPlace(d.iso3))
        .on('keydown', (event, d) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                selectPlace(d.iso3);
            }
        });

    // Details on demand: the hover title gives the total and both period averages, whatever the measure.
    rows.select('title').text((d) => `${d.name}: ${d.total} disasters in ${span(start, end)}\n`
        + `${d.before.toFixed(1)}/yr in ${span(a0, a1)} → ${d.after.toFixed(1)}/yr in ${span(b0, b1)}`);
    rows.select('.hit').attr('x', 0).attr('width', width).attr('height', barHeight);
    rows.select('.bar')
        .attr('x', rankingMargin.left)
        .attr('y', 3)
        .attr('height', barHeight - 6)
        .attr('rx', 2)
        .attr('width', (d) => Math.max(1, xRank(Math.max(0, d.value)) - rankingMargin.left));
    rows.select('.name')
        .attr('x', rankingMargin.left - 8)
        .attr('y', barHeight / 2)
        .attr('dy', '0.35em')
        .attr('text-anchor', 'end')
        .text((d) => d.name);
    rows.select('.value')
        .attr('x', (d) => xRank(Math.max(0, d.value)) + 6)
        .attr('y', barHeight / 2)
        .attr('dy', '0.35em')
        .text((d) => format(d.value));
}

/** Write the one-line summary above the charts, for example "World: 104 disasters in 1980, 347 in 2022." */
function renderSummary() {
    let place = placeByIso.get(state.place);
    let rows = placeRows(place);
    let [start, end] = state.yearRange;
    let first = rows.find((row) => row.year === start);
    let last = rows.find((row) => row.year === end);
    d3.select('#summary').text(start === end
        ? `${place.name}: ${first.total} disasters in ${start}.`
        : `${place.name}: ${first.total} disasters in ${start}, ${last.total} in ${end}.`);
}

/** Show the year under the pointer in both time charts: a vertical rule in each chart and one tooltip. */
function setUpHover() {
    for (let svg of [areaSvg, temperatureSvg]) {
        svg.on('pointermove', (event) => {
            let [px] = d3.pointer(event, svg.node());
            let year = Math.max(years[0], Math.min(years.at(-1), Math.round(x.invert(px))));
            showYear(year, event);
        }).on('pointerleave', hideYear);
    }
}

function showYear(year, event) {
    let place = placeByIso.get(state.place);
    let i = years.indexOf(year);
    let temperature = place.temperature[i];
    d3.selectAll('.hover-rule').attr('x1', x(year)).attr('x2', x(year)).style('visibility', 'visible');

    tooltip.selectAll('*').remove();
    tooltip.append('div').attr('class', 'tooltip-title').text(`${place.name}, ${year}`);
    let total = d3.sum(activeTypes(), (type) => place.counts[type][i]);
    tooltip.append('div').attr('class', 'tooltip-total').text(`${total} disasters`);
    // List types from the top of the stack down, so the tooltip order matches the chart.
    for (let type of activeTypes().reverse()) {
        let row = tooltip.append('div').attr('class', 'tooltip-row');
        row.append('span').attr('class', 'key').style('background', color(type));
        row.append('strong').text(place.counts[type][i]);
        row.append('span').text(type);
    }
    tooltip.append('div').attr('class', 'tooltip-temperature').text(temperature === null
        ? 'No temperature data'
        : `Temperature ${temperature > 0 ? '+' : ''}${temperature.toFixed(2)}°C vs 1951–1980`);

    let box = tooltip.node().getBoundingClientRect();
    let left = event.clientX + 16 + box.width > window.innerWidth ? event.clientX - 16 - box.width : event.clientX + 16;
    tooltip.style('left', `${left + window.scrollX}px`).style('top', `${event.clientY + window.scrollY + 12}px`)
        .style('visibility', 'visible');
}

function hideYear() {
    d3.selectAll('.hover-rule').style('visibility', 'hidden');
    tooltip.style('visibility', 'hidden');
}

function render() {
    let width = areaSvg.node().parentElement.clientWidth;
    // A hidden page has no width yet; the ResizeObserver below draws the charts once it has one.
    if (width === 0) {
        return;
    }
    renderArea(width);
    renderTemperature(width);
    renderRanking();
    renderSummary();
    d3.select('#place-name').text(placeByIso.get(state.place).name);
}

setUpPlacePicker();
setUpTypeToggles();
setUpHover();
render();

// Redraw only when the chart column changes width; redrawing changes the height, which must not retrigger it.
let lastWidth = areaSvg.node().parentElement.clientWidth;
new ResizeObserver(() => {
    let width = areaSvg.node().parentElement.clientWidth;
    if (width !== lastWidth) {
        lastWidth = width;
        render();
    }
}).observe(document.querySelector('.viz-grid'));

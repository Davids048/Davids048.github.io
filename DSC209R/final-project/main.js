// Prototype charts for "Warmer World, More Disasters?" (DSC 209R Final Project).
// One JSON file feeds six views: a draw-your-guess hook, world warming bars, disasters stacked by type,
// reporting coverage, a year-brushed temperature–disaster scatter, and a country ranking linked to a country chart.
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

const W = 860;
const COLORS = {
  Flood: '#3b75af', Storm: '#7eb0d5', Landslide: '#8c6d31',
  Drought: '#e0b040', 'Extreme temperature': '#d6604d', Wildfire: '#a50f15',
};
const WARM = '#c0392b';
const COOL = '#2e6da4';
const tooltip = d3.select('#tooltip');

const data = await d3.json('data/climate.json');
const { years, types, world } = data;
const totals = years.map((_, i) => d3.sum(types, (t) => world.counts[t][i]));

function showTip(event, html) {
  tooltip.attr('hidden', null).html(html)
    .style('left', `${event.clientX + 12}px`).style('top', `${event.clientY + 12}px`);
}
const hideTip = () => tooltip.attr('hidden', true);

/** Create an SVG with a fixed viewBox and return the inner group plus its drawing width and height. */
function frame(selector, height, margin = { top: 16, right: 20, bottom: 32, left: 48 }, width = W) {
  const svg = d3.select(selector).append('svg').attr('viewBox', `0 0 ${width} ${height}`);
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
  return { svg, g, w: width - margin.left - margin.right, h: height - margin.top - margin.bottom };
}

/** Draw x and y axes with horizontal grid lines; return the y-axis group so it can be updated. */
function axes(g, x, y, w, h, xFormat = d3.format('d')) {
  g.append('g').attr('class', 'grid').call(d3.axisLeft(y).ticks(5).tickSize(-w).tickFormat(''));
  g.append('g').attr('class', 'axis').attr('transform', `translate(0,${h})`)
    .call(d3.axisBottom(x).ticks(8).tickFormat(xFormat));
  return g.append('g').attr('class', 'axis').call(d3.axisLeft(y).ticks(5));
}

function yLabel(g, h, text) {
  g.append('text').attr('class', 'axis').attr('transform', 'rotate(-90)')
    .attr('x', -h / 2).attr('y', -38).attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', '#666')
    .text(text);
}

// ---- 1. Draw-your-guess hook: the reader drags to set a value per year, then the real line is revealed.
function guessChart() {
  const { svg, g, w, h } = frame('#guess-chart', 300);
  const x = d3.scaleLinear([years[0], years.at(-1)], [0, w]);
  const y = d3.scaleLinear([0, 500], [h, 0]);
  axes(g, x, y, w, h);
  yLabel(g, h, 'Disasters per year');
  const guess = years.map((_, i) => (i === 0 ? totals[0] : null));
  const line = d3.line().defined((d) => d !== null).x((_, i) => x(years[i])).y((d) => y(d));
  const guessPath = g.append('path').attr('fill', 'none').attr('stroke', '#888').attr('stroke-width', 2.5)
    .attr('stroke-dasharray', '6 4');
  const actualPath = g.append('path').attr('fill', 'none').attr('stroke', WARM).attr('stroke-width', 2.5);
  const hint = g.append('text').attr('x', w / 2).attr('y', h / 2).attr('text-anchor', 'middle')
    .attr('fill', '#999').text('Drag from left to right to draw your guess');
  const overlay = g.append('rect').attr('width', w).attr('height', h).attr('fill', 'transparent');
  let last = 0;
  let revealed = false;

  // Set the guess at the pointer's year and fill the gap since the last drawn year by linear interpolation.
  function drawAt(event) {
    if (revealed) return;
    const [mx, my] = d3.pointer(event, overlay.node());
    const i = Math.max(1, Math.min(years.length - 1, Math.round(x.invert(mx) - years[0])));
    const v = Math.max(0, Math.min(500, y.invert(my)));
    const from = guess[i - 1] !== null && i - 1 > last ? i - 1 : last;
    for (let k = from + 1; k <= i; k++) guess[k] = guess[from] + ((v - guess[from]) * (k - from)) / (i - from);
    guess[i] = v;
    last = Math.max(last, i);
    hint.remove();
    guessPath.attr('d', line(guess));
    d3.select('#reveal').property('disabled', years[last] < 2015);
  }
  overlay.on('pointerdown', (e) => { overlay.node().setPointerCapture(e.pointerId); drawAt(e); })
    .on('pointermove', (e) => { if (e.buttons) drawAt(e); });

  d3.select('#reveal').on('click', () => {
    revealed = true;
    for (let k = last + 1; k < years.length; k++) guess[k] = guess[last]; // Extend a short guess flat to 2022.
    guessPath.attr('d', line(guess));
    actualPath.attr('d', line(totals));
    const len = actualPath.node().getTotalLength();
    actualPath.attr('stroke-dasharray', `${len} ${len}`).attr('stroke-dashoffset', len)
      .transition().duration(1500).attr('stroke-dashoffset', 0);
    const err = d3.mean(totals, (v, i) => Math.abs(v - guess[i]));
    d3.select('#guess-result').text(`You guessed ${Math.round(guess.at(-1))} for 2022; the record shows `
      + `${totals.at(-1)}. Your guess was off by ${Math.round(err)} disasters per year on average.`);
  });
  d3.select('#reset-guess').on('click', () => {
    guess.fill(null, 1);
    last = 0;
    revealed = false;
    guessPath.attr('d', null);
    actualPath.interrupt().attr('d', null);
    d3.select('#reveal').property('disabled', true);
    d3.select('#guess-result').text('');
  });
}

// ---- 2. World temperature change bars with tooltips.
function tempChart() {
  const { g, w, h } = frame('#temp-chart', 260);
  const x = d3.scaleBand(years, [0, w]).padding(0.15);
  const y = d3.scaleLinear([Math.min(0, d3.min(world.temp)), d3.max(world.temp) * 1.1], [h, 0]).nice();
  g.append('g').attr('class', 'grid').call(d3.axisLeft(y).ticks(5).tickSize(-w).tickFormat(''));
  g.append('g').attr('class', 'axis').attr('transform', `translate(0,${y(0)})`)
    .call(d3.axisBottom(x).tickValues(years.filter((yr) => yr % 5 === 0)));
  g.append('g').attr('class', 'axis').call(d3.axisLeft(y).ticks(5).tickFormat((d) => `${d} °C`));
  g.selectAll('rect').data(years).join('rect')
    .attr('x', (yr) => x(yr)).attr('width', x.bandwidth())
    .attr('y', (_, i) => y(Math.max(0, world.temp[i]))).attr('height', (_, i) => Math.abs(y(world.temp[i]) - y(0)))
    .attr('fill', (_, i) => (world.temp[i] >= 0 ? WARM : COOL))
    .on('mousemove', (e, yr) => showTip(e, `<b>${yr}</b><br>${world.temp[yr - years[0]].toFixed(2)} °C vs. 1951–1980`))
    .on('mouseleave', hideTip);
}

// ---- 3. Stacked area of disasters by type; legend items toggle types, hover shows one year.
function typeChart() {
  const active = new Set(types);
  const { g, w, h } = frame('#type-chart', 320);
  const x = d3.scaleLinear([years[0], years.at(-1)], [0, w]);
  const y = d3.scaleLinear([0, 450], [h, 0]);
  const yAxis = axes(g, x, y, w, h);
  yLabel(g, h, 'Disasters per year');
  const layer = g.append('g');
  const rule = g.append('line').attr('y1', 0).attr('y2', h).attr('stroke', '#333').attr('opacity', 0);
  const rows = years.map((yr, i) => Object.fromEntries([['year', yr], ...types.map((t) => [t, world.counts[t][i]])]));
  const area = d3.area().x((d) => x(d.data.year)).y0((d) => y(d[0])).y1((d) => y(d[1]));

  function update() {
    const keys = types.filter((t) => active.has(t));
    const series = d3.stack().keys(keys)(rows);
    y.domain([0, d3.max(rows, (r) => d3.sum(keys, (k) => r[k])) || 1]).nice();
    yAxis.transition().duration(500).call(d3.axisLeft(y).ticks(5));
    layer.selectAll('path').data(series, (s) => s.key).join('path')
      .attr('fill', (s) => COLORS[s.key]).transition().duration(500).attr('d', area);
    d3.select('#type-legend').selectAll('.legend-item').data(types).join('span')
      .attr('class', (t) => `legend-item${active.has(t) ? '' : ' off'}`)
      .html((t) => `<span class="swatch" style="background:${COLORS[t]}"></span>${t}`)
      .on('click', (_, t) => {
        if (active.has(t) && active.size > 1) active.delete(t); else active.add(t);
        update();
      });
  }
  g.append('rect').attr('width', w).attr('height', h).attr('fill', 'transparent')
    .on('mousemove', (e) => {
      const yr = Math.round(x.invert(d3.pointer(e)[0]));
      const row = rows[yr - years[0]];
      if (!row) return;
      const keys = types.filter((t) => active.has(t));
      rule.attr('x1', x(yr)).attr('x2', x(yr)).attr('opacity', 0.5);
      showTip(e, `<b>${yr}</b>: ${d3.sum(keys, (k) => row[k])} shown<br>`
        + keys.slice().reverse().map((k) => `${k}: ${row[k]}`).join('<br>'));
    })
    .on('mouseleave', () => { rule.attr('opacity', 0); hideTip(); });
  update();
}

// ---- 4. Reporting coverage: one line chart that switches between three series.
function reportingChart() {
  const series = {
    total: { values: totals, label: 'Disasters per year' },
    countries: { values: world.reporting, label: 'Countries with ≥ 1 disaster' },
    per: { values: totals.map((v, i) => v / world.reporting[i]), label: 'Disasters per reporting country' },
  };
  const { g, w, h } = frame('#rep-chart', 260);
  const x = d3.scaleLinear([years[0], years.at(-1)], [0, w]);
  const y = d3.scaleLinear([0, 1], [h, 0]);
  const yAxis = axes(g, x, y, w, h);
  const label = g.append('text').attr('x', 4).attr('y', -4).attr('font-size', 12).attr('fill', '#444');
  const path = g.append('path').attr('fill', 'none').attr('stroke', WARM).attr('stroke-width', 2.5);
  const dots = g.append('g');

  function update(key) {
    const { values, label: text } = series[key];
    y.domain([0, d3.max(values) * 1.1]).nice();
    yAxis.transition().duration(600).call(d3.axisLeft(y).ticks(5));
    label.text(text);
    path.transition().duration(600).attr('d', d3.line().x((_, i) => x(years[i])).y((v) => y(v))(values));
    dots.selectAll('circle').data(values.map((v, i) => ({ v, i }))).join('circle').attr('r', 3.5).attr('fill', WARM)
      .on('mousemove', (e, d) => showTip(e, `<b>${years[d.i]}</b>: ${d3.format('.3~f')(d.v)}`))
      .on('mouseleave', hideTip)
      .transition().duration(600).attr('cx', (d) => x(years[d.i])).attr('cy', (d) => y(d.v));
  }
  d3.selectAll('input[name=rep]').on('change', (e) => update(e.target.value));
  update('total');
}

// ---- 5. Scatter of world temperature vs. total disasters, filtered by a year brush on a timeline below it.
function scatterChart() {
  const pts = years.map((yr, i) => ({ yr, t: world.temp[i], n: totals[i] }));
  const { g, w, h } = frame('#scatter-chart', 340, { top: 16, right: 20, bottom: 42, left: 48 });
  const x = d3.scaleLinear(d3.extent(pts, (d) => d.t), [0, w]).nice();
  const y = d3.scaleLinear([0, d3.max(pts, (d) => d.n) * 1.1], [h, 0]).nice();
  axes(g, x, y, w, h, (d) => `${d} °C`);
  yLabel(g, h, 'Recorded disasters');
  g.append('text').attr('x', w / 2).attr('y', h + 36).attr('text-anchor', 'middle').attr('font-size', 11)
    .attr('fill', '#666').text('World temperature change vs. 1951–1980');
  const fit = g.append('line').attr('stroke', WARM).attr('stroke-width', 2);
  const dots = g.selectAll('circle').data(pts).join('circle')
    .attr('cx', (d) => x(d.t)).attr('cy', (d) => y(d.n)).attr('r', 5)
    .on('mousemove', (e, d) => showTip(e, `<b>${d.yr}</b><br>${d.t.toFixed(2)} °C<br>${d.n} disasters`))
    .on('mouseleave', hideTip);

  // Timeline strip with a horizontal brush over years.
  const strip = frame('#brush-chart', 70, { top: 6, right: 20, bottom: 24, left: 48 });
  const bx = d3.scaleLinear([years[0] - 0.5, years.at(-1) + 0.5], [0, strip.w]);
  strip.g.append('g').attr('class', 'axis').attr('transform', `translate(0,${strip.h})`)
    .call(d3.axisBottom(bx).ticks(10).tickFormat(d3.format('d')));
  strip.g.selectAll('rect.tick').data(pts).join('rect').attr('class', 'tick')
    .attr('x', (d) => bx(d.yr) - 3).attr('width', 6).attr('y', (d) => strip.h - (d.n / 400) * strip.h)
    .attr('height', (d) => (d.n / 400) * strip.h).attr('fill', '#bbb');

  function update(range) {
    const [a, b] = range ?? [years[0], years.at(-1)];
    const sel = pts.filter((d) => d.yr >= a && d.yr <= b);
    dots.attr('fill', (d) => (d.yr >= a && d.yr <= b ? WARM : '#ccc'))
      .attr('opacity', (d) => (d.yr >= a && d.yr <= b ? 0.9 : 0.6));
    if (sel.length < 3) {
      fit.attr('opacity', 0);
      d3.select('#scatter-stat').text(`${a}–${b}: select at least 3 years to compute a correlation.`);
      return;
    }
    const mt = d3.mean(sel, (d) => d.t);
    const mn = d3.mean(sel, (d) => d.n);
    const sxy = d3.sum(sel, (d) => (d.t - mt) * (d.n - mn));
    const sxx = d3.sum(sel, (d) => (d.t - mt) ** 2);
    const syy = d3.sum(sel, (d) => (d.n - mn) ** 2);
    const r = sxy / Math.sqrt(sxx * syy);
    const slope = sxy / sxx;
    const [t0, t1] = d3.extent(sel, (d) => d.t);
    fit.attr('opacity', 1).attr('x1', x(t0)).attr('x2', x(t1))
      .attr('y1', y(mn + slope * (t0 - mt))).attr('y2', y(mn + slope * (t1 - mt)));
    d3.select('#scatter-stat').text(`${a}–${b} (${sel.length} years): r = ${r.toFixed(2)}; `
      + `about ${Math.round(slope / 10)} more disasters per year for each extra 0.1 °C.`);
  }
  const brush = d3.brushX().extent([[0, 0], [strip.w, strip.h]])
    .on('brush end', ({ selection }) => update(selection
      && [Math.ceil(bx.invert(selection[0])), Math.floor(bx.invert(selection[1]))]));
  strip.g.append('g').call(brush);
  update(null);
}

// ---- 6. Country ranking (rise in yearly disasters) linked to a per-country chart of disasters and temperature.
function countryExplorer() {
  const state = { type: 'All types', iso: null };
  const countries = data.countries.filter((c) => c.temp);
  const split = years.indexOf(2000);
  const countsOf = (c) => years.map((_, i) => (state.type === 'All types'
    ? d3.sum(Object.values(c.counts), (arr) => arr[i]) : (c.counts[state.type]?.[i] ?? 0)));
  const shortName = (name) => name.split(',')[0];

  d3.select('#type-select').selectAll('option').data(['All types', ...types]).join('option').text((d) => d);
  d3.select('#country-select').selectAll('option')
    .data(countries.slice().sort((a, b) => d3.ascending(a.name, b.name))).join('option')
    .attr('value', (c) => c.iso).text((c) => c.name);

  const rank = frame('#rank-chart', 420, { top: 24, right: 30, bottom: 20, left: 110 }, 420);
  const cc = frame('#country-chart', 420, { top: 24, right: 44, bottom: 28, left: 36 }, 420);

  /** Redraw the top-15 ranking for the current type and the chart for the selected country. */
  function update() {
    const ranked = countries.map((c) => {
      const v = countsOf(c);
      return { c, rise: d3.mean(v.slice(split)) - d3.mean(v.slice(0, split)) };
    }).sort((a, b) => b.rise - a.rise).slice(0, 15);
    if (!state.iso) state.iso = ranked[0].c.iso;
    d3.select('#country-select').property('value', state.iso);

    const x = d3.scaleLinear([Math.min(0, d3.min(ranked, (d) => d.rise)), d3.max(ranked, (d) => d.rise)], [0, rank.w]).nice();
    const y = d3.scaleBand(ranked.map((d) => d.c.iso), [0, rank.h]).padding(0.2);
    rank.g.selectAll('*').remove();
    rank.g.append('text').attr('y', -8).attr('font-size', 12).attr('fill', '#444')
      .text('Rise in disasters per year, 2000–22 vs. 1980–99');
    rank.g.append('g').attr('class', 'axis').attr('transform', `translate(0,${rank.h})`).call(d3.axisBottom(x).ticks(4));
    rank.g.append('g').attr('class', 'axis')
      .call(d3.axisLeft(y).tickFormat((iso) => shortName(countries.find((c) => c.iso === iso).name).slice(0, 16)));
    rank.g.selectAll('rect.bar').data(ranked).join('rect')
      .attr('class', (d) => `bar${d.c.iso === state.iso ? ' selected' : ''}`)
      .attr('x', (d) => x(Math.min(0, d.rise))).attr('width', (d) => Math.abs(x(d.rise) - x(0)))
      .attr('y', (d) => y(d.c.iso)).attr('height', y.bandwidth())
      .attr('fill', state.type === 'All types' ? '#555' : COLORS[state.type])
      .on('click', (_, d) => { state.iso = d.c.iso; update(); })
      .on('mousemove', (e, d) => showTip(e, `<b>${d.c.name}</b><br>+${d.rise.toFixed(2)} per year`))
      .on('mouseleave', hideTip);

    // Country chart: bars are disaster counts (left axis), the line is temperature change (right axis).
    const c = countries.find((d) => d.iso === state.iso);
    const counts = countsOf(c);
    const cx = d3.scaleBand(years, [0, cc.w]).padding(0.15);
    const cy = d3.scaleLinear([0, Math.max(1, d3.max(counts))], [cc.h, 0]).nice();
    const ty = d3.scaleLinear(d3.extent([0, ...c.temp.filter((v) => v !== null)]), [cc.h, 0]).nice();
    cc.g.selectAll('*').remove();
    cc.g.append('text').attr('y', -8).attr('font-size', 12).attr('fill', '#444')
      .text(`${shortName(c.name)}: ${state.type.toLowerCase()} per year (bars), °C (line)`);
    cc.g.append('g').attr('class', 'axis').attr('transform', `translate(0,${cc.h})`)
      .call(d3.axisBottom(cx).tickValues(years.filter((yr) => yr % 10 === 0)));
    cc.g.append('g').attr('class', 'axis').call(d3.axisLeft(cy).ticks(5));
    cc.g.append('g').attr('class', 'axis').attr('transform', `translate(${cc.w},0)`)
      .call(d3.axisRight(ty).ticks(5).tickFormat((d) => `${d}°`));
    cc.g.selectAll('rect').data(counts.map((v, i) => ({ v, i }))).join('rect')
      .attr('x', (d) => cx(years[d.i])).attr('width', cx.bandwidth())
      .attr('y', (d) => cy(d.v)).attr('height', (d) => cc.h - cy(d.v))
      .attr('fill', state.type === 'All types' ? '#888' : COLORS[state.type])
      .on('mousemove', (e, d) => {
        const t = c.temp[d.i];
        showTip(e, `<b>${years[d.i]}</b><br>${d.v} disasters<br>${t === null ? 'no temperature data' : `${t.toFixed(2)} °C`}`);
      })
      .on('mouseleave', hideTip);
    cc.g.append('path').attr('fill', 'none').attr('stroke', WARM).attr('stroke-width', 2)
      .attr('d', d3.line().defined((v) => v !== null).x((_, i) => cx(years[i]) + cx.bandwidth() / 2).y((v) => ty(v))(c.temp));
  }
  d3.select('#type-select').on('change', (e) => { state.type = e.target.value; update(); });
  d3.select('#country-select').on('change', (e) => { state.iso = e.target.value; update(); });
  update();
}

guessChart();
tempChart();
typeChart();
reportingChart();
scatterChart();
countryExplorer();

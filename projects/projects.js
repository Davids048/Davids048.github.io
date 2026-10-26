// Projects page: render every project in lib/projects.json, show the number of
// projects in the page title, and draw a pie chart of projects per year. The
// search field and the pie wedges filter the project list.
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import { fetchJSON, renderProjects } from '../global.js';

const projects = await fetchJSON('../lib/projects.json');
const projectsContainer = document.querySelector('.projects');
renderProjects(projects, projectsContainer, 'h2');

const projectsTitle = document.querySelector('.projects-title');
projectsTitle.textContent = `${projects.length} Projects`;

// Index of the selected pie wedge, or -1 when no wedge is selected.
let selectedIndex = -1;

// Draw one pie wedge and one legend item per year in projectsGiven, sized by the
// number of projects in that year. The old wedges and legend items are removed
// first, so each call replaces the chart. Clicking a wedge selects its year and
// shows only the projects from that year; clicking it again shows all projects.
function renderPieChart(projectsGiven) {
    let rolledData = d3.rollups(
        projectsGiven,
        (v) => v.length,
        (d) => d.year,
    );
    let data = rolledData.map(([year, count]) => {
        return { value: count, label: year };
    });

    let arcGenerator = d3.arc().innerRadius(0).outerRadius(50);
    let sliceGenerator = d3.pie().value((d) => d.value);
    let arcData = sliceGenerator(data);
    let arcs = arcData.map((d) => arcGenerator(d));
    let colors = d3.scaleOrdinal(d3.schemeTableau10);

    let svg = d3.select('#projects-pie-plot');
    svg.selectAll('path').remove();
    let legend = d3.select('.legend');
    legend.selectAll('li').remove();

    arcs.forEach((arc, i) => {
        svg.append('path')
            .attr('d', arc)
            .attr('fill', colors(i))
            .on('click', () => {
                selectedIndex = selectedIndex === i ? -1 : i;

                svg.selectAll('path')
                    .attr('class', (_, idx) => (idx === selectedIndex ? 'selected' : null));
                legend.selectAll('li')
                    .attr('class', (_, idx) => (idx === selectedIndex ? 'legend-item selected' : 'legend-item'));

                if (selectedIndex === -1) {
                    renderProjects(projects, projectsContainer, 'h2');
                } else {
                    let selectedYear = data[selectedIndex].label;
                    let yearProjects = projects.filter((project) => project.year === selectedYear);
                    renderProjects(yearProjects, projectsContainer, 'h2');
                }
            });
    });

    data.forEach((d, idx) => {
        legend.append('li')
            .attr('style', `--color:${colors(idx)}`)
            .attr('class', 'legend-item')
            .html(`<span class="swatch"></span> ${d.label} <em>(${d.value})</em>`);
    });
}

renderPieChart(projects);

// Search text typed in the search field. An empty query matches every project.
let query = '';
let searchInput = document.querySelector('.searchBar');

// The input event fires on every keystroke, so the results update while typing.
searchInput.addEventListener('input', (event) => {
    query = event.target.value;
    let filteredProjects = projects.filter((project) => {
        let values = Object.values(project).join('\n').toLowerCase();
        return values.includes(query.toLowerCase());
    });
    renderProjects(filteredProjects, projectsContainer, 'h2');
    renderPieChart(filteredProjects);
});

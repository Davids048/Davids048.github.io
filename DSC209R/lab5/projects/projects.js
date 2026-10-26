// Projects page: render every project in lib/projects.json, show the number of
// projects in the page title, and draw a pie chart of projects per year. The
// search query and the selected pie wedge filter the project list together.
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import { fetchJSON, renderProjects } from '../global.js';

const projects = await fetchJSON('../lib/projects.json');
const projectsContainer = document.querySelector('.projects');
renderProjects(projects, projectsContainer, 'h2');

const projectsTitle = document.querySelector('.projects-title');
projectsTitle.textContent = `${projects.length} Projects`;

// Search text typed in the search field. An empty query matches every project.
let query = '';
// Year label of the selected pie wedge, or null when no wedge is selected. The
// selection is stored by year because a search can change the order of wedges.
let selectedYear = null;

// Return the projects whose values contain the search query, ignoring case.
function filterProjectsByQuery() {
    return projects.filter((project) => {
        let values = Object.values(project).join('\n').toLowerCase();
        return values.includes(query.toLowerCase());
    });
}

// Show the project cards that match both the search query and the selected year.
function renderVisibleProjects() {
    let visibleProjects = filterProjectsByQuery();
    if (selectedYear !== null) {
        visibleProjects = visibleProjects.filter((project) => project.year === selectedYear);
    }
    renderProjects(visibleProjects, projectsContainer, 'h2');
}

// Draw one pie wedge and one legend item per year in projectsGiven, sized by the
// number of projects in that year. The old wedges and legend items are removed
// first, so each call replaces the chart. Clicking a wedge selects its year, and
// clicking the selected wedge again clears the selection.
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

    // Add the selected class to the wedge and the legend item of selectedYear.
    let markSelectedYear = () => {
        svg.selectAll('path')
            .attr('class', (_, idx) => (data[idx].label === selectedYear ? 'selected' : null));
        legend.selectAll('li')
            .attr('class', (_, idx) => (data[idx].label === selectedYear ? 'legend-item selected' : 'legend-item'));
    };

    arcs.forEach((arc, i) => {
        svg.append('path')
            .attr('d', arc)
            .attr('fill', colors(i))
            .on('click', () => {
                selectedYear = selectedYear === data[i].label ? null : data[i].label;
                markSelectedYear();
                renderVisibleProjects();
            });
    });

    data.forEach((d, idx) => {
        legend.append('li')
            .attr('style', `--color:${colors(idx)}`)
            .attr('class', 'legend-item')
            .html(`<span class="swatch"></span> ${d.label} <em>(${d.value})</em>`);
    });

    markSelectedYear();
}

renderPieChart(projects);

let searchInput = document.querySelector('.searchBar');

// The input event fires on every keystroke, so the results update while typing.
// The pie chart shows the years of the projects that match the query, so every
// year that the search leaves can still be selected.
searchInput.addEventListener('input', (event) => {
    query = event.target.value;
    let queryProjects = filterProjectsByQuery();
    // A selected year with no project that matches the query has no wedge to
    // click, so the selection is cleared instead of hiding every project.
    if (!queryProjects.some((project) => project.year === selectedYear)) {
        selectedYear = null;
    }
    renderPieChart(queryProjects);
    renderVisibleProjects();
});

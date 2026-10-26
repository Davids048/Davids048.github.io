// Site-wide script loaded by every page. It builds the navigation menu and the
// color scheme switcher, so the HTML pages do not repeat that markup.

console.log('IT’S ALIVE!');

function $$(selector, context = document) {
    return Array.from(context.querySelectorAll(selector));
}

// Navigation menu entries. A relative URL is a path from the site root.
let pages = [
    { url: '', title: 'Home' },
    { url: 'projects/', title: 'Projects' },
    { url: 'contact/', title: 'Contact' },
    { url: 'cv/', title: 'CV' },
    { url: 'https://github.com/Davids048', title: 'GitHub' },
];

// A local server (for example, VS Code Live Server opened on this folder) serves
// this site from the server root. GitHub Pages serves it from the DSC209R/lab3/
// folder of the Davids048.github.io site, at https://davids048.github.io/DSC209R/lab3/.
const BASE_PATH =
    location.hostname === 'localhost' || location.hostname === '127.0.0.1'
        ? '/'
        : '/DSC209R/lab3/';

let nav = document.createElement('nav');
document.body.prepend(nav);

for (let page of pages) {
    let url = page.url.startsWith('http') ? page.url : BASE_PATH + page.url;

    let a = document.createElement('a');
    a.href = url;
    a.textContent = page.title;

    a.classList.toggle(
        'current',
        a.host === location.host && a.pathname === location.pathname,
    );

    // Links to other sites open in a new tab.
    if (a.host !== location.host) {
        a.target = '_blank';
    }

    nav.append(a);
}

// Color scheme switcher. Each option value is a valid CSS color-scheme value,
// so the selected value is applied to the root element without conversion.
document.body.insertAdjacentHTML(
    'afterbegin',
    `
    <label class="color-scheme">
        Theme:
        <select>
            <option value="light dark">Automatic</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
        </select>
    </label>`,
);

let colorSchemeSelect = document.querySelector('.color-scheme select');

function setColorScheme(colorScheme) {
    document.documentElement.style.setProperty('color-scheme', colorScheme);
    colorSchemeSelect.value = colorScheme;
}

// Restore the color scheme that the visitor chose on an earlier page load.
if ('colorScheme' in localStorage) {
    setColorScheme(localStorage.colorScheme);
}

colorSchemeSelect.addEventListener('input', function (event) {
    setColorScheme(event.target.value);
    localStorage.colorScheme = event.target.value;
});

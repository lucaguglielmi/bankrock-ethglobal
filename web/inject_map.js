const fs = require('fs');

const mapData = fs.readFileSync('map_output.txt', 'utf8');
const parts = mapData.split('--- CITIES ---');
const paths = parts[0].trim();
const cities = parts[1].trim();

const pagePath = 'src/app/page.tsx';
let page = fs.readFileSync(pagePath, 'utf8');

const svgCode = `{/* Map Silhouette & Cities */}
            <svg 
              viewBox="0 0 200 200" 
              className="w-[120%] h-[120%] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-neutral-50 z-10" 
              fill="currentColor"
            >
              ${paths}
              
              ${cities}
            </svg>`;

const regex = /\{\/\* Map Silhouette \*\/\}[\s\S]*?<\/svg>\s*\{\/\* Florence flashing dot \*\/\}[\s\S]*?<\/svg>/m;

page = page.replace(regex, svgCode);

fs.writeFileSync(pagePath, page);
console.log('Map injected!');

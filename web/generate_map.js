const fs = require('fs');
const https = require('https');
const d3 = require('d3-geo');
const turf = require('@turf/turf');

// Fetch Italy GeoJSON (country level is better for a single silhouette, but regions give inner lines if we want. Let's merge them or just use country if possible, but regions are fine if simplified)
const url = 'https://raw.githubusercontent.com/openpolis/geojson-italy/master/geojson/limits_IT_regions.geojson';

https.get(url, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    const geojson = JSON.parse(body);

    // Simplify geometry massively to get a cool minimal low-poly or smooth silhouette
    // 0.05 is quite high, it will make it very abstract but still shaped like Italy
    const simplified = turf.simplify(geojson, { tolerance: 0.05, highQuality: false });

    // We want a 200x200 SVG
    const width = 200;
    const height = 200;

    const projection = d3.geoAlbers()
      .center([0, 42])
      .rotate([-12.5, 0])
      .parallels([35, 47])
      .scale(1)
      .translate([width / 2, height / 2]);
      
    projection.fitSize([width - 20, height - 20], simplified);
    const t = projection.translate();
    projection.translate([t[0] + 10, t[1] + 10]);

    const pathGenerator = d3.geoPath().projection(projection);

    let svgPaths = '';
    simplified.features.forEach(feature => {
      svgPaths += `<path d="${pathGenerator(feature)}" />\n`;
    });

    const cities = {
      Florence: [11.2558, 43.7696],
      Rome: [12.4964, 41.9028],
      Milan: [9.1900, 45.4642],
      Venice: [12.3155, 45.4408],
      Naples: [14.2681, 40.8518]
    };

    let citySvg = '';
    for (const [name, coords] of Object.entries(cities)) {
      const [x, y] = projection(coords);
      if (name === 'Florence') {
        citySvg += `
          <g transform="translate(${x.toFixed(2)}, ${y.toFixed(2)})">
            <circle cx="0" cy="0" r="4" className="fill-blue-500 animate-ping opacity-75" />
            <circle cx="0" cy="0" r="1.5" className="fill-blue-600" />
            <text x="4" y="1.5" fontSize="3.5" className="fill-blue-600 font-bold tracking-wider uppercase font-mono shadow-sm">${name}</text>
          </g>
        `;
      } else {
        citySvg += `
          <g transform="translate(${x.toFixed(2)}, ${y.toFixed(2)})">
            <circle cx="0" cy="0" r="1" className="fill-neutral-300" />
            <text x="3" y="1.2" fontSize="3" className="fill-neutral-300 font-bold tracking-widest uppercase font-mono">${name}</text>
          </g>
        `;
      }
    }

    fs.writeFileSync('map_output.txt', svgPaths + '\n\n--- CITIES ---\n\n' + citySvg);
    console.log('Generated map_output.txt length: ', svgPaths.length);
  });
}).on('error', (e) => {
  console.error(e);
});

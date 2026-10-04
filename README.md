# Eurth interactive map

An interactive map of the world of Eurth, as a flat map and as a globe. Live at https://eurth-map.vercel.app.

- Hover a nation to highlight it, click or tap it for its statistics (capital, population, GDP, GDP per capita, land area) and a link to its iiwiki page.
- Overlays for climate, ocean currents and tectonic plates, and a grayscale version of the map. With Climate on, the Köppen zone under the pointer is named.
- Measure distances and areas on the sphere (great-circle distance, spherical area), not in pixels.
- "Suggest an edit" lets anyone propose a correction to a nation's statistics. Proposals are filed as issues on this repository and reviewed before anything changes.
- Works with a mouse and keyboard, and on phones and tablets.

## What is in this repository

| Folder or file | What it is |
|---|---|
| `eurth-map/` | The web app (React + Vite) and its one serverless function, `api/suggest.js` |
| `eurth-map/src/data/nations.js` | The nation statistics the map shows |
| `overlay-tools/` | Python scripts that trace the nation shapes from the border map and build the map layers, plus a review page for assigning territory |
| `data-tools/` | Python scripts that maintain the nation data and compare it with the community spreadsheet |
| `Overlays/`, `*.png` | Source map art the layers and shapes are built from |
| `nation-data/` | Snapshots, reports and spreadsheet comparisons written by the data scripts |
| `DEPLOY.md` | How to build and host the site, written for someone other than the owner |
| `LICENSE` | MIT licence for the code (not the map imagery, see below) |
| `CLAUDE.md` | Detailed technical notes: architecture, pipelines, design decisions |

## Run it locally

Needs Node.js 20 or newer.

```bash
cd eurth-map
npm install
npm run dev
```

The site is then at http://localhost:5173. The "Suggest an edit" form needs the serverless function, which `npm run dev` does not run; see `DEPLOY.md`, section 4.

Building, hosting, the one secret the site needs, and how to update the map art or the nation data are all covered in `DEPLOY.md`.

## Correcting a nation's data

Use "Suggest an edit" in a nation's panel on the live site. If a nation is missing, drawn with the wrong territory, or has no territory yet, open an issue here.

## Licence and credits

The code in this repository is released under the MIT licence; see `LICENSE`.

The licence covers the code only. The map imagery (the base map, the overlay images and the files generated from them) is derived from the Eurth community's official map and is not covered by it. The nation statistics come from the Eurth community and its members.

# Map and nation data license

The MIT license in `LICENSE` covers the **application code** in this repository: the web app in `eurth-map/`, the serverless function, and the Python scripts in `overlay-tools/` and `data-tools/`.

It does **not** cover the map data or the nation data. Those are the work of the Eurth community and its individual authors, not of the repository owner, and no rights in them are granted under the MIT license. This applies to the data wherever it appears: the source images, the files the scripts generate from them, and the values embedded in the code.

## Map geometry

The coastlines, borders, elevation and bathymetry, and everything derived from them, belong to the authors named below and the Eurth community. In this repository that is:

- the base map, `Eurth-Geography-Map-10-3-2026.png`, its no-legend copy in `Overlays/`, the earlier issues in `legacy/`, and the WebP and PNG copies in `eurth-map/public/`;
- `Eurth Blank Map Borders.png`, the border map the nation shapes are traced from;
- the overlay art in `Overlays/` (climate, ocean currents, tectonic plates) and the layers built from it in `eurth-map/public/layers/`;
- the traced nation shapes: `eurth-map/public/overlays.svg`, `eurth-map/public/nations.geojson`, `eurth-map/src/data/traced-areas.json`, `overlay-tools/manual-overlays.svg`, the seed and patch files in `overlay-tools/`, and the intermediate output of the tracing scripts;
- the vector reference map in `legacy/`.

The official Eurth map is © **Stijn Vogels** and **Colucci Giovanni**, published for the community at https://eurth.org/t/map-of-eurth/17693 with its source at https://github.com/eurth-org/eurth-map, and licensed under [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/). That license allows copying with credit, but no commercial use and no derivative works. The nation shapes traced from the map, and the overlay layers rebuilt from its art, are derivative works, and they are used here **with the authors' permission**; that permission is for this interactive map as part of the Eurth project and is not passed on by this repository. If you want to reuse the imagery or the traced shapes, follow CC BY-NC-ND 4.0 and ask the authors about anything it does not allow.

The custom elevation and climate layers for **Tavok** are the work of the repository owner, Seth Harrison, and are not part of the official map.

## Nation data

The nation names, statistics (capital, population, GDP, GDP per capita, land area), descriptions and flags in `eurth-map/src/data/nations.js`, `Nation Stat Sheet.xlsx`, `Secondary Country Data.csv`, `nation-updates.txt`, `nation-data/`, `overlay-tools/flag-boxes.json` and the flags drawn on the map belong to their respective players. The lore and statistics of each nation are published on [IIWiki](https://iiwiki.com/) and are subject to IIWiki's content terms. The per-nation highlight colours in `nations.js` and `nation-colors.md` are derived from those flags.

## In short

- Want to reuse the code? MIT, see `LICENSE`.
- Want to reuse the map, the nation shapes or the overlays? CC BY-NC-ND 4.0: credit the authors, no commercial use, no derivatives without asking them.
- Want to reuse a nation's name, statistics, lore or flag? Ask its player, and follow IIWiki's content terms.

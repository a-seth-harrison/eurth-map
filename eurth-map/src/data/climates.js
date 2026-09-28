// The Köppen zones painted on the climate map, in the order of its legend. `rgb` is the
// colour the zone is painted in (Overlays/Eurth-Climate-Map.png, and the same in the built
// public/layers/climate*.webp): src/utils/climate.js reads the overlay and matches these.
// build_layers.py prints the map's colours, so a repainted map shows up as a mismatch here.
const WIKI = "https://en.wikipedia.org/wiki/";

export const CLIMATE_ZONES = [
  // Hot
  { code: "Af", name: "Tropical Rainforest", group: "Hot", rgb: [0, 55, 255], wiki: "Tropical_rainforest_climate" },
  { code: "Am", name: "Tropical Monsoon", group: "Hot", rgb: [0, 127, 255], wiki: "Tropical_monsoon_climate" },
  { code: "Aw/As", name: "Tropical Savannah", group: "Hot", rgb: [37, 172, 252], wiki: "Tropical_savanna_climate" },
  { code: "BWh", name: "Hot Arid", group: "Hot", rgb: [255, 34, 0], wiki: "Desert_climate#Hot_desert_climates" },
  { code: "BSh", name: "Hot Semi-Arid", group: "Hot", rgb: [251, 162, 0], wiki: "Semi-arid_climate#Hot_semi-arid_climates" },
  { code: "Cfa", name: "Humid Subtropical", group: "Hot", rgb: [198, 250, 70], wiki: "Humid_subtropical_climate" },
  { code: "Cwa", name: "Humid Subtropical (Dry Winter)", group: "Hot", rgb: [144, 251, 149], wiki: "Humid_subtropical_climate" },
  // Temperate
  { code: "Dfa", name: "Humid Continental (Hot Summer)", group: "Temperate", rgb: [0, 253, 255], wiki: "Humid_continental_climate#Hot_summer_subtype" },
  { code: "Dfb", name: "Humid Continental", group: "Temperate", rgb: [0, 200, 255], wiki: "Humid_continental_climate#Warm_summer_subtype" },
  { code: "Csa", name: "Mediterranean (Hot Summer)", group: "Temperate", rgb: [255, 251, 0], wiki: "Mediterranean_climate#Hot-summer_Mediterranean_climate" },
  { code: "Csb", name: "Mediterranean (Warm Summer)", group: "Temperate", rgb: [201, 195, 0], wiki: "Mediterranean_climate#Warm-summer_Mediterranean_climate" },
  { code: "Csc", name: "Mediterranean (Cool Summer)", group: "Temperate", rgb: [152, 147, 0], wiki: "Mediterranean_climate#Cold-summer_Mediterranean_climate" },
  { code: "BWk", name: "Cold Arid", group: "Temperate", rgb: [255, 152, 147], wiki: "Desert_climate#Cold_desert_climates" },
  { code: "BSk", name: "Cold Semi-Arid", group: "Temperate", rgb: [255, 216, 93], wiki: "Semi-arid_climate#Cold_semi-arid_climates" },
  { code: "Cfb", name: "Oceanic", group: "Temperate", rgb: [33, 194, 0], wiki: "Oceanic_climate" },
  // Cold
  { code: "Dfc", name: "Subarctic", group: "Cold", rgb: [0, 125, 126], wiki: "Subarctic_climate" },
  { code: "Dfd", name: "Severely Cold Subarctic", group: "Cold", rgb: [0, 70, 95], wiki: "Subarctic_climate#Dfc_and_Dfd_distribution" },
  { code: "ET", name: "Tundra", group: "Cold", rgb: [178, 178, 178], wiki: "Tundra_climate" },
  { code: "EF", name: "Ice Cap", group: "Cold", rgb: [104, 104, 104], wiki: "Ice_cap_climate" },
].map((zone) => ({ ...zone, wiki: WIKI + zone.wiki }));

// The legend's wording: "Dfa - Humid Continental (Hot Summer)"
export const zoneLabel = (zone) => `${zone.code} - ${zone.name}`;

export const zoneColor = (zone) => `rgb(${zone.rgb.join(", ")})`;

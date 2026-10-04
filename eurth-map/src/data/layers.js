import manifest from "./map-layers.json";
import { IS_PHONE } from "../utils/device";

// The 8000 px wide overlays also exist at half size (build_layers.py). Phones load the half
// climate overlay: a quarter of the memory, and iOS closes tabs that use too much. The base
// map is always full size, because its text is what people read (half size was blurry).
// Every image is laid out at the full map size whatever its resolution.
const wide = (path) => `${path}${IS_PHONE ? "-half" : ""}.webp`;

// Toggleable overlays, in the order they are listed in the UI. The images come from
// overlay-tools/build_layers.py with their opacity baked in.
export const OVERLAYS = [
  { id: "climate", label: "Climate", src: wide("/layers/climate") },
  { id: "currents", label: "Ocean currents", src: "/layers/currents.webp" },
  { id: "tectonic", label: "Tectonic plates", src: "/layers/tectonic.webp" },
];

// Listed with the overlays, but it swaps the base map and the geography legend for their grey
// copies (also from build_layers.py). The overlays and the climate legend stay in colour.
export const GRAYSCALE = { id: "gray", label: "Grayscale map" };

// Bottom-to-top drawing order of the image overlays
const STACK = ["tectonic", "climate", "currents"];

export const BASE_MAP = "/background.webp";
export const BASE_MAP_GRAY = "/background-gray.webp";

// Where the legend sits on the map, in map pixels
export const LEGEND_BOX = manifest.legend;

// The base map image for a set of enabled switches
export function baseMap(enabled) {
  return enabled[GRAYSCALE.id] ? BASE_MAP_GRAY : BASE_MAP;
}

// Images to draw over the base map for a set of enabled switches: [{ src, box? }].
// The climate map brings its own legend, which replaces the geography one.
export function imageLayers(enabled) {
  const layers = STACK.filter((id) => enabled[id]).map((id) => ({
    src: OVERLAYS.find((o) => o.id === id).src,
  }));
  layers.push({ src: legend(enabled), box: LEGEND_BOX });
  return layers;
}

function legend(enabled) {
  if (enabled.climate) return "/layers/legend-climate.webp";
  return enabled[GRAYSCALE.id] ? "/layers/legend-geo-gray.webp" : "/layers/legend-geo.webp";
}

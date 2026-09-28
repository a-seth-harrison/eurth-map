import nations from "./nations";
import tracedAreas from "./traced-areas.json";
import mapAreaNations from "./map-area-nations.json";

// The one land area shown to viewers. It is the stated figure from nations.js, except for the
// nations in map-area-nations.json, whose stated figure is far from what is drawn on the map:
// those show the area traced from the map instead. Every nation's stated vs traced figure is
// tracked in area-discrepancies.md (written by overlay-tools/build_overlays.py).
export function landAreaOf(key) {
  if (mapAreaNations.includes(key) && tracedAreas[key] != null) return tracedAreas[key];
  return nations[key].landArea;
}

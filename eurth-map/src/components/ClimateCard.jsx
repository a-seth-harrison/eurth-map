import { zoneLabel, zoneColor } from "../data/climates";
import { COARSE_POINTER } from "../utils/device";

const HINT = COARSE_POINTER
  ? "Hold a finger on the map to read the climate"
  : "Hover the map to read the climate";

// Shown while the Climate overlay is on: the last zone read, with its Wikipedia page
export default function ClimateCard({ zone }) {
  return (
    <div className="climate-card">
      {zone ? (
        <>
          <div className="climate-card-zone">
            <span className="climate-swatch" style={{ background: zoneColor(zone) }} />
            {zoneLabel(zone)}
          </div>
          <div className="climate-card-meta">
            <span>{zone.group} climate</span>
            <a href={zone.wiki} target="_blank" rel="noopener">
              Wikipedia ↗
            </a>
          </div>
        </>
      ) : (
        <div className="climate-card-hint">{HINT}</div>
      )}
    </div>
  );
}

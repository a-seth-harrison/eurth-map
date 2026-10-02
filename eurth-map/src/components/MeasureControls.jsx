import { useState } from "react";
import { formatDistance, formatArea, DISTANCE_UNITS } from "../utils/format";
import { COARSE_POINTER } from "../utils/device";

const DOUBLE = COARSE_POINTER ? "double-tap" : "double-click";
const CLICK = COARSE_POINTER ? "Tap" : "Click";

// Measure button + readout. `m` is the object returned by useMeasurement.
// The readout can be folded down to one line (the figure being measured), which keeps the
// measurements on the map: only "Exit measure" clears them
export default function MeasureControls({ m, hint }) {
  const [folded, setFolded] = useState(false);
  const { measuring, setMeasureMode, unit, setUnit, mode, setMode } = m;
  const { finished, current, hasCursor, undo, clear, removeMeasurement } = m;
  const { points, preview, ring, totalKm, areaKm2, perimeterKm } = current;
  const noun = mode === "distance" ? "Route" : "Area";
  const ending = ` · ${DOUBLE} to finish`;
  const value =
    mode === "distance" ? formatDistance(totalKm, unit) : points.length < 3 ? "Need 3+ points" : formatArea(areaKm2, unit);

  return (
    <div className="measure-controls">
      <div className="measure-bar">
        <button
          className={"measure-toggle" + (measuring ? " active" : "")}
          onClick={() => setMeasureMode(!measuring)}
        >
          {measuring ? "Exit measure" : "Measure"}
        </button>
        {measuring && (
          <button className="measure-fold" aria-expanded={!folded} onClick={() => setFolded(!folded)}>
            {folded ? "Show options" : "Hide options"}
          </button>
        )}
      </div>
      {measuring && folded && points.length > 0 && (
        <div className="measure-readout measure-compact">
          <span className="measure-swatch" style={{ background: current.color }} />
          {value}
        </div>
      )}
      {measuring && !folded && (
        <div className="measure-readout">
          <div className="measure-units">
            {["distance", "area"].map((key) => (
              <button key={key} className={key === mode ? "active" : ""} onClick={() => setMode(key)}>
                {key === "distance" ? "Distance" : "Area"}
              </button>
            ))}
          </div>
          <div className="measure-units">
            {Object.entries(DISTANCE_UNITS).filter(([key]) => mode !== "area" || key !== "nmi").map(([key, u]) => (
              <button key={key} className={key === unit ? "active" : ""} onClick={() => setUnit(key)}>
                {u.label}
                {mode === "area" && "²"}
              </button>
            ))}
          </div>
          {finished.length > 0 && (
            <ul className="measure-list">
              {finished.map((r, i) => (
                <li key={r.id}>
                  <span className="measure-swatch" style={{ background: r.color }} />
                  <span className="measure-list-name">{noun} {i + 1}</span>
                  <span className="measure-list-value">
                    {mode === "distance"
                      ? formatDistance(r.totalKm, unit)
                      : r.points.length < 3 ? "—" : formatArea(r.areaKm2, unit)}
                  </span>
                  <button aria-label={`Remove ${noun.toLowerCase()} ${i + 1}`} onClick={() => removeMeasurement(r.id)}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          {points.length === 0 ? (
            <div className="measure-hint">
              {finished.length ? `${CLICK} to start ${noun.toLowerCase()} ${finished.length + 1}.` : hint}
            </div>
          ) : (
            <>
              {mode === "distance" ? (
                <>
                  <div className="measure-total">
                    <span className="measure-swatch" style={{ background: current.color }} />
                    {value}
                  </div>
                  <div className="measure-hint">
                    {points.length} point{points.length === 1 ? "" : "s"}
                    {preview && ` · next: +${formatDistance(preview.km, unit)}`}
                    {ending}
                  </div>
                </>
              ) : (
                <>
                  <div className="measure-total">
                    <span className="measure-swatch" style={{ background: current.color }} />
                    {value}
                  </div>
                  <div className="measure-hint">
                    {points.length} point{points.length === 1 ? "" : "s"}
                    {points.length >= 3 &&
                      ` · perimeter ${formatDistance(perimeterKm, unit)}`}
                    {ending}
                  </div>
                  {ring && hasCursor && (
                    <div className="measure-hint">with next point: {formatArea(ring.km2, unit)}</div>
                  )}
                </>
              )}
            </>
          )}
          {(points.length > 0 || finished.length > 0) && (
            <div className="measure-actions">
              <button onClick={undo}>Undo</button>
              <button onClick={clear}>Clear{finished.length ? " all" : ""}</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

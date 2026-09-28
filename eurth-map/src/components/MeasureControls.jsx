import { formatDistance, formatArea, DISTANCE_UNITS } from "../utils/format";
import { COARSE_POINTER } from "../utils/device";

const DOUBLE = COARSE_POINTER ? "double-tap" : "double-click";
const CLICK = COARSE_POINTER ? "tap" : "click";

// Measure button + readout. `m` is the object returned by useMeasurement.
export default function MeasureControls({ m, hint }) {
  const { measuring, setMeasureMode, points, setPoints, cursor, unit, setUnit, mode, setMode } = m;
  const { preview, ring, totalKm, areaKm2, perimeterKm, finished } = m;
  // How to end the measurement, or how to start the next one
  const ending = finished ? ` · finished, ${CLICK} to start a new one` : ` · ${DOUBLE} to finish`;

  return (
    <div className="measure-controls">
      <button
        className={"measure-toggle" + (measuring ? " active" : "")}
        onClick={() => setMeasureMode(!measuring)}
      >
        {measuring ? "Exit measure" : "Measure"}
      </button>
      {measuring && (
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
          {points.length === 0 ? (
            <div className="measure-hint">{hint}</div>
          ) : (
            <>
              {mode === "distance" ? (
                <>
                  <div className="measure-total">{formatDistance(totalKm, unit)}</div>
                  <div className="measure-hint">
                    {points.length} point{points.length === 1 ? "" : "s"}
                    {preview && ` · next: +${formatDistance(preview.km, unit)}`}
                    {ending}
                  </div>
                </>
              ) : (
                <>
                  <div className="measure-total">
                    {points.length < 3 ? "Need 3+ points" : formatArea(areaKm2, unit)}
                  </div>
                  <div className="measure-hint">
                    {points.length} point{points.length === 1 ? "" : "s"}
                    {points.length >= 3 &&
                      ` · perimeter ${formatDistance(perimeterKm, unit)}`}
                    {ending}
                  </div>
                  {ring && cursor && (
                    <div className="measure-hint">with next point: {formatArea(ring.km2, unit)}</div>
                  )}
                </>
              )}
              <div className="measure-actions">
                <button onClick={() => setPoints((pts) => pts.slice(0, -1))}>Undo</button>
                <button onClick={() => setPoints([])}>Clear</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

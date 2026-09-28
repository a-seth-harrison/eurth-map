import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { distanceKm, greatCirclePath, polygonAreaKm2, polygonOutline } from "../utils/geo";

// A second click this soon and this close to the last one is a double-click (or double-tap)
const DOUBLE_CLICK_MS = 400;
const DOUBLE_CLICK_PX = 8;

// Measure-mode state and math shared by the flat map and the globe.
// Points are always map pixels (see utils/geo.js), whichever view they were clicked in.
export default function useMeasurement({ onEnter } = {}) {
  const [measuring, setMeasuring] = useState(false);
  const [points, setPointsState] = useState([]); // measure points, in map pixels
  const [finished, setFinished] = useState(false); // double-clicked: the readout stays, the preview stops
  const [cursor, setCursor] = useState(null); // live preview end point, in map pixels
  const [unit, setUnit] = useState("km");
  const [mode, setModeState] = useState("distance"); // "distance" | "area"
  // Nautical miles are a distance unit only: area falls back to km²
  function setMode(next) {
    setModeState(next);
    if (next === "area") setUnit((u) => (u === "nmi" ? "km" : u));
  }
  const measuringRef = useRef(false); // for event handlers bound once
  const finishedRef = useRef(false);
  const lastAdd = useRef(null); // { time, x, y } (screen px) of the last click that placed a point

  // Any edit of the points (undo, clear, Backspace) reopens a finished measurement
  const setPoints = useCallback((next) => {
    finishedRef.current = false;
    setFinished(false);
    setPointsState(next);
  }, []);

  // A click in measure mode. `screen` is the click's client position, used to tell a
  // double-click: that finishes the measurement instead of placing a second point on the
  // same spot. A click after finishing starts a new measurement
  const addPoint = useCallback((point, screen) => {
    const now = performance.now();
    const last = lastAdd.current;
    lastAdd.current = { time: now, ...screen };
    if (last && now - last.time < DOUBLE_CLICK_MS && Math.hypot(screen.x - last.x, screen.y - last.y) < DOUBLE_CLICK_PX) {
      lastAdd.current = null;
      finishedRef.current = true;
      setFinished(true);
      return;
    }
    if (finishedRef.current) {
      setPoints([point]);
      return;
    }
    setPointsState((pts) => [...pts, point]);
  }, [setPoints]);

  // Entering/leaving measure mode resets the measurement
  function setMeasureMode(on) {
    measuringRef.current = on;
    setMeasuring(on);
    setPoints([]);
    setCursor(null);
    lastAdd.current = null;
    if (on) onEnter?.();
  }

  // Measure shortcuts: Esc exits, Backspace removes the last point
  useEffect(() => {
    if (!measuring) return;
    function onKeyDown(e) {
      if (e.key === "Escape") setMeasureMode(false);
      if (e.key === "Backspace") setPoints((pts) => pts.slice(0, -1));
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // setMeasureMode only touches setters and a ref, so a stale copy is fine
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measuring]);

  // Great-circle segments between consecutive points, plus a live one to the cursor
  const segments = useMemo(() => {
    const segs = [];
    for (let i = 1; i < points.length; i++) {
      segs.push({
        ...greatCirclePath(points[i - 1], points[i]),
        km: distanceKm(points[i - 1], points[i]),
      });
    }
    return segs;
  }, [points]);

  // No live preview once the measurement is finished
  const liveCursor = finished ? null : cursor;

  const preview = useMemo(() => {
    if (!liveCursor || points.length === 0) return null;
    const last = points[points.length - 1];
    return { ...greatCirclePath(last, liveCursor), km: distanceKm(last, liveCursor), isPreview: true };
  }, [points, liveCursor]);

  // Area mode: the ring closes back to the first point, and the cursor counts as a vertex
  const ring = useMemo(() => {
    if (mode !== "area") return null;
    const verts = liveCursor && points.length ? [...points, liveCursor] : points;
    if (verts.length < 3) return null;
    const last = verts[verts.length - 1];
    return {
      closing: { ...greatCirclePath(last, verts[0]), km: distanceKm(last, verts[0]), isPreview: !!liveCursor },
      outline: polygonOutline(verts),
      km2: polygonAreaKm2(verts),
    };
  }, [mode, points, liveCursor]);

  // Every line to draw: solid segments, then the dashed live ones
  const drawn = useMemo(
    () => [...segments, ...(preview ? [preview] : []), ...(ring ? [ring.closing] : [])],
    [segments, preview, ring]
  );

  const totalKm = segments.reduce((sum, s) => sum + s.km, 0);

  return {
    measuring, measuringRef, setMeasureMode,
    points, setPoints, addPoint, finished, cursor: liveCursor, setCursor,
    unit, setUnit, mode, setMode,
    preview, ring, drawn, totalKm,
    areaKm2: mode === "area" ? polygonAreaKm2(points) : 0,
    perimeterKm: points.length >= 3 ? totalKm + distanceKm(points[points.length - 1], points[0]) : 0,
  };
}

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { distanceKm, greatCirclePath, polygonAreaKm2, polygonOutline } from "../utils/geo";

// A second click this soon and this close to the last one is a double-click (or double-tap)
const DOUBLE_CLICK_MS = 400;
const DOUBLE_CLICK_PX = 8;

// One colour per measurement on the map, so separate routes can be told apart
export const MEASURE_COLORS = ["#ffd24a", "#4ad9ff", "#ff7eb6", "#8dff6a", "#ff9c4a", "#c9a2ff"];

// The first colour no kept measurement is using
function freeColor(done) {
  return MEASURE_COLORS.find((c) => !done.some((r) => r.color === c)) ?? MEASURE_COLORS[done.length % MEASURE_COLORS.length];
}

const EMPTY = { done: [], points: [], color: MEASURE_COLORS[0] };

// Lines and figures of one measurement. `cursor` is the live preview end point (null for none)
function measure(points, cursor, mode, color) {
  // Great-circle segments between consecutive points, plus a live one to the cursor
  const segments = [];
  for (let i = 1; i < points.length; i++) {
    segments.push({
      ...greatCirclePath(points[i - 1], points[i]),
      km: distanceKm(points[i - 1], points[i]),
      color,
    });
  }
  const last = points[points.length - 1];
  const preview =
    cursor && last ? { ...greatCirclePath(last, cursor), km: distanceKm(last, cursor), isPreview: true, color } : null;

  // Area mode: the ring closes back to the first point, and the cursor counts as a vertex
  let ring = null;
  const verts = cursor && points.length ? [...points, cursor] : points;
  if (mode === "area" && verts.length >= 3) {
    const end = verts[verts.length - 1];
    ring = {
      closing: { ...greatCirclePath(end, verts[0]), km: distanceKm(end, verts[0]), isPreview: !!cursor, color },
      outline: polygonOutline(verts),
      km2: polygonAreaKm2(verts),
      color,
    };
  }

  const totalKm = segments.reduce((sum, s) => sum + s.km, 0);
  return {
    points, color, preview, ring, totalKm,
    // Every line to draw: solid segments, then the dashed live ones
    drawn: [...segments, ...(preview ? [preview] : []), ...(ring ? [ring.closing] : [])],
    areaKm2: mode === "area" ? polygonAreaKm2(points) : 0,
    perimeterKm: points.length >= 3 ? totalKm + distanceKm(last, points[0]) : 0,
  };
}

// Measure-mode state and math shared by the flat map and the globe.
// Points are always map pixels (see utils/geo.js), whichever view they were clicked in.
// `done` holds the finished measurements, which stay on the map; `points` is the one being drawn
export default function useMeasurement({ onEnter } = {}) {
  const [measuring, setMeasuring] = useState(false);
  const [state, setState] = useState(EMPTY); // { done: [{ id, color, points }], points, color }
  const [cursor, setCursor] = useState(null); // live preview end point, in map pixels
  const [unit, setUnit] = useState("km");
  const [mode, setModeState] = useState("distance"); // "distance" | "area"
  // Nautical miles are a distance unit only: area falls back to km²
  function setMode(next) {
    setModeState(next);
    if (next === "area") setUnit((u) => (u === "nmi" ? "km" : u));
  }
  const measuringRef = useRef(false); // for event handlers bound once
  const lastAdd = useRef(null); // { time, x, y } (screen px) of the last click that placed a point
  const nextId = useRef(1);

  // A click in measure mode. `screen` is the click's client position, used to tell a
  // double-click: that finishes the measurement instead of placing a second point on the
  // same spot. The finished one stays on the map and the next click starts another
  const addPoint = useCallback((point, screen) => {
    const now = performance.now();
    const last = lastAdd.current;
    lastAdd.current = { time: now, ...screen };
    if (last && now - last.time < DOUBLE_CLICK_MS && Math.hypot(screen.x - last.x, screen.y - last.y) < DOUBLE_CLICK_PX) {
      lastAdd.current = null;
      const id = nextId.current++;
      setState((s) => {
        // A lone point measures nothing: it is dropped rather than kept
        const done = s.points.length >= 2 ? [...s.done, { id, color: s.color, points: s.points }] : s.done;
        return { done, points: [], color: freeColor(done) };
      });
      return;
    }
    setState((s) => ({ ...s, points: [...s.points, point] }));
  }, []);

  // Removes the last point. With nothing being drawn, reopens the last finished measurement
  const undo = useCallback(() => {
    setState((s) => {
      if (s.points.length) return { ...s, points: s.points.slice(0, -1) };
      const reopened = s.done[s.done.length - 1];
      if (!reopened) return s;
      return { done: s.done.slice(0, -1), points: reopened.points, color: reopened.color };
    });
  }, []);

  const clear = useCallback(() => setState(EMPTY), []);

  const removeMeasurement = useCallback((id) => {
    setState((s) => {
      const done = s.done.filter((r) => r.id !== id);
      // The one being drawn keeps its colour
      return { done, points: s.points, color: s.points.length ? s.color : freeColor(done) };
    });
  }, []);

  // Entering/leaving measure mode resets everything
  function setMeasureMode(on) {
    measuringRef.current = on;
    setMeasuring(on);
    setState(EMPTY);
    setCursor(null);
    lastAdd.current = null;
    if (on) onEnter?.();
  }

  // Measure shortcuts: Esc exits, Backspace undoes
  useEffect(() => {
    if (!measuring) return;
    function onKeyDown(e) {
      if (e.key === "Escape") setMeasureMode(false);
      if (e.key === "Backspace") undo();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // setMeasureMode only touches setters and a ref, so a stale copy is fine
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measuring]);

  const { done, points, color } = state;

  // Finished measurements do not change with the cursor, so their lines keep their identity
  const finished = useMemo(
    () => done.map((r) => ({ id: r.id, ...measure(r.points, null, mode, r.color) })),
    [done, mode]
  );
  const current = useMemo(() => measure(points, cursor, mode, color), [points, cursor, mode, color]);

  // What the viewers draw: every measurement's lines, points and area rings
  const drawn = useMemo(() => [...finished.flatMap((r) => r.drawn), ...current.drawn], [finished, current]);
  const markers = useMemo(
    () => [...done, { points, color }].flatMap((r) => r.points.map((at) => ({ at, color: r.color }))),
    [done, points, color]
  );
  const rings = useMemo(
    () => [...finished, current].filter((r) => r.ring).map((r) => r.ring),
    [finished, current]
  );

  return {
    measuring, measuringRef, setMeasureMode,
    addPoint, undo, clear, removeMeasurement, setCursor,
    unit, setUnit, mode, setMode,
    finished, current, hasCursor: !!cursor && points.length > 0,
    drawn, markers, rings,
  };
}

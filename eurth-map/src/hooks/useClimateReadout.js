import { useState, useEffect, useRef, useCallback } from "react";
import { loadClimateGrid, climateAt } from "../utils/climate";

// How long a finger must stay still before the climate readout appears
export const LONG_PRESS_MS = 350;

// Climate readout state shared by both viewers. `enabled` is whether the Climate overlay is on.
// `zone` is what is under the pointer right now (the cursor tooltip); `lastZone` is the last
// zone read, kept while the mouse is off the map so the card's link can be clicked. On touch
// a long press starts a "press": the readout follows the finger instead of panning, and stays
// pinned on screen after the finger lifts until the next touch.
export default function useClimateReadout(enabled) {
  const [zone, setZone] = useState(null);
  const [lastZone, setLastZone] = useState(null);
  const [pressing, setPressing] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [wasEnabled, setWasEnabled] = useState(enabled);
  const grid = useRef(null);
  const zoneRef = useRef(null);
  const pressingRef = useRef(false);

  // Switching the overlay off (or on again) starts from nothing
  if (enabled !== wasEnabled) {
    setWasEnabled(enabled);
    setZone(null);
    setLastZone(null);
    setPressing(false);
    setPinned(false);
  }

  useEffect(() => {
    zoneRef.current = null;
    pressingRef.current = false;
    if (!enabled) {
      grid.current = null;
      return;
    }
    let cancelled = false;
    loadClimateGrid()
      .then((g) => {
        if (!cancelled) grid.current = g;
      })
      .catch((err) => console.error("Climate readout unavailable:", err));
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  // `point` in map pixels, or null for "not over the map"
  const readAt = useCallback((point) => {
    const next = climateAt(grid.current, point);
    if (next === zoneRef.current) return;
    zoneRef.current = next;
    setZone(next);
    if (next) setLastZone(next);
  }, []);

  const clear = useCallback(() => {
    zoneRef.current = null;
    pressingRef.current = false;
    setZone(null);
    setPressing(false);
    setPinned(false);
  }, []);

  const startPress = useCallback(() => {
    pressingRef.current = true;
    setPressing(true);
    setPinned(false);
  }, []);

  // The finger lifted: the readout stays where it is
  const endPress = useCallback(() => {
    if (!pressingRef.current) return;
    pressingRef.current = false;
    setPressing(false);
    setPinned(true);
  }, []);

  return { enabled, zone, lastZone, pressing, pinned, pressingRef, readAt, clear, startPress, endPress };
}

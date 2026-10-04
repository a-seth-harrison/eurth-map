import { useEffect, useState } from "react";
import { baseMap } from "../data/layers";

// The base map image the flat map should show for the enabled switches (colour or grey).
// A switch changes the wanted image at once, but the shown one only follows when the new
// image is decoded: swapping an <img>'s src straight away leaves a blank map for the second
// or two the download takes (the grey copy is only fetched when first switched on).
export default function useBaseMap(enabled) {
  const wanted = baseMap(enabled);
  const [shown, setShown] = useState(wanted);
  useEffect(() => {
    if (wanted === shown) return undefined;
    let cancelled = false;
    const img = new Image();
    img.src = wanted;
    img
      .decode()
      .catch(() => {}) // offline or refused: keep what is on screen
      .then(() => {
        if (!cancelled) setShown(wanted);
      });
    return () => {
      cancelled = true;
    };
  }, [wanted, shown]);
  return shown;
}

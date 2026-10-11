import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { pixelToLonLat } from "../utils/geo";
import { formatLonLat } from "../utils/format";
import { COARSE_POINTER } from "../utils/device";

const COPIED_MS = 1500;
// Dev builds also show the map pixel, which the overlay tools take (seeds, find_leak.py)
const SHOW_PIXELS = import.meta.env.DEV;

const degrees = (p) => formatLonLat(pixelToLonLat(p));
const pixels = (p) => `px ${Math.round(p.x)}, ${Math.round(p.y)}`;

// The coordinates of the pointer and of the last click. `pinned` is the clicked spot in map
// pixels (null for none), kept until the next click or its ×, with a Copy button. The live
// line follows the mouse through `setLive(point)` on the ref, written straight to the DOM so
// a mouse move re-renders nothing; null hides it (the mouse is off the map). A finger has
// no live line: a tap pins. Hidden altogether while there is nothing to show
const CoordReadout = forwardRef(function CoordReadout({ pinned, onClear }, ref) {
  const box = useRef(null);
  const liveRow = useRef(null);
  const liveValue = useRef(null);
  const livePx = useRef(null);
  const live = useRef(null); // the live point, for the next render
  const [copied, setCopied] = useState(false);
  const timer = useRef(0);

  useImperativeHandle(ref, () => ({
    setLive(point) {
      live.current = point;
      if (!liveRow.current) return;
      liveRow.current.hidden = !point;
      if (point) {
        liveValue.current.textContent = degrees(point);
        if (livePx.current) livePx.current.textContent = pixels(point);
      }
      box.current.hidden = !point && !pinned;
    },
  }));

  function copy() {
    // No clipboard (an insecure origin, or the page is not focused): the button just does nothing
    navigator.clipboard
      ?.writeText(degrees(pinned))
      .then(() => {
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), COPIED_MS);
      })
      .catch(() => {});
  }

  return (
    <div className="coord-readout" ref={box} hidden={!pinned && !live.current}>
      {!COARSE_POINTER && (
        <div className="coord-row" ref={liveRow} hidden={!live.current}>
          <span className="coord-label">Cursor</span>
          <span className="coord-value" ref={liveValue}>{live.current && degrees(live.current)}</span>
          {SHOW_PIXELS && <span className="coord-px" ref={livePx}>{live.current && pixels(live.current)}</span>}
        </div>
      )}
      {pinned && (
        <div className="coord-row">
          <span className="coord-label">{COARSE_POINTER ? "Tapped" : "Clicked"}</span>
          <span className="coord-value">{degrees(pinned)}</span>
          {SHOW_PIXELS && <span className="coord-px">{pixels(pinned)}</span>}
          <button onClick={copy}>{copied ? "Copied" : "Copy"}</button>
          <button className="coord-clear" aria-label="Clear the clicked coordinates" onClick={onClear}>
            ×
          </button>
        </div>
      )}
    </div>
  );
});

export default CoordReadout;

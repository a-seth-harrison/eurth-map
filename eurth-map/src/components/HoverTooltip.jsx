import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from "react";
import { zoneLabel, zoneColor } from "../data/climates";
import { IS_PHONE } from "../utils/device";

const MOUSE_DX = 14;
const MOUSE_DY = 18;
const FINGER_DY = 70; // above the finger, clear of it
const MARGIN = 8;

// The box that follows the pointer: the hovered nation's name and/or the climate zone under
// it. `moveTo(clientX, clientY)` on the ref places it; that is written straight to the style
// so a mouse move across one zone re-renders nothing. `touch` puts it above the finger.
// A phone's screen is too small for both this and the climate card, so there a long press
// shows the zone in the card alone
const HoverTooltip = forwardRef(function HoverTooltip({ nation, zone: zoneProp, touch }, ref) {
  const zone = IS_PHONE && touch ? null : zoneProp;
  const el = useRef(null);
  const at = useRef(null);

  function place() {
    const box = el.current;
    const p = at.current;
    if (!box || !p) return;
    const w = box.offsetWidth;
    const h = box.offsetHeight;
    let x, y;
    if (touch) {
      x = p.x - w / 2;
      y = p.y - FINGER_DY - h;
      if (y < MARGIN) y = p.y + MOUSE_DY;
    } else {
      x = p.x + MOUSE_DX;
      y = p.y + MOUSE_DY;
      if (x + w > window.innerWidth - MARGIN) x = p.x - MOUSE_DX - w;
      if (y + h > window.innerHeight - MARGIN) y = p.y - MOUSE_DY - h;
    }
    x = Math.min(Math.max(x, MARGIN), window.innerWidth - w - MARGIN);
    y = Math.min(Math.max(y, MARGIN), window.innerHeight - h - MARGIN);
    box.style.left = `${x}px`;
    box.style.top = `${y}px`;
  }

  useImperativeHandle(ref, () => ({
    moveTo(x, y) {
      at.current = { x, y };
      place();
    },
  }));

  // Re-place when the content changes (it mounts, or its width changes)
  useLayoutEffect(place);

  if (!nation && !zone) return null;
  return (
    <div className="hover-tooltip" ref={el}>
      {nation && <div className="tooltip-nation">{nation}</div>}
      {zone && (
        <div className="tooltip-climate">
          <span className="climate-swatch" style={{ background: zoneColor(zone) }} />
          {zoneLabel(zone)}
        </div>
      )}
    </div>
  );
});

export default HoverTooltip;

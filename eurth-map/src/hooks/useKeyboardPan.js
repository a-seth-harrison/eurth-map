import { useEffect, useRef } from "react";

// Physical key positions, so WASD stays a cross on non-QWERTY layouts
const DIRECTIONS = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

function isTyping(target) {
  if (target.isContentEditable || target.tagName === "TEXTAREA" || target.tagName === "SELECT") return true;
  return target.tagName === "INPUT" && !["checkbox", "radio", "button"].includes(target.type);
}

// WASD / arrow keys move the view. While any of them is held, onStep(dx, dy, seconds) runs once
// per frame; dx and dy are -1, 0 or 1 in screen terms (right and down positive) and say which
// way the view travels. Shift doubles the speed (seconds is scaled).
export default function useKeyboardPan(onStep) {
  const stepRef = useRef(onStep);
  useEffect(() => {
    stepRef.current = onStep;
  });

  useEffect(() => {
    const held = new Set();
    let fast = false;
    let frame = 0;
    let last = 0;

    function tick(now) {
      frame = 0;
      let dx = 0;
      let dy = 0;
      for (const code of held) {
        dx += DIRECTIONS[code][0];
        dy += DIRECTIONS[code][1];
      }
      // Cap the step so a stalled frame doesn't throw the view across the map
      const seconds = Math.min((now - last) / 1000, 0.05) * (fast ? 2 : 1);
      last = now;
      if (dx || dy) stepRef.current(Math.sign(dx), Math.sign(dy), seconds);
      if (held.size) frame = requestAnimationFrame(tick);
    }

    function onKeyDown(e) {
      fast = e.shiftKey;
      if (!DIRECTIONS[e.code] || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      e.preventDefault();
      held.add(e.code);
      if (!frame) {
        last = performance.now();
        frame = requestAnimationFrame(tick);
      }
    }
    function onKeyUp(e) {
      fast = e.shiftKey;
      held.delete(e.code);
    }
    function onBlur() {
      held.clear();
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      cancelAnimationFrame(frame);
    };
  }, []);
}

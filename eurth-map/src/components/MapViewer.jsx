import { useState, useEffect, useLayoutEffect, useRef } from "react";
import nations from "../data/nations";
import NationPanel from "./NationPanel";
import { landAreaOf } from "../data/landArea";
import MeasureControls from "./MeasureControls";
import useMeasurement from "../hooks/useMeasurement";
import useKeyboardPan from "../hooks/useKeyboardPan";
import useClimateReadout, { LONG_PRESS_MS } from "../hooks/useClimateReadout";
import HoverTooltip from "./HoverTooltip";
import ClimateCard from "./ClimateCard";
import { MAP_WIDTH, MAP_HEIGHT } from "../utils/geo";
import { BASE_MAP, imageLayers } from "../data/layers";
import { formatDistance } from "../utils/format";
import { COARSE_POINTER } from "../utils/device";

const NATION_IDS = Object.keys(nations);
const KEY_PAN_SPEED = 900; // screen px per second
const MAX_SCALE = 10;
const MIN_SCALE = 0.5; // lowered on screens where that would not show the whole map
// The world repeats sideways: a copy on either side of the real one, and the view is wrapped
// so its centre is always over the middle copy
const WORLD_COPIES = [-MAP_WIDTH, 0, MAP_WIDTH];
const wrapX = (x) => ((x % MAP_WIDTH) + MAP_WIDTH) % MAP_WIDTH;

// A finger wobbles more than a mouse before it counts as a drag
const clickThreshold = (pointerType) => (pointerType === "mouse" ? 5 : 10);

// Scale at which the whole map fits a w x h viewport
const fitScale = (w, h) => Math.min(w / MAP_WIDTH, h / MAP_HEIGHT);

// Zoom by `factor`, keeping the viewport point (cx, cy) over the same spot of the map
function zoomAt(t, cx, cy, factor, minScale) {
  const scale = Math.min(Math.max(t.scale * factor, minScale), MAX_SCALE);
  const ratio = scale / t.scale;
  return { scale, x: cx - ratio * (cx - t.x), y: cy - ratio * (cy - t.y) };
}

// Sideways the view wraps around the world. Up and down it stops at the map's edges; a map
// shorter than the viewport sits in the middle. `h` leaves out what the bottom sheet covers
function clampPan(t, w, h) {
  const centreX = (w / 2 - t.x) / t.scale; // map x under the middle of the viewport
  const mapHeight = MAP_HEIGHT * t.scale;
  return {
    scale: t.scale,
    x: t.x + (centreX - wrapX(centreX)) * t.scale,
    y: mapHeight <= h ? (h - mapHeight) / 2 : Math.min(Math.max(t.y, h - mapHeight), 0),
  };
}

export default function MapViewer({ overlays }) {
  const [selected, setSelected] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [fitted, setFitted] = useState(false); // the opening view has been worked out
  const m = useMeasurement({
    onEnter: () => {
      setSelected(null);
      setHovered(null);
    },
  });
  const { measuring, measuringRef, points, addPoint, setCursor, unit, ring, drawn } = m;
  const climate = useClimateReadout(!!overlays.climate);
  const { readAt: readClimate, pressingRef, endPress } = climate;
  const tipRef = useRef(null); // HoverTooltip: moveTo(clientX, clientY)
  const pressTimer = useRef(0); // long-press timer of a finger held on the map
  const pointers = useRef(new Map()); // pointers held down on the map: pointerId -> { x, y } (client)
  const pinch = useRef(null); // { dist, x, y } of the two fingers at the last move
  const hasDragged = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const pointerOrigin = useRef({ x: 0, y: 0, threshold: 5 });
  const lastPointer = useRef(null); // client position while the mouse is over the map
  const keyPanned = useRef(false);
  const lastTap = useRef(null); // client position of the tap that selected a nation
  const transformRef = useRef(transform);
  const viewSize = useRef({ w: 0, h: 0 });
  const sheetHeight = useRef(0); // height of the nation panel while it is a bottom sheet (phones)
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const mapRef = useRef(null); // .map-transform

  // Every change of view goes through here. The ref is updated at once, so handlers that
  // fire several times per frame (pinch) always build on the latest value
  function updateTransform(fn) {
    const { w, h } = viewSize.current;
    const next = clampPan(fn(transformRef.current), w, h - sheetHeight.current);
    transformRef.current = next;
    setTransform(next);
  }

  const minScale = () => Math.min(MIN_SCALE, fitScale(viewSize.current.w, viewSize.current.h));

  // Open on the whole map, centred. On a tall screen that would be a thin strip, so the map
  // gets at least half the height. Afterwards a resize or rotation keeps the centre in place
  useLayoutEffect(() => {
    const el = containerRef.current;

    function onResize() {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h) return;
      const old = viewSize.current;
      viewSize.current = { w, h };
      if (!old.w) {
        const scale = Math.max(fitScale(w, h), (0.5 * h) / MAP_HEIGHT);
        updateTransform(() => ({ scale, x: (w - MAP_WIDTH * scale) / 2, y: (h - MAP_HEIGHT * scale) / 2 }));
        setFitted(true);
        return;
      }
      updateTransform((t) => {
        const centred = { ...t, x: t.x + (w - old.w) / 2, y: t.y + (h - old.h) / 2 };
        return zoomAt(centred, w / 2, h / 2, 1, minScale());
      });
    }

    onResize();
    const observer = new ResizeObserver(onResize);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Screen position -> map pixel, whichever copy of the world it is over
  function toMapPoint(clientX, clientY) {
    const rect = containerRef.current.getBoundingClientRect();
    const t = transformRef.current;
    return {
      x: wrapX((clientX - rect.left - t.x) / t.scale),
      y: Math.min(Math.max((clientY - rect.top - t.y) / t.scale, 0), MAP_HEIGHT),
    };
  }

  // Load overlay SVG inline
  useEffect(() => {
    fetch("/overlays.svg")
      .then((r) => r.text())
      .then((text) => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, "image/svg+xml");
        const svg = doc.documentElement;
        svg.setAttribute("class", "overlay-svg");
        svg.setAttribute("viewBox", `${-MAP_WIDTH} 0 ${3 * MAP_WIDTH} ${MAP_HEIGHT}`);

        const groups = [];
        for (const id of NATION_IDS) {
          const group = svg.getElementById(id);
          if (!group) continue;
          group.dataset.nation = id;
          groups.push(group);
          for (const path of group.querySelectorAll("path")) {
            // Normalize border colors
            if (path.style.stroke) {
              path.style.stroke = "#951C0D";
            }
            // Per-nation highlight; nations without a color keep the red from App.css
            if (nations[id].color) {
              path.style.fill = nations[id].color;
            }
          }
        }

        // The same shapes over the two side copies of the world. Clones carry data-nation
        // but no ids, so a nation is found and highlighted in every copy
        for (const dx of WORLD_COPIES) {
          if (!dx) continue;
          const copy = doc.createElementNS("http://www.w3.org/2000/svg", "g");
          copy.setAttribute("transform", `translate(${dx} 0)`);
          for (const group of groups) {
            const clone = group.cloneNode(true);
            clone.removeAttribute("id");
            for (const el of clone.querySelectorAll("[id]")) el.removeAttribute("id");
            copy.appendChild(clone);
          }
          svg.appendChild(copy);
        }

        svgRef.current.innerHTML = "";
        svgRef.current.appendChild(svg);
      });
  }, []);

  function findNation(target) {
    const el = svgRef.current;
    let node = target;
    while (node && node !== el) {
      if (node.dataset?.nation) return node.dataset.nation;
      node = node.parentElement;
    }
    return null;
  }

  // Hover handlers. Only a mouse hovers: a finger fires these on every tap, and the
  // highlight would stay behind
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;

    function onPointerOver(e) {
      if (e.pointerType !== "mouse" || measuringRef.current) return;
      setHovered(findNation(e.target));
    }
    function onPointerOut(e) {
      if (e.pointerType === "mouse") setHovered(null);
    }

    el.addEventListener("pointerover", onPointerOver);
    el.addEventListener("pointerout", onPointerOut);
    return () => {
      el.removeEventListener("pointerover", onPointerOver);
      el.removeEventListener("pointerout", onPointerOut);
    };
  }, [measuringRef]);

  // Apply highlight classes
  useEffect(() => {
    const svg = svgRef.current?.querySelector(".overlay-svg");
    if (!svg) return;
    for (const group of svg.querySelectorAll("[data-nation]")) {
      group.classList.toggle("hovered", group.dataset.nation === hovered);
      group.classList.toggle("selected", group.dataset.nation === selected);
    }
  }, [hovered, selected]);

  // Where the two fingers are: distance apart and midpoint, in viewport coordinates
  function pinchState() {
    const [a, b] = [...pointers.current.values()];
    const rect = containerRef.current.getBoundingClientRect();
    return {
      dist: Math.hypot(a.x - b.x, a.y - b.y),
      x: (a.x + b.x) / 2 - rect.left,
      y: (a.y + b.y) / 2 - rect.top,
    };
  }

  const cancelPressTimer = () => {
    clearTimeout(pressTimer.current);
    pressTimer.current = 0;
  };

  // Pan with one pointer, pinch-zoom with two. Window-level pointer events (no pointer
  // capture needed), so a drag can leave the map
  useEffect(() => {
    function onPointerMove(e) {
      if (e.pointerType === "mouse") {
        const overMap = containerRef.current.contains(e.target);
        lastPointer.current = overMap ? { x: e.clientX, y: e.clientY } : null;
        if (measuringRef.current && !hasDragged.current) {
          // No live preview while the mouse is over the controls
          setCursor(overMap ? toMapPoint(e.clientX, e.clientY) : null);
        }
        // The climate under the mouse; none while it is over the controls
        readClimate(overMap ? toMapPoint(e.clientX, e.clientY) : null);
        if (overMap) tipRef.current?.moveTo(e.clientX, e.clientY);
      }
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pressingRef.current) {
        // A held finger scrubs the climate readout instead of panning
        readClimate(toMapPoint(e.clientX, e.clientY));
        tipRef.current?.moveTo(e.clientX, e.clientY);
        return;
      }

      if (pinch.current) {
        // The map follows the midpoint and scales with the finger distance
        const prev = pinch.current;
        const now = pinchState();
        pinch.current = now;
        if (!prev.dist) return;
        updateTransform((t) =>
          zoomAt(
            { ...t, x: t.x + now.x - prev.x, y: t.y + now.y - prev.y },
            now.x,
            now.y,
            now.dist / prev.dist,
            minScale()
          )
        );
        return;
      }

      const origin = pointerOrigin.current;
      const dx = e.clientX - origin.x;
      const dy = e.clientY - origin.y;
      if (Math.abs(dx) > origin.threshold || Math.abs(dy) > origin.threshold) {
        hasDragged.current = true;
        cancelPressTimer(); // a finger that moves is a pan, not a long press
      }
      updateTransform((t) => ({
        ...t,
        x: e.clientX - panStart.current.x,
        y: e.clientY - panStart.current.y,
      }));
    }

    function onPointerUp(e) {
      if (!pointers.current.delete(e.pointerId)) return;
      cancelPressTimer();
      pinch.current = null;
      if (pointers.current.size > 0) {
        // One finger of a pinch is left: it carries on as a pan from where it is now
        const [p] = [...pointers.current.values()];
        const t = transformRef.current;
        panStart.current = { x: p.x - t.x, y: p.y - t.y };
        return;
      }
      const wasDrag = hasDragged.current;
      hasDragged.current = false;
      if (pressingRef.current) {
        // The finger lifts off a climate readout: it stays put until the next touch
        endPress();
        return;
      }
      if (wasDrag || e.type === "pointercancel") return;
      if (measuringRef.current) {
        addPoint(toMapPoint(e.clientX, e.clientY), { x: e.clientX, y: e.clientY });
        return;
      }
      // It was a click — check what's under cursor
      const elements = document.elementsFromPoint(e.clientX, e.clientY);
      for (const elem of elements) {
        const nationId = findNation(elem);
        if (nationId) {
          lastTap.current = { x: e.clientX, y: e.clientY };
          setSelected(nationId);
          return;
        }
      }
      setSelected(null);
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [measuringRef, setCursor, addPoint, readClimate, pressingRef, endPress]);

  // Ease the next change of view instead of jumping. React leaves this style alone, as it is
  // not part of the element's style prop
  function setGlide(on) {
    mapRef.current.style.transition = on ? "transform 0.25s ease" : "";
  }

  // On a phone the nation panel is a sheet over the lower part of the map. A nation tapped
  // down there would end up behind it, so the map glides up until it shows above the sheet
  useEffect(() => {
    const panel = containerRef.current.parentElement.querySelector(".nation-panel");
    const tap = lastTap.current;
    lastTap.current = null;
    const isSheet = !!panel && panel.offsetWidth >= viewSize.current.w; // not the side panel
    const before = sheetHeight.current;
    // The map may scroll up as far as the sheet covers it, and settles back once it closes
    sheetHeight.current = isSheet ? panel.offsetHeight : 0;
    if (!before && !sheetHeight.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const sheetTop = rect.height - sheetHeight.current;
    const tapY = tap ? tap.y - rect.top : 0;
    setGlide(true);
    updateTransform((t) => (tapY > sheetTop - 60 ? { ...t, y: t.y - (tapY - sheetTop / 2) } : t));
    const timer = setTimeout(setGlide, 300, false);
    return () => clearTimeout(timer);
  }, [selected]);

  // WASD / arrow keys: the view travels that way, so the map slides the other way
  useKeyboardPan((dx, dy, seconds) => {
    keyPanned.current = true;
    updateTransform((t) => ({
      ...t,
      x: t.x - dx * KEY_PAN_SPEED * seconds,
      y: t.y - dy * KEY_PAN_SPEED * seconds,
    }));
  });

  // The browser sends no mouseover when the map slides under a still pointer, so after a
  // keyboard pan look up what is under it now
  useEffect(() => {
    if (!keyPanned.current) return;
    keyPanned.current = false;
    const at = lastPointer.current;
    if (!at) return;
    readClimate(toMapPoint(at.x, at.y));
    if (measuringRef.current) {
      setCursor(toMapPoint(at.x, at.y));
      return;
    }
    setHovered(findNation(document.elementFromPoint(at.x, at.y)));
  }, [transform, measuringRef, setCursor, readClimate]);

  function onPointerDown(e) {
    if (pointers.current.size >= 2) return; // a third finger is ignored
    setGlide(false);
    cancelPressTimer();
    // Any new touch takes a pinned climate readout off the screen
    if (e.pointerType !== "mouse" && (climate.pinned || climate.pressing)) climate.clear();
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      // A pinch never ends as a tap, whichever finger lifts last
      hasDragged.current = true;
      pinch.current = pinchState();
      return;
    }
    hasDragged.current = false;
    pointerOrigin.current = { x: e.clientX, y: e.clientY, threshold: clickThreshold(e.pointerType) };
    const t = transformRef.current;
    panStart.current = { x: e.clientX - t.x, y: e.clientY - t.y };
    // A finger held still with Climate on brings up the readout above it (touch has no hover)
    if (e.pointerType !== "mouse" && climate.enabled && !measuringRef.current) {
      const { clientX, clientY } = e;
      pressTimer.current = setTimeout(() => {
        pressTimer.current = 0;
        hasDragged.current = true; // the lift must not count as a tap
        climate.startPress();
        readClimate(toMapPoint(clientX, clientY));
        tipRef.current?.moveTo(clientX, clientY);
      }, LONG_PRESS_MS);
    }
  }

  // Zoom
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function onWheel(e) {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      updateTransform((t) => zoomAt(t, mouseX, mouseY, zoomFactor, minScale()));
      // The map moved under the still mouse
      readClimate(toMapPoint(e.clientX, e.clientY));
    }
    // A long press on Android would otherwise open the context menu
    const onContextMenu = (e) => e.preventDefault();

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("contextmenu", onContextMenu);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("contextmenu", onContextMenu);
    };
  }, [readClimate]);

  const toPolyline = (line) => line.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  // Keep strokes, markers and labels a constant size on screen
  const px = 1 / transform.scale;

  return (
    <div className={"map-container" + (measuring ? " measuring" : "")}>
      <div
        className="map-viewport"
        ref={containerRef}
        onPointerDown={onPointerDown}
      >
        <div
          className="map-transform"
          ref={mapRef}
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            visibility: fitted ? undefined : "hidden",
          }}
        >
          {WORLD_COPIES.map((dx) => (
            <div key={dx} className="map-world" style={{ left: dx }}>
              <img src={BASE_MAP} alt={dx ? "" : "Eurth map"} className="map-bg" draggable={false} />
              {imageLayers(overlays).map(({ src, box }) => (
                <img
                  key={src}
                  src={src}
                  alt=""
                  className="map-layer"
                  draggable={false}
                  style={box ? { left: box.x, top: box.y, width: box.width, height: box.height } : undefined}
                />
              ))}
            </div>
          ))}
          <div ref={svgRef} className="map-overlay" />
          {measuring && (
            <svg className="measure-svg" viewBox={`${-MAP_WIDTH} 0 ${3 * MAP_WIDTH} ${MAP_HEIGHT}`}>
              {ring &&
                // Once per world copy, plus one further out each way: the outline can run past the
                // antimeridian. Kept out of the copies below so that no two fills stack
                [-2, -1, 0, 1, 2].map((n) => (
                  <polygon
                    key={n}
                    className="measure-fill"
                    points={toPolyline(ring.outline)}
                    transform={`translate(${n * MAP_WIDTH} 0)`}
                  />
                ))}
              {WORLD_COPIES.map((copyDx) => (
                <g key={copyDx} transform={`translate(${copyDx} 0)`}>
                  {drawn.map((seg, i) => (
                    <g key={i} className={seg.isPreview ? "measure-preview" : ""}>
                      {seg.lines.map((line, j) => (
                        <g key={j}>
                          <polyline className="measure-halo" points={toPolyline(line)} strokeWidth={5 * px} />
                          <polyline
                            className="measure-line"
                            points={toPolyline(line)}
                            strokeWidth={2.5 * px}
                            strokeDasharray={seg.isPreview ? `${8 * px} ${6 * px}` : undefined}
                          />
                        </g>
                      ))}
                      <text
                        className="measure-label"
                        x={seg.mid.x}
                        y={seg.mid.y - 8 * px}
                        fontSize={13 * px}
                        strokeWidth={3 * px}
                      >
                        {formatDistance(seg.km, unit)}
                      </text>
                    </g>
                  ))}
                  {points.map((p, i) => (
                    <circle key={i} className="measure-point" cx={p.x} cy={p.y} r={5 * px} strokeWidth={2 * px} />
                  ))}
                </g>
              ))}
            </svg>
          )}
        </div>
      </div>

      <MeasureControls m={m} hint={`${COARSE_POINTER ? "Tap" : "Click"} the map to place points. Drag to pan.`} />

      <HoverTooltip
        ref={tipRef}
        nation={hovered && !selected ? nations[hovered].name : null}
        zone={climate.zone}
        touch={climate.pressing || climate.pinned}
      />
      {climate.enabled && <ClimateCard zone={climate.lastZone} />}

      <NationPanel
        nationKey={selected}
        nation={selected ? nations[selected] : null}
        landArea={selected ? landAreaOf(selected) : null}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

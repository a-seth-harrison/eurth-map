import { useState, useEffect, useRef, useMemo } from "react";
import Globe from "globe.gl";
import { CanvasTexture, SRGBColorSpace, ShaderChunk, MeshBasicMaterial, DoubleSide } from "three";
import nations from "../data/nations";
import { landAreaOf } from "../data/landArea";
import NationPanel from "./NationPanel";
import MeasureControls from "./MeasureControls";
import useMeasurement from "../hooks/useMeasurement";
import useKeyboardPan from "../hooks/useKeyboardPan";
import useClimateReadout, { LONG_PRESS_MS } from "../hooks/useClimateReadout";
import HoverTooltip from "./HoverTooltip";
import ClimateCard from "./ClimateCard";
import { MAP_WIDTH, pixelToLonLat, lonLatToPixel } from "../utils/geo";
import { OVERLAYS, GRAYSCALE, baseMap, imageLayers } from "../data/layers";
import { memberColors } from "../data/organizations";
import { stripeMaterial, disposeStripeMaterials } from "../utils/stripeMaterial";
import { formatDistance } from "../utils/format";
import { COARSE_POINTER } from "../utils/device";

// Same red as the flat map highlight (App.css)
const DEFAULT_COLOR = "#d81e1e"; // nations without a `color` in nations.js; same as App.css
const HOVER_OPACITY = 0.35;
const SELECTED_OPACITY = 0.5;
// Members of an enabled organization, idle and under the cursor; same as .org in App.css
const ORG_OPACITY = 0.6;
const ORG_HOVER_OPACITY = 0.7;

function rgba(hex, opacity) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

const highlightColor = (id, opacity) => rgba(nations[id]?.color ?? DEFAULT_COLOR, opacity);

const CLEAR = "rgba(0, 0, 0, 0)";
// The cap of a nation that is not lit. three.js skips a material that is not visible but
// still raycasts against it, so hover and click work while nothing is drawn. With a clear
// colour instead, every piece of every nation was a draw call each frame (about 1,500)
const HIDDEN_CAP = new MeshBasicMaterial({ visible: false, side: DoubleSide });
const MEASURE_FILL_OPACITY = 0.3;
// Heights above the surface, in globe radii. Anything drawn above the map shifts against it
// when seen from the side, so these are as low as they can go: the highlight sits 0.03 units
// up (about 2 km on Eurth), where the shift is under a pixel. That takes caps that follow
// the sphere closely (CAP_RESOLUTION) and a near plane that follows the camera (see below)
const NATION_ALT = 0.0003;
const MEASURE_FILL_ALT = 0.0004;
const MEASURE_LINE_ALT = 0.0005;
const GLOBE_RADIUS = 100; // globe.gl's own unit
const CAP_RESOLUTION = 1; // degrees between cap vertices: a flat facet dips 0.004 units at most
const KM_PER_DEGREE = 111.19;
// A finger wobbles more than a mouse before it counts as a drag
const clickThreshold = (pointerType) => (pointerType === "mouse" ? 5 : 10);
const KEY_TURN_RATE = 30; // degrees per second, per unit of camera altitude (globe radii)
// The texture is the full 8000 px everywhere (~170 MB with mipmaps): at half width the text
// was visibly soft. Some iPhones refuse a canvas that large; composeTexture then halves it
const MIN_TEXTURE_WIDTH = MAP_WIDTH / 2;
const MAX_KEY_LAT = 85; // the keys stop short of the poles, where left/right would only spin the view
// The GPU picks a mipmap level on the blurry side, which softens the map's small text next
// to the flat map (where the browser scales the <img>). A negative bias samples a sharper
// level; much below -1 the text starts to shimmer while the globe turns
const TEXTURE_LOD_BIAS = -0.7;

const imageCache = new Map();
function loadImage(src) {
  if (!imageCache.has(src)) {
    const img = new Image();
    img.src = src;
    imageCache.set(src, img.decode().then(() => img));
  }
  return imageCache.get(src);
}

// The globe takes a single texture, so the base map, legend and image overlays are flattened
// into one canvas. maxSize is the GPU's texture limit (below 8000 on some phones).
async function composeTexture(layers, maxSize) {
  const images = await Promise.all(layers.map((layer) => loadImage(layer.src)));
  let width = Math.min(MAP_WIDTH, maxSize);
  for (;;) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = width / 2;
    const scale = width / MAP_WIDTH;
    const ctx = canvas.getContext("2d");
    layers.forEach(({ box }, i) => {
      if (box) ctx?.drawImage(images[i], box.x * scale, box.y * scale, box.width * scale, box.height * scale);
      else ctx?.drawImage(images[i], 0, 0, canvas.width, canvas.height);
    });
    // Over Safari's canvas limit there is no context, or it silently draws nothing. The
    // base map is opaque everywhere, so a transparent pixel means the canvas failed
    if (ctx && ctx.getImageData(width / 2, width / 4, 1, 1).data[3] > 0) return canvas;
    canvas.width = canvas.height = 0;
    if (width <= MIN_TEXTURE_WIDTH) return canvas;
    width = MIN_TEXTURE_WIDTH;
  }
}

// An area ring as a polygon feature (they share polygonsData with the nations; `measureColor`
// tells them apart). globe.gl wants clockwise rings (see the loader below). One feature per
// outline, so a finished area keeps its identity and globe.gl does not rebuild it
const measureFeatures = new WeakMap();
function measureFeature({ outline, color }) {
  let feature = measureFeatures.get(outline);
  if (!feature) {
    feature = { measureColor: rgba(color, MEASURE_FILL_OPACITY), geometry: { type: "Polygon", coordinates: [lonLatRing(outline)] } };
    measureFeatures.set(outline, feature);
  }
  return feature;
}

function lonLatRing(outline) {
  const ring = outline.map((p) => {
    const { lon, lat } = pixelToLonLat(p);
    return [lon, lat];
  });
  ring.push(ring[0]);
  let signed = 0;
  for (let i = 1; i < ring.length; i++) {
    signed += ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1];
  }
  if (signed > 0) ring.reverse();
  return ring;
}

// Markers and labels are DOM elements, so they stay the same size at any zoom
function measureElement(d) {
  const el = document.createElement("div");
  el.className = d.text ? "globe-measure-label" : "globe-measure-point";
  if (d.text) el.textContent = d.text;
  else el.style.background = d.color;
  return el;
}

export default function GlobeViewer({ overlays }) {
  const [selected, setSelected] = useState(null);
  const [hovered, setHovered] = useState(null);
  const containerRef = useRef(null);
  const globeRef = useRef(null);
  const stateRef = useRef({ hovered: null, selected: null, orgColors: {} });
  const nationFeatures = useRef([]);
  const m = useMeasurement({
    onEnter: () => {
      setSelected(null);
      setHovered(null);
    },
  });
  // Keyed on the image switches only (overlays and grayscale): an organization toggle must
  // not recompose the texture
  const imageKey = [...OVERLAYS, GRAYSCALE].filter((o) => overlays[o.id]).map((o) => o.id).join(",");
  const textureLayers = useMemo(() => {
    const on = Object.fromEntries(imageKey.split(",").filter(Boolean).map((id) => [id, true]));
    return [{ src: baseMap(on) }, ...imageLayers(on)];
  }, [imageKey]);
  const orgColors = useMemo(() => memberColors(overlays), [overlays]);
  const { measuring, measuringRef, addPoint, setCursor, unit, rings, drawn, markers } = m;
  const climate = useClimateReadout(!!overlays.climate);
  const climateRef = useRef(climate); // for the handlers inside the globe effect
  const tipRef = useRef(null); // HoverTooltip: moveTo(clientX, clientY)
  const lastMouse = useRef(null); // client position while the mouse is over the globe
  useEffect(() => {
    climateRef.current = climate;
  });

  // Screen position -> map pixel, or null off the globe
  function screenToMap(clientX, clientY) {
    const globe = globeRef.current;
    if (!globe) return null;
    const rect = containerRef.current.getBoundingClientRect();
    const coords = globe.toGlobeCoords(clientX - rect.left, clientY - rect.top);
    return coords ? lonLatToPixel({ lon: coords.lng, lat: coords.lat }) : null;
  }

  // Create the globe once; it lives outside React
  useEffect(() => {
    const el = containerRef.current;
    let pointerType = "mouse"; // of the latest pointer event on the globe
    let suppressClick = false; // a long press ends with a click that must not select anything
    let pressTimer = 0;
    const globe = new Globe(el, { animateIn: false })
      .width(el.clientWidth)
      .height(el.clientHeight)
      .backgroundColor("#1a1a2e")
      .atmosphereColor("#9fd4ff")
      .atmosphereAltitude(0.12)
      // No sides and no outline: at this height they would not show, and each is geometry to
      // draw and to raycast
      .polygonSideColor(() => null)
      .polygonStrokeColor(() => null)
      .polygonCapColor(() => CLEAR)
      .polygonCapMaterial(() => HIDDEN_CAP)
      .polygonsTransitionDuration(0)
      .polygonAltitude((feature) => (feature.measureColor ? MEASURE_FILL_ALT : NATION_ALT))
      .polygonCapCurvatureResolution(CAP_RESOLUTION)
      // Only a mouse hovers: globe.gl also reports a hover on every tap, and the highlight
      // would stay behind
      .onPolygonHover((feature) => {
        if (!measuringRef.current && pointerType === "mouse") setHovered(feature ? feature.id : null);
      })
      // Measure clicks are handled below, straight from the pointer events
      .onPolygonClick((feature) => {
        if (!measuringRef.current && !suppressClick) setSelected(feature.id);
      })
      .onGlobeClick(() => {
        if (!measuringRef.current && !suppressClick) setSelected(null);
      })
      .pathPoints("samples")
      .pathPointLat((p) => pixelToLonLat(p).lat)
      .pathPointLng((p) => pixelToLonLat(p).lon)
      .pathPointAlt(MEASURE_LINE_ALT)
      .pathColor((seg) => seg.color)
      .pathStroke(2.5)
      // Dashes are a fraction of the path's length: keep them about 1.5 degrees long
      .pathDashLength((seg) => (seg.isPreview ? Math.min(1, (1.5 * KM_PER_DEGREE) / seg.km) : 1))
      .pathDashGap((seg) => (seg.isPreview ? Math.min(1, KM_PER_DEGREE / seg.km) : 0))
      .pathTransitionDuration(0)
      .htmlLat((d) => pixelToLonLat(d.at).lat)
      .htmlLng((d) => pixelToLonLat(d.at).lon)
      .htmlAltitude(MEASURE_LINE_ALT)
      .htmlElement(measureElement)
      .htmlTransitionDuration(0);
    globe.controls().minDistance = GLOBE_RADIUS + 15;
    globe.controls().zoomSpeed = 2;
    // globe.gl's directional light sits straight above the north pole, so the south was
    // lit by the ambient light alone. Keep it at the camera instead: whatever faces the
    // viewer is lit the same at any latitude
    const sun = globe.lights().find((light) => light.isDirectionalLight);
    const followCamera = () => sun?.position.copy(globe.camera().position);
    followCamera();
    globe.controls().addEventListener("change", followCamera);
    // globe.gl's fixed near plane (0.05) leaves too little depth precision to tell the
    // highlight from the surface under it once zoomed out. Half the distance to the surface
    // keeps them apart at any zoom. Set before every frame, so it can never lag behind the
    // camera and clip the globe
    globe.scene().onBeforeRender = (renderer, scene, camera) => {
      const near = Math.max(0.05, (camera.position.length() - GLOBE_RADIUS) / 2);
      if (near === camera.near) return;
      camera.near = near;
      camera.updateProjectionMatrix();
    };
    globeRef.current = globe;
    if (import.meta.env.DEV) window.__globe = globe; // for poking at it from the console

    const toMapPoint = (e) => screenToMap(e.clientX, e.clientY);

    function cancelPressTimer() {
      clearTimeout(pressTimer);
      pressTimer = 0;
    }
    // The finger lifts off a climate readout: it stays put, the globe turns again, and the
    // click the browser sends for the same touch is ignored
    function finishPress() {
      const c = climateRef.current;
      if (!c.pressingRef.current) return;
      c.endPress();
      globe.controls().enabled = true;
      setTimeout(() => {
        suppressClick = false;
      }, 0);
    }

    // Measure clicks don't go through globe.gl's click callbacks: those depend on its hover
    // state, and the area fill under the pointer is rebuilt on every move
    let downAt = null;
    function onPointerDown(e) {
      pointerType = e.pointerType;
      cancelPressTimer();
      const c = climateRef.current;
      // Any new touch takes a pinned climate readout off the screen
      if (e.pointerType !== "mouse" && (c.pinned || c.pressing)) c.clear();
      // A second finger makes it a pinch, which never places a point
      downAt = e.isPrimary ? { x: e.clientX, y: e.clientY } : null;
      // A finger held still with Climate on brings up the readout above it (touch has no hover).
      // The controls are switched off so that sliding the finger scrubs instead of turning
      if (e.pointerType !== "mouse" && e.isPrimary && c.enabled && !measuringRef.current) {
        const { clientX, clientY } = e;
        pressTimer = setTimeout(() => {
          pressTimer = 0;
          suppressClick = true;
          globe.controls().enabled = false;
          c.startPress();
          c.readAt(screenToMap(clientX, clientY));
          tipRef.current?.moveTo(clientX, clientY);
        }, LONG_PRESS_MS);
      }
    }
    function onPointerUp(e) {
      cancelPressTimer();
      if (climateRef.current.pressingRef.current) {
        downAt = null;
        finishPress();
        return;
      }
      if (!measuringRef.current || !downAt || !e.isPrimary || e.button !== 0) return;
      const threshold = clickThreshold(e.pointerType);
      const dragged = Math.abs(e.clientX - downAt.x) > threshold || Math.abs(e.clientY - downAt.y) > threshold;
      downAt = null;
      const p = dragged ? null : toMapPoint(e);
      if (p) addPoint(p, { x: e.clientX, y: e.clientY });
    }
    function onPointerCancel() {
      cancelPressTimer();
      finishPress();
      downAt = null;
    }

    // Live preview and climate readout: follow the mouse while it is over the globe. A finger
    // only moves while it drags the globe, so it gets neither, unless it is held on a readout
    let frame = 0;
    function onPointerMove(e) {
      pointerType = e.pointerType;
      const c = climateRef.current;
      if (c.pressingRef.current) {
        c.readAt(toMapPoint(e));
        tipRef.current?.moveTo(e.clientX, e.clientY);
        return;
      }
      if (pressTimer && downAt) {
        const threshold = clickThreshold(e.pointerType);
        if (Math.abs(e.clientX - downAt.x) > threshold || Math.abs(e.clientY - downAt.y) > threshold) {
          cancelPressTimer(); // a finger that moves is a drag, not a long press
        }
      }
      if (e.pointerType !== "mouse") return;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const p = toMapPoint(e);
        if (measuringRef.current) setCursor(p);
        c.readAt(p);
        tipRef.current?.moveTo(e.clientX, e.clientY);
      });
    }
    function onPointerLeave() {
      lastMouse.current = null;
      setCursor(null);
      climateRef.current.readAt(null);
    }
    // A long press on Android would otherwise open the context menu
    const onContextMenu = (e) => e.preventDefault();
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerCancel);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerleave", onPointerLeave);
    el.addEventListener("contextmenu", onContextMenu);

    let cancelled = false;
    fetch("/nations.geojson")
      .then((r) => r.json())
      .then((geojson) => {
        if (cancelled) return;
        // Only nations the panel knows about
        const features = geojson.features.filter((f) => nations[f.id]);
        // nations.geojson follows RFC 7946 winding; globe.gl (d3-geo) wants the opposite,
        // otherwise a nation covers everything except itself
        for (const f of features) {
          for (const polygon of f.geometry.coordinates) {
            for (const ring of polygon) ring.reverse();
          }
        }
        nationFeatures.current = features;
        globe.polygonsData(features);
      });

    // An observer rather than window "resize": a phone's toolbars sliding away and a rotation
    // do not always fire that
    const resizeObserver = new ResizeObserver(() => {
      if (el.clientWidth && el.clientHeight) globe.width(el.clientWidth).height(el.clientHeight);
    });
    resizeObserver.observe(el);

    return () => {
      cancelled = true;
      resizeObserver.disconnect();
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerCancel);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerleave", onPointerLeave);
      el.removeEventListener("contextmenu", onContextMenu);
      cancelAnimationFrame(frame);
      cancelPressTimer();
      globe._destructor();
      disposeStripeMaterials();
      el.innerHTML = "";
      globeRef.current = null;
    };
  }, [measuringRef, addPoint, setCursor]);

  // WASD / arrow keys turn the globe. The rate follows the altitude, so the surface crosses
  // the screen at about the same pace at any zoom
  useKeyboardPan((dx, dy, seconds) => {
    const globe = globeRef.current;
    if (!globe) return;
    const { lat, lng, altitude } = globe.pointOfView();
    const degrees = KEY_TURN_RATE * altitude * seconds;
    globe.pointOfView({
      lat: Math.min(Math.max(lat - dy * degrees, -MAX_KEY_LAT), MAX_KEY_LAT),
      lng: lng + dx * degrees,
      altitude,
    });
    // The globe turned under the still mouse
    const at = lastMouse.current;
    if (at) climate.readAt(screenToMap(at.x, at.y));
  });

  // Re-setting the accessors makes globe.gl recolor the polygons. Members of an enabled
  // organization are lit in its colour, a little stronger under the cursor, and turn the
  // plain red when selected (same rule as App.css on the flat map). A member of several is
  // striped: its cap gets a material, which globe.gl uses instead of the cap colour
  useEffect(() => {
    stateRef.current = { hovered, selected, orgColors };
    const globe = globeRef.current;
    if (!globe) return;
    const memberOpacity = (s, id) => (id === s.hovered ? ORG_HOVER_OPACITY : ORG_OPACITY);
    globe.polygonCapMaterial((feature) => {
      const s = stateRef.current;
      const colors = s.orgColors[feature.id];
      if (feature.measureColor || feature.id === s.selected) return undefined;
      if (!colors) return feature.id === s.hovered ? undefined : HIDDEN_CAP;
      if (colors.length < 2) return undefined;
      return stripeMaterial(colors, memberOpacity(s, feature.id));
    });
    globe.polygonCapColor((feature) => {
      const s = stateRef.current;
      const colors = s.orgColors[feature.id];
      if (feature.id === s.selected) {
        return colors ? rgba(DEFAULT_COLOR, SELECTED_OPACITY) : highlightColor(feature.id, SELECTED_OPACITY);
      }
      if (colors) return rgba(colors[0], memberOpacity(s, feature.id));
      if (feature.id === s.hovered) return highlightColor(feature.id, HOVER_OPACITY);
      return feature.measureColor ?? CLEAR;
    });
  }, [hovered, selected, orgColors]);

  // Globe texture: base map + legend + image overlays
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;
    let cancelled = false;
    const capabilities = globe.renderer().capabilities;
    composeTexture(textureLayers, capabilities.maxTextureSize).then((canvas) => {
      if (cancelled) return;
      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      // The map is viewed at a glancing angle near the limb
      texture.anisotropy = capabilities.getMaxAnisotropy();
      // Once the GPU has the texture the canvas is dead weight (128 MB at full size).
      // Only a lost WebGL context would need it again, and then the globe goes blank
      texture.onUpdate = () => {
        canvas.width = canvas.height = 0;
      };
      const material = globe.globeMaterial();
      material.onBeforeCompile = (shader) => {
        // The chunk is still an #include at this point
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <map_fragment>",
          ShaderChunk.map_fragment.replace(
            "texture2D( map, vMapUv )",
            `texture2D( map, vMapUv, ${TEXTURE_LOD_BIAS.toFixed(2)} )`,
          ),
        );
      };
      material.customProgramCacheKey = () => `lod-bias-${TEXTURE_LOD_BIAS}`;
      material.map?.dispose();
      material.map = texture;
      material.color.set("#ffffff");
      material.needsUpdate = true;
    });
    return () => {
      cancelled = true;
    };
  }, [textureLayers]);

  // Measurement lines, markers and labels
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;
    globe.pathsData(drawn);
    globe.htmlElementsData([
      ...markers,
      ...drawn.map((seg) => ({ at: seg.mid, text: formatDistance(seg.km, unit) })),
    ]);
  }, [drawn, markers, unit]);

  // Area fills. The nation features and the finished areas keep their identity, so globe.gl
  // only rebuilds the one being drawn
  useEffect(() => {
    const features = nationFeatures.current;
    if (!globeRef.current || !features.length) return;
    globeRef.current.polygonsData(rings.length ? [...features, ...rings.map(measureFeature)] : features);
  }, [rings]);

  return (
    <div className={"map-container" + (measuring ? " measuring" : "")}>
      <div className="globe-viewport" ref={containerRef} />

      <MeasureControls m={m} hint={`${COARSE_POINTER ? "Tap" : "Click"} the globe to place points. Drag to rotate.`} />

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

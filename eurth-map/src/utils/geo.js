// Geography helpers. The map is a plate carrée projection of an Earth-sized
// globe: 8000x4000 px = 360°x180°. Never measure in pixels.

export const MAP_WIDTH = 8000;
export const MAP_HEIGHT = 4000;
export const RADIUS_KM = 6371;

const RAD = Math.PI / 180;

export function pixelToLonLat({ x, y }) {
  return {
    lon: (x / MAP_WIDTH) * 360 - 180,
    lat: 90 - (y / MAP_HEIGHT) * 180,
  };
}

export function lonLatToPixel({ lon, lat }) {
  return {
    x: ((lon + 180) / 360) * MAP_WIDTH,
    y: ((90 - lat) / 180) * MAP_HEIGHT,
  };
}

// Angular distance in radians between two {lon, lat} points (haversine)
function angularDistance(a, b) {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Great-circle distance in km between two map-pixel points
export function distanceKm(p1, p2) {
  return RADIUS_KM * angularDistance(pixelToLonLat(p1), pixelToLonLat(p2));
}

function toVector({ lon, lat }) {
  const cosLat = Math.cos(lat * RAD);
  return [
    cosLat * Math.cos(lon * RAD),
    cosLat * Math.sin(lon * RAD),
    Math.sin(lat * RAD),
  ];
}

function toLonLat([x, y, z]) {
  return {
    lon: Math.atan2(y, x) / RAD,
    lat: Math.asin(Math.max(-1, Math.min(1, z))) / RAD,
  };
}

// Great-circle path between two map-pixel points, sampled about once per degree.
// Returns { lines, mid, samples }: `lines` is one or more polylines of {x, y} pixels
// (split where the path crosses the antimeridian), `mid` is the halfway point,
// `samples` is the unsplit list of sampled points.
export function greatCirclePath(p1, p2) {
  const a = pixelToLonLat(p1);
  const b = pixelToLonLat(p2);
  const d = angularDistance(a, b);
  if (d < 1e-9) return { lines: [[p1, p2]], mid: p1, samples: [p1, p2] };

  const va = toVector(a);
  const vb = toVector(b);
  const sinD = Math.sin(d);
  const slerp = (t) => {
    const wa = Math.sin((1 - t) * d) / sinD;
    const wb = Math.sin(t * d) / sinD;
    return lonLatToPixel(
      toLonLat([
        wa * va[0] + wb * vb[0],
        wa * va[1] + wb * vb[1],
        wa * va[2] + wb * vb[2],
      ])
    );
  };

  const steps = Math.max(2, Math.ceil(d / RAD));
  const lines = [];
  const samples = [];
  let line = [];
  let prev = null;
  for (let i = 0; i <= steps; i++) {
    // Use the exact endpoints so the curve meets the clicked markers
    const p = i === 0 ? p1 : i === steps ? p2 : slerp(i / steps);
    if (prev && Math.abs(p.x - prev.x) > MAP_WIDTH / 2) {
      // Crossed the antimeridian: end this line at the map edge, restart on the other side
      const unwrappedX = p.x < prev.x ? p.x + MAP_WIDTH : p.x - MAP_WIDTH;
      const edge = unwrappedX > prev.x ? MAP_WIDTH : 0;
      const f = (edge - prev.x) / (unwrappedX - prev.x);
      const yEdge = prev.y + f * (p.y - prev.y);
      line.push({ x: edge, y: yEdge });
      lines.push(line);
      line = [{ x: MAP_WIDTH - edge, y: yEdge }];
    }
    line.push(p);
    samples.push(p);
    prev = p;
  }
  lines.push(line);

  return { lines, mid: slerp(0.5), samples };
}

// Area in km² of the spherical polygon whose vertices are map-pixel points joined by
// great-circle edges. Sums the spherical excess of each edge's triangle with the pole
// (exact for great-circle edges, unlike a pixel or planar lon/lat area).
export function polygonAreaKm2(points) {
  if (points.length < 3) return 0;
  const ring = points.map(pixelToLonLat);
  let excess = 0;
  let lonTurn = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    let dLon = b.lon - a.lon;
    if (dLon > 180) dLon -= 360;
    if (dLon < -180) dLon += 360;
    lonTurn += dLon;
    const ta = Math.tan((a.lat * RAD) / 2);
    const tb = Math.tan((b.lat * RAD) / 2);
    excess += 2 * Math.atan2(Math.tan((dLon * RAD) / 2) * (ta + tb), 1 + ta * tb);
  }
  excess = Math.abs(excess);
  // A ring that goes all the way around in longitude encloses a pole
  if (Math.abs(lonTurn) > 180) excess = Math.abs(2 * Math.PI - excess);
  // Of the two sides of the ring, measure the smaller
  excess = Math.min(excess, 4 * Math.PI - excess);
  return excess * RADIUS_KM ** 2;
}

// Outline of that polygon in map pixels, for filling. x is kept continuous across the
// antimeridian, so it can run past the map edges: draw it again at ±MAP_WIDTH.
export function polygonOutline(points) {
  const outline = [];
  let shift = 0;
  let prev = null;
  for (let i = 0; i < points.length; i++) {
    for (const p of greatCirclePath(points[i], points[(i + 1) % points.length]).samples) {
      if (prev && p.x - prev.x > MAP_WIDTH / 2) shift -= MAP_WIDTH;
      if (prev && p.x - prev.x < -MAP_WIDTH / 2) shift += MAP_WIDTH;
      outline.push({ x: p.x + shift, y: p.y });
      prev = p;
    }
  }
  return outline;
}

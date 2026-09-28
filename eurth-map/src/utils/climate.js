import { CLIMATE_ZONES } from "../data/climates";
import { MAP_WIDTH, MAP_HEIGHT } from "./geo";

// Which climate zone is at a map pixel. The zones are read from the half-size climate
// overlay (4000x2000, the file phones already display): drawn once into a canvas, each pixel
// matched to the nearest zone colour, kept as one byte per pixel (0 = sea, legend box or
// nothing close to a zone colour). 2 map px precision, 8 MB, and the canvas is freed at once.
const GRID_SRC = "/layers/climate-half.webp";
const MIN_ALPHA = 64; // the overlay's zones are at alpha 128, the sea and legend box at 0
const MAX_DISTANCE = 40; // per channel; a colour further from every zone counts as none

let gridPromise = null;

function nearestZone(r, g, b) {
  let best = 0;
  let bestDistance = MAX_DISTANCE + 1;
  CLIMATE_ZONES.forEach((zone, i) => {
    const [zr, zg, zb] = zone.rgb;
    const distance = Math.max(Math.abs(r - zr), Math.abs(g - zg), Math.abs(b - zb));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i + 1;
    }
  });
  return best;
}

async function buildGrid() {
  const img = new Image();
  img.src = GRID_SRC;
  await img.decode();
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const pixels = ctx.getImageData(0, 0, width, height).data;
  canvas.width = canvas.height = 0;

  // The map is flat colours, so the nearest-zone search runs once per distinct colour.
  // The canvas un-premultiplies the half-transparent pixels, which can shift a channel by
  // one or two; the nearest match absorbs that
  const seen = new Map();
  const data = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < data.length; i++, p += 4) {
    if (pixels[p + 3] < MIN_ALPHA) continue;
    const packed = (pixels[p] << 16) | (pixels[p + 1] << 8) | pixels[p + 2];
    let zone = seen.get(packed);
    if (zone === undefined) {
      zone = nearestZone(pixels[p], pixels[p + 1], pixels[p + 2]);
      seen.set(packed, zone);
    }
    data[i] = zone;
  }
  return { width, height, data };
}

// Memoised: the grid is built once per page
export function loadClimateGrid() {
  if (!gridPromise) {
    gridPromise = buildGrid().catch((err) => {
      gridPromise = null; // let a later toggle try again
      throw err;
    });
  }
  return gridPromise;
}

// The zone at a map pixel (8000x4000), or null
export function climateAt(grid, point) {
  if (!grid || !point) return null;
  const x = Math.floor((point.x / MAP_WIDTH) * grid.width);
  const y = Math.floor((point.y / MAP_HEIGHT) * grid.height);
  if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) return null;
  const index = grid.data[y * grid.width + x];
  return index ? CLIMATE_ZONES[index - 1] : null;
}

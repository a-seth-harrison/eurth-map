"""
Build the toggleable raster map layers for the app from the source maps in Overlays/.

Usage (from the project root):
    python overlay-tools/build_layers.py

Writes to eurth-map/public/:
    background.png             geography map WITHOUT its legend (the legend is its own layer, so the
                               climate legend can replace it). Only the review page reads the PNG;
                               the app loads background.webp
    layers/legend-geo.webp     the geography legend, cropped out of the full geography map
    layers/legend-climate.webp the climate legend, cropped out of Eurth-Climate-Key.png
    layers/climate.webp        climate zones; sea and the built-in legend made transparent
    layers/currents.webp       ocean current arrows and names only; land and sea made transparent
    layers/tectonic.webp       plates as a see-through tint, boundaries and names nearly opaque
    apple-touch-icon.png       home-screen icon, a small copy of the middle of the map
and eurth-map/src/data/map-layers.json (where the legend crops sit on the map).

Every overlay wider than HALF_ABOVE also gets a half-size "-half.webp" copy, which phones load
instead (src/data/layers.js): a quarter of the memory, and iOS closes tabs that use too much.
The base map has no half copy: its text is what people read, so every device loads it full size.

Opacity is baked into the images so the flat map (stacked <img>) and the globe (one composited
texture) look the same. Change the constants below and re-run to tune it.
"""

import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "Overlays"
GEO_MAP = ROOT / "Eurth-Geography-Map-10-3-2026.png"
GEO_MAP_NO_LEGEND = SRC / "Eurth-Geography-Map-10-3-2026 No Legend.png"
CLIMATE_MAP = SRC / "Eurth-Climate-Map.png"
CLIMATE_KEY = SRC / "Eurth-Climate-Key.png"
CURRENTS_MAP = SRC / "Ocean_currents_of_Eurth.png"
TECTONIC_MAP = SRC / "Tectonic_plates_of_Eurth.png"
PUBLIC = ROOT / "eurth-map" / "public"
LAYERS = PUBLIC / "layers"
MANIFEST = ROOT / "eurth-map" / "src" / "data" / "map-layers.json"

CLIMATE_OPACITY = 0.5
CLIMATE_SEA = (28, 28, 28)          # flat background colour of the climate map
CURRENTS_OPACITY = 0.9
CURRENTS_BACKGROUND = [(219, 227, 236), (243, 197, 167), (232, 142, 92), (255, 255, 255)]  # sea, land, coast, tropics
CURRENTS_INK = [(0, 0, 0), (255, 0, 0), (0, 15, 255)]                                      # neutral, warm, cold
TECTONIC_FILL_OPACITY = 0.45
TECTONIC_INK_OPACITY = 0.9
HALF_ABOVE = 4000          # px; wider overlays also get a half-size copy for phones
BASE_MAP_QUALITY = 90      # lossy WebP; the overlays are lossless (flat colours, clean alpha edges)


def write_webp(img, path, **options):
    img.save(path, "WEBP", method=6, **options)
    print(f"  {path.name:26s} {img.width}x{img.height}  {path.stat().st_size / 1024:.0f} KB")


def halved(img):
    # The overlays are flat colours: nearest-neighbour keeps them flat, which lossless WebP packs
    # ten times smaller than smoothed edges, and no colour bleeds in from transparent pixels
    return img.resize((img.width // 2, img.height // 2), Image.NEAREST)


def save(arr, name):
    img = Image.fromarray(arr, "RGBA")
    write_webp(img, LAYERS / f"{name}.webp", lossless=True)
    if img.width > HALF_ABOVE:
        write_webp(halved(img), LAYERS / f"{name}-half.webp", lossless=True)


def build_base_map():
    shutil.copyfile(GEO_MAP_NO_LEGEND, PUBLIC / "background.png")
    print("  background.png             <- " + GEO_MAP_NO_LEGEND.name)
    img = Image.open(GEO_MAP_NO_LEGEND).convert("RGB")
    write_webp(img, PUBLIC / "background.webp", quality=BASE_MAP_QUALITY)
    side = img.height
    left = (img.width - side) // 2
    img.crop((left, 0, left + side, side)).resize((180, 180), Image.LANCZOS).save(PUBLIC / "apple-touch-icon.png")


def build_legends():
    """Crop both legends to the same box: wherever the two geography maps differ."""
    full = np.array(Image.open(GEO_MAP).convert("RGB")).astype(int)
    bare = np.array(Image.open(GEO_MAP_NO_LEGEND).convert("RGB")).astype(int)
    ys, xs = np.where(np.abs(full - bare).max(axis=2) > 0)
    x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1

    geo = np.dstack([full[y0:y1, x0:x1], np.full((y1 - y0, x1 - x0), 255)]).astype(np.uint8)
    save(geo, "legend-geo")

    key = np.array(Image.open(CLIMATE_KEY).convert("RGBA"))
    kys, kxs = np.where(key[..., 3] > 0)
    if kxs.min() < x0 or kys.min() < y0 or kxs.max() >= x1 or kys.max() >= y1:
        print("  WARNING: the climate key is not inside the geography legend's box")
    save(key[y0:y1, x0:x1], "legend-climate")
    return {"x": x0, "y": y0, "width": x1 - x0, "height": y1 - y0}


def build_climate(legend):
    rgb = np.array(Image.open(CLIMATE_MAP).convert("RGB"))
    sea = (np.abs(rgb.astype(int) - CLIMATE_SEA).max(axis=2) <= 6)
    alpha = np.where(sea, 0, round(255 * CLIMATE_OPACITY)).astype(np.uint8)
    # the legend drawn on the climate map itself is replaced by legend-climate.webp
    alpha[legend["y"]:legend["y"] + legend["height"], legend["x"]:legend["x"] + legend["width"]] = 0
    save(np.dstack([rgb, alpha]), "climate")
    # The zone colours the app's climate readout matches (eurth-map/src/data/climates.js lists
    # them, in legend order). A repainted map has to be carried over there
    zones = rgb[alpha > 0]
    colours, counts = np.unique(zones.reshape(-1, 3), axis=0, return_counts=True)
    main = [(tuple(int(v) for v in c), int(n)) for c, n in zip(colours, counts) if n >= 1000]
    main.sort(key=lambda item: -item[1])
    print(f"  zone colours ({len(main)} with 1000+ px; climates.js must list these):")
    for colour, n in main:
        print(f"    {colour}  {n} px")


def build_currents():
    """Keep only the arrows and names. Each pixel is treated as a mix of one background colour
    and one other colour; if the other colour is an ink, its share becomes the alpha, which keeps
    the anti-aliased edges clean."""
    rgb = np.array(Image.open(CURRENTS_MAP).convert("RGB")).astype(np.float32)
    best_err = np.full(rgb.shape[:2], np.inf, dtype=np.float32)
    out = np.zeros(rgb.shape[:2] + (4,), dtype=np.float32)
    targets = [(k, True) for k in CURRENTS_INK] + [(k, False) for k in CURRENTS_BACKGROUND]
    for bg in CURRENTS_BACKGROUND:
        b = np.array(bg, dtype=np.float32)
        for colour, is_ink in targets:
            k = np.array(colour, dtype=np.float32)
            if np.allclose(k, b):
                continue
            share = np.clip(((rgb - b) @ (k - b)) / ((k - b) @ (k - b)), 0, 1)
            err = np.linalg.norm(rgb - (share[..., None] * k + (1 - share[..., None]) * b), axis=2)
            better = err < best_err - 1e-3
            best_err[better] = err[better]
            out[better, :3] = k
            out[better, 3] = share[better] if is_ink else 0
    out[..., 3] = np.where(out[..., 3] < 0.15, 0, out[..., 3]) * 255 * CURRENTS_OPACITY
    save(out.round().astype(np.uint8), "currents")


def build_tectonic():
    rgb = np.array(Image.open(TECTONIC_MAP).convert("RGB"))
    # black boundaries and plate names stay readable; the coloured plates become a tint
    darkness = np.clip((110 - rgb.max(axis=2).astype(np.float32)) / 50, 0, 1)
    alpha = TECTONIC_FILL_OPACITY + (TECTONIC_INK_OPACITY - TECTONIC_FILL_OPACITY) * darkness
    save(np.dstack([rgb, (alpha * 255).round().astype(np.uint8)]), "tectonic")


def main():
    LAYERS.mkdir(parents=True, exist_ok=True)
    build_base_map()
    legend = build_legends()
    build_climate(legend)
    build_currents()
    build_tectonic()
    MANIFEST.write_text(json.dumps({"legend": legend}, indent=2) + "\n", encoding="utf-8")
    print(f"  legend box: {legend}")


if __name__ == "__main__":
    main()

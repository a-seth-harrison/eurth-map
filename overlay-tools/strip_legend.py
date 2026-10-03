"""
Make the "No Legend" copy of a new geography map from the previous legend / no-legend pair.

Usage (from the project root):
    python overlay-tools/strip_legend.py NEW_MAP.png OLD_MAP.png "OLD_MAP No Legend.png" "NEW_MAP No Legend.png"

Every pixel where the old map and its no-legend copy differ is legend; those pixels are taken from
the old no-legend copy (the terrain under the legend cannot be seen on the new map), everything
else from the new map. So a legend that changed only inside its panel (e.g. the colophon date)
needs nothing by hand; a legend panel that moved or grew needs a new no-legend export instead.
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

Image.MAX_IMAGE_PIXELS = None
NEAR_PX = 6     # a changed pixel this close to the old legend's pixels is legend ink too


def main(new_map, old_map, old_bare, out):
    new = np.array(Image.open(new_map).convert("RGB"))
    old = np.array(Image.open(old_map).convert("RGB"))
    bare = np.array(Image.open(old_bare).convert("RGB"))
    if not new.shape == old.shape == bare.shape:
        sys.exit(f"sizes differ: {new.shape} {old.shape} {bare.shape}")
    legend = (old != bare).any(axis=2)
    ys, xs = np.nonzero(legend)
    x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    print(f"legend box {x0},{y0}-{x1},{y1}: {legend.sum()} px")
    # Text that sits straight on the terrain (the colophon) is legend too, but a new wording covers
    # other pixels than the old one did: anything that changed next to legend pixels counts as legend
    changed = (new != old).any(axis=2)
    near = ndimage.binary_dilation(legend, iterations=NEAR_PX)
    retyped = changed & near & ~legend
    print(f"changed pixels next to the legend, taken as legend too: {retyped.sum()}")
    legend |= retyped
    stray = changed[y0:y1, x0:x1] & ~legend[y0:y1, x0:x1]
    print(f"other pixels changed inside the legend box (kept from the new map): {stray.sum()}")
    result = np.where(legend[..., None], bare, new)
    Image.fromarray(result.astype(np.uint8), "RGB").save(out, optimize=True)
    print(f"wrote {out}")


if __name__ == "__main__":
    if len(sys.argv) != 5:
        sys.exit(__doc__)
    main(*map(Path, sys.argv[1:]))

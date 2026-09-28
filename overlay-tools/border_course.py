"""Snap a rough course to the geography map's red border line and report every hole in it.

    python overlay-tools/border_course.py X,Y X,Y X,Y ...

Give a few points along a border, each within 8 px of the red line (read them off the map). The
script follows the red line between them and prints:
  patches  - one polyline per stretch where the red line is missing (a river, a flag or a label
             drawn over it), ready to paste into border-patches.json
  eraser   - the snapped line itself, to paste into border-erasers.json when the blank map's old
             border runs beside this line (the eraser is 15 px wide; use {"line": ..., "width": 21}
             for one that sits up to 10 px off)
Straight patches across a hole are right for holes up to ~30 px; check longer ones by eye.
"""
import sys, json
import numpy as np, cv2
from PIL import Image
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_overlays as bo
geo = np.array(Image.open(bo.GEO_MAP).convert("RGB")).astype(np.int32)
r, g, b = geo[:, :, 0], geo[:, :, 1], geo[:, :, 2]
red = ((r > 100) & (g < 75) & (b < 75) & (r - g > 55)).astype(np.uint8)
blobs = cv2.morphologyEx(red, cv2.MORPH_OPEN, np.ones((4, 4), np.uint8))
lines = red & (1 - cv2.dilate(blobs, np.ones((7, 7), np.uint8)))
def sample(pts):
    out = []
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        n = max(abs(x1 - x0), abs(y1 - y0), 1)
        out += [(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n) for i in range(n)]
    return out + [tuple(pts[-1])]
def nearest(x, y, R):
    x, y = int(round(x)), int(round(y)); win = lines[y - R:y + R + 1, x - R:x + R + 1]
    ys, xs = np.nonzero(win)
    if not len(ys): return None
    k = np.argmin((ys - R) ** 2 + (xs - R) ** 2); return (int(x + xs[k] - R), int(y + ys[k] - R))
def refine(course, snap_r=8, gap_r=2, min_gap=3):
    s = sample(course); snapped = [nearest(x, y, snap_r) for x, y in s]
    idx = [i for i, p in enumerate(snapped) if p]
    pts = []
    for i in range(len(s)):
        if snapped[i]: pts.append(snapped[i]); continue
        before = max([j for j in idx if j < i], default=None); after = min([j for j in idx if j > i], default=None)
        if before is None and after is None: pts.append((int(round(s[i][0])), int(round(s[i][1])))); continue
        if before is None: pts.append((int(round(s[i][0])), int(round(s[i][1])))); continue  # course start before any red
        if after is None: pts.append((int(round(s[i][0])), int(round(s[i][1])))); continue    # course end after the last red
        t = (i - before) / (after - before); pa, pb = snapped[before], snapped[after]
        pts.append((int(round(pa[0] + (pb[0] - pa[0]) * t)), int(round(pa[1] + (pb[1] - pa[1]) * t))))
    # dedupe consecutive, then scan for gaps at 2 px
    line = [pts[0]] + [p for a, p in zip(pts, pts[1:]) if p != a]
    fine = sample(line); has = [nearest(x, y, gap_r) is not None for x, y in fine]
    patches, i = [], 0
    while i < len(fine):
        if not has[i]:
            j = i
            while j < len(fine) and not has[j]: j += 1
            if j - i >= min_gap:
                a = max(i - 2, 0); bpt = min(j + 1, len(fine) - 1)
                seg = [fine[k] for k in range(a, bpt + 1, 6)] + [fine[bpt]]
                patches.append([[int(round(x)), int(round(y))] for x, y in seg])
            i = j
        else: i += 1
    eraser = [list(p) for p in line[::6]] + [list(line[-1])]
    return eraser, patches
if __name__ == "__main__":
    course = [tuple(map(int, p.split(","))) for p in sys.argv[1:]]
    if len(course) < 2: sys.exit(__doc__)
    eraser, patches = refine(course, gap_r=1, min_gap=1)
    print(f"{len(patches)} hole(s) in the red line")
    print("patches:", json.dumps(patches))
    print("eraser: ", json.dumps(eraser))

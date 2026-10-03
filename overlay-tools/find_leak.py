"""Find where a region leaks through a gap in its border.

    python overlay-tools/find_leak.py X1 Y1 X2 Y2

Give one map-pixel point on each side of the border that should separate them (both currently in
the same region of out/labels.png). Prints the narrowest spot of the widest route between the two
points: that is the gap. Close it with a polyline in border-patches.json, rebuild, and run again
until the points are in different regions.
"""
import heapq
import sys

import cv2

import build_overlays as bo


def find_leak(a, b):
    labels = cv2.imread(str(bo.OUT / "labels.png"), cv2.IMREAD_UNCHANGED)
    ra, rb = bo.region_at(labels, *a), bo.region_at(labels, *b)
    if not ra or not rb:
        return "one of the points is not on land"
    if ra != rb:
        return f"no leak: the points are in different regions ({ra} and {rb})"
    mask = (labels == ra).astype("uint8")
    x, y, w, h = cv2.boundingRect(mask)
    width = cv2.distanceTransform(mask[y:y + h, x:x + w], cv2.DIST_L2, 3)   # distance to the nearest border
    start, goal = (a[1] - y, a[0] - x), (b[1] - y, b[0] - x)
    # widest-path search: always extend the route whose narrowest point so far is the widest
    best, prev, heap = {start: width[start]}, {start: None}, [(-width[start], start)]
    while heap:
        neg, cell = heapq.heappop(heap)
        if cell == goal:
            break
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            n = (cell[0] + dy, cell[1] + dx)
            if 0 <= n[0] < h and 0 <= n[1] < w and width[n] > 0:
                through = min(-neg, width[n])
                if through > best.get(n, 0):
                    best[n], prev[n] = through, cell
                    heapq.heappush(heap, (-through, n))
    path, cell = [], goal
    while cell:
        path.append(cell)
        cell = prev[cell]
    narrowest = min(width[c] for c in path)
    # The route is as wide as its narrowest spot and no wider, so it may brush past other borders at
    # that same clearance: report every spot that narrow (at most one per 40 px), the gap is one of them
    spots = []
    for c in path:
        if width[c] <= narrowest + 0.5 and not any(abs(c[0] - s[0]) + abs(c[1] - s[1]) < 40 for s in spots):
            spots.append(c)
    where = ", ".join(f"({c[1] + x}, {c[0] + y})" for c in spots)
    return f"region {ra} leaks through a gap about {2 * narrowest:.0f} px wide, at one of: {where}"


if __name__ == "__main__":
    x1, y1, x2, y2 = (int(v) for v in sys.argv[1:5])
    print(find_leak((x1, y1), (x2, y2)))

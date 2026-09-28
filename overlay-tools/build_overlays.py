"""
Build nation overlay vectors automatically from the blank border map.

Stage A (regions): every patch of land enclosed by borders/coast becomes a numbered region.
Stage B (nations): nation-seeds.json says which regions belong to which nation (one [x, y]
map-pixel point inside each region); the regions are merged, traced and written as
eurth-map/public/overlays.svg with one <g id="KEY"> per nation (KEY = key in nations.js).
The same shapes are also written in lon/lat as eurth-map/public/nations.geojson (for a globe).

Usage (from the project root):
    python overlay-tools/build_overlays.py

Inputs:
    Eurth Blank Map Borders.png      grey land, white sea + borders (8000x4000)
    Eurth-Geography-Map-5-29.png     current geography map; its thin red lines add borders
                                     that the blank map is missing
    overlay-tools/nation-seeds.json  { "Tavok": [[x, y], ...], ... }
                                     "manual" reuses the hand-drawn shape instead, and
                                     ["manual", [x, y], ...] adds auto regions to it
    overlay-tools/border-patches.json  extra border polylines [[[x, y], ...], ...]
    overlay-tools/border-erasers.json  polylines [[[x, y], ...], ...] or {"line": [...], "width": px};
                                     white border lines of the blank map under them (ERASE_PX wide)
                                     become land again, for borders the blank map has in the
                                     wrong place; the red lines still apply
    overlay-tools/manual-overlays.svg  hand-drawn shapes (Affinity export cleaned by
                                     extract_overlays.py), used for nations marked "manual"
"""

import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage

Image.MAX_IMAGE_PIXELS = None

ROOT = Path(__file__).resolve().parent.parent
TOOLS = ROOT / "overlay-tools"
OUT = TOOLS / "out"
BLANK_MAP = ROOT / "Eurth Blank Map Borders.png"
GEO_MAP = ROOT / "Eurth-Geography-Map-5-29.png"
NATIONS_JS = ROOT / "eurth-map" / "src" / "data" / "nations.js"
SEEDS = TOOLS / "nation-seeds.json"
PATCHES = TOOLS / "border-patches.json"
ERASERS = TOOLS / "border-erasers.json"
AREA_EXCLUSIONS = TOOLS / "area-exclusions.json"   # {nation: [[x, y], ...]}: regions drawn but not counted in the traced km2
MANUAL = TOOLS / "manual-overlays.svg"
OVERLAYS = ROOT / "eurth-map" / "public" / "overlays.svg"
GEOJSON = ROOT / "eurth-map" / "public" / "nations.geojson"
MAP_AREA_NATIONS = ROOT / "eurth-map" / "src" / "data" / "map-area-nations.json"
AREA_REPORT = ROOT / "area-discrepancies.md"
TRACED_AREAS = ROOT / "eurth-map" / "src" / "data" / "traced-areas.json"

MIN_REGION_PX = 30      # ignore specks smaller than this
GROW_PX = 2             # grow nation shapes into the border line by this much
SIMPLIFY_PX = 0.6       # contour simplification tolerance
RADIUS_KM = 6371        # Eurth is the same size as Earth
GEOJSON_MAX_EDGE_PX = 22    # ~1 degree; longer edges get extra points so they don't bow on a globe
SEED_SEARCH_PX = 6      # a seed that lands on a border snaps to the nearest region within this
ERASE_PX = 15           # width of an eraser stroke (an old border line is 3-8 px wide and a few px off the red line)
ERASE_BRIDGE_PX = 25    # an eraser only fills white gaps narrower than this (old borders, lakes), not open sea


def read_nations():
    """Return {key: landArea or None} parsed from nations.js."""
    text = NATIONS_JS.read_text(encoding="utf-8")
    nations = {}
    for m in re.finditer(r'^  "?([\w-]+)"?: \{(.*?)^  \},', text, flags=re.M | re.S):
        area = re.search(r"landArea: ([\d.]+|null)", m.group(2))
        nations[m.group(1)] = None if not area or area.group(1) == "null" else float(area.group(1))
    return nations


def load_json(path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def trace_mask(mask, offset=(0, 0)):
    """Trace a binary mask. Returns (SVG path string for use with evenodd,
    polygons as [[outer ring, hole, ...], ...] of map-pixel [x, y] points)."""
    contours, hierarchy = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    parts, polygons, outer_of = [], [], {}
    for i, c in enumerate(contours):
        if cv2.contourArea(c) < 4:
            continue
        c = cv2.approxPolyDP(c, SIMPLIFY_PX, True).reshape(-1, 2)
        if len(c) < 3:
            continue
        ring = [[float(x) + offset[0] + 0.5, float(y) + offset[1] + 0.5] for x, y in c]
        parts.append("M" + " ".join(f"{x:g},{y:g}" for x, y in ring) + "Z")
        parent = int(hierarchy[0][i][3])    # RETR_CCOMP: -1 for an outer ring, else the ring this is a hole in
        if parent < 0:
            outer_of[i] = len(polygons)
            polygons.append([ring])
        elif parent in outer_of:    # parents always come before their holes
            polygons[outer_of[parent]].append(ring)
    return "".join(parts), polygons


def svg_group_polygons(group_text):
    """Polygons (map-pixel rings) of a hand-drawn <g>. Handles what the Affinity exports contain:
    matrix() transforms on the group/paths and absolute M, L, C, Z path commands."""
    def matrix(el):
        m = re.match(r"matrix\(([^)]*)\)", el.get("transform", ""))
        return [float(v) for v in re.split(r"[ ,]+", m.group(1).strip())] if m else [1, 0, 0, 1, 0, 0]

    def apply(m, x, y):
        return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]

    polygons = []
    group = ET.fromstring(group_text)
    gm = matrix(group)
    for path in group.iter("path"):
        pm = matrix(path)
        ring = []
        for cmd, args in re.findall(r"([A-Za-z])([^A-Za-z]*)", path.get("d", "")):
            v = [float(n) for n in re.findall(r"-?\d*\.?\d+(?:e-?\d+)?", args)]
            if cmd in "ML":
                if cmd == "M" and len(ring) >= 3:
                    polygons.append([ring])
                if cmd == "M":
                    ring = []
                ring += [v[i:i + 2] for i in range(0, len(v), 2)]
            elif cmd == "C":
                for i in range(0, len(v), 6):
                    p0, (p1, p2, p3) = ring[-1], (v[i:i + 2], v[i + 2:i + 4], v[i + 4:i + 6])
                    for t in np.linspace(0, 1, 9)[1:]:
                        ring.append([(1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t ** 2 * c + t ** 3 * d
                                     for a, b, c, d in zip(p0, p1, p2, p3)])
            elif cmd in "Zz":
                pass
            else:
                raise ValueError(f"unsupported path command {cmd!r} in a hand-drawn shape")
        if len(ring) >= 3:
            polygons.append([ring])
    return [[[apply(gm, *apply(pm, x, y)) for x, y in ring] for ring in poly] for poly in polygons]


def ring_to_lonlat(ring, hole, width, height):
    """Map-pixel ring -> closed lon/lat ring, wound per RFC 7946 (outer anticlockwise, holes clockwise)."""
    pts = []
    for (x0, y0), (x1, y1) in zip(ring, ring[1:] + ring[:1]):
        n = max(1, int(np.ceil(max(abs(x1 - x0), abs(y1 - y0)) / GEOJSON_MAX_EDGE_PX)))
        pts += [[x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n] for k in range(n)]
    lonlat = [[round(x / width * 360 - 180, 4), round(90 - y / height * 180, 4)] for x, y in pts]
    signed = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(lonlat, lonlat[1:] + lonlat[:1]))
    if (signed < 0) != hole:    # positive = anticlockwise
        lonlat.reverse()
    return lonlat + [lonlat[0]]


def build_regions():
    """Stage A. Returns (labels uint16 image, growable mask, region list)."""
    blank = np.array(Image.open(BLANK_MAP).convert("RGB")).astype(np.int32)
    geo = np.array(Image.open(GEO_MAP).convert("RGB")).astype(np.int32)
    if blank.shape != geo.shape:
        sys.exit(f"ERROR: map sizes differ: {blank.shape} vs {geo.shape}")

    land = (blank.sum(2) < 720).astype(np.uint8)

    # Out-of-date border lines on the blank map: inside each eraser polygon its white pixels turn back
    # into land (only where land is close on both sides, so open sea stays sea). The red lines of the
    # geography map are applied afterwards, so this only drops the old line, never a current border.
    erasers = load_json(ERASERS, [])
    if erasers:
        erase = np.zeros_like(land)
        for item in erasers:
            line, width = (item["line"], item.get("width", ERASE_PX)) if isinstance(item, dict) else (item, ERASE_PX)
            cv2.polylines(erase, [np.array(line, np.int32)], False, 1, thickness=int(width))
        near_land = cv2.morphologyEx(land, cv2.MORPH_CLOSE, np.ones((ERASE_BRIDGE_PX, ERASE_BRIDGE_PX), np.uint8))
        land |= erase & near_land

    # Thin red lines on the geography map = borders. Flags and other red blobs are removed.
    r, g, b = geo[:, :, 0], geo[:, :, 1], geo[:, :, 2]
    red = ((r > 100) & (g < 75) & (b < 75) & (r - g > 55)).astype(np.uint8)
    blobs = cv2.morphologyEx(red, cv2.MORPH_OPEN, np.ones((4, 4), np.uint8))
    lines = red & (1 - cv2.dilate(blobs, np.ones((7, 7), np.uint8)))
    red_borders = cv2.dilate(lines, np.ones((3, 3), np.uint8))

    # Hand-added border lines
    patch_mask = np.zeros_like(land)
    for line in load_json(PATCHES, []):
        cv2.polylines(patch_mask, [np.array(line, np.int32)], False, 1, thickness=3)

    # Diff image: red border lines with no blank-map border nearby (blank map out of date there)
    blank_edges = cv2.morphologyEx(land, cv2.MORPH_GRADIENT, np.ones((3, 3), np.uint8))
    near_blank = cv2.dilate(blank_edges, np.ones((13, 13), np.uint8))
    missing = cv2.dilate(lines & land & (1 - near_blank), np.ones((5, 5), np.uint8))
    diff = (geo // 2 + 110).astype(np.uint8)
    diff[missing > 0] = (255, 0, 255)
    Image.fromarray(diff).resize((4000, 2000)).save(OUT / "border-diff.png")

    interior = land & (1 - red_borders) & (1 - patch_mask)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(interior, connectivity=4)

    # Where nation shapes may grow: border lines inside a landmass, not open sea
    landmass = cv2.morphologyEx(land, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))

    # Representative point per region = the pixel deepest inside it
    depth = cv2.distanceTransform(interior, cv2.DIST_L2, 3)
    keep = [i for i in range(1, n) if stats[i, cv2.CC_STAT_AREA] >= MIN_REGION_PX]
    points = ndimage.maximum_position(depth, labels, keep)

    regions = []
    for i, (py, px) in zip(keep, points):
        x, y, w, h, area = (int(v) for v in stats[i])
        regions.append({"id": i, "area": area, "bbox": [x, y, w, h], "point": [int(px), int(py)]})

    small = np.isin(labels, keep, invert=True)
    labels[small] = 0
    return labels.astype(np.uint16), landmass, regions


def write_region_files(labels, regions):
    cv2.imwrite(str(OUT / "labels.png"), labels)
    (OUT / "regions.json").write_text(json.dumps(regions), encoding="utf-8")
    paths = []
    for reg in regions:
        x, y, w, h = reg["bbox"]
        mask = (labels[y:y + h, x:x + w] == reg["id"]).astype(np.uint8)
        mask = cv2.copyMakeBorder(mask, 1, 1, 1, 1, cv2.BORDER_CONSTANT, value=0)
        d, _ = trace_mask(mask, (x - 1, y - 1))
        if d:
            paths.append(f'<path id="r{reg["id"]}" d="{d}"/>')
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8000 4000" '
           'style="fill-rule:evenodd">\n' + "\n".join(paths) + "\n</svg>\n")
    (OUT / "regions.svg").write_text(svg, encoding="utf-8")


def region_at(labels, x, y):
    """Region id at a seed point, snapping to the nearest region if it sits on a border."""
    h, w = labels.shape
    if not (0 <= x < w and 0 <= y < h):
        return 0
    if labels[y, x]:
        return int(labels[y, x])
    s = SEED_SEARCH_PX
    win = labels[max(0, y - s):y + s + 1, max(0, x - s):x + s + 1]
    ys, xs = np.nonzero(win)
    if not len(ys):
        return 0
    k = np.argmin((ys - min(s, y)) ** 2 + (xs - min(s, x)) ** 2)
    return int(win[ys[k], xs[k]])


def manual_groups():
    """Return {nation id: '<g id=...>...</g>' text} from the hand-drawn overlay file."""
    if not MANUAL.exists():
        return {}
    ns = "http://www.w3.org/2000/svg"
    ET.register_namespace("", ns)
    ET.register_namespace("serif", "http://www.serif.com/")
    groups = {}
    for g in ET.parse(MANUAL).getroot().findall(f"{{{ns}}}g"):
        text = ET.tostring(g, encoding="unicode")
        groups[g.get("id")] = re.sub(r' xmlns(:\w+)?="[^"]*"', "", text).strip()
    return groups


def seed_points(value):
    """The [x, y] points of a seeds entry (which may be or contain the word "manual")."""
    return [] if value == "manual" else [p for p in value if p != "manual"]


def uses_manual(value):
    return value == "manual" or "manual" in value


def assign_regions(labels, seeds):
    """Return ({region id: nation}, [problem strings])."""
    owner, problems = {}, []
    for nation, pts in seeds.items():
        for x, y in seed_points(pts):
            rid = region_at(labels, int(x), int(y))
            if not rid:
                problems.append(f"{nation}: seed ({x}, {y}) is not on land")
            elif owner.get(rid, nation) != nation:
                problems.append(f"region {rid} claimed by both {owner[rid]} and {nation}")
            else:
                owner[rid] = nation
    return owner, problems


def area_exclusions(labels, owner, problems):
    """{nation: set of region ids} that are drawn as the nation's territory but left out of its
    traced area (e.g. a port enclave that the stated land area does not include)."""
    excluded = {}
    for nation, pts in load_json(AREA_EXCLUSIONS, {}).items():
        for x, y in pts:
            rid = region_at(labels, int(x), int(y))
            if not rid:
                problems.append(f"{nation}: area exclusion ({x}, {y}) is not on land")
            elif owner.get(rid) != nation:
                problems.append(f"{nation}: area exclusion ({x}, {y}) is region {rid}, which is not {nation}'s")
            else:
                excluded.setdefault(nation, set()).add(rid)
    return excluded


def build_nations(labels, landmass, regions, nations, seeds):
    """Stage B. Writes overlays.svg and returns the text report."""
    owner, problems = assign_regions(labels, seeds)
    excluded = area_exclusions(labels, owner, problems)
    by_id = {r["id"]: r for r in regions}
    h_img = labels.shape[0]
    # Equirectangular map: a pixel's real area shrinks with cos(latitude)
    row_weight = np.cos(np.radians(90 - (np.arange(h_img) + 0.5) * 180 / h_img))

    # km2 of one pixel at the equator (8000x4000 px = 360x180 degrees)
    px_km2 = (RADIUS_KM * np.pi / h_img) ** 2

    groups, areas, traced_km2, hand_drawn, shapes = [], {}, {}, [], {}
    manual = manual_groups()
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * GROW_PX + 1, 2 * GROW_PX + 1))
    for nation in nations:
        hand = ""
        if uses_manual(seeds.get(nation, [])):
            if nation in manual:
                hand = manual[nation]
                hand_drawn.append(nation)
            else:
                problems.append(f"{nation}: marked manual but not in {MANUAL.name}")
        if hand:
            shapes[nation] = svg_group_polygons(hand)
        rids = [rid for rid, nat in owner.items() if nat == nation]
        if not rids:
            if hand:
                groups.append("    " + hand)
            continue
        boxes = np.array([by_id[r]["bbox"] for r in rids])
        pad = GROW_PX + 2
        x0 = max(0, int(boxes[:, 0].min()) - pad)
        y0 = max(0, int(boxes[:, 1].min()) - pad)
        x1 = int((boxes[:, 0] + boxes[:, 2]).max()) + pad
        y1 = int((boxes[:, 1] + boxes[:, 3]).max()) + pad
        sub = labels[y0:y1, x0:x1]
        mask = np.isin(sub, rids).astype(np.uint8)
        # grow only into border lines: not into sea, and not into anyone else's regions
        free = (sub == 0) & (landmass[y0:y1, x0:x1] > 0)
        grow = lambda m: m | (cv2.morphologyEx(cv2.dilate(m, kernel), cv2.MORPH_CLOSE, kernel) & free)
        skip = excluded.get(nation, set())
        # the regions that count towards the area: everything drawn minus the excluded ones
        counted = mask if not skip else np.isin(sub, [r for r in rids if r not in skip]).astype(np.uint8)
        areas[nation] = float((counted * row_weight[y0:y1, None]).sum())
        mask = grow(mask)
        # area of the final shape (its half of the border lines included), shown in the nation panel
        if not hand:    # a hand-drawn part has no raster mask, so the total would be short
            counted = mask if not skip else grow(counted)
            traced_km2[nation] = round(float((counted * row_weight[y0:y1, None]).sum()) * px_km2)
        mask = cv2.copyMakeBorder(mask, 1, 1, 1, 1, cv2.BORDER_CONSTANT, value=0)
        d, polygons = trace_mask(mask, (x0 - 1, y0 - 1))
        shapes[nation] = shapes.get(nation, []) + polygons
        if hand:    # hand-drawn shape plus auto regions in one group
            # the hand-drawn group may carry its own transform, so nest it rather than extend it
            inner = hand.replace(f' id="{nation}"', "", 1)
            groups.append(f'    <g id="{nation}">\n        {inner}\n        <path d="{d}"/>\n    </g>')
        else:
            groups.append(f'    <g id="{nation}">\n        <path d="{d}"/>\n    </g>')

    svg = ('<?xml version="1.0" encoding="UTF-8"?>\n'
           '<!-- Generated by overlay-tools/build_overlays.py. Do not edit by hand. -->\n'
           '<svg xmlns="http://www.w3.org/2000/svg" xmlns:serif="http://www.serif.com/" '
           'viewBox="0 0 8000 4000" style="fill-rule:evenodd;clip-rule:evenodd;">\n'
           + "\n".join(groups) + "\n</svg>\n")
    OVERLAYS.write_text(svg, encoding="utf-8")
    features = [{
        "type": "Feature",
        "id": nation,
        "properties": {"id": nation, "tracedAreaKm2": traced_km2.get(nation)},
        "geometry": {
            "type": "MultiPolygon",
            "coordinates": [[ring_to_lonlat(ring, i > 0, labels.shape[1], h_img) for i, ring in enumerate(poly)]
                            for poly in polygons],
        },
    } for nation, polygons in shapes.items()]
    GEOJSON.write_text(json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")),
                       encoding="utf-8")
    TRACED_AREAS.write_text(json.dumps(traced_km2, indent=2) + "\n", encoding="utf-8")

    write_area_report(nations, traced_km2)

    # Report
    lines = [f"{len(regions)} regions, {len(groups)} of {len(nations)} nations drawn, "
             f"overlays.svg = {OVERLAYS.stat().st_size / 1024:.0f} KB, "
             f"nations.geojson = {GEOJSON.stat().st_size / 1024:.0f} KB"]
    unknown = [n for n in seeds if n not in nations]
    if unknown:
        lines.append("Seeds for nations not in nations.js: " + ", ".join(unknown))
    if hand_drawn:
        lines.append("Hand-drawn shapes reused: " + ", ".join(hand_drawn))
    if excluded:
        lines.append("Regions drawn but left out of the traced area: "
                     + ", ".join(f"{n} ({len(r)})" for n, r in sorted(excluded.items())))
    missing = [n for n in nations if n not in areas and n not in hand_drawn]
    if missing:
        lines.append("No shape yet: " + ", ".join(missing))
    lines += ["PROBLEM: " + p for p in problems]
    ratios = {n: nations[n] / a for n, a in areas.items() if nations.get(n) and a}
    if ratios:
        med = float(np.median(list(ratios.values())))
        lines.append(f"Area check (stated km2 per map pixel, median {med:.2f}); "
                     "far from 1.0x suggests a wrong/leaking region or a generous stat:")
        for n, v in sorted(ratios.items(), key=lambda kv: kv[1] / med):
            flag = "  <-- check" if not 0.6 < v / med < 1.6 else ""
            lines.append(f"  {n:20s} {v / med:5.2f}x{flag}")
    return "\n".join(lines)


def write_area_report(nations, traced_km2):
    """area-discrepancies.md: stated vs traced land area for every nation. Viewers only ever see
    one "Land Area"; this file is where the difference between the two is kept track of."""
    use_map = load_json(MAP_AREA_NATIONS, [])
    rows = []
    for nation, stated in nations.items():
        traced = traced_km2.get(nation)
        diff = traced / stated - 1 if stated and traced else None
        shown = "map" if nation in use_map and traced else "stated"
        rows.append((diff is None, -abs(diff or 0), nation, stated, traced, diff, shown))
    fmt = lambda v: "—" if v is None else f"{v:,.0f}"
    lines = [
        "# Land area: stated vs map",
        "",
        "Generated by `overlay-tools/build_overlays.py`. Do not edit by hand.",
        "",
        "- **Stated** = `landArea` in `nations.js`. **Map** = area of the traced shape (`traced-areas.json`);",
        "  it includes inland water, so a few percent over the stated figure is normal.",
        "- The app shows a single \"Land Area\": the stated figure, except for the nations listed in",
        "  `eurth-map/src/data/map-area-nations.json`, which show the map figure (marked **map** below).",
        "- Nations with a hand-drawn part (Aurora) have no map figure. Regions listed in",
        "  `overlay-tools/area-exclusions.json` are drawn but not counted (Tagmatium's port enclave).",
        "",
        "| Nation | Stated km² | Map km² | Map vs stated | Shown in app |",
        "|---|---:|---:|---:|---|",
    ]
    for _, _, nation, stated, traced, diff, shown in sorted(rows):
        pct = "—" if diff is None else f"{diff:+.0%}"
        lines.append(f"| {nation} | {fmt(stated)} | {fmt(traced)} | {pct} | {'**map**' if shown == 'map' else 'stated'} |")
    stale = [n for n in use_map if n not in traced_km2]
    if stale:
        lines += ["", "In `map-area-nations.json` but without a map figure (falls back to stated): " + ", ".join(stale)]
    AREA_REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    OUT.mkdir(exist_ok=True)
    nations = read_nations()
    labels, landmass, regions = build_regions()
    write_region_files(labels, regions)
    report = build_nations(labels, landmass, regions, nations, load_json(SEEDS, {}))
    (OUT / "report.txt").write_text(report, encoding="utf-8")
    print(report)


if __name__ == "__main__":
    main()

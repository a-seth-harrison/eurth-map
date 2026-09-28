"""
Local review page for the auto-generated nation overlays.

    python overlay-tools/review_server.py        ->  http://localhost:5180

Pick a nation (or create one), click regions to give it territory, choose its colour from its
flag, edit its stats, draw a missing border, then Rebuild.

Territory and borders go to nation-seeds.json / border-patches.json; Rebuild runs build_overlays.py.
Stats, colours and new nations are written to nations.js straight away, and every such edit is also
recorded in nation-data/manual-edits.json, which outranks all other data (see data-tools/nations_file.py).
Flags marked on the map go to flag-boxes.json.
"""

import json
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import cv2
import numpy as np

import build_overlays as bo

sys.path.insert(0, str(bo.ROOT / "data-tools"))
import nations_file as nf  # noqa: E402

PORT = 5180
STATIC = {
    "/": (bo.TOOLS / "review.html", "text/html; charset=utf-8"),
    "/background.png": (bo.ROOT / "eurth-map" / "public" / "background.png", "image/png"),
    "/regions.svg": (bo.OUT / "regions.svg", "image/svg+xml"),
}


FLAGS = bo.TOOLS / "flag-boxes.json"
BACKGROUND = STATIC["/background.png"][0]
_background = None
_flag_colors = {}


def background():
    global _background
    if _background is None:
        _background = cv2.imread(str(BACKGROUND))
    return _background


def snap_flag_box(box):
    """Tighten a roughly dragged box onto the flag's dark outline. Falls back to the box as drawn."""
    x, y, w, h = (int(round(v)) for v in box)
    x, y = max(0, x), max(0, y)
    dark = background()[y:y + h, x:x + w].max(2) < 100
    if dark.size == 0:
        raise ValueError("the flag box is off the map")
    cols = np.nonzero(dark.mean(0) >= 0.45)[0]
    if len(cols) >= 2 and cols[-1] - cols[0] >= 12:
        rows = np.nonzero(dark[:, cols[0]:cols[-1] + 1].mean(1) >= 0.45)[0]
        if len(rows) >= 2 and rows[-1] - rows[0] >= 8:
            return [x + int(cols[0]), y + int(rows[0]), int(cols[-1] - cols[0]) + 1, int(rows[-1] - rows[0]) + 1]
    return [x, y, w, h]


def flag_colors(box):
    """The 2-3 main colours of the flag in `box`, biggest share first: [{"hex", "share"}]."""
    box = tuple(box)
    if box not in _flag_colors:
        x, y, w, h = box
        px = background()[y + 2:y + h - 2, x + 2:x + w - 2].reshape(-1, 3).astype(np.float32)
        k = min(5, len(px))
        _, labels, centers = cv2.kmeans(px, k, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 1),
                                        5, cv2.KMEANS_PP_CENTERS)
        found = []    # [share, colour]; a cluster's colour is its most common real pixel, not the blurry mean
        for i in np.argsort(-np.bincount(labels.ravel(), minlength=k)):
            members = px[labels.ravel() == i]
            if not len(members):
                continue
            values, counts = np.unique(members, axis=0, return_counts=True)
            colour = values[counts.argmax()]
            near = next((f for f in found if np.abs(f[1] - colour).sum() < 90), None)
            if near:
                near[0] += len(members) / len(px)
            else:
                found.append([len(members) / len(px), colour])
        _flag_colors[box] = [{"hex": "#%02x%02x%02x" % tuple(int(v) for v in c[::-1]), "share": round(s, 2)}
                             for s, c in found if s >= 0.05][:3]
    return _flag_colors[box]


def state():
    """Everything the page needs: nations, regions and who owns each region."""
    labels = cv2.imread(str(bo.OUT / "labels.png"), cv2.IMREAD_UNCHANGED)
    seeds = bo.load_json(bo.SEEDS, {})
    owner, problems = bo.assign_regions(labels, seeds)
    report = (bo.OUT / "report.txt").read_text(encoding="utf-8") if (bo.OUT / "report.txt").exists() else ""
    data = nf.parse_nations(bo.NATIONS_JS.read_text(encoding="utf-8"))
    flags = bo.load_json(FLAGS, {})
    return {
        "nations": list(data),
        "data": data,       # every field of every nation, as in nations.js
        "manualFields": {k: list(v) for k, v in nf.load_manual_edits().items()},
        "colors": {k: n["color"] for k, n in data.items() if n.get("color")},
        "flags": flags,     # [x, y, w, h] of the flag on the base map
        "flagColors": {k: flag_colors(box) for k, box in flags.items()},
        "manual": [n for n, v in seeds.items() if bo.uses_manual(v)],
        "regions": bo.load_json(bo.OUT / "regions.json", []),
        "owner": owner,
        "patches": bo.load_json(bo.PATCHES, []),
        "problems": problems,
        "report": report,
    }


def save_pretty(path, mapping):
    """One `"key": value` per line, like the hand-kept JSON files."""
    body = ",\n".join(f"  {json.dumps(k)}: {json.dumps(v)}" for k, v in mapping.items())
    path.write_text("{\n" + body + "\n}\n", encoding="utf-8")


def save_seeds(seeds):
    save_pretty(bo.SEEDS, seeds)


def assign(region_id, nation):
    """Give a region to a nation (nation=None to unassign)."""
    labels = cv2.imread(str(bo.OUT / "labels.png"), cv2.IMREAD_UNCHANGED)
    regions = {r["id"]: r for r in bo.load_json(bo.OUT / "regions.json", [])}
    seeds = bo.load_json(bo.SEEDS, {})
    # drop every existing seed that sits in this region
    for name, pts in seeds.items():
        if pts != "manual":
            seeds[name] = [p for p in pts
                           if p == "manual" or bo.region_at(labels, int(p[0]), int(p[1])) != region_id]
    if nation:
        if seeds.get(nation) == "manual":
            seeds[nation] = ["manual"]      # keep the hand-drawn shape and add regions to it
        seeds.setdefault(nation, []).append(regions[region_id]["point"])
    save_seeds(seeds)


class Handler(BaseHTTPRequestHandler):
    def send(self, body, ctype="application/json", code=200):
        if not isinstance(body, bytes):
            body = json.dumps(body).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/state":
            return self.send(state())
        if path in STATIC:
            file, ctype = STATIC[path]
            return self.send(file.read_bytes(), ctype)
        self.send({"error": "not found"}, code=404)

    def do_POST(self):
        data = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        try:
            self.handle_post(data)
        except (ValueError, KeyError) as err:
            self.send({"error": str(err)}, code=400)

    def handle_post(self, data):
        created = None
        if self.path == "/nation/save":
            nf.save_nation(data["key"], data["fields"])
        elif self.path == "/nation/create":
            created = nf.create_nation(data.get("shortName"), data.get("fields", {}))
        elif self.path == "/flag":
            flags = bo.load_json(FLAGS, {})
            if data["key"] not in nf.parse_nations(bo.NATIONS_JS.read_text(encoding="utf-8")):
                raise ValueError(f"{data['key']} is not in nations.js")
            flags[data["key"]] = snap_flag_box(data["box"])
            save_pretty(FLAGS, flags)
        elif self.path == "/assign":
            assign(int(data["region"]), data.get("nation"))
        elif self.path == "/patch":
            patches = bo.load_json(bo.PATCHES, [])
            patches.append([[round(x), round(y)] for x, y in data["points"]])
            bo.PATCHES.write_text(json.dumps(patches) + "\n", encoding="utf-8")
        elif self.path == "/undo-patch":
            patches = bo.load_json(bo.PATCHES, [])
            bo.PATCHES.write_text(json.dumps(patches[:-1]) + "\n", encoding="utf-8")
        elif self.path == "/rebuild":
            run = subprocess.run([sys.executable, str(bo.TOOLS / "build_overlays.py")],
                                 capture_output=True, text=True, encoding="utf-8")
            if run.returncode:
                return self.send({"error": run.stderr[-2000:]}, code=500)
        else:
            return self.send({"error": "not found"}, code=404)
        self.send({**state(), "created": created})

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    print(f"Review page: http://localhost:{PORT}")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()

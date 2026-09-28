"""
Extract nation overlay paths from an Affinity Designer SVG export.

Strips embedded raster images, <defs>, <use> elements, and all inline
fill/fill-opacity styles from paths (colors are applied at runtime by
MapViewer.jsx).

Usage:
    python extract_overlays.py [input.svg] [output.svg]

Defaults:
    input  = Eurth-Geography-Map-Nation-Overlays.svg
    output = eurth-map/public/overlays.svg
"""

import re
import sys
import xml.etree.ElementTree as ET

NS = {
    "svg": "http://www.w3.org/2000/svg",
    "xlink": "http://www.w3.org/1999/xlink",
    "serif": "http://www.serif.com/",
}

# Register namespaces so output doesn't get ns0: prefixes
ET.register_namespace("", NS["svg"])
ET.register_namespace("xlink", NS["xlink"])
ET.register_namespace("serif", NS["serif"])

STRIP_STYLE_RE = re.compile(
    r"\b(fill\s*:[^;]*;?\s*|fill-opacity\s*:[^;]*;?\s*)"
)


def strip_fill_styles(element):
    """Remove fill and fill-opacity from inline style attributes."""
    for el in element.iter():
        style = el.get("style")
        if style:
            cleaned = STRIP_STYLE_RE.sub("", style).strip().rstrip(";")
            if cleaned:
                el.set("style", cleaned)
            else:
                del el.attrib["style"]
        # Also remove fill/fill-opacity if set as direct attributes
        for attr in ("fill", "fill-opacity"):
            if attr in el.attrib:
                del el.attrib[attr]


def extract(input_path, output_path):
    tree = ET.parse(input_path)
    root = tree.getroot()

    viewBox = root.get("viewBox", "0 0 8000 4000")

    # Collect nation <g> groups (direct children with an id)
    groups = [g for g in root.findall("svg:g", NS) if g.get("id")]

    if not groups:
        print("ERROR: No nation <g> groups found in input SVG.")
        sys.exit(1)

    # Strip fill styles so MapViewer can apply colors at runtime
    for g in groups:
        strip_fill_styles(g)

    # Build clean output SVG
    out = ET.Element("svg")
    out.set("viewBox", viewBox)
    out.set("xmlns", NS["svg"])
    out.set("xmlns:xlink", NS["xlink"])
    out.set("xmlns:serif", NS["serif"])
    out.set("style", "fill-rule:evenodd;clip-rule:evenodd;stroke-linejoin:round;stroke-miterlimit:2;")

    for g in groups:
        out.append(g)

    out_tree = ET.ElementTree(out)
    ET.indent(out_tree, space="    ")

    # Write to string first, then fix duplicate namespaces from ElementTree
    raw = ET.tostring(out, encoding="unicode", xml_declaration=True)
    # ElementTree duplicates registered namespaces with explicit .set() calls;
    # keep only the explicit ones by removing the auto-inserted ones at the front
    raw = re.sub(
        r'<svg\s+xmlns="[^"]*"\s+xmlns:serif="[^"]*"\s+',
        "<svg ",
        raw,
        count=1,
    )
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(raw)

    nation_ids = [g.get("id") for g in groups]
    print(f"Extracted {len(groups)} nations: {', '.join(nation_ids)}")
    print(f"Written to {output_path}")


if __name__ == "__main__":
    input_path = sys.argv[1] if len(sys.argv) > 1 else "Eurth-Geography-Map-Nation-Overlays.svg"
    output_path = sys.argv[2] if len(sys.argv) > 2 else "eurth-map/public/overlays.svg"
    extract(input_path, output_path)

"""Fill gaps in nations.js from "Secondary Country Data.csv" (the iiwiki Eurth main-page table).

    python data-tools/fill_from_secondary.py

The CSV holds the five columns this script reads: Country, Capital, Area (km2), Population, GDPPC.

The secondary data is less trusted than what is already in nations.js, so it only ever fills:
  - a field that is null/missing on an existing nation
  - nations that are not in nations.js at all (added at the bottom, no overlay)
A field that already has a value is never touched. Every filled field is recorded in the nation's
`secondaryFields` list in nations.js, so the source of each value stays known.

Manual edits made in the review page (nation-data/manual-edits.json) outrank everything: a manually
edited field is never filled, even when it is null, and this script puts the manual value back if
nations.js no longer has it.

Outputs (in nation-data/):
  nations-primary-snapshot.json   nations.js data before the first fill. Written once, never overwritten.
  nations-current.json            the same dump of nations.js as it is now. Diff the two to see the fill.
  secondary-fill-report.md        what was filled, and where secondary disagrees with existing values.

Safe to re-run: a second run finds nothing left to fill.
"""
import csv
import json
import re

from nations_file import (BLOCK_RE, NATIONS_JS, ROOT, apply_manual_edits, js, load_manual_edits, make_key,
                          parse_nations)

SECONDARY_CSV = ROOT / "Secondary Country Data.csv"
OUT = ROOT / "nation-data"
SNAPSHOT = OUT / "nations-primary-snapshot.json"
CURRENT = OUT / "nations-current.json"
REPORT = OUT / "secondary-fill-report.md"

FIELDS = ["capital", "population", "gdppc", "landArea"]  # what the CSV can supply
CSV_KEY_OVERRIDES = {"Aurora (Eurth)": "Aurora"}
NEW_SECTION = "  // --- Added from Secondary Country Data.csv (iiwiki Eurth main page): no overlay, all stats secondary. ---\n"

def number(cell):
    cell = cell.replace(",", "").strip()
    return float(cell) if re.fullmatch(r"\d+\.\d+", cell) else int(cell) if cell.isdigit() else None


def read_secondary():
    """{key: {name, capital, population, gdppc, landArea}}; unknown values are None."""
    rows = {}
    with SECONDARY_CSV.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            name = row["Country"].strip()
            if not name:
                continue
            key = CSV_KEY_OVERRIDES.get(name, make_key(name))
            rows[key] = {
                "name": re.sub(r" \(Eurth\)$", "", name),
                "wikiId": name.replace(" ", "_"),
                "capital": row["Capital"].strip() or None,
                "landArea": number(row["Area (km2)"]),
                "population": number(row["Population"]),
                "gdppc": number(row["GDPPC"]),
            }
    return rows


def dump(path, nations):
    path.write_text(json.dumps(nations, indent=2, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")


def main():
    OUT.mkdir(exist_ok=True)
    text = NATIONS_JS.read_text(encoding="utf-8")
    nations = parse_nations(text)
    secondary = read_secondary()
    manual = load_manual_edits()
    if not SNAPSHOT.exists():
        dump(SNAPSHOT, nations)

    filled, added, conflicts = [], [], []

    def fill_block(m):
        key, body = m.group(1), m.group(2)
        sec, have = secondary.get(key), nations[m.group(1)]
        if not sec:
            return m.group(0)
        marked = list(have.get("secondaryFields", []))
        for field in FIELDS:
            if sec[field] is None or field in manual.get(key, {}):
                continue
            if have.get(field) is None:
                line = f"    {field}: {js(sec[field])},\n"
                body, n = re.subn(rf"^    {field}: null,\n", line, body, flags=re.M)
                if not n:
                    body += line
                marked.append(field)
                filled.append((key, field, sec[field]))
            elif have[field] != sec[field] and field not in marked:
                conflicts.append((key, field, have[field], sec[field]))
        if marked != have.get("secondaryFields", []):
            body = re.sub(r"^    secondaryFields: .*\n", "", body, flags=re.M)
            body += f"    secondaryFields: {js(marked)},\n"
        return m.group(0).replace(m.group(2), body)

    text = BLOCK_RE.sub(fill_block, text)

    new_blocks = ""
    for key, sec in secondary.items():
        if key in nations:
            continue
        fields = [f for f in FIELDS if sec[f] is not None]
        quoted = key if re.fullmatch(r"[A-Za-z_]\w*", key) else f'"{key}"'
        new_blocks += (
            f"  {quoted}: {{\n"
            f"    name: {js(sec['name'])},\n"
            f"    population: {js(sec['population'])},\n"
            f"    gdppc: {js(sec['gdppc'])},\n"
            f"    landArea: {js(sec['landArea'])},\n"
            f"    capital: {js(sec['capital'])},\n"
            f"    iiwikiLink: {js('https://iiwiki.com/w/' + sec['wikiId'])},\n"
            f"    secondaryFields: {js(fields)},\n"
            f"  }},\n"
        )
        added.append(key)
    if new_blocks:
        header = "" if NEW_SECTION in text else "\n" + NEW_SECTION
        text = text.replace("};\n\nexport default", header + new_blocks + "};\n\nexport default")

    text, restored = apply_manual_edits(text)
    NATIONS_JS.write_text(text, encoding="utf-8")
    now = parse_nations(text)
    dump(CURRENT, now)

    # The report always describes the whole fill (from secondaryFields), not just this run
    lines = [
        "# Secondary data fill",
        "",
        "Generated by `data-tools/fill_from_secondary.py`. Source: `Secondary Country Data.csv` (iiwiki Eurth main page).",
        "Secondary values only fill gaps; they never replace an existing value. Each filled field is listed in the",
        "nation's `secondaryFields` in `nations.js`. Diff `nations-primary-snapshot.json` against `nations-current.json`",
        "for the exact changes.",
        "",
        "## Gaps filled on nations that already had data",
        "",
        "| Nation | Field | Value (secondary) |",
        "|---|---|---|",
    ]
    snapshot = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    for key, n in now.items():
        if key in snapshot:
            lines += [f"| {key} | {f} | {n[f]} |" for f in n.get("secondaryFields", [])]
    new_keys = [k for k in now if k not in snapshot]
    lines += ["", f"## Nations added entirely from secondary data ({len(new_keys)})", "", ", ".join(new_keys), ""]
    lines += [
        "## Existing nations not in the secondary data",
        "",
        ", ".join(k for k in snapshot if k not in secondary) or "none",
        "",
        "## Disagreements (existing value kept)",
        "",
        "| Nation | Field | nations.js (kept) | Secondary (ignored) |",
        "|---|---|---|---|",
    ]
    lines += [f"| {k} | {f} | {a} | {b} |" for k, f, a, b in conflicts]
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"filled {len(filled)} fields on existing nations, added {len(added)} nations, "
          f"{len(conflicts)} disagreements left untouched")
    for key, field, value in filled:
        print(f"  {key}.{field} = {value}")
    for key, field, value in restored:
        print(f"  manual edit put back: {key}.{field} = {value}")


if __name__ == "__main__":
    main()

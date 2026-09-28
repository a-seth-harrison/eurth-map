"""Compare the community "Countries on Eurth" Google Sheet with the map's nations.js.

    python data-tools/compare_sheet.py                      # compare the stored CSV
    python data-tools/compare_sheet.py path/to/export.xlsx   # refresh the CSV from the sheet first

The repository keeps only what the comparison reads from the sheet: nation-data/Countries on
Eurth.csv, with the sheet's row number and five columns (Country, Capital, Area, Population,
GDPPC). To refresh it, export the Google Sheet as Excel (File > Download > Microsoft Excel) and
pass the file: the script rewrites the CSV from it and does not keep the export.

It writes nation-data/Countries on Eurth vs map.xlsx with three tabs:

  "Countries of Eurth"  the CSV's values at the sheet's own rows and columns (A, B, E, F, G)
  "Map data"  nations.js laid out in the sheet's own columns and style (cyan header, Arial,
              #,##0, the wikitext columns C:D and the derived columns H:J as the same formulas),
              plus map-only columns at the right (key, full name, highlight colour, territory,
              area shown on map, secondary fields, NPC)
  "Diff"      one row per nation from either side: capital, area, population and GDPPC side by
              side, differences in red, one-sided values in yellow, matches in green, nations on
              one side only in grey; most-different nations first. Values, not formulas: it is a
              snapshot, so re-run after either side changes.

and nation-data/Countries on Eurth - differences.xlsx, the short version for the sheet's keeper.

Nations are matched by nations.js key (make_key of the sheet's Country column, same rule as
fill_from_secondary.py). A renamed nation shows up as one "only in sheet" and one "only on map" row.
"""
import csv
import json
import re
import sys
import urllib.parse
from pathlib import Path

from openpyxl import Workbook, load_workbook
from openpyxl.formatting.rule import ColorScaleRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from nations_file import NATIONS_JS, ROOT, make_key, parse_nations

SHEET = "Countries of Eurth"
CSV_DEFAULT = ROOT / "nation-data" / "Countries on Eurth.csv"
# The sheet's columns (0-based) that the comparison reads, under their names in the CSV
KEPT = [(0, "Country"), (1, "Capital"), (4, "Area (km2)"), (5, "Population"), (6, "GDPPC")]
# The sheet's header row and column widths, so "Map data" can be laid out like the sheet
SHEET_HEAD = ["Country", "Capital", "Country", "Capital", "Area (km2)", "Population",
              "{{Tooltip|GDPPC|GDP per capita}}<br/>(nominal)", "Complete data?", "GDP (nominal)",
              "Density per km2", "IIWiki bytes", "Main contributor"]
SHEET_WIDTHS = {"A": 15.13, "B": 13.88, "C": 3.0, "D": 3.38, "E": 12.13, "G": 22.38, "H": 11.0,
                "I": 18.5, "J": 9.88, "L": 12.38}
OUT = ROOT / "nation-data" / "Countries on Eurth vs map.xlsx"
SIMPLE_OUT = ROOT / "nation-data" / "Countries on Eurth - differences.xlsx"
TRACED = ROOT / "eurth-map" / "src" / "data" / "traced-areas.json"
MAP_AREA = ROOT / "eurth-map" / "src" / "data" / "map-area-nations.json"
SEEDS = ROOT / "overlay-tools" / "nation-seeds.json"
CSV_KEY_OVERRIDES = {"Aurora (Eurth)": "Aurora"}

# (title, sheet column index 0-based, nations.js field, kind)
COMPARED = [("Capital", 1, "capital", "text"), ("Area (km2)", 4, "landArea", "number"),
            ("Population", 5, "population", "number"), ("GDPPC", 6, "gdppc", "number")]
NUMERIC_COLS = "EFGHIJ"  # right-aligned in the sheet

FONT = "Arial"
BODY = Font(name=FONT)
ITALIC = Font(name=FONT, italic=True)
BOLD = Font(name=FONT, bold=True)
HEADER_FILL = PatternFill("solid", fgColor="FF00FFFF")   # the sheet's cyan header
HEADER_ALIGN = Alignment(horizontal="left", vertical="bottom", wrap_text=True)
# Google Sheets' "light 3" palette, the same family as the sheet's own highlights
RED = PatternFill("solid", fgColor="FFF4C7C3")     # values differ
YELLOW = PatternFill("solid", fgColor="FFFCE8B2")  # only one side has a value
GREEN = PatternFill("solid", fgColor="FFD9EAD3")   # same
GREY = PatternFill("solid", fgColor="FFEFEFEF")    # nation is on one side only
NUM = "#,##0"
NUM2 = "#,##0.00"


def number(v):
    """The number a sheet cell holds, or None ("{{No|N/A}}", "#VALUE!", text, blank)."""
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return int(v) if float(v).is_integer() else v
    s = str(v).replace(",", "").strip()
    if re.fullmatch(r"-?\d+", s):
        return int(s)
    if re.fullmatch(r"-?\d+\.\d+", s):
        return float(s)
    return None


def short_name(nation, key):
    link = nation.get("iiwikiLink") or ""
    if link.startswith("https://iiwiki.com/w/"):
        return urllib.parse.unquote(link[len("https://iiwiki.com/w/"):]).replace("_", " ")
    return key


def text_on(hex_color):
    """Black or white, whichever reads on the given fill."""
    r, g, b = (int(hex_color[i:i + 2], 16) for i in (1, 3, 5))
    return "FF000000" if 0.299 * r + 0.587 * g + 0.114 * b > 150 else "FFFFFFFF"


def header(ws, row, values):
    for c, v in enumerate(values, start=1):
        cell = ws.cell(row=row, column=c, value=v)
        cell.font = BODY
        cell.fill = HEADER_FILL
        cell.alignment = HEADER_ALIGN


def widths(ws, values):
    for i, w in enumerate(values, start=1):
        if w is not None:
            ws.column_dimensions[get_column_letter(i)].width = w


def read_export(src):
    """[(sheet row number, [12 values])] from the Excel export, only the KEPT columns filled."""
    wb = load_workbook(src, data_only=True)  # cached formula results
    if SHEET not in wb.sheetnames:
        sys.exit(f"no tab named {SHEET!r} in {src}")
    ws = wb[SHEET]
    rows = []
    for r in range(2, ws.max_row + 1):
        vals = [None] * 12
        for col, _ in KEPT:
            vals[col] = ws.cell(row=r, column=col + 1).value
        if vals[0] is not None and str(vals[0]).strip():
            rows.append((r, vals))
    return rows


def write_csv(rows, path):
    def text(v):
        if v is None:
            return ""
        if isinstance(v, float):
            return str(int(v)) if v.is_integer() else repr(v)
        return str(v)

    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["Sheet row"] + [name for _, name in KEPT])
        for rownum, vals in rows:
            w.writerow([rownum] + [text(vals[col]) for col, _ in KEPT])


def read_csv(path):
    """The same rows as read_export, from the stored CSV. Numbers come back as numbers; a cell
    that is not one ("{{No|N/A}}") stays text, as in the sheet."""
    rows = []
    with open(path, newline="", encoding="utf-8") as f:
        for rec in csv.DictReader(f):
            vals = [None] * 12
            for col, name in KEPT:
                v = rec[name]
                if col >= 4:
                    n = number(v)
                    v = n if n is not None else v
                vals[col] = v if v != "" else None
            rows.append((int(rec["Sheet row"]), vals))
    return rows


def write_sheet_tab(wb, rows):
    """The sheet's values as stored, at the sheet's own rows and columns."""
    ws = wb.active
    ws.title = SHEET
    for col, name in KEPT:
        cell = ws.cell(row=1, column=col + 1, value=name)
        cell.font, cell.fill, cell.alignment = BODY, HEADER_FILL, HEADER_ALIGN
    for rownum, vals in rows:
        for col, _ in KEPT:
            cell = ws.cell(row=rownum, column=col + 1, value=vals[col])
            cell.font = BODY
            if isinstance(vals[col], (int, float)):
                cell.number_format = NUM
                cell.alignment = Alignment(horizontal="right")
    ws["I1"] = ("From nation-data/Countries on Eurth.csv: the columns of the Google Sheet that the "
                "comparison reads, at the sheet's own rows and columns.")
    ws["I1"].font = ITALIC
    widths(ws, [22, 22, 3, 3, 12, 14, 12])
    ws.freeze_panes = "A2"
    return ws


def map_rows(nations):
    traced = json.loads(TRACED.read_text(encoding="utf-8"))
    map_area = set(json.loads(MAP_AREA.read_text(encoding="utf-8")))
    seeds = json.loads(SEEDS.read_text(encoding="utf-8"))
    rows = []
    for key, n in nations.items():
        rows.append({
            "key": key, "name": short_name(n, key), "capital": n.get("capital"),
            "landArea": n.get("landArea"), "population": n.get("population"), "gdppc": n.get("gdppc"),
            "fullName": n.get("name"), "color": n.get("color"), "territory": key in seeds,
            "shownArea": traced.get(key) if key in map_area else None,
            "secondary": ", ".join(n.get("secondaryFields") or []) or None,
            "npc": bool(n.get("npc")),
        })
    rows.sort(key=lambda r: r["name"].casefold())
    return rows


def write_map_tab(wb, rows, index):
    ws = wb.create_sheet("Map data", index)
    extra = ["Key (nations.js)", "Full name", "Highlight colour", "Has territory on the map?",
             "Area shown on map (km2)", "Fields from secondary source", "NPC"]
    header(ws, 1, SHEET_HEAD + extra)
    for col, width in SHEET_WIDTHS.items():  # the sheet's own column widths
        ws.column_dimensions[col].width = width
    widths(ws, [None] * 12 + [20, 34, 15, 12, 14, 26, 6])
    for i, r in enumerate(rows, start=2):
        cells = [r["name"], r["capital"], f'=CONCATENATE("{{{{flag|",A{i},"}}}}")', f'=CONCATENATE("[[",B{i},"]]")',
                 r["landArea"], r["population"], r["gdppc"], f"=COUNT(E{i}:G{i})",
                 f'=IF(OR(F{i}="",G{i}=""),"",F{i}*G{i})', f'=IF(OR(E{i}="",F{i}=""),"",F{i}/E{i})',
                 None, None,
                 r["key"], r["fullName"], r["color"], "yes" if r["territory"] else "no",
                 r["shownArea"], r["secondary"], "yes" if r["npc"] else None]
        for c, v in enumerate(cells, start=1):
            cell = ws.cell(row=i, column=c, value=v)
            cell.font = BODY
            letter = get_column_letter(c)
            if letter in NUMERIC_COLS or letter == "Q":
                cell.alignment = Alignment(horizontal="right")
            if letter in "EFGIQ":
                cell.number_format = NUM
            elif letter == "J":
                cell.number_format = NUM2
        if r["color"] and re.fullmatch(r"#[0-9a-fA-F]{6}", r["color"]):
            cell = ws.cell(row=i, column=15)
            cell.fill = PatternFill("solid", fgColor="FF" + r["color"][1:].upper())
            cell.font = Font(name=FONT, color=text_on(r["color"]))
    last = len(rows) + 1
    ws.conditional_formatting.add(f"H2:H{last}", ColorScaleRule(start_type="min", start_color="FFE67C73",
                                                                 end_type="max", end_color="FFFFFFFF"))
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = f"A1:S{last}"
    note = ws.cell(row=last + 2, column=1,
                   value="Source: eurth-map/src/data/nations.js. Columns A-L follow the Countries of Eurth tab "
                         "(same formulas in C, D, H, I, J). IIWiki bytes and Main contributor are not tracked by "
                         "the map. \"Area shown on map\" is the traced area the app displays instead of the stated "
                         "one for the nations in map-area-nations.json.")
    note.font = ITALIC
    return ws


def compare(sheet_rows, map_rows_):
    by_key = {m["key"]: m for m in map_rows_}
    out, seen = [], set()
    for rownum, vals in sheet_rows:
        label = str(vals[0]).strip()
        key = CSV_KEY_OVERRIDES.get(label, make_key(label))
        seen.add(key)
        out.append({"label": label, "key": key, "sheet_row": rownum, "sheet": vals, "map": by_key.get(key)})
    for key, m in by_key.items():
        if key not in seen:
            out.append({"label": m["name"], "key": key, "sheet_row": None, "sheet": None, "map": m})

    for e in out:
        fields, diffs = [], 0
        for title, col, field, kind in COMPARED:
            s = m = None
            if e["sheet"] is not None:
                raw = e["sheet"][col]
                s = (str(raw).strip() if raw is not None else "") if kind == "text" else number(raw)
                if s == "":
                    s = None
            if e["map"] is not None:
                m = e["map"][field]
            if e["sheet"] is None or e["map"] is None:
                result = None
            elif s is None and m is None:
                result = "both unknown"
            elif s is None:
                result = "map only"
            elif m is None:
                result = "sheet only"
            elif (abs(s - m) < 1 if kind == "number" else s.casefold() == m.casefold()):
                result = "same"
            else:
                result = "DIFFERENT"
                diffs += 1
            delta = pct = None
            if kind == "number" and result == "DIFFERENT":
                delta = m - s
                pct = delta / s if s else None
            fields.append({"title": title, "kind": kind, "sheet": s, "map": m, "result": result,
                           "delta": delta, "pct": pct})
        e["fields"], e["diffs"] = fields, diffs
        e["status"] = ("Both" if e["sheet"] is not None and e["map"] is not None
                       else "Only in Google Sheet" if e["sheet"] is not None else "Only on map")
    order = {"Both": 0, "Only in Google Sheet": 1, "Only on map": 2}
    out.sort(key=lambda e: (order[e["status"]], -e["diffs"] if e["status"] == "Both" else 0, e["label"].casefold()))
    return out


def write_diff_tab(wb, entries, index):
    ws = wb.create_sheet("Diff", index)
    both = [e for e in entries if e["status"] == "Both"]
    only_sheet = [e for e in entries if e["status"] == "Only in Google Sheet"]
    only_map = [e for e in entries if e["status"] == "Only on map"]
    differing = [e for e in both if e["diffs"]]

    lines = [("Countries of Eurth (Google Sheet) vs Map data (nations.js)", None),
             ("Nations in both", len(both)),
             ("   with at least one difference", len(differing)),
             ("   identical", len(both) - len(differing)),
             ("Only in the Google Sheet", len(only_sheet)),
             ("Only on the map", len(only_map))]
    for f_i, (title, _, _, _) in enumerate(COMPARED):
        lines.append((f"{title}: nations that differ",
                      sum(1 for e in both if e["fields"][f_i]["result"] == "DIFFERENT")))
    for r, (label, value) in enumerate(lines, start=1):
        ws.cell(row=r, column=1, value=label).font = BOLD if r == 1 else BODY
        if value is not None:
            ws.cell(row=r, column=2, value=value).font = BODY
    legend_row = len(lines) + 2
    for i, (fill, text) in enumerate([(RED, "values differ"), (YELLOW, "only one side has a value"),
                                      (GREEN, "same"), (GREY, "nation is on one side only")]):
        c = ws.cell(row=legend_row, column=1 + i * 2, value=text)
        c.fill, c.font = fill, BODY
    ws.cell(row=legend_row + 1, column=1,
            value="Rows: nations in both, most differences first; then sheet-only; then map-only. "
                  "Numbers compared to the nearest whole unit (the sheet stores unrounded areas); capitals compared ignoring case and surrounding spaces. "
                  "Delta and % are map minus sheet, relative to the sheet. \"Sheet row\" is the row on the "
                  "Countries of Eurth tab.").font = ITALIC

    head_row = legend_row + 3
    head = ["Country", "Key", "Status", "Sheet row", "# differences"]
    for title, _, _, kind in COMPARED:
        head += [f"{title} (sheet)", f"{title} (map)", f"{title}: result"]
        if kind == "number":
            head += [f"{title}: delta", f"{title}: %"]
    header(ws, head_row, head)

    row = head_row
    for e in entries:
        row += 1
        base = [e["label"], e["key"], e["status"], e["sheet_row"], e["diffs"] if e["status"] == "Both" else None]
        for c, v in enumerate(base, start=1):
            ws.cell(row=row, column=c, value=v)
        col = len(base) + 1
        for f in e["fields"]:
            cells = [f["sheet"], f["map"], f["result"]]
            if f["kind"] == "number":
                cells += [f["delta"], f["pct"]]
            fill = {"DIFFERENT": RED, "map only": YELLOW, "sheet only": YELLOW, "same": GREEN}.get(f["result"])
            if e["status"] != "Both":
                fill = GREY
            for v in cells:
                cell = ws.cell(row=row, column=col, value=v)
                if fill is not None:
                    cell.fill = fill
                col += 1
        if e["status"] != "Both":
            for c in range(1, len(base) + 1):
                ws.cell(row=row, column=c).fill = GREY
        elif e["diffs"]:
            ws.cell(row=row, column=5).fill = RED

    for r in ws.iter_rows(min_row=head_row + 1, max_row=row):
        for cell in r:
            cell.font = BODY
            h = head[cell.column - 1]
            if h.endswith(": %"):
                cell.number_format = "0.0%"
            elif isinstance(cell.value, float):
                cell.number_format = NUM2
            elif isinstance(cell.value, int) and h not in ("Sheet row", "# differences"):
                cell.number_format = NUM
            if isinstance(cell.value, (int, float)):
                cell.alignment = Alignment(horizontal="right")
    ws.freeze_panes = ws.cell(row=head_row + 1, column=2)
    ws.auto_filter.ref = f"A{head_row}:{get_column_letter(len(head))}{row}"
    w = [20, 18, 18, 8, 10]
    for _, _, _, kind in COMPARED:
        w += [16, 16, 12] + ([12, 8] if kind == "number" else [])
    widths(ws, w)
    ws.row_dimensions[head_row].height = 30
    return ws


def write_simple(sheet_rows, entries, path):
    """The short version for the sheet's keeper: only what differs, and how to bring it across."""
    wb = Workbook()
    changed = PatternFill("solid", fgColor="FFFCE8B2")
    rule = Border(bottom=Side(style="thin", color="FFBBBBBB"))
    both = [e for e in entries if e["status"] == "Both"]
    only_map = sorted((e for e in entries if e["status"] == "Only on map"), key=lambda e: e["label"].casefold())
    only_sheet = sorted((e for e in entries if e["status"] == "Only in Google Sheet"), key=lambda e: e["label"].casefold())
    # differences worth showing: the map has a value and it is not the sheet's
    diff_rows = []
    for e in sorted(both, key=lambda e: e["label"].casefold()):
        for f in e["fields"]:
            if f["result"] in ("DIFFERENT", "map only"):
                diff_rows.append((e, f))

    # --- Differences ---
    ws = wb.active
    ws.title = "Differences"
    ws["A1"] = "Where the map and the Countries of Eurth sheet disagree"
    ws["A1"].font = Font(name=FONT, bold=True, size=13)
    ws["A2"] = (f"{len(diff_rows)} values differ across {len({e['key'] for e, _ in diff_rows})} nations. "
                "\"Sheet row\" is the row on the Countries of Eurth tab. Where the map's value is the newer one, "
                "type it into the sheet, or take them all at once from the Paste-ready tab.")
    ws["A2"].font = ITALIC
    ws["A2"].alignment = Alignment(wrap_text=True, vertical="top")
    ws.merge_cells("A2:F2")
    ws.row_dimensions[2].height = 45
    header(ws, 4, ["Country", "Sheet row", "What", "In the sheet", "On the map", "Change"])
    r = 4
    last_key = None
    for e, f in diff_rows:
        r += 1
        first = e["key"] != last_key
        last_key = e["key"]
        vals = [e["label"] if first else None, e["sheet_row"] if first else None, f["title"],
                f["sheet"] if f["sheet"] is not None else "(blank)", f["map"], f["pct"]]
        for c, v in enumerate(vals, start=1):
            cell = ws.cell(row=r, column=c, value=v)
            cell.font = BOLD if (c == 1 and first) else BODY
            if isinstance(v, (int, float)) and c in (4, 5):
                cell.number_format = NUM
                cell.alignment = Alignment(horizontal="right")
            if c == 6 and v is not None:
                cell.number_format = '+0%;-0%;0%'
                cell.alignment = Alignment(horizontal="right")
    # a rule under each nation's last line
    for row in range(5, r + 1):
        nxt = ws.cell(row=row + 1, column=1).value
        if row == r or nxt is not None:
            for c in range(1, 7):
                ws.cell(row=row, column=c).border = rule
    widths(ws, [24, 9, 12, 18, 18, 9])
    ws.freeze_panes = "A5"
    ws.sheet_view.showGridLines = False

    # --- Not in the sheet ---
    ws = wb.create_sheet("Not in the sheet")
    ws["A1"] = "Nations on the map that the sheet does not have"
    ws["A1"].font = Font(name=FONT, bold=True, size=13)
    ws["A2"] = "Ready to add as new rows. Blank means the map does not know the value either."
    ws["A2"].font = ITALIC
    header(ws, 4, ["Country", "Capital", "Area (km2)", "Population", "GDPPC", "Note"])
    r = 4
    for e in only_map:
        m = e["map"]
        r += 1
        vals = [m["name"], m["capital"], m["landArea"], m["population"], m["gdppc"], "NPC" if m["npc"] else None]
        for c, v in enumerate(vals, start=1):
            cell = ws.cell(row=r, column=c, value=v)
            cell.font = BODY
            if isinstance(v, (int, float)):
                cell.number_format = NUM
                cell.alignment = Alignment(horizontal="right")
    if only_sheet:
        r += 2
        ws.cell(row=r, column=1, value="In the sheet but not on the map: " + ", ".join(e["label"] for e in only_sheet)
                + ". Either the map is missing them, or they were renamed.").font = ITALIC
    widths(ws, [24, 22, 12, 14, 12, 8])
    ws.freeze_panes = "A5"
    ws.sheet_view.showGridLines = False

    # --- Paste-ready: the sheet's own rows with the map's values dropped in ---
    ws = wb.create_sheet("Paste-ready")
    header(ws, 1, ["Country", "Capital", "Area (km2)", "Population", "GDPPC"])
    by_key = {e["key"]: e for e in both}
    for rownum, vals in sheet_rows:
        label = str(vals[0]).strip()
        e = by_key.get(CSV_KEY_OVERRIDES.get(label, make_key(label)))
        out = [vals[0], vals[1], vals[4], vals[5], vals[6]]
        flags = [False] * 5
        if e is not None:
            for i, f in enumerate(e["fields"], start=1):
                if f["result"] in ("DIFFERENT", "map only"):
                    out[i], flags[i] = f["map"], True
        for c, v in enumerate(out, start=1):
            cell = ws.cell(row=rownum, column=c, value=v)
            cell.font = BODY
            if flags[c - 1]:
                cell.fill = changed
            if isinstance(v, (int, float)):
                cell.number_format = NUM
                cell.alignment = Alignment(horizontal="right")
    last = max(rn for rn, _ in sheet_rows)
    ws["G1"] = "Same rows as the Countries of Eurth tab; yellow = the map's value, everything else as the sheet has it."
    ws["G2"] = f"To take every change: copy A2:B{last} here and paste over the sheet's A2, then copy C2:E{last} and paste over the sheet's E2."
    ws["G3"] = "Columns C, D and H onwards in the sheet are formulas or yours, so they are not here."
    for c in ("G1", "G2", "G3"):
        ws[c].font = ITALIC
    widths(ws, [22, 22, 12, 14, 12, 3, 60])
    ws.freeze_panes = "A2"
    ws.sheet_view.showGridLines = False
    wb.save(path)


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else CSV_DEFAULT
    if src.suffix.lower() == ".xlsx":
        CSV_DEFAULT.parent.mkdir(exist_ok=True)
        write_csv(read_export(src), CSV_DEFAULT)
        print(f"wrote {CSV_DEFAULT} from {src}")
        src = CSV_DEFAULT
    elif src.suffix.lower() != ".csv":
        sys.exit("pass the Google Sheet exported as .xlsx (File > Download > Microsoft Excel), "
                 "or nothing to use the stored CSV")
    if not src.exists():
        sys.exit(f"{src} does not exist: pass the Google Sheet exported as .xlsx to create it")
    sheet_rows = read_csv(src)  # always the CSV, so both inputs give the same result

    wb = Workbook()
    write_sheet_tab(wb, sheet_rows)
    nations = parse_nations(NATIONS_JS.read_text(encoding="utf-8"))
    mrows = map_rows(nations)
    entries = compare(sheet_rows, mrows)
    write_map_tab(wb, mrows, 1)
    write_diff_tab(wb, entries, 2)
    wb.save(OUT)
    write_simple(sheet_rows, entries, SIMPLE_OUT)
    print(f"wrote {SIMPLE_OUT}")

    both = [e for e in entries if e["status"] == "Both"]
    print(f"wrote {OUT}  tabs: {wb.sheetnames}")
    print(f"  {len(both)} nations in both, {sum(1 for e in both if e['diffs'])} with differences")
    print(f"  only in sheet: {[e['label'] for e in entries if e['status'] == 'Only in Google Sheet']}")
    print(f"  only on map:   {[e['label'] for e in entries if e['status'] == 'Only on map']}")


if __name__ == "__main__":
    main()

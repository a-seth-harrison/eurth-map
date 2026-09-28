"""Read and edit eurth-map/src/data/nations.js, and keep the record of the user's manual edits.

Shared by data-tools/fill_from_secondary.py and overlay-tools/review_server.py.

Three tiers of nation data, most trusted first:
  manual     typed into the review page. Stored in nation-data/manual-edits.json as
             {key: {field: value}} AND written into nations.js. Always wins: apply_manual_edits()
             puts the values back if anything else changed them, and the secondary fill skips them
             (a manual null means "unknown", it is not a gap to fill).
  primary    everything else in nations.js that is not listed in the nation's secondaryFields.
  secondary  fields listed in secondaryFields (filled from Secondary Country Data.csv).
"""
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NATIONS_JS = ROOT / "eurth-map" / "src" / "data" / "nations.js"
MANUAL_EDITS = ROOT / "nation-data" / "manual-edits.json"

BLOCK_RE = re.compile(r'^  "?([\w-]+)"?: \{\n(.*?)^  \},\n', flags=re.M | re.S)
FIELD_RE = re.compile(r"^    (\w+): (.*?),(?:\s*//.*)?$", flags=re.M)  # allows a trailing // comment

FIELD_ORDER = ["name", "color", "population", "gdppc", "landArea", "capital", "iiwikiLink", "npc", "secondaryFields"]
TEXT_FIELDS = ["name", "capital", "iiwikiLink"]
NUMBER_FIELDS = ["population", "gdppc", "landArea"]
EDITABLE = TEXT_FIELDS + NUMBER_FIELDS + ["color"]
TOOL_SECTION = "  // --- Added with the review page (overlay-tools/review_server.py). ---\n"
WIKI = "https://iiwiki.com/w/"


def js(value):
    return json.dumps(value, ensure_ascii=False)


def parse_nations(text):
    """{key: {field: value}} from nations.js (values are JSON-compatible literals)."""
    return {
        m.group(1): {f.group(1): json.loads(f.group(2)) for f in FIELD_RE.finditer(m.group(2))}
        for m in BLOCK_RE.finditer(text)
    }


def make_key(name):
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^\w]+", "-", ascii_name).strip("-")


def wiki_link(short_name):
    return WIKI + short_name.strip().replace(" ", "_")


def clean_fields(fields):
    """Validate {field: value} coming from the review page. Empty strings become None."""
    out = {}
    for field, value in fields.items():
        if field not in EDITABLE:
            raise ValueError(f"{field} is not an editable field")
        if isinstance(value, str):
            value = value.strip() or None
        if value is not None:
            if field in NUMBER_FIELDS:
                if isinstance(value, bool) or not isinstance(value, (int, float)) or value < 0:
                    raise ValueError(f"{field} must be a number")
                value = int(value) if float(value).is_integer() else value
            elif not isinstance(value, str):
                raise ValueError(f"{field} must be text")
            elif field == "color" and not re.fullmatch(r"#[0-9a-fA-F]{6}", value):
                raise ValueError("color must look like #12ab34")
        if field == "name" and value is None:
            raise ValueError("name cannot be empty")
        out[field] = value
    return out


def set_fields(text, key, fields):
    """nations.js text with `fields` set on nation `key`. The fields stop being secondary.
    A color of None removes the line (the app falls back to the default red)."""
    def edit(m):
        if m.group(1) != key:
            return m.group(0)
        body = m.group(2)
        have = {f.group(1): json.loads(f.group(2)) for f in FIELD_RE.finditer(body)}
        fields_now = dict(fields)
        secondary = [f for f in have.get("secondaryFields", []) if f not in fields]
        if "secondaryFields" in have:
            fields_now["secondaryFields"] = secondary or None
        for field, value in fields_now.items():
            drop = value is None and field in ("color", "secondaryFields")
            line = "" if drop else f"    {field}: {js(value)},\n"
            body, n = re.subn(rf"^    {field}: .*\n", lambda _: line, body, flags=re.M)
            if n or drop:
                continue
            later = [f for f in FIELD_ORDER[FIELD_ORDER.index(field) + 1:] if re.search(rf"^    {f}: ", body, flags=re.M)]
            if later:
                body = re.sub(rf"^(?=    {later[0]}: )", lambda _: line, body, count=1, flags=re.M)
            else:
                body += line
        return f"{m.group(0)[:m.start(2) - m.start(0)]}{body}  }},\n"

    if key not in parse_nations(text):
        raise KeyError(key)
    return BLOCK_RE.sub(edit, text)


def add_nation(text, key, fields):
    """nations.js text with a new nation appended at the bottom."""
    if key in parse_nations(text):
        raise ValueError(f"{key} already exists")
    quoted = key if re.fullmatch(r"[A-Za-z_]\w*", key) else f'"{key}"'
    full = {"population": None, "gdppc": None, "landArea": None, "capital": None, **fields}
    lines = "".join(f"    {f}: {js(full[f])},\n" for f in FIELD_ORDER if f in full and not (f == "color" and full[f] is None))
    header = "" if TOOL_SECTION in text else "\n" + TOOL_SECTION
    block = f"{header}  {quoted}: {{\n{lines}  }},\n"
    if "};\n\nexport default" not in text:
        raise ValueError("nations.js does not end the way this script expects")
    return text.replace("};\n\nexport default", block + "};\n\nexport default")


def load_manual_edits():
    return json.loads(MANUAL_EDITS.read_text(encoding="utf-8")) if MANUAL_EDITS.exists() else {}


def save_manual_edits(edits):
    MANUAL_EDITS.parent.mkdir(exist_ok=True)
    MANUAL_EDITS.write_text(json.dumps(edits, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def apply_manual_edits(text):
    """(nations.js text with every manual edit in force, [(key, field, value) that had to be put back])."""
    restored = []
    for key, fields in load_manual_edits().items():
        have = parse_nations(text).get(key)
        if have is None:
            if fields.get("name"):
                text = add_nation(text, key, fields)
                restored += [(key, f, v) for f, v in fields.items()]
            continue
        wrong = {f: v for f, v in fields.items() if have.get(f) != v or f in have.get("secondaryFields", [])}
        if wrong:
            text = set_fields(text, key, wrong)
            restored += [(key, f, v) for f, v in wrong.items()]
    return text, restored


def save_nation(key, fields):
    """Manual edit from the review page: write nations.js and record the edit."""
    fields = clean_fields(fields)
    NATIONS_JS.write_text(set_fields(NATIONS_JS.read_text(encoding="utf-8"), key, fields), encoding="utf-8")
    edits = load_manual_edits()
    edits.setdefault(key, {}).update(fields)
    save_manual_edits(edits)


def create_nation(short_name, fields):
    """New nation from the review page. Returns its key. Everything given is a manual edit."""
    short_name = (short_name or "").strip()
    key = make_key(short_name)
    if not key:
        raise ValueError("the short name needs at least one letter")
    fields = clean_fields({"name": short_name, "iiwikiLink": wiki_link(short_name),
                           **{f: v for f, v in fields.items() if v not in (None, "")}})
    NATIONS_JS.write_text(add_nation(NATIONS_JS.read_text(encoding="utf-8"), key, fields), encoding="utf-8")
    edits = load_manual_edits()
    edits[key] = fields
    save_manual_edits(edits)
    return key

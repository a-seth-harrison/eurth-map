"""Apply a suggested edit (a GitHub issue filed by eurth-map/api/suggest.js) to nations.js.

    python data-tools/apply_suggestion.py             # list the open suggestions
    python data-tools/apply_suggestion.py 12          # show issue #12's changes and ask before applying
    python data-tools/apply_suggestion.py 12 --only population,capital   # apply just those fields
    python data-tools/apply_suggestion.py 12 --yes --keep-open           # no prompt; leave the issue open

Reads the issue with `gh` (must be logged in), takes the trailing ```json block the function
writes ({"key": ..., "fields": {...}}), and writes the fields through nations_file.save_nation,
so they become manual edits (recorded in nation-data/manual-edits.json, never overwritten by the
secondary fill). Then the issue is closed with a comment saying what was applied. Fields whose
current value is no longer what the issue shows are flagged, since the suggestion was made
against older data.
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import nations_file as nf

REPO = "a-seth-harrison/eurth-map"
LABEL = "suggested-edit"
JSON_BLOCK = re.compile(r"```json\s*\n(.*?)\n```", flags=re.S)
CURRENT_ROW = re.compile(r"^\| (\w+) \| (.*?) \| .*? \|$", flags=re.M)


def gh(*args):
    r = subprocess.run(["gh", *args], capture_output=True, text=True, encoding="utf-8")
    if r.returncode:
        sys.exit(f"gh {args[0]} failed: {r.stderr.strip() or r.stdout.strip()}")
    return r.stdout


def show(value):
    if value is None:
        return "—"
    return f"{value:,}" if isinstance(value, (int, float)) else str(value)


def list_open():
    # Filter the label here: `gh issue list --label` goes through GitHub's search index, which lags
    # behind new issues by minutes, so a fresh suggestion would be missing
    issues = json.loads(gh("issue", "list", "--repo", REPO, "--state", "open",
                           "--json", "number,title,createdAt,labels", "--limit", "200"))
    issues = [i for i in issues if any(l["name"] == LABEL for l in i["labels"])]
    if not issues:
        print("No open suggestions.")
    for i in issues:
        print(f"#{i['number']:<4} {i['createdAt'][:10]}  {i['title']}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("issue", nargs="?", type=int, help="issue number; omit to list the open suggestions")
    ap.add_argument("--only", help="comma-separated fields to apply (default: all in the issue)")
    ap.add_argument("--yes", action="store_true", help="apply without asking")
    ap.add_argument("--keep-open", action="store_true", help="do not close the issue afterwards")
    args = ap.parse_args()
    if args.issue is None:
        return list_open()

    issue = json.loads(gh("issue", "view", str(args.issue), "--repo", REPO, "--json", "number,title,state,body"))
    blocks = JSON_BLOCK.findall(issue["body"])
    if not blocks:
        sys.exit(f"#{issue['number']} has no ```json block; is it a suggested edit?")
    proposal = json.loads(blocks[-1])
    key, fields = proposal["key"], proposal["fields"]
    if args.only:
        wanted = [f.strip() for f in args.only.split(",")]
        missing = [f for f in wanted if f not in fields]
        if missing:
            sys.exit(f"not in the issue: {', '.join(missing)} (it has {', '.join(fields)})")
        fields = {f: fields[f] for f in wanted}
    fields = nf.clean_fields(fields)

    nations = nf.parse_nations(nf.NATIONS_JS.read_text(encoding="utf-8"))
    if key not in nations:
        sys.exit(f"{key} is not in nations.js")
    current = nations[key]
    # What the issue said the value was when the suggestion was made
    then = dict(CURRENT_ROW.findall(issue["body"]))

    print(f"#{issue['number']} {issue['title']}  [{issue['state']}]")
    stale = []
    for f, v in fields.items():
        now = current.get(f)
        line = f"  {f:<11} {show(now):>16}  ->  {show(v)}"
        if f in then and then[f] != show(now):
            line += f"   (was {then[f]} when suggested)"
            stale.append(f)
        if now == v:
            line += "   (already this value)"
        print(line)
    if stale:
        print(f"Note: {', '.join(stale)} changed since the suggestion was made; check it still applies.")

    if not args.yes:
        answer = input("Apply? [y/N] ").strip().lower()
        if answer not in ("y", "yes"):
            print("Nothing changed.")
            return
    nf.save_nation(key, fields)
    print(f"Wrote {', '.join(fields)} for {key} to nations.js and manual-edits.json.")

    if args.keep_open or issue["state"] != "OPEN":
        return
    applied = ", ".join(f"{f} = {show(v)}" for f, v in fields.items())
    gh("issue", "close", str(args.issue), "--repo", REPO, "--comment", f"Applied to nations.js: {applied}. Thank you!")
    print(f"Closed #{issue['number']}.")


if __name__ == "__main__":
    main()

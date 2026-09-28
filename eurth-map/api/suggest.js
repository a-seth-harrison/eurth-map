// Vercel serverless function behind the "Suggest an edit" form (src/components/SuggestEditForm.jsx).
// It never changes nations.js: every proposal becomes a GitHub issue on the repo for the owner to
// review. Runs on Vercel and under `vercel dev`; plain `npm run dev` has no /api.
//
// Env: SUGGEST_GITHUB_TOKEN = fine-grained PAT with Issues: read & write on REPO.
//      SUGGEST_DRY_RUN = any value: log the issue instead of filing it (local testing).

// Node ESM needs the extension; Vercel's file tracer bundles the import with the function
import nations from "../src/data/nations.js";

const REPO = "a-seth-harrison/eurth-map";
const LABEL = "suggested-edit";
const BODY_MAX = 10_000;
const HANDLE_MAX = 60;
const NOTE_MAX = 1000;

// The stored stats a viewer may propose a change to. GDP is derived, so it is not here.
const FIELDS = {
  name: { text: true, max: 120 },
  capital: { text: true, max: 120 },
  population: { max: 1e10 },
  gdppc: { max: 1e6 },
  landArea: { max: 1.5e8 },
};

const json = (data, status) => Response.json(data, { status });
const bad = (field) => json({ error: `Invalid ${field}` }, 400);
const clip = (s, max) => (typeof s === "string" ? s.trim().slice(0, max) : "");

// Cheap spam guard: only the map itself (live, Vercel previews, local dev) may post
function originOk(request) {
  const src = request.headers.get("origin") || request.headers.get("referer") || "";
  let host;
  try {
    host = new URL(src).hostname;
  } catch {
    return false;
  }
  return (
    host === "eurth-map.vercel.app" ||
    (host.startsWith("eurth-map-") && host.endsWith(".vercel.app")) ||
    host === "localhost" ||
    host === "127.0.0.1"
  );
}

// Validate one proposed value. Returns the cleaned value, or undefined when it is not acceptable.
function cleanValue(field, value) {
  const rule = FIELDS[field];
  if (value === "" || value === null || value === undefined) return null;
  if (rule.text) {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim().slice(0, rule.max);
    return trimmed || null;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > rule.max) return undefined;
  return value;
}

const cell = (v) => (v == null ? "—" : String(typeof v === "number" ? v.toLocaleString("en-US") : v).replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " "));

function composeBody({ key, stored, fields, handle, note, origin }) {
  const lines = [`**${stored.name}** (\`${key}\`) — suggested by ${handle ? `**${handle}**` : "anonymous"}`, ""];
  lines.push("| Field | Current | Proposed |", "| --- | --- | --- |");
  for (const [f, v] of Object.entries(fields)) lines.push(`| ${f} | ${cell(stored[f])} | ${cell(v)} |`);
  const secondary = Object.keys(fields).filter((f) => stored.secondaryFields?.includes(f));
  if (secondary.length) lines.push("", `Current value from the secondary source: ${secondary.join(", ")}`);
  if (note) lines.push("", "**Source / reason**", ...note.split(/\r?\n/).map((l) => `> ${l}`));
  lines.push("", `Sent from ${origin || "unknown origin"} on ${new Date().toISOString()}`);
  // Last, so a script can take the final fenced block and apply it through data-tools/nations_file.py
  lines.push("", "```json", JSON.stringify({ key, fields }), "```");
  return lines.join("\n");
}

export async function POST(request) {
  if (!originOk(request)) return json({ error: "Bad origin" }, 403);
  const raw = await request.text();
  if (raw.length > BODY_MAX) return json({ error: "Too large" }, 413);
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Bad JSON" }, 400);
  }
  if (!body || typeof body !== "object") return json({ error: "Bad JSON" }, 400);

  // Honeypot: a filled "website" field is a bot. Say OK so it stops trying.
  if (body.website) return json({ url: null }, 200);

  const { key } = body;
  if (typeof key !== "string" || !Object.hasOwn(nations, key)) return json({ error: "Unknown nation" }, 400);
  const stored = nations[key];

  // Keep only known fields whose validated value differs from what is stored
  const proposed = body.fields && typeof body.fields === "object" ? body.fields : {};
  const fields = {};
  for (const f of Object.keys(FIELDS)) {
    if (!Object.hasOwn(proposed, f)) continue;
    const v = cleanValue(f, proposed[f]);
    if (v === undefined) return bad(f);
    if (f === "name" && v === null) return bad(f); // a nation always has a name
    if (v !== (stored[f] ?? null)) fields[f] = v;
  }
  if (!Object.keys(fields).length) return json({ error: "Nothing changed" }, 400);

  const handle = clip(body.handle, HANDLE_MAX);
  const note = clip(body.note, NOTE_MAX);
  const title = `Suggested edit: ${stored.name} (${key})`;
  const issueBody = composeBody({ key, stored, fields, handle, note, origin: request.headers.get("origin") });

  if (process.env.SUGGEST_DRY_RUN) {
    console.log(`[suggest dry run]\n${title}\n\n${issueBody}\n`);
    return json({ url: `https://github.com/${REPO}/issues/0`, number: 0, dry: true }, 201);
  }
  const token = process.env.SUGGEST_GITHUB_TOKEN;
  if (!token) return json({ error: "Suggestions are not set up on this deployment" }, 503);

  const gh = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "eurth-map-suggest", // GitHub rejects requests without one
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title, body: issueBody, labels: [LABEL] }),
  });
  if (!gh.ok) {
    // An expired token shows up here as 401
    console.error("GitHub", gh.status, await gh.text());
    return json({ error: "Could not file the suggestion" }, 502);
  }
  const { html_url, number } = await gh.json();
  return json({ url: html_url, number }, 201);
}

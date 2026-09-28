# Deploying the Eurth map

How to build and host this site, written so that someone other than the owner can do it. The live site is https://eurth-map.vercel.app. Written 2026-09-25.

## What gets deployed

- A **static site**: the folder `eurth-map/dist/` that `npm run build` produces (HTML, JavaScript, the map images, the nation shapes). Any static host can serve it.
- One **serverless function**, `eurth-map/api/suggest.js`, behind the "Suggest an edit" button in the nation panel. It turns a viewer's proposal into a GitHub issue. The map works fully without it; only that button stops working (viewers see "Could not file the suggestion").

Nothing else runs on a server. There is no database.

## 1. Build it locally

Needs Node.js 20 or newer and npm. Python is **not** needed to deploy; it is only used to regenerate the map images and shapes from the source art (section 6).

```bash
cd eurth-map
npm install
npm run build        # writes eurth-map/dist/
npm run preview      # serves dist/ at http://localhost:4173 to check it
```

`npm run dev` starts the development server at http://localhost:5173 (also reachable from a phone on the same Wi-Fi at the "Network" address it prints). The suggest form does not work under `npm run dev`; use `vercel dev` for that (section 4).

## 2. Host it on Vercel (the current setup)

Vercel is a free static host that also runs the function. Steps for a fresh Vercel project, for example from a fork:

1. Sign in to https://vercel.com with GitHub, "Add New → Project", pick the repository.
2. **Root Directory**: `eurth-map`. Vercel then detects Vite by itself: build command `npm run build`, output `dist`. Leave those.
3. Deploy. The `api/` folder inside the root directory is picked up automatically: `api/suggest.js` becomes `POST /api/suggest`. No `vercel.json` is needed.
4. Add the environment variables in section 3, then redeploy (a deployment only sees the variables that existed when it was built).

The project can have any name: the site and the suggest form work under whatever `*.vercel.app` address Vercel gives it.

A project created this way is connected to the GitHub repository, and every push to the default branch deploys automatically. The original site is **not** connected: its owner deploys from the command line with `vercel --prod --yes` in `eurth-map/`, which needs the Vercel CLI (`npm i -g vercel`, `vercel login`) and the project link that `vercel link` creates in the gitignored `eurth-map/.vercel/`. To connect an existing project: project → Settings → Git → connect the repository, Root Directory `eurth-map`.

## 3. Settings for the suggest form

All of these are environment variables of the Vercel project (Settings → Environment Variables, Production environment). Only the token is required on the original site; a fork needs the first two.

| Variable | Needed | What it is |
|---|---|---|
| `SUGGEST_GITHUB_TOKEN` | always | The secret that lets the function file issues (below) |
| `SUGGEST_GITHUB_REPO` | on a fork | `owner/name` of the repository the issues go to. Without it they go to `a-seth-harrison/eurth-map`, where a fork's token is refused |
| `SUGGEST_ALLOWED_HOSTS` | behind a proxy only | Extra hostnames the form may post from, comma-separated (see "Who may post") |
| `SUGGEST_DRY_RUN` | never in production | Any value: log the would-be issue instead of filing it (section 4) |

### The token

1. GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token.
2. Repository access: **Only select repositories**, pick the repository the issues go to. Permissions: **Issues: Read and write**. Nothing else.
3. Add it to the Vercel project as `SUGGEST_GITHUB_TOKEN`. Redeploy.

Without the variable the function answers 503 and the form reports it. When the token expires GitHub answers 401; the function logs it and viewers see "Could not file the suggestion". Rotate by generating a new token and replacing the variable. The token is never committed: `.env` and `.env.*` are in `.gitignore` and `.vercelignore`.

Issues must be switched on for that repository (a fork has them off by default: repository → Settings → General → Features → Issues). The function labels each issue `suggested-edit`; create the label once with `gh label create suggested-edit` so the first issues carry it.

To apply suggestions from a fork with `data-tools/apply_suggestion.py`, set the same `SUGGEST_GITHUB_REPO` in the shell you run it from.

### Who may post

As a spam guard the function answers 403 unless the request comes from the map itself. It accepts a request whose `Origin` (or `Referer`) host is:

- the host the request was served on, so any Vercel project name and any custom domain added in Vercel work with no setting at all;
- one of the addresses Vercel reports for the deployment (production, branch and deployment URLs);
- `eurth-map.vercel.app` or one of its `eurth-map-…vercel.app` previews;
- `localhost` or `127.0.0.1`;
- a host listed in `SUGGEST_ALLOWED_HOSTS`, for example `map.eurth.org,www.eurth.org`.

The last one is only needed when the browser's address is not the address the function is reached at, which happens when the site is served through a proxy (section 5).

## 4. Testing the suggest form locally

```bash
cd eurth-map
echo SUGGEST_DRY_RUN=1 > .env     # log the would-be issue instead of filing it
vercel dev                        # Vite plus /api/suggest at http://localhost:3000
```

With `SUGGEST_DRY_RUN` set the function prints the issue to the terminal and the form says "dry run, nothing was filed". Put a real `SUGGEST_GITHUB_TOKEN` in `.env` instead to file real issues from your machine.

## 5. A custom domain (for example map.eurth.org)

In Vercel: project → Settings → Domains → add the domain. Vercel shows the DNS record it wants, normally a CNAME to `cname.vercel-dns.com`. Create that record in the domain's DNS (in Cloudflare it can stay proxied or be DNS-only; both work). Vercel issues the HTTPS certificate itself. The suggest form works on the new domain without further setup.

If the domain is instead served through a proxy that fetches from the Vercel deployment (a Cloudflare Worker, for example), the browser sends the custom domain as the Origin while the function is reached at the Vercel address. Add the custom domain to `SUGGEST_ALLOWED_HOSTS` (section 3) and redeploy, or the form gets a 403 while everything else works.

## 6. Hosting somewhere other than Vercel

The static part runs anywhere: Cloudflare Pages, GitHub Pages, Netlify, a plain web server. Build settings are always the same: root `eurth-map`, build `npm run build`, publish `dist`. The site expects to be served from the root of its domain (asset paths start with `/`); to serve it from a sub-path, set `base` in `eurth-map/vite.config.js` and rebuild.

The suggest function is written against the standard `Request` / `Response` API (one exported `POST` handler that calls GitHub's issues endpoint), so it ports to a Cloudflare Worker or a Netlify function with small changes: mount it at `/api/suggest` and give it the variables in section 3. Or leave it out and accept that the button reports an error; to hide the button instead, remove it from `eurth-map/src/components/NationPanel.jsx`.

## 7. Updating the content

None of this needs a redeploy step of its own: commit the changed files and the next deploy picks them up.

- **Nation stats** (population, GDP per capita, land area, capital, wiki link, highlight colour): `eurth-map/src/data/nations.js`, one entry per nation keyed by its id. Or use the review page below. Suggestions filed through the form are applied with `python data-tools/apply_suggestion.py` (needs the `gh` CLI logged in as the repository owner).
- **Map layers** (base map, climate, currents, tectonic): replace the source image in `Overlays/` (same size and background colours as the current one, or adjust the constants at the top of the script), then run `python overlay-tools/build_layers.py` (about a minute). It writes the served WebP files into `eurth-map/public/`. Commit both the source and the generated files.
- **Nation shapes**: when the border map changes, run `python overlay-tools/build_overlays.py` (about 15 seconds). It rewrites `eurth-map/public/overlays.svg`, `nations.geojson` and the traced areas. `python overlay-tools/review_server.py` opens an editor at http://localhost:5180 for assigning territory, fixing border leaks and editing stats.
- Python needs: `pip install numpy pillow opencv-python scipy`.

The generated files in `eurth-map/public/` and `eurth-map/src/data/` are marked as generated in `CLAUDE.md`; never edit them by hand, rerun the script.

## 8. What is not in git

`eurth-map/.env` (local secrets), `eurth-map/.vercel/` (the CLI's project link), `node_modules/`, `dist/`, and the Affinity project files (`*.af`). Everything needed to build and deploy is in the repository apart from the settings in section 3.

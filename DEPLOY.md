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
4. Add the environment variable in section 3, then redeploy (a deployment only sees the variables that existed when it was built).

Once the project is linked to the GitHub repository, every push to the default branch deploys automatically. The owner also deploys from the command line with `vercel --prod --yes` in `eurth-map/`, which needs the Vercel CLI (`npm i -g vercel`, `vercel login`) and the project link that `vercel link` creates in the gitignored `eurth-map/.vercel/`.

## 3. The one secret: the GitHub token for the suggest form

The function files issues on the repository named in `REPO` at the top of `eurth-map/api/suggest.js` (`a-seth-harrison/eurth-map`). To do so it needs a token:

1. GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token.
2. Repository access: **Only select repositories**, pick this repository. Permissions: **Issues: Read and write**. Nothing else.
3. In the Vercel project: Settings → Environment Variables → add `SUGGEST_GITHUB_TOKEN` with the token, for the Production environment. Redeploy.

Without the variable the function answers 503 and the form reports it. When the token expires GitHub answers 401; the function logs it and viewers see "Could not file the suggestion". Rotate by generating a new token and replacing the variable. The token is never committed: `.env` is in `.gitignore` and `.vercelignore`.

If you deploy from a fork, change `REPO` to your repository, or the issues will be filed (or refused) on the original one. `data-tools/apply_suggestion.py` has the same constant.

## 4. Testing the suggest form locally

```bash
cd eurth-map
echo SUGGEST_DRY_RUN=1 > .env     # log the would-be issue instead of filing it
vercel dev                        # Vite plus /api/suggest at http://localhost:3000
```

With `SUGGEST_DRY_RUN` set the function prints the issue to the terminal and the form says "dry run, nothing was filed". Put a real `SUGGEST_GITHUB_TOKEN` in `.env` instead to file real issues from your machine.

## 5. A custom domain (for example map.eurth.org)

Two things, one on each side:

1. **Vercel**: project → Settings → Domains → add the domain. Vercel shows the DNS record it wants, normally a CNAME to `cname.vercel-dns.com`. Create that record in the domain's DNS (in Cloudflare it can stay proxied or be DNS-only; both work). Vercel issues the HTTPS certificate itself.
2. **The origin check in the function**: `originOk()` in `eurth-map/api/suggest.js` only accepts requests from `eurth-map.vercel.app`, Vercel preview URLs and localhost, as a spam guard. Add the new hostname to that list, or the form will get a 403 on the new domain while everything else works.

If the domain is instead served through a proxy (a Cloudflare Worker fetching from the Vercel deployment), the same two steps apply: the browser still sends the custom domain as the Origin, so the hostname must be in the list.

## 6. Hosting somewhere other than Vercel

The static part runs anywhere: Cloudflare Pages, GitHub Pages, Netlify, a plain web server. Build settings are always the same: root `eurth-map`, build `npm run build`, publish `dist`. The site expects to be served from the root of its domain (asset paths start with `/`); to serve it from a sub-path, set `base` in `eurth-map/vite.config.js` and rebuild.

The suggest function is written against the standard `Request` / `Response` API (one exported `POST` handler that calls GitHub's issues endpoint), so it ports to a Cloudflare Worker or a Netlify function with small changes: mount it at `/api/suggest`, give it the token as a secret, and keep the origin list current. Or leave it out and accept that the button reports an error; to hide the button instead, remove it from `eurth-map/src/components/NationPanel.jsx`.

## 7. Updating the content

None of this needs a redeploy step of its own: commit the changed files and the next deploy picks them up.

- **Nation stats** (population, GDP per capita, land area, capital, wiki link, highlight colour): `eurth-map/src/data/nations.js`, one entry per nation keyed by its id. Or use the review page below. Suggestions filed through the form are applied with `python data-tools/apply_suggestion.py` (needs the `gh` CLI logged in as the repository owner).
- **Map layers** (base map, climate, currents, tectonic): replace the source image in `Overlays/` (same size and background colours as the current one, or adjust the constants at the top of the script), then run `python overlay-tools/build_layers.py` (about a minute). It writes the served WebP files into `eurth-map/public/`. Commit both the source and the generated files.
- **Nation shapes**: when the border map changes, run `python overlay-tools/build_overlays.py` (about 15 seconds). It rewrites `eurth-map/public/overlays.svg`, `nations.geojson` and the traced areas. `python overlay-tools/review_server.py` opens an editor at http://localhost:5180 for assigning territory, fixing border leaks and editing stats.
- Python needs: `pip install numpy pillow opencv-python scipy`.

The generated files in `eurth-map/public/` and `eurth-map/src/data/` are marked as generated in `CLAUDE.md`; never edit them by hand, rerun the script.

## 8. What is not in git

`eurth-map/.env` (local secrets), `eurth-map/.vercel/` (the CLI's project link), `node_modules/`, `dist/`, and the Affinity project files (`*.af`). Everything needed to build and deploy is in the repository apart from the token in section 3.

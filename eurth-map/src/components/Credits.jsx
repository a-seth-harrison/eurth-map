// Credit line in the bottom-right corner, in both views. The wording is the owner's
// (2026-10-11); the whole line links to the data license, which has the details. Narrow
// screens (App.css, max-width 600px) show the short form instead, in smaller type.
const DATA_LICENSE_URL = "https://github.com/a-seth-harrison/eurth-map/blob/main/LICENSE-DATA.md";

export default function Credits() {
  return (
    <a className="credits" href={DATA_LICENSE_URL} target="_blank" rel="noopener noreferrer">
      <span className="credits-full">
        Map © Stijn Vogels &amp; Colucci Giovanni, CC BY-NC-ND 4.0, used with permission · Tool by Seth Harrison
      </span>
      {/* non-breaking hyphens (U+2011) and spaces (&nbsp;), so the licence name and the
          owner's name never split across lines */}
      <span className="credits-short">Map © Vogels &amp; Giovanni, CC&nbsp;BY‑NC‑ND&nbsp;4.0 · Tool by Seth&nbsp;Harrison</span>
    </a>
  );
}

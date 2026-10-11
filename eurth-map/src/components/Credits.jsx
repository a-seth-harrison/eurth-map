// Credit line in the bottom-right corner, in both views. The wording is the owner's
// (2026-10-11); the whole line links to the data license, which has the details.
const DATA_LICENSE_URL = "https://github.com/a-seth-harrison/eurth-map/blob/main/LICENSE-DATA.md";

export default function Credits() {
  return (
    <a className="credits" href={DATA_LICENSE_URL} target="_blank" rel="noopener noreferrer">
      Map © Stijn Vogels & Colucci Giovanni, CC BY-NC-ND 4.0, used with permission · Tool by Seth Harrison
    </a>
  );
}

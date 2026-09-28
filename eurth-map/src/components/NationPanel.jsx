import { useState } from "react";
import { formatPopulation, formatGdppc, formatGdp, formatLandArea, MISSING } from "../utils/format";
import SuggestEditForm from "./SuggestEditForm";

export default function NationPanel({ nationKey, nation, landArea, onClose }) {
  // Which nation the form is open for: picking another nation closes it without an effect
  const [openFor, setOpenFor] = useState(null);
  const suggesting = openFor === nationKey;

  if (!nation) return null;

  return (
    <div className="nation-panel">
      <button className="panel-close" onClick={onClose}>×</button>
      <h2>{nation.name}</h2>
      <table>
        <tbody>
          <tr><td>Capital</td><td>{nation.capital ?? MISSING}</td></tr>
          <tr><td>Population</td><td>{formatPopulation(nation.population)}</td></tr>
          <tr><td>GDP per capita</td><td>{formatGdppc(nation.gdppc)}</td></tr>
          <tr><td>GDP</td><td>{formatGdp(nation.population, nation.gdppc)}</td></tr>
          {/* Stated or traced from the map, see data/landArea.js */}
          <tr><td>Land Area</td><td>{formatLandArea(landArea)}</td></tr>
        </tbody>
      </table>
      <a className="iiwiki-link" href={nation.iiwikiLink} target="_blank" rel="noopener noreferrer">
        View on IIWiki →
      </a>
      <button className="suggest-edit" onClick={() => setOpenFor(nationKey)}>Suggest an edit</button>
      {/* Mounted only while open, so every opening starts with a fresh form for this nation */}
      {suggesting && <SuggestEditForm nationKey={nationKey} nation={nation} onClose={() => setOpenFor(null)} />}
    </div>
  );
}

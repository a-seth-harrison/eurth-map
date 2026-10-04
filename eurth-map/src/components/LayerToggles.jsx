import { useEffect, useRef, useState } from "react";
import { OVERLAYS, GRAYSCALE } from "../data/layers";
import { ORGANIZATIONS } from "../data/organizations";

// Phones, upright or on their side: the list would cover too much of the map
const SMALL_SCREEN = "(max-width: 600px), (max-height: 500px)";

// Overlay switches, bottom left above the view switch. `enabled` is { [overlay id]: boolean },
// keyed by image overlay id, the grayscale switch's id or organization id. The title folds the list away on every
// screen (App.css); it starts folded on a small screen and open on a large one. Folded, the
// title says how many switches are on. "Display all organizations" switches every
// organization on, or off when all of them already are; with only some on it shows a dash.
// The organizations themselves sit behind their own fold under it, which starts closed.
export default function LayerToggles({ enabled, onToggle, onSet }) {
  const [open, setOpen] = useState(() => !window.matchMedia(SMALL_SCREEN).matches);
  const [orgsOpen, setOrgsOpen] = useState(false);
  const active = [...OVERLAYS, GRAYSCALE, ...ORGANIZATIONS].filter((o) => enabled[o.id]).length;
  const orgsOn = ORGANIZATIONS.filter((org) => enabled[org.id]).length;
  const allOrgs = orgsOn === ORGANIZATIONS.length;
  const allOrgsBox = useRef(null);
  useEffect(() => {
    // The in-between state exists only as a DOM property
    allOrgsBox.current.indeterminate = orgsOn > 0 && !allOrgs;
  }, [orgsOn, allOrgs]);

  return (
    <div className={"layer-toggles" + (open ? " open" : "")}>
      <button className="layer-toggles-title" aria-expanded={open} onClick={() => setOpen(!open)}>
        Overlays{!open && active > 0 && ` · ${active} on`}
      </button>
      {[...OVERLAYS, GRAYSCALE].map((overlay) => (
        <label key={overlay.id}>
          <input
            type="checkbox"
            checked={!!enabled[overlay.id]}
            onChange={() => onToggle(overlay.id)}
          />
          {overlay.label}
        </label>
      ))}
      <label className="all-organizations">
        <input
          ref={allOrgsBox}
          type="checkbox"
          checked={allOrgs}
          onChange={() => onSet(ORGANIZATIONS.map((org) => org.id), !allOrgs)}
        />
        Display all organizations
      </label>
      <button className="org-list-toggle" aria-expanded={orgsOpen} onClick={() => setOrgsOpen(!orgsOpen)}>
        {orgsOpen ? "Hide the list" : `Choose organizations (${ORGANIZATIONS.length})`}
        {!orgsOpen && orgsOn > 0 && !allOrgs && ` · ${orgsOn} on`}
      </button>
      {orgsOpen && ORGANIZATIONS.map((org) => (
        <label key={org.id}>
          <input type="checkbox" checked={!!enabled[org.id]} onChange={() => onToggle(org.id)} />
          <span className="org-swatch" style={{ background: org.color }} />
          {org.name}
        </label>
      ))}
    </div>
  );
}

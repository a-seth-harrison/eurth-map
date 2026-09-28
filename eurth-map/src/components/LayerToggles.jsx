import { useState } from "react";
import { OVERLAYS } from "../data/layers";

// Overlay switches, bottom left above the view switch. `enabled` is { [overlay id]: boolean }.
// On a small screen the list is folded away behind its title (App.css); `open` unfolds it.
export default function LayerToggles({ enabled, onToggle }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={"layer-toggles" + (open ? " open" : "")}>
      <button className="layer-toggles-title" aria-expanded={open} onClick={() => setOpen(!open)}>
        Overlays
      </button>
      {OVERLAYS.map((overlay) => (
        <label key={overlay.id}>
          <input
            type="checkbox"
            checked={!!enabled[overlay.id]}
            onChange={() => onToggle(overlay.id)}
          />
          {overlay.label}
        </label>
      ))}
    </div>
  );
}

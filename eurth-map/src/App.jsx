import { lazy, Suspense, useState } from "react";
import MapViewer from "./components/MapViewer";
import LayerToggles from "./components/LayerToggles";
import "./App.css";

// three.js is large, so the globe is only downloaded when it is first opened
const GlobeViewer = lazy(() => import("./components/GlobeViewer"));

const VIEWS = { map: "Flat map", globe: "Globe" };

function App() {
  const [view, setView] = useState("map");
  const [overlays, setOverlays] = useState({}); // { [overlay id]: true }, shared by both views

  return (
    <>
      {view === "map" ? (
        <MapViewer overlays={overlays} />
      ) : (
        <Suspense fallback={<div className="view-loading">Loading globe…</div>}>
          <GlobeViewer overlays={overlays} />
        </Suspense>
      )}
      <LayerToggles
        enabled={overlays}
        onToggle={(id) => setOverlays((o) => ({ ...o, [id]: !o[id] }))}
      />
      <div className="view-toggle">
        {Object.entries(VIEWS).map(([key, label]) => (
          <button key={key} className={key === view ? "active" : ""} onClick={() => setView(key)}>
            {label}
          </button>
        ))}
      </div>
    </>
  );
}

export default App;

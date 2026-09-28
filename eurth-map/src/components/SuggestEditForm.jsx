import { useEffect, useRef, useState } from "react";
import { parseNum, formatNumInput } from "../utils/format";
import { landAreaOf } from "../data/landArea";

// The stored stats a viewer may propose a change to, in the panel's order. GDP is derived.
const FIELDS = [
  { id: "name", label: "Full name" },
  { id: "capital", label: "Capital" },
  { id: "population", label: "Population", number: true, hint: "e.g. 48,000,000 or 48 million" },
  { id: "gdppc", label: "GDP per capita", number: true, hint: "A$" },
  { id: "landArea", label: "Land area", number: true, hint: "km²" },
];

// A native <dialog> (top layer, so the phone bottom sheet's height cap does not apply) with the
// nation's stats pre-filled. Submitting posts the changed fields to /api/suggest, which files a
// GitHub issue for the owner; nothing here touches the live data. The panel mounts it only while
// it is open, so it opens itself on mount and every opening starts blank.
export default function SuggestEditForm({ nationKey, nation, onClose }) {
  const dialog = useRef(null);
  const [values, setValues] = useState(() =>
    Object.fromEntries(FIELDS.map((f) => [f.id, f.number ? formatNumInput(nation[f.id]) : nation[f.id] ?? ""])),
  );
  const [handle, setHandle] = useState("");
  const [note, setNote] = useState("");
  const [website, setWebsite] = useState(""); // honeypot: humans never see it
  const [status, setStatus] = useState("idle"); // idle | sending | sent | error
  const [result, setResult] = useState(null); // { url, number, dry } once sent, or an error message

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  // What each box means right now: null = cleared, NaN = not a number
  const typed = {};
  for (const f of FIELDS) {
    const text = values[f.id].trim();
    typed[f.id] = !text ? null : f.number ? parseNum(text) : text;
  }
  const changed = {};
  for (const f of FIELDS) {
    if (!Number.isNaN(typed[f.id]) && typed[f.id] !== (nation[f.id] ?? null)) changed[f.id] = typed[f.id];
  }
  const invalid = FIELDS.some((f) => Number.isNaN(typed[f.id])) || typed.name === null;
  const canSubmit = Object.keys(changed).length > 0 && !invalid && status !== "sending";
  // The panel may show the traced area for this nation (data/landArea.js); the form edits the stated one
  const tracedShown = landAreaOf(nationKey) !== nation.landArea;

  async function submit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setStatus("sending");
    try {
      const res = await fetch("/api/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: nationKey, fields: changed, handle, note, website }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Something went wrong, please try again");
      setResult(data);
      setStatus("sent");
    } catch (err) {
      setResult(err.message);
      setStatus("error");
    }
  }

  return (
    <dialog
      ref={dialog}
      className="suggest-dialog"
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      {status === "sent" ? (
        <div className="suggest-sent">
          <h3>Thanks!</h3>
          <p>Your suggestion for {nation.name} was sent for review.</p>
          {result?.url && (
            <p className="suggest-hint">
              Reference:{" "}
              <a href={result.url} target="_blank" rel="noopener noreferrer">
                #{result.number}
              </a>
              {result.dry && " (dry run — nothing was filed)"}
            </p>
          )}
          <div className="suggest-actions">
            <button type="button" className="primary" onClick={onClose}>Close</button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit}>
          <h3>Suggest an edit</h3>
          <p className="suggest-hint">Change what is wrong for {nation.name}. Clear a box to say the value is unknown.</p>
          {FIELDS.map((f) => {
            const cls = Number.isNaN(typed[f.id]) || (f.id === "name" && typed.name === null) ? "invalid" : f.id in changed ? "changed" : "";
            return (
              <label key={f.id}>
                {f.label}
                {f.hint && <span className="suggest-unit"> · {f.hint}</span>}
                <input
                  className={cls}
                  value={values[f.id]}
                  inputMode={f.number ? "decimal" : "text"}
                  onChange={(e) => setValues({ ...values, [f.id]: e.target.value })}
                />
                {f.id === "landArea" && tracedShown && (
                  <span className="suggest-hint">The map shows the area traced from its border; this edits the stated figure.</span>
                )}
              </label>
            );
          })}
          <label>
            Your name / forum handle (optional)
            <input value={handle} maxLength={60} onChange={(e) => setHandle(e.target.value)} />
          </label>
          <label>
            Source or reason (optional)
            <textarea value={note} maxLength={1000} rows={3} onChange={(e) => setNote(e.target.value)} />
          </label>
          <input
            className="suggest-honeypot"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
          {status === "error" && <p className="suggest-error">{result}</p>}
          <div className="suggest-actions">
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary" disabled={!canSubmit}>
              {status === "sending" ? "Sending…" : "Send for review"}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}

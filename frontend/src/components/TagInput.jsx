import { useState } from "react";

// Chip input: Enter or comma adds an item, Backspace on an empty box removes the last.
export default function TagInput({ id, values, onChange, placeholder, invalid, describedBy }) {
  const [draft, setDraft] = useState("");

  function commit() {
    const v = draft.trim();
    if (v && !values.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...values, v]);
    setDraft("");
  }

  function onKeyDown(e) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit();
    } else if (e.key === "Backspace" && !draft && values.length) {
      onChange(values.slice(0, -1));
    }
  }

  return (
    <div>
      <input
        id={id}
        className="input"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
      />
      {values.length > 0 && (
        <ul className="chips" aria-label="Added items">
          {values.map((v) => (
            <li key={v} className="chip">
              {v}
              <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${v}`}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

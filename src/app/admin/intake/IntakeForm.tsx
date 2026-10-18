"use client";

import { useActionState } from "react";
import { SOURCE_KIND_LABELS } from "@/lib/intake";
import { submitPastedAgents, type IntakeState } from "./actions";

const initialState: IntakeState = { status: "idle" };

const EXAMPLE = `Jane Smith\t1234567\tActive\tKeller Williams\tHoboken\t07030\t201-555-0100
Luis Ortega\t7654321\tActive\tRE/MAX Gold\tJersey City\t07302 07305\t201-555-0144`;

export default function IntakeForm() {
  const [state, formAction, pending] = useActionState(
    submitPastedAgents,
    initialState,
  );

  return (
    <form action={formAction}>
      {state.status === "ok" && state.message ? (
        <div className="notice notice-ok">
          <strong>{state.message}</strong>
        </div>
      ) : null}
      {state.status === "error" && state.message ? (
        <div className="notice notice-bad">{state.message}</div>
      ) : null}

      <div className="field">
        <label htmlFor="pasted">Paste your research</label>
        <textarea
          id="pasted"
          name="pasted"
          className="paste"
          placeholder={EXAMPLE}
          spellCheck={false}
          required
        />
        <p className="hint">
          One agent per line, in this order, separated by a tab or a | character:
          <br />
          <strong>
            Name · Licence number · Licence status · Brokerage · Town · ZIP codes
            · Phone · Source link
          </strong>
          <br />
          Only the name is needed. Leave anything you could not find empty — never
          guess. Copying straight from a spreadsheet works; a heading row is
          ignored.
        </p>
      </div>

      <div className="field">
        <label htmlFor="sourceKind">Where did this come from?</label>
        <select id="sourceKind" name="sourceKind" defaultValue="state_register">
          {(
            Object.keys(SOURCE_KIND_LABELS) as (keyof typeof SOURCE_KIND_LABELS)[]
          ).map((k) => (
            <option key={k} value={k}>
              {SOURCE_KIND_LABELS[k]}
            </option>
          ))}
        </select>
        <p className="hint">
          This decides how each fact is described on the public listing. Only the
          state register and the brokerage&apos;s own site count as confirmed.
        </p>
      </div>

      <div className="field">
        <label htmlFor="batchSourceUrl">Link to the page you used</label>
        <input
          id="batchSourceUrl"
          name="batchSourceUrl"
          type="url"
          placeholder="https://"
        />
        <p className="hint">
          Used for every line that does not have its own link at the end. A
          listing is never saved without a source.
        </p>
      </div>

      <div className="notice notice-info">
        <p style={{ margin: 0 }}>
          Everything you paste goes into the approval queue as a draft. It does
          not appear on the website until an administrator approves it.
        </p>
      </div>

      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Sending for approval…" : "Send for approval"}
      </button>

      {state.failed && state.failed.length > 0 ? (
        <div className="notice notice-warn" style={{ marginTop: 20 }}>
          <strong>These could not be saved:</strong>
          <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
            {state.failed.map((f, i) => (
              <li key={i}>
                {f.name} — {f.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {state.skipped && state.skipped.length > 0 ? (
        <div className="notice notice-warn" style={{ marginTop: 16 }}>
          <strong>These lines were skipped:</strong>
          <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
            {state.skipped.map((s, i) => (
              <li key={i}>
                <span className="mono">Line {s.line}:</span> {s.problems.join("; ")}
                <div className="mono muted">{s.raw}</div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </form>
  );
}

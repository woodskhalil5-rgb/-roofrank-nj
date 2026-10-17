"use client";

import { useActionState } from "react";
import { startZipResearch, type ResearchState } from "./actions";

const initialState: ResearchState = { status: "idle" };

export default function ResearchForm() {
  const [state, formAction, pending] = useActionState(startZipResearch, initialState);

  return (
    <form action={formAction}>
      {state.message ? (
        <div className={state.status === "ok" ? "notice notice-ok" : "notice notice-warn"}>
          {state.message}
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="zip">ZIP code to research</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input id="zip" name="zip" type="text" inputMode="numeric" maxLength={5} required />
          <button className="btn" type="submit" disabled={pending}>
            {pending ? "Running…" : "Run research"}
          </button>
        </div>
        <p className="hint">
          Every run is recorded, including the sources it could not use.
        </p>
      </div>
    </form>
  );
}

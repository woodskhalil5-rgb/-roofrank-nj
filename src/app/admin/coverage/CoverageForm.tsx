"use client";

import { useActionState } from "react";
import { saveZipArea, type CoverageState } from "./actions";

const initialState: CoverageState = { status: "idle" };

export default function CoverageForm() {
  const [state, formAction, pending] = useActionState(saveZipArea, initialState);

  return (
    <form action={formAction}>
      {state.status === "error" && state.message ? (
        <div className="notice notice-bad">{state.message}</div>
      ) : null}
      {state.status === "ok" && state.message ? (
        <div className="notice notice-ok">{state.message}</div>
      ) : null}

      <div className="grid grid-2">
        <div className="field">
          <label htmlFor="zip">ZIP code</label>
          <input id="zip" name="zip" type="text" inputMode="numeric" maxLength={5} required />
        </div>
        <div className="field">
          <label htmlFor="primaryCity">Primary town or city</label>
          <input id="primaryCity" name="primaryCity" type="text" required />
        </div>
      </div>

      <div className="field">
        <label htmlFor="county">County</label>
        <input id="county" name="county" type="text" />
      </div>

      <div className="checkbox-row">
        <input id="isTarget" name="isTarget" type="checkbox" />
        <label htmlFor="isTarget">
          Target area — give this ZIP a public discovery page. Leave unticked
          until there is enough reliable data to publish.
        </label>
      </div>

      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save ZIP area"}
      </button>
    </form>
  );
}

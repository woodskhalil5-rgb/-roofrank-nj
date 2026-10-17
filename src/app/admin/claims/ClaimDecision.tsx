"use client";

import { useActionState } from "react";
import { decideOnClaim, type ClaimDecisionState } from "./actions";

const initialState: ClaimDecisionState = { status: "idle" };

export default function ClaimDecision({ claimId }: { claimId: string }) {
  const [state, formAction, pending] = useActionState(decideOnClaim, initialState);

  return (
    <form action={formAction}>
      {state.status === "error" && state.message ? (
        <div className="notice notice-bad">{state.message}</div>
      ) : null}
      {state.status === "ok" && state.message ? (
        <div className="notice notice-ok">{state.message}</div>
      ) : null}

      <input type="hidden" name="claimId" value={claimId} />

      <div className="field">
        <label htmlFor={`notes-${claimId}`}>How did you verify this person?</label>
        <textarea
          id={`notes-${claimId}`}
          name="notes"
          placeholder="e.g. confirmed on the brokerage's own staff page and matched the licence number on the state register"
        />
      </div>

      <div className="btn-row">
        <button className="btn btn-ok" type="submit" name="decision" value="verify" disabled={pending}>
          Verify claim
        </button>
        <button className="btn btn-bad" type="submit" name="decision" value="reject" disabled={pending}>
          Reject claim
        </button>
      </div>
    </form>
  );
}

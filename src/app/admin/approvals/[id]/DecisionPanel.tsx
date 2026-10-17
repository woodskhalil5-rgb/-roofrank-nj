"use client";

import { useActionState } from "react";
import { decideOnApproval, type DecisionState } from "../actions";

const initialState: DecisionState = { status: "idle" };

export default function DecisionPanel({
  approvalId,
  canDecide,
}: {
  approvalId: string;
  canDecide: boolean;
}) {
  const [state, formAction, pending] = useActionState(decideOnApproval, initialState);

  if (!canDecide) {
    return (
      <div className="notice notice-info">
        Your role can review this draft and its sources, but only an
        administrator can approve, reject or publish it.
      </div>
    );
  }

  return (
    <form action={formAction}>
      {state.status === "error" && state.message ? (
        <div className="notice notice-bad">{state.message}</div>
      ) : null}
      {state.status === "ok" && state.message ? (
        <div className="notice notice-ok">{state.message}</div>
      ) : null}

      <input type="hidden" name="approvalId" value={approvalId} />

      <div className="field">
        <label htmlFor="notes">Decision note</label>
        <textarea
          id="notes"
          name="notes"
          placeholder="Required when rejecting or requesting corrections. Kept in the audit history."
        />
      </div>

      <div className="btn-row">
        <button
          className="btn btn-ok"
          type="submit"
          name="decision"
          value="approve_and_publish"
          disabled={pending}
        >
          Approve and publish
        </button>
        <button
          className="btn btn-secondary"
          type="submit"
          name="decision"
          value="approve_only"
          disabled={pending}
        >
          Approve without publishing
        </button>
        <button
          className="btn btn-warn"
          type="submit"
          name="decision"
          value="request_changes"
          disabled={pending}
        >
          Request corrections
        </button>
        <button
          className="btn btn-secondary"
          type="submit"
          name="decision"
          value="flag"
          disabled={pending}
        >
          Flag for verification
        </button>
        <button
          className="btn btn-bad"
          type="submit"
          name="decision"
          value="reject"
          disabled={pending}
        >
          Reject
        </button>
      </div>
    </form>
  );
}

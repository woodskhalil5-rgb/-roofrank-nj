"use client";

import { useActionState } from "react";
import { retryDelivery, type RetryState } from "./actions";

const initialState: RetryState = { status: "idle" };

export default function RetryButton({
  requestId,
  label,
}: {
  requestId?: string;
  label: string;
}) {
  const [state, formAction, pending] = useActionState(retryDelivery, initialState);

  return (
    <form action={formAction} style={{ display: "inline" }}>
      {requestId ? <input type="hidden" name="requestId" value={requestId} /> : null}
      <button className="btn btn-secondary" type="submit" disabled={pending}>
        {pending ? "Sending…" : label}
      </button>
      {state.message ? (
        <div
          className={state.status === "ok" ? "notice notice-ok" : "notice notice-bad"}
          style={{ marginTop: 10 }}
        >
          {state.message}
        </div>
      ) : null}
    </form>
  );
}

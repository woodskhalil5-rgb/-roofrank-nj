"use client";

import { useActionState } from "react";
import { drainNotifications, type DrainState } from "./actions";

const initialState: DrainState = { status: "idle" };

export default function DrainButton() {
  const [state, formAction, pending] = useActionState(drainNotifications, initialState);

  return (
    <div style={{ marginBottom: 18 }}>
      <form action={formAction}>
        <button className="btn btn-secondary" type="submit" disabled={pending}>
          {pending ? "Attempting delivery…" : "Attempt delivery now"}
        </button>
      </form>
      {state.message ? (
        <div
          className={state.status === "ok" ? "notice notice-ok" : "notice notice-warn"}
          style={{ marginTop: 10 }}
        >
          {state.message}
        </div>
      ) : null}
    </div>
  );
}

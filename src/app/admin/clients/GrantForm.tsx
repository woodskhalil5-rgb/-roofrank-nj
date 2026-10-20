"use client";

import { useActionState } from "react";
import { grantClientAccess, type GrantState } from "./actions";

const initialState: GrantState = { status: "idle" };

export interface Option {
  id: string;
  label: string;
}

export default function GrantForm({
  accounts,
  agents,
  brokerages,
}: {
  accounts: Option[];
  agents: Option[];
  brokerages: Option[];
}) {
  const [state, formAction, pending] = useActionState(
    grantClientAccess,
    initialState,
  );

  if (accounts.length === 0) {
    return (
      <div className="notice notice-info">
        <strong>No client accounts exist yet.</strong>
        <p style={{ margin: "6px 0 0" }}>
          Create the account in Supabase under Authentication → Users. A new
          account has no role and no access until you grant it here, so there is
          no window where it can see anything.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} noValidate>
      {state.status === "error" && state.message ? (
        <div className="notice notice-bad">{state.message}</div>
      ) : null}
      {state.status === "ok" && state.message ? (
        <div className="notice notice-ok">{state.message}</div>
      ) : null}

      <div className="field">
        <label htmlFor="userId">Account</label>
        <select id="userId" name="userId" required defaultValue="">
          <option value="" disabled>
            Choose an account
          </option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-2">
        <div className="field">
          <label htmlFor="agentId">A single listing</label>
          <select id="agentId" name="agentId" defaultValue="">
            <option value="">None</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="brokerageId">Or a whole brokerage</label>
          <select id="brokerageId" name="brokerageId" defaultValue="">
            <option value="">None</option>
            {brokerages.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
          <p className="hint">
            A brokerage grant covers every agent listed under it, including ones
            added later.
          </p>
        </div>
      </div>

      <div className="field">
        <label htmlFor="note">Note</label>
        <input
          id="note"
          name="note"
          type="text"
          placeholder="Who this is and why, for your own records"
        />
      </div>

      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Granting…" : "Grant access"}
      </button>
    </form>
  );
}

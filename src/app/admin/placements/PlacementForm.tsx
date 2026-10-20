"use client";

import { useActionState, useState } from "react";
import { sellPlacement, type PlacementState } from "./actions";

const initialState: PlacementState = { status: "idle" };

export interface SellableAgent {
  id: string;
  name: string;
  brokerage: string | null;
}

/**
 * The categories on offer. These are advertising positions, not awards: the
 * card shows the name and a Sponsored label, and never a figure or a
 * superlative. Anything that reads as a measured claim needs a source, so it
 * does not belong on a paid card at all.
 */
const CATEGORIES = [
  "County Spotlight",
  "Featured Agent",
  "Featured Brokerage",
  "Rising Agent",
];

export default function PlacementForm({
  agents,
  today,
}: {
  agents: SellableAgent[];
  today: string;
}) {
  const [state, formAction, pending] = useActionState(
    sellPlacement,
    initialState,
  );
  const [scope, setScope] = useState<"statewide" | "zip">("statewide");

  const err = state.errors ?? {};

  if (agents.length === 0) {
    return (
      <div className="notice notice-info">
        <strong>No published listings to advertise yet.</strong>
        <p style={{ margin: "6px 0 0" }}>
          A campaign has to point at a page the public can open, so a listing
          must be approved and published before it can be sold a position.
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
        <label htmlFor="agentId">Advertiser</label>
        <select id="agentId" name="agentId" required defaultValue="">
          <option value="" disabled>
            Choose a published listing
          </option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
              {a.brokerage ? ` — ${a.brokerage}` : ""}
            </option>
          ))}
        </select>
        {err.agentId ? (
          <p className="hint" style={{ color: "var(--bad)" }}>{err.agentId}</p>
        ) : null}
      </div>

      <div className="field">
        <label htmlFor="label">Position sold</label>
        <select id="label" name="label" required defaultValue={CATEGORIES[0]}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <p className="hint">
          Shown on the card above the brokerage name, with a Sponsored label
          beside it.
        </p>
      </div>

      <div className="field">
        <label htmlFor="scope">Where it runs</label>
        <select
          id="scope"
          name="scope"
          value={scope}
          onChange={(e) => setScope(e.target.value as "statewide" | "zip")}
        >
          <option value="statewide">Homepage — statewide (3 positions)</option>
          <option value="zip">One town page</option>
        </select>
      </div>

      {scope === "zip" ? (
        <div className="field">
          <label htmlFor="zip">Town ZIP code</label>
          <input
            id="zip"
            name="zip"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{5}"
            maxLength={5}
            placeholder="07042"
          />
          {err.zip ? (
            <p className="hint" style={{ color: "var(--bad)" }}>{err.zip}</p>
          ) : null}
        </div>
      ) : (
        <input type="hidden" name="zip" value="" />
      )}

      <div className="grid grid-2">
        <div className="field">
          <label htmlFor="startsOn">Starts</label>
          <input
            id="startsOn"
            name="startsOn"
            type="date"
            defaultValue={today}
            required
          />
          {err.startsOn ? (
            <p className="hint" style={{ color: "var(--bad)" }}>{err.startsOn}</p>
          ) : null}
        </div>
        <div className="field">
          <label htmlFor="endsOn">Ends</label>
          <input id="endsOn" name="endsOn" type="date" required />
          {err.endsOn ? (
            <p className="hint" style={{ color: "var(--bad)" }}>{err.endsOn}</p>
          ) : null}
          <p className="hint">
            Required. A campaign with no end date would be stored and then shown
            to nobody.
          </p>
        </div>
      </div>

      <div className="field">
        <label htmlFor="monthlyValue">Monthly amount</label>
        <input
          id="monthlyValue"
          name="monthlyValue"
          type="text"
          inputMode="decimal"
          placeholder="650"
          required
        />
        {err.monthlyValue ? (
          <p className="hint" style={{ color: "var(--bad)" }}>
            {err.monthlyValue}
          </p>
        ) : null}
      </div>

      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Recording…" : "Record this placement"}
      </button>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { addProspect, type ProspectState } from "./actions";

const initialState: ProspectState = { status: "idle" };

export default function ProspectForm() {
  const [state, formAction, pending] = useActionState(addProspect, initialState);

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
          <label htmlFor="name">Brokerage name</label>
          <input id="name" name="name" type="text" required />
        </div>
        <div className="field">
          <label htmlFor="sourceUrl">Where you found them</label>
          <input id="sourceUrl" name="sourceUrl" type="url" placeholder="https://" />
        </div>
      </div>

      <div className="field">
        <label htmlFor="summary">Research summary</label>
        <textarea id="summary" name="summary" placeholder="Offices, agent count if reliably published, current marketing, why they might buy." />
      </div>

      <h3 style={{ fontSize: "0.95rem" }}>Decision-maker (optional)</h3>
      <div className="grid grid-2">
        <div className="field">
          <label htmlFor="contactName">Name</label>
          <input id="contactName" name="contactName" type="text" />
        </div>
        <div className="field">
          <label htmlFor="contactTitle">Title</label>
          <input id="contactTitle" name="contactTitle" type="text" />
        </div>
      </div>

      <div className="grid grid-2">
        <div className="field">
          <label htmlFor="contactEmail">Business email</label>
          <input id="contactEmail" name="contactEmail" type="email" />
        </div>
        <div className="field">
          <label htmlFor="contactPhone">Business phone</label>
          <input id="contactPhone" name="contactPhone" type="tel" />
        </div>
      </div>

      <div className="field">
        <label htmlFor="contactBasis">Basis for holding and using this contact detail</label>
        <input
          id="contactBasis"
          name="contactBasis"
          type="text"
          placeholder="e.g. published on the brokerage's own contact page as a business enquiry address"
        />
        <p className="hint">
          Required when a contact is recorded. Outreach to a contact without a
          recorded basis should not be sent.
        </p>
      </div>

      <div className="checkbox-row">
        <input id="isDecisionMaker" name="isDecisionMaker" type="checkbox" />
        <label htmlFor="isDecisionMaker">This person can sign a marketing contract</label>
      </div>

      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Add to pipeline"}
      </button>
    </form>
  );
}

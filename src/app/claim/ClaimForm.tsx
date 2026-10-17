"use client";

import { useActionState } from "react";
import { submitClaim, type ClaimState } from "./actions";

const initialState: ClaimState = { status: "idle" };

export default function ClaimForm({
  agentSlug,
  agentName,
}: {
  agentSlug: string;
  agentName?: string;
}) {
  const [state, formAction, pending] = useActionState(submitClaim, initialState);

  if (state.status === "success") {
    return (
      <div className="notice notice-ok">
        <strong>Claim received.</strong>
        <p style={{ margin: "6px 0 0" }}>{state.message}</p>
      </div>
    );
  }

  const err = state.errors ?? {};

  return (
    <form action={formAction} noValidate>
      {state.status === "error" && state.message ? (
        <div className="notice notice-bad">{state.message}</div>
      ) : null}

      <div className="field">
        <label htmlFor="agentSlug">Profile you are claiming</label>
        <input
          id="agentSlug"
          name="agentSlug"
          type="text"
          defaultValue={agentSlug}
          readOnly={Boolean(agentSlug)}
          placeholder="profile address, e.g. jane-smith"
          required
        />
        {agentName ? <p className="hint">{agentName}</p> : null}
        {err.agentSlug ? <p className="hint" style={{ color: "var(--bad)" }}>{err.agentSlug}</p> : null}
      </div>

      <div className="field">
        <label htmlFor="claimantName">Your full name</label>
        <input id="claimantName" name="claimantName" type="text" autoComplete="name" required />
        {err.claimantName ? <p className="hint" style={{ color: "var(--bad)" }}>{err.claimantName}</p> : null}
      </div>

      <div className="field">
        <label htmlFor="claimantEmail">Work email</label>
        <input id="claimantEmail" name="claimantEmail" type="email" autoComplete="email" required />
        <p className="hint">
          A brokerage email address helps us confirm your affiliation faster.
        </p>
        {err.claimantEmail ? <p className="hint" style={{ color: "var(--bad)" }}>{err.claimantEmail}</p> : null}
      </div>

      <div className="grid grid-2">
        <div className="field">
          <label htmlFor="claimantPhone">Phone</label>
          <input id="claimantPhone" name="claimantPhone" type="tel" autoComplete="tel" />
        </div>
        <div className="field">
          <label htmlFor="licenseNumber">Licence number</label>
          <input id="licenseNumber" name="licenseNumber" type="text" />
        </div>
      </div>

      <div className="field">
        <label htmlFor="brokerage">Current brokerage</label>
        <input id="brokerage" name="brokerage" type="text" />
      </div>

      <div className="field">
        <label htmlFor="evidenceUrl">A page that confirms your role</label>
        <input id="evidenceUrl" name="evidenceUrl" type="url" placeholder="https://" />
        <p className="hint">
          For example your profile on your brokerage&apos;s own website.
        </p>
        {err.evidenceUrl ? <p className="hint" style={{ color: "var(--bad)" }}>{err.evidenceUrl}</p> : null}
      </div>

      <div className="field">
        <label htmlFor="requestedChanges">What should we correct?</label>
        <textarea
          id="requestedChanges"
          name="requestedChanges"
          placeholder="Tell us anything that is wrong or missing, including information you would like removed."
        />
      </div>

      <div className="checkbox-row">
        <input id="attestation" name="attestation" type="checkbox" required />
        <label htmlFor="attestation">
          I confirm that I am this agent, or that I am authorised to act on their
          behalf, and that the information I have given is accurate.
        </label>
      </div>
      {err.attestation ? (
        <p className="hint" style={{ color: "var(--bad)", marginTop: -8 }}>{err.attestation}</p>
      ) : null}

      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Submitting…" : "Submit claim"}
      </button>
      <p className="hint" style={{ marginTop: 10 }}>
        Claiming and correcting a profile is free. We will never change a profile
        on an unverified claim.
      </p>
    </form>
  );
}

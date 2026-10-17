"use client";

import { useActionState } from "react";
import {
  SERVICE_CATEGORIES,
  SERVICE_CATEGORY_LABELS,
  JHP_CONSENT_TEXT,
} from "@/lib/validation";
import {
  submitServiceRequest,
  type ServiceRequestState,
} from "./actions";

const initialState: ServiceRequestState = { status: "idle" };

export default function ServiceRequestForm() {
  const [state, formAction, pending] = useActionState(
    submitServiceRequest,
    initialState,
  );

  if (state.status === "success") {
    return (
      <div className={state.queuedOnly ? "notice notice-info" : "notice notice-ok"}>
        <strong>Request received.</strong>
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

      <input type="hidden" name="sourcePage" value="/home-services" />

      <div className="field">
        <label htmlFor="serviceCategory">Which service do you need?</label>
        <select id="serviceCategory" name="serviceCategory" defaultValue="" required>
          <option value="" disabled>
            Choose a service
          </option>
          {SERVICE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {SERVICE_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        {err.serviceCategory ? <p className="hint" style={{ color: "var(--bad)" }}>{err.serviceCategory}</p> : null}
      </div>

      <div className="field">
        <label htmlFor="requesterName">Your name</label>
        <input id="requesterName" name="requesterName" type="text" autoComplete="name" required />
        {err.requesterName ? <p className="hint" style={{ color: "var(--bad)" }}>{err.requesterName}</p> : null}
      </div>

      <div className="field">
        <label htmlFor="requesterEmail">Email</label>
        <input id="requesterEmail" name="requesterEmail" type="email" autoComplete="email" required />
        {err.requesterEmail ? <p className="hint" style={{ color: "var(--bad)" }}>{err.requesterEmail}</p> : null}
      </div>

      <div className="field">
        <label htmlFor="requesterPhone">Phone</label>
        <input id="requesterPhone" name="requesterPhone" type="tel" autoComplete="tel" required />
        {err.requesterPhone ? <p className="hint" style={{ color: "var(--bad)" }}>{err.requesterPhone}</p> : null}
      </div>

      <div className="field">
        <label htmlFor="streetAddress">Service address</label>
        <input id="streetAddress" name="streetAddress" type="text" autoComplete="street-address" />
      </div>

      <div className="grid grid-2">
        <div className="field">
          <label htmlFor="city">Town or city</label>
          <input id="city" name="city" type="text" autoComplete="address-level2" />
        </div>
        <div className="field">
          <label htmlFor="zip">ZIP code</label>
          <input id="zip" name="zip" type="text" inputMode="numeric" maxLength={5} autoComplete="postal-code" required />
          {err.zip ? <p className="hint" style={{ color: "var(--bad)" }}>{err.zip}</p> : null}
        </div>
      </div>

      <div className="field">
        <label htmlFor="preferredTiming">When would you like this done?</label>
        <input id="preferredTiming" name="preferredTiming" type="text" placeholder="e.g. within two weeks" />
      </div>

      <div className="field">
        <label htmlFor="details">Anything else they should know?</label>
        <textarea id="details" name="details" />
      </div>

      <div className="checkbox-row">
        <input id="consent" name="consent" type="checkbox" required />
        <label htmlFor="consent">{JHP_CONSENT_TEXT}</label>
      </div>
      {err.consent ? (
        <p className="hint" style={{ color: "var(--bad)", marginTop: -8 }}>{err.consent}</p>
      ) : null}

      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send my request"}
      </button>
    </form>
  );
}

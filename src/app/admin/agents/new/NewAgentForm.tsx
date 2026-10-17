"use client";

import { useActionState } from "react";
import { SOURCED_FIELDS, VERIFICATION_OPTIONS } from "@/lib/sourced-fields";
import { createDraftProfile, type DraftState } from "../actions";

const initialState: DraftState = { status: "idle" };

export default function NewAgentForm() {
  const [state, formAction, pending] = useActionState(createDraftProfile, initialState);

  return (
    <form action={formAction}>
      {state.status === "error" && state.message ? (
        <div className="notice notice-bad">{state.message}</div>
      ) : null}
      {state.status === "ok" && state.message ? (
        <div className="notice notice-ok">{state.message}</div>
      ) : null}

      <h3>Agent</h3>
      <div className="grid grid-2">
        <div className="field">
          <label htmlFor="fullName">Full name</label>
          <input id="fullName" name="fullName" type="text" required />
        </div>
        <div className="field">
          <label htmlFor="brokerage">Brokerage</label>
          <input id="brokerage" name="brokerage" type="text" />
        </div>
      </div>

      <div className="grid grid-2">
        <div className="field">
          <label htmlFor="licenseNumber">Licence number</label>
          <input id="licenseNumber" name="licenseNumber" type="text" />
        </div>
        <div className="field">
          <label htmlFor="licenseStatus">Licence status</label>
          <input
            id="licenseStatus"
            name="licenseStatus"
            type="text"
            placeholder="e.g. Active salesperson"
          />
        </div>
      </div>

      <div className="grid grid-2">
        <div className="field">
          <label htmlFor="publicPhone">Public business phone</label>
          <input id="publicPhone" name="publicPhone" type="tel" />
        </div>
        <div className="field">
          <label htmlFor="publicEmail">Public business email</label>
          <input id="publicEmail" name="publicEmail" type="email" />
        </div>
      </div>

      <div className="grid grid-2">
        <div className="field">
          <label htmlFor="website">Business website</label>
          <input id="website" name="website" type="url" placeholder="https://" />
        </div>
        <div className="field">
          <label htmlFor="profileUrl">Public professional profile</label>
          <input id="profileUrl" name="profileUrl" type="url" placeholder="https://" />
        </div>
      </div>

      <div className="grid grid-2">
        <div className="field">
          <label htmlFor="serviceZips">Service ZIP codes</label>
          <input id="serviceZips" name="serviceZips" type="text" placeholder="07030, 07302" />
          <p className="hint">Comma separated. Only ZIPs the agent documents serving.</p>
        </div>
        <div className="field">
          <label htmlFor="specialties">Specialties</label>
          <input id="specialties" name="specialties" type="text" placeholder="First-time buyers, Condos" />
          <p className="hint">Comma separated.</p>
        </div>
      </div>

      <div className="field">
        <label htmlFor="headline">Headline</label>
        <input id="headline" name="headline" type="text" maxLength={160} />
      </div>

      <div className="field">
        <label htmlFor="bio">Biography</label>
        <textarea id="bio" name="bio" />
        <p className="hint">
          If any of this is an AI-generated summary rather than a quotation from
          a source, mark the relevant field below as AI-generated.
        </p>
      </div>

      <hr className="rule" />

      <h3>Sources</h3>
      <p className="muted" style={{ fontSize: "0.86rem" }}>
        Record where each fact came from. A field with no source contributes
        nothing to the ranking and will be shown to visitors as unverified. Do
        not record a source you have not actually checked.
      </p>

      {SOURCED_FIELDS.map((field) => (
        <div className="grid grid-2" key={field.key}>
          <div className="field">
            <label htmlFor={`source_${field.key}`}>{field.label} — source URL</label>
            <input
              id={`source_${field.key}`}
              name={`source_${field.key}`}
              type="url"
              placeholder="https://"
            />
          </div>
          <div className="field">
            <label htmlFor={`verification_${field.key}`}>Status of this fact</label>
            <select
              id={`verification_${field.key}`}
              name={`verification_${field.key}`}
              defaultValue="unverified"
            >
              {VERIFICATION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      ))}

      <div className="notice notice-info">
        Submitting puts this profile in the administrator review queue. It is not
        published, and it cannot be published by anyone other than an
        administrator.
      </div>

      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Submitting…" : "Create draft and submit for approval"}
      </button>
    </form>
  );
}

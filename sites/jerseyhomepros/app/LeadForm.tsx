"use client";
import { useState } from "react";
import { SITE } from "../lib/site";
import type { Trade } from "../lib/trades";
import { sharingConsentText, phoneConsentText, TERMS_ACK } from "../lib/consent";

/**
 * The homeowner request form. The trade is fixed by the page it sits on and is
 * submitted with the lead, so matching can never cross trades.
 */
export default function LeadForm({ trade }: { trade: Trade }) {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setStatus("Sending your request…");
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      const r = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, trade: trade.slug }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Please try again.");
      setDone(true);
      setStatus(`Request received. ${SITE.brand} will follow up soon.`);
      form.reset();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not send your request. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="leadform" onSubmit={submit}>
      <div className="formtitle">
        <span>HOMEOWNER REQUEST</span>
        <b>Tell us about your {trade.label.toLowerCase()} project</b>
      </div>

      {!done && (
        <>
          <div className="formrow">
            <label>Full name<input name="name" required autoComplete="name" placeholder="Your name" /></label>
            <label>Phone number<input name="phone" required type="tel" autoComplete="tel" placeholder="(555) 555-5555" /></label>
          </div>
          <label>Email address<input name="email" required type="email" autoComplete="email" placeholder="you@example.com" /></label>
          <div className="formrow">
            <label>New Jersey ZIP code<input name="zip" required inputMode="numeric" pattern="[0-9]{5}" placeholder="07001" /></label>
            <label>Property type
              <select name="property_type" required defaultValue="">
                <option value="" disabled>Select type</option>
                {SITE.propertyTypes.map((p) => <option key={p}>{p}</option>)}
              </select>
            </label>
          </div>
          <label>What do you need?
            <select name="service" required defaultValue="">
              <option value="" disabled>Choose a service</option>
              {trade.services.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label>When are you looking to start?
            <select name="timing" required defaultValue="">
              <option value="" disabled>Select timing</option>
              {SITE.timings.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label>Project details <span className="optional">(optional)</span>
            <textarea name="details" rows={3} placeholder="Tell us what&rsquo;s going on&hellip;" />
          </label>

          <label className="consent">
            <input type="checkbox" name="consent" value="yes" required />
            <span>
              {sharingConsentText(trade)} {TERMS_ACK}{" "}
              <a href="/privacy">Privacy Notice</a> &middot; <a href="/terms">Terms of Use</a>
            </span>
          </label>

          <label className="consent optionalconsent">
            <input type="checkbox" name="phone_consent" value="yes" />
            <span><b>Optional &mdash; calls and texts.</b> {phoneConsentText(trade)}</span>
          </label>

          <button className="button gold submit" type="submit" disabled={busy}>
            {busy ? "Sending…" : "Send My Request →"}
          </button>
        </>
      )}

      <p className={done ? "formstatus joinok" : "formstatus"} role="status">{status}</p>

      {!done && (
        <small className="formfine">
          Leave the second box unchecked and {trade.companies} will reply by email only.
          Submitting this form does not obligate you to hire anyone.
        </small>
      )}
    </form>
  );
}

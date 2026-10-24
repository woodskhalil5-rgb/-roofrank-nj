"use client";
import { useEffect, useState } from "react";
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
  // Drives whether the phone field is required. Ticking the calls box is the
  // only thing that makes a number necessary — otherwise email is enough, which
  // is exactly what the contractor notification tells them to use.
  const [wantsCalls, setWantsCalls] = useState(false);
  // Set when the homeowner arrived from a directory profile. Read from the URL
  // after mount because the trade pages are statically rendered. The server
  // re-checks the slug; the name here is display only.
  const [pro, setPro] = useState<{ slug: string; name: string } | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const slug = q.get("pro") ?? "";
    if (/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
      setPro({ slug, name: (q.get("pro_name") ?? "").slice(0, 120) });
    }
  }, []);

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
        body: JSON.stringify({ ...data, trade: trade.slug, ...(pro ? { pro: pro.slug } : {}) }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Please try again.");
      setDone(true);
      // The server decides the wording, because only the server knows whether
      // the request actually reached a contractor. A fixed "we'll follow up"
      // string here would promise something the software may not do.
      setStatus(j.message || `Request received. ${SITE.brand} will follow up soon.`);
      form.reset();
      // form.reset() clears the DOM checkbox but not React state, which would
      // leave the phone field required against an unticked box.
      setWantsCalls(false);

      // Conversion signal. Fired only here — after a 2xx from the server with a
      // saved lead — so it can never be triggered by opening or abandoning the
      // form. `lead_id` is the deduplication key; a suppressed duplicate
      // submission reports itself so it is not counted twice. No name, phone,
      // email or ZIP is ever placed in an analytics payload.
      if (!j.duplicate) {
        const w = window as Window & { dataLayer?: unknown[] };
        const layer: unknown[] = w.dataLayer ?? (w.dataLayer = []);
        layer.push({
          event: "lead_submitted",
          trade: trade.slug,
          matched: j.matched ?? 0,
          lead_id: j.lead_id ?? null,
        });
      }
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

      {pro && !done && (
        <p className="profrom">
          Started from {pro.name ? <b>{pro.name}</b> : "a company"}&rsquo;s profile. If your ZIP code is in
          their service area, your request goes to them. Other participating {trade.companies} covering
          your ZIP may receive it too.
        </p>
      )}

      {!done && (
        <>
          <div className="formrow">
            <label>Full name<input name="name" required autoComplete="name" placeholder="Your name" /></label>
            <label>
              Phone number {!wantsCalls && <span className="optional">(optional)</span>}
              <input
                name="phone"
                type="tel"
                autoComplete="tel"
                required={wantsCalls}
                placeholder="(555) 555-5555"
              />
            </label>
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
            <textarea
              name="details"
              rows={3}
              placeholder={trade.detailsHint ?? "Tell us what’s going on…"}
            />
          </label>

          <label className="consent">
            <input type="checkbox" name="consent" value="yes" required />
            <span>
              {sharingConsentText(trade)} {TERMS_ACK}{" "}
              <a href="/privacy">Privacy Notice</a> &middot; <a href="/terms">Terms of Use</a>
            </span>
          </label>

          {/* Unticked by default and worded exactly as stored. Ticking it is
              what makes the phone field required, never the reverse. */}
          <label className="consent optionalconsent">
            <input
              type="checkbox"
              name="phone_consent"
              value="yes"
              checked={wantsCalls}
              onChange={(e) => setWantsCalls(e.target.checked)}
            />
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

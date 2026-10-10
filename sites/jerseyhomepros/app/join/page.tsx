"use client";
import { useState } from "react";
import { SITE } from "../../lib/site";
import { TRADES, TRADE_SLUGS, type TradeSlug } from "../../lib/trades";
import { Brand } from "../Brand";

export default function Join() {
  const [tradeSlug, setTradeSlug] = useState<TradeSlug>("roofing");
  const [status, setStatus] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const trade = TRADES[tradeSlug];

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setStatus("Sending your application…");
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      const r = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Please try again.");
      const ignored: string[] = j.ignored_zips ?? [];
      setDone(true);
      setStatus(
        `Application received. We’ll review it and be in touch.` +
          (ignored.length ? ` Note: we couldn’t recognise ${ignored.join(", ")} as NJ ZIP codes.` : "")
      );
      form.reset();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not send your application. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="simplepage">
      <Brand />
      <div className="simplecard">
        <div className="eyebrow dark">FOR CONTRACTORS</div>
        <h1>{SITE.join.h1}</h1>
        <p>{SITE.join.p} Approved companies receive homeowner requests in their trade and service area by email.</p>

        {!done && (
          <form onSubmit={submit}>
            <label>Your trade
              <select name="trade" required value={tradeSlug}
                      onChange={(e) => setTradeSlug(e.target.value as TradeSlug)}>
                {TRADE_SLUGS.map((s) => <option key={s} value={s}>{TRADES[s].label}</option>)}
              </select>
              <small className="fieldhint">You will only ever receive {trade.label.toLowerCase()} requests.</small>
            </label>
            <label>Company name<input required name="company" placeholder="Company name" /></label>
            <label>Contact name<input required name="contact" placeholder="Your name" /></label>
            <label>Business email<input required name="email" type="email" placeholder="you@company.com" /></label>
            <label>Business phone<input required name="phone" type="tel" placeholder="Business phone" /></label>
            <label>Service area ZIP codes
              <textarea required name="areas" rows={3} placeholder="08002, 08003, 08034" />
              <small className="fieldhint">Enter the 5-digit NJ ZIP codes at the centre of your service area, separated by commas.</small>
            </label>
            <label>How far will you travel?
              <select required name="radius_miles" defaultValue="25">
                <option value="10">Up to 10 miles</option>
                <option value="25">Up to 25 miles</option>
                <option value="40">Up to 40 miles</option>
                <option value="60">Up to 60 miles</option>
                <option value="100">Anywhere in New Jersey</option>
              </select>
            </label>
            <label>Services offered
              <select required name="services" defaultValue="">
                <option value="" disabled>Select primary service</option>
                {trade.providerServices.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
            <button className="button gold submit" disabled={busy}>
              {busy ? "Sending…" : "Submit Application →"}
            </button>
            <small className="fieldhint">Applications are reviewed before any homeowner details are shared.</small>
          </form>
        )}

        <p role="status" className={done ? "joinok" : undefined}>{status}</p>
      </div>
    </main>
  );
}

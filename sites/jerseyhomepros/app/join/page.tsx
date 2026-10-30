"use client";
import { useState } from "react";
import { SITE } from "../../lib/site";
import { TRADES, TRADE_SLUGS, type TradeSlug } from "../../lib/trades";
import { Brand } from "../Brand";
import { getAttribution, track } from "../../lib/track";

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
    const fd = new FormData(form);
    const insurance = fd.get("insurance");
    fd.delete("insurance");
    const data = Object.fromEntries(fd.entries());
    try {
      const r = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, attribution: getAttribution() }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Please try again.");
      const ignored: string[] = j.ignored_zips ?? [];
      // Insurance certificate goes up separately, with the one-time token.
      let docNote = "";
      if (insurance instanceof File && insurance.size > 0 && j.doc_token) {
        setStatus("Uploading your insurance certificate…");
        const up = new FormData();
        up.append("token", j.doc_token);
        up.append("file", insurance);
        const ur = await fetch("/api/providers/doc", { method: "POST", body: up });
        const uj = await ur.json().catch(() => ({}));
        docNote = ur.ok ? " Your insurance certificate was received." : ` (Insurance upload didn’t go through: ${uj.error ?? "try again later from your dashboard"}.)`;
      }
      setDone(true);
      track("contractor_application", { trade: String(data.trade ?? "") });
      setStatus(
        `Application received. We’ll review it and be in touch.` + docNote +
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
        <p>Already in the network? <a href="/account" style={{ textDecoration: "underline" }}>Sign in to your dashboard</a>.</p>

        <div className="joindeal">
          <h2>How it works</h2>
          <div className="joinlanes">
            <section>
              <h3>Website requests</h3>
              <ul>
                <li><b>Nothing up front.</b> No sign-up fee, no monthly fee, no charge per lead.</li>
                <li><b>10% of the job</b> when you sign a homeowner from a {SITE.brand} request, due once the homeowner has paid you.</li>
                <li>Each request goes to <b>at most 3 companies</b> in your trade that cover the homeowner&rsquo;s ZIP. Verified companies are offered first, then the closest.</li>
                <li>Requests arrive by email the moment they&rsquo;re sent, and show in your dashboard.</li>
              </ul>
            </section>
            <section>
              <h3>JHP estimate jobs</h3>
              <ul>
                <li>Separate from website requests. A JHP Road Pro has already visited the home, measured the job and taken photos.</li>
                <li><b>Sent to one company only</b>: yours.</li>
                <li><b>10% of the signed job</b>, due once the homeowner has paid you. If the homeowner doesn&rsquo;t sign, you owe nothing.</li>
              </ul>
            </section>
          </div>
          <p className="joinfine">
            Partners sign a short written agreement covering these terms before receiving work.
            <b> Verified badge:</b> upload your NJ Home Improvement Contractor registration number or insurance certificate.
            Once {SITE.brand} checks it, your profile shows &ldquo;Verified&rdquo; with the date. You can sign up without it.
          </p>
        </div>

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
              {/* key remounts the select when the trade changes, so a service
                  picked under the previous trade cannot be submitted with it. */}
              <select required name="services" defaultValue="" key={tradeSlug}>
                <option value="" disabled>Select primary service</option>
                {trade.providerServices.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label>NJ Home Improvement Contractor (HIC) number <span className="optional">(optional, for the Verified badge)</span>
              <input name="hic_number" placeholder="13VH01234567" maxLength={20} />
            </label>
            <label>Certificate of insurance <span className="optional">(optional, PDF or photo, for the Verified badge)</span>
              <input name="insurance" type="file" accept="application/pdf,image/*" />
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

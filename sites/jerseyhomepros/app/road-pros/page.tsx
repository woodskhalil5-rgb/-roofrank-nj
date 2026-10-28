"use client";
import { useState } from "react";
import { Brand } from "../Brand";
import { RP_CONSENT } from "../../lib/consent";

/**
 * Road Pro recruiting page. Describes the role as it is today: commission on
 * signed jobs (a cut of what JHP earns, set in a written agreement), no
 * earnings promises, background check required before any visit.
 */
export default function RoadPros() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    setBusy(true); setMsg("Sending…");
    try {
      const r = await fetch("/api/road-pros", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: f.get("name"), email: f.get("email"), phone: f.get("phone"), home_zip: f.get("home_zip"),
          has_car: f.get("has_car") === "yes", availability: f.get("availability"), experience: f.get("experience"),
          consent: f.get("consent") === "yes", company_site: f.get("company_site"),
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Couldn't send that. Please try again.");
      setDone(true); setMsg("Application received. Check your email for next steps.");
    } catch (err) { setMsg(err instanceof Error ? err.message : "Couldn't send that."); }
    finally { setBusy(false); }
  }

  return (
    <main className="simplepage">
      <Brand />
      <div className="simplecard rppage">
        <div className="eyebrow dark">NOW HIRING · SOUTH JERSEY</div>
        <h1>Become a JHP Road Pro.</h1>
        <p>
          Road Pros visit homeowners who asked for a free estimate, take photos and measurements (about 15 minutes,
          ground level only), and help them move forward with one contractor. You don&rsquo;t need trade experience:
          the JHP app walks you through every visit, step by step, and sets the price range for you.
        </p>
        <h2>How it works</h2>
        <ul>
          <li><b>Paid by commission</b> on jobs that sign: a cut of what Jersey Home Pros earns, set in a written agreement before you start.</li>
          <li><b>Your schedule.</b> Take visits near where you live.</li>
          <li><b>Background check required</b> before your first visit, through a screening company and only with your written permission.</li>
          <li>You&rsquo;ll need: to be 18+, a car, a smartphone, and a valid driver&rsquo;s license.</li>
        </ul>

        {done ? <p className="joinok formstatus">{msg}</p> : (
          <form onSubmit={submit}>
            <label>Full name<input name="name" required autoComplete="name" /></label>
            <label>Email<input name="email" type="email" required autoComplete="email" /></label>
            <label>Phone<input name="phone" type="tel" required autoComplete="tel" /></label>
            <label>Your home ZIP<input name="home_zip" required inputMode="numeric" pattern="[0-9]{5}" maxLength={5} /></label>
            <label className="consent"><input type="checkbox" name="has_car" value="yes" /><span>I have a reliable car.</span></label>
            <label>When can you do visits? <span className="optional">(optional)</span><input name="availability" placeholder="Weekday evenings, Saturdays…" /></label>
            <label>Anything we should know? <span className="optional">(optional)</span>
              <textarea name="experience" rows={3} placeholder="Sales, customer service, construction, anything that applies" /></label>
            <input name="company_site" tabIndex={-1} autoComplete="off" className="hp" aria-hidden="true" />
            <label className="consent"><input type="checkbox" name="consent" value="yes" required /><span>{RP_CONSENT}</span></label>
            <button className="button gold submit" type="submit" disabled={busy}>{busy ? "Sending…" : "Apply"} <span>→</span></button>
            {msg && <p className="formstatus" role="status">{msg}</p>}
          </form>
        )}
      </div>
    </main>
  );
}

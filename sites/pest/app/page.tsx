"use client";
import { useState } from "react";
import { SITE } from "../lib/site";
import { SHARING_CONSENT_TEXT, PHONE_CONSENT_TEXT, TERMS_ACK } from "../lib/consent";

export default function Home() {
  const [status, setStatus] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("Sending your request…");
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      const r = await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Please try again.");
      setStatus(`Request received. ${SITE.brand} will follow up soon.`);
      form.reset();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not send your request. Please try again.");
    }
  }
  return <main>
    <nav className="nav wrap">
      <a className="brand" href="#"><span className="brandmark">{SITE.mark}</span><span>{SITE.wordmark} <b>NJ</b><small>{SITE.subMark}</small></span></a>
      <a className="navcta" href="#estimate">Get an Estimate <span>↗</span></a>
    </nav>

    <section className="hero"><div className="heroShade"></div>
      <div className="wrap heroContent">
        <div className="eyebrow"><i></i> {SITE.hero.eyebrow}</div>
        <h1>{SITE.hero.line1}<br/><em>{SITE.hero.lineEm}</em><br/>{SITE.hero.line2}</h1>
        <p>{SITE.hero.sub}</p>
        <div className="heroActions">
          <a className="button gold" href="#estimate">Request a Free Estimate <span>→</span></a>
          <a className="textlink" href="#how">How it works <span>↓</span></a>
        </div>
        <div className="trustline"><span>◆</span> One request. Local options. Your decision.</div>
      </div>
      <div className="heroTag"><b>{SITE.wordmark} NJ</b><span>BUILT FOR NEW JERSEY HOMEOWNERS</span></div>
    </section>

    <section className="proof"><div className="wrap proofgrid">
      {SITE.proof.map((t, i) => <div key={t}><strong>{String(i + 1).padStart(2, "0")}</strong><span>{t}</span></div>)}
    </div></section>

    <section className="section wrap" id="how">
      <div className="sectionhead">
        <div className="eyebrow dark">A BETTER STARTING POINT</div>
        <h2>{SITE.how.h2a}<br/><em>{SITE.how.h2em}</em></h2>
        <p>{SITE.how.p}</p>
      </div>
      <div className="servicegrid">
        {SITE.cards.map(c => <article key={c.title}><span className="serviceicon">{c.icon}</span><h3>{c.title}</h3><p>{c.body}</p></article>)}
      </div>
    </section>

    <section className="estimate" id="estimate"><div className="wrap estimategrid">
      <div className="estimatecopy">
        <div className="eyebrow"><i></i> GET STARTED</div>
        <h2>{SITE.estimate.h2a}<br/><em>{SITE.estimate.h2em}</em></h2>
        <p>{SITE.estimate.p}</p>
        <div className="privacyNote"><span>◈</span><p><b>Your request, handled with care.</b><br/>Your contact and project details may be shared with relevant participating {SITE.companies} so they can respond to your request.</p></div>
      </div>
      <form className="leadform" onSubmit={submit}>
        <div className="formtitle"><span>HOMEOWNER REQUEST</span><b>Tell us about your project</b></div>
        <div className="formrow">
          <label>Full name<input name="name" required autoComplete="name" placeholder="Your name"/></label>
          <label>Phone number<input name="phone" required type="tel" autoComplete="tel" placeholder="(555) 555-5555"/></label>
        </div>
        <label>Email address<input name="email" required type="email" autoComplete="email" placeholder="you@example.com"/></label>
        <div className="formrow">
          <label>New Jersey ZIP code<input name="zip" required inputMode="numeric" pattern="[0-9]{5}" placeholder="07001"/></label>
          <label>Property type<select name="property_type" required defaultValue=""><option value="" disabled>Select type</option>{SITE.propertyTypes.map(p => <option key={p}>{p}</option>)}</select></label>
        </div>
        <label>What do you need?<select name="service" required defaultValue=""><option value="" disabled>Choose a service</option>{SITE.services.map(s => <option key={s}>{s}</option>)}</select></label>
        <label>When are you looking to start?<select name="timing" required defaultValue=""><option value="" disabled>Select timing</option>{SITE.timings.map(t => <option key={t}>{t}</option>)}</select></label>
        <label>Project details <span className="optional">(optional)</span><textarea name="details" rows={3} placeholder="Tell us what’s going on…"/></label>
        <label className="consent"><input type="checkbox" name="consent" value="yes" required/><span>{SHARING_CONSENT_TEXT} {TERMS_ACK} <a href="/privacy">Privacy Notice</a> · <a href="/terms">Terms of Use</a></span></label>
        <label className="consent optionalconsent"><input type="checkbox" name="phone_consent" value="yes"/><span><b>Optional — calls and texts.</b> {PHONE_CONSENT_TEXT}</span></label>
        <button className="button gold submit" type="submit">Send My Request <span>→</span></button>
        <p className="formstatus" role="status">{status}</p>
        <small className="formfine">Leave the second box unchecked and {SITE.companies} will reply by email only. Submitting this form does not obligate you to hire anyone.</small>
      </form>
    </div></section>

    <section className="rooferbar"><div className="wrap rooferinner">
      <div><div className="eyebrow dark">FOR {SITE.trade.toUpperCase()} COMPANIES</div><h2>{SITE.providerBar.h2}</h2><p>{SITE.providerBar.p}</p></div>
      <a className="button darkbtn" href="/join">Join the {SITE.wordmark} Network <span>→</span></a>
    </div></section>

    <footer><div className="wrap footinner">
      <a className="brand" href="#"><span className="brandmark">{SITE.mark}</span><span>{SITE.wordmark} <b>NJ</b><small>{SITE.subMark}</small></span></a>
      <div className="footlinks"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/join">For Pros</a></div>
      <span className="copyright">© {new Date().getFullYear()} {SITE.brand}</span>
    </div><div className="wrap disclaimer">{SITE.disclaimer}</div></footer>
  </main>;
}

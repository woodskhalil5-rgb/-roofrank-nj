"use client";
import { useState } from "react";
import { SITE } from "../../lib/site";
import { TRADES, TRADE_SLUGS, type TradeSlug } from "../../lib/trades";
import { Brand } from "../Brand";

/**
 * The missed-call recovery offer, for contractors.
 *
 * Every claim on this page is written in the future tense on purpose. The
 * product does not exist yet, and a contractor who believes it is already
 * running will find out the first time he misses a call. Scarcity here is
 * real — the operator genuinely can only onboard a few at once — so it does
 * not need to be manufactured.
 */
export default function Receptionist() {
  const [status, setStatus] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setStatus("Sending…");
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      const r = await fetch("/api/receptionist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Please try again.");
      setDone(true);
      setStatus("Got it. I'll call you back personally to walk through it — no obligation.");
      form.reset();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not send. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="simplepage">
      <Brand />
      <div className="simplecard">
        <div className="eyebrow dark">FOR CONTRACTORS</div>
        <h1>The job you lost today was a call you didn&rsquo;t pick up.</h1>

        <p>
          You were on a roof, under a sink, or driving. It rang, it went to voicemail,
          and by the time you listened they&rsquo;d already booked the next company on
          the list. That is the most expensive thing that happens in your week, and it
          happens quietly.
        </p>

        <h2>What {SITE.brand} is turning on</h2>
        <p>
          When a call to your business goes unanswered, the caller gets a text back
          within seconds &mdash; in your company&rsquo;s name &mdash; asking what they
          need. Most people answer a text. The conversation lands in your phone, the
          job stays yours, and you never had to climb down.
        </p>
        <p>
          It covers <b>every call to your line</b>, not just the ones I send you. The
          customer who found you on a truck magnet four years ago is worth the same as
          a new lead, and right now you&rsquo;re losing both the same way.
        </p>

        <div className="privacyNote">
          <span>◈</span>
          <p>
            <b>Being straight with you about where this is.</b>
            <br />
            This isn&rsquo;t live yet. I&rsquo;m building it now and turning it on for
            my first few contractors over the coming weeks, one at a time, because I
            want to watch each one work before I add the next. If you want a slot, put
            your name down and I&rsquo;ll call you myself. Nothing to pay and nothing
            to sign today.
          </p>
        </div>

        <h2>Why me and not one of the big ones</h2>
        <p>
          The lead networks sell the same homeowner to eight companies and let you
          fight over it. I send a request to the company it fits, and the email tells
          you in writing how many others got it &mdash; usually none. This is the same
          idea pointed at your own phone: fewer things lost, not more things sold.
        </p>

        {!done && (
          <form onSubmit={submit}>
            <label>
              Company name
              <input required name="company" placeholder="Company name" />
            </label>
            <label>
              Your name
              <input required name="contact" placeholder="Your name" />
            </label>
            <label>
              Business phone
              <input required name="phone" type="tel" placeholder="(856) 555-0100" />
            </label>
            <label>
              Email
              <input required name="email" type="email" placeholder="you@company.com" />
            </label>
            <label>
              Your trade <span className="optional">(optional)</span>
              <select name="trade" defaultValue="">
                <option value="">Select your trade</option>
                {TRADE_SLUGS.map((s) => (
                  <option key={s} value={s}>
                    {TRADES[s].label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Roughly how many calls a week do you miss?
              <select name="missed_estimate" defaultValue="">
                <option value="">Best guess</option>
                <option>Hardly any</option>
                <option>1 to 3</option>
                <option>4 to 10</option>
                <option>More than 10</option>
                <option>No idea, and that&rsquo;s the problem</option>
              </select>
            </label>
            <label>
              Who answers the phone now?
              <select name="current_setup" defaultValue="">
                <option value="">Select one</option>
                <option>Just me</option>
                <option>Me and my wife or partner</option>
                <option>An office person</option>
                <option>An answering service</option>
                <option>Voicemail</option>
              </select>
            </label>
            <button className="button gold submit" disabled={busy}>
              {busy ? "Sending…" : "Hold a slot for me →"}
            </button>
            <small className="fieldhint">
              This puts your name on a list and nothing else. No card, no contract, and
              I&rsquo;ll tell you the price before you ever owe anything.
            </small>
          </form>
        )}

        <p role="status" className={done ? "joinok" : undefined}>
          {status}
        </p>
      </div>
    </main>
  );
}

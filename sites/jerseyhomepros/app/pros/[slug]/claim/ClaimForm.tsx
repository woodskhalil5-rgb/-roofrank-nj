"use client";
import { useState } from "react";

export default function ClaimForm({ slug, company }: { slug: string; company: string }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setNote("Sending…");
    const f = Object.fromEntries(new FormData(e.currentTarget).entries());
    try {
      const r = await fetch("/api/pros/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, slug, confirm: f.confirm === "yes" }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Couldn't send your claim.");
      setDone(true);
      setNote(
        `Thanks. We'll confirm you work for ${company} — usually with a call to the company's listed number — then email you a link to set up your dashboard.`
      );
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Couldn't send your claim.");
    } finally {
      setBusy(false);
    }
  }

  if (done) return <p role="status" className="joinok">{note}</p>;

  return (
    <form onSubmit={submit}>
      <label>Your name<input name="contact" required autoComplete="name" /></label>
      <label>Your role <span className="optional">(optional)</span><input name="role" placeholder="Owner, office manager…" /></label>
      <label>Work email<input name="email" type="email" required autoComplete="email" /></label>
      <label>Phone<input name="phone" type="tel" required autoComplete="tel" placeholder="(856) 555-5555" /></label>
      <label className="consent">
        <input type="checkbox" name="confirm" value="yes" required />
        <span>I work for {company} and I&rsquo;m allowed to manage its listing.</span>
      </label>
      <button className="button gold submit" disabled={busy}>Send claim &rarr;</button>
      <p role="status">{note}</p>
    </form>
  );
}

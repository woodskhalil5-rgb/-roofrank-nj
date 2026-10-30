"use client";
import { useState } from "react";

/** Contractor dashboard: submit HIC number / insurance for the Verified badge. */
export default function VerifyBox({ token, hic, insuranceAt, verifiedAt, onDone }: {
  token: string; hic: string; insuranceAt: string | null; verifiedAt: string | null; onDone: () => void;
}) {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = e.currentTarget;
    setBusy(true); setMsg("Sending…");
    try {
      const r = await fetch("/api/account/verify", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: new FormData(form) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Couldn't send that.");
      setMsg("Received. We'll check it and your profile will show Verified once it's confirmed.");
      form.reset(); onDone();
    } catch (err) { setMsg(err instanceof Error ? err.message : "Couldn't send that."); }
    finally { setBusy(false); }
  }

  return (
    <section className="acctcard">
      <h2>Get Verified</h2>
      {verifiedAt
        ? <p className="consentok">✓ Verified since {day(verifiedAt)}. Your profile shows the badge, and verified companies are offered requests first.</p>
        : <p>Verified companies are offered requests first and show a Verified badge. Send your NJ Home Improvement Contractor registration number or a certificate of insurance, and we&rsquo;ll check it.</p>}
      <p className="adminmeta">On file: HIC {hic ? `#${hic}` : "none"} · insurance {insuranceAt ? `uploaded ${day(insuranceAt)}` : "none"}</p>
      <form onSubmit={submit}>
        <label>HIC registration number<input name="hic_number" defaultValue={hic} maxLength={20} placeholder="13VH01234567" /></label>
        <label>Certificate of insurance (PDF or photo)<input name="file" type="file" accept="application/pdf,image/*" /></label>
        <button className="button gold" type="submit" disabled={busy}>{busy ? "Sending…" : "Send for verification"} <span>&#8594;</span></button>
      </form>
      {msg && <p className="adminmeta">{msg}</p>}
    </section>
  );
}

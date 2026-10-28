"use client";
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

/** Road Pro: choose a password from the emailed link, then open the app. */
export default function RoadProSetup() {
  const [token, setToken] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setToken(new URLSearchParams(window.location.search).get("token") ?? ""); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (pw.length < 8) { setNote("Use at least 8 characters."); return; }
    if (pw !== pw2) { setNote("Those passwords don't match."); return; }
    setBusy(true); setNote("Saving…");
    try {
      const r = await fetch("/api/estimator/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password: pw }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Couldn't save that password.");
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (url && key) await createClient(url, key).auth.signInWithPassword({ email: j.email, password: pw });
      window.location.href = "/estimator";
    } catch (err) { setNote(err instanceof Error ? err.message : "Something went wrong."); }
    finally { setBusy(false); }
  }

  return (
    <main className="estpage">
      <div className="estbar"><a className="brand" href="/estimator"><span className="brandmark">J</span><span>JHP <b>ROAD PRO</b></span></a></div>
      <form className="estcard estsignin" onSubmit={submit}>
        <h1>Choose a password</h1>
        {!token ? <p>This page needs the link from your email.</p> : (
          <>
            <label>Password<input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required /></label>
            <label>Same again<input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required /></label>
            <button className="button gold" type="submit" disabled={busy}>Save and open the app <span>→</span></button>
          </>
        )}
        {note && <p className="estnote">{note}</p>}
      </form>
    </main>
  );
}

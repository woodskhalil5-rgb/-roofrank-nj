"use client";
import { useEffect, useState } from "react";
import { SITE } from "../../../lib/site";
import { sb } from "../sb";

/** Landing page for the emailed setup / reset link: choose a password, then sign in. */
export default function AccountSetup() {
  const [token, setToken] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token") ?? "");
  }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    if (pw.length < 8) { setNote("Use at least 8 characters."); return; }
    if (pw !== pw2) { setNote("Those passwords don't match."); return; }
    setBusy(true);
    setNote("Saving…");
    try {
      const r = await fetch("/api/account/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: pw }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Couldn't save that password.");
      const c = sb();
      if (c) {
        const { error } = await c.auth.signInWithPassword({ email: j.email, password: pw });
        if (error) throw new Error("Password saved. Sign in on the next page.");
      }
      window.location.href = "/account";
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Something went wrong.");
      if (err instanceof Error && err.message.startsWith("Password saved")) {
        setTimeout(() => { window.location.href = "/account"; }, 1500);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="simplepage">
      <a className="back" href="/">&larr; {SITE.brand}</a>
      <div className="simplecard">
        <div className="eyebrow dark">PRO DASHBOARD</div>
        <h1>Choose a password.</h1>
        {!token ? (
          <p>
            This page needs the link from your email. If you don&rsquo;t have one,{" "}
            <a href="/account" style={{ textDecoration: "underline" }}>ask for a new link</a>.
          </p>
        ) : (
          <form onSubmit={submit}>
            <label>
              New password
              <input type="password" required minLength={8} autoComplete="new-password"
                     value={pw} onChange={(e) => setPw(e.target.value)} />
            </label>
            <label>
              Same password again
              <input type="password" required minLength={8} autoComplete="new-password"
                     value={pw2} onChange={(e) => setPw2(e.target.value)} />
            </label>
            <button className="button gold submit" disabled={busy}>Save and sign in &rarr;</button>
          </form>
        )}
        <p role="status">{note}</p>
      </div>
    </main>
  );
}

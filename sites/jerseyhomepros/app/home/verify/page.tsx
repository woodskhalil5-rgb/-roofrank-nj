"use client";
import { useEffect, useState } from "react";
import { SITE } from "../../../lib/site";

/**
 * Landing page for the emailed sign-in link. The token is only spent when the
 * person presses the button (a POST), so an email scanner opening the link
 * first doesn't use it up.
 */
export default function VerifyPage() {
  const [token, setToken] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("t") ?? "");
  }, []);

  async function go() {
    setBusy(true);
    setNote("Signing you in…");
    const r = await fetch("/api/home/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ t: token }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      window.location.replace("/home");
      return;
    }
    setBusy(false);
    setNote(j.error ?? "Something went wrong. Request a new link.");
  }

  return (
    <main className="simplepage">
      <a className="back" href="/">&larr; {SITE.brand}</a>
      <div className="simplecard">
        <div className="eyebrow dark">YOUR HOME BOARD</div>
        <h1>Welcome back.</h1>
        <p>Tap the button to finish signing in. This link works once.</p>
        <button className="button gold submit" type="button" onClick={go} disabled={busy || !token}>
          Sign in to my Home Board <span>&#8594;</span>
        </button>
        {note && <p role="status">{note}</p>}
        {note && !busy && <p><a className="textlink" href="/home">Request a new link &rarr;</a></p>}
      </div>
    </main>
  );
}

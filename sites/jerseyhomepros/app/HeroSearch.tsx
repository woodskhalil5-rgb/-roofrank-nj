"use client";
import { useState } from "react";
import { guessTrades } from "../lib/problems";
import { TRADES, TRADE_SLUGS, type TradeSlug } from "../lib/trades";
import { ScanPanel } from "./HomeMap";

/**
 * "Type the problem" search in the homepage hero. It runs the same Home Scan
 * moment as tapping the house: the words pick a trade (fixed keyword list,
 * never a diagnosis), then the panel loads and shows the live count for the
 * ZIP. If the words don't match a trade, the homeowner picks one. Without
 * JavaScript the form still works: it submits to /pros?q=…&zip=….
 */
export default function HeroSearch() {
  const [q, setQ] = useState("");
  const [zip, setZip] = useState("");
  const [scan, setScan] = useState<{ slug: TradeSlug; q: string; zip: string } | null>(null);
  const [pick, setPick] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = q.trim();
    if (!text) return;
    const z = /^[0-9]{5}$/.test(zip) ? zip : "";
    if (z) { try { localStorage.setItem("jhp_zip", z); } catch { /* storage off */ } }
    const best = guessTrades(text)[0];
    if (best) setScan({ slug: best.trade, q: text, zip: z });
    else setPick(text);
  }

  return (
    <>
      <form className="herosearch" action="/pros" method="get" onSubmit={submit}>
        <input name="q" value={q} onChange={(e) => setQ(e.target.value)} maxLength={120}
               placeholder="Or type the problem: roof leak, no heat, mice…" aria-label="Describe the problem" required />
        <input name="zip" value={zip} onChange={(e) => setZip(e.target.value.replace(/\D/g, ""))}
               inputMode="numeric" pattern="[0-9]{5}" maxLength={5} placeholder="ZIP" aria-label="ZIP code" />
        <button className="button gold" type="submit">Scan <span>&#8594;</span></button>
      </form>

      {scan && (
        <ScanPanel key={`${scan.slug}-${scan.zip}-${scan.q}`} slug={scan.slug} initialZip={scan.zip || undefined}
                   query={scan.q} onClose={() => setScan(null)} />
      )}

      {pick && (
        <div className="scanpanelwrap" role="dialog" aria-modal="true" aria-label="Home Scan: choose a service"
             onClick={(e) => { if (e.target === e.currentTarget) setPick(null); }}>
          <div className="scanpanel">
            <button type="button" className="scanclose" onClick={() => setPick(null)} aria-label="Close">×</button>
            <div className="scanhead">HOME SCAN</div>
            <p className="scanquery">&ldquo;{pick}&rdquo;</p>
            <h3>Which kind of pro do you need?</h3>
            <div className="scanpick">
              {TRADE_SLUGS.map((s) => (
                <button key={s} type="button" onClick={() => {
                  setScan({ slug: s, q: pick, zip: /^[0-9]{5}$/.test(zip) ? zip : "" });
                  setPick(null);
                }}>{TRADES[s].label}</button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

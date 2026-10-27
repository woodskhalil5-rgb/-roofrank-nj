"use client";
import { useCallback, useEffect, useState } from "react";
import { SITE } from "../../lib/site";
import { TRADES, TRADE_SLUGS, isTradeSlug, type TradeSlug } from "../../lib/trades";
import { OUTSIDE, DOOR } from "../HomeMap";
import { Brand } from "../Brand";

/**
 * The Home Board: a homeowner's own to-do list for the house, the requests
 * they've sent through Jersey Home Pros, and seasonal suggestions. Open items
 * show as gold pins on the same house as Home Scan. Request status (hired,
 * done) is set by the homeowner — the site never claims to know it.
 */

type Todo = {
  id: string;
  created_at: string;
  title: string;
  trade: string | null;
  due_date: string | null;
  status: "open" | "hired" | "done";
  source: "custom" | "seasonal" | "request";
  lead_id: string | null;
  done_at: string | null;
  request: { created_at: string; zip: string; matched: number } | null;
};
type Suggestion = { key: string; title: string; trade: TradeSlug; due_date: string };
type Board = { me: { email: string; zip: string | null; reminders: boolean }; todos: Todo[]; suggestions: Suggestion[] };

const fmt = (d: string) =>
  new Date(d.length === 10 ? d + "T12:00:00" : d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** Where a trade's pin sits on the house (2048x1360 frame). */
function pinPoint(trade: TradeSlug): { x: number; y: number } {
  const z = OUTSIDE.find((o) => o.slug === trade);
  if (z) return { x: z.x + z.w / 2, y: z.y + z.h / 2 };
  return { x: DOOR.x + DOOR.w / 2, y: DOOR.y + DOOR.h / 2 }; // inside trades pin on the front door
}

export default function HomeBoardPage() {
  const [board, setBoard] = useState<Board | null>(null);
  const [signedOut, setSignedOut] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/home", { cache: "no-store" });
    if (r.status === 401) { setSignedOut(true); return; }
    if (r.ok) { setBoard((await r.json()) as Board); setSignedOut(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (signedOut) return <SignIn />;
  if (!board) return <main className="adminpage"><div className="wrap adminbar"><Brand /></div></main>;
  return <BoardView board={board} reload={load} />;
}

function SignIn() {
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  useEffect(() => {
    try { const e = sessionStorage.getItem("jhp_board_email"); if (e) setEmail(e); } catch { /* storage off */ }
  }, []);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setNote("Sending…");
    const r = await fetch("/api/home/login", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) { setSent(true); setNote(""); } else setNote(j.error ?? "Something went wrong.");
  }

  return (
    <main className="simplepage">
      <a className="back" href="/">&larr; {SITE.brand}</a>
      <div className="simplecard">
        <div className="eyebrow dark">YOUR HOME BOARD</div>
        <h1>Keep your house<br /><em>on track.</em></h1>
        <p>
          A free board for your home: jot down what needs doing, get seasonal reminders if you want
          them, and see every request you&rsquo;ve sent through {SITE.brand} in one place.
        </p>
        {sent ? (
          <p role="status"><b>Check your email.</b> We sent a sign-in link to {email}. It works once and expires in 30 minutes. No password needed.</p>
        ) : (
          <form onSubmit={send}>
            <label>Email address
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </label>
            <button className="button gold submit" type="submit">Email me a sign-in link <span>&#8594;</span></button>
            {note && <p role="status">{note}</p>}
            <p style={{ fontSize: 12 }}>
              Use the same email you put on a request and those requests show up on your board.
              See our <a className="textlink" href="/privacy">Privacy Notice</a>.
            </p>
          </form>
        )}
      </div>
    </main>
  );
}

function BoardView({ board, reload }: { board: Board; reload: () => Promise<void> }) {
  const { me, todos, suggestions } = board;
  const [title, setTitle] = useState("");
  const [trade, setTrade] = useState("");
  const [due, setDue] = useState("");
  const [zip, setZip] = useState(me.zip ?? "");
  const [note, setNote] = useState("");

  async function act(payload: Record<string, unknown>) {
    const r = await fetch("/api/home", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setNote(j.error ?? "Something went wrong."); return false; }
    setNote("");
    await reload();
    return true;
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (await act({ action: "add_todo", title, trade: trade || null, due_date: due || null })) {
      setTitle(""); setTrade(""); setDue("");
    }
  }

  async function signOut() {
    await fetch("/api/home/logout", { method: "POST" });
    window.location.replace("/");
  }

  const active = todos.filter((t) => t.status !== "done");
  const done = todos.filter((t) => t.status === "done");
  const requests = todos.filter((t) => t.source === "request");

  const pins = new Map<TradeSlug, number>();
  for (const t of active) if (t.trade && isTradeSlug(t.trade)) pins.set(t.trade, (pins.get(t.trade) ?? 0) + 1);

  const helpUrl = (t: string) => `/${t}${me.zip ? `?zip=${me.zip}` : ""}#estimate`;

  return (
    <main className="adminpage">
      <div className="wrap adminbar">
        <Brand />
        <span className="probtns">
          <span className="adminmeta">{me.email}</span>
          <button type="button" className="textlink adminsignout" onClick={signOut}>Sign out</button>
        </span>
      </div>

      <section className="wrap">
        <div className="eyebrow dark">YOUR HOME BOARD</div>
        <h1 className="boardh1">{active.length === 0 ? "Nothing open. Nice." : `${active.length} open ${active.length === 1 ? "item" : "items"} on your house`}</h1>

        <div className="boardhouse">
          <picture>
            <source srcSet="/home-hud.webp" type="image/webp" />
            <img src="/home-hud.jpg" width={1600} height={1062} alt="Your home, with pins on areas that have open to-dos" />
          </picture>
          <svg viewBox="0 0 2048 1360" aria-hidden="true">
            {[...pins.entries()].map(([t, n]) => {
              const p = pinPoint(t);
              const label = `${TRADES[t].label}${t === "cleaning" ? " (inside)" : ""} · ${n}`;
              const w = label.length * 21 + 40;
              return (
                <g key={t} className="boardpin">
                  <circle cx={p.x} cy={p.y} r="30" />
                  <text x={p.x} y={p.y + 11} textAnchor="middle" className="boardpinn">{n}</text>
                  <rect x={p.x - w / 2} y={p.y - 100} width={w} height="54" rx="6" />
                  <text x={p.x} y={p.y - 63} textAnchor="middle" className="boardpinl">{label}</text>
                </g>
              );
            })}
          </svg>
        </div>
      </section>

      <section className="wrap acctgrid boardgrid">
        <div>
          <div className="acctcard">
            <h2>To do</h2>
            {active.length === 0 && <p>Add something below, or pick a seasonal suggestion.</p>}
            {active.map((t) => (
              <div key={t.id} className="boarditem">
                <div>
                  <b>{t.title}</b>
                  <div className="adminmeta">
                    {t.trade && isTradeSlug(t.trade) ? TRADES[t.trade].label : "General"}
                    {t.due_date ? ` · by ${fmt(t.due_date)}` : ""}
                    {t.status === "hired" ? " · Hired" : ""}
                    {t.request
                      ? ` · Sent ${fmt(t.request.created_at)} to ${t.request.matched} ${t.request.matched === 1 ? "company" : "companies"}`
                      : ""}
                  </div>
                </div>
                <div className="boardbtns">
                  {t.trade && isTradeSlug(t.trade) && t.source !== "request" && t.status === "open" && (
                    <a className="button gold" href={helpUrl(t.trade)}>Get help</a>
                  )}
                  {t.status === "open" && (
                    <button type="button" onClick={() => act({ action: "set_status", id: t.id, status: "hired" })}>Hired someone</button>
                  )}
                  <button type="button" onClick={() => act({ action: "set_status", id: t.id, status: "done" })}>Done ✓</button>
                  {t.source !== "request" && (
                    <button type="button" className="boardx" aria-label="Remove"
                            onClick={() => act({ action: "delete_todo", id: t.id })}>×</button>
                  )}
                </div>
              </div>
            ))}

            <form onSubmit={add} className="boardadd">
              <label>Add a to-do
                <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder="e.g. Fix the leaky back gutter" required />
              </label>
              <div className="formrow">
                <label>Type (optional)
                  <select value={trade} onChange={(e) => setTrade(e.target.value)}>
                    <option value="">General</option>
                    {TRADE_SLUGS.map((s) => <option key={s} value={s}>{TRADES[s].label}</option>)}
                  </select>
                </label>
                <label>By when (optional)
                  <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
                </label>
              </div>
              <button className="button darkbtn" type="submit">Add to my board <span>+</span></button>
              {note && <p role="status">{note}</p>}
            </form>
          </div>

          {done.length > 0 && (
            <div className="acctcard">
              <h2>Done</h2>
              {done.map((t) => (
                <div key={t.id} className="boarditem boarddone">
                  <div><b>{t.title}</b><div className="adminmeta">{t.done_at ? `Done ${fmt(t.done_at)}` : "Done"}</div></div>
                  <div className="boardbtns">
                    <button type="button" onClick={() => act({ action: "set_status", id: t.id, status: "open" })}>Reopen</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          {suggestions.length > 0 && (
            <div className="acctcard">
              <h2>For this season</h2>
              <p>Common South Jersey to-dos right now. Tap to add one to your board.</p>
              {suggestions.map((s) => (
                <button key={s.key} type="button" className="boardsuggest" onClick={() => act({ action: "add_suggestion", key: s.key })}>
                  <span>+ {s.title}</span><small>{TRADES[s.trade].label} · by {fmt(s.due_date)}</small>
                </button>
              ))}
            </div>
          )}

          <div className="acctcard">
            <h2>Requests through {SITE.brand}</h2>
            {requests.length === 0 ? (
              <p>None yet. When you send a request using {me.email}, it shows up here.</p>
            ) : (
              requests.map((t) => (
                <div key={t.id} className="acctlead">
                  <b>{t.title}</b> · {t.status === "open" ? "Waiting" : t.status === "hired" ? "Hired" : "Done"}
                  {t.request && (
                    <div>
                      Sent {fmt(t.request.created_at)} for ZIP {t.request.zip}.{" "}
                      {t.request.matched > 0
                        ? `Went to ${t.request.matched} participating ${t.request.matched === 1 ? "company" : "companies"}.`
                        : `No participating company covered your ZIP at the time, so ${SITE.brand} reviewed it.`}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="acctcard">
            <h2>Settings</h2>
            <label>Home ZIP code
              <span className="scanrow">
                <input value={zip} inputMode="numeric" maxLength={5} onChange={(e) => setZip(e.target.value.replace(/\D/g, ""))} />
                <button className="button darkbtn" type="button" onClick={() => act({ action: "set_zip", zip })}>Save</button>
              </span>
            </label>
            <label className="check">
              <input type="checkbox" checked={me.reminders}
                     onChange={(e) => act({ action: "set_reminders", on: e.target.checked })} />
              <span>Email me a reminder when a to-do&rsquo;s date is coming up. One email at most per day, and you can unsubscribe from any reminder.</span>
            </label>
          </div>
        </div>
      </section>
    </main>
  );
}

import type { Metadata } from "next";
import { SITE } from "../../lib/site";
import { TRADES, TRADE_SLUGS, isTradeSlug, tradeOr } from "../../lib/trades";
import { adminDb } from "../../lib/server";
import { PUBLIC_PRO_COLUMNS, receivesRequests, type PublicPro } from "../../lib/pros";
import { guessTrades } from "../../lib/problems";
import { Brand, SiteFooter } from "../Brand";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Find a Pro | ${SITE.brand}`,
  description:
    "Browse participating New Jersey contractors by trade and ZIP code — roofing, heating and cooling, pest control, moving, cleaning, landscaping, hardscaping, and windows and doors.",
  alternates: { canonical: "/pros" },
};

type Hit = PublicPro & { distance_miles: number | null };

async function search(zip: string | null, trade: string | null): Promise<{ hits: Hit[]; badZip: boolean }> {
  const db = adminDb();
  if (!db) return { hits: [], badZip: false };

  if (zip) {
    const { data: zipRow } = await db.from("nj_zips").select("zip").eq("zip", zip).maybeSingle();
    if (!zipRow) return { hits: [], badZip: true };
    const { data: found } = await db.rpc("directory_search", { p_zip: zip, p_trade: trade });
    const rows = (found ?? []) as { id: string; distance_miles: number }[];
    if (rows.length === 0) return { hits: [], badZip: false };
    const { data: pros } = await db.from("roofers").select(PUBLIC_PRO_COLUMNS).in("id", rows.map((r) => r.id));
    const byId = new Map(((pros ?? []) as PublicPro[]).map((p) => [p.id, p]));
    return {
      hits: rows.flatMap((r) => {
        const p = byId.get(r.id);
        return p ? [{ ...p, distance_miles: Number(r.distance_miles) }] : [];
      }),
      badZip: false,
    };
  }

  let q = db
    .from("roofers")
    .select(PUBLIC_PRO_COLUMNS)
    .in("status", ["approved", "unclaimed"])
    .eq("listed", true)
    .not("slug", "is", null)
    .order("company");
  if (trade) q = q.eq("trade", trade);
  const { data } = await q;
  return { hits: ((data ?? []) as PublicPro[]).map((p) => ({ ...p, distance_miles: null })), badZip: false };
}

export default async function ProsPage({
  searchParams,
}: {
  searchParams: Promise<{ trade?: string; zip?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 120);
  // Typed problem → likely trades (keyword list in lib/problems.ts). An
  // explicit trade in the URL always wins, so "Not right?" chips can switch.
  const guesses = q ? guessTrades(q) : [];
  const trade = sp.trade && isTradeSlug(sp.trade) ? sp.trade : guesses[0]?.trade ?? null;
  const zip = sp.zip && /^[0-9]{5}$/.test(sp.zip) ? sp.zip : null;
  const found = await search(zip, trade);

  // The same live count as Home Scan: companies that would actually receive a
  // request for this trade + ZIP (unclaimed listings never count).
  let available: number | null = null;
  if (trade && zip && !found.badZip) {
    const db = adminDb();
    const { data } = db ? await db.rpc("available_providers", { p_zip: zip, p_trade: trade }) : { data: null };
    available = data === null || data === undefined ? null : Number(data);
  }
  const link = (t: string | null) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    if (t) u.set("trade", t);
    if (zip) u.set("zip", zip);
    return `/pros?${u.toString()}`;
  };
  const badZip = found.badZip;
  // Network members first, then unclaimed listings; distance order within each.
  const hits = [...found.hits].sort(
    (a, b) => Number(!receivesRequests(a)) - Number(!receivesRequests(b))
  );

  return (
    <main>
      <nav className="nav wrap">
        <Brand />
        <a className="navcta" href="/#trades">Get an Estimate <span>&#8599;</span></a>
      </nav>

      <section className="hero prohero">
        <div className="heroShade"></div>
        <div className="wrap heroContent">
          <div className="eyebrow"><i></i> THE {SITE.brand.toUpperCase()} DIRECTORY</div>
          <h1>Find a pro<br /><em>who works your area.</em></h1>
          <p>
            Companies marked as members are approved into the network. Others are listed from
            public records and haven&rsquo;t joined yet. Requests go through {SITE.brand}, and your
            details are only shared with member companies that cover your address.
          </p>
          <form className="prosearch prosearchq" action="/pros" method="get">
            <input name="q" defaultValue={q} maxLength={120} placeholder="What's the problem? e.g. roof leak, no heat"
                   aria-label="Describe the problem" />
            <select name="trade" defaultValue={q ? "" : trade ?? ""} aria-label="Trade">
              <option value="">All trades</option>
              {TRADE_SLUGS.map((s) => <option key={s} value={s}>{TRADES[s].label}</option>)}
            </select>
            <input name="zip" defaultValue={zip ?? ""} inputMode="numeric" pattern="[0-9]{5}"
                   maxLength={5} placeholder="NJ ZIP code" aria-label="ZIP code" />
            <button className="button gold" type="submit">Search <span>&#8594;</span></button>
          </form>
        </div>
      </section>

      <section className="section wrap">
        <div className="sectionhead">
          <div className="eyebrow dark">
            {zip && trade ? `${TRADES[trade].label.toUpperCase()} · SERVING ${zip}` : zip ? `SERVING ${zip}` : trade ? TRADES[trade].label.toUpperCase() : "PARTICIPATING COMPANIES"}
          </div>
          <h2>
            {hits.length} {hits.length === 1 ? "company" : "companies"}<br />
            <em>{zip ? "cover this ZIP code." : "in the directory."}</em>
          </h2>
          {q && (
            <div className="qnote">
              {trade ? (
                <p>
                  Showing <b>{TRADES[trade].label}</b> for &ldquo;{q}&rdquo;. Not right?
                </p>
              ) : (
                <p>We couldn&rsquo;t tell which kind of pro &ldquo;{q}&rdquo; needs. Which is it?</p>
              )}
              <p className="qchips">
                {(trade ? TRADE_SLUGS.filter((s) => s !== trade) : TRADE_SLUGS)
                  .sort((a, b) => Number(!guesses.some((g) => g.trade === b)) - Number(!guesses.some((g) => g.trade === a)))
                  .map((s) => <a key={s} href={link(s)}>{TRADES[s].label}</a>)}
              </p>
            </div>
          )}
          {trade && zip && available !== null && (
            <div className="qavail">
              {available > 0 ? (
                <p>&#10003; <b>{available} {available === 1 ? TRADES[trade].company : TRADES[trade].companies} available in {zip}</b>, taking requests through {SITE.brand} now.</p>
              ) : (
                <p>No {TRADES[trade].companies} in our network take requests in {zip} yet. You can still send one and {SITE.brand} reviews it.</p>
              )}
              <a className="button gold" href={`/${trade}?zip=${zip}#estimate`}>
                {available > 0 ? "Send one request" : "Send my request"} <span>&#8594;</span>
              </a>
            </div>
          )}
          {badZip && <p>That ZIP code isn&rsquo;t in New Jersey. {SITE.brand} serves New Jersey only.</p>}
          {!badZip && hits.length === 0 && (
            <p>
              No listed company matches that search yet. You can still send a request — if nobody
              in the network covers your area, {SITE.brand} reviews it and follows up by email.
            </p>
          )}
        </div>

        {hits.length > 0 && (
          <div className="tradegrid">
            {hits.map((p) => {
              const t = tradeOr(p.trade);
              return (
                <a className="tradecard" key={p.id} href={`/pros/${p.slug}`}>
                  <span className="tradeicon">{t.icon}</span>
                  <h3>{p.company}</h3>
                  <p>
                    {t.label}
                    {p.distance_miles !== null && p.distance_miles >= 1
                      ? ` · about ${p.distance_miles} mi away`
                      : p.city ? ` · ${p.city}` : p.distance_miles !== null ? " · in your ZIP" : ""}
                  </p>
                  <p className="procardtags">
                    {receivesRequests(p)
                      ? <span className="tagmember">Network member</span>
                      : <span className="tagunclaimed">{p.status === "approved" ? "Claimed · not taking requests" : "Not in the network yet"}</span>}
                    {p.license_checked_at && <span className="tagcheck">&#10003; State registration checked</span>}
                  </p>
                  <span className="tradego">View profile <span>&#8594;</span></span>
                </a>
              );
            })}
          </div>
        )}

        {!badZip && hits.length === 0 && (
          <div className="tradegrid">
            {(trade ? [TRADES[trade]] : TRADE_SLUGS.map((s) => TRADES[s])).map((t) => (
              <a className="tradecard" key={t.slug} href={`/${t.slug}#estimate`}>
                <span className="tradeicon">{t.icon}</span>
                <h3>{t.label}</h3>
                <p>{t.blurb}</p>
                <span className="tradego">Start a request <span>&#8594;</span></span>
              </a>
            ))}
          </div>
        )}
      </section>

      <section className="rooferbar">
        <div className="wrap rooferinner">
          <div>
            <div className="eyebrow dark">FOR CONTRACTORS</div>
            <h2>Want a profile here?</h2>
            <p>Join the network, or sign in to manage the profile you already have.</p>
          </div>
          <span className="probtns">
            <a className="button darkbtn" href="/join">Join the Network <span>&#8594;</span></a>
            <a className="button gold" href="/account">Pro Sign In <span>&#8594;</span></a>
          </span>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

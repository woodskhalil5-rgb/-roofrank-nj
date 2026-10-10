import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SITE } from "../../lib/site";
import { TRADES, TRADE_SLUGS, isTradeSlug } from "../../lib/trades";
import LeadForm from "../LeadForm";
import { Brand, SiteFooter } from "../Brand";

export const dynamicParams = false;

export function generateStaticParams() {
  return TRADE_SLUGS.map((trade) => ({ trade }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ trade: string }> }
): Promise<Metadata> {
  const { trade: slug } = await params;
  if (!isTradeSlug(slug)) return {};
  const trade = TRADES[slug];
  return {
    title: trade.meta.title,
    description: trade.meta.description,
    alternates: { canonical: `/${slug}` },
    openGraph: { title: trade.meta.title, description: trade.meta.description, type: "website" },
  };
}

export default async function TradePage({ params }: { params: Promise<{ trade: string }> }) {
  const { trade: slug } = await params;
  if (!isTradeSlug(slug)) notFound();
  const trade = TRADES[slug];
  const others = TRADE_SLUGS.filter((s) => s !== slug).map((s) => TRADES[s]);

  return (
    <main>
      <nav className="nav wrap">
        <Brand />
        <a className="navcta" href="#estimate">Get an Estimate <span>&#8599;</span></a>
      </nav>

      <section className="hero">
        <div className="heroShade"></div>
        <div className="wrap heroContent">
          <div className="eyebrow"><i></i> {trade.hero.eyebrow}</div>
          <h1>{trade.hero.line1}<br /><em>{trade.hero.lineEm}</em><br />{trade.hero.line2}</h1>
          <p>{trade.hero.sub}</p>
          <div className="heroActions">
            <a className="button gold" href="#estimate">Request a Free Estimate <span>&#8594;</span></a>
            <a className="textlink" href="#how">How it works <span>&#8595;</span></a>
          </div>
          <div className="trustline"><span>&#9670;</span> One request. Local options. Your decision.</div>
        </div>
        <div className="heroTag">
          <b>{trade.label.toUpperCase()}</b>
          <span>BUILT FOR NEW JERSEY HOMEOWNERS</span>
        </div>
      </section>

      <section className="proof">
        <div className="wrap proofgrid">
          {SITE.proof.map((t, i) => (
            <div key={t}><strong>{String(i + 1).padStart(2, "0")}</strong><span>{t}</span></div>
          ))}
        </div>
      </section>

      <section className="section wrap" id="how">
        <div className="sectionhead">
          <div className="eyebrow dark">A BETTER STARTING POINT</div>
          <h2>{trade.how.h2a}<br /><em>{trade.how.h2em}</em></h2>
          <p>{trade.how.p}</p>
        </div>
        <div className="servicegrid">
          {trade.cards.map((c) => (
            <article key={c.title}>
              <span className="serviceicon">{c.icon}</span>
              <h3>{c.title}</h3>
              <p>{c.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="estimate" id="estimate">
        <div className="wrap estimategrid">
          <div className="estimatecopy">
            <div className="eyebrow"><i></i> GET STARTED</div>
            <h2>{trade.estimate.h2a}<br /><em>{trade.estimate.h2em}</em></h2>
            <p>{trade.estimate.p}</p>
            <div className="privacyNote">
              <span>&#9672;</span>
              <p>
                <b>Your request, handled with care.</b><br />
                Your contact and project details may be shared with relevant participating{" "}
                {trade.companies} so they can respond to your request.
              </p>
            </div>
          </div>
          <LeadForm trade={trade} />
        </div>
      </section>

      <section className="section wrap">
        <div className="sectionhead">
          <div className="eyebrow dark">ALSO FROM {SITE.brand.toUpperCase()}</div>
          <h2>Need something else<br /><em>around the house?</em></h2>
        </div>
        <div className="tradegrid">
          {others.map((t) => (
            <a className="tradecard" key={t.slug} href={`/${t.slug}`}>
              <span className="tradeicon">{t.icon}</span>
              <h3>{t.label}</h3>
              <p>{t.blurb}</p>
              <span className="tradego">Start a request <span>&#8594;</span></span>
            </a>
          ))}
        </div>
      </section>

      <section className="rooferbar">
        <div className="wrap rooferinner">
          <div>
            <div className="eyebrow dark">FOR {trade.label.toUpperCase()} COMPANIES</div>
            <h2>{SITE.providerBar.h2}</h2>
            <p>{SITE.providerBar.p}</p>
          </div>
          <a className="button darkbtn" href="/join">Join the Network <span>&#8594;</span></a>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

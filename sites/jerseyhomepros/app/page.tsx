import { SITE } from "../lib/site";
import { TRADES, TRADE_SLUGS } from "../lib/trades";
import { Brand, SiteFooter } from "./Brand";
import HomeMap from "./HomeMap";
import HeroSearch from "./HeroSearch";

/**
 * Homepage. Its job is to route a homeowner to the right trade quickly;
 * each trade page carries its own hero, services and request form.
 */
export default function Home() {
  const trades = TRADE_SLUGS.map((s) => TRADES[s]);

  return (
    <main>
      <nav className="nav wrap">
        <Brand href="#" />
        <a className="navcta" href="#trades">Get an Estimate <span>&#8599;</span></a>
      </nav>

      {/* The home scan IS the hero: it is the thing no other directory has,
          so it is the first thing a homeowner sees. */}
      <section className="hero homehero">
        <div className="wrap heroContent">
          <div className="eyebrow"><i></i> INTRODUCING HOME SCAN</div>
          <h1>Pinpoint the problem.<br /><em>Skip the guesswork.</em></h1>
          <p>
            A new way to get help with your home. Tap the part of the house that needs attention,
            and {SITE.brand} connects your request with participating pros who serve your ZIP code.
          </p>
          <div className="heroActions">
            <a className="button gold" href="#scan">Start your scan <span>&#8595;</span></a>
            <a className="textlink" href="#trades">Or pick a service <span>&#8595;</span></a>
          </div>
          <p className="nocam">No app or camera needed — just tap the picture.</p>
          <HeroSearch />
        </div>
        <div className="wrap">
          <HomeMap hero />
          <div className="scansteps">
            <div><strong>01</strong><span><b>Tap the problem.</b> Roof, AC, yard, pests — point at it.</span></div>
            <div><strong>02</strong><span><b>Share a few details.</b> Two minutes, no account needed.</span></div>
            <div><strong>03</strong><span><b>Get connected.</b> Participating pros in your ZIP reach out.</span></div>
          </div>
        </div>
      </section>

      <section className="section wrap" id="trades">
        <div className="sectionhead">
          <div className="eyebrow dark">OR CHOOSE A SERVICE</div>
          <h2>{SITE.how.h2a}<br /><em>{SITE.how.h2em}</em></h2>
          <p>{SITE.how.p}</p>
        </div>

        <div className="tradegrid">
          {trades.map((t) => (
            <a className="tradecard" key={t.slug} href={`/${t.slug}`}>
              <span className="tradeicon">{t.icon}</span>
              <h3>{t.label}</h3>
              <p>{t.blurb}</p>
              <span className="tradego">Start a request <span>&#8594;</span></span>
            </a>
          ))}
        </div>
      </section>

      <section className="section wrap" id="how">
        <div className="sectionhead">
          <div className="eyebrow dark">A BETTER STARTING POINT</div>
          <h2>One request.<br /><em>Local options.</em></h2>
          <p>
            You tell us what the house needs. We pass it to participating contractors who work in
            your trade and serve your ZIP code. They contact you directly and compete for the job.
            You are never obligated to hire anyone, and homeowners pay us nothing.
          </p>
        </div>
        <div className="servicegrid">
          <article>
            <span className="serviceicon">&#9633;</span>
            <h3>One form</h3>
            <p>A few details about the property and the problem. Two minutes.</p>
          </article>
          <article>
            <span className="serviceicon">&#9678;</span>
            <h3>Matched locally</h3>
            <p>We route it only to companies in that trade who cover your ZIP code.</p>
          </article>
          <article>
            <span className="serviceicon">&#9742;</span>
            <h3>They reach out</h3>
            <p>If you skip the calls-and-texts box, they are told to reply by email only.</p>
          </article>
          <article>
            <span className="serviceicon">&#9670;</span>
            <h3>You decide</h3>
            <p>Compare who responds. Hire whoever you want, or nobody at all.</p>
          </article>
        </div>
      </section>

      <section className="rooferbar">
        <div className="wrap rooferinner">
          <div>
            <div className="eyebrow dark">FOR CONTRACTORS</div>
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

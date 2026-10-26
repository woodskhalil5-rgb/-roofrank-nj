import type { Metadata } from "next";
import { SITE } from "../../lib/site";
import { TRADES, TRADE_SLUGS } from "../../lib/trades";
import { Brand, SiteFooter } from "../Brand";
import "./landing.css";

/**
 * Animated homeowner landing experience, and the destination for paid search.
 *
 * It is a separate route rather than a replacement homepage on purpose. The
 * homepage ranks and is the design Khalil asked to preserve; a campaign page
 * can be rewritten, measured and switched off without touching it, and keeping
 * paid traffic on its own URL is what makes landing-page conversion rate
 * readable at all. Promoting this to `/` later is a one-file change.
 *
 * Content rules observed here, because they are easy to lose in a redesign:
 * every trade shown is a trade with a live request form, nothing claims a
 * match, a quote, a response time, a review or a verification we do not
 * perform, and the limits of the service are stated on the page rather than
 * buried in the privacy notice.
 */
export const metadata: Metadata = {
  title: "Find Help for Your Home | New Jersey Home Services | Jersey Home Pros",
  description:
    "Tell us what your home needs and start with a local service request. Roofing, heating and cooling, pest control, moving, cleaning, landscaping, hardscaping, and windows and doors across New Jersey.",
  alternates: { canonical: "/start" },
  openGraph: {
    title: "Find help for your home — Jersey Home Pros",
    description: "Tell us what your home needs and start with a local service request.",
    type: "website",
    url: `${SITE.url}/start`,
  },
  twitter: {
    card: "summary",
    title: "Find help for your home — Jersey Home Pros",
    description: "Tell us what your home needs and start with a local service request.",
  },
};

const STEPS: ReadonlyArray<{ title: string; body: string }> = [
  { title: "Choose a service", body: "Pick the trade that matches the job." },
  { title: "Share the details", body: "A few things about the property and the problem." },
  { title: "Review next steps", body: "See exactly what happens to your request." },
];

export default function StartPage() {
  const trades = TRADE_SLUGS.map((s) => TRADES[s]);

  return (
    <main className="lp">
      <nav className="nav wrap">
        <Brand href="/" />
        <a className="navcta" href="#services">
          Get started <span>&#8599;</span>
        </a>
      </nav>

      <section className="lpHero">
        {/* Decorative only — hidden from assistive technology. */}
        <div className="lpPlane lpPlane1" aria-hidden="true"></div>
        <div className="lpPlane lpPlane2" aria-hidden="true"></div>
        <div className="lpHatch" aria-hidden="true"></div>
        <div className="lpSweep" aria-hidden="true"></div>

        <div className="wrap lpHeroInner">
          <div className="lpEyebrow lpRise lpD1">
            <i aria-hidden="true"></i> NEW JERSEY HOME SERVICES, MADE SIMPLE
          </div>

          <h1 className="lpRise lpD2">
            Find help for <em>your home.</em>
          </h1>

          {/* The CTA row animates before this paragraph, so the primary action
              is never waiting on copy to finish arriving. */}
          <div className="lpActions lpRise lpD3">
            <a className="lpBtn" href="#services">
              Get started <span aria-hidden="true">&#8594;</span>
            </a>
            <a className="lpGhost" href="#how">
              Explore services <span aria-hidden="true">&#8595;</span>
            </a>
          </div>

          <p className="lpSub lpRise lpD4">
            Tell us what your home needs and start with a local service request.
          </p>

          <p className="lpHonest lpRise lpD5">
            <b>Free for homeowners, and no obligation.</b> Participating contractors pay{" "}
            {SITE.brand} for requests. Availability varies by location and trade, and sending a
            request does not guarantee a contractor match, a quote, or a response time.
          </p>
        </div>
      </section>

      <section className="lpSteps">
        <div className="wrap lpStepGrid">
          {STEPS.map((s, i) => (
            <div className="lpStep" key={s.title}>
              <strong aria-hidden="true">{String(i + 1).padStart(2, "0")}</strong>
              <p>
                <b>{s.title}</b>
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="lpSection wrap" id="services">
        <div className="lpHead lpReveal">
          <div className="lpEyebrow">
            <i aria-hidden="true"></i> WHAT DOES YOUR HOME NEED?
          </div>
          <h2>
            Pick a service to
            <br />
            <em>start your request.</em>
          </h2>
          <p>
            Each service has its own short form. You will see what happens to your request before
            you send it, and you choose whether contractors may call or text you.
          </p>
        </div>

        <div className="lpTrades">
          {trades.map((t) => (
            <a className="lpTrade lpReveal" key={t.slug} href={`/${t.slug}`}>
              <span className="lpIcon" aria-hidden="true">
                {t.icon}
              </span>
              <h3>{t.label}</h3>
              <p>{t.blurb}</p>
              <span className="lpGo">
                Start a request <span aria-hidden="true">&#8594;</span>
              </span>
            </a>
          ))}
        </div>

        <div className="lpDisclose lpReveal">
          <span aria-hidden="true">&#9670;</span>
          <p>
            <b>What {SITE.brand} is.</b> We are a referral service, not a contractor. We pass your
            request to participating companies in your trade that cover your ZIP code, and they
            contact you directly. We do not perform, supervise or guarantee any work, and we run no
            background checks. Confirm licensing, insurance and qualifications directly with any
            company before hiring. You are never obligated to hire anyone.
          </p>
        </div>
      </section>

      <section className="lpSection wrap" id="how">
        <div className="lpHead lpReveal">
          <div className="lpEyebrow">
            <i aria-hidden="true"></i> HOW IT WORKS
          </div>
          <h2>
            One request.
            <br />
            <em>Local options.</em>
          </h2>
          <p>
            You tell us what the house needs. We route it only to companies in that trade who serve
            your ZIP code. They reach out to you. If you leave the calls-and-texts box unchecked,
            they are told in writing to reply by email only. Homeowners pay us nothing.
          </p>
        </div>
      </section>

      <section className="lpPros">
        <div className="wrap lpProsInner">
          <div className="lpReveal">
            <div className="lpEyebrow">
              <i aria-hidden="true"></i> FOR CONTRACTORS
            </div>
            <h2>{SITE.providerBar.h2}</h2>
            <p>{SITE.providerBar.p}</p>
          </div>
          <a className="lpDark" href="/join">
            Join the Network <span aria-hidden="true">&#8594;</span>
          </a>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

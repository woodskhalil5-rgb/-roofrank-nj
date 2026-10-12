import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SITE } from "../../../lib/site";
import { TRADES } from "../../../lib/trades";
import { GUIDES, GUIDE_SLUGS, guideBySlug } from "../../../lib/guides";
import { Brand, SiteFooter } from "../../Brand";

export const dynamicParams = false;

export function generateStaticParams() {
  return GUIDE_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const guide = guideBySlug(slug);
  if (!guide) return {};
  return {
    title: guide.meta.title,
    description: guide.meta.description,
    alternates: { canonical: `/guides/${guide.slug}` },
    openGraph: { title: guide.meta.title, description: guide.meta.description, type: "article" },
  };
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = guideBySlug(slug);
  if (!guide) notFound();

  const trade = TRADES[guide.trade];
  const related = GUIDES.filter((g) => g.slug !== guide.slug).slice(0, 3);

  // Article structured data. Search engines use it to understand what the page
  // is and when it was written; it carries no claim the page does not make.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: guide.h1,
    description: guide.meta.description,
    dateModified: guide.updated,
    author: { "@type": "Organization", name: SITE.brand },
    publisher: { "@type": "Organization", name: SITE.brand },
    mainEntityOfPage: `${SITE.url}/guides/${guide.slug}`,
  };

  return (
    <main className="simplepage">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Brand />

      <article className="simplecard legalpage">
        <div className="eyebrow dark">{trade.label.toUpperCase()}</div>
        <h1>{guide.h1}</h1>
        <p className="legaldate">
          Updated{" "}
          {new Date(guide.updated + "T12:00:00Z").toLocaleDateString("en-US", {
            day: "numeric",
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          })}
        </p>
        <p>
          <b>{guide.lede}</b>
        </p>

        {guide.sections.map((s) => (
          <section key={s.h2}>
            <h2>{s.h2}</h2>
            {s.body.map((p) => (
              <p key={p.slice(0, 40)}>{p}</p>
            ))}
            {s.list && (
              <ul>
                {s.list.map((li) => (
                  <li key={li.slice(0, 40)}>{li}</li>
                ))}
              </ul>
            )}
            {s.warn && (
              <div className="privacyNote">
                <span>&#9888;</span>
                <p>
                  <b>Safety.</b>
                  <br />
                  {s.warn}
                </p>
              </div>
            )}
          </section>
        ))}

        <h2>Need someone to look at it?</h2>
        <p>
          {SITE.brand} sends your request to one participating {trade.company} that
          serves your area &mdash; not a call center, and not eight companies at once.
          You choose whether anyone is allowed to phone you.
        </p>
        <p>
          <a className="button gold" href={`/${trade.slug}#estimate`}>
            Request {trade.label.toLowerCase()} help <span>&#8594;</span>
          </a>
        </p>

        <h2>More from {SITE.brand}</h2>
        <ul>
          {related.map((g) => (
            <li key={g.slug}>
              <a href={`/guides/${g.slug}`}>{g.h1}</a>
            </li>
          ))}
        </ul>

        <p className="legaldate">
          General information for New Jersey homeowners, not a substitute for an
          inspection by a licensed contractor. {SITE.brand} does not perform, supervise
          or guarantee any work.
        </p>
      </article>

      <SiteFooter />
    </main>
  );
}

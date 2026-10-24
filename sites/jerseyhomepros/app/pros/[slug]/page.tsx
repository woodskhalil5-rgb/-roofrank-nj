import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SITE } from "../../../lib/site";
import { tradeOr } from "../../../lib/trades";
import { adminDb } from "../../../lib/server";
import { listedProBySlug, safeWebsite } from "../../../lib/pros";
import { Brand, SiteFooter } from "../../Brand";
import ViewBeacon from "./ViewBeacon";

export const dynamic = "force-dynamic";

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const pro = await listedProBySlug(slug);
  if (!pro) return {};
  const t = tradeOr(pro.trade);
  const title = `${pro.company} — ${t.label} in New Jersey | ${SITE.brand}`;
  const description = `${pro.company} is a participating ${t.company} in the ${SITE.brand} network. Request a free estimate.`;
  return { title, description, alternates: { canonical: `/pros/${pro.slug}` }, openGraph: { title, description, type: "website" } };
}

export default async function ProPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const pro = await listedProBySlug(slug);
  if (!pro) notFound();
  const t = tradeOr(pro.trade);
  const website = safeWebsite(pro.website);

  // Towns for the ZIPs the company bases its coverage on, so "where do they
  // work" reads as places rather than a list of numbers.
  const db = adminDb();
  const { data: zipRows } = db
    ? await db.from("nj_zips").select("zip, city, county").in("zip", pro.service_zips)
    : { data: [] };
  const places = Array.from(
    new Set(((zipRows ?? []) as { zip: string; city: string; county: string }[])
      .map((z) => (z.city ? `${z.city}${z.county ? `, ${z.county} County` : ""}` : z.zip)))
  );

  return (
    <main>
      <ViewBeacon slug={pro.slug} />
      <nav className="nav wrap">
        <Brand />
        <a className="navcta" href={`/pros/${pro.slug}/request`}>Get an Estimate <span>&#8599;</span></a>
      </nav>

      <section className="hero prohero">
        <div className="heroShade"></div>
        <div className="wrap heroContent">
          <div className="eyebrow"><i></i> {t.label.toUpperCase()} &middot; PARTICIPATING COMPANY</div>
          <h1>{pro.company}</h1>
          <p>{pro.bio || `A ${t.company} serving New Jersey homeowners through the ${SITE.brand} network.`}</p>
          <div className="heroActions">
            <a className="button gold" href={`/pros/${pro.slug}/request`}>
              Request a Free Estimate <span>&#8594;</span>
            </a>
            {website && (
              <a className="textlink" href={`/pros/${pro.slug}/website`} rel="nofollow noopener" target="_blank">
                Visit website <span>&#8599;</span>
              </a>
            )}
          </div>
          <div className="trustline"><span>&#9670;</span> Approved into the {SITE.brand} network.</div>
        </div>
        <div className="heroTag">
          <b>{t.label.toUpperCase()}</b>
          <span>NEW JERSEY</span>
        </div>
      </section>

      <section className="section wrap">
        <div className="servicegrid prodetails">
          <article>
            <span className="serviceicon">{t.icon}</span>
            <h3>Services</h3>
            <p>{pro.services}</p>
          </article>
          <article>
            <span className="serviceicon">&#9678;</span>
            <h3>Where they work</h3>
            <p>
              Within about {pro.radius_miles} miles of {places.length > 0 ? places.join("; ") : "their base"}.
            </p>
          </article>
          <article>
            <span className="serviceicon">&#9742;</span>
            <h3>How to reach them</h3>
            <p>
              Send a request through {SITE.brand}. If your ZIP code is in their area, it goes to them,
              and they contact you directly.
            </p>
          </article>
          <article>
            <span className="serviceicon">&#9670;</span>
            <h3>Before you hire</h3>
            <p>{SITE.disclaimer}</p>
          </article>
        </div>
      </section>

      <section className="rooferbar">
        <div className="wrap rooferinner">
          <div>
            <div className="eyebrow dark">MORE {t.companies.toUpperCase()}</div>
            <h2>Compare before you choose.</h2>
            <p>See every listed {t.company} in the directory.</p>
          </div>
          <a className="button darkbtn" href={`/pros?trade=${t.slug}`}>Browse {t.label} <span>&#8594;</span></a>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

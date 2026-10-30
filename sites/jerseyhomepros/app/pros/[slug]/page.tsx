import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SITE } from "../../../lib/site";
import { tradeOr } from "../../../lib/trades";
import { adminDb } from "../../../lib/server";
import { listedProBySlug, safeWebsite, checkedOn, NJ_LICENSE_LOOKUP, receivesRequests, photoUrl } from "../../../lib/pros";
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
  const where = pro.city ? `${pro.city}, NJ` : "New Jersey";
  const title = `${pro.company} — ${t.label} in ${where} | ${SITE.brand}`;
  const description =
    pro.status === "approved"
      ? `${pro.company} is a participating ${t.company} in the ${SITE.brand} network. Request a free estimate.`
      : `${pro.company}, a ${t.company} in ${where}. Compare it with participating ${t.companies} and request a free estimate.`;
  return { title, description, alternates: { canonical: `/pros/${pro.slug}` }, openGraph: { title, description, type: "website" } };
}

export default async function ProPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const pro = await listedProBySlug(slug);
  if (!pro) notFound();
  const t = tradeOr(pro.trade);
  // member: requests from this page can reach them. claimed: the company runs
  // this page but isn't taking requests through the site. Neither: unclaimed.
  const member = receivesRequests(pro);
  const claimed = pro.status === "approved" && !member;
  const website = safeWebsite(pro.website);
  const logo = photoUrl(pro.logo_path);
  const gallery = pro.gallery_paths.map((p) => photoUrl(p)).filter((u): u is string => Boolean(u));
  const years = pro.year_founded ? new Date().getFullYear() - pro.year_founded : null;
  const hasDetails = Boolean(pro.towns || pro.hours || pro.year_founded || pro.highlights.length);

  const db = adminDb();
  // Real requests in this trade and area in the last 30 days. Shown in the
  // claim box only, and only when it is above zero: it is the reason to
  // claim, and must be a count, never an estimate.
  let demand = 0;
  if (pro.status === "unclaimed" && db) {
    const { data } = await db.rpc("area_demand", { p_roofer_id: pro.id, p_days: 30 });
    demand = typeof data === "number" ? data : 0;
  }

  const area = pro.city ? `${pro.city} (ZIP ${pro.service_zips.join(", ")})` : `ZIP ${pro.service_zips.join(", ")}`;

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
          <div className="eyebrow">
            <i></i> {t.label.toUpperCase()} &middot; {member ? "NETWORK MEMBER" : claimed ? "CLAIMED BY THE COMPANY" : "NOT IN THE NETWORK YET"}
          </div>
          {logo && <img className="prologo" src={logo} alt={`${pro.company} logo`} />}
          <h1>{pro.company}</h1>
          <p>
            {member
              ? pro.bio || `A ${t.company} serving New Jersey homeowners through the ${SITE.brand} network.`
              : claimed
              ? `${pro.bio ? `${pro.bio} ` : ""}${pro.company} isn't taking requests through ${SITE.brand} right now, so requests sent here go to participating ${t.companies} that serve your ZIP code.`
              : `A ${t.company}${pro.city ? ` in ${pro.city}` : ""}, listed from public records. This company hasn't joined ${SITE.brand}, so requests sent here go to participating ${t.companies} that serve your ZIP code instead.`}
          </p>
          <div className="heroActions">
            <a className="button gold" href={`/pros/${pro.slug}/request`}>
              {member ? "Request a Free Estimate" : `Get Estimates from ${t.label} Pros`} <span>&#8594;</span>
            </a>
            {(member || claimed) && website && (
              <a className="textlink" href={`/pros/${pro.slug}/website`} rel="nofollow noopener" target="_blank">
                Visit website <span>&#8599;</span>
              </a>
            )}
          </div>
          {pro.license_checked_at && (
            <div className="probadge">
              &#10003; {pro.license_label || "NJ registration"}
              {pro.license_number ? ` #${pro.license_number}` : ""}
              {pro.license_status ? ` · ${pro.license_status}` : ""}
              {" · checked "}{checkedOn(pro.license_checked_at)}
              {" · "}<a href={NJ_LICENSE_LOOKUP} target="_blank" rel="noopener">verify with the state</a>
            </div>
          )}
          {pro.verified_at && (
            <div className="probadge verified">
              &#10003; Verified by {SITE.brand} &middot; {checkedOn(pro.verified_at)}
            </div>
          )}
          {member && <div className="trustline"><span>&#9670;</span> Approved into the {SITE.brand} network.</div>}
        </div>
        <div className="heroTag">
          <b>{t.label.toUpperCase()}</b>
          <span>{pro.city ? pro.city.toUpperCase() : "NEW JERSEY"}</span>
        </div>
      </section>

      <section className="section wrap">
        {!member && !claimed && (
          <p className="unclaimednote">
            <b>What this page is.</b> {SITE.brand} lists {t.companies} from public records so homeowners
            can compare. {pro.company} is not a member and doesn&rsquo;t receive requests through this
            site{pro.license_checked_at ? "" : ", and we haven't checked its state registration"}.
            Contact the company directly if you want to hire them specifically.
          </p>
        )}

        {gallery.length > 0 && (
          <div className="progallery">
            {gallery.map((u) => (
              <a key={u} href={u} target="_blank" rel="noopener"><img src={u} alt={`Work by ${pro.company}`} loading="lazy" /></a>
            ))}
          </div>
        )}

        {hasDetails && (
          <div className="profacts">
            <div className="eyebrow dark">FROM THE COMPANY</div>
            {pro.highlights.length > 0 && (
              <ul className="prohighlights">{pro.highlights.map((h) => <li key={h}>{h}</li>)}</ul>
            )}
            <dl>
              {pro.year_founded && <><dt>In business since</dt><dd>{pro.year_founded}{years !== null && years > 0 ? ` (${years} ${years === 1 ? "year" : "years"})` : ""}</dd></>}
              {pro.towns && <><dt>Towns served</dt><dd>{pro.towns}</dd></>}
              {pro.hours && <><dt>Hours</dt><dd>{pro.hours}</dd></>}
            </dl>
            <p className="adminmeta">Provided by {pro.company}. {SITE.brand} hasn&rsquo;t verified these details.</p>
          </div>
        )}

        <div className="servicegrid prodetails">
          <article>
            <span className="serviceicon">{t.icon}</span>
            <h3>Services</h3>
            {pro.service_list.length > 0
              ? <ul className="proservices">{pro.service_list.map((s) => <li key={s}>{s}</li>)}</ul>
              : <p>{pro.services}</p>}
          </article>
          <article>
            <span className="serviceicon">&#9678;</span>
            <h3>{member ? "Where they work" : "Based in"}</h3>
            <p>{member ? `Within about ${pro.radius_miles} miles of ${area}.` : area}</p>
          </article>
          <article>
            <span className="serviceicon">&#9742;</span>
            <h3>How requests work</h3>
            <p>
              {member
                ? `Send a request through ${SITE.brand}. If your ZIP code is in their area, it goes to them, and they contact you directly.`
                : `A request here goes to participating ${t.companies} that cover your ZIP code — not to ${pro.company}.`}
            </p>
          </article>
          <article>
            <span className="serviceicon">&#9670;</span>
            <h3>Before you hire</h3>
            <p>{SITE.disclaimer}</p>
          </article>
        </div>
      </section>

      {!member && !claimed && (
        <section className="section wrap" style={{ paddingTop: 0 }}>
          <div className="claimbox">
            <div className="eyebrow">IS THIS YOUR COMPANY?</div>
            <h3>Claim this page. It&rsquo;s free.</h3>
            <p>
              {demand > 0 && (
                <>
                  <b>{demand} {demand === 1 ? "homeowner" : "homeowners"}</b> near you asked {SITE.brand} for{" "}
                  {t.work} in the last 30 days.{" "}
                </>
              )}
              Claiming gives you this page, a dashboard showing who looks at it, and the option to receive
              homeowner requests in your area. Correcting your listing never costs anything.
            </p>
            <a className="button gold" href={`/pros/${pro.slug}/claim`}>Claim {pro.company} <span>&#8594;</span></a>
            <p style={{ marginTop: 16, fontSize: 11 }}>
              Want this page removed instead? Email {SITE.operatorEmail} from your company address.
            </p>
          </div>
        </section>
      )}

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

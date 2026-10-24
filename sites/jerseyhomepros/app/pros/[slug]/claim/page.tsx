import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SITE } from "../../../../lib/site";
import { tradeOr } from "../../../../lib/trades";
import { adminDb } from "../../../../lib/server";
import { listedProBySlug } from "../../../../lib/pros";
import ClaimForm from "./ClaimForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false } };

export default async function ClaimPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const pro = await listedProBySlug(slug);
  if (!pro || pro.status !== "unclaimed") notFound();
  const t = tradeOr(pro.trade);

  const db = adminDb();
  let demand = 0;
  if (db) {
    const { data } = await db.rpc("area_demand", { p_roofer_id: pro.id, p_days: 30 });
    demand = typeof data === "number" ? data : 0;
  }

  return (
    <main className="simplepage">
      <a className="back" href={`/pros/${pro.slug}`}>&larr; {pro.company}</a>
      <div className="simplecard">
        <div className="eyebrow dark">CLAIM YOUR PAGE</div>
        <h1>{pro.company}</h1>
        <p>
          Claiming is free. You get control of this page, a dashboard showing how many homeowners view it
          and click to request an estimate, and the option to start receiving homeowner {t.label.toLowerCase()}{" "}
          requests in your area.
          {demand > 0 && (
            <> In the last 30 days, <b>{demand}</b> {demand === 1 ? "homeowner" : "homeowners"} near you asked{" "}
            {SITE.brand} for {t.work}.</>
          )}
        </p>
        <p>
          Claiming doesn&rsquo;t sign you up for anything paid. Requests start only if you choose to receive
          them, and we&rsquo;ll go over pricing with you first.
        </p>
        <ClaimForm slug={pro.slug} company={pro.company} />
      </div>
    </main>
  );
}

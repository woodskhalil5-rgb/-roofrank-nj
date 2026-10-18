import type { Metadata } from "next";
import Link from "next/link";
import { createSupabasePublicClient } from "@/lib/supabase/server";
import ClaimForm from "./ClaimForm";

export const metadata: Metadata = {
  title: "Claim your listing",
  description:
    "Real estate agents can claim their listing and correct anything that is wrong, free of charge.",
};

export default async function ClaimPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string }>;
}) {
  const { agent: agentSlug } = await searchParams;

  let agentName: string | undefined;
  if (agentSlug) {
    const supabase = createSupabasePublicClient();
    const { data } = await supabase
      .from("agent")
      .select("full_name")
      .eq("slug", agentSlug)
      .eq("status", "published")
      .maybeSingle();
    agentName = (data?.full_name as string | undefined) ?? undefined;
  }

  return (
    <main className="wrap-narrow page">
      <h1 style={{ maxWidth: "none" }}>Claim your listing</h1>
      <p className="lede">
        If we have listed you, the listing is yours to correct. It is free, and
        it stays free.
      </p>

      {agentSlug && !agentName ? (
        <div className="notice notice-warn">
          <p style={{ margin: 0 }}>
            We could not find a published listing at &ldquo;{agentSlug}&rdquo;.
            Send the form anyway and we will look into it.
          </p>
        </div>
      ) : null}

      <div className="card">
        <ClaimForm agentSlug={agentSlug ?? ""} agentName={agentName} />
      </div>

      <h2 style={{ marginTop: 40 }}>How we check a claim</h2>
      <div className="steps">
        <div className="step">
          <div className="num">1</div>
          <h3>You send this form</h3>
          <p className="muted" style={{ margin: 0 }}>
            Tell us who you are and what needs fixing.
          </p>
        </div>
        <div className="step">
          <div className="num">2</div>
          <h3>We confirm it is you</h3>
          <p className="muted" style={{ margin: 0 }}>
            We check your details against the licence register and your
            brokerage. We may call to confirm.
          </p>
        </div>
        <div className="step">
          <div className="num">3</div>
          <h3>Your corrections go live</h3>
          <p className="muted" style={{ margin: 0 }}>
            Your listing shows as claimed, and the change history is kept.
          </p>
        </div>
      </div>

      <h2 style={{ marginTop: 40 }}>What it costs</h2>
      <p className="muted">
        Nothing. Claiming, correcting and removing a listing is never charged
        for and is never conditional on buying advertising. Paid marketing is a
        separate thing you can ignore entirely.{" "}
        <Link href="/methodology">How we check listings</Link>
      </p>

      <p className="hint">
        We will not hand control of a listing to anyone who cannot be verified as
        that agent or their authorised representative.
      </p>
    </main>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createSupabasePublicClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Local real estate professional directory",
  description:
    "Browse verified local real estate professionals by ZIP code, with published ranking criteria and labelled sponsored placements.",
};

export default async function DirectoryIndex({
  searchParams,
}: {
  searchParams: Promise<{ zip?: string }>;
}) {
  const { zip } = await searchParams;

  if (zip && /^[0-9]{5}$/.test(zip)) {
    redirect(`/directory/${zip}`);
  }

  const supabase = createSupabasePublicClient();
  const { data: zips } = await supabase
    .from("zip_area")
    .select("zip, primary_city, county")
    .eq("is_target", true)
    .order("zip");

  const rows = zips ?? [];

  return (
    <main className="page">
      <div className="wrap">
        <h1>Directory</h1>
        {zip && !/^[0-9]{5}$/.test(zip) ? (
          <div className="notice notice-warn">
            &ldquo;{zip}&rdquo; is not a five-digit ZIP code.
          </div>
        ) : null}

        {rows.length === 0 ? (
          <div className="notice notice-info">
            No areas are published yet.
          </div>
        ) : (
          <div className="grid grid-4">
            {rows.map((z) => (
              <Link
                key={z.zip as string}
                href={`/directory/${z.zip}`}
                className="stat"
                style={{ textDecoration: "none", display: "block" }}
              >
                <div className="label">{z.county ?? "New Jersey"}</div>
                <div className="value" style={{ fontSize: "1.2rem" }}>
                  {z.primary_city as string}
                </div>
                <div className="note">{z.zip as string}</div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

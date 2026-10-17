import Link from "next/link";
import { requireStaff, isAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import CoverageForm from "./CoverageForm";

export const dynamic = "force-dynamic";

export default async function CoveragePage() {
  const user = await requireStaff("/admin/coverage");
  const supabase = await createSupabaseServerClient();

  const { data: zips } = await supabase
    .from("zip_area")
    .select("zip, primary_city, county, is_target")
    .order("zip");

  const rows = zips ?? [];

  const { data: published } = await supabase
    .from("agent")
    .select("service_zips")
    .eq("status", "published");

  const publishedByZip = new Map<string, number>();
  for (const row of published ?? []) {
    for (const zip of (row.service_zips as string[]) ?? []) {
      publishedByZip.set(zip, (publishedByZip.get(zip) ?? 0) + 1);
    }
  }

  return (
    <>
      <h1>ZIP coverage</h1>
      <p className="muted">
        A ZIP code only gets a public page once it is marked as a target area.
        Start with one area, prove the research and approval loop, then expand.
      </p>

      {isAdmin(user.role) ? (
        <section className="section">
          <h2>Add or update an area</h2>
          <div className="card">
            <CoverageForm />
          </div>
        </section>
      ) : null}

      <section className="section">
        <h2>Areas ({rows.length})</h2>
        {rows.length === 0 ? (
          <div className="notice notice-info">
            No ZIP areas have been added yet. Add the first one above to begin
            Phase 1.
          </div>
        ) : (
          <div className="table-wrap card" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>ZIP</th>
                  <th>Town</th>
                  <th>County</th>
                  <th>Public page</th>
                  <th>Published profiles</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((z) => (
                  <tr key={z.zip as string}>
                    <td className="mono">{z.zip as string}</td>
                    <td>{z.primary_city as string}</td>
                    <td className="muted">{(z.county as string) ?? "—"}</td>
                    <td>
                      {z.is_target ? (
                        <Link href={`/directory/${z.zip}`} target="_blank">
                          <span className="badge badge-ok">live</span>
                        </Link>
                      ) : (
                        <span className="badge badge-neutral">not published</span>
                      )}
                    </td>
                    <td className="mono">{publishedByZip.get(z.zip as string) ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

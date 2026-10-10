import { NextResponse } from "next/server";
import { adminDb } from "../../../lib/server";

/** Pulls 5-digit ZIPs out of free text, de-duplicated, order preserved. */
function parseZips(input: string): string[] {
  const found = String(input).match(/\b[0-9]{5}\b/g) ?? [];
  return Array.from(new Set(found));
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const required = ["company", "contact", "email", "phone", "areas", "services"];
    for (const key of required) {
      if (!String(body[key] ?? "").trim()) {
        return NextResponse.json({ error: `Missing required field: ${key}` }, { status: 400 });
      }
    }

    const email = String(body.email).trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Enter a valid business email address." }, { status: 400 });
    }

    const zips = parseZips(body.areas);
    if (zips.length === 0) {
      return NextResponse.json(
        { error: "Please include at least one 5-digit New Jersey ZIP code you serve." },
        { status: 400 }
      );
    }

    const radius = Number(body.radius_miles ?? 25);
    if (!Number.isFinite(radius) || radius < 1 || radius > 100) {
      return NextResponse.json({ error: "Choose a service radius between 1 and 100 miles." }, { status: 400 });
    }

    const db = adminDb();
    if (!db) {
      return NextResponse.json(
        { error: "Applications aren't being accepted just yet. Please try again shortly." },
        { status: 503 }
      );
    }

    // Keep only ZIPs we can actually place on a map, otherwise matching
    // would silently never fire for this roofer.
    const { data: known } = await db.from("nj_zips").select("zip").in("zip", zips);
    const validZips = (known ?? []).map((r: { zip: string }) => r.zip);
    if (validZips.length === 0) {
      return NextResponse.json(
        { error: "We didn't recognise those as New Jersey ZIP codes. Please check and try again." },
        { status: 400 }
      );
    }
    const rejected = zips.filter((z) => !validZips.includes(z));

    const { error } = await db.from("roofers").insert({
      company: String(body.company).trim(),
      contact: String(body.contact).trim(),
      email,
      phone: String(body.phone).trim(),
      service_zips: validZips,
      radius_miles: Math.round(radius),
      services: String(body.services).trim(),
      status: "pending",
      notes: rejected.length ? `Unrecognised ZIPs submitted: ${rejected.join(", ")}` : "",
    });

    if (error) {
      return NextResponse.json({ error: "We couldn't save your application. Please try again." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, accepted_zips: validZips.length, ignored_zips: rejected });
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}

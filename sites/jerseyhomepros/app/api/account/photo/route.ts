import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { adminDb } from "../../../../lib/server";
import { requireContractor, PHOTO_BUCKET, MAX_GALLERY } from "../../../../lib/pros";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 3 * 1024 * 1024;

/** Identify the image by its first bytes, not by what the browser claims. */
function sniff(buf: Buffer): { type: string; ext: string } | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { type: "image/jpeg", ext: "jpg" };
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { type: "image/png", ext: "png" };
  }
  if (buf.length > 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") {
    return { type: "image/webp", ext: "webp" };
  }
  return null;
}

/**
 * Uploads a logo or a work photo for the signed-in contractor. The browser
 * resizes before sending, so files are small; the server still checks the
 * size and the real file type, and only ever writes under the contractor's
 * own folder.
 */
export async function POST(req: Request) {
  const me = await requireContractor(req);
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const db = adminDb();
  if (!db) return NextResponse.json({ error: "Database not connected." }, { status: 503 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Upload failed. Try a smaller photo." }, { status: 400 });
  }
  const kind = String(form.get("kind") ?? "");
  const file = form.get("file");
  if ((kind !== "logo" && kind !== "gallery") || !(file instanceof Blob)) {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That photo is over 3 MB." }, { status: 400 });
  if (kind === "gallery" && me.gallery_paths.length >= MAX_GALLERY) {
    return NextResponse.json({ error: `You can show up to ${MAX_GALLERY} photos. Remove one first.` }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const t = sniff(buf);
  if (!t) return NextResponse.json({ error: "Use a JPG, PNG or WebP photo." }, { status: 400 });

  const path = `${me.id}/${kind}-${crypto.randomBytes(8).toString("hex")}.${t.ext}`;
  const { error: upErr } = await db.storage.from(PHOTO_BUCKET).upload(path, buf, {
    contentType: t.type,
    cacheControl: "31536000",
    upsert: false,
  });
  if (upErr) {
    console.error(`[photo] upload failed provider=${me.id} error=${upErr.message}`);
    return NextResponse.json({ error: "Upload failed. Try again." }, { status: 500 });
  }

  const update =
    kind === "logo" ? { logo_path: path } : { gallery_paths: [...me.gallery_paths, path] };
  const { error } = await db.from("roofers").update(update).eq("id", me.id);
  if (error) {
    await db.storage.from(PHOTO_BUCKET).remove([path]);
    return NextResponse.json({ error: "Couldn't save the photo. Try again." }, { status: 500 });
  }
  // The replaced logo is no longer referenced anywhere.
  if (kind === "logo" && me.logo_path) await db.storage.from(PHOTO_BUCKET).remove([me.logo_path]);

  return NextResponse.json({ ok: true });
}

/** Removes the logo or one gallery photo. Only paths the contractor owns. */
export async function DELETE(req: Request) {
  const me = await requireContractor(req);
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const db = adminDb();
  if (!db) return NextResponse.json({ error: "Database not connected." }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { path?: unknown };
  const path = String(body.path ?? "");
  let update: Record<string, unknown>;
  if (path && path === me.logo_path) update = { logo_path: "" };
  else if (path && me.gallery_paths.includes(path)) update = { gallery_paths: me.gallery_paths.filter((p) => p !== path) };
  else return NextResponse.json({ error: "Photo not found." }, { status: 404 });

  const { error } = await db.from("roofers").update(update).eq("id", me.id);
  if (error) return NextResponse.json({ error: "Couldn't remove it. Try again." }, { status: 500 });
  await db.storage.from(PHOTO_BUCKET).remove([path]);
  return NextResponse.json({ ok: true });
}

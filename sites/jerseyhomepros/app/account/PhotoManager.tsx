"use client";
import { useState } from "react";

type Photo = { path: string; url: string | null };

/**
 * Shrinks a photo in the browser before upload: phone photos are often
 * 5-10 MB, and a request body that size is refused before it reaches us.
 * Transparent areas (common in logos) are filled white, since JPEG has no
 * transparency.
 */
async function shrink(file: File, maxSide: number): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("That file isn't a photo we can read."));
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Your browser couldn't prepare that photo.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't prepare that photo."))), "image/jpeg", 0.85)
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function PhotoManager({
  token, logo, gallery, maxGallery, onChange,
}: {
  token: string;
  logo: Photo | null;
  gallery: Photo[];
  maxGallery: number;
  onChange: () => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function upload(kind: "logo" | "gallery", files: FileList | null) {
    if (!files || files.length === 0 || busy) return;
    setBusy(true);
    const list = Array.from(files).slice(0, kind === "logo" ? 1 : Math.max(0, maxGallery - gallery.length));
    try {
      for (let i = 0; i < list.length; i++) {
        setNote(list.length > 1 ? `Uploading ${i + 1} of ${list.length}…` : "Uploading…");
        const blob = await shrink(list[i], kind === "logo" ? 800 : 1600);
        const form = new FormData();
        form.append("kind", kind);
        form.append("file", blob, "photo.jpg");
        const r = await fetch("/api/account/photo", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error ?? "Upload failed.");
      }
      setNote("Saved.");
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
      onChange();
    }
  }

  async function remove(path: string) {
    if (busy) return;
    setBusy(true);
    setNote("Removing…");
    const r = await fetch("/api/account/photo", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    const j = await r.json().catch(() => ({}));
    setNote(r.ok ? "Removed." : j.error ?? "Couldn't remove it.");
    setBusy(false);
    onChange();
  }

  return (
    <div className="photomgr">
      <div className="eyebrow dark" style={{ margin: "4px 0 8px" }}>LOGO OR MAIN PHOTO</div>
      <div className="photorow">
        {logo?.url
          ? <img className="photothumb logo" src={logo.url} alt="Your logo" />
          : <div className="photothumb empty">No photo yet</div>}
        <div>
          <label className="button darkbtn photobtn">
            {logo ? "Replace" : "Add photo"}
            <input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={busy}
                   onChange={(e) => { upload("logo", e.target.files); e.target.value = ""; }} />
          </label>
          {logo && <button type="button" className="photoremove" disabled={busy} onClick={() => remove(logo.path)}>Remove</button>}
        </div>
      </div>

      <div className="eyebrow dark" style={{ margin: "18px 0 8px" }}>
        PHOTOS OF YOUR WORK ({gallery.length}/{maxGallery})
      </div>
      <div className="photogrid">
        {gallery.map((g) => (
          <div key={g.path} className="photocell">
            {g.url && <img className="photothumb" src={g.url} alt="" />}
            <button type="button" className="photoremove" disabled={busy} onClick={() => remove(g.path)}>Remove</button>
          </div>
        ))}
        {gallery.length < maxGallery && (
          <label className="photothumb empty photoadd">
            + Add photos
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden disabled={busy}
                   onChange={(e) => { upload("gallery", e.target.files); e.target.value = ""; }} />
          </label>
        )}
      </div>
      <p className="adminmeta" style={{ marginTop: 8 }}>
        Only use photos you took or own. They appear on your public profile.
      </p>
      {note && <p role="status" className="adminnote">{note}</p>}
    </div>
  );
}

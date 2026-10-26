#!/usr/bin/env node
/**
 * Jersey Home Pros social graphics, in the Home Scan style: a real photo,
 * gold corner brackets on the thing being talked about, a small numbered tag,
 * a serif headline and the brand line. Same look every week — the brackets
 * ARE the brand on social.
 *
 * Usage: node make_posts.js <spec.json> <outDir>
 *
 * spec.json = { "posts": [ {
 *   "id": "2026-10-27-home-scan",
 *   "photo": "home-hud.jpg",              // file in sites/jerseyhomepros/public
 *   "crop": [x, y, w, h],                 // source px in the 1600x1062 photo; about 4:3 (w/h ≈ 1.32)
 *   "brackets": [ { "rect": [x,y,w,h], "label": "ROOF" } ],   // source px
 *   "eyebrow": "HOME SCAN",
 *   "headline": "Tap the problem.",
 *   "headlineEm": "We'll find the pro.",
 *   "sub": "Free for homeowners. South Jersey.",
 *   "story": true                          // also render 1080x1920
 * } ] }
 *
 * Rules (from the project): never claim a detection or a finding on the
 * photo; never feature a company that hasn't joined; no invented numbers.
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const PUBLIC = path.resolve(__dirname, "../../sites/jerseyhomepros/public");

function html(post, W, H) {
  const img = "data:image/jpeg;base64," + fs.readFileSync(path.join(PUBLIC, post.photo)).toString("base64");
  const [cx, cy, cw, ch] = post.crop;
  // Photo sits in the top part of the frame and the copy gets its own panel
  // below, so brackets never collide with the headline. Crops should be about
  // 4:3 (1080x820) — stories reuse the same crop, trimmed at the sides.
  const photoH = H === 1920 ? 1150 : 820;
  const scale = Math.max(W / cw, photoH / ch);
  const offX = -cx * scale + (W - cw * scale) / 2;
  const offY = -cy * scale + (photoH - ch * scale) / 2;
  const bracketSvg = (post.brackets || []).map((b, i) => {
    const [bx, by, bw, bh] = b.rect;
    const x = bx * scale + offX, y = by * scale + offY, w = bw * scale, h = bh * scale;
    const c = Math.min(46, w / 3, h / 3);
    const tagW = b.label.length * 17 + 74;
    const ty = y - 54 < 12 ? y + h + 12 : y - 54;
    const tx = Math.min(Math.max(12, x), W - tagW - 12);
    return `
      <path d="M${x} ${y + c}V${y}H${x + c} M${x + w - c} ${y}H${x + w}V${y + c} M${x + w} ${y + h - c}V${y + h}H${x + w - c} M${x + c} ${y + h}H${x}V${y + h - c}"
        fill="none" stroke="#f2c86a" stroke-width="6" stroke-linecap="square" style="filter:drop-shadow(0 0 6px rgba(214,173,88,.9))"/>
      <circle cx="${x + w / 2}" cy="${y + h / 2}" r="9" fill="#f2c86a" stroke="#0a0b0c" stroke-width="3"/>
      <rect x="${tx}" y="${ty}" width="${tagW}" height="42" rx="4" fill="rgba(10,11,12,.82)" stroke="#d6ad58" stroke-width="2"/>
      <text x="${tx + 14}" y="${ty + 29}" font-family="Arial" font-weight="800" font-size="22" fill="#f2c86a">${String(i + 1).padStart(2, "0")}</text>
      <text x="${tx + 56}" y="${ty + 29}" font-family="Arial" font-weight="800" font-size="22" letter-spacing="2" fill="#fff">${b.label}</text>`;
  }).join("");

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box;margin:0}
    body{width:${W}px;height:${H}px;background:#0a0b0c;font-family:Arial,Helvetica,sans-serif;overflow:hidden;position:relative}
    .photo{position:absolute;left:0;top:0;width:${W}px;height:${photoH}px;overflow:hidden}
    .photo img{position:absolute;left:${offX}px;top:${offY}px;width:${1600 * scale}px}
    .photo svg{position:absolute;inset:0}
    .grid{position:absolute;inset:0;background-image:linear-gradient(#d6ad5814 1.5px,transparent 1.5px),linear-gradient(90deg,#d6ad5814 1.5px,transparent 1.5px);background-size:54px 54px}
    .shade{position:absolute;left:0;right:0;top:${photoH - 140}px;height:140px;background:linear-gradient(to top,#0a0b0c,#0a0b0c00)}
    .status{position:absolute;left:28px;top:28px;padding:12px 18px 12px 44px;background:rgba(10,11,12,.75);border:2px solid #d6ad58;border-radius:4px;color:#e9d6ab;font-weight:700;font-size:20px;letter-spacing:3px}
    .status:before{content:"";position:absolute;left:18px;top:50%;width:12px;height:12px;margin-top:-6px;border-radius:50%;background:#d6ad58}
    .copy{position:absolute;left:64px;right:64px;bottom:${H === 1920 ? 240 : 52}px;color:#fff}
    .eyebrow{color:#d6ad58;font-weight:800;font-size:22px;letter-spacing:4px;display:flex;align-items:center;gap:14px}
    .eyebrow i{width:40px;height:2px;background:#d6ad58}
    h1{font-family:Georgia,'DejaVu Serif',serif;font-weight:400;font-size:${H === 1920 ? 84 : 66}px;line-height:1.02;letter-spacing:-2px;margin:22px 0 18px}
    h1 em{color:#d6ad58;font-style:italic}
    .sub{color:#d8d8d2;font-size:30px;line-height:1.4}
    .brand{display:flex;justify-content:space-between;align-items:center;margin-top:34px;padding-top:22px;border-top:1px solid #34352f;font-size:22px;letter-spacing:2px;font-weight:800}
    .brand b{color:#d6ad58}
    .brand span{color:#bdbdb6;font-weight:700;letter-spacing:1px}
  </style></head><body>
    <div class="photo"><img src="${img}"><div class="grid"></div>
      <svg width="${W}" height="${photoH}" viewBox="0 0 ${W} ${photoH}">${bracketSvg}</svg></div>
    <div class="shade"></div>
    <div class="status">${post.status || "HOME SCAN · TAP THE PROBLEM"}</div>
    <div class="copy">
      <div class="eyebrow"><i></i>${post.eyebrow}</div>
      <h1>${post.headline}${post.headlineEm ? `<br><em>${post.headlineEm}</em>` : ""}</h1>
      <div class="sub">${post.sub || ""}</div>
      <div class="brand"><div>JERSEY HOME <b>PROS</b></div><span>jerseyhomepros.com</span></div>
    </div>
  </body></html>`;
}

(async () => {
  const [specPath, outDir] = process.argv.slice(2);
  if (!specPath || !outDir) { console.error("usage: node make_posts.js spec.json outDir"); process.exit(1); }
  const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  for (const post of spec.posts) {
    const sizes = [[1080, 1350, "feed"]];
    if (post.story) sizes.push([1080, 1920, "story"]);
    for (const [W, H, kind] of sizes) {
      const page = await browser.newPage({ viewport: { width: W, height: H } });
      await page.setContent(html(post, W, H), { waitUntil: "load" });
      const file = path.join(outDir, `${post.id}-${kind}.png`);
      await page.screenshot({ path: file });
      await page.close();
      console.log(file);
    }
  }
  await browser.close();
})();

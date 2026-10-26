const { chromium } = require('playwright');
const out = process.argv[2];
const base = `*{margin:0;box-sizing:border-box}body{width:720px;height:1280px;background:transparent;font-family:Arial,Helvetica,sans-serif;position:relative;overflow:hidden}`;
const pages = {
 caption: `<div style="position:absolute;left:36px;right:36px;top:86px;background:#fff;border-radius:18px;padding:22px 26px;box-shadow:0 8px 30px rgba(0,0,0,.35);font-weight:800;font-size:40px;line-height:1.18;color:#111;text-align:center">Hired the <span style="background:#ffe08a;padding:0 6px;border-radius:6px">wrong movers</span>… again? 😩</div>`,
 bracket: `<svg width="720" height="1280" style="position:absolute;inset:0"><g fill="none" stroke="#f2c86a" stroke-width="9" stroke-linecap="square" style="filter:drop-shadow(0 0 8px rgba(214,173,88,.95))">
   <path d="M140 300V250H190 M600 250H650V300 M650 900V950H600 M190 950H140V900"/></g>
   <circle cx="395" cy="600" r="13" fill="#f2c86a" stroke="#0a0b0c" stroke-width="4"/></svg>
   <div style="position:absolute;left:140px;top:975px;background:rgba(10,11,12,.85);border:3px solid #d6ad58;border-radius:6px;padding:12px 18px;font-weight:800;font-size:30px;letter-spacing:2px;color:#fff"><span style="color:#f2c86a">01</span>&nbsp; TAP MOVING</div>`,
 endcard: `<div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 30%,#38342a 0%,#1b1b18 40%,#0a0b0c 80%)"></div>
   <svg width="720" height="1280" style="position:absolute;inset:0"><g fill="none" stroke="#f2c86a" stroke-width="7" stroke-linecap="square"><path d="M70 330V280H120 M600 280H650V330 M650 900V950H600 M120 950H70V900"/></g></svg>
   <div style="position:absolute;left:100px;right:100px;top:360px;color:#fff;text-align:center">
    <div style="font-size:64px">📦🛋️</div>
    <div style="font-family:Georgia,'DejaVu Serif',serif;font-size:60px;line-height:1.05;margin:26px 0 22px">Wrong contractor<br><em style="color:#d6ad58">again?</em></div>
    <div style="font-size:31px;line-height:1.45;color:#e4e4de">Tap the problem.<br>Compare local pros.<br><b style="color:#fff">You choose.</b></div>
   </div>
   <div style="position:absolute;left:0;right:0;top:1010px;text-align:center;color:#fff;font-weight:900;font-size:30px;letter-spacing:3px">JERSEY HOME <span style="color:#d6ad58">PROS</span></div>
   <div style="position:absolute;left:0;right:0;top:1056px;text-align:center;color:#d6ad58;font-weight:800;font-size:34px">jerseyhomepros.com</div>`
};
(async () => {
  const b = await chromium.launch();
  for (const [name, body] of Object.entries(pages)) {
    const p = await b.newPage({ viewport: { width: 720, height: 1280 } });
    await p.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${base}</style></head><body>${body}</body></html>`);
    await p.screenshot({ path: `${out}/${name}.png`, omitBackground: name !== 'endcard' });
    await p.close();
  }
  await b.close();
})();

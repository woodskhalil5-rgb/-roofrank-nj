// End-card options for the reels (Oct 27). Same look as cards.js endA; only the line changes.
const { chromium } = require('playwright'); const out=process.argv[2];
const bg=`<div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 35%,#38342a 0%,#1b1b18 42%,#0a0b0c 82%)"></div>
<svg width="720" height="1280" style="position:absolute;inset:0"><g fill="none" stroke="#f2c86a" stroke-width="7" stroke-linecap="square"><path d="M60 300V250H110 M610 250H660V300 M660 1000V1050H610 M110 1050H60V1000"/></g></svg>`;
const card=(l1,l2,fs=56)=>bg+`<div style="position:absolute;left:0;right:0;top:330px;text-align:center;color:#fff;font-weight:900;font-size:34px;letter-spacing:4px;font-family:Arial">JERSEY HOME <span style="color:#d6ad58">PROS</span></div>
<div style="position:absolute;left:70px;right:70px;top:420px;text-align:center;color:#fff;font-family:Georgia,'DejaVu Serif',serif;font-size:${fs}px;line-height:1.08">${l1}<br><em style="color:#d6ad58">${l2}</em></div>
<div style="position:absolute;left:60px;right:60px;top:680px;text-align:center;color:#e4e4de;font-family:Arial;font-size:30px;line-height:1.5">Tap the problem · Compare local pros<br><b style="color:#fff">You choose.</b></div>
<div style="position:absolute;left:0;right:0;top:960px;text-align:center;color:#d6ad58;font-family:Arial;font-weight:800;font-size:36px">jerseyhomepros.com</div>`;
const pages={
 'A-first-call':card('Your home&rsquo;s','first call.'),
 'B-one-call':card('One call for','your whole house.'),
 'C-before-you-call':card('Before you call a contractor,','call us.'),
 'D-not-selling':card('Not here to sell you a job.','Here to get it done right.',44),
};
(async()=>{const b=await chromium.launch();for(const[n,body]of Object.entries(pages)){const p=await b.newPage({viewport:{width:720,height:1280}});
await p.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>*{margin:0}body{width:720px;height:1280px;position:relative}</style></head><body>${body}</body></html>`);
await p.screenshot({path:`${out}/${n}.png`});await p.close()}await b.close()})();

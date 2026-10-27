const { chromium } = require('playwright'); const out=process.argv[2];
const cap=(t,top)=>`<div style="position:absolute;left:30px;right:30px;top:${top}px;text-align:center;font-family:'DejaVu Sans',Arial,sans-serif;font-weight:700;font-size:46px;white-space:nowrap;color:#fff;-webkit-text-stroke:2px #000;paint-order:stroke fill;text-shadow:0 3px 10px rgba(0,0,0,.55)">${t}</div>`;
const bg=`<div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 35%,#38342a 0%,#1b1b18 42%,#0a0b0c 82%)"></div>
<svg width="720" height="1280" style="position:absolute;inset:0"><g fill="none" stroke="#f2c86a" stroke-width="7" stroke-linecap="square"><path d="M60 300V250H110 M610 250H660V300 M660 1000V1050H610 M110 1050H60V1000"/></g></svg>`;
const head=`<div style="position:absolute;left:0;right:0;top:330px;text-align:center;color:#fff;font-weight:900;font-size:34px;letter-spacing:4px;font-family:Arial">JERSEY HOME <span style="color:#d6ad58">PROS</span></div>
<div style="position:absolute;left:90px;right:90px;top:420px;text-align:center;color:#fff;font-family:Georgia,'DejaVu Serif',serif;font-size:56px;line-height:1.08">Wrong contractor<br><em style="color:#d6ad58">again?</em></div>
<div style="position:absolute;left:60px;right:60px;top:610px;text-align:center;color:#e4e4de;font-family:Arial;font-size:30px;line-height:1.5">Tap the problem · Compare local pros<br><b style="color:#fff">You choose.</b></div>
<div style="position:absolute;left:0;right:0;top:960px;text-align:center;color:#d6ad58;font-family:Arial;font-weight:800;font-size:36px">jerseyhomepros.com</div>`;
const tag=`<div style="position:absolute;left:80px;right:80px;top:770px;text-align:center;color:#fff;font-family:Georgia,'DejaVu Serif',serif;font-style:italic;font-size:36px;line-height:1.3;border-top:1px solid #d6ad5880;padding-top:26px">Because “my cousin can do it”<br>isn’t a plan.</div>`;
const pages={line1:cap('Hired the wrong movers…',300),line2:cap('…again <span style="-webkit-text-stroke:0">😩</span>',362),endA:bg+head,endB:bg+head+tag};
(async()=>{const b=await chromium.launch();for(const[n,body]of Object.entries(pages)){const p=await b.newPage({viewport:{width:720,height:1280}});
await p.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>*{margin:0}body{width:720px;height:1280px;background:transparent;position:relative}</style></head><body>${body}</body></html>`);
await p.screenshot({path:`${out}/${n}.png`,omitBackground:n.startsWith('line')});await p.close()}await b.close()})();

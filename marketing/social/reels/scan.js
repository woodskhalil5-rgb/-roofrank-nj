// Clean Home Scan moment: brackets lock on the couch, a small panel loads, then confirms.
const { chromium } = require('playwright');
const out = process.argv[2], DUR = parseFloat(process.argv[3]), FPS = 24;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>*{margin:0}body{width:720px;height:1280px;background:transparent}</style></head>
<body><canvas id="c" width="720" height="1280"></canvas><script>
const c=document.getElementById('c'),g=c.getContext('2d');
const T={x:150,y:250,w:500,h:700};
const E=x=>1-Math.pow(1-Math.min(Math.max(x,0),1),3);
function rr(x,y,w,h,r){g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath()}
function t2(s,x,y,size,col,w){g.font=(w||700)+' '+size+'px Arial, "DejaVu Sans", sans-serif';g.textAlign='center';g.fillStyle=col;g.fillText(s,x,y)}
window.render=function(t){
  g.clearRect(0,0,720,1280);
  // brackets lock on (0-0.35)
  const p=E(t/0.35),k=1+(1-p)*0.2,cx=T.x+T.w/2,cy=T.y+T.h/2,w=T.w*k,h=T.h*k,x=cx-w/2,y=cy-h/2,cl=56;
  g.globalAlpha=p;g.strokeStyle='#f2c86a';g.lineWidth=7;g.lineCap='square';g.shadowColor='rgba(214,173,88,.9)';g.shadowBlur=12;
  g.beginPath();g.moveTo(x,y+cl);g.lineTo(x,y);g.lineTo(x+cl,y);g.moveTo(x+w-cl,y);g.lineTo(x+w,y);g.lineTo(x+w,y+cl);
  g.moveTo(x+w,y+h-cl);g.lineTo(x+w,y+h);g.lineTo(x+w-cl,y+h);g.moveTo(x+cl,y+h);g.lineTo(x,y+h);g.lineTo(x,y+h-cl);g.stroke();
  g.shadowBlur=0;g.globalAlpha=1;
  // panel (0.3+)
  if(t>0.3){const q=E((t-0.3)/0.3);g.globalAlpha=q;const pw=520,ph=170,px=(720-pw)/2,py=790+(1-q)*30;
    rr(px,py,pw,ph,18);g.fillStyle='rgba(12,13,14,.88)';g.fill();g.strokeStyle='rgba(214,173,88,.85)';g.lineWidth=2;g.stroke();
    t2('HOME SCAN',360,py+40,20,'#d6ad58',800);
    const load=Math.min(Math.max((t-0.5)/1.3,0),1);
    if(t<1.9){ t2('Finding movers near you…',360,py+88,30,'#fff');
      rr(px+50,py+118,pw-100,14,7);g.fillStyle='rgba(255,255,255,.15)';g.fill();
      rr(px+50,py+118,(pw-100)*E(load),14,7);g.fillStyle='#d6ad58';g.fill();
    } else { const r=E((t-1.9)/0.25);
      g.globalAlpha=q*r; t2('✓  Moving',360,py+92,40,'#fff',800);
      t2('Movers available in your ZIP',360,py+138,28,'#f2c86a',700);}
    g.globalAlpha=1;}
};
</script></body></html>`;
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:720,height:1280}});await p.setContent(html);
 const n=Math.round(DUR*FPS);for(let i=0;i<n;i++){await p.evaluate(t=>render(t),i/FPS);
 await p.screenshot({path:`${out}/f${String(i).padStart(4,'0')}.png`,omitBackground:true});}await b.close();console.log(n)})();

// Renders the animated Home Scan HUD as transparent PNG frames (720x1280, 24fps).
// t is seconds since the scan starts. Target box = the couch.
const { chromium } = require('playwright');
const out = process.argv[2], DUR = parseFloat(process.argv[3] || '5.06'), FPS = 24;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>*{margin:0}body{width:720px;height:1280px;background:transparent}canvas{display:block}</style></head>
<body><canvas id="c" width="720" height="1280"></canvas><script>
const c=document.getElementById('c'),g=c.getContext('2d');
const T={x:150,y:250,w:500,h:700};               // couch
const ease=x=>1-Math.pow(1-Math.min(Math.max(x,0),1),3);
function txt(s,x,y,size,col,align){g.font='700 '+size+'px "DejaVu Sans Mono",monospace';g.textAlign=align||'left';g.fillStyle=col;g.shadowColor='rgba(0,0,0,.8)';g.shadowBlur=6;g.fillText(s,x,y);g.shadowBlur=0}
function typed(s,t0,t,cps){const n=Math.floor(Math.max(0,t-t0)*cps);return s.slice(0,n)}
window.render=function(t){
  g.clearRect(0,0,720,1280);
  // 0-0.3 dim + grid in
  const dim=Math.min(t/0.3,1)*0.28; g.fillStyle='rgba(5,8,10,'+dim+')'; g.fillRect(0,0,720,1280);
  g.strokeStyle='rgba(214,173,88,'+(0.16*Math.min(t/0.4,1))+')'; g.lineWidth=1;
  for(let x=0;x<=720;x+=40){g.beginPath();g.moveTo(x,0);g.lineTo(x,1280);g.stroke()}
  for(let y=0;y<=1280;y+=40){g.beginPath();g.moveTo(0,y);g.lineTo(720,y);g.stroke()}
  // 0.1-0.9 scan sweep
  if(t>0.1&&t<1.1){const p=ease((t-0.1)/0.8);const y=p*1280;
    const gr=g.createLinearGradient(0,y-160,0,y);gr.addColorStop(0,'rgba(214,173,88,0)');gr.addColorStop(1,'rgba(255,230,168,.55)');
    g.fillStyle=gr;g.fillRect(0,y-160,720,160);g.fillStyle='rgba(255,236,190,.95)';g.fillRect(0,y-3,720,3);}
  // header readout
  txt('◉ HOME SCAN',36,232,24,'#f2c86a');
  txt(typed('TAP THE PROBLEM…',0.2,t,28),36,262,18,'#e9d6ab');
  // 0.8-1.1 brackets lock (shrink in)
  if(t>0.8){const p=ease((t-0.8)/0.3),k=1+(1-p)*0.25;const cx=T.x+T.w/2,cy=T.y+T.h/2,w=T.w*k,h=T.h*k,x=cx-w/2,y=cy-h/2,cl=56;
    g.strokeStyle='#f2c86a';g.lineWidth=7;g.lineCap='square';g.shadowColor='rgba(214,173,88,.95)';g.shadowBlur=14;g.globalAlpha=p;
    g.beginPath();g.moveTo(x,y+cl);g.lineTo(x,y);g.lineTo(x+cl,y);g.moveTo(x+w-cl,y);g.lineTo(x+w,y);g.lineTo(x+w,y+cl);
    g.moveTo(x+w,y+h-cl);g.lineTo(x+w,y+h);g.lineTo(x+w-cl,y+h);g.moveTo(x+cl,y+h);g.lineTo(x,y+h);g.lineTo(x,y+h-cl);g.stroke();
    g.shadowBlur=0;g.globalAlpha=1;
    // crosshair
    const r=18+6*Math.sin(t*8);g.strokeStyle='rgba(242,200,106,.9)';g.lineWidth=3;g.beginPath();g.arc(cx,cy,r,0,7);g.stroke();
    g.beginPath();g.moveTo(cx-34,cy);g.lineTo(cx-12,cy);g.moveTo(cx+12,cy);g.lineTo(cx+34,cy);g.moveTo(cx,cy-34);g.lineTo(cx,cy-12);g.moveTo(cx,cy+12);g.lineTo(cx,cy+34);g.stroke();
  }
  // 1.1+ data readouts (typed)
  if(t>1.1){const x=T.x+T.w-8,y0=T.y+T.h+44;
    txt(typed('PROBLEM ....... THIS COUCH',1.1,t,40),T.x,y0,20,'#fff');
    txt(typed('DOORWAY ....... DISAGREES',1.45,t,40),T.x,y0+30,20,'#fff');
    txt(typed('NEXT STEP ..... REAL MOVERS',1.8,t,40),T.x,y0+60,20,'#ffb4a8');}
  // 2.4+ result tag
  if(t>2.4){const p=ease((t-2.4)/0.25);g.globalAlpha=p;const tx=T.x,ty=T.y-74,w=360,h=56;
    g.fillStyle='rgba(10,11,12,.88)';g.fillRect(tx,ty,w,h);g.strokeStyle='#d6ad58';g.lineWidth=3;g.strokeRect(tx,ty,w,h);
    txt('TAP ▸ MOVING',tx+w/2,ty+38,30,'#f2c86a','center');g.globalAlpha=1;}
};
</script></body></html>`;
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:720,height:1280}});await p.setContent(html);
 const n=Math.round(DUR*FPS); for(let i=0;i<n;i++){await p.evaluate(t=>render(t),i/FPS);
  await p.screenshot({path:`${out}/f${String(i).padStart(4,'0')}.png`,omitBackground:true});}
 await b.close();console.log(n,'frames');})();

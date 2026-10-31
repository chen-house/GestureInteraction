import pw from '/opt/npm-tools/node_modules/playwright/index.js'; const { chromium } = pw;
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport:{width:1440,height:900} });
p.on('pageerror', e=>console.log('PAGEERROR', e.message));
await p.goto('file://' + process.cwd() + '/v33a.html');
await p.waitForTimeout(800);
const res = await p.evaluate(async ()=>{
  const g=globalThis.__gi, S=g.S, C=g.C;
  document.getElementById('gi-start').hidden = true;
  await g.audio();
  const {AC,master} = g.A();
  const an = AC.createAnalyser(); an.fftSize = 2048; master.connect(an);
  const buf = new Float32Array(an.fftSize);
  const PALM=[0,5,9,13,17];
  function fakeHand(cx,cy,open){ const L=[{x:cx,y:cy+0.10,z:0}]; const iX=cx-0.022,iY=cy+0.033;
    for(let j=1;j<=4;j++){const t=j/4;const oX=cx-0.03-0.055*t,oY=cy+0.075-0.045*t,nX=iX+0.004*t,nY=iY+0.010*t;
      L.push({x:nX+(oX-nX)*open,y:nY+(oY-nY)*open,z:0});}
    const fx=[0,-0.022,0.008,0.038,0.066];
    for(let f=1;f<5;f++) for(let j=1;j<=4;j++) L.push({x:cx+fx[f]*(1+j*0.1),y:cy+0.06-j*0.028*open,z:0.01*f});
    return L; }
  function palmOf(lm){let px=0,py=0;for(const j of PALM){px+=lm[j].x;py+=lm[j].y;}return {x:1-px/5,y:py/5};}
  function at(sx,sy,pinch){ let cx=1-sx,cy=sy;
    for(let i=0;i<4;i++){const q=palmOf(fakeHand(cx,cy,1)); cx-=(sx-q.x); cy+=(sy-q.y);}
    const L=fakeHand(cx,cy,1);
    if(pinch) L[4]={x:L[4].x+(L[8].x-L[4].x)*pinch, y:L[4].y+(L[8].y-L[4].y)*pinch, z:0};
    return L; }
  const yJ = j => C.P_LO + C.FIELD*(1 - C.JP_SEMI[j]/C.SEMIS);
  const sleep = ms => new Promise(r=>setTimeout(r,ms));
  const rms = () => { an.getFloatTimeDomainData(buf); let s=0; for(const v of buf) s+=v*v; return Math.sqrt(s/buf.length); };
  let feedT=null;
  async function run(tone, y, label){
    S.tone = tone; g.applyTone(); S.snap = 1;
    clearInterval(feedT);
    // 先松手离开，再到位置捏住
    for(let i=0;i<8;i++){ g.read({landmarks:[]}); await sleep(33); }
    const hand = at(0.95, y, 1.0);
    feedT = setInterval(()=>g.read({landmarks:[hand]}), 33);
    await sleep(600);
    const xs=[]; for(let i=0;i<30;i++){ xs.push(rms()); await sleep(70); }   // 2.1 秒
    const lo=Math.min(...xs), hi=Math.max(...xs), avg=xs.reduce((a,b)=>a+b)/xs.length;
    return {label, tone, voice:S.voice, midi:+S.midi.toFixed(2), avg:+avg.toFixed(4), lo:+lo.toFixed(4), hi:+hi.toFixed(4)};
  }
  const out=[];
  for(const tone of [5,3]){
    out.push(await run(tone, yJ("3"), "线上 E"));
    out.push(await run(tone, (yJ("3")+yJ("4"))/2, "E-F 中间"));
    out.push(await run(tone, yJ("5"), "线上 G"));
    out.push(await run(tone, (yJ("5")+yJ("6"))/2, "G-A 中间"));
  }
  clearInterval(feedT);
  return {state:AC.state, out};
});
console.log("AudioContext:", res.state);
for(const r of res.out) console.log((r.tone===5?"柔和":"玻璃")+"  "+r.label.padEnd(8)+"  出声="+r.voice+"  midi="+r.midi+"  RMS 平均 "+r.avg+"  最小 "+r.lo+"  最大 "+r.hi);
await b.close();

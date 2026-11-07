/* 引导视频生成：node make_guide.mjs <编排_引导.js> <输出名> [页面路径]
   和 make.mjs 同一套两遍法；区别：引导从第 1 步走到第 8 步，画面里要看得见引导气泡。
   第一遍用干净模式（加载失败不弹侧栏，免得整张背景重画、卡住），第二遍画的时候
   引导没走完就关掉干净模式（气泡要画），走完了再开（收尾不出「捏合拇指和食指」那行提示）。
   原注释：
   两遍法：第一遍实时演奏，只录声音、每 33ms 存一份状态；第二遍关掉实时循环，
   按 1/30 秒逐帧还原状态、用页面自己的 draw() 重画。画面不受渲染速度影响。
   页面必须是 v47 及以后（有 GI 接口）。跑完自动检查，不合格的项写进报告。 */
import fs from 'fs'; import path from 'path'; import { execFileSync } from 'child_process';
let pw; try { pw = await import('playwright'); } catch { pw = await import('/opt/npm-tools/node_modules/playwright/index.js'); }
const { chromium } = pw.default || pw;
const HERE = path.dirname(new URL(import.meta.url).pathname);
const [,, scoreFile, out, pageArg] = process.argv;
const PAGE = path.resolve(pageArg || path.join(HERE, '../../play.html'));
const SCORE = fs.readFileSync(scoreFile, 'utf8');
const FPS = 30, AV_OFFSET = 0.015;         // 手势画面比声音晚半个快照间隔左右，声音整体后移 15ms 补上（预备拍数字按时钟画，不晚）
const report = [], fail = m => report.push('✗ ' + m), ok = m => report.push('✓ ' + m);

async function passA(p){
  return p.evaluate(async ([SCORE]) => {
    const g = globalThis.GI, S = g.S, L = g.layout;
    S.clean = true;
    document.getElementById('gi-start').hidden = true;
    const cam = document.getElementById('gi-cam'); cam.checked = false; cam.dispatchEvent(new Event('change'));
    try { localStorage.clear(); } catch(e){}
    S.tour = undefined; S.bpm = 100; S.tone = 0; S.snap = 1; S.deck = 0; S.deckWant = 0; S.okD = 0; S.dVol = 0.8;
    await g.audio(); g.applyTone(); await new Promise(r => setTimeout(r, 1500));
    const PALM = [0,5,9,13,17];
    function fakeHand(cx,cy,open,tOpen){ const tO = tOpen===undefined ? open : tOpen; const Lm=[{x:cx,y:cy+0.10,z:0}]; const iX=cx-0.022,iY=cy+0.033;
      for(let j=1;j<=4;j++){const t=j/4;const oX=cx-0.03-0.055*t,oY=cy+0.075-0.045*t,nX=iX+0.004*t,nY=iY+0.010*t; Lm.push({x:nX+(oX-nX)*tO,y:nY+(oY-nY)*tO,z:0});}
      const fx=[0,-0.022,0.008,0.038,0.066];
      for(let f=1;f<5;f++) for(let j=1;j<=4;j++) Lm.push({x:cx+fx[f]*(1+j*0.1),y:cy+0.06-j*0.028*open,z:0.01*f}); return Lm; }
    function palmOf(lm){let px=0,py=0;for(const j of PALM){px+=lm[j].x;py+=lm[j].y;}return {x:1-px/5,y:py/5};}
    function at(sx,sy,open,tOpen,pinch){ let cx=1-sx,cy=sy; for(let i=0;i<4;i++){const q=palmOf(fakeHand(cx,cy,open,tOpen)); cx-=(sx-q.x); cy+=(sy-q.y);}
      const Lm=fakeHand(cx,cy,open,tOpen); if(pinch) Lm[4]={x:Lm[4].x+(Lm[8].x-Lm[4].x)*pinch,y:Lm[4].y+(Lm[8].y-Lm[4].y)*pinch,z:0}; return Lm; }
    const lerp = (a,b,u) => a+(b-a)*Math.max(0,Math.min(1,u));
    const yJ = L.yNote, yDeck = L.yDeck, menuDx = lab => L.menuPush(lab)[0];
    const { handsAt, duration, expect } = eval(SCORE);
    const { AC, master } = g.A(); const dest = AC.createMediaStreamDestination(); master.connect(dest);
    const rec = new MediaRecorder(dest.stream, { mimeType:'audio/webm;codecs=opus', audioBitsPerSecond:192000 }); const ch = [];
    rec.ondataavailable = e => ch.push(e.data);
    const T0 = performance.now(); rec.start(500);
    const snaps = [], marks = [], gaps = []; let pv = false, last = 0;
    const tk = setInterval(() => {
      const now = performance.now(), t = (now - T0)/1000;
      if(last && now - last > 90) gaps.push([+t.toFixed(2), Math.round(now - last)]); last = now;
      g.read({ landmarks: handsAt(t) });
      if(S.voice && !pv) marks.push([+t.toFixed(3), Math.round(S.midi)]); pv = S.voice;
      snaps.push({ t, now, S: JSON.stringify(S), level:[...g.level], pulse:[...g.pulse] });
    }, 33);
    await new Promise(r => setTimeout(r, duration*1000)); clearInterval(tk);
    rec.stop(); await new Promise(r => rec.onstop = r); AC.suspend();
    window.__snaps = snaps; window.requestAnimationFrame = () => 0; await new Promise(r => setTimeout(r, 300));
    const u = new Uint8Array(await new Blob(ch).arrayBuffer()); let s = '';
    for(let i=0;i<u.length;i+=32768) s += String.fromCharCode.apply(null, u.subarray(i, i+32768));
    return { audio:btoa(s), marks, gaps, expect, duration, tour:S.tour, nTour:null, tone:S.tone, label:'' };
  }, [SCORE]);
}

function check(A){
  if(A.gaps.length) fail(`录制中途卡顿 ${JSON.stringify(A.gaps)}`); else ok('录制全程无卡顿');
  A.tour >= 9 ? ok('8 步引导全部走完') : fail(`引导停在第 ${A.tour} 步`);
  const got = A.marks.map(m => m[1]);
  JSON.stringify(got) === JSON.stringify(A.expect) ? ok(`起音 ${got.length} 个，音高全对`) : fail(`起音不对：应为 ${A.expect.join(' ')}，实际 ${got.join(' ')}`);
  A.tone === 5 ? ok('最后切到了柔和') : fail(`最后的音色是 ${A.tone}`);
}

const b = await chromium.launch({ args:['--autoplay-policy=no-user-gesture-required'] });
let A, p;
for(let tries = 1; ; tries++){
  p = await (await b.newContext({ viewport:{ width:1920, height:1080 }, deviceScaleFactor:1 })).newPage();
  p.on('pageerror', e => console.log('PAGEERROR', e.message));
  await p.route(/jsdelivr|googleapis|storage\.googleapis/, r => r.abort());
  await p.goto('file://' + PAGE); await p.waitForTimeout(800);
  A = await passA(p);
  console.log(`第一遍 第 ${tries} 次：卡顿 ${A.gaps.length}`);
  if(!A.gaps.length || tries >= 3) break;
  await p.close();
}
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive:true });
fs.writeFileSync(out + '.audio.webm', Buffer.from(A.audio, 'base64'));
check(A);
const dir = out + '_frames'; fs.rmSync(dir, { recursive:true, force:true }); fs.mkdirSync(dir, { recursive:true });
const NF = Math.floor(A.duration * FPS);
for(let k0 = 0; k0 < NF; k0 += 20){
  const arr = await p.evaluate(([k0, NF, FPS, label]) => {
    const g = globalThis.GI, S = g.S, sn = window.__snaps, outv = [], cv = document.getElementById('gi-cv');
    for(let k = k0; k < Math.min(NF, k0+20); k++){
      const tf = k/FPS; let j = 0; while(j < sn.length-1 && sn[j+1].t <= tf) j++;
      const s = sn[j], st = JSON.parse(s.S);
      for(const key of Object.keys(st)) if(key !== 'bgKey') S[key] = st[key];
      if(st.tour === null) S.tour = undefined;
      S.clean = !(S.tour <= 8); S.lib = 'MediaPipe'; S.fatal = ''; S.loadStep = ''; document.body.classList.add('folded');
      g.level.splice(0, g.level.length, ...s.level); g.pulse.splice(0, g.pulse.length, ...s.pulse);
      const vnow = s.now + (tf - s.t)*1000; S.drawT = vnow - 1000/FPS;
      const realNow = performance.now; performance.now = () => vnow;
      try { g.draw(); } finally { performance.now = realNow; }
      if(label){ const c = cv.getContext('2d'), kk = cv.height/1080; c.save(); c.textAlign='right'; c.textBaseline='middle';
        c.font = `${13*kk}px -apple-system,"Noto Sans CJK SC",sans-serif`; c.fillStyle = 'rgba(28,43,32,0.45)';   // v50 起是浅底，标签用深字
        c.fillText(label, cv.width - 28*kk, cv.height - 22*kk); c.restore(); }
      outv.push(cv.toDataURL('image/jpeg', 0.9));
    }
    return outv;
  }, [k0, NF, FPS, A.label]);
  arr.forEach((d,i) => fs.writeFileSync(`${dir}/f${String(k0+i).padStart(5,'0')}.jpg`, Buffer.from(d.split(',')[1], 'base64')));
}
await b.close();
execFileSync('ffmpeg', ['-loglevel','error','-y','-framerate',String(FPS),'-i',`${dir}/f%05d.jpg`,'-itsoffset',String(AV_OFFSET),'-i',out+'.audio.webm',
  '-map','0:v','-map','1:a','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-shortest', out+'.mp4']);
/* 成片上量：第一个起音（第一步捏合），声音起点 vs 右半边画面开始变化的那一帧 */
{
  const t1 = A.marks[0][0], w0 = t1 - 0.5;
  const pcm = execFileSync('ffmpeg', ['-loglevel','error','-ss',String(w0),'-t','1','-i',out+'.mp4','-ac','1','-ar','22050','-f','s16le','-'], { maxBuffer: 1e9 });
  const x = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length/2), h = 128; let prev = -200, tA = null;
  for(let i = 0; i + h < x.length; i += h){ let e = 0; for(let j=0;j<h;j++) e += (x[i+j]/32768)**2;
    const db = 10*Math.log10(e/h + 1e-12); if(tA === null && db > -45 && db - prev > 8) tA = w0 + i/22050; prev = db; }
  const W = 960, H = 540, raw = execFileSync('ffmpeg', ['-loglevel','error','-ss',String(w0),'-t','1','-i',out+'.mp4','-vf',`scale=${W}:${H},format=gray`,'-f','rawvideo','-'], { maxBuffer: 1e9 });
  const N = raw.length/(W*H); const f0 = Math.round(w0*FPS); let tV = null, base = null;
  const diffN = (n,m) => { let c = 0; for(let y = Math.round(H*.25); y < H*.85; y++) for(let xx = Math.round(W*.45); xx < W*.95; xx++){ if(Math.abs(raw[n*W*H+y*W+xx] - raw[m*W*H+y*W+xx]) > 12) c++; } return c; };
  for(let n = 1; n < N && tV === null; n++){ const c = diffN(n, n-1); if(base === null) base = c; if(c > Math.max(80, base*3)) tV = (f0 + n)/FPS; }
  if(tA === null || tV === null) fail(`声画同步没量出来（声音 ${tA}，画面 ${tV}）`);
  else { const dms = Math.round((tV - tA)*1000); (Math.abs(dms) <= 40 ? ok : fail)(`声画同步：第一个音 声音 ${tA.toFixed(3)}s，画面 ${tV.toFixed(3)}s，差 ${dms}ms（画面晚为正）`); }
}
const probe = execFileSync('ffprobe', ['-v','error','-show_entries','stream=width,height,r_frame_rate,duration','-of','compact',out+'.mp4']).toString().trim();
ok('成片 ' + probe.replace(/\n/g,'  '));
const md = `# ${path.basename(out)} 检查报告（引导视频）\n\n${report.map(r => '- ' + r).join('\n')}\n`;
fs.writeFileSync(out + '.检查报告.md', md); console.log(md);
process.exit(report.some(r => r.startsWith('✗')) ? 1 : 0);

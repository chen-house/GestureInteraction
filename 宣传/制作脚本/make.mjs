/* 宣传片生成：node make.mjs <编排.js> <输出名> [页面路径]
   两遍法：第一遍实时演奏，只录声音、每 33ms 存一份状态；第二遍关掉实时循环，
   按 1/30 秒逐帧还原状态、用页面自己的 draw() 重画。画面不受渲染速度影响。
   页面必须是 v47 及以后（有 GI 接口）。跑完自动检查，不合格的项写进报告。 */
import fs from 'fs'; import path from 'path'; import { execFileSync } from 'child_process';
let pw; try { pw = await import('playwright'); } catch { pw = await import('/opt/npm-tools/node_modules/playwright/index.js'); }
const { chromium } = pw.default || pw;
const HERE = path.dirname(new URL(import.meta.url).pathname);
const [,, scoreFile, out, pageArg] = process.argv;
const PAGE = path.resolve(pageArg || path.join(HERE, '../../play.html'));
const SCORE = fs.readFileSync(scoreFile, 'utf8'), HANDS = fs.readFileSync(path.join(HERE, 'hands.js'), 'utf8');
const FPS = 30, AV_OFFSET = 0.015;         // 手势画面比声音晚半个快照间隔左右，声音整体后移 15ms 补上（预备拍数字按时钟画，不晚）
const report = [], fail = m => report.push('✗ ' + m), ok = m => report.push('✓ ' + m);

async function passA(p){
  return p.evaluate(async ([SCORE, HANDS]) => {
    const g = globalThis.GI, S = g.S, L = g.layout;
    if(!g || !g.countIn) throw new Error('页面没有 GI 接口（要 v47 及以后）');
    S.clean = true;
    document.getElementById('gi-start').hidden = true;
    const cam = document.getElementById('gi-cam'); cam.checked = false; cam.dispatchEvent(new Event('change'));
    try { localStorage.clear(); } catch(e){}
    const score = eval(SCORE);
    S.tour = 99; S.bpm = score.bpm; S.snap = 1; S.deck = 0; S.deckWant = 0; S.okD = 0; S.dVol = 0.8;
    const t0 = g.layout; const m0 = score.tone[0][1];
    await g.audio(); S.tone = ({"手碟":0,"柔和":5,"木琴":2,"玻璃":3})[m0]; g.applyTone();
    await new Promise(r => setTimeout(r, 1500));
    /* 假手：和真手同一套 21 个关键点 */
    const PALM = [0,5,9,13,17];
    function fakeHand(cx,cy,open,tOpen){ const tO = tOpen===undefined ? open : tOpen; const Lm=[{x:cx,y:cy+0.10,z:0}]; const iX=cx-0.022,iY=cy+0.033;
      for(let j=1;j<=4;j++){const t=j/4;const oX=cx-0.03-0.055*t,oY=cy+0.075-0.045*t,nX=iX+0.004*t,nY=iY+0.010*t; Lm.push({x:nX+(oX-nX)*tO,y:nY+(oY-nY)*tO,z:0});}
      const fx=[0,-0.022,0.008,0.038,0.066];
      for(let f=1;f<5;f++) for(let j=1;j<=4;j++) Lm.push({x:cx+fx[f]*(1+j*0.1),y:cy+0.06-j*0.028*open,z:0.01*f}); return Lm; }
    function palmOf(lm){let px=0,py=0;for(const j of PALM){px+=lm[j].x;py+=lm[j].y;}return {x:1-px/5,y:py/5};}
    function at(sx,sy,open,tOpen,pinch){ let cx=1-sx,cy=sy; for(let i=0;i<4;i++){const q=palmOf(fakeHand(cx,cy,open,tOpen)); cx-=(sx-q.x); cy+=(sy-q.y);}
      const Lm=fakeHand(cx,cy,open,tOpen); if(pinch) Lm[4]={x:Lm[4].x+(Lm[8].x-Lm[4].x)*pinch,y:Lm[4].y+(Lm[8].y-Lm[4].y)*pinch,z:0}; return Lm; }
    const lerp = (a,b,u) => a+(b-a)*Math.max(0,Math.min(1,u));
    /* 拇指张多大对应要的速度：问页面要目标读数，再在假手上二分出来 */
    const want = L.thumbFor(score.bpm); let lo=0, hi=1;
    for(let i=0;i<30;i++){ const mid=(lo+hi)/2; (g.fingerExt(at(.12,.5,1,mid,0),0) < want) ? lo=mid : hi=mid; }
    score._thumb = (lo+hi)/2;
    const { handsAt, expect, duration } = eval(HANDS)(score, at, lerp, L);
    const { AC, master } = g.A(); const dest = AC.createMediaStreamDestination(); master.connect(dest);
    const rec = new MediaRecorder(dest.stream, { mimeType:'audio/webm;codecs=opus', audioBitsPerSecond:192000 }); const ch = [];
    rec.ondataavailable = e => ch.push(e.data);
    const T0 = performance.now(); rec.start(500); g.clock.reset(0.1);
    setTimeout(() => g.countIn(), (expect.countIn - 0.3)*1000);
    const snaps = [], marks = [], track = [], gaps = []; let pv = false, last = 0;
    const tk = setInterval(() => {
      const now = performance.now(), t = (now - T0)/1000;
      if(last && now - last > 90) gaps.push([+t.toFixed(2), Math.round(now - last)]); last = now;
      g.read({ landmarks: handsAt(t) });
      if(S.voice && !pv) marks.push([+t.toFixed(3), Math.round(S.midi)]); pv = S.voice;
      track.push([+t.toFixed(3), S.deck, S.bpm, S.tone, S.voice ? +S.midi.toFixed(2) : 0]);
      snaps.push({ t, now, S: JSON.stringify(S), level:[...g.level], pulse:[...g.pulse] });
    }, 33);
    await new Promise(r => setTimeout(r, duration*1000)); clearInterval(tk);
    rec.stop(); await new Promise(r => rec.onstop = r); AC.suspend();
    window.__snaps = snaps; window.requestAnimationFrame = () => 0; await new Promise(r => setTimeout(r, 200));
    const u = new Uint8Array(await new Blob(ch).arrayBuffer()); let s = '';
    for(let i=0;i<u.length;i+=32768) s += String.fromCharCode.apply(null, u.subarray(i, i+32768));
    return { audio:btoa(s), marks, track, gaps, expect, duration, label: score.label||'', semi: g.C.JP_SEMI, midiLo: g.C.MIDI_LO };
  }, [SCORE, HANDS]);
}

function check(A){
  const midiOf = j => A.midiLo + (j === "1'" ? 12 : A.semi[j]);
  if(A.gaps.length) fail(`录制中途卡顿 ${JSON.stringify(A.gaps)}`); else ok('录制全程无卡顿');
  /* 起音：每个该起的音都要有一次，音高对、时间差在 60ms 内 */
  let bad = [], worst = 0, used = new Set();
  A.expect.taps.forEach(([t, j]) => {
    const m = A.marks.find((x,i) => !used.has(i) && Math.abs(x[0]-t) < 0.15 && (used.add(i), true));
    if(!m) return bad.push(`${t.toFixed(2)}s 该响 ${j} 没响`);
    if(m[1] !== midiOf(j)) bad.push(`${t.toFixed(2)}s 该是 ${j}(${midiOf(j)}) 实际 ${m[1]}`);
    worst = Math.max(worst, Math.abs(m[0]-t));
  });
  const extra = A.marks.length - used.size;
  bad.length ? fail(`起音 ${A.expect.taps.length} 个，有问题：${bad.join('；')}`) : ok(`起音 ${A.expect.taps.length} 个，音高全对，最大时间差 ${(worst*1000).toFixed(0)}ms`);
  if(extra) fail(`多出 ${extra} 次不该有的起音`);
  /* 滑音：每个音持续段的中间，实际音高要落在这个音上 */
  bad = [];
  A.expect.glides.forEach(([t, j, endBeat]) => {
    const tm = (t + A.expect.B0 + endBeat*A.expect.beat)/2;
    const r = A.track.reduce((a,b) => Math.abs(b[0]-tm) < Math.abs(a[0]-tm) ? b : a);
    if(Math.round(r[4]) !== midiOf(j)) bad.push(`${tm.toFixed(2)}s 该是 ${j} 实际 ${r[4]}`);
  });
  if(A.expect.glides.length) bad.length ? fail('滑音：' + bad.join('；')) : ok(`滑音 ${A.expect.glides.length} 个音全对`);
  /* 换档：要在那一拍上（容差 0.1 秒） */
  bad = [];
  A.expect.decks.forEach(([t, d]) => {
    const r = A.track.find(x => x[0] >= t - 0.6 && x[1] === d);
    if(!r || r[0] > t + 0.1 || r[0] < t - 0.1) bad.push(`该在 ${t.toFixed(2)}s 进 ${d} 档，实际 ${r ? r[0].toFixed(2)+'s' : '没进'}`);
  });
  bad.length ? fail('换档：' + bad.join('；')) : ok(`换档 ${A.expect.decks.length} 次都落在拍上`);
  const bpms = new Set(A.track.map(x => x[2])); bpms.size === 1 ? ok(`速度全程 ${[...bpms][0]}`) : fail(`速度变过：${[...bpms].join(' / ')}`);
  const TONE = {"手碟":0,"柔和":5,"木琴":2,"玻璃":3};
  bad = A.expect.tones.filter(([t,l]) => { const r = A.track.find(x => x[0] >= t); return !r || r[3] !== TONE[l]; });
  bad.length ? fail('音色没换对：' + JSON.stringify(bad)) : ok('音色切换都到位');
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
      g.level.splice(0, g.level.length, ...s.level); g.pulse.splice(0, g.pulse.length, ...s.pulse);
      const vnow = s.now + (tf - s.t)*1000; S.drawT = vnow - 1000/FPS;
      const realNow = performance.now; performance.now = () => vnow;
      try { g.draw(); } finally { performance.now = realNow; }
      if(label){ const c = cv.getContext('2d'), kk = cv.height/1080; c.save(); c.textAlign='right'; c.textBaseline='middle';
        c.font = `${13*kk}px -apple-system,"Noto Sans CJK SC",sans-serif`; c.fillStyle = 'rgba(226,236,228,0.38)';
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
/* 成片上量：预备拍第一下，声音起点 vs 数字出现的那一帧 */
{
  const ci = A.expect.countIn, w0 = ci - 0.5;
  const pcm = execFileSync('ffmpeg', ['-loglevel','error','-ss',String(w0),'-t','1','-i',out+'.mp4','-ac','1','-ar','22050','-f','s16le','-'], { maxBuffer: 1e9 });
  const x = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length/2), h = 128; let prev = -200, tA = null;
  for(let i = 0; i + h < x.length; i += h){ let e = 0; for(let j=0;j<h;j++) e += (x[i+j]/32768)**2;
    const db = 10*Math.log10(e/h + 1e-12); if(tA === null && db > -45 && db - prev > 8) tA = w0 + i/22050; prev = db; }
  const W = 960, H = 540, raw = execFileSync('ffmpeg', ['-loglevel','error','-ss',String(w0),'-t','1','-i',out+'.mp4','-vf',`scale=${W}:${H},format=gray`,'-f','rawvideo','-'], { maxBuffer: 1e9 });
  const N = raw.length/(W*H); let tV = null;
  const f0 = Math.round(w0*FPS);   // -ss 精确到帧
  /* 数字区域：右边音高场的中段。前后两帧有 50 个以上像素明显变亮/变暗，就算数字出现了 */
  for(let n = 1; n < N && tV === null; n++){ let c = 0;
    for(let y = Math.round(H*.3); y < H*.6; y++) for(let xx = Math.round(W*.45); xx < W*.95; xx++){ if(Math.abs(raw[n*W*H+y*W+xx] - raw[(n-1)*W*H+y*W+xx]) > 12) c++; }
    if(c > 50) tV = (f0 + n)/FPS; }
  if(tA === null || tV === null) fail(`声画同步没量出来（声音 ${tA}，画面 ${tV}）`);
  else { const dms = Math.round((tV - tA)*1000); (Math.abs(dms) <= 40 ? ok : fail)(`声画同步：预备拍第一下 声音 ${tA.toFixed(3)}s，画面 ${tV.toFixed(3)}s，差 ${dms}ms（画面晚为正）`); }
}
const probe = execFileSync('ffprobe', ['-v','error','-show_entries','stream=width,height,r_frame_rate,duration','-of','compact',out+'.mp4']).toString().trim();
ok('成片 ' + probe.replace(/\n/g,'  '));
const md = `# ${path.basename(out)} 检查报告\n\n${report.map(r => '- ' + r).join('\n')}\n`;
fs.writeFileSync(out + '.检查报告.md', md); console.log(md);
process.exit(report.some(r => r.startsWith('✗')) ? 1 : 0);

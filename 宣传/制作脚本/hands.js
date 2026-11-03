/* 把编排换算成「每一刻两只手在哪」。在页面里运行，坐标全部问页面要（GI.layout），
   界面改了这里不用改。返回 t(秒) → [手]。
   这里的几个时间常数是实测出来的，不是从代码推的：
   - 换档要在拍前 0.5 秒挪到位（页面要手停稳才认，然后等下一拍提交）
   - 捏合提前 0.06 秒（识别 + 判定大约晚两帧）
   - 八分音符捏 0.15 秒、松 0.15 秒；松开那 0.15 秒里换高度，手的平滑来得及跟上 */
(score, at, lerp, L) => {
  const B = b => 0.1 + b * 60 / score.bpm;
  const LEAD = 0.06, XR = 0.85, XL = 0.12;
  const parse = s => s.trim().split(/\s+/).map(tk => { const slow = tk.endsWith("~");
    const [j, d] = tk.replace("~","").split("/"); return { j, d:+d, slow }; });
  /* ---- 左手 ---- */
  const segs = [];                       // [t0, t1, t => {x,y,o}]
  const dk = score.deck.slice().sort((a,b)=>a[0]-b[0]);
  const tones = score.tone.slice(1);
  let y = null, x = XL;
  const ev = [];
  dk.forEach(([bar,d],i) => ev.push({ t: i===0 ? B(bar*4)-0.25 : B(bar*4)-0.5, kind:"deck", d }));
  tones.forEach(([bar,label]) => ev.push({ t: B(bar*4-4)+0.3, kind:"tone", label }));
  ev.sort((a,b)=>a.t-b.t);
  let cur = { x:XL, y:null, o:1 }, tCur = ev.length ? ev[0].t : 0;
  const push = (t0,t1,f) => segs.push([t0,t1,f]);
  for(let i=0;i<ev.length;i++){
    const e = ev[i], tNext = i+1<ev.length ? ev[i+1].t : B(score.endBeat);
    if(e.kind === "deck"){
      const y0 = cur.y === null ? L.yDeck(e.d) : cur.y, y1 = L.yDeck(e.d), x0 = cur.x;
      push(e.t, tNext, t => ({ x: lerp(x0, XL, (t-e.t)/.4), y: lerp(y0, y1, (t-e.t)/.3), o:1 }));
      cur = { x:XL, y:y1 };
    } else {
      const [dx, dy] = L.menuPush(e.label), x0 = cur.x, y0 = cur.y;
      push(e.t, e.t+1.0, t => ({ x:x0, y:y0, o:.05 }));                                   // 握拳，菜单打开
      push(e.t+1.0, e.t+2.0, t => ({ x:x0+dx*Math.min(1,(t-e.t-1)/.5), y:y0+dy*Math.min(1,(t-e.t-1)/.5), o:.05 }));
      push(e.t+2.0, tNext, t => ({ x:x0+dx, y:y0+dy, o:1 }));                             // 松开，选中
      cur = { x:x0+dx, y:y0+dy };
    }
  }
  /* ---- 右手 ---- */
  const R = [];                          // [t0, t1, {y, p}] 或 [t0,t1,t=>...]
  const mel = score.melodies.map(m => ({ ...m, n: parse(m.notes) }));
  mel.forEach((m, mi) => {
    let b = m.start; const notes = m.n.map(n => { const o = { ...n, b }; b += n.d; return o; });
    const end = b, firstY = L.yNote(notes.find(n=>n.j!=="0").j);
    const prev = mel[mi-1], prevEnd = prev ? prev._end : -1e9;
    if(m.start - prevEnd > 4) R.push([B(m.start-1.5), B(m.start)-LEAD, () => ({ y:firstY, p:0 })]);
    else R.push([B(prevEnd), B(m.start)-LEAD, () => ({ y:firstY, p:0 })]);
    if(m.mode === "tap"){
      const real = notes.filter(n => n.j !== "0");
      real.forEach((n, i) => {
        const s = B(n.b)-LEAD, dur = n.d*60/score.bpm, hold = dur <= 0.31 ? 0.15 : dur-0.18;
        const nx = real[i+1], tEnd = nx ? B(nx.b)-LEAD : B(end);
        R.push([s, s+hold, () => ({ y:L.yNote(n.j), p:1 })]);
        R.push([s+hold, tEnd, () => ({ y: nx ? L.yNote(nx.j) : L.yNote(n.j), p:0 })]);
      });
    } else {
      const s0 = B(m.start)-LEAD, e0 = B(end)-0.1;
      R.push([s0, e0, t => { let yy = L.yNote(notes[0].j);
        for(let i=1;i<notes.length;i++){ const ts = B(notes[i].b)-LEAD; if(t >= ts){
          const g = notes[i].slow ? 0.35 : 0.12; yy = lerp(L.yNote(notes[i-1].j), L.yNote(notes[i].j), (t-ts)/g); } }
        return { y:yy, p:1 }; }]);
      R.push([e0, B(end)+0.4, () => ({ y:L.yNote(notes[notes.length-1].j), p:0 })]);
    }
    m._end = end; mel[mi]._end = end;
  });
  const handsAt = t => {
    const h = [];
    const l = segs.find(s => t >= s[0] && t < s[1]); if(l){ const q = l[2](t); h.push(at(q.x, q.y, q.o, q.o < .5 ? q.o : score._thumb, 0)); }
    const r = R.find(s => t >= s[0] && t < s[1]); if(r){ const q = r[2](t); h.push(at(XR, q.y, 1, undefined, q.p)); }
    return h;
  };
  /* 给检查用：每个音应该在什么时候、是什么音高 */
  const expect = { taps:[], glides:[], decks: dk.map(([bar,d]) => [B(bar*4), d]),
                   tones: score.tone.map(([bar,l]) => [B(bar*4), l]), countIn: B(score.countInBar*4), B0:B(0), beat:60/score.bpm };
  mel.forEach(m => { let b = m.start; m.n.forEach((n,i) => { if(n.j !== "0"){
      (m.mode==="tap" || i===0 ? expect.taps : expect.glides).push([B(b), n.j, b+n.d]); } b += n.d; }); });
  return { handsAt, expect, duration: B(score.endBeat) + score.tail };
}

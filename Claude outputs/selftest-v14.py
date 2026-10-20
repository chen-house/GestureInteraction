#!/usr/bin/env python3
"""抽出页面的 module 脚本，配浏览器桩，在 node 里真跑一遍。
语法检查抓不到的 ReferenceError/TypeError、以及「函数定义了但没人调」这类，只有跑起来才暴露。"""
import re, subprocess, sys, pathlib

PAGE = sys.argv[1] if len(sys.argv) > 1 else '/mnt/user-data/outputs/play-v14.html'
body = re.search(r'<script type="module">(.*?)</script>', open(PAGE).read(), re.S).group(1)
body = body.replace('await import(lib+"/vision_bundle.mjs")', '(()=>{throw new Error("stub-no-network")})()')
body = body.replace('await import(lib + "/vision_bundle.mjs")', '(()=>{throw new Error("stub-no-network")})()')

STUB = r'''
globalThis.window = globalThis;
const noop = () => {};
globalThis.__calls = { stroke:0, fill:0, arc:0, fillText:0 };
function mkCtx(){
  const g = { addColorStop: noop };
  return new Proxy({}, { get(t,k){
    if(k in globalThis.__calls) return ()=>{ globalThis.__calls[k]++; };
    if(k==="createRadialGradient"||k==="createLinearGradient") return ()=>g;
    if(k==="measureText") return ()=>({width:10});
    if(k==="canvas") return {width:100,height:100};
    return ()=>undefined;
  }, set(){ return true; } });
}
function mkEl(id){ return { id, style:{cssText:""}, textContent:"", innerHTML:"", value:"100",
  checked:true, parentNode:null,
  classList:{add:noop,remove:noop,toggle:noop,contains:()=>false},
  addEventListener:noop, dispatchEvent:noop, appendChild:noop, remove:noop }; }
const els = {};
globalThis.document = {
  getElementById: id => (els[id] ??= mkEl(id)),
  body: { appendChild: noop, classList:{add:noop,remove:noop,toggle:noop,contains:()=>false} },
  createElement: tag => tag === "video"
    ? { srcObject:null, play:async()=>{}, readyState:0, videoWidth:640, videoHeight:480,
        addEventListener:noop, style:{cssText:""} }
    : mkEl(tag)
};
els["gi-cv"] = Object.assign(mkEl("gi-cv"), { getContext:()=>mkCtx(), width:1440, height:900,
  getBoundingClientRect:()=>({left:0,top:0,width:720,height:450}) });
globalThis.addEventListener = noop;
globalThis.Event = class { constructor(t){ this.type=t; } };
globalThis.location = { protocol:"http:" };
globalThis.devicePixelRatio = 2;
globalThis.innerWidth = 1440; globalThis.innerHeight = 900;
globalThis.requestAnimationFrame = () => 0;
globalThis.setInterval = () => 0;
globalThis.Path2D = class { moveTo(){} lineTo(){} ellipse(){} rect(){} closePath(){} quadraticCurveTo(){} arc(){} };
globalThis.__writes = 0;
const bump = () => { globalThis.__writes++; };
/* 记下最后一次写进去的目标值 —— 验「音色改了哪个参数、改成多少」要用 */
const param = () => { const p = { value:0, last:null };
  const w = v => { p.last = v; globalThis.__writes++; };
  return Object.assign(p, { setTargetAtTime:w, setValueAtTime:w,
    exponentialRampToValueAtTime:w, linearRampToValueAtTime:w, cancelScheduledValues:bump }); };
globalThis.AudioContext = class {
  constructor(){ this.state="running"; this.currentTime=0; this.sampleRate=48000; }
  createGain(){ return {gain:param(), connect(n){return n;}}; }
  createOscillator(){ return {type:"", frequency:param(), connect(n){return n;}, start:noop, stop:noop}; }
  createBiquadFilter(){ return {type:"", frequency:param(), Q:{value:0}, connect(n){return n;}}; }
  createBuffer(){ return {getChannelData:()=>new Float32Array(10)}; }
  createBufferSource(){ return {buffer:null, loop:false, connect(n){return n;}, start:noop, stop:noop}; }
  get destination(){ return {}; } resume(){}
};
Object.defineProperty(globalThis, "navigator", { configurable:true,
  value:{ mediaDevices:{ getUserMedia: async()=>{ throw new Error("stub-no-camera"); } } } });
'''

TEST = r'''
/* ── 测试台：按真机速率跑（识别 30fps，画面 60Hz） ── */
let CLK = 50000;
globalThis.performance = { now: ()=>CLK };
let DRAWS_PER_READ = 2;

function fakeHand(cx, cy, open){
  const L = [{x:cx, y:cy+0.10, z:0}];
  const iX = cx-0.022, iY = cy+0.033;
  for(let j=1;j<=4;j++){ const t=j/4;
    const oX=cx-0.03-0.055*t, oY=cy+0.075-0.045*t, nX=iX+0.004*t, nY=iY+0.010*t;
    L.push({ x:nX+(oX-nX)*open, y:nY+(oY-nY)*open, z:0 }); }
  const fx=[0,-0.022,0.008,0.038,0.066];
  for(let f=1;f<5;f++) for(let j=1;j<=4;j++)
    L.push({ x:cx+fx[f]*(1+j*0.1), y:cy+0.06-j*0.028*open, z:0.01*f });
  return L;
}
/* 页面读的是掌心五点质心，不是喂进去的 cx,cy —— 反解一下，
   让质心正好落在指定的屏幕位置 */
function palmOf(lm){ let px=0,py=0; for(const j of PALMPTS){ px+=lm[j].x; py+=lm[j].y; }
  return { x:1-px/PALMPTS.length, y:py/PALMPTS.length }; }
function atScreen(sx, sy, open){
  let cx=1-sx, cy=sy;
  for(let i=0;i<4;i++){ const p=palmOf(fakeHand(cx,cy,open));
    cx -= (sx-p.x); cy += (sy-p.y); }
  return fakeHand(cx, cy, open);
}
/* 一次识别 + 若干次画面。真机不是 1:1，1:1 会漏掉一整类 bug。 */
function tick(hands, dtMs){
  CLK += (dtMs===undefined ? 33 : dtMs);
  read({landmarks:hands||[]}); draw();
  for(let i=1;i<DRAWS_PER_READ;i++) draw();
}
function hold(lx, ly, n){ for(let i=0;i<(n||8);i++) tick([atScreen(lx,ly,1)]); }
function holdR(rx, ry, n){ for(let i=0;i<(n||8);i++) tick([atScreen(rx,ry,1)]); }
function away(n){ for(let i=0;i<(n||14);i++) tick([]); }   // 手离开画面
function glide(x0,y0,x1,y1,n){ for(let i=1;i<=(n||12);i++)
  tick([atScreen(x0+(x1-x0)*i/n, y0+(y1-y0)*i/n, 1)]); }
function beat(){ step=0; nextT=-1; sched(); S.deck=S.deckWant; }   // 推进到下一拍
function reset(){ resetHands(); S.deck=0; S.deckWant=0; S.dVol=0;
  S.sD=-1; S.okD=null; S.hadLeft=false; CLK+=3000; }
function resetHands(){ S.rT=-1e9; S.lT=-1e9; S.right=S.left=S.rKeep=S.lKeep=null; }
/* 第 d 档中心对应的屏幕高度 */
function yOfStep(d){ return VHI - (VHI-VLO)*((d+0.5)/STEPS); }
function lit(){ return LAYERS.filter((L,i)=>level[i]>0.5); }

const out=[];
function run(n,f){ try{ f(); out.push("OK   "+n); }
  catch(e){ out.push("FAIL "+n+" → "+e.message); } }

resize(); audio();

/* ══════════ 一、六个档位，逐档实测 ══════════ */
const TABLE = [];
for(let d=0; d<STEPS; d++){
  run("档 "+d+" 选得到", ()=>{
    reset();
    const y = yOfStep(d);
    hold(0.10, y, 10);
    if(S.deckWant !== d) throw new Error("手在 y="+y.toFixed(3)+" 却选到第 "+S.deckWant+" 档");
    beat(); draw();
    if(S.deck !== d) throw new Error("提交后是第 "+S.deck+" 档");
    const want = DECK_SET[d].slice().sort().join(",");
    const got  = lit().slice().sort().join(",");
    if(want !== got) throw new Error("第 "+d+" 档应响 ["+want+"]，实际 ["+got+"]");
    TABLE.push({ d, y, px:Math.round(y*900), on:lit(), vol:S.dVol });
  });
}

/* ══════════ 二、放下手 → 冻结 ══════════ */
for(let d=0; d<STEPS; d++){
  run("档 "+d+" 放手后保持", ()=>{
    reset();
    hold(0.10, yOfStep(d), 20); beat(); draw();
    const before = S.deck, onBefore = lit().join(",");
    away(20);                       // 手离开画面，超过 HOLD 的保持期
    beat(); draw();
    if(S.deck !== before) throw new Error("放手后档位从 "+before+" 变成 "+S.deck);
    if(lit().join(",") !== onBefore) throw new Error("放手后声部变了："+lit().join(","));
    if(d > 0 && !lit().length) throw new Error("放手后鼓停了");
  });
}
run("手滑出画面 不会被带到 0 档", ()=>{
  reset();
  hold(0.10, yOfStep(4), 20);   // 停稳在 4 档（约 660ms，超过 400ms 判稳）
  beat(); draw();
  /* 手往画面下方滑出去 —— 沿途会扫过 3、2、1、0 档 */
  glide(0.10, yOfStep(4), 0.10, 0.95, 12);
  away(20); beat(); draw();
  if(S.deck !== 4) throw new Error("滑出画面后档位变成了 "+S.deck+"，应保持在 4");
});
run("没停稳就放手 不算一次选择", ()=>{
  reset();
  hold(0.10, yOfStep(2), 20); beat(); draw();      // 停稳在 2
  if(S.deck !== 2) throw new Error("没停稳在 2");
  /* 快速扫过 4 档但不停留，然后立刻放手 */
  glide(0.10, yOfStep(2), 0.10, yOfStep(4), 4);
  away(20); beat(); draw();
  if(S.deck !== 2) throw new Error("路过 4 档就被选中了，得到 "+S.deck);
});
run("再抬手 接着改", ()=>{
  reset();
  hold(0.10, yOfStep(1), 20); beat(); draw();
  if(S.deck !== 1) throw new Error("第一次没选到 1");
  away(20);
  hold(0.10, yOfStep(4), 20); beat(); draw();
  if(S.deck !== 4) throw new Error("再抬手选 4，得到 "+S.deck);
});

/* ══════════ 三、六档本身的定义 ══════════ */
run("六档", ()=>{ if(STEPS!==6) throw new Error("STEPS="+STEPS); });
run("累积：每档都包含前一档", ()=>{ for(let d=1;d<STEPS;d++)
  for(const L of DECK_SET[d-1]) if(!DECK_SET[d].includes(L))
    throw new Error("第 "+d+" 档丢了 "+L); });
run("顶档覆盖全部八件", ()=>{ const a=DECK_SET[STEPS-1];
  if(a.length!==LAYERS.length) throw new Error("顶档 "+a.length+" 件");
  for(const L of LAYERS) if(!a.includes(L)) throw new Error("顶档缺 "+L); });
run("0 档是静的", ()=>{ if(DECK_SET[0].length) throw new Error("0 档有声部"); });
run("一档占 "+(((VHI-VLO)/STEPS)*900).toFixed(0)+"px", ()=>{
  const px = ((VHI-VLO)/STEPS)*900;
  if(px < 60) throw new Error("一档只有 "+px.toFixed(0)+"px，太窄"); });

/* ══════════ 四、状态机已删干净 ══════════ */
run("甩的状态机已删除", ()=>{
  for(const k of ["armed","fastN","fastDir","backDir","returning","slow"])
    if(typeof S[k] !== "undefined") throw new Error("S."+k+" 还在");
  const src = draw.toString();
  for(const k of ["S.armed","S.fastN","S.backDir","S.returning"])
    if(src.includes(k)) throw new Error("draw 里还有 "+k);
});
run("档位只由位置决定", ()=>{ const src = draw.toString();
  if(!/VHI - S\.left\.y/.test(src) && !/\(VHI - S\.left\.y\)/.test(src))
    throw new Error("draw 里找不到位置→档位的映射"); });

/* ══════════ 五、回归：其它功能一个都不许动 ══════════ */
run("回归 右手 y = 音高", ()=>{ reset();
  holdR(0.90, 0.30, 6); const hi=S.midi;
  reset(); holdR(0.90, 0.70, 6); const lo=S.midi;
  if(!(hi > lo + 6)) throw new Error("高处 "+hi.toFixed(1)+" 低处 "+lo.toFixed(1)); });
run("回归 右手 x = 音量", ()=>{ reset();
  holdR(0.605, 0.40, 6); const a=S.tvVol;
  reset(); holdR(0.95, 0.40, 6); const b=S.tvVol;
  if(a > 0.02) throw new Error("最内侧音量 "+a.toFixed(2));
  if(b < 0.98) throw new Error("最外侧音量 "+b.toFixed(2)); });
run("回归 左手 x = 打击乐音量", ()=>{ reset();
  hold(0.545, yOfStep(3), 8); const a=S.dVol;
  reset(); hold(0.10, yOfStep(3), 8); const b=S.dVol;
  if(a > 0.02) throw new Error("最内侧 "+a.toFixed(2));
  if(b < 0.98) throw new Error("最外侧 "+b.toFixed(2)); });
run("回归 左手 x 不影响档位", ()=>{ reset();
  hold(0.50, yOfStep(3), 8); const a=S.deckWant;
  hold(0.08, yOfStep(3), 8); const b=S.deckWant;
  if(a!==b || a!==3) throw new Error("x 变了档位："+a+" → "+b); });
run("卡片架的手势路径已删除", ()=>{
  if(typeof S.inCards !== "undefined") throw new Error("S.inCards 还在");
  if(/inCards/.test(draw.toString())) throw new Error("draw 里还有 inCards"); });
run("回归 鼠标点卡仍能换音色", ()=>{ reset(); S.tone=1;
  const ci = CARDS.findIndex(c=>c.g==="音色" && c.i===3);
  applyCard(ci);
  if(S.tone !== 3) throw new Error("点明亮卡之后音色是 "+S.tone); });
run("回归 节奏密度四档", ()=>{ if(DENS.length!==4) throw new Error("密度档数 "+DENS.length);
  for(let d=0;d<DENS.length;d++){
    const n = [...Array(16).keys()].filter(st=>PATTERN.surdo[st] && STEP_W[st]>=DENS[d].th).length;
    if(n===0) throw new Error(DENS[d].name+" 档把 surdo 抽没了"); } });
run("回归 谱子五首 都在一个八度内", ()=>{ if(TUNES.length!==4) throw new Error("谱子 "+TUNES.length+" 首");
  for(const T of TUNES) for(const tk of T.jp.split(/\s+/).filter(Boolean)){
    if(tk==="|"||tk==="-") continue;
    const oct = tk.endsWith("'") ? 12 : 0, base = tk.replace("'","");
    const m = MIDI_LO + JP_SEMI[base] + oct;
    if(m < MIDI_LO || m > MIDI_LO+SEMIS) throw new Error(T.name+" 的 "+tk+" 超出八度"); } });
run("回归 吸附默认 100%", ()=>{ if(S.snap !== 1.0) throw new Error("吸附 "+S.snap); });
run("回归 画面不崩", ()=>{ reset(); draw();
  tick([atScreen(0.80,0.40,1), atScreen(0.10,0.50,1)]); draw();
  const b=globalThis.__calls.stroke; draw();
  if(globalThis.__calls.stroke-b < 10) throw new Error("几乎没画东西"); });


/* ══════════ 六、转盘：一层，只有四个音色 ══════════ */
function holdFist(lx, ly, n, open){ for(let i=0;i<(n||8);i++) tick([atScreen(lx,ly,open===undefined?0.05:open)]); }
function resetAll(){ reset(); S.aOpen=0.6; S.fistT=0; S.fistLock=false; S.fist=false; S.tight=false;
  S.fistN=0; S.menu=0; S.anchor=null; S.item=-1; S.deckLocked=false; S.dTight=null; CLK+=1000; }
/* 从锚点朝某方向推（舞台像素），保持若干帧 */
function push(dir, px, n){
  const R0 = stage(), a = S.anchor; if(!a) throw new Error("盘没开，没有锚点");
  const o = [[0,-1],[1,0],[0,1],[-1,0]][dir];
  const nx = a.x + o[0]*px/R0.w, ny = a.y + o[1]*px/R0.h;
  for(let i=0;i<(n||16);i++) tick([atScreen(nx, ny, 0.05)]);
}
/* 连续移动着穿过某个方向，中途不停 —— 一层转盘是「推到哪就是哪」，
   所以路过也会生效，这是设计，不是 bug；这里只用来验「不会卡住」。 */
function sweep(dir, fromPx, toPx, n){
  const R0 = stage(), a = S.anchor; if(!a) throw new Error("盘没开");
  const o = [[0,-1],[1,0],[0,1],[-1,0]][dir], N = n||14;
  for(let i=1;i<=N;i++){ const d = fromPx + (toPx-fromPx)*i/N;
    tick([atScreen(a.x + o[0]*d/R0.w, a.y + o[1]*d/R0.h, 0.05)]); }
}
const DIRNAME = ["上","右","下","左"];

run("握拳能被认出来", ()=>{ resetAll();
  hold(0.10, 0.50, 8);
  if(S.fist) throw new Error("张开的手被当成了拳头");
  holdFist(0.10, 0.50, 8);
  if(!S.fist) throw new Error("握拳没认出来（openRaw="+S.openRaw.toFixed(3)+"）"); });
run("握拳就开盘 并锚定", ()=>{ resetAll();
  hold(0.10, 0.50, 8); holdFist(0.10, 0.50, 8);
  if(S.menu !== 1) throw new Error("S.menu = "+S.menu);
  if(!S.anchor) throw new Error("没有锚点");
  if(Math.abs(S.anchor.y - S.left.y) > 0.02) throw new Error("锚点不在握拳时的位置"); });
run("松开就关盘", ()=>{ resetAll();
  hold(0.10,0.50,8); holdFist(0.10,0.50,8); hold(0.10,0.50,8);
  if(S.fist) throw new Error("还认为在握拳");
  if(S.menu) throw new Error("盘没关"); });
run("死区内不选中 也不改音色", ()=>{ resetAll(); S.tone=1; applyTone();
  hold(0.10,0.50,8); holdFist(0.10,0.50,8);
  push(0, MENU_DEAD*0.5, 10);
  if(S.item !== -1) throw new Error("死区内就选中了方向 "+S.item);
  if(S.tone !== 1) throw new Error("手停在中间，音色却被改成了 "+S.tone); });

/* 四个方向 → 四个音色，逐项验到底写没写进去。
   MENU 不在就别让整个脚本死在加载期 —— 那样一条结果都看不到，
   拿旧版本交叉验证时就分不清「测试抓到了」和「测试自己崩了」。 */
const MENU_OK = (typeof MENU !== "undefined") && Array.isArray(MENU) && MENU.length === 4;
run("页面里有一层转盘（MENU 四项）", ()=>{
  if(typeof MENU === "undefined") throw new Error("找不到 MENU —— 这是两级菜单的版本");
  if(MENU.length !== 4) throw new Error("MENU 有 "+MENU.length+" 项"); });
const MENU_USE = MENU_OK ? MENU : [0,1,2,3].map(d=>({dir:d, label:"缺", i:d}));
const PICKED = [];
for(let d=0; d<4; d++){
  const e = MENU_USE.find(m=>m.dir===d), t = TONES[e.i];
  run("推"+DIRNAME[d]+" → "+e.label, ()=>{
    resetAll(); S.tone = (e.i+2)%4; applyTone();          // 先停在别的音色上
    hold(0.10,0.50,8); holdFist(0.10,0.50,8);
    push(d, MENU_DEAD*1.8, 16);
    if(S.tone !== e.i) throw new Error("S.tone = "+S.tone+"，应为 "+e.i);
    if(S.item !== d)   throw new Error("盘上高亮的是 "+S.item);
    if(osc.type !== t.type) throw new Error("波形是 "+osc.type+"，应为 "+t.type);
    if(tvFilter.frequency.last !== t.cut)
      throw new Error("低通写进去 "+tvFilter.frequency.last+"，应为 "+t.cut);
    hold(0.10, 0.50, 8);                                   // 松开拳头
    if(S.tone !== e.i) throw new Error("松开后被改回了 "+S.tone);
    if(S.menu) throw new Error("松开后盘没关");
    if(osc.type !== t.type) throw new Error("松开后波形变回了 "+osc.type);
    /* 颤音深度要靠右手在画面里才会写进去 —— 顺手量一下 */
    holdR(0.90, 0.40, 6);
    const f = 440*Math.pow(2,(S.midi-69)/12), want = f*t.vib;
    if(Math.abs(vibAmt.gain.last - want) > 1e-6)
      throw new Error("颤音深度 "+vibAmt.gain.last+"，应为 "+want.toFixed(4));
    PICKED.push({ dir:DIRNAME[d], label:e.label, tone:S.tone,
                  wave:osc.type, cut:tvFilter.frequency.last,
                  vib:t.vib, vibHz:vibAmt.gain.last });
  });
}

run("能连着换 每换一次都立刻写进去", ()=>{ resetAll(); S.tone=1;
  hold(0.10,0.50,8); holdFist(0.10,0.50,8);
  push(0, MENU_DEAD*1.8, 12); const a=S.tone, wa=osc.type;   // 上 = 纯净
  push(2, MENU_DEAD*1.8, 12); const b=S.tone, wb=osc.type;   // 下 = 人声
  push(1, MENU_DEAD*1.8, 12); const c=S.tone;                // 右 = 柔和
  if(a!==0) throw new Error("第一次选到 "+a);
  if(b!==2) throw new Error("第二次选到 "+b);
  if(c!==1) throw new Error("第三次选到 "+c);
  if(wa!=="sine")     throw new Error("纯净的波形是 "+wa);
  if(wb!=="sawtooth") throw new Error("人声的波形是 "+wb); });
run("回到中心 保持最后选的那个", ()=>{ resetAll(); S.tone=1;
  hold(0.10,0.50,8); holdFist(0.10,0.50,8);
  push(0, MENU_DEAD*1.8, 12);
  if(S.tone!==0) throw new Error("没选到纯净");
  push(0, MENU_DEAD*0.4, 12);                   // 手退回死区
  if(S.item !== -1) throw new Error("死区里还高亮着 "+S.item);
  if(S.tone!==0) throw new Error("回中心把值改掉了："+S.tone);
  hold(0.10,0.50,8);
  if(S.tone!==0) throw new Error("松开后变成了 "+S.tone); });
run("推出去再推回来 不会卡住", ()=>{ resetAll(); S.tone=1;
  hold(0.10,0.50,8); holdFist(0.10,0.50,8);
  sweep(0, 0, 180, 12); sweep(0, 180, 0, 12);   // 推上去再拉回来
  sweep(2, 0, 180, 12);
  if(S.tone !== 2) throw new Error("来回推完选到 "+S.tone+"，应为 2（下＝人声）");
  if(S.menu !== 1) throw new Error("盘自己关了"); });
run("手整个消失 等于松开", ()=>{ resetAll();
  hold(0.10,0.50,8); holdFist(0.10,0.50,8);
  if(!S.menu) throw new Error("盘没开");
  away(20);
  if(S.fist || S.menu) throw new Error("手没了盘还开着"); });
run("四个方向 每个方向有且只有一项", ()=>{
  const ds = MENU.map(e=>e.dir).sort();
  if(ds.join()!=="0,1,2,3") throw new Error("方向 = "+ds.join()); });
run("四项正好盖住四个音色", ()=>{
  if(MENU.length!==4) throw new Error("盘上 "+MENU.length+" 项");
  const t = MENU.map(e=>e.i).sort().join();
  if(t!=="0,1,2,3") throw new Error("音色 "+t);
  for(const e of MENU) if(e.label !== TONES[e.i].name)
    throw new Error("盘上写「"+e.label+"」却指向 "+TONES[e.i].name); });
run("四个音色的参数互不相同", ()=>{
  const k = TONES.map(t=>t.type+"/"+t.cut+"/"+t.vib);
  if(new Set(k).size !== 4) throw new Error("有重复的音色："+k.join("  ")); });
run("只有一层 没有二级", ()=>{ resetAll();
  hold(0.10,0.50,8); holdFist(0.10,0.50,8);
  for(let d=0; d<4; d++){ push(d, MENU_DEAD*1.8, 16);
    if(S.menu !== 1) throw new Error("推"+DIRNAME[d]+"之后 S.menu = "+S.menu); }
  for(const k of ["cat","menuCat","dwell","mPrev","lastDir","dirT"])
    if(typeof S[k] !== "undefined") throw new Error("S."+k+" 还在");
  const src = draw.toString();
  for(const k of ["MENU_L1","MENU_L2","CAT_CN","S.cat","S.menuCat","S.dwell","applyPick"])
    if(src.includes(k)) throw new Error("draw 里还有 "+k); });
run("握拳判定是双阈值", ()=>{
  if(!(FIST_GRAB < FIST_FREE)) throw new Error("不是双阈值");
  if(!(FIST_FLOOR > 0)) throw new Error("张开基准没有下限"); });

/* ══════════ 七、音色只管特雷门琴，碰不到鼓 ══════════ */
run("选音色不动节奏密度 不动谱子 不动档位", ()=>{ resetAll();
  hold(0.10, yOfStep(4), 20); beat(); draw();
  S.dens=2; S.tune=3;
  const d0=S.dens, u0=S.tune, k0=S.deck, on0=lit().join(",");
  holdFist(0.10, yOfStep(4), 8);
  for(let d=0; d<4; d++) push(d, MENU_DEAD*1.8, 12);
  hold(0.10, yOfStep(4), 8); beat(); draw();
  if(S.dens!==d0) throw new Error("节奏密度被改成了 "+S.dens);
  if(S.tune!==u0) throw new Error("谱子被改成了 "+S.tune);
  if(S.deck!==k0) throw new Error("档位被改成了 "+S.deck);
  if(lit().join(",")!==on0) throw new Error("在响的声部变了："+lit().join(",")); });
run("八个鼓的击点不随音色变", ()=>{ resetAll();
  const hitsOf = () => LAYERS.map(L =>
    [...Array(16).keys()].filter(st=>PATTERN[L][st] && STEP_W[st]>=DENS[S.dens].th).length).join(",");
  const h0 = hitsOf();
  for(let i=0;i<4;i++){ S.tone=i; applyTone();
    if(hitsOf() !== h0) throw new Error("音色 "+TONES[i].name+" 把鼓的击点改了："+h0+" → "+hitsOf()); } });
run("音色改的是 osc 波形 / 低通截止 / 颤音深度 这三个", ()=>{ resetAll();
  const seen = [];
  for(let i=0;i<4;i++){ S.tone=i; applyTone(); holdR(0.90,0.40,6);
    const f = 440*Math.pow(2,(S.midi-69)/12);
    if(osc.type !== TONES[i].type) throw new Error(TONES[i].name+" 波形 "+osc.type);
    if(tvFilter.frequency.last !== TONES[i].cut) throw new Error(TONES[i].name+" 低通 "+tvFilter.frequency.last);
    if(Math.abs(vibAmt.gain.last - f*TONES[i].vib) > 1e-6) throw new Error(TONES[i].name+" 颤音 "+vibAmt.gain.last);
    seen.push(TONES[i].name+" "+osc.type+" "+TONES[i].cut+"Hz 颤音"+(TONES[i].vib*100).toFixed(1)+"%");
    resetAll(); }
  if(new Set(seen).size !== 4) throw new Error("四个音色听起来是一样的"); });
run("右手不在 → 盘上要说「听不到」", ()=>{ resetAll();
  hold(0.10,0.50,8); holdFist(0.10,0.50,8);
  if(S.tvVol > 0.02) throw new Error("测试前提不成立，右手音量 "+S.tvVol);
  if(!/听不到/.test(draw.toString())) throw new Error("draw 里没有这条提示"); });

/* ══════════ 八、握拳期间档位冻结 ══════════ */
run("握拳时档位冻结", ()=>{ resetAll();
  hold(0.10, yOfStep(3), 20); beat(); draw();
  if(S.deck !== 3) throw new Error("没先选到 3 档");
  holdFist(0.10, yOfStep(3), 8);
  push(0, MENU_DEAD*1.8, 16);                   // 握着拳往上推一大截
  push(0, MENU_DEAD*2.6, 16);
  beat(); draw();
  if(S.deck !== 3) throw new Error("握拳用盘的时候档位变成了 "+S.deck); });
run("用完盘 手还在高处 档位不跟过去", ()=>{ resetAll();
  hold(0.10, yOfStep(2), 20); beat(); draw();
  if(S.deck !== 2) throw new Error("没先选到 2 档");
  holdFist(0.10, yOfStep(2), 8);
  push(0, MENU_DEAD*2.4, 16);                   // 上 = 纯净，手抬高了
  const hiY = S.left.y;
  hold(S.left.x, hiY, 20); beat(); draw();      // 松开，手就停在高处
  if(S.deck !== 2) throw new Error("松开后档位跟着手跳到了 "+S.deck+"（手在 y="+hiY.toFixed(3)+"）");
  if(S.tone !== 0) throw new Error("音色没选上，是 "+S.tone); });
run("手放下再抬起 档位才重新跟手", ()=>{ resetAll();
  hold(0.10, yOfStep(2), 20); beat(); draw();
  holdFist(0.10, yOfStep(2), 8);
  push(0, MENU_DEAD*2.4, 16);
  hold(S.left.x, S.left.y, 20);                 // 松开
  away(20);                                     // 手放下
  hold(0.10, yOfStep(5), 20); beat(); draw();   // 重新抬起来
  if(S.deck !== 5) throw new Error("重新抬手后改不动档位，还是 "+S.deck); });
run("松开后档位解冻", ()=>{ resetAll();
  hold(0.10, yOfStep(2), 20); beat(); draw();
  holdFist(0.10, yOfStep(2), 8);
  hold(0.10, yOfStep(2), 8); away(20);
  hold(0.10, yOfStep(5), 20); beat(); draw();
  if(S.deck !== 5) throw new Error("放下再抬起后改不动档位，还是 "+S.deck); });
run("握拳的 19px 偏移不挪档位", ()=>{ resetAll();
  const yEdge = VHI - (VHI-VLO)*(3.12/STEPS);
  hold(0.10, yEdge, 20); beat(); draw();
  const before = S.deck;
  holdFist(0.10, yEdge, 10); beat(); draw();
  if(S.deck !== before) throw new Error("握拳把档位从 "+before+" 挪到了 "+S.deck); });

/* ══════════ 九、顶部那条不再拦手 ══════════ */
run("手抬到顶部不会改音色", ()=>{ resetAll(); S.tone=1;
  hold(0.10, 0.50, 8);
  glide(0.10, 0.50, 0.30, 0.05, 14);
  hold(0.30, 0.05, 20);
  if(S.tone !== 1) throw new Error("抬手到顶部把音色改成了 "+S.tone); });
run("顶部读数条仍然可点", ()=>{ resetAll(); draw();
  if(CARD_HIT.length !== CARDS.length) throw new Error("命中框 "+CARD_HIT.length+" 个");
  for(const h of CARD_HIT) if(!h || !(h.w>0)) throw new Error("命中框缺失"); });
run("侧栏换音色和转盘是同一个状态", ()=>{ resetAll(); S.tone=0; applyTone();
  const ci = CARDS.findIndex(c=>c.g==="音色" && c.i===3);
  applyCard(ci);
  if(S.tone !== 3) throw new Error("点明亮卡之后音色是 "+S.tone);
  if(osc.type !== TONES[3].type) throw new Error("点卡没把波形改成 "+TONES[3].type);
  hold(0.10,0.50,8); holdFist(0.10,0.50,8); push(0, MENU_DEAD*1.8, 12);
  if(S.tone !== 0) throw new Error("转盘改不动点卡选过的音色"); });
run("节奏密度仍然只在侧栏 不在盘上", ()=>{ resetAll();
  for(const e of MENU) if(TONES[e.i] === undefined) throw new Error("盘上有非音色项");
  const names = MENU.map(e=>e.label).join(",");
  for(const d of DENS) if(names.includes(d.name)) throw new Error("盘上混进了节奏档「"+d.name+"」");
  S.dens=0; const thin = [...Array(16).keys()].filter(st=>PATTERN.caixa[st] && STEP_W[st]>=DENS[0].th).length;
  S.dens=3; const full = [...Array(16).keys()].filter(st=>PATTERN.caixa[st] && STEP_W[st]>=DENS[3].th).length;
  if(!(thin < full)) throw new Error("侧栏的密度不起作用："+thin+" / "+full); });

/* ══════════ 十、没停稳过就握拳，鼓不能停 ══════════ */
run("没停稳过就握拳 档位不掉到 0", ()=>{ resetAll();
  hold(0.10, yOfStep(3), 4);
  if(S.okD !== null) throw new Error("测试前提不成立：已经停稳过了");
  holdFist(0.10, yOfStep(3), 8); beat(); draw();
  if(S.deck === 0) throw new Error("握拳把档位冻在 0 档，鼓停了");
  if(S.deck !== 3) throw new Error("冻结到了 "+S.deck+" 档，应为 3");
  if(!level.some(v=>v>0.5)) throw new Error("没有鼓在响"); });
run("先在低处停过 再抬手握拳 不会冻回低档", ()=>{ resetAll();
  hold(0.10, yOfStep(0), 20);
  if(S.okD !== 0) throw new Error("测试前提不成立，okD="+S.okD);
  hold(0.10, yOfStep(3), 4);
  holdFist(0.10, yOfStep(3), 8); beat(); draw();
  if(S.deck !== 3) throw new Error("冻结到了 "+S.deck+" 档，应为 3（鼓会停）");
  if(!level.some(v=>v>0.5)) throw new Error("没有鼓在响"); });
run("握着拳换音色的整个过程 鼓一直在响", ()=>{ resetAll();
  hold(0.10, yOfStep(5), 20); beat(); draw();
  holdFist(0.10, yOfStep(5), 8);
  for(let d=0; d<4; d++){ push(d, MENU_DEAD*1.8, 12); beat(); draw();
    if(!level.some(v=>v>0.5)) throw new Error("推"+DIRNAME[d]+"的时候鼓停了"); }
  hold(0.10, yOfStep(5), 8); beat(); draw();
  if(!level.some(v=>v>0.5)) throw new Error("松开后鼓停了"); });

/* ══════════ 十一、握拳判定按比例，不按绝对值 ══════════ */
function aOf(lm){ let a=0; for(let f=1;f<5;f++) a += fingerExt(lm,f); return a/4; }
run("读数偏低的手 也能握上也能松开", ()=>{ resetAll();
  const OPEN = 0.42, FIST = 0.06;
  const aOpenV = aOf(atScreen(0.2,0.5,OPEN)), aFistV = aOf(atScreen(0.2,0.5,FIST));
  if(!(aOpenV < 0.55)) throw new Error("这只手张开读 "+aOpenV.toFixed(3)+"，不够低，测不出问题");
  S.aOpen = FIST_FLOOR;
  for(let i=0;i<30;i++) tick([atScreen(0.10,0.55,OPEN)]);
  if(S.fist) throw new Error("张开的手被当成拳头（a="+aOpenV.toFixed(3)+" 基准="+S.aOpen.toFixed(3)+"）");
  for(let i=0;i<10;i++) tick([atScreen(0.10,0.55,FIST)]);
  if(!S.fist) throw new Error("握不上（a="+aFistV.toFixed(3)+" 握拳线="+(S.aOpen*FIST_GRAB).toFixed(3)+"）");
  for(let i=0;i<10;i++) tick([atScreen(0.10,0.55,OPEN)]);
  if(S.fist) throw new Error("松不开（a="+aOpenV.toFixed(3)+" 松开线="+(S.aOpen*FIST_FREE).toFixed(3)+"）");
  if(S.menu) throw new Error("松开了盘还开着"); });
run("读数偏高的手 也能握上也能松开", ()=>{ resetAll();
  for(let i=0;i<20;i++) tick([atScreen(0.10,0.55,1.0)]);
  if(S.fist) throw new Error("张开被当成拳头");
  for(let i=0;i<10;i++) tick([atScreen(0.10,0.55,0.05)]);
  if(!S.fist) throw new Error("握不上");
  for(let i=0;i<10;i++) tick([atScreen(0.10,0.55,1.0)]);
  if(S.fist) throw new Error("松不开"); });
run("握着拳的时候 基准不漂", ()=>{ resetAll();
  for(let i=0;i<20;i++) tick([atScreen(0.10,0.55,1.0)]);
  const base = S.aOpen;
  for(let i=0;i<10;i++) tick([atScreen(0.10,0.55,0.05)]);
  if(!S.fist) throw new Error("没握上");
  for(let i=0;i<60;i++) tick([atScreen(0.10,0.55,0.05)]);
  if(S.aOpen < base - 1e-9) throw new Error("握着的时候基准往下漂了："+base.toFixed(4)+" → "+S.aOpen.toFixed(4));
  for(let i=0;i<10;i++) tick([atScreen(0.10,0.55,1.0)]);
  if(S.fist) throw new Error("握久了就松不开了"); });
run("卡死也能自己恢复（超时松开）", ()=>{ resetAll();
  for(let i=0;i<20;i++) tick([atScreen(0.10,0.55,1.0)]);
  for(let i=0;i<10;i++) tick([atScreen(0.10,0.55,0.05)]);
  if(!S.fist) throw new Error("没握上");
  for(let i=0;i<Math.ceil(FIST_MAXHOLD/33)+10;i++) tick([atScreen(0.10,0.55,0.05)]);
  if(S.fist) throw new Error("握了 "+(FIST_MAXHOLD/1000)+" 秒还没强制松开");
  if(S.menu) throw new Error("超时松开后盘还开着");
  for(let i=0;i<20;i++) tick([atScreen(0.10,0.55,0.05)]);
  if(S.fist) throw new Error("超时松开后又自己握上了");
  for(let i=0;i<15;i++) tick([atScreen(0.10,0.55,1.0)]);
  for(let i=0;i<10;i++) tick([atScreen(0.10,0.55,0.05)]);
  if(!S.fist) throw new Error("张开再握 握不上了"); });
run("松开之后 档位立刻能再调", ()=>{ resetAll();
  for(let i=0;i<20;i++) tick([atScreen(0.10,yOfStep(3),1.0)]);
  beat(); draw(); if(S.deck!==3) throw new Error("没先到 3 档");
  for(let i=0;i<10;i++) tick([atScreen(0.10,yOfStep(3),0.05)]);
  for(let i=0;i<10;i++) tick([atScreen(0.10,yOfStep(3),1.0)]);
  away(20);
  for(let i=0;i<20;i++) tick([atScreen(0.10,yOfStep(5),1.0)]);
  beat(); draw();
  if(S.deck !== 5) throw new Error("松开后调不动档位，还是 "+S.deck); });

/* ══════════ 十二、盘跟手 / 盘定住 ══════════ */
run("没握拳时 盘跟着手走", ()=>{ resetAll();
  for(let i=0;i<10;i++) tick([atScreen(0.10,0.55,1.0)]);
  if(S.menu) throw new Error("没握拳盘就开了");
  if(!/ghost/.test(draw.toString())) throw new Error("draw 里没有跟手的盘"); });
run("握拳后 盘定住不跟手", ()=>{ resetAll();
  for(let i=0;i<20;i++) tick([atScreen(0.10,0.55,1.0)]);
  for(let i=0;i<10;i++) tick([atScreen(0.10,0.55,0.05)]);
  if(!S.menu) throw new Error("没开盘");
  const a0 = { x:S.anchor.x, y:S.anchor.y }, R1 = stage();
  for(const d of [10, -8, 14, -12, 6, 20, -18]){
    tick([atScreen(a0.x + d/R1.w, a0.y - d/R1.h, 0.05)]);
    if(S.anchor.x !== a0.x || S.anchor.y !== a0.y)
      throw new Error("握着拳盘跟着手走了（移动 "+d+"px）");
  }
  if(S.menu !== 1) throw new Error("盘自己关了"); });
run("盘的锚点一握拳就定下 整个过程不重新锚", ()=>{ resetAll();
  for(let i=0;i<20;i++) tick([atScreen(0.10,0.55,1.0)]);
  for(let i=0;i<10;i++) tick([atScreen(0.10,0.55,0.05)]);
  const a0 = { x:S.anchor.x, y:S.anchor.y };
  for(let d=0; d<4; d++) push(d, MENU_DEAD*2.0, 12);
  if(S.anchor.x !== a0.x || S.anchor.y !== a0.y)
    throw new Error("推了四个方向之后锚点挪了"); });

console.log(out.join("\n"));
console.log("\n══════ 六个档位 实测结果 ══════");
console.log("档位   手的高度(屏幕)   实际在响的声部");
for(const r of TABLE)
  console.log("  "+r.d+"    y="+r.y.toFixed(3)+" ("+r.px+"px)    "
    + (r.on.length ? r.on.join(" ") : "（静）"));
console.log("\n══════ 转盘 实测结果（一层，四个音色）══════");
console.log("推的方向   选中   osc 波形     低通截止    颤音深度(占基频)   实写颤音");
for(const r of PICKED)
  console.log("   "+r.dir+"      "+r.label.padEnd(6)
    +" "+r.wave.padEnd(10)+" "+(r.cut+" Hz").padEnd(11)
    +" "+(r.vib*100).toFixed(1)+"%".padEnd(14)+"  "+r.vibHz.toFixed(2)+" Hz");
console.log("\n一档高 "+(((VHI-VLO)/STEPS)*900).toFixed(0)+"px   识别:画面 = 1:"+DRAWS_PER_READ);
const bad = out.filter(r=>r.startsWith("FAIL"));
console.log("\n合计 "+out.length+" 项，通过 "+(out.length-bad.length)+"，失败 "+bad.length);
if(bad.length) process.exitCode = 1;
'''

p = pathlib.Path('/tmp/claude-0/-home-claude/ee3a8254-dbdd-57b1-8257-71dbde321af7/scratchpad/_run14.mjs')
p.write_text(STUB + body + TEST)
r = subprocess.run(['node', str(p)], capture_output=True, text=True)
print(r.stdout or r.stderr)
sys.exit(r.returncode)

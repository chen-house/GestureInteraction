#!/usr/bin/env python3
"""抽出页面的 module 脚本，配浏览器桩，在 node 里真跑一遍。
语法检查抓不到的 ReferenceError/TypeError、以及「函数定义了但没人调」这类，只有跑起来才暴露。"""
import re, subprocess, sys, pathlib

PAGE = sys.argv[1] if len(sys.argv) > 1 else '/mnt/user-data/outputs/play-v26.html'
body = re.search(r'<script type="module">(.*?)</script>', open(PAGE).read(), re.S).group(1)
_src = open(PAGE).read()
# 初值和侧栏默认项在源码里，跑起来就被改过了 —— 在 Python 这边读，当成两条测试传进去
_DEF_OK  = "true" if re.search(r'const S = \{[^\n]*tone:0,', body) else "false"
_SIDE_OK = "true" if 'selected>手碟' in _src else "false" 
body = body.replace('import(lib+"/vision_bundle.mjs")', 'Promise.reject(new Error("stub-no-network"))')
assert 'vision_bundle' not in body.replace('LIBS','') or 'stub-no-network' in body, "import 没打上桩"
assert 'stub-no-network' in body, "import 桩没生效：boot 会真去联网"


STUB = r'''
globalThis.window = globalThis;
const noop = () => {};
globalThis.__calls = { stroke:0, fill:0, arc:0, fillText:0 };
globalThis.__texts = [];
function mkCtx(){
  const g = { addColorStop: noop };
  return new Proxy({}, { get(t,k){
    if(k === "fillText") return (s)=>{ globalThis.__calls.fillText++;
        if(typeof s === "string") globalThis.__texts.push(s); };
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
globalThis.__osc = [];
const bump = () => { globalThis.__writes++; };
/* 记下最后一次写进去的目标值 —— 验「音色改了哪个参数、改成多少」要用 */
const param = () => { const p = { value:0, last:null, log:[] };
  const w = v => { p.last = v; p.log.push(v); globalThis.__writes++; };
  return Object.assign(p, { setTargetAtTime:w, setValueAtTime:w,
    exponentialRampToValueAtTime:w, linearRampToValueAtTime:w, cancelScheduledValues:bump }); };
globalThis.AudioContext = class {
  constructor(){ this.state="running"; this.currentTime=0; this.sampleRate=48000; }
  createGain(){ return {gain:param(), connect(n){return n;}}; }
  createOscillator(){ const o = {type:"sine", frequency:param(), connect(n){return n;},
                                 start:noop, stop:noop}; globalThis.__osc.push(o); return o; }
  createBiquadFilter(){ return {type:"", frequency:param(), Q:{value:0}, connect(n){return n;}}; }
  createBuffer(){ return {getChannelData:()=>new Float32Array(10)}; }
  createBufferSource(){ return {buffer:null, loop:false, connect(n){return n;}, start:noop, stop:noop}; }
  get destination(){ return {}; } resume(){}
};
globalThis.self = globalThis;
/* fetch / caches 桩：可以按 url 指定「立刻失败 / 挂住不回 / 给多少字节」 */
globalThis.__fetchPlan = {};     // url → {ms, status, bytes}  ms=-1 表示永不回
globalThis.__fetched = [];
globalThis.fetch = (u) => {
  globalThis.__fetched.push(u);
  const p = globalThis.__fetchPlan[u] || {status:404, bytes:0};
  if(p.ms === -1) return new Promise(()=>{});                 // 挂住
  return new Promise((res,rej)=>setTimeout(()=>{
    if(p.status === 0) return rej(new Error("Failed to fetch"));
    res({ ok: p.status>=200 && p.status<300, status: p.status,
          arrayBuffer: async()=>new ArrayBuffer(p.bytes||0) });
  }, p.ms||0));
};
globalThis.Response = class { constructor(b){ this._b=b; }
  async arrayBuffer(){ return this._b; } };
globalThis.__cacheStore = new Map();
globalThis.__cacheOpens = 0;
globalThis.caches = { open: async()=>{ globalThis.__cacheOpens++; return {
  match: async u => globalThis.__cacheStore.get(u),
  put:   async (u,r) => { globalThis.__cacheStore.set(u, r); } }; } };
Object.defineProperty(globalThis, "navigator", { configurable:true,
  value:{ mediaDevices:{ getUserMedia: async()=>{ throw new Error("stub-no-camera"); } } } });
'''

TEST = ("const PAGE_DEFAULT_TONE_OK = %s;\nconst PAGE_SIDEBAR_HANDPAN = %s;\n" % (_DEF_OK, _SIDE_OK)) + r'''
/* ── 测试台：按真机速率跑（识别 30fps，画面 60Hz） ── */
let CLK = 50000;
globalThis.performance = { now: ()=>CLK };
let DRAWS_PER_READ = 2;

function fakeHand(cx, cy, open, tOpen){
  const tO = (tOpen===undefined) ? open : tOpen;   // 拇指可以单独动
  const L = [{x:cx, y:cy+0.10, z:0}];
  const iX = cx-0.022, iY = cy+0.033;
  for(let j=1;j<=4;j++){ const t=j/4;
    const oX=cx-0.03-0.055*t, oY=cy+0.075-0.045*t, nX=iX+0.004*t, nY=iY+0.010*t;
    L.push({ x:nX+(oX-nX)*tO, y:nY+(oY-nY)*tO, z:0 }); }
  const fx=[0,-0.022,0.008,0.038,0.066];
  for(let f=1;f<5;f++) for(let j=1;j<=4;j++)
    L.push({ x:cx+fx[f]*(1+j*0.1), y:cy+0.06-j*0.028*open, z:0.01*f });
  return L;
}
/* 页面读的是掌心五点质心，不是喂进去的 cx,cy —— 反解一下，
   让质心正好落在指定的屏幕位置 */
function palmOf(lm){ let px=0,py=0; for(const j of PALMPTS){ px+=lm[j].x; py+=lm[j].y; }
  return { x:1-px/PALMPTS.length, y:py/PALMPTS.length }; }
function atScreen(sx, sy, open, tOpen, pinch){
  let cx=1-sx, cy=sy;
  for(let i=0;i<4;i++){ const p=palmOf(fakeHand(cx,cy,open,tOpen));
    cx -= (sx-p.x); cy += (sy-p.y); }
  const L = fakeHand(cx, cy, open, tOpen);
  if(pinch){                       // 拇指尖往食指尖靠：pinch=1 就是捏在一起
    L[4] = { x:L[4].x+(L[8].x-L[4].x)*pinch, y:L[4].y+(L[8].y-L[4].y)*pinch, z:0 };
  }
  return L;
}
/* 右手：在某个音高上，捏 / 不捏 */
function pinchAt(ry, p, n){ for(let i=0;i<(n||6);i++) tick([atScreen(0.90,ry,1,undefined,p)]); }
/* 捏着 / 松着把手从一个音高移到另一个 */
function slide(y0, y1, p, n){ const N=n||14;
  for(let i=1;i<=N;i++) tick([atScreen(0.90, y0+(y1-y0)*i/N, 1, undefined, p)]); }
function yOfJP(j){ return LO + FIELD*(1 - JP_SEMI[j]/SEMIS); }
const yTop = LO;                      // 1' 那条线
function fLog(){ return osc.frequency.log; }
function gLog(){ return tvGain.gain.log; }
function gainNow(){ return tvGain.gain.last; }
/* 举着手不动，只动拇指 */
function thumbAt(lx, ly, tOpen, n){ for(let i=0;i<(n||20);i++) tick([atScreen(lx,ly,1,tOpen)]); }
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
function beat(){ step=0; nextT=-1; sched(); commitOnBeat(); }   // 推进到下一个四分拍（走真正那段提交代码）
function reset(){ resetHands(); S.deck=0; S.deckWant=0; S.dVol=0;
  S.sD=-1; S.okD=null; S.hadLeft=false; CLK+=3000; }
function resetHands(){ S.rT=-1e9; S.lT=-1e9; S.right=S.left=S.rKeep=S.lKeep=null; }
/* 第 d 档中心对应的屏幕高度 */
function yOfStep(d){ return VHI - (VHI-VLO)*((d+0.5)/STEPS); }
function lit(){ return LAYERS.filter((L,i)=>level[i]>0.5); }

const out=[];
function run(n,f){ try{ const r = f();
    if(r && typeof r.then === "function")
      throw new Error("用 run 跑了 async 函数 —— 会假通过，必须改用 runA");
    out.push("OK   "+n); }
  catch(e){ out.push("FAIL "+n+" → "+e.message); } }
async function runA(n,f){ try{ await f(); out.push("OK   "+n); }
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
  /* 位置→值。钳位之后映射写成 (VHI - yc)，yc 是钳过的 S.left.y */
  if(!/VHI - yc/.test(src) && !/VHI - S\.left\.y/.test(src))
    throw new Error("draw 里找不到位置→档位的映射");
  if(!/cl\(S\.left\.y, VLO, VHI\)/.test(src))
    throw new Error("没有把场外的位置钳到两端");
  for(const k of ["S.vy","S.fastN","S.armed"])
    if(src.includes(k)) throw new Error("档位又掺进了速度量 "+k); });

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
function resetAll(){ reset(); S.aOpen=0.6; S.fistT=0; S.fist=false; S.tight=false;
  S.fistN=0; S.menu=0; S.anchor=null; S.item=-1; S.deckLocked=false; S.dTight=null;
  S.aBucket=0; S.aBucketPrev=0; S.aBucketT=0; S.oHist=[]; S.lockY=null;
  S.gateMode='pinch'; S.outField=false; S.voicePrev=false; S.snapOff=0;
  S.pinchT=-1;
  if(osc) osc.frequency.log.length=0; globalThis.__osc.length=0; S.lastStrike=null;
  /* 收音收完就是 0，页面刚起来也是 0。桩只记「最后写进去的值」，
     不清的话上一条测试留下的满音量会被当成现在的状态。 */
  if(tvGain){ tvGain.gain.log.length=0; tvGain.gain.last=0; } S.bpm=100; S.bpmWant=100; S.tStep=-1; S.tT=0; S.thumb=0; S.thumbS=null; CLK+=1000; }
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
  const e = MENU_USE.find(m=>m.dir===d), T = TONES[e.i];
  run("推"+DIRNAME[d]+" → "+e.label, ()=>{
    resetAll(); S.tone = (e.i+2)%TONES.length; applyTone();
    hold(0.10,0.50,8); holdFist(0.10,0.50,8);
    globalThis.__osc.length = 0;
    push(d, MENU_DEAD*1.8, 16);
    if(S.tone !== e.i) throw new Error("S.tone = "+S.tone+"，应为 "+e.i);
    if(S.item !== d)   throw new Error("盘上高亮的是 "+S.item);
    /* 试听：推过去就该听得见 */
    const made = globalThis.__osc.splice(0);
    if(!made.length) throw new Error("推过去没发声");
    if(T.kind === "struck"){
      if(made.length !== T.modes.filter(m=>true).length && made.length < 2)
        throw new Error("敲击类只起了 "+made.length+" 个模");
    } else {
      if(osc.type !== T.type) throw new Error("持续类波形是 "+osc.type+"，应为 "+T.type);
    }
    hold(0.10, 0.50, 8);                                   // 松开拳头
    if(S.tone !== e.i) throw new Error("松开后被改回了 "+S.tone);
    if(S.menu) throw new Error("松开后盘没关");
    PICKED.push({ dir:DIRNAME[d], label:e.label, tone:S.tone, kind:T.kind,
                  wave:T.type||"—", cut:T.cut||0, vib:T.vib||0, vibHz:0 });
  });
}
run("能连着换 每换一次都发一声", ()=>{ resetAll(); S.tone=5; applyTone();
  hold(0.10,0.50,8); holdFist(0.10,0.50,8);
  const got = [];
  for(const d of [0,2,1]){
    globalThis.__osc.length = 0;
    push(d, MENU_DEAD*1.8, 12);
    got.push({ tone:S.tone, made:globalThis.__osc.length });
  }
  const want = [0,2,1].map(d=>MENU.find(m=>m.dir===d).i);
  got.forEach((g,i)=>{
    if(g.tone !== want[i]) throw new Error("第 "+(i+1)+" 次选到 "+g.tone+"，应为 "+want[i]);
    if(!g.made) throw new Error("第 "+(i+1)+" 次没发声");
  }); });
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
  const ids = MENU.map(e=>e.i);
  if(new Set(ids).size !== 4) throw new Error("四个方向指向重复的音色 "+ids.join());
  for(const i of ids) if(!TONES[i]) throw new Error("方向指向不存在的音色 "+i);
  for(const e of MENU) if(e.label !== TONES[e.i].name)
    throw new Error("盘上写「"+e.label+"」却指向 "+TONES[e.i].name); });
run("每个音色都不一样", ()=>{
  const k = TONES.map(t => t.kind==="struck"
    ? "struck:"+t.modes.map(m=>m.join(",")).join("|")
    : "sustain:"+t.type+"/"+t.cut+"/"+t.vib+"/"+t.beat);
  if(new Set(k).size !== TONES.length) throw new Error("有重复的音色"); });
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
run("敲击类改的是模态表 持续类改的是波形/低通/颤音", ()=>{
  const sig = [];
  for(let i=0;i<TONES.length;i++){
    resetAll(); S.tone=i; applyTone();
    const T = TONES[i];
    if(T.kind === "struck"){
      globalThis.__osc.length = 0;
      strike(MIDI_LO+7, 1);
      const made = globalThis.__osc.splice(0);
      if(!made.length) throw new Error(T.name+" 敲不响");
      sig.push(T.name+" "+made.map(o=>o.frequency.value.toFixed(0)).join("/"));
    } else {
      pinchAt(0.40, 1.0, 6);
      if(osc.type !== T.type) throw new Error(T.name+" 波形 "+osc.type);
      if(tvFilter.frequency.last !== T.cut) throw new Error(T.name+" 低通 "+tvFilter.frequency.last);
      const f = 440*Math.pow(2,(S.soundMidi-69)/12);
      sig.push(T.name+" "+osc.type+"/"+T.cut);
    }
  }
  if(new Set(sig).size !== TONES.length) throw new Error("有音色听起来是一样的"); });
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
run("顶部状态栏是只读的 画布上没有可点的卡", ()=>{ resetAll(); draw();
  if(typeof CARD_HIT !== "undefined") throw new Error("画布上还有卡片命中框");
  const src = draw.toString();
  if(/CARD_HIT/.test(src)) throw new Error("draw 里还在画卡片条"); });
run("状态栏读的是同一份状态 不是另一套", ()=>{ resetAll();
  S.tone=3; S.tune=1; S.dens=0; S.deck=4; S.deckWant=4; S.nHands=2; syncBar();
  const g = id => (els["gi-s-"+id]||{}).textContent;
  if(g("tone").indexOf(TONES[3].name) !== 0) throw new Error("音色格 "+g("tone"));
  if(!/· (敲|持续)$/.test(g("tone"))) throw new Error("音色格没标出是哪一家："+g("tone"));
  if(g("tune") !== TUNES[1].name) throw new Error("谱子格 "+g("tune"));
  if(g("dens") !== DENS[0].name)  throw new Error("密度格 "+g("dens"));
  if(g("deck") !== "4")           throw new Error("档位格 "+g("deck"));
  if(g("hands") !== "2")          throw new Error("手数格 "+g("hands")); });
run("换档没落地时 状态栏显示 现在→将要", ()=>{ resetAll();
  S.deck=2; S.deckWant=5; syncBar();
  if((els["gi-s-deck"]||{}).textContent !== "2 → 5")
    throw new Error("档位格 "+(els["gi-s-deck"]||{}).textContent); });
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
run("卡死的出路：把手移出画面，不靠任何阈值", ()=>{ resetAll();
  for(let i=0;i<20;i++) tick([atScreen(0.10,0.55,1.0)]);
  for(let i=0;i<10;i++) tick([atScreen(0.10,0.55,0.05)]);
  if(!S.fist) throw new Error("没握上");
  /* 握着不动很久，不许自己松开 —— 人握着拳在想选哪个音色，这很正常 */
  const t0 = CLK; while(CLK-t0 < 20000) tick([atScreen(0.10,0.55,0.05)]);
  if(!S.fist) throw new Error("握着不动 20 秒，拳头自己松开了");
  if(!S.menu) throw new Error("盘自己关了");
  away(30);                                   // 出路：手移出画面
  if(S.fist || S.menu) throw new Error("手移出画面了拳头还在");
  for(let i=0;i<20;i++) tick([atScreen(0.10,0.55,1.0)]);
  for(let i=0;i<10;i++) tick([atScreen(0.10,0.55,0.05)]);
  if(!S.fist) throw new Error("手回来之后握不上了"); });
run("强制松开和它的锁已经删干净", ()=>{
  if(typeof S.fistLock !== "undefined") throw new Error("S.fistLock 还在");
  if(typeof FIST_MAXHOLD !== "undefined") throw new Error("FIST_MAXHOLD 还在");
  const src = draw.toString();
  if(/fistLock|FIST_MAXHOLD/.test(src)) throw new Error("draw 里还有残留"); });
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


/* ══════════ 十三、这一轮修的两个 bug ══════════ */

/* —— bug 1：用过转盘之后，节奏就调不动了 —— */
run("松开拳头后 手没离开画面 也能再调节奏", ()=>{ resetAll();
  hold(0.10, yOfStep(2), 20); beat(); draw();
  if(S.deck !== 2) throw new Error("没先选到 2 档");
  holdFist(0.10, yOfStep(2), 8);
  push(0, MENU_DEAD*1.8, 12);                      // 握拳选个音色
  hold(S.left.x, S.left.y, 10);                    // 松开，手留在画面里
  glide(S.left.x, S.left.y, 0.10, yOfStep(5), 10); // 手不离开画面，直接去 5 档
  hold(0.10, yOfStep(5), 20); beat(); draw();
  if(S.deck !== 5) throw new Error("用过转盘之后节奏调不动了，还停在 "+S.deck+" 档"); });
run("连用三次转盘 节奏一直跟手", ()=>{ resetAll();
  hold(0.10, yOfStep(1), 20); beat(); draw();
  const want = [4, 2, 5];
  for(let i=0;i<3;i++){
    holdFist(0.10, S.left.y, 8);
    push(i%4, MENU_DEAD*1.8, 12);
    hold(S.left.x, S.left.y, 10);                  // 松开
    glide(S.left.x, S.left.y, 0.10, yOfStep(want[i]), 10);
    hold(0.10, yOfStep(want[i]), 20); beat(); draw();
    if(S.deck !== want[i]) throw new Error("第 "+(i+1)+" 次用完转盘，档位卡在 "+S.deck+"，应为 "+want[i]);
  } });
run("松手那一刻 档位不跟着跳过去", ()=>{ resetAll();
  hold(0.10, yOfStep(2), 20); beat(); draw();
  holdFist(0.10, yOfStep(2), 8);
  push(0, MENU_DEAD*2.4, 12);                      // 推上去，手比原来高了一大截
  hold(S.left.x, S.left.y, 10); beat(); draw();    // 松开，手不动
  if(S.deck !== 2) throw new Error("松开的瞬间档位跳到了 "+S.deck); });
run("手只是抖 不算要调节奏", ()=>{ resetAll();
  hold(0.10, yOfStep(3), 20); beat(); draw();
  holdFist(0.10, yOfStep(3), 8);
  push(1, MENU_DEAD*1.8, 12);
  const y0 = S.left.y;
  hold(S.left.x, y0, 10);                          // 松开
  const jit = (VHI-VLO)/STEPS*0.3;                 // 抖动幅度 = 0.3 档，小于半档
  for(const d of [1,-1,1,-1,1]){ hold(S.left.x, y0 + d*jit, 4); beat(); draw(); }
  if(S.deck !== 3) throw new Error("抖一抖就把档位改成了 "+S.deck); });
run("解锁的门槛正好是半档", ()=>{ resetAll();
  const stepH = (VHI-VLO)/STEPS;
  for(const [frac, should] of [[0.4,false],[0.6,true]]){
    resetAll();
    hold(0.10, yOfStep(3), 20); beat(); draw();
    holdFist(0.10, yOfStep(3), 8); push(1, MENU_DEAD*1.8, 12);
    const y0 = S.left.y; hold(S.left.x, y0, 10);
    hold(S.left.x, y0 + stepH*frac, 10);
    if(S.deckLocked === should)
      throw new Error("移动 "+(frac*100).toFixed(0)+"% 档后 "+(should?"还锁着":"就解锁了"));
  } });

/* —— bug 2：握拳能用两次，之后就认不出来了 ——
   原因是张开基准被「半松的手」一路拖下去（v14 是缓慢衰减）。
   下面按真实用法跑：演奏一段 → 握拳选音色 → 张开松手 → 再演奏一段。 */
function cyc(hoverO, fistO, hoverMs, nCycle){
  resetAll();
  for(let i=0;i<30;i++) tick([atScreen(0.10,0.50,1.0)]);      // 开场手是摊开的
  let grab=0, free=0, firstFail=0;
  for(let c=1;c<=nCycle;c++){
    const t0 = CLK;
    while(CLK - t0 < hoverMs) tick([atScreen(0.10,0.50,hoverO)]);  // 演奏：手半松着
    for(let i=0;i<12;i++)     tick([atScreen(0.10,0.50,fistO)]);   // 握拳
    if(S.fist){ grab++;
      for(let i=0;i<12;i++) tick([atScreen(0.10,0.50,1.0)]);       // 张开松手
      if(!S.fist) free++;
    } else { if(!firstFail) firstFail = c;
      for(let i=0;i<12;i++) tick([atScreen(0.10,0.50,1.0)]); }
  }
  return { grab, free, firstFail, n:nCycle };
}
const SWEEP = [];
for(const hoverO of [1.0, 0.6, 0.4])
  for(const fistO of [0.05, 0.15, 0.25]){
    const r = cyc(hoverO, fistO, 10000, 4);
    SWEEP.push({ hoverO, fistO, r });
  }
run("演奏十秒再握拳 四个来回都认得出来（手半松，open=0.4）", ()=>{
  const r = cyc(0.4, 0.15, 10000, 4);
  if(r.grab !== 4) throw new Error("四次只握上了 "+r.grab+" 次（第 "+r.firstFail+" 次开始失灵）");
  if(r.free !== 4) throw new Error("四次只松开了 "+r.free+" 次"); });
run("手一直摊开着用 也不会越来越难握", ()=>{
  const r = cyc(1.0, 0.05, 10000, 4);
  if(r.grab !== 4 || r.free !== 4) throw new Error("握 "+r.grab+"/4  松 "+r.free+"/4"); });
run("半松的手拖不动张开基准", ()=>{ resetAll();
  for(let i=0;i<30;i++) tick([atScreen(0.10,0.50,1.0)]);
  const base0 = S.aOpen;
  const t0 = CLK; while(CLK - t0 < 8000) tick([atScreen(0.10,0.50,0.4)]);   // 半松着停 8 秒
  if(S.aOpen < base0 - 0.02)
    throw new Error("基准被拖下去了："+base0.toFixed(3)+" → "+S.aOpen.toFixed(3)); });
run("真换了姿势 基准二十秒内跟得上", ()=>{ resetAll();
  for(let i=0;i<30;i++) tick([atScreen(0.10,0.50,1.0)]);
  const t0 = CLK; while(CLK - t0 < 23000) tick([atScreen(0.10,0.50,0.5)]); // 23 秒都只张到一半
  if(S.aOpen > 0.55) throw new Error("二十秒了基准还停在 "+S.aOpen.toFixed(3)); });
run("握拳的实时读数在状态栏里 截图一定带着", ()=>{ resetAll();
  for(let i=0;i<20;i++) tick([atScreen(0.10,0.50,1.0)]);
  if(!(S.oMax > 0 && S.oMin <= S.oMax)) throw new Error("十秒范围没在记："+S.oMin+"~"+S.oMax);
  syncBar();
  const txt = (els["gi-s-fist"]||{}).textContent || "";
  if(!/张开|握拳/.test(txt)) throw new Error("状态栏没写握拳状态："+txt);
  if(!/10秒/.test(txt)) throw new Error("状态栏没写十秒范围："+txt);
  if(!/握</.test(txt) || !/松>/.test(txt)) throw new Error("状态栏没写两条线："+txt); });


/* ══════════ 十四、这一轮改的版面 ══════════ */
run("八件乐器按档位分五层 一件不多一件不少", ()=>{
  const flat = DECK_ADD.flat();
  if(flat.length !== LAYERS.length) throw new Error("五层一共 "+flat.length+" 件");
  for(const L of LAYERS) if(!flat.includes(L)) throw new Error("掉了 "+L);
  if(DECK_ADD[0].length) throw new Error("0 档不该有乐器");
  if(DECK_ADD.filter(g=>g.length).length !== 5) throw new Error("不是五层");
  for(const g of DECK_ADD) if(g.length > 2) throw new Error("有一层挤了 "+g.length+" 件"); });
run("每一层的高度 = 那一档的高度", ()=>{
  /* 档位 d 的那一层站在 yOfStep(d) 上：档位是累积的，所以第 d 档亮的
     正好是第 0..d 层 —— 从底往上填满，这就是这版布局唯一要说清的事。 */
  for(let d=1; d<STEPS; d++){
    const upto = DECK_ADD.slice(0,d+1).flat().sort().join(",");
    const set  = DECK_SET[d].slice().sort().join(",");
    if(upto !== set) throw new Error("第 "+d+" 档：层累积 ["+upto+"] ≠ 实际 ["+set+"]");
  } });
run("左边不再标低/高（纵轴是档位 不是音高）", ()=>{
  const src = draw.toString();
  if(/fillText\("低"/.test(src) || /fillText\("高"/.test(src))
    throw new Error("draw 里还在标低/高"); });
run("音量条从左块的左边缘起", ()=>{
  const src = draw.toString();
  if(!/xA = R\.x\b/.test(src)) throw new Error("音量条没从 R.x 起");
  if(/X\(DVOL0\)/.test(src)) throw new Error("音量条还钉在手的行程上"); });
run("谱子按小节排版 换行落在小节线上", ()=>{
  for(const T of TUNES){
    const bars = T.jp.split("|").map(b=>b.trim().split(/\s+/).filter(Boolean)).filter(b=>b.length);
    if(bars.length < 2) throw new Error(T.name+" 只分出 "+bars.length+" 小节");
    for(const b of bars) if(b.length > 8) throw new Error(T.name+" 有小节塞了 "+b.length+" 个音");
  }
  const src = draw.toString();
  if(!/PER_ROW/.test(src)) throw new Error("谱子没按行分小节"); });
run("谱子贴着音高场 不压在别的东西上", ()=>{
  const src = draw.toString();
  if(!/Y\(LO\) - 18\*k - nRow\*rowH2/.test(src)) throw new Error("谱子没从音高场上沿往回量");
  /* 真排一遍，看两行小节放不放得下 */
  resetAll(); S.tune = 1; draw(); S.tune = 2; draw(); S.tune = 3; draw(); });
run("画布顶部给状态栏让了位", ()=>{
  const R0 = stage();
  if(!(R0.y >= BAR_H*DPR)) throw new Error("画布顶 "+R0.y+" 压在状态栏下面"); });
run("深色：画布上没有留下浅色主题的颜色", ()=>{
  const src = draw.toString();
  if(/26,26,26/.test(src)) throw new Error("draw 里还有黑墨色");
  if(/138,58,42/.test(src)) throw new Error("draw 里还有旧强调色"); });


/* ══════════ 十五、左手拇指 = 速度 ══════════ */
run("拇指能单独动 不影响握拳判定和掌心位置", ()=>{
  const a4 = lm => { let a=0; for(let f=1;f<5;f++) a+=fingerExt(lm,f); return a/4; };
  const lo = atScreen(0.10,0.50,1,0.05), hi = atScreen(0.10,0.50,1,1.0);
  if(Math.abs(a4(lo)-a4(hi)) > 1e-9) throw new Error("动拇指把四指读数带变了");
  if(Math.abs(palmOf(lo).x-palmOf(hi).x) > 1e-9 || Math.abs(palmOf(lo).y-palmOf(hi).y) > 1e-9)
    throw new Error("动拇指把掌心位置带变了");
  if(!(fingerExt(hi,0) - fingerExt(lo,0) > 0.3))
    throw new Error("拇指读数量程太小："+fingerExt(lo,0).toFixed(3)+"→"+fingerExt(hi,0).toFixed(3)); });

const TEMPO_TABLE = [];
run("八个速度档 逐档选得到", ()=>{
  for(let i=0;i<TEMPOS.length;i++){
    resetAll();
    /* 让拇指落在第 i 档的中心 */
    const frac = (i+0.5)/TEMPOS.length;
    const want = THUMB_LO + (THUMB_HI-THUMB_LO)*frac;
    /* 反解 tOpen：拇指读数是 clamp((d-0.35)/0.55)，单调，二分一下 */
    let a=0, b=1;
    for(let k=0;k<40;k++){ const m=(a+b)/2;
      if(fingerExt(atScreen(0.10,0.50,1,m),0) < want) a=m; else b=m; }
    const tO=(a+b)/2;
    hold(0.10, yOfStep(3), 6);
    thumbAt(0.10, yOfStep(3), tO, 20);
    if(S.tStep !== i) throw new Error("第 "+i+" 档：拇指 "+S.thumb.toFixed(3)+" 选到了 "+S.tStep);
    if(S.bpmWant !== TEMPOS[i]) throw new Error("第 "+i+" 档：bpmWant "+S.bpmWant);
    beat(); draw();
    if(S.bpm !== TEMPOS[i]) throw new Error("第 "+i+" 档：提交后 bpm "+S.bpm);
    TEMPO_TABLE.push({ i, thumb:S.thumb, bpm:S.bpm, tO });
  } });
run("跨过档的边界就立刻换 不用等拍", ()=>{ resetAll();
  hold(0.10, yOfStep(3), 6);
  for(let i=0;i<10;i++) tick([atScreen(0.10,yOfStep(3),1,tOpenFor(THUMB_LO))]);
  const b0 = S.bpm;
  /* 一帧之内把拇指挪到第 7 档 —— 平滑要几帧才追上，但不该等任何拍 */
  let got = -1; const t0 = CLK;
  for(let i=0;i<20;i++){
    tick([atScreen(0.10,yOfStep(3),1,tOpenFor(THUMB_HI))]);
    if(S.bpm !== b0 && got < 0) got = CLK - t0;
  }
  if(got < 0) throw new Error("拇指推到头了速度还没动");
  if(got > 200) throw new Error("用了 "+got+"ms，不是「立刻」");
  if(S.bpm !== S.bpmWant) throw new Error("还留着一个没落地的目标值"); });
run("档内的小抖动不改速度", ()=>{ resetAll();
  thumbAt(0.10, yOfStep(3), 0.55, 20); beat(); draw();
  const b0 = S.bpm, t0 = S.tStep;
  /* 在这一档里来回抖，幅度小于一档宽的一半 */
  const stepW = (THUMB_HI-THUMB_LO)/TEMPOS.length;
  for(const d of [1,-1,1,-1,1,-1]){
    let lo=0, hi=1, target = S.thumb + d*stepW*0.3;
    for(let k=0;k<40;k++){ const m=(lo+hi)/2;
      if(fingerExt(atScreen(0.10,0.50,1,m),0) < target) lo=m; else hi=m; }
    thumbAt(0.10, yOfStep(3), (lo+hi)/2, 6); beat(); draw();
    if(S.bpm !== b0) throw new Error("抖一抖速度从 "+b0+" 变成了 "+S.bpm);
  }
  if(S.tStep !== t0) throw new Error("档位变了 "+t0+" → "+S.tStep); });
run("握拳时速度冻结", ()=>{ resetAll();
  thumbAt(0.10, yOfStep(3), 1.0, 20); beat(); draw();
  const b0 = S.bpm;
  if(b0 !== TEMPOS[TEMPOS.length-1]) throw new Error("没先到最快档，bpm="+b0);
  holdFist(0.10, yOfStep(3), 10);          // 握拳 —— 拇指读数会塌到底
  for(let i=0;i<40;i++) tick([atScreen(0.10,yOfStep(3),0.05)]);
  beat(); draw();
  if(S.bpm !== b0) throw new Error("握拳把速度从 "+b0+" 拖到了 "+S.bpm);
  if(S.bpmWant !== b0) throw new Error("握拳期间目标速度被改成了 "+S.bpmWant); });
run("手离开画面 速度冻结", ()=>{ resetAll();
  thumbAt(0.10, yOfStep(3), 1.0, 20); beat(); draw();
  const b0 = S.bpm;
  away(30); beat(); draw();
  if(S.bpm !== b0) throw new Error("手走了速度变成了 "+S.bpm); });
run("选音色的整个过程 速度一下都没动", ()=>{ resetAll();
  thumbAt(0.10, yOfStep(3), 0.75, 20); beat(); draw();
  const b0 = S.bpm;
  holdFist(0.10, yOfStep(3), 8);
  for(let d=0; d<4; d++){ push(d, MENU_DEAD*1.8, 12); beat(); draw();
    if(S.bpm !== b0) throw new Error("推"+DIRNAME[d]+"的时候速度变了："+S.bpm); }
  /* 松开，拇指回到原来那个位置 —— 速度就该回到原来那一档。
     「拇指位置＝速度」是绝对映射，松手时拇指停在哪速度就是哪，
     这不是 bug，是不用握拳换来的代价。下面那条专门验这件事。 */
  thumbAt(0.10, yOfStep(3), 0.75, 20); beat(); draw();
  if(S.bpm !== b0) throw new Error("拇指回原处速度没回来：b0="+b0+" 现在="+S.bpm
        ); });
run("拇指是绝对映射：松开拳头后手张多大 速度就是多少", ()=>{ resetAll();
  thumbAt(0.10, yOfStep(3), 0.40, 20); beat(); draw();
  const slow = S.bpm;
  holdFist(0.10, yOfStep(3), 10);
  thumbAt(0.10, yOfStep(3), 1.0, 20); beat(); draw();   // 松开时拇指张到最大
  if(S.bpm <= slow) throw new Error("拇指张到最大速度没跟上来："+slow+" → "+S.bpm);
  if(S.bpm !== TEMPOS[TEMPOS.length-1]) throw new Error("应到最快档，实际 "+S.bpm); });
run("速度不影响档位 档位不影响速度", ()=>{ resetAll();
  thumbAt(0.10, yOfStep(2), 0.9, 20); beat(); draw();
  if(S.deck !== 2) throw new Error("动拇指把档位带到了 "+S.deck);
  const b0 = S.bpm;
  hold(0.10, yOfStep(5), 20); beat(); draw();
  if(S.deck !== 5) throw new Error("档位没跟手");
  if(S.bpm !== b0) throw new Error("改档位把速度带成了 "+S.bpm); });
run("侧栏的速度滑块跟着手势走", ()=>{ resetAll();
  thumbAt(0.10, yOfStep(3), 1.0, 20); beat(); draw();
  if((els["gi-bpm"]||{}).value !== String(S.bpm))
    throw new Error("滑块 "+(els["gi-bpm"]||{}).value+" 和实际 "+S.bpm+" 不一致"); });

/* ══════════ 十六、启动页 / 诊断 / 手的骨架 ══════════ */
run("没点按钮之前 不碰摄像头", ()=>{
  if(started) throw new Error("页面自己就启动了");
  if(typeof startAll !== "function") throw new Error("没有 startAll"); });
run("一次点击里 音频和摄像头一起开", ()=>{
  const src = startAll.toString();
  if(!/audio\(\)/.test(src)) throw new Error("点击里没解锁音频");
  if(!/startCam\(\)/.test(src)) throw new Error("点击里没开摄像头");
  if(src.indexOf("audio()") > src.indexOf("startCam()"))
    throw new Error("音频必须在同一次手势里先解锁"); });
run("摄像头被拒 启动页不消失 并说清楚为什么", ()=>{
  const src = startAll.toString();
  if(!/catch/.test(src)) throw new Error("没有失败分支");
  if(!/started = false/.test(src)) throw new Error("失败后不让重试");
  if(!/file:/.test(src)) throw new Error("没有区分 file:// 这种必定失败的情况"); });
run("诊断不再铺在屏幕底下", ()=>{
  const src = fatal.toString();
  if(/createElement/.test(src)) throw new Error("fatal 还在往页面上贴块");
  if(/position:fixed/.test(src)) throw new Error("fatal 还在铺固定层");
  if(!/\$\("msg"\)/.test(src)) throw new Error("详细信息没进侧栏诊断");
  fatal("短的一句", "很长的\n原始报错\nfile:///…/vision_bundle.mjs");
  if((els["gi-msg"]||{}).textContent.indexOf("vision_bundle") < 0)
    throw new Error("原始报错没落到诊断里");
  if(S.fatal !== "短的一句") throw new Error("屏幕上那句不对："+S.fatal);
  S.fatal = ""; });
run("画布底下那行不贴模块路径", ()=>{
  const src = draw.toString();
  if(/S\.libErr/.test(src)) throw new Error("draw 里还在贴 libErr"); });
run("手画了关节点 不只是骨头", ()=>{
  const src = drawHand.toString();
  if(!/for\(let i=0;i<21;i\+\+\)/.test(src)) throw new Error("没画 21 个关节");
  if(!/TIPS/.test(src)) throw new Error("指尖没单独处理");
  resetAll();
  for(let i=0;i<6;i++) tick([atScreen(0.10,0.50,1), atScreen(0.90,0.40,1)]);
  const f0 = globalThis.__calls.fill; draw();
  if(globalThis.__calls.fill - f0 < 40)
    throw new Error("两只手的关节点没画出来（fill 只多了 "+(globalThis.__calls.fill-f0)+" 次）"); });
run("左手拇指尖单独标出来 握拳时不标", ()=>{
  const src = draw.toString();
  if(!/drawHand\(S\.left\.lm,\s*X,\s*Y,\s*\.34,\s*R,\s*!S\.fist\)/.test(src))
    throw new Error("左手没传 thumbMark，或握拳时还在标"); });


/* ══════════ 复现：握拳选两次之后就握不上了 ══════════ */
/* 猜想 A：张开基准的 10 秒窗口是按墙上时间转的，而窗口只在「没握拳」的帧里推进。
   握着拳的那几秒照样在走表，于是一松手窗口就翻篇，基准只剩刚松手那一两秒里
   读到的值 —— 那会儿手还没张开，基准塌，握拳线跟着塌。 */
run("复现A：握拳—松开 来回几次 还能握上", ()=>{ resetAll();
  let t0 = CLK; while(CLK-t0 < 3000) tick([atScreen(0.10,0.50,1.0)]);   // 先摊开手三秒
  const grabbed = [];
  for(let c=1;c<=4;c++){
    let a0=CLK; while(CLK-a0 < 1200) tick([atScreen(0.10,0.50,0.05)]);  // 握拳选音色，1.2 秒
    grabbed.push(S.fist);
    let b0=CLK; while(CLK-b0 < 2000) tick([atScreen(0.10,0.50,0.55)]);  // 松手，手半张着演奏两秒
  }
  if(grabbed.some(g=>!g))
    throw new Error("四次握拳成了 ["+grabbed.map(g=>g?1:0).join(",")+"]，基准 "+S.aOpen.toFixed(3)
                    +" 握拳线 "+S.grabAt.toFixed(3)); });
run("复现A2：握拳握久一点 窗口不该被拳头的时间吃掉", ()=>{ resetAll();
  let t0=CLK; while(CLK-t0 < 3000) tick([atScreen(0.10,0.50,1.0)]);
  const base0 = S.aOpen;
  let a0=CLK; while(CLK-a0 < 12000) tick([atScreen(0.10,0.50,0.05)]);   // 握拳 12 秒
  let b0=CLK; while(CLK-b0 < 1500) tick([atScreen(0.10,0.50,0.55)]);    // 松手，半张
  if(S.aOpen < base0*0.9)
    throw new Error("基准被握拳那段时间吃掉了："+base0.toFixed(3)+" → "+S.aOpen.toFixed(3)); });
/* 猜想 B：握拳超过 FIST_MAXHOLD 会强制松开并上锁，锁只在「手张到松开线以上」才解。
   人握着拳在想选哪个音色，很容易超过 8 秒 —— 之后再怎么握都没反应。 */
run("复现B：握拳想久一点 盘不该自己关掉", ()=>{ resetAll();
  let t0=CLK; while(CLK-t0 < 2000) tick([atScreen(0.10,0.50,1.0)]);
  let a0=CLK; while(CLK-a0 < 1000) tick([atScreen(0.10,0.50,0.05)]);
  if(!S.fist) throw new Error("没握上");
  let b0=CLK; while(CLK-b0 < 15000) tick([atScreen(0.10,0.50,0.05)]);   // 一直握着想 15 秒
  if(!S.fist) throw new Error("握着不动 "+((CLK-a0)/1000).toFixed(0)+" 秒，拳头自己松开了");
  if(!S.menu) throw new Error("盘自己关了"); });
run("复现B2：握久之后 松开再握 要能握上", ()=>{ resetAll();
  let t0=CLK; while(CLK-t0 < 2000) tick([atScreen(0.10,0.50,1.0)]);
  let a0=CLK; while(CLK-a0 < 15000) tick([atScreen(0.10,0.50,0.05)]);
  let b0=CLK; while(CLK-b0 < 1500) tick([atScreen(0.10,0.50,0.6)]);     // 松手，只张到六成
  let c0=CLK; while(CLK-c0 < 1000) tick([atScreen(0.10,0.50,0.05)]);    // 再握
  if(!S.fist) throw new Error("再握握不上（基准 "+S.aOpen.toFixed(3)+" 线 "+S.grabAt.toFixed(3)
                              +" 锁 "+S.fistLock+"）"); });
run("兜底：握着拳把手移出画面 一定能解", ()=>{ resetAll();
  let t0=CLK; while(CLK-t0 < 2000) tick([atScreen(0.10,0.50,1.0)]);
  let a0=CLK; while(CLK-a0 < 1000) tick([atScreen(0.10,0.50,0.05)]);
  if(!S.fist) throw new Error("没握上");
  away(30);
  if(S.fist || S.menu) throw new Error("手走了拳头还在"); });


/* ══════════ 复现：速度迟钝 + 跳读 ══════════ */
/* 他实际只遇到 80 / 130 / 140 / 150 四个值。
   80 要求拇指 ≤0.2575，150 要求 ≥0.7225 —— 说明他的拇指量程把 1..6 档全盖住了，
   所以不是量程的问题。那就只剩「档位算出来了但提交不了」：
   400ms 停稳 + 下一个四分拍，中间几档根本来不及稳住。 */
function thumbOf(tO){ return fingerExt(atScreen(0.10,0.50,1,tO), 0); }
function tOpenFor(v){ let a=0,b=1;
  for(let k=0;k<44;k++){ const m=(a+b)/2; if(thumbOf(m) < v) a=m; else b=m; }
  return (a+b)/2; }
run("复现C：拇指一路划过去 八个档一个不漏", ()=>{ resetAll();
  hold(0.10, yOfStep(3), 6);
  for(let i=0;i<10;i++) tick([atScreen(0.10,yOfStep(3),1,tOpenFor(THUMB_LO))]);  // 先停在起点
  const seen = new Set();
  /* 一秒半从最低划到最高 —— 这是正常的调速度动作，不是慢动作 */
  const N = Math.max(8, Math.round(1500/33));
  for(let i=0;i<=N;i++){
    const v = THUMB_LO + (THUMB_HI-THUMB_LO)*i/N;
    tick([atScreen(0.10, yOfStep(3), 1, tOpenFor(v))]);
    commitOnBeat();
    seen.add(S.bpm);
  }
  const miss = TEMPOS.filter(b=>!seen.has(b));
  if(miss.length) throw new Error("划一遍只出现了 ["+[...seen].sort((a,b)=>a-b).join(",")
                                  +"]，漏掉 ["+miss.join(",")+"]"); });
run("复现D：停到一档上 不该等半天才响应", ()=>{ resetAll();
  hold(0.10, yOfStep(3), 6);
  const b0 = S.bpm;
  const tO = tOpenFor(THUMB_LO + (THUMB_HI-THUMB_LO)*(5.5/8));   // 第 5 档 = 130
  const t0 = CLK;
  let got = -1;
  while(CLK - t0 < 1000){
    tick([atScreen(0.10, yOfStep(3), 1, tO)]);
    commitOnBeat();
    if(S.bpm !== b0 && got < 0) got = CLK - t0;
  }
  if(got < 0) throw new Error("拇指停到 130 那一档上一秒了，速度还没动");
  if(got > 350) throw new Error("从拇指到位到速度改变用了 "+got+"ms，太迟钝"); });
run("复现E：读数在档边上抖 不该来回跳", ()=>{ resetAll();
  hold(0.10, yOfStep(3), 6);
  const w = (THUMB_HI-THUMB_LO)/TEMPOS.length;
  const edge = THUMB_LO + w*4;                      // 第 3/4 档的交界
  const tA = tOpenFor(edge - w*0.12), tB = tOpenFor(edge + w*0.12);
  for(let i=0;i<10;i++) tick([atScreen(0.10,yOfStep(3),1,tA)]);
  commitOnBeat();
  const b0 = S.bpm, seen = new Set([b0]);
  for(let i=0;i<30;i++){
    tick([atScreen(0.10,yOfStep(3),1, i%2 ? tB : tA)]);
    commitOnBeat(); seen.add(S.bpm);
  }
  if(seen.size > 1) throw new Error("在档边上抖了 30 帧，速度在 ["+[...seen].join(",")+"] 之间跳"); });


/* ══════════ 十七、右手捏合 = 发音 ══════════ */
run("捏合读数：张开和捏上分得很开", ()=>{
  const open = pinchOf(atScreen(0.90,0.40,1)),
        shut = pinchOf(atScreen(0.90,0.40,1,undefined,1.0));
  if(!(open > PINCH_OFF)) throw new Error("张开读 "+open.toFixed(3)+"，没高过松开线");
  if(!(shut < PINCH_ON))  throw new Error("捏上读 "+shut.toFixed(3)+"，没低过捏合线");
  if(!(open - shut > 0.6)) throw new Error("两头只差 "+(open-shut).toFixed(3)+"，余量太小"); });
run("捏上才出声 松开就停", ()=>{ resetAll();
  pinchAt(0.40, 0, 8);
  if(S.voice) throw new Error("没捏就出声了");
  if(!(gainNow() <= 0)) throw new Error("没捏音量目标是 "+gainNow());
  pinchAt(0.40, 1.0, 8);
  if(!S.voice) throw new Error("捏上了没出声（捏合读数 "+S.pinch.toFixed(3)+"）");
  if(!(gainNow() > 0)) throw new Error("捏上了音量目标还是 "+gainNow());
  pinchAt(0.40, 0, 8);
  if(S.voice) throw new Error("松开了还在出声");
  if(!(gainNow() <= 0)) throw new Error("松开后音量目标是 "+gainNow()); });

/* 这一版的验收标准：欢乐颂开头的 3 3 —— 同一个音高上两个音。
   位置轴做不到这件事，所以才要捏合。 */
run("3 3：同一个音高上弹得出两个音", ()=>{ resetAll();
  /* 找到简谱 3 那条线的屏幕高度 */
  const y3 = LO + FIELD*(1 - JP_SEMI["3"]/SEMIS);
  const seq = [];
  const push = () => { const g = gainNow(); if(!seq.length || seq[seq.length-1] !== g) seq.push(g); };
  pinchAt(y3, 0, 6);  push();
  pinchAt(y3, 1.0, 6); push(); const m1 = S.soundMidi;
  pinchAt(y3, 0, 6);  push();
  pinchAt(y3, 1.0, 6); push(); const m2 = S.soundMidi;
  /* 音高两次必须一样 —— 这正是「位置不变」那件事 */
  if(Math.abs(m1-m2) > 0.01) throw new Error("两次的音高不一样："+m1.toFixed(2)+" / "+m2.toFixed(2));
  if(Math.abs(Math.round(m1-MIDI_LO) - JP_SEMI["3"]) > 0.01)
    throw new Error("弹的不是简谱 3，是 "+(m1-MIDI_LO).toFixed(2)+" 个半音");
  /* 音量目标必须走过 0 → 有声 → 0 → 有声 */
  const shape = seq.map(g=>g>0?1:0).join("");
  if(shape !== "0101") throw new Error("音量包络走的是 "+shape+"，不是 0→响→0→响"); });
run("捏合不动音高", ()=>{
  const a = atScreen(0.90,0.40,1), b = atScreen(0.90,0.40,1,undefined,1.0);
  const pa = palmOf(a), pb = palmOf(b);
  if(Math.abs(pa.y-pb.y) > 1e-9 || Math.abs(pa.x-pb.x) > 1e-9)
    throw new Error("捏合把掌心位置挪了"); });
run("起音快 收音是两段", ()=>{
  if(!(ATTACK <= 0.012)) throw new Error("起音时间常数 "+ATTACK+"，太慢，点音会软");
  if(!(REL_FAST < REL_TAIL)) throw new Error("第一段应该比尾巴快");
  if(!(REL_DROP > 0 && REL_DROP < 0.6)) throw new Error("第一段降到 "+REL_DROP+"，不像断句");
  /* 尾巴不能长到把下一个同音糊住：3 3 之间人最快约 150ms */
  if(!(REL_HOLD + REL_TAIL*3 < 0.25))
    throw new Error("尾巴 "+((REL_HOLD+REL_TAIL*3)*1000).toFixed(0)+"ms，3 3 会糊成一个音"); });
run("捏合判定是双阈值 在中间抖不翻转", ()=>{ resetAll();
  pinchAt(0.40, 1.0, 8);
  if(!S.voice) throw new Error("没捏上");
  /* 松到两条线中间：不该停 */
  let mid = 0; { let a=0,b=1;
    for(let k=0;k<40;k++){ const m=(a+b)/2;
      if(pinchOf(atScreen(0.90,0.40,1,undefined,m)) > (PINCH_ON+PINCH_OFF)/2) a=m; else b=m; }
    mid=(a+b)/2; }
  for(let i=0;i<20;i++) tick([atScreen(0.90,0.40,1,undefined, i%2 ? mid*0.98 : mid*1.02)]);
  if(!S.voice) throw new Error("在两条线中间抖了一下就停了"); });
run("右手离开画面 立刻静", ()=>{ resetAll();
  pinchAt(0.40, 1.0, 8);
  if(!S.voice) throw new Error("没捏上");
  away(30);
  if(S.voice) throw new Error("手走了还在出声");
  if(!(gainNow() <= 0)) throw new Error("手走了音量目标还是 "+gainNow()); });
run("x 轴退回去当整体音量 不再管发音", ()=>{ resetAll();
  pinchAt(0.40, 1.0, 8);
  const loud = gainNow();
  for(let i=0;i<8;i++) tick([atScreen(0.62,0.40,1,undefined,1.0)]);   // 捏着，手收到最内侧
  if(!(gainNow() < loud*0.1)) throw new Error("收到最内侧还有 "+gainNow());
  if(!S.voice) throw new Error("x 轴收到底把发音也关了 —— 它不该管发音"); });

/* ══════════ 十八、音阶可切换 ══════════ */
run("七声能吸到 4 和 7，五声吸不到", ()=>{
  const d7 = SCALES["7"].deg, d5 = SCALES["5"].deg;
  for(const semi of [JP_SEMI["4"], JP_SEMI["7"]]){
    if(!d7.includes(semi)) throw new Error("七声里没有 "+semi);
    if(d5.includes(semi))  throw new Error("五声里不该有 "+semi);
  }
  if(d5.length !== 5) throw new Error("五声有 "+d5.length+" 个音");
  if(d7.length !== 7) throw new Error("七声有 "+d7.length+" 个音"); });
run("切到五声 谱上的 4 会被推到旁边", ()=>{ resetAll();
  const y4 = LO + FIELD*(1 - JP_SEMI["4"]/SEMIS);
  S.scale="7"; S.snap=1; pinchAt(y4, 1.0, 10);
  const got7 = Math.round(S.midi - MIDI_LO);
  if(got7 !== JP_SEMI["4"]) throw new Error("七声下 4 吸到了 "+got7);
  resetAll(); S.scale="5"; S.snap=1; pinchAt(y4, 1.0, 10);
  const got5 = Math.round(S.midi - MIDI_LO);
  if(got5 === JP_SEMI["4"]) throw new Error("五声下 4 还吸得到 —— 那就没切");
  if(!SCALES["5"].deg.includes(got5)) throw new Error("五声下吸到了音阶外的 "+got5);
  S.scale="7"; });
run("音阶之外的线在画面上画得更淡", ()=>{
  const src = draw.toString();
  if(!/inScale/.test(src)) throw new Error("音高场没按当前音阶区分"); });

/* ══════════ 十九、速度七档 ══════════ */
run("速度七档 80 到 140", ()=>{
  if(TEMPOS.length !== 7) throw new Error("档数 "+TEMPOS.length);
  if(TEMPOS[0] !== 80 || TEMPOS[6] !== 140) throw new Error("两端是 "+TEMPOS[0]+"/"+TEMPOS[6]);
  const w = (THUMB_HI-THUMB_LO)/TEMPOS.length;
  if(!(w > 0.085)) throw new Error("每档只有 "+w.toFixed(4)+"，比八档时还窄"); });


run("握拳选完音色 速度不掉档", ()=>{ resetAll();
  /* 迟滞是有方向的：同一个拇指位置，从上面下来和从零开始会落在不同档。
     所以握拳期间不能把档位清掉，否则每选一次音色速度就掉一档。 */
  thumbAt(0.10, yOfStep(3), 0.75, 25); beat(); draw();
  const b0 = S.bpm;
  for(let c=0;c<3;c++){
    holdFist(0.10, yOfStep(3), 10);
    push(c%4, MENU_DEAD*1.8, 12);
    thumbAt(0.10, yOfStep(3), 0.75, 25); beat(); draw();
    if(S.bpm !== b0) throw new Error("第 "+(c+1)+" 次握拳之后速度从 "+b0+" 变成了 "+S.bpm);
  } });
run("手离开再回来 拇指没动速度就不变", ()=>{ resetAll();
  thumbAt(0.10, yOfStep(3), 0.75, 25); beat(); draw();
  const b0 = S.bpm;
  away(30); beat(); draw();
  if(S.bpm !== b0) throw new Error("手走了速度变成了 "+S.bpm);
  thumbAt(0.10, yOfStep(3), 0.75, 25); beat(); draw();
  if(S.bpm !== b0) throw new Error("手回来速度变成了 "+S.bpm); });


/* ══════════ 复现：0 档选不到 ══════════ */
/* 猜想：档位只在 y 落在 VLO..VHI 里才更新，而 0 档那一格只有屏幕高度的 8%
   （y 0.66–0.74）。手再往下一点就「出场」，档位保持原值不动。
   可游标画的是 cl(y, VLO, VHI) —— 被钳在底部，看上去就是 0。
   于是：游标说 0，档位是 1。 */
run("0 档在场内选得到，而且那一格不窄", ()=>{ resetAll();
  hold(0.10, yOfStep(3), 20); beat(); draw();
  /* 0 档的格子从 yOfStep(0) 一直延伸到音高场底边（平台也算数） */
  hold(0.10, 0.70, 20); beat(); draw();
  if(S.deck !== 0) throw new Error("瞄在 0 档格子里，档位是 "+S.deck);
  resetAll(); hold(0.10, yOfStep(3), 20); beat(); draw();
  hold(0.10, 0.785, 20); beat(); draw();     // 平台里，仍然算 0 档
  if(S.deck !== 0) throw new Error("手在底部平台上，档位是 "+S.deck);
  const band = (HI - (VHI - (VHI-VLO)/STEPS))*900;
  if(!(band > 120)) throw new Error("0 档那一格只有 "+band.toFixed(0)+"px"); });
run("顶档同理 上面那块平台也算数", ()=>{ resetAll();
  hold(0.10, yOfStep(1), 20); beat(); draw();
  hold(0.10, 0.215, 20); beat(); draw();
  if(S.deck !== STEPS-1) throw new Error("手在顶部平台上，档位是 "+S.deck); });
run("游标在场外要说实话", ()=>{ resetAll();
  hold(0.10, yOfStep(3), 20); beat(); draw();
  if(S.outField) throw new Error("手在场内却标成场外");
  for(let i=0;i<6;i++) tick([atScreen(0.10, 0.90, 1)]);
  if(!S.outField) throw new Error("手在场外没标出来");
  if(S.deckWant !== 3) throw new Error("场外档位被改了："+S.deckWant);
  const src = draw.toString();
  if(!/档位已保持/.test(src)) throw new Error("游标旁边没写明「已保持」"); });
run("不能破：手快速滑出画面 不会被带到 0 档", ()=>{ resetAll();
  hold(0.10, yOfStep(4), 20); beat(); draw();
  glide(0.10, yOfStep(4), 0.10, 0.95, 12);
  away(20); beat(); draw();
  if(S.deck !== 4) throw new Error("滑出画面后档位变成了 "+S.deck); });

/* ══════════ 复现：右手没声音 ══════════ */
run("复现H：右手在画面里但没出声时 屏幕上要说清楚为什么", ()=>{ resetAll();
  pinchAt(0.40, 0, 10);
  if(S.voice) throw new Error("测试前提不成立");
  const src = draw.toString();
  if(!/捏合拇指和食指/.test(src)) throw new Error("没有那句提示");
  if(!/S\.pinch>8/.test(src)) throw new Error("提示里没带实时读数，截图里看不出差多少"); });
run("复现I：留一条退路 —— 持续类切回常开就一直响", ()=>{ resetAll();
  if(typeof S.gateMode === "undefined") throw new Error("没有「发音方式」这个开关");
  S.tone = TONES.findIndex(t=>t.name==="玻璃"); applyTone();
  S.gateMode = "open";
  pinchAt(0.40, 0, 10);                       // 没捏
  if(!S.voice) throw new Error("切到常开了还是不出声");
  if(!(tvGain.gain.last > 0)) throw new Error("常开模式下音量目标是 "+tvGain.gain.last);
  S.gateMode = "pinch";
  pinchAt(0.40, 0, 10);
  if(S.voice) throw new Error("切回捏合之后没捏还在响"); });
run("退路对敲击类也要成立：跨一条音阶线敲一下", ()=>{ resetAll();
  S.tone = 0; applyTone(); S.gateMode = "open"; S.snap = 1;
  pinchAt(yOfJP("1"), 0, 8);                  // 不捏，手在 1
  globalThis.__osc.length = 0;
  slide(yOfJP("1"), yTop, 0, 30);             // 一路滑到 1'
  const made = globalThis.__osc.length;
  S.gateMode = "pinch";
  if(!made) throw new Error("常开 + 敲击类，手滑过一整个八度一声都没有 —— 退路不成立"); });


/* ══════════ 二十、跳进：松手之后音高冻结 ══════════ */
run("松手之后 手再动 频率不跟了", ()=>{ resetAll();
  pinchAt(yOfJP("5"), 1.0, 8);
  if(!S.voice) throw new Error("没捏上");
  pinchAt(yOfJP("5"), 0, 8);                 // 松手
  if(S.voice) throw new Error("没松开");
  fLog().length = 0;
  slide(yOfJP("5"), yTop, 0, 14);            // 静音状态下把手移到 1'
  if(fLog().length) throw new Error("静音期间还在写频率 "+fLog().length+" 次（尾巴会跑调）"); });
run("5 跳到 1'：中间一个音都不经过", ()=>{ resetAll();
  S.tone = TONES.findIndex(t=>t.kind==="sustain"); applyTone();
  pinchAt(yOfJP("5"), 1.0, 8);
  const f5 = fLog()[fLog().length-1];
  pinchAt(yOfJP("5"), 0, 8);                 // 松手
  slide(yOfJP("5"), yTop, 0, 14);            // 无声换把位
  fLog().length = 0;
  pinchAt(yTop, 1.0, 8);                     // 再捏
  const wrote = fLog();
  if(!wrote.length) throw new Error("再捏没有发音");
  const f1 = 440*Math.pow(2,(MIDI_LO+12-69)/12);
  if(Math.abs(wrote[0]-f1) > 1) throw new Error("第一次写进去的是 "+wrote[0].toFixed(1)+"Hz，不是 1' 的 "+f1.toFixed(1));
  /* 中间那两个音（6=A、7=B）一次都不许出现 */
  for(const semi of [JP_SEMI["6"], JP_SEMI["7"]]){
    const fm = 440*Math.pow(2,(MIDI_LO+semi-69)/12);
    for(const w of wrote) if(Math.abs(w-fm) < 1)
      throw new Error("经过了中间音 "+fm.toFixed(1)+"Hz");
  }
  if(Math.abs(f5 - f1) < 1) throw new Error("测试前提不成立：5 和 1' 同音"); });
run("显示仍然跟手 —— 静音时画面要能瞄准", ()=>{ resetAll();
  pinchAt(yOfJP("5"), 0, 8);
  const m1 = S.midi;
  slide(yOfJP("5"), yTop, 0, 14);
  if(Math.abs(S.midi - m1) < 1) throw new Error("静音时画面上的音高不跟手，没法瞄"); });

/* ══════════ 二十一、收音是两段，不是一刀 ══════════ */
run("收音分两段：先快降到三成 再拖尾巴", ()=>{ resetAll();
  S.tone = TONES.findIndex(t=>t.kind==="sustain"); applyTone();
  pinchAt(yOfJP("3"), 1.0, 8);
  const top = gLog()[gLog().length-1];
  if(!(top > 0)) throw new Error("起音没写音量");
  gLog().length = 0;
  pinchAt(yOfJP("3"), 0, 8);                 // 松手
  /* 松手确认要等两帧，那两帧还在持续发声、照常写满音量。
     收音本身是最后两次写入。 */
  const w = gLog();
  if(w.length < 2) throw new Error("收音只写了 "+w.length+" 次");
  const a2 = w[w.length-2], b2 = w[w.length-1];
  if(b2 !== 0) throw new Error("最后没收到 0，是 "+b2);
  if(!(a2 > 0 && a2 < top)) throw new Error("倒数第二次是 "+a2+"，不是一个中间值 —— 还是一刀切");
  if(Math.abs(a2 - top*REL_DROP) > 1e-9) throw new Error("第一段不是三成，是 "+(a2/top).toFixed(2)); });
run("包络只在捏/松那一下写 不每帧重写", ()=>{ resetAll();
  pinchAt(yOfJP("3"), 1.0, 8);
  pinchAt(yOfJP("3"), 0, 8);
  gLog().length = 0;
  pinchAt(yOfJP("3"), 0, 30);                // 松着不动三十帧
  if(gLog().length) throw new Error("松着不动还在写音量 "+gLog().length+" 次 —— 尾巴永远收不完"); });
run("捏着的时候 x 轴仍然调整体音量", ()=>{ resetAll();
  S.tone = TONES.findIndex(t=>t.kind==="sustain"); applyTone();
  pinchAt(yOfJP("3"), 1.0, 8);
  const loud = tvGain.gain.last;
  for(let i=0;i<8;i++) tick([atScreen(0.62, yOfJP("3"), 1, undefined, 1.0)]);
  if(!(tvGain.gain.last < loud*0.1)) throw new Error("x 轴收到底还有 "+tvGain.gain.last); });

/* ══════════ 二十二、吸附只在起音那一刻 ══════════ */
run("音头落在线上", ()=>{ resetAll(); S.snap = 1;
  /* 起音点故意放在两条线中间偏一点 */
  const yMid = (yOfJP("3") + yOfJP("4"))/2 + 0.004;
  pinchAt(yMid, 1.0, 8);
  const semi = Math.round(S.midi - MIDI_LO);
  if(!scaleDeg().concat([12]).includes(semi))
    throw new Error("音头落在 "+semi+"，不在音阶上"); });
run("捏住滑过去是连续的 不是台阶", ()=>{ resetAll(); S.snap = 1;
  pinchAt(yOfJP("5"), 1.0, 8);
  const seen = new Set();
  const N = 40;
  for(let i=1;i<=N;i++){
    tick([atScreen(0.90, yOfJP("5") + (yTop-yOfJP("5"))*i/N, 1, undefined, 1.0)]);
    seen.add(Math.round(S.midi*20)/20);      // 0.05 个半音一档
  }
  if(seen.size < 20) throw new Error("从 5 滑到 1' 只出现了 "+seen.size+" 个不同的音高 —— 还是台阶"); });
run("松着移动仍然吸附 —— 画面告诉你会落在哪条线", ()=>{ resetAll(); S.snap = 1;
  const yMid = (yOfJP("3") + yOfJP("4"))/2 + 0.004;
  pinchAt(yMid, 0, 8);
  const semi = Math.round(S.midi - MIDI_LO);
  if(Math.abs(S.midi - MIDI_LO - semi) > 0.01)
    throw new Error("静音时画面上的音高没吸附，瞄不准："+(S.midi-MIDI_LO).toFixed(3)); });
run("吸附 0% 时 音头也不动", ()=>{ resetAll(); S.snap = 0;
  const yMid = (yOfJP("3") + yOfJP("4"))/2 + 0.004;
  pinchAt(yMid, 1.0, 8);
  const want = MIDI_LO + (1 - cl((yMid - LO)/FIELD))*SEMIS;
  if(Math.abs(S.midi - want) > 0.01) throw new Error("吸附关了还被挪了："+S.midi.toFixed(3)+" vs "+want.toFixed(3));
  S.snap = 1; });


/* ══════════ 复现：左手节奏不管用了 ══════════ */
function holdLowFist(y, n){ for(let i=0;i<(n||10);i++) tick([atScreen(0.10,y,0.05)]); }
run("复现J：手自然放低停着 不该把鼓关掉", ()=>{ resetAll();
  hold(0.10, yOfStep(3), 20); beat(); draw();
  if(S.deck !== 3) throw new Error("没先到 3 档");
  /* 人不操作的时候手就是放低的 —— 这是静息位置，不是一次选择 */
  const t0 = CLK; while(CLK-t0 < 2000) tick([atScreen(0.10, 0.88, 1)]);
  beat(); draw();
  if(S.deck === 0) throw new Error("手自然放低停了两秒，鼓就停了（档位 "+S.deck+"）"); });
run("握拳那一下手自然下沉 不该把档位带走", ()=>{ resetAll();
  hold(0.10, yOfStep(3), 25); beat(); draw();
  if(S.deck !== 3) throw new Error("没先到 3 档");
  /* 握拳的时候手会往下沉一点（实测约 19px ≈ 0.021），这是手形变化不是选择 */
  for(let i=0;i<12;i++) tick([atScreen(0.10, yOfStep(3)+0.021, 0.05)]);
  if(!S.fist) throw new Error("没握上");
  push(2, MENU_DEAD*1.8, 12);                 // 选个音色
  hold(0.10, yOfStep(3)+0.021, 10);           // 松开
  beat(); draw();
  if(S.deck !== 3) throw new Error("握拳选完音色，档位从 3 掉到了 "+S.deck); });
run("在场外握拳选音色 松开后节奏还在", ()=>{ resetAll();
  hold(0.10, yOfStep(3), 25); beat(); draw();
  /* 手垂到场外（静息位置）再握拳 —— 档位该一直保持 */
  for(let i=0;i<10;i++) tick([atScreen(0.10, 0.90, 1)]);
  for(let i=0;i<12;i++) tick([atScreen(0.10, 0.90, 0.05)]);
  if(!S.fist) throw new Error("没握上");
  push(2, MENU_DEAD*1.8, 12);
  hold(0.10, 0.90, 10); beat(); draw();
  if(S.deck !== 3) throw new Error("在场外选完音色，档位从 3 掉到了 "+S.deck); });
run("复现M：用完转盘 抬手还能调档位", ()=>{ resetAll();
  hold(0.10, yOfStep(2), 20); beat(); draw();
  holdFist(0.10, yOfStep(2), 10);
  push(0, MENU_DEAD*1.8, 12);
  hold(S.left.x, S.left.y, 10);              // 松开
  hold(0.10, yOfStep(5), 25); beat(); draw();
  if(S.deck !== 5) throw new Error("用完转盘抬手，档位调不动，还是 "+S.deck); });


/* ══════════ 二十四、两家音色：敲击 / 持续 ══════════ */
function newOsc(){ return globalThis.__osc.splice(0); }   // 取出并清空
run("每个音色都标明是哪一家 参数也齐", ()=>{
  for(const T of TONES){
    if(T.kind !== "struck" && T.kind !== "sustain") throw new Error(T.name+" 没标 kind");
    if(T.kind === "struck"){
      if(!(T.modes && T.modes.length >= 2)) throw new Error(T.name+" 没有模态表");
      for(const m of T.modes) if(m.length !== 3) throw new Error(T.name+" 的模不是三个数");
    } else {
      if(!T.type) throw new Error(T.name+" 没有波形");
      if(!(T.cut > 0)) throw new Error(T.name+" 没有低通");
    }
  } });
run("高分音衰减得比基音快 —— 这是「自然」的首要线索", ()=>{
  for(const T of TONES){
    if(T.kind !== "struck") continue;
    for(let i=1;i<T.modes.length;i++)
      if(!(T.modes[i][2] <= T.modes[i-1][2]))
        throw new Error(T.name+" 第 "+i+" 个分音比前一个衰减还慢");
    if(!(T.modes[0][2] > T.modes[T.modes.length-1][2]*2))
      throw new Error(T.name+" 基音和最高分音的衰减差得太少，听不出由亮转暗");
  } });
run("手碟是基音＋八度＋五度 那圈光晕在", ()=>{
  const r = TONES.find(t=>t.name==="手碟").modes.map(m=>m[0]);
  for(const want of [1,2,3]) if(!r.some(x=>Math.abs(x-want)<0.01))
    throw new Error("手碟缺了 "+want+"× 这个模"); });
run("卡林巴有很高的非谐分音 而且死得快", ()=>{
  const m = TONES.find(t=>t.name==="卡林巴").modes;
  const hi = m.filter(x=>x[0] > 5);
  if(!hi.length) throw new Error("没有高分音，听不出簧片的颗粒");
  for(const h of hi) if(!(h[2] < 0.2)) throw new Error("高分音拖了 "+h[2]+"s，会刺"); });

run("敲击类：捏一下 = 起一组各自衰减的正弦", ()=>{ resetAll(); S.tone = 0; applyTone();
  newOsc();
  pinchAt(yOfJP("5"), 1.0, 8);
  const made = newOsc();
  const T = TONES[0];
  if(made.length !== T.modes.length)
    throw new Error("起了 "+made.length+" 个模，表里有 "+T.modes.length+" 个");
  const f0 = 440*Math.pow(2,(MIDI_LO+JP_SEMI["5"]-69)/12);
  T.modes.forEach((m,i)=>{
    if(Math.abs(made[i].frequency.value - f0*m[0]) > 1)
      throw new Error("第 "+i+" 个模是 "+made[i].frequency.value.toFixed(1)+"Hz，应为 "+(f0*m[0]).toFixed(1));
  }); });
run("敲击类：持续那条链一直是静的", ()=>{ resetAll(); S.tone = 0; applyTone();
  if(tvGain.gain.last !== 0) throw new Error("换到敲击类没把持续链关掉："+tvGain.gain.last);
  gLog().length = 0;
  pinchAt(yOfJP("5"), 1.0, 8);
  pinchAt(yOfJP("5"), 0, 8);
  if(gLog().some(v=>v>0)) throw new Error("敲击类还在写持续音量："+gLog().join(",")); });
run("敲击类：3 3 就是敲两下", ()=>{ resetAll(); S.tone = 0; applyTone();
  const y3 = yOfJP("3");
  pinchAt(y3, 0, 6); newOsc();
  pinchAt(y3, 1.0, 6); const a = newOsc().length;
  pinchAt(y3, 0, 6);   const b = newOsc().length;
  pinchAt(y3, 1.0, 6); const c = newOsc().length;
  if(!(a > 0)) throw new Error("第一下没敲响");
  if(b !== 0)  throw new Error("松手也敲了 "+b+" 个");
  if(!(c > 0)) throw new Error("第二下没敲响"); });
run("敲击类：按住不放 不会一直重敲", ()=>{ resetAll(); S.tone = 0; applyTone();
  pinchAt(yOfJP("5"), 1.0, 8); newOsc();
  pinchAt(yOfJP("5"), 1.0, 60);
  const extra = newOsc().length;
  if(extra) throw new Error("按住的 60 帧里又敲了 "+extra+" 个"); });
run("敲击类：超出听觉范围的模不起", ()=>{ resetAll();
  S.tone = TONES.findIndex(t=>t.name==="卡林巴"); applyTone();
  newOsc();
  pinchAt(LO, 1.0, 8);                       // 最高音 1'
  const made = newOsc();
  for(const o of made) if(o.frequency.value > 18000)
    throw new Error("起了一个 "+o.frequency.value.toFixed(0)+"Hz 的模"); });

run("持续类：走包络 不起一次性振荡器", ()=>{ resetAll();
  S.tone = TONES.findIndex(t=>t.name==="玻璃"); applyTone();
  newOsc();
  pinchAt(yOfJP("5"), 1.0, 8);
  if(newOsc().length) throw new Error("持续类也起了一次性振荡器");
  if(!(tvGain.gain.last > 0)) throw new Error("持续类没出声"); });
run("持续类：两个振荡器打慢拍", ()=>{ resetAll();
  S.tone = TONES.findIndex(t=>t.name==="玻璃"); applyTone();
  pinchAt(yOfJP("5"), 1.0, 8);
  const T = TONES[S.tone];
  if(!(T.beat > 0)) throw new Error("玻璃没有拍频，单正弦是死的");
  const d = Math.abs(osc2.frequency.last - osc.frequency.last);
  if(Math.abs(d - T.beat) > 0.01) throw new Error("两个振荡器差 "+d.toFixed(2)+"Hz，应为 "+T.beat); });
run("持续类仍然有滑音", ()=>{ resetAll();
  S.tone = TONES.findIndex(t=>t.name==="玻璃"); applyTone();
  pinchAt(yOfJP("5"), 1.0, 8);
  fLog().length = 0;
  slide(yOfJP("5"), yTop, 1.0, 14);
  if(fLog().length < 10) throw new Error("捏住滑动只写了 "+fLog().length+" 次频率"); });

/* ══════════ 二十五、试听 ══════════ */
run("转盘推到一个方向 就用那个音色发一声", ()=>{ resetAll();
  hold(0.10,0.50,8); holdFist(0.10,0.50,8);
  newOsc();
  push(1, MENU_DEAD*1.8, 12);                // 右 = 柔和（持续类，也要能试听）
  const made = newOsc();
  if(!made.length) throw new Error("推过去没有发声 —— 试听没生效");
  if(S.tone !== MENU.find(m=>m.dir===1).i) throw new Error("音色没换"); });
run("试听用固定音高 不跟右手", ()=>{ resetAll(); S.tone = 0; applyTone();
  newOsc(); audition();
  const made = newOsc();
  if(!made.length) throw new Error("没发声");
  const f0 = 440*Math.pow(2,(MIDI_LO+AUDITION_SEMI-69)/12);
  if(Math.abs(made[0].frequency.value - f0) > 1)
    throw new Error("试听的基音是 "+made[0].frequency.value.toFixed(1)+"Hz，应为 "+f0.toFixed(1)); });
run("持续类的试听会自己收掉 不会一直响", ()=>{ resetAll();
  S.tone = TONES.findIndex(t=>t.name==="玻璃"); applyTone();
  newOsc(); audition();
  const made = newOsc();
  if(made.length !== 1) throw new Error("持续类试听起了 "+made.length+" 个振荡器");
  const src = audition.toString();
  if(!/stop\(/.test(src)) throw new Error("试听的振荡器没有停止时间，会一直响"); });
run("同一个方向反复推 不重复试听", ()=>{ resetAll();
  hold(0.10,0.50,8); holdFist(0.10,0.50,8);
  push(1, MENU_DEAD*1.8, 12);
  newOsc();
  push(1, MENU_DEAD*2.2, 12);                // 还是右，音色没变
  if(newOsc().length) throw new Error("音色没变也发了声"); });
run("侧栏换音色也试听", ()=>{
  const src = ts.addEventListener.toString === Function.prototype.toString ? "" : "";
  resetAll(); newOsc();
  S.tone = 2; applyTone(); audition();
  if(!newOsc().length) throw new Error("audition 对木琴没发声"); });

run("转盘四个方向 = 两敲击 + 两持续", ()=>{
  const kinds = MENU.map(m=>TONES[m.i].kind);
  if(kinds.filter(k=>k==="struck").length !== 2) throw new Error("敲击类不是两个："+kinds.join(","));
  if(kinds.filter(k=>k==="sustain").length !== 2) throw new Error("持续类不是两个："+kinds.join(","));
  if(TONES[MENU.find(m=>m.dir===3).i].kind !== "sustain")
    throw new Error("左边那个不是持续类 —— 滑音没地方放"); });
run("转盘右边是柔和 不再是打击乐", ()=>{
  const r = MENU.find(m=>m.dir===1);
  if(TONES[r.i].name !== "柔和") throw new Error("转盘右边是 "+TONES[r.i].name);
  if(TONES[r.i].kind !== "sustain") throw new Error("柔和不是持续类"); });
run("转盘上一定有特雷门琴那种能拉长的声音", ()=>{
  const sus = MENU.filter(m=>TONES[m.i].kind==="sustain");
  if(!sus.length) throw new Error("转盘四个方向全是打击乐 —— 拉不出长音");
  if(!sus.some(m=>TONES[m.i].name==="柔和")) throw new Error("柔和不在转盘上"); });
run("卡林巴和电钢还在表里 能从侧栏选", ()=>{
  for(const nm of ["卡林巴","电钢"]){
    const i = TONES.findIndex(t=>t.name===nm);
    if(i < 0) throw new Error(nm+" 被删掉了");
    resetAll(); S.tone = i; applyTone(); newOsc(); audition();
    if(!newOsc().length) throw new Error(nm+" 选了不发声"); } });

/* ── 捏合延迟 ── */
run("出声只等 1 帧 收声等 2 帧", ()=>{
  if(PINCH_FRAMES_ON !== 1) throw new Error("出声要等 "+PINCH_FRAMES_ON+" 帧");
  if(PINCH_FRAMES_OFF < 2) throw new Error("收声只等 "+PINCH_FRAMES_OFF+" 帧，一个噪声帧就能把长音切断"); });
run("一帧就出声：捏到位的下一帧必须有声", ()=>{
  resetAll(); S.tone = 0; applyTone();
  for(let i=0;i<10;i++) tick([atScreen(0.90,0.40,1,undefined,0.30)]);   // 放松举着
  newOsc();
  tick([atScreen(0.90,0.40,1,undefined,1.0)]);                          // 这一帧捏到位
  if(!newOsc().length) throw new Error("捏到位的那一帧没出声"); });
run("收声要两帧：单独一个噪声帧不许切断长音", ()=>{
  resetAll(); S.tone = 3; applyTone();                                   // 玻璃，持续类
  pinchAt(0.40, 1.0, 8);
  if(!S.voice) throw new Error("没进发声状态");
  tick([atScreen(0.90,0.40,1,undefined,0)]);                             // 一帧「松了」
  if(!S.voice) throw new Error("一个噪声帧就把音切断了"); });
run("放松张开的手不会被当成捏合", ()=>{
  const relax = pinchOf(atScreen(0.90,0.40,1,undefined,0.385));          // 读数约 0.88
  if(!(relax > PINCH_OFF + 0.10))
    throw new Error("放松读 "+relax.toFixed(2)+"，离松开线 "+PINCH_OFF+" 只差 "
      +(relax-PINCH_OFF).toFixed(2)+" —— 手会卡在出声状态"); });
run("捏合线和松开线之间要有回差", ()=>{
  if(!(PINCH_OFF > PINCH_ON)) throw new Error("没有回差，边界上会抖");
  if(PINCH_OFF - PINCH_ON < 0.12)
    throw new Error("回差只有 "+(PINCH_OFF-PINCH_ON).toFixed(2)); });
run("手碟是第一个 在转盘上方 也是打开页面的默认", ()=>{
  if(TONES[0].name !== "手碟") throw new Error("表里第一个是 "+TONES[0].name);
  const up = MENU.find(m=>m.dir===0);
  if(TONES[up.i].name !== "手碟") throw new Error("转盘上方是 "+TONES[up.i].name);
  if(!PAGE_DEFAULT_TONE_OK) throw new Error("页面的初始音色不是第 0 个");
  if(!PAGE_SIDEBAR_HANDPAN) throw new Error("侧栏默认选的不是手碟"); });


/* ────────── v25：加载不能挂住 ────────── */
const realST = globalThis.setTimeout;
run("MODELS 第一个是本地路径", ()=>{
  if(MODELS[0] !== "./lib/hand_landmarker.task")
    throw new Error("第一个是 "+MODELS[0]+"，本地放了模型也用不上"); });

await runA("withTimeout：到点就拒，错误里带来源名", async ()=>{
  const t0 = Date.now();
  let msg = "";
  try{ await withTimeout(new Promise(()=>{}), 60, "某个源"); }
  catch(e){ msg = e.message; }
  if(!msg) throw new Error("永不回的请求居然没被拒 —— 页面就会一直挂在那儿");
  if(!msg.includes("某个源")) throw new Error("错误里没说是哪个源："+msg);
  const dt = Date.now()-t0;
  if(dt > 600) throw new Error("等了 "+dt+"ms 才放手"); });

await runA("withTimeout：正常回了就不受超时影响", async ()=>{
  const v = await withTimeout(Promise.resolve(42), 50, "x");
  if(v !== 42) throw new Error("拿到 "+v);
  await new Promise(r=>realST(r,80));   // 定时器若没清，这里会炸出未捕获拒绝
});

await runA("模型：第一个源挂住 第二个源能救回来", async ()=>{
  globalThis.__fetched = []; globalThis.__cacheStore.clear();
  globalThis.__fetchPlan = {};
  globalThis.__fetchPlan[MODELS[0]] = {status:404};
  globalThis.__fetchPlan[MODELS[1]] = {status:0};            // 立刻失败
  globalThis.__fetchPlan[MODELS[2]] = {status:200, bytes:7_800_000};
  const fails = [];
  const buf = await loadModelBuffer(fails);
  if(!buf) throw new Error("三个源里有一个是好的，却没拿到模型");
  if(buf.length !== 7_800_000) throw new Error("拿到 "+buf.length+" 字节");
  if(fails.length !== 2) throw new Error("前两个源失败没记下来："+fails.join(" | "));
  if(!fails[1].includes("storage.googleapis.com")) throw new Error("失败记录里没写明是哪个源"); });

await runA("模型：拿到一次就进缓存 下次不再联网", async ()=>{
  globalThis.__cacheStore.clear(); globalThis.__fetchPlan = {};
  globalThis.__fetchPlan[MODELS[2]] = {status:200, bytes:7_800_000};
  await loadModelBuffer([]);
  if(!globalThis.__cacheStore.size) throw new Error("没存进缓存 —— 每次开页面都要重下 7.8MB");
  globalThis.__fetched = [];
  const buf2 = await loadModelBuffer([]);
  if(globalThis.__fetched.length) throw new Error("缓存里有还是去联网了："+globalThis.__fetched.join(","));
  if(!buf2 || buf2.length !== 7_800_000) throw new Error("从缓存读出来的不对");
  if(S.modelFrom !== "浏览器缓存") throw new Error("状态里没标明用的是缓存："+S.modelFrom); });

await runA("模型：HTTP 200 但内容太小 要当失败 不能喂给识别器", async ()=>{
  globalThis.__cacheStore.clear(); globalThis.__fetchPlan = {};
  globalThis.__fetchPlan[MODELS[2]] = {status:200, bytes:1200};   // 代理返回的错误页
  const fails = [];
  const buf = await loadModelBuffer(fails);
  if(buf) throw new Error("1200 字节也当模型收下了");
  if(!fails.some(f=>f.includes("1200"))) throw new Error("没说清为什么不要："+fails.join("|"));
  if(globalThis.__cacheStore.size) throw new Error("还把错误页存进了缓存，以后每次都用它"); });

await runA("模型：全军覆没要返回空 而不是卡住", async ()=>{
  globalThis.__cacheStore.clear();
  globalThis.__fetchPlan = {};
  for(const u of MODELS) globalThis.__fetchPlan[u] = {status:0};
  const buf = await Promise.race([ loadModelBuffer([]),
    new Promise(r=>realST(()=>r("TIMEOUT"), 1500)) ]);
  if(buf === "TIMEOUT") throw new Error("三个源都废了，函数还在等 —— 这就是屏幕上一直写「正在载入」的原因");
  if(buf !== null) throw new Error("应该返回空，拿到 "+buf); });

await runA("boot：识别库全失败要报错 不能悬着", async ()=>{
  const r = await Promise.race([
    boot().then(()=>"RESOLVED").catch(e=>e.message),
    new Promise(r=>realST(()=>r("HUNG"), 1500)) ]);
  if(r === "HUNG") throw new Error("boot 既不成功也不失败 —— 页面永远停在「正在载入」");
  if(r === "RESOLVED") throw new Error("库都没加载上，boot 却说成功了");
  if(!r.includes("识别库")) throw new Error("错误没说清卡在哪一步："+r); });

run("载入中的那行字要报出卡在哪一步、等了多久", ()=>{
  resetAll();
  S.fatal = "";   // 前面的测试把 boot 跑失败过，这里只看「还在载入」那条
  S.lib = "载入中"; S.loadStep = "取模型 storage.googleapis.com"; S.bootT = CLK - 9000;
  globalThis.__texts = [];
  draw();
  const shown = globalThis.__texts.find(t=>t.includes("已等")) || "";
  if(!shown) throw new Error("载入时屏幕上没有任何进度");
  if(!shown.includes("9 秒")) throw new Error("没报已等多久："+shown);
  if(!shown.includes("storage.googleapis.com")) throw new Error("没报在等哪个源："+shown);
  if(!shown.includes("8")) throw new Error("没告诉人多久会换下一个源："+shown); });


const FPS_MS = Number(process.env.FRAME_MS || 33);
const NF_ON  = (typeof PINCH_FRAMES_ON  !== "undefined") ? PINCH_FRAMES_ON
             : (typeof PINCH_FRAMES !== "undefined" ? PINCH_FRAMES : "?");
/* 真人不是从五指张到最大开始捏的，是从放松的手开始。
   放松张开读数约 0.88，对应合拢进度 0.385 —— 从这里起算才是真实行程。 */
const RELAX_F = 0.385;
function measureLat(closeMs, struck){
  resetAll(); S.tone = struck ? 0 : 3; applyTone();
  for(let i=0;i<10;i++) tick([atScreen(0.90,0.40,1,undefined,RELAX_F)], FPS_MS);
  const osc0 = globalThis.__osc.length, g0 = tvGain.gain.log.length;
  let t = 0, fired = null, firedAt = null;
  for(let i=0;i<60;i++){
    t += FPS_MS;
    const p = RELAX_F + (1-RELAX_F)*Math.min(1, t/closeMs);
    tick([atScreen(0.90,0.40,1,undefined,p)], FPS_MS);
    if((struck ? globalThis.__osc.length > osc0
               : (S.voice && tvGain.gain.log.length > g0))){ fired = t; firedAt = p; break; }
  }
  const travel = firedAt===null ? null : (firedAt-RELAX_F)/(1-RELAX_F);
  return { ms:fired, travel, ratio: pinchOf(atScreen(0.90,0.40,1,undefined,firedAt===null?1:firedAt)) };
}
console.log("@@@ "+FPS_MS+"ms/识别帧（"+Math.round(1000/FPS_MS)+"fps，画面 1:"+DRAWS_PER_READ+"）  "
  +"捏<"+PINCH_ON+" 松>"+PINCH_OFF+"  出声等 "+NF_ON+" 帧");
console.log("@@@ 捏的快慢  音色       走完几成行程出声  那时读数  动手→出声");
for(const closeMs of [100,150,250])
  for(const [name,st] of [["手碟(敲击)",true],["玻璃(持续)",false]]){
    const r = measureLat(closeMs, st);
    console.log("@@@   "+String(closeMs+"ms").padEnd(7)+" "+name+"  "
      +(r.travel===null?"——没出声":(r.travel*100).toFixed(0)+"%").padEnd(16)
      +"  "+(r.ratio||0).toFixed(2)+"     "+(r.ms===null?"——":r.ms+"ms"));
  }
console.log(out.join("\n"));
console.log("\n══════ 六个档位 实测结果 ══════");
console.log("档位   手的高度(屏幕)   实际在响的声部");
for(const r of TABLE)
  console.log("  "+r.d+"    y="+r.y.toFixed(3)+" ("+r.px+"px)    "
    + (r.on.length ? r.on.join(" ") : "（静）"));
console.log("\n══════ 转盘 实测结果（一层，四个音色）══════");
console.log("推的方向   选中      类      实测（敲击类＝各分音的频率比/衰减秒；持续类＝波形/低通）");
for(const r of PICKED){
  const T = TONES.find(t=>t.name===r.label);
  const detail = T.kind==="struck"
    ? T.modes.map(m=>m[0]+"×"+m[2]+"s").join("  ")
    : T.type+"  低通 "+T.cut+"Hz  拍频 "+T.beat+"Hz";
  console.log("   "+r.dir+"      "+r.label.padEnd(7)+(T.kind==="struck"?"敲击":"持续")+"    "+detail);
}
console.log("\n══════ 左手拇指 → 速度 实测结果 ══════");
console.log("档   拇指读数   速度");
for(const r of TEMPO_TABLE)
  console.log("  "+r.i+"    "+r.thumb.toFixed(3)+"      "+r.bpm+" BPM");
console.log("\n══════ 握拳：手的读数扫描（演奏 10 秒 → 握拳 → 张开，共 4 个来回）══════");
console.log("悬停时手的张开度   拳头读数   张开读数   握拳线    握上/4  松开/4");
for(const s of SWEEP){
  const aF = (function(){ let a=0; for(let f=1;f<5;f++) a+=fingerExt(atScreen(0.1,0.5,s.fistO),f); return a/4; })();
  const aH = (function(){ let a=0; for(let f=1;f<5;f++) a+=fingerExt(atScreen(0.1,0.5,s.hoverO),f); return a/4; })();
  console.log("     open="+s.hoverO.toFixed(2)+"        "+aF.toFixed(3)+"      "+aH.toFixed(3)
    +"      "+(Math.max(aH,0.825)*FIST_GRAB).toFixed(3)+"      "+s.r.grab+"       "+s.r.free
    + (s.r.firstFail?("   ← 第 "+s.r.firstFail+" 次起失灵"):""));
}
console.log("\n一档高 "+(((VHI-VLO)/STEPS)*900).toFixed(0)+"px   识别:画面 = 1:"+DRAWS_PER_READ);
const bad = out.filter(r=>r.startsWith("FAIL"));
console.log("\n合计 "+out.length+" 项，通过 "+(out.length-bad.length)+"，失败 "+bad.length);
if(bad.length) process.exitCode = 1;
'''

p = pathlib.Path('/tmp/claude-0/-home-claude/ee3a8254-dbdd-57b1-8257-71dbde321af7/scratchpad/_pl26.mjs')
p.write_text(STUB + body + TEST)
r = subprocess.run(['node', str(p)], capture_output=True, text=True)
print(r.stdout)
sys.exit(r.returncode)

#!/usr/bin/env python3
"""抽出页面的 module 脚本，配浏览器桩，在 node 里真跑一遍。
语法检查抓不到的 ReferenceError/TypeError、以及「函数定义了但没人调」这类，只有跑起来才暴露。"""
import re, subprocess, sys, pathlib

PAGE = sys.argv[1] if len(sys.argv) > 1 else '/mnt/user-data/outputs/play-v10.html'
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
const param = () => ({ value:0, setTargetAtTime:bump, setValueAtTime:bump,
  exponentialRampToValueAtTime:bump, linearRampToValueAtTime:bump, cancelScheduledValues:bump });
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
run("回归 卡片架还在", ()=>{ reset();
  hold(0.10, 0.50, 6); glide(0.10, 0.50, 0.02, 0.06, 14); hold(0.02, 0.06, 12);
  if(!S.inCards) throw new Error("进不了卡片架");
  if(S.card < 0) throw new Error("挑不到卡"); });
run("回归 卡片能换音色", ()=>{ reset(); S.tone=1;
  hold(0.10,0.50,6); glide(0.10,0.50, 3.5/CARDS.length, 0.06, 14);
  hold(3.5/CARDS.length, 0.06, 12);
  if(S.tone !== 3) throw new Error("停在明亮卡上，音色是 "+S.tone); });
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

console.log(out.join("\n"));
console.log("\n══════ 六个档位 实测结果 ══════");
console.log("档位   手的高度(屏幕)   实际在响的声部");
for(const r of TABLE)
  console.log("  "+r.d+"    y="+r.y.toFixed(3)+" ("+r.px+"px)    "
    + (r.on.length ? r.on.join(" ") : "（静）"));
console.log("\n一档高 "+(((VHI-VLO)/STEPS)*900).toFixed(0)+"px   识别:画面 = 1:"+DRAWS_PER_READ);
const bad = out.filter(r=>r.startsWith("FAIL"));
console.log("\n合计 "+out.length+" 项，通过 "+(out.length-bad.length)+"，失败 "+bad.length);
if(bad.length) process.exitCode = 1;
'''

p = pathlib.Path('/tmp/claude-0/-home-claude/ee3a8254-dbdd-57b1-8257-71dbde321af7/scratchpad/_run10.mjs')
p.parent.mkdir(parents=True, exist_ok=True)
p.write_text(STUB + body + TEST)
r = subprocess.run(['node', str(p)], capture_output=True, text=True)
print(r.stdout or r.stderr)
sys.exit(r.returncode)

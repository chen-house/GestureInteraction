/* 风读竹（v1）。一句话：你种竹，风来读。
   · 手伸到哪、捏一下，就在那儿种一根竹。左右＝它在这一小节里响的时刻（16 格），高矮＝音高（五声，10 级）。
   · 每一小节有一阵风从左吹到右，吹到哪根，哪根响。响得越多的竹，叶越密。
   · 握拳＝砍掉手底下那根。手放下，林子照着你种的继续响。
   · 竹够 6 根，鸟来（在你留空的格子里应和）；够 12 根，啄木鸟来（敲拍子）。
   手只选「种在哪」，时间全归机器 —— 不需要准，也不需要卡拍子。 */
import * as THREE from "./three.module.min.js";

const cl = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (c, t, dt, tau) => c + (t - c) * (1 - Math.exp(-dt / Math.max(1e-4, tau)));
function rng(seed) { let a = (seed >>> 0) || 1; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const hex = h => new THREE.Color(h);
const $ = id => document.getElementById(id);

/* ── 定数 ── */
export const COLS = 16, LEVELS = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81];      // C 大调五声，C4–A5
const BPM = document.body.dataset.chapter === "peck" ? 120 : 96, STEP = 60 / BPM / 4, BAR = STEP * COLS;
const X0 = -5.2, DX = 10.4 / (COLS - 1), ROWZ = [0, -1.3, -2.6], ROWDX = [0, 0.2, -0.2], PER_COL = 3;
const hOf = L => 1.7 + L * 0.38, rOf = L => lerp(0.085, 0.042, L / 9), xOf = c => X0 + c * DX;
const BIRD_AT = 6, PECK_AT = 12;
const STICK = 0.03;
/* 镜头画面 → 屏幕：只用镜头中间一块来铺满屏幕。真手录像里，手从指点位置往小指一侧伸出画面的 24%、往手腕一侧伸出 30%，
   所以屏幕最靠边的目标（横向 11.5%、最低的竹节 75%）如果一比一对应，同侧那只手有一截在镜头外，识别就断。
   横向放大 1.64 倍、纵向放大 1.5 倍后，指任何一个目标时整只手都还在镜头里。 */
let CAM_GX = 1.64, CAM_GY = 1.5, CAM_OY = -0.21;
const HERE = new URL(".", import.meta.url).href.replace(/\/$/, "");      // 这个文件自己就在 lib/ 里
/* 舞台中间：五组竹，每组一个音高区，从左到右由粗到细＝由低到高（五声）。手在中间捏一下，请来一只鸟，落在离手最近的那组竹上；
   落得高（竹的上半）＝高八度。鸟按来的先后轮流唱，一拍一只：一丛只站一只，最多五只：四只以内一小节唱一轮，五只两小节唱一轮。 */
const ZN = [0, 1, 2, 3, 4].map(i => { const R = rng(4100 + i * 17), n = 6;        // 每个音高区是一丛竹，不是一两根
  return { x: 0, z: -12.0 - 1.2 * (1 - Math.abs(i - 2) / 2), r: 0.9, midi: [60, 62, 64, 67, 69][i],
    st: Array.from({ length: n }, (_, j) => { const a = j / n * 6.283 + R() * 0.8, d = j === 0 ? 0 : 0.35 + R() * 0.6; return { dx: Math.cos(a) * d, dz: Math.sin(a) * d * 0.8, kr: 1, r: lerp(0.13, 0.075, i / 4) * (0.7 + R() * 0.5), h: 9.4 + R() * 2.6 - i * 0.2, seed: R() }; }) }; });
const PERCH_Y = Array.from({ length: 33 }, (_, i) => 1.0 + 0.2 * i), MAXB = 5, REG = l => Math.floor(l / 11);   // 鸟落在手的高度上（每 0.2 米一档，等于连续）；竹的下、中、上三段＝低、中、高三个八度
const SF_VOX = [0.10, 0.185, 0.815, 0.90], SF_ZN = [0.275, 0.36, 0.445, 0.53, 0.615], SF_FROG = 0.715;   // 台柱和音高区在画面横向的位置（比例）
/* ── 第二章：啄木鸟。四根竹＝四件鼓（由粗到细：surdo 低鼓、caixa 军鼓、tamborim 小框鼓、chocalho 沙锤），
   每根 8 个竹节＝一小节的 8 个八分音符，从下往上。捏一下竹节：敲一下 → 敲两下（两个十六分）→ 取消。
   啄木鸟沿竹往上爬，爬到亮着的那一节就敲。采样是平面版用的同一批（VCSL，CC0），取不到就退回合成的敲竹声。 */
const VER = "v42";
const PIL_Y = Array.from({ length: 30 }, (_, i) => 1.2 + 0.2 * i), DENS = l => 1 + Math.min(2, Math.floor(l / 10)), DNAME = ["歇", "疏", "中", "密"], PILLAR_H = 12.5;
/* 每件鼓三套现成的型（16 格，一格一个十六分音符）：0 不敲，1 主音，2 副音。指挥只管让谁进、敲多密，不用一格一格摆。 */
/* 和声四站：宫 羽 徵 商。每一站只用五声里的音：根音给青蛙，三个音给风的长音。起一阵风走一站。 */
const STN = [{ name: "宫", root: 48, pad: [60, 64, 67], pcs: [0, 4, 7] }, { name: "羽", root: 45, pad: [57, 60, 64], pcs: [9, 0, 4] }, { name: "徵", root: 43, pad: [55, 62, 64], pcs: [7, 2, 4] }, { name: "商", root: 50, pad: [57, 62, 64], pcs: [2, 9, 4] }, { name: "角", root: 40, pad: [52, 57, 64], pcs: [4, 9, 7], fifth: 5 }];
const PENT = [0, 2, 4, 7, 9], DAY_LEN = 8, PH = 2, PHASE = ["晨", "午", "暮", "夜"];
/* 黄鹂的短句：每丛竹一种句型（在五声音阶上走几步 + 落在十六格里的哪几格），最后一个音落到这一站的和弦音上 */
const MOTIF = [{ d: [0, 2, 1, 0], r: [0, 4, 6, 8] }, { d: [0, 1, 2, 4], r: [0, 2, 4, 8] }, { d: [2, 1, 0, -1], r: [0, 3, 6, 10] }, { d: [0, -1, 0, 2], r: [2, 4, 8, 10] }, { d: [0, 2, 4, 2], r: [0, 6, 8, 12] }];
const FROG = [[1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], [1, 0, 0, 1, 0, 0, 2, 0, 1, 0, 0, 0, 1, 0, 2, 0]];      // 1 根音，2 上方五度
const SKY = 9, POND = 10, SKY_Y = 0.13, POND_Y = 0.73, POND_X = [0.27, 0.73];
const PATS = [
  [[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0], [2,0,0,0,1,0,0,0,2,0,0,0,1,0,0,0], [2,0,0,2,1,0,0,0,2,0,0,2,1,0,1,0]],                    // 低鼓 surdo
  [[1,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0], [1,0,1,0,1,1,0,1,0,1,0,1,0,1,1,0], [1,1,2,1,1,1,2,1,1,1,2,1,1,1,2,1]],                    // 小框鼓 tamborim
  [[1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0], [1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2], [1,2,2,1,1,2,2,1,1,2,2,1,1,2,2,1]],                    // 沙锤 chocalho
  [[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0], [1,0,0,1,0,0,1,0,0,0,1,0,1,0,0,0], [1,2,2,1,2,2,1,2,2,2,1,2,1,2,2,2]]                     // 军鼓 caixa
];
/* 配乐 A「林间演唱会」：全曲一个速度（120）、一个律动（直拍十六分），各件打击乐一个固定小型、各占一个音区，合起来把十六格填满；低音切分、连着响。
   晨午暮夜靠编配区分（谁在、多满、和弦怎么走、黄鹂唱哪一句），不换拍感。记法：x 主音，o 副音，. 空；每件三档，每档写两小节（单、双小节不同）。 */
const pat = str => [...str.replace(/ /g, "")].map(ch => ch === "x" ? 1 : ch === "o" ? 2 : 0);
const GROOVE = {
  pats: [                                                                                                   // 粗竹（低）、细竹（钟型）、小竹（沙沙）、中竹（2、4 拍）
    [["x... .... .... ....", "x... .... .... x..."], ["x... ..x. .... ....", "x... ..x. .... x..."], ["x... ..x. ..x. ....", "x..x ..x. ..x. x.x."]],
    [["x... x... x... x...", "x... x... x.x. x..."], ["x.x. xx.x .xx. x.x.", "x.xx .x.x x.x. xx.x"], ["x.xx xx.x xxx. x.xx", "x.xx .xxx x.xx xx.x"]],
    [["x... x... x... x...", "x... x... x... x.o."], ["x.oo x.oo x.oo x.oo", "x.oo x.oo x.oo x.oo"], ["xooo xooo xooo xooo", "xooo xooo xooo xoxo"]],
    [[".... x... .... x...", ".... x... .... x.x."], [".oo. xoo. .oo. x.x.", ".oo. xoo. .oo. x.xx"], [".oo. xoox .oo. xox.", ".oox xoo. .oox x.xx"]]
  ].map(v => v.map(l => l.map(pat))),
  vg: [[1.4, 1.1], [1.8, 1.3], [1.6, 0.9], [2.2, 1.2]],                                                      // 每件主音 / 副音的音量（对着参考曲的频段比例调的）
  clave: ["x... ..x. ..x. ....", ".... x... x... ...."].map(pat),                                           // 一声脆响，两小节一个长型（林子自己的）
  mont: pat("x..x ..x. ..x. x...")                                                                           // 手碟的切分和弦（林子自己的）
};
const HOOK = {                                                                                               // 黄鹂的主句：四小节一句，一小节一格，轮到谁谁唱那一格。数字＝五声音阶里的第几个音
  晨: [{ r: [0, 8], d: [2, 4] }, { r: [4], d: [3] }, { r: [0, 8], d: [4, 5] }, { r: [4], d: [2] }],
  午: [{ r: [0, 3, 6, 8], d: [4, 2, 1, 2] }, { r: [0, 4], d: [4, 3] }, { r: [0, 3, 6, 10], d: [4, 2, 4, 5] }, { r: [0, 3, 6], d: [4, 3, 2] }],
  暮: [{ r: [0, 3, 6, 8, 11, 14], d: [4, 5, 7, 5, 4, 5] }, { r: [0, 3, 6, 10], d: [4, 3, 2, 3] }, { r: [0, 3, 6, 8, 11, 14], d: [5, 7, 9, 7, 5, 4] }, { r: [0, 4, 6, 8], d: [5, 4, 2, 0] }],
  夜: [{ r: [0, 6], d: [4, 2] }, { r: [2], d: [0] }, { r: [0, 6], d: [2, 1] }, { r: [4], d: [-1] }]
};
const MOV = [                                                                                                // 八阵风＝八段。loop＝和弦循环（两小节换一个），mont / clave＝林子自己那两层的音量，en＝打击乐力度
  { name: "晨", loop: [0], mont: 0, clave: 0, en: 0.75, tone: 1, send: 0.45, pad: 1.3, dew: 0.08, hook: HOOK.晨 },
  { name: "晨", loop: [0, 2], mont: 0.5, clave: 0, en: 0.85, tone: 1, send: 0.4, pad: 1.2, dew: 0.05, hook: HOOK.晨 },
  { name: "午", loop: [0, 1, 3, 2], mont: 1, clave: 0.6, en: 1, tone: 1, send: 0.28, pad: 1, dew: 0.02, hook: HOOK.午 },
  { name: "午", loop: [0, 1, 3, 2], mont: 1, clave: 1, en: 1.05, tone: 1, send: 0.28, pad: 1, dew: 0.02, hook: HOOK.午 },
  { name: "暮", loop: [1, 3, 2, 0], mont: 1.15, clave: 1, en: 1.12, tone: 1, send: 0.3, pad: 1.1, dew: 0.02, hook: HOOK.暮 },
  { name: "暮", loop: [3, 2, 0, 1], mont: 1.15, clave: 1, en: 1.15, tone: 1, send: 0.3, pad: 1.1, dew: 0.02, hook: HOOK.暮 },
  { name: "夜", loop: [1, 4], mont: 0, clave: 0.5, en: 0.7, tone: 0.85, send: 0.6, pad: 1.3, dew: 0.01, echo: 1, cricket: 1, hook: HOOK.夜 },
  { name: "夜", loop: [1], mont: 0, clave: 0, en: 0.55, tone: 0.85, send: 0.62, pad: 1.4, dew: 0.01, echo: 1, cricket: 1, hook: HOOK.夜 }
].map(m => ({ ...m, pats: GROOVE.pats }));
const DAYSTN = MOV.map(m => m.loop[0]);
const VOX = [   // 从左到右。外侧两根近而粗，内侧两根远而细，围成半弧，中间空出来当舞台
  { name: "surdo",    x: -3.4, z: -4.2, r: 0.260, f0: 150,  a: { f: "surdo_o1", gain: 1.00, dur: 0.70, rate: 1.00 }, b: { f: "surdo_m",  gain: 0.55, dur: 0.16, rate: 1.05 } },
  { name: "tamborim", x: -4.1, z: -4.8, r: 0.150, f0: 1250, a: { f: "tamb_1",   gain: 0.45, dur: 0.14, rate: 2.20 }, b: { f: "tamb_2",   gain: 0.40, dur: 0.14, rate: 2.20 } },
  { name: "chocalho", x:  4.1, z: -4.8, r: 0.135, f0: 2600, a: { f: "choc_d1",  gain: 0.30, dur: 0.12, rate: 1.00 }, b: { f: "choc_u1",  gain: 0.26, dur: 0.12, rate: 1.00 } },
  { name: "caixa",    x:  3.4, z: -4.2, r: 0.215, f0: 620,  a: { f: "caixa_a",  gain: 0.40, dur: 0.20, rate: 1.00 }, b: { f: "caixa_c1", gain: 0.24, dur: 0.16, rate: 1.00 } }
];
/* 手形判定的线，来自真手录像（finger-test_20261104）：捏食指时另外三指「指尖/中节到腕」的比值中位 1.36；
   攥拳时 0.65。种竹要 > 1.0，砍竹要 < 0.85 且食指也蜷着（< 0.9）。捏合线沿用平面版跟谱：0.30 捏上、0.40 松开。 */
const PINCH_ON = 0.30, PINCH_OFF = 0.40, OPEN3 = 1.0, FIST3 = 0.85, FIST_IDX = 0.9;

/* ═════════ 声音 ═════════ */
let CH_AUDIO = 0.8;
function makeAudio() {
  const A = { ok: false };
  A.start = async () => {
    if (A.ok) { if (A.AC.state !== "running") try { await A.AC.resume(); } catch (e) { } return; }
    const AC = A.AC = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "interactive" });
    A.master = AC.createGain(); A.master.gain.value = CH_AUDIO;
    const lim = AC.createDynamicsCompressor(); lim.threshold.value = -9; lim.ratio.value = 6; lim.attack.value = 0.003; lim.release.value = 0.2; A.master.connect(lim).connect(AC.destination); A.out = lim;   // 种满了也不爆音
    const len = Math.floor(AC.sampleRate * 3.0), ir = AC.createBuffer(2, len, AC.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch), R = rng(900 + ch); let lp = 0;
      for (let i = 0; i < len; i++) { const t = i / AC.sampleRate, a = 0.12 + Math.min(0.8, t * 0.5); lp += ((R() * 2 - 1) - lp) * (1 - a * 0.9); d[i] = lp * Math.exp(-t / 0.7) * (t < 0.012 ? t / 0.012 : 1); } }
    A.conv = AC.createConvolver(); A.conv.buffer = ir; const wet = AC.createGain(); wet.gain.value = 0.9; A.conv.connect(wet).connect(A.master);
    A.bus = AC.createGain(); A.bus.connect(A.master); A.send = AC.createGain(); A.send.gain.value = 0.3; A.bus.connect(A.send).connect(A.conv);
    const nb = AC.createBuffer(1, AC.sampleRate * 5, AC.sampleRate), nd = nb.getChannelData(0), R = rng(4242); let b0 = 0, b1 = 0;
    for (let i = 0; i < nd.length; i++) { const w = R() * 2 - 1; b0 = 0.985 * b0 + w * 0.12; b1 = 0.90 * b1 + w * 0.25; nd[i] = b0 + b1 * 0.35 + w * 0.06; }
    A.noise = nb; const src = AC.createBufferSource(); src.buffer = nb; src.loop = true;
    const wl = AC.createBiquadFilter(); wl.type = "bandpass"; wl.frequency.value = 520; wl.Q.value = 0.6; A.windF = wl;
    A.windG = AC.createGain(); A.windG.gain.value = 0; A.windPan = AC.createStereoPanner(); src.connect(wl).connect(A.windG).connect(A.windPan).connect(A.master); A.windPan.connect(A.send);
    { const nb = AC.createBuffer(1, AC.sampleRate, AC.sampleRate), d = nb.getChannelData(0), R = rng(77); for (let i = 0; i < d.length; i++) d[i] = R() * 2 - 1; A.nb = nb; }
    src.start(); A.ok = true;
  };
  /* 敲竹筒：竹子越粗声音越低。主音饱满，副音短而轻。 */
  A.wood = (v, sub, vel, when, pan = 0) => {
    if (!A.ok || A.AC.state !== "running") return 0; const AC = A.AC, t = Math.max(AC.currentTime, when || 0), f = [131, 540, 1150, 310][v] * (sub ? 1.26 : 1) * (A.tone || 1), dec = [0.24, 0.075, 0.04, 0.11][v] * (sub ? 0.6 : 1), lv = [0.85, 0.30, 0.13, 0.36][v] * vel * (sub ? 0.6 : 1);
    const p = AC.createStereoPanner(); p.pan.value = cl(pan, -1, 1); p.connect(A.bus);
    for (const [ratio, amp, dk] of [[1, 1, 1], [2.76, 0.32, 0.5], [5.4, 0.12, 0.3]]) { if (f * ratio > 15000) continue; const o = AC.createOscillator(), g = AC.createGain(); o.frequency.setValueAtTime(f * ratio * 1.35, t); o.frequency.exponentialRampToValueAtTime(f * ratio, t + 0.012);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, lv * amp), t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + dec * dk); o.connect(g).connect(p); o.start(t); o.stop(t + dec * dk + 0.03); }
    if (A.nb) { const n = AC.createBufferSource(), bp = AC.createBiquadFilter(), g = AC.createGain(); n.buffer = A.nb; bp.type = "bandpass"; bp.frequency.value = Math.min(9000, f * 3.2); bp.Q.value = 1.2; g.gain.setValueAtTime(lv * 0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.018); n.connect(bp).connect(g).connect(p); n.start(t, Math.random() * 0.5, 0.03); }
    return 1; };
  /* 一声脆响（像折断一根细枝）、沙沙声、能拖长的低音 */
  A.snap = (vel, when, pan = 0) => { if (!A.ok || A.AC.state !== "running" || !A.nb) return 0; const AC = A.AC, t = Math.max(AC.currentTime, when || 0), p = AC.createStereoPanner(); p.pan.value = cl(pan, -1, 1); p.connect(A.bus);
    const n = AC.createBufferSource(), bp = AC.createBiquadFilter(), g = AC.createGain(); n.buffer = A.nb; bp.type = "bandpass"; bp.frequency.value = 1900; bp.Q.value = 1.6; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5 * vel, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05); n.connect(bp).connect(g).connect(p); n.start(t, Math.random() * 0.5, 0.07);
    const o = AC.createOscillator(), og = AC.createGain(); o.frequency.setValueAtTime(1500, t); o.frequency.exponentialRampToValueAtTime(820, t + 0.02); og.gain.setValueAtTime(0.22 * vel, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.045); o.connect(og).connect(p); o.start(t); o.stop(t + 0.06); return 1; };
  A.shaker = (vel, when, pan = 0) => { if (!A.ok || A.AC.state !== "running" || !A.nb) return 0; const AC = A.AC, t = Math.max(AC.currentTime, when || 0), p = AC.createStereoPanner(), n = AC.createBufferSource(), hp = AC.createBiquadFilter(), g = AC.createGain(); p.pan.value = cl(pan, -1, 1); p.connect(A.bus);
    n.buffer = A.nb; hp.type = "highpass"; hp.frequency.value = 5500; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.62 * vel, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.055); n.connect(hp).connect(g).connect(p); n.start(t, Math.random() * 0.5, 0.08); return 1; };
  A.bass = (midi, dur, vel, when, pan = 0) => { if (!A.ok || A.AC.state !== "running") return 0; const AC = A.AC, t = Math.max(AC.currentTime, when || 0), f = 440 * Math.pow(2, (midi - 69) / 12), g = AC.createGain(), lp = AC.createBiquadFilter(), p = AC.createStereoPanner(); p.pan.value = cl(pan, -1, 1); p.connect(A.bus);
    lp.type = "lowpass"; lp.frequency.value = 900; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2 * vel, t + 0.012); g.gain.setTargetAtTime(0.13 * vel, t + 0.03, 0.08); g.gain.setTargetAtTime(0.0001, t + dur, 0.035); g.connect(lp).connect(p);
    for (const [r, a, ty] of [[1, 1, "sine"], [2, 0.9, "triangle"], [3, 0.45, "sine"], [4, 0.2, "sine"]]) { const o = AC.createOscillator(), og = AC.createGain(); o.type = ty; o.frequency.setValueAtTime(f * r * 0.94, t); o.frequency.exponentialRampToValueAtTime(f * r, t + 0.04); og.gain.value = a; o.connect(og).connect(g); o.start(t); o.stop(t + dur + 0.3); } return 1; };
  /* 虫声：夜里才有，很轻的三下高频短音 */
  A.cricket = (vel, when, pan = 0) => { if (!A.ok || A.AC.state !== "running" || !A.nb) return 0; const AC = A.AC, t = Math.max(AC.currentTime, when || 0), p = AC.createStereoPanner(); p.pan.value = cl(pan, -1, 1); p.connect(A.bus);
    for (let i = 0; i < 3; i++) { const n = AC.createBufferSource(), bp = AC.createBiquadFilter(), g = AC.createGain(), tt = t + i * 0.034; n.buffer = A.nb; bp.type = "bandpass"; bp.frequency.value = 5200; bp.Q.value = 14; g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(0.11 * vel, tt + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.024); n.connect(bp).connect(g).connect(p); n.start(tt, Math.random() * 0.5, 0.03); } return 1; };
  /* 青蛙：低、短、带一点上滑和颤动 */
  A.frog = (midi, vel, when, pan = 0) => {
    if (!A.ok || A.AC.state !== "running") return 0; const AC = A.AC, t = Math.max(AC.currentTime, when || 0), f = 440 * Math.pow(2, (midi - 69) / 12), p = AC.createStereoPanner(); p.pan.value = cl(pan, -1, 1); p.connect(A.bus);
    const g = AC.createGain(), tr = AC.createOscillator(), tg = AC.createGain(); tr.frequency.value = 34; tg.gain.value = 0.35; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.15 * vel, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34); tr.connect(tg).connect(g.gain); g.connect(p);
    for (const [ratio, amp, type] of [[1, 1, "sine"], [2, 0.5, "triangle"], [3, 0.22, "sine"]]) { const o = AC.createOscillator(), og = AC.createGain(); o.type = type; o.frequency.setValueAtTime(f * ratio * 0.86, t); o.frequency.exponentialRampToValueAtTime(f * ratio, t + 0.07); og.gain.value = amp; o.connect(og).connect(g); o.start(t); o.stop(t + 0.38); }
    tr.start(t); tr.stop(t + 0.38); return 1; };
  /* 露水：很轻的一滴 */
  A.drop = (midi, vel, when, pan = 0) => {
    if (!A.ok || A.AC.state !== "running") return 0; const AC = A.AC, t = Math.max(AC.currentTime, when || 0), f = 440 * Math.pow(2, (midi - 69) / 12), o = AC.createOscillator(), g = AC.createGain(), p = AC.createStereoPanner(); p.pan.value = cl(pan, -1, 1);
    o.frequency.setValueAtTime(f * 1.25, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.035); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05 * vel, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55); o.connect(g).connect(p).connect(A.bus); o.start(t); o.stop(t + 0.6); return 1; };
  /* 风的长音：三个音，每个是一个很轻的正弦加一条窄带的气声，像风吹过竹管。换站时滑过去。 */
  A.padSet = (midis, level, glide = 0.5) => {
    if (!A.ok) return; const AC = A.AC, t = AC.currentTime;
    if (!A.padV) { A.padG = AC.createGain(); A.padG.gain.value = 0; A.padG.connect(A.bus); A.padV = midis.map(() => { const o = AC.createOscillator(), og = AC.createGain(), n = AC.createBufferSource(), bp = AC.createBiquadFilter(), ng = AC.createGain(); o.type = "sine"; og.gain.value = 0.5; n.buffer = A.nb; n.loop = true; bp.type = "bandpass"; bp.Q.value = 38; ng.gain.value = 3.2; o.connect(og).connect(A.padG); n.connect(bp).connect(ng).connect(A.padG); o.start(); n.start(0, Math.random()); return { o, bp }; }); }
    midis.forEach((m, i) => { const f = 440 * Math.pow(2, (m - 69) / 12); A.padV[i].o.frequency.setTargetAtTime(f, t, glide); A.padV[i].bp.frequency.setTargetAtTime(f * 2, t, glide); });
    A.padG.gain.setTargetAtTime(level, t, 0.6); };
  A.sbuf = {};
  A.loadSamples = async () => {
    const names = [...new Set(VOX.flatMap(v => [v.a.f, v.b.f]))];
    await Promise.all(names.map(async nm => { try { const r = await fetch(HERE + "/samples/" + nm + ".wav"); if (!r.ok) return; const b = await A.AC.decodeAudioData(await r.arrayBuffer());
      const ch = b.getChannelData(0); let pk = 0; for (let i = 0; i < ch.length; i++) { const v = Math.abs(ch[i]); if (v > pk) pk = v; } let on = 0; while (on < ch.length && Math.abs(ch[on]) < pk * 0.1) on++;   // 起音前的空白剪掉，峰值归一
      A.sbuf[nm] = { buf: b, off: Math.max(0, (on - 32) / b.sampleRate), norm: pk > 0 ? 1 / pk : 1 }; } catch (e) { } }));
    return Object.keys(A.sbuf).length;
  };
  A.drum = (v, sub, vel, when, pan = 0) => {
    if (!A.ok || A.AC.state !== "running") return 0; const AC = A.AC, t = Math.max(AC.currentTime, when || 0), V = VOX[v], c = sub ? V.b : V.a, sb = A.sbuf[c.f];
    if (!sb) return A.tok(t, 0.14 * vel * (sub ? 0.7 : 1), pan, V.f0 * (sub ? 1.12 : 1));
    const src = AC.createBufferSource(); src.buffer = sb.buf; src.playbackRate.value = c.rate; const g = AC.createGain(), p = AC.createStereoPanner(); p.pan.value = cl(pan, -1, 1);
    const lv = c.gain * sb.norm * vel * 0.8; g.gain.setValueAtTime(lv, t); g.gain.setValueAtTime(lv, t + c.dur * 0.6); g.gain.linearRampToValueAtTime(0, t + c.dur);
    src.connect(g).connect(p).connect(A.master); p.connect(A.send); src.start(t, sb.off); src.stop(t + c.dur + 0.02); return 1;
  };
  /* 敲响一根竹：手碟的模态表（和平面版同一张）。pan＝它在画面里的左右 */
  const MODES = [[1, 1.00, 3.2], [2, 0.52, 2.3], [3, 0.30, 1.8], [4.1, 0.14, 1.2], [5.4, 0.07, 0.8]];
  A.strike = (midi, vel, when, pan = 0) => {
    if (!A.ok || A.AC.state !== "running") return 0; const AC = A.AC, t = Math.max(AC.currentTime, when || 0), f0 = 440 * Math.pow(2, (midi - 69) / 12);
    const p = AC.createStereoPanner(); p.pan.value = cl(pan, -1, 1); p.connect(A.bus); let n = 0;
    for (const [ratio, amp, dec] of MODES) { const f = f0 * ratio; if (f > 16000) continue; const o = AC.createOscillator(); o.frequency.value = f; const g = AC.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, amp * vel * 0.2), t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      o.connect(g).connect(p); o.start(t); o.stop(t + dec + 0.05); n++; }
    return n;
  };
  A.chirp = (midi, vel, when, pan = 0) => {                 // 鸟：一个带一点上滑的短音
    if (!A.ok || A.AC.state !== "running") return 0; const AC = A.AC, t = Math.max(AC.currentTime, when || 0), f = 440 * Math.pow(2, (midi - 69) / 12);
    const o = AC.createOscillator(), g = AC.createGain(), p = AC.createStereoPanner(); p.pan.value = cl(pan, -1, 1); o.type = "sine";
    o.frequency.setValueAtTime(f * 0.94, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.04); o.frequency.setValueAtTime(f, t + 0.1); o.frequency.exponentialRampToValueAtTime(f * 1.02, t + 0.2);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel * 0.09, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    o.connect(g).connect(p).connect(A.bus); o.start(t); o.stop(t + 0.27); return 1;
  };
  A.tok = (when, g, pan = 0, f0 = 1040) => {               // 喙敲空竹 / 竹被砍倒的一声
    if (!A.ok || A.AC.state !== "running") return 0; const AC = A.AC, t = Math.max(AC.currentTime, when || 0), o = AC.createOscillator(), e = AC.createGain(), p = AC.createStereoPanner(); p.pan.value = cl(pan, -1, 1);
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.6, t + 0.03);
    e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(g, t + 0.002); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    o.connect(e).connect(p).connect(A.bus); o.start(t); o.stop(t + 0.08);
    const s = AC.createBufferSource(); s.buffer = A.noise; const bp = AC.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = f0 * 2.3; bp.Q.value = 1.5; const e2 = AC.createGain();
    e2.gain.setValueAtTime(g * 0.5, t); e2.gain.exponentialRampToValueAtTime(0.0001, t + 0.012); s.connect(bp).connect(e2).connect(p); s.start(t, (t * 7.3) % 4, 0.03); return 1;
  };
  return A;
}

/* ═════════ 画面 ═════════ */
const GL_FOG = `
uniform vec3 uSkyTop, uSkyHor, uSun, uSunDir; uniform float uFogD, uPost;
vec3 skyCol(vec3 dir){ float h = clamp(dir.y*1.5 + 0.38, 0., 1.); return mix(uSkyHor, uSkyTop, h) + uSun * pow(max(dot(dir, uSunDir), 0.), 5.); }
float fogSmooth(float d){ return 1. - exp(-pow(d/uFogD, 1.35)); }
float fogStep(float d){ float f = fogSmooth(d); return mix(f, floor(f*uPost + .5)/uPost, 0.6); }`;
/* 风：一道从左往右走的锋面。uGust＝(锋面的 x, 强度)。吹到谁，谁往右一弯再弹回来 */
const GL_WIND = `
uniform float uTime; uniform vec2 uGust;
float gustAt(float x){ float d = x - uGust.x; return uGust.y * (d < 0. ? exp(-d*d/5.0) : exp(-d*d/0.5)); }
vec2 swayAt(vec2 b, float y, float seed){
  float ph = seed*6.283 + b.x*0.21 + b.y*0.17;
  float w = 0.035 + 0.02*sin(uTime*0.8 + ph) + gustAt(b.x)*(0.26 + 0.05*sin(uTime*9. + ph));
  return vec2(w, w*0.25) * y * y;
}`;
function leafShape(c, x, y, len, ang, v) { c.save(); c.translate(x, y); c.rotate(ang); c.fillStyle = `rgb(${v},${v},${v})`; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(len * .5, -len * .17, len, 0); c.quadraticCurveTo(len * .5, len * .12, 0, 0); c.fill(); c.restore(); }
function makeLeafAtlas() {
  const N = 256, cv = document.createElement("canvas"); cv.width = N * 4; cv.height = N * 2; const c = cv.getContext("2d"), R = rng(77);
  for (let i = 0; i < 8; i++) { const ox = (i % 4) * N, oy = (i >> 2) * N; c.save(); c.translate(ox, oy); c.beginPath(); c.rect(2, 2, N - 4, N - 4); c.clip();
    if (i < 5) { const dir = i % 2 ? -1 : 1, x0 = N / 2 - dir * 86, y0 = 60 + R() * 30, nodes = 3 + (i % 3); c.strokeStyle = "rgb(70,70,70)"; c.lineWidth = 3; c.lineCap = "round"; c.beginPath(); c.moveTo(x0, y0);
      let x = x0, y = y0; const pts = []; for (let n = 0; n < nodes; n++) { x += dir * (44 + R() * 14); y += 10 + R() * 16; c.lineTo(x, y); pts.push([x, y]); } c.stroke();
      for (const [px, py] of pts) { const k = 3 + Math.floor(R() * 3); for (let j = 0; j < k; j++) leafShape(c, px, py, 62 + R() * 44, Math.PI * 0.5 - dir * (0.15 + (j / (k - 1 || 1)) * 1.0) + (R() - .5) * 0.25, 95 + Math.floor(R() * 150)); } }
    else if (i === 5) { for (let j = 0; j < 9; j++) leafShape(c, N / 2 + (R() - .5) * 60, N - 6, 90 + R() * 110, -Math.PI / 2 + (R() - .5) * 1.5, 80 + Math.floor(R() * 150)); }
    else if (i === 6) leafShape(c, 40, N / 2, 176, 0, 215);
    else { for (let q = 0; q < 3; q++) { const hh = 190 - q * 46, ww = 74 - q * 18, v = 110 + q * 55; c.fillStyle = `rgb(${v},${v},${v})`; c.beginPath(); c.moveTo(N / 2 - ww / 2, N - 4); c.quadraticCurveTo(N / 2 - ww * .3, N - 4 - hh * .6, N / 2 + 8, N - 4 - hh); c.quadraticCurveTo(N / 2 + ww * .35, N - 4 - hh * .5, N / 2 + ww / 2, N - 4); c.fill(); } }
    c.restore(); }
  const t = new THREE.CanvasTexture(cv); t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 4; return t;
}
function makeMistTex() { const cv = document.createElement("canvas"); cv.width = 512; cv.height = 128; const c = cv.getContext("2d"), R = rng(5);
  for (let i = 0; i < 26; i++) { const x = 60 + R() * 392, y = 34 + R() * 60, rx = 60 + R() * 120, ry = 12 + R() * 22, g = c.createRadialGradient(x, y, 0, x, y, rx); g.addColorStop(0, "rgba(255,255,255,.16)"); g.addColorStop(1, "rgba(255,255,255,0)");
    c.save(); c.translate(x, y); c.scale(1, ry / rx); c.translate(-x, -y); c.fillStyle = g; c.beginPath(); c.arc(x, y, rx, 0, 7); c.fill(); c.restore(); }
  c.globalCompositeOperation = "destination-in"; let e = c.createLinearGradient(0, 0, 512, 0); e.addColorStop(0, "rgba(0,0,0,0)"); e.addColorStop(0.22, "#000"); e.addColorStop(0.78, "#000"); e.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = e; c.fillRect(0, 0, 512, 128);
  e = c.createLinearGradient(0, 0, 0, 128); e.addColorStop(0, "rgba(0,0,0,0)"); e.addColorStop(0.3, "#000"); e.addColorStop(0.7, "#000"); e.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = e; c.fillRect(0, 0, 512, 128); return new THREE.CanvasTexture(cv); }
/* 两只鸟：照搬平面版的画法（暗绿绣眼、大斑啄木鸟；朱砂只在它们身上） */
const ZHU = "#C8462E", BIRDC = { back: "#3A5233", wing: "#1E3424", throat: "#D2D57E", belly: "#C9D6C1", ring: "#EDF1E8", eye: "#0F1E14", leg: "#4D6150" };
function drawBird(c, bx, by, s, open, perched, t) {
  c.save(); c.translate(bx, by); c.scale(s, s);
  const wing = (ang, len, al) => { c.save(); c.translate(-6, -26); c.rotate(ang); c.globalAlpha = al; c.fillStyle = BIRDC.wing; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(len * 0.45, -len * 0.30, len, 0); c.quadraticCurveTo(len * 0.55, len * 0.10, 0, 0); c.fill(); c.restore(); };
  const flap = Math.sin(t * 0.012) * 0.22 * open, base = Math.PI * (1 + 0.30 * open);
  if (open > 0.02) wing(base + 0.28 * open + flap, 46, 0.7);
  c.fillStyle = BIRDC.back; c.beginPath(); c.moveTo(-34, -14); c.bezierCurveTo(-30, -40, 6, -46, 18, -30); c.bezierCurveTo(30, -16, 22, -2, 4, 0); c.lineTo(-40, 6); c.lineTo(-58, 14); c.lineTo(-44, 0); c.bezierCurveTo(-40, -4, -37, -8, -34, -14); c.fill();
  c.save(); c.clip(); c.fillStyle = BIRDC.belly; c.beginPath(); c.ellipse(4, -4, 30, 14, -0.15, 0, 7); c.fill(); c.fillStyle = BIRDC.throat; c.beginPath(); c.ellipse(16, -18, 13, 12, 0.2, 0, 7); c.fill(); c.restore();
  c.fillStyle = BIRDC.back; c.beginPath(); c.arc(14, -36, 13, 0, 7); c.fill(); c.fillStyle = BIRDC.throat; c.beginPath(); c.arc(19, -28, 6.5, 0, 7); c.fill();
  c.fillStyle = ZHU; c.beginPath(); c.moveTo(25, -38); c.lineTo(36, -34); c.lineTo(25, -31); c.fill();
  c.fillStyle = BIRDC.ring; c.beginPath(); c.arc(17, -38, 4.4, 0, 7); c.fill(); c.fillStyle = BIRDC.eye; c.beginPath(); c.arc(17, -38, 2.3, 0, 7); c.fill();
  if (open > 0.02) wing(base - flap * 0.6, 52, 1); else { c.strokeStyle = BIRDC.wing; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-20, -26); c.quadraticCurveTo(-2, -22, 6, -8); c.stroke(); }
  if (perched) { c.strokeStyle = BIRDC.leg; c.lineWidth = 2; c.beginPath(); c.moveTo(-2, 0); c.lineTo(-4, 6); c.moveTo(6, -1); c.lineTo(6, 6); c.stroke(); }
  c.restore();
}
function drawWoodpecker(c, px, py, s, peck) {
  const K = "#16281C", Wt = "#EDF1E8"; c.save(); c.translate(px, py); c.scale(s, s);
  c.fillStyle = K; c.beginPath(); c.moveTo(4, -30); c.bezierCurveTo(16, -24, 16, 8, 8, 22); c.lineTo(2, 24); c.bezierCurveTo(-10, 14, -12, -18, 4, -30); c.fill();
  c.fillStyle = Wt; c.beginPath(); c.moveTo(8, -24); c.bezierCurveTo(15, -14, 14, 6, 9, 16); c.lineTo(6, 14); c.bezierCurveTo(9, 2, 9, -12, 6, -22); c.fill();
  c.fillStyle = ZHU; c.beginPath(); c.ellipse(5, 19, 4, 4.5, 0, 0, 7); c.fill(); c.fillStyle = K; c.beginPath(); c.moveTo(4, 20); c.lineTo(12, 44); c.lineTo(6, 44); c.lineTo(-1, 22); c.fill();
  c.save(); c.translate(peck * 4, peck * 1.5); c.rotate(peck * 0.12); c.fillStyle = K; c.beginPath(); c.arc(9, -34, 8, 0, 7); c.fill(); c.fillStyle = Wt; c.beginPath(); c.ellipse(11, -32, 4.5, 3, 0.2, 0, 7); c.fill();
  c.fillStyle = ZHU; c.beginPath(); c.arc(4, -38, 3, 0, 7); c.fill(); c.fillStyle = K; c.beginPath(); c.moveTo(15, -37); c.lineTo(30, -34); c.lineTo(15, -31); c.fill(); c.fillStyle = "#0F1E14"; c.beginPath(); c.arc(11, -36, 1.5, 0, 7); c.fill(); c.restore();
  c.fillStyle = Wt; for (let i = 0; i < 4; i++) { c.beginPath(); c.ellipse(1, -12 + i * 7, 4.5, 1.3, -.2, 0, 7); c.fill(); }
  c.strokeStyle = K; c.lineWidth = 1.6; c.beginPath(); c.moveTo(10, 6); c.lineTo(16, 8); c.moveTo(10, 14); c.lineTo(16, 16); c.stroke(); c.restore();
}

export function init() {
  const CH = document.body.dataset.chapter === "peck" ? 2 : 1; if (CH === 2) CH_AUDIO = 0.5;
  const glc = $("wg-gl"), A = makeAudio();
  const renderer = new THREE.WebGLRenderer({ canvas: glc, antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  const scene = new THREE.Scene(), FOV = 46, camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 400); scene.add(camera);
  const U = { uSkyTop: { value: hex("#EEF2EA") }, uSkyHor: { value: hex("#DFE7D9") }, uSun: { value: new THREE.Color(0.035, 0.03, 0.005) }, uSunDir: { value: new THREE.Vector3(-0.5, 0.55, -0.67).normalize() },
    uFogD: { value: 26 }, uPost: { value: 9 }, uTime: { value: 0 }, uGust: { value: new THREE.Vector2(-99, 0) } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 12), new THREE.ShaderMaterial({ uniforms: U, side: THREE.BackSide, depthWrite: false,
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: GL_FOG + `varying vec3 vDir; void main(){ gl_FragColor = vec4(skyCol(normalize(vDir)), 1.); }` })); sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    uniforms: { ...U, uGround: { value: hex("#DCE4D5") }, uMoss: { value: hex("#C3D0BB") }, uLeaf: { value: hex("#9DB093") } },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: GL_FOG + `uniform vec3 uGround, uMoss, uLeaf; varying vec3 vW;
      float h21(vec2 p){ p = fract(p*vec2(123.34, 345.45)); p += dot(p, p+34.345); return fract(p.x*p.y); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
      void main(){ float n = vn(vW.xz*0.35)*0.6 + vn(vW.xz*1.3)*0.4; vec3 c = mix(uGround, uMoss, smoothstep(0.35, 0.75, n)*0.6);
        vec2 cell = floor(vW.xz*4.5), f = fract(vW.xz*4.5) - .5; float r = h21(cell);
        if(r > 0.90){ float a = r*40.; vec2 q = vec2(cos(a)*f.x + sin(a)*f.y, -sin(a)*f.x + cos(a)*f.y); c = mix(c, uLeaf, smoothstep(0.34, 0.30, length(q*vec2(1., 3.2)))*0.7); }
        vec3 dv = vW - cameraPosition; gl_FragColor = vec4(mix(c, skyCol(normalize(dv)), fogSmooth(length(dv)*1.08)), 1.); }` })); ground.frustumCulled = false; scene.add(ground);

  /* 竹：aLife＝(出生时刻, 倒下时刻, 上一次被吹响的时刻, 响的力度)。从地里长出来；砍了就沉下去 */
  const MAXS = 220, SEG = 12, sg = new THREE.InstancedBufferGeometry();
  { const pos = [], idx = []; for (let j = 0; j <= SEG; j++) pos.push(-1, j / SEG, 0, 1, j / SEG, 0); for (let j = 0; j < SEG; j++) { const a = j * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    sg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); sg.setIndex(idx); }
  const mkA = (n, k, dyn) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(n * k), k); if (dyn) a.setUsage(THREE.DynamicDrawUsage); return a; };
  const sBase = mkA(MAXS, 2), sDim = mkA(MAXS, 2), sMisc = mkA(MAXS, 2), sLife = mkA(MAXS, 4, true);
  sg.setAttribute("aBase", sBase); sg.setAttribute("aDim", sDim); sg.setAttribute("aMisc", sMisc); sg.setAttribute("aLife", sLife);
  const GROW = `float growK(vec4 life){ float g = clamp((uTime - life.x)/1.1, 0., 1.); g = 1. - pow(1. - g, 3.); float d = clamp((uTime - life.y)/0.6, 0., 1.); return g * (1. - d*d); }`;
  const stalks = new THREE.Mesh(sg, new THREE.ShaderMaterial({ side: THREE.DoubleSide,
    uniforms: { ...U, uCulm: { value: hex("#7C987A") }, uCulmHi: { value: hex("#A6BAA1") }, uCulmLo: { value: hex("#56735A") }, uNode: { value: hex("#34503C") }, uNote: { value: hex("#6E9468") }, uNoteHi: { value: hex("#A9C29C") } },
    vertexShader: GL_WIND + GROW + `attribute vec2 aBase, aDim, aMisc; attribute vec4 aLife; varying vec2 vUv; varying float vH, vD, vSeed, vKind, vGlow; varying vec3 vDir;
      void main(){ float k = growK(aLife), h = position.y * aDim.y * k; vec3 p = vec3(aBase.x, h, aBase.y);
        float dth = uTime - aLife.z, ring = dth > 0. && dth < 4. ? aLife.w * exp(-dth*1.6) : 0.;
        p.xz += swayAt(aBase, h/6., aMisc.x) + vec2(ring * sin(dth*15.) * 0.10, 0.) * pow(h/6., 1.3);
        vec3 toCam = cameraPosition - p; toCam.y = 0.; toCam = normalize(toCam); vec3 side = vec3(toCam.z, 0., -toCam.x);
        p += side * position.x * aDim.x * mix(1., 0.5, position.y) * step(0.02, k);
        vUv = position.xy; vH = h; vSeed = aMisc.x; vKind = aMisc.y; vGlow = ring; vD = distance(aBase, cameraPosition.xz); vDir = normalize(vec3(aBase.x, 1.6, aBase.y) - cameraPosition);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.); }`,
    fragmentShader: GL_FOG + `uniform vec3 uCulm, uCulmHi, uCulmLo, uNode, uNote, uNoteHi; varying vec2 vUv; varying float vH, vD, vSeed, vKind, vGlow; varying vec3 vDir;
      void main(){ vec3 base = mix(uCulm, uNote, vKind), hi = mix(uCulmHi, uNoteHi, vKind), c = base;
        if(vUv.x > 0.05 && vUv.x < 0.55) c = hi; if(vUv.x < -0.55) c = uCulmLo;
        float nl = 0.34 + vSeed*0.22, f = fract(vH/nl + vSeed), ring = 0.018/nl; if(f < ring) c = uNode; else if(f < ring*2.2) c = mix(c, hi, 0.6);
        c = mix(c, hi, clamp(vGlow, 0., 1.)*0.8); gl_FragColor = vec4(mix(c, skyCol(vDir), fogStep(vD)), 1.); }` }));
  stalks.frustumCulled = false; scene.add(stalks);

  /* 叶：aLife 同上（出生、倒下）。跟着所在的那根竹一起长、一起被风吹 */
  const MAXL = 1400, lg = new THREE.InstancedBufferGeometry();
  lg.setAttribute("position", new THREE.Float32BufferAttribute([-.5, -.5, 0, .5, -.5, 0, -.5, .5, 0, .5, .5, 0], 3)); lg.setIndex([0, 1, 2, 1, 3, 2]);
  const lPos = mkA(MAXL, 3, true), lSz = mkA(MAXL, 4, true), lLife = mkA(MAXL, 2, true); lg.setAttribute("aPos", lPos); lg.setAttribute("aSz", lSz); lg.setAttribute("aLife", lLife);
  const leaves = new THREE.Mesh(lg, new THREE.ShaderMaterial({ side: THREE.DoubleSide, uniforms: { ...U, uMap: { value: makeLeafAtlas() }, uDk: { value: hex("#2C4832") }, uLt: { value: hex("#7E9C70") } },
    vertexShader: GL_WIND + `attribute vec3 aPos; attribute vec4 aSz; attribute vec2 aLife; varying vec2 vUv; varying float vD, vTone; varying vec3 vDir;
      void main(){ float seed = aSz.w, spr = aSz.z; float g = clamp((uTime - aLife.x)/0.9, 0., 1.); g = 1. - pow(1. - g, 3.); float d = clamp((uTime - aLife.y)/0.5, 0., 1.); float k = g*(1. - d);
        vec3 c = aPos; c.y -= d*d*1.5; vec2 sw = swayAt(aPos.xz, aPos.y/6., seed); c.xz += sw;
        float rot = aSz.y + sin(uTime*1.7 + seed*40.)*0.05 + sw.x*1.4 + gustAt(aPos.x)*0.5*sin(uTime*11. + seed*30.);
        vec2 q = position.xy; float fl = step(.5, fract(seed*7.31)) * step(spr, 4.5); if(fl > .5) q.x = -q.x; float grounded = step(4.5, spr); q.y += 0.5*grounded;
        vec2 r = vec2(cos(rot)*q.x - sin(rot)*q.y, sin(rot)*q.x + cos(rot)*q.y) * aSz.x * k;
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vec2 uv = position.xy + .5; if(fl > .5) uv.x = 1. - uv.x; vUv = (vec2(mod(spr, 4.), 1. - floor(spr/4.)) + uv) * vec2(.25, .5);
        vD = distance(c, cameraPosition); vDir = normalize(c - cameraPosition); vTone = fract(seed*3.77); gl_Position = projectionMatrix * viewMatrix * vec4(c + right*r.x + up*r.y, 1.); }`,
    fragmentShader: GL_FOG + `uniform sampler2D uMap; uniform vec3 uDk, uLt; varying vec2 vUv; varying float vD, vTone; varying vec3 vDir;
      void main(){ vec4 t = texture2D(uMap, vUv); if(t.a < 0.45) discard; float v = clamp(t.r*0.75 + vTone*0.35 - 0.1, 0., 1.); v = floor(v*4. + .5)/4.;
        gl_FragColor = vec4(mix(mix(uDk, uLt, v), skyCol(vDir), fogStep(vD)), 1.); }` }));
  leaves.frustumCulled = false; scene.add(leaves);

  const unit = new THREE.PlaneGeometry(1, 1);
  const cardMat = (tex, o = {}) => new THREE.ShaderMaterial({ uniforms: { ...U, uMap: { value: tex }, uOp: { value: o.opacity ?? 1 }, uFogK: { value: o.fog ?? 1 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: GL_FOG + `uniform sampler2D uMap; uniform float uOp, uFogK; varying vec2 vUv; varying vec3 vW; void main(){ vec4 t = texture2D(uMap, vUv); vec3 dv = vW - cameraPosition; float a = t.a*uOp; if(a < 0.004) discard;
      gl_FragColor = vec4(mix(t.rgb, skyCol(normalize(dv)), fogSmooth(length(dv))*uFogK), a); }` });
  const mistTex = makeMistTex(), mists = [];
  for (let i = 0; i < 5; i++) { const R = rng(50 + i), m = new THREE.Mesh(unit, cardMat(mistTex, { opacity: 0.5, fog: 0 })); m.renderOrder = 5; m.userData = { x: (R() - .5) * 26, y: 2.4 + R() * 2.6, z: -4 - i * 5 - R() * 3, w: 26 + R() * 20, h: 4 + R() * 4, ph: R() * 6 }; scene.add(m); mists.push(m); }
  /* 风的样子：一道很淡的亮雾跟着锋面走 */
  const gustCard = new THREE.Mesh(unit, cardMat(mistTex, { opacity: 0, fog: 0 })); gustCard.renderOrder = 6; scene.add(gustCard);

  /* 手底下那根「将要种下」的竹：淡淡一根，顶上一个芽。它在哪、多高，种下去就是什么样 */
  const ghostTex = (() => { const c = document.createElement("canvas"); c.width = 32; c.height = 512; const x = c.getContext("2d"); x.fillStyle = "#34503C"; x.fillRect(13, 26, 6, 486);
    for (let y = 60; y < 512; y += 46) x.fillRect(10, y, 12, 3); x.beginPath(); x.moveTo(16, 0); x.quadraticCurveTo(28, 16, 20, 30); x.lineTo(12, 30); x.quadraticCurveTo(4, 16, 16, 0); x.fill(); return new THREE.CanvasTexture(c); })();
  const ghosts = [0, 1, 2].map(() => { const m = new THREE.Mesh(unit, new THREE.MeshBasicMaterial({ map: ghostTex, transparent: true, opacity: 0, depthWrite: false })); m.renderOrder = 9; scene.add(m); return m; });

  /* 鸟和啄木鸟：后来才来 */
  const bcv = document.createElement("canvas"); bcv.width = bcv.height = 320; const bctx = bcv.getContext("2d", { willReadFrequently: true }), btex = new THREE.CanvasTexture(bcv);
  const BU = 0.42 / 95, BS = 160 * BU, birdM = new THREE.Mesh(unit, cardMat(btex, { fog: 0.5 })); birdM.renderOrder = 8; birdM.visible = false; scene.add(birdM);
  const wcv = document.createElement("canvas"); wcv.width = 128; wcv.height = 224; const wctx = wcv.getContext("2d", { willReadFrequently: true }), wtex = new THREE.CanvasTexture(wcv);
  const peckM = new THREE.Mesh(unit, cardMat(wtex, { fog: 0.5 })); peckM.renderOrder = 8; peckM.visible = false; scene.add(peckM);
  const wpTex = [0, 1].map(k => { const c = document.createElement("canvas"); c.width = 128; c.height = 224; drawWoodpecker(c.getContext("2d"), 40, 116, 2.1, k); return new THREE.CanvasTexture(c); });
  const wpM = VOX.map(() => { const m = new THREE.Mesh(unit, cardMat(wpTex[0], { fog: 0.4 })); m.renderOrder = 8; m.visible = false; scene.add(m); return m; });
  const keepC = { ...BIRDC }; Object.assign(BIRDC, { back: "#E3B23A", wing: "#1B1F1A", throat: "#F1CF62", belly: "#F4E3A6", ring: "#1B1F1A", eye: "#0F1E14", leg: "#4D4630" });   // 旋律鸟：黄鹂，黄身黑翅，和竹叶分得开
  const sbTex = [[0, 1, 0], [1, 0, 130], [1, 0, 392]].map(([open, perched, t]) => { const c = document.createElement("canvas"); c.width = c.height = 320; drawBird(c.getContext("2d"), 160, 198, 2, open, !!perched, t); return new THREE.CanvasTexture(c); }); Object.assign(BIRDC, keepC);
  const sbM = Array.from({ length: MAXB + 4 }, () => { const m = new THREE.Mesh(unit, cardMat(sbTex[0], { fog: 0.12 })); m.renderOrder = 8; m.visible = false; scene.add(m); return m; });
  const ringTex = (() => { const c = document.createElement("canvas"); c.width = 256; c.height = 96; const x = c.getContext("2d"); x.strokeStyle = "#16281C"; x.lineWidth = 7; x.beginPath(); x.ellipse(128, 48, 116, 36, 0, 0, 7); x.stroke(); return new THREE.CanvasTexture(c); })();
  const bird = { on: false, x: 9, y: 5, z: 0, tx: 9, ty: 5, tz: 0, face: -1, hop: -9, perch: null }, peck = { on: false, x: -9, y: 4, z: 0, tx: -9, ty: 4, tz: 0, t: -9, perch: null, key: "" };

  /* ── 状态 ── */
  const S = { stalks: [], nextId: 1, bar0: 0, step: 0, nextT: 0, T: 0, planted: 0, cut: 0, hands: [], mouse: null, hint: 0, fired: 0 };
  const bgR = rng(2024), BG = [];
  for (let i = 0; i < 120; i++) { const z = -5 - Math.pow(bgR(), 0.8) * 30, x = (bgR() - .5) * (22 + -z * 0.9); BG.push({ x, z, r: 0.03 + bgR() * 0.05, h: 7 + bgR() * 5, seed: bgR(), thr: 0, birth: 1e9, lf: [0, 1, 2, 3].map(() => [bgR(), bgR(), bgR(), bgR(), bgR()]) }); }
  BG.sort((a, b) => a.z - b.z); BG.forEach((b, i) => { b.thr = Math.round(i * 34 / BG.length); });           // 你种得越多，远处的林子也跟着长出来（远的先出现）
  const live = () => S.stalks.filter(s => !s.dead);
  let dirty = true;
  /* 第二章的状态：每根竹 8 个节，n＝0 不敲 / 1 敲一下 / 2 敲两下 */
  const P = { pat: VOX.map(() => 0), wpL: VOX.map(() => 12), patT: VOX.map(() => 0), hit: VOX.map(() => ({ t: -99, v: 0 })), slot: [],
    wp: VOX.map((V, v) => ({ x: v < 2 ? -14 : 14, y: 2, peckT: -9, on: false, pk: -1 })) };
  P.birds = []; P.away = []; S.barN = -1;
  const perch = b => { const Z = ZN[b.zone], same = P.birds.filter(o => o.zone === b.zone && o.lvl === b.lvl), i = Math.max(0, same.indexOf(b)), side = i % 2 ? 1 : -1; b.side = side; b.tx = Z.x + side * 0.85; b.ty = PERCH_Y[b.lvl]; b.tz = Z.z + 1.3; };
  function invite(zone, lvl) {
    zone = cl(Math.round(zone), 0, ZN.length - 1); lvl = cl(Math.round(lvl), 0, PERCH_Y.length - 1); const cur = P.birds.find(o => o.zone === zone);       // 一丛竹只站一只鸟。已经有鸟的丛再捏：它挪到手的高度（换八度），当场唱一声
    if (cur) { cur.lvl = lvl; cur.midi = ZN[zone].midi + 12 * REG(lvl); perch(cur); recEv({ ev: "birdmove", zone, lvl }); A.strike(cur.midi, 0.75, 0, cur.tx / 6); A.chirp(cur.midi + 12, 0.3, 0, cur.tx / 6); cur.singT = S.T; return cur; }
    if (P.birds.length >= MAXB) return null;
    const b = { zone, lvl, midi: ZN[zone].midi + 12 * REG(lvl), x: ZN[zone].x + (zone < 2.5 ? -1.5 : 1.5), y: 12, z: ZN[zone].z + 1.3, singT: -9, born: S.T }; P.birds.push(b); perch(b); recEv({ ev: "bird", zone, lvl });
    A.strike(b.midi, 0.75, 0, b.tx / 6); A.chirp(b.midi + 12, 0.3, 0, b.tx / 6); S.planted++; S.invited = (S.invited || 0) + 1; dirty = true; return b;
  }
  const dewR = rng(4242);
  function dismissQuiet(zone) { let i = -1; P.birds.forEach((b, j) => { if (b.zone === zone) i = j; }); if (i < 0) return; const b = P.birds.splice(i, 1)[0]; b.goneT = S.T; b.tx = b.x + (b.x < 0 ? -6 : 6); b.ty = 15; P.away.push(b); }
  function dismiss(zone) { zone = cl(Math.round(zone), 0, ZN.length - 1); let i = -1; P.birds.forEach((b, j) => { if (b.zone === zone) i = j; }); if (i < 0) return null;
    const b = P.birds.splice(i, 1)[0]; recEv({ ev: "dismiss", zone }); b.goneT = S.T; b.tx = b.x + (b.x < 0 ? -6 : 6); b.ty = 15; P.away.push(b); P.birds.forEach(perch); A.chirp(b.midi + 12, 0.25, 0, b.x / 6); S.cut++; dirty = true; return b; }
  const litOf = v => (P.pat[v] ? mov().pats[v][P.pat[v] - 1][0].filter(Boolean).length : 0), litAll = () => VOX.reduce((a, _, v) => a + litOf(v), 0);
  /* 在一根台柱上捏一下：啄木鸟到手的高度来敲，高度落在下 / 中 / 上哪一段就敲疏 / 中 / 密；它已经在敲这一档时再捏，它歇着 */
  function setDrum(v, lvl) {
    v = cl(Math.round(v), 0, VOX.length - 1); lvl = cl(Math.round(lvl), 0, PIL_Y.length - 1); const d = DENS(lvl); P.pat[v] = P.pat[v] === d ? 0 : d; P.wpL[v] = lvl; P.patT[v] = S.T;
    if (P.pat[v]) { A.wood(v, 0, 0.8, 0, VOX[v].x / 6); P.hit[v] = { t: S.T, v: 0.7 }; P.wp[v].peckT = S.T; } else A.tok(0, 0.04, VOX[v].x / 6, 300);
    S.planted++; S.lastDrum = [v, P.pat[v]]; dirty = true; recEv({ ev: "drum", v, d: P.pat[v], lvl }); return { v, d: P.pat[v] };
  }
  function restDrum(v) { v = cl(Math.round(v), 0, VOX.length - 1); if (!P.pat[v]) return null; P.pat[v] = 0; recEv({ ev: "rest", v }); S.cut++; A.tok(0, 0.06, VOX[v].x / 6, 300); dirty = true; return true; }

  /* 乐团的总状态：第几站、一天走到第几格、青蛙的档、有没有风在等下一个小节线、是不是正在收 */
  const M = { stn: 0, day: 0, frog: 0, windReq: false, endReq: false, ending: 0, gustT: -99, dewBar: -9, frogT: [-9, -9], winds: 0, ended: 0, frogged: 0 };
  const playing = () => P.pat.some(Boolean) || P.birds.length > 0 || M.frog > 0;
  function callWind() { if (M.ending || M.windReq) return null; M.windReq = true; M.gustT = S.T; M.winds++; S.planted++; recEv({ ev: "wind", day: M.day }); return true; }       // 起风：下一个小节线换站
  function frogCycle() { M.frog = M.frog === 1 ? 2 : 1; M.frogged++; S.planted++; A.frog(STN[M.stn].root, 0.8, 0, 0); M.frogT[0] = S.T; recEv({ ev: "frog", d: M.frog }); return true; }
  function frogOff() { if (!M.frog) return null; M.frog = 0; S.cut++; recEv({ ev: "frog", d: 0 }); return true; }
  function endPiece() { if (M.ending || !(playing() || M.day > 0)) return null; M.endReq = true; S.cut++; recEv({ ev: "end", day: M.day }); return true; }                 // 收：下一个小节线全团落在主音上
  /* 九个座位从左到右：粗竹啄木鸟、细竹啄木鸟、青蛙、中竹啄木鸟、五丛竹的黄鹂。
     「下一档」：啄木鸟 歇→疏→中→密→歇；青蛙 歇→疏→密→歇；黄鹂 没来→低→中→高→飞走。「歇」：直接回到歇 / 飞走。 */
  const FROG_SEAT = 9, FROG_PAN = 0.45, WP_LVL = [12, 5, 15, 25], BIRD_LVL = [5, 16, 27];
  function seatState(c) { if (c === FROG_SEAT) return M.frog; if (c < VOX.length) return P.pat[c]; const b = P.birds.find(o => o.zone === c - VOX.length); return b ? 1 + REG(b.lvl) : 0; }
  function seatName(c) { return c === FROG_SEAT ? "青蛙" : c < VOX.length ? NAME[c] + "啄木鸟" : "黄鹂"; }
  function seatWord(c) { const v = seatState(c); return c === FROG_SEAT ? ["歇", "疏", "密"][v] : c < VOX.length ? DNAME[v] : ["走了", "低", "中", "高"][v]; }
  function stepSeat(c) { if (M.ending) return null; S.planted++; M.acts = (M.acts || 0) + 1;
    if (c === FROG_SEAT) { M.frog = M.frog % 2 + 1; M.frogged++; if (M.frog) { A.frog(STN[M.stn].root, 0.8, 0, FROG_PAN); M.frogT[0] = S.T; } recEv({ ev: "frog", d: M.frog }); return true; }
    if (c < VOX.length) { const d = P.pat[c] % 3 + 1; P.pat[c] = d; P.wpL[c] = WP_LVL[d]; P.patT[c] = S.T; if (d) { A.wood(c, 0, 0.8, 0, VOX[c].x / 6); P.hit[c] = { t: S.T, v: 0.7 }; P.wp[c].peckT = S.T; } dirty = true; recEv({ ev: "drum", v: c, d }); return true; }
    const z = c - VOX.length, v = seatState(c); return invite(z, BIRD_LVL[v % 3]); }
  const mov = () => MOV[Math.min(DAY_LEN - 1, M.day)], bassOf = c => (c === 4 ? 40 : STN[c].root - 12);
  function applyMov() { if (!A.ok) return; const m = mov(), t = A.AC.currentTime; A.send.gain.setTargetAtTime(m.send, t, 0.8); A.tone = m.tone; }
  function setSeat(c, n) { if (M.ending || seatState(c) === (c === FROG_SEAT ? Math.min(n, 2) : n)) return null; S.planted++; M.acts = (M.acts || 0) + 1;
    if (c === FROG_SEAT) { M.frog = Math.min(n, 2); M.frogged++; A.bass(bassOf(M.stn), 0.3, 0.9, 0, FROG_PAN * 0.4); M.frogT[0] = S.T; recEv({ ev: "frog", d: M.frog }); return true; }
    if (c < VOX.length) { P.pat[c] = n; P.wpL[c] = WP_LVL[n]; P.patT[c] = S.T; A.wood(c, 0, 0.8, 0, VOX[c].x / 6); P.hit[c] = { t: S.T, v: 0.7 }; P.wp[c].peckT = S.T; dirty = true; recEv({ ev: "drum", v: c, d: n }); return true; }
    return invite(c - VOX.length, BIRD_LVL[n - 1]); }
  function restSeat(c) { if (!seatState(c)) return null; if (c === FROG_SEAT) return frogOff(); if (c < VOX.length) return restDrum(c); return dismiss(c - VOX.length); }
  function plant(col, lvl, Tnow = S.T) {
    if (CH === 2) return col === SKY ? callWind() : col === POND ? frogCycle() : col >= VOX.length ? invite(col - VOX.length, lvl) : setDrum(col, lvl);
    col = cl(Math.round(col), 0, COLS - 1); lvl = cl(Math.round(lvl), 0, LEVELS.length - 1);
    const here = live().filter(s => s.col === col), same = here.find(s => s.lvl === lvl);
    if (same) { same.age += 3; same.hitT = Tnow; same.hitV = 1; A.strike(LEVELS[lvl], 0.75, 0, same.x / 6); dirty = true; return same; }        // 同一处再种＝浇水，长得更快
    if (here.length >= PER_COL) { A.tok(0, 0.05, xOf(col) / 6, 300); return null; }
    const row = [0, 1, 2].find(r => !here.some(s => s.row === r)), R = rng(col * 97 + lvl * 13 + S.nextId * 7);
    const s = { id: S.nextId++, col, lvl, row, x: xOf(col) + ROWDX[row], z: ROWZ[row], h: hOf(lvl) * (1 - row * 0.02), r: rOf(lvl), seed: R(), birth: Tnow, death: 1e9, age: 0, hitT: Tnow + 0.25, hitV: 0.8, dead: false,
      lf: [0, 1, 2, 3, 4, 5].map(() => [R(), R(), R(), R(), R()]), lfBirth: [Tnow + 0.9, 1e9, 1e9, 1e9, 1e9, 1e9] };
    S.stalks.push(s); S.planted++; A.strike(LEVELS[lvl], 0.75, 0, s.x / 6); dirty = true; return s;
  }
  function cut(col, lvl, Tnow = S.T) {
    if (CH === 2) return col === SKY ? endPiece() : col === POND ? frogOff() : col >= VOX.length ? dismiss(col - VOX.length) : restDrum(col);      // 竹子是乐器，不清除；请走的是演奏员
    const here = live().filter(s => s.col === cl(Math.round(col), 0, COLS - 1)); if (!here.length) return null;
    const s = here.reduce((a, b) => Math.abs(b.lvl - lvl) < Math.abs(a.lvl - lvl) ? b : a); s.dead = true; s.death = Tnow; S.cut++; A.tok(0, 0.16, s.x / 6, 420); A.tok(A.ok ? A.AC.currentTime + 0.09 : 0, 0.08, s.x / 6, 300); dirty = true; return s;
  }
  const LEAF_AGE = [0, 2, 4, 6, 9, 12];
  function rebuild() {
    dirty = false; const n = CH === 2 ? 99 : live().length; let ns = 0, nl = 0;
    S.stalks = S.stalks.filter(s => !s.dead || S.T - s.death < 1.2);
    for (const b of BG) { if (n >= b.thr + 1 && b.birth > 1e8) b.birth = S.T + 0.3 + b.seed * 1.5; if (n < b.thr + 1 && b.birth < 1e8) b.birth = 1e9; }
    const putS = (x, z, r, h, seed, kind, birth, death, hitT, hitV) => { if (ns >= MAXS) return; sBase.array.set([x, z], ns * 2); sDim.array.set([r, h], ns * 2); sMisc.array.set([seed, kind], ns * 2); sLife.array.set([birth, death, hitT, hitV], ns * 4); ns++; };
    const putL = (x, y, z, sz, rot, spr, seed, birth, death) => { if (nl >= MAXL) return; lPos.array.set([x, y, z], nl * 3); lSz.array.set([sz, rot, spr, seed], nl * 4); lLife.array.set([birth, death], nl * 2); nl++; };
    for (const s of S.stalks) { s.slot = ns; putS(s.x, s.z, s.r, s.h, s.seed, 1, s.birth, s.death, s.hitT, s.hitV);
      s.lf.forEach((q, i) => { if (s.age >= LEAF_AGE[i] && s.lfBirth[i] > 1e8) s.lfBirth[i] = S.T; if (s.lfBirth[i] > 1e8) return;
        const a = q[0] * 6.28, d = 0.15 + q[1] * 0.4, y = i === 0 ? s.h * 0.97 : lerp(s.h * 0.45, s.h * 0.92, q[2]);
        putL(s.x + Math.cos(a) * d, y, s.z + Math.sin(a) * d * 0.3 + 0.02, (i === 0 ? 0.55 : 0.5 + q[3] * 0.45) * (0.8 + s.r * 4), (q[4] - .5) * 0.5, Math.floor(q[3] * 4.99), 0.01 + q[4] * 0.98, s.lfBirth[i], s.death); });
      putL(s.x, 0, s.z + 0.04, 0.3 + s.r * 2, 0, 5, 0.01 + s.seed * 0.98, s.birth + 0.5, s.death); }
    if (CH === 2) ZN.forEach((Z, i) => Z.st.forEach((q, j) => { const x = Z.x + q.dx, z = Z.z + q.dz, b0 = 0.5 + i * 0.12 + j * 0.15; putS(x, z, q.r, q.h, q.seed, 0, b0, 1e9, -99, 0);
      putL(x, 0, z + 0.04, 0.5 + q.r * 2, 0, 5, q.seed, b0 + 0.5, 1e9);
      for (let m = 0; m < 3; m++) { const a = (q.seed * 7 + m * 2.1) % 6.28, d = 0.3 + ((q.seed * 13 + m * 0.37) % 1) * 0.5; putL(x + Math.cos(a) * d, q.h * (0.83 + m * 0.06), z + 0.02, 1.3 + q.r * 4, (m - 1) * 0.2, (i + j + m) % 5, (q.seed + m * 0.31) % 1, b0 + 1.2 + m * 0.3, 1e9); } }));
    if (CH === 2) VOX.forEach((V, v) => { P.slot[v] = ns; putS(V.x, V.z, V.r, PILLAR_H, (0.31 + v * 0.17) % 1, 1, 0.15 + v * 0.22, 1e9, P.hit[v].t, P.hit[v].v);
      putL(V.x, 0, V.z + 0.06, 0.5 + V.r * 2, 0, 5, 0.31 + v * 0.1, 0.6 + v * 0.22, 1e9);
      for (let i = 0; i < P.pat[v]; i++) { const sz = 0.95, y = PIL_Y[P.wpL[v]] + 0.75 + i * 0.5, sd = i % 2 ? -1 : 1; putL(V.x + sd * (V.r + 0.336 * sz - 0.03), y, V.z + 0.03, sz, -0.12 * sd, ((v + i) % 3) * 2, 0.05 + i * 0.04, P.patT[v] + i * 0.12, 1e9); } });
    for (const b of BG) { if (b.birth > 1e8) continue; if (CH === 2 && (b.z > -9.5 || (Math.abs(b.x) < 10 && b.z > -26))) continue;   // 台柱前面不留竹；旋律竹丛前后也清空 putS(b.x, b.z, b.r, b.h, b.seed, 0, b.birth, 1e9, -99, 0);
      b.lf.forEach((q, i) => { const a = q[0] * 6.28, d = 0.25 + q[1] * 0.7; putL(b.x + Math.cos(a) * d, lerp(2.2, b.h * 0.9, q[2]), b.z + Math.sin(a) * d * 0.4, 0.8 + q[3] * 0.8, (q[4] - .5) * 0.5, Math.floor(q[3] * 4.99), 0.01 + q[4] * 0.98, b.birth + 0.8 + i * 0.3, 1e9); });
      putL(b.x, 0, b.z + 0.05, 0.4 + b.seed * 0.3, 0, 5, 0.01 + b.seed * 0.98, b.birth + 0.4, 1e9); }
    if (CH === 1 && !n && !S.planted) putL(xOf(7), 0, 0.2, 0.42, 0, 7, 0.4, 0.2, 1e9);                         // 开始只有一棵笋
    sg.instanceCount = ns; lg.instanceCount = nl; for (const a of [sBase, sDim, sMisc, sLife, lPos, lSz, lLife]) a.needsUpdate = true;
  }

  /* ── 拍子：风的锋面每小节从左走到右，走到第几格，那一格的竹就响 ── */
  function sched() {
    if (!A.ok || A.AC.state !== "running") return; const AC = A.AC; if (!S.nextT) { S.nextT = AC.currentTime + 0.1; S.bar0 = S.nextT; S.step = 0; }
    while (S.nextT < AC.currentTime + 0.12) {
      const st = S.step, t = S.nextT, Tat = S.T + (t - AC.currentTime), L = live(); if (st === 0) S.bar0 = t;
      if (CH === 2) { const later = fn => setTimeout(fn, Math.max(0, (t - AC.currentTime) * 1000)), hz = () => (Math.random() - 0.5) * 0.02, vz = v => v * (0.9 + 0.2 * Math.random());      // 每个音错开一点、轻重不完全一样，不那么机械
        if (st === 0) { S.barN++;
          if (M.endReq && !M.ending) { M.endReq = false; M.windReq = false; M.ending = 1; M.stn = 0; A.padSet(STN[0].pad, 0.11, 0.25);                           // 收：全团落在主音上，然后散去
            VOX.forEach((V, v) => { if (P.pat[v]) A.wood(v, 0, 1.2, t, V.x / 6); }); if (M.frog) A.bass(36, 1.2, 1, t, 0);
            P.birds.forEach((b, i) => { const m = 60 + 12 * REG(b.lvl) + STN[0].pcs[i % 3]; A.strike(m, 0.9, t + i * 0.07, b.tx / 6); A.chirp(m + 12, 0.3, t + i * 0.07, b.tx / 6); });
            later(() => { P.pat.fill(0); M.frog = 0; for (let z = 0; z < ZN.length; z++) dismissQuiet(z); dirty = true; M.endT = S.T; A.padSet(STN[0].pad, 0.02, 0.25); recEv({ ev: "ended" }); }); }
          else if (M.windReq && !M.ending) { M.windReq = false; M.day++; M.secBar = S.barN; M.dewBar = S.barN; if (M.day >= DAY_LEN) M.endReq = true; else { applyMov(); VOX.forEach((V, v) => { if (P.pat[v]) A.wood(v, 0, 1.2, t, V.x / 6); }); } recEv({ ev: "station", stn: M.stn, day: M.day }); }
          if (!M.ending) { const m = mov(), ci = m.loop[Math.floor(Math.max(0, S.barN - (M.secBar || 0)) / 2) % m.loop.length]; if (ci !== M.stn || S.barN === (M.secBar || 0)) { M.stn = ci; A.padSet(STN[ci].pad, (playing() ? PAD_ON : PAD_IDLE) * m.pad); } applyMov(); } }       // 两小节换一个和弦
        if (M.ending) { S.step = (S.step + 1) % COLS; S.nextT += STEP; continue; }                                                                         // 收了之后安静，等新的一天
        const mv = mov(), rb = Math.max(0, S.barN - (M.secBar || 0)), odd = rb % 2, on = playing(), chord = STN[M.stn], nextChord = STN[mv.loop[(Math.floor(rb / 2) + 1) % mv.loop.length]];
        /* 啄木鸟：各敲各的小型；起了风、还没到小节线的最后四格，一起敲一个过门 */
        VOX.forEach((V, v) => { if (!P.pat[v]) return; let c = mv.pats[v][P.pat[v] - 1][odd][st]; const fill = M.windReq && st >= 12; if (fill && !c) c = 2; if (!c) return; (G.onDrum || (() => {}))(v, st, c); const ts = t + hz();
          A.wood(v, c - 1, vz((fill ? 0.7 + 0.12 * (st - 12) : 1) * GROOVE.vg[v][c - 1] * mv.en), ts, V.x / 6); if (v === 2) A.shaker(vz((c === 1 ? 1 : 0.5) * mv.en), ts, V.x / 6);
          P.hit[v] = { t: Tat, v: 0.8 }; S.fired++; if (P.slot[v] !== undefined) { sLife.array[P.slot[v] * 4 + 2] = Tat; sLife.array[P.slot[v] * 4 + 3] = 0.8; sLife.needsUpdate = true; }
          later(() => { P.wp[v].peckT = S.T; }); });
        /* 青蛙＝低音：疏＝第 1 拍一个长音，换和弦前先到；密＝再加第 2 拍半的五度，连着响 */
        if (M.frog) { const r = bassOf(M.stn), nr = bassOf(mv.loop[(Math.floor(rb / 2) + 1) % mv.loop.length]), fifth = chord.fifth || 7, hop = () => later(() => { M.frogT[0] = S.T; });
          if (st === 0) { A.bass(r, STEP * 5.2, vz(0.95), t + hz(), FROG_PAN * 0.4); hop(); (G.onFrog || (() => {}))(st, 1); }
          if (st === 6 && M.frog === 2) { A.bass(r + fifth, STEP * 5.2, vz(0.8), t + hz(), FROG_PAN * 0.4); hop(); (G.onFrog || (() => {}))(st, 2); }
          if (st === 12 && (M.frog === 2 || odd)) { A.bass(odd ? nr : r + fifth, STEP * 3.6, vz(0.9), t + hz(), FROG_PAN * 0.4); hop(); (G.onFrog || (() => {}))(st, 1); } }
        /* 林子自己的两层：一声脆响的长型、手碟的切分和弦。有人在演才响，音量跟段落走 */
        if (on && mv.clave && GROOVE.clave[odd][st]) A.snap(vz(0.55 * mv.clave), t + hz(), -0.15);
        if (on && mv.mont && GROOVE.mont[st]) { const k = [0, 1, 2, 1, 0][Math.floor(st / 3) % 5]; A.strike(chord.pad[k % 3] + (st === 6 ? 12 : 0), vz(0.85 * mv.mont), t + hz(), -0.1 + 0.1 * k); }
        /* 黄鹂：四小节一句主句，一小节一格，按来的先后轮流唱；只有一只时唱一小节歇一小节 */
        { const nb = P.birds.length; if (nb) { const b = P.birds[S.barN % Math.max(2, nb)]; if (b) { const cell = mv.hook[rb % 4], k = cell.r.indexOf(st); if (k >= 0) { const d = cell.d[k], midi = 60 + 12 * REG(b.lvl) + 12 * Math.floor(d / 5) + PENT[((d % 5) + 5) % 5], ts = t + hz();
              const bv = (k === 0 ? 1.1 : 0.9) * (midi >= 84 ? 0.6 : midi >= 72 ? 0.8 : 1); A.strike(midi, vz(bv), ts, b.tx / 6); if (k === 0) A.chirp(midi + 12, 0.24, ts, b.tx / 6);
              if (mv.echo) { A.strike(midi, bv * 0.34, ts + 3 * STEP, -b.tx / 6); A.strike(midi, bv * 0.14, ts + 6 * STEP, b.tx / 6); }                       // 夜：回声
              S.sung = (S.sung || 0) + 1; (G.onSing || (() => {}))(P.birds.indexOf(b), st, midi); later(() => { b.singT = S.T; }); } } } }
        if (mv.cricket && st % 4 === 2 && dewR() < 0.75) A.cricket(0.6 + 0.4 * dewR(), t, st % 8 === 2 ? -0.7 : 0.75);                                     // 夜：虫声
        /* 露水：平时偶尔一滴，风过之后的两小节多一些 */
        { const wet = S.barN - M.dewBar < 2, r = dewR(); if (r < (wet ? 0.22 : mv.dew) && st % 2 === 0) { const idx = Math.floor(dewR() * 10); A.drop(84 + 12 * Math.floor(idx / 5) + PENT[idx % 5], wet ? 0.9 : 0.6, t, dewR() * 1.6 - 0.8); M.dewT = Tat; } }
      }
      const here = L.filter(s => s.col === st && Tat - s.birth > 0.4);
      for (const s of here) { A.strike(LEVELS[s.lvl], 0.5 + 0.12 * Math.min(4, s.age / 3), t, s.x / 6); s.hitT = Tat; s.hitV = 0.9; s.age++; if (LEAF_AGE.includes(s.age)) dirty = true; if (s.slot !== undefined) { sLife.array[s.slot * 4 + 2] = Tat; sLife.array[s.slot * 4 + 3] = 0.9; sLife.needsUpdate = true; } S.fired++; }
      /* 鸟：在你留空的格子里，挑一个你种过的音，高八度应一声 */
      if (bird.on && bird.perch && !here.length && L.length && st % 2 === 0) { const R = rng(st * 31 + Math.floor(t / BAR) * 7 + L.length); if (R() < 0.45) { const s = L[Math.floor(R() * L.length)]; A.chirp(LEVELS[s.lvl] + 12, 0.8, t, bird.x / 6); setTimeout(() => { bird.hop = S.T; }, Math.max(0, (t - AC.currentTime) * 1000)); } }
      /* 啄木鸟：3-3-4-2-4 */
      if (peck.on && peck.perch && [0, 3, 6, 10, 12].includes(st)) { A.tok(t, st === 0 ? 0.09 : 0.06, peck.x / 6); setTimeout(() => { peck.t = S.T; }, Math.max(0, (t - AC.currentTime) * 1000)); }
      S.nextT += STEP; S.step = (st + 1) % COLS;
    }
  }
  setInterval(sched, 25);

  /* ── 手 ── */
  const D = (a, b) => Math.hypot((a.x - b.x) * 4 / 3, a.y - b.y);
  let colSX = [], lvlSY = [], lvlSYc = [], lvlSXc = [];
  function layout() {
    const w = innerWidth, h = innerHeight; renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5)); renderer.setSize(w, h, false); camera.aspect = w / h;
    const th = Math.tan(FOV * Math.PI / 360), dist = Math.max(8.2, 6.2 / (th * camera.aspect)); camera.position.set(0, 2.5, dist); camera.lookAt(0, 3.3, 0); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    const v = new THREE.Vector3(); colSX = []; lvlSY = [];
    if (CH === 2) { const hw = z => th * camera.aspect * (dist - z); VOX.forEach((V, i) => { V.x = (SF_VOX[i] - 0.5) * 2 * hw(V.z); }); ZN.forEach((Z, i) => { Z.x = (SF_ZN[i] - 0.5) * 2 * hw(Z.z); }); P.birds.forEach(perch); dirty = true;
      lvlSXc = []; lvlSYc = VOX.map(V => { v.set(V.x, 3, V.z).project(camera); colSX.push(v.x * 0.5 + 0.5); const a = [], bx = []; for (let k = 0; k < PIL_Y.length; k++) { v.set(V.x, PIL_Y[k], V.z).project(camera); a.push(0.5 - v.y * 0.5); bx.push(v.x * 0.5 + 0.5); } lvlSXc.push(bx); return a; }); for (const Z of ZN) { v.set(Z.x, 3, Z.z).project(camera); colSX.push(v.x * 0.5 + 0.5); lvlSXc.push(PERCH_Y.map(y => { v.set(Z.x, y + 0.2, Z.z).project(camera); return v.x * 0.5 + 0.5; })); lvlSYc.push(PERCH_Y.map(y => { v.set(Z.x, y + 0.2, Z.z).project(camera); return 0.5 - v.y * 0.5; })); } colSX.push(SF_FROG); lvlSXc[SKY] = [0.5]; lvlSYc[SKY] = [0.065]; lvlSXc[POND] = [0.5]; lvlSYc[POND] = [0.80]; lvlSY = lvlSYc[0]; return; }   // 远近不同，每根竹的竹节在屏幕上的高度各算各的
    for (let c = 0; c < COLS; c++) { v.set(xOf(c), 3, 0).project(camera); colSX.push(v.x * 0.5 + 0.5); }
    for (let L = 0; L < LEVELS.length; L++) { v.set(0, hOf(L), 0).project(camera); lvlSY.push(0.5 - v.y * 0.5); }
  }
  addEventListener("resize", layout); layout();
  const xAt = (c, py) => { const ys = lvlSYc[c], xs = lvlSXc[c], n = ys.length - 1, t = (py - ys[0]) / (ys[n] - ys[0] || 1); return xs[0] + (xs[n] - xs[0]) * cl(t, -0.3, 1.3); };   // 这根竹在手这个高度上的横向位置
  const pickCol = (px, py, prev) => { let b = 0, bd = 1e9; for (let c = 0; c < colSX.length; c++) { const d = Math.abs(xAt(c, py) - px); if (d < bd) { bd = d; b = c; } }
    if (prev != null && prev !== b && lvlSYc[prev] && Math.abs(xAt(prev, py) - px) < bd + STICK) return prev; return b; };                 // 吸上了就不轻易换：别的目标要近出一截才换过去
  const pickTarget = (px, py, prev) => { const pad = 0.025;
    if (py < SKY_Y - (prev === SKY ? -pad : pad)) return SKY; const inPond = px > POND_X[0] && px < POND_X[1];
    if (inPond && py > POND_Y + (prev === POND ? -pad : pad)) return POND;
    return pickCol(px, py, prev != null && prev < colSX.length ? prev : null); };
  const nearest = (arr, v, prev, hyst) => { let b = 0, bd = 1e9; arr.forEach((a, i) => { const d = Math.abs(a - v); if (d < bd) { bd = d; b = i; } }); if (prev != null && prev !== b && arr[prev] !== undefined) { const step = Math.abs(arr[1] - arr[0]); if (Math.abs(arr[prev] - v) < Math.abs(arr[b] - v) + step * hyst) return prev; } return b; };
  /* 一只手一帧：位置 → 落在哪一格、多高；捏合 → 种；握拳 → 砍。种和砍互斥：另外三指张着才认捏合，蜷着才认拳 */
  /* 第二章的手势规矩（按优先级从高到低）：
     0 先过门槛：手出现满 0.25 秒、手腕指根和拇指食指都在画面里，才认动作；手刚进来、正在出去、贴着画面边，只显示圈，不做事。
     1 握拳并保持 0.8 秒＝请走旋律鸟（只在有鸟的竹丛上有用；竹子是乐器，不清除）。只有「先张着手停在这个目标上，再原地握拳」才开始计时；圈会缩小给你看，中途张开、或手挪开超过画面的 5% 就作废。
       蜷着手进来、放下手时顺势蜷起来，都不算。
     2 捏一下＝点亮竹节 / 请鸟。另外三指要张着；手要在这个目标上停稳（0.12 秒）且不在快速移动；一次捏合只算一次，松开才能再捏。
     3 其余时间＝指：圈跟着手走。 */
  const HOLD_MS = 800, sayEl = (() => { const e = document.createElement("div"); e.style.cssText = "position:fixed;z-index:20;pointer-events:none;transform:translate(-50%,-50%);font-size:13px;letter-spacing:.08em;color:#EDF1E8;background:rgba(22,40,28,.72);padding:4px 12px;border-radius:999px;opacity:0;transition:opacity .4s;white-space:nowrap"; document.body.appendChild(e); return e; })();
  let sayT = 0; const say = (txt, col, lvl) => { const sx = (lvlSXc[col] || [])[lvl] ?? 0.5, sy = (lvlSYc[col] || [])[lvl] ?? 0.5; sayEl.textContent = txt; sayEl.style.left = (sx * 100) + "vw"; sayEl.style.top = Math.max(6, sy * 100 - 7) + "vh"; sayEl.style.opacity = 1; clearTimeout(sayT); sayT = setTimeout(() => { sayEl.style.opacity = 0; }, 1600); S.said = txt; };
  const NAME = ["粗竹", "细竹", "小竹", "中竹"];
  /* v25 的手势规矩，全部建在真实录像量出来稳的三样东西上：手的左右位置、张手还是握拳、握了多久。
     （2026-11-19 的真实练习记录：捏合值在 213 秒里穿过门槛 328 次，张着的手本来就停在门槛附近，所以捏不能用；
       张手 / 握拳两种状态之间几乎没有中间值；指点位置从没到过屏幕上方 30%，所以也不能靠举高举低来选。）
     张手＝指，光柱跟着手左右走。握一下（0.2 秒起算）＝这个座位下一档。握住不放 1.2 秒＝这个座位歇。
     两只手一起握一下＝起风。两只手一起握住 1.5 秒＝收。 */
  const GRAB_MS = 200, REST_MS = 2000, END_MS = 2800, PAIR_MS = 200;
  const pickSeat = (px, prev) => { let b = 0, bd = 9; for (let c = 0; c < colSX.length; c++) { const d = Math.abs(colSX[c] - px); if (d < bd) { bd = d; b = c; } } if (prev != null && prev !== b && prev < colSX.length && Math.abs(colSX[prev] - px) < bd + STICK) return prev; return b; };
  /* 一个手形只管一件事，而且是「设成」不是「下一个」，所以保持手形不会连着触发：
       张手＝选择　伸 1 / 2 / 3 根手指（从食指起）＝这个座位演 疏 / 中 / 密　握拳＝请走　两只手同时握拳＝起风。
     手形要连续认到 NUM_MS 才生效（手指一根根收放时会路过别的数，路过不算）；座位在手形开始变的那一刻锁住。 */
  /* 手形只看食指、中指、无名指；小指只用来分「三根」和「张手」。真实操作里比「一根」时小指常常松着半伸（11-21 的记录：小指读数 1.0–1.3），
     要求小指也收紧会让整只手落进「认不清」。伸＝指尖到手腕 ÷ 第二指节到手腕 > 1.10，收＝< 1.00（记录里收的最高 0.93，伸的最低 1.13）。 */
  const PAD_ON = 0.035, PAD_IDLE = 0.015;      // v42：垫底长音降一半（原 0.07 / 0.03），开头不再嗡嗡
const NUM_MS = 300, EXT = 1.10, CUR = 1.00, PINKY3 = 1.12;
  function poseOf(lm) { const Dq = (a, b) => Math.hypot(lm[a].x - lm[b].x, lm[a].y - lm[b].y), r = (t, p) => Dq(t, 0) / Math.max(1e-6, Dq(p, 0)), i = r(8, 6), m = r(12, 10), g = r(16, 14), k = r(20, 18), e = v => v > EXT, c = v => v < CUR;
    if (c(i) && c(m) && c(g)) return "fist"; if (e(i) && c(m) && c(g)) return "1"; if (e(i) && e(m) && c(g)) return "2"; if (e(i) && e(m) && e(g)) return k < PINKY3 ? "3" : "open"; return "?"; }
  function gesture3(h, lm, nowMs, others) {
    if (h.born == null) { h.born = nowMs; h.px0 = h.sx; h.t0 = nowMs; h.sp = 0; h.fist = false; h.pose = "open"; h.raw = "open"; h.rawT = nowMs; }
    const dtm = Math.max(1, nowMs - h.t0); if (dtm >= 30) { h.sp = lerp(h.sp, Math.abs(h.sx - h.px0) / (dtm / 1000), 0.4); h.px0 = h.sx; h.t0 = nowMs; }
    let inside = 0; for (const q of lm) if (q.x > 0 && q.x < 1 && q.y > 0 && q.y < 1) inside++; const ok = nowMs - h.born > 250 && inside >= 14; h.ok = ok;
    const raw = poseOf(lm); if (raw !== h.raw) { h.raw = raw; h.rawT = nowMs; } h.unsure = raw === "?" && nowMs - h.rawT > 500;      // 手指认不清超过半秒（多半是指尖被挡住或出了画面）
    if (h.pose === "open" && raw === "open") h.col = pickSeat(h.sx, h.col); h.lvl = 0; h.pin = false; h.fistP = 0;
    const d = nowMs - h.rawT; h.prog = raw !== h.pose && raw !== "?" && raw !== "open" && ok ? cl(d / (raw === "fist" ? GRAB_MS : NUM_MS), 0, 1) : 0; h.cand = raw;
    if (raw === h.pose || raw === "?" || !ok) return;
    if (raw === "open") { if (d >= 80) { h.pose = "open"; h.fist = false; h.g = null; } return; }
    if (raw === "fist") { const mate = others.find(o => o !== h && o.raw === "fist" && o.ok && Math.abs(o.rawT - h.rawT) < PAIR_MS), two = others.some(o => o !== h && o.ok);
      if (d < (two && !mate ? PAIR_MS + 60 : GRAB_MS)) return; h.pose = "fist"; h.fist = true; h.pin = true;
      if (mate) { h.g = { wind: true }; if (!(mate.g && mate.g.wind && mate.pose === "fist")) { if (callWind()) sayAt("起风" + ((M.day + 1) % PH === 0 && M.day + 1 < DAY_LEN ? " · " + PHASE[(M.day + 1) / PH] : ""), 0.5, 0.16); } }
      else { h.g = null; if (restSeat(h.col)) sayAt(seatName(h.col) + " · " + seatWord(h.col), colSX[h.col], 0.30); } return; }
    if (d >= NUM_MS) { h.pose = raw; h.fist = false; h.g = null; h.pin = true; if (setSeat(h.col, +raw)) sayAt(seatName(h.col) + " · " + seatWord(h.col), colSX[h.col], 0.30); }
  }
  const sayAt = (txt, sx, sy) => { sayEl.textContent = txt; sayEl.style.left = (sx * 100) + "vw"; sayEl.style.top = (sy * 100) + "vh"; sayEl.style.opacity = 1; clearTimeout(sayT); sayT = setTimeout(() => { sayEl.style.opacity = 0; }, 1600); S.said = txt; };
  function gesture2(h, lm, nowMs) {
    if (h.born == null) { h.born = nowMs; h.keyT = h.colT = nowMs; h.px0 = h.sx; h.py0 = h.sy; h.t0 = nowMs; h.sp = 0; }
    const dtm = Math.max(1, nowMs - h.t0); if (dtm >= 30) { h.sp = lerp(h.sp, Math.hypot(h.sx - h.px0, h.sy - h.py0) / (dtm / 1000), 0.5); h.px0 = h.sx; h.py0 = h.sy; h.t0 = nowMs; }   // 手的移动速度：画面宽 / 秒
    let edge = false; for (const j of [0, 4, 5, 8, 9]) { const q = lm[j]; if (q.x < 0.005 || q.x > 0.995 || q.y < 0.005 || q.y > 0.995) { edge = true; break; } }   // 手腕、指根、拇指食指尖要在画面里；小指那边出去一点不碍事
    const ok = nowMs - h.born > 250 && !edge && !h.off; h.ok = ok;
    const key = "c" + h.col; if (key !== h.key) { if (h.key != null && nowMs - h.keyT >= 120 && !h.pin) { h.dCol = h.kCol; h.dLvl = h.kLvl; h.dEnd = nowMs; } h.key = key; h.keyT = nowMs; h.kCol = h.col; h.kLvl = h.lvl; } if (h.col !== h.pcol) { h.pcol = h.col; h.colT = nowMs; h.lq = []; }
    if (ok && h.o3 > OPEN3 && nowMs - h.colT > 250) { h.armCol = h.col; h.openT = nowMs; }                 // 张着手在这个目标上停过
    const wantFist = h.fist ? (h.o3 < 1.0) : (h.o3 < FIST3 && h.idx < FIST_IDX);
    if (wantFist === h.fist) h.fT = null; else { if (h.fT == null) h.fT = nowMs; if (nowMs - h.fT >= 100) { h.fT = null; h.fist = wantFist; h.pin = false;
      h.hold = wantFist && ok && (h.col === SKY ? (playing() || M.day > 0) && !M.ending : h.col === POND ? M.frog > 0 : h.col >= VOX.length ? P.birds.some(b => b.zone === h.col - VOX.length) : P.pat[h.col] > 0) && h.armCol === h.col && nowMs - (h.openT ?? -1e9) < 700 ? { col: h.col, lvl: h.lvl, t0: nowMs, sx: h.sx, sy: h.sy } : null; } }
    h.fistP = 0; if (h.fist && h.hold) { if (!ok || h.col !== h.hold.col || Math.hypot(h.sx - h.hold.sx, h.sy - h.hold.sy) > 0.05) h.hold = null; else { h.fistP = (nowMs - h.hold.t0) / HOLD_MS;
      if (h.fistP >= 1) { const c = h.hold.col, r = cut(c, h.hold.lvl); h.did = r ? "cut" : null; if (r) say(c === SKY ? "收" : c === POND ? "青蛙歇了" : c >= VOX.length ? "请走一只鸟" : "请走" + NAME[c] + "的啄木鸟", c, h.hold.lvl); h.hold = null; h.fistP = 0; } } }
    const wantPin = !h.fist && h.o3 > OPEN3 && (h.pin ? h.pinch < PINCH_OFF : h.pinch < PINCH_ON);
    if (!h.pin && h.pinch > 0.55) { (h.lq || (h.lq = [])).push([nowMs, h.lvl]); while (h.lq.length > 1 && nowMs - h.lq[0][0] > 400) h.lq.shift(); } h.lvlWas = h.lvl; if (h.lq && h.lq.length) { const tl = h.lq[h.lq.length - 1][0] - 180; let e = h.lq[0]; for (const q of h.lq) if (q[0] <= tl) e = q; h.lvlWas = e[1]; }   // 取手指开始合拢前约 0.2 秒的高度   // 手指还张着时的高度
    if (wantPin === h.pin) h.pT = null; else { if (h.pT == null) h.pT = nowMs; if (nowMs - h.pT >= 50) { h.pT = null; h.pin = wantPin;
      if (wantPin) { const was0 = S.lastDrum; const here = nowMs - h.keyT >= 120, was = !here && h.dEnd != null && nowMs - h.dEnd < 300, go = ok && h.sp < 0.5 && (here || was), tc = here ? h.col : h.dCol, tl = here ? (h.lvlWas ?? h.lvl) : h.dLvl; h.did = go && plant(tc, tl) ? "plant" : null; if (h.did && tc === SKY) say("起风 · " + STN[(M.stn + 1) % STN.length].name, tc, 0); else if (h.did && tc === POND) say("青蛙 · " + DNAME[M.frog], tc, 0); else if (h.did && tc < VOX.length && S.lastDrum) say(NAME[tc] + " · " + DNAME[S.lastDrum[1]], tc, tl); if (!go) recEv({ ev: "pinch-ignored", ok, sp: +h.sp.toFixed(2), dwell: Math.round(nowMs - h.keyT), age: Math.round(nowMs - h.born), col: h.col }); } } }
  }
  /* 手指的是哪里：第一章用手心；第二章用「食指根再往前伸一点」，离捏合的两指更近，手落在哪儿就指哪儿。
     真手录像量过：捏的瞬间这个点横向动 0.9%、纵向 1.0%（中位），拇指食指指尖的中点会动 2–3%，所以不用指尖。 */
  function pointOf(lm) { if (CH !== 2) { let px = 0, py = 0; for (const j of [0, 5, 9, 13, 17]) { px += lm[j].x; py += lm[j].y; } return { x: 1 - px / 5, y: py / 5 }; }
    const bx = lm[5].x + 0.3 * (lm[5].x - lm[0].x), by = lm[5].y + 0.3 * (lm[5].y - lm[0].y);
    return { x: cl(0.5 + (0.5 - bx) * CAM_GX, 0, 1), y: cl(by * CAM_GY + CAM_OY, 0, 1) }; }
  const dots = CH === 2 ? [0, 1].map(() => { const e = document.createElement("div"); e.style.cssText = "position:fixed;z-index:19;pointer-events:none;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;background:#16281C;opacity:0;transition:opacity .25s"; document.body.appendChild(e); return e; }) : [];   // 小墨点：系统认为你的手在这里
  /* 叠在林子上的一张画——让人看得出「是手在指挥」：
     · 每只手一道光，从上照下来，跟着手左右移动（连续地跟，不是一格一格跳）；握拳时光收窄变亮，握住时一圈进度。
     · 手一动，那一片竹子跟着晃（在画面循环里做）。
     · 最前面正中是指挥的谱台：左边是活的总谱（谁在演、敲在哪几格、现在走到哪一格），右边是手势说明，两只手此刻被认成什么会亮起来。
     · 青蛙蹲在它那根竹子脚下的水洼里；起风时天上几道风线；夜里的萤火虫。 */
  const hc = CH === 2 ? (() => { const c = document.createElement("canvas"); c.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;z-index:18;pointer-events:none"; document.body.appendChild(c); const g = $("wg-grain"); if (g) g.style.zIndex = 19; return c; })() : null;
  const FLY = Array.from({ length: 18 }, (_, i) => ({ p: i * 2.4, q: i * 1.7, s: 0.6 + (i % 5) * 0.12 })), BEAM = [{ x: 0.3, a: 0, w: 1 }, { x: 0.7, a: 0, w: 1 }];
  let nightK = 0;
  function drawHands(dt) {
    if (!hc) return; const W = innerWidth, H = innerHeight, dpr = Math.min(devicePixelRatio || 1, 2); if (hc.width !== Math.round(W * dpr)) { hc.width = Math.round(W * dpr); hc.height = Math.round(H * dpr); }
    const c = hc.getContext("2d"), T = S.T, nt = nightK > 0.5; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H); c.lineCap = "round"; c.lineJoin = "round";
    const ink = nt ? "#DCE6D8" : "#16281C", inkA = a => nt ? `rgba(220,230,216,${a})` : `rgba(22,40,28,${a})`, curs = S.hands.length ? S.hands : (S.mouse && performance.now() - (S.mouse.t || 0) < 2500 ? [S.mouse] : []);
    /* 手的光：左半边的手用第一道，右半边的用第二道 */
    const hs = [null, null]; for (const h of curs) { if (h.sx == null) continue; let i = h.sx < 0.5 ? 0 : 1; if (hs[i]) i = 1 - i; if (!hs[i]) hs[i] = h; }
    BEAM.forEach((B, i) => { const h = hs[i]; if (h) { B.x += (h.sx - B.x) * Math.min(1, dt * 14); B.w += ((h.pose && h.pose !== "open" ? 0.5 : 1) - B.w) * Math.min(1, dt * 12); } B.a += ((h ? (h.ok === false ? 0.35 : 1) : 0) - B.a) * Math.min(1, dt * (h ? 10 : 4)); B.h = h; });
    const dim = Math.max(BEAM[0].a, BEAM[1].a) * (nt ? 0.22 : 0.17); if (dim > 0.004) { c.fillStyle = nt ? `rgba(4,12,10,${dim})` : `rgba(30,52,38,${dim})`; c.fillRect(0, 0, W, H); }          // 有手在：整个台子暗一点，手指着的地方亮
    const shaft = (x, hw) => { c.beginPath(); c.moveTo(x - hw * 0.5, 0); c.lineTo(x + hw * 0.5, 0); c.lineTo(x + hw, H * 0.775); c.lineTo(x - hw, H * 0.775); c.closePath(); c.fill(); c.beginPath(); c.ellipse(x, H * 0.775, hw, H * 0.02, 0, 0, 7); c.fill(); };
    for (const B of BEAM) { if (B.a < 0.01) continue; const x = B.x * W, hw = W * 0.05 * B.w, h = B.h, g = c.createLinearGradient(x - hw, 0, x + hw, 0), g2 = c.createLinearGradient(x - hw, 0, x + hw, 0), k = (h && h.pose && h.pose !== "open" ? 0.34 : 0.17) * B.a * (nt ? 0.6 : 1);
      g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.3, `rgba(0,0,0,${B.a})`); g.addColorStop(0.7, `rgba(0,0,0,${B.a})`); g.addColorStop(1, "rgba(0,0,0,0)"); c.globalCompositeOperation = "destination-out"; c.fillStyle = g; shaft(x, hw); c.globalCompositeOperation = "source-over";
      g2.addColorStop(0, "rgba(255,253,236,0)"); g2.addColorStop(0.5, `rgba(255,253,236,${k})`); g2.addColorStop(1, "rgba(255,253,236,0)"); c.fillStyle = g2; shaft(x, hw);
      c.strokeStyle = inkA(0.3 * B.a); c.lineWidth = 1.2; c.beginPath(); c.ellipse(x, H * 0.775, hw, H * 0.02, 0, 0, 7); c.stroke();
      if (h && h.prog > 0) { c.strokeStyle = inkA(0.85); c.lineWidth = 3; c.beginPath(); c.ellipse(x, H * 0.775, hw, H * 0.02, 0, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * h.prog); c.stroke(); } }                 // 握住的进度：地上那圈光走满一圈
    /* 手怎么入镜（可选，默认不出；右上角「手」或按 S 轮换）：1 线条　2 蝶（一只）　3 群蝶（五个指尖各一只，夜里换成萤火虫）。
       群蝶：伸出的那根手指对应的那只大、高、扇得快；收起的小、合翅、聚在掌心——大小差出了远近。
       蝶：一只手就是一只蝴蝶，停在那只手的光里。张手＝扇着翅膀飞；伸 1 / 2 / 3 根手指＝翅膀摊开停住，每边翅上亮 1 / 2 / 3 个斑（和座位脚下的小点是同一套记号）；握拳＝合翅。
       触须和眼睛只管“活”，不承担信息。 */
    if (S.skel) { const BONES = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [5, 9, 10, 11, 12], [9, 13, 14, 15, 16], [13, 17, 18, 19, 20], [0, 17]], AR = 4 / 3;
      const perfY = q => { if (q == null) return null; if (q === FROG_SEAT) return M.frog ? 0.84 : null; if (q < VOX.length) return P.pat[q] && lvlSYc[q] ? lvlSYc[q][P.wpL[q]] : null; const b = P.birds.find(o => o.zone === q - VOX.length); return b && lvlSYc[q] ? lvlSYc[q][b.lvl] : null; };
      for (const h of curs) { if (!h || h === S.mouse || !h.lm) continue; { const py = perfY(h.col), ty = H * (py == null ? 0.46 : py >= 0.46 ? cl(py - 0.2, 0.24, 0.46) : cl(py + 0.2, 0.46, 0.66)); h.gy = h.gy == null ? ty : h.gy + (ty - h.gy) * Math.min(1, dt * 3); }      // 乐手在高处，蝴蝶就待在低处，反过来也一样
        const lm = h.lm, pl = Math.hypot((lm[9].x - lm[0].x) * AR, lm[9].y - lm[0].y) || 1e-6, act = h.pose && h.pose !== "open", cx = h.sx * W;
        if (S.skel === 1) { const k = H * 0.085 / pl, cy = H * 0.5, P = i => [cx - (lm[i].x - lm[9].x) * AR * k, cy + (lm[i].y - lm[9].y) * k]; c.strokeStyle = inkA(act ? 0.9 : 0.5); c.fillStyle = inkA(act ? 0.95 : 0.6); c.lineWidth = act ? 1.8 : 1.3;
          for (const b of BONES) { c.beginPath(); b.forEach((i, n) => { const q = P(i); n ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); }); c.stroke(); }
          for (let i = 0; i < 21; i++) { const q = P(i); c.beginPath(); c.arc(q[0], q[1], [4, 8, 12, 16, 20].includes(i) ? 2.6 : 1.6, 0, 7); c.fill(); } }
        else if (S.skel === 2) { const n = h.pose === "1" ? 1 : h.pose === "2" ? 2 : h.pose === "3" ? 3 : 0, fist = h.pose === "fist", cn = h.cand === "1" ? 1 : h.cand === "2" ? 2 : h.cand === "3" ? 3 : 0; if (!h.wA) { h.wA = [0, 0, 0]; h.bx = cx; h.bo = 0.8; }
          h.bx += (cx - h.bx) * Math.min(1, dt * 9); const lean = cl((cx - h.bx) / (W * 0.03), -1, 1) * 0.45, want = fist ? 0.1 : n ? 0.97 + 0.03 * Math.sin(T * 3) : 0.5 + 0.5 * Math.abs(Math.sin(T * 5.5 + h.bx * 0.01)); h.bo += (want - h.bo) * Math.min(1, dt * (n || fist ? 10 : 30));
          for (let q = 0; q < 3; q++) h.wA[q] += ((q < n ? 1 : q < cn ? 0.45 * (h.prog || 0) : 0) - h.wA[q]) * Math.min(1, dt * 9);
          const r = H * 0.036, x = h.bx, y = h.gy - H * 0.04 + Math.sin(T * 1.7 + h.bx * 0.02) * H * 0.008 + (fist ? H * 0.012 : 0), fl = h.bo, wingA = nt ? "#DCEBD2" : "#FBF4DC", wingB = nt ? "#B9D2B8" : "#F1E3B4", ink2 = nt ? "rgba(8,20,16,.9)" : "rgba(22,40,28,.9)";
          if (nt) { const g = c.createRadialGradient(x, y, 0, x, y, r * 2.4); g.addColorStop(0, "rgba(220,240,200,.28)"); g.addColorStop(1, "rgba(220,240,200,0)"); c.fillStyle = g; c.beginPath(); c.arc(x, y, r * 2.4, 0, 7); c.fill(); }
          c.save(); c.translate(x, y); c.rotate(lean); c.lineJoin = "round"; c.strokeStyle = ink2; c.lineWidth = 1.2;
          for (const sd of [-1, 1]) { const X = v => sd * r * v * fl;
            c.fillStyle = wingB; c.beginPath(); c.moveTo(0, r * 0.05); c.bezierCurveTo(X(0.95), r * 0.1, X(1.15), r * 0.95, X(0.52), r * 1.02); c.bezierCurveTo(X(0.2), r * 0.95, X(0.02), r * 0.55, 0, r * 0.22); c.closePath(); c.fill(); c.stroke();          // 后翅
            c.fillStyle = wingA; c.beginPath(); c.moveTo(0, -r * 0.12); c.bezierCurveTo(X(0.45), -r * 1.3, X(1.5), -r * 1.05, X(1.2), -r * 0.1); c.bezierCurveTo(X(0.95), r * 0.22, X(0.3), r * 0.16, 0, r * 0.08); c.closePath(); c.fill(); c.stroke();         // 前翅
            [[0.78, -0.52], [0.56, 0.52], [0.46, -0.9]].forEach(([px, py], q) => { const a = h.wA[q]; if (a < 0.03) return; c.fillStyle = nt ? `rgba(8,20,16,${0.9 * a})` : `rgba(22,40,28,${0.9 * a})`; c.beginPath(); c.ellipse(X(px), r * py, r * 0.14 * Math.max(0.25, fl) * (0.6 + 0.4 * a), r * 0.14 * (0.6 + 0.4 * a), 0, 0, 7); c.fill(); }); }           // 翅上的斑：几根手指几个
          c.fillStyle = ink2; c.beginPath(); c.ellipse(0, r * 0.08, r * 0.085, r * 0.56, 0, 0, 7); c.fill(); c.beginPath(); c.arc(0, -r * 0.56, r * 0.13, 0, 7); c.fill();                                           // 身子和头
          c.fillStyle = nt ? "#DCEBD2" : "#FBF4DC"; for (const sd of [-1, 1]) { c.beginPath(); c.arc(sd * r * 0.065, -r * 0.6, r * 0.035, 0, 7); c.fill(); }                                                // 眼睛
          c.lineWidth = 1; for (const sd of [-1, 1]) { const sw = Math.sin(T * 2.4 + sd) * 0.05; c.beginPath(); c.moveTo(sd * r * 0.05, -r * 0.66); c.quadraticCurveTo(sd * r * (0.2 + sw), -r * 1.05, sd * r * (0.4 + sw), -r * 1.22); c.stroke(); c.beginPath(); c.arc(sd * r * (0.4 + sw), -r * 1.22, 1.3, 0, 7); c.fill(); }   // 触须
          c.restore(); }
        else { const k = H * 0.1 / pl, cy = h.gy, P = i => [cx - (lm[i].x - lm[9].x) * AR * k, cy + (lm[i].y - lm[9].y) * k], Dq = (a, b) => Math.hypot(lm[a].x - lm[b].x, lm[a].y - lm[b].y), kind = nt ? 2 : 0;   // 五个指尖各一只：白天到暮是蝴蝶，夜是萤火虫
          [[8, 6], [12, 10], [16, 14], [20, 18], [4, 2]].forEach(([tip, pip], f) => { const ext = f < 4 ? Dq(tip, 0) / Math.max(1e-6, Dq(pip, 0)) > 1.1 : false, q = P(tip), wob = Math.sin(T * 2.3 + f * 1.7 + cx * 0.01) * H * 0.004, x = q[0] + wob, y = q[1] + Math.cos(T * 1.9 + f) * H * 0.004 - (ext ? H * 0.012 : 0), a = ext ? 1 : 0.55;
            if (kind === 2) { const r = H * (ext ? 0.02 : 0.009), g = c.createRadialGradient(x, y, 0, x, y, r), fa = ext ? 1 : 0.4; g.addColorStop(0, `rgba(240,248,180,${0.95 * fa})`); g.addColorStop(0.35, `rgba(214,236,150,${0.4 * fa})`); g.addColorStop(1, "rgba(214,236,150,0)"); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); return; }
            const r = H * (ext ? 0.017 : 0.0095), tilt = Math.sin(f * 2.1 + 0.6) * 0.5, flap = ext ? 0.35 + 0.65 * Math.abs(Math.sin(T * 7.5 + f * 1.3)) : 0.3 + 0.1 * Math.sin(T * 2 + f); c.save(); c.translate(x, y); c.rotate(tilt); c.globalAlpha = a; c.lineWidth = 1.1; c.strokeStyle = "rgba(22,40,28,.8)";
            if (kind === 0) { c.fillStyle = ["#FFF3B8", "#FFFDF0", "#FFE7A6", "#FFFDF0", "#FFF3B8"][f];                                       // 蝴蝶：两对翅，扇动＝左右收窄；伸出的那根翅张得开、扇得快
              for (const sd of [-1, 1]) { c.beginPath(); c.ellipse(sd * r * 0.5 * flap, -r * 0.28, r * 0.52 * flap, r * 0.62, sd * 0.35, 0, 7); c.fill(); c.stroke(); c.beginPath(); c.ellipse(sd * r * 0.4 * flap, r * 0.4, r * 0.38 * flap, r * 0.42, -sd * 0.3, 0, 7); c.fill(); c.stroke(); }
              c.strokeStyle = "rgba(22,40,28,.95)"; c.lineWidth = 1.6; c.beginPath(); c.moveTo(0, -r * 0.55); c.lineTo(0, r * 0.6); c.stroke(); c.lineWidth = 0.9; c.beginPath(); c.moveTo(0, -r * 0.55); c.lineTo(-r * 0.25, -r * 0.95); c.moveTo(0, -r * 0.55); c.lineTo(r * 0.25, -r * 0.95); c.stroke(); }
            c.restore(); }); } } }
    /* 青蛙：蹲在它那根竹子脚下的小水洼里 */
    { const fx = (colSX[FROG_SEAT] ?? SF_FROG) * W, py = H * 0.845, k = Math.max(0, 1 - (T - M.frogT[0]) * 3.2), fs = H * 0.022 * (1 + 0.1 * k), fy = py - fs * 0.45 - k * H * 0.006, on = M.frog > 0;
      c.fillStyle = nt ? "rgba(190,214,196,.20)" : "rgba(244,247,240,.6)"; c.beginPath(); c.ellipse(fx, py, W * 0.045, H * 0.02, 0, 0, 7); c.fill();
      if (k > 0.02) { c.strokeStyle = inkA(0.25); c.lineWidth = 1.4; c.beginPath(); c.ellipse(fx, py, fs * (2 + 3 * (1 - k)), fs * (0.5 + 0.8 * (1 - k)), 0, 0, 7); c.stroke(); }
      c.globalAlpha = on ? 1 : 0.5; c.fillStyle = nt ? "#2F5A45" : "#4E7556"; c.beginPath(); c.ellipse(fx, fy, fs * 1.25, fs * 0.8, 0, 0, 7); c.fill(); c.beginPath(); c.arc(fx - fs * 0.55, fy - fs * 0.62, fs * 0.36, 0, 7); c.arc(fx + fs * 0.55, fy - fs * 0.62, fs * 0.36, 0, 7); c.fill();
      c.fillStyle = "#0E1A14"; c.beginPath(); c.arc(fx - fs * 0.55, fy - fs * 0.66, fs * 0.15, 0, 7); c.arc(fx + fs * 0.55, fy - fs * 0.66, fs * 0.15, 0, 7); c.fill();
      if (k > 0.02) { c.fillStyle = "rgba(240,244,232,.9)"; c.beginPath(); c.arc(fx, fy + fs * 0.42, fs * 0.6 * k, 0, 7); c.fill(); } c.globalAlpha = 1; }
    /* 起风：几道带弯的风线从左扫到右 */
    { const gk = T - M.gustT; if (gk >= 0 && gk < 2.4) { const cx = W * (-0.15 + 1.3 * gk / 2.4), al = Math.sin(Math.PI * gk / 2.4); c.strokeStyle = inkA(0.4 * al);
        for (let i = 0; i < 4; i++) { const y = H * (0.07 + i * 0.075), L = W * 0.12 * (1 - i * 0.12), off = (i % 2 ? -1 : 1) * W * 0.05 + Math.sin(T * 1.3 + i * 1.9) * W * 0.012, x0 = cx - L + off, x1 = cx + L + off, cu = H * 0.022; c.lineWidth = 2.6 - i * 0.4;
          c.beginPath(); c.moveTo(x0, y + cu * 0.3); c.bezierCurveTo(x0 + L * 0.6, y - cu, x1 - L * 0.7, y + cu, x1, y - cu * 0.1); c.bezierCurveTo(x1 + L * 0.16, y - cu * 0.55, x1 + L * 0.06, y - cu * 1.25, x1 - L * 0.06, y - cu * 0.75); c.stroke(); } } }
    /* 萤火虫：夜里才有 */
    if (nightK > 0.02) for (const f of FLY) { const x = W * (0.5 + 0.44 * Math.sin(T * 0.11 * f.s + f.p) * Math.cos(T * 0.05 + f.q)), y = H * (0.48 + 0.26 * Math.sin(T * 0.09 * f.s + f.q)), a = nightK * (0.45 + 0.55 * Math.sin(T * 1.7 * f.s + f.p)); if (a <= 0) continue;
      const r = H * 0.012, g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(238,246,176,${0.95 * a})`); g.addColorStop(0.35, `rgba(214,236,150,${0.35 * a})`); g.addColorStop(1, "rgba(214,236,150,0)"); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); }
    if (!G.started) return;
    /* 每个座位脚下几颗小点：演到第几档（空心＝歇） */
    const cw = Math.max(74, Math.min(88, W * 0.047)), pw = cw * 6 + 20, ph = 162, px = (W - pw) / 2, py = H - ph - 8, PI = Math.PI;
    for (let q = 0; q <= FROG_SEAT && q < colSX.length; q++) { const n = q === FROG_SEAT ? 2 : 3, v = seatState(q), x = colSX[q] * W, y = Math.min(H * 0.806, py - 13), lit = hs.some(h => h && h.col === q);
      for (let i = 0; i < n; i++) { c.beginPath(); c.arc(x + (i - (n - 1) / 2) * 12, y, i < v ? 4 : 3.2, 0, 7); if (i < v) { c.fillStyle = inkA(0.9); c.fill(); } else { c.strokeStyle = inkA(lit ? 0.75 : 0.34); c.lineWidth = 1.3; c.stroke(); } } }
    /* 指挥的谱台：上沿一道弧是太阳这一天走的路（走到最后一段换成月亮），每起一阵风往前一格；下面六格是手形，一格一件事，此刻认出的那一格亮 */
    const key = h => !h || h.sx == null || h === S.mouse ? null : h.pose === "fist" ? (h.g && h.g.wind ? "both" : "fist") : h.pose, now = [key(hs[0]), key(hs[1])], none = !now[0] && !now[1], paper = nt ? "#1B2F28" : "#EDF0E7";
    c.fillStyle = nt ? "rgba(16,34,28,.74)" : "rgba(246,248,240,.8)"; c.strokeStyle = inkA(0.2); c.lineWidth = 1; c.beginPath(); c.roundRect(px, py, pw, ph, 10); c.fill(); c.stroke();
    { const ax0 = px + 34, ax1 = px + pw - 34, ay = py + 34, rise = 20, at = u => [ax0 + (ax1 - ax0) * u, ay - rise * 4 * u * (1 - u)], u = cl((M.dayV ?? 0) / DAY_LEN, 0, 1);
      c.strokeStyle = inkA(0.22); c.lineWidth = 1; c.beginPath(); c.moveTo(ax0 - 16, ay); c.lineTo(ax1 + 16, ay); c.stroke();                                                           // 地平线
      c.strokeStyle = inkA(0.3); c.setLineDash([2, 4]); c.beginPath(); c.moveTo(ax0, ay); c.quadraticCurveTo((ax0 + ax1) / 2, ay - rise * 2, ax1, ay); c.stroke(); c.setLineDash([]);
      c.strokeStyle = inkA(0.85); c.lineWidth = 1.6; c.beginPath(); for (let k = 0; k <= 40; k++) { const q = at(u * k / 40); k ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); } c.stroke();                // 走过的路
      for (let k = 1; k <= DAY_LEN; k++) { const q = at(k / DAY_LEN), done = k <= M.day; c.beginPath(); c.arc(q[0], q[1], done ? 2.6 : 2, 0, 7); c.fillStyle = done ? inkA(0.9) : paper; c.fill(); if (!done) { c.strokeStyle = inkA(0.4); c.lineWidth = 1; c.stroke(); } }   // 八阵风
      const q = at(u), night = u >= 0.75 - 1e-6; c.fillStyle = paper; c.beginPath(); c.arc(q[0], q[1], 9.5, 0, 7); c.fill(); c.fillStyle = c.strokeStyle = inkA(0.95);
      if (night) { c.beginPath(); c.arc(q[0], q[1], 6.5, 0, 7); c.fill(); c.fillStyle = paper; c.beginPath(); c.arc(q[0] + 3.4, q[1] - 2.2, 5.6, 0, 7); c.fill(); }
      else { c.beginPath(); c.arc(q[0], q[1], 4.2, 0, 7); c.fill(); c.lineWidth = 1.4; for (let r = 0; r < 8; r++) { const a = r * PI / 4; c.beginPath(); c.moveTo(q[0] + Math.cos(a) * 6.2, q[1] + Math.sin(a) * 6.2); c.lineTo(q[0] + Math.cos(a) * 8.6, q[1] + Math.sin(a) * 8.6); c.stroke(); } } }
    /* 手的图标：手掌 + 四根手指（伸出的画长，收起的画成贴着掌的一节）+ 拇指。n＝伸出几根（4＝张手，0＝拳） */
    const hand = (x, y, z, n, dir) => { const ink0 = c.fillStyle, w = 0.128 * z, sp = 0.15 * z, len = [0.45, 0.52, 0.46, 0.35], fxOf = f => x + dir * (f - 1.5) * sp;
      c.beginPath(); c.roundRect(x - 0.3 * z, y + 0.5 * z, 0.6 * z, 0.46 * z, [0.1 * z, 0.1 * z, 0.2 * z, 0.2 * z]);
      for (let f = 0; f < 4; f++) { const fx = fxOf(f); if (f < n) c.roundRect(fx - w / 2, y + 0.58 * z - len[f] * z, w, len[f] * z, w / 2); else c.roundRect(fx - w / 2 - 0.006 * z, y + 0.4 * z, w + 0.012 * z, 0.24 * z, w / 2); } c.fill();
      c.strokeStyle = paper; c.lineWidth = Math.max(1, 0.035 * z); c.beginPath(); for (let f = Math.max(n, 1); f < 4; f++) { if (f - 1 < n) continue; const gx = (fxOf(f) + fxOf(f - 1)) / 2; c.moveTo(gx, y + 0.43 * z); c.lineTo(gx, y + 0.64 * z); }
      if (n < 4) { const a = fxOf(n) - dir * w * 0.55, b = fxOf(3) + dir * w * 0.55; c.moveTo(a, y + 0.65 * z); c.lineTo(b, y + 0.65 * z); } c.stroke();
      if (n === 4) { c.strokeStyle = ink0; c.lineWidth = 0.135 * z; c.beginPath(); c.moveTo(x - dir * 0.2 * z, y + 0.8 * z); c.lineTo(x - dir * 0.44 * z, y + 0.57 * z); c.stroke(); }
      else { const tw = 0.4 * z, tx = dir > 0 ? x - 0.33 * z : x + 0.33 * z - tw; c.beginPath(); c.roundRect(tx, y + 0.7 * z, tw, 0.15 * z, 0.075 * z); c.fillStyle = ink0; c.fill(); c.strokeStyle = paper; c.stroke(); }
      c.fillStyle = c.strokeStyle = ink0; };
    c.textAlign = "center"; c.textBaseline = "middle"; const F = q => `${q}px -apple-system,"PingFang SC","Noto Sans CJK SC",sans-serif`;
    [["open", 4, "选择"], ["1", 1, "疏"], ["2", 2, "中"], ["3", 3, "密"], ["fist", 0, "请走"], ["both", -1, "起风"]].forEach(([k, n, cap], i) => { const cx = px + 10 + cw * (i + 0.5), top = py + 46, on = now.includes(k), z = 46, hy = top + 2, al = on ? 1 : i === 0 && none ? 0.5 + 0.35 * Math.sin(T * 3) : 0.58;
      if (on) { c.fillStyle = inkA(0.14); c.beginPath(); c.roundRect(cx - cw / 2 + 3, top - 4, cw - 6, ph - 50, 8); c.fill(); }
      const pr = Math.max(...hs.map(h => h && h !== S.mouse && (h.cand === k || (k === "both" && h.cand === "fist" && hs[0] && hs[1] && hs[0].cand === "fist" && hs[1].cand === "fist")) ? h.prog || 0 : 0));
      if (pr > 0 && !on) { c.fillStyle = inkA(0.1); c.beginPath(); c.roundRect(cx - cw / 2 + 3, top - 4, (cw - 6) * pr, ph - 50, 8); c.fill(); }                                       // 正在认这个手形：这一格从左往右填满
      c.strokeStyle = c.fillStyle = inkA(al); if (n >= 0) hand(cx, hy, z, n, 1); else { hand(cx - z * 0.37, hy + 6, z * 0.76, 0, 1); hand(cx + z * 0.37, hy + 6, z * 0.76, 0, -1); }
      const ry = top + z + 20; c.strokeStyle = c.fillStyle = inkA(al); c.lineWidth = 1.5;
      if (i === 0) { c.globalAlpha = 0.5; c.beginPath(); c.moveTo(cx - 3, ry - 8); c.lineTo(cx + 3, ry - 8); c.lineTo(cx + 9, ry + 7); c.lineTo(cx - 9, ry + 7); c.closePath(); c.fill(); c.globalAlpha = 1; }
      else if (i < 5) { const m = i === 4 ? 0 : i; for (let q = 0; q < 3; q++) { c.beginPath(); c.arc(cx + (q - 1) * 12, ry, q < m ? 4.2 : 3.4, 0, 7); if (q < m) c.fill(); else c.stroke(); } }
      else { for (let q = 0; q < 2; q++) { const y = ry - 3 + q * 7, L = 13 - q * 3; c.beginPath(); c.moveTo(cx - L, y + 1); c.bezierCurveTo(cx - L * 0.3, y - 3, cx + L * 0.3, y + 3, cx + L, y - 0.5); c.bezierCurveTo(cx + L + 3, y - 2, cx + L + 1.5, y - 5, cx + L - 1, y - 3.5); c.stroke(); } }
      c.font = F(12); c.fillStyle = inkA(on ? 0.95 : 0.62); c.fillText(cap, cx, ry + 22); });
    c.textAlign = "left";
  }
  function feed(landmarks, nowMs = performance.now()) {
    const out = [];
    (landmarks || []).slice(0, 2).forEach((lm, i) => {
      const pt = pointOf(lm), px = pt.x, py = pt.y;
      const prev = S.hands.find(h => Math.hypot(h.sx - px, h.sy - py) < 0.25 && !out.includes(h)) || (S.lost || []).find(h => nowMs - h.seen < 400 && Math.hypot(h.sx - px, h.sy - py) < 0.25 && !out.includes(h)) || { pin: false, fist: false, pn: 0, fn: 0, col: null, lvl: null };
      const plen = D(lm[9], lm[0]) || 1e-6, pinch = D(lm[4], lm[8]) / plen, rat = (t, p) => D(lm[t], lm[0]) / Math.max(1e-6, D(lm[p], lm[0]));
      const o3 = (rat(12, 10) + rat(16, 14) + rat(20, 18)) / 3, idx = rat(8, 6);
      const h = Object.assign(prev, { sx: px, sy: py, seen: nowMs, pinch, o3, idx, lm });
      h.col = CH === 2 ? (h.col ?? 0) : nearest(colSX, px, h.col, 0.3); h.lvl = CH === 2 ? 0 : nearest(lvlSY, py - 0.06, h.lvl, 0.3);        // 竹顶画在手心上方一点，不被手挡住
      if (CH === 2) { h.off = false; out.push(h); return; }
      const wantFist = h.fist ? (o3 < 1.0) : (o3 < FIST3 && idx < FIST_IDX);
      if (wantFist === h.fist) h.fn = 0; else if (++h.fn >= 3) { h.fn = 0; h.fist = wantFist; if (wantFist) { h.did = cut(h.col, h.lvl) ? "cut" : null; h.pin = false; } }
      const wantPin = !h.fist && o3 > OPEN3 && (h.pin ? pinch < PINCH_OFF : pinch < PINCH_ON);
      if (wantPin === h.pin) h.pn = 0; else if (++h.pn >= 2) { h.pn = 0; h.pin = wantPin; if (wantPin) h.did = plant(h.col, h.lvl) ? "plant" : null; }
      out.push(h);
    });
    if (CH === 2) for (const h of out) gesture3(h, h.lm, nowMs, out);
    S.lost = S.hands.filter(h => !out.includes(h)).concat((S.lost || []).filter(h => !out.includes(h) && nowMs - h.seen < 400)).slice(0, 4);
    S.hands = out; S.feeds = (S.feeds || 0) + 1;
    if (REC.on) { const r4 = v => Math.round(v * 1e4) / 1e4; REC.buf.push(JSON.stringify({ t: Math.round(nowMs), vt: r4(REC.vt), h: out.map(h => ({ lm: h.lm.map(q => [r4(q.x), r4(q.y), r4(q.z)]), sx: r4(h.sx), sy: r4(h.sy), col: h.col, lvl: h.lvl, pinch: r4(h.pinch), o3: r4(h.o3), idx: r4(h.idx), raw: h.raw, pose: h.pose, ok: !!h.ok, pin: !!h.pin, fist: !!h.fist, fp: r4(h.fistP || 0) })) })); }
  }

  /* ── 每帧 ── */
  let t0 = performance.now(), last = t0, frames = 0, gustA = 0;
  const hintEl = $("wg-hint"), hudEl = $("wg-hud");
  const GND = ground.material.uniforms, GNDC = [["#DCE4D5", "#C3D0BB", "#9DB093"], ["#75938C", "#6C877F", "#647E77"]].map(p => p.map(hex));
  const SKYC = [["#EEF2EA", "#DFE7D9"], ["#F4F7EC", "#E4EDD6"], ["#F3EADB", "#EBDCC8"], ["#7A9A92", "#668780"]].map(p => p.map(hex));   // 晨、午、暮、夜：天顶和天边
  function frame(nowMs) {
    const dt = Math.min(0.1, (nowMs - last) / 1000); last = nowMs; const T = S.T = (nowMs - t0) / 1000; U.uTime.value = T; frames++;
    S.hands = S.hands.filter(h => nowMs - h.seen < 300);
    const L = live(), n = L.length;
    /* 风的锋面 */
    if (A.ok && A.AC.state === "running" && S.nextT) { const ph = ((A.AC.currentTime - S.bar0) / BAR) % 1, gx = X0 + ph * COLS * DX, edge = Math.min(1, ph * 8, (1 - ph) * 10);
      gustA = ease(gustA, CH === 2 ? 0.12 : n ? 1 : 0.35, dt, 0.8); U.uGust.value.set(gx, gustA * edge);
      if (CH === 2 && S.hands.length) { let hm = S.hands[0]; for (const h of S.hands) if ((h.sp || 0) > (hm.sp || 0)) hm = h; const hwv = Math.tan(FOV * Math.PI / 360) * camera.aspect * (camera.position.z + 5); U.uGust.value.set((hm.sx - 0.5) * 2 * hwv, 0.12 + Math.min(1, (hm.sp || 0) * 1.6)); }
      if (CH === 2) { const gk = T - M.gustT; if (gk >= 0 && gk < 2.4) { const gs = Math.sin(Math.PI * gk / 2.4); U.uGust.value.set(-11 + 22 * gk / 2.4, 0.15 + 1.1 * gs); if (frames % 3 === 0) A.windG.gain.setTargetAtTime(0.02 + 0.10 * gs, A.AC.currentTime, 0.1); } }
      gustCard.position.set(gx - 1.2, 3.2, 0.6); gustCard.scale.set(7, 7.5, 1); gustCard.quaternion.copy(camera.quaternion); gustCard.material.uniforms.uOp.value = CH === 2 ? 0 : 0.55 * gustA * edge;
      if (frames % 3 === 0) { const t = A.AC.currentTime; A.windG.gain.setTargetAtTime(0.012 + 0.05 * gustA * edge * (0.5 + 0.5 * Math.sin(ph * Math.PI)), t, 0.12); A.windPan.pan.setTargetAtTime(cl(gx / 6, -1, 1) * 0.8, t, 0.1); A.windF.frequency.setTargetAtTime(420 + 500 * ph, t, 0.2); } }
    if (CH === 2) { if (M.ending && M.endT != null && T - M.endT > 7) { M.ending = 0; M.endT = null; M.day = 0; M.stn = 0; M.secBar = S.barN; M.ended++; A.padSet(STN[0].pad, PAD_IDLE); }      // 收完，过一会儿又是晨雾
      M.dayV = ease(M.dayV ?? 0, M.ending && M.endT != null ? Math.max(0, M.day * (1 - (T - M.endT) / 6)) : M.day, dt, 1.2); const u = cl(M.dayV / PH, 0, 3), a = Math.min(2, Math.floor(u)), k = cl(u - a, 0, 1);   // 每一段的前一半保持本色，后一半过渡到下一段
      GND.uGround.value.copy(GNDC[0][0]).lerp(GNDC[1][0], nightK); GND.uMoss.value.copy(GNDC[0][1]).lerp(GNDC[1][1], nightK); GND.uLeaf.value.copy(GNDC[0][2]).lerp(GNDC[1][2], nightK);
      U.uSkyTop.value.copy(SKYC[a][0]).lerp(SKYC[a + 1][0], k); U.uSkyHor.value.copy(SKYC[a][1]).lerp(SKYC[a + 1][1], k); nightK = a >= 2 ? k : 0; if (u >= 3) nightK = 1;
      const nt = nightK > 0.5; if (nt !== M.nt) { M.nt = nt; document.body.style.setProperty("--ink", nt ? "#DCE6D8" : "#16281C"); document.body.style.setProperty("--paper", nt ? "#1F3832" : "#EDF1E8"); if (hintEl) hintEl.style.color = "#EDF1E8"; }
      if (frames % 20 === 0 && A.padG && !M.ending) A.padG.gain.setTargetAtTime(playing() ? PAD_ON : PAD_IDLE, A.AC.currentTime, 0.8); }
    if (dirty) rebuild();
    sky.position.copy(camera.position);
    mists.forEach(m => { const u = m.userData; m.position.set(u.x + Math.sin(T * 0.05 + u.ph) * 1.5, u.y, u.z); m.scale.set(u.w, u.h, 1); m.quaternion.copy(camera.quaternion); if (CH === 2) m.material.uniforms.uOp.value = 0.5 * (1 - 0.82 * nightK); });
    /* 将要种下的那根 */
    const curs = S.hands.length ? S.hands : (S.mouse && nowMs - (S.mouse.t || 0) < 2500 ? [S.mouse] : []);   // 手离开了圈就消失；鼠标的圈只在鼠标刚动过的 2.5 秒里显示
    ghosts.forEach((g, i) => { const h = CH === 2 ? null : curs[i]; if (!h || h.col == null) { g.material.opacity = ease(g.material.opacity, 0, dt, 0.1); return; }
      if (CH === 2 && h.col >= SKY) { g.material.opacity = ease(g.material.opacity, 0, dt, 0.08); return; }
      if (CH === 2 && h.col >= VOX.length) { const Z = ZN[h.col - VOX.length]; g.material.map = ringTex; g.position.set(Z.x, PERCH_Y[h.lvl] + 0.3, Z.z + 1.5); const fp = h.fistP || 0; g.scale.set(3.4 * (1 - 0.6 * fp), 1.1 * (1 - 0.6 * fp), 1); g.quaternion.copy(camera.quaternion); g.material.opacity = ease(g.material.opacity, h.off ? 0 : fp ? 0.5 + 0.5 * fp : h.fist || h.ok === false ? 0.15 : 0.4, dt, 0.08); return; }
      if (CH === 2) { const V = VOX[h.col]; g.material.map = ringTex; g.position.set(V.x, PIL_Y[h.lvl], V.z + 0.25); const fp = h.fistP || 0; g.scale.set((V.r * 2 + 0.8) * (1 - 0.6 * fp), 0.5 * (1 - 0.6 * fp), 1); g.quaternion.copy(camera.quaternion); g.material.opacity = ease(g.material.opacity, h.off ? 0 : fp ? 0.5 + 0.5 * fp : h.fist || h.ok === false ? 0.15 : 0.4, dt, 0.08); return; }
      const full = live().filter(s => s.col === h.col).length >= PER_COL, hh = hOf(h.lvl); g.position.set(xOf(h.col), hh / 2, 0.15); g.scale.set(0.16, hh, 1); g.quaternion.copy(camera.quaternion);
      g.material.opacity = ease(g.material.opacity, h.fist ? 0.12 : full ? 0.15 : 0.5, dt, 0.08); });
    drawHands(dt);
    if (0) dots.forEach((e, i) => { const h = S.hands[i]; if (!h) { e.style.opacity = 0; return; } e.style.left = (h.sx * 100) + "vw"; e.style.top = (h.sy * 100) + "vh"; e.style.opacity = h.ok === false ? 0.15 : h.pin ? 0.8 : 0.4; e.style.transform = h.pin ? "scale(.6)" : "none"; });
    /* 第二章：被请来的啄木鸟待在你放它的高度敲自己的型；手伸过来，它先跟手 */
    if (CH === 2) {
      VOX.forEach((V, v) => { const w = P.wp[v], m = wpM[v], wh = 1.05 + V.r * 1.4, ww = wh * 128 / 224; if (v === FROG_SEAT) { m.visible = false; return; }
        const hh = null;    // 手伸到这根竹上：这只鸟放下自己的活，过来等在手指的那一节
        const called = T - (w.handT ?? -9) < 0.6, on = P.pat[v] > 0 || called;
        const tx = on ? V.x - V.r - 0.012 - 0.042 * ww : (V.x < 0 ? -14 : 14), ty = called ? PIL_Y[w.handK] : on ? PIL_Y[P.wpL[v]] : 7;
        w.called = called; w.x = ease(w.x, tx, dt, called ? 0.16 : 0.45); w.y = ease(w.y, ty, dt, called ? 0.07 : Math.abs(w.x - tx) > 0.3 ? 0.4 : 0.06); const leap = Math.min(0.45, Math.abs(ty - w.y) * 0.22) * (Math.abs(w.x - tx) > 0.3 ? 0 : 1), rec = Math.max(0, 1 - (T - w.peckT) * 9) * 0.06;
        const pk = T - w.peckT < 0.08 ? 1 : 0; if (pk !== w.pk) { w.pk = pk; m.material.uniforms.uMap.value = wpTex[pk]; }
        m.visible = Math.abs(w.x) < 13; m.scale.set(ww, wh, 1); m.position.set(w.x - leap + rec, w.y + leap * 0.5, V.z + 0.1); m.quaternion.copy(camera.quaternion); }); }
    if (CH === 2) { P.away = P.away.filter(b => T - b.goneT < 2.5); const all = P.birds.concat(P.away);
      sbM.forEach((m, i) => { const b = all[i]; if (!b) { m.visible = false; return; } const sp = b.goneT ? 0.7 : 0.38; b.x = ease(b.x, b.tx, dt, sp); b.y = ease(b.y, b.ty, dt, sp); b.z = ease(b.z, b.tz, dt, sp);
        const far = Math.hypot(b.x - b.tx, b.y - b.ty), fly = b.goneT || far > 0.12, hop = Math.max(0, 1 - (T - b.singT) * 4), tx = fly ? sbTex[1 + (Math.floor(nowMs / 130) & 1)] : sbTex[0];
        if (m.material.uniforms.uMap.value !== tx) m.material.uniforms.uMap.value = tx; const sc = BS * 2.5 * (1 + hop * 0.14), face = fly ? (b.tx > b.x ? 1 : -1) : -b.side;
        m.visible = true; m.scale.set(sc * face, sc, 1); m.position.set(b.x, b.y + 0.12 * sc + hop * 0.07, b.z); m.quaternion.copy(camera.quaternion); }); }
    /* 鸟 */
    bird.on = n >= BIRD_AT || (bird.on && n >= BIRD_AT - 2);
    if (bird.on) { if (!bird.perch || bird.perch.dead) { bird.perch = L.reduce((a, b) => (b.lvl > a.lvl ? b : a), L[0]); } const p = bird.perch; bird.tx = p.x + 0.02; bird.ty = p.h * 0.985; bird.tz = p.z + 0.08; } else { bird.perch = null; bird.tx = 10; bird.ty = 6; }
    { const ox = bird.x; bird.x = ease(bird.x, bird.tx, dt, 0.5); bird.y = ease(bird.y, bird.ty, dt, 0.5); bird.z = ease(bird.z, bird.tz, dt, 0.5); const far = Math.hypot(bird.x - bird.tx, bird.y - bird.ty);
      if (Math.abs(bird.x - ox) > 0.002) bird.face = bird.x > ox ? 1 : -1; birdM.visible = bird.x < 9.5;
      if (birdM.visible) { const hop = Math.max(0, 1 - (T - bird.hop) * 5); bctx.clearRect(0, 0, 320, 320); drawBird(bctx, 160, 198, 2 * (1 + hop * 0.08), far > 0.15 ? 1 : 0, far <= 0.15, nowMs); btex.needsUpdate = true;
        const sw = bird.perch && far < 0.15 ? U.uGust.value.y * Math.exp(-Math.pow((bird.x - U.uGust.value.x) / 1.2, 2)) * 0.2 : 0;
        birdM.scale.set(BS * bird.face, BS, 1); birdM.position.set(bird.x + sw, bird.y + 0.12 * BS + hop * 0.05, bird.z); birdM.quaternion.copy(camera.quaternion); } }
    /* 啄木鸟 */
    peck.on = n >= PECK_AT || (peck.on && n >= PECK_AT - 2);
    if (peck.on) { if (!peck.perch || peck.perch.dead) peck.perch = L.reduce((a, b) => (b.lvl < a.lvl ? b : a), L[0]); const p = peck.perch; peck.tx = p.x - p.r - 0.01; peck.ty = Math.min(1.5, p.h * 0.6); peck.tz = p.z + 0.08; } else { peck.perch = null; peck.tx = -10; peck.ty = 5; }
    { peck.x = ease(peck.x, peck.tx, dt, 0.5); peck.y = ease(peck.y, peck.ty, dt, 0.5); peck.z = ease(peck.z, peck.tz, dt, 0.5); peckM.visible = peck.x > -9.5;
      if (peckM.visible) { const pk = Math.round(cl(1 - (T - peck.t) * 9) * 3) / 3, key = String(pk); if (key !== peck.key) { peck.key = key; wctx.clearRect(0, 0, 128, 224); drawWoodpecker(wctx, 40, 116, 2.1, pk); wtex.needsUpdate = true; }
        const wh = 0.5, ww = wh * 128 / 224; peckM.scale.set(ww, wh, 1); peckM.position.set(peck.x - 0.042 * ww - 0.02, peck.y, peck.z); peckM.quaternion.copy(camera.quaternion); } }
    if (!G.noRender) renderer.render(scene, camera);
    /* 一句话的提示：做到了就换下一句，都做过就不再出现 */
    if (hintEl && CH === 2) { let say = ""; const acts = M.acts || 0, key = acts + (M.winds || 0) * 1000;                      // 提示不常驻：手指认不清时立刻出；其余只在一阵子没动静时出来一会儿
      if (key !== M.hKey || M.hT == null || !G.started) { M.hKey = key; M.hT = T; } const idle = T - M.hT, wait = acts ? 14 : 6, due = idle > wait && idle < wait + 9;
      if (!G.started || M.ending) say = ""; else if (S.hands.some(h => h.unsure)) say = "手形认不清 —— 手指伸直或收拢，整只手留在镜头里";
      else if (!due) say = ""; else if (!acts) say = "张着手左右移动选人；伸一根手指，请它来";
      else if (acts < 3) say = "一根手指疏，两根中，三根密；握拳，请它走"; else if (!M.winds) say = "两只手一起握拳 —— 起风，进入下一段";
      else if (M.winds < 3) say = "每起一阵风，太阳走一格；走完八格，这一天收";
      if (hintEl.textContent !== say) { if (say) hintEl.textContent = say; hintEl.classList.toggle("on", !!say); S.hint = say; } }
    else if (hintEl) { let say = ""; if (!G.started) say = ""; else if (!S.planted) say = "伸出手，捏一下拇指和食指 —— 种一根竹"; else if (S.planted < 4) say = "换个地方再种：左右是它什么时候响，高矮是音高";
      else if (!S.cut && S.planted >= 7 && S.planted < 12) say = "握拳 —— 砍掉手底下那根"; if (hintEl.textContent !== say) { hintEl.textContent = say; hintEl.classList.toggle("on", !!say); } }
    if (hudEl) { const la = CH === 2 ? litAll() : 0, s = CH === 2 ? "" : (n ? n + " 根" : ""); if (hudEl.textContent !== s) hudEl.textContent = s; }
    requestAnimationFrame(frame);
  }

  /* ── 鼠标也能玩（没有摄像头时、或者想先看看）：移动＝手的位置，点一下＝种，按住 Shift 点＝砍 ── */
  const mAt = e => { const m = S.mouse || (S.mouse = { col: null, lvl: null }); m.col = CH === 2 ? pickSeat(e.clientX / innerWidth, m.col) : nearest(colSX, e.clientX / innerWidth, m.col, 0.2); m.lvl = CH === 2 ? 0 : nearest(lvlSY, e.clientY / innerHeight, m.lvl, 0.2); m.sx = e.clientX / innerWidth; m.sy = e.clientY / innerHeight; m.t = performance.now(); return m; };
  glc.addEventListener("pointermove", e => { if (!S.hands.length) mAt(e); });
  glc.addEventListener("pointerdown", e => { if (!G.started || S.hands.length) return; const m = mAt(e); if (CH === 2) { if (e.shiftKey || e.button === 2) restSeat(m.col); else stepSeat(m.col); sayAt(seatName(m.col) + " · " + seatWord(m.col), colSX[m.col], 0.30); return; } if (e.shiftKey || e.button === 2) cut(m.col, m.lvl); else plant(m.col, m.lvl); });
  if (CH === 2) addEventListener("keydown", e => { if (!G.started) return; if (e.code === "Space") { e.preventDefault(); callWind(); } else if (e.code === "Enter") endPiece(); });
  glc.addEventListener("contextmenu", e => e.preventDefault());

  /* ── 摄像头和识别：本地 lib/ 优先，拿不到再去 CDN；每一步都有超时 ── */
  const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(what + " 超时")), ms))]);
  /* 练习记录：你正常玩的时候，把摄像头画面、手的关键点、系统认到的目标和触发的动作存到你文件夹的 Claude outputs/sessions/ 里。
     只有本地小服务器（lib/serve.py）在的时候才开；一次最多记 6 分钟。用它在不麻烦你的情况下回放、找毛病。 */
  const REC = { on: false, buf: [], sid: "", vt: 0 };
  const recEv = o => { if (REC.on) REC.buf.push(JSON.stringify(Object.assign({ t: Math.round(performance.now()) }, o))); };
  async function startRec(stream, video) {
    try { const r = await fetch("/__cap", { cache: "no-store" }); if (!r.ok || (await r.text()).trim() !== "gi-save-1") return; } catch (e) { return; }
    if (new URLSearchParams(location.search).has("norec")) return;
    const d = new Date(), z = n => String(n).padStart(2, "0"); REC.sid = `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
    const post = (f, body, a = 1) => fetch(`/__save?s=${REC.sid}&f=${f}&a=${a}`, { method: "POST", body }).catch(() => { });
    const mime = typeof MediaRecorder === "undefined" ? null : (["video/webm;codecs=vp8", "video/webm", "video/mp4"].find(m => MediaRecorder.isTypeSupported(m)) || null);
    const st = stream.getVideoTracks()[0].getSettings();
    await post("meta.json", JSON.stringify({ ver: VER, ua: navigator.userAgent, win: [innerWidth, innerHeight], cam: [st.width, st.height, st.frameRate], map: [CAM_GX, CAM_GY, CAM_OY], epoch: Date.now(), perf: Math.round(performance.now()), mime }), 0);
    let mr = null; if (mime) try { mr = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 900000 }); mr.ondataavailable = e => { if (e.data && e.data.size) post(mime.includes("mp4") ? "cam.mp4" : "cam.webm", e.data); }; mr.start(3000); } catch (e) { mr = null; }
    REC.on = true; verEl.textContent = VER + " · 记录中"; recEv({ ev: "start", vt: video.currentTime });
    const flush = () => { if (REC.buf.length) { post("log.jsonl", REC.buf.join("\n") + "\n"); REC.buf = []; } };
    const iv = setInterval(() => { recEv({ ev: "state", pat: P.pat.slice(), birds: P.birds.map(b => [b.zone, b.lvl]), frog: M.frog, stn: M.stn, day: M.day }); flush(); }, 3000);
    const stop = () => { if (!REC.on) return; recEv({ ev: "stop" }); flush(); REC.on = false; clearInterval(iv); try { mr.stop(); } catch (e) { } verEl.textContent = VER; };
    setTimeout(stop, 6 * 60 * 1000); addEventListener("pagehide", stop);
  }
  async function startCam(msg) {
    if (new URLSearchParams(location.search).has("nocam")) throw new Error("地址里带了 nocam，只用鼠标");
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 60 }, facingMode: "user" }, audio: false });
    const video = document.createElement("video"); video.playsInline = true; video.muted = true; video.srcObject = stream; await video.play(); G.video = video; if (G.camPreview) G.camPreview.set(stream);
    let lmk = null; const errs = [];
    for (const lib of [HERE, "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35"]) {
      try { msg("载入手势识别…"); const { FilesetResolver: FR, HandLandmarker: HL } = await withTimeout(import(lib + "/vision_bundle.mjs"), 8000, "识别库");
        const fs = await withTimeout(FR.forVisionTasks(lib + "/wasm"), 8000, "wasm");
        for (const model of [HERE + "/hand_landmarker.task", "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task"]) {
          try { lmk = await withTimeout(HL.createFromOptions(fs, { baseOptions: { modelAssetPath: model, delegate: "GPU" }, runningMode: "VIDEO", numHands: 2, minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5 }), 16000, "模型"); break; } catch (e) { errs.push(String(e && e.message || e)); } }
        if (lmk) break; } catch (e) { errs.push(String(e && e.message || e)); }
    }
    if (!lmk) throw new Error("手势识别没载入：" + errs.join("；"));
    startRec(stream, video);
    let lastTs = -1; const pump = (now, md) => { REC.vt = md && md.mediaTime != null ? md.mediaTime : video.currentTime; if (video.readyState >= 2) { const ts = Math.max(lastTs + 1, Math.round(performance.now())); lastTs = ts; try { const r = lmk.detectForVideo(video, ts); feed(r && r.landmarks || []); } catch (e) { } }
      if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(pump); else requestAnimationFrame(pump); }; pump();
  }
  /* 自己的镜头画面：可选，默认不出；右上角「镜头」或按 C 开关，记在浏览器里 */
  let camPreview = null;
  if (CH === 2) { const btn = document.createElement("div"), pv = document.createElement("video"); let on = false; try { on = localStorage.getItem("wg-cam") === "1"; } catch (e) { }
    btn.id = "wg-cam"; btn.textContent = "镜头"; btn.style.cssText = "position:fixed;right:28px;top:20px;z-index:31;font-size:12px;letter-spacing:.1em;cursor:pointer;opacity:.5;color:var(--ink);text-shadow:0 0 6px var(--paper),0 0 12px var(--paper);display:none;user-select:none";
    pv.id = "wg-campv"; pv.muted = true; pv.playsInline = true; pv.style.cssText = "position:fixed;right:28px;top:48px;z-index:31;width:176px;border-radius:8px;transform:scaleX(-1);display:none;box-shadow:0 0 0 1px rgba(22,40,28,.3)";
    const apply = () => { pv.style.display = on && pv.srcObject ? "block" : "none"; btn.style.opacity = on ? 0.95 : 0.5; btn.style.textDecoration = on ? "underline" : "none"; btn.style.textUnderlineOffset = "4px"; };
    camPreview = { set(stream) { pv.srcObject = stream; pv.play().catch(() => { }); btn.style.display = "block"; apply(); }, toggle() { on = !on; try { localStorage.setItem("wg-cam", on ? "1" : "0"); } catch (e) { } apply(); }, isOn: () => on };
    const sb = document.createElement("div"), SK = ["手", "手 · 线", "手 · 蝶", "手 · 群蝶"]; sb.id = "wg-skel"; sb.style.cssText = btn.style.cssText.replace("right:28px", "right:84px").replace("display:none", "display:block");
    try { S.skel = Math.min(3, Math.max(0, +localStorage.getItem("wg-skel") || 0)); } catch (e) { S.skel = 0; } const sApply = () => { sb.textContent = SK[S.skel]; sb.style.opacity = S.skel ? 0.95 : 0.5; sb.style.textDecoration = S.skel ? "underline" : "none"; sb.style.textUnderlineOffset = "4px"; }; sApply();
    const sToggle = () => { S.skel = (S.skel + 1) % 4; try { localStorage.setItem("wg-skel", String(S.skel)); } catch (e) { } sApply(); }; sb.addEventListener("click", sToggle); addEventListener("keydown", e => { if (e.code === "KeyS" && G.started) sToggle(); }); document.body.append(sb);
    btn.addEventListener("click", () => camPreview.toggle()); addEventListener("keydown", e => { if (e.code === "KeyC" && G.started && pv.srcObject) camPreview.toggle(); }); document.body.append(btn, pv); }
  const verEl = document.createElement("div"); verEl.textContent = VER; verEl.style.cssText = "position:fixed;right:10px;bottom:6px;z-index:5;font-size:10px;letter-spacing:.08em;color:#16281C;opacity:.3;pointer-events:none"; document.body.appendChild(verEl);
  const G = { camPreview, VER, MOV, GROOVE, HOOK, DAYSTN, applyMov, stepSeat, setSeat, poseOf, restSeat, seatState, pickSeat, FROG_SEAT, M, STN, callWind, frogCycle, frogOff, endPiece, pickTarget, SKY, POND, PIL_Y, DENS, PATS, setDrum, restDrum, ringOpacity: () => Math.max(...ghosts.map(g => g.material.opacity)), CH, P, invite, dismiss, litAll, VOX, ZN, S, A, plant, cut, feed, live, started: false, noRender: false, bird, peck, colSX: () => colSX, lvlSY: v => (CH === 2 ? lvlSYc[v ?? 0] : lvlSY), ptX: (v, k) => lvlSXc[v][k], pickCol, pointOf, setCam: (a, b, c) => { CAM_GX = a; CAM_GY = b; CAM_OY = c; },
    async begin() { if (G.started) return; G.started = true; const st = $("wg-start"), why = $("wg-why"); await A.start(); if (st) st.hidden = true;
      if (CH === 2) { A.padSet(STN[0].pad, PAD_IDLE); }
      try { await startCam(m => { if (why) why.textContent = m; }); $("wg-note").textContent = ""; }
      catch (e) { $("wg-note").textContent = "没拿到摄像头或手势识别，先用鼠标：移动＝位置，" + (CH === 2 ? "点一下＝这个座位下一档，按住 Shift 点＝歇；空格＝起风，回车＝收" : "点一下＝种，按住 Shift 点＝砍") + "。（" + (e && e.message || e) + "）"; } } };
  { const gr = $("wg-grain"); if (gr) { const c = document.createElement("canvas"); c.width = c.height = 160; const x = c.getContext("2d"), id = x.createImageData(160, 160), R = rng(9);
      for (let i = 0; i < id.data.length; i += 4) { const v = 255 - R() * 24; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; } x.putImageData(id, 0, 0); gr.style.backgroundImage = `url(${c.toDataURL()})`; } }
  $("wg-go").addEventListener("click", () => G.begin());
  requestAnimationFrame(frame);
  return G;
}
window.__wg = init();

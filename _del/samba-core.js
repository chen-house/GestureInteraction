/* samba-core.js — 从 sound-design-site/assets/js/samba.js 提取的纯合成部分。
   只含发声函数与节奏图案，不含任何 DOM 与调度。原文件未改动。 */

let _noiseBuf = null;
function noiseBuf(ctx) {
  if (_noiseBuf) return _noiseBuf;
  const n = ctx.sampleRate * 2;
  const b = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  _noiseBuf = b;
  return b;
}
function noiseSrc(ctx) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf(ctx);
  s.loop = true;
  return s;
}

/* ---------- 基础发声块（与 drums.js 同源） ---------- */

// 膜鼓音：正弦基频带音高包络
function membrane(ctx, t, out, { f0, f1, dec, gain = 1, type = 'sine' }) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(f1, 0.0001), t + dec * 0.85);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dec + 0.05);
}

// 噪声击：滤波后短噪声（敲击、响弦、沙锤、刮擦）
function noiseHit(ctx, t, out, { type = 'highpass', freq = 4000, Q = 0.7, gain = 0.5, dec = 0.05, attack = 0.001 }) {
  const n = noiseSrc(ctx);
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = Q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
  n.connect(f).connect(g).connect(out);
  n.start(t);
  n.stop(t + dec + 0.05);
}

// 钟铃音（agogô）：少数正弦泛音快速衰减
function bell(ctx, t, out, { freq, dec = 0.4, gain = 0.16 }) {
  const ratios = [1, 2.0, 2.99];
  const rg = [1, 0.4, 0.18];
  ratios.forEach((r, i) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq * r;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain * rg[i], t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dec * (1 - i * 0.18));
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dec + 0.05);
  });
}

// cuíca 摩擦鼓「呜-呃」：锯齿音高滑动经带通 —— 合成近似
function cuicaCry(ctx, t, out, { f0, f1, dec = 0.22, gain = 0.22 }) {
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(f0, t);
  o.frequency.linearRampToValueAtTime(f1, t + dec * 0.8);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 680;
  bp.Q.value = 3.5;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
  o.connect(bp).connect(g).connect(out);
  o.start(t);
  o.stop(t + dec + 0.05);
}

// reco-reco 刮器：一串极短颗粒噪声模拟「咔啦」刮擦 —— 合成近似
function recoScrape(ctx, t, out) {
  for (let i = 0; i < 6; i++) {
    noiseHit(ctx, t + i * 0.013, out, { type: 'bandpass', freq: 3000, Q: 1.3, gain: 0.11, dec: 0.012 });
  }
}

/* ---------- 各声部单击合成 ---------- */
const HIT = {
  // 低音：surdo 大鼓 —— 开音(o) / 闷音(m)
  surdoOpen(ctx, t, out) {
    membrane(ctx, t, out, { f0: 96, f1: 54, dec: 0.5, gain: 1 });
    noiseHit(ctx, t, out, { type: 'highpass', freq: 1500, gain: 0.14, dec: 0.012 });
  },
  surdoMute(ctx, t, out) {
    membrane(ctx, t, out, { f0: 90, f1: 64, dec: 0.13, gain: 0.55 });
  },
  // 中音：caixa 响弦鼓 —— 普通(c) / 重音(a)
  caixa(ctx, t, out) {
    membrane(ctx, t, out, { f0: 250, f1: 230, dec: 0.04, gain: 0.12, type: 'triangle' });
    noiseHit(ctx, t, out, { type: 'highpass', freq: 2000, Q: 0.7, gain: 0.26, dec: 0.035 });
  },
  caixaAccent(ctx, t, out) {
    membrane(ctx, t, out, { f0: 250, f1: 225, dec: 0.05, gain: 0.16, type: 'triangle' });
    noiseHit(ctx, t, out, { type: 'highpass', freq: 1800, Q: 0.7, gain: 0.5, dec: 0.06 });
  },
  // 中音：repinique 领奏鼓 —— 尖锐穿透
  repique(ctx, t, out) {
    membrane(ctx, t, out, { f0: 420, f1: 300, dec: 0.10, gain: 0.5, type: 'triangle' });
    noiseHit(ctx, t, out, { type: 'highpass', freq: 2600, gain: 0.35, dec: 0.05 });
  },
  // 高音：tamborim 手鼓 —— 极短「嗒」
  tamborim(ctx, t, out) {
    membrane(ctx, t, out, { f0: 470, f1: 430, dec: 0.04, gain: 0.32, type: 'triangle' });
    noiseHit(ctx, t, out, { type: 'highpass', freq: 4500, gain: 0.3, dec: 0.03 });
  },
  // 高音：chocalho 摇铃 —— 沙锤「唰」
  chocalho(ctx, t, out) {
    noiseHit(ctx, t, out, { type: 'highpass', freq: 6500, Q: 0.6, gain: 0.2, dec: 0.045 });
  },
  // 高音：agogô 双音铃 —— 高(h) / 低(l)
  agogoHi(ctx, t, out) { bell(ctx, t, out, { freq: 900, dec: 0.32, gain: 0.15 }); },
  agogoLo(ctx, t, out) { bell(ctx, t, out, { freq: 680, dec: 0.38, gain: 0.16 }); },
  // 高音：cuíca 摩擦鼓 —— 升(u) / 降(d)
  cuicaUp(ctx, t, out)   { cuicaCry(ctx, t, out, { f0: 260, f1: 540, dec: 0.2 }); },
  cuicaDown(ctx, t, out) { cuicaCry(ctx, t, out, { f0: 540, f1: 250, dec: 0.22 }); },
  // 高音：reco-reco 刮器
  reco(ctx, t, out) { recoScrape(ctx, t, out); },
};

const PATTERN = {
  // surdo：锚在拍 2、拍 4 的重开音(o)，前面 16 分垫一记闷音(m) —— 桑巴的「in 2」心跳
  surdo:     { 3: 'm', 4: 'o', 11: 'm', 12: 'o' },
  // caixa：连续 16 分铺底，'a' 的位置(每拍最后一个 16 分)给重音
  caixa:     { 0:'c',1:'c',2:'c',3:'a',4:'c',5:'c',6:'c',7:'a',8:'c',9:'c',10:'c',11:'a',12:'c',13:'c',14:'c',15:'a' },
  // repinique：稀疏领奏 + 句尾小过门
  repinique: { 0: 'x', 7: 'x', 14: 'x', 15: 'x' },
  // tamborim：teleco-teco 切分，高频咬住反拍
  tamborim:  { 0: 'x', 3: 'x', 4: 'x', 7: 'x', 8: 'x', 11: 'x', 14: 'x' },
  // chocalho：整排 16 分摇，制造摇摆 wash
  chocalho:  { 0:'x',1:'x',2:'x',3:'x',4:'x',5:'x',6:'x',7:'x',8:'x',9:'x',10:'x',11:'x',12:'x',13:'x',14:'x',15:'x' },
  // agogô：高低铃交替的固定音型
  agogo:     { 0: 'l', 2: 'h', 3: 'h', 6: 'l', 8: 'h', 10: 'h', 11: 'h', 14: 'l' },
  // cuíca：即兴「呜呃」点缀在反拍
  cuica:     { 4: 'u', 6: 'd', 12: 'u', 14: 'd' },
  // reco-reco：刮擦垫在每个正拍之前（每拍最后一个 16 分）
  reco:      { 3: 'x', 7: 'x', 11: 'x', 15: 'x' },
};

// 代码 → 发声函数
const VOICE = {
  surdo:     { o: 'surdoOpen', m: 'surdoMute' },
  caixa:     { c: 'caixa', a: 'caixaAccent' },
  repinique: { x: 'repique' },
  tamborim:  { x: 'tamborim' },
  chocalho:  { x: 'chocalho' },
  agogo:     { h: 'agogoHi', l: 'agogoLo' },
  cuica:     { u: 'cuicaUp', d: 'cuicaDown' },
  reco:      { x: 'reco' },
};

const LAYERS = ['surdo', 'caixa', 'repinique', 'tamborim', 'chocalho', 'agogo', 'cuica', 'reco'];

export { HIT, PATTERN, VOICE, LAYERS };

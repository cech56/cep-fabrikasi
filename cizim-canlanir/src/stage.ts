// "Sahne": WebView içinde çalışan tuval. Kamera görüntüsünün üstünde kâğıttan karakterleri canlandırır,
// fotoğraftan çizimi keser (arka planı siler) ve videoyu kaydeder.
// Not: Bu dosyadaki JS, şablon dizesi içinde durduğu için içinde ters tırnak ve "dolar-süslü parantez" kullanılmaz.

export const STAGE_HTML = String.raw`<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
html,body{margin:0;height:100%;overflow:hidden;background:#1b1530;touch-action:none;-webkit-user-select:none;user-select:none}
canvas{position:fixed;inset:0;width:100%;height:100%;display:block}
video{display:none}
</style></head>
<body>
<video id="cam" playsinline muted autoplay></video>
<canvas id="cv"></canvas>
<script>
(function(){
var cv = document.getElementById('cv');
var ctx = cv.getContext('2d');
var video = document.getElementById('cam');
var DPR = Math.min(window.devicePixelRatio || 1, 1.5);
var W = 0, H = 0;
var chars = [];
var particles = [];
var bubbles = [];
var camOn = false, camReady = false, camStream = null;
var scanImg = null, scanT0 = 0, scanFade = 0;
var edit = null; // { src, img, result, lasso: [], drawing: [], exact, busy }
var recorder = null, recChunks = [], recT0 = 0, recMax = 15000;
var audio = null, audioDest = null;
var tilt = { b0: null, g0: null, ox: 0, oy: 0, tx: 0, ty: 0 };
var drag = null;
var scene = 'camera';
var watermark = 'Çizim Canlanır';

function post(o){ try { window.ReactNativeWebView.postMessage(JSON.stringify(o)); } catch(e){} }
function rnd(a,b){ return a + Math.random()*(b-a); }
function clamp(v,a,b){ return v<a?a:v>b?b:v; }
function lerp(a,b,t){ return a+(b-a)*t; }
function now(){ return performance.now(); }

function resize(){
  W = window.innerWidth; H = window.innerHeight;
  cv.width = Math.round(W*DPR); cv.height = Math.round(H*DPR);
}
window.addEventListener('resize', resize);
resize();

// ---------------- Ses (WebAudio, kayda da girer) ----------------
function ensureAudio(){
  if (audio) { if (audio.state === 'suspended') audio.resume(); return; }
  try {
    audio = new (window.AudioContext || window.webkitAudioContext)();
    audioDest = audio.createMediaStreamDestination();
  } catch(e){ audio = null; }
}
function tone(type, f0, f1, dur, vol, delay){
  if (!audio) return;
  var t = audio.currentTime + (delay||0);
  var o = audio.createOscillator(), g = audio.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20,f1), t+dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t+0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
  o.connect(g); g.connect(audio.destination); if (audioDest) g.connect(audioDest);
  o.start(t); o.stop(t+dur+0.05);
}
var sfx = {
  boing: function(){ tone('sine', 180, 520, 0.28, 0.35); },
  pop: function(){ tone('triangle', 600, 1200, 0.09, 0.25); },
  step: function(){ tone('sine', 140, 90, 0.06, 0.08); },
  magic: function(){ [523,659,784,1046,1318].forEach(function(f,i){ tone('triangle', f, f*1.01, 0.35, 0.18, i*0.08); }); },
  dance: function(){ [392,494,587,494].forEach(function(f,i){ tone('square', f, f, 0.12, 0.06, i*0.18); }); },
  snore: function(){ tone('sawtooth', 90, 70, 0.6, 0.05); }
};

// ---------------- Kamera ----------------
function startCamera(){
  camOn = true;
  if (camStream) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { post({type:'camera', ok:false}); return; }
  navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
    .then(function(s){ camStream = s; video.srcObject = s; video.play(); camReady = true; post({type:'camera', ok:true}); })
    .catch(function(e){ camReady = false; post({type:'camera', ok:false, error: String(e && e.name || e)}); });
}
function stopCamera(){
  camOn = false; camReady = false;
  if (camStream) { camStream.getTracks().forEach(function(t){ t.stop(); }); camStream = null; }
}

// ---------------- Telefon eğimi: karakter masada sabit dursun ----------------
window.addEventListener('deviceorientation', function(e){
  if (e.beta == null || e.gamma == null) return;
  if (tilt.b0 == null) { tilt.b0 = e.beta; tilt.g0 = e.gamma; }
  var k = W / 55;
  tilt.tx = clamp(-(e.gamma - tilt.g0) * k, -W*0.3, W*0.3);
  tilt.ty = clamp(-(e.beta - tilt.b0) * k, -H*0.22, H*0.22);
  // yavaşça yeni duruşa alış (telefon uzun süre farklı tutulursa sahne ortalanır)
  tilt.b0 += (e.beta - tilt.b0) * 0.012;
  tilt.g0 += (e.gamma - tilt.g0) * 0.012;
});

// ---------------- Zemin ve perspektif ----------------
function floorTop(){ return H*0.42; }
function floorBottom(){ return H*0.9; }
function depthScale(y){ return lerp(0.55, 1.2, clamp((y - floorTop())/(floorBottom()-floorTop()), 0, 1)); }

// ---------------- Çizimi kesme (arka planı silme) ----------------
function loadImage(src){
  return new Promise(function(res, rej){ var im = new Image(); im.onload = function(){ res(im); }; im.onerror = rej; im.src = src; });
}
function cutout(src, opts){
  opts = opts || {};
  return loadImage(src).then(function(img){
    var maxWork = 420;
    var sc = Math.min(1, maxWork / Math.max(img.width, img.height));
    var w = Math.max(8, Math.round(img.width*sc)), h = Math.max(8, Math.round(img.height*sc));
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var x = c.getContext('2d'); x.drawImage(img, 0, 0, w, h);
    var d = x.getImageData(0,0,w,h).data;
    var n = w*h, L = new Float32Array(n), C = new Float32Array(n), i;
    // parmakla çizilen kesim çizgisi (0..1 koordinatlar)
    var inL = null, lasso = opts.lasso && opts.lasso.length > 5 ? opts.lasso : null;
    if (lasso) {
      var lc0 = document.createElement('canvas'); lc0.width = w; lc0.height = h;
      var lx0 = lc0.getContext('2d'); lx0.fillStyle = '#fff'; lx0.beginPath();
      lasso.forEach(function(pt, k){ if (k) lx0.lineTo(pt[0]*w, pt[1]*h); else lx0.moveTo(pt[0]*w, pt[1]*h); });
      lx0.closePath(); lx0.fill();
      var ld0 = lx0.getImageData(0,0,w,h).data; inL = new Uint8Array(n);
      for (var li=0; li<n; li++) inL[li] = ld0[li*4+3] > 127 ? 1 : 0;
    }
    for (i=0;i<n;i++){
      var r=d[i*4], g=d[i*4+1], b=d[i*4+2];
      L[i] = 0.299*r + 0.587*g + 0.114*b;
      C[i] = Math.max(r,g,b) - Math.min(r,g,b);
    }
    // yerel ortalama (gölgeli/eşit olmayan ışıkta da çalışsın)
    function integral(A){
      var I = new Float64Array((w+1)*(h+1));
      for (var yy=0; yy<h; yy++){ var row=0; for (var xx=0; xx<w; xx++){ row += A[yy*w+xx]; I[(yy+1)*(w+1)+xx+1] = I[yy*(w+1)+xx+1] + row; } }
      return I;
    }
    var rad = Math.max(6, Math.round(Math.max(w,h)/14));
    function boxMean(I, xx, yy){
      var x0=Math.max(0,xx-rad), y0=Math.max(0,yy-rad), x1=Math.min(w,xx+rad+1), y1=Math.min(h,yy+rad+1);
      var s = I[y1*(w+1)+x1] - I[y0*(w+1)+x1] - I[y1*(w+1)+x0] + I[y0*(w+1)+x0];
      return s / ((x1-x0)*(y1-y0));
    }
    // 1) kâğıdı bul: parlak bölge (Otsu eşiği). Masa vb. arka plan kâğıt dışı sayılır.
    var hist = new Array(256).fill(0); for (i=0;i<n;i++) hist[Math.min(255, L[i]|0)]++;
    var sum=0; for (i=0;i<256;i++) sum += i*hist[i];
    var sB=0, wB=0, best=0, thr=128;
    for (i=0;i<256;i++){ wB += hist[i]; if (!wB) continue; var wF = n - wB; if (!wF) break; sB += i*hist[i];
      var mB = sB/wB, mF = (sum - sB)/wF, between = wB*wF*(mB-mF)*(mB-mF); if (between > best) { best = between; thr = i; } }
    var bright = new Uint8Array(n), nb = 0;
    for (i=0;i<n;i++) if (L[i] > thr && C[i] < 90) { bright[i] = 1; nb++; }
    var paper = new Uint8Array(n);
    var stack = [];
    if (nb > n*0.88 || best === 0) { paper.fill(1); }
    else {
      // en büyük parlak parça = kâğıt; deliklerini (çizimi) doldur
      var lab0 = new Int32Array(n), bestId = 0, bestArea = 0, id0 = 0;
      for (i=0;i<n;i++){
        if (!bright[i] || lab0[i]) continue;
        id0++; var ar = 0; stack = [i]; lab0[i] = id0;
        while (stack.length){ var q0 = stack.pop(), qx0 = q0 % w, qy0 = (q0-qx0)/w; ar++;
          if (qx0>0 && bright[q0-1] && !lab0[q0-1]) { lab0[q0-1]=id0; stack.push(q0-1); }
          if (qx0<w-1 && bright[q0+1] && !lab0[q0+1]) { lab0[q0+1]=id0; stack.push(q0+1); }
          if (qy0>0 && bright[q0-w] && !lab0[q0-w]) { lab0[q0-w]=id0; stack.push(q0-w); }
          if (qy0<h-1 && bright[q0+w] && !lab0[q0+w]) { lab0[q0+w]=id0; stack.push(q0+w); } }
        if (ar > bestArea) { bestArea = ar; bestId = id0; }
      }
      var bg = new Uint8Array(n); stack = [];
      function seedBg(p){ if (lab0[p] !== bestId && !bg[p]) { bg[p]=1; stack.push(p); } }
      for (var xb=0; xb<w; xb++){ seedBg(xb); seedBg((h-1)*w+xb); }
      for (var yb=0; yb<h; yb++){ seedBg(yb*w); seedBg(yb*w+w-1); }
      while (stack.length){ var pb = stack.pop(), pbx = pb % w, pby = (pb-pbx)/w;
        if (pbx>0) seedBg(pb-1); if (pbx<w-1) seedBg(pb+1); if (pby>0) seedBg(pb-w); if (pby<h-1) seedBg(pb+w); }
      for (i=0;i<n;i++) paper[i] = bg[i] ? 0 : 1;
      if (bestArea < n*0.15) paper.fill(1);
    }
    if (inL) { for (i=0;i<n;i++) if (!inL[i]) paper[i] = 0; }
    // 2) kâğıt üstünde mürekkep: yerel kâğıt parlaklığından belirgin koyu ya da renkli olan
    var PL = new Float32Array(n), PC = new Float32Array(n), PN = new Float32Array(n);
    for (i=0;i<n;i++) if (paper[i] && bright[i]) { PL[i]=L[i]; PC[i]=C[i]; PN[i]=1; }
    var IL = integral(PL), IC = integral(PC), IN = integral(PN);
    var IL2 = integral(L), IC2 = integral(C);
    var ink = new Uint8Array(n);
    for (var yy=0; yy<h; yy++) for (var xx=0; xx<w; xx++){
      i = yy*w+xx; if (!paper[i]) continue;
      var cnt = boxMean(IN,xx,yy), mL, mC;
      if (cnt > 0.05) { mL = boxMean(IL,xx,yy)/cnt; mC = boxMean(IC,xx,yy)/cnt; }
      else { mL = boxMean(IL2,xx,yy); mC = boxMean(IC2,xx,yy); }
      if ((mL - L[i] > 22) || (C[i] - mC > 38 && C[i] > 45)) ink[i] = 1;
    }
    // çizgi boşluklarını kapat (genişlet)
    function dilate(A, r){
      var B = new Uint8Array(n);
      for (var yy=0; yy<h; yy++) for (var xx=0; xx<w; xx++){
        if (!A[yy*w+xx]) continue;
        for (var dy=-r; dy<=r; dy++) for (var dx=-r; dx<=r; dx++){
          var X=xx+dx, Y=yy+dy; if (X>=0&&Y>=0&&X<w&&Y<h) B[Y*w+X]=1;
        }
      }
      return B;
    }
    var closed = dilate(ink, 2);
    // dışarıyı kâğıt dışından ve kenarlardan doldur: ulaşılamayan her yer çizimin içidir
    var outside = new Uint8Array(n); stack = [];
    function seed(p){ if (!closed[p] && !outside[p]) { outside[p]=1; stack.push(p); } }
    for (i=0;i<n;i++) if (!paper[i]) { outside[i]=1; stack.push(i); }
    for (var xx2=0; xx2<w; xx2++){ seed(xx2); seed((h-1)*w+xx2); }
    for (var yy2=0; yy2<h; yy2++){ seed(yy2*w); seed(yy2*w+w-1); }
    while (stack.length){
      var p = stack.pop(), px = p % w, py = (p - px)/w;
      if (px>0) seed(p-1); if (px<w-1) seed(p+1); if (py>0) seed(p-w); if (py<h-1) seed(p+w);
    }
    // kâğıt kenarına değen parçalar (kenar gölgesi vb.) çizim değildir
    var nearEdge = new Uint8Array(n);
    for (var ye=0; ye<h; ye++) for (var xe=0; xe<w; xe++){ var pe = ye*w+xe; if (!paper[pe]) continue;
      if (xe===0||ye===0||xe===w-1||ye===h-1||!paper[pe-1]||!paper[pe+1]||!paper[pe-w]||!paper[pe+w]) nearEdge[pe]=1; }
    var mask = new Uint8Array(n);
    for (i=0;i<n;i++) mask[i] = outside[i] ? 0 : 1;
    // "tam çizdiğim yerden kes": otomatik algılamayı atla, çizgiyi aynen kullan
    if (inL && opts.exact) { for (i=0;i<n;i++) mask[i] = inL[i]; }
    // bağlı parçalar
    var lab = new Int32Array(n), comps = [], id = 0;
    for (i=0;i<n;i++){
      if (!mask[i] || lab[i]) continue;
      id++; var area=0, minx=w, miny=h, maxx=0, maxy=0; stack=[i]; lab[i]=id;
      while (stack.length){
        var q = stack.pop(), qx = q % w, qy = (q-qx)/w; area++;
        if (qx<minx) minx=qx; if (qx>maxx) maxx=qx; if (qy<miny) miny=qy; if (qy>maxy) maxy=qy;
        var nb = [qx>0?q-1:-1, qx<w-1?q+1:-1, qy>0?q-w:-1, qy<h-1?q+w:-1];
        for (var k=0;k<4;k++){ var m2 = nb[k]; if (m2>=0 && mask[m2] && !lab[m2]) { lab[m2]=id; stack.push(m2); } }
      }
      comps.push({id:id, area:area, minx:minx, miny:miny, maxx:maxx, maxy:maxy});
    }
    var edgeHits = {};
    for (i=0;i<n;i++) if (nearEdge[i] && lab[i]) edgeHits[lab[i]] = (edgeHits[lab[i]]||0) + 1;
    comps.forEach(function(c){ c.touches = !inL && (edgeHits[c.id]||0) > 0; });
    var cand = comps.filter(function(c){ return !c.touches || c.area > n*0.35; });
    if (!cand.length) cand = comps.filter(function(c){ return c.area < n*0.6; });
    var maxA = cand.reduce(function(m,c){ return Math.max(m,c.area); }, 0);
    var keep = cand.filter(function(c){ return c.area >= maxA*0.12 && c.area > n*0.002; });
    if (!keep.length || maxA < n*0.004) return { ok:false };
    var keepIds = {}; var bx0=w, by0=h, bx1=0, by1=0, total=0;
    keep.forEach(function(c){ keepIds[c.id]=1; total+=c.area; bx0=Math.min(bx0,c.minx); by0=Math.min(by0,c.miny); bx1=Math.max(bx1,c.maxx); by1=Math.max(by1,c.maxy); });
    var pad = Math.round(Math.max(bx1-bx0, by1-by0)*0.03)+1;
    bx0=Math.max(0,bx0-pad); by0=Math.max(0,by0-pad); bx1=Math.min(w-1,bx1+pad); by1=Math.min(h-1,by1+pad);
    var cw = bx1-bx0+1, ch = by1-by0+1;
    // maske tuvali (çalışma çözünürlüğünde)
    var mc = document.createElement('canvas'); mc.width=cw; mc.height=ch;
    var mx = mc.getContext('2d'); var md = mx.createImageData(cw, ch);
    for (var y3=0;y3<ch;y3++) for (var x3=0;x3<cw;x3++){
      var src = (y3+by0)*w + (x3+bx0);
      var a = keepIds[lab[src]] ? 255 : 0;
      var o = (y3*cw+x3)*4; md.data[o]=255; md.data[o+1]=255; md.data[o+2]=255; md.data[o+3]=a;
    }
    mx.putImageData(md,0,0);
    // asıl çözünürlükte kırp
    var osc = 1/sc;
    var outMax = 640;
    var ow = cw*osc, oh = ch*osc, os = Math.min(1, outMax/Math.max(ow,oh));
    ow = Math.max(4, Math.round(ow*os)); oh = Math.max(4, Math.round(oh*os));
    var out = document.createElement('canvas'); out.width=ow; out.height=oh;
    var ox = out.getContext('2d');
    ox.drawImage(img, bx0*osc, by0*osc, cw*osc, ch*osc, 0, 0, ow, oh);
    // renkleri canlandır: kâğıt beyazı tam beyaz olsun, renkler biraz doysun
    var od = ox.getImageData(0,0,ow,oh), pd = od.data;
    var wsum = [0,0,0], wn = 0;
    for (var yw=by0; yw<=by1; yw++) for (var xw=bx0; xw<=bx1; xw++){ var pw = yw*w+xw; if (paper[pw] && bright[pw] && !ink[pw]) { wsum[0]+=d[pw*4]; wsum[1]+=d[pw*4+1]; wsum[2]+=d[pw*4+2]; wn++; } }
    var wp = wn > 20 ? wsum.map(function(v){ return Math.max(110, v/wn); }) : [255,255,255];
    var j;
    for (j=0;j<pd.length;j+=4){
      var R = Math.min(255, pd[j]*250/wp[0]), G = Math.min(255, pd[j+1]*250/wp[1]), B = Math.min(255, pd[j+2]*250/wp[2]);
      var avg = (R+G+B)/3, sat = 1.35;
      R = clamp(avg + (R-avg)*sat, 0, 255); G = clamp(avg + (G-avg)*sat, 0, 255); B = clamp(avg + (B-avg)*sat, 0, 255);
      // kurşun kalemi biraz koyulaştır
      if (avg < 170) { R*=0.85; G*=0.85; B*=0.85; }
      pd[j]=R; pd[j+1]=G; pd[j+2]=B;
    }
    ox.putImageData(od,0,0);
    ox.globalCompositeOperation = 'destination-in';
    ox.filter = 'blur(' + Math.max(0.6, ow/cw*0.5) + 'px)';
    ox.imageSmoothingEnabled = true;
    ox.drawImage(mc, 0, 0, ow, oh);
    ox.filter = 'none';
    ox.globalCompositeOperation = 'source-over';
    // yapay zekâ için küçük, beyaz zeminli JPEG
    var ai = document.createElement('canvas'); var as = Math.min(1, 384/Math.max(ow,oh));
    ai.width = Math.round(ow*as); ai.height = Math.round(oh*as);
    var ax = ai.getContext('2d'); ax.fillStyle='#fff'; ax.fillRect(0,0,ai.width,ai.height); ax.drawImage(out,0,0,ai.width,ai.height);
    return {
      ok: true,
      png: out.toDataURL('image/png'),
      jpeg: ai.toDataURL('image/jpeg', 0.85),
      w: ow, h: oh,
      // fotoğraftaki konumu (canlanma animasyonu çizimin olduğu yerden başlasın)
      rect: { x: bx0/w, y: by0/h, w: cw/w, h: ch/h }
    };
  });
}

// ---------------- Karakter ----------------
function makeCanvas(w,h){ var c=document.createElement('canvas'); c.width=Math.max(1,Math.round(w)); c.height=Math.max(1,Math.round(h)); return c; }

function alphaAt(data, w, x, y){ return data[(y*w+x)*4+3]; }

function guessLegs(img){
  // alttaki satırda iki ayrı dolu bölge varsa onları bacak say
  var w = img.width, h = img.height;
  var c = makeCanvas(w,h), x = c.getContext('2d'); x.drawImage(img,0,0);
  var d = x.getImageData(0,0,w,h).data;
  var y = Math.floor(h*0.93), runs = [], inRun = false, s = 0;
  for (var xx=0; xx<w; xx++){
    var on = alphaAt(d,w,xx,y) > 128;
    if (on && !inRun){ inRun = true; s = xx; }
    if ((!on || xx===w-1) && inRun){ inRun = false; if (xx - s > w*0.03) runs.push([s, xx]); }
  }
  if (runs.length < 2) return [];
  var a = runs[0], b = runs[runs.length-1];
  var top = 0.7;
  function box(r){ var x0 = Math.max(0, r[0]/w - 0.03), x1 = Math.min(1, r[1]/w + 0.03); return { x:x0, y:top, w:x1-x0, h:1-top }; }
  return [box(a), box(b)];
}

function validBox(b){
  return b && b.w > 0.02 && b.h > 0.02 && b.w < 0.9 && b.h < 0.9 && b.x >= -0.05 && b.y >= -0.05 && b.x+b.w <= 1.05 && b.y+b.h <= 1.05;
}

function Char(def, img){
  this.id = def.id; this.def = def; this.img = img;
  this.style = def.walkStyle || 'walk';
  var parts = def.parts || {};
  var legs = (parts.legs || []).filter(validBox).filter(function(b){ return b.y > 0.35; }).slice(0,4);
  if (!legs.length && this.style === 'walk') legs = guessLegs(img);
  var arms = (parts.arms || []).concat(parts.wings || []).filter(validBox).slice(0,4);
  this.legs = legs; this.arms = arms;
  var iw = img.width, ih = img.height;
  this.m = Math.round(Math.max(iw, ih)*0.35); // dönen parçalar için pay
  this.cv = makeCanvas(iw + this.m*2, ih + this.m*2);
  this.tint = makeCanvas(this.cv.width, this.cv.height);
  // gövde: bacak/kol bölgeleri silinmiş hali
  this.body = makeCanvas(iw, ih);
  var bx = this.body.getContext('2d'); bx.drawImage(img,0,0);
  bx.globalCompositeOperation = 'destination-out';
  var self = this;
  this.limbs = [];
  function cut(b, kind, idx){
    var x0 = Math.max(0, Math.floor(b.x*iw)), y0 = Math.max(0, Math.floor(b.y*ih));
    var x1 = Math.min(iw, Math.ceil((b.x+b.w)*iw)), y1 = Math.min(ih, Math.ceil((b.y+b.h)*ih));
    if (x1-x0 < 3 || y1-y0 < 3) return;
    var lc = makeCanvas(x1-x0, y1-y0); lc.getContext('2d').drawImage(img, x0, y0, x1-x0, y1-y0, 0, 0, x1-x0, y1-y0);
    bx.fillRect(x0, y0, x1-x0, y1-y0);
    var cx = (x0+x1)/2, pivot;
    if (kind === 'leg') pivot = { x: cx, y: y0 };
    else { // kol/kanat: gövdeye en yakın kenardan döner
      var left = cx < iw/2; pivot = { x: left ? x1 : x0, y: (y0+y1)/2 };
    }
    self.limbs.push({ kind: kind, idx: idx, c: lc, x: x0, y: y0, pivot: pivot, side: cx < iw/2 ? -1 : 1 });
  }
  legs.forEach(function(b,i){ cut(b,'leg',i); });
  arms.forEach(function(b,i){ cut(b,'arm',i); });
  bx.globalCompositeOperation = 'source-over';

  var y = rnd(floorTop()+ (floorBottom()-floorTop())*0.45, floorBottom()-20);
  this.x = W/2 + rnd(-W*0.2, W*0.2); this.y = y; this.z = 0; this.vz = 0;
  this.face = 1; this.faceVis = 1;
  this.scale = def.scale || 1;
  this.state = 'idle'; this.stateT = now(); this.nextThink = now() + rnd(1500, 3500);
  this.target = null; this.phase = rnd(0, 6);
  this.birth = 0; this.birthT = 0; this.from = null;
  this.speaking = 0; this.picked = false; this.lastStep = 0;
  this.sleep = false;
  this.acc = def.acc || [];
  this.speedMul = 1; this.hidden = false;
  this.head = validBox(parts.head) ? { x: parts.head.x*iw, y: parts.head.y*ih, w: parts.head.w*iw, h: parts.head.h*ih } : guessHead(img);
}
function guessHead(img){
  var w = img.width, h = img.height, c = makeCanvas(w,h), x = c.getContext('2d'); x.drawImage(img,0,0);
  var d = x.getImageData(0,0,w,h).data, x0 = w, x1 = 0, y0 = h, lim = Math.floor(h*0.38);
  for (var yy=0; yy<lim; yy++) for (var xx=0; xx<w; xx++) if (d[(yy*w+xx)*4+3] > 128) { if (xx<x0) x0=xx; if (xx>x1) x1=xx; if (yy<y0) y0=yy; }
  if (x1 <= x0) return { x: w*0.2, y: 0, w: w*0.6, h: h*0.35 };
  return { x: x0, y: y0, w: x1-x0, h: lim-y0 };
}
function drawAcc(x, c, kind, m, s, dx){
  var hd = c.head, hx = m + hd.x + hd.w/2 + dx, hy = m + hd.y, hw = Math.max(20, hd.w), iw = c.img.width, ih = c.img.height;
  x.save();
  if (kind === 'sapka') {
    var ph = hw*0.75, pw = hw*0.55; x.translate(hx, hy + hw*0.06); x.rotate(-0.12 + Math.sin(s*3)*0.04);
    x.fillStyle = '#A78BFA'; x.beginPath(); x.moveTo(-pw/2, 0); x.lineTo(pw/2, 0); x.lineTo(0, -ph); x.closePath(); x.fill();
    x.strokeStyle = '#FFD23F'; x.lineWidth = hw*0.05; for (var k=1;k<4;k++){ var yy = -ph*k/4, ww = pw*(1-k/4)/2; x.beginPath(); x.moveTo(-ww, yy); x.lineTo(ww, yy); x.stroke(); }
    x.fillStyle = '#FF6B9A'; x.beginPath(); x.arc(0, -ph, hw*0.09, 0, 7); x.fill();
  } else if (kind === 'tac') {
    var cw = hw*0.62, ch = hw*0.32; x.translate(hx, hy + hw*0.04);
    x.fillStyle = '#FFD23F'; x.strokeStyle = '#c99300'; x.lineWidth = hw*0.025;
    x.beginPath(); x.moveTo(-cw/2, 0); x.lineTo(-cw/2, -ch); x.lineTo(-cw/4, -ch*0.5); x.lineTo(0, -ch*1.15); x.lineTo(cw/4, -ch*0.5); x.lineTo(cw/2, -ch); x.lineTo(cw/2, 0); x.closePath(); x.fill(); x.stroke();
    ['#FF4D5E','#4ECDC4','#FF4D5E'].forEach(function(col, i){ x.fillStyle = col; x.beginPath(); x.arc((i-1)*cw*0.3, -ch*0.3, hw*0.04, 0, 7); x.fill(); });
  } else if (kind === 'gozluk') {
    var gy = hy + hd.h*0.45, gw = hd.w*0.34, gh = hd.w*0.2, gap = hd.w*0.06;
    x.fillStyle = 'rgba(20,20,30,0.92)'; x.strokeStyle = '#111'; x.lineWidth = Math.max(2, hw*0.03);
    [-1, 1].forEach(function(sd){ var gx = hx + sd*(gap + gw/2) - gw/2; x.beginPath(); if (x.roundRect) x.roundRect(gx, gy - gh/2, gw, gh, gh*0.4); else x.rect(gx, gy - gh/2, gw, gh); x.fill(); });
    x.beginPath(); x.moveTo(hx - gap, gy - gh*0.2); x.lineTo(hx + gap, gy - gh*0.2); x.stroke();
    x.fillStyle = 'rgba(255,255,255,0.6)'; [-1,1].forEach(function(sd){ x.fillRect(hx + sd*(gap + gw/2) - gw*0.3, gy - gh*0.3, gw*0.18, gh*0.15); });
  } else if (kind === 'papyon') {
    var by = m + hd.y + hd.h, bw = hw*0.42, bh = hw*0.22; x.translate(hx, by); x.rotate(Math.sin(s*4)*0.08);
    x.fillStyle = '#FF4D5E'; x.beginPath(); x.moveTo(0, 0); x.lineTo(-bw/2, -bh/2); x.lineTo(-bw/2, bh/2); x.closePath(); x.moveTo(0, 0); x.lineTo(bw/2, -bh/2); x.lineTo(bw/2, bh/2); x.closePath(); x.fill();
    x.fillStyle = '#c2183a'; x.beginPath(); x.arc(0, 0, bh*0.28, 0, 7); x.fill();
  } else if (kind === 'balon') {
    var sx0 = m + iw*0.9, sy0 = m + ih*0.55, bx = m + iw*1.08 + Math.sin(s*1.6)*iw*0.04, byy = m - ih*0.12 + Math.cos(s*1.3)*ih*0.02, br = Math.max(14, iw*0.13);
    x.strokeStyle = 'rgba(60,60,60,0.8)'; x.lineWidth = 2; x.beginPath(); x.moveTo(sx0, sy0); x.quadraticCurveTo(bx - br*0.6, (sy0+byy)/2, bx, byy + br*1.2); x.stroke();
    x.fillStyle = '#FF4D5E'; x.beginPath(); x.ellipse(bx, byy, br, br*1.2, 0, 0, 7); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.5)'; x.beginPath(); x.ellipse(bx - br*0.35, byy - br*0.4, br*0.2, br*0.32, -0.4, 0, 7); x.fill();
  } else if (kind === 'pelerin') {
    var top = m + hd.y + hd.h*0.95, bot = m + ih*0.92, cx0 = m + iw/2 + dx, w1 = hd.w*0.7, w2 = iw*0.95, wave = Math.sin(s*5)*iw*0.04;
    x.fillStyle = '#FF4D5E'; x.beginPath(); x.moveTo(cx0 - w1/2, top); x.lineTo(cx0 + w1/2, top);
    x.quadraticCurveTo(cx0 + w2/2 + wave, (top+bot)/2, cx0 + w2/2 + wave*1.5, bot); x.lineTo(cx0 - w2/2 + wave*1.5, bot);
    x.quadraticCurveTo(cx0 - w2/2 + wave, (top+bot)/2, cx0 - w1/2, top); x.closePath(); x.fill();
    x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(cx0 - w2/2 + wave*1.5, bot - ih*0.04, w2, ih*0.04);
  }
  x.restore();
}
Char.prototype.height = function(){
  return H*0.3 * depthScale(this.y) * this.scale;
};
Char.prototype.setState = function(s){ this.state = s; this.stateT = now(); };
Char.prototype.walkTo = function(x, y){
  this.target = { x: clamp(x, W*0.08, W*0.92), y: clamp(y, floorTop()+10, floorBottom()) };
  this.sleep = false; this.setState('walk');
};
Char.prototype.think = function(t){
  if (this.picked || this.birth || game || this.story) return;
  if (t < this.nextThink) return;
  this.nextThink = t + rnd(2500, 6000);
  if (this.sleep || this.state !== 'idle') return;
  var r = Math.random();
  var friend = null, best = 1e9, self = this;
  chars.forEach(function(o){ if (o !== self) { var dd = Math.abs(o.x - self.x) + Math.abs(o.y - self.y); if (dd < best) { best = dd; friend = o; } } });
  if (friend && r < 0.35) {
    // arkadaşına doğru git ve el salla
    var side = friend.x > this.x ? -1 : 1;
    this.walkTo(friend.x + side * friend.height()*0.7, friend.y + rnd(-10, 10));
    this.meet = friend;
  } else if (r < 0.75) {
    this.walkTo(this.x + rnd(-W*0.35, W*0.35), this.y + rnd(-H*0.12, H*0.12));
  } else if (r < 0.88) {
    this.action('jump');
  } else {
    this.action('wave');
  }
};
Char.prototype.action = function(a){
  this.sleep = false;
  if (a === 'jump') { this.jumps = 3; if (this.z <= 0.5) { this.vz = this.height()*0.075; sfx.boing(); } this.setState('jump'); }
  else if (a === 'dance') { this.setState('dance'); this.lastBeat = 0; this.danceX = this.x; }
  else if (a === 'spin') { this.setState('spin'); sfx.pop(); }
  else if (a === 'wave') { this.setState('wave'); }
  else if (a === 'sleep') { this.sleep = true; this.setState('idle'); sfx.snore(); }
  else if (a === 'walk') {
    // uzun yürüyüş: birkaç durak
    this.path = [];
    for (var k = 0; k < 3; k++) this.path.push({ x: rnd(W*0.12, W*0.88), y: rnd(floorTop() + (floorBottom()-floorTop())*0.25, floorBottom()) });
    var f = this.path.shift(); this.walkTo(f.x, f.y);
  }
};
Char.prototype.update = function(t, dt){
  this.think(t);
  var st = (t - this.stateT)/1000;
  var hgt = this.height();
  if (this.state === 'walk' && this.target && !this.picked) {
    var dx = this.target.x - this.x, dy = this.target.y - this.y, dist = Math.hypot(dx, dy);
    var speed = hgt * (this.style === 'roll' ? 1.4 : this.style === 'fly' ? 1.1 : this.style === 'slither' ? 0.5 : 0.8) * this.speedMul;
    if (Math.abs(dx) > 4) this.face = dx > 0 ? 1 : -1;
    if (dist < 6 && this.path && this.path.length) {
      var nx = this.path.shift(); this.target = { x: nx.x, y: nx.y };
    } else if (dist < 6) {
      this.target = null; this.setState('idle');
      if (this.meet) { this.face = this.meet.x > this.x ? 1 : -1; this.setState('wave'); this.meet.face = -this.face; this.meet.setState('wave'); this.meet = null; }
    } else {
      var step = Math.min(dist, speed*dt);
      this.x += dx/dist*step; this.y += dy/dist*step;
      if (this.style === 'hop' && this.z <= 0.5) { this.vz = hgt*0.045; }
      if (t - this.lastStep > 330 && this.style !== 'fly') { this.lastStep = t; sfx.step(); if (this.style !== 'roll') particles.push({ kind:'print', x:this.x, y:this.y, t:t, life:1400, s: depthScale(this.y)*5 }); }
    }
  }
  if (this.state === 'jump' && st > 0.15 && this.z <= 0.5) {
    if (this.jumps > 1) { this.jumps--; this.vz = hgt*(0.06 + 0.02*Math.random()); this.stateT = t; sfx.boing(); }
    else { this.jumps = 0; this.setState('idle'); }
  }
  if (this.state === 'dance') {
    // müzik ritmi ve sağa sola kayma
    if (t - (this.lastBeat||0) > 760) { this.lastBeat = t; sfx.dance(); if (Math.random() < 0.3) burst(this.x, this.y - hgt*0.9, 4, 2); }
    this.x = clamp(this.danceX + Math.sin(st*2.2)*hgt*0.35, W*0.08, W*0.92);
    this.face = Math.cos(st*2.2) > 0 ? 1 : -1;
  }
  if ((this.state === 'dance' && st > 8) || (this.state === 'spin' && st > 2.4) || (this.state === 'wave' && st > 4)) this.setState('idle');
  // yerçekimi
  if (!this.picked) {
    var g = hgt * 0.42 * 60;
    if (this.z > 0 || this.vz > 0) {
      this.z += this.vz * dt * 60; this.vz -= g * dt / 60;
      if (this.z <= 0) { this.z = 0; if (this.vz < -hgt*0.03) { this.squash = t; } this.vz = 0; }
    }
  }
  this.faceVis += (this.face - this.faceVis) * Math.min(1, dt*9);
};
Char.prototype.compose = function(t){
  var c = this.cv, x = c.getContext('2d'), m = this.m, img = this.img, iw = img.width, ih = img.height;
  x.setTransform(1,0,0,1,0,0);
  x.clearRect(0,0,c.width,c.height);
  var s = t/1000 + this.phase, st = (t - this.stateT)/1000;
  var walking = this.state === 'walk';
  var dancing = this.state === 'dance';
  var swing = 0, armA = 0, wobA = 0.012, wobF = 2;
  if (walking) { swing = Math.sin(s*10) * 0.45; wobA = 0.025; wobF = 10; }
  if (dancing) { swing = Math.sin(s*12) * 0.5; armA = Math.sin(s*12) * 0.9; wobA = 0.07; wobF = 6; }
  if (this.state === 'wave') armA = Math.sin(s*14) * 0.7 - 0.5;
  if (this.picked) { swing = Math.sin(s*16) * 0.35; armA = Math.sin(s*16) * 0.5; }
  if (this.style === 'fly') { armA = Math.sin(s*(walking?22:12)) * 0.6; }
  if (this.sleep) { wobA = 0.006; wobF = 1.2; }
  var self = this;
  var hdx = Math.sin(s*wobF + this.head.y/ih*1.8) * iw * wobA * (1 - this.head.y/ih);
  if (this.acc.indexOf('pelerin') >= 0) drawAcc(x, this, 'pelerin', m, s, hdx);
  // bacaklar (gövdenin arkasında)
  this.limbs.forEach(function(L){
    if (L.kind !== 'leg') return;
    var a = (L.idx % 2 === 0 ? 1 : -1) * swing;
    x.save(); x.translate(m + L.pivot.x, m + L.pivot.y); x.rotate(a); x.drawImage(L.c, L.x - L.pivot.x, L.y - L.pivot.y); x.restore();
  });
  // gövde: jöle gibi esneyen şeritler
  var stripH = 3, slither = this.style === 'slither' || this.style === 'swim';
  if (slither) {
    for (var xx = 0; xx < iw; xx += stripH) {
      var dy = Math.sin(s*(walking?8:3) - xx/iw*7) * ih * (walking?0.06:0.025);
      x.drawImage(this.body, xx, 0, stripH, ih, m + xx, m + dy, stripH, ih);
    }
  } else {
    for (var yy = 0; yy < ih; yy += stripH) {
      var k = 1 - yy/ih; // üst taraf daha çok sallanır
      var dx = Math.sin(s*wobF + yy/ih*1.8) * iw * wobA * k;
      x.drawImage(this.body, 0, yy, iw, stripH, m + dx, m + yy, iw, stripH);
    }
  }
  // kollar/kanatlar
  this.limbs.forEach(function(L){
    if (L.kind !== 'arm') return;
    var a = armA * -L.side;
    if (self.style === 'fly') a = armA * -L.side;
    x.save(); x.translate(m + L.pivot.x, m + L.pivot.y); x.rotate(a); x.drawImage(L.c, L.x - L.pivot.x, L.y - L.pivot.y); x.restore();
  });
  this.acc.forEach(function(k){ if (k !== 'pelerin') drawAcc(x, self, k, m, s, hdx); });
};
Char.prototype.bounds = function(){
  var h = this.height(), w = h * this.img.width / this.img.height;
  var sx = tilt.ox, sy = tilt.oy;
  return { x: this.x + sx - w/2, y: this.y + sy - this.z - h, w: w, h: h };
};
Char.prototype.draw = function(t){
  if (this.hidden) return;
  this.compose(t);
  var img = this.img, h = this.height(), sc = h / img.height;
  var s = t/1000 + this.phase, st = (t - this.stateT)/1000;
  var px = this.x + tilt.ox, py = this.y + tilt.oy;
  var lift = this.z + (this.style === 'fly' ? h*0.25 + Math.sin(s*3)*h*0.05 : 0) + (this.style === 'swim' ? h*0.08 + Math.sin(s*2)*h*0.03 : 0);
  if (this.picked) lift = h*0.25;
  // gölge
  ctx.save();
  var shw = h*0.45*this.img.width/this.img.height + h*0.15, shs = 1/(1 + lift/(h*0.6));
  ctx.fillStyle = 'rgba(0,0,0,' + (0.28*shs) + ')';
  ctx.beginPath(); ctx.ellipse(px, py, shw*shs*0.8, h*0.07*shs, 0, 0, Math.PI*2); ctx.fill();
  ctx.restore();

  var sx = 1, sy = 1, rot = 0;
  // nefes alma
  sy *= 1 + Math.sin(s*2.2)*0.015;
  if (this.state === 'walk') { lift += Math.abs(Math.sin(s*10))*h*0.03; rot = Math.sin(s*10)*0.05; if (this.style==='roll') { lift = Math.abs(Math.sin(s*30))*h*0.008; rot = 0; } }
  if (this.state === 'dance') { rot = Math.sin(s*6)*0.25; lift += Math.abs(Math.sin(s*6))*h*0.1; }
  if (this.state === 'spin') { sx *= Math.cos(st/2.4*Math.PI*6); lift += Math.sin(Math.min(1, st/2.4)*Math.PI)*h*0.3; }
  if (this.sleep) { rot = -0.18; sy *= 0.96; }
  if (this.squash) { var q = (t - this.squash)/1000; if (q < 0.35) { var e = Math.sin(q/0.35*Math.PI)*0.18*(1-q/0.35); sy *= 1-e; sx *= 1+e; } else this.squash = 0; }
  if (this.vz > 0) { sy *= 1.06; sx *= 0.95; }
  if (this.speaking > t) { sy *= 1 + Math.abs(Math.sin(s*18))*0.04; }
  // doğum: masadan kalkarak canlanır
  var alpha = 1;
  if (this.birth) {
    var b = (t - this.birthT)/1000;
    if (b < 0.9) { sy *= 0.04 + 0.1*b; rot = 0; alpha = Math.min(1, b*3); }
    else if (b < 1.6) { var e2 = (b-0.9)/0.7; sy *= easeOutBack(e2); lift += Math.sin(e2*Math.PI)*h*0.35; }
    else { this.birth = 0; this.squash = t; sfx.boing(); this.setState('wave'); }
  }
  var face = this.faceVis; // -1..1, dönerken kâğıt inceliyor
  sx *= face;
  var thick = Math.max(2, h*0.018);

  var c = this.cv, m = this.m;
  // kenar kalınlığı ve beyaz sticker kenarı için gölge kopya
  var tx = this.tint.getContext('2d');
  tx.setTransform(1,0,0,1,0,0); tx.globalCompositeOperation='source-over'; tx.clearRect(0,0,c.width,c.height);
  tx.drawImage(c,0,0); tx.globalCompositeOperation='source-in'; tx.fillStyle='#ffffff'; tx.fillRect(0,0,c.width,c.height);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(px, py - lift);
  ctx.rotate(rot);
  ctx.scale(sc*sx, sc*sy);
  var ox = -(m + img.width/2), oy = -(m + img.height);
  var ow = 4/sc; // beyaz kenar kalınlığı
  // kalınlık (karton kenarı): koyulaşan katmanlar
  var layers = 5;
  for (var i = layers; i >= 1; i--) {
    ctx.globalAlpha = alpha;
    ctx.filter = 'brightness(' + (0.62 + 0.06*(layers-i)) + ')';
    ctx.drawImage(this.tint, ox + (i*thick/layers)/sc*(face>=0?-0.6:0.6), oy + (i*thick/layers)/sc);
  }
  ctx.filter = 'none';
  // beyaz kenar
  for (var a = 0; a < 8; a++) {
    var an = a/8*Math.PI*2;
    ctx.drawImage(this.tint, ox + Math.cos(an)*ow, oy + Math.sin(an)*ow);
  }
  ctx.drawImage(c, ox, oy);
  ctx.restore();

  if (this.sleep && Math.random() < 0.02) particles.push({ kind:'z', x: px + h*0.2, y: py - h*1.05, t: t, life: 2000, s: h*0.12 });
};
function easeOutBack(x){ var c1 = 1.70158, c3 = c1 + 1; return 1 + c3*Math.pow(x-1,3) + c1*Math.pow(x-1,2); }

// ---------------- Parçacıklar ----------------
var COLORS = ['#FFD23F','#FF6B6B','#4ECDC4','#A78BFA','#FF9F1C','#7BD389'];
function burst(x, y, n, spread){
  for (var i=0;i<n;i++) particles.push({ kind:'star', x:x, y:y, vx: rnd(-1,1)*spread, vy: rnd(-1.6,-0.3)*spread, t: now(), life: rnd(700,1400), s: rnd(4,10), c: COLORS[i%COLORS.length], r: rnd(0,6) });
}
function star(x, y, r, rot){
  ctx.beginPath();
  for (var i=0;i<10;i++){ var a = rot + i*Math.PI/5, rr = i%2 ? r*0.45 : r; ctx.lineTo(x + Math.cos(a)*rr, y + Math.sin(a)*rr); }
  ctx.closePath(); ctx.fill();
}
function drawParticles(t, dt){
  particles = particles.filter(function(p){ return t - p.t < p.life; });
  particles.forEach(function(p){
    var k = (t - p.t)/p.life;
    ctx.save();
    if (p.kind === 'star') {
      p.x += p.vx*dt*60; p.y += p.vy*dt*60; p.vy += 0.12*dt*60;
      ctx.globalAlpha = 1-k; ctx.fillStyle = p.c; star(p.x + tilt.ox, p.y + tilt.oy, p.s*(1-k*0.5), p.r + k*4);
    } else if (p.kind === 'print') {
      ctx.globalAlpha = 0.25*(1-k); ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(p.x + tilt.ox, p.y + tilt.oy, p.s, p.s*0.45, 0, 0, Math.PI*2); ctx.fill();
    } else if (p.kind === 'z') {
      ctx.globalAlpha = 1-k; ctx.fillStyle = '#ffffff'; ctx.font = 'bold ' + Math.round(p.s) + 'px sans-serif';
      ctx.fillText('z', p.x + tilt.ox + Math.sin(k*6)*10, p.y + tilt.oy - k*60);
    }
    ctx.restore();
  });
}
function drawBubbles(t){
  bubbles = bubbles.filter(function(b){ return t < b.until; });
  bubbles.forEach(function(b){
    var c = chars.filter(function(cc){ return cc.id === b.id; })[0]; if (!c) return;
    var bb = c.bounds();
    var fs = Math.round(Math.max(15, Math.min(22, W/20)));
    ctx.save(); ctx.font = '600 ' + fs + 'px sans-serif';
    var words = b.text.split(' '), lines = [], line = '', maxW = W*0.6;
    words.forEach(function(wd){ var tt = line ? line + ' ' + wd : wd; if (ctx.measureText(tt).width > maxW && line) { lines.push(line); line = wd; } else line = tt; });
    if (line) lines.push(line);
    var lw = Math.max.apply(null, lines.map(function(l){ return ctx.measureText(l).width; })) + 28;
    var lh = lines.length*(fs+6) + 18;
    var bx = clamp(bb.x + bb.w/2 - lw/2, 10, W - lw - 10), by = Math.max(10, bb.y - lh - 18);
    var pop = Math.min(1, (t - b.t)/180);
    ctx.translate(bx + lw/2, by + lh); ctx.scale(pop, pop); ctx.translate(-(bx + lw/2), -(by + lh));
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    roundRect(bx, by, lw, lh, 18); ctx.fill();
    ctx.beginPath(); var tx = clamp(bb.x + bb.w/2, bx + 20, bx + lw - 20); ctx.moveTo(tx-10, by+lh-1); ctx.lineTo(tx, by+lh+14); ctx.lineTo(tx+10, by+lh-1); ctx.fill();
    ctx.fillStyle = '#2b2140';
    lines.forEach(function(l, i){ ctx.fillText(l, bx + 14, by + 12 + fs + i*(fs+6) - 3); });
    ctx.restore();
  });
}
function roundRect(x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }

// ---------------- Arka plan ----------------
// ---------------- Sahneler (hepsi kodla çizilir, telifsiz) ----------------
function seeded(i){ var x = Math.sin(i*127.1 + 311.7)*43758.5453; return x - Math.floor(x); }
function grad(y0, y1, stops){ var g = ctx.createLinearGradient(0, y0, 0, y1); stops.forEach(function(st){ g.addColorStop(st[0], st[1]); }); return g; }
function cloud(x, y, r){ ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.arc(x + r*0.9, y - r*0.35, r*0.8, 0, 7); ctx.arc(x + r*1.8, y, r*0.9, 0, 7); ctx.arc(x + r*0.9, y + r*0.2, r*0.85, 0, 7); ctx.fill(); }
function tree(x, y, s){
  ctx.fillStyle = '#7a4a26'; ctx.fillRect(x - s*0.08, y - s*0.7, s*0.16, s*0.7);
  ctx.fillStyle = '#3f9e4a'; ctx.beginPath(); ctx.arc(x, y - s*0.85, s*0.38, 0, 7); ctx.arc(x - s*0.28, y - s*0.65, s*0.28, 0, 7); ctx.arc(x + s*0.28, y - s*0.65, s*0.28, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.arc(x - s*0.1, y - s*0.95, s*0.16, 0, 7); ctx.fill();
}
function pine(x, y, s, snow){
  ctx.fillStyle = '#6b4226'; ctx.fillRect(x - s*0.06, y - s*0.25, s*0.12, s*0.25);
  for (var k = 0; k < 3; k++) {
    var ty = y - s*0.2 - k*s*0.28, wd = s*(0.42 - k*0.1);
    ctx.fillStyle = '#2f7d4f'; ctx.beginPath(); ctx.moveTo(x, ty - s*0.4); ctx.lineTo(x + wd, ty); ctx.lineTo(x - wd, ty); ctx.closePath(); ctx.fill();
    if (snow) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(x, ty - s*0.4); ctx.lineTo(x + wd*0.45, ty - s*0.22); ctx.lineTo(x - wd*0.45, ty - s*0.22); ctx.closePath(); ctx.fill(); }
  }
}
function sun(x, y, r, t){
  ctx.save(); ctx.translate(x, y); ctx.rotate(t/4000);
  ctx.strokeStyle = 'rgba(255,214,70,0.8)'; ctx.lineWidth = r*0.18; ctx.lineCap = 'round';
  for (var k = 0; k < 10; k++) { ctx.rotate(Math.PI/5); ctx.beginPath(); ctx.moveTo(r*1.3, 0); ctx.lineTo(r*1.7, 0); ctx.stroke(); }
  ctx.restore();
  ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
}
var SCENES = {
  sinif: function(t){
    var ft = floorTop();
    ctx.fillStyle = grad(0, ft, [[0, '#f6e7c8'], [1, '#efd9ae']]); ctx.fillRect(0, 0, W, ft);
    // kara tahta
    var bw = W*0.8, bh = ft*0.5, bx = (W-bw)/2, by = ft*0.18;
    ctx.fillStyle = '#9a6234'; ctx.fillRect(bx - 8, by - 8, bw + 16, bh + 16);
    ctx.fillStyle = '#2f5d46'; ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = '#9a6234'; ctx.fillRect(bx - 8, by + bh + 4, bw + 16, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = '700 ' + Math.round(bh*0.2) + 'px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('A B C', bx + bw*0.08, by + bh*0.36); ctx.fillText('1 + 1 = 2', bx + bw*0.08, by + bh*0.72);
    ctx.save(); ctx.fillStyle = 'rgba(255,230,120,0.9)'; star(bx + bw*0.8, by + bh*0.38, bh*0.14, 0); ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(bx + bw*0.78, by + bh*0.75, bh*0.1, 0.2, Math.PI - 0.2); ctx.stroke();
    // saat
    var cx = W*0.88, cy = ft*0.09, cr = Math.min(W, H)*0.05;
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#444'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, cr, 0, 7); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(t/9000)*cr*0.8, cy + Math.sin(t/9000)*cr*0.8); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - cr*0.55); ctx.stroke();
    // süpürgelik ve parke
    ctx.fillStyle = '#c99b6d'; ctx.fillRect(0, ft, W, H - ft);
    ctx.fillStyle = '#7a5434'; ctx.fillRect(0, ft - 6, W, 10);
    ctx.strokeStyle = 'rgba(90,55,25,0.25)'; ctx.lineWidth = 2;
    for (var i = 1; i < 8; i++) { var y = ft + (H-ft)*Math.pow(i/8, 1.4); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    for (var j = -6; j <= 6; j++) { ctx.beginPath(); ctx.moveTo(W/2 + j*W*0.06, ft); ctx.lineTo(W/2 + j*W*0.3, H); ctx.stroke(); }
  },
  park: function(t){
    var ft = floorTop();
    ctx.fillStyle = grad(0, ft, [[0, '#69c3ff'], [1, '#c9ecff']]); ctx.fillRect(0, 0, W, ft);
    sun(W*0.82, ft*0.2, Math.min(W, H)*0.06, t);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    for (var c = 0; c < 4; c++) { var cx = ((seeded(c)*W + t*0.012*(1 + c*0.3)) % (W + 200)) - 100; cloud(cx, ft*(0.12 + seeded(c+9)*0.3), Math.min(W,H)*0.035*(1 + seeded(c+3))); }
    ctx.fillStyle = '#8fd17e'; ctx.beginPath(); ctx.ellipse(W*0.2, ft + 10, W*0.45, ft*0.25, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#7cc56c'; ctx.beginPath(); ctx.ellipse(W*0.8, ft + 10, W*0.5, ft*0.2, 0, Math.PI, 0); ctx.fill();
    for (var k = 0; k < 5; k++) tree(W*(0.08 + k*0.22) + seeded(k)*20, ft + 6, Math.min(W, H)*(0.16 + seeded(k+20)*0.06));
    ctx.fillStyle = grad(ft, H, [[0, '#7fcf68'], [1, '#4fa64a']]); ctx.fillRect(0, ft, W, H - ft);
    var cols = ['#ff6b9a', '#ffd23f', '#ffffff', '#a78bfa'];
    for (var f = 0; f < 40; f++) {
      var fx = seeded(f + 50)*W, fy = ft + Math.pow(seeded(f + 90), 0.8)*(H - ft), fs = 2 + (fy - ft)/(H - ft)*5;
      ctx.fillStyle = cols[f % 4]; ctx.beginPath(); ctx.arc(fx, fy, fs, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(fx, fy, fs*0.4, 0, 7); ctx.fill();
    }
  },
  sahil: function(t){
    var ft = floorTop(), sea = ft*0.62;
    ctx.fillStyle = grad(0, sea, [[0, '#ffb26b'], [0.5, '#ffd9a0'], [1, '#bfe8ff']]); ctx.fillRect(0, 0, W, sea);
    sun(W*0.25, sea*0.55, Math.min(W, H)*0.07, t);
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; cloud(((t*0.01) % (W + 200)) - 100, sea*0.3, Math.min(W,H)*0.03);
    ctx.fillStyle = grad(sea, ft + 20, [[0, '#2b8fd6'], [1, '#5cc6e8']]); ctx.fillRect(0, sea, W, ft - sea + 20);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 3;
    for (var r = 0; r < 4; r++) {
      var wy = sea + (ft - sea)*(0.2 + r*0.22);
      ctx.beginPath();
      for (var x = 0; x <= W; x += 10) ctx.lineTo(x, wy + Math.sin(x/30 + t/500 + r)*3);
      ctx.stroke();
    }
    // köpük ve kum
    ctx.fillStyle = grad(ft, H, [[0, '#f7dfa5'], [1, '#e9c37c']]);
    ctx.beginPath(); ctx.moveTo(0, ft + 10);
    for (var x2 = 0; x2 <= W; x2 += 10) ctx.lineTo(x2, ft + 8 + Math.sin(x2/40 + t/700)*6);
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
    // palmiye
    var px = W*0.88, py = ft + (H-ft)*0.15, ps = Math.min(W, H)*0.35;
    ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = ps*0.07; ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(px - ps*0.15, py - ps*0.5, px - ps*0.05, py - ps); ctx.stroke();
    ctx.fillStyle = '#3aa457';
    for (var l = 0; l < 6; l++) { ctx.save(); ctx.translate(px - ps*0.05, py - ps); ctx.rotate(l*Math.PI/3 + Math.sin(t/900)*0.05); ctx.beginPath(); ctx.ellipse(ps*0.22, 0, ps*0.24, ps*0.06, 0.3, 0, 7); ctx.fill(); ctx.restore(); }
    // şemsiye
    var ux = W*0.15, uy = ft + (H-ft)*0.2, us = Math.min(W, H)*0.14;
    ctx.strokeStyle = '#666'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(ux, uy); ctx.lineTo(ux, uy - us); ctx.stroke();
    for (var u = 0; u < 6; u++) { ctx.fillStyle = u % 2 ? '#ffffff' : '#ff6b6b'; ctx.beginPath(); ctx.moveTo(ux, uy - us*1.25); ctx.arc(ux, uy - us, us*0.8, Math.PI + u*Math.PI/6, Math.PI + (u+1)*Math.PI/6); ctx.closePath(); ctx.fill(); }
    // deniz kabukları
    for (var sh = 0; sh < 10; sh++) { ctx.fillStyle = sh % 2 ? '#ffc0cb' : '#fff3e0'; ctx.beginPath(); ctx.arc(seeded(sh + 70)*W, ft + 30 + seeded(sh + 80)*(H - ft - 40), 4 + seeded(sh)*4, Math.PI, 0); ctx.fill(); }
  },
  uzay: function(t){
    var ft = floorTop();
    ctx.fillStyle = grad(0, H, [[0, '#0b0820'], [0.5, '#1d1446'], [1, '#2a1f45']]); ctx.fillRect(0, 0, W, H);
    for (var i = 0; i < 70; i++) { ctx.globalAlpha = 0.35 + 0.65*Math.abs(Math.sin(t/900 + i)); ctx.fillStyle = '#fff'; ctx.fillRect(seeded(i)*W, seeded(i + 200)*ft, 2, 2); }
    ctx.globalAlpha = 1;
    // halkalı gezegen
    var gx = W*0.75, gy = ft*0.35, gr = Math.min(W, H)*0.1;
    ctx.fillStyle = grad(gy - gr, gy + gr, [[0, '#ff9f68'], [1, '#c2477a']]); ctx.beginPath(); ctx.arc(gx, gy, gr, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,220,180,0.8)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(gx, gy, gr*1.7, gr*0.45, -0.3, 0, 7); ctx.stroke();
    // kayan yıldız
    var k = (t % 6000)/6000; if (k < 0.15) { ctx.strokeStyle = 'rgba(255,255,255,' + (1 - k/0.15) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(W*(0.1 + k*4), ft*(0.1 + k*2)); ctx.lineTo(W*(0.1 + k*4) - 40, ft*(0.1 + k*2) - 20); ctx.stroke(); }
    // ay yüzeyi
    ctx.fillStyle = grad(ft, H, [[0, '#b7b4c7'], [1, '#7d7a92']]);
    ctx.beginPath(); ctx.moveTo(0, ft + 12); ctx.quadraticCurveTo(W/2, ft - 18, W, ft + 12); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
    for (var c = 0; c < 9; c++) { var cx = seeded(c + 40)*W, cy = ft + 30 + seeded(c + 60)*(H - ft - 40), cr = 8 + seeded(c)*22*(cy - ft)/(H - ft);
      ctx.fillStyle = 'rgba(80,76,100,0.45)'; ctx.beginPath(); ctx.ellipse(cx, cy, cr, cr*0.4, 0, 0, 7); ctx.fill(); }
    // Dünya
    ctx.fillStyle = '#3c8de0'; ctx.beginPath(); ctx.arc(W*0.18, ft*0.22, Math.min(W,H)*0.04, 0, 7); ctx.fill();
    ctx.fillStyle = '#5fc46a'; ctx.beginPath(); ctx.arc(W*0.17, ft*0.21, Math.min(W,H)*0.018, 0, 7); ctx.fill();
  },
  kar: function(t){
    var ft = floorTop();
    ctx.fillStyle = grad(0, ft, [[0, '#8fb8e8'], [1, '#dcebfb']]); ctx.fillRect(0, 0, W, ft);
    ctx.fillStyle = '#eef5ff'; ctx.beginPath(); ctx.moveTo(0, ft); ctx.lineTo(W*0.25, ft*0.55); ctx.lineTo(W*0.5, ft); ctx.lineTo(W*0.72, ft*0.6); ctx.lineTo(W, ft); ctx.closePath(); ctx.fill();
    for (var k = 0; k < 7; k++) pine(W*(0.04 + k*0.16) + seeded(k)*16, ft + 8, Math.min(W, H)*(0.18 + seeded(k + 5)*0.08), true);
    ctx.fillStyle = grad(ft, H, [[0, '#ffffff'], [1, '#dfe9f7']]); ctx.fillRect(0, ft, W, H - ft);
    // kardan adam
    var sx = W*0.85, sy = ft + (H-ft)*0.18, sr = Math.min(W, H)*0.05;
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#c9d6ea'; ctx.lineWidth = 2;
    [[0, 1.3], [-1.9, 1], [-3.4, 0.7]].forEach(function(b){ ctx.beginPath(); ctx.arc(sx, sy + b[0]*sr, sr*b[1], 0, 7); ctx.fill(); ctx.stroke(); });
    ctx.fillStyle = '#ff8c2b'; ctx.beginPath(); ctx.moveTo(sx, sy - 3.4*sr); ctx.lineTo(sx + sr*0.8, sy - 3.3*sr); ctx.lineTo(sx, sy - 3.2*sr); ctx.fill();
    ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(sx - sr*0.22, sy - 3.55*sr, 2.5, 0, 7); ctx.arc(sx + sr*0.22, sy - 3.55*sr, 2.5, 0, 7); ctx.fill();
    // yağan kar
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    for (var f = 0; f < 70; f++) { var fx = (seeded(f)*W + Math.sin(t/1000 + f)*20) % W, fy = (seeded(f + 300)*H + t*0.04*(0.6 + seeded(f + 7))) % H; ctx.beginPath(); ctx.arc(fx, fy, 1.5 + seeded(f + 11)*2.5, 0, 7); ctx.fill(); }
  }
};

function drawBackground(t){
  if (scene !== 'camera' && scene !== 'masa' && SCENES[scene]) { SCENES[scene](t); return; }
  if (scene === 'camera' && camOn && camReady && video.videoWidth) {
    var vw = video.videoWidth, vh = video.videoHeight, s = Math.max(W/vw, H/vh);
    ctx.drawImage(video, (W - vw*s)/2, (H - vh*s)/2, vw*s, vh*s);
    return;
  }
  // kamera yoksa: tahta masa
  var g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2a1f45'); g.addColorStop(0.38, '#3b2d63'); g.addColorStop(0.42, '#c98b55'); g.addColorStop(1, '#8a5530');
  ctx.fillStyle = g; ctx.fillRect(0,0,W,H);
  ctx.strokeStyle = 'rgba(70,35,10,0.18)'; ctx.lineWidth = 2;
  for (var i=1;i<7;i++){ var y = floorTop() + (H-floorTop())*Math.pow(i/7, 1.4); ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
  // yıldızlar
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  for (var j=0;j<24;j++){ var sx = (j*97.3 % 1)*W, sx2 = ((j*0.618) % 1)*W, sy = ((j*0.377) % 1)*floorTop()*0.95; ctx.globalAlpha = 0.3 + 0.3*Math.sin(t/700 + j); ctx.fillRect(sx2, sy, 2, 2); }
  ctx.globalAlpha = 1;
}

function editRect(){
  var im = edit.img, s = Math.min(W/im.width, (H*0.78)/im.height);
  var w = im.width*s, h = im.height*s;
  return { x: (W-w)/2, y: (H*0.82 - h)/2 + H*0.04, w: w, h: h };
}
function drawEdit(t){
  if (!edit || !edit.img) return;
  var r = editRect();
  ctx.save();
  ctx.fillStyle = '#140f26'; ctx.fillRect(0,0,W,H);
  ctx.drawImage(edit.img, r.x, r.y, r.w, r.h);
  var res = edit.result;
  if (res && res.ok && edit.cutImg) {
    // seçilmeyen yerleri karart, seçileni parlat
    ctx.fillStyle = 'rgba(15,10,30,0.72)'; ctx.fillRect(r.x, r.y, r.w, r.h);
    var cx = r.x + res.rect.x*r.w, cy = r.y + res.rect.y*r.h, cw = res.rect.w*r.w, ch = res.rect.h*r.h;
    var pulse = 0.55 + 0.45*Math.sin(t/260);
    ctx.shadowColor = 'rgba(255,210,63,' + pulse + ')'; ctx.shadowBlur = 18;
    ctx.drawImage(edit.cutImg, cx, cy, cw, ch);
    ctx.shadowBlur = 0;
  }
  var pts = edit.drawing.length ? edit.drawing : edit.lasso;
  if (pts.length > 1) {
    ctx.strokeStyle = '#FFD23F'; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.setLineDash([10, 8]); ctx.lineDashOffset = -t/30;
    ctx.beginPath();
    pts.forEach(function(p, k){ var X = r.x + p[0]*r.w, Y = r.y + p[1]*r.h; if (k) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); });
    if (!edit.drawing.length) ctx.closePath();
    ctx.stroke(); ctx.setLineDash([]);
  }
  if (edit.busy) { ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = '700 18px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Kesiliyor…', W/2, r.y + r.h/2); }
  ctx.restore();
}
function runEdit(){
  if (!edit) return;
  edit.busy = true;
  var opts = { lasso: edit.lasso.length > 5 ? edit.lasso : null, exact: edit.exact };
  cutout(edit.src, opts).then(function(res){
    edit.busy = false; edit.result = res;
    if (res.ok) loadImage(res.png).then(function(im){ if (edit) edit.cutImg = im; }); else edit.cutImg = null;
    post({ type:'edit', ok: !!res.ok, lasso: edit.lasso.length > 5, exact: edit.exact });
  }).catch(function(e){ edit.busy = false; edit.result = { ok:false }; post({ type:'edit', ok:false, error:String(e) }); });
}
function drawScan(t){
  if (!scanImg) return;
  var k = (t - scanT0)/1000;
  var s = Math.min(W/scanImg.width, H/scanImg.height);
  var w = scanImg.width*s, h = scanImg.height*s, x = (W-w)/2, y = (H-h)/2;
  var a = scanFade ? Math.max(0, 1 - (t - scanFade)/600) : 1;
  if (a <= 0) { scanImg = null; return; }
  ctx.save(); ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(20,12,40,0.6)'; ctx.fillRect(0,0,W,H);
  ctx.drawImage(scanImg, x, y, w, h);
  var ly = y + (Math.sin(k*2.4)*0.5+0.5)*h;
  var g = ctx.createLinearGradient(0, ly-40, 0, ly+4);
  g.addColorStop(0, 'rgba(167,139,250,0)'); g.addColorStop(1, 'rgba(167,139,250,0.85)');
  ctx.fillStyle = g; ctx.fillRect(x, ly-40, w, 44);
  ctx.fillStyle = '#fff'; ctx.fillRect(x, ly, w, 3);
  if (Math.random() < 0.5) burst(x + Math.random()*w - tilt.ox, ly - tilt.oy, 1, 2);
  ctx.restore();
}

// ---------------- Döngü ----------------
var last = now();
function frame(){
  var t = now(), dt = Math.min(0.05, (t - last)/1000); last = t;
  var ttx = scene === 'camera' ? tilt.tx : 0, tty = scene === 'camera' ? tilt.ty : 0;
  tilt.ox += (ttx - tilt.ox)*Math.min(1, dt*8);
  tilt.oy += (tty - tilt.oy)*Math.min(1, dt*8);
  ctx.setTransform(DPR,0,0,DPR,0,0);
  drawBackground(t);
  chars.forEach(function(c){ c.update(t, dt); });
  chars.slice().sort(function(a,b){ return a.y - b.y; }).forEach(function(c){ c.draw(t); });
  drawParticles(t, dt);
  updateGame(t, dt);
  drawGame(t);
  drawBubbles(t);
  drawScan(t);
  drawEdit(t);
  if (recorder) {
    ctx.save();
    ctx.font = '700 ' + Math.round(W/26) + 'px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 6;
    ctx.fillText('✨ ' + watermark, 14, H - 18);
    ctx.restore();
    if (t - recT0 > recMax) stopRecording();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------------- Ses çalma (sunucudan gelen seslendirme / karakter dili) ----------------
function b64ToBuf(b64){ var bin = atob(b64), n = bin.length, u = new Uint8Array(n); for (var i=0;i<n;i++) u[i] = bin.charCodeAt(i); return u.buffer; }
function setSpeaking(id, ms){ chars.forEach(function(c){ if (c.id === id) c.speaking = now() + ms; }); }
function playAudio(m){
  ensureAudio();
  if (!audio) { post({ type:'audioDone', token: m.token }); return; }
  audio.decodeAudioData(b64ToBuf(m.data)).then(function(buf){
    var src = audio.createBufferSource(); src.buffer = buf; src.playbackRate.value = m.rate || 1;
    var g = audio.createGain(); g.gain.value = 1.0; src.connect(g); g.connect(audio.destination); if (audioDest) g.connect(audioDest);
    var ms = buf.duration*1000/(m.rate || 1);
    if (m.id) setSpeaking(m.id, ms);
    src.onended = function(){ post({ type:'audioDone', token: m.token }); };
    src.start();
  }).catch(function(){ post({ type:'audioDone', token: m.token }); });
}
function babble(m){
  ensureAudio();
  var syl = Math.max(3, Math.min(28, Math.round(m.text.length/3))), base = 260*(m.pitch || 1.2), dur = 0.11;
  for (var i=0;i<syl;i++) tone(i%3===0?'triangle':'sine', base*rnd(0.85,1.3), base*rnd(0.8,1.25), dur*0.9, 0.16, i*dur);
  if (m.id) setSpeaking(m.id, syl*dur*1000);
  setTimeout(function(){ post({ type:'audioDone', token: m.token }); }, syl*dur*1000 + 150);
}

// ---------------- Mini oyunlar ----------------
var game = null;
function endGame(extra){
  var g = game; game = null;
  chars.forEach(function(c){ c.speedMul = 1; c.hidden = false; c.setState('idle'); c.target = null; c.path = null; });
  var o = { type:'game', name: g.name, score: g.score }; for (var k in (extra||{})) o[k] = extra[k];
  sfx.magic(); burst(W/2, H*0.45, 40, 4);
  post(o);
}
function startGame(name){
  if (!chars.length) return;
  ensureAudio();
  chars.forEach(function(c){ c.sleep = false; c.target = null; c.path = null; c.hidden = false; c.speedMul = 1; c.setState('idle'); });
  game = { name: name, t0: now(), score: 0, items: [], round: 0, msg: '' };
  if (name === 'stars') { game.dur = 30000; game.next = now() + 600; }
  if (name === 'hide') { game.rounds = 3; hideRound(); }
  if (name === 'race') {
    if (chars.length < 2) { game = null; post({ type:'game', name:'race', error:'needTwo' }); return; }
    game.finish = W*0.88;
    chars.forEach(function(c, i){
      c.x = W*0.1; c.y = lerp(floorTop() + 30, floorBottom(), chars.length === 1 ? 0.5 : i/(chars.length-1)); c.face = 1;
      c.speedMul = 0;
    });
    game.go = now() + 3000;
  }
  post({ type:'gameStarted', name: name });
}
function hideRound(){
  var g = game, c = chars[g.round % chars.length];
  var kinds = ['bush', 'box', 'gift'];
  g.items = [];
  for (var i=0;i<3;i++) g.items.push({ kind: kinds[i], x: W*(0.2 + i*0.3), y: lerp(floorTop() + 40, floorBottom() - 20, Math.random()), shake: 0 });
  g.hideIdx = Math.floor(Math.random()*3); g.seeker = c; g.revealed = false;
  chars.forEach(function(o){ o.hidden = true; });
  g.msg = 'Nerede saklandı?';
  sfx.pop();
}
function drawItem(it, t){
  var s = Math.min(W, H)*0.13*depthScale(it.y), sh = it.shake > t ? Math.sin(t/30)*6 : 0;
  ctx.save(); ctx.translate(it.x + sh, it.y);
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(0, 0, s*0.9, s*0.2, 0, 0, 7); ctx.fill();
  if (it.kind === 'bush') { ctx.fillStyle = '#3f9e4a'; ctx.beginPath(); ctx.arc(-s*0.45, -s*0.4, s*0.5, 0, 7); ctx.arc(s*0.45, -s*0.4, s*0.5, 0, 7); ctx.arc(0, -s*0.75, s*0.6, 0, 7); ctx.fill(); ctx.fillStyle = '#ff6b9a'; [[-0.5,-0.6],[0.3,-0.9],[0.55,-0.35]].forEach(function(p){ ctx.beginPath(); ctx.arc(p[0]*s, p[1]*s, s*0.07, 0, 7); ctx.fill(); }); }
  if (it.kind === 'box') { ctx.fillStyle = '#c98b55'; ctx.fillRect(-s*0.7, -s*1.1, s*1.4, s*1.1); ctx.fillStyle = '#a86f3d'; ctx.fillRect(-s*0.75, -s*1.2, s*1.5, s*0.22); ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 2; ctx.strokeRect(-s*0.7, -s*1.1, s*1.4, s*1.1); }
  if (it.kind === 'gift') { ctx.fillStyle = '#4ECDC4'; ctx.fillRect(-s*0.6, -s*1.0, s*1.2, s*1.0); ctx.fillStyle = '#FFD23F'; ctx.fillRect(-s*0.1, -s*1.0, s*0.2, s*1.0); ctx.fillRect(-s*0.6, -s*0.6, s*1.2, s*0.18); ctx.beginPath(); ctx.ellipse(-s*0.18, -s*1.08, s*0.2, s*0.1, 0.5, 0, 7); ctx.ellipse(s*0.18, -s*1.08, s*0.2, s*0.1, -0.5, 0, 7); ctx.fill(); }
  ctx.restore();
}
function updateGame(t, dt){
  var g = game; if (!g) return;
  if (g.name === 'stars') {
    if (t > g.next && t - g.t0 < g.dur - 1500) { g.next = t + rnd(500, 900); g.items.push({ x: rnd(W*0.1, W*0.9), y: -20, land: rnd(floorTop() + 30, floorBottom()), v: rnd(2.2, 3.6), r: rnd(0, 6), c: COLORS[Math.floor(Math.random()*COLORS.length)] }); }
    g.items = g.items.filter(function(it){
      it.y += it.v*dt*60; it.r += dt*3;
      if (it.y >= it.land) {
        var hit = chars.filter(function(c){ return Math.abs(c.x - it.x) < c.height()*0.45 && Math.abs(c.y - it.y) < c.height()*0.35; })[0];
        if (hit) { g.score++; burst(it.x, it.y - hit.height()*0.5, 10, 3); sfx.pop(); hit.squash = t; } else particles.push({ kind:'star', x: it.x, y: it.land, vx: 0, vy: 0, t: t, life: 600, s: 8, c: 'rgba(255,255,255,0.6)', r: 0 });
        return false;
      }
      return true;
    });
    if (t - g.t0 > g.dur) endGame();
  }
  if (g.name === 'race') {
    if (t < g.go) { g.msg = String(Math.ceil((g.go - t)/1000)); return; }
    if (!g.started) { g.started = true; g.msg = 'Başla!'; sfx.boing(); chars.forEach(function(c){ c.speedMul = rnd(0.5, 0.75); c.target = { x: g.finish + 40, y: c.y }; c.setState('walk'); }); }
    if (t - g.go > 900) g.msg = 'Dokun, hızlansın!';
    chars.forEach(function(c){ c.speedMul = Math.max(0.45, c.speedMul - dt*0.12); if (c.state !== 'walk') { c.target = { x: g.finish + 40, y: c.y }; c.setState('walk'); } });
    var win = chars.filter(function(c){ return c.x >= g.finish; })[0];
    if (win) { win.action('dance'); endGame({ winner: win.id }); }
  }
}
function drawGame(t){
  var g = game; if (!g) return;
  ctx.save();
  if (g.name === 'stars') {
    g.items.forEach(function(it){ ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.beginPath(); ctx.ellipse(it.x, it.land, 10, 4, 0, 0, 7); ctx.fill(); ctx.fillStyle = it.c; star(it.x, it.y, 13, it.r); });
    hud('⭐ ' + g.score + '   ⏱ ' + Math.max(0, Math.ceil((g.dur - (t - g.t0))/1000)));
  }
  if (g.name === 'hide') { g.items.slice().sort(function(a,b){ return a.y - b.y; }).forEach(function(it){ drawItem(it, t); }); hud('🔍 ' + g.msg + '   ' + g.score + '/' + g.rounds); }
  if (g.name === 'race') {
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.setLineDash([14, 10]); ctx.beginPath(); ctx.moveTo(g.finish, floorTop()); ctx.lineTo(g.finish, floorBottom() + 30); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = '700 22px sans-serif'; ctx.fillText('🏁', g.finish - 12, floorTop() - 6);
    hud('🏃 ' + g.msg);
  }
  ctx.restore();
}
function hud(text){
  ctx.save(); ctx.font = '800 ' + Math.round(Math.max(18, W/18)) + 'px sans-serif'; ctx.textAlign = 'center';
  var w = ctx.measureText(text).width + 34, y = H*0.15;
  ctx.fillStyle = 'rgba(27,21,48,0.75)'; roundRect(W/2 - w/2, y - 30, w, 46, 22); ctx.fill();
  ctx.fillStyle = '#FFD23F'; ctx.fillText(text, W/2, y + 2); ctx.restore();
}
function gameTap(x, y, c){
  var g = game;
  if (g.name === 'race' && c && g.started) { c.speedMul = Math.min(2.2, c.speedMul + 0.35); burst(c.x, c.y - c.height()*0.5, 4, 2); sfx.step(); return true; }
  if (g.name === 'hide' && !g.revealed) {
    for (var i=0;i<g.items.length;i++){
      var it = g.items[i], s = Math.min(W, H)*0.13*depthScale(it.y);
      if (Math.abs(x - it.x) < s*0.9 && y < it.y + 10 && y > it.y - s*1.4) {
        if (i === g.hideIdx) {
          g.revealed = true; g.score++; var sk = g.seeker; chars.forEach(function(o){ o.hidden = false; });
          chars.forEach(function(o, j){ o.x = clamp(it.x + (j - (chars.length-1)/2)*o.height()*0.6, W*0.08, W*0.92); o.y = it.y + 6; });
          sk.action('jump'); burst(it.x, it.y - s, 24, 4); sfx.boing(); g.msg = 'Buldun! 🎉';
          post({ type:'found', id: sk.id });
          setTimeout(function(){ if (!game || game !== g) return; g.round++; if (g.round >= g.rounds) endGame(); else hideRound(); }, 2600);
        } else { it.shake = now() + 400; sfx.step(); g.msg = 'Orada yok!'; }
        return true;
      }
    }
    return true;
  }
  return false;
}

// ---------------- Dokunma ----------------
function hit(x, y){
  var sorted = chars.slice().sort(function(a,b){ return b.y - a.y; });
  for (var i=0;i<sorted.length;i++){ if (sorted[i].hidden) continue; var b = sorted[i].bounds(); if (x > b.x && x < b.x+b.w && y > b.y && y < b.y+b.h) return sorted[i]; }
  return null;
}
var down = null;
function editPoint(e){ var r = editRect(); return [clamp((e.clientX - r.x)/r.w, 0, 1), clamp((e.clientY - r.y)/r.h, 0, 1)]; }
cv.addEventListener('pointerdown', function(e){
  ensureAudio();
  if (edit) { if (!edit.busy) edit.drawing = [editPoint(e)]; return; }
  var c = hit(e.clientX, e.clientY);
  down = { x: e.clientX, y: e.clientY, t: now(), c: c, moved: false };
});
cv.addEventListener('pointermove', function(e){
  if (edit) { if (edit.drawing.length) { var p = editPoint(e), q = edit.drawing[edit.drawing.length-1]; if (Math.abs(p[0]-q[0]) + Math.abs(p[1]-q[1]) > 0.006) edit.drawing.push(p); } return; }
  if (!down) return;
  if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 12) down.moved = true;
  if (down.moved && down.c && !(game && game.name !== 'stars')) {
    var c = down.c; c.picked = true; c.target = null; c.sleep = false;
    c.x = clamp(e.clientX - tilt.ox, 10, W-10);
    c.y = clamp(e.clientY - tilt.oy + c.height()*0.25 + c.height()*0.55, floorTop(), floorBottom());
  }
});
function up(e){
  if (edit) {
    var pts = edit.drawing; edit.drawing = [];
    if (pts.length > 8) { edit.lasso = pts; sfx.pop(); runEdit(); }
    return;
  }
  if (!down) return;
  var d = down; down = null;
  if (d.c && d.c.picked) { d.c.picked = false; d.c.z = d.c.height()*0.25; d.c.vz = 0; d.c.setState('idle'); return; }
  if (d.moved) return;
  if (game && gameTap(e.clientX - tilt.ox, e.clientY - tilt.oy, d.c)) return;
  if (d.c) { d.c.action('jump'); burst(e.clientX - tilt.ox, e.clientY - tilt.oy, 10, 3); post({ type:'tap', id: d.c.id }); return; }
  // boş yere dokununca: karakterler oraya yürür
  var fy = clamp(e.clientY - tilt.oy, floorTop()+10, floorBottom());
  var fx = e.clientX - tilt.ox;
  chars.forEach(function(c, i){ c.walkTo(fx + (i - (chars.length-1)/2) * c.height()*0.8, fy + i*8); });
  burst(fx, fy, 6, 1.5); sfx.pop();
}
cv.addEventListener('pointerup', up);
cv.addEventListener('pointercancel', function(){ down = null; });

// ---------------- Kayıt ----------------
function pickMime(){
  var list = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  for (var i=0;i<list.length;i++) if (window.MediaRecorder && MediaRecorder.isTypeSupported(list[i])) return list[i];
  return '';
}
function startRecording(maxMs){
  if (recorder) return;
  ensureAudio();
  if (!window.MediaRecorder || !cv.captureStream) { post({ type:'rec', error:'unsupported' }); return; }
  var stream = cv.captureStream(30);
  if (audioDest) audioDest.stream.getAudioTracks().forEach(function(tr){ stream.addTrack(tr); });
  var mime = pickMime();
  try { recorder = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 3000000 } : undefined); }
  catch(e){ recorder = null; post({ type:'rec', error: String(e) }); return; }
  recChunks = []; recT0 = now(); recMax = maxMs || 15000;
  recorder.ondataavailable = function(ev){ if (ev.data && ev.data.size) recChunks.push(ev.data); };
  recorder.onstop = function(){
    var type = (recorder && recorder.mimeType) || mime || 'video/webm';
    recorder = null;
    var blob = new Blob(recChunks, { type: type });
    var fr = new FileReader();
    fr.onload = function(){
      var s = String(fr.result); var b64 = s.slice(s.indexOf(',')+1);
      var size = 400000, n = Math.ceil(b64.length/size);
      for (var i=0;i<n;i++) post({ type:'recChunk', i:i, n:n, mime: type.split(';')[0], data: b64.slice(i*size, (i+1)*size) });
    };
    fr.readAsDataURL(blob);
  };
  recorder.start(500);
  post({ type:'rec', started:true });
}
function stopRecording(){ if (recorder && recorder.state !== 'inactive') { recorder.stop(); post({ type:'rec', stopped:true }); } }

// ---------------- Dışarıdan komutlar ----------------
window.stage = {
  cmd: function(m){
    try { handle(m); } catch(e){ post({ type:'error', error: String(e && e.message || e) }); }
  }
};
function addChar(def, opts){
  return loadImage(def.png).then(function(img){
    chars = chars.filter(function(c){ return c.id !== def.id; });
    var c = new Char(def, img);
    if (opts && opts.birth) {
      c.birth = 1; c.birthT = now(); c.x = W/2; c.y = lerp(floorTop(), floorBottom(), 0.7);
      sfx.magic();
      burst(c.x, c.y - c.height()*0.5, 40, 4);
    } else if (chars.length) {
      c.x = clamp(chars[chars.length-1].x + (Math.random()<0.5?-1:1)*W*0.3, W*0.15, W*0.85);
    }
    chars.push(c);
    if (chars.length > 4) chars.shift();
    return c;
  });
}
function handle(m){
  switch (m.type) {
    case 'camera': if (m.on) startCamera(); else stopCamera(); break;
    case 'scene':
      scene = m.name || 'camera';
      if (scene === 'camera') startCamera(); else stopCamera();
      sfx.magic(); burst(W/2, floorTop() + (floorBottom()-floorTop())*0.5, 24, 3);
      break;
    case 'scan':
      // önce kesim ekranı: otomatik seçim gösterilir, parmakla düzeltilebilir
      edit = { src: m.src, img: null, result: null, lasso: [], drawing: [], exact: false, busy: true };
      loadImage(m.src).then(function(im){ if (edit) { edit.img = im; runEdit(); } });
      break;
    case 'editMode': if (edit) { edit.exact = !!m.exact; if (edit.lasso.length > 5) runEdit(); } break;
    case 'editReset': if (edit) { edit.lasso = []; edit.exact = false; runEdit(); } break;
    case 'editDone':
      if (edit && edit.result && edit.result.ok) {
        scanImg = edit.img; scanT0 = now(); scanFade = 0;
        var r0 = edit.result; edit = null;
        post({ type:'cutout', result: r0 });
      }
      break;
    case 'editCancel': edit = null; break;
    case 'scanDone': scanFade = now(); break;
    case 'add':
      addChar(m.char, { birth: !!m.birth }).then(function(){ post({ type:'added', id: m.char.id }); }).catch(function(e){ post({ type:'error', error:String(e) }); });
      break;
    case 'remove': chars = chars.filter(function(c){ return c.id !== m.id; }); break;
    case 'clear': chars = []; break;
    case 'action':
      ensureAudio();
      chars.forEach(function(c, i){ if (!m.id || c.id === m.id) setTimeout(function(){ c.action(m.action); }, i*120); });
      break;
    case 'say':
      chars.forEach(function(c){ if (c.id === m.id) { c.speaking = now() + (m.ms || 2500); c.sleep = false; } });
      bubbles = bubbles.filter(function(b){ return b.id !== m.id; });
      bubbles.push({ id: m.id, text: m.text, t: now(), until: now() + (m.ms || 3000) });
      break;
    case 'scale':
      chars.forEach(function(c){ if (!m.id || c.id === m.id) c.scale = clamp(c.scale * m.f, 0.4, 2.2); });
      break;
    case 'record': if (m.on) startRecording(m.maxMs); else stopRecording(); break;
    case 'playAudio': playAudio(m); break;
    case 'babble': babble(m); break;
    case 'dress': chars.forEach(function(c){ if (c.id === m.id) { c.acc = m.acc || []; c.squash = now(); burst(c.x, c.y - c.height()*0.8, 12, 3); sfx.magic(); } }); break;
    case 'game': if (m.name) startGame(m.name); else if (game) endGame(); break;
    case 'story': chars.forEach(function(c){ c.story = !!m.on; if (m.on) { c.sleep = false; c.target = null; c.path = null; } }); break;
    case 'watermark': watermark = m.text; break;
    case 'recenter': tilt.b0 = null; break;
  }
}
post({ type:'ready' });
})();
</script>
</body></html>`;

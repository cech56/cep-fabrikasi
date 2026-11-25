// İnternetsiz çalışan örnek mini uygulama: ilk açılışta liste boş görünmesin ve
// kapalı kutu + köprü AI anahtarı olmadan da denenebilsin diye.
export const CARPIM_HTML = `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>
:root{--bg:#fff7ed;--card:#fff;--ink:#1c1917;--muted:#78716c;--acc:#f97316;--ok:#16a34a;--bad:#dc2626}
@media (prefers-color-scheme:dark){:root{--bg:#1c1917;--card:#292524;--ink:#fafaf9;--muted:#a8a29e}}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
body{margin:0;font-family:system-ui,sans-serif;background:var(--bg);color:var(--ink);min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:24px 16px}
h1{font-size:22px;margin:8px 0 4px}.muted{color:var(--muted);font-size:14px}
.stats{display:flex;gap:12px;margin:16px 0}.stat{background:var(--card);border-radius:14px;padding:10px 16px;text-align:center;min-width:90px}
.stat b{display:block;font-size:24px}
.q{font-size:56px;font-weight:800;margin:24px 0}
.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;width:100%;max-width:360px}
button{font-size:28px;font-weight:700;padding:20px 0;border:none;border-radius:18px;background:var(--card);color:var(--ink);box-shadow:0 2px 0 rgba(0,0,0,.08)}
button.ok{background:var(--ok);color:#fff}button.bad{background:var(--bad);color:#fff}
</style></head><body>
<h1>✖️ Çarpım Tablosu</h1><div class="muted">Doğru cevaba dokun, seriyi büyüt!</div>
<div class="stats"><div class="stat"><b id="streak">0</b><span class="muted">Seri</span></div><div class="stat"><b id="best">0</b><span class="muted">Rekor</span></div></div>
<div class="q" id="q"></div><div class="grid" id="opts"></div>
<script>
var streak=0,best=0,answer=0,locked=false;
function r(n){return Math.floor(Math.random()*n)}
function next(){locked=false;var a=2+r(8),b=2+r(8);answer=a*b;document.getElementById('q').textContent=a+' × '+b;
var set={};set[answer]=1;while(Object.keys(set).length<4){var w=answer+(r(11)-5)*(r(2)?1:b);if(w>0)set[w]=1}
var opts=Object.keys(set).map(Number).sort(function(){return Math.random()-.5});var box=document.getElementById('opts');box.innerHTML='';
opts.forEach(function(v){var bt=document.createElement('button');bt.textContent=v;bt.onclick=function(){pick(bt,v)};box.appendChild(bt)})}
function pick(bt,v){if(locked)return;locked=true;cep.haptic();
if(v===answer){bt.className='ok';streak++;if(streak>best){best=streak;cep.set('best',best)}}else{bt.className='bad';streak=0}
document.getElementById('streak').textContent=streak;document.getElementById('best').textContent=best;setTimeout(next,600)}
cep.get('best').then(function(v){best=v||0;document.getElementById('best').textContent=best});
next();
</script></body></html>`;

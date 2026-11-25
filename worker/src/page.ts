// Paylaşılan uygulamanın web sayfası: uygulaması olmayan biri linke dokunsa bile
// tarayıcıda çalışan uygulamayı görür. Bu, büyümenin ana motoru.
import { SharedApp } from "./db";

const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; form-action 'none'; frame-src 'none'; base-uri 'none'";

// Kapalı kutudaki uygulama için "cep" köprüsü: veriyi üst sayfaya postMessage ile sorar.
const IFRAME_BRIDGE = `<script>(function(){var p={},s=0;function c(t,d){return new Promise(function(r,j){var i=++s;p[i]={r:r,j:j};parent.postMessage({cep:1,id:i,type:t,payload:d},"*")})}
addEventListener("message",function(e){var m=e.data;if(!m||!m.cepReply)return;var q=p[m.id];if(!q)return;delete p[m.id];m.ok?q.r(m.value):q.j(new Error(m.value))});
window.cep={get:function(k){return c("get",{key:String(k)})},set:function(k,v){return c("set",{key:String(k),value:v})},haptic:function(){}};
window.alert=function(m){console.log(m)};window.confirm=function(){return true};window.prompt=function(){return null};})();</script>`;

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function sandboxDoc(html: string) {
  const head = `<meta http-equiv="Content-Security-Policy" content="${CSP}">${IFRAME_BRIDGE}`;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => m + head);
  return html.replace(/<!doctype html>/i, (m) => `${m}<head>${head}</head>`);
}

export function sharedPage(app: SharedApp, origin: string, apkUrl: string) {
  const title = `${app.emoji} ${app.name}`;
  const deepLink = `cepfabrikasi://shared/${app.id}`;
  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Cep Fabrikası</title>
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(app.description || "Cep Fabrikası ile 20 saniyede yapıldı. Sen de dene!")}">
<meta property="og:url" content="${origin}/a/${app.id}">
<style>
:root{--bg:#FFF7ED;--card:#fff;--ink:#1C1917;--muted:#78716C;--acc:#F97316;--line:#FED7AA}
@media (prefers-color-scheme:dark){:root{--bg:#1C1917;--card:#292524;--ink:#FAFAF9;--muted:#A8A29E;--acc:#FB923C;--line:#44403C}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,sans-serif;display:flex;flex-direction:column;height:100dvh}
header{display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--line)}
header b{font-size:17px;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
header small{color:var(--muted);font-size:12px}
iframe{flex:1;border:0;width:100%;background:var(--bg)}
footer{padding:10px 16px 14px;border-top:1px solid var(--line);background:var(--card)}
footer p{margin:0 0 8px;font-size:14px;color:var(--muted)}
.row{display:flex;gap:8px}.btn{flex:1;text-align:center;padding:13px 10px;border-radius:14px;font-weight:700;text-decoration:none;font-size:15px}
.pri{background:var(--acc);color:#fff}.sec{border:1px solid var(--line);color:var(--ink)}
.rep{display:block;margin-top:8px;text-align:center;font-size:12px;color:var(--muted);background:none;border:0;width:100%}
</style></head><body>
<header><span style="font-size:26px">${esc(app.emoji)}</span><b>${esc(app.name)}</b><small>👀 ${app.views + 1}</small></header>
<iframe id="f" sandbox="allow-scripts" srcdoc="${esc(sandboxDoc(app.html))}"></iframe>
<footer><p>🏭 Bu uygulama <b>Cep Fabrikası</b> ile 20 saniyede yapıldı. Sen de anlat, sana özel olanı yapsın.</p>
<div class="row"><a class="btn pri" href="${deepLink}">Uygulamada aç / Uyarla</a><a class="btn sec" href="${esc(apkUrl)}">Cep Fabrikası'nı indir</a></div>
<button class="rep" id="rep">Uygunsuz içerik bildir</button></footer>
<script>
var KEY="cep:${app.id}",f=document.getElementById("f");
function load(){try{return JSON.parse(localStorage.getItem(KEY)||"{}")}catch(e){return {}}}
addEventListener("message",function(e){var m=e.data;if(!m||!m.cep||e.source!==f.contentWindow)return;var d=load(),r={cepReply:1,id:m.id,ok:true,value:null};
try{if(m.type==="get")r.value=d[m.payload.key]===undefined?null:d[m.payload.key];else if(m.type==="set"){d[m.payload.key]=m.payload.value;localStorage.setItem(KEY,JSON.stringify(d));r.value=true}}catch(err){r.ok=false;r.value=String(err)}
f.contentWindow.postMessage(r,"*")});
document.getElementById("rep").onclick=function(){var why=window.prompt("Neden uygunsuz?","");if(why===null)return;
fetch("/api/apps/${app.id}/report",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({reason:why,deviceId:"web-"+(localStorage.getItem("cep-web-id")||(function(){var i=Math.random().toString(36).slice(2);localStorage.setItem("cep-web-id",i);return i})())})}).then(function(){alert("Teşekkürler, inceleyeceğiz.")})};
</script></body></html>`;
}

export function notFoundPage() {
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bulunamadı</title></head>
<body style="font-family:system-ui;text-align:center;padding:48px 16px;background:#FFF7ED;color:#1C1917"><div style="font-size:56px">🏭</div><h2>Bu uygulama bulunamadı</h2><p>Kaldırılmış ya da link hatalı olabilir.</p></body></html>`;
}

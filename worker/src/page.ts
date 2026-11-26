// Paylaşılan uygulamanın web sayfası: uygulaması olmayan biri linke dokunsa bile
// tarayıcıda çalışan uygulamayı görür. Bu, büyümenin ana motoru.
import { SharedApp } from "./db";

const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; form-action 'none'; frame-src 'none'; base-uri 'none'";

export type Lang = "tr" | "en";

// Tarayıcının diline göre Türkçe ya da İngilizce
export function pageLang(request: Request): Lang {
  const al = (request.headers.get("accept-language") || "tr").toLowerCase();
  return al.startsWith("tr") ? "tr" : "en";
}

const T = {
  tr: {
    made: "🏭 Bu uygulama <b>Cep Fabrikası</b> ile 20 saniyede yapıldı. Sen de anlat, sana özel olanı yapsın.",
    open: "Uygulamada aç / Uyarla",
    get: "Cep Fabrikası'nı indir",
    report: "Uygunsuz içerik bildir",
    why: "Neden uygunsuz?",
    thanks: "Teşekkürler, inceleyeceğiz.",
    by: "yapan",
    ogDesc: "Cep Fabrikası ile 20 saniyede yapıldı. Sen de dene!",
    nf: "Bu uygulama bulunamadı",
    nfSub: "Kaldırılmış ya da link hatalı olabilir.",
    inviteTitle: "birlikte kullanmaya davet edildin",
    inviteSub: "Bu uygulamayı açtığında listeler, sayaçlar ve notlar davet edenle canlı olarak ortak olur. Biri değiştirince diğerinde de anında değişir.",
    join: "Uygulamada aç ve katıl",
    noApp: "Cep Fabrikası telefonunda yüklü değilse önce indir, sonra bu linke tekrar dokun.",
  },
  en: {
    made: "🏭 This app was made in 20 seconds with <b>Cep Fabrikası</b>. Describe yours and get it built.",
    open: "Open in app / Remix",
    get: "Get Cep Fabrikası",
    report: "Report inappropriate content",
    why: "Why is it inappropriate?",
    thanks: "Thanks, we'll review it.",
    by: "by",
    ogDesc: "Made in 20 seconds with Cep Fabrikası. Try it!",
    nf: "App not found",
    nfSub: "It may have been removed or the link is wrong.",
    inviteTitle: "you're invited to use this together",
    inviteSub: "Once you open it, lists, counters and notes are shared live with the person who invited you. When one of you changes something, the other sees it instantly.",
    join: "Open in app and join",
    noApp: "If Cep Fabrikası isn't installed yet, get it first and then tap this link again.",
  },
};

// Kapalı kutudaki uygulama için "cep" köprüsü: veriyi üst sayfaya postMessage ile sorar.
// Web'de bildirim ve ortak kullanım yok; bu fonksiyonlar sessizce hiçbir şey yapmaz.
const IFRAME_BRIDGE = `<script>(function(){var p={},s=0;function c(t,d){return new Promise(function(r,j){var i=++s;p[i]={r:r,j:j};parent.postMessage({cep:1,id:i,type:t,payload:d},"*")})}
addEventListener("message",function(e){var m=e.data;if(!m||!m.cepReply)return;var q=p[m.id];if(!q)return;delete p[m.id];m.ok?q.r(m.value):q.j(new Error(m.value))});
window.cep={get:function(k){return c("get",{key:String(k)})},set:function(k,v){return c("set",{key:String(k),value:v})},haptic:function(){},onChange:function(){},
notify:function(){return Promise.resolve(null)},cancelNotify:function(){return Promise.resolve(true)},cancelAllNotify:function(){return Promise.resolve(true)},
ai:function(q,o){return c("ai",{prompt:String(q),system:o&&o.system?String(o.system):""})},vibrate:function(){return Promise.resolve(true)},torch:function(){return Promise.reject(new Error("Bu özellik sadece uygulamada çalışır"))},
scanQR:function(){return Promise.reject(new Error("Bu özellik sadece uygulamada çalışır"))},takePhoto:function(){return Promise.reject(new Error("Bu özellik sadece uygulamada çalışır"))},sensor:function(){return function(){}},widget:function(){}};
window.alert=function(m){console.log(m)};window.confirm=function(){return true};window.prompt=function(){return null};})();</script>`;

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function sandboxDoc(html: string) {
  const head = `<meta http-equiv="Content-Security-Policy" content="${CSP}">${IFRAME_BRIDGE}`;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => m + head);
  return html.replace(/<!doctype html>/i, (m) => `${m}<head>${head}</head>`);
}

const STYLE = `
:root{--bg:#FFF7ED;--card:#fff;--ink:#1C1917;--muted:#78716C;--acc:#F97316;--line:#FED7AA}
@media (prefers-color-scheme:dark){:root{--bg:#1C1917;--card:#292524;--ink:#FAFAF9;--muted:#A8A29E;--acc:#FB923C;--line:#44403C}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,sans-serif}
.btn{flex:1;display:block;text-align:center;padding:13px 10px;border-radius:14px;font-weight:700;text-decoration:none;font-size:15px}
.pri{background:var(--acc);color:#fff}.sec{border:1px solid var(--line);color:var(--ink)}`;

export function sharedPage(app: SharedApp, origin: string, apkUrl: string, lang: Lang = "tr") {
  const t = T[lang];
  const title = `${app.emoji} ${app.name}`;
  const deepLink = `cepfabrikasi://shared/${app.id}`;
  const author = app.author ? ` · ${t.by} ${esc(app.author)}` : "";
  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Cep Fabrikası</title>
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(app.description || t.ogDesc)}">
<meta property="og:url" content="${origin}/a/${app.id}">
<style>${STYLE}
body{display:flex;flex-direction:column;height:100dvh}
header{display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--line)}
header b{font-size:17px;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
header small{color:var(--muted);font-size:12px;white-space:nowrap}
iframe{flex:1;border:0;width:100%;background:var(--bg)}
footer{padding:10px 16px 14px;border-top:1px solid var(--line);background:var(--card)}
footer p{margin:0 0 8px;font-size:14px;color:var(--muted)}
.row{display:flex;gap:8px}
.rep{display:block;margin-top:8px;text-align:center;font-size:12px;color:var(--muted);background:none;border:0;width:100%}
</style></head><body>
<header><span style="font-size:26px">${esc(app.emoji)}</span><b>${esc(app.name)}</b><small>👀 ${app.views + 1} · ❤️ ${app.likes ?? 0}${author}</small></header>
<iframe id="f" sandbox="allow-scripts" srcdoc="${esc(sandboxDoc(app.html))}"></iframe>
<footer><p>${t.made}</p>
<div class="row"><a class="btn pri" href="${deepLink}">${t.open}</a><a class="btn sec" href="${esc(apkUrl)}">${t.get}</a></div>
<button class="rep" id="rep">${t.report}</button></footer>
<script>
var KEY="cep:${app.id}",f=document.getElementById("f");
function load(){try{return JSON.parse(localStorage.getItem(KEY)||"{}")}catch(e){return {}}}
function wid(){var i=localStorage.getItem("cep-web-id");if(!i){i=Math.random().toString(36).slice(2);localStorage.setItem("cep-web-id",i)}return "web-"+i}
addEventListener("message",function(e){var m=e.data;if(!m||!m.cep||e.source!==f.contentWindow)return;
if(m.type==="ai"){fetch("/api/ai",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({prompt:m.payload.prompt,system:m.payload.system,lang:"${lang}",deviceId:wid()})}).then(function(x){return x.json()}).then(function(j){f.contentWindow.postMessage(j.error?{cepReply:1,id:m.id,ok:false,value:j.error}:{cepReply:1,id:m.id,ok:true,value:j.text},"*")}).catch(function(){f.contentWindow.postMessage({cepReply:1,id:m.id,ok:false,value:"network"},"*")});return}
var d=load(),r={cepReply:1,id:m.id,ok:true,value:null};
try{if(m.type==="get")r.value=d[m.payload.key]===undefined?null:d[m.payload.key];else if(m.type==="set"){d[m.payload.key]=m.payload.value;localStorage.setItem(KEY,JSON.stringify(d));r.value=true}}catch(err){r.ok=false;r.value=String(err)}
f.contentWindow.postMessage(r,"*")});
document.getElementById("rep").onclick=function(){var why=window.prompt(${JSON.stringify(t.why)},"");if(why===null)return;
fetch("/api/apps/${app.id}/report",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({reason:why,deviceId:wid()})}).then(function(){alert(${JSON.stringify(t.thanks)})})};
</script></body></html>`;
}

// "Birlikte kullan" davet sayfası: uygulamayı açıp odaya katılmaya yönlendirir.
export function invitePage(room: { id: string; name: string; emoji: string; description: string }, apkUrl: string, lang: Lang = "tr") {
  const t = T[lang];
  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(room.emoji)} ${esc(room.name)} · Cep Fabrikası</title>
<meta property="og:title" content="${esc(room.emoji)} ${esc(room.name)}: ${t.inviteTitle}">
<meta property="og:description" content="${esc(t.inviteSub)}">
<style>${STYLE}
main{max-width:440px;margin:0 auto;padding:48px 20px;text-align:center}
.e{font-size:72px}h1{font-size:24px;margin:12px 0 4px}h2{font-size:16px;font-weight:600;color:var(--muted);margin:0 0 16px}
p{color:var(--muted);line-height:1.5}.col{display:flex;flex-direction:column;gap:10px;margin-top:24px}
</style></head><body><main>
<div class="e">${esc(room.emoji)}</div><h1>${esc(room.name)}</h1><h2>👨‍👩‍👧 ${t.inviteTitle}</h2>
<p>${esc(t.inviteSub)}</p>
<div class="col"><a class="btn pri" href="cepfabrikasi://join/${room.id}">${t.join}</a><a class="btn sec" href="${esc(apkUrl)}">${t.get}</a></div>
<p style="font-size:13px;margin-top:16px">${t.noApp}</p>
</main></body></html>`;
}

export function notFoundPage(lang: Lang = "tr") {
  const t = T[lang];
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${t.nf}</title></head>
<body style="font-family:system-ui;text-align:center;padding:48px 16px;background:#FFF7ED;color:#1C1917"><div style="font-size:56px">🏭</div><h2>${t.nf}</h2><p>${t.nfSub}</p></body></html>`;
}

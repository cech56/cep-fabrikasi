// Mini uygulamayı kapalı kutuya hazırlar:
// 1) CSP ile ağ, harici kaynak ve eval engellenir.
// 2) "cep" köprüsü sayfa yüklenmeden enjekte edilir (veri saklama + titreşim).

const CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "media-src data: blob:",
  "connect-src 'none'",
  "form-action 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
].join("; ");

const CSP_META = `<meta http-equiv="Content-Security-Policy" content="${CSP}">`;

export function wrapHtml(html: string) {
  // CSP etiketi belgedeki her şeyden önce gelmeli
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => `${m}${CSP_META}`);
  return html.replace(/<!doctype html>/i, (m) => `${m}<head>${CSP_META}</head>`);
}

export const BRIDGE_JS = `
(function () {
  var pending = {};
  var seq = 0;
  function call(type, payload) {
    return new Promise(function (resolve, reject) {
      var id = ++seq;
      pending[id] = { resolve: resolve, reject: reject };
      window.ReactNativeWebView.postMessage(JSON.stringify({ id: id, type: type, payload: payload }));
    });
  }
  window.__cepResolve = function (id, ok, value) {
    var p = pending[id];
    if (!p) return;
    delete pending[id];
    ok ? p.resolve(value) : p.reject(new Error(value));
  };
  var listeners = [];
  window.__cepChanged = function (keys) {
    for (var i = 0; i < listeners.length; i++) { try { listeners[i](keys); } catch (e) { window.onerror && window.onerror(String(e)); } }
  };
  window.cep = {
    get: function (key) { return call("get", { key: String(key) }); },
    set: function (key, value) { return call("set", { key: String(key), value: value }); },
    haptic: function () { window.ReactNativeWebView.postMessage(JSON.stringify({ type: "haptic" })); },
    onChange: function (fn) {
      if (typeof fn !== "function") return;
      listeners.push(fn);
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: "listen" }));
    },
    notify: function (opts) { return call("notify", opts || {}); },
    cancelNotify: function (id) { return call("cancelNotify", { id: String(id) }); },
    cancelAllNotify: function () { return call("cancelAllNotify", {}); }
  };
  window.alert = function (m) { console.log(m); };
  window.confirm = function () { return true; };
  window.prompt = function () { return null; };
  window.open = function () { return null; };
  window.onerror = function (msg, src, line) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: "error", payload: String(msg) + (line ? " (satır " + line + ")" : "") }));
  };
  window.addEventListener("unhandledrejection", function (e) {
    var r = e && e.reason;
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: "error", payload: "Promise: " + String((r && r.message) || r) }));
  });
})();
true;
`;

// Cep Fabrikası ara sunucusu: telefondan gelen isteği AI'a iletir.
// API anahtarı burada (Cloudflare secret) durur, telefona hiç inmez.
import { getShared, insertShared, listVitrin, overDailyLimit, reportShared, usageToday } from "./db";
import { notFoundPage, sharedPage } from "./page";
import { buildUserMessage } from "./prompt";
import { Env, ProviderError, generate } from "./providers";
import { checkHtml } from "./safety";

const MAX_PROMPT = 2000;
const MAX_PREVIOUS_HTML = 200_000;
const MAX_SHARED_HTML = 300_000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" },
  });
}

function html(body: string, status = 200) {
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = await request.json();
    return b && typeof b === "object" ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function handleShare(request: Request, env: Env, origin: string) {
  if (!env.DB) return json({ error: "Paylaşım henüz açık değil" }, 503);
  const b = await readJson(request);
  if (!b) return json({ error: "Geçersiz istek" }, 400);
  const app = {
    name: str(b.name, 24) || "Uygulama",
    emoji: str(b.emoji, 8) || "✨",
    description: str(b.description, 200),
    prompt: str(b.prompt, MAX_PROMPT),
    html: typeof b.html === "string" ? b.html : "",
    parent_id: str(b.parentId, 16) || null,
  };
  if (!app.html || app.html.length > MAX_SHARED_HTML) return json({ error: "Uygulama paylaşılamadı (boyut)" }, 400);
  const problem = checkHtml(app.html);
  if (problem) return json({ error: `Uygulama paylaşılamadı (${problem})` }, 422);
  const id = await insertShared(env, app, str(b.deviceId, 64) || "anon");
  return json({ id, url: `${origin}/a/${id}` });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const apkUrl = env.APK_URL || "https://github.com/cech56/cep-fabrikasi/releases";
    if (path === "/health") return json({ ok: true, provider: env.AI_PROVIDER, db: !!env.DB });

    // Paylaşılan uygulamanın web sayfası
    let m = path.match(/^\/a\/([a-z0-9]{4,16})$/);
    if (m && request.method === "GET") {
      if (!env.DB) return html(notFoundPage(), 404);
      const app = await getShared(env, m[1], true);
      return app ? html(sharedPage(app, url.origin, apkUrl)) : html(notFoundPage(), 404);
    }
    // Uygulama içinden açma / uyarlama
    m = path.match(/^\/api\/apps\/([a-z0-9]{4,16})$/);
    if (m && request.method === "GET") {
      if (!env.DB) return json({ error: "Bulunamadı" }, 404);
      const app = await getShared(env, m[1], url.searchParams.get("view") === "1");
      return app ? json(app) : json({ error: "Bu uygulama bulunamadı ya da kaldırılmış" }, 404);
    }
    m = path.match(/^\/api\/apps\/([a-z0-9]{4,16})\/report$/);
    if (m && request.method === "POST") {
      if (!env.DB) return json({ ok: true });
      const b = (await readJson(request)) ?? {};
      await reportShared(env, m[1], str(b.deviceId, 64) || "anon", str(b.reason, 300));
      return json({ ok: true });
    }
    if (path === "/api/share" && request.method === "POST") return handleShare(request, env, url.origin);
    if (path === "/api/vitrin" && request.method === "GET") {
      if (!env.DB) return json({ items: [] });
      const sort = url.searchParams.get("sort") === "popular" ? "popular" : "new";
      const limit = Math.min(50, Number(url.searchParams.get("limit")) || 30);
      const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
      return json({ items: await listVitrin(env, sort, limit, offset) });
    }
    if (path === "/api/usage" && request.method === "GET") return json(await usageToday(env, str(url.searchParams.get("deviceId"), 64) || "anon"));
    if (path !== "/generate" || request.method !== "POST") return json({ error: "Bulunamadı" }, 404);

    const body = await readJson(request);
    if (!body) return json({ error: "Geçersiz istek" }, 400);
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const previousHtml = typeof body.previousHtml === "string" ? body.previousHtml : undefined;
    const deviceId = typeof body.deviceId === "string" ? body.deviceId.slice(0, 64) : "anon";
    if (!prompt) return json({ error: "Ne yapmak istediğini yaz" }, 400);
    if (prompt.length > MAX_PROMPT) return json({ error: "İstek çok uzun, biraz kısalt" }, 400);
    if (previousHtml && previousHtml.length > MAX_PREVIOUS_HTML) return json({ error: "Uygulama çok büyük" }, 400);

    if (await overDailyLimit(env, deviceId)) return json({ error: "Bugünlük üretim hakkın doldu, yarın görüşürüz." }, 429);

    // Üretim 100 saniyeyi geçebilir; Cloudflare boşta kalan bağlantıyı keser (524).
    // Bu yüzden yanıtı hemen başlatıp her 5 saniyede bir boşluk gönderiyoruz, sonunda JSON'u yazıyoruz.
    // (JSON.parse baştaki boşlukları yok sayar.) Hata da 200 içinde {"error": ...} olarak gelir.
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const enc = new TextEncoder();
    const heartbeat = setInterval(() => writer.write(enc.encode(" ")).catch(() => {}), 5000);
    const finish = async (body: unknown) => {
      clearInterval(heartbeat);
      try {
        await writer.write(enc.encode(JSON.stringify(body)));
        await writer.close();
      } catch {}
    };
    ctx.waitUntil(
      (async () => {
        try {
          const app = await generate(env, buildUserMessage(prompt, previousHtml));
          if (app.refused) return finish({ refused: true, reason: app.refusal_reason || "Bu isteği yapamıyorum." });
          const problem = checkHtml(app.html);
          if (problem) return finish({ error: `Uygulama güvenlik kontrolünden geçemedi (${problem}). Tekrar dene.` });
          return finish({
            name: app.name.slice(0, 24) || "Yeni uygulama",
            emoji: app.emoji || "✨",
            description: app.description,
            html: app.html,
          });
        } catch (e) {
          if (e instanceof ProviderError) return finish({ error: e.message });
          if (e instanceof SyntaxError) return finish({ error: "AI bozuk bir yanıt verdi, tekrar dene." });
          return finish({ error: "Beklenmeyen bir hata oldu" });
        }
      })(),
    );
    return new Response(readable, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
  },
};

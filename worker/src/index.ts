// Cep Fabrikası ara sunucusu: telefondan gelen isteği AI'a iletir.
// API anahtarı burada (Cloudflare secret) durur, telefona hiç inmez.
import {
  createRoom,
  featured,
  getRoom,
  getShared,
  insertShared,
  listVitrin,
  logCrash,
  overDailyLimit,
  reportShared,
  roomChanges,
  setRoomHtml,
  setRoomValue,
  toggleLike,
  usageToday,
} from "./db";
import { privacyPage, termsPage } from "./legal";
import { invitePage, notFoundPage, pageLang, sharedPage } from "./page";
import { CATEGORIES, GeneratedApp, buildUserMessage, normalizeCategory } from "./prompt";
import { Env, ImageInput, ProviderError, aiText, generate } from "./providers";
import { checkHtml, syntaxError } from "./safety";

const MAX_PROMPT = 2000;
const MAX_PREVIOUS_HTML = 200_000;
const MAX_SHARED_HTML = 300_000;
const MAX_IMAGE_B64 = 2_000_000;
const MAX_ROOM_VALUE = 200_000;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "no-store" },
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

// Sunucu mesajlarının İngilizcesi (uygulama "lang":"en" gönderirse)
const EN: Record<string, string> = {
  "Ne yapmak istediğini yaz": "Describe what you want to make",
  "İstek çok uzun, biraz kısalt": "Your request is too long, please shorten it",
  "Uygulama çok büyük": "The app is too big",
  "Görsel çok büyük ya da desteklenmiyor": "The image is too big or not supported",
  "Bugünlük üretim hakkın doldu, yarın görüşürüz.": "You've used today's free builds. See you tomorrow!",
  "Bu isteği yapamıyorum.": "I can't make that one.",
  "AI bozuk bir yanıt verdi, tekrar dene.": "The AI returned a broken answer, please try again.",
  "Beklenmeyen bir hata oldu": "Something unexpected went wrong",
  "Google şu an çok yoğun, birkaç dakika sonra tekrar dene.": "The AI is very busy right now, try again in a few minutes.",
  "Günlük ücretsiz kota doldu, biraz sonra tekrar dene.": "The daily free quota is used up, try again later.",
  "Uygulama çok uzun oldu, daha sade anlatmayı dene.": "The app got too long, try describing a simpler version.",
  "Bu isteği yapamıyorum, başka bir şey dener misin?": "I can't make that one. Want to try something else?",
  "Bugünlük yapay zekâ hakkın doldu.": "You've used today's AI answers.",
};
const tr = (lang: string, msg: string) => (lang === "en" ? EN[msg] ?? msg : msg);

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
    category: normalizeCategory(b.category),
    author: str(b.author, 20),
  };
  if (!app.html || app.html.length > MAX_SHARED_HTML) return json({ error: "Uygulama paylaşılamadı (boyut)" }, 400);
  const problem = checkHtml(app.html);
  if (problem) return json({ error: `Uygulama paylaşılamadı (${problem})` }, 422);
  const id = await insertShared(env, app, str(b.deviceId, 64) || "anon");
  return json({ id, url: `${origin}/a/${id}` });
}

async function handleRooms(request: Request, env: Env, url: URL, path: string): Promise<Response | null> {
  if (!path.startsWith("/api/rooms")) return null;
  if (!env.DB) return json({ error: "Ortak kullanım henüz açık değil" }, 503);

  if (path === "/api/rooms" && request.method === "POST") {
    const b = await readJson(request);
    if (!b) return json({ error: "Geçersiz istek" }, 400);
    const room = {
      name: str(b.name, 24) || "Uygulama",
      emoji: str(b.emoji, 8) || "✨",
      description: str(b.description, 200),
      html: typeof b.html === "string" ? b.html : "",
    };
    if (!room.html || room.html.length > MAX_SHARED_HTML) return json({ error: "Uygulama çok büyük" }, 400);
    const problem = checkHtml(room.html);
    if (problem) return json({ error: `Uygulama ortak kullanıma açılamadı (${problem})` }, 422);
    const data: Record<string, string> = {};
    if (b.data && typeof b.data === "object") {
      for (const [k, v] of Object.entries(b.data as Record<string, unknown>)) {
        const s = JSON.stringify(v ?? null);
        if (k.length <= 200 && s.length <= MAX_ROOM_VALUE) data[k] = s;
      }
    }
    const id = await createRoom(env, room, str(b.deviceId, 64) || "anon", data);
    return json({ id, url: `${url.origin}/j/${id}`, now: Date.now() });
  }

  const m = path.match(/^\/api\/rooms\/([a-z0-9]{6,16})(\/data|\/html|\/changes)?$/);
  if (!m) return json({ error: "Bulunamadı" }, 404);
  const [, id, sub] = m;

  if (!sub && request.method === "GET") {
    const room = await getRoom(env, id);
    return room ? json(room) : json({ error: "Ortak uygulama bulunamadı" }, 404);
  }
  if (sub === "/changes" && request.method === "GET") {
    const since = Number(url.searchParams.get("since")) || 0;
    const res = await roomChanges(env, id, since, str(url.searchParams.get("deviceId"), 64) || "anon");
    return res ? json(res) : json({ error: "Ortak uygulama bulunamadı" }, 404);
  }
  if (sub === "/data" && request.method === "POST") {
    const b = await readJson(request);
    const key = str(b?.key, 200);
    if (!b || !key) return json({ error: "Geçersiz istek" }, 400);
    const value = JSON.stringify(b.value ?? null);
    if (value.length > MAX_ROOM_VALUE) return json({ error: "Veri çok büyük" }, 400);
    const res = await setRoomValue(env, id, key, value, str(b.deviceId, 64) || "anon");
    return "error" in res ? json(res, 404) : json(res);
  }
  if (sub === "/html" && request.method === "PUT") {
    const b = await readJson(request);
    const h = typeof b?.html === "string" ? b.html : "";
    if (!h || h.length > MAX_SHARED_HTML) return json({ error: "Uygulama çok büyük" }, 400);
    const problem = checkHtml(h);
    if (problem) return json({ error: `Güncellenemedi (${problem})` }, 422);
    const res = await setRoomHtml(env, id, h, str(b?.deviceId, 64) || "anon");
    return "error" in res ? json(res, 404) : json(res);
  }
  return json({ error: "Bulunamadı" }, 404);
}

// Üret → güvenlik ve sözdizimi kontrolü. Sözdizimi hatası varsa bir kez kendi kendine düzelttirir.
async function generateChecked(env: Env, prompt: string, previousHtml: string | undefined, image: ImageInput | undefined, lang: string) {
  let app: GeneratedApp = await generate(env, buildUserMessage(prompt, previousHtml, { lang, hasImage: !!image }), image);
  if (app.refused) return { app, fixed: false };
  const err = syntaxError(app.html);
  if (!err) return { app, fixed: false };
  const fixPrompt = `Uygulamada JavaScript sözdizimi hatası var, düzelt (başka hiçbir şeyi değiştirme): ${err}`;
  const second = await generate(env, buildUserMessage(fixPrompt, app.html, { lang }));
  if (second.refused || syntaxError(second.html)) return { app, fixed: false }; // daha iyi değilse ilkini ver; uygulama içi düzeltme devreye girer
  return { app: { ...second, name: app.name, emoji: app.emoji, description: app.description, category: app.category }, fixed: true };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const apkUrl = env.APK_URL || "https://github.com/cech56/cep-fabrikasi/releases";
    if (path === "/health") return json({ ok: true, provider: env.AI_PROVIDER, db: !!env.DB });
    if (path === "/gizlilik" || path === "/privacy") return html(privacyPage(path === "/privacy" ? "en" : pageLang(request)));
    if (path === "/kosullar" || path === "/terms") return html(termsPage(path === "/terms" ? "en" : pageLang(request)));

    // Mini uygulamanın kendi yapay zekâ sorusu (cep.ai)
    if (path === "/api/ai" && request.method === "POST") {
      const b = await readJson(request);
      const lang = b?.lang === "en" ? "en" : "tr";
      const prompt = str(b?.prompt, 4000);
      if (!prompt) return json({ error: tr(lang, "Ne yapmak istediğini yaz") }, 400);
      const deviceId = str(b?.deviceId, 64) || "anon";
      if (await overDailyLimit(env, `ai:${deviceId}`, Number(env.AI_CALLS_PER_DEVICE || 50))) {
        return json({ error: tr(lang, "Bugünlük yapay zekâ hakkın doldu."), limit: true }, 429);
      }
      try {
        const text = await aiText(env, str(b?.system, 2000), `${lang === "en" ? "Answer in English." : "Türkçe yanıt ver."}\n\n${prompt}`);
        return json({ text });
      } catch (e) {
        return json({ error: e instanceof ProviderError ? tr(lang, e.message) : tr(lang, "Beklenmeyen bir hata oldu") }, 502);
      }
    }
    if (path === "/api/crash" && request.method === "POST") {
      const b = (await readJson(request)) ?? {};
      ctx.waitUntil(
        logCrash(env, { message: str(b.message, 500), stack: str(b.stack, 4000), version: str(b.version, 20), deviceId: str(b.deviceId, 64) || "anon" }).catch(() => {}),
      );
      return json({ ok: true });
    }

    // Paylaşılan uygulamanın web sayfası
    let m = path.match(/^\/a\/([a-z0-9]{4,16})$/);
    if (m && request.method === "GET") {
      const lang = pageLang(request);
      if (!env.DB) return html(notFoundPage(lang), 404);
      const app = await getShared(env, m[1], true);
      return app ? html(sharedPage(app, url.origin, apkUrl, lang)) : html(notFoundPage(lang), 404);
    }
    // Birlikte kullan davet sayfası
    m = path.match(/^\/j\/([a-z0-9]{6,16})$/);
    if (m && request.method === "GET") {
      const lang = pageLang(request);
      if (!env.DB) return html(notFoundPage(lang), 404);
      const room = await getRoom(env, m[1]);
      return room ? html(invitePage(room, apkUrl, lang)) : html(notFoundPage(lang), 404);
    }
    const rooms = await handleRooms(request, env, url, path);
    if (rooms) return rooms;

    // Uygulama içinden açma / uyarlama
    m = path.match(/^\/api\/apps\/([a-z0-9]{4,16})$/);
    if (m && request.method === "GET") {
      if (!env.DB) return json({ error: "Bulunamadı" }, 404);
      const app = await getShared(env, m[1], url.searchParams.get("view") === "1");
      return app ? json(app) : json({ error: "Bu uygulama bulunamadı ya da kaldırılmış" }, 404);
    }
    m = path.match(/^\/api\/apps\/([a-z0-9]{4,16})\/(report|like)$/);
    if (m && request.method === "POST") {
      if (!env.DB) return json({ ok: true });
      const b = (await readJson(request)) ?? {};
      const deviceId = str(b.deviceId, 64) || "anon";
      if (m[2] === "like") return json(await toggleLike(env, m[1], deviceId));
      await reportShared(env, m[1], deviceId, str(b.reason, 300));
      return json({ ok: true });
    }
    if (path === "/api/share" && request.method === "POST") return handleShare(request, env, url.origin);
    if (path === "/api/vitrin" && request.method === "GET") {
      if (!env.DB) return json({ items: [] });
      const p = url.searchParams;
      const category = p.get("category") || "";
      const items = await listVitrin(env, {
        sort: p.get("sort") === "new" ? "new" : "popular",
        limit: Math.min(50, Number(p.get("limit")) || 30),
        offset: Math.max(0, Number(p.get("offset")) || 0),
        category: (CATEGORIES as readonly string[]).includes(category) ? category : undefined,
        q: str(p.get("q"), 60) || undefined,
        deviceId: str(p.get("deviceId"), 64),
      });
      return json({ items });
    }
    if (path === "/api/vitrin/featured" && request.method === "GET") {
      if (!env.DB) return json({ item: null });
      return json({ item: await featured(env, str(url.searchParams.get("deviceId"), 64)) });
    }
    if (path === "/api/usage" && request.method === "GET") return json(await usageToday(env, str(url.searchParams.get("deviceId"), 64) || "anon"));
    if (path !== "/generate" || request.method !== "POST") return json({ error: "Bulunamadı" }, 404);

    const body = await readJson(request);
    if (!body) return json({ error: "Geçersiz istek" }, 400);
    const lang = body.lang === "en" ? "en" : "tr";
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const previousHtml = typeof body.previousHtml === "string" ? body.previousHtml : undefined;
    const deviceId = typeof body.deviceId === "string" ? body.deviceId.slice(0, 64) : "anon";
    let image: ImageInput | undefined;
    if (body.image && typeof body.image === "object") {
      const i = body.image as Record<string, unknown>;
      if (typeof i.data !== "string" || typeof i.mime !== "string" || !IMAGE_TYPES.includes(i.mime) || i.data.length > MAX_IMAGE_B64) {
        return json({ error: tr(lang, "Görsel çok büyük ya da desteklenmiyor") }, 400);
      }
      image = { mime: i.mime, data: i.data };
    }
    if (!prompt) return json({ error: tr(lang, "Ne yapmak istediğini yaz") }, 400);
    if (prompt.length > MAX_PROMPT) return json({ error: tr(lang, "İstek çok uzun, biraz kısalt") }, 400);
    if (previousHtml && previousHtml.length > MAX_PREVIOUS_HTML) return json({ error: tr(lang, "Uygulama çok büyük") }, 400);

    if (await overDailyLimit(env, deviceId)) return json({ error: tr(lang, "Bugünlük üretim hakkın doldu, yarın görüşürüz.") }, 429);

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
          const { app, fixed } = await generateChecked(env, prompt, previousHtml, image, lang);
          if (app.refused) return finish({ refused: true, reason: app.refusal_reason || tr(lang, "Bu isteği yapamıyorum.") });
          const problem = checkHtml(app.html);
          if (problem) return finish({ error: `${lang === "en" ? "The app failed the safety check" : "Uygulama güvenlik kontrolünden geçemedi"} (${problem}).` });
          return finish({
            name: app.name.slice(0, 24) || (lang === "en" ? "New app" : "Yeni uygulama"),
            emoji: app.emoji || "✨",
            description: app.description,
            category: normalizeCategory(app.category),
            html: app.html,
            selfFixed: fixed,
          });
        } catch (e) {
          if (e instanceof ProviderError) return finish({ error: tr(lang, e.message) });
          if (e instanceof SyntaxError) return finish({ error: tr(lang, "AI bozuk bir yanıt verdi, tekrar dene.") });
          return finish({ error: tr(lang, "Beklenmeyen bir hata oldu") });
        }
      })(),
    );
    return new Response(readable, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
  },
};

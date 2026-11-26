// Çizim Canlanır ara sunucusu: çizimi tanır (isim, tür, konuşma, uzuv kutuları).
// Gizlilik: Görsel hiçbir yere kaydedilmez ve loglanmaz; sadece Gemini'ye gönderilip yanıt geri döner.

type Env = { GEMINI_API_KEY?: string; GEMINI_MODEL: string; GEMINI_THINKING?: string; DAILY_LIMIT_PER_DEVICE: string };

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST,OPTIONS" };
const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json; charset=utf-8", ...CORS } });

const SYSTEM = `Bir çocuğun kâğıda çizdiği resmi görüyorsun (arka planı silinmiş, beyaz zemin üstünde).
Görevin: Bu çizimi sevimli bir karaktere dönüştürmek için bilgi vermek. Çocuklar için güvenli, nazik, neşeli ol.
Kurallar:
- name: Çizime uygun, sevimli, kısa bir Türkçe isim (ör. "Pofuduk", "Turuncu Pati", "Roket Ramazan" değil, gerçek kişi adı kullanma). En fazla 2 kelime.
- kind: Çizimin ne olduğu, Türkçe tek-iki kelime (kedi, dinozor, prenses, araba, çiçek, canavar...). Emin değilsen "sevimli yaratık".
- emoji: türü anlatan tek emoji.
- greeting: Karakterin çocuğa ilk sözü, birinci tekil şahıs, en fazla 14 kelime, ismini söylesin.
- lines: Karakterin söyleyebileceği 6 kısa, komik, sevimli cümle (her biri en fazla 12 kelime). Kişisel bilgi sorma (isim, adres, okul, yaş sorma). Korkutucu, şiddet içeren, marka veya gerçek kişi içeren şey söyleme.
- walkStyle: Nasıl hareket eder: "walk" (bacaklı), "hop" (tavşan, kurbağa, top gibi zıplayan), "fly" (kuş, kelebek, uçak, arı), "swim" (balık, deniz canlısı), "slither" (yılan, solucan), "roll" (araba, tren, tekerlekli).
- voicePitch: Ses inceliği 0.7 (kalın, büyük) ile 1.8 (ince, minik) arası.
- legs, arms, wings: Çizimdeki bacakların, kolların ve kanatların kutuları. Her kutu [ymin, xmin, ymax, xmax], 0-1000 arası normalize. Bacak kutusu kalçadan ayağa kadar olsun, gövdeyi içermesin. Yoksa boş liste ver. En fazla 4'er tane.
- Çizim bir insansa (çocuğun kendisi, ailesi gibi) yine çizilmiş bir karakter gibi davran, gerçek kişi adı verme.
- Fotoğrafta çizim yerine gerçek bir insan yüzü veya uygunsuz içerik varsa: name "Sürpriz", kind "sevimli yaratık" ver ve kutuları boş bırak.`;

const box = { type: "ARRAY", items: { type: "ARRAY", items: { type: "NUMBER" } } };
const SCHEMA = {
  type: "OBJECT",
  properties: {
    name: { type: "STRING" },
    kind: { type: "STRING" },
    emoji: { type: "STRING" },
    greeting: { type: "STRING" },
    lines: { type: "ARRAY", items: { type: "STRING" } },
    walkStyle: { type: "STRING", enum: ["walk", "hop", "fly", "swim", "slither", "roll"] },
    voicePitch: { type: "NUMBER" },
    legs: box,
    arms: box,
    wings: box,
  },
  required: ["name", "kind", "emoji", "greeting", "lines", "walkStyle", "voicePitch", "legs", "arms", "wings"],
};

// Çocuklara gidecek metin için son güvenlik süzgeci
const BAD = /((^|\s)(öl|ölür|öldür)|(^|\s)kan(\s|$)|silah|bıçak|seks|uyuşturucu|adresin|okulun|şifre|telefon numara)/i;
const clean = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "");

// Basit günlük sınır (bellek içi; dağıtık değildir ama ücretsiz kotayı korumaya yeter)
const usage = new Map<string, { day: string; n: number }>();

async function analyze(env: Env, image: string) {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY eksik");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent`;
  const call = () =>
    fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY! },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ inline_data: { mime_type: "image/jpeg", data: image } }, { text: "Bu çizimi karaktere dönüştür." }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: SCHEMA,
          maxOutputTokens: 2048,
          temperature: 0.9,
          ...(env.GEMINI_THINKING ? { thinkingConfig: { thinkingLevel: env.GEMINI_THINKING } } : {}),
        },
      }),
    });
  let res = await call();
  if (res.status === 503 || res.status === 500) {
    await new Promise((r) => setTimeout(r, 1500));
    res = await call();
  }
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data: any = await res.json();
  const text = (data?.candidates?.[0]?.content?.parts ?? []).filter((p: any) => !p.thought && p.text).map((p: any) => p.text).join("");
  const d = JSON.parse(text);
  const lines = (Array.isArray(d.lines) ? d.lines : []).map((l: unknown) => clean(l, 90)).filter((l: string) => l && !BAD.test(l)).slice(0, 8);
  const greeting = clean(d.greeting, 110);
  return {
    name: clean(d.name, 24) || "Sürpriz",
    kind: clean(d.kind, 30),
    emoji: clean(d.emoji, 4) || "✨",
    greeting: BAD.test(greeting) ? "" : greeting,
    lines,
    walkStyle: d.walkStyle,
    voicePitch: d.voicePitch,
    legs: d.legs,
    arms: d.arms,
    wings: d.wings,
  };
}

const PRIVACY = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Çizim Canlanır · Gizlilik</title>
<style>body{font-family:system-ui,sans-serif;max-width:680px;margin:0 auto;padding:24px;line-height:1.6;color:#1b1530}h1{color:#6d4fd8}</style></head><body>
<h1>Çizim Canlanır Gizlilik Politikası</h1>
<p>Çizim Canlanır, çocukların kâğıda çizdiği resimleri telefonda canlandıran bir uygulamadır. Çocukların gizliliğini korumak için en az veriyle çalışacak şekilde tasarlanmıştır.</p>
<h2>Toplamadığımız bilgiler</h2>
<p>Hesap açılmaz. İsim, yaş, e-posta, telefon numarası, konum, ses kaydı veya yüz fotoğrafı istenmez ve toplanmaz. Uygulama reklam göstermez ve reklam takibi yapmaz.</p>
<h2>Telefonda kalan bilgiler</h2>
<p>Çizimler, karakterler ve kaydedilen videolar yalnızca kullanıcının telefonunda saklanır. Kamera görüntüsü kaydedilmez; sahne sadece ekranda gösterilir. Video, yalnızca kullanıcı "Kaydet" düğmesine bastığında telefonda oluşturulur ve paylaşmak için ebeveyn onayı istenir.</p>
<h2>Yapay zekâ ile çizim tanıma (isteğe bağlı)</h2>
<p>Ebeveyn izin verirse, çizimin arka planı silinmiş küçük bir kopyası, karakterin ne olduğunu anlamak ve ona isim ile konuşma üretmek için sunucumuz üzerinden Google Gemini hizmetine gönderilir. Sunucumuz bu görseli kaydetmez ve loglamaz. Bu özellik Ayarlar'dan her zaman kapatılabilir; kapalıyken hiçbir görsel gönderilmez.</p>
<h2>Cihaz numarası</h2>
<p>Günlük kullanım sınırı için rastgele üretilen, kişiyle ilişkilendirilemeyen bir numara kullanılır.</p>
<h2>Silme</h2>
<p>Tüm karakterler Ayarlar &gt; Tüm karakterleri sil ile ya da uygulama kaldırılarak tamamen silinir.</p>
</body></html>`;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (url.pathname === "/health") return json({ ok: true, ai: !!env.GEMINI_API_KEY });
    if (url.pathname === "/gizlilik") return new Response(PRIVACY, { headers: { "content-type": "text/html; charset=utf-8" } });
    if (url.pathname === "/api/analyze" && req.method === "POST") {
      let body: any;
      try {
        body = await req.json();
      } catch {
        return json({ error: "bad json" }, 400);
      }
      const image = typeof body?.image === "string" ? body.image : "";
      if (!image || image.length > 1_500_000) return json({ error: "görsel yok ya da çok büyük" }, 400);
      const device = String(body?.deviceId ?? "").slice(0, 64) || req.headers.get("cf-connecting-ip") || "anon";
      const day = new Date().toISOString().slice(0, 10);
      const u = usage.get(device);
      const n = u && u.day === day ? u.n : 0;
      if (n >= Number(env.DAILY_LIMIT_PER_DEVICE || 30)) return json({ error: "Bugünlük sınır doldu" }, 429);
      usage.set(device, { day, n: n + 1 });
      try {
        return json(await analyze(env, image));
      } catch (e: any) {
        console.log("analyze error", String(e?.message ?? e).slice(0, 200));
        return json({ error: "tanınamadı" }, 502);
      }
    }
    return json({ error: "not found" }, 404);
  },
};

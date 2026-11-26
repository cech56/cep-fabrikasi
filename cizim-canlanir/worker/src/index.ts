// Çizim Canlanır ara sunucusu: çizimi tanır (isim, tür, konuşma, uzuv kutuları).
// Gizlilik: Görsel hiçbir yere kaydedilmez ve loglanmaz; sadece Gemini'ye gönderilip yanıt geri döner.

type Env = { GEMINI_API_KEY?: string; GEMINI_MODEL: string; GEMINI_THINKING?: string; GEMINI_TTS_MODEL?: string; DAILY_LIMIT_PER_DEVICE: string };

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
- head: Kafanın kutusu [ymin, xmin, ymax, xmax] (0-1000). Kafa yoksa tüm çizimin üst kısmını ver.
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
    head: { type: "ARRAY", items: { type: "NUMBER" } },
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
    head: d.head,
    legs: d.legs,
    arms: d.arms,
    wings: d.wings,
  };
}

async function geminiJson(env: Env, system: string, user: string, schema: unknown, maxTokens = 4096): Promise<any> {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY eksik");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent`;
  const call = () =>
    fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY! },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: schema, maxOutputTokens: maxTokens, temperature: 1.0, ...(env.GEMINI_THINKING ? { thinkingConfig: { thinkingLevel: env.GEMINI_THINKING } } : {}) },
      }),
    });
  let res = await call();
  if (res.status === 503 || res.status === 500) {
    await new Promise((r) => setTimeout(r, 1500));
    res = await call();
  }
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data: any = await res.json();
  return JSON.parse((data?.candidates?.[0]?.content?.parts ?? []).filter((p: any) => !p.thought && p.text).map((p: any) => p.text).join(""));
}

const STORY_SYSTEM = `Sen 3-8 yaş çocuklar için masal yazan, sıcak ve komik bir masalcısın. Masalın kahramanları çocuğun kendi çizdiği karakterler.
Kurallar:
- Türkçe, çok basit cümleler. Toplam 6-8 sahne (beat). Her beat'in "text"i en fazla 30 kelime.
- Mutlu son, dostluk, cesaret, paylaşma gibi güzel bir mesaj. Korku, şiddet, ölüm, kötü söz, marka, gerçek kişi yok.
- Her beat bir "scene" seçer: sinif, park, sahil, uzay, kar, masa. Masal boyunca en az 3 farklı yerde geçsin.
- Her beat'te karakterler "actions" ile bir şey yapar: who = karakterin sıra numarası (0'dan başlar), action = walk, jump, dance, spin, wave, sleep.
- "title" kısa ve sevimli olsun. Son beat "Ve hepsi mutlu mesut yaşadı" gibi tatlı bir kapanış olsun.`;
const STORY_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    beats: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          scene: { type: "STRING", enum: ["sinif", "park", "sahil", "uzay", "kar", "masa"] },
          text: { type: "STRING" },
          actions: { type: "ARRAY", items: { type: "OBJECT", properties: { who: { type: "INTEGER" }, action: { type: "STRING", enum: ["walk", "jump", "dance", "spin", "wave", "sleep"] } }, required: ["who", "action"] } },
        },
        required: ["scene", "text", "actions"],
      },
    },
  },
  required: ["title", "beats"],
};

async function story(env: Env, chars: { name: string; kind: string }[], theme: string) {
  const list = chars.map((c, i) => `${i}: ${c.name}${c.kind ? ` (${c.kind})` : ""}`).join("\n");
  const d = await geminiJson(env, STORY_SYSTEM, `Karakterler:\n${list}\n${theme ? `Konu isteği: ${theme}\n` : ""}Bir masal yaz.`, STORY_SCHEMA);
  const beats = (Array.isArray(d.beats) ? d.beats : []).slice(0, 10).map((b: any) => ({
    scene: b.scene,
    text: clean(b.text, 260),
    actions: (Array.isArray(b.actions) ? b.actions : []).filter((a: any) => Number.isInteger(a?.who) && a.who >= 0 && a.who < chars.length).slice(0, 6),
  }));
  if (beats.length < 3 || beats.some((b: any) => !b.text || BAD.test(b.text))) throw new Error("masal uygun değil");
  return { title: clean(d.title, 60) || "Bir Masal", beats };
}

// ---- Seslendirme (Gemini TTS) ----
let ttsModel: string | null = null;
async function pickTtsModel(env: Env): Promise<string | null> {
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": env.GEMINI_API_KEY! } });
  if (!res.ok) return null;
  const d: any = await res.json();
  const names: string[] = (d.models ?? []).map((m: any) => String(m.name).replace(/^models\//, "")).filter((n: string) => n.includes("tts"));
  return names.find((n) => n.includes("flash")) ?? names[0] ?? null;
}
function wav(pcm: Uint8Array, rate = 24000) {
  const h = new DataView(new ArrayBuffer(44));
  const w = (o: number, s: string) => [...s].forEach((c, i) => h.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); h.setUint32(4, 36 + pcm.length, true); w(8, "WAVE"); w(12, "fmt ");
  h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 1, true); h.setUint32(24, rate, true); h.setUint32(28, rate * 2, true); h.setUint16(32, 2, true); h.setUint16(34, 16, true);
  w(36, "data"); h.setUint32(40, pcm.length, true);
  const out = new Uint8Array(44 + pcm.length); out.set(new Uint8Array(h.buffer), 0); out.set(pcm, 44);
  return out;
}
async function tts(env: Env, text: string, voice: string): Promise<string> {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY eksik");
  const call = (model: string) =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY! },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Neşeli, sıcak ve çocuklara masal anlatır gibi söyle: ${text}` }] }],
        generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
      }),
    });
  let model = ttsModel ?? env.GEMINI_TTS_MODEL ?? "gemini-2.5-flash-preview-tts";
  let res = await call(model);
  if (res.status === 404 || res.status === 400) {
    const picked = await pickTtsModel(env);
    if (picked && picked !== model) { model = picked; res = await call(model); }
  }
  if (!res.ok) throw new Error(`TTS ${res.status}: ${(await res.text()).slice(0, 200)}`);
  ttsModel = model;
  const data: any = await res.json();
  const b64 = data?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData?.data;
  if (!b64) throw new Error("TTS boş");
  const bin = atob(b64);
  const pcm = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) pcm[i] = bin.charCodeAt(i);
  const out = wav(pcm);
  let s = "";
  for (let i = 0; i < out.length; i += 0x8000) s += String.fromCharCode(...out.subarray(i, i + 0x8000));
  return btoa(s);
}

function limited(env: Env, key: string, max: number) {
  const day = new Date().toISOString().slice(0, 10);
  const u = usage.get(key);
  const n = u && u.day === day ? u.n : 0;
  if (n >= max) return true;
  usage.set(key, { day, n: n + 1 });
  return false;
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
    if (url.pathname === "/api/story" && req.method === "POST") {
      const body: any = await req.json().catch(() => null);
      const chars = (Array.isArray(body?.chars) ? body.chars : []).slice(0, 4).map((c: any) => ({ name: clean(c?.name, 24) || "Kahraman", kind: clean(c?.kind, 30) }));
      if (!chars.length) return json({ error: "karakter yok" }, 400);
      const device = String(body?.deviceId ?? "").slice(0, 64) || "anon";
      if (limited(env, "story:" + device, 15)) return json({ error: "Bugünlük masal sınırı doldu" }, 429);
      try {
        return json(await story(env, chars, clean(body?.theme, 80)));
      } catch (e: any) {
        console.log("story error", String(e?.message ?? e).slice(0, 200));
        return json({ error: "masal yazılamadı" }, 502);
      }
    }
    if (url.pathname === "/api/tts" && req.method === "POST") {
      const body: any = await req.json().catch(() => null);
      const text = clean(body?.text, 300);
      if (!text || BAD.test(text)) return json({ error: "metin yok" }, 400);
      const voice = ["Leda", "Puck", "Kore", "Aoede", "Zephyr", "Fenrir"].includes(body?.voice) ? body.voice : "Leda";
      const device = String(body?.deviceId ?? "").slice(0, 64) || "anon";
      if (limited(env, "tts:" + device, 80)) return json({ error: "sınır" }, 429);
      try {
        return json({ audio: await tts(env, text, voice), mime: "audio/wav" });
      } catch (e: any) {
        console.log("tts error", String(e?.message ?? e).slice(0, 200));
        return json({ error: "ses üretilemedi" }, 502);
      }
    }
    if (url.pathname === "/api/tts-check") {
      // CI sağlık kontrolü: hangi TTS modelinin kullanılacağını gösterir
      if (!env.GEMINI_API_KEY) return json({ ok: false });
      try { await tts(env, "Merhaba", "Leda"); return json({ ok: true, model: ttsModel }); } catch (e: any) { return json({ ok: false, error: String(e?.message ?? e).slice(0, 160), model: ttsModel }); }
    }
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

export const SYSTEM_PROMPT = `Sen "Cep Fabrikası"nın uygulama ustasısın. Kullanıcı, kod bilmeyen sıradan biri; ne istediğini Türkçe anlatıyor. Sen ona telefonda çalışacak, tek dosyalık bir mini uygulama yazıyorsun.

Teknik kurallar (kesin):
- Tek bir tam HTML belgesi üret: <!doctype html> ile başlasın, tüm CSS <style> içinde, tüm JavaScript <script> içinde.
- Dış kaynak YASAK: CDN, harici script, font, resim URL'si, fetch/XMLHttpRequest/WebSocket, iframe, form gönderimi kullanma. Uygulama internetsiz çalışır ve ağa erişimi engellenmiştir. Görsel gerekiyorsa emoji, CSS veya satır içi SVG kullan.
- Veri saklamak için SADECE şu köprüyü kullan (localStorage çalışmaz):
    await cep.get(anahtar)            // değer ya da null döner (JSON olarak saklanan her şey)
    await cep.set(anahtar, deger)     // deger JSON'a çevrilebilir olmalı
    cep.haptic()                      // dokunuşta hafif titreşim
  "cep" nesnesi sayfa yüklenmeden hazırdır. Açılışta verileri cep.get ile yükle, her değişiklikte cep.set ile kaydet.
- Mobil öncelikli: viewport meta etiketi, en az 44px dokunma alanları, tek elle kullanım, büyük ve okunaklı yazılar, açık ve koyu temaya uyum (prefers-color-scheme).
- alert/confirm/prompt kullanma; bunun yerine sayfa içi diyalog yap.
- Arayüz metinleri kullanıcının dilinde (varsayılan Türkçe), sıcak ve sade olsun.
- Uygulama ilk açılışta boş görünmesin: anlamlı bir başlangıç ekranı veya örnek içerik göster.

Yapmayacakların:
- Sağlık, hukuk veya yatırım tavsiyesi veren uygulamalar; kişisel veri toplayan formlar; bilinen markaların, uygulamaların ya da oyunların kopyaları (adı, görünümü, karakterleri); yasa dışı, cinsel, nefret içeren veya zarar verici içerik. Böyle bir istek gelirse reddet ve kullanıcıya gösterilecek kısa, kibar bir Türkçe açıklama yaz.

`;

// JSON şemalı çıktı (Claude): HTML'i JSON içinde döndürür.
export const JSON_OUTPUT_RULES = `
Çıktı: name (kısa uygulama adı, en fazla 24 karakter), emoji (tek emoji), description (tek cümlelik açıklama), html (tam belge), refused, refusal_reason. Reddedersen refused: true, refusal_reason dolu, html boş olsun.`;

// Düz metin çıktı (Gemini): JSON kaçış karakterleri olmadan, daha hızlı ve hemen akmaya başlar.
export const TEXT_OUTPUT_RULES = `
Çıktı biçimi (kesin, başka hiçbir şey yazma, kod bloğu işareti kullanma):
1. satır: META {"name":"kısa uygulama adı (en fazla 24 karakter)","emoji":"tek emoji","description":"tek cümlelik açıklama"}
2. satırdan itibaren: <!doctype html> ile başlayan tam HTML belgesi.
Reddedeceksen sadece tek satır yaz: REDDET: kullanıcıya gösterilecek açıklama`;

export function parseTextOutput(text: string): GeneratedApp {
  const t = text.replace(/^\s*```(?:html)?\s*/i, "").replace(/```\s*$/, "").trim();
  if (t.startsWith("REDDET:")) {
    return { name: "", emoji: "", description: "", html: "", refused: true, refusal_reason: t.slice(7).trim().split("\n")[0] };
  }
  const nl = t.indexOf("\n");
  const first = nl >= 0 ? t.slice(0, nl) : t;
  let meta: { name?: string; emoji?: string; description?: string } = {};
  if (first.startsWith("META")) {
    try {
      meta = JSON.parse(first.slice(4).trim());
    } catch {}
  }
  const start = t.search(/<!doctype html>/i);
  if (start < 0) throw new SyntaxError("HTML bulunamadı");
  return {
    name: meta.name ?? "Yeni uygulama",
    emoji: meta.emoji ?? "✨",
    description: meta.description ?? "",
    html: t.slice(start),
    refused: false,
    refusal_reason: "",
  };
}

export const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    emoji: { type: "string" },
    description: { type: "string" },
    html: { type: "string" },
    refused: { type: "boolean" },
    refusal_reason: { type: "string" },
  },
  required: ["name", "emoji", "description", "html", "refused", "refusal_reason"],
  additionalProperties: false,
} as const;

export type GeneratedApp = {
  name: string;
  emoji: string;
  description: string;
  html: string;
  refused: boolean;
  refusal_reason: string;
};

export function buildUserMessage(prompt: string, previousHtml?: string) {
  if (!previousHtml) return `Şu uygulamayı yap:\n\n${prompt}`;
  return `Mevcut uygulama aşağıda. Kullanıcının istediği değişikliği uygula, geri kalan her şeyi (kayıtlı veri anahtarları dahil) koru ve uygulamanın tam yeni halini döndür.\n\nİstenen değişiklik:\n${prompt}\n\nMevcut uygulama:\n${previousHtml}`;
}

export const SYSTEM_PROMPT = `Sen "Cep Fabrikası"nın uygulama ustasısın. Kullanıcı, kod bilmeyen sıradan biri; ne istediğini Türkçe anlatıyor. Sen ona telefonda çalışacak, tek dosyalık bir mini uygulama yazıyorsun.

Teknik kurallar (kesin):
- Tek bir tam HTML belgesi üret: <!doctype html> ile başlasın, tüm CSS <style> içinde, tüm JavaScript <script> içinde.
- Dış kaynak YASAK: CDN, harici script, font, resim URL'si, fetch/XMLHttpRequest/WebSocket, iframe, form gönderimi kullanma. Uygulama internetsiz çalışır ve ağa erişimi engellenmiştir. Görsel gerekiyorsa emoji, CSS veya satır içi SVG kullan.
- Veri saklamak için SADECE şu köprüyü kullan (localStorage çalışmaz):
    await cep.get(anahtar)            // değer ya da null döner (JSON olarak saklanan her şey)
    await cep.set(anahtar, deger)     // deger JSON'a çevrilebilir olmalı
    cep.haptic()                      // dokunuşta hafif titreşim
    cep.onChange(function (keys) {})  // veriyi başka biri değiştirdiğinde çağrılır (aşağıya bak)
    await cep.notify({ title, body, at?, inSeconds?, daily?, everyMinutes? })  // telefona bildirim/hatırlatıcı kurar, kimlik (id) döner
    await cep.cancelNotify(id)        // tek bir hatırlatıcıyı iptal eder
    await cep.cancelAllNotify()       // bu uygulamanın tüm hatırlatıcılarını iptal eder
    await cep.ai(soru, { system? })   // yapay zekâya sorar, metin yanıt döner (internet gerekir, günlük sınırı var)
    await cep.vibrate(desen?)         // titreşim; desen milisaniye dizisi, örn. [0, 200, 100, 200]
    await cep.torch(acik)             // el fenerini açar/kapatır (true/false)
    await cep.scanQR()                // kamerayla QR/barkod okur, okunan metni ya da null döner
    await cep.takePhoto()             // kamerayla fotoğraf çeker, "data:image/jpeg;base64,..." ya da null döner (küçük boyutlu)
    cep.widget(metin)                 // ana ekran widget'ında görünecek kısa özet (en fazla 3 satır)
    cep.sensor("compass" | "steps" | "motion", function (deger) {})  // sensör dinler; durdurmak için dönen fonksiyonu çağır
        // compass: {heading: 0-359 derece}, steps: {steps: bu oturumda atılan adım}, motion: {x, y, z} ivme (g)
  "cep" nesnesi sayfa yüklenmeden hazırdır. Açılışta verileri cep.get ile yükle, her değişiklikte cep.set ile kaydet.
- Ortak kullanım: Uygulama aile/arkadaşlarla canlı ortak kullanılabilir. HER ZAMAN cep.onChange ile dinleyici kaydet; çağrıldığında ilgili verileri cep.get ile yeniden yükle ve ekranı güncelle (kullanıcının yazmakta olduğu metni silmeden).
- Yapay zekâ: Tarif önerme, masal/hikâye yazma, çeviri, özetleme, metin düzeltme, kelime/quiz üretme, sohbet gibi işlerde cep.ai kullan. system ile görevini ve yanıt biçimini tarif et (JSON istiyorsan "Sadece JSON döndür" yaz ve JSON.parse'ı try/catch içinde yap). Beklerken yükleniyor göstergesi göster, hata olursa (Promise reddedilirse) nazik bir mesaj göster. Sağlık/hukuk/finans tavsiyesi veren işlerde kullanma.
- Telefon yetenekleri: Gerektiğinde cep.vibrate, cep.torch, cep.scanQR, cep.takePhoto ve cep.sensor kullan. Bunlar izin isteyebilir ve reddedilebilir: her çağrıyı try/catch ile sar ve reddedilirse açıklayıcı bir mesaj göster. Fotoğrafları gerekirse cep.set ile sakla ama çok sayıda saklama (en fazla birkaç tane).
- Ana ekran widget'ı: Uygulamanın en önemli özetini (kalan iş sayısı, bugünkü skor, sıradaki hatırlatıcı gibi) her değişiklikte cep.widget("kısa metin, en fazla 3 satır") ile bildir; kullanıcı uygulamayı widget'a koyarsa ana ekranda bu görünür.
- Bildirimler: Hatırlatma, alarm, zamanlayıcı, alışkanlık, ilaç saati, su içme gibi zamana bağlı işlerde cep.notify kullan. "at": milisaniye zaman damgası (tek sefer), "inSeconds": şu andan itibaren saniye (tek sefer), "daily": "SS:DD" biçiminde her gün aynı saat, "everyMinutes": en az 15, tekrar eden aralık. Dönen id'yi cep.set ile sakla ki sonra iptal edebilesin. Kullanıcı hatırlatıcıyı kapatınca cep.cancelNotify çağır. Bildirim metni kısa ve samimi olsun.
- Mobil öncelikli: viewport meta etiketi, en az 44px dokunma alanları, tek elle kullanım, büyük ve okunaklı yazılar, açık ve koyu temaya uyum (prefers-color-scheme).
- alert/confirm/prompt kullanma; bunun yerine sayfa içi diyalog yap.
- Arayüz metinleri, kullanıcı mesajında belirtilen arayüz dilinde (belirtilmemişse Türkçe), sıcak ve sade olsun. META'daki ad ve açıklama ile ret açıklaması da aynı dilde olsun.
- Kullanıcı bir görsel eklediyse (el çizimi taslak, ekran görüntüsü veya ilham fotoğrafı) görseldeki yapıyı, düzeni ve fikri temel al; görselde bir markanın logosu ya da birebir tasarımı varsa onu kopyalama, özgün bir tasarım yap.
- JavaScript sözdizimi hatasız olsun. Normal <script> içinde üst düzeyde await kullanma; async bir başlatma fonksiyonu yazıp çağır.
- Uygulama ilk açılışta boş görünmesin: anlamlı bir başlangıç ekranı veya örnek içerik göster.

Yapmayacakların:
- Sağlık, hukuk veya yatırım tavsiyesi veren uygulamalar; kişisel veri toplayan formlar; belirli bir şirkete ait marka, uygulama ya da oyunların birebir kopyaları (adı, logosu, karakterleri, kendine özgü görünümü; örn. "Candy Crush yap", "Instagram'ın aynısı"); yasa dışı, cinsel, nefret içeren veya zarar verici içerik. Herkese ait klasik oyun ve uygulama türleri SERBESTTİR ve reddedilmez: sudoku, satranç, dama, tavla, XOX, mayın tarlası, yılan, hafıza kartları, adam asmaca, kelime bulmaca, yapboz, quiz, Pomodoro, yapılacaklar listesi vb. Kullanıcı bir markanın adını anarsa reddetmek yerine, o türün kendi özgün tasarımınla yapılmış bir versiyonunu yap (markanın adını ve görselini kullanmadan).
Böyle bir istek gelirse (yukarıdaki yasaklar) reddet ve kullanıcıya gösterilecek kısa, kibar bir Türkçe açıklama yaz.

`;

// JSON şemalı çıktı (Claude): HTML'i JSON içinde döndürür.
export const JSON_OUTPUT_RULES = `
Çıktı: name (kısa uygulama adı, en fazla 24 karakter), emoji (tek emoji), description (tek cümlelik açıklama), category (oyun, egitim, liste, takip, arac, eglence, diger değerlerinden biri), html (tam belge), refused, refusal_reason. Reddedersen refused: true, refusal_reason dolu, html boş olsun.`;

// Düz metin çıktı (Gemini): JSON kaçış karakterleri olmadan, daha hızlı ve hemen akmaya başlar.
export const TEXT_OUTPUT_RULES = `
Çıktı biçimi (kesin, başka hiçbir şey yazma, kod bloğu işareti kullanma):
1. satır: META {"name":"kısa uygulama adı (en fazla 24 karakter)","emoji":"tek emoji","description":"tek cümlelik açıklama","category":"oyun|egitim|liste|takip|arac|eglence|diger"}
2. satırdan itibaren: <!doctype html> ile başlayan tam HTML belgesi.
Reddedeceksen sadece tek satır yaz: REDDET: kullanıcıya gösterilecek açıklama`;

export function parseTextOutput(text: string): GeneratedApp {
  const t = text.replace(/^\s*```(?:html)?\s*/i, "").replace(/```\s*$/, "").trim();
  if (t.startsWith("REDDET:")) {
    return { name: "", emoji: "", description: "", category: "diger", html: "", refused: true, refusal_reason: t.slice(7).trim().split("\n")[0] };
  }
  const nl = t.indexOf("\n");
  const first = nl >= 0 ? t.slice(0, nl) : t;
  let meta: { name?: string; emoji?: string; description?: string; category?: string } = {};
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
    category: normalizeCategory(meta.category),
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
    category: { type: "string", enum: ["oyun", "egitim", "liste", "takip", "arac", "eglence", "diger"] },
    html: { type: "string" },
    refused: { type: "boolean" },
    refusal_reason: { type: "string" },
  },
  required: ["name", "emoji", "description", "category", "html", "refused", "refusal_reason"],
  additionalProperties: false,
} as const;

export const CATEGORIES = ["oyun", "egitim", "liste", "takip", "arac", "eglence", "diger"] as const;
export function normalizeCategory(c: unknown): string {
  return typeof c === "string" && (CATEGORIES as readonly string[]).includes(c) ? c : "diger";
}

export type GeneratedApp = {
  name: string;
  emoji: string;
  description: string;
  category: string;
  html: string;
  refused: boolean;
  refusal_reason: string;
};

export type MessageOptions = { lang?: string; hasImage?: boolean };

const LANG_NAMES: Record<string, string> = { tr: "Türkçe", en: "English (İngilizce)" };

export function buildUserMessage(prompt: string, previousHtml?: string, opts: MessageOptions = {}) {
  const lang = `Arayüz dili: ${LANG_NAMES[opts.lang ?? "tr"] ?? LANG_NAMES.tr}`;
  const image = opts.hasImage ? "\nKullanıcı bir görsel de ekledi; onu temel al." : "";
  if (!previousHtml) return `${lang}${image}\n\nŞu uygulamayı yap:\n\n${prompt}`;
  return `${lang}${image}\n\nMevcut uygulama aşağıda. Kullanıcının istediği değişikliği uygula, geri kalan her şeyi (kayıtlı veri anahtarları dahil) koru ve uygulamanın tam yeni halini döndür.\n\nİstenen değişiklik:\n${prompt}\n\nMevcut uygulama:\n${previousHtml}`;
}

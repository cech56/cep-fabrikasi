// Gizlilik politikası ve kullanım şartları (mağaza için gerekli herkese açık sayfalar).
// Not: Bu metinler uygulamanın gerçekte ne yaptığını anlatır; yayından önce bir hukukçuya okutulması önerilir.
import { Lang } from "./page";

const UPDATED = "26.11.2026";

const PRIVACY = {
  tr: `<h1>Gizlilik Politikası</h1><p class="m">Son güncelleme: ${UPDATED}</p>
<p>Cep Fabrikası'nı hesap açmadan kullanırsın. Adını, e-postanı, telefon numaranı ya da konumunu istemeyiz.</p>
<h2>Telefonunda kalanlar</h2>
<ul><li>Yaptığın mini uygulamalar ve içlerine girdiğin veriler (listeler, notlar, skorlar) yalnızca telefonunda saklanır.</li>
<li>Hatırlatıcılar telefonunda yerel olarak kurulur.</li>
<li>Sesle yazdırma, telefonunun kendi ses tanıma servisini kullanır; ses kaydı bize gelmez.</li>
<li>Uygulamayı rastgele üretilmiş bir cihaz kimliğiyle tanırız. Bu kimlik seni kişi olarak tanımlamaz.</li></ul>
<h2>Sunucumuza gelenler</h2>
<ul><li><b>Uygulama isteklerin:</b> Yazdığın ya da söylediğin tarif, eklediğin fotoğraf ve değiştirmek istediğin uygulamanın kodu, uygulamayı üretmek için yapay zekâ sağlayıcımıza (Google Gemini) iletilir. Bunları kendi sunucumuzda saklamayız.</li>
<li><b>Mini uygulamaların yapay zekâ soruları:</b> Bir mini uygulama yapay zekâ özelliği kullanırsa, o soru aynı şekilde yapay zekâ sağlayıcısına iletilir ve saklanmaz.</li>
<li><b>Paylaştığın uygulamalar:</b> "Paylaş" dediğin uygulamanın adı, açıklaması, kodu ve takma adın herkese açık olarak saklanır. Uygulamanın içine girdiğin veriler paylaşılmaz.</li>
<li><b>Birlikte kullanılan uygulamalar:</b> "Birlikte kullan" dediğin uygulamanın verileri, davet ettiğin kişilerle eşitlenmek için sunucumuzda saklanır. Davet linkine sahip olan herkes bu verileri görebilir.</li>
<li><b>Sayılar:</b> Günlük kullanım hakkı için cihaz kimliği başına günlük üretim sayısı; vitrin için görüntülenme, beğeni ve şikayet sayıları.</li>
<li><b>Çökme raporları:</b> Uygulama çökerse hata mesajı, uygulama sürümü ve cihaz kimliği gönderilir; 30 gün sonra silinir.</li></ul>
<h2>Paylaşmadıklarımız</h2><p>Verilerini satmayız, reklam için kullanmayız. Yalnızca yukarıdaki hizmetleri sunmak için altyapı sağlayıcılarımızla (Cloudflare, Google) paylaşılır.</p>
<h2>Silme</h2><p>Telefonundaki verileri uygulamayı silerek ya da mini uygulamaya basılı tutup "Sil" diyerek silebilirsin. Paylaştığın bir uygulamanın kaldırılmasını istersen paylaşım linkini bize ilet.</p>
<h2>Çocuklar</h2><p>Paylaşma ve birlikte kullanma özelliklerine kişisel bilgi yazılmamalıdır. 13 yaşından küçük çocuklar uygulamayı bir ebeveyn eşliğinde kullanmalıdır.</p>
<h2>KVKK</h2><p>6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamındaki haklarını kullanmak için bizimle iletişime geçebilirsin.</p>`,
  en: `<h1>Privacy Policy</h1><p class="m">Last updated: ${UPDATED}</p>
<p>You use Cep Fabrikası without an account. We don't ask for your name, email, phone number or location.</p>
<h2>Stays on your phone</h2>
<ul><li>The mini apps you make and the data you enter in them (lists, notes, scores) are stored only on your phone.</li>
<li>Reminders are scheduled locally on your phone.</li>
<li>Dictation uses your phone's own speech recognition service; we never receive audio.</li>
<li>We recognize the app by a randomly generated device ID that doesn't identify you as a person.</li></ul>
<h2>Sent to our server</h2>
<ul><li><b>Your app requests:</b> The description you type or say, any photo you add, and the code of the app you're changing are sent to our AI provider (Google Gemini) to build the app. We don't store them on our server.</li>
<li><b>AI questions from mini apps:</b> If a mini app uses an AI feature, that question is sent to the AI provider the same way and isn't stored.</li>
<li><b>Apps you share:</b> The name, description, code and your nickname of an app you share are stored publicly. The data you entered inside the app is not shared.</li>
<li><b>Apps used together:</b> Data of an app you "use together" is stored on our server to sync with the people you invite. Anyone with the invite link can see that data.</li>
<li><b>Counts:</b> Daily build counts per device ID for the daily limit; views, likes and reports for the Showcase.</li>
<li><b>Crash reports:</b> If the app crashes, the error message, app version and device ID are sent and deleted after 30 days.</li></ul>
<h2>What we don't do</h2><p>We don't sell your data or use it for ads. It's shared only with our infrastructure providers (Cloudflare, Google) to run the services above.</p>
<h2>Deletion</h2><p>Delete data on your phone by uninstalling the app or long-pressing a mini app and tapping "Delete". To remove an app you shared, send us its share link.</p>
<h2>Children</h2><p>Don't put personal information in shared or jointly used apps. Children under 13 should use the app with a parent.</p>`,
};

const TERMS = {
  tr: `<h1>Kullanım Şartları</h1><p class="m">Son güncelleme: ${UPDATED}</p>
<ul><li>Cep Fabrikası, tarifine göre yapay zekâ ile mini uygulama üretir. Üretilen uygulamalar hatalı olabilir; önemli işler için tek başına güvenme.</li>
<li>Sağlık, hukuk veya finans konusunda tavsiye veren uygulamalar üretilmez; mini uygulamalardaki yapay zekâ yanıtları uzman görüşünün yerine geçmez.</li>
<li>Başkalarına ait marka, logo, karakter veya içeriğin kopyasını yaptırma ve paylaşma. Yasa dışı, nefret içeren, cinsel veya zarar verici içerik üretme ve paylaşma.</li>
<li>Paylaştığın uygulamaların sorumluluğu sana aittir. Şikayet edilen uygulamaları vitrinden kaldırabiliriz.</li>
<li>Ücretsiz kullanımda günlük üretim sınırı vardır. Fabrika Pro aboneliği mağaza üzerinden yönetilir ve istediğin zaman iptal edilebilir.</li>
<li>Hizmeti geliştirmek için özellikleri ve sınırları değiştirebiliriz.</li></ul>`,
  en: `<h1>Terms of Use</h1><p class="m">Last updated: ${UPDATED}</p>
<ul><li>Cep Fabrikası builds mini apps with AI from your description. Generated apps may contain mistakes; don't rely on them alone for important matters.</li>
<li>Apps giving health, legal or financial advice aren't generated; AI answers inside mini apps are not a substitute for professional advice.</li>
<li>Don't make or share copies of others' brands, logos, characters or content. Don't make or share illegal, hateful, sexual or harmful content.</li>
<li>You're responsible for the apps you share. We may remove reported apps from the Showcase.</li>
<li>Free use has a daily build limit. The Fabrika Pro subscription is managed through the app store and can be cancelled anytime.</li>
<li>We may change features and limits to improve the service.</li></ul>`,
};

function page(title: string, body: string, lang: Lang) {
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Cep Fabrikası</title>
<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:0 auto;padding:24px 18px 48px;line-height:1.6;background:#FFF7ED;color:#1C1917}
@media (prefers-color-scheme:dark){body{background:#1C1917;color:#FAFAF9}}h1{font-size:26px}h2{font-size:18px;margin-top:28px}.m{opacity:.7;font-size:14px}li{margin:6px 0}</style>
</head><body><div style="font-size:40px">🏭</div>${body}</body></html>`;
}

export const privacyPage = (lang: Lang) => page(lang === "tr" ? "Gizlilik Politikası" : "Privacy Policy", PRIVACY[lang], lang);
export const termsPage = (lang: Lang) => page(lang === "tr" ? "Kullanım Şartları" : "Terms of Use", TERMS[lang], lang);

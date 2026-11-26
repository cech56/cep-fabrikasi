# Çizim Canlanır

Çocuğun kâğıda çizdiği resim, telefonun kamerasında masanın üstünde canlanır: yürür, zıplar, dans eder, konuşur; video kaydedilip paylaşılabilir.

- `App.tsx`, `src/` — Expo (Android + iOS) uygulaması
- `src/stage.ts` — WebView içindeki sahne: çizimi kesme, kâğıt karakter animasyonu, kamera, video kaydı
- `worker/` — Cloudflare Worker: çizimi Gemini ile tanır (isim, tür, cümleler, uzuv kutuları). Görsel saklanmaz.
- APK: `.github/workflows/cizim.yml` her push'ta derler, Releases'a `cizim-N` olarak koyar.

Gizlilik: hesap yok, kişisel veri yok, her şey telefonda; yapay zekâ tanıma ebeveyn iznine bağlı.

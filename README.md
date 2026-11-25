# Cep Fabrikası

Kod bilmeyen herkesin sesle ya da yazıyla kendi mini uygulamasını yaptığı mobil uygulama.

- `App.tsx`, `src/`: React Native + Expo uygulaması (Android ve iOS)
- `src/runtime.ts`: mini uygulamaların çalıştığı kapalı kutu (ağ ve eval kapalı, sadece `cep.get/set` köprüsü)
- `worker/`: Cloudflare Workers ara sunucusu; AI anahtarı burada gizli durur. Sağlayıcı `worker/wrangler.toml` içindeki `AI_PROVIDER` ile değişir (`gemini` ücretsiz katman, `anthropic` ücretli).
- `.github/workflows/build.yml`: `main`'e her gönderimde sunucuyu yayınlar ve indirilebilir bir APK üretir (Releases sayfası).

## Gerekli GitHub secret'ları

| Ad | Nereden |
| --- | --- |
| `GEMINI_API_KEY` | aistudio.google.com |
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens → "Edit Cloudflare Workers" şablonu |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare panelinin sağ menüsü |

## Yerelde çalıştırma

```bash
npm install
EXPO_PUBLIC_API_URL=https://<worker-adresin> npx expo start
cd worker && npm install && npx wrangler dev
```

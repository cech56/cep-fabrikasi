import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Linking, Share, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { pinShortcut } from "./modules/cep-shortcut";
import { fetchShared, fetchUsage, generateApp, reportApp, shareApp, shareUrl } from "./src/api";
import { CARPIM_HTML } from "./src/samples/carpim";
import { Generating } from "./src/screens/Generating";
import { Home } from "./src/screens/Home";
import { Pro } from "./src/screens/Pro";
import { Runner } from "./src/screens/Runner";
import { deleteApp, loadApps, newId, undoVersion, upsertApp, withNewVersion } from "./src/storage";
import { MiniApp, SharedApp } from "./src/types";

const SAMPLE: MiniApp = {
  id: "ornek-carpim",
  name: "Çarpım Tablosu",
  emoji: "✖️",
  description: "Örnek: doğru cevaba dokun, seriyi büyüt.",
  prompt: "Çarpım tablosu oyunu",
  html: CARPIM_HTML,
  createdAt: 0,
  updatedAt: 0,
  history: [],
};

const REPORT_REASONS = ["Uygunsuz / rahatsız edici", "Zararlı ya da yanıltıcı", "Başkasına ait marka veya içerik"];

// Vitrinden gelen uygulamayı, kaydedilmeden önce önizleme olarak göstermek için MiniApp'e çevirir.
function previewOf(s: SharedApp): MiniApp {
  return {
    id: `pv-${s.id}`,
    name: s.name,
    emoji: s.emoji,
    description: s.description,
    prompt: s.prompt,
    html: s.html,
    createdAt: s.created_at,
    updatedAt: s.created_at,
    history: [],
    sharedId: s.id,
    sharedHtml: s.html,
    parentId: s.id,
  };
}

export default function App() {
  const [apps, setApps] = useState<MiniApp[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [preview, setPreview] = useState<MiniApp | null>(null);
  const [busy, setBusy] = useState<null | "create" | "edit" | "load">(null);
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);
  const [pro, setPro] = useState<{ reason?: string } | null>(null);
  const pendingLocal = useRef<string | null>(null);

  const refreshUsage = useCallback(() => {
    fetchUsage().then((u) => u && setUsage(u));
  }, []);

  const refresh = useCallback(async () => {
    let list = await loadApps();
    if (list.length === 0) {
      await upsertApp(SAMPLE);
      list = [SAMPLE];
    }
    setApps(list);
    if (pendingLocal.current && list.some((a) => a.id === pendingLocal.current)) {
      setOpenId(pendingLocal.current);
      pendingLocal.current = null;
    }
    return list;
  }, []);

  const openShared = useCallback(async (id: string) => {
    setBusy("load");
    try {
      const s = await fetchShared(id);
      setPreview(previewOf(s));
    } catch (e: any) {
      Alert.alert("Açılamadı", e?.message ?? "Bir hata oldu.");
    } finally {
      setBusy(null);
    }
  }, []);

  // cepfabrikasi://shared/<id>  -> vitrindeki uygulamayı aç
  // cepfabrikasi://app/<id>     -> ana ekran kısayolundan kendi uygulamanı aç
  const handleUrl = useCallback(
    (url?: string | null) => {
      const m = url?.match(/^cepfabrikasi:\/\/(shared|app)\/([A-Za-z0-9_-]{2,40})/);
      if (!m) return;
      if (m[1] === "shared") return void openShared(m[2]);
      setPreview(null);
      pendingLocal.current = m[2];
      refresh();
    },
    [openShared, refresh],
  );

  useEffect(() => {
    refresh();
    refreshUsage();
    Linking.getInitialURL().then(handleUrl);
    const sub = Linking.addEventListener("url", (e) => handleUrl(e.url));
    return () => sub.remove();
  }, [refresh, refreshUsage, handleUrl]);

  const open = preview ?? apps.find((a) => a.id === openId) ?? null;

  const failed = (r: { message: string; limit?: boolean }) => {
    if (r.limit) setPro({ reason: r.message });
    else Alert.alert("Olmadı", r.message);
  };

  const create = async (prompt: string) => {
    setBusy("create");
    const r = await generateApp(prompt);
    setBusy(null);
    refreshUsage();
    if (!r.ok) return failed(r);
    const now = Date.now();
    const app: MiniApp = { id: newId(), name: r.name, emoji: r.emoji, description: r.description, prompt, html: r.html, createdAt: now, updatedAt: now, history: [] };
    await upsertApp(app);
    await refresh();
    setOpenId(app.id);
  };

  const edit = async (instruction: string) => {
    if (!open || preview) return;
    setBusy("edit");
    const r = await generateApp(instruction, open.html);
    setBusy(null);
    refreshUsage();
    if (!r.ok) return failed(r);
    await upsertApp(withNewVersion(open, r.html, instruction));
    await refresh();
  };

  const undo = async () => {
    if (!open || preview) return;
    const prev = undoVersion(open);
    if (prev) {
      await upsertApp(prev);
      await refresh();
    }
  };

  const doShare = async (app: MiniApp) => {
    try {
      let id = app.sharedId;
      if (!id || app.sharedHtml !== app.html) {
        const r = await shareApp(app);
        id = r.id;
        if (!preview) {
          await upsertApp({ ...app, sharedId: id, sharedHtml: app.html });
          await refresh();
        }
      }
      await Share.share({ message: `${app.emoji} ${app.name}\nCep Fabrikası'nda yaptım, sen de dene: ${shareUrl(id)}` });
    } catch (e: any) {
      Alert.alert("Paylaşılamadı", e?.message ?? "Bir hata oldu.");
    }
  };

  const share = () => {
    if (!open) return;
    if (preview || (open.sharedId && open.sharedHtml === open.html)) return void doShare(open);
    Alert.alert(
      "Herkese açık paylaşılsın mı?",
      "Uygulaman bir link ile paylaşılır ve Vitrin'de herkes görebilir. İçine kişisel bilgi (isim, telefon, adres) yazmadığından emin ol. Uygulamanın içine girdiğin veriler paylaşılmaz.",
      [
        { text: "Vazgeç", style: "cancel" },
        { text: "Paylaş", onPress: () => doShare(open) },
      ],
    );
  };

  const pin = () => {
    if (!open || preview) return;
    const r = pinShortcut(open.id, open.name, open.emoji);
    if (r === "dynamic")
      Alert.alert(
        "Kısayol hazır 📌",
        `Telefonun doğrudan ana ekrana eklemeye izin vermiyor. Cep Fabrikası simgesine basılı tut, açılan menüde "${open.name}" çıkacak; onu tutup ana ekrana sürükle.`,
      );
    else if (r !== "pinned") Alert.alert("Kısayol eklenemedi", `Teknik bilgi: ${r}`);
  };

  const report = () => {
    const id = open?.parentId;
    if (!id) return;
    Alert.alert("Neden şikayet ediyorsun?", "Yeterince şikayet gelen uygulamalar vitrinden kaldırılır.", [
      ...REPORT_REASONS.map((reason) => ({
        text: reason,
        onPress: async () => {
          try {
            await reportApp(id, reason);
            Alert.alert("Teşekkürler", "Şikayetin bize ulaştı.");
            if (preview) setPreview(null);
          } catch (e: any) {
            Alert.alert("Gönderilemedi", e?.message ?? "Bir hata oldu.");
          }
        },
      })),
      { text: "Vazgeç", style: "cancel" as const },
    ]);
  };

  // Vitrinden gelen uygulamayı kendi fabrikana kopyala; sonra istediğin gibi değiştir (uyarlama).
  const save = async () => {
    if (!preview) return;
    const now = Date.now();
    const app: MiniApp = { ...preview, id: newId(), createdAt: now, updatedAt: now, history: [], sharedId: undefined, sharedHtml: undefined };
    await upsertApp(app);
    setPreview(null);
    await refresh();
    setOpenId(app.id);
    Alert.alert("Eklendi 🎉", "Artık senin. Alttan yazarak ya da konuşarak istediğin gibi değiştirebilirsin.");
  };

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <View style={{ flex: 1 }}>
        {open ? (
          <Runner
            app={open}
            preview={!!preview}
            onBack={() => (preview ? setPreview(null) : setOpenId(null))}
            onEdit={edit}
            onUndo={undo}
            onShare={share}
            onPin={pin}
            onReport={open.parentId ? report : undefined}
            onSave={save}
          />
        ) : (
          <Home
            apps={apps}
            usage={usage}
            onCreate={create}
            onOpen={(a) => setOpenId(a.id)}
            onOpenShared={openShared}
            onPro={() => setPro({})}
            onDelete={async (a) => {
              await deleteApp(a.id);
              await refresh();
            }}
          />
        )}
        {busy && <Generating editing={busy === "edit"} loading={busy === "load"} />}
        <Pro visible={!!pro} reason={pro?.reason} onClose={() => setPro(null)} />
      </View>
    </SafeAreaProvider>
  );
}

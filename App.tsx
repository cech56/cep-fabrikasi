import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Linking, Share, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { pinShortcut } from "./modules/cep-shortcut";
import {
  ImageInput,
  createRoom,
  decodeRoomData,
  fetchRoom,
  fetchShared,
  fetchUsage,
  generateApp,
  inviteUrl,
  likeApp,
  pushRoomHtml,
  reportApp,
  shareApp,
  shareUrl,
} from "./src/api";
import { Lang, getLang, loadLang, setLang, t } from "./src/i18n";
import { cancelAllForApp, onNotificationOpen, setupNotifications } from "./src/notify";
import { CARPIM_HTML } from "./src/samples/carpim";
import { Generating } from "./src/screens/Generating";
import { Home } from "./src/screens/Home";
import { Pro } from "./src/screens/Pro";
import { Profile } from "./src/screens/Profile";
import { Runner } from "./src/screens/Runner";
import {
  deleteApp,
  getAppData,
  getNickname,
  loadApps,
  mergeAppData,
  newId,
  setNickname as saveNickname,
  undoVersion,
  upsertApp,
  withNewVersion,
} from "./src/storage";
import { MiniApp, SharedApp } from "./src/types";

setupNotifications();

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
  category: "egitim",
};

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
    category: s.category,
  };
}

type Busy = null | "create" | "edit" | "load" | "fix";

export default function App() {
  const [apps, setApps] = useState<MiniApp[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [preview, setPreview] = useState<MiniApp | null>(null);
  const [previewLiked, setPreviewLiked] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);
  const [pro, setPro] = useState<{ reason?: string } | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [nickname, setNickname] = useState("");
  const [fresh, setFresh] = useState<Record<string, number>>({});
  const pendingLocal = useRef<string | null>(null);
  const [lang, setLangState] = useState<Lang>(getLang());

  useEffect(() => {
    loadLang().then(setLangState);
  }, []);

  const toggleLang = async () => {
    const next: Lang = getLang() === "tr" ? "en" : "tr";
    await setLang(next);
    setLangState(next);
  };

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
      setPreviewLiked(false);
      setPreview(previewOf(s));
    } catch (e: any) {
      Alert.alert(t("openFail"), e?.message ?? t("somethingWrong"));
    } finally {
      setBusy(null);
    }
  }, []);

  // Davet linkiyle ortak uygulamaya katıl: zaten varsa onu aç, yoksa kopyasını ortak veriyle oluştur.
  const joinRoom = useCallback(
    async (roomId: string) => {
      const existing = (await loadApps()).find((a) => a.roomId === roomId);
      if (existing) {
        setPreview(null);
        setOpenId(existing.id);
        return;
      }
      setBusy("load");
      try {
        const room = await fetchRoom(roomId);
        const now = Date.now();
        const app: MiniApp = {
          id: newId(),
          name: room.name,
          emoji: room.emoji,
          description: room.description,
          prompt: "",
          html: room.html,
          createdAt: now,
          updatedAt: now,
          history: [],
          roomId,
        };
        await mergeAppData(app.id, decodeRoomData(room.data));
        await upsertApp(app);
        await refresh();
        setPreview(null);
        setOpenId(app.id);
        Alert.alert(t("joined"), t("joinedBody"));
      } catch (e: any) {
        Alert.alert(t("openFail"), e?.message ?? t("somethingWrong"));
      } finally {
        setBusy(null);
      }
    },
    [refresh],
  );

  // cepfabrikasi://shared/<id>  -> vitrindeki uygulamayı aç
  // cepfabrikasi://app/<id>     -> ana ekran kısayolundan ya da bildirimden kendi uygulamanı aç
  // cepfabrikasi://join/<id>    -> ortak kullanım davetine katıl
  const handleUrl = useCallback(
    (url?: string | null) => {
      const m = url?.match(/^cepfabrikasi:\/\/(shared|app|join)\/([A-Za-z0-9_-]{2,40})/);
      if (!m) return;
      if (m[1] === "shared") return void openShared(m[2]);
      if (m[1] === "join") return void joinRoom(m[2]);
      setPreview(null);
      pendingLocal.current = m[2];
      refresh();
    },
    [openShared, joinRoom, refresh],
  );

  useEffect(() => {
    refresh();
    refreshUsage();
    getNickname().then(setNickname);
    Linking.getInitialURL().then(handleUrl);
    const sub = Linking.addEventListener("url", (e) => handleUrl(e.url));
    const offNotif = onNotificationOpen(handleUrl);
    return () => {
      sub.remove();
      offNotif();
    };
  }, [refresh, refreshUsage, handleUrl]);

  const open = preview ?? apps.find((a) => a.id === openId) ?? null;

  const failed = (r: { message: string; limit?: boolean }) => {
    if (r.limit) setPro({ reason: r.message });
    else Alert.alert(t("failed"), r.message);
  };

  const create = async (prompt: string, image?: ImageInput) => {
    setBusy("create");
    const r = await generateApp(prompt, undefined, image);
    setBusy(null);
    refreshUsage();
    if (!r.ok) return failed(r);
    const now = Date.now();
    const app: MiniApp = {
      id: newId(),
      name: r.name,
      emoji: r.emoji,
      description: r.description,
      prompt,
      html: r.html,
      createdAt: now,
      updatedAt: now,
      history: [],
      category: r.category,
    };
    await upsertApp(app);
    await refresh();
    setFresh((f) => ({ ...f, [app.id]: now }));
    setOpenId(app.id);
  };

  const edit = async (instruction: string, auto?: boolean) => {
    if (!open || preview) return;
    const target = open;
    setBusy(auto ? "fix" : "edit");
    const r = await generateApp(instruction, target.html);
    setBusy(null);
    refreshUsage();
    if (!r.ok) return auto ? undefined : failed(r);
    const next = withNewVersion(target, r.html, instruction);
    await upsertApp(next);
    await refresh();
    if (!auto) setFresh((f) => ({ ...f, [target.id]: Date.now() }));
    if (target.roomId) pushRoomHtml(target.roomId, r.html).catch(() => {});
  };

  const undo = async () => {
    if (!open || preview) return;
    const prev = undoVersion(open);
    if (prev) {
      await upsertApp(prev);
      await refresh();
      if (prev.roomId) pushRoomHtml(prev.roomId, prev.html).catch(() => {});
    }
  };

  // Ortak uygulamayı başka biri değiştirdi: yeni hali buraya da gelsin (geri alınabilir)
  const remoteHtml = async (html: string) => {
    const target = (await loadApps()).find((a) => a.id === openId);
    if (!target || target.html === html) return;
    await upsertApp(withNewVersion(target, html, "ortak güncelleme"));
    await refresh();
  };

  const doShare = async (app: MiniApp) => {
    try {
      let id = app.sharedId;
      if (!id || app.sharedHtml !== app.html) {
        const r = await shareApp(app, nickname);
        id = r.id;
        if (!preview) {
          await upsertApp({ ...app, sharedId: id, sharedHtml: app.html });
          await refresh();
        }
      }
      await Share.share({ message: t("shareMsg", { emoji: app.emoji, name: app.name, url: shareUrl(id) }) });
    } catch (e: any) {
      Alert.alert(t("shareFail"), e?.message ?? t("somethingWrong"));
    }
  };

  const share = () => {
    if (!open) return;
    if (preview || (open.sharedId && open.sharedHtml === open.html)) return void doShare(open);
    Alert.alert(t("shareAskTitle"), t("shareAskBody"), [
      { text: t("cancel"), style: "cancel" },
      { text: t("shareBtn"), onPress: () => doShare(open) },
    ]);
  };

  const invite = (app: MiniApp, roomId: string) =>
    Share.share({ message: t("inviteMsg", { emoji: app.emoji, name: app.name, url: inviteUrl(roomId) }) }).catch(() => {});

  const together = () => {
    if (!open || preview) return;
    if (open.roomId) return void invite(open, open.roomId);
    const target = open;
    Alert.alert(t("togetherAskTitle"), t("togetherAskBody"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("togetherBtn"),
        onPress: async () => {
          try {
            const room = await createRoom(target, await getAppData(target.id));
            await upsertApp({ ...target, roomId: room.id, roomSince: room.now });
            await refresh();
            invite(target, room.id);
          } catch (e: any) {
            Alert.alert(t("failed"), e?.message ?? t("somethingWrong"));
          }
        },
      },
    ]);
  };

  const pin = () => {
    if (!open || preview) return;
    const r = pinShortcut(open.id, open.name, open.emoji);
    if (r === "dynamic") Alert.alert(t("pinDynamicTitle"), t("pinDynamicBody", { name: open.name }));
    else if (r !== "pinned") Alert.alert(t("pinFail"), r);
  };

  const like = async () => {
    const id = preview?.parentId;
    if (!id) return;
    setPreviewLiked((v) => !v);
    try {
      setPreviewLiked((await likeApp(id)).liked);
    } catch {
      setPreviewLiked((v) => !v);
    }
  };

  const report = () => {
    const id = open?.parentId;
    if (!id) return;
    Alert.alert(t("reportTitle"), t("reportBody"), [
      ...t("reportReasons")
        .split("|")
        .map((reason) => ({
          text: reason,
          onPress: async () => {
            try {
              await reportApp(id, reason);
              Alert.alert(t("thanks"), t("reportThanks"));
              if (preview) setPreview(null);
            } catch (e: any) {
              Alert.alert(t("reportFail"), e?.message ?? t("somethingWrong"));
            }
          },
        })),
      { text: t("cancel"), style: "cancel" as const },
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
    Alert.alert(t("added"), t("addedBody"));
  };

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <View style={{ flex: 1 }} key={lang}>
        {open ? (
          <Runner
            app={open}
            preview={!!preview}
            fresh={preview ? undefined : fresh[open.id]}
            liked={previewLiked}
            onBack={() => (preview ? setPreview(null) : setOpenId(null))}
            onEdit={edit}
            onUndo={undo}
            onShare={share}
            onPin={pin}
            onTogether={together}
            onRemoteHtml={remoteHtml}
            onReport={open.parentId ? report : undefined}
            onLike={preview ? like : undefined}
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
            onProfile={() => setProfileOpen(true)}
            onToggleLang={toggleLang}
            onDelete={async (a) => {
              await cancelAllForApp(a.id);
              await deleteApp(a.id);
              await refresh();
            }}
          />
        )}
        {busy && <Generating mode={busy} />}
        <Pro visible={!!pro} reason={pro?.reason} onClose={() => setPro(null)} />
        <Profile
          visible={profileOpen}
          nickname={nickname}
          onClose={() => setProfileOpen(false)}
          onSave={(n) => {
            setNickname(n);
            saveNickname(n);
          }}
        />
      </View>
    </SafeAreaProvider>
  );
}

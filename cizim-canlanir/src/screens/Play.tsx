import * as Haptics from "expo-haptics";
import { Asset, requestPermissionsAsync } from "expo-media-library";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as Speech from "expo-speech";
import { useEffect, useRef, useState } from "react";
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { analyzeDrawing, DEFAULT_LINES, fetchStory, fetchVoice, offlineAnalysis, offlineStory } from "../api";
import { ParentGate } from "../components/ParentGate";
import { Stage, StageHandle } from "../components/Stage";
import { addChar, newId, pngDataUrl, pngUri, updateChar } from "../storage";
import { C } from "../theme";
import { Character, Settings, StageChar } from "../types";

type Props = {
  initial: Character[]; // sahnede olacak karakterler
  photo?: string; // yeni çizimin fotoğrafı (data URL): önce taranır, sonra canlanır
  settings: Settings;
  allChars: Character[];
  onCreated: (c: Character) => void;
  onUpdate: (c: Character) => void;
  onDelete: (c: Character) => void;
  onRetry: () => void;
  onBack: () => void;
};

const SCENES = [
  { id: "camera", e: "📷", t: "Kamera" },
  { id: "masa", e: "🪵", t: "Masa" },
  { id: "sinif", e: "🏫", t: "Sınıf" },
  { id: "park", e: "🌳", t: "Park" },
  { id: "sahil", e: "🏖️", t: "Sahil" },
  { id: "uzay", e: "🚀", t: "Uzay" },
  { id: "kar", e: "⛄", t: "Karlı orman" },
];

const ACCS = [
  { id: "sapka", e: "🥳", t: "Şapka" },
  { id: "tac", e: "👑", t: "Taç" },
  { id: "gozluk", e: "🕶️", t: "Gözlük" },
  { id: "papyon", e: "🎀", t: "Papyon" },
  { id: "pelerin", e: "🦸", t: "Pelerin" },
  { id: "balon", e: "🎈", t: "Balon" },
];
const GAMES = [
  { id: "stars", e: "⭐", t: "Yıldız yakala", d: "Yere dokun, karakterin koşsun, düşen yıldızları topla!" },
  { id: "hide", e: "🙈", t: "Saklambaç", d: "Karakterin saklanır, nerede olduğunu bul!" },
  { id: "race", e: "🏁", t: "Yarış", d: "Karakterler yarışır, dokunarak tuttuğunu hızlandır! (2 karakter gerekir)" },
];

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const REC_MS = 10_000;
const REC_STORY_MS = 90_000;

async function toStage(c: Character): Promise<StageChar> {
  return { id: c.id, png: await pngDataUrl(c.id), walkStyle: c.walkStyle, parts: c.parts, acc: c.acc ?? [] };
}

export function Play({ initial, photo, settings, allChars, onCreated, onUpdate, onDelete, onRetry, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const stage = useRef<StageHandle>(null);
  const [onStage, setOnStage] = useState<Character[]>(initial);
  const [scanning, setScanning] = useState(!!photo);
  const [banner, setBanner] = useState<string | null>(null);
  // kesim ekranı: otomatik seçim + parmakla özel kesim
  const [editing, setEditing] = useState<null | { ok: boolean; lasso: boolean; exact: boolean }>(photo ? { ok: false, lasso: false, exact: false } : null);
  const [rec, setRec] = useState<null | number>(null); // kayıt başlangıcı
  const [, tick] = useState(0);
  const [video, setVideo] = useState<{ uri: string; mime: string } | null>(null);
  const [gate, setGate] = useState<null | { reason: string; then: () => void }>(null);
  const [friends, setFriends] = useState(false);
  const [scenes, setScenes] = useState(false);
  const [scene, setScene] = useState("camera");
  const [dress, setDress] = useState(false);
  const [dressId, setDressId] = useState<string | null>(null);
  const [games, setGames] = useState(false);
  const [game, setGame] = useState<string | null>(null);
  const [story, setStory] = useState<null | { title: string; text: string; loading?: boolean }>(null);
  const storyRun = useRef(0);
  const recRef = useRef(false);
  const tokens = useRef(new Map<number, () => void>());
  const tokenSeq = useRef(0);
  const chunks = useRef<string[]>([]);
  const castRef = useRef(onStage);
  castRef.current = onStage;

  const send = (cmd: Record<string, unknown>) => stage.current?.send(cmd);
  const focus = () => castRef.current[castRef.current.length - 1];

  useEffect(
    () => () => {
      storyRun.current++;
      void Speech.stop();
    },
    [],
  );
  useEffect(() => {
    if (rec == null) return;
    const t = setInterval(() => tick((x) => x + 1), 250);
    return () => clearInterval(t);
  }, [rec]);
  useEffect(() => {
    if (!banner || scanning) return;
    const t = setTimeout(() => setBanner(null), 3500);
    return () => clearTimeout(t);
  }, [banner, scanning]);

  // Sahnede ses çal (videoya girer) ve bitince devam et
  const stageAudio = (cmd: Record<string, unknown>) =>
    new Promise<void>((res) => {
      const token = ++tokenSeq.current;
      tokens.current.set(token, res);
      send({ ...cmd, token });
      setTimeout(() => {
        if (tokens.current.delete(token)) res();
      }, 25_000);
    });

  // Konuşma: normalde telefonun Türkçe sesi; video kaydı sırasında ses videoya da girsin diye sahnede çalınır
  const voice = async (text: string, o: { id?: string; pitch?: number; narrator?: boolean }) => {
    const pitch = o.pitch ?? 1.1;
    if (recRef.current) {
      const audio = settings.aiConsent ? await fetchVoice(text, o.narrator ? "Kore" : pitch > 1.35 ? "Leda" : "Puck") : null;
      if (audio) return stageAudio({ type: "playAudio", data: audio, rate: o.narrator ? 1 : Math.max(0.95, Math.min(1.25, pitch * 0.85)), id: o.id });
      return stageAudio({ type: "babble", text, pitch, id: o.id });
    }
    return new Promise<void>((res) => {
      Speech.speak(text, { language: "tr-TR", pitch: o.narrator ? 1.0 : pitch, rate: o.narrator ? 0.92 : 1.0, onDone: () => res(), onStopped: () => res(), onError: () => res() });
    });
  };

  const speak = (c: Character, text?: string) => {
    const lines = c.lines.length ? c.lines : DEFAULT_LINES;
    const say = text ?? lines[Math.floor(Math.random() * lines.length)];
    Speech.stop();
    send({ type: "say", id: c.id, text: say, ms: 1400 + say.length * 75 });
    return voice(say, { id: c.id, pitch: c.pitch });
  };

  const born = async (r: { png: string; jpeg: string; w: number; h: number }) => {
    const [a] = await Promise.all([settings.aiConsent ? analyzeDrawing(r.jpeg) : Promise.resolve(null), wait(2400)]);
    const info = a ?? offlineAnalysis();
    const c: Character = {
      id: newId(),
      ...info,
      greeting: info.greeting || `Merhaba! Ben ${info.name}!`,
      w: r.w,
      h: r.h,
      createdAt: Date.now(),
      ai: !!a,
    };
    try {
      await addChar(c, r.png);
    } catch {}
    onCreated(c);
    setOnStage((l) => [...l, c]);
    send({ type: "scanDone" });
    send({ type: "add", birth: true, char: { id: c.id, png: r.png, walkStyle: c.walkStyle, parts: c.parts } });
    setScanning(false);
    setBanner(`${c.emoji} ${c.name} canlandı!`);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setTimeout(() => speak(c, c.greeting), 1800);
  };

  const finishVideo = async (mime: string) => {
    const ext = mime.includes("mp4") ? "mp4" : "webm";
    const f = new File(Paths.cache, `cizim-canlanir-${Date.now()}.${ext}`);
    try {
      f.create();
      await f.write(chunks.current.join(""), { encoding: "base64" });
      setVideo({ uri: f.uri, mime });
    } catch {
      Alert.alert("Video kaydedilemedi", "Telefonda yer kalmamış olabilir.");
    }
    chunks.current = [];
  };

  const onMessage = async (m: any) => {
    switch (m.type) {
      case "ready": {
        send({ type: "scene", name: scene });
        for (const c of initial) send({ type: "add", char: await toStage(c) });
        if (photo) send({ type: "scan", src: photo });
        if (!photo && initial.length === 1) setTimeout(() => speak(initial[0], initial[0].greeting), 1200);
        break;
      }
      case "audioDone": {
        const r = tokens.current.get(m.token);
        if (r) {
          tokens.current.delete(m.token);
          r();
        }
        break;
      }
      case "gameStarted":
        setGame(m.name);
        break;
      case "found": {
        const c = castRef.current.find((x) => x.id === m.id);
        if (c) speak(c, "Buldun beni! Hi hi!");
        break;
      }
      case "game": {
        setGame(null);
        if (m.error === "needTwo") {
          Alert.alert("Yarış için 2 karakter lazım", "Önce 🧸 Arkadaş tuşuyla bir karakter daha ekle.");
          break;
        }
        const f = focus();
        if (!f) break;
        if (m.name === "stars") speak(f, m.score > 0 ? `Yaşasın! ${m.score} yıldız topladık!` : "Hadi bir daha oynayalım!");
        if (m.name === "hide") speak(f, "Hepimizi buldun! Sen bir dedektifsin!");
        if (m.name === "race") {
          const w = castRef.current.find((x) => x.id === m.winner) ?? f;
          setBanner(`🏆 ${w.name} kazandı!`);
          speak(w, "Kazandım! Ama hepimiz çok hızlıydık!");
        }
        break;
      }
      case "edit":
        setEditing({ ok: !!m.ok, lasso: !!m.lasso, exact: !!m.exact });
        break;
      case "cutout": {
        if (m.result?.ok) return born(m.result);
        setScanning(false);
        setBanner(null);
        Alert.alert("Çizimi bulamadım 🙈", "Resim beyaz kâğıtta, koyu kalemle çizilmiş ve kenarları kapalı olsun. Telefonu çizimin tam üstünde tut, yakından çek.", [
          { text: "Ana sayfa", style: "cancel", onPress: onBack },
          { text: "Tekrar çek", onPress: onRetry },
        ]);
        break;
      }
      case "tap": {
        const c = castRef.current.find((x) => x.id === m.id);
        if (c) speak(c);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        break;
      }
      case "rec":
        if (m.started) {
          setRec(Date.now());
          recRef.current = true;
        }
        if (m.stopped) {
          setRec(null);
          recRef.current = false;
        }
        if (m.error) {
          setRec(null);
          recRef.current = false;
          Alert.alert("Video kaydı bu telefonda desteklenmiyor");
        }
        break;
      case "recChunk":
        chunks.current[m.i] = m.data;
        if (chunks.current.filter(Boolean).length === m.n) finishVideo(m.mime);
        break;
    }
  };

  const act = (action: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    send({ type: "action", action });
  };

  const toggleRec = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (rec != null) send({ type: "record", on: false });
    else {
      chunks.current = [];
      send({ type: "record", on: true, maxMs: story ? REC_STORY_MS : REC_MS });
    }
  };

  const saveVideo = () => {
    if (!video) return;
    const v = video;
    setGate({
      reason: "Videoyu telefonun galerisine kaydetmek için",
      then: async () => {
        try {
          const p = await requestPermissionsAsync(true);
          if (!p.granted) {
            Alert.alert("İzin gerekli", "Videoyu kaydetmek için galeri izni ver.");
            return;
          }
          await Asset.create(v.uri);
          Alert.alert("Kaydedildi 🎉", "Video galeride.");
        } catch {
          Alert.alert("Kaydedilemedi", "Paylaş menüsünden kaydetmeyi dene.");
        }
      },
    });
  };

  const runStory = async () => {
    const cast = castRef.current;
    if (!cast.length) return;
    const run = ++storyRun.current;
    setStory({ title: "", text: "Masal yazılıyor… ✍️", loading: true });
    const st = (settings.aiConsent ? await fetchStory(cast) : null) ?? offlineStory(cast);
    if (run !== storyRun.current) return;
    send({ type: "story", on: true });
    setStory({ title: st.title, text: st.title });
    await voice(st.title, { narrator: true });
    for (const b of st.beats) {
      if (run !== storyRun.current) return;
      if (b.scene) {
        send({ type: "scene", name: b.scene });
        setScene(b.scene);
      }
      setStory({ title: st.title, text: b.text });
      b.actions.forEach((a, i) => {
        const c = cast[a.who];
        if (c) setTimeout(() => send({ type: "action", id: c.id, action: a.action }), 300 + i * 250);
      });
      await voice(b.text, { narrator: true });
      await wait(700);
    }
    if (run !== storyRun.current) return;
    send({ type: "story", on: false });
    setStory({ title: st.title, text: "Bitti! 🌙" });
    setTimeout(() => {
      if (run === storyRun.current) setStory(null);
    }, 2500);
  };

  const stopStory = () => {
    storyRun.current++;
    Speech.stop();
    send({ type: "story", on: false });
    setStory(null);
  };

  const toggleAcc = (c: Character, id: string) => {
    const acc = c.acc ?? [];
    const next = acc.includes(id) ? acc.filter((x) => x !== id) : [...acc, id];
    const nc = { ...c, acc: next };
    setOnStage((l) => l.map((x) => (x.id === c.id ? nc : x)));
    updateChar(c.id, { acc: next });
    onUpdate(nc);
    send({ type: "dress", id: c.id, acc: next });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const share = () => {
    if (!video) return;
    const v = video;
    setGate({
      reason: "Videoyu paylaşmak ya da telefona kaydetmek için",
      then: async () => {
        try {
          await Sharing.shareAsync(v.uri, { mimeType: v.mime, dialogTitle: "Çizim Canlanır videosu" });
        } catch {}
      },
    });
  };

  const addFriend = async (c: Character) => {
    setFriends(false);
    if (onStage.some((x) => x.id === c.id)) return;
    setOnStage((l) => [...l.slice(-3), c]);
    send({ type: "add", birth: true, char: await toStage(c) });
    setTimeout(() => speak(c, "Ben de geldim!"), 1800);
  };

  const confirmCut = () => {
    if (!editing?.ok) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setEditing(null);
    setBanner("Çizimin canlanıyor… ✨");
    send({ type: "editDone" });
  };

  const single = onStage.length === 1 ? onStage[0] : null;
  const left = rec != null ? Math.max(0, Math.ceil(((story ? REC_STORY_MS : REC_MS) - (Date.now() - rec)) / 1000)) : 0;
  const others = allChars.filter((c) => !onStage.some((x) => x.id === c.id));

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stage ref={stage} onMessage={onMessage} />

      <View style={[s.top, { top: insets.top + 8 }]} pointerEvents="box-none">
        <Pressable style={s.round} onPress={onBack} hitSlop={8}>
          <Text style={s.roundT}>‹</Text>
        </Pressable>
        {single && !scanning && (
          <View style={s.chip}>
            <Text style={s.chipT} numberOfLines={1}>
              {single.emoji} {single.name}
            </Text>
          </View>
        )}
        {single && !scanning ? (
          <Pressable style={s.round} hitSlop={8} onPress={() => setGate({ reason: `${single.name} silinecek`, then: () => onDelete(single) })}>
            <Text style={{ fontSize: 18 }}>🗑️</Text>
          </Pressable>
        ) : (
          <View style={{ width: 46 }} />
        )}
      </View>

      {editing && (
        <>
          <View style={[s.editTop, { top: insets.top + 64 }]} pointerEvents="none">
            <Text style={s.editTitle}>{editing.ok ? "Çizimin doğru seçildi mi?" : "Çizimi bulamadım"}</Text>
            <Text style={s.editSub}>
              {editing.lasso ? "Yeniden çizmek için parmağınla tekrar etrafını çiz." : "Değilse parmağınla çizimin etrafını çiz, ben oradan keseyim."}
            </Text>
          </View>
          <View style={[s.bottom, { paddingBottom: insets.bottom + 14, paddingHorizontal: 16 }]}>
            {editing.lasso && (
              <View style={s.modeRow}>
                <Pressable style={[s.mode, !editing.exact && s.modeOn]} onPress={() => send({ type: "editMode", exact: false })}>
                  <Text style={[s.modeT, !editing.exact && s.modeTOn]}>✨ Akıllı kes</Text>
                </Pressable>
                <Pressable style={[s.mode, editing.exact && s.modeOn]} onPress={() => send({ type: "editMode", exact: true })}>
                  <Text style={[s.modeT, editing.exact && s.modeTOn]}>✂️ Çizdiğim yerden</Text>
                </Pressable>
                <Pressable style={s.mode} onPress={() => send({ type: "editReset" })}>
                  <Text style={s.modeT}>↺</Text>
                </Pressable>
              </View>
            )}
            <View style={s.editRow}>
              <Pressable style={s.editGhost} onPress={onRetry}>
                <Text style={s.editGhostT}>📸 Tekrar çek</Text>
              </Pressable>
              <Pressable style={[s.editOk, !editing.ok && { opacity: 0.4 }]} onPress={confirmCut} disabled={!editing.ok}>
                <Text style={s.editOkT}>Canlandır ✨</Text>
              </Pressable>
            </View>
          </View>
        </>
      )}

      {banner && (
        <View style={[s.banner, { top: insets.top + 66 }]} pointerEvents="none">
          <Text style={s.bannerT}>{banner}</Text>
        </View>
      )}

      {!scanning && !editing && (
        <View style={[s.bottom, { paddingBottom: insets.bottom + 12 }]} pointerEvents="box-none">
          <View style={s.recRow} pointerEvents="box-none">
            {video && rec == null ? (
              <Pressable style={s.share} onPress={saveVideo}>
                <Text style={s.shareT}>💾 Kaydet</Text>
              </Pressable>
            ) : null}
            <Pressable style={[s.rec, rec != null && s.recOn]} onPress={toggleRec}>
              {rec != null ? <Text style={s.recT}>{left}</Text> : <View style={s.recDot} />}
            </Pressable>
            {video && rec == null ? (
              <Pressable style={s.share} onPress={share}>
                <Text style={s.shareT}>📤 Paylaş</Text>
              </Pressable>
            ) : null}
          </View>
          {story ? (
            <View style={s.storyBox}>
              {!!story.title && <Text style={s.storyTitle}>📖 {story.title}</Text>}
              <Text style={s.storyText}>{story.text}</Text>
              <Pressable style={s.storyStop} onPress={stopStory}>
                <Text style={s.storyStopT}>Masalı bitir</Text>
              </Pressable>
            </View>
          ) : game ? (
            <View style={{ alignItems: "center" }}>
              <Pressable style={s.storyStop} onPress={() => send({ type: "game" })}>
                <Text style={s.storyStopT}>Oyunu bitir</Text>
              </Pressable>
            </View>
          ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.actions}>
            <Btn e="📖" t="Masal" onPress={runStory} />
            <Btn e="🎮" t="Oyun" onPress={() => setGames(true)} />
            <Btn e="👑" t="Giydir" onPress={() => { setDressId(focus()?.id ?? null); setDress(true); }} />
            <Btn e="🏞️" t="Yer" onPress={() => setScenes(true)} />
            <Btn e="🚶" t="Yürü" onPress={() => act("walk")} />
            <Btn e="🦘" t="Zıpla" onPress={() => act("jump")} />
            <Btn e="💃" t="Dans" onPress={() => act("dance")} />
            <Btn e="🌀" t="Dön" onPress={() => act("spin")} />
            <Btn e="💬" t="Konuş" onPress={() => focus() && speak(focus())} />
            <Btn e="👋" t="Selam" onPress={() => act("wave")} />
            <Btn e="😴" t="Uyu" onPress={() => act("sleep")} />
            <Btn e="➕" t="Büyüt" onPress={() => send({ type: "scale", f: 1.15 })} />
            <Btn e="➖" t="Küçült" onPress={() => send({ type: "scale", f: 0.87 })} />
            {others.length > 0 && <Btn e="🧸" t="Arkadaş" onPress={() => setFriends(true)} />}
          </ScrollView>
          )}
          <Text style={s.hint}>Karaktere dokun: zıplar ve konuşur · Yere dokun: oraya yürür · Sürükle: kucağına al</Text>
        </View>
      )}

      <Modal visible={friends} transparent animationType="slide" onRequestClose={() => setFriends(false)}>
        <Pressable style={s.sheetBack} onPress={() => setFriends(false)}>
          <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={s.sheetT}>Kim gelsin?</Text>
            <ScrollView horizontal contentContainerStyle={{ gap: 12 }}>
              {others.map((c) => (
                <Pressable key={c.id} style={s.friend} onPress={() => addFriend(c)}>
                  <Image source={{ uri: pngUri(c.id) }} style={{ width: 90, height: 90 }} resizeMode="contain" />
                  <Text style={s.friendT} numberOfLines={1}>
                    {c.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={scenes} transparent animationType="slide" onRequestClose={() => setScenes(false)}>
        <Pressable style={s.sheetBack} onPress={() => setScenes(false)}>
          <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={s.sheetT}>Nerede oynasın?</Text>
            <View style={s.sceneGrid}>
              {SCENES.map((sc) => (
                <Pressable
                  key={sc.id}
                  style={[s.scene, scene === sc.id && s.sceneOn]}
                  onPress={() => {
                    setScene(sc.id);
                    setScenes(false);
                    send({ type: "scene", name: sc.id });
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  }}
                >
                  <Text style={{ fontSize: 34 }}>{sc.e}</Text>
                  <Text style={[s.sceneT, scene === sc.id && { color: C.dark }]}>{sc.t}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={dress} transparent animationType="slide" onRequestClose={() => setDress(false)}>
        <Pressable style={s.sheetBack} onPress={() => setDress(false)}>
          <Pressable style={[s.sheet, { paddingBottom: insets.bottom + 16 }]} onPress={() => {}}>
            <Text style={s.sheetT}>Ne giysin?</Text>
            {onStage.length > 1 && (
              <ScrollView horizontal contentContainerStyle={{ gap: 8, marginBottom: 12 }}>
                {onStage.map((c) => (
                  <Pressable key={c.id} onPress={() => setDressId(c.id)} style={[s.who, dressId === c.id && s.sceneOn]}>
                    <Image source={{ uri: pngUri(c.id) }} style={{ width: 44, height: 44 }} resizeMode="contain" />
                  </Pressable>
                ))}
              </ScrollView>
            )}
            <View style={s.sceneGrid}>
              {ACCS.map((a) => {
                const c = onStage.find((x) => x.id === dressId) ?? onStage[onStage.length - 1];
                const on = !!c?.acc?.includes(a.id);
                return (
                  <Pressable key={a.id} style={[s.scene, on && s.sceneOn]} onPress={() => c && toggleAcc(c, a.id)}>
                    <Text style={{ fontSize: 34 }}>{a.e}</Text>
                    <Text style={[s.sceneT, on && { color: C.dark }]}>{a.t}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={games} transparent animationType="slide" onRequestClose={() => setGames(false)}>
        <Pressable style={s.sheetBack} onPress={() => setGames(false)}>
          <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={s.sheetT}>Hangi oyun?</Text>
            {GAMES.map((g) => (
              <Pressable
                key={g.id}
                style={s.gameRow}
                onPress={() => {
                  setGames(false);
                  if (g.id === "stars" && scene === "camera") {
                    send({ type: "scene", name: "park" });
                    setScene("park");
                  }
                  send({ type: "game", name: g.id });
                }}
              >
                <Text style={{ fontSize: 34 }}>{g.e}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.gameT}>{g.t}</Text>
                  <Text style={s.gameD}>{g.d}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <ParentGate
        visible={!!gate}
        reason={gate?.reason ?? ""}
        onCancel={() => setGate(null)}
        onPass={() => {
          const g = gate;
          setGate(null);
          g?.then();
        }}
      />
    </View>
  );
}

function Btn({ e, t, onPress }: { e: string; t: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [s.btn, pressed && { transform: [{ scale: 0.92 }] }]} onPress={onPress}>
      <Text style={s.btnE}>{e}</Text>
      <Text style={s.btnT}>{t}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  top: { position: "absolute", left: 14, right: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  round: { width: 46, height: 46, borderRadius: 23, backgroundColor: "rgba(27,21,48,0.7)", alignItems: "center", justifyContent: "center" },
  roundT: { color: "#fff", fontSize: 30, marginTop: -3 },
  chip: { backgroundColor: "rgba(27,21,48,0.7)", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, maxWidth: "60%" },
  chipT: { color: "#fff", fontWeight: "800", fontSize: 16 },
  banner: { position: "absolute", alignSelf: "center", backgroundColor: C.yellow, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24, elevation: 6 },
  bannerT: { color: C.dark, fontWeight: "900", fontSize: 18 },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0 },
  recRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", marginBottom: 12, gap: 14 },
  rec: { width: 70, height: 70, borderRadius: 35, borderWidth: 5, borderColor: "#fff", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.25)" },
  recOn: { backgroundColor: C.red },
  recDot: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.red },
  recT: { color: "#fff", fontSize: 26, fontWeight: "900" },
  share: { backgroundColor: C.yellow, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20 },
  shareT: { color: C.dark, fontWeight: "800" },
  actions: { paddingHorizontal: 12, gap: 10 },
  btn: { width: 72, height: 78, borderRadius: 22, backgroundColor: "rgba(27,21,48,0.78)", alignItems: "center", justifyContent: "center" },
  btnE: { fontSize: 30 },
  btnT: { color: "#fff", fontSize: 12, fontWeight: "700", marginTop: 2 },
  hint: { color: "rgba(255,255,255,0.75)", fontSize: 11, textAlign: "center", marginTop: 8, paddingHorizontal: 16 },
  editTop: { position: "absolute", left: 20, right: 20, alignItems: "center" },
  editTitle: { color: "#fff", fontSize: 20, fontWeight: "900", textAlign: "center" },
  editSub: { color: C.muted, fontSize: 14, textAlign: "center", marginTop: 4 },
  modeRow: { flexDirection: "row", gap: 8, justifyContent: "center", marginBottom: 12 },
  mode: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, backgroundColor: C.card },
  modeOn: { backgroundColor: C.purple },
  modeT: { color: "#fff", fontWeight: "700" },
  modeTOn: { color: C.dark },
  editRow: { flexDirection: "row", gap: 10 },
  editGhost: { flex: 1, padding: 16, borderRadius: 18, backgroundColor: C.card, alignItems: "center" },
  editGhostT: { color: "#fff", fontWeight: "800", fontSize: 16 },
  editOk: { flex: 1.4, padding: 16, borderRadius: 18, backgroundColor: C.yellow, alignItems: "center" },
  editOkT: { color: C.dark, fontWeight: "900", fontSize: 17 },
  who: { padding: 6, borderRadius: 14, backgroundColor: C.card2 },
  gameRow: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: C.card2, borderRadius: 18, padding: 14, marginBottom: 10 },
  gameT: { color: "#fff", fontSize: 17, fontWeight: "800" },
  gameD: { color: C.muted, fontSize: 13, marginTop: 2 },
  storyBox: { marginHorizontal: 14, backgroundColor: "rgba(27,21,48,0.85)", borderRadius: 22, padding: 16 },
  storyTitle: { color: C.yellow, fontWeight: "900", fontSize: 15, marginBottom: 6 },
  storyText: { color: "#fff", fontSize: 18, lineHeight: 25, fontWeight: "600" },
  storyStop: { alignSelf: "center", marginTop: 12, backgroundColor: C.card2, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 16 },
  storyStopT: { color: "#fff", fontWeight: "800" },
  sceneGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  scene: { width: "30%", flexGrow: 1, backgroundColor: C.card2, borderRadius: 18, paddingVertical: 14, alignItems: "center" },
  sceneOn: { backgroundColor: C.yellow },
  sceneT: { color: "#fff", fontWeight: "800", marginTop: 4 },
  sheetBack: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 18 },
  sheetT: { color: "#fff", fontSize: 20, fontWeight: "800", marginBottom: 12 },
  friend: { backgroundColor: C.card2, borderRadius: 18, padding: 10, alignItems: "center", width: 110 },
  friendT: { color: "#fff", fontWeight: "700", marginTop: 4 },
});

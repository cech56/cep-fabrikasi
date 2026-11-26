import * as Haptics from "expo-haptics";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as Speech from "expo-speech";
import { useEffect, useRef, useState } from "react";
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { analyzeDrawing, DEFAULT_LINES, offlineAnalysis } from "../api";
import { ParentGate } from "../components/ParentGate";
import { Stage, StageHandle } from "../components/Stage";
import { addChar, newId, pngDataUrl, pngUri } from "../storage";
import { C } from "../theme";
import { Character, Settings, StageChar } from "../types";

type Props = {
  initial: Character[]; // sahnede olacak karakterler
  photo?: string; // yeni çizimin fotoğrafı (data URL): önce taranır, sonra canlanır
  settings: Settings;
  allChars: Character[];
  onCreated: (c: Character) => void;
  onDelete: (c: Character) => void;
  onRetry: () => void;
  onBack: () => void;
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const REC_MS = 10_000;

async function toStage(c: Character): Promise<StageChar> {
  return { id: c.id, png: await pngDataUrl(c.id), walkStyle: c.walkStyle, parts: c.parts };
}

export function Play({ initial, photo, settings, allChars, onCreated, onDelete, onRetry, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const stage = useRef<StageHandle>(null);
  const [onStage, setOnStage] = useState<Character[]>(initial);
  const [scanning, setScanning] = useState(!!photo);
  const [banner, setBanner] = useState<string | null>(photo ? "Çizimin taranıyor… ✨" : null);
  const [rec, setRec] = useState<null | number>(null); // kayıt başlangıcı
  const [, tick] = useState(0);
  const [video, setVideo] = useState<{ uri: string; mime: string } | null>(null);
  const [gate, setGate] = useState<null | { reason: string; then: () => void }>(null);
  const [friends, setFriends] = useState(false);
  const chunks = useRef<string[]>([]);
  const castRef = useRef(onStage);
  castRef.current = onStage;

  const send = (cmd: Record<string, unknown>) => stage.current?.send(cmd);
  const focus = () => castRef.current[castRef.current.length - 1];

  useEffect(() => () => void Speech.stop(), []);
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

  const speak = (c: Character, text?: string) => {
    const lines = c.lines.length ? c.lines : DEFAULT_LINES;
    const say = text ?? lines[Math.floor(Math.random() * lines.length)];
    Speech.stop();
    Speech.speak(say, { language: "tr-TR", pitch: c.pitch, rate: 1.0 });
    send({ type: "say", id: c.id, text: say, ms: 1400 + say.length * 75 });
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
        send({ type: "camera", on: true });
        for (const c of initial) send({ type: "add", char: await toStage(c) });
        if (photo) send({ type: "scan", src: photo });
        if (!photo && initial.length === 1) setTimeout(() => speak(initial[0], initial[0].greeting), 1200);
        break;
      }
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
        if (m.started) setRec(Date.now());
        if (m.stopped) setRec(null);
        if (m.error) {
          setRec(null);
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
      send({ type: "record", on: true, maxMs: REC_MS });
    }
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

  const single = onStage.length === 1 ? onStage[0] : null;
  const left = rec != null ? Math.max(0, Math.ceil((REC_MS - (Date.now() - rec)) / 1000)) : 0;
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

      {banner && (
        <View style={[s.banner, { top: insets.top + 66 }]} pointerEvents="none">
          <Text style={s.bannerT}>{banner}</Text>
        </View>
      )}

      {!scanning && (
        <View style={[s.bottom, { paddingBottom: insets.bottom + 12 }]} pointerEvents="box-none">
          <View style={s.recRow} pointerEvents="box-none">
            {video && rec == null ? (
              <Pressable style={s.share} onPress={share}>
                <Text style={s.shareT}>📤 Videoyu paylaş</Text>
              </Pressable>
            ) : null}
            <Pressable style={[s.rec, rec != null && s.recOn]} onPress={toggleRec}>
              {rec != null ? <Text style={s.recT}>{left}</Text> : <View style={s.recDot} />}
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.actions}>
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
  sheetBack: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 18 },
  sheetT: { color: "#fff", fontSize: 20, fontWeight: "800", marginBottom: 12 },
  friend: { backgroundColor: C.card2, borderRadius: 18, padding: 10, alignItems: "center", width: 110 },
  friendT: { color: "#fff", fontWeight: "700", marginTop: 4 },
});

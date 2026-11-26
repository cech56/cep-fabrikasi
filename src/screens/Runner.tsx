import * as Haptics from "expo-haptics";
import { ComponentType, RefAttributes, useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import { canPinShortcut } from "../../modules/cep-shortcut";
import { askAi, decodeRoomData, fetchRoom, fetchRoomChanges, pushRoomValue } from "../api";
import { ensureCamera, startSensor, takePhoto, torch, vibrate } from "../capabilities";
import { MicButton } from "../components/MicButton";
import { Scanner } from "../components/Scanner";
import { t } from "../i18n";
import { cancelAllForApp, cancelForApp, scheduleForApp } from "../notify";
import { BRIDGE_JS, wrapHtml } from "../runtime";
import { getAppData, mergeAppData, setAppValue } from "../storage";
import { useTheme } from "../theme";
import { MiniApp } from "../types";

// react-native-webview 14 tipleri TypeScript 6 ile "never"a çöküyor; çalışma zamanı etkilenmez.
const SandboxWebView = WebView as unknown as ComponentType<Record<string, unknown> & RefAttributes<WebView>>;

const POLL_MS = 3000;
const AUTO_FIX_WINDOW_MS = 8000;

type Props = {
  app: MiniApp;
  preview?: boolean; // vitrinden açıldı, henüz kaydedilmedi
  fresh?: number; // elle yapılan son üretimin zamanı: açılışta hata çıkarsa bir kez kendiliğinden düzelt
  liked?: boolean;
  onBack: () => void;
  onEdit: (instruction: string, auto?: boolean) => void;
  onUndo: () => void;
  onShare: () => void;
  onPin: () => void;
  onTogether: () => void;
  onRemoteHtml: (html: string) => void;
  onReport?: () => void;
  onLike?: () => void;
  onSave?: () => void;
  onWidget: () => void;
  onWidgetText: (text: string) => void;
  onHistory: () => void;
  onAiLimit: (message: string) => void;
};

export function Runner(p: Props) {
  const { app, preview } = p;
  const th = useTheme();
  const pinnable = !preview && canPinShortcut();
  const web = useRef<WebView>(null);
  const [instruction, setInstruction] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [ready, setReady] = useState(!app.roomId || !!preview);
  const listening = useRef(false);
  const since = useRef(0);
  const loadedAt = useRef(Date.now());
  const autoFixed = useRef(false);
  const sensors = useRef<Record<number, () => void>>({});
  const torchOn = useRef(false);
  const [scanning, setScanning] = useState<null | ((v: string | null) => void)>(null);

  const stopAll = useCallback(() => {
    for (const stop of Object.values(sensors.current)) stop();
    sensors.current = {};
    if (torchOn.current) {
      torchOn.current = false;
      try {
        torch(false);
      } catch {}
    }
  }, []);

  // Uygulama kapanınca ya da yeniden yüklenince sensörleri ve feneri kapat
  useEffect(() => stopAll, [app.updatedAt, reloadKey, stopAll]);

  // Her yeni elle üretimde bir otomatik düzeltme hakkı
  useEffect(() => {
    autoFixed.current = false;
  }, [p.fresh]);

  // Yeni sürüm yüklenince dinleyici durumu ve otomatik düzeltme penceresi sıfırlanır
  useEffect(() => {
    listening.current = false;
    loadedAt.current = Date.now();
    setError(null);
  }, [app.updatedAt, reloadKey]);

  // ---- Birlikte kullan: açılışta tam eşitleme, sonra her 3 saniyede başkalarının değişikliklerini çek ----
  const applyRemote = useCallback(
    async (data: Record<string, string>) => {
      const keys = Object.keys(data);
      if (!keys.length) return;
      await mergeAppData(app.id, decodeRoomData(data));
      if (listening.current) web.current?.injectJavaScript(`window.__cepChanged(${JSON.stringify(keys)}); true;`);
      else setReloadKey((k) => k + 1);
    },
    [app.id],
  );

  useEffect(() => {
    if (!app.roomId || preview) return;
    let alive = true;
    const roomId = app.roomId;
    const fallback = setTimeout(() => alive && setReady(true), 4000); // internet yoksa yerel veriyle aç
    fetchRoom(roomId)
      .then(async (room) => {
        if (!alive) return;
        await mergeAppData(app.id, decodeRoomData(room.data));
        since.current = room.now;
        setReady(true);
      })
      .catch(() => alive && setReady(true));

    let busy = false;
    const tick = async () => {
      if (busy || !since.current || AppState.currentState !== "active") return;
      busy = true;
      try {
        const ch = await fetchRoomChanges(roomId, since.current);
        if (!alive) return;
        since.current = ch.now;
        if (ch.html) p.onRemoteHtml(ch.html);
        await applyRemote(ch.data);
      } catch {
        // bağlantı yoksa sonraki turda yeniden dener
      } finally {
        busy = false;
      }
    };
    const timer = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearTimeout(fallback);
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.roomId, app.id, preview, applyRemote]);

  // ---- Köprü ----
  const reply = (id: number, ok: boolean, value: unknown) => {
    web.current?.injectJavaScript(`window.__cepResolve(${id}, ${ok}, ${JSON.stringify(value ?? null)}); true;`);
  };

  const onMessage = async (e: WebViewMessageEvent) => {
    let msg: { id?: number; type?: string; payload?: any };
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    try {
      switch (msg.type) {
        case "get": {
          const data = await getAppData(app.id);
          return reply(msg.id!, true, data[String(msg.payload?.key)] ?? null);
        }
        case "set": {
          const key = String(msg.payload?.key);
          const value = msg.payload?.value ?? null;
          await setAppValue(app.id, key, value);
          reply(msg.id!, true, true);
          if (app.roomId && !preview) pushRoomValue(app.roomId, key, value).catch(() => {});
          return;
        }
        case "listen":
          listening.current = true;
          return;
        case "haptic":
          Haptics.selectionAsync();
          return;
        case "notify":
          if (preview) throw new Error(t("notifPreview"));
          return reply(msg.id!, true, await scheduleForApp(app.id, app.name, msg.payload ?? {}, t("notifDenied")));
        case "cancelNotify":
          return reply(msg.id!, true, await cancelForApp(app.id, String(msg.payload?.id)));
        case "cancelAllNotify":
          await cancelAllForApp(app.id);
          return reply(msg.id!, true, true);
        case "ai":
          try {
            return reply(msg.id!, true, await askAi(String(msg.payload?.prompt ?? ""), String(msg.payload?.system ?? "")));
          } catch (err: any) {
            if (/hakkın doldu|used today/.test(err?.message ?? "")) p.onAiLimit(err.message);
            throw err;
          }
        case "vibrate":
          vibrate(msg.payload?.pattern);
          return reply(msg.id!, true, true);
        case "torch":
          torch(!!msg.payload?.on);
          torchOn.current = !!msg.payload?.on;
          return reply(msg.id!, true, true);
        case "scanQR": {
          if (preview) throw new Error(t("notifPreview"));
          await ensureCamera(app.id, app.name);
          const data = await new Promise<string | null>((resolve) => setScanning(() => resolve));
          setScanning(null);
          return reply(msg.id!, true, data);
        }
        case "takePhoto":
          if (preview) throw new Error(t("notifPreview"));
          return reply(msg.id!, true, await takePhoto(app.id, app.name));
        case "sensor": {
          const sid = Number(msg.payload?.sid);
          let last = 0;
          const stop = await startSensor(app.id, app.name, String(msg.payload?.type), (v) => {
            const now = Date.now();
            if (now - last < 180) return;
            last = now;
            web.current?.injectJavaScript(`window.__cepSensor(${sid}, ${JSON.stringify(v)}); true;`);
          });
          sensors.current[sid] = stop;
          return reply(msg.id!, true, true);
        }
        case "sensorStop": {
          const sid = Number(msg.payload?.sid);
          sensors.current[sid]?.();
          delete sensors.current[sid];
          return;
        }
        case "widget":
          if (!preview) p.onWidgetText(String(msg.payload ?? ""));
          return;
        case "error": {
          const err = String(msg.payload).slice(0, 200);
          setError(err);
          // Kendini kontrol eden fabrika: yeni üretilen uygulama açılırken hata verirse sormadan bir kez düzelt
          if (p.fresh && !preview && !autoFixed.current && Date.now() - loadedAt.current < AUTO_FIX_WINDOW_MS) {
            autoFixed.current = true;
            p.onEdit(t("fixThis", { error: err }), true);
          }
          return;
        }
      }
    } catch (err: any) {
      if (msg.id) reply(msg.id, false, err?.message ?? "Hata");
    }
  };

  const send = () => {
    const text = instruction.trim();
    if (text.length < 3) return;
    setInstruction("");
    setError(null);
    p.onEdit(text);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: th.bg }} edges={["top", "bottom"]}>
      <View style={[styles.top, { borderColor: th.border }]}>
        <Pressable onPress={p.onBack} hitSlop={12} style={styles.topBtn}>
          <Text style={{ color: th.accent, fontSize: 17, fontWeight: "600" }}>{t("back")}</Text>
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text numberOfLines={1} style={[styles.title, { color: th.ink }]}>
            {app.emoji} {app.name}
          </Text>
          {app.roomId && !preview && <Text style={{ color: th.accent, fontSize: 11, fontWeight: "700" }}>● {t("liveOn")}</Text>}
        </View>
        {preview ? (
          <View style={styles.topBtn} />
        ) : (
          <Pressable onPress={p.onUndo} disabled={app.history.length === 0} hitSlop={12} style={styles.topBtn}>
            <Text style={{ color: app.history.length ? th.accent : th.muted, fontSize: 15, textAlign: "right" }}>{t("undo")}</Text>
          </Pressable>
        )}
      </View>

      {ready ? (
        <SandboxWebView
          ref={web}
          key={`${app.updatedAt}-${reloadKey}`} // yeni sürümde ya da ortak veri değişince yeniden yükle
          source={{ html: wrapHtml(app.html), baseUrl: "about:blank" }}
          originWhitelist={["about:*"]}
          injectedJavaScriptBeforeContentLoaded={BRIDGE_JS}
          onMessage={onMessage}
          onShouldStartLoadWithRequest={(req: { url: string }) => req.url.startsWith("about:") || req.url.startsWith("data:")}
          javaScriptCanOpenWindowsAutomatically={false}
          setSupportMultipleWindows={false}
          allowFileAccess={false}
          allowFileAccessFromFileURLs={false}
          allowUniversalAccessFromFileURLs={false}
          geolocationEnabled={false}
          mediaCapturePermissionGrantType="deny"
          mixedContentMode="never"
          cacheEnabled={false}
          incognito
          style={{ flex: 1, backgroundColor: th.bg }}
        />
      ) : (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={th.accent} />
        </View>
      )}

      {error && !preview && (
        <Pressable onPress={() => setInstruction(t("fixThis", { error }))} style={[styles.error, { backgroundColor: th.danger }]}>
          <Text style={{ color: "#fff", fontSize: 13 }} numberOfLines={2}>
            {t("errorBanner")}
          </Text>
        </Pressable>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.actions}>
        {preview && p.onLike && <Action label={p.liked ? t("liked") : t("like")} onPress={p.onLike} />}
        {!preview && <Action label={t("beautify")} onPress={() => p.onEdit(t("beautifyPrompt"))} />}
        {!preview && <Action label={app.roomId ? t("invite") : t("together_")} onPress={p.onTogether} />}
        {!preview && pinnable && <Action label={t("widget")} onPress={p.onWidget} />}
        {!preview && <Action label={t("history")} onPress={p.onHistory} />}
        <Action label={t("share")} onPress={p.onShare} />
        {pinnable && <Action label={t("pin")} onPress={p.onPin} />}
        {p.onReport && <Action label={t("report")} onPress={p.onReport} />}
      </ScrollView>

      {preview ? (
        <Pressable onPress={p.onSave} style={[styles.save, { backgroundColor: th.accent }]}>
          <Text style={{ color: th.accentInk, fontSize: 17, fontWeight: "800" }}>{t("saveToMine")}</Text>
        </Pressable>
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[styles.bar, { backgroundColor: th.card, borderColor: th.border }]}>
            <TextInput
              value={instruction}
              onChangeText={setInstruction}
              placeholder={t("editPlaceholder")}
              placeholderTextColor={th.muted}
              style={[styles.barInput, { color: th.ink }]}
              onSubmitEditing={send}
              returnKeyType="send"
            />
            <MicButton currentText={instruction} onText={setInstruction} size={40} />
            <Pressable onPress={send} style={[styles.send, { backgroundColor: th.accent }]}>
              <Text style={{ color: th.accentInk, fontWeight: "800" }}>✨</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}
      <Scanner visible={!!scanning} onResult={(v) => scanning?.(v)} />
    </SafeAreaView>
  );
}

function Action({ label, onPress }: { label: string; onPress: () => void }) {
  const th = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.action, { backgroundColor: th.card, borderColor: th.border, opacity: pressed ? 0.7 : 1 }]}>
      <Text style={{ color: th.ink, fontSize: 14, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actions: { gap: 8, paddingHorizontal: 12, paddingTop: 10 },
  action: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
  save: { margin: 12, borderRadius: 16, paddingVertical: 16, alignItems: "center" },
  top: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  topBtn: { minWidth: 70 },
  title: { textAlign: "center", fontSize: 17, fontWeight: "700" },
  error: { marginHorizontal: 12, marginBottom: 8, borderRadius: 12, padding: 10 },
  bar: { flexDirection: "row", alignItems: "center", gap: 6, margin: 12, borderRadius: 999, borderWidth: 1, paddingLeft: 16, paddingRight: 6, paddingVertical: 6 },
  barInput: { flex: 1, fontSize: 16, paddingVertical: 8 },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
});

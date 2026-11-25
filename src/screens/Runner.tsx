import * as Haptics from "expo-haptics";
import { ComponentType, RefAttributes, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import { canPinShortcut } from "../../modules/cep-shortcut";
import { MicButton } from "../components/MicButton";
import { BRIDGE_JS, wrapHtml } from "../runtime";
import { getAppData, setAppValue } from "../storage";
import { useTheme } from "../theme";
import { MiniApp } from "../types";

// react-native-webview 14 tipleri TypeScript 6 ile "never"a çöküyor; çalışma zamanı etkilenmez.
const SandboxWebView = WebView as unknown as ComponentType<Record<string, unknown> & RefAttributes<WebView>>;

type Props = {
  app: MiniApp;
  preview?: boolean; // vitrinden açıldı, henüz kaydedilmedi
  onBack: () => void;
  onEdit: (instruction: string) => void;
  onUndo: () => void;
  onShare: () => void;
  onPin: () => void;
  onReport?: () => void;
  onSave?: () => void;
};

export const BEAUTIFY =
  "Uygulamayı güzelleştir: daha modern ve şık bir tasarım yap (yumuşak gölgeler, uyumlu renkler, akıcı geçiş animasyonları, büyük ve rahat dokunulan butonlar), boş durumlar için yardımcı metinler ekle, varsa küçük hataları düzelt. Mevcut özellikleri ve kayıtlı veri anahtarlarını aynen koru.";

export function Runner({ app, preview, onBack, onEdit, onUndo, onShare, onPin, onReport, onSave }: Props) {
  const t = useTheme();
  const pinnable = !preview && canPinShortcut();
  const web = useRef<WebView>(null);
  const [instruction, setInstruction] = useState("");
  const [error, setError] = useState<string | null>(null);

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
      if (msg.type === "get" && msg.id) {
        const data = await getAppData(app.id);
        reply(msg.id, true, data[String(msg.payload?.key)] ?? null);
      } else if (msg.type === "set" && msg.id) {
        await setAppValue(app.id, String(msg.payload?.key), msg.payload?.value ?? null);
        reply(msg.id, true, true);
      } else if (msg.type === "haptic") {
        Haptics.selectionAsync();
      } else if (msg.type === "error") {
        setError(String(msg.payload).slice(0, 200));
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
    onEdit(text);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top", "bottom"]}>
      <View style={[styles.top, { borderColor: t.border }]}>
        <Pressable onPress={onBack} hitSlop={12} style={styles.topBtn}>
          <Text style={{ color: t.accent, fontSize: 17, fontWeight: "600" }}>‹ Geri</Text>
        </Pressable>
        <Text numberOfLines={1} style={[styles.title, { color: t.ink }]}>
          {app.emoji} {app.name}
        </Text>
        {preview ? (
          <View style={styles.topBtn} />
        ) : (
          <Pressable onPress={onUndo} disabled={app.history.length === 0} hitSlop={12} style={styles.topBtn}>
            <Text style={{ color: app.history.length ? t.accent : t.muted, fontSize: 15, textAlign: "right" }}>↶ Geri al</Text>
          </Pressable>
        )}
      </View>

      <SandboxWebView
        ref={web}
        key={app.updatedAt} // yeni sürümde yeniden yükle
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
        style={{ flex: 1, backgroundColor: t.bg }}
      />

      {error && (
        <Pressable onPress={() => setInstruction(`Şu hatayı düzelt: ${error}`)} style={[styles.error, { backgroundColor: t.danger }]}>
          <Text style={{ color: "#fff", fontSize: 13 }} numberOfLines={2}>
            Uygulamada bir hata oldu. Düzeltmem için dokun.
          </Text>
        </Pressable>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.actions}>
        {!preview && <Action label="✨ Güzelleştir" onPress={() => onEdit(BEAUTIFY)} />}
        <Action label="🔗 Paylaş" onPress={onShare} />
        {pinnable && <Action label="📌 Ana ekrana ekle" onPress={onPin} />}
        {onReport && <Action label="🚩 Şikayet et" onPress={onReport} />}
      </ScrollView>

      {preview ? (
        <Pressable onPress={onSave} style={[styles.save, { backgroundColor: t.accent }]}>
          <Text style={{ color: t.accentInk, fontSize: 17, fontWeight: "800" }}>📥 Uygulamalarıma ekle ve uyarla</Text>
        </Pressable>
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[styles.bar, { backgroundColor: t.card, borderColor: t.border }]}>
            <TextInput
              value={instruction}
              onChangeText={setInstruction}
              placeholder="Değiştir: rengi yeşil yap, kategori ekle…"
              placeholderTextColor={t.muted}
              style={[styles.barInput, { color: t.ink }]}
              onSubmitEditing={send}
              returnKeyType="send"
            />
            <MicButton currentText={instruction} onText={setInstruction} size={40} />
            <Pressable onPress={send} style={[styles.send, { backgroundColor: t.accent }]}>
              <Text style={{ color: t.accentInk, fontWeight: "800" }}>✨</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

function Action({ label, onPress }: { label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.action, { backgroundColor: t.card, borderColor: t.border, opacity: pressed ? 0.7 : 1 }]}>
      <Text style={{ color: t.ink, fontSize: 14, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actions: { gap: 8, paddingHorizontal: 12, paddingTop: 10 },
  action: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
  save: { margin: 12, borderRadius: 16, paddingVertical: 16, alignItems: "center" },
  top: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  topBtn: { minWidth: 70 },
  title: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700" },
  error: { marginHorizontal: 12, marginBottom: 8, borderRadius: 12, padding: 10 },
  bar: { flexDirection: "row", alignItems: "center", gap: 6, margin: 12, borderRadius: 999, borderWidth: 1, paddingLeft: 16, paddingRight: 6, paddingVertical: 6 },
  barInput: { flex: 1, fontSize: 16, paddingVertical: 8 },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
});

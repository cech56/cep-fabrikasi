import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Alert, FlatList, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ImageInput } from "../api";
import { MicButton } from "../components/MicButton";
import { getLang, t } from "../i18n";
import { templates } from "../templates";
import { useTheme } from "../theme";
import { MiniApp } from "../types";
import { Vitrin } from "./Vitrin";

type Props = {
  apps: MiniApp[];
  onCreate: (prompt: string, image?: ImageInput) => void;
  onOpen: (app: MiniApp) => void;
  onDelete: (app: MiniApp) => void;
  onOpenShared: (id: string) => void;
  onPro: () => void;
  onProfile: () => void;
  onToggleLang: () => void;
  usage: { used: number; limit: number } | null;
};

// Görseli küçültüp sıkıştırır (yaklaşık 100-200 KB), sunucuya base64 olarak gider.
async function prepareImage(uri: string): Promise<{ uri: string; input: ImageInput }> {
  const out = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1024 } }], {
    compress: 0.6,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });
  return { uri: out.uri, input: { mime: "image/jpeg", data: out.base64 ?? "" } };
}

export function Home({ apps, onCreate, onOpen, onDelete, onOpenShared, onPro, onProfile, onToggleLang, usage }: Props) {
  const th = useTheme();
  const [prompt, setPrompt] = useState("");
  const [image, setImage] = useState<{ uri: string; input: ImageInput } | null>(null);
  const [tab, setTab] = useState<"mine" | "vitrin">("mine");
  const canCreate = prompt.trim().length >= 5 || !!image;

  const pick = async (camera: boolean) => {
    try {
      if (camera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) return Alert.alert(t("failed"), t("cameraDenied"));
      }
      const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.8, allowsEditing: false };
      const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (res.canceled || !res.assets?.[0]) return;
      setImage(await prepareImage(res.assets[0].uri));
    } catch (e: any) {
      Alert.alert(t("failed"), e?.message ?? t("somethingWrong"));
    }
  };

  const askPhoto = () =>
    Alert.alert(t("photoTitle"), t("photoBody"), [
      { text: t("takePhoto"), onPress: () => pick(true) },
      { text: t("pickPhoto"), onPress: () => pick(false) },
      { text: t("cancel"), style: "cancel" },
    ]);

  const submit = () => {
    const text = prompt.trim() || t("photoPrompt");
    onCreate(text, image?.input);
    setPrompt("");
    setImage(null);
  };

  const top = (
    <View>
      <View style={styles.brandRow}>
        <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.brand, { color: th.ink }]}>🏭 Cep Fabrikası</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable onPress={onToggleLang} hitSlop={8} accessibilityLabel={t("langTitle")} style={[styles.pill, { borderColor: th.border }]}>
            <Text style={{ color: th.ink, fontWeight: "800", fontSize: 13 }}>{getLang() === "tr" ? "🇹🇷 TR" : "🇬🇧 EN"}</Text>
          </Pressable>
          <Pressable onPress={onProfile} hitSlop={8} style={[styles.pill, { borderColor: th.border }]}>
            <Text style={{ fontSize: 14 }}>👤</Text>
          </Pressable>
          <Pressable onPress={onPro} hitSlop={8} style={[styles.pill, { borderColor: th.accent }]}>
            <Text style={{ color: th.accent, fontWeight: "800", fontSize: 13 }}>PRO</Text>
          </Pressable>
        </View>
      </View>
      <View style={[styles.tabs, { backgroundColor: th.card, borderColor: th.border }]}>
        {(["mine", "vitrin"] as const).map((k) => (
          <Pressable key={k} onPress={() => setTab(k)} style={[styles.tab, tab === k && { backgroundColor: th.accent }]}>
            <Text style={{ color: tab === k ? th.accentInk : th.ink, fontWeight: "700" }}>{k === "mine" ? t("tabMine") : t("tabVitrin")}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  const header = (
    <View>
      {top}
      <Text style={[styles.tagline, { color: th.muted }]}>{t("tagline")}</Text>

      <View style={[styles.card, { backgroundColor: th.card, borderColor: th.border }]}>
        <TextInput
          value={prompt}
          onChangeText={setPrompt}
          placeholder={image ? t("photoAdded") : t("placeholder")}
          placeholderTextColor={th.muted}
          multiline
          maxLength={2000}
          style={[styles.input, { color: th.ink }]}
        />
        {image && (
          <View style={styles.thumbRow}>
            <Image source={{ uri: image.uri }} style={styles.thumb} />
            <Pressable onPress={() => setImage(null)} hitSlop={8} style={[styles.thumbX, { backgroundColor: th.danger }]}>
              <Text style={{ color: "#fff", fontWeight: "800" }}>✕</Text>
            </Pressable>
          </View>
        )}
        <View style={styles.ctaRow}>
          <MicButton currentText={prompt} onText={setPrompt} size={52} />
          <Pressable
            onPress={askPhoto}
            accessibilityLabel={t("photoTitle")}
            style={[styles.round, { borderColor: th.border, backgroundColor: th.card }]}
          >
            <Text style={{ fontSize: 22 }}>📸</Text>
          </Pressable>
          <Pressable
            disabled={!canCreate}
            onPress={submit}
            style={({ pressed }) => [styles.cta, { backgroundColor: th.accent, opacity: !canCreate ? 0.4 : pressed ? 0.8 : 1 }]}
          >
            <Text style={[styles.ctaText, { color: th.accentInk }]}>{t("make")}</Text>
          </Pressable>
        </View>
      </View>
      {usage && (
        <Pressable onPress={onPro}>
          <Text style={{ color: th.muted, fontSize: 13, marginTop: 8, textAlign: "center" }}>
            {t("usage", { used: Math.min(usage.used, usage.limit), limit: usage.limit })}
          </Text>
        </Pressable>
      )}

      <Text style={[styles.section, { color: th.ink }]}>{t("ideas")}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 16 }}>
        {templates().map((tp) => (
          <Pressable key={tp.title} onPress={() => setPrompt(tp.prompt)} style={[styles.chip, { backgroundColor: th.card, borderColor: th.border }]}>
            <Text style={{ color: th.ink, fontSize: 15 }}>
              {tp.emoji} {tp.title}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <Text style={[styles.section, { color: th.ink }]}>{t("myApps")}</Text>
      {apps.length === 0 && <Text style={{ color: th.muted }}>{t("noApps")}</Text>}
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: th.bg }}>
      {tab === "vitrin" ? (
        <Vitrin onOpen={onOpenShared} header={top} />
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <FlatList
            data={apps}
            keyExtractor={(a) => a.id}
            numColumns={2}
            ListHeaderComponent={header}
            contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
            columnWrapperStyle={{ gap: 12 }}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                onPress={() => onOpen(item)}
                onLongPress={() =>
                  Alert.alert(item.name, t("deleteAsk"), [
                    { text: t("cancel"), style: "cancel" },
                    { text: t("delete"), style: "destructive", onPress: () => onDelete(item) },
                  ])
                }
                style={({ pressed }) => [styles.appCard, { backgroundColor: th.card, borderColor: th.border, opacity: pressed ? 0.7 : 1 }]}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <Text style={styles.appEmoji}>{item.emoji}</Text>
                  {item.roomId && (
                    <Text style={[styles.badge, { backgroundColor: th.accent, color: th.accentInk }]}>👨‍👩‍👧 {t("together")}</Text>
                  )}
                </View>
                <Text numberOfLines={1} style={[styles.appName, { color: th.ink }]}>
                  {item.name}
                </Text>
                <Text numberOfLines={2} style={{ color: th.muted, fontSize: 12 }}>
                  {item.description}
                </Text>
              </Pressable>
            )}
          />
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  brandRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8, marginBottom: 12 },
  brand: { flex: 1, fontSize: 26, fontWeight: "800", marginRight: 8 },
  pill: { borderWidth: 2, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, minHeight: 30, justifyContent: "center" },
  tabs: { flexDirection: "row", borderRadius: 999, borderWidth: 1, padding: 4, marginBottom: 14 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 999 },
  tagline: { fontSize: 15, marginBottom: 12 },
  card: { borderRadius: 20, borderWidth: 1, padding: 12 },
  input: { minHeight: 96, fontSize: 17, textAlignVertical: "top" },
  thumbRow: { flexDirection: "row", marginTop: 4 },
  thumb: { width: 72, height: 72, borderRadius: 12 },
  thumbX: { position: "absolute", left: 58, top: -6, width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  ctaRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
  round: { width: 52, height: 52, borderRadius: 26, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  cta: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  ctaText: { fontSize: 18, fontWeight: "800" },
  section: { fontSize: 18, fontWeight: "700", marginTop: 24, marginBottom: 10 },
  chip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  appCard: { flex: 1, borderRadius: 18, borderWidth: 1, padding: 14, marginBottom: 12, minHeight: 120, maxWidth: "48.5%" },
  appEmoji: { fontSize: 34 },
  badge: { fontSize: 10, fontWeight: "800", borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2, overflow: "hidden" },
  appName: { fontSize: 16, fontWeight: "700", marginTop: 6, marginBottom: 2 },
});

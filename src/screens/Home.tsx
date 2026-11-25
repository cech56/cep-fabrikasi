import { useState } from "react";
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MicButton } from "../components/MicButton";
import { TEMPLATES } from "../templates";
import { Vitrin } from "./Vitrin";
import { useTheme } from "../theme";
import { MiniApp } from "../types";

type Props = {
  apps: MiniApp[];
  onCreate: (prompt: string) => void;
  onOpen: (app: MiniApp) => void;
  onDelete: (app: MiniApp) => void;
  onOpenShared: (id: string) => void;
  onPro: () => void;
  usage: { used: number; limit: number } | null;
};

export function Home({ apps, onCreate, onOpen, onDelete, onOpenShared, onPro, usage }: Props) {
  const t = useTheme();
  const [prompt, setPrompt] = useState("");
  const [tab, setTab] = useState<"mine" | "vitrin">("mine");
  const canCreate = prompt.trim().length >= 5;

  const top = (
    <View>
      <View style={styles.brandRow}>
        <Text style={[styles.brand, { color: t.ink }]}>🏭 Cep Fabrikası</Text>
        <Pressable onPress={onPro} hitSlop={8} style={[styles.pro, { borderColor: t.accent }]}>
          <Text style={{ color: t.accent, fontWeight: "800", fontSize: 13 }}>PRO</Text>
        </Pressable>
      </View>
      <View style={[styles.tabs, { backgroundColor: t.card, borderColor: t.border }]}>
        {(["mine", "vitrin"] as const).map((k) => (
          <Pressable key={k} onPress={() => setTab(k)} style={[styles.tab, tab === k && { backgroundColor: t.accent }]}>
            <Text style={{ color: tab === k ? t.accentInk : t.ink, fontWeight: "700" }}>{k === "mine" ? "🧰 Fabrikam" : "🌍 Vitrin"}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  const header = (
    <View>
      {top}
      <Text style={[styles.tagline, { color: t.muted }]}>Ne istediğini yaz ya da söyle, uygulaman saniyeler içinde hazır.</Text>

      <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
        <TextInput
          value={prompt}
          onChangeText={setPrompt}
          placeholder="Örn: Kızım için çarpım tablosu oyunu, her doğru cevapta yıldız kazansın"
          placeholderTextColor={t.muted}
          multiline
          maxLength={2000}
          style={[styles.input, { color: t.ink }]}
        />
        <View style={styles.ctaRow}>
        <MicButton currentText={prompt} onText={setPrompt} size={52} />
        <Pressable
          disabled={!canCreate}
          onPress={() => {
            onCreate(prompt.trim());
            setPrompt("");
          }}
          style={({ pressed }) => [styles.cta, { backgroundColor: t.accent, opacity: !canCreate ? 0.4 : pressed ? 0.8 : 1 }]}
        >
          <Text style={[styles.ctaText, { color: t.accentInk }]}>Yap ✨</Text>
        </Pressable>
        </View>
      </View>
      {usage && (
        <Pressable onPress={onPro}>
          <Text style={{ color: t.muted, fontSize: 13, marginTop: 8, textAlign: "center" }}>
            Bugün {Math.min(usage.used, usage.limit)}/{usage.limit} hak kullandın · Sınırsız için Pro
          </Text>
        </Pressable>
      )}

      <Text style={[styles.section, { color: t.ink }]}>Fikir lazım mı?</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 16 }}>
        {TEMPLATES.map((tp) => (
          <Pressable key={tp.title} onPress={() => setPrompt(tp.prompt)} style={[styles.chip, { backgroundColor: t.card, borderColor: t.border }]}>
            <Text style={{ color: t.ink, fontSize: 15 }}>
              {tp.emoji} {tp.title}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <Text style={[styles.section, { color: t.ink }]}>Uygulamalarım</Text>
      {apps.length === 0 && <Text style={{ color: t.muted }}>Henüz yok. İlkini yukarıdan yap!</Text>}
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
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
                Alert.alert(item.name, "Bu uygulama ve içindeki veriler silinsin mi?", [
                  { text: "Vazgeç", style: "cancel" },
                  { text: "Sil", style: "destructive", onPress: () => onDelete(item) },
                ])
              }
              style={({ pressed }) => [styles.appCard, { backgroundColor: t.card, borderColor: t.border, opacity: pressed ? 0.7 : 1 }]}
            >
              <Text style={styles.appEmoji}>{item.emoji}</Text>
              <Text numberOfLines={1} style={[styles.appName, { color: t.ink }]}>
                {item.name}
              </Text>
              <Text numberOfLines={2} style={{ color: t.muted, fontSize: 12 }}>
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
  brand: { fontSize: 28, fontWeight: "800" },
  pro: { borderWidth: 2, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  tabs: { flexDirection: "row", borderRadius: 999, borderWidth: 1, padding: 4, marginBottom: 14 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 999 },
  tagline: { fontSize: 15, marginBottom: 12 },
  ctaRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
  card: { borderRadius: 20, borderWidth: 1, padding: 12 },
  input: { minHeight: 96, fontSize: 17, textAlignVertical: "top" },
  cta: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  ctaText: { fontSize: 18, fontWeight: "800" },
  section: { fontSize: 18, fontWeight: "700", marginTop: 24, marginBottom: 10 },
  chip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  appCard: { flex: 1, borderRadius: 18, borderWidth: 1, padding: 14, marginBottom: 12, minHeight: 120, maxWidth: "48.5%" },
  appEmoji: { fontSize: 34 },
  appName: { fontSize: 16, fontWeight: "700", marginTop: 6, marginBottom: 2 },
});

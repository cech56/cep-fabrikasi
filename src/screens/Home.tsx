import { useState } from "react";
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { TEMPLATES } from "../templates";
import { useTheme } from "../theme";
import { MiniApp } from "../types";

type Props = {
  apps: MiniApp[];
  onCreate: (prompt: string) => void;
  onOpen: (app: MiniApp) => void;
  onDelete: (app: MiniApp) => void;
};

export function Home({ apps, onCreate, onOpen, onDelete }: Props) {
  const t = useTheme();
  const [prompt, setPrompt] = useState("");
  const canCreate = prompt.trim().length >= 5;

  const header = (
    <View>
      <Text style={[styles.brand, { color: t.ink }]}>🏭 Cep Fabrikası</Text>
      <Text style={[styles.tagline, { color: t.muted }]}>Ne istediğini anlat, uygulaman 20 saniyede hazır.</Text>

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  brand: { fontSize: 28, fontWeight: "800", marginTop: 8 },
  tagline: { fontSize: 15, marginTop: 4, marginBottom: 16 },
  card: { borderRadius: 20, borderWidth: 1, padding: 12 },
  input: { minHeight: 96, fontSize: 17, textAlignVertical: "top" },
  cta: { borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  ctaText: { fontSize: 18, fontWeight: "800" },
  section: { fontSize: 18, fontWeight: "700", marginTop: 24, marginBottom: 10 },
  chip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  appCard: { flex: 1, borderRadius: 18, borderWidth: 1, padding: 14, marginBottom: 12, minHeight: 120, maxWidth: "48.5%" },
  appEmoji: { fontSize: 34 },
  appName: { fontSize: 16, fontWeight: "700", marginTop: 6, marginBottom: 2 },
});

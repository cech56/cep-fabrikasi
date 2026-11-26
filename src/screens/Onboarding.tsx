import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Key, t } from "../i18n";
import { useTheme } from "../theme";

const SLIDES: { emoji: string; title: Key; body: Key }[] = [
  { emoji: "🏭", title: "ob1Title", body: "ob1Body" },
  { emoji: "✨", title: "ob2Title", body: "ob2Body" },
  { emoji: "👨‍👩‍👧", title: "ob3Title", body: "ob3Body" },
];

// İlk açılışta 3 tanıtım ekranı
export function Onboarding({ onDone }: { onDone: () => void }) {
  const th = useTheme();
  const [i, setI] = useState(0);
  const s = SLIDES[i];
  const last = i === SLIDES.length - 1;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: th.bg }}>
      <Pressable onPress={onDone} style={styles.skip} hitSlop={12}>
        <Text style={{ color: th.muted, fontSize: 15 }}>{t("skip")}</Text>
      </Pressable>
      <View style={styles.body}>
        <Text style={styles.emoji}>{s.emoji}</Text>
        <Text style={[styles.title, { color: th.ink }]}>{t(s.title)}</Text>
        <Text style={[styles.text, { color: th.muted }]}>{t(s.body)}</Text>
      </View>
      <View style={styles.dots}>
        {SLIDES.map((_, k) => (
          <View key={k} style={[styles.dot, { backgroundColor: k === i ? th.accent : th.border, width: k === i ? 24 : 8 }]} />
        ))}
      </View>
      <Pressable onPress={() => (last ? onDone() : setI(i + 1))} style={[styles.cta, { backgroundColor: th.accent }]}>
        <Text style={{ color: th.accentInk, fontSize: 18, fontWeight: "800" }}>{last ? t("start") : t("next")}</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  skip: { alignSelf: "flex-end", padding: 20 },
  body: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  emoji: { fontSize: 96 },
  title: { fontSize: 28, fontWeight: "800", textAlign: "center", marginTop: 24 },
  text: { fontSize: 17, textAlign: "center", marginTop: 12, lineHeight: 25 },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6, marginBottom: 24 },
  dot: { height: 8, borderRadius: 4 },
  cta: { marginHorizontal: 24, marginBottom: 24, borderRadius: 16, paddingVertical: 16, alignItems: "center" },
});

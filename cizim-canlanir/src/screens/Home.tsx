import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { pngUri } from "../storage";
import { C } from "../theme";
import { Character } from "../types";

type Props = {
  chars: Character[];
  onScan: () => void;
  onPick: () => void;
  onOpen: (c: Character) => void;
  onAll: () => void;
  onSettings: () => void;
};

export function Home({ chars, onScan, onPick, onOpen, onAll, onSettings }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 20, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 30 }}>
      <View style={s.top}>
        <Text style={s.logo}>Çizim Canlanır</Text>
        <Pressable onPress={onSettings} hitSlop={12} style={s.gear}>
          <Text style={{ fontSize: 22 }}>⚙️</Text>
        </Pressable>
      </View>

      <Pressable style={s.hero} onPress={onScan}>
        <Text style={s.heroE}>📸</Text>
        <Text style={s.heroT}>Çizimimi canlandır!</Text>
        <Text style={s.heroS}>Kâğıttaki resmin fotoğrafını çek</Text>
      </Pressable>
      <Pressable style={s.pick} onPress={onPick}>
        <Text style={s.pickT}>🖼️ Galeriden seç</Text>
      </Pressable>

      <View style={s.tips}>
        <Text style={s.tip}>💡 Beyaz kâğıda koyu kalemle çizilmiş, kenarları kapalı resimler en iyi canlanır.</Text>
      </View>

      {chars.length > 0 && (
        <>
          <View style={s.secRow}>
            <Text style={s.sec}>Karakterlerim</Text>
            {chars.length > 1 && (
              <Pressable onPress={onAll} style={s.all}>
                <Text style={s.allT}>🎪 Hepsi sahnede</Text>
              </Pressable>
            )}
          </View>
          <View style={s.grid}>
            {chars.map((c) => (
              <Pressable key={c.id} style={s.item} onPress={() => onOpen(c)}>
                <Image source={{ uri: pngUri(c.id) }} style={s.img} resizeMode="contain" />
                <Text style={s.name} numberOfLines={1}>
                  {c.emoji} {c.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  logo: { color: C.yellow, fontSize: 28, fontWeight: "900" },
  gear: { padding: 6 },
  hero: { backgroundColor: C.purple, borderRadius: 28, paddingVertical: 34, alignItems: "center", marginTop: 22, elevation: 6 },
  heroE: { fontSize: 54 },
  heroT: { color: C.dark, fontSize: 26, fontWeight: "900", marginTop: 6 },
  heroS: { color: C.dark, opacity: 0.75, fontSize: 15, marginTop: 4 },
  pick: { backgroundColor: C.card, borderRadius: 20, padding: 16, alignItems: "center", marginTop: 12 },
  pickT: { color: C.ink, fontSize: 17, fontWeight: "700" },
  tips: { marginTop: 14, paddingHorizontal: 4 },
  tip: { color: C.muted, fontSize: 13, lineHeight: 18 },
  secRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 26 },
  sec: { color: C.ink, fontSize: 20, fontWeight: "800" },
  all: { backgroundColor: C.card, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  allT: { color: C.yellow, fontWeight: "700" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 12 },
  item: { width: "47%", backgroundColor: C.card, borderRadius: 20, padding: 10, alignItems: "center" },
  img: { width: "100%", aspectRatio: 1 },
  name: { color: C.ink, fontWeight: "700", marginTop: 6, fontSize: 15 },
});

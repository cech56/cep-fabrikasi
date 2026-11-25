import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { fetchVitrin } from "../api";
import { useTheme } from "../theme";
import { VitrinItem } from "../types";

type Props = {
  onOpen: (id: string) => void;
  header: React.ReactElement;
};

// Herkesin paylaştığı uygulamalar: yeni ve popüler.
export function Vitrin({ onOpen, header }: Props) {
  const t = useTheme();
  const [sort, setSort] = useState<"popular" | "new">("popular");
  const [items, setItems] = useState<VitrinItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const load = useCallback(
    async (reset: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const next = await fetchVitrin(sort, reset ? 0 : items.length);
        setItems(reset ? next : [...items, ...next.filter((n) => !items.some((i) => i.id === n.id))]);
        setDone(next.length < 30);
      } catch (e: any) {
        setError(e?.message ?? "Yüklenemedi");
      } finally {
        setLoading(false);
      }
    },
    [sort, items],
  );

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort]);

  const tabs = (
    <View>
      {header}
      <View style={[styles.tabs, { backgroundColor: t.card, borderColor: t.border }]}>
        {(["popular", "new"] as const).map((s) => (
          <Pressable key={s} onPress={() => setSort(s)} style={[styles.tab, sort === s && { backgroundColor: t.accent }]}>
            <Text style={{ color: sort === s ? t.accentInk : t.ink, fontWeight: "700" }}>{s === "popular" ? "🔥 Popüler" : "🆕 Yeni"}</Text>
          </Pressable>
        ))}
      </View>
      {error && (
        <Pressable onPress={() => load(true)}>
          <Text style={{ color: t.danger, marginBottom: 12 }}>{error} (Tekrar denemek için dokun)</Text>
        </Pressable>
      )}
      {!loading && !error && items.length === 0 && (
        <Text style={{ color: t.muted, marginBottom: 12 }}>Vitrin henüz boş. Bir uygulamanı paylaş, ilk sen ol!</Text>
      )}
    </View>
  );

  return (
    <FlatList
      data={items}
      keyExtractor={(a) => a.id}
      ListHeaderComponent={tabs}
      contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={loading && items.length > 0} onRefresh={() => load(true)} />}
      onEndReached={() => !loading && !done && items.length > 0 && load(false)}
      onEndReachedThreshold={0.5}
      ListFooterComponent={loading && items.length === 0 ? <ActivityIndicator color={t.accent} style={{ marginTop: 24 }} /> : undefined}
      renderItem={({ item }) => (
        <Pressable
          onPress={() => onOpen(item.id)}
          style={({ pressed }) => [styles.row, { backgroundColor: t.card, borderColor: t.border, opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={styles.emoji}>{item.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={[styles.name, { color: t.ink }]}>
              {item.name}
            </Text>
            <Text numberOfLines={2} style={{ color: t.muted, fontSize: 13 }}>
              {item.description}
            </Text>
            <Text style={{ color: t.muted, fontSize: 12, marginTop: 4 }}>
              👁 {item.views}   🔁 {item.remixes}
            </Text>
          </View>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: "row", borderRadius: 999, borderWidth: 1, padding: 4, marginBottom: 14 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 999 },
  row: { flexDirection: "row", gap: 12, alignItems: "center", borderRadius: 18, borderWidth: 1, padding: 14, marginBottom: 10 },
  emoji: { fontSize: 34 },
  name: { fontSize: 16, fontWeight: "700", marginBottom: 2 },
});

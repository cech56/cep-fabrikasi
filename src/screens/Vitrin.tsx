import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { fetchFeatured, fetchVitrin, likeApp } from "../api";
import { CATEGORY_KEYS, catLabel, t } from "../i18n";
import { useTheme } from "../theme";
import { VitrinItem } from "../types";

type Props = {
  onOpen: (id: string) => void;
  header: React.ReactElement;
};

// Herkesin paylaştığı uygulamalar: haftanın uygulaması, arama, kategoriler, beğeni.
export function Vitrin({ onOpen, header }: Props) {
  const th = useTheme();
  const [sort, setSort] = useState<"popular" | "new">("popular");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<VitrinItem[]>([]);
  const [top, setTop] = useState<VitrinItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(
    async (reset: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const next = await fetchVitrin({ sort, category, search: query, offset: reset ? 0 : items.length });
        setItems(reset ? next : [...items, ...next.filter((n) => !items.some((i) => i.id === n.id))]);
        setDone(next.length < 30);
      } catch (e: any) {
        setError(e?.message ?? t("somethingWrong"));
      } finally {
        setLoading(false);
      }
    },
    [sort, category, query, items],
  );

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, category, query]);

  useEffect(() => {
    fetchFeatured().then(setTop);
  }, []);

  const onSearch = (text: string) => {
    setSearch(text);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => setQuery(text.trim()), 400);
  };

  const toggleLike = async (item: VitrinItem) => {
    const update = (liked: boolean, likes: number) => {
      const f = (x: VitrinItem) => (x.id === item.id ? { ...x, liked: liked ? 1 : 0, likes } : x);
      setItems((list) => list.map(f));
      setTop((x) => (x ? f(x) : x));
    };
    const was = !!item.liked;
    update(!was, item.likes + (was ? -1 : 1)); // anında göster
    try {
      const r = await likeApp(item.id);
      update(r.liked, r.likes);
    } catch {
      update(was, item.likes);
    }
  };

  const Row = ({ item, big }: { item: VitrinItem; big?: boolean }) => (
    <Pressable
      onPress={() => onOpen(item.id)}
      style={({ pressed }) => [styles.row, big && styles.big, { backgroundColor: th.card, borderColor: big ? th.accent : th.border, opacity: pressed ? 0.7 : 1 }]}
    >
      <Text style={big ? styles.emojiBig : styles.emoji}>{item.emoji}</Text>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={[styles.name, { color: th.ink }]}>
          {item.name}
        </Text>
        <Text numberOfLines={2} style={{ color: th.muted, fontSize: 13 }}>
          {item.description}
        </Text>
        <Text numberOfLines={1} style={{ color: th.muted, fontSize: 12, marginTop: 4 }}>
          👁 {item.views}   🔁 {item.remixes}   {catLabel(item.category || "diger")}
          {item.author ? `   · ${t("by", { name: item.author })}` : ""}
        </Text>
      </View>
      <Pressable onPress={() => toggleLike(item)} hitSlop={10} style={styles.like}>
        <Text style={{ fontSize: 22 }}>{item.liked ? "❤️" : "🤍"}</Text>
        <Text style={{ color: th.muted, fontSize: 12 }}>{item.likes ?? 0}</Text>
      </Pressable>
    </Pressable>
  );

  const head = (
    <View>
      {header}
      <TextInput
        value={search}
        onChangeText={onSearch}
        placeholder={t("search")}
        placeholderTextColor={th.muted}
        returnKeyType="search"
        style={[styles.search, { backgroundColor: th.card, borderColor: th.border, color: th.ink }]}
      />
      {top && !query && !category && (
        <View style={{ marginBottom: 14 }}>
          <Text style={[styles.section, { color: th.ink }]}>{t("featured")}</Text>
          <Row item={top} big />
        </View>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
        {["", ...CATEGORY_KEYS].map((c) => (
          <Pressable
            key={c || "all"}
            onPress={() => setCategory(c)}
            style={[styles.chip, { borderColor: th.border, backgroundColor: category === c ? th.accent : th.card }]}
          >
            <Text style={{ color: category === c ? th.accentInk : th.ink, fontWeight: "600" }}>{c ? catLabel(c) : t("cat_all")}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={[styles.tabs, { backgroundColor: th.card, borderColor: th.border }]}>
        {(["popular", "new"] as const).map((s) => (
          <Pressable key={s} onPress={() => setSort(s)} style={[styles.tab, sort === s && { backgroundColor: th.accent }]}>
            <Text style={{ color: sort === s ? th.accentInk : th.ink, fontWeight: "700" }}>{s === "popular" ? t("popular") : t("newest")}</Text>
          </Pressable>
        ))}
      </View>
      {error && (
        <Pressable onPress={() => load(true)}>
          <Text style={{ color: th.danger, marginBottom: 12 }}>
            {error} {t("retry")}
          </Text>
        </Pressable>
      )}
      {!loading && !error && items.length === 0 && <Text style={{ color: th.muted, marginBottom: 12 }}>{t("vitrinEmpty")}</Text>}
    </View>
  );

  return (
    <FlatList
      data={items}
      keyExtractor={(a) => a.id}
      ListHeaderComponent={head}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      refreshControl={
        <RefreshControl
          refreshing={loading && items.length > 0}
          onRefresh={() => {
            load(true);
            fetchFeatured().then(setTop);
          }}
        />
      }
      onEndReached={() => !loading && !done && items.length > 0 && load(false)}
      onEndReachedThreshold={0.5}
      ListFooterComponent={loading && items.length === 0 ? <ActivityIndicator color={th.accent} style={{ marginTop: 24 }} /> : undefined}
      renderItem={({ item }) => <Row item={item} />}
    />
  );
}

const styles = StyleSheet.create({
  search: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, marginBottom: 14 },
  section: { fontSize: 16, fontWeight: "800", marginBottom: 8 },
  chip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
  tabs: { flexDirection: "row", borderRadius: 999, borderWidth: 1, padding: 4, marginBottom: 14 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 999 },
  row: { flexDirection: "row", gap: 12, alignItems: "center", borderRadius: 18, borderWidth: 1, padding: 14, marginBottom: 10 },
  big: { borderWidth: 2, paddingVertical: 18 },
  emoji: { fontSize: 34 },
  emojiBig: { fontSize: 46 },
  name: { fontSize: 16, fontWeight: "700", marginBottom: 2 },
  like: { alignItems: "center", minWidth: 36 },
});

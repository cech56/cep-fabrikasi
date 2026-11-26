import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { getLang, t } from "../i18n";
import { useTheme } from "../theme";
import { MiniApp } from "../types";

type Props = { app: MiniApp | null; onRestore: (index: number) => void; onClose: () => void };

const time = (at: number) => {
  try {
    return new Date(at).toLocaleString(getLang() === "tr" ? "tr-TR" : "en-US", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
};

// Sohbetle geliştir: istekler sohbet balonları gibi; her sürüme tek dokunuşla dönülür.
// history[i].prompt, history[i].html'i değiştiren istektir (en yeni başta).
export function History({ app, onRestore, onClose }: Props) {
  const th = useTheme();
  const h = app?.history ?? [];
  // Eskiden yeniye: [ilk hali] → istek → [sürüm] → istek → ... → [şu anki sürüm]
  const items = [...h].reverse();
  return (
    <Modal visible={!!app} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: th.bg }}>
        <View style={[styles.top, { borderColor: th.border }]}>
          <Text style={[styles.title, { color: th.ink }]}>{t("historyTitle")}</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={{ color: th.accent, fontSize: 16, fontWeight: "700" }}>{t("close")}</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
          {items.length === 0 && <Text style={{ color: th.muted, textAlign: "center", marginTop: 32 }}>{t("historyEmpty")}</Text>}
          {items.map((v, k) => {
            const index = h.length - 1 - k; // history dizisindeki yeri
            return (
              <View key={`${v.at}-${k}`}>
                <View style={[styles.version, { borderColor: th.border, backgroundColor: th.card }]}>
                  <Text style={{ color: th.ink, fontWeight: "700" }}>{k === 0 ? t("historyFirst") : `#${k + 1}`}</Text>
                  <Text style={{ color: th.muted, fontSize: 12, flex: 1, marginLeft: 8 }}>{v.at ? time(v.at) : ""}</Text>
                  <Pressable onPress={() => onRestore(index)} hitSlop={8}>
                    <Text style={{ color: th.accent, fontWeight: "700" }}>{t("historyRestore")}</Text>
                  </Pressable>
                </View>
                <View style={[styles.bubble, { backgroundColor: th.accent }]}>
                  <Text style={{ color: th.accentInk, fontSize: 15 }}>{v.prompt}</Text>
                </View>
                <Text style={[styles.applied, { color: th.muted }]}>{t("historyApplied")}</Text>
              </View>
            );
          })}
          {app && (
            <View style={[styles.version, { borderColor: th.accent, backgroundColor: th.card, borderWidth: 2 }]}>
              <Text style={{ color: th.ink, fontWeight: "800" }}>
                {app.emoji} {t("historyNow")}
              </Text>
              <Text style={{ color: th.muted, fontSize: 12, marginLeft: 8 }}>{time(app.updatedAt)}</Text>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 48, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 20, fontWeight: "800" },
  version: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 14, padding: 12, marginVertical: 6 },
  bubble: { alignSelf: "flex-end", maxWidth: "85%", borderRadius: 18, borderBottomRightRadius: 4, paddingHorizontal: 14, paddingVertical: 10, marginTop: 6 },
  applied: { alignSelf: "flex-end", fontSize: 12, marginTop: 4, marginBottom: 6 },
});

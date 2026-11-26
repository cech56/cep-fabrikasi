import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { t } from "../i18n";
import { useTheme } from "../theme";

type Props = { visible: boolean; onClose: () => void; reason?: string };

const PERKS = t("proReasons").split("||").map((x) => x.split("|"));

// Fabrika Pro aboneliği. Ödeme, mağaza hesabı açılınca (Google Play) bağlanacak.
export function Pro({ visible, onClose, reason }: Props) {
  const th = useTheme();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: th.bg }]}>
          <Text style={[styles.title, { color: th.ink }]}>🏭 Fabrika Pro</Text>
          {reason && <Text style={{ color: th.danger, fontSize: 15, marginBottom: 8 }}>{reason}</Text>}
          {PERKS.map(([e, p]) => (
            <Text key={p} style={{ color: th.ink, fontSize: 16, marginVertical: 6 }}>
              {e}  {p}
            </Text>
          ))}
          <View style={[styles.price, { borderColor: th.accent }]}>
            <Text style={{ color: th.ink, fontSize: 22, fontWeight: "800" }}>{t("proPrice")}</Text>
            <Text style={{ color: th.muted }}>{t("proCancel")}</Text>
          </View>
          <Pressable disabled style={[styles.cta, { backgroundColor: th.accent, opacity: 0.5 }]}>
            <Text style={{ color: th.accentInk, fontSize: 17, fontWeight: "800" }}>{t("proSoon")}</Text>
          </Pressable>
          <Text style={{ color: th.muted, fontSize: 12, textAlign: "center", marginTop: 8 }}>
            {t("proNote")}
          </Text>
          <Pressable onPress={onClose} style={{ alignItems: "center", padding: 14 }}>
            <Text style={{ color: th.accent, fontSize: 16, fontWeight: "600" }}>{t("close")}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 32 },
  title: { fontSize: 26, fontWeight: "800", marginBottom: 12 },
  price: { borderWidth: 2, borderRadius: 16, padding: 14, alignItems: "center", marginTop: 16 },
  cta: { borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 16 },
});

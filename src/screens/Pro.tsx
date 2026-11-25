import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme";

type Props = { visible: boolean; onClose: () => void; reason?: string };

const PERKS = [
  ["♾️", "Sınırsız uygulama üretme ve değiştirme"],
  ["⚡", "Daha güçlü yapay zekâ ile daha kaliteli uygulamalar"],
  ["📌", "Sınırsız ana ekran kısayolu ve vitrinde öne çıkma"],
  ["💛", "Cep Fabrikası'nın gelişmesine destek"],
];

// Fabrika Pro aboneliği. Ödeme, mağaza hesabı açılınca (Google Play) bağlanacak.
export function Pro({ visible, onClose, reason }: Props) {
  const t = useTheme();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: t.bg }]}>
          <Text style={[styles.title, { color: t.ink }]}>🏭 Fabrika Pro</Text>
          {reason && <Text style={{ color: t.danger, fontSize: 15, marginBottom: 8 }}>{reason}</Text>}
          {PERKS.map(([e, p]) => (
            <Text key={p} style={{ color: t.ink, fontSize: 16, marginVertical: 6 }}>
              {e}  {p}
            </Text>
          ))}
          <View style={[styles.price, { borderColor: t.accent }]}>
            <Text style={{ color: t.ink, fontSize: 22, fontWeight: "800" }}>149 TL / ay</Text>
            <Text style={{ color: t.muted }}>İstediğin zaman iptal et</Text>
          </View>
          <Pressable disabled style={[styles.cta, { backgroundColor: t.accent, opacity: 0.5 }]}>
            <Text style={{ color: t.accentInk, fontSize: 17, fontWeight: "800" }}>Çok yakında</Text>
          </Pressable>
          <Text style={{ color: t.muted, fontSize: 12, textAlign: "center", marginTop: 8 }}>
            Deneme sürümünde ödeme alınmıyor. Mağazaya çıkınca abonelik buradan açılacak.
          </Text>
          <Pressable onPress={onClose} style={{ alignItems: "center", padding: 14 }}>
            <Text style={{ color: t.accent, fontSize: 16, fontWeight: "600" }}>Kapat</Text>
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

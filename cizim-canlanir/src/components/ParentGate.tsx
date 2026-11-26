import { useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { C } from "../theme";

// Ebeveyn kapısı: ayarlar, paylaşma ve silme gibi işlemlerden önce basit bir çarpma sorusu.
export function ParentGate({ visible, reason, onPass, onCancel }: { visible: boolean; reason: string; onPass: () => void; onCancel: () => void }) {
  const q = useMemo(() => ({ a: 3 + Math.floor(Math.random() * 7), b: 4 + Math.floor(Math.random() * 6) }), [visible]);
  const [v, setV] = useState("");
  const [wrong, setWrong] = useState(false);
  const check = () => {
    if (Number(v) === q.a * q.b) {
      setV("");
      setWrong(false);
      onPass();
    } else {
      setWrong(true);
      setV("");
    }
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={s.back}>
        <View style={s.card}>
          <Text style={s.title}>Anne / baba onayı</Text>
          <Text style={s.reason}>{reason}</Text>
          <Text style={s.q}>
            {q.a} × {q.b} = ?
          </Text>
          <TextInput
            value={v}
            onChangeText={(t) => setV(t.replace(/[^0-9]/g, ""))}
            keyboardType="number-pad"
            style={s.input}
            maxLength={3}
            autoFocus
            onSubmitEditing={check}
          />
          {wrong && <Text style={s.wrong}>Olmadı, tekrar dene.</Text>}
          <View style={s.row}>
            <Pressable style={[s.btn, s.ghost]} onPress={onCancel}>
              <Text style={s.ghostT}>Vazgeç</Text>
            </Pressable>
            <Pressable style={s.btn} onPress={check}>
              <Text style={s.btnT}>Onayla</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  back: { flex: 1, backgroundColor: "rgba(10,6,25,0.75)", justifyContent: "center", padding: 24 },
  card: { backgroundColor: C.card, borderRadius: 24, padding: 22 },
  title: { color: C.ink, fontSize: 20, fontWeight: "800" },
  reason: { color: C.muted, fontSize: 14, marginTop: 6 },
  q: { color: C.yellow, fontSize: 34, fontWeight: "900", textAlign: "center", marginTop: 18 },
  input: { backgroundColor: C.card2, color: C.ink, fontSize: 28, textAlign: "center", borderRadius: 14, padding: 10, marginTop: 12 },
  wrong: { color: C.pink, textAlign: "center", marginTop: 8 },
  row: { flexDirection: "row", gap: 10, marginTop: 18 },
  btn: { flex: 1, backgroundColor: C.yellow, padding: 14, borderRadius: 14, alignItems: "center" },
  btnT: { color: C.dark, fontWeight: "800", fontSize: 16 },
  ghost: { backgroundColor: "transparent", borderWidth: 1, borderColor: C.card2 },
  ghostT: { color: C.muted, fontWeight: "700", fontSize: 16 },
});

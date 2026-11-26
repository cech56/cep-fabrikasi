import { CameraView } from "expo-camera";
import { useRef } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { t } from "../i18n";

type Props = { visible: boolean; onResult: (data: string | null) => void };

// cep.scanQR: tam ekran kamera, ilk okunan QR/barkodu döndürür.
export function Scanner({ visible, onResult }: Props) {
  const done = useRef(false);
  const finish = (v: string | null) => {
    if (done.current) return;
    done.current = true;
    onResult(v);
  };
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => finish(null)} onShow={() => {
      done.current = false;
    }}>
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        {visible && (
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr", "ean13", "ean8", "code128", "code39", "upc_a", "upc_e", "pdf417", "datamatrix"] }}
            onBarcodeScanned={(r) => finish(r.data)}
          />
        )}
        <View style={styles.frame} pointerEvents="none" />
        <Text style={styles.hint}>{t("scanHint")}</Text>
        <Pressable onPress={() => finish(null)} style={styles.cancel}>
          <Text style={{ color: "#fff", fontSize: 17, fontWeight: "700" }}>{t("cancel")}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  frame: { position: "absolute", top: "30%", left: "15%", width: "70%", aspectRatio: 1, borderWidth: 3, borderColor: "#F97316", borderRadius: 24 },
  hint: { position: "absolute", top: 60, width: "100%", textAlign: "center", color: "#fff", fontSize: 16, fontWeight: "600" },
  cancel: { position: "absolute", bottom: 48, alignSelf: "center", backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 28, paddingVertical: 14, borderRadius: 999 },
});

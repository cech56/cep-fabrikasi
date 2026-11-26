import {
  isARSupportedOnDevice,
  ViroAmbientLight,
  ViroAnimations,
  ViroARPlaneSelector,
  ViroARScene,
  ViroARSceneNavigator,
  ViroImage,
  ViroMaterials,
  ViroNode,
  ViroQuad,
} from "@reactvision/react-viro";
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DEFAULT_LINES } from "../api";
import { pngUri } from "../storage";
import { C } from "../theme";
import { Character } from "../types";

// Gerçek AR (ARCore / ARKit): karakter masanın yüzeyine sabitlenir, etrafında dolaşılabilir.

const U = 0.01; // 1 cm
ViroAnimations.registerAnimations({
  bobUp: { properties: { positionY: `+=${U}` }, duration: 700, easing: "EaseInEaseOut" },
  bobDown: { properties: { positionY: `-=${U}` }, duration: 700, easing: "EaseInEaseOut" },
  idle: [["bobUp", "bobDown"]],
  up: { properties: { positionY: `+=${8 * U}`, scaleY: 1.08 }, duration: 230, easing: "EaseOut" },
  down: { properties: { positionY: `-=${8 * U}`, scaleY: 1 }, duration: 230, easing: "EaseIn" },
  jump: [["up", "down", "up", "down", "up", "down"]],
  spinOnce: { properties: { rotateY: "+=360" }, duration: 800, easing: "Linear" },
  spin: [["spinOnce", "spinOnce", "spinOnce"]],
  tiltL: { properties: { rotateZ: "+=18", positionY: `+=${3 * U}` }, duration: 260, easing: "EaseInEaseOut" },
  tiltR: { properties: { rotateZ: "-=36", positionY: `-=${3 * U}` }, duration: 380, easing: "EaseInEaseOut" },
  tiltBack: { properties: { rotateZ: "+=18" }, duration: 260, easing: "EaseInEaseOut" },
  dance: [["tiltL", "tiltR", "tiltBack", "tiltL", "tiltR", "tiltBack", "up", "down", "tiltL", "tiltR", "tiltBack", "spinOnce", "tiltL", "tiltR", "tiltBack"]],
  goR: { properties: { positionX: `+=${20 * U}` }, duration: 1400, easing: "EaseInEaseOut" },
  goL: { properties: { positionX: `-=${40 * U}` }, duration: 2600, easing: "EaseInEaseOut" },
  goBack: { properties: { positionX: `+=${20 * U}` }, duration: 1400, easing: "EaseInEaseOut" },
  walk: [["goR", "goL", "goBack"]],
});
ViroMaterials.createMaterials({ shadow: { diffuseColor: "rgba(0,0,0,0.35)", lightingModel: "Constant" } });

type AppProps = {
  chars: Character[];
  anim: string;
  placed: boolean;
  onPlaced: () => void;
  onTap: (c: Character) => void;
  onAnimDone: () => void;
};

function ARWorld(props: { sceneNavigator: { viroAppProps: AppProps } }) {
  const p = props.sceneNavigator.viroAppProps;
  const sel = useRef<any>(null);
  const [scale, setScale] = useState(1);
  const base = useRef(1);
  const H = 0.16; // karakter yüksekliği (m)
  return (
    <ViroARScene
      anchorDetectionTypes={["PlanesHorizontal"]}
      onAnchorFound={(a: any) => sel.current?.handleAnchorFound(a)}
      onAnchorUpdated={(a: any) => sel.current?.handleAnchorUpdated(a)}
      onAnchorRemoved={(a: any) => a && sel.current?.handleAnchorRemoved(a)}
    >
      <ViroAmbientLight color="#ffffff" intensity={900} />
      <ViroARPlaneSelector ref={sel} alignment="Horizontal" onPlaneSelected={() => p.onPlaced()}>
        <ViroNode
          scale={[scale, scale, scale]}
          dragType="FixedToPlane"
          onPinch={(state: number, factor: number) => {
            if (state === 1) base.current = scale;
            const s = Math.max(0.4, Math.min(4, base.current * factor));
            setScale(s);
          }}
        >
          {p.chars.map((c, i) => {
            const w = (H * c.w) / Math.max(1, c.h);
            const x = (i - (p.chars.length - 1) / 2) * 0.14;
            return (
              <ViroNode
                key={c.id}
                position={[x, 0, 0]}
                animation={{ name: p.anim, run: p.placed, loop: p.anim === "idle", interruptible: true, onFinish: p.anim === "idle" ? undefined : () => i === 0 && p.onAnimDone() }}
              >
                <ViroQuad position={[0, 0.002, 0]} rotation={[-90, 0, 0]} width={w * 0.9} height={H * 0.25} materials={["shadow"]} />
                <ViroImage
                  source={{ uri: pngUri(c.id) }}
                  width={w}
                  height={H}
                  position={[0, H / 2, 0]}
                  transformBehaviors={["billboardY"]}
                  onClick={() => p.onTap(c)}
                />
              </ViroNode>
            );
          })}
        </ViroNode>
      </ViroARPlaneSelector>
    </ViroARScene>
  );
}

export function ARPlay({ chars, onBack }: { chars: Character[]; onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const [ok, setOk] = useState<null | boolean>(null);
  const [placed, setPlaced] = useState(false);
  const [anim, setAnim] = useState("idle");
  const busy = useRef(false);

  useEffect(() => {
    isARSupportedOnDevice()
      .then((r: any) => setOk(!!(r?.isARSupported ?? r === true)))
      .catch(() => setOk(false));
    return () => void Speech.stop();
  }, []);

  useEffect(() => {
    if (ok === false) {
      Alert.alert("Bu telefon gerçek AR desteklemiyor", "Google Play Hizmetleri (AR) gerekli. Normal sahnede oynamaya devam edebilirsin.", [{ text: "Tamam", onPress: onBack }]);
    }
  }, [ok]);

  const speak = (c: Character, text?: string) => {
    const lines = c.lines.length ? c.lines : DEFAULT_LINES;
    Speech.stop();
    Speech.speak(text ?? lines[Math.floor(Math.random() * lines.length)], { language: "tr-TR", pitch: c.pitch });
  };

  const act = (name: string) => {
    if (!placed || busy.current) return;
    busy.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setAnim(name);
  };

  if (ok !== true) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: "center" }}>
        <ActivityIndicator color={C.yellow} />
      </View>
    );
  }

  const appProps: AppProps = {
    chars,
    anim,
    placed,
    onPlaced: () => {
      setPlaced(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (chars[0]) speak(chars[0], chars[0].greeting);
    },
    onTap: (c) => {
      speak(c);
      act("jump");
    },
    onAnimDone: () => {
      busy.current = false;
      setAnim("idle");
    },
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <ViroARSceneNavigator autofocus initialScene={{ scene: ARWorld as any }} viroAppProps={appProps} style={{ flex: 1 }} />
      <View style={[s.top, { top: insets.top + 8 }]} pointerEvents="box-none">
        <Pressable style={s.round} onPress={onBack}>
          <Text style={s.roundT}>‹</Text>
        </Pressable>
        <View style={s.chip}>
          <Text style={s.chipT}>🪄 Gerçek AR (deneme)</Text>
        </View>
        <View style={{ width: 46 }} />
      </View>
      {!placed ? (
        <View style={[s.help, { bottom: insets.bottom + 30 }]} pointerEvents="none">
          <Text style={s.helpT}>Telefonu masaya doğru tut ve yavaşça sağa sola gezdir.</Text>
          <Text style={s.helpS}>Masanın üstünde renkli bir alan çıkınca ona dokun, karakterin oraya çıksın.</Text>
        </View>
      ) : (
        <View style={[s.bottom, { paddingBottom: insets.bottom + 14 }]}>
          <View style={s.row}>
            {[
              ["🦘", "Zıpla", "jump"],
              ["💃", "Dans", "dance"],
              ["🌀", "Dön", "spin"],
              ["🚶", "Yürü", "walk"],
            ].map(([e, t, a]) => (
              <Pressable key={a} style={s.btn} onPress={() => act(a)}>
                <Text style={{ fontSize: 28 }}>{e}</Text>
                <Text style={s.btnT}>{t}</Text>
              </Pressable>
            ))}
            <Pressable style={s.btn} onPress={() => chars[0] && speak(chars[Math.floor(Math.random() * chars.length)])}>
              <Text style={{ fontSize: 28 }}>💬</Text>
              <Text style={s.btnT}>Konuş</Text>
            </Pressable>
          </View>
          <Text style={s.hint}>Karaktere dokun · Sürükleyip masada gezdir · İki parmakla büyüt</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  top: { position: "absolute", left: 14, right: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  round: { width: 46, height: 46, borderRadius: 23, backgroundColor: "rgba(27,21,48,0.7)", alignItems: "center", justifyContent: "center" },
  roundT: { color: "#fff", fontSize: 30, marginTop: -3 },
  chip: { backgroundColor: "rgba(27,21,48,0.7)", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  chipT: { color: "#fff", fontWeight: "800" },
  help: { position: "absolute", left: 20, right: 20, backgroundColor: "rgba(27,21,48,0.85)", borderRadius: 22, padding: 16 },
  helpT: { color: "#fff", fontSize: 17, fontWeight: "800", textAlign: "center" },
  helpS: { color: C.muted, fontSize: 14, textAlign: "center", marginTop: 6 },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center" },
  row: { flexDirection: "row", gap: 8 },
  btn: { width: 66, height: 74, borderRadius: 20, backgroundColor: "rgba(27,21,48,0.8)", alignItems: "center", justifyContent: "center" },
  btnT: { color: "#fff", fontSize: 12, fontWeight: "700", marginTop: 2 },
  hint: { color: "rgba(255,255,255,0.8)", fontSize: 11, marginTop: 8 },
});

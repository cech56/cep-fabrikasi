import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, BackHandler, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ParentGate } from "./src/components/ParentGate";
import { Home } from "./src/screens/Home";
import { Onboarding } from "./src/screens/Onboarding";
import { Play } from "./src/screens/Play";
import { Settings } from "./src/screens/Settings";
import { deleteAll, deleteChar, loadChars, loadSettings, saveSettings } from "./src/storage";
import { C } from "./src/theme";
import { Character, Settings as S } from "./src/types";

type Screen = { name: "home" } | { name: "settings" } | { name: "play"; chars: Character[]; photo?: string; key: number };

async function toDataUrl(uri: string, width: number) {
  const ctx = ImageManipulator.manipulate(uri);
  if (width > 1100) ctx.resize({ width: 1100 });
  const img = await ctx.renderAsync();
  const out = await img.saveAsync({ base64: true, compress: 0.85, format: SaveFormat.JPEG });
  return "data:image/jpeg;base64," + out.base64;
}

export default function App() {
  const [settings, setSettings] = useState<S | null>(null);
  const [chars, setChars] = useState<Character[]>([]);
  const [screen, setScreen] = useState<Screen>({ name: "home" });
  const [gate, setGate] = useState(false);

  useEffect(() => {
    loadSettings().then(setSettings);
    loadChars().then(setChars);
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (screen.name !== "home") {
        setScreen({ name: "home" });
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [screen.name]);

  const updateSettings = (s: S) => {
    setSettings(s);
    saveSettings(s);
  };

  const capture = async (fromCamera: boolean) => {
    try {
      if (fromCamera) {
        const p = await ImagePicker.requestCameraPermissionsAsync();
        if (!p.granted) {
          Alert.alert("Kamera izni gerekli", "Çizimin fotoğrafını çekebilmek için kamera izni ver.");
          return;
        }
      }
      const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], allowsEditing: true, quality: 0.9 };
      const r = fromCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (r.canceled || !r.assets?.[0]) return;
      const a = r.assets[0];
      const photo = await toDataUrl(a.uri, a.width);
      setScreen({ name: "play", chars: [], photo, key: Date.now() });
    } catch {
      Alert.alert("Fotoğraf açılamadı", "Bir daha dener misin?");
    }
  };

  const openPlay = async (list: Character[]) => {
    // Sahnede kamera için izin (yoksa tahta masa sahnesi açılır)
    await ImagePicker.requestCameraPermissionsAsync().catch(() => null);
    setScreen({ name: "play", chars: list.slice(0, 4), key: Date.now() });
  };

  if (!settings) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: "center" }}>
        <ActivityIndicator color={C.yellow} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {!settings.onboarded ? (
        <Onboarding onDone={(aiConsent) => updateSettings({ onboarded: true, aiConsent })} />
      ) : screen.name === "play" ? (
        <Play
          key={screen.key}
          initial={screen.chars}
          photo={screen.photo}
          settings={settings}
          allChars={chars}
          onCreated={(c) => setChars((l) => [c, ...l])}
          onDelete={async (c) => {
            await deleteChar(c.id);
            setChars((l) => l.filter((x) => x.id !== c.id));
            setScreen({ name: "home" });
          }}
          onRetry={() => {
            setScreen({ name: "home" });
            capture(true);
          }}
          onBack={() => setScreen({ name: "home" })}
        />
      ) : screen.name === "settings" ? (
        <Settings
          settings={settings}
          count={chars.length}
          onChange={updateSettings}
          onDeleteAll={async () => {
            await deleteAll();
            setChars([]);
          }}
          onBack={() => setScreen({ name: "home" })}
        />
      ) : (
        <Home
          chars={chars}
          onScan={() => capture(true)}
          onPick={() => capture(false)}
          onOpen={(c) => openPlay([c])}
          onAll={() => openPlay(chars)}
          onSettings={() => setGate(true)}
        />
      )}
      <ParentGate
        visible={gate}
        reason="Ayarlara girmek için"
        onCancel={() => setGate(false)}
        onPass={() => {
          setGate(false);
          setScreen({ name: "settings" });
        }}
      />
    </SafeAreaProvider>
  );
}

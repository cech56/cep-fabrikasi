// Mini uygulamaların telefon yetenekleri: kamera, fener, titreşim, sensörler.
// Kamera ve adım sayar ilk kullanımda her uygulama için ayrıca onay ister.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Camera } from "expo-camera";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Accelerometer, Magnetometer, Pedometer } from "expo-sensors";
import { Alert, Vibration } from "react-native";
import { setTorch } from "../modules/cep-shortcut";
import { t } from "./i18n";

type Grant = "camera" | "steps";
const grantKey = (appId: string) => `cep/grants/${appId}`;

// Uygulama başına onay: "Su Takibi kamerayı kullanmak istiyor"
export async function askGrant(appId: string, appName: string, what: Grant): Promise<boolean> {
  let grants: Record<string, boolean> = {};
  try {
    grants = JSON.parse((await AsyncStorage.getItem(grantKey(appId))) ?? "{}");
  } catch {}
  if (grants[what]) return true;
  const ok = await new Promise<boolean>((resolve) =>
    Alert.alert(
      t(what === "camera" ? "grantCameraTitle" : "grantStepsTitle", { name: appName }),
      t(what === "camera" ? "grantCameraBody" : "grantStepsBody"),
      [
        { text: t("deny"), style: "cancel", onPress: () => resolve(false) },
        { text: t("allow"), onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  );
  if (ok) {
    grants[what] = true;
    await AsyncStorage.setItem(grantKey(appId), JSON.stringify(grants));
  }
  return ok;
}

export async function ensureCamera(appId: string, appName: string) {
  if (!(await askGrant(appId, appName, "camera"))) throw new Error(t("capDenied"));
  const perm = await Camera.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error(t("capDenied"));
}

export async function takePhoto(appId: string, appName: string): Promise<string | null> {
  await ensureCamera(appId, appName);
  const res = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 });
  if (res.canceled || !res.assets?.[0]) return null;
  const out = await ImageManipulator.manipulateAsync(res.assets[0].uri, [{ resize: { width: 800 } }], {
    compress: 0.6,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });
  return `data:image/jpeg;base64,${out.base64}`;
}

export function vibrate(pattern: unknown) {
  if (Array.isArray(pattern)) {
    const p = pattern.slice(0, 20).map((n) => Math.max(0, Math.min(5000, Number(n) || 0)));
    Vibration.vibrate(p);
  } else Vibration.vibrate(Math.max(10, Math.min(2000, Number(pattern) || 300)));
}

export function torch(on: boolean) {
  try {
    setTorch(on);
  } catch {
    throw new Error(t("capUnsupported"));
  }
}

type Stop = () => void;

// Sensör aboneliği; değerler saniyede en fazla ~5 kez gönderilir.
export async function startSensor(appId: string, appName: string, type: string, emit: (v: unknown) => void): Promise<Stop> {
  if (type === "compass") {
    if (!(await Magnetometer.isAvailableAsync())) throw new Error(t("capUnsupported"));
    Magnetometer.setUpdateInterval(200);
    const sub = Magnetometer.addListener(({ x, y }) => {
      let deg = (Math.atan2(y, x) * 180) / Math.PI;
      deg = (450 - deg) % 360; // kuzey = 0
      emit({ heading: Math.round(deg) });
    });
    return () => sub.remove();
  }
  if (type === "motion") {
    if (!(await Accelerometer.isAvailableAsync())) throw new Error(t("capUnsupported"));
    Accelerometer.setUpdateInterval(200);
    const sub = Accelerometer.addListener(({ x, y, z }) => emit({ x: +x.toFixed(3), y: +y.toFixed(3), z: +z.toFixed(3) }));
    return () => sub.remove();
  }
  if (type === "steps") {
    if (!(await askGrant(appId, appName, "steps"))) throw new Error(t("capDenied"));
    if (!(await Pedometer.isAvailableAsync())) throw new Error(t("capUnsupported"));
    const perm = await Pedometer.requestPermissionsAsync();
    if (!perm.granted) throw new Error(t("capDenied"));
    const sub = Pedometer.watchStepCount((r) => emit({ steps: r.steps }));
    return () => sub.remove();
  }
  throw new Error(`cep.sensor: "${type}"?`);
}

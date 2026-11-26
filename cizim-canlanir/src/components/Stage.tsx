import { forwardRef, useImperativeHandle, useRef, type ComponentType, type RefAttributes } from "react";
import { StyleSheet } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import { STAGE_HTML } from "../stage";

const Web = WebView as unknown as ComponentType<Record<string, unknown> & RefAttributes<WebView>>;

export type StageHandle = { send: (cmd: Record<string, unknown>) => void };

type Props = { onMessage: (msg: any) => void };

export const Stage = forwardRef<StageHandle, Props>(function Stage({ onMessage }, ref) {
  const web = useRef<WebView>(null);
  useImperativeHandle(ref, () => ({
    send: (cmd) => web.current?.injectJavaScript(`window.stage && window.stage.cmd(${JSON.stringify(cmd)}); true;`),
  }));
  return (
    <Web
      ref={web}
      style={styles.web}
      source={{ html: STAGE_HTML, baseUrl: "https://cizim.local/" }}
      originWhitelist={["*"]}
      javaScriptEnabled
      domStorageEnabled
      mediaPlaybackRequiresUserAction={false}
      allowsInlineMediaPlayback
      mediaCapturePermissionGrantType="grant"
      setSupportMultipleWindows={false}
      overScrollMode="never"
      bounces={false}
      scrollEnabled={false}
      androidLayerType="hardware"
      onMessage={(e: WebViewMessageEvent) => {
        try {
          onMessage(JSON.parse(e.nativeEvent.data));
        } catch {}
      }}
    />
  );
});

const styles = StyleSheet.create({ web: { flex: 1, backgroundColor: "#1B1530" } });

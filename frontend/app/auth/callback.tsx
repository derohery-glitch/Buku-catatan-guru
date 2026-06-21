import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { api, setToken } from "@/src/lib/api";
import { useAuth } from "@/src/context/AuthContext";
import { COLORS, RADII, SPACING } from "@/src/lib/theme";

type User = {
  user_id: string;
  email: string;
  name: string;
  picture?: string | null;
  gelar?: "Ustadz" | "Ustadzah" | null;
  reminder_hour: number;
};

function extractSessionId(url: string): string | null {
  if (!url) return null;
  // emergent puts session_id in URL fragment
  const hashIdx = url.indexOf("#");
  if (hashIdx >= 0) {
    const hash = url.slice(hashIdx + 1);
    const m = new URLSearchParams(hash).get("session_id");
    if (m) return m;
  }
  const qIdx = url.indexOf("?");
  if (qIdx >= 0) {
    const q = url.slice(qIdx + 1).split("#")[0];
    const m = new URLSearchParams(q).get("session_id");
    if (m) return m;
  }
  return null;
}

export default function AuthCallback() {
  const router = useRouter();
  const { refreshUser } = useAuth();
  const [status, setStatus] = useState<"working" | "error">("working");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [debugUrl, setDebugUrl] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        let url = "";
        if (Platform.OS === "web" && typeof window !== "undefined") {
          url = window.location.href;
        }
        setDebugUrl(url);
        const sid = extractSessionId(url);
        if (!sid) {
          throw new Error("session_id tidak ditemukan di URL callback");
        }
        // Exchange Emergent session_id → session_token
        const resp = await fetch(
          "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
          { headers: { "X-Session-ID": sid } },
        );
        if (!resp.ok) {
          throw new Error(`Emergent session-data: HTTP ${resp.status}`);
        }
        const data = (await resp.json()) as { session_token: string };
        if (!data.session_token) {
          throw new Error("Respon Emergent tidak berisi session_token");
        }

        // Register session with our backend
        const user = await api<User>("/auth/session", {
          method: "POST",
          body: { session_token: data.session_token },
        });
        await setToken(data.session_token);
        await refreshUser();

        // Clean URL
        if (Platform.OS === "web" && typeof window !== "undefined") {
          window.history.replaceState(null, "", "/");
        }

        // Navigate
        if (user.gelar) {
          router.replace("/(tabs)");
        } else {
          router.replace("/gelar");
        }
      } catch (e: any) {
        console.error("auth callback failed:", e);
        setErrorMsg(e?.message ?? "Gagal memproses login");
        setStatus("error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === "error") {
    return (
      <View style={styles.container} testID="auth-callback-error">
        <Text style={styles.title}>Gagal Masuk</Text>
        <Text style={styles.error}>{errorMsg}</Text>
        {debugUrl ? <Text style={styles.debug} numberOfLines={3}>URL: {debugUrl}</Text> : null}
        <Pressable
          style={styles.btn}
          onPress={() => router.replace("/login")}
          testID="auth-callback-back"
        >
          <Text style={styles.btnText}>Kembali ke Login</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="auth-callback-working">
      <ActivityIndicator size="large" color={COLORS.primary} />
      <Text style={styles.workingText}>Memproses login...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: COLORS.background,
    alignItems: "center", justifyContent: "center",
    padding: SPACING.xl, gap: 16,
  },
  workingText: { color: COLORS.textMuted, fontSize: 14 },
  title: { color: COLORS.textMain, fontWeight: "800", fontSize: 20 },
  error: { color: COLORS.danger, textAlign: "center", fontSize: 14 },
  debug: { color: COLORS.textMuted, fontSize: 10, textAlign: "center" },
  btn: {
    marginTop: 12, backgroundColor: COLORS.primary,
    borderRadius: RADII.pill, paddingHorizontal: 24, paddingVertical: 12,
  },
  btnText: { color: "#fff", fontWeight: "700" },
});

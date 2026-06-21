import { useEffect, useState } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "@/src/context/AuthContext";
import { COLORS, RADII, SPACING, SHADOWS } from "@/src/lib/theme";

export default function Login() {
  const { user, loading, signIn } = useAuth();
  const [signing, setSigning] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace(user.gelar ? "/(tabs)" : "/gelar");
    }
  }, [user, loading, router]);

  const handleSignIn = async () => {
    setSigning(true);
    try {
      await signIn();
    } catch (e) {
      console.warn("sign in error", e);
    } finally {
      setSigning(false);
    }
  };

  return (
    <View style={styles.container} testID="login-screen">
      <View style={styles.heroWrap}>
        <Image
          source={{ uri: "https://images.pexels.com/photos/8357144/pexels-photo-8357144.jpeg" }}
          style={styles.hero}
          resizeMode="cover"
        />
        <View style={styles.heroOverlay} />
      </View>

      <View style={styles.content}>
        <View style={styles.badge}>
          <Ionicons name="moon" size={14} color={COLORS.primary} />
          <Text style={styles.badgeText}>Untuk Asatidz Pondok</Text>
        </View>
        <Text style={styles.title}>Catatan Keuangan{"\n"}Para Asatidz</Text>
        <Text style={styles.subtitle}>
          Catat pemasukan & pengeluaran harian Anda. Sederhana, rapi, dan privat.
        </Text>

        <Pressable
          style={({ pressed }) => [styles.loginBtn, pressed && { opacity: 0.85 }]}
          onPress={handleSignIn}
          disabled={signing}
          testID="google-login-button"
        >
          {signing ? (
            <ActivityIndicator color={COLORS.primary} />
          ) : (
            <>
              <Image
                source={{ uri: "https://www.google.com/favicon.ico" }}
                style={styles.gIcon}
              />
              <Text style={styles.loginText}>Masuk dengan Google</Text>
            </>
          )}
        </Pressable>

        <Text style={styles.footer}>
          Dengan masuk, Anda menyetujui data tersimpan privat dan tidak dibagikan.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  heroWrap: { height: "50%", width: "100%" },
  hero: { width: "100%", height: "100%" },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(74,107,83,0.25)",
  },
  content: {
    flex: 1,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
    justifyContent: "center",
  },
  badge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.secondary,
    borderRadius: RADII.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: SPACING.md,
  },
  badgeText: { color: COLORS.primary, fontSize: 12, fontWeight: "600" },
  title: {
    fontSize: 32,
    fontWeight: "800",
    color: COLORS.textMain,
    letterSpacing: -0.5,
    lineHeight: 38,
  },
  subtitle: {
    marginTop: SPACING.md,
    color: COLORS.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  loginBtn: {
    marginTop: SPACING.xl,
    backgroundColor: COLORS.surface,
    borderRadius: RADII.pill,
    paddingVertical: 16,
    paddingHorizontal: SPACING.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    ...SHADOWS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  gIcon: { width: 20, height: 20 },
  loginText: { color: COLORS.textMain, fontSize: 16, fontWeight: "700" },
  footer: {
    marginTop: SPACING.lg,
    color: COLORS.textMuted,
    textAlign: "center",
    fontSize: 12,
    lineHeight: 18,
  },
});

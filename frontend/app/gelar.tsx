import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "@/src/context/AuthContext";
import { COLORS, RADII, SPACING, SHADOWS } from "@/src/lib/theme";

type Gelar = "Ustadz" | "Ustadzah";

export default function GelarScreen() {
  const { user, loading, setGelar } = useAuth();
  const router = useRouter();
  const [choice, setChoice] = useState<Gelar | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
    if (user?.name) setName(user.name);
  }, [user, loading, router]);

  const handleSave = async () => {
    if (!choice || !name.trim()) return;
    setSaving(true);
    try {
      await setGelar(choice, name.trim());
      router.replace("/(tabs)");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !user) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.inner} testID="gelar-screen">
          <Text style={styles.eyebrow}>Selamat datang</Text>
          <Text style={styles.title}>Bagaimana kami menyapa Anda?</Text>
          <Text style={styles.subtitle}>
            Pilihan ini akan dipakai untuk sapaan di seluruh aplikasi.
          </Text>

          <View style={styles.row}>
            <Pressable
              onPress={() => setChoice("Ustadz")}
              style={[styles.card, choice === "Ustadz" && styles.cardActive]}
              testID="gelar-ustadz"
            >
              <Ionicons
                name="person"
                size={32}
                color={choice === "Ustadz" ? COLORS.primaryFg : COLORS.primary}
              />
              <Text style={[styles.cardLabel, choice === "Ustadz" && styles.cardLabelActive]}>
                Saya Ustadz
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setChoice("Ustadzah")}
              style={[styles.card, choice === "Ustadzah" && styles.cardActive]}
              testID="gelar-ustadzah"
            >
              <Ionicons
                name="person"
                size={32}
                color={choice === "Ustadzah" ? COLORS.primaryFg : COLORS.expense}
              />
              <Text style={[styles.cardLabel, choice === "Ustadzah" && styles.cardLabelActive]}>
                Saya Ustadzah
              </Text>
            </Pressable>
          </View>

          <Text style={styles.label}>Nama yang ingin ditampilkan</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Contoh: Ahmad"
            placeholderTextColor={COLORS.textMuted}
            style={styles.input}
            testID="gelar-name-input"
            returnKeyType="done"
            onSubmitEditing={handleSave}
          />

          <Pressable
            onPress={handleSave}
            disabled={!choice || !name.trim() || saving}
            style={({ pressed }) => [
              styles.primaryBtn,
              (!choice || !name.trim() || saving) && styles.primaryBtnDisabled,
              pressed && { opacity: 0.9 },
            ]}
            testID="gelar-save-button"
          >
            {saving ? (
              <ActivityIndicator color={COLORS.primaryFg} />
            ) : (
              <Text style={styles.primaryBtnText}>Lanjut</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.background },
  scrollContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.lg,
  },
  inner: {
    width: "100%",
    maxWidth: 440,
  },
  eyebrow: { color: COLORS.primary, fontWeight: "700", fontSize: 14, marginBottom: 8 },
  title: { fontSize: 26, fontWeight: "800", color: COLORS.textMain, letterSpacing: -0.5 },
  subtitle: { color: COLORS.textMuted, marginTop: 8, lineHeight: 22 },
  row: { flexDirection: "row", gap: SPACING.md, marginTop: SPACING.xl },
  card: {
    flex: 1,
    height: 150,
    backgroundColor: COLORS.surface,
    borderRadius: RADII.xl,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    ...SHADOWS.card,
  },
  cardActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  cardLabel: { color: COLORS.textMain, fontWeight: "700", fontSize: 16 },
  cardLabelActive: { color: COLORS.primaryFg },
  label: { color: COLORS.textMuted, marginTop: SPACING.lg, marginBottom: 8, fontSize: 13 },
  input: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    padding: 16,
    fontSize: 16,
    color: COLORS.textMain,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  primaryBtn: {
    marginTop: SPACING.lg,
    backgroundColor: COLORS.primary,
    borderRadius: RADII.pill,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: COLORS.primaryFg, fontSize: 16, fontWeight: "700" },
});

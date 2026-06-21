import { useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "@/src/context/AuthContext";
import { COLORS, RADII, SPACING } from "@/src/lib/theme";

export default function ProfileScreen() {
  const { user, signOut, setReminderHour } = useAuth();
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  const handleHourChange = async (delta: number) => {
    setSaving(true);
    try {
      const next = Math.min(23, Math.max(0, (user.reminder_hour ?? 20) + delta));
      await setReminderHour(next);
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    router.replace("/login");
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="profile-screen">
      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: SPACING.xl }}>
        <Text style={styles.title}>Profil</Text>

        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.avatar}>
              {user.picture ? (
                <Image source={{ uri: user.picture }} style={styles.avatarImg} />
              ) : (
                <Ionicons name="person" size={32} color={COLORS.primary} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{user.gelar} {user.name}</Text>
              <Text style={styles.email}>{user.email}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Pengaturan Pengingat</Text>
        <View style={styles.card}>
          <View style={styles.reminderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Jam pengingat harian</Text>
              <Text style={styles.hint}>
                Banner akan muncul jika belum mencatat di hari itu.
              </Text>
            </View>
            <View style={styles.hourPicker}>
              <Pressable
                onPress={() => handleHourChange(-1)}
                style={styles.hourBtn}
                testID="hour-decrease"
                disabled={saving}
              >
                <Ionicons name="remove" size={18} color={COLORS.primary} />
              </Pressable>
              <Text style={styles.hourText} testID="reminder-hour-value">
                {String(user.reminder_hour ?? 20).padStart(2, "0")}:00
              </Text>
              <Pressable
                onPress={() => handleHourChange(1)}
                style={styles.hourBtn}
                testID="hour-increase"
                disabled={saving}
              >
                <Ionicons name="add" size={18} color={COLORS.primary} />
              </Pressable>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Akun</Text>
        <View style={styles.card}>
          <Pressable
            style={styles.itemRow}
            onPress={handleLogout}
            testID="btn-logout"
          >
            <Ionicons name="log-out-outline" size={20} color={COLORS.danger} />
            <Text style={[styles.itemText, { color: COLORS.danger }]}>Keluar</Text>
          </Pressable>
        </View>

        <Text style={styles.footer}>Catatan Keuangan Asatidz • v1.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  title: { fontSize: 22, fontWeight: "800", color: COLORS.textMain, letterSpacing: -0.5, marginBottom: SPACING.md },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.xl,
    padding: SPACING.lg,
    borderWidth: 1, borderColor: COLORS.border,
    marginBottom: SPACING.md,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: COLORS.secondary,
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  avatarImg: { width: 64, height: 64 },
  name: { color: COLORS.textMain, fontWeight: "800", fontSize: 18 },
  email: { color: COLORS.textMuted, marginTop: 4, fontSize: 13 },
  sectionTitle: { color: COLORS.textMuted, fontWeight: "700", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6, marginTop: SPACING.sm, marginBottom: 8 },
  reminderRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  label: { color: COLORS.textMain, fontWeight: "700", fontSize: 14 },
  hint: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  hourPicker: { flexDirection: "row", alignItems: "center", gap: 8 },
  hourBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.secondary, alignItems: "center", justifyContent: "center",
  },
  hourText: { fontSize: 16, fontWeight: "800", color: COLORS.textMain, minWidth: 64, textAlign: "center" },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  itemText: { fontSize: 15, fontWeight: "700" },
  footer: { textAlign: "center", color: COLORS.textMuted, fontSize: 12, marginTop: SPACING.lg },
});

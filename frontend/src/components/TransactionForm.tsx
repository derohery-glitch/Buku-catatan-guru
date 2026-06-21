import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
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

import { api } from "@/src/lib/api";
import { COLORS, RADII, SPACING, SHADOWS } from "@/src/lib/theme";
import { formatRupiah, parseRupiahInput, todayIso } from "@/src/lib/format";
import { categoryIcon } from "@/src/lib/icons";
import { useVoiceRecorder } from "@/src/hooks/useVoiceRecorder";

type Category = { id: string; name: string; type: "income" | "expense"; icon: string; is_default: boolean };
type Tx = {
  id: string;
  type: "income" | "expense";
  amount: number;
  category: string;
  date: string;
  note?: string;
  voice_note_base64?: string | null;
  voice_note_mime?: string | null;
};

type Mode = "new" | "edit";

type Props = {
  mode: Mode;
  initial?: Tx | null;
  draftType?: "income" | "expense";
  draft?: { type: "income" | "expense"; amount: number; category: string; note: string; date: string } | null;
  draftAudio?: { base64: string; mime: string } | null;
};

export default function TransactionForm({ mode, initial, draftType, draft, draftAudio }: Props) {
  const router = useRouter();

  const [type, setType] = useState<"income" | "expense">(
    initial?.type ?? draft?.type ?? draftType ?? "expense",
  );
  const [amount, setAmount] = useState<number>(initial?.amount ?? draft?.amount ?? 0);
  const [category, setCategory] = useState<string>(initial?.category ?? draft?.category ?? "");
  const [date, setDate] = useState<string>(initial?.date ?? draft?.date ?? todayIso());
  const [note, setNote] = useState<string>(initial?.note ?? draft?.note ?? "");
  const [voice, setVoice] = useState<{ base64: string; mime: string } | null>(() => {
    if (draftAudio) return draftAudio;
    if (initial?.voice_note_base64) {
      return { base64: initial.voice_note_base64, mime: initial.voice_note_mime ?? "audio/m4a" };
    }
    return null;
  });

  const [categories, setCategories] = useState<Category[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recorder = useVoiceRecorder();

  useEffect(() => {
    (async () => {
      try {
        const list = await api<Category[]>("/categories");
        setCategories(list);
        if (!category) {
          const first = list.find((c) => c.type === type);
          if (first) setCategory(first.name);
        }
      } catch (e) {
        console.warn(e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (category && !categories.find((c) => c.name === category && c.type === type)) {
      const first = categories.find((c) => c.type === type);
      setCategory(first?.name ?? "");
    }
  }, [type, categories]);

  const handleSave = useCallback(async () => {
    setError(null);
    if (amount <= 0) {
      setError("Jumlah harus lebih dari 0.");
      return;
    }
    if (!category) {
      setError("Pilih kategori dulu.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError("Format tanggal harus YYYY-MM-DD.");
      return;
    }
    setSaving(true);
    try {
      const body = {
        type,
        amount,
        category,
        date,
        note: note.trim(),
        voice_note_base64: voice?.base64 ?? null,
        voice_note_mime: voice?.mime ?? null,
      };
      if (mode === "edit" && initial) {
        await api(`/transactions/${initial.id}`, { method: "PUT", body });
      } else {
        await api("/transactions", { method: "POST", body });
      }
      router.back();
    } catch (e: any) {
      setError(e?.message ?? "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  }, [type, amount, category, date, note, voice, mode, initial, router]);

  const handleDelete = useCallback(async () => {
    if (!initial) return;
    setSaving(true);
    try {
      await api(`/transactions/${initial.id}`, { method: "DELETE" });
      router.back();
    } finally {
      setSaving(false);
    }
  }, [initial, router]);

  const handleRecord = useCallback(async () => {
    if (recorder.isRecording) {
      const result = await recorder.stop();
      if (result) setVoice({ base64: result.base64, mime: result.mime });
    } else {
      await recorder.start();
    }
  }, [recorder]);

  const filteredCats = categories.filter((c) => c.type === type);

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]} testID="transaction-form">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="form-close" style={styles.iconBtn}>
          <Ionicons name="close" size={22} color={COLORS.textMain} />
        </Pressable>
        <Text style={styles.headerTitle}>{mode === "edit" ? "Edit Transaksi" : "Catat Transaksi"}</Text>
        <View style={styles.iconBtn} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 100 }}>
          {/* Type toggle */}
          <View style={styles.toggle}>
            <Pressable
              style={[styles.toggleItem, type === "expense" && { backgroundColor: COLORS.expense }]}
              onPress={() => setType("expense")}
              testID="toggle-expense"
            >
              <Text style={[styles.toggleText, type === "expense" && { color: "#fff" }]}>Pengeluaran</Text>
            </Pressable>
            <Pressable
              style={[styles.toggleItem, type === "income" && { backgroundColor: COLORS.income }]}
              onPress={() => setType("income")}
              testID="toggle-income"
            >
              <Text style={[styles.toggleText, type === "income" && { color: "#fff" }]}>Pemasukan</Text>
            </Pressable>
          </View>

          {/* Amount */}
          <Text style={styles.label}>Jumlah</Text>
          <View style={styles.amountWrap}>
            <Text style={styles.amountPrefix}>Rp</Text>
            <TextInput
              value={amount > 0 ? formatRupiah(amount).replace("Rp ", "") : ""}
              onChangeText={(s) => setAmount(parseRupiahInput(s))}
              placeholder="0"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="number-pad"
              style={styles.amountInput}
              testID="form-amount"
            />
          </View>

          {/* Category */}
          <Text style={styles.label}>Kategori</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
            {filteredCats.map((c) => {
              const active = c.name === category;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => setCategory(c.name)}
                  style={[styles.catChip, active && styles.catChipActive]}
                  testID={`cat-${c.name}`}
                >
                  <Ionicons
                    name={categoryIcon(c.icon)}
                    size={14}
                    color={active ? "#fff" : COLORS.primary}
                  />
                  <Text style={[styles.catText, active && { color: "#fff" }]} numberOfLines={1}>
                    {c.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Date */}
          <Text style={styles.label}>Tanggal</Text>
          <TextInput
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={COLORS.textMuted}
            style={styles.input}
            testID="form-date"
            autoCapitalize="none"
          />

          {/* Note */}
          <Text style={styles.label}>Catatan (opsional)</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Contoh: bayar listrik"
            placeholderTextColor={COLORS.textMuted}
            style={[styles.input, { minHeight: 80 }]}
            multiline
            testID="form-note"
          />

          {/* Voice note */}
          <Text style={styles.label}>Voice Note (opsional)</Text>
          <View style={styles.voiceCard}>
            <Pressable
              onPress={handleRecord}
              style={[styles.voiceBtn, recorder.isRecording && { backgroundColor: COLORS.danger }]}
              testID="form-voice-toggle"
            >
              <Ionicons name={recorder.isRecording ? "stop" : "mic"} size={22} color="#fff" />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={styles.voiceStatus}>
                {recorder.isRecording
                  ? `Merekam… ${(recorder.durationMs / 1000).toFixed(1)}s / 30s`
                  : voice
                  ? "Voice note tersimpan ✓"
                  : "Ketuk mic untuk merekam (maks 30 detik)"}
              </Text>
              {recorder.error ? (
                <Text style={styles.voiceError}>{recorder.error}</Text>
              ) : null}
              {voice && !recorder.isRecording ? (
                <Pressable onPress={() => setVoice(null)} testID="form-voice-clear">
                  <Text style={styles.voiceClear}>Hapus voice note</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {mode === "edit" ? (
            <Pressable
              onPress={handleDelete}
              style={styles.deleteBtn}
              disabled={saving}
              testID="form-delete"
            >
              <Ionicons name="trash" size={16} color={COLORS.danger} />
              <Text style={styles.deleteText}>Hapus Transaksi</Text>
            </Pressable>
          ) : null}
        </ScrollView>

        <View style={styles.bottomBar}>
          <Pressable
            onPress={handleSave}
            disabled={saving}
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            testID="form-save"
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveText}>{mode === "edit" ? "Simpan Perubahan" : "Simpan"}</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 16, fontWeight: "800", color: COLORS.textMain },
  toggle: {
    flexDirection: "row", backgroundColor: COLORS.secondary, padding: 4,
    borderRadius: RADII.pill, gap: 4,
  },
  toggleItem: { flex: 1, paddingVertical: 10, borderRadius: RADII.pill, alignItems: "center" },
  toggleText: { color: COLORS.textMain, fontWeight: "700", fontSize: 13 },
  label: { color: COLORS.textMuted, marginTop: SPACING.lg, marginBottom: 8, fontWeight: "600", fontSize: 13 },
  amountWrap: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: COLORS.surface, borderRadius: RADII.lg, paddingHorizontal: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  amountPrefix: { color: COLORS.textMuted, fontSize: 18, fontWeight: "600" },
  amountInput: { flex: 1, paddingVertical: 14, paddingHorizontal: 10, fontSize: 22, fontWeight: "800", color: COLORS.textMain },
  catRow: { gap: 8, paddingVertical: 4, paddingRight: 8 },
  catChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, height: 36, borderRadius: RADII.pill,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    flexShrink: 0,
  },
  catChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  catText: { color: COLORS.textMain, fontSize: 12, fontWeight: "700", maxWidth: 140 },
  input: {
    backgroundColor: COLORS.surface, borderRadius: RADII.lg,
    padding: 14, fontSize: 15, color: COLORS.textMain,
    borderWidth: 1, borderColor: COLORS.border,
  },
  voiceCard: {
    backgroundColor: COLORS.surface, borderRadius: RADII.lg, padding: 12,
    borderWidth: 1, borderColor: COLORS.border,
    flexDirection: "row", alignItems: "center", gap: 12,
  },
  voiceBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center",
  },
  voiceStatus: { color: COLORS.textMain, fontSize: 13, fontWeight: "600" },
  voiceError: { color: COLORS.danger, fontSize: 12, marginTop: 4 },
  voiceClear: { color: COLORS.danger, fontSize: 12, marginTop: 4, fontWeight: "700" },
  errorText: { color: COLORS.danger, marginTop: 12, fontSize: 13 },
  deleteBtn: {
    marginTop: SPACING.xl, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
  },
  deleteText: { color: COLORS.danger, fontWeight: "700" },
  bottomBar: {
    padding: SPACING.md, backgroundColor: COLORS.background,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  saveBtn: {
    backgroundColor: COLORS.primary, borderRadius: RADII.pill,
    paddingVertical: 16, alignItems: "center", ...SHADOWS.card,
  },
  saveText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});

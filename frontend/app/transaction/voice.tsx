import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/lib/api";
import { COLORS, RADII, SPACING, SHADOWS } from "@/src/lib/theme";
import { formatRupiah, todayIso } from "@/src/lib/format";
import { useVoiceRecorder } from "@/src/hooks/useVoiceRecorder";

type Draft = {
  type: "income" | "expense";
  amount: number;
  category: string;
  note: string;
  date: string;
};

type ParseResp = {
  transcription: string;
  draft: Draft | null;
};

export default function VoiceScreen() {
  const router = useRouter();
  const recorder = useVoiceRecorder();
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<ParseResp | null>(null);
  const [audio, setAudio] = useState<{ base64: string; mime: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleStart = useCallback(async () => {
    setError(null);
    setResult(null);
    await recorder.start();
  }, [recorder]);

  const handleStop = useCallback(async () => {
    const rec = await recorder.stop();
    if (!rec) {
      setError("Rekaman gagal");
      return;
    }
    setAudio({ base64: rec.base64, mime: rec.mime });
    setProcessing(true);
    try {
      const resp = await api<ParseResp>("/voice/parse", {
        method: "POST",
        body: { audio_base64: rec.base64, mime: rec.mime },
      });
      setResult(resp);
    } catch (e: any) {
      setError(e?.message ?? "Gagal memproses suara");
    } finally {
      setProcessing(false);
    }
  }, [recorder]);

  const handleConfirm = useCallback(() => {
    if (!result?.draft) return;
    router.replace({
      pathname: "/transaction/new",
      params: {
        type: result.draft.type,
        draft: JSON.stringify({
          ...result.draft,
          date: result.draft.date || todayIso(),
        }),
        ...(audio ? { audio: audio.base64, audioMime: audio.mime } : {}),
      },
    });
  }, [result, audio, router]);

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]} testID="voice-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="voice-close">
          <Ionicons name="close" size={22} color={COLORS.textMain} />
        </Pressable>
        <Text style={styles.headerTitle}>Catat dengan Suara</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.helperTitle}>Ucapkan transaksi Anda</Text>
        <Text style={styles.helperText}>
          {`Contoh: "Pengeluaran lima puluh ribu untuk makan siang" atau "Dapat honor mengajar satu juta lima ratus ribu".`}
        </Text>

        <View style={styles.recordWrap}>
          <Pressable
            onPress={recorder.isRecording ? handleStop : handleStart}
            disabled={processing}
            style={[
              styles.recordBtn,
              recorder.isRecording && { backgroundColor: COLORS.danger },
              processing && { opacity: 0.5 },
            ]}
            testID="voice-record-btn"
          >
            {processing ? (
              <ActivityIndicator color="#fff" size="large" />
            ) : (
              <Ionicons
                name={recorder.isRecording ? "stop" : "mic"}
                size={48}
                color="#fff"
              />
            )}
          </Pressable>
          <Text style={styles.statusText}>
            {processing
              ? "Memproses..."
              : recorder.isRecording
              ? `Merekam… ${(recorder.durationMs / 1000).toFixed(1)}s / 30s`
              : audio
              ? "Selesai. Ulang untuk merekam baru."
              : "Ketuk untuk mulai"}
          </Text>
          {recorder.error ? <Text style={styles.errorText}>{recorder.error}</Text> : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>

        {result ? (
          <View style={styles.resultCard} testID="voice-result">
            <Text style={styles.label}>Transkrip:</Text>
            <Text style={styles.transcript}>{`"${result.transcription || "(tidak terdeteksi)"}"`}</Text>

            {result.draft ? (
              <>
                <View style={styles.divider} />
                <Text style={styles.label}>Saran Transaksi:</Text>
                <View style={styles.draftRow}>
                  <View style={[styles.badge, { backgroundColor: result.draft.type === "income" ? COLORS.incomeSoft : COLORS.expenseSoft }]}>
                    <Text style={[styles.badgeText, { color: result.draft.type === "income" ? COLORS.income : COLORS.expense }]}>
                      {result.draft.type === "income" ? "Pemasukan" : "Pengeluaran"}
                    </Text>
                  </View>
                  <Text style={styles.amount}>{formatRupiah(result.draft.amount)}</Text>
                </View>
                <Text style={styles.draftLine}>Kategori: <Text style={styles.draftValue}>{result.draft.category}</Text></Text>
                {result.draft.note ? (
                  <Text style={styles.draftLine}>Catatan: <Text style={styles.draftValue}>{result.draft.note}</Text></Text>
                ) : null}

                <Pressable
                  onPress={handleConfirm}
                  style={styles.confirmBtn}
                  testID="voice-confirm"
                >
                  <Text style={styles.confirmText}>Lanjut ke Form Transaksi</Text>
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.errorText}>
                  AI belum bisa memahami transaksi dari rekaman ini. Coba ucapkan lebih jelas atau isi manual.
                </Text>
                <Pressable
                  onPress={() => router.replace({
                    pathname: "/transaction/new",
                    params: audio ? { audio: audio.base64, audioMime: audio.mime, note: result.transcription } as any : {},
                  })}
                  style={styles.confirmBtn}
                  testID="voice-manual"
                >
                  <Text style={styles.confirmText}>Isi Manual</Text>
                </Pressable>
              </>
            )}
          </View>
        ) : null}
      </ScrollView>
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
  body: { padding: SPACING.lg, alignItems: "center" },
  helperTitle: { fontSize: 22, fontWeight: "800", color: COLORS.textMain, textAlign: "center" },
  helperText: { color: COLORS.textMuted, textAlign: "center", marginTop: 8, lineHeight: 22, fontSize: 14 },
  recordWrap: { alignItems: "center", marginTop: SPACING.xl, gap: 12 },
  recordBtn: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: COLORS.primary,
    alignItems: "center", justifyContent: "center",
    ...SHADOWS.card,
  },
  statusText: { color: COLORS.textMain, fontSize: 13, fontWeight: "600", marginTop: 8 },
  errorText: { color: COLORS.danger, fontSize: 12, marginTop: 6, textAlign: "center" },
  resultCard: {
    width: "100%",
    marginTop: SPACING.xl,
    padding: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderRadius: RADII.xl,
    borderWidth: 1, borderColor: COLORS.border,
  },
  label: { color: COLORS.textMuted, fontWeight: "700", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4 },
  transcript: { color: COLORS.textMain, marginTop: 8, fontStyle: "italic", lineHeight: 22, fontSize: 15 },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 14 },
  draftRow: { flexDirection: "row", alignItems: "center", marginTop: 10, gap: 12 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADII.pill },
  badgeText: { fontWeight: "700", fontSize: 11 },
  amount: { fontSize: 22, fontWeight: "800", color: COLORS.textMain },
  draftLine: { color: COLORS.textMain, fontSize: 13, marginTop: 6 },
  draftValue: { fontWeight: "700" },
  confirmBtn: {
    marginTop: SPACING.lg, backgroundColor: COLORS.primary,
    borderRadius: RADII.pill, paddingVertical: 14, paddingHorizontal: 18,
    alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8,
  },
  confirmText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});

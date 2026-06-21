import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api, API_BASE, getToken } from "@/src/lib/api";
import { COLORS, RADII, SPACING } from "@/src/lib/theme";
import { formatRupiah, monthName } from "@/src/lib/format";
import { BarChart } from "@/src/components/BarChart";
import { DonutChart, DonutItem } from "@/src/components/DonutChart";
import { DONUT_COLORS } from "@/src/lib/icons";

type MonthAgg = {
  year: number;
  month: number;
  total_income: number;
  total_expense: number;
  balance: number;
  expense_by_category: { category: string; amount: number }[];
};

type RangeReport = {
  months: MonthAgg[];
  total_income: number;
  total_expense: number;
  balance: number;
  expense_by_category: { category: string; amount: number }[];
  biggest_expense_category: string | null;
};

function defaultRange() {
  const now = new Date();
  const to = { year: now.getFullYear(), month: now.getMonth() + 1 };
  const fromDate = new Date(now);
  fromDate.setMonth(fromDate.getMonth() - 5);
  const from = { year: fromDate.getFullYear(), month: fromDate.getMonth() + 1 };
  return { from, to };
}

export default function ReportsScreen() {
  const [range] = useState(defaultRange());
  const [data, setData] = useState<RangeReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<"excel" | "pdf" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<RangeReport>("/reports/range", {
        query: {
          from_year: range.from.year,
          from_month: range.from.month,
          to_year: range.to.year,
          to_month: range.to.month,
        },
      });
      setData(r);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleExport = async (kind: "excel" | "pdf") => {
    setDownloading(kind);
    try {
      const token = await getToken();
      const qs = new URLSearchParams({
        from_year: String(range.from.year),
        from_month: String(range.from.month),
        to_year: String(range.to.year),
        to_month: String(range.to.month),
      }).toString();
      const url = `${API_BASE}/reports/export/${kind}?${qs}`;

      if (Platform.OS === "web") {
        // Web: fetch with auth, then trigger browser download
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error("download failed");
        const blob = await res.blob();
        const fileUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = fileUrl;
        a.download = `laporan_${range.from.year}-${String(range.from.month).padStart(2, "0")}_to_${range.to.year}-${String(range.to.month).padStart(2, "0")}.${kind === "excel" ? "xlsx" : "pdf"}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(fileUrl);
      } else {
        // Native: fetch -> save -> share
        const FileSystem = await import("expo-file-system");
        const Sharing = await import("expo-sharing");
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error("download failed");
        const blob = await res.blob();
        // Convert blob to base64
        const b64: string = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const r = reader.result as string;
            resolve(r.split(",", 2)[1] ?? "");
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        const ext = kind === "excel" ? "xlsx" : "pdf";
        const filename = `laporan_${range.from.year}-${String(range.from.month).padStart(2, "0")}_to_${range.to.year}-${String(range.to.month).padStart(2, "0")}.${ext}`;
        const fileUri = `${FileSystem.documentDirectory}${filename}`;
        await FileSystem.writeAsStringAsync(fileUri, b64, { encoding: FileSystem.EncodingType.Base64 });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri);
        } else {
          await Linking.openURL(fileUri);
        }
      }
    } catch (e) {
      console.warn("export error", e);
    } finally {
      setDownloading(null);
    }
  };

  const donutData: DonutItem[] = (data?.expense_by_category ?? [])
    .slice(0, 8)
    .map((c, i) => ({ label: c.category, value: c.amount, color: DONUT_COLORS[i % DONUT_COLORS.length] }));

  const barData = (data?.months ?? []).map((m) => ({
    label: monthName(m.month).slice(0, 3),
    income: m.total_income,
    expense: m.total_expense,
  }));

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="reports-screen">
      <ScrollView contentContainerStyle={{ paddingBottom: SPACING.xl }}>
        <View style={styles.header}>
          <Text style={styles.title}>Laporan</Text>
          <Text style={styles.subtitle}>
            {monthName(range.from.month)} {range.from.year} — {monthName(range.to.month)} {range.to.year}
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginTop: 24 }} />
        ) : (
          <>
            <View style={styles.statsRow}>
              <StatCard label="Total Pemasukan" value={formatRupiah(data?.total_income ?? 0)} color={COLORS.income} />
              <StatCard label="Total Pengeluaran" value={formatRupiah(data?.total_expense ?? 0)} color={COLORS.expense} />
            </View>
            <View style={styles.statsRow}>
              <StatCard label="Saldo Akhir" value={formatRupiah(data?.balance ?? 0)} color={COLORS.primary} wide />
            </View>

            {data?.biggest_expense_category ? (
              <View style={styles.infoBox} testID="biggest-cat">
                <Ionicons name="trending-up" size={16} color={COLORS.expense} />
                <Text style={styles.infoText}>
                  Pengeluaran terbesar: <Text style={{ fontWeight: "800" }}>{data.biggest_expense_category}</Text>
                </Text>
              </View>
            ) : null}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Pemasukan vs Pengeluaran</Text>
              <BarChart data={barData} />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Proporsi Pengeluaran</Text>
              <View style={styles.donutRow}>
                <DonutChart
                  data={donutData}
                  centerLabel="Total"
                  centerValue={formatRupiah(data?.total_expense ?? 0)}
                />
                <View style={{ flex: 1, gap: 6, paddingLeft: 12 }}>
                  {donutData.length === 0 ? (
                    <Text style={styles.empty}>Tidak ada pengeluaran</Text>
                  ) : donutData.slice(0, 6).map((d) => (
                    <View key={d.label} style={styles.legendRow}>
                      <View style={[styles.dot, { backgroundColor: d.color }]} />
                      <Text style={styles.legendLabel} numberOfLines={1}>{d.label}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Export Laporan</Text>
              <View style={styles.exportRow}>
                <Pressable
                  style={[styles.exportBtn, { backgroundColor: COLORS.primary }]}
                  onPress={() => handleExport("pdf")}
                  disabled={downloading !== null}
                  testID="btn-export-pdf"
                >
                  {downloading === "pdf" ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="document-text" size={18} color="#fff" />
                      <Text style={styles.exportBtnText}>Export PDF</Text>
                    </>
                  )}
                </Pressable>
                <Pressable
                  style={[styles.exportBtn, { backgroundColor: COLORS.income }]}
                  onPress={() => handleExport("excel")}
                  disabled={downloading !== null}
                  testID="btn-export-excel"
                >
                  {downloading === "excel" ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="grid" size={18} color="#fff" />
                      <Text style={styles.exportBtnText}>Export Excel</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ label, value, color, wide }: { label: string; value: string; color: string; wide?: boolean }) {
  return (
    <View style={[styles.statCard, wide && { flex: 1 }]}>
      <View style={[styles.statBar, { backgroundColor: color }]} />
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md },
  title: { fontSize: 22, fontWeight: "800", color: COLORS.textMain, letterSpacing: -0.5 },
  subtitle: { color: COLORS.textMuted, marginTop: 4, fontSize: 13 },
  statsRow: { flexDirection: "row", gap: 10, paddingHorizontal: SPACING.lg, marginTop: SPACING.md },
  statCard: {
    flex: 1, backgroundColor: COLORS.surface, borderRadius: RADII.lg, padding: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  statBar: { width: 28, height: 4, borderRadius: 2, marginBottom: 8 },
  statLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: "600" },
  statValue: { color: COLORS.textMain, fontSize: 17, fontWeight: "800", marginTop: 4 },
  infoBox: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    backgroundColor: COLORS.warningBg,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: RADII.md,
    flexDirection: "row", alignItems: "center", gap: 8,
  },
  infoText: { color: COLORS.warningText, flex: 1, fontSize: 13 },
  section: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADII.xl,
    padding: SPACING.lg,
    borderWidth: 1, borderColor: COLORS.border,
  },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: COLORS.textMain, marginBottom: 12 },
  donutRow: { flexDirection: "row", alignItems: "center" },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { color: COLORS.textMain, flex: 1, fontSize: 12 },
  empty: { color: COLORS.textMuted, fontSize: 13 },
  exportRow: { flexDirection: "row", gap: 10 },
  exportBtn: {
    flex: 1, borderRadius: RADII.lg, paddingVertical: 14,
    alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8,
  },
  exportBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});

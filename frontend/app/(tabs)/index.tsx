import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "@/src/context/AuthContext";
import { api } from "@/src/lib/api";
import { COLORS, RADII, SPACING, SHADOWS } from "@/src/lib/theme";
import { formatDateID, formatRupiah, monthName } from "@/src/lib/format";
import { DonutChart, DonutItem } from "@/src/components/DonutChart";
import { DONUT_COLORS } from "@/src/lib/icons";

type Tx = {
  id: string;
  type: "income" | "expense";
  amount: number;
  category: string;
  date: string;
  note?: string;
};

type Summary = {
  year: number;
  month: number;
  total_income: number;
  total_expense: number;
  balance: number;
  expense_by_category: { category: string; amount: number }[];
  recent: Tx[];
};

type ReminderStatus = { logged_today: boolean; date: string };

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [reminder, setReminder] = useState<ReminderStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([
        api<Summary>("/reports/summary"),
        api<ReminderStatus>("/reminder/status"),
      ]);
      setSummary(s);
      setReminder(r);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  if (authLoading || !user) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  const sapaan = `Assalamu'alaikum, ${user.gelar ?? ""} ${user.name}`.trim();
  const donutData: DonutItem[] = (summary?.expense_by_category ?? [])
    .slice(0, 8)
    .map((c, i) => ({ label: c.category, value: c.amount, color: DONUT_COLORS[i % DONUT_COLORS.length] }));

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="dashboard-screen">
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.primary} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting} numberOfLines={2}>{sapaan}</Text>
            <Text style={styles.periodText}>
              {monthName((summary?.month ?? new Date().getMonth() + 1))} {summary?.year ?? new Date().getFullYear()}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push("/(tabs)/profile")}
            style={styles.avatar}
            testID="header-profile"
          >
            {user.picture ? (
              <Image source={{ uri: user.picture }} style={styles.avatarImg} />
            ) : (
              <Ionicons name="person" size={20} color={COLORS.primary} />
            )}
          </Pressable>
        </View>

        {/* Reminder banner */}
        {reminder && !reminder.logged_today ? (
          <View style={styles.reminderBanner} testID="reminder-banner">
            <Ionicons name="alarm" size={20} color={COLORS.warningText} />
            <Text style={styles.reminderText}>Sudah catat keuangan hari ini? Yuk catat sekarang.</Text>
          </View>
        ) : null}

        {/* Balance card */}
        <View style={styles.balanceCard} testID="balance-card">
          <Text style={styles.balanceLabel}>Saldo Bulan Ini</Text>
          <Text style={styles.balanceValue}>{formatRupiah(summary?.balance ?? 0)}</Text>
          <View style={styles.balanceRow}>
            <View style={styles.balanceItem}>
              <View style={[styles.dot, { backgroundColor: COLORS.income }]} />
              <View>
                <Text style={styles.balanceItemLabel}>Pemasukan</Text>
                <Text style={styles.balanceItemValue}>{formatRupiah(summary?.total_income ?? 0)}</Text>
              </View>
            </View>
            <View style={styles.balanceItem}>
              <View style={[styles.dot, { backgroundColor: COLORS.expense }]} />
              <View>
                <Text style={styles.balanceItemLabel}>Pengeluaran</Text>
                <Text style={styles.balanceItemValue}>{formatRupiah(summary?.total_expense ?? 0)}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Quick actions */}
        <View style={styles.quickRow}>
          <Pressable
            style={[styles.quickBtn, { backgroundColor: COLORS.income }]}
            onPress={() => router.push({ pathname: "/transaction/new", params: { type: "income" } })}
            testID="btn-tambah-pemasukan"
          >
            <Ionicons name="arrow-down-circle" size={20} color="#fff" />
            <Text style={styles.quickBtnText}>Tambah Pemasukan</Text>
          </Pressable>
          <Pressable
            style={[styles.quickBtn, { backgroundColor: COLORS.expense }]}
            onPress={() => router.push({ pathname: "/transaction/new", params: { type: "expense" } })}
            testID="btn-tambah-pengeluaran"
          >
            <Ionicons name="arrow-up-circle" size={20} color="#fff" />
            <Text style={styles.quickBtnText}>Tambah Pengeluaran</Text>
          </Pressable>
        </View>

        {/* Voice input */}
        <Pressable
          style={styles.voiceBtn}
          onPress={() => router.push("/transaction/voice")}
          testID="btn-voice-input"
        >
          <View style={styles.voiceIcon}>
            <Ionicons name="mic" size={20} color={COLORS.primaryFg} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.voiceTitle}>Catat dengan Suara</Text>
            <Text style={styles.voiceSubtitle}>Ucapkan, AI bantu isi otomatis</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
        </Pressable>

        {/* Donut */}
        <View style={styles.cardSection}>
          <Text style={styles.sectionTitle}>Pengeluaran per Kategori</Text>
          <View style={styles.donutWrap}>
            <DonutChart
              data={donutData}
              centerLabel="Total"
              centerValue={formatRupiah(summary?.total_expense ?? 0)}
            />
            <View style={styles.legend}>
              {donutData.length === 0 ? (
                <Text style={styles.emptyText}>Belum ada pengeluaran bulan ini</Text>
              ) : (
                donutData.slice(0, 5).map((d) => (
                  <View key={d.label} style={styles.legendRow}>
                    <View style={[styles.legendDot, { backgroundColor: d.color }]} />
                    <Text style={styles.legendLabel} numberOfLines={1}>{d.label}</Text>
                    <Text style={styles.legendValue}>{formatRupiah(d.value)}</Text>
                  </View>
                ))
              )}
            </View>
          </View>
        </View>

        {/* Recent */}
        <View style={styles.cardSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Transaksi Terakhir</Text>
            <Pressable onPress={() => router.push("/(tabs)/history")} testID="see-all-link">
              <Text style={styles.linkText}>Lihat semua</Text>
            </Pressable>
          </View>
          {loading ? (
            <ActivityIndicator color={COLORS.primary} style={{ marginTop: 12 }} />
          ) : (summary?.recent ?? []).length === 0 ? (
            <Text style={styles.emptyText}>Belum ada transaksi.</Text>
          ) : (
            <FlatList
              data={(summary?.recent ?? []).slice(0, 6)}
              keyExtractor={(t) => t.id}
              scrollEnabled={false}
              renderItem={({ item }) => <TxRow tx={item} onPress={() => router.push(`/transaction/${item.id}`)} />}
              ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
            />
          )}
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function TxRow({ tx, onPress }: { tx: Tx; onPress?: () => void }) {
  const isIncome = tx.type === "income";
  return (
    <Pressable
      style={styles.txRow}
      onPress={onPress}
      testID={`tx-row-${tx.id}`}
    >
      <View
        style={[
          styles.txIcon,
          { backgroundColor: isIncome ? COLORS.incomeSoft : COLORS.expenseSoft },
        ]}
      >
        <Ionicons
          name={isIncome ? "arrow-down" : "arrow-up"}
          size={18}
          color={isIncome ? COLORS.income : COLORS.expense}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.txTitle} numberOfLines={1}>{tx.category}</Text>
        <Text style={styles.txSub} numberOfLines={1}>
          {formatDateID(tx.date)}
          {tx.note ? `  •  ${tx.note}` : ""}
        </Text>
      </View>
      <Text style={[styles.txAmount, { color: isIncome ? COLORS.income : COLORS.expense }]}>
        {isIncome ? "+" : "−"} {formatRupiah(tx.amount)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.background },
  scroll: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xl },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACING.lg,
    gap: 12,
  },
  greeting: { fontSize: 18, fontWeight: "800", color: COLORS.textMain, letterSpacing: -0.3 },
  periodText: { color: COLORS.textMuted, marginTop: 4, fontSize: 13 },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.secondary,
    alignItems: "center", justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: { width: 44, height: 44 },
  reminderBanner: {
    backgroundColor: COLORS.warningBg,
    borderRadius: RADII.lg,
    padding: 14,
    marginBottom: SPACING.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  reminderText: { color: COLORS.warningText, flex: 1, fontWeight: "600", fontSize: 13 },
  balanceCard: {
    backgroundColor: COLORS.primary,
    borderRadius: RADII.xl,
    padding: SPACING.lg,
    ...SHADOWS.card,
  },
  balanceLabel: { color: "#D8E2DA", fontWeight: "600", fontSize: 13 },
  balanceValue: { color: "#fff", fontSize: 32, fontWeight: "800", marginTop: 6, letterSpacing: -0.5 },
  balanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: SPACING.lg,
    gap: 12,
  },
  balanceItem: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  balanceItemLabel: { color: "#D8E2DA", fontSize: 11, fontWeight: "600" },
  balanceItemValue: { color: "#fff", fontWeight: "700", fontSize: 14, marginTop: 2 },
  quickRow: { flexDirection: "row", gap: 10, marginTop: SPACING.md },
  quickBtn: {
    flex: 1,
    borderRadius: RADII.lg,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minHeight: 64,
  },
  quickBtnText: { color: "#fff", fontWeight: "700", fontSize: 12, textAlign: "center" },
  voiceBtn: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  voiceIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.primary,
    alignItems: "center", justifyContent: "center",
  },
  voiceTitle: { color: COLORS.textMain, fontWeight: "700", fontSize: 14 },
  voiceSubtitle: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  cardSection: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.xl,
    padding: SPACING.lg,
    marginTop: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: COLORS.textMain },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  linkText: { color: COLORS.primary, fontWeight: "600", fontSize: 13 },
  donutWrap: { flexDirection: "row", alignItems: "center", marginTop: 10, gap: 12 },
  legend: { flex: 1, gap: 6 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { color: COLORS.textMain, flex: 1, fontSize: 12 },
  legendValue: { color: COLORS.textMuted, fontSize: 11, fontWeight: "600" },
  emptyText: { color: COLORS.textMuted, fontSize: 13, paddingVertical: 8 },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    gap: 12,
  },
  txIcon: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
  },
  txTitle: { color: COLORS.textMain, fontWeight: "700", fontSize: 14 },
  txSub: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  txAmount: { fontWeight: "800", fontSize: 14 },
});

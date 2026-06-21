import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/lib/api";
import { COLORS, RADII, SPACING } from "@/src/lib/theme";
import { formatDateID, formatRupiah, monthName } from "@/src/lib/format";

type Tx = {
  id: string;
  type: "income" | "expense";
  amount: number;
  category: string;
  date: string;
  note?: string;
};

const NOW = new Date();

export default function HistoryScreen() {
  const router = useRouter();
  const [items, setItems] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(NOW.getFullYear());
  const [month, setMonth] = useState<number | null>(NOW.getMonth() + 1);
  const [typeFilter, setTypeFilter] = useState<"all" | "income" | "expense">("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<Tx[]>("/transactions", {
        query: {
          year,
          month: month ?? undefined,
          type: typeFilter === "all" ? undefined : typeFilter,
          q: search.trim() || undefined,
        },
      });
      setItems(data);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  }, [year, month, typeFilter, search]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="history-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Riwayat Transaksi</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsRow}
        contentContainerStyle={styles.chipsContent}
      >
        <Chip
          label="Semua"
          active={typeFilter === "all"}
          onPress={() => setTypeFilter("all")}
          testID="chip-all"
        />
        <Chip
          label="Pemasukan"
          active={typeFilter === "income"}
          onPress={() => setTypeFilter("income")}
          testID="chip-income"
        />
        <Chip
          label="Pengeluaran"
          active={typeFilter === "expense"}
          onPress={() => setTypeFilter("expense")}
          testID="chip-expense"
        />
        <View style={styles.chipDivider} />
        <Chip
          label={month ? monthName(month) : "Semua Bulan"}
          icon="calendar"
          active={month !== null}
          onPress={() => setMonth(month ? null : NOW.getMonth() + 1)}
          testID="chip-month"
        />
        <Chip
          label={String(year)}
          icon="time"
          onPress={() => setYear(year === NOW.getFullYear() ? NOW.getFullYear() - 1 : NOW.getFullYear())}
          active
          testID="chip-year"
        />
      </ScrollView>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={COLORS.textMuted} />
        <TextInput
          placeholder="Cari catatan/kategori..."
          placeholderTextColor={COLORS.textMuted}
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={load}
          style={styles.searchInput}
          returnKeyType="search"
          testID="history-search"
        />
        {search ? (
          <Pressable onPress={() => { setSearch(""); load(); }} testID="clear-search">
            <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <View style={{ paddingTop: 24 }}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xl }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListEmptyComponent={() => (
            <View style={styles.empty} testID="history-empty">
              <Ionicons name="document-text-outline" size={36} color={COLORS.textMuted} />
              <Text style={styles.emptyText}>Belum ada transaksi pada periode ini.</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/transaction/${item.id}`)}
              style={styles.row}
              testID={`tx-row-${item.id}`}
            >
              <View
                style={[
                  styles.txIcon,
                  {
                    backgroundColor:
                      item.type === "income" ? COLORS.incomeSoft : COLORS.expenseSoft,
                  },
                ]}
              >
                <Ionicons
                  name={item.type === "income" ? "arrow-down" : "arrow-up"}
                  size={18}
                  color={item.type === "income" ? COLORS.income : COLORS.expense}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.txTitle}>{item.category}</Text>
                <Text style={styles.txSub} numberOfLines={1}>
                  {formatDateID(item.date)}
                  {item.note ? `  •  ${item.note}` : ""}
                </Text>
              </View>
              <Text
                style={[
                  styles.txAmount,
                  { color: item.type === "income" ? COLORS.income : COLORS.expense },
                ]}
              >
                {item.type === "income" ? "+" : "−"} {formatRupiah(item.amount)}
              </Text>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function Chip({
  label,
  active,
  onPress,
  icon,
  testID,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
      testID={testID}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={13}
          color={active ? COLORS.primaryFg : COLORS.textMain}
        />
      ) : null}
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: 4 },
  title: { fontSize: 22, fontWeight: "800", color: COLORS.textMain, letterSpacing: -0.5 },
  chipsRow: { maxHeight: 56, marginTop: SPACING.sm },
  chipsContent: {
    paddingHorizontal: SPACING.lg,
    gap: 8,
    alignItems: "center",
    height: 56,
  },
  chipDivider: { width: 1, height: 22, backgroundColor: COLORS.border, marginHorizontal: 4 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: RADII.pill,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexShrink: 0,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { color: COLORS.textMain, fontSize: 12, fontWeight: "700" },
  chipTextActive: { color: COLORS.primaryFg },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    paddingHorizontal: 14,
    marginHorizontal: SPACING.lg,
    marginVertical: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    height: 44,
  },
  searchInput: { flex: 1, color: COLORS.textMain, fontSize: 14 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    padding: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  txIcon: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
  },
  txTitle: { color: COLORS.textMain, fontWeight: "700", fontSize: 14 },
  txSub: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  txAmount: { fontWeight: "800", fontSize: 14 },
  empty: { alignItems: "center", paddingVertical: 48, gap: 8 },
  emptyText: { color: COLORS.textMuted, fontSize: 13 },
});

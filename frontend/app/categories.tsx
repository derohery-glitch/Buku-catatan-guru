import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
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
import { categoryIcon } from "@/src/lib/icons";
import { ICON_OPTIONS } from "@/src/lib/iconOptions";

type Category = { id: string; name: string; type: "income" | "expense"; icon: string; is_default: boolean };

export default function ManageCategoriesScreen() {
  const router = useRouter();
  const [items, setItems] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<"income" | "expense">("expense");
  const [icon, setIcon] = useState<string>("tag");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<Category[]>("/categories");
      setItems(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleAdd = async () => {
    setError(null);
    if (!name.trim()) {
      setError("Nama kategori wajib diisi");
      return;
    }
    setSaving(true);
    try {
      await api("/categories", { method: "POST", body: { name: name.trim(), type, icon } });
      setShowAdd(false);
      setName("");
      setIcon("tag");
      load();
    } catch (e: any) {
      setError(e?.message ?? "Gagal menambah kategori");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (cat: Category) => {
    if (cat.is_default) return;
    try {
      await api(`/categories/${cat.id}`, { method: "DELETE" });
      load();
    } catch (e) {
      console.warn(e);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]} testID="categories-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="cat-back">
          <Ionicons name="chevron-back" size={22} color={COLORS.textMain} />
        </Pressable>
        <Text style={styles.headerTitle}>Kelola Kategori</Text>
        <Pressable onPress={() => setShowAdd(true)} style={styles.iconBtn} testID="cat-add">
          <Ionicons name="add" size={24} color={COLORS.primary} />
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xl }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item }) => (
            <View style={styles.row} testID={`cat-row-${item.name}`}>
              <View
                style={[
                  styles.catIcon,
                  { backgroundColor: item.type === "income" ? COLORS.incomeSoft : COLORS.expenseSoft },
                ]}
              >
                <Ionicons
                  name={categoryIcon(item.icon)}
                  size={18}
                  color={item.type === "income" ? COLORS.income : COLORS.expense}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.catName}>{item.name}</Text>
                <Text style={styles.catSub}>
                  {item.type === "income" ? "Pemasukan" : "Pengeluaran"}
                  {item.is_default ? " · Default" : ""}
                </Text>
              </View>
              {!item.is_default ? (
                <Pressable
                  onPress={() => handleDelete(item)}
                  style={styles.deleteBtn}
                  testID={`cat-delete-${item.name}`}
                >
                  <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
                </Pressable>
              ) : null}
            </View>
          )}
        />
      )}

      <Modal visible={showAdd} animationType="slide" transparent onRequestClose={() => setShowAdd(false)}>
        <View style={styles.modalBg}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View style={styles.modal} testID="cat-modal">
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Kategori Baru</Text>
                <Pressable onPress={() => setShowAdd(false)} testID="cat-modal-close">
                  <Ionicons name="close" size={22} color={COLORS.textMain} />
                </Pressable>
              </View>

              <Text style={styles.label}>Jenis</Text>
              <View style={styles.toggle}>
                <Pressable
                  onPress={() => setType("expense")}
                  style={[styles.toggleItem, type === "expense" && { backgroundColor: COLORS.expense }]}
                  testID="cat-toggle-expense"
                >
                  <Text style={[styles.toggleText, type === "expense" && { color: "#fff" }]}>Pengeluaran</Text>
                </Pressable>
                <Pressable
                  onPress={() => setType("income")}
                  style={[styles.toggleItem, type === "income" && { backgroundColor: COLORS.income }]}
                  testID="cat-toggle-income"
                >
                  <Text style={[styles.toggleText, type === "income" && { color: "#fff" }]}>Pemasukan</Text>
                </Pressable>
              </View>

              <Text style={styles.label}>Nama Kategori</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Contoh: Pulsa, Listrik"
                placeholderTextColor={COLORS.textMuted}
                style={styles.input}
                testID="cat-name-input"
              />

              <Text style={styles.label}>Pilih Ikon</Text>
              <View style={styles.iconGrid}>
                {ICON_OPTIONS.map((opt) => {
                  const active = opt.key === icon;
                  return (
                    <Pressable
                      key={opt.key}
                      onPress={() => setIcon(opt.key)}
                      style={[styles.iconChip, active && styles.iconChipActive]}
                      testID={`icon-${opt.key}`}
                    >
                      <Ionicons
                        name={categoryIcon(opt.key)}
                        size={18}
                        color={active ? "#fff" : COLORS.primary}
                      />
                    </Pressable>
                  );
                })}
              </View>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <Pressable
                onPress={handleAdd}
                disabled={saving}
                style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                testID="cat-save"
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveText}>Simpan</Text>
                )}
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
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
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: COLORS.surface, padding: 12, borderRadius: RADII.lg,
    borderWidth: 1, borderColor: COLORS.border,
  },
  catIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  catName: { color: COLORS.textMain, fontWeight: "700", fontSize: 14 },
  catSub: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  deleteBtn: { padding: 8 },
  modalBg: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end",
  },
  modal: {
    backgroundColor: COLORS.background, padding: SPACING.lg,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: SPACING.md },
  modalTitle: { fontSize: 18, fontWeight: "800", color: COLORS.textMain },
  label: { color: COLORS.textMuted, marginTop: SPACING.md, marginBottom: 8, fontSize: 13, fontWeight: "600" },
  toggle: { flexDirection: "row", backgroundColor: COLORS.secondary, padding: 4, borderRadius: RADII.pill, gap: 4 },
  toggleItem: { flex: 1, paddingVertical: 10, borderRadius: RADII.pill, alignItems: "center" },
  toggleText: { color: COLORS.textMain, fontWeight: "700", fontSize: 13 },
  input: {
    backgroundColor: COLORS.surface, borderRadius: RADII.lg, padding: 14,
    fontSize: 15, color: COLORS.textMain, borderWidth: 1, borderColor: COLORS.border,
  },
  iconGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  iconChip: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    alignItems: "center", justifyContent: "center",
  },
  iconChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  errorText: { color: COLORS.danger, marginTop: 10, fontSize: 13 },
  saveBtn: {
    marginTop: SPACING.lg, backgroundColor: COLORS.primary,
    borderRadius: RADII.pill, paddingVertical: 14, alignItems: "center",
  },
  saveText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});

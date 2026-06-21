import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import TransactionForm from "@/src/components/TransactionForm";
import { api } from "@/src/lib/api";
import { COLORS } from "@/src/lib/theme";

export default function EditTransaction() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tx, setTx] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await api(`/transactions/${id}`);
        setTx(data);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading || !tx) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  return <TransactionForm mode="edit" initial={tx} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.background },
});

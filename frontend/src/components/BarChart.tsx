import React from "react";
import { StyleSheet, Text, View, ScrollView } from "react-native";
import Svg, { Rect, Line, Text as SvgText } from "react-native-svg";

import { COLORS } from "@/src/lib/theme";
import { formatRupiah } from "@/src/lib/format";

type Bucket = { label: string; income: number; expense: number };

type Props = {
  data: Bucket[];
};

export function BarChart({ data }: Props) {
  const barW = 14;
  const groupW = 60;
  const chartHeight = 200;
  const padding = 24;
  const chartWidth = Math.max(data.length * groupW + padding * 2, 320);

  const maxVal = Math.max(1, ...data.flatMap((d) => [d.income, d.expense]));
  const scale = (v: number) => (v / maxVal) * (chartHeight - 40);

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Svg width={chartWidth} height={chartHeight + 24}>
          {/* baseline */}
          <Line
            x1={padding}
            x2={chartWidth - padding}
            y1={chartHeight - 20}
            y2={chartHeight - 20}
            stroke={COLORS.border}
            strokeWidth={1}
          />
          {data.map((d, i) => {
            const groupX = padding + i * groupW;
            const incH = scale(d.income);
            const expH = scale(d.expense);
            const incomeY = chartHeight - 20 - incH;
            const expenseY = chartHeight - 20 - expH;
            return (
              <React.Fragment key={i}>
                <Rect
                  x={groupX + 8}
                  y={incomeY}
                  width={barW}
                  height={incH}
                  fill={COLORS.income}
                  rx={3}
                />
                <Rect
                  x={groupX + 8 + barW + 4}
                  y={expenseY}
                  width={barW}
                  height={expH}
                  fill={COLORS.expense}
                  rx={3}
                />
                <SvgText
                  x={groupX + 8 + barW}
                  y={chartHeight - 4}
                  fill={COLORS.textMuted}
                  fontSize="10"
                  textAnchor="middle"
                >
                  {d.label}
                </SvgText>
              </React.Fragment>
            );
          })}
        </Svg>
      </ScrollView>
      <View style={styles.legend}>
        <LegendDot color={COLORS.income} label="Pemasukan" />
        <LegendDot color={COLORS.expense} label="Pengeluaran" />
      </View>
      <Text style={styles.maxLabel}>Skala maks: {formatRupiah(maxVal)}</Text>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: "row", gap: 16, marginTop: 8, alignItems: "center", paddingHorizontal: 24 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: COLORS.textMuted, fontSize: 12, fontWeight: "600" },
  maxLabel: { color: COLORS.textMuted, fontSize: 11, paddingHorizontal: 24, marginTop: 4 },
});

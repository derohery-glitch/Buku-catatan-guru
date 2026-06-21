import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G } from "react-native-svg";

import { COLORS } from "@/src/lib/theme";

export type DonutItem = { label: string; value: number; color: string };

type Props = {
  data: DonutItem[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
};

export function DonutChart({ data, size = 180, thickness = 22, centerLabel, centerValue }: Props) {
  const radius = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;
  const total = data.reduce((s, d) => s + d.value, 0);

  if (total <= 0) {
    return (
      <View style={[styles.wrap, { width: size, height: size }]}>
        <Svg width={size} height={size}>
          <Circle
            cx={cx}
            cy={cy}
            r={radius}
            stroke={COLORS.secondary}
            strokeWidth={thickness}
            fill="none"
          />
        </Svg>
        <View style={[styles.center, { width: size, height: size }]} pointerEvents="none">
          {centerLabel ? <Text style={styles.centerLabel}>{centerLabel}</Text> : null}
          <Text style={styles.centerValue}>—</Text>
        </View>
      </View>
    );
  }

  let acc = 0;
  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <G rotation="-90" originX={cx} originY={cy}>
          <Circle
            cx={cx}
            cy={cy}
            r={radius}
            stroke={COLORS.secondary}
            strokeWidth={thickness}
            fill="none"
          />
          {data.map((d, i) => {
            const fraction = d.value / total;
            const dash = fraction * circumference;
            const offset = -acc * circumference;
            acc += fraction;
            return (
              <Circle
                key={i}
                cx={cx}
                cy={cy}
                r={radius}
                stroke={d.color}
                strokeWidth={thickness}
                fill="none"
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={offset}
                strokeLinecap="butt"
              />
            );
          })}
        </G>
      </Svg>
      <View style={[styles.center, { width: size, height: size }]} pointerEvents="none">
        {centerLabel ? <Text style={styles.centerLabel}>{centerLabel}</Text> : null}
        {centerValue ? <Text style={styles.centerValue}>{centerValue}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
  center: { position: "absolute", alignItems: "center", justifyContent: "center" },
  centerLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: "600" },
  centerValue: { color: COLORS.textMain, fontSize: 16, fontWeight: "800", marginTop: 2 },
});

import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { Radius, Space, Typography } from "@/constants/design";
import type { RiskCopy } from "@/constants/risk";

interface RiskBadgeProps {
  risk: RiskCopy;
  score?: { value: number; max: number };
  size?: "sm" | "md";
  /** On a coloured hero, show a white pill instead of a tinted one. */
  inverse?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Icon + text label + colour, so risk is never communicated by colour alone. */
export function RiskBadge({ risk, score, size = "md", inverse, style }: RiskBadgeProps) {
  const small = size === "sm";
  const label = score === undefined ? risk.label : `${risk.label} · ${score.value}/${score.max}`;
  return (
    <View
      style={[
        styles.badge,
        small && styles.badgeSmall,
        { backgroundColor: inverse ? "#FFFFFF" : risk.soft, borderColor: inverse ? "#FFFFFF" : risk.border },
        style,
      ]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={
        score === undefined
          ? `Risk: ${risk.label}`
          : `Risk: ${risk.label}, score ${score.value} out of ${score.max}`
      }
    >
      <Ionicons name={risk.icon} size={small ? 14 : 16} color={risk.color} />
      <Text style={[small ? styles.labelSmall : styles.label, { color: risk.color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: Space.xs,
    borderRadius: Radius.pill,
    borderWidth: 1,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs + 2,
  },
  badgeSmall: {
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
  },
  label: {
    ...Typography.label,
  },
  labelSmall: {
    ...Typography.caption,
    fontWeight: "800",
  },
});

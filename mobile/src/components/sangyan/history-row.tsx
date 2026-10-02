import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Palette, Radius } from "@/constants/palette";
import { getRiskCopy, isInconclusive } from "@/constants/risk";
import type { ScanRecord } from "@/services/history-storage";
import { formatDateTime, formatTime } from "@/utils/format-date";

interface HistoryRowProps {
  record: ScanRecord;
  onPress: () => void;
  onDelete?: () => void;
  timeOnly?: boolean;
}

export function HistoryRow({ record, onPress, onDelete, timeOnly }: HistoryRowProps) {
  const unclear = isInconclusive(record.result);
  const risk = getRiskCopy(record.result.risk.level);
  const color = unclear ? Palette.muted : risk.color;
  const soft = unclear ? Palette.background : risk.soft;
  const signalCount = record.result.signals.length;
  const when = timeOnly ? formatTime(record.createdAt) : formatDateTime(record.createdAt);
  const label = unclear ? "Unclear" : risk.label;

  return (
    <View style={styles.row}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label} check from ${when}. ${record.preview}. Open details.`}
        style={({ pressed }) => [styles.main, pressed && { opacity: 0.7 }]}
      >
        <View style={[styles.modeIcon, { backgroundColor: soft }]}>
          <Ionicons
            name={record.mode === "image" ? "image-outline" : "chatbox-ellipses-outline"}
            size={20}
            color={color}
          />
        </View>
        <View style={styles.body}>
          <Text style={styles.preview} numberOfLines={2}>
            {record.preview}
          </Text>
          <View style={styles.metaRow}>
            <Ionicons name="time-outline" size={13} color={Palette.muted} />
            <Text style={styles.meta}>
              {when}
              {!unclear && ` · ${signalCount} warning sign${signalCount === 1 ? "" : "s"}`}
            </Text>
          </View>
        </View>
        <View style={[styles.badge, { backgroundColor: soft }]}>
          <Text style={[styles.badgeLabel, { color }]}>{label}</Text>
          {!unclear && (
            <Text style={[styles.badgeScore, { color }]}>{record.result.risk.score}/10</Text>
          )}
        </View>
      </Pressable>
      {onDelete && (
        <Pressable
          onPress={onDelete}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Delete this check"
          style={({ pressed }) => [styles.delete, pressed && { opacity: 0.5 }]}
        >
          <Ionicons name="trash-outline" size={20} color={Palette.subtle} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  main: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
  },
  modeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
    gap: 4,
  },
  preview: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
    color: Palette.ink,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  meta: {
    fontSize: 12,
    color: Palette.muted,
  },
  badge: {
    alignItems: "center",
    borderRadius: Radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 5,
    minWidth: 68,
  },
  badgeLabel: {
    fontSize: 12,
    fontWeight: "800",
  },
  badgeScore: {
    fontSize: 11,
    fontWeight: "700",
    marginTop: 1,
  },
  delete: {
    paddingLeft: 12,
    paddingVertical: 12,
  },
});

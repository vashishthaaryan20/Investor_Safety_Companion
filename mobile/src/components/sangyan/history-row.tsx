import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, View } from "react-native";

import { Colors, Space } from "@/constants/design";
import { getResultCopy, isInconclusive } from "@/constants/risk";
import type { ScanRecord } from "@/services/history-storage";
import { formatDateTime, formatTime } from "@/utils/format-date";

import { RiskBadge } from "./risk-badge";
import { AppText, IconButton } from "./ui";

interface HistoryRowProps {
  record: ScanRecord;
  onPress: () => void;
  onDelete?: () => void;
  timeOnly?: boolean;
}

export function HistoryRow({ record, onPress, onDelete, timeOnly }: HistoryRowProps) {
  const unclear = isInconclusive(record.result);
  const risk = getResultCopy(record.result);
  const signalCount = record.result.signals.length;
  const when = timeOnly ? formatTime(record.createdAt) : formatDateTime(record.createdAt);
  const signalsText = unclear
    ? "No result"
    : `${signalCount} warning sign${signalCount === 1 ? "" : "s"}`;

  return (
    <View style={styles.row}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${risk.label}${unclear ? "" : `, score ${record.result.risk.score} out of 10`}. ${signalsText}. Checked ${when}. ${record.preview}`}
        accessibilityHint="Opens the full result"
        style={({ pressed }) => [styles.main, pressed && { opacity: 0.7 }]}
      >
        <View style={[styles.modeIcon, { backgroundColor: risk.soft }]}>
          <Ionicons
            name={record.mode === "image" ? "image-outline" : "chatbox-ellipses-outline"}
            size={20}
            color={risk.color}
          />
        </View>
        <View style={styles.body}>
          <AppText variant="bodyStrong" tone="ink" numberOfLines={2}>
            {record.preview}
          </AppText>
          <View style={styles.metaRow}>
            <RiskBadge risk={risk} score={unclear ? undefined : record.result.risk.score} size="sm" />
            <AppText variant="caption" tone="muted">
              {when} · {signalsText}
            </AppText>
          </View>
        </View>
      </Pressable>
      {onDelete && (
        <IconButton
          icon="trash-outline"
          label="Delete this check"
          color={Colors.muted}
          size={20}
          onPress={onDelete}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.xs,
  },
  main: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Space.md,
    paddingVertical: Space.md,
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
    gap: Space.sm,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: Space.sm,
  },
});

import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Palette, Radius } from "@/constants/palette";
import { getCategoryIcon, getSeverityCopy } from "@/constants/risk";
import type { AnalysisSignal } from "@/services/api";

import { Card } from "./ui";

export function RiskMeter({ score, color }: { score: number; color: string }) {
  const filled = Math.max(1, Math.min(10, Math.round(score)));

  return (
    <View
      style={styles.meter}
      accessible
      accessibilityLabel={`Risk score ${filled} out of 10`}
    >
      {Array.from({ length: 10 }, (_, index) => (
        <View
          key={index}
          style={[
            styles.meterSegment,
            { backgroundColor: index < filled ? color : "rgba(15,23,42,0.08)" },
          ]}
        />
      ))}
    </View>
  );
}

export function SignalCard({ signal }: { signal: AnalysisSignal }) {
  const severity = getSeverityCopy(signal.severity);

  return (
    <Card style={[styles.signalCard, { borderLeftColor: severity.color }]}>
      <View style={styles.signalHeader}>
        <View style={[styles.signalIcon, { backgroundColor: severity.soft }]}>
          <Ionicons name={getCategoryIcon(signal.category)} size={20} color={severity.color} />
        </View>
        <Text style={styles.signalTitle}>{signal.title}</Text>
        <View style={[styles.chip, { backgroundColor: severity.soft }]}>
          <Text style={[styles.chipText, { color: severity.color }]}>{severity.label}</Text>
        </View>
      </View>
      <Text style={styles.signalDescription}>{signal.description}</Text>
      {!!signal.evidence?.length && (
        <View style={styles.evidenceRow}>
          <Text style={styles.evidenceLabel}>Found in message:</Text>
          {signal.evidence.map((phrase) => (
            <View key={phrase} style={styles.evidenceChip}>
              <Text style={styles.evidenceText}>“{phrase}”</Text>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function HighlightedText({ text, phrases }: { text: string; phrases: string[] }) {
  const usable = phrases.filter((phrase) => phrase.trim().length > 1);
  if (!usable.length) {
    return <Text style={styles.sourceText}>{text}</Text>;
  }

  const pattern = new RegExp(`(${usable.map(escapeRegExp).join("|")})`, "gi");
  const lowered = usable.map((phrase) => phrase.toLowerCase());
  const parts = text.split(pattern);

  return (
    <Text style={styles.sourceText} selectable>
      {parts.map((part, index) =>
        lowered.includes(part.toLowerCase()) ? (
          <Text key={index} style={styles.highlight}>
            {part}
          </Text>
        ) : (
          part
        )
      )}
    </Text>
  );
}

export function Checklist({
  items,
  checked,
  onToggle,
}: {
  items: string[];
  checked: Set<number>;
  onToggle: (index: number) => void;
}) {
  return (
    <View style={styles.checklist}>
      {items.map((item, index) => {
        const done = checked.has(index);
        return (
          <Pressable
            key={item}
            onPress={() => onToggle(index)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: done }}
            style={({ pressed }) => [
              styles.checkRow,
              done && styles.checkRowDone,
              pressed && { opacity: 0.8 },
            ]}
          >
            <Ionicons
              name={done ? "checkmark-circle" : "ellipse-outline"}
              size={26}
              color={done ? Palette.success : Palette.subtle}
            />
            <Text style={[styles.checkText, done && styles.checkTextDone]}>{item}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  meter: {
    flexDirection: "row",
    gap: 4,
    marginTop: 14,
  },
  meterSegment: {
    flex: 1,
    height: 10,
    borderRadius: 5,
  },
  signalCard: {
    borderLeftWidth: 4,
    gap: 10,
  },
  signalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  signalIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  signalTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: Palette.ink,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "800",
  },
  signalDescription: {
    fontSize: 15,
    lineHeight: 22,
    color: Palette.text,
  },
  evidenceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  evidenceLabel: {
    fontSize: 13,
    color: Palette.muted,
    fontWeight: "600",
  },
  evidenceChip: {
    backgroundColor: "#FEF9C3",
    borderRadius: Radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  evidenceText: {
    fontSize: 13,
    color: "#854D0E",
    fontWeight: "600",
  },
  sourceText: {
    fontSize: 15,
    lineHeight: 24,
    color: Palette.text,
  },
  highlight: {
    backgroundColor: Palette.highlight,
    fontWeight: "700",
    color: Palette.ink,
  },
  checklist: {
    gap: 8,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 12,
    borderRadius: Radius.md,
    backgroundColor: Palette.background,
  },
  checkRowDone: {
    backgroundColor: Palette.successSoft,
  },
  checkText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    color: Palette.text,
  },
  checkTextDone: {
    color: Palette.muted,
  },
});

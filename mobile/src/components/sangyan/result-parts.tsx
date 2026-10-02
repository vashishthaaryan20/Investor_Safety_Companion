import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  getSignalGuidance,
  isLinkSignal,
  type SafetyAction,
} from "@/constants/guidance";
import { getLearnTopic, type LearnTopicId } from "@/constants/learn-content";
import { Palette, Radius } from "@/constants/palette";
import { getCategoryIcon, getSeverityCopy } from "@/constants/risk";
import type { AnalysisSignal } from "@/services/api";

import { BulletList, Card } from "./ui";

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

export function SignalCard({
  signal,
  sourceLabel,
  onLearnMore,
}: {
  signal: AnalysisSignal;
  sourceLabel: string;
  onLearnMore: (topic: LearnTopicId) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const severity = getSeverityCopy(signal.severity);
  const guidance = getSignalGuidance(signal);
  const isLink = isLinkSignal(signal);
  const topic = getLearnTopic(guidance.learnTopic);

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
        <View style={styles.block}>
          <Text style={styles.blockLabel}>
            {isLink ? "Links that raised concern" : `What raised concern in your ${sourceLabel}`}
          </Text>
          <View style={styles.evidenceRow}>
            {signal.evidence.map((phrase) =>
              isLink ? (
                <View key={phrase} style={styles.urlChip}>
                  <Ionicons name="link-outline" size={14} color={Palette.danger} />
                  <Text style={styles.urlText} selectable>
                    {phrase}
                  </Text>
                </View>
              ) : (
                <View key={phrase} style={styles.evidenceChip}>
                  <Text style={styles.evidenceText}>“{phrase}”</Text>
                </View>
              )
            )}
          </View>
        </View>
      )}

      <View style={styles.actionBox}>
        <Ionicons name="hand-right-outline" size={18} color={Palette.brand} />
        <View style={styles.flex}>
          <Text style={styles.blockLabel}>What to do</Text>
          <Text style={styles.actionText}>{guidance.action}</Text>
        </View>
      </View>

      {expanded && (
        <View style={styles.details}>
          <View style={styles.block}>
            <Text style={styles.blockLabel}>Why it matters</Text>
            <Text style={styles.signalDescription}>{guidance.whyItMatters}</Text>
          </View>
          <View style={styles.block}>
            <Text style={styles.blockLabel}>Steps to stay safe</Text>
            <BulletList items={guidance.steps} color={Palette.brand} />
          </View>
          {topic && (
            <Pressable
              onPress={() => onLearnMore(topic.id)}
              accessibilityRole="link"
              style={({ pressed }) => [styles.learnRow, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="school-outline" size={18} color={Palette.brand} />
              <Text style={styles.learnText}>Learn: {topic.title}</Text>
              <Ionicons name="chevron-forward" size={16} color={Palette.brand} />
            </Pressable>
          )}
        </View>
      )}

      <Pressable
        onPress={() => setExpanded((value) => !value)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        style={styles.toggle}
      >
        <Text style={styles.toggleText}>
          {expanded ? "Show less" : "Why it matters & what to do"}
        </Text>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={16}
          color={Palette.brand}
        />
      </Pressable>
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
  items: SafetyAction[];
  checked: Set<number>;
  onToggle: (index: number) => void;
}) {
  return (
    <View style={styles.checklist}>
      {items.map((item, index) => {
        const done = checked.has(index);
        return (
          <Pressable
            key={item.key}
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
            <View style={styles.flex}>
              <Text style={[styles.checkText, done && styles.checkTextDone]}>{item.title}</Text>
              {!!item.detail && <Text style={styles.checkDetail}>{item.detail}</Text>}
            </View>
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
  flex: {
    flex: 1,
  },
  block: {
    gap: 6,
  },
  blockLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: Palette.muted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  evidenceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  urlChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: "100%",
    backgroundColor: Palette.dangerSoft,
    borderRadius: Radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  urlText: {
    flexShrink: 1,
    fontSize: 13,
    color: Palette.danger,
    fontWeight: "600",
    fontFamily: "monospace",
  },
  actionBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: Radius.md,
    backgroundColor: Palette.brandSoft,
  },
  actionText: {
    marginTop: 2,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "700",
    color: Palette.navy,
  },
  details: {
    gap: 14,
    paddingTop: 4,
  },
  learnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Palette.border,
  },
  learnText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: Palette.brand,
  },
  toggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
  },
  toggleText: {
    fontSize: 14,
    fontWeight: "700",
    color: Palette.brand,
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
    fontSize: 15,
    lineHeight: 22,
    color: Palette.text,
  },
  checkDetail: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 19,
    color: Palette.muted,
  },
  checkTextDone: {
    color: Palette.muted,
  },
});

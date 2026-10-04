import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Colors, Radius, Space, ToneColors, Typography } from "@/constants/design";
import {
  getSignalGuidance,
  isLinkSignal,
  type SafetyAction,
} from "@/constants/guidance";
import { getLearnTopic, type LearnTopicId } from "@/constants/learn-content";
import { getCategoryIcon, getSeverityCopy } from "@/constants/risk";
import { submitFeedback, type AnalysisSignal, type FocusReport } from "@/services/api";

import { AppButton, AppText, BulletList, Card, TextLink, type IconName } from "./ui";

export function RiskMeter({ score, color }: { score: { value: number; max: number }; color: string }) {
  const filled = Math.max(1, Math.min(10, Math.round((score.value / score.max) * 10)));

  return (
    <View
      style={styles.meter}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Risk score ${score.value} out of ${score.max}`}
      accessibilityValue={{ min: 0, max: score.max, now: score.value }}
    >
      {Array.from({ length: 10 }, (_, index) => (
        <View
          key={index}
          style={[
            styles.meterSegment,
            { backgroundColor: index < filled ? color : Colors.borderStrong },
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
        <AppText variant="subheading" tone="ink" style={styles.flex} accessibilityRole="header">
          {signal.title}
        </AppText>
        <View
          style={[styles.chip, { backgroundColor: severity.soft }]}
          accessible
          accessibilityLabel={`Severity: ${severity.label}`}
        >
          <Ionicons name={severity.icon} size={13} color={severity.color} />
          <Text style={[styles.chipText, { color: severity.color }]}>{severity.label}</Text>
        </View>
      </View>
      <AppText>{signal.description}</AppText>

      {!!signal.evidence?.length && (
        <View style={styles.block}>
          <AppText variant="overline" tone="muted">
            {isLink ? "Links that raised concern" : `What raised concern in your ${sourceLabel}`}
          </AppText>
          <View style={styles.evidenceRow}>
            {signal.evidence.map((phrase) =>
              isLink ? (
                <View key={phrase} style={styles.urlChip}>
                  <Ionicons name="link-outline" size={14} color={Colors.critical} />
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
        <Ionicons name="hand-right-outline" size={18} color={Colors.secondary} />
        <View style={styles.flex}>
          <AppText variant="overline" tone="brand">
            What to do
          </AppText>
          <AppText variant="bodyStrong" tone="primary">
            {guidance.action}
          </AppText>
        </View>
      </View>

      {expanded && (
        <View style={styles.details}>
          <View style={styles.block}>
            <AppText variant="overline" tone="muted">
              Why it matters
            </AppText>
            <AppText>{guidance.whyItMatters}</AppText>
          </View>
          <View style={styles.block}>
            <AppText variant="overline" tone="muted">
              Steps to stay safe
            </AppText>
            <BulletList items={guidance.steps} />
          </View>
          {topic && (
            <Pressable
              onPress={() => onLearnMore(topic.id)}
              accessibilityRole="button"
              accessibilityLabel={`Learn: ${topic.title}`}
              style={({ pressed }) => [styles.learnRow, pressed && { backgroundColor: Colors.surfaceMuted }]}
            >
              <Ionicons name="school-outline" size={18} color={Colors.secondary} />
              <AppText variant="label" tone="brand" style={styles.flex}>
                Learn: {topic.title}
              </AppText>
              <Ionicons name="chevron-forward" size={16} color={Colors.secondary} />
            </Pressable>
          )}
        </View>
      )}

      <TextLink
        label={expanded ? "Show less" : "Why it matters & what to do"}
        trailingIcon={expanded ? "chevron-up" : "chevron-down"}
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((value) => !value)}
      />
    </Card>
  );
}

function FocusPointList({
  title,
  items,
  icon,
  color,
}: {
  title: string;
  items: string[];
  icon: IconName;
  color: string;
}) {
  return (
    <View style={styles.block}>
      <AppText variant="overline" tone="muted">
        {title}
      </AppText>
      {items.map((item) => (
        <View key={item} style={styles.focusPoint}>
          <Ionicons name={icon} size={18} color={color} style={styles.focusPointIcon} />
          <AppText style={styles.flex}>{item}</AppText>
        </View>
      ))}
    </View>
  );
}

/** Answers the question picked before analysis, keeping found evidence apart from guesses. */
export function FocusReportCard({ report }: { report: FocusReport }) {
  return (
    <Card style={styles.focusCard}>
      <View style={styles.block}>
        <AppText variant="overline" tone="brand">
          You asked
        </AppText>
        <AppText variant="heading">{report.question}</AppText>
      </View>
      <AppText>{report.answer}</AppText>
      {report.detected.length > 0 && (
        <FocusPointList
          title="What we found in it"
          items={report.detected}
          icon="search-outline"
          color={Colors.secondary}
        />
      )}
      {report.uncertain.length > 0 && (
        <FocusPointList
          title="What we can't confirm"
          items={report.uncertain}
          icon="help-circle-outline"
          color={Colors.caution}
        />
      )}
      {report.next_steps.length > 0 && (
        <View style={styles.block}>
          <AppText variant="overline" tone="muted">
            Check these yourself
          </AppText>
          <BulletList items={report.next_steps} />
        </View>
      )}
    </Card>
  );
}

type FeedbackKind = "wrong_verdict" | "report_scam";

/** Lets people flag a wrong verdict or a scam; reports go to a human review queue. */
export function ReportCard({ analysisId, text }: { analysisId: string; text: string }) {
  const [sending, setSending] = useState<FeedbackKind | null>(null);
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState(false);

  const send = async (kind: FeedbackKind) => {
    setSending(kind);
    setFailed(false);
    try {
      await submitFeedback(analysisId, kind, text);
      setSent(true);
    } catch {
      setFailed(true);
    } finally {
      setSending(null);
    }
  };

  if (sent) {
    return (
      <Card style={styles.reportCard}>
        <View style={styles.reportDone} accessible accessibilityLiveRegion="polite">
          <Ionicons name="checkmark-circle" size={22} color={ToneColors.success.fg} />
          <AppText variant="bodyStrong" tone="ink" style={styles.flex}>
            Thanks, your report was sent
          </AppText>
        </View>
        <AppText variant="caption" tone="muted">
          A person will review it. It doesn&apos;t change this result.
        </AppText>
      </Card>
    );
  }

  return (
    <Card style={styles.reportCard}>
      <AppText variant="subheading" accessibilityRole="header">
        Did we get this wrong?
      </AppText>
      <AppText variant="caption" tone="muted">
        Sending a report shares the text we checked with the SANGYAN team for review. Nothing else
        is sent.
      </AppText>
      <View style={styles.reportActions}>
        <AppButton
          label="Wrong result"
          icon="thumbs-down-outline"
          variant="secondary"
          loading={sending === "wrong_verdict"}
          disabled={sending !== null}
          onPress={() => send("wrong_verdict")}
          style={styles.reportButton}
        />
        <AppButton
          label="Report scam"
          icon="flag-outline"
          variant="secondary"
          loading={sending === "report_scam"}
          disabled={sending !== null}
          onPress={() => send("report_scam")}
          style={styles.reportButton}
        />
      </View>
      {failed && (
        <AppText variant="caption" tone="critical" accessibilityLiveRegion="polite">
          Couldn&apos;t send the report. Check your connection and try again.
        </AppText>
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
    return (
      <Text style={styles.sourceText} selectable>
        {text}
      </Text>
    );
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
            accessibilityLabel={item.detail ? `${item.title}. ${item.detail}` : item.title}
            style={({ pressed }) => [
              styles.checkRow,
              done && styles.checkRowDone,
              pressed && { opacity: 0.8 },
            ]}
          >
            <Ionicons
              name={done ? "checkmark-circle" : "ellipse-outline"}
              size={26}
              color={done ? Colors.success : Colors.subtle}
            />
            <View style={styles.flex}>
              <AppText
                tone={done ? "muted" : "default"}
                style={done && styles.checkTextDone}
              >
                {item.title}
              </AppText>
              {!!item.detail && (
                <AppText variant="caption" tone="muted">
                  {item.detail}
                </AppText>
              )}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  reportCard: {
    gap: Space.sm + 2,
  },
  reportDone: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
  },
  reportActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Space.sm + 2,
  },
  reportButton: {
    flexGrow: 1,
    flexBasis: 140,
  },
  flex: {
    flex: 1,
  },
  meter: {
    flexDirection: "row",
    gap: Space.xs,
  },
  meterSegment: {
    flex: 1,
    height: 10,
    borderRadius: 5,
  },
  signalCard: {
    borderLeftWidth: 4,
    gap: Space.md,
  },
  signalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm + 2,
  },
  signalIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.xs,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs,
    borderRadius: Radius.pill,
  },
  chipText: {
    ...Typography.caption,
    fontWeight: "800",
  },
  block: {
    gap: Space.xs + 2,
  },
  focusCard: {
    gap: Space.md,
    borderLeftWidth: 4,
    borderLeftColor: Colors.secondary,
  },
  focusPoint: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Space.sm,
  },
  focusPointIcon: {
    marginTop: 2,
  },
  evidenceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: Space.xs + 2,
  },
  urlChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.xs + 2,
    maxWidth: "100%",
    backgroundColor: Colors.criticalSoft,
    borderRadius: Radius.sm,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
  },
  urlText: {
    ...Typography.mono,
    flexShrink: 1,
    color: Colors.critical,
    fontWeight: "600",
  },
  actionBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Space.sm + 2,
    padding: Space.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.secondarySoft,
  },
  details: {
    gap: Space.md + 2,
    paddingTop: Space.xs,
  },
  learnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
    minHeight: 48,
    paddingHorizontal: Space.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  evidenceChip: {
    backgroundColor: ToneColors.caution.bg,
    borderWidth: 1,
    borderColor: ToneColors.caution.border,
    borderRadius: Radius.sm,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xxs + 1,
  },
  evidenceText: {
    ...Typography.caption,
    color: Colors.caution,
    fontWeight: "600",
  },
  sourceText: {
    ...Typography.body,
    lineHeight: 24,
    color: Colors.text,
  },
  highlight: {
    backgroundColor: Colors.highlight,
    fontWeight: "700",
    color: Colors.background,
  },
  checklist: {
    gap: Space.sm,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Space.md,
    padding: Space.md,
    minHeight: 48,
    borderRadius: Radius.md,
    backgroundColor: Colors.background,
  },
  checkRowDone: {
    backgroundColor: Colors.successSoft,
  },
  checkTextDone: {
    textDecorationLine: "line-through",
  },
});

import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect, Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { AccessibilityInfo, BackHandler, StyleSheet, Text, View } from "react-native";

import { EmergencyBanner, InlineAlert } from "@/components/sangyan/feedback";
import {
  Checklist,
  FocusReportCard,
  HighlightedText,
  ReportCard,
  RiskMeter,
  SignalCard,
} from "@/components/sangyan/result-parts";
import { RiskBadge } from "@/components/sangyan/risk-badge";
import { Screen } from "@/components/sangyan/screen";
import {
  AppButton,
  AppText,
  Card,
  IconBadge,
  IconButton,
  ListRow,
  SectionHeader,
  TextLink,
} from "@/components/sangyan/ui";
import { Colors, Gradients, Radius, Space, ToneColors, Typography } from "@/constants/design";
import { buildReasonSentence, buildSafetyPlan, getRelatedTopics } from "@/constants/guidance";
import { getLearnTopic, type LearnTopicId } from "@/constants/learn-content";
import {
  getClassificationLine,
  getConfidenceCopy,
  getHeadline,
  getModelChecks,
  getLevelCopy,
  getRiskScore,
} from "@/constants/risk";
import { useScan } from "@/state/scan-store";
import { confirmAction } from "@/utils/confirm";
import { formatDateTime } from "@/utils/format-date";
import { openLink } from "@/utils/open-link";

const PREVIEW_CHARS = 320;
const URGENT_LEVELS = new Set(["HIGH_ATTENTION", "ELEVATED"]);

export default function ResultScreen() {
  const router = useRouter();
  const { result, draft, resetDraft, activeRecord, resultSource, deleteScan } = useScan();
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [showFullText, setShowFullText] = useState(false);
  const fromScan = resultSource !== "history";

  const goHome = useCallback(() => router.dismissTo("/"), [router]);

  // A fresh result sits on top of the scan flow; Back should leave it, not reopen "Analyzing".
  useFocusEffect(
    useCallback(() => {
      if (!fromScan) return undefined;
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        goHome();
        return true;
      });
      return () => subscription.remove();
    }, [fromScan, goHome])
  );

  useEffect(() => {
    if (!result || !fromScan) return;
    const copy = getLevelCopy(result);
    const { value, max } = getRiskScore(result);
    AccessibilityInfo.announceForAccessibility(
      `Check complete. ${copy.label}, score ${value} out of ${max}. ${getHeadline(result)}.`
    );
    // Announce once when the result first appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!result) {
    return <Redirect href="/" />;
  }

  const risk = getLevelCopy(result);
  const headline = getHeadline(result);
  const score = getRiskScore(result);
  const confidence = getConfidenceCopy(result);
  const advice = result.recommendation?.message ?? risk.advice;
  const metadata = result.metadata;
  const unavailableChecks = Array.isArray(metadata?.unavailable_checks)
    ? metadata.unavailable_checks.filter((item): item is string => typeof item === "string")
    : [];
  const processingSeconds =
    typeof metadata?.processing_time_ms === "number" ? metadata.processing_time_ms / 1000 : undefined;
  const classificationLine = getClassificationLine(result);
  const modelChecks = getModelChecks(result);
  const sourceText = result.extracted_text?.trim() ?? "";
  const isLong = sourceText.length > PREVIEW_CHARS;
  const visibleText =
    isLong && !showFullText ? `${sourceText.slice(0, PREVIEW_CHARS).trimEnd()}…` : sourceText;
  const evidence = result.signals.flatMap((signal) => signal.evidence ?? []);
  const fromImage = result.analysis_mode === "screenshot_ocr";
  const signalCount = result.signals.length;
  const reasonSentence = buildReasonSentence(result.signals);
  const safetyPlan = buildSafetyPlan(result.signals, result.verification);
  const relatedTopics = getRelatedTopics(result.signals)
    .map((id) => getLearnTopic(id))
    .filter((topic) => topic !== undefined);
  const isUrgent = URGENT_LEVELS.has(result.risk.level);
  // The default "investment" answer is already the hero and signal list below.
  const focusReport =
    result.focus_report && result.focus_report.focus !== "investment" ? result.focus_report : null;

  const openTopic = (topic: LearnTopicId) => {
    router.push({ pathname: "/learn/[topic]", params: { topic } });
  };

  const openEmergency = () => router.push("/emergency");

  const toggleStep = (index: number) => {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const scanAgain = () => {
    resetDraft(activeRecord?.mode ?? draft.mode);
    router.dismissTo("/scan");
  };

  const confirmDelete = async () => {
    if (!activeRecord) return;
    const recordId = activeRecord.id;
    const confirmed = await confirmAction({
      title: "Delete this check?",
      message: "It will be removed from your history on this phone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!confirmed) return;
    if (fromScan) {
      goHome();
    } else {
      router.back();
    }
    deleteScan(recordId);
  };

  const footer = (
    <View style={styles.footerRow}>
      <AppButton
        label="Home"
        icon="home-outline"
        variant="secondary"
        onPress={goHome}
        style={styles.footerHome}
      />
      <AppButton label="New check" icon="refresh" onPress={scanAgain} style={styles.flex} />
    </View>
  );

  return (
    <Screen footer={footer}>
      <Stack.Screen
        options={{
          title: fromScan ? "Your result" : "Saved result",
          headerBackVisible: !fromScan,
          headerLeft: fromScan
            ? () => <IconButton icon="close" label="Close result and go home" onPress={goHome} size={26} />
            : undefined,
          headerRight: activeRecord
            ? () => <IconButton icon="trash-outline" label="Delete this check" onPress={confirmDelete} />
            : undefined,
        }}
      />

      <View style={styles.heroGroup}>
        {activeRecord && (
          <View style={styles.savedRow}>
            <Ionicons
              name={fromScan ? "bookmark-outline" : "time-outline"}
              size={15}
              color={Colors.muted}
            />
            <AppText variant="caption" tone="muted" style={styles.flex}>
              {fromScan
                ? "Saved to your history on this phone"
                : `Checked ${formatDateTime(activeRecord.createdAt)}`}
              {activeRecord.mode === "image" ? " · Screenshot" : " · Message"}
            </AppText>
          </View>
        )}

        <View style={[styles.hero, { backgroundColor: risk.soft, borderColor: risk.border }]}>
          <View
            style={styles.heroTop}
            accessible
            accessibilityRole="header"
            accessibilityLabel={`${risk.label}, score ${score.value} out of ${score.max}. ${headline}.`}
          >
            <IconBadge icon={risk.icon} color={Colors.background} background={risk.color} size={52} />
            <View style={styles.heroTitles}>
              <RiskBadge risk={risk} score={score} inverse />
              <AppText variant="title">{headline}</AppText>
              {!!classificationLine && (
                <AppText variant="caption" tone="muted">
                  {classificationLine}
                </AppText>
              )}
            </View>
          </View>
          <View style={styles.meterBlock}>
            <RiskMeter score={score} color={risk.color} />
            <View style={styles.meterLegend} importantForAccessibility="no-hide-descendants">
              <AppText variant="caption" tone="muted">
                Low
              </AppText>
              <AppText variant="caption" tone="muted">
                Risk score {score.value}/{score.max}
              </AppText>
              <AppText variant="caption" tone="muted">
                High
              </AppText>
            </View>
          </View>
          {confidence && (
            <View
              style={styles.confidenceRow}
              accessible
              accessibilityLabel={`Reading confidence ${confidence.percent} percent, ${confidence.label}. ${confidence.note}`}
            >
              <Ionicons name="eye-outline" size={18} color={Colors.muted} style={styles.confidenceIcon} />
              <View style={styles.flex}>
                <AppText variant="label" tone="ink">
                  Reading confidence: {confidence.percent}% · {confidence.label}
                </AppText>
                <AppText variant="caption" tone="muted">
                  {confidence.note}
                </AppText>
              </View>
            </View>
          )}
          <View style={[styles.adviceBox, { borderColor: risk.border }]} accessible accessibilityRole="alert">
            <Ionicons name="hand-left-outline" size={20} color={risk.color} />
            <AppText variant="bodyStrong" style={[styles.flex, { color: risk.color }]}>
              {advice}
            </AppText>
          </View>
          {!!reasonSentence && (
            <View style={styles.reasonBox}>
              <AppText variant="overline" tone="muted">
                Why this rating
              </AppText>
              <AppText tone="ink" style={styles.semibold}>
                We rated this <Text style={styles.bold}>“{risk.label}”</Text> because it{" "}
                {reasonSentence}.
              </AppText>
            </View>
          )}
          <AppText>{result.explanation}</AppText>
        </View>

        {isUrgent && <EmergencyBanner onPress={openEmergency} />}
      </View>

      {focusReport && <FocusReportCard report={focusReport} />}

      <View>
        <SectionHeader
          icon="flag-outline"
          title={signalCount ? "Why this is risky" : "What we checked"}
          subtitle={
            signalCount
              ? `${signalCount} warning sign${signalCount > 1 ? "s" : ""} in this ${fromImage ? "screenshot" : "message"}. Each card shows what we found and what to do.`
              : undefined
          }
        />
        {signalCount ? (
          <View style={styles.signals}>
            {result.signals.map((signal) => (
              <SignalCard
                key={signal.id ?? signal.title}
                signal={signal}
                sourceLabel={fromImage ? "screenshot" : "message"}
                onLearnMore={openTopic}
              />
            ))}
          </View>
        ) : (
          <InlineAlert
            tone="success"
            icon="checkmark-done-circle-outline"
            title="No common scam signs found"
            message="We didn't find any of the warning signs we check for. Scammers keep changing their tricks, so still verify before you pay or invest."
          />
        )}
      </View>

      {!!sourceText && (
        <View>
          <SectionHeader
            icon="document-text-outline"
            title="Where we found it"
            subtitle={
              evidence.length
                ? "The highlighted words are what triggered the warnings."
                : `This is the text we ${fromImage ? "read from your screenshot" : "checked"}.`
            }
          />
          <Card style={styles.cardGap}>
            <AppText variant="overline" tone="muted">
              {fromImage ? "Text read from your screenshot" : "Your message"}
            </AppText>
            <HighlightedText text={visibleText} phrases={evidence} />
            {isLong && (
              <TextLink
                label={showFullText ? "Show less" : "Show full text"}
                trailingIcon={showFullText ? "chevron-up" : "chevron-down"}
                accessibilityState={{ expanded: showFullText }}
                onPress={() => setShowFullText((value) => !value)}
              />
            )}
          </Card>
        </View>
      )}

      {!!result.detected_urls.length && (
        <Card variant="tinted" tone="critical" style={styles.cardGap}>
          <View style={styles.linksHeader}>
            <Ionicons name="link-outline" size={20} color={Colors.critical} />
            <AppText variant="bodyStrong" tone="critical" style={styles.flex}>
              Links found. Do not open them.
            </AppText>
          </View>
          {result.detected_urls.map((url) => (
            <Text key={url} style={styles.url} selectable>
              {url}
            </Text>
          ))}
        </Card>
      )}

      <View>
        <SectionHeader
          icon="checkbox-outline"
          title="What to do now"
          subtitle={
            signalCount
              ? "Your safety plan for this message, most important first. Tick each step as you go."
              : "Tick each step as you go."
          }
        />
        <Card style={styles.cardGap}>
          <View
            style={styles.progressRow}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={`${checked.size} of ${safetyPlan.length} steps done`}
            accessibilityValue={{ min: 0, max: safetyPlan.length, now: checked.size }}
          >
            <AppText variant="label" tone="muted">
              {checked.size} of {safetyPlan.length} done
            </AppText>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${(checked.size / Math.max(1, safetyPlan.length)) * 100}%` },
                ]}
              />
            </View>
          </View>
          <Checklist items={safetyPlan} checked={checked} onToggle={toggleStep} />
        </Card>
      </View>

      <View style={styles.helpCard}>
        <AppText variant="subheading" tone="inverse" accessibilityRole="header">
          Already paid or shared your details?
        </AppText>
        <AppText variant="caption" tone="inverseMuted">
          Act fast. The first few hours matter most. Call 1930, then follow our step-by-step
          emergency guide to block payments and protect your accounts.
        </AppText>
        <View style={styles.helpActions}>
          <AppButton
            label="Call 1930"
            icon="call-outline"
            variant="inverse"
            accessibilityHint="Calls the national cyber fraud helpline"
            onPress={() => openLink("tel:1930", "Cyber fraud helpline")}
            style={styles.helpButton}
          />
          <AppButton
            label="Emergency steps"
            icon="medkit-outline"
            variant="inverseSecondary"
            onPress={openEmergency}
            style={styles.helpButton}
          />
        </View>
      </View>

      {relatedTopics.length > 0 && (
        <View>
          <SectionHeader
            icon="school-outline"
            title="Learn more"
            subtitle="Understand the tricks behind these warning signs."
          />
          <Card style={styles.topicsCard}>
            {relatedTopics.map((topic, index) => (
              <ListRow
                key={topic.id}
                icon={topic.icon}
                label={topic.title}
                description={topic.summary}
                divider={index > 0}
                onPress={() => openTopic(topic.id)}
              />
            ))}
          </Card>
        </View>
      )}

      {!!result.analysis_id && <ReportCard analysisId={result.analysis_id} text={sourceText} />}

      {(processingSeconds !== undefined || unavailableChecks.length > 0 || modelChecks.length > 0) && (
        <Card style={styles.cardGap}>
          <SectionHeader icon="information-circle-outline" title="About this check" />
          {processingSeconds !== undefined && (
            <AppText variant="caption" tone="muted">
              Checked in {processingSeconds < 1 ? "under a second" : `${processingSeconds.toFixed(1)} seconds`}
              {metadata?.engine_version ? ` · Engine ${metadata.engine_version}` : ""}
            </AppText>
          )}
          {modelChecks.map((check) => (
            <AppText key={check.label} variant="caption" tone="muted">
              {check.label}: {check.value}
            </AppText>
          ))}
          {unavailableChecks.length > 0 && (
            <AppText variant="caption" tone="muted">
              Not available for this check: {unavailableChecks.join(", ")}. The result is based on the
              checks that did run.
            </AppText>
          )}
        </Card>
      )}

      <AppText variant="caption" tone="muted" align="center">
        This check looks for common warning signs and can make mistakes. It is not investment
        advice and never tells you to buy, sell, or hold anything.
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  bold: {
    fontWeight: "800",
  },
  semibold: {
    fontWeight: "600",
  },
  cardGap: {
    gap: Space.md,
  },
  heroGroup: {
    gap: Space.md,
  },
  savedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.xs + 2,
  },
  hero: {
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    padding: Space.xl,
    gap: Space.lg,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md + 2,
  },
  heroTitles: {
    flex: 1,
    gap: Space.xs + 2,
  },
  meterBlock: {
    gap: Space.xs + 2,
  },
  meterLegend: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  confidenceRow: {
    flexDirection: "row",
    gap: Space.sm,
  },
  confidenceIcon: {
    marginTop: 2,
  },
  adviceBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm + 2,
    padding: Space.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    backgroundColor: Colors.glass,
  },
  reasonBox: {
    gap: Space.xs,
  },
  signals: {
    gap: Space.md,
  },
  linksHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
  },
  url: {
    ...Typography.mono,
    color: Colors.text,
  },
  progressRow: {
    gap: Space.sm,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.surfaceMuted,
    overflow: "hidden",
  },
  progressFill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: ToneColors.success.fg,
  },
  helpCard: {
    gap: Space.sm + 2,
    padding: Space.lg,
    borderRadius: Radius.lg,
    backgroundColor: Colors.primary,
    experimental_backgroundImage: Gradients.hero,
  },
  helpActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Space.sm + 2,
    marginTop: Space.xs,
  },
  helpButton: {
    flexGrow: 1,
    flexBasis: 140,
  },
  topicsCard: {
    paddingVertical: Space.xs,
  },
  footerRow: {
    flexDirection: "row",
    gap: Space.sm + 2,
  },
  footerHome: {
    paddingHorizontal: Space.xl,
  },
});

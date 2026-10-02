import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect, Stack, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  Checklist,
  HighlightedText,
  RiskMeter,
  SignalCard,
} from "@/components/sangyan/result-parts";
import { AppButton, Card, IconBadge, SectionHeader } from "@/components/sangyan/ui";
import { buildReasonSentence, buildSafetyPlan, getRelatedTopics } from "@/constants/guidance";
import { getLearnTopic, type LearnTopicId } from "@/constants/learn-content";
import { Palette, Radius } from "@/constants/palette";
import { getRiskCopy } from "@/constants/risk";
import { useScan } from "@/state/scan-store";
import { formatDateTime } from "@/utils/format-date";

const PREVIEW_CHARS = 320;
const URGENT_LEVELS = new Set(["HIGH_ATTENTION", "ELEVATED"]);

export default function ResultScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { result, draft, resetDraft, activeRecord, resultSource, deleteScan } = useScan();
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [showFullText, setShowFullText] = useState(false);

  if (!result) {
    return <Redirect href="/" />;
  }

  const risk = getRiskCopy(result.risk.level);
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

  const confirmDelete = () => {
    if (!activeRecord) return;
    const recordId = activeRecord.id;
    Alert.alert("Delete this check?", "It will be removed from your history on this phone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          if (resultSource === "history") {
            router.back();
          } else {
            router.dismissTo("/");
          }
          deleteScan(recordId);
        },
      },
    ]);
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: resultSource === "history" ? "Saved result" : "Your result",
          headerBackVisible: resultSource === "history",
          headerRight: activeRecord
            ? () => (
                <Pressable
                  onPress={confirmDelete}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Delete this check"
                >
                  <Ionicons name="trash-outline" size={22} color={Palette.navy} />
                </Pressable>
              )
            : undefined,
        }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        {activeRecord && (
          <View style={styles.savedRow}>
            <Ionicons
              name={resultSource === "history" ? "time-outline" : "bookmark-outline"}
              size={15}
              color={Palette.muted}
            />
            <Text style={styles.savedText}>
              {resultSource === "history"
                ? `Checked ${formatDateTime(activeRecord.createdAt)}`
                : "Saved to your history on this phone"}
              {activeRecord.mode === "image" ? " · Screenshot" : " · Message"}
            </Text>
          </View>
        )}
        <View
          style={[styles.hero, { backgroundColor: risk.soft, borderColor: risk.color }]}
          accessible
          accessibilityLabel={`${risk.label}. ${risk.headline}. ${risk.advice}`}
        >
          <View style={styles.heroTop}>
            <IconBadge icon={risk.icon} color="#FFFFFF" background={risk.color} size={52} />
            <View style={styles.heroTitles}>
              <Text style={[styles.heroLabel, { color: risk.color }]}>{risk.label}</Text>
              <Text style={styles.heroHeadline}>{risk.headline}</Text>
            </View>
          </View>
          <RiskMeter score={result.risk.score} color={risk.color} />
          <View style={styles.meterLegend}>
            <Text style={styles.meterLegendText}>Low</Text>
            <Text style={styles.meterLegendText}>Risk score {result.risk.score}/10</Text>
            <Text style={styles.meterLegendText}>High</Text>
          </View>
          <View style={[styles.adviceBox, { borderColor: risk.color }]}>
            <Ionicons name="hand-left-outline" size={20} color={risk.color} />
            <Text style={[styles.adviceText, { color: risk.color }]}>{risk.advice}</Text>
          </View>
          {!!reasonSentence && (
            <View style={styles.reasonBox}>
              <Text style={styles.reasonLabel}>Why this rating</Text>
              <Text style={styles.reasonText}>
                We rated this <Text style={styles.reasonStrong}>“{risk.label}”</Text> because it{" "}
                {reasonSentence}.
              </Text>
            </View>
          )}
          <Text style={styles.explanation}>{result.explanation}</Text>
        </View>

        {isUrgent && (
          <Pressable
            onPress={openEmergency}
            accessibilityRole="button"
            style={({ pressed }) => [styles.urgentStrip, pressed && { opacity: 0.85 }]}
          >
            <Ionicons name="medkit-outline" size={22} color={Palette.danger} />
            <View style={styles.flex}>
              <Text style={styles.urgentTitle}>Already paid or shared your OTP?</Text>
              <Text style={styles.urgentText}>See what to do right now</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Palette.danger} />
          </Pressable>
        )}

        <View>
          <SectionHeader
            icon="flag-outline"
            title="Why this is risky"
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
            <Card style={styles.noSignals}>
              <Ionicons name="checkmark-done-circle-outline" size={28} color={Palette.success} />
              <Text style={styles.noSignalsText}>
                We didn&apos;t find any of the common scam signs we check for. Scammers keep
                changing their tricks, so still verify before you pay or invest.
              </Text>
            </Card>
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
            <Card style={styles.evidenceCard}>
              <Text style={styles.evidenceLabel}>
                {fromImage ? "Text read from your screenshot" : "Your message"}
              </Text>
              <HighlightedText text={visibleText} phrases={evidence} />
              {isLong && (
                <Pressable onPress={() => setShowFullText((value) => !value)} hitSlop={8}>
                  <Text style={styles.link}>{showFullText ? "Show less" : "Show full text"}</Text>
                </Pressable>
              )}
            </Card>
          </View>
        )}

        {!!result.detected_urls.length && (
          <Card style={styles.linksCard}>
            <View style={styles.linksHeader}>
              <Ionicons name="link-outline" size={20} color={Palette.danger} />
              <Text style={styles.linksTitle}>Links found. Do not open them.</Text>
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
          <Card style={styles.checklistCard}>
            <View style={styles.progressRow}>
              <Text style={styles.progressText}>
                {checked.size} of {safetyPlan.length} done
              </Text>
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

        <Card style={styles.helpCard}>
          <Text style={styles.helpTitle}>Already paid or shared your details?</Text>
          <Text style={styles.helpText}>
            Act fast. The first few hours matter most. Call 1930, then follow our step-by-step
            emergency guide to block payments and protect your accounts.
          </Text>
          <View style={styles.helpActions}>
            <AppButton
              label="Call 1930"
              icon="call-outline"
              onPress={() => Linking.openURL("tel:1930")}
              style={styles.flex}
            />
            <AppButton
              label="Emergency steps"
              icon="medkit-outline"
              variant="secondary"
              onPress={openEmergency}
              style={styles.flex}
            />
          </View>
        </Card>

        {relatedTopics.length > 0 && (
          <View>
            <SectionHeader
              icon="school-outline"
              title="Learn more"
              subtitle="Understand the tricks behind these warning signs."
            />
            <Card style={styles.topicsCard}>
              {relatedTopics.map((topic, index) => (
                <Pressable
                  key={topic.id}
                  onPress={() => openTopic(topic.id)}
                  accessibilityRole="link"
                  style={({ pressed }) => [
                    styles.topicRow,
                    index > 0 && styles.topicDivider,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Ionicons name={topic.icon} size={22} color={Palette.brand} />
                  <View style={styles.flex}>
                    <Text style={styles.topicTitle}>{topic.title}</Text>
                    <Text style={styles.topicSummary}>{topic.summary}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Palette.subtle} />
                </Pressable>
              ))}
            </Card>
          </View>
        )}

        <Text style={styles.disclaimer}>
          This check looks for common warning signs and can make mistakes. It is not investment
          advice and never tells you to buy, sell, or hold anything.
        </Text>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
        <AppButton
          label="Home"
          icon="home-outline"
          variant="secondary"
          onPress={() => router.dismissTo("/")}
          style={styles.footerHome}
        />
        <AppButton label="Scan again" icon="refresh" onPress={scanAgain} style={styles.flex} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Palette.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 28,
    gap: 26,
  },
  flex: {
    flex: 1,
  },
  savedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: -12,
  },
  savedText: {
    fontSize: 13,
    color: Palette.muted,
    fontWeight: "600",
  },
  hero: {
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    padding: 20,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  heroTitles: {
    flex: 1,
  },
  heroLabel: {
    fontSize: 14,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  heroHeadline: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "800",
    color: Palette.ink,
    marginTop: 2,
  },
  meterLegend: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  meterLegendText: {
    fontSize: 12,
    color: Palette.muted,
    fontWeight: "600",
  },
  adviceBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 16,
    padding: 12,
    borderRadius: Radius.md,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.7)",
  },
  adviceText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
  },
  reasonBox: {
    marginTop: 14,
    gap: 4,
  },
  reasonLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: Palette.muted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  reasonText: {
    fontSize: 15,
    lineHeight: 23,
    color: Palette.ink,
    fontWeight: "600",
  },
  reasonStrong: {
    fontWeight: "800",
  },
  explanation: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 23,
    color: Palette.text,
  },
  urgentStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: Palette.dangerSoft,
    marginTop: -10,
  },
  urgentTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: Palette.danger,
  },
  urgentText: {
    fontSize: 13,
    color: Palette.text,
    marginTop: 2,
  },
  topicsCard: {
    paddingVertical: 4,
  },
  topicRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
  },
  topicDivider: {
    borderTopWidth: 1,
    borderTopColor: Palette.border,
  },
  topicTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: Palette.ink,
  },
  topicSummary: {
    fontSize: 13,
    lineHeight: 18,
    color: Palette.muted,
    marginTop: 2,
  },
  signals: {
    gap: 12,
  },
  noSignals: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  noSignalsText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    color: Palette.text,
  },
  evidenceCard: {
    gap: 10,
  },
  evidenceLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: Palette.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  link: {
    fontSize: 14,
    fontWeight: "700",
    color: Palette.brand,
  },
  linksCard: {
    gap: 8,
    backgroundColor: Palette.dangerSoft,
  },
  linksHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  linksTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: Palette.danger,
  },
  url: {
    fontSize: 14,
    color: Palette.text,
    fontFamily: "monospace",
  },
  checklistCard: {
    gap: 14,
  },
  progressRow: {
    gap: 8,
  },
  progressText: {
    fontSize: 13,
    fontWeight: "700",
    color: Palette.muted,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Palette.background,
    overflow: "hidden",
  },
  progressFill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Palette.success,
  },
  helpCard: {
    gap: 10,
    backgroundColor: Palette.navy,
  },
  helpTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  helpText: {
    fontSize: 14,
    lineHeight: 21,
    color: "#CBD5E1",
  },
  helpActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  disclaimer: {
    fontSize: 12,
    lineHeight: 18,
    color: Palette.subtle,
    textAlign: "center",
  },
  footer: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: Palette.background,
    borderTopWidth: 1,
    borderTopColor: Palette.border,
  },
  footerHome: {
    paddingHorizontal: 22,
  },
});

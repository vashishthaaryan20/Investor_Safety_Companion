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
import { Palette, Radius } from "@/constants/palette";
import { getRiskCopy } from "@/constants/risk";
import { useScan } from "@/state/scan-store";
import { formatDateTime } from "@/utils/format-date";

const PREVIEW_CHARS = 320;

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
          <Text style={styles.explanation}>{result.explanation}</Text>
        </View>

        <View>
          <SectionHeader
            icon="flag-outline"
            title="Warning signs we found"
            subtitle={
              signalCount
                ? `${signalCount} warning sign${signalCount > 1 ? "s" : ""} in this ${fromImage ? "screenshot" : "message"}.`
                : undefined
            }
          />
          {signalCount ? (
            <View style={styles.signals}>
              {result.signals.map((signal) => (
                <SignalCard key={signal.title} signal={signal} />
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
              title="Why we flagged this"
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
            title="Before you do anything"
            subtitle="Tick each step as you go."
          />
          <Card style={styles.checklistCard}>
            <View style={styles.progressRow}>
              <Text style={styles.progressText}>
                {checked.size} of {result.verification.length} done
              </Text>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${(checked.size / Math.max(1, result.verification.length)) * 100}%`,
                    },
                  ]}
                />
              </View>
            </View>
            <Checklist items={result.verification} checked={checked} onToggle={toggleStep} />
          </Card>
        </View>

        <Card style={styles.helpCard}>
          <Text style={styles.helpTitle}>Already paid or shared your details?</Text>
          <Text style={styles.helpText}>
            Act quickly. Call your bank to block the payment, then report the fraud.
          </Text>
          <View style={styles.helpActions}>
            <AppButton
              label="Call 1930"
              icon="call-outline"
              onPress={() => Linking.openURL("tel:1930")}
              style={styles.flex}
            />
            <AppButton
              label="Report online"
              icon="open-outline"
              variant="secondary"
              onPress={() => Linking.openURL("https://cybercrime.gov.in/")}
              style={styles.flex}
            />
          </View>
        </Card>

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
  explanation: {
    marginTop: 14,
    fontSize: 15,
    lineHeight: 23,
    color: Palette.text,
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

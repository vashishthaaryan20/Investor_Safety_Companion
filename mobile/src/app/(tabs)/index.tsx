import Ionicons from "@expo/vector-icons/Ionicons";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HistoryRow } from "@/components/sangyan/history-row";
import { AppButton, Card, SectionHeader } from "@/components/sangyan/ui";
import { Palette, Radius } from "@/constants/palette";
import { isInconclusive } from "@/constants/risk";
import { BottomTabInset } from "@/constants/theme";
import { useScan, type ScanMode, type ScanRecord } from "@/state/scan-store";

const RECENT_LIMIT = 3;

const HOW_IT_WORKS = [
  { icon: "image-outline", text: "Share a screenshot or paste a message" },
  { icon: "search-outline", text: "We look for common scam signs" },
  { icon: "list-outline", text: "You get clear steps to stay safe" },
] as const;

const SCAM_SIGNS = [
  {
    icon: "trending-up",
    title: "Guaranteed returns",
    text: "\"Double your money in 7 days\"",
    topic: "common-scams",
  },
  {
    icon: "phone-portrait-outline",
    title: "Fake trading apps",
    text: "\"Pay 10% tax to withdraw profit\"",
    topic: "fake-trading-platforms",
  },
  {
    icon: "git-network-outline",
    title: "Pay to recruit",
    text: "\"Add 5 members, earn level income\"",
    topic: "ponzi-pyramid",
  },
  {
    icon: "ribbon-outline",
    title: "Fake approvals",
    text: "\"SEBI approved scheme\"",
    topic: "fake-sebi-registration",
  },
  {
    icon: "key-outline",
    title: "Asks for OTP",
    text: "\"Share OTP to confirm your seat\"",
    topic: "phishing-impersonation",
  },
] as const;

const TILE_STEPS = [
  "Swipe down twice from the top of the screen",
  "Tap the pencil (Edit) button",
  "Drag the “Scan for scam” tile into your tiles",
];

function QuickCaptureCard({ onOpen }: { onOpen: () => void }) {
  const [showSetup, setShowSetup] = useState(false);
  const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

  return (
    <Card style={styles.quickCard}>
      <View style={styles.quickHeader}>
        <View style={styles.quickIcon}>
          <Ionicons name="flash" size={22} color={Palette.brand} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.quickTitle}>Quick Capture</Text>
          <Text style={styles.quickText}>
            {Platform.OS === "android"
              ? "Check a screenshot straight from Quick Settings or by long-pressing the app icon."
              : "Pick a screenshot and check it in two taps."}
          </Text>
        </View>
      </View>
      <View style={styles.quickActions}>
        <AppButton
          label="Open Quick Capture"
          icon="flash-outline"
          variant="secondary"
          onPress={onOpen}
          style={styles.flex}
        />
      </View>
      {Platform.OS === "android" && (
        <>
          <Pressable
            onPress={() => setShowSetup((value) => !value)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityState={{ expanded: showSetup }}
            style={styles.quickToggle}
          >
            <Text style={styles.seeAll}>
              {showSetup ? "Hide setup" : "Add the Quick Settings tile"}
            </Text>
            <Ionicons
              name={showSetup ? "chevron-up" : "chevron-down"}
              size={16}
              color={Palette.brand}
            />
          </Pressable>
          {showSetup && (
            <View style={styles.quickSetup}>
              {TILE_STEPS.map((step, index) => (
                <View key={step} style={styles.quickStep}>
                  <Text style={styles.quickStepNumber}>{index + 1}</Text>
                  <Text style={styles.quickStepText}>{step}</Text>
                </View>
              ))}
              <Text style={styles.quickNote}>
                {inExpoGo
                  ? "The tile and app shortcuts appear only in the installed SANGYAN Shield app, not in Expo Go."
                  : "You can also long-press the SANGYAN Shield icon and choose “Scan screenshot”."}
              </Text>
            </View>
          )}
        </>
      )}
    </Card>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { history, resetDraft, showResult } = useScan();
  const recent = history.slice(0, RECENT_LIMIT);

  const startScan = (mode: ScanMode) => {
    resetDraft(mode);
    router.push("/scan");
  };

  const openRecord = (record: ScanRecord) => {
    showResult(record);
    router.push(isInconclusive(record.result) ? "/inconclusive" : "/result");
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + BottomTabInset + 24 },
      ]}
    >
      <View style={styles.brandRow}>
        <View style={styles.logo}>
          <Ionicons name="shield-checkmark" size={22} color="#FFFFFF" />
        </View>
        <View>
          <Text style={styles.brandName}>SANGYAN Shield</Text>
          <Text style={styles.brandTagline}>Check before you trust. Pause before you pay.</Text>
        </View>
      </View>

      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Got a suspicious investment message?</Text>
        <Text style={styles.heroText}>
          Check it for common scam warning signs in a few seconds. Free, private, and no stock tips.
        </Text>
        <AppButton
          label="Scan a screenshot"
          icon="scan-outline"
          onPress={() => startScan("image")}
          style={styles.heroPrimary}
        />
        <AppButton
          label="Paste a message"
          icon="chatbox-ellipses-outline"
          variant="secondary"
          onPress={() => startScan("text")}
        />
      </View>

      <QuickCaptureCard onOpen={() => router.push("/quick-capture")} />

      <View>
        <SectionHeader title="How it works" />
        <View style={styles.steps}>
          {HOW_IT_WORKS.map((step, index) => (
            <Card key={step.text} style={styles.step}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>{index + 1}</Text>
              </View>
              <Ionicons name={step.icon} size={24} color={Palette.brand} />
              <Text style={styles.stepText}>{step.text}</Text>
            </Card>
          ))}
        </View>
      </View>

      <View>
        <View style={styles.recentHeader}>
          <SectionHeader
            title="Recent checks"
            subtitle={recent.length ? "Tap a check to see the full result." : undefined}
          />
          {history.length > 0 && (
            <Pressable
              onPress={() => router.navigate("/history")}
              hitSlop={8}
              accessibilityRole="link"
            >
              <Text style={styles.seeAll}>See all ({history.length})</Text>
            </Pressable>
          )}
        </View>
        {recent.length ? (
          <Card style={styles.recentCard}>
            {recent.map((record, index) => (
              <View key={record.id}>
                {index > 0 && <View style={styles.divider} />}
                <HistoryRow record={record} onPress={() => openRecord(record)} />
              </View>
            ))}
          </Card>
        ) : (
          <Card style={styles.emptyCard}>
            <Ionicons name="time-outline" size={28} color={Palette.subtle} />
            <Text style={styles.emptyText}>
              No checks yet. Your results will be saved on this phone so you can open them again.
            </Text>
          </Card>
        )}
      </View>

      <View>
        <View style={styles.recentHeader}>
          <View style={styles.flex}>
            <SectionHeader title="Common scam signs" subtitle="Tap a sign to learn how it works." />
          </View>
          <Pressable onPress={() => router.navigate("/learn")} hitSlop={8} accessibilityRole="link">
            <Text style={styles.seeAll}>Learn more</Text>
          </Pressable>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.signs}
        >
          {SCAM_SIGNS.map((sign) => (
            <Pressable
              key={sign.title}
              onPress={() =>
                router.push({ pathname: "/learn/[topic]", params: { topic: sign.topic } })
              }
              accessibilityRole="link"
              style={({ pressed }) => pressed && { opacity: 0.8 }}
            >
              <Card style={styles.signCard}>
                <Ionicons name={sign.icon} size={24} color={Palette.danger} />
                <Text style={styles.signTitle}>{sign.title}</Text>
                <Text style={styles.signText}>{sign.text}</Text>
                <Text style={styles.signLink}>Learn how it works</Text>
              </Card>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <Pressable
        onPress={() => router.push("/emergency")}
        accessibilityRole="button"
        style={({ pressed }) => [styles.emergency, pressed && { opacity: 0.85 }]}
      >
        <Ionicons name="medkit-outline" size={24} color={Palette.danger} />
        <View style={styles.flex}>
          <Text style={styles.emergencyTitle}>Lost money or shared your OTP?</Text>
          <Text style={styles.emergencyText}>Get step-by-step emergency help now.</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={Palette.danger} />
      </Pressable>

      <Text style={styles.footer}>
        SANGYAN Shield gives safety information only. It never tells you to buy, sell, or hold any
        investment.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Palette.background,
  },
  content: {
    paddingHorizontal: 20,
    gap: 26,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Palette.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  brandName: {
    fontSize: 20,
    fontWeight: "800",
    color: Palette.ink,
  },
  brandTagline: {
    fontSize: 13,
    color: Palette.muted,
    marginTop: 2,
  },
  hero: {
    backgroundColor: Palette.navy,
    borderRadius: Radius.xl,
    padding: 22,
    gap: 12,
  },
  heroTitle: {
    fontSize: 24,
    lineHeight: 31,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  heroText: {
    fontSize: 15,
    lineHeight: 22,
    color: "#CBD5E1",
    marginBottom: 6,
  },
  heroPrimary: {
    marginTop: 4,
  },
  steps: {
    flexDirection: "row",
    gap: 10,
  },
  step: {
    flex: 1,
    padding: 14,
    gap: 10,
  },
  stepNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Palette.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumberText: {
    fontSize: 12,
    fontWeight: "800",
    color: Palette.brand,
  },
  stepText: {
    fontSize: 13,
    lineHeight: 18,
    color: Palette.text,
    fontWeight: "600",
  },
  recentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  seeAll: {
    fontSize: 14,
    fontWeight: "700",
    color: Palette.brand,
    paddingTop: 2,
  },
  recentCard: {
    paddingVertical: 4,
  },
  divider: {
    height: 1,
    backgroundColor: Palette.border,
  },
  emptyCard: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 24,
  },
  emptyText: {
    fontSize: 14,
    color: Palette.muted,
    textAlign: "center",
    lineHeight: 20,
  },
  signs: {
    gap: 12,
    paddingRight: 20,
    paddingBottom: 6,
  },
  signCard: {
    width: 180,
    gap: 8,
  },
  signTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: Palette.ink,
  },
  signText: {
    fontSize: 13,
    lineHeight: 19,
    color: Palette.muted,
  },
  quickCard: {
    gap: 14,
  },
  quickHeader: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  quickIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: Palette.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  quickTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: Palette.ink,
  },
  quickText: {
    fontSize: 14,
    lineHeight: 20,
    color: Palette.muted,
    marginTop: 2,
  },
  quickActions: {
    flexDirection: "row",
  },
  quickToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
  },
  quickSetup: {
    gap: 10,
    padding: 12,
    borderRadius: Radius.md,
    backgroundColor: Palette.background,
  },
  quickStep: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  quickStepNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    textAlign: "center",
    lineHeight: 22,
    fontSize: 12,
    fontWeight: "800",
    color: Palette.brand,
    backgroundColor: Palette.brandSoft,
    overflow: "hidden",
  },
  quickStepText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
    color: Palette.text,
  },
  quickNote: {
    fontSize: 13,
    lineHeight: 19,
    color: Palette.muted,
  },
  signLink: {
    fontSize: 13,
    fontWeight: "700",
    color: Palette.brand,
    marginTop: 2,
  },
  emergency: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: Palette.dangerSoft,
  },
  flex: {
    flex: 1,
  },
  emergencyTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: Palette.danger,
  },
  emergencyText: {
    fontSize: 13,
    color: Palette.text,
    marginTop: 2,
  },
  footer: {
    fontSize: 12,
    lineHeight: 18,
    color: Palette.subtle,
    textAlign: "center",
  },
});
